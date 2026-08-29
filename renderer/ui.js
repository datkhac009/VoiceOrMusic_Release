// renderer/ui.js — phan giao dien. KHONG co node, KHONG tu goi mang: moi viec deu nho main
// lam qua cau `window.vom` khai trong preload.cjs.
//
// Ket qua ve TUNG DONG MOT (su kien 'ui:row') chu khong doi ca me xong — quet 50 link thi
// dong dau tien hien sau vai giay thay vi ngoi nhin thanh tien do hang phut.
'use strict';

const $ = (id) => document.getElementById(id);
const ICON = { voice: '🗣', voice_bgm: '🎙', voice_bgm_loi: '🎙', singing: '🎤', music: '🎵', unknown: '❓' };

let ketQua = [];        // moi dong main gui ve
let dangChay = false;

// Tinh lai "lay hay loai" theo o "Loai nhac co ban quyen" dang bat hay tat — KHONG chay lai
// model. Nho main tinh (main goi classify.cjs) chu khong chep cong thuc sang day: chep ra la
// co 2 ban luat, ma 2 ban luat thi som muon se lech nhau.
async function capNhatQuyetDinh() {
  // ⚠ PHAI gui ca soundUrl/input: do la KHOA de main tra quyet dinh thu cong da luu.
  // Thieu hai truong nay thi main tra khoa rong -> khong tim thay gi -> moi lan bam Lay/Loai
  // deu bi bo qua trong im lang, ma nhin thi tuong nhu co tac dung (vi may cham san mot ket
  // qua nao do). Bug that, test giao dien bat duoc.
  const qd = await window.vom.quyetDinhTatCa(
    ketQua.map(r => ({
      ok: r.ok, accept: r.accept, labelVi: r.labelVi, meta: r.meta,
      soundUrl: r.soundUrl, input: r.input,
      // ⚠ PHAI gui ca label + stats: luat "khong chac" doc hai truong nay. Thieu chung thi
      // moi lan bat/tat o loc, toan bo ghi chu "can kiem tay" bien mat trong im lang.
      label: r.label, stats: r.stats, confidence: r.confidence, haiLuot: r.haiLuot,
    })),
    { loaiBanQuyen: $('oBanQuyen').checked, loaiPhim: $('oPhim').checked,
      hocTuSua: $('oHoc').checked });
  ketQua.forEach((r, i) => Object.assign(r, qd[i] || { lay: false, tinhTrang: 0 }));
}

// ── Ve bang ─────────────────────────────────────────────────────────────────────────
function veBang() {
  const chiLay = $('oChiLay').checked;
  const hien = chiLay ? ketQua.filter(r => r.ok && r.lay) : ketQua;
  const than = $('than');

  if (!hien.length) {
    than.innerHTML = `<tr><td colspan="7" class="trong">${
      ketQua.length ? 'Không có dòng nào khớp bộ lọc đang bật.'
                    : 'Chưa có kết quả. Dán link rồi bấm <b>Kiểm tra</b>.'}</td></tr>`;
    return;
  }

  than.innerHTML = hien.map((r) => {
    const stt = ketQua.indexOf(r) + 1;
    if (!r.ok) {
      return `<tr>
        <td class="so">${stt}</td>
        <td><span class="pill loi">⛔ LỖI</span></td>
        <td colspan="3" class="ten">${esc(r.error || '')}</td>
        <td class="lnk">${esc(r.soundUrl || r.input)}</td>
        <td class="tt khong">0</td></tr>`;
    }
    const s = r.stats || {};
    return `<tr>
      <td class="so">${stt}</td>
      <td><span class="pill ${r.lay ? 'lay' : 'loai'}">${r.lay ? '✅ LẤY' : '❌ LOẠI'}</span>${
        r.boiNguoiDung ? '<div class="co-nho tay">👤 bạn chọn</div>'
        : r.boiHoc ? '<div class="co-nho hoc">🧠 tự sửa theo ca đã dạy</div>' : ''}</td>
      <td>
        <div class="nhan-chinh">${ICON[r.label] || ''} ${esc(r.labelVi || '')}</div>
        ${r.tichXanh ? '<div class="co-nho">✔ tài khoản tích xanh</div>' : ''}
        ${r.banQuyen ? '<div class="co-nho">🔒 có bản quyền</div>' : ''}
        ${r.nghiPhim ? `<div class="co-nho">${r.meta?.nguon === 'tai khoan dong vai'
          ? '🎭 tài khoản đóng vai' : r.meta?.nguon === 'caption'
          ? '📺 cắt từ chương trình' : '🎬 phim/hoạt hình' + (r.meta?.tuKhop?.length
            ? ': ' + esc(r.meta.tuKhop.slice(0, 2).join(', ')) : '')}</div>` : ''}
        ${!r.chacChan && r.ghiChu?.length ? `<div class="kiem-tay"><b>⚠ cần kiểm tay</b>${
          r.ghiChu.map(x => `<i>· ${esc(x)}</i>`).join('')}</div>` : ''}
      </td>
      <td class="tincay">${Math.round((r.confidence || 0) * 100)}%</td>
      <td>${veBaThanhDo(s)}</td>
      <td>
        <div class="o-sound">
          ${r.meta?.anhBia ? `<img class="khung" src="${esc(r.meta.anhBia)}" alt="" loading="lazy">`
                           : '<div class="khung trong">?</div>'}
          <div class="o-chu">
            <div class="ten">${esc(r.meta?.title || '(không có tên)')}${
              r.meta?.authorName ? ' <span class="tacgia">— ' + esc(r.meta.authorName) + '</span>' : ''}</div>
            ${r.meta?.caption ? `<div class="cap" title="${esc(r.meta.caption)}">💬 ${
              esc(r.meta.caption.replace(/\s+/g, ' ').slice(0, 80))}${r.meta.caption.length > 80 ? '…' : ''}</div>` : ''}
            <div class="lnk">${esc(r.soundUrl || r.input)}</div>
          </div>
        </div>
      </td>
      <td class="tt ${r.lay ? 'mot' : 'khong'}">${r.lay ? 1 : 0}</td></tr>`;
  }).join('');

  // Bam vao dong nao thi mo mini browser cho dong do.
  [...than.querySelectorAll('tr')].forEach((tr) => {
    const stt = Number(tr.firstElementChild?.textContent);
    if (!stt) return;
    tr.style.cursor = 'pointer';
    tr.onclick = (e) => { if (e.target.tagName !== 'A') moPanel(stt - 1); };
  });
  if (dangXem >= 0) than.querySelectorAll('tr')[hien.indexOf(ketQua[dangXem])]?.classList.add('chon');
}

/**
 * Ve BA THANH DO RIENG cho noi / hat / nhac.
 *
 * ⚠ KHONG duoc xep chong ba cai nay thanh mot thanh. Model la DA NHAN: mot clip co the vua
 * "noi 100%" vua "nhac 46%" — ba so KHONG cong lai bang 100. Thanh xep chong se ngu y sai
 * rang chung chia nhau mot tong, va nguoi doc se hieu nham ngay tu cai nhin dau.
 * Ba ray rieng, moi ray mot mau danh muc, kem so ngay ben canh.
 */
function veBaThanhDo(s) {
  const hang = [
    ['nói', 'noi', s.speechFrac],
    ['hát', 'hat', s.singFrac],
    ['nhạc', 'nhac', s.musicFrac],
  ];
  return `<div class="do-hang">${hang.map(([ten, lop, v]) => {
    const pt = Math.round((v || 0) * 100);
    return `<span class="do-ten">${ten}</span>
      <span class="do-ray r-${lop}"><i style="width:${pt}%"></i></span>
      <span class="do-so">${pt}%</span>`;
  }).join('')}</div>`;
}

/**
 * Ve cac buoc suy luan. Du lieu den THANG tu classify.cjs (ghi tai cho luc luat chay),
 * nen no luon khop voi quyet dinh that — khong phai mot ban ke lai co the lech.
 */
function veSuyLuan(r) {
  const ol = $('pBuoc');
  const b = r.suyLuan || [];
  if (!b.length) {
    ol.innerHTML = '<li style="color:var(--chu-mo)">(không có — dòng này lỗi hoặc chưa phân tích)</li>';
    return;
  }
  const them = [];
  // Hai luot la mot buoc suy luan that su, ghep vao cuoi cho lien mach.
  if (r.haiLuot) {
    them.push({ ten: 'Nghe lại lượt 2', ket: r.haiLuot.khop ? 'hai lượt khớp nhau' : 'HAI LƯỢT LỆCH',
      chiTiet: `nửa đầu "${r.haiLuot.nhan1}" · nửa sau "${r.haiLuot.nhan2}"` });
  }
  if (r.boiHoc && r.caDay) {
    them.push({ ten: 'Đối chiếu ca bạn đã dạy', ket: 'TỰ SỬA',
      chiTiet: `${r.caDay.ten || r.caDay.khoa} — khoảng cách ${r.caDay.kc} (≤ 0.05 mới được tự sửa)` });
  }
  if (r.lyDoLoai && !r.boiNguoiDung && !r.boiHoc) them.push({ ten: 'Luật ngoài âm thanh', ket: 'LOẠI', chiTiet: r.lyDoLoai });
  them.push({ ten: 'Kết quả', ket: r.lay ? 'LẤY (1)' : 'LOẠI (0)',
    chiTiet: r.boiNguoiDung ? 'bạn tự chấm — máy không ghi đè'
           : r.boiHoc ? 'đã tự sửa theo ca bạn dạy — bấm nút bên trên nếu vẫn sai' : '' });
  ol.innerHTML = [...b, ...them].map(x =>
    `<li><b>${esc(x.ten)}:</b> ${esc(x.ket)}${x.chiTiet ? `<i>${esc(x.chiTiet)}</i>` : ''}</li>`).join('');
}

/** Bat sang nut ung voi quyet dinh dang co, va cho biet may dang cham gi. */
function veTuCham(r) {
  const banLay = r.boiNguoiDung && r.lay;
  const banLoai = r.boiNguoiDung && !r.lay;
  $('nutBanLay').classList.toggle('dang', !!banLay);
  $('nutBanLoai').classList.toggle('dang', !!banLoai);
  $('nutBanBo').disabled = !r.boiNguoiDung;
  $('tcTrangThai').textContent = r.boiNguoiDung
    ? `bạn đã chấm — máy tự chấm là ${r.accept ? 'LẤY' : 'LOẠI'}`
    : 'máy đang tự chấm';
}

async function banTuCham(tinhTrang) {
  const r = ketQua[dangXem];
  if (!r) return;
  const kq = await window.vom.danhDau({
    ok: r.ok, accept: r.accept, label: r.label, labelVi: r.labelVi,
    stats: r.stats, meta: r.meta, soundUrl: r.soundUrl, input: r.input,
  }, tinhTrang);
  await capNhatQuyetDinh();
  veBang(); veTomTat(); veSuyLuan(ketQua[dangXem]); veTuCham(ketQua[dangXem]);
  if (kq && kq.ok && tinhTrang !== null) {
    const nguoc = r.accept !== !!tinhTrang;
    $('trangThai').textContent = nguoc
      ? `Đã ghi nhớ: bạn chấm ngược ý máy (kho học có ${kq.soCaDaHoc} ca)`
      : 'Đã ghi quyết định của bạn';
  }
}

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function veTomTat() {
  const ok = ketQua.filter(r => r.ok);
  $('soLay').textContent = ok.filter(r => r.lay).length;
  $('soLoai').textContent = ok.filter(r => !r.lay).length;
  $('soLoi').textContent = ketQua.length - ok.length;
  $('soKiem').textContent = ok.filter(r => !r.chacChan).length;
  $('nutCopy').disabled = !ok.some(r => r.lay);
  $('nutCsv').disabled = !ketQua.length;
  $('nutKiemChung').disabled = !ketQua.length;
}

// ── Chay ────────────────────────────────────────────────────────────────────────────
function docLink() {
  return $('oLink').value.split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('#'));   // cho phep ghi chu bang dau #
}

async function chay() {
  const links = docLink();
  if (!links.length) { $('trangThai').textContent = 'Chưa dán link nào'; return; }
  if (!await window.vom.coModel()) {
    $('trangThai').textContent = 'Thiếu file model yamnet.tflite';
    return;
  }

  dangChay = true;
  ketQua = [];
  veBang(); veTomTat();
  $('nutChay').disabled = true;
  $('nutDung').disabled = false;
  $('oLink').disabled = true;
  document.body.classList.add('dang-chay');
  document.body.classList.remove('xong-roi');
  datTienDo(0);

  // ⚠ try/finally la BAT BUOC, khong phai cho cho chac.
  // Ban dau khong co: chi can batDau() nem loi mot lan la nut "Kiem tra" ket o trang thai
  // khoa VINH VIEN, o nhap cung khoa, dong trang thai dung nguyen dong tien do cuoi cung —
  // nguoi dung nhin thay y het "app treo" ma khong co lay mot chu bao loi. Da gap that
  // trong luc dung tool nay.
  let kq;
  try {
    kq = await window.vom.batDau({
      links,
      seconds: Number($('oGiay').value) || 120,
      loaiBanQuyen: $('oBanQuyen').checked,
      loaiPhim: $('oPhim').checked,
      hocTuSua: $('oHoc').checked,
    });
  } catch (e) {
    kq = { error: String(e && e.message || e) };
  } finally {
    dangChay = false;
    $('nutChay').disabled = false;
    $('nutDung').disabled = true;
    $('oLink').disabled = false;
    document.body.classList.remove('dang-chay');
    document.body.classList.add('xong-roi');
    datTienDo(100);
  }
  $('trangThai').textContent = kq?.error ? 'Lỗi: ' + kq.error
    : (kq?.stopped ? `Đã dừng — xong ${ketQua.length}/${links.length}`
                   : `Xong ${ketQua.length}/${links.length} link`);
}

window.vom.khiTienDo(({ i, total, phase, link }) => {
  datTienDo(Math.round((i / total) * 100));
  const viec = phase === 'fetch' ? 'đang lấy audio' : 'đang chạy YAMNet';
  $('trangThai').textContent = `[${i + 1}/${total}] ${viec}: ${String(link).slice(-34)}`;
});

/** Dat tien do o MOT cho — thanh va so % luon di cung nhau, khong lech. */
function datTienDo(pt) {
  $('thanhTienDo').style.width = pt + '%';
  $('phanTram').textContent = pt + '%';
}

window.vom.khiCoDong(async ({ row }) => {
  ketQua.push(row);
  await capNhatQuyetDinh();
  veBang();
  veTomTat();
});

// Hien phien ban ngay khi mo — de nhin la biet ban .exe dang cam co phai ban moi khong.
window.vom.phienBan().then((v) => { $('phienBan').textContent = 'v' + v; })
  .catch(() => { $('phienBan').textContent = ''; });

// ── Nut ─────────────────────────────────────────────────────────────────────────────
$('nutChay').onclick = chay;
$('nutDung').onclick = async () => {
  $('nutDung').disabled = true;
  $('trangThai').textContent = 'Đang dừng — chờ link hiện tại xong...';
  await window.vom.dung();
};
$('oChiLay').onchange = veBang;
$('oBanQuyen').onchange = async () => { await capNhatQuyetDinh(); veBang(); veTomTat(); };
$('oPhim').onchange = async () => { await capNhatQuyetDinh(); veBang(); veTomTat(); };
$('oHoc').onchange = async () => { await capNhatQuyetDinh(); veBang(); veTomTat(); };

$('nutCopy').onclick = () => {
  const ds = ketQua.filter(r => r.ok && r.lay).map(r => r.soundUrl || r.input);
  navigator.clipboard.writeText(ds.join('\n'));
  $('trangThai').textContent = `Đã copy ${ds.length} link LẤY được`;
};

$('nutBanLay').onclick = () => banTuCham(1);
$('nutBanLoai').onclick = () => banTuCham(0);
$('nutBanBo').onclick = () => banTuCham(null);

$('nutCsv').onclick = () => {
  // Xuat bang dau CHAM PHAY: Excel ban tieng Viet mac dinh tach cot bang ';', dung ','
  // thi mo len don het vao mot cot. Them BOM cho Excel doc dung tieng Viet co dau.
  const o = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const dong = [['Tinh trang', 'Ket qua', 'Nhan', 'Can kiem tay', 'Ly do can kiem',
    'Ban quyen', 'Tin cay', 'Noi %', 'Hat %', 'Nhac %',
    'Ten sound', 'Tac gia', 'Caption', 'Link', 'Loi'].map(o).join(';')];
  for (const r of ketQua) {
    const s = r.stats || {};
    const p = (x) => Math.round((x || 0) * 100);
    dong.push([
      r.ok && r.lay ? 1 : 0,
      r.ok ? (r.lay ? 'LAY' : 'LOAI') : 'LOI',
      r.ok ? r.labelVi : '',
      r.ok && !r.chacChan ? 'CAN KIEM' : '',
      (r.ghiChu || []).join(' | '),
      r.banQuyen ? 'CO' : (r.ok ? 'khong' : ''),
      r.ok ? Math.round(r.confidence * 100) : '',
      r.ok ? p(s.speechFrac) : '', r.ok ? p(s.singFrac) : '', r.ok ? p(s.musicFrac) : '',
      r.meta?.title || '', r.meta?.authorName || '', r.meta?.caption || '',
      r.soundUrl || r.input, r.error || '',
    ].map(o).join(';'));
  }
  const blob = new Blob(['﻿' + dong.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'voice-or-music.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  $('trangThai').textContent = `Đã xuất ${ketQua.length} dòng ra CSV`;
};

$('nutKiemChung').onclick = async () => {
  $('trangThai').textContent = 'Đang xuất bộ kiểm chứng...';
  // Chi gui nhung truong CAN cho trang HTML — gui ca `windows` (hang nghin so) qua IPC
  // thi nang vo ich.
  const gon = ketQua.map(r => ({
    ok: r.ok, lay: r.lay, banQuyen: r.banQuyen, labelVi: r.labelVi, error: r.error,
    stats: r.stats, meta: r.meta, soundUrl: r.soundUrl, input: r.input, tepAudio: r.tepAudio,
  }));
  const kq = await window.vom.xuatKiemChung(gon);
  $('trangThai').textContent = kq?.error ? 'Lỗi: ' + kq.error
    : (kq?.huy ? 'Đã huỷ xuất bộ kiểm chứng'
              : `Đã xuất ${kq.soDong} dòng + ${kq.soAudio} file audio vào ${kq.duongDan}`);
};


// ══════════════════ MINI BROWSER: xem video that roi tu quyet dinh ══════════════════
// Co nhung thu may khong doan duoc — sound do la phong van hay khong, co phai trich doan
// phim hay khong. Do la chuyen NOI DUNG: nhin 2 giay la ro, con model do ca ngay cung khong
// ra (da do: nhan 'Conversation'/'Narration' cho phong van THAT va doc thoai deu ~0.00).
// Nen phan do giao lai cho nguoi: xem video ngay trong app roi bam Lay/Loai.
let dangXem = -1;
let tvHienTai = { truyVan: '', dacTrung: false };

// Dung truy van tra cuu. Ban sao gon cua truyVanTimKiem() ben src/soundlink.cjs — giao dien
// khong require() duoc file cua du an (chay trong sandbox), va cho nay chi ghep chuoi de MO
// TRINH DUYET, khong tham gia quyet dinh lay/loai nao, nen lech nhau cung khong sinh loi
// phan loai. Luat quyet dinh van chi co MOT ban ben main.
const TEN_CHUNG = ['original sound', 'nhạc nền', 'оригинальный звук', 'เสียงต้นฉบับ',
  'suara asli', 'sonido original', 'som original', 'originalton', 'الصوت الأصلي',
  'son original', 'suono originale', 'オリジナル楽曲', '원본 소리', '原聲'];

function dungTruyVan(r) {
  const ten = String(r.meta?.title || '').trim();
  const tg = String(r.meta?.authorName || '').trim();
  const chung = !ten || TEN_CHUNG.some(t => ten.toLowerCase().startsWith(t.toLowerCase()));
  if (!chung) return { truyVan: tg ? `"${ten}" ${tg}` : `"${ten}"`, dacTrung: true };
  if (tg) return { truyVan: `${tg} tiktok`, dacTrung: false };
  return { truyVan: `tiktok sound ${r.id || ''}`.trim(), dacTrung: false };
}

function moPanel(i) {
  const r = ketQua[i];
  if (!r) return;
  dangXem = i;
  $('panel').classList.add('mo');
  $('manDem').classList.add('mo');
  $('pSTT').textContent = `${i + 1}/${ketQua.length}`;
  $('pTen').textContent = r.meta?.title || r.id || '(không có tên)';
  veSuyLuan(r);
  veTuCham(r);

  const t = r.meta?.tacGia || {};
  const the = [];
  if (r.ok) the.push(`<span class="the">${ICON[r.label] || ''} ${esc(r.labelVi)}</span>`);
  // Mau phai KHOP voi huy hieu trong bang: xanh = lay, DO = loai. Truoc do o day dung mau
  // vang canh bao cho LOAI trong khi bang dung do — cung mot trang thai ma hai mau.
  the.push(`<span class="the ${r.lay ? 'xanh' : 'do'}">${r.lay ? '✅ đang LẤY (1)' : '❌ đang LOẠI (0)'}${
    r.boiNguoiDung ? ' · bạn chọn' : ''}</span>`);
  if (t.uniqueId) {
    the.push(`<span class="the">@${esc(t.uniqueId)}${t.verified ? ' ✔' : ''}</span>`);
    if (t.verified) the.push('<span class="the cam">✔ tài khoản tích xanh</span>');
  }
  if (r.meta?.laChuSound) the.push('<span class="the">là chủ sound</span>');
  if (r.banQuyen) the.push('<span class="the cam">🔒 có bản quyền</span>');
  if (r.nghiPhim) {
    the.push(r.meta?.nguon === 'tai khoan dong vai'
      ? `<span class="the cam">🎭 tài khoản đóng vai nhân vật — tự xưng "official" nhưng chưa có tích xanh</span>`
      : r.meta?.nguon === 'caption'
      ? `<span class="the cam">📺 caption lộ ra là cắt từ chương trình — "${esc(r.meta.tuKhop.join(', '))}"</span>`
      : `<span class="the cam">🎬 nghi phim/hoạt hình${
        r.meta?.tuKhop?.length ? ' — ' + esc(r.meta.tuKhop.slice(0, 3).join(', ')) : ''}</span>`);
  }
  if (r.meta?.hashtags?.length) {
    the.push(`<span class="the">#${esc(r.meta.hashtags.slice(0, 5).join(' #'))}</span>`);
  }
  if (r.meta?.caption) the.push(`<span class="the">💬 ${esc(r.meta.caption.slice(0, 160))}</span>`);
  if (!r.chacChan) for (const x of (r.ghiChu || [])) the.push(`<span class="the cam">⚠ ${esc(x)}</span>`);
  if (r.ok) {
    const s = r.stats || {};
    const p = (x) => Math.round((x || 0) * 100) + '%';
    the.push(`<span class="the">nói ${p(s.speechFrac)} · hát ${p(s.singFrac)} · nhạc ${p(s.musicFrac)}</span>`);
  }
  $('pThe').innerHTML = the.join('');
  tvHienTai = dungTruyVan(r);
  $('nutLens').disabled = false;   // chup truc tiep nen khong phu thuoc anh bia nua

  // Goi y tra cuu: noi thang chat luong tim kiem se the nao, de khong ai tin nham.
  // Do that 2026-08-14: tim theo TEN SOUND dac trung ("From The Back Funny Sound Effect")
  // cho ket qua dau trung khop chinh xac; con tim theo TEN CHU sound ("MHOFUKADZI") tra ve
  // 21 video nhac Zimbabwe khong lien quan gi. Nen phai bao truoc dang o ca nao.
  $('pGoiY').innerHTML = tvHienTai.dacTrung
    ? `Tên sound đặc trưng nên kết quả <b>đáng tin</b>: thấy đúng bài này trên YouTube/Reels
       thì nhiều khả năng là nội dung đã phát hành nhiều nơi.`
    : `Sound tên chung chung nên chỉ tìm được theo <b>tên tài khoản</b> — kết quả sẽ nhiễu,
       xem để tham khảo chứ đừng loại chỉ vì có kết quả.`;

  // Nhung THANG player cua TikTok. Trang /embed/v2/ khong dat X-Frame-Options va CSP khong
  // co frame-ancestors nen nhung duoc — da kiem header truoc khi lam.
  const vid = r.meta?.videoId;
  $('pKhung').innerHTML = vid
    ? `<iframe src="https://www.tiktok.com/embed/v2/${encodeURIComponent(vid)}"
         allow="autoplay; encrypted-media; fullscreen" referrerpolicy="strict-origin"></iframe>`
    : `<div class="trong">Không có video nào dùng sound này để xem.<br>
        <span class="lnk">${esc(r.soundUrl || r.input)}</span></div>`;
  if (vid) window.vom.batTieng();     // bam mot lan la nghe duoc luon — xem ghi chu ben main.js
}

function dongPanel() {
  $('panel').classList.remove('mo');
  $('manDem').classList.remove('mo');
  window.vom.batTieng({ dung: true });  // tat vong cho bat tieng dang chay do
  $('pKhung').innerHTML = '';        // go iframe de video khong chay ngam
  dangXem = -1;
  veBang();
}

$('nutLens').onclick = async () => {
  const khung = document.querySelector('#pKhung iframe');
  if (!khung) { $('trangThai').textContent = 'Chưa có video để chụp'; return; }

  // ⚠ Phai CAT theo phan THUC SU NHIN THAY, khong dung thang getBoundingClientRect().
  // Ham do tra ve o bo cuc (iframe cao 560px) ke ca khi phan duoi da bi khung cuon che mat
  // — chup theo do thi anh lo xuong ca phan duoi panel. Da chup nham that.
  const b = khung.getBoundingClientRect();
  const oCuon = document.querySelector('.p-than').getBoundingClientRect();
  const x = Math.max(b.left, oCuon.left, 0);
  const y = Math.max(b.top, oCuon.top, 0);
  const x2 = Math.min(b.right, oCuon.right, window.innerWidth);
  const y2 = Math.min(b.bottom, oCuon.bottom, window.innerHeight);
  if (x2 - x < 30 || y2 - y < 30) {
    $('trangThai').textContent = 'Khung hình đang bị che — cuộn cho video hiện ra rồi chụp lại';
    return;
  }

  $('trangThai').textContent = 'Đang chụp khung hình...';
  const kq = await window.vom.chupKhung({ x, y, width: x2 - x, height: y2 - y });
  if (kq?.error) { $('trangThai').textContent = 'Chụp lỗi: ' + kq.error; return; }
  await window.vom.moNgoai('https://lens.google.com/');
  $('trangThai').textContent =
    `Đã chụp ${kq.rong}×${kq.cao} vào clipboard — bấm Ctrl+V trong tab Lens vừa mở`;
};
$('nutYT').onclick = () => window.vom.moNgoai(
  'https://www.youtube.com/results?search_query=' + encodeURIComponent(tvHienTai.truyVan));
$('nutGG').onclick = () => window.vom.moNgoai(
  'https://www.google.com/search?q=' + encodeURIComponent(tvHienTai.truyVan));
$('nutTT').onclick = () => {
  const r = ketQua[dangXem];
  if (r) window.vom.moNgoai(r.soundUrl || r.input);
};

$('pDong').onclick = dongPanel;
$('manDem').onclick = dongPanel;
$('pTruoc').onclick = () => moPanel(Math.max(0, dangXem - 1));
$('pSau').onclick = () => moPanel(Math.min(ketQua.length - 1, dangXem + 1));

document.addEventListener('keydown', (e) => {
  // ⚠ Hop CAP NHAT phai xet TRUOC cai chot "panel dang mo" ben duoi — no nam tren cung va
  // co the mo mot minh (khong can panel). De sau chot do thi Esc khong bao gio den duoc.
  if (e.key === 'Escape' && $('hopCapNhat').classList.contains('mo')) return cnDong();
  if (!$('panel').classList.contains('mo')) return;
  if (e.key === 'Escape') return dongPanel();
  else if (e.key === 'ArrowLeft') moPanel(Math.max(0, dangXem - 1));
  else if (e.key === 'ArrowRight') moPanel(Math.min(ketQua.length - 1, dangXem + 1));
});

// ── TU CAP NHAT ─────────────────────────────────────────────────────────────────────
// Luong: bam "Cap nhat" -> hoi GitHub -> hien co ban moi hay chua -> bam "Tai va cap nhat".
let cnUrl = null;
let cnBoTienDo = null;

function cnMo() { $('hopCapNhat').classList.add('mo'); }
function cnDong() {
  $('hopCapNhat').classList.remove('mo');
  if (cnBoTienDo) { cnBoTienDo(); cnBoTienDo = null; }
}

async function cnKiemTra() {
  cnUrl = null;
  $('cnTai').hidden = true;
  $('cnMoTrang').hidden = true;
  $('cnKhoiTD').hidden = true;
  $('cnThan').innerHTML = 'Đang hỏi GitHub…';
  cnMo();

  let r;
  try { r = await window.vom.kiemCapNhat(); }
  catch (e) { r = { ok: false, loi: String(e && e.message || e) }; }

  if (!r || !r.ok) {
    $('cnThan').innerHTML = `<div class="cn-ver cn-loi">Không kiểm tra được</div>
      <div>${esc((r && r.loi) || 'lỗi không rõ')}</div>`;
    return;
  }

  const hien = esc(r.hienTai), moi = esc(r.moiNhat);
  if (r.trangThai === 'da-moi-nhat') {
    $('cnThan').innerHTML = `<div class="cn-ver cn-moi">✅ Đang dùng bản mới nhất</div>
      <div>Bản trên máy: <b>v${hien}</b> — không có gì cần cập nhật.</div>`;
    $('cnMoTrang').hidden = false;
    return;
  }

  // Co ban khac -> cho tai. Ban CU HON phai goi dung ten, khong duoc de nguoi dung bam
  // "cap nhat" roi tu dung tut ve ban cu ma khong biet.
  const laCu = r.trangThai === 'ban-cu-hon';
  $('cnThan').innerHTML =
    `<div class="cn-ver ${laCu ? 'cn-cu' : 'cn-moi'}">${laCu ? '⚠ Bản trên GitHub CŨ HƠN' : '🎉 Có bản mới'}</div>
     <div>Trên máy <b>v${hien}</b> → trên GitHub <b>v${moi}</b>${
       laCu ? ' — bấm tải là <b>hạ về bản cũ</b>, chỉ làm khi bản mới bị lỗi.' : ''}</div>
     ${r.tenFile ? `<div style="color:var(--chu-2);font-size:11.5px;margin-top:3px">${esc(r.tenFile)}${
       r.coBytes ? ' · ' + Math.round(r.coBytes / 1048576) + ' MB' : ''}</div>` : ''}
     ${r.dongGoi === false ? '<div class="cn-cu" style="margin-top:8px">⚠ Bạn đang chạy bản phát triển '
       + '(chưa đóng gói) nên chỉ kiểm tra được, không tải thay được.</div>' : ''}
     ${r.ghiChu ? `<div style="margin-top:10px;color:var(--chu-2);font-size:11.5px">Có gì mới:</div>
       <pre>${esc(r.ghiChu.slice(0, 4000))}</pre>` : ''}`;
  cnUrl = r.url || null;
  $('cnTai').hidden = !cnUrl || r.dongGoi === false;
  $('cnTai').textContent = laCu ? '⬇ Tải và hạ về bản này' : '⬇ Tải và cập nhật';
  $('cnMoTrang').hidden = false;
}

async function cnTaiVe() {
  if (!cnUrl) return;
  $('cnTai').disabled = true;
  $('cnKhoiTD').hidden = false;
  $('cnTD').style.width = '0%';
  $('cnPhanTram').textContent = '0%';
  cnBoTienDo = window.vom.khiTienDoTai((pt) => {
    $('cnTD').style.width = pt + '%';
    $('cnPhanTram').textContent = pt + '%';
  });

  let r;
  try { r = await window.vom.taiCapNhat(cnUrl); }
  catch (e) { r = { ok: false, loi: String(e && e.message || e) }; }

  if (r && r.ok) {
    $('cnThan').innerHTML = `<div class="cn-ver cn-moi">✅ Tải xong — đang thay file</div>
      <div>App sẽ <b>tự tắt rồi mở lại</b> sau vài giây. Nếu sau 30 giây không thấy mở lại,
      bấm đúp <b>VoiceOrMusic.exe</b> như bình thường.</div>`;
    $('cnTai').hidden = true;
  } else {
    $('cnThan').innerHTML = `<div class="cn-ver cn-loi">Cập nhật thất bại</div>
      <div>${esc((r && r.loi) || 'lỗi không rõ')}</div>`;
    $('cnTai').disabled = false;
  }
}

$('nutCapNhat').onclick = cnKiemTra;
$('cnDong').onclick = cnDong;
$('cnTai').onclick = cnTaiVe;
$('cnMoTrang').onclick = () => window.vom.moNgoai('https://github.com/datkhac009/VoiceOrMusic_Release/releases');
