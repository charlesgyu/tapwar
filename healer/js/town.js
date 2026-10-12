// 마을 — 타일 기반 지도 정의, 충돌 격자, 바닥/건물/소품 렌더링(픽셀 아트, 코드로 생성)
const Town = (() => {
  const TILE = 16;
  const COLS = 24, ROWS = 64;
  const W = COLS * TILE, H = ROWS * TILE;

  // ---------- 지도 정의 (단위: 타일, 중앙 대로 = 9~14열) ----------
  // 건물: x,y,w,h = 발자국(충돌 영역). 문은 아래쪽 중앙. roof: 지붕색, wall: 벽색
  const BUILDINGS = [
    { key: 'tower', name: '탑 입구', kind: 'gate', x: 7, y: 1, w: 10, h: 6 },
    { key: 'temple', name: '신전', kind: 'temple', x: 1, y: 7, w: 7, h: 6, roof: '#e3b94e', wall: '#f7f1e3' },
    { key: 'guild', name: '길드', kind: 'house', x: 16, y: 7, w: 7, h: 6, roof: '#4f6d9a', wall: '#efe3c8', banner: '#c94c4c' },
    { key: 'adventurer', name: '모험가 사무소', kind: 'house', x: 1, y: 16, w: 7, h: 5, roof: '#c94c4c', wall: '#f1e4c8' },
    { key: 'engraver', name: '각인사', kind: 'house', x: 17, y: 16, w: 6, h: 5, roof: '#7a5aa0', wall: '#ece0d2' },
    { key: 'smithy', name: '대장간', kind: 'house', x: 1, y: 24, w: 6, h: 5, roof: '#6f7a8a', wall: '#d9cbb3', chimney: true },
    { key: 'bank', name: '은행', kind: 'house', x: 17, y: 24, w: 6, h: 5, roof: '#5f8a7a', wall: '#e9e2d3', stone: true },
    { key: 'inn', name: '여관', kind: 'house', x: 1, y: 36, w: 8, h: 6, roof: '#d9823b', wall: '#f1e4c8' },
    { key: 'auction', name: '경매장', kind: 'house', x: 15, y: 36, w: 8, h: 6, roof: '#c94c4c', wall: '#efe3c8', banner: '#4f6d9a' },
    { key: 'shop', name: '잡화상', kind: 'house', x: 1, y: 48, w: 6, h: 5, roof: '#4f6d9a', wall: '#f1e4c8' },
    { key: 'houseA', name: '', kind: 'house', x: 17, y: 48, w: 6, h: 5, roof: '#c94c4c', wall: '#efe3c8' },
    { key: 'houseB', name: '', kind: 'house', x: 2, y: 57, w: 6, h: 5, roof: '#6f7a8a', wall: '#f1e4c8' },
    { key: 'houseC', name: '', kind: 'house', x: 16, y: 57, w: 6, h: 5, roof: '#4f6d9a', wall: '#efe3c8' },
  ];
  // 성벽 (충돌만, 바닥 레이어에 그림)
  const WALLS = [
    { x: 0, y: 3, w: 7, h: 2 },
    { x: 17, y: 3, w: 7, h: 2 },
  ];
  // 큰 소품(깊이 정렬 대상): type, x,y = 발 기준(타일, 소수 가능)
  const PROPS = [
    { type: 'well', x: 12, y: 32 },
    { type: 'stall', x: 9.5, y: 48, color: '#c94c4c' },
    { type: 'stall', x: 14.5, y: 48, color: '#4f8a5a' },
    { type: 'tree', x: 8.5, y: 12.5, size: 'big' },
    { type: 'tree', x: 14.5, y: 12.5, size: 'big' },
    { type: 'tree', x: 8.5, y: 23.5, size: 'small' },
    { type: 'tree', x: 15.5, y: 23.5, size: 'small' },
    { type: 'tree', x: 9.5, y: 35.5, size: 'big' },
    { type: 'tree', x: 14.5, y: 35.5, size: 'big' },
    { type: 'tree', x: 8.5, y: 56.5, size: 'small' },
    { type: 'tree', x: 14.5, y: 56.5, size: 'big' },
    { type: 'tree', x: 12, y: 62.5, size: 'big' },
    { type: 'tree', x: 1.5, y: 31.5, size: 'small' },
    { type: 'tree', x: 21.5, y: 31.5, size: 'small' },
    { type: 'tree', x: 1.5, y: 46.5, size: 'small' },
    { type: 'tree', x: 22.5, y: 45.5, size: 'small' },
    { type: 'lamp', x: 9, y: 20 },
    { type: 'lamp', x: 15, y: 20 },
    { type: 'lamp', x: 9, y: 38 },
    { type: 'lamp', x: 15, y: 38 },
    { type: 'lamp', x: 9, y: 53 },
    { type: 'lamp', x: 15, y: 53 },
    { type: 'lamp', x: 9.5, y: 29 },
    { type: 'lamp', x: 14.5, y: 29 },
    { type: 'barrel', x: 7.5, y: 27 },
    { type: 'barrel', x: 8.4, y: 27.6 },
    { type: 'crate', x: 16.4, y: 27 },
    { type: 'crate', x: 9.5, y: 40.5 },
    { type: 'barrel', x: 10.3, y: 41.2 },
    { type: 'crate', x: 7.5, y: 47 },
    { type: 'barrel', x: 16.6, y: 46.6 },
    { type: 'barrel', x: 7.5, y: 14 },
    { type: 'crate', x: 16.5, y: 14 },
    { type: 'sign', x: 15.5, y: 8.5 },
  ];
  // 잔디밭 (fence: 울타리, 울타리가 있으면 통행 불가)
  const GRASS = [
    { x: 1, y: 30, w: 5, h: 4, fence: true, flowers: true },
    { x: 18, y: 30, w: 5, h: 4, fence: true, flowers: true },
    { x: 0, y: 13, w: 3, h: 2, fence: false },
    { x: 21, y: 13, w: 3, h: 2, fence: false },
    { x: 8, y: 11, w: 2, h: 3, fence: false },
    { x: 14, y: 11, w: 2, h: 3, fence: false },
    { x: 9, y: 34, w: 2, h: 2, fence: false },
    { x: 13, y: 34, w: 2, h: 2, fence: false },
    { x: 0, y: 44, w: 3, h: 3, fence: false, flowers: true },
    { x: 21, y: 43, w: 3, h: 3, fence: false, flowers: true },
    { x: 8, y: 55, w: 2, h: 3, fence: false },
    { x: 14, y: 55, w: 2, h: 3, fence: false },
    { x: 10, y: 61, w: 4, h: 2, fence: false },
  ];
  // 광장 (큰 포석)
  const PLAZA = { x: 7, y: 26, w: 10, h: 10 };
  // 시장 바닥
  const MARKET = { x: 7, y: 45, w: 10, h: 5 };
  // 만국기 (y: 타일, x0~x1)
  const BUNTING = [
    { y: 22.3, x0: 7.5, x1: 16.5, colors: ['#e05a5a', '#f2d35b', '#5aa0d8', '#6fbf73'] },
    { y: 44.4, x0: 7.5, x1: 16.5, colors: ['#f2d35b', '#e05a5a', '#9b7bd3', '#5aa0d8'] },
  ];

  // ---------- 충돌 격자 ----------
  const solid = new Uint8Array(COLS * ROWS);
  function setSolid(x, y, w, h, v = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
      solid[j * COLS + i] = v;
    }
  }
  function isSolidTile(i, j) {
    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return true;
    return solid[j * COLS + i] === 1;
  }
  // 좌표(px)의 발 상자가 통행 가능한지
  function canStand(px, py) {
    const hw = 4, top = py - 4, bottom = py;
    const x0 = Math.floor((px - hw) / TILE), x1 = Math.floor((px + hw - 1) / TILE);
    const y0 = Math.floor(top / TILE), y1 = Math.floor((bottom - 1) / TILE);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (isSolidTile(i, j)) return false;
    return true;
  }

  const PROP_FOOT = {
    well: { w: 2, h: 3, ox: -1, oy: -2 },
    stall: { w: 3, h: 2, ox: -1.5, oy: -2 },
    tree: { w: 1, h: 1, ox: -0.5, oy: -1 },
    barrel: { w: 1, h: 1, ox: -0.5, oy: -1 },
    crate: { w: 1, h: 1, ox: -0.5, oy: -1 },
    lamp: null, sign: null,
  };

  function buildSolid() {
    solid.fill(0);
    setSolid(0, 0, COLS, 3);          // 상단 산맥
    setSolid(0, ROWS - 1, COLS, 1);   // 하단 경계
    setSolid(0, 0, 1, ROWS); setSolid(COLS - 1, 0, 1, ROWS); // 좌우 경계
    for (const w of WALLS) setSolid(w.x, w.y, w.w, w.h);
    for (const b of BUILDINGS) setSolid(b.x, b.y, b.w, b.h);
    for (const g of GRASS) if (g.fence) setSolid(g.x, g.y, g.w, g.h);
    for (const p of PROPS) {
      const f = PROP_FOOT[p.type];
      if (!f) continue;
      setSolid(Math.round(p.x + f.ox), Math.round(p.y + f.oy), f.w, f.h);
    }
  }

  // 건물 문 앞 타일(플레이어가 서는 곳)
  function doorPoint(b) {
    return { x: (b.x + b.w / 2) * TILE, y: (b.y + b.h) * TILE + 8 };
  }

  // ---------- 바닥 그리기 ----------
  const C = {
    cobble: ['#e8dcc4', '#e3d5bb', '#ecdfc9', '#dfd0b4'],
    grout: '#cdbc9f',
    plaza: ['#e9ddc5', '#e4d6ba', '#eee2cc'],
    grass: '#a9d46b', grassDark: '#8fbf55', grassLight: '#bfe081',
    dirt: '#d8c09a',
    fence: '#8b5a2b', fenceDark: '#5a3a1c',
    stone: '#9aa3ad', stoneDark: '#6d767f', stoneLight: '#b9c1c9',
    sky: '#cfe6f5', mountain: '#a9b8c6', mountainDark: '#8c9bab', snow: '#eef4f8',
    outline: '#4a3a30',
  };

  function drawCobble(ctx, x, y, w, h, rnd, cw = 8, ch = 6, pal = C.cobble) {
    Pixel.rect(ctx, x, y, w, h, pal[0]);
    let row = 0;
    for (let yy = y; yy < y + h; yy += ch, row++) {
      const off = (row % 2) ? cw / 2 : 0;
      for (let xx = x - cw + off; xx < x + w; xx += cw) {
        const col = pal[Math.floor(rnd() * pal.length)];
        const sx = Math.max(x, xx), ex = Math.min(x + w, xx + cw);
        if (ex <= sx) continue;
        Pixel.rect(ctx, sx, yy, ex - sx, Math.min(ch, y + h - yy), col);
        // 줄눈
        Pixel.rect(ctx, sx, Math.min(yy + ch - 1, y + h - 1), ex - sx, 1, C.grout);
        if (xx + cw - 1 >= x && xx + cw - 1 < x + w) Pixel.rect(ctx, xx + cw - 1, yy, 1, Math.min(ch, y + h - yy), C.grout);
      }
    }
  }

  function drawGrass(ctx, g, rnd) {
    const x = g.x * TILE, y = g.y * TILE, w = g.w * TILE, h = g.h * TILE;
    Pixel.rect(ctx, x, y, w, h, C.grass);
    Pixel.outline(ctx, x, y, w, h, C.grassDark);
    for (let i = 0; i < (w * h) / 40; i++) {
      const px = x + 1 + Math.floor(rnd() * (w - 3)), py = y + 1 + Math.floor(rnd() * (h - 3));
      Pixel.rect(ctx, px, py, 1, 2, rnd() < 0.5 ? C.grassDark : C.grassLight);
    }
    if (g.flowers) {
      const cols = ['#f26a6a', '#f7d35b', '#ffffff', '#f49ac1'];
      for (let i = 0; i < (w * h) / 120; i++) {
        const px = x + 2 + Math.floor(rnd() * (w - 5)), py = y + 2 + Math.floor(rnd() * (h - 5));
        Pixel.rect(ctx, px, py, 2, 2, cols[Math.floor(rnd() * cols.length)]);
        Pixel.rect(ctx, px, py + 2, 1, 1, C.grassDark);
      }
    }
    if (g.fence) {
      // 울타리 (상단은 뒤쪽이라 짧게)
      const post = (px, py, hgt) => { Pixel.rect(ctx, px, py, 2, hgt, C.fence); Pixel.rect(ctx, px, py + hgt - 1, 2, 1, C.fenceDark); };
      for (let px = x; px < x + w; px += 8) { post(px, y - 3, 6); post(px, y + h - 7, 8); }
      Pixel.rect(ctx, x, y - 1, w, 1, C.fence); Pixel.rect(ctx, x, y + h - 5, w, 1, C.fence); Pixel.rect(ctx, x, y + h - 2, w, 1, C.fence);
      for (let py = y; py < y + h; py += 8) { post(x, py - 2, 8); post(x + w - 2, py - 2, 8); }
      Pixel.rect(ctx, x, y, 1, h, C.fenceDark); Pixel.rect(ctx, x + w - 1, y, 1, h, C.fenceDark);
    }
  }

  function drawWall(ctx, wl, rnd) {
    const x = wl.x * TILE, y = wl.y * TILE, w = wl.w * TILE, h = wl.h * TILE;
    // 윗면
    Pixel.rect(ctx, x, y, w, 10, C.stoneLight);
    // 앞면 벽돌
    drawCobble(ctx, x, y + 10, w, h - 10, rnd, 12, 6, [C.stone, Pixel.shade(C.stone, -0.08), Pixel.shade(C.stone, 0.06)]);
    Pixel.rect(ctx, x, y + 9, w, 1, C.stoneDark);
    // 총안(흉벽)
    for (let px = x; px < x + w; px += 12) Pixel.rect(ctx, px + 2, y - 4, 6, 5, C.stone);
    Pixel.rect(ctx, x, y + h - 1, w, 1, C.stoneDark);
  }

  function drawMountains(ctx, rnd) {
    Pixel.rect(ctx, 0, 0, W, 3 * TILE, C.sky);
    // 뒷산
    for (let i = -1; i < 9; i++) {
      const cx = i * 64 + 20, top = 6 + Math.floor(rnd() * 10);
      for (let yy = top; yy < 48; yy++) {
        const half = Math.floor((yy - top) * 1.4) + 6;
        Pixel.rect(ctx, cx - half, yy, half * 2, 1, yy < top + 7 ? C.snow : (yy < top + 14 ? C.mountain : C.mountainDark));
      }
    }
    Pixel.rect(ctx, 0, 44, W, 4, C.mountainDark);
  }

  function renderGround() {
    const c = Pixel.make(W, H);
    const ctx = c.getContext('2d');
    const rnd = Pixel.rng(7);
    drawCobble(ctx, 0, 0, W, H, rnd);
    // 광장 큰 포석
    drawCobble(ctx, PLAZA.x * TILE, PLAZA.y * TILE, PLAZA.w * TILE, PLAZA.h * TILE, rnd, 16, 10, C.plaza);
    Pixel.outline(ctx, PLAZA.x * TILE, PLAZA.y * TILE, PLAZA.w * TILE, PLAZA.h * TILE, '#d2c2a4');
    // 광장 안 원형 무늬
    for (let r = 44; r > 10; r -= 11) {
      const cx = (PLAZA.x + PLAZA.w / 2) * TILE, cy = (PLAZA.y + PLAZA.h / 2) * TILE + 8;
      Pixel.ellipse(ctx, cx, cy, r, Math.round(r * 0.6), '#d9c9aa');
      Pixel.ellipse(ctx, cx, cy, r - 1, Math.round(r * 0.6) - 1, C.plaza[0]);
    }
    // 시장 바닥 흙
    Pixel.rect(ctx, MARKET.x * TILE, MARKET.y * TILE, MARKET.w * TILE, MARKET.h * TILE, C.dirt);
    Pixel.outline(ctx, MARKET.x * TILE, MARKET.y * TILE, MARKET.w * TILE, MARKET.h * TILE, '#c4ab85');
    for (const g of GRASS) drawGrass(ctx, g, rnd);
    drawMountains(ctx, rnd);
    for (const w of WALLS) drawWall(ctx, w, rnd);
    // 배수구/맨홀 몇 개
    for (const [mx, my] of [[10, 18], [13, 41], [11, 52]]) {
      Pixel.circle(ctx, mx * TILE + 8, my * TILE + 8, 4, '#b7a687');
      Pixel.circle(ctx, mx * TILE + 8, my * TILE + 8, 3, '#cdbc9f');
    }
    return c;
  }

  // ---------- 건물 그리기 ----------
  function drawWindow(ctx, x, y, w = 8, h = 8) {
    Pixel.rect(ctx, x, y, w, h, '#5a4030');
    Pixel.rect(ctx, x + 1, y + 1, w - 2, h - 2, '#8fc9ea');
    Pixel.rect(ctx, x + 1, y + 1, Math.floor((w - 2) / 2), Math.floor((h - 2) / 2), '#bfe4f5');
    Pixel.rect(ctx, x + Math.floor(w / 2), y + 1, 1, h - 2, '#5a4030');
    Pixel.rect(ctx, x + 1, y + Math.floor(h / 2), w - 2, 1, '#5a4030');
    // 창틀 아래 화분
    Pixel.rect(ctx, x, y + h, w, 2, '#8b5a2b');
    Pixel.rect(ctx, x + 1, y + h - 1, 2, 1, '#f26a6a');
    Pixel.rect(ctx, x + w - 3, y + h - 1, 2, 1, '#f7d35b');
  }

  function drawDoor(ctx, x, y, w = 10, h = 14) {
    // 아치형 문
    Pixel.rect(ctx, x, y + 3, w, h - 3, '#4a2f1c');
    Pixel.ellipse(ctx, x + Math.floor(w / 2), y + 4, Math.floor(w / 2), 4, '#4a2f1c');
    Pixel.rect(ctx, x + 1, y + 4, w - 2, h - 4, '#8b5a2b');
    Pixel.ellipse(ctx, x + Math.floor(w / 2), y + 4, Math.floor(w / 2) - 1, 3, '#8b5a2b');
    Pixel.rect(ctx, x + Math.floor(w / 2), y + 1, 1, h - 1, '#6b4423');
    Pixel.rect(ctx, x + w - 3, y + Math.floor(h / 2), 1, 1, '#f2d35b');
  }

  function drawRoof(ctx, x, y, w, h, color, opts = {}) {
    const dark = Pixel.shade(color, -0.25), light = Pixel.shade(color, 0.18);
    Pixel.rect(ctx, x, y, w, h, color);
    // 기와 줄
    for (let yy = y + 3; yy < y + h; yy += 4) {
      Pixel.rect(ctx, x, yy, w, 1, dark);
      const off = ((yy - y) / 4) % 2 ? 3 : 0;
      for (let xx = x + off; xx < x + w; xx += 6) Pixel.rect(ctx, xx, yy - 2, 1, 2, dark);
    }
    // 용마루/처마
    Pixel.rect(ctx, x, y, w, 2, light);
    Pixel.rect(ctx, x, y, w, 1, dark);
    Pixel.rect(ctx, x, y + h - 1, w, 1, '#4a3a30');
    Pixel.rect(ctx, x, y, 1, h, dark); Pixel.rect(ctx, x + w - 1, y, 1, h, dark);
    if (opts.dormer) { // 지붕창
      const dx = x + Math.floor(w / 2) - 6, dy = y + Math.floor(h / 2) - 6;
      Pixel.rect(ctx, dx, dy, 12, 10, '#f1e4c8');
      Pixel.outline(ctx, dx, dy, 12, 10, '#4a3a30');
      Pixel.rect(ctx, dx - 1, dy - 2, 14, 3, dark);
      drawWindow(ctx, dx + 3, dy + 2, 6, 6);
      Pixel.rect(ctx, dx + 3, dy + 8, 6, 2, '#f1e4c8');
    }
  }

  function drawTimberWall(ctx, x, y, w, h, wallColor, stone) {
    Pixel.rect(ctx, x, y, w, h, wallColor);
    const beam = '#8b5a2b';
    if (stone) {
      const rnd = Pixel.rng(x * 31 + y);
      drawCobble(ctx, x, y, w, h, rnd, 10, 5, [wallColor, Pixel.shade(wallColor, -0.06), Pixel.shade(wallColor, 0.04)]);
    } else {
      Pixel.rect(ctx, x, y, w, 2, beam);
      for (let xx = x; xx < x + w; xx += 12) Pixel.rect(ctx, xx, y, 2, h, beam);
      Pixel.rect(ctx, x + w - 2, y, 2, h, beam);
      // 사선 보
      for (let xx = x + 2; xx + 10 < x + w; xx += 24) for (let k = 0; k < 8; k++) Pixel.rect(ctx, xx + k, y + 3 + k, 1, 1, beam);
    }
    Pixel.outline(ctx, x, y, w, h, '#4a3a30');
  }

  function drawSignBoard(ctx, x, y, w) {
    Pixel.rect(ctx, x, y, w, 7, '#8b5a2b');
    Pixel.outline(ctx, x, y, w, 7, '#4a2f1c');
    Pixel.rect(ctx, x + 2, y - 2, 1, 2, '#4a2f1c'); Pixel.rect(ctx, x + w - 3, y - 2, 1, 2, '#4a2f1c');
  }

  function renderHouse(b) {
    const w = b.w * TILE, h = b.h * TILE;
    const c = Pixel.make(w + 4, h + 6); // 처마가 살짝 삐져나옴
    const ctx = c.getContext('2d');
    const ox = 2, oy = 6;
    const wallH = b.h >= 6 ? 40 : 34;
    const roofH = h - wallH;
    // 그림자
    Pixel.rect(ctx, ox + 2, oy + h - 2, w, 2, 'rgba(0,0,0,0.15)');
    // 벽
    drawTimberWall(ctx, ox, oy + roofH, w, wallH, b.wall, b.stone);
    // 지붕 (처마 2px 넘침)
    drawRoof(ctx, ox - 2, oy - 4, w + 4, roofH + 6, b.roof, { dormer: b.w >= 7 });
    if (b.chimney) {
      Pixel.rect(ctx, ox + w - 14, oy - 4, 8, 12, '#7a6a5e'); Pixel.outline(ctx, ox + w - 14, oy - 4, 8, 12, '#4a3a30');
      Pixel.rect(ctx, ox + w - 15, oy - 5, 10, 3, '#5a4a40');
    }
    // 문 & 창
    const doorW = 10, doorH = 14;
    const dx = ox + Math.floor(w / 2) - Math.floor(doorW / 2), dy = oy + h - doorH;
    drawDoor(ctx, dx, dy, doorW, doorH);
    const wy = oy + roofH + 8;
    if (w >= 80) { drawWindow(ctx, ox + 10, wy); drawWindow(ctx, ox + w - 18, wy); }
    else { drawWindow(ctx, ox + 7, wy); drawWindow(ctx, ox + w - 15, wy); }
    if (w >= 110) { drawWindow(ctx, ox + 28, wy); drawWindow(ctx, ox + w - 36, wy); }
    // 간판 (이름이 있을 때)
    if (b.name) drawSignBoard(ctx, dx - 7, dy - 9, doorW + 14);
    // 깃발 장식
    if (b.banner) {
      Pixel.rect(ctx, ox + 6, oy + roofH + 2, 6, 14, b.banner);
      Pixel.rect(ctx, ox + 6, oy + roofH + 14, 2, 3, b.banner); Pixel.rect(ctx, ox + 10, oy + roofH + 14, 2, 3, b.banner);
      Pixel.rect(ctx, ox + 5, oy + roofH + 1, 8, 1, '#4a3a30');
    }
    return { canvas: c, ox, oy };
  }

  function renderTemple(b) {
    const w = b.w * TILE, h = b.h * TILE;
    const c = Pixel.make(w + 4, h + 22);
    const ctx = c.getContext('2d');
    const ox = 2, oy = 22;
    const wallH = 40, roofH = h - wallH;
    Pixel.rect(ctx, ox + 2, oy + h - 2, w, 2, 'rgba(0,0,0,0.15)');
    Pixel.rect(ctx, ox, oy + roofH, w, wallH, b.wall);
    // 기둥
    for (let xx = ox + 4; xx < ox + w - 4; xx += 16) { Pixel.rect(ctx, xx, oy + roofH, 4, wallH, '#e9e2d2'); Pixel.rect(ctx, xx, oy + roofH, 1, wallH, '#c9c0ad'); }
    Pixel.outline(ctx, ox, oy + roofH, w, wallH, '#5a4a40');
    drawRoof(ctx, ox - 2, oy - 2, w + 4, roofH + 4, b.roof);
    // 종탑
    const tx = ox + Math.floor(w / 2) - 8;
    Pixel.rect(ctx, tx, oy - 16, 16, 20, '#f7f1e3'); Pixel.outline(ctx, tx, oy - 16, 16, 20, '#5a4a40');
    Pixel.rect(ctx, tx + 5, oy - 12, 6, 8, '#3a3040'); Pixel.rect(ctx, tx + 7, oy - 10, 2, 4, '#f2d35b');
    for (let k = 0; k < 8; k++) Pixel.rect(ctx, tx - 1 + k, oy - 17 - k, 18 - k * 2, 1, Pixel.shade(b.roof, -0.2));
    Pixel.rect(ctx, tx + 7, oy - 22, 2, 5, '#f2d35b');
    Pixel.rect(ctx, tx + 5, oy - 20, 6, 1, '#f2d35b');
    // 문·창
    const dx = ox + Math.floor(w / 2) - 6, dy = oy + h - 16;
    drawDoor(ctx, dx, dy, 12, 16);
    drawWindow(ctx, ox + 12, oy + roofH + 8, 8, 10); drawWindow(ctx, ox + w - 20, oy + roofH + 8, 8, 10);
    drawSignBoard(ctx, dx - 6, dy - 9, 24);
    return { canvas: c, ox, oy };
  }

  function renderGate(b) {
    const w = b.w * TILE, h = b.h * TILE;
    const c = Pixel.make(w + 8, h + 16);
    const ctx = c.getContext('2d');
    const ox = 4, oy = 16;
    const rnd = Pixel.rng(99);
    // 양쪽 탑
    for (const tx of [ox - 4, ox + w - 28]) {
      drawCobble(ctx, tx, oy - 6, 32, h + 6, rnd, 10, 6, [C.stone, Pixel.shade(C.stone, -0.08), Pixel.shade(C.stone, 0.06)]);
      Pixel.outline(ctx, tx, oy - 6, 32, h + 6, C.stoneDark);
      for (let px = tx; px < tx + 32; px += 8) Pixel.rect(ctx, px + 1, oy - 12, 5, 7, C.stone);
      // 원뿔 지붕
      for (let k = 0; k < 10; k++) Pixel.rect(ctx, tx + k, oy - 16 - 0 + k - 10 + 10, 32 - k * 2, 1, k % 2 ? '#4f6d9a' : '#3f5a82');
      drawWindow(ctx, tx + 12, oy + 10, 8, 10);
    }
    // 가운데 벽 + 아치
    drawCobble(ctx, ox + 28, oy + 8, w - 56, h - 8, rnd, 10, 6, [C.stone, Pixel.shade(C.stone, -0.08), Pixel.shade(C.stone, 0.06)]);
    Pixel.rect(ctx, ox + 28, oy + 2, w - 56, 6, C.stoneLight);
    for (let px = ox + 28; px < ox + w - 28; px += 10) Pixel.rect(ctx, px + 2, oy - 2, 6, 5, C.stone);
    Pixel.outline(ctx, ox + 28, oy + 8, w - 56, h - 8, C.stoneDark);
    // 아치 통로 (안쪽은 빛나는 포털)
    const ax = ox + Math.floor(w / 2) - 16, ay = oy + h - 40;
    Pixel.rect(ctx, ax, ay + 12, 32, 28, '#2b2440');
    Pixel.ellipse(ctx, ax + 16, ay + 12, 16, 12, '#2b2440');
    Pixel.rect(ctx, ax + 2, ay + 14, 28, 26, '#4a3a78');
    Pixel.ellipse(ctx, ax + 16, ay + 14, 14, 10, '#4a3a78');
    Pixel.ellipse(ctx, ax + 16, ay + 22, 8, 10, '#7a62c9');
    Pixel.ellipse(ctx, ax + 16, ay + 24, 4, 6, '#b7a6ff');
    // 횃불
    for (const fx of [ax - 6, ax + 36]) { Pixel.rect(ctx, fx, ay + 16, 2, 8, '#5a3a1c'); Pixel.rect(ctx, fx - 1, ay + 12, 4, 4, '#f2a33b'); Pixel.rect(ctx, fx, ay + 11, 2, 2, '#f7d35b'); }
    // 현판
    drawSignBoard(ctx, ax + 2, ay - 2, 28);
    return { canvas: c, ox, oy };
  }

  // ---------- 소품 ----------
  function renderTree(size) {
    const big = size === 'big';
    const w = big ? 28 : 20, h = big ? 34 : 24;
    const c = Pixel.make(w, h);
    const ctx = c.getContext('2d');
    const cx = Math.floor(w / 2);
    Pixel.ellipse(ctx, cx, h - 2, big ? 9 : 6, 2, 'rgba(0,0,0,0.18)');
    // 줄기
    Pixel.rect(ctx, cx - 2, h - (big ? 12 : 9), 4, big ? 11 : 8, '#8b5a2b');
    Pixel.rect(ctx, cx - 2, h - (big ? 12 : 9), 1, big ? 11 : 8, '#5a3a1c');
    // 잎
    const r = big ? 12 : 8;
    const cy = r + 1;
    Pixel.circle(ctx, cx, cy, r, '#2f6b2f');
    Pixel.circle(ctx, cx, cy, r - 1, '#5aa84a');
    Pixel.circle(ctx, cx - Math.floor(r / 3), cy - Math.floor(r / 3), Math.floor(r / 2), '#8fd27a');
    Pixel.circle(ctx, cx + Math.floor(r / 2), cy + Math.floor(r / 3), Math.floor(r / 2.5), '#4a9440');
    for (let k = 0; k < (big ? 6 : 3); k++) {
      const ang = k * 1.7, rr = r * 0.6;
      Pixel.rect(ctx, cx + Math.round(Math.cos(ang) * rr), cy + Math.round(Math.sin(ang) * rr), 2, 1, '#bfe081');
    }
    return { canvas: c, ox: cx, oy: h - 1 };
  }

  function renderLamp() {
    const c = Pixel.make(10, 30);
    const ctx = c.getContext('2d');
    Pixel.ellipse(ctx, 5, 29, 3, 1, 'rgba(0,0,0,0.18)');
    Pixel.rect(ctx, 4, 8, 2, 21, '#2f2f3a');
    Pixel.rect(ctx, 2, 27, 6, 2, '#2f2f3a');
    Pixel.rect(ctx, 2, 2, 6, 7, '#2f2f3a');
    Pixel.rect(ctx, 3, 3, 4, 5, '#f7d35b');
    Pixel.rect(ctx, 4, 4, 2, 2, '#fff6c2');
    Pixel.rect(ctx, 4, 0, 2, 2, '#2f2f3a');
    return { canvas: c, ox: 5, oy: 29 };
  }

  function renderBarrel() {
    const c = Pixel.make(12, 14);
    const ctx = c.getContext('2d');
    Pixel.ellipse(ctx, 6, 13, 5, 1, 'rgba(0,0,0,0.18)');
    Pixel.rect(ctx, 1, 1, 10, 12, '#4a2f1c');
    Pixel.rect(ctx, 2, 2, 8, 10, '#a06a3a');
    Pixel.rect(ctx, 2, 2, 2, 10, '#8b5a2b');
    Pixel.rect(ctx, 1, 4, 10, 1, '#5a5a5a'); Pixel.rect(ctx, 1, 9, 10, 1, '#5a5a5a');
    Pixel.ellipse(ctx, 6, 2, 4, 1, '#c08a52');
    return { canvas: c, ox: 6, oy: 13 };
  }

  function renderCrate() {
    const c = Pixel.make(13, 13);
    const ctx = c.getContext('2d');
    Pixel.ellipse(ctx, 6, 12, 6, 1, 'rgba(0,0,0,0.18)');
    Pixel.rect(ctx, 0, 0, 12, 12, '#4a2f1c');
    Pixel.rect(ctx, 1, 1, 10, 10, '#c89a5a');
    Pixel.rect(ctx, 1, 1, 10, 1, '#dcb070'); Pixel.rect(ctx, 1, 5, 10, 1, '#8b5a2b'); Pixel.rect(ctx, 5, 1, 1, 10, '#8b5a2b');
    for (let k = 0; k < 10; k++) Pixel.rect(ctx, 1 + k, 1 + k, 1, 1, '#8b5a2b');
    return { canvas: c, ox: 6, oy: 12 };
  }

  function renderWell() {
    const c = Pixel.make(36, 40);
    const ctx = c.getContext('2d');
    Pixel.ellipse(ctx, 18, 38, 15, 3, 'rgba(0,0,0,0.18)');
    // 돌 우물통
    Pixel.ellipse(ctx, 18, 31, 14, 6, C.stoneDark);
    Pixel.ellipse(ctx, 18, 29, 14, 6, C.stone);
    Pixel.ellipse(ctx, 18, 28, 10, 4, '#2b4a6b');
    Pixel.ellipse(ctx, 18, 28, 7, 3, '#4f8ac9');
    Pixel.rect(ctx, 14, 27, 3, 1, '#9fd0f5');
    // 기둥 + 지붕
    Pixel.rect(ctx, 5, 10, 3, 22, '#8b5a2b'); Pixel.rect(ctx, 28, 10, 3, 22, '#8b5a2b');
    for (let k = 0; k < 8; k++) Pixel.rect(ctx, 2 + k * 2, 8 - k, 32 - k * 4, 1, k % 2 ? '#c94c4c' : '#a83b3b');
    Pixel.rect(ctx, 1, 8, 34, 3, '#7a3030');
    Pixel.rect(ctx, 17, 11, 2, 14, '#5a3a1c');
    Pixel.rect(ctx, 15, 22, 6, 5, '#6a6a6a'); Pixel.rect(ctx, 16, 23, 4, 3, '#8a8a8a');
    return { canvas: c, ox: 18, oy: 38 };
  }

  function renderStall(color) {
    const c = Pixel.make(50, 40);
    const ctx = c.getContext('2d');
    Pixel.ellipse(ctx, 25, 38, 22, 3, 'rgba(0,0,0,0.15)');
    // 기둥
    Pixel.rect(ctx, 2, 10, 3, 26, '#8b5a2b'); Pixel.rect(ctx, 45, 10, 3, 26, '#8b5a2b');
    // 좌판
    Pixel.rect(ctx, 1, 24, 48, 14, '#4a2f1c');
    Pixel.rect(ctx, 2, 25, 46, 12, '#b07a44');
    Pixel.rect(ctx, 2, 25, 46, 2, '#d09a5a');
    // 상품
    const goods = ['#f26a6a', '#f7d35b', '#6fbf73', '#f49ac1', '#8fc9ea', '#ffffff'];
    for (let k = 0; k < 6; k++) { Pixel.rect(ctx, 5 + k * 7, 19, 5, 6, goods[k]); Pixel.rect(ctx, 5 + k * 7, 19, 5, 1, Pixel.shade(goods[k], 0.3)); }
    // 차양 (줄무늬)
    for (let x = 0; x < 50; x += 6) Pixel.rect(ctx, x, 2, 6, 12, (x / 6) % 2 ? '#ffffff' : color);
    Pixel.rect(ctx, 0, 1, 50, 1, Pixel.shade(color, -0.3));
    for (let x = 0; x < 50; x += 6) { Pixel.rect(ctx, x, 14, 6, 2, (x / 6) % 2 ? '#ffffff' : color); Pixel.rect(ctx, x + 2, 16, 2, 1, (x / 6) % 2 ? '#ffffff' : color); }
    Pixel.rect(ctx, 0, 13, 50, 1, Pixel.shade(color, -0.3));
    return { canvas: c, ox: 25, oy: 38 };
  }

  function renderSignPost() {
    const c = Pixel.make(18, 24);
    const ctx = c.getContext('2d');
    Pixel.rect(ctx, 8, 6, 2, 17, '#5a3a1c');
    Pixel.rect(ctx, 1, 4, 14, 6, '#8b5a2b'); Pixel.outline(ctx, 1, 4, 14, 6, '#4a2f1c');
    Pixel.rect(ctx, 15, 6, 2, 2, '#8b5a2b');
    Pixel.rect(ctx, 3, 12, 14, 6, '#8b5a2b'); Pixel.outline(ctx, 3, 12, 14, 6, '#4a2f1c');
    Pixel.rect(ctx, 1, 14, 2, 2, '#8b5a2b');
    return { canvas: c, ox: 9, oy: 23 };
  }

  // ---------- 만국기 (최상단 레이어) ----------
  function renderOverlay() {
    const c = Pixel.make(W, H);
    const ctx = c.getContext('2d');
    for (const b of BUNTING) {
      const x0 = Math.round(b.x0 * TILE), x1 = Math.round(b.x1 * TILE), y = Math.round(b.y * TILE);
      const len = x1 - x0;
      let k = 0;
      for (let x = x0; x < x1; x += 1) {
        const t = (x - x0) / len;
        const sag = Math.round(Math.sin(t * Math.PI) * 6);
        Pixel.rect(ctx, x, y + sag, 1, 1, '#4a3a30');
        if ((x - x0) % 7 === 0 && x + 6 < x1) {
          const col = b.colors[k++ % b.colors.length];
          for (let r = 0; r < 5; r++) Pixel.rect(ctx, x + r, y + sag + 1 + r, 6 - r * 2 + 1, 1, col);
          Pixel.rect(ctx, x, y + sag + 1, 1, 1, Pixel.shade(col, -0.3));
        }
      }
      // 줄 끝 기둥
      Pixel.rect(ctx, x0 - 1, y - 2, 2, 4, '#4a3a30'); Pixel.rect(ctx, x1 - 1, y - 2, 2, 4, '#4a3a30');
    }
    return c;
  }

  // ---------- 조립 ----------
  function build() {
    buildSolid();
    const ground = renderGround();
    const overlay = renderOverlay();
    const objects = [];
    const treeBig = renderTree('big'), treeSmall = renderTree('small');
    const lamp = renderLamp(), barrel = renderBarrel(), crate = renderCrate(), well = renderWell(), signpost = renderSignPost();
    for (const b of BUILDINGS) {
      const r = b.kind === 'gate' ? renderGate(b) : (b.kind === 'temple' ? renderTemple(b) : renderHouse(b));
      const door = doorPoint(b);
      objects.push({
        kind: 'building', ref: b, canvas: r.canvas,
        x: b.x * TILE - r.ox, y: b.y * TILE - r.oy,
        sortY: (b.y + b.h) * TILE, door,
        rect: { x: b.x * TILE, y: b.y * TILE, w: b.w * TILE, h: b.h * TILE },
      });
    }
    for (const p of PROPS) {
      let r;
      if (p.type === 'tree') r = p.size === 'big' ? treeBig : treeSmall;
      else if (p.type === 'lamp') r = lamp;
      else if (p.type === 'barrel') r = barrel;
      else if (p.type === 'crate') r = crate;
      else if (p.type === 'well') r = well;
      else if (p.type === 'stall') r = renderStall(p.color);
      else if (p.type === 'sign') r = signpost;
      const px = Math.round(p.x * TILE), py = Math.round(p.y * TILE);
      objects.push({ kind: 'prop', ref: p, canvas: r.canvas, x: px - r.ox, y: py - r.oy, sortY: py });
    }
    return { ground, overlay, objects };
  }

  // 특정 타일에 해당하는 건물 찾기
  function buildingAtTile(i, j) {
    for (const b of BUILDINGS) if (i >= b.x && i < b.x + b.w && j >= b.y && j < b.y + b.h) return b;
    return null;
  }

  // ---------- 길찾기 (A*, 8방향, 모서리 끼임 방지) ----------
  function findPath(sx, sy, tx, ty) {
    const start = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
    const goal = [Math.floor(tx / TILE), Math.floor(ty / TILE)];
    const g0 = nearestWalkable(goal[0], goal[1]);
    if (!g0) return null;
    const key = (i, j) => j * COLS + i;
    const open = new Map();
    const came = new Map();
    const gScore = new Map();
    const h = (i, j) => Math.max(Math.abs(i - g0[0]), Math.abs(j - g0[1]));
    const sk = key(start[0], start[1]);
    gScore.set(sk, 0);
    open.set(sk, h(start[0], start[1]));
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let iter = 0;
    while (open.size && iter++ < 6000) {
      let bestK = -1, bestF = Infinity;
      for (const [k, f] of open) if (f < bestF) { bestF = f; bestK = k; }
      open.delete(bestK);
      const ci = bestK % COLS, cj = Math.floor(bestK / COLS);
      if (ci === g0[0] && cj === g0[1]) {
        const path = [];
        let k = bestK;
        while (k !== undefined) { path.push({ x: (k % COLS) * TILE + 8, y: Math.floor(k / COLS) * TILE + 8 }); k = came.get(k); }
        path.reverse();
        return path;
      }
      for (const [di, dj] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (isSolidTile(ni, nj)) continue;
        if (di && dj && (isSolidTile(ci + di, cj) || isSolidTile(ci, cj + dj))) continue;
        const nk = key(ni, nj);
        const ng = gScore.get(bestK) + ((di && dj) ? 1.414 : 1);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng); came.set(nk, bestK);
          open.set(nk, ng + h(ni, nj));
        }
      }
    }
    return null;
  }

  function nearestWalkable(i, j) {
    if (!isSolidTile(i, j)) return [i, j];
    for (let r = 1; r <= 6; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (isSolidTile(i + di, j + dj)) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }

  // 직선 통행 가능 여부 (경로 단순화용)
  function lineClear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.ceil(Math.hypot(dx, dy) / 3);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (!canStand(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  return { TILE, COLS, ROWS, W, H, BUILDINGS, PROPS, build, canStand, isSolidTile, findPath, lineClear, doorPoint, buildingAtTile, nearestWalkable };
})();
