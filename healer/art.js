// 모두의 힐러 - 그래픽 (카툰 스타일: 굵은 외곽선, 밝은 돌바닥, 네온 이펙트)
'use strict';

const INK = '#2b2135';
const FONT = '"Jua","Black Han Sans","Apple SD Gothic Neo",sans-serif';

// ================= 바닥 타일 (미리 그려두는 돌바닥) =================
const floorCache = {};
const FLOOR_THEMES = [
  { base: '#27325a', stone: '#2f3b68', edge: '#1e2747', wall: '#c9d6e8', banner: '#b5452f', flame: '#48b8ff' }, // 1~9 푸른 지하성
  { base: '#2c3f3a', stone: '#344a44', edge: '#20302c', wall: '#c9dccf', banner: '#3d7a3a', flame: '#7dff8a' }, // 10~19 이끼 던전
  { base: '#3a2a52', stone: '#45325f', edge: '#2a1e3d', wall: '#d8cbe8', banner: '#7b3fb5', flame: '#d27bff' }, // 20~29 마법 탑
  { base: '#4a2f2a', stone: '#563832', edge: '#36211d', wall: '#ead2c4', banner: '#c9a227', flame: '#ff9b3d' }, // 30~39 용암
  { base: '#1f1f2b', stone: '#282836', edge: '#15151e', wall: '#bfc3cf', banner: '#9e1f2f', flame: '#ff4d5e' }, // 40~ 어둠
];
const theme = () => FLOOR_THEMES[Math.min(FLOOR_THEMES.length - 1, Math.floor(((R && R.floor) || 1) / 10))];
function floorPattern(f) {
  const ti = Math.min(FLOOR_THEMES.length - 1, Math.floor((f || 1) / 10));
  if (floorCache[ti]) return floorCache[ti];
  const th = FLOOR_THEMES[ti], S0 = 120, c = document.createElement('canvas');
  c.width = c.height = S0 * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  g.fillStyle = th.base; g.fillRect(0, 0, S0, S0);
  let seed = 7 + ti * 13; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let y = 0; y < S0; y += 20) {
    const off = (y / 20) % 2 ? 0 : 12;
    for (let x = -off; x < S0; x += 24) {
      const w = 18 + r() * 6, h = 15 + r() * 3, sx = x + r() * 3, sy = y + r() * 2;
      for (const dx of [0, S0, -S0]) for (const dy of [0, S0, -S0]) {
        g.fillStyle = th.edge; g.beginPath(); g.roundRect(sx + dx, sy + dy + 1.5, w, h, 4); g.fill();
        g.fillStyle = th.stone; g.beginPath(); g.roundRect(sx + dx, sy + dy, w, h, 4); g.fill();
      }
    }
  }
  return (floorCache[ti] = ctx.createPattern(c, 'repeat'));
}

// ================= 공용 헬퍼 =================
function circle(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); }
function inked(fill, lw = 1.6) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); }
function oval(x, y, rx, ry, fill, lw) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); inked(fill, lw); }
function rrect(x, y, w, h, r, fill, lw) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); inked(fill, lw); }
function poly(pts, fill, lw) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); inked(fill, lw); }
function shadow(x, y, rx) { ctx.fillStyle = 'rgba(43,33,53,.22)'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2); ctx.fill(); }
function eyes(x, y, gap, size, kind) {
  if (kind === 'socket') { ctx.fillStyle = INK; circle(x - gap, y, size * 1.3, true); circle(x + gap, y, size * 1.3, true); ctx.fillStyle = '#7ff7ff'; circle(x - gap, y, size * 0.45, true); circle(x + gap, y, size * 0.45, true); return; }
  if (kind === 'glow') { ctx.fillStyle = '#ffe14d'; circle(x - gap, y, size, true); circle(x + gap, y, size, true); return; }
  ctx.fillStyle = '#fff'; circle(x - gap, y, size, true); circle(x + gap, y, size, true);
  ctx.fillStyle = kind === 'red' ? '#d0213a' : INK; circle(x - gap + 0.4, y + 0.3, size * 0.55, true); circle(x + gap + 0.4, y + 0.3, size * 0.55, true);
}
function hpBar(x, y, w, p, col) {
  ctx.beginPath(); ctx.roundRect(x - 1, y - 1, w + 2, 6, 3); ctx.fillStyle = INK; ctx.fill();
  ctx.fillStyle = '#4a3d55'; ctx.beginPath(); ctx.roundRect(x, y, w, 4, 2); ctx.fill();
  if (p > 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x, y, Math.max(2, w * clamp(p, 0, 1)), 4, 2); ctx.fill(); }
}
function outlinedText(t, x, y, size, fill, lw) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = lw || Math.max(3, size * 0.28); ctx.strokeText(t, x, y);
  ctx.fillStyle = fill; ctx.fillText(t, x, y);
}

// ================= 아군 (직업별 치비) =================
const HAIR = { warrior: '#8a5a3c', monk: '#2b2135', mage: '#e8c55a', hunter: '#6b8e3d', rogue: '#3a3550', spellblade: '#5ad1d6', priest: '#ffe9a8' };
function drawChibi(a) {
  const dead = a.dead, t = B.t;
  const moving = a._px !== undefined && Math.hypot(a.x - a._px, a.y - a._py) > 0.05;
  if (a._px !== undefined && Math.abs(a.x - a._px) > 0.05) a._face = a.x < a._px ? -1 : 1;
  a._px = a.x; a._py = a.y;
  const face = a._face || 1, cls = a.kind === 'healer' ? 'priest' : a.cls;
  const bob = dead ? 0 : moving ? Math.abs(Math.sin(t * 14 + a.x)) * -2.5 : Math.sin(t * 3 + a.x) * 0.8;
  const x = a.x, y = a.y + bob;
  shadow(a.x, a.y + 18, 14);
  if (B.target === a) {
    ctx.strokeStyle = '#3ff0ff'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 3]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(a.x, a.y + 13, 17, 6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  if (dead) { // 묘비
    rrect(x - 8, y - 6, 16, 19, [8, 8, 2, 2], '#c9c3d1'); ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 2, 2, 8); ctx.fillRect(x - 4, y, 8, 2);
    ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2; outlinedText('👻', x + 8, y - 12 + Math.sin(t * 2) * 2, 12, '#fff', 0); ctx.globalAlpha = 1;
    return;
  }
  if (a.kind === 'healer') { // 성스러운 오라
    const g = ctx.createRadialGradient(x, y, 4, x, y, 26);
    g.addColorStop(0, 'rgba(255,245,170,.55)'); g.addColorStop(1, 'rgba(255,245,170,0)');
    ctx.fillStyle = g; circle(x, y, 26, true);
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(face * 1.35, 1.35);
  const hit = a._hit > 0; if (hit) a._hit -= 0.05;
  // 뒤쪽 무기
  if (cls === 'mage' || cls === 'priest') { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, 12); ctx.lineTo(12, -10); ctx.stroke(); ctx.strokeStyle = '#a0672f'; ctx.lineWidth = 2; ctx.stroke(); oval(12, -12, 3.5, 3.5, cls === 'mage' ? '#6ad7ff' : '#fff27a'); }
  if (cls === 'hunter') { ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(9, 4, 10, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#a0672f'; ctx.lineWidth = 2; ctx.stroke(); }
  // 다리/몸
  const step = moving ? Math.sin(t * 14) * 2 : 0;
  rrect(-6 + step, 9, 5, 5, 2, '#4a3d55', 1.3); rrect(1 - step, 9, 5, 5, 2, '#4a3d55', 1.3);
  const body = a.kind === 'healer' ? '#ffffff' : a.color;
  rrect(-8, 0, 16, 12, 5, hit ? '#fff' : body);
  if (a.kind === 'healer') { ctx.fillStyle = '#ffcf3f'; ctx.fillRect(-1.2, 2, 2.4, 8); ctx.fillRect(-4, 4.5, 8, 2.4); }
  // 머리
  oval(0, -7, 11, 10, hit ? '#fff' : '#ffe0c4');
  ctx.fillStyle = '#ff9aa2aa'; circle(-6, -3, 2, true); circle(5, -3, 2, true);
  eyes(1, -6, 4, 2.1);
  // 머리장식
  const hair = HAIR[cls];
  switch (cls) {
    case 'warrior': ctx.beginPath(); ctx.arc(0, -9, 11.5, Math.PI, 0); ctx.lineTo(11.5, -5); ctx.lineTo(-11.5, -5); ctx.closePath(); inked('#b8c2cc'); ctx.fillStyle = '#d9534f'; ctx.fillRect(-1.5, -22, 3, 6); break;
    case 'monk': ctx.beginPath(); ctx.arc(0, -9, 11, Math.PI * 1.05, Math.PI * 1.95); inked(hair); rrect(-11, -11, 22, 3.5, 1.5, '#e5546a', 1.2); break;
    case 'mage': poly([-14, -10, 14, -10, 2, -30], '#5b6fe0'); ctx.fillStyle = '#ffe14d'; circle(3, -18, 1.8, true); break;
    case 'hunter': ctx.beginPath(); ctx.arc(0, -8, 12, Math.PI * 0.95, Math.PI * 2.05); inked('#4f8a3a'); break;
    case 'rogue': ctx.beginPath(); ctx.arc(0, -9, 11.5, Math.PI, 0); inked(hair); rrect(-9, -9, 19, 4, 2, INK, 1); ctx.fillStyle = '#fff'; circle(-3, -7, 1.3, true); circle(5, -7, 1.3, true); break;
    case 'spellblade': ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(-8, -20); ctx.lineTo(-2, -14); ctx.lineTo(3, -21); ctx.lineTo(7, -14); ctx.lineTo(12, -18); ctx.lineTo(11, -7); ctx.closePath(); inked(hair); break;
    case 'priest': ctx.beginPath(); ctx.arc(0, -9, 11.5, Math.PI * 1.02, Math.PI * 1.98); inked(hair);
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, -21 + Math.sin(t * 3), 7, 2.2, 0, 0, Math.PI * 2); ctx.stroke(); break;
  }
  // 앞쪽 무기
  if (cls === 'warrior') { rrect(-14, 0, 8, 10, 3, '#9aa6b2', 1.4); ctx.fillStyle = '#d9534f'; circle(-10, 5, 1.8, true); poly([9, 8, 11, 8, 12, -8, 8, -8], '#e6edf3', 1.3); }
  if (cls === 'rogue' || cls === 'spellblade') poly([8, 9, 10, 9, 12, -4, 8, -2], cls === 'spellblade' ? '#7ff7ff' : '#e6edf3', 1.3);
  if (cls === 'monk') { oval(-10, 5, 3.5, 3.5, '#ffe0c4', 1.3); oval(10, 5, 3.5, 3.5, '#ffe0c4', 1.3); }
  ctx.restore();
  // 상태
  hpBar(a.x - 14, y - 32, 28, a.hp / a.maxHp, a.hp / a.maxHp < 0.35 ? '#ff4d5e' : '#5be36b');
  const cs = Object.keys(a.curses);
  if (cs.length) { ctx.font = `9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(cs.map(c => CURSES[c].icon).join(''), a.x, y - 36); }
  if (a.kind === 'healer' && B.cast) { hpBar(a.x - 15, a.y + 18, 30, B.cast.t / B.cast.total, '#ffd23f'); }
  if (a.role === 'tank') { ctx.font = `8px ${FONT}`; ctx.fillText('🛡', a.x - 17, y - 19); }
}

// ================= 몬스터 =================
const MON_LOOK = {
  goblin:   { skin: '#7cc66b', body: '#8a5a3c', ears: 'long' },
  kobold:   { skin: '#a7795a', body: '#6b4a35', ears: 'round', snout: 1, tail: 1 },
  skeleton: { skin: '#f2efe6', body: '#f2efe6', eyes: 'socket', ribs: 1 },
  wolf:     { skin: '#8f8fa3', body: '#6c6c80', ears: 'tri', snout: 1, eyes: 'red', tail: 1 },
  orc:      { skin: '#5f9e4a', body: '#7a4b2e', tusk: 1, brow: 1 },
  troll:    { skin: '#4fb3b0', body: '#c46a3a', ears: 'long', mohawk: 1, tusk: 1, staff: 1 },
  ghoul:    { skin: '#8fbf7a', body: '#3e6fc2', zombie: 1 },
  naga:     { skin: '#7a8ee0', body: '#4a5fc2', snake: 1, fins: 1, eyes: 'red' },
  siren:    { skin: '#ffc4d6', body: '#ff7aa8', snake: 1, hair: '#7b4fd6' },
  shade:    { skin: '#a58bff', body: '#a58bff', ghost: 1, eyes: 'glow' },
  golem:    { skin: '#9a9aa6', body: '#7e7e8c', block: 1, eyes: 'glow' },
  drake:    { skin: '#e5546a', body: '#c43a52', wings: 1, snout: 1, horns: 1 },
  gobking:  { skin: '#7cc66b', body: '#8a2be2', ears: 'long', crown: 1 },
  lich:     { skin: '#f2efe6', body: '#5a2d82', eyes: 'socket', crown: 1, robe: 1, staff: 1 },
  warchief: { skin: '#4f8a3a', body: '#7a2e2e', tusk: 1, brow: 1, horns: 1 },
  nagaq:    { skin: '#5fd0b8', body: '#2f8f7a', snake: 1, fins: 1, crown: 1, eyes: 'red' },
  dragon:   { skin: '#d63a4f', body: '#a32a3d', wings: 1, snout: 1, horns: 1, eyes: 'glow' },
};
function drawMonster(e) {
  const L = MON_LOOK[e.id] || MON_LOOK.goblin, t = B.t, s = e.r / 14 * 1.3;
  if (e._px !== undefined && Math.abs(e.x - e._px) > 0.05) e._face = e.x < e._px ? -1 : 1;
  e._px = e.x;
  const face = e._face || 1;
  const bob = L.ghost ? Math.sin(t * 3 + e.x) * 3 : Math.abs(Math.sin(t * 9 + e.x)) * -2;
  shadow(e.x, e.y + 13 * s, 12 * s);
  if (e.undead) { const g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, 22 * s); g.addColorStop(0, 'rgba(120,255,200,.35)'); g.addColorStop(1, 'rgba(120,255,200,0)'); ctx.fillStyle = g; circle(e.x, e.y, 22 * s, true); }
  ctx.save(); ctx.translate(e.x, e.y + bob); ctx.scale(s * face, s);
  const hit = e._hit > 0; if (hit) e._hit -= 0.06;
  if (hit) { ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 8; }
  const skin = hit ? '#ffffff' : L.skin, body = hit ? '#ffffff' : L.body;
  if (L.wings) { const f = Math.sin(t * 12) * 4; poly([-6, -2, -22, -14 - f, -18, 4], '#8f2236'); poly([6, -2, 22, -14 - f, 18, 4], '#8f2236'); }
  if (L.tail) { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.quadraticCurveTo(-16, 8, -15, -2 + Math.sin(t * 6) * 3); ctx.stroke(); ctx.strokeStyle = skin; ctx.lineWidth = 2; ctx.stroke(); }
  // 몸
  if (L.snake) { ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-12, 14, 2, 13); ctx.quadraticCurveTo(14, 12, 12 + Math.sin(t * 5) * 3, 4); ctx.quadraticCurveTo(8, 8, 6, 0); ctx.closePath(); inked(body); }
  else if (L.ghost) { ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-11, 10); for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(-8 + i * 5.5, 15 + (i % 2) * -3 + Math.sin(t * 6 + i), -5.5 + i * 5.5, 10); ctx.lineTo(11, -4); ctx.closePath(); ctx.globalAlpha = 0.85; inked(body); ctx.globalAlpha = 1; }
  else if (L.block) { rrect(-12, -2, 24, 15, 3, body); ctx.strokeStyle = '#5c5c68'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, 6); ctx.lineTo(-2, 12); ctx.stroke(); rrect(-17, 0, 6, 10, 2, body); rrect(11, 0, 6, 10, 2, body); }
  else if (L.robe) { poly([-9, -2, 9, -2, 13, 14, -13, 14], body); }
  else { rrect(-4.5 - 2, 9, 5, 5, 2, '#4a3d55', 1.2); rrect(2, 9, 5, 5, 2, '#4a3d55', 1.2); rrect(-9, -1, 18, 12, 5, body); if (L.zombie) { ctx.fillStyle = '#c0392b'; ctx.fillRect(-4, 6, 4, 3); } }
  if (L.ribs) { ctx.strokeStyle = INK; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5, 1.5 + i * 3); ctx.lineTo(5, 1.5 + i * 3); ctx.stroke(); } }
  // 머리
  if (L.ears === 'long') { poly([-8, -8, -19, -14, -9, -3], skin); poly([8, -8, 19, -14, 9, -3], skin); }
  if (L.ears === 'tri') { poly([-9, -13, -7, -24, -1, -15], skin); poly([9, -13, 7, -24, 1, -15], skin); }
  if (L.ears === 'round') { oval(-8, -15, 4.5, 4.5, skin); oval(8, -15, 4.5, 4.5, skin); }
  if (L.fins) { poly([-9, -8, -17, -16, -10, -2], '#3fc1c9'); poly([9, -8, 17, -16, 10, -2], '#3fc1c9'); }
  if (L.hair) { oval(0, -9, 12, 12, L.hair); }
  if (L.block) rrect(-10, -19, 20, 17, 3, skin);
  else oval(0, -8, 11, 10, skin);
  if (L.snout) oval(5, -4, 6, 4, skin);
  if (L.zombie) { ctx.fillStyle = '#6f9e5c'; circle(-5, -13, 2.2, true); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(5, -1); ctx.stroke(); }
  eyes(1, -9, 4, 2.2, L.eyes);
  if (L.brow) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, -14); ctx.lineTo(-1, -11); ctx.moveTo(9, -14); ctx.lineTo(3, -11); ctx.stroke(); }
  if (L.tusk) { poly([-4, -2, -3, -7, -1, -2], '#fffbe8', 1); poly([4, -2, 5, -7, 7, -2], '#fffbe8', 1); }
  if (!L.tusk && !L.block && !L.ghost && L.eyes !== 'socket') { ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(2, -3, 2.5, 0.2, Math.PI - 0.2); ctx.stroke(); }
  if (L.mohawk) poly([-3, -17, 0, -26, 3, -17], '#e5546a');
  if (L.horns) { poly([-8, -15, -12, -25, -4, -17], '#fffbe8'); poly([8, -15, 12, -25, 4, -17], '#fffbe8'); }
  if (L.crown) poly([-8, -16, -8, -25, -4, -20, 0, -27, 4, -20, 8, -25, 8, -16], '#ffd23f');
  if (L.staff) { ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(13, 12); ctx.lineTo(14, -12); ctx.stroke(); ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.8; ctx.stroke(); oval(14, -14, 3.5, 3.5, e.undead ? '#9dff7a' : '#ff7ad9', 1.2); }
  ctx.restore(); ctx.shadowBlur = 0;
  const w = e.boss ? 46 : 24;
  hpBar(e.x - w / 2, e.y - 24 * s + bob, w, e.hp / e.maxHp, '#ff4d5e');
  if (e.boss) outlinedText(e.name, e.x, e.y - 28 * s, 11, '#ffd23f', 3);
}

// ================= 이펙트 =================
function fx() { return B.fx || (B.fx = []); }
function burst(x, y, color, n = 10, spd = 80) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rnd(spd * 0.4, spd); fx().push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: 0, life: rnd(0.4, 0.7), c: color, r: rnd(1.5, 3.5) }); }
}
// 기존 로직에 이펙트 연결
const _enemyDied = enemyDied;
enemyDied = function (e) {
  burst(e.x, e.y, MON_LOOK[e.id] ? MON_LOOK[e.id].skin : '#fff', e.boss ? 40 : 12, e.boss ? 160 : 90);
  for (let i = 0; i < (e.boss ? 8 : 1); i++) fx().push({ k: 'gem', x: e.x + rnd(-10, 10), y: e.y, t: 0, life: 9, c: Math.random() < 0.15 ? '#ffd23f' : '#5be36b' });
  _enemyDied(e);
};
const _damage = damage;
damage = function (u, amt, src, dot) {
  if (!dot && !u.dead) u._hit = 0.25;
  _damage.apply(null, arguments);
};
const _healUnit = healUnit;
healUnit = function (u, amt, quiet) {
  if (!u.dead && !quiet) for (let i = 0; i < 5; i++) fx().push({ k: 'plus', x: u.x + rnd(-10, 10), y: u.y + rnd(-4, 8), t: 0, life: 0.8 });
  return _healUnit.apply(null, arguments);
};
const _spawnWave = spawnWave;
spawnWave = function () {
  _spawnWave(); B.waveSize = B.enemies.length;
  // 가운데 문에서 몰려나오기
  B.enemies.forEach((e, i) => { e.x = AW / 2 + rnd(-70, 70); e.y = WALL_H + 8 + rnd(0, 14); if (e.boss) e.x = AW / 2; burst(e.x, e.y, '#9a8cff', 6, 50); });
};

// ================= 던전 벽 / 장식 =================
const WALL_H = 54;
function flame(x, y, s, col) {
  const t = B.t, f = Math.sin(t * 10 + x) * 1.5;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 26 * s); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
  ctx.fillStyle = g; circle(x, y, 26 * s, true);
  ctx.beginPath(); ctx.moveTo(x - 7 * s, y + 4 * s); ctx.quadraticCurveTo(x - 9 * s, y - 8 * s, x + f, y - 20 * s); ctx.quadraticCurveTo(x + 9 * s, y - 6 * s, x + 7 * s, y + 4 * s); ctx.closePath(); inked(col, 1.6);
  ctx.beginPath(); ctx.moveTo(x - 3 * s, y + 3 * s); ctx.quadraticCurveTo(x - 3 * s, y - 4 * s, x + f * 0.5, y - 11 * s); ctx.quadraticCurveTo(x + 4 * s, y - 3 * s, x + 3 * s, y + 3 * s); ctx.closePath(); ctx.fillStyle = '#ffffffcc'; ctx.fill();
}
function drawWalls() {
  const th = theme();
  // 윗벽
  ctx.fillStyle = th.wall; ctx.fillRect(0, 0, AW, WALL_H);
  ctx.fillStyle = 'rgba(43,33,53,.18)'; ctx.fillRect(0, WALL_H - 10, AW, 10);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  for (let y = 6; y < WALL_H - 8; y += 14) for (let x = ((y / 14) % 2) * 18; x < AW; x += 36) { ctx.strokeStyle = 'rgba(43,33,53,.25)'; ctx.strokeRect(x, y, 36, 14); }
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, WALL_H); ctx.lineTo(AW, WALL_H); ctx.stroke();
  // 배너
  for (const bx of [50, 130, 230, 310]) {
    ctx.beginPath(); ctx.moveTo(bx - 11, 4); ctx.lineTo(bx + 11, 4); ctx.lineTo(bx + 11, 40); ctx.lineTo(bx, 34); ctx.lineTo(bx - 11, 40); ctx.closePath(); inked(th.banner, 1.8);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1.5; ctx.strokeRect(bx - 6, 10, 12, 14);
  }
  // 문 (가운데)
  rrect(AW / 2 - 20, 6, 40, WALL_H - 6, [20, 20, 0, 0], '#3b2a22', 2);
  ctx.fillStyle = '#2b1d17'; ctx.fillRect(AW / 2 - 1, 12, 2, WALL_H - 12);
  // 양 옆 기둥 + 불꽃
  for (const px of [14, AW - 14]) {
    rrect(px - 10, WALL_H - 18, 20, 30, 3, th.wall, 2);
    flame(px, WALL_H - 22, 0.9, th.flame);
  }
  // 바닥 장식 불꽃 (아래쪽 모서리)
  flame(16, AH - 26, 0.8, th.flame); flame(AW - 16, AH - 26, 0.8, th.flame);
}

// ================= 말풍선 =================
const SHOUT_ATK = ['얍!', '간다!', '받아라!', '하앗!'];
const SHOUT_LOW = ['힐 주세요!', '살려줘!', '아파요ㅠ', '힐러님!!'];
function bubbles() {
  for (const a of B.allies) {
    if (a.kind !== 'ally' || a.dead) { a._say = null; continue; }
    if (a._say && (a._sayT -= 0.016) > 0) {
      const w = a._say.length * 9 + 12, x = a.x, y = a.y - 48;
      rrect(x - w / 2, y - 11, w, 18, 9, '#fff', 1.5);
      poly([x - 3, y + 6, x + 3, y + 6, x, y + 11], '#fff', 0); ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y + 4, 6, 3);
      ctx.font = `11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = a._low ? '#d0213a' : INK; ctx.fillText(a._say, x, y + 2);
      continue;
    }
    a._say = null;
    const low = a.hp / a.maxHp < 0.3;
    if (Math.random() < (low ? 0.012 : 0.0015)) { a._low = low; a._say = pick(low ? SHOUT_LOW : SHOUT_ATK); a._sayT = 1.3; }
  }
}

// ================= 메인 그리기 =================
function draw() {
  ctx.fillStyle = floorPattern(R ? R.floor : 1); ctx.fillRect(0, 0, AW, AH);
  const vg = ctx.createRadialGradient(AW / 2, AH * 0.55, AH * 0.3, AW / 2, AH * 0.55, AH * 0.8);
  vg.addColorStop(0, 'rgba(10,8,25,0)'); vg.addColorStop(1, 'rgba(10,8,25,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, AW, AH);
  drawWalls();
  const t = B.t;
  // 바닥힐 (황금 마법진)
  for (const g of B.grounds) {
    const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    gr.addColorStop(0, 'rgba(255,240,140,.55)'); gr.addColorStop(1, 'rgba(255,210,60,.15)');
    ctx.fillStyle = gr; circle(g.x, g.y, g.r, true);
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(t * 0.8);
    ctx.strokeStyle = '#fff3a6'; ctx.lineWidth = 2.5; circle(0, 0, g.r - 3); ctx.lineWidth = 1.2; circle(0, 0, g.r * 0.7);
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * g.r * 0.7, Math.sin(a) * g.r * 0.7); ctx.lineTo(Math.cos(a + Math.PI / 6) * g.r * 0.3, Math.sin(a + Math.PI / 6) * g.r * 0.3); } ctx.closePath(); ctx.stroke();
    ctx.restore();
    if (Math.random() < 0.3) fx().push({ k: 'spark', x: g.x + rnd(-g.r, g.r) * 0.8, y: g.y + rnd(-g.r, g.r) * 0.8, t: 0, life: 1, c: '#fff6a0' });
  }
  // 광역기 경고 / 장판
  for (const tl of B.tele) {
    const p = Math.min(1, tl.t / tl.fill);
    if (tl.type === 'puddle') {
      const live = tl.fired, pul = 0.8 + Math.sin(t * 8) * 0.2;
      const gr = ctx.createRadialGradient(tl.x, tl.y, 0, tl.x, tl.y, tl.r);
      gr.addColorStop(0, live ? `rgba(230,60,255,${0.85 * pul})` : 'rgba(200,60,230,.35)');
      gr.addColorStop(0.75, live ? 'rgba(180,40,230,.7)' : 'rgba(170,40,210,.22)');
      gr.addColorStop(1, 'rgba(160,30,220,0)');
      ctx.fillStyle = gr; circle(tl.x, tl.y, live ? tl.r * 1.08 : tl.r, true);
      if (!live) { ctx.fillStyle = 'rgba(220,60,255,.45)'; circle(tl.x, tl.y, tl.r * p, true); ctx.strokeStyle = '#e04cff'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]); ctx.lineDashOffset = t * 15; circle(tl.x, tl.y, tl.r); ctx.setLineDash([]); }
      else {
        tl._b = tl._b || Array.from({ length: 10 }, () => [rnd(-1, 1), rnd(-1, 1), rnd(0, 6)]);
        for (const [bx, by, ph] of tl._b) { const r = 2 + ((t * 2 + ph) % 3); ctx.fillStyle = 'rgba(255,190,255,.7)'; circle(tl.x + bx * tl.r * 0.6, tl.y + by * tl.r * 0.6, r, true); }
      }
    } else {
      ctx.fillStyle = 'rgba(255,50,40,.18)'; circle(tl.x, tl.y, tl.r, true);
      ctx.fillStyle = `rgba(255,50,40,${0.35 + p * 0.25})`; circle(tl.x, tl.y, tl.r * p, true);
      ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; circle(tl.x, tl.y, tl.r);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; circle(tl.x, tl.y, tl.r * p);
      outlinedText('!', tl.x, tl.y + 7, 18, '#fff', 4);
    }
  }
  // 젬 (드랍)
  for (const f of fx()) if (f.k === 'gem') {
    const yy = f.y + Math.sin((t + f.x) * 4) * 1.5;
    ctx.save(); ctx.translate(f.x, yy); ctx.rotate(Math.PI / 4); rrect(-3.5, -3.5, 7, 7, 1.5, f.c, 1.3); ctx.restore();
  }
  // 캐릭터들 (y 순서로 정렬해 앞뒤 겹침 표현)
  const units = [...B.enemies.map(e => ['e', e]), ...B.allies.map(a => ['a', a])].sort((p, q) => p[1].y - q[1].y);
  for (const [k, u] of units) k === 'e' ? drawMonster(u) : drawChibi(u);
  // 투사체 / 빔
  for (const s of B.shots) {
    const p = s.t / s.life;
    if (s.w) { // 치유 빔
      ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#b6ffb0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      const hx = s.x1 + (s.x2 - s.x1) * Math.min(1, p * 1.4), hy = s.y1 + (s.y2 - s.y1) * Math.min(1, p * 1.4);
      const tx = s.x1 + (s.x2 - s.x1) * Math.max(0, p * 1.4 - 0.35), ty = s.y1 + (s.y2 - s.y1) * Math.max(0, p * 1.4 - 0.35);
      ctx.strokeStyle = s.c; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; circle(hx, hy, 3, true); ctx.strokeStyle = s.c; ctx.lineWidth = 1.5; circle(hx, hy, 3);
    }
  }
  // 파티클
  for (const f of fx()) {
    const p = f.t / f.life;
    if (f.k === 'p') { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.c; circle(f.x, f.y, f.r * (1 - p * 0.5), true); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; circle(f.x, f.y, f.r * (1 - p * 0.5)); }
    if (f.k === 'plus') { ctx.globalAlpha = 1 - p; outlinedText('+', f.x, f.y - p * 20, 12, '#7dff8a', 3); }
    if (f.k === 'spark') { ctx.globalAlpha = Math.sin(p * Math.PI); ctx.fillStyle = f.c; circle(f.x, f.y - p * 14, 1.6, true); }
  }
  ctx.globalAlpha = 1;
  bubbles();
  // 조이스틱 (레퍼런스처럼 큰 링 + 손잡이)
  if (B.joy && B.joy.moved) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4; circle(B.joy.sx, B.joy.sy, 38);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; circle(B.joy.sx, B.joy.sy, 38, true);
    ctx.fillStyle = 'rgba(43,33,53,.85)'; circle(B.joy.sx + B.joy.dx * 24, B.joy.sy + B.joy.dy * 24, 16, true);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; circle(B.joy.sx + B.joy.dx * 24, B.joy.sy + B.joy.dy * 24, 16);
  }
  // 숫자 (튀어오르는 굵은 숫자)
  for (const f of B.floats) {
    const p = f.t / f.life, pop = p < 0.15 ? 0.6 + p / 0.15 * 0.6 : 1.2 - Math.min(0.2, (p - 0.15));
    ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
    outlinedText(f.text, f.x, f.y, Math.round(f.size * 1.15 * pop), f.color === '#fff' ? '#ffffff' : f.color);
  }
  ctx.globalAlpha = 1;
  if (B.flash > 0) { B.flash -= 0.016; ctx.fillStyle = `rgba(255,250,200,${B.flash})`; ctx.fillRect(0, 0, AW, AH); }
  if (!B.enemies.length && !B.over && B.wave < B.waves) {
    const s = 1 + Math.sin(t * 6) * 0.05;
    outlinedText(B.wave === 0 && R.floor % 5 === 0 ? '⚠ BOSS ⚠' : `WAVE ${B.wave + 1}`, AW / 2, AH * 0.4, Math.round(30 * s), B.wave === 0 && R.floor % 5 === 0 ? '#ff4d5e' : '#ffd23f', 6);
  }
}

// 파티클 업데이트 (update 이후 실행)
const _update = update;
update = function (dt) {
  _update(dt);
  if (!B || !B.fx) return;
  const me = B.me;
  for (const f of B.fx) {
    f.t += dt;
    if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 200 * dt; f.vx *= 0.96; }
    if (f.k === 'gem') { // 힐러에게 빨려옴
      const d = Math.hypot(me.x - f.x, me.y - f.y);
      if (f.t > 0.6 || d < 60) { const v = 260 * dt; f.x += (me.x - f.x) / d * v; f.y += (me.y - f.y) / d * v; if (d < 10) f.t = f.life; }
    }
  }
  B.fx = B.fx.filter(f => f.t < f.life);
};
