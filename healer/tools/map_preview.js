// 던전 맵 미리보기: node healer/tools/map_preview.js <floor|all> [--stats]
// 문자: 벽 #, 바닥 ., 장식 :, 물 ~, 덤불 *, 상자 C(일반)/h(숨김), 무리 m, 중간보스 M, 보스 B, 시작 S, 출구 E, 랜드마크 L
const load = require('./load');
const ctx = load(['core/rng.js', 'core/events.js', 'core/data_monsters.js', 'core/dungeon/gen.js'], { strict: false });
const Gen = ctx.DungeonGen;
const arg = process.argv[2] || '1';
const statsOnly = process.argv.includes('--stats');

function bfsDist(map, from, to) { // 시작→보스 실제 걸음 수 (map.solid 기준)
  const { cols, rows } = map, dist = new Int32Array(cols * rows).fill(-1), q = new Int32Array(cols * rows);
  let h = 0, t = 0; const s = from.j * cols + from.i; dist[s] = 0; q[t++] = s;
  while (h < t) {
    const c = q[h++], i = c % cols, j = (c / cols) | 0;
    if (i === to.i && j === to.j) return dist[c];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx, nj = j + dy; if (map.solid(ni, nj)) continue;
      const nc = nj * cols + ni; if (dist[nc] >= 0) continue; dist[nc] = dist[c] + 1; q[t++] = nc;
    }
  }
  return -1;
}
function render(map) {
  const CH = ['#', '.', '~', ':', '*'];
  const g = [];
  for (let j = 0; j < map.rows; j++) { const row = []; for (let i = 0; i < map.cols; i++) row.push(CH[map.tiles[j * map.cols + i]] || '?'); g.push(row); }
  const put = (o, ch) => { g[o.j][o.i] = ch; };
  for (const l of map.landmarks) put(l, 'L');
  for (const gr of map.groups) put(gr, gr.minibossId ? 'M' : 'm');
  for (const ch of map.chests) put(ch, ch.hidden ? 'h' : 'C');
  put(map.boss, 'B'); put(map.spawn, 'S'); put(map.exit, 'E');
  return g.map((r) => r.join('')).join('\n');
}
function stats(map, ms) {
  const monsters = map.groups.reduce((s, g) => s + g.members.length, 0);
  const hidden = map.chests.filter((c) => c.hidden).length;
  const d = bfsDist(map, map.spawn, map.boss);
  const water = Array.from(map.tiles).filter((t) => t === 2).length, bush = Array.from(map.tiles).filter((t) => t === 4).length;
  const lines = [
    `${map.floor}층 (${map.biome}) ${map.name}  생성 ${ms}ms`,
    `walkable ${map.walkableCount}  water ${water}  bush ${bush}  spawn→boss ${d}걸음 (최단 ${map.pathLength})`,
    `몬스터 ${monsters}마리 / 무리 ${map.groups.length} (중간보스 ${map.groups.filter((g) => g.minibossId).length})  보스 ${map.boss.id}`,
    `상자 ${map.chests.length} (숨김 ${hidden})  랜드마크 ${map.landmarks.map((l) => `${l.name}(${l.i},${l.j})`).join(', ')}`,
    `숨김 상자: ${map.chests.filter((c) => c.hidden).map((c) => `${c.id}@(${c.i},${c.j})←${map.landmarks.find((l) => l.id === c.landmarkId).name}`).join('  ')}`,
  ];
  return lines.join('\n');
}
const floors = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [parseInt(arg, 10)];
for (const f of floors) {
  const t0 = Date.now(); const map = Gen.generate(f); const ms = Date.now() - t0;
  if (!statsOnly && arg !== 'all') console.log(render(map));
  console.log(stats(map, ms)); console.log('');
}
