#!/bin/bash

# Heroku deployment setup script

echo "🚀 Heroku Deployment Setup"
echo "============================"

# Heroku CLI yoxlama
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI quraşdırılmamışdır."
    echo "📥 Heroku CLI quraşdırın: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

echo "✅ Heroku CLI tapıldı"

# Heroku login
echo "🔐 Heroku-a giriş edin..."
heroku login

# App yaratmaq
APP_NAME="oyun-yeni"
echo "📦 Heroku app yaradılır: $APP_NAME"
heroku create $APP_NAME

# Environment variables təyin etmək
echo "⚙️ Environment variables təyin edilir..."

heroku config:set DB_HOST=ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech --app $APP_NAME
heroku config:set DB_DATABASE=neondb --app $APP_NAME
heroku config:set DB_USER=neondb_owner --app $APP_NAME
heroku config:set DB_PASSWORD=npg_SxvR6sZIK9yi --app $APP_NAME
heroku config:set SMTP_SERVER=smtp.gmail.com --app $APP_NAME
heroku config:set SMTP_PORT=587 --app $APP_NAME
heroku config:set SMTP_EMAIL=neondefendergame@gmail.com --app $APP_NAME
heroku config:set SMTP_PASSWORD=ugcfkjvlsphlfxar --app $APP_NAME
heroku config:set BASE_URL=https://$APP_NAME.herokuapp.com --app $APP_NAME
heroku config:set RESET_PASSWORD_URL=https://$APP_NAME.herokuapp.com/reset-password.html --app $APP_NAME
heroku config:set FLASK_ENV=production --app $APP_NAME

echo "✅ Environment variables təyin edildi"

# Remote əlavə etmək
echo "🔗 Heroku remote əlavə edilir..."
heroku git:remote -a $APP_NAME

echo "✅ Setup tamamlandı!"
echo "🚀 Deployment üçün: git push heroku main"

