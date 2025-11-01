# 🎮 Qüllə Müdafiəsi Oyunu

Tower Defense oyunu - PostgreSQL database ilə tam inteqrasiya.

## 📁 Struktur

```
oyun-yeni/
├── pages/              # HTML səhifələri
│   ├── index.html      # Ana oyun səhifəsi
│   ├── login.html      # Giriş səhifəsi
│   ├── register.html   # Qeydiyyat səhifəsi
│   ├── mobile.html     # Mobil versiya
│   └── ...
├── assets/             # Static fayllar
│   ├── game.js         # Oyun kodu
│   ├── style.css       # Stil faylı
│   ├── favicon.svg     # Favicon
│   ├── sw.js           # Service Worker
│   └── manifest.webmanifest
├── api/                # Backend API
│   └── api_server.py   # Flask API Server
├── scripts/            # Skriptlər
│   ├── START_API.ps1   # API server başlatmaq
│   └── ...
└── docs/               # Sənədləşmə
    └── ...
```

## 🚀 Tez Başlanğıc

### Unified Server işə salmaq

```powershell
cd api
$env:SMTP_SERVER="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_EMAIL="neondefendergame@gmail.com"
$env:SMTP_PASSWORD="mayxzchjizddhgdb"
$env:RESET_PASSWORD_URL="http://127.0.0.1:5000/reset-password.html"
python api_server.py
```

### Brauzerdə açmaq

- **Ana səhifə:** http://127.0.0.1:5000/
- **Giriş:** http://127.0.0.1:5000/login.html
- **Qeydiyyat:** http://127.0.0.1:5000/register.html

## 🌐 Deployment

Production mühitinə deploy etmək üçün `DEPLOYMENT.md` faylına baxın.

## 📝 Qeyd

- HTML faylları `pages/` qovluğunda
- Asset faylları `assets/` qovluğunda
- Unified server `api/` qovluğunda (API + HTML + Assets serve edir)

## 🔧 Tərtibat

Bütün path-lər relative path-lərdir (`/api`, `/assets/`), ona görə də server kökündən işləyir.

