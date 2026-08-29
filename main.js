// main.js — CLI chay tren Electron. Nghe ten thi la ung dung do hoa, nhung o day Electron
// duoc dung nhu MOT BO MAY TINH TOAN, khong hien cua so nao.
//
// VI SAO PHAI LA ELECTRON (chu khong phai node thuan):
//   1) GIAI MA MP3/M4A. Node khong tu giai ma duoc audio — binh thuong phai keo ffmpeg ~80MB
//      vao kem. Electron mang san Chromium, ma Chromium co decodeAudioData() giai ma mp3/aac
//      + doi tan so mau ve 16 kHz mono BANG C++ san co. Khong them 1 byte phu thuoc nao.
//   2) CHAY MODEL. @mediapipe/tasks-audio la WASM cho trinh duyet, can moi truong trinh duyet.
//   3) TAI TRANG TIKTOK. net.request dung dung tang mang cua Chromium (TLS/HTTP2 giong trinh
//      duyet that) nen it bi chan hon node https; va con hidden window de du phong khi bi chan.
//
// Luong chay: argv -> link file audio -> tai bytes -> renderer giai ma + chay YAMNet ->
//             classify.cjs gop ra 4 nhan -> in ket qua -> thoat.
'use strict';

const { app, BrowserWindow, ipcMain, net, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  parseInput, extractSoundMeta, extractAuthorInfos,
  extractHashtags, extractBio, extractCaption, nhanDangPhim, extractAnhKhungHinh,
  embedMusicUrl, embedVideoUrl, extractVideoIds, extractMusicInfos,
} = require('./src/soundlink.cjs');
const { aggregate, quyetDinhCuoi, chamHaiLuot, dacTrung, timCaDaSua } = require('./src/classify.cjs');
const { parseArgv, userArgv } = require('./src/cli-args.cjs');
const { kiemTraCapNhat, taiVaCapNhat, REPO_MAC_DINH } = require('./src/updater.cjs');

// Ghi nhat ky DONG BO ra file khi dat bien moi truong VOM_LOG.
// Can den muc nay vi app.exit() la thoat CUNG: no khong xa bo dem, nen console.error co the
// bay sach neu tien trinh chet — dung luc do thi khong con gi de doc. appendFileSync thi da
// nam tren dia truoc khi dong lenh ke tiep chay.
const LOGF = process.env.VOM_LOG || '';
function dbg(msg) {
  if (!LOGF) return;
  try { fs.appendFileSync(LOGF, `${new Date().toISOString().slice(11, 23)} ${msg}\n`); } catch (_) {}
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/126.0.0.0 Safari/537.36';
const MODEL_PATH = path.join(__dirname, 'models', 'yamnet.tflite');
// ⚠ Khi da dong goi, __dirname nam TRONG app.asar. File .wasm duoc Chromium nap qua URL
// file:// — ma file:// KHONG doc duoc vao trong asar (khac voi fs cua Node, von duoc va de
// doc xuyen asar). Nen phai khai bao asarUnpack cho @mediapipe trong package.json va tro
// duong dan sang thu muc da giai nen. Chay o che do phat trien thi khong co 'app.asar'
// trong duong dan nen phep thay the nay khong doi gi.
const WASM_DIR = path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-audio', 'wasm')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
// Model thi doc bang fs.readFileSync roi truyen thang mang byte cho MediaPipe, nen no doc
// duoc ngay trong asar — khong can giai nen.
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

// Phien ban doc THANG tu package.json — mot nguon duy nhat, khong chep tay ra nhieu cho roi
// quen sua. Hien o KHAP NOI nguoi dung nhin thay (thanh tieu de, goc giao dien, dau bao cao,
// trang kiem chung) de luon biet ban .exe dang cam la ban nao.
//
// ⚠ KHONG dung app.getVersion(): run.cjs goi `electron main.js`, tuc duong dan app la mot
// FILE chu khong phai thu muc, nen Electron khong doc package.json va app.getVersion() tra
// ve PHIEN BAN CUA ELECTRON. Do that: in ra "v28.3.3" thay vi "v0.2.0". Ban dong goi thi
// dung, ban chua dong goi thi sai — dung kieu lech chi lo ra o mot che do.
const PHIEN_BAN = () => `v${require('./package.json').version}`;

// ⚠ CHOT CUNG TEN APP — quyet dinh cho dat thu muc du lieu (`app.getPath('userData')`), noi
// giu quyet dinh thu cong va audio kiem chung.
// Khong chot thi co BA thu muc khac nhau tuy cach chay (do that 2026-08-14):
//     run.cjs goi `electron main.js`  -> %APPDATA%\Electron\        (khong doc package.json)
//     `electron <thu muc app>`        -> %APPDATA%\voice-or-music\
//     ban da dong goi                 -> %APPDATA%\VoiceOrMusic\    (theo productName)
// Hau qua: bam Lay/Loai trong giao dien roi chay dong lenh thi KHONG thay quyet dinh do dau
// ca — va nang hon, dong goi xong la toan bo quyet dinh cu "bien mat" vi doi thu muc.
// Dat truoc khi app san sang thi moi kip.
app.setName('VoiceOrMusic');

// ════════════════════════ mang ════════════════════════
/** GET qua tang mang Chromium. Tra ve { status, body:Buffer, finalUrl }. */
function httpGet(url, { headers = {}, maxBytes = MAX_AUDIO_BYTES, timeoutMs = 25000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let req;
    try {
      req = net.request({ method: 'GET', url, redirect: 'follow' });
    } catch (e) { return finish({ status: 0, body: Buffer.alloc(0), finalUrl: url, error: e.message }); }

    const timer = setTimeout(() => { try { req.abort(); } catch (_) {} finish({ status: 0, body: Buffer.alloc(0), finalUrl: url, error: `qua ${timeoutMs}ms` }); }, timeoutMs);

    req.setHeader('User-Agent', UA);
    req.setHeader('Accept-Language', 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7');
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);

    let finalUrl = url;
    req.on('redirect', (_s, _m, redirectUrl) => { finalUrl = redirectUrl; req.followRedirect(); });
    req.on('response', (res) => {
      const chunks = []; let len = 0;
      res.on('data', (c) => {
        if (len >= maxBytes) return;
        chunks.push(c); len += c.length;
        // Cat o tran: sound 30-60s chi ~1MB, vuot 6MB la co gi la (hoac dai vo ich) —
        // 30 giay dau da du de phan loai nen khong can tai het.
        if (len >= maxBytes) { try { res.destroy?.(); } catch (_) {} }
      });
      res.on('end', () => { clearTimeout(timer); finish({ status: res.statusCode, body: Buffer.concat(chunks), finalUrl, headers: res.headers }); });
      res.on('error', (e) => { clearTimeout(timer); finish({ status: res.statusCode || 0, body: Buffer.concat(chunks), finalUrl, error: String(e) }); });
    });
    req.on('error', (e) => { clearTimeout(timer); finish({ status: 0, body: Buffer.alloc(0), finalUrl, error: String(e) }); });
    req.end();
  });
}

/** Du phong khi net.request bi chan: mo cua so an THAT, de Chromium chay JS cua TikTok roi
 *  doc khoi du lieu trong trang. Cham hon nhieu (~5-15s) nen chi dung khi buoc tren that bai. */
async function fetchPageViaWindow(url, verbose) {
  // ⚠ KHONG dung `offscreen: true`. Da do duoc su co that (2026-08-13): mo cua so offscreen
  // -> huy -> mo cua so offscreen THU HAI (cua so phan tich) thi tien trinh SAP CUNG, exit
  // 127, mat sach ca output dang nam trong bo dem. Mot link thi khong sao, hai link moi lo.
  // `show: false` da du: trang van tai va van chay JS. Che do offscreen chi can khi muon LAY
  // KHUNG HINH da ve — o day khong bao gio ve gi, nen bat len chi rước rủi ro (nhat la khi
  // da goi disableHardwareAcceleration nen phai dung compositing bang phan mem).
  const win = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { backgroundThrottling: false, javascript: true },
  });
  try {
    win.webContents.setUserAgent(UA);
    await win.loadURL(url, { userAgent: UA });
    // Trang TikTok nhung du lieu vao <script id=__UNIVERSAL_DATA_FOR_REHYDRATION__> ngay khi
    // render. Doi thanh 3 nhip ngan thay vi 1 nhip dai: hau het lan lay duoc o nhip dau.
    for (const wait of [400, 1500, 3000]) {
      await new Promise(r => setTimeout(r, wait));
      const html = await win.webContents.executeJavaScript(
        `(() => { const s = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__')
            || document.getElementById('SIGI_STATE');
          if (s) return s.outerHTML;
          const a = document.querySelector('audio,video');
          return a && a.src ? '{"playUrl":"' + a.src + '"}' : document.documentElement.outerHTML.slice(0, 400000); })()`
      ).catch(() => '');
      const meta = extractSoundMeta(html);
      if (meta.playUrl) return meta;
      if (verbose) console.error(`   [window] chua thay playUrl sau ${wait}ms`);
    }
    return { playUrl: '', title: '', duration: 0, authorName: '', original: null };
  } finally {
    dbg('dong cua so doc trang');
    try { win.destroy(); } catch (_) {}
  }
}

/**
 * Gom cac dau hieu "voice phim / hoat hinh" tu chinh trang video da tai — KHONG ton them
 * request nao.
 *
 * ⚠ CHI CAN VIDEO DAU TIEN. Do that 2026-08-14: voi original sound, video dau trong danh sach
 * cua trang /embed/music/ chinh la video CUA CHU SOUND, va no mang du dau hieu (#anime, bio
 * "Cortos de Anime..."). Cac video sau la nguoi khac dung ke sound, khong mang dau hieu gi —
 * nen tai them chi ton thoi gian ma khong them thong tin.
 */
function dauHieuPhim(html, laChuSound) {
  const hashtags = extractHashtags(html);
  const bio = extractBio(html);
  const caption = extractCaption(html);
  const tacGia = extractAuthorInfos(html);
  return { tacGia, hashtags, bio, caption,
    ...nhanDangPhim({ hashtags, bios: [bio], caption, tacGia, laChuSound }) };
}

/**
 * DUONG CHINH de lay link file nhac: qua trang EMBED — chay duoc MA KHONG CAN DANG NHAP.
 *
 * Do thuc te 2026-08-13 (xem ghi chu trong soundlink.cjs): trang /music/<id> khong con
 * nhung du lieu sound, no goi /api/music/detail/ bang JS va API do tra ve 0 byte cho khach
 * vang lai. Trang embed thi khong bi vay.
 *
 * ⚠ PHAI DOI CHIEU musicId. Ta lay playUrl tu trang cua MOT VIDEO, nen bat buoc kiem tra
 * video do dung dung sound duoc hoi — khong thi co the di phan tich nham bai khac ma van
 * bao "xong" (loi im lang, kieu nguy hiem nhat).
 * @returns {{playUrl:string, meta:object, via:string}|null}
 */
async function resolveViaEmbed(p, opt) {
  const get = (u) => httpGet(u, {
    maxBytes: 2 * 1024 * 1024,
    headers: { Accept: 'text/html,application/xhtml+xml', Referer: 'https://www.tiktok.com/' },
  });

  if (p.kind === 'video') {
    const r = await get(embedVideoUrl(p.id));
    if (opt.verbose) console.error(`   [embed] video ${p.id} -> ${r.status} (${r.body.length} byte)`);
    const html = r.body.toString('utf8');
    const mi = extractMusicInfos(html);
    // videoId + tac gia de mini browser co cai ma mo va co cai ma hien.
    return mi.playUrl
      ? { playUrl: mi.playUrl,
          meta: { ...mi, videoId: p.id,
                  ...dauHieuPhim(html, extractAuthorInfos(html).nickName === mi.authorName) },
          via: 'embed-video' }
      : null;
  }

  const r = await get(embedMusicUrl(p.id));
  const htmlNhac = r.body.toString('utf8');
  const vids = extractVideoIds(htmlNhac);
  // Khung hinh video de tra nguoc bang Google Lens — lay tu chinh trang nay, khong ton
  // them request. Uu tien hon anh trong musicInfos vi cai do thuong la avatar.
  const anhKhung = extractAnhKhungHinh(htmlNhac);
  if (opt.verbose) console.error(`   [embed] music ${p.id} -> ${r.status}, thay ${vids.length} video`);
  if (!vids.length) return null;

  // Thu toi da 3 video: video dau co the da bi xoa/rieng tu, khong nen bo cuoc ngay.
  for (const vid of vids.slice(0, 3)) {
    const rv = await get(embedVideoUrl(vid));
    const htmlV = rv.body.toString('utf8');
    const mi = extractMusicInfos(htmlV);
    if (!mi.playUrl) { if (opt.verbose) console.error(`   [embed] video ${vid}: khong co musicInfos`); continue; }
    if (mi.musicId && p.id && mi.musicId !== p.id) {
      if (opt.verbose) console.error(`   [embed] video ${vid} dung sound KHAC (${mi.musicId}) -> bo qua`);
      continue;
    }
    if (opt.verbose) console.error(`   [embed] lay duoc playUrl tu video ${vid}`);
    const tacGia = extractAuthorInfos(htmlV);
    // Chu sound = tac gia video khi day la "original sound" cua chinh nguoi do (nickName
    // trung authorName cua sound). Voi nhac catalog thi khong trung — do dung nhu vay.
    const laChuSound = !!tacGia.nickName && tacGia.nickName === mi.authorName;
    const dh = dauHieuPhim(htmlV, laChuSound);
    return {
      playUrl: mi.playUrl,
      meta: { ...mi, videoId: vid, videoIds: vids.slice(0, 6), laChuSound, ...dh,
              anhBia: anhKhung || mi.anhBia || '' },
      via: 'embed',
    };
  }
  return null;
}

/**
 * Tu 1 dong nguoi dung dan -> ra bytes audio.
 * @returns {{ok:boolean, bytes?:Buffer, meta:object, error?:string, via?:string}}
 */
async function resolveToAudio(rawInput, opt) {
  const p = parseInput(rawInput);
  const out = { input: rawInput, kind: p.kind, id: p.id || '', soundUrl: p.url || '', meta: {} };

  if (p.kind === 'invalid') return { ...out, ok: false, error: `khong doc duoc dau vao (${p.reason})` };

  // File tren may — khong can mang.
  if (p.kind === 'file') {
    const fp = p.url.startsWith('file://') ? decodeURIComponent(new URL(p.url).pathname).replace(/^\//, '') : p.url;
    try { return { ...out, ok: true, bytes: fs.readFileSync(fp), via: 'file', meta: { title: path.basename(fp) } }; }
    catch (e) { return { ...out, ok: false, error: `khong doc duoc file: ${e.message}` }; }
  }

  // Link rut gon: theo redirect roi doc lai.
  if (p.kind === 'short') {
    const r = await httpGet(p.url, { maxBytes: 1024 * 512 });
    const again = parseInput(r.finalUrl || '');
    if (again.kind === 'invalid') return { ...out, ok: false, error: `link rut gon dan tro ${r.finalUrl || 'khong dau'}` };
    return resolveToAudio(again.url, opt);
  }

  let playUrl = '', meta = {};
  if (p.kind === 'audio') {
    playUrl = p.url;
    out.via = 'link-audio-truc-tiep';
  } else {
    // Ba lop, xep theo thu tu RE NHAT TRUOC. Lop sau chi chay khi lop truoc that bai, nen
    // duong binh thuong chi ton 2 request HTML nho.
    // Lop 1 — EMBED: khong can dang nhap, la duong DUY NHAT do duoc la chay on hom nay.
    const emb = await resolveViaEmbed(p, opt);
    if (emb) { playUrl = emb.playUrl; meta = emb.meta; out.via = emb.via; }

    // Lop 2 — trang /music/ truc tiep. Hom nay trang nay khong con nhung du lieu sound,
    // nhung giu lai vi no TUNG co va co the co lai; ton dung 1 request.
    if (!playUrl) {
      const r = await httpGet(p.url, {
        maxBytes: 3 * 1024 * 1024,
        headers: { Accept: 'text/html,application/xhtml+xml', Referer: 'https://www.tiktok.com/' },
      });
      if (opt.verbose) console.error(`   [http] ${p.url} -> ${r.status} (${r.body.length} byte)`);
      const m1 = extractSoundMeta(r.body.toString('utf8'));
      if (m1.playUrl) { meta = m1; playUrl = m1.playUrl; out.via = 'http'; }
    }

    // Lop 3 — cua so an: de Chromium chay JS cua TikTok. Cham nhat (~5-15s) nen de cuoi.
    if (!playUrl) {
      if (opt.verbose) console.error('   [http] khong thay playUrl -> thu mo cua so an');
      const m2 = await fetchPageViaWindow(p.url, opt.verbose);
      if (m2.playUrl) { meta = m2; playUrl = m2.playUrl; out.via = 'hidden-window'; }
    }

    if (!playUrl) {
      return { ...out, ok: false, meta,
        error: 'khong lay duoc link file nhac (sound da xoa, chua co video nao dung, hoac TikTok dang chan)' };
    }
  }
  out.meta = meta;

  // Tai file nhac: tran RONG hon va co THU LAI MOT LAN.
  // Do that (2026-08-13): CDN nhac cua TikTok thi thoang cham qua 25 giay — mot lan cham la
  // ca sound do bao loi, trong khi thu lai thi duoc ngay. File chi ~1MB nen thu lai re.
  // Chi thu THEM MOT lan: hong hai lan lien thi nhieu kha nang la hong that, khong phai cham.
  let a = null;
  for (let lan = 1; lan <= 2; lan++) {
    a = await httpGet(playUrl, {
      headers: { Referer: 'https://www.tiktok.com/', Accept: '*/*' },
      timeoutMs: 60000,
    });
    if (a.status >= 200 && a.status < 300 && a.body.length) break;
    if (lan === 1 && opt.verbose) console.error(`   [audio] lan 1 hong (HTTP ${a.status}${a.error ? ' — ' + a.error : ''}) -> thu lai`);
  }
  if (a.status < 200 || a.status >= 300 || !a.body.length) {
    return { ...out, ok: false, error: `tai file nhac loi: HTTP ${a.status}${a.error ? ' — ' + a.error : ''}` };
  }
  if (opt.verbose) console.error(`   [audio] ${a.body.length} byte tu ${playUrl.slice(0, 90)}...`);
  return { ...out, ok: true, bytes: a.body, playUrl };
}

// ════════════════════════ cau noi voi renderer phan tich ════════════════════════
// Renderer TU LAY VIEC (pull) chu khong nam cho main day sang: nhu vay main khong can biet
// renderer da khoi tao model xong chua — cu co viec la no den lay.
//
// Vong lay viec KHONG dong lai khi het viec, ma cho tiep (tra ve null -> renderer ngu 120ms
// roi hoi lai). Nho vay MOT cua so phan tich phuc vu duoc ca me link ma van tra ket qua
// TUNG CAI MOT — giao dien hien duoc ket qua ngay khi xong tung link thay vi doi het me.
const pending = new Map();    // key -> resolve() cua analyzeOne
let rendererFatal = null;
let baoSanSang = null;        // resolve khi renderer nap xong model

function registerIpc(opt) {
  ipcMain.handle('boot-info', () => ({
    modelBytes: fs.readFileSync(MODEL_PATH),
    wasmDir: WASM_DIR,
  }));
  ipcMain.handle('analyzer-ready', () => { dbg('renderer bao san sang'); if (baoSanSang) baoSanSang(); return true; });
  ipcMain.handle('job-done', (_e, r) => {
    dbg(`job-done ${r.key} err=${r.error || 'khong'}`);
    const done = pending.get(r.key);
    if (done) { pending.delete(r.key); done(r); }
    return true;
  });
  ipcMain.handle('fatal', (_e, msg) => {
    dbg(`fatal: ${msg}`);
    rendererFatal = msg;
    // Model hong thi moi viec dang cho deu khong bao gio xong — tra loi ngay thay vi treo.
    for (const [k, done] of pending) done({ key: k, error: msg, windows: [] });
    pending.clear();
    return true;
  });
  ipcMain.handle('log', (_e, msg) => { dbg(`[renderer] ${msg}`); if (opt.verbose) console.error(`   [renderer] ${msg}`); return true; });
}

function createAnalyzerWindow(opt) {
  // webSecurity: false — can thiet de trang file:// nap duoc .wasm/.js tu thu muc
  // node_modules (Chromium mac dinh coi moi file:// la mot origin rieng). Cua so nay CHI
  // nap file cuc bo cua chinh app, khong bao gio nap noi dung tu internet, nen khong tao
  // ra be mat tan cong nao. Trang TikTok duoc nap o cua so KHAC (fetchPageViaWindow) va
  // cua so do van bat day du bao mat + khong co node.
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true, contextIsolation: false, webSecurity: false,
      backgroundThrottling: false,   // xem ghi chu ve viec bi bop co o duoi
    },
  });
  win.webContents.setBackgroundThrottling(false);

  // Cua so phan tich chet giua chung thi moi viec dang cho se treo den het gio 90 giay roi
  // bao "qua 90 giay khong phan tich xong" — mot thong bao KHONG noi len dieu gi. Bat su
  // kien nay de tra loi that: chet vi ly do gi.
  win.webContents.on('render-process-gone', (_e, d) => {
    const msg = `cua so phan tich chet (${d.reason}, ma ${d.exitCode})`;
    dbg(msg);
    rendererFatal = msg;
    for (const [k, done] of pending) done({ key: k, error: msg, windows: [] });
    pending.clear();
  });
  win.webContents.on('did-fail-load', (_e, ma, mota) => dbg(`cua so phan tich nap hong: ${ma} ${mota}`));

  if (opt && opt.verbose) {
    win.webContents.on('console-message', (_e, _l, m) => console.error(`   [console] ${m}`));
  }
  const sanSang = new Promise((ok) => { baoSanSang = ok; });
  win.loadFile(path.join(__dirname, 'renderer', 'analyze.html'));
  return { win, sanSang };
}

/**
 * Day 1 file audio sang renderer, cho ket qua.
 *
 * ⚠ DAY VIEC bang su kien, KHONG de renderer hoi vong.
 * Ban dau renderer tu hoi xin viec, khong co thi ngu 120ms roi hoi lai. Chay dong lenh thi
 * ngon, nhung MO GIAO DIEN LA HONG: cua so giao dien dang duoc focus nen cua so phan tich
 * (an) bi Chromium coi la bi che va BOP CO HEN GIO — 120ms gian thanh hang phut. Ket qua:
 * link dau tien chay duoc (vong lap con dang chay tu luc nap trang), tu link thu HAI tro di
 * deu bao "qua 90 giay khong phan tich xong". Chay CLI thi khong tai hien duoc vi khong co
 * cua so nao hien ca.
 * Day viec bang IPC thi khong dinh gi den hen gio: tin nhan van den duoc trang dang bi bop.
 */
function analyzeOne(win, key, bytes, opt) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; pending.delete(key); resolve(v); } };
    pending.set(key, finish);
    if (rendererFatal) return finish({ key, error: rendererFatal, windows: [] });
    win.webContents.send('job', { key, bytes, seconds: opt.seconds, dumpLabels: opt.dumpLabels, doNhan: opt.doNhan });
    setTimeout(() => finish({ key, error: 'qua 90 giay khong phan tich xong', windows: [] }), 90000);
  });
}

// ════════════════════════ DIEU PHOI DUNG CHUNG cho CLI va giao dien ════════════════════════
// MOT ban duy nhat. Neu tach lam 2 ban (mot cho CLI, mot cho giao dien) thi chung SE lech
// nhau — bai hoc da ghi trong DECISIONS.md cua crawler ben canh, va da xay ra that o do voi
// 4 ban sao cua vong quet feed.
/**
 * @param {string[]} links
 * @param {object} opt
 * @param {{onProgress?:Function, onRow?:Function, shouldStop?:Function}} hooks
 */
async function runBatch(links, opt, hooks = {}) {
  const rows = [];
  rendererFatal = null;
  const khoTay = docQuyetDinhTay();   // quyet dinh cu cua nguoi dung, ap lai ngay tu dau
  const khoHoc = docKhoHoc();         // nhung lan nguoi dung sua NGUOC y may — de canh bao lai
  // Don audio cua lan chay truoc: bo kiem chung phai ung voi ket qua DANG hien tren bang,
  // khong thi nghe nham file cu ma tuong may cham sai.
  if (opt.luuAudio) {
    const d = thuMucKiemChung();
    for (const f of fs.readdirSync(d)) { try { fs.unlinkSync(path.join(d, f)); } catch (_) {} }
  }
  const { win, sanSang } = createAnalyzerWindow(opt);
  try {
    await sanSang;   // cho renderer nap xong model roi moi day viec dau tien

    for (let i = 0; i < links.length; i++) {
      if (hooks.shouldStop && hooks.shouldStop()) { dbg('nguoi dung bam Dung'); break; }
      const link = links[i];

      hooks.onProgress?.({ i, total: links.length, phase: 'fetch', link });
      dbg(`resolve BAT DAU ${i + 1}/${links.length}: ${link.slice(0, 70)}`);
      const r = await resolveToAudio(link, opt);
      dbg(`resolve XONG ${i + 1}: ok=${r.ok} bytes=${r.bytes ? r.bytes.length : 0} err=${r.error || ''}`);

      const base = {
        input: r.input, kind: r.kind, id: r.id, soundUrl: r.soundUrl,
        playUrl: r.playUrl || '', via: r.via || '', meta: r.meta || {},
      };
      let row;
      if (!r.ok) {
        row = { ...base, ok: false, error: r.error };
      } else {
        if (opt.luuAudio) {
          try {
            const ten = `${String(i + 1).padStart(3, '0')}-${(r.id || 'file')}.${doanDuoiFile(r.bytes)}`;
            fs.writeFileSync(path.join(thuMucKiemChung(), ten), r.bytes);
            base.tepAudio = ten;
          } catch (e) { dbg(`khong luu duoc audio ${i + 1}: ${e.message}`); }
        }
        hooks.onProgress?.({ i, total: links.length, phase: 'analyze', link });
        const res = await analyzeOne(win, 'k' + i, r.bytes, opt);
        if (res.error) {
          row = { ...base, ok: false, error: `giai ma/phan tich loi: ${res.error}` };
        } else {
          if (res.labels) base.allLabels = res.labels;       // --dump-labels
          if (opt.dumpWindows) base.windows = res.windows;   // --dump-windows
          if (opt.doNhan && res.nhanDo) base.nhanDo = res.nhanDo;   // --do-nhan=
          // Gop diem thanh nhan o MAIN (khong o renderer) de luat quyet dinh nam trong
          // module thuan classify.cjs — test duoc bang node, khong can Electron.
          const agg = aggregate(res.windows);
          // "Phan tich 2 lan": cham rieng nua dau / nua sau roi doi chieu. Khong ton them
          // lan tai nao va cung khong chay lai model — chi gop lai theo hai tap con.
          agg.haiLuot = chamHaiLuot(res.windows);
          const tay = khoTay[khoaQD(base)];
          const caDaSua = timCaDaSua(agg, khoHoc);
          row = { ...base, ok: true, durationSec: res.durationSec, ...agg,
                  ...quyetDinhCuoi(agg, { ...base.meta, caDaSua },
                                   { ...opt, nguoiDung: tay && tay.tinhTrang }) };
        }
      }
      rows.push(row);
      hooks.onRow?.(row, i);
    }
  } finally {
    try { win.destroy(); } catch (_) {}
  }
  return rows;
}

// ════════════════════════ QUYET DINH THU CONG (nho theo link) ════════════════════════
// Co nhung thu may khong doan duoc: sound do la phong van hay khong, co phai trich doan phim
// hay khong. Nguoi dung xem trong mini browser roi tu bam Lay/Loai — va quyet dinh do phai
// duoc NHO LAI, khong thi lan sau quet lai cung danh sach la phai ngoi xem lai tu dau.
//
// Khoa la LINK SOUND DA RUT GON (`/music/original-sound-<id>`) chu khong phai chuoi nguoi
// dung dan: cung mot sound co the duoc dan bang link dai, link ngan, hay id tro — dung khoa
// chuan hoa thi ba kieu do van tra ve DUNG mot quyet dinh.
// ════════════════════════ KHO HOC (nho nhung lan may cham SAI) ════════════════════════
// Moi lan nguoi dung bam NGUOC y may, ta luu "van tay so lieu" cua sound do. Sound moi nao
// co van tay gan giong se duoc bao truoc — de khong lap lai dung cai sai cu.
//
// ⚠ CHI GHI CHU, khong tu dong lat ket qua: kho nay chi co vai chuc mau, lat tu dong la
// bien mot lan bam tay thanh mot luat ngam khong ai kiem soat duoc.
const FILE_HOC = () => path.join(app.getPath('userData'), 'kho-hoc.json');

function docKhoHoc() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE_HOC(), 'utf8'));
    return Array.isArray(d) ? d : [];
  } catch (_) { return []; }
}

/** Ghi mot lan sua tay vao kho hoc. Tra ve kho moi. */
function ghiKhoHoc(ban) {
  const kho = docKhoHoc().filter(x => x && x.khoa !== ban.khoa);   // moi link chi giu ban moi nhat
  kho.push(ban);
  try {
    fs.mkdirSync(path.dirname(FILE_HOC()), { recursive: true });
    fs.writeFileSync(FILE_HOC(), JSON.stringify(kho, null, 1), 'utf8');
  } catch (e) { dbg(`khong ghi duoc kho hoc: ${e.message}`); }
  return kho;
}

const FILE_QD = () => path.join(app.getPath('userData'), 'quyet-dinh-tay.json');

function docQuyetDinhTay() {
  try { return JSON.parse(fs.readFileSync(FILE_QD(), 'utf8')) || {}; } catch (_) { return {}; }
}

// Khong con nut bam nao goi ham nay (nguoi dung bo 3 nut Lay/Loai khoi mini browser), nhung
// GIU LAI vi phan DOC van chay: ai muon ep cung ket qua cho vai link thi sua thang file
// quyet-dinh-tay.json la duoc, app se ap dung. De ham ghi o day cho co ca cap doc/ghi.
function ghiQuyetDinhTay(khoa, tinhTrang) {
  const kho = docQuyetDinhTay();
  if (tinhTrang === null || tinhTrang === undefined) delete kho[khoa];
  else kho[khoa] = { tinhTrang: tinhTrang ? 1 : 0, luc: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(FILE_QD()), { recursive: true });
    fs.writeFileSync(FILE_QD(), JSON.stringify(kho, null, 1), 'utf8');
  } catch (e) { dbg(`khong ghi duoc quyet dinh tay: ${e.message}`); }
  return kho;
}

/** Khoa cua mot dong trong kho quyet dinh thu cong. */
const khoaQD = (r) => String((r && (r.soundUrl || r.input)) || '');

// ════════════════════════ BO KIEM CHUNG (nghe lai bang tai nguoi) ════════════════════════
// Model do bang so, tai nguoi nghe bang tai — hai cai phai doi chieu duoc voi nhau thi moi
// biet nguong dat dung chua. Nen sau khi chay, app giu lai chinh doan audio da phan tich va
// dung mot trang HTML co nut Play cho tung dong: nghe -> danh dau Dung/Sai -> bam copy ra
// mot ban tom tat. Khong co buoc nay thi viec "chinh nguong" chi la doan mo.

/** Doan duoi file tu vai byte dau — TikTok khong dat duoi file trong URL. */
function doanDuoiFile(b) {
  if (!b || b.length < 12) return 'bin';
  const s4 = b.slice(0, 4).toString('latin1');
  if (b.slice(4, 8).toString('latin1') === 'ftyp') return 'm4a';   // ca mp4 lan m4a
  if (s4 === 'OggS') return 'ogg';
  if (s4 === 'RIFF') return 'wav';
  if (s4.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (s4 === 'fLaC') return 'flac';
  return 'bin';
}

function thuMucKiemChung() {
  const d = path.join(app.getPath('userData'), 'kiem-chung');
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
}

const chuThoat = (t) => String(t == null ? '' : t)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Dung trang HTML nghe duoc. Tu chua, mo bang trinh duyet nao cung chay. */
function trangKiemChung(rows) {
  const dong = rows.map((r, i) => {
    const s = r.stats || {};
    const p = (x) => Math.round((x || 0) * 100) + '%';
    const am = r.tepAudio
      ? `<audio controls preload="none" src="audio/${chuThoat(r.tepAudio)}"></audio>`
      : '<span class="mo">(khong luu duoc audio)</span>';
    return `<tr>
      <td>${i + 1}</td>
      <td class="${r.lay ? 'lay' : 'loai'}">${r.lay ? '✅ 1' : '❌ 0'}</td>
      <td>${chuThoat(r.labelVi || (r.ok ? '' : 'LỖI'))}${r.banQuyen ? '<br><span class="bq">bản quyền</span>' : ''}${
        !r.chacChan && (r.ghiChu || []).length
          ? '<div class="kiem">⚠ cần kiểm tay<br>' + r.ghiChu.map(x => '· ' + chuThoat(x)).join('<br>') + '</div>' : ''}</td>
      <td class="so">${r.ok ? p(s.speechFrac) + ' · ' + p(s.singFrac) + ' · ' + p(s.musicFrac) : chuThoat(r.error || '')}</td>
      <td>${am}</td>
      <td><div>${chuThoat(r.meta?.title || '')}</div>
          <div class="lnk">${chuThoat(r.soundUrl || r.input)}</div></td>
      <td class="cham">
        <label><input type="radio" name="d${i}" value="dung"> Đúng</label>
        <label><input type="radio" name="d${i}" value="sai"> Sai</label>
        <input type="text" id="y${i}" placeholder="đúng ra phải là...">
      </td></tr>`;
  }).join('\n');

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>VoiceOrMusic — bộ kiểm chứng</title><style>
body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;background:#12141a;color:#e6e8ee;margin:0;padding:20px}
h1{font-size:17px;margin:0 0 4px}.mo{color:#9aa1b4}
table{width:100%;border-collapse:collapse;margin-top:14px}
th{text-align:left;padding:8px;border-bottom:1px solid #2c3140;color:#9aa1b4;font-size:12px}
td{padding:9px 8px;border-bottom:1px solid #2c3140;vertical-align:top}
.lay{color:#34d17f;font-weight:700}.loai{color:#ff6b6b;font-weight:700}
.so{color:#9aa1b4;font-family:Consolas,monospace;font-size:12px}
.lnk{color:#6ea8ff;font-size:11px;font-family:Consolas,monospace;word-break:break-all}
.bq{color:#ffa94d;font-size:11px}
.kiem{margin-top:4px;color:#fab219;font-size:10.5px;line-height:1.4;border:1px solid #5a4a1a;border-radius:5px;padding:3px 6px}
audio{width:210px;height:32px}
.cham label{margin-right:8px;font-size:12px;color:#9aa1b4}
.cham input[type=text]{width:150px;margin-top:5px;background:#1a1d26;color:#e6e8ee;border:1px solid #2c3140;border-radius:5px;padding:4px 6px;font-size:12px}
button{padding:9px 16px;border-radius:7px;border:1px solid #6ea8ff;background:#6ea8ff;color:#0b1020;font-weight:600;cursor:pointer;margin-top:14px}
#kq{width:100%;height:150px;margin-top:10px;background:#1a1d26;color:#e6e8ee;border:1px solid #2c3140;border-radius:7px;padding:9px;font:12px Consolas,monospace}
</style></head><body>
<h1>Bộ kiểm chứng VoiceOrMusic ${PHIEN_BAN()}</h1>
<div class="mo">Bấm Play nghe từng sound, đánh dấu máy chấm <b>Đúng</b> hay <b>Sai</b>.
Sai thì ghi đúng ra phải là gì (Giọng nói / Giọng nói + nhạc nền / + nhạc nền có lời / Hát / Nhạc).
Xong bấm nút dưới cùng rồi gửi lại phần chữ đó — đó là căn cứ để chỉnh ngưỡng.</div>
<table>
<thead><tr><th>#</th><th>Tình trạng</th><th>Máy chấm</th><th>Nói·Hát·Nhạc</th><th>Nghe</th><th>Sound</th><th>Bạn chấm</th></tr></thead>
<tbody>${dong}</tbody></table>
<button onclick="gom()">Gom nhận xét để gửi lại</button>
<textarea id="kq" placeholder="Bấm nút trên, rồi copy toàn bộ phần này gửi lại."></textarea>
<script>
const DL = ${JSON.stringify(rows.map(r => ({
    nhan: r.labelVi || (r.ok ? '' : 'LOI'),
    tt: r.lay ? 1 : 0,
    bq: !!r.banQuyen,
    noi: Math.round((r.stats?.speechFrac || 0) * 100),
    hat: Math.round((r.stats?.singFrac || 0) * 100),
    nhac: Math.round((r.stats?.musicFrac || 0) * 100),
    dinhHat: Number((r.stats?.singMax || 0).toFixed(3)),
    // Kem ca canh bao "can kiem tay": khi ban gui lai nhan xet, doi chieu duoc ngay
    // canh bao co roi DUNG vao nhung dong may cham sai hay khong.
    kiem: r.chacChan === false ? (r.ghiChu || []).join(' + ') : '',
    link: r.soundUrl || r.input,
  })))};
function gom(){
  const ra=[];
  DL.forEach((d,i)=>{
    const c=document.querySelector('input[name="d'+i+'"]:checked');
    const y=document.getElementById('y'+i).value.trim();
    ra.push([i+1, c?c.value.toUpperCase():'(chua cham)', 'may:'+d.nhan, 'tinhtrang:'+d.tt,
      d.bq?'banquyen':'', 'noi'+d.noi+'/hat'+d.hat+'/nhac'+d.nhac, 'dinhhat'+d.dinhHat,
      d.kiem?('cankiem:'+d.kiem):'',
      y?('dungra:'+y):'', d.link].filter(Boolean).join(' | '));
  });
  const sai=DL.filter((_,i)=>document.querySelector('input[name="d'+i+'"]:checked')?.value==='sai').length;
  const chuaCham=DL.filter((_,i)=>!document.querySelector('input[name="d'+i+'"]:checked')).length;
  document.getElementById('kq').value =
    'KIEM CHUNG VoiceOrMusic — '+DL.length+' sound, '+sai+' cai may cham SAI'
    +(chuaCham?(', '+chuaCham+' cai CHUA CHAM'):'')+'\\n\\n'+ra.join('\\n');
  document.getElementById('kq').select();
}
</script></body></html>`;
}

// ════════════════════════ in ket qua ════════════════════════
const ICON = { voice: '🗣 ', voice_bgm: '🎙 ', voice_bgm_loi: '🎙 ', singing: '🎤 ', music: '🎵 ', unknown: '❓' };

function dungBaoCao(rows, opt) {
  const out = [];
  const console = { log: (...a) => out.push(a.join(' ')) };   // gom lai thay vi in thang
  console.log(`VoiceOrMusic ${PHIEN_BAN()}`);
  // Che do --only-voice: chi in nhung dong LAY duoc, de copy thang sang danh sach dung.
  // Van dem day du o dong tong ket, khong thi khong biet da loai bao nhieu.
  const shown = opt.onlyVoice ? rows.filter(r => r.ok && r.lay) : rows;

  console.log('');
  for (const r of shown) {
    const head = r.meta && r.meta.title ? `"${r.meta.title}"` : (r.id || r.input);
    console.log('─'.repeat(72));
    if (!r.ok) {
      console.log(`⛔ ${head}\n   LOI: ${r.error}`);
      continue;
    }
    const verdict = r.lay ? '✅ LẤY ' : '❌ LOẠI';
    console.log(`${verdict}  [${r.lay ? 1 : 0}]  ${ICON[r.label] || ''} ${r.labelVi}`
      + `   (tin cay ${Math.round(r.confidence * 100)}%)${r.tichXanh ? '  ✔ TICH XANH' : ''}`
      + `${r.banQuyen ? '  🔒 CO BAN QUYEN' : ''}`);
    console.log(`   ${head}${r.meta && r.meta.authorName ? ' — ' + r.meta.authorName : ''}`);
    if (r.soundUrl) console.log(`   ${r.soundUrl}`);
    // Khi am thanh cho LAY ma van bi loai (ban quyen / phim / tai khoan dong vai) thi
    // PHAI noi ro vi sao — khong thi nguoi doc chi thay "Giong noi" ma bi loai, kho hieu.
    if (!r.lay && r.lyDoLoai && !r.boiNguoiDung) console.log(`   ⚠ loai vi: ${r.lyDoLoai}`);
    // Ghi chu "khong chac" — in cho CA dong LAY lan dong LOAI, vi ca hai chieu deu co the sai.
    if (!r.chacChan && (r.ghiChu || []).length) {
      console.log(`   ⚠ CAN KIEM TAY:`);
      for (const x of r.ghiChu) console.log(`      · ${x}`);
    }
    if (r.boiNguoiDung) console.log(`   ✋ ban tu chon: ${r.lay ? 'LAY' : 'LOAI'}`);
    console.log(`   ${r.reason}`);
    if (r.stats && r.stats.topLabels && r.stats.topLabels.length) {
      console.log(`   nhan hay gap: ${r.stats.topLabels.map(t => `${t.name} ${Math.round(t.frac * 100)}%`).join(' · ')}`);
    }
    if (r.durationSec) console.log(`   da phan tich ${r.durationSec.toFixed(1)}s audio${r.via ? ' · nguon: ' + r.via : ''}`);
  }

  console.log('─'.repeat(72));
  const n = rows.length;
  const ok = rows.filter(r => r.ok);
  const take = ok.filter(r => r.lay);
  const by = {};
  for (const r of ok) by[r.labelVi] = (by[r.labelVi] || 0) + 1;
  const canKiem = ok.filter(r => !r.chacChan).length;
  console.log(`✅ LẤY ${take.length}/${n}   ❌ LOẠI ${ok.length - take.length}   ⛔ loi ${n - ok.length}`
    + (canKiem ? `   ⚠ can kiem tay ${canKiem}` : ''));
  if (ok.length) console.log('   ' + Object.entries(by).map(([k, v]) => `${k}: ${v}`).join(' · '));
  if (opt.onlyVoice && take.length) {
    // In lai rieng danh sach link LAY duoc, moi dong 1 link — dan thang vao Sheet duoc.
    console.log('\n--- link LAY duoc ---');
    for (const r of take) console.log(r.soundUrl || r.input);
  }
  return out.join('\n');
}

/**
 * Dua bao cao ra cho nguoi dung.
 *
 * ⚠ Ban DA DONG GOI tren Windows KHONG CO CONSOLE. Do that (2026-08-13): chay
 * `VoiceOrMusic.exe -- a.wav` thi thoat dung ma 0 (tuc la da chay va phan loai xong) nhung
 * KHONG MOT CHU nao hien ra — va ke ca chuyen huong `> ketqua.txt` cung ra file RONG 0 BYTE.
 * Neu khong tu ghi file thi nguoi dung chay xong chang thay gi, ma cung khong hieu tai sao.
 */
function xuatBaoCao(text, opt) {
  const dich = opt.out || (app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'VoiceOrMusic-ketqua.txt')
    : '');
  if (!dich) { console.log(text); return ''; }
  try {
    fs.writeFileSync(dich, text.replace(/\n/g, '\r\n'), 'utf8');   // \r\n de Notepad khong dinh lien dong
    console.log(`Da ghi ket qua vao: ${dich}`);
    return dich;
  } catch (e) {
    console.log(text);
    console.error(`Khong ghi duoc ${dich}: ${e.message}`);
    return '';
  }
}

// ════════════════════════ chay ════════════════════════
app.disableHardwareAcceleration();   // khong ve gi ca; tat GPU cho on dinh tren may ao/VPS

// Cua so phan tich luon bi AN. Chromium mac dinh bop co hen gio + ha uu tien nhung trang bi
// che, va do la thu da lam hong che do giao dien mot lan (xem ghi chu o analyzeOne). Day
// viec bang IPC da khong con phu thuoc hen gio nua, nhung tat luon cho chac — khong ton gi.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const USAGE = () => `VoiceOrMusic ${PHIEN_BAN()}

Cach dung:
  VoiceOrMusic.exe                          # mo GIAO DIEN (khong tham so)
  check.cmd <link hoac id> [link2 ...]
  check.cmd --file=links.txt
  check.cmd --only-voice --file=links.txt   # CHI in sound lay duoc + danh sach link
  check.cmd --json <link>                   # xuat JSON de may doc (co truong "accept")
  VoiceOrMusic.exe --out=kq.txt <link>      # ghi ket qua ra file (ban .exe KHONG in ra man hinh)
  check.cmd --kiem-chung=D:\kc <link>       # xuat audio + trang HTML de NGHE LAI va cham dung/sai
  check.cmd --seconds=15 <link>             # chi phan tich 15 giay dau (nhanh hon)
  check.cmd -v <link>                       # in chi tiet tung buoc de do loi

Bo loc "chi lay giong nguoi noi":
  ✅ LAY   🗣  Giọng nói              nguoi noi, khong nhac
  ✅ LAY   🎙  Giọng nói + nhạc nền   nguoi noi tren nhac nen KHONG LOI
  ✅ LAY   🎙  Giọng nói + nhạc nền CÓ LỜI
                                     nguoi NOI, nhac nen co giong hat -> LAY duoc nhung
                                     PHAI TU KIEM BAN QUYEN (may khong nhan ra bai hat)
  ❌ LOAI  🎤 Hát                    hat / rap / nhac co loi
  ❌ LOAI  🎵 Nhạc                   khong co giong nguoi
  ❌ LOAI  ❓ Không rõ                qua ngan, im lang, hoac khong chac`;

function thieuModel() {
  return `Thieu file model: ${MODEL_PATH}
Tai lai bang:
  curl -L -o models/yamnet.tflite `
    + 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';
}

// ── Che do GIAO DIEN ────────────────────────────────────────────────────────────────
// Bat khi chay KHONG co tham so nao — tuc la nguoi dung bam dup vao file .exe.
function moGiaoDien(opt) {
  const win = new BrowserWindow({
    width: 1120, height: 780, minWidth: 900, minHeight: 600,
    title: `VoiceOrMusic ${PHIEN_BAN()} — lọc sound TikTok theo giọng người`,
    backgroundColor: '#12141a',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,     // giao dien KHONG duoc dung node truc tiep
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  let stopRequested = false;
  let dangChay = false;

  ipcMain.handle('ui:model-ok', () => fs.existsSync(MODEL_PATH));
  ipcMain.handle('ui:phien-ban', () => require('./package.json').version);

  // Tinh lai lay/loai cho ca danh sach (giao dien bat/tat o "Loai nhac co ban quyen").
  ipcMain.handle('ui:quyet-dinh', (_e, { rows, opt: o }) => {
    const khoTay = docQuyetDinhTay();
    const khoHoc = docKhoHoc();
    return (rows || []).map((r) => {
      if (!r || !r.ok) return { banQuyen: false, lay: false, tinhTrang: 0, boiNguoiDung: false, lyDoLoai: 'loi' };
      const tay = khoTay[khoaQD(r)];
      const caDaSua = timCaDaSua(r, khoHoc);
      return quyetDinhCuoi(r, { ...(r.meta || {}), caDaSua }, { ...(o || {}), nguoiDung: tay && tay.tinhTrang });
    });
  });

  // NGUOI DUNG TU CHAM: bam LAY/LOAI cho mot dong (hoac bo ghi de bang tinhTrang = null).
  //
  // Hai viec cung luc:
  //   1) nho quyet dinh do theo LINK (quyet-dinh-tay.json) — lan sau quet lai la co ngay;
  //   2) neu bam NGUOC y may thi luu them vao KHO HOC kem van tay so lieu, de sound khac
  //      giong nhu vay se duoc canh bao truoc.
  // Bam TRUNG y may thi khong ghi vao kho hoc — kho chi de nho cho SAI, khong phai nhat ky.
  ipcMain.handle('ui:danh-dau', (_e, { row, tinhTrang }) => {
    const khoa = khoaQD(row);
    if (!khoa) return { ok: false, loi: 'khong co link de lam khoa' };
    ghiQuyetDinhTay(khoa, tinhTrang);

    if (tinhTrang !== null && tinhTrang !== undefined && row && row.ok) {
      const mayLay = row.accept === true;
      const banLay = !!tinhTrang;
      if (mayLay !== banLay) {
        ghiKhoHoc({
          khoa,
          ten: (row.meta && (row.meta.title || row.meta.authorName)) || khoa,
          mayCham: row.label,
          mayLay,
          banCham: banLay ? 1 : 0,
          dacTrung: dacTrung(row),
          luc: new Date().toISOString(),
        });
      }
    }
    return { ok: true, soCaDaHoc: docKhoHoc().length };
  });

  // Xem/xoa kho hoc — de nguoi dung biet may dang "nho" nhung gi.
  ipcMain.handle('ui:kho-hoc', (_e, { xoa } = {}) => {
    if (xoa === 'tat-ca') {
      try { fs.writeFileSync(FILE_HOC(), '[]', 'utf8'); } catch (_) {}
      return [];
    }
    if (xoa) {
      const kho = docKhoHoc().filter(x => x && x.khoa !== xoa);
      try { fs.writeFileSync(FILE_HOC(), JSON.stringify(kho, null, 1), 'utf8'); } catch (_) {}
      return kho;
    }
    return docKhoHoc();
  });


  // Mo trang tra cuu bang TRINH DUYET NGOAI.
  // Khong nhung vao app duoc: Google va YouTube deu chan nhung iframe (khac trang embed cua
  // TikTok). Va mo o trinh duyet cua nguoi dung thi ho dang dang nhap san, ket qua sat hon.
  //
  // ⚠ CHI cho phep http(s). shell.openExternal se mo BAT KY giao thuc nao he dieu hanh biet
  // (file:, ms-msdt:, ...) nen mot chuoi la lot vao day la thanh lo hong that su.
  // Chup dung khung hinh dang hien tren man hinh (ke ca ben trong iframe cua TikTok).
  //
  // ⚠ PHAI chup o phia MAIN. Video nam trong iframe khac nguon nen JS trong trang KHONG doc
  // duoc pixel (chinh sach cung nguon chan canvas). Nhung webContents.capturePage() chup o
  // tang trinh duyet — la anh da ghep xong cua ca trang, nen co ca noi dung iframe.
  //
  // Chep vao CLIPBOARD roi mo lens.google.com: Lens nhan anh dan bang Ctrl+V. Duong nay tot
  // hon uploadbyurl vi anh la khung hinh NGUOI DUNG DANG XEM, khong phai anh bia co dinh —
  // va cung khong phu thuoc URL anh cua TikTok (von het han sau ~1 ngay).
  ipcMain.handle('ui:chup-khung', async (_e, vung) => {
    try {
      // ⚠ Banner "Allow cookies from TikTok" co the che ~1/4 duoi khung hinh o LAN DAU.
      // Da thu tu tat bang cach chay JS trong khung con (webFrameMain) — KHONG an. Nhung
      // khong dang duoi theo: banner chi hien mot lan, nguoi dung bam thang vao no trong
      // panel la xong, cookie duoc luu trong thu muc du lieu cua app nen khong hien lai.
      // (Test luon tao thu muc du lieu moi nen lan nao cung thay — do la chuyen cua test.)
      const r = vung && vung.width > 20 && vung.height > 20 ? {
        x: Math.max(0, Math.round(vung.x)), y: Math.max(0, Math.round(vung.y)),
        width: Math.round(vung.width), height: Math.round(vung.height),
      } : undefined;
      const anh = await win.webContents.capturePage(r);
      if (anh.isEmpty()) return { error: 'chup ra anh rong' };
      clipboard.writeImage(anh);
      // Luu them ra file de con keo tha neu Ctrl+V khong an.
      const tep = path.join(app.getPath('temp'), `vom-khunghinh-${Date.now()}.png`);
      fs.writeFileSync(tep, anh.toPNG());
      const cd = anh.getSize();
      return { tep, rong: cd.width, cao: cd.height };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  });

  // ── BAT TIENG CHO VIDEO TRONG PANEL ─────────────────────────────────────────────
  // Nguoi dung chi muon bam MOT lan vao dong la video chay kem tieng, khong phai bam them
  // trong player.
  //
  // Do duoc (2026-08-24) tren /embed/v2/ khi NHUNG trong trang — khac han khi mo thang:
  //   • Nhung trong iframe thi player TU CHAY SAN, chi la TAT TIENG (do duoc: giay 1.9,
  //     readyState 4, muted true — chua he bam gi).
  //   • Mo THANG trang do o cua so goc thi no khong nap gi ca (dai=0, rong=0), bam hay bat
  //     --autoplay-policy cung khong an thua. Nen dung lay ket qua do suy ra cho iframe.
  //   • Trang co BA the <video>: mot cai nguon v16-webapp-prime bi error 4 (hong, bo qua),
  //     hai cai con lai nguon v45.tiktokcdn deu that (576x1024).
  // => Chi can bo `muted` roi goi play() la co tieng. Do 3/3 sound deu duoc.
  //
  // Vi sao khong lam trong renderer: iframe KHAC NGUON, renderer khong voi vao trong duoc.
  // Nhung main thi voi duoc qua webContents.mainFrame.framesInSubtree — day la duong sach.
  // (Duong cu la ban su kien chuot that vao toa do cua khung. Bo roi: no bam mu, khong biet
  //  player da nap chua, va cu bam thu hai luc video DANG CHAY lai hoa thanh tam dung. Do
  //  thuc te chi duoc 2/3 dong.)
  //
  // Da do: KHONG can co --autoplay-policy — tat co di van bat tieng duoc.
  const JS_BAT_TIENG = `(async () => {
    const ds = [...document.querySelectorAll('video')]
      .filter(v => !v.error && v.readyState >= 2 && v.videoWidth > 0);
    if (!ds.length) return false;
    for (const v of ds) { v.muted = false; v.volume = 1; try { await v.play(); } catch (_) {} }
    return ds.some(v => !v.paused && !v.muted);
  })()`;

  // Moi lan mo dong khac lai tang so phien -> vong doi cua dong cu tu tat, khong bat tieng
  // nham cho video cua dong moi.
  let phienTieng = 0;
  ipcMain.handle('ui:bat-tieng', async (_e, { dung = false } = {}) => {
    const phien = ++phienTieng;
    if (dung) return false;
    // Player nap xong luc nao khong biet truoc nen phai cho — nhung cho co han.
    for (let i = 0; i < 16; i++) {
      if (win.isDestroyed() || phien !== phienTieng) return false;
      const f = win.webContents.mainFrame?.framesInSubtree
        ?.find(x => /tiktok\.com\/embed/.test(x.url || ''));
      if (f) {
        // frame co the bi go giua chung (nguoi dung dong panel) -> executeJavaScript nem.
        try { if (await f.executeJavaScript(JS_BAT_TIENG)) return true; } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 700));
    }
    return false;
  });

  ipcMain.handle('ui:mo-ngoai', (_e, url) => {
    const u = String(url || '');
    if (!/^https?:\/\//i.test(u)) { dbg(`tu choi mo link la: ${u.slice(0, 80)}`); return false; }
    shell.openExternal(u);
    return true;
  });

  // Xuat bo kiem chung: chep audio da phan tich + dung trang HTML nghe duoc.
  ipcMain.handle('ui:xuat-kiem-chung', async (_e, rows) => {
    if (!rows || !rows.length) return { error: 'chua co ket qua nao' };
    const chon = await dialog.showOpenDialog(win, {
      title: 'Chon thu muc de luu bo kiem chung',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (chon.canceled || !chon.filePaths[0]) return { huy: true };
    try {
      const dich = path.join(chon.filePaths[0], 'VoiceOrMusic-kiem-chung');
      fs.mkdirSync(path.join(dich, 'audio'), { recursive: true });
      let soAudio = 0;
      for (const r of rows) {
        if (!r.tepAudio) continue;
        try {
          fs.copyFileSync(path.join(thuMucKiemChung(), r.tepAudio), path.join(dich, 'audio', r.tepAudio));
          soAudio++;
        } catch (e) { dbg(`khong chep duoc ${r.tepAudio}: ${e.message}`); }
      }
      fs.writeFileSync(path.join(dich, 'kiem-chung.html'), trangKiemChung(rows), 'utf8');
      shell.openPath(dich);
      return { duongDan: dich, soAudio, soDong: rows.length };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  });
  // ════════════════════════ TU CAP NHAT ════════════════════════
  // Nguoi dung bam "Cap nhat" -> hoi GitHub -> bao co ban moi hay chua -> bam tai.
  ipcMain.handle('ui:kiem-cap-nhat', async () => {
    const r = await kiemTraCapNhat({
      phienBanHienTai: require('./package.json').version,
      repo: process.env.UPDATE_REPO || REPO_MAC_DINH,
    });
    // Ban chua dong goi thi KIEM duoc nhung TAI thi khong (khong co exe de thay) — noi truoc
    // de nguoi dung khoi bam roi moi biet.
    return { ...r, dongGoi: app.isPackaged };
  });

  ipcMain.handle('ui:tai-cap-nhat', async (_e, { url } = {}) => taiVaCapNhat({
    downloadUrl: url,
    onTienDo: (pt) => { if (!win.isDestroyed()) win.webContents.send('ui:tien-do-tai', pt); },
  }));

  ipcMain.handle('ui:stop', () => { stopRequested = true; return true; });
  ipcMain.handle('ui:start', async (_e, { links, seconds, loaiBanQuyen, loaiPhim, hocTuSua }) => {
    if (dangChay) return { error: 'dang chay roi' };
    if (!fs.existsSync(MODEL_PATH)) return { error: thieuModel() };
    dangChay = true;
    stopRequested = false;
    const runOpt = {
      ...opt,
      seconds: Math.max(3, Number(seconds) || 120),
      loaiBanQuyen: loaiBanQuyen !== false,
      loaiPhim: loaiPhim !== false,
      hocTuSua: hocTuSua !== false,
      luuAudio: true,      // giao dien luon giu audio de con xuat bo kiem chung
    };
    const send = (kenh, du) => { if (!win.isDestroyed()) win.webContents.send(kenh, du); };
    try {
      const rows = await runBatch(links, runOpt, {
        onProgress: (p) => send('ui:progress', p),
        onRow: (row, i) => send('ui:row', { row, i }),
        shouldStop: () => stopRequested,
      });
      return { done: true, total: rows.length, stopped: stopRequested };
    } catch (e) {
      return { error: String(e && e.message || e) };
    } finally {
      dangChay = false;
    }
  });
}

app.whenReady().then(async () => {
  const opt = parseArgv(userArgv(process.argv, app.isPackaged));
  registerIpc(opt);

  // Khong co link nao => mo giao dien. Muon xem huong dan dong lenh thi dung --help.
  if (!opt.links.length) {
    if (opt.help) { console.log(USAGE()); return app.exit(2); }
    return moGiaoDien(opt);
  }

  if (!fs.existsSync(MODEL_PATH)) { console.error(thieuModel()); return app.exit(3); }

  const rows = await runBatch(opt.links, opt, {
    onProgress: ({ i, total, phase, link }) => {
      if (opt.json) return;
      if (phase === 'fetch') console.error(`[${i + 1}/${total}] dang lay audio: ${link.slice(0, 80)}`);
      else console.error(`[${i + 1}/${total}] dang chay YAMNet...`);
    },
  });

  dbg(`gop xong ${rows.length} dong -> in ket qua`);
  if (opt.kiemChung) {
    try {
      const dich = path.join(opt.kiemChung, 'VoiceOrMusic-kiem-chung');
      fs.mkdirSync(path.join(dich, 'audio'), { recursive: true });
      let soAudio = 0;
      for (const r of rows) {
        if (!r.tepAudio) continue;
        try {
          fs.copyFileSync(path.join(thuMucKiemChung(), r.tepAudio), path.join(dich, 'audio', r.tepAudio));
          soAudio++;
        } catch (_) {}
      }
      fs.writeFileSync(path.join(dich, 'kiem-chung.html'), trangKiemChung(rows), 'utf8');
      console.log(`Da xuat bo kiem chung: ${dich} (${soAudio} file audio)`);
    } catch (e) { console.error(`Khong xuat duoc bo kiem chung: ${e.message}`); }
  }

  xuatBaoCao(opt.json ? JSON.stringify(rows, null, 2) : dungBaoCao(rows, opt), opt);

  dbg('goi app.exit');
  app.exit(rows.some(r => r.ok) ? 0 : 1);
});

// Che do giao dien: dong cua so cuoi cung thi thoat han. Che do CLI thi khong dinh gi ca
// vi luc do cua so phan tich bi huy giua chung cung se ban su kien nay — va CLI tu goi
// app.exit() lay roi.
app.on('window-all-closed', () => {
  // Che do giao dien: dong cua so cuoi cung thi thoat han. Che do dong lenh thi KHONG dinh
  // gi ca — luc do cua so phan tich bi huy giua chung cung ban su kien nay, ma dong lenh da
  // tu goi app.exit() lay roi.
  if (!parseArgv(userArgv(process.argv, app.isPackaged)).links.length) app.quit();
});
