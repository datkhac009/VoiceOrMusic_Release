# VoiceOrMusic — lọc sound TikTok theo giọng người

**Phiên bản hiện tại: 0.7.0** — xem [CHANGELOG.md](CHANGELOG.md) để biết bản nào có gì.
Số phiên bản hiện ở 4 chỗ: thanh tiêu đề cửa sổ, huy hiệu cạnh tên app trong giao diện, đầu báo
cáo dòng lệnh, và đầu trang bộ kiểm chứng. File `.exe` cũng mang đúng số đó trong Properties.

Dán link sound TikTok vào, công cụ tải audio thật về, chạy model **YAMNet** (Google, huấn luyện
trên AudioSet) rồi trả về 1 trong 5 nhãn kèm quyết định **LẤY / LOẠI** theo bộ lọc
*"chỉ lấy sound có giọng người nói"*:

| | Nhãn | Nghĩa |
|---|---|---|
| ✅ **LẤY** | 🗣 **Giọng nói** | người nói, không có nhạc |
| ✅ **LẤY** | 🎙 **Giọng nói + nhạc nền** | người nói trên nhạc nền **không lời** |
| ✅ **LẤY** | 🎙 **Giọng nói + nhạc nền CÓ LỜI** | người **nói**, nhạc nền có giọng hát — lấy được nhưng **tự kiểm bản quyền** |
| ❌ LOẠI | 🎤 **Hát** | chính người đó hát hoặc rap |
| ❌ LOẠI | 🎵 **Nhạc** | không nghe ra giọng người |
| ❌ LOẠI | ❓ **Không rõ** | quá ngắn, gần như im lặng, hoặc không nhóm nào đủ mạnh |

⚠ **Máy KHÔNG phân biệt được nhạc nền có lời hay không lời.** Đo thật (ghép giọng nói lên bài
hát thật ở 3 mức): nhạc nhỏ đủ để giọng nói nổi lên thì điểm hát = **0%**; nhạc to đủ để nghe ra
tiếng hát thì giọng nói đã bị nuốt. Nên **mọi dòng có nhạc nền** đều mang lời nhắc tự kiểm bản
quyền — xem mục *Cần kiểm tay*.

**Rap vẫn bị LOẠI.** Phân biệt bằng: giọng nói phủ gần kín clip mà vẫn có tiếng hát → chính
người đó hát/rap; giọng nói có đứt quãng → đang nói đè lên một bản nhạc.

## Dùng — 2 cách

**Cách 1: bấm đúp `VoiceOrMusic.exe`** → mở giao diện. Dán link (mỗi dòng 1 link) → bấm
**Kiểm tra** → xem bảng ✅ LẤY / ❌ LOẠI → bấm **Copy link LẤY được** hoặc **Xuất CSV**.
Có nút **Dừng**, ô chỉnh số giây phân tích, và ô **Chỉ hiện LẤY**.

Build ra file .exe:
```bat
build.bat          :: ra ..\VoiceOrMusic_Release\VoiceOrMusic.exe (~71 MB, portable)
```

Bấm đúp `build.bat` là xong. Nếu gõ trong cmd mà báo *"not recognized"* thì gõ `.\build.bat`
— máy này đặt `NoDefaultCurrentDirectoryInExePath=1` nên cmd không tự tìm file ở thư mục hiện tại.

**Cách 2: dòng lệnh**

```bat
check.cmd https://www.tiktok.com/music/original-sound-7411103147315349520
check.cmd 7411103147315349520                  :: dán trơ id cũng được
check.cmd --file=links.txt                     :: mỗi dòng 1 link (dòng bắt đầu bằng # là ghi chú)
check.cmd --only-voice --file=links.txt        :: CHỈ in sound LẤY được + danh sách link ở cuối
check.cmd --json <link>                        :: JSON cho máy đọc (có trường "accept")
check.cmd --seconds=15 <link>                  :: chỉ phân tích 15 giây đầu (nhanh hơn)
check.cmd -v <link>                            :: in từng bước để dò lỗi
check.cmd --json --dump-windows <link>         :: xuất điểm từng cửa sổ để hiệu chỉnh ngưỡng
check.cmd --do-nhan="Applause|Crowd" <link>    :: đo điểm những nhãn cụ thể (để chỉnh bằng số)
check.cmd --out=ketqua.txt <link>              :: ghi kết quả ra file
```

⚠ Bản **.exe** chạy dòng lệnh thì **không in ra màn hình được** (Windows không gắn console cho
app đóng gói — kể cả `> file.txt` cũng ra file rỗng). Nó **tự ghi** ra `VoiceOrMusic-ketqua.txt`
cạnh file .exe, hoặc dùng `--out=` để chọn chỗ khác.

Nhận được các dạng: link `/music/...` (slug tiếng gì cũng được, kể cả `%`-encode), link video
`/@user/video/...`, link rút gọn `vm.tiktok.com`, id trơ, link mp3/m4a trực tiếp, và file audio
trên máy (tiện để tự kiểm chứng).

## Cột "Tình trạng" và luật bản quyền

Bảng kết quả có cột **Tình trạng**: `1` = LẤY, `0` = LOẠI. Cột này cũng nằm trong CSV, nên dán
thẳng sang Sheet là lọc được ngay.

Ô **"Loại nhạc có bản quyền"** (mặc định bật): TikTok đánh dấu mỗi sound là *original sound*
(người dùng tự tạo) hay không. Đo được ngày 2026-08-13 trên trang embed:

```
nhạc catalog / có bản quyền  ->  "original": ""
sound do người dùng tạo      ->  "original": true
```

Sound `original: ""` bị gán `0` **kể cả khi nghe ra là giọng người** — đúng yêu cầu "sound có
tích xanh thì auto Loại". Bảng vẫn hiện nhãn nghe được kèm dấu 🔒 nên nhìn là biết vì sao bị loại.

Ba điều cần biết về luật này:

- **Nó có thể loại thứ bạn muốn giữ.** Ví dụ thật: `From The Back Funny Sound Effect`
  (Sound Effects Depot) nghe ra *Giọng nói 93%* nhưng TikTok xếp là catalog → `0`. Nếu bạn muốn
  giữ loại này thì **tắt ô đó** — kết quả tính lại ngay, không phải chạy lại.
- **`original: true` không bảo đảm sạch bản quyền.** Người dùng vẫn có thể đăng lại nhạc có bản
  quyền thành "original sound" của họ. Nên đây là căn cứ để **loại**, không phải căn cứ để **nhận**.
- **Không đọc được thông tin thì KHÔNG coi là có bản quyền.** Nếu TikTok đổi cấu trúc dữ liệu,
  luật này tự im lặng thay vì loại sạch cả danh sách.

## Loại voice phim / hoạt hình

Voice trong phim và anime **vẫn là giọng người** — model audio không tách được, nó chấm
"Giọng nói" rồi cho LẤY. Nhưng TikTok lộ **hashtag của video** và **bio tài khoản**:

```
#anime, #cartoonnetwork, #animatic, #phim, #hoathinh...
bio: "Cortos de Anime totalmente Latam" / "Loves cartoons!"
```

Ô **"Loại voice phim/hoạt hình"** (mặc định bật) dùng hai tín hiệu đó. Bảng hiện 🎬 kèm **từ
khớp** nên nhìn là biết vì sao bị loại; tắt ô là tính lại ngay, không chạy lại model.

Không tốn thêm request: hashtag đọc ngay trên trang video đã tải để lấy audio.

Luật cũng bắt nhóm **phỏng vấn / talkshow / podcast** (`interview`, `phongvan`, `podcast`,
`talkshow`…) — nhưng **bắt được ít**: một clip phỏng vấn đã cắt chỉ còn lời người trả lời thì về
mặt âm thanh *giống hệt* người ngồi nói với camera, và thực tế đo được là hầu như không ai gắn
`#interview` (clip phỏng vấn Katt Williams gắn `#realspill #fyp #viral`). Ca đó phải xem bằng
mini browser + 📸 Ống kính.

### ⚠ Cần kiểm tay

Máy có những ca đoán được nhưng **không chắc**. Những dòng đó mang huy hiệu vàng ngay dưới cột
**NHÃN**, kèm lý do, và thẻ số "Cần kiểm tay" đếm tổng. Có ở **cả bên LẤY lẫn bên LOẠI**.

Bảy dấu hiệu: nhạc lấn giọng · nói nhiều mà vẫn bị chấm là hát · bằng chứng hát mỏng · còn cửa
sổ nghi hát · điểm hát/tỉ lệ nói sát ngưỡng · giọng yếu so với nhạc · nghe ra nhiều giọng nói.

Quan trọng nhất là **nhạc lấn giọng**: khi bị chấm Nhạc/Hát nhưng vẫn còn ≥15% cửa sổ có giọng
nói, rất có thể đó là **giọng nói bình thường ghép nhạc** chứ không phải giọng đang hát — máy
không phân biệt được nên nó nói thẳng ra thay vì loại thầm.

Đã hiệu chỉnh trên 46 sound thật để tỉ lệ rơi vào **~26%** số dòng. Bộ luật đầu tiên dán tới 35%
(vì lấy cả "tin cậy thấp" và "clip ngắn") — nhiều dòng trong đó rất rõ ràng, nên đã bỏ.

Xuất CSV có 2 cột `Can kiem tay` + `Ly do can kiem` để lọc trong Excel.

Ngoài hashtag, app còn đọc **caption** (dòng chữ người đăng viết dưới video) bằng một bộ cụm
hẹp riêng: `full episode`, `interview with`, `on the podcast`, `talk show`, `entrevista con`,
`phỏng vấn`… Đo trên 14 clip phỏng vấn thật: bắt thêm **1/14**; đo trên 32 sound thường: loại
oan **0/32**. Rẻ và an toàn nhưng **không phải lời giải** — 13/14 clip caption chỉ ghi "his
laugh", "Horror prank gone wrong", chẳng lộ ra là cắt từ chương trình nào.

**Caption hiện thẳng trong bảng** (dòng 💬 dưới tên sound). Với hàng LẤY thì đây là thứ đáng
liếc nhất: người đăng viết gì thường nói lên nhiều hơn mọi thứ máy đoán được.

Còn nhận diện phỏng vấn **bằng âm thanh** thì đã đo và **đóng hẳn**: trên 14 clip phỏng vấn
thật, `Applause` = 0.000 cả 14, `Cheering`/`Crowd`/`Television` đều ≤ 0.08 — thấp hơn cả sound
thường. Không có khe nào để dựng ngưỡng (chi tiết ở `QUY-TRINH.md` mục 7c).

⚠ Cố ý **không** lấy `edit`, `fanart`, `cosplay` hay tên phim cụ thể — `#edit` thì video nào
cũng gắn, `fanart`/`cosplay` nói về phim nhưng audio thường là người thật, tên phim thì vô hạn
và dễ trùng meme. Thà bỏ sót còn hơn loại oan, đã có mini browser để bắt nốt.

## Bộ kiểm chứng — nghe lại để chấm máy đúng hay sai

Bấm **Xuất bộ kiểm chứng** → chọn thư mục → app ghi ra:

```
VoiceOrMusic-kiem-chung/
  kiem-chung.html     mở bằng trình duyệt
  audio/              chính đoạn audio đã phân tích
```

Trang HTML có nút **Play** cho từng sound, kèm nhãn máy chấm và các con số. Nghe xong đánh dấu
**Đúng / Sai**, sai thì ghi đúng ra phải là gì, rồi bấm **Gom nhận xét** và gửi lại phần chữ đó.

Đây là cách duy nhất để chỉnh ngưỡng có căn cứ: model đo bằng số, tai người nghe bằng tai — phải
đối chiếu được hai cái mới biết ngưỡng đặt đúng chưa.

Chạy bằng dòng lệnh cũng được:

```bat
check.cmd --kiem-chung=D:\kc --file=links.txt
```

## Mini browser — xem video rồi tự quyết định

Bấm vào một dòng trong bảng → panel trượt ra, **nhúng player TikTok thật**. Hiện kèm
**@tài khoản + tích xanh**, có phải chủ sound không, nhãn máy chấm và các con số.

Hai nút **✅ Lấy (1)** / **❌ Loại (0)** ghi đè quyết định của máy — thắng cả luật bản quyền.
Bấm xong tự nhảy dòng kế; phím ← → đổi dòng, Esc đóng.

Quyết định của bạn được **nhớ theo link** (`%APPDATA%\VoiceOrMusic\quyet-dinh-tay.json`), lần
sau quét lại link đó tự áp lại — dùng chung cho cả giao diện lẫn dòng lệnh.

Panel còn có **📸 Chụp + Google Ống kính / 🔎 YouTube / 🔎 Google / ↗ Mở trên TikTok**.

Nút chụp **chụp đúng khung hình bạn đang xem** (không phải ảnh bìa cố định — cảnh cần nhận ra
có thể ở giây thứ 10), chép vào clipboard rồi mở Lens để bạn dán `Ctrl+V`. Lens so **ảnh** nên
với một frame anime/phim nó chỉ thẳng ra tên bộ phim — thứ mà tìm theo tên không làm được.

Lần đầu, TikTok hiện banner cookie che phần dưới khung hình: **bấm thẳng vào nó một lần** là
không hiện lại nữa. để tra cứu sound trên nền tảng khác.
Truy vấn tự dựng: tên sound đặc trưng thì tìm nguyên văn, tên chung chung thì tìm theo tài khoản
— và panel **báo trước kết quả có đáng tin không**, vì đo thật cho thấy tìm theo tên tài khoản
ra rất nhiều thứ vô can (tìm `MHOFUKADZI` ra 21 video nhạc Zimbabwe không liên quan). Vì vậy
việc "có trên YouTube thì loại" **không được tự động hoá** — bạn nhìn rồi tự quyết.

**Vì sao cần phần này:** "phỏng vấn" hay "trích đoạn phim" không phải tính chất âm thanh mà là
chuyện *nội dung*. Đã đo thật: hai nhãn gần nhất của YAMNet (`Conversation`, `Narration,
monologue`) cho phỏng vấn thật và độc thoại **cùng ~0.00**, không tách được. Nhìn video 2 giây
thì rõ ngay. Nên máy lo phần đo được (nhạc/hát/bản quyền), bạn lo phần chỉ người mới biết.

## Cần gì để chạy

- **Node** (để chạy `run.cjs`).
- **Electron** — không cài riêng; `run.cjs` tự tìm bản có sẵn ở `../Crawl_DataTiktok_build`.
  Muốn chỉ chỗ khác: `set ELECTRON_PATH=D:\...\electron.exe`.
- `models/yamnet.tflite` (4,1 MB) — đã có sẵn trong repo.
- `npm install` một lần để có `@mediapipe/tasks-audio`.

## Cách nó chạy

```
link  ──►  lấy link file nhạc  ──►  tải audio  ──►  giải mã + đổi 16kHz mono  ──►  YAMNet  ──►  gộp ra nhãn
           (main.js)                (main.js)      (renderer, Web Audio)      (renderer)   (classify.cjs)
```

**Vì sao chạy trên Electron chứ không phải Node thuần.** Node không tự giải mã được mp3/m4a —
bình thường phải kéo ffmpeg ~80 MB đi kèm. Electron mang sẵn Chromium, mà Chromium có
`decodeAudioData()` giải mã mp3/AAC/ogg **và** `OfflineAudioContext` đổi tần số mẫu về 16 kHz
mono bằng C++ có sẵn. Model MediaPipe cũng là WASM cho trình duyệt. Nên Electron ở đây là **bộ
máy tính toán**, không hiện cửa sổ nào.

**Vì sao đi đường `/embed/`.** Đo ngày 2026-08-13: trang `/music/<id>` **không còn nhúng dữ liệu
sound**; nó gọi `/api/music/detail/` bằng JS, và API đó trả về **0 byte** nếu không có phiên đăng
nhập. (Crawler cạnh bên đọc được là vì chạy bằng profile đã đăng nhập.) Trang **embed** thì mở cho
tất cả:

```
/embed/music/<musicId>   →  danh sách video dùng sound đó
/embed/v2/<videoId>      →  musicInfos.playUrl  →  file audio
```

Có đối chiếu `musicId` trước khi nhận file: link `playUrl` lấy từ trang của **một video**, nếu
không kiểm thì có thể đi phân tích nhầm bài khác mà vẫn báo "xong".

Nếu đường embed hỏng, còn 2 lớp dự phòng: gọi thẳng trang `/music/`, rồi mở cửa sổ ẩn cho Chromium
chạy JS của TikTok.

## Có cần Vocal Separation (tách giọng) không? — Chưa cần

Tách giọng (Demucs/Spleeter) giải quyết đúng **một** việc: khi nhạc át giọng thì tách stem vocal
ra rồi mới dò giọng. Nhưng nó **không** giải quyết bài toán chính ở đây — sau khi tách xong vẫn
phải phân biệt *stem đó là nói hay hát*, tức vẫn quay về đúng bước phân loại này. Giá phải trả thì
lớn: model ~300 MB, chậm vài giây tới vài phút mỗi clip trên CPU.

YAMNet vốn đã cho `Speech` và `Singing` là **hai điểm số riêng biệt**, nên "Audio Classification +
Speech Detection" là đủ. Chỉ nâng lên tách giọng khi đo trên dữ liệu thật thấy tỉ lệ sai đủ lớn để
đáng.

## Ngưỡng hát: dựa trên số đo, không phải ước lượng

Đo 2026-08-13 trên 7 mẫu (2 bản hát thật từ Wikimedia, 3 mẫu tự tạo, 2 sound TikTok thật):

| mẫu | số cửa sổ có điểm hát > 0.02 | tỉ lệ | đỉnh |
|---|---|---|---|
| hát hợp xướng (thật) | 4/31 | 13% | **0.738** |
| hát giọng nữ (thật) | 2/10 | 20% | 0.059 |
| tiếng nói | 0/19 | 0% | **0.000** |
| nói + nhạc nền | 0/19 | 0% | **0.000** |
| nhạc không lời | 0/13 | 0% | **0.000** |
| 2 sound TikTok thật | 0/42 | 0% | 0.008 |

Nhãn `Singing` của YAMNet **bắn ra rất dè dặt** — ngay cả trên hát thật nó cũng chỉ cho điểm thấp
ở phần lớn cửa sổ. Nhưng bù lại, trên thứ **không phải** hát thì nó cho đúng `0.000`. Nghĩa là mọi
điểm khác 0 đều đáng giá, và ranh giới nằm ở **0.0x chứ không phải 0.2**.

Ngưỡng ban đầu (`tSing 0.18` / `fSing 0.30`) khiến hát thật **không bao giờ** được gán nhãn `Hát`:
bản hợp xướng thật bị gọi là "Nhạc". Với bộ lọc thì kết quả cuối vẫn là LOẠI nên không lộ ra —
**nhưng ca nguy hiểm thì lộ**: người *nói* trên một bản nhạc **có lời** sẽ lọt thành ✅ LẤY. Nay
`tSing 0.02` / `fSing 0.06`, cộng đường thứ hai `sMaxSing 0.45` (chỉ cần **một** cửa sổ có điểm
hát cao là loại — bắt được clip chỉ hát vài giây).

### Ca then chốt đã dựng lại bằng audio thật

Ghép **giọng đọc thật** chồng lên một **bản hát thật** ở 3 mức to nhỏ của phần nền:

| mẫu | hát | kết quả |
|---|---|---|
| bản hát thật (có nhạc) | 80% (đỉnh 0.50) | ❌ **Hát** |
| nói + nhạc nền **có lời**, nền mức 0.3 | **11%** | ❌ **LOẠI** |
| nói + nhạc nền **có lời**, nền mức 0.5 | 26% | ❌ **LOẠI** |
| nói + nhạc nền **có lời**, nền mức 0.7 | 37% | ❌ **LOẠI** |
| nói + nhạc nền **không lời** | 0% | ✅ **LẤY** |

Ca khó nhất (nền mở nhỏ nhất) chỉ được **2/19 cửa sổ = 11%** — nên `fSing` để 0.10 là quá sát,
nhạc nền nhỏ hơn chút nữa sẽ lọt. Hạ về **0.06** = *"cần ít nhất 2 cửa sổ có hát"* với clip
19–31 cửa sổ: vừa bắt được ca khó, vừa không để **một** cửa sổ nhiễu đơn độc loại oan
(1/19 = 5,3% < 6%).

## Giới hạn đã đo được, không phải lỗi

- **Nhạc to hơn hẳn giọng → ra "Nhạc".** Đo thật: trộn giọng ở mức 0.6 với nhạc ở mức 0.9 thì
  YAMNet báo `Speech` 0%. Giới hạn của model, không phải của code. Đây là chỗ tách giọng sẽ giúp,
  nếu sau này thấy cần.
- **Rap có thể bị nhận là `Speech` thay vì `Singing`.** Trên sound TikTok đã thử, phần vocal chỉ
  chiếm 16% số cửa sổ nên vẫn ra "Nhạc" đúng; nhưng một bản rap dày lời có thể vượt `fSpeech 35%`
  và lọt thành ✅ LẤY. Chưa gặp ca thật nào, cần thêm dữ liệu để chốt.
- **Ngưỡng hát mới chỉ hiệu chỉnh trên 2 bản hát thật.** Cần chạy trên danh sách sound thật của
  bạn rồi soi các ca sát ngưỡng để chỉnh tiếp.
- Mặc định chỉ phân tích **30 giây đầu** (đổi bằng `--seconds=`). Sound TikTok thường 15–60s.
- Sound **đã xoá** hoặc **chưa có video nào dùng** thì không lấy được audio → báo lỗi rõ, không đoán bừa.

## Chỉnh ngưỡng

Mọi ngưỡng nằm trong `DEFAULTS` ở [src/classify.cjs](src/classify.cjs) và **ghi đè được**:
`aggregate(windows, { fSing: 0.05 })`.

Cách chỉnh có căn cứ: chạy `--json --dump-windows` trên một mớ link thật để lấy điểm từng cửa sổ,
rồi chạy lại `aggregate()` với ngưỡng khác **mà không phải tải/giải mã lại audio**.

| Triệu chứng | Nút vặn |
|---|---|
| Nhiều sound có hát vẫn lọt vào LẤY | hạ `fSing` / `tSing` |
| Sound nói bị loại oan vì "có hát" | nâng `fSing`, hoặc nâng `tSing` lên ~0.05 |
| Sound voiceover bị gọi là "Nhạc" | hạ `tSpeech` / `fSpeech` |

## Khi cần dò lỗi

Electron chạy ẩn nên lúc hỏng thường **không thấy gì cả** — `app.exit()` là thoát cứng, không xả
bộ đệm, nên output có thể bay sạch. Đặt `VOM_LOG` để ghi nhật ký **đồng bộ** ra file:

```bat
set VOM_LOG=D:\vom.log
check.cmd <link>
```

## Test

```bat
npm test              :: 147 phép kiểm, Node thuần, không cần mạng, ~2 giây
npm run test:gui      :: mở app thật, bấm nút thật, đọc bảng thật (cần mạng)

:: kiểm chính bản .exe đã đóng gói:
set VOM_EXE=..\VoiceOrMusic_Release\VoiceOrMusic.exe
npm run test:gui
```

Muốn dựng lại toàn bộ công cụ từ số 0 (kèm lý do từng quyết định và **11 cái bẫy đã sập**):
xem [QUY-TRINH.md](QUY-TRINH.md).

### Bẫy nặng nhất: dấu `--` trong `run.cjs`

Chạy `electron main.js <urlA> <urlB>` làm tiến trình **sập cứng trước cả khi `main.js` chạy dòng
đầu tiên** — thoát 127, không một chữ output, cả log ghi đồng bộ cũng trống. Triệu chứng y hệt
"lỗi mạng" nên rất dễ đi nhầm hướng: **một link thì chạy ngon, hai link mới chết.**

Quy luật đo được: sập khi có **≥2 tham số và ít nhất 1 tham số là URL**.

```
node run.cjs hello world                          -> chạy bình thường
node run.cjs a.wav b.wav                          -> chạy bình thường
node run.cjs https://example.com/a https://.../b  -> SẬP (mà không hề gọi mạng)
```

Nghĩa là **Chromium tự đọc argv**, không liên quan tới mạng. Chữa bằng cách chèn `--` trước tham
số của người dùng. `test/cli-args.test.js` giữ đúng hành vi này.

### Ba lỗi trong lõi quyết định

`test/classify.test.js` giữ lại 3 lỗi thật đã mắc, mỗi lỗi một mục:

1. **7 tên nhãn tự suy diễn không tồn tại trong model.** Bản YAMNet của MediaPipe có bộ nhãn gọn
   hơn AudioSet gốc — không có `Male speech, man speaking`, `Female singing`, `Trap music`,
   `Strings`… Tên sai thì nhóm đó **câm luôn mà không báo lỗi gì**. Vì vậy `models/yamnet-labels.json`
   ghim đủ 521 tên model thật sự trả về, và test bắt buộc mọi tên trong `classify.cjs` phải có
   trong đó. Đổi model thì đo lại bằng `check.cmd --json --dump-labels <file>`.
2. **Model có nhãn `Singing bowl`** — chuông xoay, là *nhạc cụ*, không liên quan gì đến hát. Lưới
   an toàn bằng regex `/singing/` chạm vào nó sẽ đẻ ra điểm "hát" từ một bản nhạc không ai hát.
3. **Điều kiện chạy lưới an toàn từng viết là "điểm = 0"** thay vì "không tên nào có mặt". Vì gọi
   model với `scoreThreshold: 0` nên cả 521 nhãn luôn được trả về, và ở cửa sổ im lặng `Singing`
   có điểm *đúng bằng 0* → lưới an toàn chạy sai lúc, kéo theo lỗi 2.

Thứ tự xét nhãn cũng có test riêng: **hát phải xét trước cả nhạc thuần lẫn giọng nói** — không thì
mọi bài hát thành "Nhạc", hoặc tệ hơn, sound vừa nói vừa hát lọt vào danh sách LẤY.
