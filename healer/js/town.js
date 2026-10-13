// 마을 — 타일 기반 지도 정의, 충돌 격자, 바닥/건물/소품 렌더링(고급 도트, 코드로 생성)
// 스타일: 선명한 클래식 RPG 타일셋. 강한 외곽선(따뜻한 갈색) + 3톤 명암, 광원은 좌상단.
const Town = (() => {
  const TILE = 32;
  const COLS = 24, ROWS = 64;
  const W = COLS * TILE, H = ROWS * TILE;

  // ---------- 지도 정의 (단위: 타일, 중앙 대로 = 9~14열) ----------
  // 건물: x,y,w,h = 발자국(충돌 영역). 문은 아래쪽 중앙. roof: 지붕색, wall: 벽색
  const BUILDINGS = [
    { key: 'tower', name: '탑 입구', kind: 'gate', x: 7, y: 1, w: 10, h: 6 },
    { key: 'temple', name: '신전', kind: 'temple', x: 1, y: 7, w: 7, h: 6, roof: '#cfae6c', wall: '#f6f0e4' },
    { key: 'guild', name: '길드', kind: 'house', x: 16, y: 7, w: 7, h: 6, roof: '#6f7f98', wall: '#efe4cb', banner: '#b8706a', icon: 'shield', gable: true },
    { key: 'adventurer', name: '모험가 사무소', kind: 'house', x: 1, y: 16, w: 7, h: 5, roof: '#b4756c', wall: '#f1e5cb', icon: 'sword', awning: '#c8d8e2' },
    { key: 'engraver', name: '각인사', kind: 'house', x: 17, y: 16, w: 6, h: 5, roof: '#8f7f9f', wall: '#ece1d3', icon: 'rune', gable: true },
    { key: 'smithy', name: '대장간', kind: 'house', x: 1, y: 24, w: 6, h: 5, roof: '#8b8f94', wall: '#dccdb4', chimney: true, icon: 'hammer', shop: true },
    { key: 'bank', name: '은행', kind: 'house', x: 17, y: 24, w: 6, h: 5, roof: '#7e9a8c', wall: '#e8e1d2', stone: true, icon: 'coin', shop: true },
    { key: 'inn', name: '여관', kind: 'house', x: 1, y: 36, w: 8, h: 6, roof: '#c48a66', wall: '#f1e4c8', icon: 'mug', awning: '#d9b48a', awningWide: true },
    { key: 'auction', name: '경매장', kind: 'house', x: 15, y: 36, w: 8, h: 6, roof: '#b4756c', wall: '#efe3c8', banner: '#6f7f98', icon: 'gavel', gable: true },
    { key: 'shop', name: '잡화상', kind: 'house', x: 1, y: 48, w: 6, h: 5, roof: '#6f7f98', wall: '#f1e4c8', icon: 'bag', awning: '#c9a06a', shop: true },
    { key: 'houseA', name: '', kind: 'house', x: 17, y: 48, w: 6, h: 5, roof: '#b4756c', wall: '#efe3c8', gable: true },
    { key: 'houseB', name: '', kind: 'house', x: 2, y: 57, w: 6, h: 5, roof: '#8b8f94', wall: '#f1e4c8' },
    { key: 'houseC', name: '', kind: 'house', x: 16, y: 57, w: 6, h: 5, roof: '#6f7f98', wall: '#efe3c8' },
  ];
  // 성벽 (충돌만, 바닥 레이어에 그림)
  const WALLS = [
    { x: 0, y: 3, w: 7, h: 2 },
    { x: 17, y: 3, w: 7, h: 2 },
  ];
  // 큰 소품(깊이 정렬 대상): type, x,y = 발 기준(타일, 소수 가능)
  const PROPS = [
    { type: 'well', x: 12, y: 32 },
    { type: 'stall', x: 9.5, y: 48, color: '#b8706a' },
    { type: 'stall', x: 14.5, y: 48, color: '#6f9a7a' },
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
    { type: 'lamp', x: 9.7, y: 38 },
    { type: 'lamp', x: 14.3, y: 38 },
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
    { type: 'barrel', x: 1.5, y: 42.4 },
    { type: 'barrel', x: 7.4, y: 42.4 },
    { type: 'crate', x: 16.5, y: 14 },
    { type: 'sign', x: 15.5, y: 8.5 },
    // 추가 소품 — 생동감
    { type: 'bench', x: 10.5, y: 30 },
    { type: 'bench', x: 13.5, y: 30 },
    { type: 'bench', x: 11.5, y: 15.5 },
    { type: 'planter', x: 3.4, y: 21.4 },
    { type: 'planter', x: 5.6, y: 21.4 },
    { type: 'planter', x: 18.4, y: 29.4 },
    { type: 'planter', x: 21.6, y: 29.4 },
    { type: 'planter', x: 2.4, y: 53.4 },
    { type: 'planter', x: 20.4, y: 13.4 },
    { type: 'cratestack', x: 16.5, y: 43.2 },
    { type: 'cratestack', x: 8.3, y: 44.0 },
    { type: 'barrel', x: 20.5, y: 42.6 },
    { type: 'barrel', x: 21.4, y: 43.2 },
    { type: 'clothesline', x: 5, y: 56.4 },
    { type: 'clothesline', x: 19, y: 56.4 },
    { type: 'flowerbed', x: 2.5, y: 14.6 },
    { type: 'flowerbed', x: 21.8, y: 53.6 },
    { type: 'flowerbed', x: 3.2, y: 42.7 },
    { type: 'bucket', x: 10.6, y: 32.6 },
    { type: 'haybale', x: 22.4, y: 22.6 },
    { type: 'haybale', x: 1.6, y: 59.6 },
    { type: 'cart', x: 12.1, y: 47.1 },
    { type: 'board', x: 12.5, y: 26.4 },
    { type: 'crate', x: 11.6, y: 49.6 },
    { type: 'barrel', x: 12.7, y: 49.4 },
    { type: 'planter', x: 10.6, y: 37.5 },
    { type: 'planter', x: 13.4, y: 37.5 },
    // 만국기 줄 끝 기둥(깊이 정렬 대상) — BUNTING 과 좌표를 맞춘다
    { type: 'buntingpole', x: 7.4, y: 21.0 }, { type: 'buntingpole', x: 16.6, y: 21.0 },
    { type: 'buntingpole', x: 6.9, y: 44.4 }, { type: 'buntingpole', x: 17.1, y: 44.4 },
  ];
  // 잔디밭 (fence: 울타리, 울타리가 있으면 통행 불가)
  const GRASS = [
    { x: 1, y: 30, w: 5, h: 4, fence: true, flowers: true },
    { x: 18, y: 30, w: 5, h: 4, fence: true, flowers: true },
    { x: 0, y: 13, w: 3, h: 2, fence: false },
    { x: 21, y: 13, w: 3, h: 2, fence: false },
    { x: 8, y: 11, w: 2, h: 3, fence: false },
    { x: 14, y: 11, w: 2, h: 3, fence: false },
    { x: 9, y: 35, w: 2, h: 2, fence: false },
    { x: 13, y: 35, w: 2, h: 2, fence: false },
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
    { y: 21.0, x0: 7.4, x1: 16.6, colors: ['#d98a7a', '#e3c46a', '#7d94b8', '#ede3cc'] },
    { y: 44.4, x0: 6.9, x1: 17.1, colors: ['#e3c46a', '#d98a7a', '#7d94b8', '#ede3cc'] },
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
  // 좌표(px)의 발 상자(폭 14, 높이 8)가 통행 가능한지
  function canStand(px, py) {
    const hw = 7, top = py - 8, bottom = py;
    const x0 = Math.floor((px - hw) / TILE), x1 = Math.floor((px + hw - 1) / TILE);
    const y0 = Math.floor(top / TILE), y1 = Math.floor((bottom - 1) / TILE);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (isSolidTile(i, j)) return false;
    return true;
  }

  // 소품 발자국 (타일 단위, 발 기준 오프셋)
  const PROP_FOOT = {
    well: { w: 3, h: 2, ox: -1.5, oy: -2 },
    cart: { w: 3, h: 1, ox: -1.5, oy: -1 },
    board: { w: 1, h: 1, ox: -0.5, oy: -1 },
    stall: { w: 4, h: 2, ox: -2, oy: -2 },
    buntingpole: { w: 1, h: 1, ox: -0.5, oy: -1 },
    tree: { w: 1, h: 1, ox: -0.5, oy: -1 },
    barrel: { w: 1, h: 1, ox: -0.5, oy: -1 },
    crate: { w: 1, h: 1, ox: -0.5, oy: -1 },
    bench: { w: 2, h: 1, ox: -1, oy: -1 },
    cratestack: { w: 2, h: 1, ox: -1, oy: -1 },
    flowerbed: { w: 2, h: 1, ox: -1, oy: -1 },
    haybale: { w: 1, h: 1, ox: -0.5, oy: -1 },
    lamp: { w: 1, h: 1, ox: -0.5, oy: -1 },     // 기둥 밑단 타일
    planter: { w: 1, h: 1, ox: -0.5, oy: -1 },
    sign: null, clothesline: null, bucket: null,
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

  // 건물 문 앞 지점(플레이어가 서는 곳)
  function doorPoint(b) {
    return { x: (b.x + b.w / 2) * TILE, y: (b.y + b.h) * TILE + 16 };
  }

  // ---------- 팔레트 & 헬퍼 ----------
  const OL = '#3b2a2a'; // 외곽선(따뜻한 갈색)
  const C = {
    cobble: ['#e8d9c8', '#e2d2bf', '#ecdfcf'],
    cobbleHi: '#f2e9da', grout: '#d3c1ad', groutLo: '#bba791',
    plaza: ['#e8dbc3', '#e2d4b9', '#ecdfca'], plazaHi: '#f4ead7', plazaLo: '#c9b797',
    curb: '#d2c8b4', curbHi: '#e6ddc9', curbLo: '#b3a88f',
    dirt: '#d6bb8f', dirtHi: '#e3cba3', dirtLo: '#bba076',
    grass: '#b7d07a', grassLo: '#97b560', grassHi: '#d1e49c', grassEdge: '#7fa050',
    wood: '#a26a3c', woodHi: '#c78d56', woodLo: '#6f4524',
    stone: '#a7afb7', stoneHi: '#c9d0d6', stoneLo: '#7a838c', stoneOl: '#4a4f58',
    sky: '#b9ddf3', skyLo: '#d6ecf8', mtFar: '#b7c3cf', mt: '#8f9faf', mtLo: '#6e7f91', snow: '#f1f6fa',
    beam: '#7b4f2b', beamHi: '#a06f44', beamLo: '#56351c',
    glass: '#8fc9ea', glassHi: '#cfeaf7', glassLo: '#5f9cc4',
    shadow: 'rgba(40,25,20,0.22)',
  };
  const sh = (hex, a) => Pixel.shade(hex, a);
  const R = (ctx, x, y, w, h, col) => Pixel.rect(ctx, x, y, w, h, col);
  const px = (ctx, x, y, col) => Pixel.rect(ctx, x, y, 1, 1, col);
  // 수평 그라데이션 띠(위→아래, 톤 배열)
  function vbands(ctx, x, y, w, h, cols) {
    const n = cols.length;
    for (let k = 0; k < n; k++) {
      const y0 = y + Math.floor((h * k) / n), y1 = y + Math.floor((h * (k + 1)) / n);
      if (y1 > y0) R(ctx, x, y0, w, y1 - y0, cols[k]);
    }
  }
  // 체커 디더(두 색 경계 섞기)
  function dither(ctx, x, y, w, h, col, phase = 0) {
    for (let j = 0; j < h; j++) for (let i = (j + phase) % 2; i < w; i += 2) px(ctx, x + i, y + j, col);
  }
  // 삼각형(윗꼭지점 중앙) — 원뿔/박공용. 행 단위로 폭이 넓어짐
  function tri(ctx, cx, top, hgt, halfBase, col) {
    for (let k = 0; k < hgt; k++) {
      const hw = Math.round((halfBase * (k + 1)) / hgt);
      R(ctx, cx - hw, top + k, hw * 2 + 1, 1, col);
    }
  }
  // 점선/도트 가로선
  function dots(ctx, x, y, w, step, col, phase = 0) { for (let i = phase; i < w; i += step) px(ctx, x + i, y, col); }
  // 도트맵(문자열 배열) → 캔버스에 그림 (작은 아이콘용)
  function glyph(ctx, rows, pal, x, y) {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i]; if (ch === '.') continue; const col = pal[ch]; if (col) px(ctx, x + i, y + j, col);
    }
  }

  // ---------- 바닥 그리기 ----------
  // 돌블록(성벽·벽 기초·탑 몸통용): 폭(±cw/4)이 조금씩 다른 running-bond 격자, 좌상단 1px 하이라이트, 우하단 1px 줄눈
  function drawBlocks(ctx, x, y, w, h, rnd, cw = 24, ch = 14, pal = C.cobble, hi = C.cobbleHi, grout = C.grout, groutLo = C.groutLo) {
    R(ctx, x, y, w, h, grout);
    const q = Math.max(2, Math.floor(cw / 4));
    for (let yy = y; yy < y + h; yy += ch) {
      const hh = Math.min(ch, y + h - yy);
      let xx = x - Math.floor(rnd() * cw);
      while (xx < x + w) {
        const ww = cw + Math.floor(rnd() * (q * 2 + 1)) - q;
        const sx = Math.max(x, xx), ex = Math.min(x + w, xx + ww - 1); // ex 열은 줄눈
        xx += ww;
        if (ex <= sx) continue;
        const col = pal[Math.floor(rnd() * pal.length)];
        const sw = ex - sx, shh = hh - 1;
        if (sw <= 0 || shh <= 0) continue;
        R(ctx, sx, yy, sw, shh, col);
        R(ctx, sx, yy, sw, 1, hi); R(ctx, sx, yy, 1, shh, hi);
        R(ctx, sx + 1, yy + shh - 1, sw - 1, 1, sh(col, -0.06));
        if (rnd() < 0.1) px(ctx, ex, yy + Math.floor(rnd() * hh), groutLo);
      }
    }
  }

  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  // 판석(바닥용): cw×ch 격자의 각 셀 중심을 흔든 뒤 가장 가까운 중심으로 돌을 정하는 지터 보로노이.
  // → 크기·모양이 제각각인 불규칙 다각형 판석, 1px 줄눈, 세 돌이 만나는 모서리는 둥글게 깎임.
  // 돌마다 3톤 중 하나 + 좌상단 1px 하이라이트 + 우하단 1px 그늘, 마모 점 0.2 확률. ImageData 로 한 번에 찍는다.
  function drawFlagstones(ctx, x, y, w, h, rnd, cw = 32, ch = 22, pal = C.cobble, hi = C.cobbleHi, grout = C.grout, groutLo = C.groutLo) {
    const gx = Math.ceil(w / cw) + 2, gy = Math.ceil(h / ch) + 2;
    const sx = new Float32Array(gx * gy), sy = new Float32Array(gx * gy), tone = new Uint8Array(gx * gy), wear = new Uint8Array(gx * gy);
    const jx = Math.floor(cw * 0.3), jy = Math.floor(ch * 0.3);
    for (let j = 0; j < gy; j++) {
      const rowOff = (j % 2) * (cw / 2) + Math.floor(rnd() * 6) - 3; // 행마다 반 칸 엇갈림 + 흔들림
      for (let i = 0; i < gx; i++) {
        const k = j * gx + i;
        sx[k] = (i - 1) * cw + cw / 2 + rowOff + Math.floor(rnd() * (jx * 2 + 1)) - jx;
        sy[k] = (j - 1) * ch + ch / 2 + Math.floor(rnd() * (jy * 2 + 1)) - jy;
        tone[k] = Math.floor(rnd() * pal.length);
        wear[k] = rnd() < 0.2 ? 1 : 0;
      }
    }
    // 1차: 픽셀마다 돌 id + 줄눈 여부
    const id = new Int32Array(w * h), isGrout = new Uint8Array(w * h);
    for (let py = 0; py < h; py++) {
      const cj = Math.floor(py / ch) + 1;
      for (let pxx = 0; pxx < w; pxx++) {
        const ci = Math.floor(pxx / cw) + 1;
        let d1 = 1e9, d2 = 1e9, d3 = 1e9, best = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= gx || j >= gy) continue;
          const k = j * gx + i, ddx = pxx - sx[k], ddy = (py - sy[k]) * (cw / ch);
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < d1) { d3 = d2; d2 = d1; d1 = d; best = k; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) d3 = d;
        }
        const o = py * w + pxx;
        id[o] = best;
        if (d2 - d1 < 1.1 || d3 - d1 < 2.6) isGrout[o] = 1; // 줄눈 1px + 모서리 둥글게
      }
    }
    // 2차: 색 결정
    const img = ctx.createImageData(w, h), data = img.data;
    const palRgb = pal.map(hexRgb), hiRgb = hexRgb(hi), grRgb = hexRgb(grout), grLo = hexRgb(groutLo);
    const shRgb = palRgb.map(([r, g, b]) => [Math.round(r * 0.94), Math.round(g * 0.94), Math.round(b * 0.94)]);
    const wearRgb = palRgb.map(([r, g, b]) => [Math.round(r * 0.9), Math.round(g * 0.9), Math.round(b * 0.9)]);
    for (let py = 0; py < h; py++) for (let pxx = 0; pxx < w; pxx++) {
      const o = py * w + pxx, k = id[o];
      let c;
      if (isGrout[o]) c = ((pxx * 7 + py * 13) % 11 === 0) ? grLo : grRgb;
      else {
        const t = tone[k];
        const up = py > 0 ? isGrout[o - w] : 1, left = pxx > 0 ? isGrout[o - 1] : 1;
        const down = py < h - 1 ? isGrout[o + w] : 1, right = pxx < w - 1 ? isGrout[o + 1] : 1;
        if (up || left) c = hiRgb;
        else if (down || right) c = shRgb[t];
        else if (wear[k] && Math.abs(pxx - sx[k] - 3) < 1 && Math.abs(py - sy[k] + 2) < 0.6) c = wearRgb[t];
        else c = palRgb[t];
      }
      data[o * 4] = c[0]; data[o * 4 + 1] = c[1]; data[o * 4 + 2] = c[2]; data[o * 4 + 3] = 255;
    }
    ctx.putImageData(img, x, y);
  }

  // 타원 테두리(두께 1~2px) — 광장 방사 무늬용
  function ellipseRing(ctx, cx, cy, rx, ry, col, thick = 1) {
    let prev = null;
    for (let dy = -ry; dy <= ry; dy++) {
      const t = dy / ry;
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      if (prev === null) prev = dx;
      const a = Math.min(prev, dx), b = Math.max(prev, dx);
      R(ctx, cx - b, cy + dy, b - a + thick, 1, col);
      R(ctx, cx + a - thick + 1, cy + dy, b - a + thick, 1, col);
      prev = dx;
    }
  }

  function drawPlaza(ctx, rnd) {
    const x = PLAZA.x * TILE, y = PLAZA.y * TILE, w = PLAZA.w * TILE, h = PLAZA.h * TILE;
    drawFlagstones(ctx, x, y, w, h, rnd, 40, 28, C.plaza, C.plazaHi, '#cbbda6', sh('#cbbda6', -0.12));
    // 연석(테두리) — 바깥 어두운 선 + 안쪽 밝은 선
    Pixel.outline(ctx, x - 1, y - 1, w + 2, h + 2, C.plazaLo);
    Pixel.outline(ctx, x - 2, y - 2, w + 4, h + 4, sh(C.plazaLo, 0.25));
    // 우물 중심의 동심 연석 링 3개(2px, 위쪽 1px 하이라이트) — 안쪽은 보통 판석
    const cx = (PLAZA.x + PLAZA.w / 2) * TILE, cy = (PLAZA.y + PLAZA.h / 2) * TILE + 24, K = 0.6;
    for (const rr of [60, 108, 150]) {
      ellipseRing(ctx, cx, cy, rr, Math.round(rr * K), '#cbbda6', 2);
      ellipseRing(ctx, cx, cy - 1, rr, Math.round(rr * K), '#f0e6d4', 1);
      ellipseRing(ctx, cx, cy, rr, Math.round(rr * K), '#cbbda6', 2);
    }
    // 우물 발 밑 원판: 밝은 단색 + 1px 링
    const R0 = 38;
    Pixel.ellipse(ctx, cx, cy, R0, Math.round(R0 * K), '#baa88c');
    Pixel.ellipse(ctx, cx, cy, R0 - 1, Math.round(R0 * K) - 1, '#ece2cd');
    Pixel.ellipse(ctx, cx - 1, cy - 1, R0 - 4, Math.round(R0 * K) - 3, '#f4ecda');
  }

  function drawMarket(ctx, rnd) {
    const x = MARKET.x * TILE, y = MARKET.y * TILE, w = MARKET.w * TILE, h = MARKET.h * TILE;
    R(ctx, x, y, w, h, C.dirt);
    // 밝은/어두운 얼룩
    for (let i = 0; i < 26; i++) {
      const ex = x + 10 + Math.floor(rnd() * (w - 20)), ey = y + 6 + Math.floor(rnd() * (h - 12));
      Pixel.ellipse(ctx, ex, ey, 6 + Math.floor(rnd() * 10), 2 + Math.floor(rnd() * 3), rnd() < 0.5 ? C.dirtHi : sh(C.dirt, -0.06));
    }
    // 자갈·흙 알갱이
    for (let i = 0; i < 160; i++) {
      const pxx = x + 1 + Math.floor(rnd() * (w - 2)), pyy = y + 1 + Math.floor(rnd() * (h - 2));
      px(ctx, pxx, pyy, rnd() < 0.5 ? C.dirtLo : C.dirtHi);
      if (rnd() < 0.3) px(ctx, pxx + 1, pyy, C.dirtLo);
    }
    // 바큇자국 두 줄
    for (const ty of [y + 40, y + 46]) for (let xx = x + 20; xx < x + w - 20; xx += 2) px(ctx, xx, ty + ((xx >> 4) & 1), C.dirtLo);
    // 경계: 흙이 포석 위로 번진 울퉁불퉁한 테두리
    for (let xx = x; xx < x + w; xx += 6) { const b = Math.floor(rnd() * 3); R(ctx, xx, y - b, 6, b + 1, C.dirt); R(ctx, xx, y - b - 1, 6, 1, C.dirtLo); R(ctx, xx, y + h - 1, 6, b + 1, C.dirt); R(ctx, xx, y + h + b, 6, 1, C.dirtLo); }
    for (let yy = y; yy < y + h; yy += 6) { const b = Math.floor(rnd() * 3); R(ctx, x - b, yy, b + 1, 6, C.dirt); R(ctx, x - b - 1, yy, 1, 6, C.dirtLo); R(ctx, x + w - 1, yy, b + 1, 6, C.dirt); R(ctx, x + w + b, yy, 1, 6, C.dirtLo); }
  }

  function drawGrass(ctx, g, rnd) {
    const x = g.x * TILE, y = g.y * TILE, w = g.w * TILE, h = g.h * TILE;
    // 임시 캔버스에 그린 뒤 모서리(3,2,1 계단)를 지워 둥글게 → 바닥에 합성
    const M = 4, tc = Pixel.make(w + M * 2, h + M * 2), t = tc.getContext('2d');
    const X = M, Y = M;
    // 연석 2px 돌 + 바깥 1px 외곽선(우/하만)
    R(t, X - 2, Y - 2, w + 4, h + 4, C.curb);
    R(t, X - 2, Y - 2, w + 4, 1, C.curbHi); R(t, X - 2, Y - 2, 1, h + 4, C.curbHi);
    R(t, X - 2, Y + h + 1, w + 4, 1, C.curbLo); R(t, X + w + 1, Y - 2, 1, h + 4, C.curbLo);
    R(t, X - 2, Y + h + 2, w + 5, 1, sh(C.curbLo, -0.25)); R(t, X + w + 2, Y - 2, 1, h + 5, sh(C.curbLo, -0.25));
    R(t, X, Y, w, h, C.grass);
    // 밝은 풀 얼룩
    for (let i = 0; i < (w * h) / 900; i++) {
      const ex = X + 8 + Math.floor(rnd() * (w - 16)), ey = Y + 6 + Math.floor(rnd() * (h - 12));
      Pixel.ellipse(t, ex, ey, 5 + Math.floor(rnd() * 8), 2 + Math.floor(rnd() * 3), C.grassHi);
    }
    // 풀 뭉치(V자) — 어두운/밝은
    for (let i = 0; i < (w * h) / 110; i++) {
      const pxx = X + 2 + Math.floor(rnd() * (w - 6)), pyy = Y + 2 + Math.floor(rnd() * (h - 6));
      const col = rnd() < 0.55 ? C.grassLo : C.grassHi;
      px(t, pxx, pyy, col); px(t, pxx + 2, pyy, col); px(t, pxx + 1, pyy + 1, col);
      if (rnd() < 0.5) px(t, pxx + 1, pyy - 1, col);
    }
    // 안쪽 우/하 2px 어두운 띠, 상/좌 1px 밝은 선
    R(t, X, Y + h - 2, w, 2, '#9fbd66'); R(t, X + w - 2, Y, 2, h, '#9fbd66'); R(t, X, Y, w, 1, '#d1e49c'); R(t, X, Y, 1, h, '#d1e49c');
    if (g.flowers) {
      const cols = ['#f06a6a', '#f7d35b', '#ffffff', '#f49ac1', '#8ab7f0'];
      for (let i = 0; i < (w * h) / 260; i++) {
        const pxx = X + 3 + Math.floor(rnd() * (w - 8)), pyy = Y + 3 + Math.floor(rnd() * (h - 8));
        const col = cols[Math.floor(rnd() * cols.length)];
        px(t, pxx, pyy - 1, col); px(t, pxx - 1, pyy, col); px(t, pxx + 1, pyy, col); px(t, pxx, pyy + 1, col);
        px(t, pxx, pyy, sh(col, -0.35)); px(t, pxx, pyy + 2, C.grassLo);
      }
    }
    // 모서리 깎기(연석 포함): 3,2,1 계단
    for (let k = 0; k < 3; k++) {
      const n = 3 - k;
      t.clearRect(X - 2, Y - 2 + k, n, 1); t.clearRect(X + w + 2 - n, Y - 2 + k, n, 1);
      t.clearRect(X - 2, Y + h + 1 - k, n, 1); t.clearRect(X + w + 2 - n, Y + h + 1 - k, n, 1);
    }
    ctx.drawImage(tc, x - M, y - M);
    // 가장자리 바깥 풀 뭉치(3px V) — 변마다 10~14개
    const tuft = (tx, ty) => { px(ctx, tx, ty, '#97b560'); px(ctx, tx + 2, ty, '#97b560'); px(ctx, tx + 1, ty + 1, '#97b560'); };
    const nT = 10 + Math.floor(rnd() * 5);
    for (let i = 0; i < nT; i++) { tuft(x + 2 + Math.floor(rnd() * (w - 6)), y - 5 - Math.floor(rnd() * 2)); tuft(x + 2 + Math.floor(rnd() * (w - 6)), y + h + 3 + Math.floor(rnd() * 2)); }
    for (let i = 0; i < Math.max(3, nT * h / w); i++) { tuft(x - 6 - Math.floor(rnd() * 2), y + 2 + Math.floor(rnd() * (h - 6))); tuft(x + w + 3 + Math.floor(rnd() * 2), y + 2 + Math.floor(rnd() * (h - 6))); }
    if (g.fence) drawFence(ctx, x, y, w, h);
  }

  // 울타리: 4px 기둥 + 2단 가로대, 뒤쪽(상단)은 낮게, 앞쪽(하단)은 전체
  function drawFence(ctx, x, y, w, h) {
    const post = (pxx, pyy, hgt) => {
      R(ctx, pxx - 1, pyy - 1, 6, hgt + 2, OL);
      R(ctx, pxx, pyy, 4, hgt, C.wood); R(ctx, pxx, pyy, 1, hgt, C.woodHi); R(ctx, pxx + 3, pyy, 1, hgt, C.woodLo);
      R(ctx, pxx, pyy, 4, 1, C.woodHi);
    };
    const railH = (x0, y0, len) => { R(ctx, x0, y0 - 1, len, 5, OL); R(ctx, x0, y0, len, 3, C.wood); R(ctx, x0, y0, len, 1, C.woodHi); R(ctx, x0, y0 + 2, len, 1, C.woodLo); };
    const railV = (x0, y0, len) => { R(ctx, x0 - 1, y0, 4, len, OL); R(ctx, x0, y0, 2, len, C.wood); R(ctx, x0, y0, 1, len, C.woodHi); };
    // 뒤쪽 가로대 + 기둥
    railH(x + 2, y - 8, w - 4); railH(x + 2, y - 2, w - 4);
    for (let pxx = x + 2; pxx < x + w - 4; pxx += 16) post(pxx, y - 14, 16);
    post(x + w - 6, y - 14, 16);
    // 좌우 세로 가로대 + 기둥
    railV(x + 3, y, h - 10); railV(x + w - 5, y, h - 10);
    for (let pyy = y; pyy < y + h - 8; pyy += 16) { post(x + 2, pyy - 2, 16); post(x + w - 6, pyy - 2, 16); }
    // 앞쪽
    railH(x + 2, y + h - 12, w - 4); railH(x + 2, y + h - 5, w - 4);
    for (let pxx = x + 2; pxx < x + w - 4; pxx += 16) post(pxx, y + h - 18, 18);
    post(x + w - 6, y + h - 18, 18);
  }

  // 성벽: 윗면 통로 + 총안 + 앞면 돌블록
  function drawWall(ctx, wl, rnd) {
    const x = wl.x * TILE, y = wl.y * TILE, w = wl.w * TILE, h = wl.h * TILE;
    // 총안(흉벽) — 뒤
    for (let pxx = x + 2; pxx < x + w; pxx += 20) {
      R(ctx, pxx - 1, y - 13, 14, 14, C.stoneOl);
      R(ctx, pxx, y - 12, 12, 12, C.stone); R(ctx, pxx, y - 12, 12, 2, C.stoneHi); R(ctx, pxx, y - 12, 2, 12, C.stoneHi); R(ctx, pxx + 10, y - 10, 2, 10, C.stoneLo);
    }
    // 윗면(통로)
    R(ctx, x, y, w, 22, C.stoneHi);
    for (let xx = x; xx < x + w; xx += 16) { R(ctx, xx, y + 1, 1, 20, sh(C.stoneHi, -0.12)); }
    for (let yy = y + 7; yy < y + 22; yy += 7) R(ctx, x, yy, w, 1, sh(C.stoneHi, -0.12));
    R(ctx, x, y, w, 1, C.stoneOl); R(ctx, x, y + 21, w, 1, C.stoneOl);
    // 앞면 돌블록
    drawBlocks(ctx, x, y + 22, w, h - 22, rnd, 20, 10, [C.stone, sh(C.stone, -0.07), sh(C.stone, 0.06)], C.stoneHi, C.stoneLo, C.stoneOl);
    R(ctx, x, y + 22, w, 2, 'rgba(0,0,0,0.18)');
    R(ctx, x, y + h - 1, w, 1, C.stoneOl);
    R(ctx, x, y + h, w, 3, C.shadow);
    // 벽 끝 외곽선
    if (x > 0) R(ctx, x - 1, y - 2, 1, h + 2, C.stoneOl);
    if (x + w < W) R(ctx, x + w, y - 2, 1, h + 2, C.stoneOl);
  }

  function drawMountains(ctx, rnd) {
    // 하늘
    vbands(ctx, 0, 0, W, 96, ['#a9d3ef', C.sky, '#c8e5f6', C.skyLo]);
    // 구름
    const cloud = (cx, cy, r) => {
      Pixel.ellipse(ctx, cx, cy + 1, r + 6, Math.round(r * 0.55) + 1, '#9bc3dc');
      Pixel.ellipse(ctx, cx, cy, r + 6, Math.round(r * 0.55), '#ffffff');
      Pixel.circle(ctx, cx - Math.round(r * 0.5), cy - 2, Math.round(r * 0.5), '#ffffff');
      Pixel.circle(ctx, cx + Math.round(r * 0.3), cy - 4, Math.round(r * 0.6), '#ffffff');
      Pixel.ellipse(ctx, cx + 2, cy + Math.round(r * 0.35), r + 2, 2, '#dcebf5');
    };
    cloud(90, 22, 14); cloud(330, 14, 10); cloud(600, 26, 16); cloud(720, 12, 8);
    // 먼 산(밝음)
    for (let i = -1; i < 7; i++) {
      const cx = i * 128 + 40 + Math.floor(rnd() * 30), top = 18 + Math.floor(rnd() * 14);
      tri(ctx, cx, top, 96 - top, Math.floor((96 - top) * 1.5), C.mtFar);
    }
    // 가까운 산(3톤 + 설산)
    for (let i = -1; i < 9; i++) {
      const cx = i * 100 + 30 + Math.floor(rnd() * 24), top = 34 + Math.floor(rnd() * 16), hgt = 96 - top;
      const half = Math.floor(hgt * 1.3);
      tri(ctx, cx, top, hgt, half, C.mt);
      // 우측 그늘면
      for (let k = 0; k < hgt; k++) { const hw = Math.round((half * (k + 1)) / hgt); R(ctx, cx + 1, top + k, hw, 1, C.mtLo); }
      // 설산 (지그재그 끝)
      const snowH = 9;
      tri(ctx, cx, top, snowH, Math.floor((half * snowH) / hgt), C.snow);
      for (let k = 0; k < 3; k++) px(ctx, cx - 3 + k * 3, top + snowH + (k % 2), C.snow);
      px(ctx, cx, top - 1, C.snow);
    }
    // 먼 도시의 첨탑 실루엣(성문 좌우, 산보다 한 톤 어둡게, 꼭대기 1px 밝은 점)
    const spire = (sx, sw, hgt) => {
      const col = '#9aa4b4', lo = '#7f8a9a', hi = '#b4bdca', hw = Math.floor(sw / 2);
      R(ctx, sx, 96 - hgt, sw, hgt, col); R(ctx, sx, 96 - hgt, 2, hgt, hi); R(ctx, sx + sw - 2, 96 - hgt, 2, hgt, lo);
      tri(ctx, sx + hw, 96 - hgt - hw - 4, hw + 4, hw + 1, lo);
      px(ctx, sx + hw, 96 - hgt - hw - 5, '#f1f6fa');
      R(ctx, sx + hw, 96 - hgt + 5, 1, 3, lo);
    };
    spire(100, 10, 28); spire(132, 6, 20); spire(640, 10, 30); spire(672, 6, 22); spire(60, 8, 16); spire(708, 8, 18);
    // 산 아래 숲(침엽수 실루엣)
    for (let xx = -6; xx < W + 6; xx += 10) {
      const hgt = 14 + Math.floor(rnd() * 10);
      tri(ctx, xx, 96 - hgt, hgt, 5, '#3e6b3f');
      tri(ctx, xx - 1, 96 - hgt, hgt, 3, '#4f8a4c');
    }
    R(ctx, 0, 92, W, 4, '#2f5232');
    R(ctx, 0, 95, W, 1, OL);
  }

  // 경계 돌담: 성벽과 같은 stone 팔레트의 낮은 돌담(바깥 20px) + 안쪽 12px 잔디 띠. 좌/우 열은 세로, 하단 행은 가로
  function drawBoundaryWall(ctx, x, y, w, h, side, rnd) {
    const pal = [C.stone, sh(C.stone, -0.07), sh(C.stone, 0.06)];
    const tuft = (tx, ty) => { const col = rnd() < 0.5 ? C.grassLo : C.grassHi; px(ctx, tx, ty, col); px(ctx, tx + 2, ty, col); px(ctx, tx + 1, ty + 1, col); };
    if (side === 'bottom') {
      // 윗면(캡) 8px + 앞면 돌블록
      R(ctx, x, y, w, h, C.stoneOl);
      drawBlocks(ctx, x, y + 8, w, h - 9, rnd, 20, 10, pal, C.stoneHi, C.stoneLo, C.stoneOl);
      R(ctx, x, y, w, 8, C.stoneHi); R(ctx, x, y, w, 1, C.stoneOl); R(ctx, x, y + 7, w, 1, sh(C.stoneHi, -0.12)); R(ctx, x, y + 8, w, 1, C.stoneOl);
      for (let xx = x + 10; xx < x + w; xx += 20) R(ctx, xx, y + 1, 1, 6, sh(C.stoneHi, -0.12));
      // 담 앞(위쪽) 잔디 띠 + 그림자
      R(ctx, x, y - 12, w, 12, C.grass); R(ctx, x, y - 12, w, 1, C.grassHi); R(ctx, x, y - 1, w, 1, C.grassLo);
      for (let i = 0; i < w / 6; i++) tuft(x + Math.floor(rnd() * (w - 3)), y - 11 + Math.floor(rnd() * 9));
      R(ctx, x, y - 3, w, 3, 'rgba(40,25,20,0.12)');
      return;
    }
    // 세로 열: 바깥 20px 돌담(윗면), 안쪽 12px 잔디
    const wx = side === 'left' ? x : x + w - 20, gxx = side === 'left' ? x + 20 : x;
    R(ctx, wx, y, 20, h, C.stoneOl);
    drawBlocks(ctx, wx + 1, y, 18, h, rnd, 10, 10, pal, C.stoneHi, C.stoneLo, C.stoneOl);
    R(ctx, wx, y, 1, h, side === 'left' ? C.stoneHi : C.stoneOl); R(ctx, wx + 19, y, 1, h, side === 'left' ? C.stoneOl : C.stoneHi);
    R(ctx, gxx, y, 12, h, C.grass); R(ctx, gxx, y, 1, h, C.grassHi); R(ctx, gxx + 11, y, 1, h, C.grassLo);
    for (let i = 0; i < h / 6; i++) tuft(gxx + 1 + Math.floor(rnd() * 8), y + Math.floor(rnd() * (h - 3)));
    if (side === 'left') R(ctx, x + 20, y, 3, h, 'rgba(40,25,20,0.12)');
    // 꽃(1px 꽃색 + 위 1px 밝은색) 잔디 위에만
    for (let i = 0; i < h / 40; i++) { const col = ['#e05a5a', '#f2d35b', '#f4f4f4'][Math.floor(rnd() * 3)]; const fx = gxx + 2 + Math.floor(rnd() * 8), fy = y + 2 + Math.floor(rnd() * (h - 4)); px(ctx, fx, fy, col); px(ctx, fx, fy - 1, sh(col, 0.4)); }
  }

  function drawDrain(ctx, cx, cy) {
    Pixel.ellipse(ctx, cx, cy + 1, 9, 5, C.groutLo);
    Pixel.ellipse(ctx, cx, cy, 9, 5, C.stoneLo);
    Pixel.ellipse(ctx, cx, cy, 7, 4, C.stone);
    for (let k = -1; k <= 1; k++) R(ctx, cx - 5, cy + k * 2, 11, 1, C.stoneOl);
  }

  function renderGround() {
    const c = Pixel.make(W, H);
    const ctx = c.getContext('2d');
    const rnd = Pixel.rng(7);
    drawFlagstones(ctx, 0, 0, W, H, rnd, 32, 22);
    // 포석 위 은은한 색 얼룩(마모·햇빛) — 격자의 단조로움을 깸
    for (let i = 0; i < 70; i++) {
      const ex = Math.floor(rnd() * W), ey = 120 + Math.floor(rnd() * (H - 160));
      Pixel.ellipse(ctx, ex, ey, 14 + Math.floor(rnd() * 26), 5 + Math.floor(rnd() * 9), rnd() < 0.5 ? 'rgba(255,250,235,0.16)' : 'rgba(120,90,60,0.07)');
    }
    drawPlaza(ctx, rnd);
    drawMarket(ctx, rnd);
    for (const g of GRASS) drawGrass(ctx, g, rnd);
    // 맵 가장자리 돌담(좌/우 열, 하단 행)
    drawBoundaryWall(ctx, 0, 5 * TILE, TILE, H - 5 * TILE, 'left', rnd);
    drawBoundaryWall(ctx, W - TILE, 5 * TILE, TILE, H - 5 * TILE, 'right', rnd);
    drawBoundaryWall(ctx, 0, H - TILE, W, TILE, 'bottom', rnd);
    drawMountains(ctx, rnd);
    for (const w of WALLS) drawWall(ctx, w, rnd);
    for (const [mx, my] of [[10, 18], [13, 41], [11, 52], [12, 9]]) drawDrain(ctx, mx * TILE + 16, my * TILE + 16);
    return c;
  }

  // ---------- 건물 부품 ----------
  const ICONS = {
    shield: ['.kkkkkk.', 'kwwwrrwk', 'kwwwrrwk', 'kwrrrrwk', 'kwwwrrwk', '.kwwrrk.', '..kwwk..', '...kk...'],
    sword: ['......kk', '.....ksk', '....ksk.', '...ksk..', 'kk.ksk..', '.kksk...', '.kbbk...', 'kk..k...'],
    rune: ['..kkkk..', '.kggggk.', 'kgkggkgk', 'kggkkggk', 'kggkkggk', 'kgkggkgk', '.kggggk.', '..kkkk..'],
    hammer: ['kkkkk...', 'kssskk..', 'kssssk..', 'kkkkkbk.', '...kbbk.', '....kbk.', '....kbk.', '.....k..'],
    coin: ['..kkkk..', '.kggggk.', 'kggkkggk', 'kggkgggk', 'kggkgggk', 'kggkkggk', '.kggggk.', '..kkkk..'],
    mug: ['.kkkkk..', '.kwwwkk.', '.kggggkk', '.kggggkk', '.kggggkk', '.kggggkk', '.kkkkkk.', '........'],
    gavel: ['kkkk....', 'kbbbkk..', 'kbbbbbk.', 'kkkkkbk.', '...kbbk.', '..kbbk..', '.kbbk...', 'kkkk....'],
    bag: ['...kk...', '..kbbk..', '.kbbbbk.', 'kbbbbbbk', 'kbggggbk', 'kbbbbbbk', '.kbbbbk.', '..kkkk..'],
    cross: ['...kk...', '..kggk..', 'kkkggkkk', 'kggggggk', 'kkkggkkk', '..kggk..', '..kggk..', '..kkkk..'],
  };
  const ICON_PAL = { k: OL, w: '#f4efe4', g: '#f0c64a', b: '#8a5a32', r: '#c24a46', s: '#b9c6d2' };

  // 창문: 틀 + 유리(3톤, 사선 하이라이트) + 덧문 + 창턱 + 화분
  function drawWindow(ctx, x, y, w = 16, h = 18, opts = {}) {
    const frame = '#6a4a2e';
    const sc = opts.shutter;
    if (sc) {
      for (const sx of [x - 6, x + w + 1]) {
        R(ctx, sx - 1, y - 1, 7, h + 2, OL);
        R(ctx, sx, y, 5, h, sc); R(ctx, sx, y, 1, h, sh(sc, 0.25));
        for (let yy = y + 3; yy < y + h - 2; yy += 4) R(ctx, sx + 1, yy, 3, 1, sh(sc, -0.3));
      }
    }
    R(ctx, x - 1, y - 1, w + 2, h + 2, OL);
    R(ctx, x, y, w, h, frame);
    R(ctx, x, y, w, 1, sh(frame, 0.3)); R(ctx, x, y, 1, h, sh(frame, 0.3));
    const gx = x + 2, gy = y + 2, gw = w - 4, gh = h - 4;
    R(ctx, gx, gy, gw, gh, C.glassLo);
    R(ctx, gx, gy, gw, Math.floor(gh * 0.6), C.glass);
    // 사선 하이라이트
    for (let k = 0; k < gh; k++) { const xx = gx + gw - 3 - k; if (xx >= gx && xx + 2 <= gx + gw) R(ctx, xx, gy + k, 2, 1, C.glassHi); }
    R(ctx, gx, gy, 2, 2, C.glassHi);
    // 창살
    R(ctx, gx + Math.floor(gw / 2), gy, 1, gh, frame); R(ctx, gx, gy + Math.floor(gh / 2), gw, 1, frame);
    // 창턱
    R(ctx, x - 2, y + h, w + 4, 3, OL); R(ctx, x - 1, y + h, w + 2, 2, C.woodHi); R(ctx, x - 1, y + h + 1, w + 2, 1, C.wood);
    if (opts.flowers !== false) {
      // 화분 + 꽃
      const bx = x - 1, by = y + h + 3;
      R(ctx, bx - 1, by - 1, w + 4, 6, OL); R(ctx, bx, by, w + 2, 4, C.wood); R(ctx, bx, by, w + 2, 1, C.woodHi); R(ctx, bx, by + 3, w + 2, 1, C.woodLo);
      const cols = ['#f06a6a', '#f7d35b', '#f49ac1', '#ffffff'];
      for (let k = 0; k < Math.floor((w + 2) / 5); k++) {
        const fx = bx + 1 + k * 5;
        R(ctx, fx, by - 2, 4, 2, '#5f9a3e'); px(ctx, fx + 1, by - 3, '#7fbf55');
        R(ctx, fx + 1, by - 4, 2, 2, cols[(k + Math.floor(x / 7)) % cols.length]);
      }
    }
  }

  // 아치문: 폭 21(홀수), 높이 h(최소 36). 계단은 호출측에서 그림
  function drawDoor(ctx, x, y, w = 21, h = 40, opts = {}) {
    const r = Math.floor(w / 2), cx = x + r;
    const frame = opts.frame || '#8d8378';
    // 외곽선 아치
    Pixel.circle(ctx, cx, y + r, r + 1, OL); R(ctx, x - 1, y + r, w + 2, h - r, OL);
    // 돌 문틀
    Pixel.circle(ctx, cx, y + r, r, frame); R(ctx, x, y + r, w, h - r, frame);
    Pixel.circle(ctx, cx, y + r, r, frame);
    R(ctx, x, y + r, 1, h - r, sh(frame, 0.25)); // 좌측 밝음
    // 문짝(판자): 아치 안쪽은 원 판정으로 세로 판자선
    const ix = x + 2, iw = w - 4;
    Pixel.circle(ctx, cx, y + r, r - 2, C.wood); R(ctx, ix, y + r, iw, h - r - 1, C.wood);
    for (let xx = ix + 3; xx < ix + iw; xx += 4) {
      R(ctx, xx, y + r, 1, h - r - 1, C.woodLo); R(ctx, xx + 1, y + r, 1, h - r - 1, C.woodHi);
      for (let yy = y + 2; yy < y + r; yy++) { const dx = xx - cx, dy = yy - (y + r); if (dx * dx + dy * dy <= (r - 2) * (r - 2)) px(ctx, xx, yy, C.woodLo); }
    }
    // 상단 하이라이트 & 쇠띠
    for (let k = 0; k < 3; k++) px(ctx, ix + 1 + k, y + r - 4 - k, C.woodHi);
    R(ctx, ix, y + r + 4, iw, 2, '#5c6670'); R(ctx, ix, y + h - 10, iw, 2, '#5c6670');
    dots(ctx, ix, y + r + 4, iw, 4, '#9aa4ad', 1); dots(ctx, ix, y + h - 10, iw, 4, '#9aa4ad', 1);
    // 작은 창(격자)
    R(ctx, cx - 3, y + 4, 7, 6, OL); R(ctx, cx - 2, y + 5, 5, 4, C.glass); px(ctx, cx - 2, y + 5, C.glassHi); R(ctx, cx, y + 5, 1, 4, OL);
    // 손잡이
    R(ctx, x + w - 6, y + Math.floor(h * 0.55), 2, 3, '#f0c64a'); px(ctx, x + w - 6, y + Math.floor(h * 0.55), '#fff1b0');
  }

  // 벽걸이 등불(문 옆)
  function drawWallLantern(ctx, x, y) {
    Pixel.ellipse(ctx, x + 3, y + 7, 7, 8, 'rgba(255,220,120,0.14)');
    R(ctx, x + 2, y - 3, 2, 3, OL); R(ctx, x - 1, y - 4, 8, 1, OL);
    R(ctx, x, y, 6, 9, OL); R(ctx, x + 1, y + 1, 4, 7, '#f7d35b'); R(ctx, x + 1, y + 1, 2, 3, '#fff6c2'); R(ctx, x + 4, y + 1, 1, 7, '#e9b53a');
    R(ctx, x - 1, y + 9, 8, 1, OL); px(ctx, x + 2, y + 10, OL);
  }

  // 계단(문 아래): 2단, 폭은 문보다 넓게
  function drawSteps(ctx, cx, y, w) {
    R(ctx, cx - Math.floor(w / 2) - 1, y - 1, w + 2, 6, OL);
    R(ctx, cx - Math.floor(w / 2), y, w, 2, '#d6cdbb'); R(ctx, cx - Math.floor(w / 2), y + 2, w, 1, '#a8a092');
    R(ctx, cx - Math.floor(w / 2) - 3, y + 3, w + 6, 1, OL);
    R(ctx, cx - Math.floor(w / 2) - 2, y + 3, w + 4, 1, '#cfc6b3'); R(ctx, cx - Math.floor(w / 2) - 2, y + 4, w + 4, 1, '#a8a092');
  }

  // 간판: 걸린 판자 + 아이콘, 체인 2줄
  function drawSignBoard(ctx, cx, y, icon, chainTop) {
    const w = 40, h = 16, x = cx - 20;
    if (chainTop !== undefined) for (const ex of [x + 5, x + w - 6]) for (let yy = chainTop; yy < y; yy += 2) px(ctx, ex, yy, OL);
    R(ctx, x - 1, y - 1, w + 2, h + 2, OL);
    R(ctx, x, y, w, h, C.wood); R(ctx, x, y, w, 1, C.woodHi); R(ctx, x, y, 1, h, C.woodHi); R(ctx, x, y + h - 1, w, 1, C.woodLo); R(ctx, x + w - 1, y, 1, h, C.woodLo);
    for (let yy = y + 4; yy < y + h - 2; yy += 5) R(ctx, x + 2, yy, w - 4, 1, sh(C.wood, -0.12));
    R(ctx, x + 1, y + 1, 1, 1, '#d9b57a'); R(ctx, x + w - 2, y + 1, 1, 1, '#d9b57a');
    if (icon && ICONS[icon]) {
      R(ctx, cx - 6, y + 3, 12, 10, sh(C.wood, 0.3)); Pixel.outline(ctx, cx - 6, y + 3, 12, 10, C.woodLo);
      glyph(ctx, ICONS[icon], ICON_PAL, cx - 4, y + 4);
    } else {
      R(ctx, x + 6, y + 5, w - 12, 2, C.woodLo); R(ctx, x + 10, y + 9, w - 20, 2, C.woodLo);
    }
  }

  // 지붕: 좁은 뒷면 띠 + 용마루 캡 + 앞면(용마루→처마 3단 그라데이션, 세로 이음선 16px) + 우측 hip 띠 + 처마. 수평 기와줄 없음
  const ROOF_BACK = 6;
  function drawRoof(ctx, x, y, w, h, color, opts = {}) {
    const back = ROOF_BACK;
    const dark = sh(color, -0.32), mid = sh(color, -0.12), light = sh(color, 0.16), lighter = sh(color, 0.3);
    // 뒷면(단색, 얇게)
    R(ctx, x, y, w, back, sh(color, -0.22));
    R(ctx, x, y, w, 1, OL);
    // 용마루 캡
    const ry = y + back;
    R(ctx, x - 2, ry - 1, w + 4, 1, OL); R(ctx, x - 2, ry, w + 4, 2, lighter); R(ctx, x - 2, ry + 2, w + 4, 1, dark);
    R(ctx, x - 3, ry - 2, 3, 5, OL); R(ctx, x + w, ry - 2, 3, 5, OL); R(ctx, x - 2, ry - 1, 1, 3, lighter); R(ctx, x + w + 1, ry - 1, 1, 3, mid);
    // 앞면: 위→아래 3톤 그라데이션(디더로 경계 섞기)
    const fy = ry + 3, fh = y + h - fy - 3;
    const b1 = fy + Math.floor(fh * 0.35), b2 = fy + Math.floor(fh * 0.72);
    R(ctx, x, fy, w, b1 - fy, light); R(ctx, x, b1, w, b2 - b1, color); R(ctx, x, b2, w, y + h - 3 - b2, mid);
    dither(ctx, x, b1 - 3, w, 3, color, 0); dither(ctx, x, b2 - 3, w, 3, mid, 1);
    R(ctx, x, fy, w, 2, sh(color, 0.3)); // 용마루 바로 아래 하이라이트
    // 세로 이음선(standing seam): 16px 간격, 어두운 1px + 오른쪽 밝은 1px
    const rnd = Pixel.rng(x * 13 + w * 7 + h);
    for (let xx = x + 8; xx < x + w - 10; xx += 16) {
      for (let yy = fy; yy < y + h - 3; yy++) { const tone = yy < b1 ? light : (yy < b2 ? color : mid); px(ctx, xx, yy, sh(tone, -0.2)); px(ctx, xx + 1, yy, sh(tone, 0.12)); }
    }
    // 마모 점(2px)
    for (let i = 0; i < (w * fh) / 260; i++) { const wx = x + 3 + Math.floor(rnd() * (w - 14)), wy = fy + 3 + Math.floor(rnd() * (fh - 6)); R(ctx, wx, wy, 2, 1, sh(color, 0.24)); }
    // 우측 hip 띠(옆벽 SIDE 띠와 맞춤)
    R(ctx, x + w - 10, fy, 8, y + h - 3 - fy, sh(color, -0.3)); R(ctx, x + w - 11, fy, 1, y + h - 3 - fy, dark);
    for (let yy = fy + 4; yy < y + h - 4; yy += 8) px(ctx, x + w - 7, yy, sh(color, -0.42));
    // 처마(하단): 그늘 띠 + 판자 + 외곽선
    R(ctx, x, y + h - 3, w, 1, dark); R(ctx, x, y + h - 2, w, 1, C.woodLo); R(ctx, x, y + h - 1, w, 1, OL);
    // 박공 테두리(좌/우)
    R(ctx, x, y, 2, h, OL); R(ctx, x + w - 2, y, 2, h, OL);
    R(ctx, x + 2, ry + 3, 1, h - back - 4, light);
    // 지붕창(박공형)
    for (const f of (opts.dormers || [])) {
      const dw = 30, dh = 28, dx = x + Math.round(w * f) - 15, dy = ry + 6;
      tri(ctx, dx + 15, dy - 2, 11, 19, OL);
      tri(ctx, dx + 15, dy - 1, 9, 16, dark);
      tri(ctx, dx + 15, dy, 8, 14, mid);
      for (let k = 0; k < 8; k++) px(ctx, dx + 15 - Math.round((14 * (k + 1)) / 8) + 1, dy + k, light);
      R(ctx, dx + 3, dy + 8, dw - 6, dh - 8, OL);
      R(ctx, dx + 4, dy + 9, dw - 8, dh - 10, '#f1e5cb');
      R(ctx, dx + 4, dy + 9, dw - 8, 2, 'rgba(0,0,0,0.2)');
      R(ctx, dx + dw - 6, dy + 9, 2, dh - 10, sh('#f1e5cb', -0.25));
      drawWindow(ctx, dx + 9, dy + 13, 12, 12, { flowers: false });
      R(ctx, dx + 2, dy + dh - 2, dw - 4, 1, dark);
    }
  }

  // 정면 박공(삼각 벽): 외곽선 → 지붕 어두운 띠 → 밝은 처마 판 → 회벽(반목조: 기둥 1 + 사선 버팀대 2 + 바닥보) + 박공 창. 양 사선 바깥 지붕면에 2px 그늘 띠
  function drawFrontGable(ctx, cx, top, hb, gh, roofColor, wallColor) {
    const trim = sh(roofColor, -0.3), slopeShade = sh(roofColor, -0.2);
    const half = (r) => Math.round((r / gh) * hb);
    for (let r = 0; r < gh; r++) { const hw = half(r); R(ctx, cx - hw - 3, top + r, 2, 1, slopeShade); R(ctx, cx + hw + 2, top + r, 2, 1, slopeShade); }
    for (let r = 0; r < gh; r++) { const hw = half(r); R(ctx, cx - hw - 1, top + r, hw * 2 + 3, 1, OL); }
    for (let r = 2; r < gh; r++) { const hw = half(r) - 2; if (hw >= 0) R(ctx, cx - hw, top + r, hw * 2 + 1, 1, trim); }
    for (let r = 4; r < gh; r++) { const hw = half(r) - 4; if (hw >= 0) R(ctx, cx - hw, top + r, hw * 2 + 1, 1, C.woodHi); }
    for (let r = 6; r < gh - 1; r++) { const hw = half(r) - 6; if (hw >= 0) { R(ctx, cx - hw, top + r, hw * 2 + 1, 1, wallColor); R(ctx, cx + Math.max(0, hw - 2), top + r, Math.min(3, hw + 1), 1, sh(wallColor, -0.08)); } }
    // 골조
    const beam = (bx, by, bw, bh) => { R(ctx, bx, by, bw, bh, C.beam); R(ctx, bx, by, bw, 1, C.beamHi); R(ctx, bx, by + bh - 1, bw, 1, C.beamLo); };
    const my = top + Math.floor(gh * 0.58), mh = half(my - top) - 7;
    beam(cx - 1, top + 9, 3, gh - 10);
    beam(cx - mh, my, mh * 2 + 1, 3);
    const bh = half(gh - 2) - 7;
    beam(cx - bh, top + gh - 4, bh * 2 + 1, 3);
    for (const sgn of [-1, 1]) {
      // 사선 버팀대: 가로보 끝에서 바닥보 쪽 안으로 (긴 축 기준으로 한 칸씩 찍어 끊김 없이)
      const x0 = cx + sgn * (mh - 1), y0 = my + 3, x1 = cx + sgn * Math.max(4, mh - 12), y1 = top + gh - 5;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let t = 0; t <= n; t++) { const xx = Math.round(x0 + ((x1 - x0) * t) / n), yy = Math.round(y0 + ((y1 - y0) * t) / n); px(ctx, xx, yy, C.beam); px(ctx, xx + (sgn > 0 ? -1 : 1), yy, C.beam); px(ctx, xx, yy + 1, C.beamLo); }
    }
    // 박공 창(가로보 위)
    drawWindow(ctx, cx - 6, my - 16, 12, 12, { flowers: false });
    // 박공 바닥선
    R(ctx, cx - hb - 2, top + gh - 1, hb * 2 + 5, 1, OL);
  }

  // 반목조 벽 / 석조 벽. x,y,w,h = 벽 영역, side = 우측 옆벽 띠 폭
  function drawTimberWall(ctx, x, y, w, h, wallColor, opts = {}) {
    const stone = opts.stone, side = opts.side || 0;
    const fw = w - side;
    const rnd = Pixel.rng(x * 31 + y * 7 + w);
    R(ctx, x, y, fw, h, wallColor);
    // 회벽 질감
    for (let i = 0; i < (fw * h) / 90; i++) px(ctx, x + Math.floor(rnd() * fw), y + Math.floor(rnd() * h), sh(wallColor, rnd() < 0.5 ? -0.05 : 0.05));
    const baseH = 10;
    if (stone) {
      drawBlocks(ctx, x, y, fw, h, rnd, 18, 8, [wallColor, sh(wallColor, -0.06), sh(wallColor, 0.04)], sh(wallColor, 0.12), sh(wallColor, -0.22), sh(wallColor, -0.32));
      // 모서리 돌(퀴인)
      for (let yy = y; yy < y + h; yy += 8) { const big = ((yy - y) / 8) % 2 === 0; R(ctx, x, yy, big ? 10 : 7, 7, sh(wallColor, -0.1)); R(ctx, x, yy, big ? 10 : 7, 1, sh(wallColor, 0.1)); }
      // 처마 아래 코니스
      R(ctx, x, y, fw, 3, sh(wallColor, -0.18)); R(ctx, x, y + 3, fw, 1, sh(wallColor, -0.35));
    } else {
      const n = Math.max(2, Math.round(fw / 30));
      const posts = [];
      for (let k = 0; k <= n; k++) posts.push(x + Math.round((fw * k) / n));
      const beam = (bx, by, bw, bh) => { R(ctx, bx, by, bw, bh, C.beam); R(ctx, bx, by, bw, 1, C.beamHi); R(ctx, bx, by + bh - 1, bw, 1, C.beamLo); };
      // 상단 가로보
      beam(x, y, fw, 3);
      const mid = opts.midBeam ? y + opts.midBeam : -1;
      if (mid > 0) { beam(x, mid, fw, 3); R(ctx, x, mid + 3, fw, 2, 'rgba(0,0,0,0.12)'); }
      // 세로 기둥
      for (const p of posts) { const pxx = Math.min(p, x + fw - 3); R(ctx, pxx, y, 3, h - baseH, C.beam); R(ctx, pxx, y, 1, h - baseH, C.beamHi); R(ctx, pxx + 2, y, 1, h - baseH, C.beamLo); }
      // 사선 버팀목(각 칸 상단 모서리)
      for (let k = 0; k < n; k++) {
        const a = posts[k] + 3, b = posts[k + 1];
        const len = Math.min(9, Math.floor((b - a) / 3));
        for (let t = 0; t < len; t++) { px(ctx, a + t, y + 3 + t, C.beam); px(ctx, a + t, y + 4 + t, C.beamLo); px(ctx, b - 1 - t, y + 3 + t, C.beam); px(ctx, b - 1 - t, y + 4 + t, C.beamLo); }
      }
    }
    // 하단 석재 기초
    drawBlocks(ctx, x, y + h - baseH, fw, baseH, rnd, 14, 5, ['#b8b2a6', '#aba496', '#c2bcb0'], '#d3cec4', '#8f8879', '#6f6a5f');
    R(ctx, x, y + h - baseH, fw, 1, OL);
    // 처마 그림자
    R(ctx, x, y, fw, 1, OL); R(ctx, x, y + 1, fw, 8, 'rgba(40,25,20,0.28)'); R(ctx, x, y + 9, fw, 2, 'rgba(40,25,20,0.10)');
    // 우측 옆벽 띠(어두운 톤)
    if (side > 0) {
      const sc = sh(wallColor, -0.3);
      R(ctx, x + fw, y, side, h, sc);
      if (!stone) { R(ctx, x + fw, y, side, 3, sh(C.beam, -0.3)); R(ctx, x + fw + side - 3, y, 3, h - baseH, sh(C.beam, -0.3)); }
      R(ctx, x + fw, y + h - baseH, side, baseH, '#8a8478'); R(ctx, x + fw, y + h - baseH, side, 1, OL);
      R(ctx, x + fw, y, 1, h, sh(sc, -0.25));
    }
    Pixel.outline(ctx, x - 1, y, w + 2, h + 1, OL);
  }

  function drawChimney(ctx, x, y, w = 14, h = 24) {
    R(ctx, x - 1, y - 1, w + 2, h + 2, OL);
    R(ctx, x, y, w, h, '#8c8378'); R(ctx, x, y, 3, h, '#a69d90'); R(ctx, x + w - 3, y, 3, h, '#6e675d');
    for (let yy = y + 4; yy < y + h; yy += 5) { R(ctx, x, yy, w, 1, '#6e675d'); px(ctx, x + 4 + ((yy / 5) % 2) * 4, yy - 2, '#6e675d'); }
    R(ctx, x - 3, y - 4, w + 6, 4, OL); R(ctx, x - 2, y - 3, w + 4, 2, '#5f584f'); R(ctx, x - 2, y - 3, w + 4, 1, '#7a7268');
    R(ctx, x + 3, y - 2, w - 6, 1, '#2d2622');
    // 연기
    const smoke = [[x + w / 2, y - 10, 4], [x + w / 2 + 5, y - 18, 5], [x + w / 2 + 12, y - 27, 6]];
    for (const [sx, sy, r] of smoke) { Pixel.circle(ctx, Math.round(sx), Math.round(sy), r, 'rgba(230,230,235,0.85)'); Pixel.circle(ctx, Math.round(sx) - 1, Math.round(sy) - 1, Math.max(1, r - 2), 'rgba(255,255,255,0.9)'); }
  }

  // 벽에 걸린 세로 깃발(제비꼬리)
  function drawBanner(ctx, x, y, color) {
    const w = 14, h = 32;
    R(ctx, x - 3, y - 2, w + 6, 3, OL); R(ctx, x - 2, y - 1, w + 4, 1, C.woodHi);
    R(ctx, x - 1, y, w + 2, h - 5, OL);
    R(ctx, x, y + 1, w, h - 7, color); R(ctx, x + w - 3, y + 1, 3, h - 7, sh(color, -0.25)); R(ctx, x, y + 1, 1, h - 7, sh(color, 0.2));
    // 제비꼬리
    for (let k = 0; k < 5; k++) { R(ctx, x - 1, y + h - 6 + k, 5 - k + 1, 1, OL); R(ctx, x + w - 5 + k, y + h - 6 + k, 6 - k, 1, OL); R(ctx, x, y + h - 6 + k, 4 - k, 1, color); R(ctx, x + w - 4 + k, y + h - 6 + k, 4 - k, 1, sh(color, -0.25)); }
    // 문장
    R(ctx, x + 5, y + 8, 4, 4, '#f0c64a'); px(ctx, x + 6, y + 7, '#f0c64a'); px(ctx, x + 6, y + 12, '#f0c64a'); px(ctx, x + 6, y + 9, '#fff1b0');
  }

  // 차양: 줄무늬 천 + 스캘럽 가장자리 + 받침대
  function drawAwning(ctx, cx, y, w, color, icon, h = 14) {
    const x = cx - Math.floor(w / 2);
    R(ctx, x - 1, y - 1, w + 2, h + 2, OL);
    for (let xx = 0; xx < w; xx += 8) { const c2 = (xx / 8) % 2 ? '#f6f0e4' : color; R(ctx, x + xx, y, Math.min(8, w - xx), h, c2); R(ctx, x + xx, y + h - 4, Math.min(8, w - xx), 4, sh(c2, -0.12)); }
    R(ctx, x, y, w, 1, 'rgba(255,255,255,0.45)');
    if (icon && ICONS[icon]) { R(ctx, cx - 8, y + 1, 16, 12, '#fbf6ea'); Pixel.outline(ctx, cx - 8, y + 1, 16, 12, OL); glyph(ctx, ICONS[icon], ICON_PAL, cx - 4, y + 3); }
    // 스캘럽
    for (let xx = 0; xx < w; xx += 8) { const c2 = (xx / 8) % 2 ? '#f6f0e4' : color; R(ctx, x + xx + 1, y + h + 1, 6, 1, OL); R(ctx, x + xx + 2, y + h + 2, 4, 1, OL); R(ctx, x + xx + 1, y + h, 6, 1, sh(c2, -0.12)); R(ctx, x + xx + 2, y + h + 1, 4, 1, sh(c2, -0.12)); }
    // 지지대
    for (const sx of [x + 2, x + w - 4]) { R(ctx, sx, y + h + 2, 2, 10, C.beam); px(ctx, sx + 1, y + h + 2, C.beamHi); }
    R(ctx, x, y + h + 3, w, 3, 'rgba(40,25,20,0.18)');
  }

  // ---------- 건물 ----------
  const EAVE = 8, TOPPAD = 52, SIDE = 8;

  function renderHouse(b) {
    const w = b.w * TILE, h = b.h * TILE;
    const c = Pixel.make(w + EAVE * 2, h + TOPPAD + 4);
    const ctx = c.getContext('2d');
    const ox = EAVE, oy = TOPPAD;
    const twoStory = b.h >= 6 || !!b.shop;
    const wallH = b.h >= 6 ? 92 : (twoStory ? 86 : 76);
    const roofH = h - wallH;
    const fw = w - SIDE, wt = oy + roofH;
    // 바닥 그림자(우/하)
    R(ctx, ox + 3, oy + h, w + 3, 3, C.shadow); R(ctx, ox + w, wt + 3, 4, h - roofH, C.shadow);
    // 벽
    drawTimberWall(ctx, ox, wt, w, wallH, b.wall, { stone: b.stone, side: SIDE, midBeam: twoStory ? 30 : 0 });
    // 지붕 (처마가 좌우로 넘침, 뒤로 6px). 지붕창: 넓은 건물은 1/4·3/4 지점 2개, 2층 건물은 가운데 1개. 정면 박공 건물은 박공을 피해 바깥쪽에
    const rx = ox - EAVE + 1, rw = w + EAVE * 2 - 2, rtop = oy - 6, rh = roofH + 6;
    const dormers = b.gable ? (b.w >= 7 ? [0.16, 0.84] : []) : (b.w >= 7 ? [0.28, 0.72] : (twoStory ? [0.5] : []));
    drawRoof(ctx, rx, rtop, rw, rh, b.roof, { dormers });
    if (b.gable) {
      const back = ROOF_BACK, ry = rtop + back, eave = rtop + rh - 3;
      drawFrontGable(ctx, rx + Math.floor(rw / 2), ry, Math.floor(fw * 0.3), eave - ry, b.roof, b.wall);
    }
    if (b.chimney) drawChimney(ctx, ox + w - 44, oy - 2, 14, 26);
    // 창문 배치(칸 중심)
    const n = Math.max(2, Math.round(fw / 30));
    const bayC = (k) => ox + Math.round((fw * (k + 0.5)) / n);
    const lowerBays = n >= 6 ? [0, 1, n - 2, n - 1] : [0, n - 1];
    const shutter = sh(b.roof, -0.05);
    // 가장자리 칸은 덧문, 안쪽 칸은 화분 — 정면이 너무 빽빽해지지 않게
    const edge = (k) => k === 0 || k === n - 1;
    const winOpts = (k) => ({ shutter: edge(k) ? shutter : null, flowers: !edge(k) || n < 6 });
    if (twoStory) {
      const upperBays = n >= 6 ? (n % 2 ? [0, 2, n - 3, n - 1] : [0, 1, n - 2, n - 1]) : [0, n - 1];
      for (const k of upperBays) drawWindow(ctx, bayC(k) - 7, wt + 9, 14, 14, { flowers: false });
      for (const k of lowerBays) drawWindow(ctx, bayC(k) - 8, wt + 42, 16, 18, winOpts(k));
    } else {
      for (const k of lowerBays) drawWindow(ctx, bayC(k) - 8, wt + 14, 16, 18, winOpts(k));
    }
    // 문 + 계단 + 벽 등불
    const doorW = 21, doorH = 40;
    const dcx = ox + Math.floor(fw / 2), dx = dcx - 10, dy = oy + h - 5 - doorH;
    drawDoor(ctx, dx, dy, doorW, doorH, { frame: b.stone ? '#9c948a' : '#8d8378' });
    drawSteps(ctx, dcx, oy + h - 5, 27);
    drawWallLantern(ctx, dx - 12, dy + 6); drawWallLantern(ctx, dx + doorW + 6, dy + 6);
    // 차양이 있으면 간판 대신 차양 가운데 아이콘 패널 (문 위 공간을 비움)
    if (b.awning) {
      if (b.awningWide) drawAwning(ctx, ox + Math.floor(fw / 2), dy - 16, fw - 12, b.awning, null, 10); // 전면 폭 줄무늬 차양(여관)
      else drawAwning(ctx, dcx, dy - 18, 64, b.awning, b.icon);
      if (b.name && twoStory) drawSignBoard(ctx, dcx, wt + 10, b.icon, wt + 3); // 2층 건물은 위층 가운데에 간판도 건다
    } else if (b.name) drawSignBoard(ctx, dcx, dy - 22, b.icon, wt + 3);
    // 깃발 장식
    if (b.banner) drawBanner(ctx, ox + 64, wt + 6, b.banner);
    return { canvas: c, ox, oy, labelY: wt - 12 };
  }

  // 아치형 스테인드글라스 창
  function drawArchWindow(ctx, x, y, w, h) {
    const r = Math.floor(w / 2), cx = x + r;
    Pixel.circle(ctx, cx, y + r, r + 1, OL); R(ctx, x - 1, y + r, w + 2, h - r, OL);
    Pixel.circle(ctx, cx, y + r, r, '#6a4a2e'); R(ctx, x, y + r, w, h - r, '#6a4a2e');
    Pixel.circle(ctx, cx, y + r, r - 2, C.glass); R(ctx, x + 2, y + r, w - 4, h - r - 2, C.glass);
    const cols = ['#e46a6a', '#f2cf5b', '#6fb8e8', '#7bc77a', '#b58ad8'];
    let k = 0;
    for (let yy = y + r; yy < y + h - 2; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 4) { R(ctx, xx, yy, Math.min(3, x + w - 2 - xx), Math.min(3, y + h - 2 - yy), cols[k++ % cols.length]); }
    R(ctx, cx, y + 2, 1, h - 4, '#6a4a2e'); R(ctx, x + 2, y + r, w - 4, 1, '#6a4a2e');
    px(ctx, cx - 3, y + 3, C.glassHi); px(ctx, cx - 2, y + 4, C.glassHi);
    R(ctx, x - 2, y + h, w + 4, 2, '#d8d0c0'); R(ctx, x - 2, y + h + 2, w + 4, 1, OL);
  }

  function renderTemple(b) {
    const w = b.w * TILE, h = b.h * TILE;
    const TOP = 72;
    const c = Pixel.make(w + EAVE * 2, h + TOP + 4);
    const ctx = c.getContext('2d');
    const ox = EAVE, oy = TOP;
    const wallH = 92, roofH = h - wallH, fw = w - SIDE, wt = oy + roofH;
    const marble = b.wall, mLo = sh(marble, -0.14), mHi = '#ffffff';
    R(ctx, ox + 3, oy + h, w + 3, 3, C.shadow); R(ctx, ox + w, wt + 3, 4, h - roofH, C.shadow);
    // 대리석 벽
    R(ctx, ox, wt, fw, wallH, marble);
    const rnd = Pixel.rng(41);
    for (let i = 0; i < 40; i++) { const vx = ox + Math.floor(rnd() * fw), vy = wt + 8 + Math.floor(rnd() * (wallH - 20)); for (let t = 0; t < 4; t++) px(ctx, vx + t, vy + (t >> 1), sh(marble, -0.07)); }
    // 기둥(필라스터)
    const nCol = 6;
    for (let k = 0; k < nCol; k++) {
      const cxp = ox + 6 + Math.round(((fw - 12 - 10) * k) / (nCol - 1));
      R(ctx, cxp - 1, wt + 5, 12, wallH - 14, OL);
      R(ctx, cxp, wt + 6, 10, wallH - 16, '#fbf7ee'); R(ctx, cxp + 7, wt + 6, 3, wallH - 16, '#ddd5c4'); R(ctx, cxp + 1, wt + 6, 2, wallH - 16, mHi);
      R(ctx, cxp + 4, wt + 10, 1, wallH - 24, '#e6dfcf');
      R(ctx, cxp + 11, wt + 9, 1, wallH - 20, '#a09686'); // 기둥 우측 그림자 선
      R(ctx, cxp - 2, wt + 5, 14, 4, '#e8e1d0'); Pixel.outline(ctx, cxp - 2, wt + 5, 14, 4, OL); R(ctx, cxp - 1, wt + 9, 12, 2, '#cfc6b3'); // 주두 아래 어두운 2px
      R(ctx, cxp - 2, wt + wallH - 12, 14, 4, '#d8d0c0'); Pixel.outline(ctx, cxp - 2, wt + wallH - 12, 14, 4, OL);
    }
    // 코니스(처마 아래 띠)
    R(ctx, ox, wt, fw, 5, '#e8e1d0'); R(ctx, ox, wt + 4, fw, 1, mLo); R(ctx, ox, wt + 5, fw, 1, OL);
    dots(ctx, ox, wt + 2, fw, 4, '#d9b24a', 2);
    // 기초석
    R(ctx, ox, wt + wallH - 8, fw, 8, '#cfc6b3'); R(ctx, ox, wt + wallH - 8, fw, 1, OL); dots(ctx, ox, wt + wallH - 4, fw, 12, '#b5ac99');
    R(ctx, ox, wt, fw, 6, 'rgba(40,25,20,0.18)');
    // 옆벽 띠
    R(ctx, ox + fw, wt, SIDE, wallH, sh(marble, -0.3)); R(ctx, ox + fw, wt, 1, wallH, sh(marble, -0.45));
    Pixel.outline(ctx, ox - 1, wt, w + 2, wallH + 1, OL);
    // 지붕(금색)
    drawRoof(ctx, ox - EAVE + 1, oy - 6, w + EAVE * 2 - 2, roofH + 6, b.roof, {});
    // 장미창 그리기 헬퍼(금 테 1px, 하늘색 유리, 8방향 살)
    const rose = (rcx, rcy, rr) => {
      Pixel.circle(ctx, rcx, rcy, rr + 2, OL); Pixel.circle(ctx, rcx, rcy, rr + 1, '#e9d28a'); Pixel.circle(ctx, rcx, rcy, rr, OL); Pixel.circle(ctx, rcx, rcy, rr - 1, C.glass);
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; px(ctx, rcx + Math.round(Math.cos(a) * (rr - 2)), rcy + Math.round(Math.sin(a) * (rr - 2)), ['#e46a6a', '#f2cf5b', '#7bc77a', '#b58ad8'][k % 4]); for (let d = 2; d < rr - 2; d++) px(ctx, rcx + Math.round(Math.cos(a) * d), rcy + Math.round(Math.sin(a) * d), '#c9a84a'); }
      Pixel.circle(ctx, rcx, rcy, 1, '#f2cf5b'); px(ctx, rcx - Math.round(rr * 0.5), rcy - Math.round(rr * 0.6), C.glassHi);
    };
    // 지붕 중앙 금테 정면 박공(폭 48, 높이 28) 안에 장미창
    const rcx = ox + Math.floor(w / 2);
    { const gTop = oy - 6 + ROOF_BACK + 4, gh = 28, hb = 24;
      for (let r = 0; r < gh; r++) { const hw = Math.round((r / gh) * hb); R(ctx, rcx - hw - 1, gTop + r, hw * 2 + 3, 1, OL); }
      for (let r = 2; r < gh; r++) { const hw = Math.round((r / gh) * hb) - 2; if (hw >= 0) R(ctx, rcx - hw, gTop + r, hw * 2 + 1, 1, '#d9b24a'); }
      for (let r = 4; r < gh - 1; r++) { const hw = Math.round((r / gh) * hb) - 4; if (hw >= 0) R(ctx, rcx - hw, gTop + r, hw * 2 + 1, 1, marble); }
      R(ctx, rcx - hb - 1, gTop + gh - 1, hb * 2 + 3, 1, OL); R(ctx, rcx - hb, gTop + gh, hb * 2 + 1, 2, 'rgba(40,25,20,0.2)');
      rose(rcx, gTop + 18, 7);
    }
    // 종탑(용마루 위)
    const back = ROOF_BACK;
    const ry = oy - 6 + back, tw = 40, th = 46, tx = rcx - tw / 2, ty = ry - th + 2;
    R(ctx, tx - 1, ty - 1, tw + 2, th + 2, OL);
    R(ctx, tx, ty, tw, th, marble); R(ctx, tx + tw - 8, ty, 8, th, sh(marble, -0.3)); R(ctx, tx, ty, 2, th, mHi);
    R(ctx, tx, ty + th - 6, tw, 6, 'rgba(40,25,20,0.15)');
    // 종 아치
    const bcx = tx + 16;
    Pixel.circle(ctx, bcx, ty + 14, 8, OL); R(ctx, bcx - 8, ty + 14, 17, 18, OL);
    Pixel.circle(ctx, bcx, ty + 14, 7, '#3a3246'); R(ctx, bcx - 7, ty + 14, 15, 17, '#3a3246');
    R(ctx, bcx - 5, ty + 12, 10, 8, '#e0b43c'); R(ctx, bcx - 6, ty + 19, 12, 3, '#c9992e'); R(ctx, bcx - 2, ty + 9, 4, 3, '#e0b43c'); px(ctx, bcx - 4, ty + 13, '#fff1b0'); R(ctx, bcx - 1, ty + 22, 2, 2, '#f0c64a');
    // 종탑 지붕(사각뿔) + 장식
    tri(ctx, tx + tw / 2, ty - 24, 24, tw / 2 + 4, OL);
    tri(ctx, tx + tw / 2, ty - 23, 22, tw / 2 + 2, '#a3844c');
    for (let k = 0; k < 22; k++) { const hw = Math.round(((tw / 2 + 2) * (k + 1)) / 22); R(ctx, tx + tw / 2 - hw, ty - 23 + k, hw, 1, k % 3 === 2 ? sh(b.roof, -0.1) : sh(b.roof, 0.12)); }
    R(ctx, tx + tw / 2 - 1, ty - 34, 2, 11, '#f0c64a'); R(ctx, tx + tw / 2 - 4, ty - 31, 8, 2, '#f0c64a'); px(ctx, tx + tw / 2 - 1, ty - 35, '#fff1b0');
    // 문(큰 아치 쌍문) + 계단
    const dcx = ox + Math.floor(fw / 2), doorW = 27, doorH = 48, dy = oy + h - 6 - doorH;
    drawDoor(ctx, dcx - 13, dy, doorW, doorH, { frame: '#d9b24a' });
    R(ctx, dcx, dy + 14, 1, doorH - 15, OL);
    drawSteps(ctx, dcx, oy + h - 6, 44); R(ctx, dcx - 25, oy + h - 1, 50, 1, '#a8a092');
    // 스테인드글라스 창 2개
    drawArchWindow(ctx, ox + 30, wt + 28, 14, 30); drawArchWindow(ctx, ox + fw - 44, wt + 28, 14, 30);
    // 문 위 벽의 장미창(지름 14) + 좌측 필라스터 사이의 작은 십자 명판
    rose(dcx, dy - 14, 6);
    R(ctx, ox + 23, wt + 11, 14, 12, OL); R(ctx, ox + 24, wt + 12, 12, 10, '#fbf6ea'); glyph(ctx, ICONS.cross, ICON_PAL, ox + 26, wt + 13);
    return { canvas: c, ox, oy, labelY: wt - 12 };
  }

  // 돌 탑(원기둥): x = 좌측, y = 상단, w, h. 원뿔 지붕은 위로 뻗음
  function drawRoundTower(ctx, x, y, w, h, rnd) {
    const pal = [C.stone, sh(C.stone, -0.07), sh(C.stone, 0.06)];
    drawBlocks(ctx, x, y, w, h, rnd, 20, 10, pal, C.stoneHi, C.stoneLo, C.stoneOl);
    // 원기둥 명암: 좌 밝은 띠, 우 어두운 띠
    R(ctx, x, y, 6, h, 'rgba(255,255,255,0.18)'); R(ctx, x + w - 12, y, 12, h, 'rgba(0,0,0,0.14)'); R(ctx, x + w - 5, y, 5, h, 'rgba(0,0,0,0.12)');
    Pixel.outline(ctx, x - 1, y - 1, w + 2, h + 2, C.stoneOl);
    // 흉벽
    for (let pxx = x + 1; pxx < x + w - 6; pxx += 16) { R(ctx, pxx - 1, y - 11, 12, 12, C.stoneOl); R(ctx, pxx, y - 10, 10, 10, C.stone); R(ctx, pxx, y - 10, 10, 2, C.stoneHi); R(ctx, pxx + 8, y - 8, 2, 8, C.stoneLo); }
    R(ctx, x - 1, y - 2, w + 2, 3, C.stoneOl); R(ctx, x, y - 1, w, 1, C.stoneHi);
    // 원뿔 지붕
    const CH = 30, cx = x + Math.floor(w / 2), top = y - 12 - CH;
    const cone = '#6f7f98', coneHi = '#8d9bb2', coneLo = '#4f5e78', coneOl = '#3a475c';
    tri(ctx, cx, top - 1, CH + 2, Math.floor(w / 2) + 6, OL);
    tri(ctx, cx, top, CH, Math.floor(w / 2) + 4, cone);
    for (let k = 0; k < CH; k++) { const hw = Math.round(((Math.floor(w / 2) + 4) * (k + 1)) / CH); R(ctx, cx - hw + 1, top + k, Math.max(1, Math.floor(hw * 0.55)), 1, k % 4 === 3 ? cone : coneHi); R(ctx, cx + Math.floor(hw * 0.45), top + k, Math.max(1, hw - Math.floor(hw * 0.45)), 1, k % 4 === 3 ? coneOl : coneLo); }
    for (let yy = top + 8; yy < top + CH; yy += 8) { const hw = Math.round(((Math.floor(w / 2) + 4) * (yy - top + 1)) / CH); R(ctx, cx - hw, yy, hw * 2 + 1, 1, coneOl); }
    R(ctx, cx - 1, top - 8, 2, 8, '#f0c64a'); R(ctx, cx - 3, top - 6, 6, 1, '#f0c64a'); px(ctx, cx - 1, top - 9, '#fff1b0');
    // 화살창 + 아치창
    R(ctx, cx - 2, y + 14, 4, 14, C.stoneOl); R(ctx, cx - 1, y + 15, 2, 12, '#2b2a38');
    drawArchWindow(ctx, cx - 7, y + 44, 14, 24);
  }

  function renderGate(b) {
    const w = b.w * TILE, h = b.h * TILE;
    const TOP = 32;
    const c = Pixel.make(w + 16, h + TOP + 4);
    const ctx = c.getContext('2d');
    const ox = 8, oy = TOP;
    const rnd = Pixel.rng(99);
    const pal = [C.stone, sh(C.stone, -0.07), sh(C.stone, 0.06)];
    R(ctx, ox + 3, oy + h, w + 3, 3, C.shadow);
    // 가운데 성벽(뒤)
    const mx = ox + 72, mw = w - 144, my = oy + 30;
    for (let pxx = mx + 4; pxx < mx + mw - 10; pxx += 20) { R(ctx, pxx - 1, my - 13, 14, 14, C.stoneOl); R(ctx, pxx, my - 12, 12, 12, C.stone); R(ctx, pxx, my - 12, 12, 2, C.stoneHi); R(ctx, pxx + 10, my - 10, 2, 10, C.stoneLo); }
    R(ctx, mx, my, mw, 18, C.stoneHi); for (let xx = mx; xx < mx + mw; xx += 16) R(ctx, xx, my + 1, 1, 16, sh(C.stoneHi, -0.12)); R(ctx, mx, my + 8, mw, 1, sh(C.stoneHi, -0.12));
    R(ctx, mx, my, mw, 1, C.stoneOl); R(ctx, mx, my + 17, mw, 1, C.stoneOl);
    drawBlocks(ctx, mx, my + 18, mw, h - 30 - 18, rnd, 20, 10, pal, C.stoneHi, C.stoneLo, C.stoneOl);
    R(ctx, mx, my + 18, mw, 3, 'rgba(0,0,0,0.18)');
    R(ctx, mx, oy + 58, mw, 2, sh(C.stone, -0.2)); R(ctx, mx, oy + 57, mw, 1, C.stoneHi); // 탑 창문 높이의 돌림띠
    Pixel.outline(ctx, mx - 1, my - 1, mw + 2, h - 30 + 2, C.stoneOl);
    // 아치 통로 + 보라 포털
    const cx = ox + Math.floor(w / 2), ar = 30, ay = oy + h - 86;
    Pixel.circle(ctx, cx, ay + ar, ar + 3, C.stoneOl); R(ctx, cx - ar - 3, ay + ar, ar * 2 + 7, 86 - ar, C.stoneOl);
    Pixel.circle(ctx, cx, ay + ar, ar + 1, C.stoneHi); R(ctx, cx - ar - 1, ay + ar, ar * 2 + 3, 86 - ar, C.stoneHi);
    for (let k = 0; k < 12; k++) { const a = Math.PI + (Math.PI * (k + 0.5)) / 12; const rr = ar + 2; px(ctx, cx + Math.round(Math.cos(a) * rr), ay + ar + Math.round(Math.sin(a) * rr), C.stoneOl); px(ctx, cx + Math.round(Math.cos(a) * (rr - 1)), ay + ar + Math.round(Math.sin(a) * (rr - 1)), C.stoneOl); }
    Pixel.circle(ctx, cx, ay + ar, ar - 1, '#231c38'); R(ctx, cx - ar + 1, ay + ar, ar * 2 - 1, 86 - ar, '#231c38');
    Pixel.ellipse(ctx, cx, ay + 52, 24, 30, '#3d2f66'); Pixel.ellipse(ctx, cx, ay + 54, 18, 24, '#5a46a0'); Pixel.ellipse(ctx, cx, ay + 56, 12, 18, '#8a72e0'); Pixel.ellipse(ctx, cx, ay + 58, 6, 11, '#c9bbff'); Pixel.ellipse(ctx, cx, ay + 60, 2, 5, '#ffffff');
    for (const [sx, sy] of [[-16, 20], [14, 30], [-8, 70], [18, 62], [-20, 50], [6, 12]]) { px(ctx, cx + sx, ay + sy, '#e8e0ff'); px(ctx, cx + sx + 1, ay + sy, '#b9a8ff'); }
    // 문턱·계단
    drawSteps(ctx, cx, oy + h - 5, 70);
    // 횃불
    for (const fx of [cx - ar - 16, cx + ar + 14]) {
      const fy = ay + 30;
      R(ctx, fx - 2, fy + 4, 5, 3, '#4a4440'); R(ctx, fx - 1, fy - 2, 3, 14, '#6b4a2e'); R(ctx, fx - 1, fy - 2, 1, 14, '#9a6f45');
      Pixel.circle(ctx, fx, fy - 7, 8, 'rgba(255,170,60,0.15)'); Pixel.ellipse(ctx, fx, fy - 6, 6, 8, 'rgba(255,190,80,0.18)');
      tri(ctx, fx, fy - 13, 10, 4, '#e8702e'); tri(ctx, fx, fy - 11, 7, 2, '#f7b53a'); px(ctx, fx, fy - 7, '#fff1b0');
      R(ctx, fx - 3, fy - 3, 7, 2, '#3a3238');
    }
    // 현수막(붉은 천 + 금 문장)
    const bw = 36, bh = 44, bx = cx - 18, by = my + 10;
    R(ctx, bx - 1, by - 1, bw + 2, bh + 2, OL);
    R(ctx, bx, by, bw, bh, '#b8433f'); R(ctx, bx + bw - 5, by, 5, bh, '#8f322f'); R(ctx, bx, by, 2, bh, '#d05a55');
    R(ctx, bx - 2, by - 3, bw + 4, 3, OL); R(ctx, bx - 1, by - 2, bw + 2, 1, '#d9b24a');
    for (let k = 0; k < 6; k++) { R(ctx, bx, by + bh - 6 + k, 7 - k, 1, OL); R(ctx, bx + bw - 7 + k, by + bh - 6 + k, 7 - k, 1, OL); }
    R(ctx, bx + 3, by + bh - 6, 30, 1, '#d9b24a'); R(ctx, bx, by + bh + 1, bw, 1, 'rgba(0,0,0,0.2)');
    glyph(ctx, ['...gg...', '..gggg..', '..g..g..', '.gggggg.', '.g.gg.g.', '.gggggg.', 'gggggggg', 'g.g..g.g'], { g: '#f0c64a' }, cx - 4, by + 10);
    R(ctx, bx + 6, by + 24, 24, 1, '#f0c64a'); R(ctx, bx + 10, by + 28, 16, 1, '#f0c64a');
    // 양쪽 둥근 탑(앞)
    // 탑 몸통은 성벽 윗선과 비슷한 높이에서 시작(원뿔 꼭지가 월드 y>=4 안에 들어오게)
    drawRoundTower(ctx, ox - 4, oy + 24, 80, h - 24, rnd);
    drawRoundTower(ctx, ox + w - 76, oy + 24, 80, h - 24, rnd);
    return { canvas: c, ox, oy, labelY: ay - 8 };
  }

  // ---------- 소품 ----------
  const shadowEllipse = (ctx, cx, cy, rx, ry) => Pixel.ellipse(ctx, cx, cy, rx, ry, 'rgba(40,25,20,0.2)');

  function renderTree(size) {
    const big = size === 'big';
    const w = big ? 68 : 48, h = big ? 86 : 62;
    const c = Pixel.make(w, h);
    const ctx = c.getContext('2d');
    const cx = Math.floor(w / 2);
    Pixel.ellipse(ctx, cx + 1, h - 3, (big ? 12 : 8) + 4, big ? 4 : 3, 'rgba(40,25,20,0.22)');
    // 밑동 돌 테두리(타원) + 줄기(3톤 + 껍질 눈금)
    const tw = big ? 10 : 7, th = big ? 26 : 18, ty = h - 4 - th;
    Pixel.ellipse(ctx, cx, h - 4, Math.floor(tw / 2) + 8, 4, OL); Pixel.ellipse(ctx, cx, h - 4, Math.floor(tw / 2) + 7, 3, C.curb); Pixel.ellipse(ctx, cx, h - 5, Math.floor(tw / 2) + 5, 2, C.curbHi);
    R(ctx, cx - Math.floor(tw / 2) - 1, ty, tw + 2, th + 1, OL);
    R(ctx, cx - Math.floor(tw / 2), ty, tw, th, C.wood); R(ctx, cx - Math.floor(tw / 2), ty, 2, th, C.woodHi); R(ctx, cx + Math.floor(tw / 2) - 3, ty, 3, th, C.woodLo);
    for (let k = 0; k < 3; k++) { R(ctx, cx - Math.floor(tw / 2) - 1 - k, h - 5 - k, 1, k + 1, OL); R(ctx, cx + Math.floor(tw / 2) + k, h - 5 - k, 1, k + 1, OL); R(ctx, cx - Math.floor(tw / 2) - k, h - 5 - k, 1, k + 1, C.woodHi); R(ctx, cx + Math.floor(tw / 2) - 1 + k, h - 5 - k, 1, k + 1, C.woodLo); }
    R(ctx, cx, ty + 5, 2, 1, C.woodLo); R(ctx, cx - 1, ty + Math.floor(th * 0.55), 2, 1, C.woodLo);
    // 수관: 덩어리 6개(외곽선 → 어두운 → 중간 → 밝은 → 하이라이트). 외곽선은 4px 마다 1px 안쪽으로 들여 깃털 모양
    const s = big ? 1 : 0.68;
    const blobs = [[0, -27, 19], [-15, -16, 14], [15, -16, 14], [0, -12, 16], [-19, -5, 10], [19, -5, 10]].map(([bx, by, r]) => [cx + Math.round(bx * s), Math.round(ty + 2 + by * s), Math.max(5, Math.round(r * s))]);
    const G = { ol: '#3f6b4a', lo: '#6f9f78', mid: '#9fcf9e', hi: '#c3e4bd', top: '#e0f3d9', rim: '#eefae8' };
    for (const [bx, by, r] of blobs) { Pixel.circle(ctx, bx, by, r + 1, G.ol); for (let a = 0; a < Math.PI * 2; a += 0.05) { if ((Math.round((a * r) / 4) % 2) === 0) px(ctx, bx + Math.round(Math.cos(a) * (r + 1)), by + Math.round(Math.sin(a) * (r + 1)), 'rgba(0,0,0,0)'); } }
    // 깃털 외곽: 반지름 r+1 외곽선을 4px 마다 지운다(투명)
    for (const [bx, by, r] of blobs) for (let a = 0; a < Math.PI * 2; a += 1 / (r + 1)) { const step = Math.floor((a * (r + 1)) / 4); if (step % 2 === 1) ctx.clearRect(bx + Math.round(Math.cos(a) * (r + 1)), by + Math.round(Math.sin(a) * (r + 1)), 1, 1); }
    for (const [bx, by, r] of blobs) Pixel.circle(ctx, bx, by, r, G.ol);
    for (const [bx, by, r] of blobs) Pixel.circle(ctx, bx, by, r - 1, G.lo);
    for (const [bx, by, r] of blobs) Pixel.circle(ctx, bx - 2, by - 2, r - 4, G.mid);
    for (const [bx, by, r] of blobs) Pixel.circle(ctx, bx - 4, by - 4, Math.max(2, r - 8), G.hi);
    for (const [bx, by, r] of blobs) Pixel.circle(ctx, bx - 5, by - 6, Math.max(1, r - 12), G.top);
    { const [bx, by, r] = blobs[0]; for (let a = Math.PI * 1.02; a < Math.PI * 1.55; a += 0.08) px(ctx, bx + Math.round(Math.cos(a) * (r - 2)), by + Math.round(Math.sin(a) * (r - 2)), G.rim); }
    // 잎: 덩어리마다 우하단 1/4 에 정렬된 3px V 3개(어두움), 좌상단에 밝은 점 2개
    for (const [bx, by, r] of blobs) {
      for (let k = 0; k < 3; k++) { const lx = bx + Math.round(r * 0.15) + k * 4 - 2, ly = by + Math.round(r * 0.3) + (k % 2) * 3; if (lx + 2 < bx + r - 2) { px(ctx, lx, ly, G.lo); px(ctx, lx + 2, ly, G.lo); px(ctx, lx + 1, ly + 1, G.lo); } }
      px(ctx, bx - Math.round(r * 0.45), by - Math.round(r * 0.35), G.top); px(ctx, bx - Math.round(r * 0.2), by - Math.round(r * 0.55), G.top);
    }
    // 수관 밑면 3px 어둠
    for (const [bx, by, r] of blobs) for (let k = 0; k < 3; k++) { const yy = by + r - 2 - k; const dx = Math.floor(Math.sqrt(Math.max(0, (r - 1) * (r - 1) - (yy - by) * (yy - by)))); if (dx > k + 1) R(ctx, bx - dx + 1 + k, yy, dx * 2 - 1 - k * 2, 1, G.lo); }
    return { canvas: c, ox: cx, oy: h - 2 };
  }

  function renderLamp() {
    const c = Pixel.make(30, 66);
    const ctx = c.getContext('2d');
    const iron = '#33333d', ironHi = '#5e5e6c';
    shadowEllipse(ctx, 12, 64, 6, 2);
    Pixel.ellipse(ctx, 20, 23, 14, 16, 'rgba(255,214,110,0.25)');
    Pixel.ellipse(ctx, 20, 22, 9, 11, 'rgba(255,228,140,0.22)');
    // 받침, 기둥(2px 밝은 면)
    R(ctx, 6, 58, 12, 6, OL); R(ctx, 7, 59, 10, 4, iron); R(ctx, 7, 59, 10, 1, ironHi);
    R(ctx, 9, 18, 6, 41, OL); R(ctx, 10, 18, 4, 41, iron); R(ctx, 10, 18, 1, 41, ironHi);
    R(ctx, 8, 30, 8, 3, OL); R(ctx, 9, 31, 6, 1, ironHi);
    // 상단에서 오른쪽으로 말린 굽은 팔
    R(ctx, 9, 10, 6, 9, OL); R(ctx, 10, 10, 4, 9, iron); R(ctx, 10, 10, 1, 9, ironHi);
    R(ctx, 10, 6, 10, 5, OL); R(ctx, 11, 7, 8, 3, iron); R(ctx, 11, 7, 7, 1, ironHi);
    R(ctx, 17, 8, 6, 4, OL); R(ctx, 18, 9, 4, 2, iron);
    R(ctx, 20, 10, 4, 5, OL); R(ctx, 21, 11, 2, 3, iron);
    R(ctx, 9, 4, 4, 3, OL); R(ctx, 10, 5, 2, 1, ironHi);
    // 매달린 등갓(10x12): 어두운 지붕 2px + 유리 + 좌상단 흰 하이라이트
    R(ctx, 16, 15, 12, 3, OL); R(ctx, 17, 16, 10, 1, iron); R(ctx, 19, 14, 6, 1, OL);
    R(ctx, 15, 18, 14, 14, OL); R(ctx, 16, 19, 12, 12, '#f6d36a'); R(ctx, 17, 20, 3, 3, '#ffffff'); R(ctx, 17, 23, 1, 3, '#fff4c8'); R(ctx, 25, 19, 3, 12, '#e4ab3a');
    R(ctx, 21, 19, 2, 12, iron); R(ctx, 16, 25, 12, 1, iron);
    R(ctx, 17, 32, 10, 2, OL); R(ctx, 20, 34, 4, 1, OL);
    return { canvas: c, ox: 12, oy: 63 };
  }

  function drawBarrelAt(ctx, x, y) {
    // 24×28
    R(ctx, x + 2, y, 20, 28, OL); R(ctx, x, y + 3, 24, 22, OL); R(ctx, x + 1, y + 1, 22, 26, OL);
    R(ctx, x + 2, y + 3, 20, 22, C.wood); R(ctx, x + 3, y + 1, 18, 26, C.wood);
    for (let xx = x + 6; xx < x + 22; xx += 4) R(ctx, xx, y + 2, 1, 24, C.woodLo);
    R(ctx, x + 3, y + 2, 2, 24, C.woodHi); R(ctx, x + 19, y + 2, 2, 24, C.woodLo);
    R(ctx, x + 1, y + 7, 22, 3, '#5c6670'); R(ctx, x + 1, y + 7, 22, 1, '#9aa4ad'); R(ctx, x + 1, y + 18, 22, 3, '#5c6670'); R(ctx, x + 1, y + 18, 22, 1, '#9aa4ad');
    Pixel.ellipse(ctx, x + 12, y + 2, 9, 2, '#d9a56a'); Pixel.ellipse(ctx, x + 12, y + 2, 6, 1, '#b07a44');
  }
  function renderBarrel() {
    const c = Pixel.make(26, 32);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 13, 30, 12, 3);
    drawBarrelAt(ctx, 1, 2);
    return { canvas: c, ox: 13, oy: 30 };
  }

  function drawCrateAt(ctx, x, y, s = 26) {
    const top = Math.round(s * 0.22);
    R(ctx, x - 1, y - 1, s + 2, s + 2, OL);
    R(ctx, x, y, s, s, '#c89a5a');
    R(ctx, x, y, s, top, '#dcb070'); R(ctx, x, y + top, s, 1, OL);
    R(ctx, x + s - 4, y + top + 1, 4, s - top - 1, '#a8793f');
    for (let yy = y + top + 6; yy < y + s - 2; yy += 6) R(ctx, x + 1, yy, s - 2, 1, '#8b5a2b');
    for (let k = 0; k < s - top - 2; k++) { px(ctx, x + 1 + Math.round((k * (s - 3)) / (s - top - 3)), y + top + 1 + k, '#8b5a2b'); }
    R(ctx, x + 2, y + top + 2, 1, s - top - 4, '#8b5a2b'); R(ctx, x + s - 3, y + top + 2, 1, s - top - 4, '#6a4322');
    for (const [nx, ny] of [[3, top + 3], [s - 4, top + 3], [3, s - 4], [s - 4, s - 4]]) px(ctx, x + nx, y + ny, '#5c4a3a');
    for (let xx = x + 4; xx < x + s - 2; xx += 6) R(ctx, xx, y + 1, 1, top - 1, '#c49a5a');
  }
  function renderCrate() {
    const c = Pixel.make(30, 32);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 15, 30, 14, 3);
    drawCrateAt(ctx, 2, 3, 26);
    return { canvas: c, ox: 15, oy: 30 };
  }
  function renderCrateStack() {
    const c = Pixel.make(50, 46);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 25, 44, 24, 4);
    drawCrateAt(ctx, 2, 20, 22); drawCrateAt(ctx, 26, 20, 22); drawCrateAt(ctx, 13, 1, 22);
    return { canvas: c, ox: 25, oy: 44 };
  }

  function renderWell() {
    const c = Pixel.make(72, 86);
    const ctx = c.getContext('2d');
    const cx = 36;
    shadowEllipse(ctx, cx, 83, 32, 6);
    // 돌 우물통(원통): 아래 타원 + 위 타원
    Pixel.ellipse(ctx, cx, 70, 31, 12, C.stoneOl);
    R(ctx, cx - 31, 56, 63, 14, C.stoneOl);
    Pixel.ellipse(ctx, cx, 70, 30, 11, C.stone); R(ctx, cx - 30, 56, 61, 14, C.stone);
    for (let xx = cx - 28; xx < cx + 30; xx += 10) { R(ctx, xx, 58, 1, 20, C.stoneLo); R(ctx, xx + 5, 68, 1, 12, C.stoneLo); }
    R(ctx, cx - 30, 66, 61, 1, C.stoneLo); R(ctx, cx + 16, 58, 14, 20, 'rgba(0,0,0,0.12)');
    Pixel.ellipse(ctx, cx, 56, 31, 12, C.stoneOl); Pixel.ellipse(ctx, cx, 56, 30, 11, C.stoneHi); Pixel.ellipse(ctx, cx, 57, 28, 9, C.stone);
    Pixel.ellipse(ctx, cx, 57, 22, 7, C.stoneOl); Pixel.ellipse(ctx, cx, 57, 21, 6, '#2b4a6b'); Pixel.ellipse(ctx, cx, 58, 17, 4, '#3f78b4'); R(ctx, cx - 12, 56, 6, 1, '#9fd0f5'); R(ctx, cx - 5, 58, 3, 1, '#9fd0f5');
    // 기둥
    for (const pxx of [cx - 26, cx + 22]) { R(ctx, pxx - 1, 14, 7, 44, OL); R(ctx, pxx, 14, 5, 44, C.wood); R(ctx, pxx, 14, 1, 44, C.woodHi); R(ctx, pxx + 4, 14, 1, 44, C.woodLo); }
    // 도르래 축 + 손잡이 + 밧줄 + 양동이
    R(ctx, cx - 27, 30, 56, 5, OL); R(ctx, cx - 26, 31, 54, 3, C.woodLo); R(ctx, cx - 26, 31, 54, 1, C.wood);
    R(ctx, cx - 6, 29, 14, 7, OL); R(ctx, cx - 5, 30, 12, 5, C.woodHi); for (let xx = cx - 4; xx < cx + 7; xx += 2) px(ctx, xx, 32, C.woodLo);
    R(ctx, cx + 28, 28, 3, 7, OL); R(ctx, cx + 30, 26, 5, 3, OL); R(ctx, cx + 33, 24, 3, 5, OL); px(ctx, cx + 29, 30, C.woodHi); px(ctx, cx + 34, 26, C.woodHi);
    R(ctx, cx, 36, 1, 10, '#d9c39a'); px(ctx, cx + 1, 40, '#b59c6e');
    R(ctx, cx - 6, 46, 13, 11, OL); R(ctx, cx - 5, 47, 11, 9, '#7d8790'); R(ctx, cx - 5, 47, 3, 9, '#a3adb6'); R(ctx, cx - 5, 50, 11, 1, '#4f5860'); R(ctx, cx - 5, 47, 11, 1, '#c3ccd3');
    for (let k = 0; k < 5; k++) { px(ctx, cx - 5 + k, 45 - k, OL); px(ctx, cx + 5 - k, 45 - k, OL); } R(ctx, cx - 1, 41, 3, 1, OL);
    // 지붕(기와, 사다리꼴)
    for (let k = 0; k < 20; k++) { const hw = 14 + k * 1.3; R(ctx, cx - Math.round(hw) - 1, 6 + k, Math.round(hw) * 2 + 3, 1, OL); }
    for (let k = 0; k < 18; k++) { const hw = 14 + k * 1.3; const col = k % 4 === 3 ? '#6e4a42' : (k < 6 ? '#b8857a' : '#9c6a5e'); R(ctx, cx - Math.round(hw), 7 + k, Math.round(hw) * 2 + 1, 1, col); if (k % 4 === 0) for (let xx = cx - Math.round(hw) + ((k / 4) % 2) * 5; xx < cx + hw; xx += 10) px(ctx, xx, 7 + k + 2, '#6e4a42'); }
    R(ctx, cx - 16, 4, 33, 3, OL); R(ctx, cx - 15, 5, 31, 1, '#cfa095');
    R(ctx, cx - 39, 25, 78, 2, OL); R(ctx, cx - 38, 24, 76, 1, '#6e4a42');
    return { canvas: c, ox: cx, oy: 82 };
  }

  // 좌판: 뒤(차양+뒷천+기둥 윗부분)와 앞(바구니+카운터)을 두 캔버스로 나눠 상인이 그 사이에 서게 한다.
  // 캔버스 104×100, 발 기준 oy 96. 차양 y2~34(스캘럽 30~34), 뒷천 34~59, 기둥 14~70, 바구니 62, 카운터 66~95
  function renderStall(color) {
    const back = Pixel.make(104, 100), front = Pixel.make(104, 100);
    const b = back.getContext('2d'), f = front.getContext('2d');
    shadowEllipse(f, 52, 97, 48, 4);
    // --- 뒤: 뒷천(어두운 색천 + 10px 세로 줄) ---
    R(b, 1, 34, 102, 26, sh(color, -0.55)); for (let xx = 10; xx < 102; xx += 10) R(b, xx, 34, 1, 26, sh(color, -0.65)); R(b, 1, 34, 102, 1, sh(color, -0.7));
    // 기둥(뒤쪽 캔버스에 전체 높이)
    for (const pxx of [4, 94]) { R(b, pxx - 1, 14, 7, 56, OL); R(b, pxx, 14, 5, 56, C.wood); R(b, pxx, 14, 1, 56, C.woodHi); R(b, pxx + 4, 14, 1, 56, C.woodLo); }
    // 차양(뒤 띠 + 앞면 줄무늬 + 스캘럽)
    R(b, 0, 2, 104, 8, OL); R(b, 1, 3, 102, 6, sh(color, -0.35));
    R(b, 0, 9, 104, 22, OL);
    for (let xx = 0; xx < 102; xx += 10) { const c2 = (xx / 10) % 2 ? '#f6f0e4' : color; R(b, 1 + xx, 10, Math.min(10, 102 - xx), 20, c2); R(b, 1 + xx, 26, Math.min(10, 102 - xx), 4, sh(c2, -0.12)); }
    R(b, 1, 10, 102, 1, 'rgba(255,255,255,0.5)');
    for (let xx = 0; xx < 102; xx += 10) { const c2 = (xx / 10) % 2 ? '#f6f0e4' : color; R(b, 2 + xx, 31, 8, 1, OL); R(b, 3 + xx, 32, 6, 1, OL); R(b, 4 + xx, 33, 4, 1, OL); R(b, 2 + xx, 30, 8, 1, sh(c2, -0.12)); R(b, 3 + xx, 31, 6, 1, sh(c2, -0.12)); R(b, 4 + xx, 32, 4, 1, sh(c2, -0.12)); }
    R(b, 1, 34, 102, 2, 'rgba(0,0,0,0.18)');
    // --- 앞: 카운터(상자) ---
    R(f, 1, 66, 102, 30, OL);
    R(f, 2, 67, 100, 28, C.wood); R(f, 2, 67, 100, 7, C.woodHi); R(f, 2, 74, 100, 1, OL);
    for (let xx = 8; xx < 100; xx += 10) R(f, xx, 76, 1, 18, C.woodLo); R(f, 2, 86, 100, 1, C.woodLo); R(f, 96, 75, 6, 20, sh(C.wood, -0.2));
    // 천 덮개(색)
    R(f, 2, 67, 100, 5, color); R(f, 2, 67, 100, 1, sh(color, 0.35)); for (let xx = 4; xx < 100; xx += 8) R(f, xx, 72, 4, 2, color);
    // 상품: 바구니 3개 + 과일, 빵
    const basket = (bx, by, fruit) => {
      R(f, bx - 1, by - 1, 26, 12, OL); R(f, bx, by, 24, 10, '#b07a44'); for (let xx = bx + 2; xx < bx + 24; xx += 4) R(f, xx, by + 1, 1, 8, '#8b5a2b'); R(f, bx, by, 24, 1, '#d9a56a');
      for (let k = 0; k < 5; k++) { const fx = bx + 3 + k * 4 + (k % 2) * 1, fy = by - 3 + (k % 2) * 2; Pixel.circle(f, fx, fy, 2, OL); Pixel.circle(f, fx, fy, 1, fruit); px(f, fx - 1, fy - 1, sh(fruit, 0.45)); }
    };
    basket(8, 60, '#d9534c'); basket(40, 60, '#e6c25a'); basket(72, 60, '#7fb86a');
    R(f, 46, 54, 12, 6, OL); R(f, 47, 55, 10, 4, '#d9a05a'); R(f, 47, 55, 10, 1, '#f0c88a'); px(f, 50, 56, '#a86d35'); px(f, 53, 56, '#a86d35');
    return { back: { canvas: back, ox: 52, oy: 96 }, front: { canvas: front, ox: 52, oy: 96 } };
  }

  // 만국기 기둥(소품): 밑단 기준
  function renderBuntingPole() {
    const c = Pixel.make(12, 30);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 6, 28, 5, 2);
    R(ctx, 3, 7, 6, 21, OL); R(ctx, 4, 8, 4, 19, C.wood); R(ctx, 4, 8, 1, 19, C.woodHi); R(ctx, 7, 8, 1, 19, C.woodLo);
    R(ctx, 2, 4, 8, 4, OL); R(ctx, 3, 5, 6, 2, C.woodHi); px(ctx, 5, 3, OL);
    return { canvas: c, ox: 6, oy: 28 };
  }

  function renderSignPost() {
    const c = Pixel.make(36, 50);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 18, 48, 6, 2);
    R(ctx, 15, 8, 6, 41, OL); R(ctx, 16, 8, 4, 40, C.wood); R(ctx, 16, 8, 1, 40, C.woodHi); R(ctx, 19, 8, 1, 40, C.woodLo);
    const board = (x, y, w, dir) => {
      R(ctx, x - 1, y - 1, w + 2, 12, OL); R(ctx, x, y, w, 10, C.wood); R(ctx, x, y, w, 1, C.woodHi); R(ctx, x, y + 9, w, 1, C.woodLo);
      for (let k = 0; k < 5; k++) { const tx = dir > 0 ? x + w + k : x - 1 - k; R(ctx, tx, y + k, 1, 10 - k * 2, OL); if (k < 4) R(ctx, tx, y + 1 + k, 1, 8 - k * 2, C.wood); }
      R(ctx, x + 4, y + 3, w - 8, 1, C.woodLo); R(ctx, x + 6, y + 6, w - 12, 1, C.woodLo);
    };
    board(4, 4, 24, 1); board(8, 20, 24, -1);
    return { canvas: c, ox: 18, oy: 47 };
  }

  function renderBench() {
    const c = Pixel.make(44, 26);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 22, 24, 20, 3);
    // 등받이
    R(ctx, 3, 1, 38, 9, OL); R(ctx, 4, 2, 36, 3, C.wood); R(ctx, 4, 2, 36, 1, C.woodHi); R(ctx, 4, 6, 36, 2, C.wood); R(ctx, 4, 7, 36, 1, C.woodLo);
    // 다리(뒤)
    for (const lx of [6, 35]) { R(ctx, lx - 1, 9, 5, 15, OL); R(ctx, lx, 9, 3, 14, C.woodLo); px(ctx, lx, 9, C.wood); }
    // 좌판
    R(ctx, 1, 11, 42, 8, OL); R(ctx, 2, 12, 40, 6, C.wood); R(ctx, 2, 12, 40, 1, C.woodHi); R(ctx, 2, 15, 40, 1, C.woodLo); R(ctx, 2, 17, 40, 1, C.woodLo);
    for (const lx of [6, 35]) { R(ctx, lx, 19, 3, 4, C.woodLo); R(ctx, lx - 1, 23, 5, 1, OL); }
    return { canvas: c, ox: 22, oy: 23 };
  }

  function renderPlanter() {
    const c = Pixel.make(24, 28);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 12, 26, 9, 2);
    // 화분(테라코타)
    for (let k = 0; k < 10; k++) { const hw = 8 - Math.floor(k / 4); R(ctx, 12 - hw - 1, 16 + k, hw * 2 + 3, 1, OL); R(ctx, 12 - hw, 16 + k, hw * 2 + 1, 1, k < 2 ? '#d98c5a' : '#c57b4a'); px(ctx, 12 - hw, 16 + k, '#e6a47a'); R(ctx, 12 + hw - 1, 16 + k, 2, 1, '#9c5a34'); }
    R(ctx, 2, 15, 20, 1, OL);
    // 덤불 + 꽃
    Pixel.circle(ctx, 12, 10, 8, OL); Pixel.circle(ctx, 12, 10, 7, '#3c7a3a'); Pixel.circle(ctx, 11, 9, 5, '#5aa64a'); Pixel.circle(ctx, 9, 7, 3, '#8cd075');
    for (const [fx, fy, col] of [[7, 8, '#f06a6a'], [14, 5, '#f7d35b'], [16, 11, '#f49ac1'], [10, 13, '#ffffff']]) { R(ctx, fx, fy, 2, 2, col); px(ctx, fx, fy, sh(col, 0.4)); }
    return { canvas: c, ox: 12, oy: 25 };
  }

  function renderClothesline() {
    const c = Pixel.make(70, 50);
    const ctx = c.getContext('2d');
    for (const pxx of [3, 63]) { shadowEllipse(ctx, pxx + 2, 48, 4, 1); R(ctx, pxx - 1, 6, 6, 42, OL); R(ctx, pxx, 6, 4, 41, C.wood); R(ctx, pxx, 6, 1, 41, C.woodHi); R(ctx, pxx - 3, 5, 10, 3, OL); R(ctx, pxx - 2, 6, 8, 1, C.woodHi); }
    for (let x = 7; x < 63; x++) { const t = (x - 7) / 56; px(ctx, x, 8 + Math.round(Math.sin(t * Math.PI) * 4), '#d9c39a'); }
    const cloth = (x, y, w, h, col, sleeves) => {
      R(ctx, x - 1, y - 1, w + 2, h + 2, OL); R(ctx, x, y, w, h, col); R(ctx, x, y, 1, h, sh(col, 0.3)); R(ctx, x + w - 2, y, 2, h, sh(col, -0.2));
      if (sleeves) { R(ctx, x - 4, y, 4, 5, OL); R(ctx, x - 3, y + 1, 3, 3, col); R(ctx, x + w, y, 4, 5, OL); R(ctx, x + w, y + 1, 3, 3, sh(col, -0.2)); }
      for (const cx of [x + 1, x + w - 2]) { R(ctx, cx, y - 3, 1, 3, C.woodLo); }
    };
    cloth(12, 12, 12, 14, '#f4efe4', true); cloth(31, 12, 8, 18, '#5a7fb8', false); R(ctx, 34, 20, 2, 10, '#3f5f90'); cloth(46, 12, 11, 11, '#e46a6a', false); R(ctx, 47, 15, 9, 1, '#f4efe4'); R(ctx, 47, 19, 9, 1, '#f4efe4');
    return { canvas: c, ox: 35, oy: 47 };
  }

  function renderFlowerbed() {
    const c = Pixel.make(66, 26);
    const ctx = c.getContext('2d');
    // 뒤 테두리, 흙, 앞 테두리
    R(ctx, 0, 2, 66, 5, OL); R(ctx, 1, 3, 64, 3, C.wood); R(ctx, 1, 3, 64, 1, C.woodHi);
    R(ctx, 1, 6, 64, 14, '#6b4a30'); R(ctx, 1, 6, 64, 1, '#4f3522');
    const rnd = Pixel.rng(77);
    for (let i = 0; i < 60; i++) px(ctx, 2 + Math.floor(rnd() * 62), 7 + Math.floor(rnd() * 12), rnd() < 0.5 ? '#7d5a3c' : '#55391f');
    const cols = ['#f06a6a', '#f7d35b', '#f49ac1', '#ffffff', '#8ab7f0'];
    for (let i = 0; i < 22; i++) { const fx = 3 + Math.floor(rnd() * 58), fy = 6 + Math.floor(rnd() * 10); const col = cols[Math.floor(rnd() * cols.length)]; R(ctx, fx - 1, fy + 2, 3, 1, '#4f8f3c'); px(ctx, fx, fy + 3, '#3c7a3a'); px(ctx, fx - 1, fy, col); px(ctx, fx + 1, fy, col); px(ctx, fx, fy - 1, col); px(ctx, fx, fy + 1, col); px(ctx, fx, fy, sh(col, -0.35)); }
    R(ctx, 0, 18, 66, 7, OL); R(ctx, 1, 19, 64, 5, C.wood); R(ctx, 1, 19, 64, 1, C.woodHi); R(ctx, 1, 23, 64, 1, C.woodLo);
    for (let xx = 9; xx < 64; xx += 12) R(ctx, xx, 20, 1, 4, C.woodLo);
    return { canvas: c, ox: 33, oy: 24 };
  }

  function renderBucket() {
    const c = Pixel.make(16, 18);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 8, 16, 6, 2);
    for (let k = 0; k < 7; k++) { px(ctx, 3 + k, 2 + (k < 3 ? 2 - k : 0), OL); px(ctx, 12 - k, 2 + (k < 3 ? 2 - k : 0), OL); }
    R(ctx, 2, 5, 12, 11, OL); R(ctx, 3, 6, 10, 9, C.wood); R(ctx, 3, 6, 2, 9, C.woodHi); R(ctx, 11, 6, 2, 9, C.woodLo);
    R(ctx, 2, 9, 12, 2, '#5c6670'); R(ctx, 2, 9, 12, 1, '#9aa4ad'); Pixel.ellipse(ctx, 8, 6, 5, 1, '#3f78b4'); px(ctx, 6, 6, '#9fd0f5');
    return { canvas: c, ox: 8, oy: 15 };
  }

  // 손수레: 큰 바퀴 + 짐칸(자루·호박)
  function renderCart() {
    const c = Pixel.make(70, 44);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 34, 42, 30, 4);
    // 손잡이
    R(ctx, 54, 20, 14, 4, OL); R(ctx, 55, 21, 12, 2, C.wood); px(ctx, 55, 21, C.woodHi);
    // 짐칸
    R(ctx, 5, 14, 50, 22, OL); R(ctx, 6, 15, 48, 20, C.wood); R(ctx, 6, 15, 48, 5, C.woodHi); R(ctx, 6, 20, 48, 1, OL);
    for (let xx = 12; xx < 54; xx += 8) R(ctx, xx, 21, 1, 13, C.woodLo); R(ctx, 6, 33, 48, 2, C.woodLo); R(ctx, 50, 21, 4, 14, sh(C.wood, -0.2));
    // 짐: 자루 2개 + 호박
    for (const [sx, sy] of [[9, 4], [24, 6]]) { Pixel.ellipse(ctx, sx + 7, sy + 7, 8, 7, OL); Pixel.ellipse(ctx, sx + 7, sy + 7, 7, 6, '#cfb27a'); Pixel.ellipse(ctx, sx + 5, sy + 5, 3, 2, '#e6cd99'); R(ctx, sx + 5, sy - 1, 4, 3, OL); R(ctx, sx + 6, sy, 2, 2, '#b4955e'); R(ctx, sx + 3, sy + 2, 8, 1, '#8a6a3a'); }
    Pixel.ellipse(ctx, 46, 12, 7, 6, OL); Pixel.ellipse(ctx, 46, 12, 6, 5, '#e8862e'); R(ctx, 43, 8, 1, 8, '#b85f1e'); R(ctx, 49, 8, 1, 8, '#b85f1e'); px(ctx, 43, 9, '#f6b06a'); px(ctx, 44, 8, '#f6b06a'); R(ctx, 45, 5, 2, 3, '#4f8f3c');
    // 바퀴
    for (const wx of [14, 46]) { Pixel.circle(ctx, wx, 34, 8, OL); Pixel.circle(ctx, wx, 34, 7, C.woodLo); Pixel.circle(ctx, wx, 34, 5, C.wood); R(ctx, wx - 5, 34, 11, 1, C.woodLo); R(ctx, wx, 29, 1, 11, C.woodLo); Pixel.circle(ctx, wx, 34, 1, OL); px(ctx, wx - 3, 31, C.woodHi); }
    return { canvas: c, ox: 34, oy: 41 };
  }

  // 게시판: 기둥 2개 + 판 + 종이 쪽지
  function renderBoard() {
    const c = Pixel.make(44, 46);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 22, 44, 16, 2);
    for (const pxx of [5, 35]) { R(ctx, pxx - 1, 4, 6, 40, OL); R(ctx, pxx, 4, 4, 39, C.wood); R(ctx, pxx, 4, 1, 39, C.woodHi); R(ctx, pxx + 3, 4, 1, 39, C.woodLo); }
    R(ctx, 2, 0, 40, 5, OL); R(ctx, 3, 1, 38, 3, C.woodLo); R(ctx, 3, 1, 38, 1, C.wood);
    R(ctx, 3, 6, 38, 26, OL); R(ctx, 4, 7, 36, 24, '#a8794a'); R(ctx, 4, 7, 36, 1, C.woodHi); R(ctx, 38, 8, 2, 23, C.woodLo); for (let yy = 13; yy < 30; yy += 6) R(ctx, 5, yy, 33, 1, sh('#a8794a', -0.15));
    const paper = (x, y, w, h) => { R(ctx, x, y, w, h, '#f6f0e4'); R(ctx, x, y, w, 1, '#ffffff'); R(ctx, x + w - 1, y, 1, h, '#d6cdbb'); for (let yy = y + 2; yy < y + h - 1; yy += 2) R(ctx, x + 1, yy, w - 3, 1, '#9a8f80'); px(ctx, x + Math.floor(w / 2), y - 1, '#c24a46'); };
    paper(7, 10, 11, 9); paper(21, 9, 9, 12); paper(31, 11, 7, 8); paper(9, 21, 8, 8); paper(20, 23, 14, 6);
    return { canvas: c, ox: 22, oy: 43 };
  }

  function renderHaybale() {
    const c = Pixel.make(32, 26);
    const ctx = c.getContext('2d');
    shadowEllipse(ctx, 16, 24, 15, 3);
    R(ctx, 2, 2, 28, 20, OL); R(ctx, 1, 4, 30, 16, OL);
    R(ctx, 3, 3, 26, 18, '#e0c45a'); R(ctx, 2, 5, 28, 14, '#e0c45a'); R(ctx, 3, 3, 26, 3, '#f0d878'); R(ctx, 25, 5, 4, 15, '#c4a53e');
    for (let yy = 7; yy < 20; yy += 3) for (let xx = 4 + (yy % 2) * 2; xx < 26; xx += 5) R(ctx, xx, yy, 2, 1, '#b9983a');
    R(ctx, 9, 3, 2, 18, '#8a6a2a'); R(ctx, 21, 3, 2, 18, '#8a6a2a');
    return { canvas: c, ox: 16, oy: 23 };
  }

  // ---------- 만국기 (최상단 레이어) ----------
  function renderOverlay() {
    const c = Pixel.make(W, H);
    const ctx = c.getContext('2d');
    for (const b of BUNTING) {
      const x0 = Math.round(b.x0 * TILE), x1 = Math.round(b.x1 * TILE), y = Math.round(b.y * TILE) - 22; // 줄은 기둥 머리(밑단 -22px) 높이
      const len = x1 - x0;
      const sagAt = (x) => Math.round(Math.sin(((x - x0) / len) * Math.PI) * 12);
      // 줄(2px: 어두운 선 + 밝은 선)
      for (let x = x0; x < x1; x++) { const s = sagAt(x); px(ctx, x, y + s, OL); px(ctx, x, y + s + 1, '#d9c39a'); }
      // 깃발: 폭 10, 높이 9, 간격 14
      let k = 0;
      for (let x = x0 + 6; x + 10 < x1; x += 14) {
        const col = b.colors[k++ % b.colors.length];
        const s = sagAt(x + 5) + 2;
        for (let r = 0; r < 10; r++) { const hw = 5 - Math.floor(r / 2); R(ctx, x + 5 - hw - 1, y + s + r, hw * 2 + 3, 1, OL); }
        for (let r = 0; r < 9; r++) { const hw = 5 - Math.floor((r + 1) / 2); R(ctx, x + 5 - hw, y + s + r, hw * 2 + 1, 1, col); }
        R(ctx, x + 5 - 4, y + s + 1, 2, 3, sh(col, 0.35)); R(ctx, x + 8, y + s + 1, 2, 5, sh(col, -0.25));
      }
    }
    return c;
  }

  // ---------- 조립 ----------
  function build() {
    buildSolid();
    const ground = renderGround();
    const overlay = renderOverlay();
    const objects = [];
    const cache = {};
    const get = (key, fn) => cache[key] || (cache[key] = fn());
    for (const b of BUILDINGS) {
      const r = b.kind === 'gate' ? renderGate(b) : (b.kind === 'temple' ? renderTemple(b) : renderHouse(b));
      const door = doorPoint(b);
      objects.push({
        kind: 'building', ref: b, canvas: r.canvas,
        x: b.x * TILE - r.ox, y: b.y * TILE - r.oy,
        sortY: (b.y + b.h) * TILE, door,
        label: { x: (b.x + b.w / 2) * TILE, y: b.y * TILE - r.oy + (r.labelY !== undefined ? r.labelY : r.oy) },
        rect: { x: b.x * TILE, y: b.y * TILE, w: b.w * TILE, h: b.h * TILE },
      });
    }
    for (const p of PROPS) {
      let r;
      switch (p.type) {
        case 'tree': r = get('tree_' + p.size, () => renderTree(p.size)); break;
        case 'lamp': r = get('lamp', renderLamp); break;
        case 'barrel': r = get('barrel', renderBarrel); break;
        case 'crate': r = get('crate', renderCrate); break;
        case 'cratestack': r = get('cratestack', renderCrateStack); break;
        case 'well': r = get('well', renderWell); break;
        case 'stall': {
          const st = get('stall_' + p.color, () => renderStall(p.color));
          const sx = Math.round(p.x * TILE), sy = Math.round(p.y * TILE);
          objects.push({ kind: 'prop', ref: p, canvas: st.back.canvas, x: sx - st.back.ox, y: sy - st.back.oy, sortY: sy - 40 });
          objects.push({ kind: 'prop', ref: p, canvas: st.front.canvas, x: sx - st.front.ox, y: sy - st.front.oy, sortY: sy });
          continue;
        }
        case 'buntingpole': r = get('buntingpole', renderBuntingPole); break;
        case 'sign': r = get('sign', renderSignPost); break;
        case 'bench': r = get('bench', renderBench); break;
        case 'planter': r = get('planter', renderPlanter); break;
        case 'clothesline': r = get('clothesline', renderClothesline); break;
        case 'flowerbed': r = get('flowerbed', renderFlowerbed); break;
        case 'bucket': r = get('bucket', renderBucket); break;
        case 'haybale': r = get('haybale', renderHaybale); break;
        case 'cart': r = get('cart', renderCart); break;
        case 'board': r = get('board', renderBoard); break;
        default: continue;
      }
      const pxx = Math.round(p.x * TILE), pyy = Math.round(p.y * TILE);
      objects.push({ kind: 'prop', ref: p, canvas: r.canvas, x: pxx - r.ox, y: pyy - r.oy, sortY: pyy });
    }
    return { ground, overlay, objects };
  }

  // 특정 타일에 해당하는 건물 찾기
  function buildingAtTile(i, j) {
    for (const b of BUILDINGS) if (i >= b.x && i < b.x + b.w && j >= b.y && j < b.y + b.h) return b;
    return null;
  }

  // ---------- 길찾기 (A*, 8방향, 모서리 끼임 방지) ----------
  const HALF = TILE / 2;
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
        while (k !== undefined) { path.push({ x: (k % COLS) * TILE + HALF, y: Math.floor(k / COLS) * TILE + HALF }); k = came.get(k); }
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
    const n = Math.ceil(Math.hypot(dx, dy) / 4);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (!canStand(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  return { TILE, COLS, ROWS, W, H, BUILDINGS, PROPS, build, canStand, isSolidTile, findPath, lineClear, doorPoint, buildingAtTile, nearestWalkable };
})();
