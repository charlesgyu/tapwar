// 모두의 힐러 - 마을 지도 화면 (탭해서 건물 입장)
'use strict';

const TW = 360, OY = 135, TH = 640 + OY + 80; // OY: 상단 UI 아래로 지도를 내림, 아래 80은 버튼 여백
let tcv, tctx, tScale = 1, tRaf = 0, tT = 0, tPress = null;

const BUILDINGS = [
  { key: 'tower', name: '끝없는 탑', x: 180, y: 128, w: 70, h: 150 },
  { key: 'office', name: '모험가 사무소', x: 72, y: 250, w: 88, h: 64, roof: '#3f7fd9', wall: '#f2e6cf' },
  { key: 'guild', name: '길드', x: 290, y: 248, w: 92, h: 70, castle: true },
  { key: 'smith', name: '대장간', x: 62, y: 372, w: 84, h: 60, roof: '#5a4a44', wall: '#b9a48f' },
  { key: 'temple', name: '신전', x: 180, y: 420, w: 86, h: 74, roof: '#e9eef7', wall: '#fffaf0' },
  { key: 'inn', name: '여관', x: 298, y: 372, w: 86, h: 64, roof: '#d9534f', wall: '#f2e6cf' },
  { key: 'shop', name: '상인', x: 66, y: 498, w: 80, h: 54, stall: true },
  { key: 'bank', name: '은행', x: 296, y: 500, w: 84, h: 60, roof: '#2f6f5e', wall: '#e8e2d6', columns: true },
  { key: 'auction', name: '경매장', x: 180, y: 548, w: 84, h: 56, roof: '#c9a227', wall: '#f2e6cf' },
  { key: 'engrave', name: '각인사', x: 70, y: 596, w: 70, h: 52, tent: true },
];

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
      <button class="big tower" onclick="G.open('tower')"><span>🗼</span><b>탑 오르기</b></button>
    </div>`;
  save();
};
function townSettings() {
  popup(`<b>⚙️ 설정</b><br><small class="dim">모두의 힐러 v0.2</small>`, [
    ['진행 초기화', () => popup('정말 모든 진행을 삭제할까요?', [['삭제', () => { localStorage.removeItem(SAVE_KEY); location.reload(); }, 'red'], ['취소']]), 'red'],
    ['닫기'],
  ]);
}

// ================= 마을 캔버스 =================
function setupTown() {
  tcv = $('#tcv'); tctx = tcv.getContext('2d');
  const resize = () => {
    const wrap = $('#town-stage'), w = wrap.clientWidth, h = wrap.clientHeight;
    tScale = w / TW; // 가로를 꽉 채우고 세로는 스크롤
    const dpr = window.devicePixelRatio || 1;
    tcv.style.width = TW * tScale + 'px'; tcv.style.height = TH * tScale + 'px';
    tcv.width = TW * tScale * dpr; tcv.height = TH * tScale * dpr;
    tctx.setTransform(tScale * dpr, 0, 0, tScale * dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', () => { if ($('#town').style.display !== 'none') resize(); });
  const pos = ev => { const r = tcv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / tScale, y: (ev.clientY - r.top) / tScale - OY }; };
  const hitB = p => BUILDINGS.find(b => Math.abs(p.x - b.x) < b.w / 2 + 6 && p.y < b.y + 20 && p.y > b.y - b.h - 10);
  tcv.addEventListener('pointerdown', ev => { const b = hitB(pos(ev)); tPress = b ? { b, t: 0 } : null; });
  tcv.addEventListener('pointerup', ev => {
    const b = hitB(pos(ev));
    if (b && tPress && tPress.b === b) setTimeout(() => G.open(b.key), 120);
    else tPress = null;
  });
}
function townLoop(now) {
  tT = now / 1000;
  if ($('#town').style.display !== 'none') drawTown();
  tRaf = requestAnimationFrame(townLoop);
}

// 고정 장식 (나무/바위/풀)
const DECO = (() => {
  let s = 42; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out = [];
  for (let i = 0; i < 70; i++) {
    const x = r() * TW, y = 190 + r() * (TH - 170);
    if (BUILDINGS.some(b => Math.abs(x - b.x) < b.w / 2 + 14 && y < b.y + 24 && y > b.y - b.h - 8)) continue;
    if (Math.abs(x - 180) < 40 && y > 270 && y < 340) continue;
    out.push({ x, y, k: r() < 0.45 ? 'tree' : r() < 0.5 ? 'bush' : r() < 0.6 ? 'rock' : 'flower', s: 0.8 + r() * 0.5, c: r() });
  }
  return out.sort((a, b) => a.y - b.y);
})();
const PATH = [[180, 175], [180, 300], [72, 300], [62, 410], [66, 530], [180, 580], [296, 530], [298, 410], [290, 300], [180, 300], [180, 450], [180, 580]];
const VILLAGERS = Array.from({ length: 6 }, (_, i) => ({ seg: i * 2 % (PATH.length - 1), p: Math.random(), spd: 0.08 + Math.random() * 0.08, c: pick(['#e5546a', '#3f7fd9', '#57d38c', '#f0ad4e', '#8e6bd1', '#2bb0b5']) }));

function drawTown() {
  const g = tctx;
  const save = ctx; ctx = g; // art.js 헬퍼 재사용
  g.save();
  const sky0 = g.createLinearGradient(0, 0, 0, OY + 200); sky0.addColorStop(0, '#5a4fc0'); sky0.addColorStop(1, '#b9a8ff');
  g.fillStyle = sky0; g.fillRect(0, 0, TW, OY + 200);
  g.fillStyle = '#6fbf5a'; g.fillRect(0, OY + 190, TW, TH);
  g.translate(0, OY);
  // 잔디
  g.fillStyle = '#7fcd68';
  for (let y = 200; y < TH; y += 22) for (let x = (y / 22 % 2) * 14; x < TW; x += 28) { g.beginPath(); g.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2); g.fill(); }
  // 탑 뒤 산/하늘
  const sky = g.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, '#7b6fd6'); sky.addColorStop(1, '#b9a8ff');
  g.fillStyle = sky; g.fillRect(0, -OY, TW, 190 + OY);
  for (const [mx, mh, c] of [[20, 90, '#6a5fb8'], [110, 120, '#5d53a8'], [260, 110, '#6a5fb8'], [350, 80, '#5d53a8']]) poly([mx - 80, 190, mx, 190 - mh, mx + 80, 190], c, 2);
  // 구름
  for (let i = 0; i < 4; i++) { const cx = ((tT * 8 + i * 110) % (TW + 120)) - 60, cy = -50 + i * 30; g.fillStyle = '#ffffffcc'; circle(cx, cy, 12, true); circle(cx + 14, cy - 5, 15, true); circle(cx + 30, cy, 11, true); }
  // 언덕 경계
  g.beginPath(); g.moveTo(0, 190); for (let x = 0; x <= TW; x += 30) g.quadraticCurveTo(x + 15, 178, x + 30, 190); g.lineTo(TW, 200); g.lineTo(0, 200); g.closePath(); inked('#6fbf5a', 2.5);
  // 길
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(PATH[0][0], PATH[0][1]); for (const [x, y] of PATH.slice(1)) g.lineTo(x, y); };
  path(); g.strokeStyle = INK; g.lineWidth = 26; g.stroke();
  path(); g.strokeStyle = '#e8d3a8'; g.lineWidth = 21; g.stroke();
  path(); g.strokeStyle = '#f3e3bf'; g.lineWidth = 9; g.setLineDash([2, 10]); g.stroke(); g.setLineDash([]);
  // 광장 분수
  oval(180, 300, 34, 18, '#e8d3a8', 2.5); oval(180, 298, 22, 11, '#9fb3c4', 2); oval(180, 297, 18, 8, '#5ec8ff', 1.5);
  rrect(176, 278, 8, 20, 3, '#c9d6e8', 1.8);
  for (let i = 0; i < 6; i++) { const a = (tT * 2 + i) % 1; g.fillStyle = `rgba(160,225,255,${1 - a})`; circle(180 + Math.cos(i) * a * 14, 278 - Math.sin(a * Math.PI) * 10 + a * 14, 2, true); }
  // 장식 + 건물 + 주민을 y순으로
  const items = [...DECO.map(d => ({ y: d.y, f: () => drawDeco(d) })), ...BUILDINGS.map(b => ({ y: b.y, f: () => drawBuilding(b) })), ...VILLAGERS.map(v => { const p = villagerPos(v); return { y: p.y, f: () => drawVillager(p, v) }; })];
  items.sort((a, b) => a.y - b.y).forEach(i => i.f());
  // 이름표
  for (const b of BUILDINGS) {
    const w = b.name.length * 11 + 16, y = b.y + 18;
    rrect(b.x - w / 2, y - 10, w, 19, 9, '#1b1530dd', 1.5);
    ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = b.key === 'tower' ? '#ffd23f' : '#fff'; ctx.fillText(b.name, b.x, y + 4);
  }
  // 탑 아래 화살표 (레퍼런스의 노란 화살표)
  const ay = 186 + Math.sin(tT * 5) * 4;
  poly([170, ay - 12, 190, ay - 12, 190, ay - 2, 198, ay - 2, 180, ay + 12, 162, ay - 2, 170, ay - 2], '#ffd23f', 2);
  g.restore();
  ctx = save;
}
function villagerPos(v) {
  v.p += v.spd * 0.016;
  if (v.p >= 1) { v.p = 0; v.seg = (v.seg + 1) % (PATH.length - 1); }
  const [x1, y1] = PATH[v.seg], [x2, y2] = PATH[v.seg + 1];
  return { x: x1 + (x2 - x1) * v.p, y: y1 + (y2 - y1) * v.p, dir: x2 < x1 ? -1 : 1 };
}
function drawVillager(p, v) {
  const g = tctx, y = p.y - 6 + Math.abs(Math.sin(tT * 10 + v.c.length)) * -1.5;
  g.fillStyle = 'rgba(27,21,48,.25)'; g.beginPath(); g.ellipse(p.x, p.y + 4, 6, 2, 0, 0, Math.PI * 2); g.fill();
  rrect(p.x - 5, y, 10, 8, 3, v.c, 1.4);
  oval(p.x, y - 4, 6.5, 6, '#ffe0c4', 1.4);
  g.fillStyle = INK; circle(p.x - 2 + p.dir, y - 4, 1, true); circle(p.x + 2 + p.dir, y - 4, 1, true);
}
function drawDeco(d) {
  const g = tctx, { x, y, s } = d;
  g.fillStyle = 'rgba(27,21,48,.22)'; g.beginPath(); g.ellipse(x, y + 2, 10 * s, 3.5 * s, 0, 0, Math.PI * 2); g.fill();
  if (d.k === 'tree') {
    rrect(x - 3 * s, y - 10 * s, 6 * s, 12 * s, 2, '#8a5a3c', 1.5);
    const sway = Math.sin(tT * 1.5 + x) * 1;
    oval(x + sway, y - 20 * s, 13 * s, 12 * s, d.c < 0.5 ? '#3f9e45' : '#4caf50', 2);
    oval(x - 5 * s + sway, y - 25 * s, 7 * s, 6 * s, '#5cc062', 0);
  } else if (d.k === 'bush') { oval(x, y - 5 * s, 10 * s, 7 * s, '#4caf50', 1.8); g.fillStyle = '#e5546a'; circle(x - 3 * s, y - 7 * s, 1.6, true); circle(x + 4 * s, y - 4 * s, 1.6, true); }
  else if (d.k === 'rock') { oval(x, y - 3 * s, 8 * s, 5.5 * s, '#a9a3b8', 1.6); }
  else { g.fillStyle = d.c < 0.5 ? '#fff27a' : '#ff9aa2'; for (let i = 0; i < 3; i++) circle(x + i * 4 - 4, y - (i % 2) * 3, 2, true); }
}
function drawBuilding(b) {
  const g = tctx, pressed = tPress && tPress.b === b;
  const sc = pressed ? 0.94 : 1 + Math.max(0, Math.sin(tT * 2 + b.x) * 0) ;
  g.save(); g.translate(b.x, b.y); g.scale(sc, sc);
  const { w, h } = b, L = -w / 2;
  g.fillStyle = 'rgba(27,21,48,.25)'; g.beginPath(); g.ellipse(0, 3, w * 0.55, 8, 0, 0, Math.PI * 2); g.fill();
  if (b.key === 'tower') drawTower(b);
  else if (b.castle) {
    rrect(L, -h * 0.65, w, h * 0.65, 3, '#c9d6e8', 2.2);
    for (const tx of [L - 4, w / 2 - 18]) { rrect(tx, -h, 22, h, 3, '#b8c6dc', 2.2); poly([tx - 3, -h, tx + 25, -h, tx + 11, -h - 18], '#3f7fd9', 2); }
    for (let i = 0; i < 4; i++) rrect(L + 18 + i * 14, -h * 0.65 - 7, 9, 8, 1, '#c9d6e8', 1.5);
    rrect(-10, -24, 20, 24, [10, 10, 0, 0], '#5a3d2b', 2);
    const f = Math.sin(tT * 6) * 3;
    for (const fx of [L + 7, w / 2 - 7]) { g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx, -h - 18); g.lineTo(fx, -h - 34); g.stroke(); poly([fx, -h - 34, fx + 14, -h - 30 + f * 0.3, fx, -h - 26], '#e5546a', 1.5); }
    ctx.font = `16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('🛡️', 0, -h * 0.65 + 18);
  } else if (b.stall) {
    rrect(L + 6, -h * 0.5, w - 12, h * 0.5, 3, '#c49a6c', 2);
    for (let i = 0; i < 5; i++) { const sw = w / 5; poly([L + i * sw, -h * 0.5, L + (i + 1) * sw, -h * 0.5, L + (i + 1) * sw - 2, -h * 0.82, L + i * sw + 2, -h * 0.82], i % 2 ? '#fff' : '#e5546a', 1.5); }
    poly([L, -h * 0.82, w / 2, -h * 0.82, w / 2 - 6, -h, L + 6, -h], '#e5546a', 2);
    ctx.font = `14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('🧪🍞🔷', 0, -h * 0.2);
  } else if (b.tent) {
    poly([L, 0, 0, -h - 6, w / 2, 0], '#7b3fb5', 2.2); poly([-10, 0, 0, -h * 0.55, 10, 0], '#2b1d3d', 1.8);
    g.fillStyle = '#ffe066'; for (const [sx, sy] of [[-14, -20], [12, -30], [-4, -40]]) { const tw = 1 + Math.sin(tT * 4 + sx) * 0.5; circle(sx, sy, 2 * tw, true); }
  } else {
    rrect(L + 4, -h * 0.6, w - 8, h * 0.6, 3, b.wall, 2.2);
    poly([L - 4, -h * 0.58, 0, -h, w / 2 + 4, -h * 0.58], b.roof, 2.2);
    if (b.columns) for (let i = 0; i < 4; i++) rrect(L + 12 + i * ((w - 30) / 3), -h * 0.56, 6, h * 0.56, 2, '#fff', 1.5);
    rrect(-8, -20, 16, 20, [8, 8, 0, 0], '#7a5230', 1.8);
    if (!b.columns) { rrect(L + 12, -h * 0.48, 13, 11, 2, '#8fd4ff', 1.5); rrect(w / 2 - 25, -h * 0.48, 13, 11, 2, '#8fd4ff', 1.5); }
    const icon = { office: '📋', smith: '⚒️', temple: '✝️', inn: '🍺', bank: '💰', auction: '🔨' }[b.key];
    ctx.font = `15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(icon, 0, -h * 0.66);
    if (b.key === 'smith') { // 굴뚝 연기 + 모루
      rrect(w / 2 - 22, -h - 4, 10, 18, 2, '#7a6a62', 1.8);
      for (let i = 0; i < 3; i++) { const a = (tT * 0.5 + i / 3) % 1; g.fillStyle = `rgba(230,230,240,${0.8 - a * 0.8})`; circle(w / 2 - 17 + a * 10, -h - 8 - a * 26, 4 + a * 5, true); }
      g.fillStyle = `rgba(255,140,40,${0.5 + Math.sin(tT * 8) * 0.3})`; circle(-8, -10, 4, true);
    }
    if (b.key === 'temple') { g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -h - 2); g.lineTo(0, -h - 20); g.moveTo(-6, -h - 14); g.lineTo(6, -h - 14); g.stroke(); g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.stroke();
      const gl = g.createRadialGradient(0, -h - 12, 0, 0, -h - 12, 22); gl.addColorStop(0, `rgba(255,240,150,${0.5 + Math.sin(tT * 3) * 0.2})`); gl.addColorStop(1, 'rgba(255,240,150,0)'); g.fillStyle = gl; circle(0, -h - 12, 22, true); }
    if (b.key === 'inn') { g.fillStyle = 'rgba(255,220,120,.8)'; circle(L + 18, -h * 0.43, 4 + Math.sin(tT * 3) * 0.6, true); }
  }
  g.restore();
}
function drawTower(b) {
  const g = tctx, h = b.h, t = tT;
  // 본체 (아래가 넓은 원기둥)
  poly([-30, 0, 30, 0, 22, -h, -22, -h], '#b8b2c8', 2.5);
  for (let i = 1; i < 6; i++) { g.strokeStyle = 'rgba(27,21,48,.35)'; g.lineWidth = 1.2; g.beginPath(); const yy = -i * h / 6, hw = 30 - 8 * i / 6; g.moveTo(-hw, yy); g.lineTo(hw, yy); g.stroke(); }
  // 나선 창문
  for (let i = 0; i < 5; i++) rrect(-12 + (i % 2) * 16, -22 - i * 26, 8, 12, [4, 4, 0, 0], `rgba(255,220,120,${0.7 + Math.sin(t * 3 + i) * 0.3})`, 1.5);
  rrect(-11, -26, 22, 26, [11, 11, 0, 0], '#4a2f6b', 2.2);
  // 꼭대기 (보라 빛 + 왕관 지붕)
  poly([-28, -h, 28, -h, 0, -h - 34], '#7b3fb5', 2.5);
  const gl = g.createRadialGradient(0, -h - 40, 0, 0, -h - 40, 40); gl.addColorStop(0, `rgba(220,170,255,${0.7 + Math.sin(t * 2) * 0.2})`); gl.addColorStop(1, 'rgba(200,140,255,0)');
  g.fillStyle = gl; circle(0, -h - 40, 40, true);
  oval(0, -h - 42 + Math.sin(t * 2) * 3, 6, 6, '#f0d8ff', 2);
  // 층수 깃발
  g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(22, -h + 4); g.lineTo(34, -h - 18); g.stroke();
  poly([34, -h - 18, 52, -h - 14 + Math.sin(t * 6) * 2, 36, -h - 8], '#ffd23f', 1.5);
  ctx.font = `9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = INK; ctx.fillText(S.best + 'F', 43, -h - 11);
}

// ================= 시작 =================
const _showTown = showTown;
showTown = function () { _showTown(); if (!tcv) { setupTown(); tRaf = requestAnimationFrame(townLoop); } else window.dispatchEvent(new Event('resize')); };
