// Core game and board logic extracted from game.js
// This file attaches methods to a separate class and can be wired from game.js

(function(){
    class ThreeStonesCore {
        constructor(host){
            this.host = host; // reference to main ThreeStonesGame instance
        }

        // ===== Helpers =====
        normalizeGameStateToNodes(){ return this._callHost('normalizeGameStateToNodes_fallback'); }
        findNearestNodeId(x,y){ return this._callHost('findNearestNodeId_fallback', x, y); }

        // ===== Board lifecycle =====
        initializeGameBoard(){ return this._callHost('initializeGameBoard_fallback'); }
        initializeStones(){ return this._callHost('initializeStones_fallback'); }
        updateGameBoard(){ return this._callHost('updateGameBoard_fallback'); }
        createStoneElement(stone,color){ return this._callHost('createStoneElement_fallback', stone, color); }
        selectStone(id){ return this._callHost('selectStone_fallback', id); }
        showPossibleMoves(id){ return this._callHost('showPossibleMoves_fallback', id); }
        makeGraphMove(id,to){ return this._callHost('makeGraphMove_fallback', id, to); }

        // ===== Dice =====
        setupDiceUI(){ return this._callHost('setupDiceUI_fallback'); }
        openDiceModal(){ return this._callHost('openDiceModal_fallback'); }
        closeDiceModal(){ return this._callHost('closeDiceModal_fallback'); }
        showDiceRoll(u,r){ return this._callHost('showDiceRoll_fallback', u, r); }
        applyDiceResult(d){ return this._callHost('applyDiceResult_fallback', d); }
        updateTurnIndicator(){ return this._callHost('updateTurnIndicator_fallback'); }

        // Internals: delegate to host's existing methods (temporary bridge)
        _callHost(name, ...args){
            const h = this.host;
            if (typeof h[name] === 'function') return h[name](...args);
            // If fallback not present, try original method names (for future refactors)
            const original = name.replace(/_fallback$/, '').replace(/_.*/, '');
            if (typeof h[original] === 'function') return h[original](...args);
        }
    }

    // Expose
    window.ThreeStonesCore = ThreeStonesCore;
})();


