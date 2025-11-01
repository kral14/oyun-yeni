# 🚀 Deployment Guide

Bu oyunu production mühitinə deploy etmək üçün təlimatlar.

## 🤖 GitHub Actions ilə Avtomatik Deploy

GitHub Actions istifadə edərək avtomatik deploy üçün:

### Adım 1: GitHub Secrets Əlavə Edin

1. GitHub repository-də **Settings → Secrets and variables → Actions** bölməsinə keçin
2. Aşağıdakı secrets əlavə edin:
   - `HEROKU_API_KEY` - Heroku API key (https://dashboard.heroku.com/account → API Key)
   - `HEROKU_APP_NAME` - Heroku app adı (məsələn: `oyun-yeni`)
   - `HEROKU_EMAIL` - Heroku hesab email ünvanı

### Adım 2: Heroku App Yaradın

**Yol 1: Script istifadə edin:**
```powershell
cd scripts
.\setup_deployment.ps1
```

**Yol 2: Manual:**
```bash
heroku create oyun-yeni
heroku config:set DB_HOST=ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech --app oyun-yeni
heroku config:set DB_DATABASE=neondb --app oyun-yeni
heroku config:set DB_USER=neondb_owner --app oyun-yeni
heroku config:set DB_PASSWORD=npg_SxvR6sZIK9yi --app oyun-yeni
heroku config:set SMTP_EMAIL=neondefendergame@gmail.com --app oyun-yeni
heroku config:set SMTP_PASSWORD=ugcfkjvlsphlfxar --app oyun-yeni
heroku config:set BASE_URL=https://oyun-yeni.herokuapp.com --app oyun-yeni
heroku config:set RESET_PASSWORD_URL=https://oyun-yeni.herokuapp.com/reset-password.html --app oyun-yeni
heroku config:set FLASK_ENV=production --app oyun-yeni
```

**Yol 3: Heroku Dashboard:**
1. https://dashboard.heroku.com/apps → **New** → **Create new app**
2. App name: `oyun-yeni`
3. **Settings** → **Config Vars** → Environment variables əlavə edin

### Adım 3: Avtomatik Deploy

Hər `main` branch-ə push zamanı avtomatik deploy ediləcək!

## 📋 Tələblər

- Python 3.11+
- PostgreSQL database (Neon, Supabase, və ya digər)
- Git repository
- Deployment platform (Heroku, Render, Railway, və ya digər)

## 🔧 Environment Variables

Deployment zamanı aşağıdakı environment variables təyin edilməlidir:

### Database (PostgreSQL)
```
DB_HOST=your-database-host
DB_DATABASE=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_PORT=5432
```

### Email Configuration (Gmail SMTP)
```
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### Application URLs
```
BASE_URL=https://your-app-name.herokuapp.com
RESET_PASSWORD_URL=https://your-app-name.herokuapp.com/reset-password.html
PORT=5000  # Çox hallarda platforma avtomatik təyin edir
```

### Production Mode
```
FLASK_ENV=production
# və ya
ENV=production
```

## 📦 Deployment Platforms

### Heroku

1. Heroku CLI quraşdırın: https://devcenter.heroku.com/articles/heroku-cli

2. Heroku-da yeni app yaradın:
```bash
heroku create your-app-name
```

3. Environment variables təyin edin:
```bash
heroku config:set DB_HOST=your-database-host
heroku config:set DB_DATABASE=your-database-name
heroku config:set DB_USER=your-database-user
heroku config:set DB_PASSWORD=your-database-password
heroku config:set SMTP_EMAIL=your-email@gmail.com
heroku config:set SMTP_PASSWORD=your-app-password
heroku config:set BASE_URL=https://your-app-name.herokuapp.com
heroku config:set RESET_PASSWORD_URL=https://your-app-name.herokuapp.com/reset-password.html
heroku config:set FLASK_ENV=production
```

4. Git push edin:
```bash
git push heroku main
```

### Render (Ən Asan Yol - GitHub ilə Birbaşa İnteqrasiya)

1. https://render.com -ə keçin və hesab yaradın (GitHub ilə login)

2. **New +** → **Web Service** seçin

3. GitHub repository-ni birləşdirin:
   - **Connect GitHub** düyməsinə klikləyin
   - `kral14/oyun-yeni` repository-sini seçin

4. Konfiqurasiya:
   - **Name:** `oyun-yeni`
   - **Region:** `Oregon (US West)` (və ya istədiyiniz)
   - **Branch:** `main`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python api/api_server.py`

5. **Advanced** → **Environment Variables** əlavə edin:
   ```
   DB_HOST=ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech
   DB_DATABASE=neondb
   DB_USER=neondb_owner
   DB_PASSWORD=npg_SxvR6sZIK9yi
   SMTP_SERVER=smtp.gmail.com
   SMTP_PORT=587
   SMTP_EMAIL=neondefendergame@gmail.com
   SMTP_PASSWORD=ugcfkjvlsphlfxar
   BASE_URL=https://oyun-yeni.onrender.com
   RESET_PASSWORD_URL=https://oyun-yeni.onrender.com/reset-password.html
   FLASK_ENV=production
   PORT=5000
   ```

6. **Create Web Service** düyməsinə klikləyin

7. Render avtomatik deploy edəcək və hər push-da yenilənəcək!

### Railway

1. Railway.app-da yeni project yaradın

2. Git repository-ni birləşdirin

3. Environment variables əlavə edin

4. Railway avtomatik deploy edəcək

## 🗄️ Database Setup

1. PostgreSQL database yaradın (Neon, Supabase, və ya digər)

2. `scripts/create_tables.py` skriptini işlədin:
```bash
cd scripts
python create_tables.py
```

Və ya production mühitində tables avtomatik yaranacaq (Flask başladıqda).

## ✅ Deployment Sonrası

1. **Database yoxlaması**: `create_tables.py` skriptini işlədin və ya serveri başladın

2. **Test etmə**: 
   - Ana səhifə açılmalıdır: `https://your-app-url/`
   - API işləməlidir: `https://your-app-url/api/health`
   - Qeydiyyat və login işləməlidir

3. **Email konfiqurasiyası**: 
   - Gmail App Password düzgün təyin edilməlidir
   - Şifrə sıfırlama funksiyası test edilməlidir

## 🔍 Troubleshooting

### Database Connection Error
- Environment variables düzgün təyin olunubmu yoxlayın
- Database SSL mode tələb edir (`sslmode=require`)

### Static Files Not Loading
- `BASE_URL` düzgün təyin olunubmu yoxlayın
- Flask static folder konfiqurasiyası yoxlayın

### Email Not Sending
- SMTP credentials düzgün olub olmadığını yoxlayın
- Gmail App Password istifadə edin (normal şifrə deyil)
- 2-Step Verification aktiv olmalıdır

