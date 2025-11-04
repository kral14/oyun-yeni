from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
import psycopg2
from psycopg2 import pool
import hashlib
import secrets
import os
from datetime import datetime, timedelta, UTC
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import webbrowser
import time
import string
import random

app = Flask(__name__, 
            static_folder='../assets',
            static_url_path='/assets',
            template_folder='../pages')
CORS(app)  # Allow cross-origin requests
# Use threading mode for Windows compatibility
# Set ping_timeout and ping_interval to avoid connection issues
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='threading', 
    logger=False, 
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e8
)

# Game rooms storage (in production, use Redis or database)
rooms = {}  # {room_code: {name: str, password_hash: str, players: {orange: player_id, blue: player_id}, game_state: {...}, started: bool, created_at: datetime, creator: player_id}}

# Player sessions
players = {}  # {player_id: {username, room_code, color}}

def load_room_from_db(room_code):
    """Load room from database if not in memory"""
    if room_code in rooms:
        return rooms[room_code]
    
    if not db_pool:
        return None
    
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT room_code, room_name, password_hash, creator_socket_id, 
                   orange_socket_id, blue_socket_id, game_state, started, 
                   created_at
            FROM three_stones_rooms
            WHERE room_code = %s
        """, (room_code,))
        result = cursor.fetchone()
        cursor.close()
        db_pool.putconn(conn)
        
        if result:
            room_code_db, room_name, password_hash, creator_socket_id, \
            orange_socket_id, blue_socket_id, game_state_db, started, created_at = result
            
            # Parse game_state if it's a string
            game_state = None
            if game_state_db:
                try:
                    game_state = json.loads(game_state_db) if isinstance(game_state_db, str) else game_state_db
                except:
                    game_state = None
            
            # Create room structure
            room = {
                'name': room_name,
                'password_hash': password_hash,
                'players': {},
                'game_state': game_state,
                'started': started or False,
                'created_at': created_at or datetime.now(UTC),
                'creator': creator_socket_id
            }
            
            # Add players if socket IDs exist (but they might be disconnected)
            if orange_socket_id:
                room['players']['orange'] = orange_socket_id
            if blue_socket_id:
                room['players']['blue'] = blue_socket_id
            
            # Add to memory
            rooms[room_code] = room
            print(f"[DB] Room loaded from database: {room_code}")
            return room
        
        return None
    except Exception as e:
        print(f"[ERROR] Error loading room from database: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            db_pool.putconn(conn)
        return None

def load_active_rooms_from_db():
    """Load all active rooms from database on server start"""
    if not db_pool:
        return
    
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Load rooms that are not game_over and created within last 24 hours
        cursor.execute("""
            SELECT room_code, room_name, password_hash, creator_socket_id, 
                   orange_socket_id, blue_socket_id, game_state, started, 
                   created_at
            FROM three_stones_rooms
            WHERE game_over = FALSE 
            AND created_at > NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
        """)
        
        results = cursor.fetchall()
        cursor.close()
        db_pool.putconn(conn)
        
        for result in results:
            room_code_db, room_name, password_hash, creator_socket_id, \
            orange_socket_id, blue_socket_id, game_state_db, started, created_at = result
            
            # Parse game_state if it's a string
            game_state = None
            if game_state_db:
                try:
                    game_state = json.loads(game_state_db) if isinstance(game_state_db, str) else game_state_db
                except:
                    game_state = None
            
            # Create room structure
            room = {
                'name': room_name,
                'password_hash': password_hash,
                'players': {},  # Players will be empty initially (socket IDs might be stale)
                'game_state': game_state,
                'started': started or False,
                'created_at': created_at or datetime.now(UTC),
                'creator': creator_socket_id
            }
            
            # Add to memory (but don't add players as their socket connections are stale)
            rooms[room_code_db] = room
        
        print(f"[DB] Loaded {len(results)} active rooms from database")
    except Exception as e:
        print(f"[ERROR] Error loading active rooms from database: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            db_pool.putconn(conn)

# Room cleanup timer (check every minute for empty rooms older than 5 minutes)
def cleanup_empty_rooms():
    """Remove empty rooms older than 5 minutes"""
    current_time = datetime.now(UTC)
    rooms_to_remove = []
    
    for room_code, room in rooms.items():
        if not room.get('players') or len(room.get('players', {})) == 0:
            created_at = room.get('created_at')
            if created_at:
                time_diff = current_time - created_at
                if time_diff.total_seconds() > 300:  # 5 minutes
                    rooms_to_remove.append(room_code)
    
    for room_code in rooms_to_remove:
        del rooms[room_code]
        print(f"[CLEANUP] Removed empty room: {room_code}")
    
    # Broadcast lobby update if rooms were removed
    if rooms_to_remove:
        socketio.emit('lobby_list', {'rooms': get_lobby_list()})

# PostgreSQL connection pool
db_pool = None

# Email configuration (istifadəçi tərəfindən veriləcək)
SMTP_SERVER = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_EMAIL = os.environ.get('SMTP_EMAIL', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
RESET_PASSWORD_URL = os.environ.get('RESET_PASSWORD_URL', '')

def init_db_pool():
    """Initialize PostgreSQL connection pool"""
    global db_pool
    try:
        # Database connection from environment variables or use defaults
        db_host = os.environ.get('DB_HOST', 'ep-sparkling-grass-a4c444kf-pooler.us-east-1.aws.neon.tech')
        db_database = os.environ.get('DB_DATABASE', 'neondb')
        db_user = os.environ.get('DB_USER', 'neondb_owner')
        db_password = os.environ.get('DB_PASSWORD', 'npg_SxvR6sZIK9yi')
        db_port = int(os.environ.get('DB_PORT', '5432'))
        
        db_pool = psycopg2.pool.SimpleConnectionPool(
            1, 10,
            host=db_host,
            database=db_database,
            user=db_user,
            password=db_password,
            port=db_port,
            sslmode='require'
        )
        print("[OK] Database connection pool created successfully")
        create_tables()
    except Exception as e:
        print(f"[ERROR] Error creating connection pool: {e}")

def create_tables():
    """Create necessary tables if they don't exist"""
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Users table
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
        
        # Game stats table
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
                diamonds INTEGER DEFAULT 500,
                stars INTEGER DEFAULT 100,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add diamonds and stars columns if they don't exist (for existing databases)
        try:
            cursor.execute("ALTER TABLE game_stats ADD COLUMN IF NOT EXISTS diamonds INTEGER DEFAULT 500")
            cursor.execute("ALTER TABLE game_stats ADD COLUMN IF NOT EXISTS stars INTEGER DEFAULT 100")
            # Update existing users who don't have diamonds/stars set
            cursor.execute("UPDATE game_stats SET diamonds = 500 WHERE diamonds IS NULL")
            cursor.execute("UPDATE game_stats SET stars = 100 WHERE stars IS NULL")
        except Exception as e:
            print(f"[INFO] Columns may already exist: {e}")
        
        # Game sessions table (for detailed game history)
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
        
        # Password reset tokens table
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
        
        # Saved game states table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS saved_game_states (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                game_state JSONB NOT NULL,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_game_over BOOLEAN DEFAULT FALSE,
                UNIQUE(user_id)
            )
        """)
        
        # Three stones game rooms table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS three_stones_rooms (
                id SERIAL PRIMARY KEY,
                room_code VARCHAR(10) UNIQUE NOT NULL,
                room_name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255),
                creator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                creator_socket_id VARCHAR(255),
                orange_player_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                orange_socket_id VARCHAR(255),
                blue_player_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                blue_socket_id VARCHAR(255),
                game_state JSONB,
                started BOOLEAN DEFAULT FALSE,
                game_over BOOLEAN DEFAULT FALSE,
                winner VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                ended_at TIMESTAMP
            )
        """)
        
        # Create index for faster room lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_three_stones_rooms_code 
            ON three_stones_rooms(room_code)
        """)
        
        # Create index for active rooms
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_three_stones_rooms_active 
            ON three_stones_rooms(room_code, started, game_over) 
            WHERE started = FALSE AND game_over = FALSE
        """)
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        print("[OK] Database tables created successfully")
    except Exception as e:
        print(f"[ERROR] Error creating tables: {e}")
        if conn:
            db_pool.putconn(conn)

def hash_password(password):
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def send_email(to_email, subject, body):
    """Send email using SMTP"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print(f"[WARNING] Email configuration missing, email not sent to: {to_email}")
        return False
    
    try:
        # Remove any spaces from password (common issue with Gmail App Passwords)
        password_clean = SMTP_PASSWORD.replace(' ', '').strip()
        
        msg = MIMEMultipart()
        msg['From'] = SMTP_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html', 'utf-8'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_EMAIL, password_clean)
        server.send_message(msg)
        server.quit()
        
        print(f"[OK] Email sent to: {to_email}")
        return True
    except smtplib.SMTPAuthenticationError as e:
        print(f"[ERROR] Email authentication failed!")
        print(f"[ERROR] Check if:")
        print(f"  1. 2-Step Verification is enabled in Gmail")
        print(f"  2. App Password is correct (16 characters, no spaces)")
        print(f"  3. Email address is correct: {SMTP_EMAIL}")
        print(f"[ERROR] Details: {e}")
        return False
    except Exception as e:
        print(f"[ERROR] Email sending error: {e}")
        return False

@app.route('/api/register', methods=['POST'])
def register():
    """Register new user"""
    conn = None
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip().lower()
        phone_number = data.get('phone_number', '').strip()
        password = data.get('password', '')
        
        # Validation
        if not username or len(username) < 3:
            return jsonify({'success': False, 'error': 'İstifadəçi adı ən azı 3 simvol olmalıdır'}), 400
        
        if not email or '@' not in email:
            return jsonify({'success': False, 'error': 'Etibarlı email ünvanı daxil edin'}), 400
        
        if not phone_number or len(phone_number) < 8:
            return jsonify({'success': False, 'error': 'Etibarlı telefon nömrəsi daxil edin'}), 400
        
        if not password or len(password) < 4:
            return jsonify({'success': False, 'error': 'Şifrə ən azı 4 simvol olmalıdır'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Check if username exists
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Bu istifadəçi adı artıq mövcuddur'}), 400
        
        # Check if email exists
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Bu email ünvanı artıq istifadə olunur'}), 400
        
        # Check if phone number exists
        cursor.execute("SELECT id FROM users WHERE phone_number = %s", (phone_number,))
        if cursor.fetchone():
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Bu telefon nömrəsi artıq istifadə olunur'}), 400
        
        # Create user
        password_hash = hash_password(password)
        cursor.execute("""
            INSERT INTO users (username, email, phone_number, password_hash)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (username, email, phone_number, password_hash))
        
        user_id = cursor.fetchone()[0]
        
        # Create initial game stats with starting diamonds (500) and stars (100)
        cursor.execute("""
            INSERT INTO game_stats (user_id, diamonds, stars)
            VALUES (%s, 500, 100)
        """, (user_id,))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        return jsonify({
            'success': True,
            'message': 'Qeydiyyat uğurla tamamlandı',
            'user_id': user_id
        })
        
    except Exception as e:
        print(f"[ERROR] Register error: {e}")
        if conn:
            cursor.close()
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'success': False, 'error': 'İstifadəçi adı və şifrə tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        password_hash = hash_password(password)
        cursor.execute("""
            SELECT id, username, is_active
            FROM users
            WHERE username = %s AND password_hash = %s
        """, (username, password_hash))
        
        user = cursor.fetchone()
        
        if not user:
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'İstifadəçi adı və ya şifrə yanlışdır'}), 401
        
        user_id, db_username, is_active = user
        
        if not is_active:
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Hesab deaktivdir'}), 403
        
        # Update last login
        cursor.execute("""
            UPDATE users
            SET last_login = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (user_id,))
        
        # Get user stats including diamonds and stars
        cursor.execute("""
            SELECT total_games, total_score, best_wave, best_score, 
                   total_enemies_killed, total_time_played, diamonds, stars
            FROM game_stats
            WHERE user_id = %s
        """, (user_id,))
        
        stats = cursor.fetchone()
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        return jsonify({
            'success': True,
            'user': {
                'id': user_id,
                'username': db_username
            },
            'stats': {
                'total_games': stats[0] if stats else 0,
                'total_score': stats[1] if stats else 0,
                'best_wave': stats[2] if stats else 0,
                'best_score': stats[3] if stats else 0,
                'total_enemies_killed': stats[4] if stats else 0,
                'total_time_played': stats[5] if stats else 0,
                'diamonds': stats[6] if stats and stats[6] is not None else 500,
                'stars': stats[7] if stats and stats[7] is not None else 100
            }
        })
        
    except Exception as e:
        print(f"[ERROR] Login error: {e}")
        if conn:
            cursor.close()
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/save-game', methods=['POST'])
def save_game():
    """Save game session and update stats"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        score = data.get('score', 0)
        wave_reached = data.get('wave_reached', 0)
        enemies_killed = data.get('enemies_killed', 0)
        game_duration = data.get('game_duration', 0)
        game_data = data.get('game_data', {})
        # Optional: diamonds and stars updates from game
        diamonds_earned = data.get('diamonds_earned', 0)
        stars_earned = data.get('stars_earned', 0)
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Save game session
        cursor.execute("""
            INSERT INTO game_sessions (user_id, score, wave_reached, enemies_killed, game_duration, game_data)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (user_id, score, wave_reached, enemies_killed, game_duration, json.dumps(game_data)))
        
        session_id = cursor.fetchone()[0]
        
        # Update game stats including diamonds and stars
        update_fields = [
            "total_games = total_games + 1",
            "total_score = total_score + %s",
            "best_wave = GREATEST(best_wave, %s)",
            "best_score = GREATEST(best_score, %s)",
            "total_enemies_killed = total_enemies_killed + %s",
            "total_time_played = total_time_played + %s",
            "updated_at = CURRENT_TIMESTAMP"
        ]
        update_values = [score, wave_reached, score, enemies_killed, game_duration]
        
        # Add diamonds and stars updates if provided
        if diamonds_earned != 0:
            update_fields.append("diamonds = diamonds + %s")
            update_values.append(diamonds_earned)
        
        if stars_earned != 0:
            update_fields.append("stars = stars + %s")
            update_values.append(stars_earned)
        
        update_values.append(user_id)
        
        cursor.execute(f"""
            UPDATE game_stats
            SET {', '.join(update_fields)}
            WHERE user_id = %s
        """, update_values)
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        return jsonify({
            'success': True,
            'message': 'Oyun məlumatları saxlanıldı',
            'session_id': session_id
        })
        
    except Exception as e:
        print(f"[ERROR] Save game error: {e}")
        if conn:
            cursor.close()
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/get-stats', methods=['GET'])
def get_stats():
    """Get user stats"""
    conn = None
    cursor = None
    try:
        user_id = request.args.get('user_id', type=int)
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT total_games, total_score, best_wave, best_score, 
                   total_enemies_killed, total_time_played, diamonds, stars
            FROM game_stats
            WHERE user_id = %s
        """, (user_id,))
        
        stats = cursor.fetchone()
        
        # Əgər stats yoxdursa, default dəyərlər qaytar
        if not stats:
            cursor.close()
            db_pool.putconn(conn)
            conn = None
            cursor = None
            
            # Default stats qaytar - yeni istifadəçi üçün
            return jsonify({
                'success': True,
                'stats': {
                    'total_games': 0,
                    'total_score': 0,
                    'best_wave': 0,
                    'best_score': 0,
                    'total_enemies_killed': 0,
                    'total_time_played': 0,
                    'diamonds': 500,
                    'stars': 100
                }
            })
        
        cursor.close()
        db_pool.putconn(conn)
        conn = None
        cursor = None
        
        return jsonify({
            'success': True,
            'stats': {
                'total_games': stats[0] if stats[0] is not None else 0,
                'total_score': stats[1] if stats[1] is not None else 0,
                'best_wave': stats[2] if stats[2] is not None else 0,
                'best_score': stats[3] if stats[3] is not None else 0,
                'total_enemies_killed': stats[4] if stats[4] is not None else 0,
                'total_time_played': stats[5] if stats[5] is not None else 0,
                'diamonds': stats[6] if stats[6] is not None else 500,
                'stars': stats[7] if stats[7] is not None else 100
            }
        })
        
    except Exception as e:
        print(f"[ERROR] Get stats error: {e}")
        import traceback
        traceback.print_exc()
        if cursor:
            try:
                cursor.close()
            except:
                pass
        if conn:
            try:
                db_pool.putconn(conn)
            except:
                pass
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/update-currency', methods=['POST'])
def update_currency():
    """Update user diamonds and stars"""
    conn = None
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        diamonds_change = data.get('diamonds_change', 0)  # Can be positive or negative
        stars_change = data.get('stars_change', 0)  # Can be positive or negative
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Update diamonds and stars
        update_fields = []
        update_values = []
        
        if diamonds_change != 0:
            update_fields.append("diamonds = GREATEST(0, diamonds + %s)")
            update_values.append(diamonds_change)
        
        if stars_change != 0:
            update_fields.append("stars = GREATEST(0, stars + %s)")
            update_values.append(stars_change)
        
        if not update_fields:
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': True, 'message': 'Dəyişiklik yoxdur'})
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        update_values.append(user_id)
        
        cursor.execute(f"""
            UPDATE game_stats
            SET {', '.join(update_fields)}
            WHERE user_id = %s
            RETURNING diamonds, stars
        """, update_values)
        
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        if result:
            return jsonify({
                'success': True,
                'message': 'Valyuta yeniləndi',
                'diamonds': result[0],
                'stars': result[1]
            })
        else:
            return jsonify({'success': False, 'error': 'İstifadəçi tapılmadı'}), 404
        
    except Exception as e:
        print(f"[ERROR] Update currency error: {e}")
        if conn:
            cursor.close()
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset - send email with reset token"""
    conn = None
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        if not email or '@' not in email:
            return jsonify({'success': False, 'error': 'Etibarlı email ünvanı daxil edin'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Find user by email
        cursor.execute("SELECT id, username FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        if not user:
            # Don't reveal if email exists (security)
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': True, 'message': 'Əgər email mövcuddursa, şifrə sıfırlama linki göndərildi'})
        
        user_id, username = user
        
        # Generate reset token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(hours=1)  # Token 1 saat etibarlıdır
        
        # Save token to database
        cursor.execute("""
            INSERT INTO password_reset_tokens (user_id, token, expires_at)
            VALUES (%s, %s, %s)
        """, (user_id, token, expires_at))
        
        # Send email with reset link
        # RESET_PASSWORD_URL environment variable-dan al, yoxdursa BASE_URL istifadə et
        base_reset_url = RESET_PASSWORD_URL or os.environ.get('BASE_URL', 'http://127.0.0.1:5000')
        # URL-in sonunda slash varsa, onu sil
        base_reset_url = base_reset_url.rstrip('/')
        # Link-i doğru şəkildə yarat (təkrarlanmadan)
        reset_link = f"{base_reset_url}/reset-password.html?token={token}"
        email_subject = "Şifrə Sıfırlama - Qüllə Müdafiəsi"
        email_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Şifrə Sıfırlama</h2>
            <p>Salam {username},</p>
            <p>Şifrənizi sıfırlamaq üçün aşağıdakı linkə klikləyin:</p>
            <p><a href="{reset_link}" style="background: #00bcd4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Şifrəni Sıfırla</a></p>
            <p>Link 1 saat müddətində etibarlıdır.</p>
            <p>Əgər siz bu sorğunu verməmisinizsə, bu emaili göz ardı edin.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">Bu avtomatik emaildir, cavab verməyin.</p>
        </body>
        </html>
        """
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        # Try to send email (but don't fail if email is not configured)
        email_sent = send_email(email, email_subject, email_body)
        
        if email_sent:
            return jsonify({'success': True, 'message': 'Şifrə sıfırlama linki email ünvanınıza göndərildi'})
        else:
            # Even if email sending fails, return success to prevent email enumeration
            # In production, this should be logged and handled properly
            print(f"[WARNING] Email sending failed, but token was saved for user {user_id}")
            return jsonify({'success': True, 'message': 'Şifrə sıfırlama tokeni yaradıldı (email göndərilmədi - konfiqurasiya yoxlanmalıdır)'})
        
    except Exception as e:
        print(f"[ERROR] Forgot password error: {e}")
        if conn:
            cursor.close()
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/verify-reset-token', methods=['GET'])
def verify_reset_token():
    """Get username from reset token (for displaying on reset page)"""
    conn = None
    try:
        token = request.args.get('token', '').strip()
        
        if not token:
            return jsonify({'success': False, 'error': 'Token tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = None
        try:
            cursor = conn.cursor()
            
            # Find token and get username
            cursor.execute("""
                SELECT prt.user_id, prt.expires_at, prt.used, u.username
                FROM password_reset_tokens prt
                JOIN users u ON prt.user_id = u.id
                WHERE prt.token = %s
            """, (token,))
            
            token_data = cursor.fetchone()
            
            if not token_data:
                cursor.close()
                db_pool.putconn(conn)
                return jsonify({'success': False, 'error': 'Etibarsız və ya mövcud olmayan token'}), 400
            
            user_id, expires_at, used, username = token_data
            
            # Make expires_at timezone-aware if it's naive (PostgreSQL returns naive datetime)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            
            # Check if token is expired
            if datetime.now(UTC) > expires_at:
                cursor.close()
                db_pool.putconn(conn)
                return jsonify({'success': False, 'error': 'Token müddəti bitib'}), 400
            
            # Check if token already used
            if used:
                cursor.close()
                db_pool.putconn(conn)
                return jsonify({'success': False, 'error': 'Bu token artıq istifadə edilib'}), 400
            
            cursor.close()
            db_pool.putconn(conn)
            
            return jsonify({
                'success': True,
                'username': username,
                'message': 'Token etibarlıdır'
            })
        except Exception as inner_e:
            print(f"[ERROR] Inner verify reset token error: {inner_e}")
            if cursor:
                try:
                    cursor.close()
                except:
                    pass
            if conn:
                try:
                    db_pool.putconn(conn)
                except:
                    pass
            raise inner_e
        
    except Exception as e:
        print(f"[ERROR] Verify reset token error: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        if conn:
            try:
                cursor.close()
            except:
                pass
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    """Reset password using token"""
    conn = None
    try:
        data = request.get_json()
        token = data.get('token', '').strip()
        new_password = data.get('new_password', '')
        
        if not token:
            return jsonify({'success': False, 'error': 'Token tələb olunur'}), 400
        
        if not new_password or len(new_password) < 4:
            return jsonify({'success': False, 'error': 'Yeni şifrə ən azı 4 simvol olmalıdır'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Find valid token
        cursor.execute("""
            SELECT user_id, expires_at, used
            FROM password_reset_tokens
            WHERE token = %s
        """, (token,))
        
        token_data = cursor.fetchone()
        
        if not token_data:
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Etibarsız və ya mövcud olmayan token'}), 400
        
        user_id, expires_at, used = token_data
        
        # Make expires_at timezone-aware if it's naive (PostgreSQL returns naive datetime)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        
        # Check if token is expired
        if datetime.now(UTC) > expires_at:
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Token müddəti bitib'}), 400
        
        # Check if token already used
        if used:
            cursor.close()
            db_pool.putconn(conn)
            return jsonify({'success': False, 'error': 'Bu token artıq istifadə edilib'}), 400
        
        # Update password (token already verified the user)
        new_password_hash = hash_password(new_password)
        cursor.execute("""
            UPDATE users
            SET password_hash = %s
            WHERE id = %s
        """, (new_password_hash, user_id))
        
        # Mark token as used
        cursor.execute("""
            UPDATE password_reset_tokens
            SET used = TRUE
            WHERE token = %s
        """, (token,))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        return jsonify({'success': True, 'message': 'Şifrə uğurla dəyişdirildi'})
        
    except Exception as e:
        print(f"[ERROR] Reset password error: {e}")
        if conn:
            cursor.close()
            db_pool.putconn(conn)
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        db_pool.putconn(conn)
        return jsonify({'success': True, 'status': 'healthy'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/save-game-state', methods=['POST'])
def save_game_state():
    """Save current game state"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        game_state = data.get('game_state', {})
        is_game_over = data.get('is_game_over', False)
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Yeni qeyd və ya mövcud qeydi yenilə
        cursor.execute("""
            INSERT INTO saved_game_states (user_id, game_state, is_game_over)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                game_state = EXCLUDED.game_state,
                is_game_over = EXCLUDED.is_game_over,
                saved_at = CURRENT_TIMESTAMP
        """, (user_id, json.dumps(game_state), is_game_over))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        return jsonify({
            'success': True,
            'message': 'Oyun vəziyyəti saxlanıldı'
        })
        
    except Exception as e:
        print(f"[ERROR] Save game state error: {e}")
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/load-game-state', methods=['GET'])
def load_game_state():
    """Load saved game state"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        # Yadda saxlanılmış oyun vəziyyətini yüklə
        cursor.execute("""
            SELECT game_state, is_game_over, saved_at
            FROM saved_game_states
            WHERE user_id = %s
        """, (user_id,))
        
        result = cursor.fetchone()
        
        cursor.close()
        db_pool.putconn(conn)
        
        if result:
            game_state = result[0]
            is_game_over = result[1]
            saved_at = result[2]
            
            return jsonify({
                'success': True,
                'game_state': game_state,
                'is_game_over': is_game_over,
                'saved_at': saved_at.isoformat() if saved_at else None
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Yadda saxlanılmış oyun vəziyyəti tapılmadı'
            })
        
    except Exception as e:
        print(f"[ERROR] Load game state error: {e}")
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

@app.route('/api/delete-game-state', methods=['POST'])
def delete_game_state():
    """Delete saved game state"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID tələb olunur'}), 400
        
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM saved_game_states
            WHERE user_id = %s
        """, (user_id,))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        
        return jsonify({
            'success': True,
            'message': 'Oyun vəziyyəti silindi'
        })
        
    except Exception as e:
        print(f"[ERROR] Delete game state error: {e}")
        return jsonify({'success': False, 'error': f'Xəta: {str(e)}'}), 500

# Serve favicon.ico (browsers automatically request this)
@app.route('/favicon.ico')
def favicon():
    """Serve favicon"""
    try:
        return app.send_static_file('favicon.svg')
    except:
        return '', 204  # No content if not found

# Serve HTML pages and static files
@app.route('/')
def index():
    """Serve login page as default"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        response = send_from_directory(pages_folder, 'login.html')
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response
    except Exception as e:
        print(f"[ERROR] Failed to serve login.html: {e}")
        return jsonify({'error': 'Page not found'}), 404

@app.route('/index.html')
def game_index():
    """Serve game index page"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        index_path = os.path.join(pages_folder, 'index.html')
        if os.path.exists(index_path):
            response = send_from_directory(pages_folder, 'index.html')
            # Ensure correct Content-Type
            response.headers['Content-Type'] = 'text/html; charset=utf-8'
            return response
        else:
            print(f"[ERROR] index.html not found at: {index_path}")
            return jsonify({'error': 'Page not found'}), 404
    except Exception as e:
        print(f"[ERROR] Failed to serve index.html: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Page not found'}), 404

@app.route('/login.html')
def login_page():
    """Serve login page"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        response = send_from_directory(pages_folder, 'login.html')
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response
    except Exception as e:
        print(f"[ERROR] Failed to serve login.html: {e}")
        return jsonify({'error': 'Page not found'}), 404

@app.route('/register.html')
def register_page():
    """Serve register page"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        response = send_from_directory(pages_folder, 'register.html')
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response
    except Exception as e:
        print(f"[ERROR] Failed to serve register.html: {e}")
        return jsonify({'error': 'Page not found'}), 404

@app.route('/forgot-password.html')
def forgot_password_page():
    """Serve forgot password page"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        response = send_from_directory(pages_folder, 'forgot-password.html')
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response
    except Exception as e:
        print(f"[ERROR] Failed to serve forgot-password.html: {e}")
        return jsonify({'error': 'Page not found'}), 404

@app.route('/reset-password.html')
@app.route('/reset-password.html/')
def reset_password_page():
    """Serve reset password page"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        response = send_from_directory(pages_folder, 'reset-password.html')
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response
    except Exception as e:
        print(f"[ERROR] Failed to serve reset-password.html: {e}")
        return jsonify({'error': 'Page not found'}), 404

@app.route('/mobile.html')
def mobile_page():
    """Serve mobile page"""
    try:
        pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
        response = send_from_directory(pages_folder, 'mobile.html')
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response
    except Exception as e:
        print(f"[ERROR] Failed to serve mobile.html: {e}")
        return jsonify({'error': 'Page not found'}), 404

# Serve static files explicitly (Flask auto-serving might not work)
@app.route('/assets/<path:filename>')
def serve_static(filename):
    """Serve static files from assets folder"""
    try:
        # Remove query string from filename for file existence check
        clean_filename = filename.split('?')[0] if '?' in filename else filename
        
        # Get absolute path to assets folder
        assets_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets')
        file_path = os.path.join(assets_folder, clean_filename)
        
        if os.path.exists(file_path) and os.path.isfile(file_path):
            response = send_from_directory(os.path.dirname(file_path), os.path.basename(file_path))
            # Set correct Content-Type based on file extension
            if clean_filename.endswith('.js'):
                response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
            elif clean_filename.endswith('.css'):
                response.headers['Content-Type'] = 'text/css; charset=utf-8'
            elif clean_filename.endswith('.html'):
                response.headers['Content-Type'] = 'text/html; charset=utf-8'
            elif clean_filename.endswith('.svg'):
                response.headers['Content-Type'] = 'image/svg+xml'
            elif clean_filename.endswith('.png'):
                response.headers['Content-Type'] = 'image/png'
            elif clean_filename.endswith('.jpg') or clean_filename.endswith('.jpeg'):
                response.headers['Content-Type'] = 'image/jpeg'
            return response
        else:
            print(f"[ERROR] Static file not found: {file_path} (filename: {filename})")
            return '', 404
    except Exception as e:
        print(f"[ERROR] Static file not found: {filename}, error: {e}")
        import traceback
        traceback.print_exc()
        return '', 404

@app.route('/<path:path>')
def serve_page(path):
    """Serve HTML pages and static files"""
    # API routes - already handled by Flask route handlers above
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    # Skip assets - handled by serve_static route above
    if path.startswith('assets/'):
        return jsonify({'error': 'Asset not found'}), 404
    
    # URL duplikasiyasını normalize et (məsələn: reset-password.html/reset-password.html -> reset-password.html)
    if 'reset-password.html' in path:
        # Eğer path'de reset-password.html iki kere varsa, normalize et
        parts = path.split('/')
        if parts.count('reset-password.html') > 1:
            # İlk reset-password.html'i al, query string'i koru
            normalized_path = 'reset-password.html'
            # Query string'i tap
            if '?' in path:
                # Find the query string from the original path
                query_start = path.find('?')
                query_part = path[query_start:]
                normalized_path = normalized_path + query_part
            path = normalized_path
        # Eğer path'de reset-password.html/ varsa, normalize et (sonunda slash varsa)
        elif path == 'reset-password.html/' or path.startswith('reset-password.html/'):
            # Remove trailing slash and normalize
            normalized_path = path.rstrip('/')
            if normalized_path != 'reset-password.html':
                # If there's something after reset-password.html/, extract query string
                if '?' in normalized_path:
                    query_start = normalized_path.find('?')
                    normalized_path = 'reset-password.html' + normalized_path[query_start:]
                else:
                    normalized_path = 'reset-password.html'
            path = normalized_path
    
    # Serve games folder (games/neondefender/index.html, etc.)
    if path.startswith('games/'):
        # Remove query string from path for file existence check
        clean_path = path.split('?')[0] if '?' in path else path
        
        # Remove 'games/' prefix from path since games_folder already points to games directory
        relative_path = clean_path[6:] if clean_path.startswith('games/') else clean_path
        
        games_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'games')
        games_path = os.path.join(games_folder, relative_path)
        
        if os.path.exists(games_path) and os.path.isfile(games_path):
            response = send_from_directory(os.path.dirname(games_path), os.path.basename(games_path))
            # Ensure correct Content-Type based on file extension
            if relative_path.endswith('.html'):
                response.headers['Content-Type'] = 'text/html; charset=utf-8'
            elif relative_path.endswith('.js'):
                response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
            elif relative_path.endswith('.css'):
                response.headers['Content-Type'] = 'text/css; charset=utf-8'
            elif relative_path.endswith('.json'):
                response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response
        else:
            print(f"[ERROR] Games file not found: {games_path} (original path: {path}, relative_path: {relative_path})")
            return jsonify({'error': 'File not found'}), 404
    
    # Serve HTML pages from pages folder
    pages_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'pages')
    if not path.endswith('.html'):
        html_path = path + '.html'
        full_path = os.path.join(pages_folder, html_path)
        if os.path.exists(full_path):
            response = send_from_directory(pages_folder, html_path)
            response.headers['Content-Type'] = 'text/html; charset=utf-8'
            return response
    
    # Try to serve as HTML page
    page_path = os.path.join(pages_folder, path)
    if os.path.exists(page_path):
        response = send_from_directory(pages_folder, path)
        if path.endswith('.html'):
            response.headers['Content-Type'] = 'text/html; charset=utf-8'
        elif path.endswith('.js'):
            response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
        elif path.endswith('.css'):
            response.headers['Content-Type'] = 'text/css; charset=utf-8'
        return response
    
    return jsonify({'error': 'Page not found'}), 404

# WebSocket routes for multiplayer game
def generate_room_code():
    """Generate a random 6-character room code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def get_user_id_from_username(username):
    """Get user ID from username"""
    if not db_pool or not username:
        return None
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        result = cursor.fetchone()
        cursor.close()
        db_pool.putconn(conn)
        return result[0] if result else None
    except Exception as e:
        print(f"[ERROR] Error getting user ID: {e}")
        return None

def save_room_to_db(room_code, room_name, password_hash, creator_socket_id, creator_username):
    """Save room to database"""
    if not db_pool:
        return
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        creator_user_id = get_user_id_from_username(creator_username) if creator_username else None
        
        cursor.execute("""
            INSERT INTO three_stones_rooms 
            (room_code, room_name, password_hash, creator_user_id, creator_socket_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (room_code) DO UPDATE SET
                room_name = EXCLUDED.room_name,
                password_hash = EXCLUDED.password_hash,
                creator_user_id = EXCLUDED.creator_user_id,
                creator_socket_id = EXCLUDED.creator_socket_id
        """, (room_code, room_name, password_hash, creator_user_id, creator_socket_id, datetime.now(UTC)))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        print(f"[DB] Room saved to database: {room_code}")
    except Exception as e:
        print(f"[ERROR] Error saving room to database: {e}")
        if conn:
            db_pool.putconn(conn)

def update_room_player_in_db(room_code, player_color, player_socket_id, player_username):
    """Update player in room in database"""
    if not db_pool:
        return
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        player_user_id = get_user_id_from_username(player_username) if player_username else None
        
        if player_color == 'orange':
            cursor.execute("""
                UPDATE three_stones_rooms 
                SET orange_player_id = %s, orange_socket_id = %s
                WHERE room_code = %s
            """, (player_user_id, player_socket_id, room_code))
        elif player_color == 'blue':
            cursor.execute("""
                UPDATE three_stones_rooms 
                SET blue_player_id = %s, blue_socket_id = %s
                WHERE room_code = %s
            """, (player_user_id, player_socket_id, room_code))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        print(f"[DB] Room player updated: {room_code} - {player_color}")
    except Exception as e:
        print(f"[ERROR] Error updating room player: {e}")
        if conn:
            db_pool.putconn(conn)

def start_game_in_db(room_code):
    """Mark game as started in database"""
    if not db_pool:
        return
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE three_stones_rooms 
            SET started = TRUE, started_at = %s
            WHERE room_code = %s
        """, (datetime.now(UTC), room_code))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        print(f"[DB] Game started in database: {room_code}")
    except Exception as e:
        print(f"[ERROR] Error starting game in database: {e}")
        if conn:
            db_pool.putconn(conn)

def delete_room_from_db(room_code):
    """Delete room from database"""
    if not db_pool:
        return
    try:
        conn = db_pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM three_stones_rooms WHERE room_code = %s", (room_code,))
        
        conn.commit()
        cursor.close()
        db_pool.putconn(conn)
        print(f"[DB] Room deleted from database: {room_code}")
    except Exception as e:
        print(f"[ERROR] Error deleting room from database: {e}")
        if conn:
            db_pool.putconn(conn)

def get_lobby_list():
    """Get list of available rooms for lobby"""
    lobby_rooms = []
    current_time = datetime.now(UTC)
    
    for room_code, room in rooms.items():
        # Skip started rooms
        if room.get('started'):
            continue
        
        # Skip empty rooms older than 5 minutes (they will be cleaned up)
        if not room.get('players') or len(room.get('players', {})) == 0:
            created_at = room.get('created_at')
            if created_at:
                time_diff = current_time - created_at
                if time_diff.total_seconds() > 300:  # 5 minutes
                    continue
        
        lobby_rooms.append({
            'code': room_code,
            'name': room.get('name', room_code),
            'players': len(room.get('players', {})),
            'hasPassword': room.get('password_hash') is not None
        })
    return lobby_rooms

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    player_id = request.sid
    if player_id in players:
        player_info = players[player_id]
        room_code = player_info.get('room_code')
        
        if room_code and room_code in rooms:
            room = rooms[room_code]
            color = player_info.get('color')
            
            # Remove player from room
            if color in room['players']:
                del room['players'][color]
            
            # Get updated players list
            players_info = {}
            for remaining_color, pid in room['players'].items():
                if pid in players:
                    players_info[remaining_color] = players[pid]['username']
            
            # Notify other players with updated player list
            socketio.emit('player_left', {
                'color': color,
                'players': players_info
            }, room=room_code)
            
            # Reset game if started (so room can be reused)
            if room.get('started'):
                room['started'] = False
                room['game_state'] = None
                # Update database to mark game as not started
                if db_pool:
                    try:
                        conn = db_pool.getconn()
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE three_stones_rooms 
                            SET started = FALSE, game_state = NULL, started_at = NULL
                            WHERE room_code = %s
                        """, (room_code,))
                        conn.commit()
                        cursor.close()
                        db_pool.putconn(conn)
                    except Exception as e:
                        print(f"[ERROR] Error resetting game: {e}")
                        if conn:
                            db_pool.putconn(conn)
            
            # Clean up empty room only if it's empty for more than 5 minutes
            if not room['players']:
                created_at = room.get('created_at')
                if created_at:
                    current_time = datetime.now(UTC)
                    time_diff = current_time - created_at
                    # Only delete if room is empty and older than 5 minutes
                    if time_diff.total_seconds() > 300:
                        delete_room_from_db(room_code)
                        del rooms[room_code]
                    else:
                        # Room is empty but not old enough, keep it in lobby
                        socketio.emit('lobby_list', {'rooms': get_lobby_list()})
                else:
                    # No created_at, delete immediately
                    delete_room_from_db(room_code)
                    del rooms[room_code]
            else:
                # Update room player in database (remove player)
                if color == 'orange':
                    if db_pool:
                        try:
                            conn = db_pool.getconn()
                            cursor = conn.cursor()
                            cursor.execute("""
                                UPDATE three_stones_rooms 
                                SET orange_player_id = NULL, orange_socket_id = NULL
                                WHERE room_code = %s
                            """, (room_code,))
                            conn.commit()
                            cursor.close()
                            db_pool.putconn(conn)
                        except Exception as e:
                            print(f"[ERROR] Error updating room player: {e}")
                            if conn:
                                db_pool.putconn(conn)
                elif color == 'blue':
                    if db_pool:
                        try:
                            conn = db_pool.getconn()
                            cursor = conn.cursor()
                            cursor.execute("""
                                UPDATE three_stones_rooms 
                                SET blue_player_id = NULL, blue_socket_id = NULL
                                WHERE room_code = %s
                            """, (room_code,))
                            conn.commit()
                            cursor.close()
                            db_pool.putconn(conn)
                        except Exception as e:
                            print(f"[ERROR] Error updating room player: {e}")
                            if conn:
                                db_pool.putconn(conn)
                
                # Broadcast lobby update
                socketio.emit('lobby_list', {'rooms': get_lobby_list()})
        
        del players[player_id]
    print(f"Client disconnected: {request.sid}")

@socketio.on('leave_room')
def handle_leave_room(data):
    player_id = request.sid
    room_code = data.get('roomCode', '')
    
    if player_id in players and room_code in rooms:
        player_info = players[player_id]
        room = rooms[room_code]
        color = player_info.get('color')
        
        # Remove player from room
        if color in room['players']:
            del room['players'][color]
        
        # Get updated players list
        players_info = {}
        for remaining_color, pid in room['players'].items():
            if pid in players:
                players_info[remaining_color] = players[pid]['username']
        
        # Notify other players with updated player list
        socketio.emit('player_left', {
            'color': color,
            'players': players_info
        }, room=room_code)
        
        # Reset game if started (so room can be reused)
        if room.get('started'):
            room['started'] = False
            room['game_state'] = None
            # Update database to mark game as not started
            if db_pool:
                try:
                    conn = db_pool.getconn()
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE three_stones_rooms 
                        SET started = FALSE, game_state = NULL, started_at = NULL
                        WHERE room_code = %s
                    """, (room_code,))
                    conn.commit()
                    cursor.close()
                    db_pool.putconn(conn)
                except Exception as e:
                    print(f"[ERROR] Error resetting game: {e}")
                    if conn:
                        db_pool.putconn(conn)
        
        # Clean up empty room only if it's empty for more than 5 minutes
        if not room['players']:
            created_at = room.get('created_at')
            if created_at:
                current_time = datetime.now(UTC)
                time_diff = current_time - created_at
                # Only delete if room is empty and older than 5 minutes
                if time_diff.total_seconds() > 300:
                    delete_room_from_db(room_code)
                    del rooms[room_code]
                else:
                    # Room is empty but not old enough, keep it in lobby
                    socketio.emit('lobby_list', {'rooms': get_lobby_list()})
            else:
                # No created_at, delete immediately
                delete_room_from_db(room_code)
                del rooms[room_code]
        else:
            # Update room player in database (remove player)
            if color == 'orange':
                if db_pool:
                    try:
                        conn = db_pool.getconn()
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE three_stones_rooms 
                            SET orange_player_id = NULL, orange_socket_id = NULL
                            WHERE room_code = %s
                        """, (room_code,))
                        conn.commit()
                        cursor.close()
                        db_pool.putconn(conn)
                    except Exception as e:
                        print(f"[ERROR] Error updating room player: {e}")
                        if conn:
                            db_pool.putconn(conn)
            elif color == 'blue':
                if db_pool:
                    try:
                        conn = db_pool.getconn()
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE three_stones_rooms 
                            SET blue_player_id = NULL, blue_socket_id = NULL
                            WHERE room_code = %s
                        """, (room_code,))
                        conn.commit()
                        cursor.close()
                        db_pool.putconn(conn)
                    except Exception as e:
                        print(f"[ERROR] Error updating room player: {e}")
                        if conn:
                            db_pool.putconn(conn)
            
            # Broadcast lobby update
            socketio.emit('lobby_list', {'rooms': get_lobby_list()})
        
        # Remove player from players dict
        if player_id in players:
            del players[player_id]
        
        # Leave socket room
        leave_room(room_code)
        
        emit('room_left', {'success': True})

@socketio.on('delete_room')
def handle_delete_room(data):
    """Allow room creator to delete room"""
    player_id = request.sid
    room_code = data.get('roomCode', '')
    
    if room_code in rooms:
        room = rooms[room_code]
        
        # Check if player is the creator
        if room.get('creator') == player_id:
            # Notify all players in room
            socketio.emit('room_deleted', {'message': 'Otaq yaradıcı tərəfindən silindi'}, room=room_code)
            
            # Remove all players from players dict
            for color, pid in room.get('players', {}).items():
                if pid in players:
                    del players[pid]
            
            # Delete room from database
            delete_room_from_db(room_code)
            
            # Delete room
            del rooms[room_code]
            
            # Broadcast lobby update
            socketio.emit('lobby_list', {'rooms': get_lobby_list()})
            
            emit('room_deleted', {'success': True})
        else:
            emit('error', {'message': 'Yalnız otaq yaradıcısı otağı silə bilər'})

@socketio.on('create_room')
def handle_create_room(data):
    player_id = request.sid
    username = data.get('username', 'Player')
    room_name = data.get('roomName', '')
    password = data.get('password')
    
    if not room_name:
        emit('error', {'message': 'Otaq adı tələb olunur'})
        return
    
    # Generate room code - check both memory and database
    room_code = generate_room_code()
    max_attempts = 100
    attempts = 0
    while attempts < max_attempts:
        # Check memory
        if room_code in rooms:
            room_code = generate_room_code()
            attempts += 1
            continue
        
        # Check database
        if db_pool:
            try:
                conn = db_pool.getconn()
                cursor = conn.cursor()
                cursor.execute("SELECT room_code FROM three_stones_rooms WHERE room_code = %s", (room_code,))
                if cursor.fetchone():
                    cursor.close()
                    db_pool.putconn(conn)
                    room_code = generate_room_code()
                    attempts += 1
                    continue
                cursor.close()
                db_pool.putconn(conn)
                break
            except Exception as e:
                print(f"[ERROR] Error checking room code in database: {e}")
                if conn:
                    db_pool.putconn(conn)
                break
        else:
            break
    
    if attempts >= max_attempts:
        emit('error', {'message': 'Otaq kodu yaratmaq mümkün olmadı. Zəhmət olmasa yenidən cəhd edin.'})
        return
    
    # Hash password if provided
    password_hash = None
    if password:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    # Create room
    rooms[room_code] = {
        'name': room_name,
        'password_hash': password_hash,
        'players': {'orange': player_id},
        'game_state': None,
        'started': False,
        'created_at': datetime.now(UTC),
        'creator': player_id  # Track creator for deletion
    }
    
    # Add player
    players[player_id] = {
        'username': username,
        'room_code': room_code,
        'color': 'orange'
    }
    
    # Join socket room
    join_room(room_code)
    
    # Save room to database
    save_room_to_db(room_code, room_name, password_hash, player_id, username)
    update_room_player_in_db(room_code, 'orange', player_id, username)
    
    # Send room code to client
    emit('room_created', {
        'roomCode': room_code,
        'playerId': player_id
    })
    
    # Broadcast lobby update to all clients (with small delay to ensure room is in dict)
    import threading
    def broadcast_lobby():
        time.sleep(0.1)
        socketio.emit('lobby_list', {'rooms': get_lobby_list()})
    threading.Thread(target=broadcast_lobby, daemon=True).start()

@socketio.on('join_room')
def handle_join_room(data):
    player_id = request.sid
    room_code = data.get('roomCode', '').upper()
    username = data.get('username', 'Player')
    password = data.get('password')
    
    # Try to load room from database if not in memory
    if room_code not in rooms:
        room = load_room_from_db(room_code)
        if not room:
            emit('error', {'message': 'Otaq tapılmadı'})
            return
    else:
        room = rooms[room_code]
    
    # Check password
    if room.get('password_hash'):
        if not password:
            emit('error', {'message': 'Bu otaq şifrə tələb edir'})
            return
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        if password_hash != room['password_hash']:
            emit('error', {'message': 'Yanlış şifrə'})
            return
    
    # Check if room is full
    if len(room['players']) >= 2:
        emit('error', {'message': 'Otaq doludur'})
        return
    
    # Check if game already started
    if room.get('started'):
        emit('error', {'message': 'Oyun artıq başlayıb'})
        return
    
    # Add player as blue
    room['players']['blue'] = player_id
    players[player_id] = {
        'username': username,
        'room_code': room_code,
        'color': 'blue'
    }
    
    # Update room player in database
    update_room_player_in_db(room_code, 'blue', player_id, username)
    
    # Join socket room
    join_room(room_code)
    
    # Notify both players
    emit('room_joined', {
        'roomCode': room_code,
        'playerId': player_id,
        'playerColor': 'blue'
    })
    
    # Update players list
    players_info = {}
    for color, pid in room['players'].items():
        if pid in players:
            players_info[color] = players[pid]['username']
    
    socketio.emit('player_joined', {'players': players_info}, room=room_code)
    
    # Auto-start game when second player joins
    if len(room['players']) == 2:
        # Initialize game state
        room['game_state'] = {
            'orangeStones': [
                {'id': 1, 'x': 110, 'y': 100, 'reachedGoal': False},
                {'id': 2, 'x': 110, 'y': 300, 'reachedGoal': False},
                {'id': 3, 'x': 110, 'y': 500, 'reachedGoal': False}
            ],
            'blueStones': [
                {'id': 1, 'x': 490, 'y': 100, 'reachedGoal': False},
                {'id': 2, 'x': 490, 'y': 300, 'reachedGoal': False},
                {'id': 3, 'x': 490, 'y': 500, 'reachedGoal': False}
            ],
            'currentTurn': 'orange',
            'gameOver': False,
            'winner': None
        }
        room['started'] = True
        
        # Mark game as started in database
        start_game_in_db(room_code)
        
        # Notify both players that game has started
        socketio.emit('game_start', {
            'gameState': room['game_state']
        }, room=room_code)
        
        print(f"[GAME] Game started automatically in room: {room_code}")
    
    # Broadcast lobby update to all clients
    import threading
    def broadcast_lobby_update():
        time.sleep(0.1)
        socketio.emit('lobby_list', {'rooms': get_lobby_list()})
    threading.Thread(target=broadcast_lobby_update, daemon=True).start()

@socketio.on('rejoin_room')
def handle_rejoin_room(data):
    """Handle reconnection to a room after page refresh"""
    player_id = request.sid
    room_code = data.get('roomCode', '').upper()
    username = data.get('username', 'Player')
    
    # Try to load room from database if not in memory
    if room_code not in rooms:
        room = load_room_from_db(room_code)
        if not room:
            emit('error', {'message': 'Otaq tapılmadı'})
            return
    else:
        room = rooms[room_code]
    
    # Check if player was in this room before (check database)
    player_color = None
    is_creator = False
    
    if db_pool:
        try:
            conn = db_pool.getconn()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT orange_player_id, blue_player_id, creator_user_id, game_state, started
                FROM three_stones_rooms
                WHERE room_code = %s
            """, (room_code,))
            result = cursor.fetchone()
            cursor.close()
            db_pool.putconn(conn)
            
            if result:
                orange_player_id, blue_player_id, creator_user_id, db_game_state, started = result
                
                # Get user ID from username
                user_id = None
                if username:
                    conn = db_pool.getconn()
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
                    user_result = cursor.fetchone()
                    if user_result:
                        user_id = user_result[0]
                    cursor.close()
                    db_pool.putconn(conn)
                
                # Determine player color based on user ID
                if user_id:
                    if orange_player_id == user_id:
                        player_color = 'orange'
                    elif blue_player_id == user_id:
                        player_color = 'blue'
                    
                    # Check if user is creator
                    if creator_user_id == user_id:
                        is_creator = True
                
                # Restore game state from database if available
                if db_game_state and started:
                    try:
                        room['game_state'] = json.loads(db_game_state) if isinstance(db_game_state, str) else db_game_state
                        room['started'] = started
                    except:
                        pass
        except Exception as e:
            print(f"[ERROR] Error checking rejoin room: {e}")
            import traceback
            traceback.print_exc()
    
    # If we couldn't determine color from database, try to find available slot
    if not player_color:
        if 'orange' not in room['players']:
            player_color = 'orange'
        elif 'blue' not in room['players']:
            player_color = 'blue'
        else:
            emit('error', {'message': 'Otaq doludur'})
            return
    
    # Check if slot is already taken by another active player
    if player_color in room['players']:
        existing_player_id = room['players'][player_color]
        if existing_player_id in players and players[existing_player_id].get('room_code') == room_code:
            # Another active player is in this slot, can't rejoin
            emit('error', {'message': 'Otaq doludur'})
            return
        # Slot exists but player is disconnected, reclaim it
        del room['players'][player_color]
    
    # Add player back to room
    room['players'][player_color] = player_id
    players[player_id] = {
        'username': username,
        'room_code': room_code,
        'color': player_color
    }
    
    # Update room player in database
    update_room_player_in_db(room_code, player_color, player_id, username)
    
    # Join socket room
    join_room(room_code)
    
    # Notify player that they rejoined
    emit('room_rejoined', {
        'roomCode': room_code,
        'playerId': player_id,
        'playerColor': player_color,
        'isCreator': is_creator,
        'gameState': room.get('game_state') if room.get('started') else None
    })
    
    # Update players list
    players_info = {}
    for color, pid in room['players'].items():
        if pid in players:
            players_info[color] = players[pid]['username']
    
    socketio.emit('player_joined', {'players': players_info}, room=room_code)
    
    # Broadcast lobby update to all clients
    import threading
    def broadcast_lobby_update():
        time.sleep(0.1)
        socketio.emit('lobby_list', {'rooms': get_lobby_list()})
    threading.Thread(target=broadcast_lobby_update, daemon=True).start()
    
    print(f"[REJOIN] Player {username} rejoined room {room_code} as {player_color}")

@socketio.on('get_lobby_list')
def handle_get_lobby_list(data):
    """Send lobby list to client"""
    emit('lobby_list', {'rooms': get_lobby_list()})

@socketio.on('start_game')
def handle_start_game(data):
    player_id = request.sid
    
    if player_id not in players:
        return
    
    room_code = players[player_id]['room_code']
    
    if room_code not in rooms:
        return
    
    room = rooms[room_code]
    
    # Check if both players are present
    if len(room['players']) < 2:
        emit('error', {'message': 'Hələ hər iki oyunçu yoxdur'})
        return
    
    # Initialize game state
    room['game_state'] = {
        'orangeStones': [
            {'id': 'orange-0', 'x': 80, 'y': 80, 'reachedGoal': False},
            {'id': 'orange-1', 'x': 80, 'y': 300, 'reachedGoal': False},
            {'id': 'orange-2', 'x': 80, 'y': 520, 'reachedGoal': False}
        ],
        'blueStones': [
            {'id': 'blue-0', 'x': 470, 'y': 80, 'reachedGoal': False},
            {'id': 'blue-1', 'x': 470, 'y': 300, 'reachedGoal': False},
            {'id': 'blue-2', 'x': 470, 'y': 520, 'reachedGoal': False}
        ],
        'currentTurn': 'orange',
        'gameOver': False,
        'winner': None
    }
    
    room['started'] = True
    
    # Notify both players
    socketio.emit('game_start', {
        'gameState': room['game_state']
    }, room=room_code)

@socketio.on('make_move')
def handle_make_move(data):
    player_id = request.sid
    
    if player_id not in players:
        return
    
    player_info = players[player_id]
    room_code = player_info['room_code']
    player_color = player_info['color']
    
    if room_code not in rooms:
        return
    
    room = rooms[room_code]
    game_state = room['game_state']
    
    if not game_state or game_state['gameOver']:
        return
    
    # Check if it's player's turn
    if game_state['currentTurn'] != player_color:
        emit('error', {'message': 'Sizin növbəniz deyil'})
        return
    
    stone_id = data.get('stoneId')
    new_x = data.get('x')
    new_y = data.get('y')
    
    # Validate and update move
    stones = game_state['orangeStones'] if player_color == 'orange' else game_state['blueStones']
    stone = next((s for s in stones if s['id'] == stone_id), None)
    
    if not stone:
        emit('error', {'message': 'Taş tapılmadı'})
        return
    
    # Update stone position
    stone['x'] = new_x
    stone['y'] = new_y
    
    # Check if stone reached goal
    if player_color == 'orange':
        # Orange goal: right side (x > 400)
        if new_x > 400:
            stone['reachedGoal'] = True
    else:
        # Blue goal: left side (x < 200)
        if new_x < 200:
            stone['reachedGoal'] = True
    
    # Check win condition
    stones_reached = sum(1 for s in stones if s['reachedGoal'])
    if stones_reached >= 3:
        game_state['gameOver'] = True
        game_state['winner'] = player_color
    
    # Switch turn
    game_state['currentTurn'] = 'blue' if player_color == 'orange' else 'orange'
    
    # Broadcast updated game state
    socketio.emit('move_made', {
        'gameState': game_state
    }, room=room_code)
    
    # Check if game over
    if game_state['gameOver']:
        socketio.emit('game_over', {
            'winner': game_state['winner'],
            'gameState': game_state
        }, room=room_code)

if __name__ == '__main__':
    init_db_pool()
    if db_pool:
        # Load active rooms from database on server start
        load_active_rooms_from_db()
        
        # Start room cleanup timer
        import threading
        def cleanup_timer():
            while True:
                time.sleep(60)  # Check every minute
                cleanup_empty_rooms()
        
        cleanup_thread = threading.Thread(target=cleanup_timer, daemon=True)
        cleanup_thread.start()
        
        port = int(os.environ.get('PORT', 5000))
        # Production mühitində URL-i environment variable-dan al
        base_url = os.environ.get('BASE_URL', f'http://127.0.0.1:{port}')
        url = f'{base_url}/'
        print(f"[START] Unified Server starting on port {port}")
        print(f"[INFO] API: {base_url}/api")
        print(f"[INFO] Login: {url}")
        print(f"[INFO] Game: {base_url}/index.html")
        print(f"[INFO] Assets: {base_url}/assets/")
        
        # Production mühitində browser açma və debug mode
        is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('ENV') == 'production'
        debug_mode = not is_production
        
        # Open browser automatically only in development mode
        if not is_production and not os.environ.get('WERKZEUG_RUN_MAIN'):
            # This is the first run (parent process), open browser
            def open_browser():
                time.sleep(1.5)  # Wait for server to fully start
                webbrowser.open(url)
                print(f"[BROWSER] Opening {url} in default browser...")
            
            import threading
            browser_thread = threading.Thread(target=open_browser)
            browser_thread.daemon = True
            browser_thread.start()
        
        # Use threading mode explicitly to avoid werkzeug compatibility issues
        socketio.run(app, host='0.0.0.0', port=port, debug=debug_mode, allow_unsafe_werkzeug=True, use_reloader=False)
    else:
        print("[ERROR] Failed to initialize database pool")

