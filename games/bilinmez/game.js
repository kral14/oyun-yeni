// 3 Taş Oyunu - İki Oyunçulu
class ThreeStonesGame {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.playerId = null;
        this.playerColor = null; // 'orange' or 'blue'
        this.isMyTurn = false;
        this.selectedStone = null;
        this.selectedRoomCode = null; // For join room modal
        this.isCreator = false; // Track if player created the room
        this.gameState = {
            orangeStones: [],
            blueStones: [],
            currentTurn: 'orange',
            gameOver: false,
            winner: null
        };
        
        this.init();
    }
    
    init() {
        // Set username
        const username = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
        const profileUsername = document.getElementById('profileUsername');
        if (profileUsername) {
            profileUsername.textContent = username;
        }
        
        // Button handlers
        document.getElementById('createRoomBtn').addEventListener('click', () => this.showCreateRoomModal());
        document.getElementById('refreshLobbyBtn').addEventListener('click', () => this.refreshLobby());
        document.getElementById('refreshLobbyBtn2').addEventListener('click', () => this.refreshLobby());
        const backToLobbyBtn = document.getElementById('backToLobbyBtn');
        if (backToLobbyBtn) {
            backToLobbyBtn.addEventListener('click', () => this.backToLobby());
        }
        
        const deleteRoomBtn = document.getElementById('deleteRoomBtn');
        if (deleteRoomBtn) {
            deleteRoomBtn.addEventListener('click', () => this.deleteRoom());
        }
        
        document.getElementById('homeBtn').addEventListener('click', () => {
            window.location.href = '/index.html';
        });
        
        // Modal handlers
        document.getElementById('cancelCreateBtn').addEventListener('click', () => this.closeCreateRoomModal());
        document.getElementById('cancelJoinBtn').addEventListener('click', () => this.closeJoinRoomModal());
        document.getElementById('createRoomForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createRoom();
        });
        document.getElementById('joinRoomForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.confirmJoinRoom();
        });
        
        // Initialize WebSocket connection
        this.connectWebSocket();
        
        // Initialize lobby after connection
        this.socket?.on('connect', () => {
            setTimeout(() => {
                this.refreshLobby();
                setInterval(() => this.refreshLobby(), 5000); // Refresh lobby every 5 seconds
            }, 500);
        });
        
        // Also try immediate refresh if already connected
        setTimeout(() => {
            if (this.socket && this.socket.connected) {
                this.refreshLobby();
                setInterval(() => this.refreshLobby(), 5000);
            }
        }, 1500);
        
        // Profile dropdown
        this.setupProfileDropdown();
        
        // Check login
        this.checkLogin();
    }
    
    checkLogin() {
        const isGitHubPages = window.location.hostname.includes('github.io');
        if (isGitHubPages) return;
        
        const loggedIn = localStorage.getItem('towerDefenseLoggedIn');
        const userId = localStorage.getItem('towerDefenseUserId');
        if (loggedIn !== 'true' || !userId) {
            window.location.href = '/login.html';
        }
    }
    
    setupProfileDropdown() {
        const profileInfo = document.querySelector('.profile-info');
        const profileDropdown = document.getElementById('profileDropdown');
        const editProfileBtn = document.getElementById('editProfileBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (profileInfo && profileDropdown) {
            profileInfo.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.style.display = profileDropdown.style.display === 'block' ? 'none' : 'block';
            });
            
            document.addEventListener('click', (e) => {
                if (!profileInfo.contains(e.target) && !profileDropdown.contains(e.target)) {
                    profileDropdown.style.display = 'none';
                }
            });
        }
        
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', () => {
                alert('Profil düzəltmə funksiyası tezliklə əlavə olunacaq.');
            });
        }
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.clear();
                window.location.href = '/login.html';
            });
        }
    }
    
    connectWebSocket() {
        // Use Socket.IO client library
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.host;
        const socketUrl = `${protocol}//${host}`;
        
        this.socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });
        
        this.socket.on('connect', () => {
            console.log('Socket.IO connected');
            
            // Try to reconnect to room if we were in one
            const savedRoomCode = localStorage.getItem('threeStonesRoomCode');
            const savedUsername = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
            
            if (savedRoomCode && savedRoomCode !== this.roomCode) {
                // Rejoin the room
                console.log('Reconnecting to room:', savedRoomCode);
                this.sendMessage('rejoin_room', {
                    roomCode: savedRoomCode,
                    username: savedUsername
                });
            }
            
            // Refresh lobby
            setTimeout(() => this.refreshLobby(), 500);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error);
        });
        
        // Listen for all Socket.IO events
        this.socket.onAny((eventName, ...args) => {
            const data = args[0] || {};
            this.handleMessage({ type: eventName, ...data });
        });
    }
    
    sendMessage(type, data = {}) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(type, data);
        }
    }
    
    handleMessage(data) {
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'room_created':
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = 'orange';
                this.isCreator = true; // Mark as creator
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                this.updateUI();
                setTimeout(() => this.refreshLobby(), 500); // Refresh lobby to show new room
                break;
                
            case 'room_joined':
            case 'room_rejoined':
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = data.playerColor || this.playerColor;
                this.isCreator = data.isCreator || false;
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                this.updateUI();
                
                // If game was already started, restore game state
                if (data.gameState) {
                    this.gameState = data.gameState;
                    this.startGame();
                }
                break;
                
            case 'player_joined':
                this.updatePlayers(data.players);
                break;
                
            case 'player_left':
                // Player left - update player list and reset game if started
                this.handlePlayerLeft(data);
                break;
                
            case 'game_start':
                this.gameState = data.gameState;
                this.startGame();
                break;
                
            case 'game_state':
                this.gameState = data.gameState;
                this.updateGameBoard();
                break;
                
            case 'move_made':
                this.gameState = data.gameState;
                this.updateGameBoard();
                break;
                
            case 'game_over':
                this.gameState = data.gameState;
                this.showGameOver(data.winner);
                break;
                
            case 'error':
                alert(data.message || 'Xəta baş verdi');
                break;
                
            case 'lobby_list':
                this.updateLobbyList(data.rooms || []);
                break;
                
            case 'room_deleted':
                if (data.message) {
                    alert(data.message);
                }
                this.backToLobby();
                break;
        }
    }
    
    updateLobbyList(rooms) {
        const lobbyList = document.getElementById('lobbyList');
        lobbyList.innerHTML = '';
        
        if (rooms.length === 0) {
            lobbyList.innerHTML = '<div style="text-align: center; color: #ccc; padding: 20px;">Hələ heç bir aktiv otaq yoxdur. İlk otağı siz yaradın!</div>';
            return;
        }
        
        // Filter rooms: active (not full) and full
        const activeRooms = rooms.filter(room => (room.players || 0) < 2);
        const fullRooms = rooms.filter(room => (room.players || 0) >= 2);
        
        // Show active rooms first (these can be joined)
        activeRooms.forEach(room => {
            const roomCard = document.createElement('div');
            roomCard.className = 'lobby-room-card';
            
            const hasPassword = room.hasPassword || false;
            const playerCount = room.players || 0;
            
            roomCard.innerHTML = `
                <div class="lobby-room-info">
                    <div class="lobby-room-name">${room.name || room.code}</div>
                    <div class="lobby-room-details">
                        Oyunçu: ${playerCount}/2
                        ${hasPassword ? '🔒 Şifrəli' : '🌐 Açıq'}
                    </div>
                    <div class="lobby-room-status" style="color: #4CAF50;">
                        ✅ Aktiv - Qoşula bilərsiniz
                    </div>
                </div>
                <div class="lobby-room-actions">
                    <button class="lobby-btn lobby-btn-join" 
                            onclick="window.game.showJoinRoomModal('${room.code}', '${(room.name || room.code).replace(/'/g, "\\'")}', ${hasPassword})">
                        Qoşul
                    </button>
                </div>
            `;
            
            lobbyList.appendChild(roomCard);
        });
        
        // Show separator if both active and full rooms exist
        if (fullRooms.length > 0 && activeRooms.length > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = 'width: 100%; height: 1px; background: rgba(255,255,255,0.1); margin: 15px 0;';
            lobbyList.appendChild(separator);
        }
        
        // Show full rooms (as reference, but can't join)
        fullRooms.forEach(room => {
            const roomCard = document.createElement('div');
            roomCard.className = 'lobby-room-card';
            roomCard.style.opacity = '0.6';
            
            const hasPassword = room.hasPassword || false;
            
            roomCard.innerHTML = `
                <div class="lobby-room-info">
                    <div class="lobby-room-name">${room.name || room.code}</div>
                    <div class="lobby-room-details">
                        Oyunçu: 2/2
                        ${hasPassword ? '🔒 Şifrəli' : '🌐 Açıq'}
                    </div>
                    <div class="lobby-room-status full">
                        ❌ Dolu
                    </div>
                </div>
                <div class="lobby-room-actions">
                    <button class="lobby-btn lobby-btn-join" disabled>
                        Dolu
                    </button>
                </div>
            `;
            
            lobbyList.appendChild(roomCard);
        });
    }
    
    showCreateRoomModal() {
        const modal = document.getElementById('createRoomModal');
        modal.style.display = 'block';
        document.getElementById('roomName').value = '';
        document.getElementById('roomPassword').value = '';
        
        // Close modal when clicking outside
        const closeOnOutside = (e) => {
            if (e.target === modal) {
                this.closeCreateRoomModal();
                modal.removeEventListener('click', closeOnOutside);
            }
        };
        modal.addEventListener('click', closeOnOutside);
    }
    
    closeCreateRoomModal() {
        document.getElementById('createRoomModal').style.display = 'none';
    }
    
    createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        const roomPassword = document.getElementById('roomPassword').value.trim();
        
        if (!roomName) {
            alert('Zəhmət olmasa otaq adını daxil edin.');
            return;
        }
        
        // Leave current room if in one
        if (this.roomCode && this.socket && this.socket.connected) {
            this.sendMessage('leave_room', { roomCode: this.roomCode });
        }
        
        this.connectWebSocket();
        
        setTimeout(() => {
            if (this.socket && this.socket.connected) {
                const username = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
                this.sendMessage('create_room', { 
                    username, 
                    roomName,
                    password: roomPassword || null
                });
                this.closeCreateRoomModal();
            } else {
                alert('Socket.IO bağlantısı qurulmadı. Zəhmət olmasa yenidən cəhd edin.');
            }
        }, 500);
    }
    
    refreshLobby() {
        if (!this.socket || !this.socket.connected) {
            this.connectWebSocket();
            setTimeout(() => this.refreshLobby(), 500);
            return;
        }
        
        this.sendMessage('get_lobby_list');
    }
    
    showJoinRoomModal(roomCode, roomName, hasPassword) {
        const modal = document.getElementById('joinRoomModal');
        document.getElementById('joinRoomName').textContent = roomName;
        document.getElementById('joinRoomPassword').value = '';
        
        const passwordGroup = document.getElementById('passwordGroup');
        const passwordInput = document.getElementById('joinRoomPassword');
        
        if (hasPassword) {
            passwordGroup.style.display = 'block';
            passwordInput.required = true;
        } else {
            passwordGroup.style.display = 'none';
            passwordInput.required = false;
        }
        
        this.selectedRoomCode = roomCode;
        modal.style.display = 'block';
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeJoinRoomModal();
            }
        }, { once: true });
    }
    
    closeJoinRoomModal() {
        document.getElementById('joinRoomModal').style.display = 'none';
        this.selectedRoomCode = null;
    }
    
    confirmJoinRoom() {
        if (!this.selectedRoomCode) return;
        
        const password = document.getElementById('joinRoomPassword').value.trim();
        
        // Leave current room if in one (different room)
        if (this.roomCode && this.roomCode !== this.selectedRoomCode && this.socket && this.socket.connected) {
            this.sendMessage('leave_room', { roomCode: this.roomCode });
        }
        
        this.connectWebSocket();
        
        setTimeout(() => {
            if (this.socket && this.socket.connected) {
                const username = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
                this.sendMessage('join_room', { 
                    roomCode: this.selectedRoomCode,
                    username,
                    password: password || null
                });
                this.closeJoinRoomModal();
            } else {
                alert('Socket.IO bağlantısı qurulmadı. Zəhmət olmasa yenidən cəhd edin.');
            }
        }, 500);
    }
    
    updateUI() {
        document.getElementById('roomInfo').style.display = 'block';
        document.getElementById('playerStatus').style.display = 'flex';
        document.getElementById('roomCode').textContent = this.roomCode;
        document.getElementById('waitingRoom').style.display = 'none';
        document.getElementById('gameBoardContainer').style.display = 'none';
        
        // Show/hide delete button based on creator status
        const deleteBtn = document.getElementById('deleteRoomBtn');
        if (deleteBtn) {
            deleteBtn.style.display = this.isCreator ? 'flex' : 'none';
        }
    }
    
    backToLobby() {
        // Leave room if in one
        if (this.roomCode && this.socket && this.socket.connected) {
            this.sendMessage('leave_room', { roomCode: this.roomCode });
        }
        
        // Clear saved room code from localStorage
        localStorage.removeItem('threeStonesRoomCode');
        
        // Reset game state
        this.roomCode = null;
        this.playerId = null;
        this.playerColor = null;
        this.selectedStone = null;
        this.isCreator = false;
        this.gameState = {
            orangeStones: [],
            blueStones: [],
            currentTurn: 'orange',
            gameOver: false,
            winner: null
        };
        
        // Update UI
        document.getElementById('roomInfo').style.display = 'none';
        document.getElementById('playerStatus').style.display = 'none';
        document.getElementById('waitingRoom').style.display = 'block';
        document.getElementById('gameBoardContainer').style.display = 'none';
        document.getElementById('playerOrangeName').textContent = '-';
        document.getElementById('playerBlueName').textContent = '-';
        
        // Refresh lobby
        this.refreshLobby();
    }
    
    deleteRoom() {
        if (!this.roomCode) return;
        
        if (!confirm('Otağı silmək istədiyinizə əminsiniz? Bu otaqdakı bütün oyunçular çıxarılacaq.')) {
            return;
        }
        
        if (this.socket && this.socket.connected) {
            this.sendMessage('delete_room', { roomCode: this.roomCode });
        }
    }
    
    updatePlayers(players) {
        // Update player names - show "-" if no player
        document.getElementById('playerOrangeName').textContent = players.orange || '-';
        document.getElementById('playerBlueName').textContent = players.blue || '-';
        
        // Show player status only when in a room
        document.getElementById('playerStatus').style.display = 'flex';
        
        // Game will start automatically when second player joins (handled by server)
    }
    
    handlePlayerLeft(data) {
        const leftColor = data.color;
        const players = data.players || {};
        
        // Update player list with server's updated list
        this.updatePlayers(players);
        
        // If game was started, reset to waiting room
        if (this.gameState && this.gameState.gameOver !== true) {
            // Game was in progress, reset to waiting room
            document.getElementById('gameBoardContainer').style.display = 'none';
            document.getElementById('waitingRoom').style.display = 'block';
            
            // Reset game state
            this.gameState = {
                orangeStones: [],
                blueStones: [],
                currentTurn: 'orange',
                gameOver: false,
                winner: null
            };
            
            // Show message
            alert('Oyunçu otaqdan çıxdı. Oyun dayandırıldı. Yeni oyunçu gözlənir.');
        }
        
        // Refresh lobby to update room status
        this.refreshLobby();
    }
    
    startGame() {
        document.getElementById('waitingRoom').style.display = 'none';
        document.getElementById('gameBoardContainer').style.display = 'block';
        
        // Use game state from server if available, otherwise initialize
        if (this.gameState && this.gameState.orangeStones && this.gameState.blueStones) {
            // Server sent game state, use it
            console.log('Using game state from server');
        } else {
            // Initialize stones positions if not provided
            this.initializeStones();
        }
        
        // Set turn indicator
        this.isMyTurn = this.playerColor === this.gameState.currentTurn;
        
        this.updateGameBoard();
    }
    
    initializeStones() {
        // Orange stones start positions (left side)
        const orangePositions = [
            { x: 80, y: 80 },   // Top
            { x: 80, y: 300 },  // Middle
            { x: 80, y: 520 }   // Bottom
        ];
        
        // Blue stones start positions (right side)
        const bluePositions = [
            { x: 470, y: 80 },  // Top
            { x: 470, y: 300 }, // Middle
            { x: 470, y: 520 }  // Bottom
        ];
        
        this.gameState.orangeStones = orangePositions.map((pos, index) => ({
            id: `orange-${index}`,
            x: pos.x,
            y: pos.y,
            reachedGoal: false
        }));
        
        this.gameState.blueStones = bluePositions.map((pos, index) => ({
            id: `blue-${index}`,
            x: pos.x,
            y: pos.y,
            reachedGoal: false
        }));
    }
    
    updateGameBoard() {
        const board = document.getElementById('gameBoard');
        
        // Remove existing stones
        const existingStones = board.querySelectorAll('.stone');
        existingStones.forEach(stone => stone.remove());
        
        // Draw orange stones
        this.gameState.orangeStones.forEach(stone => {
            const stoneEl = this.createStoneElement(stone, 'orange');
            board.appendChild(stoneEl);
        });
        
        // Draw blue stones
        this.gameState.blueStones.forEach(stone => {
            const stoneEl = this.createStoneElement(stone, 'blue');
            board.appendChild(stoneEl);
        });
        
        // Update turn indicator
        this.updateTurnIndicator();
    }
    
    createStoneElement(stone, color) {
        const stoneEl = document.createElement('div');
        stoneEl.className = `stone ${color}`;
        stoneEl.id = stone.id;
        stoneEl.style.left = `${stone.x - 25}px`;
        stoneEl.style.top = `${stone.y - 25}px`;
        
        if (this.playerColor === color && this.gameState.currentTurn === color && !this.gameState.gameOver) {
            stoneEl.style.cursor = 'pointer';
            stoneEl.addEventListener('click', () => this.selectStone(stone.id));
        }
        
        if (stone.reachedGoal) {
            stoneEl.classList.add('destination');
        }
        
        return stoneEl;
    }
    
    selectStone(stoneId) {
        if (this.gameState.currentTurn !== this.playerColor || this.gameState.gameOver) {
            return;
        }
        
        // Deselect previous stone
        if (this.selectedStone) {
            const prevStone = document.getElementById(this.selectedStone);
            if (prevStone) prevStone.classList.remove('selected');
        }
        
        // Select new stone
        this.selectedStone = stoneId;
        const stoneEl = document.getElementById(stoneId);
        if (stoneEl) {
            stoneEl.classList.add('selected');
            
            // Show possible moves
            this.showPossibleMoves(stoneId);
        }
    }
    
    showPossibleMoves(stoneId) {
        // TODO: Calculate and highlight valid move positions
        // For now, allow clicking on path positions
        const board = document.getElementById('gameBoard');
        board.addEventListener('click', this.handleBoardClick.bind(this), { once: true });
    }
    
    handleBoardClick(event) {
        if (event.target.classList.contains('stone') || event.target.classList.contains('path')) {
            return;
        }
        
        if (this.selectedStone) {
            const rect = document.getElementById('gameBoard').getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Check if position is valid (on path)
            if (this.isValidPosition(x, y)) {
                this.makeMove(this.selectedStone, x, y);
            } else {
                // Deselect stone
                const stoneEl = document.getElementById(this.selectedStone);
                if (stoneEl) stoneEl.classList.remove('selected');
                this.selectedStone = null;
            }
        }
    }
    
    isValidPosition(x, y) {
        // Check if position is on any path
        // Path coordinates:
        // Vertical left: 50-110, 50-550
        // Horizontal: 50-550, 300-360
        // Vertical right: 490-550, 50-550
        // etc.
        
        const paths = [
            { x1: 50, y1: 50, x2: 110, y2: 550 },      // Left vertical
            { x1: 50, y1: 300, x2: 550, y2: 360 },     // Horizontal
            { x1: 490, y1: 50, x2: 550, y2: 550 },     // Right vertical
            { x1: 50, y1: 300, x2: 110, y2: 400 },     // Middle left down
            { x1: 270, y1: 300, x2: 330, y2: 400 },    // Middle center down
            { x1: 490, y1: 300, x2: 550, y2: 400 },    // Middle right down
            { x1: 50, y1: 200, x2: 110, y2: 300 },     // Top left up
        ];
        
        for (const path of paths) {
            if (x >= path.x1 - 25 && x <= path.x2 + 25 && 
                y >= path.y1 - 25 && y <= path.y2 + 25) {
                return true;
            }
        }
        
        return false;
    }
    
    makeMove(stoneId, x, y) {
        this.sendMessage('make_move', {
            roomCode: this.roomCode,
            stoneId: stoneId,
            x: x,
            y: y
        });
        
        this.selectedStone = null;
    }
    
    updateTurnIndicator() {
        const orangePlayer = document.getElementById('playerOrange');
        const bluePlayer = document.getElementById('playerBlue');
        
        orangePlayer.classList.remove('current-turn');
        bluePlayer.classList.remove('current-turn');
        
        if (this.gameState.currentTurn === 'orange') {
            orangePlayer.classList.add('current-turn');
        } else {
            bluePlayer.classList.add('current-turn');
        }
        
        this.isMyTurn = this.gameState.currentTurn === this.playerColor;
    }
    
    showGameOver(winner) {
        const statusEl = document.getElementById('gameStatus');
        
        if (winner === this.playerColor) {
            statusEl.textContent = '🎉 Təbriklər! Siz qalib gəldiniz!';
            statusEl.className = 'game-status winner';
        } else {
            statusEl.textContent = '😔 Təəssüf, məğlub oldunuz.';
            statusEl.className = 'game-status loser';
        }
    }
}

        // Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new ThreeStonesGame();
    
    // Make backToLobby accessible globally for onclick handlers
    window.backToLobby = () => {
        if (window.game && window.game.backToLobby) {
            window.game.backToLobby();
        }
    };
});

