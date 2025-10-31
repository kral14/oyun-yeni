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
        this.enemyBullets = [];
        this.explosions = []; // Explosion effects (ice, fire, etc.)
        this.selectedTower = null;
        this.selectedTowerType = 'basic';
        this.towerCosts = {
            basic: 50,
            rapid: 100,
            heavy: 200,
            ice: 0,      // Stars only
            flame: 0,    // Stars only
            laser: 0,    // Stars only
            plasma: 0    // Stars only
        };
        
        this.towerStarCosts = {
            ice: 1,
            flame: 2,
            laser: 3,
            plasma: 4
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
        // Orientation-specific defaults: landscape 9x20, portrait 11x10
        this.rows = 9; // placeholder, will be set by setGridForOrientation()
        this.cols = 20;
        this.lastOrientationPortrait = null;
        this.setGridForOrientation();
        // If user-specified board size exists, prefer it and freeze orientation auto-sizing
        try {
            const savedRows = parseInt(localStorage.getItem('td_board_rows') || '');
            const savedCols = parseInt(localStorage.getItem('td_board_cols') || '');
            if (Number.isFinite(savedRows) && Number.isFinite(savedCols) && savedRows > 0 && savedCols > 0) {
                this.rows = savedRows;
                this.cols = savedCols;
                this.orientationOverride = true;
            } else {
                this.orientationOverride = false;
            }
        } catch(e) { this.orientationOverride = false; }
        this.baseGridSize = 25;
        this.gridSize = this.baseGridSize;
        this.scale = 1;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
        this.updateGridDimensions();
        // Stable cell id grid to keep towers locked to cells across expansions
        this.cellIdGrid = [];
        this.nextCellId = 1;
        this.initCellIds();
        
        // Grid expansion system
        this.maxCols = 48; // maximum grid size
        this.maxRows = 27; // maximum grid size
        this.expansionCost = 100; // cost to expand grid
        this.expansionDiamonds = 5; // diamonds needed to expand grid
        // Default diamonds: at least 500
        this.diamonds = parseInt(localStorage.getItem('towerDefenseDiamonds') || '500');
        if (!Number.isFinite(this.diamonds) || this.diamonds < 500) {
            this.diamonds = 500;
            localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        }
        
        // Stars system (persistent across restarts)
        const savedStars = localStorage.getItem('towerDefenseStars');
        if (savedStars === null || savedStars === '0') {
            // İlk dəfə və ya sıfır olduqda, başlanğıc ulduz ver: 100
            this.stars = 100;
            localStorage.setItem('towerDefenseStars', this.stars.toString());
        } else {
            this.stars = parseInt(savedStars);
            if (!Number.isFinite(this.stars) || this.stars < 0) {
                this.stars = 100;
                localStorage.setItem('towerDefenseStars', this.stars.toString());
            }
        }
        
        // Redeemed gift codes (prevent reuse)
        this.redeemedCodes = JSON.parse(localStorage.getItem('towerDefenseRedeemedCodes') || '[]');
        
        // Game speed system
        this.gameSpeed = 1; // 1x, 2x, 3x speed
        this.lastUpdateTime = 0;
        
        // Wave message display
        this.waveMessage = null; // {text, until}
        
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

        // Grid expansion reveal animation
        this.expandAnim = null; // { cells:[{col,row}], startedAt, duration }
        // Range UI removed per request

        this.init();
    }
    
    updateGridDimensions() {
        // Responsive: compute from actual canvas size
        const cw = this.canvas.width;   // device pixels
        const ch = this.canvas.height;  // device pixels

        // Leave padding around the board; use smaller pad on portrait to maximize fit
        if (this.orientationOverride) return; // keep user-defined size
        const portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
        const padRatio = portrait ? 0.02 : 0.04;
        const pad = Math.max(6, Math.round(Math.min(cw, ch) * padRatio));
        const cellW = Math.floor((cw - pad * 2) / this.cols);
        const cellH = Math.floor((ch - pad * 2) / this.rows);
        this.gridSize = Math.max(10, Math.min(cellW, cellH));

        // Compute grid offsets to center with padding - ALWAYS center the grid
        const boardW = this.gridSize * this.cols;
        const boardH = this.gridSize * this.rows;
        this.gridOffsetX = Math.round((cw - boardW) / 2);
        this.gridOffsetY = Math.round((ch - boardH) / 2);

        // Logical grid layout stays constant
        this.gridCols = this.cols;
        this.gridRows = this.rows;
        
        // Ensure start/goal cells exist and are within current bounds
        const midRow = Math.floor(this.gridRows / 2);
        if (!this.startCell || !Number.isFinite(this.startCell.row) || !Number.isFinite(this.startCell.col)) {
            this.startCell = { col: 0, row: midRow };
        }
        if (!this.goalCell || !Number.isFinite(this.goalCell.row) || !Number.isFinite(this.goalCell.col)) {
            this.goalCell = { col: this.gridCols - 1, row: midRow };
        }
        // Clamp to board
        this.startCell.col = Math.max(0, Math.min(this.gridCols - 1, this.startCell.col));
        this.startCell.row = Math.max(0, Math.min(this.gridRows - 1, this.startCell.row));
        this.goalCell.col = Math.max(0, Math.min(this.gridCols - 1, this.goalCell.col));
        this.goalCell.row = Math.max(0, Math.min(this.gridRows - 1, this.goalCell.row));

        // Scale factor relative to base size
        this.scale = this.gridSize / this.baseGridSize;
        this.debugLog(`Grid fixed: ${this.gridCols}x${this.gridRows}, gridSize=${this.gridSize}, offset=(${this.gridOffsetX},${this.gridOffsetY}), scale=${this.scale.toFixed(2)}`);
    }

    initCellIds() {
        this.cellIdGrid = new Array(this.rows);
        for (let r = 0; r < this.rows; r++) {
            this.cellIdGrid[r] = new Array(this.cols);
            for (let c = 0; c < this.cols; c++) {
                this.cellIdGrid[r][c] = this.nextCellId++;
            }
        }
    }

    getCellPosById(cellId) {
        for (let r = 0; r < this.cellIdGrid.length; r++) {
            const rowArr = this.cellIdGrid[r];
            for (let c = 0; c < rowArr.length; c++) {
                if (rowArr[c] === cellId) return { col: c, row: r };
            }
        }
        return null;
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
            // If tower is bound to a stable cell id, resolve current col/row
            if (tower.cellId) {
                const pos = this.getCellPosById(tower.cellId);
                if (pos) { tower.col = pos.col; tower.row = pos.row; }
            } else {
                // Backfill logical grid position if missing (legacy towers)
                if (typeof tower.col !== 'number' || typeof tower.row !== 'number') {
                    const c = Math.max(0, Math.min(this.gridCols - 1, Math.floor((tower.x - this.gridOffsetX) / this.gridSize)));
                    const r = Math.max(0, Math.min(this.gridRows - 1, Math.floor((tower.y - this.gridOffsetY) / this.gridSize)));
                    tower.col = c; tower.row = r;
                }
            }
            // Calculate new pixel position based on grid cell
            const newX = this.gridOffsetX + tower.col * this.gridSize + this.gridSize / 2;
            const newY = this.gridOffsetY + tower.row * this.gridSize + this.gridSize / 2;
            
            this.debugLog(`🏗️ Qüllə (${tower.col}, ${tower.row}): (${tower.x}, ${tower.y}) -> (${newX}, ${newY})`);
            
            // Update tower position
            tower.x = newX;
            tower.y = newY;
            // Recompute range to match new scale
            tower.range = this.getTowerRange(tower.type);
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

    // Special tab: +2 rows (top+bottom) purchase with diamonds
    buyRows() {
        const cost = 5;
        // Allow during pause regardless of wave/enemies; otherwise restrict
        if (!this.gameState.isPaused && (this.waveInProgress || this.enemies.length > 0 || this.gameState.wave > 1)) {
            this.debugWarning('Sətir alma yalnız oyun başlamadan mümkündür.');
            return;
        }
        if (this.diamonds < cost) { this.debugWarning('Kifayət qədər almaz yoxdur.'); return; }
        if (this.rows + 2 > this.maxRows) { this.debugWarning('Maksimum sətir sayına çatılıb.'); return; }
        this.diamonds -= cost;
        // Extend ID grid: add one row at TOP and one at BOTTOM with new ids
        const newTop = new Array(this.cols);
        for (let c = 0; c < this.cols; c++) newTop[c] = this.nextCellId++;
        const newBottom = new Array(this.cols);
        for (let c = 0; c < this.cols; c++) newBottom[c] = this.nextCellId++;
        this.cellIdGrid.unshift(newTop);
        this.cellIdGrid.push(newBottom);
        this.rows = this.cellIdGrid.length; // one up, one down keeps middle path
        this.updateGridDimensions(); // This recalculates gridSize (smaller) and re-centers grid
        // Towers' col/row stay the same - just recalculate pixel positions
        this.updateTowerPositions();
        // keep start at (0, mid) and goal at (cols-1, mid)
        const midRow = Math.floor(this.gridRows / 2);
        this.startCell = { col: 0, row: midRow };
        this.goalCell = { col: this.gridCols - 1, row: midRow };
        this.recomputePath();
        // Animation cells for top and bottom new rows
        const topRowIdx = 0, bottomRowIdx = this.gridRows - 1; const cells = [];
        for (let c = 0; c < this.gridCols; c++) { cells.push({ col: c, row: topRowIdx }); }
        for (let c = 0; c < this.gridCols; c++) { cells.push({ col: c, row: bottomRowIdx }); }
        this.expandAnim = { cells, startedAt: Date.now(), duration: 600 };
        // Force UI refresh to show new dimensions
        localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        this.debugSuccess(`Grid genişləndi: ${this.gridCols}×${this.gridRows}, yeni hüceyrələr hazırdır`);
        this.updateUI();
    }

    // Special tab: +1 column added to the right side from center
    buyCol() {
        const cost = 3;
        if (!this.gameState.isPaused && (this.waveInProgress || this.enemies.length > 0 || this.gameState.wave > 1)) {
            this.debugWarning('Sütun alma yalnız oyun başlamadan mümkündür.');
            return;
        }
        if (this.diamonds < cost) { this.debugWarning('Kifayət qədər almaz yoxdur.'); return; }
        if (this.cols + 1 > this.maxCols) { this.debugWarning('Maksimum sütun sayına çatılıb.'); return; }
        this.diamonds -= cost;
        // Extend ID grid: add one column on the RIGHT with new ids
        for (let r = 0; r < this.cellIdGrid.length; r++) {
            this.cellIdGrid[r].push(this.nextCellId++);
        }
        this.cols = this.cellIdGrid[0].length; // extend to the right
        this.updateGridDimensions(); // This recalculates gridSize (smaller) and re-centers grid
        // Towers' col/row stay the same - just recalculate pixel positions
        this.updateTowerPositions();
        // update goal to new rightmost column
        this.goalCell.col = this.gridCols - 1;
        this.startCell.col = 0;
        this.recomputePath();
        // Animation cells for the new rightmost column
        const newCol = this.gridCols - 1; const cells2 = [];
        for (let r = 0; r < this.gridRows; r++) { cells2.push({ col: newCol, row: r }); }
        this.expandAnim = { cells: cells2, startedAt: Date.now(), duration: 600 };
        // Force UI refresh to show new dimensions
        localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        this.debugSuccess(`Grid genişləndi: ${this.gridCols}×${this.gridRows}, yeni hüceyrələr hazırdır`);
        this.updateUI();
    }
    
    redeemGiftCode(code) {
        if (!code || code.length < 10) {
            this.showGiftCodeMessage('❌ Kod çox qısadır!', 'error');
            return;
        }
        
        // Check if already redeemed
        if (this.redeemedCodes.includes(code)) {
            this.showGiftCodeMessage('⚠️ Bu kod artıq istifadə edilib!', 'error');
            return;
        }
        
        // Decode gift code
        try {
            // Debug: Show original input
            this.debugLog(`🔍 Orijinal kod (uzunluq: ${code.length}): ${JSON.stringify(code.substring(0, 50))}...`);
            
            // Step 1: Remove all control characters and invisible characters
            let cleaned = code
                .replace(/[\x00-\x1F\x7F-\x9F]/g, '')  // Remove control characters
                .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width spaces
                .trim();
            
            this.debugLog(`🔍 Trim sonrası (uzunluq: ${cleaned.length}): ${JSON.stringify(cleaned.substring(0, 50))}...`);
            
            // Step 2: Remove quotes if present
            cleaned = cleaned.replace(/^["']+|["']+$/g, '');
            
            // Step 3: Remove all whitespace (spaces, newlines, tabs, etc.)
            cleaned = cleaned.replace(/\s+/g, '');
            
            // Step 4: Remove any invalid base64 characters (keep only A-Z, a-z, 0-9, +, /, =, -, _)
            cleaned = cleaned.replace(/[^A-Za-z0-9+\/=\-_]/g, '');
            
            this.debugLog(`🔍 Təmizlənmiş kod (uzunluq: ${cleaned.length}): ${cleaned.substring(0, 50)}...`);
            
            if (cleaned.length === 0) {
                throw new Error('Kod tamamilə silindi - etibarsız simvollar');
            }
            
            // Step 5: Convert URL-safe base64 to standard base64
            cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
            
            // Step 6: Add padding if needed (base64 requires length to be multiple of 4)
            const paddingNeeded = (4 - (cleaned.length % 4)) % 4;
            if (paddingNeeded > 0) {
                cleaned += '='.repeat(paddingNeeded);
                this.debugLog(`🔧 Padding əlavə edildi: ${paddingNeeded} simvol`);
            }
            
            this.debugLog(`🔍 Son kod (uzunluq: ${cleaned.length}): ${cleaned.substring(0, 50)}...`);
            
            // Try to decode - first as base64, then as plain JSON
            let data = null;
            let decodeError = null;
            
            // Try base64 decode first
            try {
                const decoded = atob(cleaned);
                this.debugLog(`✅ Base64 dekodlaşdırıldı: ${decoded}`);
                
                try {
                    data = JSON.parse(decoded);
                    this.debugLog(`✅ JSON parse edildi: ${JSON.stringify(data)}`);
                } catch (jsonError) {
                    decodeError = `JSON parse xətası: ${jsonError.message}, Decoded string: ${decoded.substring(0, 100)}`;
                    this.debugError(decodeError);
                    throw jsonError;
                }
            } catch (b64Error) {
                decodeError = `Base64 decode xətası: ${b64Error.message}`;
                this.debugError(`⚠️ Base64 decode uğursuz: ${b64Error.message}`);
                this.debugError(`   Kod: ${cleaned.substring(0, 50)}...`);
                
                // If base64 fails, try as plain JSON (for debugging)
                try {
                    const jsonStr = code.trim().replace(/^["']|["']$/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
                    data = JSON.parse(jsonStr);
                    this.debugLog(`✅ JSON olaraq dekodlaşdırıldı`);
                } catch (jsonError) {
                    this.debugError(`❌ Hər iki decode uğursuz:`);
                    this.debugError(`   Base64: ${b64Error.message}`);
                    this.debugError(`   JSON: ${jsonError.message}`);
                    this.debugError(`   Original: ${JSON.stringify(code.substring(0, 100))}`);
                    this.debugError(`   Cleaned: ${cleaned.substring(0, 100)}`);
                    throw new Error(`Kod dekodlaşdırıla bilmədi. Generator ilə yaradılmış base64 kodu yoxlayın. Konsolda detallı məlumat var.`);
                }
            }
            
            if (!data) {
                throw new Error('Kod dekodlaşdırıldı, amma məlumat tapılmadı');
            }
            
            // Validate structure
            if (!data || (!data.money && !data.diamonds && !data.stars)) {
                throw new Error('Invalid code format');
            }
            
            // Apply rewards
            const moneyReward = Number(data.money) || 0;
            const diamondsReward = Number(data.diamonds) || 0;
            const starsReward = Number(data.stars) || 0;
            
            if (moneyReward > 0) {
                this.gameState.money += moneyReward;
            }
            if (diamondsReward > 0) {
                this.diamonds += diamondsReward;
                localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
            }
            if (starsReward > 0) {
                this.stars += starsReward;
                localStorage.setItem('towerDefenseStars', this.stars.toString());
            }
            
            // Mark as redeemed
            this.redeemedCodes.push(code);
            localStorage.setItem('towerDefenseRedeemedCodes', JSON.stringify(this.redeemedCodes));
            
            // Clear input
            const giftCodeInput = document.getElementById('giftCodeInput');
            if (giftCodeInput) giftCodeInput.value = '';
            
            // Show success message
            let rewardText = [];
            if (moneyReward > 0) rewardText.push(`💰 ${moneyReward} pul`);
            if (diamondsReward > 0) rewardText.push(`💎 ${diamondsReward} elmas`);
            if (starsReward > 0) rewardText.push(`⭐ ${starsReward} ulduz`);
            
            this.showGiftCodeMessage(`✅ Hədiyyə alındı: ${rewardText.join(', ')}`, 'success');
            this.updateUI();
            this.debugSuccess(`🎁 Kod istifadə edildi: ${rewardText.join(', ')}`);
        } catch (e) {
            this.showGiftCodeMessage('❌ Etibarsız kod! Generator ilə yaradılmış base64 kodu daxil edin.', 'error');
            this.debugError(`Gift code decode failed: ${e.message}`);
        }
    }
    
    showGiftCodeMessage(message, type = 'info') {
        const messageEl = document.getElementById('giftCodeMessage');
        if (!messageEl) return;
        
        messageEl.textContent = message;
        messageEl.style.color = type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#a0a0a0';
        
        // Auto clear after 5 seconds
        setTimeout(() => {
            messageEl.textContent = '';
        }, 5000);
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

    setGridForOrientation() {
        const portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
        this.lastOrientationPortrait = portrait;
        if (portrait) {
            this.rows = 9;
            this.cols = 12;
        } else {
            this.rows = 9;
            this.cols = 15; // requested default
        }
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

            // Overlay shop: align with canvas bounds (top and bottom) and avoid header overlap
            const area = document.querySelector('.game-area');
            if (area) area.style.gridTemplateColumns = '1fr';

            const shop = document.querySelector('.tower-shop');
            if (shop) {
                const rect = this.canvas.getBoundingClientRect();
                // Prefer showing to the right of the canvas if space allows, else pin to right edge
                const gap = 12;
                const canPlaceRight = (window.innerWidth - rect.right) > (shop.offsetWidth + gap * 2);
                shop.style.position = 'fixed';
                shop.style.top = Math.max(0, Math.round(rect.top)) + 'px';
                shop.style.height = Math.round(rect.height) + 'px';
                shop.style.maxHeight = Math.round(rect.height) + 'px';
                if (canPlaceRight) {
                    shop.style.left = Math.round(rect.right + gap) + 'px';
                    shop.style.right = '';
                } else {
                    shop.style.left = '';
                    shop.style.right = gap + 'px';
                }
                shop.style.overflowY = 'auto';
            }

            // Update u/h size labels near the canvas
            const labelW = document.getElementById('labelW');
            const labelH = document.getElementById('labelH');
            if (labelW) labelW.textContent = 'u: ' + cssW;
            if (labelH) labelH.textContent = 'h: ' + cssH;
        };

        const doResize = () => {
            const isPortrait = window.matchMedia('(orientation: portrait)').matches;
            if (this.lastOrientationPortrait === null) this.lastOrientationPortrait = isPortrait;
            const orientationChanged = this.lastOrientationPortrait !== isPortrait;

            // If orientation changed and it's safe, switch grid dimensions
            if (orientationChanged && !this.orientationOverride) {
                const safeToSwap = (!this.towers || this.towers.length === 0) && (!this.enemies || this.enemies.length === 0) && (!this.gameState || this.gameState.wave <= 1);
                if (safeToSwap) {
                    this.setGridForOrientation();
                }
            }

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
            // Right-click should open context only, never start placement
            if (e.button === 2) {
                const tower = this.getTowerAtPosition(x, y);
                if (tower) {
                    this.selectTower(tower);
                    this.showTowerContextAt(tower);
                }
                return;
            }
            // Handle range UI clicks when a tower is selected
            if (this.selectedTower && this.rangeUiRects) {
            const p = this.rangeUiRects.plus, m = this.rangeUiRects.minus;
                const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
                if (hit(p)) {
                    // removed
                    return;
                }
                if (hit(m)) {
                    // removed
                    return;
                }
            }

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
                    // Only left-click can start placement
                    if (e.button !== 0) return;
                    const type = this.selectedTowerType || 'basic';
                    this.selectedTowerType = type;
                    const cost = this.towerCosts[type] || this.towerCosts['basic'];
                    this.debugLog(`Tower type: ${type}, Cost: $${cost}, Money: $${this.gameState.money}`);
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
            if (e.button !== 0) return; // only left click finalizes placement
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
        const buyRowsBtn = document.getElementById('buyRows');
        const buyColBtn = document.getElementById('buyCol');
        buyRowsBtn && buyRowsBtn.addEventListener('click', () => this.buyRows());
        buyColBtn && buyColBtn.addEventListener('click', () => this.buyCol());
        
        // Gift code redemption
        const redeemCodeBtn = document.getElementById('redeemCode');
        const giftCodeInput = document.getElementById('giftCodeInput');
        if (redeemCodeBtn && giftCodeInput) {
            const handleRedeem = () => {
                // DON'T use toUpperCase() - it corrupts base64 codes!
                const code = giftCodeInput.value.trim();
                this.redeemGiftCode(code);
            };
            redeemCodeBtn.addEventListener('click', handleRedeem);
            giftCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleRedeem();
                }
            });
        }
        
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
        const ctxSellBtn = document.getElementById('ctxSell');
        ctxSellBtn && ctxSellBtn.addEventListener('click', () => {
            this.sellTower();
            this.hideTowerContext();
        });
        const btnHeal = document.getElementById('ctxHeal');
        btnHeal && btnHeal.addEventListener('click', () => { this.healTower(); });
        const btnShield = document.getElementById('ctxShield');
        btnShield && btnShield.addEventListener('click', () => { this.shieldTower(); });
        const btnRange = document.getElementById('ctxRange');
        btnRange && btnRange.addEventListener('click', () => { this.upgradeRange(); });
        const btnDmg = document.getElementById('ctxDamage');
        btnDmg && btnDmg.addEventListener('click', () => { this.upgradeDamage(); });
        const btnRate = document.getElementById('ctxRate');
        btnRate && btnRate.addEventListener('click', () => { this.upgradeFireRate(); });
        const btnAw = document.getElementById('ctxAwaken');
        btnAw && btnAw.addEventListener('click', () => { this.awakenTower(); });

        // Disable browser context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const { x, y } = this.getCanvasCoords(e);
            const tower = this.getTowerAtPosition(x, y);
            if (tower) {
                this.selectTower(tower);
                this.showTowerContextAt(tower);
            }
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
        const options = document.querySelectorAll('.tower-option');
        options && options.forEach(option => option.classList.remove('selected'));
        const el = document.querySelector(`[data-tower="${type}"]`);
        if (el) el.classList.add('selected');
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
        const colsForIter = Number.isFinite(this.gridCols) ? this.gridCols : (Number.isFinite(this.cols) ? this.cols : 0);
        const rowsForIter = Number.isFinite(this.gridRows) ? this.gridRows : (Number.isFinite(this.rows) ? this.rows : 0);
        const maxIterations = Math.max(1, colsForIter * rowsForIter * 2); // Prevent infinite loops

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
        // Ensure start/goal initialized
        if (!this.startCell || !this.goalCell) {
            const midRow = Math.floor((this.rows || this.gridRows || 1) / 2);
            this.startCell = this.startCell || { col: 0, row: midRow };
            this.goalCell = this.goalCell || { col: (this.cols || this.gridCols || 1) - 1, row: midRow };
        }
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
        this.debugTower(`Current grid: ${this.gridCols}×${this.gridRows}, offset=(${this.gridOffsetX},${this.gridOffsetY}), size=${this.gridSize}`);
        
        // Snap to center of the cell under cursor
        const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
        const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
        const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
        const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
        
        this.debugTower(`Snapped to: (${cellCol}, ${cellRow}) -> (${gridX}, ${gridY})`);
        
        // Check bounds - ensure we're using current grid dimensions
        if (cellCol < 0 || cellCol >= this.gridCols || cellRow < 0 || cellRow >= this.gridRows) {
            this.debugError(`Position out of bounds: (${cellCol}, ${cellRow}) - Grid: ${this.gridCols}×${this.gridRows} (cols=${this.cols}, rows=${this.rows})`);
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
        const cost = this.towerCosts[this.selectedTowerType] || 0;
        const starCost = this.towerStarCosts[this.selectedTowerType] || 0;
        
        // Check if tower requires stars
        if (starCost > 0) {
            if (this.stars < starCost) {
                this.debugError(`Yetersiz ulduz: ${starCost} ulduz gerekli, ${this.stars} mevcut`);
                return;
            }
        } else {
            // Check money for regular towers
            if (this.gameState.money < cost) {
                this.debugError(`Yetersiz para: $${cost} gerekli, $${this.gameState.money} mevcut`);
                return;
            }
        }
        
        this.debugTower(`Kule yerleştirme denemesi: ${this.selectedTowerType} kulesi (${x}, ${y}) - Maliyet: ${starCost > 0 ? `${starCost}⭐` : `$${cost}`}, ${starCost > 0 ? `Ulduz: ${this.stars}` : `Para: $${this.gameState.money}`}`);
        
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
            cellId: (this.cellIdGrid[cellRow] && this.cellIdGrid[cellRow][cellCol]) ? this.cellIdGrid[cellRow][cellCol] : null,
            // pixel position derived (for immediate drawing)
            x: gridX,
            y: gridY,
            type: this.selectedTowerType,
            level: 1,
            range: this.getTowerRange(this.selectedTowerType),
            damage: this.getTowerDamage(this.selectedTowerType),
            fireRate: this.getTowerFireRate(this.selectedTowerType),
            health: 100,
            maxHealth: 100,
            // new upgrade slots
            rangeUp: 0,
            damageUp: 0,
            rateUp: 0,
            awakened: false,
            shielded: false,
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
        
        // Deduct cost (money or stars)
        if (starCost > 0) {
            this.stars -= starCost;
            localStorage.setItem('towerDefenseStars', this.stars.toString());
            this.debugTower(`Ulduz çıxıldı: ${starCost}, qalan: ${this.stars}`);
        } else {
            this.gameState.money -= cost;
        }
        
        this.debugTower(`Yerleştirme sonrası - Kuleler: ${this.towers.length}, Para: $${this.gameState.money}, Ulduz: ${this.stars}`);
        
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
        
        // Fill dynamic values and enable/disable
        // Upgrade button removed
        
        const btnSell = document.getElementById('ctxSell');
        if (btnSell) {
            const sellValue = Math.floor(this.towerCosts[this.selectedTower.type] / 3);
            btnSell.textContent = `Sell ($${sellValue})`;
        } else {
            this.debugLog('ERROR: ctxSell button not found');
        }

        // Stats buttons
        const t = this.selectedTower;
        const limit = t.awakened ? 6 : 3;
        const rangeBtn = document.getElementById('ctxRange');
        const dmgBtn = document.getElementById('ctxDamage');
        const rateBtn = document.getElementById('ctxRate');
        const rVal = document.getElementById('ctxRangeVal');
        const dVal = document.getElementById('ctxDamageVal');
        const fVal = document.getElementById('ctxRateVal');
        const rUp = document.getElementById('ctxRangeUp');
        const dUp = document.getElementById('ctxDamageUp');
        const fUp = document.getElementById('ctxRateUp');
        const rCostEl = document.getElementById('ctxRangeCost');
        const dCostEl = document.getElementById('ctxDamageCost');
        const fCostEl = document.getElementById('ctxRateCost');
        const rangeCost = 50, damageCost = 50, rateCost = 50;
        const healBtn = document.getElementById('ctxHeal');
        const healCost = 20;
        const shieldBtn = document.getElementById('ctxShield');
        const shieldCost = 50;
        if (rVal) rVal.textContent = String(t.range);
        if (dVal) dVal.textContent = String(t.damage);
        if (fVal) fVal.textContent = `${Math.round(1000/ t.fireRate * 10)/10}/s`;
        if (rUp) rUp.textContent = `${t.rangeUp||0}/${limit}`;
        if (dUp) dUp.textContent = `${t.damageUp||0}/${limit}`;
        if (fUp) fUp.textContent = `${t.rateUp||0}/${limit}`;
        if (rCostEl) rCostEl.textContent = String(rangeCost);
        if (dCostEl) dCostEl.textContent = String(damageCost);
        if (fCostEl) fCostEl.textContent = String(rateCost);
        if (rangeBtn) rangeBtn.disabled = (t.rangeUp||0) >= limit || this.gameState.money < rangeCost;
        if (dmgBtn) dmgBtn.disabled = (t.damageUp||0) >= limit || this.gameState.money < damageCost;
        if (rateBtn) rateBtn.disabled = (t.rateUp||0) >= limit || this.gameState.money < rateCost;
        if (healBtn) {
            const currentHealth = Math.floor(t.health || t.maxHealth || 100);
            const maxHealth = t.maxHealth || 100;
            healBtn.textContent = `🩹 ${currentHealth}/${maxHealth} — $${healCost}`;
            healBtn.disabled = (t.health >= t.maxHealth) || this.gameState.money < healCost;
        }
        if (shieldBtn) {
            const canShield = t.awakened && (t.rangeUp||0) >= 6 && (t.damageUp||0) >= 6 && (t.rateUp||0) >= 6 && !t.shielded && this.diamonds >= shieldCost;
            shieldBtn.disabled = !canShield;
            shieldBtn.textContent = t.shielded ? '🛡️ Aktiv' : '🛡️ (💎50)';
        }

        // Awaken button
        const awBtn = document.getElementById('ctxAwaken');
        if (awBtn) {
            const canAwaken = !t.awakened && (t.rangeUp||0) >= 3 && (t.damageUp||0) >= 3 && (t.rateUp||0) >= 3 && this.diamonds >= 20;
            awBtn.disabled = !canAwaken;
            awBtn.textContent = t.awakened ? '🌈 Awakened' : '🌈 Awaken (💎20)';
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
            this.selectedTower.damage = Math.floor(this.selectedTower.damage * 1.25);
            this.selectedTower.range = Math.floor(this.selectedTower.range * 1.1);
            this.gameState.money -= upgradeCost;
            this.updateUI();
            this.updateTowerInfo();
        }
    }

    upgradeRange() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (t.rangeUp >= 3 && !t.awakened) return;
        const cost = 50;
        if (this.gameState.money < cost) return;
        t.rangeUp = (t.rangeUp || 0) + 1;
        t.range = Math.floor(t.range * 1.15);
        this.gameState.money -= cost;
        this.updateUI();
        // refresh context menu in place
        this.showTowerContextAt(t);
    }

    upgradeDamage() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (t.damageUp >= 3 && !t.awakened) return;
        const cost = 50;
        if (this.gameState.money < cost) return;
        t.damageUp = (t.damageUp || 0) + 1;
        t.damage = Math.floor(t.damage * 1.2);
        this.gameState.money -= cost;
        this.updateUI();
        this.showTowerContextAt(t);
    }

    upgradeFireRate() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (t.rateUp >= 3 && !t.awakened) return;
        const cost = 50;
        if (this.gameState.money < cost) return;
        t.rateUp = (t.rateUp || 0) + 1;
        t.fireRate = Math.max(80, Math.floor(t.fireRate * 0.85));
        this.gameState.money -= cost;
        this.updateUI();
        this.showTowerContextAt(t);
    }

    awakenTower() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (t.awakened) return;
        const diamondCost = 20;
        if (this.diamonds < diamondCost) return;
        this.diamonds -= diamondCost;
        localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        t.awakened = true;
        // immediate modest boost
        t.damage = Math.floor(t.damage * 1.2);
        t.fireRate = Math.max(60, Math.floor(t.fireRate * 0.85));
        t.range = Math.floor(t.range * 1.1);
        this.updateUI();
        this.showTowerContextAt(t);
    }

    healTower() {
        if (!this.selectedTower) return;
        const cost = 20;
        if (this.gameState.money < cost) return;
        const t = this.selectedTower;
        t.health = t.maxHealth;
        this.gameState.money -= cost;
        this.updateUI();
        this.showTowerContextAt(t);
    }

    shieldTower() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (!t.awakened) return;
        const eligible = (t.rangeUp||0) >= 6 && (t.damageUp||0) >= 6 && (t.rateUp||0) >= 6;
        if (!eligible || t.shielded) return;
        const diamondCost = 50;
        if (this.diamonds < diamondCost) return;
        this.diamonds -= diamondCost;
        localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        t.shielded = true;
        this.updateUI();
        this.showTowerContextAt(t);
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
        // Fixed starting radius: R=117px at gridSize≈76 (≈1.54×gridSize)
        const factor = 1.54;
        return Math.round(this.gridSize * factor);
    }
    
    getTowerDamage(type) {
        const damages = { 
            basic: 20, 
            rapid: 10, 
            heavy: 50,
            ice: 15,
            flame: 25,
            laser: 30,
            plasma: 60
        };
        return damages[type] || 20;
    }
    
    getTowerFireRate(type) {
        const rates = { 
            basic: 1000, 
            rapid: 300, 
            heavy: 2000,
            ice: 800,
            flame: 1000,
            laser: 500,
            plasma: 1500
        };
        return rates[type] || 1000;
    }
    
    startWave() {
        if (this.waveInProgress || this.gameState.gameOver) return;
        
        this.waveInProgress = true;
        this.currentWaveEnemies = 0;
        this.lastEnemySpawn = Date.now();
        
        // Show wave message with enemy count
        const totalEnemies = this.waveConfig.enemiesPerWave;
        this.waveMessage = {
            text: `Wave ${this.gameState.wave}: ${totalEnemies} düşmən gəlir!`,
            until: Date.now() + 2500 // Show for 2.5 seconds
        };
        
        document.getElementById('startWave').disabled = true;
    }
    
    togglePause() {
        this.gameState.isPaused = !this.gameState.isPaused;
        const button = document.getElementById('pauseGame');
        button.textContent = this.gameState.isPaused ? 'Resume' : 'Pause';
        // Update UI to enable/disable grid expansion buttons
        this.updateUI();
    }
    
    spawnEnemy() {
        // Boss (X) spawn chance: every 10 waves or 5% chance otherwise
        const shouldSpawnBoss = this.gameState.wave % 10 === 0 && this.currentWaveEnemies === 0;
        const bossChance = shouldSpawnBoss ? 1.0 : (Math.random() < 0.05 ? true : false);
        
        let type;
        if (bossChance) {
            type = 'boss'; // X boss enemy
        } else {
            const enemyTypes = ['basic', 'fast', 'tank'];
            type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
        }
        
        const enemy = {
            x: (this.path[0] ? this.path[0].x : this.startCell.col * this.gridSize + this.gridSize / 2),
            y: (this.path[0] ? this.path[0].y : this.startCell.row * this.gridSize + this.gridSize / 2),
            type: type,
            level: this.currentLevel,
            health: this.getEnemyHealth(type),
            maxHealth: this.getEnemyHealth(type),
            speed: this.getEnemySpeed(type),
            baseSpeed: this.getEnemySpeed(type), // Store original speed for freeze effect
            pathIndex: 0,
            reward: this.getEnemyReward(type),
            frozen: false,
            frozenUntil: 0,
            burning: false,
            burnDamage: 0,
            burnUntil: 0,
            lastBurnTick: 0
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
        const baseHealths = { basic: 150, fast: 100, tank: 300, boss: 800 };
        const baseHealth = baseHealths[type] || 150;
        
        // Hər level üçün 20% artır
        const levelMultiplier = 1 + (this.currentLevel - 1) * 0.2;
        const finalHealth = Math.floor(baseHealth * levelMultiplier);
        
        const enemyNames = { basic: 'Zombie', fast: 'Eagle', tank: 'Dino', boss: 'Boss X' };
        this.debugLog(`Level ${this.currentLevel}: ${enemyNames[type]} düşmən canı ${baseHealth} -> ${finalHealth} (${levelMultiplier.toFixed(1)}x)`);
        return finalHealth;
    }
    
    getEnemySpeed(type) {
        const baseSpeeds = { basic: 1, fast: 2, tank: 0.5, boss: 0.8 };
        const baseSpeed = baseSpeeds[type] || 1;
        
        // Hər level üçün 10% sürət artır
        const levelMultiplier = 1 + (this.currentLevel - 1) * 0.1;
        const finalSpeed = baseSpeed * levelMultiplier;
        
        // Scale speed modestly with current scale to keep pacing consistent
        return finalSpeed * Math.max(0.75, Math.min(2, this.scale));
    }

    getEnemyDamage(type) {
        const dmg = { basic: 2, fast: 1, tank: 3, boss: 5 };
        return dmg[type] || 2;
    }

    getEnemyRadius(type) {
        // Enemy size scales with cell size and is clamped to stay inside the tile
        const base = type === 'fast' ? 12 : type === 'boss' ? 16 : 14;
        const scaled = Math.max(8, Math.round(base * this.scale));
        const maxByCell = Math.floor(this.gridSize * 0.45);
        return Math.min(scaled, maxByCell);
    }
    
    getEnemyReward(type) {
        const baseRewards = { basic: 10, fast: 15, tank: 25, boss: 100 };
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
            
            // Initialize attack cooldown if not set
            if (!enemy.nextAttackAt) enemy.nextAttackAt = 0;
            
            // Handle freeze effect
            if (enemy.frozen && Date.now() >= enemy.frozenUntil) {
                enemy.frozen = false;
                enemy.speed = enemy.baseSpeed; // Restore original speed
            }
            
            // Handle burn effect
            if (enemy.burning && Date.now() >= enemy.burnUntil) {
                enemy.burning = false;
                enemy.burnDamage = 0;
            } else if (enemy.burning && Date.now() - enemy.lastBurnTick >= 500) {
                // Apply burn damage every 0.5 seconds
                enemy.health -= enemy.burnDamage;
                enemy.lastBurnTick = Date.now();
                if (enemy.health <= 0) {
                    // Enemy died from burn, handle death
                    this.gameState.money += enemy.reward;
                    this.gameState.score += enemy.reward * 2;
                    const index = this.enemies.indexOf(enemy);
                    if (index !== -1) {
                        this.enemies.splice(index, 1);
                        this.updateUI();
                    }
                    continue;
                }
            }
            
            // Check for nearby towers to attack (priority over movement)
            const attackRange = this.gridSize * 2.5; // Increased range so enemies can attack from further
            let nearestTower = null;
            let nearestDistance = Infinity;
            
            for (const t of this.towers) {
                const dtx = t.x - enemy.x;
                const dty = t.y - enemy.y;
                const d2 = Math.hypot(dtx, dty);
                if (d2 < nearestDistance && d2 <= attackRange) {
                    nearestDistance = d2;
                    nearestTower = t;
                }
            }
            
            // If enemy is in range and can attack, attack the tower (while moving)
            if (nearestTower && Date.now() >= enemy.nextAttackAt) {
                if (nearestTower.shielded) {
                    enemy.nextAttackAt = Date.now() + 1000; // shield absorbs attack
                } else {
                const damage = this.getEnemyDamage(enemy.type);
                const oldHealth = nearestTower.health || nearestTower.maxHealth || 100;
                nearestTower.health = Math.max(0, oldHealth - damage);
                
                // Create enemy bullet (visual effect)
                const enemyBullet = {
                    x: enemy.x,
                    y: enemy.y,
                    targetX: nearestTower.x,
                    targetY: nearestTower.y,
                    damage: damage,
                    speed: this.gridSize * 0.15,
                    bornAt: Date.now(),
                    ttlMs: 2000,
                    enemyType: enemy.type
                };
                this.enemyBullets.push(enemyBullet);
                
                const enemyNames = { basic: 'Zombie', fast: 'Qartal', tank: 'Dino', boss: 'Boss X' };
                console.log(`[⚔️ HÜCUM] ${enemyNames[enemy.type]} L${enemy.level} qülləyə ${damage} zərər verdi! Qüllə canı: ${oldHealth}/${nearestTower.maxHealth || 100} -> ${nearestTower.health}/${nearestTower.maxHealth || 100}`);
                this.debugLog(`⚔️ ${enemyNames[enemy.type]} L${enemy.level} qülləyə ${damage} zərər verdi! Qüllə canı: ${oldHealth} -> ${nearestTower.health}`);
                
                if (nearestTower.health <= 0) {
                    const idx = this.towers.indexOf(nearestTower);
                    if (idx !== -1) {
                        this.towers.splice(idx, 1);
                        console.log(`[💥 MƏHV] Qüllə məhv edildi!`);
                        this.debugLog(`💥 Qüllə məhv edildi!`);
                        this.recomputePath();
                    }
                }
                }
                enemy.nextAttackAt = Date.now() + 1000; // 1s cooldown between attacks
                // Continue moving while attacking (don't stop)
            }
            
            // Check for plasma barriers (plasma towers create barriers on path)
            for (const tower of this.towers) {
                if (tower.type === 'plasma') {
                    // Check if enemy is near the path segment where plasma tower's barrier would be
                    // Barrier affects enemies within tower range
                    const distToTower = Math.sqrt((tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2);
                    if (distToTower <= tower.range) {
                        // Apply barrier damage every 0.5 seconds
                        if (!enemy.lastBarrierTick) enemy.lastBarrierTick = 0;
                        if (Date.now() - enemy.lastBarrierTick >= 500) {
                            const barrierDamage = tower.damage * 0.2; // 20% of tower damage per tick
                            enemy.health -= barrierDamage;
                            enemy.lastBarrierTick = Date.now();
                            if (enemy.health <= 0) {
                                // Enemy died from barrier
                                this.gameState.money += enemy.reward;
                                this.gameState.score += enemy.reward * 2;
                                const index = this.enemies.indexOf(enemy);
                                if (index !== -1) {
                                    this.enemies.splice(index, 1);
                                    this.updateUI();
                                }
                                continue;
                            }
                        }
                    }
                }
            }
            
            // Move enemy along dynamic path (enemies attack while moving)
            enemy.pathIndex = Math.min(Math.max(enemy.pathIndex, 0), this.path.length - 2);
            const target = this.path[enemy.pathIndex + 1];
            const dx = target.x - enemy.x;
            const dy = target.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Apply gameSpeed to movement and checkpoint detection
            const moveSpeed = enemy.speed * this.gameSpeed;
            if (distance < moveSpeed) {
                enemy.pathIndex++;
                if (enemy.pathIndex >= this.path.length - 1) {
                    // Enemy reached the castle - damage castle
                    const damage = 10;
                    this.gameState.health -= damage;
                    const enemyNames = { basic: 'Zombie', fast: 'Qartal', tank: 'Dino', boss: 'Boss X' };
                    this.debugLog(`💀 ${enemyNames[enemy.type]} düşmən qalaya çatdı! Can azaldı: ${this.gameState.health + damage} -> ${this.gameState.health}`);
                    this.enemies.splice(i, 1);
                    continue;
                }
            } else {
                // Simple movement without animations - gameSpeed already applied to moveSpeed
                enemy.x += (dx / distance) * moveSpeed;
                enemy.y += (dy / distance) * moveSpeed;
                
                // Store direction for drawing
                enemy.directionX = dx; // Store dx for horizontal flipping
            }
        }
    }
    
    updateEnemyBullets() {
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            // TTL safeguard
            if (Date.now() - bullet.bornAt > bullet.ttlMs) {
                this.enemyBullets.splice(i, 1);
                continue;
            }
            // Move toward target tower position
            const dx = bullet.targetX - bullet.x;
            const dy = bullet.targetY - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const moveSpeed = bullet.speed * this.gameSpeed;
            if (distance <= moveSpeed) {
                // Bullet reached target (damage already applied, just remove visual)
                this.enemyBullets.splice(i, 1);
            } else if (distance > 0) {
                bullet.x += (dx / distance) * moveSpeed;
                bullet.y += (dy / distance) * moveSpeed;
            }
        }
    }
    
    updateTowers() {
        for (const tower of this.towers) {
            // Find target
            tower.target = this.findTarget(tower);
            
            // Shoot at target
            const effectiveFireRate = tower.fireRate / Math.max(0.001, this.gameSpeed);
            if (tower.target && Date.now() - tower.lastShot > effectiveFireRate) {
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
            towerType: tower.type, // Store tower type for special effects
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
            const moveSpeed = bullet.speed * this.gameSpeed;
            if (distance <= moveSpeed) {
                this.hitEnemy(bullet.target, bullet.damage, bullet.towerType);
                this.bullets.splice(i, 1);
            } else if (distance > 0) {
                bullet.x += (dx / distance) * moveSpeed;
                bullet.y += (dy / distance) * moveSpeed;
            }
        }
    }
    
    hitEnemy(enemy, damage, towerType = null) {
        const oldHealth = enemy.health;
        enemy.health -= damage;
        
        // Apply special effects based on tower type
        if (towerType === 'ice') {
            // Freeze enemy: slow down by 50% for 3 seconds
            // If already frozen, reset timer to 3 seconds again
            if (enemy.frozen) {
                // Reset freeze timer - extends duration
                enemy.frozenUntil = Date.now() + 3000;
                this.debugLog(`❄️ ${enemy.type} düşmən donma müddəti yeniləndi!`);
            } else {
                // New freeze
                enemy.frozen = true;
                enemy.frozenUntil = Date.now() + 3000;
                enemy.speed = enemy.baseSpeed * 0.5; // Reduce speed by 50%
                this.debugLog(`❄️ ${enemy.type} düşmən donduruldu!`);
            }
            
            // Create ice explosion effect (no big ring, only shards + small flash)
            this.explosions.push({
                x: enemy.x,
                y: enemy.y,
                type: 'ice',
                startTime: Date.now(),
                duration: 250 // shorter, quick one-time animation
            });
        } else if (towerType === 'flame') {
            // Burn enemy: take damage over time for 5 seconds
            // If already burning, reset timer to 5 seconds again
            if (enemy.burning) {
                // Reset burn timer - extends duration
                enemy.burnUntil = Date.now() + 5000;
                enemy.lastBurnTick = Date.now(); // Reset burn tick timer
                this.debugLog(`🔥 ${enemy.type} düşmən yanma müddəti yeniləndi!`);
            } else {
                // New burn
                enemy.burning = true;
                enemy.burnDamage = damage * 0.3; // 30% of initial damage per tick
                enemy.burnUntil = Date.now() + 5000;
                enemy.lastBurnTick = Date.now();
                this.debugLog(`🔥 ${enemy.type} düşmən yandırıldı!`);
            }
            
            // Update burn damage if new damage is higher (keep strongest burn)
            const newBurnDamage = damage * 0.3;
            if (newBurnDamage > enemy.burnDamage) {
                enemy.burnDamage = newBurnDamage;
            }
            
            // Create fire explosion effect
            this.explosions.push({
                x: enemy.x,
                y: enemy.y,
                type: 'fire',
                startTime: Date.now(),
                duration: 500 // 0.5 seconds
            });
        } else {
            // Normal hit explosion
            this.explosions.push({
                x: enemy.x,
                y: enemy.y,
                type: 'normal',
                startTime: Date.now(),
                duration: 200 // 0.2 seconds
            });
        }
        
        const enemyNames = { basic: 'Zombie', fast: 'Eagle', tank: 'Dino', boss: 'Boss X' };
        this.debugLog(`💥 ${enemyNames[enemy.type]} düşmənə ${damage} zərər! ${oldHealth} -> ${enemy.health}`);
        
        if (enemy.health <= 0) {
            // Enemy destroyed
            this.gameState.money += enemy.reward;
            this.gameState.score += enemy.reward * 2;
            
            // Give star for every 10th wave boss
            if (enemy.type === 'boss' && this.gameState.wave % 10 === 0) {
                this.stars++;
                localStorage.setItem('towerDefenseStars', this.stars.toString());
                this.debugLog(`⭐ Ulduz qazandınız! Cəmi: ${this.stars}`);
                console.log(`[⭐ ULDUZ] Boss məğlub edildi! Ulduz: ${this.stars}`);
            }
            
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

        // Expansion reveal animation overlay (new cells fade-in)
        if (this.expandAnim) {
            const { cells, startedAt, duration } = this.expandAnim;
            const t = (Date.now() - startedAt) / duration;
            if (t >= 1) {
                this.expandAnim = null;
            } else {
                const revealCount = Math.ceil(cells.length * t);
                this.ctx.save();
                this.ctx.globalAlpha = 0.25 + 0.45 * (1 - t);
                this.ctx.fillStyle = '#4a90e2';
                for (let i = 0; i < revealCount; i++) {
                    const c = cells[i];
                    const x = this.gridOffsetX + c.col * this.gridSize;
                    const y = this.gridOffsetY + c.row * this.gridSize;
                    this.ctx.fillRect(x, y, this.gridSize, this.gridSize);
                }
                this.ctx.restore();
            }
        }

        // Board border
        this.ctx.strokeStyle = 'rgba(62,166,255,0.35)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(ox + 1, oy + 1, boardW - 2, boardH - 2);
    }
    
    drawPath() {
        if (this.path.length === 0) return;
        // Ensure no neon/glow carries over to the path drawing
        this.ctx.save();
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
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
        this.ctx.restore();
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
        
        // Health text (round to integer to avoid floating point errors)
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const currentHealth2 = Math.max(0, Math.floor(enemy.health));
        const maxHealth2 = Math.floor(enemy.maxHealth);
        this.ctx.fillText(`${currentHealth2}/${maxHealth2}`, enemy.x, y - 6);
        
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
            // Ring as health bar: part of ring disappears as health decreases
            const hpRatio = Math.max(0, Math.min(1, (tower.health ?? tower.maxHealth) / (tower.maxHealth || 1)));
            let neonStroke;
            if (tower.awakened) {
                // Awakened towers: base color
                neonStroke = tower.shielded ? '#66ccff' : '#ff66ff';
            } else {
                // Normal towers: color based on type
                const colors = {
                    basic: 'hsl(120, 90%, 60%)',   // Green
                    rapid: 'hsl(200, 90%, 60%)',   // Blue
                    heavy: 'hsl(0, 90%, 60%)',     // Red
                    ice: '#00CED1',                 // Cyan
                    flame: '#FF4500',               // Orange red
                    laser: '#FF1493',               // Deep pink
                    plasma: '#9370DB'               // Medium purple
                };
                const baseColor = colors[tower.type] || 'hsl(120, 90%, 60%)';
                
                // Apply health-based darkening (only for basic/rapid/heavy)
                if (tower.type === 'basic' || tower.type === 'rapid' || tower.type === 'heavy') {
                    const hue = Math.floor(120 * hpRatio); // 120=green to 0=red
                    neonStroke = `hsl(${hue}, 90%, 60%)`;
                } else {
                    // For star towers, just use base color (no health-based color change)
                    neonStroke = baseColor;
                }
            }
            
            // Draw ring as health bar - partial arc based on health
            this.ctx.save(); // Save context state
            const lineWidth = Math.max(2, Math.round(this.gridSize * 0.12));
            const startAngle = -Math.PI / 2; // Start from top (12 o'clock)
            const endAngle = startAngle + (Math.PI * 2 * hpRatio); // Draw arc based on health percentage
            
            // Draw the visible (healthy) part of the ring
            if (hpRatio > 0) {
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, baseR, startAngle, endAngle);
                this.ctx.shadowColor = neonStroke;
                this.ctx.shadowBlur = Math.max(10, Math.round(this.gridSize * 0.35));
                this.ctx.lineWidth = lineWidth;
                this.ctx.strokeStyle = neonStroke;
                this.ctx.stroke();
            }
            
            // Draw the missing (damaged) part of the ring in dark color
            if (hpRatio < 1) {
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, baseR, endAngle, startAngle + Math.PI * 2);
                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                this.ctx.shadowBlur = 0;
                this.ctx.lineWidth = lineWidth;
                this.ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)'; // Dark gray for missing part
                this.ctx.stroke();
            }
            
            this.ctx.restore(); // Restore context (clears shadowBlur)

            // Barrel
            let angle = 0; if (tower.target) angle = Math.atan2(tower.target.y - tower.y, tower.target.x - tower.x);
            const barrelLengths = {
                heavy: 0.6,
                rapid: 0.45,
                ice: 0.5,
                flame: 0.55,
                laser: 0.55,
                plasma: 0.65
            };
            const barrelLen = Math.max(8, Math.round(this.gridSize * (barrelLengths[tower.type] || 0.5)));
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
            
            // Plasma barrier effect removed - only shows animation when firing/hitting
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
            
            // Only keep burning tint; remove frozen tint so no persistent halo remains
            if (enemy.burning) {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'multiply';
                this.ctx.fillStyle = 'rgba(255, 69, 0, 0.4)';
                this.ctx.fillRect(enemy.x - radius, enemy.y - radius, radius * 2, radius * 2);
                this.ctx.restore();
            }
            
            // Draw enemy level inside icon
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = `${Math.max(8, Math.round(this.gridSize * 0.28))}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`L${enemy.level || this.currentLevel}`, enemy.x, enemy.y);
            
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
            
            // Health text (round to integer to avoid floating point errors)
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const currentHealth = Math.max(0, Math.floor(enemy.health));
            const maxHealth = Math.floor(enemy.maxHealth);
            this.ctx.fillText(`${currentHealth}/${maxHealth}`, enemy.x, enemy.y - (radius + 15));
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
        } else if (enemy.type === 'boss') {
            // Static neon X boss enemy (no color animation)
            const s = radius * 1.2; // smaller size
            this.ctx.shadowColor = '#ff00ff';
            this.ctx.shadowBlur = Math.max(8, Math.round(this.gridSize * 0.25));
            this.ctx.lineWidth = Math.max(3, Math.round(this.gridSize * 0.12));
            this.ctx.strokeStyle = '#ff00ff';
            
            // Draw only the X
            this.ctx.beginPath();
            this.ctx.moveTo(-s/2, -s/2);
            this.ctx.lineTo(s/2, s/2);
            this.ctx.moveTo(s/2, -s/2);
            this.ctx.lineTo(-s/2, s/2);
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
        const baseR = Math.max(2, Math.round(this.gridSize * 0.1));
        for (const bullet of this.bullets) {
            const towerType = bullet.towerType || 'basic';
            
            if (towerType === 'ice') {
                // Real ice bullet effect - icy particles and blue glow
                this.ctx.save();
                
                // Outer blue glow
                const glowPhase = (Date.now() % 800) / 800;
                const glowSize = baseR * 2 + Math.sin(glowPhase * Math.PI * 2) * baseR * 0.3;
                const gradient = this.ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, glowSize);
                gradient.addColorStop(0, 'rgba(135, 206, 250, 0.8)');
                gradient.addColorStop(0.5, 'rgba(0, 206, 209, 0.4)');
                gradient.addColorStop(1, 'rgba(0, 191, 255, 0)');
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, glowSize, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Ice crystal particles (sparkles)
                const time = Date.now();
                for (let i = 0; i < 6; i++) {
                    const angle = (time * 0.002 + i * Math.PI / 3) % (Math.PI * 2);
                    const dist = baseR * 0.8;
                    const sparkX = bullet.x + Math.cos(angle) * dist;
                    const sparkY = bullet.y + Math.sin(angle) * dist;
                    const sparkSize = baseR * 0.3 + Math.sin(time * 0.01 + i) * baseR * 0.1;
                    
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    this.ctx.beginPath();
                    this.ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                
                // Central ice core
                const coreGradient = this.ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, baseR);
                coreGradient.addColorStop(0, '#00FFFF');
                coreGradient.addColorStop(0.7, '#00CED1');
                coreGradient.addColorStop(1, '#87CEEB');
                this.ctx.fillStyle = coreGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, baseR * 1.2, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Ice shard effect
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    const shardAngle = (time * 0.003 + i * Math.PI / 2) % (Math.PI * 2);
                    const shardLen = baseR * 1.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(bullet.x, bullet.y);
                    this.ctx.lineTo(
                        bullet.x + Math.cos(shardAngle) * shardLen,
                        bullet.y + Math.sin(shardAngle) * shardLen
                    );
                    this.ctx.stroke();
                }
                
                this.ctx.restore();
            } else if (towerType === 'flame') {
                // Real fire bullet effect - flames and orange/red glow
                this.ctx.save();
                
                // Fire glow - pulsing orange/red
                const firePhase = (Date.now() % 500) / 500;
                const fireSize = baseR * 2.5 + Math.sin(firePhase * Math.PI * 2) * baseR * 0.5;
                const fireGradient = this.ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, fireSize);
                fireGradient.addColorStop(0, 'rgba(255, 100, 0, 1)');
                fireGradient.addColorStop(0.3, 'rgba(255, 69, 0, 0.8)');
                fireGradient.addColorStop(0.6, 'rgba(255, 140, 0, 0.4)');
                fireGradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
                this.ctx.fillStyle = fireGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, fireSize, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Fire particles - animated flames
                const time = Date.now();
                for (let i = 0; i < 8; i++) {
                    const angle = (time * 0.005 + i * Math.PI / 4) % (Math.PI * 2);
                    const dist = baseR * 0.6 + Math.sin(time * 0.01 + i) * baseR * 0.4;
                    const flameX = bullet.x + Math.cos(angle) * dist;
                    const flameY = bullet.y + Math.sin(angle) * dist;
                    const flameSize = baseR * 0.4 + Math.sin(time * 0.015 + i) * baseR * 0.2;
                    
                    // Flame gradient
                    const flameGrad = this.ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, flameSize);
                    flameGrad.addColorStop(0, `rgba(255, ${200 + Math.sin(time * 0.02 + i) * 55}, 0, 1)`);
                    flameGrad.addColorStop(0.5, `rgba(255, 69, 0, 0.8)`);
                    flameGrad.addColorStop(1, 'rgba(255, 140, 0, 0)');
                    this.ctx.fillStyle = flameGrad;
                    this.ctx.beginPath();
                    this.ctx.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                
                // Central fire core - bright yellow/orange
                const coreFireGradient = this.ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, baseR * 1.3);
                coreFireGradient.addColorStop(0, '#FFFF00');
                coreFireGradient.addColorStop(0.4, '#FF8C00');
                coreFireGradient.addColorStop(0.8, '#FF4500');
                coreFireGradient.addColorStop(1, '#FF6347');
                this.ctx.fillStyle = coreFireGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, baseR * 1.3, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Fire trail effect
                const trailLen = baseR * 2;
                const trailAngle = Math.atan2(
                    (bullet.target?.y || bullet.y) - bullet.y,
                    (bullet.target?.x || bullet.x) - bullet.x
                ) + Math.PI;
                const trailGradient = this.ctx.createLinearGradient(
                    bullet.x, bullet.y,
                    bullet.x + Math.cos(trailAngle) * trailLen,
                    bullet.y + Math.sin(trailAngle) * trailLen
                );
                trailGradient.addColorStop(0, 'rgba(255, 69, 0, 0)');
                trailGradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.3)');
                trailGradient.addColorStop(1, 'rgba(255, 100, 0, 0.6)');
                this.ctx.fillStyle = trailGradient;
                this.ctx.beginPath();
                this.ctx.moveTo(bullet.x, bullet.y);
                this.ctx.lineTo(
                    bullet.x + Math.cos(trailAngle) * trailLen,
                    bullet.y + Math.sin(trailAngle) * trailLen
                );
                this.ctx.lineWidth = baseR * 2;
                this.ctx.strokeStyle = trailGradient;
                this.ctx.stroke();
                
                this.ctx.restore();
            } else {
                // Normal bullet (yellow) for other towers
                this.ctx.fillStyle = '#ffff00';
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, baseR, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, baseR + 2, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    }
    
    drawEnemyBullets() {
        const r = Math.max(3, Math.round(this.gridSize * 0.12));
        for (const bullet of this.enemyBullets) {
            // Different colors based on enemy type
            const colors = {
                fast: '#ff4444',      // Red for fast
                basic: '#ff8800',     // Orange for basic
                tank: '#880000',      // Dark red for tank
                boss: '#ff00ff'       // Magenta for boss
            };
            const color = colors[bullet.enemyType] || '#ff4444';
            
            // Draw bullet without glow effect (to prevent canvas color spread)
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw inner highlight
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(bullet.x - r * 0.3, bullet.y - r * 0.3, r * 0.4, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    updateExplosions() {
        const now = Date.now();
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            if (now - exp.startTime >= exp.duration) {
                this.explosions.splice(i, 1);
            }
        }
    }
    
    drawExplosions() {
        const baseSize = Math.max(10, Math.round(this.gridSize * 0.4));
        for (const exp of this.explosions) {
            const elapsed = Date.now() - exp.startTime;
            const progress = Math.min(1, elapsed / exp.duration);
            const invProgress = 1 - progress;
            
            this.ctx.save();
            
            if (exp.type === 'ice') {
                // Real ice explosion - ice shards and blue particles
                const size = baseSize * (0.5 + progress * 1.5);
                const alpha = invProgress;
                
                // Outer ice burst
                const iceGradient = this.ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, size);
                iceGradient.addColorStop(0, `rgba(135, 206, 250, ${alpha * 0.9})`);
                iceGradient.addColorStop(0.5, `rgba(0, 206, 209, ${alpha * 0.6})`);
                iceGradient.addColorStop(1, `rgba(0, 191, 255, 0)`);
                this.ctx.fillStyle = iceGradient;
                this.ctx.beginPath();
                this.ctx.arc(exp.x, exp.y, size, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Ice shards flying out
                for (let i = 0; i < 12; i++) {
                    const angle = (i * Math.PI / 6) + (progress * Math.PI * 2);
                    const dist = size * (0.3 + progress * 0.7);
                    const shardX = exp.x + Math.cos(angle) * dist;
                    const shardY = exp.y + Math.sin(angle) * dist;
                    const shardSize = baseSize * 0.15 * invProgress;
                    
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                    this.ctx.beginPath();
                    this.ctx.arc(shardX, shardY, shardSize, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Ice crystal shape
                    this.ctx.strokeStyle = `rgba(0, 206, 209, ${alpha})`;
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(shardX, shardY);
                    for (let j = 0; j < 6; j++) {
                        const pointAngle = angle + (j * Math.PI / 3);
                        const pointDist = shardSize * 1.5;
                        this.ctx.lineTo(
                            shardX + Math.cos(pointAngle) * pointDist,
                            shardY + Math.sin(pointAngle) * pointDist
                        );
                    }
                    this.ctx.closePath();
                    this.ctx.stroke();
                }
                
                // Central ice flash
                const flashSize = baseSize * (0.5 + progress * 0.5) * invProgress;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
                this.ctx.beginPath();
                this.ctx.arc(exp.x, exp.y, flashSize, 0, Math.PI * 2);
                this.ctx.fill();
                
            } else if (exp.type === 'fire') {
                // Real fire explosion - flames and orange/red burst
                const size = baseSize * (0.5 + progress * 2);
                const alpha = invProgress;
                
                // Outer fire burst
                const fireGradient = this.ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, size);
                fireGradient.addColorStop(0, `rgba(255, 100, 0, ${alpha})`);
                fireGradient.addColorStop(0.3, `rgba(255, 69, 0, ${alpha * 0.8})`);
                fireGradient.addColorStop(0.6, `rgba(255, 140, 0, ${alpha * 0.5})`);
                fireGradient.addColorStop(1, `rgba(255, 69, 0, 0)`);
                this.ctx.fillStyle = fireGradient;
                this.ctx.beginPath();
                this.ctx.arc(exp.x, exp.y, size, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Fire particles/flames
                for (let i = 0; i < 16; i++) {
                    const angle = (i * Math.PI / 8) + (progress * Math.PI * 1.5);
                    const dist = size * (0.2 + progress * 0.8);
                    const flameX = exp.x + Math.cos(angle) * dist;
                    const flameY = exp.y + Math.sin(angle) * dist;
                    const flameSize = baseSize * (0.1 + Math.sin(i) * 0.1) * invProgress;
                    
                    // Flame gradient
                    const flameGrad = this.ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, flameSize);
                    const time = Date.now() * 0.01;
                    flameGrad.addColorStop(0, `rgba(255, ${200 + Math.sin(time + i) * 55}, 0, ${alpha})`);
                    flameGrad.addColorStop(0.5, `rgba(255, 69, 0, ${alpha * 0.8})`);
                    flameGrad.addColorStop(1, `rgba(255, 140, 0, 0)`);
                    this.ctx.fillStyle = flameGrad;
                    this.ctx.beginPath();
                    this.ctx.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                
                // Central fire flash
                const flashSize = baseSize * (0.6 + progress * 0.4) * invProgress;
                const flashGradient = this.ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, flashSize);
                flashGradient.addColorStop(0, `rgba(255, 255, 0, ${alpha})`);
                flashGradient.addColorStop(0.5, `rgba(255, 140, 0, ${alpha * 0.6})`);
                flashGradient.addColorStop(1, `rgba(255, 69, 0, 0)`);
                this.ctx.fillStyle = flashGradient;
                this.ctx.beginPath();
                this.ctx.arc(exp.x, exp.y, flashSize, 0, Math.PI * 2);
                this.ctx.fill();
                
            } else {
                // Normal explosion (yellow flash)
                const size = baseSize * (0.3 + progress * 1.2);
                const alpha = invProgress;
                
                const normalGradient = this.ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, size);
                normalGradient.addColorStop(0, `rgba(255, 255, 0, ${alpha})`);
                normalGradient.addColorStop(0.5, `rgba(255, 200, 0, ${alpha * 0.5})`);
                normalGradient.addColorStop(1, `rgba(255, 150, 0, 0)`);
                this.ctx.fillStyle = normalGradient;
                this.ctx.beginPath();
                this.ctx.arc(exp.x, exp.y, size, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        }
    }

    // drawSelectedTowerRangeUI removed per request
    
    updateUI() {
        document.getElementById('health').textContent = this.gameState.health;
        document.getElementById('money').textContent = this.gameState.money;
        document.getElementById('wave').textContent = this.gameState.wave;
        document.getElementById('score').textContent = this.gameState.score;
        document.getElementById('level').textContent = this.currentLevel;
        document.getElementById('diamonds').textContent = this.diamonds;
        document.getElementById('stars').textContent = this.stars;
        
        // Update enemy count (alive enemies)
        const enemyCount = this.enemies.length;
        document.getElementById('enemyCount').textContent = enemyCount;
        
        // Update tower availability (only icons visible, no info text)
        document.querySelectorAll('.tower-option').forEach(option => {
            const type = option.dataset.tower;
            const cost = this.towerCosts[type] || 0;
            const starCost = this.towerStarCosts[type] || 0;
            
            // Check if can afford
            if (starCost > 0) {
                option.style.opacity = this.stars >= starCost ? '1' : '0.5';
            } else {
                option.style.opacity = this.gameState.money >= cost ? '1' : '0.5';
            }
        });
        
        // Update Special tab board info and buttons
        const dims = document.getElementById('boardDims');
        if (dims) dims.textContent = `${this.rows}×${this.cols}`;
        const dia = document.getElementById('shopDiamonds');
        if (dia) dia.textContent = String(this.diamonds);
        const buyRowsBtn = document.getElementById('buyRows');
        const buyColBtn = document.getElementById('buyCol');
        const rowsCost = 5, colCost = 3;
        // Update cost displays
        const costRowsEl = document.getElementById('costRows');
        const costColEl = document.getElementById('costCol');
        if (costRowsEl) costRowsEl.textContent = String(rowsCost);
        if (costColEl) costColEl.textContent = String(colCost);
        // Allow editing during pause, or before first wave starts
        const canEdit = this.gameState.isPaused || (!this.waveInProgress && this.enemies.length === 0 && this.gameState.wave <= 1);
        if (buyRowsBtn) buyRowsBtn.disabled = !(canEdit && this.diamonds >= rowsCost && this.rows + 2 <= this.maxRows);
        if (buyColBtn) buyColBtn.disabled = !(canEdit && this.diamonds >= colCost && this.cols + 1 <= this.maxCols);
        // Update info message
        const infoMsg = document.querySelector('#tab-special .shop-placeholder:last-child');
        if (infoMsg) {
            infoMsg.textContent = this.gameState.isPaused 
                ? 'Pause rejimində oyun taxtasını genişləndirə bilərsiniz.' 
                : 'Dalğa başlamadan əvvəl istifadə edin.';
        }
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
        
        // Reset grid to initial size according to current orientation
        this.setGridForOrientation();
        this.expansionCost = 100;
        this.expansionDiamonds = 5;
        // Keep diamonds persistent - don't reset
        
        // Clear explosions
        this.explosions = [];
        
        // Clear all game objects
        this.towers = [];
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
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
        this.nextCellId = 1;
        this.initCellIds(); // Re-initialize cell IDs for new grid
        this.updateGridDimensions();
        this.recomputePath();
        
        // Reset UI
        this.updateUI();
        this.hideTowerContext();
        
        // Enable Start Wave button after restart
        const startWaveBtn = document.getElementById('startWave');
        if (startWaveBtn) {
            startWaveBtn.disabled = false;
        }
        
        // Reset speed to 1x
        this.setGameSpeed(1);
        
        this.debugLog(`✅ Oyun yenidən başladıldı!`);
    }
    
    checkWaveComplete() {
        if (this.waveInProgress && this.enemies.length === 0 && this.currentWaveEnemies >= this.waveConfig.enemiesPerWave) {
            this.waveInProgress = false;
            this.gameState.wave++;
            this.gameState.money += 50; // Wave completion bonus
            // Increase enemy count every 5 waves (additive)
            if (this.gameState.wave % 5 === 0) {
                this.waveConfig.enemiesPerWave += 2;
                this.debugLog(`👾 Düşmən sayı artdı! Yeni say: ${this.waveConfig.enemiesPerWave}`);
            }
            
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
            this.updateEnemyBullets();
            this.updateTowers();
            this.updateBullets();
            this.updateExplosions();
            
            // Update UI to show current enemy count
            this.updateUI();
            
            // Check game conditions
            this.checkGameOver();
            this.checkWaveComplete();
        }
        
        this.lastUpdateTime = currentTime;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw game elements - Kulelər yolun üstündə görünsün
        this.drawGrid();
        this.drawPath();    // Əvvəl yolu çək
        this.drawTowers();  // Qüllələr yolun üstündə görünsün
        this.drawCastle();  // Qala çizilsin
        this.drawCastleHealthBar();  // Qala can barı çizilsin
        this.drawEnemies();
        this.drawBullets();
        this.drawEnemyBullets();
        this.drawExplosions();
        
        // Reset shadowBlur to prevent canvas color spread
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
        
        // Draw wave message
        if (this.waveMessage && Date.now() < this.waveMessage.until) {
            const alpha = Math.min(1.0, (this.waveMessage.until - Date.now()) / 500); // Fade out in last 500ms
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 4;
            this.ctx.font = 'bold 32px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const text = this.waveMessage.text;
            const x = this.canvas.width / 2;
            const y = 80;
            // Draw text with outline
            this.ctx.strokeText(text, x, y);
            this.ctx.fillText(text, x, y);
            this.ctx.restore();
        } else if (this.waveMessage && Date.now() >= this.waveMessage.until) {
            this.waveMessage = null; // Clear expired message
        }
        
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
