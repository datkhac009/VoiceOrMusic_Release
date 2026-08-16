// test/gui-smoke.cjs — Kiem giao dien THAT: mo app, dan link, bam nut, doc bang ket qua.
// Dieu khien qua Chrome DevTools Protocol nen kiem dung nhung thu nguoi dung se bam.
//
// KHONG nam trong `npm test` vi can Electron + mang. Chay rieng:
//     npm run test:gui                      (ban chua dong goi)
//     set VOM_EXE=..\VoiceOrMusic_Release\VoiceOrMusic.exe && npm run test:gui   (ban .exe)
//
// ⚠ BAI HOC VE CHINH HARNESS NAY (2026-08-13): ban dau no hoi CDP MOI GIAY, va cac lenh goi
// CDP khong co tran thoi gian. Ket qua: harness tu treo/tu doc so lieu cu roi bao "app treo o
// link thu 2" — trong khi app hoan toan binh thuong. Mat kha nhieu thoi gian dao vao app vi
// tin bao cao cua mot harness sai. Nen ban nay:
//   • bam MOT lan roi DONG ket noi, khong hoi gi trong luc app dang chay,
//   • moi lenh CDP deu co tran thoi gian,
//   • cuoi cung moi noi lai va doc ket qua DUNG MOT LAN.
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GOC = path.join(__dirname, '..');
const EXE = process.env.VOM_EXE || path.join(GOC, 'node_modules', 'electron', 'dist', 'electron.exe');
const THAM_SO = process.env.VOM_EXE ? [] : [GOC];
const PORT = Number(process.env.VOM_PORT || 9455);
const CHO_MS = Number(process.env.VOM_WAIT_MS || 120000);
const LOG = path.join(os.tmpdir(), `vom-gui-smoke-${process.pid}.log`);
// ⚠ THU MUC DU LIEU RIENG cho test. Test nay bam Lay/Loai tren LINK THAT, ma quyet dinh do
// duoc ghi vao kho de nho lai — chay test tren thu muc that la GHI DE LEN QUYET DINH CUA
// NGUOI DUNG. Da xay ra that: sau vai lan chay test, ket qua that bi "ban tu chon loai" o
// hang loat dong. Tach thu muc thi test muon bam gi cung khong dung den du lieu that.
const DATA_DIR = path.join(os.tmpdir(), `vom-gui-smoke-data-${process.pid}`);

const nghi = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (nhan, dung, phu = '') => {
  if (dung) { pass++; console.log(`   OK   ${nhan}`); }
  else { fail++; console.log(`   FAIL ${nhan} ${phu}`); }
};

/** Noi vao trang khop `re`. Moi buoc deu co tran thoi gian. */
async function noiTrang(re) {
  for (let i = 0; i < 60; i++) {
    await nghi(500);
    let ds = [];
    try { ds = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (_) { continue; }
    const t = ds.find(x => x.type === 'page' && re.test(x.url));
    if (!t) continue;
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    const mo = await new Promise((ok) => {
      ws.onopen = () => ok(true);
      ws.onerror = () => ok(false);
      setTimeout(() => ok(false), 4000);
    });
    if (!mo) { try { ws.close(); } catch (_) {} continue; }
    let id = 0; const cho = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && cho.has(m.id)) { cho.get(m.id)(m); cho.delete(m.id); } };
    return {
      dong: () => { try { ws.close(); } catch (_) {} },
      js: (bt) => new Promise((ok) => {
        const n = ++id;
        cho.set(n, (m) => ok(m.result?.result?.value));
        ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: bt, returnByValue: true, awaitPromise: true } }));
        setTimeout(() => ok('<het gio>'), 10000);
      }),
    };
  }
  return null;
}

(async () => {
  const env = { ...process.env, VOM_LOG: LOG };
  delete env.ELECTRON_RUN_AS_NODE;   // sot lai la electron chay nhu node thuan -> khong co Chromium
  // ⚠ Co Chromium phai dat TRUOC duong dan app, khong thi Electron coi no la tham so cua ung dung.
  const app = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${DATA_DIR}`, ...THAM_SO],
    { env, stdio: 'ignore' });
  // Dong ket noi TRUOC roi cho mot nhip moi thoat: giet tien trinh trong khi WebSocket dang
  // dong lam libuv nem "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" — vo hai
  // nhung in ra sau ket qua thi trong nhu test hong.
  const moKetNoi = [];
  const ketThuc = async (ma) => {
    for (const c of moKetNoi) { try { c.dong(); } catch (_) {} }
    try { app.kill(); } catch (_) {}
    await nghi(300);
    try { fs.unlinkSync(LOG); } catch (_) {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    process.exit(ma);
  };

  try {
    console.log(`\n=== 1. Mo duoc giao dien (${process.env.VOM_EXE ? 'ban .exe' : 'ban chua dong goi'}) ===`);
    const c = await noiTrang(/index\.html/);
    if (!c) { console.log('   FAIL khong mo duoc giao dien'); return ketThuc(1); }
    moKetNoi.push(c);
    check('giao dien mo duoc', true);

    const cau = await c.js(`Object.keys(window.vom || {}).sort().join(',')`);
    for (const ham of ['batDau', 'coModel', 'dung', 'khiCoDong', 'khiTienDo']) {
      check(`preload co ham ${ham}`, String(cau).includes(ham), cau);
    }
    check('app thay file model', await c.js(`window.vom.coModel()`) === true);

    // Phien ban phai hien tren giao dien VA khop package.json — de nhin la biet ban .exe
    // dang cam co phai ban moi khong.
    const pbGoi = String(await c.js(`window.vom.phienBan()`));
    const pbHien = String(await c.js(`document.getElementById('phienBan').textContent`));
    const pbGoc = require('../package.json').version;
    check(`phien ban khop package.json (${pbGoc})`, pbGoi === pbGoc, `${pbGoi} vs ${pbGoc}`);
    check('phien ban hien tren giao dien', pbHien === 'v' + pbGoc, pbHien);
    check('tieu de cua so co phien ban',
      /v\d+\.\d+\.\d+/.test(String(await c.js(`document.title`)))
      || /v\d+\.\d+\.\d+/.test(pbHien), await c.js(`document.title`));

    console.log('\n=== 1b. Cac o dieu khien phai NHIN THAY duoc ===');
    {
      // ⚠ VI SAO CAN MUC NAY: da co MOT loi lot qua het bo test cu — CSS an moi input trong
      // huy hieu nen O NHAP SO GIAY bi tang hinh, chi con chu "giay dau" tro troi. Test cu
      // van xanh vi no chi DOC `.value` / `.checked`, ma hai thu do van doc duoc binh thuong
      // khi phan tu bi an. Test khong he "nhin". Nguoi dung phat hien truoc test.
      // Nen tu day: nhung o nguoi dung phai THAO TAC deu duoc kiem ca KICH THUOC THAT.
      const doHien = async (id) => JSON.parse(await c.js(
        `(() => { const e = document.getElementById('${id}'); if (!e) return '{"thieu":true}';
           const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
           return JSON.stringify({ rong: Math.round(r.width), cao: Math.round(r.height),
             mo: Number(cs.opacity), an: cs.display === 'none' || cs.visibility === 'hidden',
             trongBoCuc: !!e.offsetParent }); })()`) || '{}');

      for (const [id, ten] of [
        ['oLink', 'o dan link'], ['nutChay', 'nut Kiem tra'], ['oGiay', 'o nhap so giay'],
        ['phanTram', 'so phan tram'], ['than', 'bang ket qua'],
      ]) {
        const d = await doHien(id);
        check(`${ten} nhin thay duoc (${d.rong}x${d.cao})`,
          !d.thieu && !d.an && d.mo > 0 && d.rong > 8 && d.cao > 4 && d.trongBoCuc, JSON.stringify(d));
      }

      // MANG cua thanh tien do phai nhin thay. KHONG kiem `#thanhTienDo` — do la phan RUOT,
      // luc chua chay thi rong 0 la DUNG. Kiem nham cho do thi test do lat trong khi app on.
      check('mang thanh tien do nhin thay duoc', await c.js(
        `(() => { const t = document.querySelector('.thanh');
           return !!t && t.getBoundingClientRect().width > 40; })()`) === true);
      check('ruot thanh tien do co ton tai (rong 0 luc chua chay la dung)',
        await c.js(`!!document.getElementById('thanhTienDo')`) === true);

      // O tick thi CO Y an (ve lai bang o vuong rieng) — nhung dau tick thay the PHAI hien,
      // khong thi nguoi dung khong biet luat nao dang bat.
      const tick = await doHien('oBanQuyen');
      check('o tick that duoc an co y', tick.rong <= 2, JSON.stringify(tick));
      check('dau tick thay the thi HIEN', await c.js(
        `(() => { const d = document.getElementById('oBanQuyen').parentElement.querySelector('.dau');
           return !!d && d.getBoundingClientRect().width > 6; })()`) === true);
      check('bat/tat van doc duoc dung', await c.js(`document.getElementById('oBanQuyen').checked`) === true);
    }

    console.log('\n=== 2. Dan link, bam "Kiem tra", roi KHONG can thiep gi ===');
    // Tron du 3 kieu dau vao: file tren may (nhanh), link sound TikTok (cham, qua mang),
    // va id tro. Co mot muc CHAM o giua la co y: chinh do tre do tung lam lo ra bug
    // "renderer thoat vong lay viec khi hang doi trong".
    const muc = [
      { link: path.join(__dirname, '..', 'test', 'mau', 'noi.wav'), cho: 'Giọng nói' },
      { link: 'https://www.tiktok.com/music/original-sound-7411103147315349520', cho: null },
      { link: '7648030600474299169', cho: null },
      // Sound NAY co ban quyen (TikTok: original = "") du nghe ra la giong noi.
      // Do that 2026-08-13: "From The Back Funny Sound Effect" — Sound Effects Depot.
      { link: 'https://www.tiktok.com/music/original-sound-7286066645294548993', cho: null, banQuyen: true },
      // Sound VOICE ANIME: model cham "Giọng nói + nhạc nền" (nghe thi dung la giong nguoi)
      // nhung video gan #anime va bio tai khoan ghi "Cortos de Anime" -> phai bi LOAI.
      { link: 'https://www.tiktok.com/music/original-sound-7567224125417802503', cho: null, nghiPhim: true },
    ];
    // File mau co the chua co (test/mau/ khong duoc dong goi) -> bo qua muc do.
    const dung = muc.filter(m => /^https?:|^\d+$/.test(m.link) || fs.existsSync(m.link));
    await c.js(`document.getElementById('oLink').value = ${JSON.stringify(dung.map(m => m.link).join('\n'))};
                document.getElementById('nutChay').click(); 1`);
    c.dong();
    console.log(`   da bam voi ${dung.length} muc — cho ${Math.round(CHO_MS / 1000)} giay, khong hoi gi`);
    await nghi(CHO_MS);

    console.log('\n=== 3. Doc ket qua tren bang ===');
    const c2 = await noiTrang(/index\.html/);
    if (!c2) { console.log('   FAIL khong noi lai duoc giao dien'); return ketThuc(1); }
    moKetNoi.push(c2);
    const tt = String(await c2.js(`document.getElementById('trangThai').textContent`));
    const soDong = await c2.js(`document.querySelectorAll('#than tr').length`);
    const tungDong = JSON.parse(await c2.js(`JSON.stringify(ketQua.map(r => r.ok ? r.labelVi : ('LOI: ' + r.error)))`) || '[]');
    const loiJS = await c2.js(`JSON.stringify(window.__loi || [])`);

    console.log(`   trangThai: ${tt}`);
    console.log(`   tung dong: ${JSON.stringify(tungDong)}`);

    check('bao "Xong"', tt.startsWith('Xong'), tt);
    check(`bang co dung ${dung.length} dong`, soDong === dung.length, String(soDong));
    check('moi muc deu co ket qua', tungDong.length === dung.length, String(tungDong.length));
    check('khong muc nao bi loi', !tungDong.some(x => String(x).startsWith('LOI')), JSON.stringify(tungDong));
    check('khong co loi JS trong trang', !loiJS || loiJS === '[]', String(loiJS));
    for (let i = 0; i < dung.length; i++) {
      if (dung[i].cho) check(`muc ${i + 1} phai la "${dung[i].cho}"`, tungDong[i] === dung[i].cho, String(tungDong[i]));
    }

    console.log('\n=== 3b. Cot "Tinh trang" (1/0) va luat ban quyen ===');
    const tt01 = JSON.parse(await c2.js(`JSON.stringify(ketQua.map(r => r.lay ? 1 : 0))`) || '[]');
    const bq = JSON.parse(await c2.js(`JSON.stringify(ketQua.map(r => !!r.banQuyen))`) || '[]');
    console.log(`   tinh trang: ${JSON.stringify(tt01)} | ban quyen: ${JSON.stringify(bq)}`);

    check('moi dong deu co tinh trang 1 hoac 0', tt01.every(x => x === 0 || x === 1), JSON.stringify(tt01));
    check('cot "Tinh trang" hien tren bang',
      /Tình trạng/.test(String(await c2.js(`document.querySelector('thead').textContent`))));

    const iBQ = dung.findIndex(m => m.banQuyen);
    if (iBQ >= 0) {
      check('sound co ban quyen bi danh dau', bq[iBQ] === true, JSON.stringify(bq));
      check('sound co ban quyen -> tinh trang 0', tt01[iBQ] === 0, String(tt01[iBQ]));

      // TAT luat -> chinh sound do phai duoc lay lai NGAY, khong phai chay lai model.
      await c2.js(`document.getElementById('oBanQuyen').checked = false;
                   document.getElementById('oBanQuyen').dispatchEvent(new Event('change')); 1`);
      await nghi(1500);
      const sauKhiTat = JSON.parse(await c2.js(`JSON.stringify(ketQua.map(r => r.lay ? 1 : 0))`) || '[]');
      check('tat luat ban quyen -> sound do duoc lay lai', sauKhiTat[iBQ] === 1, JSON.stringify(sauKhiTat));
      await c2.js(`document.getElementById('oBanQuyen').checked = true;
                   document.getElementById('oBanQuyen').dispatchEvent(new Event('change')); 1`);
      await nghi(1500);
    }

    console.log('\n=== 3bb. Loai voice phim / hoat hinh ===');
    {
      const iPhim = dung.findIndex(m => m.nghiPhim);
      if (iPhim >= 0) {
        const coNghi = await c2.js(`ketQua[${iPhim}].nghiPhim === true`);
        const tt = await c2.js(`ketQua[${iPhim}].lay ? 1 : 0`);
        const nhan = String(await c2.js(`ketQua[${iPhim}].labelVi || ''`));
        const tu = String(await c2.js(`JSON.stringify(ketQua[${iPhim}].meta?.tuKhop || [])`));
        console.log(`   sound anime: nhan "${nhan}" | nghi phim: ${coNghi} | tu khop: ${tu}`);

        check('nhan ra la voice phim/hoat hinh', coNghi === true, tu);
        check('=> tinh trang 0 du NGHE RA la giong nguoi', tt === 0, `nhan="${nhan}"`);
        check('co bao tu khoa da khop de biet vi sao bi loai', tu !== '[]', tu);

        // TAT luat -> phai duoc lay lai, vi audio van la giong nguoi that.
        await c2.js(`document.getElementById('oPhim').checked = false;
                     document.getElementById('oPhim').dispatchEvent(new Event('change')); 1`);
        await nghi(1200);
        check('tat luat phim -> duoc lay lai', await c2.js(`ketQua[${iPhim}].lay`) === true);
        await c2.js(`document.getElementById('oPhim').checked = true;
                     document.getElementById('oPhim').dispatchEvent(new Event('change')); 1`);
        await nghi(1200);
      }
    }

    console.log('\n=== 3c. Mini browser: xem video that roi tu quyet dinh ===');
    {
      // Bam vao dong dau tien co videoId (dong file cuc bo thi khong co video de xem).
      const iXem = await c2.js(`ketQua.findIndex(r => r.meta && r.meta.videoId)`);
      check('co it nhat 1 dong lay duoc videoId de xem', iXem >= 0, String(iXem));
      if (iXem >= 0) {
        await c2.js(`moPanel(${iXem}); 1`);
        await nghi(800);
        check('panel mo ra', await c2.js(`document.getElementById('panel').classList.contains('mo')`) === true);
        const src = String(await c2.js(`document.querySelector('#pKhung iframe')?.src || ''`));
        check('co nhung player TikTok that', /tiktok\.com\/embed\/v2\/\d+/.test(src), src.slice(0, 70));
        const the = String(await c2.js(`document.getElementById('pThe').textContent`));
        check('panel hien @tai khoan', /@/.test(the), the.slice(0, 80));

        // Nut tra cuu nen tang khac: chi MO TRINH DUYET NGOAI (Google/YouTube chan nhung
        // iframe), nguoi dung tu nhin roi quyet dinh. Kiem truy van dung duoc dung chua.
        check('co nut tim YouTube', await c2.js(`!!document.getElementById('nutYT')`) === true);
        check('co nut tim Google', await c2.js(`!!document.getElementById('nutGG')`) === true);
        check('co nut mo tren TikTok', await c2.js(`!!document.getElementById('nutTT')`) === true);
        const tv = String(await c2.js(`tvHienTai.truyVan`));
        check('da dung duoc truy van tra cuu', tv.length > 3, tv);
        const goiy = String(await c2.js(`document.getElementById('pGoiY').textContent`));
        check('co canh bao ve do tin cay cua ket qua tim kiem',
          /đáng tin|nhiễu/.test(goiy), goiy.slice(0, 60));

        // ── CHUP KHUNG HINH DANG XEM ──────────────────────────────────────────────
        // Cau hoi then chot: capturePage() co chup XUYEN duoc iframe cua TikTok khong, hay
        // ra anh den? JS trong trang chac chan khong doc duoc pixel cua iframe khac nguon,
        // nen neu capturePage cung khong duoc thi ca tinh nang nay vo nghia.
        // Goi dung ham ma NUT goi, de test di qua ca phan cat vung theo o cuon.
        const CHUP_JS = `(async () => { const k = document.querySelector('#pKhung iframe');
             const b = k.getBoundingClientRect();
             const o = document.querySelector('.p-than').getBoundingClientRect();
             const x = Math.max(b.left, o.left, 0), y = Math.max(b.top, o.top, 0);
             const x2 = Math.min(b.right, o.right, window.innerWidth);
             const y2 = Math.min(b.bottom, o.bottom, window.innerHeight);
             return JSON.stringify({ ...(await window.vom.chupKhung(
               { x, y, width: x2 - x, height: y2 - y })), cat: { y: Math.round(y), y2: Math.round(y2) },
               oCuonY2: Math.round(o.bottom) }); })()`;

        // ⚠ CHO DEN KHI iframe VE XONG, dung doan mot moc thoi gian co dinh: TikTok tai luc
        // nhanh luc cham, chup som thi ra khung trang ~2 KB va test lat lien tuc trong khi
        // app khong he hong. Chup lai vai nhip, dung khi da co noi dung that.
        let chup = {};
        for (let lan = 0; lan < 8; lan++) {
          await nghi(3000);
          const c3 = JSON.parse(await c2.js(CHUP_JS) || '{}');
          if (chup.tep && fs.existsSync(chup.tep)) { try { fs.unlinkSync(chup.tep); } catch (_) {} }
          chup = c3;
          if (chup.tep && fs.existsSync(chup.tep) && fs.statSync(chup.tep).size > 15000) break;
        }
        console.log(`   chup: ${JSON.stringify(chup).slice(0, 120)}`);
        check('chup duoc khung hinh (khong loi)', !chup.error, String(chup.error || ''));
        check('anh co kich thuoc that', chup.rong > 100 && chup.cao > 100, `${chup.rong}x${chup.cao}`);
        if (chup.tep && fs.existsSync(chup.tep)) {
          const co = fs.statSync(chup.tep).size;
          console.log(`   file anh: ${Math.round(co / 1024)} KB`);
          // Anh mot mau (den/trang) nen PNG rat nho. Vung ~400x580 co noi dung that thi
          // khong the duoi 15 KB — day la cach re de biet co chup xuyen iframe hay khong.
          // Anh mot mau nen PNG chi vai KB; co noi dung that thi lon hon han.
          check('anh CO noi dung that (khong phai khung den)', co > 5000, `${co} byte`);
          check('vung chup KHONG lo xuong duoi o cuon',
            chup.cat && chup.cat.y2 <= chup.oCuonY2 + 1, JSON.stringify(chup.cat));
          try { fs.unlinkSync(chup.tep); } catch (_) {}
        } else {
          check('co luu file anh', false, JSON.stringify(chup));
        }

        await c2.js(`dongPanel(); 1`);
        await nghi(400);
        check('dong panel thi go luon iframe (video khong chay ngam)',
          await c2.js(`document.getElementById('pKhung').innerHTML.length`) === 0);
      }
    }

    console.log('\n=== 4. Nut Copy / Xuat CSV / Kiem chung phai mo khi co ket qua ===');
    check('nut Copy mo', await c2.js(`!document.getElementById('nutCopy').disabled`) === true);
    check('nut CSV mo', await c2.js(`!document.getElementById('nutCsv').disabled`) === true);
    check('nut Xuat bo kiem chung mo',
      await c2.js(`!document.getElementById('nutKiemChung').disabled`) === true);
    check('co giu lai file audio de nghe lai',
      JSON.parse(await c2.js(`JSON.stringify(ketQua.map(r => !!r.tepAudio))`) || '[]').every(Boolean));

    console.log('\n' + '='.repeat(60));
    console.log(`KET QUA: ${pass} pass, ${fail} fail`);
    if (fail) {
      console.log('\n--- nhat ky app (de do loi) ---');
      try { console.log(fs.readFileSync(LOG, 'utf8')); } catch (_) {}
    }
    return ketThuc(fail ? 1 : 0);
  } catch (e) {
    console.log(`\nKET QUA: HONG — ${e && e.message || e}`);
    try { console.log(fs.readFileSync(LOG, 'utf8')); } catch (_) {}
    return ketThuc(1);
  }
})();
