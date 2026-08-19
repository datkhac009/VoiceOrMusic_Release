// src/updater.cjs — Tu cap nhat qua GitHub Releases.
//
// Nguoi dung bam "Cap nhat" -> app hoi GitHub xem co ban moi khong -> bao ket qua ->
// bam "Tai va cap nhat" -> tai .exe moi, thay file, tu mo lai.
//
// ⚠ CHEP LAI CAC BAI HOC DA TRA GIA o ban crawler (Crawl_DataTiktok_build/src/updater.cjs),
// dung tu phat minh lai:
//
//   1) REPO PHAI PUBLIC. Updater goi GitHub API AN DANH (khong token, vi .exe phat tan nhieu
//      may nen nhung token vao la coi nhu lo). Repo private tra 404 -> ben crawler tinh nang
//      nay CHET HAN, phai di thay .exe tay tren tung may.
//      VoiceOrMusic_Release dang PUBLIC nen chay duoc.
//
//   2) MOT SO MAY CO AV/PROXY CHAN SSL khien Node bao "unable to verify the first
//      certificate". Phai dung agent bo qua xac minh, khong thi mot so may khong bao gio
//      cap nhat duoc ma khong hieu vi sao.
//
//   3) BAY JOB OBJECT CUA ELECTRON — bug that: "tai 100% xong dong luon khong mo lai", va CHI
//      xay ra tren MOT SO may (dua thoi gian, phu thuoc toc do may). Electron gom moi tien
//      trinh con vao mot Job Object co co "giet het con khi cha thoat". Neu app.quit() don job
//      TRUOC khi cmd kip thoat ly thi file .bat bi giet ngay -> app tat, khong mo lai.
//      FIX: spawn() voi detached:true (+unref) TRUOC khi quit.
//
//   4) NGUOI DUNG DAN CA URL / THUA DAU GACH CHEO. Do that ben crawler:
//        Owner/Repo   -> HTTP 200
//        Owner/Repo/  -> HTTP 404  ("khong tim thay release" — chang ai hieu vi sao)
//      Nen nhan rong roi tu cat ve dung dang Owner/Repo.
'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');

const REPO_MAC_DINH = 'datkhac009/VoiceOrMusic_Release';
const TEN_EXE = 'VoiceOrMusic.exe';
const UA = 'VoiceOrMusic-Updater';

// Xem bai hoc (2) o dau file.
const agentBoQuaSSL = new https.Agent({ rejectUnauthorized: false });

/** Nhan ca URL GitHub / thua dau gach cheo / khoang trang, tra ve dung dang Owner/Repo. */
function chuanHoaRepo(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '');
  s = s.replace(/^\/+|\/+$/g, '');
  const p = s.split('/').filter(Boolean);
  return p.length >= 2 ? p[0] + '/' + p[1] : '';
}

/** a > b theo kieu x.y.z ? */
function moiHon(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/**
 * Tu hai so phien ban -> quyet dinh bao gi cho nguoi dung. Ham THUAN, test duoc.
 * @returns {{trangThai:string, hienTai:string, moiNhat:string}}
 *   trangThai: 'co-ban-moi' | 'da-moi-nhat' | 'ban-cu-hon'
 */
function soSanhPhienBan(hienTai, moiNhat) {
  const h = String(hienTai || '').replace(/^v/, '');
  const m = String(moiNhat || '').replace(/^v/, '');
  if (!m) return { trangThai: 'da-moi-nhat', hienTai: h, moiNhat: m };
  if (moiHon(m, h)) return { trangThai: 'co-ban-moi', hienTai: h, moiNhat: m };
  // Version KHAC nhau nhung khong moi hon = ban tren GitHub cu hon may dang chay. Van cho
  // cai (de ha ve ban cu khi mot ban moi bi loi) nhung phai goi dung ten de khong bam nham.
  if (m !== h) return { trangThai: 'ban-cu-hon', hienTai: h, moiNhat: m };
  return { trangThai: 'da-moi-nhat', hienTai: h, moiNhat: m };
}

/** Chon file .exe trong danh sach asset cua release. */
function chonAssetExe(assets) {
  return (assets || []).find(a => a && /\.exe$/i.test(a.name || '')) || null;
}

/**
 * Hoi GitHub xem co ban moi khong. KHONG nem loi — luon tra ve object de giao dien hien.
 */
function kiemTraCapNhat(tuyChon) {
  const o = tuyChon || {};
  return new Promise((resolve) => {
    const REPO = chuanHoaRepo(o.repo || process.env.UPDATE_REPO || REPO_MAC_DINH);
    if (!REPO) return resolve({ ok: false, loi: 'Chua cau hinh repo phat hanh.' });

    const req = https.request({
      hostname: 'api.github.com',
      path: '/repos/' + REPO + '/releases/latest',
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github.v3+json' },
      agent: agentBoQuaSSL,
      timeout: 20000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 404) {
          // 404 co HAI nguyen nhan can phan biet: ten repo sai, HAY repo dang private
          // (release VAN CO, chi la goi an danh khong doc duoc). Noi ro ca hai.
          return resolve({ ok: false, loi: 'Khong doc duoc release cua "' + REPO
            + '" (HTTP 404). Hoac ten repo sai, hoac repo dang PRIVATE — updater goi GitHub'
            + ' an danh nen repo private luon tra 404.' });
        }
        if (res.statusCode !== 200) {
          return resolve({ ok: false, loi: 'GitHub API loi (HTTP ' + res.statusCode + ').' });
        }
        let rel;
        try { rel = JSON.parse(body); } catch (_) {
          return resolve({ ok: false, loi: 'Doc du lieu release loi.' });
        }
        const ss = soSanhPhienBan(o.phienBanHienTai, rel.tag_name);
        const asset = chonAssetExe(rel.assets);
        resolve(Object.assign({ ok: true, repo: REPO }, ss, {
          tenBanPhatHanh: rel.name || rel.tag_name || '',
          ghiChu: rel.body || '',
          url: asset ? asset.browser_download_url : null,
          tenFile: asset ? asset.name : null,
          coBytes: asset ? asset.size : 0,
        }));
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, loi: 'Qua 20 giay khong hoi duoc GitHub.' });
    });
    req.on('error', e => resolve({ ok: false, loi: 'Loi ket noi: ' + e.message }));
    req.end();
  });
}

/** Tai .exe moi roi thay file dang chay va mo lai app. */
function taiVaCapNhat(tuyChon) {
  const o = tuyChon || {};
  return new Promise((resolve) => {
    let app;
    try { app = require('electron').app; } catch (_) {
      return resolve({ ok: false, loi: 'Khong co Electron app.' });
    }
    if (!app.isPackaged) {
      return resolve({ ok: false, loi: 'Chi cap nhat duoc o ban da dong goi (.exe). '
        + 'Ban dang chay ban phat trien.' });
    }
    if (!o.downloadUrl) return resolve({ ok: false, loi: 'Release khong co file .exe de tai.' });

    const os = require('os');
    const spawn = require('child_process').spawn;

    const tepTam = path.join(os.tmpdir(), 'VoiceOrMusic_new.exe');
    // ⚠ Ban portable: exe THAT nam o PORTABLE_EXECUTABLE_DIR, con app.getPath('exe') tro vao
    // thu muc giai nen tam trong %TEMP% — thay file o do thi khong co tac dung gi.
    const thuMuc = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
    const exeHienTai = path.join(thuMuc, TEN_EXE);
    const tepBat = path.join(os.tmpdir(), 'voiceormusic_updater.bat');

    function apDung() {
      const bat = [
        '@echo off',
        'title VoiceOrMusic Updater',
        'timeout /t 2 /nobreak >nul',
        'taskkill /F /PID ' + process.pid + ' >nul 2>&1',
        'taskkill /F /IM ' + TEN_EXE + ' >nul 2>&1',
        'timeout /t 3 /nobreak >nul',
        'set RETRIES=0',
        ':retry',
        'copy /Y "' + tepTam + '" "' + exeHienTai + '"',
        'if not errorlevel 1 goto ok',
        'set /a RETRIES+=1',
        'if %RETRIES% GEQ 10 ( echo Cap nhat that bai - file dang bi khoa. & pause & exit /b 1 )',
        'timeout /t 2 /nobreak >nul',
        'goto retry',
        ':ok',
        'del "' + tepTam + '" >nul 2>&1',
        'start "" "' + exeHienTai + '"',
        '(goto) 2>nul & del "%~f0"',
      ].join('\r\n');

      fs.writeFile(tepBat, bat, 'utf8', (err) => {
        if (err) return resolve({ ok: false, loi: 'Tao updater.bat that bai: ' + err.message });
        // ⚠ Xem bai hoc (3) o dau file: PHAI spawn detached TRUOC khi quit, khong thi tren
        // mot so may app tat luon ma khong mo lai.
        const con = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', tepBat], {
          detached: true, stdio: 'ignore', windowsHide: false,
        });
        con.unref();
        resolve({ ok: true });
        setTimeout(() => { try { app.quit(); } catch (_) {} }, 800);
      });
    }

    function tai(url, lan) {
      const n = lan || 0;
      if (n > 5) return resolve({ ok: false, loi: 'Chuyen huong qua nhieu lan.' });
      https.get(url, { headers: { 'User-Agent': UA }, agent: agentBoQuaSSL }, (res) => {
        if ([301, 302, 307, 308].indexOf(res.statusCode) >= 0) {
          res.resume();
          return tai(res.headers.location, n + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ ok: false, loi: 'HTTP ' + res.statusCode + ' khi tai file.' });
        }
        const tong = parseInt(res.headers['content-length'] || '0', 10);
        let duoc = 0;
        let ptCu = -1;
        const f = fs.createWriteStream(tepTam);
        res.on('data', (c) => {
          duoc += c.length;
          if (tong > 0 && o.onTienDo) {
            const pt = Math.round(duoc / tong * 100);
            if (pt !== ptCu) { ptCu = pt; o.onTienDo(pt); }
          }
        });
        res.pipe(f);
        f.on('finish', () => f.close(apDung));
        f.on('error', (e) => { fs.unlink(tepTam, () => {}); resolve({ ok: false, loi: e.message }); });
      }).on('error', e => resolve({ ok: false, loi: 'Loi ket noi: ' + e.message }));
    }

    try { fs.unlinkSync(tepTam); } catch (_) {}
    tai(o.downloadUrl);
  });
}

module.exports = {
  kiemTraCapNhat, taiVaCapNhat,
  chuanHoaRepo, moiHon, soSanhPhienBan, chonAssetExe,
  REPO_MAC_DINH, TEN_EXE,
};
