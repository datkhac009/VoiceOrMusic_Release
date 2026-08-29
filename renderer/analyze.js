// renderer/analyze.js — noi lam viec nang: giai ma audio + chay YAMNet.
//
// KIEU LAY VIEC (pull): renderer tu goi 'next-job' xin viec, lam xong bao 'job-done', het
// viec thi bao 'all-done'. Lam nguoc lai (main day viec sang) thi main phai biet luc nao
// renderer nap xong model — them mot nhip bat tay de sai; kieu pull thi khong can.
'use strict';

const { ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const { reduceWindow } = require('../src/classify.cjs');
const { docGiuNot } = require('../src/caodo.cjs');
const { AudioClassifier, FilesetResolver } = require('@mediapipe/tasks-audio');

const SAMPLE_RATE = 16000;   // YAMNet chi nhan 16 kHz mono — khong phai lua chon, la yeu cau

// Ghi thang ra file khi co VOM_LOG: khong phu thuoc IPC, nen dung duoc CA khi nghi ngo
// chinh IPC hoac tien trinh renderer co van de.
const LOGF = process.env.VOM_LOG || '';
const ghiFile = (m) => {
  if (!LOGF) return;
  try { require('fs').appendFileSync(LOGF, `${new Date().toISOString().slice(11, 23)} [R] ${m}
`); } catch (_) {}
};
const log = (m) => { ghiFile(m); ipcRenderer.invoke('log', m).catch(() => {}); };

/** bytes (Uint8Array qua IPC) -> Float32Array PCM 16 kHz mono, cat con `seconds` giay dau. */
async function toPcm16kMono(u8, seconds) {
  // decodeAudioData "chiem dung" (detach) ArrayBuffer dua vao, nen phai cat ban sao rieng —
  // khong thi lan tai su dung sau se nem loi buffer da detached.
  const ab = u8.slice().buffer;
  const ctx = new AudioContext();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(ab);
  } finally {
    ctx.close().catch(() => {});
  }
  if (!decoded || !decoded.duration) throw new Error('file audio rong hoac codec khong doc duoc');

  const wantSec = Math.min(decoded.duration, seconds);
  // OfflineAudioContext lam LUON 2 viec: doi tan so mau ve 16 kHz VA tron stereo -> mono
  // (dich chi co 1 kenh nen Web Audio tu down-mix theo dung chuan). Khong phai tu viet.
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(wantSec * SAMPLE_RATE)), SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0, 0, wantSec);
  const rendered = await off.startRendering();
  return { pcm: rendered.getChannelData(0), durationSec: wantSec, fullDurationSec: decoded.duration };
}

async function main() {
  const boot = await ipcRenderer.invoke('boot-info');
  let classifier;
  try {
    const fileset = await FilesetResolver.forAudioTasks(pathToFileURL(boot.wasmDir).href);
    classifier = await AudioClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(boot.modelBytes) },
      // Lay HET 521 nhan moi cua so, khong cat top-k: diem cua 'Music'/'Speech'/'Singing'
      // co the nam ngoai top-10 o nhung doan chuyen tiep, ma dung cai ta can lai la chinh no.
      scoreThreshold: 0,
    });
    log('da nap model YAMNet');
  } catch (e) {
    return ipcRenderer.invoke('fatal', `khong nap duoc model/WASM: ${e && e.message || e}`);
  }

  // ── NHAN VIEC BANG SU KIEN, KHONG HOI VONG ──────────────────────────────────────
  // ⚠ Ban dau cho nay tu hoi xin viec, khong co thi ngu 120ms roi hoi lai. Chay dong lenh
  // thi ngon, nhung MO GIAO DIEN LA HONG: cua so giao dien duoc focus nen cua so phan tich
  // (an) bi Chromium coi la bi che va BOP CO HEN GIO — 120ms gian thanh hang phut. Hau qua:
  // link dau tien chay duoc (vong lap con dang chay tu luc nap trang), tu link thu HAI tro
  // di deu bao "qua 90 giay khong phan tich xong". Chay CLI khong tai hien duoc vi khong co
  // cua so nao hien ca — dung kieu bug chi lo ra o ban dong goi.
  // Tin nhan IPC thi den duoc ca trang dang bi bop, nen doi sang cho main DAY viec sang.
  ipcRenderer.on('job', async (_e, job) => {
    const t0 = performance.now();
    log(`${job.key}: NHAN viec (${job.bytes.length} byte)`);
    try {
      const { pcm, durationSec, fullDurationSec } = await toPcm16kMono(job.bytes, job.seconds);
      log(`${job.key}: giai ma xong ${durationSec.toFixed(1)}s`);
      const raw = classifier.classify(pcm, SAMPLE_RATE);
      log(`${job.key}: model chay xong, ${raw.length} cua so tho`);
      const windows = [];
      let labels = null;
      // --do-nhan=<bieu thuc>: gom diem tung nhan khop, tung cua so, de do dac.
      const reDo = job.doNhan ? new RegExp(job.doNhan, 'i') : null;
      const nhanDo = reDo ? {} : null;
      for (const r of raw) {
        const cats = (r.classifications && r.classifications[0] && r.classifications[0].categories) || [];
        if (job.dumpLabels && !labels && cats.length) {
          labels = cats.map(c => c.categoryName || c.displayName || '');
        }
        if (reDo) {
          for (const c of cats) {
            const n = c.categoryName || c.displayName || '';
            if (!reDo.test(n)) continue;
            (nhanDo[n] || (nhanDo[n] = [])).push(typeof c.score === 'number' ? c.score : 0);
          }
        }
        // Gop ngay tai day (KHONG gui 521 diem × N cua so qua IPC — nang vo ich).
        // reduceWindow den tu chinh module classify.cjs ma main dung, nen luat gop la MOT.
        windows.push(reduceWindow(cats));
      }
      // CAO DO: do rieng, KHONG qua model. Dung de tach HAT khoi NOI — YAMNet do that la
      // khong nghe ra (cham 'Speech' 0,63-0,95 tren chinh nhung sound nguoi dung bao la hat).
      // Xem ghi chu day du o src/caodo.cjs.
      const tCaoDo = performance.now();
      const caoDo = docGiuNot(pcm, SAMPLE_RATE);
      log(`${job.key}: cao do — giu not ${(caoDo.tiLeGiuNot * 100).toFixed(0)}%, `
        + `${caoDo.soNot} not, dai nhat ${caoDo.notDaiNhatMs}ms (${Math.round(performance.now() - tCaoDo)}ms)`);

      log(`${job.key}: ${windows.length} cua so / ${durationSec.toFixed(1)}s trong ${Math.round(performance.now() - t0)}ms`);
      await ipcRenderer.invoke('job-done', { key: job.key, windows, labels, nhanDo, caoDo, durationSec, fullDurationSec });
    } catch (e) {
      await ipcRenderer.invoke('job-done', { key: job.key, error: String(e && e.message || e), windows: [] });
    }
  });

  // Bao main la da nap xong model — main cho tin nay roi moi day viec dau tien sang.
  await ipcRenderer.invoke('analyzer-ready');
}

main().catch(e => ipcRenderer.invoke('fatal', String(e && e.stack || e)));
