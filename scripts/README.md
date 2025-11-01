# 🔧 Skriptlər

Bu qovluqda server işə salmaq və yardımçı skriptlər yerləşir.

## 📝 Fayllar

### API Server Skriptləri

- **START_API.ps1** - PowerShell skripti (tövsiyə olunur)
- **start_api_manual.bat** - Windows batch skripti
- **start_api.bat** - Windows batch skripti (interaktiv)

### Yardımçı Skriptlər

- **create_tables.py** - Database cədvəllərini yaradır (bir dəfə istifadə edilir)
- **gift_code_generator.py** - Gift code generator (admin funksiyası)
- **deploy.py** - Git deploy skripti (GitHub-a avtomatik push)

## 🚀 İstifadə

### Unified Server işə salmaq

**PowerShell:**
```powershell
.\START_API.ps1
```

**CMD:**
```cmd
start_api_manual.bat
```

**Və ya interaktiv:**
```cmd
start_api.bat
```

**Qeyd:** Skriptlər avtomatik olaraq `../api` qovluğuna keçir və serveri işə salır.

### Database cədvəllərini yaratmaq

```powershell
python create_tables.py
```

**Qeyd:** Bu skript yalnız bir dəfə işə salınmalıdır - database cədvəllərini yaratmaq üçün.

### Gift Code Generator

```powershell
python gift_code_generator.py
```

GUI açılacaq və hədiyyə kodları yarada bilərsiniz.

### Deploy (Git Push)

```powershell
python deploy.py
```

Avtomatik olaraq dəyişiklikləri commit edir və GitHub-a push edir.

## ⚙️ Konfiqurasiya

Email parametrləri `start_api_manual.bat` və ya `START_API.ps1` fayllarında konfiqurasiya edilir.

Deploy skriptində repository URL-i dəyişdirmək lazımdırsa, `deploy.py` faylında `origin_url_default` dəyişənini redaktə edin.

