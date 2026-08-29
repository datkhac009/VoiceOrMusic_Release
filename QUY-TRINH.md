# Quy trình dựng lại VoiceOrMusic từ số 0

Tài liệu này đủ để **dựng lại toàn bộ công cụ** kể cả khi mất sạch mã nguồn. Viết theo thứ tự
đã làm thật, kèm **lý do** của từng quyết định và **những bẫy đã sập** — phần bẫy mới là phần
đáng giá nhất, vì mỗi cái đều tốn hàng chục phút để tìm ra.

Ngày dựng: **2026-08-13**. Máy: Windows 10, Node 24, Python 3.14.

---

## 1. Bài toán

Lọc danh sách link sound TikTok, **chỉ giữ sound có người nói**:

| | Nhãn | Nghĩa |
|---|---|---|
| ✅ LẤY | 🗣 Giọng nói | người nói, không nhạc |
| ✅ LẤY | 🎙 Giọng nói + nhạc nền | người nói trên nhạc nền **không lời** |
| ❌ LOẠI | 🎤 Hát | hát, rap, hoặc nhạc nền **có lời** |
| ❌ LOẠI | 🎵 Nhạc | không có giọng người |
| ❌ LOẠI | ❓ Không rõ | quá ngắn / im lặng / không chắc |

---

## 2. Chọn công nghệ — và những đường **không** đi được

Đây là phần dễ mất thời gian nhất nếu làm lại mà không biết trước.

### Model: YAMNet — nhưng **không có bản ONNX**

Ý định ban đầu là YAMNet qua ONNX Runtime. **Không tồn tại bản export ONNX chính thống nào của
YAMNet** — HuggingFace chỉ có `.tflite` và các bản fine-tune cho việc khác. Model chính thức
Google phát hành ở dạng `.tflite`:

```
https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite
```

4,1 MB. Chạy bằng `@mediapipe/tasks-audio` (WASM). Runtime này còn trả về **tên nhãn** trực
tiếp nên không phải đoán chỉ số lớp.

### Không dùng Python được trên máy này

Đã thử thật:

- `pip install tensorflow` → **No matching distribution found**. Máy đang chạy Python 3.14,
  TensorFlow chưa có bản build cho 3.14. Không TF thì không có `tensorflow-hub`.
- `yt-dlp` cài được nhưng **TikTok gãy cả hai đầu**: link video báo
  `Unable to extract universal data for rehydration`; link `/music/` thì extractor bị đánh dấu
  `broken` + `No working app info is available`. Cài `curl_cffi` để impersonate cũng không cứu.

Nếu sau này muốn làm bản Python: `torch`, `onnxruntime`, `ai-edge-litert`, `librosa`, `PyAV`
**đều có bản cho 3.14**, và `ai-edge-litert` chạy được đúng file `yamnet.tflite` này.

### Vì sao chạy trên Electron chứ không phải Node

Ba thứ chỉ trình duyệt mới có, mà Electron thì mang sẵn Chromium:

1. **Giải mã mp3/m4a/ogg** — `decodeAudioData()`. Node không tự làm được, bình thường phải kéo
   ffmpeg ~80 MB đi kèm.
2. **Đổi 16 kHz mono** — `OfflineAudioContext` làm luôn cả đổi tần số mẫu lẫn trộn stereo→mono
   bằng C++ có sẵn.
3. **Chạy model** — MediaPipe là WASM cho trình duyệt.

Thêm nữa `net.request` dùng đúng tầng mạng Chromium (TLS/HTTP2 giống trình duyệt thật) nên ít
bị TikTok chặn hơn `https` của Node.

### Lấy file nhạc: phải đi đường `/embed/`

Trang `/music/<id>` **không còn nhúng dữ liệu sound**. Nó gọi `/api/music/detail/` bằng JS, và
API đó trả về **0 byte** nếu không có phiên đăng nhập (crawler cạnh bên đọc được là vì chạy
bằng profile đã đăng nhập). Trang **embed** thì mở cho tất cả:

```
/embed/music/<musicId>  →  danh sách video dùng sound đó  (bắt bằng regex href /@user/video/<id>)
/embed/v2/<videoId>     →  khối "musicInfos"  →  playUrl  →  file m4a
```

⚠ `playUrl` trong đó là **MẢNG**, không phải chuỗi: `"playUrl":["https://sf16-music..."]`.
Regex tìm `"playUrl":"..."` sẽ trượt sạch.

⚠ Phải **đối chiếu `musicId`** trước khi nhận file: playUrl lấy từ trang của *một video*, không
kiểm thì có thể đi phân tích nhầm bài khác mà vẫn báo "xong" — lỗi im lặng, kiểu nguy hiểm nhất.

---

## 3. Dựng lại từ đầu

```bat
mkdir VoiceOrMusic_build && cd VoiceOrMusic_build
npm init -y
npm i @mediapipe/tasks-audio
npm i -D electron@28 electron-builder@24

mkdir models
curl -L -o models\yamnet.tflite https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite
```

Cấu trúc:

```
main.js              Electron main: mạng, điều phối, in kết quả, chế độ GUI
preload.cjs          cầu nối DUY NHẤT giữa giao diện và main
run.cjs              chạy bản chưa đóng gói (tự tìm electron.exe)
check.cmd            gọi run.cjs cho tiện
build.bat            đóng gói ra .exe
src/
  soundlink.cjs      đọc link → playUrl   (thuần, test được)
  classify.cjs       521 điểm số → 5 nhãn (thuần, test được)  ← LÕI QUYẾT ĐỊNH
  cli-args.cjs       đọc tham số dòng lệnh (thuần, test được)
renderer/
  analyze.html/js    cửa sổ ẨN: giải mã audio + chạy YAMNet
  index.html/ui.js   giao diện người dùng
  icon.png
models/
  yamnet.tflite         model
  yamnet-labels.json    521 tên nhãn model THẬT SỰ trả về (để test offline)
test/                 147 phép kiểm chạy bằng Node thuần + 1 test giao diện
```

**Nguyên tắc kiến trúc quan trọng nhất:** luật quyết định nằm trong `src/classify.cjs` — một
module **thuần**, không đụng Electron. Nhờ vậy test được bằng `node` trong vài giây, không cần
mở app, không cần mạng.

---

## 4. Build

```bat
build.bat          :: bam dup, hoac go `.\build.bat` trong cmd
```

Bấm đúp `build.bat` là xong. Gõ trong cmd mà báo *"not recognized"* thì gõ `.\build.bat` —
máy này đặt `NoDefaultCurrentDirectoryInExePath=1` nên cmd không tự tìm file ở thư mục hiện tại.

Ra `..\VoiceOrMusic_Release\VoiceOrMusic.exe` (~71 MB, portable, không cần cài).
`build.bat` tự chạy `npm test` trước; test hỏng thì **không build**.

Trong `package.json` có 2 chỗ **bắt buộc**:

```json
"asarUnpack": ["node_modules/@mediapipe/**"]
```
File `.wasm` được Chromium nạp qua `file://`, mà `file://` **không đọc xuyên được vào asar**
(khác `fs` của Node vốn được vá để đọc xuyên). Không giải nén thì bản đóng gói báo
"không nạp được model/WASM". Trong `main.js` đường dẫn phải thay `app.asar` → `app.asar.unpacked`.

---

## 5. Kiểm thử

```bat
npm test          :: 147 phép kiểm, Node thuần, không cần mạng, ~2 giây
npm run test:gui  :: mở app thật, bấm nút thật, đọc bảng thật (cần mạng)

:: kiểm chính bản .exe đã đóng gói:
set VOM_EXE=..\VoiceOrMusic_Release\VoiceOrMusic.exe
npm run test:gui
```

Dò lỗi khi app chạy ẩn:

```bat
set VOM_LOG=D:\vom.log
```
Ghi nhật ký **đồng bộ** từng bước ra file. Cần đến mức này vì `app.exit()` là thoát cứng —
không xả bộ đệm, nên `console.log` có thể bay sạch khi tiến trình chết.

---

## 6. Hiệu chỉnh ngưỡng bằng số đo

Mọi ngưỡng nằm trong `DEFAULTS` ở `src/classify.cjs`, ghi đè được:
`aggregate(windows, { fSing: 0.05 })`.

Cách chỉnh **có căn cứ**, không đoán:

```bat
check.cmd --json --dump-windows --file=links.txt > do.json
```
File đó có điểm **từng cửa sổ**, nên chạy lại `aggregate()` với ngưỡng khác mà **không phải
tải/giải mã lại audio**.

| Triệu chứng | Nút vặn |
|---|---|
| Sound có hát vẫn lọt vào LẤY | hạ `fSing` / `tSing` |
| Sound nói bị loại oan vì "có hát" | nâng `fSing`, hoặc `tSing` lên ~0.05 |
| Sound voiceover bị gọi là "Nhạc" | hạ `tSpeech` / `fSpeech` |

### Số đo gốc (2026-08-13)

Điểm nhãn `Singing` của YAMNet trên 7 mẫu:

| mẫu | cửa sổ có hát >0.02 | tỉ lệ | đỉnh |
|---|---|---|---|
| hát hợp xướng (thật) | 4/31 | 13% | **0.738** |
| hát giọng nữ (thật) | 2/10 | 20% | 0.059 |
| tiếng nói | 0/19 | 0% | **0.000** |
| nói + nhạc nền không lời | 0/19 | 0% | **0.000** |
| nhạc không lời | 0/13 | 0% | **0.000** |
| 2 sound TikTok thật | 0/42 | 0% | 0.008 |

Kết luận: nhãn `Singing` **bắn ra rất dè dặt** (ngay cả hát thật cũng chỉ ~0.05 ở phần lớn cửa
sổ), nhưng trên thứ **không phải** hát thì nó cho **đúng 0.000**. Ranh giới nằm ở **0.0x**, không
phải 0.2. Ngưỡng ban đầu (0.18/0.30) khiến hát thật **không bao giờ** được gán nhãn `Hát`.

Ca then chốt đã dựng lại bằng audio thật (giọng đọc thật chồng lên bản hát thật, 3 mức to nhỏ):
ca khó nhất chỉ đạt **2/19 cửa sổ = 11%** → nên `fSing = 0.06` (≈ "cần ít nhất 2 cửa sổ"), vừa
bắt được ca khó vừa không để **một** cửa sổ nhiễu đơn độc loại oan.

---

## 7. Mười cái bẫy đã sập — đọc trước khi sửa gì

Mỗi cái đều có test giữ lại trong `test/`.

**1. Bảy tên nhãn tự suy diễn không tồn tại trong model.** Bản YAMNet của MediaPipe có bộ nhãn
gọn hơn AudioSet gốc: không có `Male speech, man speaking`, `Female singing`, `Trap music`,
`Strings`… Tên sai thì nhóm đó **câm luôn mà không báo lỗi**. Vì vậy `models/yamnet-labels.json`
ghim đủ 521 tên thật và test bắt buộc mọi tên phải có trong đó.

**2. Thứ tự nhãn model trả về là theo ĐIỂM, không phải chỉ số lớp.** File nhạc cho `Music` ở vị
trí 0 và `Speech` ở vị trí 260. Bám theo chỉ số là sai từ đầu → phải đối chiếu bằng **tên**.

**3. Nhãn `Singing bowl`** (chuông xoay — *nhạc cụ*) khớp regex `/singing/` → đẻ ra điểm "hát"
từ bản nhạc không ai hát.

**4. Điều kiện lưới an toàn.** Từng viết là "điểm = 0" thay vì "không tên nào có mặt". Vì gọi
model với `scoreThreshold: 0` nên cả 521 nhãn luôn được trả về, và ở cửa sổ im lặng `Singing`
có điểm *đúng bằng 0* → lưới an toàn chạy sai lúc, kéo theo bẫy 3.

**5. `electron main.js <urlA> <urlB>` làm tiến trình SẬP CỨNG** trước cả dòng code đầu tiên —
thoát 127, không một chữ output, cả log ghi đồng bộ cũng trống. Quy luật đo được: sập khi có
**≥2 tham số và ít nhất 1 là URL**; `https://example.com` (không hề gọi mạng) cũng đủ làm sập →
**Chromium tự đọc argv**. Chữa bằng dấu `--`. Triệu chứng giống hệt "lỗi mạng": một link chạy
ngon, hai link mới chết.

**6. Cắt bỏ phần trước dấu `--`.** Chữa bẫy 5 xong thì đẻ ra bẫy mới: mọi cờ đặt *trước* `--`
bị bỏ trong im lặng — `VoiceOrMusic.exe --out=kq.txt --only-voice -- a.wav` chạy xong, thoát mã
0, mà **không ghi file nào**. Chỉ được **bỏ** phần tử `--`, không cắt.

**7. Đường dẫn thư mục app bị coi là LINK.** Electron đặt argv khác nhau ở 2 chế độ, và cờ
Chromium được phép đứng **trước** đường dẫn app. Cắt cứng `slice(2)` thì `electron --flag D:/app`
làm `D:/app` lọt vào danh sách link → app chạy chế độ dòng lệnh rồi thoát, **giao diện không bao
giờ mở**. Quy tắc đúng: đường dẫn app là **tham số đầu tiên không phải cờ**.

**8. `offscreen: true` làm sập tiến trình.** Mở cửa sổ offscreen → huỷ → mở cửa sổ offscreen thứ
hai = sập cứng, exit 127. Một link không sao, hai link mới lộ. `show: false` là đủ.

**9. Renderer thoát vòng lấy việc khi hàng đợi trống.** Vòng lặp `while ((job = await
invoke('next-job')))` coi *mọi* giá trị falsy là "hết việc". Với file trên máy thì vẫn chạy —
nhưng đó là **ăn may** (việc kế tiếp được đẩy vào kịp trước lượt hỏi); link mạng chậm vài giây
thì thua cuộc đua → từ link thứ 2 trở đi báo "quá 90 giây không phân tích xong", lỗi hiện ra ở
tận đầu kia. Nay main **đẩy việc bằng sự kiện**, không hỏi vòng.

**10. Bản .exe không có console.** Trên Windows app đóng gói không được gắn console:
`console.log` bay vào hư không, và **kể cả `> ketqua.txt` cũng ra file rỗng 0 byte**. Nên chế độ
dòng lệnh của bản .exe phải **tự ghi file** (`--out=`, mặc định ghi cạnh file .exe).

**Bẫy thứ 11 — của chính test, không phải của app:** harness test giao diện ban đầu hỏi CDP mỗi
giây và các lệnh gọi không có trần thời gian → nó tự treo rồi báo "app treo ở link thứ 2", trong
khi app hoàn toàn bình thường. Mất khá nhiều thời gian đào vào app vì tin một harness sai.
Bản trong `test/gui-smoke.cjs` bấm **một lần** rồi đóng kết nối, cuối cùng mới nối lại đọc kết
quả **đúng một lần**.

---

## 7b. Giọng AI — đo rồi, model **không** nghe ra được

Người dùng gửi `original-sound-7506489958937414406` (clip Kung Fu Panda lồng giọng AI) và hỏi
sao vẫn LẤY. Đo `Speech synthesizer` — nhãn duy nhất của YAMNet dính tới giọng máy:

| mẫu | trung bình / cao nhất | % cửa sổ > 0.1 |
|---|---|---|
| sound giọng AI người dùng gửi | **0.000 / 0.000** | 0% |
| giọng đọc TTS của Windows | 0.122 / 0.262 | 74% |
| phỏng vấn người thật ×2 | 0.001–0.010 | 0–1% |

Kết luận: nhãn này chỉ bắt được giọng máy **kiểu cũ** (formant robot). Giọng AI đời nay (TTS
neural) nghe như người thật nên model xếp vào `Speech` đúng như nó nghe thấy. **Muốn nhận ra
thì phải có model chống giả mạo (anti-spoofing) riêng, YAMNet không làm được** — đừng phí
thời gian chỉnh ngưỡng ở đây.

Đường đi được là **đọc tài khoản**, không phải đọc âm thanh — xem `RE_TU_XUNG` trong
`soundlink.cjs`. Đo trên 9 sound thật: bắt đúng ca đó, 0/8 tài khoản người thật bị loại oan.
Cũng đo luôn ý "gom hashtag từ 5 video thay vì 1": **không đổi kết quả sound nào**, nên bỏ.

## 7c. Phỏng vấn / truyền hình — đo trên clip THẬT, âm thanh không tách được

Cách lấy đáp án đúng: `https://www.tiktok.com/embed/tag/<hashtag>` **mở được không cần đăng
nhập** và trả về danh sách video id. Từ đó kéo 14 clip `#interview #podcast #talkshow #tvshow
#entrevista` về đo (script trong lịch sử: `keo-phongvan.cjs`).

| nhãn | 14 clip phỏng vấn thật | 32 sound thường |
|---|---|---|
| `Applause` | 0.000 cả 14 | 0.000 |
| `Cheering` / `Crowd` | ≤0.031 / ≤0.043 | ≈0 |
| `Television` | ≤0.082 | ≤0.031 |
| `Laughter` | ≤0.414 | ≤0.586 |
| `Narration` | ≤0.082 | ≤0.148 |

Sound thường chấm **cao hơn** clip phỏng vấn ở nhiều nhãn → **không có khe nào để dựng ngưỡng**.
Kết luận cuối: âm thanh không nhận ra được phỏng vấn/truyền hình. Đừng chỉnh ngưỡng ở đây nữa.

Dùng `--do-nhan=<biểu thức>` để đo lại bất cứ lúc nào, ví dụ:
`node run.cjs -- <link> --do-nhan="Applause|Crowd|Television"`.

### Caption: key là `"text"`, không phải `"desc"`

Trang embed **không hề có key `desc`**. Đọc nhầm tên key nên caption ra rỗng suốt một thời
gian. Caption là nguồn chữ giàu nhất trang đó có. Nó dùng **bộ cụm hẹp** `CUM_PHAT_SONG`
(không dùng `TU_PHIM`): đo được **1/14** clip phỏng vấn bắt thêm bằng chữ tự do, **0/32**
sound thường bị loại oan.

## 7d. Nhìn hình để nhận ra phỏng vấn — đo rồi, KHÔNG dùng

Chạy `@mediapipe/tasks-vision` + EfficientDet-Lite trên 42 ảnh khung hình (13 clip phỏng vấn
thật / 29 sound thường):

| cách | bắt được | loại oan |
|---|---|---|
| ≥2 **người** trong khung | 6/13 (46%) | 4/29 (**14%**) |
| ≥2 **khuôn mặt** (BlazeFace) | 0/13 | 2/29 |

14% loại oan = cứ 7 sound tốt mất 1 → không dùng được để tự loại. Nhận diện mặt vô dụng vì
BlazeFace short-range chỉ thấy mặt lớn chính diện. **Không thêm vào app** (tránh cõng 13.8 MB).
Thay vào đó đưa **ảnh khung hình lên thẳng bảng** để người dùng tự liếc — mắt người vẫn hơn hẳn.

## 7e. Bẫy ngưỡng theo TỈ LỆ trên clip ngắn

`fSing` là **tỉ lệ** cửa sổ có điểm hát. Chú thích của nó viết "1/19 = 5.3% < 6% nên một cửa sổ
đơn độc không đủ" — nhưng đó là tính cho clip ~19 cửa sổ. Clip **12 cửa sổ** thì 1/12 = 8.3% >
6%, tức là **clip càng ngắn càng dễ bị loại oan**, ngược hẳn ý định đã viết ra.

Ca thật: `original-sound-7111801707792763674` (giọng Hindi nói chuyện) — nói 92%, đúng 1 cửa sổ
có hát 0.043, bị gán "Hát" và LOẠI.

→ Bài học: **ngưỡng theo tỉ lệ phải đi kèm ngưỡng theo SỐ ĐẾM** (`minSingWin`). Khi thêm một
ngưỡng tỉ lệ mới, luôn tự hỏi "clip ngắn nhất có bao nhiêu cửa sổ?".

Và số đo trên 46 audio thật cho thấy dấu hiệu của hát thật là **nhiều cửa sổ**, không phải đỉnh
cao: sound hát thật có đỉnh chỉ 0.031–0.082 nhưng 2–8 cửa sổ; sound không hát có đỉnh ≤0.059 và
chỉ 1–2 cửa sổ lẻ tẻ.

## 7f. Đếm số người nói — đo bằng model chuẩn, chỉ dùng làm ghi chú

`pyannote-segmentation-3.0` (ONNX, 6 MB, chính model đứng sau pipeline diarization của pyannote)
chạy qua `onnxruntime-node`. Tốc độ: **26 ms / 10 giây tiếng** → clip 120s tốn 0,3s. Rẻ.

| | phỏng vấn (14) | thường (32) |
|---|---|---|
| đọc ra 1 người | 9/14 | 23/32 |
| 2 người | 4/14 | 9/32 |
| ngưỡng ≥2 người | bắt 36% | **loại oan 28%** |

Model đúng, giả thiết sai: sound phỏng vấn thường **đã cắt còn một giọng**, còn tiểu phẩm/đối
thoại thường thì lại có hai giọng. → chỉ dùng làm **ghi chú**, có test chặn cứng không cho nó
đổi kết quả lấy/loại.

Ghi chú về đóng gói nếu sau này bật: `onnxruntime-node` nặng 259 MB nhưng win32-x64 CPU chỉ cần
`onnxruntime.dll` (26 MB) + `onnxruntime_binding.node`; 38 MB DirectML là cho GPU, bỏ được.

## 7g. Tách voice khỏi nhạc (vocal separation) — khả thi, chưa làm

MDX-Net (UVR-MDX-NET-Inst_HQ_3) ONNX 66 MB chạy được qua `onnxruntime-node`, vào/ra
`[1,4,3072,256]`. **Tốc độ đo thật: 2,1 giây cho mỗi 5,94 giây tiếng** → clip 120s tốn ~43s,
chưa kể STFT/iSTFT 6144 điểm phải tự viết (không phải luỹ thừa 2).

Nếu làm thì **chỉ chạy cho dòng nhãn "Giọng nói + nhạc nền"** (~7% số dòng trong bộ 46 mẫu) —
đúng chỗ nó trả lời được câu hỏi "nhạc nền có lời hay không lời", thay vì bật cho mọi link.

## 7h. Bấm một lần vào dòng là video chạy **kèm tiếng** — đo, và ba đường đã thử

Trước đây bấm vào dòng chỉ ra khung đen của TikTok, phải bấm thêm trong player mới xem/nghe
được. Đo trên trang `/embed/v2/` (3 sound, 2026-08-24):

| Đường | Kết quả đo | Kết luận |
|---|---|---|
| Bật cờ `--autoplay-policy=no-user-gesture-required` | bật hay tắt cờ đều **y hệt**: `dai:0, rong:0`, player không nạp gì | **không dùng** |
| Bắn sự kiện chuột thật vào toạ độ khung (`sendInputEvent`) | chạy **2/3 dòng** | **không dùng** — bấm mù |
| Với vào frame con từ main rồi bỏ `muted` + `play()` | **3/3 dòng** chạy có tiếng | **đang dùng** |

Hai điều đo được, quan trọng hơn cả cách làm:

1. **Nhúng trong iframe khác hẳn mở thẳng.** Nhúng thì player **tự chạy sẵn**, chỉ là đang tắt
   tiếng (đo được: `giay 1.9`, `readyState 4`, `muted true` — chưa hề bấm gì). Mở thẳng trang
   đó ở cửa sổ gốc thì nó không nạp gì cả. Đừng lấy kết quả đo ở cửa sổ gốc suy ra cho iframe.
2. **Trang có BA thẻ `<video>`.** Thẻ nguồn `v16-webapp-prime` hỏng (`error 4`), hai thẻ nguồn
   `v45.tiktokcdn` mới là thẻ thật (576×1024). `document.querySelector('video')` trúng thẳng
   thẻ hỏng → `play()` báo *"no supported sources"*. Phải **lọc** `!v.error && readyState >= 2
   && videoWidth > 0`.

Vì sao làm ở main chứ không ở renderer: iframe **khác nguồn** nên renderer không với vào trong
được, còn main thì với được qua `webContents.mainFrame.framesInSubtree`. Vòng chờ có hạn (16
nhịp × 700ms) và có **số phiên** — mở dòng khác thì vòng của dòng cũ tự tắt, khỏi bật tiếng
nhầm cho video của dòng mới. Xem `main.js`, chỗ `ipcMain.handle('ui:bat-tieng')`.

Vì sao bỏ đường bắn chuột: nó bấm mù, không biết player nạp xong chưa, mà **cú bấm thứ hai lúc
video đang chạy lại hoá thành tạm dừng**. Test giao diện có mục kiểm cái này (`batTieng()` chỉ
trả `true` khi thật sự có thẻ đang chạy và không tắt tiếng).

## 7i. TikTok chặn tạm (429/503) — **không** phải "sound đã xoá"

Người dùng quét một mẻ 51 link, **20 link** báo *"sound đã xoá, chưa có video nào dùng"* —
trong khi mở trình duyệt thì sound **vẫn còn nguyên, còn 5351 video**. Đo lại từng bước:

```
sound 7318135118018349855: lần 1 → 429, lần 2 → 503, lần 3 → 503, lần 4 → 200 (7 video)
sound 7093628948978191110: lần 1 → 503, lần 2 → 503, lần 3 → 200 (8 video)
```

Tức là TikTok **chặn tạm vì hỏi quá nhanh**, còn tool thì thử **đúng một lần rồi bỏ cuộc** và
báo nhầm thành "sound đã xoá". Thêm một điều đo được: ngay cả khi trang sound đã ra 200, từng
video lẻ **vẫn có thể 503** — sound trên phải đến video **thứ ba** mới lấy được `playUrl`.

Ba chỗ đã sửa:

1. **Thử lại có lùi dần** (`httpGetBenBi`) cho những mã tạm thời `0/408/425/429/500/502/503/504`,
   nghe theo `Retry-After` nếu máy chủ có gửi.
2. **Phanh chung**: khi đã bị chặn thì hãm nhịp trước mọi yêu cầu sau (400ms → 800 → … tối đa
   4s), trở lại bình thường thì nới dần. Hơi chậm còn hơn bị chặn rồi mất cả dòng.
3. **Quét lại cả mẻ**: quét xong, những link hỏng **vì bị chặn** được tự chạy lại (tối đa 2
   lượt, nghỉ 8s rồi 16s). Chỉ quét lại loại `biChan` — sound xoá thật thì thử bao nhiêu lần
   cũng thế, quét lại chỉ tốn thời gian.

Và câu báo lỗi nay **tách làm hai**, vì trước đây gộp một câu nên người dùng đọc thấy "sound đã
xoá" trong khi sound còn nguyên — đó là báo **sai sự thật**:

| Tình huống | Câu báo |
|---|---|
| Bị chặn tạm | *TikTok đang chặn tạm (429/503) — sound vẫn còn, bấm Kiểm tra lại sau ít phút* |
| Không có thật | *không lấy được link file nhạc (sound đã xoá hoặc chưa có video nào dùng)* |

**Đo trên 12 link thật, cùng một danh sách:**

| | Lỗi |
|---|---|
| Trước khi sửa | **4/12** |
| Có thử lại + phanh | **1/12** |
| Thêm lượt quét lại | **0/12** |

⚠ Một cái bẫy khi sửa: cờ `biChan` **phải để riêng cho từng link**. Ban đầu tôi đặt lên `opt` —
mà `opt` dùng chung cả mẻ, nên một link bị chặn sẽ làm **mọi link sau** đều bị ghi nhầm là bị
chặn. Nay dùng sổ ghi riêng (`ghi`) tạo mới trong `resolveToAudio`.

⚠ Bẫy thứ hai: lượt quét lại gửi **lại dòng cũ** với đúng số thứ tự của nó, nên renderer phải
**thay** chứ không **thêm** — không thì một sound hiện hai dòng (một dòng lỗi cũ, một dòng kết
quả mới).

## 8. Còn thiếu / chưa chắc

- **Chưa hiệu chỉnh trên dữ liệu thật của người dùng.** Ngưỡng hát mới chỉ chỉnh trên 2 bản hát
  thật, cả hai đều **không phải nhạc TikTok** (một hợp xướng, một bài tiếng Anh).
- **Rap có thể bị nhận là `Speech`** thay vì `Singing`. Sound TikTok đã thử có vocal chỉ 16% cửa
  sổ nên vẫn ra "Nhạc" đúng, nhưng bản rap dày lời có thể vượt `fSpeech 35%` và **lọt vào LẤY**.
- **Nhạc to át hẳn giọng → ra "Nhạc"** (đo thật: giọng 0.6 + nhạc 0.9 thì `Speech` = 0%). Sound
  người nói mà nhạc nền quá to sẽ bị loại oan. Đây mới là chỗ **tách giọng (Demucs/Spleeter)**
  thực sự giúp — nhưng chỉ nên làm khi đo trên dữ liệu thật thấy đủ nhiều.
- **Phỏng vấn/truyền hình vẫn phải tự nhìn.** Đo xong: âm thanh không tách được, caption chỉ
  bắt thêm 1/14. Clip đã cắt còn một giọng và caption viết trung tính thì **không có dấu hiệu
  máy nào đọc được** — phải xem bằng trình duyệt mini + 📸 Google Ống kính.
- **Giọng AI nói chung vẫn lọt.** Luật tài khoản chỉ bắt loại *tự xưng "official"*. Sound giọng
  AI từ tài khoản đặt tên bình thường thì **không có dấu hiệu nào đọc được** — phải tự xem bằng
  trình duyệt mini + 📸 Google Ống kính.
- **Chưa có bản Python** (xem mục 2 để biết bộ thư viện nào chạy được trên Python 3.14).
- **Chưa nối vào crawler.** Hiện là công cụ độc lập; muốn chạy tự động lúc quét thì móc vào chỗ
  `crawler.cjs` đang đọc `musicInfo` là hợp lý nhất.
- **Chưa đẩy lên GitHub.**
