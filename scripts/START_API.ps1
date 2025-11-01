# PowerShell script for starting API server with email configuration

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  API Server Başladılır" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Email Configuration
$env:SMTP_SERVER = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_EMAIL = "neondefendergame@gmail.com"
$env:SMTP_PASSWORD = "ugcfkjvlsphlfxar"
$env:RESET_PASSWORD_URL = "http://127.0.0.1:5000/reset-password.html"

Write-Host "Email Konfiqurasiyası:" -ForegroundColor Green
Write-Host "SMTP Server: $env:SMTP_SERVER" -ForegroundColor Yellow
Write-Host "SMTP Port: $env:SMTP_PORT" -ForegroundColor Yellow
Write-Host "Email: $env:SMTP_EMAIL" -ForegroundColor Yellow
Write-Host ""

Write-Host "Server başladılır..." -ForegroundColor Green
Write-Host "API Endpoint: http://127.0.0.1:5000" -ForegroundColor Cyan
Write-Host ""

# Get script directory and navigate to project root, then to api folder
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$apiDir = Join-Path $projectRoot "api"

Set-Location $apiDir
python api_server.py

