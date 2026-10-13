// 숲 던전 타일셋 — DungeonTiles.registerBiome('forest', ...) 로 등록한다.
// 타일: 0 빽빽한 숲(오토타일: 이웃이 열린 쪽에 수관 가장자리·줄기·그늘), 1 잔디 바닥(흙 자국), 2 물(호수, 모래/돌 가장자리),
//       3 바닥 장식(꽃·버섯·돌·낙엽·풀 — 좌표 해시로 종류 선택), 4 덤불(둥근 관목).
// 규칙: 좌상단 광원, 외곽선 #3b2a2a, 재질당 3톤, 정수 좌표·fillRect·ImageData 만 사용(벡터 API 금지).
// 성능: 큰 면은 미리 만든 32×32 타일 캔버스를 drawImage 로 찍는다. 벽 타일은 (이웃 마스크, 격자 패리티, 변주) 키로 지연 생성·캐시.
(() => {
  if (typeof DungeonTiles === 'undefined') return;
  const T = 32, PER = 96, SUB = 3; // 타일 크기, 이음새 없는 반복 텍스처 주기(3×3 타일)
  const OUT = '#3b2a2a';
  // 잔디 3톤 + 흙
  const GRASS = { base: '#7db457', light: '#95c96a', dark: '#689c46', dark2: '#577f3b', tuft: '#4f7a37' };
  const DIRT = { base: '#ab9566', light: '#bba877', dark: '#8f7a52', edge: '#7a6646' };
  // 수관(숲 벽) 4톤 + 줄기·그늘
  const CAN = { deep: '#2c5a34', base: '#3a7140', mid: '#4a8a48', light: '#66a957', rim: '#86c86c', hole: '#234a2a' };
  const TRUNK = { light: '#9a6a44', mid: '#6f4a2c', dark: '#4a301c', ground: '#1f3320', ground2: '#2a4328' };
  // 물·모래
  const WATER = { deep: '#3a7ab5', base: '#4f9ad6', light: '#7fc1e6', foam: '#d8f3ff' };
  const SAND = { base: '#dcc48f', light: '#eedcac', dark: '#b39a66', stone: '#9a9a90', stoneL: '#c2c2b8', stoneD: '#6c6c64' };

  // ---------- 작은 헬퍼 ----------
  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  // 좌표 결정적 정수 해시 (타일 변주 선택용)
  function h2(a, b, salt = 0) { let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  const rngOf = (seed) => (typeof RNG !== 'undefined' ? RNG.make(seed) : { next: Pixel.rng(seed) }).next;
  // 반복 텍스처에 원을 찍되 주기 경계에서 이어지게 9방향 복제
  function wrapCircle(ctx, cx, cy, r, color) { for (let oy = -PER; oy <= PER; oy += PER) for (let ox = -PER; ox <= PER; ox += PER) Pixel.circle(ctx, cx + ox, cy + oy, r, color); }
  function wrapRect(ctx, x, y, w, h, color) { for (let oy = -PER; oy <= PER; oy += PER) for (let ox = -PER; ox <= PER; ox += PER) R(ctx, x + ox, y + oy, w, h, color); }

  // ---------- 반복 텍스처(64×64, ImageData) ----------
  function grassTexture() {
    const c = Pixel.make(PER, PER), ctx = c.getContext('2d'), rnd = rngOf(1101);
    R(ctx, 0, 0, PER, PER, GRASS.base);
    for (let k = 0; k < 160; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0; wrapRect(ctx, x, y, 1 + ((rnd() * 2) | 0), 1, rnd() < 0.55 ? GRASS.light : GRASS.dark); }
    for (let k = 0; k < 40; k++) { // 풀 결(작은 v 모양)
      const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0;
      wrapRect(ctx, x, y + 1, 1, 2, GRASS.tuft); wrapRect(ctx, x + 2, y, 1, 3, GRASS.tuft); wrapRect(ctx, x + 1, y + 2, 1, 1, GRASS.dark);
    }
    for (let k = 0; k < 32; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0; wrapRect(ctx, x, y, 2, 1, GRASS.dark2); }
    return ctx.getImageData(0, 0, PER, PER);
  }
  function canopyTexture() {
    const c = Pixel.make(PER, PER), ctx = c.getContext('2d'), rnd = rngOf(2202);
    R(ctx, 0, 0, PER, PER, CAN.deep);
    const pts = [];
    for (let k = 0; k < 30; k++) pts.push({ x: (rnd() * PER) | 0, y: (rnd() * PER) | 0, r: 5 + ((rnd() * 5) | 0) });
    pts.sort((a, b) => a.y - b.y);
    for (const p of pts) { // 둥근 잎 덩어리: 밑면 어두움 → 중간 → 좌상단 밝은 초승달
      wrapCircle(ctx, p.x + 1, p.y + 2, p.r, CAN.base);
      wrapCircle(ctx, p.x, p.y, p.r, CAN.mid);
      wrapCircle(ctx, p.x - 1, p.y - 1, p.r - 1, CAN.light);
      wrapCircle(ctx, p.x + 1, p.y + 1, p.r - 1, CAN.mid);
    }
    for (let k = 0; k < 90; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0; wrapRect(ctx, x, y, 1, 1, rnd() < 0.5 ? CAN.hole : CAN.rim); }
    for (let k = 0; k < 24; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0; wrapRect(ctx, x, y, 2, 1, CAN.hole); wrapRect(ctx, x + 1, y + 1, 1, 1, CAN.hole); }
    return ctx.getImageData(0, 0, PER, PER);
  }
  function waterTexture() {
    const c = Pixel.make(PER, PER), ctx = c.getContext('2d'), rnd = rngOf(3303);
    R(ctx, 0, 0, PER, PER, WATER.base);
    for (let k = 0; k < 50; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0, w = 3 + ((rnd() * 5) | 0); wrapRect(ctx, x, y, w, 1, WATER.deep); wrapRect(ctx, x + 1, y + 1, w - 1, 1, WATER.deep); }
    for (let k = 0; k < 36; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0, w = 3 + ((rnd() * 4) | 0); wrapRect(ctx, x, y, w, 1, WATER.light); wrapRect(ctx, x - 1, y + 1, 2, 1, WATER.light); }
    for (let k = 0; k < 14; k++) { const x = (rnd() * PER) | 0, y = (rnd() * PER) | 0; wrapRect(ctx, x, y, 2, 1, WATER.foam); wrapRect(ctx, x + 1, y - 1, 1, 1, WATER.foam); }
    return ctx.getImageData(0, 0, PER, PER);
  }
  const TEX = { grass: null, canopy: null, water: null };
  function tex() { if (!TEX.grass) { TEX.grass = grassTexture(); TEX.canopy = canopyTexture(); TEX.water = waterTexture(); } return TEX; }
  // 텍스처의 (패리티) 부분 타일을 캔버스로
  function subTile(img, parity) {
    const c = Pixel.make(T, T), ctx = c.getContext('2d');
    const out = ctx.createImageData(T, T), ox = (parity % SUB) * T, oy = ((parity / SUB) | 0) * T;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const s = ((y + oy) * PER + x + ox) * 4, d = (y * T + x) * 4; out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = 255; }
    ctx.putImageData(out, 0, 0); return c;
  }

  // ---------- 바닥 타일(패리티 4 × 변주 6) ----------
  const floorCache = [];
  function floorTile(parity, v) {
    const key = parity * 8 + v; // parity: 0..8 (3×3 격자 위치)
    if (floorCache[key]) return floorCache[key];
    const c = subTile(tex().grass, parity), ctx = c.getContext('2d'), rnd = rngOf(4000 + key);
    if (v === 1 || v === 2) { // 풀 뭉치 1~2개
      for (let k = 0; k < v; k++) { const x = 4 + ((rnd() * 22) | 0), y = 4 + ((rnd() * 22) | 0); R(ctx, x, y + 2, 1, 2, GRASS.tuft); R(ctx, x + 1, y, 1, 4, GRASS.dark2); R(ctx, x + 2, y + 1, 1, 3, GRASS.tuft); R(ctx, x + 3, y + 2, 1, 2, GRASS.dark2); R(ctx, x + 1, y + 1, 1, 1, GRASS.light); }
    } else if (v === 3) { // 흙 자국(길 느낌): 가로로 긴 타원 덩어리
      const cx = 10 + ((rnd() * 12) | 0), cy = 10 + ((rnd() * 12) | 0), rx = 7 + ((rnd() * 5) | 0), ry = 4 + ((rnd() * 3) | 0);
      Pixel.ellipse(ctx, cx, cy, rx, ry, DIRT.dark); Pixel.ellipse(ctx, cx + 3, cy + 1, rx - 3, ry - 1, DIRT.dark); Pixel.ellipse(ctx, cx - 3, cy - 1, rx - 4, ry - 1, DIRT.dark);
      Pixel.ellipse(ctx, cx, cy, rx - 1, ry - 1, DIRT.base); Pixel.ellipse(ctx, cx + 3, cy + 1, rx - 4, ry - 2, DIRT.base); Pixel.ellipse(ctx, cx - 3, cy - 1, rx - 5, Math.max(1, ry - 2), DIRT.base);
      for (let k = 0; k < 5; k++) R(ctx, cx - rx + 2 + ((rnd() * (rx * 2 - 3)) | 0), cy - 1 + ((rnd() * 3) | 0), 1 + ((rnd() * 2) | 0), 1, rnd() < 0.5 ? DIRT.light : DIRT.edge);
      for (let k = 0; k < 4; k++) R(ctx, cx - rx + ((rnd() * (rx * 2)) | 0), cy - ry + ((rnd() * (ry * 2)) | 0), 1, 1, GRASS.dark); // 가장자리에 풀이 섞임
    } else if (v === 4) { // 작은 돌 하나 + 클로버
      const x = 6 + ((rnd() * 18) | 0), y = 6 + ((rnd() * 18) | 0);
      R(ctx, x, y + 1, 4, 2, SAND.stoneD); R(ctx, x + 1, y, 2, 1, SAND.stoneD); R(ctx, x + 1, y + 1, 2, 1, SAND.stoneL); R(ctx, x + 3, y + 2, 1, 1, SAND.stoneD);
      const fx = (x + 12) % 26 + 2, fy = (y + 9) % 26 + 2; R(ctx, fx, fy, 1, 1, GRASS.light); R(ctx, fx + 2, fy, 1, 1, GRASS.light); R(ctx, fx + 1, fy + 1, 1, 1, GRASS.light); R(ctx, fx + 1, fy - 1, 1, 1, GRASS.light);
    } else if (v === 5) { // 낙엽 2장
      for (let k = 0; k < 2; k++) { const x = 3 + ((rnd() * 24) | 0), y = 3 + ((rnd() * 24) | 0), col = rnd() < 0.5 ? '#c98a3e' : '#b46a35'; R(ctx, x, y, 3, 2, col); R(ctx, x + 1, y - 1, 1, 1, col); R(ctx, x + 2, y + 1, 1, 1, Pixel.shade(col, -0.3)); }
    }
    floorCache[key] = c; return c;
  }
  const parityOf = (ti, tj) => (ti % SUB) + SUB * (tj % SUB);
  const floorFor = (ti, tj) => { const h = h2(ti, tj, 1) % 100; return floorTile(parityOf(ti, tj), h < 50 ? 0 : h < 62 ? 1 : h < 70 ? 2 : h < 82 ? 3 : h < 90 ? 4 : 5); };

  // ---------- 숲 벽 오토타일 ----------
  // 마스크 비트(열린 이웃): N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128
  const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;
  const wallCache = new Map();
  const scallop = (p, off) => { const t = (((p + off) % 14) - 6.5) / 7; return Math.round(4 * (1 - Math.sqrt(Math.max(0, 1 - t * t)))); };
  function wallTile(mask, parity, v) {
    const key = mask | (parity << 8) | (v << 12);
    if (wallCache.has(key)) return wallCache.get(key);
    const tx = tex(), c = Pixel.make(T, T), ctx = c.getContext('2d'), out = ctx.createImageData(T, T), d = out.data;
    const ox = (parity % SUB) * T, oy = ((parity / SUB) | 0) * T, so = v * 5, TR = 11; // TR: 줄기 구역 높이
    // 분류: 0 바닥, 1 수관, 2 줄기 구역(수관 아래 그늘진 땅)
    const cls = (x, y) => {
      let inside = true;
      if (mask & N) inside = inside && y >= 2 + scallop(x, so);
      if (mask & W) inside = inside && x >= 2 + scallop(y, so + 3);
      if (mask & E) inside = inside && x < T - 2 - scallop(y, so + 7);
      if (!inside) return 0;
      // 대각만 열린 모서리: 모따기
      if ((mask & NE) && !(mask & (N | E)) && (T - 1 - x) + y < 5) return 0;
      if ((mask & NW) && !(mask & (N | W)) && x + y < 5) return 0;
      if ((mask & SE) && !(mask & (S | E)) && (T - 1 - x) + (T - 1 - y) < 5) return 0;
      if ((mask & SW) && !(mask & (S | W)) && x + (T - 1 - y) < 5) return 0;
      // 볼록 모서리 둥글리기
      if ((mask & N) && (mask & E) && (T - 1 - x) + y < 9) return 0;
      if ((mask & N) && (mask & W) && x + y < 9) return 0;
      if (mask & S) {
        const by = T - TR + scallop(x, so + 11) - 1; // 수관 밑단
        if (y >= by) {
          if ((mask & W) && x + (T - 1 - y) < 8) return 0;
          if ((mask & E) && (T - 1 - x) + (T - 1 - y) < 8) return 0;
          return 2;
        }
      }
      return 1;
    };
    const grid = new Int8Array((T + 2) * (T + 2));
    const clampC = (v2) => (v2 < -1 ? -1 : v2 > T ? T : v2);
    const g = (x, y) => grid[(clampC(y) + 1) * (T + 2) + clampC(x) + 1];
    for (let y = -1; y <= T; y++) for (let x = -1; x <= T; x++) {
      let v2;
      if (x < 0 || x >= T || y < 0 || y >= T) { // 타일 밖: 그쪽 이웃이 닫혀 있으면 수관이 이어진다
        const open = (y < 0 && (mask & N)) || (y >= T && (mask & S)) || (x < 0 && (mask & W)) || (x >= T && (mask & E));
        v2 = open ? 0 : (y >= T && (mask & S) ? 2 : 1);
        if (y >= T && !(mask & S) && x >= 0 && x < T) v2 = 1;
      } else v2 = cls(x, y);
      grid[(y + 1) * (T + 2) + x + 1] = v2;
    }
    const put = (x, y, rgb) => { const i = (y * T + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; };
    const cOut = hex(OUT), cRim = hex(CAN.rim), cLight = hex(CAN.light), cDeep = hex(CAN.deep), cHole = hex(CAN.hole);
    const cG = hex(TRUNK.ground), cG2 = hex(TRUNK.ground2), cTL = hex(TRUNK.light), cTM = hex(TRUNK.mid), cTD = hex(TRUNK.dark);
    const trunks = [[4 + (v * 3) % 5, 9 + (v * 3) % 5], [19 + (v * 2) % 4, 24 + (v * 2) % 4]]; // 줄기 x 구간 [시작, 끝)
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const k = g(x, y);
      if (k === 0) { const s = ((y + oy) * PER + x + ox) * 4; put(x, y, [tx.grass.data[s], tx.grass.data[s + 1], tx.grass.data[s + 2]]); continue; }
      if (k === 2) { // 줄기 구역: 그늘진 땅 + 줄기(3톤) + 뿌리
        let col = ((x * 7 + y * 13 + v) % 11 === 0) ? cG2 : cG;
        for (const [a, b] of trunks) {
          const flare = y >= T - 3 ? 1 : 0; // 뿌리 벌어짐
          if (x >= a - flare && x < b + flare) {
            const rel = x - a;
            col = (x < a || x >= b) ? cTD : rel === 0 ? cTL : rel === 1 ? cTL : rel >= b - a - 2 ? cTD : cTM;
            if (x === a - flare || x === b + flare - 1) col = cOut;
            if (y === T - 1 && (x === a - 1 || x === b)) col = cOut;
            if ((y + x) % 9 === 0 && rel > 0 && rel < b - a - 1) col = cTD; // 껍질 결
            break;
          }
        }
        if (y === T - 1 && col === cG) col = ((x * 5) % 7 < 3) ? cG2 : cG;
        put(x, y, col); continue;
      }
      // 수관: 외곽선 → 좌상 림 라이트 → 우하 어두운 림 → 텍스처
      const up = g(x, y - 1), dn = g(x, y + 1), lf = g(x - 1, y), rt = g(x + 1, y);
      if (up !== 1 || dn !== 1 || lf !== 1 || rt !== 1) { put(x, y, cOut); continue; }
      const up2 = g(x, y - 2), lf2 = g(x - 1, y - 1), rt2 = g(x + 1, y + 1), dn2 = g(x, y + 2);
      if (up2 !== 1 || lf2 !== 1 || g(x - 2, y) !== 1) { put(x, y, ((x + y) % 3 === 0) ? cLight : cRim); continue; }
      if (dn2 !== 1 || rt2 !== 1 || g(x + 2, y) !== 1) { put(x, y, dn2 === 2 || rt2 === 2 ? cHole : cDeep); continue; }
      const s = ((y + oy) * PER + x + ox) * 4; put(x, y, [tx.canopy.data[s], tx.canopy.data[s + 1], tx.canopy.data[s + 2]]);
    }
    ctx.putImageData(out, 0, 0);
    wallCache.set(key, c); return c;
  }

  // ---------- 물 타일 (패리티 4 × 가장자리 마스크 16 × 변주 2) ----------
  const waterCache = new Map();
  function waterTile(parity, mask, v) {
    const key = parity | (mask << 4) | (v << 8); // v: bit0 돌 개수, bit1 수련잎, bit2 수련잎 2장
    if (waterCache.has(key)) return waterCache.get(key);
    const c = subTile(tex().water, parity), ctx = c.getContext('2d'), rnd = rngOf(5000 + key);
    // 모래 띠: 닫힌 쪽(물이 아닌 이웃)마다 4px + 들쭉날쭉 + 물가 어두운 선
    const band = (side) => {
      for (let p = 0; p < T; p += 2) {
        const w = 3 + ((h2(p, key, side) % 3)); // 3~5
        const dk = w; // 물 쪽 어두운 모래 1px
        if (side === N) { R(ctx, p, 0, 2, w, SAND.base); R(ctx, p, w, 2, 1, SAND.dark); R(ctx, p, 0, 2, 1, SAND.dark); R(ctx, p, 1, 2, 1, SAND.light); R(ctx, p, w + 1, 2, 1, WATER.deep); }
        if (side === S) { R(ctx, p, T - w, 2, w, SAND.base); R(ctx, p, T - w - 1, 2, 1, SAND.dark); R(ctx, p, T - 1, 2, 1, SAND.dark); R(ctx, p, T - w - 2, 2, 1, WATER.deep); }
        if (side === W) { R(ctx, 0, p, w, 2, SAND.base); R(ctx, w, p, 1, 2, SAND.dark); R(ctx, 0, p, 1, 2, SAND.dark); R(ctx, 1, p, 1, 2, SAND.light); R(ctx, w + 1, p, 1, 2, WATER.deep); }
        if (side === E) { R(ctx, T - w, p, w, 2, SAND.base); R(ctx, T - w - 1, p, 1, 2, SAND.dark); R(ctx, T - 1, p, 1, 2, SAND.dark); R(ctx, T - w - 2, p, 1, 2, WATER.deep); }
        void dk;
      }
    };
    if (mask & N) band(N); if (mask & S) band(S); if (mask & W) band(W); if (mask & E) band(E);
    // 모서리 채우기(두 변이 닫히면 모래 모서리)
    if ((mask & N) && (mask & W)) R(ctx, 0, 0, 5, 5, SAND.base); if ((mask & N) && (mask & E)) R(ctx, T - 5, 0, 5, 5, SAND.base);
    if ((mask & S) && (mask & W)) R(ctx, 0, T - 5, 5, 5, SAND.base); if ((mask & S) && (mask & E)) R(ctx, T - 5, T - 5, 5, 5, SAND.base);
    // 가장자리 돌 1~2개
    if (mask) for (let k = 0; k < 1 + (v & 1); k++) {
      let x, y; const side = (mask & N) ? N : (mask & S) ? S : (mask & W) ? W : E;
      if (side === N) { x = 2 + ((rnd() * 26) | 0); y = 1; } else if (side === S) { x = 2 + ((rnd() * 26) | 0); y = T - 4; } else if (side === W) { x = 1; y = 2 + ((rnd() * 26) | 0); } else { x = T - 5; y = 2 + ((rnd() * 26) | 0); }
      R(ctx, x, y, 4, 3, SAND.stone); R(ctx, x + 1, y - 1, 2, 1, SAND.stone); R(ctx, x, y, 2, 1, SAND.stoneL); R(ctx, x, y + 2, 4, 1, SAND.stoneD); R(ctx, x + 3, y + 1, 1, 1, SAND.stoneD);
    }
    if (!mask && (v & 2)) { // 호수 안쪽: 수련잎 1~2장
      const pts = v & 4 ? [[8, 9], [20, 19]] : [[16, 14]];
      for (const [x, y] of pts) { Pixel.ellipse(ctx, x, y, 5, 3, OUT); Pixel.ellipse(ctx, x, y, 4, 2, '#4f9a44'); R(ctx, x - 3, y - 1, 4, 1, '#79c062'); R(ctx, x + 1, y - 2, 3, 2, WATER.base); R(ctx, x + 1, y - 2, 1, 1, OUT); R(ctx, x + 3, y, 1, 1, OUT); R(ctx, x + 2, y - 3, 1, 1, '#f2a7c7'); R(ctx, x + 1, y - 4, 3, 1, '#f2a7c7'); R(ctx, x + 2, y - 4, 1, 1, '#fff0f6'); }
    }
    waterCache.set(key, c); return c;
  }

  // ---------- 장식 스프라이트 ----------
  const decoCache = [];
  function decoSprite(kind) {
    if (decoCache[kind]) return decoCache[kind];
    const c = Pixel.make(T, T), ctx = c.getContext('2d');
    if (kind === 0 || kind === 1 || kind === 2) { // 꽃 무리 (빨강/노랑/하양)
      const petal = ['#e85a5a', '#f2c94c', '#f4f0e6'][kind], petalD = ['#b63d3d', '#c99a2a', '#c9c2b4'][kind];
      const pts = [[8, 10], [20, 8], [14, 20], [24, 20]];
      for (const [x, y] of pts) { // 꽃 5×5(꽃잎 4장 + 중심) + 줄기·잎
        R(ctx, x + 2, y + 5, 1, 4, GRASS.tuft); R(ctx, x, y + 6, 2, 1, GRASS.dark2); R(ctx, x + 3, y + 7, 2, 1, GRASS.dark2);
        R(ctx, x + 1, y, 3, 5, petalD); R(ctx, x, y + 1, 5, 3, petalD);
        R(ctx, x + 1, y, 2, 2, petal); R(ctx, x, y + 1, 2, 2, petal); R(ctx, x + 3, y + 1, 1, 1, petal); R(ctx, x + 1, y + 3, 1, 1, petal);
        R(ctx, x + 2, y + 2, 1, 1, '#f7e38a'); R(ctx, x + 1, y + 1, 1, 1, '#fff6e0');
      }
    } else if (kind === 3) { // 빨간 버섯 2개
      const m = (x, y, s) => { R(ctx, x + 2, y + 5, 3 + s, 4, OUT); R(ctx, x + 3, y + 5, 1 + s, 3, '#f1e4c8'); R(ctx, x + 3 + s, y + 5, 1, 3, '#c9b58f'); R(ctx, x, y + 1, 7 + s, 4, OUT); R(ctx, x + 1, y, 5 + s, 1, OUT); R(ctx, x + 1, y + 1, 5 + s, 3, '#d9463f'); R(ctx, x + 2, y, 3 + s, 1, '#e9665a'); R(ctx, x + 1, y + 1, 2, 1, '#e9665a'); R(ctx, x + 1, y + 3, 5 + s, 1, '#a52f2c'); R(ctx, x + 2, y + 1, 1, 1, '#fff6e8'); R(ctx, x + 4 + s, y + 2, 1, 1, '#fff6e8'); };
      m(6, 12, 2); m(18, 18, 0);
    } else if (kind === 4) { // 작은 돌 무더기
      const s = (x, y, w, h) => { R(ctx, x, y, w, h, OUT); R(ctx, x + 1, y + 1, w - 2, h - 2, SAND.stone); R(ctx, x + 1, y + 1, w - 3, 1, SAND.stoneL); R(ctx, x + 1, y + h - 2, w - 2, 1, SAND.stoneD); R(ctx, x + w - 2, y + 2, 1, h - 3, SAND.stoneD); };
      s(6, 14, 10, 7); s(15, 10, 8, 6); s(18, 18, 7, 5);
    } else if (kind === 5) { // 낙엽 더미
      const cols = ['#d19a46', '#b86b33', '#c7823a', '#9c5a2c'];
      const pts = [[6, 8], [14, 6], [22, 10], [10, 16], [19, 18], [26, 20], [5, 23], [15, 25]];
      pts.forEach(([x, y], i) => { const col = cols[i % 4]; R(ctx, x, y, 3, 2, col); R(ctx, x + 1, y - 1, 1, 1, col); R(ctx, x + 3, y + 1, 1, 1, Pixel.shade(col, -0.35)); R(ctx, x + 1, y + 2, 1, 1, Pixel.shade(col, -0.35)); });
    } else if (kind === 6) { // 키 큰 풀
      const pts = [[6, 10], [16, 8], [24, 14], [11, 20]];
      for (const [x, y] of pts) { R(ctx, x, y + 3, 1, 5, GRASS.dark2); R(ctx, x + 1, y, 1, 8, GRASS.tuft); R(ctx, x + 2, y + 2, 1, 6, GRASS.dark2); R(ctx, x + 3, y + 4, 1, 4, GRASS.tuft); R(ctx, x + 1, y + 1, 1, 2, GRASS.light); R(ctx, x - 1, y + 5, 1, 3, GRASS.tuft); }
    } else { // 보라 버섯(어두운 숲 느낌) + 작은 꽃
      const m = (x, y) => { R(ctx, x + 2, y + 4, 3, 4, OUT); R(ctx, x + 3, y + 4, 1, 3, '#e9dcc6'); R(ctx, x, y + 1, 7, 3, OUT); R(ctx, x + 1, y, 5, 1, OUT); R(ctx, x + 1, y + 1, 5, 2, '#8e63c7'); R(ctx, x + 2, y, 3, 1, '#b08ae0'); R(ctx, x + 1, y + 1, 2, 1, '#b08ae0'); R(ctx, x + 1, y + 3, 5, 1, '#5f3f93'); };
      m(8, 10); m(18, 16); R(ctx, 24, 8, 2, 2, '#f4f0e6'); R(ctx, 25, 10, 1, 3, GRASS.tuft);
    }
    decoCache[kind] = c; return c;
  }
  const bushCache = [];
  function bushSprite(v) {
    if (bushCache[v]) return bushCache[v];
    const c = Pixel.make(T, T), ctx = c.getContext('2d');
    const B = { dark: '#3f7d3a', base: '#59a04a', light: '#7fc25f', rim: '#a6dd80' };
    Pixel.ellipse(ctx, 16, 28, 13, 3, 'rgba(0,0,0,0.22)');
    const blobs = [[[16, 17, 11], [9, 19, 7], [23, 19, 7], [13, 12, 6], [20, 13, 6]], [[15, 18, 10], [8, 20, 6], [23, 18, 7], [17, 11, 6]], [[14, 19, 9], [22, 17, 8], [10, 14, 6], [19, 11, 5]], [[16, 18, 10], [7, 21, 5], [25, 21, 5], [12, 12, 6], [21, 13, 6], [16, 9, 4]]][v];
    for (const [x, y, r] of blobs) Pixel.circle(ctx, x, y, r + 1, OUT);
    for (const [x, y, r] of blobs) Pixel.circle(ctx, x + 1, y + 1, r, B.dark);
    for (const [x, y, r] of blobs) Pixel.circle(ctx, x, y, r - 1, B.base);
    for (const [x, y, r] of blobs) { Pixel.circle(ctx, x - 2, y - 2, r - 3, B.light); Pixel.circle(ctx, x - 3, y - 4, Math.max(1, r - 5), B.rim); }
    // 잎 틈 + 열매
    for (const [x, y] of [[12, 20], [19, 22], [16, 16], [23, 21]]) R(ctx, x, y, 1, 1, B.dark);
    if (v === 1) for (const [x, y] of [[10, 17], [20, 20], [15, 23]]) { R(ctx, x, y, 2, 2, '#d8433f'); R(ctx, x, y, 1, 1, '#f08a7a'); }
    if (v === 3) for (const [x, y] of [[9, 20], [22, 18], [14, 14], [19, 23]]) { R(ctx, x, y, 2, 2, '#f4f0e6'); R(ctx, x + 1, y + 1, 1, 1, '#d9d0bd'); }
    bushCache[v] = c; return c;
  }

  // ---------- 청크 ----------
  function chunk(ctx, map, ci, cj, { TILE, CHUNK }) {
    const cols = map.cols, rows = map.rows, tiles = map.tiles;
    const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows) ? 0 : tiles[j * cols + i];
    ctx.imageSmoothingEnabled = false;
    const seed = (typeof RNG !== 'undefined') ? RNG.hash('forest:' + ci + ',' + cj) : (ci * 131 + cj * 71);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const ti = ci * CHUNK + i, tj = cj * CHUNK + j, x = i * TILE, y = j * TILE;
      const t = at(ti, tj), parity = parityOf(ti, tj), h = h2(ti, tj, seed);
      if (t === 0) {
        const o = (i2, j2) => at(ti + i2, tj + j2) !== 0;
        const mask = (o(0, -1) ? N : 0) | (o(1, 0) ? E : 0) | (o(0, 1) ? S : 0) | (o(-1, 0) ? W : 0) | (o(1, -1) ? NE : 0) | (o(1, 1) ? SE : 0) | (o(-1, 1) ? SW : 0) | (o(-1, -1) ? NW : 0);
        ctx.drawImage(wallTile(mask, parity, h % 3), x, y);
      } else if (t === 2) {
        const w = (i2, j2) => at(ti + i2, tj + j2) !== 2;
        ctx.drawImage(waterTile(parity, (w(0, -1) ? N : 0) | (w(1, 0) ? E : 0) | (w(0, 1) ? S : 0) | (w(-1, 0) ? W : 0), ((h >> 4) & 1) | (((h >> 6) % 7 === 0) ? 2 : 0) | ((h >> 9) & 4)), x, y);
      } else {
        ctx.drawImage(floorFor(ti, tj), x, y);
        if (t === 3) ctx.drawImage(decoSprite((h >> 3) % 8), x, y);
        else if (t === 4) ctx.drawImage(bushSprite((h >> 5) & 3), x, y);
      }
    }
    // 그림자: 북쪽이 숲이면 줄기 아래 그늘 띠(들쭉날쭉), 서쪽이 숲이면 얇은 띠(광원 좌상단)
    ctx.fillStyle = 'rgba(20,30,15,0.28)';
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const ti = ci * CHUNK + i, tj = cj * CHUNK + j, t = at(ti, tj);
      if (t === 0) continue;
      const x = i * TILE, y = j * TILE;
      if (at(ti, tj - 1) === 0) for (let p = 0; p < TILE; p += 4) ctx.fillRect(x + p, y, 4, 5 + (h2(ti * 8 + p, tj, 9) % 3));
      if (at(ti - 1, tj) === 0) for (let p = 0; p < TILE; p += 4) ctx.fillRect(x, y + p, 2 + (h2(ti, tj * 8 + p, 9) % 2), 4);
    }
  }

  function minimapColor(tile) { return ['#2c5a34', '#7db457', '#4f9ad6', '#95c96a', '#59a04a'][tile] || '#000'; }

  // ---------- 상자 28×24 ----------
  function chestSprite(open, type) {
    const c = Pixel.make(28, 24), ctx = c.getContext('2d');
    const P = type === 'hidden' ? { base: '#6f4fb0', light: '#9a7cd6', dark: '#4a3380', band: '#c9b1ff', bandD: '#8a74c9', lock: '#f2d35b' }
      : type === 'quest' ? { base: '#d4a53a', light: '#f0cf6a', dark: '#9c7224', band: '#fff1b8', bandD: '#c39a3a', lock: '#8a3a2a' }
      : { base: '#a0652f', light: '#c48a4b', dark: '#6e4320', band: '#8d94a0', bandD: '#5c636e', lock: '#f2d35b' };
    Pixel.ellipse(ctx, 14, 22, 12, 2, 'rgba(0,0,0,0.25)');
    // 몸통
    R(ctx, 2, 10, 24, 12, OUT); R(ctx, 3, 11, 22, 10, P.base); R(ctx, 3, 11, 22, 2, P.light); R(ctx, 3, 18, 22, 3, P.dark); R(ctx, 23, 11, 2, 10, P.dark);
    for (const yy of [14, 17]) R(ctx, 4, yy, 20, 1, P.dark); // 판자 틈
    // 쇠 띠(세로)
    for (const xx of [5, 20]) { R(ctx, xx, 11, 3, 10, P.bandD); R(ctx, xx, 11, 2, 10, P.band); R(ctx, xx, 11, 3, 1, P.band); }
    if (open) {
      // 열린 뚜껑(뒤로 젖힘) + 안쪽 빛
      R(ctx, 2, 1, 24, 8, OUT); R(ctx, 3, 2, 22, 6, P.dark); R(ctx, 4, 3, 20, 4, P.base); R(ctx, 4, 3, 20, 1, P.light);
      for (const xx of [5, 20]) R(ctx, xx, 3, 3, 4, P.bandD);
      R(ctx, 3, 9, 22, 2, '#1e1515'); R(ctx, 5, 10, 18, 1, type === 'hidden' ? '#d9c6ff' : '#ffe9a8');
      if (type === 'quest') { R(ctx, 10, 6, 8, 5, '#f5ecd3'); R(ctx, 10, 6, 8, 1, '#d8ccae'); R(ctx, 9, 7, 1, 3, '#c9b48a'); R(ctx, 18, 7, 1, 3, '#c9b48a'); R(ctx, 12, 8, 4, 1, '#9c7a4a'); }
      else if (type === 'hidden') { R(ctx, 12, 7, 4, 4, '#e2d4ff'); R(ctx, 13, 6, 2, 1, '#e2d4ff'); R(ctx, 13, 7, 1, 1, '#ffffff'); }
      else { R(ctx, 11, 8, 2, 2, '#f2d35b'); R(ctx, 14, 7, 2, 2, '#f2d35b'); R(ctx, 16, 9, 2, 1, '#f2d35b'); }
    } else {
      // 둥근 뚜껑
      R(ctx, 2, 5, 24, 6, OUT); R(ctx, 4, 3, 20, 2, OUT); R(ctx, 6, 2, 16, 1, OUT);
      R(ctx, 3, 6, 22, 4, P.base); R(ctx, 5, 4, 18, 2, P.base); R(ctx, 7, 3, 14, 1, P.light); R(ctx, 5, 4, 10, 1, P.light); R(ctx, 3, 9, 22, 1, P.dark); R(ctx, 22, 5, 3, 5, P.dark);
      for (const xx of [5, 20]) { R(ctx, xx, 4, 3, 6, P.bandD); R(ctx, xx, 4, 2, 6, P.band); }
      R(ctx, 3, 10, 22, 1, OUT);
      // 자물쇠 / 보석 / 두루마리 인장
      if (type === 'hidden') { R(ctx, 11, 7, 6, 7, OUT); R(ctx, 12, 8, 4, 5, '#b89cff'); R(ctx, 12, 8, 2, 2, '#efe6ff'); R(ctx, 14, 11, 2, 2, '#7a5fc7'); R(ctx, 10, 10, 1, 1, '#ffffff'); R(ctx, 17, 8, 1, 1, '#ffffff'); }
      else if (type === 'quest') { R(ctx, 10, 8, 8, 6, OUT); R(ctx, 11, 9, 6, 4, '#f5ecd3'); R(ctx, 11, 9, 6, 1, '#fff9ea'); R(ctx, 12, 11, 4, 1, '#c84a3a'); R(ctx, 13, 10, 2, 3, '#c84a3a'); }
      else { R(ctx, 12, 8, 4, 6, OUT); R(ctx, 13, 9, 2, 4, P.lock); R(ctx, 13, 11, 2, 1, '#8a6a1a'); }
    }
    return c;
  }

  // ---------- 출구 48×56: 이끼 낀 돌 아치(둥근 천장) + 아래로 내려가는 계단 + 녹청 포털 빛 ----------
  function exitSprite() {
    const c = Pixel.make(48, 56), ctx = c.getContext('2d');
    const ST = { base: '#8a949e', light: '#bcc6ce', dark: '#5a646e', moss: '#5f9c48', mossL: '#86c76a' };
    Pixel.ellipse(ctx, 24, 52, 21, 3, 'rgba(0,0,0,0.25)');
    // 아치 외곽선(둥근 윗면) → 돌 몸체 → 좌상 하이라이트 / 우하 그늘
    Pixel.ellipse(ctx, 24, 24, 21, 18, OUT); R(ctx, 3, 24, 42, 26, OUT);
    Pixel.ellipse(ctx, 24, 24, 20, 17, ST.base); R(ctx, 4, 24, 40, 25, ST.base);
    Pixel.ellipse(ctx, 23, 23, 19, 16, ST.light); Pixel.ellipse(ctx, 25, 25, 19, 16, ST.base); R(ctx, 4, 24, 3, 25, ST.light);
    R(ctx, 41, 26, 3, 23, ST.dark); R(ctx, 4, 47, 40, 2, ST.dark);
    // 돌 블록 줄눈
    for (let y = 16; y < 46; y += 6) { R(ctx, 5, y, 5, 1, ST.dark); R(ctx, 38, y + 3, 5, 1, ST.dark); R(ctx, 7, y + 3, 1, 3, ST.dark); R(ctx, 40, y, 1, 3, ST.dark); }
    for (let x = 12; x < 36; x += 6) R(ctx, x, 10, 1, 3, ST.dark);
    // 안쪽: 어두운 통로(윗면 둥글게) + 내려가는 계단(아래로 갈수록 밝아짐)
    Pixel.ellipse(ctx, 24, 24, 13, 10, OUT); R(ctx, 11, 24, 27, 24, OUT);
    Pixel.ellipse(ctx, 24, 24, 12, 9, '#15102a'); R(ctx, 12, 24, 25, 23, '#15102a');
    const steps = ['#2a2448', '#3b3466', '#4f4a86', '#6660aa', '#8a86d3'];
    steps.forEach((col, k) => { const y = 42 - k * 5, inset = k; R(ctx, 12 + inset, y, 25 - inset * 2, 4, col); R(ctx, 12 + inset, y, 25 - inset * 2, 1, Pixel.shade(col, 0.3)); R(ctx, 12 + inset, y + 3, 25 - inset * 2, 1, Pixel.shade(col, -0.3)); });
    // 포털 빛: 계단 맨 아래 고인 녹청 빛 + 벽면 반사 + 반짝임
    Pixel.ellipse(ctx, 24, 45, 11, 3, '#4fcaa8'); Pixel.ellipse(ctx, 24, 45, 7, 2, '#a9f5e3'); R(ctx, 12, 46, 25, 1, '#3aa88a');
    R(ctx, 12, 30, 1, 16, '#2d5a66'); R(ctx, 36, 30, 1, 16, '#2d5a66');
    for (const [x, y] of [[17, 22], [30, 18], [21, 30], [28, 34], [24, 14]]) { R(ctx, x, y, 1, 1, '#d9fff6'); R(ctx, x - 1, y, 3, 1, 'rgba(180,255,235,0.4)'); R(ctx, x, y - 1, 1, 3, 'rgba(180,255,235,0.4)'); }
    // 머릿돌 룬
    R(ctx, 20, 6, 8, 5, OUT); R(ctx, 21, 7, 6, 3, ST.light); R(ctx, 23, 8, 2, 1, '#4fcaa8'); R(ctx, 22, 8, 1, 1, '#3aa88a'); R(ctx, 25, 8, 1, 1, '#3aa88a');
    // 이끼·덩굴(좌상단에서 흘러내림)·잎
    R(ctx, 6, 20, 2, 8, ST.moss); R(ctx, 7, 28, 1, 4, ST.moss); R(ctx, 40, 36, 3, 6, ST.moss); R(ctx, 12, 8, 6, 2, ST.moss); R(ctx, 30, 7, 7, 2, ST.moss);
    R(ctx, 9, 11, 1, 10, ST.moss); R(ctx, 10, 14, 1, 1, ST.mossL); R(ctx, 8, 17, 1, 1, ST.mossL); R(ctx, 10, 20, 2, 1, ST.mossL);
    R(ctx, 37, 12, 1, 7, ST.moss); R(ctx, 36, 15, 1, 1, ST.mossL); R(ctx, 38, 18, 1, 1, ST.mossL);
    for (const [x, y] of [[14, 7], [33, 6], [5, 22], [42, 38]]) { R(ctx, x, y, 2, 2, ST.mossL); R(ctx, x, y, 1, 1, OUT); }
    // 입구 앞 돌 계단 두 단
    R(ctx, 8, 48, 32, 4, OUT); R(ctx, 9, 49, 30, 2, ST.base); R(ctx, 9, 49, 30, 1, ST.light);
    R(ctx, 12, 52, 24, 3, OUT); R(ctx, 13, 53, 22, 1, ST.base);
    return c;
  }

  // 예열: 텍스처·바닥 타일·흔한 벽 마스크를 로드 시점에 미리 만들어 첫 청크가 느려지지 않게 한다
  function warm() {
    tex();
    for (let p = 0; p < SUB * SUB; p++) { for (let v = 0; v < 6; v++) floorTile(p, v); for (const m of [0, N, E, S, W, N | E, N | W, S | E, S | W, N | S, E | W]) for (let v = 0; v < 3; v++) wallTile(m, p, v); }
    for (let k = 0; k < 8; k++) decoSprite(k); for (let k = 0; k < 4; k++) bushSprite(k);
  }
  try { warm(); } catch (e) { /* 캔버스가 없는 환경(테스트)에서는 건너뛴다 */ }
  DungeonTiles.registerBiome('forest', { chunk, minimapColor, chestSprite, exitSprite });
})();
