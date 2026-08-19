// test/updater.test.js — Kiem cac ham THUAN cua updater (khong goi mang, khong can Electron).
//
// Vi sao dang test rieng: hai ham chuanHoaRepo/soSanhPhienBan la noi da sinh ra su co van
// hanh THAT o ban crawler (xem chu thich dau src/updater.cjs) — thua mot dau gach cheo la
// GitHub tra 404 va app bao "khong tim thay release", chang ai hieu vi sao.
//
// Chay: node test/updater.test.js
'use strict';

const U = require('../src/updater.cjs');

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`   OK   ${label}`); }
  else { fail++; console.log(`   FAIL ${label} ${extra}`); }
}

console.log('\n=== 1. chuanHoaRepo: nhan rong, tra ve dung Owner/Repo ===');
{
  const dung = 'datkhac009/VoiceOrMusic_Release';
  // ⚠ CA THAT ben crawler: nguoi dung nhap tay o 5 may, hai lan mat thoi gian vi cung mot
  // kieu sai — thua dau gach cheo o cuoi. Do duoc: [Owner/Repo] -> 200, [Owner/Repo/] -> 404.
  for (const vao of [
    dung,
    `${dung}/`,
    `/${dung}`,
    `  ${dung}  `,
    `https://github.com/${dung}`,
    `https://www.github.com/${dung}/`,
    `http://github.com/${dung}`,
    `${dung}/releases`,          // dan ca duong dan con
    `${dung}/releases/tag/v0.9.0`,
  ]) {
    check(`"${vao.slice(0, 46)}" -> ${dung}`, U.chuanHoaRepo(vao) === dung, U.chuanHoaRepo(vao));
  }
  for (const rac of ['', '   ', 'khongcogachcheo', null, undefined, 'https://github.com/']) {
    check(`rac "${String(rac).slice(0, 20)}" -> chuoi rong`, U.chuanHoaRepo(rac) === '', U.chuanHoaRepo(rac));
  }
}

console.log('\n=== 2. moiHon: so sanh x.y.z ===');
{
  check('1.0.0 > 0.9.0', U.moiHon('1.0.0', '0.9.0') === true);
  check('0.10.0 > 0.9.0 (so chu KHONG phai chuoi)', U.moiHon('0.10.0', '0.9.0') === true);
  check('0.9.1 > 0.9.0', U.moiHon('0.9.1', '0.9.0') === true);
  check('0.9.0 KHONG > 0.9.0', U.moiHon('0.9.0', '0.9.0') === false);
  check('0.8.0 KHONG > 0.9.0', U.moiHon('0.8.0', '0.9.0') === false);
  check('thieu so hieu la 0: 1 > 0.9.9', U.moiHon('1', '0.9.9') === true);
  check('rac khong lam sap', U.moiHon('abc', 'x') === false);
}

console.log('\n=== 3. soSanhPhienBan: ra dung mot trong ba trang thai ===');
{
  const t = (h, m) => U.soSanhPhienBan(h, m).trangThai;
  check('may 0.9.0, github 1.0.0 -> co-ban-moi', t('0.9.0', '1.0.0') === 'co-ban-moi');
  check('co tien to v cung doc duoc', t('0.9.0', 'v1.0.0') === 'co-ban-moi');
  check('bang nhau -> da-moi-nhat', t('0.9.0', 'v0.9.0') === 'da-moi-nhat');
  // Ban tren GitHub CU HON: van cho cai (de ha ve ban cu khi ban moi bi loi) nhung PHAI
  // goi dung ten, khong duoc gop vao "co ban moi" — nguoi dung se bam nham va tut version.
  check('github cu hon -> ban-cu-hon (KHONG goi la co ban moi)', t('0.9.0', '0.8.0') === 'ban-cu-hon');
  check('khong doc duoc tag -> da-moi-nhat (khong de nghi gi)', t('0.9.0', '') === 'da-moi-nhat');
  check('tra ve ca hai so da bo tien to v', (() => {
    const r = U.soSanhPhienBan('v0.9.0', 'v1.0.0');
    return r.hienTai === '0.9.0' && r.moiNhat === '1.0.0';
  })());
}

console.log('\n=== 4. chonAssetExe: lay dung file .exe trong release ===');
{
  const a = U.chonAssetExe([
    { name: 'ghi-chu.txt' },
    { name: 'VoiceOrMusic.exe', browser_download_url: 'https://x/VoiceOrMusic.exe' },
    { name: 'khac.exe' },
  ]);
  check('lay duoc .exe dau tien', a && a.name === 'VoiceOrMusic.exe', JSON.stringify(a));
  check('khong co .exe -> null', U.chonAssetExe([{ name: 'a.zip' }]) === null);
  check('mang rong / rac -> null', U.chonAssetExe([]) === null && U.chonAssetExe(null) === null);
  check('bo qua phan tu rac', U.chonAssetExe([null, undefined, { name: 'b.exe' }]).name === 'b.exe');
}

console.log('\n=== 5. Hang so tro toi dung repo/exe cua app nay ===');
{
  check('repo mac dinh la repo phat hanh cua VoiceOrMusic',
    U.REPO_MAC_DINH === 'datkhac009/VoiceOrMusic_Release', U.REPO_MAC_DINH);
  check('ten exe khop voi productName trong package.json', (() => {
    const p = require('../package.json');
    return U.TEN_EXE === `${p.build.productName}.exe`;
  })(), U.TEN_EXE);
  // ⚠ Repo phat hanh PHAI public: updater goi GitHub an danh (khong nhung token vao .exe vi
  // .exe phat tan nhieu may). Ben crawler de private nen tinh nang nay chet han.
  check('chuan hoa repo mac dinh khong doi gi (da dung dang)',
    U.chuanHoaRepo(U.REPO_MAC_DINH) === U.REPO_MAC_DINH);
}

console.log('\n' + '='.repeat(60));
console.log(`KET QUA: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
