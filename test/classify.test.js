// test/classify.test.js — Kiem chung LOI QUYET DINH (src/classify.cjs) bang node thuan,
// khong can Electron, khong can mang.
//
// 3 su co THAT gap trong ngay dung code nay, moi cai thanh mot muc o duoi:
//  (a) 7 ten nhan tu suy dien KHONG TON TAI trong model ('Male speech, man speaking',
//      'Female singing', 'Trap music', 'Strings'...). Ban yamnet cua MediaPipe co bo nhan
//      gon hon AudioSet goc. Ten sai thi nhom do CAM luon ma khong bao loi gi.
//  (b) Model co nhan 'Singing bowl' — CHUONG XOAY, la nhac cu. Luoi an toan bang regex
//      /singing/ cham vao no -> tu nhien sinh ra diem "hat" tu mot ban nhac khong ai hat.
//  (c) Dieu kien chay luoi an toan tung viet la "diem = 0" thay vi "khong ten nao co mat".
//      Vi goi model voi scoreThreshold=0 nen ca 521 nhan luon duoc tra ve va o cua so im
//      lang 'Singing' co diem DUNG BANG 0 -> luoi an toan chay sai luc, keo theo (b).
// Chay: node test/classify.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('../src/classify.cjs');
const { aggregate, reduceWindow } = C;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`   OK   ${label}`); }
  else { fail++; console.log(`   FAIL ${label} ${extra}`); }
}

/** Dung 1 cua so gia: mang [{categoryName, score}] gom DU 521 nhan (diem 0 cho phan con lai)
 *  — phai giong that o cho nay, vi chinh viec "nhan co mat nhung diem 0" la nguon cua bug (c). */
const VOCAB = require('../models/yamnet-labels.json').labels;
function win(scores) {
  return VOCAB.map(n => ({ categoryName: n, score: scores[n] || 0 }));
}
function rep(n, w) { return Array.from({ length: n }, () => w); }

(async () => {
  console.log('\n=== 1. MOI ten nhan trong classify.cjs phai co that trong model ===');
  {
    const V = new Set(VOCAB);
    check(`snapshot co ${VOCAB.length} nhan`, VOCAB.length === 521, String(VOCAB.length));
    for (const [g, arr] of [['SPEECH', C.SPEECH_NAMES], ['SING', C.SING_NAMES],
                            ['MUSIC', C.MUSIC_NAMES], ['QUIET', C.QUIET_NAMES], ['DENY', C.RE_DENY]]) {
      const miss = arr.filter(n => !V.has(n));
      check(`${g}: ${arr.length} ten deu ton tai`, miss.length === 0, 'THIEU: ' + miss.join(' | '));
    }
    // Khong nhom nao duoc trung nhom khac o cho vo ly: noi <-> nhac phai roi nhau.
    const overlap = C.SPEECH_NAMES.filter(n => C.MUSIC_NAMES.includes(n));
    check('SPEECH khong trung MUSIC', overlap.length === 0, overlap.join('|'));
  }

  console.log('\n=== 2. BUG THAT: "Singing bowl" (nhac cu) khong duoc tinh la HAT ===');
  {
    // Ban nhac co chuong xoay, KHONG ai hat.
    const w = reduceWindow(win({ 'Music': 0.9, 'Singing bowl': 0.8, 'Musical instrument': 0.6 }));
    check('diem hat = 0 du co "Singing bowl" 0.8', w.singing === 0, `singing=${w.singing}`);
    check('diem nhac van nhan ra', w.music >= 0.9, `music=${w.music}`);
    const r = aggregate(rep(12, win({ 'Music': 0.9, 'Singing bowl': 0.8 })));
    check('=> ket luan "Nhac", KHONG phai "Giong + nhac"', r.label === 'music', r.label);
  }

  console.log('\n=== 3. BUG THAT: nhan co mat nhung diem 0 -> khong duoc kich luoi an toan ===');
  {
    const w = reduceWindow(win({ 'Silence': 0.95 }));   // moi nhan khac = 0 nhung DEU co mat
    check('noi = 0', w.speech === 0, String(w.speech));
    check('hat = 0', w.singing === 0, String(w.singing));
    check('nhac = 0', w.music === 0, String(w.music));
    check('im lang duoc nhan ra', w.quiet >= 0.95, String(w.quiet));
  }

  console.log('\n=== 4. Bon nhan dau ra ===');
  {
    const noiChuyen = rep(15, win({ 'Speech': 0.85, 'Narration, monologue': 0.4, 'Music': 0.05 }));
    check('nguoi noi -> Giong noi', aggregate(noiChuyen).label === 'voice', aggregate(noiChuyen).label);

    const nhacThuan = rep(15, win({ 'Music': 0.92, 'Guitar': 0.5, 'Speech': 0.02 }));
    check('nhac khong loi -> Nhac', aggregate(nhacThuan).label === 'music', aggregate(nhacThuan).label);

    const hat = rep(15, win({ 'Singing': 0.7, 'Music': 0.9, 'Speech': 0.1 }));
    check('HAT -> nhan rieng "Hát"', aggregate(hat).label === 'singing', aggregate(hat).label);

    const voiceover = rep(15, win({ 'Speech': 0.7, 'Music': 0.6 }));   // khong hat = dung 0
    check('noi tren nhac nen -> Giong noi + nhac nen',
      aggregate(voiceover).label === 'voice_bgm', aggregate(voiceover).label);

    const imLang = rep(10, win({ 'Silence': 0.9 }));
    check('im lang -> Khong ro', aggregate(imLang).label === 'unknown', aggregate(imLang).label);

    const lomdom = rep(15, win({ 'Speech': 0.1, 'Music': 0.15, 'Noise': 0.6 }));
    check('on tap, khong nhom nao du manh -> Khong ro', aggregate(lomdom).label === 'unknown', aggregate(lomdom).label);
  }

  console.log('\n=== 5. THU TU XET: hat phai duoc xet TRUOC ca nhac thuan LAN giong noi ===');
  {
    // Bai hat that: nhac rat manh (100% cua so), hat co nhung diem thap hon.
    // Neu "nhac thuan" xet truoc -> moi bai hat thanh "Nhac".
    const baiHat = rep(20, win({ 'Music': 0.95, 'Singing': 0.45, 'Pop music': 0.7 }));
    check('nhac manh + co hat -> Hát (khong phai Nhac)',
      aggregate(baiHat).label === 'singing', `${aggregate(baiHat).label} (${aggregate(baiHat).reason})`);

    // Giong noi phu KIN clip (100% cua so) MA VAN co hat -> chinh nguoi do dang hat/rap,
    // khong phai noi de len mot ban nhac co loi. Van LOAI.
    // (Doi luat 2026-08-16 co mo duong cho "noi de len nhac co loi", nhung chi khi giong noi
    //  co dut quang — xem muc 8c. O day noi phu kin nen giu luat cu.)
    const noiVaHat = rep(20, win({ 'Speech': 0.85, 'Singing': 0.5, 'Music': 0.8 }));
    const r2 = aggregate(noiVaHat);
    check('noi phu KIN clip ma van co hat -> van la Hát', r2.label === 'singing', `${r2.label} (${r2.reason})`);
    check('=> bi LOAI', r2.accept === false, String(r2.accept));
  }

  console.log('\n=== 5b. BO LOC "chi lay giong nguoi noi" — co accept dung/sai ===');
  {
    const { ACCEPT, LABEL_VI } = C;
    check('du 6 nhan', Object.keys(LABEL_VI).length === 6, Object.keys(LABEL_VI).join(','));
    check('moi nhan deu co quyet dinh lay/loai',
      Object.keys(LABEL_VI).every(k => typeof ACCEPT[k] === 'boolean'), JSON.stringify(ACCEPT));

    const cases = [
      ['noi thuan',            { 'Speech': 0.9, 'Music': 0.02 },                 'voice',     true],
      ['noi + nhac nen',       { 'Speech': 0.7, 'Music': 0.6 },                 'voice_bgm', true],
      ['hat',                  { 'Singing': 0.6, 'Music': 0.9 },                 'singing',   false],
      // Rap: giong nguoi phu KIN clip + co nhac + co hat -> van LOAI. Neu bo chan tren
      // spTranBgmLoi thi rap se lot thanh "nhac nen CO LOI" va duoc LAY — sai y nguoi dung.
      ['rap (cung la LOAI)',   { 'Rapping': 0.6, 'Music': 0.9, 'Speech': 0.5 },  'singing',   false],
      ['nhac khong loi',       { 'Music': 0.95, 'Guitar': 0.6 },                 'music',     false],
      ['im lang',              { 'Silence': 0.9 },                               'unknown',   false],
    ];
    for (const [ten, scores, nhan, layDuoc] of cases) {
      const r = aggregate(rep(15, win(scores)));
      check(`${ten} -> ${nhan} / ${layDuoc ? 'LAY' : 'LOAI'}`,
        r.label === nhan && r.accept === layDuoc, `${r.label} accept=${r.accept}`);
    }
  }

  console.log('\n=== 5c. "Nhac nen KHONG LOI": nhac nen co giong hat thi phai LOAI ===');
  {
    // Nguoi noi tren mot BAI HAT (nhac nen co loi) — nghe thi van la "co nguoi noi", nhung
    // nguoi dung KHONG lay. Khong can luat rieng nao: hat xet truoc nen tu dong roi vao
    // nhan Hát. Test nay ghim dung tinh chat do.
    // Giong noi phu kin 18/18 cua so -> coi la tu hat, LOAI.
    const noiTrenBaiHat = rep(18, win({ 'Speech': 0.75, 'Singing': 0.55, 'Music': 0.9, 'Pop music': 0.6 }));
    const r = aggregate(noiTrenBaiHat);
    check('noi phu kin clip + hat -> LOAI', r.accept === false, `${r.label} accept=${r.accept}`);

    // Cung nguoi do, nhac nen KHONG loi -> LAY.
    const noiTrenNhacKhongLoi = rep(18, win({ 'Speech': 0.75, 'Music': 0.9, 'Guitar': 0.5 }));
    const r2 = aggregate(noiTrenNhacKhongLoi);
    check('noi tren nhac KHONG LOI -> LAY', r2.label === 'voice_bgm' && r2.accept === true,
      `${r2.label} accept=${r2.accept}`);
  }

  console.log('\n=== 5d. SO DO THAT tren mau that — can cu de dat nguong hat ===');
  {
    // Do 2026-08-13. Dung lai DUNG hinh dang phan bo da do, khong phai so bia ra.
    // Diem then chot: tren thu KHONG PHAI hat, YAMNet cho 'Singing' = DUNG 0.000 — nen phan
    // tach nam o 0.0x. Nguong cu 0.18/0.30 lam hat that KHONG BAO GIO thanh nhan 'Hát'.
    const nhacNen = win({ 'Music': 0.87 });

    // (a) Hat hop xuong that: 4/31 cua so co diem hat, dinh 0.738.
    const hopXuong = [
      ...rep(3, win({ 'Singing': 0.738, 'Choir': 0.5, 'Music': 0.87 })),
      ...rep(1, win({ 'Singing': 0.03, 'Music': 0.87 })),
      ...rep(27, nhacNen),
    ];
    const rA = aggregate(hopXuong);
    check('hat hop xuong (4/31 cua so, dinh 0.74) -> Hát', rA.label === 'singing', `${rA.label} (${rA.reason})`);

    // (b) Hat giong nu that: 2/10 cua so, dinh chi 0.059 — khong co cua so nao "manh",
    //     nen ca nay CHI bat duoc bang duong TI LE. Neu ai keo fSing len qua 20% la mat.
    const giongNu = [...rep(2, win({ 'Singing': 0.059, 'Music': 0.3 })), ...rep(8, win({ 'Music': 0.3 }))];
    const rB = aggregate(giongNu);
    check('hat giong nu (2/10 cua so, dinh 0.06) -> Hát', rB.label === 'singing', `${rB.label} (${rB.reason})`);

    // (c) 2 sound TikTok that: 1 cua so co diem hat nhung chi ~0.008 -> DUOI nguong 0.02.
    const tiktok = [...rep(1, win({ 'Singing': 0.008, 'Music': 0.96, 'Speech': 0.3 })),
                    ...rep(30, win({ 'Music': 0.96 }))];
    check('sound TikTok that (dinh hat 0.008) -> KHONG phai Hát',
      aggregate(tiktok).label !== 'singing', aggregate(tiktok).label);

    // (d) Nguong hat phai nam giua vung do duoc: tren nhieu 0, duoi dinh cua hat that.
    check('tSing nam trong (0.008, 0.059)', C.DEFAULTS.tSing > 0.008 && C.DEFAULTS.tSing < 0.059,
      String(C.DEFAULTS.tSing));
    check('fSing khong vuot 0.20 (khong thi mat ca hat giong nu)', C.DEFAULTS.fSing <= 0.20,
      String(C.DEFAULTS.fSing));
  }

  console.log('\n=== 5e. CA THEN CHOT: noi tren nhac nen CO LOI phai LOAI, KHONG LOI phai LAY ===');
  {
    // Da dung lai bang AUDIO THAT (giong doc that + mot ban hat that lam nen, tron o 3 muc
    // to nho): ca kho nhat — nen mo NHO nhat (muc 0.3) — chi cho 2/19 cua so co diem hat.
    // Do la ly do fSing phai la 0.06 chu khong phai 0.10: 2/19 = 10.5%, chi hon 0.10 dung
    // 0.5 diem phan tram, nen nhac nen nho hon chut nua la LOT.
    const noi = win({ 'Speech': 0.8, 'Music': 0.6 });
    const noiCoHat = win({ 'Speech': 0.8, 'Music': 0.6, 'Singing': 0.05 });

    // ⚠ DOI LUAT 2026-08-16 (theo yeu cau): "nhac nen co loi VAN LAY duoc neu khong dinh ban
    // quyen, nhung phai ghi chu de tu kiem". Truoc do ca nay bi LOAI thang.
    // O mau nay giong noi phu kin 19/19 cua so nen van roi vao Hát (nguoi do tu hat) — muon
    // ra nhan moi thi phai co doan KHONG noi, xem muc 8c.
    const nenCoLoi = [...rep(2, noiCoHat), ...rep(17, noi)];   // 2/19 — do duoc tu mau that
    const rA = aggregate(nenCoLoi);
    check('noi phu kin + nhac nen CO LOI -> van LOAI (nguoi do tu hat)',
      rA.accept === false, `${rA.label} (${rA.reason})`);

    const nenKhongLoi = rep(19, noi);
    const rB = aggregate(nenKhongLoi);
    check('noi tren nhac nen KHONG LOI -> LAY', rB.label === 'voice_bgm' && rB.accept === true,
      `${rB.label} accept=${rB.accept}`);

    // Bien an toan phia ben kia: MOT cua so don doc khong duoc phep loai oan ca sound.
    const motCuaSo = [...rep(1, noiCoHat), ...rep(18, noi)];
    check('1 cua so co hat don doc -> VAN LAY (khong loai oan)',
      aggregate(motCuaSo).accept === true, aggregate(motCuaSo).label);
    check('=> nguong dung o "can >=2 cua so" voi clip ~19 cua so',
      C.DEFAULTS.fSing * 19 > 1 && C.DEFAULTS.fSing * 19 <= 2, String(C.DEFAULTS.fSing));
  }

  console.log('\n=== 5f. BAN QUYEN: TikTok danh dau khong phai "original sound" ===');
  {
    const { quyetDinhCuoi } = C;
    // Do that 2026-08-13 tren trang embed cua TikTok:
    //     nhac catalog / co ban quyen  ->  "original": ""     (doc ra false)
    //     sound do nguoi dung tao      ->  "original": true
    // Trong musicInfos KHONG co truong nao ten "copyright"/"isCopyrighted", va chu "verified"
    // trong trang embed la chu nam trong ma JS cua trang chu khong phai du lieu cua sound.
    const noi = aggregate(rep(15, win({ 'Speech': 0.9 })));
    const nhac = aggregate(rep(15, win({ 'Music': 0.95 })));

    check('sound goc + co nguoi noi -> 1',
      quyetDinhCuoi(noi, { original: true }).tinhTrang === 1);
    check('nhac catalog du CO nguoi noi -> 0',
      quyetDinhCuoi(noi, { original: false }).tinhTrang === 0);
    check('nhac catalog -> banQuyen = true',
      quyetDinhCuoi(noi, { original: false }).banQuyen === true);
    check('ly do loai noi ro la vi ban quyen',
      /ban quyen/.test(quyetDinhCuoi(noi, { original: false }).lyDoLoai),
      quyetDinhCuoi(noi, { original: false }).lyDoLoai);

    // Tat luat thi nghe sao lay vay.
    check('tat luat ban quyen -> nhac catalog co nguoi noi lai duoc lay',
      quyetDinhCuoi(noi, { original: false }, { loaiBanQuyen: false }).tinhTrang === 1);

    // ⚠ Khong doc duoc thong tin (null) KHONG duoc coi la co ban quyen: mot lan TikTok doi
    // cau truc du lieu la ca danh sach bi loai sach ma khong ai hieu vi sao.
    check('khong doc duoc original (null) -> KHONG coi la ban quyen',
      quyetDinhCuoi(noi, { original: null }).tinhTrang === 1);
    check('thieu han meta -> KHONG coi la ban quyen', quyetDinhCuoi(noi, {}).tinhTrang === 1);

    // Ban quyen khong "cuu" duoc thu von da bi loai vi nghe ra la nhac.
    check('nhac thuan + sound goc -> van 0', quyetDinhCuoi(nhac, { original: true }).tinhTrang === 0);
  }

  console.log('\n=== 5g. NGUOI DUNG TU CHON thi thang moi luat may ===');
  {
    const { quyetDinhCuoi } = C;
    const noi = aggregate(rep(15, win({ 'Speech': 0.9 })));
    const nhac = aggregate(rep(15, win({ 'Music': 0.95 })));

    // Vi sao can duong nay: co thu may KHONG the biet — sound do la phong van hay khong, co
    // phai trich doan phim hay khong. Do 2026-08-14: nhan 'Conversation'/'Narration' cho
    // phong van THAT (2 nguoi hoi-dap) va cho doc thoai deu ~0.00, khong tach duoc. Nguoi
    // dung xem video trong mini browser roi tu quyet dinh la duong duy nhat.
    check('may cham LAY, nguoi chon LOAI -> 0',
      quyetDinhCuoi(noi, { original: true }, { nguoiDung: 0 }).tinhTrang === 0);
    check('may cham LOAI (nhac), nguoi chon LAY -> 1',
      quyetDinhCuoi(nhac, { original: true }, { nguoiDung: 1 }).tinhTrang === 1);
    check('nguoi chon thang ca luat ban quyen',
      quyetDinhCuoi(noi, { original: false }, { nguoiDung: 1 }).tinhTrang === 1);
    check('co danh dau la do nguoi chon',
      quyetDinhCuoi(noi, {}, { nguoiDung: 0 }).boiNguoiDung === true);
    check('khong ghi de thi khong danh dau', quyetDinhCuoi(noi, {}).boiNguoiDung === false);
    check('van bao la co ban quyen du nguoi chon LAY',
      quyetDinhCuoi(noi, { original: false }, { nguoiDung: 1 }).banQuyen === true);

    // undefined/null = KHONG ghi de, may cham sao thi theo vay.
    check('nguoiDung undefined -> may cham',
      quyetDinhCuoi(nhac, { original: true }, { nguoiDung: undefined }).tinhTrang === 0);
    check('nguoiDung null -> may cham',
      quyetDinhCuoi(noi, { original: false }, { nguoiDung: null }).tinhTrang === 0);
  }

  console.log('\n=== 6. Clip qua ngan / rong -> khong dam ket luan (khong nem loi) ===');
  {
    check('mang rong', aggregate([]).label === 'unknown');
    check('null', aggregate(null).label === 'unknown');
    check('1 cua so (duoi minUsable=3)', aggregate([win({ 'Speech': 0.9 })]).label === 'unknown');
    check('mang rong co ly do ro rang', /khong phan tich duoc/.test(aggregate([]).reason), aggregate([]).reason);
  }

  console.log('\n=== 7. Tin cay: ca sat sao phai THAP hon ca ro rang ===');
  {
    const roRang = aggregate(rep(20, win({ 'Speech': 0.95, 'Music': 0.01 })));
    // Sat sao: dung 35% cua so co giong noi (bang y nguong fSpeech), diem cung thap.
    const satSao = aggregate([...rep(7, win({ 'Speech': 0.30 })), ...rep(13, win({ 'Noise': 0.5 }))]);
    check('ca ro rang tin cay cao', roRang.confidence >= 0.8, String(roRang.confidence));
    check('ca sat sao tin cay thap hon', satSao.confidence < roRang.confidence,
      `${satSao.confidence} vs ${roRang.confidence}`);
    check('tin cay luon trong [0,1]', [roRang, satSao].every(r => r.confidence >= 0 && r.confidence <= 1));
  }

  console.log('\n=== 8. Nguong ghi de duoc (de sau nay hieu chinh theo du lieu that) ===');
  {
    const w = rep(15, win({ 'Music': 0.92, 'Speech': 0.30 }));
    check('nguong mac dinh: noi 0.30 >= tSpeech 0.22 -> Giong noi + nhac nen',
      aggregate(w).label === 'voice_bgm', aggregate(w).label);
    check('keo tSpeech len 0.5 -> chi con Nhac',
      aggregate(w, { tSpeech: 0.5 }).label === 'music', aggregate(w, { tSpeech: 0.5 }).label);

    // Nguong hat la nut chinh de hieu chinh khi chay du lieu that: bi loai oan nhieu qua
    // thi keo fSing len, con lot nhieu bai hat qua thi ha xuong.
    const hatIt = rep(20, win({ 'Speech': 0.8, 'Music': 0.7 }));
    check('khong co hat -> LAY', aggregate(hatIt).accept === true, aggregate(hatIt).label);
    // Dung diem hat THAP (0.10) de chi thu duong TI LE, khong cham duong dinh sMaxSing.
    // KHONG cho nhac vao mau nay: co nhac thi no roi sang nhan "nhac nen CO LOI" (luat moi),
    // ma o day dang thu rieng duong TI LE cua nguong hat.
    const hoiHat = [...rep(2, win({ 'Singing': 0.10 })), ...rep(38, win({ 'Speech': 0.8 }))];
    check('hat 5% < fSing 6% -> van LAY', aggregate(hoiHat).accept === true, aggregate(hoiHat).label);
    check('ha fSing xuong 0.04 -> thanh LOAI',
      aggregate(hoiHat, { fSing: 0.04 }).label === 'singing', aggregate(hoiHat, { fSing: 0.04 }).label);

    // ⚠ CA THAT 2026-08-14 — original-sound-7111801707792763674 (giong Hindi noi chuyen):
    // 12 cua so, DUNG MOT cua so co diem hat 0.043, 11 cua so con lai = 0.000. Vay ma bi
    // goi la "Hát" va LOAI OAN du noi 92%, chi vi 1/12 = 8.3% > fSing 6%.
    // Luat phai doi CA ti le LAN so cua so (minSingWin), khong thi clip cang NGAN cang de
    // bi loai oan — dieu tra nguoc han y do.
    const motCuaSo = [...rep(1, win({ 'Singing': 0.043, 'Speech': 0.148 })),
                      ...rep(11, win({ 'Speech': 0.95 }))];
    const kqMot = aggregate(motCuaSo);
    check('MOT cua so hat le te (clip ngan) -> KHONG bi goi la Hat',
      kqMot.label === 'voice', `${kqMot.label} (${kqMot.reason})`);
    check('  ... va van duoc LAY', kqMot.accept === true);
    check('  ... ke ca khi ha fSing xuong 0.01 (so cua so van khong du)',
      aggregate(motCuaSo, { fSing: 0.01 }).label === 'voice');
    check('HAI cua so hat thi bat binh thuong',
      aggregate([...rep(2, win({ 'Singing': 0.05 })), ...rep(10, win({ 'Speech': 0.95 }))]).label === 'singing');
    // Duong dinh van chay doc lap: mot cua so hat RAT manh van du ket luan.
    check('mot cua so hat rat manh (0.41 >= sMaxSing 0.30) -> van la Hat',
      aggregate([...rep(1, win({ 'Singing': 0.41 })), ...rep(5, win({ 'Speech': 0.9 }))]).label === 'singing');
    check('  ... nhung 0.059 (muc nhieu do duoc tren sound noi) thi khong',
      aggregate([...rep(1, win({ 'Singing': 0.059 })), ...rep(5, win({ 'Speech': 0.9 }))]).label === 'voice');
    check('stats co so cua so hat de giai thich',
      aggregate(motCuaSo).stats.singWindows === 1, String(aggregate(motCuaSo).stats.singWindows));
  }

  console.log('\n=== 8b. "KHONG CHAC — nen kiem tay" ===');
  {
    const { ghiChuKhongChac, quyetDinhCuoi } = require('../src/classify.cjs');
    const kc = (label, stats, accept = true) => ghiChuKhongChac({ label, accept, stats });

    // Ca nguoi dung ke: "dung nghe nhac to qua ma danh la Loai — no la voice NOI ghep nhac,
    // khong phai voice DANG HAT". Nhac lan giong ma van con giong noi -> phai ghi chu.
    const a = kc('music', { speechFrac: 0.30, musicFrac: 0.90, singFrac: 0, usableWindows: 20 }, false);
    check('nhac at giong ma van con giong noi -> ghi chu', a.chacChan === false, JSON.stringify(a.ghiChu));
    check('  ... noi ro la co the giong noi ghep nhac',
      a.ghiChu.some(x => /ghép nhạc/.test(x)), JSON.stringify(a.ghiChu));

    // Nhac thuan, khong con chut giong nao -> ro rang, KHONG duoc ghi chu.
    check('nhac thuan (khong co giong) -> khong ghi chu',
      kc('music', { speechFrac: 0.02, musicFrac: 0.95, singFrac: 0, usableWindows: 30 }, false).chacChan === true);

    // Ranh gioi noi/hat.
    const b = kc('singing', { speechFrac: 0.60, musicFrac: 0.20, singFrac: 0.10, singWindows: 5, usableWindows: 50 }, false);
    check('hat ma noi nhieu -> ghi chu ranh gioi noi/hat',
      b.ghiChu.some(x => /ranh giới nói\/hát/.test(x)), JSON.stringify(b.ghiChu));
    check('hat ro rang (khong noi) -> khong ghi chu',
      kc('singing', { speechFrac: 0, musicFrac: 0.9, singFrac: 0.5, singWindows: 20, usableWindows: 40 }, false).chacChan === true);

    // Ben LAY cung phai duoc ghi chu — nguoi dung yeu cau ca hai chieu.
    const c = kc('voice', { speechFrac: 0.90, musicFrac: 0, singFrac: 0.09, singWindows: 1, singMax: 0.043, usableWindows: 11 });
    check('LAY ma con 1 cua so nghi hat -> ghi chu', c.chacChan === false, JSON.stringify(c.ghiChu));
    check('LAY sach hoan toan -> khong ghi chu',
      kc('voice', { speechFrac: 0.95, musicFrac: 0, singFrac: 0, singWindows: 0, usableWindows: 30 }).chacChan === true);
    // 1 cua so le trong clip DAI thi la nhieu, khong phai dau hieu -> khong lam phien.
    check('1 cua so hat trong 58 cua so -> KHONG ghi chu (nhieu)',
      kc('voice', { speechFrac: 0.98, musicFrac: 0, singFrac: 0.017, singWindows: 1, singMax: 0.03, usableWindows: 58 }).chacChan === true);

    check('clip qua ngan -> ghi chu',
      kc('voice', { speechFrac: 0.9, musicFrac: 0, singFrac: 0, usableWindows: 4 }).chacChan === false);

    // ⚠ CA THAT bat duoc khi chup man hinh 2026-08-14: mot sound cho hat 5.7% — duoi nguong
    // 6% dung mot chut — nen ra "Giọng nói · LẤY" khong mot loi canh bao, trong khi lan chay
    // truoc chinh no ra "Hát · LOẠI". Nam sat vach thi phai bao.
    const e = kc('voice', { speechFrac: 0.66, musicFrac: 0.30, singFrac: 0.057, singWindows: 3, usableWindows: 53 });
    check('diem hat sat nguong (5.7% vs 6%) -> ghi chu', e.chacChan === false, JSON.stringify(e.ghiChu));
    check('  ... noi ro la co the lat', e.ghiChu.some(x => /có thể lật/.test(x)), JSON.stringify(e.ghiChu));
    check('hat 1% (xa nguong) -> khong ghi chu',
      kc('voice', { speechFrac: 0.9, musicFrac: 0, singFrac: 0.01, singWindows: 0, usableWindows: 50 }).chacChan === true);
    const f = kc('voice', { speechFrac: 0.37, musicFrac: 0.10, singFrac: 0, usableWindows: 40 });
    check('ti le noi sat nguong (37% vs 35%) -> ghi chu', f.chacChan === false, JSON.stringify(f.ghiChu));
    check('ti le noi 90% (xa nguong) -> khong ghi chu',
      kc('voice', { speechFrac: 0.90, musicFrac: 0, singFrac: 0, usableWindows: 40 }).chacChan === true);

    // So giong noi chi la GHI CHU, TUYET DOI khong duoc doi ket qua lay/loai.
    const d1 = quyetDinhCuoi({ accept: true, label: 'voice', labelVi: 'Giọng nói',
      stats: { speechFrac: 0.9, musicFrac: 0, singFrac: 0, usableWindows: 30 } }, {});
    const d2 = quyetDinhCuoi({ accept: true, label: 'voice', labelVi: 'Giọng nói',
      stats: { speechFrac: 0.9, musicFrac: 0, singFrac: 0, usableWindows: 30 } }, { soGiongNoi: 2 });
    check('2 giong noi -> co ghi chu', d2.chacChan === false && d2.ghiChu.some(x => /2 giọng/.test(x)));
    check('2 giong noi -> VAN LAY (khong duoc dung de loai)', d2.lay === true && d2.tinhTrang === 1);
    check('1 giong noi -> khong ghi chu gi', d1.chacChan === true);

    // quyetDinhCuoi phai luon kem hai truong nay de giao dien khoi phai tu doan.
    check('quyetDinhCuoi luon tra chacChan + ghiChu',
      typeof d1.chacChan === 'boolean' && Array.isArray(d1.ghiChu));
  }

  console.log('\n=== 8d. SUY LUAN — ghi vet dung duong di cua quyet dinh ===');
  {
    const w = (o) => ({ speech: 0, singing: 0, music: 0, quiet: 0, top: 'x', ...o });
    const rep = (n, x) => Array.from({ length: n }, () => x);
    const r = aggregate(rep(20, w({ speech: 0.9 })));
    check('co mang suy luan', Array.isArray(r.suyLuan) && r.suyLuan.length >= 3, JSON.stringify(r.suyLuan));
    check('buoc dau la doc audio', /Nghe audio/.test(r.suyLuan[0].ten), r.suyLuan[0].ten);
    check('buoc cuoi la chot nhan', /Chốt nhãn/.test(r.suyLuan[r.suyLuan.length - 1].ten));
    // ⚠ Vet phai KHOP voi ket qua that. Ghi tai cho (trong luc luat chay) chinh la de bao dam
    // dieu nay — neu ke lai bang mot ham rieng thi sua luat ma quen sua loi ke la lech ngay.
    check('nhan trong vet KHOP voi nhan tra ve',
      r.suyLuan[r.suyLuan.length - 1].ket === r.labelVi, r.suyLuan[r.suyLuan.length - 1].ket);

    const rHat = aggregate([...rep(4, w({ singing: 0.3, music: 0.9 })), ...rep(8, w({ music: 0.9 }))]);
    check('clip co hat -> co buoc "Xét HÁT trước"', rHat.suyLuan.some(x => /Xét HÁT/.test(x.ten)));
    check('  ... va buoc "Ai đang hát"', rHat.suyLuan.some(x => /Ai đang hát/.test(x.ten)));
    const rNgan = aggregate(rep(2, w({ speech: 0.9 })));
    check('dung som van co vet', rNgan.label === 'unknown' && rNgan.suyLuan.some(x => /Dừng sớm/.test(x.ten)));
  }

  console.log('\n=== 8e. HAI LUOT — cham nua dau / nua sau roi doi chieu ===');
  {
    const { chamHaiLuot, quyetDinhCuoi } = require('../src/classify.cjs');
    const w = (o) => ({ speech: 0, singing: 0, music: 0, quiet: 0, top: 'x', ...o });
    const rep = (n, x) => Array.from({ length: n }, () => x);

    // ⚠ Chay model 2 lan tren CUNG doan audio la vo nghia (YAMNet tat dinh). Luot 2 phai
    // nghe DOAN KHAC. Do that tren 40 sound: 25% cho nhan khac nhau giua hai nua, 18% lat
    // han LAY/LOAI — nen day la tin hieu that, khong phai thu tam.
    const lech = [...rep(10, w({ speech: 0.9 })), ...rep(10, w({ music: 0.9 }))];
    const h = chamHaiLuot(lech);
    check('hai nua khac nhau -> bao khong khop', h.khop === false, JSON.stringify(h));
    check('  ... va bao doi ca LAY/LOAI', h.doiKetQua === true, JSON.stringify(h));
    check('  ... co ten nhan cua tung nua', !!h.nhan1 && !!h.nhan2 && h.nhan1 !== h.nhan2);

    const deu = rep(20, w({ speech: 0.9 }));
    check('clip dong deu -> hai luot khop', chamHaiLuot(deu).khop === true);
    check('clip qua ngan -> khong cham hai luot (tra null)', chamHaiLuot(rep(6, w({ speech: 0.9 }))) === null);

    const kq = aggregate(lech); kq.haiLuot = chamHaiLuot(lech);
    const q = quyetDinhCuoi(kq, {});
    check('hai luot lech -> co ghi chu', q.chacChan === false && q.ghiChu.some(x => /2 lượt/.test(x)),
      JSON.stringify(q.ghiChu));
    const kq2 = aggregate(deu); kq2.haiLuot = chamHaiLuot(deu);
    check('hai luot khop -> khong ghi chu gi ve hai luot',
      !quyetDinhCuoi(kq2, {}).ghiChu.some(x => /2 lượt/.test(x)));
  }

  console.log('\n=== 8f. HOC TU LOI — nho nhung lan nguoi dung sua nguoc y may ===');
  {
    const { dacTrung, khoangCachDT, timCaDaSua, NGUONG_GIONG, quyetDinhCuoi } = require('../src/classify.cjs');
    const w = (o) => ({ speech: 0, singing: 0, music: 0, quiet: 0, top: 'x', ...o });
    const rep = (n, x) => Array.from({ length: n }, () => x);
    const A = aggregate(rep(20, w({ speech: 0.9 })));

    check('van tay co 5 con so', dacTrung(A).length === 5);
    check('van tay deu trong 0..1', dacTrung(A).every(v => v >= 0 && v <= 1), JSON.stringify(dacTrung(A)));
    check('khoang cach voi chinh no = 0', khoangCachDT(dacTrung(A), dacTrung(A)) === 0);
    check('dau vao hong -> khoang cach vo cuc', khoangCachDT(null, dacTrung(A)) === Infinity);

    // ⚠ Nguong 0.10 la SO DO DUOC tren 46 sound that (cap CUNG nhan trung vi 0.103; cap
    // KHAC nhan thap nhat 0.173 — hai vung tach roi). Ghim lai de khong ai chinh bua.
    check('nguong giong nam trong khoang do duoc', NGUONG_GIONG > 0.05 && NGUONG_GIONG < 0.17,
      String(NGUONG_GIONG));

    // Dat ca cu o vung CHI CANH BAO (0.05 < kc <= 0.10). Vung trung khit (tu sua) do muc 8g lo.
    const dtGan = dacTrung(A).slice(); dtGan[1] += 0.12;
    const kho = [{ khoa: 'link-A', ten: 'ca cu', mayCham: A.label, banCham: 0, dacTrung: dtGan }];
    check('sound gan giong -> tim thay', timCaDaSua(A, kho).length === 1,
      JSON.stringify(timCaDaSua(A, kho).map(x => x.kc)));
    check('may cham nhan KHAC -> khong doi chieu', timCaDaSua({ ...A, label: 'music' }, kho).length === 0);
    const B = aggregate([...rep(6, w({ singing: 0.5, music: 0.9 })), ...rep(6, w({ music: 0.9 }))]);
    check('sound khac han -> khong tim thay', timCaDaSua(B, kho).length === 0);
    check('kho rong -> khong nem loi', timCaDaSua(A, []).length === 0 && timCaDaSua(A, null).length === 0);

    const q = quyetDinhCuoi(A, { caDaSua: timCaDaSua(A, kho) });
    check('co ghi chu nhac lai ca da sua', q.ghiChu.some(x => /đã sửa tay/.test(x)), JSON.stringify(q.ghiChu));
    // ⚠ O vung nay (chi GAN giong) thi KHONG duoc tu lat — vi do tren 46 sound that con 2%
    // cap khac nhan lot vao. Chi vung <= 0.05 moi du sach de tu sua (xem muc 8g).
    check('vung gan giong -> KHONG tu lat, chi bao', q.lay === A.accept && !q.boiHoc,
      `may=${A.accept} sau=${q.lay} boiHoc=${!!q.boiHoc}`);
  }


  console.log('\n=== 8g. TU SUA theo ca da day (tranh lap lai dung cai sai cu) ===');
  {
    const { dacTrung, timCaDaSua, NGUONG_TU_SUA, NGUONG_GIONG, quyetDinhCuoi } = require('../src/classify.cjs');
    const w = (o) => ({ speech: 0, singing: 0, music: 0, quiet: 0, top: 'x', ...o });
    const rep = (n, x) => Array.from({ length: n }, () => x);
    const A = aggregate(rep(20, w({ speech: 0.9 })));      // may cham: Giọng nói -> LAY

    // ⚠ Hai nguong KHAC NHAU va deu do duoc tren 46 sound that:
    //     0.05 (tu sua)   -> 0% cap khac nhan lot  -> du sach de SUA
    //     0.10 (canh bao) -> 2% lot                -> chi du de BAO
    check('nguong tu sua CHAT hon nguong canh bao', NGUONG_TU_SUA < NGUONG_GIONG,
      `${NGUONG_TU_SUA} vs ${NGUONG_GIONG}`);

    const kho = [{ khoa: 'link-cu', ten: 'CA DA DAY', mayCham: A.label, banCham: 0, dacTrung: dacTrung(A) }];
    const q = quyetDinhCuoi(A, { caDaSua: timCaDaSua(A, kho) });
    check('ca trung khit -> TU SUA theo y ban', q.lay === false && q.boiHoc === true,
      `lay=${q.lay} boiHoc=${q.boiHoc}`);
    check('  ... va noi ro vua tu sua (khong sua am tham)',
      q.ghiChu.some(x => /TỰ SỬA/.test(x)), JSON.stringify(q.ghiChu));
    check('  ... kem ten ca da day + khoang cach', !!q.caDay && typeof q.caDay.kc === 'number');

    // Ca chi GAN giong (0.05 < kc <= 0.10) thi CHI CANH BAO, khong duoc tu sua.
    const dtGan = dacTrung(A).slice(); dtGan[1] += 0.12;    // lech vua du de vuot 0.05
    const khoGan = [{ khoa: 'link-gan', ten: 'CA GAN GIONG', mayCham: A.label, banCham: 0, dacTrung: dtGan }];
    const qGan = quyetDinhCuoi(A, { caDaSua: timCaDaSua(A, khoGan) });
    check('ca chi GAN giong -> KHONG tu sua, chi canh bao',
      qGan.lay === A.accept && !qGan.boiHoc && qGan.ghiChu.some(x => /đã sửa tay/.test(x)),
      `lay=${qGan.lay} boiHoc=${!!qGan.boiHoc} ${JSON.stringify(qGan.ghiChu)}`);

    // Tat cong tac hoc thi tro ve luat may.
    const qTat = quyetDinhCuoi(A, { caDaSua: timCaDaSua(A, kho) }, { hocTuSua: false });
    check('tat "tu sua theo ca da day" -> tro ve luat may', qTat.lay === A.accept && !qTat.boiHoc);

    // ⚠ Nguoi dung bam tay CHO CHINH LINK NAY phai THANG ca kho hoc.
    const qTay = quyetDinhCuoi(A, { caDaSua: timCaDaSua(A, kho) }, { nguoiDung: 1 });
    check('ban bam tay cho link nay -> thang kho hoc',
      qTay.lay === true && qTay.boiNguoiDung === true && !qTay.boiHoc);

    // Ca da day mà TRUNG y may thi khong co gi de sua.
    const khoTrung = [{ khoa: 'link-x', ten: 'CA TRUNG Y', mayCham: A.label, banCham: 1, dacTrung: dacTrung(A) }];
    check('ca da day trung y may -> khong tu sua',
      !quyetDinhCuoi(A, { caDaSua: timCaDaSua(A, khoTrung) }).boiHoc);
  }
  console.log('\n=== 8h. TAI KHOAN CO TICH XANH -> LOAI ===');
  {
    const { quyetDinhCuoi } = require('../src/classify.cjs');
    const w = (o) => ({ speech: 0, singing: 0, music: 0, quiet: 0, top: 'x', ...o });
    const rep = (n, x) => Array.from({ length: n }, () => x);
    const A = aggregate([...rep(10, w({ speech: 0.8, music: 0.8 })), ...rep(10, w({ music: 0.8 }))]);
    const meta = (v, laChu) => ({
      original: true, laChuSound: laChu,
      tacGia: { uniqueId: 'lufthansa', nickName: 'Lufthansa', verified: v },
    });

    check('may tu cham la LAY (de thay luat tich xanh moi la thu lat)', A.accept === true, A.label);

    // ⚠ LOI THAT 2026-08-19: truong `verified` duoc doc va HIEN ra trong panel nhung KHONG
    // he dung de loai -> sound "original sound — Lufthansa" cua @lufthansa (tich xanh) van
    // duoc LAY. Yeu cau tu dau da ghi: "sound co tich xanh thi auto la Loai".
    // `banQuyen` khong bat duoc vi no chi doc original === false (nhac catalog); tai khoan
    // tich xanh dang "original sound" cua chinh ho thi original === true -> lot het.
    const q = quyetDinhCuoi(A, meta(true, true));
    check('chu sound co tich xanh -> LOAI', q.lay === false && q.tinhTrang === 0, `lay=${q.lay}`);
    check('  ... co co tichXanh de giao dien hien', q.tichXanh === true);
    check('  ... ly do noi ro la tich xanh', /TICH XANH/i.test(q.lyDoLoai), q.lyDoLoai);

    check('chu sound KHONG tich xanh -> van LAY', quyetDinhCuoi(A, meta(false, true)).lay === true);

    // ⚠ Chi xet khi la CHU SOUND. Nguoi noi tieng DUNG sound cua nguoi khac thi khong duoc
    // keo ca sound do xuong theo.
    check('tich xanh nhung KHONG phai chu sound -> van LAY',
      quyetDinhCuoi(A, meta(true, false)).lay === true);

    // ⚠ null = KHONG DOC DUOC, khong duoc coi la co tich. Neu khong, mot lan TikTok doi cau
    // truc du lieu la loai sach ca danh sach ma khong ai hieu vi sao.
    check('khong doc duoc tich xanh (null) -> van LAY',
      quyetDinhCuoi(A, meta(null, true)).lay === true);
    check('thieu ca truong tacGia -> van LAY',
      quyetDinhCuoi(A, { original: true, laChuSound: true }).lay === true);

    // Tich xanh di cung cong tac "Loai nhac co ban quyen" — tat cong tac thi tha.
    check('tat o "Loai nhac co ban quyen" -> tha ca tich xanh',
      quyetDinhCuoi(A, meta(true, true), { loaiBanQuyen: false }).lay === true);

    // Nguoi dung bam tay van THANG moi luat.
    check('ban bam tay LAY -> thang luat tich xanh',
      quyetDinhCuoi(A, meta(true, true), { nguoiDung: 1 }).lay === true);
  }
  console.log('\n=== 9. stats phai du de GIAI THICH ket qua cho nguoi dung ===');
  {
    const r = aggregate(rep(15, win({ 'Music': 0.9, 'Techno': 0.8, 'Speech': 0.02 })));
    check('co ti le tung nhom', typeof r.stats.musicFrac === 'number' && r.stats.musicFrac === 1);
    check('co nhan hay gap de bao "no la nhac gi"', r.stats.topLabels.length > 0
      && r.stats.topLabels[0].name === 'Music', JSON.stringify(r.stats.topLabels[0]));
    check('co so cua so da dung', r.stats.usableWindows === 15, String(r.stats.usableWindows));
    check('reason doc duoc bang tieng Viet', /noi .* hat .* nhac/.test(r.reason), r.reason);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`KET QUA: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})();
