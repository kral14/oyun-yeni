# Heroku deployment setup script (PowerShell)

Write-Host "🚀 Heroku Deployment Setup" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# Heroku CLI yoxlama
try {
    $herokuVersion = heroku --version
    Write-Host "✅ Heroku CLI tapıldı" -ForegroundColor Green
} catch {
    Write-Host "❌ Heroku CLI quraşdırılmamışdır." -ForegroundColor Red
    Write-Host "📥 Heroku CLI quraşdırın: https://devcenter.heroku.com/articles/heroku-cli" -ForegroundColor Yellow
    exit 1
}

# Heroku login
Write-Host "🔐 Heroku-a giriş edin..." -ForegroundColor Yellow
heroku login

# App yaratmaq
$APP_NAME = "oyun-yeni"
Write-Host "📦 Heroku app yaradılır: $APP_NAME" -ForegroundColor Yellow
heroku create $APP_NAME

# Environment variables təyin etmək
Write-Host "⚙️ Environment variables təyin edilir..." -ForegroundColor Yellow

heroku config:set DB_HOST=ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech --app $APP_NAME
heroku config:set DB_DATABASE=neondb --app $APP_NAME
heroku config:set DB_USER=neondb_owner --app $APP_NAME
heroku config:set DB_PASSWORD=npg_SxvR6sZIK9yi --app $APP_NAME
heroku config:set SMTP_SERVER=smtp.gmail.com --app $APP_NAME
heroku config:set SMTP_PORT=587 --app $APP_NAME
heroku config:set SMTP_EMAIL=neondefendergame@gmail.com --app $APP_NAME
heroku config:set SMTP_PASSWORD=ugcfkjvlsphlfxar --app $APP_NAME
heroku config:set BASE_URL="https://$APP_NAME.herokuapp.com" --app $APP_NAME
heroku config:set RESET_PASSWORD_URL="https://$APP_NAME.herokuapp.com/reset-password.html" --app $APP_NAME
heroku config:set FLASK_ENV=production --app $APP_NAME

Write-Host "✅ Environment variables təyin edildi" -ForegroundColor Green

# Remote əlavə etmək
Write-Host "🔗 Heroku remote əlavə edilir..." -ForegroundColor Yellow
heroku git:remote -a $APP_NAME

Write-Host "✅ Setup tamamlandı!" -ForegroundColor Green
Write-Host "🚀 Deployment üçün: git push heroku main" -ForegroundColor Cyan

