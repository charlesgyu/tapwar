// 전투 이펙트 모듈 — 전역 FX (DESIGN §10). 모든 그래픽은 코드로 생성(fillRect / Pixel.circle 만, 정수 좌표).
// 좌표계: 월드 픽셀. draw/drawOne 은 ctx 에 카메라 변환이 이미 적용되어 있다고 가정한다(cam 은 참고용).
// 노드(캔버스 없음)에서도 spawn/update/clear/types 는 동작한다.
const FX = (() => {
  const OUT = '#3b2a2a';          // 따뜻한 갈색 외곽선(스타일 규격)
  const list = [];
  let seq = 0;

  // 타입별 기본 지속시간(초). 0 = 씬이 제거할 때까지 지속(장판/성역/시전 광)
  const DUR = {
    heal_sparkle: 0.8, aoe_ring: 0, puddle_circle: 0, ground_heal: 0, hit: 0.25, projectile: 0.3,
    levelup: 1.2, cast_glow: 0, summon_puff: 0.6, revive: 1.0, damage_number: 0.9, curse_icon: 0, coin_sparkle: 0.35,
  };
  const MAX_FX = 260;              // 월드 이펙트 상한(대규모 전투에서 프레임 유지 — 넘치면 오래된 것부터 버린다)
  // 전투 모듈의 텔레그래프 객체({type:'circle'|'puddle'|'cone'|'line'})를 그대로 drawOne 에 넘길 수 있도록 별칭
  const ALIAS = { circle: 'aoe_ring', puddle: 'puddle_circle', cone: 'aoe_cone', line: 'aoe_line', gh: 'ground_heal' };

  function types() { return Object.keys(DUR); }

  function spawn(type, x, y, opts = {}) {
    const fx = Object.assign({ type, x, y, t: 0, duration: DUR[type] !== undefined ? DUR[type] : 0.5, id: ++seq, seed: (seq * 7919) & 0xffff }, opts);
    if (fx.duration === undefined || fx.duration === null) fx.duration = DUR[type] || 0.5;
    if (list.length >= MAX_FX) { const k = list.findIndex((f) => f.duration > 0); list.splice(k >= 0 ? k : 0, 1); }
    list.push(fx);
    return fx;
  }
  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.t += dt;
      if (f.duration > 0 && f.t >= f.duration) list.splice(i, 1);
      else if (f.duration <= 0 && f.until !== undefined && f.t >= f.until) list.splice(i, 1);
    }
  }
  function clear() { list.length = 0; for (const n of nums) numPool.push(n); nums.length = 0; }
  function remove(fx) { const i = list.indexOf(fx); if (i >= 0) list.splice(i, 1); }
  function draw(ctx, cam) { for (const f of list) drawOne(ctx, f, cam); }

  // ---------- 도형 헬퍼(정수 좌표, fillRect 만) ----------
  const R = Math.round;
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  // 두께 th 의 원 테두리: 행마다 바깥 반지름과 안쪽 반지름의 차이 구간만 채운다
  function ring(ctx, cx, cy, r, th, c) {
    ctx.fillStyle = c;
    const ri = r - th;
    for (let dy = -r; dy <= r; dy++) {
      const dxo = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      const dxi = Math.abs(dy) > ri ? -1 : Math.floor(Math.sqrt(Math.max(0, ri * ri - dy * dy)));
      if (dxi < 0) ctx.fillRect(cx - dxo, cy + dy, dxo * 2 + 1, 1);
      else {
        const w = dxo - dxi; if (w <= 0) continue;
        ctx.fillRect(cx - dxo, cy + dy, w, 1);
        ctx.fillRect(cx + dxi + 1, cy + dy, w, 1);
      }
    }
  }
  // 부채꼴 채우기(시계 방향, 12시부터 frac 만큼). 픽셀 단위 각도 판정 → 수평 런으로 fillRect
  function pie(ctx, cx, cy, r, frac, c) {
    if (frac <= 0) return;
    if (frac >= 1) { Pixel.circle(ctx, cx, cy, r, c); return; }
    ctx.fillStyle = c;
    const lim = frac * Math.PI * 2;
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      let run = -1;
      for (let x = -dx; x <= dx + 1; x++) {
        let inside = false;
        if (x <= dx) { let a = Math.atan2(x, -dy); if (a < 0) a += Math.PI * 2; inside = a <= lim; }
        if (inside && run < 0) run = x;
        else if (!inside && run >= 0) { ctx.fillRect(cx + run, cy + dy, x - run, 1); run = -1; }
      }
    }
  }
  // 체크무늬 디더 원(반투명 느낌을 픽셀로)
  function ditherCircle(ctx, cx, cy, r, c, phase = 0) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      for (let x = -dx; x <= dx; x++) if (((x + dy + phase) & 1) === 0) ctx.fillRect(cx + x, cy + dy, 1, 1);
    }
  }
  // 부채꼴(cone) 채우기: facing(라디안) 중심, angle(도) 폭
  function cone(ctx, cx, cy, r, facing, angleDeg, c, frac = 1) {
    ctx.fillStyle = c;
    const half = (angleDeg * Math.PI / 180) / 2, rr = Math.max(1, Math.round(r * frac));
    for (let dy = -rr; dy <= rr; dy++) {
      const dx = Math.floor(Math.sqrt(rr * rr - dy * dy));
      let run = -1;
      for (let x = -dx; x <= dx + 1; x++) {
        let inside = false;
        if (x <= dx) { let d = Math.atan2(dy, x) - facing; d = Math.atan2(Math.sin(d), Math.cos(d)); inside = Math.abs(d) <= half; }
        if (inside && run < 0) run = x;
        else if (!inside && run >= 0) { ctx.fillRect(cx + run, cy + dy, x - run, 1); run = -1; }
      }
    }
  }
  // 4방향 반짝(십자 + 대각) : size 1~3
  function sparkle(ctx, x, y, size, c, hi) {
    if (size <= 1) { px(ctx, x, y, c); return; }
    rect(ctx, x - size, y, size * 2 + 1, 1, c);
    rect(ctx, x, y - size, 1, size * 2 + 1, c);
    if (size >= 3) { px(ctx, x - 1, y - 1, c); px(ctx, x + 1, y - 1, c); px(ctx, x - 1, y + 1, c); px(ctx, x + 1, y + 1, c); }
    if (hi) px(ctx, x, y, hi);
  }
  // 십자 아이콘(힐). 외곽선 포함
  function cross(ctx, x, y, s, c, hi) {
    rect(ctx, x - s - 1, y - 1, s * 2 + 3, 3, OUT); rect(ctx, x - 1, y - s - 1, 3, s * 2 + 3, OUT);
    rect(ctx, x - s, y, s * 2 + 1, 1, c); rect(ctx, x, y - s, 1, s * 2 + 1, c);
    if (hi) { px(ctx, x - s, y, hi); px(ctx, x, y - s, hi); }
  }
  // 룬 고리: n 개의 작은 글리프를 원 둘레에 배치(각도 오프셋으로 회전)
  const GLYPHS = [
    ['#.#', '.#.', '#.#'], ['###', '#..', '###'], ['.#.', '###', '.#.'], ['#..', '.#.', '..#'],
    ['###', '.#.', '.#.'], ['#.#', '###', '#.#'], ['.##', '#..', '.##'], ['#.#', '.#.', '.#.'],
  ];
  function runes(ctx, cx, cy, r, n, rot, c) {
    ctx.fillStyle = c;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const gx = R(cx + Math.cos(a) * r) - 1, gy = R(cy + Math.sin(a) * r) - 1;
      const g = GLYPHS[i % GLYPHS.length];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (g[y][x] === '#') ctx.fillRect(gx + x, gy + y, 1, 1);
    }
  }
  function hash(i, s) { let t = (i * 374761393 + s * 668265263) >>> 0; t = (t ^ (t >>> 13)) * 1274126177 >>> 0; return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }
  function alpha(ctx, a, fn) { const o = ctx.globalAlpha; ctx.globalAlpha = Math.max(0, Math.min(1, a)) * o; fn(); ctx.globalAlpha = o; }

  // ---------- 타입별 렌더 ----------
  const draws = {
    // 대상 위로 떠오르는 초록/흰 십자와 반짝임
    heal_sparkle(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const h0 = hash(i, f.seed), h1 = hash(i + 50, f.seed), h2 = hash(i + 99, f.seed);
        const delay = h2 * 0.35, lp = Math.min(1, Math.max(0, (p - delay) / (1 - delay)));
        if (lp <= 0 || lp >= 1) continue;
        const x = cx + R((h0 - 0.5) * 28), y = cy - 4 - R(lp * 30 + h1 * 8);
        const size = lp < 0.3 ? 3 : lp < 0.7 ? 2 : 1;
        const col = (i % 3 === 0) ? '#ffffff' : (i % 3 === 1 ? '#9ff08a' : '#5ed46a');
        sparkle(ctx, x, y, size, col, size > 1 ? '#ffffff' : null);
      }
      // 중앙 큰 십자: 올라가며 커졌다 작아진다
      const up = R(p * 18);
      const s = p < 0.5 ? 2 + R(p * 4) : 4 - R((p - 0.5) * 6);
      if (s > 0) alpha(ctx, p < 0.8 ? 1 : (1 - p) * 5, () => cross(ctx, cx, cy - 12 - up, s, '#6fe07a', '#e8ffe0'));
    },
    // 붉은 원 텔레그래프: 테두리 2px + fill 비율만큼 부채꼴, 완료 직전 깜빡임
    aoe_ring(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y), r = Math.max(4, R(f.r || 24)), fill = Math.max(0, Math.min(1, f.fill == null ? p : f.fill));
      const blink = fill > 0.8 && (Math.floor(t * 16) & 1) === 0;
      alpha(ctx, 0.22, () => Pixel.circle(ctx, cx, cy, r - 2, '#ff4040'));
      alpha(ctx, blink ? 0.65 : 0.5, () => pie(ctx, cx, cy, r - 2, fill, blink ? '#ff8070' : '#ff5a50'));
      ring(ctx, cx, cy, r, 2, blink ? '#ffe8e0' : '#e0343a');
      alpha(ctx, 0.9, () => ring(ctx, cx, cy, r + 1, 1, OUT));
      // 부채꼴 끝선 1px
      if (fill > 0 && fill < 1) {
        const a = fill * Math.PI * 2;
        for (let d = 2; d < r - 2; d++) px(ctx, cx + R(Math.sin(a) * d), cy - R(Math.cos(a) * d), '#ffe0d0');
      }
      // 중심 표식
      rect(ctx, cx - 2, cy, 5, 1, '#ffb0a0'); rect(ctx, cx, cy - 2, 1, 5, '#ffb0a0');
    },
    // 빨간 마법진(룬 고리) 장판: 시전 중엔 채워지고, 활성 중엔 맥동
    puddle_circle(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y), r = Math.max(6, R(f.r || 24));
      const fill = Math.max(0, Math.min(1, f.fill == null ? p : f.fill));
      const active = f.active || fill >= 1;
      const pulse = active ? 0.55 + 0.25 * Math.sin((f.age != null ? f.age : t) * 6) : 0.35;
      const phase = Math.floor(t * 8) & 1;
      alpha(ctx, active ? 0.45 : 0.3, () => Pixel.circle(ctx, cx, cy, r, '#8a1a30'));
      alpha(ctx, pulse, () => ditherCircle(ctx, cx, cy, r - 1, active ? '#ff3a4a' : '#c02a3a', phase));
      if (!active) alpha(ctx, 0.6, () => pie(ctx, cx, cy, r - 4, fill, '#ff5a50'));
      ring(ctx, cx, cy, r, 2, active ? '#ff7a70' : '#e04a50');
      alpha(ctx, 0.7, () => ring(ctx, cx, cy, r + 1, 1, OUT));
      const ri = Math.max(3, r - 7);
      ring(ctx, cx, cy, ri, 1, active ? '#ffb0a8' : '#d04a50');
      // 룬 고리(회전) + 중앙 별
      runes(ctx, cx, cy, Math.max(2, r - 3), Math.max(4, Math.min(8, R(r / 6))), t * 0.8, '#ffffff');
      const s = active ? 2 + (Math.floor(t * 4) & 1) : 1;
      sparkle(ctx, cx, cy, s, '#ffd0c8', '#ffffff');
      if (active) for (let i = 0; i < 4; i++) { // 솟는 불똥
        const lp = ((t * 0.9) + hash(i, f.seed)) % 1;
        const x = cx + R((hash(i + 10, f.seed) - 0.5) * r * 1.4), y = cy - R(lp * 14);
        alpha(ctx, 1 - lp, () => px(ctx, x, y, lp < 0.5 ? '#ff6a60' : '#ffb0a0'));
      }
    },
    // 초록 성역 마법진 + 떠오르는 빛 입자
    ground_heal(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y), r = Math.max(6, R(f.r || 24));
      const dur = f.duration || 0, rem = dur > 0 ? Math.max(0, dur - t) : 9;
      const fade = rem < 0.8 && (Math.floor(t * 10) & 1) ? 0.5 : 1;   // 끝나기 직전 깜빡임
      const breathe = 0.5 + 0.2 * Math.sin(t * 4);
      alpha(ctx, 0.35 * fade, () => Pixel.circle(ctx, cx, cy, r, '#2a7a3a'));
      alpha(ctx, breathe * fade, () => ditherCircle(ctx, cx, cy, r - 1, '#7ae07a', Math.floor(t * 6) & 1));
      ring(ctx, cx, cy, r, 1, '#d8ffc0');
      alpha(ctx, 0.7, () => ring(ctx, cx, cy, r + 1, 1, OUT));
      ring(ctx, cx, cy, Math.max(3, r - 5), 1, '#9ff08a');
      runes(ctx, cx, cy, Math.max(2, r - 3), Math.max(4, Math.min(10, R(r / 5))), -t * 0.6, '#f0ffe0');
      cross(ctx, cx, cy, 3, '#8af08a', '#ffffff');
      // 떠오르는 빛 입자(1~2px)
      for (let i = 0; i < 10; i++) {
        const lp = ((t * 0.6) + hash(i, f.seed)) % 1;
        const x = cx + R((hash(i + 20, f.seed) - 0.5) * r * 1.6), y = cy - R(lp * 24) + R(hash(i + 40, f.seed) * 6);
        const s = lp < 0.4 ? 2 : 1;
        alpha(ctx, 1 - lp, () => rect(ctx, x, y, s, s, i % 2 ? '#ffffff' : '#b8ff9a'));
      }
    },
    // 피격: 흰 번쩍 + 작은 파편
    hit(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y);
      const col = f.color || '#ffd040';
      if (p < 0.5) { // 번쩍: 8방향 섬광 + 중앙 흰 덩어리(점점 줄어듦)
        const s = p < 0.15 ? 7 : p < 0.3 ? 5 : 3;
        alpha(ctx, 0.5, () => Pixel.circle(ctx, cx, cy, s + 2, '#fff0a0'));
        sparkle(ctx, cx, cy, s + 2, '#ffffff');
        for (let k = 1; k <= s - 1; k++) { px(ctx, cx + k, cy + k, '#ffffff'); px(ctx, cx - k, cy - k, '#ffffff'); px(ctx, cx + k, cy - k, '#ffffff'); px(ctx, cx - k, cy + k, '#ffffff'); }
        Pixel.circle(ctx, cx, cy, Math.max(1, s - 2), '#ffffff');
      }
      for (let i = 0; i < 10; i++) { // 파편: 바깥으로 튀며 중력으로 떨어진다
        const a = (i / 10) * Math.PI * 2 + hash(i, f.seed) * 0.6, d = 3 + p * (12 + hash(i + 7, f.seed) * 10);
        const x = cx + R(Math.cos(a) * d), y = cy + R(Math.sin(a) * d * 0.8) + R(p * p * 8);
        const sz = p < 0.8 ? 2 : 1;
        alpha(ctx, 1 - p * 0.4, () => { rect(ctx, x, y, sz, sz, i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? col : Pixel.shade(col, -0.3)); });
      }
    },
    // 투사체: from → to 를 진행률로 보간. 머리 + 꼬리 입자
    projectile(ctx, f, p, t) {
      const from = f.from || { x: f.x - 30, y: f.y }, to = f.to || { x: f.x + 30, y: f.y };
      const x = R(from.x + (to.x - from.x) * p), y = R(from.y + (to.y - from.y) * p);
      const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const col = f.color || '#ffd040', hi = Pixel.shade(col, 0.6), lo = Pixel.shade(col, -0.35);
      for (let i = 1; i <= 6; i++) { // 꼬리
        const tx = R(x - ux * i * 3), ty = R(y - uy * i * 3);
        alpha(ctx, 1 - i * 0.14, () => rect(ctx, tx - (i < 3 ? 1 : 0), ty - (i < 3 ? 1 : 0), i < 3 ? 2 : 1, i < 3 ? 2 : 1, i < 2 ? col : lo));
      }
      ring(ctx, x, y, 3, 1, OUT);
      Pixel.circle(ctx, x, y, 2, col);
      px(ctx, x - 1, y - 1, hi);
      alpha(ctx, 0.5, () => ring(ctx, x, y, 4, 1, hi));
    },
    // 레벨업: 금빛 기둥 + 별
    levelup(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y);
      const grow = Math.min(1, p * 3), fade = p > 0.7 ? (1 - p) / 0.3 : 1;
      const h = R(44 * grow), w = p < 0.7 ? 6 : Math.max(1, R(6 * fade));
      alpha(ctx, 0.35 * fade, () => rect(ctx, cx - w - 3, cy - h, w * 2 + 7, h, '#ffd860'));
      alpha(ctx, 0.75 * fade, () => rect(ctx, cx - w, cy - h, w * 2 + 1, h, '#ffe88a'));
      alpha(ctx, fade, () => rect(ctx, cx - R(w / 2), cy - h, w + 1, h, '#fff8d0'));
      alpha(ctx, 0.5 * fade, () => Pixel.ellipse(ctx, cx, cy, w + 6, 3, '#ffd860'));
      alpha(ctx, fade, () => Pixel.ellipse(ctx, cx, cy, w + 2, 2, '#fff2b0'));
      for (let i = 0; i < 9; i++) { // 솟는 별
        const lp = Math.min(1, Math.max(0, (p - hash(i, f.seed) * 0.4) / 0.7));
        if (lp <= 0 || lp >= 1) continue;
        const x = cx + R((hash(i + 3, f.seed) - 0.5) * 30), y = cy - R(lp * 50);
        sparkle(ctx, x, y, lp < 0.5 ? 3 : 2, i % 2 ? '#ffe060' : '#ffffff', '#ffffff');
      }
      // 상단 큰 별
      if (p > 0.25 && p < 0.9) { const s = 3 + (Math.floor(t * 8) & 1); sparkle(ctx, cx, cy - 48 - R(p * 6), s, '#ffd040', '#ffffff'); }
    },
    // 발 밑 둥근 빛 맥동(시전 중)
    cast_glow(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y), col = f.color || '#8ad8ff';
      const k = Math.sin(t * 7), rx = 10 + R(k * 2), ry = 4 + (k > 0 ? 1 : 0);
      alpha(ctx, 0.3, () => Pixel.ellipse(ctx, cx, cy, rx + 3, ry + 1, col));
      alpha(ctx, 0.6, () => Pixel.ellipse(ctx, cx, cy, rx, ry, col));
      alpha(ctx, 0.8, () => Pixel.ellipse(ctx, cx, cy, Math.max(2, rx - 5), Math.max(1, ry - 2), Pixel.shade(col, 0.5)));
      for (let i = 0; i < 6; i++) { // 둘레를 도는 점
        const a = t * 3 + (i / 6) * Math.PI * 2;
        px(ctx, cx + R(Math.cos(a) * (rx + 1)), cy + R(Math.sin(a) * (ry + 1)), i % 2 ? '#ffffff' : Pixel.shade(col, 0.7));
      }
    },
    // 보라 연기 뭉게(소환)
    summon_puff(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y), fade = p > 0.6 ? (1 - p) / 0.4 : 1;
      const cols = ['#5a2d8a', '#8a52c8', '#b98ae8'];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + hash(i, f.seed), d = 2 + p * (12 + hash(i + 5, f.seed) * 6);
        const x = cx + R(Math.cos(a) * d), y = cy - 6 + R(Math.sin(a) * d * 0.7) - R(p * 8);
        const r = Math.max(1, R((1 - p * 0.6) * (4 + hash(i + 9, f.seed) * 3)));
        alpha(ctx, fade, () => { Pixel.circle(ctx, x, y, r + 1, OUT); Pixel.circle(ctx, x, y, r, cols[i % 3]); Pixel.circle(ctx, x - 1, y - 1, Math.max(1, r - 2), cols[2]); });
      }
      for (let i = 0; i < 5; i++) { // 보라 반짝
        const x = cx + R((hash(i + 30, f.seed) - 0.5) * 28), y = cy - 8 - R(p * 22) - R(hash(i + 31, f.seed) * 8);
        alpha(ctx, fade, () => sparkle(ctx, x, y, p < 0.5 ? 2 : 1, '#e8c8ff', '#ffffff'));
      }
    },
    // 부활: 흰 빛 기둥 + 날개 같은 빛 입자
    revive(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y);
      const grow = Math.min(1, p * 2.5), fade = p > 0.6 ? (1 - p) / 0.4 : 1;
      const h = R(50 * grow), w = 5;
      alpha(ctx, 0.3 * fade, () => rect(ctx, cx - w - 4, cy - h, w * 2 + 9, h, '#bfe8ff'));
      alpha(ctx, 0.7 * fade, () => rect(ctx, cx - w, cy - h, w * 2 + 1, h, '#e8f6ff'));
      alpha(ctx, fade, () => rect(ctx, cx - 2, cy - h, 5, h, '#ffffff'));
      alpha(ctx, 0.5 * fade, () => Pixel.ellipse(ctx, cx, cy, 12, 4, '#bfe8ff'));
      alpha(ctx, fade, () => Pixel.ellipse(ctx, cx, cy, 7, 2, '#ffffff'));
      // 확장하는 고리
      if (p > 0.15) { const rr = R(4 + (p - 0.15) * 30); alpha(ctx, Math.max(0, 1 - p), () => { ring(ctx, cx, cy, rr, 1, '#ffffff'); }); }
      for (let i = 0; i < 10; i++) {
        const lp = ((p * 1.2) + hash(i, f.seed)) % 1;
        const side = i % 2 ? 1 : -1, x = cx + side * R(6 + lp * 14), y = cy - R(lp * 40) - 4;
        alpha(ctx, (1 - lp) * fade, () => sparkle(ctx, x, y, lp < 0.4 ? 2 : 1, i % 3 ? '#ffffff' : '#ffe8a0'));
      }
      if (p > 0.3) alpha(ctx, fade, () => cross(ctx, cx, cy - 26 - R(p * 10), 3, '#fff6c0', '#ffffff'));
    },
    // 떠오르며 사라지는 숫자(텍스트만 fillText 허용)
    damage_number(ctx, f, p, t) {
      const text = String(f.text == null ? '' : f.text);
      const col = f.color || '#ffffff';
      const rise = f.crit ? 22 : 16;
      const pop = p < 0.15 ? 1 + (0.15 - p) * 3 : 1;
      const x = R(f.x + (f.dx || 0) * p), y = R(f.y - 10 - p * rise);
      const a = p > 0.65 ? (1 - p) / 0.35 : 1;
      ctx.save();
      ctx.globalAlpha *= Math.max(0, a);
      ctx.font = 'bold ' + (f.crit ? 12 : 10) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(x, y); ctx.scale(pop, pop);
      ctx.fillStyle = OUT;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillText(text, ox, oy);
      ctx.fillStyle = col; ctx.fillText(text, 0, 0);
      ctx.restore();
    },
    // 동전 흡수: 작은 금빛 반짝 몇 개(소리 없는 "찰랑")
    coin_sparkle(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + hash(i, f.seed), d = 2 + p * 9;
        sparkle(ctx, cx + R(Math.cos(a) * d), cy + R(Math.sin(a) * d) - R(p * 4), p < 0.5 ? 2 : 1, i % 2 ? '#fff6c0' : '#ffd040', '#ffffff');
      }
    },
    // 머리 위 보라 해골 점멸(저주 표시)
    curse_icon(ctx, f, p, t) {
      if ((Math.floor(t * 3) % 3) === 2) return;   // 점멸
      const cx = R(f.x), cy = R(f.y) - (f.dy == null ? 30 : f.dy) + (Math.floor(t * 2) & 1 ? 0 : -1);
      const rows = [
        '..#####..',
        '.#ooooo#.',
        '#ohoooo0#',
        '#oooooo0#',
        '#o##o##0#',
        '#o##o##0#',
        '.#ooooo#.',
        '..#o#o#..',
        '..#o#o#..',
        '...###...',
      ];
      const pal = { '#': OUT, 'o': '#b07ae0', 'h': '#e8c8ff', '0': '#7a4aa8' };
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < 9; x++) { const ch = rows[y][x]; if (pal[ch]) px(ctx, cx - 4 + x, cy - 5 + y, pal[ch]); }
      // 눈 안쪽 보라 빛
      px(ctx, cx - 1, cy - 1, '#ff60e0'); px(ctx, cx + 2, cy - 1, '#ff60e0');
      alpha(ctx, 0.5 + 0.3 * Math.sin(t * 8), () => { px(ctx, cx - 7, cy - 2, '#e8a0ff'); px(ctx, cx + 7, cy, '#e8a0ff'); px(ctx, cx, cy - 8, '#e8a0ff'); });
    },
    // 전투 모듈 부채꼴 텔레그래프(별칭 cone)
    aoe_cone(ctx, f, p, t) {
      const cx = R(f.x), cy = R(f.y), r = Math.max(4, R(f.r || 24)), fill = Math.max(0, Math.min(1, f.fill == null ? p : f.fill));
      const blink = fill > 0.8 && (Math.floor(t * 16) & 1) === 0, facing = f.facing || 0, ang = f.angle || 60;
      alpha(ctx, 0.25, () => cone(ctx, cx, cy, r, facing, ang, '#ff4040'));
      alpha(ctx, blink ? 0.65 : 0.55, () => cone(ctx, cx, cy, r, facing, ang, blink ? '#ff8070' : '#ff5a50', fill));
      // 테두리: 두 변 + 호
      const half = (ang * Math.PI / 180) / 2;
      for (const s of [-1, 1]) for (let d = 0; d <= r; d++) px(ctx, cx + R(Math.cos(facing + s * half) * d), cy + R(Math.sin(facing + s * half) * d), blink ? '#ffe8e0' : '#e0343a');
      const steps = Math.max(8, R(r * ang / 40));
      for (let i = 0; i <= steps; i++) { const a = facing - half + (i / steps) * half * 2; px(ctx, cx + R(Math.cos(a) * r), cy + R(Math.sin(a) * r), blink ? '#ffe8e0' : '#e0343a'); px(ctx, cx + R(Math.cos(a) * (r - 1)), cy + R(Math.sin(a) * (r - 1)), '#e0343a'); }
    },
    // 전투 모듈 돌진 선 텔레그래프(별칭 line): (x,y)→(x2,y2), 폭 r
    aoe_line(ctx, f, p, t) {
      const x1 = f.x, y1 = f.y, x2 = f.x2 == null ? f.x + 60 : f.x2, y2 = f.y2 == null ? f.y : f.y2;
      const fill = Math.max(0, Math.min(1, f.fill == null ? p : f.fill)), half = Math.max(2, R((f.r || 16) / 2));
      const blink = fill > 0.8 && (Math.floor(t * 16) & 1) === 0;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      // 띠는 회전한 사각형 한 번으로(예전엔 픽셀마다 fillRect 를 불러 돌진 텔레그래프 하나에 수천 번 — 대규모 전투에서 프레임이 무너졌다)
      const ang = Math.atan2(dy, dx);
      const band = (frac, c, a) => alpha(ctx, a, () => { ctx.save(); ctx.translate(R(x1), R(y1)); ctx.rotate(ang); ctx.fillStyle = c; ctx.fillRect(0, -half, R(len * frac) + 1, half * 2 + 1); ctx.restore(); });
      band(1, '#ff4040', 0.25);
      band(fill, blink ? '#ff8070' : '#ff5a50', blink ? 0.65 : 0.55);
      ctx.save(); ctx.translate(R(x1), R(y1)); ctx.rotate(ang); ctx.fillStyle = blink ? '#ffe8e0' : '#e0343a';
      ctx.fillRect(0, -half, R(len) + 1, 1); ctx.fillRect(0, half, R(len) + 1, 1); ctx.restore();
      // 끝 화살촉
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) px(ctx, R(x2 - ux * k + nx * s * k), R(y2 - uy * k + ny * s * k), '#ffe0d0');
    },
  };

  function drawOne(ctx, fx, cam) {
    if (!fx) return;
    const type = ALIAS[fx.type] || fx.type;
    const fn = draws[type];
    if (!fn) return;
    const t = fx.t || 0;
    const dur = fx.duration || 0;
    const p = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : (fx.fill != null ? fx.fill : Math.min(1, t));
    fn(ctx, fx, p, t);
  }

  // ================= 화면 공간 큰 숫자(데미지·힐·알림) =================
  // 월드 좌표에 붙어 있지만 글자는 화면 공간(device px)에 그려 배율과 상관없이 크고 또렷하다.
  // 객체는 풀에서 꺼내 쓰고, 글자 그림(외곽선 포함)은 스타일+문자열별 캔버스로 캐시해 프레임마다 strokeText 를 하지 않는다.
  const NUM_MAX = 110;
  const nums = [], numPool = [];
  const glyphs = new Map();       // 'style|D|text' → canvas
  const NFONT = '"Arial Black", "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", Impact, sans-serif';
  // size: CSS px, fill: 글자색, top: 위쪽 밝은 색(그라데이션), life: 초, rise: CSS px
  const NSTYLE = {
    dmg:   { size: 15, fill: '#ffffff', top: '#ffffff', life: 0.8, rise: 22 },
    crit:  { size: 24, fill: '#ffc21a', top: '#fff27a', life: 1.0, rise: 30 },
    big:   { size: 18, fill: '#ffe14a', top: '#fff6b0', life: 0.9, rise: 26 },
    hurt:  { size: 13, fill: '#ff5a4a', top: '#ff9a8a', life: 0.8, rise: 20 },
    heal:  { size: 13, fill: '#5cf06a', top: '#c8ffb8', life: 0.9, rise: 22 },
    miss:  { size: 11, fill: '#cfe8ff', top: '#ffffff', life: 0.7, rise: 16 },
    info:  { size: 12, fill: '#ffb060', top: '#ffe0b0', life: 1.3, rise: 14 },
    curse: { size: 12, fill: '#d89aff', top: '#f0d8ff', life: 1.2, rise: 14 },
    gold:  { size: 14, fill: '#ffd040', top: '#fff2a0', life: 1.1, rise: 26 },
  };
  function glyph(style, text, D) {
    const key = style + '|' + D + '|' + text;
    let g = glyphs.get(key);
    if (g) return g;
    if (glyphs.size > 700) glyphs.clear();
    const st = NSTYLE[style] || NSTYLE.dmg, fs = Math.round(st.size * D), ow = Math.max(2, Math.round(fs * 0.2));
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!c) return null;
    const x = c.getContext('2d');
    x.font = `900 ${fs}px ${NFONT}`;
    const w = Math.ceil(x.measureText(text).width) + ow * 2 + 2, h = Math.ceil(fs * 1.25) + ow * 2;
    c.width = w; c.height = h;
    x.font = `900 ${fs}px ${NFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = ow * 2; x.strokeStyle = '#1e1014'; x.strokeText(text, w / 2, h / 2);
    const gr = x.createLinearGradient(0, h / 2 - fs / 2, 0, h / 2 + fs / 2);
    gr.addColorStop(0, st.top); gr.addColorStop(0.55, st.fill); gr.addColorStop(1, st.fill);
    x.fillStyle = gr; x.fillText(text, w / 2, h / 2);
    glyphs.set(key, c);
    return c;
  }
  // num(wx, wy, text, style, { spread }) — wx, wy 는 월드 좌표(머리 위)
  function num(wx, wy, text, style = 'dmg', opts = {}) {
    let n;
    if (nums.length >= NUM_MAX) n = nums.shift();          // 가장 오래된 것 재활용
    else n = numPool.pop() || {};
    const st = NSTYLE[style] || NSTYLE.dmg, sp = opts.spread == null ? 10 : opts.spread;
    n.wx = wx; n.wy = wy; n.text = String(text); n.style = style; n.t = 0; n.life = opts.life || st.life; n.rise = st.rise;
    n.ox = (Math.random() - 0.5) * 2 * sp; n.oy = (Math.random() - 0.5) * sp * 0.6; n.vx = (Math.random() - 0.5) * 16;
    nums.push(n);
    return n;
  }
  function updateNums(dt) {
    let w = 0;
    for (let i = 0; i < nums.length; i++) { const n = nums[i]; n.t += dt; if (n.t < n.life) nums[w++] = n; else numPool.push(n); }
    nums.length = w;
  }
  // toScreen(wx, wy) → device px. D = DPR. W, H = 캔버스 크기(화면 밖은 건너뜀)
  function drawNums(ctx, toScreen, D, W, H) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const o = ctx.globalAlpha;
    for (const n of nums) {
      const p = toScreen(n.wx, n.wy);
      const k = n.t / n.life;
      // 팡! 하고 커졌다가 → 위로 떠오르며 → 끝에서 사라짐
      const pop = n.t < 0.08 ? 0.6 + (n.t / 0.08) * 0.9 : n.t < 0.18 ? 1.5 - ((n.t - 0.08) / 0.1) * 0.5 : 1;
      const ease = 1 - Math.pow(1 - Math.min(1, k * 1.3), 3);
      const x = p.x + (n.ox + n.vx * k) * D, y = p.y + (n.oy - ease * n.rise) * D;
      if (x < -80 * D || x > W + 80 * D || y < -40 * D || y > H + 40 * D) continue;
      const g = glyph(n.style, n.text, D); if (!g) continue;
      ctx.globalAlpha = o * (k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1);
      const w = g.width * pop, h = g.height * pop;
      ctx.drawImage(g, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    }
    ctx.globalAlpha = o;
    ctx.imageSmoothingEnabled = false;
  }

  return { spawn, update, draw, drawOne, types, clear, remove, list: () => list, DUR, num, updateNums, drawNums, nums: () => nums, NSTYLE };
})();
if (typeof module !== 'undefined') module.exports = FX;
