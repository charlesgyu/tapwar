// 모두의 힐러 - 걸어다니는 마을 (유럽풍 목조 마을, 카메라 추적, 건물 문 앞에서 입장)
'use strict';

const WW = 720, WH = 1280;          // 마을 월드 크기
const VIEW_W = 320;                  // 화면에 보이는 가로 폭 (월드 단위)
const LINE = '#5a4636';              // 마을 선 색 (부드러운 갈색 라인아트)
let tcv, tctx, tScale = 1, tT = 0, tLast = 0, cam = { x: 0, y: 0 }, viewH = 640;
let hero = null, joy = null, walkTo = null, nearDoor = null;

// ---------- 건물 배치 (x: 중심, y: 정면 바닥선) ----------
const BUILDINGS = [
  { key: 'tower',   name: '끝없는 탑',     x: 360, y: 262, w: 120, h: 240, tower: true },
  { key: 'office',  name: '모험가 사무소', x: 150, y: 430, w: 190, h: 170, roof: '#c4553f', floors: 2, sign: '📋' },
  { key: 'guild',   name: '길드 회관',     x: 575, y: 430, w: 200, h: 190, roof: '#6d7480', floors: 2, sign: '🛡️', flag: true },
  { key: 'smith',   name: '대장간',        x: 110, y: 680, w: 160, h: 140, roof: '#6b5a52', floors: 1, sign: '⚒️', chimney: true, forge: true },
  { key: 'inn',     name: '여관',          x: 610, y: 690, w: 180, h: 175, roof: '#d9773f', floors: 2, sign: '🍺', balcony: true },
  { key: 'temple',  name: '신전',          x: 360, y: 880, w: 170, h: 210, roof: '#8aa0c8', temple: true, sign: '✝️' },
  { key: 'shop',    name: '상인',          x: 120, y: 940, w: 150, h: 110, stall: true, awning: '#c4553f' },
  { key: 'bank',    name: '은행',          x: 610, y: 950, w: 170, h: 150, roof: '#4f6f63', floors: 1, sign: '💰', columns: true },
  { key: 'auction', name: '경매장',        x: 200, y: 1170, w: 180, h: 150, roof: '#b9772f', floors: 1, sign: '🔨' },
  { key: 'engrave', name: '각인사',        x: 545, y: 1175, w: 140, h: 130, tent: true },
];
BUILDINGS.forEach(b => {
  b.foot = b.tent || b.stall ? 40 : b.tower ? 70 : 62; // 충돌 깊이
  b.door = { x: b.x, y: b.y + 14 };
});
const PROPS = [
  { k: 'well', x: 360, y: 560 },
  { k: 'tree', x: 470, y: 600 }, { k: 'tree', x: 250, y: 780 }, { k: 'tree', x: 670, y: 1050 }, { k: 'tree', x: 40, y: 1060 }, { k: 'tree', x: 690, y: 520 }, { k: 'tree', x: 30, y: 520 },
  { k: 'lamp', x: 250, y: 500 }, { k: 'lamp', x: 470, y: 500 }, { k: 'lamp', x: 250, y: 1010 }, { k: 'lamp', x: 470, y: 1010 }, { k: 'lamp', x: 300, y: 300 }, { k: 'lamp', x: 420, y: 300 },
  { k: 'barrel', x: 215, y: 700 }, { k: 'barrel', x: 228, y: 712 }, { k: 'barrel', x: 515, y: 720 }, { k: 'crate', x: 690, y: 1200 }, { k: 'crate', x: 668, y: 1214 }, { k: 'barrel', x: 330, y: 1200 },
  { k: 'barrel', x: 300, y: 575 }, { k: 'barrel', x: 312, y: 590 }, { k: 'crate', x: 420, y: 585 },
  { k: 'fence', x: 60, y: 820, w: 110 }, { k: 'grass', x: 60, y: 790, w: 110, h: 50 },
  { k: 'stall2', x: 360, y: 1080 }, { k: 'pumpkin', x: 410, y: 1095 },
];
const BUNTING = [[0, 760, 720, 790], [0, 1010, 720, 1000], [60, 330, 660, 340]];
const SOLIDS = () => [
  ...BUILDINGS.map(b => ({ x1: b.x - b.w / 2 + 6, x2: b.x + b.w / 2 - 6, y1: b.y - b.foot, y2: b.y - 2 })),
  { x1: 335, x2: 385, y1: 538, y2: 572 }, // 우물
  ...PROPS.filter(p => p.k === 'tree').map(p => ({ x1: p.x - 8, x2: p.x + 8, y1: p.y - 8, y2: p.y + 4 })),
  { x1: 0, x2: WW, y1: 0, y2: 205 }, // 성벽
];

// ---------- 주민 ----------
const VILLAGERS = Array.from({ length: 9 }, (_, i) => ({
  x: 200 + Math.random() * 320, y: 480 + Math.random() * 640, tx: 0, ty: 0, wait: Math.random() * 3,
  c: ['#c4553f', '#3f7fd9', '#57a35c', '#d9a23f', '#8e6bd1', '#2bb0b5', '#a0522d', '#e58fb0', '#6d7480'][i], hair: ['#5a3d2b', '#e8c55a', '#2b2135', '#c46a3a'][i % 4],
}));

// ================= HUD (DOM) =================
renderTop = function () {
  settleAuction();
  const xp = S.lvl >= MAX_LEVEL ? 100 : S.exp / expNeed(S.lvl) * 100;
  const mq = MAIN_QUESTS[S.quests.main];
  const claimable = (mq && S.best >= mq.floor) || S.quests.town.some(q => q.accepted && q.prog >= q.n && !q.claimed) || S.quests.daily.list.some(q => q.prog >= q.n && !q.claimed) || S.quests.hidden.some(q => S.best >= q.floor);
  $('#top').innerHTML = `
    <div class="th-lv" onclick="G.open('char')"><b>${S.lvl}</b></div>
    <div class="th-mid">
      <div class="th-row"><span class="th-power">🏆 <b>${S.best}F</b></span><span class="th-pill">🪙<b>${fmt(S.gold)}</b><i onclick="G.open('shop')">+</i></span><span class="th-pill gem">💎<b>${fmt(S.mats.holy || 0)}</b><i onclick="G.open('smith')">+</i></span></div>
      <div class="th-xp"><i style="width:${xp}%"></i><small>EXP ${Math.floor(xp)}%</small></div>
    </div>`;
  const fat = Math.round(S.fatigue);
  $('#town-info').innerHTML = `
    <div class="t-left">
      <div class="chip ${fat > 40 ? 'warn' : ''}" onclick="G.open('inn')"><span>😪</span><div class="cbar"><i style="width:${100 - fat}%;background:${fat > 40 ? '#ff4d5e' : '#5be36b'}"></i></div><b>${100 - fat}</b></div>
      <div class="chip" onclick="G.open('shop')"><span>🧪</span><b>${S.cons.hpPot || 0}</b></div>
      <div class="chip" onclick="G.open('shop')"><span>🔷</span><b>${S.cons.mpPot || 0}</b></div>
      <div class="chip" onclick="G.open('char')"><span>🎒</span><b>${S.bag.length}/${bagCap()}</b></div>
    </div>
    <div class="t-quest" onclick="G.open('office')">
      <div class="tq-ic">📜</div>
      <div class="tq-body"><div class="tq-bar"><i style="width:${mq ? Math.min(100, S.best / mq.floor * 100) : 100}%"></i><b>${mq ? `${Math.min(S.best, mq.floor)}/${mq.floor}F` : 'CLEAR'}</b></div>
      <div class="tq-txt">${mq ? mq.title : '세상에 평화가!'}</div></div>
    </div>
    <div class="t-right">
      <button class="rb" onclick="townSettings()">⚙️</button>
      <button class="rb" onclick="G.open('char')">🧝${S.statPts ? '<i class="dot"></i>' : ''}</button>
      <button class="rb" onclick="G.open('office')">📜${claimable ? '<i class="dot"></i>' : ''}</button>
      <button class="rb" onclick="G.open('temple')">✨</button>
      <button class="rb" onclick="G.open('guild')">🛡️${S.guild ? '' : '<i class="dot"></i>'}</button>
    </div>
    <div class="t-bottom">
      <button class="big" onclick="G.open('office')"><span>👥</span><b>${S.party.length + 1}/5</b></button>
      <button id="enter-btn" class="enter" onclick="enterNear()"></button>
      <button class="big tower" onclick="G.open('tower')"><span>🗼</span><b>탑 오르기</b></button>
    </div>`;
  updateEnterBtn(true);
  save();
};
function townSettings() {
  popup(`<b>⚙️ 설정</b><br><small class="dim">모두의 힐러 v0.3</small>`, [
    ['진행 초기화', () => popup('정말 모든 진행을 삭제할까요?', [['삭제', () => { localStorage.removeItem(SAVE_KEY); location.reload(); }, 'red'], ['취소']]), 'red'],
    ['닫기'],
  ]);
}
let lastNear;
function updateEnterBtn(force) {
  const btn = $('#enter-btn'); if (!btn) return;
  if (!force && lastNear === nearDoor) return;
  lastNear = nearDoor;
  btn.style.display = nearDoor ? 'block' : 'none';
  if (nearDoor) btn.innerHTML = `🚪 <b>${nearDoor.name}</b> 들어가기`;
}
function enterNear() { if (nearDoor) G.open(nearDoor.key); }

// ================= 캔버스 / 입력 =================
function setupTown() {
  tcv = $('#tcv'); tctx = tcv.getContext('2d');
  hero = { kind: 'healer', id: 'me', name: '나', role: 'healer', x: 360, y: 640, color: '#fff', icon: '✨', curses: {}, noHud: true, hp: 1, maxHp: 1 };
  const resize = () => {
    const st = $('#town-stage'), w = st.clientWidth, h = st.clientHeight;
    tScale = w / VIEW_W; viewH = h / tScale;
    const dpr = window.devicePixelRatio || 1;
    tcv.style.width = w + 'px'; tcv.style.height = h + 'px';
    tcv.width = w * dpr; tcv.height = h * dpr;
    tctx.setTransform(tScale * dpr, 0, 0, tScale * dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', () => { if ($('#town').style.display !== 'none') resize(); });
  const pos = ev => { const r = tcv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / tScale, y: (ev.clientY - r.top) / tScale }; };
  tcv.addEventListener('pointerdown', ev => { tcv.setPointerCapture(ev.pointerId); const p = pos(ev); joy = { sx: p.x, sy: p.y, dx: 0, dy: 0, moved: false }; });
  tcv.addEventListener('pointermove', ev => {
    if (!joy) return;
    const p = pos(ev), dx = p.x - joy.sx, dy = p.y - joy.sy, l = Math.hypot(dx, dy);
    if (l > 8) { joy.moved = true; joy.dx = dx / l; joy.dy = dy / l; walkTo = null; } else { joy.dx = joy.dy = 0; }
  });
  const up = () => {
    if (!joy) return;
    if (!joy.moved) { // 탭: 그 지점(건물이면 문 앞)으로 걸어가기
      const wx = joy.sx + cam.x, wy = joy.sy + cam.y;
      const b = BUILDINGS.find(b => Math.abs(wx - b.x) < b.w / 2 && wy < b.y + 10 && wy > b.y - b.h - 20);
      walkTo = b ? { x: b.door.x, y: b.door.y, b } : { x: wx, y: wy };
    }
    joy = null;
  };
  tcv.addEventListener('pointerup', up); tcv.addEventListener('pointercancel', up);
}

function solidAt(x, y) { return SOLIDS().some(s => x > s.x1 - 6 && x < s.x2 + 6 && y > s.y1 - 4 && y < s.y2 + 4); }
function moveHero(dt) {
  let dx = 0, dy = 0;
  if (joy && joy.moved) { dx = joy.dx; dy = joy.dy; }
  else if (walkTo) {
    const ddx = walkTo.x - hero.x, ddy = walkTo.y - hero.y, l = Math.hypot(ddx, ddy);
    if (l < 4) { if (walkTo.b) { const b = walkTo.b; walkTo = null; setTimeout(() => G.open(b.key), 150); } else walkTo = null; }
    else { dx = ddx / l; dy = ddy / l; }
  }
  const spd = 120 * dt;
  const nx = clamp(hero.x + dx * spd, 10, WW - 10), ny = clamp(hero.y + dy * spd, 210, WH - 10);
  if (!solidAt(nx, hero.y)) hero.x = nx;
  if (!solidAt(hero.x, ny)) hero.y = ny;
  // 문 근처 감지
  nearDoor = BUILDINGS.find(b => Math.hypot(hero.x - b.door.x, hero.y - b.door.y) < 34) || null;
  updateEnterBtn();
  // 파티원이 줄지어 따라오기
  const trail = hero.trail || (hero.trail = []);
  if (dx || dy) { trail.unshift({ x: hero.x, y: hero.y }); if (trail.length > 120) trail.pop(); }
  // 카메라
  cam.x = clamp(hero.x - VIEW_W / 2, 0, WW - VIEW_W);
  cam.y = clamp(hero.y - viewH * 0.55, 0, Math.max(0, WH - viewH));
}
function followers() {
  const tr = hero.trail || [];
  return S.party.map((m, i) => {
    const p = tr[Math.min(tr.length - 1, (i + 1) * 16)] || { x: hero.x - (i + 1) * 14, y: hero.y + 6 };
    const f = hero._f || (hero._f = {});
    const o = f[m.uid] || (f[m.uid] = { kind: 'ally', id: m.uid, cls: m.cls, role: m.role, color: CLASSES[m.cls].color, icon: CLASSES[m.cls].icon, curses: {}, noHud: true, hp: 1, maxHp: 1, x: p.x, y: p.y });
    o.x += (p.x - o.x) * 0.2; o.y += (p.y - o.y) * 0.2;
    return o;
  });
}
function moveVillagers(dt) {
  for (const v of VILLAGERS) {
    if (v.wait > 0) { v.wait -= dt; v.moving = false; continue; }
    if (!v.tx) { v.tx = 200 + Math.random() * 320; v.ty = 460 + Math.random() * 700; }
    const dx = v.tx - v.x, dy = v.ty - v.y, l = Math.hypot(dx, dy);
    if (l < 3 || solidAt(v.x + dx / l * 3, v.y + dy / l * 3)) { v.tx = 0; v.wait = 1 + Math.random() * 4; continue; }
    v.x += dx / l * 35 * dt; v.y += dy / l * 35 * dt; v.moving = true; v.dir = dx < 0 ? -1 : 1;
  }
}

// ================= 그리기 =================
let groundPat = null;
function ground() {
  if (groundPat) return groundPat;
  const c = document.createElement('canvas'), N = 160; c.width = c.height = N * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  g.fillStyle = '#d6cbb9'; g.fillRect(0, 0, N, N);
  let s = 3; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  // 불규칙한 판석
  for (let i = 0; i < 70; i++) {
    const x = r() * N, y = r() * N, rx = 8 + r() * 10, ry = 6 + r() * 7;
    for (const ox of [0, N, -N]) for (const oy of [0, N, -N]) {
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + r() * 0.3; g.lineTo(x + ox + Math.cos(a) * rx, y + oy + Math.sin(a) * ry); }
      g.closePath(); g.fillStyle = ['#ddd3c2', '#d2c6b2', '#e2d9ca'][i % 3]; g.fill();
      g.strokeStyle = '#b8a991'; g.lineWidth = 0.8; g.stroke();
    }
  }
  return (groundPat = tctx.createPattern(c, 'repeat'));
}
function tL(fill, lw = 1.3) { const g = tctx; g.fillStyle = fill; g.fill(); g.strokeStyle = LINE; g.lineWidth = lw; g.stroke(); }
function tR(x, y, w, h, fill, lw) { tctx.beginPath(); tctx.rect(x, y, w, h); tL(fill, lw); }
function tP(pts, fill, lw) { const g = tctx; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); tL(fill, lw); }
function tE(x, y, rx, ry, fill, lw) { tctx.beginPath(); tctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); tL(fill, lw); }

function drawTown(dt) {
  const g = tctx;
  moveHero(dt); moveVillagers(dt);
  g.save(); g.translate(-cam.x, -cam.y);
  // 바닥
  g.fillStyle = ground(); g.fillRect(cam.x, cam.y, VIEW_W, viewH + 2);
  drawWall();
  // 잔디밭
  for (const p of PROPS.filter(p => p.k === 'grass')) { g.beginPath(); g.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10); tL('#8fbf5a'); }
  // 우물 주변 원형 광장 테두리
  g.strokeStyle = '#c2b39b'; g.lineWidth = 3; g.beginPath(); g.ellipse(360, 560, 110, 55, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#efe7d8'; g.lineWidth = 1.5; g.stroke();
  // 목표 지점 표시
  if (walkTo) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath(); g.ellipse(walkTo.x, walkTo.y, 9 + Math.sin(tT * 8) * 2, 4, 0, 0, Math.PI * 2); g.stroke(); }
  // 깊이 정렬 그리기
  const saveB = B, saveCtx = ctx;
  B = { t: tT, target: null, cast: null }; ctx = g;
  const items = [
    ...BUILDINGS.map(b => ({ y: b.y, f: () => drawBuilding(b) })),
    ...PROPS.filter(p => p.k !== 'grass').map(p => ({ y: p.y, f: () => drawProp(p) })),
    ...VILLAGERS.map(v => ({ y: v.y, f: () => drawVillager(v) })),
    ...followers().map(o => ({ y: o.y, f: () => drawChibi(o) })),
    { y: hero.y, f: () => drawChibi(hero) },
  ].sort((a, b) => a.y - b.y);
  items.forEach(i => i.f());
  B = saveB; ctx = saveCtx;
  // 깃발 장식 (가장 위)
  for (const bt of BUNTING) drawBunting(...bt);
  // 문 근처 표시
  if (nearDoor) { const d = nearDoor.door, by = d.y - 26 + Math.sin(tT * 6) * 3; tP([d.x - 7, by - 8, d.x + 7, by - 8, d.x, by], '#ffd23f', 1.5); }
  // 건물 이름표
  for (const b of BUILDINGS) {
    if (b.y < cam.y - 40 || b.y - b.h > cam.y + viewH) continue;
    const w = b.name.length * 11 + 18, y = b.y + 26;
    g.beginPath(); g.roundRect(b.x - w / 2, y - 11, w, 20, 10); g.fillStyle = nearDoor === b ? '#ffd23fee' : '#3b2c22cc'; g.fill();
    g.font = `12px ${FONT}`; g.textAlign = 'center'; g.fillStyle = nearDoor === b ? '#3b2c22' : '#fff'; g.fillText(b.name, b.x, y + 4);
  }
  // 조이스틱
  if (joy && joy.moved) {
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3.5; g.beginPath(); g.arc(joy.sx + cam.x, joy.sy + cam.y, 34, 0, 7); g.stroke();
    g.fillStyle = 'rgba(59,44,34,.7)'; g.beginPath(); g.arc(joy.sx + cam.x + joy.dx * 20, joy.sy + cam.y + joy.dy * 20, 14, 0, 7); g.fill();
  }
  g.restore();
}

function drawWall() {
  const g = tctx;
  // 하늘/산
  const sky = g.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, '#9fd3ff'); sky.addColorStop(1, '#e6f3ff');
  g.fillStyle = sky; g.fillRect(0, 0, WW, 205);
  for (let i = 0; i < 5; i++) { const cx = ((tT * 6 + i * 170) % (WW + 160)) - 80, cy = 30 + (i % 3) * 18; g.fillStyle = '#ffffffee'; for (const [ox, oy, r] of [[0, 0, 14], [16, -6, 18], [34, 0, 13], [18, 6, 12]]) { g.beginPath(); g.arc(cx + ox, cy + oy, r, 0, 7); g.fill(); } }
  tP([0, 200, 120, 90, 260, 200], '#c8c2b0', 1); tP([200, 200, 380, 70, 560, 200], '#bdb6a3', 1); tP([480, 200, 640, 100, 760, 200], '#c8c2b0', 1);
  // 성벽
  tR(0, 150, WW, 58, '#d8cdb8', 1.5);
  g.strokeStyle = '#b8a991'; g.lineWidth = 1;
  for (let y = 160; y < 208; y += 12) for (let x = ((y - 160) / 12 % 2) * 14; x < WW; x += 28) g.strokeRect(x, y, 28, 12);
  for (let x = 0; x < WW; x += 24) tR(x, 140, 14, 12, '#d8cdb8', 1.2);
  for (const tx of [40, 680]) { tR(tx - 22, 110, 44, 98, '#d8cdb8', 1.5); tP([tx - 28, 112, tx + 28, 112, tx, 64], '#c4553f', 1.5); tR(tx - 6, 140, 12, 18, '#5a4636', 1); }
}

function drawBuilding(b) {
  const g = tctx, { x, y, w, h } = b, t = tT;
  g.fillStyle = 'rgba(70,55,40,.22)'; g.beginPath(); g.ellipse(x + 8, y + 2, w * 0.55, 10, 0, 0, Math.PI * 2); g.fill();
  if (b.tower) return drawTowerGate(b);
  if (b.stall) return drawStall(b);
  if (b.tent) return drawTent(b);
  if (b.temple) return drawTemple(b);
  const wallH = b.floors === 2 ? h * 0.58 : h * 0.48, L0 = x - w / 2, top = y - wallH;
  // 돌 기단
  tR(L0, y - 14, w, 14, '#b9ad9a');
  // 벽 (하프팀버)
  tR(L0, top, w, wallH - 14, '#f1e4cc');
  g.strokeStyle = '#7a5236'; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(L0, top + 1); g.lineTo(L0 + w, top + 1); g.moveTo(L0, y - 14); g.lineTo(L0 + w, y - 14);
  const cols = Math.max(3, Math.round(w / 45));
  for (let i = 0; i <= cols; i++) { const cx = L0 + i * w / cols; g.moveTo(cx, top); g.lineTo(cx, y - 14); }
  if (b.floors === 2) { const my = top + (wallH - 14) * 0.5; g.moveTo(L0, my); g.lineTo(L0 + w, my); for (let i = 0; i < cols; i += 2) { const cx = L0 + i * w / cols; g.moveTo(cx, my); g.lineTo(cx + w / cols, top); } }
  g.stroke();
  // 창문
  const winY = b.floors === 2 ? [top + 8, top + (wallH - 14) * 0.5 + 8] : [top + 10];
  for (const wy of winY) for (let i = 0; i < cols; i++) {
    const cx = L0 + (i + 0.5) * w / cols;
    if (Math.abs(cx - x) < 20 && wy > top + 20) continue; // 문 자리
    if (Math.abs(cx - x) < 20 && b.floors !== 2) continue;
    tR(cx - 8, wy, 16, 16, `rgba(150,200,230,1)`);
    g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, wy); g.lineTo(cx, wy + 16); g.moveTo(cx - 8, wy + 8); g.lineTo(cx + 8, wy + 8); g.stroke();
    tR(cx - 10, wy + 16, 20, 4, '#8a5a3c', 1); g.fillStyle = '#e5546a'; g.beginPath(); g.arc(cx - 5, wy + 15, 2, 0, 7); g.arc(cx + 4, wy + 15, 2, 0, 7); g.fill();
  }
  if (b.columns) for (let i = 0; i < 4; i++) tR(L0 + 14 + i * (w - 36) / 3, top + 4, 8, wallH - 18, '#fffaf0', 1.2);
  // 문
  g.beginPath(); g.moveTo(x - 13, y - 2); g.lineTo(x - 13, y - 30); g.arc(x, y - 30, 13, Math.PI, 0); g.lineTo(x + 13, y - 2); g.closePath(); tL('#7a5236', 1.5);
  g.strokeStyle = '#5a3d2b'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 42); g.lineTo(x, y - 2); g.stroke();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x + 5, y - 18, 1.5, 0, 7); g.fill();
  tR(x - 17, y - 3, 34, 5, '#a59985', 1);
  // 간판
  g.strokeStyle = LINE; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 17, y - 46); g.lineTo(x + 36, y - 46); g.stroke();
  const sw = Math.sin(t * 2 + x) * 0.08;
  g.save(); g.translate(x + 30, y - 46); g.rotate(sw); tR(-10, 2, 20, 18, '#e8d3a8', 1.3); g.font = '12px serif'; g.textAlign = 'center'; g.fillText(b.sign, 0, 16); g.restore();
  // 발코니
  if (b.balcony) { tR(L0 + 8, top + (wallH - 14) * 0.5 - 2, w - 16, 5, '#8a5a3c'); for (let i = 0; i < 12; i++) tR(L0 + 12 + i * (w - 24) / 12, top + (wallH - 14) * 0.5 - 14, 2, 12, '#8a5a3c', 0.6); }
  // 지붕
  const rh = h - wallH, ov = 12;
  tP([L0 - ov, top + 2, L0 + w + ov, top + 2, L0 + w - 18, top - rh, L0 + 18, top - rh], b.roof, 1.6);
  g.strokeStyle = 'rgba(60,30,20,.25)'; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) { const yy = top + 2 - rh * i / 6, k = i / 6; g.beginPath(); g.moveTo(L0 - ov + (18 + ov) * k, yy); g.lineTo(L0 + w + ov - (18 + ov) * k, yy); g.stroke(); }
  // 지붕창
  const dx = x - w * 0.18;
  tR(dx - 11, top - rh * 0.55, 22, 18, '#f1e4cc'); tP([dx - 15, top - rh * 0.55 + 1, dx + 15, top - rh * 0.55 + 1, dx, top - rh * 0.55 - 13], b.roof);
  tR(dx - 6, top - rh * 0.55 + 4, 12, 11, '#96c8e6', 1);
  // 굴뚝
  if (b.chimney || b.floors === 2) {
    const cx = x + w * 0.25; tR(cx - 7, top - rh * 0.85, 14, 26, '#b9ad9a');
    if (b.chimney) for (let i = 0; i < 4; i++) { const a = (t * 0.4 + i / 4) % 1; g.fillStyle = `rgba(235,235,240,${0.85 - a * 0.85})`; g.beginPath(); g.arc(cx + a * 14, top - rh * 0.85 - a * 40, 5 + a * 7, 0, 7); g.fill(); }
  }
  if (b.forge) { g.fillStyle = `rgba(255,140,40,${0.45 + Math.sin(t * 9) * 0.25})`; g.beginPath(); g.arc(L0 + 20, y - 24, 9, 0, 7); g.fill(); tR(L0 + w - 34, y - 12, 22, 8, '#5f5f6b', 1.2); }
  if (b.flag) { const fx = x + w * 0.35, f = Math.sin(t * 5) * 3; g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, top - rh + 10); g.lineTo(fx, top - rh - 30); g.stroke(); tP([fx, top - rh - 30, fx + 24, top - rh - 24 + f * 0.4, fx, top - rh - 16], '#3f7fd9'); }
}
function drawTemple(b) {
  const g = tctx, { x, y, w, h } = b, wallH = h * 0.5, L0 = x - w / 2, top = y - wallH;
  tR(L0, top, w, wallH, '#f6f1e6');
  for (let i = 0; i < 5; i++) tR(L0 + 8 + i * (w - 24) / 4, top + 6, 9, wallH - 8, '#fffdf7', 1.1);
  tP([L0 - 10, top + 2, x + w / 2 + 10, top + 2, x, top - 46], b.roof, 1.6);
  tE(x, top - 16, 12, 12, '#b98bd9', 1.3); g.fillStyle = '#ffe680'; g.beginPath(); g.arc(x, top - 16, 6, 0, 7); g.fill();
  // 종탑
  tR(x - 16, top - 46 - 60, 32, 62, '#f6f1e6'); tP([x - 22, top - 104, x + 22, top - 104, x, top - 140], b.roof);
  g.beginPath(); g.moveTo(x - 8, top - 64); g.lineTo(x - 8, top - 84); g.arc(x, top - 84, 8, Math.PI, 0); g.lineTo(x + 8, top - 64); g.closePath(); tL('#5a4636');
  const gl = g.createRadialGradient(x, top - 150, 0, x, top - 150, 30); gl.addColorStop(0, `rgba(255,236,140,${0.6 + Math.sin(tT * 3) * 0.2})`); gl.addColorStop(1, 'rgba(255,236,140,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(x, top - 150, 30, 0, 7); g.fill();
  g.strokeStyle = '#c9a227'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, top - 140); g.lineTo(x, top - 162); g.moveTo(x - 7, top - 154); g.lineTo(x + 7, top - 154); g.stroke();
  g.beginPath(); g.moveTo(x - 15, y); g.lineTo(x - 15, y - 34); g.arc(x, y - 34, 15, Math.PI, 0); g.lineTo(x + 15, y); g.closePath(); tL('#7a5236', 1.5);
  tR(x - 24, y - 2, 48, 6, '#d8cdb8', 1);
}
function drawTowerGate(b) {
  const g = tctx, { x, y } = b;
  // 탑 본체 (성벽 뒤로 우뚝)
  tP([x - 55, y - 40, x + 55, y - 40, x + 42, y - 250, x - 42, y - 250], '#cfc6b6', 1.8);
  g.strokeStyle = 'rgba(90,70,54,.3)'; g.lineWidth = 1;
  for (let i = 1; i < 10; i++) { const yy = y - 40 - i * 21, hw = 55 - 13 * i / 10; g.beginPath(); g.moveTo(x - hw, yy); g.lineTo(x + hw, yy); g.stroke(); }
  for (let i = 0; i < 4; i++) { const wy = y - 90 - i * 42; g.beginPath(); g.moveTo(x - 6 + (i % 2) * 14, wy); g.lineTo(x - 6 + (i % 2) * 14, wy - 12); g.arc(x + (i % 2) * 14, wy - 12, 6, Math.PI, 0); g.lineTo(x + 6 + (i % 2) * 14, wy); g.closePath(); tL(`rgba(255,215,120,${0.75 + Math.sin(tT * 3 + i) * 0.25})`, 1.2); }
  tP([x - 50, y - 248, x + 50, y - 248, x, y - 310], '#7b3fb5', 1.8);
  const gl = g.createRadialGradient(x, y - 320, 0, x, y - 320, 50); gl.addColorStop(0, `rgba(220,170,255,${0.7 + Math.sin(tT * 2) * 0.2})`); gl.addColorStop(1, 'rgba(200,140,255,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(x, y - 320, 50, 0, 7); g.fill();
  tE(x, y - 322 + Math.sin(tT * 2) * 4, 7, 7, '#f0d8ff', 1.5);
  // 정문
  tR(x - 50, y - 64, 100, 64, '#d8cdb8', 1.6);
  for (let i = 0; i < 5; i++) tR(x - 50 + i * 22, y - 74, 12, 12, '#d8cdb8', 1.2);
  g.beginPath(); g.moveTo(x - 24, y); g.lineTo(x - 24, y - 34); g.arc(x, y - 34, 24, Math.PI, 0); g.lineTo(x + 24, y); g.closePath(); tL('#3b2a40', 1.6);
  const pg = g.createRadialGradient(x, y - 22, 0, x, y - 22, 26); pg.addColorStop(0, `rgba(190,130,255,${0.7 + Math.sin(tT * 4) * 0.2})`); pg.addColorStop(1, 'rgba(120,60,200,.2)');
  g.fillStyle = pg; g.fill();
  for (const fx of [x - 40, x + 40]) { tR(fx - 4, y - 40, 8, 14, '#5a4636', 1); g.fillStyle = `rgba(255,170,60,${0.8 + Math.sin(tT * 12 + fx) * 0.2})`; g.beginPath(); g.ellipse(fx, y - 46, 4, 7, 0, 0, 7); g.fill(); }
}
function drawStall(b) {
  const g = tctx, { x, y, w } = b, L0 = x - w / 2;
  tR(L0 + 6, y - 36, w - 12, 36, '#b98b5e', 1.4);
  for (let i = 0; i < 6; i++) { g.fillStyle = ['#ffd23f', '#e5546a', '#57a35c', '#f0ad4e', '#8fd4ff', '#e58fb0'][i]; g.beginPath(); g.arc(L0 + 18 + i * (w - 36) / 5, y - 40, 6, 0, 7); g.fill(); g.strokeStyle = LINE; g.lineWidth = 1; g.stroke(); }
  for (const px of [L0 + 6, L0 + w - 8]) tR(px, y - 90, 3, 90, '#7a5236', 1);
  for (let i = 0; i < 6; i++) tP([L0 + i * w / 6, y - 88, L0 + (i + 1) * w / 6, y - 88, L0 + (i + 1) * w / 6, y - 66, L0 + i * w / 6, y - 70], i % 2 ? '#f6f1e6' : b.awning, 1.2);
  tP([L0 - 6, y - 88, L0 + w + 6, y - 88, L0 + w - 6, y - 106, L0 + 6, y - 106], b.awning, 1.4);
}
function drawTent(b) {
  const g = tctx, { x, y, w, h } = b;
  tP([x - w / 2, y, x, y - h, x + w / 2, y], '#7b3fb5', 1.8);
  tP([x - w / 2, y, x - w / 4, y - h * 0.5, x, y - h, x - w / 8, y - h * 0.45, x - w / 6, y], '#9b5fd5', 1.2);
  tP([x - 14, y, x, y - h * 0.5, x + 14, y], '#2b1d3d', 1.4);
  g.fillStyle = '#ffe066'; for (const [sx, sy] of [[-24, -40], [20, -60], [-6, -84], [28, -30]]) { g.beginPath(); g.arc(x + sx, y + sy, 2.2 + Math.sin(tT * 4 + sx) * 0.8, 0, 7); g.fill(); }
  const f = Math.sin(tT * 5) * 2; g.strokeStyle = LINE; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x, y - h - 18); g.stroke(); tP([x, y - h - 18, x + 16, y - h - 13 + f, x, y - h - 8], '#ffd23f');
}
function drawProp(p) {
  const g = tctx, { x, y } = p;
  g.fillStyle = 'rgba(70,55,40,.2)'; g.beginPath(); g.ellipse(x + 3, y + 2, 12, 4, 0, 0, 7); g.fill();
  switch (p.k) {
    case 'well': tE(x, y, 26, 13, '#b9ad9a', 1.6); tE(x, y - 4, 20, 9, '#4a6a8a', 1.2); tR(x - 22, y - 44, 4, 40, '#7a5236'); tR(x + 18, y - 44, 4, 40, '#7a5236'); tP([x - 30, y - 42, x + 30, y - 42, x, y - 62], '#c4553f'); tR(x - 3, y - 30, 6, 10, '#8a6a4a', 1); break;
    case 'tree': tR(x - 4, y - 26, 8, 28, '#8a5a3c'); { const s = Math.sin(tT * 1.3 + x) * 1.5; tE(x + s, y - 44, 26, 22, '#6a9a6a', 1.5); tE(x - 10 + s, y - 52, 13, 11, '#7fb07a', 0); tE(x + 10 + s, y - 38, 11, 9, '#5c8a5c', 0); } break;
    case 'lamp': tR(x - 1.5, y - 54, 3, 54, '#3b3b45', 1); tR(x - 6, y - 64, 12, 12, '#3b3b45', 1); g.fillStyle = `rgba(255,220,120,${0.85 + Math.sin(tT * 3 + x) * 0.15})`; g.fillRect(x - 4, y - 62, 8, 8); tR(x - 8, y - 2, 16, 3, '#3b3b45', 1); break;
    case 'barrel': tE(x, y - 9, 8, 11, '#a0672f', 1.3); g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 8, y - 13); g.lineTo(x + 8, y - 13); g.moveTo(x - 8, y - 5); g.lineTo(x + 8, y - 5); g.stroke(); break;
    case 'crate': tR(x - 9, y - 18, 18, 18, '#c49a6c', 1.3); g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 9, y - 18); g.lineTo(x + 9, y); g.stroke(); break;
    case 'fence': for (let i = 0; i <= p.w; i += 12) tR(x - p.w / 2 + i, y - 16, 4, 16, '#b98b5e', 1); tR(x - p.w / 2, y - 12, p.w + 4, 3, '#b98b5e', 0.8); break;
    case 'stall2': drawStall({ x, y, w: 90, awning: '#d9a23f' }); break;
    case 'pumpkin': for (let i = 0; i < 3; i++) tE(x + i * 10, y - 5, 6, 5, '#f0ad4e', 1.1); break;
  }
}
function drawBunting(x1, y1, x2, y2) {
  const g = tctx, n = 18, sag = 26, t = tT;
  const pt = k => [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k + Math.sin(k * Math.PI) * sag];
  g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath(); for (let i = 0; i <= 30; i++) { const [px, py] = pt(i / 30); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  const cols = ['#e5546a', '#ffd23f', '#3f7fd9', '#57a35c', '#9b6fd6', '#f0ad4e'];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pt(i / n), [bx, by] = pt((i + 0.8) / n), f = Math.sin(t * 4 + i) * 1.5;
    tP([ax, ay, bx, by, (ax + bx) / 2 + f, (ay + by) / 2 + 16], cols[i % cols.length], 1);
  }
}
function drawVillager(v) {
  const g = tctx, bob = v.moving ? Math.abs(Math.sin(tT * 10 + v.c.length)) * -1.5 : 0, x = v.x, y = v.y + bob, d = v.dir || 1;
  g.fillStyle = 'rgba(70,55,40,.22)'; g.beginPath(); g.ellipse(v.x, v.y + 6, 7, 2.5, 0, 0, 7); g.fill();
  g.beginPath(); g.roundRect(x - 6, y - 6, 12, 11, 3); tL(v.c, 1.2);
  tE(x, y - 12, 7.5, 7, '#ffe0c4', 1.2);
  g.beginPath(); g.arc(x, y - 14, 7.6, Math.PI * 1.05, Math.PI * 1.95); tL(v.hair, 1.2);
  g.fillStyle = LINE; g.beginPath(); g.arc(x - 2.5 + d, y - 11, 1, 0, 7); g.arc(x + 2.5 + d, y - 11, 1, 0, 7); g.fill();
}

// ================= 루프 / 시작 =================
function townLoop(now) {
  const dt = Math.min(0.05, (now - (tLast || now)) / 1000); tLast = now; tT = now / 1000;
  if ($('#town').style.display !== 'none' && !$('#sheet').classList.contains('open')) drawTown(dt);
  requestAnimationFrame(townLoop);
}
const _showTown = showTown;
showTown = function () {
  _showTown();
  if (!tcv) { setupTown(); requestAnimationFrame(townLoop); }
  else window.dispatchEvent(new Event('resize'));
  // 문 앞에 서 있으면 뒤로 한 발짝
  if (hero && nearDoor) hero.y = nearDoor.door.y + 30;
};
