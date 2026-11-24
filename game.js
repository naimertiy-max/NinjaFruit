(() => {
  'use strict';

  /* ============ Referências ============ */
  const canvas        = document.getElementById('game');
  const ctx           = canvas.getContext('2d');
  const scoreEl       = document.getElementById('score');
  const livesEl       = document.getElementById('lives');
  const overlay       = document.getElementById('overlay');
  const finalScoreEl  = document.getElementById('finalScore');
  const restartBtn    = document.getElementById('restart');
  const startScreen   = document.getElementById('startScreen');
  const startBtn      = document.getElementById('startBtn');

  /* ============ Canvas / Resize ============ */
  let W = 0, H = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ============ Utilidades ============ */
  const rand    = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(Math.max(0, Math.min(255, r + 255 * amt)));
    g = Math.round(Math.max(0, Math.min(255, g + 255 * amt)));
    b = Math.round(Math.max(0, Math.min(255, b + 255 * amt)));
    return `rgb(${r},${g},${b})`;
  }

  // distância de um segmento de reta até o centro de um círculo
  function segmentCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, py = y1 + t * dy;
    const ddx = px - cx, ddy = py - cy;
    return ddx * ddx + ddy * ddy <= r * r;
  }

  /* ============ Constantes ============ */
  const GRAVITY    = 1500;  // px/s²
  const TRAIL_LIFE = 140;   // ms de vida do rastro da lâmina

  const FRUIT_TYPES = [
    { outer: '#2e9e4f', inner: '#e63946', r: 46 }, // melancia
    { outer: '#ff8c1a', inner: '#ffc46b', r: 36 }, // laranja
    { outer: '#d62828', inner: '#ffe0b2', r: 34 }, // maçã
    { outer: '#f2c511', inner: '#fdf3a0', r: 32 }, // limão
    { outer: '#7b2cbf', inner: '#c77dff', r: 30 }, // uva
    { outer: '#8b5e34', inner: '#8ac926', r: 33 }, // kiwi
  ];

  /* ============ Estado do jogo ============ */
  const game = {
    fruits: [],
    halves: [],
    particles: [],
    trail: [],
    score: 0,
    lives: 3,
    running: false,
    elapsed: 0,
    spawnTimer: 0,
    spawnInterval: 1.1,
  };

  const shake = { time: 0, dur: 0.25, mag: 0 };

  function triggerShake(mag, dur = 0.25) {
    shake.mag = mag;
    shake.dur = dur;
    shake.time = dur;
  }

  /* ============ HUD / Reset ============ */
  function updateHUD() {
    scoreEl.textContent = game.score;
    livesEl.textContent = '❤️'.repeat(Math.max(0, game.lives));
  }

  function reset() {
    game.fruits.length    = 0;
    game.halves.length    = 0;
    game.particles.length = 0;
    game.trail.length     = 0;
    game.score = 0;
    game.lives = 3;
    game.elapsed = 0;
    game.spawnTimer = 0.5;
    game.spawnInterval = 1.1;
    shake.time = 0;
    updateHUD();
  }

  /* ============ Criação de objetos ============ */
  function spawnFruit(isBomb) {
    const type = isBomb ? null : FRUIT_TYPES[randInt(0, FRUIT_TYPES.length - 1)];
    const r    = isBomb ? 32 : type.r;

    const x = rand(80, Math.max(90, W - 80));
    const targetH = H * rand(0.55, 0.85);       // altura do arremesso
    const vy = -Math.sqrt(2 * GRAVITY * targetH);
    const vx = (W / 2 - x) * 0.55 + rand(-80, 80);

    game.fruits.push({
      x,
      y: H + r + 20,
      vx, vy, r,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-3, 3),
      type,
      bomb: isBomb,
    });
  }

  function cutFruit(f, ang) {
    const nx = -Math.sin(ang);
    const ny =  Math.cos(ang);
    const speed = 140;

    for (const side of [-1, 1]) {
      game.halves.push({
        x: f.x + nx * side * 6,
        y: f.y + ny * side * 6,
        vx: f.vx * 0.55 + nx * side * speed,
        vy: f.vy * 0.55 + ny * side * speed,
        r: f.r,
        rot: ang,
        rotSpeed: rand(-4, 4),
        type: f.type,
        side,
      });
    }

    // partículas de suco
    for (let i = 0; i < 16; i++) {
      const a  = rand(0, Math.PI * 2);
      const sp = rand(60, 320);
      game.particles.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(a) * sp + f.vx * 0.25,
        vy: Math.sin(a) * sp + f.vy * 0.25,
        r: rand(2, 7),
        color: f.type.inner,
        life: 1,
        decay: rand(1.2, 2.4),
      });
    }
  }

  function explode(b) {
    for (let i = 0; i < 45; i++) {
      const a  = rand(0, Math.PI * 2);
      const sp = rand(80, 550);
      game.particles.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(2, 8),
        color: Math.random() < 0.5 ? '#ff8c1a' : '#ffd166',
        life: 1,
        decay: rand(1.0, 2.0),
      });
    }
    triggerShake(22, 0.45);
  }

  /* ============ Corte ============ */
  function sliceAt(x1, y1, x2, y2) {
    for (let i = game.fruits.length - 1; i >= 0; i--) {
      const f = game.fruits[i];
      if (!segmentCircle(x1, y1, x2, y2, f.x, f.y, f.r)) continue;

      game.fruits.splice(i, 1);

      if (f.bomb) {
        explode(f);
        gameOver();
        return;
      }

      cutFruit(f, Math.atan2(y2 - y1, x2 - x1));
      game.score++;
      updateHUD();
    }
  }

  /* ============ Vidas / Fim ============ */
  function loseLife() {
    if (!game.running) return;
    game.lives--;
    updateHUD();
    triggerShake(10, 0.2);
    if (game.lives <= 0) gameOver();
  }

  function gameOver() {
    if (!game.running) return;
    game.running = false;
    game.trail.length = 0;
    finalScoreEl.textContent = `Pontuação: ${game.score}`;
    overlay.classList.remove('hidden');
  }

  /* ============ Update ============ */
  function update(dt) {
    game.elapsed += dt;

    /* --- spawn --- */
    game.spawnInterval = Math.max(0.42, 1.15 - game.elapsed * 0.012);
    game.spawnTimer -= dt;

    if (game.spawnTimer <= 0) {
      game.spawnTimer = game.spawnInterval;

      let count = 1;
      if (game.elapsed > 12 && Math.random() < 0.35) count++;
      if (game.elapsed > 30 && Math.random() < 0.25) count++;

      const bombChance = Math.min(0.22, 0.08 + game.elapsed * 0.003);

      for (let i = 0; i < count; i++) {
        spawnFruit(Math.random() < bombChance);
      }
    }

    /* --- frutas --- */
    for (let i = game.fruits.length - 1; i >= 0; i--) {
      const f = game.fruits[i];
      f.vy  += GRAVITY * dt;
      f.x   += f.vx * dt;
      f.y   += f.vy * dt;
      f.rot += f.rotSpeed * dt;

      if (f.vy > 0 && f.y - f.r > H + 80) {
        game.fruits.splice(i, 1);
        if (!f.bomb) loseLife();
      }
    }

    /* --- metades --- */
    for (let i = game.halves.length - 1; i >= 0; i--) {
      const h = game.halves[i];
      h.vy  += GRAVITY * dt;
      h.x   += h.vx * dt;
      h.y   += h.vy * dt;
      h.rot += h.rotSpeed * dt;

      if (h.y - h.r > H + 120) game.halves.splice(i, 1);
    }

    /* --- partículas --- */
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.vy += GRAVITY * 0.55 * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }

    /* --- rastro --- */
    const now = performance.now();
    while (game.trail.length && now - game.trail[0].t > TRAIL_LIFE) {
      game.trail.shift();
    }

    /* --- tremor --- */
    if (shake.time > 0) shake.time -= dt;
  }

  /* ============ Desenho ============ */
  function drawFruit(f) {
    if (f.bomb) return drawBomb(f);

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);

    const g = ctx.createRadialGradient(-f.r * 0.35, -f.r * 0.35, f.r * 0.1, 0, 0, f.r * 1.05);
    g.addColorStop(0, shade(f.type.outer, 0.25));
    g.addColorStop(1, shade(f.type.outer, -0.32));

    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // brilho
    ctx.beginPath();
    ctx.ellipse(-f.r * 0.32, -f.r * 0.36, f.r * 0.26, f.r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    ctx.restore();
  }

  function drawBomb(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);

    // corpo
    const g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.35, b.r * 0.1, 0, 0, b.r);
    g.addColorStop(0, '#5a5a6e');
    g.addColorStop(1, '#14141c');
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // pavio
    ctx.beginPath();
    ctx.moveTo(0, -b.r);
    ctx.quadraticCurveTo(b.r * 0.45, -b.r * 1.5, b.r * 0.1, -b.r * 1.9);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#c9a227';
    ctx.stroke();

    // faísca
    const t = performance.now() / 90;
    ctx.beginPath();
    ctx.arc(b.r * 0.1, -b.r * 1.9, 4 + Math.sin(t) * 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb703';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 18;
    ctx.fill();

    ctx.restore();
  }

  function drawHalf(h) {
    const a0 = h.side === -1 ? Math.PI : 0;
    const a1 = h.side === -1 ? Math.PI * 2 : Math.PI;

    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);

    // polpa
    ctx.beginPath();
    ctx.arc(0, 0, h.r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = h.type.inner;
    ctx.fill();

    // casca
    ctx.beginPath();
    ctx.arc(0, 0, h.r - 2, a0, a1);
    ctx.lineWidth = 7;
    ctx.strokeStyle = h.type.outer;
    ctx.stroke();

    ctx.restore();
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawTrail() {
    const pts = game.trail;
    if (pts.length < 2) return;

    const now = performance.now();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const a = 1 - (now - p1.t) / TRAIL_LIFE;
      if (a <= 0) continue;

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);

      // núcleo branco
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.95})`;
      ctx.lineWidth = 2 + 12 * a;
      ctx.stroke();

      // brilho azulado
      ctx.strokeStyle = `rgba(120,220,255,${a * 0.5})`;
      ctx.lineWidth = (2 + 12 * a) * 0.45;
      ctx.stroke();
    }

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();

    if (shake.time > 0) {
      const s = shake.mag * (shake.time / shake.dur);
      ctx.translate(rand(-s, s), rand(-s, s));
    }

    for (const h of game.halves)    drawHalf(h);
    for (const f of game.fruits)    drawFruit(f);
    for (const p of game.particles) drawParticle(p);

    ctx.restore();

    drawTrail();
  }

  /* ============ Input ============ */
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerMove(e) {
    if (!game.running) return;

    const p  = pointerPos(e);
    const now = performance.now();
    const prev = game.trail[game.trail.length - 1];

    game.trail.push({ x: p.x, y: p.y, t: now });
    if (game.trail.length > 60) game.trail.shift();

    if (prev) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      if (dx * dx + dy * dy > 4) {
        sliceAt(prev.x, prev.y, p.x, p.y);
      }
    }
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', (e) => {
    if (!game.running) return;
    game.trail.length = 0;
    const p = pointerPos(e);
    game.trail.push({ x: p.x, y: p.y, t: performance.now() });
  });

  /* ============ Loop principal ============ */
  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (game.running) update(dt);
    render();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ============ Botões ============ */
  startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    overlay.classList.add('hidden');
    reset();
    game.running = true;
    lastTime = performance.now();
  });

  restartBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    reset();
    game.running = true;
    lastTime = performance.now();
  });
})();