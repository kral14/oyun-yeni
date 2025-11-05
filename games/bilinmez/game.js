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
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.lobbyRefreshInterval = null;
        this.transitionAnimation = null; // Three.js animation instance
        this.isLeavingRoom = false; // Flag to prevent double animation when leaving room
        this.isTransitioning = false; // Flag to prevent multiple simultaneous transitions
        
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
        
        // Profile dropdown
        this.setupProfileDropdown();
        
        // Check login
        this.checkLogin();
        
        // Initialize screen states
        this.initializeScreenStates();
        
        // If we have a saved room code, start animation immediately
        // This prevents showing empty background on page refresh
        const savedRoomCode = localStorage.getItem('threeStonesRoomCode');
        if (savedRoomCode) {
            // Start animation immediately on page load
            // This will be visible until rejoin completes
            this.startTransitionAnimationImmediately();
            this.isTransitioning = true; // Mark as transitioning so other transitions wait
        }
    }
    
    initializeScreenStates() {
        // Set initial screen states
        const waitingRoom = document.getElementById('waitingRoom');
        const roomWaitingScreen = document.getElementById('roomWaitingScreen');
        const gameBoardContainer = document.getElementById('gameBoardContainer');
        
        // Check if we have a saved room code (page refresh scenario)
        const savedRoomCode = localStorage.getItem('threeStonesRoomCode');
        
        if (savedRoomCode) {
            // We have a saved room code, don't show lobby
            // Hide all screens initially - animation will show when rejoin completes
            // This prevents showing lobby before animation
            if (waitingRoom) {
                waitingRoom.style.display = 'none';
                waitingRoom.classList.remove('visible', 'hidden');
            }
            if (roomWaitingScreen) {
                roomWaitingScreen.style.display = 'none';
                roomWaitingScreen.classList.remove('visible', 'hidden');
            }
            if (gameBoardContainer) {
                gameBoardContainer.style.display = 'none';
                gameBoardContainer.classList.remove('visible', 'hidden');
            }
        } else {
            // No saved room code, show lobby by default
            if (waitingRoom) {
                waitingRoom.style.display = 'block';
                waitingRoom.classList.add('visible');
            }
            if (roomWaitingScreen) {
                roomWaitingScreen.style.display = 'none';
                roomWaitingScreen.classList.remove('visible', 'hidden');
            }
            if (gameBoardContainer) {
                gameBoardContainer.style.display = 'none';
                gameBoardContainer.classList.remove('visible', 'hidden');
            }
        }
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
        // If already connecting or connected, don't create new connection
        if (this.socket && (this.socket.connected || this.socket.connecting)) {
            return;
        }
        
        // Use Socket.IO client library
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.host;
        const socketUrl = `${protocol}//${host}`;
        
        this.socket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            timeout: 20000 // 20 seconds timeout
        });
        
        this.socket.on('connect', () => {
            console.log('Socket.IO connected');
            this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            
            // Try to reconnect to room if we were in one
            const savedRoomCode = localStorage.getItem('threeStonesRoomCode');
            const savedUsername = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
            
            if (savedRoomCode) {
                // Always try to rejoin if we have a saved room code
                // This handles page refresh scenario
                console.log('Reconnecting to room:', savedRoomCode);
                
                // Start animation immediately while waiting for rejoin
                // This prevents showing empty background
                this.startTransitionAnimationImmediately();
                
                // Small delay to ensure socket is fully connected
                setTimeout(() => {
                    if (this.socket && this.socket.connected) {
                        this.sendMessage('rejoin_room', {
                            roomCode: savedRoomCode,
                            username: savedUsername
                        });
                    }
                }, 100);
            }
            
            // Refresh lobby after connection
            setTimeout(() => {
                if (this.socket && this.socket.connected) {
                    this.refreshLobby();
                    // Start periodic lobby refresh
                    if (this.lobbyRefreshInterval) {
                        clearInterval(this.lobbyRefreshInterval);
                    }
                    this.lobbyRefreshInterval = setInterval(() => {
                        if (this.socket && this.socket.connected) {
                            this.refreshLobby();
                        }
                    }, 5000);
                }
            }, 500);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
            // Clear lobby refresh interval
            if (this.lobbyRefreshInterval) {
                clearInterval(this.lobbyRefreshInterval);
                this.lobbyRefreshInterval = null;
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error);
            this.reconnectAttempts++;
            
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('Max reconnection attempts reached');
                // Show error to user only after max attempts
                if (this.reconnectAttempts === this.maxReconnectAttempts) {
                    alert('Socket.IO bağlantısı qurula bilmədi. Zəhmət olmasa səhifəni yeniləyin.');
                }
            }
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
                // User joined room - show animation (user-initiated action)
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = data.playerColor || this.playerColor;
                this.isCreator = data.isCreator || false;
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                
                // Update navbar
                const roomInfoEl = document.getElementById('roomInfo');
                const playerStatusEl = document.getElementById('playerStatus');
                const roomCodeEl = document.getElementById('roomCode');
                if (roomInfoEl) roomInfoEl.style.display = 'block';
                if (playerStatusEl) playerStatusEl.style.display = 'flex';
                if (roomCodeEl) roomCodeEl.textContent = this.roomCode;
                
                // If game was already started, restore game state
                if (data.gameState) {
                    this.gameState = data.gameState;
                    this.startGame(true); // Show animation
                } else {
                    // Game not started - show animation to room waiting screen
                    // But wait a bit for game_start event to arrive (in case second player just joined)
                    // If game_start arrives within 800ms, it will cancel this and show game board
                    // Set a timeout to check if game_start arrived (but don't transition again)
                    this.roomJoinedTimeout = setTimeout(() => {
                        // Just clear the timeout, transition already happened
                        this.roomJoinedTimeout = null;
                    }, 800);
                    
                    // Show animation immediately (only once)
                    // If game_start arrives during transition, it will handle it
                    if (!this.isTransitioning) {
                        this.transitionToScreen('roomWaitingScreen', () => {
                            // Update room waiting screen after transition
                            const roomWaitingCodeEl = document.getElementById('roomWaitingCode');
                            if (roomWaitingCodeEl) roomWaitingCodeEl.textContent = this.roomCode;
                            
                            // If timeout is still pending, clear it (we've already transitioned)
                            if (this.roomJoinedTimeout) {
                                clearTimeout(this.roomJoinedTimeout);
                                this.roomJoinedTimeout = null;
                            }
                        });
                    }
                }
                break;
                
            case 'room_rejoined':
                // User rejoined room (after page refresh) - Show animation
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = data.playerColor || this.playerColor;
                this.isCreator = data.isCreator || false;
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                
                // Update navbar
                const roomInfoRejoin = document.getElementById('roomInfo');
                const playerStatusRejoin = document.getElementById('playerStatus');
                const roomCodeRejoin = document.getElementById('roomCode');
                
                if (roomInfoRejoin) roomInfoRejoin.style.display = 'block';
                if (playerStatusRejoin) playerStatusRejoin.style.display = 'flex';
                if (roomCodeRejoin) roomCodeRejoin.textContent = this.roomCode;
                
                // Animation is already running (started in init() or connectWebSocket())
                // Just complete the transition to target screen
                // If game was already started, restore game state
                if (data.gameState) {
                    this.gameState = data.gameState;
                    // Complete transition to game board (animation already running)
                    this.completeTransitionToScreen('gameBoardContainer', () => {
                        this.initializeGameBoard();
                    });
                } else {
                    // Game not started, complete transition to room waiting screen
                    this.completeTransitionToScreen('roomWaitingScreen', () => {
                        const roomWaitingCodeRejoin = document.getElementById('roomWaitingCode');
                        if (roomWaitingCodeRejoin) {
                            roomWaitingCodeRejoin.textContent = this.roomCode;
                        }
                    });
                }
                break;
                
            case 'player_joined':
                // Update players without animation - this is server notification, not screen transition
                this.updatePlayers(data.players);
                // Don't show animation - only show when user's own screen changes
                break;
                
            case 'player_left':
                // Player left - update player list and reset game if started
                this.handlePlayerLeft(data);
                break;
                
            case 'room_left':
                // We left the room - go back to lobby
                // Immediately hide navbar elements (room code and player names)
                const roomInfoNav = document.getElementById('roomInfo');
                const playerStatusNav = document.getElementById('playerStatus');
                const playerOrangeNameNav = document.getElementById('playerOrangeName');
                const playerBlueNameNav = document.getElementById('playerBlueName');
                
                if (roomInfoNav) roomInfoNav.style.display = 'none';
                if (playerStatusNav) playerStatusNav.style.display = 'none';
                if (playerOrangeNameNav) playerOrangeNameNav.textContent = '-';
                if (playerBlueNameNav) playerBlueNameNav.textContent = '-';
                
                // If we're already leaving (backToLobby was called), don't do anything
                // The backToLobby function already handles the transition
                if (this.isLeavingRoom) {
                    // Already handled by backToLobby, just clear the flag
                    this.isLeavingRoom = false;
                    break;
                }
                
                // If we didn't call backToLobby (e.g., kicked from room), handle it directly
                this.roomCode = null;
                this.playerId = null;
                this.playerColor = null;
                this.isCreator = false;
                this.gameState = {
                    orangeStones: [],
                    blueStones: [],
                    currentTurn: 'orange',
                    gameOver: false,
                    winner: null
                };
                localStorage.removeItem('threeStonesRoomCode');
                
                // Directly transition to lobby without animation (server-initiated leave)
                this.transitionToLobbyDirect();
                break;
                
            case 'game_start':
                // Game started by server - update without animation
                // Animation should only show on user-initiated screen changes
                console.log('game_start event received', data);
                
                if (data.gameState) {
                    this.gameState = data.gameState;
                } else if (data.game_state) {
                    // Handle both camelCase and snake_case
                    this.gameState = data.game_state;
                }
                
                console.log('Current gameState:', this.gameState);
                console.log('Current playerColor:', this.playerColor);
                console.log('isTransitioning:', this.isTransitioning);
                
                // Cancel any pending transition to room waiting screen
                // (in case room_joined event set a timeout)
                if (this.roomJoinedTimeout) {
                    clearTimeout(this.roomJoinedTimeout);
                    this.roomJoinedTimeout = null;
                    console.log('Cancelled room_joined timeout');
                }
                
                // If there's an ongoing transition, wait for it to finish before showing game board
                // This ensures the user sees the animation when entering the room
                // But don't show another animation - just show the board directly after transition
                if (this.isTransitioning) {
                    console.log('Waiting for ongoing transition to finish...');
                    // Store the game_start data to process after transition
                    this.pendingGameStart = true;
                    // Don't call showGameBoardAfterTransition here - it will be called when transition completes
                    // The transitionToScreen callback will check pendingGameStart and show board without animation
                    break;
                }
                
                // No transition ongoing, show game board directly
                // But check if we just finished a transition (roomWaitingScreen is visible)
                // In that case, we might have a race condition with the transition callback
                const roomWaitingScreen = document.getElementById('roomWaitingScreen');
                const isOnRoomWaitingScreen = roomWaitingScreen && roomWaitingScreen.style.display !== 'none';
                
                if (isOnRoomWaitingScreen) {
                    // We're on roomWaitingScreen, which means transition just finished
                    // Set a flag to ensure we show game board, but delay slightly to avoid race condition
                    // with transition callback
                    console.log('On roomWaitingScreen, delaying game board display to avoid race condition');
                    this.pendingGameStart = true;
                    setTimeout(() => {
                        if (this.pendingGameStart) {
                            this.pendingGameStart = false;
                            this.showGameBoardDirectly();
                            console.log('Game board shown after delay (no animation to avoid double animation)');
                        }
                    }, 100);
                } else {
                    // No transition ongoing and not on roomWaitingScreen, show game board directly
                    this.showGameBoardDirectly();
                }
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
        
        // Get current username to check if user is creator
        const currentUsername = localStorage.getItem('towerDefenseUsername') || '';
        const currentPlayerId = this.playerId || this.socket?.id;
        
        // Filter rooms: active (not full) and full
        const activeRooms = rooms.filter(room => (room.players || 0) < (room.maxPlayers || 2));
        const fullRooms = rooms.filter(room => (room.players || 0) >= (room.maxPlayers || 2));
        
        // Show active rooms first (these can be joined)
        activeRooms.forEach(room => {
            const roomCard = document.createElement('div');
            roomCard.className = 'lobby-room-card';
            
            const hasPassword = room.hasPassword || false;
            const playerCount = room.players || 0;
            const maxPlayers = room.maxPlayers || 2;
            
            // Check if current user is the creator
            const isCreator = (
                (room.creatorSocketId && room.creatorSocketId === currentPlayerId) ||
                (room.creatorUsername && room.creatorUsername === currentUsername) ||
                (room.creatorUserId && this.getUserId && this.getUserId() === room.creatorUserId)
            );
            
            // Show delete button if user is creator AND (room is empty OR this is the current room)
            // If player is in the room, they can delete it from lobby list or use the header delete button
            const isCurrentRoom = this.roomCode && this.roomCode === room.code;
            let deleteButton = '';
            if (isCreator && (playerCount === 0 || isCurrentRoom)) {
                deleteButton = `
                    <button class="lobby-btn lobby-btn-delete" 
                            onclick="window.game.deleteRoom('${room.code}')"
                            title="Otağı Sil">
                        🗑️
                    </button>
                `;
            }
            
            roomCard.innerHTML = `
                <div class="lobby-room-info">
                    <div class="lobby-room-name">${room.name || room.code}</div>
                    <div class="lobby-room-details">
                        Oyunçu: ${playerCount}/${maxPlayers}
                        ${hasPassword ? '🔒 Şifrəli' : '🌐 Açıq'}
                        ${room.started ? ' | 🎮 Oyun Başlayıb' : ''}
                    </div>
                    <div class="lobby-room-status" style="color: #4CAF50;">
                        ✅ Aktiv - Qoşula bilərsiniz
                    </div>
                </div>
                <div class="lobby-room-actions">
                    ${deleteButton}
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
    
    async createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        const roomPassword = document.getElementById('roomPassword').value.trim();
        
        if (!roomName) {
            alert('Zəhmət olmasa otaq adını daxil edin.');
            return;
        }
        
        // Ensure socket is connected
        if (!this.socket || !this.socket.connected) {
            this.connectWebSocket();
            
            // Wait for connection with timeout
            let attempts = 0;
            const maxAttempts = 20; // 10 seconds max wait (20 * 500ms)
            
            while ((!this.socket || !this.socket.connected) && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            
            if (!this.socket || !this.socket.connected) {
                alert('Socket.IO bağlantısı qurulmadı. Zəhmət olmasa səhifəni yeniləyin və yenidən cəhd edin.');
                return;
            }
        }
        
        // Leave current room if in one
        if (this.roomCode) {
            this.sendMessage('leave_room', { roomCode: this.roomCode });
        }
        
        // Create room
        const username = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
        this.sendMessage('create_room', { 
            username, 
            roomName,
            password: roomPassword || null
        });
        this.closeCreateRoomModal();
    }
    
    refreshLobby() {
        if (!this.socket || !this.socket.connected) {
            // Try to connect if not already connected
            if (!this.socket || (!this.socket.connecting && !this.socket.connected)) {
                this.connectWebSocket();
            }
            // Don't create infinite loop - just return if not connected
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
        
        // Animate transition to room waiting screen
        this.transitionToScreen('roomWaitingScreen', () => {
            // Update room waiting screen
            document.getElementById('roomWaitingCode').textContent = this.roomCode;
        });
        
        // Show/hide delete button based on creator status
        const deleteBtn = document.getElementById('deleteRoomBtn');
        if (deleteBtn) {
            deleteBtn.style.display = this.isCreator ? 'flex' : 'none';
        }
    }
    
    completeTransitionToScreen(targetScreenId, callback = null) {
        // Complete transition when animation is already running (for rejoin scenario)
        const screens = ['waitingRoom', 'roomWaitingScreen', 'gameBoardContainer'];
        const targetScreen = document.getElementById(targetScreenId);
        
        // Wait for animation to complete (800ms), then show target screen
        setTimeout(() => {
            // Hide all screens
            screens.forEach(screenId => {
                const screen = document.getElementById(screenId);
                if (screen) {
                    screen.style.display = 'none';
                    screen.classList.remove('hidden', 'visible');
                }
            });
            
            // Show target screen
            if (targetScreen) {
                const displayStyle = targetScreenId === 'gameBoardContainer' ? 'block' : 'flex';
                targetScreen.style.display = displayStyle;
                targetScreen.classList.remove('hidden');
                targetScreen.classList.add('visible');
            }
            
            // Stop animation and hide overlay
            this.stopTransitionAnimation();
            const overlay = document.getElementById('screenTransitionOverlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
            
            // Clear transition flag
            this.isTransitioning = false;
            
            // Call callback if provided
            if (callback) {
                callback();
            }
        }, 800); // Animation duration (800ms)
    }
    
    transitionToScreen(targetScreenId, callback = null) {
        // Prevent multiple simultaneous transitions
        if (this.isTransitioning) {
            console.log('Transition already in progress, skipping...');
            return;
        }
        
        this.isTransitioning = true;
        
        const screens = ['waitingRoom', 'roomWaitingScreen', 'gameBoardContainer'];
        const targetScreen = document.getElementById(targetScreenId);
        
        // Show transition overlay
        let overlay = document.getElementById('screenTransitionOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'screenTransitionOverlay';
            overlay.className = 'screen-transition';
            const animationContainer = document.createElement('div');
            animationContainer.id = 'transitionAnimation';
            overlay.appendChild(animationContainer);
            document.body.appendChild(overlay);
        }
        
        // Stop any existing animation first
        this.stopTransitionAnimation();
        
        // Fade out current screens
        screens.forEach(screenId => {
            const screen = document.getElementById(screenId);
            if (screen && screen.style.display !== 'none') {
                screen.classList.add('hidden');
                screen.classList.remove('visible');
            }
        });
        
        // Show overlay and start animation
        overlay.classList.add('active');
        this.startTransitionAnimation();
        
        // After animation duration, switch screens and fade in
        setTimeout(() => {
            // Hide all screens
            screens.forEach(screenId => {
                const screen = document.getElementById(screenId);
                if (screen) {
                    screen.style.display = 'none';
                    screen.classList.remove('hidden', 'visible');
                }
            });
            
            // Show target screen
            if (targetScreen) {
                const displayStyle = targetScreenId === 'gameBoardContainer' ? 'block' : 'flex';
                targetScreen.style.display = displayStyle;
                targetScreen.classList.remove('hidden');
                targetScreen.classList.add('visible');
            }
            
            // Stop animation and hide overlay
            this.stopTransitionAnimation();
            overlay.classList.remove('active');
            
            // Clear transition flag
            this.isTransitioning = false;
            
            // Check if there's a pending game_start event
            // If yes, show game board directly without animation (to avoid double animation)
            if (this.pendingGameStart) {
                // Clear the flag immediately to prevent race conditions
                const shouldShowGameBoard = this.pendingGameStart;
                this.pendingGameStart = false;
                
                // Show game board directly without animation
                if (shouldShowGameBoard) {
                    // Use requestAnimationFrame to ensure DOM is ready
                    requestAnimationFrame(() => {
                        this.showGameBoardDirectly();
                        console.log('Game board shown after transition (no animation to avoid double animation)');
                    });
                }
                // Don't call the original callback since we're showing game board
            } else {
                // Call callback if provided
                if (callback) {
                    callback();
                }
            }
        }, 800); // Animation duration (800ms)
    }
    
    startTransitionAnimationImmediately() {
        // Start animation immediately on page load (for rejoin scenario)
        // This prevents showing empty background
        const overlay = document.getElementById('screenTransitionOverlay');
        if (!overlay) {
            // Create overlay if it doesn't exist
            const newOverlay = document.createElement('div');
            newOverlay.id = 'screenTransitionOverlay';
            newOverlay.className = 'screen-transition';
            const animationContainer = document.createElement('div');
            animationContainer.id = 'transitionAnimation';
            newOverlay.appendChild(animationContainer);
            document.body.appendChild(newOverlay);
        }
        
        // Show overlay immediately
        const overlayEl = document.getElementById('screenTransitionOverlay');
        if (overlayEl) {
            overlayEl.classList.add('active');
            this.startTransitionAnimation();
        }
    }
    
    startTransitionAnimation() {
        // Stop existing animation if running
        this.stopTransitionAnimation();
        
        // Check if Three.js is loaded
        if (typeof THREE === 'undefined') {
            console.warn('Three.js not loaded, skipping animation');
            return;
        }
        
        const container = document.getElementById('transitionAnimation');
        if (!container) return;
        
        // Clear container
        container.innerHTML = '';
        
        // Get container dimensions - use full viewport size
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Calculate grid size based on viewport to fill entire screen
        // Use aspect ratio to determine grid dimensions
        const aspectRatio = width / height;
        
        // Keep rows fixed (10), only increase columns based on aspect ratio
        // This prevents performance issues while filling horizontal gaps
        const ROWS = 10; // Fixed row count
        const COLS = Math.max(15, Math.ceil(15 * aspectRatio)); // Dynamic column count based on aspect ratio
        
        const TILE_SIZE = 8;
        const TILE_GAP = 2;
        const BASE_DEPTH = 1;
        const SPEED_MIN = 0.09, SPEED_MAX = 0.10;
        
        const PALETTE = [
            '#00bcd4',  // Cyan
            '#0097a7',  // Koyu cyan
            '#ff9800',  // Turuncu
            '#2196F3',  // Mavi
            '#4CAF50'   // Yeşil
        ];
        
        // Ensure container takes full viewport
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.margin = '0';
        container.style.padding = '0';
        
        // Create renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        container.appendChild(renderer.domElement);
        
        const scene = new THREE.Scene();
        // Use wider FOV to see more of the scene and fill all gaps
        const camera = new THREE.PerspectiveCamera(80, width / height, 0.1, 5000);
        
        // Calculate total span for both dimensions
        const totalSpanX = (COLS-1)*(TILE_SIZE+TILE_GAP);
        const totalSpanY = (ROWS-1)*(TILE_SIZE+TILE_GAP);
        
        // Calculate camera distance to fill entire viewport without gaps
        const fovRad = (camera.fov * Math.PI) / 180;
        
        // Calculate distances for both dimensions
        const verticalFovRad = fovRad;
        const horizontalFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * aspectRatio);
        
        // Distance needed to see full width
        const halfWidth = totalSpanX / 2;
        const distanceForWidth = halfWidth / Math.tan(horizontalFovRad / 2);
        
        // Distance needed to see full height
        const halfHeight = totalSpanY / 2;
        const distanceForHeight = halfHeight / Math.tan(verticalFovRad / 2);
        
        // Use the smaller distance (closer camera) to ensure grid fills entire viewport
        // This ensures no gaps on sides
        const cameraDistance = Math.min(distanceForWidth, distanceForHeight) * 0.95; // 95% to ensure full coverage
        
        camera.position.set(0, 0, cameraDistance);
        camera.lookAt(0, 0, 0);
        
        // Handle window resize
        const handleResize = () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
            
            // Update camera distance based on new aspect ratio
            const newAspectRatio = newWidth / newHeight;
            const newFovRad = (camera.fov * Math.PI) / 180;
            
            const newVerticalFovRad = newFovRad;
            const newHorizontalFovRad = 2 * Math.atan(Math.tan(newFovRad / 2) * newAspectRatio);
            
            // Use stored totalSpanX and totalSpanY
            const newHalfWidth = totalSpanX / 2;
            const newHalfHeight = totalSpanY / 2;
            
            const newDistanceForWidth = newHalfWidth / Math.tan(newHorizontalFovRad / 2);
            const newDistanceForHeight = newHalfHeight / Math.tan(newVerticalFovRad / 2);
            
            const newCameraDistance = Math.min(newDistanceForWidth, newDistanceForHeight) * 0.95;
            camera.position.set(0, 0, newCameraDistance);
        };
        window.addEventListener('resize', handleResize);
        
        scene.add(new THREE.AmbientLight(0xffffff, 0.3));
        
        const tiles = [];
        const GROUP = new THREE.Group();
        scene.add(GROUP);
        
        // Create tiles - only increase columns, keep rows fixed
        for (let row=0; row<ROWS; row++){
            for (let col=0; col<COLS; col++){
                const geom = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, BASE_DEPTH);
                const colorIndex = (col + row) % PALETTE.length;
                const neonColor = PALETTE[colorIndex];
                
                const mat = new THREE.MeshBasicMaterial({
                    color: neonColor,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.9
                });
                
                const mesh = new THREE.Mesh(geom, mat);
                const spacing = TILE_SIZE + TILE_GAP;
                const x = (col - (COLS-1)/2) * spacing;
                const y = (row - (ROWS-1)/2) * spacing;
                mesh.position.set(x, y, 0);
                
                const phase = (x + y) * 0.015;
                const vel = THREE.MathUtils.randFloat(SPEED_MIN, SPEED_MAX);
                
                tiles.push({
                    mesh,
                    active: false,
                    y: y,
                    deltaY: y,
                    vel,
                    phase,
                    prevS: 0
                });
                
                GROUP.add(mesh);
            }
        }
        
        // Animation loop
        const boundsHalf = (ROWS-1)*(TILE_SIZE+TILE_GAP)*0.5;
        const minY = -boundsHalf, maxY = boundsHalf;
        
        let animationFrameId = null;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const t = performance.now()*0.0015;
            
            const base = 0.6, varScale = 0.4;
            for (const tile of tiles){
                if (!tile) continue;
                const s = base + varScale * Math.max(0, Math.sin(t*5 + tile.phase));
                tile.mesh.scale.z = s;
                
                const intensity = Math.max(0.6, Math.min(1.0, s));
                if (tile.mesh.material) {
                    tile.mesh.material.opacity = intensity;
                }
                
                const threshold = base + varScale*0.95;
                if (!tile.active && tile.prevS <= threshold && s > threshold){
                    if (Math.random() < 0.35){
                        tile.active = true;
                        tile.y += TILE_SIZE * 0.75;
                    }
                }
                tile.prevS = s;
            }
            
            for (const tile of tiles){
                if (!tile || !tile.active) continue;
                tile.y += tile.vel * 10;
                if (tile.y > maxY + TILE_SIZE){
                    tile.y = minY - TILE_SIZE*2;
                }
                tile.deltaY += (tile.y - tile.deltaY) * tile.vel;
                tile.mesh.position.y = tile.deltaY;
            }
            
            renderer.render(scene, camera);
        };
        
        animate();
        
        // Store animation reference
        this.transitionAnimation = {
            renderer,
            scene,
            camera,
            tiles,
            animate,
            animationFrameId,
            handleResize,
            stop: () => {
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
                if (handleResize) {
                    window.removeEventListener('resize', handleResize);
                }
                if (renderer) {
                    renderer.dispose();
                }
                if (container) {
                    container.innerHTML = '';
                }
            }
        };
    }
    
    stopTransitionAnimation() {
        if (this.transitionAnimation) {
            this.transitionAnimation.stop();
            this.transitionAnimation = null;
        }
        const container = document.getElementById('transitionAnimation');
        if (container) {
            container.innerHTML = '';
        }
    }
    
    backToLobby() {
        // Set flag to prevent double animation when room_left event is received
        this.isLeavingRoom = true;
        
        // Immediately hide navbar elements (room code and player names)
        const roomInfo = document.getElementById('roomInfo');
        const playerStatus = document.getElementById('playerStatus');
        const playerOrangeName = document.getElementById('playerOrangeName');
        const playerBlueName = document.getElementById('playerBlueName');
        
        if (roomInfo) roomInfo.style.display = 'none';
        if (playerStatus) playerStatus.style.display = 'none';
        if (playerOrangeName) playerOrangeName.textContent = '-';
        if (playerBlueName) playerBlueName.textContent = '-';
        
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
        
        // Animate transition to lobby (user clicked button)
        this.transitionToScreen('waitingRoom', () => {
            // Update UI after transition
            this.updateLobbyUI();
            // Refresh lobby after transition
            this.refreshLobby();
            // Clear flag after transition
            this.isLeavingRoom = false;
        });
    }
    
    transitionToLobbyDirect() {
        // Direct transition without animation (called from server event)
        // Reset UI elements
        const roomInfo = document.getElementById('roomInfo');
        const playerStatus = document.getElementById('playerStatus');
        const playerOrangeName = document.getElementById('playerOrangeName');
        const playerBlueName = document.getElementById('playerBlueName');
        
        if (roomInfo) roomInfo.style.display = 'none';
        if (playerStatus) playerStatus.style.display = 'none';
        if (playerOrangeName) playerOrangeName.textContent = '-';
        if (playerBlueName) playerBlueName.textContent = '-';
        
        // Update UI
        this.updateLobbyUI();
        
        // Refresh lobby
        this.refreshLobby();
    }
    
    updateLobbyUI() {
        // Ensure all screens are properly hidden/shown
        const waitingRoom = document.getElementById('waitingRoom');
        const roomWaitingScreen = document.getElementById('roomWaitingScreen');
        const gameBoardContainer = document.getElementById('gameBoardContainer');
        
        if (waitingRoom) {
            waitingRoom.style.display = 'block';
            waitingRoom.classList.remove('hidden');
            waitingRoom.classList.add('visible');
            // Reset any inline styles that might interfere
            waitingRoom.style.opacity = '';
            waitingRoom.style.transform = '';
            waitingRoom.style.pointerEvents = '';
        }
        
        if (roomWaitingScreen) {
            roomWaitingScreen.style.display = 'none';
            roomWaitingScreen.classList.remove('hidden', 'visible');
        }
        
        if (gameBoardContainer) {
            gameBoardContainer.style.display = 'none';
            gameBoardContainer.classList.remove('hidden', 'visible');
        }
        
        // Ensure lobby is visible and properly styled
        if (waitingRoom) {
            // Force a reflow to ensure styles are applied
            void waitingRoom.offsetWidth;
        }
    }
    
    deleteRoom(roomCode) {
        if (!roomCode && this.roomCode) {
            roomCode = this.roomCode;
        }
        
        if (!roomCode) {
            alert('Otaq kodu tapılmadı');
            return;
        }
        
        if (!confirm('Otağı silmək istədiyinizə əminsiniz? Bu əməliyyat geri alına bilməz.')) {
            return;
        }
        
        if (this.socket && this.socket.connected) {
            this.sendMessage('delete_room', { roomCode: roomCode });
        } else {
            alert('Socket.IO bağlantısı qurulmadı. Zəhmət olmasa yenidən cəhd edin.');
        }
    }
    
    deleteRoomOld() {
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
        
        // Update room waiting screen
        this.updateRoomWaitingScreen(players);
        
        // Game will start automatically when second player joins (handled by server)
    }
    
    updateRoomWaitingScreen(players) {
        // Update room waiting screen player names
        document.getElementById('roomWaitingOrange').textContent = players.orange || '-';
        document.getElementById('roomWaitingBlue').textContent = players.blue || '-';
        
        // Update player cards
        const orangeCard = document.getElementById('roomWaitingOrange').parentElement;
        const blueCard = document.getElementById('roomWaitingBlue').parentElement;
        
        if (players.orange) {
            orangeCard.classList.add('orange');
        } else {
            orangeCard.classList.remove('orange');
        }
        
        if (players.blue) {
            blueCard.classList.add('blue');
        } else {
            blueCard.classList.remove('blue');
        }
        
        // Update message based on player count
        const messageDiv = document.getElementById('roomWaitingMessage');
        if (players.orange && players.blue) {
            // Both players present - game should start
            messageDiv.textContent = 'Hər iki oyunçu hazırdır. Oyun başlayacaq...';
            messageDiv.style.display = 'none'; // Hide message when both players are ready
        } else if (players.orange || players.blue) {
            // One player waiting
            messageDiv.textContent = 'İkinci oyunçu gözlənir. Oyunçu gəldikdə oyun avtomatik başlayacaq.';
            messageDiv.style.display = 'block';
        } else {
            // No players (shouldn't happen, but just in case)
            messageDiv.textContent = 'Oyunçu gözlənir...';
            messageDiv.style.display = 'block';
        }
    }
    
    handlePlayerLeft(data) {
        const leftColor = data.color;
        const players = data.players || {};
        
        // Check if we (the current player) are the one who left
        // If we left, we shouldn't process this event (we should have received room_left instead)
        // If our color matches the left color, we are the one who left
        if (this.playerColor === leftColor) {
            // We are the one who left, don't process this event
            // The room_left event or our own leave logic should handle UI updates
            return;
        }
        
        // Update player list with server's updated list
        this.updatePlayers(players);
        this.updateRoomWaitingScreen(players);
        
        // If game was started, reset game state but stay in room
        if (this.gameState && this.gameState.gameOver !== true) {
            // Game was in progress, reset game state but keep player in room
            // Transition from game to room waiting screen WITHOUT animation
            // This is server notification, not user-initiated screen change
            document.getElementById('gameBoardContainer').style.display = 'none';
            document.getElementById('waitingRoom').style.display = 'none';
            document.getElementById('roomWaitingScreen').style.display = 'flex';
            
            // Make sure room info is still visible (user is still in room)
            document.getElementById('roomInfo').style.display = 'block';
            document.getElementById('playerStatus').style.display = 'flex';
            
            // Update room waiting message
            const messageDiv = document.getElementById('roomWaitingMessage');
            messageDiv.textContent = 'Oyunçu otaqdan çıxdı. Oyun dayandırıldı. Yeni oyunçu gözlənir. Yeni oyunçu gəldikdə oyun yenidən başladılacaq.';
            messageDiv.style.display = 'block';
            
            // Reset game state
            this.gameState = {
                orangeStones: [],
                blueStones: [],
                currentTurn: 'orange',
                gameOver: false,
                winner: null
            };
        }
        
        // Refresh lobby to update room status (but don't show lobby)
        this.refreshLobby();
    }
    
    startGame(showAnimation = true) {
        // Only show animation if explicitly requested (user-initiated actions)
        if (showAnimation) {
            // Animate transition to game board
            this.transitionToScreen('gameBoardContainer', () => {
                this.initializeGameBoard();
            });
        } else {
            // Direct transition without animation (for server notifications)
            document.getElementById('waitingRoom').style.display = 'none';
            document.getElementById('roomWaitingScreen').style.display = 'none';
            document.getElementById('gameBoardContainer').style.display = 'block';
            this.initializeGameBoard();
        }
    }
    
    showGameBoardDirectly() {
        // Force hide all screens first
        const waitingRoom = document.getElementById('waitingRoom');
        const roomWaitingScreen = document.getElementById('roomWaitingScreen');
        const gameBoardContainer = document.getElementById('gameBoardContainer');
        
        if (waitingRoom) {
            waitingRoom.style.display = 'none';
            waitingRoom.classList.remove('hidden', 'visible');
        }
        if (roomWaitingScreen) {
            roomWaitingScreen.style.display = 'none';
            roomWaitingScreen.classList.remove('hidden', 'visible');
        }
        
        // Force show game board
        if (gameBoardContainer) {
            gameBoardContainer.style.display = 'block';
            gameBoardContainer.classList.remove('hidden');
            gameBoardContainer.classList.add('visible');
            // Force visibility
            gameBoardContainer.style.opacity = '1';
            gameBoardContainer.style.transform = 'none';
            gameBoardContainer.style.pointerEvents = 'auto';
            console.log('Game board container displayed and forced visible');
        } else {
            console.error('gameBoardContainer element not found!');
        }
        
        // Ensure navbar is visible
        const roomInfo = document.getElementById('roomInfo');
        const playerStatus = document.getElementById('playerStatus');
        if (roomInfo) roomInfo.style.display = 'block';
        if (playerStatus) playerStatus.style.display = 'flex';
        
        // Initialize game board (this sets up the board and updates it)
        this.initializeGameBoard();
        console.log('Game board initialized');
        
        // Force a reflow to ensure rendering
        if (gameBoardContainer) {
            void gameBoardContainer.offsetWidth;
        }
    }
    
    showGameBoardAfterTransition() {
        // This is called after a transition completes
        // Show game board directly without another animation (to avoid double animation)
        this.pendingGameStart = false;
        
        // Show game board directly without animation
        this.showGameBoardDirectly();
        console.log('Game board shown after transition (no animation to avoid double animation)');
    }
    
    initializeGameBoard() {
        // Hide waiting message
        const messageDiv = document.getElementById('roomWaitingMessage');
        if (messageDiv) {
            messageDiv.style.display = 'none';
        }
        
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

