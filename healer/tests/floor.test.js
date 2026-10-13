const load = require('../tools/load');
// 층 런타임(Floor) — DESIGN §9. 실제 모듈을 전부 로드하고(1층 맵 생성 포함) 플레이어를 순간이동시켜 규칙을 검증한다.
const T = 32;
const COMP = [['warrior', 'tank'], ['rogue', 'melee'], ['hunter', 'ranged'], ['mage', 'ranged']];

function setup(level = 3, floor = 1, seed = 3) {
  const ctx = load('all');
  const { State, Party, RNG, Floor, Events } = ctx;
  const G = State.newGame('리프');
  const rng = RNG.make(seed);
  for (const [cls, role] of COMP) Party.add(G, Party.generateMember(rng, level, { cls, role }));
  const events = [];
  Events.on('*', (p, name) => events.push({ name, p }));
  const fs = Floor.start(G, floor, { rng: RNG.make(seed + 1) });
  return { ctx, G, fs, events, rng };
}
const count = (events, name) => events.filter((e) => e.name === name).length;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const teleport = (fs, x, y) => { const p = fs.battle.player; p.x = x; p.y = y; };
const tick = (ctx, fs, G, seconds, dt = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += dt) ctx.Floor.update(fs, G, dt); };
// 몬스터가 없는 안전한 곳으로 모든 몬스터를 멀리 치워 두는 대신, 검사 지점 근처 몬스터를 죽여 둔다(전투가 끼어들지 않게)
function clearAround(fs, x, y, r = 12 * T) {
  for (const m of fs.battle.monsters) if (m.alive && dist(m, { x, y }) <= r) { m.alive = false; m.hp = 0; m.state = 'dead'; }
}
// 사람이 설 수 있는 가장 가까운 지점(테스트용 ring 탐색)
function standable(fs, x, y) {
  const B = fs.battle;
  for (let ring = 0; ring <= 8; ring++) for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k, px = x + Math.cos(a) * ring * T * 0.5, py = y + Math.sin(a) * ring * T * 0.5;
    if (B.canStand(px, py, 12)) return { x: px, y: py };
  }
  return { x, y };
}

module.exports = {
  'start: 맵 위에 몬스터 ≥300 + 보스 1, 무리 id 부여, 파티는 시작점에 서고, 상자 상태 준비'(assert) {
    const { fs, G } = setup();
    assert.ok(fs.battle.monsters.length >= 301, '몬스터 ' + fs.battle.monsters.length);
    assert.ok(fs.battle.monsters.every((m) => m.groupId && m.alive && m.kind === 'monster'), '무리 id');
    assert.strictEqual(fs.boss.def.tier, 'boss'); assert.strictEqual(fs.boss.def.id, fs.map.boss.id);
    assert.ok(dist(fs.boss, fs.map.boss) < 1, '보스 위치');
    const mb = fs.battle.monsters.filter((m) => m.def.tier === 'miniboss');
    assert.strictEqual(mb.length, 3, '중간보스 3');
    const p = fs.battle.player;
    assert.strictEqual(p.x, fs.map.spawn.x); assert.strictEqual(p.y, fs.map.spawn.y);
    assert.strictEqual(fs.battle.members.length, 4);
    assert.ok(fs.battle.members.every((m) => fs.battle.canStand(m.x, m.y, m.radius) && dist(m, p) < 4 * T), '파티원은 시작점 근처 설 수 있는 곳');
    assert.ok(fs.chests.length >= 16 && fs.chests.every((c) => !c.opened));
    assert.ok(fs.chests.filter((c) => c.hidden).every((c) => !c.revealed) && fs.chests.filter((c) => !c.hidden).every((c) => c.revealed), '숨김 상자만 가려짐');
    assert.strictEqual(fs.visited.length, fs.map.cols * fs.map.rows); assert.ok(fs.visited[fs.map.spawn.j * fs.map.cols + fs.map.spawn.i] === 1, '시작점은 밝혀짐');
    assert.strictEqual(fs.bossDefeated, false); assert.strictEqual(fs.cleared, false); assert.strictEqual(fs.steps, 0);
    assert.strictEqual(fs.battle.floor, 1); assert.strictEqual(fs.battle.G, G);
  },

  'openChest: 골드·아이템 획득(item_gained/chest_opened), 카운터, 두 번 못 연다; 숨겨진 상자는 hiddenFound + 두루마리'(assert) {
    const { ctx, fs, G, events } = setup();
    const gold0 = G.player.gold;
    const c = fs.chests.find((x) => !x.hidden);
    const r = ctx.Floor.openChest(fs, G, c.id);
    assert.ok(r && r.chestId === c.id && r.floor === 1 && r.hidden === false, 'payload');
    assert.ok(r.gold > 0 && G.player.gold === gold0 + r.gold, '골드');
    assert.ok(r.items.length >= 2 && r.added.length === r.items.length, '아이템 전부 가방으로 ' + r.items.length);
    assert.ok(count(events, 'item_gained') >= 2 && count(events, 'chest_opened') === 1 && count(events, 'gold_changed') === 1);
    assert.ok(c.opened); assert.strictEqual(G.counters.chests, 1); assert.strictEqual(fs.chestsOpened, 1);
    assert.strictEqual(ctx.Floor.openChest(fs, G, c.id), null, '다시 못 연다');
    assert.strictEqual(ctx.Floor.openChest(fs, G, 'nope'), null);
    const h = fs.chests.find((x) => x.hidden);
    const hr = ctx.Floor.openChest(fs, G, h.id);
    assert.ok(hr.hidden && h.revealed && h.opened);
    assert.ok(G.quests.hiddenFound.includes(h.id), 'hiddenFound');
    assert.ok(hr.items.some((it) => it.id === 'scroll_hidden_f1'), '첫 숨겨진 상자는 두루마리');
    assert.ok(hr.items.some((it) => ['rare', 'legendary'].includes(it.grade)), '레어 이상 장비');
    const h2 = fs.chests.find((x) => x.hidden && x !== h);
    assert.ok(!ctx.Floor.openChest(fs, G, h2.id).items.some((it) => it.id === 'scroll_hidden_f1'), '두 번째 숨겨진 상자는 두루마리 없음');
    assert.strictEqual(G.counters.chests, 3);
  },

  'update: 상자 1.5타일 안이면 자동으로 열리고, 숨겨진 상자는 2타일 안에서 먼저 드러난다'(assert) {
    const { ctx, fs, G, events } = setup();
    const c = fs.chests.find((x) => !x.hidden);
    clearAround(fs, c.x, c.y);
    teleport(fs, c.x + 1.2 * T, c.y);
    ctx.Floor.update(fs, G, 0.1);
    assert.ok(c.opened && count(events, 'chest_opened') === 1, '근접 자동 열기');
    const h = fs.chests.find((x) => x.hidden);
    clearAround(fs, h.x, h.y);
    teleport(fs, h.x + 1.8 * T, h.y);
    ctx.Floor.update(fs, G, 0.1);
    assert.ok(h.revealed && !h.opened && count(events, 'chest_revealed') === 1, '2타일: 드러나지만 안 열림');
    teleport(fs, h.x + 1.0 * T, h.y);
    ctx.Floor.update(fs, G, 0.1);
    assert.ok(h.opened && count(events, 'chest_opened') === 2, '1.5타일: 열림');
    assert.ok(G.quests.hiddenFound.includes(h.id));
  },

  'update: 걸음은 1타일 이동마다 세고 100걸음마다 steps 이벤트, 순간이동은 걸음이 아니다'(assert) {
    const { ctx, fs, G, events } = setup();
    const p = fs.battle.player;
    clearAround(fs, p.x, p.y, 30 * T);
    for (let i = 0; i < 250; i++) { p.x += (i % 2 ? 1 : -1) * 0.5 * T; ctx.Floor.update(fs, G, 0.1); }  // 반 타일씩 왕복 = 125걸음
    assert.strictEqual(fs.steps, 125, '걸음 ' + fs.steps);
    assert.strictEqual(G.counters.steps, 125);
    const ev = events.filter((e) => e.name === 'steps');
    assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].p.n, 100); assert.strictEqual(ev[0].p.total, 100);
    teleport(fs, p.x + 40 * T, p.y); ctx.Floor.update(fs, G, 0.1);
    assert.strictEqual(fs.steps, 125, '순간이동은 걸음이 아님');
    assert.ok(fs.visited.reduce((s, v) => s + v, 0) > 100, '미니맵 시야가 밝혀진다');
  },

  'update: 보스 처치 → bossDefeated/exit_opened, 출구 도달 → cleared + floor_cleared(한 번)'(assert) {
    const { ctx, fs, G, events } = setup();
    const B = fs.battle, ex = fs.map.exit;
    clearAround(fs, ex.x, ex.y, 10 * T);
    teleport(fs, ex.x, ex.y);
    ctx.Floor.update(fs, G, 0.1);
    assert.ok(!fs.cleared && !fs.bossDefeated, '보스 전엔 출구가 닫혀 있다');
    B.damage(null, fs.boss, 1e9, { noEvade: true, noDef: true, noCrit: true });
    assert.ok(!fs.boss.alive && count(events, 'boss_killed') === 1);
    ctx.Floor.update(fs, G, 0.1);
    assert.ok(fs.bossDefeated && count(events, 'exit_opened') === 1, '출구 활성');
    assert.ok(fs.cleared && fs.result === 'cleared' && count(events, 'floor_cleared') === 1, '출구 위에 서 있었으므로 바로 클리어');
    const fc = events.find((e) => e.name === 'floor_cleared').p;
    assert.strictEqual(fc.floor, 1); assert.ok(typeof fc.time === 'number');
    ctx.Floor.update(fs, G, 0.1);
    assert.strictEqual(count(events, 'floor_cleared'), 1, '클리어 뒤엔 갱신이 멈춘다');
  },

  'leave(cleared): 탑 기록·보너스 XP·피로(걸음/무리/보스)·전원 회복·floor_left'(assert) {
    const { ctx, fs, G, events } = setup();
    const B = fs.battle, p = B.player;
    fs.steps = 250; fs.groupsFought.add('f1_g1'); fs.groupsFought.add('f1_g2'); fs.fatigue = 4;   // 무리 2개 교전한 셈
    B.damage(null, fs.boss, 1e9, { noEvade: true, noDef: true, noCrit: true });
    clearAround(fs, fs.map.exit.x, fs.map.exit.y, 10 * T); teleport(fs, fs.map.exit.x, fs.map.exit.y);
    tick(ctx, fs, G, 0.5);
    p.hp = 10; G.party[0].hp = 5; B.members[0].hp = 5;
    const xp0 = G.player.xp, mxp0 = G.party[1].xp;
    const s = ctx.Floor.leave(fs, G, 'cleared');
    assert.ok(s.cleared && s.reason === 'cleared' && s.floor === 1);
    assert.strictEqual(G.tower.highestCleared, 1);
    assert.strictEqual(G.tower.records[1].clears, 1); assert.ok(G.tower.records[1].bestTime > 0 && G.tower.records[1].bestTime === s.time);
    assert.ok(s.xpBonus > 0 && (G.player.xp > xp0 || G.player.level > 3), '클리어 보너스 XP');
    assert.ok(G.party[1].xp > mxp0 || G.party[1].level > 3, '파티원도 보너스');
    // 피로: (250걸음 → 2.5) + 무리 2×2 + 보스 5 = 11.5 × 지구력 배수(<1)
    const mult = ctx.Stats.derive(G.player, G).fatigueGainMult;
    assert.ok(Math.abs(s.fatigueGained - Math.round(11.5 * mult * 10) / 10) < 0.11, `피로 ${s.fatigueGained} vs ${11.5 * mult}`);
    assert.strictEqual(G.player.fatigue, s.fatigueGained);
    assert.ok(G.player.hp > 100 && G.party[0].hp > 5 && count(events, 'party_healed') === 1, '마을 복귀 회복');
    assert.strictEqual(count(events, 'floor_left'), 1);
    assert.strictEqual(ctx.Floor.leave(fs, G, 'cleared'), s, '두 번 불러도 같은 요약');
    assert.strictEqual(G.tower.records[1].clears, 1, '기록 중복 없음');
  },

  'leave(wipe): 사망 페널티 피로 +10(지구력 보정) + 장비 내구도 -20%, 기록엔 wipe'(assert) {
    const { ctx, fs, G } = setup();
    const { Items, Inventory } = ctx;
    const robe = Items.generate({ id: 'cloth_body_1', grade: 'common' });
    Inventory.add(G, robe); Inventory.equip(G, robe.uid);
    const B = fs.battle;
    for (const e of B.party()) B.damage(null, e, 1e9, { noEvade: true, noDef: true, noCrit: true });
    ctx.Floor.update(fs, G, 0.1);
    assert.strictEqual(fs.result, 'wipe'); assert.strictEqual(fs.playerDeaths, 1); assert.strictEqual(fs.memberDeaths, 4);
    const s = ctx.Floor.leave(fs, G, 'wipe');
    const mult = ctx.Stats.derive(G.player, G).fatigueGainMult;
    assert.ok(Math.abs(s.fatigueGained - Math.round(10 * mult * 10) / 10) < 0.11, '사망 피로 ' + s.fatigueGained);
    assert.ok(G.player.fatigue >= 8, '피로 ' + G.player.fatigue);
    assert.strictEqual(G.player.equipment.body.durability, 80, '플레이어 장비 -20%');
    assert.ok(G.party.every((m) => m.equipment.body.durability === 80 && m.equipment.main.durability === 80), '파티원 장비 -20%');
    assert.strictEqual(G.tower.highestCleared, 0); assert.strictEqual(G.tower.records[1].wipes, 1); assert.strictEqual(G.tower.records[1].clears, 0);
    assert.ok(G.player.hp > 0 && G.party.every((m) => m.hp > 0), '마을로 돌아오면 살아난다');
  },

  '쓰러진 힐러는 전투가 끝나고 8초 뒤 파티원이 일으켜 세운다(HP 30%)'(assert) {
    const { ctx, fs, G, events } = setup();
    const B = fs.battle, p = B.player;
    clearAround(fs, p.x, p.y, 30 * T);
    B.damage(null, p, 1e9, { noEvade: true, noDef: true, noCrit: true });
    assert.ok(!p.alive);
    tick(ctx, fs, G, 7.5);
    assert.ok(!p.alive, '아직');
    tick(ctx, fs, G, 1);
    assert.ok(p.alive && Math.abs(p.hp / p.maxHp - 0.3) < 0.02, `부활 ${p.hp}/${p.maxHp}`);
    assert.strictEqual(fs.playerDeaths, 1); assert.strictEqual(count(events, 'revive'), 1);
  },

  '자동 따라가기: 비전투 상태로 10타일 넘게 떨어진 파티원은 4초 뒤 힐러 옆으로 붙는다'(assert) {
    const { ctx, fs, G } = setup();
    const B = fs.battle, p = B.player, m = B.members[0];
    clearAround(fs, p.x, p.y, 40 * T);
    // 시작점에서 14~16타일 떨어진 설 수 있는 곳을 찾는다(맵이 결정적이라 항상 같은 곳)
    let spot = null;
    for (let r = 14; r <= 16 && !spot; r++) for (let k = 0; k < 16 && !spot; k++) {
      const a = (Math.PI / 8) * k, x = p.x + Math.cos(a) * r * T, y = p.y + Math.sin(a) * r * T;
      if (B.canStand(x, y, m.radius)) spot = { x, y };
    }
    assert.ok(spot, '먼 지점');
    m.x = spot.x; m.y = spot.y;
    B.applyCurse(m, 'root', 60);   // 속박 = 스스로 못 돌아오는 상황(길을 잃은 경우와 같다)
    G.player.settings.autoHeal = false;   // 힐러 AI 가 속박을 풀어 주면 걸어서 돌아오므로 끈다
    G.player.settings.autoFollow = false;
    tick(ctx, fs, G, 5);
    assert.ok(dist(m, p) > 10 * T, '자동 따라가기 꺼짐이면 그대로');
    G.player.settings.autoFollow = true;
    tick(ctx, fs, G, 4.5);
    assert.ok(dist(m, p) <= 4 * T && B.canStand(m.x, m.y, m.radius), `붙음 ${Math.round(dist(m, p) / T)}타일`);
  },

  '무리 교전 집계: 처음 교전한 무리마다 피로 +2, 보스 무리는 제외'(assert) {
    const { ctx, fs, G } = setup();
    const B = fs.battle;
    const g = fs.map.groups.find((x) => !x.minibossId);
    const mons = B.monsters.filter((m) => m.groupId === g.id);
    for (const m of mons) m.aggro = true;
    fs.boss.aggro = true;
    ctx.Floor.update(fs, G, 0.1);
    assert.ok(fs.groupsFought.has(g.id) && fs.groupsFought.has(fs.boss.groupId));
    assert.strictEqual(fs.fatigue, 2, '무리 하나만 +2');
    ctx.Floor.update(fs, G, 0.1);
    assert.strictEqual(fs.fatigue, 2, '같은 무리는 한 번만');
  },
  // 회귀(E2E 통합): 음식 버프 until 은 G.playTime 시계로 찍힌다 → 전투 시계도 playTime 에서 시작해야 지속시간이 맞는다
  '전투 시계는 G.playTime 에서 시작하고 마을에서 먹은 음식 버프가 그 시간만큼만 간다'(assert) {
    const ctx = load('all');
    const { State, Floor, Facilities, RNG } = ctx;
    const G = State.newGame('리프');
    G.player.gold = 1000; G.playTime = 5000;
    const meal = Facilities.inn.menu()[0];
    assert.ok(Facilities.inn.eat(G, meal.id, G.playTime).ok);
    const fs = Floor.start(G, 1, { rng: RNG.make(9) });
    assert.strictEqual(fs.battle.time, 5000);
    const food = () => fs.battle.player.buffs.find((b) => b.id === meal.id);
    assert.ok(food(), '입장 직후 음식 버프 유지');
    const dur = food().until - fs.battle.time;
    assert.ok(dur > 0 && dur <= meal.buff.duration + 1e-6, '남은 시간 = 메뉴 지속시간 이하: ' + dur);
    for (const m of fs.battle.monsters) { m.alive = false; m.hp = 0; m.state = 'dead'; }
    for (let t = 0; t < dur + 2; t += 0.5) Floor.update(fs, G, 0.5);
    assert.ok(!G.player.buffs.some((b) => b.id === meal.id), '지속시간이 지나면 사라짐');
  },
};
