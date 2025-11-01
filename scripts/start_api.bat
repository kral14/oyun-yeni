@echo off
echo ========================================
echo   API Server Başladılır
echo ========================================
echo.
echo Zəhmət olmasa aşağıdakı məlumatları daxil edin:
echo.

set /p SMTP_EMAIL="Gmail email ünvanı: "
set /p SMTP_PASSWORD="App Password (16 simvol): "
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set RESET_PASSWORD_URL=http://127.0.0.1:5000/reset-password.html

echo.
echo Email konfiqurasiyası:
echo SMTP Server: %SMTP_SERVER%
echo SMTP Port: %SMTP_PORT%
echo Email: %SMTP_EMAIL%
echo.
echo Server başladılır...
echo.

REM Get script directory and navigate to project root, then to api folder
cd /d "%~dp0"
cd ..\api
python api_server.py

