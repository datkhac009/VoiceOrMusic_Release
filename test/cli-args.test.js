// test/cli-args.test.js — Kiem chung viec doc tham so dong lenh.
//
// SU CO THAT (2026-08-13) — ly do file nay ton tai:
// Chay `electron main.js <urlA> <urlB>` thi tien trinh SAP CUNG **truoc ca khi main.js chay
// dong dau tien**: thoat 127, khong mot chu output, va ca log ghi DONG BO cung khong co dong
// nao (tuc la chua he vao duoc app.whenReady). Mat kha lau moi khoanh dung vi trieu chung
// giong het "loi mang": mot link thi chay ngon, hai link thi chet.
//
// Do duoc quy luat that: sap khi co >=2 tham so VA it nhat 1 tham so la URL.
//     node run.cjs hello world                        -> chay binh thuong
//     node run.cjs a.wav b.wav                        -> chay binh thuong
//     node run.cjs https://example.com/a https://.../b -> SAP (khong he goi mang!)
// => Chromium TU DOC argv, khong lien quan gi den mang. Cach chua: chen '--' truoc tham so
// cua nguoi dung de Chromium ngung dien giai phan con lai.
//
// Test nay giu dung phan "cat sau '--'": neu ai do bo no di, day la cho bao.
// Chay: node test/cli-args.test.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgv, userArgv, DEFAULT_SECONDS } = require('../src/cli-args.cjs');

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`   OK   ${label}`); }
  else { fail++; console.log(`   FAIL ${label} ${extra}`); }
}
const quiet = () => {};

(async () => {
  console.log('\n=== 1. Cat dung phan sau dau "--" ===');
  {
    // Dung hinh dang argv THAT ma Electron main nhan duoc.
    const o = parseArgv(['D:\\app\\main.js', '--', 'https://a/1', 'https://a/2'], quiet);
    check('lay du 2 link sau "--"', o.links.length === 2, JSON.stringify(o.links));
    check('khong nuot nham duong dan main.js', !o.links.some(l => l.endsWith('main.js')), JSON.stringify(o.links));
    check('ban than dau "--" khong thanh link', !o.links.includes('--'), JSON.stringify(o.links));
  }

  console.log('\n=== 2. Khong co "--" van chay (goi tay luc phat trien) ===');
  {
    const o = parseArgv(['.', 'https://a/1'], quiet);
    check('van lay duoc link', o.links.length === 1 && o.links[0] === 'https://a/1', JSON.stringify(o.links));
    check('bo qua dau "." cua `electron .`', !o.links.includes('.'));
  }

  console.log('\n=== 3. BUG THAT: co dat TRUOC dau "--" khong duoc bi cat mat ===');
  {
    const o = parseArgv(['main.js', '--enable-logging', '--', 'https://that/1'], quiet);
    check('co Chromium khong thanh link', o.links.length === 1 && o.links[0] === 'https://that/1', JSON.stringify(o.links));

    // Ban dau cat `slice(indexOf('--') + 1)` nen moi co dung TRUOC '--' bi bo trong IM LANG.
    // Do that: `VoiceOrMusic.exe --out=kq.txt --only-voice -- a.wav` chay xong, thoat ma 0,
    // ma KHONG ghi file nao — vi ca 2 co da bi cat truoc khi den duoc parseArgv.
    const truoc = parseArgv(userArgv(['exe', '--out=kq.txt', '--only-voice', '--', 'a.wav'], true), quiet);
    check('--out= dat TRUOC "--" van an', truoc.out === 'kq.txt', JSON.stringify(truoc.out));
    check('--only-voice dat TRUOC "--" van an', truoc.onlyVoice === true, String(truoc.onlyVoice));
    check('link sau "--" van lay duoc', truoc.links.length === 1 && truoc.links[0] === 'a.wav', JSON.stringify(truoc.links));

    const sau = parseArgv(userArgv(['exe', '--', '--out=kq.txt', '--only-voice', 'a.wav'], true), quiet);
    check('dat SAU "--" cung y het', sau.out === 'kq.txt' && sau.onlyVoice === true && sau.links.length === 1,
      JSON.stringify(sau));
  }

  console.log('\n=== 4. Cac co ===');
  {
    const o = parseArgv(['--', '--json', '-v', '--dump-labels', '--seconds=15', 'link1'], quiet);
    check('--json', o.json === true);
    check('-v', o.verbose === true);
    check('--dump-labels', o.dumpLabels === true);
    check('--seconds=15', o.seconds === 15, String(o.seconds));
    check('co khong bi tinh la link', o.links.length === 1 && o.links[0] === 'link1', JSON.stringify(o.links));
    check('mac dinh seconds', parseArgv(['--', 'x'], quiet).seconds === DEFAULT_SECONDS);
    check('--verbose dai', parseArgv(['--', '--verbose', 'x'], quiet).verbose === true);
  }

  console.log('\n=== 5. --seconds gia tri la -> ve mac dinh / san toi thieu ===');
  {
    check('chu -> mac dinh', parseArgv(['--', '--seconds=abc'], quiet).seconds === DEFAULT_SECONDS);
    check('rong -> mac dinh', parseArgv(['--', '--seconds='], quiet).seconds === DEFAULT_SECONDS);
    check('0 -> mac dinh (Number("0") la gia tri sai -> ve mac dinh)', parseArgv(['--', '--seconds=0'], quiet).seconds === DEFAULT_SECONDS);
    check('1 -> nang len san 3', parseArgv(['--', '--seconds=1'], quiet).seconds === 3);
    check('am -> nang len san 3', parseArgv(['--', '--seconds=-9'], quiet).seconds === 3);
  }

  console.log('\n=== 6. --file= doc link tu file ===');
  {
    const tmp = path.join(os.tmpdir(), `vom-test-${process.pid}.txt`);
    fs.writeFileSync(tmp, 'https://a/1\n\n  https://a/2  \n# dong ghi chu\nhttps://a/3\n');
    const o = parseArgv(['--', `--file=${tmp}`], quiet);
    check('bo dong rong', o.links.length === 3, JSON.stringify(o.links));
    check('cat khoang trang 2 dau', o.links[1] === 'https://a/2', o.links[1]);
    check('bo dong bat dau bang #', !o.links.some(l => l.startsWith('#')), JSON.stringify(o.links));
    fs.unlinkSync(tmp);

    let warned = '';
    const o2 = parseArgv(['--', '--file=D:\\khong-ton-tai-abc.txt'], (m) => { warned = m; });
    check('file khong co -> canh bao, khong nem loi', o2.links.length === 0 && /Khong doc duoc file/.test(warned), warned);
  }

  console.log('\n=== 7. Dau vao rong/la ===');
  {
    check('argv rong', parseArgv([], quiet).links.length === 0);
    check('chi co "--"', parseArgv(['--'], quiet).links.length === 0);
    check('co la bi bo qua', parseArgv(['--', '--khong-biet-la-gi', 'x'], quiet).links.length === 1);
    check('chuoi rong bi bo qua', parseArgv(['--', '', 'x'], quiet).links.length === 1);
  }

  console.log('\n=== 8. BUG THAT: duong dan thu muc app bi coi la LINK ===');
  {
    // Electron dat argv KHAC NHAU o hai che do:
    //     chua dong goi:  [electron.exe, <duong dan app>, ...tham so]
    //     da dong goi:    [VoiceOrMusic.exe,              ...tham so]
    // Ban dau chi cat slice(1) roi loc tay vai truong hop ('.', duoi 'main.js'). Chay
    // `electron .` thi khong sao, nhung chay `electron D:\duong\dan\app` thi DUONG DAN THU
    // MUC APP bi coi la mot LINK -> app tuong nhu co viec, chay che do dong lenh roi thoat,
    // GIAO DIEN KHONG BAO GIO MO. Nhin y het "app hong".
    const dev = ['electron.exe', 'D:/Crawl_DataTiktok-releases/VoiceOrMusic_build', '--', 'https://a/1'];
    const pkg = ['VoiceOrMusic.exe', '--', 'https://a/1'];

    check('chua dong goi: bo duong dan app, giu link',
      JSON.stringify(parseArgv(userArgv(dev, false), quiet).links) === '["https://a/1"]',
      JSON.stringify(parseArgv(userArgv(dev, false), quiet).links));
    check('da dong goi: giu link',
      JSON.stringify(parseArgv(userArgv(pkg, true), quiet).links) === '["https://a/1"]',
      JSON.stringify(parseArgv(userArgv(pkg, true), quiet).links));

    // Khong tham so => 0 link => main.js mo GIAO DIEN. Day la dieu kien quyet dinh.
    check('chua dong goi, khong tham so -> 0 link (mo giao dien)',
      parseArgv(userArgv(['electron.exe', 'D:/app'], false), quiet).links.length === 0);
    check('da dong goi, khong tham so -> 0 link (mo giao dien)',
      parseArgv(userArgv(['VoiceOrMusic.exe'], true), quiet).links.length === 0);

    // Co Chromium (vd --remote-debugging-port) khong duoc bien thanh link.
    check('co Chromium sau duong dan app -> 0 link',
      parseArgv(userArgv(['electron.exe', 'D:/app', '--remote-debugging-port=9333'], false), quiet).links.length === 0);

    // ⚠ VONG 2 CUA CUNG CON BUG: co Chromium duoc phep dung TRUOC duong dan app. Cat cung
    // slice(2) thi dung ca nay, D:/app lai lot vao danh sach link va giao dien lai khong mo.
    check('co Chromium TRUOC duong dan app -> 0 link',
      parseArgv(userArgv(['electron.exe', '--remote-debugging-port=9333', 'D:/app'], false), quiet).links.length === 0,
      JSON.stringify(parseArgv(userArgv(['electron.exe', '--remote-debugging-port=9333', 'D:/app'], false), quiet).links));
    check('co Chromium TRUOC duong dan app, van giu duoc link that',
      JSON.stringify(parseArgv(userArgv(['electron.exe', '--enable-logging', 'D:/app', '--', 'https://a/1'], false), quiet).links) === '["https://a/1"]');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`KET QUA: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})();
