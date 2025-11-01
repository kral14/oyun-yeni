# Email Konfiqurasiyası

## SMTP Server Parametrləri

API serverini işə salarkən email göndərmək üçün aşağıdakı environment dəyişənlərini təyin edin:

### Windows PowerShell:
```powershell
$env:SMTP_SERVER="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_EMAIL="your-email@gmail.com"
$env:SMTP_PASSWORD="your-app-password"
$env:RESET_PASSWORD_URL="http://127.0.0.1:5000/reset-password.html"
python api_server.py
```

### Windows CMD:
```cmd
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_EMAIL=your-email@gmail.com
set SMTP_PASSWORD=your-app-password
set RESET_PASSWORD_URL=http://127.0.0.1:5000/reset-password.html
python api_server.py
```

### Linux/Mac:
```bash
export SMTP_SERVER="smtp.gmail.com"
export SMTP_PORT="587"
export SMTP_EMAIL="your-email@gmail.com"
export SMTP_PASSWORD="your-app-password"
export RESET_PASSWORD_URL="http://127.0.0.1:5000/reset-password.html"
python api_server.py
```

## Gmail üçün App Password

Gmail istifadə edirsinizsə:

1. Google Account-a daxil olun
2. Security (Təhlükəsizlik) bölməsinə gedin
3. 2-Step Verification aktiv olsun
4. App passwords (Tətbiq parolları) bölməsinə gedin
5. Yeni app password yaradın və onu `SMTP_PASSWORD` kimi istifadə edin

## Digər Email Provider-lər

### Outlook/Hotmail:
- SMTP_SERVER: smtp-mail.outlook.com
- SMTP_PORT: 587

### Yahoo:
- SMTP_SERVER: smtp.mail.yahoo.com
- SMTP_PORT: 587

### Custom SMTP:
Parametrləri email provider-inizdən öyrənin və yuxarıdakı formatda təyin edin.

