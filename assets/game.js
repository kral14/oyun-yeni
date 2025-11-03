class TowerDefenseGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Ultra yüksək keyfiyyətli renderləmə
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Əlavə keyfiyyət parametrləri
        this.ctx.textRenderingOptimization = 'optimizeLegibility';
        
        // Yüksək DPI renderləməni quraşdır
        this.setupHighDPIRendering();
        this.gameState = {
            health: 100,
            money: 500,
            wave: 1,
            score: 0,
            gameOver: false
        };
        
        // Oyun obyektləri
        this.towers = [];
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.explosions = []; // Partlayış effektləri (buz, alov və s.)
        this.selectedTower = null;
        this.selectedTowerType = 'basic';
        this.plasmaPairingMode = false; // İkinci qülləni birləşdirmək üçün gözləyən zaman true
        this.plasmaPairingTower = null; // Cütləşdirmək üçün seçilmiş ilk qüllə
        this.hoveredEnemy = null; // Mouse hover edilmiş düşman
        this.mouseX = 0; // Mouse X pozisiyası
        this.mouseY = 0; // Mouse Y pozisiyası
        
        // API inteqrasiyası - Render-də backend var, GitHub Pages-də yoxdur
        const isGitHubPages = window.location.hostname.includes('github.io');
        const isRender = window.location.hostname.includes('onrender.com');
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        
        // Render-də backend var, ona görə də backend API istifadə edək (çox cihaz üçün)
        // GitHub Pages-də backend yoxdur, localStorage istifadə edirik (yalnız o cihazda işləyir)
        if (isRender) {
            // Render URL-dən dinamik olaraq al
            const protocol = window.location.protocol;
            const host = window.location.host;
            this.API_BASE_URL = `${protocol}//${host}/api`;
            this.useLocalStorage = false; // Render-də backend istifadə et
        } else if (isGitHubPages) {
            this.API_BASE_URL = null; // GitHub Pages-də backend yoxdur
            this.useLocalStorage = true; // GitHub Pages-də localStorage istifadə et
        } else {
            // Local static server (e.g., VSCode Live Server) or iframe test harness: use localStorage only
            const host = window.location.hostname || '';
            const inIframe = (function(){ try { return window.self !== window.top; } catch(e){ return true; } })();
            const isLocalStatic = host === 'localhost' || host === '127.0.0.1';
            if (isLocalStatic || inIframe) {
                this.API_BASE_URL = null;
                this.useLocalStorage = true;
            } else {
                this.API_BASE_URL = '/api'; // Fallback local backend
                this.useLocalStorage = false;
            }
        }
        
        // Online/Offline detection - bağlantı statusunu yoxla
        this.isOnline = navigator.onLine;
        this.hasOfflineData = false; // localStorage'da offline veri var mı?
        
        // Online/offline event listener-ləri əlavə et
        window.addEventListener('online', () => {
            this.debugLog('🌐 Bağlantı bərpa olundu (online)');
            this.isOnline = true;
            this.syncOfflineDataToAPI(); // Offline veriləri API-yə göndər
        });
        
        window.addEventListener('offline', () => {
            this.debugLog('⚠️ Bağlantı kəsildi (offline)');
            this.isOnline = false;
            this.showTooltip('⚠️ Bağlantı hatası: Oyun durumu locale yazılıyor', 'warning');
        });
        
        this.userId = null;
        this.gameStartTime = null;
        this.enemiesKilledThisGame = 0;
        
        // Pause sistemi
        this.isPaused = false;
        this.pauseStartTime = null;
        this.totalPausedTime = 0; // Toplam pause müddəti (ms)
        
        // Confirm mesajının iki dəfə göstərilməsinin qarşısını almaq
        this.confirmShown = false;
        this.initInProgress = false; // init() funksiyasının iki dəfə çağırılmasının qarşısını almaq
        
        // Global auto-heal settings - hansi qüllə tipləri üçün aktivdir və threshold
        // Format: { towerType: { enabled: true, threshold: 10 }, ... }
        this.globalAutoHealSettings = {};
        this.towerCosts = {
            basic: 50,
            rapid: 100,
            heavy: 200,
            ice: 0,      // Yalnız ulduz
            flame: 0,    // Yalnız ulduz
            laser: 0,    // Yalnız ulduz
            plasma: 0    // Yalnız ulduz
        };
        
        this.towerStarCosts = {
            ice: 1,
            flame: 2,
            laser: 3,
            plasma: 4
        };
        
        // Düşmənlər üçün yol (dinamik olaraq A* alqoritmi ilə hesablanır)
        this.path = [];
        
        // Dalğa konfiqurasiyası
        this.waveConfig = {
            enemiesPerWave: 5,
            enemySpawnDelay: 250, // Düşmənlər dalbadal çıxsın (250ms)
            waveDelay: 3000
        };
        
        // Level sistemi - hər level düşmənlər güclənir
        this.currentLevel = 1;
        this.levelMultiplier = 1.0;
        
        this.currentWaveEnemies = 0;
        this.waveInProgress = false;
        this.lastEnemySpawn = 0;
        this.autoStart = false;
        
        // Arxa planda oyun loop üçün interval (tab görünməz olanda)
        this.gameLoopInterval = null;
        
        // FİKSED hücrə sayı ilə grid konfiqurasiyası (responsiv piksel ölçüsü)
        // Orijentasiyaya görə default: landscape 9x20, portrait 11x10
        this.rows = 9; // placeholder, setGridForOrientation() tərəfindən təyin ediləcək
        this.cols = 20;
        this.lastOrientationPortrait = null;
        this.setGridForOrientation();
        // Əgər istifadəçi tərəfindən təyin edilmiş taxta ölçüsü varsa, onu üstün tut və oriyentasiya avtomatik ölçüləməsini dondur
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
        // Genişləndirmələr zamanı qüllələri hücrələrə kilidləmək üçün sabit cell id grid
        this.cellIdGrid = [];
        this.nextCellId = 1;
        this.initCellIds();
        
        // Grid genişləndirmə sistemi
        this.maxCols = 48; // maksimum grid ölçüsü
        this.maxRows = 27; // maksimum grid ölçüsü
        this.expansionCost = 100; // grid genişləndirmə qiyməti
        this.expansionDiamonds = 5; // grid genişləndirmək üçün lazım olan almazlar
        // Default almazlar: ən azı 500 (API-dən yüklənəcək, əgər API yoxdursa localStorage istifadə ediləcək)
        this.diamonds = 500;
        this.stars = 100;
        
        // Mağaza qüllələrinin yüksəltmələri (yalnız pul ilə alınan qüllələr üçün)
        const savedUpgrades = localStorage.getItem('towerDefenseShopUpgrades');
        if (savedUpgrades) {
            try {
                this.towerShopUpgrades = JSON.parse(savedUpgrades);
            } catch (e) {
                this.towerShopUpgrades = { basic: { damage: 0, fireRate: 0 }, rapid: { damage: 0, fireRate: 0 }, heavy: { damage: 0, fireRate: 0 } };
            }
        } else {
            this.towerShopUpgrades = { basic: { damage: 0, fireRate: 0 }, rapid: { damage: 0, fireRate: 0 }, heavy: { damage: 0, fireRate: 0 } };
        }
        
        // Elmas və yıldızları yüklə (API-dən və ya localStorage-dan)
        this.loadCurrency();
        
        // Aktiv edilmiş hədiyyə kodları (yenidən istifadəni qadağan et)
        this.redeemedCodes = JSON.parse(localStorage.getItem('towerDefenseRedeemedCodes') || '[]');
        
        // Oyun sürəti sistemi
        this.gameSpeed = 1; // 1x, 2x, 3x sürət
        this.lastUpdateTime = 0;
        
        // Dalğa mesajı göstərmə
        this.waveMessage = null; // {text, until}
        
        // Debug sistemi
        this.debugMode = false; // Debug mode default olaraq söndürülüb (yalnız vacib xətalar göstərilir)
        this.debugMessages = [];
        
        // Sürükləmə vəziyyəti - Qüllələr köçürülməz, yalnız yeni qüllələr sürüklənir
        this.isDraggingNew = false;
        this.mouseDownInfo = null; // {x,y,time, towerAtDown}
        this.hoverPos = { x: 0, y: 0 };
        this.hoverValid = false;

        // Kontekst/hover köməkçiləri
        this.hoverTower = null;
        this.hoverTimer = null;
        this.longPressTimer = null;
        this.lastMovePos = { x: 0, y: 0 };

        // Grid genişləndirmə aşkarlama animasiyası
        this.expandAnim = null; // { cells:[{col,row}], startedAt, duration }
        // Mənzil UI sorğuya görə silindi

        // Tooltip sistemi
        this.tooltipTimeout = null;
        
        this.init();
    }
    
    // Tooltip göstərmə funksiyası (alert əvəzinə)
    showTooltip(message, type = 'error', duration = 3000) {
        // Köhnə tooltip-i sil
        const existingTooltip = document.getElementById('gameTooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // Köhnə timeout-u təmizlə
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
        }
        
        // Yeni tooltip yarat
        const tooltip = document.createElement('div');
        tooltip.id = 'gameTooltip';
        tooltip.textContent = message;
        
        // Stil təyin et
        const bgColor = type === 'error' ? 'rgba(220, 53, 69, 0.95)' : 
                       type === 'success' ? 'rgba(40, 167, 69, 0.95)' : 
                       'rgba(23, 162, 184, 0.95)';
        tooltip.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            background: ${bgColor};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 100003;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            opacity: 0;
            pointer-events: auto;
            max-width: 90vw;
            text-align: center;
            transition: opacity 0.3s ease, transform 0.3s ease;
            cursor: pointer;
        `;
        
        document.body.appendChild(tooltip);
        
        // Animasiya ilə göstər
        setTimeout(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateX(-50%) translateY(0)';
        }, 10);
        
        // Klik edildikdə və ya müəyyən müddətdən sonra yox ol
        const hideTooltip = () => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.remove();
                }
            }, 300);
        };
        
        tooltip.addEventListener('click', hideTooltip);
        
        // Kənara klik edildikdə yox ol
        const clickOutsideHandler = (e) => {
            if (!tooltip.contains(e.target)) {
                hideTooltip();
                document.removeEventListener('click', clickOutsideHandler);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', clickOutsideHandler);
        }, 100);
        
        // Avtomatik yox olma
        this.tooltipTimeout = setTimeout(() => {
            hideTooltip();
            document.removeEventListener('click', clickOutsideHandler);
        }, duration);
    }
    
    updateGridDimensions() {
        // Responsive: faktiki canvas ölçüsündən hesabla
        const cw = this.canvas.width;   // device piksel
        const ch = this.canvas.height;  // device piksel

        // Canvas boyutlarının 0 olmadığından emin ol
        if (!cw || !ch) {
            this.debugWarning('Canvas boyutları hələ hazır deyil, grid hesablaması təxirə salınır');
            return;
        }

        // Taxta ətrafında padding burax; portrait rejimində daha kiçik pad istifadə et (maksimum uyğunluq üçün)
        // orientationOverride olsa belə, grid boyutları yenilənməlidir (yalnız rows/cols deyil, gridSize və offset-lər də)
        // if (this.orientationOverride) return; // istifadəçi tərəfindən təyin edilmiş ölçü qalır - YALNIZ rows/cols üçün
        const portrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
        const padRatio = portrait ? 0.02 : 0.04;
        const pad = Math.max(6, Math.round(Math.min(cw, ch) * padRatio));
        const cellW = Math.floor((cw - pad * 2) / this.cols);
        const cellH = Math.floor((ch - pad * 2) / this.rows);
        this.gridSize = Math.max(10, Math.min(cellW, cellH));

        // Grid offsetlərini padding ilə mərkəzləşdirmək üçün hesabla - grid həmişə mərkəzdədir
        const boardW = this.gridSize * this.cols;
        const boardH = this.gridSize * this.rows;
        this.gridOffsetX = Math.round((cw - boardW) / 2);
        this.gridOffsetY = Math.round((ch - boardH) / 2);

        // Məntiqi grid layout sabit qalır
        this.gridCols = this.cols;
        this.gridRows = this.rows;
        
        // Başlanğıc/məqsəd hücrələrinin mövcud olduğunu və cari hədlər daxilində olduğunu təmin et
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
                this.changeCurrency(-this.expansionDiamonds, 0);
                
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
                if (pos) { 
                    tower.col = pos.col; 
                    tower.row = pos.row; 
                }
            } else {
                // Backfill logical grid position if missing (legacy towers)
                if (typeof tower.col !== 'number' || typeof tower.row !== 'number') {
                    const c = Math.max(0, Math.min(this.gridCols - 1, Math.floor((tower.x - this.gridOffsetX) / this.gridSize)));
                    const r = Math.max(0, Math.min(this.gridRows - 1, Math.floor((tower.y - this.gridOffsetY) / this.gridSize)));
                    tower.col = c; tower.row = r;
                }
            }
            // CRITICAL: Clamp col/row to valid grid bounds (fixes out-of-bounds warnings after auto-resize)
            tower.col = Math.max(0, Math.min(this.gridCols - 1, tower.col || 0));
            tower.row = Math.max(0, Math.min(this.gridRows - 1, tower.row || 0));
            // Calculate new pixel position based on grid cell
            const newX = this.gridOffsetX + tower.col * this.gridSize + this.gridSize / 2;
            const newY = this.gridOffsetY + tower.row * this.gridSize + this.gridSize / 2;
            
            this.debugLog(`🏗️ Qüllə (${tower.col}, ${tower.row}): (${tower.x}, ${tower.y}) -> (${newX}, ${newY})`);
            
            // Update tower position
            tower.x = newX;
            tower.y = newY;
            // Range-ini yenidən hesablama - yalnız grid ölçüsü dəyişibsə lazımdır
            // Amma rangeUp yüksəltmələrini saxlamaq lazımdır
            // Əgər rangeUp varsa, onu tətbiq et
            const baseRange = this.getTowerRange(tower.type);
            if (tower.rangeUp && tower.rangeUp > 0) {
                // rangeUp yüksəltmələrini tətbiq et (hər yüksəltmə 1.15x artırır)
                let finalRange = baseRange;
                for (let i = 0; i < tower.rangeUp; i++) {
                    finalRange = Math.floor(finalRange * 1.15);
                }
                tower.range = finalRange;
            } else {
                // rangeUp yoxdursa, base range istifadə et
                tower.range = baseRange;
            }
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
    
    // Get speed multiplier: 1x=0.5, 2x=1.5 (1x-in 3 qatı), 3x=5.0
    getSpeedMultiplier() {
        if (this.gameSpeed === 1) return 0.5; // 1x-də yarı sürət (eynı qalır)
        if (this.gameSpeed === 2) return 1.5; // 2x = 1x-in 3 qatı (0.5 * 3 = 1.5)
        if (this.gameSpeed === 3) return 5.0; // 3x = 5.0
        return this.gameSpeed; // Fallback
    }
    
    setGameSpeed(speed) {
        this.gameSpeed = speed;
        this.debugLog(`⚡ Oyun sürəti dəyişdi: ${speed}x (multiplier: ${this.getSpeedMultiplier()}x)`);
        
        // Update UI
        document.querySelectorAll('.speed-controls button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`speed${speed}`).classList.add('active');
    }

    // Special tab: +2 rows (top+bottom) purchase with diamonds
    buyRows() {
        const cost = 5;
        // Restrict during wave/enemies
        if (this.waveInProgress || this.enemies.length > 0 || this.gameState.wave > 1) {
            this.debugWarning('Sətir alma yalnız oyun başlamadan mümkündür.');
            return;
        }
        if (this.diamonds < cost) { this.debugWarning('Kifayət qədər almaz yoxdur.'); return; }
        if (this.rows + 2 > this.maxRows) { this.debugWarning('Maksimum sətir sayına çatılıb.'); return; }
        this.changeCurrency(-cost, 0);
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
        
        // Sətir əlavə edildikdə, yolun hər zaman ortada qalması üçün başlanğıc və qala mövqeyini yenidən hesabla
        // Yeni orta satır: Math.floor(this.rows / 2) (0-indexed)
        // Məsələn: 9 satır varsa, orta satır = Math.floor(9/2) = 4 (yuxarıda 4, aşağıda 4)
        // 11 satır varsa, orta satır = Math.floor(11/2) = 5 (yuxarıda 5, aşağıda 5)
        const midRow = Math.floor(this.rows / 2);
        
        // Yolu orta satıra köçür (hər zaman ortada qalmalıdır)
        if (this.goalCell) {
            this.goalCell.row = midRow;
            this.goalCell.col = Math.max(0, Math.min(this.gridCols - 1, this.goalCell.col));
        } else {
            this.goalCell = { col: this.gridCols - 1, row: midRow };
        }
        
        if (this.startCell) {
            this.startCell.row = midRow;
            this.startCell.col = Math.max(0, Math.min(this.gridCols - 1, this.startCell.col));
        } else {
            this.startCell = { col: 0, row: midRow };
        }
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
        if (this.waveInProgress || this.enemies.length > 0 || this.gameState.wave > 1) {
            this.debugWarning('Sütun alma yalnız oyun başlamadan mümkündür.');
            return;
        }
        if (this.diamonds < cost) { this.debugWarning('Kifayət qədər almaz yoxdur.'); return; }
        if (this.cols + 1 > this.maxCols) { this.debugWarning('Maksimum sütun sayına çatılıb.'); return; }
        this.changeCurrency(-cost, 0);
        // Extend ID grid: add one column on the RIGHT with new ids
        for (let r = 0; r < this.cellIdGrid.length; r++) {
            this.cellIdGrid[r].push(this.nextCellId++);
        }
        this.cols = this.cellIdGrid[0].length; // extend to the right
        this.updateGridDimensions(); // This recalculates gridSize (smaller) and re-centers grid
        // Towers' col/row stay the same - just recalculate pixel positions
        this.updateTowerPositions();
        // Sütun əlavə edildikdə, qala həmişə ən sağ sütunda olmalıdır (yeni sütun sağa əlavə edildiyi üçün)
        // Amma istifadəçi qeyd etdikdən sonra mövqeyi saxlamalıdır - qeyd funksiyası bunu edəcək
        // Burada yalnız yolun düzgün hesablanması üçün yeniləyirik
        if (!this.goalCell || this.goalCell.col < this.gridCols - 1) {
            // Qala mövcud deyilsə və ya əvvəlki sütundadırsa, yeni sağ sütuna köçür
            this.goalCell = { col: this.gridCols - 1, row: this.goalCell ? this.goalCell.row : Math.floor(this.gridRows / 2) };
        }
        if (!this.startCell) {
            const midRow = Math.floor(this.gridRows / 2);
            this.startCell = { col: 0, row: midRow };
        }
        // Grid genişləndirildikdə, qala və başlanğıc mövqeyi grid daxilində olub olmadığını yoxla
        this.goalCell.col = Math.max(0, Math.min(this.gridCols - 1, this.goalCell.col));
        this.goalCell.row = Math.max(0, Math.min(this.gridRows - 1, this.goalCell.row));
        this.startCell.col = Math.max(0, Math.min(this.gridCols - 1, this.startCell.col));
        this.startCell.row = Math.max(0, Math.min(this.gridRows - 1, this.startCell.row));
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
            if (diamondsReward > 0 || starsReward > 0) {
                this.changeCurrency(diamondsReward, starsReward);
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
        // Xətalar həmişə göstərilməlidir (debug mode-dan asılı deyil)
        console.error(`[ERROR] ${message}`);
        if (this.debugMode) {
            this.debugLog(`❌ ERROR: ${message}`, 'ERROR');
        }
    }
    
    debugWarning(message) {
        // Xəbərdarlıqlar həmişə göstərilməlidir (debug mode-dan asılı deyil)
        console.warn(`[WARNING] ${message}`);
        if (this.debugMode) {
            this.debugLog(`⚠️ WARNING: ${message}`, 'WARNING');
        }
    }
    
    debugSuccess(message) {
        // SUCCESS mesajlarını yalnız debug mode-da göstər
        if (this.debugMode) {
            this.debugLog(`✅ SUCCESS: ${message}`, 'SUCCESS');
            console.log(`[SUCCESS] ${message}`);
        }
    }
    
    debugTower(message) {
        // TOWER loglarını yalnız debug mode-da göstər
        if (this.debugMode) {
            this.debugLog(`🏗️ TOWER: ${message}`, 'TOWER');
        }
    }
    
    debugPath(message) {
        // PATH loglarını yalnız debug mode-da göstər
        if (this.debugMode) {
            this.debugLog(`🛤️ PATH: ${message}`, 'PATH');
        }
    }
    
    // Elmas və yıldızları yüklə (API-dən və ya localStorage-dan)
    async loadCurrency() {
        const loadStartTime = performance.now();
        this.debugLog('[PERF] loadCurrency() started');
        
        // ONLINE MOD: API-dən yüklə (localStorage'dan yükləmə)
        // OFFLINE MOD: localStorage'dan yüklə (fallback)
        const shouldUseLocalStorage = this.useLocalStorage || (!this.isOnline && this.API_BASE_URL);
        
        if (shouldUseLocalStorage) {
            // localStorage istifadə et - offline ikən və ya GitHub Pages
            const savedDiamonds = localStorage.getItem('towerDefenseDiamonds');
            const savedStars = localStorage.getItem('towerDefenseStars');
            
            if (savedDiamonds !== null && savedDiamonds !== '') {
                this.diamonds = parseInt(savedDiamonds);
                if (!Number.isFinite(this.diamonds) || this.diamonds < 0) {
                    this.diamonds = 500;
                    if (!this.isOnline) {
                        localStorage.setItem('towerDefenseDiamonds', '500');
                    }
                }
            } else {
                this.diamonds = 500;
                if (!this.isOnline) {
                    localStorage.setItem('towerDefenseDiamonds', '500');
                }
            }
            
            if (savedStars !== null && savedStars !== '' && savedStars !== '0') {
                this.stars = parseInt(savedStars);
                if (!Number.isFinite(this.stars) || this.stars < 0) {
                    this.stars = 100;
                    if (!this.isOnline) {
                        localStorage.setItem('towerDefenseStars', '100');
                    }
                }
            } else {
                this.stars = 100;
                if (!this.isOnline) {
                    localStorage.setItem('towerDefenseStars', '100');
                }
            }
            
            const loadEndTime = performance.now();
            this.debugLog(`[PERF] loadCurrency() from localStorage completed in ${(loadEndTime - loadStartTime).toFixed(2)}ms`);
        } else {
            // API-dən yüklə - timeout ilə
            const userId = localStorage.getItem('towerDefenseUserId');
            if (userId && this.API_BASE_URL) {
                try {
                    // Timeout ekle - 5 saniyədən çox gözləmə
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    
                    const response = await fetch(`${this.API_BASE_URL}/get-stats?user_id=${userId}`, {
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    
                    const data = await response.json();
                    if (data.success && data.stats) {
                        this.diamonds = data.stats.diamonds || 500;
                        this.stars = data.stats.stars || 100;
                        // localStorage-ə də saxla (backup kimi)
                        localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
                        localStorage.setItem('towerDefenseStars', this.stars.toString());
                    }
                    
                    const loadEndTime = performance.now();
                    this.debugLog(`[PERF] loadCurrency() from API completed in ${(loadEndTime - loadStartTime).toFixed(2)}ms`);
                } catch (error) {
                    if (error.name === 'AbortError') {
                        this.debugLog('[PERF] loadCurrency() API timeout - using localStorage');
                    } else {
                        console.error('Load currency error:', error);
                    }
                    // Xəta olduqda localStorage-dan yüklə
                    const savedDiamonds = localStorage.getItem('towerDefenseDiamonds');
                    const savedStars = localStorage.getItem('towerDefenseStars');
                    this.diamonds = savedDiamonds ? parseInt(savedDiamonds) : 500;
                    this.stars = (savedStars && savedStars !== '0') ? parseInt(savedStars) : 100;
                    
                    const loadEndTime = performance.now();
                    this.debugLog(`[PERF] loadCurrency() fallback completed in ${(loadEndTime - loadStartTime).toFixed(2)}ms`);
                }
            }
        }
        this.updateCurrencyUI();
    }
    
    // Elmas və yıldızları API-yə göndər (güncəlləndikdə) - ONLINE MOD
    async updateCurrencyAPI(diamondsChange = 0, starsChange = 0) {
        if (this.useLocalStorage || !this.API_BASE_URL || !this.userId || (diamondsChange === 0 && starsChange === 0)) {
            return;
        }
        
        // Offline ikən API-yə göndərmə, localStorage'a yaz
        if (!this.isOnline) {
            if (diamondsChange !== 0) {
                localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
            }
            if (starsChange !== 0) {
                localStorage.setItem('towerDefenseStars', this.stars.toString());
            }
            this.hasOfflineData = true;
            return;
        }
        
        try {
            const response = await fetch(`${this.API_BASE_URL}/update-currency`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    diamonds_change: diamondsChange,
                    stars_change: starsChange
                })
            });
            
            const data = await response.json();
            if (data.success) {
                // Güncəllənmiş dəyərləri API-dən al
                if (data.diamonds !== undefined) this.diamonds = data.diamonds;
                if (data.stars !== undefined) this.stars = data.stars;
                // ONLINE MOD: localStorage'a yazma (yalnız offline backup kimi)
            }
        } catch (error) {
            console.error('Update currency API error:', error);
            // Xəta olduqda offline rejiminə keç və localStorage'a yaz
            if (diamondsChange !== 0) {
                localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
            }
            if (starsChange !== 0) {
                localStorage.setItem('towerDefenseStars', this.stars.toString());
            }
            this.hasOfflineData = true;
            this.isOnline = false; // Bağlantı xətası
        }
    }
    
    // Offline localStorage verilərini API-yə senkronizasiya et
    async syncOfflineDataToAPI() {
        if (this.useLocalStorage || !this.API_BASE_URL || !this.userId || !this.isOnline) {
            return;
        }
        
        this.debugLog('🔄 Offline veriləri API-yə senkronizasiya edilir...');
        
        // 1. Elmas/Ulduz senkronizasiyası
        const offlineDiamonds = localStorage.getItem('towerDefenseDiamonds');
        const offlineStars = localStorage.getItem('towerDefenseStars');
        
        if (offlineDiamonds || offlineStars) {
            try {
                // Veritabanından cari dəyərləri al
                const response = await fetch(`${this.API_BASE_URL}/get-stats?user_id=${this.userId}`);
                const data = await response.json();
                
                if (data.success && data.stats) {
                    const dbDiamonds = data.stats.diamonds || 0;
                    const dbStars = data.stats.stars || 0;
                    const localDiamonds = offlineDiamonds ? parseInt(offlineDiamonds) : dbDiamonds;
                    const localStars = offlineStars ? parseInt(offlineStars) : dbStars;
                    
                    // Əgər localStorage dəyərləri fərqlidirsə, fərqi API-yə göndər
                    const diamondsDiff = localDiamonds - dbDiamonds;
                    const starsDiff = localStars - dbStars;
                    
                    if (diamondsDiff !== 0 || starsDiff !== 0) {
                        await this.updateCurrencyAPI(diamondsDiff, starsDiff);
                        this.debugLog(`✅ Elmas/Ulduz senkronizasiya edildi: ${diamondsDiff} elmas, ${starsDiff} ulduz`);
                    }
                }
            } catch (error) {
                console.error('Sync currency error:', error);
            }
        }
        
        // 2. Oyun vəziyyəti senkronizasiyası
        const offlineGameState = localStorage.getItem('towerDefenseGameState');
        if (offlineGameState) {
            try {
                const gameStateData = JSON.parse(offlineGameState);
                
                const response = await fetch(`${this.API_BASE_URL}/save-game-state`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: this.userId,
                        game_state: gameStateData,
                        is_game_over: gameStateData.gameState?.gameOver || false
                    })
                });
                
                const data = await response.json();
                if (data.success) {
                    this.debugLog('✅ Oyun vəziyyəti senkronizasiya edildi');
                    // localStorage'dan offline veriləri sil (senkronizasiya edildi)
                    localStorage.removeItem('towerDefenseGameState');
                    localStorage.removeItem('towerDefenseGameStateTime');
                    localStorage.removeItem('towerDefenseDiamonds');
                    localStorage.removeItem('towerDefenseStars');
                    this.hasOfflineData = false;
                    this.showTooltip('✅ Offline verilər veritabanına yükləndi', 'success');
                }
            } catch (error) {
                console.error('Sync game state error:', error);
            }
        }
    }
    
    // Currency UI-ni yenilə
    updateCurrencyUI() {
        const diamondsEl = document.getElementById('diamonds');
        const starsEl = document.getElementById('stars');
        if (diamondsEl) diamondsEl.textContent = this.diamonds;
        if (starsEl) starsEl.textContent = this.stars;
    }
    
    // Elmas və yıldızları dəyişdir (online: API, offline: localStorage)
    changeCurrency(diamondsChange = 0, starsChange = 0) {
        if (diamondsChange !== 0) {
            this.diamonds = Math.max(0, this.diamonds + diamondsChange);
        }
        if (starsChange !== 0) {
            this.stars = Math.max(0, this.stars + starsChange);
        }
        this.updateCurrencyUI();
        
        // Online ikən: Sadece API-yə göndər (localStorage'a yazma)
        // Offline ikən: localStorage'a yaz (API-yə göndərmə)
        if (diamondsChange !== 0 || starsChange !== 0) {
            if (this.isOnline && !this.useLocalStorage && this.API_BASE_URL && this.userId) {
                // Online: API-yə göndər
                this.updateCurrencyAPI(diamondsChange, starsChange);
            } else {
                // Offline və ya API yoxdur: localStorage'a yaz
                if (diamondsChange !== 0) {
                    localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
                }
                if (starsChange !== 0) {
                    localStorage.setItem('towerDefenseStars', this.stars.toString());
                }
                this.hasOfflineData = true; // Offline veri var
            }
        }
    }

    async init() {
        // init() funksiyasının iki dəfə çağırılmasının qarşısını almaq
        if (this.initInProgress) {
            this.debugLog('[INIT] ⚠️ init() artıq davam edir, ikinci çağırış skip edilir');
            return;
        }
        this.initInProgress = true;
        
        const initStartTime = performance.now();
        this.debugLog('[PERF] init() started');
        
        // Get user ID from localStorage
        const userId = localStorage.getItem('towerDefenseUserId');
        if (userId) {
            this.userId = parseInt(userId);
        }
        
        // ONLINE iken offline verileri senkronize et (bağlantı bərpa olundu)
        if (this.isOnline && !this.useLocalStorage && this.API_BASE_URL && this.userId) {
            await this.syncOfflineDataToAPI();
        }
        
        // Paralel yükləmə - API çağrılarını eyni anda et (sürət artırır)
        this.debugLog('[PERF] Starting parallel loads (currency + game state)');
        const loadStartTime = performance.now();
        
        // İKİSİNİ EYNİ ANDA YÜKLƏ - sürət artırır
        const [currencyResult, savedState] = await Promise.all([
            this.loadCurrency().catch(err => {
                this.debugLog(`[PERF] loadCurrency error: ${err}`);
                return null;
            }),
            (this.userId || this.useLocalStorage) ? this.loadGameState().catch(err => {
                this.debugLog(`[PERF] loadGameState error: ${err}`);
                return null;
            }) : Promise.resolve(null)
        ]);
        
        const loadEndTime = performance.now();
        this.debugLog(`[PERF] Parallel loads completed in ${(loadEndTime - loadStartTime).toFixed(2)}ms`);
        
        // Qeyd yoxlaması - əgər qeyd varsa və game over deyilsə, davam etmək sualı
        // sessionStorage istifadə et ki, mesaj yalnız bir dəfə göstərilsin (bir səhifə yükləməsi üçün)
        const confirmKey = 'game_continue_confirm_shown_' + (this.userId || 'local');
        
        if (savedState && savedState.success && savedState.game_state && !savedState.is_game_over) {
            // İLK ÖNCƏ yoxla ki, başqa çağırış artıq flag qoyub?
            const confirmAlreadyShown = sessionStorage.getItem(confirmKey);
            
            if (!confirmAlreadyShown) {
                // Flag'i İLK ÖNCE set et ki, paralel çağırışlarda iki dəfə göstərilməsin
                sessionStorage.setItem(confirmKey, 'true');
                
                // Qısa bir delay əlavə et ki, paralel çağırışlar üçün flag set olsun
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // Yenidən yoxla ki, başqa çağırış flag qoyubmu? (race condition üçün)
                const doubleCheck = sessionStorage.getItem(confirmKey);
                if (doubleCheck !== 'true') {
                    // Başqa çağırış artıq flag silib və ya dəyişib, skip et
                    this.debugLog('[INIT] ⚠️ Confirm mesajı başqa çağırış tərəfindən idarə edilir, skip edilir');
                    this.initInProgress = false;
                    return;
                }
                
                const continueGame = confirm('Qaldığınız yerdən davam etmək istəyirsinizmi?');
                
                // Cavabdan sonra flag'i sil (növbəti dəfə üçün)
                sessionStorage.removeItem(confirmKey);
                
                if (continueGame) {
                    // Oyun vəziyyətini bərpa et
                    this.restoreGameState(savedState);
                    
                    // Yol yenidən hesabla
                    this.setupEventListeners();
                    this.setupResponsiveHandling();
                    this.setupVisibilityHandling();
                    this.recomputePath();
                    this.setGameSpeed(1);
                    this.gameLoop();
                    this.initInProgress = false;
                    return;
                } else {
                    // Qeydi sil
                    if (this.API_BASE_URL) {
                        fetch(`${this.API_BASE_URL}/delete-game-state`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                user_id: this.userId
                            })
                        }).catch(err => console.error('Delete game state error:', err));
                    }
                }
            }
        } else if (!this.useLocalStorage && savedState && savedState.success && savedState.is_game_over) {
            // Game over olubsa, qeydi sil və yenidən başla
            if (this.API_BASE_URL) {
                fetch(`${this.API_BASE_URL}/delete-game-state`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: this.userId
                    })
                }).catch(err => console.error('Delete game state error:', err));
            }
        }
        
        // Initialize game start time
        this.gameStartTime = Date.now();
        this.enemiesKilledThisGame = 0;
        
        const setupStartTime = performance.now();
        this.debugLog('[PERF] Starting setup functions');
        
        this.setupEventListeners();
        this.setupResponsiveHandling();
        this.setupVisibilityHandling();
        this.recomputePath();
        // Set initial UI state for speed buttons
        this.setGameSpeed(1);
        
        // init() tamamlandı
        this.initInProgress = false;
        
        const setupEndTime = performance.now();
        this.debugLog(`[PERF] Setup functions completed in ${(setupEndTime - setupStartTime).toFixed(2)}ms`);
        
        const initEndTime = performance.now();
        this.debugLog(`[PERF] init() completed in ${(initEndTime - initStartTime).toFixed(2)}ms`);
        
        this.gameLoop();
    }
    
    // Tab görünməz olanda belə oyunun davam etməsini təmin et
    setupVisibilityHandling() {
        // Tab görünməz olsa belə oyun davam etsin - ilk yoxlama
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Tab görünməz olanda, setInterval istifadə et (daha etibarlı)
                if (!this.gameLoopInterval) {
                    this.debugLog('Tab görünməzdir - setInterval aktivləşdirilir');
                    // requestAnimationFrame-i dayandır və setInterval istifadə et
                    const self = this; // Store reference to correct instance
                    this.gameLoopInterval = setInterval(() => {
                        // CRITICAL: Use stored reference
                        if (self && self.gameLoop) {
                            self.gameLoop();
                        } else {
                            console.error('[GAME-LOOP] ❌ CRITICAL: this context lost in setInterval!', self);
                        }
                    }, 16); // ~60 FPS
                }
            } else {
                // Tab görünür olduqda, setInterval-i dayandır və requestAnimationFrame istifadə et
                if (this.gameLoopInterval) {
                    this.debugLog('Tab görünürdür - setInterval dayandırılır');
                    clearInterval(this.gameLoopInterval);
                    this.gameLoopInterval = null;
                }
                // lastUpdateTime-u yenilə ki, deltaTime düzgün hesablansın
                this.lastUpdateTime = Date.now();
            }
        };
        
        // visibilitychange event listener əlavə et
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // İlk yoxlama: əgər tab başlanğıcda gizlidirsə, setInterval qur
        if (document.hidden) {
            handleVisibilityChange();
        }
        
        // window focus/blur event listener-ləri də əlavə et (əlavə təhlükəsizlik üçün)
        window.addEventListener('blur', () => {
            // Oyun arxa planda olsa belə davam etməlidir
            this.lastUpdateTime = Date.now();
        });
        
        window.addEventListener('focus', () => {
            // Tab fokuslananda lastUpdateTime-u yenilə
            this.lastUpdateTime = Date.now();
        });
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
            // Mövcud boşluqdan istifadə et (parent elementinin genişliyindən)
            const parent = this.canvas.parentElement || document.body;
            const parentW = Math.max(320, parent.clientWidth);
            
            // Viewport hündürlüyünü hesabla (header + padding üçün buffer çıxılır)
            const header = document.querySelector('.game-header');
            // Mobil portrait rejimində header sol sidebar olur, hündürlüyünü çıxma
            const sidebarLeft = window.matchMedia('(max-width: 900px) and (orientation: portrait)').matches;
            const headerH = (!sidebarLeft && header) ? header.getBoundingClientRect().height : 0;
            
            // Portrait rejimində kiçik buffer (boşluqları azaltmaq üçün)
            const portrait = window.matchMedia('(orientation: portrait)').matches;
            const buffer = portrait ? 16 : 32;
            const availableH = Math.max(240, window.innerHeight - headerH - buffer);
            
            // 16:9 nisbətini saxla
            let cssW = Math.min(parentW, Math.round(availableH * 16 / 9));
            let cssH = Math.round(cssW * 9 / 16);
            
            // Əgər hündürlük hələ də mövcud olandan böyükdürsə, hündürlüyə görə məhdudlaşdır
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
            
            // Device-pixel koordinatlarından istifadə et; ikiqat miqyaslamadan qaç
            this.ctx.setTransform(1,0,0,1,0,0);
            this.updateGridDimensions();

            // Mağaza overlay: canvas sərhədləri ilə uyğunlaş və header üst-üstə düşməsini qaçır
            const area = document.querySelector('.game-area');
            if (area) area.style.gridTemplateColumns = '1fr';

            const shop = document.querySelector('.tower-shop');
            if (shop) {
                const rect = this.canvas.getBoundingClientRect();
                // Əgər boşluq varsa canvasın sağında göstər, yoxdursa sağ kənara yerləşdir
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

            // Canvas yaxınlığındakı u/h ölçü etiketlərini yenilə
            const labelW = document.getElementById('labelW');
            const labelH = document.getElementById('labelH');
            if (labelW) labelW.textContent = 'u: ' + cssW;
            if (labelH) labelH.textContent = 'h: ' + cssH;
        };

        const doResize = () => {
            const isPortrait = window.matchMedia('(orientation: portrait)').matches;
            if (this.lastOrientationPortrait === null) this.lastOrientationPortrait = isPortrait;
            const orientationChanged = this.lastOrientationPortrait !== isPortrait;

            // Əgər oriyentasiya dəyişibsə və təhlükəsizdirsə, grid ölçülərini dəyiş
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
                // Debug mode dəyişikliyi haqqında mesaj yalnız debug mode-da göstərilir
                if (this.debugMode) {
                    console.log(`[DEBUG] Debug mode: ON`);
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
        // Mouse move event listener for enemy tooltip
        this.canvas.addEventListener('mousemove', (e) => {
            const { x, y } = this.getCanvasCoords(e);
            this.mouseX = x;
            this.mouseY = y;
            
            // Check if mouse is over an enemy
            this.hoveredEnemy = null;
            for (const enemy of this.enemies) {
                const radius = this.getEnemyRadius(enemy.type);
                const dx = x - enemy.x;
                const dy = y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius + 5) { // 5px padding for easier hover
                    this.hoveredEnemy = enemy;
                    break;
                }
            }
            
            // Change cursor if hovering over enemy
            if (this.hoveredEnemy) {
                this.canvas.style.cursor = 'pointer';
            } else if (!this.selectedTowerType) {
                this.canvas.style.cursor = 'default';
            }
        });
        
        // Canvas mouse interactions (drag place/move/select)
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.gameState.gameOver) return;
            
            // Mağazadan gelen event'leri engelle
            const target = e.target;
            // Shop içindəki button və input elementlərinə mane olma - amma yalnız shop içindəkilər
            if (target && (
                target.closest('.tower-shop') || 
                target.closest('.tower-option') || 
                target.closest('.shop') ||
                target.closest('#tab-controls') ||
                target.closest('.shop-tab-content')
            )) {
                this.debugLog(`[CANVAS] Event from shop detected, ignoring: ${e.type} on ${target.tagName}`);
                return; // Mağazadan gelen event'leri işleme
            }
            
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

                // If in plasma pairing mode, try to pair towers
                if (this.plasmaPairingMode && this.plasmaPairingTower) {
                    this.selectTower(towerAtPoint);
                    this.activatePlasma();
                    return; // Don't open context menu in pairing mode
                }

                // Dərhal qülləni seç (siyahının başına köçürmək üçün)
                this.selectTower(towerAtPoint);
                
                // Sol klikdə dərhal context menu aç
                this.showTowerContextAt(towerAtPoint);
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
                    const cost = this.towerCosts[type] || 0;
                    const starCost = this.towerStarCosts[type] || 0;
                    
                    // Ulduzla qüllə üçün ulduzları yoxla, adi qüllə üçün pulu yoxla
                    let canPlace = false;
                    if (starCost > 0) {
                        this.debugLog(`Tower type: ${type}, Star Cost: ${starCost}⭐, Stars: ${this.stars}⭐`);
                        canPlace = this.stars >= starCost;
                        if (!canPlace) {
                            const errorMsg = `Kifayət qədər ulduz yoxdur! Lazım: ${starCost}⭐, Mövcud: ${this.stars}⭐`;
                            this.debugLog(errorMsg);
                            this.showTooltip(errorMsg, 'error');
                        }
                    } else {
                        this.debugLog(`Tower type: ${type}, Cost: $${cost}, Money: $${this.gameState.money}`);
                        canPlace = this.gameState.money >= cost;
                        if (!canPlace) {
                            const errorMsg = `Kifayət qədər pul yoxdur! Lazım: $${cost}, Mövcud: $${this.gameState.money}`;
                            this.debugLog(errorMsg);
                            this.showTooltip(errorMsg, 'error');
                        }
                    }
                    
                    if (canPlace) {
                        this.isDraggingNew = true;
                        // Snap to grid center of the cell under cursor
                        const cellCol = Math.floor((x - this.gridOffsetX) / this.gridSize);
                        const cellRow = Math.floor((y - this.gridOffsetY) / this.gridSize);
                        const gridX = this.gridOffsetX + cellCol * this.gridSize + this.gridSize / 2;
                        const gridY = this.gridOffsetY + cellRow * this.gridSize + this.gridSize / 2;
                        this.hoverPos = { x: gridX, y: gridY };
                        this.debugLog(`Starting new tower drag at (${gridX}, ${gridY})`);
                    }
                } else {
                    this.debugLog(`Cannot start new tower drag - tower is already selected`);
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.gameState.gameOver) return;
            
            // Mağazadan gelen event'leri engelle
            const target = e.target;
            if (target && (
                target.closest('.tower-shop') || 
                target.closest('.tower-option') || 
                target.closest('.shop') ||
                target.closest('#tab-controls') ||
                target.closest('.shop-tab-content')
            )) {
                this.debugLog(`[CANVAS] Event from shop detected, ignoring: ${e.type} on ${target.tagName}`);
                return; // Mağazadan gelen event'leri işleme
            }
            
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
            
            // Mağazadan gelen event'leri engelle
            const target = e.target;
            if (target && (
                target.closest('.tower-shop') || 
                target.closest('.tower-option') || 
                target.closest('.shop') ||
                target.closest('#tab-controls') ||
                target.closest('.shop-tab-content')
            )) {
                this.debugLog(`[CANVAS] Event from shop detected, ignoring: ${e.type} on ${target.tagName}`);
                return; // Mağazadan gelen event'leri işleme
            }
            
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
                
                // If in plasma pairing mode, try to pair towers
                if (this.plasmaPairingMode && this.plasmaPairingTower && towerAtPoint) {
                    this.selectTower(towerAtPoint);
                    this.activatePlasma();
                    return; // Don't open context menu in pairing mode
                }
                
                if (towerAtPoint) {
                    this.debugLog(`Selecting tower at (${towerAtPoint.x}, ${towerAtPoint.y})`);
                    this.selectTower(towerAtPoint);
                    this.showTowerContextAt(towerAtPoint);
                } else {
                    // If clicking empty space while in pairing mode, cancel pairing
                    if (this.plasmaPairingMode) {
                        this.cancelPlasmaPairing();
                        this.debugLog('Plazma cütləşdirmə rejimi ləğv edildi');
                    }
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
        
        // Shop tab switching
        document.querySelectorAll('.shop-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                
                // Bütün tabları və contentləri gizlət
                document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.shop-tab-content').forEach(c => c.classList.remove('active'));
                
                // Seçilmiş tabı və contenti aktiv et
                tab.classList.add('active');
                const targetContent = document.getElementById(targetTab);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
        
        // Shop scroll davranışını kontrol et - over-scroll engelleme ve sallanmayı önleme
        const shopContentWrapper = document.querySelector('.shop-content-wrapper');
        if (shopContentWrapper) {
            let isScrolling = false;
            let scrollTimeout = null;
            
            shopContentWrapper.addEventListener('wheel', (e) => {
                const element = shopContentWrapper;
                const isScrollingDown = e.deltaY > 0;
                const isScrollingUp = e.deltaY < 0;
                
                // Mevcut scroll pozisyonu
                const scrollTop = element.scrollTop;
                const scrollHeight = element.scrollHeight;
                const clientHeight = element.clientHeight;
                
                // Alt sınırda mıyız? (5 piksel tolerans - daha güvenli)
                const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
                // Üst sınırda mıyız?
                const isAtTop = scrollTop <= 5;
                
                // Eğer aşağı scroll ediliyor ve zaten alttaysak - engelle ve pozisyonu sabitle
                if (isScrollingDown && isAtBottom) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    // Pozisyonu kesin olarak sabitle
                    requestAnimationFrame(() => {
                        element.scrollTop = scrollHeight - clientHeight;
                    });
                    return false;
                }
                
                // Eğer yukarı scroll ediliyor ve zaten üstteysek - engelle ve pozisyonu sabitle
                if (isScrollingUp && isAtTop) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    // Pozisyonu kesin olarak sabitle
                    requestAnimationFrame(() => {
                        element.scrollTop = 0;
                    });
                    return false;
                }
                
                // Scroll devam ediyorsa flag'i ayarla
                isScrolling = true;
                if (scrollTimeout) {
                    clearTimeout(scrollTimeout);
                }
                scrollTimeout = setTimeout(() => {
                    isScrolling = false;
                }, 150);
            }, { passive: false });
            
            // Scroll event'inde pozisyonu düzelt ve sallanmayı önle
            shopContentWrapper.addEventListener('scroll', (e) => {
                if (!isScrolling) return; // Scroll bittiğinde kontrol et
                
                const element = e.target;
                const scrollTop = element.scrollTop;
                const scrollHeight = element.scrollHeight;
                const clientHeight = element.clientHeight;
                
                // Pozisyonu kesin olarak sınırlar içinde tut
                requestAnimationFrame(() => {
                    if (scrollTop < 0) {
                        element.scrollTop = 0;
                    } else if (scrollTop + clientHeight > scrollHeight) {
                        element.scrollTop = scrollHeight - clientHeight;
                    }
                });
            }, { passive: true });
            
            // Mouse wheel bittiğinde pozisyonu sabitle
            shopContentWrapper.addEventListener('wheel', (e) => {
                const element = shopContentWrapper;
                const scrollTop = element.scrollTop;
                const scrollHeight = element.scrollHeight;
                const clientHeight = element.clientHeight;
                
                // Wheel event bittiğinde pozisyonu düzelt
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        if (scrollTop < 0) {
                            element.scrollTop = 0;
                        } else if (scrollTop + clientHeight > scrollHeight) {
                            element.scrollTop = scrollHeight - clientHeight;
                        }
                    });
                }, 50);
            }, { passive: true });
        }
        
        // Tower selection
        document.querySelectorAll('.tower-option').forEach(option => {
            // Sürükleme davranışını engelle
            option.setAttribute('draggable', 'false');
            
            // Tooltip'leri tamamen gizle - context menüde zaten bilgiler var
            const tooltip = option.querySelector('.tower-tooltip');
            if (tooltip) {
                tooltip.style.display = 'none';
                tooltip.style.visibility = 'hidden';
                tooltip.style.opacity = '0';
                tooltip.style.pointerEvents = 'none';
                // Event listener'ları da kaldır
                tooltip.removeEventListener('mouseenter', () => {});
                tooltip.removeEventListener('mouseleave', () => {});
            }
            
            // Tüm sürükleme event'lerini engelle - mağazada sürüklemeye izin verme
            const preventDrag = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            
            // HTML5 drag & drop event'leri
            option.addEventListener('dragstart', (e) => {
                const towerType = e.currentTarget.dataset.tower;
                this.debugLog(`[SHOP DRAG] dragstart on tower-option: ${towerType} - PREVENTING`);
                preventDrag(e);
            });
            option.addEventListener('dragover', (e) => {
                this.debugLog(`[SHOP DRAG] dragover on tower-option - PREVENTING`);
                preventDrag(e);
            });
            option.addEventListener('drop', (e) => {
                this.debugLog(`[SHOP DRAG] drop on tower-option - PREVENTING`);
                preventDrag(e);
            });
            option.addEventListener('drag', (e) => {
                this.debugLog(`[SHOP DRAG] drag on tower-option - PREVENTING`);
                preventDrag(e);
            });
            option.addEventListener('dragend', (e) => {
                this.debugLog(`[SHOP DRAG] dragend on tower-option - PREVENTING`);
                preventDrag(e);
            });
            option.addEventListener('dragleave', (e) => {
                this.debugLog(`[SHOP DRAG] dragleave on tower-option - PREVENTING`);
                preventDrag(e);
            });
            option.addEventListener('dragenter', (e) => {
                this.debugLog(`[SHOP DRAG] dragenter on tower-option - PREVENTING`);
                preventDrag(e);
            });
            
            // Mouse event'leri - sürükleme davranışını engelle
            let isDragging = false;
            let dragStartPos = null;
            
            option.addEventListener('mousedown', (e) => {
                const towerType = e.currentTarget.dataset.tower;
                this.debugLog(`[SHOP DRAG] mousedown on tower-option: ${towerType}, button: ${e.button}`);
                // Sadece sol tık için - sağ tık ve orta tık için engelleme
                if (e.button === 0) {
                    dragStartPos = { x: e.clientX, y: e.clientY };
                    isDragging = false;
                    this.debugLog(`[SHOP DRAG] dragStartPos set: (${dragStartPos.x}, ${dragStartPos.y})`);
                }
                // preventDefault'i kaldırdık çünkü click event'i de çalışması lazım
            });
            
            option.addEventListener('mousemove', (e) => {
                if (dragStartPos && e.buttons === 1) {
                    const dx = Math.abs(e.clientX - dragStartPos.x);
                    const dy = Math.abs(e.clientY - dragStartPos.y);
                    const dist = Math.hypot(dx, dy);
                    this.debugLog(`[SHOP DRAG] mousemove: dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}, dist=${dist.toFixed(1)}, buttons=${e.buttons}`);
                    // Eğer 5 piksel'den fazla hareket varsa sürükleme başladı
                    if (dx > 5 || dy > 5) {
                        isDragging = true;
                        this.debugLog(`[SHOP DRAG] Dragging detected! Preventing default behavior`);
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                }
            });
            
            option.addEventListener('mouseup', (e) => {
                const towerType = e.currentTarget.dataset.tower;
                this.debugLog(`[SHOP DRAG] mouseup on tower-option: ${towerType}, isDragging: ${isDragging}`);
                if (isDragging) {
                    this.debugLog(`[SHOP DRAG] Was dragging, preventing default behavior`);
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                dragStartPos = null;
                isDragging = false;
            });
            
            // Seçimi engelle
            option.addEventListener('selectstart', preventDrag);
            option.addEventListener('select', preventDrag);
            
            // Sol klik - qüllə seçimi, siyahının yuxarısına keçir və kontekst menyu aç
            option.addEventListener('click', (e) => {
                if (option.__longPressFired) { option.__longPressFired = false; return; }
                const towerType = e.currentTarget?.dataset?.tower;
                const targetElement = e.currentTarget;
                
                if (!targetElement) {
                    this.debugError('Click event: currentTarget is null');
                    return;
                }
                
                if (towerType) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    this.debugLog(`Mağazada qüllə seçildi (sol klik): ${towerType}`);
                    
                    // Qülləni seç (bu siyahını yeniləyəcək)
                    this.selectTowerType(towerType);
                    this.debugLog(`selectedTowerType artıq: ${this.selectedTowerType}`);
                    
                    // Seçilən qüllə kartını siyahının üstünə köçür - SADECE SOL KLİKDE
                    this.moveTowerOptionToTop(targetElement);
                    
                    // Sol klikdə kontekst menyu AÇILMIR - yalnız qüllə seçilir və yuxarı qaldırılır
                    // Kontekst menyu yalnız sağ klik (contextmenu event) ilə açılır
                }
            });
            
            // Sağ klik - mağaza kontekst menyusu (siyahının yuxarısına keçmə)
            option.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const towerType = e.currentTarget?.dataset?.tower;
                const targetElement = e.currentTarget;
                
                if (!targetElement) {
                    this.debugError('Contextmenu event: currentTarget is null');
                    return;
                }
                
                // Bütün qüllə tipləri üçün (pul ilə alınan və ulduzla alınan)
                if (towerType) {
                    this.debugLog(`Mağazada qüllə seçildi (sağ klik): ${towerType}`);
                    
                    // Qülləni seç (sağ klikdə də seçmek lazımdır)
                    this.selectTowerType(towerType);
                    
                    // SAĞ KLİKDE KONTEKST MENYU AÇILIR
                    // Sol klikdə yalnız qüllə seçilir və yuxarı qaldırılır, kontekst menyu açılmır
                    // Sağ klikdə isə qüllə seçilir və kontekst menyu açılır
                    // moveTowerOptionToTop çağrılmıyor (sağ klikdə yuxarı qaldırılmır)
                    
                    if (targetElement && targetElement.isConnected) {
                        this.showShopTowerContextMenu(targetElement, towerType, e.clientX, e.clientY);
                    } else {
                        this.debugError('showShopTowerContextMenu: targetElement is not connected to DOM');
                    }
                }
            });

            // Mobil üçün: uzun basmada kontekst menyusunu aç
            let lpTimer = null; let lpX = 0; let lpY = 0;
            option.addEventListener('touchstart', (e) => {
                const t = e.touches && e.touches[0];
                if (!t) return;
                lpX = t.clientX; lpY = t.clientY;
                option.__longPressFired = false;
                clearTimeout(lpTimer);
                lpTimer = setTimeout(() => {
                    option.__longPressFired = true;
                    const towerType = option.dataset?.tower;
                    if (towerType) {
                        this.selectTowerType(towerType);
                        this.showShopTowerContextMenu(option, towerType, lpX, lpY);
                    }
                }, 450);
            }, { passive: true });
            const cancelLongPress = () => { clearTimeout(lpTimer); };
            option.addEventListener('touchend', cancelLongPress, { passive: true });
            option.addEventListener('touchcancel', cancelLongPress, { passive: true });
        });
        
        // Mağazadaki kule iconlarını oyundaki forma uygun çiz - awaken ve shield efektleri ile
        this.updateShopTowerIcons();
        
        // Başlangıçda 'basic' qülləni seç və kartını üstə köçür (DOM hazır olduqdan sonra)
        setTimeout(() => {
            this.selectTowerType('basic');
            const basicOption = document.querySelector('[data-tower="basic"]');
            if (basicOption) {
                this.moveTowerOptionToTop(basicOption);
            }
        }, 100);
        
        // Game controls
        const startWaveBtn = document.getElementById('startWave');
        if (startWaveBtn) {
            startWaveBtn.addEventListener('click', () => {
                this.startWave();
            });
        }
        
        const autoStartCheckbox = document.getElementById('autoStart');
        if (autoStartCheckbox) {
            autoStartCheckbox.addEventListener('change', (e) => {
                this.autoStart = e.target.checked;
            });
        }
        
        
        // Restart game
        const restartGameBtn = document.getElementById('restartGame');
        if (restartGameBtn) {
            restartGameBtn.addEventListener('click', () => {
                this.restartGame();
            });
        }
        
        // Save game state
        const saveGameStateBtn = document.getElementById('saveGameState');
        if (saveGameStateBtn) {
            saveGameStateBtn.addEventListener('click', () => {
                this.saveGameState();
            });
        }
        
        // Pause/Resume controls
        const pauseGameBtn = document.getElementById('pauseGame');
        const resumeGameBtn = document.getElementById('resumeGame');
        if (pauseGameBtn) {
            pauseGameBtn.addEventListener('click', () => {
                this.pauseGame();
            });
        }
        
        if (resumeGameBtn) {
            resumeGameBtn.addEventListener('click', () => {
                this.resumeGame();
            });
        }
        
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
        const speed1Btn = document.getElementById('speed1');
        const speed2Btn = document.getElementById('speed2');
        const speed3Btn = document.getElementById('speed3');
        if (speed1Btn) {
            speed1Btn.addEventListener('click', () => {
                this.setGameSpeed(1);
            });
        }
        if (speed2Btn) {
            speed2Btn.addEventListener('click', () => {
                this.setGameSpeed(2);
            });
        }
        if (speed3Btn) {
            speed3Btn.addEventListener('click', () => {
                this.setGameSpeed(3);
            });
        }
        
        // Global avtomatik can yeniləmə
        const globalAutoHealToggle = document.getElementById('globalAutoHealToggle');
        const globalAutoHealSelectAll = document.getElementById('globalAutoHealSelectAll');
        const globalAutoHealDeselectAll = document.getElementById('globalAutoHealDeselectAll');
        const globalAutoHealConfirm = document.getElementById('globalAutoHealConfirm');
        
        if (globalAutoHealToggle) {
            console.log('[SETUP] ✅ globalAutoHealToggle found, adding event listener');
            // Remove existing listeners by cloning
            const newToggle = globalAutoHealToggle.cloneNode(true);
            globalAutoHealToggle.parentNode.replaceChild(newToggle, globalAutoHealToggle);
            newToggle.addEventListener('click', (e) => {
                console.log('[CLICK] 🔵 globalAutoHealToggle clicked!', e);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.showGlobalAutoHealPanel();
            }, true); // Use capture phase
        } else {
            console.error('[SETUP] ❌ globalAutoHealToggle NOT FOUND!');
        }
        if (globalAutoHealSelectAll) {
            console.log('[SETUP] ✅ globalAutoHealSelectAll found, adding event listener');
            globalAutoHealSelectAll.addEventListener('click', (e) => {
                console.log('[CLICK] 🔵 globalAutoHealSelectAll clicked!', e);
                e.preventDefault();
                e.stopPropagation();
                this.selectAllTowersForAutoHeal();
            });
        } else {
            console.error('[SETUP] ❌ globalAutoHealSelectAll NOT FOUND!');
        }
        if (globalAutoHealDeselectAll) {
            console.log('[SETUP] ✅ globalAutoHealDeselectAll found, adding event listener');
            globalAutoHealDeselectAll.addEventListener('click', (e) => {
                console.log('[CLICK] 🔵 globalAutoHealDeselectAll clicked!', e);
                e.preventDefault();
                e.stopPropagation();
                this.deselectAllTowersForAutoHeal();
            });
        } else {
            console.error('[SETUP] ❌ globalAutoHealDeselectAll NOT FOUND!');
        }
        if (globalAutoHealConfirm) {
            console.log('[SETUP] ✅ globalAutoHealConfirm found, adding event listener');
            globalAutoHealConfirm.addEventListener('click', (e) => {
                console.log('[CLICK] 🔵 globalAutoHealConfirm clicked!', e);
                e.preventDefault();
                e.stopPropagation();
                this.confirmGlobalAutoHeal();
            });
        } else {
            console.error('[SETUP] ❌ globalAutoHealConfirm NOT FOUND!');
        }

        // Floating context menu actions
        // Not: Event listener'lar showTowerContextAt() içinde her açılışta ekleniyor
        // Burada sadece butonların varlığını kontrol ediyoruz
        const ctxSellBtn = document.getElementById('ctxSell');
        if (ctxSellBtn) {
            console.log('[SETUP] ✅ ctxSell button found in DOM');
        } else {
            console.error('[SETUP] ❌ ctxSell button NOT FOUND in DOM!');
            alert('❌ ctxSell butonu tapılmadı!');
        }
        const btnHeal = document.getElementById('ctxHeal');
        btnHeal && btnHeal.addEventListener('click', () => { this.healTower(); });
        const btnHealthUpgrade = document.getElementById('ctxHealthUpgrade');
        btnHealthUpgrade && btnHealthUpgrade.addEventListener('click', () => { this.upgradeHealth(); });
        
        // Avtomatik can yeniləmə düymələri
        // Not: Event listener'lar showTowerContextAt() içinde her açılışta ekleniyor
        // Burada sadece butonların varlığını kontrol ediyoruz
        const btnAutoHealToggle = document.getElementById('ctxAutoHealToggle');
        const btnAutoHealConfirm = document.getElementById('ctxAutoHealConfirm');
        
        if (btnAutoHealToggle) {
            console.log('[SETUP] ✅ ctxAutoHealToggle button found in DOM');
        } else {
            console.error('[SETUP] ❌ ctxAutoHealToggle button NOT FOUND in DOM!');
        }
        
        if (btnAutoHealConfirm) {
            console.log('[SETUP] ✅ ctxAutoHealConfirm button found in DOM');
        } else {
            console.error('[SETUP] ❌ ctxAutoHealConfirm button NOT FOUND in DOM!');
        }
        
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
        const btnPlasmaActivate = document.getElementById('ctxPlasmaActivate');
        btnPlasmaActivate && btnPlasmaActivate.addEventListener('click', () => { this.startPlasmaPairing(); });
        const btnPlasmaDeactivate = document.getElementById('ctxPlasmaDeactivate');
        btnPlasmaDeactivate && btnPlasmaDeactivate.addEventListener('click', () => { this.deactivatePlasma(); });

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
        const upgradeTowerBtn = document.getElementById('upgradeTower');
        if (upgradeTowerBtn) {
            upgradeTowerBtn.addEventListener('click', () => {
                this.upgradeTower();
            });
        }
        
        const sellTowerBtn = document.getElementById('sellTower');
        if (sellTowerBtn) {
            sellTowerBtn.addEventListener('click', () => {
                this.sellTower();
            });
        }
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
    
    // Seçilən qüllə kartını siyahının üstünə köçür
    moveTowerOptionToTop(selectedOption) {
        if (!selectedOption) {
            this.debugLog(`moveTowerOptionToTop: selectedOption null`);
            return;
        }
        
        // Qüllə kartının parent container'ını tap
        const parent = selectedOption.parentElement;
        if (!parent) {
            this.debugLog(`moveTowerOptionToTop: parent tapılmadı`);
            return;
        }
        
        // Tower-options container'ını tap (doğrudan və ya wrapper içində)
        let towerOptionsContainer = parent;
        if (!parent.classList.contains('tower-options')) {
            // Wrapper içində olabilir - shop-tab-content içindeki tower-options'ı tap
            towerOptionsContainer = parent.closest('.tower-options');
            if (!towerOptionsContainer) {
                this.debugLog(`moveTowerOptionToTop: tower-options container tapılmadı, parent: ${parent.className}`);
                return;
            }
        }
        
        // Seçilən qülləni container-dan çıxar
        const selectedElement = towerOptionsContainer.removeChild(selectedOption);
        
        // Siyahının başına əlavə et
        towerOptionsContainer.insertBefore(selectedElement, towerOptionsContainer.firstChild);
        
        this.debugLog(`✅ Qüllə kartı siyahının üstünə köçürüldü: ${selectedOption.dataset.tower}`);
    }
    
    // Mağazadaki kule iconlarını oyundaki forma uygun güncelle - awaken ve shield efektleri ile
    updateShopTowerIcons() {
        const iconSize = 50;
        const towerTypes = ['basic', 'rapid', 'heavy', 'ice', 'flame', 'laser', 'plasma'];
        
        towerTypes.forEach(towerType => {
            const iconElement = document.querySelector(`.tower-icon.${towerType}-tower`);
            if (!iconElement) return;
            
            // Canvas oluştur - daha büyük çözünürlük için scale
            const scale = 2; // Retina için
            const canvas = document.createElement('canvas');
            canvas.width = iconSize * scale;
            canvas.height = iconSize * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            
            const centerX = iconSize / 2;
            const centerY = iconSize / 2;
            // BaseR hesaplaması - icon size'a göre (oyundaki gibi daire formu)
            // iconSize = 50 için baseR yaklaşık 19 olmalı (50 * 0.38)
            const baseR = Math.max(6, Math.round(iconSize * 0.38)); // Daire formunda - köşe yok
            const hpRatio = 1.0; // Full health - mağazada her zaman full
            
            // Qüllə rəngləri - oyundakiyle aynı
            const colors = {
                basic: 'hsl(120, 90%, 60%)',   // Green
                rapid: 'hsl(200, 90%, 60%)',   // Blue
                heavy: 'hsl(0, 90%, 60%)',     // Red
                ice: '#00CED1',                 // Cyan
                flame: '#FF4500',               // Orange red
                laser: '#FF1493',               // Deep pink
                plasma: '#9370DB'               // Medium purple
            };
            const baseColor = colors[towerType] || 'hsl(120, 90%, 60%)';
            
            // NeonStroke hesapla - oyundaki gibi
            let neonStroke;
            if (towerType === 'basic') {
                const hue = Math.floor(120 * hpRatio);
                neonStroke = `hsl(${hue}, 90%, 60%)`;
            } else if (towerType === 'rapid') {
                const lightness = 40 + (20 * hpRatio);
                neonStroke = `hsl(200, 90%, ${lightness}%)`; // Hep mavi
            } else if (towerType === 'heavy') {
                const lightness = 40 + (20 * hpRatio);
                neonStroke = `hsl(0, 90%, ${lightness}%)`; // Hep kırmızı
            } else {
                neonStroke = baseColor;
            }
            
            // Ring as health bar - oyundaki gibi çiz (ANA NEON HALQA - DAİRE FORMASINDA)
            ctx.save();
            const lineWidth = Math.max(2, Math.round(iconSize * 0.12));
            const startAngle = -Math.PI / 2; // Start from top (12 o'clock)
            const endAngle = startAngle + (Math.PI * 2 * hpRatio); // Full health - full circle
            
            // Draw the visible (healthy) part of the ring - ANA HALQA (rainbow'un dışında, daire formunda)
            if (hpRatio > 0) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, baseR, startAngle, endAngle); // Daire çizimi
                ctx.shadowColor = neonStroke;
                ctx.shadowBlur = Math.max(10, Math.round(iconSize * 0.35));
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = neonStroke;
                ctx.stroke();
            }
            ctx.restore();
            
            // Awaken rainbow halqası - oyundaki gibi (ANA HALQA'NIN İÇİNDE)
            const hasAwakenAbility = ['basic', 'rapid', 'heavy', 'ice', 'flame', 'laser'].includes(towerType);
            if (hasAwakenAbility) {
                ctx.save();
                const rainbowRadius = baseR * 0.55; // Ana halqadan küçük - içeride (daha sıkıştırılmış)
                const rainbowColors = [
                    '#ff0000', '#ff7700', '#ffaa00', '#ffff00',
                    '#00ff00', '#00aaff', '#0000ff', '#7700ff'
                ];
                
                // Rainbow segmentlerini çiz
                for (let i = 0; i < 8; i++) {
                    const startAngle2 = (i * Math.PI / 4);
                    const endAngle2 = startAngle2 + (Math.PI / 4);
                    
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, rainbowRadius, startAngle2, endAngle2);
                    ctx.shadowColor = rainbowColors[i];
                    ctx.shadowBlur = 6;
                    ctx.lineWidth = Math.max(2, Math.round(iconSize * 0.06));
                    ctx.strokeStyle = rainbowColors[i];
                    ctx.stroke();
                }
                
                // Rainbow'un kenarına daire çerçeve ekle - oyundaki gibi
                ctx.beginPath();
                ctx.arc(centerX, centerY, rainbowRadius, 0, Math.PI * 2);
                ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                ctx.shadowBlur = 4;
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Beyaz/şeffaf daire
                ctx.stroke();
                
                ctx.restore();
            }
            
            // Barrel - oyundaki gibi çiz
            let angle = 0; // Sağa doğru
            const barrelLengths = {
                heavy: 0.6,
                rapid: 0.45,
                ice: 0.5,
                flame: 0.55,
                laser: 0.55,
                plasma: 0.65
            };
            const barrelLen = Math.max(8, Math.round(iconSize * (barrelLengths[towerType] || 0.5)));
            const barrelW = Math.max(3, Math.round(iconSize * 0.12));
            
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            ctx.fillStyle = '#111';
            ctx.fillRect(0, -barrelW/2, barrelLen, barrelW);
            ctx.fillStyle = neonStroke;
            ctx.fillRect(barrelLen - 4, -barrelW/3, 4, (barrelW/3)*2);
            ctx.restore();
            
            // CSS background ve border kaldır - sadece canvas kullanıyoruz
            iconElement.style.background = 'transparent';
            iconElement.style.backgroundImage = 'none';
            iconElement.style.border = 'none';
            
            // Parent tower-option'ın CSS stilleri artık kutulu görünüm için kullanılıyor
            // Bu yüzden burada override etmiyoruz - CSS'teki kutu stilleri geçerli olacak
            
            // Icon elementine canvas'ı ekle (mevcut içeriği temizle)
            iconElement.innerHTML = '';
            iconElement.appendChild(canvas);
            
            // Canvas stil ayarları - scale'e göre boyutlandır
            canvas.style.width = `${iconSize}px`;
            canvas.style.height = `${iconSize}px`;
            canvas.style.display = 'block';
            canvas.style.margin = '0 auto';
            
            // Icon element stil ayarları
            iconElement.style.width = `${iconSize}px`;
            iconElement.style.height = `${iconSize}px`;
            iconElement.style.borderRadius = '50%';
            iconElement.style.overflow = 'visible';
        });
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
        
        // Pathfinding uğursuz oldu - yalnız debug mode-da göstər
        if (this.debugMode) {
            this.debugLog(`Pathfinding failed after ${iterations} iterations (max: ${maxIterations})`, 'PATHFINDING');
            this.debugLog(`Open set size: ${open.size}, Closed set size: ${closed.size}`, 'PATHFINDING');
        }
        return null;
    }

    recomputePath() {
        // console.log(`\n=== YOL YENİDEN HESAPLANIYOR ===`);
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
            // console.log(`=== YOL BLOKE ===\n`);
        } else {
            this.debugSuccess(`Yol bulundu: ${this.path.length} düğüm`);
            // console.log(`=== YOL BULUNDU ===\n`); // Comment edildi - debug mode söndürülüb
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
                    // Qüllə üst-üstə düşür - yalnız debug mode-da göstər
                    if (this.debugMode) {
                        this.debugTower(`Position overlaps with existing tower ${i} at (${towerCol}, ${towerRow})`);
                        this.debugTower(`This means you're trying to place a new tower where one already exists!`);
                    }
                    return false;
                }
            }
            this.debugTower(`No overlap found with existing towers`);
        } else {
            this.debugTower(`Skipping overlap check for excluded tower (dragging existing tower)`);
        }
        
        // Don't allow placement on start or goal cells
        if (cellCol === this.startCell.col && cellRow === this.startCell.row) {
            // Başlanğıc hücrəyə yerləşdirmək olmaz - yalnız debug mode-da göstər
            if (this.debugMode) {
                this.debugTower(`Cannot place on start cell (${cellCol}, ${cellRow})`);
            }
            return false;
        }
        if (cellCol === this.goalCell.col && cellRow === this.goalCell.row) {
            // Bitiş hücrəyə yerləşdirmək olmaz - yalnız debug mode-da göstər
            if (this.debugMode) {
                this.debugTower(`Cannot place on goal cell (${cellCol}, ${cellRow})`);
            }
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
        
        // Yol tapılmadı - kule yerleşdirilməz - yalnız debug mode-da göstər
        if (this.debugMode) {
            this.debugTower(`YOL BAĞLANDI! Kule yerleşdirilə bilməz (${cellCol}, ${cellRow})`);
            this.debugTower(`Yolun açıq qalması üçün başqa yer seçin`);
        }
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
        // console.log(`\n=== KULE YERLEŞTİRME BAŞLADI ===`);
        const cost = this.towerCosts[this.selectedTowerType] || 0;
        const starCost = this.towerStarCosts[this.selectedTowerType] || 0;
        
        // Check if tower requires stars
        if (starCost > 0) {
            if (this.stars < starCost) {
                            const errorMsg = `Kifayət qədər ulduz yoxdur! Lazım: ${starCost}⭐, Mövcud: ${this.stars}⭐`;
                            this.debugError(errorMsg);
                            this.showTooltip(errorMsg, 'error');
                return;
            }
        } else {
            // Check money for regular towers
            if (this.gameState.money < cost) {
                            const errorMsg = `Kifayət qədər pul yoxdur! Lazım: $${cost}, Mövcud: $${this.gameState.money}`;
                            this.debugError(errorMsg);
                            this.showTooltip(errorMsg, 'error');
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
        
        // Plasma towers are placed normally (single tower), can be activated in pairs later
        
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
            healthUp: 0,
            awakened: false,
            shielded: false,
            // Avtomatik can yeniləmə - global settings-dən yoxla
            autoHealEnabled: (this.globalAutoHealSettings[this.selectedTowerType]?.enabled === true) ? true : false,
            autoHealThreshold: this.globalAutoHealSettings[this.selectedTowerType]?.threshold || 5,
            lastShot: 0,
            target: null,
            highlightUntil: Date.now() + 1200,
            // Plasma specific properties
            plasmaActivated: false, // Whether this plasma tower is activated in a pair
            plasmaPairId: null // ID of the pair if activated
        };
        
        this.debugTower(`Kule objesi oluşturuldu: ${JSON.stringify(tower)}`);
        
        // Store original state for rollback
        const originalTowers = [...this.towers];
        const originalMoney = this.gameState.money;
        const originalStars = this.stars;
        const originalPathLength = this.path.length;
        
        this.debugTower(`Orijinal durum - Kuleler: ${originalTowers.length}, Para: $${originalMoney}, Ulduz: ${originalStars}, Yol düğümleri: ${originalPathLength}`);
        
        // Place tower
        this.debugTower(`Kule dizisine ekleniyor...`);
        this.towers.push(tower);
        
        // Deduct cost (money or stars)
        if (starCost > 0) {
            this.changeCurrency(0, -starCost);
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
            this.stars = originalStars; // Ulduzları da geri qaytar
            localStorage.setItem('towerDefenseStars', this.stars.toString());
            this.recomputePath();
            this.updateUI();
            
            this.debugError(`Geri alma tamamlandı - Kuleler: ${this.towers.length}, Para: $${this.gameState.money}, Ulduz: ${this.stars}, Yol düğümleri: ${this.path.length}`);
            // console.log(`=== KULE YERLEŞTİRME BAŞARISIZ - YOL BAĞLANDI ===\n`);
            return;
        }
        
        this.debugSuccess(`Kule başarıyla yerleştirildi (${cellCol},${cellRow}) - Yol ${this.path.length} düğümle korundu`);
        this.debugSuccess(`OYUN KULE SİLMƏDİ - Kule yerleşdirildi və qaldı!`);
        this.updateUI();
        this.retargetEnemiesToNewPath && this.retargetEnemiesToNewPath();
        // console.log(`=== KULE YERLEŞTİRME BAŞARILI - OYUN SİLMƏDİ ===\n`);
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
        // Positioning rules: on mobile, center the menu with safe margins; on desktop, keep near tower
        const rect = this.canvas.getBoundingClientRect();
        const towerVX = rect.left + tower.x; // viewport relative
        const towerVY = rect.top + tower.y;

        const isMobile = (('ontouchstart' in window) || navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
        let left, top;

        ctx.style.display = 'flex';
        const mRect = ctx.getBoundingClientRect();
        ctx.style.display = 'none';
        const vw = window.innerWidth; const vh = window.innerHeight; const margin = 12;

        if (isMobile) {
            // Center with equal margins on all sides
            left = Math.max(margin, Math.round((vw - mRect.width) / 2));
            top = Math.max(margin, Math.round((vh - mRect.height) / 2));
        } else {
            // Default open to the right of the tower
            left = Math.round(towerVX + this.gridSize * 0.6);
            top = Math.round(towerVY - this.gridSize * 0.6);
            // Keep within viewport
            if (left + mRect.width > vw - margin) left = Math.round(towerVX - mRect.width - this.gridSize * 0.6);
            if (top + mRect.height > vh - margin) top = vh - mRect.height - margin;
            if (top < margin) top = margin;
        }

        ctx.style.left = `${left}px`;
        ctx.style.top = `${top}px`;
        ctx.style.position = 'fixed';
        ctx.style.zIndex = '100002'; /* Very high z-index to be above shop panel and tooltips */
        
        // Fill dynamic values and enable/disable
        // Upgrade button removed
        
        // Stats buttons
        const t = this.selectedTower;
        
        const btnSell = document.getElementById('ctxSell');
        if (btnSell && t) {
            const sellValue = Math.floor(this.towerCosts[t.type] / 3);
            btnSell.textContent = `🪙 Sell ($${sellValue})`;
            btnSell.disabled = false;
            
            // Event listener'ı her açılışta yeniden ekle (önceki listener'ları kaldır)
            // Önce mevcut listener'ları kaldır - yalnız ilk dəfə və ya ehtiyac olduqda
            let sellBtn = btnSell;
            if (!btnSell.hasAttribute('data-listener-added')) {
                const newSellBtn = btnSell.cloneNode(true);
                btnSell.parentNode.replaceChild(newSellBtn, btnSell);
                sellBtn = newSellBtn; // Yeni elementə işarə et
                sellBtn.setAttribute('data-listener-added', 'true');
            
                // Yeni butona event listener ekle
                sellBtn.addEventListener('click', (e) => {
                console.log('[SELL] 🖱️ ctxSell button clicked!', e);
                console.log('[SELL] Event details:', {
                    target: e.target,
                    currentTarget: e.currentTarget,
                    button: e.button,
                    type: e.type,
                    bubbles: e.bubbles
                });
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    console.log('[SELL] Calling sellTower()...');
                    this.sellTower();
                    console.log('[SELL] sellTower() completed, hiding context menu...');
                    this.hideTowerContext();
                } catch (error) {
                    console.error('[SELL] ❌ ERROR:', error);
                    alert(`Sell Xətası: ${error.message}`);
                }
                }, true); // capture phase'de dinle
                console.log('[SHOW-CTX] ✅ ctxSell event listener added');
            }
        } else {
            console.error('[SHOW-CTX] ERROR: ctxSell button not found or selectedTower is null');
            if (!btnSell) console.error('[SHOW-CTX] btnSell is null');
            if (!t) console.error('[SHOW-CTX] selectedTower is null');
            this.debugLog('ERROR: ctxSell button not found or selectedTower is null');
        }
        // Awaken əvvəl: radius və sürət limit 3, damage limit 3
        // Awaken sonrası: radius və sürət limit 3 (3/3), damage limit 8 (8/8)
        const rangeLimit = t.awakened ? 3 : 3; // Awaken-dən sonra da 3/3
        const damageLimit = t.awakened ? 8 : 3; // Awaken-dən sonra 8/8 (3 awaken əvvəl + 5 awaken sonrası)
        const rateLimit = t.awakened ? 3 : 3; // Awaken-dən sonra da 3/3
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
        const rangeCost = 50;
        // Awaken sonrası yüksəltmələr üçün: Her level'de maliyet 1.5x artır (50 * 1.5^(level-3))
        // Awaken əvvəl: Sabit 50 para
        const currentDamageUp = t.damageUp || 0;
        let damageCost = 50;
        if (t.awakened && currentDamageUp >= 3) {
            damageCost = Math.floor(50 * Math.pow(1.5, currentDamageUp - 3));
        }
        const rateCost = 50;
        const healBtn = document.getElementById('ctxHeal');
        const healCost = 20;
        const healthUpgradeBtn = document.getElementById('ctxHealthUpgrade');
        const healthUp = t.healthUp || 0;
        const healthUpgradeCost = Math.floor(50 * Math.pow(1.5, healthUp));
        const shieldBtn = document.getElementById('ctxShield');
        const shieldCost = 50;
        if (rVal) rVal.textContent = String(t.range);
        if (dVal) dVal.textContent = String(t.damage);
        if (fVal) fVal.textContent = `${Math.round(1000/ t.fireRate * 10)/10}/s`;
        if (rUp) rUp.textContent = `${t.rangeUp||0}/${rangeLimit}`;
        if (dUp) dUp.textContent = `${t.damageUp||0}/${damageLimit}`;
        if (fUp) fUp.textContent = `${t.rateUp||0}/${rateLimit}`;
        if (rCostEl) rCostEl.textContent = String(rangeCost);
        if (dCostEl) dCostEl.textContent = String(damageCost);
        if (fCostEl) fCostEl.textContent = String(rateCost);
        // Awaken olmuş kulelerde range ve rate yükseltmesi yapılamaz
        if (rangeBtn) rangeBtn.disabled = t.awakened || (t.rangeUp||0) >= rangeLimit || this.gameState.money < rangeCost;
        if (dmgBtn) dmgBtn.disabled = (t.damageUp||0) >= damageLimit || this.gameState.money < damageCost;
        if (rateBtn) rateBtn.disabled = t.awakened || (t.rateUp||0) >= rateLimit || this.gameState.money < rateCost;
        if (healBtn) {
            const currentHealth = Math.floor(t.health || t.maxHealth || 100);
            const maxHealth = t.maxHealth || 100;
            // Tam doldurmaq üçün pul hesabı: hər 100 can üçün 20 pul
            const maxHealCost = Math.floor((maxHealth / 100) * 20);
            healBtn.textContent = `🩹 ${currentHealth}/${maxHealth} — $${maxHealCost}`;
            healBtn.disabled = (t.health >= t.maxHealth) || this.gameState.money < maxHealCost;
        }
        if (healthUpgradeBtn) {
            const currentHealth = Math.floor(t.health || t.maxHealth || 100);
            const maxHealth = t.maxHealth || 100;
            healthUpgradeBtn.textContent = `❤️ Can: ${maxHealth} (+50) — $${healthUpgradeCost}`;
            healthUpgradeBtn.disabled = this.gameState.money < healthUpgradeCost;
        }
        if (shieldBtn) {
            // Qalxan aktivləşməsi: radius 3/3, atış gücü 8/8, sürət 3/3
            const canShield = t.awakened && (t.rangeUp||0) >= 3 && (t.damageUp||0) >= 8 && (t.rateUp||0) >= 3 && !t.shielded && this.diamonds >= shieldCost;
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
        
        // Plasma activate button (only for plasma towers that are not yet activated)
        const plasmaActivateBtn = document.getElementById('ctxPlasmaActivate');
        const plasmaDeactivateBtn = document.getElementById('ctxPlasmaDeactivate');
        if (plasmaActivateBtn) {
            if (t.type === 'plasma' && !t.plasmaActivated) {
                plasmaActivateBtn.style.display = 'flex';
                plasmaActivateBtn.disabled = false;
                plasmaActivateBtn.textContent = '⚡ Plazma Aktiv';
            } else {
                plasmaActivateBtn.style.display = 'none';
            }
        }
        if (plasmaDeactivateBtn) {
            if (t.type === 'plasma' && t.plasmaActivated) {
                plasmaDeactivateBtn.style.display = 'flex';
                plasmaDeactivateBtn.disabled = false;
                plasmaDeactivateBtn.textContent = '⚡ Plazma Söndür';
            } else {
                plasmaDeactivateBtn.style.display = 'none';
            }
        }
        
        // Avtomatik can yeniləmə düyməsi
        const autoHealToggleBtn = document.getElementById('ctxAutoHealToggle');
        const autoHealSettingsDiv = document.getElementById('ctxAutoHealSettings');
        const autoHealThresholdInput = document.getElementById('ctxAutoHealThreshold');
        if (autoHealToggleBtn) {
            if (t.autoHealEnabled) {
                autoHealToggleBtn.textContent = `🔄 Avto Can: Aktiv (${t.autoHealThreshold})`;
                autoHealToggleBtn.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
            } else {
                autoHealToggleBtn.textContent = '🔄 Avto Can: Kapalı';
                autoHealToggleBtn.style.background = 'linear-gradient(45deg, #4a90e2, #357abd)';
            }
            
            // Event listener'ı her açılışta yeniden ekle (önceki listener'ları kaldır)
            // Köhnə listener-ları silmək üçün clone et və əvəz et
            const newToggleBtn = autoHealToggleBtn.cloneNode(true);
            autoHealToggleBtn.parentNode.replaceChild(newToggleBtn, autoHealToggleBtn);
            
            // Yeni düyməyə event listener əlavə et
            newToggleBtn.addEventListener('click', (e) => {
                console.log('[AUTO-HEAL] 🖱️ ctxAutoHealToggle button clicked!', e);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                try {
                    console.log('[AUTO-HEAL] Calling toggleAutoHeal()...');
                    this.toggleAutoHeal();
                    console.log('[AUTO-HEAL] toggleAutoHeal() completed');
                } catch (error) {
                    console.error('[AUTO-HEAL] ❌ ERROR:', error);
                    alert(`Auto-Heal Toggle Xətası: ${error.message}`);
                }
            }, false); // Bubble phase (capture deyil, ki context menu listener-ına mane olmasın)
            console.log('[SHOW-CTX] ✅ ctxAutoHealToggle event listener added');
        }
        if (autoHealSettingsDiv) {
            autoHealSettingsDiv.style.display = t.autoHealEnabled ? 'flex' : 'none';
        }
        if (autoHealThresholdInput) {
            // Həmişə threshold dəyərini göstər (varsa və ya default 5)
            // Maksimum limiti qüllənin maxHealth-inə görə təyin et
            const maxThreshold = t.maxHealth || 100;
            
            // Input-u tam yenidən yarat (max atributunu məcburi yeniləmək üçün)
            const parent = autoHealThresholdInput.parentElement;
            const oldValue = autoHealThresholdInput.value;
            const newInput = document.createElement('input');
            newInput.type = 'number';
            newInput.id = 'ctxAutoHealThreshold';
            newInput.min = '1';
            newInput.max = maxThreshold.toString();
            newInput.value = Math.min(Math.max(1, t.autoHealThreshold || parseInt(oldValue) || 5), maxThreshold).toString();
            newInput.style.cssText = 'width:60px; padding:4px; background:rgba(0,0,0,0.5); border:1px solid #00bcd4; border-radius:4px; color:#fff; font-size:12px;';
            
            // Köhnə input-u yeni ilə əvəz et
            if (parent && autoHealThresholdInput.parentElement) {
                parent.replaceChild(newInput, autoHealThresholdInput);
            }
            
            // Label-i sil (artıq lazım deyil)
            const parentDiv = newInput.parentElement;
            const thresholdLabel = parentDiv?.querySelector('.threshold-label');
            if (thresholdLabel) {
                thresholdLabel.remove();
            }
            
            // Təsdiq düyməsinin mətnini yenilə: "100 (min:) Təsdiq"
            const confirmButton = parentDiv?.querySelector('#ctxAutoHealConfirm');
            if (confirmButton) {
                const thresholdValue = newInput.value || Math.min(t.autoHealThreshold || 5, maxThreshold);
                confirmButton.textContent = `${thresholdValue} (min:) Təsdiq`;
                
                // Input dəyəri dəyişəndə düymə mətnini yenilə
                newInput.addEventListener('input', () => {
                    const value = newInput.value || Math.min(t.autoHealThreshold || 5, maxThreshold);
                    confirmButton.textContent = `${value} (min:) Təsdiq`;
                });
            }
        }
        
        // Auto-heal confirm butonu
        const autoHealConfirmBtn = document.getElementById('ctxAutoHealConfirm');
        if (autoHealConfirmBtn) {
            // Event listener'ı her açılışta yeniden ekle (köhnə listener-ları silmək üçün)
            const newConfirmBtn = autoHealConfirmBtn.cloneNode(true);
            autoHealConfirmBtn.parentNode.replaceChild(newConfirmBtn, autoHealConfirmBtn);
            
            // Yeni düyməyə event listener əlavə et
            newConfirmBtn.addEventListener('click', (e) => {
                console.log('[AUTO-HEAL] 🖱️ ctxAutoHealConfirm button clicked!', e);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                try {
                    console.log('[AUTO-HEAL] Calling confirmAutoHeal()...');
                    this.confirmAutoHeal();
                    console.log('[AUTO-HEAL] confirmAutoHeal() completed');
                } catch (error) {
                    console.error('[AUTO-HEAL] ❌ ERROR:', error);
                    alert(`Auto-Heal Confirm Xətası: ${error.message}`);
                }
            }, false); // Bubble phase (capture deyil, ki context menu listener-ına mane olmasın)
            console.log('[SHOW-CTX] ✅ ctxAutoHealConfirm event listener added');
        }
        
        // Context menu listener-ını tamamilə sil - button-lar öz event-ləri ilə işləməlidir
        // Context menu-dəki button-ların stopPropagation-i kifayətdir
        
        ctx.style.display = 'flex';
        this.debugLog(`Context menu shown at (${left}, ${top}) for tower at (${tower.x}, ${tower.y})`);
    }

    hideTowerContext() {
        const ctx = document.getElementById('towerContext');
        if (ctx) {
            ctx.style.display = 'none';
            // console.log('[towerContext] hidden');
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
        
        // Awaken olmuş kulelerde range yükseltmesi yapılamaz
        if (t.awakened) return;
        
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
        
        // Awaken əvvəl: maksimum 3 yüksəltmə
        // Awaken sonrası: maksimum 5 yüksəltmə (toplam 8)
        if (!t.awakened && (t.damageUp || 0) >= 3) return;
        if (t.awakened && (t.damageUp || 0) >= 8) return;
        
        const currentDamageUp = t.damageUp || 0;
        
        // Awaken sonrası yüksəltmələr üçün: Her level'de maliyet 1.5x artır (50 * 1.5^(level-3))
        // Awaken əvvəl: Sabit 50 para
        // Awaken sonrası: 50 * 1.5^(currentDamageUp - 3)
        let cost = 50;
        if (t.awakened && currentDamageUp >= 3) {
            cost = Math.floor(50 * Math.pow(1.5, currentDamageUp - 3));
        }
        
        if (this.gameState.money < cost) return;
        
        t.damageUp = currentDamageUp + 1;
        
        // Awaken əvvəl: Mevcut %20 artış (%1.2x)
        // Awaken sonrası: Hər yüksəltmə sabit 32 damage əlavə edir (toplam 200 olmaq üçün)
        if (t.awakened && currentDamageUp >= 3) {
            // Awaken sonrası: hər yüksəltmə +32 damage
            // Awaken zamanı damage ~34 olur, sonra 5 yüksəltmə: 34 + 5*32 = 194 ≈ 200
            // Daha dəqiq: awaken zamanı damage * 1.2 olur, yəni ~34 * 1.2 = 40.8
            // Sonra 5 yüksəltmə: 40.8 + 5*32 = 200.8 ≈ 200
            const baseDamageAfterAwaken = this.getTowerDamage(t.type);
            // İlk 3 yüksəltmə damage-ini hesabla (awaken əvvəl)
            let damageAfterFirst3 = baseDamageAfterAwaken;
            for (let i = 0; i < 3; i++) {
                damageAfterFirst3 = Math.floor(damageAfterFirst3 * 1.2);
            }
            // Awaken zamanı damage * 1.2 olur
            const damageAfterAwaken = Math.floor(damageAfterFirst3 * 1.2);
            // Awaken sonrası yüksəltmələr: hər biri +32 damage
            // currentDamageUp = 3 olduqda, bu awaken əvvəl 3-cü yüksəltmədir, amma awaken sonrası yüksəltmə edirik
            // currentDamageUp = 4, 5, 6, 7, 8 (awaken sonrası)
            // currentDamageUp = 3 olduqda, awaken sonrası ilk yüksəltmədir, yəni awakenUpgrades = 1
            const awakenUpgrades = currentDamageUp - 2; // 3->1, 4->2, 5->3, 6->4, 7->5, 8->6
            t.damage = damageAfterAwaken + (awakenUpgrades * 32);
        } else {
            t.damage = Math.floor(t.damage * 1.2);
        }
        
        this.gameState.money -= cost;
        this.updateUI();
        this.showTowerContextAt(t);
    }

    upgradeFireRate() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        
        // Awaken olmuş kulelerde fire rate yükseltmesi yapılamaz
        if (t.awakened) return;
        
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
        this.changeCurrency(-diamondCost, 0);
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
        const t = this.selectedTower;
        // Tam doldurmaq üçün pul hesabı: hər 100 can üçün 20 pul
        const maxHealth = t.maxHealth || 100;
        const cost = Math.floor((maxHealth / 100) * 20);
        if (this.gameState.money < cost) return;
        t.health = maxHealth;
        this.gameState.money -= cost;
        this.updateUI();
        this.showTowerContextAt(t);
    }

    upgradeHealth() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        const healthUp = t.healthUp || 0;
        
        // Her yükseltme için maliyet: 50 * 1.5^(level-1)
        const cost = Math.floor(50 * Math.pow(1.5, healthUp));
        
        if (this.gameState.money < cost) return;
        
        // Can artır: Her yükseltme için +50 can
        t.maxHealth = (t.maxHealth || 100) + 50;
        t.health += 50; // Mevcut canı da artır
        t.healthUp = healthUp + 1;
        
        this.gameState.money -= cost;
        this.updateUI();
        this.showTowerContextAt(t);
    }
    
    toggleAutoHeal() {
        console.log('[AUTO-HEAL] ⚡ toggleAutoHeal() called');
        
        if (!this.selectedTower) {
            console.error('[AUTO-HEAL] ❌ Seçili kule yok!');
            alert('❌ Seçili kule yok! Lütfen önce bir kule seçin.');
            return;
        }
        
        const t = this.selectedTower;
        const oldState = t.autoHealEnabled || false;
        t.autoHealEnabled = !oldState;
        
        console.log(`[AUTO-HEAL] ✅ Auto-heal durumu değişti: ${oldState} -> ${t.autoHealEnabled}`);
        
        // Əgər aktiv edilirsə, settings-i göstər
        const autoHealSettingsDiv = document.getElementById('ctxAutoHealSettings');
        if (autoHealSettingsDiv) {
            autoHealSettingsDiv.style.display = t.autoHealEnabled ? 'flex' : 'none';
            console.log(`[AUTO-HEAL] Settings div display: ${autoHealSettingsDiv.style.display}`);
        } else {
            console.error('[AUTO-HEAL] ❌ ctxAutoHealSettings element bulunamadı!');
            alert('❌ ctxAutoHealSettings element bulunamadı!');
        }
        
        // Əgər deaktiv edilirsə, threshold-u sıfırlama
        if (!t.autoHealEnabled) {
            t.autoHealThreshold = 5;
            console.log('[AUTO-HEAL] Auto-heal deaktif, threshold = 5 olarak sıfırlandı');
        }
        
        this.showTowerContextAt(t);
        console.log(`[AUTO-HEAL] ✅✅✅ Auto-heal toggle tamamlandı: ${t.autoHealEnabled}`);
    }
    
    confirmAutoHeal() {
        console.log('[AUTO-HEAL] ⚡ confirmAutoHeal() called');
        
        if (!this.selectedTower) {
            console.error('[AUTO-HEAL] ❌ confirmAutoHeal: Seçili kule yok!');
            this.showTooltip('❌ Seçili kule yok!', 'error');
            return;
        }
        
        const thresholdInput = document.getElementById('ctxAutoHealThreshold');
        if (!thresholdInput) {
            console.error('[AUTO-HEAL] ❌ ctxAutoHealThreshold input bulunamadı!');
            this.showTooltip('❌ Threshold input bulunamadı!', 'error');
            return;
        }
        
        const threshold = parseInt(thresholdInput.value) || 5;
        console.log(`[AUTO-HEAL] Threshold değeri: ${threshold}`);
        
        const t = this.selectedTower;
        
        // Limit yoxlaması: minimum 1, maksimum qüllənin maxHealth-i
        if (threshold < 1) {
            console.error(`[AUTO-HEAL] ❌ Geçersiz threshold: ${threshold}`);
            this.showTooltip('Can dəyəri minimum 1 olmalıdır!', 'error');
            return;
        }
        
        const maxThreshold = t.maxHealth || 100;
        if (threshold > maxThreshold) {
            console.error(`[AUTO-HEAL] ❌ Geçersiz threshold: ${threshold}, max: ${maxThreshold}`);
            this.showTooltip(`Can dəyəri maksimum ${maxThreshold} olmalıdır!`, 'error');
            return;
        }
        const oldThreshold = t.autoHealThreshold || 5;
        t.autoHealThreshold = threshold;
        t.autoHealEnabled = true;
        
        console.log(`[AUTO-HEAL] ✅ Threshold güncellendi: ${oldThreshold} -> ${threshold}`);
        console.log(`[AUTO-HEAL] ✅ Tower ${t.type} at (${t.x}, ${t.y}) auto-heal activated: threshold=${threshold}`);
        
        // Settings-i gizlət
        const autoHealSettingsDiv = document.getElementById('ctxAutoHealSettings');
        if (autoHealSettingsDiv) {
            autoHealSettingsDiv.style.display = 'none';
        }
        
        // Context menu-nu yenilə
        this.showTowerContextAt(t);
        
        // Success mesajı
        this.showTooltip(`✅ Avto-can aktiv edildi! Can dəyəri: ${threshold}`, 'success', 2000);
        console.log(`[AUTO-HEAL] ✅✅✅ confirmAutoHeal tamamlandı: threshold=${threshold}`);
    }
    
    showGlobalAutoHealPanel() {
        console.log('[AUTO-HEAL] ⚡ showGlobalAutoHealPanel() called');
        const panel = document.getElementById('globalAutoHealPanel');
        if (!panel) {
            console.error('[AUTO-HEAL] ❌ globalAutoHealPanel NOT FOUND!');
            return;
        }
        
        // Paneli göstər/gizlət
        const isVisible = panel.style.display !== 'none' && panel.style.display !== '';
        panel.style.display = isVisible ? 'none' : 'flex';
        
        console.log(`[AUTO-HEAL] Panel visibility: ${isVisible ? 'hidden' : 'visible'}`);
        
        if (!isVisible) {
            // Paneli göstər, qüllələri yüklə
            this.updateGlobalAutoHealTowersList();
            
            // Global auto-heal threshold input-u və label-i yenilə
            const thresholdInput = document.getElementById('globalAutoHealThreshold');
            const thresholdLabel = panel.querySelector('label');
            
            if (thresholdInput && this.towers.length > 0) {
                // Ən böyük qüllənin maxHealth-ini tap
                const maxHealth = Math.max(...this.towers.map(t => t.maxHealth || 100));
                
                // Input-u yenilə
                thresholdInput.removeAttribute('max');
                thresholdInput.setAttribute('max', maxHealth.toString());
                thresholdInput.max = maxHealth;
                
                // Label-i yenilə
                if (thresholdLabel) {
                    thresholdLabel.textContent = `Can Dəyəri (1-${maxHealth})`;
                }
            }
        }
    }
    
    updateGlobalAutoHealTowersList() {
        const towersList = document.getElementById('globalAutoHealTowersList');
        if (!towersList) return;
        
        // Siyahını təmizlə
        towersList.innerHTML = '';
        
        if (this.towers.length === 0) {
            towersList.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center; padding: 10px;">Oyunda qüllə yoxdur</div>';
            return;
        }
        
        // Qüllə tiplərinə görə qruplaşdır
        const towerGroups = {};
        this.towers.forEach(tower => {
            if (!towerGroups[tower.type]) {
                towerGroups[tower.type] = {
                    count: 0,
                    anyEnabled: false,
                    towers: []
                };
            }
            towerGroups[tower.type].count++;
            towerGroups[tower.type].towers.push(tower);
            if (tower.autoHealEnabled) {
                towerGroups[tower.type].anyEnabled = true;
            }
        });
        
        const towerTypeNames = {
            basic: 'Əsas Qüllə',
            rapid: 'Sürətli Qüllə',
            heavy: 'Ağır Qüllə',
            ice: 'Buz Qülləsi',
            flame: 'Alov Qülləsi',
            laser: 'Lazer Qülləsi',
            plasma: 'Plazma Qülləsi'
        };
        
        // Hər qüllə tipi üçün bir checkbox yarad
        Object.keys(towerGroups).forEach(towerType => {
            const group = towerGroups[towerType];
            const towerDiv = document.createElement('div');
            towerDiv.style.display = 'flex';
            towerDiv.style.alignItems = 'center';
            towerDiv.style.gap = '8px';
            towerDiv.style.padding = '8px';
            towerDiv.style.background = 'rgba(255,255,255,0.03)';
            towerDiv.style.borderRadius = '4px';
            towerDiv.style.border = '1px solid rgba(255,255,255,0.1)';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `towerTypeAutoHeal_${towerType}`;
            checkbox.dataset.towerType = towerType; // Qüllə tipini saxla
            checkbox.checked = group.anyEnabled; // Əgər hər hansı biri aktivdirsə, checkbox seçilir
            checkbox.style.width = '16px';
            checkbox.style.height = '16px';
            checkbox.style.accentColor = '#4a90e2';
            checkbox.style.cursor = 'pointer';
            
            const label = document.createElement('label');
            label.htmlFor = `towerTypeAutoHeal_${towerType}`;
            label.style.color = '#fff';
            label.style.fontSize = '12px';
            label.style.cursor = 'pointer';
            label.style.flex = '1';
            label.style.display = 'flex';
            label.style.justifyContent = 'space-between';
            label.style.alignItems = 'center';
            
            const towerName = towerTypeNames[towerType] || towerType;
            label.innerHTML = `
                <span>${towerName}</span>
                <span style="color: #9cc9ff; font-size: 11px; font-weight: bold;">${group.count} ədəd</span>
            `;
            
            towerDiv.appendChild(checkbox);
            towerDiv.appendChild(label);
            towersList.appendChild(towerDiv);
        });
    }
    
    selectAllTowersForAutoHeal() {
        // Bütün qüllə tipi checkbox-larını tap və seç
        const checkboxes = document.querySelectorAll('[id^="towerTypeAutoHeal_"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
    }
    
    deselectAllTowersForAutoHeal() {
        // Bütün qüllə tipi checkbox-larını tap və seçimini ləğv et
        const checkboxes = document.querySelectorAll('[id^="towerTypeAutoHeal_"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    confirmGlobalAutoHeal() {
        console.log('[AUTO-HEAL] ⚡ confirmGlobalAutoHeal() called');
        const thresholdInput = document.getElementById('globalAutoHealThreshold');
        if (!thresholdInput) {
            console.error('[AUTO-HEAL] ❌ globalAutoHealThreshold input NOT FOUND!');
            return;
        }
        
        const threshold = parseInt(thresholdInput.value) || 5;
        console.log(`[AUTO-HEAL] Threshold value: ${threshold}`);
        
        // Ən böyük qüllənin maxHealth-ini tap
        let maxThreshold = 100;
        if (this.towers.length > 0) {
            const maxHealth = Math.max(...this.towers.map(t => t.maxHealth || 100));
            maxThreshold = maxHealth;
        }
        
        if (threshold < 1 || threshold > maxThreshold) {
            this.showTooltip(`Can dəyəri 1-${maxThreshold} arasında olmalıdır!`, 'error');
            return;
        }
        
        let activatedCount = 0;
        const selectedTypes = [];
        
        // Seçilən qüllə tiplərini tap
        const checkboxes = document.querySelectorAll('[id^="towerTypeAutoHeal_"]');
        console.log(`[AUTO-HEAL] Found ${checkboxes.length} checkboxes`);
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const towerType = checkbox.dataset.towerType;
                if (towerType) {
                    selectedTypes.push(towerType);
                    console.log(`[AUTO-HEAL] Selected tower type: ${towerType}`);
                }
            }
        });
        
        // Əgər heç bir qüllə tipi seçilməyibsə, bütün qüllələrin can yeniləməsini deaktiv et
        if (selectedTypes.length === 0) {
            console.log('[AUTO-HEAL] ❌ No tower types selected - deactivating all auto-heal');
            // Bütün qüllələrin auto-heal-ini deaktiv et
            this.towers.forEach(tower => {
                tower.autoHealEnabled = false;
                tower.autoHealThreshold = null;
            });
            // Global auto-heal settings-i təmizlə
            this.globalAutoHealSettings = {};
            
            // Paneli gizlət
            const panel = document.getElementById('globalAutoHealPanel');
            if (panel) {
                panel.style.display = 'none';
            }
            
            // UI-u yenilə
            this.updateUI();
            this.showTooltip('Bütün qüllələrin avtomatik can yeniləməsi deaktiv edildi!', 'info');
            return;
        }
        
        // Global auto-heal settings-i saxla
        selectedTypes.forEach(towerType => {
            this.globalAutoHealSettings[towerType] = {
                enabled: true,
                threshold: threshold
            };
            console.log(`[AUTO-HEAL] ✅ Enabled auto-heal for type: ${towerType}, threshold: ${threshold}`);
        });
        
        // Seçilən tiplərdə olan bütün qüllələrə avtomatik can yeniləməni aktiv et
        this.towers.forEach(tower => {
            if (selectedTypes.includes(tower.type)) {
                tower.autoHealEnabled = true;
                tower.autoHealThreshold = threshold;
                activatedCount++;
                console.log(`[AUTO-HEAL] ✅ Activated auto-heal for tower ${tower.type} at (${tower.x}, ${tower.y}), health: ${tower.health}/${tower.maxHealth}, threshold: ${threshold}`);
            }
        });
        
        console.log(`[AUTO-HEAL] ✅✅✅ Total ${activatedCount} towers activated with auto-heal`);
        
        // Paneli gizlət
        const panel = document.getElementById('globalAutoHealPanel');
        if (panel) {
            panel.style.display = 'none';
        }
        
        // UI-u yenilə
        this.updateUI();
        
        const towerTypeNames = {
            basic: 'Əsas Qüllə',
            rapid: 'Sürətli Qüllə',
            heavy: 'Ağır Qüllə',
            ice: 'Buz Qülləsi',
            flame: 'Alov Qülləsi',
            laser: 'Lazer Qülləsi',
            plasma: 'Plazma Qülləsi'
        };
        
        const typeNames = selectedTypes.map(t => towerTypeNames[t] || t).join(', ');
        this.showTooltip(`${activatedCount} qüllədə avtomatik can yeniləmə aktiv edildi!\nTip: ${typeNames}\nCan dəyəri: ${threshold}`, 'success', 4000);
    }

    shieldTower() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (!t.awakened) return;
        // Qalxan aktivləşməsi: radius 3/3, atış gücü 8/8, sürət 3/3
        const eligible = (t.rangeUp||0) >= 3 && (t.damageUp||0) >= 8 && (t.rateUp||0) >= 3;
        if (!eligible || t.shielded) return;
        const diamondCost = 50;
        if (this.diamonds < diamondCost) return;
        this.changeCurrency(-diamondCost, 0);
        t.shielded = true;
        this.updateUI();
        this.showTowerContextAt(t);
    }
    
    startPlasmaPairing() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (t.type !== 'plasma' || t.plasmaActivated) return;
        
        // Enter pairing mode
        this.plasmaPairingMode = true;
        this.plasmaPairingTower = t;
        this.hideTowerContext();
        
        this.debugSuccess(`Plazma cütləşdirmə rejimi aktivdir. İkinci qülləni seçin.`);
        this.debugLog(`Seçilmiş qüllə: (${t.x}, ${t.y})`);
    }
    
    activatePlasma() {
        if (!this.selectedTower || !this.plasmaPairingTower) return;
        
        const tower1 = this.plasmaPairingTower;
        const tower2 = this.selectedTower;
        
        if (tower1 === tower2) {
            this.debugError(`Eyni qüllə seçildi!`);
            this.cancelPlasmaPairing();
            return;
        }
        
        if (tower2.type !== 'plasma' || tower2.plasmaActivated) {
            this.debugError(`İkinci qüllə plazma deyil və ya artıq aktivdir!`);
            this.cancelPlasmaPairing();
            return;
        }
        
        // Activate the pair
        if (this.activatePlasmaPair(tower1, tower2)) {
            this.cancelPlasmaPairing();
            this.updateUI();
        } else {
            this.cancelPlasmaPairing();
        }
    }
    
    cancelPlasmaPairing() {
        this.plasmaPairingMode = false;
        this.plasmaPairingTower = null;
    }
    
    deactivatePlasma() {
        if (!this.selectedTower) return;
        const t = this.selectedTower;
        if (t.type !== 'plasma' || !t.plasmaActivated) return;
        
        // Find the paired tower
        const pairedTower = this.towers.find(tower => 
            tower.type === 'plasma' &&
            tower.plasmaActivated &&
            tower !== t &&
            tower.plasmaPairId === t.plasmaPairId
        );
        
        if (pairedTower) {
            // Deactivate both towers
            t.plasmaActivated = false;
            t.plasmaPairId = null;
            t.side = null;
            
            pairedTower.plasmaActivated = false;
            pairedTower.plasmaPairId = null;
            pairedTower.side = null;
            
            this.debugSuccess(`Plazma cütlüyü söndürüldü`);
        } else {
            // Just deactivate this tower
            t.plasmaActivated = false;
            t.plasmaPairId = null;
            t.side = null;
            this.debugSuccess(`Plazma qülləsi söndürüldü`);
        }
        
        this.hideTowerContext();
        this.updateUI();
    }
    
    sellTower() {
        console.log('[SELL] ⚡ sellTower() called');
        console.log(`[SELL] selectedTower: ${this.selectedTower ? this.selectedTower.type : 'null'}`);
        console.log(`[SELL] towers array length: ${this.towers.length}`);
        
        if (!this.selectedTower) {
            console.error('[SELL] ❌ Kule satılamıyor: Seçili kule yok');
            this.showTooltip('❌ Seçili kule yok!', 'error');
            alert('❌ Seçili kule yok! Lütfen önce bir kule seçin.');
            return;
        }
        
        const tower = this.selectedTower;
        console.log(`[SELL] ✅ Seçili kule: ${tower.type} (${tower.x}, ${tower.y})`);
        
        // Calculate sell value as 1/3 of original cost
        const originalCost = this.towerCosts[tower.type];
        console.log(`[SELL] towerCosts[${tower.type}] = ${originalCost}`);
        
        if (originalCost === undefined || originalCost === null) {
            console.error(`[SELL] ❌ Kule tipi maliyet tablosunda bulunamadı: ${tower.type}`);
            this.showTooltip(`❌ Kule tipi bulunamadı: ${tower.type}`, 'error');
            alert(`❌ Kule tipi bulunamadı: ${tower.type}\n\ntowerCosts: ${JSON.stringify(this.towerCosts)}`);
            return;
        }
        
        const sellValue = Math.floor(originalCost / 3);
        console.log(`[SELL] Orijinal maliyet: $${originalCost}, Satış değeri: $${sellValue}`);
        console.log(`[SELL] Satış öncesi - Para: $${this.gameState.money}, Kuleler: ${this.towers.length}`);
        
        const index = this.towers.indexOf(tower);
        if (index === -1) {
            console.error('[SELL] ❌ Kule kule dizisinde bulunamadı!');
            this.showTooltip('❌ Kule dizisinde bulunamadı!', 'error');
            alert('❌ Kule dizisinde bulunamadı!');
            return;
        }
        
        console.log(`[SELL] ✅ Kule dizisinde bulundu (index: ${index}), siliniyor...`);
        
        this.gameState.money += sellValue;
        this.gameState.score += sellValue;
        this.towers.splice(index, 1);
        
        console.log(`[SELL] ✅✅✅ Kule başarıyla satıldı - Para: $${this.gameState.money}, Kuleler: ${this.towers.length}`);
        this.showTooltip(`✅ Kule satıldı: +$${sellValue}`, 'success');
        
        this.deselectTower();
        this.updateUI();
        this.recomputePath();
        if (this.retargetEnemiesToNewPath) {
            this.retargetEnemiesToNewPath();
        }
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
        const baseDamage = damages[type] || 20;
        
        // Mağaza yüksəltmələrini əlavə et (yalnız pul ilə alınan qüllələr üçün)
        if (this.towerShopUpgrades && this.towerShopUpgrades[type]) {
            return baseDamage + this.towerShopUpgrades[type].damage;
        }
        
        return baseDamage;
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
        const baseRate = rates[type] || 1000;
        
        // Mağaza yüksəltmələrini əlavə et (yalnız pul ilə alınan qüllələr üçün)
        // Atəş sürətini artırmaq = fireRate-i azaltmaq deməkdir
        if (this.towerShopUpgrades && this.towerShopUpgrades[type]) {
            const rateBonus = this.towerShopUpgrades[type].fireRate; // Məsələn, 100 ms azaltmaq
            return Math.max(100, baseRate - rateBonus * 50); // Hər yüksəltmə 50 ms azaldır, minimum 100 ms
        }
        
        return baseRate;
    }
    
    startWave() {
        if (this.waveInProgress || this.gameState.gameOver || this.isPaused) return;
        
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
    
    pauseGame() {
        if (this.isPaused || this.gameState.gameOver) return;
        
        this.isPaused = true;
        this.pauseStartTime = Date.now();
        
        // Update UI buttons
        const pauseBtn = document.getElementById('pauseGame');
        const resumeBtn = document.getElementById('resumeGame');
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'block';
        
        // Sətir və sütun artırma düymələrini aktivləşdir (updateUI çağırılır)
        this.updateUI();
        
        this.showTooltip('⏸️ Oyun dayandırıldı', 'info', 2000);
    }
    
    resumeGame() {
        if (!this.isPaused) return;
        
        // Calculate paused time and add to total
        if (this.pauseStartTime) {
            const pausedTime = Date.now() - this.pauseStartTime;
            this.totalPausedTime += pausedTime;
            this.pauseStartTime = null;
        }
        
        this.isPaused = false;
        
        // Update last update time to prevent jump
        this.lastUpdateTime = Date.now();
        
        // Update UI buttons
        const pauseBtn = document.getElementById('pauseGame');
        const resumeBtn = document.getElementById('resumeGame');
        if (pauseBtn) pauseBtn.style.display = 'block';
        if (resumeBtn) resumeBtn.style.display = 'none';
        
        // Sətir və sütun artırma düymələrini yenilə (updateUI çağırılır)
        this.updateUI();
        
        this.showTooltip('▶️ Oyun davam edir', 'success', 2000);
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
        const baseSpeeds = { basic: 0.5, fast: 1, tank: 0.25, boss: 0.4 }; // Base sürətlər azaldıldı
        const baseSpeed = baseSpeeds[type] || 0.5;
        
        // Hər level üçün 10% sürət artır
        const levelMultiplier = 1 + (this.currentLevel - 1) * 0.1;
        const finalSpeed = baseSpeed * levelMultiplier;
        
        // Scale speed modestly with current scale to keep pacing consistent
        return finalSpeed * Math.max(0.75, Math.min(2, this.scale));
    }

    getEnemyDamage(type, enemyLevel = null) {
        // Base damage-lər
        const dmg = { basic: 2, fast: 1, tank: 3, boss: 5 };
        let baseDamage = dmg[type] || 2;
        
        // Əgər enemyLevel verilmişdirsə, onu istifadə et, yoxsa currentLevel-i istifadə et
        const level = enemyLevel !== null ? enemyLevel : (this.currentLevel || 1);
        
        // 10-cu level-a qədər minimum 4 atış gücü
        // 10-cu level-dən sonra hər level üçün atış gücü +1 artır
        // Məsələn: 10-cu level-a qədər = 4, 11-ci level = 5, 12-ci level = 6, 57-ci level = 51
        if (level <= 10) {
            // 10-cu level-a qədər minimum 4 olmalıdır
            baseDamage = Math.max(baseDamage, 4);
        } else {
            // 11-ci level-dən sonra hər level üçün +1 bonus
            // 10-cu level-də base = 4, sonra hər level-də +1
            const bonus = level - 10; // 10-cu level-dən sonra neçə level keçib
            baseDamage = Math.max(baseDamage, 4) + bonus;
        }
        
        return baseDamage;
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
        if (this.gameState.gameOver) {
            return;
        }
        
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
                    this.enemiesKilledThisGame++; // Track killed enemies
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
                const damage = this.getEnemyDamage(enemy.type, enemy.level);
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
                // console.log(`[⚔️ HÜCUM] ${enemyNames[enemy.type]} L${enemy.level} qülləyə ${damage} zərər verdi! Qüllə canı: ${oldHealth}/${nearestTower.maxHealth || 100} -> ${nearestTower.health}/${nearestTower.maxHealth || 100}`);
                if (this.debugMode) {
                    this.debugLog(`⚔️ ${enemyNames[enemy.type]} L${enemy.level} qülləyə ${damage} zərər verdi! Qüllə canı: ${oldHealth} -> ${nearestTower.health}`);
                }
                
                if (nearestTower.health <= 0) {
                    const idx = this.towers.indexOf(nearestTower);
                    if (idx !== -1) {
                        this.towers.splice(idx, 1);
                        // console.log(`[💥 MƏHV] Qüllə məhv edildi!`);
                        this.debugLog(`💥 Qüllə məhv edildi!`);
                        this.recomputePath();
                    }
                }
                }
                enemy.nextAttackAt = Date.now() + 1000; // 1s cooldown between attacks
                // Continue moving while attacking (don't stop)
            }
            
            // Check for plasma lasers (plasma towers create lasers between left and right towers)
            // Initialize enemy laser hit tracking
            if (!enemy.hitLasers) {
                enemy.hitLasers = new Set(); // Track which lasers this enemy has already hit
            }
            
            // Get all plasma tower pairs and check their lasers
            const plasmaPairs = this.getPlasmaTowerPairs();
            const enemyRadius = enemy.radius || this.gridSize * 0.3;
            const laserWidth = Math.max(3, Math.round(this.gridSize * 0.1));
            
            for (const pair of plasmaPairs) {
                const leftTower = pair.left;
                const rightTower = pair.right;
                
                // Only process activated pairs
                if (!leftTower.plasmaActivated || !rightTower.plasmaActivated) continue;
                
                // Generate lasers between towers (same as drawing function)
                const lasers = this.generateLasersBetweenTowers(leftTower, rightTower);
                
                // Check each laser
                for (let laserIndex = 0; laserIndex < lasers.length; laserIndex++) {
                    const laser = lasers[laserIndex];
                    
                    // Create unique laser ID (pair ID + laser index)
                    const laserId = `pair_${leftTower.plasmaPairId}_laser_${laserIndex}`;
                    
                    // Check if enemy is touching this laser line
                    const distToLaser = this.pointToLineDistance(
                        enemy.x, enemy.y,
                        laser.start.x, laser.start.y,
                        laser.end.x, laser.end.y
                    );
                    
                    if (distToLaser < enemyRadius + laserWidth) {
                        // Enemy is touching laser - apply full damage once per laser
                        if (!enemy.hitLasers.has(laserId)) {
                            // Enemy touches this laser for the first time - apply full damage
                            const fullDamage = leftTower.damage; // Full tower damage (60)
                            enemy.health -= fullDamage;
                            enemy.hitLasers.add(laserId); // Mark this laser as hit
                            
                            // console.log(`[⚡ PLASMA LAZER] Düşmən ${laserId} lazere toxundu! ${fullDamage} zərər aldı! Qalan can: ${enemy.health}`);
                            
                            if (enemy.health <= 0) {
                                // Enemy died from laser
                                this.gameState.money += enemy.reward;
                                this.gameState.score += enemy.reward * 2;
                                this.enemiesKilledThisGame++; // Track killed enemies
                                const index = this.enemies.indexOf(enemy);
                                if (index !== -1) {
                                    this.enemies.splice(index, 1);
                                    this.updateUI();
                                }
                                break; // Enemy died, stop checking other lasers
                            }
                        }
                        break; // Enemy is already touching a laser from this pair, no need to check others
                    }
                }
                if (enemy.health <= 0) break; // Enemy died, stop checking other pairs
            }
            if (enemy.health <= 0) continue; // Enemy died, skip remaining logic
            
            // Move enemy along dynamic path (enemies attack while moving)
            enemy.pathIndex = Math.min(Math.max(enemy.pathIndex, 0), this.path.length - 2);
            const target = this.path[enemy.pathIndex + 1];
            const dx = target.x - enemy.x;
            const dy = target.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Apply gameSpeed to movement and checkpoint detection
            // 1x = 1x, 2x = 2x (1x-in 2 qatı), 3x = 4x (2x-in 2 qatı)
            const speedMultiplier = this.getSpeedMultiplier();
            const moveSpeed = enemy.speed * speedMultiplier;
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
        if (this.gameState.gameOver) {
            return;
        }
        
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
            const speedMultiplier = this.getSpeedMultiplier();
            const moveSpeed = bullet.speed * speedMultiplier;
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
        if (this.gameState.gameOver) {
            return;
        }
        
        for (const tower of this.towers) {
            // Find target
            tower.target = this.findTarget(tower);
            
            // Shoot at target
            const speedMultiplier = this.getSpeedMultiplier();
            const effectiveFireRate = tower.fireRate / Math.max(0.001, speedMultiplier);
            if (tower.target && Date.now() - tower.lastShot > effectiveFireRate) {
                this.shootBullet(tower);
                tower.lastShot = Date.now();
            }
            
            // Avtomatik can yeniləmə
            if (tower.autoHealEnabled) {
                // Her frame kontrol etme, sadece gerçekten ihtiyaç olduğunda log yaz
                if (tower.health <= tower.autoHealThreshold && tower.health < tower.maxHealth) {
                    // Pul hesabı: hər 100 can üçün 20 pul
                    // Formula: (maxHealth / 100) * 20
                    const healCost = Math.floor((tower.maxHealth / 100) * 20);
                    console.log(`[AUTO-HEAL] ✅ Healing condition met! Tower: ${tower.type} at (${tower.x}, ${tower.y}), health=${tower.health}, threshold=${tower.autoHealThreshold}, maxHealth=${tower.maxHealth}, healCost=$${healCost}, money=$${this.gameState.money}`);
                    
                    if (this.gameState.money >= healCost) {
                        const oldHealth = tower.health;
                        // Tam doldur: canı maksimuma çatdır
                        tower.health = tower.maxHealth;
                        this.gameState.money -= healCost;
                        this.updateUI();
                        console.log(`🩹 [AUTO-HEAL] ✅✅✅ ${tower.type} tower healed: ${oldHealth} -> ${tower.health}/${tower.maxHealth}, cost: $${healCost}, money: $${this.gameState.money}`);
                    } else {
                        console.log(`💰 [AUTO-HEAL] ❌ Not enough money (need $${healCost}, have $${this.gameState.money})`);
                    }
                }
            } else {
                // Debug: Niyə auto-heal aktiv deyil?
                // Yalnız bir dəfə log yaz ki, spam olmasın
                if (!tower._autoHealDebugLogged && tower.health < tower.maxHealth) {
                    console.log(`[AUTO-HEAL] ⚠️ Tower ${tower.type} at (${tower.x}, ${tower.y}) has autoHealEnabled=false, health=${tower.health}/${tower.maxHealth}`);
                    tower._autoHealDebugLogged = true;
                }
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
            awakened: tower.awakened || false, // Store awakened state for bullet appearance
            bornAt: Date.now(),
            ttlMs: 4000
        };
        this.bullets.push(bullet);
        
        // Mərmi atış zamanı təpmə effekti (awaken və shielded qüllələr üçün)
        if (tower.awakened) {
            tower.pulseUntil = Date.now() + 200; // 200ms təpmə effekti
        }
    }
    
    updateBullets() {
        if (this.gameState.gameOver) {
            return;
        }
        
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
            const speedMultiplier = this.getSpeedMultiplier();
            const moveSpeed = bullet.speed * speedMultiplier;
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
            this.enemiesKilledThisGame++; // Track killed enemies
            
            // Give star for every 10th wave boss
            if (enemy.type === 'boss' && this.gameState.wave % 10 === 0) {
                this.stars++;
                localStorage.setItem('towerDefenseStars', this.stars.toString());
                this.debugLog(`⭐ Ulduz qazandınız! Cəmi: ${this.stars}`);
                // console.log(`[⭐ ULDUZ] Boss məğlub edildi! Ulduz: ${this.stars}`);
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
    
    // Helper function to calculate point to line distance
    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq != 0) param = dot / lenSq;
        
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
    
    // Find closest point on path to a given position
    findClosestPathPoint(x, y) {
        if (this.path.length < 2) return null;
        
        let closestPoint = null;
        let minDist = Infinity;
        
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            const dist = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            
            if (dist < minDist) {
                minDist = dist;
                // Find the actual closest point on the segment
                const A = x - p1.x;
                const B = y - p1.y;
                const C = p2.x - p1.x;
                const D = p2.y - p1.y;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = 0;
                if (lenSq != 0) param = Math.max(0, Math.min(1, dot / lenSq));
                
                closestPoint = {
                    x: p1.x + param * C,
                    y: p1.y + param * D
                };
            }
        }
        
        return closestPoint;
    }
    
    // Get plasma tower pairs (left and right towers that form a pair)
    // Find a plasma tower on the opposite side of the path (qarşı-qarşıya)
    findNearbyPlasmaTower(tower, maxDistance = null) {
        if (!maxDistance) {
            maxDistance = this.gridSize * 4; // Default: 4 grid cells
        }
        
        // Find closest point on path to this tower
        const pathPoint = this.findClosestPathPoint(tower.x, tower.y);
        if (!pathPoint) return null;
        
        // Calculate path normal vector (perpendicular to path direction)
        let normalX = 0;
        let normalY = 0;
        
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            
            // Check if tower is near this path segment
            const dist = this.pointToLineDistance(tower.x, tower.y, p1.x, p1.y, p2.x, p2.y);
            if (dist < this.gridSize * 2) {
                // Path direction vector
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                
                if (len > 0) {
                    // Perpendicular vector (rotated 90 degrees)
                    normalX = -dy / len;
                    normalY = dx / len;
                }
                break;
            }
        }
        
        if (normalX === 0 && normalY === 0) return null;
        
        // Calculate which side of path the tower is on
        const dx = tower.x - pathPoint.x;
        const dy = tower.y - pathPoint.y;
        const dotProduct = dx * normalX + dy * normalY;
        const towerSide = dotProduct > 0 ? 'left' : 'right'; // left if positive, right if negative
        
        // Find towers on the opposite side
        const oppositeSide = towerSide === 'left' ? 'right' : 'left';
        
        const nearbyTowers = this.towers.filter(t => {
            if (t === tower || t.type !== 'plasma') return false;
            if (t.plasmaActivated && t.plasmaPairId !== null) return false; // Already paired
            
            // Check if this tower is on the opposite side of the path
            const tDx = t.x - pathPoint.x;
            const tDy = t.y - pathPoint.y;
            const tDotProduct = tDx * normalX + tDy * normalY;
            const tSide = tDotProduct > 0 ? 'left' : 'right';
            
            if (tSide !== oppositeSide) return false; // Must be on opposite side
            
            // Check distance from path point
            const dist = Math.sqrt((t.x - pathPoint.x) ** 2 + (t.y - pathPoint.y) ** 2);
            if (dist > maxDistance) return false;
            
            // Check distance from the other tower (not too far)
            const towerDist = Math.sqrt((t.x - tower.x) ** 2 + (t.y - tower.y) ** 2);
            if (towerDist > maxDistance * 1.5) return false;
            
            // Important: Check if both towers are close to the same path point
            // This ensures they are on the same path segment
            const tPathPoint = this.findClosestPathPoint(t.x, t.y);
            if (!tPathPoint) return false;
            
            const pathPointDist = Math.sqrt((tPathPoint.x - pathPoint.x) ** 2 + (tPathPoint.y - pathPoint.y) ** 2);
            if (pathPointDist > this.gridSize * 1.5) return false; // Must be on same segment
            
            return true;
        });
        
        // Return the closest one to the path point (prioritize same path segment)
        if (nearbyTowers.length === 0) return null;
        
        nearbyTowers.sort((a, b) => {
            // First, prioritize towers on the same path segment
            const aPathPoint = this.findClosestPathPoint(a.x, a.y);
            const bPathPoint = this.findClosestPathPoint(b.x, b.y);
            
            if (!aPathPoint || !bPathPoint) return 0;
            
            const aPathDist = Math.sqrt((aPathPoint.x - pathPoint.x) ** 2 + (aPathPoint.y - pathPoint.y) ** 2);
            const bPathDist = Math.sqrt((bPathPoint.x - pathPoint.x) ** 2 + (bPathPoint.y - pathPoint.y) ** 2);
            
            // Closer to same path point is better
            if (Math.abs(aPathDist - bPathDist) > this.gridSize * 0.5) {
                return aPathDist - bPathDist;
            }
            
            // Then by distance from original tower
            const distA = Math.sqrt((a.x - tower.x) ** 2 + (a.y - tower.y) ** 2);
            const distB = Math.sqrt((b.x - tower.x) ** 2 + (b.y - tower.y) ** 2);
            return distA - distB;
        });
        
        return nearbyTowers[0];
    }
    
    // Activate plasma pair - connect two plasma towers
    activatePlasmaPair(tower1, tower2) {
        if (!tower1 || !tower2) return false;
        if (tower1.type !== 'plasma' || tower2.type !== 'plasma') return false;
        if (tower1.plasmaActivated || tower2.plasmaActivated) return false;
        
        // İki qüllə arasındakı məsafəni hesabla (grid cell-lər arasında)
        const cellDistance = Math.abs(tower1.col - tower2.col) + Math.abs(tower1.row - tower2.row);
        
        // Elmas xərci hesabla: 20 + (cell_sayı - 1) * 5
        // İlk cell = 20 elmas, hər əlavə cell = 5 elmas
        const diamondCost = 20 + (cellDistance - 1) * 5;
        
        // Elmas kifayət etmir
        if (this.diamonds < diamondCost) {
            const errorMsg = `Kifayət qədər elmas yoxdur! Lazım: ${diamondCost}💎, Mövcud: ${this.diamonds}💎\nMəsafə: ${cellDistance} dama`;
            this.debugError(errorMsg);
            this.showTooltip(errorMsg, 'error');
            return false;
        }
        
        // Elması çıx
        this.changeCurrency(-diamondCost, 0);
        this.debugSuccess(`Plazma aktivləşdirildi - Xərclənən elmas: ${diamondCost}💎 (${cellDistance} dama məsafə)`);
        
        // Find path points and normal vectors for both towers
        const pathPoint1 = this.findClosestPathPoint(tower1.x, tower1.y);
        const pathPoint2 = this.findClosestPathPoint(tower2.x, tower2.y);
        
        if (!pathPoint1 || !pathPoint2) {
            this.debugError(`Yol nöqtəsi tapılmadı qüllələr üçün`);
            return false;
        }
        
        // Calculate path normal vector using tower1's position
        let normalX = 0;
        let normalY = 0;
        
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            
            const dist = this.pointToLineDistance(tower1.x, tower1.y, p1.x, p1.y, p2.x, p2.y);
            if (dist < this.gridSize * 2) {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                
                if (len > 0) {
                    normalX = -dy / len;
                    normalY = dx / len;
                }
                break;
            }
        }
        
        if (normalX === 0 && normalY === 0) {
            this.debugError(`Normal vektor hesablanmadı`);
            return false;
        }
        
        // Determine which tower is left and which is right based on path normal
        // Left side: positive dot product with normal
        // Right side: negative dot product with normal
        const dx1 = tower1.x - pathPoint1.x;
        const dy1 = tower1.y - pathPoint1.y;
        const dot1 = dx1 * normalX + dy1 * normalY;
        
        const dx2 = tower2.x - pathPoint2.x;
        const dy2 = tower2.y - pathPoint2.y;
        const dot2 = dx2 * normalX + dy2 * normalY;
        
        // If both are on same side, use x position as fallback
        let leftTower, rightTower;
        if ((dot1 > 0 && dot2 < 0) || (dot1 < 0 && dot2 > 0)) {
            // They are on opposite sides - use dot product
            leftTower = dot1 > 0 ? tower1 : tower2;
            rightTower = dot1 > 0 ? tower2 : tower1;
        } else {
            // Same side or couldn't determine - use x position
            leftTower = tower1.x < tower2.x ? tower1 : tower2;
            rightTower = tower1.x < tower2.x ? tower2 : tower1;
        }
        
        // Generate pair ID
        const pairId = Date.now();
        
        // Activate both towers
        leftTower.plasmaActivated = true;
        leftTower.plasmaPairId = pairId;
        leftTower.side = 'left';
        
        rightTower.plasmaActivated = true;
        rightTower.plasmaPairId = pairId;
        rightTower.side = 'right';
        
        this.debugSuccess(`Plazma qüllələri aktiv edildi (cüt ID: ${pairId}) - Sol: (${leftTower.x}, ${leftTower.y}), Sağ: (${rightTower.x}, ${rightTower.y})`);
        return true;
    }
    
    getPlasmaTowerPairs() {
        const pairs = [];
        const activatedTowers = this.towers.filter(t => 
            t.type === 'plasma' && t.plasmaActivated && t.plasmaPairId !== null
        );
        
        // Group towers by pairId
        const pairMap = new Map();
        
        for (const tower of activatedTowers) {
            if (!pairMap.has(tower.plasmaPairId)) {
                pairMap.set(tower.plasmaPairId, { left: null, right: null });
            }
            
            const pair = pairMap.get(tower.plasmaPairId);
            if (tower.side === 'left') {
                pair.left = tower;
            } else if (tower.side === 'right') {
                pair.right = tower;
            }
        }
        
        // Return only complete pairs
        for (const pair of pairMap.values()) {
            if (pair.left && pair.right) {
                pairs.push(pair);
            }
        }
        
        return pairs;
    }
    
    // Generate laser lines between two towers
    generateLasersBetweenTowers(leftTower, rightTower) {
        const lasers = [];
        
        // Single laser line connecting the exact centers of both towers
        // Xətt hər iki qüllənin tam ortasından keçir
        lasers.push({
            start: { x: leftTower.x, y: leftTower.y },
            end: { x: rightTower.x, y: rightTower.y }
        });
        
        return lasers;
    }
    
    // Draw plasma lasers between tower pairs
    drawPlasmaLasers(tower) {
        // Only draw if tower is activated and is left side (to avoid drawing twice)
        if (!tower.plasmaActivated || tower.side !== 'left') return;
        
        // Find the matching right tower
        const rightTower = this.towers.find(t => 
            t.type === 'plasma' && 
            t.plasmaActivated &&
            t.side === 'right' && 
            t.plasmaPairId === tower.plasmaPairId
        );
        
        if (!rightTower) return;
        
        // Generate and draw lasers between the two towers
        const lasers = this.generateLasersBetweenTowers(tower, rightTower);
        
        // Store lasers for damage calculation (store in left tower)
        if (!tower.laserLines) {
            tower.laserLines = [];
        }
        tower.laserLines = lasers;
        
        // Draw each laser
        for (const laser of lasers) {
            this.ctx.save();
            
            // Laser glow
            const gradient = this.ctx.createLinearGradient(laser.start.x, laser.start.y, laser.end.x, laser.end.y);
            gradient.addColorStop(0, 'rgba(0, 102, 255, 0.8)');
            gradient.addColorStop(0.5, 'rgba(100, 150, 255, 1)');
            gradient.addColorStop(1, 'rgba(0, 102, 255, 0.8)');
            
            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = Math.max(2, Math.round(this.gridSize * 0.1));
            this.ctx.shadowBlur = Math.max(8, Math.round(this.gridSize * 0.25));
            this.ctx.shadowColor = '#0066FF';
            this.ctx.lineCap = 'round';
            
            this.ctx.beginPath();
            this.ctx.moveTo(laser.start.x, laser.start.y);
            this.ctx.lineTo(laser.end.x, laser.end.y);
            this.ctx.stroke();
            
            // Laser core (brighter)
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = Math.max(1, Math.round(this.gridSize * 0.05));
            this.ctx.shadowBlur = Math.max(5, Math.round(this.gridSize * 0.15));
            this.ctx.shadowColor = '#ffffff';
            
            this.ctx.beginPath();
            this.ctx.moveTo(laser.start.x, laser.start.y);
            this.ctx.lineTo(laser.end.x, laser.end.y);
            this.ctx.stroke();
            
            // Moving particles on laser
            const time = Date.now() / 400;
            for (let j = 0; j < 3; j++) {
                const particleT = ((time + j * 0.3) % 1);
                const px = laser.start.x + (laser.end.x - laser.start.x) * particleT;
                const py = laser.start.y + (laser.end.y - laser.start.y) * particleT;
                
                this.ctx.fillStyle = '#ffffff';
                this.ctx.shadowBlur = Math.max(5, Math.round(this.gridSize * 0.15));
                this.ctx.shadowColor = '#0066FF';
                this.ctx.beginPath();
                this.ctx.arc(px, py, Math.max(2, Math.round(this.gridSize * 0.06)), 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        }
    }
    
    // Draw plasma fence barrier on path
    drawPlasmaFence(tower) {
        // Draw lasers between activated tower pairs
        if (tower.plasmaActivated && tower.side === 'left') {
            this.drawPlasmaLasers(tower);
        }
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

            // Neon base radius - qüllənin əsas radiusu
            const baseR = Math.max(6, Math.round(this.gridSize * 0.38));
            
            // 1x1 grid cell highlight only when selected
            if (isSelected) {
                this.ctx.globalAlpha = 0.12;
                this.ctx.fillStyle = '#4a90e2';
                this.ctx.fillRect(tower.x - this.gridSize / 2, tower.y - this.gridSize / 2, 
                                this.gridSize, this.gridSize);
                this.ctx.globalAlpha = 1.0;
                
                // Dönen neon ışık efekti - seçilən qüllənin kenarı
                this.ctx.save();
                const rotationSpeed = 0.003; // Dövr sürəti
                const rotation = (Date.now() * rotationSpeed) % (Math.PI * 2);
                const glowRadius = baseR + 8; // Neon ışıq radiusu
                const glowThickness = 4;
                
                // Neon ışıq rəngi - qüllə tipinə görə
                const glowColors = {
                    basic: 'rgba(74, 255, 74, 0.9)',    // Açıq yaşıl
                    rapid: 'rgba(74, 144, 255, 0.9)',    // Açıq mavi
                    heavy: 'rgba(255, 74, 74, 0.9)',     // Açıq qırmızı
                    ice: 'rgba(0, 255, 255, 0.9)',      // Açıq cyan
                    flame: 'rgba(255, 165, 0, 0.9)',    // Açıq narıncı
                    laser: 'rgba(255, 20, 147, 0.9)',   // Açıq çəhrayı
                    plasma: 'rgba(147, 112, 219, 0.9)'  // Açıq bənövşəyi
                };
                const glowColor = glowColors[tower.type] || 'rgba(74, 255, 74, 0.9)';
                
                // Dönen neon dairə çək
                for (let i = 0; i < 8; i++) {
                    const angle = rotation + (i * Math.PI * 2 / 8);
                    const x1 = tower.x + Math.cos(angle) * glowRadius;
                    const y1 = tower.y + Math.sin(angle) * glowRadius;
                    const x2 = tower.x + Math.cos(angle) * (glowRadius + glowThickness);
                    const y2 = tower.y + Math.sin(angle) * (glowRadius + glowThickness);
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(x1, y1);
                    this.ctx.lineTo(x2, y2);
                    this.ctx.strokeStyle = glowColor;
                    this.ctx.lineWidth = 3;
                    this.ctx.shadowColor = glowColor;
                    this.ctx.shadowBlur = 8;
                    this.ctx.stroke();
                }
                
                // Xarici dönen neon dairə
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, glowRadius + glowThickness, rotation, rotation + Math.PI * 2 / 4);
                this.ctx.strokeStyle = glowColor;
                this.ctx.lineWidth = 3;
                this.ctx.shadowColor = glowColor;
                this.ctx.shadowBlur = 12;
                this.ctx.stroke();
                
                this.ctx.shadowBlur = 0;
                this.ctx.restore();
            }

            // Neon base + weapon barrel (baseR artıq yuxarıda təyin edilib)
            // Back to subtle neon base + barrel (no 3D) for the actual game
            // Ring as health bar: part of ring disappears as health decreases
            const hpRatio = Math.max(0, Math.min(1, (tower.health ?? tower.maxHealth) / (tower.maxHealth || 1)));
            let neonStroke;
            // Qüllənin orijinal rəngi (awaken və shielded olduqda da öz rəngi qalır)
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
            
            // Her qüllə tipi üçün öz rəngi olsun - health-based color yalnız basic/rapid/heavy üçün
            // ANCAK health'e göre renk değişimi TOWER TİPİNDEN BAĞIMSIZ olmalı
            if (tower.type === 'basic') {
                // Basic tower - health'e göre yeşilden kırmızıya
                const hue = Math.floor(120 * hpRatio); // 120=green to 0=red
                neonStroke = `hsl(${hue}, 90%, 60%)`;
            } else if (tower.type === 'rapid') {
                // Rapid tower - HEP Mavi (health'e göre koyulaşabilir ama mavi kalır)
                const lightness = 40 + (20 * hpRatio); // 40-60 arası
                neonStroke = `hsl(200, 90%, ${lightness}%)`; // Hep mavi
            } else if (tower.type === 'heavy') {
                // Heavy tower - HEP Kırmızı (health'e göre koyulaşabilir ama kırmızı kalır)
                const lightness = 40 + (20 * hpRatio); // 40-60 arası
                neonStroke = `hsl(0, 90%, ${lightness}%)`; // Hep kırmızı
            } else {
                // For star towers, just use base color (no health-based color change)
                neonStroke = baseColor;
            }
            
            // Awaken və shielded olduqda da öz rəngi qalır (yalnız rainbow və ağ xətlər əlavə olunur)
            
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
            
            // Awaken Rainbow Halqası (qüllənin içində) - əsas halqa qalır, sadəcə içində rainbow əlavə olunur
            if (tower.awakened) {
                const rainbowRadius = baseR * 0.55; // Qüllənin içində, əsas halqadan kiçik (daha sıkıştırılmış)
                const now = Date.now();
                
                // Mərmi atış zamanı təpmə effekti
                let pulseScale = 1.0;
                if (tower.pulseUntil && now < tower.pulseUntil) {
                    const pulseProgress = (tower.pulseUntil - now) / 200; // 200ms-də azalır
                    pulseScale = 1.0 + Math.sin(pulseProgress * Math.PI) * 0.2; // 20% təpmə
                }
                
                this.ctx.save();
                
                // Rainbow halqası - rəngli gradient (statik, animasiya yoxdur)
                const adjustedRainbowRadius = rainbowRadius * pulseScale;
                const rainbowColors = [
                    '#ff0000', '#ff7700', '#ffaa00', '#ffff00',
                    '#00ff00', '#00aaff', '#0000ff', '#7700ff'
                ];
                
                for (let i = 0; i < 8; i++) {
                    const startAngle2 = (i * Math.PI / 4);
                    const endAngle2 = startAngle2 + (Math.PI / 4);
                    
                    this.ctx.beginPath();
                    this.ctx.arc(tower.x, tower.y, adjustedRainbowRadius, startAngle2, endAngle2);
                    this.ctx.shadowColor = rainbowColors[i];
                    this.ctx.shadowBlur = 6;
                    this.ctx.lineWidth = Math.max(2, Math.round(this.gridSize * 0.06));
                    this.ctx.strokeStyle = rainbowColors[i];
                    this.ctx.stroke();
                }
                
                // Rainbow'un kenarına daire çerçeve ekle - oyundaki görünüş
                this.ctx.beginPath();
                this.ctx.arc(tower.x, tower.y, adjustedRainbowRadius, 0, Math.PI * 2);
                this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                this.ctx.shadowBlur = 4;
                this.ctx.lineWidth = 1;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Beyaz/şeffaf daire çerçeve
                this.ctx.stroke();
                
                // Shielded olduqda - rainbow halqasının kənarlarına ağ xətlər (statik, animasiya yoxdur)
                if (tower.shielded) {
                    // Mərmi atış zamanı təpməni artır
                    let finalPulseScale = pulseScale;
                    if (tower.pulseUntil && now < tower.pulseUntil) {
                        const pulseProgress = (tower.pulseUntil - now) / 200;
                        finalPulseScale = 1.0 + Math.sin(pulseProgress * Math.PI) * 0.2; // 20% atış təpmə
                    }
                    
                    const shieldRadius = adjustedRainbowRadius * 1.2 * finalPulseScale;
                    
                    // Ağ neon xətlər - rainbowun kənarlarına (statik, animasiya yoxdur)
                    const numLines = 12;
                    for (let j = 0; j < numLines; j++) {
                        const lineAngle = (j * Math.PI * 2 / numLines);
                        const lineStartX = tower.x + Math.cos(lineAngle) * adjustedRainbowRadius;
                        const lineStartY = tower.y + Math.sin(lineAngle) * adjustedRainbowRadius;
                        const lineEndX = tower.x + Math.cos(lineAngle) * shieldRadius;
                        const lineEndY = tower.y + Math.sin(lineAngle) * shieldRadius;
                        
                        // Ağ neon xətt
                        this.ctx.beginPath();
                        this.ctx.moveTo(lineStartX, lineStartY);
                        this.ctx.lineTo(lineEndX, lineEndY);
                        this.ctx.strokeStyle = '#ffffff';
                        this.ctx.shadowColor = '#00ffff';
                        this.ctx.shadowBlur = 8;
                        this.ctx.lineWidth = 1.5;
                        this.ctx.stroke();
                    }
                    
                    // Rainbowun xarici konturu - ağ neon halqa (təpmə ilə)
                    this.ctx.beginPath();
                    this.ctx.arc(tower.x, tower.y, shieldRadius, 0, Math.PI * 2);
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    this.ctx.shadowColor = '#ffffff';
                    this.ctx.shadowBlur = 10;
                    this.ctx.lineWidth = 1.5;
                    this.ctx.stroke();
                }
                
                this.ctx.restore();
            }
            
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
            
            // Plasma tower - draw fence barrier on path
            if (tower.type === 'plasma') {
                this.drawPlasmaFence(tower);
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

            // Tower body - bütün qüllə tipləri üçün
            this.ctx.globalAlpha = 0.8;
            const towerColors = {
                basic: '#8B4513',
                rapid: '#4169E1',
                heavy: '#DC143C',
                ice: '#00CED1',
                flame: '#FF4500',
                laser: '#FF1493',
                plasma: '#9370DB'
            };
            this.ctx.fillStyle = towerColors[type] || '#8B4513';
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
        
        // Draw enemy tooltip if hovering
        if (this.hoveredEnemy) {
            this.drawEnemyTooltip(this.hoveredEnemy, this.mouseX, this.mouseY);
        }
    }
    
    drawEnemyTooltip(enemy, mouseX, mouseY) {
        const enemyNames = {
            basic: 'Zombie',
            fast: 'Qartal',
            tank: 'Dino',
            boss: 'Boss X'
        };
        
        const enemyDescriptions = {
            basic: 'Yavaş hərəkət edən, orta zərər verən düşman',
            fast: 'Sürətli hərəkət edən, aşağı zərər verən düşman',
            tank: 'Yavaş hərəkət edən, yüksək canlı və güclü düşman',
            boss: 'Güclü və sürətli, yüksək canlı boss düşmanı'
        };
        
        const name = enemyNames[enemy.type] || enemy.type;
        const description = enemyDescriptions[enemy.type] || '';
        const health = Math.max(0, Math.floor(enemy.health));
        const maxHealth = Math.floor(enemy.maxHealth);
        const damage = this.getEnemyDamage(enemy.type, enemy.level);
        const speed = Math.floor(enemy.speed || 0);
        
        // Tooltip məzmunu
        const lines = [
            name,
            `❤️ Can: ${health}/${maxHealth}`,
            `⚔️ Atış Gücü: ${damage}`,
            `🏃 Sürət: ${speed}`,
            `📊 Səviyyə: ${enemy.level || this.currentLevel}`,
            description
        ];
        
        // Tooltip ölçüsünü hesabla
        const padding = 12;
        const lineHeight = 20;
        const fontSize = 14;
        this.ctx.save();
        this.ctx.font = `bold ${fontSize}px Arial`;
        
        let maxWidth = 0;
        for (const line of lines) {
            const metrics = this.ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        }
        
        const tooltipWidth = maxWidth + padding * 2;
        const tooltipHeight = lines.length * lineHeight + padding * 2;
        
        // Tooltip pozisiyasını hesabla (mouse-un yanında, ekran sərhədlərindən kənarda olmasın)
        let tooltipX = mouseX + 15;
        let tooltipY = mouseY - tooltipHeight / 2;
        
        const canvasRect = this.canvas.getBoundingClientRect();
        if (tooltipX + tooltipWidth > canvasRect.width) {
            tooltipX = mouseX - tooltipWidth - 15;
        }
        if (tooltipY < 0) {
            tooltipY = 10;
        }
        if (tooltipY + tooltipHeight > canvasRect.height) {
            tooltipY = canvasRect.height - tooltipHeight - 10;
        }
        
        // Tooltip fonu
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        this.ctx.strokeStyle = '#ff4444';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        this.ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        
        // Tooltip mətnini çək
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.font = `bold ${fontSize}px Arial`;
        
        lines.forEach((line, index) => {
            let color = '#ffffff';
            if (index === 0) {
                color = '#ff4444'; // Başlıq
                this.ctx.font = `bold ${fontSize + 2}px Arial`;
            } else {
                this.ctx.font = `${fontSize}px Arial`;
            }
            this.ctx.fillStyle = color;
            this.ctx.fillText(line, tooltipX + padding, tooltipY + padding + index * lineHeight);
        });
        
        this.ctx.restore();
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
            const isAwakened = bullet.awakened || false;
            
            // Mərmi rəngləri (neon dizayn)
            const bulletColors = {
                basic: { fill: '#00ff00', glow: '#00ff88', shadow: 'rgba(0, 255, 136, 0.6)' },    // Yaşıl neon
                rapid: { fill: '#0099ff', glow: '#00ccff', shadow: 'rgba(0, 204, 255, 0.6)' },    // Mavi neon
                heavy: { fill: '#ff3333', glow: '#ff6666', shadow: 'rgba(255, 102, 102, 0.6)' },  // Qırmızı neon
                laser: { fill: '#9900ff', glow: '#cc66ff', shadow: 'rgba(204, 102, 255, 0.6)' }   // Bənövşəyi lazer
            };
            
            // Normal mərmilər (basic, rapid, heavy) - neon dizayn
            // Her qüllə tipi üçün öz rəngi olsun
            if (['basic', 'rapid', 'heavy'].includes(towerType)) {
                // Doğru renkleri kullan - towerType'a göre
                const colors = bulletColors[towerType] || bulletColors.basic;
                
                this.ctx.save();
                
                // Neon glow effekti
                const glowRadius = baseR * 2.5;
                const glowGradient = this.ctx.createRadialGradient(
                    bullet.x, bullet.y, 0,
                    bullet.x, bullet.y, glowRadius
                );
                glowGradient.addColorStop(0, colors.shadow);
                glowGradient.addColorStop(0.5, colors.shadow.replace('0.6', '0.3'));
                glowGradient.addColorStop(1, colors.shadow.replace('0.6', '0'));
                this.ctx.fillStyle = glowGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, glowRadius, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Əsas mərmi (neon rəng)
                const bulletGradient = this.ctx.createRadialGradient(
                    bullet.x, bullet.y, 0,
                    bullet.x, bullet.y, baseR
                );
                bulletGradient.addColorStop(0, colors.fill);
                bulletGradient.addColorStop(0.7, colors.glow);
                bulletGradient.addColorStop(1, colors.fill);
                this.ctx.fillStyle = bulletGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, baseR * 1.1, 0, Math.PI * 2);
                this.ctx.fill();
                
                // İç işıq (parlaq nöqtə)
                this.ctx.fillStyle = '#ffffff';
                this.ctx.beginPath();
                this.ctx.arc(bullet.x - baseR * 0.3, bullet.y - baseR * 0.3, baseR * 0.4, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Awaken halqası (narıncı) - mərminin ətrafında
                if (isAwakened) {
                    const ringRadius = baseR + 4;
                    // Xarici glow halqası
                    this.ctx.save();
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#ff8800';
                    this.ctx.strokeStyle = '#ff8800'; // Narıncı
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Daxili glow halqası
                    this.ctx.strokeStyle = '#ffaa00';
                    this.ctx.lineWidth = 1;
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 6;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius + 1, 0, Math.PI * 2);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
                
                this.ctx.restore();
            } else if (towerType === 'ice') {
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
                
                // Awaken halqası (narıncı) - mərminin ətrafında
                if (isAwakened) {
                    const ringRadius = baseR * 1.5 + 4;
                    this.ctx.save();
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#ff8800';
                    this.ctx.strokeStyle = '#ff8800'; // Narıncı
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Daxili glow halqası
                    this.ctx.strokeStyle = '#ffaa00';
                    this.ctx.lineWidth = 1;
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 6;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius + 1, 0, Math.PI * 2);
                    this.ctx.stroke();
                    this.ctx.restore();
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
                
                // Awaken halqası (narıncı) - mərminin ətrafında
                if (isAwakened) {
                    const ringRadius = baseR * 1.5 + 4;
                    this.ctx.save();
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#ff8800';
                    this.ctx.strokeStyle = '#ff8800'; // Narıncı
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Daxili glow halqası
                    this.ctx.strokeStyle = '#ffaa00';
                    this.ctx.lineWidth = 1;
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 6;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius + 1, 0, Math.PI * 2);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
                
                this.ctx.restore();
            } else if (towerType === 'laser') {
                // Laser bullet - purple/magenta neon
                this.ctx.save();
                
                const laserColors = bulletColors.laser;
                const glowRadius = baseR * 2.5;
                const glowGradient = this.ctx.createRadialGradient(
                    bullet.x, bullet.y, 0,
                    bullet.x, bullet.y, glowRadius
                );
                glowGradient.addColorStop(0, laserColors.shadow);
                glowGradient.addColorStop(0.5, laserColors.shadow.replace('0.6', '0.3'));
                glowGradient.addColorStop(1, laserColors.shadow.replace('0.6', '0'));
                this.ctx.fillStyle = glowGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, glowRadius, 0, Math.PI * 2);
                this.ctx.fill();
                
                const bulletGradient = this.ctx.createRadialGradient(
                    bullet.x, bullet.y, 0,
                    bullet.x, bullet.y, baseR
                );
                bulletGradient.addColorStop(0, laserColors.fill);
                bulletGradient.addColorStop(0.7, laserColors.glow);
                bulletGradient.addColorStop(1, laserColors.fill);
                this.ctx.fillStyle = bulletGradient;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y, baseR * 1.1, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Laser iç işıq
                this.ctx.fillStyle = '#ffffff';
                this.ctx.beginPath();
                this.ctx.arc(bullet.x - baseR * 0.3, bullet.y - baseR * 0.3, baseR * 0.4, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Awaken halqası (narıncı)
                if (isAwakened) {
                    const ringRadius = baseR + 4;
                    this.ctx.save();
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = '#ff8800';
                    this.ctx.strokeStyle = '#ff8800';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    this.ctx.strokeStyle = '#ffaa00';
                    this.ctx.lineWidth = 1;
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 6;
                    this.ctx.beginPath();
                    this.ctx.arc(bullet.x, bullet.y, ringRadius + 1, 0, Math.PI * 2);
                    this.ctx.stroke();
                    this.ctx.restore();
                }
                
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
        if (this.gameState.gameOver) {
            return;
        }
        
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
        const healthEl = document.getElementById('health');
        const moneyEl = document.getElementById('money');
        const waveEl = document.getElementById('wave');
        const scoreEl = document.getElementById('score');
        const levelEl = document.getElementById('level');
        const diamondsEl = document.getElementById('diamonds');
        const starsEl = document.getElementById('stars');
        const enemyCountEl = document.getElementById('enemyCount');
        
        if (healthEl) healthEl.textContent = this.gameState.health;
        if (moneyEl) moneyEl.textContent = this.gameState.money;
        if (waveEl) waveEl.textContent = this.gameState.wave;
        if (scoreEl) scoreEl.textContent = this.gameState.score;
        if (levelEl) levelEl.textContent = this.currentLevel;
        if (diamondsEl) diamondsEl.textContent = this.diamonds;
        if (starsEl) starsEl.textContent = this.stars;
        
        // Update enemy count (alive enemies)
        const enemyCount = this.enemies.length;
        if (enemyCountEl) enemyCountEl.textContent = enemyCount;
        
        // Update tower availability (only icons visible, no info text)
        document.querySelectorAll('.tower-option').forEach(option => {
            const type = option.dataset.tower;
            const cost = this.towerCosts[type] || 0;
            const starCost = this.towerStarCosts[type] || 0;
            
            // Alına bilərmi yoxla
            if (starCost > 0) {
                option.style.opacity = this.stars >= starCost ? '1' : '0.5';
            } else {
                option.style.opacity = this.gameState.money >= cost ? '1' : '0.5';
            }
            
            // Mağaza yüksəltmələrini göstər (yalnız pul ilə alınan qüllələr üçün)
            if (type && ['basic', 'rapid', 'heavy'].includes(type)) {
                const upgrades = this.towerShopUpgrades && this.towerShopUpgrades[type] ? this.towerShopUpgrades[type] : { damage: 0, fireRate: 0 };
                
                // Tooltip-də yüksəltmələri göstər
                const tooltip = option.querySelector('.tower-tooltip');
                if (tooltip) {
                    const statsDiv = tooltip.querySelector('.tooltip-stats');
                    if (statsDiv) {
                        const statsDivs = statsDiv.querySelectorAll('div');
                        if (statsDivs.length >= 2) {
                            // Zərər
                            const currentDamage = this.getTowerDamage(type);
                            if (statsDivs[0]) {
                                statsDivs[0].textContent = `⚔️ Zərər: ${currentDamage}${upgrades.damage > 0 ? ` (+${upgrades.damage})` : ''}`;
                            }
                            // Atəş sürəti
                            const currentFireRate = this.getTowerFireRate(type);
                            if (statsDivs[1]) {
                                statsDivs[1].textContent = `🔥 Atəş sürəti: ${(currentFireRate / 1000).toFixed(1)}s${upgrades.fireRate > 0 ? ` (+${upgrades.fireRate})` : ''}`;
                            }
                        }
                    }
                }
            }
        });
        
        // Xüsusi tab-da oyun taxtası məlumatını və düymələri yenilə
        const dims = document.getElementById('boardDims');
        if (dims) dims.textContent = `${this.rows}×${this.cols}`;
        const dia = document.getElementById('shopDiamonds');
        if (dia) dia.textContent = String(this.diamonds);
        const buyRowsBtn = document.getElementById('buyRows');
        const buyColBtn = document.getElementById('buyCol');
        const rowsCost = 5, colCost = 3;
        // Qiymət göstəricilərini yenilə
        const costRowsEl = document.getElementById('costRows');
        const costColEl = document.getElementById('costCol');
        if (costRowsEl) costRowsEl.textContent = String(rowsCost);
        if (costColEl) costColEl.textContent = String(colCost);
        // İlk dalğa başlamazdan əvvəl redaktəyə icazə ver
        // Oyun fasilə rejimində və ya dalğa başlamamışsa redaktə etmək olar
        const canEdit = this.isPaused || (!this.waveInProgress && this.enemies.length === 0 && this.gameState.wave <= 1);
        if (buyRowsBtn) buyRowsBtn.disabled = !(canEdit && this.diamonds >= rowsCost && this.rows + 2 <= this.maxRows);
        if (buyColBtn) buyColBtn.disabled = !(canEdit && this.diamonds >= colCost && this.cols + 1 <= this.maxCols);
        // Məlumat mesajını yenilə
        const infoMsg = document.querySelector('#tab-special .shop-placeholder:last-child');
        if (infoMsg) {
            if (this.isPaused) {
                infoMsg.textContent = 'Oyun fasilə rejimindədir. Sətir və sütun artıra bilərsiniz.';
            } else {
                infoMsg.textContent = 'Dalğa başlamadan əvvəl istifadə edin.';
            }
        }
    }
    
    async saveGameStats() {
        // localStorage və ya API yoxdursa skip et
        if (this.useLocalStorage || !this.API_BASE_URL) {
            return;
        }
        if (!this.userId) return;
        
        try {
            // Calculate game duration excluding paused time
            const gameDuration = this.gameStartTime 
                ? Math.floor((Date.now() - this.gameStartTime - this.totalPausedTime) / 1000) 
                : 0;
            
            if (!this.API_BASE_URL) {
                return; // Demo mode: skip API call
            }
            
            const response = await fetch(`${this.API_BASE_URL}/save-game`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    score: this.gameState.score,
                    wave_reached: this.gameState.wave,
                    enemies_killed: this.enemiesKilledThisGame,
                    game_duration: gameDuration,
                    game_data: {
                        level: this.currentLevel,
                        final_health: this.gameState.health
                    }
                })
            });
            
            const data = await response.json();
            if (data.success) {
                this.debugLog(`✅ Oyun statistikaları bazaya saxlanıldı`);
            } else {
                this.debugLog(`⚠️ Statistikalar saxlanılmadı: ${data.error}`);
            }
        } catch (error) {
            console.error('Save game stats error:', error);
            this.debugLog(`⚠️ Statistikalar saxlanılmadı: ${error.message}`);
        }
    }
    
    // Global auto-heal threshold dəyərini almaq
    getGlobalAutoHealThreshold() {
        const thresholdInput = document.getElementById('globalAutoHealThreshold');
        if (!thresholdInput) return 5;
        const threshold = parseInt(thresholdInput.value) || 5;
        return Math.max(1, Math.min(100, threshold));
    }
    
    // Global auto-heal threshold dəyərini təyin etmək
    setGlobalAutoHealThreshold(value) {
        const thresholdInput = document.getElementById('globalAutoHealThreshold');
        if (thresholdInput) {
            thresholdInput.value = Math.max(1, Math.min(100, value || 5));
        }
    }
    
    checkGameOver() {
        if (this.gameState.health <= 0) {
            this.gameState.gameOver = true;
            
            // Global auto-heal threshold-u ilkin dəyərə qaytar (5)
            this.setGlobalAutoHealThreshold(5);
            
            // Global auto-heal settings-i sıfırla
            this.globalAutoHealSettings = {};
            this.debugLog(`💀 OYUN BİTTİ! Final Xal: ${this.gameState.score}`);
            
            // Bütün mağaza yüksəltmələrini sıfırla
            this.towerShopUpgrades = { basic: { damage: 0, fireRate: 0 }, rapid: { damage: 0, fireRate: 0 }, heavy: { damage: 0, fireRate: 0 } };
            localStorage.setItem('towerDefenseShopUpgrades', JSON.stringify(this.towerShopUpgrades));
            
            // Global auto-heal settings-i sıfırla
            this.globalAutoHealSettings = {};
            
            // Oyun statistikalarını bazaya saxla
            this.saveGameStats();
            
            // Yenidən başlatma seçimi ilə game over ekranını göstər
            const restart = confirm(`Game Over!\n\nFinal Score: ${this.gameState.score}\nFinal Wave: ${this.gameState.wave}\nFinal Level: ${this.currentLevel}\n\nYenidən başlatmaq istəyirsiniz?`);
            
            if (restart) {
                this.restartGame();
            }
        }
    }
    
    // Mağaza kontekst menyusunu yenilə
    updateShopContextMenu(towerType) {
        const shopCtx = document.getElementById('shopTowerContext');
        if (shopCtx && shopCtx.style.display !== 'none') {
            const upgrades = this.towerShopUpgrades && this.towerShopUpgrades[towerType] ? this.towerShopUpgrades[towerType] : { damage: 0, fireRate: 0 };
            const baseDamage = this.getTowerDamage(towerType) - upgrades.damage;
            const baseFireRate = this.getTowerFireRate(towerType) + (upgrades.fireRate * 50);
            
            const btnDamage = document.getElementById('shopCtxDamage');
            const btnFireRate = document.getElementById('shopCtxFireRate');
            if (btnDamage) {
                btnDamage.textContent = `⚔️ Atəş Gücü: ${baseDamage + upgrades.damage} (+${upgrades.damage}) - 💎1`;
            }
            if (btnFireRate) {
                const costs = [1, 5, 10, 20, 50];
                const currentCost = upgrades.fireRate < 5 ? costs[upgrades.fireRate] : 0;
                const costText = upgrades.fireRate >= 5 ? '(Max)' : `💎${currentCost}`;
                btnFireRate.textContent = `🔥 Atəş Sürəti: ${((baseFireRate - upgrades.fireRate * 50) / 1000).toFixed(1)}s (+${upgrades.fireRate}/5) - ${costText}`;
                btnFireRate.disabled = upgrades.fireRate >= 5;
            }
        }
    }
    
    // Mağaza qülləsi üçün kontekst menyu göstər
    showShopTowerContextMenu(optionElement, towerType, x, y) {
        // optionElement null kontrolü
        if (!optionElement) {
            this.debugError('showShopTowerContextMenu: optionElement is null');
            return;
        }
        
        // Kontekst menyu elementi tap və ya yarat
        let shopCtx = document.getElementById('shopTowerContext');
        if (!shopCtx) {
            shopCtx = document.createElement('div');
            shopCtx.id = 'shopTowerContext';
            // Mobil üçün daha yüksək z-index - shop panel (z-index: 15) üstündə olmalıdır
            // Kompakt layout: padding və gap azaldıldı, scroll edilə bilən
            shopCtx.style.cssText = 'display:none; position:fixed; z-index:100003; background:rgba(10,10,10,0.92); padding:8px; border:1px solid #00bcd4; border-radius:8px; flex-direction:column; gap:6px; min-width:280px; max-width:calc(100vw - 40px); max-height:calc(100vh - 80px); overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; scrollbar-width:thin; scrollbar-color:rgba(74,144,226,0.5) rgba(0,0,0,0.3); touch-action:pan-y; overscroll-behavior:contain;';
            document.body.appendChild(shopCtx);
            
            // Başlıq (qüllə adı)
            const titleDiv = document.createElement('div');
            titleDiv.id = 'shopCtxTitle';
            titleDiv.style.cssText = 'text-align:center; font-size:15px; font-weight:bold; color:#00d4ff; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.2); margin-bottom:6px; flex-shrink:0;';
            shopCtx.appendChild(titleDiv);
            
            // Tipə xüsusi yüksəltmələr (ayırıcı xəttdən yuxarı)
            const typeSpecificSection = document.createElement('div');
            typeSpecificSection.id = 'shopCtxTypeSpecific';
            typeSpecificSection.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
            shopCtx.appendChild(typeSpecificSection);
            
            // Atəş Gücü və Atəş Sürəti üçün yan yana konteyner
            const fireButtonsRow = document.createElement('div');
            fireButtonsRow.id = 'shopCtxFireButtonsRow';
            fireButtonsRow.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap;';
            typeSpecificSection.appendChild(fireButtonsRow);
            
            // Atəş Gücü artırma düyməsi
            const btnDamage = document.createElement('button');
            btnDamage.id = 'shopCtxDamage';
            btnDamage.className = 'ctx-btn';
            btnDamage.style.cssText = 'flex:1 1 calc(50% - 3px); min-width:120px; padding:8px; background:rgba(74,144,226,0.3); border:1px solid #4a90e2; border-radius:4px; color:#fff; cursor:pointer; font-size:12px; line-height:1.3;';
            fireButtonsRow.appendChild(btnDamage);
            
            // Atəş Sürəti artırma düyməsi
            const btnFireRate = document.createElement('button');
            btnFireRate.id = 'shopCtxFireRate';
            btnFireRate.className = 'ctx-btn';
            btnFireRate.style.cssText = 'flex:1 1 calc(50% - 3px); min-width:120px; padding:8px; background:rgba(74,144,226,0.3); border:1px solid #4a90e2; border-radius:4px; color:#fff; cursor:pointer; font-size:12px; line-height:1.3;';
            fireButtonsRow.appendChild(btnFireRate);
            
            // Ayırıcı xətt (kompakt)
            const separator = document.createElement('div');
            separator.style.cssText = 'width:100%; height:1px; background:rgba(255,255,255,0.2); margin:3px 0; flex-shrink:0;';
            shopCtx.appendChild(separator);
            
            // Global yüksəltmələr (ayırıcı xəttdən aşağı)
            const globalSection = document.createElement('div');
            globalSection.id = 'shopCtxGlobal';
            globalSection.style.cssText = 'display:flex; flex-direction:column; gap:6px; flex-shrink:0;';
            shopCtx.appendChild(globalSection);
            
            // Global butonlar - hamısı bir sətirdə (Can, Radius, Atəş Gücü, Atəş Sürəti)
            const globalButtonsRow = document.createElement('div');
            globalButtonsRow.id = 'shopCtxGlobalButtonsRow';
            globalButtonsRow.style.cssText = 'display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px;';
            globalSection.appendChild(globalButtonsRow);
            
            // Global Can artırma düyməsi
            const btnGlobalHealth = document.createElement('button');
            btnGlobalHealth.id = 'shopCtxGlobalHealth';
            btnGlobalHealth.className = 'ctx-btn';
            btnGlobalHealth.style.cssText = 'flex:1 1 calc(25% - 3px); min-width:80px; padding:6px 3px; background:rgba(255,77,77,0.3); border:1px solid #ff4d4d; border-radius:4px; color:#fff; cursor:pointer; font-size:10px; line-height:1.2;';
            globalButtonsRow.appendChild(btnGlobalHealth);
            
            // Global Radius artırma düyməsi
            const btnGlobalRange = document.createElement('button');
            btnGlobalRange.id = 'shopCtxGlobalRange';
            btnGlobalRange.className = 'ctx-btn';
            btnGlobalRange.style.cssText = 'flex:1 1 calc(25% - 3px); min-width:80px; padding:6px 3px; background:rgba(255,165,0,0.3); border:1px solid #ffa500; border-radius:4px; color:#fff; cursor:pointer; font-size:10px; line-height:1.2;';
            globalButtonsRow.appendChild(btnGlobalRange);
            
            // Global Atəş Gücü artırma düyməsi
            const btnGlobalDamage = document.createElement('button');
            btnGlobalDamage.id = 'shopCtxGlobalDamage';
            btnGlobalDamage.className = 'ctx-btn';
            btnGlobalDamage.style.cssText = 'flex:1 1 calc(25% - 3px); min-width:80px; padding:6px 3px; background:rgba(255,165,0,0.3); border:1px solid #ffa500; border-radius:4px; color:#fff; cursor:pointer; font-size:10px; line-height:1.2;';
            globalButtonsRow.appendChild(btnGlobalDamage);
            
            // Global Atəş Sürəti artırma düyməsi
            const btnGlobalFireRate = document.createElement('button');
            btnGlobalFireRate.id = 'shopCtxGlobalFireRate';
            btnGlobalFireRate.className = 'ctx-btn';
            btnGlobalFireRate.style.cssText = 'flex:1 1 calc(25% - 3px); min-width:80px; padding:6px 3px; background:rgba(255,165,0,0.3); border:1px solid #ffa500; border-radius:4px; color:#fff; cursor:pointer; font-size:10px; line-height:1.2;';
            globalButtonsRow.appendChild(btnGlobalFireRate);
            
            // Global Awaken düyməsi (ikinci sıra - tam genişlik)
            const btnGlobalAwaken = document.createElement('button');
            btnGlobalAwaken.id = 'shopCtxGlobalAwaken';
            btnGlobalAwaken.className = 'ctx-btn';
            btnGlobalAwaken.style.cssText = 'width:100%; padding:6px 4px; background:rgba(138,43,226,0.3); border:1px solid #8a2be2; border-radius:4px; color:#fff; cursor:pointer; font-size:11px; line-height:1.2;';
            globalSection.appendChild(btnGlobalAwaken);
            
            // Event listener-lər (tipə xüsusi)
            btnDamage.addEventListener('click', () => {
                this.upgradeShopTowerDamage(towerType);
            });
            
            btnFireRate.addEventListener('click', () => {
                this.upgradeShopTowerFireRate(towerType);
            });
            
            // Event listener-lər (global) - yalnız seçilmiş qüllə tipinə aid
            // Bu listener-lər hər dəfə yenidən təyin ediləcək çünki towerType dəyişir
            // (Aşağıda dinamik olaraq təyin edilir)
            
            // Mənüyə klik edildikdə bağlanmasın
            shopCtx.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        
        // Qüllə adını tap və başlıqda göstər
        const towerNames = {
            'basic': 'Sadə Qüllə',
            'rapid': 'Sürətli Qüllə',
            'heavy': 'Ağır Qüllə',
            'ice': 'Buz Qülləsi',
            'flame': 'Alov Qülləsi',
            'plasma': 'Plazma Qülləsi',
            'laser': 'Lazer Qülləsi',
            'sniper': 'Snayper Qülləsi',
            'poison': 'Zəhər Qülləsi',
            'dino': 'Dino Qülləsi'
        };
        const towerName = towerNames[towerType] || towerType;
        const titleDiv = document.getElementById('shopCtxTitle');
        if (titleDiv) {
            titleDiv.textContent = towerName;
        }
        
        // Tooltip məlumatlarını kontekst menyuya əlavə et
        const tooltip = optionElement ? optionElement.querySelector('.tower-tooltip') : null;
        let tooltipInfoDiv = document.getElementById('shopCtxTooltipInfo');
        if (!tooltipInfoDiv && shopCtx) {
            // Tooltip məlumatları bölməsini yarat (başlıqdan sonra, yüksəltmələrdən əvvəl)
            tooltipInfoDiv = document.createElement('div');
            tooltipInfoDiv.id = 'shopCtxTooltipInfo';
            tooltipInfoDiv.style.cssText = 'display:flex; flex-direction:column; gap:4px; padding:6px; background:rgba(0,212,255,0.05); border:1px solid rgba(0,212,255,0.2); border-radius:6px; margin-bottom:6px; flex-shrink:0; font-size:11px;';
            
            // Statistika bölməsi
            const statsDiv = document.createElement('div');
            statsDiv.id = 'shopCtxStats';
            statsDiv.style.cssText = 'display:flex; flex-direction:column; gap:3px; font-size:11px; color:#fff;';
            tooltipInfoDiv.appendChild(statsDiv);
            
            // Təsvir bölməsi
            const descDiv = document.createElement('div');
            descDiv.id = 'shopCtxDesc';
            descDiv.style.cssText = 'font-size:10px; color:#d0d0d0; line-height:1.3; text-align:center; font-style:italic; padding-top:4px; border-top:1px solid rgba(255,255,255,0.1); margin-top:3px;';
            tooltipInfoDiv.appendChild(descDiv);
            
            // Başlıqdan sonra, yüksəltmə bölməsindən əvvəl əlavə et
            const typeSpecificSection = document.getElementById('shopCtxTypeSpecific');
            if (typeSpecificSection && typeSpecificSection.parentNode) {
                typeSpecificSection.parentNode.insertBefore(tooltipInfoDiv, typeSpecificSection);
            } else if (shopCtx.firstChild) {
                // Əgər typeSpecificSection tapılmadısa, başlıqdan sonra əlavə et
                shopCtx.insertBefore(tooltipInfoDiv, shopCtx.firstChild.nextSibling);
            }
        }
        
        // Tooltip məlumatlarını doldur (tooltipInfoDiv yenidən tap, çünki yeni yaradıla bilər)
        tooltipInfoDiv = document.getElementById('shopCtxTooltipInfo');
        if (tooltipInfoDiv && tooltip) {
            const tooltipStats = tooltip.querySelector('.tooltip-stats');
            const tooltipDesc = tooltip.querySelector('.tooltip-desc');
            const statsDiv = document.getElementById('shopCtxStats');
            const descDiv = document.getElementById('shopCtxDesc');
            
            if (statsDiv && tooltipStats) {
                // Statistika elementlərini kopyala
                statsDiv.innerHTML = '';
                const statsItems = tooltipStats.querySelectorAll('div');
                statsItems.forEach(item => {
                    const statItem = document.createElement('div');
                    statItem.style.cssText = 'display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.1); text-shadow:0 1px 3px rgba(0,0,0,0.8); font-weight:500;';
                    statItem.textContent = item.textContent;
                    statsDiv.appendChild(statItem);
                });
            }
            
            if (descDiv && tooltipDesc) {
                descDiv.textContent = tooltipDesc.textContent;
            }
            
            // Tooltip məlumatlarını göstər
            tooltipInfoDiv.style.display = 'flex';
        } else if (tooltipInfoDiv) {
            // Tooltip yoxdursa gizlət
            tooltipInfoDiv.style.display = 'none';
        }
        
        // Yüksəltmələri yüklə
        const upgrades = this.towerShopUpgrades && this.towerShopUpgrades[towerType] ? this.towerShopUpgrades[towerType] : { damage: 0, fireRate: 0 };
        const baseDamage = this.getTowerDamage(towerType) - upgrades.damage;
        const baseFireRate = this.getTowerFireRate(towerType) + (upgrades.fireRate * 50);
        
        // Ulduzla alınan qüllələr üçün ulduz, pul ilə alınan üçün elmas
        const isStarTower = this.towerStarCosts[towerType] && this.towerStarCosts[towerType] > 0;
        const currencyIcon = isStarTower ? '⭐' : '💎';
        
        // Düymələri yenilə və event listener-ləri yenilə
        const btnDamage = document.getElementById('shopCtxDamage');
        const btnFireRate = document.getElementById('shopCtxFireRate');
        
        // Köhnə event listener-ləri sil və yenilərini əlavə et
        const newBtnDamage = btnDamage ? btnDamage.cloneNode(true) : null;
        const newBtnFireRate = btnFireRate ? btnFireRate.cloneNode(true) : null;
        if (btnDamage && newBtnDamage) {
            btnDamage.parentNode.replaceChild(newBtnDamage, btnDamage);
        }
        if (btnFireRate && newBtnFireRate) {
            btnFireRate.parentNode.replaceChild(newBtnFireRate, btnFireRate);
        }
        
        if (newBtnDamage) {
            newBtnDamage.textContent = `⚔️ Atəş Gücü: ${baseDamage + upgrades.damage} (+${upgrades.damage}) - ${currencyIcon}1`;
            
            // Mouse hold funksiyası - basılı tutduqda davam et
            let holdTimer = null;
            let holdInterval = null;
            
            newBtnDamage.addEventListener('mousedown', () => {
                // İlk yüksəltməni dərhal et
                this.upgradeShopTowerDamage(towerType);
                
                // Bir az gözlə, sonra təkrarlamağa başla
                holdTimer = setTimeout(() => {
                    holdInterval = setInterval(() => {
                        this.upgradeShopTowerDamage(towerType);
                    }, 150); // Hər 150ms-də bir yüksəltmə
                }, 300); // 300ms gözlə, sonra təkrarla
            });
            
            newBtnDamage.addEventListener('mouseup', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
            
            newBtnDamage.addEventListener('mouseleave', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
        }
        if (newBtnFireRate) {
            const costs = [1, 5, 10, 20, 50];
            const currentCost = upgrades.fireRate < 5 ? costs[upgrades.fireRate] : 0;
            const costText = upgrades.fireRate >= 5 ? '(Max)' : `${currencyIcon}${currentCost}`;
            newBtnFireRate.textContent = `🔥 Atəş Sürəti: ${((baseFireRate - upgrades.fireRate * 50) / 1000).toFixed(1)}s (+${upgrades.fireRate}/5) - ${costText}`;
            
            // Mouse hold funksiyası - basılı tutduqda davam et
            let holdTimer = null;
            let holdInterval = null;
            
            newBtnFireRate.addEventListener('mousedown', () => {
                // İlk yüksəltməni dərhal et
                this.upgradeShopTowerFireRate(towerType);
                
                // Bir az gözlə, sonra təkrarlamağa başla
                holdTimer = setTimeout(() => {
                    holdInterval = setInterval(() => {
                        this.upgradeShopTowerFireRate(towerType);
                    }, 150); // Hər 150ms-də bir yüksəltmə
                }, 300); // 300ms gözlə, sonra təkrarla
            });
            
            newBtnFireRate.addEventListener('mouseup', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
            
            newBtnFireRate.addEventListener('mouseleave', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
        }
        
        // Global yüksəltmə düymələrini yenilə (yalnız seçilmiş qüllə tipinə aid)
        this.updateGlobalUpgradeButtons(towerType);
        
        // Global düymələr üçün event listener-ləri yenilə (towerType ilə)
        const btnGlobalHealth = document.getElementById('shopCtxGlobalHealth');
        const btnGlobalRange = document.getElementById('shopCtxGlobalRange');
        const btnGlobalDamage = document.getElementById('shopCtxGlobalDamage');
        const btnGlobalFireRate = document.getElementById('shopCtxGlobalFireRate');
        const btnGlobalAwaken = document.getElementById('shopCtxGlobalAwaken');
        
        // Global Health butonu üçün event listener
        if (btnGlobalHealth) {
            const newBtnHealth = btnGlobalHealth.cloneNode(true);
            btnGlobalHealth.parentNode.replaceChild(newBtnHealth, btnGlobalHealth);
            
            newBtnHealth.addEventListener('click', () => {
                this.upgradeShopTowerHealth(towerType);
            });
        }
        
        // Köhnə listener-ləri sil və yenilərini əlavə et
        if (btnGlobalRange) {
            const newBtnRange = btnGlobalRange.cloneNode(true);
            btnGlobalRange.parentNode.replaceChild(newBtnRange, btnGlobalRange);
            
            newBtnRange.addEventListener('click', () => {
                this.upgradeAllTowersRange(towerType);
            });
            
            let holdTimer = null;
            let holdInterval = null;
            newBtnRange.addEventListener('mousedown', () => {
                this.upgradeAllTowersRange(towerType);
                holdTimer = setTimeout(() => {
                    holdInterval = setInterval(() => {
                        this.upgradeAllTowersRange(towerType);
                    }, 150);
                }, 300);
            });
            newBtnRange.addEventListener('mouseup', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
            newBtnRange.addEventListener('mouseleave', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
        }
        
        if (btnGlobalDamage) {
            const newBtnDamage = btnGlobalDamage.cloneNode(true);
            btnGlobalDamage.parentNode.replaceChild(newBtnDamage, btnGlobalDamage);
            
            newBtnDamage.addEventListener('click', () => {
                this.upgradeAllTowersDamage(towerType);
            });
            
            let holdTimer = null;
            let holdInterval = null;
            newBtnDamage.addEventListener('mousedown', () => {
                this.upgradeAllTowersDamage(towerType);
                holdTimer = setTimeout(() => {
                    holdInterval = setInterval(() => {
                        this.upgradeAllTowersDamage(towerType);
                    }, 150);
                }, 300);
            });
            newBtnDamage.addEventListener('mouseup', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
            newBtnDamage.addEventListener('mouseleave', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
        }
        
        if (btnGlobalFireRate) {
            const newBtnFireRate = btnGlobalFireRate.cloneNode(true);
            btnGlobalFireRate.parentNode.replaceChild(newBtnFireRate, btnGlobalFireRate);
            
            newBtnFireRate.addEventListener('click', () => {
                this.upgradeAllTowersFireRate(towerType);
            });
            
            let holdTimer = null;
            let holdInterval = null;
            newBtnFireRate.addEventListener('mousedown', () => {
                this.upgradeAllTowersFireRate(towerType);
                holdTimer = setTimeout(() => {
                    holdInterval = setInterval(() => {
                        this.upgradeAllTowersFireRate(towerType);
                    }, 150);
                }, 300);
            });
            newBtnFireRate.addEventListener('mouseup', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
            newBtnFireRate.addEventListener('mouseleave', () => {
                clearTimeout(holdTimer);
                clearInterval(holdInterval);
            });
        }
        
        if (btnGlobalAwaken) {
            const newBtnAwaken = btnGlobalAwaken.cloneNode(true);
            btnGlobalAwaken.parentNode.replaceChild(newBtnAwaken, btnGlobalAwaken);
            
            newBtnAwaken.addEventListener('click', () => {
                this.awakenAllTowers(towerType);
            });
        }
        
        // Mənüyü göstər və mövqeyini təyin et (dinamik positioning)
        // Elementin mövqeyini və pəncərənin ölçülərini yoxla
        const rect = optionElement.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Məktubu gizli rejimdə yerləşdirərək ölçüsünü öyrən
        shopCtx.style.display = 'flex';
        shopCtx.style.visibility = 'hidden';
        // For mobile, center; for desktop, use x/y but keep within margins
        const isMobileCtx = (('ontouchstart' in window) || navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
        const margin2 = 12;
        if (isMobileCtx) {
            const vw2 = window.innerWidth, vh2 = window.innerHeight;
            // Temporarily position to measure
            shopCtx.style.left = '0px'; shopCtx.style.top = '0px';
            const menuRect = shopCtx.getBoundingClientRect();
            const cx = Math.max(margin2, Math.round((vw2 - menuRect.width) / 2));
            const cy = Math.max(margin2, Math.round((vh2 - menuRect.height) / 2));
            shopCtx.style.left = `${cx}px`;
            shopCtx.style.top = `${cy}px`;
        } else {
            shopCtx.style.left = `${x}px`;
            shopCtx.style.top = `${y}px`;
        }
        const menuRect = shopCtx.getBoundingClientRect();
        
        let finalX = x;
        let finalY = y;
        
        // Sağ tərəfdə yer qalmadısa, sol tərəfə keç
        if (finalX + menuRect.width > viewportWidth - 10) {
            finalX = rect.left - menuRect.width - 10;
            if (finalX < 10) {
                finalX = 10; // Minimum boşluq
            }
        }
        
        // Aşağıda yer qalmadısa, yuxarıya keç
        if (finalY + menuRect.height > viewportHeight - 10) {
            finalY = rect.top - menuRect.height - 10;
            if (finalY < 10) {
                finalY = viewportHeight - menuRect.height - 10; // Aşağıdan yapışdır
            }
        }
        
        // Yuxarıda yer qalmadısa, aşağıya keç
        if (finalY < 10) {
            finalY = rect.bottom + 10;
            if (finalY + menuRect.height > viewportHeight - 10) {
                finalY = 10; // Minimum boşluq
            }
        }
        
        shopCtx.style.left = `${finalX}px`;
        shopCtx.style.top = `${finalY}px`;
        shopCtx.style.visibility = 'visible';
        // Mobil üçün daha yüksək z-index - shop panel (z-index: 15) üstündə olmalıdır
        shopCtx.style.zIndex = '100003'; /* Ensure it's above shop panel (15) and tooltips */
        
        // Mənü xaricində klik edildikdə bağla (mouse və touch event-lər üçün)
        // İlk tıklamayı ignore et (menüyü açan tıklama)
        let isFirstClick = true;
        const closeMenu = (e) => {
            // İlk tıklamayı ignore et (menüyü açan tıklama olabilir)
            if (isFirstClick) {
                isFirstClick = false;
                return;
            }
            
            // Tıklama shopCtx içindeyse veya optionElement içindeyse, menüyü kapatma
            // (optionElement.contains() - çünkü e.target optionElement'in içindeki bir child element olabilir)
            if (!shopCtx.contains(e.target) && !optionElement.contains(e.target) && e.target !== optionElement) {
                shopCtx.style.display = 'none';
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('touchend', closeMenu);
            }
        };
        
        // Bir sonrakı click/touch event-də bağla (sol tıkta context menü açıldığında, aynı tıklamayı ignore etmek için gecikme)
        setTimeout(() => {
            document.addEventListener('click', closeMenu, true); // capture phase'de dinle
            document.addEventListener('touchend', closeMenu, true); // Mobil üçün touch event
        }, 100);
    }
    
    // Global yüksəltmə düymələrini yenilə (total pul dəyərləri ilə) - yalnız seçilmiş qüllə tipinə aid
    updateGlobalUpgradeButtons(towerType) {
        const btnGlobalHealth = document.getElementById('shopCtxGlobalHealth');
        const btnGlobalRange = document.getElementById('shopCtxGlobalRange');
        const btnGlobalDamage = document.getElementById('shopCtxGlobalDamage');
        const btnGlobalFireRate = document.getElementById('shopCtxGlobalFireRate');
        const btnGlobalAwaken = document.getElementById('shopCtxGlobalAwaken');
        
        if (!btnGlobalRange || !btnGlobalDamage || !btnGlobalFireRate || !btnGlobalAwaken) return;
        
        // Global Can üçün - yalnız seçilmiş tip
        if (btnGlobalHealth) {
            const eligibleHealthTowers = this.towers.filter(t => t.type === towerType);
            const totalHealthCost = eligibleHealthTowers.length * 50;
            const healthCostText = totalHealthCost >= 1000 ? `${(totalHealthCost / 1000).toFixed(1)}min` : `${totalHealthCost}`;
            btnGlobalHealth.textContent = `❤️ Can (${eligibleHealthTowers.length} qüllə) — $${healthCostText}`;
            btnGlobalHealth.disabled = eligibleHealthTowers.length === 0 || this.gameState.money < 50;
        }
        
        // Bütün qüllələrin sayını və total pul dəyərini hesabla - yalnız seçilmiş qüllə tipinə aid
        const costPerUpgrade = 50;
        
        // Radius üçün: hər qüllə üçün $50, awakened qüllələr üçün limit 3 - yalnız seçilmiş tip
        const eligibleRangeTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            // Awaken olmuş qüllələrdə radius yüksəltməsi yoxdur
            if (t.awakened) return false;
            const limit = 3;
            return (t.rangeUp || 0) < limit;
        });
        const totalRangeCost = eligibleRangeTowers.length * costPerUpgrade;
        const rangeCostText = totalRangeCost >= 1000 ? `${(totalRangeCost / 1000).toFixed(1)}min` : `${totalRangeCost}`;
        
        btnGlobalRange.textContent = `🌀 Radius (${eligibleRangeTowers.length} qüllə) — $${rangeCostText}`;
        btnGlobalRange.disabled = eligibleRangeTowers.length === 0 || this.gameState.money < costPerUpgrade;
        
        // Atəş Gücü üçün - yalnız seçilmiş tip
        const eligibleDamageTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            const limit = t.awakened ? 8 : 3; // Awaken-dən sonra 8/8 (3 awaken əvvəl + 5 awaken sonrası)
            return (t.damageUp || 0) < limit;
        });
        const totalDamageCost = eligibleDamageTowers.length * costPerUpgrade;
        const damageCostText = totalDamageCost >= 1000 ? `${(totalDamageCost / 1000).toFixed(1)}min` : `${totalDamageCost}`;
        
        btnGlobalDamage.textContent = `💥 Atəş Gücü (${eligibleDamageTowers.length} qüllə) — $${damageCostText}`;
        btnGlobalDamage.disabled = eligibleDamageTowers.length === 0 || this.gameState.money < costPerUpgrade;
        
        // Atəş Sürəti üçün - yalnız seçilmiş tip
        const eligibleFireRateTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            const limit = t.awakened ? 3 : 3; // Awaken-dən sonra da 3/3
            return (t.rateUp || 0) < limit;
        });
        const totalFireRateCost = eligibleFireRateTowers.length * costPerUpgrade;
        const fireRateCostText = totalFireRateCost >= 1000 ? `${(totalFireRateCost / 1000).toFixed(1)}min` : `${totalFireRateCost}`;
        
        btnGlobalFireRate.textContent = `⚡ Atəş Sürəti (${eligibleFireRateTowers.length} qüllə) — $${fireRateCostText}`;
        btnGlobalFireRate.disabled = eligibleFireRateTowers.length === 0 || this.gameState.money < costPerUpgrade;
        
        // Awaken üçün: hər qüllə üçün 💎20, amma yalnız 3/3/3 olanlar üçün - yalnız seçilmiş tip
        const eligibleAwakenTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            return !t.awakened && 
                   (t.rangeUp || 0) >= 3 && 
                   (t.damageUp || 0) >= 3 && 
                   (t.rateUp || 0) >= 3;
        });
        const totalAwakenCost = eligibleAwakenTowers.length * 20;
        
        btnGlobalAwaken.textContent = `🌈 Awaken (${eligibleAwakenTowers.length} qüllə) — 💎${totalAwakenCost}`;
        btnGlobalAwaken.disabled = eligibleAwakenTowers.length === 0 || this.diamonds < 20;
    }
    
    // Bütün qüllələrin radiusunu artır - yalnız seçilmiş qüllə tipinə aid
    upgradeAllTowersRange(towerType) {
        const costPerUpgrade = 50;
        
        if (this.towers.length === 0) {
            this.showTooltip('Qüllə yoxdur!', 'error');
            return;
        }
        
        // Uyğun qüllələri yol boyu sırala
        const eligibleTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            // Awaken-dən sonra da radius limit 3/3 olmalıdır (awaken olmuş qüllələrdə radius yüksəltməsi yoxdur)
            if (t.awakened) return false; // Awaken olmuş qüllələrdə radius yüksəltməsi yoxdur
            const limit = 3;
            return (t.rangeUp || 0) < limit;
        });
        
        if (eligibleTowers.length === 0) {
            this.showTooltip('Yüksəltmə üçün uyğun qüllə yoxdur!', 'error');
            return;
        }
        
        // Qüllələri yol boyu sırala - yolun başından sonuna
        const towersWithPathDistance = eligibleTowers.map(tower => {
            let minDistance = Infinity;
            let pathIndex = 0;
            if (this.path && this.path.length > 0) {
                for (let i = 0; i < this.path.length; i++) {
                    const pathPoint = this.path[i];
                    const dx = tower.x - pathPoint.x;
                    const dy = tower.y - pathPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        pathIndex = i;
                    }
                }
            } else {
                // Path yoxdursa, yolun başlanğıcına yaxın olanları hesabla
                const startX = this.startCell ? this.startCell.col * this.gridSize + this.gridSize / 2 : 0;
                const startY = this.startCell ? this.startCell.row * this.gridSize + this.gridSize / 2 : 0;
                const dx = tower.x - startX;
                const dy = tower.y - startY;
                minDistance = Math.sqrt(dx * dx + dy * dy);
            }
            return { tower, distance: minDistance, pathIndex };
        });
        
        // Yolun başından sonuna sırala (pathIndex və distance-ə görə)
        towersWithPathDistance.sort((a, b) => {
            if (a.pathIndex !== b.pathIndex) {
                return a.pathIndex - b.pathIndex;
            }
            return a.distance - b.distance;
        });
        
        // Pul qədər qüllə artır
        let upgradedCount = 0;
        const upgrades = [];
        
        for (const { tower } of towersWithPathDistance) {
            const limit = tower.awakened ? 3 : 3; // Awaken-dən sonra da 3/3
            if ((tower.rangeUp || 0) < limit && this.gameState.money >= costPerUpgrade) {
                tower.rangeUp = (tower.rangeUp || 0) + 1;
                tower.range = Math.floor(tower.range * 1.15);
                this.gameState.money -= costPerUpgrade;
                upgrades.push(tower);
                upgradedCount++;
            } else {
                break;
            }
        }
        
        if (upgradedCount === 0) {
            this.showTooltip(`Kifayət qədər pul yoxdur! Hər yüksəltmə: $${costPerUpgrade}`, 'error');
            return;
        }
        
        // Yüksəltmə animasiyası
        upgrades.forEach((tower, index) => {
            setTimeout(() => {
                tower.highlightUntil = Date.now() + 800;
            }, index * 100);
        });
        
        this.updateUI();
        this.updateGlobalUpgradeButtons(towerType);
        this.showTooltip(`${upgradedCount} qüllənin radiusu yol boyu artırıldı!`, 'success');
    }
    
    // Bütün qüllələrin atəş gücünü artır - yalnız seçilmiş qüllə tipinə aid
    upgradeAllTowersDamage(towerType) {
        const costPerUpgrade = 50;
        
        if (this.towers.length === 0) {
            this.showTooltip('Qüllə yoxdur!', 'error');
            return;
        }
        
        // Uyğun qüllələri yol boyu sırala
        const eligibleTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            // Awaken əvvəl: limit 3, awaken sonrası: limit 8
            const limit = t.awakened ? 8 : 3;
            return (t.damageUp || 0) < limit;
        });
        
        if (eligibleTowers.length === 0) {
            this.showTooltip('Yüksəltmə üçün uyğun qüllə yoxdur!', 'error');
            return;
        }
        
        // Qüllələri yol boyu sırala - yolun başından sonuna
        const towersWithPathDistance = eligibleTowers.map(tower => {
            let minDistance = Infinity;
            let pathIndex = 0;
            if (this.path && this.path.length > 0) {
                for (let i = 0; i < this.path.length; i++) {
                    const pathPoint = this.path[i];
                    const dx = tower.x - pathPoint.x;
                    const dy = tower.y - pathPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        pathIndex = i;
                    }
                }
            } else {
                // Path yoxdursa, yolun başlanğıcına yaxın olanları hesabla
                const startX = this.startCell ? this.startCell.col * this.gridSize + this.gridSize / 2 : 0;
                const startY = this.startCell ? this.startCell.row * this.gridSize + this.gridSize / 2 : 0;
                const dx = tower.x - startX;
                const dy = tower.y - startY;
                minDistance = Math.sqrt(dx * dx + dy * dy);
            }
            return { tower, distance: minDistance, pathIndex };
        });
        
        // Yolun başından sonuna sırala (pathIndex və distance-ə görə)
        towersWithPathDistance.sort((a, b) => {
            if (a.pathIndex !== b.pathIndex) {
                return a.pathIndex - b.pathIndex;
            }
            return a.distance - b.distance;
        });
        
        // Pul qədər qüllə artır
        let upgradedCount = 0;
        const upgrades = [];
        
        for (const { tower } of towersWithPathDistance) {
            // Awaken əvvəl: limit 3, awaken sonrası: limit 8
            const limit = tower.awakened ? 8 : 3;
            if ((tower.damageUp || 0) < limit) {
                const currentDamageUp = tower.damageUp || 0;
                
                // Awaken sonrası yüksəltmələr üçün: Her level'de maliyet 1.5x artır (50 * 1.5^(level-3))
                // Awaken əvvəl: Sabit 50 para
                let cost = costPerUpgrade;
                if (tower.awakened && currentDamageUp >= 3) {
                    cost = Math.floor(50 * Math.pow(1.5, currentDamageUp - 3));
                }
                
                if (this.gameState.money >= cost) {
                    tower.damageUp = currentDamageUp + 1;
                    // Awaken əvvəl: Mevcut %20 artış (%1.2x)
                    // Awaken sonrası: Hər yüksəltmə sabit 32 damage əlavə edir (toplam 200 olmaq üçün)
                    if (tower.awakened && currentDamageUp >= 3) {
                        const baseDamageAfterAwaken = this.getTowerDamage(tower.type);
                        let damageAfterFirst3 = baseDamageAfterAwaken;
                        for (let i = 0; i < 3; i++) {
                            damageAfterFirst3 = Math.floor(damageAfterFirst3 * 1.2);
                        }
                        const damageAfterAwaken = Math.floor(damageAfterFirst3 * 1.2);
                        const awakenUpgrades = currentDamageUp - 2; // 3->1, 4->2, 5->3, 6->4, 7->5, 8->6
                        tower.damage = damageAfterAwaken + (awakenUpgrades * 32);
                    } else {
                        tower.damage = Math.floor(tower.damage * 1.2);
                    }
                    this.gameState.money -= cost;
                    upgrades.push(tower);
                    upgradedCount++;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        
        if (upgradedCount === 0) {
            this.showTooltip(`Kifayət qədər pul yoxdur! Hər yüksəltmə: $${costPerUpgrade}`, 'error');
            return;
        }
        
        // Yüksəltmə animasiyası
        upgrades.forEach((tower, index) => {
            setTimeout(() => {
                tower.highlightUntil = Date.now() + 800;
            }, index * 100);
        });
        
        this.updateUI();
        this.updateGlobalUpgradeButtons(towerType);
        this.showTooltip(`${upgradedCount} qüllənin atəş gücü yol boyu artırıldı!`, 'success');
    }
    
    // Bütün qüllələrin atəş sürətini artır - yalnız seçilmiş qüllə tipinə aid
    upgradeAllTowersFireRate(towerType) {
        const costPerUpgrade = 50;
        
        if (this.towers.length === 0) {
            this.showTooltip('Qüllə yoxdur!', 'error');
            return;
        }
        
        // Uyğun qüllələri yol boyu sırala
        const eligibleTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            // Awaken olmuş qüllələr üçün fire rate yüksəltməsi yoxdur
            if (t.awakened) return false;
            const limit = 3;
            return (t.rateUp || 0) < limit;
        });
        
        if (eligibleTowers.length === 0) {
            this.showTooltip('Yüksəltmə üçün uyğun qüllə yoxdur!', 'error');
            return;
        }
        
        // Qüllələri yol boyu sırala - yolun başından sonuna
        const towersWithPathDistance = eligibleTowers.map(tower => {
            let minDistance = Infinity;
            let pathIndex = 0;
            if (this.path && this.path.length > 0) {
                for (let i = 0; i < this.path.length; i++) {
                    const pathPoint = this.path[i];
                    const dx = tower.x - pathPoint.x;
                    const dy = tower.y - pathPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        pathIndex = i;
                    }
                }
            } else {
                // Path yoxdursa, yolun başlanğıcına yaxın olanları hesabla
                const startX = this.startCell ? this.startCell.col * this.gridSize + this.gridSize / 2 : 0;
                const startY = this.startCell ? this.startCell.row * this.gridSize + this.gridSize / 2 : 0;
                const dx = tower.x - startX;
                const dy = tower.y - startY;
                minDistance = Math.sqrt(dx * dx + dy * dy);
            }
            return { tower, distance: minDistance, pathIndex };
        });
        
        // Yolun başından sonuna sırala (pathIndex və distance-ə görə)
        towersWithPathDistance.sort((a, b) => {
            if (a.pathIndex !== b.pathIndex) {
                return a.pathIndex - b.pathIndex;
            }
            return a.distance - b.distance;
        });
        
        // Pul qədər qüllə artır
        let upgradedCount = 0;
        const upgrades = [];
        
        for (const { tower } of towersWithPathDistance) {
            const limit = 3;
            if ((tower.rateUp || 0) < limit && this.gameState.money >= costPerUpgrade) {
                tower.rateUp = (tower.rateUp || 0) + 1;
                tower.fireRate = Math.max(80, Math.floor(tower.fireRate * 0.85));
                this.gameState.money -= costPerUpgrade;
                upgrades.push(tower);
                upgradedCount++;
            } else {
                break;
            }
        }
        
        if (upgradedCount === 0) {
            this.showTooltip(`Kifayət qədər pul yoxdur! Hər yüksəltmə: $${costPerUpgrade}`, 'error');
            return;
        }
        
        // Yüksəltmə animasiyası
        upgrades.forEach((tower, index) => {
            setTimeout(() => {
                tower.highlightUntil = Date.now() + 800;
            }, index * 100);
        });
        
        this.updateUI();
        this.updateGlobalUpgradeButtons(towerType);
        this.showTooltip(`${upgradedCount} qüllənin atəş sürəti yol boyu artırıldı!`, 'success');
    }
    
    // Mağazada qüllə canını artırma - yalnız oyundakı qüllələrin canını artırır
    upgradeShopTowerHealth(towerType) {
        const costPerUpgrade = 50;
        
        if (this.towers.length === 0) {
            this.showTooltip('Qüllə yoxdur!', 'error');
            return;
        }
        
        const eligibleTowers = this.towers.filter(t => t.type === towerType);
        
        if (eligibleTowers.length === 0) {
            this.showTooltip(`Bu tip qüllə yoxdur!`, 'error');
            return;
        }
        
        // Qüllələri yol boyu sırala - yolun başından sonuna
        const towersWithPathDistance = eligibleTowers.map(tower => {
            let minDistance = Infinity;
            let pathIndex = 0;
            if (this.path && this.path.length > 0) {
                for (let i = 0; i < this.path.length; i++) {
                    const pathPoint = this.path[i];
                    const dx = tower.x - pathPoint.x;
                    const dy = tower.y - pathPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        pathIndex = i;
                    }
                }
            } else {
                // Path yoxdursa, yolun başlanğıcına yaxın olanları hesabla
                const startX = this.startCell ? this.startCell.col * this.gridSize + this.gridSize / 2 : 0;
                const startY = this.startCell ? this.startCell.row * this.gridSize + this.gridSize / 2 : 0;
                const dx = tower.x - startX;
                const dy = tower.y - startY;
                minDistance = Math.sqrt(dx * dx + dy * dy);
            }
            return { tower, distance: minDistance, pathIndex };
        });
        
        // Yolun başından sonuna sırala (pathIndex və distance-ə görə)
        towersWithPathDistance.sort((a, b) => {
            if (a.pathIndex !== b.pathIndex) {
                return a.pathIndex - b.pathIndex;
            }
            return a.distance - b.distance;
        });
        
        // Pul qədər qüllə artır
        let upgradedCount = 0;
        const upgrades = [];
        
        for (const { tower } of towersWithPathDistance) {
            if (this.gameState.money >= costPerUpgrade) {
                tower.maxHealth = (tower.maxHealth || 100) + 50;
                tower.health += 50;
                tower.healthUp = (tower.healthUp || 0) + 1;
                this.gameState.money -= costPerUpgrade;
                upgrades.push(tower);
                upgradedCount++;
            } else {
                break;
            }
        }
        
        if (upgradedCount === 0) {
            this.showTooltip(`Kifayət qədər pul yoxdur! Hər yüksəltmə: $${costPerUpgrade}`, 'error');
            return;
        }
        
        // Yüksəltmə animasiyası
        upgrades.forEach((tower, index) => {
            setTimeout(() => {
                tower.highlightUntil = Date.now() + 800;
            }, index * 100);
        });
        
        this.updateUI();
        this.updateGlobalUpgradeButtons(towerType);
        this.showTooltip(`${upgradedCount} qüllənin canı yol boyu artırıldı!`, 'success');
    }
    
    // Bütün qüllələrin canını yol boyu artır - yolun başından başlayaraq pul qədər
    upgradeAllTowersHealthByPath() {
        const costPerUpgrade = 50;
        
        if (this.towers.length === 0) {
            this.showTooltip('Qüllə yoxdur!', 'error');
            return;
        }
        
        // Qüllələri yol boyu sırala - yolun başından sonuna
        const towersWithPathDistance = this.towers.map(tower => {
            let minDistance = Infinity;
            let pathIndex = 0;
            if (this.path && this.path.length > 0) {
                for (let i = 0; i < this.path.length; i++) {
                    const pathPoint = this.path[i];
                    const dx = tower.x - pathPoint.x;
                    const dy = tower.y - pathPoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        pathIndex = i;
                    }
                }
            } else {
                // Path yoxdursa, yolun başlanğıcına yaxın olanları hesabla
                const startX = this.startCell ? this.startCell.col * this.gridSize + this.gridSize / 2 : 0;
                const startY = this.startCell ? this.startCell.row * this.gridSize + this.gridSize / 2 : 0;
                const dx = tower.x - startX;
                const dy = tower.y - startY;
                minDistance = Math.sqrt(dx * dx + dy * dy);
            }
            return { tower, distance: minDistance, pathIndex };
        });
        
        // Yolun başından sonuna sırala (pathIndex və distance-ə görə)
        towersWithPathDistance.sort((a, b) => {
            if (a.pathIndex !== b.pathIndex) {
                return a.pathIndex - b.pathIndex;
            }
            return a.distance - b.distance;
        });
        
        // Pul qədər qüllə artır
        let upgradedCount = 0;
        const upgrades = [];
        
        for (const { tower } of towersWithPathDistance) {
            if (this.gameState.money >= costPerUpgrade) {
                tower.maxHealth = (tower.maxHealth || 100) + 50;
                tower.health += 50;
                tower.healthUp = (tower.healthUp || 0) + 1;
                this.gameState.money -= costPerUpgrade;
                upgrades.push(tower);
                upgradedCount++;
            } else {
                break;
            }
        }
        
        if (upgradedCount === 0) {
            this.showTooltip(`Kifayət qədər pul yoxdur! Hər yüksəltmə: $${costPerUpgrade}`, 'error');
            return;
        }
        
        // Yüksəltmə animasiyası
        upgrades.forEach((tower, index) => {
            setTimeout(() => {
                tower.highlightUntil = Date.now() + 800;
            }, index * 100);
        });
        
        this.updateUI();
        this.showTooltip(`${upgradedCount} qüllənin canı yol boyu artırıldı!`, 'success');
    }
    
    // Bütün uyğun qüllələri awaken et - yalnız seçilmiş qüllə tipinə aid
    awakenAllTowers(towerType) {
        const diamondCostPerTower = 20;
        const eligibleTowers = this.towers.filter(t => {
            if (t.type !== towerType) return false;
            return !t.awakened && 
                   (t.rangeUp || 0) >= 3 && 
                   (t.damageUp || 0) >= 3 && 
                   (t.rateUp || 0) >= 3 &&
                   this.diamonds >= diamondCostPerTower;
        });
        
        if (eligibleTowers.length === 0) {
            this.showTooltip('Awaken etmək üçün uyğun qüllə yoxdur! (3/3/3 yüksəltmə lazımdır və ya kifayət qədər elmas yoxdur)', 'error');
            return;
        }
        
        const totalCost = eligibleTowers.length * diamondCostPerTower;
        if (this.diamonds < totalCost) {
            this.showTooltip(`Kifayət qədər elmas yoxdur! Lazım: 💎${totalCost}, Mövcud: 💎${this.diamonds}`, 'error');
            return;
        }
        
        // Hər bir uyğun qülləni awaken et
        eligibleTowers.forEach(tower => {
            if (!tower.awakened && 
                (tower.rangeUp || 0) >= 3 && 
                (tower.damageUp || 0) >= 3 && 
                (tower.rateUp || 0) >= 3 &&
                this.diamonds >= diamondCostPerTower) {
                tower.awakened = true;
                tower.damage = Math.floor(tower.damage * 1.2);
                tower.fireRate = Math.max(60, Math.floor(tower.fireRate * 0.85));
                tower.range = Math.floor(tower.range * 1.1);
                this.changeCurrency(-diamondCostPerTower, 0);
            }
        });
        
        this.updateUI();
        this.updateGlobalUpgradeButtons(towerType);
        this.debugSuccess(`${eligibleTowers.length} qüllə awaken edildi!`);
    }
    
    // Mağaza qülləsi atəş gücünü artır
    upgradeShopTowerDamage(towerType) {
        if (!towerType) return;
        
        // Pul ilə alınan qüllələr üçün elmas, ulduzla alınan qüllələr üçün ulduz
        const isStarTower = this.towerStarCosts[towerType] && this.towerStarCosts[towerType] > 0;
        const cost = 1; // Hər ikisi üçün 1
        const currencyName = isStarTower ? 'ulduz' : 'elmas';
        const currencyIcon = isStarTower ? '⭐' : '💎';
        
        // Valyuta yoxlaması
        if (isStarTower) {
            if (this.stars < cost) {
                this.showTooltip(`Kifayət qədər ${currencyName} yoxdur! Lazım: ${cost}${currencyIcon}, Mövcud: ${this.stars}${currencyIcon}`, 'error');
                return;
            }
        } else {
            if (this.diamonds < cost) {
                this.showTooltip(`Kifayət qədər ${currencyName} yoxdur! Lazım: ${cost}${currencyIcon}, Mövcud: ${this.diamonds}${currencyIcon}`, 'error');
                return;
            }
        }
        
        // Yüksəltməni tətbiq et
        if (!this.towerShopUpgrades) {
            this.towerShopUpgrades = {};
        }
        if (!this.towerShopUpgrades[towerType]) {
            this.towerShopUpgrades[towerType] = { damage: 0, fireRate: 0 };
        }
        
        this.towerShopUpgrades[towerType].damage += 1;
        
        // Valyutanı azalt
        if (isStarTower) {
            this.changeCurrency(0, -cost);
        } else {
            this.changeCurrency(-cost, 0);
        }
        
        // Bütün mövcud qüllələrin damage dəyərlərini yenilə
        // Base damage-i yenilə, sonra damageUp yüksəltmələrini yenidən tətbiq et
        this.towers.forEach(tower => {
            if (tower.type === towerType) {
                const baseDamage = this.getTowerDamage(towerType);
                // damageUp yüksəltmələrini yenidən tətbiq et (hər yüksəltmə 20% artırır)
                let newDamage = baseDamage;
                for (let i = 0; i < (tower.damageUp || 0); i++) {
                    newDamage = Math.floor(newDamage * 1.2);
                }
                tower.damage = newDamage;
            }
        });
        
        // localStorage-da saxla
        localStorage.setItem('towerDefenseShopUpgrades', JSON.stringify(this.towerShopUpgrades));
        if (!isStarTower) {
            localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        }
        
        // UI-u yenilə
        this.updateUI();
        
        // Kontekst menyusunu yenilə
        this.updateShopContextMenu(towerType);
        
        // Seçilmiş qüllənin məlumatlarını yenilə (əgər eyni tipdirsə)
        if (this.selectedTower && this.selectedTower.type === towerType) {
            this.updateTowerInfo();
        }
        
        const currencyDisplay = isStarTower ? `${this.stars}${currencyIcon}` : `${this.diamonds}${currencyIcon}`;
        this.debugSuccess(`${towerType} qülləsi atəş gücü artırıldı (+1). Qalan ${currencyName}: ${currencyDisplay}`);
    }
    
    // Mağaza qülləsi atəş sürətini artır (maksimum 5)
    upgradeShopTowerFireRate(towerType) {
        if (!towerType) return;
        
        // Pul ilə alınan qüllələr üçün elmas, ulduzla alınan qüllələr üçün ulduz
        const isStarTower = this.towerStarCosts[towerType] && this.towerStarCosts[towerType] > 0;
        const currencyName = isStarTower ? 'ulduz' : 'elmas';
        const currencyIcon = isStarTower ? '⭐' : '💎';
        
        // Yüksəltməni tətbiq et
        if (!this.towerShopUpgrades) {
            this.towerShopUpgrades = {};
        }
        if (!this.towerShopUpgrades[towerType]) {
            this.towerShopUpgrades[towerType] = { damage: 0, fireRate: 0 };
        }
        
        // Maksimum 5 yüksəltmə
        const currentUpgrades = this.towerShopUpgrades[towerType].fireRate;
        if (currentUpgrades >= 5) {
            this.showTooltip('Atəş sürəti artırma maksimum 5 yüksəltmədir!', 'error');
            return;
        }
        
        // Qiymətlər: 1, 5, 10, 20, 50
        const costs = [1, 5, 10, 20, 50];
        const cost = costs[currentUpgrades];
        
        // Valyuta yoxlaması
        if (isStarTower) {
            if (this.stars < cost) {
                this.showTooltip(`Kifayət qədər ${currencyName} yoxdur! Lazım: ${cost}${currencyIcon}, Mövcud: ${this.stars}${currencyIcon}`, 'error');
                return;
            }
        } else {
            if (this.diamonds < cost) {
                this.showTooltip(`Kifayət qədər ${currencyName} yoxdur! Lazım: ${cost}${currencyIcon}, Mövcud: ${this.diamonds}${currencyIcon}`, 'error');
                return;
            }
        }
        
        this.towerShopUpgrades[towerType].fireRate += 1;
        
        // Valyutanı azalt
        if (isStarTower) {
            this.changeCurrency(0, -cost);
        } else {
            this.changeCurrency(-cost, 0);
        }
        
        // Bütün mövcud qüllələrin fireRate dəyərlərini yenilə
        // Base fireRate-i yenilə, sonra rateUp yüksəltmələrini yenidən tətbiq et
        this.towers.forEach(tower => {
            if (tower.type === towerType) {
                const baseFireRate = this.getTowerFireRate(towerType);
                // rateUp yüksəltmələrini yenidən tətbiq et (hər yüksəltmə fireRate-i 15% azaldır, yəni sürəti artırır)
                let newFireRate = baseFireRate;
                for (let i = 0; i < (tower.rateUp || 0); i++) {
                    newFireRate = Math.max(80, Math.floor(newFireRate * 0.85)); // 15% azaltmaq = 15% sürət artırmaq, minimum 80ms
                }
                tower.fireRate = newFireRate;
            }
        });
        
        // localStorage-da saxla
        localStorage.setItem('towerDefenseShopUpgrades', JSON.stringify(this.towerShopUpgrades));
        if (!isStarTower) {
            localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        }
        
        // UI-u yenilə
        this.updateUI();
        
        // Kontekst menyusunu yenilə
        this.updateShopContextMenu(towerType);
        
        // Seçilmiş qüllənin məlumatlarını yenilə (əgər eyni tipdirsə)
        if (this.selectedTower && this.selectedTower.type === towerType) {
            this.updateTowerInfo();
        }
        
        const currencyDisplay = isStarTower ? `${this.stars}${currencyIcon}` : `${this.diamonds}${currencyIcon}`;
        this.debugSuccess(`${towerType} qülləsi atəş sürəti artırıldı (+${currentUpgrades + 1}). Qalan ${currencyName}: ${currencyDisplay}`);
    }
    
    // Oyun vəziyyətini yadda saxla (online: API, offline: localStorage)
    async saveGameState(showMessage = true) {
        if (this.gameState.gameOver) return;
        
        // Offline ikən localStorage'a kaydet
        const shouldUseLocalStorage = this.useLocalStorage || (!this.isOnline && this.API_BASE_URL);
        
        // localStorage istifadə et (GitHub Pages və Render üçün VƏ offline ikən)
        if (shouldUseLocalStorage) {
            try {
                // Calculate game duration excluding paused time
            const gameDuration = this.gameStartTime 
                ? Math.floor((Date.now() - this.gameStartTime - this.totalPausedTime) / 1000) 
                : 0;
                
                const gameStateData = {
                    gameState: {
                        health: this.gameState.health,
                        money: this.gameState.money,
                        wave: this.gameState.wave,
                        score: this.gameState.score,
                        gameOver: this.gameState.gameOver
                    },
                    towers: this.towers.map(t => ({
                        col: t.col,
                        row: t.row,
                        type: t.type,
                        level: t.level,
                        range: t.range,
                        damage: t.damage,
                        fireRate: t.fireRate,
                        health: t.health,
                        maxHealth: t.maxHealth,
                        rangeUp: t.rangeUp || 0,
                        damageUp: t.damageUp || 0,
                        rateUp: t.rateUp || 0,
                        healthUp: t.healthUp || 0,
                        awakened: t.awakened || false,
                        shielded: t.shielded || false,
                        autoHealEnabled: t.autoHealEnabled || false,
                        autoHealThreshold: t.autoHealThreshold || 5,
                        plasmaActivated: t.plasmaActivated || false,
                        plasmaPairId: t.plasmaPairId || null,
                        side: t.side || null
                    })),
                    diamonds: this.diamonds,
                    stars: this.stars,
                    currentLevel: this.currentLevel,
                    levelMultiplier: this.levelMultiplier,
                    rows: this.rows,
                    cols: this.cols,
                    // Qala və başlanğıc mövqeyi qeyd et
                    goalCell: this.goalCell ? { col: this.goalCell.col, row: this.goalCell.row } : null,
                    startCell: this.startCell ? { col: this.startCell.col, row: this.startCell.row } : null,
                    enemiesKilledThisGame: this.enemiesKilledThisGame,
                    gameDuration: gameDuration,
                    gameStartTime: this.gameStartTime,
                    // Pause sistemi qeyd et
                    totalPausedTime: this.totalPausedTime,
                    isPaused: this.isPaused,
                    // Mağaza yüksəltmələri qeyd et
                    towerShopUpgrades: this.towerShopUpgrades || { basic: { damage: 0, fireRate: 0 }, rapid: { damage: 0, fireRate: 0 }, heavy: { damage: 0, fireRate: 0 } },
                    // Global auto-heal settings qeyd et
                    globalAutoHealSettings: this.globalAutoHealSettings || {},
                    // Global auto-heal threshold qeyd et
                    globalAutoHealThreshold: this.getGlobalAutoHealThreshold()
                };
                
                // localStorage-da saxla
                localStorage.setItem('towerDefenseGameState', JSON.stringify(gameStateData));
                localStorage.setItem('towerDefenseGameStateTime', Date.now().toString());
                
                if (showMessage) {
                    this.showTooltip('✅ Oyun vəziyyəti saxlanıldı! (localStorage)', 'success');
                }
                this.debugSuccess('Oyun vəziyyəti localStorage-da saxlanıldı');
                return;
            } catch (error) {
                console.error('Save game state to localStorage error:', error);
                if (showMessage) {
                    this.showTooltip(`❌ Oyun vəziyyəti saxlanılmadı: ${error.message}`, 'error');
                }
                return;
            }
        }
        
        // Backend istifadə et (local server üçün)
        if (!this.userId) return;
        
        try {
            // Calculate game duration excluding paused time
            const gameDuration = this.gameStartTime 
                ? Math.floor((Date.now() - this.gameStartTime - this.totalPausedTime) / 1000) 
                : 0;
            
            const gameStateData = {
                gameState: {
                    health: this.gameState.health,
                    money: this.gameState.money,
                    wave: this.gameState.wave,
                    score: this.gameState.score,
                    gameOver: this.gameState.gameOver
                },
                towers: this.towers.map(t => ({
                    col: t.col,
                    row: t.row,
                    type: t.type,
                    level: t.level,
                    range: t.range,
                    damage: t.damage,
                    fireRate: t.fireRate,
                    health: t.health,
                    maxHealth: t.maxHealth,
                    rangeUp: t.rangeUp || 0,
                    damageUp: t.damageUp || 0,
                    rateUp: t.rateUp || 0,
                    healthUp: t.healthUp || 0,
                    awakened: t.awakened || false,
                    shielded: t.shielded || false,
                    autoHealEnabled: t.autoHealEnabled || false,
                    autoHealThreshold: t.autoHealThreshold || 5,
                    plasmaActivated: t.plasmaActivated || false,
                    plasmaPairId: t.plasmaPairId || null,
                    side: t.side || null
                })),
                diamonds: this.diamonds,
                stars: this.stars,
                currentLevel: this.currentLevel,
                levelMultiplier: this.levelMultiplier,
                rows: this.rows,
                cols: this.cols,
                // Qala və başlanğıc mövqeyi qeyd et
                goalCell: this.goalCell ? { col: this.goalCell.col, row: this.goalCell.row } : null,
                startCell: this.startCell ? { col: this.startCell.col, row: this.startCell.row } : null,
                enemiesKilledThisGame: this.enemiesKilledThisGame,
                gameDuration: gameDuration,
                gameStartTime: this.gameStartTime,
                // Pause sistemi qeyd et
                totalPausedTime: this.totalPausedTime,
                isPaused: this.isPaused,
                // Mağaza yüksəltmələri qeyd et
                towerShopUpgrades: this.towerShopUpgrades || { basic: { damage: 0, fireRate: 0 }, rapid: { damage: 0, fireRate: 0 }, heavy: { damage: 0, fireRate: 0 } },
                // Global auto-heal settings qeyd et
                globalAutoHealSettings: this.globalAutoHealSettings || {},
                // Global auto-heal threshold qeyd et
                globalAutoHealThreshold: this.getGlobalAutoHealThreshold()
            };
            
            if (!this.API_BASE_URL) {
                if (showMessage) {
                    this.showTooltip('ℹ️ API server yoxdur. localStorage istifadə edilir.', 'info');
                }
                return;
            }
            
            const response = await fetch(`${this.API_BASE_URL}/save-game-state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    game_state: gameStateData,
                    is_game_over: this.gameState.gameOver
                })
            });
            
            const data = await response.json();
            if (data.success) {
                if (showMessage) {
                    this.showTooltip('✅ Oyun vəziyyəti uğurla saxlanıldı!', 'success');
                }
                this.debugSuccess('✅ Oyun vəziyyəti saxlanıldı');
            } else {
                if (showMessage) {
                    this.showTooltip(`❌ Oyun vəziyyəti saxlanılmadı: ${data.error || 'Naməlum xəta'}`, 'error');
                }
                this.debugError(`Oyun vəziyyəti saxlanılmadı: ${data.error}`);
            }
        } catch (error) {
            console.error('Save game state error:', error);
            if (showMessage) {
                this.showTooltip(`❌ Oyun vəziyyəti saxlanılmadı: ${error.message}`, 'error');
            }
            this.debugError(`Oyun vəziyyəti saxlanılmadı: ${error.message}`);
        }
    }
    
    // Oyun vəziyyətini yüklə
    async loadGameState() {
        // GitHub Pages-də localStorage istifadə et
        if (this.useLocalStorage) {
            try {
                const savedState = localStorage.getItem('towerDefenseGameState');
                const savedTime = localStorage.getItem('towerDefenseGameStateTime');
                
                if (savedState) {
                    const gameStateData = JSON.parse(savedState);
                    return {
                        success: true,
                        game_state: gameStateData,
                        is_game_over: gameStateData.gameState.gameOver || false,
                        saved_at: savedTime ? new Date(parseInt(savedTime)).toISOString() : null
                    };
                }
                return null;
            } catch (error) {
                console.error('Load game state from localStorage error:', error);
                return null;
            }
        }
        
        // Backend istifadə et
        if (!this.userId) return null;
        
        try {
            if (!this.API_BASE_URL) {
                return null;
            }
            
            // Timeout ekle - 5 saniyədən çox gözləmə
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const loadStartTime = performance.now();
            this.debugLog('[PERF] loadGameState() API call started');
            
            const response = await fetch(`${this.API_BASE_URL}/load-game-state?user_id=${this.userId}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const data = await response.json();
            
            const loadEndTime = performance.now();
            this.debugLog(`[PERF] loadGameState() API call completed in ${(loadEndTime - loadStartTime).toFixed(2)}ms`);
            
            if (data.success && data.game_state) {
                return data;
            }
            
            return null;
        } catch (error) {
            if (error.name === 'AbortError') {
                this.debugLog('[PERF] loadGameState() API timeout');
            } else {
                console.error('Load game state error:', error);
            }
            return null;
        }
    }
    
    // Oyun vəziyyətini bərpa et (qeyddən)
    restoreGameState(savedData) {
        if (!savedData || !savedData.game_state) return;
        
        const state = savedData.game_state;
        
        // Əsas oyun vəziyyəti
        if (state.gameState) {
            // Para dəyəri - əgər undefined/null isə 500, lakin 0 geçərli bir dəyərdir (istifadəçi parasını xərcləyib ola bilər)
            const savedMoney = state.gameState.money;
            const money = (savedMoney !== undefined && savedMoney !== null) ? savedMoney : 500;
            
            this.gameState = {
                health: state.gameState.health || 100,
                money: money,  // Kayıtlı para dəyərini saxla (0 də olabilir)
                wave: state.gameState.wave || 1,
                score: state.gameState.score || 0,
                gameOver: state.gameState.gameOver || false
            };
        }
        
        // Qüllələr - köhnə col/row mövqelərini saxla (grid genişləndirilmiş olsa belə)
        // Pixel koordinatları sonradan hesablanacaq (grid ölçüsü yeniləndikdən sonra)
        // NOTE: col/row dəyərləri updateGridDimensions() çağrıldıqdan SONRA clamp ediləcək
        if (state.towers && Array.isArray(state.towers)) {
            this.towers = state.towers.map(t => {
                // Qüllənin köhnə grid mövqesini saxla (col, row)
                // Pixel koordinatları sonradan yenidən hesablanacaq
                return {
                    col: t.col || 0,
                    row: t.row || 0,
                    cellId: null, // Sonradan yenidən hesablanacaq
                    x: 0, // Sonradan hesablanacaq
                    y: 0, // Sonradan hesablanacaq
                    type: t.type,
                    level: t.level || 1,
                    range: t.range || this.getTowerRange(t.type),
                    damage: t.damage || this.getTowerDamage(t.type),
                    fireRate: t.fireRate || this.getTowerFireRate(t.type),
                    health: t.health || 100,
                    maxHealth: t.maxHealth || 100,
                    rangeUp: t.rangeUp || 0,
                    damageUp: t.damageUp || 0,
                    rateUp: t.rateUp || 0,
                    healthUp: t.healthUp || 0,
                    awakened: t.awakened || false,
                    shielded: t.shielded || false,
                    autoHealEnabled: t.autoHealEnabled || false,
                    autoHealThreshold: t.autoHealThreshold || 5,
                    lastShot: 0,
                    target: null,
                    highlightUntil: Date.now() + 1200,
                    plasmaActivated: t.plasmaActivated || false,
                    plasmaPairId: t.plasmaPairId || null,
                    side: t.side || null
                };
            });
        }
        
        // Resurslar
        if (state.diamonds !== undefined) {
            this.diamonds = state.diamonds;
            localStorage.setItem('towerDefenseDiamonds', this.diamonds.toString());
        }
        if (state.stars !== undefined) {
            this.stars = state.stars;
            localStorage.setItem('towerDefenseStars', this.stars.toString());
        }
        
        // Səviyyə
        if (state.currentLevel !== undefined) {
            this.currentLevel = state.currentLevel;
        }
        if (state.levelMultiplier !== undefined) {
            this.levelMultiplier = state.levelMultiplier;
        }
        
        // Grid ölçüsü - əgər localStorage-da genişləndirilmiş grid varsa, onu istifadə et
        // Qüllələr köhnə col/row mövqelərində qalacaq, lakin grid genişləndirilə bilər
        let savedRows = state.rows !== undefined ? state.rows : this.rows;
        let savedCols = state.cols !== undefined ? state.cols : this.cols;
        
        // localStorage-dan cari grid ölçüsünü yoxla (genişləndirilmiş ola bilər)
        try {
            const currentRows = parseInt(localStorage.getItem('td_board_rows') || '');
            const currentCols = parseInt(localStorage.getItem('td_board_cols') || '');
            if (Number.isFinite(currentRows) && Number.isFinite(currentCols) && currentRows > 0 && currentCols > 0) {
                // Əgər localStorage-da grid genişləndirilmişdirsə, onu istifadə et
                // Qüllələr köhnə mövqelərdə qalacaq, grid isə genişlənmiş olacaq
                if (currentRows >= savedRows && currentCols >= savedCols) {
                    this.rows = currentRows;
                    this.cols = currentCols;
                    this.debugLog(`📐 Grid genişləndirilmişdir: qeyddən ${savedRows}x${savedCols}, localStorage-dan ${currentRows}x${currentCols}`);
                    this.debugLog(`📐 Qüllələr köhnə mövqelərdə qalacaq, grid genişləndirilmiş ölçüdə olacaq`);
                } else {
                    // Əgər localStorage-da grid kiçildilibsə, qeyddəki ölçüdən istifadə et
                    this.rows = savedRows;
                    this.cols = savedCols;
                }
            } else {
                // localStorage-da grid yoxdursa, qeyddəki ölçüdən istifadə et
                this.rows = savedRows;
                this.cols = savedCols;
            }
        } catch (e) {
            // Xəta olduqda, qeyddəki ölçüdən istifadə et
            this.rows = savedRows;
            this.cols = savedCols;
        }
        
        // Canvas boyutlarının hazır olmasını təmin et
        // setupHighDPIRendering() çağrılmış olmalıdır
        if (this.canvas && (!this.canvas.width || !this.canvas.height)) {
            this.setupHighDPIRendering();
        }
        
        // Grid ölçüsü dəyişdikdə, grid parametrlərini yenilə
        this.updateGridDimensions();
        
        // Qala və başlanğıc mövqeyi yüklə (əgər qeyd edilibsə)
        if (state.goalCell && state.goalCell.col !== undefined && state.goalCell.row !== undefined) {
            // Qeyd edilmiş mövqeyi yeni grid ölçüsünə uyğunlaşdır
            const savedGoalCol = Math.max(0, Math.min(this.gridCols - 1, state.goalCell.col));
            const savedGoalRow = Math.max(0, Math.min(this.gridRows - 1, state.goalCell.row));
            this.goalCell = { col: savedGoalCol, row: savedGoalRow };
            this.debugLog(`🗼 Qala mövqeyi yükləndi: (${savedGoalCol}, ${savedGoalRow})`);
        } else {
            // Qeyd edilməmişsə, default mövqeyi təyin et
            const midRow = Math.floor(this.gridRows / 2);
            this.goalCell = { col: this.gridCols - 1, row: midRow };
            this.debugLog(`🗼 Qala mövqeyi default: (${this.goalCell.col}, ${this.goalCell.row})`);
        }
        
        if (state.startCell && state.startCell.col !== undefined && state.startCell.row !== undefined) {
            // Qeyd edilmiş mövqeyi yeni grid ölçüsünə uyğunlaşdır
            const savedStartCol = Math.max(0, Math.min(this.gridCols - 1, state.startCell.col));
            const savedStartRow = Math.max(0, Math.min(this.gridRows - 1, state.startCell.row));
            this.startCell = { col: savedStartCol, row: savedStartRow };
            this.debugLog(`🚪 Başlanğıc mövqeyi yükləndi: (${savedStartCol}, ${savedStartRow})`);
        } else {
            // Qeyd edilməmişsə, default mövqeyi təyin et
            const midRow = Math.floor(this.gridRows / 2);
            this.startCell = { col: 0, row: midRow };
            this.debugLog(`🚪 Başlanğıc mövqeyi default: (${this.startCell.col}, ${this.startCell.row})`);
        }
        
        // Cell ID grid-i yenidən yarat (yeni grid ölçüsü üçün)
        this.initCellIds();
        
        // Qüllələrin pixel koordinatlarını və cell ID-lərini yenidən hesabla (grid ölçüsü dəyişdikdən sonra)
        // updateTowerPositions() funksiyasını istifadə et - daha təhlükəsiz
        this.updateTowerPositions();
        
        // Statistikalar
        if (state.enemiesKilledThisGame !== undefined) {
            this.enemiesKilledThisGame = state.enemiesKilledThisGame;
        }
        if (state.gameStartTime !== undefined) {
            this.gameStartTime = state.gameStartTime;
        }
        
        // Pause sistemi yüklə
        if (state.totalPausedTime !== undefined) {
            this.totalPausedTime = state.totalPausedTime;
        }
        if (state.isPaused !== undefined) {
            // Eğer kayıt sırasında pause'daydıysa, resume et (çünkü yüklerken baştan başlıyor)
            this.isPaused = false;
            this.pauseStartTime = null;
            
            // UI butonlarını güncelle
            const pauseBtn = document.getElementById('pauseGame');
            const resumeBtn = document.getElementById('resumeGame');
            if (pauseBtn) pauseBtn.style.display = 'block';
            if (resumeBtn) resumeBtn.style.display = 'none';
        }
        
        // Mağaza yüksəltmələri qeyddən yüklə
        if (state.towerShopUpgrades) {
            this.towerShopUpgrades = state.towerShopUpgrades;
            localStorage.setItem('towerDefenseShopUpgrades', JSON.stringify(this.towerShopUpgrades));
            
            // Bütün qüllələrin damage və fireRate dəyərlərini yenilə (mağaza yüksəltmələri ilə)
            this.towers.forEach(tower => {
                if (tower.type && ['basic', 'rapid', 'heavy'].includes(tower.type)) {
                    const baseDamage = this.getTowerDamage(tower.type);
                    // damageUp yüksəltmələrini yenidən tətbiq et
                    let newDamage = baseDamage;
                    for (let i = 0; i < (tower.damageUp || 0); i++) {
                        newDamage = Math.floor(newDamage * 1.2);
                    }
                    tower.damage = newDamage;
                    
                    const baseFireRate = this.getTowerFireRate(tower.type);
                    // rateUp yüksəltmələrini yenidən tətbiq et
                    let newFireRate = baseFireRate;
                    for (let i = 0; i < (tower.rateUp || 0); i++) {
                        newFireRate = Math.max(80, Math.floor(newFireRate * 0.85));
                    }
                    tower.fireRate = newFireRate;
                }
            });
        }
        
        // Global auto-heal settings-i bərpa et
        if (state.globalAutoHealSettings) {
            this.globalAutoHealSettings = state.globalAutoHealSettings;
            
            // Bərpa edilən settings-i mövcud qüllələrə tətbiq et
            Object.keys(this.globalAutoHealSettings).forEach(towerType => {
                const settings = this.globalAutoHealSettings[towerType];
                if (settings.enabled) {
                    this.towers.forEach(tower => {
                        if (tower.type === towerType) {
                            tower.autoHealEnabled = true;
                            tower.autoHealThreshold = settings.threshold;
                        }
                    });
                }
            });
        }
        
        // Global auto-heal threshold-u bərpa et
        if (state.globalAutoHealThreshold !== undefined) {
            this.setGlobalAutoHealThreshold(state.globalAutoHealThreshold);
        }
        
        // Yol yenidən hesabla
        this.recomputePath();
        
        // UI-u yenilə
        this.updateUI();
        
        this.debugSuccess('Oyun vəziyyəti bərpa edildi');
    }
    
    restartGame() {
        // Oyun vəziyyətini sil
        if (!this.useLocalStorage && this.userId && this.API_BASE_URL) {
            fetch(`${this.API_BASE_URL}/delete-game-state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: this.userId
                })
            }).catch(err => console.error('Delete game state error:', err));
        }
        
        // Bütün mağaza yüksəltmələrini sıfırla
        this.towerShopUpgrades = { basic: { damage: 0, fireRate: 0 }, rapid: { damage: 0, fireRate: 0 }, heavy: { damage: 0, fireRate: 0 } };
        localStorage.setItem('towerDefenseShopUpgrades', JSON.stringify(this.towerShopUpgrades));
        
        // Global auto-heal settings-i sıfırla
        this.globalAutoHealSettings = {};
        
        // Global auto-heal threshold-u ilkin dəyərə qaytar (5)
        this.setGlobalAutoHealThreshold(5);
        
        // Reset game start time and enemy counter
        this.gameStartTime = Date.now();
        this.enemiesKilledThisGame = 0;
        
        // Reset pause system
        this.isPaused = false;
        this.pauseStartTime = null;
        this.totalPausedTime = 0;
        
        // Update UI buttons
        const pauseBtn = document.getElementById('pauseGame');
        const resumeBtn = document.getElementById('resumeGame');
        if (pauseBtn) pauseBtn.style.display = 'block';
        if (resumeBtn) resumeBtn.style.display = 'none';
        
        this.debugLog(`🔄 Oyun yenidən başladılır...`);
        
        // Reset game state
        this.gameState = {
            health: 100,
            money: 500,
            wave: 1,
            score: 0,
            gameOver: false
        };
        
        // Reset level system
        this.currentLevel = 1;
        this.levelMultiplier = 1.0;
        
        // Grid ölçüsü saxlanmalıdır - yalnız əgər localStorage-da yoxdursa, ilkin ölçüyə qayıt
        const savedRows = parseInt(localStorage.getItem('td_board_rows') || '');
        const savedCols = parseInt(localStorage.getItem('td_board_cols') || '');
        if (Number.isFinite(savedRows) && Number.isFinite(savedCols) && savedRows > 0 && savedCols > 0) {
            // Grid ölçüsü saxlanılmışdır - onu istifadə et
            this.rows = savedRows;
            this.cols = savedCols;
            this.orientationOverride = true;
            this.debugLog(`📐 Grid ölçüsü saxlanıldı: ${this.rows}x${this.cols}`);
        } else {
            // Grid ölçüsü saxlanılmamışdır - ilkin ölçüyə qayıt
            this.setGridForOrientation();
            this.orientationOverride = false;
        }
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
            enemySpawnDelay: 250, // Düşmənlər dalbadal çıxsın (250ms)
            waveDelay: 3000
        };
        
        // Qeyd edilmiş qala və başlanğıc mövqeyini yüklə (əgər varsa)
        let savedGoalCell = null;
        let savedStartCell = null;
        try {
            const savedState = localStorage.getItem('towerDefenseGameState');
            if (savedState) {
                const gameStateData = JSON.parse(savedState);
                if (gameStateData.goalCell) {
                    savedGoalCell = gameStateData.goalCell;
                }
                if (gameStateData.startCell) {
                    savedStartCell = gameStateData.startCell;
                }
            }
        } catch (e) {
            // Xəta olduqda, default istifadə et
        }
        
        // Grid ölçüsü dəyişdikdə, qala və başlanğıc mövqeyi grid daxilində olub olmadığını yoxla
        this.nextCellId = 1;
        this.initCellIds(); // Re-initialize cell IDs for new grid
        this.updateGridDimensions();
        
        // Yolun hər zaman ortada qalması üçün orta satırı hesabla
        const midRow = Math.floor(this.rows / 2);
        
        // Qala və başlanğıc mövqeyi - qeyd edilmiş varsa column-u istifadə et, amma row-u həmişə ortada qoy
        if (savedGoalCell && savedGoalCell.col !== undefined && savedGoalCell.row !== undefined) {
            const savedGoalCol = Math.max(0, Math.min(this.gridCols - 1, savedGoalCell.col));
            // Row-u hər zaman ortada qoy (yol ortada qalmalıdır)
            this.goalCell = { col: savedGoalCol, row: midRow };
            this.debugLog(`🗼 Qala mövqeyi qeyddən yükləndi (column saxlanıldı, row ortaya alındı): (${savedGoalCol}, ${midRow})`);
        } else {
            // Qeyd edilməmişsə, default mövqeyi təyin et (ortada)
            this.goalCell = { col: this.gridCols - 1, row: midRow };
            this.debugLog(`🗼 Qala mövqeyi default: (${this.goalCell.col}, ${this.goalCell.row})`);
        }
        
        if (savedStartCell && savedStartCell.col !== undefined && savedStartCell.row !== undefined) {
            const savedStartCol = Math.max(0, Math.min(this.gridCols - 1, savedStartCell.col));
            // Row-u hər zaman ortada qoy (yol ortada qalmalıdır)
            this.startCell = { col: savedStartCol, row: midRow };
            this.debugLog(`🚪 Başlanğıc mövqeyi qeyddən yükləndi (column saxlanıldı, row ortaya alındı): (${savedStartCol}, ${midRow})`);
        } else {
            // Qeyd edilməmişsə, default mövqeyi təyin et (ortada)
            this.startCell = { col: 0, row: midRow };
            this.debugLog(`🚪 Başlanğıc mövqeyi default: (${this.startCell.col}, ${this.startCell.row})`);
        }
        
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
            const previousWave = this.gameState.wave;
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
            
            // Hər 10 dalğanın tamamında avtomatik qeyd et
            if (previousWave % 10 === 0 && previousWave > 0) {
                this.saveGameState(false); // Avtomatik qeyd - mesaj göstərmə
                this.debugSuccess(`✅ ${previousWave}. dalğa tamamlandı - Oyun vəziyyəti avtomatik saxlanıldı`);
            }
            
            // Auto start next wave if enabled
            if (this.autoStart) {
                setTimeout(() => {
                    this.startWave();
                }, 2000); // 2 second delay between waves
            }
        }
    }
    
    gameLoop() {
        // CRITICAL: Verify this instance matches global instance
        if (globalGameInstance && this !== globalGameInstance) {
            console.error('[GAME-LOOP] ❌❌❌ CRITICAL: Wrong instance in gameLoop!', {
                currentThis: this,
                globalInstance: globalGameInstance,
                gameStateMatch: this.gameState === globalGameInstance.gameState
            });
            // Use global instance instead
            if (globalGameInstance && globalGameInstance.gameLoop) {
                return globalGameInstance.gameLoop();
            }
        }
        
        const currentTime = Date.now();
        
        // CRITICAL DEBUG: Instance verification
        if (this._loopInstanceId === undefined) {
            this._loopInstanceId = Math.random().toString(36).substr(2, 9);
            console.log('[GAME-LOOP] 🔍 Instance ID:', this._loopInstanceId);
        }
        
        // Game loop - update and render
        if (!this.gameState.gameOver && !this.isPaused) {
            let deltaTime = currentTime - this.lastUpdateTime;
            
            // Tab görünməz olsa belə oyun davam etsin
            // Arxa planda olanda deltaTime məhdudiyyətini yumşalt
            if (document.hidden) {
                // Arxa planda olanda max 500ms (daha tolerant)
                if (deltaTime > 500) {
                    deltaTime = 500;
                }
            } else {
                // Tab görünürdürsə, max 100ms (normal məhdudiyyət)
                if (deltaTime > 100) {
                    deltaTime = 100;
                }
            }
            
            // Apply game speed
            const scaledDeltaTime = deltaTime * this.gameSpeed;
            
            // Spawn enemies
            const speedMultiplier = this.getSpeedMultiplier();
            if (this.waveInProgress && 
                this.currentWaveEnemies < this.waveConfig.enemiesPerWave &&
                currentTime - this.lastEnemySpawn > this.waveConfig.enemySpawnDelay / speedMultiplier) {
                this.spawnEnemy();
                this.lastEnemySpawn = currentTime;
            }
            
            // Update game objects
            this.updateEnemies();
            this.updateEnemyBullets();
            this.updateTowers();
            this.updateBullets();
            this.updateExplosions();
            
            // Update UI
            this.updateUI();
            
            // Check game conditions
            this.checkGameOver();
            this.checkWaveComplete();
            
            // Update last update time
            this.lastUpdateTime = currentTime;
        } else if (this.isPaused) {
            // Oyun pause-dadır, yalnız UI güncəlləmələri (render davam edir)
            this.updateUI();
        }
        
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
        
        // Draw pause message
        if (this.isPaused && !this.gameState.gameOver) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.9;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(this.canvas.width / 2 - 140, this.canvas.height / 2 - 35, 280, 70);
            this.ctx.strokeStyle = '#ff9800';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(this.canvas.width / 2 - 140, this.canvas.height / 2 - 35, 280, 70);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 28px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('⏸️ FASİLƏ', this.canvas.width / 2, this.canvas.height / 2 - 8);
            this.ctx.font = '14px Arial';
            this.ctx.fillStyle = '#cccccc';
            this.ctx.fillText('"▶️ Davam" düyməsinə basın', this.canvas.width / 2, this.canvas.height / 2 + 18);
            this.ctx.restore();
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
        // Tab görünməz olsa belə oyun davam etsin
        if (document.hidden) {
            // Tab görünməzdirsə, setInterval istifadə et
            // setInterval setupVisibilityHandling-də qurulur, amma burada fallback olaraq yoxlayırıq
            if (!this.gameLoopInterval) {
                // Əgər interval yoxdursa (səhv hal), setInterval aktivləşdir
                const self = this;
                this.gameLoopInterval = setInterval(() => {
                    if (self && self.gameLoop) {
                        self.gameLoop();
                    } else {
                        console.error('[GAME-LOOP] ❌ CRITICAL: this context lost in setInterval!', self);
                    }
                }, 16); // ~60 FPS
                this.debugLog('Tab görünməzdir - setInterval fallback aktivləşdirildi');
            }
            // setInterval varsa, o avtomatik davam edəcək (loop-u təkrar çağırmayın)
        } else {
            // Tab görünürdürsə, requestAnimationFrame istifadə et (daha performanslı)
            // setInterval-i təmizlə (əgər varsa)
            if (this.gameLoopInterval) {
                clearInterval(this.gameLoopInterval);
                this.gameLoopInterval = null;
            }
            requestAnimationFrame(() => {
                // CRITICAL: Ensure this is bound correctly
                if (this && this.gameLoop) {
                    this.gameLoop();
                } else {
                    console.error('[GAME-LOOP] ❌ CRITICAL: this context lost!', this);
                }
            });
        }
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
// Sayfa yüklənməsini tezləşdirmək üçün DOMContentLoaded istifadə et (load yox)
// load - bütün resimlər və CSS yüklənəndən sonra (yavaş)
// DOMContentLoaded - DOM hazır olanda (sürətli)

// CRITICAL: Global game instance - ensure only one instance exists
let globalGameInstance = null;

(function() {
    const startTime = performance.now();
    console.log('[PERF] Page initialization started');
    
    function initializeGame() {
        // CRITICAL: Prevent multiple instances
        if (globalGameInstance) {
            console.warn('[INIT] ⚠️ Game already initialized! Skipping duplicate initialization.');
            return;
        }
        
        const initStartTime = performance.now();
        console.log('[PERF] Game constructor starting...');
        
        const game = new TowerDefenseGame();
        globalGameInstance = game; // Store global instance
        
        const initEndTime = performance.now();
        console.log(`[PERF] Game constructor completed in ${(initEndTime - initStartTime).toFixed(2)}ms`);
        
        // init() funksiyasını asenkron çağır - bloklamasın
        game.init().then(() => {
            const totalTime = performance.now() - startTime;
            console.log(`[PERF] Total page load time: ${totalTime.toFixed(2)}ms`);
        }).catch(err => {
            console.error('[PERF] Init error:', err);
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeGame);
    } else {
        // DOM artıq hazırdır
        initializeGame();
    }
})();
