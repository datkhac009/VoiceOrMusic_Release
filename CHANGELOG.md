# Nhật ký phiên bản

Số phiên bản lấy từ `package.json`, hiện ở 4 chỗ nên nhìn đâu cũng biết đang cầm bản nào:

- **thanh tiêu đề cửa sổ** — `VoiceOrMusic v0.2.0 — lọc sound TikTok...`
- **góc trên giao diện** — huy hiệu `v0.2.0` cạnh tên app
- **đầu báo cáo** khi chạy dòng lệnh (và trong file `--out=`)
- **đầu trang** của bộ kiểm chứng

Đổi phiên bản: sửa `"version"` trong `package.json` rồi build lại — `build.bat` in số đó ra lúc
bắt đầu và lúc xong.

---

## 0.11.1 — 2026-08-19

**Bỏ làm mờ nền khi mở panel — bảng phía sau sáng và đọc được**

Panel bên phải trước đây phủ nền bằng `rgba(6,8,12,.6)` + `backdrop-filter: blur(3px)`. Nhìn thì
"sang" nhưng sai việc: panel này **không phải hộp thoại đòi trả lời**, nó là chỗ *xem thêm* cho
một dòng đang nằm trong bảng — bạn vẫn đọc bảng trong lúc panel mở (đối chiếu dòng này với dòng
khác, tìm dòng kế tiếp để bấm). Làm mờ + tối 60% thì cả bảng không đọc được.

Nay bỏ hẳn `blur()`, lớp tối hạ từ **0.6 → 0.18** — vừa đủ để biết panel đang ở trên, không làm
mờ chữ. Hộp **Cập nhật** cũng bỏ blur nhưng giữ lớp tối (0.55) vì đó là hộp thoại thật, cần tập
trung vào một quyết định.

---

## 0.11.0 — 2026-08-19

**Sửa lỗi: tài khoản CÓ TÍCH XANH vẫn được LẤY**

Bạn gửi ảnh `original sound — Lufthansa` của **@lufthansa (có tích xanh)** mà máy vẫn chấm LẤY.
Yêu cầu từ đầu đã ghi rõ *"sound có tích xanh thì auto là Loại"*.

Nguyên nhân: trường `verified` **được đọc từ TikTok và hiện ra** trong panel
(`✔ tài khoản tích xanh`) nhưng **chưa bao giờ dùng để loại**. Luật bản quyền cũ chỉ xét
`original === false` (nhạc catalog của TikTok) — mà tài khoản tích xanh đăng bài bằng
*"original sound" của chính họ* thì `original === true`, nên lọt qua hết.

Nay tích xanh → **LOẠI**, đi cùng ô *"Loại nhạc có bản quyền"* (cùng trả lời một câu hỏi:
sound này có rủi ro bản quyền không). Ba chốt an toàn:

- **Chỉ xét tài khoản CHỦ SOUND.** Một người nổi tiếng *dùng* sound của người khác thì không
  kéo cả sound đó xuống theo.
- **`verified` phải đúng `true`.** Giá trị `null` = không đọc được → **không** coi là có tích;
  một lần TikTok đổi cấu trúc dữ liệu là loại sạch cả danh sách.
- Bạn bấm tay vẫn thắng mọi luật.

Bảng và báo cáo dòng lệnh đều hiện `✔ tài khoản tích xanh` để nhìn là biết vì sao bị loại.
Thêm 10 test riêng cho luật này.

**Kho học: đã có từ 0.9.0 và đang chạy**

Kiểm kho thật trên máy bạn — có 3 ca đã ghi, gồm đúng ca trong ảnh:

```
máy chấm voice_bgm -> LẤY | bạn chọn LOẠI | vân tay: 0.47 0.00 0.82 0.02 0.00
```

(khớp số liệu trong ảnh: nói 48% · hát 0% · nhạc 83%). Sound nào sau này gần giống sẽ được
cảnh báo, và nếu trùng khít (≤ 0.05) thì **tự sửa**. Nhưng gốc của ca Lufthansa không phải
kho học — mà là thiếu hẳn luật tích xanh, nên đã sửa ở trên.

**Đã đo và KHÔNG dùng: nhận diện "cầm mic" bằng hình**

Bạn muốn nhận diện bằng **hình trong video**, không phải hashtag. Đo từng thứ:

| yêu cầu | cách làm | kết quả đo |
|---|---|---|
| **có tích xanh** | không cần nhìn hình — TikTok trả sẵn `verified` | ✅ **đã làm** (mục trên) |
| **cầm mic hát** | ImageNet-1000 (EfficientNet-Lite) có lớp `microphone` | nhãn `microphone` chỉ ra ở **1/13** clip phỏng vấn (điểm **0.04**) và **1/29** sound thường (**0.059** — cao hơn!) → vô dụng |
| **đang phỏng vấn** | EfficientDet đếm người trong khung | bắt 6/13 nhưng **loại oan 4/29 (14%)**; đếm khuôn mặt: **0/13** |

Vì sao bộ phân loại ảnh vô dụng ở đây: nó chấm khung hình TikTok ra *"web site", "cash
machine", "American alligator", "guillotine", "piggy bank"* — ImageNet được huấn luyện trên
**ảnh chụp vật thể**, không phải khung hình video dọc có chữ đè lên. COCO thì **không có** lớp
microphone.

⚠ Và một giới hạn nữa cần nói rõ: app hiện chỉ có **ảnh khung hình bìa**, không có video. Muốn
"nhìn trong video" thật thì phải tải cả video (5–20 MB/clip thay vì ~1 MB audio) và lấy nhiều
khung — chưa kể vẫn cần một model hoạt động được trên loại khung hình này, mà không model sẵn
có nào làm được.

---

## 0.10.0 — 2026-08-19

**⭮ Tự cập nhật trong app — hết phải tải tay**

Cạnh huy hiệu phiên bản có nút **⭮ Cập nhật**. Bấm → app hỏi GitHub → hiện ngay:

- **✅ Đang dùng bản mới nhất** (kèm số bản đang chạy), hoặc
- **🎉 Có bản mới** `v0.9.0 → v0.10.0`, tên file, dung lượng, và **toàn bộ ghi chú phát hành**

Bấm **⬇ Tải và cập nhật** → thanh tiến độ theo %, tải xong app **tự tắt rồi mở lại** ở bản mới.

**Chép lại 4 bài học đã trả giá bên crawler, không tự phát minh lại:**

1. **Repo phát hành phải PUBLIC.** Updater gọi GitHub **ẩn danh** — không nhúng token vào
   `.exe` vì file đó phát tán nhiều máy, nhúng vào là coi như lộ. Repo private trả 404 →
   bên crawler tính năng này **chết hẳn**, phải đi thay `.exe` tay từng máy.
   `VoiceOrMusic_Release` đang public nên chạy được.
2. **Máy có AV/proxy chặn SSL** làm Node báo *"unable to verify the first certificate"* →
   phải dùng agent bỏ qua xác minh, không thì một số máy không bao giờ cập nhật được mà
   không hiểu vì sao.
3. **Bẫy Job Object của Electron** — bug thật: *"tải 100% xong đóng luôn không mở lại"*, và
   **chỉ xảy ra trên một số máy** (đua thời gian, phụ thuộc tốc độ máy). Electron gom tiến
   trình con vào một Job Object có cờ "giết hết con khi cha thoát"; nếu `app.quit()` dọn job
   trước khi `cmd` kịp thoát ly thì file `.bat` bị giết ngay. Fix: `spawn` với
   `detached:true` + `unref()` **trước** khi quit.
4. **Người dùng dán cả URL / thừa dấu gạch chéo.** Đo thật bên crawler: `Owner/Repo` → HTTP
   200, `Owner/Repo/` → **HTTP 404** (app báo "không tìm thấy release", chẳng ai hiểu vì
   sao). Nay nhận cả URL GitHub, thừa `/`, thừa khoảng trắng, cả link `/releases/tag/...` —
   tự cắt về đúng `Owner/Repo`. Có 15 test riêng canh chỗ này.

**Bản trên GitHub cũ hơn thì gọi đúng tên.** Không gộp vào "có bản mới": hộp hiện
**⚠ Bản trên GitHub CŨ HƠN** và nút đổi thành *"Tải và hạ về bản này"* — hữu ích khi một bản
mới bị lỗi, nhưng không để bạn bấm nhầm rồi tụt version mà không biết.

**Bản phát triển** (chạy `npm start`) kiểm tra được nhưng không tải thay được — hộp nói rõ
điều đó thay vì để bạn bấm rồi mới biết.

Thêm `test/updater.test.js` (**35 test**) và gắn vào `npm test` — tức `build.bat` sẽ chặn build
nếu phần này hỏng.

⚠ **Lần này vẫn phải tải tay một lần.** Bản 0.9.0 bạn đang dùng chưa có nút cập nhật; tải
`VoiceOrMusic.exe` của 0.10.0 về thay một lần, từ đó về sau bấm nút trong app là xong.

---

## 0.9.0 — 2026-08-16

**🧠 Kho học giờ TỰ SỬA, không chỉ cảnh báo nữa**

Ở 0.8.0 tôi cố tình chỉ cho nó ghi chú. Bạn nhắc lại rằng yêu cầu là **"tránh tiếp diễn lần
sai tiếp theo"** — mà cảnh báo suông thì không tránh được gì. Nay nó **áp luôn quyết định cũ
của bạn**.

**Hai ngưỡng, hai cách xử, cả hai đều lấy từ cùng một bảng đo trên 46 sound thật:**

| khoảng cách | cặp khác nhãn lọt vào | app làm gì |
|---|---|---|
| **≤ 0.05** | **0%** (chưa từng thấy) | **TỰ SỬA** theo quyết định cũ của bạn |
| 0.05 – 0.10 | 2% | chỉ **cảnh báo**, bạn tự quyết |
| > 0.10 | — | không nhắc gì |

Lý do tách hai mức: tự sửa mà sai thì **sai âm thầm** — bạn không biết đường mà xem lại. Nên
chỉ sửa ở vùng chưa từng có cặp khác nhãn nào lọt vào; vùng 0.05–0.10 còn 2% thì chỉ đủ để báo.

**Nó không bao giờ sửa âm thầm.** Dòng bị sửa mang nhãn **🧠 tự sửa theo ca đã dạy** trong bảng,
và trong phần suy luận có hẳn một bước:

```
Đối chiếu ca bạn đã dạy: TỰ SỬA
   SOUND CŨ — khoảng cách 0.000 (≤ 0.05 mới được tự sửa)
Kết quả: LOẠI (0)
   đã tự sửa theo ca bạn dạy — bấm nút bên trên nếu vẫn sai
```

**Thứ tự ưu tiên** (test ghim từng nấc):

1. Bạn bấm tay **cho chính link đó** — thắng tuyệt đối
2. Tự sửa theo ca đã dạy
3. Luật máy

**Ô bật/tắt 🧠 "Tự sửa theo ca đã dạy"** cạnh hai ô lọc cũ (mặc định bật). Tắt là quay về chỉ
ghi chú, tính lại ngay không phải quét lại.

Đã kiểm đầu-cuối trên app thật: gieo một ca đã sửa rồi quét **một sound khác link** có số liệu
trùng khít → máy chấm *Giọng nói · LẤY*, kho học lật thành **LOẠI**, kèm lý do đầy đủ.

---

## 0.8.0 — 2026-08-16

**🧠 Suy luận — máy nói ra từng bước nó đã nghĩ gì**

Mở một dòng ra là thấy khối *"Máy đã suy luận thế nào"*, liệt kê đúng đường đi của quyết định:

```
1. Nghe audio: 16/16 cửa sổ dùng được
2. Nghe thấy gì: nói 100% · hát 0% · nhạc 0%
3. Xét HÁT trước: không có giọng hát  (0% < 6% hoặc chỉ 1 < 2 cửa sổ)
4. Chốt nhãn: Giọng nói  (tin cậy 100% — cách ngưỡng 40 điểm, điểm số 0.84)
5. Nghe lại lượt 2: hai lượt khớp nhau
6. Kết quả: LẤY (1)
```

⚠ Vết này được **ghi ngay trong lúc luật chạy**, không phải một hàm riêng kể lại sau. Kể lại
sau thì sớm muộn cũng lệch khỏi luật thật (sửa luật mà quên sửa lời kể) — lúc đó người dùng
đọc một đằng, máy làm một nẻo. Có test ghim rằng nhãn trong vết luôn khớp nhãn trả về.

**🔁 Phân tích 2 lượt trước khi chốt**

⚠ Chạy model hai lần trên **cùng** đoạn audio là vô nghĩa — YAMNet tất định, cùng đầu vào cho
cùng đầu ra tuyệt đối. Nên lượt 2 phải **nghe đoạn khác**: app chấm riêng nửa đầu và nửa sau
rồi đối chiếu. **Không tốn thêm gì** — cùng một lần tải, cùng một lần chạy model.

Đo trên 40 sound thật:

| | |
|---|---|
| hai nửa cho **nhãn khác nhau** | **10/40 (25%)** |
| **lật hẳn LẤY/LOẠI** | **7/40 (18%)** |

Gần 1/5 số sound có kết quả *không ổn định* tùy nghe đoạn nào — đúng những dòng nên nghe lại.
Lệch thì ghi chú: `2 lượt LỆCH HẲN: nửa đầu "Giọng nói" (LẤY) · nửa sau "Nhạc" (LOẠI)`.

**✅❌ Nút tự chấm + máy ghi nhớ lỗi sai**

Trong panel có **LẤY / LOẠI / ↺ để máy tự chấm**. Bấm **ngược ý máy** thì ngoài việc nhớ theo
link, app còn lưu **"vân tay số liệu"** của sound đó vào kho học. Sound nào sau này có vân tay
gần giống sẽ được cảnh báo trước:

> *giống ca bạn đã sửa tay (SOUND CŨ): máy chấm "Giọng nói" nhưng bạn chọn LOẠI*

Vân tay gồm 5 con số (tỉ lệ nói/hát/nhạc, đỉnh hát, tỉ lệ cửa sổ có hát), **hát được đánh trọng
số nặng hơn** vì ranh giới nói/hát là chỗ sai nhiều nhất.

**Ngưỡng "giống nhau" = 0.10, đo chứ không đoán.** Tính khoảng cách của **mọi cặp** trong 46
sound thật:

| | khoảng cách |
|---|---|
| cặp **cùng** nhãn | trung vị **0.103** |
| cặp **khác** nhãn | thấp nhất đã **0.173** |

Hai vùng tách rời. Bảng chọn ngưỡng: 0.05 → bắt 21% cặp cùng nhãn, 0% cặp khác lọt (tinh khiết
100%); **0.10 → bắt 48%, 2% lọt (95%)**; 0.20 → bắt 86%, 12% lọt (82%).

⚠ **Kho học chỉ GHI CHÚ, tuyệt đối không tự lật kết quả.** Kho chỉ có vài chục mẫu — lật tự
động là biến một lần bấm tay thành luật ngầm không ai kiểm soát được. Có test riêng canh điều
này. Chỉ lưu khi bạn bấm **ngược** ý máy; bấm trùng thì không ghi (kho để nhớ chỗ SAI, không
phải nhật ký).

**Sửa lại thứ đã mất:** 3 nút bấm tay bị gỡ ở 0.6.0 nên hàm `ghiQuyetDinhTay` thành **code chết**
— không còn cách nào ghi đè quyết định của máy. Nay nối lại, gọn trong panel thay vì chiếm chỗ
như 3 nút cũ.

---

## 0.7.0 — 2026-08-16

**Đổi luật gốc: nhạc nền CÓ LỜI vẫn lấy được — nhưng luôn kèm lời nhắc kiểm bản quyền**

Trước đây mọi thứ có giọng hát đều bị LOẠI thẳng. Nay theo yêu cầu: loại đó **vẫn LẤY được nếu
không dính bản quyền**, kèm ghi chú ngay dưới nhãn để bạn tự kiểm.

- Thêm nhãn thứ 6: **🎙 Giọng nói + nhạc nền CÓ LỜI** → LẤY, luôn kèm
  `🔒 nghe rõ giọng hát trong nhạc nền — tự kiểm bản quyền trước khi dùng`.
- **Rap vẫn bị LOẠI** như bạn dặn từ đầu. Cách tách: khi giọng nói phủ **gần kín clip** mà vẫn
  nghe ra tiếng hát thì đó là chính người đó hát/rap, không phải nói đè lên nhạc — vì một bài
  hát thật ở phía sau luôn có đoạn dạo nhạc xen vào. Ngưỡng 85%, đo được: ghép giọng nói lên
  bài hát thật cho 63% / 21% / 0%; ca thật @LAIA cho 56%; rap trên beat cho ~100%.

**Phát hiện quan trọng hơn cả luật trên: máy KHÔNG phân biệt được nhạc nền có lời hay không lời**

Dựng mẫu kiểm chứng bằng cách ghép **giọng nói thật** lên **bài hát thật** (đúng đoạn có tiếng
hát) ở 3 mức to nhỏ:

| mẫu | nói | **hát** | nhạc | máy chấm |
|---|---|---|---|---|
| nói + bài hát **nhỏ** | 63% | **0%** | 89% | Giọng nói + nhạc nền → LẤY |
| nói + bài hát **vừa** | 21% | 11% | 100% | Hát → LOẠI |
| nói + bài hát **to** | 0% | 16% | 100% | Hát → LOẠI |
| nói + nhạc **không lời** | 93% | 0% | 47% | Giọng nói + nhạc nền → LẤY |

Đọc cột "hát" là thấy bẫy: **nhạc nhỏ đủ để giọng nói nổi lên thì máy không nghe ra tiếng hát
trong nhạc (đúng 0%); nhạc to đủ để nghe ra tiếng hát thì giọng nói đã bị nuốt.** Hai điều kiện
của nhãn mới gần như không bao giờ đúng cùng lúc — trên 46 sound thật chỉ **1 cái** chạm tới.

Hệ quả nguy hiểm: dòng đầu bảng là **nói đè lên bài hát có lời, được LẤY mà không cảnh báo gì**.

→ Nên **mọi dòng có nhạc nền** đều mang lời nhắc
`🔒 có nhạc nền — máy KHÔNG phân biệt được nhạc có lời hay không lời, tự kiểm bản quyền`.
Dòng chỉ có giọng nói thuần thì không bị làm phiền.

**Một bài học về cách đo:** lần dựng mẫu đầu tiên tôi cắt 14 giây **đầu** bài hát → trúng đoạn
dạo nhạc không lời, cả thí nghiệm cho hát 0% và vô nghĩa. Bài đó chỉ có **6/62 cửa sổ** có tiếng
hát (giây 40–58). Không được giả định "bài hát thì chỗ nào cũng có tiếng hát".

---

## 0.6.4 — 2026-08-14

**"⚠ Cần kiểm tay" — máy nói thẳng chỗ nó không chắc, cả bên LẤY lẫn bên LOẠI**

Trước đây mọi dòng đều ra một con số 0/1 như nhau, kể cả những dòng máy đoán mò. Giờ dòng nào
đáng ngờ sẽ có huy hiệu vàng **ngay dưới cột NHÃN**, kèm lý do cụ thể, và có **thẻ số "Cần
kiểm tay"** đếm tổng.

Bảy dấu hiệu — mỗi cái đều là một kiểu mơ hồ có thật, không phải "điểm tin cậy thấp" chung chung:

| dấu hiệu | ý nghĩa |
|---|---|
| **nhạc lấn giọng** | bị chấm Nhạc/Hát nhưng vẫn còn ≥15% cửa sổ có giọng nói → **có thể là giọng nói ghép nhạc chứ không phải hát** (đúng điều bạn dặn) |
| **nói nhiều mà vẫn bị chấm là hát** | ranh giới nói/hát |
| **bằng chứng hát mỏng** | kết luận Hát chỉ dựa trên 1–2 cửa sổ |
| **có N cửa sổ nghi hát nhưng chưa đủ** | đã cho LẤY nhưng vẫn còn dấu vết hát |
| **điểm hát / tỉ lệ nói sát ngưỡng** | nằm sát vạch, chạy lại có thể lật |
| **giọng yếu so với nhạc** | nghe lại cho chắc |
| **nghe ra N giọng nói** | có thể là đối thoại/phỏng vấn — **chỉ ghi chú, không dùng để loại** |

Hiển thị ở **cả 5 chỗ**: bảng, panel chi tiết, thẻ số, báo cáo dòng lệnh, và **CSV** (2 cột mới:
`Can kiem tay` + `Ly do can kiem`, thêm cột `Caption`).

**Hiệu chỉnh trên 46 sound thật, không phải ước lượng.** Bộ luật đầu tiên dán nhãn lên **35%**
số dòng — đọc lại thì nhiều dòng rất rõ ràng (`nói 0% hát 10% nhạc 100%` bị gọi là "không chắc"
chỉ vì điểm tin cậy thấp). Bỏ hai luật kém đó ("tin cậy thấp", "clip ngắn") xuống còn **26%
(12/46 — 7 LẤY, 5 LOẠI)**, dòng nào cũng giải thích được bằng mắt thường.

**Luật "sát ngưỡng" sinh ra từ một ca bắt được lúc chụp màn hình kiểm tra:** một sound cho hát
**5,7%** — dưới ngưỡng 6% đúng một chút — nên ra "Giọng nói · LẤY" không một lời cảnh báo,
trong khi **lần chạy trước chính nó ra "Hát · LOẠI"** (audio tải về khác nhau chút ít giữa hai
lần). Nằm sát vạch thì kết quả lật lúc nào cũng được → phải báo.

**Sửa lỗi ngầm:** khi bật/tắt ô lọc, giao diện gọi tính lại quyết định nhưng chỉ gửi
`{ok, accept, labelVi, meta}` — **thiếu `label` và `stats`**, mà luật ghi chú đọc đúng hai
trường đó. Không sửa thì mỗi lần bấm ô lọc là toàn bộ ghi chú biến mất trong im lặng.

**Đã đo và KHÔNG dùng để loại: đếm số người nói**

Chạy **pyannote-segmentation-3.0** (chính model đứng sau pipeline diarization của pyannote),
6 MB, ONNX, trên 46 file thật — tốc độ **26 ms cho mỗi 10 giây tiếng** (clip 120s tốn 0,3s):

| | phỏng vấn (14) | sound thường (32) |
|---|---|---|
| model đọc ra 1 người | **9/14** | 23/32 |
| 2 người | 4/14 | **9/32** |
| ngưỡng ≥2 người | bắt 36% | **loại oan 28%** |

Model không sai — **9/14 clip phỏng vấn thật sự chỉ có một giọng** vì sound đã cắt còn đúng câu
trả lời; còn 9 sound thường thì đúng là có hai giọng (tiểu phẩm, đối thoại). Nên số giọng nói
được để dạng **ghi chú**, đúng như bạn dặn — luật trong code chặn cứng không cho nó đổi LẤY/LOẠI,
và có test riêng canh điều đó.

---

## 0.6.3 — 2026-08-14

**Sửa lỗi loại oan giọng nói thành "Hát" — lỗi nặng nhất từ trước tới giờ**

Bạn báo `original-sound-7111801707792763674` (giọng bác sĩ nói tiếng Hindi): `nói 92% · hát 8%`
mà app gán nhãn **Hát** rồi **LOẠI**. Mổ ra thì thấy:

- Clip có **12 cửa sổ**. **Đúng một** cửa sổ có điểm hát = **0.043** — mà chính cửa sổ đó điểm
  nói cũng chỉ 0.148 (cửa sổ chuyển tiếp, nhiễu). **11 cửa sổ còn lại hát = 0.000.**
- Luật cũ chỉ xét **tỉ lệ**: 1/12 = 8.3% > ngưỡng 6% → gọi là Hát.
- Trớ trêu là **chú thích của chính luật đó đã viết** "một cửa sổ đơn độc không đủ" — nhưng nó
  tính cho clip ~19 cửa sổ. **Clip càng NGẮN càng dễ bị loại oan**, ngược hẳn ý định.

Sửa: thêm `minSingWin: 2` — phải đủ **cả tỉ lệ lẫn số cửa sổ**, bất kể clip dài ngắn.

**Hạ ngưỡng đỉnh hát `sMaxSing` 0.45 → 0.30**, chọn bằng số đo chứ không phải ước lượng. Chạy
lại **46 audio thật** thấy hai vùng tách hẳn nhau:

| loại | đỉnh hát | số cửa sổ có hát |
|---|---|---|
| sound **không** hát | ≤ **0.059** | 1–2 lẻ tẻ |
| sound **hát thật** | 0.031–0.082 | **2/9 … 8/34** |
| bản nhạc slow (clip 6 cửa sổ) | **0.414** | 1 |

Tức là dấu hiệu của hát thật là **nhiều cửa sổ**, không phải đỉnh cao. Giữa 0.059 và 0.414 không
có mẫu nào → đặt ngưỡng vào giữa khoảng trống đó. Nếu không hạ, bản nhạc slow kia sẽ lọt thành
LẤY sau khi thêm `minSingWin`.

Kết quả trên 46 sound thật: **3/46 đổi nhãn**, cả ba đều là 1 cửa sổ nhiễu (đỉnh 0.031–0.059)
được trả về đúng "Giọng nói". Không sound hát thật nào bị mất.

**Ảnh khung hình hiện thẳng trong bảng**

Đã đo hết mọi cách cho máy tự nhận ra clip phỏng vấn, không cách nào đủ tốt (xem dưới). Nhưng
**mắt người thì nhìn một cái là ra** — nên mỗi dòng giờ có ảnh khung hình 44×58 bên trái tên
sound. Lướt cả danh sách bằng mắt trong vài giây thay vì mở từng dòng.

**Đã đo và KHÔNG làm: cho máy nhìn hình để nhận ra phỏng vấn**

Tải `@mediapipe/tasks-vision` + EfficientDet-Lite (13.8 MB) chạy thử trên 42 ảnh khung hình
(13 clip phỏng vấn thật / 29 sound thường):

| cách | bắt được | loại oan |
|---|---|---|
| ≥2 **người** trong khung | 6/13 (46%) | **4/29 (14%)** |
| ≥2 **khuôn mặt** | **0/13** | 2/29 |

14% loại oan nghĩa là cứ 7 sound tốt thì mất 1 — không chấp nhận được. Nhận diện mặt còn vô
dụng hẳn (model chỉ thấy mặt lớn chính diện). **Không đưa vào app**, không cõng thêm 13.8 MB.

---

## 0.6.2 — 2026-08-14

**Nhận diện phỏng vấn / truyền hình: đo xong, đường âm thanh đóng hẳn**

Bạn hỏi có quét tự động clip phỏng vấn–truyền hình được không. Tôi kéo về **14 clip phỏng
vấn/talkshow/tvshow thật** (qua `/embed/tag/<hashtag>` — đường này mở, không cần đăng nhập)
rồi đo 16 nhãn "khán giả / trường quay" của YAMNet:

| nhãn | 14 clip phỏng vấn thật | 32 sound TikTok thường |
|---|---|---|
| `Applause` | **0.000 cả 14 file** | 0.000 |
| `Cheering` / `Crowd` | ≤ 0.031 / ≤ 0.043 | ≈ 0 |
| `Television` | ≤ 0.082 | ≤ 0.031 |
| `Laughter` | ≤ 0.414 | **≤ 0.586** |
| `Conversation` / `Narration` | ≤ 0.031 / ≤ 0.082 | ≤ 0.031 / **≤ 0.148** |

Sound **thường** còn chấm **cao hơn** clip phỏng vấn. Không có khe nào để dựng ngưỡng.
Cộng với hai nhãn `Conversation`/`Narration` đã đo chết từ 0.5.x → **nghe không ra phỏng vấn,
kết thúc hướng này**. Đừng ai chỉnh ngưỡng ở đây nữa.

**Đọc được CAPTION của video — trước giờ chưa hề đọc**

Key trong trang embed là `"text"`, **không phải `"desc"`**. Do đọc nhầm tên key nên caption
luôn ra rỗng suốt thời gian qua mà không ai hay. Caption là mảnh chữ giàu nhất trang đó có:
hashtag bị nén thành `#fyp #viral` vô nghĩa, còn caption là câu chữ thật
(*"HIS REACTION LOLL \*Full Episode in Bio\*"*).

- Caption dùng **bộ cụm từ hẹp riêng** (`full episode`, `interview with`, `on the podcast`,
  `talk show`, `entrevista con`, `phỏng vấn`…), **không** dùng bộ `TU_PHIM` rộng của hashtag —
  chữ "phim"/"movie" nói vu vơ trong câu đời thường sẽ loại oan hàng loạt.
- **Đo thật:** bắt thêm **1/14** clip phỏng vấn bằng chữ tự do, **loại oan 0/32** sound thường.
  Rẻ (không tốn thêm request nào) và an toàn — nhưng **không phải lời giải**: 13/14 clip
  caption chỉ ghi "his laugh", "Horror prank gone wrong", không hề lộ ra là cắt từ đâu.
- **Caption giờ hiện thẳng trong bảng** (dòng 💬 dưới tên sound) và trong panel. Đây mới là
  phần giúp bạn "chắc chắn hơn" với hàng LẤY: liếc một cái là thấy người đăng viết gì, không
  phải mở trình duyệt.

**Sửa lỗi loại oan do chính tôi gây ra ở 0.6.1**

Luật "tự xưng official mà chưa tích xanh" ở 0.6.1 đọc cả **tên tài khoản**. Đo lại trên 32
sound thật thì nó dính `@the_official_shaboykary` — một **nhạc sĩ thật**, bio chỉ ghi
"Shaboykary Gratataa". Con số "0/8 không loại oan" báo ở 0.6.1 là do bộ mẫu quá hẹp.

→ Luật siết lại **chỉ đọc BIO**. Chữ "official" trong *tên* chỉ là cách đặt nick; lời tự nhận
trong *bio* mới là một phát biểu. Sau khi siết: vẫn bắt đúng Po panda, **tha Shaboykary**.

**Thêm cờ chẩn đoán `--do-nhan=<biểu thức>`**

In điểm từng nhãn khớp biểu thức, trên từng cửa sổ — để lần sau hiệu chỉnh bằng **số đo** chứ
không phải đoán. Ví dụ: `--do-nhan="Applause|Crowd|Laughter"`.

---

## 0.6.1 — 2026-08-14

**Bắt được sound giọng AI của tài khoản đóng vai nhân vật**

Ca thật bạn gửi: `original-sound-7506489958937414406` — clip Kung Fu Panda lồng giọng AI, app
cũ cho **LẤY**. Tôi đo ba hướng, chỉ một hướng đứng được:

| hướng | kết quả đo | quyết định |
|---|---|---|
| Nghe ra giọng AI bằng model | nhãn `Speech synthesizer` = **0.000** trên chính sound đó (Windows TTS thì 0.122 / 74% cửa sổ) | **bỏ** — giọng AI đời nay model này không nghe ra |
| Gom hashtag từ **5 video** thay vì 1 | 9 sound thử: **không đổi kết quả nào**, tốn thêm 4 request/link | **bỏ** |
| Chủ sound **tự xưng "official" mà chưa có tích xanh** | bắt đúng ca đó; **0/8 tài khoản người thật bị loại oan** | **làm** |

- Luật mới chỉ chạy khi **chắc chắn đó là tài khoản chủ sound** (nickName trùng `authorName`
  của sound). Người khác *dùng* sound thì không tính — nếu không, một tài khoản tên "official"
  sẽ kéo cả sound của người khác xuống.
- Có tích xanh thật → **tha** (đó là tài khoản chính thức thật). Không đọc được trạng thái tích
  xanh cũng **tha** — không đoán bừa.
- `unofficial` không tính là tự xưng (khớp theo **từ riêng**).
- Giao diện hiện thẻ riêng **🎭 tài khoản đóng vai** để phân biệt với **🎬 phim/hoạt hình**.

**Báo cáo dòng lệnh nói rõ vì sao bị loại**

Trước đây in "❌ LOẠI · Giọng nói" mà không nói lý do — nhìn rất khó hiểu. Nay thêm dòng
`⚠ loại vì: …` (bản quyền / phim / tài khoản đóng vai) và `✋ bạn tự chọn` khi là quyết định tay.

---

## 0.6.0 — 2026-08-14

**Làm lại toàn bộ giao diện**

- **Thẻ số liệu** cho Lấy / Loại / Lỗi thay cho dòng chữ nhỏ — số lớn, dễ liếc.
- **Huy hiệu** LẤY/LOẠI bo tròn có nền và viền theo màu trạng thái, thay ô chữ trơn.
- **Ba thanh đo** cho nói · hát · nhạc thay ba con số.
- Nền 3 tầng tạo chiều sâu, nút chính có chuyển sắc, ô nhập có vòng focus, hàng bảng sáng
  lên khi rê chuột, panel có làm mờ nền phía sau và trượt vào.

**Ba quy tắc đọc dữ liệu tôi bám theo, không phải chọn cho đẹp**

1. **KHÔNG xếp chồng ba thanh nói/hát/nhạc thành một.** Model là *đa nhãn* — một clip có thể
   vừa "nói 100%" vừa "nhạc 46%", ba số **không cộng lại bằng 100**. Thanh xếp chồng sẽ ngụ ý
   sai rằng chúng chia nhau một tổng.
2. **Màu trạng thái và màu dữ liệu là hai bộ tách biệt.** Xanh/đỏ/vàng chỉ dùng cho
   lấy/loại/lỗi; xanh dương/cam/lục chỉ dùng cho ba thanh đo. Một màu trạng thái không bao giờ
   bị nhầm thành một chuỗi số liệu.
3. **Màu không bao giờ nói một mình.** Mọi huy hiệu đều có **biểu tượng + chữ**, nên người mù
   màu vẫn đọc được.

Bảng màu ba thanh đo được **kiểm bằng script**, không ước lượng bằng mắt: đạt cả 6 phép kiểm
trên nền tối — dải độ sáng, sàn bão hoà, tách màu cho người mù màu (ΔE 9.4 deutan), tách màu
thường (26.5), tương phản ≥ 3:1.

**Hàng điều khiển tách làm hai**
- Hàng trên = **việc đang làm**: `Kiểm tra` · `Dừng` · thanh tiến độ (có số %, có vân chạy khi
  đang chạy, chuyển xanh khi xong).
- Hàng dưới = **cài đặt**, dạng huy hiệu bấm được: `⏱ 120 giây đầu`, `Chỉ hiện LẤY`,
  `🔒 Loại nhạc có bản quyền`, `🎬 Loại voice phim/hoạt hình`.
- Trước đó nhét hết vào một hàng nên nó tự xuống dòng lung tung, nhìn như một dãy nút không có
  thứ bậc.

**Bỏ 3 nút Lấy / Loại / Bỏ ghi đè trong mini browser** (theo yêu cầu — thấy không cần thiết).
Panel giờ chỉ để **xem và tra cứu**. Phần đọc kho `quyet-dinh-tay.json` vẫn giữ: ai muốn ép cứng
kết quả cho vài link thì sửa thẳng file đó, app vẫn áp dụng.

**Sửa lỗi**
- Trong panel, nhãn "đang LOẠI" dùng **màu vàng cảnh báo** trong khi bảng dùng **đỏ** — cùng một
  trạng thái mà hai màu. Nay thống nhất.
- Khi gỡ 3 nút, tôi cắt lẹm mất dấu `<` của thẻ `<script src="./ui.js">` → **ui.js không được nạp,
  cả giao diện chết** (bấm nút không phản ứng, badge phiên bản đứng ở "…"). Test giao diện bắt
  được ngay: 16/30 phép kiểm lật.
- CSS `.chip input` ẩn **mọi** input trong huy hiệu — kể cả **ô nhập số giây**, nên chỉ còn chữ
  "giây đầu" trơ trọi không hiểu để làm gì. Nay chỉ ẩn ô tick.

---

## 0.5.1 — 2026-08-14

**Thêm nhóm từ phỏng vấn / talkshow / podcast vào luật loại**
- `interview`, `phongvan`, `phỏng vấn`, `entrevista`, `wawancara`, `podcast`, `talkshow`.
- Kiểm lại trên dữ liệu thật: **không loại oan** sound nào đang quét.

**⚠ Nhưng nhóm này bắt được ÍT — cần biết rõ giới hạn**

Voice phỏng vấn **vẫn là giọng người** nên model chấm "Giọng nói" rồi cho LẤY. Tệ hơn nữa:

> Một clip phỏng vấn đã **cắt chỉ còn lời người trả lời** thì về mặt âm thanh **giống hệt** một
> người ngồi nói với camera. Kể cả model đếm số người nói cũng chịu — trong clip chỉ có một giọng.

Nên chỉ còn trông vào hashtag. Mà đo ngày 2026-08-14 trên chính danh sách đang quét thì **không
sound nào gắn `#interview`**:

| sound | hashtag |
|---|---|
| Aliyu haidar | `capcut` |
| ConMmoive | `fyp, foryou, foryoupage` |
| Motivation Spark | `motivation, speech, mindset, discipline` |
| real.spillnyc (clip phỏng vấn Katt Williams) | `realspill, fyp, viral, introvert` |

→ Ca khó vẫn phải xem bằng **mini browser + 📸 Google Ống kính**. Đã thử thật: Lens nhận ra ngay
"Katt Williams — podcast Club Shay Shay", bấm ❌ Loại là xong và được nhớ cho lần sau.

---

## 0.5.0 — 2026-08-14

**📸 Chụp + Google Ống kính — chụp ĐÚNG khung hình đang xem**

Bản trước tra ngược *ảnh bìa cố định* (khung đầu video) nên thường vô nghĩa — cảnh cần nhận
diện có thể ở giây thứ 10. Nay bấm nút là **chụp ngay khung hình đang hiện**, chép vào
clipboard rồi mở Lens để dán bằng `Ctrl+V`.

- ⚠ **Phải chụp ở phía main.** Video nằm trong iframe của TikTok (khác nguồn) nên JS trong
  trang **không đọc được pixel** — chính sách cùng nguồn chặn canvas. Nhưng
  `webContents.capturePage()` chụp ở tầng trình duyệt, là ảnh đã ghép của cả trang, nên có
  cả nội dung iframe. **Đã kiểm tận mắt**: chụp ra đúng khung hình anime, 98–123 KB.
- ⚠ **Phải cắt theo phần THỰC SỰ nhìn thấy.** `getBoundingClientRect()` trả ô bố cục
  (iframe cao 580px) kể cả khi phần dưới đã bị khung cuộn che — chụp theo đó thì ảnh lố
  xuống cả hàng nút Lấy/Loại. Đã chụp nhầm thật, nay cắt giao của iframe ∩ khung cuộn ∩ màn hình.
- Dùng clipboard thay `uploadbyurl`: ảnh là khung hình **bạn đang xem**, và không phụ thuộc
  URL ảnh của TikTok (vốn hết hạn sau ~1 ngày).
- Lần đầu mở, TikTok hiện banner cookie che ~1/4 dưới khung hình. **Bấm thẳng vào nó một lần**
  là xong — cookie lưu trong thư mục dữ liệu app, không hiện lại. (Đã thử tự tắt bằng cách
  chạy JS trong khung con — không ăn, nên bỏ thay vì để lại mã chết.)

**Sửa lỗi**
- Phép kiểm ảnh chụp trong test **lật thất thường** vì chụp trước khi iframe kịp vẽ (ra ảnh
  trắng ~2 KB) — trong khi app không hề hỏng. Nay test chụp lại vài nhịp đến khi có nội dung
  thật, thay vì đoán một mốc thời gian cố định.

---

## 0.4.0 — 2026-08-14

**Loại voice phim / hoạt hình**

Voice trong phim và anime **vẫn là giọng người** nên model audio chấm "Giọng nói" rồi cho LẤY —
không có cách nào tách bằng âm thanh. Nhưng TikTok lộ hai thứ đọc được:

```
challengeInfoList[].challengeName  → hashtag của video   (#anime, #cartoonnetwork...)
textExtra[].HashtagName            → hashtag gõ trong mô tả
authorInfos.signature              → bio tài khoản ("Cortos de Anime totalmente Latam")
```

Đo trên đúng 7 link đang quét — **bắt đúng 2 ca, không loại oan ca nào**:

| sound | hashtag / bio | kết quả |
|---|---|---|
| `Devil_Man` | `anime` + bio *"Cortos de Anime"* | ❌ nghi phim |
| `Tamysketches` | `cartoonnetwork, southpark, animatic` + bio *"Loves cartoons!"* | ❌ nghi phim |
| `Harrinson` | `humor, comedia` | ✅ người thật |
| `𝑿` | `family, kesfet` | ✅ người thật |
| `Vickhytam` / `Yartrix` / `ATRA` | game, floptok, không tag | không dính |

- **Không tốn thêm request nào**: hashtag lấy ngay trên trang video đã tải để lấy playUrl. Đo
  được là **video đầu tiên là đủ** — với original sound, video đầu chính là video của chủ sound;
  các video sau là người khác dùng ké nên không mang dấu hiệu gì.
- Ô **"Loại voice phim/hoạt hình"** (mặc định bật) tắt/bật tính lại ngay. Bảng hiện 🎬 kèm
  **từ khớp** để biết vì sao bị loại.
- ⚠ **Cố ý KHÔNG lấy** `edit`, `fanart`, `cosplay`, hay tên phim cụ thể: `#edit` thì video nào
  cũng gắn, `fanart`/`cosplay` nói về phim nhưng audio thường là giọng người thật, còn tên phim
  thì vô hạn và dễ trùng meme. Thà bỏ sót còn hơn loại oan — đã có mini browser để bắt nốt.

**Nút Google Ống kính (tra ngược ảnh)**
- Thêm **🔍 Google Ống kính** trong mini browser: tra ngược **khung hình video** của sound.
- Mạnh hơn hẳn tìm theo tên cho đúng việc bạn cần — Lens so **ảnh**, nên với một frame
  anime/phim nó chỉ thẳng ra tên bộ phim, còn tìm theo tên thì `MHOFUKADZI` ra 21 video
  nhạc Zimbabwe vô can.
- ⚠ Phải **loại avatar**: trường `covers` của original sound thường trỏ tới avatar chủ sound,
  tra ngược avatar thì vô dụng. Nay lấy khung hình video thật từ trang embed music.
- ⚠ URL ảnh của TikTok có `x-expires` (~1 ngày). Lens tải ảnh lúc bấm nút nên dùng trong phiên
  quét thì không sao, để sang hôm sau thì link chết.
- Vẫn **không tự động loại** theo kết quả tìm kiếm — xem lý do đã đo ở bản 0.3.0.

**Sửa lỗi**
- **Test giao diện ghi đè lên quyết định thủ công THẬT của người dùng**: nó bấm Lấy/Loại trên
  link thật, mà quyết định đó được lưu để nhớ lại. Chạy test vài lần là kết quả thật bị
  "bạn tự chọn loại" hàng loạt. Nay test chạy trên thư mục dữ liệu riêng (`--user-data-dir`).

---

## 0.3.0 — 2026-08-14

**Mini browser — xem video thật ngay trong app**
- Bấm vào một dòng → panel trượt ra, nhúng **player TikTok thật** (`/embed/v2/<videoId>`).
  Kiểm header trước khi làm: trang embed không đặt `X-Frame-Options`, CSP không có
  `frame-ancestors` → nhúng iframe được.
- Panel hiện kèm **@tài khoản + tích xanh**, có phải chủ sound không, nhãn máy chấm, các con số.
- Nút **✅ Lấy (1)** / **❌ Loại (0)** để bạn **ghi đè** máy — thắng cả luật bản quyền.
  Bấm xong tự nhảy sang dòng kế để duyệt liền tay. Phím ← → đổi dòng, Esc đóng.
- Đóng panel là gỡ luôn iframe, video không chạy ngầm.

**Nút tra cứu nền tảng khác**
- Trong mini browser có **🔎 YouTube**, **🔎 Google**, **↗ Mở trên TikTok** — mở bằng trình
  duyệt ngoài (Google/YouTube chặn nhúng iframe, khác trang embed của TikTok).
- Truy vấn tự dựng theo tên sound: tên đặc trưng thì tìm **nguyên văn trong ngoặc kép**, tên
  chung chung ("original sound", "nhạc nền"…) thì tìm theo **tên tài khoản**.
- Panel **nói thẳng độ tin cậy** của kết quả tìm kiếm trước khi bạn nhìn — xem mục dưới.

**Đã đo và KHÔNG tự động hoá: check "có trên YouTube/Instagram thì loại"**
- Đo thật ngày 2026-08-14:

  | truy vấn | YouTube trả về |
  |---|---|
  | `From The Back Funny Sound Effect` (tên riêng) | kết quả đầu **trùng tên chính xác** |
  | `MHOFUKADZI` (tên chủ original sound) | 21 video **nhạc Zimbabwe không liên quan** |
  | `Chota Boss tv` | lẫn *"Boss Baby"*, *"Chat Boss YT First Vlog"* |

- **YouTube luôn trả về kết quả gì đó.** Tự động loại khi "tìm thấy ≥1 video" thì gần như mọi
  link đều bị loại, và bị loại vì lý do sai.
- Ca chạy đúng (tên riêng đặc trưng) thì **cờ `original` đã bắt được rồi** → thêm vào gần như
  không thêm thông tin mà lại đẻ ra loại oan hàng loạt.
- Về mặt logic luật này cũng lung lay: sound TikTok viral thì ai cũng re-up sang Shorts/Reels,
  nên "có trên YouTube" phần lớn nghĩa là **đã viral**, không phải **có bản quyền**.
- Muốn check bản quyền thật thì phải dùng **vân tay âm thanh** (so chính audio, như Shazam /
  ContentID) — cần dịch vụ trả phí (ACRCloud, Audd.io) vì phải có sẵn kho vân tay.
- → Nên chỉ làm **nút tra cứu**, người xem tự phán xét.

**Nhớ quyết định thủ công theo link**
- Lưu ra `%APPDATA%\VoiceOrMusic\quyet-dinh-tay.json`, lần sau quét lại link đó tự áp lại —
  không phải xem lại video lần hai. Dùng chung cho cả giao diện lẫn dòng lệnh.
- Khoá là **link sound đã rút gọn**, nên dán link dài, link ngắn hay id trơ đều trỏ về một
  quyết định.

**Đã đo và KHÔNG làm: nhận diện phỏng vấn bằng audio**
- Tải 2 bản ghi phỏng vấn thật (2 người hỏi–đáp) về đo hai nhãn gần nhất của YAMNet:

  | mẫu | `Conversation` TB/đỉnh | `Narration, monologue` TB/đỉnh | % cửa sổ >0.1 |
  |---|---|---|---|
  | phỏng vấn thật #1 | 0.002 / 0.06 | 0.014 / 0.08 | 0% |
  | phỏng vấn thật #2 | 0.000 / 0.00 | 0.007 / 0.03 | 0% |
  | một người độc thoại | 0.000 / 0.00 | 0.002 / 0.01 | 0% |

- Hai nhãn đó **chết hẳn**, phỏng vấn cho số y hệt độc thoại → không dựng được ngưỡng.
  Muốn tự động thật phải **đếm số người nói** (speaker diarization, model riêng), và vẫn thủng
  với phỏng vấn đã cắt chỉ còn một giọng. → giao cho mini browser.

**Sửa lỗi**
- **App dùng 3 thư mục dữ liệu khác nhau** tuỳ cách chạy (`Electron/`, `voice-or-music/`,
  `VoiceOrMusic/`) vì Electron không đọc `package.json` khi đường dẫn app là một *file*.
  Hậu quả: bấm Lấy/Loại trong giao diện rồi chạy dòng lệnh thì không thấy quyết định đó đâu,
  và đóng gói xong là quyết định cũ "biến mất". Nay chốt cứng `app.setName('VoiceOrMusic')`.
- Giao diện gửi thiếu `soundUrl` khi nhờ main tính lại → **khoá tra quyết định thủ công rỗng**,
  mọi lần bấm Lấy/Loại bị bỏ qua trong im lặng. Test giao diện bắt được.

---

## 0.2.0 — 2026-08-14

**Cột "Tình trạng" (1/0)**
- Bảng kết quả có cột **Tình trạng**: `1` = LẤY, `0` = LOẠI. Có luôn trong CSV (cột đầu).
- Bỏ tick "Chỉ hiện LẤY" là thấy cả link bị loại kèm số `0`.

**Lọc theo bản quyền**
- Đọc cờ `original` của TikTok: `""` = nhạc catalog có bản quyền, `true` = sound người dùng tạo.
  Đây là tín hiệu bản quyền duy nhất lấy được miễn phí — trong dữ liệu sound **không có** trường
  `copyright`/`isCopyrighted` nào, và chữ "verified" trong trang embed chỉ là chữ nằm trong mã JS.
- Sound có bản quyền → `0` kể cả khi nghe ra là giọng người, hiện kèm dấu 🔒.
- Ô **"Loại nhạc có bản quyền"** (mặc định bật) tắt/bật là tính lại ngay, **không chạy lại model**.
- ⚠ `original: true` không bảo đảm sạch bản quyền (người dùng vẫn đăng lại nhạc thành "original
  sound" của họ) → đây là căn cứ để **loại**, không phải để **nhận**.
- ⚠ Không đọc được thông tin thì **không** coi là có bản quyền — TikTok đổi cấu trúc dữ liệu thì
  luật tự im lặng thay vì loại sạch cả danh sách.

**Bộ kiểm chứng nghe được**
- Nút **Xuất bộ kiểm chứng** → thư mục có `kiem-chung.html` + `audio/` (chính đoạn máy đã nghe).
- Trang HTML có nút Play từng sound, chấm **Đúng/Sai**, và nút gom nhận xét để gửi lại.
- Dòng lệnh: `check.cmd --kiem-chung=D:\kc --file=links.txt`

**Sửa lỗi**
- `build.bat` treo im lặng ~10 phút khi app đang mở (file .exe bị khoá) → nay báo ngay.
- `preload.cjs` chết cả file khi `require()` file của dự án (Electron chạy preload trong sandbox)
  → giao diện im lìm, bấm nút không phản ứng. Nay tính qua IPC.

---

## 0.1.0 — 2026-08-13

Bản đầu.

- 5 nhãn: Giọng nói / Giọng nói + nhạc nền / Hát / Nhạc / Không rõ, kèm cờ LẤY–LOẠI.
- Lấy audio qua trang `/embed/` — chạy được **không cần đăng nhập** (trang `/music/` không còn
  nhúng dữ liệu sound, API của nó trả 0 byte cho khách vãng lai).
- Model YAMNet (`.tflite`) chạy bằng `@mediapipe/tasks-audio`; giải mã audio + đổi 16 kHz mono
  bằng Web Audio của Chromium nên **không cần ffmpeg**.
- Ngưỡng hát chỉnh theo số đo thật, không ước lượng: hát thật cho điểm `Singing` ~0.05 còn
  nói/nhạc cho **đúng 0.000**, nên ranh giới nằm ở 0.0x chứ không phải 0.2.
- Phân tích trọn sound (120 giây) thay vì 30 giây đầu — đo được ca hát chỉ bắt đầu từ giây 26.
- Giao diện + bản .exe portable, CLI, xuất CSV, copy link lấy được.
- 155 phép kiểm Node thuần + test giao diện chạy trên app thật.
