// src/caodo.cjs — do CAO DO de tach HAT khoi NOI.
//
// VI SAO CAN: nguoi dung bao "no la giong noi hat ma bi cham la Giong noi". Da do that
// (2026-08-29) tren dung nhung sound do: YAMNet cham 'Speech' 0,63-0,95 con diem hat cao
// nhat chi 0,004-0,082 — tuc la KHONG PHAI chinh nguong, ma model that su khong nghe ra.
// Bo nhan hat da co du 12 loai (Singing, Rapping, Choir, Chant, Humming...) va nguong da ha
// xuong 0,02 roi, khong con gi de vat them.
//
// Nen phai do bang mot dai luong KHAC HAN, khong qua model: CAO DO GIU BAO LAU.
//   • Hat  : giu tung not — cao do gan nhu khong doi trong 200-500ms, roi nhay sang not khac.
//   • Noi  : cao do truot lien tuc theo ngu dieu, rat hiem khi dung yen qua 150ms.
// Day la cach tach kinh dien, khong phu thuoc ngon ngu — quan trong vi sound cua nguoi dung
// den tu rat nhieu nuoc (A Rap, Bengali, Kurd, Hoa, Bo Dao Nha...).
//
// Module THUAN (khong Electron, khong DOM) de test duoc bang `node`.
'use strict';

// Giong nguoi: nam ~70-200 Hz, nu ~150-350 Hz, tre em/hat cao toi ~500 Hz.
const F0_MIN = 70;
const F0_MAX = 500;

/**
 * Uoc luong cao do mot khung bang TU TUONG QUAN da chuan hoa.
 * Tra ve 0 neu khung khong co cao do ro (phu am, im lang, nhac go...).
 *
 * @param {Float32Array} x  tin hieu
 * @param {number} bd       vi tri bat dau khung
 * @param {number} N        do dai khung (mau)
 * @param {number} sr       tan so lay mau
 * @param {number} nguongRo do tuong quan toi thieu de coi la CO cao do
 */
function f0Khung(x, bd, N, sr, nguongRo = 0.35) {
  const lagMin = Math.floor(sr / F0_MAX);
  const lagMax = Math.min(Math.floor(sr / F0_MIN), N - 1);
  if (lagMax <= lagMin) return 0;

  // Nang luong khung: qua nho thi khoi tinh (im lang) — vua nhanh vua tranh nhieu.
  let nl = 0;
  for (let i = 0; i < N; i++) nl += x[bd + i] * x[bd + i];
  if (nl < 1e-6 * N) return 0;

  let tot = 0, lagTot = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let tich = 0, nl2 = 0;
    for (let i = 0; i + lag < N; i++) {
      tich += x[bd + i] * x[bd + i + lag];
      nl2 += x[bd + i + lag] * x[bd + i + lag];
    }
    const r = tich / (Math.sqrt(nl * nl2) + 1e-12);
    if (r > tot) { tot = r; lagTot = lag; }
  }
  return tot >= nguongRo && lagTot > 0 ? sr / lagTot : 0;
}

/**
 * Lan theo duong cao do cua ca clip.
 * @returns {number[]} F0 tung khung (0 = khong co cao do ro)
 */
function duongF0(pcm, sr, { khungMs = 40, buocMs = 20 } = {}) {
  const N = Math.round((khungMs / 1000) * sr);
  const H = Math.round((buocMs / 1000) * sr);
  const ra = [];
  for (let i = 0; i + N <= pcm.length; i += H) ra.push(f0Khung(pcm, i, N, sr));
  return ra;
}

/**
 * Do "muc do giu not" cua clip.
 *
 * Mot NOT GIU = chuoi khung lien tiep deu co cao do, va cao do khong lech qua `lechToiDa`
 * so voi trung binh cua chuoi. Dai it nhat `notMs` thi moi tinh.
 *
 * @returns {{tiLeGiuNot:number, soNot:number, notDaiNhatMs:number, tiLeCoCaoDo:number}}
 *   tiLeGiuNot  — phan tram thoi luong CO CAO DO nam trong cac not giu (0..1)
 *   soNot       — dem so not giu duoc
 *   notDaiNhatMs— not giu dai nhat (ms)
 *   tiLeCoCaoDo — phan tram khung co cao do ro (de biet clip co giong nguoi khong)
 */
function docGiuNot(pcm, sr, { khungMs = 40, buocMs = 20, notMs = 220, lechToiDa = 0.03 } = {}) {
  const f0 = duongF0(pcm, sr, { khungMs, buocMs });
  const soKhungMotNot = Math.max(2, Math.round(notMs / buocMs));
  let coCaoDo = 0, trongNot = 0, soNot = 0, daiNhat = 0;

  let i = 0;
  while (i < f0.length) {
    if (!f0[i]) { i++; continue; }
    coCaoDo++;
    // Keo dai chuoi trong khi cao do con nam sat trung binh cua chinh chuoi do.
    let j = i + 1, tong = f0[i], dem = 1;
    while (j < f0.length && f0[j]) {
      const tb = tong / dem;
      if (Math.abs(f0[j] - tb) / tb > lechToiDa) break;
      tong += f0[j]; dem++; j++;
      coCaoDo++;
    }
    if (dem >= soKhungMotNot) {
      soNot++;
      trongNot += dem;
      daiNhat = Math.max(daiNhat, dem * buocMs);
    }
    i = j;
  }
  return {
    tiLeGiuNot: coCaoDo ? trongNot / coCaoDo : 0,
    soNot,
    notDaiNhatMs: daiNhat,
    tiLeCoCaoDo: f0.length ? coCaoDo / f0.length : 0,
  };
}

module.exports = { f0Khung, duongF0, docGiuNot, F0_MIN, F0_MAX };
