@echo off
echo ========================================
echo   API Server - Manual Konfiqurasiya
echo ========================================
echo.
echo Bu faylı dəyişdirib email və şifrənizi yazın, sonra saxlayın
echo.

REM ========================================
REM  EMAIL KONFİQURASİYASI
REM ========================================
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_EMAIL=neondefendergame@gmail.com
set SMTP_PASSWORD=ugcfkjvlsphlfxar
set RESET_PASSWORD_URL=http://127.0.0.1:5000/reset-password.html

echo.
echo Email: %SMTP_EMAIL%
echo Server: %SMTP_SERVER%
echo.
echo Server başladılır...
echo.

REM Get script directory and navigate to project root, then to api folder
cd /d "%~dp0"
cd ..\api
python api_server.py

pause

