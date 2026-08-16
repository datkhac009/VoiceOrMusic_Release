// src/cli-args.cjs — doc tham so dong lenh.
//
// Tach rieng khoi main.js de test duoc bang node thuan (main.js require('electron') nen
// khong chay ngoai Electron). Dang ra mot ham doc argv thi khong dang co file rieng, nhung
// chinh cho nay tung lam sap ca chuong trinh — xem muc '--' o duoi — nen no can co test.
'use strict';

const fs = require('fs');

// ⚠ 120 GIAY = "phan tich TRON sound", khong phai con so tuy tien.
// Do duoc 2026-08-13: trong mot ban hat that, YAMNet chi thay giong hat TU GIAY 26.3 tro di
// (doan dau la nhac dao). Voi tran 30s thi bat duoc; nhung dat 20s la truot -> ban hat do
// bi goi la "Nhạc". Suy ra lo hong that cho bo loc: sound nao HAT MUON hon tran se bi cham
// nham la "Giọng nói + nhạc nền" va LOT VAO DANH SACH LAY.
// Nang tran len gan nhu KHONG ton them gi: file da tai tron ve tu truoc, va YAMNet chay het
// 31 cua so (30 giay) chi mat ~470ms. Sound TikTok thuong <=60s nen 120s = ca bai.
const DEFAULT_SECONDS = 120;

/**
 * @param {string[]} argvRaw process.argv.slice(1) trong Electron main
 * @param {(msg:string)=>void} onWarn nơi bao loi doc file (mac dinh: console.error)
 */
function parseArgv(argvRaw, onWarn = (m) => console.error(m)) {
  // ── VI SAO PHAI CAT SAU '--' ──
  // run.cjs goi `electron main.js -- <tham so cua nguoi dung>`. Dau '--' la BAT BUOC:
  // do duoc 2026-08-13, chay `electron main.js <urlA> <urlB>` thi tien trinh SAP CUNG truoc
  // ca khi main.js chay dong dau tien (thoat 127, khong mot chu output, khong ca log ghi
  // dong bo). Quy luat: sap khi co >=2 tham so VA it nhat 1 tham so la URL — hai chuoi
  // thuong hoac hai duong dan file thi khong sao, ma `https://example.com/a` (khong he goi
  // mang) cung du lam sap. Tuc la Chromium TU DOC argv chu khong lien quan gi den mang.
  // Co '--' thi Chromium ngung dien giai phan con lai va giao het cho ung dung.
  // ⚠ CHI BO dau '--', KHONG cat bo phan dung TRUOC no.
  // Ban dau lam `slice(indexOf('--') + 1)` — va do la mot bug that: chay
  //     VoiceOrMusic.exe --out=kq.txt --only-voice -- a.wav
  // thi ca `--out=` lan `--only-voice` bi cat mat trong im lang, app chay xong ma khong ghi
  // file nao. Nguoi dung dat co truoc hay sau '--' deu la tu nhien, khong nen phat.
  // Bo phan cat di khong lam mat tac dung cua '--': tac dung do nam o CHO CHROMIUM (no
  // ngung dien giai argv tu day), chu khong phai o cho ung dung. Con co Chromium lot vao
  // day thi cung vo hai — moi thu bat dau bang '-' deu bi bo qua ben duoi.
  const argv = argvRaw.filter(a => a !== '--');

  const opt = {
    links: [], json: false, seconds: DEFAULT_SECONDS,
    verbose: false, dumpLabels: false, onlyVoice: false, dumpWindows: false, help: false,
    out: '', kiemChung: '',
  };

  for (const a of argv) {
    if (!a) continue;
    if (a === '.' || a === '--' || a.startsWith('--inspect') || a.endsWith('main.js')) continue;
    if (a === '--help' || a === '-h' || a === '/?') { opt.help = true; continue; }
    if (a === '--json') { opt.json = true; continue; }
    if (a === '--verbose' || a === '-v') { opt.verbose = true; continue; }
    if (a === '--dump-labels') { opt.dumpLabels = true; continue; }
    // Chi in nhung sound LAY duoc (giong noi / giong noi + nhac nen khong loi) — de copy
    // thang sang danh sach dung, khong phai loc bang mat.
    if (a === '--only-voice') { opt.onlyVoice = true; continue; }
    // Xuat diem tung cua so ra JSON. Dung de HIEU CHINH NGUONG bang so do that: co du
    // lieu nay thi chay lai aggregate() voi nguong khac ma khong phai tai/giai ma lai audio.
    if (a === '--dump-windows') { opt.dumpWindows = true; continue; }
    // Chan doan: in diem TUNG NHAN khop bieu thuc, tren tung cua so. Dung de hieu chinh
    // nguong bang SO DO thay vi doan (vi du --do-nhan="Applause|Crowd|Laughter").
    if (a.startsWith('--do-nhan=')) { opt.doNhan = a.slice(10); continue; }
    if (a.startsWith('--seconds=')) {
      // Duoi 3 giay thi YAMNet chi con ~3 cua so — khong du de ket luan gi. Chan o day
      // thay vi de classify.cjs tra "Khong ro" cho moi thu.
      opt.seconds = Math.max(3, Number(a.slice(10)) || DEFAULT_SECONDS);
      continue;
    }
    // Ghi ket qua ra file. BAT BUOC phai co o ban da dong goi: tren Windows, app dong goi
    // khong duoc gan console nen console.log bay vao hu khong — do that, ke ca khi da
    // chuyen huong `> file.txt` thi file van RONG 0 byte.
    if (a.startsWith('--out=')) { opt.out = a.slice(6); continue; }
    // Xuat bo kiem chung (audio + trang HTML nghe lai) ra thu muc chi dinh.
    if (a.startsWith('--kiem-chung=')) { opt.kiemChung = a.slice(13); opt.luuAudio = true; continue; }
    if (a.startsWith('--file=')) {
      const p = a.slice(7);
      try {
        for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
          const t = l.trim();
          if (t && !t.startsWith('#')) opt.links.push(t);   // cho phep ghi chu trong file
        }
      } catch (e) { onWarn(`Khong doc duoc file ${p}: ${e.message}`); }
      continue;
    }
    if (a.startsWith('--')) continue;   // co lieu la; bo qua con hon dung nham
    opt.links.push(a);
  }
  return opt;
}

/**
 * Cat lay dung phan tham so CUA NGUOI DUNG trong process.argv.
 *
 * ⚠ Cho nay tung co bug that (2026-08-13): Electron dat argv KHAC NHAU o hai che do.
 *     chua dong goi:  [electron.exe, <duong dan app>, ...tham so]
 *     da dong goi:    [VoiceOrMusic.exe,              ...tham so]
 * Ban dau chi cat slice(1) roi loc tay may truong hop ('.', duoi 'main.js'). Chay
 * `electron .` thi khong sao, nhung chay `electron D:\duong\danpp` thi DUONG DAN THU MUC
 * APP bi coi la mot LINK -> app tuong nhu co viec, chay che do dong lenh roi thoat, GIAO DIEN
 * KHONG BAO GIO MO. Trieu chung nhin rat giong "app hong" nen rat de di nham huong.
 *
 * `app.isPackaged` cho biet dang o che do nao, nen cat theo no la dung ban chat, khong phai
 * doan theo hinh dang chuoi.
 */
function userArgv(argv, isPackaged) {
  const con = (argv || []).slice(1);          // bo ten chuong trinh
  if (isPackaged) return con;                 // da dong goi thi khong co duong dan app

  // ⚠ KHONG duoc cho duong dan app luon o vi tri 1. Co Chromium duoc phep dung TRUOC no:
  //     electron .                                  -> ['.']
  //     electron --remote-debugging-port=9333 D:/app -> ['--remote-debugging-port=9333','D:/app']
  // Ban dau cat cung slice(2) nen o dong lenh thu hai, D:/app lot vao danh sach link — dung
  // lai loi cu duoi hinh dang khac. Electron xac dinh duong dan app la THAM SO DAU TIEN
  // KHONG PHAI CO, nen bam theo dung quy tac do.
  const i = con.findIndex(a => a && !a.startsWith('-'));
  return i < 0 ? con : [...con.slice(0, i), ...con.slice(i + 1)];
}

module.exports = { parseArgv, userArgv, DEFAULT_SECONDS };
