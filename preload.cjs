// preload.cjs — cau noi DUY NHAT giua giao dien va main.
//
// Giao dien chay voi contextIsolation: true / nodeIntegration: false, nen no KHONG dung
// duoc require() hay fs. Moi thu no lam duoc deu phai di qua danh sach duoi day. Lam vay
// vi cua so giao dien la noi nguoi dung DAN LINK LA vao — khong nen cho no cham vao he
// thong tep. (Cua so phan tich thi nguoc lai, co node, nhung no khong bao gio nap noi dung
// tu internet.)
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ⚠ TUYET DOI KHONG require() file cua du an o day.
// Preload chay trong SANDBOX (Electron bat mac dinh tu ban 20), o do `require` chi nap duoc
// vai module loi nhu 'electron' — nap file thuong se NEM LOI va lam CHET CA PRELOAD. Luc do
// `window.vom` khong ton tai, giao dien im lim: bam nut khong co gi xay ra, khong bao loi.
// Da sap dung loi nay khi thu require('./src/classify.cjs') vao day.
// Can tinh toan gi thi nho main lam qua ipcRenderer.

contextBridge.exposeInMainWorld('vom', {
  batDau: (duLieu) => ipcRenderer.invoke('ui:start', duLieu),
  dung: () => ipcRenderer.invoke('ui:stop'),
  coModel: () => ipcRenderer.invoke('ui:model-ok'),
  phienBan: () => ipcRenderer.invoke('ui:phien-ban'),
  xuatKiemChung: (rows) => ipcRenderer.invoke('ui:xuat-kiem-chung', rows),

  moNgoai: (url) => ipcRenderer.invoke('ui:mo-ngoai', url),
  chupKhung: (vung) => ipcRenderer.invoke('ui:chup-khung', vung),

  // Tinh lai "lay hay loai" cho CA DANH SACH khi nguoi dung bat/tat luat ban quyen — khong
  // phai chay lai model. Nho main tinh (main goi classify.cjs) de luat chi co MOT ban: chep
  // cong thuc sang ui.js thi hai ban som muon se lech nhau.
  // Gui ca mang mot lan chu khong hoi tung dong: 50 link la 50 vong IPC vo ich.
  quyetDinhTatCa: (rows, opt) => ipcRenderer.invoke('ui:quyet-dinh', { rows, opt }),

  // Nguoi dung tu bam LAY/LOAI cho mot dong. tinhTrang = 1 | 0 | null (bo ghi de).
  // Neu bam nguoc y may thi main tu luu vao KHO HOC de canh bao cho nhung sound giong sau nay.
  danhDau: (row, tinhTrang) => ipcRenderer.invoke('ui:danh-dau', { row, tinhTrang }),
  khoHoc: (tuyChon) => ipcRenderer.invoke('ui:kho-hoc', tuyChon || {}),

  // Tu cap nhat qua GitHub Releases.
  kiemCapNhat: () => ipcRenderer.invoke('ui:kiem-cap-nhat'),
  taiCapNhat: (url) => ipcRenderer.invoke('ui:tai-cap-nhat', { url }),
  khiTienDoTai: (fn) => {
    const h = (_e, pt) => fn(pt);
    ipcRenderer.on('ui:tien-do-tai', h);
    return () => ipcRenderer.off('ui:tien-do-tai', h);
  },

  // Dang ky nhan tin tuc trong luc chay. Tra ve ham go dang ky de khong dinh ro ri.
  khiTienDo: (fn) => {
    const h = (_e, d) => fn(d);
    ipcRenderer.on('ui:progress', h);
    return () => ipcRenderer.off('ui:progress', h);
  },
  khiCoDong: (fn) => {
    const h = (_e, d) => fn(d);
    ipcRenderer.on('ui:row', h);
    return () => ipcRenderer.off('ui:row', h);
  },
});
