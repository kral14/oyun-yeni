# GitHub Secrets Setup Təlimatları

## 1. GitHub Secrets Əlavə Etmək:

1. https://github.com/kral14/oyun-yeni repository-sinə keçin
2. **Settings** → **Secrets and variables** → **Actions** bölməsinə keçin
3. **New repository secret** düyməsinə klikləyin
4. Aşağıdakı secrets əlavə edin:

### HEROKU_API_KEY:
- Heroku-da: https://dashboard.heroku.com/account
- **API Key** bölməsindən API key-i kopyalayın
- Secret name: `HEROKU_API_KEY`
- Value: API key dəyəri

### HEROKU_APP_NAME:
- Secret name: `HEROKU_APP_NAME`
- Value: `oyun-yeni` (və ya istədiyiniz ad)

### HEROKU_EMAIL:
- Secret name: `HEROKU_EMAIL`
- Value: Heroku hesab email ünvanı

## 2. Heroku-da App Yaradın:

Heroku CLI quraşdırın və ya Heroku Dashboard-da:

1. https://dashboard.heroku.com/apps -ə keçin
2. **New** → **Create new app** düyməsinə klikləyin
3. App name: `oyun-yeni` (və ya istədiyiniz ad)
4. Region: United States (və ya istədiyiniz region)
5. **Create app** düyməsinə klikləyin

## 3. Heroku Environment Variables Təyin Edin:

Heroku app dashboard-da **Settings** → **Config Vars** bölməsində:

```
DB_HOST=ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech
DB_DATABASE=neondb
DB_USER=neondb_owner
DB_PASSWORD=npg_SxvR6sZIK9yi
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=neondefendergame@gmail.com
SMTP_PASSWORD=ugcfkjvlsphlfxar
BASE_URL=https://oyun-yeni.herokuapp.com
RESET_PASSWORD_URL=https://oyun-yeni.herokuapp.com/reset-password.html
FLASK_ENV=production
```

## 4. Avtomatik Deploy:

İndi hər `main` branch-ə push zamanı avtomatik deploy ediləcək!

