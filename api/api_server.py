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
import logging
import traceback
from logging.handlers import RotatingFileHandler

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

# Three Stones game server is now in api/games/three_stones_server.py

# Setup logging
def setup_logging():
    """Setup comprehensive logging system"""
    log_level = os.environ.get('LOG_LEVEL', 'DEBUG').upper()
    log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
    
    # Create logs directory if it doesn't exist
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, log_level, logging.DEBUG))
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # Console handler with colored output
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_format = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)
    
    # File handler with rotation
    log_file = os.path.join(log_dir, 'server.log')
    file_handler = RotatingFileHandler(
        log_file, 
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s [%(filename)s:%(lineno)d]: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_format)
    logger.addHandler(file_handler)
    
    # Error log file
    error_log_file = os.path.join(log_dir, 'errors.log')
    error_handler = RotatingFileHandler(
        error_log_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(file_format)
    logger.addHandler(error_handler)
    
    return logger

# Initialize logging
logger = setup_logging()

# Helper functions for logging
def log_info(message, extra_data=None):
    """Log info message with optional extra data"""
    if extra_data:
        logger.info(f"{message} | Data: {json.dumps(extra_data, default=str)}")
    else:
        logger.info(message)

def log_debug(message, extra_data=None):
    """Log debug message with optional extra data"""
    if extra_data:
        logger.debug(f"{message} | Data: {json.dumps(extra_data, default=str)}")
    else:
        logger.debug(message)

def log_error(message, error=None, extra_data=None):
    """Log error message with optional exception and extra data"""
    error_msg = message
    if error:
        error_msg += f" | Error: {str(error)}"
    if extra_data:
        error_msg += f" | Data: {json.dumps(extra_data, default=str)}"
    logger.error(error_msg, exc_info=error if error else None)

def log_warning(message, extra_data=None):
    """Log warning message with optional extra data"""
    if extra_data:
        logger.warning(f"{message} | Data: {json.dumps(extra_data, default=str)}")
    else:
        logger.warning(message)

# Three Stones game functions moved to api/games/three_stones_server.py

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
        log_info("Database connection pool created successfully", {'min_conn': 1, 'max_conn': 10, 'host': db_host})
        create_tables()
    except Exception as e:
        log_error("Error creating connection pool", e, {'host': db_host, 'database': db_database})

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
        log_info("Database tables created successfully")
    except Exception as e:
        log_error("Error creating tables", e)
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

# Three Stones game WebSocket handlers moved to api/games/three_stones_server.py

if __name__ == '__main__':
    # Import Three Stones game server (after logging functions are defined)
    # Use relative import since we're running from api/ directory
    import sys
    import os
    # Add parent directory to path for imports
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from api.games.three_stones_server import (
        initialize as init_three_stones,
        load_active_rooms_from_db,
        cleanup_empty_rooms
    )
    
    init_db_pool()
    if db_pool:
        # Initialize Three Stones game server
        init_three_stones(socketio, db_pool, (log_info, log_error, log_debug, log_warning))
        
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
        log_info("Unified Server starting", {'port': port, 'base_url': base_url})
        log_info("Server endpoints", {
            'api': f'{base_url}/api',
            'login': url,
            'game': f'{base_url}/index.html',
            'assets': f'{base_url}/assets/'
        })
        
        # Production mühitində browser açma və debug mode
        is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('ENV') == 'production'
        debug_mode = not is_production
        
        # Open browser automatically only in development mode
        if not is_production and not os.environ.get('WERKZEUG_RUN_MAIN'):
            # This is the first run (parent process), open browser
            def open_browser():
                time.sleep(1.5)  # Wait for server to fully start
                webbrowser.open(url)
                log_info(f"Opening {url} in default browser")
            
            import threading
            browser_thread = threading.Thread(target=open_browser)
            browser_thread.daemon = True
            browser_thread.start()
        
        # Use threading mode explicitly to avoid werkzeug compatibility issues
        socketio.run(app, host='0.0.0.0', port=port, debug=debug_mode, allow_unsafe_werkzeug=True, use_reloader=False)
    else:
        log_error("Failed to initialize database pool")

