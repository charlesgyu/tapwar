// 동굴 바이옴 타일셋 — 6~10층. DungeonTiles.registerBiome('cave', ...) 로 등록한다.
// 타일: 0 암벽(오토타일), 1 동굴 바닥(회갈색 돌), 2 지하수, 3 장식(수정·발광 버섯·뼈·종유석 그림자), 4 바위 더미(통행 불가)
// 규칙: 좌상단 광원, 외곽선 따뜻한 갈색 #3b2a2a, 재질당 3톤, 정수 좌표·fillRect 만. 타일 캔버스는 변주별로 캐시한다.
(() => {
  const O = '#3b2a2a';                       // 외곽선
  // 바닥(회갈색 돌) — 밝음/기본/어둠 + 균열
  const FL = { hi: '#8c8279', mid: '#746b63', lo: '#5e564f', crack: '#463f3a', pebble: '#9a9087', pebbleLo: '#655d56' };
  // 암벽 안쪽(어두운 바위) 3톤, 절벽 면 3톤
  const RK = { hi: '#3e3542', mid: '#2e2731', lo: '#221c26', face: '#6a5a5c', faceHi: '#857373', faceLo: '#4b3f43', rim: '#7d6f70' };
  // 지하수 3톤 + 반사
  const WT = { hi: '#2f5579', mid: '#1f3a58', lo: '#15283f', glint: '#78a9cc', foam: '#4e7fa6', shore: '#2d2630' };
  // 수정(하늘색/보라)
  const CR_CYAN = { hi: '#dffbff', mid: '#7fe2f2', lo: '#3fa9c9', glow: 'rgba(120,220,245,0.16)' };
  const CR_PURP = { hi: '#f1dcff', mid: '#b98cf0', lo: '#7a4fc0', glow: 'rgba(190,140,255,0.16)' };
  const MU = { cap: '#8fe8a0', capHi: '#d6ffd9', capLo: '#4faf6a', stem: '#cfc7b4', stemLo: '#948c7c', glow: 'rgba(150,255,170,0.2)' };
  const BN = { hi: '#efe6d2', mid: '#cfc4ad', lo: '#9d9382' };

  const T = 32;
  const cache = new Map();

  // 결정적 해시 (타일 좌표 + 층) → 0..1
  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function cached(key, w, h, draw) {
    let c = cache.get(key);
    if (!c) { c = Pixel.make(w, h); draw(c.getContext('2d')); cache.set(key, c); }
    return c;
  }
  const R = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

  // ---------- 바닥 ----------
  // 돌바닥: 불규칙 판석 느낌 — 기본 톤 위에 밝은 얼룩·어두운 얼룩·자갈·균열
  function drawFloor(ctx, variant) {
    const rnd = Pixel.rng(1000 + variant);
    R(ctx, 0, 0, T, T, FL.mid);
    // 돌바닥 색 변화: 모서리를 깎은 둥근 얼룩(밝음/어둠), 테두리 선 없음
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(rnd() * 26), y = Math.floor(rnd() * 26), w = 6 + Math.floor(rnd() * 9), h = 4 + Math.floor(rnd() * 6);
      const col = rnd() < 0.55 ? FL.hi : FL.lo;
      R(ctx, x + 1, y, w - 2, h, col); R(ctx, x, y + 1, w, h - 2, col);
    }
    // 가는 균열 하나(대각선으로 꺾임) — 변주 절반에만
    if (variant % 2 === 0) {
      let x = 4 + Math.floor(rnd() * 20), y = 2 + Math.floor(rnd() * 10);
      for (let k = 0; k < 7 + Math.floor(rnd() * 6) && y < T - 1; k++) { R(ctx, x, y, 1, 1, FL.crack); if (rnd() < 0.5) R(ctx, x + 1, y, 1, 1, FL.lo); y++; if (rnd() < 0.5) x += rnd() < 0.6 ? 1 : -1; }
    }
    // 질감 점(적게)
    for (let k = 0; k < 10; k++) {
      const x = Math.floor(rnd() * T), y = Math.floor(rnd() * T), r = rnd();
      R(ctx, x, y, 1 + (r < 0.3 ? 1 : 0), 1, r < 0.5 ? FL.hi : FL.lo);
    }
    // 자갈(2x2, 좌상 밝음·우하 그늘)
    const np = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < np; k++) {
      const x = 1 + Math.floor(rnd() * 28), y = 1 + Math.floor(rnd() * 28);
      R(ctx, x, y, 2, 2, FL.pebble); R(ctx, x + 1, y + 1, 1, 1, FL.pebbleLo); R(ctx, x, y + 2, 2, 1, FL.lo);
    }
  }
  function floorTile(v) { return cached('f' + v, T, T, ctx => drawFloor(ctx, v)); }

  // ---------- 암벽 (오토타일) ----------
  // mask 비트: 1 북 개방, 2 동 개방, 4 남 개방, 8 서 개방, 16 북서(대각), 32 북동, 64 남동, 128 남서
  function drawWall(ctx, mask, variant) {
    const rnd = Pixel.rng(5000 + variant * 7 + mask);
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    const FACE_Y = 14; // 절벽 면 시작(남쪽 개방 시)
    // 안쪽 어두운 바위: 큰 덩어리 몇 개(좌상 하이라이트·우하 그늘), 점은 적게
    R(ctx, 0, 0, T, T, RK.mid);
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(rnd() * 24) - 2, y = Math.floor(rnd() * 24) - 2, w = 8 + Math.floor(rnd() * 10), h = 6 + Math.floor(rnd() * 8);
      R(ctx, x + 1, y, w - 2, h, RK.lo); R(ctx, x, y + 1, w, h - 2, RK.lo);
      R(ctx, x + 2, y + 1, w - 4, h - 2, RK.mid); R(ctx, x + 1, y + 2, w - 2, h - 4, RK.mid);
      R(ctx, x + 2, y + 1, w - 5, 1, RK.hi); R(ctx, x + 1, y + 2, 1, h - 5, RK.hi);
      R(ctx, x + 2, y + h - 2, w - 4, 1, RK.lo);
    }
    for (let k = 0; k < 8; k++) R(ctx, Math.floor(rnd() * T), Math.floor(rnd() * T), 1 + Math.floor(rnd() * 2), 1, rnd() < 0.5 ? RK.hi : RK.lo);

    // 남쪽 개방: 절벽 면 — 두 줄의 돌 블록(엇갈린 줄눈), 좌상 밝음, 바닥 쪽 그늘 띠 + 외곽선
    if (S) {
      R(ctx, 0, FACE_Y, T, T - FACE_Y, RK.face);
      R(ctx, 0, FACE_Y, T, 1, O); R(ctx, 0, FACE_Y + 1, T, 1, RK.rim);
      const rows = [[FACE_Y + 2, 7, 0], [FACE_Y + 9, 7, 4]];
      for (const [ry, rh, off] of rows) {
        let x = -off;
        while (x < T) {
          const w = 7 + Math.floor(rnd() * 5);
          R(ctx, x + 1, ry, w - 2, 1, RK.faceHi);        // 블록 윗면 밝음
          R(ctx, x + 1, ry + 1, 1, rh - 2, RK.faceHi);   // 블록 왼쪽 밝음
          R(ctx, x + w - 1, ry, 1, rh, RK.faceLo);       // 세로 줄눈
          R(ctx, x + 1, ry + rh - 1, w - 1, 1, RK.faceLo); // 가로 줄눈
          if (rnd() < 0.4) R(ctx, x + 3, ry + 3, 2, 1, RK.faceLo); // 흠집
          x += w;
        }
      }
      R(ctx, 0, T - 3, T, 2, RK.faceLo); R(ctx, 0, T - 1, T, 1, O);
    }
    const sideH = S ? FACE_Y : T;
    // 북쪽 개방: 벽 상단 테두리(외곽선 + 밝은 능선)
    if (N) { R(ctx, 0, 0, T, 1, O); R(ctx, 0, 1, T, 2, RK.rim); R(ctx, 0, 3, T, 1, RK.hi); for (let x = 2; x < T; x += 7) R(ctx, x, 1, 2, 1, '#9a8c8c'); }
    // 서쪽 개방: 왼쪽 밝은 테두리(광원 쪽)
    if (W) { R(ctx, 0, 0, 1, T, O); R(ctx, 1, 0, 2, sideH, RK.rim); R(ctx, 3, 0, 1, sideH, RK.hi); if (S) R(ctx, 1, FACE_Y, 2, T - FACE_Y - 1, RK.faceHi); }
    // 동쪽 개방: 오른쪽 그늘 테두리
    if (E) { R(ctx, T - 1, 0, 1, T, O); R(ctx, T - 4, 0, 3, sideH, RK.lo); R(ctx, T - 2, 0, 1, sideH, '#4a3f48'); if (S) R(ctx, T - 3, FACE_Y, 2, T - FACE_Y - 1, RK.faceLo); }
    // 대각 모서리(인접 둘은 벽, 대각만 열림) → 작은 모서리 외곽선
    if ((mask & 16) && !N && !W) { R(ctx, 0, 0, 4, 1, O); R(ctx, 0, 0, 1, 4, O); R(ctx, 1, 1, 3, 3, RK.rim); R(ctx, 3, 3, 1, 1, RK.hi); }
    if ((mask & 32) && !N && !E) { R(ctx, T - 4, 0, 4, 1, O); R(ctx, T - 1, 0, 1, 4, O); R(ctx, T - 4, 1, 3, 3, RK.lo); }
    if ((mask & 64) && !S && !E) { R(ctx, T - 4, T - 1, 4, 1, O); R(ctx, T - 1, T - 4, 1, 4, O); R(ctx, T - 4, T - 4, 3, 3, RK.lo); }
    if ((mask & 128) && !S && !W) { R(ctx, 0, T - 1, 4, 1, O); R(ctx, 0, T - 4, 1, 4, O); R(ctx, 1, T - 4, 3, 3, RK.lo); }
  }
  function wallTile(mask, v) { return cached('w' + mask + ':' + v, T, T, ctx => drawWall(ctx, mask, v)); }

  // ---------- 지하수 ----------
  // emask: 1 북 바닥, 2 동 바닥, 4 남 바닥, 8 서 바닥 (물가 테두리)
  function drawWater(ctx, emask, variant) {
    const rnd = Pixel.rng(9000 + variant * 13 + emask);
    R(ctx, 0, 0, T, T, WT.mid);
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(rnd() * 26), y = Math.floor(rnd() * 26);
      R(ctx, x, y, 4 + Math.floor(rnd() * 8), 2 + Math.floor(rnd() * 4), rnd() < 0.5 ? WT.hi : WT.lo);
    }
    // 잔물결 하이라이트(짧은 가로선)
    for (let k = 0; k < 4; k++) {
      const x = 2 + Math.floor(rnd() * 22), y = 3 + Math.floor(rnd() * 26), w = 3 + Math.floor(rnd() * 5);
      R(ctx, x, y, w, 1, WT.foam); R(ctx, x + 1, y, Math.max(1, w - 3), 1, WT.glint);
    }
    // 반사 점
    for (let k = 0; k < 3; k++) R(ctx, Math.floor(rnd() * T), Math.floor(rnd() * T), 1, 1, WT.glint);
    // 물가: 바닥과 닿는 쪽에 어두운 테두리 + 안쪽 밝은 띠(물가 거품)
    if (emask & 1) { R(ctx, 0, 0, T, 1, WT.shore); R(ctx, 0, 1, T, 1, WT.lo); R(ctx, 0, 2, T, 1, WT.lo); for (let x = 1; x < T; x += 5) R(ctx, x, 2, 2, 1, WT.foam); }
    if (emask & 4) { R(ctx, 0, T - 1, T, 1, WT.shore); R(ctx, 0, T - 2, T, 1, WT.hi); R(ctx, 0, T - 3, T, 1, WT.foam); for (let x = 3; x < T; x += 6) R(ctx, x, T - 3, 2, 1, WT.foam); }
    if (emask & 8) { R(ctx, 0, 0, 1, T, WT.shore); R(ctx, 1, 0, 1, T, WT.lo); }
    if (emask & 2) { R(ctx, T - 1, 0, 1, T, WT.shore); R(ctx, T - 2, 0, 1, T, WT.hi); }
  }
  function waterTile(emask, v) { return cached('a' + emask + ':' + v, T, T, ctx => drawWater(ctx, emask, v)); }

  // ---------- 장식 스프라이트 (바닥 위에 덧그림) ----------
  function crystalSprite(pal, v) {
    return cached('c' + (pal === CR_CYAN ? 'c' : 'p') + v, T, T, ctx => {
      const rnd = Pixel.rng(300 + v);
      Pixel.ellipse(ctx, 16, 28, 12, 3, 'rgba(0,0,0,0.25)');
      // 바닥 돌 받침
      R(ctx, 5, 26, 22, 3, FL.lo); R(ctx, 6, 25, 20, 1, FL.hi); R(ctx, 8, 29, 16, 1, FL.crack);
      // 수정 기둥: (중심x, 밑y, 폭, 높이, 기울기 px) — 낮은 것부터 그려 큰 것이 앞
      const spikes = [[8, 27, 7, 13, -1], [24, 27, 7, 12, 1], [16, 28, 9, 22, 0]];
      if (rnd() < 0.5) spikes.unshift([13, 26, 4, 8, -1]);
      for (const [cx, by, w, h, lean] of spikes) {
        const hw = Math.floor(w / 2);
        const tipY = by - h;
        for (let y = 0; y <= h; y++) {
          const t = y / h; const ww = Math.max(0, Math.round(hw * Math.min(1, t * 2.2)));
          const yy = tipY + y, sx = cx + Math.round(lean * (1 - t) * 2);
          R(ctx, sx - ww - 1, yy, ww * 2 + 3, 1, O);
        }
        for (let y = 1; y <= h; y++) {
          const t = y / h; const ww = Math.max(0, Math.round(hw * Math.min(1, t * 2.2)) - 1);
          const yy = tipY + y, sx = cx + Math.round(lean * (1 - t) * 2);
          R(ctx, sx - ww, yy, ww * 2 + 1, 1, pal.mid);
          // 오른쪽 면 어둡게(면 분할 → 결정 느낌), 왼쪽 면 밝게
          if (ww >= 1) R(ctx, sx + 1, yy, ww, 1, pal.lo);
          if (ww >= 2) R(ctx, sx - ww, yy, ww - 1, 1, pal.hi);
          if (ww >= 1) R(ctx, sx, yy, 1, 1, pal.mid); // 중앙 능선
        }
        R(ctx, cx + Math.round(lean * 2), tipY + 1, 1, 3, '#ffffff'); // 꼭대기 반짝
        R(ctx, cx - 1 + Math.round(lean * 2), tipY + 4, 1, 1, '#ffffff');
      }
      // 주변 작은 반짝
      R(ctx, 2, 10, 1, 1, pal.hi); R(ctx, 29, 13, 1, 1, pal.hi); R(ctx, 27, 4, 1, 1, '#ffffff');
    });
  }
  function mushroomSprite(v) {
    return cached('m' + v, T, T, ctx => {
      const rnd = Pixel.rng(400 + v);
      Pixel.ellipse(ctx, 16, 28, 9, 2, 'rgba(0,0,0,0.2)');
      const shrooms = [[9, 28, 8, 11], [20, 29, 11, 16], [27, 27, 5, 7]];
      if (rnd() < 0.5) shrooms.pop();
      for (const [cx, by, cw, h] of shrooms) {
        const hw = Math.floor(cw / 2), capH = Math.max(3, Math.floor(h * 0.45)), capY = by - h;
        // 줄기
        R(ctx, cx - 2, capY + capH - 1, 4, h - capH + 1, O);
        R(ctx, cx - 1, capY + capH, 2, h - capH, MU.stem); R(ctx, cx, capY + capH, 1, h - capH, MU.stemLo);
        // 갓(둥근 윗면)
        for (let y = 0; y < capH; y++) {
          const t = 1 - (y + 1) / capH; const ww = Math.round(hw * Math.sqrt(1 - t * t));
          R(ctx, cx - ww - 1, capY + y, ww * 2 + 3, 1, O);
        }
        for (let y = 1; y < capH; y++) {
          const t = 1 - (y + 1) / capH; const ww = Math.round(hw * Math.sqrt(1 - t * t)) - 1;
          if (ww < 0) continue;
          R(ctx, cx - ww, capY + y, ww * 2 + 1, 1, MU.cap);
          R(ctx, cx + Math.max(0, ww - 1), capY + y, 2, 1, MU.capLo);
        }
        R(ctx, cx - hw + 1, capY + 2, 2, 1, MU.capHi); R(ctx, cx - hw + 1, capY + 3, 1, 1, MU.capHi);
        R(ctx, cx + 1, capY + capH - 2, 1, 1, MU.capHi); // 점무늬
      }
      // 포자 반짝
      R(ctx, 6, 14, 1, 1, MU.capHi); R(ctx, 24, 11, 1, 1, MU.capHi); R(ctx, 29, 20, 1, 1, MU.cap);
    });
  }
  function bonesSprite(v) {
    return cached('b' + v, T, T, ctx => {
      const rnd = Pixel.rng(500 + v);
      // 두개골
      const sx = 6 + Math.floor(rnd() * 6), sy = 12 + Math.floor(rnd() * 6);
      R(ctx, sx + 1, sy, 7, 1, O); R(ctx, sx, sy + 1, 9, 5, O); R(ctx, sx + 1, sy + 6, 7, 2, O);
      R(ctx, sx + 1, sy + 1, 7, 5, BN.mid); R(ctx, sx + 2, sy + 1, 4, 2, BN.hi); R(ctx, sx + 7, sy + 2, 1, 4, BN.lo);
      R(ctx, sx + 2, sy + 3, 2, 2, O); R(ctx, sx + 5, sy + 3, 2, 2, O); // 눈구멍
      R(ctx, sx + 2, sy + 6, 5, 1, BN.lo); R(ctx, sx + 3, sy + 6, 1, 1, BN.hi); R(ctx, sx + 5, sy + 6, 1, 1, BN.hi); // 이빨
      // 긴 뼈 2개(엇갈림)
      const bx = 17, by = 20;
      R(ctx, bx, by, 11, 3, O); R(ctx, bx + 1, by + 1, 9, 1, BN.mid); R(ctx, bx + 1, by + 1, 4, 1, BN.hi);
      R(ctx, bx - 1, by - 1, 2, 2, O); R(ctx, bx + 10, by + 2, 2, 2, O); R(ctx, bx - 1, by + 3, 2, 1, O); R(ctx, bx + 10, by - 1, 2, 1, O);
      R(ctx, bx + 1, by + 3, 9, 1, 'rgba(0,0,0,0.2)');
      const cx2 = 20, cy2 = 10;
      R(ctx, cx2, cy2, 3, 9, O); R(ctx, cx2 + 1, cy2 + 1, 1, 7, BN.mid); R(ctx, cx2 + 1, cy2 + 1, 1, 3, BN.hi);
      R(ctx, cx2 - 1, cy2 - 1, 2, 2, O); R(ctx, cx2 + 2, cy2 - 1, 2, 2, O); R(ctx, cx2 - 1, cy2 + 8, 2, 2, O); R(ctx, cx2 + 2, cy2 + 8, 2, 2, O);
      // 잔뼈 조각
      R(ctx, 8, 24, 3, 1, BN.lo); R(ctx, 27, 9, 1, 2, BN.lo);
    });
  }
  // 종유석 그림자: 천장에서 드리운 둥근 그림자 + 바닥에 떨어진 물방울 자국
  function stalactiteShadowSprite(v) {
    return cached('s' + v, T, T, ctx => {
      const rnd = Pixel.rng(600 + v);
      const cx = 12 + Math.floor(rnd() * 8), cy = 12 + Math.floor(rnd() * 8);
      Pixel.ellipse(ctx, cx, cy, 9, 6, 'rgba(20,12,24,0.28)');
      Pixel.ellipse(ctx, cx, cy, 5, 3, 'rgba(20,12,24,0.3)');
      // 젖은 바닥(물웅덩이 자국)
      Pixel.ellipse(ctx, cx, cy + 1, 3, 1, WT.lo); R(ctx, cx - 1, cy, 2, 1, WT.foam); R(ctx, cx - 2, cy + 1, 1, 1, WT.glint);
      // 작은 석순 돌기
      R(ctx, cx + 6, cy + 4, 3, 1, O); R(ctx, cx + 6, cy + 1, 3, 3, O); R(ctx, cx + 7, cy, 1, 1, O);
      R(ctx, cx + 7, cy + 1, 1, 3, FL.hi); R(ctx, cx + 8, cy + 2, 1, 2, FL.lo);
    });
  }
  // 바위 더미(타일 4): 큰 바위 2~3개, 3톤, 그림자
  function rockPileSprite(v) {
    return cached('r' + v, T, T, ctx => {
      const rnd = Pixel.rng(700 + v);
      Pixel.ellipse(ctx, 16, 27, 14, 4, 'rgba(0,0,0,0.25)');
      const rocks = [[10, 20, 8, 6], [21, 21, 7, 5], [15, 14, 9, 7]];
      if (rnd() < 0.4) rocks.push([5, 25, 4, 3]);
      const RC = { hi: '#9a8e88', mid: '#7a6f6a', lo: '#554b48' };
      for (const [cx, cy, rx, ry] of rocks) {
        Pixel.ellipse(ctx, cx, cy, rx + 1, ry + 1, O);
        Pixel.ellipse(ctx, cx, cy, rx, ry, RC.mid);
        Pixel.ellipse(ctx, cx + 1, cy + 1, rx - 1, ry - 1, RC.mid);
        // 우하 그늘(안쪽 띠)
        for (let dy = 0; dy <= ry; dy++) { const dx = Math.floor(rx * Math.sqrt(1 - (dy / ry) ** 2)); R(ctx, cx + Math.max(0, dx - 3), cy + dy, 3, 1, RC.lo); }
        R(ctx, cx - rx + 2, cy + ry - 1, rx * 2 - 4, 1, RC.lo);
        // 좌상 하이라이트
        R(ctx, cx - rx + 2, cy - ry + 1, Math.max(2, rx - 2), 1, RC.hi); R(ctx, cx - rx + 1, cy - ry + 2, 2, 2, RC.hi);
        R(ctx, cx - 1, cy, 1, 1, RC.lo); // 균열 점
      }
    });
  }

  // ---------- 청크 ----------
  function tileAt(map, ti, tj) {
    if (ti < 0 || tj < 0 || ti >= map.cols || tj >= map.rows) return 0;
    return map.tiles[tj * map.cols + ti];
  }
  const isWall = t => t === 0;

  function chunk(ctx, map, ci, cj, { TILE, CHUNK }) {
    const floorSeed = (map.floor || 0) * 17;
    const decor = []; // [x, y, kind, variant] — 바닥 그린 뒤 덧그림
    const glows = [];
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const ti = ci * CHUNK + i, tj = cj * CHUNK + j, x = i * TILE, y = j * TILE;
      const t = tileAt(map, ti, tj);
      const h = hash(ti, tj, floorSeed);
      if (t === 0) {
        let m = 0;
        if (!isWall(tileAt(map, ti, tj - 1))) m |= 1;
        if (!isWall(tileAt(map, ti + 1, tj))) m |= 2;
        if (!isWall(tileAt(map, ti, tj + 1))) m |= 4;
        if (!isWall(tileAt(map, ti - 1, tj))) m |= 8;
        if (!isWall(tileAt(map, ti - 1, tj - 1))) m |= 16;
        if (!isWall(tileAt(map, ti + 1, tj - 1))) m |= 32;
        if (!isWall(tileAt(map, ti + 1, tj + 1))) m |= 64;
        if (!isWall(tileAt(map, ti - 1, tj + 1))) m |= 128;
        // 대각 비트는 인접이 모두 벽일 때만 의미 있음 → 캐시 키 폭발 방지
        if (m & 1 || m & 8) m &= ~16; if (m & 1 || m & 2) m &= ~32; if (m & 4 || m & 2) m &= ~64; if (m & 4 || m & 8) m &= ~128;
        ctx.drawImage(wallTile(m, Math.floor(h * 4)), x, y);
      } else if (t === 2) {
        let e = 0;
        if (tileAt(map, ti, tj - 1) !== 2) e |= 1;
        if (tileAt(map, ti + 1, tj) !== 2) e |= 2;
        if (tileAt(map, ti, tj + 1) !== 2) e |= 4;
        if (tileAt(map, ti - 1, tj) !== 2) e |= 8;
        ctx.drawImage(waterTile(e, Math.floor(h * 4)), x, y);
      } else {
        ctx.drawImage(floorTile(Math.floor(h * 6)), x, y);
        if (t === 3) {
          const k = hash(tj, ti, floorSeed + 3), v = Math.floor(h * 4);
          if (k < 0.3) { decor.push([x, y, 'cc', v]); glows.push([x + 16, y + 22, CR_CYAN.glow]); }
          else if (k < 0.5) { decor.push([x, y, 'cp', v]); glows.push([x + 16, y + 22, CR_PURP.glow]); }
          else if (k < 0.75) { decor.push([x, y, 'm', v]); glows.push([x + 16, y + 24, MU.glow]); }
          else if (k < 0.9) decor.push([x, y, 'b', v]);
          else decor.push([x, y, 's', v]);
        } else if (t === 4) decor.push([x, y, 'r', Math.floor(h * 4)]);
      }
    }
    // 발광: 주변 바닥에 은은한 색(두 겹 타원, fillRect 기반)
    for (const [gx, gy, col] of glows) { Pixel.ellipse(ctx, gx, gy, 26, 16, col); Pixel.ellipse(ctx, gx, gy, 15, 9, col); }
    for (const [x, y, kind, v] of decor) {
      const s = kind === 'cc' ? crystalSprite(CR_CYAN, v) : kind === 'cp' ? crystalSprite(CR_PURP, v)
        : kind === 'm' ? mushroomSprite(v) : kind === 'b' ? bonesSprite(v) : kind === 's' ? stalactiteShadowSprite(v) : rockPileSprite(v);
      ctx.drawImage(s, x, y);
    }
  }

  function minimapColor(tile) { return ['#241d28', '#7a7069', '#1f3a58', '#8fd8e8', '#5a504c'][tile] || '#000'; }

  DungeonTiles.registerBiome('cave', { chunk, minimapColor });
})();
