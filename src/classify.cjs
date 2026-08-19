// src/classify.cjs — LOI QUYET DINH: doi tu 521 diem so cua YAMNet ra 5 nhan tieng Viet
// va mot co LAY/LOAI cho bo loc "chi lay giong nguoi noi".
//
// YAMNet chay tren TUNG CUA SO ~0.975 giay va la model DA NHAN (multi-label): moi cua so
// tra ve 521 diem doc lap nhau, KHONG cong lai bang 1. Nghia la "Speech" 0.8 va "Music" 0.8
// cung luc la chuyen binh thuong — va do chinh la ca ta quan tam nhat (voiceover tren beat).
//
// VI SAO KHONG LAY TOP-1 CUA CA BAI: sound TikTok gan nhu luon pha tron. Lay nhan cao nhat
// cua toan clip se cho ra ket qua nhay tung phat theo 1-2 giay on nhat. Nen cach lam la:
//   1) moi cua so -> 3 diem gop: co giong noi / co hat / co nhac,
//   2) dem TI LE cua so co tung thu (chu KHONG lay diem trung binh — trung binh bi mot doan
//      im lang keo tuot xuong),
//   3) tu 3 ti le do moi ra nhan.
//
// HAT LA MOT NHAN RIENG (doi 2026-08-13): ban dau hat bi gop vao "giong + nhac", nhung bo
// loc that cua nguoi dung cat dung giua hai thu do — nguoi NOI thi lay, nguoi HAT thi loai.
'use strict';

// ── Ten nhan trong bo AudioSet (dung y nguyen chuoi YAMNet tra ve) ────────────────────
// Doi chieu bang TEN chu khong bang CHI SO. Ly do do duoc bang thuc nghiem (2026-08-13):
// MediaPipe tra ve mang categories DA SAP THEO DIEM, nen "chi so" khong he la chi so lop
// cua AudioSet — file nhac gia cho 'Music' o vi tri 0 va 'Speech' o vi tri 260. Bam theo
// chi so la sai ngay tu dau.
//
// ⚠ MOI TEN DUOI DAY DA DOI CHIEU voi 521 nhan model THAT SU tra ve (xem --dump-labels).
// Ban yamnet cua MediaPipe co BO NHAN GON HON ban AudioSet goc: KHONG co 'Male speech,
// man speaking' / 'Female speech, woman speaking' / 'Male singing' / 'Female singing'
// (7 ten tu suy dien ban dau bi tach ra het). Nen dung tu suy ten — do lai bang
// `check.cmd --json --dump-labels <file>` neu doi model.
const SPEECH_NAMES = [
  'Speech',
  'Child speech, kid speaking',
  'Conversation',
  'Narration, monologue',
  'Speech synthesizer',
  'Whispering',
  // CO Y KHONG LAY 'Hubbub, speech noise, speech babble': do la tieng nguoi lao xao lam
  // NEN (quan an, cho, dam dong), khong phai ai dang noi voi nguoi nghe. Lay vao thi moi
  // clip quay ngoai duong deu bi goi la "Giong noi". Neu that su co nguoi noi thi 'Speech'
  // van bat duoc — nen bo cai nay KHONG mat gi.
];
const SING_NAMES = [
  'Singing',
  'Child singing',
  'Synthetic singing',
  'Choir',
  'Chant',
  'Mantra',
  'Yodeling',
  'Rapping',
  'Humming',
  'Beatboxing',
  'Vocal music',   // nhac CO giong hat — dung la "giong + nhac", tin hieu rat dat
];
// 'Music' la nhan CHA — YAMNet gan nhu luon ban nhan cha nay khi co bat ky thu nhac nao,
// nen no la tin hieu chinh. Vai nhan duoi la de do khi nhan cha yeu bat thuong.
const MUSIC_NAMES = [
  'Music',
  'Musical instrument',
  'Plucked string instrument',
  'Guitar',
  'Piano',
  'Keyboard (musical)',
  'Drum kit',
  'Drum machine',
  'Percussion',
  'Bass drum',
  'Snare drum',
  'Hi-hat',
  'Synthesizer',
  'Electronic music',
  'Hip hop music',
  'Pop music',
  'Rock music',
  'Dance music',
  'Electronic dance music',
  'Techno',
  'House music',
  'Rhythm and blues',
  'Reggae',
  'Country',
  'Classical music',
  'Orchestra',
  'Violin, fiddle',
  'Brass instrument',
  'Wind instrument, woodwind instrument',
  'Bowed string instrument',
  'Harp',
  'Accordion',
  'Ukulele',
  'Banjo',
  'Sampler',
  'Beatboxing',
  'Song',
  'Theme music',
  'Background music',
  'Soundtrack music',
  'Jingle (music)',
  'Vocal music',
  'String section',
  'Trance music',
  'Soul music',
  'Folk music',
  'Ambient music',
  'Video game music',
];
const QUIET_NAMES = ['Silence'];

// ⚠ DA THU VA BO: nhan 'Speech synthesizer' KHONG dung de bat giong AI doi nay.
// Do 2026-08-14 tren mot sound TikTok giong AI that (tai khoan dong vai nhan vat hoat hinh):
//     sound AI that      : TB 0.000 / dinh 0.000  — 0% cua so vuot 0.1
//     Windows TTS cu     : TB 0.122 / dinh 0.262  — 74% cua so vuot 0.1
//     phong van nguoi ×2 : TB 0.001-0.010
// Tuc no chi bat duoc giong MAY DOC KIEU CU. Giong AI hien dai (ElevenLabs...) cho DUNG
// 0.000, khong khac gi nguoi that. Hop ly thoi: model tu 2019, con TTS bay gio duoc huan
// luyen de nghe KHONG khac nguoi. Muon bat that thi phai co model chong gia mao giong noi
// (anti-spoofing) rieng — bai toan khac han.

// ⚠ DA THU VA BO: nhan 'Conversation' va 'Narration, monologue' KHONG dung de doan duoc
// "phong van" (nhieu nguoi doi thoai) hay "mot nguoi noi". Do 2026-08-14 tren 2 ban ghi
// PHONG VAN THAT (2 nguoi hoi-dap) va 1 ban doc thoai:
//     phong van #1: Conversation TB 0.002 / dinh 0.06 | Narration TB 0.014 / dinh 0.08
//     phong van #2: Conversation TB 0.000 / dinh 0.00 | Narration TB 0.007 / dinh 0.03
//     doc thoai   : Conversation TB 0.000 / dinh 0.00 | Narration TB 0.002 / dinh 0.01
// KHONG cua so nao vuot 0.1 o ca ba. Hai nhan nay coi nhu CHET trong ban model nay, va
// phong van cho so y het doc thoai. Muon phan biet that thi phai DEM SO NGUOI NOI (speaker
// diarization) — mot bai toan khac han, can them model rieng.

// Luoi an toan: neu ten nhan co xe xich (doi ban model, doi cach viet), van bat duoc nhung
// nhan quan trong nhat bang mau chu. CHI chay khi KHONG ten nao trong danh sach tren co mat.
const SPEECH_RE = /\b(speech|speaking|conversation|monologue|narration|whisper)\b/i;
const SING_RE = /\b(singing|choir|chant|rapping|humming|yodel)\b/i;
const MUSIC_RE = /\b(music|musical|instrument|guitar|piano|drum|synthes|percussion|orchestra)\b/i;

// ⚠ BAY THAT trong bo nhan (do duoc 2026-08-13): co nhan 'Singing bowl' — CHUONG XOAY, mot
// NHAC CU, khong lien quan gi den hat; va 'Bird vocalization, bird call, bird song'. Ca hai
// deu khop /singing|song/ nen luoi an toan o tren se cham vao neu khong chan. Tuong tu
// 'Hubbub, speech noise...' khop /speech/. Danh sach chan nay chi ap cho luoi an toan.
const RE_DENY = [
  'Singing bowl',
  'Bird vocalization, bird call, bird song',
  'Whale vocalization',
  'Hubbub, speech noise, speech babble',
];

const DEFAULTS = {
  // Nguong "co mat" trong 1 cua so. Day la nguong PHAT HIEN CO, khong phai nguong chac chan
  // — nen de thap hon cam giac truc quan. Nhac that thuong cho 'Music' 0.7-0.95; noi that
  // cho 'Speech' 0.6-0.95; nen 0.20-0.30 la vung an toan de noi "co thu nay trong cua so".
  tSpeech: 0.22,
  // ⚠ NGUONG HAT THAP HON HAN 2 CAI KIA — day la so DO DUOC, khong phai uoc luong.
  // Do 2026-08-13 tren 7 mau (2 ban hat that, 3 mau nhan tao, 2 sound TikTok that):
  //     hat hop xuong that : 4/31 cua so > 0.02   (max 0.738)
  //     hat giong nu that  : 2/10 cua so > 0.02   (max 0.059)
  //     tieng noi          : 0/19  — dung 0.000 o MOI cua so
  //     noi + nhac nen     : 0/19  — dung 0.000
  //     nhac khong loi     : 0/13  — dung 0.000
  //     2 sound TikTok that: 0/42  — max 0.008
  // Nhan 'Singing' cua YAMNet ban ra rat DE DAT: ngay ca hat that no cung chi cho diem thap
  // o phan lon cua so. NHUNG bu lai, tren thu KHONG PHAI hat thi no cho dung 0.000. Nghia la
  // moi diem khac 0 deu dang gia — phan tach nam o 0.0x chu khong phai 0.2.
  // Nguong cu (0.18/0.30) khien hat that KHONG BAO GIO duoc gan nhan 'Hát': ban hop xuong
  // that bi goi la "Nhạc". Voi bo loc thi ket qua cuoi van la LOAI nen khong lo ra, nhung
  // ca NGUY HIEM thi lo: nguoi NOI tren mot ban nhac CO LOI se lot thanh "LAY".
  tSing: 0.02,
  tMusic: 0.25,
  tQuiet: 0.45,       // cua so bi 'Silence' vuot muc nay thi khong dem vao mau
  // Ti le cua so can dat de ket luan.
  // fSing 0.06 = "can it nhat 2 cua so co hat" voi clip 19-31 cua so (do dai thuong gap).
  // Chon con so nay de dat DUNG giua hai rui ro, ca hai deu do duoc chu khong phai doan:
  //   • Phai bat duoc ca KHO NHAT da dung lai bang audio that: nguoi noi tren nhac nen CO
  //     LOI mo nho (nen o muc 0.3) chi cho 2/19 cua so co hat = 11%. Nguong 0.10 chi hon
  //     no 1 diem phan tram — nhac nen nho hon chut nua la LOT vao danh sach LAY.
  //   • Nhung KHONG duoc de MOT cua so nhieu lam loai oan: 1/19 = 5.3% < 6% nen mot cua so
  //     don doc khong du. (Do tren 93 cua so cua toan bo mau KHONG hat — noi, noi+nhac khong
  //     loi, nhac, 2 sound TikTok that — chua tung thay cua so nao vuot 0.02. Nhung van chua
  //     du du lieu de tin tuyet doi, nen giu bien an toan 1 cua so.)
  fSing: 0.06,
  // ⚠ Di KEM fSing, khong thay the. fSing la ti le nen voi clip NGAN no tu noi long ra:
  // clip 12 cua so thi 1 cua so da = 8.3% > 6%. minSingWin ep dung y da viet o tren —
  // "mot cua so don doc khong du" — bat ke clip dai bao nhieu.
  // Do lai tren 2 ban HAT THAT dung de hieu chinh: ban #1 co 4 cua so vuot, ban #2 co 2 —
  // ca hai deu >= 2 nen van bat duoc.
  minSingWin: 2,
  // Tran ti le noi cho nhan "giong noi + nhac nen CO LOI" (xem cho dung no de biet vi sao).
  // 0.85: duoi nguong nay la "co nguoi noi VA co doan khong noi" — dang noi de len nhac;
  // tu 0.85 tro len la giong nguoi phu kin clip, ma van co tieng hat -> chinh nguoi do hat/rap.
  spTranBgmLoi: 0.85,
  // Duong thu HAI de bat hat: chi can MOT cua so co diem hat that cao. Bat duoc ca clip chi
  // hat vai giay (ti le thap nhung ro rang la co hat) — dung y nguoi dung: sound co giong
  // hat thi khong dung duoc, du hat it.
  // Do lai tren 46 sound that (2026-08-14) thay ro hai vung TACH HAN NHAU:
  //   • sound KHONG hat: dinh cao nhat chi 0.059 (va deu chi 1-2 cua so le te);
  //   • ban nhac slow "обоюдно" (clip ngan 6 cua so, 1 cua so): dinh 0.414.
  // Giua 0.059 va 0.414 KHONG co mau nao — nen dat nguong vao giua khoang trong do.
  // 0.30 la ~5 lan tren muc nhieu cao nhat do duoc, va van bat duoc ca 0.414.
  // (Truoc day de 0.45 nen ca do lot luoi khi them minSingWin.)
  sMaxSing: 0.30,
  fSpeech: 0.35,
  fMusic: 0.40,       // co nhac kem giong
  fMusicOnly: 0.50,   // nhac thuan
  minUsable: 3,       // duoi 3 cua so dung duoc (~3 giay) thi khong dam ket luan
  minUsableFrac: 0.20,
};

// ── 5 NHAN + CO "LAY/LOAI" ───────────────────────────────────────────────────────────
// Doi tu 4 nhan sang 5 (2026-08-13, theo yeu cau loc that cua nguoi dung): truoc day HAT va
// GIONG NOI TREN NHAC bi gop chung mot nhan "Giong + nhac". Nhung bo loc that lai cat dung
// GIUA hai thu do:
//     LAY  : nguoi NOI (khong nhac)      + nguoi NOI tren nhac nen KHONG LOI
//     LOAI : HAT, rap, nhac co loi, nhac thuan
// Nen phai tach. May man la khong phai doi kien truc: YAMNet von cho 'Speech' va 'Singing'
// la HAI diem so RIENG BIET, ta van luon tinh ca hai (speechFrac / singFrac) — chi la truoc
// day gop lai o buoc cuoi. Gio thoi gop.
//
// "Nhac nen KHONG LOI" duoc bao dam bang THU TU XET: hat bi xet TRUOC, nen mot clip da roi
// vao voice_bgm thi chac chan khong co giong hat nao vuot nguong — ke ca giong hat nam trong
// ban nhac nen.
const LABEL_VI = {
  voice: 'Giọng nói',
  voice_bgm: 'Giọng nói + nhạc nền',
  voice_bgm_loi: 'Giọng nói + nhạc nền CÓ LỜI',
  singing: 'Hát',
  music: 'Nhạc',
  unknown: 'Không rõ',
};

/** Nhan nao duoc LAY theo bo loc "chi lay giong nguoi noi". */
const ACCEPT = {
  voice: true,
  voice_bgm: true,
  // LAY duoc — nhung LUON kem ghi chu tu kiem ban quyen (xem ghiChuKhongChac).
  // Nhac nen co loi rat de la ban nhac co ban quyen, ma may khong biet duoc dieu do:
  // luat ban quyen chi doc co "original sound" hay khong, khong nghe ra bai hat nao.
  voice_bgm_loi: true,
  singing: false,
  music: false,
  unknown: false,
};

/**
 * Diem cao nhat trong mot nhom ten nhan, cho 1 cua so.
 *
 * ⚠ Dieu kien chay luoi an toan la "KHONG TEN NAO CO MAT", chu KHONG phai "diem = 0".
 * Phan biet nay la sua mot loi that: ta goi model voi scoreThreshold=0 nen ca 521 nhan deu
 * duoc tra ve, va o nhung cua so im lang thi 'Singing' co diem dung bang 0. Neu lay dieu
 * kien "diem = 0" thi luoi an toan se chay Y NHU LUC DOI MODEL, quet ca bo nhan va cham
 * vao 'Singing bowl' (nhac cu) -> tu nhien co diem "hat" tu hu khong.
 */
function groupScore(byName, names, re) {
  let best = 0, seen = false;
  for (const n of names) {
    const v = byName.get(n);
    if (v === undefined) continue;
    seen = true;
    if (v > best) best = v;
  }
  if (!seen && re) {
    for (const [n, v] of byName) {
      if (v > best && re.test(n) && !RE_DENY.includes(n)) best = v;
    }
  }
  return best;
}

/**
 * Gop 1 cua so: tu mang [{categoryName, score}] ra 4 diem.
 * @returns {{speech:number, singing:number, music:number, quiet:number, top:string}}
 */
function reduceWindow(categories) {
  const byName = new Map();
  let top = '', topScore = -1;
  for (const c of categories || []) {
    const n = c.categoryName || c.displayName || '';
    const s = typeof c.score === 'number' ? c.score : 0;
    if (!n) continue;
    if (!byName.has(n) || byName.get(n) < s) byName.set(n, s);
    if (s > topScore) { topScore = s; top = n; }
  }
  return {
    speech: groupScore(byName, SPEECH_NAMES, SPEECH_RE),
    singing: groupScore(byName, SING_NAMES, SING_RE),
    music: groupScore(byName, MUSIC_NAMES, MUSIC_RE),
    quiet: groupScore(byName, QUIET_NAMES, null),
    top,
  };
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

/**
 * Ra nhan cuoi cung tu danh sach cua so.
 * @param {Array} windows mang ket qua reduceWindow(), hoac mang categories tho
 * @param {object} opt ghi de nguong (xem DEFAULTS)
 * @returns {{label:string, labelVi:string, confidence:number, reason:string, stats:object}}
 */
function aggregate(windows, opt = {}) {
  const T = { ...DEFAULTS, ...opt };
  // ── VET SUY LUAN ──────────────────────────────────────────────────────────────────
  // Ghi lai TUNG BUOC ngay trong luc luat chay, chu KHONG dung ham rieng ke lai sau.
  // Neu ke lai sau thi som muon loi ke se lech khoi luat that (sua luat ma quen sua loi ke)
  // — luc do nguoi dung doc mot dang, may lam mot neo. Ghi tai cho thi khong the lech.
  const suyLuan = [];
  const buoc = (ten, ket, chiTiet) => { suyLuan.push({ ten, ket, chiTiet }); };
  const rows = (windows || []).map(w => (w && Array.isArray(w) ? reduceWindow(w)
    : (w && Array.isArray(w.categories) ? reduceWindow(w.categories) : w)))
    .filter(w => w && typeof w.music === 'number');

  const total = rows.length;
  const usable = rows.filter(r => r.quiet < T.tQuiet);
  const nU = usable.length;

  const stats = {
    windows: total,
    usableWindows: nU,
    usableFrac: total ? nU / total : 0,
    speechFrac: 0, singFrac: 0, musicFrac: 0,
    speechMean: 0, singMean: 0, musicMean: 0, singMax: 0,
    topLabels: topLabels(rows),
  };

  buoc('Nghe audio', `${nU}/${total} cửa sổ dùng được`,
    `bỏ ${total - nU} cửa sổ im lặng (điểm Silence ≥ ${T.tQuiet})`);

  if (nU < T.minUsable || stats.usableFrac < T.minUsableFrac) {
    buoc('Dừng sớm', 'không đủ dữ liệu',
      `cần ≥${T.minUsable} cửa sổ và ≥${Math.round(T.minUsableFrac * 100)}% clip có tiếng`);
    return {
      suyLuan,
      label: 'unknown', labelVi: LABEL_VI.unknown, accept: false, confidence: 0.2,
      reason: total === 0
        ? 'khong phan tich duoc cua so nao (audio rong/loi giai ma)'
        : `qua ngan hoac gan nhu im lang (${nU}/${total} cua so dung duoc)`,
      stats,
    };
  }

  stats.speechFrac = usable.filter(r => r.speech >= T.tSpeech).length / nU;
  stats.singWindows = usable.filter(r => r.singing >= T.tSing).length;   // SO cua so, khong phai ti le
  stats.singFrac = stats.singWindows / nU;
  stats.musicFrac = usable.filter(r => r.music >= T.tMusic).length / nU;
  stats.speechMean = mean(usable.map(r => r.speech));
  stats.singMean = mean(usable.map(r => r.singing));
  stats.musicMean = mean(usable.map(r => r.music));
  stats.singMax = Math.max(0, ...usable.map(r => r.singing));

  const { speechFrac: sp, singFrac: si, musicFrac: mu, singMax: siMax } = stats;

  // ⚠ THU TU XET LA MOT PHAN CUA LUAT, khong phai chuyen sap xep code.
  //
  // HAT XET TRUOC TIEN. Hai ly do, ca hai deu tung la loi that neu lam nguoc:
  //   1) Hat vua co giong vua co nhac. De nhanh "nhac thuan" chay truoc thi MOI BAI HAT deu
  //      thanh "Nhac"; de nhanh "giong noi" chay truoc thi moi bai hat thanh "Giong noi" —
  //      va bo loc cua nguoi dung se nuot tron ca dong bai hat.
  //   2) Day cung la cach bao dam "nhac nen KHONG LOI" cho nhan voice_bgm: da di qua duoc
  //      cua nay nghia la khong con giong hat nao vuot nguong, KE CA giong hat nam trong
  //      ban nhac nen. Khong can luat rieng nao cho "khong loi".
  //
  // Hat LOAI ca clip du nguoi ta co noi nhieu den dau (si >= fSing la du), vi yeu cau la
  // "chi lay voice nguoi noi" — mot sound co doan hat khong dung duoc. Ai thay bi loai oan
  // thi keo fSing len; nguong nam trong DEFAULTS va ghi de duoc.
  buoc('Nghe thấy gì', `nói ${pct(sp)} · hát ${pct(si)} · nhạc ${pct(mu)}`,
    `hát: ${stats.singWindows}/${nU} cửa sổ vượt ${T.tSing}, đỉnh ${siMax.toFixed(3)}`);

  let label, margin, strength;
  // ⚠ PHAI co ca TI LE lan SO CUA SO. Ban dau chi co ti le, va chu thich cua chinh no ghi
  // "1/19 = 5.3% < 6% nen mot cua so don doc khong du" — nhung do la tinh cho clip ~19 cua
  // so. Clip NGAN thi phep tinh do sai han: ca that 2026-08-14
  // (original-sound-7111801707792763674, giong bac si noi chuyen) chi co 12 cua so, dung
  // MOT cua so co diem hat 0.043 (chinh cua so do noi cung chi 0.148 — cua so chuyen tiep),
  // 11 cua so con lai hat = 0.000. Vay ma 1/12 = 8.3% > 6% -> ca clip bi goi la "Hát" va
  // LOAI OAN, du noi 92%. Ep thang bang SO DEM moi dung y da viet ra.
  const duCuaSoHat = si >= T.fSing && stats.singWindows >= T.minSingWin;
  const coHat = duCuaSoHat || siMax >= T.sMaxSing;
  // NGUOI NOI TREN NHAC NEN CO LOI — tach RIENG khoi "Hát" (doi luat 2026-08-16).
  //
  // Truoc day moi thu co giong hat deu la "Hát" va LOAI het, ke ca khi nguoi ta dang NOI ma
  // ban nhac phia sau co loi. Yeu cau moi: loai do VAN LAY DUOC neu khong dinh ban quyen —
  // nhung phai ghi chu de nguoi dung tu kiem ban quyen.
  //
  // Phan biet the nao: dung dung bo dieu kien cua voice_bgm (noi du manh VA co nhac du day),
  // chi khac la co them giong hat. Bat buoc phai co CA HAI:
  //   • sp >= fSpeech  -> that su co nguoi NOI, khong phai chi hat;
  //   • mu >= fMusic   -> giong hat den tu BAN NHAC phia sau, khong phai chinh nguoi do hat.
  // Thieu ve nhac (vd sound "обоюдно" nhac slow: noi 67%, hat 17%, NHAC 0%) thi van la Hát —
  // vi khong co nhac nen thi "hat" chi co the la chinh nguoi do hat.
  // ⚠ CHAN TREN cua ti le noi. Neu GAN NHU MOI cua so deu co giong noi MA VAN nghe ra tieng
  // hat, thi kha nang cao chinh nguoi do dang hat/rap chu khong phai noi de len mot ban nhac
  // co loi — vi mot bai hat that o phia sau luon co doan dao nhac khong loi xen vao.
  // Do duoc: ghep giong noi len bai hat that cho noi 63% (nhac nho) / 21% (vua) / 0% (to);
  // ca that @LAIA cho 56%. Con rap tren beat thi giong nguoi phu KHAP clip -> ~100%.
  // Vuot nguong nay thi giu luat CU (Hát -> LOAI) — chon phia chat hon khi khong phan biet duoc.
  const noiKhapClip = sp >= T.spTranBgmLoi;
  buoc('Xét HÁT trước', coHat ? 'CÓ nghe ra giọng hát' : 'không có giọng hát',
    coHat
      ? (duCuaSoHat
          ? `${pct(si)} ≥ ${pct(T.fSing)} VÀ ${stats.singWindows} ≥ ${T.minSingWin} cửa sổ`
          : `một cửa sổ rất mạnh: đỉnh ${siMax.toFixed(3)} ≥ ${T.sMaxSing}`)
      : `${pct(si)} < ${pct(T.fSing)} hoặc chỉ ${stats.singWindows} < ${T.minSingWin} cửa sổ`);
  if (coHat) {
    buoc('Ai đang hát', noiKhapClip ? 'chính người đó hát/rap' : 'giọng hát đến từ nhạc nền',
      noiKhapClip
        ? `giọng nói phủ ${pct(sp)} ≥ ${pct(T.spTranBgmLoi)} cửa sổ — bài hát thật ở phía sau luôn có đoạn dạo nhạc xen vào`
        : `giọng nói ${pct(sp)} có đứt quãng${mu >= T.fMusic ? `, nhạc ${pct(mu)} đủ dày` : `, nhưng nhạc chỉ ${pct(mu)} — chưa đủ dày`}`);
  }
  if (coHat && sp >= T.fSpeech && mu >= T.fMusic && !noiKhapClip) {
    label = 'voice_bgm_loi';
    margin = Math.min(sp - T.fSpeech, mu - T.fMusic);
    strength = (stats.speechMean + stats.musicMean) / 2;
  } else if (coHat) {
    label = 'singing';
    // Lay khoang cach cua duong nao vuot xa hon: mot clip chi hat vai giay thi ti le thap
    // nhung diem dinh rat cao, va nguoc lai — cham diem theo duong yeu se ha oan tin cay.
    margin = Math.max(si - T.fSing, (siMax - T.sMaxSing) * 0.5);
    strength = Math.max(stats.singMean * 3, siMax);   // ×3 vi diem hat von rat de dat
  } else if (sp >= T.fSpeech && mu >= T.fMusic) {
    label = 'voice_bgm'; margin = Math.min(sp - T.fSpeech, mu - T.fMusic);
    strength = (stats.speechMean + stats.musicMean) / 2;
  } else if (sp >= T.fSpeech) {
    label = 'voice'; margin = Math.min(sp - T.fSpeech, T.fMusic - mu); strength = stats.speechMean;
  } else if (mu >= T.fMusicOnly) {
    label = 'music'; margin = Math.min(mu - T.fMusicOnly, T.fSpeech - sp); strength = stats.musicMean;
  } else {
    return {
      label: 'unknown', labelVi: LABEL_VI.unknown, accept: false, confidence: 0.25,
      reason: `khong nhom nao du manh (noi ${pct(sp)}, hat ${pct(si)}, nhac ${pct(mu)})`,
      stats,
    };
  }

  // Tin cay: 1 nua tu KHOANG CACH vuot nguong (quyet dinh co sat sao khong), 1 nua tu DO
  // MANH cua diem so (model co chac khong). Chia doi de khong ca hai tu lua: ti le 100%
  // nhung diem chi 0.25 thi van la ket qua yeu, va nguoc lai.
  const marginTerm = clamp01(Math.max(0, margin) / 0.25);
  const strengthTerm = clamp01(strength / 0.7);
  const confidence = Math.round(clamp01(0.15 + 0.45 * marginTerm + 0.40 * strengthTerm) * 100) / 100;
  buoc('Chốt nhãn', LABEL_VI[label], `tin cậy ${Math.round(confidence * 100)}%`
    + ` (cách ngưỡng ${(Math.max(0, margin) * 100).toFixed(0)} điểm, điểm số ${strength.toFixed(2)})`);

  return {
    suyLuan,
    label, labelVi: LABEL_VI[label], accept: ACCEPT[label] === true, confidence,
    reason: `noi ${pct(sp)} · hat ${pct(si)}${siMax >= T.sMaxSing ? ` (dinh ${siMax.toFixed(2)})` : ''} · nhac ${pct(mu)} tren ${nU} cua so`,
    stats,
  };
}

function pct(x) { return Math.round(x * 100) + '%'; }

/** 6 nhan co diem trung binh cao nhat toan clip — de bao cho nguoi dung BIET no la gi,
 *  chu khong chi biet thuoc nhom nao ("Techno" khac han "Giong nu noi"). */
function topLabels(rows) {
  const sum = new Map(), cnt = rows.length || 1;
  for (const r of rows) {
    if (r && r.top) sum.set(r.top, (sum.get(r.top) || 0) + 1);
  }
  return [...sum.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n]) => ({ name, frac: Math.round((n / cnt) * 100) / 100 }));
}

/**
 * QUYET DINH CUOI CUNG: gop ket qua NGHE (aggregate) voi tin hieu BAN QUYEN cua TikTok.
 *
 * Tach rieng khoi aggregate() vi hai thu nay tra loi hai cau hoi khac han nhau:
 *   aggregate()     — "trong file nay co ai dang noi khong?"   (nghe bang model)
 *   quyetDinhCuoi() — "co dung duoc sound nay khong?"           (nghe + ban quyen)
 * Tach ra thi doi luat ban quyen khong phai chay lai model: giao dien bat/tat o "Loai nhac
 * co ban quyen" la tinh lai duoc ngay tren ket qua da co.
 *
 * @param {{accept:boolean}} kq       ket qua cua aggregate()
 * @param {{original:(boolean|null)}} meta  thong tin sound (original === false => nhac catalog)
 * @param {{loaiBanQuyen?:boolean}} opt
 * @returns {{banQuyen:boolean, lay:boolean, tinhTrang:number, lyDoLoai:string}}
 */
function quyetDinhCuoi(kq, meta = {}, opt = {}) {
  const loaiBanQuyen = opt.loaiBanQuyen !== false;      // mac dinh BAT
  const hocTuSua = opt.hocTuSua !== false;              // mac dinh BAT

  // ── NGUOI DUNG TU CHON THI THANG TAT CA ──────────────────────────────────────────
  // Co nhung thu may KHONG the biet: sound do la phong van hay khong, co phai trich doan
  // phim hay khong. Do la chuyen NOI DUNG, nhin video 2 giay la ro, con model do ca ngay
  // cung khong ra (da do that: nhan 'Conversation'/'Narration' cho phong van THAT va doc
  // thoai deu ~0.00, khong tach duoc). Nen nguoi dung xem trong mini browser roi bam Lay/Loai
  // thi quyet dinh do de len TREN moi luat may — ke ca luat ban quyen.
  if (opt.nguoiDung === 1 || opt.nguoiDung === 0) {
    const lay = opt.nguoiDung === 1;
    return {
      banQuyen: meta.original === false,
      nghiPhim: meta.nghiPhim === true,
      lay,
      tinhTrang: lay ? 1 : 0,
      boiNguoiDung: true,
      lyDoLoai: lay ? '' : 'ban tu chon loai',
    };
  }
  // ── TU SUA THEO CA NGUOI DUNG DA DAY ─────────────────────────────────────────────
  // Yeu cau cua nguoi dung: "sai roi thi phai nho, va TRANH TIEP DIEN lan sai tiep theo".
  // Canh bao suong thi khong tranh duoc gi — nen o day AP DUNG LUON quyet dinh cu.
  //
  // ⚠ Chi ap dung khi ca cu GAN NHU TRUNG KHIT (kc <= NGUONG_TU_SUA = 0.05) — muc ma trong
  // 46 sound that CHUA TUNG co cap khac nhan nao lot vao (tinh khiet 100%). Vung 0.05-0.10
  // thi chi CANH BAO, vi o do da co 2% cap khac nhan lot; tu sua o vung do la sai am tham,
  // nguoi dung khong biet duong ma xem lai.
  //
  // Thu tu uu tien tu tren xuong:
  //   1) nguoi dung bam tay CHO CHINH LINK NAY  (khoi o tren, thang tuyet doi)
  //   2) tu sua theo ca da day                   (khoi nay)
  //   3) luat may                                 (ben duoi)
  // Va no LUON noi ro vua lam gi — khong bao gio sua am tham.
  const caGan = (opt.hocTuSua === false) ? []
    : (meta.caDaSua || []).filter(c => c && typeof c.kc === 'number' && c.kc <= NGUONG_TU_SUA);
  const caDay = caGan[0];
  if (caDay && (caDay.banCham === 1) !== (kq.accept === true)) {
    const layTheoHoc = caDay.banCham === 1;
    return {
      banQuyen: meta.original === false,
      nghiPhim: meta.nghiPhim === true,
      lay: layTheoHoc,
      tinhTrang: layTheoHoc ? 1 : 0,
      boiNguoiDung: false,
      boiHoc: true,
      caDay: { ten: caDay.ten, khoa: caDay.khoa, kc: Number(caDay.kc.toFixed(3)) },
      lyDoLoai: layTheoHoc ? '' : `tu sua theo ca ban da day: ${caDay.ten || caDay.khoa}`,
      chacChan: false,
      ghiChu: [`🧠 TỰ SỬA theo ca bạn đã dạy (${caDay.ten || caDay.khoa}) — máy chấm "${kq.labelVi}"`
        + ` (${kq.accept ? 'LẤY' : 'LOẠI'}) nhưng lần trước bạn chọn ${layTheoHoc ? 'LẤY' : 'LOẠI'}`
        + ` cho sound gần như y hệt (khoảng cách ${caDay.kc.toFixed(3)})`],
    };
  }
  // Chi `false` moi la "biet chac day la nhac catalog". `null` = khong doc duoc thong tin
  // -> KHONG duoc coi la co ban quyen, khong thi mot lan TikTok doi cau truc du lieu la ca
  // danh sach bi loai sach ma khong ai hieu vi sao.
  const banQuyen = meta.original === false;

  // ── TAI KHOAN CO TICH XANH -> LOAI ──────────────────────────────────────────────
  // ⚠ LOI DA XAY RA (2026-08-19): truong `verified` duoc doc tu TikTok va HIEN ra trong
  // panel ("✔ tai khoan tich xanh") nhung KHONG he dung de loai. Ket qua: sound
  // "original sound — Lufthansa" cua @lufthansa (tich xanh) van duoc LAY, nguoi dung
  // phai bam tay. Yeu cau ban dau ghi ro: "sound co tich xanh thi auto la Loai".
  //
  // Vi sao `banQuyen` khong bat duoc: no chi doc `original === false` (nhac catalog cua
  // TikTok). Tai khoan tich xanh dang bai bang "original sound" CUA CHINH HO thi
  // original === true -> lot qua het.
  //
  // ⚠ CHI xet khi day la tai khoan CHU SOUND (laChuSound). Neu khong, mot nguoi noi tieng
  // dung sound cua nguoi khac se keo ca sound do xuong theo — sai han y.
  // Va `verified` phai dung `=== true`: gia tri null nghia la KHONG DOC DUOC, khong duoc
  // coi la co tich (mot lan TikTok doi cau truc du lieu la loai sach ca danh sach).
  const tichXanh = meta.laChuSound === true
    && !!meta.tacGia && meta.tacGia.verified === true;

  // ── VOICE PHIM / HOAT HINH ──────────────────────────────────────────────────────
  // Voice trong phim va anime VAN LA giong nguoi nen model audio khong tach duoc — no se
  // cham "Giọng nói" hoac "Giọng nói + nhạc nền" va cho LAY. Dau hieu duy nhat doc duoc la
  // HASHTAG cua video + BIO cua tai khoan (xem nhanDangPhim trong soundlink.cjs).
  const loaiPhim = opt.loaiPhim !== false;      // mac dinh BAT
  const nghiPhim = meta.nghiPhim === true;

  // Tich xanh di CUNG cong tac "Loai nhac co ban quyen" — ca hai deu tra loi cung mot cau
  // hoi cua nguoi dung: "sound nay co rui ro ban quyen khong".
  const lay = !!kq.accept && !(loaiBanQuyen && (banQuyen || tichXanh)) && !(loaiPhim && nghiPhim);
  let lyDoLoai = '';
  if (!lay) {
    if (kq.accept && loaiPhim && nghiPhim) {
      const tu = (meta.tuKhop || []).slice(0, 3).join(', ');
      // Hai nguon khac han nhau nen goi ten khac nhau — de nguoi doc biet nen tin toi dau.
      lyDoLoai = meta.nguon === 'tai khoan dong vai'
        ? `tai khoan dong vai nhan vat (${tu || 'dau hieu tai khoan'})`
        : `voice phim/hoat hinh (${meta.nguon || 'dau hieu'}${tu ? ': ' + tu : ''})`;
    } else if (kq.accept && tichXanh) {
      lyDoLoai = `tai khoan CO TICH XANH (@${(meta.tacGia && meta.tacGia.uniqueId) || '?'})`;
    } else if (kq.accept && banQuyen) {
      lyDoLoai = 'nhac co ban quyen (TikTok danh dau khong phai original sound)';
    } else lyDoLoai = kq.labelVi || 'khong dat';
  }
  return { banQuyen, tichXanh, nghiPhim, lay, tinhTrang: lay ? 1 : 0, boiNguoiDung: false,
           lyDoLoai, ...ghiChuKhongChac(kq, meta, opt) };
}

/**
 * CHAM HAI LUOT roi doi chieu — "phan tich 2 lan truoc khi chot".
 *
 * ⚠ Chay model HAI LAN tren CUNG mot doan audio la vo nghia: YAMNet tat dinh, cung dau vao
 * thi cung dau ra tuyet doi. Muon lan thu hai co gia tri thi phai nghe DOAN KHAC.
 * Nen o day chia clip lam doi va cham rieng tung nua. KHONG ton them gi: cung mot lan tai,
 * cung mot lan chay model, chi gop lai theo hai tap con.
 *
 * Do that 2026-08-16 tren 40 sound TikTok that:
 *     hai nua cho NHAN khac nhau : 10/40 (25%)
 *     doi ca LAY/LOAI            :  7/40 (18%)
 * Tuc gan 1/5 sound co ket qua KHONG ON DINH tuy nghe doan nao — day dung la nhung dong
 * nguoi dung nen nghe lai, nen khi hai luot lech thi phai bao.
 *
 * @returns {{khop:boolean, nhan1:string, nhan2:string, lay1:boolean, lay2:boolean, doiKetQua:boolean}|null}
 */
function chamHaiLuot(windows, opt = {}) {
  const w = windows || [];
  if (w.length < 8) return null;          // qua ngan thi chia doi khong con y nghia
  const giua = Math.floor(w.length / 2);
  const a = aggregate(w.slice(0, giua), opt);
  const b = aggregate(w.slice(giua), opt);
  return {
    khop: a.label === b.label,
    doiKetQua: a.accept !== b.accept,
    nhan1: a.labelVi, nhan2: b.labelVi,
    lay1: a.accept, lay2: b.accept,
  };
}

// ── HOC TU LOI: nho lai nhung lan nguoi dung sua tay, roi doi chieu voi sound moi ──────
//
// Y tuong: moi lan nguoi dung bam LAY/LOAI NGUOC voi may, ta luu lai "van tay so lieu" cua
// sound do. Sound moi nao co van tay GAN GIONG mot ca da sua thi bao truoc — de khong lap
// lai dung cai sai cu.
//
// ⚠ CO Y KHONG tu dong lat ket qua. Kho hoc chi co vai chuc mau, lat tu dong la bien mot
// lan sua tay thanh mot luat ngam khong ai kiem soat duoc. No CHI GHI CHU; nguoi dung van
// la nguoi quyet dinh.

// Nam con so du de ta ca. Hat duoc danh trong so NANG HON vi ranh gioi noi/hat la cho sai
// nhieu nhat (moi loi nguoi dung bat duoc tu truoc toi nay deu nam o do).
const TRONG_SO_DT = [1, 2.5, 1, 2.5, 2];

/** Van tay so lieu cua mot ket qua — 5 con so, tat ca deu trong khoang 0..1. */
function dacTrung(kq) {
  const s = (kq && kq.stats) || {};
  return [
    s.speechFrac || 0,
    s.singFrac || 0,
    s.musicFrac || 0,
    s.singMax || 0,
    (s.singWindows || 0) / Math.max(1, s.usableWindows || 1),
  ];
}

/** Khoang cach giua hai van tay (0 = trung khit). */
function khoangCachDT(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  const tong = TRONG_SO_DT.reduce((x, y) => x + y, 0);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += TRONG_SO_DT[i] * (a[i] - b[i]) ** 2;
  return Math.sqrt(s / tong);
}

// ⚠ NGUONG DO DUOC, khong uoc luong. Tinh khoang cach cua MOI CAP trong 46 sound that
// (2026-08-16), roi xem cap CUNG NHAN va cap KHAC NHAN roi vao dau:
//     cap cung nhan : trung vi 0.103
//     cap khac nhan : thap nhat da 0.173 (10% duoi)
// Hai vung tach nhau. Bang chon nguong:
//     0.05 -> bat 21% cap cung nhan, 0% cap khac nhan lot  (tinh khiet 100%)
//     0.10 -> bat 48%,               2% lot                (tinh khiet  95%)  <- chon
//     0.20 -> bat 86%,              12% lot                (tinh khiet  82%)
// Chon 0.10: van rat sach ma bat duoc gan nua so cap that su giong nhau.
const NGUONG_GIONG = 0.10;

// ⚠ NGUONG TU SUA — CHAT HON HAN nguong canh bao, va cung do tu chinh bang do tren.
// Bang do tren 46 sound that:
//     0.05 -> bat 21% cap cung nhan, KHONG cap khac nhan nao lot  (tinh khiet 100%)
//     0.10 -> bat 48%,               2% lot                       (tinh khiet  95%)
// Tu SUA thi phai la 100%: sai mot lan la sai am tham, nguoi dung khong biet duong ma xem
// lai. Nen tu sua chi chay o vung 0.05 (chua tung thay cap khac nhan nao), con vung
// 0.05-0.10 thi chi CANH BAO de nguoi dung tu quyet.
const NGUONG_TU_SUA = 0.05;

/**
 * Tim trong kho hoc nhung ca DA SUA co van tay gan giong ket qua hien tai.
 * @param {object} kq   ket qua aggregate()
 * @param {Array}  kho  danh sach ban ghi { khoa, ten, mayCham, banCham, dacTrung, luc }
 * @returns {Array} cac ca giong, gan nhat truoc
 */
function timCaDaSua(kq, kho, opt = {}) {
  const nguong = typeof opt.nguongGiong === 'number' ? opt.nguongGiong : NGUONG_GIONG;
  const dt = dacTrung(kq);
  return (kho || [])
    // Chi doi chieu voi nhung ca may cham CUNG NHAN — vi cai can hoc la "may cham X ma
    // that ra phai la Y", chu khong phai "hai sound nay nghe giong nhau".
    .filter(x => x && x.mayCham === kq.label && Array.isArray(x.dacTrung))
    .map(x => ({ ...x, kc: khoangCachDT(dt, x.dacTrung) }))
    .filter(x => x.kc <= nguong)
    .sort((a, b) => a.kc - b.kc);
}

// ── "KHONG CHAC — NEN KIEM TAY" ──────────────────────────────────────────────────────
// May co nhung ca no doan duoc nhung khong dam chac. Truoc day nhung ca do van ra mot con
// so 0/1 nhu moi ca khac, nen nguoi dung khong biet cai nao dang ngo ma soi lai. Gio danh
// dau chung — CA BEN LAY LAN BEN LOAI.
//
// ⚠ Ghi chu chi co gia tri khi no HIEM. Da hieu chinh tren 46 sound that: bo luat dau tien
// dan nhan len 35% so dong (vi lay ca "tin cay thap" va "clip ngan"), ma doc ky thi nhieu
// dong trong do rat ro rang — vi du "noi 0% hat 10% nhac 100%" bi goi la khong chac chi vi
// diem tin cay thap. Nhung luat do da bi bo. Bo con lai roi vao ~20% va dong nao cung giai
// thich duoc bang mat thuong.
function ghiChuKhongChac(kq, meta = {}, opt = {}) {
  const T = { ...DEFAULTS, ...opt };
  const s = (kq && kq.stats) || {};
  const g = [];
  const sp = s.speechFrac || 0, mu = s.musicFrac || 0, si = s.singFrac || 0;
  const cs = s.usableWindows || 0, cw = s.singWindows || 0, smax = s.singMax || 0;

  // Nhan "giong noi + nhac nen CO LOI" thi LUON phai kem loi nhac kiem ban quyen — day
  // khong phai "may khong chac", ma la "may khong the biet": no chi doc duoc co dau
  // original-sound hay khong, chu khong nhan ra ban nhac nao dang phat.
  // ⚠ PHAI ghi chu cho CA HAI nhan co nhac nen, khong chi nhan "CÓ LỜI".
  //
  // Do that 2026-08-16 — ghep giong noi that len BAI HAT that (dung doan co tieng hat) o 3 muc:
  //     nhac nho : noi 63% · HAT 0%  · nhac  89%  -> "Giọng nói + nhạc nền"  (khong biet co loi!)
  //     nhac vua : noi 21% · hat 11% · nhac 100%  -> "Hát"
  //     nhac to  : noi  0% · hat 16% · nhac 100%  -> "Hát"
  // Doc theo cot HAT thi thay cai bay: NHAC NHO du de giong noi noi len thi may KHONG NGHE RA
  // tieng hat trong nhac (dung 0%); NHAC TO du de nghe ra tieng hat thi giong noi da bi nuot.
  // Hai dieu kien cua nhan voice_bgm_loi (noi manh VA co hat) gan nhu khong bao gio dung cung
  // luc — tren 46 sound that chi 1 cai cham toi.
  //
  // Nghia la: may KHONG PHAN BIET DUOC nhac nen co loi hay khong loi. Nen thay vi im lang cho
  // qua, moi dong CO NHAC NEN deu phai mang loi nhac tu kiem ban quyen.
  if (kq.label === 'voice_bgm_loi') {
    g.push('🔒 nghe rõ giọng hát trong nhạc nền — tự kiểm bản quyền trước khi dùng');
  } else if (kq.label === 'voice_bgm') {
    g.push('🔒 có nhạc nền — máy KHÔNG phân biệt được nhạc có lời hay không lời, tự kiểm bản quyền');
  } else if (kq.label === 'singing' && sp >= T.spTranBgmLoi && mu >= T.fMusic) {
    // Giong noi phu kin clip + co nhac + co hat: coi la chinh nguoi do hat/rap nen LOAI,
    // nhung day dung la ranh gioi voi "noi de len bai hat" -> phai bao de nguoi dung tu quyet.
    g.push('có thể là bạn NÓI đè lên bài hát (đang bị coi là tự hát/rap) — nghe lại rồi tự chọn');
  }
  // ĐIỀU NGUOI DUNG SO NHAT: nhac to at giong -> bi cham la Nhac/Hat va LOAI, trong khi
  // that ra la GIONG NOI BINH THUONG ghep nhac. Con giong noi song sot toi 15% cua so thi
  // van con kha nang do.
  if ((kq.label === 'music' || kq.label === 'singing') && sp >= 0.15) {
    g.push('nhạc lấn giọng — có thể là giọng nói ghép nhạc chứ không phải hát');
  }
  // Noi nhieu ma van bi cham la hat: ranh gioi "noi ghep nhac" vs "hat theo nhac" nam o day.
  if (kq.label === 'singing' && sp >= 0.35) {
    g.push('nói nhiều mà vẫn bị chấm là hát — ranh giới nói/hát');
  }
  // Ket luan "hat" chi dua tren dung 1-2 cua so.
  if (kq.label === 'singing' && cw <= T.minSingWin) {
    g.push(`bằng chứng hát mỏng (chỉ ${cw} cửa sổ)`);
  }
  // Nguoc lai: da cho LAY nhung VAN co dau hieu hat — chinh la nhung ca luat minSingWin
  // vua tha ra. Khong du de loai, nhung du de bao nguoi dung nghe lai.
  if (kq.accept && cw >= 1 && (si >= T.fSing || smax >= 0.15)) {
    g.push(`có ${cw} cửa sổ nghi hát nhưng chưa đủ kết luận`);
  }
  // SAT NGUONG = mo ho theo dinh nghia. Ca that bat duoc khi chup man hinh 2026-08-14:
  // mot sound cho hat 5.7% — duoi nguong 6% dung mot chut — nen ra "Giọng nói · LẤY" ma
  // khong co canh bao nao, trong khi chinh no lan truoc do lai ra "Hát · LOẠI" (audio tai
  // ve khac nhau chut it giua hai lan). Dong nao nam sat vach thi ket qua co the lat bat cu
  // luc nao, phai bao nguoi dung.
  if (kq.label !== 'singing' && si >= T.fSing * 0.7 && si < T.fSing) {
    g.push(`điểm hát sát ngưỡng (${Math.round(si * 100)}% so với ${Math.round(T.fSing * 100)}%) — có thể lật`);
  }
  if ((kq.label === 'voice' || kq.label === 'voice_bgm' || kq.label === 'music')
      && Math.abs(sp - T.fSpeech) <= 0.05) {
    g.push(`tỉ lệ nói sát ngưỡng (${Math.round(sp * 100)}% so với ${Math.round(T.fSpeech * 100)}%) — có thể lật`);
  }
  // Giong yeu han so voi nhac -> de bi nhac nuot o clip khac.
  if (kq.accept && sp < 0.45 && mu >= T.fMusic) {
    g.push('giọng yếu so với nhạc — nghe lại cho chắc');
  }
  if (cs > 0 && cs < 5) g.push(`clip quá ngắn (${cs} cửa sổ dùng được)`);

  // Hai luot lech nhau -> ket qua phu thuoc vao nghe doan nao. Do that: 25% sound bi vay.
  const h = kq.haiLuot;
  if (h && !h.khop) {
    g.push(h.doiKetQua
      ? `2 lượt LỆCH HẲN: nửa đầu "${h.nhan1}" (${h.lay1 ? 'LẤY' : 'LOẠI'}) · nửa sau "${h.nhan2}" (${h.lay2 ? 'LẤY' : 'LOẠI'})`
      : `2 lượt cho nhãn khác nhau: nửa đầu "${h.nhan1}" · nửa sau "${h.nhan2}"`);
  }

  // Ca giong mot lan nguoi dung da sua tay -> nhac lai, ke ca khi may dang rat chac.
  for (const c of (meta.caDaSua || []).slice(0, 2)) {
    g.push(`giống ca bạn đã sửa tay (${c.ten || c.khoa}): máy chấm "${kq.labelVi}"`
      + ` nhưng bạn chọn ${c.banCham ? 'LẤY' : 'LOẠI'}`);
  }
  // Tin hieu tu ngoai am thanh (neu co): so giong noi doc duoc trong sound.
  // ⚠ CHI GHI CHU, KHONG DUOC DUNG DE LOAI. Do that tren 46 sound: nguong ">=2 giong" bat
  // duoc 36% clip phong van nhung loai oan 28% sound thuong — vi sound phong van thuong da
  // cat con MOT giong, con tieu pham/doi thoai thuong thi lai co hai giong.
  if (meta.soGiongNoi >= 2) g.push(`nghe ra ${meta.soGiongNoi} giọng nói — có thể là đối thoại/phỏng vấn`);

  return { chacChan: g.length === 0, ghiChu: g };
}

module.exports = {
  aggregate, reduceWindow, topLabels, quyetDinhCuoi, ghiChuKhongChac, chamHaiLuot,
  dacTrung, khoangCachDT, timCaDaSua, NGUONG_GIONG, NGUONG_TU_SUA,
  DEFAULTS, LABEL_VI, ACCEPT,
  SPEECH_NAMES, SING_NAMES, MUSIC_NAMES, QUIET_NAMES, RE_DENY,
};
