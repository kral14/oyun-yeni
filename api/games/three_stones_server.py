"""
Three Stones Game Server
Handles all WebSocket connections and game logic for the 3 Taş (Three Stones) game
"""

from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
import hashlib
import secrets
import os
from datetime import datetime, timedelta, UTC
import json
import time
import string
import random
import threading
import logging

# Global references to be set by main server
socketio = None
db_pool = None
log_info = None
log_error = None
log_debug = None
log_warning = None

# Game rooms storage
rooms = {}  # {room_code: {name: str, password_hash: str, players: {orange: player_id, blue: player_id}, game_state: {...}, started: bool, created_at: datetime, creator: player_id}}

# Player sessions
players = {}  # {player_id: {username, room_code, color}}

# Disconnect timers - give players time to reconnect before removing them
disconnect_timers = {}  # {player_id: timer}

# Board graph (nodes and edges for 10-node layout)
# 10-node board structure:
# Left side: 10 (top), 9 (middle), 8 (bottom)
# Right side: 5 (top), 6 (middle), 7 (bottom)
# Center horizontal: 9 <-> 4 <-> 1 <-> 6
# Upper center: 4 <-> 3 (up from horizontal, left side)
# Lower center: 1 <-> 2 (down from horizontal, right side)
BOARD_NODES = {
    '10': {'id': '10', 'neighbors': ['9']},
    '9': {'id': '9', 'neighbors': ['10', '8', '4']},
    '8': {'id': '8', 'neighbors': ['9']},
    '5': {'id': '5', 'neighbors': ['6']},
    '6': {'id': '6', 'neighbors': ['5', '7', '1']},
    '7': {'id': '7', 'neighbors': ['6']},
    '4': {'id': '4', 'neighbors': ['9', '1', '3']},
    '1': {'id': '1', 'neighbors': ['4', '6', '2']},
    '3': {'id': '3', 'neighbors': ['4']},
    '2': {'id': '2', 'neighbors': ['1']}
}

def initialize(sio, pool, logging_funcs):
    """Initialize the Three Stones game server with dependencies"""
    global socketio, db_pool, log_info, log_error, log_debug, log_warning
    socketio = sio
    db_pool = pool
    if logging_funcs and len(logging_funcs) == 4:
        log_info, log_error, log_debug, log_warning = logging_funcs
    register_handlers()

def register_handlers():
    """Register all WebSocket event handlers"""
    socketio.on_event('connect', handle_connect)
    socketio.on_event('disconnect', handle_disconnect)
    socketio.on_event('leave_room', handle_leave_room)
    socketio.on_event('delete_room', handle_delete_room)
    socketio.on_event('create_room', handle_create_room)
    socketio.on_event('join_room', handle_join_room)
    socketio.on_event('rejoin_room', handle_rejoin_room)
    socketio.on_event('get_lobby_list', handle_get_lobby_list)
    socketio.on_event('start_game', handle_start_game)
    socketio.on_event('make_move', handle_make_move)
    # Dice roll to decide who starts
    socketio.on_event('roll_dice', handle_roll_dice)
    socketio.on_event('request_roll', handle_request_roll)

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
        log_error("Error getting user ID", e, {'username': username})
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
        log_debug("Room saved to database", {'room_code': room_code, 'room_name': room_name})
    except Exception as e:
        log_error("Error saving room to database", e, {'room_code': room_code, 'room_name': room_name})
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
        log_debug("Room player updated in database", {'room_code': room_code, 'player_color': player_color, 'username': player_username})
    except Exception as e:
        log_error("Error updating room player in database", e, {'room_code': room_code, 'player_color': player_color})
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
        log_debug("Game marked as started in database", {'room_code': room_code})
    except Exception as e:
        log_error("Error starting game in database", e, {'room_code': room_code})
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
        log_info("Room deleted from database", {'room_code': room_code})
    except Exception as e:
        log_error("Error deleting room from database", e, {'room_code': room_code})
        if conn:
            db_pool.putconn(conn)

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
            
            # Ensure created_at is timezone-aware
            if created_at:
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=UTC)
            
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
            log_info("Room loaded from database", {'room_code': room_code, 'name': room_name})
            return room
        
        return None
    except Exception as e:
        log_error("Error loading room from database", e, {'room_code': room_code})
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
            
            # Ensure created_at is timezone-aware
            if created_at:
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=UTC)
            
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
        
        log_info("Loaded active rooms from database", {'count': len(results)})
    except Exception as e:
        log_error("Error loading active rooms from database", e)
        if conn:
            db_pool.putconn(conn)

def cleanup_empty_rooms():
    """Remove empty rooms - DISABLED: Rooms are now persistent and only deleted by creator"""
    # Rooms are now persistent and only deleted when creator explicitly deletes them
    # This function is kept for compatibility but does nothing
    log_debug("cleanup_empty_rooms called but disabled - rooms are now persistent", {
        'total_rooms_in_memory': len(rooms)
    })
    pass

def get_lobby_list():
    """Get list of available rooms for lobby - includes rooms from database"""
    lobby_rooms = []
    
    log_debug("Getting lobby list", {
        'total_rooms_in_memory': len(rooms)
    })
    
    # Get all active rooms from database (not game_over)
    db_room_codes = set()
    if db_pool:
        try:
            conn = db_pool.getconn()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT room_code, room_name, password_hash, creator_user_id, creator_socket_id,
                       orange_socket_id, blue_socket_id, started, game_over
                FROM three_stones_rooms
                WHERE game_over = FALSE
                ORDER BY created_at DESC
            """)
            results = cursor.fetchall()
            cursor.close()
            db_pool.putconn(conn)
            
            for result in results:
                room_code_db, room_name, password_hash, creator_user_id, creator_socket_id, \
                orange_socket_id, blue_socket_id, started, game_over = result
                
                db_room_codes.add(room_code_db)
                
                # Load room from memory if exists, otherwise create from DB
                if room_code_db in rooms:
                    room = rooms[room_code_db]
                else:
                    # Load room from database
                    room = load_room_from_db(room_code_db)
                    if not room:
                        continue
                
                # Count active players (players that are still connected)
                # Check both memory and database - use memory as source of truth for active players
                active_players_count = 0
                if room_code_db in rooms:
                    # Use memory room if exists (most up-to-date)
                    memory_room = rooms[room_code_db]
                    if memory_room.get('players'):
                        for color, pid in memory_room['players'].items():
                            if pid in players and players[pid].get('room_code') == room_code_db:
                                active_players_count += 1
                elif room.get('players'):
                    # Fallback to loaded room if not in memory
                    for color, pid in room['players'].items():
                        if pid in players and players[pid].get('room_code') == room_code_db:
                            active_players_count += 1
                else:
                    # Check database socket IDs - but only count if they're actually connected
                    if orange_socket_id and orange_socket_id in players:
                        if players[orange_socket_id].get('room_code') == room_code_db:
                            active_players_count += 1
                    if blue_socket_id and blue_socket_id in players:
                        if players[blue_socket_id].get('room_code') == room_code_db:
                            active_players_count += 1
                
                # Get creator username if available
                creator_username = None
                if creator_user_id and db_pool:
                    try:
                        conn = db_pool.getconn()
                        cursor = conn.cursor()
                        cursor.execute("SELECT username FROM users WHERE id = %s", (creator_user_id,))
                        user_result = cursor.fetchone()
                        if user_result:
                            creator_username = user_result[0]
                        cursor.close()
                        db_pool.putconn(conn)
                    except:
                        if conn:
                            db_pool.putconn(conn)
                
                lobby_rooms.append({
                    'code': room_code_db,
                    'name': room_name or room_code_db,
                    'players': active_players_count,
                    'maxPlayers': 2,
                    'hasPassword': password_hash is not None,
                    'started': started or False,
                    'creatorSocketId': creator_socket_id,
                    'creatorUserId': creator_user_id,
                    'creatorUsername': creator_username
                })
            
            log_debug("Loaded rooms from database", {
                'db_rooms_count': len(results),
                'lobby_rooms_count': len(lobby_rooms)
            })
        except Exception as e:
            log_error("Error loading rooms from database for lobby list", e)
            if conn:
                db_pool.putconn(conn)
    
    # Also include rooms from memory that might not be in database yet
    for room_code, room in rooms.items():
        if room_code not in db_room_codes:
            # Count active players (only connected players)
            active_players_count = 0
            if room.get('players'):
                for color, pid in room['players'].items():
                    # Only count if player is actually connected and in this room
                    if pid in players and players[pid].get('room_code') == room_code:
                        active_players_count += 1
            
            lobby_rooms.append({
                'code': room_code,
                'name': room.get('name', room_code),
                'players': active_players_count,
                'maxPlayers': 2,
                'hasPassword': room.get('password_hash') is not None,
                'started': room.get('started', False),
                'creatorSocketId': room.get('creator'),
                'creatorUserId': None,
                'creatorUsername': None
            })
    
    log_debug("Lobby list generated", {
        'total_lobby_rooms': len(lobby_rooms),
        'rooms_from_db': len(db_room_codes),
        'rooms_from_memory_only': len(rooms) - len(db_room_codes)
    })
    
    return lobby_rooms

# WebSocket Event Handlers
def handle_connect():
    # Use debug level for connection logs to reduce noise
    log_debug("Client connected", {'socket_id': request.sid, 'remote_addr': request.remote_addr})

def handle_disconnect():
    player_id = request.sid
    room_code = None
    username = None
    color = None
    
    log_info("=== DISCONNECT REQUEST ===", {
        'player_id': player_id,
        'player_in_players': player_id in players,
        'current_rooms_count': len(rooms),
        'current_players_count': len(players)
    })
    
    if player_id in players:
        player_info = players[player_id]
        room_code = player_info.get('room_code')
        username = player_info.get('username', 'Unknown')
        color = player_info.get('color')
        
        log_info("Player found in players dict", {
            'player_id': player_id,
            'username': username,
            'room_code': room_code,
            'color': color
        })
        
        if room_code and room_code in rooms:
            room = rooms[room_code]
            
            # Cancel any existing disconnect timer for this player
            if player_id in disconnect_timers:
                timer = disconnect_timers[player_id]
                timer.cancel()
                del disconnect_timers[player_id]
                log_info("Cancelled existing disconnect timer", {'player_id': player_id, 'room_code': room_code})
            
            # Set a timer to remove player after 10 seconds if they don't reconnect
            # This gives time for page refresh/reconnection
            def remove_player_after_timeout():
                # Check if player still not reconnected (not in players dict with same room)
                if player_id not in players or players[player_id].get('room_code') != room_code:
                    log_info("Removing player after disconnect timeout", {
                        'player_id': player_id,
                        'username': username,
                        'room_code': room_code,
                        'color': color
                    })
                    
                    # Remove player from room if still in room
                    if room_code in rooms:
                        room = rooms[room_code]
                        if color in room['players']:
                            # Check if this is still the disconnected player
                            if room['players'][color] == player_id:
                                del room['players'][color]
                                
                                log_info("Player removed from room after timeout", {
                                    'player_id': player_id,
                                    'room_code': room_code,
                                    'color': color,
                                    'room_players_after': list(room['players'].keys()),
                                    'room_players_count_after': len(room['players']),
                                    'room_is_empty': len(room['players']) == 0
                                })
                                
                                # Get updated players list (only remaining players)
                                players_info = {}
                                for remaining_color, pid in room['players'].items():
                                    if pid in players:
                                        players_info[remaining_color] = players[pid]['username']
                                
                                # Notify remaining players
                                socketio.emit('player_left', {
                                    'color': color,
                                    'players': players_info
                                }, room=room_code)
                                
                                log_info("player_left event sent to remaining players (disconnect timeout)", {
                                    'room_code': room_code,
                                    'left_color': color,
                                    'remaining_players_info': players_info,
                                    'remaining_players_count': len(players_info)
                                })
                                
                                # Reset game if started
                                if room.get('started'):
                                    room['started'] = False
                                    room['game_state'] = None
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
                                            log_error("Error resetting game", e, {'room_code': room_code})
                                            if conn:
                                                db_pool.putconn(conn)
                                
                                # Update database
                                if not room['players']:
                                    log_info("Room is now empty but kept for creator to delete", {
                                        'room_code': room_code,
                                        'creator': room.get('creator')
                                    })
                                    socketio.emit('lobby_list', {'rooms': get_lobby_list()})
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
                                                log_error("Error updating room player", e, {'room_code': room_code, 'color': 'orange'})
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
                                                log_error("Error updating room player", e, {'room_code': room_code, 'color': 'blue'})
                                                if conn:
                                                    db_pool.putconn(conn)
                                    
                                    # Broadcast lobby update
                                    socketio.emit('lobby_list', {'rooms': get_lobby_list()})
                    
                    # Remove from disconnect timers
                    if player_id in disconnect_timers:
                        del disconnect_timers[player_id]
            
            # Set timer for 10 seconds
            timer = threading.Timer(10.0, remove_player_after_timeout)
            disconnect_timers[player_id] = timer
            timer.start()
            
            log_info("Disconnect timer started - player will be removed after 10 seconds if not reconnected", {
                'player_id': player_id,
                'username': username,
                'room_code': room_code,
                'color': color
            })
            
            # Don't remove player immediately - keep them in room for potential reconnection
            # Only remove from active players dict (so they can't make moves)
            # But keep room entry in database for reconnection
            # Note: We don't remove from room['players'] immediately - that happens in timer
        
        # Remove player from active players dict (but keep room entry for reconnection)
        # This prevents them from making moves but allows reconnection
        if player_id in players:
            del players[player_id]
    
    # Use debug level for disconnect logs unless player was in a room
    if room_code:
        log_info("Client disconnected (will be removed after timeout if not reconnected)", {
            'socket_id': request.sid,
            'player_id': player_id,
            'room_code': room_code
        })
    else:
        log_debug("Client disconnected", {'socket_id': request.sid, 'player_id': player_id})

def handle_leave_room(data):
    player_id = request.sid
    room_code = data.get('roomCode', '')
    
    log_info("=== LEAVE ROOM REQUEST ===", {
        'player_id': player_id,
        'room_code': room_code,
        'player_in_players': player_id in players,
        'room_in_rooms': room_code in rooms,
        'current_rooms_count': len(rooms),
        'current_players_count': len(players)
    })
    
    if player_id in players and room_code in rooms:
        player_info = players[player_id]
        room = rooms[room_code]
        color = player_info.get('color')
        
        log_info("Player leaving room - before removal", {
            'player_id': player_id,
            'username': player_info.get('username'),
            'room_code': room_code,
            'color': color,
            'room_players_before': list(room['players'].keys()),
            'room_players_count_before': len(room['players']),
            'room_name': room.get('name'),
            'room_started': room.get('started', False)
        })
        
        # Remove player from room
        if color in room['players']:
            del room['players'][color]
        
        log_info("Player removed from room", {
            'player_id': player_id,
            'room_code': room_code,
            'color': color,
            'room_players_after': list(room['players'].keys()),
            'room_players_count_after': len(room['players']),
            'room_is_empty': len(room['players']) == 0
        })
        
        # Remove player from players dict BEFORE leaving socket room
        # so we can notify remaining players without including the leaving player
        if player_id in players:
            del players[player_id]
        
        log_info("Player removed from players dict", {
            'player_id': player_id,
            'remaining_players_count': len(players)
        })
        
        # Leave socket room BEFORE notifying other players
        # This ensures the leaving player won't receive the player_left event
        leave_room(room_code)
        
        log_info("Player left socket room", {
            'player_id': player_id,
            'room_code': room_code
        })
        
        # Get updated players list (only remaining players)
        players_info = {}
        for remaining_color, pid in room['players'].items():
            if pid in players:
                players_info[remaining_color] = players[pid]['username']
        
        log_info("Remaining players in room", {
            'room_code': room_code,
            'remaining_players_info': players_info,
            'remaining_players_count': len(players_info),
            'room_players_dict': room['players']
        })
        
        # Notify remaining players with updated player list
        # Only remaining players will receive this since leaving player already left the room
        socketio.emit('player_left', {
            'color': color,
            'players': players_info
        }, room=room_code)
        
        log_info("player_left event sent to remaining players", {
            'room_code': room_code,
            'left_color': color,
            'remaining_players_info': players_info,
            'remaining_players_count': len(players_info)
        })
        
        # Reset game if started (so room can be reused)
        # Always reset game state when player leaves, even if game wasn't started yet
        room['started'] = False
        room['game_state'] = None
        room['dice'] = {}  # Reset dice state
        
        # Update database to mark game as not started and clear game state
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
                log_info("Game state reset in database", {'room_code': room_code})
            except Exception as e:
                log_error("Error resetting game", e, {'room_code': room_code})
                if conn:
                    db_pool.putconn(conn)
        
        # Update room player in database (remove player) - ALWAYS update, even if room is empty
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
                    log_info("Orange player removed from database", {'room_code': room_code})
                except Exception as e:
                    log_error("Error updating room player", e, {'room_code': room_code, 'color': 'orange'})
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
                    log_info("Blue player removed from database", {'room_code': room_code})
                except Exception as e:
                    log_error("Error updating room player", e, {'room_code': room_code, 'color': 'blue'})
                    if conn:
                        db_pool.putconn(conn)
        
        # Rooms are now persistent - don't delete empty rooms automatically
        # Only creator can delete rooms explicitly
        if not room['players']:
            log_info("Room is now empty but kept for creator to delete", {
                'room_code': room_code,
                'creator': room.get('creator')
            })
        
        # ALWAYS broadcast lobby update to all clients (not just room)
        # This ensures lobby list is updated immediately when player leaves
        def broadcast_lobby_update():
            time.sleep(0.1)  # Small delay to ensure database is updated
            lobby_list = get_lobby_list()
            socketio.emit('lobby_list', {'rooms': lobby_list})
            log_info("Lobby list broadcasted after player left", {
                'room_code': room_code,
                'lobby_rooms_count': len(lobby_list)
            })
        
        threading.Thread(target=broadcast_lobby_update, daemon=True).start()
        
        # Send confirmation to leaving player that they left successfully
        emit('room_left', {'roomCode': room_code})
        
        log_info("room_left event sent to leaving player", {
            'player_id': player_id,
            'room_code': room_code
        })
        
        log_info("=== PLAYER LEFT ROOM ===", {
            'room_code': room_code,
            'player_id': player_id,
            'left_color': color,
            'remaining_players_count': len(room['players']),
            'room_is_empty': len(room['players']) == 0,
            'room_started': room.get('started', False),
            'total_rooms_in_memory': len(rooms),
            'total_players_in_memory': len(players)
        })

def handle_delete_room(data):
    player_id = request.sid
    room_code = data.get('roomCode', '').upper()
    
    log_info("=== DELETE ROOM REQUEST ===", {
        'player_id': player_id,
        'room_code': room_code,
        'room_in_memory': room_code in rooms
    })
    
    # Load room from database if not in memory
    room = None
    is_creator = False
    
    if room_code in rooms:
        room = rooms[room_code]
        # Check if player is the creator by socket ID
        if room.get('creator') == player_id:
            is_creator = True
    else:
        # Load from database
        room = load_room_from_db(room_code)
        if not room:
            log_warning("Room not found for deletion", {'room_code': room_code, 'player_id': player_id})
            emit('error', {'message': 'Otaq tapılmadı'})
            return
    
    # Check if player is creator by checking database
    if db_pool:
        try:
            conn = db_pool.getconn()
            cursor = conn.cursor()
            # Get creator info from database
            cursor.execute("""
                SELECT creator_user_id, creator_socket_id
                FROM three_stones_rooms
                WHERE room_code = %s
            """, (room_code,))
            result = cursor.fetchone()
            cursor.close()
            db_pool.putconn(conn)
            
            if result:
                creator_user_id, creator_socket_id = result
                # Check by socket ID or user ID
                if creator_socket_id == player_id:
                    is_creator = True
                elif creator_user_id:
                    # Get user ID from username
                    username = None
                    if player_id in players:
                        username = players[player_id].get('username')
                    if username:
                        user_id = get_user_id_from_username(username)
                        if user_id == creator_user_id:
                            is_creator = True
        except Exception as e:
            log_error("Error checking creator in delete_room", e, {'room_code': room_code, 'player_id': player_id})
            if conn:
                db_pool.putconn(conn)
    
    if is_creator:
        log_info("Creator confirmed, deleting room", {
            'room_code': room_code,
            'player_id': player_id,
            'room_players_count': len(room.get('players', {})) if room else 0
        })
        
        # Notify all players in room
        socketio.emit('room_deleted', {'roomCode': room_code}, room=room_code)
        
        # Remove all players from room
        if room:
            for color, pid in list(room.get('players', {}).items()):
                if pid in players:
                    del players[pid]
                    log_info("Player removed from players dict during room deletion", {
                        'player_id': pid,
                        'color': color,
                        'room_code': room_code
                    })
        
        # Delete room from database
        delete_room_from_db(room_code)
        
        # Remove room from memory
        if room_code in rooms:
            del rooms[room_code]
        
        # Broadcast lobby update
        socketio.emit('lobby_list', {'rooms': get_lobby_list()})
        
        log_info("=== ROOM DELETED ===", {
            'room_code': room_code,
            'deleted_by': player_id,
            'total_rooms_in_memory': len(rooms),
            'total_players_in_memory': len(players)
        })
    else:
        log_warning("Non-creator tried to delete room", {
            'room_code': room_code,
            'player_id': player_id,
            'room_creator_socket': room.get('creator') if room else None
        })
        emit('error', {'message': 'Yalnız otaq yaradıcısı otağı silə bilər'})

def handle_create_room(data):
    player_id = request.sid
    username = data.get('username', 'Player')
    room_name = data.get('roomName', '')
    password = data.get('password')
    
    log_info("=== CREATE ROOM REQUEST ===", {
        'player_id': player_id,
        'username': username,
        'room_name': room_name,
        'has_password': bool(password),
        'current_rooms_count': len(rooms),
        'current_players_count': len(players)
    })
    
    if not room_name:
        log_warning("Create room failed: room name required", {'player_id': player_id, 'username': username})
        emit('error', {'message': 'Otaq adı tələb olunur'})
        return
    
    # Leave current room if in one
    if player_id in players:
        current_room_code = players[player_id].get('room_code')
        if current_room_code:
            log_info("Player leaving current room before creating new one", {
                'player_id': player_id,
                'username': username,
                'current_room_code': current_room_code
            })
            leave_data = {'roomCode': current_room_code}
            handle_leave_room(leave_data)
    
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
                log_error("Error checking room code in database", e, {'room_code': room_code, 'attempt': attempts})
                if conn:
                    db_pool.putconn(conn)
                break
        else:
            break
    
    if attempts >= max_attempts:
        log_error("Failed to generate unique room code", None, {'max_attempts': max_attempts})
        emit('error', {'message': 'Otaq yaradıla bilmədi'})
        return
    
    # Hash password if provided
    password_hash = None
    if password:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    # Create room
    room = {
        'name': room_name,
        'password_hash': password_hash,
        'players': {},
        'game_state': None,
        'started': False,
        'created_at': datetime.now(UTC),
        'creator': player_id
    }
    
    # Add creator as orange player
    room['players']['orange'] = player_id
    players[player_id] = {
        'username': username,
        'room_code': room_code,
        'color': 'orange'
    }
    
    log_info("Room structure created in memory", {
        'room_code': room_code,
        'room_name': room_name,
        'players_count': len(room['players']),
        'players': room['players'],
        'creator': player_id,
        'creator_color': 'orange'
    })
    
    # Save room to database
    save_room_to_db(room_code, room_name, password_hash, player_id, username)
    
    # Add room to memory
    rooms[room_code] = room
    
    log_info("Room added to memory", {
        'room_code': room_code,
        'total_rooms_in_memory': len(rooms),
        'room_players': list(room['players'].keys())
    })
    
    # Join socket room
    join_room(room_code)
    
    log_info("Player joined socket room", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'socket_room': room_code
    })
    
    # Notify player
    emit('room_created', {
        'roomCode': room_code,
        'roomName': room_name,
        'playerId': player_id,
        'playerColor': 'orange'
    })
    
    log_info("room_created event sent to player", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code
    })
    
    # Update players list
    players_info = {}
    for color, pid in room['players'].items():
        if pid in players:
            players_info[color] = players[pid]['username']
    
    log_info("Current room players info", {
        'room_code': room_code,
        'players_info': players_info,
        'players_count': len(players_info)
    })
    
    socketio.emit('player_joined', {'players': players_info}, room=room_code)
    
    log_info("player_joined event broadcasted to room", {
        'room_code': room_code,
        'players_info': players_info
    })
    
    # Broadcast lobby update to all clients
    def broadcast_lobby_update():
        time.sleep(0.1)
        lobby_list = get_lobby_list()
        log_info("Broadcasting lobby list update", {
            'room_code': room_code,
            'lobby_rooms_count': len(lobby_list),
            'lobby_rooms': lobby_list
        })
        socketio.emit('lobby_list', {'rooms': lobby_list})
    
    threading.Thread(target=broadcast_lobby_update, daemon=True).start()
    
    log_info("=== ROOM CREATED SUCCESSFULLY ===", {
        'room_code': room_code,
        'room_name': room_name,
        'creator': username,
        'player_id': player_id,
        'has_password': bool(password_hash),
        'players_count': len(room['players']),
        'total_rooms_in_memory': len(rooms),
        'total_players_in_memory': len(players)
    })

def handle_join_room(data):
    player_id = request.sid
    username = data.get('username', 'Player')
    room_code = data.get('roomCode', '').upper()
    password = data.get('password')
    
    log_info("=== JOIN ROOM REQUEST ===", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'has_password': bool(password),
        'room_exists_in_memory': room_code in rooms,
        'current_rooms_count': len(rooms),
        'current_players_count': len(players)
    })
    
    # Leave current room if in one
    if player_id in players:
        current_room_code = players[player_id].get('room_code')
        if current_room_code and current_room_code != room_code:
            log_info("Player leaving current room before joining new one", {
                'player_id': player_id,
                'username': username,
                'current_room_code': current_room_code,
                'new_room_code': room_code
            })
            leave_data = {'roomCode': current_room_code}
            handle_leave_room(leave_data)
    
    # Try to load room from database if not in memory
    if room_code not in rooms:
        log_info("Room not in memory, loading from database", {'room_code': room_code})
        room = load_room_from_db(room_code)
        if not room:
            log_warning("Room not found in database", {'room_code': room_code, 'player_id': player_id, 'username': username})
            emit('error', {'message': 'Otaq tapılmadı'})
            return
        log_info("Room loaded from database", {
            'room_code': room_code,
            'room_name': room.get('name'),
            'players_count': len(room.get('players', {})),
            'started': room.get('started', False)
        })
    else:
        room = rooms[room_code]
        log_info("Room found in memory", {
            'room_code': room_code,
            'room_name': room.get('name'),
            'players_count': len(room.get('players', {})),
            'players': list(room.get('players', {}).keys()),
            'started': room.get('started', False)
        })
    
    # Clean up disconnected players from room['players'] dict FIRST
    # This ensures room['players'] only contains active players before checking if room is full
    if room.get('players'):
        disconnected_colors = []
        for color, pid in room['players'].items():
            if pid not in players or players[pid].get('room_code') != room_code:
                disconnected_colors.append(color)
        for color in disconnected_colors:
            del room['players'][color]
            log_info("Removed disconnected player from room", {
                'room_code': room_code,
                'color': color
            })
    
    # Check if room is full - only count ACTIVE players (connected players)
    # After cleanup, room['players'] should only contain active players
    active_players_count = len(room.get('players', {}))
    
    if active_players_count >= 2:
        log_warning("Room is full (active players), cannot join", {
            'room_code': room_code,
            'player_id': player_id,
            'username': username,
            'active_players_count': active_players_count,
            'room_players_dict': room.get('players', {}),
            'room_players_keys': list(room.get('players', {}).keys())
        })
        emit('error', {'message': 'Otaq doludur'})
        return
    
    # Check password if room has one
    if room.get('password_hash'):
        if not password:
            emit('error', {'message': 'Otaq şifrə ilə qorunur'})
            return
        
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        if password_hash != room['password_hash']:
            emit('error', {'message': 'Yanlış şifrə'})
            return
    
    # Assign color (orange or blue)
    if 'orange' not in room['players']:
        player_color = 'orange'
    elif 'blue' not in room['players']:
        player_color = 'blue'
    else:
        emit('error', {'message': 'Otaq doludur'})
        return
    
    # Add player to room
    room['players'][player_color] = player_id
    players[player_id] = {
        'username': username,
        'room_code': room_code,
        'color': player_color
    }
    
    log_info("Player added to room in memory", {
        'room_code': room_code,
        'player_id': player_id,
        'username': username,
        'color': player_color,
        'room_players_count': len(room['players']),
        'room_players': list(room['players'].keys()),
        'total_players_in_memory': len(players)
    })
    
    # Update room player in database
    update_room_player_in_db(room_code, player_color, player_id, username)
    
    # Join socket room
    join_room(room_code)
    
    log_info("Player joined socket room", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'socket_room': room_code
    })
    
    log_info("=== PLAYER JOINED ROOM ===", {
        'room_code': room_code,
        'player_id': player_id,
        'username': username,
        'color': player_color,
        'total_players_in_room': len(room['players']),
        'room_players': list(room['players'].keys()),
        'room_started': room.get('started', False)
    })
    
    # Notify both players
    emit('room_joined', {
        'roomCode': room_code,
        'playerId': player_id,
        'playerColor': player_color
    })
    
    log_info("room_joined event sent to player", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code
    })
    
    # Update players list
    players_info = {}
    for color, pid in room['players'].items():
        if pid in players:
            players_info[color] = players[pid]['username']
    
    log_info("Current room players info after join", {
        'room_code': room_code,
        'players_info': players_info,
        'players_count': len(players_info)
    })
    
    socketio.emit('player_joined', {'players': players_info}, room=room_code)
    
    log_info("player_joined event broadcasted to room", {
        'room_code': room_code,
        'players_info': players_info,
        'room_players_count': len(room['players'])
    })
    
    # When second player joins, initialize game state but don't start yet
    # Wait for dice roll to determine who starts
    if len(room['players']) == 2:
        # Initialize game state (stones will be placed after dice roll)
        room['game_state'] = {
            'orangeStones': [
                {'id': 'orange-1', 'nodeId': 'LT', 'reachedGoal': False, 'number': 1},
                {'id': 'orange-2', 'nodeId': 'LM', 'reachedGoal': False, 'number': 2},
                {'id': 'orange-3', 'nodeId': 'LB', 'reachedGoal': False, 'number': 3}
            ],
            'blueStones': [
                {'id': 'blue-1', 'nodeId': 'RT', 'reachedGoal': False, 'number': 1},
                {'id': 'blue-2', 'nodeId': 'RM', 'reachedGoal': False, 'number': 2},
                {'id': 'blue-3', 'nodeId': 'RB', 'reachedGoal': False, 'number': 3}
            ],
            'currentTurn': 'orange',  # Will be set after dice roll
            'gameOver': False,
            'winner': None
        }
        room['started'] = False  # Don't mark as started yet - wait for dice roll
        room['dice'] = {}  # Initialize dice dict for rolls
        
        # Notify both players to show dice modal
        socketio.emit('game_start', {
            'gameState': room['game_state'],
            'waitForDice': True  # Signal that dice roll is needed
        }, room=room_code)
        
        log_info("Game state initialized, waiting for dice roll", {'room_code': room_code, 'players': len(room['players'])})
    
    # Broadcast lobby update to all clients
    def broadcast_lobby_update():
        time.sleep(0.1)
        socketio.emit('lobby_list', {'rooms': get_lobby_list()})
    threading.Thread(target=broadcast_lobby_update, daemon=True).start()

def handle_rejoin_room(data):
    """Handle reconnection to a room after page refresh"""
    player_id = request.sid
    room_code = data.get('roomCode', '').upper()
    username = data.get('username', 'Player')
    
    log_info("=== REJOIN ROOM REQUEST ===", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'room_exists_in_memory': room_code in rooms,
        'current_rooms_count': len(rooms),
        'current_players_count': len(players)
    })
    
    # Try to load room from database if not in memory
    if room_code not in rooms:
        log_info("Room not in memory, loading from database", {'room_code': room_code})
        room = load_room_from_db(room_code)
        if not room:
            log_warning("Room not found in database for rejoin", {'room_code': room_code, 'player_id': player_id, 'username': username})
            emit('error', {'message': 'Otaq tapılmadı'})
            return
        log_info("Room loaded from database for rejoin", {
            'room_code': room_code,
            'room_name': room.get('name'),
            'players_count': len(room.get('players', {})),
            'started': room.get('started', False)
        })
    else:
        room = rooms[room_code]
        log_info("Room found in memory for rejoin", {
            'room_code': room_code,
            'room_name': room.get('name'),
            'players_count': len(room.get('players', {})),
            'players': list(room.get('players', {}).keys()),
            'started': room.get('started', False)
        })
    
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
                    
                    # Check if user is creator (but don't grant creator privileges on rejoin)
                    # Creator info is kept for room deletion purposes, but player rejoins as regular player
                    if creator_user_id == user_id:
                        # is_creator is kept for informational purposes only
                        # Player rejoins as regular player, not as creator
                        is_creator = False
                
                # Restore game state from database if available
                if db_game_state and started:
                    try:
                        room['game_state'] = json.loads(db_game_state) if isinstance(db_game_state, str) else db_game_state
                        room['started'] = started
                    except:
                        pass
        except Exception as e:
            log_error("Error checking rejoin room", e, {'room_code': room_code, 'username': username})
    
    # If we couldn't determine color from database, try to find available slot
    if not player_color:
        if 'orange' not in room['players']:
            player_color = 'orange'
        elif 'blue' not in room['players']:
            player_color = 'blue'
        else:
            emit('error', {'message': 'Otaq doludur'})
            return
    
    # Cancel disconnect timer if exists (player is reconnecting)
    if player_id in disconnect_timers:
        timer = disconnect_timers[player_id]
        timer.cancel()
        del disconnect_timers[player_id]
        log_info("Cancelled disconnect timer - player reconnected", {
            'player_id': player_id,
            'username': username,
            'room_code': room_code
        })
    
    # Check if slot is already taken by another active player
    if player_color in room['players']:
        existing_player_id = room['players'][player_color]
        if existing_player_id in players and players[existing_player_id].get('room_code') == room_code:
            # Another active player is in this slot, can't rejoin
            emit('error', {'message': 'Otaq doludur'})
            return
        # Slot exists but player is disconnected, reclaim it
        # Check if this is the same player reconnecting (same socket ID in disconnect timer)
        if existing_player_id != player_id:
            # Different player - need to check if old player is still in disconnect timer
            # If old player has disconnect timer, they're still reconnecting
            # Otherwise, they've left and we can reclaim the slot
            log_info("Slot has different player, checking disconnect timer", {
                'existing_player_id': existing_player_id,
                'new_player_id': player_id,
                'room_code': room_code
            })
        del room['players'][player_color]
    
    log_info("Player rejoin details determined", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'player_color': player_color,
        'is_creator': is_creator,
        'room_started': room.get('started', False)
    })
    
    # Add player back to room
    room['players'][player_color] = player_id
    players[player_id] = {
        'username': username,
        'room_code': room_code,
        'color': player_color
    }
    
    log_info("Player added back to room in memory", {
        'room_code': room_code,
        'player_id': player_id,
        'username': username,
        'color': player_color,
        'room_players_count': len(room['players']),
        'room_players': list(room['players'].keys()),
        'total_players_in_memory': len(players)
    })
    
    # Update room player in database
    update_room_player_in_db(room_code, player_color, player_id, username)
    
    # Join socket room
    join_room(room_code)
    
    log_info("Player rejoined socket room", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'socket_room': room_code
    })
    
    # Notify player that they rejoined
    # Note: isCreator is always False on rejoin - creator rejoins as regular player
    # but can still delete empty room (checked by creator_user_id in database)
    emit('room_rejoined', {
        'roomCode': room_code,
        'playerId': player_id,
        'playerColor': player_color,
        'isCreator': False,  # Always False on rejoin - player rejoins as regular player
        'gameState': room.get('game_state') if room.get('started') else None
    })
    
    log_info("room_rejoined event sent to player", {
        'player_id': player_id,
        'username': username,
        'room_code': room_code,
        'is_creator': is_creator,
        'has_game_state': room.get('game_state') is not None
    })
    
    # Update players list
    players_info = {}
    for color, pid in room['players'].items():
        if pid in players:
            players_info[color] = players[pid]['username']
    
    log_info("Current room players info after rejoin", {
        'room_code': room_code,
        'players_info': players_info,
        'players_count': len(players_info)
    })
    
    socketio.emit('player_joined', {'players': players_info}, room=room_code)
    
    log_info("player_joined event broadcasted to room after rejoin", {
        'room_code': room_code,
        'players_info': players_info,
        'room_players_count': len(room['players'])
    })

def handle_roll_dice(data):
    """Handle dice rolls from players; broadcast to room and decide starter when both rolled"""
    player_id = request.sid
    try:
        roll = int(data.get('roll', 0) or 0)
    except Exception:
        roll = 0
    username = players.get(player_id, {}).get('username', 'Player')
    player_color = players.get(player_id, {}).get('color')
    room_code = players.get(player_id, {}).get('room_code')
    if not room_code or room_code not in rooms:
        emit('error', {'message': 'Otaq tapılmadı'})
        return
    room = rooms[room_code]
    if 'dice' not in room:
        room['dice'] = {}
    # Server-side clamp/randomize
    if roll < 1 or roll > 6:
        roll = random.randint(1, 6)
    room['dice'][player_id] = roll
    
    # Broadcast roll to room with player color
    socketio.emit('dice_roll', {
        'username': username,
        'roll': roll,
        'color': player_color
    }, room=room_code)
    
    log_info("Dice roll received", {
        'room_code': room_code,
        'player_id': player_id,
        'username': username,
        'color': player_color,
        'roll': roll
    })
    
    # If both players present and rolled
    if len(room.get('players', {})) == 2:
        orange_id = room['players'].get('orange')
        blue_id = room['players'].get('blue')
        if orange_id in room['dice'] and blue_id in room['dice']:
            o = room['dice'][orange_id]
            b = room['dice'][blue_id]
            if o == b:
                # Tie - reset dice and ask to roll again
                room['dice'] = {}
                socketio.emit('dice_result', {
                    'rolls': {'orange': o, 'blue': b},
                    'starter': None,
                    'tie': True
                }, room=room_code)
                log_info("Dice tie - resetting", {'room_code': room_code, 'orange': o, 'blue': b})
                return
            
            # Determine starter
            starter = 'orange' if o > b else 'blue'
            
            # Update game state
            if room.get('game_state'):
                room['game_state']['currentTurn'] = starter
                room['started'] = True  # Mark game as started after dice roll
                
                # Save to database
                if db_pool:
                    try:
                        conn = db_pool.getconn()
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE three_stones_rooms 
                            SET started = TRUE, started_at = %s, game_state = %s
                            WHERE room_code = %s
                        """, (datetime.now(UTC), json.dumps(room['game_state']), room_code))
                        conn.commit()
                        cursor.close()
                        db_pool.putconn(conn)
                    except Exception as e:
                        log_error("Error updating game state after dice", e, {'room_code': room_code})
                        if conn:
                            db_pool.putconn(conn)
            
            # Send dice result with both rolls and starter
            socketio.emit('dice_result', {
                'rolls': {'orange': o, 'blue': b},
                'starter': starter
            }, room=room_code)
            
            # Send updated game state
            if room.get('game_state'):
                socketio.emit('game_state', {'gameState': room['game_state']}, room=room_code)
            
            log_info("Dice result determined", {
                'room_code': room_code,
                'orange_roll': o,
                'blue_roll': b,
                'starter': starter
            })

def handle_request_roll(data):
    """Authoritative server-side dice roll (no client-provided value)"""
    player_id = request.sid
    room_code = data.get('roomCode', '')
    
    if player_id not in players:
        emit('error', {'message': 'Oyunçu tapılmadı'})
        return
    
    player_info = players[player_id]
    if player_info.get('room_code') != room_code:
        emit('error', {'message': 'Otaq uyğun deyil'})
        return
    
    # Generate random roll and process it
    roll = random.randint(1, 6)
    handle_roll_dice({'roll': roll})

def handle_get_lobby_list(data):
    """Send lobby list to client"""
    player_id = request.sid
    lobby_list = get_lobby_list()
    
    log_info("=== GET LOBBY LIST REQUEST ===", {
        'player_id': player_id,
        'lobby_rooms_count': len(lobby_list),
        'lobby_rooms': lobby_list,
        'total_rooms_in_memory': len(rooms),
        'total_players_in_memory': len(players)
    })
    
    emit('lobby_list', {'rooms': lobby_list})
    
    log_info("lobby_list event sent to player", {
        'player_id': player_id,
        'rooms_count': len(lobby_list)
    })

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
            {'id': 'orange-1', 'nodeId': '10', 'reachedGoal': False, 'number': 1},
            {'id': 'orange-2', 'nodeId': '9', 'reachedGoal': False, 'number': 2},
            {'id': 'orange-3', 'nodeId': '8', 'reachedGoal': False, 'number': 3}
        ],
        'blueStones': [
            {'id': 'blue-1', 'nodeId': '5', 'reachedGoal': False, 'number': 1},
            {'id': 'blue-2', 'nodeId': '6', 'reachedGoal': False, 'number': 2},
            {'id': 'blue-3', 'nodeId': '7', 'reachedGoal': False, 'number': 3}
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
    to_node_id = data.get('toNodeId')
    new_x = data.get('x')
    new_y = data.get('y')
    reached_goal = data.get('reachedGoal', False)
    game_over = data.get('gameOver', False)
    winner = data.get('winner')
    
    # Validate and update move
    stones = game_state['orangeStones'] if player_color == 'orange' else game_state['blueStones']
    stone = next((s for s in stones if s['id'] == stone_id), None)
    
    if not stone:
        emit('error', {'message': 'Taş tapılmadı'})
        return
    
    # Validate move: check if target node is a neighbor and empty
    current_node_id = stone.get('nodeId')
    if not current_node_id or not to_node_id:
        emit('error', {'message': 'Hərəkət etmək üçün nöqtə seçilməyib'})
        return
    
    # Check if target node is a neighbor (1 step away)
    current_node = BOARD_NODES.get(current_node_id)
    if not current_node:
        emit('error', {'message': 'Cari nöqtə tapılmadı'})
        return
    
    if to_node_id not in current_node['neighbors']:
        emit('error', {'message': 'Yalnız qonşu boş nöqtəyə hərəkət edə bilərsiniz'})
        return
    
    # Check if target node is empty
    all_stones = game_state['orangeStones'] + game_state['blueStones']
    occupied_nodes = {s.get('nodeId') for s in all_stones if s.get('nodeId')}
    
    if to_node_id in occupied_nodes:
        emit('error', {'message': 'Bu nöqtə doludur'})
        return
    
    # Update stone position (use nodeId if provided, otherwise use x,y)
    if to_node_id:
        stone['nodeId'] = to_node_id
    if new_x is not None:
        stone['x'] = new_x
    if new_y is not None:
        stone['y'] = new_y
    
    # Check if stone reached goal
    # Orange goal: 5, 6, 7 (right side) | Blue goal: 10, 9, 8 (left side)
    goal_nodes = ['5', '6', '7'] if player_color == 'orange' else ['10', '9', '8']
    if to_node_id and to_node_id in goal_nodes:
        stone['reachedGoal'] = True
    elif reached_goal is not None:
        stone['reachedGoal'] = reached_goal
    
    # Check win condition - all stones must reach goal
    all_stones_reached = all(s.get('reachedGoal', False) for s in stones)
    if all_stones_reached:
        game_state['gameOver'] = True
        game_state['winner'] = player_color
    elif game_over:
        game_state['gameOver'] = game_over
        if winner:
            game_state['winner'] = winner
    
    # Switch turn only if game is not over
    if not game_state['gameOver']:
        game_state['currentTurn'] = 'blue' if player_color == 'orange' else 'orange'
    
    # Save to database
    if db_pool:
        try:
            conn = db_pool.getconn()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE three_stones_rooms 
                SET game_state = %s
                WHERE room_code = %s
            """, (json.dumps(game_state), room_code))
            conn.commit()
            cursor.close()
            db_pool.putconn(conn)
        except Exception as e:
            log_error("Error updating game state after move", e, {'room_code': room_code})
            if conn:
                db_pool.putconn(conn)
    
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

