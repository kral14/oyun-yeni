# PowerShell script for setting up environment variables permanently
# Bu script şifrəni qalıcı olaraq sistem environment variable-ına əlavə edir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Environment Variable Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# SMTP şifrəsi soruş
Write-Host "Gmail App Password-unuzu daxil edin:" -ForegroundColor Yellow
$securePassword = Read-Host "Gmail App Password (16 simvol)" -AsSecureString

if ($securePassword -and $securePassword.Length -gt 0) {
    # SecureString-i string-ə çevir
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    
    # User-level environment variable olaraq qalıcı şəkildə saxla
    [System.Environment]::SetEnvironmentVariable("SMTP_PASSWORD", $password, [System.EnvironmentVariableTarget]::User)
    
    # Bu sessiya üçün də təyin et
    $env:SMTP_PASSWORD = $password
    
    Write-Host ""
    Write-Host "✅ SMTP şifrəsi qalıcı olaraq saxlandı!" -ForegroundColor Green
    Write-Host "Qeyd: Yeni PowerShell sessiyası açdıqda şifrə avtomatik yüklənəcək." -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Şifrə verilmədi. Script dayandırıldı." -ForegroundColor Red
    Write-Host ""
}

