// src/soundlink.cjs — Doc dau vao cua nguoi dung va rut ra thu duy nhat can thiet:
// LINK FILE AUDIO that (playUrl) de dem di phan tich.
//
// Nguoi dung dan link theo nhieu dang khac nhau, nen o day nhan HET va tu nhan dien:
//   /music/<slug>-<id>      link sound chuan (slug co the la moi ngon ngu, ke ca %-encode)
//   <id>                    dan tro id 19 chu so
//   /@user/video/<id>       link VIDEO — trang video cung chua musicInfo nen lay duoc luon
//   vm.tiktok.com/xxx       link rut gon — phai theo redirect moi biet la gi
//   ...tiktokcdn.../obj/... link mp3/m4a truc tiep — bo qua buoc hoi TikTok
//   D:\ai-do.mp3            file tren may — de test khong can mang
//
// ⚠ BAI HOC LAY TU BEN CRAWLER (test/original-sound-filter.test.js): link "rut gon" ve dang
// `/music/original-sound-<id>` KHONG con giu thong tin nhac ban quyen hay khong — moi link
// deu thanh "original-sound". Nen o day canonicalMusicUrl() CHI dung de GOI trang TikTok
// (TikTok chi doc <id> ma phot lo slug), TUYET DOI khong dung slug da rut gon de suy luan
// bat cu dieu gi ve noi dung sound.
'use strict';

const ID_RE = /(\d{16,21})/;                       // id sound/video TikTok
const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|ogg|opus|flac|mp4)(\?|$)/i;

/** Link/duong dan co phai file audio truc tiep? (CDN nhac TikTok thuong KHONG co duoi file) */
function isDirectAudio(s) {
  if (!s) return false;
  if (AUDIO_EXT_RE.test(s)) return true;
  // CDN nhac cua TikTok: sf16-ies-music-*.tiktokcdn.com/obj/... hoac /aweme/.../music/
  return /tiktokcdn|byteoversea|ibytedtos|akamaized/i.test(s) && /\/obj\/|\/music\/|\/aweme\//i.test(s);
}

/** Duong dan file tren may Windows/POSIX (de test offline). */
function isLocalPath(s) {
  if (!s) return false;
  if (/^[a-zA-Z]:[\\/]/.test(s)) return true;       // D:\x.mp3
  if (s.startsWith('file://')) return true;
  return /^[.\\/]/.test(s) && AUDIO_EXT_RE.test(s); // ./x.mp3
}

/**
 * Phan loai 1 dong dau vao. KHONG goi mang — chi doc chuoi.
 * @returns {{kind:'music'|'video'|'short'|'audio'|'file'|'invalid', id?:string, url?:string, input:string, reason?:string}}
 */
function parseInput(raw) {
  const input = String(raw == null ? '' : raw).trim().replace(/^["'<]|[">']$/g, '');
  if (!input) return { kind: 'invalid', input, reason: 'dong rong' };

  if (isLocalPath(input)) return { kind: 'file', url: input, input };
  if (isDirectAudio(input) && /^https?:/i.test(input)) return { kind: 'audio', url: input, input };

  // Chi la mot cum chu so -> coi la id sound.
  if (/^\d{16,21}$/.test(input)) {
    return { kind: 'music', id: input, url: canonicalMusicUrl(input), input };
  }

  if (!/^https?:\/\//i.test(input)) {
    // Nguoi dung hay dan thieu "https://" — vá lai roi xu ly tiep, dung bat loi vo ich.
    if (/^(www\.|vm\.|vt\.|m\.)?tiktok\.com/i.test(input)) return parseInput('https://' + input);
    return { kind: 'invalid', input, reason: 'khong phai link TikTok / file audio' };
  }

  let u;
  try { u = new URL(input); } catch (_) { return { kind: 'invalid', input, reason: 'URL sai cu phap' }; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (/^(vm|vt)\.tiktok\.com$/.test(host) || /^tiktok\.com$/.test(host) && path.length <= 12) {
    return { kind: 'short', url: u.href, input };
  }
  if (!/tiktok\.com$/.test(host)) {
    return { kind: 'invalid', input, reason: `host la: ${host}` };
  }

  // /music/<slug>-<id> — decode %-encode truoc khi do id (slug tieng Nga/Thai/A Rap thuong
  // ve duoi dang %D0%BE...). Chi decode de TIM ID, khong dung slug lam gi khac.
  if (/\/music\//i.test(path)) {
    let decoded = path;
    try { decoded = decodeURIComponent(path); } catch (_) {}
    const m = decoded.match(/\/music\/[^/]*?(\d{16,21})\/?$/) || decoded.match(ID_RE);
    if (m) return { kind: 'music', id: m[1], url: canonicalMusicUrl(m[1]), input };
    return { kind: 'invalid', input, reason: 'link /music/ nhung khong thay id' };
  }

  // Link video: /@user/video/<id> hoac /v/<id> — trang nay cung nhung musicInfo.
  const mv = path.match(/\/(?:video|photo|v)\/(\d{16,21})/);
  if (mv) return { kind: 'video', id: mv[1], url: u.href, input };

  // Link TikTok dang khac (profile, tag...) — khong co sound de doc.
  return { kind: 'invalid', input, reason: 'link TikTok nhung khong tro tai sound/video nao' };
}

/**
 * Link chuan de GOI trang sound. TikTok chi doc phan <id> o cuoi, slug la de cho dep — nen
 * ghep slug co dinh van mo dung trang cua moi sound (ke ca sound cua tac gia nuoc ngoai).
 */
function canonicalMusicUrl(id) {
  return `https://www.tiktok.com/music/original-sound-${id}`;
}

/** Doi chuoi JSON bi escape kieu "\u002F" ve ky tu that. */
function unescapeJsonish(s) {
  if (!s) return '';
  return s
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003[dD]/g, '=')
    .replace(/\\\//g, '/');
}

/** Di khap object tim MOI gia tri cua cac key cho truoc. Sau lung TikTok doi cau truc JSON
 *  lien tuc, do sau/duong dan cu the KHONG dang tin — nen quet toan bo con re hon sua hoai. */
function deepCollect(obj, keys, out = {}, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 12) return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (keys.includes(k)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        if (out[k] === undefined || out[k] === '') out[k] = v;
      } else if (Array.isArray(v) && typeof v[0] === 'string' && v[0]) {
        // ⚠ playUrl co the la MANG. Trang embed cua TikTok tra ve
        // "playUrl":["https://sf16-music..."] chu khong phai chuoi — do dung cai nay ma
        // ban dau moi thu deu "khong tim thay link nhac" du du lieu nam ngay truoc mat.
        if (out[k] === undefined || out[k] === '') out[k] = v[0];
      }
    }
    if (v && typeof v === 'object') deepCollect(v, keys, out, depth + 1);
  }
  return out;
}

/**
 * Cat ra doan JSON can bang ngoac bat dau tu vi tri `from` (phai la dau '{').
 * Dung cach nay thay vi regex "tu { den } gan nhat" vi gia tri long nhau nhieu tang —
 * regex se cat cut giua chung.
 */
function sliceBalanced(text, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(from, i + 1); }
  }
  return '';
}

// ── Duong EMBED: cach lay duoc link nhac MA KHONG CAN DANG NHAP ──────────────────────
// Do thuc te 2026-08-13: trang /music/<id> thuong KHONG con nhung du lieu sound nua — no
// goi /api/music/detail/ bang JS, va API do tra ve **0 byte** neu khong co phien dang nhap.
// (Crawler ben canh doc duoc la vi no chay bang profile da dang nhap.)
// Nhung trang EMBED thi mo cong cho tat ca — va trang embed cua mot VIDEO co nguyen khoi
// "musicInfos" kem playUrl. Nen duong di la:
//     /embed/music/<musicId>  ->  danh sach video dung sound do
//     /embed/v2/<videoId>     ->  musicInfos.playUrl  ->  file m4a
const embedMusicUrl = (id) => `https://www.tiktok.com/embed/music/${id}`;
const embedVideoUrl = (id) => `https://www.tiktok.com/embed/v2/${id}`;

/**
 * Lay anh KHUNG HINH VIDEO tu trang /embed/music/<id> — de tra nguoc bang Google Lens.
 *
 * ⚠ Phai loc bo AVATAR. Truong `covers` trong musicInfos cua original sound thuong tro toi
 * AVATAR cua chu sound (duong dan co "avt-"), ma tra nguoc mot cai avatar thi vo dung. Cai
 * dang tra nguoc la KHUNG HINH VIDEO: voi sound anime/phim, Lens nhin frame do se chi thang
 * ra ten bo phim — dieu ma tim theo TEN khong bao gio lam duoc.
 */
function extractAnhKhungHinh(html) {
  if (!html || typeof html !== 'string') return '';
  // Go escape TRUOC roi moi do: trong trang, URL nam duoi ca hai dang (https:// va
  // https:\u002F\u002F). Go truoc thi chi can mot bieu thuc don gian, khong phai viet
  // bieu thuc vua khop ca hai dang — thu do rat de sai dau gach cheo.
  const sach = unescapeJsonish(html);
  const RE = /https:\/\/[^"'\s]{40,400}?(?:\.jpeg|\.image)[^"'\s]{0,220}/g;
  for (const m of sach.matchAll(RE)) {
    if (/avt-|avatar/i.test(m[0])) continue;      // bo avatar, chi lay khung hinh video
    return m[0];
  }
  return '';
}

/** Lay danh sach id video tu trang /embed/music/<id>. */
function extractVideoIds(html) {
  if (!html || typeof html !== 'string') return [];
  return [...new Set([...html.matchAll(/tiktok\.com\/@[^/"']+\/video\/(\d{16,21})/g)].map(m => m[1]))];
}

/**
 * Lay khoi musicInfos tu trang /embed/v2/<videoId>.
 *
 * Truong `original` la TIN HIEU BAN QUYEN duy nhat lay duoc mien phi o day (do 2026-08-13):
 *     nhac catalog / co ban quyen  ->  "original": ""
 *     sound do nguoi dung tao      ->  "original": true
 * Trong musicInfos KHONG co truong nao ten "copyright"/"isCopyrighted". Chu "verified" co
 * xuat hien trong trang embed nhung do la chu nam trong ma JS cua trang, khong phai du lieu
 * cua sound — dung no la doc nham.
 *
 * ⚠ `original: true` KHONG bao dam sach ban quyen: nguoi dung van co the dang lai mot ban
 * nhac co ban quyen thanh "original sound" cua ho. Nen day chi la co so de LOAI, khong phai
 * co so de NHAN — phan con lai van phai nghe bang model.
 * @returns {{playUrl:string, musicId:string, title:string, authorName:string, original:(boolean|null)}}
 */
function extractMusicInfos(html) {
  const empty = { playUrl: '', musicId: '', title: '', authorName: '', original: null };
  if (!html || typeof html !== 'string') return empty;
  const KEY = '"musicInfos"';
  let at = html.indexOf(KEY);
  while (at >= 0) {
    const brace = html.indexOf('{', at);
    if (brace < 0) break;
    const raw = sliceBalanced(html, brace);
    if (raw) {
      try {
        const o = JSON.parse(raw);
        const pu = Array.isArray(o.playUrl) ? o.playUrl[0] : o.playUrl;
        if (pu) {
          return {
            playUrl: unescapeJsonish(String(pu)),
            musicId: String(o.musicId || ''),
            title: String(o.musicName || o.title || ''),
            authorName: String(o.authorName || ''),
            // TikTok tra ve `true` (boolean) cho sound goc, chuoi rong cho nhac catalog.
            // Ghi ro 3 trang thai: true / false / null (khong doc duoc) — dung null de phan
            // biet "biet chac la nhac catalog" voi "khong biet", vi hai cai nay khac nhau
            // khi quyet dinh co loai hay khong.
            original: o.original === true || o.original === 'true' ? true
              : (o.original === '' || o.original === false || o.original === 'false' ? false : null),
            // Anh bia cua sound — de tra nguoc bang Google Lens (so ANH chu khong so ten,
            // nen voi mot frame anime/phim thi Lens chi thang ra ten phim).
            // ⚠ URL nay co x-expires (~1 ngay). Lens tai anh luc BAM NUT nen dung trong
            // phien quet thi khong sao, de sang hom sau thi link chet.
            anhBia: unescapeJsonish(String(
              (Array.isArray(o.coversLarger) && o.coversLarger[0])
              || (Array.isArray(o.coversMedium) && o.coversMedium[0])
              || (Array.isArray(o.covers) && o.covers[0]) || '')),
          };
        }
      } catch (_) { /* khoi hong -> thu khoi musicInfos ke tiep */ }
    }
    at = html.indexOf(KEY, at + 1);
  }
  return empty;
}

/**
 * Rut playUrl (+ vai thong tin phu) tu HTML trang TikTok hoac tu JSON api/music/detail.
 * Lam 2 lop vi ca 2 deu tung hong rieng le:
 *   1) Doc khoi <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"> roi JSON.parse — chinh xac.
 *   2) Khong duoc thi regex tho "playUrl":"..." — cuu duoc khi TikTok doi ten khoi script.
 * @returns {{playUrl:string, title:string, duration:number, authorName:string, original:(boolean|null)}}
 */
function extractSoundMeta(html) {
  const empty = { playUrl: '', title: '', duration: 0, authorName: '', original: null };
  if (!html || typeof html !== 'string') return empty;

  const WANT = ['playUrl', 'play_url', 'title', 'duration', 'authorName', 'original'];
  let found = null;

  // Lop 1: khoi JSON nhung san trong trang.
  const blocks = [];
  const reScript = /<script[^>]*id="(?:__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE|__NEXT_DATA__)"[^>]*>([\s\S]*?)<\/script>/gi;
  let ms;
  while ((ms = reScript.exec(html)) !== null) blocks.push(ms[1]);
  // Truong hop dau vao chinh la JSON cua api/music/detail (khong phai HTML).
  if (!blocks.length && /^\s*[{[]/.test(html)) blocks.push(html);

  for (const b of blocks) {
    let j = null;
    try { j = JSON.parse(b); } catch (_) { continue; }
    const got = deepCollect(j, WANT);
    const pu = got.playUrl || got.play_url;
    if (pu) { found = { ...got, playUrl: pu }; break; }
    if (!found && (got.title || got.duration)) found = { ...got, playUrl: '' };
  }

  // Lop 2: regex tho tren HTML nguyen ban.
  if (!found || !found.playUrl) {
    const m = html.match(/"play_?[Uu]rl"\s*:\s*"([^"]{10,})"/);
    if (m) {
      const pu = unescapeJsonish(m[1]);
      const t = html.match(/"title"\s*:\s*"([^"]{0,200})"/);
      const d = html.match(/"duration"\s*:\s*(\d+)/);
      found = {
        playUrl: pu,
        title: found?.title || (t ? unescapeJsonish(t[1]) : ''),
        duration: found?.duration || (d ? Number(d[1]) : 0),
        authorName: found?.authorName || '',
        original: found?.original ?? null,
      };
    }
  }

  if (!found) return empty;
  return {
    playUrl: unescapeJsonish(String(found.playUrl || '')),
    title: String(found.title || ''),
    duration: Number(found.duration) || 0,
    authorName: String(found.authorName || ''),
    original: typeof found.original === 'boolean' ? found.original : null,
  };
}

/**
 * Lay thong tin TAI KHOAN dang video tu trang /embed/v2/<videoId>.
 *
 * Dung de hien trong mini browser: nguoi dung nhin @tai khoan + tich xanh de tu quyet dinh
 * (sound cua phim / phong van / kenh chinh thuc thi loai).
 *
 * ⚠ Day la tac gia VIDEO, khong phai chu sound. Hai cai trung nhau khi sound la "original
 * sound" cua chinh nguoi do — do duoc 2026-08-14: voi sound goc, video dau tien trong danh
 * sach co `nickName` trung y het `musicInfos.authorName`. Voi nhac catalog thi khong video
 * nao trung, vi chu sound la hang/nghe si chu khong phai nguoi dang TikTok.
 * @returns {{uniqueId:string, nickName:string, verified:(boolean|null)}}
 */
function extractAuthorInfos(html) {
  const empty = { uniqueId: '', nickName: '', verified: null };
  if (!html || typeof html !== 'string') return empty;
  const at = html.indexOf('"authorInfos"');
  if (at < 0) return empty;
  const brace = html.indexOf('{', at);
  if (brace < 0) return empty;
  // ⚠ Phai cat CAN BANG NGOAC: khoi nay co mang `covers` long ben trong nen regex kieu
  // "tu { den } gan nhat" se cat cut giua chung roi JSON.parse nem loi.
  const raw = sliceBalanced(html, brace);
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw);
    return {
      uniqueId: String(o.uniqueId || ''),
      nickName: String(o.nickName || ''),
      verified: typeof o.verified === 'boolean' ? o.verified : null,
    };
  } catch (_) { return empty; }
}

// Ten sound "chung chung" — TikTok tu dat theo ngon ngu cua nguoi dang, khong mang thong tin
// gi. Lay danh sach nay tu chinh bo loc Original Sound ben crawler (nhieu ngon ngu vi feed
// phuc vu theo IP/vung VPN nen gap sound cua tac gia nuoc ngoai lien tuc).
const TEN_CHUNG = [
  'original sound', 'nhạc nền', 'оригинальный звук', 'เสียงต้นฉบับ', 'suara asli',
  'sonido original', 'som original', 'originalton', 'الصوت الأصلي', 'son original',
  'suono originale', 'オリジナル楽曲', '원본 소리', '原聲', 'oryginalny dźwięk',
];

/**
 * Dung truy van de tra cuu sound tren YouTube/Google.
 *
 * ⚠ VI SAO PHAI PHAN BIET TEN CHUNG: do that 2026-08-14, tim YouTube theo ten chu sound
 * ("MHOFUKADZI") tra ve 21 video nhac Zimbabwe KHONG lien quan gi. Tim theo ten sound dac
 * trung ("From The Back Funny Sound Effect") thi ket qua dau trung khop chinh xac.
 * Nen: ten dac trung -> tim NGUYEN VAN trong ngoac kep; ten chung chung -> tim theo tac gia
 * kem chu "tiktok" de thu hep, va nho rang ket qua se nhieu — nguoi xem tu phan xet.
 * @returns {{truyVan:string, dacTrung:boolean}}
 */
function truyVanTimKiem(meta = {}) {
  const ten = String(meta.title || '').trim();
  const tacGia = String(meta.authorName || '').trim();
  const chung = !ten || TEN_CHUNG.some(t => ten.toLowerCase().startsWith(t.toLowerCase()));

  if (!chung) {
    // Ngoac kep de tim nguyen van — day la ca cho ket qua dang tin.
    return { truyVan: tacGia ? `"${ten}" ${tacGia}` : `"${ten}"`, dacTrung: true };
  }
  if (tacGia) return { truyVan: `${tacGia} tiktok`, dacTrung: false };
  return { truyVan: `tiktok sound ${meta.musicId || meta.id || ''}`.trim(), dacTrung: false };
}

const urlTimYouTube = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const urlTimGoogle = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
// Google Lens tra nguoc anh theo URL. Da kiem: endpoint tra 303 (chay), va dat
// X-Frame-Options: DENY nen BUOC phai mo bang trinh duyet ngoai, khong nhung vao app duoc.
const urlLens = (urlAnh) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(urlAnh)}`;

/**
 * Lay HASHTAG cua video tu trang /embed/v2/<videoId>.
 * TikTok de hashtag o hai cho, gop ca hai cho chac:
 *   textExtra[].HashtagName        — hashtag go trong mo ta
 *   challengeInfoList[].challengeName — hashtag da duoc TikTok nhan dang thanh "challenge"
 */
function extractHashtags(html) {
  if (!html || typeof html !== 'string') return [];
  const ra = new Set();
  for (const m of html.matchAll(/"HashtagName":"([^"]{1,50})"/g)) ra.add(m[1].toLowerCase());
  for (const m of html.matchAll(/"challengeName":"([^"]{1,50})"/g)) ra.add(m[1].toLowerCase());
  return [...ra];
}

/**
 * Lay CAPTION cua video (dong chu nguoi dang viet duoi video).
 *
 * ⚠ Key la "text", KHONG phai "desc". Trang embed cua TikTok khong he co key "desc" —
 * do doc nham ten key nen suot mot thoi gian caption luon ra rong ma khong ai hay. Caption
 * la nguon chu GIAU NHAT ma trang nay co: hashtag thi bi nen thanh #fyp #viral vo nghia,
 * con caption la cau chu that ("... on Club Shay Shay", "full interview", ten phim...).
 * Lay MANH DAU khong rong — cac manh sau thuong la caption cua video khac trong trang.
 */
function extractCaption(html) {
  if (!html || typeof html !== 'string') return '';
  for (const m of html.matchAll(/"text":"((?:[^"\\]|\\.){0,400})"/g)) {
    let v = m[1];
    try { v = JSON.parse(`"${m[1]}"`); } catch (_) {}
    if (v && v.trim()) return v.trim();
  }
  return '';
}

/** Lay dong gioi thieu (bio) cua tai khoan dang video. */
function extractBio(html) {
  if (!html || typeof html !== 'string') return '';
  const m = html.match(/"signature":"((?:[^"\\]|\\.){0,300})"/);
  if (!m) return '';
  try { return JSON.parse(`"${m[1]}"`); } catch (_) { return m[1]; }
}

// ── NHAN DANG VOICE PHIM / HOAT HINH ────────────────────────────────────────────────
// Voice trong phim va anime VAN LA giong nguoi, nen model audio khong the phan biet duoc
// (da do: khong co nhan nao cho "phim"). Nhung TikTok co lo hai thu doc duoc:
//   • hashtag cua video dung sound do
//   • bio cua tai khoan dang video
// Do that 2026-08-14 tren 7 link nguoi dung dang quet:
//   sound anime  -> hashtag "anime", bio "Cortos de Anime totalmente Latam"
//   sound cartoon-> hashtag "cartoonnetwork, southpark, animatic", bio "Loves cartoons!"
//   nguoi that   -> hashtag "humor, comedia" / "family, kesfet" — khong dinh tu nao
//
// ⚠ CO Y KHONG LAY nhung tu sau, du chung hay di kem phim:
//   "edit"    — tren TikTok gan nhu video nao cung gan #edit, ke ca nguoi that quay.
//   "fanart", "cosplay" — noi ve phim nhung AUDIO thuong la giong nguoi that.
//   ten phim cu the ("hungergames", "spiderman"...) — vo han va de trung voi meme.
// Tha bo sot con hon loai oan hang loat: da co mini browser de nguoi dung bat not.
const TU_PHIM = [
  // hoat hinh / anime
  'anime', 'animes', 'manga', 'manhwa', 'manhua', 'donghua', 'amv', 'otaku',
  'cartoon', 'cartoons', 'cartoonnetwork', 'animation', 'animated', 'animatic',
  'hoathinh', 'hoạt hình', 'phimhoathinh', 'toonami', 'adultswim',
  // phim / series
  'phim', 'phimhay', 'reviewphim', 'tomtatphim', 'tómtắtphim', 'xemphim',
  'movie', 'movies', 'film', 'films', 'cine', 'cinema', 'pelicula', 'peliculas',
  'cortometraje', 'cortos', 'kdrama', 'cdrama', 'doramas', 'netflixseries',
  // phong van / talkshow / podcast — nguoi dung muon loai ca nhom nay.
  // ⚠ Nhom nay BAT DUOC IT: do that 2026-08-14 tren chinh danh sach dang quet, khong sound
  // nao gan #interview ca (chi co capcut / fyp / motivation...). Clip phong van noi tieng
  // duoc cat lai thanh meme thi gan #realspill #fyp #viral — khong dinh tu nao.
  // Nen day chi vot them duoc phan nao; ca kho van phai xem bang mini browser + Google Lens.
  'interview', 'interviews', 'phongvan', 'phỏng vấn', 'entrevista', 'wawancara',
  'podcast', 'podcasts', 'talkshow', 'talkshows',
];

// ── TAI KHOAN DONG VAI NHAN VAT ─────────────────────────────────────────────────────
// Mot lo sound "giong AI long tieng phim" den tu cac tai khoan tu xung la NHAN VAT:
//     @po_panda_official728282 — bio "официальный аккаунт По🐼 (100% НАСТОЯЩИЙ)"
// Video cua ho la trich doan phim/hoat hinh long giong AI. Ca nay:
//   • hashtag KHONG giup: chi co #fyp #hyp — do that, gom ca 5 video van khong bat duoc;
//   • audio KHONG giup: giong AI doi nay cho 'Speech synthesizer' = 0.000 (xem classify.cjs).
// Con lai dung mot dau hieu: BIO tu xung "tai khoan chinh thuc" MA CHUA CO TICH XANH.
// Tai khoan chinh thuc that thi TikTok cap tich xanh; tu nhan ma khong co tich la dau hieu
// dong vai nhan vat.
//
// ⚠ CHI DOC BIO, KHONG DOC TEN TAI KHOAN. Do lan dau tren 9 sound tuong nhu doc ca ten tai
// khoan cung sach, nhung do lai tren 32 sound that thi dinh @the_official_shaboykary —
// mot nhac si that, bio chi ghi "Shaboykary Gratataa". Chu "official" trong TEN chi la cach
// dat nick; LOI TU NHAN trong BIO moi la mot phat bieu. Doc bio thoi: bat dung Po panda,
// tha Shaboykary.
const RE_TU_XUNG = /(^|[^a-z])(official|officiel|oficial)([^a-z]|$)|официальн|chính chủ|chinh chu/i;

// ── CUM CHU CHI DICH DANH "CAT TU CHUONG TRINH PHAT SONG" ───────────────────────────
// Dung cho CAPTION (chu tu do), khong dung cho hashtag.
//
// ⚠ Do that 2026-08-14 tren 14 clip #interview/#talkshow/#tvshow/#entrevista tai ve that:
// bo cum nay bat duoc 1/14 bang CHU TU DO, va loai oan 0/32 sound thuong. Tuc la RE va AN
// TOAN, nhung KHONG phai loi giai — 13/14 clip caption chi ghi "his laugh", "Horror prank
// gone wrong"... khong he lo ra la trich tu chuong trinh nao. Dung ky vong no gac cong.
const CUM_PHAT_SONG = [
  /\bfull (episode|interview|show)\b/i,
  /\b(episode|ep\.?\s?\d+)\b/i,
  /\binterview(ed|ing|s)? (with|de|con)\b/i,
  /\bon (the )?(podcast|show)\b/i,
  /\btalk ?show\b/i,
  /\bentrevista (a|con|de)\b/i,
  /\bph[ỏo]ng v[ấa]n\b/i,
];

/**
 * Doan xem sound co phai voice phim/hoat hinh/dong vai khong.
 * @param {{hashtags?:string[], bios?:string[], tacGia?:object, laChuSound?:boolean}} dauHieu
 * @returns {{nghiPhim:boolean, tuKhop:string[], nguon:string}}
 */
function nhanDangPhim(dauHieu = {}) {
  const tags = (dauHieu.hashtags || []).map(t => String(t).toLowerCase());
  const bios = (dauHieu.bios || []).map(b => String(b).toLowerCase());
  const khop = new Set();
  let nguon = '';

  for (const t of tags) {
    // Khop theo TU NAM TRONG hashtag ("phimhoathinh" chua "hoathinh"), vi nguoi dung viet
    // dinh lien khong dau cach.
    for (const tu of TU_PHIM) {
      if (t.includes(tu)) { khop.add(tu); if (!nguon) nguon = 'hashtag'; }
    }
  }
  if (!khop.size) {
    for (const b of bios) {
      for (const tu of TU_PHIM) {
        // Bio la cau van nen doi hoi RANH GIOI TU, khong thi "film" khop ca "filmmaker".
        if (new RegExp(`(^|[^\\p{L}])${tu}([^\\p{L}]|$)`, 'u').test(b)) {
          khop.add(tu); if (!nguon) nguon = 'bio';
        }
      }
    }
  }
  // Duong THU HAI: CAPTION cua video (dong chu duoi video). Caption la cau van tu do nen
  // KHONG dung bo TU_PHIM rong o day — chu "phim"/"movie" noi vu vo trong mot cau doi
  // thuong se loai oan hang loat. Chi nhan nhung CUM chi dich danh "cat tu chuong trinh".
  if (!khop.size && dauHieu.caption) {
    const c = String(dauHieu.caption);
    for (const re of CUM_PHAT_SONG) {
      const m = c.match(re);
      if (m) { khop.add(m[0].trim().toLowerCase()); if (!nguon) nguon = 'caption'; }
    }
  }
  // Duong THU BA: tai khoan CHU SOUND tu xung "official" ma chua co tich xanh.
  // Chi xet khi biet chac day la tai khoan chu sound (laChuSound) — khong thi mot nguoi
  // dung ke sound co ten "official" se keo ca sound cua nguoi khac xuong.
  if (!khop.size && dauHieu.laChuSound) {
    const t = dauHieu.tacGia || {};
    const bio = (dauHieu.bios || []).find(Boolean) || '';
    if (t.verified === false && RE_TU_XUNG.test(bio)) {
      khop.add('bio tu xung "tai khoan chinh thuc" nhung chua co tich xanh');
      nguon = 'tai khoan dong vai';
    }
  }
  return { nghiPhim: khop.size > 0, tuKhop: [...khop], nguon };
}

module.exports = {
  parseInput, canonicalMusicUrl, extractSoundMeta, extractAuthorInfos,
  extractHashtags, extractBio, extractCaption, nhanDangPhim, extractAnhKhungHinh, TU_PHIM,
  truyVanTimKiem, urlTimYouTube, urlTimGoogle, urlLens, TEN_CHUNG,
  embedMusicUrl, embedVideoUrl, extractVideoIds, extractMusicInfos,
  isDirectAudio, isLocalPath, unescapeJsonish, deepCollect, sliceBalanced,
};
