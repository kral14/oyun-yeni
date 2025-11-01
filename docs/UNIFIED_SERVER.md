# 🎯 Birləşdirilmiş Server

## ✅ Tamamlandı

İki server birləşdirildi! Artıq yalnız **bir server** işə salmaq lazımdır.

## 🚀 İşə Salmaq

### API Server (Birləşdirilmiş)

```powershell
cd api
$env:SMTP_SERVER="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_EMAIL="neondefendergame@gmail.com"
$env:SMTP_PASSWORD="mayxzchjizddhgdb"
$env:RESET_PASSWORD_URL="http://127.0.0.1:5000/reset-password.html"
python api_server.py
```

## 🌐 URL-lər

Bütün funksiyalar **bir serverdə**:

- **Ana səhifə:** http://127.0.0.1:5000/
- **Giriş:** http://127.0.0.1:5000/login.html
- **Qeydiyyat:** http://127.0.0.1:5000/register.html
- **Şifrə unutma:** http://127.0.0.1:5000/forgot-password.html
- **API:** http://127.0.0.1:5000/api
- **Assets:** http://127.0.0.1:5000/assets/

## ✨ Üstünlüklər

1. **Sadə:** Yalnız bir server işə salmaq lazımdır
2. **CORS problemi yox:** Bütün request-lər eyni serverdən gəlir
3. **Daha az konfiqurasiya:** Bir port, bir server
4. **Production-ready:** Deployment üçün hazır

## ⚠️ Qeyd

- HTTP Server (`scripts/server.py`) artıq lazım deyil
- Bütün path-lər `/api`, `/assets/` kimi relative path-lərdir
- İstifadəçilər eyni portdan (5000) həm HTML, həm də API alır

## 🔧 Struktur

```
api/
└── api_server.py  # Birləşdirilmiş server (API + HTML + Assets)
```

Server avtomatik olaraq:
- HTML səhifələri serve edir (`pages/` qovluğundan)
- Static faylları serve edir (`assets/` qovluğundan)
- API endpoint-ləri təmin edir (`/api/` path-i altında)

