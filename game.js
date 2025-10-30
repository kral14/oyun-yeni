class TowerDefenseGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Ultra high quality rendering
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Additional quality settings
        this.ctx.textRenderingOptimization = 'optimizeLegibility';
        
        // Set up high DPI rendering
        this.setupHighDPIRendering();
        this.gameState = {
            health: 100,
            money: 500,
            wave: 1,
            score: 0,
            isPaused: false,
            gameOver: false
        };
        
        // Game objects
        this.towers = [];
        this.enemies = [];
        this.bullets = [];
        this.selectedTower = null;
        this.selectedTowerType = 'basic';
        this.towerCosts = {
            basic: 50,
            rapid: 100,
            heavy: 200
        };
        
        // Path for enemies (computed dynamically via A*)
        this.path = [];
        
        // Wave configuration
        this.waveConfig = {
            enemiesPerWave: 5,
            enemySpawnDelay: 1000,
            waveDelay: 3000
        };
        
        // Level sistemi - hər level düşmənlər güclənir
        this.currentLevel = 1;
        this.levelMultiplier = 1.0;
        
        this.currentWaveEnemies = 0;
        this.waveInProgress = false;
        this.lastEnemySpawn = 0;
        this.autoStart = false;
        
        // Grid configuration with FIXED cell counts (responsive pixel size)
        // Requested: board 11 x 15 and path centered (row 6)
        this.rows = 11;
        this.cols = 15;
        this.baseGridSize = 25;
        this.gridSize = this.baseGridSize;
        this.scale = 1;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
        this.updateGridDimensions();
        
        // Grid expansion system
        this.maxCols = 48; // maximum grid size
        this.maxRows = 27; // maximum grid size
        this.expansionCost = 100; // cost to expand grid
        this.expansionDiamonds = 5; // diamonds needed to expand grid
        this.diamonds = parseInt(localStorage.getItem('towerDefenseDiamonds') || '0'); // player's diamonds from localStorage
        
        // Game speed system
        this.gameSpeed = 1; // 1x, 2x, 3x speed
        this.lastUpdateTime = 0;
        
        // Debug system
        this.debugMode = true; // Enable debug to track tower deletion issues
        this.debugMessages = [];
        
        // Drag state - Kulelər köçürülməz, yalnız yeni kulelər sürüklənir
        this.isDraggingNew = false;
        this.mouseDownInfo = null; // {x,y,time, towerAtDown}
        this.hoverPos = { x: 0, y: 0 };
        this.hoverValid = false;

        // Context/hover helpers
        this.hoverTower = null;
        this.hoverTimer = null;
        this.longPressTimer = null;
        this.lastMovePos = { x: 0, y: 0 };

        this.init();
    }
    
    updateGridDimensions() {
        // Responsive: compute from actual canvas size
        const cw = this.canvas.width;   // device pixels
        const ch = this.canvas.height;  // device pixels

        // Leave padding around the board; use smaller pad on portrait to maximize fit
        const portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
        const padRatio = portrait ? 0.02 : 0.04;
        const pad = Math.max(6, Math.round(Math.min(cw, ch) * padRatio));
        const cellW = Math.floor((cw - pad * 2) / this.cols);
        const cellH = Math.floor((ch - pad * 2) / this.rows);
        this.gridSize = Math.max(10, Math.min(cellW, cellH));

        // Compute grid offsets to center with padding
        const boardW = this.gridSize * this.cols;
        const boardH = this.gridSize * this.rows;
        this.gridOffsetX = Math.round((cw - boardW) / 2);
        this.gridOffsetY = Math.round((ch - boardH) / 2);

        // Logical grid layout stays constant
        this.gridCols = this.cols;
        this.gridRows = this.rows;
        
        // Only set start and goal cells if they haven't been set yet
        if (!this.startCell || !this.goalCell) {
            const midRow = Math.floor(this.gridRows / 2);
            this.startCell = { col: 0, row: midRow };
            this.goalCell = { col: this.gridCols - 1, row: midRow };
        }

        // Scale factor relative to base size
        this.scale = this.gridSize / this.baseGridSize;
        this.debugLog(`Grid fixed: ${this.gridCols}x${this.gridRows}, gridSize=${this.gridSize}, offset=(${this.gridOffsetX},${this.gridOffsetY}), scale=${this.scale.toFixed(2)}`);
    }
    
    expandGrid() {
        // Check if game is in progress - NEVER allow expansion during game
        if (this.waveInProgress || this.enemies.length > 0 || this.gameState.wave > 1) {
            this.debugLog(`❌ Oyun zamanı grid genişləndirilə bilməz! Yalnız oyun başlamadan əvvəl genişləndirilə bilər.`);
            return;
        }
        
        if (this.cols < this.maxCols || this.rows < this.maxRows) {
            if (this.diamonds >= this.expansionDiamonds) {
                this.diamonds -= this.expansionDiamonds;
                localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
                
                // Expand grid only on the right and bottom edges
                if (this.cols < this.maxCols) this.cols += 4;
                if (this.rows < this.maxRows) this.rows += 2;
                
                // Recalculate grid dimensions
                this.updateGridDimensions();
                
                // Update goal cell's column for new grid. Start/goal rows remain fixed to initial middle row.
                this.goalCell.col = this.cols - 1;
                
                // Ensure start cell remains at original position
                this.startCell.col = 0;
                
                this.debugLog(`🗺️ Grid genişləndi! Yeni ölçü: ${this.cols}x${this.rows}`);
                this.debugLog(`🗺️ Yeni başlangıç: (${this.startCell.col}, ${this.startCell.row}), Bitiş: (${this.goalCell.col}, ${this.goalCell.row})`);
                
                // Update tower positions to match new grid
                this.updateTowerPositions();
                
                // Recompute path with new grid, considering existing towers
                this.recomputePath();
                
                // If no path found, try to find alternative path by removing some towers
                if (this.path.length === 0) {
                    this.debugLog(`⚠️ Yol tapılmadı, alternativ yol axtarılır...`);
                    this.findAlternativePath();
                }
                
                // Update existing enemies to new path
                this.updateEnemyPositions();
                
                // Increase expansion cost for next time
                this.expansionCost = Math.floor(this.expansionCost * 1.5);
                
                this.debugLog(`🗺️ Grid genişləndi! Yeni ölçü: ${this.cols}x${this.rows}, növbəti genişlənmə: $${this.expansionCost}`);
                this.updateUI();
            } else {
                this.debugLog(`❌ Kifayət qədər pul yoxdur! Lazım: $${this.expansionCost}, Mövcud: $${this.gameState.money}`);
            }
        } else {
            this.debugLog(`✅ Grid artıq maksimum ölçüdədir!`);
        }
    }
    
    updateTowerPositions() {
        this.debugLog(`🔄 Qüllələrin mövqeləri yenilənir...`);
        
        for (const tower of this.towers) {
            // Calculate new pixel position based on grid cell
            const newX = this.gridOffsetX + tower.col * this.gridSize + this.gridSize / 2;
            const newY = this.gridOffsetY + tower.row * this.gridSize + this.gridSize / 2;
            
            this.debugLog(`🏗️ Qüllə (${tower.col}, ${tower.row}): (${tower.x}, ${tower.y}) -> (${newX}, ${newY})`);
            
            // Update tower position
            tower.x = newX;
            tower.y = newY;
        }
        
        this.debugLog(`✅ ${this.towers.length} qüllənin mövqeyi yeniləndi`);
    }
    
    updateEnemyPositions() {
        this.debugLog(`🔄 Düşmənlərin mövqeləri yenilənir...`);
        
        for (const enemy of this.enemies) {
            // Reset enemy position to start of new path
            if (this.path.length > 0) {
                enemy.x = this.path[0].x;
                enemy.y = this.path[0].y;
                enemy.pathIndex = 0;
                this.debugLog(`👾 Düşmən yolun başlanğıcına köçürüldü: (${enemy.x}, ${enemy.y})`);
            }
        }
        
        this.debugLog(`✅ ${this.enemies.length} düşmənin mövqeyi yeniləndi`);
    }
    
    findAlternativePath() {
        this.debugLog(`🔍 Alternativ yol axtarılır...`);
        
        // Try to find path by temporarily removing some towers
        const originalTowers = [...this.towers];
        const blocked = this.getBlockedCells();
        
        // Try removing towers one by one to find a path
        for (let i = originalTowers.length - 1; i >= 0; i--) {
            const tower = originalTowers[i];
            const towerKey = `${tower.col},${tower.row}`;
            
            // Temporarily remove this tower
            this.towers.splice(i, 1);
            blocked.delete(towerKey);
            
            // Try to find path
            const route = this.findPath(blocked);
            if (route && route.length > 0) {
                this.path = route;
                this.debugLog(`✅ Alternativ yol tapıldı! ${originalTowers.length - this.towers.length} qüllə silindi`);
                return;
            }
            
            // Restore tower if no path found
            this.towers.splice(i, 0, tower);
            blocked.add(towerKey);
        }
        
        // If still no path, restore all towers
        this.towers = originalTowers;
        this.debugLog(`❌ Alternativ yol tapılmadı, bütün qüllələr bərpa edildi`);
    }
    
    setGameSpeed(speed) {
        this.gameSpeed = speed;
        this.debugLog(`⚡ Oyun sürəti dəyişdi: ${speed}x`);
        
        // Update UI
        document.querySelectorAll('.speed-controls button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`speed${speed}`).classList.add('active');
    }
    
    debugLog(message, type = 'INFO') {
        if (this.debugMode) {
            const timestamp = new Date().toLocaleTimeString();
            const logMessage = `[${timestamp}] [${type}] ${message}`;
            console.log(logMessage);
            this.debugMessages.push(logMessage);
            if (this.debugMessages.length > 200) this.debugMessages.shift();
        }
    }
    
    debugError(message) {
        this.debugLog(`❌ ERROR: ${message}`, 'ERROR');
        console.error(`[ERROR] ${message}`);
    }
    
    debugWarning(message) {
        this.debugLog(`⚠️ WARNING: ${message}`, 'WARNING');
        console.warn(`[WARNING] ${message}`);
    }
    
    debugSuccess(message) {
        this.debugLog(`✅ SUCCESS: ${message}`, 'SUCCESS');
        console.log(`[SUCCESS] ${message}`);
    }
    
    debugTower(message) {
        this.debugLog(`🏗️ TOWER: ${message}`, 'TOWER');
    }
    
    debugPath(message) {
        this.debugLog(`🛤️ PATH: ${message}`, 'PATH');
    }
    
    init() {
        this.setupEventListeners();
        this.setupResponsiveHandling();
        this.recomputePath();
        this.gameLoop();
    }
    
    setupResponsiveHandling() {
        const resizeCanvas = () => {
            // Use available space in first grid column
            const parent = this.canvas.parentElement || document.body;
            const parentW = Math.max(320, parent.clientWidth);
            // Account for viewport height (minus header + paddings ~ 140px buffer)
            const header = document.querySelector('.game-header');
            // When header becomes a left sidebar (mobile portrait), don't subtract its height
            const sidebarLeft = window.matchMedia('(max-width: 900px) and (orientation: portrait)').matches;
            const headerH = (!sidebarLeft && header) ? header.getBoundingClientRect().height : 0;
            // Smaller buffer in portrait to reduce wasted margins; leave a bit for HUD and padding
            const portrait = window.matchMedia('(orientation: portrait)').matches;
            const buffer = portrait ? 16 : 32;
            const availableH = Math.max(240, window.innerHeight - headerH - buffer);
            // Keep 16:9
            let cssW = Math.min(parentW, Math.round(availableH * 16 / 9));
            let cssH = Math.round(cssW * 9 / 16);
            // If height still bigger than available, clamp by height
            if (cssH > availableH) {
                cssH = availableH;
                cssW = Math.round(cssH * 16 / 9);
            }
            this.canvas.style.width = cssW + 'px';
            this.canvas.style.height = cssH + 'px';
            // Device pixel ratio backing store
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = Math.round(cssW * dpr);
            this.canvas.height = Math.round(cssH * dpr);
            // draw using device-pixel coordinates; avoid double-scaling
            this.ctx.setTransform(1,0,0,1,0,0);
            this.updateGridDimensions();

            // Magnet-like tower shop sizing and alignment
            const shop = document.querySelector('.tower-shop');
            const area = document.querySelector('.game-area');
            const isStacked = window.matchMedia('(max-width: 900px)').matches;
            if (shop && area) {
                if (isStacked) {
                    // Stack layout: full width below canvas
                    area.style.gridTemplateColumns = '1fr';
                    shop.style.width = '100%';
                    shop.style.height = 'auto';
                    shop.style.maxHeight = '';
                    shop.style.overflow = '';
                } else {
                    // Side-by-side: clamp width and height to canvas
                    const shopW = Math.max(220, Math.min(320, Math.round(cssW * 0.28)));
                    area.style.gridTemplateColumns = cssW + 'px ' + shopW + 'px';
                    shop.style.width = shopW + 'px';
                    shop.style.height = cssH + 'px';
                    shop.style.maxHeight = cssH + 'px';
                    shop.style.overflow = 'auto';
                }
            }
        };

        const doResize = () => {
            resizeCanvas();
            this.updateTowerPositions();
            this.recomputePath();
            this.retargetEnemiesToNewPath();
        };
        doResize();
        window.addEventListener('resize', doResize);

        // Prevent zoom with mouse wheel on desktop
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });
        
        // Prevent zoom with keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Disable Ctrl + Plus/Minus/0 zoom shortcuts
            if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            // Enable debug mode with F12
            if (e.key === 'F12') {
                this.debugMode = !this.debugMode;
                console.log(`Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
                if (this.debugMode) {
                    console.log('Debug messages:', this.debugMessages);
                }
            }
        });
        
        // Global hardening against zoom and context menu
        const preventAll = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
        // Disable Ctrl/Cmd zoom shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
        // Disable Ctrl+wheel zoom
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) { e.preventDefault(); e.stopPropagation(); }
        }, { passive: false });
        // Disable pinch zoom (multi-touch)
        document.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 1) { e.preventDefault(); e.stopPropagation(); }
        }, { passive: false });
        document.addEventListener('gesturestart', preventAll, { passive: false });
        document.addEventListener('gesturechange', preventAll, { passive: false });
        document.addEventListener('gestureend', preventAll, { passive: false });
        // Disable double-tap zoom
        document.addEventListener('dblclick', preventAll, { passive: false });
        // Disable context menu everywhere
        document.addEventListener('contextmenu', preventAll, { passive: false });

        // Basic touch support mapping to mouse events
        const touchToMouse = (type, te) => {
            const t = te.touches[0] || te.changedTouches[0];
            if (!t) return;
            const rect = this.canvas.getBoundingClientRect();
            const clientX = t.clientX - rect.left;
            const clientY = t.clientY - rect.top;
            const e = { clientX: rect.left + clientX, clientY: rect.top + clientY, preventDefault: () => {}, stopPropagation: () => {} };
            if (type==='down') this.canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + clientX, clientY: rect.top + clientY, bubbles:true }));
            if (type==='move') this.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + clientX, clientY: rect.top + clientY, bubbles:true }));
            if (type==='up') this.canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: rect.left + clientX, clientY: rect.top + clientY, bubbles:true }));
        };
        this.canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); touchToMouse('down', e); }, { passive:false });
        this.canvas.addEventListener('touchmove', (e)=>{ e.preventDefault(); touchToMouse('move', e); }, { passive:false });
        this.canvas.addEventListener('touchend', (e)=>{ e.preventDefault(); touchToMouse('up', e); }, { passive:false });
    }
    
    setupEventListeners() {
        // Canvas mouse interactions (drag place/move/select)
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.gameState.gameOver) return;
            const { x, y } = this.getCanvasCoords(e);

            this.debugLog(`Mouse down at (${x}, ${y})`);
            
            const towerAtPoint = this.getTowerAtPosition(x, y);
            this.mouseDownInfo = { x, y, time: Date.now(), towerAtDown: towerAtPoint };

            if (towerAtPoint) {
                this.debugLog(`Tower found at (${towerAtPoint.x}, ${towerAtPoint.y}) - Kule seçildi`);
                this.debugLog(`Selected tower type: ${this.selectedTowerType}, Money: $${this.gameState.money}`);

                // Start long-press to open context menu (500ms)
                clearTimeout(this.longPressTimer);
                this.longPressTimer = setTimeout(() => {
                    this.selectTower(towerAtPoint);
                    this.showTowerContextAt(towerAtPoint);
                }, 500);
                // Kulelər köçürülməz - yalnız seçilir və satıla bilər
                this.debugTower(`Kule seçildi - Köçürülməz, yalnız satıla bilər`);
                // Snap to grid center of the cell under cursor
                const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
                const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
                const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
                const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
                this.hoverPos = { x: gridX, y: gridY };
            } else {
                this.debugLog(`No tower at (${x}, ${y}) - Starting new tower placement`);
                // Start new tower drag ghost only if no tower is selected
                if (!this.selectedTower) {
                    const cost = this.towerCosts[this.selectedTowerType];
                    this.debugLog(`Tower type: ${this.selectedTowerType}, Cost: $${cost}, Money: $${this.gameState.money}`);
                    if (this.gameState.money >= cost) {
                        this.isDraggingNew = true;
                        // Snap to grid center of the cell under cursor
                        const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
                        const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
                        const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
                        const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
                        this.hoverPos = { x: gridX, y: gridY };
                        this.debugLog(`Starting new tower drag at (${gridX}, ${gridY})`);
                    } else {
                        this.debugLog(`Not enough money for tower (need ${cost}, have ${this.gameState.money})`);
                    }
                } else {
                    this.debugLog(`Cannot start new tower drag - tower is already selected`);
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.gameState.gameOver) return;
            const { x, y } = this.getCanvasCoords(e);
            this.lastMovePos = { x, y };
            // Hover-to-open after 400ms if stationary over a tower
            const t = this.getTowerAtPosition(x, y);
            if (t !== this.hoverTower) {
                this.hoverTower = t;
                clearTimeout(this.hoverTimer);
                this.hoverTimer = null;
                if (this.hoverTower) {
                    this.hoverTimer = setTimeout(() => {
                        this.selectTower(this.hoverTower);
                        this.showTowerContextAt(this.hoverTower);
                    }, 400);
                }
            }
            // Kulelər köçürülməz - yalnız yeni kulelər sürüklənir
            if (this.isDraggingNew) {
                // Snap to grid center of the cell under cursor
                const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
                const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
                const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
                const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
                this.hoverPos = { x: gridX, y: gridY };
                this.hoverValid = this.isValidTowerPosition(this.hoverPos.x, this.hoverPos.y);
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (this.gameState.gameOver) return;
            const { x, y } = this.getCanvasCoords(e);
            const wasDraggingNew = this.isDraggingNew;
            clearTimeout(this.longPressTimer);

            // Determine if this was a click (not a drag)
            let isClick = true;
            if (this.mouseDownInfo) {
                const dx = x - this.mouseDownInfo.x;
                const dy = y - this.mouseDownInfo.y;
                const dt = Date.now() - this.mouseDownInfo.time;
                const dist = Math.hypot(dx, dy);
                isClick = dist < Math.max(4, this.gridSize * 0.1) && dt < 300;
                this.debugLog(`mouseup: dist=${dist.toFixed(1)}, dt=${dt}ms => isClick=${isClick}`);
            }

            // Finish drags - Kulelər köçürülməz, yalnız yeni kulelər yerleşdirilir
            if (this.isDraggingNew) {
                this.debugLog(`Finishing new tower drag at (${this.hoverPos.x}, ${this.hoverPos.y})`);
                const valid = this.isValidTowerPosition(this.hoverPos.x, this.hoverPos.y);
                this.debugLog(`Position validity: ${valid ? 'VALID' : 'INVALID'}`);
                if (valid) {
                    this.debugLog(`Calling placeTower...`);
                    this.placeTower(this.hoverPos.x, this.hoverPos.y);
                } else {
                    this.debugLog(`Tower placement cancelled due to invalid position`);
                }
            }

            this.isDraggingNew = false;
            // Kulelər köçürülməz - dragTower və isDraggingExisting artıq yoxdur

            // Selection if it was a click without drag
            if (!wasDraggingNew && this.mouseDownInfo && isClick) {
                const towerAtPoint = this.getTowerAtPosition(x, y);
                this.debugLog(`Mouse up at (${x}, ${y}), tower found: ${!!towerAtPoint}`);
                
                if (towerAtPoint) {
                    this.debugLog(`Selecting tower at (${towerAtPoint.x}, ${towerAtPoint.y})`);
                    this.selectTower(towerAtPoint);
                    this.showTowerContextAt(towerAtPoint);
                } else {
                    this.debugLog('Deselecting tower');
                    this.deselectTower();
                    this.hideTowerContext();
                }
            }
            this.mouseDownInfo = null;
        });

        // Hide menu when leaving canvas
        this.canvas.addEventListener('mouseleave', () => {
            clearTimeout(this.hoverTimer);
            clearTimeout(this.longPressTimer);
            this.hoverTimer = null;
            this.longPressTimer = null;
        });
        
        // Tower selection
        document.querySelectorAll('.tower-option').forEach(option => {
            option.addEventListener('click', (e) => {
                this.selectTowerType(e.currentTarget.dataset.tower);
            });
        });
        
        // Game controls
        document.getElementById('startWave').addEventListener('click', () => {
            this.startWave();
        });
        
        document.getElementById('autoStart').addEventListener('change', (e) => {
            this.autoStart = e.target.checked;
        });
        
        document.getElementById('pauseGame').addEventListener('click', () => {
            this.togglePause();
        });
        
        // Restart game
        document.getElementById('restartGame').addEventListener('click', () => {
            this.restartGame();
        });
        
        // Grid expansion
        document.getElementById('expandGrid').addEventListener('click', () => {
            this.expandGrid();
        });
        
        // Speed controls
        document.getElementById('speed1').addEventListener('click', () => {
            this.setGameSpeed(1);
        });
        document.getElementById('speed2').addEventListener('click', () => {
            this.setGameSpeed(2);
        });
        document.getElementById('speed3').addEventListener('click', () => {
            this.setGameSpeed(3);
        });

        // Floating context menu actions
        document.getElementById('ctxUpgrade').addEventListener('click', () => {
            this.upgradeTower();
            this.hideTowerContext();
        });
        document.getElementById('ctxSell').addEventListener('click', () => {
            this.sellTower();
            this.hideTowerContext();
        });

        // Disable browser context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        // Tower management
        document.getElementById('upgradeTower').addEventListener('click', () => {
            this.upgradeTower();
        });
        
        document.getElementById('sellTower').addEventListener('click', () => {
            this.sellTower();
        });
    }

    // Convert mouse event coordinates to canvas space, accounting for CSS scaling
    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    selectTowerType(type) {
        this.selectedTowerType = type;
        document.querySelectorAll('.tower-option').forEach(option => {
            option.classList.remove('selected');
        });
        document.querySelector(`[data-tower="${type}"]`).classList.add('selected');
    }
    
    // Utility: find tower at position
    getTowerAtPosition(x, y) {
        for (let i = this.towers.length - 1; i >= 0; i--) {
            const tower = this.towers[i];
            const distance = Math.sqrt((tower.x - x) ** 2 + (tower.y - y) ** 2);
            if (distance <= 20) return tower;
        }
        return null;
    }

    retargetEnemiesToNewPath() {
        if (this.path.length < 2) return;
        for (const enemy of this.enemies) {
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let i = 0; i < this.path.length; i++) {
                const p = this.path[i];
                const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            enemy.pathIndex = Math.max(0, Math.min(bestIdx, this.path.length - 2));
        }
    }

    // Build blocked cells from towers (2x2 per tower)
    getBlockedCells() {
        const blocked = new Set();
        this.debugTower(`Getting blocked cells for ${this.towers.length} towers`);
        
        const mark = (cx, cy, towerIndex) => {
            const centerCol = Math.floor((cx - this.gridOffsetX) / this.gridSize);
            const centerRow = Math.floor((cy - this.gridOffsetY) / this.gridSize);
            const col = centerCol;
            const row = centerRow;
            if (col >= 0 && col < this.gridCols && row >= 0 && row < this.gridRows) {
                blocked.add(`${col},${row}`);
                this.debugTower(`Tower ${towerIndex} blocks cell (${col}, ${row})`);
            } else {
                this.debugWarning(`Tower ${towerIndex} at (${cx}, ${cy}) is out of bounds`);
            }
        };
        
        for (let i = 0; i < this.towers.length; i++) {
            const tower = this.towers[i];
            this.debugTower(`Tower ${i}: (${tower.x}, ${tower.y}) -> (${Math.floor((tower.x - this.gridOffsetX) / this.gridSize)}, ${Math.floor((tower.y - this.gridOffsetY) / this.gridSize)})`);
            mark(tower.x, tower.y, i);
        }
        
        this.debugTower(`Total blocked cells: ${Array.from(blocked).join(', ')}`);
        return blocked;
    }

    // A* pathfinding
    findPath(blocked) {
        const start = this.startCell;
        const goal = this.goalCell;
        this.debugTower(`Pathfinding: Start(${start.col},${start.row}) -> Goal(${goal.col},${goal.row})`);
        
        // Heuristic that encourages straight paths
        const h = (c, r) => {
            const dx = Math.abs(c - goal.col);
            const dy = Math.abs(r - goal.row);
            // Prefer straight lines over diagonal paths
            return dx + dy + (dx > 0 && dy > 0 ? 0.5 : 0);
        };
        const key = (c, r) => `${c},${r}`;
        const open = new Set([key(start.col, start.row)]);
        const cameFrom = new Map();
        const gScore = new Map([[key(start.col, start.row), 0]]);
        const fScore = new Map([[key(start.col, start.row), h(start.col, start.row)]]);
        const closed = new Set();

        const getLowestF = () => {
            let best = null, bestScore = Infinity;
            for (const k of open) {
                const s = fScore.get(k) ?? Infinity;
                if (s < bestScore) { bestScore = s; best = k; }
            }
            return best;
        };

        const neighbors = (c, r) => {
            // Only 4-directional movement - no diagonal to prevent tight gaps
            const list = [
                [c+1,r], [c-1,r], [c,r+1], [c,r-1]  // 4-directional only
            ];
            const out = [];
            for (const [nc, nr] of list) {
                if (nc < 0 || nr < 0 || nc >= this.gridCols || nr >= this.gridRows) {
                    continue;
                }
                if (blocked.has(key(nc, nr))) {
                    continue;
                }
                out.push([nc, nr]);
            }
            return out;
        };

        let iterations = 0;
        const maxIterations = this.gridCols * this.gridRows * 2; // Prevent infinite loops

        while (open.size > 0 && iterations < maxIterations) {
            iterations++;
            const currentKey = getLowestF();
            if (!currentKey) {
                break;
            }
            
            const [cc, rr] = currentKey.split(',').map(Number);
            
            if (cc === goal.col && rr === goal.row) {
                // reconstruct path
                const route = [];
                let ck = currentKey;
                while (ck) {
                    const [c, r] = ck.split(',').map(Number);
            const px = this.gridOffsetX + c * this.gridSize + this.gridSize / 2;
            const py = this.gridOffsetY + r * this.gridSize + this.gridSize / 2;
                    route.push({ x: px, y: py, col: c, row: r });
                    ck = cameFrom.get(ck);
                }
                route.reverse();
                this.debugSuccess(`Path found in ${iterations} iterations with ${route.length} nodes`);
                return route;
            }
            
            open.delete(currentKey);
            closed.add(currentKey);
            const currentG = gScore.get(currentKey) ?? Infinity;
            
            const validNeighbors = neighbors(cc, rr);
            
            for (const [nc, nr] of validNeighbors) {
                const nk = key(nc, nr);
                if (closed.has(nk)) {
                    continue;
                }
                
                // Diagonal movement costs more to encourage straight paths
                const isDiagonal = Math.abs(nc - cc) + Math.abs(nr - rr) === 2;
                const moveCost = isDiagonal ? 2.0 : 1; // Higher cost for diagonal
                const tentativeG = currentG + moveCost;
                const currentNeighborG = gScore.get(nk) ?? Infinity;
                
                if (tentativeG < currentNeighborG) {
                    cameFrom.set(nk, currentKey);
                    gScore.set(nk, tentativeG);
                    fScore.set(nk, tentativeG + h(nc, nr));
                    open.add(nk);
                }
            }
        }
        
        this.debugError(`Pathfinding failed after ${iterations} iterations (max: ${maxIterations})`);
        this.debugError(`Open set size: ${open.size}, Closed set size: ${closed.size}`);
        return null;
    }

    recomputePath() {
        console.log(`\n=== YOL YENİDEN HESAPLANIYOR ===`);
        this.debugPath(`Yol yeniden hesaplanıyor...`);
        const blocked = this.getBlockedCells();
        this.debugPath(`Tüm engellenmiş hücreler: ${Array.from(blocked).join(', ')}`);
        
        blocked.delete(`${this.startCell.col},${this.startCell.row}`);
        blocked.delete(`${this.goalCell.col},${this.goalCell.row}`);
        
        this.debugPath(`Başlangıç/bitiş çıkarıldıktan sonra engellenmiş hücreler: ${Array.from(blocked).join(', ')}`);
        this.debugPath(`Başlangıç: (${this.startCell.col}, ${this.startCell.row}), Bitiş: (${this.goalCell.col}, ${this.goalCell.row})`);
        
        const route = this.findPath(blocked);
        this.path = route || [];
        
        this.debugPath(`Yol yeniden hesaplandı: ${this.path.length} düğüm`);
        if (this.path.length === 0) {
            this.debugError(`YOL BLOKE! Başlangıçtan bitişe geçerli yol yok`);
            console.log(`=== YOL BLOKE ===\n`);
        } else {
            this.debugSuccess(`Yol bulundu: ${this.path.length} düğüm`);
            console.log(`=== YOL BULUNDU ===\n`);
        }
    }
    
    isValidTowerPosition(x, y, excludeTower = null) {
        this.debugTower(`Checking validity for position (${x}, ${y}), excludeTower: ${excludeTower ? 'YES' : 'NO'}`);
        
        // Snap to center of the cell under cursor
        const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
        const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
        const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
        const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
        
        this.debugTower(`Snapped to: (${cellCol}, ${cellRow}) -> (${gridX}, ${gridY})`);
        
        // Check bounds
        if (cellCol < 0 || cellCol >= this.gridCols || cellRow < 0 || cellRow >= this.gridRows) {
            this.debugError(`Position out of bounds: (${cellCol}, ${cellRow}) - Grid: ${this.gridCols}x${this.gridRows}`);
            return false;
        }
        
        // Overlap check 1x1 - but only if we're not excluding a tower (i.e., not dragging an existing tower)
        if (!excludeTower) {
            this.debugTower(`Checking overlap with ${this.towers.length} existing towers...`);
            for (let i = 0; i < this.towers.length; i++) {
                const tower = this.towers[i];
                const towerCol = Math.floor((tower.x - this.gridOffsetX) / this.gridSize);
                const towerRow = Math.floor((tower.y - this.gridOffsetY) / this.gridSize);
                this.debugTower(`Tower ${i}: (${tower.x}, ${tower.y}) -> (${towerCol}, ${towerRow})`);
                if (towerCol === cellCol && towerRow === cellRow) {
                    this.debugError(`Position overlaps with existing tower ${i} at (${towerCol}, ${towerRow})`);
                    this.debugError(`This means you're trying to place a new tower where one already exists!`);
                    return false;
                }
            }
            this.debugTower(`No overlap found with existing towers`);
        } else {
            this.debugTower(`Skipping overlap check for excluded tower (dragging existing tower)`);
        }
        
        // Don't allow placement on start or goal cells
        if (cellCol === this.startCell.col && cellRow === this.startCell.row) {
            this.debugError(`Cannot place on start cell (${cellCol}, ${cellRow})`);
            return false;
        }
        if (cellCol === this.goalCell.col && cellRow === this.goalCell.row) {
            this.debugError(`Cannot place on goal cell (${cellCol}, ${cellRow})`);
            return false;
        }
        
        // Simulate blocking this 1 cell and ensure path exists
        this.debugTower(`Getting blocked cells...`);
        const blocked = this.getBlockedCells();
        this.debugTower(`Current blocked cells: ${Array.from(blocked).join(', ')}`);
        
        // If we're excluding a tower, we need to remove its blocked cell from the set
        if (excludeTower) {
            const excludeCol = Math.floor((excludeTower.x - this.gridOffsetX) / this.gridSize);
            const excludeRow = Math.floor((excludeTower.y - this.gridOffsetY) / this.gridSize);
            blocked.delete(`${excludeCol},${excludeRow}`);
            this.debugTower(`Removed excluded tower's blocked cell: (${excludeCol}, ${excludeRow})`);
        }
        
        blocked.add(`${cellCol},${cellRow}`);
        blocked.delete(`${this.startCell.col},${this.startCell.row}`);
        blocked.delete(`${this.goalCell.col},${this.goalCell.row}`);
        
        this.debugTower(`Blocked cells with new tower: ${Array.from(blocked).join(', ')}`);
        this.debugTower(`Start: (${this.startCell.col}, ${this.startCell.row}), Goal: (${this.goalCell.col}, ${this.goalCell.row})`);
        
        // Yol bağlanarsa kule yerleşdirilməz
        this.debugTower(`Checking if position is valid for tower placement...`);
        
        // Yolun mövcudluğunu yoxla
        const route = this.findPath(blocked);
        
        if (route && route.length > 0) {
            this.debugSuccess(`Path found with ${route.length} nodes - Position is valid`);
            return true;
        }
        
        // Yol tapılmadı - kule yerleşdirilməz
        this.debugError(`YOL BAĞLANDI! Kule yerleşdirilə bilməz (${cellCol}, ${cellRow})`);
        this.debugError(`Yolun açıq qalması üçün başqa yer seçin`);
        return false;
    }
    
    // Alternative pathfinding removed - no longer needed
    // Player can manually sell towers to unblock the path
    
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    placeTower(x, y) {
        console.log(`\n=== KULE YERLEŞTİRME BAŞLADI ===`);
        const cost = this.towerCosts[this.selectedTowerType];
        this.debugTower(`Kule yerleştirme denemesi: ${this.selectedTowerType} kulesi (${x}, ${y}) - Maliyet: $${cost}, Para: $${this.gameState.money}`);
        
        if (this.gameState.money < cost) {
            this.debugError(`Yetersiz para: $${cost} gerekli, $${this.gameState.money} mevcut`);
            return;
        }
        
        // Snap to center of the cell under cursor
        const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
        const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
        const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
        const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
        
        this.debugTower(`Grid pozisyonuna hizalandı: (${cellCol}, ${cellRow}) -> (${gridX}, ${gridY})`);
        
        // Double-check position validity before placing
        this.debugTower(`Pozisyon geçerliliği kontrol ediliyor...`);
        const isValid = this.isValidTowerPosition(gridX, gridY);
        this.debugTower(`Pozisyon geçerliliği: ${isValid ? 'GEÇERLİ' : 'GEÇERSİZ'}`);
        
        if (!isValid) {
            this.debugError(`Kule yerleştirme başarısız: Geçersiz pozisyon (${cellCol},${cellRow})`);
            return;
        }
        
        const tower = {
            // logical grid position retained across resizes
            col: cellCol,
            row: cellRow,
            // pixel position derived (for immediate drawing)
            x: gridX,
            y: gridY,
            type: this.selectedTowerType,
            level: 1,
            range: this.getTowerRange(this.selectedTowerType),
            damage: this.getTowerDamage(this.selectedTowerType),
            fireRate: this.getTowerFireRate(this.selectedTowerType),
            lastShot: 0,
            target: null,
            highlightUntil: Date.now() + 1200
        };
        
        this.debugTower(`Kule objesi oluşturuldu: ${JSON.stringify(tower)}`);
        
        // Store original state for rollback
        const originalTowers = [...this.towers];
        const originalMoney = this.gameState.money;
        const originalPathLength = this.path.length;
        
        this.debugTower(`Orijinal durum - Kuleler: ${originalTowers.length}, Para: $${originalMoney}, Yol düğümleri: ${originalPathLength}`);
        
        // Place tower
        this.debugTower(`Kule dizisine ekleniyor...`);
        this.towers.push(tower);
        this.gameState.money -= cost;
        
        this.debugTower(`Yerleştirme sonrası - Kuleler: ${this.towers.length}, Para: $${this.gameState.money}`);
        
        // Check if path still exists after placement
        this.debugTower(`Kule yerleştirildikten sonra yol yeniden hesaplanıyor...`);
        this.recomputePath();
        
        this.debugTower(`Yerleştirme sonrası yol: ${this.path.length} düğüm`);
        if (this.path.length === 0) {
            this.debugError(`YOL BLOKE OLDU! Kule yerleştirme geri alınıyor`);
            this.debugError(`Orijinal yol ${originalPathLength} düğüme sahipti, şimdi 0`);
            
            // Rollback if path is blocked
            this.debugTower(`Geri alma işlemi başlatılıyor...`);
            this.debugTower(`ROLLBACK: Kule sayısı ${this.towers.length} -> ${originalTowers.length}`);
            this.towers = originalTowers;
            this.gameState.money = originalMoney;
            this.recomputePath();
            this.updateUI();
            
            this.debugError(`Geri alma tamamlandı - Kuleler: ${this.towers.length}, Para: $${this.gameState.money}, Yol düğümleri: ${this.path.length}`);
            console.log(`=== KULE YERLEŞTİRME BAŞARISIZ - YOL BAĞLANDI ===\n`);
            return;
        }
        
        this.debugSuccess(`Kule başarıyla yerleştirildi (${cellCol},${cellRow}) - Yol ${this.path.length} düğümle korundu`);
        this.debugSuccess(`OYUN KULE SİLMƏDİ - Kule yerleşdirildi və qaldı!`);
        this.updateUI();
        this.retargetEnemiesToNewPath && this.retargetEnemiesToNewPath();
        console.log(`=== KULE YERLEŞTİRME BAŞARILI - OYUN SİLMƏDİ ===\n`);
    }
    
    selectTower(tower) {
        this.debugTower(`Selecting tower: ${tower.type} at (${tower.x}, ${tower.y}) level ${tower.level}`);
        this.selectedTower = tower;
        this.updateTowerInfo();
        // Keep the sidebar panel hidden; we use floating context instead
        const side = document.getElementById('selectedTowerInfo');
        if (side) side.style.display = 'none';
    }
    
    deselectTower() {
        this.debugTower(`Deselecting tower`);
        this.selectedTower = null;
        document.getElementById('selectedTowerInfo').style.display = 'none';
    }

    showTowerContextAt(tower) {
        const ctx = document.getElementById('towerContext');
        if (!ctx) {
            this.debugLog('ERROR: towerContext element not found');
            return;
        }
        // Position near tower in viewport coords (position: fixed)
        const rect = this.canvas.getBoundingClientRect();
        const towerVX = rect.left + tower.x; // viewport relative
        const towerVY = rect.top + tower.y;

        // Default open to the right of the tower
        let left = Math.round(towerVX + this.gridSize * 0.6);
        let top = Math.round(towerVY - this.gridSize * 0.6);

        // Ensure the menu is within viewport; if too close to right edge, open on the left
        ctx.style.display = 'flex';
        const mRect = ctx.getBoundingClientRect();
        ctx.style.display = 'none';
        const vw = window.innerWidth; const vh = window.innerHeight;
        if (left + mRect.width > vw - 8) left = Math.round(towerVX - mRect.width - this.gridSize * 0.6);
        if (top + mRect.height > vh - 8) top = vh - mRect.height - 8;
        if (top < 8) top = 8;

        ctx.style.left = `${left}px`;
        ctx.style.top = `${top}px`;
        ctx.style.position = 'fixed';
        ctx.style.zIndex = '1000';
        
        // Disable upgrade if not enough money
        const upgradeCost = this.selectedTower ? this.selectedTower.level * 50 : 0;
        const btnUp = document.getElementById('ctxUpgrade');
        if (btnUp) {
            btnUp.disabled = this.gameState.money < upgradeCost;
            btnUp.textContent = `Upgrade ($${upgradeCost})`;
        } else {
            this.debugLog('ERROR: ctxUpgrade button not found');
        }
        
        const btnSell = document.getElementById('ctxSell');
        if (btnSell) {
            const sellValue = Math.floor(this.towerCosts[this.selectedTower.type] / 3);
            btnSell.textContent = `Sell ($${sellValue})`;
        } else {
            this.debugLog('ERROR: ctxSell button not found');
        }
        
        ctx.style.display = 'flex';
        this.debugLog(`Context menu shown at (${left}, ${top}) for tower at (${tower.x}, ${tower.y})`);
    }

    hideTowerContext() {
        const ctx = document.getElementById('towerContext');
        if (ctx) {
            ctx.style.display = 'none';
            console.log('[towerContext] hidden');
        }
    }
    
    upgradeTower() {
        if (!this.selectedTower) return;
        
        const upgradeCost = this.selectedTower.level * 50;
        if (this.gameState.money >= upgradeCost) {
            this.selectedTower.level++;
            this.selectedTower.damage = Math.floor(this.selectedTower.damage * 1.5);
            this.selectedTower.range = Math.floor(this.selectedTower.range * 1.2);
            this.gameState.money -= upgradeCost;
            this.updateUI();
            this.updateTowerInfo();
        }
    }
    
    sellTower() {
        console.log(`\n=== KULE SATILIYOR (OYUNCU TARAFINDAN) ===`);
        this.debugTower(`=== OYUNCU KULE SATIYOR ===`);
        if (!this.selectedTower) {
            this.debugError(`Kule satılamıyor: Seçili kule yok`);
            return;
        }
        
        this.debugTower(`OYUNCU kule satıyor: ${this.selectedTower.type} (${this.selectedTower.x}, ${this.selectedTower.y})`);
        
        // Calculate sell value as 1/3 of original cost
        const originalCost = this.towerCosts[this.selectedTower.type];
        const sellValue = Math.floor(originalCost / 3);
        
        this.debugTower(`Orijinal maliyet: $${originalCost}, Satış değeri: $${sellValue}`);
        this.debugTower(`Satış öncesi - Para: $${this.gameState.money}, Kuleler: ${this.towers.length}`);
        
        this.gameState.money += sellValue;
        this.gameState.score += sellValue;
        
        const index = this.towers.indexOf(this.selectedTower);
        if (index === -1) {
            this.debugError(`Kule kule dizisinde bulunamadı!`);
            return;
        }
        
        this.debugTower(`OYUNCU kuleyi siliyor (index: ${index})...`);
        this.towers.splice(index, 1);
        
        this.debugSuccess(`OYUNCU kuleyi başarıyla sattı - Para: $${this.gameState.money}, Kuleler: ${this.towers.length}`);
        
        this.deselectTower();
        this.updateUI();
        this.recomputePath();
        this.retargetEnemiesToNewPath();
        console.log(`=== OYUNCU KULE SATIŞI TAMAMLANDI ===\n`);
    }
    
    updateTowerInfo() {
        if (!this.selectedTower) return;
        
        const tower = this.selectedTower;
        document.getElementById('towerDetails').innerHTML = `
            <div>Type: ${tower.type}</div>
            <div>Level: ${tower.level}</div>
            <div>Damage: ${tower.damage}</div>
            <div>Range: ${tower.range}</div>
        `;
        
        const upgradeCost = tower.level * 50;
        const originalCost = this.towerCosts[tower.type];
        const sellValue = Math.floor(originalCost / 3);
        
        document.getElementById('upgradeCost').textContent = upgradeCost;
        document.getElementById('sellValue').textContent = sellValue;
        
        document.getElementById('upgradeTower').disabled = this.gameState.money < upgradeCost;
    }
    
    getTowerRange(type) {
        const ranges = { basic: 80, rapid: 60, heavy: 100 };
        const base = ranges[type] || 80;
        return Math.round(base * this.scale);
    }
    
    getTowerDamage(type) {
        const damages = { basic: 20, rapid: 10, heavy: 50 };
        return damages[type] || 20;
    }
    
    getTowerFireRate(type) {
        const rates = { basic: 1000, rapid: 300, heavy: 2000 };
        return rates[type] || 1000;
    }
    
    startWave() {
        if (this.waveInProgress || this.gameState.gameOver) return;
        
        this.waveInProgress = true;
        this.currentWaveEnemies = 0;
        this.lastEnemySpawn = Date.now();
        
        document.getElementById('startWave').disabled = true;
    }
    
    togglePause() {
        this.gameState.isPaused = !this.gameState.isPaused;
        const button = document.getElementById('pauseGame');
        button.textContent = this.gameState.isPaused ? 'Resume' : 'Pause';
    }
    
    spawnEnemy() {
        const enemyTypes = ['basic', 'fast', 'tank'];
        const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
        
        const enemy = {
            x: (this.path[0] ? this.path[0].x : this.startCell.col * this.gridSize + this.gridSize / 2),
            y: (this.path[0] ? this.path[0].y : this.startCell.row * this.gridSize + this.gridSize / 2),
            type: type,
            health: this.getEnemyHealth(type),
            maxHealth: this.getEnemyHealth(type),
            speed: this.getEnemySpeed(type),
            pathIndex: 0,
            reward: this.getEnemyReward(type)
        };
        // Initial facing: set direction based on first path segment so icon looks forward immediately
        if (this.path.length > 1) {
            const dx0 = this.path[1].x - this.path[0].x;
            enemy.directionX = dx0;
        } else {
            enemy.directionX = 1; // default face right
        }
        
        this.enemies.push(enemy);
        this.currentWaveEnemies++;
    }
    
    getEnemyHealth(type) {
        // Düşmən canları level-ə görə artırılır
        const baseHealths = { basic: 150, fast: 100, tank: 300 };
        const baseHealth = baseHealths[type] || 150;
        
        // Hər level üçün 20% artır
        const levelMultiplier = 1 + (this.currentLevel - 1) * 0.2;
        const finalHealth = Math.floor(baseHealth * levelMultiplier);
        
        const enemyNames = { basic: 'Zombie', fast: 'Eagle', tank: 'Dino' };
        this.debugLog(`Level ${this.currentLevel}: ${enemyNames[type]} düşmən canı ${baseHealth} -> ${finalHealth} (${levelMultiplier.toFixed(1)}x)`);
        return finalHealth;
    }
    
    getEnemySpeed(type) {
        const baseSpeeds = { basic: 1, fast: 2, tank: 0.5 };
        const baseSpeed = baseSpeeds[type] || 1;
        
        // Hər level üçün 10% sürət artır
        const levelMultiplier = 1 + (this.currentLevel - 1) * 0.1;
        const finalSpeed = baseSpeed * levelMultiplier;
        
        // Scale speed modestly with current scale to keep pacing consistent
        return finalSpeed * Math.max(0.75, Math.min(2, this.scale));
    }

    getEnemyRadius(type) {
        // Smaller enemy visuals to improve spacing
        const base = type === 'fast' ? 12 : 14; // reduced from 16/19
        return Math.max(8, Math.round(base * this.scale));
    }
    
    getEnemyReward(type) {
        const baseRewards = { basic: 10, fast: 15, tank: 25 };
        const baseReward = baseRewards[type] || 10;
        
        // Hər level üçün 15% mükafat artır
        const levelMultiplier = 1 + (this.currentLevel - 1) * 0.15;
        const finalReward = Math.floor(baseReward * levelMultiplier);
        
        return finalReward;
    }
    
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (this.path.length < 2) continue;
            // Move enemy along dynamic path
            enemy.pathIndex = Math.min(Math.max(enemy.pathIndex, 0), this.path.length - 2);
            const target = this.path[enemy.pathIndex + 1];
            const dx = target.x - enemy.x;
            const dy = target.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < enemy.speed) {
                enemy.pathIndex++;
                if (enemy.pathIndex >= this.path.length - 1) {
                    // Enemy reached the castle - damage castle
                    const damage = 10;
                    this.gameState.health -= damage;
                    const enemyNames = { basic: 'Zombie', fast: 'Eagle', tank: 'Dino' };
                    this.debugLog(`💀 ${enemyNames[enemy.type]} düşmən qalaya çatdı! Can azaldı: ${this.gameState.health + damage} -> ${this.gameState.health}`);
                    this.enemies.splice(i, 1);
                    continue;
                }
            } else {
                // Simple movement without animations
                const moveSpeed = enemy.speed * this.gameSpeed;
                enemy.x += (dx / distance) * moveSpeed;
                enemy.y += (dy / distance) * moveSpeed;
                
                // Store direction for drawing
                enemy.directionX = dx; // Store dx for horizontal flipping
            }
        }
    }
    
    updateTowers() {
        for (const tower of this.towers) {
            // Find target
            tower.target = this.findTarget(tower);
            
            // Shoot at target
            if (tower.target && Date.now() - tower.lastShot > tower.fireRate) {
                this.shootBullet(tower);
                tower.lastShot = Date.now();
            }
        }
    }
    
    findTarget(tower) {
        let closestEnemy = null;
        let closestDistance = tower.range;
        
        for (const enemy of this.enemies) {
            const distance = Math.sqrt((tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2);
            if (distance <= tower.range && distance < closestDistance) {
                closestEnemy = enemy;
                closestDistance = distance;
            }
        }
        
        return closestEnemy;
    }
    
    shootBullet(tower) {
        if (!tower.target) return;
        const bulletSpeed = Math.max(3, Math.round(this.gridSize * 0.25));
        const bullet = {
            x: tower.x,
            y: tower.y,
            damage: tower.damage,
            speed: bulletSpeed,
            target: tower.target,
            bornAt: Date.now(),
            ttlMs: 4000
        };
        this.bullets.push(bullet);
    }
    
    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            // TTL safeguard
            if (Date.now() - bullet.bornAt > bullet.ttlMs) {
                this.bullets.splice(i, 1);
                continue;
            }
            // If target gone, remove bullet
            if (!bullet.target || !this.enemies.includes(bullet.target)) {
                this.bullets.splice(i, 1);
                continue;
            }
            // Move toward target's current position
            const dx = bullet.target.x - bullet.x;
            const dy = bullet.target.y - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= bullet.speed) {
                this.hitEnemy(bullet.target, bullet.damage);
                this.bullets.splice(i, 1);
            } else if (distance > 0) {
                bullet.x += (dx / distance) * bullet.speed;
                bullet.y += (dy / distance) * bullet.speed;
            }
        }
    }
    
    hitEnemy(enemy, damage) {
        const oldHealth = enemy.health;
        enemy.health -= damage;
        
        const enemyNames = { basic: 'Zombie', fast: 'Eagle', tank: 'Dino' };
        this.debugLog(`💥 ${enemyNames[enemy.type]} düşmənə ${damage} zərər! ${oldHealth} -> ${enemy.health}`);
        
        if (enemy.health <= 0) {
            // Enemy destroyed
            this.gameState.money += enemy.reward;
            this.gameState.score += enemy.reward * 2;
            
            // Chance to get diamond
            const diamondChance = 0.1; // 10% chance
            if (Math.random() < diamondChance) {
                this.diamonds++;
                localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
                this.debugLog(`💎 Elmas tapıldı! Cəmi: ${this.diamonds}`);
            }
            
            this.debugLog(`💀 ${enemyNames[enemy.type]} düşmən öldü! +${enemy.reward} pul, +${enemy.reward * 2} xal`);
            
            const index = this.enemies.indexOf(enemy);
            this.enemies.splice(index, 1);
            
            // Update UI to show new money and diamonds
            this.updateUI();
        }
    }
    
    drawGrid() {
        // Background fill (full canvas)
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const boardW = this.gridSize * this.gridCols;
        const boardH = this.gridSize * this.gridRows;
        const ox = this.gridOffsetX;
        const oy = this.gridOffsetY;

        // Draw board background subtle
        this.ctx.fillStyle = 'rgba(255,255,255,0.02)';
        this.ctx.fillRect(ox, oy, boardW, boardH);

        // major lines every 5 cells within board
        const majorEvery = 5;
        for (let c = 0; c <= this.gridCols; c++) {
            const x = ox + c * this.gridSize;
            const isMajor = (c % majorEvery) === 0;
            this.ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)';
            this.ctx.lineWidth = isMajor ? 1.2 : 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x + 0.5, oy);
            this.ctx.lineTo(x + 0.5, oy + boardH);
            this.ctx.stroke();
        }
        for (let r = 0; r <= this.gridRows; r++) {
            const y = oy + r * this.gridSize;
            const isMajor = (r % majorEvery) === 0;
            this.ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)';
            this.ctx.lineWidth = isMajor ? 1.2 : 1;
            this.ctx.beginPath();
            this.ctx.moveTo(ox, y + 0.5);
            this.ctx.lineTo(ox + boardW, y + 0.5);
            this.ctx.stroke();
        }

        // Board border
        this.ctx.strokeStyle = 'rgba(62,166,255,0.35)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(ox + 1, oy + 1, boardW - 2, boardH - 2);
    }
    
    drawPath() {
        if (this.path.length === 0) return;
        // Scale path width with grid size - Daha nazik yol
        const pathOuter = Math.max(1, Math.round(this.gridSize * 0.8)); // Daha nazik
        const pathInner = Math.max(1, Math.round(this.gridSize * 0.6)); // Daha nazik
        // Border - Daha açıq rəng
        this.ctx.strokeStyle = 'rgba(101, 67, 33, 0.6)'; // Şəffaf
        this.ctx.lineWidth = pathOuter;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
        this.ctx.stroke();
        // Inner path - Daha açıq rəng
        this.ctx.strokeStyle = 'rgba(139, 69, 19, 0.7)'; // Şəffaf
        this.ctx.lineWidth = pathInner;
        this.ctx.beginPath();
        this.ctx.moveTo(this.path[0].x, this.path[0].y);
        for (let i = 1; i < this.path.length; i++) this.ctx.lineTo(this.path[i].x, this.path[i].y);
        this.ctx.stroke();
    }
    
    drawCastle() {
        if (this.path.length < 2) return;
        
        const endPoint = this.path[this.path.length - 1];
        const castleSize = this.gridSize * 1.5;
        const x = endPoint.x;
        const y = endPoint.y;
        
        this.ctx.save();
        
        // Castle base (dark gray)
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(x - castleSize/2, y - castleSize/2, castleSize, castleSize);
        
        // Castle walls (light gray)
        this.ctx.fillStyle = '#666';
        this.ctx.fillRect(x - castleSize/2 + 4, y - castleSize/2 + 4, castleSize - 8, castleSize - 8);
        
        // Castle towers
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(x - castleSize/2 - 2, y - castleSize/2 - 2, 8, 12);
        this.ctx.fillRect(x + castleSize/2 - 6, y - castleSize/2 - 2, 8, 12);
        
        // Castle gate
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x - 8, y + castleSize/2 - 12, 16, 12);
        
        // Castle flag
        this.ctx.fillStyle = '#c00';
        this.ctx.fillRect(x + castleSize/2 - 2, y - castleSize/2 - 8, 6, 4);
        
        // Castle icon (skull)
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${Math.round(castleSize * 0.4)}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('💀', x, y);
        
        this.ctx.restore();
    }
    
    drawCastleHealthBar() {
        if (this.path.length < 2) return;
        
        const endPoint = this.path[this.path.length - 1];
        const barWidth = this.gridSize * 2;
        const barHeight = 8;
        const x = endPoint.x - barWidth/2;
        const y = endPoint.y - this.gridSize * 1.2;
        
        this.ctx.save();
        
        // Health bar background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, barWidth, barHeight);
        
        // Health bar border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, barWidth, barHeight);
        
        // Health bar fill
        const healthPercent = this.gameState.health / 100;
        this.ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
        this.ctx.fillRect(x + 1, y + 1, (barWidth - 2) * healthPercent, barHeight - 2);
        
        // Health text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${this.gameState.health}`, endPoint.x, y - 10);
        
        this.ctx.restore();
    }
    
    drawEnemyHealthBar(enemy) {
        const barWidth = enemy.radius * 2;
        const barHeight = 4;
        const x = enemy.x - barWidth / 2;
        const y = enemy.y - enemy.radius - 8;
        
        this.ctx.save();
        
        // Health bar background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, barWidth, barHeight);
        
        // Health bar border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, barWidth, barHeight);
        
        // Health bar fill
        const healthPercent = enemy.health / enemy.maxHealth;
        this.ctx.fillStyle = healthPercent > 0.6 ? '#0f0' : healthPercent > 0.3 ? '#ff0' : '#f00';
        this.ctx.fillRect(x + 1, y + 1, (barWidth - 2) * healthPercent, barHeight - 2);
        
        // Health text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${enemy.health}/${enemy.maxHealth}`, enemy.x, y - 6);
        
        this.ctx.restore();
    }
    
    drawTowers() {
        for (const tower of this.towers) {
            // Blinking highlight for the tower's cell when selected/just moved
            const now = Date.now();
            const isSelected = tower === this.selectedTower;
            const shouldBlink = isSelected || (tower.highlightUntil && now < tower.highlightUntil);
            if (shouldBlink) {
                const phase = Math.abs(Math.sin(now / 250)); // 0..1
                this.ctx.globalAlpha = 0.15 + 0.25 * phase;
                this.ctx.fillStyle = isSelected ? '#4a90e2' : '#ffffff';
                this.ctx.fillRect(tower.x - this.gridSize / 2, tower.y - this.gridSize / 2, this.gridSize, this.gridSize);
                this.ctx.globalAlpha = 1.0;
            }
            // Range indicator: only when selected
            if (tower === this.selectedTower) {
                this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.45)';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
                this.ctx.stroke();
            }

            // 1x1 grid cell highlight only when selected
            if (isSelected) {
                this.ctx.globalAlpha = 0.12;
                this.ctx.fillStyle = '#4a90e2';
                this.ctx.fillRect(tower.x - this.gridSize / 2, tower.y - this.gridSize / 2, 
                                this.gridSize, this.gridSize);
                this.ctx.globalAlpha = 1.0;
            }

            // Neon base + weapon barrel
            // Back to subtle neon base + barrel (no 3D) for the actual game
            const baseR = Math.max(6, Math.round(this.gridSize * 0.38));
            const neonStroke = tower.type === 'basic' ? '#00e5ff' : tower.type === 'rapid' ? '#7cff00' : '#ff6bff';
            // Hollow neon circle base
            this.ctx.beginPath();
            this.ctx.arc(tower.x, tower.y, baseR, 0, Math.PI * 2);
            this.ctx.shadowColor = neonStroke;
            this.ctx.shadowBlur = Math.max(10, Math.round(this.gridSize * 0.35));
            this.ctx.lineWidth = Math.max(2, Math.round(this.gridSize * 0.12));
            this.ctx.strokeStyle = neonStroke;
            this.ctx.stroke();

            // Barrel
            let angle = 0; if (tower.target) angle = Math.atan2(tower.target.y - tower.y, tower.target.x - tower.x);
            const barrelLen = Math.max(8, Math.round(this.gridSize * (tower.type === 'heavy' ? 0.6 : tower.type === 'rapid' ? 0.45 : 0.5)));
            const barrelW = Math.max(3, Math.round(this.gridSize * 0.12));
            this.ctx.save();
            this.ctx.translate(tower.x, tower.y);
            this.ctx.rotate(angle);
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(0, -barrelW/2, barrelLen, barrelW);
            this.ctx.fillStyle = neonStroke;
            this.ctx.fillRect(barrelLen - 4, -barrelW/3, 4, (barrelW/3)*2);
            this.ctx.restore();
            
            // Level indicator and grid coordinates when selected
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(tower.level.toString(), tower.x, tower.y + 3);
            if (isSelected) {
                const col = Math.floor(tower.x / this.gridSize);
                const row = Math.floor(tower.y / this.gridSize);
                this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
                this.ctx.font = '6px Arial';
                this.ctx.fillText(`(${col},${row})`, tower.x, tower.y + 12);
            }
        }

        // Draw dragging ghost (yalnız yeni kulelər)
        if (this.isDraggingNew) {
            const radiusColor = this.hoverValid ? 'rgba(76,175,80,0.35)' : 'rgba(244,67,54,0.35)';
            const borderColor = this.hoverValid ? '#4CAF50' : '#F44336';
            const type = this.selectedTowerType;
            const range = this.getTowerRange(type);

            // Range circle
            this.ctx.strokeStyle = radiusColor;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.hoverPos.x, this.hoverPos.y, range, 0, Math.PI * 2);
            this.ctx.stroke();

            // 1x1 grid area
            this.ctx.globalAlpha = 0.6;
            this.ctx.fillStyle = this.hoverValid ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)';
            this.ctx.fillRect(this.hoverPos.x - this.gridSize / 2, this.hoverPos.y - this.gridSize / 2, 
                            this.gridSize, this.gridSize);
            this.ctx.globalAlpha = 1.0;

            // Tower body
            this.ctx.globalAlpha = 0.8;
            this.ctx.fillStyle = type === 'basic' ? '#8B4513' : type === 'rapid' ? '#4169E1' : '#DC143C';
            this.ctx.beginPath();
            this.ctx.arc(this.hoverPos.x, this.hoverPos.y, 8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;

            // Border indicating validity
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(this.hoverPos.x - this.gridSize / 2, this.hoverPos.y - this.gridSize / 2, 
                               this.gridSize, this.gridSize);
        }
    }
    
    drawEnemies() {
        for (const enemy of this.enemies) {
            const radius = this.getEnemyRadius(enemy.type);
            
            // Draw enemy with icon
            this.drawEnemyIcon(enemy, radius);
            
            // Health bar
            const barWidth = Math.max(20, Math.round(this.gridSize * 0.8));
            const barHeight = Math.max(3, Math.round(this.gridSize * 0.12));
            const healthPercent = enemy.health / enemy.maxHealth;
            
            // Health bar background
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(enemy.x - barWidth/2, enemy.y - (radius + 10), barWidth, barHeight);
            
            // Health bar border
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(enemy.x - barWidth/2, enemy.y - (radius + 10), barWidth, barHeight);
            
            // Health bar fill
            this.ctx.fillStyle = healthPercent > 0.6 ? '#4CAF50' : healthPercent > 0.3 ? '#FF9800' : '#F44336';
            this.ctx.fillRect(enemy.x - barWidth/2 + 1, enemy.y - (radius + 10) + 1, (barWidth - 2) * healthPercent, barHeight - 2);
            
            // Health text
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`${enemy.health}/${enemy.maxHealth}`, enemy.x, enemy.y - (radius + 15));
        }
    }
    
    drawEnemyIcon(enemy, radius) {
        this.ctx.save();
        
        // Heading angle to rotate shapes with path direction
        let headingAngle = 0;
        if (this.path && this.path.length > 1) {
            const idx = Math.min(Math.max(enemy.pathIndex, 0), this.path.length - 2);
            const next = this.path[idx + 1];
            const dx = next.x - enemy.x;
            const dy = next.y - enemy.y;
            if (dx !== 0 || dy !== 0) headingAngle = Math.atan2(dy, dx);
        }
        this.ctx.translate(enemy.x, enemy.y);
        this.ctx.rotate(headingAngle);
        
        // Neon outline only (hollow shapes) - strong, vivid
        const lw = Math.max(2, Math.round(this.gridSize * 0.12));
        const neonStroke = (color) => {
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = Math.max(10, Math.round(this.gridSize * 0.35));
            this.ctx.lineWidth = lw;
            this.ctx.strokeStyle = color;
        };
        
        if (enemy.type === 'basic') {
            neonStroke('#00e5ff');
            const s = radius * 1.2;
            this.ctx.beginPath();
            this.ctx.rect(-s/2, -s/2, s, s);
            this.ctx.stroke();
        } else if (enemy.type === 'fast') {
            neonStroke('#7cff00');
            const s = radius * 1.4;
            this.ctx.beginPath();
            this.ctx.moveTo(s*0.7, 0);
            this.ctx.lineTo(-s*0.5, -s*0.6);
            this.ctx.lineTo(-s*0.5,  s*0.6);
            this.ctx.closePath();
            this.ctx.stroke();
        } else { // tank -> hexagon/diamond
            neonStroke('#ff6bff');
            const r = radius * 0.9;
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 * i) / 6;
                const px = Math.cos(a) * r;
                const py = Math.sin(a) * r;
                if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
            }
            this.ctx.closePath();
            this.ctx.stroke();
        }

        // No core fill - keep hollow
        
        this.ctx.restore();
    }
    
    drawRealisticDino(enemy, radius, headingAngle) {
        // Top-down stylized dino that always faces heading (forward = +X)
        const size = Math.round(radius * 1.6);
        const x = enemy.x;
        const y = enemy.y;

        const t = (Date.now() * 0.008) % (Math.PI * 2);
        const step = Math.sin(t) * (size * 0.08);
        const bodyBreathe = Math.sin(t * 0.7) * (size * 0.02);

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(headingAngle);

        // Shadow (top-down)
        this.ctx.fillStyle = 'rgba(0,0,0,0.18)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, size * 0.2, size * 0.7, size * 0.35, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Legs (simple top-down pads)
        const legW = size * 0.14, legH = size * 0.24;
        const legColor = '#1f2315';
        const drawLeg = (lx, ly, phase) => {
            const lift = Math.sin(t + phase) * (size * 0.04);
            this.ctx.fillStyle = legColor;
            this.ctx.beginPath();
            this.ctx.roundRect(lx - legW/2, ly - legH/2 - lift, legW, legH, Math.min(legW, legH) * 0.25);
            this.ctx.fill();
        };
        drawLeg(-size * 0.18, -size * 0.22, 0);
        drawLeg(-size * 0.18,  size * 0.22, Math.PI);
        drawLeg( size * 0.12, -size * 0.22, Math.PI);
        drawLeg( size * 0.12,  size * 0.22, 0);

        // Body (oval)
        const bodyGrad = this.ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 0.7);
        bodyGrad.addColorStop(0, '#A8D8A8');
        bodyGrad.addColorStop(0.6, '#6B8E6B');
        bodyGrad.addColorStop(1, '#3D5A3D');
        this.ctx.fillStyle = bodyGrad;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0 + bodyBreathe, size * 0.65, size * 0.45, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Tail (wedge behind)
        this.ctx.fillStyle = '#4A5D23';
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.7, 0);
        this.ctx.lineTo(-size * 1.05, -size * 0.12);
        this.ctx.lineTo(-size * 1.05,  size * 0.12);
        this.ctx.closePath();
        this.ctx.fill();

        // Head (circle in front)
        const headX = size * 0.7;
        const headY = -size * 0.06 + step * 0.2;
        const headGrad = this.ctx.createRadialGradient(headX - size * 0.1, headY - size * 0.1, 1, headX, headY, size * 0.35);
        headGrad.addColorStop(0, '#B8F0B8');
        headGrad.addColorStop(1, '#6B8E6B');
        this.ctx.fillStyle = headGrad;
        this.ctx.beginPath();
        this.ctx.arc(headX, headY, size * 0.32, 0, Math.PI * 2);
        this.ctx.fill();

        // Simple eyes (top-down hint)
        this.ctx.fillStyle = '#0e0e0e';
        this.ctx.beginPath();
        this.ctx.arc(headX + size * 0.08, headY - size * 0.06, size * 0.04, 0, Math.PI * 2);
        this.ctx.arc(headX + size * 0.08, headY + size * 0.06, size * 0.04, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }
    
    drawDinoLegs(size, walkCycle) {
        const phase1 = walkCycle;
        const phase2 = walkCycle + Math.PI;
        
        // Front legs - daha böyük və detallı
        this.drawDinoLeg(size, phase1, -size * 0.2, -size * 0.15, '#4A5D23', true);
        this.drawDinoLeg(size, phase2, size * 0.2, -size * 0.15, '#4A5D23', true);
        
        // Back legs - daha güclü
        this.drawDinoLeg(size, phase2, -size * 0.4, -size * 0.15, '#3A4D13', false);
        this.drawDinoLeg(size, phase1, size * 0.4, -size * 0.15, '#3A4D13', false);
    }
    
    drawDinoLeg(size, phase, hipX, hipY, color, isFront) {
        const walkStride = Math.cos(phase) * 0.4;
        const walkLift = Math.sin(phase) * 0.5;
        
        const thighAngle = 1.2 + walkStride;
        const shinAngle = thighAngle + 1.3 + walkLift;
        const footAngle = shinAngle - 1.1;
        
        const thighLength = isFront ? size * 0.35 : size * 0.4;
        const shinLength = isFront ? size * 0.3 : size * 0.35;
        const footLength = size * 0.2;
        
        const kneeX = hipX + Math.cos(thighAngle) * thighLength;
        const kneeY = hipY + Math.sin(thighAngle) * thighLength;
        const ankleX = kneeX + Math.cos(shinAngle) * shinLength;
        const ankleY = kneeY + Math.sin(shinAngle) * shinLength;
        
        // Foot position relative to body (no absolute ground lock)
        const footY = ankleY + Math.sin(footAngle) * footLength - Math.max(0, walkLift * size * 0.06);
        
        // Thigh with gradient
        const thighGrad = this.ctx.createLinearGradient(hipX, hipY, kneeX, kneeY);
        thighGrad.addColorStop(0, this.lightenColor(color, 0.3));
        thighGrad.addColorStop(1, this.darkenColor(color, 0.2));
        
        this.ctx.strokeStyle = thighGrad;
        this.ctx.lineWidth = size * 0.15;
        this.ctx.lineCap = 'round';
        
        // Thigh
        this.ctx.beginPath();
        this.ctx.moveTo(hipX, hipY);
        this.ctx.lineTo(kneeX, kneeY);
        this.ctx.stroke();
        
        // Shin with gradient
        const shinGrad = this.ctx.createLinearGradient(kneeX, kneeY, ankleX, ankleY);
        shinGrad.addColorStop(0, this.lightenColor(color, 0.2));
        shinGrad.addColorStop(1, this.darkenColor(color, 0.3));
        
        this.ctx.strokeStyle = shinGrad;
        this.ctx.lineWidth = size * 0.12;
        this.ctx.beginPath();
        this.ctx.moveTo(kneeX, kneeY);
        this.ctx.lineTo(ankleX, ankleY);
        this.ctx.stroke();
        
        // Foot with claws - yolda yürüyəcək şəkildə
        this.ctx.strokeStyle = this.darkenColor(color, 0.4);
        this.ctx.lineWidth = size * 0.08;
        this.ctx.beginPath();
        this.ctx.moveTo(ankleX, ankleY);
        this.ctx.lineTo(ankleX + Math.cos(footAngle - 0.2) * footLength, footY);
        this.ctx.stroke();
        
        // Draw claws
        this.ctx.fillStyle = this.darkenColor(color, 0.6);
        const clawX = ankleX + Math.cos(footAngle - 0.2) * footLength;
        const clawY = footY;
        
        for (let i = 0; i < 3; i++) {
            const clawAngle = footAngle - 0.2 + (i - 1) * 0.3;
            const clawEndX = clawX + Math.cos(clawAngle) * size * 0.05;
            const clawEndY = clawY + Math.sin(clawAngle) * size * 0.05;
            
            this.ctx.beginPath();
            this.ctx.moveTo(clawX, clawY);
            this.ctx.lineTo(clawEndX, clawEndY);
            this.ctx.stroke();
        }
        
        // Small contact shadow under foot
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        this.ctx.beginPath();
        this.ctx.ellipse(clawX, size * 0.6, size * 0.08, size * 0.03, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawDinoTail(size, sway) {
        // Main tail with enhanced gradient
        const tailGrad = this.ctx.createLinearGradient(-size * 2, 0, -size * 0.3, 0);
        tailGrad.addColorStop(0, '#2F4F2F');
        tailGrad.addColorStop(0.3, '#4A5D23');
        tailGrad.addColorStop(0.6, '#6B8E6B');
        tailGrad.addColorStop(0.8, '#8FBC8F');
        tailGrad.addColorStop(1, '#A8D8A8');
        
        this.ctx.fillStyle = tailGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.5, -size * 0.08);
        this.ctx.bezierCurveTo(-size * 0.8, -size * 0.25, -size * 1.4, -size * 0.25 + sway * size, -size * 2.2, -size * 0.15 + sway * size * 0.6);
        this.ctx.bezierCurveTo(-size * 1.4, -size * 0.08 + sway * size, -size * 0.8, size * 0.12, -size * 0.5, size * 0.08);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Tail spikes
        this.ctx.fillStyle = this.darkenColor('#4A5D23', 0.3);
        for (let i = 0; i < 4; i++) {
            const spikeX = -size * 0.6 - i * size * 0.4;
            const spikeY = -size * 0.08 + sway * size * 0.3;
            const spikeHeight = size * 0.15;
            
            this.ctx.beginPath();
            this.ctx.moveTo(spikeX, spikeY);
            this.ctx.lineTo(spikeX + size * 0.02, spikeY - spikeHeight);
            this.ctx.lineTo(spikeX - size * 0.02, spikeY - spikeHeight);
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        // Tail highlight
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.5, -size * 0.08);
        this.ctx.bezierCurveTo(-size * 0.8, -size * 0.2, -size * 1.4, -size * 0.2 + sway * size, -size * 2.2, -size * 0.1 + sway * size * 0.6);
        this.ctx.bezierCurveTo(-size * 1.4, -size * 0.05 + sway * size, -size * 0.8, size * 0.08, -size * 0.5, size * 0.05);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawDinoBody(size, breathing) {
        // Main body with enhanced gradient
        const bodyGrad = this.ctx.createRadialGradient(0, -size * 0.3, 0, 0, -size * 0.3, size * 0.8);
        bodyGrad.addColorStop(0, '#A8D8A8');
        bodyGrad.addColorStop(0.3, '#8FBC8F');
        bodyGrad.addColorStop(0.6, '#6B8E6B');
        bodyGrad.addColorStop(0.8, '#4A5D23');
        bodyGrad.addColorStop(1, '#2F4F2F');
        
        this.ctx.fillStyle = bodyGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.6, -size * 0.2);
        this.ctx.bezierCurveTo(-size * 0.5, -size * 0.8, size * 0.5, -size * 0.8, size * 0.7, -size * 0.2);
        this.ctx.bezierCurveTo(size * 0.7, size * 0.2, -size * 0.5, size * 0.2, -size * 0.6, -size * 0.2);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Belly with different color
        const bellyGrad = this.ctx.createLinearGradient(0, -size * 0.1, 0, size * 0.2);
        bellyGrad.addColorStop(0, '#B8E6B8');
        bellyGrad.addColorStop(1, '#9ACD9A');
        
        this.ctx.fillStyle = bellyGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.4, -size * 0.1);
        this.ctx.bezierCurveTo(-size * 0.3, -size * 0.3, size * 0.3, -size * 0.3, size * 0.5, -size * 0.1);
        this.ctx.bezierCurveTo(size * 0.5, size * 0.1, -size * 0.3, size * 0.1, -size * 0.4, -size * 0.1);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Muscle definition
        this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(-size * 0.2, -size * 0.3, size * 0.15, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(size * 0.2, -size * 0.3, size * 0.15, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Scale texture with breathing effect
        this.ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for(let i = 0; i < 30; i++) {
            const x = (Math.random() - 0.5) * size * 1.2;
            const y = (Math.random() - 0.5) * size * 0.9;
            const scale = 1 + breathing * 0.1;
            this.ctx.beginPath();
            this.ctx.arc(x, y, (Math.random() * 2 + 1) * scale, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Highlight on top
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.5, -size * 0.2);
        this.ctx.bezierCurveTo(-size * 0.4, -size * 0.7, size * 0.4, -size * 0.7, size * 0.6, -size * 0.2);
        this.ctx.bezierCurveTo(size * 0.6, -size * 0.4, -size * 0.4, -size * 0.4, -size * 0.5, -size * 0.2);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawDinoNeck(size) {
        const grad = this.ctx.createLinearGradient(0, -size * 0.3, 0, size * 0.2);
        grad.addColorStop(0, '#5A6D33');
        grad.addColorStop(1, '#4A5D23');
        
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.bezierCurveTo(size * 0.05, -size * 0.2, size * 0.15, -size * 0.3, size * 0.25, -size * 0.2);
        this.ctx.bezierCurveTo(size * 0.3, size * 0.1, size * 0.1, size * 0.1, 0, size * 0.1);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawDinoHead(size, headSway) {
        this.ctx.save();
        this.ctx.translate(size * 0.4 + headSway, -size * 0.6);
        
        // Head with enhanced gradient
        const headGrad = this.ctx.createRadialGradient(size * 0.3, -size * 0.2, 0, size * 0.3, -size * 0.2, size * 0.6);
        headGrad.addColorStop(0, '#B8F0B8');
        headGrad.addColorStop(0.3, '#98FB98');
        headGrad.addColorStop(0.6, '#7B9A7B');
        headGrad.addColorStop(0.8, '#5F7A5F');
        headGrad.addColorStop(1, '#3D5A3D');
        
        this.ctx.fillStyle = headGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(size * 0.5, -size * 0.4);
        this.ctx.bezierCurveTo(size * 0.2, -size * 0.5, size * 0.0, -size * 0.2, size * 0.1, 0.1);
        this.ctx.bezierCurveTo(size * 0.1, size * 0.3, size * 0.4, size * 0.2, size * 0.5, size * 0.1);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Jaw
        const jawGrad = this.ctx.createLinearGradient(size * 0.1, 0, size * 0.5, 0);
        jawGrad.addColorStop(0, '#8FBC8F');
        jawGrad.addColorStop(1, '#6B8E6B');
        
        this.ctx.fillStyle = jawGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(size * 0.5, 0.1);
        this.ctx.bezierCurveTo(size * 0.4, size * 0.3, size * 0.2, size * 0.3, size * 0.1, 0.1);
        this.ctx.bezierCurveTo(size * 0.2, 0.2, size * 0.4, 0.2, size * 0.5, 0.1);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Eye with more detail
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.ellipse(size * 0.25, -size * 0.2, size * 0.06, size * 0.05, -0.3, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Eye highlight
        this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
        this.ctx.beginPath();
        this.ctx.arc(size * 0.27, -size * 0.22, size * 0.015, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Eye pupil
        this.ctx.fillStyle = '#000';
        this.ctx.beginPath();
        this.ctx.arc(size * 0.25, -size * 0.2, size * 0.02, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Nostril
        this.ctx.fillStyle = '#2F4F2F';
        this.ctx.beginPath();
        this.ctx.ellipse(size * 0.1, -size * 0.15, size * 0.03, size * 0.02, -0.2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Teeth
        this.ctx.fillStyle = '#F0F0F0';
        for (let i = 0; i < 4; i++) {
            const toothX = size * 0.3 + i * size * 0.08;
            const toothY = size * 0.15;
            this.ctx.beginPath();
            this.ctx.moveTo(toothX, toothY);
            this.ctx.lineTo(toothX + size * 0.02, toothY + size * 0.08);
            this.ctx.lineTo(toothX - size * 0.02, toothY + size * 0.08);
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        // Head highlight
        this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
        this.ctx.beginPath();
        this.ctx.moveTo(size * 0.5, -size * 0.4);
        this.ctx.bezierCurveTo(size * 0.3, -size * 0.45, size * 0.2, -size * 0.3, size * 0.3, -size * 0.2);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawDinoSpikes(size) {
        // Back spikes with gradient
        const spikeGrad = this.ctx.createLinearGradient(0, -size * 0.8, 0, -size * 0.3);
        spikeGrad.addColorStop(0, '#4A5D23');
        spikeGrad.addColorStop(0.5, '#6B8E6B');
        spikeGrad.addColorStop(1, '#8FBC8F');
        
        this.ctx.fillStyle = spikeGrad;
        
        // Draw multiple spikes
        for (let i = 0; i < 6; i++) {
            const spikeX = -size * 0.3 + i * size * 0.12;
            const spikeY = -size * 0.4;
            const spikeHeight = size * 0.2 + Math.random() * size * 0.1;
            
            this.ctx.beginPath();
            this.ctx.moveTo(spikeX, spikeY);
            this.ctx.lineTo(spikeX + size * 0.03, spikeY - spikeHeight);
            this.ctx.lineTo(spikeX - size * 0.03, spikeY - spikeHeight);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Spike highlight
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.beginPath();
            this.ctx.moveTo(spikeX, spikeY);
            this.ctx.lineTo(spikeX + size * 0.01, spikeY - spikeHeight);
            this.ctx.lineTo(spikeX - size * 0.01, spikeY - spikeHeight);
            this.ctx.closePath();
            this.ctx.fill();
            
            this.ctx.fillStyle = spikeGrad;
        }
    }
    
    // Helper functions for color manipulation
    lightenColor(color, amount) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * amount * 100);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }
    
    darkenColor(color, amount) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * amount * 100);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return "#" + (0x1000000 + (R > 255 ? 255 : R < 0 ? 0 : R) * 0x10000 +
            (G > 255 ? 255 : G < 0 ? 0 : G) * 0x100 +
            (B > 255 ? 255 : B < 0 ? 0 : B)).toString(16).slice(1);
    }
    
    drawBullets() {
        const r = Math.max(2, Math.round(this.gridSize * 0.1));
        for (const bullet of this.bullets) {
            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, r + 2, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    updateUI() {
        document.getElementById('health').textContent = this.gameState.health;
        document.getElementById('money').textContent = this.gameState.money;
        document.getElementById('wave').textContent = this.gameState.wave;
        document.getElementById('score').textContent = this.gameState.score;
        document.getElementById('level').textContent = this.currentLevel;
        document.getElementById('diamonds').textContent = this.diamonds;
        
        // Update tower costs
        document.querySelectorAll('.tower-option').forEach(option => {
            const type = option.dataset.tower;
            const cost = this.towerCosts[type];
            option.querySelector('.tower-cost').textContent = `$${cost}`;
            option.style.opacity = this.gameState.money >= cost ? '1' : '0.5';
        });
        
        // Update grid expansion cost
        document.getElementById('expandDiamonds').textContent = this.expansionDiamonds;
        const expandButton = document.getElementById('expandGrid');
        expandButton.disabled = this.diamonds < this.expansionDiamonds || (this.cols >= this.maxCols && this.rows >= this.maxRows) || this.waveInProgress || this.enemies.length > 0 || this.gameState.wave > 1;
        expandButton.style.opacity = expandButton.disabled ? '0.5' : '1';
    }
    
    checkGameOver() {
        if (this.gameState.health <= 0) {
            this.gameState.gameOver = true;
            this.debugLog(`💀 OYUN BİTTİ! Final Xal: ${this.gameState.score}`);
            
            // Show game over screen with restart option
            const restart = confirm(`Game Over!\n\nFinal Score: ${this.gameState.score}\nFinal Wave: ${this.gameState.wave}\nFinal Level: ${this.currentLevel}\n\nYenidən başlatmaq istəyirsiniz?`);
            
            if (restart) {
                this.restartGame();
            }
        }
    }
    
    restartGame() {
        this.debugLog(`🔄 Oyun yenidən başladılır...`);
        
        // Reset game state
        this.gameState = {
            health: 100,
            money: 500,
            wave: 1,
            score: 0,
            isPaused: false,
            gameOver: false
        };
        
        // Reset level system
        this.currentLevel = 1;
        this.levelMultiplier = 1.0;
        
        // Reset grid to initial size
        this.cols = 32;
        this.rows = 18;
        this.expansionCost = 100;
        this.expansionDiamonds = 5;
        // Keep diamonds persistent - don't reset
        
        // Clear all game objects
        this.towers = [];
        this.enemies = [];
        this.bullets = [];
        this.selectedTower = null;
        
        // Reset wave system
        this.currentWaveEnemies = 0;
        this.waveInProgress = false;
        this.waveConfig = {
            enemiesPerWave: 5,
            enemySpawnDelay: 1000,
            waveDelay: 3000
        };
        
        // Reset grid dimensions and path
        this.startCell = null; // Reset to force recalculation
        this.goalCell = null; // Reset to force recalculation
        this.updateGridDimensions();
        this.recomputePath();
        
        // Reset UI
        this.updateUI();
        this.hideTowerContext();
        
        // Reset speed to 1x
        this.setGameSpeed(1);
        
        this.debugLog(`✅ Oyun yenidən başladıldı!`);
    }
    
    checkWaveComplete() {
        if (this.waveInProgress && this.enemies.length === 0 && this.currentWaveEnemies >= this.waveConfig.enemiesPerWave) {
            this.waveInProgress = false;
            this.gameState.wave++;
            this.gameState.money += 50; // Wave completion bonus
            this.waveConfig.enemiesPerWave = Math.floor(this.waveConfig.enemiesPerWave * 1.2);
            
            // Hər 3 wave-də level artır
            if (this.gameState.wave % 3 === 0) {
                this.currentLevel++;
                this.debugLog(`🎉 LEVEL ARTIR! Yeni Level: ${this.currentLevel}`);
                this.debugLog(`Düşmənlər artıq daha güclüdür!`);
            }
            
            document.getElementById('startWave').disabled = false;
            this.updateUI();
            
            // Auto start next wave if enabled
            if (this.autoStart) {
                setTimeout(() => {
                    this.startWave();
                }, 2000); // 2 second delay between waves
            }
        }
    }
    
    gameLoop() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime;
        
        if (!this.gameState.isPaused && !this.gameState.gameOver) {
            // Apply game speed
            const scaledDeltaTime = deltaTime * this.gameSpeed;
            
            // Spawn enemies
            if (this.waveInProgress && 
                this.currentWaveEnemies < this.waveConfig.enemiesPerWave &&
                currentTime - this.lastEnemySpawn > this.waveConfig.enemySpawnDelay / this.gameSpeed) {
                this.spawnEnemy();
                this.lastEnemySpawn = currentTime;
            }
            
            // Update game objects
            this.updateEnemies();
            this.updateTowers();
            this.updateBullets();
            
            // Check game conditions
            this.checkGameOver();
            this.checkWaveComplete();
        }
        
        this.lastUpdateTime = currentTime;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw game elements - Kulelər yolun üstündə görünsün
        this.drawGrid();
        this.drawTowers();  // Kulelər əvvəl çizilsin
        this.drawPath();    // Yol sonra çizilsin
        this.drawCastle();  // Qala çizilsin
        this.drawCastleHealthBar();  // Qala can barı çizilsin
        this.drawEnemies();
        this.drawBullets();
        
        // Draw path blocked warning
        if (this.path.length === 0) {
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            this.ctx.font = 'bold 24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('YOL BAĞLANDI!', this.canvas.width / 2, 50);
            this.ctx.font = '16px Arial';
            this.ctx.fillText('Qüllələri satın və yolu açın', this.canvas.width / 2, 80);
            this.ctx.font = '14px Arial';
            this.ctx.fillText('Oyun avtomatik silməz - yalnız siz silə bilərsiniz!', this.canvas.width / 2, 100);
        }
        
        // Debug pəncərəsi tamamilə ləğv edildi
        
        // Continue game loop
        requestAnimationFrame(() => this.gameLoop());
    }
    
    setupHighDPIRendering() {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        
        // Set actual canvas size to high DPI
        this.canvas.width = displayWidth * devicePixelRatio;
        this.canvas.height = displayHeight * devicePixelRatio;
        
        // Scale the canvas back down using CSS
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';
        
        // Scale the drawing context so everything draws at the correct size
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
        
        // Store the scale factor for use in other functions
        this.devicePixelRatio = devicePixelRatio;
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    new TowerDefenseGame();
});
