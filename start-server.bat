@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo INCORE 베트남 사이트 서버를 시작합니다...
echo   사이트:   http://localhost:8753/
echo   관리자:   http://localhost:8753/admin.html
start "" http://localhost:8753/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
