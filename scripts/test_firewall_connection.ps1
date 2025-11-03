# PowerShell script - Firewall bağlantı testi
# Administrator olarak çalıştırılmalıdır

Write-Host "Firewall Bağlantı Testi" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""

# Test port
$port = 8000

# Kural var mı kontrol et
$rule = Get-NetFirewallRule -DisplayName "Test Server Port $port" -ErrorAction SilentlyContinue

if ($rule) {
    Write-Host "✅ Firewall kuralı bulundu: Test Server Port $port" -ForegroundColor Green
    Write-Host ""
    
    # Kural detayları
    Write-Host "Kural Detayları:" -ForegroundColor Yellow
    $rule | Format-List DisplayName, Enabled, Direction, Action
    
    # Port filtresi
    Write-Host "Port Filtresi:" -ForegroundColor Yellow
    Get-NetFirewallRule -DisplayName "Test Server Port $port" | Get-NetFirewallPortFilter | Format-List Protocol, LocalPort
    
    # Profil filtresi
    Write-Host "Aktif Profiller:" -ForegroundColor Yellow
    Get-NetFirewallRule -DisplayName "Test Server Port $port" | Get-NetFirewallProfileFilter | Format-List Profile
    
    # Network profili kontrol
    Write-Host "Network Profili:" -ForegroundColor Yellow
    $profile = Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" }
    if ($profile) {
        Write-Host "   Profil: $($profile.NetworkCategory)" -ForegroundColor $(if ($profile.NetworkCategory -eq "Private") { "Green" } else { "Yellow" })
        Write-Host "   Ağ Adı: $($profile.Name)" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "⚠️  Eğer telefon bağlanamıyorsa:" -ForegroundColor Yellow
    Write-Host "1. Router Client Isolation açık olabilir" -ForegroundColor White
    Write-Host "2. Antivirus programı engelliyor olabilir" -ForegroundColor White
    Write-Host "3. Windows Defender ek koruma aktif olabilir" -ForegroundColor White
    Write-Host ""
    
} else {
    Write-Host "❌ Firewall kuralı bulunamadı!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Kural eklemek için:" -ForegroundColor Yellow
    Write-Host "New-NetFirewallRule -DisplayName 'Test Server Port $port' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Domain,Private,Public" -ForegroundColor Cyan
}

