// test/make-wav.cjs — tao file WAV gia lap de kiem chung DUONG ONG khong can mang.
//
// Muc dich KHONG phai do do chinh xac (muon do that thi phai co link TikTok that), ma la
// chung minh 4 mat noi voi nhau duoc: Electron giai ma audio -> doi 16kHz mono -> YAMNet
// chay -> ten nhan tra ve DUNG nhu classify.cjs dang cho doi.
//
// Chay: node test/make-wav.cjs <thu-muc-xuat>
'use strict';

const fs = require('fs');
const path = require('path');

const SR = 44100;

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);          // PCM, 1 kenh
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

/** Nhac gia: hop am doi theo nhip + song hai + tieng trong -> phai ra nhom NHAC. */
function fakeMusic(sec = 12) {
  const n = SR * sec, out = new Float32Array(n);
  const chords = [[261.6, 329.6, 392.0], [220.0, 277.2, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const chord = chords[Math.floor(t / 2) % chords.length];
    let v = 0;
    for (const f of chord) {
      // Them song hai bac 2/3 cho gan tieng nhac cu that, khong phai sine tran.
      v += 0.30 * Math.sin(2 * Math.PI * f * t)
         + 0.12 * Math.sin(2 * Math.PI * f * 2 * t)
         + 0.06 * Math.sin(2 * Math.PI * f * 3 * t);
    }
    v /= chord.length;
    // Trong: nhip 0.5s, bao dai ngan dan.
    const beat = t % 0.5;
    if (beat < 0.06) v += 0.35 * (Math.random() * 2 - 1) * Math.exp(-beat * 60);
    out[i] = v * 0.8;
  }
  return out;
}

/** Gan nhu im lang -> phai ra "Khong ro" (chu khong phai doan bua). */
function nearSilence(sec = 8) {
  const n = SR * sec, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * 0.0008;
  return out;
}

if (require.main === module) {
  const dir = process.argv[2] || '.';
  fs.mkdirSync(dir, { recursive: true });
  console.log(writeWav(path.join(dir, 'fake-music.wav'), fakeMusic()));
  console.log(writeWav(path.join(dir, 'near-silence.wav'), nearSilence()));
}

module.exports = { writeWav, fakeMusic, nearSilence };
