# 🚀 Render Deployment Konfiqurasiyası

Render-da yeni Web Service yaradarkən aşağıdakı dəyərləri qeyd edin:

## 📋 Form Sahələri:

### 1. **Language:**
- `Python 3` (seçilmişdir)

### 2. **Branch:**
- `main` (seçilmişdir)

### 3. **Region:**
- İstədiyiniz region seçin (Frankfurt, Oregon və s.)

### 4. **Root Directory:**
- **BOŞ BURAXIN** (qeyd etməyin)

### 5. **Build Command:**
```
pip install -r requirements.txt
```

### 6. **Start Command:**
```
python api/api_server.py
```

⚠️ **Vacib:** `gunicorn` deyil, `python api/api_server.py` yazın!

## 🔧 Environment Variables:

Aşağıdaki environment variables əlavə edin (Settings → Environment Variables):

```
DB_HOST=ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech
DB_DATABASE=neondb
DB_USER=neondb_owner
DB_PASSWORD=npg_SxvR6sZIK9yi
DB_PORT=5432

SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=neondefendergame@gmail.com
SMTP_PASSWORD=ugcfkjvlsphlfxar

FLASK_ENV=production
PORT=5000
```

⚠️ **Qeyd:** `BASE_URL` və `RESET_PASSWORD_URL`-i **İNDİ BOŞ BURAXA BİLƏRSİNİZ**. Deployment tamamlandıqdan sonra Render verəcəyi URL-i biləndə əlavə edəcəksiniz (məsələn: `https://oyun-yeni.onrender.com`)

### İndi Əlavə Edin (Əsas):
1. DB_HOST
2. DB_DATABASE  
3. DB_USER
4. DB_PASSWORD
5. SMTP_EMAIL
6. SMTP_PASSWORD
7. FLASK_ENV=production
8. PORT=5000

### Sonra Əlavə Edin (Deployment tamamlandıqdan sonra):
9. BASE_URL=https://oyun-yeni-xxxx.onrender.com *(Render verəcəyi URL)*
10. RESET_PASSWORD_URL=https://oyun-yeni-xxxx.onrender.com/reset-password.html *(Render verəcəyi URL)*

## ✅ Yoxlama:

1. Formu doldurduqdan sonra **Create Web Service** düyməsinə klikləyin
2. Render avtomatik deploy edəcək
3. Deployment tamamlandıqdan sonra URL alacaqsınız (məsələn: `https://oyun-yeni.onrender.com`)
4. Bu URL-i `BASE_URL` və `RESET_PASSWORD_URL` environment variables-ə əlavə edin:
   - `BASE_URL=https://oyun-yeni.onrender.com`
   - `RESET_PASSWORD_URL=https://oyun-yeni.onrender.com/reset-password.html`
5. Service-i yenidən deploy edin (Settings → Manual Deploy)

## 🔗 GitHub İnteqrasiyası:

Render-da GitHub repository-ni birləşdirdikdən sonra:
- Hər push-da avtomatik deploy ediləcək
- `main` branch-dən deploy olacaq

