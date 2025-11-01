# API Server - İşə Salma Təlimatı

## ✅ Email Konfiqurasiyası Tamamlandı

Email parametrləri konfiqurasiya edildi:
- **Email:** neondefendergame@gmail.com
- **SMTP Server:** smtp.gmail.com
- **SMTP Port:** 587

## 🚀 Serveri İşə Salmaq

### Metod 1: PowerShell Script (Tövsiyə olunur)
```powershell
.\START_API.ps1
```

### Metod 2: Batch Fayl
```cmd
start_api_manual.bat
```

### Metod 3: Manual (PowerShell)
```powershell
$env:SMTP_SERVER="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_EMAIL="neondefendergame@gmail.com"
$env:SMTP_PASSWORD="mayxzchjizddhgdb"
$env:RESET_PASSWORD_URL="http://127.0.0.1:5000/reset-password.html"
python api_server.py
```

## 🌐 API Endpoint-ləri

Server işə salındıqdan sonra:
- **Base URL:** http://127.0.0.1:5000/api
- **Health Check:** http://127.0.0.1:5000/api/health
- **Register:** POST http://127.0.0.1:5000/api/register
- **Login:** POST http://127.0.0.1:5000/api/login
- **Forgot Password:** POST http://127.0.0.1:5000/api/forgot-password
- **Reset Password:** POST http://127.0.0.1:5000/api/reset-password

## 📧 Email Sistemi

Şifrə sıfırlama email-ləri avtomatik olaraq göndəriləcək:
- Email göndəriləndə konsolda "✅ Email göndərildi" mesajı görünəcək
- Email göndərilməzsə konsolda xəta mesajı görünəcək

## ⚠️ Qeyd

- Server işə salındıqdan sonra pəncərəni bağlamayın
- Serveri dayandırmaq üçün `Ctrl+C` düymələrinə basın
- Əgər port 5000 işğal olunubsa, fərqli port istifadə edin:
  ```powershell
  $env:PORT="5001"
  ```

## 🧪 Test

Serverin işləyib-işləmədiyini yoxlamaq üçün:
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/health" -UseBasicParsing
```

Cavabda `{"success":true,"status":"healthy"}` görünməlidir.

