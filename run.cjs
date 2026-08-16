// run.cjs — tim file electron.exe roi chay main.js. Tach ra day vi may nay da co Electron
// (ben Crawl_DataTiktok_build) — cai them ban nua la tai trung ~100MB va sau nay lech phien ban.
//
// Thu tu tim, dung cai dau tien thay duoc:
//   1) ELECTRON_PATH tu bien moi truong (nguoi dung tu chi)
//   2) node_modules cua chinh app nay (neu sau nay co cai rieng)
//   3) node_modules cua Crawl_DataTiktok_build ben canh (truong hop hien tai)
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function tryLocal(dir) {
  // Package electron ghi duong dan .exe that vao file path.txt canh module.
  try {
    const base = path.join(dir, 'node_modules', 'electron');
    const p = fs.readFileSync(path.join(base, 'path.txt'), 'utf8').trim();
    const exe = path.join(base, 'dist', p);
    return fs.existsSync(exe) ? exe : null;
  } catch (_) { return null; }
}

function findElectron() {
  if (process.env.ELECTRON_PATH && fs.existsSync(process.env.ELECTRON_PATH)) {
    return process.env.ELECTRON_PATH;
  }
  const here = __dirname;
  const candidates = [
    here,
    path.join(here, '..', 'Crawl_DataTiktok_build'),
    path.join(here, '..', '..', 'Crawl_DataTiktok_build'),
  ];
  for (const c of candidates) {
    const exe = tryLocal(c);
    if (exe) return exe;
  }
  return null;
}

const exe = findElectron();
if (!exe) {
  console.error(`Khong tim thay Electron. Chon 1 trong 2 cach:
  (a) cai rieng cho app nay:   npm i -D electron@28
  (b) chi thang vao ban da co:  set ELECTRON_PATH=D:\\duong\\dan\\electron.exe`);
  process.exit(4);
}

// ELECTRON_RUN_AS_NODE phai duoc XOA: neu con sot lai (npm/electron hay de bien nay) thi
// electron.exe chay nhu node thuan -> khong co Chromium -> khong giai ma duoc audio.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// ⚠ DAU '--' LA BAT BUOC, khong phai cho dep.
// Su co that (do 2026-08-13): chay `electron main.js <urlA> <urlB>` thi tien trinh SAP CUNG
// truoc ca khi main.js chay dong dau tien — thoat 127, khong mot chu output, khong log.
// Do duoc quy luat: sap khi co >=2 tham so VA it nhat 1 tham so la URL. Hai chuoi thuong
// hoac hai duong dan file thi khong sao; ma `https://example.com/a` (khong he goi mang)
// cung du lam sap — nen day la Chromium TU DOC argv, khong lien quan gi den mang.
// Dat '--' vao truoc de Chromium ngung dien giai phan con lai va giao het cho ung dung.
const r = spawnSync(exe, [path.join(__dirname, 'main.js'), '--', ...process.argv.slice(2)], {
  stdio: 'inherit', env, windowsHide: true,
});
process.exit(r.status === null ? 5 : r.status);
