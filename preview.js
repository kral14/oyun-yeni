(() => {
  const COLORS = {
    basic: { stroke: '#00d5ff', fill: 'rgba(0,213,255,0.28)' },
    fast: { stroke: '#76ff00', fill: 'rgba(118,255,0,0.28)' },
    heavy: { stroke: '#ff6bff', fill: 'rgba(255,107,255,0.28)' },
  };

  function setSoft(ctx, stroke) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
  }

  function drawEnemy(ctx, type, x, y, heading=0, r=36) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    const c = type==='basic' ? COLORS.basic : type==='fast' ? COLORS.fast : COLORS.heavy;
    ctx.fillStyle = c.fill;
    setSoft(ctx, c.stroke);

    if (type==='basic') {
      const s = r * 1.1;
      ctx.beginPath();
      ctx.rect(-s/2, -s/2, s, s);
      ctx.fill(); ctx.stroke();
    } else if (type==='fast') {
      const s = r * 1.3;
      ctx.beginPath();
      ctx.moveTo(s*0.8, 0);
      ctx.lineTo(-s*0.55, -s*0.6);
      ctx.lineTo(-s*0.55,  s*0.6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else { // tank
      const rr = r * 0.95;
      ctx.beginPath();
      for (let i=0;i<6;i++){
        const a = (Math.PI*2*i)/6;
        const px = Math.cos(a)*rr;
        const py = Math.sin(a)*rr;
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // core
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.arc(0,0,Math.max(4, r*0.35),0,Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawTower(ctx, type, x, y, angle=0, grid=48) {
    const c = type==='basic' ? COLORS.basic : type==='rapid' ? COLORS.fast : COLORS.heavy;
    const baseR = Math.round(grid*0.38);
    // base gradient
    const grad = ctx.createRadialGradient(x,y,1,x,y,baseR);
    grad.addColorStop(0,'rgba(255,255,255,0.12)');
    grad.addColorStop(1,c.fill);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x,y,baseR,0,Math.PI*2); ctx.fill();
    // soft outline
    ctx.lineWidth = 3; ctx.strokeStyle = c.stroke; ctx.stroke();
    // barrel
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
    const len = Math.round(grid*(type==='heavy'?0.75:type==='rapid'?0.5:0.6));
    const bw = Math.round(grid*0.14);
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0,-bw/2,len,bw);
    ctx.fillStyle = c.stroke; ctx.fillRect(len-5,-bw/3,5,(bw/3)*2);
    ctx.restore();
  }

  function withCanvas(id, fn){
    const c = document.getElementById(id);
    const ctx = c.getContext('2d');
    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    const w = c.width, h=c.height;
    c.width = w*dpr; c.height = h*dpr; c.style.width = w+'px'; c.style.height = h+'px';
    ctx.scale(dpr,dpr);
    fn(ctx, w, h);
  }

  window.drawEnemySample = (id, type) => withCanvas(id,(ctx,w,h)=>{
    ctx.clearRect(0,0,w,h);
    // background grid lines subtle
    ctx.fillStyle = '#0b1a12'; ctx.fillRect(0,0,w,h);
    drawEnemy(ctx,type,w/2,h/2, Math.PI*0.03);
  });

  // Animation state per canvas id
  const towerStates = {};

  window.drawTowerSample = (id, type) => withCanvas(id,(ctx,w,h)=>{
    // Initialize state
    if (!towerStates[id]) {
      towerStates[id] = {
        type,
        x: w/2,
        y: h/2,
        angle: -Math.PI/6,
        recoil: 0,
        lastShot: 0,
        fireIntervalMs: type==='rapid' ? 350 : type==='heavy' ? 900 : 600,
        grid: 48
      };
    }

    const loop = (t) => {
      const st = towerStates[id];
      const now = performance.now();
      // Auto-fire schedule
      if (now - st.lastShot > st.fireIntervalMs) {
        st.lastShot = now;
        st.recoil = 1.0; // kick
      }
      // Recoil easing (exponential decay)
      st.recoil *= 0.88; // 0..1

      ctx.clearRect(0,0,w,h); // fully transparent background

      // Match in-game tower look: neon ring base + barrel
      drawTowerGameStyle(ctx, st.type, st.x, st.y, st.angle, st.grid, st.recoil);

      // no range ring to keep only neon circle visible

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  function drawTower3D(ctx, type, x, y, angle=0, grid=48, recoil=0){
    const c = type==='basic' ? COLORS.basic : type==='rapid' ? COLORS.fast : COLORS.heavy;
    const baseR = Math.round(grid*0.42);
    const topH = Math.max(6, Math.round(baseR*0.35));
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y+Math.round(baseR*0.25), baseR*0.9, baseR*0.45, 0,0,Math.PI*2); ctx.fill();
    // Side wall
    const side = ctx.createLinearGradient(x-baseR, y, x+baseR, y);
    side.addColorStop(0,'rgba(0,0,0,0.4)');
    side.addColorStop(0.5, c.fill);
    side.addColorStop(1,'rgba(255,255,255,0.12)');
    ctx.fillStyle = side;
    ctx.beginPath(); ctx.roundRect(x-baseR, y-topH, baseR*2, topH*1.7, Math.round(baseR*0.28)); ctx.fill();
    // Top ellipse
    ctx.lineWidth = 4; ctx.strokeStyle = c.stroke;
    ctx.beginPath(); ctx.ellipse(x, y-topH, baseR, Math.round(baseR*0.45), 0,0,Math.PI*2); ctx.stroke();
    const topG = ctx.createRadialGradient(x-baseR*0.3, y-topH-baseR*0.2, 1, x, y-topH, baseR);
    topG.addColorStop(0,'rgba(255,255,255,0.32)'); topG.addColorStop(1,c.fill);
    ctx.fillStyle = topG; ctx.beginPath(); ctx.ellipse(x, y-topH, baseR*0.98, Math.round(baseR*0.42), 0,0,Math.PI*2); ctx.fill();
    // Barrel
    ctx.save(); ctx.translate(x,y-topH); ctx.rotate(angle);
    const len = Math.round(grid*(type==='heavy'?0.75:type==='rapid'?0.5:0.6));
    const br = Math.round(grid*0.14);
    // Recoil offset: move barrel slightly backwards
    const kick = Math.round((len*0.22) * recoil);
    const tube = ctx.createLinearGradient(0,-br,len,-br); tube.addColorStop(0,'#0f1117'); tube.addColorStop(0.5,'#1a1f2a'); tube.addColorStop(1,'#0f1117');
    ctx.fillStyle=tube; ctx.fillRect(0,-br/2,len,br);
    // Muzzle flash when just fired
    if (recoil > 0.6) {
      ctx.fillStyle = 'rgba(255,240,150,0.9)';
      ctx.beginPath(); ctx.ellipse(len+6,0, Math.round(br*0.9), Math.round(br*0.6), 0,0,Math.PI*2); ctx.fill();
    }
    // Move whole barrel back for recoil feel
    ctx.translate(-kick, 0);
    ctx.fillStyle=c.stroke; ctx.beginPath(); ctx.ellipse(len,0, Math.round(br*0.55), Math.round(br*0.35), 0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Match in-game look: neon ring base and a simple barrel with slight recoil
  function drawTowerGameStyle(ctx, type, x, y, angle=0, grid=48, recoil=0){
    const neonStroke = type==='basic' ? '#00e5ff' : (type==='rapid' ? '#7cff00' : '#ff6bff');
    const baseR = Math.max(6, Math.round(grid * 0.38));
    // No cell highlight or range ring

    // Neon base ring
    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI*2);
    ctx.shadowColor = neonStroke;
    ctx.shadowBlur = Math.max(10, Math.round(grid * 0.35));
    ctx.lineWidth = Math.max(2, Math.round(grid * 0.12));
    ctx.strokeStyle = neonStroke;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Barrel with slight recoil
    const barrelLen = Math.max(8, Math.round(grid * (type==='heavy' ? 0.6 : type==='rapid' ? 0.45 : 0.5)));
    const barrelW = Math.max(3, Math.round(grid * 0.12));
    const kick = Math.round((barrelLen * 0.18) * recoil);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(-kick, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, -barrelW/2, barrelLen, barrelW);
    ctx.fillStyle = neonStroke;
    ctx.fillRect(barrelLen - 4, -barrelW/3, 4, (barrelW/3)*2);
    ctx.restore();

    // Level indicator look (static mock: just a dot)
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y+3, 1.5, 0, Math.PI*2); ctx.fill();
  }
})();


