const load = require('../tools/load');
const FILES = ['core/rng.js', 'core/events.js', 'core/data_monsters.js', 'core/dungeon/gen.js'];
const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const T = { WALL: 0, FLOOR: 1, WATER: 2, DECO: 3, BUSH: 4 };

let shared = null;
function maps() { // 10층 생성은 비싸므로 테스트끼리 공유
  if (shared) return shared;
  const ctx = load(FILES);
  shared = { ctx, maps: FLOORS.map((f) => ctx.DungeonGen.generate(f)) };
  return shared;
}
function bfs(map, from) { // map.solid 기준 도달 거리 (타일)
  const { cols, rows } = map, dist = new Int32Array(cols * rows).fill(-1), q = new Int32Array(cols * rows);
  let h = 0, t = 0; const s = from.j * cols + from.i; dist[s] = 0; q[t++] = s;
  while (h < t) {
    const c = q[h++], i = c % cols, j = (c / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx, nj = j + dy; if (map.solid(ni, nj)) continue;
      const nc = nj * cols + ni; if (dist[nc] >= 0) continue; dist[nc] = dist[c] + 1; q[t++] = nc;
    }
  }
  return dist;
}
const at = (map, o) => map.tiles[o.j * map.cols + o.i];
const count = (map, tile) => { let n = 0; for (const t of map.tiles) if (t === tile) n++; return n; };
const cheb = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
// vm 컨텍스트가 다르면 프로토타입이 달라 deepStrictEqual 이 실패하므로 JSON 으로 비교
const same = (assert, a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);

module.exports = {
  '1~10층 전부 요구 수치 충족(160×160, walkable≥10000, 몬스터≥300, 무리 60~80, 중간보스 3, 상자≥16/숨김≥5, 랜드마크≥6)'(assert) {
    for (const map of maps().maps) {
      const f = map.floor;
      assert.strictEqual(map.cols, 160); assert.strictEqual(map.rows, 160); assert.strictEqual(map.tiles.length, 160 * 160);
      assert.ok(map.walkableCount >= 10000, `${f}층 walkable ${map.walkableCount}`);
      let walk = 0; for (const t of map.tiles) if (t === T.FLOOR || t === T.DECO) walk++;
      assert.strictEqual(walk, map.walkableCount, `${f}층 walkableCount 집계`);
      assert.ok(map.groups.length >= 60 && map.groups.length <= 80, `${f}층 무리 ${map.groups.length}`);
      const total = map.groups.reduce((s, g) => s + g.members.length, 0);
      assert.ok(total >= 300, `${f}층 몬스터 ${total}`);
      assert.strictEqual(map.monsterCount, total);
      const mb = map.groups.filter((g) => g.minibossId);
      assert.strictEqual(mb.length, 3, `${f}층 중간보스 ${mb.length}`);
      for (const g of mb) assert.strictEqual(g.members[0], g.minibossId, '중간보스는 자기 무리의 첫 멤버');
      assert.ok(map.boss && map.boss.id && map.boss.arenaR === 6 * 32, `${f}층 보스`);
      assert.ok(map.chests.length >= 16, `${f}층 상자 ${map.chests.length}`);
      const hidden = map.chests.filter((c) => c.hidden);
      assert.ok(hidden.length >= 5, `${f}층 숨김 상자 ${hidden.length}`);
      hidden.forEach((c, k) => { assert.strictEqual(c.id, `f${f}_hidden${k + 1}`); assert.strictEqual(c.type, 'hidden'); });
      map.chests.filter((c) => !c.hidden).forEach((c, k) => assert.strictEqual(c.id, `f${f}_chest${k + 1}`));
      assert.strictEqual(new Set(map.chests.map((c) => c.id)).size, map.chests.length, '상자 id 중복');
      assert.ok(map.landmarks.length >= 6, `${f}층 랜드마크 ${map.landmarks.length}`);
      assert.strictEqual(new Set(map.landmarks.map((l) => l.id)).size, map.landmarks.length);
      for (const l of map.landmarks) assert.ok(l.name && typeof l.x === 'number' && l.kind, '랜드마크 필드');
      const lmIds = new Set(map.landmarks.map((l) => l.id));
      for (const c of map.chests) assert.ok(lmIds.has(c.landmarkId), `${c.id} landmarkId ${c.landmarkId}`);
      assert.strictEqual(new Set(map.groups.map((g) => g.id)).size, map.groups.length, '무리 id 중복');
    }
  },
  '결정적: 새 컨텍스트에서 다시 만들어도 같은 맵, 캐시는 같은 객체'(assert) {
    const a = maps(), ctx2 = load(FILES);
    for (const m1 of a.maps) {
      const m2 = ctx2.DungeonGen.generate(m1.floor);
      assert.ok(Buffer.from(m1.tiles).equals(Buffer.from(m2.tiles)), `${m1.floor}층 타일 불일치`);
      same(assert, m1.chests, m2.chests); same(assert, m1.groups, m2.groups);
      same(assert, m1.landmarks, m2.landmarks); same(assert, m1.spawn, m2.spawn);
      assert.strictEqual(a.ctx.DungeonGen.generate(m1.floor), m1);
      const fresh = a.ctx.DungeonGen.generate(m1.floor, { noCache: true });
      assert.notStrictEqual(fresh, m1); assert.ok(Buffer.from(fresh.tiles).equals(Buffer.from(m1.tiles)));
    }
    assert.ok(!Buffer.from(a.maps[0].tiles).equals(Buffer.from(a.maps[1].tiles)), '층마다 다른 맵');
  },
  '연결성: 시작점에서 보스·출구·모든 상자·모든 무리(자리 포함)에 도달, 통행 불가 칸엔 아무것도 없음'(assert) {
    for (const map of maps().maps) {
      const dist = bfs(map, map.spawn), reach = (o) => dist[o.j * map.cols + o.i] >= 0;
      assert.ok(reach(map.boss), `${map.floor}층 보스 도달`); assert.ok(reach(map.exit), `${map.floor}층 출구 도달`);
      for (const c of map.chests) assert.ok(reach(c), `${map.floor}층 ${c.id} 도달`);
      for (const g of map.groups) { assert.ok(reach(g), `${map.floor}층 ${g.id} 도달`); assert.ok(g.spots.length >= 3); for (const s of g.spots) assert.ok(reach(s), `${g.id} spot`); }
      for (const l of map.landmarks) assert.ok(reach(l), `${map.floor}층 ${l.name} 도달`);
      let reachable = 0; for (const d of dist) if (d >= 0) reachable++;
      assert.strictEqual(reachable, map.walkableCount, `${map.floor}층 고립된 통행 칸`);
      assert.ok(map.pathLength >= 200 && dist[map.boss.j * map.cols + map.boss.i] === map.pathLength, `${map.floor}층 경로 ${map.pathLength}`);
    }
  },
  '숨겨진 상자는 덤불로 둘러싸인 막다른 길 끝이고 자기 랜드마크 근처'(assert) {
    for (const map of maps().maps) {
      for (const c of map.chests.filter((x) => x.hidden)) {
        let open4 = 0, bush8 = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!map.solid(c.i + dx, c.j + dy)) open4++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && map.tiles[(c.j + dy) * map.cols + c.i + dx] === T.BUSH) bush8++;
        assert.strictEqual(open4, 1, `${c.id} 막다른 길`);
        assert.ok(bush8 >= 5, `${c.id} 덤불 ${bush8}`);
        const lm = map.landmarks.find((l) => l.id === c.landmarkId);
        assert.ok(cheb(c, lm) <= 30, `${c.id} 랜드마크 '${lm.name}' 에서 ${cheb(c, lm)}타일`);
      }
      for (const c of map.chests) assert.ok(!map.solid(c.i, c.j) && cheb(c, map.spawn) >= 8, `${c.id} 위치`);
    }
  },
  '보스 아레나: 반대편 끝 반경 6타일 공터, 시작점과 멀고 무리는 아레나 밖'(assert) {
    for (const map of maps().maps) {
      const b = map.boss;
      assert.ok(cheb(b, map.spawn) >= 110, `${map.floor}층 보스 거리 ${cheb(b, map.spawn)}`);
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy <= 36) assert.ok(!map.solid(b.i + dx, b.j + dy), `${map.floor}층 아레나 (${dx},${dy})`);
      for (const g of map.groups) assert.ok(cheb(g, b) > 10, `${g.id} 아레나 안`);
      assert.ok(cheb(map.exit, b) >= 6 && cheb(map.exit, map.spawn) > cheb(b, map.spawn), '출구는 보스 뒤');
      assert.strictEqual(map.spawn.x, (map.spawn.i + 0.5) * 32); assert.strictEqual(b.y, (b.j + 0.5) * 32);
    }
  },
  '바이옴 지형: 숲(1~5)은 호수·덤불·장식, 동굴(6~10)은 수정 장식·바위'(assert) {
    for (const map of maps().maps) {
      if (map.floor <= 5) { assert.strictEqual(map.biome, 'forest'); assert.ok(count(map, T.WATER) >= 50, `${map.floor}층 물`); }
      else assert.strictEqual(map.biome, 'cave');
      assert.ok(count(map, T.BUSH) >= 100, `${map.floor}층 덤불/바위`); assert.ok(count(map, T.DECO) >= 100, `${map.floor}층 장식`);
      assert.ok(map.solid(-1, 0) && map.solid(0, 160) && map.solid(0, 0), '경계는 벽');
      assert.strictEqual(map.solid(map.spawn.i, map.spawn.j), false);
      assert.ok(at(map, map.boss) === T.FLOOR || at(map, map.boss) === T.DECO);
    }
  },
  '생성 시간 < 1초/층 (노드)'(assert) {
    const ctx = load(FILES);
    for (const f of FLOORS) {
      const t0 = Date.now(); ctx.DungeonGen.generate(f, { noCache: true }); const ms = Date.now() - t0;
      assert.ok(ms < 1000, `${f}층 ${ms}ms`);
    }
  },
  'Floors 가 주는 바이옴·랜드마크·풀·중간보스·보스·몬스터 수를 그대로 쓴다 (없으면 기본값)'(assert) {
    const ctx = load(['core/rng.js', 'core/events.js', 'core/dungeon/gen.js']);
    const base = ctx.DungeonGen.generate(3);
    assert.strictEqual(base.biome, 'forest'); assert.ok(base.landmarks.length >= 6 && base.boss.id);
    ctx.Floors = { get: (f) => ({ floor: f, biome: 'cave', name: '테스트 동굴', landmarks: ['가', '나', '다', '라', '마', '바', '사'], pool: [{ id: 'bat', weight: 3 }, { id: 'golem_stone', weight: 1 }],
                                  minibosses: ['mb_a', 'mb_b', 'mb_c'], boss: 'boss_test', monsterCount: 340 }) };
    const map = ctx.DungeonGen.generate(3, { noCache: true });
    assert.strictEqual(map.biome, 'cave'); assert.strictEqual(map.name, '테스트 동굴'); assert.strictEqual(map.boss.id, 'boss_test');
    same(assert, map.landmarks.map((l) => l.name), ['가', '나', '다', '라', '마', '바', '사']);
    same(assert, map.groups.filter((g) => g.minibossId).map((g) => g.minibossId), ['mb_a', 'mb_b', 'mb_c']);
    assert.ok(map.monsterCount >= 340, 'monsterCount ' + map.monsterCount);
    const ids = new Set(map.groups.flatMap((g) => g.members));
    same(assert, [...ids].sort(), ['bat', 'golem_stone', 'mb_a', 'mb_b', 'mb_c']);
    assert.ok(map.walkableCount >= 10000);
  },
};
