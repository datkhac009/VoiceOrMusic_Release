// test/soundlink.test.js — Kiem chung buoc doc dau vao (src/soundlink.cjs).
//
// Cac dang link o day KHONG phai tu tuong tuong ra: chung lay tu chinh nhung ca that da gap
// ben crawler (xem Crawl_DataTiktok_build/test/original-sound-filter.test.js):
//   • sound cua tac gia nuoc ngoai co slug tieng Nga, va dang bi %-encode ma trinh duyet
//     tra ve — tung lam bo loc ben crawler LOAI OAN hang loat sound;
//   • link da bi rut gon ve dang `/music/original-sound-<id>` du la nhac ban quyen.
// Chay: node test/soundlink.test.js
'use strict';

const S = require('../src/soundlink.cjs');
const { parseInput, extractSoundMeta, canonicalMusicUrl,
        extractVideoIds, extractMusicInfos, sliceBalanced,
        embedMusicUrl, embedVideoUrl } = S;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`   OK   ${label}`); }
  else { fail++; console.log(`   FAIL ${label} ${extra}`); }
}

(async () => {
  console.log('\n=== 1. Link sound thuong ===');
  {
    const r = parseInput('https://www.tiktok.com/music/original-sound-7411103147315349520');
    check('nhan ra la link sound', r.kind === 'music', r.kind);
    check('lay dung id', r.id === '7411103147315349520', r.id);
    const r2 = parseInput('https://www.tiktok.com/music/Foreign-Kodiene-Mixx-7411103147315349520');
    check('slug la ten bai hat van lay dung id', r2.id === '7411103147315349520', r2.id);
  }

  console.log('\n=== 2. CA THAT: slug tieng Nga, ca dang chu va dang %-encode ===');
  {
    const a = parseInput('https://www.tiktok.com/music/оригинальный-звук-7648030600474299169');
    check('slug chu Nga', a.kind === 'music' && a.id === '7648030600474299169', JSON.stringify(a));
    const enc = 'https://www.tiktok.com/music/%D0%BE%D1%80%D0%B8%D0%B3%D0%B8%D0%BD%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9-%D0%B7%D0%B2%D1%83%D0%BA-7648030600474299169';
    const b = parseInput(enc);
    check('slug %-encode', b.kind === 'music' && b.id === '7648030600474299169', JSON.stringify(b));
    const c = parseInput('https://www.tiktok.com/music/เสียงต้นฉบับ-7627390123456789012');
    check('slug tieng Thai', c.kind === 'music' && c.id === '7627390123456789012', JSON.stringify(c));
  }

  console.log('\n=== 3. Cac dang dau vao khac ma nguoi dung hay dan ===');
  {
    check('id tro',        parseInput('7411103147315349520').kind === 'music');
    check('link video',    parseInput('https://www.tiktok.com/@abc/video/7411103147315349520').kind === 'video');
    check('link rut gon',  parseInput('https://vm.tiktok.com/ZSabcdef/').kind === 'short');
    check('thieu https://', parseInput('www.tiktok.com/music/original-sound-7411103147315349520').kind === 'music');
    check('co dau ngoac/khoang trang', parseInput('  "https://www.tiktok.com/music/original-sound-7411103147315349520"  ').id === '7411103147315349520');
    check('file mp3 tren may', parseInput('D:\\test\\a.mp3').kind === 'file');
    check('link mp3 truc tiep', parseInput('https://sf16-ies-music-va.tiktokcdn.com/obj/abc123').kind === 'audio');
  }

  console.log('\n=== 4. Dau vao khong dung -> bao ro ly do, khong nem loi ===');
  {
    for (const bad of ['', '   ', 'hello', 'https://youtube.com/watch?v=abc',
                       'https://www.tiktok.com/@someuser']) {
      const r = parseInput(bad);
      check(`"${bad.slice(0, 32)}" -> invalid + co ly do`, r.kind === 'invalid' && !!r.reason, JSON.stringify(r));
    }
    check('null/undefined khong lam sap', parseInput(null).kind === 'invalid' && parseInput(undefined).kind === 'invalid');
  }

  console.log('\n=== 5. canonicalMusicUrl: chi de GOI trang, khong de suy luan noi dung ===');
  {
    const u = canonicalMusicUrl('7411103147315349520');
    check('dung dang /music/original-sound-<id>', u === 'https://www.tiktok.com/music/original-sound-7411103147315349520', u);
    // Ghi lai bai hoc ben crawler: link nay TRONG NHU original sound du la nhac ban quyen.
    // O app nay dieu do KHONG hai gi (ta phan loai bang AUDIO chu khong bang chu trong link),
    // nhung test giu lai de nguoi sau khong lo dung slug do di suy dien.
    check('slug rut gon KHONG con mang thong tin phan loai', u.includes('original-sound'));
  }

  console.log('\n=== 6. Rut playUrl tu HTML/JSON ===');
  {
    const html = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
      {"__DEFAULT_SCOPE__":{"webapp.music-detail":{"musicInfo":{"music":{
        "id":"7411103147315349520","title":"nhạc nền - abc","authorName":"abc","duration":31,
        "original":true,"playUrl":"https:\\u002F\\u002Fsf16-ies-music.tiktokcdn.com\\u002Fobj\\u002Fxyz"}}}}}
      </script></html>`;
    const m = extractSoundMeta(html);
    check('lay duoc playUrl', m.playUrl === 'https://sf16-ies-music.tiktokcdn.com/obj/xyz', m.playUrl);
    check('giai ma \\u002F thanh /', !m.playUrl.includes('u002F'), m.playUrl);
    check('lay duoc title', m.title === 'nhạc nền - abc', m.title);
    check('lay duoc duration', m.duration === 31, String(m.duration));
    check('lay duoc authorName', m.authorName === 'abc', m.authorName);
    check('lay duoc co original', m.original === true, String(m.original));
  }

  console.log('\n=== 7. Doc duoc ca JSON tho cua api/music/detail (khong phai HTML) ===');
  {
    const j = JSON.stringify({ statusCode: 0, musicInfo: { music: { playUrl: 'https://cdn/x.mp3', title: 'abc', duration: 15 }, stats: { videoCount: 88100 } } });
    const m = extractSoundMeta(j);
    check('playUrl tu JSON tho', m.playUrl === 'https://cdn/x.mp3', m.playUrl);
    check('duration tu JSON tho', m.duration === 15, String(m.duration));
  }

  console.log('\n=== 8. Luoi du phong: HTML doi cau truc, chi con regex tho ===');
  {
    const weird = '<html><body><div>...</div><script>window.X={"a":{"b":{"play_url":"https:\\/\\/cdn\\/y.m4a","title":"zzz"}}}</script></html>';
    const m = extractSoundMeta(weird);
    check('van lay duoc playUrl khi khoi JSON bien mat', m.playUrl === 'https://cdn/y.m4a', m.playUrl);
  }

  console.log('\n=== 9. Dau vao rac -> tra ve rong, khong nem loi ===');
  {
    for (const bad of ['', null, undefined, '<html></html>', '{}', 'not json at all']) {
      const m = extractSoundMeta(bad);
      check(`"${String(bad).slice(0, 20)}" -> playUrl rong`, m.playUrl === '', JSON.stringify(m));
    }
  }

  console.log('\n=== 10. DUONG EMBED (duong duy nhat chay duoc ma khong can dang nhap) ===');
  {
    check('url embed music', embedMusicUrl('7411103147315349520') === 'https://www.tiktok.com/embed/music/7411103147315349520');
    check('url embed video', embedVideoUrl('7626014774236663071') === 'https://www.tiktok.com/embed/v2/7626014774236663071');

    // Trang /embed/music/<id> liet ke video bang the <a href=".../@user/video/<id>">.
    const embedMusicHtml = `<a href="https://www.tiktok.com/@user1/video/7626014774236663071">x</a>
      <a href="https://www.tiktok.com/@user2/video/7637378200036805901">y</a>
      <a href="https://www.tiktok.com/@user1/video/7626014774236663071">trung lap</a>
      <a href="https://www.tiktok.com/@user3">khong phai video</a>`;
    const ids = extractVideoIds(embedMusicHtml);
    check('lay du 2 video id, da bo trung', ids.length === 2, JSON.stringify(ids));
    check('id dung', ids[0] === '7626014774236663071', ids[0]);
    check('html rong -> mang rong', extractVideoIds('').length === 0 && extractVideoIds(null).length === 0);
  }

  console.log('\n=== 11. CA THAT: playUrl trong musicInfos la MANG, khong phai chuoi ===');
  {
    // Nguyen van hinh dang do duoc tu trang embed that (2026-08-13). Chinh cho `playUrl`
    // la MANG da lam ban dau khong tim thay gi du du lieu nam ngay do.
    const real = `<script>{"musicInfos":{"musicId":"7411103147315349520","musicName":"Foreign (Kodiene Mixx)",`
      + `"authorName":"Kodiene! \\u0026 kugakrewceo \\u0026 Esi Ann","original":"",`
      + `"playUrl":["https://sf16-music.tiktokcdn-eu.com/obj/tos-alisg-ve-2774/o4iAz1sW"],`
      + `"covers":["https://p77-sg.tiktokcdn.com/aweme/100x100/x.jpeg"]},"author":{"id":"1"}}</script>`;
    const mi = extractMusicInfos(real);
    check('lay duoc playUrl tu mang', mi.playUrl === 'https://sf16-music.tiktokcdn-eu.com/obj/tos-alisg-ve-2774/o4iAz1sW', mi.playUrl);
    check('lay duoc musicId (de doi chieu)', mi.musicId === '7411103147315349520', mi.musicId);
    check('musicName -> title', mi.title === 'Foreign (Kodiene Mixx)', mi.title);
    check('authorName giai ma \\u0026 thanh &', mi.authorName.includes('&') && !mi.authorName.includes('u0026'), mi.authorName);
  }

  console.log('\n=== 12. sliceBalanced: cat dung khoi JSON long nhieu tang ===');
  {
    const t = 'xx{"a":{"b":{"c":1}},"d":"}khong phai ket thuc"}yy';
    const got = sliceBalanced(t, 2);
    check('cat het khoi long nhau', got === '{"a":{"b":{"c":1}},"d":"}khong phai ket thuc"}', got);
    check('bo qua dau } nam trong chuoi', JSON.parse(got).d === '}khong phai ket thuc');
    check('thieu ngoac dong -> tra rong', sliceBalanced('{"a":1', 0) === '');
  }

  console.log('\n=== 13. musicInfos hong/thieu -> bo qua, thu khoi ke tiep ===');
  {
    const two = `{"musicInfos":{"musicId":"1","playUrl":[]}} ... {"musicInfos":{"musicId":"2","playUrl":["https://cdn/ok.m4a"]}}`;
    const mi = extractMusicInfos(two);
    check('bo khoi khong co playUrl, lay khoi sau', mi.playUrl === 'https://cdn/ok.m4a', mi.playUrl);
    check('khong co musicInfos -> rong', extractMusicInfos('<html>abc</html>').playUrl === '');
    check('JSON hong -> khong nem loi', extractMusicInfos('{"musicInfos":{hong hoc').playUrl === '');
  }

  console.log('\n=== 14. extractSoundMeta cung phai chiu duoc playUrl dang MANG ===');
  {
    const j = JSON.stringify({ musicInfo: { music: { playUrl: ['https://cdn/arr.m4a'], title: 'abc' } } });
    check('deepCollect lay phan tu dau cua mang', extractSoundMeta(j).playUrl === 'https://cdn/arr.m4a', extractSoundMeta(j).playUrl);
  }

  console.log('\n=== 15. Thong tin tai khoan (de mini browser hien @ va tich xanh) ===');
  {
    const h = 'x{"authorInfos":{"secUid":"AAA","userId":"707","uniqueId":"chimhofukadzi405",'
      + '"nickName":"MHOFUKADZI","signature":"hi","verified":false,'
      + '"covers":["https://a/1.jpg","https://a/2.jpg"]},"authorStats":{}}';
    const a = S.extractAuthorInfos(h);
    check('lay duoc uniqueId', a.uniqueId === 'chimhofukadzi405', a.uniqueId);
    check('lay duoc nickName', a.nickName === 'MHOFUKADZI', a.nickName);
    check('lay duoc verified', a.verified === false, String(a.verified));
    // Khoi nay co mang `covers` long ben trong -> phai cat can bang ngoac, khong thi
    // JSON.parse nem loi va mat sach thong tin tai khoan.
    check('cat dung khoi co mang long ben trong', a.uniqueId !== '', JSON.stringify(a));
    check('khong co authorInfos -> rong', S.extractAuthorInfos('<html>x</html>').uniqueId === '');
    check('verified khong doc duoc -> null (khong doan bua)',
      S.extractAuthorInfos('{"authorInfos":{"uniqueId":"a"}}').verified === null);
  }

  console.log('\n=== 16. Truy van tra cuu YouTube/Google ===');
  {
    // ⚠ Do that 2026-08-14: tim YouTube theo TEN CHU sound ("MHOFUKADZI") tra ve 21 video
    // nhac Zimbabwe khong lien quan gi; tim theo TEN SOUND dac trung ("From The Back Funny
    // Sound Effect") thi ket qua dau trung khop chinh xac. Nen phai phan biet 2 ca de con
    // bao truoc cho nguoi dung biet ket qua co dang tin hay khong.
    const dt = S.truyVanTimKiem({ title: 'From The Back Funny Sound Effect', authorName: 'Sound Effects Depot' });
    check('ten dac trung -> danh dau dac trung', dt.dacTrung === true);
    check('ten dac trung -> tim nguyen van trong ngoac kep',
      dt.truyVan.startsWith('"From The Back Funny Sound Effect"'), dt.truyVan);

    for (const ten of ['original sound', 'nhạc nền', 'оригинальный звук', 'suara asli']) {
      const q = S.truyVanTimKiem({ title: ten, authorName: 'ai_do' });
      check(`ten chung "${ten}" -> KHONG coi la dac trung`, q.dacTrung === false, q.truyVan);
      check(`ten chung "${ten}" -> tim theo tac gia`, q.truyVan === 'ai_do tiktok', q.truyVan);
    }

    const trong = S.truyVanTimKiem({ musicId: '7411103147315349520' });
    check('khong co ten lan tac gia -> dung id', /7411103147315349520/.test(trong.truyVan), trong.truyVan);
    check('khong nem loi khi meta rong', typeof S.truyVanTimKiem({}).truyVan === 'string');

    check('url YouTube ma hoa dung',
      S.urlTimYouTube('"a b" c') === 'https://www.youtube.com/results?search_query=%22a%20b%22%20c',
      S.urlTimYouTube('"a b" c'));
    check('url Google ma hoa dung', S.urlTimGoogle('a&b').includes('a%26b'), S.urlTimGoogle('a&b'));
  }

  console.log('\n=== 17. Nhan dang VOICE PHIM / HOAT HINH qua hashtag + bio ===');
  {
    // Voice phim/anime VAN LA giong nguoi -> model audio cham "Giọng nói" va cho LAY.
    // Dau hieu duy nhat doc duoc la hashtag cua video + bio tai khoan.
    const h = '{"textExtra":[{"HashtagName":"anime","HashtagId":"5917"},{"HashtagName":"fyp"}],'
      + '"challengeInfoList":[{"challengeName":"anime"}],'
      + '"authorInfos":{"uniqueId":"devilll_mann","nickName":"Devil_Man",'
      + '"signature":"Cortos de Anime totalmente Latam","verified":false}}';
    check('lay duoc hashtag', S.extractHashtags(h).includes('anime'), JSON.stringify(S.extractHashtags(h)));
    check('bo trung hashtag 2 nguon', S.extractHashtags(h).filter(x => x === 'anime').length === 1);
    check('lay duoc bio', /Cortos de Anime/.test(S.extractBio(h)), S.extractBio(h));

    // ── DU LIEU THAT do duoc 2026-08-14 tren 7 link nguoi dung dang quet ──
    const that = [
      ['anime (Devil_Man)', ['anime', 'ai', 'sora2', 'fyp'], ['Cortos de Anime totalmente Latam'], true],
      ['cartoon (Tamysketches)', ['fhfif', 'cartoonnetwork', 'southpark', 'animatic', 'fanart'],
        ['hey there! Loves cartoons! (Currently Hazbin)'], true],
      ['game (Vickhytam)', ['mlbbgoldenmonth', 'meme', 'genshin', 'foryou'], ['@Puputtt'], false],
      ['hai huoc (Harrinson)', ['fyp', 'humor', 'comedia', 'factos'], ['MGTA Colab: mail@x.com'], false],
      ['nguoi that (X)', ['kesfetteyiz', 'family', 'on', 'kesfet'], ['Married'], false],
      ['floptok (Yartrix)', ['floptok', 'fyp', 'flopera', 'hungergames'], ['dart'], false],
      ['khong tag (ATRA)', [], ['For business enquiries'], false],
    ];
    for (const [ten, hashtags, bios, cho] of that) {
      const r = S.nhanDangPhim({ hashtags, bios });
      check(`${ten} -> ${cho ? 'NGHI PHIM' : 'binh thuong'}`, r.nghiPhim === cho,
        `${r.nghiPhim} (${r.tuKhop.join(',')})`);
    }

    check('bat duoc qua BIO khi hashtag khong co',
      S.nhanDangPhim({ hashtags: ['fyp'], bios: ['Cortos de anime totalmente latam'] }).nghiPhim === true);
    check('bao ro nguon la hashtag hay bio',
      S.nhanDangPhim({ hashtags: ['anime'], bios: [] }).nguon === 'hashtag');

    // ⚠ Nhung tu CO Y KHONG lay — de tranh loai oan hang loat.
    for (const tu of ['edit', 'fanart', 'cosplay', 'fyp', 'viral', 'meme']) {
      check(`"${tu}" KHONG duoc coi la dau hieu phim`,
        S.nhanDangPhim({ hashtags: [tu], bios: [] }).nghiPhim === false);
    }
    // Bio la cau van -> doi hoi ranh gioi tu, khong thi "film" khop ca "filmmaker".
    check('"filmmaker" trong bio khong bi coi la phim',
      S.nhanDangPhim({ hashtags: [], bios: ['freelance filmmaker for hire'] }).nghiPhim === false);
    // Nhung hashtag thi khop theo tu nam trong ("phimhoathinh" chua "hoathinh").
    check('hashtag dinh lien "phimhoathinh" van bat duoc',
      S.nhanDangPhim({ hashtags: ['phimhoathinh'], bios: [] }).nghiPhim === true);
    check('dau vao rong -> khong nghi gi', S.nhanDangPhim({}).nghiPhim === false);

    // ── Nhom PHONG VAN / TALKSHOW / PODCAST ──────────────────────────────────────
    // ⚠ Nhom nay BAT DUOC IT, va phai biet ro dieu do.
    // Voice phong van VAN LA giong nguoi -> model cham "Giọng nói" va cho LAY. Te hon nua:
    // mot clip phong van da CAT chi con loi nguoi tra loi thi ve mat am thanh GIONG HET mot
    // nguoi ngoi noi voi camera — ke ca model dem so nguoi noi cung chiu, vi trong clip chi
    // co MOT giong. Nen chi con trong vao hashtag, ma do 2026-08-14 tren danh sach that thi
    // KHONG sound nao gan #interview ca (chi capcut / fyp / motivation / realspill).
    // => Bat duoc ca nao hay ca do; ca kho van phai xem bang mini browser + Google Lens.
    for (const t of ['interview', 'podcast', 'talkshow', 'phongvan', 'entrevista']) {
      check(`hashtag "${t}" -> nghi phim/phong van`, S.nhanDangPhim({ hashtags: [t] }).nghiPhim === true);
    }
    // Va KHONG duoc dung vao du lieu that da do — day la ca thuc te, khong phai bia.
    for (const [ten, tags] of [
      ['Aliyu haidar', ['capcut']],
      ['ConMmoive', ['fyp', 'foryou', 'foryoupage']],
      ['Motivation Spark', ['motivation', 'inspiration', 'speech', 'mindset', 'discipline']],
      ['real.spillnyc (clip phong van THAT)', ['realspill', 'fyp', 'viral', 'introvert']],
    ]) {
      check(`${ten} -> KHONG bi loai oan`, S.nhanDangPhim({ hashtags: tags }).nghiPhim === false,
        JSON.stringify(S.nhanDangPhim({ hashtags: tags }).tuKhop));
    }
  }

  console.log('\n=== 17b. Tai khoan dong vai: tu xung "official" ma chua co tich xanh ===');
  {
    // Ca that: sound giong AI long tieng Kung Fu Panda. Hashtag chi co #fyp #hyp nen
    // khong the bat bang tu khoa; chi con dau hieu tai khoan.
    const po = { uniqueId: 'po_panda_official728282', nickName: 'панда жирдяй настоящий 100%', verified: false };
    const bioPo = ['официальный аккаунт По🐼 (100% НАСТОЯЩИЙ)'];
    const r = S.nhanDangPhim({ hashtags: ['fyp', 'hyp'], bios: bioPo, tacGia: po, laChuSound: true });
    check('Po panda (giong AI) -> bi bat', r.nghiPhim === true, JSON.stringify(r.tuKhop));
    check('  ... va ghi ro nguon la tai khoan', r.nguon === 'tai khoan dong vai', r.nguon);

    // ⚠ CA LOAI OAN da bat duoc khi do lai tren 32 sound that: mot nhac si that co chu
    // "official" trong TEN TAI KHOAN. Luat chi duoc doc BIO — day la hang rao chan tai pham.
    check('@the_official_shaboykary (nhac si that) -> KHONG bi loai oan',
      S.nhanDangPhim({ hashtags: [], bios: ['Shaboykary\n\nGratataa 😬'],
        tacGia: { uniqueId: 'the_official_shaboykary', nickName: 'Shaboykary ✅', verified: false },
        laChuSound: true }).nghiPhim === false);
    check('chu "official" chi nam o TEN tai khoan -> khong tinh',
      S.nhanDangPhim({ hashtags: [], bios: ['just a guy'],
        tacGia: { uniqueId: 'official_john', nickName: 'John Official', verified: false },
        laChuSound: true }).nghiPhim === false);

    check('cung tai khoan do nhung KHONG phai chu sound -> tha',
      S.nhanDangPhim({ hashtags: ['fyp'], bios: bioPo, tacGia: po, laChuSound: false }).nghiPhim === false);
    check('co tich xanh that -> tha (do la tai khoan chinh thuc that)',
      S.nhanDangPhim({ hashtags: ['fyp'], bios: ['official account of Brand'],
        tacGia: { uniqueId: 'brand_official', nickName: 'Brand', verified: true }, laChuSound: true }).nghiPhim === false);
    check('khong biet trang thai tich xanh -> tha (khong doan bua)',
      S.nhanDangPhim({ hashtags: ['fyp'], bios: ['official account of X'],
        tacGia: { uniqueId: 'x_official', nickName: 'X' }, laChuSound: true }).nghiPhim === false);

    // Do that 2026-08-14: 8 tai khoan NGUOI THAT deu phai di qua duoc.
    for (const [u, n, b] of [
      ['chimhofukadzi405', 'MHOFUKADZI', 'EVERYTHING HAPPENS FOR A REASON CONTENT CREATOR, COMEDIAN'],
      ['atradaniels', 'ATRA', ''],
      ['motivation_spark', 'Motivation Spark', ''],
      ['jujussssbreakfastclub', 'juju', ''],
      ['simplyeli__', 'eli', ''],
      ['nurtata_23', 'nurtata', ''],
    ]) {
      check(`@${u} -> KHONG bi luat tai khoan loai oan`,
        S.nhanDangPhim({ hashtags: [], bios: [b], tacGia: { uniqueId: u, nickName: n, verified: false },
          laChuSound: true }).nghiPhim === false);
    }
    // @devilll_mann / @tamysketches VAN bi loai — nhung do bio noi "Anime"/"cartoons",
    // KHONG phai do luat tai khoan. Kiem dung nguon de hai luat khong lan nhau.
    for (const [u, n, b] of [
      ['devilll_mann', 'Devil_Man', 'Cortos de Anime totalmente Latam'],
      ['tamysketches', 'Tamysketches', '✨hey there!✨ Loves cartoons!'],
    ]) {
      const x = S.nhanDangPhim({ hashtags: [], bios: [b],
        tacGia: { uniqueId: u, nickName: n, verified: false }, laChuSound: true });
      check(`@${u} -> bi loai vi BIO chu khong phai vi ten tai khoan`,
        x.nghiPhim === true && x.nguon !== 'tai khoan dong vai', `${x.nguon} ${JSON.stringify(x.tuKhop)}`);
    }
    // "official" phai la TU RIENG, khong dinh vao chu khac ("unofficial", "officials"...).
    check('tu "unofficial" khong tinh la tu xung',
      S.nhanDangPhim({ hashtags: [], bios: ['unofficial fan page'],
        tacGia: { uniqueId: 'fan1', nickName: 'Fan', verified: false }, laChuSound: true }).nghiPhim === false);
  }

  console.log('\n=== 17c. CAPTION cua video (key "text", KHONG phai "desc") ===');
  {
    // Hinh dang that cua trang embed (do 2026-08-14). Truoc do doc nham ten key la "desc"
    // nen caption LUON ra rong ma khong ai hay — test nay chan tai pham.
    const html = '<script>{"text":"","x":1}</script><script>{"text":"HIS REACTION LOLL *Full Episode in Bio* #Interview"}</script>';
    check('lay duoc caption o manh dau KHONG rong',
      S.extractCaption(html) === 'HIS REACTION LOLL *Full Episode in Bio* #Interview', S.extractCaption(html));
    check('khong co caption -> chuoi rong', S.extractCaption('<html></html>') === '');
    check('dau vao rac -> khong nem loi', S.extractCaption(null) === '' && S.extractCaption(undefined) === '');
    check('KHONG doc key "desc" (trang that khong he co key nay)',
      S.extractCaption('{"desc":"khong duoc lay cai nay"}') === '');

    // Caption dung bo cum HEP rieng, KHONG dung bo TU_PHIM rong (caption la cau van tu do).
    const cap = (c) => S.nhanDangPhim({ hashtags: [], bios: [], caption: c });
    for (const c of ['Full episode in bio', 'Watch the full interview', 'Episode 12 out now',
                     'interview with Katt Williams', 'on the podcast', 'Talk show moment',
                     'entrevista con el actor', 'phong van nghe si']) {
      check(`caption "${c.slice(0, 30)}" -> bat`, cap(c).nghiPhim === true, JSON.stringify(cap(c).tuKhop));
    }
    check('  ... va ghi nguon la caption', cap('Full episode in bio').nguon === 'caption');

    // ⚠ Do that tren 32 caption TikTok NGUYEN VAN: phai 0 cai bi loai oan.
    for (const c of ['Couldnt sleep #fyp #real #viral #quotes #foryou',
                     'Deep in my heart I have alawys hated you! Garaa Edit#anime #edit',
                     'Whatever it takes #gta #gta5 #grandtheftautov #gtaviral #fyp',
                     'Mach die 40K follow voll auf korrekt',
                     'his laugh #paradonobailao #neymar #football',
                     'Horror prank gone wrong #fyp #fypage #prank #fail',
                     'This is us being serious #fyp #bestfriend #viral',
                     'Ya somos 10k siiiiiiiii, gracias por el apoyo']) {
      check(`caption that "${c.slice(0, 32)}" -> KHONG loai oan`, cap(c).nghiPhim === false,
        JSON.stringify(cap(c).tuKhop));
    }
    // Hashtag van xet TRUOC caption — nguon phai ghi la hashtag khi ca hai cung khop.
    check('hashtag thang caption ve thu tu nguon',
      S.nhanDangPhim({ hashtags: ['anime'], bios: [], caption: 'Full episode in bio' }).nguon === 'hashtag');
  }

  console.log('\n=== 18. Anh khung hinh de tra nguoc bang Google Lens ===');
  {
    const avt = 'https://p16.tiktokcdn-eu.com/tos-alisg-avt-0068/' + 'a'.repeat(42) + '~tplv.jpeg';
    const khung = 'https://p16.tiktokcdn-eu.com/tos-alisg-p-0037/' + 'b'.repeat(35) + '~tplv-tiktokx-origin.image?x=1';

    // ⚠ Avatar phai bi loai. Truong `covers` cua original sound thuong tro toi AVATAR cua chu
    // sound — tra nguoc mot cai avatar thi vo dung. Cai dang tra la KHUNG HINH VIDEO: voi
    // sound anime/phim, Lens nhin frame do se chi thang ra ten bo phim, dieu ma tim theo TEN
    // khong bao gio lam duoc.
    check('bo avatar, lay khung hinh', S.extractAnhKhungHinh(`x "${avt}" y "${khung}" z`) === khung);
    check('chi co avatar -> tra rong', S.extractAnhKhungHinh(`x "${avt}" y`) === '');
    check('html rong -> tra rong', S.extractAnhKhungHinh('') === '');
    check('doc duoc ca URL bi escape trong trang',
      S.extractAnhKhungHinh('a "' + khung.split('/').join('\\u002F') + '" b') === khung);

    check('url Lens dung endpoint uploadbyurl',
      S.urlLens(khung).startsWith('https://lens.google.com/uploadbyurl?url='), S.urlLens(khung).slice(0, 50));
    check('url Lens ma hoa tham so',
      S.urlLens('https://a/b?c=1&d=2').includes('%26'), S.urlLens('https://a/b?c=1&d=2'));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`KET QUA: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})();
