# -*- coding: utf-8 -*-
"""
Neon Database-də cədvəlləri yaradır
"""
import sys
import io
import psycopg2

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Database connection string
DB_CONFIG = {
    'host': 'ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech',
    'database': 'neondb',
    'user': 'neondb_owner',
    'password': 'npg_SxvR6sZIK9yi',
    'port': 5432,
    'sslmode': 'require'
}

def create_tables():
    """Create all necessary tables"""
    try:
        print("[INFO] Database-ə qoşulur...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print("[INFO] Cədvəllər yaradılır...")
        
        # Users table
        print("[1/4] Users cədvəli yaradılır...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone_number VARCHAR(20) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        """)
        print("[OK] Users cədvəli yaradıldı")
        
        # Game stats table
        print("[2/4] Game stats cədvəli yaradılır...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS game_stats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                total_games INTEGER DEFAULT 0,
                total_score BIGINT DEFAULT 0,
                best_wave INTEGER DEFAULT 0,
                best_score BIGINT DEFAULT 0,
                total_enemies_killed INTEGER DEFAULT 0,
                total_time_played INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("[OK] Game stats cədvəli yaradıldı")
        
        # Game sessions table
        print("[3/4] Game sessions cədvəli yaradılır...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                score BIGINT DEFAULT 0,
                wave_reached INTEGER DEFAULT 0,
                enemies_killed INTEGER DEFAULT 0,
                game_duration INTEGER DEFAULT 0,
                ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                game_data JSONB
            )
        """)
        print("[OK] Game sessions cədvəli yaradıldı")
        
        # Password reset tokens table
        print("[4/4] Password reset tokens cədvəli yaradılır...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("[OK] Password reset tokens cədvəli yaradıldı")
        
        conn.commit()
        
        # Check existing tables
        print("\n[INFO] Mövcud cədvəllər:")
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        tables = cursor.fetchall()
        for table in tables:
            print(f"  - {table[0]}")
        
        cursor.close()
        conn.close()
        
        print("\n[SUCCESS] Bütün cədvəllər uğurla yaradıldı!")
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Xəta baş verdi: {e}")
        return False

if __name__ == '__main__':
    print("=" * 50)
    print("Neon Database - Cədvəllərin Yaradılması")
    print("=" * 50)
    print()
    
    success = create_tables()
    
    print()
    print("=" * 50)
    if success:
        print("✅ Tamamlandı!")
    else:
        print("❌ Xəta baş verdi!")
    print("=" * 50)
    

