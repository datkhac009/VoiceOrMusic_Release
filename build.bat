@echo off
REM ===========================================================================
REM  build.bat - dong goi VoiceOrMusic thanh MOT file .exe chay ngay, khong cai dat.
REM  Ket qua:  ..\VoiceOrMusic_Release\VoiceOrMusic.exe
REM
REM  Bam dup file .exe do  -> mo GIAO DIEN (dan link, bam Kiem tra).
REM  Goi kem tham so       -> chay kieu dong lenh:
REM        VoiceOrMusic.exe --only-voice --out=kq.txt --file=links.txt
REM
REM  LUU Y CHO NGUOI SUA FILE NAY: giu NGUYEN 100%% ASCII.
REM  Da sap mot lan vi viet ky tu Unicode (dau canh bao va ky tu ke khung) vao day:
REM  cmd doc file .bat theo bang ma OEM nen cac byte UTF-8 lam HONG cach no tach dong
REM  lenh -> chay ra mot dong loi vo nghia kieu "'giai' is not recognized".
REM  Khong dau tieng Viet, khong emoji, khong ky tu ke khung.
REM ===========================================================================
setlocal
cd /d "%~dp0"

REM PHAI XOA bien nay. Neu con sot lai (npm/electron hay de lai), electron.exe se chay
REM nhu node thuan - khong co Chromium -> khong giai ma duoc audio, khong chay duoc model.
set "ELECTRON_RUN_AS_NODE="

echo.
REM Doc so phien ban tu package.json. Token cat ra con ca dau nhay VA khoang trang dau dong
REM (vi dong trong package.json la:   "version": "0.2.0",) nen phai go ca hai, khong thi in
REM ra thanh  v"0.2.0"  trong rat cau tha.
for /f "tokens=2 delims=:," %%V in ('findstr /C:"\"version\"" package.json') do set "PB=%%V"
set "PB=%PB: =%"
set PB=%PB:"=%
echo ==========================================================
echo  VoiceOrMusic v%PB% - dong goi ban portable (Windows x64)
echo ==========================================================
echo.

REM --- 1. Kiem tra nhung thu BAT BUOC phai co truoc khi build ---------------
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node. Cai Node LTS roi chay lai: https://nodejs.org
  goto :loi
)

REM App dang mo thi file .exe bi KHOA -> electron-builder khong ghi de duoc va treo im lang
REM rat lau (do that: 10 phut khong mot dong bao loi). Kiem truoc de bao ngay.
tasklist /FI "IMAGENAME eq VoiceOrMusic.exe" 2>nul | find /I "VoiceOrMusic.exe" >nul
if not errorlevel 1 (
  echo [LOI] VoiceOrMusic dang chay - file .exe bi khoa nen khong ghi de duoc.
  echo       Dong app roi chay lai. Muon dong nhanh:
  echo         taskkill /IM VoiceOrMusic.exe /F
  goto :loi
)

if not exist "models\yamnet.tflite" (
  echo [LOI] Thieu file model: models\yamnet.tflite
  echo       Tai lai bang lenh:
  echo         curl -L -o models\yamnet.tflite https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite
  goto :loi
)

if not exist "node_modules\@mediapipe\tasks-audio\wasm\audio_wasm_internal.wasm" (
  echo [!] Thieu thu vien. Dang chay: npm install
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :loi
)

if not exist "node_modules\electron-builder\package.json" (
  echo [!] Thieu electron-builder. Dang cai...
  call npm install --save-dev --no-audit --no-fund electron@28 electron-builder@24
  if errorlevel 1 goto :loi
)

REM --- 2. Chay test truoc khi build -----------------------------------------
REM Build ra mot ban .exe SAI ton nhieu thoi gian hon la doi test vai giay o day.
echo [1/3] Chay test...
call npm test >nul 2>nul
if errorlevel 1 (
  echo.
  echo [LOI] TEST HONG - khong build. Chay "npm test" de xem chi tiet.
  goto :loi
)
echo       test: OK
echo.

REM --- 3. Don ban cu roi dong goi -------------------------------------------
echo [2/3] Don ban cu...
if exist "..\VoiceOrMusic_Release\VoiceOrMusic.exe" del /q "..\VoiceOrMusic_Release\VoiceOrMusic.exe"

echo [3/3] Dang dong goi...
echo.
call npx electron-builder --win portable --x64
if errorlevel 1 goto :loi

echo.
if not exist "..\VoiceOrMusic_Release\VoiceOrMusic.exe" (
  echo [LOI] Chay xong nhung khong thay file .exe dau ra.
  goto :loi
)

for %%F in ("..\VoiceOrMusic_Release\VoiceOrMusic.exe") do set "KICHTHUOC=%%~zF"
set /a MB=%KICHTHUOC%/1048576
echo ==========================================================
echo  XONG. VoiceOrMusic v%PB%
echo  File: %~dp0..\VoiceOrMusic_Release\VoiceOrMusic.exe  (%MB% MB)
echo.
echo  Bam dup de mo giao dien, hoac chay kieu dong lenh:
echo    VoiceOrMusic.exe --only-voice --out=kq.txt --file=links.txt
echo ==========================================================
echo.
if not "%1"=="--khong-dung" pause
exit /b 0

:loi
echo.
if not "%1"=="--khong-dung" pause
exit /b 1
