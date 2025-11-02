# PowerShell script for starting API server with email configuration

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  API Server Baslatilir" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Email Configuration
# NOTE: For security, sensitive credentials should be set via environment variables
# or entered interactively. Default values are provided for convenience.

$env:SMTP_SERVER = if ($env:SMTP_SERVER) { $env:SMTP_SERVER } else { "smtp.gmail.com" }
$env:SMTP_PORT = if ($env:SMTP_PORT) { $env:SMTP_PORT } else { "587" }
$env:SMTP_EMAIL = if ($env:SMTP_EMAIL) { $env:SMTP_EMAIL } else { "neondefendergame@gmail.com" }

# Password should be provided via environment variable or use default
# WARNING: Default password is for local development only
# For production, use environment variables

# First load from User-level environment variable (permanent password)
if (-not $env:SMTP_PASSWORD -or $env:SMTP_PASSWORD.Trim() -eq "") {
    $userPassword = [System.Environment]::GetEnvironmentVariable("SMTP_PASSWORD", [System.EnvironmentVariableTarget]::User)
    if ($userPassword -and $userPassword.Trim() -ne "") {
        $env:SMTP_PASSWORD = $userPassword.Trim()
    }
}

# If still no password, use default (for local development)
if (-not $env:SMTP_PASSWORD -or $env:SMTP_PASSWORD.Trim() -eq "") {
    $env:SMTP_PASSWORD = "ugcfkjvlsphlfxar"
    Write-Host ""
    Write-Host "Using default SMTP password for local development" -ForegroundColor Cyan
    Write-Host ""
}

# Password is already set (from environment variable or default)
# Show status
if ($env:SMTP_PASSWORD -and $env:SMTP_PASSWORD.Trim() -ne "") {
    $userPassword = [System.Environment]::GetEnvironmentVariable("SMTP_PASSWORD", [System.EnvironmentVariableTarget]::User)
    if ($userPassword -and $userPassword.Trim() -ne "") {
        Write-Host ""
        Write-Host "SMTP sifresi qalici environment variable-dan yuklendi" -ForegroundColor Green
        Write-Host ""
    } elseif ($env:SMTP_PASSWORD -eq "ugcfkjvlsphlfxar") {
        Write-Host ""
        Write-Host "SMTP sifresi varsayilan degerden yuklendi (local development)" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "SMTP sifresi bu sessiya ucun mevcut" -ForegroundColor Green
        Write-Host ""
    }
}

$env:RESET_PASSWORD_URL = if ($env:RESET_PASSWORD_URL) { $env:RESET_PASSWORD_URL } else { "http://127.0.0.1:5000/reset-password.html" }

Write-Host "Email Konfigurasiyasi:" -ForegroundColor Green
Write-Host "SMTP Server: $env:SMTP_SERVER" -ForegroundColor Yellow
Write-Host "SMTP Port: $env:SMTP_PORT" -ForegroundColor Yellow
Write-Host "Email: $env:SMTP_EMAIL" -ForegroundColor Yellow
Write-Host ""

Write-Host "Server baslatilir..." -ForegroundColor Green
Write-Host "API Endpoint: http://127.0.0.1:5000" -ForegroundColor Cyan
Write-Host ""

# Get script directory and navigate to project root, then to api folder
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$apiDir = Join-Path $projectRoot "api"

# Python kontrolu
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $pythonCmd) {
    Write-Host "XETA: Python tapilmadi! Python yuklenib olmalidir." -ForegroundColor Red
    Write-Host "Python yuklemek ucun: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Python tapildi: $($pythonCmd.Path)" -ForegroundColor Green
Write-Host "API dizini: $apiDir" -ForegroundColor Cyan
Write-Host ""

# API dizininin movcud oldugunu yoxla
if (-not (Test-Path $apiDir)) {
    Write-Host "XETA: API dizini tapilmadi: $apiDir" -ForegroundColor Red
    exit 1
}

# api_server.py faylinin movcud oldugunu yoxla
$apiServerPath = Join-Path $apiDir "api_server.py"
if (-not (Test-Path $apiServerPath)) {
    Write-Host "XETA: api_server.py tapilmadi: $apiServerPath" -ForegroundColor Red
    exit 1
}

Set-Location $apiDir

Write-Host "Server basladilir..." -ForegroundColor Green
Write-Host ""

# Python komutunu qullan (yuxarida tapilan)
$pythonExe = $pythonCmd.Path

Write-Host "Python komutu: $pythonExe" -ForegroundColor Cyan
Write-Host "Calisdirilir: $apiServerPath" -ForegroundColor Cyan
Write-Host ""

# Sifre varmi yoxla ve goster (ilk bir nece simvol)
if ($env:SMTP_PASSWORD) {
    $pwdPreview = if ($env:SMTP_PASSWORD.Length -gt 4) { 
        $env:SMTP_PASSWORD.Substring(0, 2) + "..." + $env:SMTP_PASSWORD.Substring($env:SMTP_PASSWORD.Length - 2, 2)
    } else {
        "****"
    }
    Write-Host "SMTP Sifresi: $pwdPreview (movcuddur)" -ForegroundColor Green
} else {
    Write-Host "SMTP Sifresi: yoxdur (email ozellikleri islemeyecek)" -ForegroundColor Yellow
}
Write-Host ""

# Python script-i baslat
try {
    # Direkt olaraq Python ile calisdir
    & $pythonExe $apiServerPath
    $exitCode = $LASTEXITCODE
    if ($null -ne $exitCode -and $exitCode -ne 0) {
        Write-Host "XETA: Server xeta ile baglandi. Exit code: $exitCode" -ForegroundColor Red
        exit $exitCode
    }
} catch {
    Write-Host "XETA: Server baslatila bilmedi: $_" -ForegroundColor Red
    Write-Host "Hata melumatlari: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Dependencies yuklu olmalidir. Emr: pip install -r requirements.txt" -ForegroundColor Yellow
    Write-Host "Or run directly: cd api; python api_server.py" -ForegroundColor Yellow
    exit 1
}

