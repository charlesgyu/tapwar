// 동굴 몬스터 스프라이트(16종) — 모든 그래픽은 코드로 생성한다(이미지 파일 없음).
// 조립 방식: fillRect 기반 도형(타원·둥근상자·삼각형·굵은 선)을 "부품" 단위로 임시 캔버스에 그리고,
//   부품마다 3톤 명암(어둠 → 기본 → 좌상단 밝은 테두리) 을 입힌 뒤 안쪽 1px 를 따뜻한 갈색 외곽선(#3b2a2a)으로 바꿔 몸 레이어에 합성한다.
//   눈·하이라이트·이빨 같은 1px 디테일은 외곽선 위(over 레이어)에 찍고, 바닥 그림자는 몸 아래(under 레이어)에 깐다.
// 규격: 일반 32×32(anchor 발 중앙 16,30), size2 48×48(24,45), 보스 80×80(40,76), 드래곤 96×96(48,90).
//   프레임 0 서있기, 1 걷기A, 2 서있기, 3 걷기B. left 는 레지스트리가 right 를 반전해 만든다. attack 2프레임(정면).
// pixel.js 는 수정하지 않고 필요한 헬퍼는 여기 둔다.
(() => {
  const O = '#3b2a2a';                 // 공통 외곽선
  const SH = 'rgba(0,0,0,0.22)';       // 바닥 그림자
  const W = '#ffffff';
  const { make, rect: R, ellipse: E } = Pixel;

  // ---------- 도형 생성기: shape(ctx, color, dx, dy, shrink) ----------
  const ell = (cx, cy, rx, ry) => (c, col, dx = 0, dy = 0, s = 0) => { const a = rx - s, b = ry - s; if (a < 0 || b < 0) return; E(c, cx + dx, cy + dy, a, b, col); };
  const box = (x, y, w, h) => (c, col, dx = 0, dy = 0, s = 0) => { const ww = w - 2 * s, hh = h - 2 * s; if (ww <= 0 || hh <= 0) return; R(c, x + dx + s, y + dy + s, ww, hh, col); };
  // 모서리 1px 깎은 상자
  const rbox = (x, y, w, h) => (c, col, dx = 0, dy = 0, s = 0) => {
    const X = x + dx + s, Y = y + dy + s, ww = w - 2 * s, hh = h - 2 * s; if (ww <= 0 || hh <= 0) return;
    if (ww < 3 || hh < 3) { R(c, X, Y, ww, hh, col); return; }
    R(c, X + 1, Y, ww - 2, hh, col); R(c, X, Y + 1, ww, hh - 2, col);
  };
  // 삼각형(스캔라인). shrink 는 무게중심 쪽으로 s px 당김
  const tri = (x0, y0, x1, y1, x2, y2) => (c, col, dx = 0, dy = 0, s = 0) => {
    let px = [x0, x1, x2], py = [y0, y1, y2];
    if (s) { const gx = (x0 + x1 + x2) / 3, gy = (y0 + y1 + y2) / 3; px = px.map((x, i) => { const vx = gx - x, vy = gy - py[i], l = Math.hypot(vx, vy) || 1; return x + vx / l * s; }); py = py.map((y, i) => { const vx = gx - [x0, x1, x2][i], vy = gy - y, l = Math.hypot(vx, vy) || 1; return y + vy / l * s; }); }
    px = px.map(v => v + dx); py = py.map(v => v + dy);
    const minY = Math.ceil(Math.min(...py)), maxY = Math.floor(Math.max(...py));
    c.fillStyle = col;
    for (let yy = minY; yy <= maxY; yy++) {
      const yc = yy + 0.5; let xs = [];
      for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; const ya = py[i], yb = py[j]; if ((yc >= ya && yc < yb) || (yc >= yb && yc < ya)) xs.push(px[i] + (yc - ya) * (px[j] - px[i]) / (yb - ya)); }
      if (xs.length < 2) { if (yy === minY || yy === maxY) { xs = px.filter((_, i) => Math.abs(py[i] - yy) < 1); if (xs.length < 1) continue; } else continue; }
      const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
      c.fillRect(a, yy, Math.max(1, b - a), 1);
    }
  };
  // 굵은 선(브레즌햄 + t×t 사각형)
  const line = (x0, y0, x1, y1, t = 3) => (c, col, dx = 0, dy = 0, s = 0) => {
    const tt = Math.max(1, t - 2 * s), o = Math.floor(tt / 2) - (s ? 0 : 0);
    let x = x0, y = y0; const ddx = Math.abs(x1 - x0), ddy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = ddx - ddy;
    c.fillStyle = col;
    for (let n = 0; n < 400; n++) {
      c.fillRect(x + dx - o + (s ? s : 0) - (s ? s : 0), y + dy - o, tt, tt);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err; if (e2 > -ddy) { err -= ddy; x += sx; } if (e2 < ddx) { err += ddx; y += sy; }
    }
  };
  const union = (...sh) => (c, col, dx, dy, s) => sh.forEach(f => f(c, col, dx, dy, s));
  // 도형 이동
  const at = (shape, ox, oy) => (c, col, dx = 0, dy = 0, s = 0) => shape(c, col, dx + ox, dy + oy, s);

  // 안쪽 외곽선: 불투명 픽셀 중 상하좌우에 투명 픽셀이 있으면 외곽선 색으로
  function outlineInner(cv, color) {
    const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    const d = ctx.getImageData(0, 0, w, h).data;
    const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    ctx.fillStyle = color;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!a(x, y)) continue;
      if (!a(x - 1, y) || !a(x + 1, y) || !a(x, y - 1) || !a(x, y + 1)) ctx.fillRect(x, y, 1, 1);
    }
  }
  // 3톤 명암: 어둠 전체 → (source-atop) 밝음을 좌상단으로 rw 만큼 밀어 그림 → 기본을 rw 만큼 줄여 그림
  //   결과: 좌상단에 밝은 테두리(rw-1 px), 우하단에 어두운 테두리(rw-1 px). 바깥 1px 는 이후 외곽선이 된다.
  function shade(tc, shape, tones, o = {}) {
    const [dk, bs, lt] = tones; const rw = o.rw == null ? 2 : o.rw;
    shape(tc, dk, 0, 0, 0);
    tc.save(); tc.globalCompositeOperation = 'source-atop';
    if (lt) shape(tc, lt, -rw, -rw, 0);
    shape(tc, bs, 0, 0, rw);
    tc.restore();
  }

  // ---------- 프레임 ----------
  function frame(w, h, alpha = 1) {
    const under = make(w, h), body = make(w, h), over = make(w, h);
    const F = { w, h, u: under.getContext('2d'), b: body.getContext('2d'), o: over.getContext('2d') };
    // 부품: fn(ctx) 로 임시 캔버스에 그리고 외곽선 처리 후 몸 레이어에 합성
    F.part = (fn, col = O) => { const t = make(w, h); const tc = t.getContext('2d'); fn(tc); outlineInner(t, col); F.b.drawImage(t, 0, 0); };
    // 3톤 부품
    F.blob = (shape, tones, o = {}) => F.part(tc => shade(tc, shape, tones, o), o.col);
    // 단색 부품(외곽선만)
    F.flat = (shape, col, oc = O) => F.part(tc => shape(tc, col, 0, 0, 0), oc);
    F.shadow = (cx, cy, rx, ry, col = SH) => E(F.u, cx, cy, rx, ry, col);
    F.px = (x, y, col) => R(F.o, x, y, 1, 1, col);
    F.dot = (x, y, ww, hh, col) => R(F.o, x, y, ww, hh, col);
    F.bpx = (x, y, col) => R(F.b, x, y, 1, 1, col);             // 몸 레이어 직접(질감용)
    F.brect = (x, y, ww, hh, col) => R(F.b, x, y, ww, hh, col);
    // 체커 디더로 지우기(망령 밑단 등): y0..y1 행을, 아래로 갈수록 성기게
    F.dither = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) { const k = y - y0; for (let x = x0; x <= x1; x++) { const keep = ((x + y) & 1) === 0 && (k < 2 || ((x >> 1) + y) % 3 !== 0); if (!keep) { F.b.clearRect(x, y, 1, 1); F.o.clearRect(x, y, 1, 1); } } } };
    F.done = () => { const c = make(w, h); const x = c.getContext('2d'); x.drawImage(under, 0, 0); x.globalAlpha = alpha; x.drawImage(body, 0, 0); x.globalAlpha = 1; x.drawImage(over, 0, 0); return c; };
    return F;
  }
  // 빌더: draw(F, dir, f, atk) — f 0~3 걷기 프레임, atk -1 이면 일반, 0/1 공격 프레임
  function build(w, h, anchor, draw, o = {}) {
    return () => {
      const mk = (dir, f, atk) => { const F = frame(w, h, o.alpha); draw(F, dir, f, atk); return F.done(); };
      const sheet = { anchor, w, h, down: [], up: [], right: [], attack: [] };
      for (const d of ['down', 'up', 'right']) for (let f = 0; f < 4; f++) sheet[d].push(mk(d, f, -1));
      sheet.attack = [mk('down', 0, 0), mk('down', 0, 1)];
      return sheet;
    };
  }

  // ---------- 공통 디테일 ----------
  // 큰 귀여운 눈: w×h 흰자 없이 홍채 2톤 + 흰 하이라이트 + 위 속눈썹선
  function eye(F, x, y, w, h, iris, irisDark, lash = true) {
    F.dot(x, y, w, h, iris);
    F.dot(x, y + Math.ceil(h / 2), w, Math.floor(h / 2), irisDark);
    F.px(x, y, W);
    if (lash) F.dot(x, y - 1, w, 1, '#2e2230');
  }
  // 빛나는 눈(2×2 또는 w×h): 바깥 색 + 안쪽 밝은 점
  function glowEye(F, x, y, w, h, col, hot) { F.dot(x, y, w, h, col); F.px(x, y, hot); }
  // 이빨/엄니 (위로 솟는 2px)
  const tusk = (F, x, y, up = true, col = '#f4efe0') => { F.px(x, y, col); F.px(x, up ? y - 1 : y + 1, col); F.px(x, up ? y - 2 : y + 2, O); };
  // 걷기 파라미터
  const walk = (f) => ({ bob: (f === 1 || f === 3) ? -1 : 0, step: f === 1 ? 1 : f === 3 ? -1 : 0 });
  // 질감 점(결정적): 영역 안에 n 개 색 점
  function speckle(F, seed, x, y, w, h, n, col, layer = 'b') { const r = Pixel.rng(seed); for (let i = 0; i < n; i++) { const px = x + Math.floor(r() * w), py = y + Math.floor(r() * h); (layer === 'b' ? F.bpx : F.px)(px, py, col); } }
  // 균열(지그재그 선): 몸 레이어에 직접
  function crack(F, x, y, len, col, dir = 1) { let cx = x, cy = y; for (let i = 0; i < len; i++) { F.bpx(cx, cy, col); cy++; if (i % 2 === 1) cx += dir; if (i % 5 === 4) dir = -dir; } }

  // ====================================================================
  // 팔레트
  // ====================================================================
  const T = {
    stone: ['#4b4e58', '#767a86', '#a7abb6'], stoneDk: ['#3b3e47', '#5c606b', '#868a96'],
    crystalRock: ['#44505f', '#6b7a8e', '#9aabbf'], crystal: ['#2e8bb8', '#62cdf2', '#d2f6ff'],
    batFur: ['#4e3d5c', '#75607f', '#9d8aa8'], batWing: ['#3f2c48', '#5e4368', '#7f6189'],
    spider: ['#3d4656', '#5e6a7c', '#8893a6'], spiderMark: ['#9a3e3e', '#c85a4f'],
    naga: ['#27603f', '#3f9460', '#7fd394'], nagaBelly: ['#7a9a52', '#b9cf7e', '#e4ef b8'],
    nagaP: ['#3a3a78', '#625dae', '#9e95da'], robe: ['#9a8a6a', '#e6d9b4', '#fff7e0'], gold: ['#9a6f1e', '#dcb14a', '#fff0a6'],
    orc: ['#3a6529', '#5b9440', '#8dc767'], iron: ['#3a3d47', '#5d6270', '#8b919f'], fur: ['#5a3d26', '#8a6238', '#b88a58'],
    troll: ['#235f5c', '#3a9a90', '#7cd3c6'], hair: ['#b84a1e', '#ea7a2a', '#ffb45a'], bone: ['#9a9381', '#d4ccaf', '#f4efdd'],
    wraith: ['#2b2446', '#4b4078', '#7d6fb3'], wraithHand: ['#7a77a0', '#aeaacc', '#e0dcf0'],
    armor: ['#2b2f3c', '#4a5062', '#777f95'], shield: ['#5a2626', '#8c3a3a', '#b85a4f'],
    drake: ['#5a2b2a', '#8e4a42', '#c58874'], drakeBelly: ['#9c7a4a', '#d9b27a', '#f1dcae'], drakeWing: ['#3f2222', '#6a3734', '#8f4e46'],
    dragon: ['#3f3f49', '#66677a', '#9699ab'], dragonBelly: ['#7a7064', '#b0a594', '#d6cdbb'], dragonWing: ['#2d2731', '#49404f', '#6a5c70'],
    ember: ['#c84a1e', '#ff8c3a', '#ffe08a'],
    wood: ['#5a3a1e', '#8a5a2e', '#b8824a'],
  };
  T.nagaBelly = ['#7a9a52', '#b9cf7e', '#e4efb8'];

  // ====================================================================
  // 1. 동굴 박쥐 (32×32, 날아다님)
  // ====================================================================
  MonsterSprites.register('bat', build(32, 32, { x: 16, y: 30 }, (F, dir, f, atk) => {
    const flap = atk >= 0 ? (atk === 0 ? -5 : 2) : [0, -4, 0, 3][f];
    const hov = atk >= 0 ? 1 : [0, -1, 0, 1][f];
    const cy = 14 + hov;
    F.shadow(16, 29, 7 - Math.abs(flap) / 3 | 0, 2);
    if (dir === 'right') {
      // 옆: 뒤쪽 날개가 몸 위로 크게, 앞쪽 날개는 몸 앞 아래로
      F.blob(union(tri(15, cy - 1, 3, cy - 10 + flap, 6, cy + 1 + flap / 2 | 0), tri(15, cy - 1, 6, cy + 1 + flap / 2 | 0, 13, cy + 4)), T.batWing, { rw: 2 });
      for (let i = 1; i <= 4; i++) F.bpx(15 - i * 2, cy - 1 + Math.round(i * (flap - 7) / 5), T.batWing[0]);
      F.blob(ell(17, cy + 1, 6, 4), T.batFur);
      F.blob(tri(15, cy - 2, 16, cy - 8, 19, cy - 2), T.batFur);
      F.blob(union(tri(17, cy + 2, 10, cy + 4 - flap / 2 | 0, 20, cy + 8 - flap / 3 | 0)), T.batWing, { rw: 1 });
      eye(F, 20, cy - 1, 2, 3, '#ffd84a', '#d99a1c');
      F.px(22, cy + 2, '#f4efe0'); F.px(22, cy + 3, O); F.px(23, cy + 1, O);
      return;
    }
    // 정면/뒷면: 좌우 날개
    const wingL = union(tri(12, cy, 2, cy - 7 + flap, 4, cy + 4 + flap / 2 | 0), tri(12, cy, 4, cy + 4 + flap / 2 | 0, 12, cy + 6));
    const wingR = union(tri(20, cy, 30, cy - 7 + flap, 28, cy + 4 + flap / 2 | 0), tri(20, cy, 28, cy + 4 + flap / 2 | 0, 20, cy + 6));
    F.blob(wingL, T.batWing, { rw: 2 }); F.blob(wingR, T.batWing, { rw: 2 });
    // 날개 뼈대선
    for (const sgn of [-1, 1]) { const x0 = sgn < 0 ? 12 : 20; for (let i = 1; i <= 5; i++) F.bpx(x0 + sgn * i * 2, cy + Math.round((i * (flap - 5)) / 6) + (i > 2 ? 1 : 0), T.batWing[0]); }
    F.blob(ell(16, cy + 1, 5, 5), T.batFur);
    F.blob(union(tri(11, cy - 2, 12, cy - 8, 15, cy - 3), tri(21, cy - 2, 20, cy - 8, 17, cy - 3)), T.batFur);
    if (dir === 'down') {
      eye(F, 12, cy - 1, 3, 3, '#ffd84a', '#d99a1c'); eye(F, 18, cy - 1, 3, 3, '#ffd84a', '#d99a1c');
      F.px(14, cy + 3, '#f4efe0'); F.px(18, cy + 3, '#f4efe0');
      if (atk >= 0) { F.dot(14, cy + 3, 5, 2, '#5a1e2e'); F.px(14, cy + 3, '#f4efe0'); F.px(18, cy + 3, '#f4efe0'); }
      else F.dot(15, cy + 3, 3, 1, '#4a2a38');
      F.px(11, cy - 5, T.batFur[0]); F.px(21, cy - 5, T.batFur[0]);
    } else { F.dot(14, cy, 2, 1, T.batFur[0]); F.dot(17, cy + 2, 2, 1, T.batFur[0]); }
  }));

  // ====================================================================
  // 2. 동굴 거미 (32×32)
  // ====================================================================
  MonsterSprites.register('cave_spider', build(32, 32, { x: 16, y: 30 }, (F, dir, f, atk) => {
    const { bob, step } = walk(f);
    F.shadow(16, 29, 11, 3);
    const legs = (hx, hy, side, baseAngles) => {
      // 다리 4개: 몸(hx,hy)에서 관절 → 발. side ±1
      baseAngles.forEach((a, i) => {
        const fwd = (i % 2 === 0 ? step : -step) * 2;
        const raise = (atk >= 0 && i === 0 && atk === 0) ? -7 : 0;
        const jx = hx + side * (6 + i), jy = hy - 5 + i * 3 + fwd / 2 + raise;
        const ex = hx + side * (12 + (i === 0 || i === 3 ? 1 : 2)), ey = hy + 2 + i * 3 + fwd + raise * 2 / 3 | 0;
        F.blob(union(line(hx, hy, jx, jy, 3), line(jx, jy, ex, Math.min(28, ey), 3)), T.spider, { rw: 1 });
      });
    };
    if (dir === 'right') {
      const hx = 13, hy = 17 + bob;
      legs(hx, hy, -1, [0, 1, 2, 3]); legs(hx + 4, hy, 1, [0, 1, 2, 3]);
      F.blob(ell(11, 17 + bob, 8, 6), T.spider, { rw: 3 });
      F.blob(ell(21, 19 + bob, 5, 4), T.spider);
      F.bpx(9, 14 + bob, T.spiderMark[1]); F.dot(8, 15 + bob, 2, 1, T.spiderMark[0]); F.dot(11, 17 + bob, 2, 1, T.spiderMark[0]);
      eye(F, 23, 17 + bob, 2, 2, '#ff5a4a', '#b32a2a', false); F.px(22, 16 + bob, '#ff5a4a');
      F.px(25, 21 + bob, '#f4efe0'); F.px(24, 22 + bob, O);
      return;
    }
    const front = dir === 'down';
    const ay = front ? 13 + bob : 19 + bob, hy = front ? 22 + bob : 11 + bob;
    legs(16, 17 + bob, -1, [0, 1, 2, 3]); legs(16, 17 + bob, 1, [0, 1, 2, 3]);
    F.blob(ell(16, ay, 9, 6), T.spider, { rw: 3 });
    // 배 무늬(붉은 모래시계/반점)
    F.bpx(16, ay - 3, T.spiderMark[1]); F.dot(15, ay - 2, 3, 1, T.spiderMark[0]); F.dot(14, ay - 1, 5, 1, T.spiderMark[0]); F.dot(15, ay, 3, 1, T.spiderMark[0]); F.dot(14, ay + 1, 1, 1, T.spiderMark[0]); F.dot(18, ay + 1, 1, 1, T.spiderMark[0]);
    F.blob(ell(16, hy, 6, 4), T.spider);
    if (front) {
      eye(F, 12, hy - 2, 3, 3, '#ff5a4a', '#b32a2a', false); eye(F, 18, hy - 2, 3, 3, '#ff5a4a', '#b32a2a', false);
      F.px(15, hy - 2, '#ff5a4a'); F.px(17, hy - 2, '#ff5a4a');
      F.px(14, hy + 2, '#f4efe0'); F.px(18, hy + 2, '#f4efe0'); F.px(14, hy + 3, O); F.px(18, hy + 3, O);
      if (atk >= 0) { F.dot(15, hy + 2, 3, 1, '#5a1e2e'); }
    } else { F.dot(14, hy, 2, 1, T.spider[0]); F.dot(17, hy + 1, 2, 1, T.spider[0]); }
  }));

  // ====================================================================
  // 3·4. 골렘 (48×48) — 돌 / 수정
  // ====================================================================
  function golem(F, dir, f, atk, tones, crystal) {
    const { bob, step } = walk(f);
    const by = bob;
    F.shadow(24, 44, 15, 4);
    const eyeCol = crystal ? ['#62cdf2', '#ffffff'] : ['#ff8c3a', '#ffe08a'];
    const rockDk = tones[0];
    const fistY = (s) => 24 + by + (atk >= 0 ? (atk === 0 ? -9 : 5) : s * 2);
    if (dir === 'right') {
      // 다리
      F.blob(union(rbox(14 + step * 2, 32, 9, 10), ell(18 + step * 2, 42, 5, 3)), tones); F.blob(union(rbox(24 - step * 2, 32, 9, 10), ell(28 - step * 2, 42, 5, 3)), tones);
      // 뒤팔(약간 보임)
      F.blob(rbox(12, 22 + by - step, 7, 12), tones);
      // 몸통
      F.blob(union(ell(24, 24 + by, 11, 11), rbox(14, 14 + by, 20, 18)), tones, { rw: 3 });
      crack(F, 22, 16 + by, 8, rockDk); crack(F, 29, 24 + by, 6, rockDk, -1);
      // 머리
      F.blob(rbox(18, 4 + by, 15, 11), tones);
      glowEye(F, 28, 8 + by, 3, 2, eyeCol[0], eyeCol[1]);
      F.dot(27, 12 + by, 4, 1, rockDk);
      // 앞팔(큰 주먹)
      F.blob(union(ell(34, 19 + by, 5, 4), rbox(31, fistY(step) - 2, 11, 12)), tones);
      F.dot(33, fistY(step) + 3, 7, 1, rockDk); F.dot(35, fistY(step) + 6, 5, 1, rockDk);
      if (crystal) { F.blob(tri(20, 6 + by, 24, -2 + by, 28, 6 + by), T.crystal, { rw: 2 }); F.blob(tri(14, 15 + by, 10, 6 + by, 20, 14 + by), T.crystal, { rw: 2 }); F.px(23, 1 + by, W); F.px(13, 9 + by, W); }
      else { F.blob(tri(18, 15 + by, 15, 8 + by, 23, 14 + by), tones); speckle(F, 7, 16, 16 + by, 16, 16, 8, '#6f8f4a'); }
      return;
    }
    const front = dir === 'down';
    // 다리
    F.blob(union(rbox(11, 32 + (step > 0 ? -1 : 0), 10, 10), ell(16, 42, 6, 3)), tones); F.blob(union(rbox(27, 32 + (step < 0 ? -1 : 0), 10, 10), ell(32, 42, 6, 3)), tones);
    F.dot(13, 38, 5, 1, rockDk); F.dot(30, 39, 5, 1, rockDk);
    // 몸통(큰 바위) + 어깨
    F.blob(union(ell(24, 24 + by, 15, 11), rbox(11, 14 + by, 26, 18), ell(10, 19 + by, 6, 6), ell(38, 19 + by, 6, 6)), tones, { rw: 3 });
    F.dot(13, 15 + by, 1, 1, tones[2]); F.dot(14, 14 + by, 3, 1, tones[2]);
    if (front) { crack(F, 20, 17 + by, 9, rockDk); crack(F, 31, 22 + by, 7, rockDk, -1); F.dot(14, 30 + by, 6, 1, rockDk); F.dot(27, 32 + by, 8, 1, rockDk); }
    else { crack(F, 17, 16 + by, 12, rockDk); crack(F, 28, 15 + by, 10, rockDk, -1); F.dot(12, 26 + by, 9, 1, rockDk); F.dot(24, 29 + by, 10, 1, rockDk); }
    // 머리(몸통에 박힌 작은 바위)
    F.blob(rbox(16, 4 + by, 16, 11), tones);
    if (front) {
      glowEye(F, 19, 8 + by, 3, 2, eyeCol[0], eyeCol[1]); glowEye(F, 26, 8 + by, 3, 2, eyeCol[0], eyeCol[1]);
      F.dot(21, 12 + by, 6, 1, rockDk); F.px(20, 7 + by, rockDk); F.px(28, 7 + by, rockDk);
    } else { F.dot(19, 7 + by, 10, 1, rockDk); crack(F, 23, 8 + by, 4, rockDk); }
    // 팔(주먹) — 공격: 두 주먹을 들었다 내리찍음
    const fy = fistY(step), fy2 = fistY(-step);
    F.blob(union(ell(6, fy + 4, 6, 7), rbox(2, fy - 1, 9, 6)), tones); F.blob(union(ell(41, fy2 + 4, 6, 7), rbox(37, fy2 - 1, 9, 6)), tones);
    F.dot(3, fy + 4, 7, 1, rockDk); F.dot(38, fy2 + 4, 7, 1, rockDk); F.dot(5, fy + 7, 3, 1, rockDk); F.dot(40, fy2 + 7, 3, 1, rockDk);
    if (atk === 1) { for (let i = 0; i < 5; i++) { F.px(2 + i * 3, 42 + (i % 2), '#d8d2bb'); F.px(33 + i * 3, 42 + (i % 2), '#d8d2bb'); } }
    if (crystal) {
      // 하늘색 결정: 머리 위, 양 어깨, 가슴
      F.blob(tri(20, 5 + by, 24, -3 + by, 28, 5 + by), T.crystal, { rw: 2 }); F.px(23, 0 + by, W);
      F.blob(union(tri(6, 15 + by, 3, 6 + by, 12, 14 + by), tri(10, 15 + by, 11, 8 + by, 15, 15 + by)), T.crystal, { rw: 2 }); F.px(4, 9 + by, W);
      F.blob(union(tri(36, 15 + by, 42, 5 + by, 44, 15 + by), tri(33, 15 + by, 36, 8 + by, 38, 15 + by)), T.crystal, { rw: 2 }); F.px(41, 8 + by, W);
      if (front) { F.blob(union(tri(19, 27 + by, 23, 19 + by, 26, 27 + by), tri(25, 27 + by, 29, 22 + by, 30, 27 + by)), T.crystal, { rw: 2 }); F.px(22, 22 + by, W); }
      else { F.blob(union(tri(16, 29 + by, 21, 18 + by, 25, 28 + by), tri(26, 29 + by, 31, 20 + by, 34, 28 + by)), T.crystal, { rw: 2 }); F.px(20, 21 + by, W); F.px(30, 23 + by, W); }
    } else {
      // 돌 골렘: 이끼 반점 + 어깨 돌기
      F.blob(tri(4, 16 + by, 7, 9 + by, 12, 15 + by), tones); F.blob(tri(36, 16 + by, 41, 10 + by, 44, 16 + by), tones);
      speckle(F, 3, 12, 14 + by, 24, 10, 10, '#6f8f4a'); speckle(F, 5, 14, 24 + by, 20, 10, 6, '#86a85a');
    }
  }
  MonsterSprites.register('golem_stone', build(48, 48, { x: 24, y: 45 }, (F, d, f, a) => golem(F, d, f, a, T.stone, false)));
  MonsterSprites.register('golem_crystal', build(48, 48, { x: 24, y: 45 }, (F, d, f, a) => golem(F, d, f, a, T.crystalRock, true)));

  // ====================================================================
  // 5·6. 나가 / 나가 사제 (32×32) — 뱀 하반신
  // ====================================================================
  function naga(F, dir, f, atk, tones, priest) {
    const { bob } = walk(f);
    const sw = [0, 2, 0, -2][f];             // 꼬리 흔들림
    F.shadow(16, 29, 10, 3);
    const skin = tones, belly = priest ? ['#8a7fb8', '#cbbfe8', '#eee9ff'] : T.nagaBelly;
    const eyeC = priest ? ['#ffd0f0', '#b04fa0'] : ['#ffe066', '#c0801a'];
    const hy = 8 + bob;
    if (dir === 'right') {
      // 꼬리: 몸 뒤(왼쪽)로 똬리, 끝이 흔들림
      F.blob(union(ell(13, 25 + bob / 2 | 0, 10, 4), tri(4, 25, 1 + sw, 17 + sw, 7, 22)), skin, { rw: 2 });
      F.dot(6, 25, 10, 1, belly[0]);
      F.blob(union(rbox(13, 15 + bob, 9, 9), ell(17, 21 + bob, 5, 4)), skin, { rw: 2 });
      F.blob(ell(19, 9 + bob, 6, 6), skin, { rw: 2 });
      F.blob(tri(13, 7 + bob, 9, 2 + bob, 14, 12 + bob), skin, { rw: 1 });   // 뒤통수 지느러미
      F.flat(box(24, 9 + bob, 3, 2), skin[1]);     // 주둥이
      eye(F, 21, 7 + bob, 2, 3, eyeC[0], eyeC[1]);
      F.px(25, 11 + bob, O);
      if (priest) { F.blob(union(rbox(13, 15 + bob, 9, 6)), T.robe, { rw: 2 }); F.blob(union(tri(14, 5 + bob, 19, -2 + bob, 24, 5 + bob), box(14, 4 + bob, 10, 3)), T.gold, { rw: 2 }); F.px(19, 1 + bob, W);
        const sx = atk >= 0 ? 27 : 25; F.blob(line(sx, 6 + bob, sx, 27 + bob, 3), T.wood, { rw: 1 }); F.blob(ell(sx, 5 + bob, 3, 3), ['#b04fa0', '#e48ad0', '#ffd0f0'], { rw: 2 }); F.px(sx - 1, 4 + bob, W);
        F.blob(line(21, 17 + bob, sx, 15 + bob, 3), skin, { rw: 1 }); }
      else { const sx = atk >= 0 ? 23 + atk * 3 : 22, sy = atk >= 0 ? 16 : 3; F.blob(union(line(sx, sy + bob, sx + (atk >= 0 ? 7 : 0), (atk >= 0 ? sy : 27) + bob, 3)), T.wood, { rw: 1 }); F.blob(atk >= 0 ? tri(sx + 7, sy - 2 + bob, sx + 12, sy + 1 + bob, sx + 7, sy + 4 + bob) : tri(sx - 2, sy + bob, sx, sy - 5 + bob, sx + 3, sy + bob), T.iron, { rw: 1 }); F.blob(line(21, 17 + bob, 24, 15 + bob, 3), skin, { rw: 1 }); }
      return;
    }
    const front = dir === 'down';
    // 똬리: 타원 2개 + 꼬리 끝(흔들림)
    F.blob(union(line(14, 23, 8, 26, 7), line(8, 27, 20, 28, 6), line(20, 28, 26, 24, 5), tri(24, 26, 31 + sw, 15 + sw, 29, 26)), skin, { rw: 2 });
    for (let i = 0; i < 9; i++) F.bpx(7 + i * 2, 25 + (i % 2), skin[0]);   // 비늘 점
    if (front) { F.dot(9, 28, 10, 1, belly[1]); F.dot(12, 30, 8, 1, belly[1]); F.px(27, 23, belly[1]); F.px(28, 21, belly[1]); }
    // 몸통(상체) + 팔
    F.blob(union(rbox(11, 14 + bob, 10, 9)), skin, { rw: 2 });
    if (front) { F.dot(13, 17 + bob, 6, 1, belly[1]); F.dot(13, 20 + bob, 6, 1, belly[1]); }
    F.blob(line(10, 16 + bob, 7, 21 + bob, 3), skin, { rw: 1 });
    // 머리 + 지느러미
    F.blob(union(ell(16, hy, 6, 6), tri(10, hy - 1, 6, hy - 6, 11, hy + 3), tri(22, hy - 1, 26, hy - 6, 21, hy + 3)), skin, { rw: 2 });
    F.dot(8, hy - 3, 1, 3, skin[0]); F.dot(23, hy - 3, 1, 3, skin[0]);
    if (front) {
      eye(F, 12, hy - 1, 3, 3, eyeC[0], eyeC[1]); eye(F, 18, hy - 1, 3, 3, eyeC[0], eyeC[1]);
      F.px(13, hy, O); F.px(19, hy, O); // 세로 동공
      F.dot(15, hy + 3, 3, 1, skin[0]); F.px(14, hy + 3, '#f4efe0'); F.px(18, hy + 3, '#f4efe0');
      F.px(13, hy + 1, '#d87070'); F.px(19, hy + 1, '#d87070');
    } else { F.dot(13, hy - 2, 6, 1, skin[0]); F.dot(14, hy + 1, 4, 1, skin[0]); }
    if (priest) {
      // 로브(가슴 천) + 금 머리장식 + 보주 지팡이
      F.blob(rbox(11, 14 + bob, 10, 6), T.robe, { rw: 2 }); F.dot(15, 15 + bob, 2, 4, T.gold[1]);
      F.blob(union(tri(10, hy - 4, 16, hy - 12, 22, hy - 4), box(10, hy - 5, 12, 3)), T.gold, { rw: 2 }); F.px(16, hy - 10, W); F.px(15, hy - 4, '#e44a8a');
      const sx = 25, sy0 = atk >= 0 ? 2 + bob : 6 + bob;
      F.blob(line(sx, sy0 + 4, sx, 27 + bob, 3), T.wood, { rw: 1 }); F.blob(ell(sx, sy0 + 2, 3, 3), ['#b04fa0', '#e48ad0', '#ffd0f0'], { rw: 2 }); F.px(sx - 1, sy0 + 1, W);
      if (atk >= 0) { F.px(sx - 4, sy0 - 1, '#ffd0f0'); F.px(sx + 4, sy0, '#ffd0f0'); F.px(sx, sy0 - 3, '#ffd0f0'); if (atk === 1) { F.px(sx - 5, sy0 + 5, '#e48ad0'); F.px(sx + 5, sy0 + 6, '#e48ad0'); } }
      F.blob(line(21, 17 + bob, sx - 1, 15 + bob, 3), skin, { rw: 1 });
    } else {
      // 창: 오른손, 공격 때 아래로 찌름
      if (atk >= 0) { const sy = 10 + atk * 4; F.blob(line(22, sy, 26, sy + 16, 3), T.wood, { rw: 1 }); F.blob(tri(24, sy + 15, 30, sy + 22, 23, sy + 20), T.iron, { rw: 1 }); F.blob(line(21, 17 + bob, 24, 14, 3), skin, { rw: 1 }); }
      else { F.blob(line(25, 2 + bob, 25, 27 + bob, 3), T.wood, { rw: 1 }); F.blob(tri(23, 3 + bob, 25, -3 + bob, 28, 3 + bob), T.iron, { rw: 1 }); F.blob(line(21, 17 + bob, 24, 15 + bob, 3), skin, { rw: 1 }); }
    }
  }
  MonsterSprites.register('naga', build(32, 32, { x: 16, y: 30 }, (F, d, f, a) => naga(F, d, f, a, T.naga, false)));
  MonsterSprites.register('naga_priest', build(32, 32, { x: 16, y: 30 }, (F, d, f, a) => naga(F, d, f, a, T.nagaP, true)));

  // ====================================================================
  // 7. 오크 전사장 (48×48)
  // ====================================================================
  const BOOT = ['#3a2a20', '#5e4232', '#86624a'];
  MonsterSprites.register('orc_warlord', build(48, 48, { x: 24, y: 45 }, (F, dir, f, atk) => {
    const { bob, step } = walk(f); const by = bob;
    F.shadow(24, 44, 14, 4);
    if (dir === 'right') {
      F.blob(union(rbox(16 + step * 3, 30, 8, 9), rbox(15 + step * 3, 37, 10, 8)), BOOT); F.blob(union(rbox(25 - step * 3, 30, 8, 9), rbox(24 - step * 3, 37, 10, 8)), BOOT);
      F.blob(rbox(15, 27 + by, 18, 6), T.fur, { rw: 2 });
      F.blob(ell(24, 21 + by, 10, 9), T.orc, { rw: 3 });
      F.blob(rbox(18, 17 + by, 14, 10), T.iron, { rw: 3 });
      F.blob(ell(22, 14 + by, 6, 5), T.fur, { rw: 2 });
      F.blob(ell(26, 9 + by, 8, 7), T.orc, { rw: 3 }); F.blob(rbox(22, 11 + by, 12, 5), T.orc, { rw: 2 });
      tusk(F, 31, 11 + by); eye(F, 29, 6 + by, 2, 2, '#ff6a4a', '#b32a2a'); F.dot(28, 5 + by, 4, 1, '#2e2230');
      F.blob(union(rbox(19, 2 + by, 16, 6), tri(19, 5 + by, 13, 0 + by, 21, 2 + by)), T.iron, { rw: 2 }); F.blob(tri(19, 5 + by, 13, -1 + by, 21, 2 + by), T.bone, { rw: 1 });
      // 앞팔 + 도끼
      const ax = atk >= 0 ? (atk === 0 ? 30 : 36) : 33, ay = atk >= 0 ? (atk === 0 ? 2 : 20) : 10;
      F.blob(union(line(30, 18 + by, ax, ay + 10, 4)), T.orc, { rw: 1 });
      F.blob(line(ax, ay, ax + (atk === 1 ? 6 : 0), ay + 20 - (atk === 1 ? 8 : 0), 3), T.wood, { rw: 1 });
      F.blob(union(tri(ax + 1, ay - 2, ax + 8, ay + 2, ax + 1, ay + 8), tri(ax - 1, ay - 2, ax - 8, ay + 2, ax - 1, ay + 8)), T.iron, { rw: 2 });
      return;
    }
    const front = dir === 'down';
    // 다리/부츠
    F.blob(union(rbox(12, 30 - (step > 0 ? 1 : 0), 9, 9), rbox(11, 37, 11, 8)), BOOT); F.blob(union(rbox(27, 30 - (step < 0 ? 1 : 0), 9, 9), rbox(26, 37, 11, 8)), BOOT);
    F.blob(rbox(12, 27 + by, 24, 6), T.fur, { rw: 2 }); F.dot(14, 29 + by, 2, 2, T.fur[0]); F.dot(31, 29 + by, 2, 2, T.fur[0]);
    // 몸통 + 흉갑 + 털 견갑
    F.blob(ell(24, 21 + by, 13, 9), T.orc, { rw: 3 });
    F.blob(rbox(14, 16 + by, 20, 11), T.iron, { rw: 3 }); if (front) { F.dot(23, 18 + by, 2, 6, T.iron[0]); F.px(19, 20 + by, T.iron[2]); F.px(28, 20 + by, T.iron[2]); }
    F.blob(ell(10, 15 + by, 6, 5), T.fur, { rw: 2 }); F.blob(ell(38, 15 + by, 6, 5), T.fur, { rw: 2 });
    // 팔
    const ly = 26 + by + step, ry = 26 + by - step;
    F.blob(union(line(8, 18 + by, 5, ly, 4), ell(5, ly + 1, 3, 3)), T.orc, { rw: 1 });
    const ax = 43, ay = atk >= 0 ? (atk === 0 ? 4 : 18) : 12;
    F.blob(union(line(40, 18 + by, ax, atk >= 0 ? ay + 4 : ry, 4), ell(ax, atk >= 0 ? ay + 5 : ry + 1, 3, 3)), T.orc, { rw: 1 });
    // 도끼(오른손): 세로 자루 + 양날
    if (atk === 1) { F.blob(line(43, 20, 30, 40, 3), T.wood, { rw: 1 }); F.blob(union(tri(31, 37, 24, 44, 36, 44), tri(31, 37, 36, 44, 38, 36)), T.iron, { rw: 2 }); F.px(26, 45, W); F.px(33, 46, W); }
    else { F.blob(line(ax, ay - 2, ax, ay + 24, 3), T.wood, { rw: 1 }); F.blob(union(tri(ax + 1, ay - 4, ax + 6, ay, ax + 1, ay + 8), tri(ax - 1, ay - 4, ax - 7, ay, ax - 1, ay + 8)), T.iron, { rw: 2 }); F.px(ax - 5, ay, W); }
    // 머리: 큰 턱 + 엄니 + 투구
    F.blob(ell(24, 9 + by, 9, 7), T.orc, { rw: 3 }); F.blob(rbox(16, 11 + by, 16, 5), T.orc, { rw: 2 });
    if (front) {
      tusk(F, 19, 11 + by); tusk(F, 29, 11 + by); F.dot(21, 12 + by, 7, 1, T.orc[0]);
      eye(F, 19, 7 + by, 3, 2, '#ff6a4a', '#b32a2a', false); eye(F, 27, 7 + by, 3, 2, '#ff6a4a', '#b32a2a', false);
      F.dot(18, 6 + by, 4, 1, '#2e2230'); F.dot(27, 6 + by, 4, 1, '#2e2230'); F.px(24, 9 + by, T.orc[0]);
      F.px(17, 13 + by, '#b3302a'); F.px(31, 13 + by, '#b3302a');
    } else F.dot(20, 9 + by, 8, 1, T.orc[0]);
    F.blob(rbox(15, 2 + by, 18, 6), T.iron, { rw: 2 }); F.dot(17, 3 + by, 14, 1, T.iron[2]);
    F.blob(union(tri(16, 5 + by, 9, -1 + by, 19, 2 + by), tri(32, 5 + by, 39, -1 + by, 29, 2 + by)), T.bone, { rw: 1 });
  }));

  // ====================================================================
  // 8. 트롤 주술사 (48×48)
  // ====================================================================
  MonsterSprites.register('troll_shaman', build(48, 48, { x: 24, y: 45 }, (F, dir, f, atk) => {
    const { bob, step } = walk(f); const by = bob;
    F.shadow(24, 44, 14, 4);
    const skull = (sx, sy, glow) => { F.blob(ell(sx, sy, 4, 3), T.bone, { rw: 2 }); F.px(sx - 2, sy, O); F.px(sx + 1, sy, O); F.px(sx - 1, sy + 2, O); F.px(sx + 1, sy + 2, O); F.px(sx - 4, sy - 2, '#e44a4a'); F.px(sx + 4, sy - 2, '#52c6c0'); F.px(sx - 5, sy - 3, '#e44a4a'); F.px(sx + 5, sy - 3, '#52c6c0'); if (glow) { for (const [dx, dy] of [[-6, -5], [6, -6], [0, -6], [-4, 2], [5, 3]]) F.px(sx + dx, sy + dy, '#aef0ea'); } };
    if (dir === 'right') {
      F.blob(union(rbox(16 + step * 3, 33, 7, 8), ell(20 + step * 3, 42, 6, 3)), T.troll); F.blob(union(rbox(25 - step * 3, 33, 7, 8), ell(29 - step * 3, 42, 6, 3)), T.troll);
      F.blob(rbox(15, 29 + by, 17, 6), T.fur, { rw: 2 });
      F.blob(ell(24, 23 + by, 11, 9), T.troll, { rw: 3 });
      F.blob(union(ell(28, 11 + by, 9, 8), box(34, 12 + by, 5, 4)), T.troll, { rw: 3 }); // 머리 + 긴 코
      tusk(F, 33, 15 + by); eye(F, 31, 8 + by, 2, 3, '#ffe066', '#c0801a'); F.dot(30, 7 + by, 4, 1, '#2e2230');
      F.blob(union(tri(20, 6 + by, 30, -4 + by, 34, 6 + by)), T.hair, { rw: 2 });
      F.blob(tri(20, 10 + by, 15, 6 + by, 20, 14 + by), T.troll, { rw: 1 });
      const sy = atk >= 0 ? 1 : 6;
      F.blob(line(36, 22 + by, 38, sy + 10, 4), T.troll, { rw: 1 });
      F.blob(line(38, sy + 4, 38, 40, 3), T.wood, { rw: 1 }); skull(38, sy + 2, atk >= 0);
      return;
    }
    const front = dir === 'down';
    F.blob(union(rbox(12, 33 - (step > 0 ? 1 : 0), 8, 8), ell(16, 42, 7, 3)), T.troll); F.blob(union(rbox(28, 33 - (step < 0 ? 1 : 0), 8, 8), ell(32, 42, 7, 3)), T.troll);
    F.blob(rbox(12, 29 + by, 24, 6), T.fur, { rw: 2 }); F.px(16, 31 + by, T.fur[0]); F.px(30, 31 + by, T.fur[0]);
    // 구부정한 몸통 + 배
    F.blob(ell(24, 23 + by, 13, 10), T.troll, { rw: 3 });
    if (front) { F.blob(ell(24, 26 + by, 8, 6), ['#5fbcae', '#8ddccd', '#c4f0e8'], { rw: 2, col: T.troll[0] }); for (let i = 0; i < 7; i++) { F.px(17 + i * 2, 18 + by + (i % 2) * 1, '#f4efdd'); } }
    // 팔
    F.blob(union(line(12, 19 + by, 7, 30 + by + step, 4), ell(7, 31 + by + step, 4, 3)), T.troll, { rw: 1 });
    const sy = atk >= 0 ? 0 : 5;
    F.blob(union(line(36, 19 + by, 40, atk >= 0 ? 12 : 28 + by - step, 4), ell(40, atk >= 0 ? 12 : 29 + by - step, 4, 3)), T.troll, { rw: 1 });
    F.blob(line(41, sy + 4, 41, 40, 3), T.wood, { rw: 1 }); skull(41, sy + 2, atk >= 0);
    // 머리: 크고 긴 코, 위로 솟은 엄니, 모히칸, 큰 귀
    F.blob(union(ell(24, 11 + by, 10, 8), tri(13, 9 + by, 8, 5 + by, 14, 13 + by), tri(35, 9 + by, 40, 5 + by, 34, 13 + by)), T.troll, { rw: 3 });
    F.blob(tri(17, 6 + by, 24, -5 + by, 31, 6 + by), T.hair, { rw: 2 }); F.px(23, -1 + by, T.hair[2]);
    if (front) {
      F.blob(box(22, 12 + by, 4, 6), T.troll, { rw: 1 });
      tusk(F, 18, 15 + by); tusk(F, 30, 15 + by); F.dot(19, 16 + by, 10, 1, T.troll[0]);
      eye(F, 18, 8 + by, 3, 3, '#ffe066', '#c0801a'); eye(F, 27, 8 + by, 3, 3, '#ffe066', '#c0801a');
      F.dot(17, 10 + by, 1, 3, '#e8e2d0'); F.dot(30, 10 + by, 1, 3, '#e8e2d0'); // 하얀 전투 문양
      F.dot(21, 6 + by, 6, 1, '#2e2230');
    } else { F.dot(20, 9 + by, 8, 1, T.troll[0]); }
  }));

  // ====================================================================
  // 9. 망령 (32×32, 반투명, 떠 있음)
  // ====================================================================
  // 망령: 큰 두건(어두운 얼굴 구멍 + 빛나는 눈) + 찢어진 로브(디더 밑단) + 뼈 손. 발 없이 떠 있고 바닥엔 그림자만.
  MonsterSprites.register('wraith', build(32, 32, { x: 16, y: 30 }, (F, dir, f, atk) => {
    const hov = atk >= 0 ? -1 : [0, -1, -2, -1][f];
    const cx = 16, hy = 8 + hov, ry = 17 + hov;
    const robe = T.wraith, hood = ['#1f1a38', '#3b3264', '#6a5e9c'], hand = T.wraithHand;
    F.shadow(cx, 29, 7 + hov, 2, 'rgba(0,0,0,0.18)');
    // 로브: 둥근 몸통 + 아래로 좁아지는 자락, 옆에선 뒤로 흘러가는 자락
    const skirt = dir === 'right' ? tri(cx - 9, ry, cx + 7, ry, cx - 2 + [0, 1, 0, -1][f], ry + 12) : tri(cx - 9, ry, cx + 9, ry, cx, ry + 12);
    F.blob(union(ell(cx, ry, 9, 6), skirt), robe, { rw: 2 });
    // 찢어진 자락: 세로 틈 + 체커 디더
    for (let i = 0; i < 4; i++) F.b.clearRect(cx - 6 + i * 4 + (f & 1), ry + 6 + (i % 2) * 2, 1, 8);
    F.dither(cx - 10, cx + 10, ry + 7, ry + 13);
    // 소매+손: 앞으로 내밀거나(공격) 옆으로 늘어뜨림
    const hyy = atk >= 0 ? hy + 3 : ry + 1, spread = atk >= 0 ? 9 : 10;
    if (dir !== 'up') for (const sg of [-1, 1]) {
      if (dir === 'right' && sg < 0) continue;
      const hx = cx + sg * spread;
      F.blob(line(cx + sg * 5, ry - 2, hx, hyy - 1, 3), robe, { rw: 1 });
      F.blob(union(ell(hx, hyy + 1, 2, 2), line(hx, hyy + 1, hx + sg, hyy + 4, 1), line(hx - sg, hyy + 1, hx - sg * 2, hyy + 4, 1)), hand, { rw: 1 });
    }
    if (atk >= 0) { const bc = atk === 0 ? '#9b5cff' : '#5a2d9b'; for (let i = 0; i < 5; i++) F.px(cx - 6 + i * 3, hyy - 4 - (i % 2) * 2, bc); F.dot(cx - 1, hyy - 7 + atk * 2, 2, 2, '#e0c8ff'); F.px(cx - 1, hyy - 7 + atk * 2, W); }
    // 두건: 큰 원 + 뒤로 흐르는 꼬리, 얼굴은 검은 구멍 + 빛나는 눈
    const tail = dir === 'right' ? tri(cx - 5, hy - 4, cx - 11, hy + 2, cx - 4, hy + 5) : tri(cx - 7, hy - 2, cx + 7, hy - 2, cx, hy + 9);
    F.blob(union(ell(cx, hy, 7, 7), tail), hood, { rw: 2 });
    if (dir === 'down') {
      F.flat(ell(cx, hy + 1, 5, 4), '#15101f', '#15101f');
      glowEye(F, cx - 4, hy, 3, 3, '#7ff0ff', W); glowEye(F, cx + 2, hy, 3, 3, '#7ff0ff', W);
      F.px(cx - 4, hy + 3, '#3fb8d8'); F.px(cx + 4, hy + 3, '#3fb8d8');
    } else if (dir === 'right') {
      F.flat(ell(cx + 3, hy + 1, 4, 4), '#15101f', '#15101f');
      glowEye(F, cx + 3, hy, 3, 3, '#7ff0ff', W);
    } else F.dot(cx - 3, hy - 3, 6, 1, hood[2]);
    // 떠다니는 기운
    const r = Pixel.rng(f + 11); for (let i = 0; i < 5; i++) F.px(cx - 11 + Math.floor(r() * 22), hy + 6 + Math.floor(r() * 18), i % 2 ? '#9b8ad0' : '#7ff0ff');
  }, { alpha: 0.86 }));

  // ====================================================================
  // 10. 해골 기사 (48×48)
  // ====================================================================
  const BLADE = ['#8b919f', '#c9cfd8', '#f0f3f7'];
  MonsterSprites.register('skeleton_knight', build(48, 48, { x: 24, y: 45 }, (F, dir, f, atk) => {
    const { bob, step } = walk(f); const by = bob;
    F.shadow(24, 44, 13, 4);
    const EYE = ['#7cf2b0', '#e8fff4'];
    if (dir === 'right') {
      F.blob(union(rbox(16 + step * 3, 31, 8, 10), rbox(15 + step * 3, 39, 10, 6)), T.armor); F.blob(union(rbox(25 - step * 3, 31, 8, 10), rbox(24 - step * 3, 39, 10, 6)), T.armor);
      F.blob(rbox(15, 27 + by, 18, 6), T.armor, { rw: 2 });
      F.blob(rbox(16, 15 + by, 16, 13), T.armor, { rw: 3 });
      F.blob(ell(22, 15 + by, 6, 5), T.armor, { rw: 2 });
      F.blob(ell(26, 8 + by, 7, 6), T.bone, { rw: 2 });
      F.blob(union(rbox(18, 2 + by, 16, 7), box(30, 8 + by, 4, 3)), T.armor, { rw: 2 }); F.dot(26, 7 + by, 6, 1, T.bone[1]); glowEye(F, 29, 7 + by, 3, 2, EYE[0], EYE[1]); F.dot(24, 2 + by, 4, 2, '#b3302a'); F.px(25, 1 + by, '#d94a4a');
      F.dot(26, 12 + by, 6, 1, T.bone[0]); F.px(27, 13 + by, O); F.px(29, 13 + by, O);
      const sy = atk >= 0 ? (atk === 0 ? 0 : 24) : 8, sx = atk === 1 ? 40 : 35;
      F.blob(line(30, 18 + by, 34, 22 + by, 4), T.armor, { rw: 1 });
      if (atk === 1) F.blob(line(36, 24, 46, 30, 3), BLADE, { rw: 1 }); else F.blob(line(sx, sy, sx, sy + 16, 3), BLADE, { rw: 1 });
      F.blob(box(sx - 3, atk === 1 ? 23 : sy + 15, 7, 2), T.gold, { rw: 1 });
      return;
    }
    const front = dir === 'down';
    // 다리 갑옷
    F.blob(union(rbox(12, 31 - (step > 0 ? 1 : 0), 9, 9), rbox(11, 39, 11, 6)), T.armor); F.blob(union(rbox(27, 31 - (step < 0 ? 1 : 0), 9, 9), rbox(26, 39, 11, 6)), T.armor);
    F.dot(14, 34, 5, 1, T.armor[0]); F.dot(29, 34, 5, 1, T.armor[0]);
    // 허리 갑옷 + 흉갑 + 견갑
    F.blob(rbox(12, 27 + by, 24, 6), T.armor, { rw: 2 }); F.dot(17, 28 + by, 1, 4, T.armor[0]); F.dot(23, 28 + by, 1, 4, T.armor[0]); F.dot(29, 28 + by, 1, 4, T.armor[0]);
    F.blob(rbox(14, 15 + by, 20, 13), T.armor, { rw: 3 });
    if (front) { F.dot(21, 18 + by, 6, 1, T.gold[1]); F.dot(23, 17 + by, 2, 6, T.gold[1]); F.dot(23, 20 + by, 2, 1, T.gold[2]); }
    else { F.dot(19, 19 + by, 10, 1, T.armor[0]); F.dot(23, 17 + by, 2, 8, T.armor[0]); }
    F.blob(union(ell(10, 16 + by, 6, 5), tri(6, 14 + by, 7, 8 + by, 11, 13 + by)), T.armor, { rw: 2 }); F.blob(union(ell(38, 16 + by, 6, 5), tri(42, 14 + by, 41, 8 + by, 37, 13 + by)), T.armor, { rw: 2 });
    // 팔 + 방패(왼) + 검(오른)
    F.blob(line(8, 19 + by, 6, 26 + by, 4), T.armor, { rw: 1 });
    F.blob(union(rbox(1, 19 + by, 11, 12), tri(1, 30 + by, 12, 30 + by, 6, 35 + by)), T.shield, { rw: 2 }); F.dot(5, 23 + by, 3, 1, T.gold[1]); F.dot(6, 22 + by, 1, 5, T.gold[1]);
    const sy = atk >= 0 ? (atk === 0 ? -2 : 20) : 6;
    if (atk === 1) { F.blob(line(40, 20 + by, 44, 25 + by, 4), T.armor, { rw: 1 }); F.blob(line(44, 26, 30, 44, 3), BLADE, { rw: 1 }); F.blob(box(41, 24, 7, 2), T.gold, { rw: 1 }); }
    else { F.blob(line(40, 19 + by, 43, sy + 18, 4), T.armor, { rw: 1 }); F.blob(line(43, sy, 43, sy + 18, 3), BLADE, { rw: 1 }); F.px(43, sy - 1, O); F.blob(box(40, sy + 17, 7, 2), T.gold, { rw: 1 }); F.blob(box(42, sy + 19, 3, 4), T.wood, { rw: 1 }); }
    // 두개골 + 투구
    F.blob(ell(24, 9 + by, 7, 6), T.bone, { rw: 2 });
    F.blob(union(rbox(16, 1 + by, 16, 8), box(16, 8 + by, 3, 5), box(29, 8 + by, 3, 5)), T.armor, { rw: 2 });
    if (front) {
      F.dot(18, 6 + by, 12, 1, T.armor[0]);
      glowEye(F, 20, 8 + by, 3, 2, EYE[0], EYE[1]); glowEye(F, 26, 8 + by, 3, 2, EYE[0], EYE[1]);
      F.px(24, 10 + by, T.bone[0]); F.dot(20, 12 + by, 8, 1, T.bone[0]); for (let i = 0; i < 4; i++) F.px(20 + i * 2, 12 + by, O);
    } else { F.dot(18, 5 + by, 12, 1, T.armor[0]); F.dot(22, 1 + by, 4, 1, '#b3302a'); }
    F.dot(22, 0 + by, 4, 2, '#b3302a'); F.px(23, -1 + by, '#d94a4a');
  }));

  // ====================================================================
  // 11. 새끼 용 (48×48) — 날개 펄럭임이 걷기 프레임
  // ====================================================================
  MonsterSprites.register('drake', build(48, 48, { x: 24, y: 45 }, (F, dir, f, atk) => {
    const flap = atk >= 0 ? -5 : [0, -5, 0, 4][f];
    const by = (f === 1 || f === 3) ? -1 : 0;
    F.shadow(24, 44, 12, 3);
    const wingVeins = (x0, y0, sgn) => { for (let i = 1; i <= 4; i++) F.bpx(x0 + sgn * i * 2, y0 + Math.round(i * (flap - 8) / 5), T.drakeWing[0]); };
    if (dir === 'right') {
      F.blob(union(tri(20, 24 + by, 6, 10 + flap + by, 8, 28 + flap / 2 + by), tri(20, 24 + by, 8, 28 + flap / 2 + by, 18, 32 + by)), T.drakeWing, { rw: 2 }); wingVeins(20, 24 + by, -1);
      F.blob(union(line(12, 31 + by, 3, 36 + by, 4), tri(5, 33, 0, 40, 7, 38)), T.drake, { rw: 1 });
      F.blob(union(rbox(16 + (f === 1 ? 2 : 0), 36, 6, 6), rbox(26 - (f === 3 ? 2 : 0), 36, 6, 6)), T.drake);
      F.blob(ell(22, 29 + by, 11, 8), T.drake, { rw: 3 }); F.blob(ell(24, 33 + by, 7, 4), T.drakeBelly, { rw: 2, col: T.drake[0] });
      F.blob(union(ell(32, 17 + by, 8, 7), rbox(34, 18 + by, 11, 6)), T.drake, { rw: 3 });
      F.blob(union(tri(28, 12 + by, 22, 4 + by, 31, 14 + by)), T.bone, { rw: 1 });
      eye(F, 34, 13 + by, 3, 3, '#ffb347', '#d2621c'); F.px(43, 20 + by, O);
      if (atk >= 0) { F.dot(36, 22 + by, 8, 2, '#5a1e2e'); F.blob(tri(44, 20 + by, 47, 16 + by, 47, 28 + by), T.ember, { rw: 1 }); }
      F.blob(union(tri(26, 26 + by, 36, 12 + flap / 2 + by, 34, 30 + by)), T.drakeWing, { rw: 2 });
      return;
    }
    const front = dir === 'down';
    // 날개
    const wl = union(tri(14, 22 + by, 2, 8 + flap + by, 5, 28 + (flap >> 1) + by), tri(14, 22 + by, 5, 28 + (flap >> 1) + by, 13, 32 + by));
    const wr = union(tri(34, 22 + by, 46, 8 + flap + by, 43, 28 + (flap >> 1) + by), tri(34, 22 + by, 43, 28 + (flap >> 1) + by, 35, 32 + by));
    F.blob(wl, T.drakeWing, { rw: 2 }); F.blob(wr, T.drakeWing, { rw: 2 }); wingVeins(14, 22 + by, -1); wingVeins(34, 22 + by, 1);
    // 꼬리
    F.blob(union(line(30, 33 + by, 40, 38 + by, 4), tri(38, 35, 46, 36 + (f % 2) * 2, 40, 41)), T.drake, { rw: 1 });
    // 다리
    F.blob(union(ell(17, 39, 5, 4)), T.drake); F.blob(union(ell(31, 39, 5, 4)), T.drake); F.px(14, 42, O); F.px(16, 43, O); F.px(32, 43, O); F.px(34, 42, O);
    // 몸통 + 배
    F.blob(ell(24, 29 + by, 10, 8), T.drake, { rw: 3 });
    if (front) { F.blob(ell(24, 32 + by, 6, 5), T.drakeBelly, { rw: 2, col: T.drake[0] }); F.dot(20, 31 + by, 8, 1, T.drakeBelly[0]); F.dot(20, 34 + by, 8, 1, T.drakeBelly[0]); }
    else { for (let i = 0; i < 4; i++) F.blob(tri(22, 23 + i * 3 + by, 24, 20 + i * 3 + by, 26, 23 + i * 3 + by), T.drake, { rw: 1 }); }
    // 머리
    F.blob(union(ell(24, 15 + by, 8, 7), rbox(18, 17 + by, 12, 6)), T.drake, { rw: 3 });
    F.blob(union(tri(19, 10 + by, 14, 2 + by, 22, 12 + by), tri(29, 10 + by, 34, 2 + by, 26, 12 + by)), T.bone, { rw: 1 });
    if (front) {
      eye(F, 18, 12 + by, 3, 3, '#ffb347', '#d2621c'); eye(F, 27, 12 + by, 3, 3, '#ffb347', '#d2621c'); F.px(19, 13 + by, O); F.px(28, 13 + by, O);
      F.px(22, 19 + by, O); F.px(26, 19 + by, O);
      if (atk >= 0) { F.dot(19, 21 + by, 10, 2, '#5a1e2e'); F.px(20, 21 + by, W); F.px(27, 21 + by, W); F.blob(union(tri(18, 23 + by, 30, 23 + by, 24, 36 + by + atk * 4)), T.ember, { rw: 2, col: T.ember[0] }); F.px(23, 27 + by, '#fff6c0'); }
      else F.dot(20, 21 + by, 8, 1, T.drake[0]);
    } else F.dot(21, 14 + by, 6, 1, T.drake[0]);
  }));

  // ====================================================================
  // 보스 (80×80, anchor 40,76)
  // ====================================================================
  // 12. 돌 골렘 군주
  MonsterSprites.register('boss_golem_lord', build(80, 80, { x: 40, y: 76 }, (F, dir, f, atk) => {
    const { bob, step } = walk(f); const by = bob;
    F.shadow(40, 75, 26, 6);
    const tones = T.stoneDk, dk = tones[0];
    const fistY = (s) => 42 + by + (atk >= 0 ? (atk === 0 ? -16 : 8) : s * 3);
    const emberCrack = (x, y, len, d) => { let cx = x, cy = y; for (let i = 0; i < len; i++) { F.bpx(cx, cy, T.ember[1]); if (i % 3 === 0) F.bpx(cx + 1, cy, T.ember[2]); cy++; if (i % 2) cx += d; if (i % 5 === 4) d = -d; } };
    if (dir === 'right') {
      F.blob(union(rbox(22 + step * 3, 54, 14, 16), ell(29 + step * 3, 71, 9, 4)), tones); F.blob(union(rbox(40 - step * 3, 54, 14, 16), ell(47 - step * 3, 71, 9, 4)), tones);
      F.blob(rbox(18, 34 + by, 12, 20), tones);
      F.blob(union(ell(40, 38 + by, 20, 18), rbox(22, 22 + by, 36, 30)), tones, { rw: 4 });
      emberCrack(36, 26 + by, 12, 1); emberCrack(48, 36 + by, 10, -1);
      F.blob(union(rbox(30, 8 + by, 22, 16), tri(30, 10 + by, 34, 0 + by, 38, 10 + by), tri(40, 9 + by, 44, -2 + by, 48, 9 + by)), tones, { rw: 3 });
      glowEye(F, 44, 14 + by, 4, 3, T.ember[1], T.ember[2]);
      F.blob(union(ell(56, 30 + by, 8, 7), ell(60, fistY(step) + 6, 10, 11)), tones, { rw: 3 });
      F.dot(56, fistY(step) + 8, 10, 1, dk); F.dot(58, fistY(step) + 12, 8, 1, dk);
      return;
    }
    const front = dir === 'down';
    F.blob(union(rbox(16, 54 - (step > 0 ? 1 : 0), 16, 16), ell(24, 71, 10, 4)), tones); F.blob(union(rbox(48, 54 - (step < 0 ? 1 : 0), 16, 16), ell(56, 71, 10, 4)), tones);
    F.dot(19, 60, 8, 1, dk); F.dot(52, 62, 8, 1, dk);
    F.blob(union(ell(40, 40 + by, 24, 18), rbox(18, 24 + by, 44, 28)), tones, { rw: 4 });
    F.blob(ell(14, 32 + by, 11, 9), tones, { rw: 3 }); F.blob(ell(66, 32 + by, 11, 9), tones, { rw: 3 }); F.blob(tri(8, 30 + by, 12, 18 + by, 18, 28 + by), tones, { rw: 2 }); F.blob(tri(72, 30 + by, 68, 18 + by, 62, 28 + by), tones, { rw: 2 });
    if (front) { emberCrack(28, 28 + by, 14, 1); emberCrack(50, 30 + by, 16, -1); emberCrack(38, 44 + by, 8, 1); F.blob(ell(40, 40 + by, 5, 4), T.ember, { rw: 2, col: T.ember[0] }); F.px(39, 39 + by, '#fff6c0'); F.dot(22, 50 + by, 10, 1, dk); F.dot(46, 53 + by, 12, 1, dk); }
    else { crack(F, 30, 27 + by, 16, dk); crack(F, 50, 26 + by, 14, dk, -1); F.dot(20, 46 + by, 14, 1, dk); F.dot(44, 50 + by, 16, 1, dk); emberCrack(40, 36 + by, 10, 1); }
    speckle(F, 21, 18, 26 + by, 44, 14, 14, '#6f8f4a');
    // 머리 + 바위 왕관
    F.blob(union(rbox(28, 8 + by, 24, 18), tri(28, 10 + by, 31, 0 + by, 35, 10 + by), tri(36, 9 + by, 40, -4 + by, 44, 9 + by), tri(45, 10 + by, 49, 0 + by, 52, 10 + by)), tones, { rw: 3 });
    if (front) { glowEye(F, 32, 14 + by, 5, 3, T.ember[1], T.ember[2]); glowEye(F, 43, 14 + by, 5, 3, T.ember[1], T.ember[2]); F.dot(34, 21 + by, 12, 1, dk); F.px(36, 22 + by, T.ember[1]); F.px(42, 22 + by, T.ember[1]); F.px(39, 2 + by, T.ember[2]); }
    else { F.dot(32, 14 + by, 16, 1, dk); crack(F, 40, 12 + by, 8, dk); }
    const fy = fistY(step), fy2 = fistY(-step);
    F.blob(union(ell(9, fy + 6, 9, 11), rbox(2, fy, 14, 10)), tones, { rw: 3 }); F.blob(union(ell(71, fy2 + 6, 9, 11), rbox(64, fy2, 14, 10)), tones, { rw: 3 });
    F.dot(4, fy + 9, 10, 1, dk); F.dot(66, fy2 + 9, 10, 1, dk); F.dot(6, fy + 13, 6, 1, dk); F.dot(68, fy2 + 13, 6, 1, dk);
    if (front) { emberCrack(8, fy + 2, 6, 1); emberCrack(72, fy2 + 2, 6, -1); }
    if (atk === 1) { for (let i = 0; i < 8; i++) { F.px(2 + i * 4, 72 + (i % 2), '#d8d2bb'); F.px(50 + i * 4, 72 + (i % 2), '#d8d2bb'); } }
  }));

  // 13. 나가 여사제 샤일라
  const PRIESTESS = ['#2b5a78', '#3f8bb3', '#86cde6'], PBELLY = ['#8ab0b8', '#cfe8ea', '#f0fbfb'], PEARL = ['#c0a0c8', '#f0d8f8', '#ffffff'];
  MonsterSprites.register('boss_naga_priestess', build(80, 80, { x: 40, y: 76 }, (F, dir, f, atk) => {
    const { bob } = walk(f); const sw = [0, 3, 0, -3][f];
    F.shadow(40, 75, 28, 6);
    const hy = 20 + bob;
    const orb = (ox, oy, glow) => { F.blob(ell(ox, oy, 6, 6), PEARL, { rw: 3, col: '#7a5a88' }); F.dot(ox - 3, oy - 3, 2, 2, W); if (glow) for (const [dx, dy] of [[-9, -4], [9, -5], [0, -9], [-7, 6], [8, 6], [-11, 2], [11, 1]]) F.px(ox + dx, oy + dy, '#ffd0f0'); };
    const fin = (x, y, sgn) => { F.blob(union(tri(x, y, x + sgn * 12, y - 12, x + sgn * 2, y + 8), tri(x, y + 4, x + sgn * 14, y + 2, x + sgn * 2, y + 10)), PRIESTESS, { rw: 2 }); F.dot(x + sgn * 4, y - 4, sgn > 0 ? 6 : 1, 1, PRIESTESS[0]); for (let i = 1; i < 5; i++) F.bpx(x + sgn * i * 2, y - i * 2 + 2, PRIESTESS[0]); };
    if (dir === 'right') {
      F.blob(union(ell(34, 64, 24, 9), ell(22, 56 + sw / 2 | 0, 12, 6), line(52, 60, 66, 50, 9), tri(60, 52, 74 + sw, 34 + sw, 70, 54)), PRIESTESS, { rw: 3 });
      for (let i = 0; i < 10; i++) F.bpx(14 + i * 4, 64 + (i % 2), PRIESTESS[0]);
      F.blob(union(rbox(30, 36 + bob, 20, 20), ell(40, 54 + bob, 11, 7)), PRIESTESS, { rw: 3 });
      F.blob(rbox(30, 36 + bob, 20, 14), T.robe, { rw: 3 }); F.dot(33, 40 + bob, 14, 1, T.gold[1]);
      F.blob(union(ell(44, hy, 11, 10)), PRIESTESS, { rw: 3 });
      fin(34, hy - 2, -1);
      F.flat(box(54, hy + 1, 4, 3), PRIESTESS[1]); eye(F, 48, hy - 3, 3, 5, '#ffd0f0', '#b04fa0'); F.px(49, hy - 1, O); F.px(56, hy + 4, O);
      F.blob(union(tri(34, hy - 8, 44, -2 + bob, 54, hy - 8), box(34, hy - 9, 22, 4)), T.gold, { rw: 2 }); F.px(44, 1 + bob, W); F.dot(43, hy - 8, 3, 2, '#e44a8a');
      const sx = 62, sy = atk >= 0 ? 4 : 10;
      F.blob(line(48, 42 + bob, 58, 34 + bob, 5), PRIESTESS, { rw: 1 });
      F.blob(line(sx, sy + 6, sx, 62, 4), T.gold, { rw: 1 }); orb(sx, sy + 2, atk >= 0);
      return;
    }
    const front = dir === 'down';
    // 똬리(2단) + 꼬리
    F.blob(union(ell(40, 66, 26, 9), ell(30 + sw, 58, 14, 6), line(60, 62, 70, 50, 9), tri(64, 54, 76 + sw, 34 + sw, 74, 56)), PRIESTESS, { rw: 3 });
    for (let i = 0; i < 12; i++) { F.bpx(16 + i * 4, 66 + (i % 2), PRIESTESS[0]); F.bpx(18 + i * 4, 69 + (i % 2), PRIESTESS[0]); }
    if (front) { F.dot(26, 64, 26, 1, PBELLY[1]); F.dot(28, 68, 22, 1, PBELLY[1]); F.dot(32, 72, 14, 1, PBELLY[1]); }
    // 상체 + 로브 + 띠
    F.blob(union(rbox(29, 34 + bob, 22, 20), ell(40, 52 + bob, 14, 7)), PRIESTESS, { rw: 3 });
    F.blob(rbox(28, 34 + bob, 24, 15), T.robe, { rw: 3 }); F.dot(31, 37 + bob, 18, 1, T.gold[1]); F.dot(39, 37 + bob, 2, 12, T.gold[1]); F.dot(33, 47 + bob, 14, 1, T.gold[1]);
    if (front) { F.dot(36, 41 + bob, 8, 1, '#e44a8a'); F.px(39, 40 + bob, '#ffd0f0'); }
    // 팔: 왼손 들림, 오른손 지팡이
    const sx = 64, sy = atk >= 0 ? 2 : 8;
    F.blob(union(line(29, 40 + bob, 18, atk >= 0 ? 24 + bob : 46 + bob, 5), ell(17, atk >= 0 ? 23 + bob : 47 + bob, 3, 3)), PRIESTESS, { rw: 1 });
    F.blob(union(line(51, 40 + bob, 60, 32 + bob, 5), ell(61, 32 + bob, 3, 3)), PRIESTESS, { rw: 1 });
    F.blob(line(sx, sy + 6, sx, 64, 4), T.gold, { rw: 1 }); orb(sx, sy + 2, atk >= 0);
    if (atk >= 0) { for (let i = 0; i < 4; i++) F.px(12 + (i % 2) * 6, 16 + i * 3 + bob, i % 2 ? '#e48ad0' : '#ffd0f0'); }
    // 머리 + 지느러미 + 머리장식
    F.blob(ell(40, hy, 12, 11), PRIESTESS, { rw: 3 });
    fin(29, hy - 2, -1); fin(51, hy - 2, 1);
    if (front) {
      eye(F, 32, hy - 4, 5, 6, '#ffd0f0', '#b04fa0'); eye(F, 43, hy - 4, 5, 6, '#ffd0f0', '#b04fa0'); F.dot(34, hy - 2, 1, 3, O); F.dot(45, hy - 2, 1, 3, O);
      F.dot(37, hy + 5, 6, 1, PRIESTESS[0]); F.px(36, hy + 4, PRIESTESS[0]); F.px(43, hy + 4, PRIESTESS[0]);
      F.px(33, hy + 3, '#d87090'); F.px(46, hy + 3, '#d87090');
    } else { F.dot(34, hy - 4, 12, 1, PRIESTESS[0]); F.dot(36, hy + 1, 8, 1, PRIESTESS[0]); }
    F.blob(union(tri(34, hy - 9, 40, hy - 20, 46, hy - 9), tri(27, hy - 8, 31, hy - 15, 35, hy - 9), tri(53, hy - 8, 49, hy - 15, 45, hy - 9), box(27, hy - 10, 26, 4)), T.gold, { rw: 2 });
    F.px(40, hy - 17, W); F.dot(38, hy - 10, 4, 3, '#e44a8a'); F.px(38, hy - 10, '#ffd0f0'); F.px(31, hy - 12, W); F.px(49, hy - 12, W);
    F.dot(27, hy + 1, 2, 4, T.gold[1]); F.dot(51, hy + 1, 2, 4, T.gold[1]);
  }));

  // 14. 오크 대족장 가르돈
  MonsterSprites.register('boss_orc_warchief', build(80, 80, { x: 40, y: 76 }, (F, dir, f, atk) => {
    const { bob, step } = walk(f); const by = bob;
    F.shadow(40, 75, 26, 6);
    const WOLF = ['#5a5550', '#8a847c', '#b8b2a8'], SKIN = ['#355d26', '#55893a', '#86bd60'];
    const axe = (ax, ay, horizontal) => {
      if (horizontal) { F.blob(line(ax - 22, ay, ax, ay, 4), T.wood, { rw: 1 }); F.blob(union(tri(ax - 24, ay - 3, ax - 34, ay - 10, ax - 34, ay + 10), tri(ax - 24, ay - 3, ax - 34, ay + 10, ax - 24, ay + 3)), T.iron, { rw: 2 }); F.px(ax - 31, ay - 6, W); return; }
      F.blob(line(ax, ay - 4, ax, ay + 44, 4), T.wood, { rw: 1 });
      F.blob(union(tri(ax + 2, ay - 10, ax + 16, ay - 4, ax + 16, ay + 14), tri(ax + 2, ay - 10, ax + 16, ay + 14, ax + 2, ay + 18), tri(ax - 2, ay - 10, ax - 16, ay - 4, ax - 16, ay + 14), tri(ax - 2, ay - 10, ax - 16, ay + 14, ax - 2, ay + 18)), T.iron, { rw: 3 });
      F.px(ax - 11, ay - 2, W); F.px(ax + 11, ay - 2, W); F.dot(ax - 1, ay - 12, 2, 6, T.bone[1]); F.px(ax - 1, ay - 13, O); F.px(ax, ay - 13, O);
    };
    if (dir === 'right') {
      F.blob(union(rbox(26 + step * 4, 50, 12, 14), rbox(24 + step * 4, 62, 16, 12)), BOOT); F.blob(union(rbox(40 - step * 4, 50, 12, 14), rbox(38 - step * 4, 62, 16, 12)), BOOT);
      F.blob(union(ell(30, 36 + by, 14, 16)), WOLF, { rw: 3 });  // 등 뒤 늑대 망토
      F.blob(rbox(24, 44 + by, 30, 9), T.fur, { rw: 2 });
      F.blob(ell(40, 34 + by, 16, 14), SKIN, { rw: 4 });
      F.blob(rbox(30, 26 + by, 22, 16), T.iron, { rw: 3 });
      F.blob(union(ell(42, 14 + by, 12, 10), rbox(34, 18 + by, 20, 8)), SKIN, { rw: 3 });
      tusk(F, 50, 19 + by); tusk(F, 46, 20 + by); eye(F, 48, 9 + by, 3, 3, '#ff6a4a', '#b32a2a'); F.dot(46, 7 + by, 6, 1, '#2e2230');
      F.dot(50, 12 + by, 4, 1, '#b3302a');
      F.blob(union(ell(40, 6 + by, 14, 8), tri(30, 6 + by, 33, -3 + by, 38, 4 + by), rbox(44, 4 + by, 14, 7)), WOLF, { rw: 3 }); F.px(55, 6 + by, O); F.dot(46, 6 + by, 2, 2, '#ffd84a');
      const ax = atk >= 0 ? (atk === 0 ? 50 : 66) : 60, ay = atk >= 0 ? (atk === 0 ? -2 : 44) : 12;
      F.blob(union(line(52, 32 + by, ax, ay + 20, 6), ell(ax, ay + 20, 5, 4)), SKIN, { rw: 2 });
      if (atk === 1) axe(70, 44, true); else axe(ax, ay, false);
      return;
    }
    const front = dir === 'down';
    F.blob(union(rbox(18, 50 - (step > 0 ? 1 : 0), 14, 14), rbox(16, 62, 18, 12)), BOOT); F.blob(union(rbox(48, 50 - (step < 0 ? 1 : 0), 14, 14), rbox(46, 62, 18, 12)), BOOT);
    F.dot(19, 64, 12, 1, BOOT[0]); F.dot(49, 64, 12, 1, BOOT[0]);
    // 늑대 가죽 망토(뒤) + 허리 가죽
    F.blob(union(ell(40, 36 + by, 26, 18), rbox(14, 30 + by, 52, 24)), WOLF, { rw: 3 });
    if (!front) { F.dot(20, 40 + by, 40, 1, WOLF[0]); F.dot(24, 48 + by, 32, 1, WOLF[0]); for (let i = 0; i < 6; i++) F.blob(tri(16 + i * 9, 52 + by, 20 + i * 9, 60 + by, 24 + i * 9, 52 + by), WOLF, { rw: 1 }); }
    F.blob(rbox(18, 44 + by, 44, 9), T.fur, { rw: 2 }); for (let i = 0; i < 4; i++) F.dot(22 + i * 10, 46 + by, 3, 3, T.bone[1]);
    // 몸통 + 흉갑 + 가시 견갑
    F.blob(ell(40, 32 + by, 20, 15), SKIN, { rw: 4 });
    F.blob(rbox(24, 24 + by, 32, 18), T.iron, { rw: 3 }); if (front) { F.dot(39, 26 + by, 2, 14, T.iron[0]); F.dot(29, 30 + by, 6, 1, T.iron[2]); F.dot(45, 30 + by, 6, 1, T.iron[2]); F.blob(ell(40, 24 + by, 4, 3), T.bone, { rw: 1 }); }
    F.blob(union(ell(18, 22 + by, 10, 7), tri(10, 20 + by, 10, 8 + by, 18, 16 + by), tri(18, 16 + by, 22, 6 + by, 26, 17 + by)), T.iron, { rw: 3 });
    F.blob(union(ell(62, 22 + by, 10, 7), tri(70, 20 + by, 70, 8 + by, 62, 16 + by), tri(62, 16 + by, 58, 6 + by, 54, 17 + by)), T.iron, { rw: 3 });
    // 팔
    const ly = 48 + by + step * 2;
    F.blob(union(line(14, 28 + by, 8, ly, 6), ell(8, ly + 2, 5, 4)), SKIN, { rw: 2 }); F.dot(5, ly + 4, 2, 1, O);
    const ax = 70, ay = atk >= 0 ? (atk === 0 ? 0 : 30) : 16;
    if (atk === 1) { F.blob(union(line(66, 28 + by, 54, 48, 6), ell(54, 49, 5, 4)), SKIN, { rw: 2 }); F.blob(line(56, 44, 36, 66, 4), T.wood, { rw: 1 }); F.blob(union(tri(38, 62, 28, 72, 44, 76), tri(38, 62, 44, 76, 48, 66)), T.iron, { rw: 3 }); F.px(33, 69, W); }
    else { F.blob(union(line(66, 28 + by, ax, ay + 24 - step * 2, 6), ell(ax, ay + 26 - step * 2, 5, 4)), SKIN, { rw: 2 }); axe(ax, ay, false); }
    // 머리: 큰 턱, 엄니, 붉은 문양, 늑대 머리 후드
    F.blob(union(ell(40, 14 + by, 13, 10), rbox(28, 17 + by, 24, 7)), SKIN, { rw: 3 });
    if (front) {
      tusk(F, 32, 19 + by); tusk(F, 47, 19 + by); F.px(32, 17 + by, '#f4efe0'); F.px(47, 17 + by, '#f4efe0'); F.dot(35, 20 + by, 10, 1, SKIN[0]);
      eye(F, 32, 10 + by, 4, 3, '#ff6a4a', '#b32a2a', false); eye(F, 44, 10 + by, 4, 3, '#ff6a4a', '#b32a2a', false);
      F.dot(31, 9 + by, 6, 1, '#2e2230'); F.dot(43, 9 + by, 6, 1, '#2e2230'); F.dot(39, 12 + by, 2, 3, SKIN[0]);
      F.dot(29, 13 + by, 1, 5, '#b3302a'); F.dot(50, 13 + by, 1, 5, '#b3302a'); F.dot(36, 7 + by, 1, 2, '#b3302a'); F.dot(43, 7 + by, 1, 2, '#b3302a');
      F.px(40, 21 + by, '#f4efe0');
    } else F.dot(34, 14 + by, 12, 1, SKIN[0]);
    F.blob(union(ell(40, 4 + by, 15, 7), rbox(34, 4 + by, 12, 7), tri(27, 4 + by, 27, -6 + by, 34, 1 + by), tri(53, 4 + by, 53, -6 + by, 46, 1 + by)), WOLF, { rw: 3 });
    if (front) { F.dot(33, 2 + by, 3, 2, '#ffd84a'); F.px(33, 2 + by, W); F.dot(45, 2 + by, 3, 2, '#ffd84a'); F.px(45, 2 + by, W); F.dot(38, 8 + by, 4, 2, '#2e2230'); F.px(36, 10 + by, '#f4efe0'); F.px(43, 10 + by, '#f4efe0'); F.px(39, 10 + by, '#f4efe0'); F.px(29, -3 + by, '#e0a0a0'); F.px(51, -3 + by, '#e0a0a0'); }
  }));

  // 15. 망령 왕 아셀 — 옛 대사제: 해골 얼굴 + 왕관, 찢어진 흰 사제 로브(금 장식), 부러진 사제장 지팡이, 보라 기운
  const KROBE = ['#8a8690', '#cfcbd4', '#f3f1f6'], KHOOD = ['#3a2f64', '#5c4e96', '#8c7fc4'], KHAND = ['#8a86a0', '#c8c4dc', '#f0eef8'];
  MonsterSprites.register('boss_wraith_king', build(80, 80, { x: 40, y: 76 }, (F, dir, f, atk) => {
    const h = atk >= 0 ? -2 : [0, -2, -4, -2][f];
    const front = dir === 'down', side = dir === 'right';
    F.shadow(40, 75, 18 + h, 3, 'rgba(0,0,0,0.16)');
    // 지팡이(몸 뒤): 부러진 사제장 — 윗부분 갈고리 일부만 남음
    const sx = side ? 58 : 66, sy = 6 + h;
    if (dir !== 'up') { F.blob(line(sx, sy + 2, sx, sy + 58, 4), T.gold, { rw: 1 }); F.blob(union(tri(sx - 9, sy - 2, sx - 1, sy - 10, sx + 2, sy), box(sx - 8, sy - 4, 10, 5)), T.gold, { rw: 1 }); F.px(sx - 7, sy - 6, O); F.px(sx - 3, sy - 8, O); F.dot(sx - 1, sy - 8, 2, 2, '#7ff0ff'); }
    // 뒤 망토(보라, 찢어짐)
    F.blob(union(ell(40, 36 + h, 19, 12), tri(21, 36 + h, 59, 36 + h, 40, 70 + h)), KHOOD, { rw: 3 });
    for (let i = 0; i < 7; i++) F.b.clearRect(23 + i * 5, 56 + h + (i % 2) * 4, 2, 14);
    // 로브(흰색) + 소매
    F.blob(union(ell(40, 38 + h, 14, 11), tri(26, 38 + h, 54, 38 + h, 40, 76 + h), rbox(30, 30 + h, 20, 30)), KROBE, { rw: 3 });
    F.blob(union(tri(27, 36 + h, 12, 56 + h, 33, 52 + h), tri(53, 36 + h, 68, 56 + h, 47, 52 + h)), KROBE, { rw: 2 });
    F.flat(union(tri(13, 54 + h, 20, 52 + h, 16, 58 + h)), KHOOD[0], KHOOD[0]); F.flat(union(tri(67, 54 + h, 60, 52 + h, 64, 58 + h)), KHOOD[0], KHOOD[0]);
    if (front) { F.dot(39, 30 + h, 2, 34, T.gold[1]); F.dot(33, 31 + h, 14, 1, T.gold[1]); F.dot(31, 47 + h, 18, 1, T.gold[1]); F.dot(36, 36 + h, 8, 1, '#e44a8a'); F.px(39, 35 + h, '#ffd0f0'); F.px(39, 37 + h, '#ffd0f0'); F.dot(30, 42 + h, 1, 12, T.gold[1]); F.dot(49, 42 + h, 1, 12, T.gold[1]); }
    else if (!side) { F.dot(32, 32 + h, 16, 1, T.gold[1]); F.dot(34, 50 + h, 12, 1, T.gold[1]); }
    else { F.dot(44, 32 + h, 2, 30, T.gold[1]); F.dot(32, 47 + h, 16, 1, T.gold[1]); }
    // 찢어진 밑단
    for (let i = 0; i < 7; i++) F.b.clearRect(28 + i * 4, 62 + h + (i % 3) * 3, 2, 14);
    F.dither(22, 58, 66 + h, 76 + h);
    // 손(뼈): 앞으로/위로
    const hy = atk >= 0 ? 30 + h : 54 + h, spread = atk >= 0 ? 24 : 26;
    if (dir !== 'up') { for (const sgn of [-1, 1]) { const hx = 40 + sgn * spread; F.blob(union(ell(hx, hy, 3, 3), line(hx, hy, hx + sgn * 2, hy + 5, 2), line(hx - sgn, hy, hx - sgn * 3, hy + 5, 2)), KHAND, { rw: 1 }); } }
    if (atk >= 0) { const bc = atk === 0 ? '#9b5cff' : '#5a2d9b'; for (let i = 0; i < 9; i++) F.px(24 + i * 4, hy - 6 - (i % 2) * 3, bc); F.dot(39, hy - 12, 2, 2, '#e0c8ff'); }
    // 머리: 뒤 두건 + 해골
    F.blob(ell(40, 18 + h, 13, 12), KHOOD, { rw: 3 });
    if (front) {
      F.blob(union(ell(40, 18 + h, 9, 9), rbox(34, 20 + h, 12, 8)), T.bone, { rw: 2 });
      F.flat(union(box(33, 15 + h, 5, 5), box(42, 15 + h, 5, 5)), '#15101f', '#15101f'); glowEye(F, 34, 16 + h, 3, 3, '#7ff0ff', W); glowEye(F, 43, 16 + h, 3, 3, '#7ff0ff', W);
      F.dot(39, 21 + h, 2, 2, T.bone[0]); F.dot(35, 25 + h, 10, 1, T.bone[0]); for (let i = 0; i < 5; i++) F.px(35 + i * 2, 25 + h, O);
      F.px(33, 23 + h, T.bone[0]); F.px(46, 23 + h, T.bone[0]);
    } else if (side) {
      F.blob(union(ell(42, 18 + h, 9, 9), rbox(40, 20 + h, 11, 8)), T.bone, { rw: 2 });
      F.flat(box(44, 15 + h, 5, 5), '#15101f', '#15101f'); glowEye(F, 45, 16 + h, 3, 3, '#7ff0ff', W); F.dot(44, 25 + h, 6, 1, T.bone[0]); F.px(45, 25 + h, O); F.px(47, 25 + h, O);
    }
    // 왕관
    F.blob(union(box(29, 7 + h, 22, 5), tri(29, 8 + h, 31, -1 + h, 34, 8 + h), tri(36, 7 + h, 40, -4 + h, 44, 7 + h), tri(46, 8 + h, 49, -1 + h, 51, 8 + h)), T.gold, { rw: 2 });
    F.px(39, -1 + h, '#7ff0ff'); F.px(32, 3 + h, '#e44a8a'); F.px(48, 3 + h, '#e44a8a'); F.dot(38, 9 + h, 4, 2, '#7ff0ff'); F.px(38, 9 + h, W);
    // 보라 기운
    const r = Pixel.rng(f + 31); for (let i = 0; i < 10; i++) F.px(18 + Math.floor(r() * 44), 10 + Math.floor(r() * 60) + h, i % 3 ? '#9b8ad0' : '#7ff0ff');
  }, { alpha: 0.9 }));

  // 16. 잿빛 드래곤 바르가 (96×96, anchor 48,90) — 날개 펼침
  MonsterSprites.register('boss_dragon', build(96, 96, { x: 48, y: 90 }, (F, dir, f, atk) => {
    const flap = atk >= 0 ? -8 : [0, -8, 0, 6][f];
    const by = (f === 1 || f === 3) ? -2 : 0;
    F.shadow(48, 89, 30, 6);
    const veins = (x0, y0, sgn, n) => { for (let i = 1; i <= n; i++) { const ex = x0 + sgn * i * 5, ey = y0 + Math.round(i * (flap - 14) / n); for (let k = 0; k < 6; k++) F.bpx(x0 + Math.round((ex - x0) * k / 6), y0 + Math.round((ey - y0) * k / 6), T.dragonWing[0]); } };
    const horns = (x, y, sgn) => F.blob(union(tri(x, y, x + sgn * 12, y - 16, x + sgn * 5, y + 3), tri(x + sgn * 2, y + 2, x + sgn * 8, y - 3, x + sgn * 4, y + 6)), T.bone, { rw: 2 });
    if (dir === 'right') {
      F.blob(union(tri(40, 46 + by, 10, 14 + flap + by, 8, 56 + (flap >> 1) + by), tri(40, 46 + by, 8, 56 + (flap >> 1) + by, 34, 66 + by)), T.dragonWing, { rw: 3 }); veins(40, 46 + by, -1, 4);
      F.blob(union(line(26, 66 + by, 6, 78 + by, 7), tri(8, 74, 0, 86, 14, 84)), T.dragon, { rw: 2 });
      F.blob(union(ell(32 + (f === 1 ? 3 : 0), 80, 9, 7)), T.dragon, { rw: 2 }); F.blob(union(ell(56 - (f === 3 ? 3 : 0), 80, 9, 7)), T.dragon, { rw: 2 });
      F.blob(ell(44, 60 + by, 22, 16), T.dragon, { rw: 4 }); F.blob(ell(48, 68 + by, 14, 8), T.dragonBelly, { rw: 3, col: T.dragon[0] });
      F.blob(rbox(52, 36 + by, 16, 22), T.dragon, { rw: 3 });
      F.blob(union(ell(68, 30 + by, 14, 12), rbox(70, 32 + by, 24, 12)), T.dragon, { rw: 4 });
      horns(60, 22 + by, -1);
      eye(F, 72, 24 + by, 4, 5, '#ffb347', '#d2621c'); F.px(73, 26 + by, O); F.px(91, 36 + by, O);
      for (let i = 0; i < 4; i++) F.px(78 + i * 4, 43 + by, '#f4efe0');
      if (atk >= 0) { F.dot(74, 44 + by, 18, 3, '#5a1e2e'); F.blob(tri(92, 40 + by, 95, 30 + by, 95, 58 + by), T.ember, { rw: 2, col: T.ember[0] }); }
      F.blob(union(tri(50, 50 + by, 70, 26 + (flap >> 1) + by, 66, 60 + by)), T.dragonWing, { rw: 3 });
      return;
    }
    const front = dir === 'down';
    // 날개(크게 펼침)
    const wl = union(tri(30, 44 + by, 2, 14 + flap + by, 4, 54 + (flap >> 1) + by), tri(30, 44 + by, 4, 54 + (flap >> 1) + by, 26, 64 + by), tri(30, 44 + by, 2, 14 + flap + by, 30, 30 + by));
    const wr = union(tri(66, 44 + by, 94, 14 + flap + by, 92, 54 + (flap >> 1) + by), tri(66, 44 + by, 92, 54 + (flap >> 1) + by, 70, 64 + by), tri(66, 44 + by, 94, 14 + flap + by, 66, 30 + by));
    F.blob(wl, T.dragonWing, { rw: 3 }); F.blob(wr, T.dragonWing, { rw: 3 }); veins(30, 44 + by, -1, 5); veins(66, 44 + by, 1, 5);
    F.px(3, 13 + flap + by, T.bone[2]); F.px(92, 13 + flap + by, T.bone[2]);
    // 꼬리
    F.blob(union(line(58, 68 + by, 80, 80 + by, 7), tri(76, 74, 94, 78 + (f % 2) * 3, 82, 88), tri(66, 70 + by, 70, 64 + by, 74, 72 + by)), T.dragon, { rw: 2 });
    // 다리
    F.blob(ell(32, 78, 10, 7), T.dragon, { rw: 2 }); F.blob(ell(64, 78, 10, 7), T.dragon, { rw: 2 });
    for (let i = 0; i < 3; i++) { F.px(26 + i * 4, 84, '#f4efe0'); F.px(58 + i * 4, 84, '#f4efe0'); F.px(26 + i * 4, 85, O); F.px(58 + i * 4, 85, O); }
    // 몸통 + 배 + 잉걸 균열
    F.blob(ell(48, 58 + by, 21, 17), T.dragon, { rw: 4 });
    if (front) { F.blob(ell(48, 63 + by, 13, 11), T.dragonBelly, { rw: 3, col: T.dragon[0] }); for (let i = 0; i < 4; i++) F.dot(38, 56 + i * 4 + by, 20, 1, T.dragonBelly[0]);
      for (const [x, y, l] of [[32, 48, 8], [62, 50, 7], [40, 70, 5]]) { for (let k = 0; k < l; k++) { F.bpx(x + (k % 2), y + k, T.ember[1]); if (k % 3 === 0) F.bpx(x + 1 + (k % 2), y + k, T.ember[2]); } } }
    else { for (let i = 0; i < 6; i++) F.blob(tri(45, 46 + i * 5 + by, 48, 41 + i * 5 + by, 51, 46 + i * 5 + by), T.dragon, { rw: 1 }); }
    // 목 + 머리 + 뿔 + 눈
    F.blob(rbox(40, 28 + by, 16, 20), T.dragon, { rw: 3 });
    F.blob(union(ell(48, 26 + by, 15, 12), rbox(36, 30 + by, 24, 10)), T.dragon, { rw: 4 });
    horns(38, 18 + by, -1); horns(58, 18 + by, 1);
    F.blob(union(tri(30, 30 + by, 24, 36 + by, 34, 36 + by), tri(66, 30 + by, 72, 36 + by, 62, 36 + by)), T.dragon, { rw: 1 });  // 볼 지느러미
    if (front) {
      eye(F, 38, 21 + by, 5, 5, '#ffb347', '#d2621c'); eye(F, 53, 21 + by, 5, 5, '#ffb347', '#d2621c'); F.dot(40, 22 + by, 1, 3, O); F.dot(55, 22 + by, 1, 3, O);
      F.dot(37, 19 + by, 7, 1, '#2e2230'); F.dot(52, 19 + by, 7, 1, '#2e2230');
      F.dot(44, 34 + by, 2, 1, O); F.dot(50, 34 + by, 2, 1, O);
      if (atk >= 0) { F.dot(37, 37 + by, 22, 4, '#5a1e2e'); for (let i = 0; i < 6; i++) F.px(38 + i * 4, 37 + by, '#f4efe0'); F.blob(tri(34, 41 + by, 62, 41 + by, 48, 62 + by + atk * 6), T.ember, { rw: 3, col: T.ember[0] }); F.dot(46, 46 + by, 4, 6, '#fff6c0'); }
      else { F.dot(38, 38 + by, 20, 1, T.dragon[0]); for (let i = 0; i < 5; i++) F.px(39 + i * 4, 38 + by, '#f4efe0'); }
    } else F.dot(40, 26 + by, 16, 1, T.dragon[0]);
  }));

  // 전역 노출(디버그용)
  window.CaveMonsterArt = { ell, box, rbox, tri, line, union, at, frame, build, shade, outlineInner, T };
})();
