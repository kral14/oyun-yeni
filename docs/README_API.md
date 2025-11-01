# API Server Qurulumu

## Quraşdırma

1. Lazımi paketləri quraşdırın:
```bash
pip install -r requirements.txt
```

2. API serverini başlatın:
```bash
python api_server.py
```

Server `http://127.0.0.1:5000` ünvanında işləyəcək.

## API Endpoint-ləri

### POST /api/register
Yeni istifadəçi yaradır.

**Request:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Qeydiyyat uğurla tamamlandı",
  "user_id": 1
}
```

### POST /api/login
İstifadəçi girişi.

**Request:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "testuser"
  },
  "stats": {
    "total_games": 0,
    "total_score": 0,
    "best_wave": 0,
    "best_score": 0,
    "total_enemies_killed": 0,
    "total_time_played": 0
  }
}
```

### POST /api/save-game
Oyun statistikalarını saxlayır.

**Request:**
```json
{
  "user_id": 1,
  "score": 1500,
  "wave_reached": 5,
  "enemies_killed": 25,
  "game_duration": 600,
  "game_data": {
    "level": 1,
    "final_health": 50
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Oyun məlumatları saxlanıldı",
  "session_id": 1
}
```

### GET /api/get-stats?user_id=1
İstifadəçi statistikalarını qaytarır.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_games": 10,
    "total_score": 15000,
    "best_wave": 5,
    "best_score": 2000,
    "total_enemies_killed": 250,
    "total_time_played": 3600
  }
}
```

### GET /api/health
Serverin sağlamlığını yoxlayır.

**Response:**
```json
{
  "success": true,
  "status": "healthy"
}
```

## Database Strukturu

### users
- id (SERIAL PRIMARY KEY)
- username (VARCHAR(50) UNIQUE)
- password_hash (VARCHAR(255))
- created_at (TIMESTAMP)
- last_login (TIMESTAMP)
- is_active (BOOLEAN)

### game_stats
- id (SERIAL PRIMARY KEY)
- user_id (INTEGER REFERENCES users(id))
- total_games (INTEGER)
- total_score (BIGINT)
- best_wave (INTEGER)
- best_score (BIGINT)
- total_enemies_killed (INTEGER)
- total_time_played (INTEGER)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### game_sessions
- id (SERIAL PRIMARY KEY)
- user_id (INTEGER REFERENCES users(id))
- score (BIGINT)
- wave_reached (INTEGER)
- enemies_killed (INTEGER)
- game_duration (INTEGER)
- ended_at (TIMESTAMP)
- game_data (JSONB)

