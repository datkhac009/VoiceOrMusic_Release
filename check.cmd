@echo off
REM check.cmd — nhan dien link sound TikTok la giong noi hay nhac.
REM   check.cmd https://www.tiktok.com/music/original-sound-7411103147315349520
REM   check.cmd --file=links.txt
setlocal
set "ELECTRON_RUN_AS_NODE="
node "%~dp0run.cjs" %*
endlocal
