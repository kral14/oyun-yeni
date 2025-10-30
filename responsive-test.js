(function(){
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');

  const state = {
    cols: 15,
    rows: 11,
    gridSize: 32,
    offsetX: 0,
    offsetY: 0,
    towers: [], // store logical positions: { col,row,type,range,color,angle }
    enemies: [], // store { col,row,type }
    selectedTower: null,
  };

  function resize() {
    const parent = canvas.parentElement || document.body;
    const headerH = 0;
    const availableH = Math.max(240, window.innerHeight - headerH - 32);
    let cssW = Math.min(parent.clientWidth, Math.round(availableH * 16/9));
    let cssH = Math.round(cssW * 9/16);
    if (cssH > availableH) { cssH = availableH; cssW = Math.round(cssH * 16/9); }

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(1,0,0,1,0,0);

    // board padding (4% of min dimension)
    const cw = canvas.width, ch = canvas.height;
    const pad = Math.max(8, Math.round(Math.min(cw, ch) * 0.04));
    const cellW = Math.floor((cw - pad*2) / state.cols);
    const cellH = Math.floor((ch - pad*2) / state.rows);
    state.gridSize = Math.max(10, Math.min(cellW, cellH));
    const boardW = state.gridSize * state.cols;
    const boardH = state.gridSize * state.rows;
    state.offsetX = Math.round((cw - boardW) / 2);
    state.offsetY = Math.round((ch - boardH) / 2);

    document.getElementById('size').textContent = `Canvas: ${cssW}×${cssH}`;
    document.getElementById('grid').textContent = `Grid: ${state.cols}×${state.rows}`;
    document.getElementById('cell').textContent = `Cell(px): ${state.gridSize}`;
    document.getElementById('meta').textContent = `DPR ${dpr}`;
  }

  function drawGrid(){
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const bw = state.gridSize * state.cols;
    const bh = state.gridSize * state.rows;
    const ox = state.offsetX, oy = state.offsetY;
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(ox, oy, bw, bh);
    const majorEvery = 5;
    for(let c=0;c<=state.cols;c++){
      const x = ox + c*state.gridSize;
      ctx.strokeStyle = (c%majorEvery===0)?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.06)';
      ctx.lineWidth = (c%majorEvery===0)?1.2:1;
      ctx.beginPath(); ctx.moveTo(x+0.5, oy); ctx.lineTo(x+0.5, oy+bh); ctx.stroke();
    }
    for(let r=0;r<=state.rows;r++){
      const y = oy + r*state.gridSize;
      ctx.strokeStyle = (r%majorEvery===0)?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.06)';
      ctx.lineWidth = (r%majorEvery===0)?1.2:1;
      ctx.beginPath(); ctx.moveTo(ox, y+0.5); ctx.lineTo(ox+bw, y+0.5); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(62,166,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox+1, oy+1, bw-2, bh-2);
  }

  function boardToPx(col,row){
    return {
      x: state.offsetX + col*state.gridSize + state.gridSize/2,
      y: state.offsetY + row*state.gridSize + state.gridSize/2
    };
  }

  function drawPath(){
    // path row 6 (0-indexed: row 5), full left->right
    const row = 5;
    const start = boardToPx(0,row), end = boardToPx(state.cols-1,row);
    const outer = Math.max(1, Math.round(state.gridSize*0.8));
    const inner = Math.max(1, Math.round(state.gridSize*0.6));
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.strokeStyle='rgba(101,67,33,0.6)'; ctx.lineWidth=outer;
    ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(end.x,end.y); ctx.stroke();
    ctx.strokeStyle='rgba(139,69,19,0.7)'; ctx.lineWidth=inner;
    ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(end.x,end.y); ctx.stroke();
  }

  function drawTower(t){
    const p = boardToPx(t.col, t.row);
    const neon = t.color;
    const r = Math.max(6, Math.round(state.gridSize*0.38));
    // base ring
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2);
    ctx.shadowColor=neon; ctx.shadowBlur=Math.max(10, Math.round(state.gridSize*0.35));
    ctx.lineWidth = Math.max(2, Math.round(state.gridSize*0.12));
    ctx.strokeStyle = neon; ctx.stroke(); ctx.shadowBlur=0;
    // barrel
    const angle = t.angle || 0; const len = Math.round(state.gridSize*(t.type==='heavy'?0.6:t.type==='rapid'?0.45:0.5));
    const bw = Math.max(3, Math.round(state.gridSize*0.12));
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(angle);
    ctx.fillStyle='#111'; ctx.fillRect(0,-bw/2,len,bw);
    ctx.fillStyle=neon; ctx.fillRect(len-4,-bw/3,4,(bw/3)*2);
    ctx.restore();
    // range only when selected
    if (state.selectedTower === t) {
      ctx.strokeStyle='rgba(74,144,226,0.45)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(p.x,p.y,t.range,0,Math.PI*2); ctx.stroke();
    }
  }

  function drawEnemy(e){
    const p = boardToPx(e.col, e.row);
    const radius = Math.max(8, Math.round((e.type==='fast'?12:14) * (state.gridSize/25)));
    const lw = Math.max(2, Math.round(state.gridSize*0.12));
    ctx.save(); ctx.translate(p.x,p.y);
    const neon = e.type==='basic'?'#00e5ff':e.type==='fast'?'#7cff00':'#ff6bff';
    ctx.shadowColor=neon; ctx.shadowBlur=Math.max(10, Math.round(state.gridSize*0.35));
    ctx.lineWidth=lw; ctx.strokeStyle=neon;
    if(e.type==='basic'){ const s=radius*1.2; ctx.strokeRect(-s/2,-s/2,s,s); }
    else if(e.type==='fast'){ const s=radius*1.4; ctx.beginPath(); ctx.moveTo(s*0.7,0); ctx.lineTo(-s*0.5,-s*0.6); ctx.lineTo(-s*0.5,s*0.6); ctx.closePath(); ctx.stroke(); }
    else { const r=radius*0.9; ctx.beginPath(); for(let i=0;i<6;i++){const a=(Math.PI*2*i)/6; const px=Math.cos(a)*r; const py=Math.sin(a)*r; if(i===0)ctx.moveTo(px,py); else ctx.lineTo(px,py);} ctx.closePath(); ctx.stroke(); }
    ctx.restore(); ctx.shadowBlur=0;
  }

  function render(){
    drawGrid();
    drawPath();
    state.towers.forEach(drawTower);
    state.enemies.forEach(drawEnemy);
  }

  function initContent(){
    // place some towers
    const colors = { basic:'#00e5ff', rapid:'#7cff00', heavy:'#ff6bff' };
    const spots = [ [3,3,'basic'], [6,3,'rapid'], [9,3,'heavy'], [6,7,'basic'] ];
    state.towers = spots.map(([c,r,type])=>({ col:c, row:r, type, color:colors[type], range: Math.round(state.gridSize*3.5) }));
    // enemies along path
    const row = 5; state.enemies = [2,5,8,11].map(col=>({ col, row, type: col%2? 'fast':'basic' }));
  }

  // interactions: select tower to show range
  canvas.addEventListener('click', (e)=>{
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    let hit=null; for(const t of state.towers){ const p=boardToPx(t.col,t.row); if(Math.hypot(p.x-x,p.y-y) <= Math.max(12, state.gridSize*0.5)){ hit=t; break; } }
    state.selectedTower = hit; render();
  });

  window.addEventListener('resize', ()=>{ resize(); render(); });
  window.addEventListener('load', ()=>{ resize(); initContent(); render(); });
})();


