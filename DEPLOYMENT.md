# 🚀 Deployment Guide

Bu oyunu production mühitinə deploy etmək üçün təlimatlar.

## 🤖 GitHub Actions ilə Avtomatik Deploy

GitHub Actions istifadə edərək avtomatik deploy üçün:

1. GitHub repository-də **Settings → Secrets → Actions** bölməsinə keçin
2. Aşağıdakı secrets əlavə edin:
   - `HEROKU_API_KEY` - Heroku API key
   - `HEROKU_APP_NAME` - Heroku app adı
   - `HEROKU_EMAIL` - Heroku email
3. Heroku-da environment variables təyin edin:
   - `DB_HOST`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`
   - `SMTP_EMAIL`, `SMTP_PASSWORD`
   - `BASE_URL`, `RESET_PASSWORD_URL`
   - `FLASK_ENV=production`

Hər `main` branch-ə push zamanı avtomatik deploy ediləcək.

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

### Render

1. Render.com-da yeni Web Service yaradın

2. Repository-ni birləşdirin

3. Build Command:
```bash
pip install -r requirements.txt
```

4. Start Command:
```bash
python api/api_server.py
```

5. Environment variables əlavə edin (dashboard-da)

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

