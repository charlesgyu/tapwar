// 절차적 던전 생성기 — 계약은 DESIGN.md §9.
// 층별 고정 시드(RNG.floorSeed)로 항상 같은 맵을 만든다: NPC 의 상자 힌트("'달빛 폭포' 뒤 덤불")가 실제 지형과 맞아야 하기 때문.
// 숲(1~5층): 지역 밀도 노이즈 + 셀룰러 오토마타 → 공터·덤불숲. 끊긴 공터는 구불구불한 오솔길로 잇고 호수를 판다.
// 동굴(6~10층): 방(사각/타원/덩어리) + 통로(MST + 순환로) + 침식 + 수정 군락.
// 공통: 시작점과 보스 아레나는 대각선 반대 모서리, 숨겨진 상자는 덤불로 가린 막다른 길 끝, 모든 배치는 BFS 로 도달을 검증한다.
const DungeonGen = (() => {
  const COLS = 160, ROWS = 160, TILE = 32, N = COLS * ROWS;
  const T = { WALL: 0, FLOOR: 1, WATER: 2, DECO: 3, BUSH: 4 };
  const REQ = { walkable: 10000, monsters: 300, chests: 16, hidden: 6, groups: [18, 40], arenaR: 6 };
  // 무리 크기: 대부분 8~15마리, 15% 는 20마리 넘는 떼(레퍼런스처럼 "한 덩어리를 베어 넘기는" 전투). 중간보스는 호위 6~10.
  const PACK = { normal: [8, 15], swarm: [20, 26], swarmChance: 0.15, escort: [6, 10], max: 28, sep: [10, 8, 6] };
  const INF = 0x3fffffff;
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1], OFF4 = [1, -1, COLS, -COLS];
  const TURN = [[2, 3], [2, 3], [0, 1], [0, 1]]; // 방향 q 에서 좌우로 꺾는 방향
  // 시계 방향 8이웃 — 연속한 두 칸이 서로 4-인접이라 "연결을 끊지 않고 막아도 되는 칸" 판정에 쓴다
  const RING8 = [-COLS, -COLS + 1, 1, COLS + 1, COLS, COLS - 1, -1, -COLS - 1];
  const cache = {};

  // ---------- 층 정보: Floors 가 있으면 그 값을, 없으면(테스트) 기본값 ----------
  const DEFAULT_LANDMARKS = {
    1: ['이끼 낀 바위', '늙은 떡갈나무', '버섯 군락', '사냥꾼의 오두막터', '고블린 모닥불', '양지바른 언덕'],
    2: ['거미줄 터널', '썩은 통나무', '고치 나무', '검은 연못', '뼈 무더기', '거미 알터'],
    3: ['달빛 폭포', '늑대 바위', '발톱 자국 나무', '사냥꾼의 무덤', '안개 숲길', '보름달 공터'],
    4: ['안개 호수', '부서진 부두', '노래하는 바위', '갈대밭', '가라앉은 배', '물안개 다리'],
    5: ['트롤 야영지', '쓰러진 거목', '엘다의 흔적', '타락한 샘', '거인의 발자국', '수호자의 뿌리'],
    6: ['첫 번째 갈림길', '종유석 홀', '무너진 갱도', '박쥐 둥지', '골렘 공방', '돌의 제단'],
    7: ['지하 호수', '나가 제단', '마른 땅', '수정 동굴', '물소리 복도', '비늘 무덤'],
    8: ['오크 전초기지', '해골 탑', '꺼진 횃불 통로', '대장간 터', '전리품 창고', '전쟁북 광장'],
    9: ['잊힌 신전', '망령의 복도', '무너진 기둥', '하얀 사제의 방', '촛불 제단', '침묵의 우물'],
    10: ['용의 둥지', '불타는 바위', '탑의 심장', '잿빛 왕좌', '용골 더미', '마지막 계단'],
  };
  const DEFAULT_POOL = {
    forest: ['goblin', 'goblin_archer', 'goblin_shaman', 'wolf', 'spider', 'troll', 'orc', 'orc_berserker', 'werewolf', 'siren', 'sprite', 'skeleton', 'zombie', 'sheepie'],
    cave: ['bat', 'cave_spider', 'golem_stone', 'golem_crystal', 'naga', 'naga_priest', 'orc_warlord', 'troll_shaman', 'wraith', 'skeleton_knight', 'drake'],
  };
  const DEFAULT_BOSS = [null, 'goblin_king', 'spider_queen', 'werewolf_chief', 'siren_queen', 'troll_chief', 'golem_lord', 'naga_priestess', 'orc_warchief', 'wraith_king', 'cave_dragon'];

  function floorInfo(floor) {
    let F = null;
    try { if (typeof Floors !== 'undefined' && Floors.get) F = Floors.get(floor); } catch (e) { F = null; }
    const biome = (F && F.biome) || (floor <= 5 ? 'forest' : 'cave');
    const poolSrc = (F && F.pool && F.pool.length) ? F.pool : DEFAULT_POOL[biome];
    const pool = poolSrc.map((p) => (typeof p === 'string' ? { id: p, weight: 1 } : { id: p.id, weight: p.weight || 1 }));
    const defaults = DEFAULT_LANDMARKS[floor] || DEFAULT_LANDMARKS[biome === 'forest' ? 1 : 6];
    const landmarks = ((F && F.landmarks) || []).slice();
    for (const d of defaults) if (landmarks.length < 6 && !landmarks.includes(d)) landmarks.push(d); // 6개 미만이면 기본 이름으로 채운다
    const minibosses = ((F && F.minibosses) || []).slice(0, 3);
    while (minibosses.length < 3) minibosses.push(pool[minibosses.length % pool.length].id + '_elite');
    return {
      floor, biome, name: (F && F.name) || `${floor}층`, pool, minibosses, landmarks,
      boss: (F && F.boss) || DEFAULT_BOSS[Math.min(floor, 10)] || 'boss',
      monsterCount: Math.max(REQ.monsters, (F && F.monsterCount) || 0),
    };
  }

  // ---------- 격자 도우미 ----------
  const idx = (i, j) => j * COLS + i;
  const ci = (c) => c % COLS, cj = (c) => (c / COLS) | 0;
  const inner = (i, j) => i >= 1 && j >= 1 && i <= COLS - 2 && j <= ROWS - 2;
  const walkT = (t) => t === T.FLOOR || t === T.DECO;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const cheb = (a, b) => Math.max(Math.abs(ci(a) - ci(b)), Math.abs(cj(a) - cj(b)));
  const dist2 = (a, b) => { const dx = ci(a) - ci(b), dy = cj(a) - cj(b); return dx * dx + dy * dy; };
  const px = (c) => ({ x: (ci(c) + 0.5) * TILE, y: (cj(c) + 0.5) * TILE, i: ci(c), j: cj(c) });

  function countOpen8(tiles, c) { let n = 0; for (let k = 0; k < 8; k++) if (walkT(tiles[c + RING8[k]])) n++; return n; }
  function countOpen4(tiles, c) { let n = 0; for (let k = 0; k < 4; k++) if (walkT(tiles[c + OFF4[k]])) n++; return n; }
  function isAdj4(a, b) { const d = Math.abs(a - b); return d === 1 || d === COLS; }
  function nearWater(tiles, c) { for (let k = 0; k < 8; k++) if (tiles[c + RING8[k]] === T.WATER) return true; return false; }

  // 반지름 r 원 안의 칸마다 fn(cell, d2) — 경계 1칸은 항상 벽으로 남긴다
  function forDisc(cx, cy, r, fn) {
    const r2 = r * r;
    for (let j = Math.max(1, cy - r); j <= Math.min(ROWS - 2, cy + r); j++)
      for (let i = Math.max(1, cx - r); i <= Math.min(COLS - 2, cx + r); i++) {
        const d2 = (i - cx) * (i - cx) + (j - cy) * (j - cy);
        if (d2 <= r2) fn(idx(i, j), d2);
      }
  }
  function open(tiles, cell) { if (inner(ci(cell), cj(cell)) && (tiles[cell] === T.WALL || tiles[cell] === T.BUSH)) tiles[cell] = T.FLOOR; }
  function carveDisc(tiles, cx, cy, r) { forDisc(cx, cy, r, (c) => open(tiles, c)); }
  function reserveDisc(c, cell, r) { forDisc(ci(cell), cj(cell), r, (k) => { c.reserved[k] = 1; }); }
  function countWalkable(tiles) { let n = 0; for (let k = 0; k < N; k++) if (walkT(tiles[k])) n++; return n; }

  // 거친 격자 난수를 양선형 보간 — 지역마다 숲 밀도가 달라 공터와 빽빽한 숲이 생긴다
  function valueNoise(rng, cells) {
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let k = 0; k < g.length; k++) g[k] = rng.next();
    const out = new Float32Array(N), s = cells / COLS;
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const u = i * s, v = j * s, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0, w = cells + 1;
      const a = g[j0 * w + i0], b = g[j0 * w + i0 + 1], cc = g[(j0 + 1) * w + i0], d = g[(j0 + 1) * w + i0 + 1];
      out[idx(i, j)] = (a * (1 - fu) + b * fu) * (1 - fv) + (cc * (1 - fu) + d * fu) * fv;
    }
    return out;
  }
  function noiseCosts(rng) { const w = new Uint8Array(N); for (let k = 0; k < N; k++) w[k] = rng.int(0, 6); return w; }

  // ---------- 셀룰러 오토마타 ----------
  // 열린 이웃이 4개 이상이면 열림 — 반복하면 유기적인 덩어리가 된다
  function smooth(tiles, iterations) {
    let cur = tiles;
    for (let it = 0; it < iterations; it++) {
      const out = new Uint8Array(N);
      for (let j = 1; j < ROWS - 1; j++) for (let i = 1; i < COLS - 1; i++) {
        const c = idx(i, j);
        out[c] = countOpen8(cur, c) >= 4 ? T.FLOOR : T.WALL;
      }
      cur = out;
    }
    return cur;
  }
  // 열린 칸에 많이 닿은 벽을 깎는다 — 열리기만 하므로 연결은 절대 끊기지 않는다
  function erode(tiles, rng, minOpen, prob) {
    const src = new Uint8Array(tiles);
    for (let j = 1; j < ROWS - 1; j++) for (let i = 1; i < COLS - 1; i++) {
      const c = idx(i, j);
      if (src[c] === T.WALL && countOpen8(src, c) >= minOpen && rng.next() < prob) tiles[c] = T.FLOOR;
    }
  }

  // ---------- 숲 기본 지형 ----------
  function forestBase(c) {
    const { rng } = c, noise = valueNoise(rng, 8), t = new Uint8Array(N);
    for (let j = 3; j < ROWS - 3; j++) for (let i = 3; i < COLS - 3; i++) {
      const k = idx(i, j);
      const pWall = 0.40 + 0.32 * noise[k]; // 노이즈 낮은 지역 = 공터, 높은 지역 = 빽빽한 숲
      if (rng.next() >= pWall) t[k] = T.FLOOR;
    }
    return smooth(t, 4);
  }

  // ---------- 동굴 기본 지형: 방 + 통로 + 침식 ----------
  function caveBase(c) {
    const { rng } = c;
    c.tiles = new Uint8Array(N);
    const rooms = planRooms(rng);
    for (const r of rooms) carveRoom(c.tiles, r, rng);
    connectRooms(c, rooms);
    erode(c.tiles, rng, 5, 0.8); erode(c.tiles, rng, 5, 0.6); erode(c.tiles, rng, 3, 0.12);
    return c.tiles;
  }
  function planRooms(rng) {
    const rooms = [], per = 6, cell = COLS / per;
    for (let gj = 0; gj < per; gj++) for (let gi = 0; gi < per; gi++) {
      if (rng.next() < 0.18) continue; // 빈 칸이 있어야 통로가 길어진다
      const w = rng.int(8, 24), h = rng.int(8, 22);
      const cx = clamp(Math.round(gi * cell + rng.float(0.25, 0.75) * cell), 3 + (w >> 1), COLS - 4 - (w >> 1));
      const cy = clamp(Math.round(gj * cell + rng.float(0.25, 0.75) * cell), 3 + (h >> 1), ROWS - 4 - (h >> 1));
      rooms.push({ cx, cy, w, h, shape: rng.pick(['rect', 'ellipse', 'blob', 'blob']), radial: radialNoise(rng, 10) });
    }
    return rooms;
  }
  function radialNoise(rng, n) { const a = []; for (let k = 0; k < n; k++) a.push(rng.float(0.72, 1.1)); return a; }
  // 각도별 반지름 계수 보간 → 울퉁불퉁한 덩어리
  function radialAt(radial, angle) {
    const n = radial.length, u = (((angle / (Math.PI * 2)) % 1) + 1) % 1 * n, k = Math.floor(u), f = u - k;
    return radial[k % n] * (1 - f) + radial[(k + 1) % n] * f;
  }
  function carveRoom(tiles, r, rng) {
    const hw = r.w / 2, hh = r.h / 2;
    for (let j = Math.max(1, r.cy - Math.ceil(hh)); j <= Math.min(ROWS - 2, r.cy + Math.ceil(hh)); j++)
      for (let i = Math.max(1, r.cx - Math.ceil(hw)); i <= Math.min(COLS - 2, r.cx + Math.ceil(hw)); i++) {
        const u = (i - r.cx) / hw, v = (j - r.cy) / hh;
        let inside;
        if (r.shape === 'rect') inside = Math.abs(u) <= 1 && Math.abs(v) <= 1 && (Math.abs(u) < 0.9 || Math.abs(v) < 0.9 || rng.next() < 0.5);
        else { const d = Math.sqrt(u * u + v * v); inside = r.shape === 'ellipse' ? d <= 1 : d <= radialAt(r.radial, Math.atan2(v, u)); }
        if (inside) tiles[idx(i, j)] = T.FLOOR;
      }
  }
  function connectRooms(c, rooms) {
    const { rng } = c, centers = rooms.map((r) => idx(r.cx, r.cy)), edges = mst(centers);
    for (let a = 0; a < centers.length; a++) { // 순환로: 두 번째로 가까운 방과도 가끔 잇는다
      const near = nearest(centers, a, 2)[1];
      if (near !== undefined && rng.next() < 0.4) edges.push([a, near]);
    }
    for (const [a, b] of edges) carvePath(c, centers[a], centers[b], { wallBase: 3, width: 3 });
  }
  // 프림 MST — 가까운 방부터 잇는다
  function mst(points) {
    const n = points.length, inTree = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(0), edges = [];
    inTree[0] = 1; for (let k = 1; k < n; k++) best[k] = dist2(points[0], points[k]);
    for (let step = 1; step < n; step++) {
      let v = -1; for (let k = 0; k < n; k++) if (!inTree[k] && (v < 0 || best[k] < best[v])) v = k;
      inTree[v] = 1; edges.push([from[v], v]);
      for (let k = 0; k < n; k++) if (!inTree[k]) { const d = dist2(points[v], points[k]); if (d < best[k]) { best[k] = d; from[k] = v; } }
    }
    return edges;
  }
  function nearest(points, a, n) {
    return points.map((p, k) => k).filter((k) => k !== a).sort((x, y) => dist2(points[a], points[x]) - dist2(points[a], points[y])).slice(0, n);
  }

  // ---------- 경로/연결 ----------
  // 비용 기반 경로(다익스트라, 버킷 큐): 바닥 1, 벽 wallBase+노이즈 → 벽을 뚫을 땐 구불구불한 길이 된다. 물은 못 지난다.
  function route(c, sources, isTarget, wallBase) {
    const { tiles, wcost } = c;
    const dist = new Int32Array(N).fill(INF), prev = new Int32Array(N).fill(-1), buckets = [];
    let maxB = 0;
    const push = (cell, d) => { (buckets[d] || (buckets[d] = [])).push(cell); if (d > maxB) maxB = d; };
    for (const s of sources) { dist[s] = 0; push(s, 0); }
    for (let d = 0; d <= maxB; d++) {
      const b = buckets[d]; if (!b) continue;
      for (let k = 0; k < b.length; k++) {
        const cell = b[k]; if (dist[cell] !== d) continue;
        if (isTarget(cell)) return backtrack(prev, cell);
        const i = ci(cell), j = cj(cell);
        for (let q = 0; q < 4; q++) {
          const nc = cell + OFF4[q];
          if (!inner(i + DX[q], j + DY[q]) || tiles[nc] === T.WATER) continue;
          const nd = d + (walkT(tiles[nc]) ? 1 : wallBase + wcost[nc]);
          if (nd < dist[nc]) { dist[nc] = nd; prev[nc] = cell; push(nc, nd); }
        }
      }
    }
    return null;
  }
  function backtrack(prev, cell) { const path = []; for (let c = cell; c >= 0; c = prev[c]) path.push(c); return path.reverse(); }
  function carvePath(c, from, to, opt) {
    const path = route(c, [from], (cell) => cell === to, opt.wallBase);
    if (path) carveCells(c, path, opt);
    return !!path;
  }
  function carveCells(c, path, opt) {
    const { tiles, rng } = c, side = rng.next() < 0.5 ? 1 : COLS;
    for (const cell of path) {
      open(tiles, cell);
      if (opt.width >= 3) { open(tiles, cell + 1); open(tiles, cell - 1); open(tiles, cell + COLS); open(tiles, cell - COLS); } // 넓은 길: 파티가 막힘 없이 지나가게
      else if (opt.width >= 2) open(tiles, cell + side);
      else if (opt.bump && rng.next() < opt.bump) open(tiles, cell + rng.pick(OFF4)); // 오솔길 가장자리를 울퉁불퉁하게
    }
  }

  // 4-연결 성분 라벨링 (경계 칸은 항상 벽이라 범위 검사 불필요)
  function components(tiles) {
    const comp = new Int32Array(N).fill(-1), sizes = [], queue = new Int32Array(N);
    for (let start = 0; start < N; start++) {
      if (comp[start] >= 0 || !walkT(tiles[start])) continue;
      const id = sizes.length; let head = 0, tail = 0;
      queue[tail++] = start; comp[start] = id;
      while (head < tail) {
        const cell = queue[head++];
        for (let q = 0; q < 4; q++) { const nc = cell + OFF4[q]; if (comp[nc] < 0 && walkT(tiles[nc])) { comp[nc] = id; queue[tail++] = nc; } }
      }
      sizes.push(tail);
    }
    return { comp, sizes };
  }
  function bfs(tiles, sources, passable) {
    const dist = new Int32Array(N).fill(INF), prev = new Int32Array(N).fill(-1), queue = new Int32Array(N);
    let head = 0, tail = 0;
    for (const s of sources) { if (dist[s] === INF) { dist[s] = 0; queue[tail++] = s; } }
    while (head < tail) {
      const cell = queue[head++], i = ci(cell), j = cj(cell), d = dist[cell] + 1;
      for (let q = 0; q < 4; q++) {
        if (!inner(i + DX[q], j + DY[q])) continue;
        const nc = cell + OFF4[q];
        if (dist[nc] !== INF || !passable(tiles[nc])) continue;
        dist[nc] = d; prev[nc] = cell; queue[tail++] = nc;
      }
    }
    return { dist, prev };
  }

  // 시작점·보스 아레나·출구: 시작 모서리를 고르고 보스는 대각선 반대편, 출구는 보스 뒤 짧은 통로 끝
  function placeEndpoints(c) {
    const { rng, tiles } = c, corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const s = rng.int(0, 3), [sx, sy] = corners[s], [bx, by] = corners[3 - s];
    const at = (fx, fy, inset) => idx(fx ? COLS - 1 - inset : inset, fy ? ROWS - 1 - inset : inset);
    c.spawn = at(sx, sy, 12); c.boss = at(bx, by, 14);
    carveDisc(tiles, ci(c.spawn), cj(c.spawn), 3);
    carveDisc(tiles, ci(c.boss), cj(c.boss), REQ.arenaR);
    const dx = bx ? 1 : -1, dy = by ? 1 : -1;
    let cell = c.boss;
    for (let k = 0; k < REQ.arenaR + 4; k++) { cell += dx + dy * COLS; open(tiles, cell); open(tiles, cell + dx); }
    c.exit = cell; carveDisc(tiles, ci(cell), cj(cell), 1);
    reserveDisc(c, c.spawn, 3); reserveDisc(c, c.boss, REQ.arenaR + 1); reserveDisc(c, c.exit, 2);
  }

  // 끊긴 조각을 가까운 것부터 길로 잇는다. 작은 웅덩이는 메워서 도달 불가 지역이 없게 한다.
  function connectAll(c) {
    const { tiles } = c, minSize = 25, forest = c.info.biome === 'forest';
    let { comp, sizes } = components(tiles);
    const main = comp[c.spawn];
    for (let cell = 0; cell < N; cell++) if (comp[cell] >= 0 && comp[cell] !== main && sizes[comp[cell]] < minSize) { tiles[cell] = T.WALL; comp[cell] = -1; }
    const sources = []; for (let cell = 0; cell < N; cell++) if (comp[cell] === main) sources.push(cell);
    for (let guard = 0; guard < 400; guard++) {
      const path = route(c, sources, (cell) => comp[cell] >= 0 && comp[cell] !== main, forest ? 5 : 3);
      if (!path) break;
      const target = comp[path[path.length - 1]];
      carveCells(c, path, { width: forest ? 1 : 2, bump: 0.25 });
      for (let cell = 0; cell < N; cell++) if (comp[cell] === target) { comp[cell] = main; sources.push(cell); }
      for (const cell of path) if (comp[cell] !== main) { comp[cell] = main; sources.push(cell); }
    }
    ({ comp } = components(tiles));
    const m2 = comp[c.spawn];
    for (let cell = 0; cell < N; cell++) if (comp[cell] >= 0 && comp[cell] !== m2) tiles[cell] = T.WALL; // 물 등으로 못 이은 조각은 메운다
  }
  // 멀리 떨어진 두 지점을 잇는 지름길 — 순환로가 생겨 "돌아다닐 맛"이 난다
  function extraTrails(c, count) {
    for (let k = 0; k < count; k++) {
      const a = randomWhere(c, () => true), b = randomWhere(c, (cell) => cheb(cell, a) >= 45);
      if (a < 0 || b < 0) continue;
      carvePath(c, a, b, { wallBase: 2, width: 3, bump: 0.3 });
    }
  }

  // ---------- 물 ----------
  function waterPlan(c) {
    const { floor, info, rng } = c, big = /호수/.test(info.landmarks.join(' '));
    if (info.biome === 'forest') {
      const p = [{ r: big ? rng.int(9, 11) : rng.int(5, 7) }, { r: rng.int(2, 3) }];
      if (floor >= 3) p.push({ r: rng.int(2, 4) });
      return p;
    }
    if (big) return [{ r: rng.int(7, 9) }, { r: 3 }];
    return rng.next() < 0.5 ? [{ r: rng.int(3, 4) }] : [];
  }
  // 둘레에 공터를 먼저 파고 그 안에 물을 채운다 → 호수가 길을 끊지 않는다
  function placeWater(c) {
    const plan = waterPlan(c);
    c.waterCenters = [];
    for (const w of plan) {
      analyze(c);
      const center = pickOpenSpot(c, w.r);
      if (center < 0) continue;
      carveDisc(c.tiles, ci(center), cj(center), w.r + 4);
      fillWater(c, center, w.r);
      c.waterCenters.push(center);
    }
  }
  function pickOpenSpot(c, r) {
    const { rng, distW, tiles } = c;
    let best = -1, bestScore = -Infinity;
    for (let k = 0; k < 500; k++) {
      const cell = rng.int(0, N - 1);
      if (!walkT(tiles[cell]) || cheb(cell, c.spawn) < 30 || cheb(cell, c.boss) < 30) continue;
      if (c.waterCenters.some((w) => cheb(cell, w) < r * 2 + 10)) continue;
      const score = Math.min(distW[cell], 8) + rng.next() * 2; // 이미 넓은 곳이 호수 자리로 자연스럽다
      if (score > bestScore) { bestScore = score; best = cell; }
    }
    return best;
  }
  function fillWater(c, center, r) {
    const radial = radialNoise(c.rng, 12), cx = ci(center), cy = cj(center);
    forDisc(cx, cy, r + 1, (cell, d2) => {
      const rr = r * radialAt(radial, Math.atan2(cj(cell) - cy, ci(cell) - cx));
      if (Math.sqrt(d2) <= rr && !c.reserved[cell]) c.tiles[cell] = T.WATER;
    });
  }

  function ensureWalkable(c) {
    for (let pass = 0; pass < 30 && countWalkable(c.tiles) < REQ.walkable + 900; pass++) erode(c.tiles, c.rng, 3, 0.3);
  }

  // distW = 가장 가까운 비통행 칸까지 거리(공터의 넓이), distS = 시작점에서 걸음 수, path = 시작→보스 최단 경로
  function analyze(c) {
    const { tiles } = c, walls = [];
    for (let cell = 0; cell < N; cell++) if (!walkT(tiles[cell])) walls.push(cell);
    c.distW = bfs(tiles, walls, walkT).dist;
    const s = bfs(tiles, [c.spawn], walkT);
    c.distS = s.dist; c.prevS = s.prev;
    c.path = c.distS[c.boss] === INF ? [c.spawn] : backtrack(s.prev, c.boss);
  }

  // ---------- 랜드마크 ----------
  const KIND_RULES = [
    ['open', /광장|홀|공터|둥지|야영지|전초기지|제단|왕좌|심장|언덕|군락|방$|공방|창고|터$|밭/],
    ['water', /호수|폭포|연못|부두|샘|물|배$|갈대|다리/],
    ['narrow', /복도|통로|터널|길|계단|갱도/],
    ['nook', /바위|나무|통나무|거목|기둥|탑|무덤|우물|흔적|발자국|더미|알터|뿌리/],
  ];
  function landmarkKind(name) { for (const [k, re] of KIND_RULES) if (re.test(name)) return k; return 'open'; }
  function landmarkCandidates(c) {
    const { tiles, distW, distS } = c, out = { water: [], open: [], narrow: [], nook: [], any: [] };
    for (let j = 4; j < ROWS - 4; j++) for (let i = 4; i < COLS - 4; i++) {
      const cell = idx(i, j);
      if (!walkT(tiles[cell]) || distS[cell] === INF || c.reserved[cell]) continue;
      out.any.push(cell);
      if (nearWater(tiles, cell)) out.water.push(cell);
      if (distW[cell] >= 4 && isLocalMax(distW, cell)) out.open.push(cell);
      if (countOpen4(tiles, cell) === 1 || countOpen8(tiles, cell) <= 3) out.nook.push(cell);
    }
    for (const cell of c.path) if (distW[cell] <= 2 && distS[cell] > 15 && !c.reserved[cell]) out.narrow.push(cell);
    if (!out.open.length) out.open = out.any.filter((cell) => distW[cell] >= 3);
    return out;
  }
  function isLocalMax(distW, cell) { for (let k = 0; k < 8; k++) if (distW[cell + RING8[k]] > distW[cell]) return false; return true; }
  // 이미 놓인 것들과 멀리 떨어진 후보 중 무작위 하나 — 결정적이지만 층마다 다른 배치
  function pickSpread(c, pool, placed, minSep) {
    const minD = (cell) => { let m = INF; for (const p of placed) { const d = cheb(cell, p); if (d < m) m = d; } return m; };
    for (const sep of [minSep, Math.round(minSep * 0.7), Math.round(minSep * 0.45), 4]) {
      const ok = pool.filter((cell) => minD(cell) >= sep);
      if (ok.length >= 3) return c.rng.pick(ok);
    }
    let best = pool[0], bd = -1;
    for (const cell of pool) { const d = minD(cell); if (d > bd) { bd = d; best = cell; } }
    return best;
  }
  function placeLandmarks(c) {
    const cands = landmarkCandidates(c), placed = [c.spawn, c.boss];
    c.landmarks = c.info.landmarks.map((name, k) => {
      const kind = landmarkKind(name);
      const pool = cands[kind].length ? cands[kind] : (cands.open.length ? cands.open : cands.any);
      const cell = pickSpread(c, pool, placed, 22);
      placed.push(cell); c.reserved[cell] = 1;
      return { id: `f${c.floor}_lm${k + 1}`, name, kind, cell };
    });
  }
  function nearestLandmark(c, cell) {
    let best = c.landmarks[0], bd = INF;
    for (const l of c.landmarks) { const d = dist2(cell, l.cell); if (d < bd) { bd = d; best = l; } }
    return best;
  }

  // ---------- 숨겨진 상자: 랜드마크 근처 막다른 길 ----------
  function carveHiddenSpurs(c) {
    const spurs = [];
    // 랜드마크마다 가까운 곳부터(반경 10→15→18) 시도해야 NPC 힌트("'달빛 폭포' 근처")가 맞는다. 첫 바퀴는 랜드마크당 하나씩.
    const order = c.rng.shuffle(c.landmarks);
    for (const radius of [10, 15, 18]) for (const lm of order) {
      if (spurs.length >= REQ.hidden || (radius === 10 && spurs.some((s) => s.landmarkId === lm.id))) continue;
      const s = spurNear(c, lm.cell, radius);
      if (s) { s.landmarkId = lm.id; spurs.push(s); }
    }
    for (let tries = 0; spurs.length < REQ.hidden && tries < 4000; tries++) {
      const s = spurNear(c, randomWhere(c, () => true), 6);
      if (s) { s.landmarkId = nearestLandmark(c, s.tip).id; spurs.push(s); }
    }
    spurs.forEach((s, k) => addChest(c, s.tip, 'hidden', k + 1, s.landmarkId));
    c.spurs = spurs;
  }
  function spurNear(c, around, radius) {
    if (around < 0) return null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const i = ci(around) + c.rng.int(-radius, radius), j = cj(around) + c.rng.int(-radius, radius);
      if (!inner(i, j)) continue;
      const cell = idx(i, j);
      if (!walkT(c.tiles[cell]) || c.distS[cell] === INF || c.reserved[cell]) continue;
      const spur = walkSpur(c, cell, c.rng.int(0, 3));
      if (spur) { hideSpur(c, spur); return spur; }
    }
    return null;
  }
  // 입구에서 벽 속으로 1칸 폭 길을 파 들어간다. 기존 길과 닿지 않으므로 끝은 반드시 막다른 길.
  function walkSpur(c, entrance, dir) {
    const { rng } = c, want = rng.int(6, 13), cells = [];
    let cur = entrance;
    for (let k = 0; k < want; k++) {
      let next = -1;
      for (const q of [dir, ...rng.shuffle(TURN[dir])]) { // 직진이 막히면 꺾어 본다
        const cand = cur + OFF4[q];
        if (spurCellOk(c, cand, cells, entrance)) { next = cand; dir = q; break; }
      }
      if (next < 0) break;
      cells.push(next); cur = next;
      if (rng.next() < 0.3) dir = rng.pick(TURN[dir]); // 가끔 방향을 꺾어 구불구불하게
    }
    if (cells.length < 5) return null;
    return { cells, tip: cells[cells.length - 1], entrance };
  }
  function spurCellOk(c, cell, cells, entrance) {
    const i = ci(cell), j = cj(cell);
    if (i < 2 || j < 2 || i > COLS - 3 || j > ROWS - 3) return false;
    if (c.tiles[cell] !== T.WALL || c.reserved[cell] || cells.includes(cell)) return false;
    const k = cells.length, prev1 = k ? cells[k - 1] : entrance, prev2 = k > 1 ? cells[k - 2] : -1;
    for (let r = 0; r < 8; r++) {
      const nc = cell + RING8[r];
      // 아직 바닥으로 바꾸기 전이라 자기 길도 "열린 칸"으로 취급해야 되돌아 붙지 않는다
      if ((!walkT(c.tiles[nc]) && !cells.includes(nc)) || nc === prev1 || nc === prev2) continue;
      if (k === 0 && isAdj4(nc, entrance)) continue; // 입구 좌우 칸(첫 칸의 대각선)은 허용
      return false;
    }
    return true;
  }
  // 길을 열고 둘레 벽을 덤불/바위로 바꿔 "덤불 뒤 막다른 길"을 만든다. 끝과 입구는 반드시 감싼다.
  function hideSpur(c, spur) {
    const { tiles, rng } = c, p = c.info.biome === 'forest' ? 0.4 : 0.25;
    for (const cell of spur.cells) { tiles[cell] = T.FLOOR; c.reserved[cell] = 1; }
    for (const cell of spur.cells) for (let r = 0; r < 8; r++) {
      const nc = cell + RING8[r];
      if (tiles[nc] !== T.WALL) continue;
      if (cell === spur.tip || cell === spur.cells[0] || rng.next() < p) tiles[nc] = T.BUSH;
    }
  }
  function addChest(c, cell, type, n, landmarkId) {
    c.chests.push({ id: `f${c.floor}_${type === 'hidden' ? 'hidden' : 'chest'}${n}`, cell, type, landmarkId, hidden: type === 'hidden' });
    c.reserved[cell] = 1;
  }

  // ---------- 장식 ----------
  // 8이웃 고리에서 열린 칸이 한 덩어리뿐이면 이 칸을 막아도 어디도 끊기지 않는다
  function safeToBlock(tiles, cell) {
    let runs = 0, prevOpen = walkT(tiles[cell + RING8[7]]);
    for (let q = 0; q < 8; q++) { const o = walkT(tiles[cell + RING8[q]]); if (o && !prevOpen) runs++; prevOpen = o; }
    return runs <= 1;
  }
  function randomWhere(c, pred) {
    for (let k = 0; k < 300; k++) {
      const cell = c.rng.int(0, N - 1);
      if (walkT(c.tiles[cell]) && c.distS[cell] !== INF && !c.reserved[cell] && pred(cell)) return cell;
    }
    return -1;
  }
  function clusters(c, count, radius, tile, prob, where) {
    for (let k = 0; k < count; k++) {
      const center = randomWhere(c, where);
      if (center < 0) continue;
      forDisc(ci(center), cj(center), c.rng.int(1, radius), (cell) => { if (c.tiles[cell] === T.FLOOR && !c.reserved[cell] && c.rng.next() < prob) c.tiles[cell] = tile; });
    }
  }
  function decorateForest(c) {
    const { tiles, rng, distW } = c;
    for (let j = 1; j < ROWS - 1; j++) for (let i = 1; i < COLS - 1; i++) {
      const cell = idx(i, j);
      if (tiles[cell] === T.WALL) { if (countOpen8(tiles, cell) >= 2 && rng.next() < 0.08) tiles[cell] = T.BUSH; continue; } // 숲 가장자리 덤불
      if (tiles[cell] !== T.FLOOR || c.reserved[cell]) continue;
      if (distW[cell] === 1) { if (rng.next() < 0.02 && safeToBlock(tiles, cell)) tiles[cell] = T.BUSH; } // 길가 덤불은 드물게(이동 방해 최소화)
      else if (rng.next() < 0.04) tiles[cell] = T.DECO;
    }
    clusters(c, 30, 2, T.DECO, 0.6, (cell) => distW[cell] >= 2); // 꽃밭·풀 군락
  }
  function decorateCave(c) {
    const { tiles, rng, distW } = c;
    for (let k = 0; k < 36; k++) { // 수정 군락: 벽가에 모여 자란다. 가운데 큰 수정은 통행 불가
      const center = randomWhere(c, (cell) => distW[cell] >= 1 && distW[cell] <= 2);
      if (center < 0) continue;
      if (rng.next() < 0.15 && safeToBlock(tiles, center)) tiles[center] = T.BUSH;
      forDisc(ci(center), cj(center), rng.int(1, 2), (cell) => { if (tiles[cell] === T.FLOOR && !c.reserved[cell] && rng.next() < 0.55) tiles[cell] = T.DECO; });
    }
    for (let j = 1; j < ROWS - 1; j++) for (let i = 1; i < COLS - 1; i++) { // 넓은 방 한가운데 바위·자잘한 돌
      const cell = idx(i, j);
      if (tiles[cell] !== T.FLOOR || c.reserved[cell]) continue;
      if (distW[cell] >= 3 && rng.next() < 0.004 && safeToBlock(tiles, cell)) tiles[cell] = T.BUSH; // 방 한가운데 바위는 거의 없게
      else if (rng.next() < 0.02) tiles[cell] = T.DECO;
    }
  }
  // 도달 불가 조각을 지우고 최종 거리 정보를 만든다
  function finalizeTerrain(c) {
    analyze(c);
    for (let cell = 0; cell < N; cell++) if (walkT(c.tiles[cell]) && c.distS[cell] === INF) c.tiles[cell] = T.WALL;
    analyze(c);
    c.walkableCount = countWalkable(c.tiles);
    const water = []; for (let cell = 0; cell < N; cell++) if (c.tiles[cell] === T.WATER) water.push(cell);
    c.distWater = water.length ? bfs(c.tiles, water, walkT).dist : null;
  }

  // ---------- 몬스터 무리 ----------
  function spotsAround(c, center, r) {
    const spots = [];
    forDisc(ci(center), cj(center), r, (cell, d2) => { if (walkT(c.tiles[cell])) spots.push({ cell, d2 }); });
    return spots.sort((a, b) => a.d2 - b.d2).map((s) => s.cell);
  }
  // 무리원 수만큼 설 자리가 나오도록 반경을 2→5 타일로 넓혀 가며 고른다(가까운 순)
  function packSpots(c, cell, n) {
    let spots = [];
    for (let r = 2; r <= 5; r++) { spots = spotsAround(c, cell, r); if (spots.length >= n) break; }
    return spots;
  }
  function makeGroup(c, cell, minibossId, size) {
    const { rng, info } = c;
    const n = size || (minibossId ? rng.int(PACK.escort[0], PACK.escort[1]) : rng.int(PACK.normal[0], PACK.normal[1]));
    let lead = rng.weighted(info.pool).id;
    const waterMon = info.pool.find((p) => /siren|naga/.test(p.id));
    if (waterMon && c.distWater && c.distWater[cell] <= 3 && rng.next() < 0.7) lead = waterMon.id; // 물가 무리는 세이렌/나가
    const members = minibossId ? [minibossId] : [];
    for (let k = 0; k < n; k++) members.push(rng.next() < 0.6 ? lead : rng.weighted(info.pool).id); // 같은 종류가 많아야 "무리"답다
    const id = minibossId ? `f${c.floor}_mb${c.groups.length + 1}` : `f${c.floor}_g${c.groups.length - 2}`;
    return { id, cell, members, minibossId, spots: packSpots(c, cell, members.length) };
  }
  // 중간보스: 시작→보스 경로의 30/55/80% 지점 중 가장 트인 곳(주요 분기)
  function placeMinibosses(c) {
    const { path, distW, rng, info } = c, L = path.length;
    c.groups = [];
    [0.3, 0.55, 0.8].forEach((t, k) => {
      const lo = Math.max(1, Math.floor(L * (t - 0.07))), hi = Math.min(L - 2, Math.floor(L * (t + 0.07)));
      let best = path[lo], bestScore = -1;
      for (let p = lo; p <= hi; p++) { const score = distW[path[p]] * 2 + rng.next(); if (score > bestScore) { bestScore = score; best = path[p]; } }
      c.groups.push(makeGroup(c, best, info.minibosses[k]));
    });
  }
  // minWall: 큰 떼는 벽에서 3칸 이상 떨어진 트인 곳을 먼저 찾는다
  function groupSpotOk(c, cell, sep, minWall = 2) {
    const { tiles, distS, distW } = c;
    if (!walkT(tiles[cell]) || distS[cell] === INF || distS[cell] < 16 || distW[cell] < minWall) return false;
    if (cheb(cell, c.boss) <= REQ.arenaR + 6) return false;
    for (const g of c.groups) if (cheb(cell, g.cell) < sep) return false;
    return true;
  }
  // 일반 무리 크기 목록: 합이 (층 몬스터 수 − 중간보스 무리) 가 될 때까지 뽑는다
  function packSizes(c) {
    const { rng, info } = c;
    const need = info.monsterCount - c.groups.reduce((s, g) => s + g.members.length, 0);
    const sizes = [];
    for (let total = 0; total < need;) {
      const swarm = sizes.length === 0 || rng.next() < PACK.swarmChance; // 층마다 큰 떼가 최소 하나는 있게
      const n = Math.min(need - total, swarm ? rng.int(PACK.swarm[0], PACK.swarm[1]) : rng.int(PACK.normal[0], PACK.normal[1]));
      if (n < PACK.normal[0] && sizes.length) { const lo = sizes.indexOf(Math.min(...sizes)); sizes[lo] += n; break; }   // 자투리는 가장 작은 무리에 얹는다
      sizes.push(n); total += n;
    }
    return rng.shuffle(sizes);
  }
  function placeGroups(c) {
    const { rng } = c, sizes = packSizes(c), block = 24, blocks = [];
    for (let bj = 0; bj < Math.ceil(ROWS / block); bj++) for (let bi = 0; bi < Math.ceil(COLS / block); bi++) blocks.push([bi, bj]);
    let k = 0;
    for (const [bi, bj] of rng.shuffle(blocks)) { // 격자마다 한 무리 → 맵 전체에 고르게
      if (k >= sizes.length) break;
      const n = sizes[k], wall = n >= PACK.swarm[0] ? 3 : 2;
      for (let tries = 0; tries < 16; tries++) {
        const i = Math.min(COLS - 1, bi * block + rng.int(0, block - 1)), j = Math.min(ROWS - 1, bj * block + rng.int(0, block - 1));
        const cell = idx(i, j);
        if (groupSpotOk(c, cell, PACK.sep[0], wall)) { c.groups.push(makeGroup(c, cell, null, n)); k++; break; }
      }
    }
    for (; k < sizes.length; k++) {
      let placed = false;
      for (const sep of PACK.sep) {
        for (let tries = 0; !placed && tries < 3000; tries++) {
          const cell = rng.int(0, N - 1);
          if (groupSpotOk(c, cell, sep)) { c.groups.push(makeGroup(c, cell, null, sizes[k])); placed = true; }
        }
        if (placed) break;
      }
    }
    topUpMonsters(c);
  }
  // 자리를 못 찾은 무리의 몫은 기존 무리에 나눠 얹는다(무리당 최대 PACK.max). 최소 몬스터 수는 반드시 맞춘다.
  function topUpMonsters(c) {
    const { rng, info } = c, normal = c.groups.filter((g) => !g.minibossId);
    let total = c.groups.reduce((s, g) => s + g.members.length, 0);
    for (let guard = 0; total < info.monsterCount && guard < 5000; guard++) {
      const g = rng.pick(normal);
      if (g.members.length >= PACK.max) continue;
      g.members.push(rng.next() < 0.6 ? g.members[0] : rng.weighted(info.pool).id); total++;
    }
    for (const g of normal) if (g.spots.length < g.members.length) g.spots = packSpots(c, g.cell, g.members.length);
    c.monsterCount = total;
  }

  // ---------- 일반 상자: 막다른 길 끝·구석을 서로 멀리 ----------
  function placeChests(c) {
    const { tiles, distS } = c, deadEnds = [], nooks = [], edges = [];
    for (let j = 2; j < ROWS - 2; j++) for (let i = 2; i < COLS - 2; i++) {
      const cell = idx(i, j);
      if (!walkT(tiles[cell]) || distS[cell] === INF || distS[cell] < 12 || c.reserved[cell]) continue;
      if (countOpen4(tiles, cell) === 1) deadEnds.push(cell); else if (countOpen8(tiles, cell) <= 3) nooks.push(cell); else if (c.distW[cell] === 1) edges.push(cell);
    }
    const want = Math.max(12, REQ.chests - c.chests.length + 2), placed = c.chests.map((ch) => ch.cell).concat([c.spawn]);
    for (let n = 1; n <= want; n++) {
      const pool = deadEnds.length >= 3 && c.rng.next() < 0.75 ? deadEnds : (nooks.length >= 3 ? nooks : edges);
      if (!pool.length) break;
      const cell = pickSpread(c, pool, placed, 14);
      placed.push(cell); addChest(c, cell, 'normal', n, nearestLandmark(c, cell).id);
      [deadEnds, nooks, edges].forEach((arr) => { const k = arr.indexOf(cell); if (k >= 0) arr.splice(k, 1); });
    }
  }

  // ---------- 결과 ----------
  function buildMap(c) {
    const { tiles } = c;
    const groups = c.groups.map((g) => {
      const out = { id: g.id, ...px(g.cell), members: g.members.slice(), spots: g.spots.map(px) };
      if (g.minibossId) out.minibossId = g.minibossId;
      return out;
    });
    return {
      floor: c.floor, biome: c.info.biome, name: c.info.name, cols: COLS, rows: ROWS, tile: TILE, tiles,
      solid(i, j) { if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return true; const t = tiles[j * COLS + i]; return t !== T.FLOOR && t !== T.DECO; },
      walkableCount: c.walkableCount, pathLength: c.path.length - 1, monsterCount: c.monsterCount,
      spawn: px(c.spawn), exit: px(c.exit),
      landmarks: c.landmarks.map((l) => ({ id: l.id, name: l.name, kind: l.kind, ...px(l.cell) })),
      groups,
      boss: { id: c.info.boss, ...px(c.boss), arenaR: REQ.arenaR * TILE },
      chests: c.chests.map((ch) => ({ id: ch.id, ...px(ch.cell), type: ch.type, landmarkId: ch.landmarkId, hidden: ch.hidden })),
    };
  }

  function generate(floor, opts = {}) {
    floor = Math.max(1, floor | 0);
    if (!opts.noCache && cache[floor]) return cache[floor];
    const info = floorInfo(floor), rng = RNG.make(RNG.floorSeed(floor));
    const c = { floor, info, rng, tiles: null, wcost: noiseCosts(rng), reserved: new Uint8Array(N), landmarks: [], chests: [], groups: [], waterCenters: [] };
    c.tiles = info.biome === 'forest' ? forestBase(c) : caveBase(c);
    placeEndpoints(c);
    connectAll(c);
    analyze(c); extraTrails(c, info.biome === 'forest' ? 5 : 3);
    placeWater(c);
    ensureWalkable(c);
    analyze(c);
    placeLandmarks(c);
    carveHiddenSpurs(c);
    if (info.biome === 'forest') decorateForest(c); else decorateCave(c);
    finalizeTerrain(c);
    placeMinibosses(c); placeChests(c); placeGroups(c);
    const map = buildMap(c);
    if (opts.debug) map.debug = c; // 도구/테스트용 내부 상태
    if (!opts.noCache) cache[floor] = map;
    return map;
  }
  function clearCache() { for (const k of Object.keys(cache)) delete cache[k]; }
  function tileAt(map, x, y) { const i = Math.floor(x / TILE), j = Math.floor(y / TILE); return map.solid(i, j) ? -1 : map.tiles[j * COLS + i]; }

  return { generate, clearCache, floorInfo, tileAt, T, TILE, COLS, ROWS, REQ };
})();
if (typeof module !== 'undefined') module.exports = DungeonGen;
