// test/caodo.test.js — thuoc do CAO DO (tach HAT khoi NOI).
// Dung tin hieu MA MINH BIET TRUOC la gi, nen sai la biet ngay sai o dau.
'use strict';
const { f0Khung, duongF0, docGiuNot } = require('../src/caodo.cjs');

let pass = 0, fail = 0;
const check = (nhan, dung, phu = '') => {
  if (dung) { pass++; console.log(`   OK   ${nhan}`); }
  else { fail++; console.log(`   FAIL ${nhan} ${phu}`); }
};
const SR = 16000;

/**
 * Dung mot doan co cao do.
 * ⚠ PHAI cong don PHA. Viet sin(2*pi*f(t)*t) la QUET TAN SO chu khong phai rung giong —
 * da sap mot lan vi cho nay: tin hieu "hat" hoa ra truot tan so rat rong nen thuoc do bao
 * 0 not, tuong thuoc do hong trong khi hong la tin hieu thu.
 */
function themNot(x, bd, giay, hz, rung = 0, truot = 0) {
  const n = Math.round(giay * SR);
  let pha = 0;
  for (let i = 0; i < n && bd + i < x.length; i++) {
    const t = i / SR;
    const f = hz * (1 + rung * Math.sin(2 * Math.PI * 5 * t)) * (1 + truot * (i / n));
    pha += (2 * Math.PI * f) / SR;
    x[bd + i] += 0.5 * Math.sin(pha) + 0.25 * Math.sin(2 * pha) + 0.12 * Math.sin(3 * pha);
  }
  return bd + n;
}

console.log('\n=== 1. Uoc luong cao do mot khung ===');
{
  const x = new Float32Array(SR);
  themNot(x, 0, 1, 220);
  const f = f0Khung(x, 0, Math.round(0.04 * SR), SR);
  check('doc dung 220 Hz (sai so < 2%)', Math.abs(f - 220) / 220 < 0.02, String(f.toFixed(1)));
  check('im lang -> 0 (khong bia ra cao do)', f0Khung(new Float32Array(SR), 0, 640, SR) === 0);
  const on = new Float32Array(SR);
  for (let i = 0; i < on.length; i++) on[i] = (Math.random() * 2 - 1) * 0.3;
  check('tieng on trang -> khong ra cao do on dinh',
    docGiuNot(on, SR).soNot === 0, JSON.stringify(docGiuNot(on, SR)));
}

console.log('\n=== 2. Tach HAT khoi NOI ===');
{
  const hat = new Float32Array(SR * 6);
  let p = 0;
  for (const [g, h] of [[.5, 220], [.45, 262], [.6, 196], [.5, 247], [.55, 220], [.5, 294], [.45, 262], [.5, 220]]) {
    p = themNot(hat, p, g, h, 0.02);
  }
  const noi = new Float32Array(SR * 6);
  p = 0;
  for (let k = 0; k < 50; k++) {
    const g = 0.06 + (k % 5) * 0.012;
    p = themNot(noi, p, g, 110 + ((k * 37) % 90), 0, 0.5) + Math.round(0.02 * SR);
  }
  const a = docGiuNot(hat, SR), b = docGiuNot(noi, SR);
  check('HAT: phan lon thoi luong nam trong not giu', a.tiLeGiuNot > 0.5, JSON.stringify(a));
  check('HAT: dem duoc nhieu not', a.soNot >= 5, String(a.soNot));
  check('HAT: co not dai >= 300ms', a.notDaiNhatMs >= 300, String(a.notDaiNhatMs));
  check('NOI: gan nhu khong co not giu', b.tiLeGiuNot < 0.25, JSON.stringify(b));
  check('HAT va NOI tach nhau ro', a.tiLeGiuNot - b.tiLeGiuNot > 0.4,
    `${a.tiLeGiuNot.toFixed(2)} vs ${b.tiLeGiuNot.toFixed(2)}`);
}

console.log('\n=== 3. Truong hop bien ===');
{
  check('clip rong -> khong nem, tra 0', docGiuNot(new Float32Array(0), SR).soNot === 0);
  check('clip ngan hon mot khung -> khong nem', docGiuNot(new Float32Array(100), SR).tiLeGiuNot === 0);
  check('duongF0 tra dung so khung',
    duongF0(new Float32Array(SR), SR).length === Math.floor((SR - 640) / 320) + 1);
}

console.log('\n' + '='.repeat(60));
console.log(`KET QUA: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
