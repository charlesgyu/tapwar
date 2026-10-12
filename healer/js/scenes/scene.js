// 씬 관리자 — 캔버스/DPR/배율, 카메라, 입력(탭·조이스틱·키보드), 게임 루프, 화면 공간 그리기 헬퍼.
// 각 씬: { enter(params), exit(), update(dt), draw(ctx, view), onTap?(wx, wy, sx, sy), onJoyStart?(), onJoyEnd?(), updateWhileUI?: bool }
const Scenes = (() => {
  const view = { canvas: null, ctx: null, DPR: 1, zoom: 2, viewW: 0, viewH: 0, cam: { x: 0, y: 0 }, cssW: 0, cssH: 0 };
  const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, moved: false, startT: 0 };
  const keys = {};
  const JOY_R = 48; // CSS px
  const scenes = new Map();
  let current = null, currentName = null, last = 0, started = false, paused = false;
  let fps = 0, fpsAcc = 0, fpsN = 0;

  function init(canvasId = 'view') {
    if (started) return;
    view.canvas = document.getElementById(canvasId);
    view.ctx = view.canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    const c = view.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (joy.id !== null) return;
      if (typeof UI !== 'undefined' && UI.isOpen()) return;
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = 0; joy.dy = 0; joy.moved = false; joy.active = false; joy.startT = performance.now();
      try { c.setPointerCapture(e.pointerId); } catch (err) {}
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joy.id) return;
      const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > 10 && !joy.active) { joy.moved = true; joy.active = true; if (current && current.onJoyStart) current.onJoyStart(); }
      if (joy.active) { const k = Math.min(1, d / JOY_R); joy.dx = d ? (dx / d) * k : 0; joy.dy = d ? (dy / d) * k : 0; }
    });
    const end = (e) => {
      if (e.pointerId !== joy.id) return;
      const wasActive = joy.active;
      if (!joy.moved && current && current.onTap) { const w = screenToWorld(e.clientX, e.clientY); current.onTap(w.x, w.y, e.clientX, e.clientY); }
      joy.id = null; joy.active = false; joy.dx = 0; joy.dy = 0;
      if (wasActive && current && current.onJoyEnd) current.onJoyEnd();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    started = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    const c = view.canvas; if (!c) return;
    view.DPR = Math.min(window.devicePixelRatio || 1, 3);
    view.cssW = window.innerWidth; view.cssH = window.innerHeight;
    c.width = Math.round(view.cssW * view.DPR); c.height = Math.round(view.cssH * view.DPR);
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    view.zoom = Math.max(2, Math.round(c.width / 384)); // 폰에서 가로 약 12타일
    view.viewW = c.width / view.zoom; view.viewH = c.height / view.zoom;
    if (current && current.onResize) current.onResize(view);
  }

  function register(name, scene) { scenes.set(name, scene); }
  function go(name, params = {}) {
    const next = scenes.get(name);
    if (!next) { console.error('[Scenes] 없는 씬', name); return; }
    if (current && current.exit) { try { current.exit(); } catch (e) { console.error(e); } }
    joy.id = null; joy.active = false; joy.dx = 0; joy.dy = 0;
    current = next; currentName = name;
    if (typeof Events !== 'undefined') Events.emit('scene_change', { name, params });
    try { current.enter(params || {}); } catch (e) { console.error('[Scenes] enter', name, e); }
  }

  // 좌표 변환: CSS px ↔ 월드 px, 월드 → 캔버스(device) px
  function screenToWorld(sx, sy) { return { x: (sx * view.DPR) / view.zoom + view.cam.x, y: (sy * view.DPR) / view.zoom + view.cam.y }; }
  function worldToScreen(wx, wy) { return { x: (wx - Math.round(view.cam.x)) * view.zoom, y: (wy - Math.round(view.cam.y)) * view.zoom }; }

  // 카메라: target 을 따라가며 월드 경계 안으로 클램프 (worldW/H 가 없으면 클램프 없음)
  function followCamera(target, worldW, worldH, snap = false, offsetY = 20, lerp = 0.12) {
    let tx = target.x - view.viewW / 2, ty = target.y - offsetY - view.viewH / 2;
    if (worldW) { tx = Math.max(0, Math.min(worldW - view.viewW, tx)); if (worldW < view.viewW) tx = (worldW - view.viewW) / 2; }
    if (worldH) { ty = Math.max(0, Math.min(worldH - view.viewH, ty)); if (worldH < view.viewH) ty = (worldH - view.viewH) / 2; }
    if (snap) { view.cam.x = tx; view.cam.y = ty; return; }
    view.cam.x += (tx - view.cam.x) * lerp; view.cam.y += (ty - view.cam.y) * lerp;
  }

  // 키보드/조이스틱 합산 이동 축 (크기 ≤ 1)
  function moveAxis() {
    let vx = 0, vy = 0;
    if (keys['arrowleft'] || keys['a']) vx -= 1;
    if (keys['arrowright'] || keys['d']) vx += 1;
    if (keys['arrowup'] || keys['w']) vy -= 1;
    if (keys['arrowdown'] || keys['s']) vy += 1;
    if (joy.active) { vx = joy.dx; vy = joy.dy; }
    const len = Math.hypot(vx, vy);
    if (!len) return { x: 0, y: 0, len: 0 };
    const k = joy.active ? Math.min(1, len) : 1;
    return { x: (vx / len) * k, y: (vy / len) * k, len: k };
  }

  // 월드 변환 시작/끝 (픽셀 또렷하게: 정수 카메라)
  function beginWorld(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const cx = Math.round(view.cam.x), cy = Math.round(view.cam.y);
    ctx.setTransform(view.zoom, 0, 0, view.zoom, -cx * view.zoom, -cy * view.zoom);
    return { cx, cy };
  }
  function endWorld(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
  function visible(x, y, w, h) { const cx = Math.round(view.cam.x), cy = Math.round(view.cam.y); return !(x + w < cx || x > cx + view.viewW || y + h < cy || y > cy + view.viewH); }

  // ---------- 화면 공간 그리기 헬퍼 ----------
  const FONT = '-apple-system, "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 이름표(건물 간판 등): 월드 좌표 기준, 화면 공간에 또렷한 글자
  function drawLabel(ctx, text, wx, wy, opts = {}) {
    const D = view.DPR, p = worldToScreen(wx, wy);
    if (p.x < -120 || p.x > view.canvas.width + 120 || p.y < -60 || p.y > view.canvas.height + 60) return;
    const fs = Math.round((opts.size || 10) * D);
    ctx.font = `bold ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width + 12 * D, th = fs + 8 * D;
    ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.88)';
    roundRect(ctx, p.x - tw / 2, p.y - th / 2, tw, th, 4 * D); ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(90,64,48,0.6)'; ctx.lineWidth = D; ctx.stroke();
    ctx.fillStyle = opts.color || '#4a3a30'; ctx.fillText(text, p.x, p.y + D * 0.5);
  }
  // 말풍선: 꼬리가 (wx, wy) 를 가리킴
  function drawBubble(ctx, text, wx, wy, opts = {}) {
    const D = view.DPR, p = worldToScreen(wx, wy);
    const fs = Math.round((opts.size || 11) * D);
    ctx.font = `${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width + 14 * D, th = fs + 10 * D;
    let bx = p.x - tw / 2; bx = Math.max(4 * D, Math.min(view.canvas.width - tw - 4 * D, bx));
    ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.96)';
    roundRect(ctx, bx, p.y - th, tw, th, 6 * D); ctx.fill();
    ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = D; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 4 * D, p.y); ctx.lineTo(p.x, p.y + 5 * D); ctx.lineTo(p.x + 4 * D, p.y); ctx.closePath(); ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.fillStyle = opts.color || '#2a2020'; ctx.fillText(text, bx + tw / 2, p.y - th / 2 + D * 0.5);
  }
  // 작은 체력바(월드 좌표 위, 화면 공간): value/max, 색
  function drawMiniBar(ctx, wx, wy, value, max, opts = {}) {
    const D = view.DPR, p = worldToScreen(wx, wy);
    const w = (opts.w || 26) * D, h = (opts.h || 4) * D;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p.x - w / 2 - D, p.y - D, w + 2 * D, h + 2 * D);
    ctx.fillStyle = opts.bg || '#3a2a2a'; ctx.fillRect(p.x - w / 2, p.y, w, h);
    ctx.fillStyle = opts.color || '#e04a4a'; ctx.fillRect(p.x - w / 2, p.y, w * Math.max(0, Math.min(1, max ? value / max : 0)), h);
  }
  function drawJoystick(ctx) {
    if (!joy.active) return;
    const D = view.DPR, ox = joy.ox * D, oy = joy.oy * D, R = JOY_R * D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2 * D; ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + joy.dx * R, oy + joy.dy * R, R * 0.42, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  }

  // ---------- 루프 ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc >= 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (current && !paused) {
      const uiOpen = typeof UI !== 'undefined' && UI.isOpen();
      try { if (!uiOpen || current.updateWhileUI) current.update(dt); } catch (e) { console.error('[Scenes] update', e); }
      try { current.draw(view.ctx, view); } catch (e) { console.error('[Scenes] draw', e); }
    }
    requestAnimationFrame(loop);
  }
  function setPaused(p) { paused = !!p; }

  return { init, register, go, current: () => current, name: () => currentName, view, joy, keys, screenToWorld, worldToScreen, followCamera, moveAxis, beginWorld, endWorld, visible, roundRect, drawLabel, drawBubble, drawMiniBar, drawJoystick, setPaused, fps: () => fps, FONT };
})();
if (typeof module !== 'undefined') module.exports = Scenes;
