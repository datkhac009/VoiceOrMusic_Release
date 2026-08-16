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
  singing: 'Hát',
  music: 'Nhạc',
  unknown: 'Không rõ',
};

/** Nhan nao duoc LAY theo bo loc "chi lay giong nguoi noi". */
const ACCEPT = {
  voice: true,
  voice_bgm: true,
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

  if (nU < T.minUsable || stats.usableFrac < T.minUsableFrac) {
    return {
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
  let label, margin, strength;
  // ⚠ PHAI co ca TI LE lan SO CUA SO. Ban dau chi co ti le, va chu thich cua chinh no ghi
  // "1/19 = 5.3% < 6% nen mot cua so don doc khong du" — nhung do la tinh cho clip ~19 cua
  // so. Clip NGAN thi phep tinh do sai han: ca that 2026-08-14
  // (original-sound-7111801707792763674, giong bac si noi chuyen) chi co 12 cua so, dung
  // MOT cua so co diem hat 0.043 (chinh cua so do noi cung chi 0.148 — cua so chuyen tiep),
  // 11 cua so con lai hat = 0.000. Vay ma 1/12 = 8.3% > 6% -> ca clip bi goi la "Hát" va
  // LOAI OAN, du noi 92%. Ep thang bang SO DEM moi dung y da viet ra.
  const duCuaSoHat = si >= T.fSing && stats.singWindows >= T.minSingWin;
  if (duCuaSoHat || siMax >= T.sMaxSing) {
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

  return {
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
  // Chi `false` moi la "biet chac day la nhac catalog". `null` = khong doc duoc thong tin
  // -> KHONG duoc coi la co ban quyen, khong thi mot lan TikTok doi cau truc du lieu la ca
  // danh sach bi loai sach ma khong ai hieu vi sao.
  const banQuyen = meta.original === false;

  // ── VOICE PHIM / HOAT HINH ──────────────────────────────────────────────────────
  // Voice trong phim va anime VAN LA giong nguoi nen model audio khong tach duoc — no se
  // cham "Giọng nói" hoac "Giọng nói + nhạc nền" va cho LAY. Dau hieu duy nhat doc duoc la
  // HASHTAG cua video + BIO cua tai khoan (xem nhanDangPhim trong soundlink.cjs).
  const loaiPhim = opt.loaiPhim !== false;      // mac dinh BAT
  const nghiPhim = meta.nghiPhim === true;

  const lay = !!kq.accept && !(loaiBanQuyen && banQuyen) && !(loaiPhim && nghiPhim);
  let lyDoLoai = '';
  if (!lay) {
    if (kq.accept && loaiPhim && nghiPhim) {
      const tu = (meta.tuKhop || []).slice(0, 3).join(', ');
      // Hai nguon khac han nhau nen goi ten khac nhau — de nguoi doc biet nen tin toi dau.
      lyDoLoai = meta.nguon === 'tai khoan dong vai'
        ? `tai khoan dong vai nhan vat (${tu || 'dau hieu tai khoan'})`
        : `voice phim/hoat hinh (${meta.nguon || 'dau hieu'}${tu ? ': ' + tu : ''})`;
    } else if (kq.accept && banQuyen) {
      lyDoLoai = 'nhac co ban quyen (TikTok danh dau khong phai original sound)';
    } else lyDoLoai = kq.labelVi || 'khong dat';
  }
  return { banQuyen, nghiPhim, lay, tinhTrang: lay ? 1 : 0, boiNguoiDung: false, lyDoLoai,
           ...ghiChuKhongChac(kq, meta, opt) };
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

  // Tin hieu tu ngoai am thanh (neu co): so giong noi doc duoc trong sound.
  // ⚠ CHI GHI CHU, KHONG DUOC DUNG DE LOAI. Do that tren 46 sound: nguong ">=2 giong" bat
  // duoc 36% clip phong van nhung loai oan 28% sound thuong — vi sound phong van thuong da
  // cat con MOT giong, con tieu pham/doi thoai thuong thi lai co hai giong.
  if (meta.soGiongNoi >= 2) g.push(`nghe ra ${meta.soGiongNoi} giọng nói — có thể là đối thoại/phỏng vấn`);

  return { chacChan: g.length === 0, ghiChu: g };
}

module.exports = {
  aggregate, reduceWindow, topLabels, quyetDinhCuoi, ghiChuKhongChac,
  DEFAULTS, LABEL_VI, ACCEPT,
  SPEECH_NAMES, SING_NAMES, MUSIC_NAMES, QUIET_NAMES, RE_DENY,
};
