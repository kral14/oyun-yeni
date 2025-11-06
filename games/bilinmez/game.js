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
        
        // Board graph (nodes and edges for 10-node layout)
        // 10-node board structure:
        // Left side: 10 (top), 9 (middle), 8 (bottom)
        // Right side: 5 (top), 6 (middle), 7 (bottom)
        // Center horizontal: 9 <-> 4 <-> 1 <-> 6
        // Upper center: 4 <-> 3 (up from horizontal, left side)
        // Lower center: 1 <-> 2 (down from horizontal, right side)
        // Connections: 
        //   Left vertical: 10 <-> 9 <-> 8
        //   Right vertical: 5 <-> 6 <-> 7
        //   Horizontal: 9 <-> 4 <-> 1 <-> 6
        //   Upper vertical: 4 <-> 3
        //   Lower vertical: 1 <-> 2
        // Orange starts at: 10, 9, 8 (left side)
        // Blue starts at: 5, 6, 7 (right side)
        // Orange goal: 5, 6, 7 (right side)
        // Blue goal: 10, 9, 8 (left side)
        // Base board dimensions (desktop)
        this.baseBoardSize = 600;
        this.boardNodes = {
            '10': { id: '10', x: 80,  y: 80,  neighbors: ['9'] },
            '9': { id: '9', x: 80,  y: 330, neighbors: ['10', '8', '4'] },
            '8': { id: '8', x: 80,  y: 520, neighbors: ['9'] },
            '5': { id: '5', x: 520, y: 80,  neighbors: ['6'] },
            '6': { id: '6', x: 520, y: 330, neighbors: ['5', '7', '1'] },
            '7': { id: '7', x: 520, y: 520, neighbors: ['6'] },
            '4': { id: '4', x: 200, y: 330, neighbors: ['9', '1', '3'] },
            '1': { id: '1', x: 400, y: 330, neighbors: ['4', '6', '2'] },
            '3': { id: '3', x: 200, y: 200, neighbors: ['4'] },
            '2': { id: '2', x: 400, y: 460, neighbors: ['1'] }
        };
        
        // Calculate responsive node positions
        this.updateNodePositions();
        
        // Update positions on window resize
        window.addEventListener('resize', () => {
            this.updateNodePositions();
            this.updateGameBoard();
        });
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.lobbyRefreshInterval = null;
        this.transitionAnimation = null; // Three.js animation instance
        this.isLeavingRoom = false; // Flag to prevent double animation when leaving room
        this.isTransitioning = false; // Flag to prevent multiple simultaneous transitions
        this.diceResolved = false; // First-turn dice finished
        
        this.init();
    }
    
    isMobileDevice() {
        // Check user agent
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
        
        // Check screen size
        const isSmallScreen = window.innerWidth <= 768;
        
        // Check touch support
        const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Check if it's a mobile device based on user agent OR (small screen AND touch support)
        return mobileRegex.test(userAgent) || (isSmallScreen && hasTouchScreen);
    }
    
    /**
     * Update node positions based on current board size (responsive)
     */
    updateNodePositions() {
        const board = document.getElementById('gameBoard');
        if (!board) return;
        
        const boardRect = board.getBoundingClientRect();
        const currentBoardSize = boardRect.width || this.baseBoardSize;
        const scale = currentBoardSize / this.baseBoardSize;
        
        // Update all node positions proportionally
        Object.keys(this.boardNodes).forEach(nodeId => {
            const node = this.boardNodes[nodeId];
            // Keep original positions in base format, calculate on the fly
            node._scale = scale;
            node._baseX = node.x;
            node._baseY = node.y;
        });
    }
    
    /**
     * Get scaled position for a node
     */
    getNodePosition(nodeId) {
        const node = this.boardNodes[nodeId];
        if (!node) return { x: 0, y: 0 };
        
        const board = document.getElementById('gameBoard');
        if (!board) {
            // Fallback to base positions
            return { x: node.x, y: node.y };
        }
        
        const boardRect = board.getBoundingClientRect();
        const currentBoardSize = boardRect.width || this.baseBoardSize;
        const scale = currentBoardSize / this.baseBoardSize;
        
        return {
            x: node.x * scale,
            y: node.y * scale
        };
    }
    
    init() {
        // Set username
        const username = localStorage.getItem('towerDefenseUsername') || 'İstifadəçi';
        const profileUsername = document.getElementById('profileUsername');
        if (profileUsername) {
            profileUsername.textContent = username;
        }
        
        // Button handlers (check if elements exist before adding listeners)
        const createRoomBtn = document.getElementById('createRoomBtn');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => this.showCreateRoomModal());
        }
        
        const refreshLobbyBtn = document.getElementById('refreshLobbyBtn');
        if (refreshLobbyBtn) {
            refreshLobbyBtn.addEventListener('click', () => this.refreshLobby());
        }
        
        // Search room button (if exists)
        const searchRoomBtn = document.getElementById('searchRoomBtn');
        if (searchRoomBtn) {
            searchRoomBtn.addEventListener('click', () => this.showSearchRoomModal());
        }
        
        const backToLobbyBtn = document.getElementById('backToLobbyBtn');
        if (backToLobbyBtn) {
            backToLobbyBtn.addEventListener('click', () => this.backToLobby());
        }
        
        const deleteRoomBtn = document.getElementById('deleteRoomBtn');
        if (deleteRoomBtn) {
            deleteRoomBtn.addEventListener('click', () => this.deleteRoom());
        }
        
        const homeBtn = document.getElementById('homeBtn');
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                // Leave room if in one
                if (this.roomCode && this.socket && this.socket.connected) {
                    this.sendMessage('leave_room', { roomCode: this.roomCode });
                }
                
                // Clear saved room code from localStorage
                localStorage.removeItem('threeStonesRoomCode');
                
                // Clear game state
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
                this.diceResolved = false;
                
                // Redirect to home page
                window.location.href = '/index.html';
            });
        }
        
        // Modal handlers (check if elements exist before adding listeners)
        const cancelCreateBtn = document.getElementById('cancelCreateBtn');
        if (cancelCreateBtn) {
            cancelCreateBtn.addEventListener('click', () => this.closeCreateRoomModal());
        }
        
        const cancelJoinBtn = document.getElementById('cancelJoinBtn');
        if (cancelJoinBtn) {
            cancelJoinBtn.addEventListener('click', () => this.closeJoinRoomModal());
        }
        
        const createRoomForm = document.getElementById('createRoomForm');
        if (createRoomForm) {
            createRoomForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createRoom();
            });
        }
        
        const joinRoomForm = document.getElementById('joinRoomForm');
        if (joinRoomForm) {
            joinRoomForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.confirmJoinRoom();
            });
        }
        
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
            
            // Refresh lobby after connection (only if lobby exists)
            const lobbyList = document.getElementById('lobbyList');
            if (lobbyList) {
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
            }
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
                console.log('[DEBUG] room_created event received', {
                    roomCode: data.roomCode,
                    playerId: data.playerId,
                    previousGameState: this.gameState,
                    previousDiceResolved: this.diceResolved
                });
                
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = 'orange';
                this.isCreator = true; // Mark as creator
                
                // Reset game state for new room
                this.gameState = {
                    orangeStones: [],
                    blueStones: [],
                    currentTurn: 'orange',
                    gameOver: false,
                    winner: null
                };
                
                // Reset dice resolved flag for new room
                this.diceResolved = false;
                
                console.log('[DEBUG] room_created: Game state reset', {
                    newGameState: this.gameState,
                    diceResolved: this.diceResolved,
                    status: 'NEW_ROOM - Dice roll will be shown when game starts'
                });
                
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                
                // Redirect to mobile-room.html if on mobile and not already there
                if (this.isMobileDevice() && !window.location.pathname.includes('mobile-room.html')) {
                    const currentPath = window.location.pathname;
                    const newPath = currentPath.replace(/mobile\.html$/, 'mobile-room.html') || 
                                   currentPath.replace(/\/$/, '/mobile-room.html') ||
                                   'mobile-room.html';
                    const queryString = window.location.search;
                    const hash = window.location.hash;
                    window.location.replace(newPath + queryString + hash);
                    return; // Don't continue, we're redirecting
                }
                
                this.updateUI();
                // Don't refresh lobby - we're transitioning to room waiting screen
                break;
                
            case 'room_joined':
                // User joined room - show animation (user-initiated action)
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = data.playerColor || this.playerColor;
                this.isCreator = data.isCreator || false;
                
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                
                // Redirect to mobile-room.html if on mobile and not already there
                if (this.isMobileDevice() && !window.location.pathname.includes('mobile-room.html')) {
                    const currentPath = window.location.pathname;
                    const newPath = currentPath.replace(/mobile\.html$/, 'mobile-room.html') || 
                                   currentPath.replace(/\/$/, '/mobile-room.html') ||
                                   'mobile-room.html';
                    const queryString = window.location.search;
                    const hash = window.location.hash;
                    window.location.replace(newPath + queryString + hash);
                    return; // Don't continue, we're redirecting
                }
                
                // Hide lobby screen immediately
                const waitingRoomJoined = document.getElementById('waitingRoom');
                if (waitingRoomJoined) {
                    waitingRoomJoined.style.display = 'none';
                    waitingRoomJoined.classList.remove('visible');
                    waitingRoomJoined.classList.add('hidden');
                }
                
                // Update navbar
                const roomInfoEl = document.getElementById('roomInfo');
                const playerStatusEl = document.getElementById('playerStatus');
                const roomCodeEl = document.getElementById('roomCode');
                if (roomInfoEl) roomInfoEl.style.display = 'block';
                if (playerStatusEl) playerStatusEl.style.display = 'flex';
                if (roomCodeEl) roomCodeEl.textContent = this.roomCode;
                
                // Update delete button visibility
                const deleteBtnJoined = document.getElementById('deleteRoomBtn');
                if (deleteBtnJoined) {
                    deleteBtnJoined.style.display = this.isCreator ? 'flex' : 'none';
                }
                
                // If game was already started, restore game state
                if (data.gameState) {
                    this.gameState = data.gameState;
                    // Check if game has started to set diceResolved
                    const gameHasStarted = this.hasGameStarted();
                    this.diceResolved = gameHasStarted; // If game started, dice was resolved
                    
                    console.log('[DEBUG] room_joined: Game already started', {
                        roomCode: this.roomCode,
                        gameState: this.gameState,
                        hasGameStarted: gameHasStarted,
                        diceResolved: this.diceResolved,
                        status: gameHasStarted ? 'GAME_IN_PROGRESS - No dice roll' : 'NEW_GAME - Dice roll will be shown'
                    });
                    
                    this.startGame(true); // Show animation
                } else {
                    // Game not started - reset game state and diceResolved for new room
                    this.gameState = {
                        orangeStones: [],
                        blueStones: [],
                        currentTurn: 'orange',
                        gameOver: false,
                        winner: null
                    };
                    this.diceResolved = false;
                    
                    console.log('[DEBUG] room_joined: Game not started yet', {
                        roomCode: this.roomCode,
                        gameState: this.gameState,
                        diceResolved: this.diceResolved,
                        status: 'WAITING_FOR_PLAYER - Dice roll will be shown when game starts'
                    });
                    // Show animation to room waiting screen
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
                console.log('[DEBUG] room_rejoined: Event received', {
                    roomCode: data.roomCode,
                    playerId: data.playerId,
                    playerColor: data.playerColor,
                    isCreator: data.isCreator,
                    diceResolved: data.diceResolved,
                    gameState: data.gameState,
                    hasGameState: !!data.gameState,
                    orangeStonesCount: data.gameState?.orangeStones?.length || 0,
                    blueStonesCount: data.gameState?.blueStones?.length || 0
                });
                
                this.roomCode = data.roomCode;
                this.playerId = data.playerId;
                this.playerColor = data.playerColor || this.playerColor;
                this.isCreator = data.isCreator || false;
                // Save room code to localStorage for reconnection
                localStorage.setItem('threeStonesRoomCode', this.roomCode);
                
                // Hide lobby screen immediately
                const waitingRoomRejoin = document.getElementById('waitingRoom');
                if (waitingRoomRejoin) {
                    waitingRoomRejoin.style.display = 'none';
                    waitingRoomRejoin.classList.remove('visible');
                    waitingRoomRejoin.classList.add('hidden');
                    console.log('[DEBUG] room_rejoined: Lobby screen hidden');
                }
                
                // Update navbar
                const roomInfoRejoin = document.getElementById('roomInfo');
                const playerStatusRejoin = document.getElementById('playerStatus');
                const roomCodeRejoin = document.getElementById('roomCode');
                
                if (roomInfoRejoin) roomInfoRejoin.style.display = 'block';
                if (playerStatusRejoin) playerStatusRejoin.style.display = 'flex';
                if (roomCodeRejoin) roomCodeRejoin.textContent = this.roomCode;
                
                // Update delete button visibility
                const deleteBtnRejoin = document.getElementById('deleteRoomBtn');
                if (deleteBtnRejoin) {
                    deleteBtnRejoin.style.display = this.isCreator ? 'flex' : 'none';
                }
                
                // Restore game state if provided
                if (data.gameState) {
                    console.log('[DEBUG] room_rejoined: Restoring game state', {
                        beforeNormalization: {
                            orangeStones: data.gameState.orangeStones,
                            blueStones: data.gameState.blueStones,
                            currentTurn: data.gameState.currentTurn,
                            gameOver: data.gameState.gameOver
                        }
                    });
                    this.gameState = data.gameState;
                    // IMPORTANT: Normalize game state BEFORE checking if game has started
                    // This ensures hasGameStarted() works correctly with node-based positions
                    if (this.gameState && this.gameState.orangeStones && this.gameState.blueStones) {
                        console.log('[DEBUG] room_rejoined: Normalizing game state before checking hasGameStarted');
                        this.normalizeGameStateToNodes();
                        console.log('[DEBUG] room_rejoined: After normalization', {
                            orangeStones: this.gameState.orangeStones,
                            blueStones: this.gameState.blueStones
                        });
                    }
                } else {
                    // No game state - reset for new game
                    console.log('[DEBUG] room_rejoined: No game state, resetting for new game');
                    this.gameState = {
                        orangeStones: [],
                        blueStones: [],
                        currentTurn: 'orange',
                        gameOver: false,
                        winner: null
                    };
                }
                
                // Check if dice was resolved (from server or by checking game state)
                console.log('[DEBUG] room_rejoined: Checking diceResolved', {
                    serverDiceResolved: data.diceResolved,
                    hasGameState: !!this.gameState,
                    orangeStonesLength: this.gameState?.orangeStones?.length || 0,
                    blueStonesLength: this.gameState?.blueStones?.length || 0
                });
                
                // Check if dice was resolved (from server - this is the authoritative source)
                // If dice is resolved, game has effectively started (even if stones are in initial positions)
                if (data.diceResolved !== undefined) {
                    this.diceResolved = data.diceResolved;
                    console.log('[DEBUG] room_rejoined: Using server diceResolved value', {
                        diceResolved: this.diceResolved,
                        fromServer: true
                    });
                } else {
                    // Server didn't send diceResolved, check if game has started
                    let gameHasStarted = false;
                    if (this.gameState) {
                        gameHasStarted = this.hasGameStarted();
                    }
                    
                    if (gameHasStarted) {
                        // Game has started (stones moved) - dice must be resolved
                        this.diceResolved = true;
                        console.log('[DEBUG] room_rejoined: Game has started (stones moved), diceResolved set to true', {
                            gameHasStarted: gameHasStarted,
                            diceResolved: this.diceResolved
                        });
                    } else if (this.gameState) {
                        // Game state exists but game hasn't started - dice not resolved yet
                        this.diceResolved = false;
                        console.log('[DEBUG] room_rejoined: Game not started, diceResolved set to false', {
                            gameHasStarted: gameHasStarted,
                            diceResolved: this.diceResolved
                        });
                    } else {
                        // No game state - dice not resolved yet
                        this.diceResolved = false;
                        console.log('[DEBUG] room_rejoined: No game state, diceResolved set to false');
                    }
                }
                
                // Animation is already running (started in init() or connectWebSocket())
                // Just complete the transition to target screen
                // Decision logic:
                // 1. If dice is resolved (from server), show game board (game has effectively started)
                // 2. If game has started (stones moved), show game board
                // 3. If game state exists but dice not resolved, show game board with dice modal
                // 4. Otherwise, show room waiting screen
                const gameHasStartedCheck = this.gameState && this.hasGameStarted();
                const shouldShowGameBoard = this.diceResolved || gameHasStartedCheck || (this.gameState && !this.diceResolved);
                
                console.log('[DEBUG] room_rejoined: Deciding screen transition', {
                    hasGameState: !!this.gameState,
                    gameHasStarted: gameHasStartedCheck,
                    diceResolved: this.diceResolved,
                    orangeStonesLength: this.gameState?.orangeStones?.length || 0,
                    blueStonesLength: this.gameState?.blueStones?.length || 0,
                    shouldShowGameBoard: shouldShowGameBoard,
                    willShowGameBoard: shouldShowGameBoard,
                    willShowRoomWaiting: !shouldShowGameBoard
                });
                
                if (shouldShowGameBoard) {
                    // Show game board (dice resolved OR game started OR both players joined)
                    if (this.diceResolved || gameHasStartedCheck) {
                        console.log('[DEBUG] room_rejoined: Transitioning to game board (dice resolved or game started)', {
                            diceResolved: this.diceResolved,
                            gameHasStarted: gameHasStartedCheck
                        });
                    } else {
                        console.log('[DEBUG] room_rejoined: Transitioning to game board (dice not resolved, will show dice modal)');
                    }
                    this.completeTransitionToScreen('gameBoardContainer', () => {
                        this.initializeGameBoard();
                    });
                } else {
                    // Game not started and dice not resolved, show room waiting screen
                    console.log('[DEBUG] room_rejoined: Transitioning to room waiting screen');
                    
                    // Update room waiting screen immediately (before transition)
                    const roomWaitingCodeRejoin = document.getElementById('roomWaitingCode');
                    if (roomWaitingCodeRejoin) {
                        roomWaitingCodeRejoin.textContent = this.roomCode;
                        console.log('[DEBUG] room_rejoined: Room code set to', this.roomCode);
                    }
                    
                    // Update players on room waiting screen
                    this.updateRoomWaitingScreen(data.players || {});
                    
                    this.completeTransitionToScreen('roomWaitingScreen', () => {
                        // Ensure room code is set after transition
                        const roomWaitingCodeAfter = document.getElementById('roomWaitingCode');
                        if (roomWaitingCodeAfter && (!roomWaitingCodeAfter.textContent || roomWaitingCodeAfter.textContent === '-')) {
                            roomWaitingCodeAfter.textContent = this.roomCode;
                            console.log('[DEBUG] room_rejoined: Room code set in callback', this.roomCode);
                        }
                    });
                }
                break;
                
            case 'player_joined':
                // Update players without animation - this is server notification, not screen transition
                console.log('[DEBUG] player_joined: Event received', {
                    roomCode: data.roomCode || this.roomCode,
                    players: data.players,
                    gameState: data.gameState,
                    diceResolved: data.diceResolved,
                    hasGameState: !!data.gameState,
                    orangeStonesCount: data.gameState?.orangeStones?.length || 0,
                    blueStonesCount: data.gameState?.blueStones?.length || 0,
                    currentGameState: this.gameState,
                    currentDiceResolved: this.diceResolved
                });
                
                this.updatePlayers(data.players);
                
                // If game was over (previous player left) and now both players are present,
                // reset game state and prepare for new game with dice roll
                const players = data.players || {};
                console.log('[DEBUG] player_joined: Processing event', {
                    roomCode: this.roomCode,
                    players: players,
                    gameState: this.gameState,
                    gameOver: this.gameState?.gameOver,
                    diceResolved: this.diceResolved,
                    serverDiceResolved: data.diceResolved
                });
                
                // If we're still on lobby screen and have a room code, transition to room waiting screen
                const waitingRoom = document.getElementById('waitingRoom');
                if (waitingRoom && waitingRoom.style.display !== 'none' && this.roomCode) {
                    // We're on lobby but have joined a room, transition to room waiting screen
                    console.log('[DEBUG] player_joined: Transitioning from lobby to room waiting screen');
                    // Hide lobby screen immediately
                    waitingRoom.style.display = 'none';
                    waitingRoom.classList.remove('visible');
                    waitingRoom.classList.add('hidden');
                    this.transitionToScreen('roomWaitingScreen', () => {
                        const roomWaitingCodeEl = document.getElementById('roomWaitingCode');
                        if (roomWaitingCodeEl) roomWaitingCodeEl.textContent = this.roomCode;
                    });
                }
                
                if (this.gameState && this.gameState.gameOver === true && players.orange && players.blue) {
                    console.log('[DEBUG] player_joined: Game was over, resetting for new game', {
                        previousGameState: this.gameState,
                        players: players
                    });
                    
                    // Reset game state for new game
                    this.gameState = {
                        orangeStones: [],
                        blueStones: [],
                        currentTurn: 'orange',
                        gameOver: false,
                        winner: null
                    };
                    // Dice will be rolled when game starts
                    this.diceResolved = false;
                    
                    console.log('[DEBUG] player_joined: Game state reset for new game', {
                        newGameState: this.gameState,
                        diceResolved: this.diceResolved,
                        status: 'GAME_OVER_RESET - Dice roll will be shown when game starts'
                    });
                } else {
                    console.log('[DEBUG] player_joined: No reset needed', {
                        hasGameState: !!this.gameState,
                        gameOver: this.gameState?.gameOver,
                        bothPlayersPresent: !!(players.orange && players.blue),
                        status: 'NO_RESET_NEEDED'
                    });
                }
                
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
                const roomCodeNav = document.getElementById('roomCode');
                const playerOrangeNameNav = document.getElementById('playerOrangeName');
                const playerBlueNameNav = document.getElementById('playerBlueName');
                
                if (roomInfoNav) {
                    roomInfoNav.style.display = 'none';
                    roomInfoNav.classList.remove('visible');
                    roomInfoNav.classList.add('hidden');
                }
                if (playerStatusNav) {
                    playerStatusNav.style.display = 'none';
                    playerStatusNav.classList.remove('visible');
                    playerStatusNav.classList.add('hidden');
                }
                if (roomCodeNav) roomCodeNav.textContent = '-';
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
                console.log('[DEBUG] game_start event received', data);
                
                if (data.gameState) {
                    this.gameState = data.gameState;
                } else if (data.game_state) {
                    // Handle both camelCase and snake_case
                    this.gameState = data.game_state;
                }
                
                // IMPORTANT: Normalize game state BEFORE checking if game has started
                // This ensures hasGameStarted() works correctly with node-based positions
                if (this.gameState && this.gameState.orangeStones && this.gameState.blueStones) {
                    console.log('[DEBUG] game_start: Normalizing game state before checking hasGameStarted');
                    this.normalizeGameStateToNodes();
                }
                
                // Check if this is a new game after game over (previous player left)
                // If game state shows stones in initial positions, dice needs to be rolled
                // If game has not started yet (stones in initial positions), dice needs to be rolled
                // If game has started (stones moved), dice was already resolved
                // Always check if stones are in initial positions - if yes, dice needs to be rolled
                const isNewGame = !this.hasGameStarted();
                this.diceResolved = !isNewGame; // If new game (stones in initial positions), dice not resolved yet
                
                console.log('[DEBUG] game_start: Game state updated', {
                    roomCode: this.roomCode,
                    gameState: this.gameState,
                    isNewGame: isNewGame,
                    hasGameStarted: !isNewGame,
                    diceResolved: this.diceResolved,
                    status: isNewGame ? 'NEW_GAME - Dice roll will be shown' : 'GAME_IN_PROGRESS - No dice roll'
                });
                
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
                console.log('[DEBUG] game_state event received', {
                    roomCode: this.roomCode,
                    previousGameState: this.gameState,
                    newGameState: data.gameState,
                    previousDiceResolved: this.diceResolved,
                    serverDiceResolved: data.diceResolved
                });
                
                this.gameState = data.gameState;
                
                // IMPORTANT: Normalize game state BEFORE checking if game has started
                // This ensures hasGameStarted() works correctly with node-based positions
                if (this.gameState && this.gameState.orangeStones && this.gameState.blueStones) {
                    console.log('[DEBUG] game_state: Normalizing game state before checking hasGameStarted');
                    this.normalizeGameStateToNodes();
                }
                
                // Update diceResolved from server if provided (this is authoritative)
                if (data.diceResolved !== undefined) {
                    this.diceResolved = data.diceResolved;
                    console.log('[DEBUG] game_state: diceResolved updated from server', {
                        diceResolved: this.diceResolved
                    });
                }
                
                // Check if game has started (stones moved from initial positions)
                // If game started, close dice modal and mark dice as resolved
                const hasStarted = this.hasGameStarted();
                if (hasStarted && !this.diceResolved) {
                    console.log('[DEBUG] game_state: Game started, closing dice modal', {
                        hasStarted: hasStarted,
                        diceResolved: this.diceResolved,
                        status: 'GAME_STARTED - Closing dice modal'
                    });
                    this.diceResolved = true;
                    this.closeDiceModal();
                } else if (this.diceResolved) {
                    // Dice is resolved, close dice modal if open
                    console.log('[DEBUG] game_state: Dice resolved, closing dice modal if open', {
                        hasStarted: hasStarted,
                        diceResolved: this.diceResolved,
                        status: 'DICE_RESOLVED - Closing dice modal'
                    });
                    this.closeDiceModal();
                } else {
                    console.log('[DEBUG] game_state: No dice modal close needed', {
                        hasStarted: hasStarted,
                        diceResolved: this.diceResolved,
                        status: hasStarted ? 'DICE_ALREADY_RESOLVED' : 'GAME_NOT_STARTED'
                    });
                }
                
                this.updateGameBoard();
                break;

            case 'dice_roll':
                // Another player's roll broadcast
                this.showDiceRoll(data.username || '', data.roll, data.color);
                break;
            case 'dice_result':
                // Both rolls and starter announced
                this.applyDiceResult(data);
                break;
                
            case 'move_made':
                const previousTurn = this.gameState?.currentTurn;
                const previousGameOver = this.gameState?.gameOver;
                
                console.log('[DEBUG] move_made event received', {
                    roomCode: this.roomCode,
                    previousGameState: this.gameState,
                    previousTurn: previousTurn,
                    newGameState: data.gameState,
                    newTurn: data.gameState?.currentTurn,
                    previousDiceResolved: this.diceResolved,
                    myColor: this.playerColor
                });
                
                this.gameState = data.gameState;
                
                // IMPORTANT: Normalize game state BEFORE updating game board
                // This ensures stones are positioned correctly
                if (this.gameState && this.gameState.orangeStones && this.gameState.blueStones) {
                    console.log('[DEBUG] move_made: Normalizing game state before updating board');
                    this.normalizeGameStateToNodes();
                }
                
                // Log turn change
                const newTurn = this.gameState.currentTurn;
                if (previousTurn !== newTurn) {
                    console.log('[DEBUG] move_made: Turn changed', {
                        previousTurn: previousTurn,
                        newTurn: newTurn,
                        myColor: this.playerColor,
                        isMyTurn: newTurn === this.playerColor,
                        status: newTurn === this.playerColor ? 'SIRA SIZDƏ' : 'SIRA RƏQİBDƏ'
                    });
                } else {
                    console.log('[DEBUG] move_made: Turn did not change', {
                        currentTurn: newTurn,
                        myColor: this.playerColor,
                        isMyTurn: newTurn === this.playerColor
                    });
                }
                
                // Log game over status
                if (this.gameState.gameOver && !previousGameOver) {
                    console.log('[DEBUG] move_made: Game over!', {
                        winner: this.gameState.winner,
                        gameOver: true
                    });
                }
                
                // If a move was made, game has started - close dice modal if open
                if (!this.diceResolved) {
                    console.log('[DEBUG] move_made: Move made, closing dice modal', {
                        diceResolved: this.diceResolved,
                        status: 'MOVE_MADE - Closing dice modal'
                    });
                    this.diceResolved = true;
                    this.closeDiceModal();
                } else {
                    console.log('[DEBUG] move_made: Dice already resolved', {
                        diceResolved: this.diceResolved,
                        status: 'DICE_ALREADY_RESOLVED'
                    });
                }
                
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
        if (!lobbyList) {
            // Lobby list element doesn't exist (e.g., in mobile-room.html)
            return;
        }
        
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

    updatePlayers(playersMap) {
        // Persist names by color for UI and dice labels
        this.playersByColor = { ...(playersMap || {}) };
        // Existing UI updates (names in header/room waiting screen)
        const orangeName = (playersMap && playersMap.orange) || '-';
        const blueName = (playersMap && playersMap.blue) || '-';
        const po = document.getElementById('playerOrangeName');
        const pb = document.getElementById('playerBlueName');
        if (po) po.textContent = orangeName;
        if (pb) pb.textContent = blueName;
        const rwo = document.getElementById('roomWaitingOrange');
        const rwb = document.getElementById('roomWaitingBlue');
        if (rwo) rwo.textContent = orangeName;
        if (rwb) rwb.textContent = blueName;
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
        
        // Reset game state before creating new room
        console.log('[DEBUG] createRoom: Resetting game state before creating new room', {
            previousGameState: this.gameState,
            previousDiceResolved: this.diceResolved,
            roomName: roomName
        });
        
        this.gameState = {
            orangeStones: [],
            blueStones: [],
            currentTurn: 'orange',
            gameOver: false,
            winner: null
        };
        
        // Reset dice resolved flag for new room
        this.diceResolved = false;
        
        console.log('[DEBUG] createRoom: Game state reset', {
            newGameState: this.gameState,
            diceResolved: this.diceResolved,
            status: 'READY_TO_CREATE_ROOM - Dice roll will be shown when game starts'
        });
        
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
        // Only refresh lobby if lobby list element exists
        const lobbyList = document.getElementById('lobbyList');
        if (!lobbyList) {
            // Lobby list doesn't exist (e.g., in mobile-room.html)
            return;
        }
        
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
    
    showSearchRoomModal() {
        // Simple search: prompt for room code
        const roomCode = prompt('Otaq kodunu daxil edin:');
        if (!roomCode || !roomCode.trim()) {
            return;
        }
        
        // Try to find room in current lobby list
        if (!this.socket || !this.socket.connected) {
            this.connectWebSocket();
            setTimeout(() => {
                this.sendMessage('get_lobby_list');
                setTimeout(() => {
                    this.searchRoomByCode(roomCode.trim().toUpperCase());
                }, 500);
            }, 500);
        } else {
            this.sendMessage('get_lobby_list');
            setTimeout(() => {
                this.searchRoomByCode(roomCode.trim().toUpperCase());
            }, 500);
        }
    }
    
    searchRoomByCode(roomCode) {
        // Get all room cards
        const roomCards = document.querySelectorAll('.lobby-room-card');
        let found = false;
        
        roomCards.forEach(card => {
            const roomNameElement = card.querySelector('.lobby-room-name');
            if (roomNameElement) {
                const roomName = roomNameElement.textContent.trim();
                // Check if room code matches (case insensitive)
                if (roomName.toUpperCase().includes(roomCode.toUpperCase()) || 
                    roomName.toUpperCase() === roomCode.toUpperCase()) {
                    // Scroll to room card
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight the card
                    card.style.border = '2px solid #4CAF50';
                    card.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
                    setTimeout(() => {
                        card.style.border = '';
                        card.style.boxShadow = '';
                    }, 2000);
                    found = true;
                }
            }
        });
        
        if (!found) {
            alert(`"${roomCode}" kodlu otaq tapılmadı. Zəhmət olmasa otaq kodunu yoxlayın və ya lobini yeniləyin.`);
        }
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
        
        // Reset game state before joining new room
        console.log('[DEBUG] confirmJoinRoom: Resetting game state before joining room', {
            selectedRoomCode: this.selectedRoomCode,
            previousGameState: this.gameState,
            previousDiceResolved: this.diceResolved
        });
        
        this.gameState = {
            orangeStones: [],
            blueStones: [],
            currentTurn: 'orange',
            gameOver: false,
            winner: null
        };
        
        // Reset dice resolved flag for new room
        this.diceResolved = false;
        
        console.log('[DEBUG] confirmJoinRoom: Game state reset', {
            newGameState: this.gameState,
            diceResolved: this.diceResolved,
            status: 'READY_TO_JOIN_ROOM - Dice roll will be shown when game starts'
        });
        
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
        
        // Hide lobby screen immediately
        const waitingRoom = document.getElementById('waitingRoom');
        if (waitingRoom) {
            waitingRoom.style.display = 'none';
            waitingRoom.classList.remove('visible');
            waitingRoom.classList.add('hidden');
        }
        
        // Animate transition to room waiting screen
        this.transitionToScreen('roomWaitingScreen', () => {
            // Update room waiting screen
            document.getElementById('roomWaitingCode').textContent = this.roomCode;
        });
        
        // Show/hide delete button based on creator status
        this.updateDeleteButtonVisibility();
    }
    
    completeTransitionToScreen(targetScreenId, callback = null) {
        // Complete transition when animation is already running (for rejoin scenario)
        const screens = ['waitingRoom', 'roomWaitingScreen', 'gameBoardContainer'];
        const targetScreen = document.getElementById(targetScreenId);
        
        console.log('[DEBUG] completeTransitionToScreen: Starting', {
            targetScreenId: targetScreenId,
            hasTargetScreen: !!targetScreen,
            targetScreenElement: targetScreen
        });
        
        // Wait for animation to complete (800ms), then show target screen
        setTimeout(() => {
            // Hide all screens
            screens.forEach(screenId => {
                const screen = document.getElementById(screenId);
                if (screen) {
                    screen.style.display = 'none';
                    screen.classList.remove('hidden', 'visible');
                    // Force hide
                    screen.style.opacity = '0';
                    screen.style.visibility = 'hidden';
                    console.log('[DEBUG] completeTransitionToScreen: Hiding screen', {
                        screenId: screenId,
                        display: screen.style.display,
                        opacity: screen.style.opacity,
                        visibility: screen.style.visibility
                    });
                }
            });
            
            // Show target screen
            if (targetScreen) {
                const displayStyle = targetScreenId === 'gameBoardContainer' ? 'block' : 'flex';
                targetScreen.style.display = displayStyle;
                targetScreen.classList.remove('hidden');
                targetScreen.classList.add('visible');
                // Force visibility
                targetScreen.style.opacity = '1';
                targetScreen.style.visibility = 'visible';
                targetScreen.style.pointerEvents = 'auto';
                targetScreen.style.transform = 'none';
                
                console.log('[DEBUG] completeTransitionToScreen: Showing target screen', {
                    targetScreenId: targetScreenId,
                    display: displayStyle,
                    opacity: targetScreen.style.opacity,
                    visibility: targetScreen.style.visibility,
                    computedDisplay: window.getComputedStyle(targetScreen).display,
                    computedVisibility: window.getComputedStyle(targetScreen).visibility,
                    computedOpacity: window.getComputedStyle(targetScreen).opacity
                });
                
                // Force a reflow to ensure rendering
                void targetScreen.offsetWidth;
            } else {
                console.error('[DEBUG] completeTransitionToScreen: Target screen not found', {
                    targetScreenId: targetScreenId
                });
            }
            
            // Stop animation and hide overlay
            this.stopTransitionAnimation();
            const overlay = document.getElementById('screenTransitionOverlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.style.opacity = '0';
                overlay.style.visibility = 'hidden';
            }
            
            // Clear transition flag
            this.isTransitioning = false;
            
            // Call callback if provided
            if (callback) {
                console.log('[DEBUG] completeTransitionToScreen: Calling callback');
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
        
        // Redirect to mobile.html if on mobile and currently on mobile-room.html
        if (this.isMobileDevice() && window.location.pathname.includes('mobile-room.html')) {
            const currentPath = window.location.pathname;
            const newPath = currentPath.replace(/mobile-room\.html$/, 'mobile.html') || 
                           currentPath.replace(/\/$/, '/mobile.html') ||
                           'mobile.html';
            const queryString = window.location.search;
            const hash = window.location.hash;
            window.location.replace(newPath + queryString + hash);
            return; // Don't continue, we're redirecting
        }
        
        // Immediately hide navbar elements (room code and player names)
        const roomInfo = document.getElementById('roomInfo');
        const playerStatus = document.getElementById('playerStatus');
        const roomCode = document.getElementById('roomCode');
        const playerOrangeName = document.getElementById('playerOrangeName');
        const playerBlueName = document.getElementById('playerBlueName');
        
        if (roomInfo) {
            roomInfo.style.display = 'none';
            roomInfo.classList.remove('visible');
            roomInfo.classList.add('hidden');
        }
        if (playerStatus) {
            playerStatus.style.display = 'none';
            playerStatus.classList.remove('visible');
            playerStatus.classList.add('hidden');
        }
        if (roomCode) roomCode.textContent = '-';
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
        const roomCode = document.getElementById('roomCode');
        const playerOrangeName = document.getElementById('playerOrangeName');
        const playerBlueName = document.getElementById('playerBlueName');
        
        if (roomInfo) {
            roomInfo.style.display = 'none';
            roomInfo.classList.remove('visible');
            roomInfo.classList.add('hidden');
        }
        if (playerStatus) {
            playerStatus.style.display = 'none';
            playerStatus.classList.remove('visible');
            playerStatus.classList.add('hidden');
        }
        if (roomCode) roomCode.textContent = '-';
        if (playerOrangeName) playerOrangeName.textContent = '-';
        if (playerBlueName) playerBlueName.textContent = '-';
        
        // Update UI
        this.updateLobbyUI();
        
        // Refresh lobby
        this.refreshLobby();
    }
    
    updateDeleteButtonVisibility() {
        // Show/hide delete button based on creator status
        const deleteBtn = document.getElementById('deleteRoomBtn');
        if (deleteBtn) {
            deleteBtn.style.display = this.isCreator ? 'flex' : 'none';
        }
    }
    
    updateLobbyUI() {
        // Ensure all screens are properly hidden/shown
        const waitingRoom = document.getElementById('waitingRoom');
        const roomWaitingScreen = document.getElementById('roomWaitingScreen');
        const gameBoardContainer = document.getElementById('gameBoardContainer');
        
        // Hide navbar room info and player status
        const roomInfo = document.getElementById('roomInfo');
        const playerStatus = document.getElementById('playerStatus');
        const roomCode = document.getElementById('roomCode');
        const playerOrangeName = document.getElementById('playerOrangeName');
        const playerBlueName = document.getElementById('playerBlueName');
        
        if (roomInfo) {
            roomInfo.style.display = 'none';
            roomInfo.classList.remove('visible');
            roomInfo.classList.add('hidden');
        }
        if (playerStatus) {
            playerStatus.style.display = 'none';
            playerStatus.classList.remove('visible');
            playerStatus.classList.add('hidden');
        }
        if (roomCode) roomCode.textContent = '-';
        if (playerOrangeName) playerOrangeName.textContent = '-';
        if (playerBlueName) playerBlueName.textContent = '-';
        
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
        
        console.log('[DEBUG] handlePlayerLeft called', {
            leftColor: leftColor,
            myColor: this.playerColor,
            players: players,
            previousGameState: this.gameState,
            previousDiceResolved: this.diceResolved
        });
        
        // Check if we (the current player) are the one who left
        // If we left, we shouldn't process this event (we should have received room_left instead)
        // If our color matches the left color, we are the one who left
        if (this.playerColor === leftColor) {
            // We are the one who left, don't process this event
            // The room_left event or our own leave logic should handle UI updates
            console.log('[DEBUG] handlePlayerLeft: We are the one who left, ignoring event');
            return;
        }
        
        // Update player list with server's updated list
        this.updatePlayers(players);
        this.updateRoomWaitingScreen(players);
        
        // ALWAYS mark game as over when any player leaves (new or same player)
        // This ensures the game is reset and ready for a new game
        if (this.gameState) {
            const wasGameInProgress = !this.gameState.gameOver;
            
            // Mark game as over and reset game state
            this.gameState = {
                orangeStones: [],
                blueStones: [],
                currentTurn: 'orange',
                gameOver: true,  // Always mark as game over when player leaves
                winner: null
            };
            
            // Reset dice resolved flag so new player can roll dice
            this.diceResolved = false;
            
            console.log('[DEBUG] handlePlayerLeft: Game marked as OVER', {
                wasGameInProgress: wasGameInProgress,
                newGameState: this.gameState,
                diceResolved: this.diceResolved,
                status: 'GAME_OVER - Waiting for new player, dice roll will be shown when game starts'
            });
        } else {
            console.log('[DEBUG] handlePlayerLeft: No game state to reset');
        }
        
        // If game was in progress, transition from game to room waiting screen WITHOUT animation
        // This is server notification, not user-initiated screen change
        const gameBoardContainer = document.getElementById('gameBoardContainer');
        if (gameBoardContainer && gameBoardContainer.style.display !== 'none') {
            // Game was in progress, hide game board and show room waiting screen
            gameBoardContainer.style.display = 'none';
            document.getElementById('waitingRoom').style.display = 'none';
            document.getElementById('roomWaitingScreen').style.display = 'flex';
            
            // Make sure room info is still visible (user is still in room)
            document.getElementById('roomInfo').style.display = 'block';
            document.getElementById('playerStatus').style.display = 'flex';
            
            // Update room waiting message
            const messageDiv = document.getElementById('roomWaitingMessage');
            messageDiv.textContent = 'Oyunçu otaqdan çıxdı. Oyun dayandırıldı. Yeni oyunçu gözlənir. Yeni oyunçu gəldikdə oyun yenidən başladılacaq.';
            messageDiv.style.display = 'block';
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
        
        console.log('[DEBUG] showGameBoardDirectly: Starting', {
            hasWaitingRoom: !!waitingRoom,
            hasRoomWaitingScreen: !!roomWaitingScreen,
            hasGameBoardContainer: !!gameBoardContainer
        });
        
        if (waitingRoom) {
            waitingRoom.style.display = 'none';
            waitingRoom.classList.remove('hidden', 'visible');
            waitingRoom.style.opacity = '0';
            waitingRoom.style.visibility = 'hidden';
            console.log('[DEBUG] showGameBoardDirectly: Hiding waitingRoom', {
                display: waitingRoom.style.display,
                opacity: waitingRoom.style.opacity
            });
        }
        if (roomWaitingScreen) {
            roomWaitingScreen.style.display = 'none';
            roomWaitingScreen.classList.remove('hidden', 'visible');
            roomWaitingScreen.style.opacity = '0';
            roomWaitingScreen.style.visibility = 'hidden';
            console.log('[DEBUG] showGameBoardDirectly: Hiding roomWaitingScreen', {
                display: roomWaitingScreen.style.display,
                opacity: roomWaitingScreen.style.opacity
            });
        }
        
        // Force show game board
        if (gameBoardContainer) {
            gameBoardContainer.style.display = 'block';
            gameBoardContainer.classList.remove('hidden');
            gameBoardContainer.classList.add('visible');
            // Force visibility
            gameBoardContainer.style.opacity = '1';
            gameBoardContainer.style.visibility = 'visible';
            gameBoardContainer.style.transform = 'none';
            gameBoardContainer.style.pointerEvents = 'auto';
            
            console.log('[DEBUG] showGameBoardDirectly: Showing gameBoardContainer', {
                display: gameBoardContainer.style.display,
                opacity: gameBoardContainer.style.opacity,
                visibility: gameBoardContainer.style.visibility,
                computedDisplay: window.getComputedStyle(gameBoardContainer).display,
                computedVisibility: window.getComputedStyle(gameBoardContainer).visibility,
                computedOpacity: window.getComputedStyle(gameBoardContainer).opacity,
                hasClassVisible: gameBoardContainer.classList.contains('visible'),
                hasClassHidden: gameBoardContainer.classList.contains('hidden')
            });
            
            // Force a reflow to ensure rendering
            void gameBoardContainer.offsetWidth;
        } else {
            console.error('[DEBUG] showGameBoardDirectly: gameBoardContainer element not found!');
        }
        
        // Ensure navbar is visible
        const roomInfo = document.getElementById('roomInfo');
        const playerStatus = document.getElementById('playerStatus');
        if (roomInfo) roomInfo.style.display = 'block';
        if (playerStatus) playerStatus.style.display = 'flex';
        
        // Initialize game board (this sets up the board and updates it)
        this.initializeGameBoard();
        console.log('[DEBUG] showGameBoardDirectly: Game board initialized');
        
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
        
        // Wire dice UI
        this.setupDiceUI();

        // Use game state from server if available, otherwise initialize
        if (this.gameState && this.gameState.orangeStones && this.gameState.blueStones) {
            // Server sent game state, normalize to node-based format if needed
            // Check if already normalized (has nodeId property)
            const needsNormalization = this.gameState.orangeStones.some(s => !s.nodeId || s.nodeId.match(/^(LT|LM|LB|RT|RM|RB|C_UL|C_DR)$/));
            if (needsNormalization) {
                console.log('[DEBUG] initializeGameBoard: Normalizing game state from server');
                this.normalizeGameStateToNodes();
            } else {
                console.log('[DEBUG] initializeGameBoard: Game state already normalized');
            }
        } else {
            // Initialize stones positions if not provided
            console.log('[DEBUG] initializeGameBoard: Initializing new stones');
            this.initializeStones();
        }
        
        // Set turn indicator
        this.isMyTurn = this.playerColor === this.gameState.currentTurn;
        
        this.updateGameBoard();
        
        // Check if game has started (stones moved from initial positions)
        // Open dice modal only if:
        // 1. Dice not resolved yet
        // 2. Game has not started (stones are still in initial positions)
        const hasGameStarted = this.hasGameStarted();
        const isNewGame = !hasGameStarted;
        
        // If game has started (stones moved), dice must be resolved (no dice roll needed)
        if (hasGameStarted) {
            this.diceResolved = true;
            console.log('[DEBUG] initializeGameBoard: Game has started (stones moved), forcing diceResolved to true', {
                hasGameStarted: hasGameStarted,
                diceResolved: this.diceResolved
            });
        }
        
        // IMPORTANT: If dice is already resolved (from server), don't show dice modal
        // This means the game has effectively started (dice was rolled, even if stones are in initial positions)
        const shouldShowDice = !this.diceResolved && isNewGame;
        
        console.log('[DEBUG] initializeGameBoard: Checking game state', {
            roomCode: this.roomCode,
            gameState: this.gameState,
            orangeStones: this.gameState?.orangeStones,
            blueStones: this.gameState?.blueStones,
            orangeStonesLength: this.gameState?.orangeStones?.length || 0,
            blueStonesLength: this.gameState?.blueStones?.length || 0,
            isNewGame: isNewGame,
            hasGameStarted: hasGameStarted,
            diceResolved: this.diceResolved,
            shouldShowDice: shouldShowDice,
            status: shouldShowDice ? 'SHOWING_DICE_ROLL' : (isNewGame ? 'DICE_ALREADY_RESOLVED' : 'GAME_IN_PROGRESS'),
            decision: shouldShowDice ? 'WILL_SHOW_DICE' : (isNewGame ? 'DICE_ALREADY_RESOLVED' : 'GAME_IN_PROGRESS')
        });
        
        if (shouldShowDice) {
            // New game or game after player left - show dice modal
            console.log('[DEBUG] initializeGameBoard: Opening dice modal', {
                reason: 'shouldShowDice is true',
                diceResolved: this.diceResolved,
                isNewGame: isNewGame,
                hasGameStarted: hasGameStarted
            });
            this.openDiceModal();
        } else if (hasGameStarted) {
            // Game already started (stones moved), don't show dice modal
            console.log('[DEBUG] initializeGameBoard: Game already in progress, dice resolved, NOT showing modal', {
                reason: 'Game has started (stones moved)',
                hasGameStarted: hasGameStarted,
                diceResolved: this.diceResolved
            });
        } else {
            console.log('[DEBUG] initializeGameBoard: Dice already resolved, not showing modal', {
                reason: 'Dice already resolved but game not started',
                diceResolved: this.diceResolved,
                isNewGame: isNewGame,
                hasGameStarted: hasGameStarted
            });
        }
    }
    
    // Check if game has started by comparing current positions with initial positions
    hasGameStarted() {
        if (!this.gameState || !this.gameState.orangeStones || !this.gameState.blueStones) {
            console.log('[DEBUG] hasGameStarted: No game state or stones', {
                hasGameState: !!this.gameState,
                hasOrangeStones: !!(this.gameState && this.gameState.orangeStones),
                hasBlueStones: !!(this.gameState && this.gameState.blueStones),
                result: false
            });
            return false;
        }
        
        // If stones arrays are empty, game has not started
        if (this.gameState.orangeStones.length === 0 && this.gameState.blueStones.length === 0) {
            console.log('[DEBUG] hasGameStarted: Empty stone arrays', {
                orangeStonesLength: this.gameState.orangeStones.length,
                blueStonesLength: this.gameState.blueStones.length,
                result: false
            });
            return false;
        }
        
        // Initial positions (as sets, order doesn't matter)
        const initialOrangeNodes = new Set(['10', '9', '8']);
        const initialBlueNodes = new Set(['5', '6', '7']);
        
        // Get current positions
        const currentOrangeNodes = new Set(this.gameState.orangeStones.map(s => s.nodeId));
        const currentBlueNodes = new Set(this.gameState.blueStones.map(s => s.nodeId));
        
        // If we don't have the expected number of stones, game has not started
        if (currentOrangeNodes.size !== initialOrangeNodes.size || currentBlueNodes.size !== initialBlueNodes.size) {
            console.log('[DEBUG] hasGameStarted: Wrong number of stones', {
                orangeStonesCount: currentOrangeNodes.size,
                expectedOrangeCount: initialOrangeNodes.size,
                blueStonesCount: currentBlueNodes.size,
                expectedBlueCount: initialBlueNodes.size,
                result: false
            });
            return false;
        }
        
        // Check if all orange stones are still in initial positions
        const orangeInInitial = 
            currentOrangeNodes.size === initialOrangeNodes.size &&
            [...currentOrangeNodes].every(nodeId => initialOrangeNodes.has(nodeId));
        
        // Check if all blue stones are still in initial positions
        const blueInInitial = 
            currentBlueNodes.size === initialBlueNodes.size &&
            [...currentBlueNodes].every(nodeId => initialBlueNodes.has(nodeId));
        
        // Game has started if at least one stone has moved from initial positions
        const hasStarted = !(orangeInInitial && blueInInitial);
        
        console.log('[DEBUG] hasGameStarted: Checking stone positions', {
            orangeStones: this.gameState.orangeStones.map(s => s.nodeId),
            blueStones: this.gameState.blueStones.map(s => s.nodeId),
            orangeInInitial: orangeInInitial,
            blueInInitial: blueInInitial,
            hasStarted: hasStarted,
            status: hasStarted ? 'GAME_STARTED' : 'GAME_NOT_STARTED'
        });
        
        return hasStarted;
    }

    // Map legacy x,y stones coming from server to nearest board nodes
    normalizeGameStateToNodes() {
        console.log('[DEBUG] normalizeGameStateToNodes: Starting normalization', {
            orangeStones: this.gameState?.orangeStones,
            blueStones: this.gameState?.blueStones
        });
        
        // Map old node IDs to new node IDs
        const nodeIdMap = {
            'LT': '10',  // Left Top -> 10
            'LM': '9',   // Left Middle -> 9
            'LB': '8',   // Left Bottom -> 8
            'RT': '5',   // Right Top -> 5
            'RM': '6',   // Right Middle -> 6
            'RB': '7',   // Right Bottom -> 7
            'C_UL': '3', // Center Upper Left -> 3
            'C_DR': '2'  // Center Down Right -> 2
        };
        
        const toNode = (stone) => {
            // Map old node ID to new node ID if exists
            let newNodeId = stone.nodeId;
            if (nodeIdMap[stone.nodeId]) {
                newNodeId = nodeIdMap[stone.nodeId];
                console.log(`[DEBUG] Mapped old nodeId "${stone.nodeId}" to new nodeId "${newNodeId}"`);
            } else if (!this.boardNodes[stone.nodeId] && stone.nodeId) {
                // If node ID doesn't exist in new board, try to find nearest
                newNodeId = this.findNearestNodeId(stone.x || 0, stone.y || 0);
                console.log(`[DEBUG] NodeId "${stone.nodeId}" not found, mapped to nearest: "${newNodeId}"`);
            } else if (!stone.nodeId) {
                // If no nodeId, find nearest
                newNodeId = this.findNearestNodeId(stone.x || 0, stone.y || 0);
            }
            
            return {
                id: stone.id?.toString().startsWith('orange') || stone.id?.toString().startsWith('blue') ? stone.id : `${this.playerColor || 'stone'}-${stone.id || 0}`,
                nodeId: newNodeId,
                number: stone.number || parseInt(stone.id, 10) || 0,
                reachedGoal: !!stone.reachedGoal
            };
        };
        
        const beforeOrange = this.gameState?.orangeStones ? [...this.gameState.orangeStones] : [];
        const beforeBlue = this.gameState?.blueStones ? [...this.gameState.blueStones] : [];
        
        if (Array.isArray(this.gameState.orangeStones)) {
            this.gameState.orangeStones = this.gameState.orangeStones.map(toNode);
        }
        if (Array.isArray(this.gameState.blueStones)) {
            this.gameState.blueStones = this.gameState.blueStones.map(toNode);
        }
        
        console.log('[DEBUG] normalizeGameStateToNodes: Normalization complete', {
            beforeOrange: beforeOrange.map(s => s.nodeId),
            afterOrange: this.gameState.orangeStones.map(s => s.nodeId),
            beforeBlue: beforeBlue.map(s => s.nodeId),
            afterBlue: this.gameState.blueStones.map(s => s.nodeId)
        });
    }

    findNearestNodeId(x, y) {
        let best = null;
        let bestDist = Infinity;
        const entries = Object.values(this.boardNodes);
        for (const n of entries) {
            const dx = n.x - x;
            const dy = n.y - y;
            const d2 = dx*dx + dy*dy;
            if (d2 < bestDist) {
                bestDist = d2;
                best = n.id;
            }
        }
        return best || '9';
    }
    
    initializeStones() {
        // Orange stones start at 10, 9, 8 (left side)
        // Blue stones start at 5, 6, 7 (right side)
        const orangeNodes = ['10', '9', '8'];
        const blueNodes   = ['5', '6', '7'];
        
        this.gameState.orangeStones = orangeNodes.map((nodeId, index) => ({
            id: `orange-${index+1}`,
            nodeId,
            reachedGoal: false,
            number: index+1
        }));
        
        this.gameState.blueStones = blueNodes.map((nodeId, index) => ({
            id: `blue-${index+1}`,
            nodeId,
            reachedGoal: false,
            number: index+1
        }));
    }
    
    updateGameBoard() {
        const board = document.getElementById('gameBoard');
        
        if (!board) {
            console.error('[DEBUG] gameBoard element not found!');
            return;
        }
        
        console.log('[DEBUG] updateGameBoard called');
        console.log('[DEBUG] Orange stones:', this.gameState.orangeStones);
        console.log('[DEBUG] Blue stones:', this.gameState.blueStones);
        
        // Remove existing stones and node numbers
        const existingStones = board.querySelectorAll('.stone, .move-hint, .node-number');
        console.log('[DEBUG] Removing', existingStones.length, 'existing stones/numbers');
        existingStones.forEach(stone => stone.remove());
        
        // Draw node numbers (all nodes with numbers)
        // Numbering matches the visual: Left side 10,9,8 | Right side 5,6,7 | Center 3,4,1,2
        // Each node uses its own ID as the label (10, 9, 8, 5, 6, 7, 4, 1, 3, 2)
        
        // Draw all node numbers (always visible)
        Object.keys(this.boardNodes).forEach(nodeId => {
            const node = this.boardNodes[nodeId];
            const all = [...this.gameState.orangeStones, ...this.gameState.blueStones];
            const occupied = new Set(all.map(s => s.nodeId));
            
            const nodeNumber = document.createElement('div');
            nodeNumber.className = 'node-number';
            nodeNumber.textContent = nodeId; // Use node ID directly as label
            
            // Get responsive position
            const pos = this.getNodePosition(nodeId);
            
            // Get node number size for centering (responsive)
            const boardRect = board.getBoundingClientRect();
            const boardSize = boardRect.width || this.baseBoardSize;
            const nodeNumberSize = Math.max(12, boardSize * 0.02); // Responsive node number size
            
            nodeNumber.style.left = `${pos.x - nodeNumberSize}px`;
            nodeNumber.style.top = `${pos.y - nodeNumberSize}px`;
            nodeNumber.setAttribute('data-node', nodeId);
            
            // If node is occupied, make number less visible
            if (occupied.has(nodeId)) {
                nodeNumber.style.opacity = '0.5';
                nodeNumber.style.background = 'rgba(200, 200, 200, 0.5)';
            }
            
            board.appendChild(nodeNumber);
        });
        
        // Draw orange stones
        console.log('[DEBUG] Drawing', this.gameState.orangeStones.length, 'orange stones');
        this.gameState.orangeStones.forEach((stone, index) => {
            console.log(`[DEBUG] Orange stone ${index + 1}:`, stone);
            const stoneEl = this.createStoneElement(stone, 'orange');
            console.log(`[DEBUG] Created orange stone element:`, stoneEl);
            console.log(`[DEBUG] Stone position: left=${stoneEl.style.left}, top=${stoneEl.style.top}`);
            board.appendChild(stoneEl);
        });
        
        // Draw blue stones
        console.log('[DEBUG] Drawing', this.gameState.blueStones.length, 'blue stones');
        this.gameState.blueStones.forEach((stone, index) => {
            console.log(`[DEBUG] Blue stone ${index + 1}:`, stone);
            const stoneEl = this.createStoneElement(stone, 'blue');
            console.log(`[DEBUG] Created blue stone element:`, stoneEl);
            console.log(`[DEBUG] Stone position: left=${stoneEl.style.left}, top=${stoneEl.style.top}`);
            board.appendChild(stoneEl);
        });
        
        // Debug: Check if stones are actually in DOM
        const allStones = board.querySelectorAll('.stone');
        console.log('[DEBUG] Total stones in DOM after drawing:', allStones.length);
        allStones.forEach((stone, index) => {
            console.log(`[DEBUG] Stone ${index + 1} in DOM:`, {
                id: stone.id,
                className: stone.className,
                left: stone.style.left,
                top: stone.style.top,
                display: stone.style.display,
                computedStyle: window.getComputedStyle(stone).display
            });
        });
        
        // Update turn indicator
        this.updateTurnIndicator();
    }
    
    createStoneElement(stone, color) {
        console.log(`[DEBUG] createStoneElement called for ${color} stone:`, stone);
        const stoneEl = document.createElement('div');
        stoneEl.className = `stone ${color}`;
        stoneEl.id = stone.id;
        const node = this.boardNodes[stone.nodeId] || null;
        console.log(`[DEBUG] Node for stone.nodeId="${stone.nodeId}":`, node);
        
        // Get board element
        const board = document.getElementById('gameBoard');
        if (!board) {
            console.error('[DEBUG] createStoneElement: gameBoard element not found!');
            return stoneEl;
        }
        
        if (node) {
            // Get responsive position
            const pos = this.getNodePosition(stone.nodeId);
            
            // Get stone size for centering (responsive)
            const boardRect = board.getBoundingClientRect();
            const boardSize = boardRect.width || this.baseBoardSize;
            const stoneSize = Math.max(25, boardSize * 0.042); // Responsive stone size (approximately 50px at 600px board)
            
            stoneEl.style.left = `${pos.x - stoneSize}px`;
            stoneEl.style.top = `${pos.y - stoneSize}px`;
            console.log(`[DEBUG] Stone positioned at node: x=${pos.x}, y=${pos.y}, left=${stoneEl.style.left}, top=${stoneEl.style.top}`);
        } else {
            // Fallback to x,y if node unknown (legacy state)
            const boardRect = board.getBoundingClientRect();
            const boardSize = boardRect.width || this.baseBoardSize;
            const stoneSize = Math.max(25, boardSize * 0.042); // Responsive stone size
            stoneEl.style.left = `${(stone.x || 0) - stoneSize}px`;
            stoneEl.style.top = `${(stone.y || 0) - stoneSize}px`;
            console.warn(`[DEBUG] Node not found for stone.nodeId="${stone.nodeId}", using fallback position:`, stoneEl.style.left, stoneEl.style.top);
        }
        // Number label - show nodeId (the position number) instead of stone number
        stoneEl.textContent = stone.nodeId || stone.number || '';
        stoneEl.style.display = 'flex';
        stoneEl.style.alignItems = 'center';
        stoneEl.style.justifyContent = 'center';
        stoneEl.style.color = '#111';
        stoneEl.style.fontWeight = '900';
        stoneEl.style.position = 'absolute'; // Ensure absolute positioning
        stoneEl.style.zIndex = '10'; // Ensure z-index
        
        console.log(`[DEBUG] Stone element created:`, {
            id: stoneEl.id,
            className: stoneEl.className,
            left: stoneEl.style.left,
            top: stoneEl.style.top,
            display: stoneEl.style.display,
            position: stoneEl.style.position,
            zIndex: stoneEl.style.zIndex
        });
        
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
    
    /**
     * Check if opponent has any valid moves after a hypothetical move
     * @param {string} currentColor - Current player color ('orange' or 'blue')
     * @param {string} fromNodeId - Node ID where stone is moving from
     * @param {string} toNodeId - Node ID where stone is moving to
     * @param {Array} orangeStones - Current orange stones
     * @param {Array} blueStones - Current blue stones
     * @returns {boolean} - True if opponent has at least one valid move, false otherwise
     */
    checkOpponentHasValidMoves(currentColor, fromNodeId, toNodeId, orangeStones, blueStones) {
        // Create a temporary game state with the move applied
        const tempOrangeStones = orangeStones.map(s => ({ ...s }));
        const tempBlueStones = blueStones.map(s => ({ ...s }));
        
        // Apply the move to temporary state
        const tempCollection = currentColor === 'orange' ? tempOrangeStones : tempBlueStones;
        const stoneIndex = tempCollection.findIndex(s => s.nodeId === fromNodeId);
        if (stoneIndex !== -1) {
            tempCollection[stoneIndex] = { ...tempCollection[stoneIndex], nodeId: toNodeId };
        }
        
        // Get opponent's stones
        const opponentStones = currentColor === 'orange' ? tempBlueStones : tempOrangeStones;
        
        // Get all occupied nodes after the move
        const allTempStones = [...tempOrangeStones, ...tempBlueStones];
        const occupied = new Set(allTempStones.map(s => s.nodeId));
        
        // Check if opponent has at least one stone that can move
        for (const stone of opponentStones) {
            const stoneNode = this.boardNodes[stone.nodeId];
            if (!stoneNode) continue;
            
            // Check if this stone has at least one empty neighbor
            const hasValidMove = stoneNode.neighbors.some(neighborId => !occupied.has(neighborId));
            if (hasValidMove) {
                return true; // Opponent has at least one valid move
            }
        }
        
        return false; // Opponent has no valid moves
    }

    showPossibleMoves(stoneId) {
        // Clear previous hints
        const board = document.getElementById('gameBoard');
        board.querySelectorAll('.move-hint').forEach(h => h.remove());
        
        // Find stone and its node
        const all = [...this.gameState.orangeStones, ...this.gameState.blueStones];
        const stone = all.find(s => s.id === stoneId);
        if (!stone) return;
        const currentNode = this.boardNodes[stone.nodeId];
        
        // Occupied nodes
        const occupied = new Set(all.map(s => s.nodeId));
        
        // Neighbor nodes that are empty
        const targets = currentNode.neighbors.filter(n => !occupied.has(n));
        
        // Filter out moves that would block opponent completely
        const currentColor = this.gameState.currentTurn;
        const validTargets = targets.filter(toNodeId => {
            const opponentHasMoves = this.checkOpponentHasValidMoves(
                currentColor,
                stone.nodeId,
                toNodeId,
                this.gameState.orangeStones,
                this.gameState.blueStones
            );
            return opponentHasMoves;
        });
        
        // Render hints only for valid moves
        validTargets.forEach(nodeId => {
            const pos = this.getNodePosition(nodeId);
            const hint = document.createElement('div');
            hint.className = 'move-hint';
            
            // Get hint size for centering (responsive)
            const boardRect = board.getBoundingClientRect();
            const boardSize = boardRect.width || this.baseBoardSize;
            const hintSize = Math.max(14, boardSize * 0.023); // Responsive hint size
            
            hint.style.left = `${pos.x - hintSize}px`;
            hint.style.top = `${pos.y - hintSize}px`;
            hint.addEventListener('click', (e) => {
                e.stopPropagation();
                this.makeGraphMove(stoneId, nodeId);
            });
            hint.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.makeGraphMove(stoneId, nodeId);
            });
            board.appendChild(hint);
        });
    }

    makeGraphMove(stoneId, toNodeId) {
        console.log('[DEBUG] makeGraphMove called', {
            stoneId: stoneId,
            toNodeId: toNodeId,
            currentTurn: this.gameState.currentTurn,
            myColor: this.playerColor,
            isMyTurn: this.gameState.currentTurn === this.playerColor
        });
        
        // Validate move: check if target node is a neighbor and empty
        let collection = this.gameState.currentTurn === 'orange' ? this.gameState.orangeStones : this.gameState.blueStones;
        const idx = collection.findIndex(s => s.id === stoneId);
        if (idx === -1) {
            console.log('[DEBUG] makeGraphMove: Stone not found in collection', { stoneId, currentTurn: this.gameState.currentTurn });
            return;
        }
        
        const stone = collection[idx];
        const fromNodeId = stone.nodeId; // Save original position BEFORE moving
        const currentNode = this.boardNodes[fromNodeId];
        
        if (!currentNode) {
            console.error('[DEBUG] makeGraphMove: Current node not found:', fromNodeId);
            return;
        }
        
        // Check if target node is a neighbor (1 step away)
        if (!currentNode.neighbors.includes(toNodeId)) {
            console.error('[DEBUG] makeGraphMove: Target node is not a neighbor:', toNodeId, 'Current:', fromNodeId, 'Neighbors:', currentNode.neighbors);
            alert('Yalnız qonşu boş nöqtəyə hərəkət edə bilərsiniz');
            return;
        }
        
        // Check if target node is empty
        const all = [...this.gameState.orangeStones, ...this.gameState.blueStones];
        const occupied = new Set(all.map(s => s.nodeId));
        
        if (occupied.has(toNodeId)) {
            console.error('[DEBUG] makeGraphMove: Target node is occupied:', toNodeId);
            alert('Bu nöqtə doludur');
            return;
        }
        
        const currentColor = this.gameState.currentTurn;
        
        // Check if this move would block opponent completely (stalemate prevention)
        const opponentHasMoves = this.checkOpponentHasValidMoves(
            currentColor,
            fromNodeId,
            toNodeId,
            this.gameState.orangeStones,
            this.gameState.blueStones
        );
        
        if (!opponentHasMoves) {
            console.error('[DEBUG] makeGraphMove: Move would block opponent completely:', {
                fromNodeId,
                toNodeId,
                currentColor
            });
            alert('Bu hərəkət rəqibin bütün yollarını bağlayır. Belə bir hərəkətə icazə verilmir.');
            return;
        }
        const previousTurn = currentColor;
        const goalNodes = currentColor === 'orange' ? ['5', '6', '7'] : ['10', '9', '8'];
        
        // Check if stone reached goal
        const reachedGoal = goalNodes.includes(toNodeId);
        collection[idx] = { ...collection[idx], nodeId: toNodeId, reachedGoal };
        
        console.log('[DEBUG] makeGraphMove: Stone moved', {
            stoneId: stoneId,
            fromNodeId: fromNodeId,
            toNodeId: toNodeId,
            reachedGoal: reachedGoal,
            currentColor: currentColor
        });
        
        // Check win condition
        const allStonesReachedGoal = collection.every(stone => stone.reachedGoal);
        if (allStonesReachedGoal) {
            this.gameState.gameOver = true;
            this.gameState.winner = currentColor;
            console.log('[DEBUG] makeGraphMove: Game over!', {
                winner: currentColor,
                gameOver: true
            });
        }
        
        // Clear selection and hints
        this.selectedStone = null;
        const board = document.getElementById('gameBoard');
        board.querySelectorAll('.move-hint').forEach(h => h.remove());
        
        // Switch turn only if game is not over
        if (!this.gameState.gameOver) {
            const newTurn = this.gameState.currentTurn === 'orange' ? 'blue' : 'orange';
            this.gameState.currentTurn = newTurn;
            console.log('[DEBUG] makeGraphMove: Turn switched', {
                previousTurn: previousTurn,
                newTurn: newTurn,
                myColor: this.playerColor,
                isMyTurn: newTurn === this.playerColor,
                status: newTurn === this.playerColor ? 'SIRA SIZDƏ' : 'SIRA RƏQİBDƏ'
            });
        } else {
            console.log('[DEBUG] makeGraphMove: Game over, turn not switched', {
                winner: this.gameState.winner
            });
        }
        
        // Send to server (compatible with legacy x,y move handler)
        const target = this.boardNodes[toNodeId];
        const fromNode = this.boardNodes[fromNodeId];
        console.log('[DEBUG] makeGraphMove: Sending move to server', {
            roomCode: this.roomCode,
            stoneId: stoneId,
            fromNodeId: fromNodeId,
            toNodeId: toNodeId,
            reachedGoal: reachedGoal,
            gameOver: this.gameState.gameOver,
            winner: this.gameState.winner
        });
        
        this.sendMessage('make_move', {
            roomCode: this.roomCode,
            stoneId,
            fromNodeId: fromNodeId, // Send original position to server
            x: target ? target.x : undefined,
            y: target ? target.y : undefined,
            fromX: fromNode ? fromNode.x : undefined,
            fromY: fromNode ? fromNode.y : undefined,
            toNodeId,
            reachedGoal,
            gameOver: this.gameState.gameOver,
            winner: this.gameState.winner
        });
        
        // Re-render
        this.updateGameBoard();
        
        // Show game over if won
        if (this.gameState.gameOver) {
            this.showGameOver(this.gameState.winner);
        }
    }

    setupDiceUI() {
        const modal = document.getElementById('diceModal');
        const rollBtn = document.getElementById('rollDiceBtn');
        const diceResult = document.getElementById('diceResult');
        if (!modal || !rollBtn) return;
        diceResult.textContent = '';
        rollBtn.onclick = () => {
            // Request server to roll (authoritative)
            if (rollBtn.disabled) return;
            rollBtn.disabled = true;
            diceResult.textContent = 'Göndərilir...';
            this.sendMessage('request_roll', { roomCode: this.roomCode });
        };
    }

    create3DDice(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        
        // Clear container
        container.innerHTML = '';
        
        const scene = document.createElement('div');
        scene.className = 'dice-scene';
        scene.id = containerId + '_scene';
        
        const cube = document.createElement('div');
        cube.className = 'dice-cube';
        cube.id = containerId + '_cube';
        
        // Create all 6 faces
        const faces = [
            { class: 'dice-cube__face--front dice-cube__face--1', dots: 1 },
            { class: 'dice-cube__face--back dice-cube__face--6', dots: 6 },
            { class: 'dice-cube__face--right dice-cube__face--3', dots: 3 },
            { class: 'dice-cube__face--left dice-cube__face--4', dots: 4 },
            { class: 'dice-cube__face--top dice-cube__face--2', dots: 2 },
            { class: 'dice-cube__face--bottom dice-cube__face--5', dots: 5 }
        ];
        
        faces.forEach(face => {
            const faceEl = document.createElement('div');
            faceEl.className = `dice-cube__face ${face.class}`;
            for (let i = 0; i < face.dots; i++) {
                const dot = document.createElement('span');
                dot.className = 'dice-dot';
                faceEl.appendChild(dot);
            }
            cube.appendChild(faceEl);
        });
        
        scene.appendChild(cube);
        container.appendChild(scene);
        
        return { scene, cube };
    }

    roll3DDice(containerId, value) {
        const scene = document.getElementById(containerId + '_scene');
        const cube = document.getElementById(containerId + '_cube');
        if (!scene || !cube) return;
        
        const rotations = {
            1: { x: 0,    y: 0    },
            6: { x: 0,    y: 180  },
            3: { x: 0,    y: -90  },
            4: { x: 0,    y: 90   },
            2: { x: -90,  y: 0    },
            5: { x: 90,   y: 0    }
        };
        
        const rollDuration = '2.5s';
        const rollTimingFunction = 'cubic-bezier(0.25, 0.9, 0.5, 1.0)';
        const initialCenterZ = -55; // --dice-size / 2
        
        const finalFace = rotations[value];
        const fullRotationsX = 360 * (2 + Math.floor(Math.random() * 3));
        const fullRotationsY = 360 * (2 + Math.floor(Math.random() * 3));
        const fullRotationsZ = 360 * (1 + Math.floor(Math.random() * 2));
        
        const targetRotateX = finalFace.x + fullRotationsX;
        const targetRotateY = finalFace.y + fullRotationsY;
        const targetRotateZ = 0 + fullRotationsZ;
        
        scene.classList.add('is-smoking');
        cube.style.transition = `transform ${rollDuration} ${rollTimingFunction}`;
        cube.style.transform = `translateZ(${initialCenterZ}px) rotateX(${targetRotateX}deg) rotateY(${targetRotateY}deg) rotateZ(${targetRotateZ}deg)`;
        
        setTimeout(() => {
            cube.style.transition = 'none';
            scene.classList.remove('is-smoking');
            cube.style.transform = `translateZ(${initialCenterZ}px) rotateX(${finalFace.x}deg) rotateY(${finalFace.y}deg) rotateZ(0deg)`;
        }, 2550);
    }

    openDiceModal() {
        const modal = document.getElementById('diceModal');
        const info = document.getElementById('diceInfo');
        const diceResult = document.getElementById('diceResult');
        const p1Name = document.getElementById('diceP1Name');
        const p2Name = document.getElementById('diceP2Name');
        const p1Status = document.getElementById('diceP1Status');
        const p2Status = document.getElementById('diceP2Status');
        const players = this.playersByColor || {};
        const rollBtn = document.getElementById('rollDiceBtn');
        
        if (!modal) return;
        
        // Set player names
        if (p1Name) p1Name.textContent = players.orange || 'Turuncu';
        if (p2Name) p2Name.textContent = players.blue || 'Mavi';
        
        // Reset values
        const p1Val = document.getElementById('diceP1Val');
        const p2Val = document.getElementById('diceP2Val');
        if (p1Val) p1Val.textContent = '-';
        if (p2Val) p2Val.textContent = '-';
        if (p1Status) p1Status.textContent = 'Gözlənir...';
        if (p2Status) p2Status.textContent = 'Gözlənir...';
        
        diceResult.textContent = '';
        info.textContent = 'Hər iki oyunçu zar atsın.';
        
        // Enable roll button
        if (rollBtn) {
            rollBtn.disabled = false;
            rollBtn.textContent = 'Zarı At';
        }
        
        // Create 3D dice for both players
        this.create3DDice('diceP1Container');
        this.create3DDice('diceP2Container');
        
        modal.style.display = 'block';
    }

    closeDiceModal() {
        const modal = document.getElementById('diceModal');
        if (modal) modal.style.display = 'none';
    }

    showDiceRoll(username, roll, color) {
        // Use color if provided, otherwise map username to color
        let isOrange = false;
        if (color) {
            isOrange = color === 'orange';
        } else {
            const players = this.playersByColor || {};
            isOrange = players.orange === username;
        }
        
        const containerId = isOrange ? 'diceP1Container' : 'diceP2Container';
        const valEl = document.getElementById(isOrange ? 'diceP1Val' : 'diceP2Val');
        const statusEl = document.getElementById(isOrange ? 'diceP1Status' : 'diceP2Status');
        
        // Show roll value
        if (valEl) valEl.textContent = String(roll);
        if (statusEl) statusEl.textContent = 'Atıldı';
        
        // Animate 3D dice
        this.roll3DDice(containerId, roll);
    }

    applyDiceResult(data) {
        // data: { rolls: {orange:n, blue:n}, starter: 'orange'|'blue' }
        const info = document.getElementById('diceInfo');
        const diceResult = document.getElementById('diceResult');
        const rollBtn = document.getElementById('rollDiceBtn');
        
        if (data.rolls) {
            // Show both dice values
            const p1Val = document.getElementById('diceP1Val');
            const p2Val = document.getElementById('diceP2Val');
            if (p1Val) p1Val.textContent = String(data.rolls.orange ?? '-');
            if (p2Val) p2Val.textContent = String(data.rolls.blue ?? '-');
            
            // Animate both dice if not already animated
            if (data.rolls.orange) {
                this.roll3DDice('diceP1Container', data.rolls.orange);
            }
            if (data.rolls.blue) {
                this.roll3DDice('diceP2Container', data.rolls.blue);
            }
        }
        
        if (data.tie) {
            if (info) info.textContent = 'Bərabərlik! Yenidən atın.';
            if (diceResult) diceResult.textContent = 'Bərabərlik! Yenidən atın.';
            if (rollBtn) {
                rollBtn.disabled = false;
                rollBtn.textContent = 'Yenidən At';
            }
            // Reset status
            const p1Status = document.getElementById('diceP1Status');
            const p2Status = document.getElementById('diceP2Status');
            if (p1Status) p1Status.textContent = 'Gözlənir...';
            if (p2Status) p2Status.textContent = 'Gözlənir...';
            return;
        }
        
        if (data.starter) {
            const who = data.starter === 'orange'
                ? ((this.playersByColor && this.playersByColor.orange) || 'Turuncu')
                : ((this.playersByColor && this.playersByColor.blue) || 'Mavi');
            if (info) info.textContent = `İlk başlayan: ${who}`;
            if (diceResult) diceResult.textContent = `🎲 İlk başlayan: ${who}`;
            
            // Update turn locally and re-render
            this.gameState.currentTurn = data.starter;
            this.updateTurnIndicator();
            this.diceResolved = true;
            
            // Hide modal after delay
            setTimeout(() => {
                this.closeDiceModal();
                // Start game after dice is resolved
                if (!this.gameState.gameOver) {
                    this.updateGameBoard();
                }
            }, 3000);
        }
    }
    
    updateTurnIndicator() {
        const orangePlayer = document.getElementById('playerOrange');
        const bluePlayer = document.getElementById('playerBlue');
        const status = document.getElementById('gameStatus');
        
        const previousIsMyTurn = this.isMyTurn;
        const currentTurn = this.gameState.currentTurn;
        
        orangePlayer.classList.remove('current-turn');
        bluePlayer.classList.remove('current-turn');
        
        if (this.gameState.currentTurn === 'orange') {
            orangePlayer.classList.add('current-turn');
            if (status) status.textContent = this.playerColor === 'orange' ? 'Sıra sizdə' : 'Rəqib oynayır...';
        } else {
            bluePlayer.classList.add('current-turn');
            if (status) status.textContent = this.playerColor === 'blue' ? 'Sıra sizdə' : 'Rəqib oynayır...';
        }
        
        this.isMyTurn = this.gameState.currentTurn === this.playerColor;
        
        console.log('[DEBUG] updateTurnIndicator: Turn indicator updated', {
            currentTurn: currentTurn,
            myColor: this.playerColor,
            isMyTurn: this.isMyTurn,
            previousIsMyTurn: previousIsMyTurn,
            status: this.isMyTurn ? 'SIRA SIZDƏ' : 'SIRA RƏQİBDƏ',
            statusText: status ? status.textContent : 'N/A'
        });
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

