# 🖥️ Server-lər - Fərqlər və İstifadə

## İki Server Nədir?

### 1. 📡 API Server (`api/api_server.py`)

**Nədir?**
- Flask framework ilə yazılmış backend API server
- PostgreSQL database ilə işləyir
- JSON API endpoint-ləri təmin edir

**Nə işə yarayır?**
- ✅ Qeydiyyat (`/api/register`)
- ✅ Giriş (`/api/login`)
- ✅ Şifrə sıfırlama (`/api/forgot-password`, `/api/reset-password`)
- ✅ Oyun statistikalarını saxlayır (`/api/save-game`)
- ✅ İstifadəçi statistikalarını qaytarır (`/api/get-stats`)
- ✅ Email göndərir (şifrə sıfırlama üçün)

**Port:** `5000`
**URL:** `http://127.0.0.1:5000/api`

**İşə salmaq:**
```powershell
cd api
$env:SMTP_EMAIL="neondefendergame@gmail.com"
$env:SMTP_PASSWORD="mayxzchjizddhgdb"
python api_server.py
```

---

### 2. 🌐 HTTP Server (❌ Artıq lazım deyil)

**Qeyd:** HTTP Server artıq birləşdirilib və API Server-də birləşdirilmişdir. Ayrıca HTTP Server lazım deyil.

---

## 🔄 Birləşdirilmiş Server Necə İşləyir?

### Workflow:

1. **Brauzer** → Unified Server (5000) → HTML/CSS/JS fayllarını alır
2. **HTML/JS** → Unified Server (5000) → Database ilə işləyir, məlumat alır/göndərir

### Nümunə:

1. İstifadəçi brauzerdə `http://127.0.0.1:5000/login.html` açır
   - Unified Server HTML faylını göndərir

2. İstifadəçi giriş formunu doldurub "Giriş et" düyməsini basır
   - JavaScript Unified Server-ə sorğu göndərir: `POST /api/login` (relative path)
   - Unified Server database-də yoxlayır və cavab qaytarır
   - JavaScript cavabı qəbul edir və istifadəçini yönləndirir

---

## 📊 Unified Server Xüsusiyyətləri

| Xüsusiyyət | Unified Server |
|------------|----------------|
| **Port** | 5000 |
| **Məqsəd** | Backend API + Frontend Fayllar |
| **Database** | ✅ PostgreSQL |
| **Email** | ✅ SMTP |
| **HTML Serve** | ✅ |
| **CSS/JS Serve** | ✅ |
| **Framework** | Flask |

---

## ⚠️ Vacib Qeyd

**Artıq yalnız bir server lazımdır:**
- Unified Server → HTML/CSS/JS fayllarını serve edir
- Unified Server → Database ilə işləyir, API endpoint-ləri təmin edir

İstifadəçi brauzerdə səhifəni açarkən Unified Server-dan HTML alır, giriş/qeydiyyat zamanı da eyni Unified Server-dan məlumat alır/göndərir. Hər şey bir serverdə!.

---

## 🚀 Tez Başlanğıc

### Unified Server:
```powershell
cd api
$env:SMTP_EMAIL="neondefendergame@gmail.com"
$env:SMTP_PASSWORD="mayxzchjizddhgdb"
$env:RESET_PASSWORD_URL="http://127.0.0.1:5000/reset-password.html"
python api_server.py
```

### Brauzerdə:
- http://127.0.0.1:5000/
- http://127.0.0.1:5000/login.html
- http://127.0.0.1:5000/register.html

