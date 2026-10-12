const load = require('../tools/load');
// 다른 모듈(Classes/Skills/Stats/Monsters/Items/Inventory/Level/Loot/AIHealer)은 실제 파일을 로드한다. Party/Floor 는 아직 없어 건너뛴다.
// 플레이어 스킬을 테스트가 직접 조작하는 시나리오는 driveHealer:false 로 힐러 AI 를 끈다(켜 두면 AI 가 먼저 해제/힐을 시작한다).
const boot = () => load('all');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 객체는 프로토타입이 달라 JSON 으로 비교
// 빈 맵: 안은 전부 바닥, 범위 밖은 벽(DESIGN §9 solid 규약)
const EMPTY_MAP = { cols: 100, rows: 100, solid: (i, j) => i < 0 || j < 0 || i >= 100 || j >= 100 };
const T = 32;
const MEMBERS = [['warrior', 'tank', '바위'], ['rogue', 'melee', '그림자'], ['hunter', 'ranged', '매'], ['mage', 'ranged', '불꽃']];

// 파티원 스텁: DESIGN §2 memberInst 모양 그대로
function memberInst(ctx, [cls, role, name], level, i) {
  return { uid: 'm' + i, name, cls, role, level, xp: 0, stats: ctx.Classes.statsAt(cls, level), equipment: { body: null, main: null }, hireCost: 0, personality: '' };
}
function setup(ctx, { level = 3, floor = 1, monsters = [], seed = 7, members = MEMBERS, ai, driveHealer, at = { x: 10 * T, y: 10 * T } } = {}) {
  const G = ctx.State.newGame('리프');
  G.player.level = level;
  G.party = members.map((m, i) => memberInst(ctx, m, level, i));
  const rng = ctx.RNG.make(seed);
  const player = ctx.Entities.fromPlayer(G); player.x = at.x; player.y = at.y;
  const mems = G.party.map((m, i) => { const e = ctx.Entities.fromMember(G, m); e.x = at.x + 40 * (i + 1); e.y = at.y + 30 * (i % 2); return e; });
  const mons = monsters.map(({ id, x, y, groupId }) => { const e = ctx.Entities.fromMonster(ctx.Monsters.get(id), floor, x, y, rng); e.groupId = groupId || 'g1'; return e; });
  const events = [];
  ctx.Events.on('*', (p, name) => events.push({ name, p }));
  const battle = ctx.Combat.create({ map: EMPTY_MAP, player, members: mems, monsters: mons, rng, G, floor, ai, driveHealer });
  return { G, battle, player, members: mems, monsters: mons, events, rng };
}
const sim = (battle, seconds, dt = 0.1, each) => { for (let t = 0; t < seconds; t += dt) { battle.update(dt); if (each) each(t); } };
const count = (events, name) => events.filter((e) => e.name === name).length;
const hpPct = (e) => e.hp / e.maxHp;
// AIHealer 가 없으므로 테스트가 힐러 노릇을 한다: 다친 아군이 있으면 기본 힐(대상 자동 선택 경로를 탄다)
const healLoop = (battle) => () => { const p = battle.player; if (p.alive && !p.cast && battle.allies().some((e) => hpPct(e) < 0.8)) battle.useSkill(p, 'heal_basic'); };

module.exports = {
  'Entities: 플레이어/파티원은 Stats.derive, 몬스터는 Monsters.statsAt(층 배수) 기반, 음식 버프 복사'(assert) {
    const ctx = boot(); const { State, Entities, Monsters, Stats } = ctx;
    const G = State.newGame('리프');
    G.player.buffs = [{ id: 'food_stew', stat: 'int', value: 0.1, until: 999 }];
    const p = Entities.fromPlayer(G);
    assert.strictEqual(p.kind, 'player'); assert.strictEqual(p.role, 'healer'); assert.strictEqual(p.src, G.player);
    assert.strictEqual(p.buffs.length, 1); assert.notStrictEqual(p.buffs[0], G.player.buffs[0], '복사본');
    assert.strictEqual(p.maxHp, Stats.derive(G.player, G).maxHp); assert.strictEqual(p.hp, p.maxHp);
    assert.ok(p.stats.int > 14, '음식 버프 반영 ' + p.stats.int);
    const m = Entities.fromMember(G, memberInst(ctx, ['warrior', 'tank', '바위'], 5, 0));
    assert.strictEqual(m.kind, 'member'); assert.strictEqual(m.role, 'tank'); assert.strictEqual(m.level, 5);
    assert.strictEqual(m.maxHp, Stats.derive(m.src, G).maxHp); assert.strictEqual(m.range, 40); assert.strictEqual(m.atkInterval, 1.2);
    const def = Monsters.get('skeleton'), st = Monsters.statsAt(def, 3);
    const mon = Entities.fromMonster(def, 3, 100, 200, ctx.RNG.make(1));
    assert.strictEqual(mon.kind, 'monster'); assert.strictEqual(mon.maxHp, st.hp); assert.strictEqual(mon.stats.atk, st.atk); assert.strictEqual(mon.stats.def, st.def);
    assert.strictEqual(mon.speed, st.spd); assert.strictEqual(mon.stats.atkSpeed, st.aspd); assert.strictEqual(mon.xp, st.xp);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(mon.home)), { x: 100, y: 200 }); assert.ok(mon.tags.includes('undead'));
    assert.strictEqual(mon.aggroRange, 7 * T); assert.strictEqual(mon.leashRange, 25 * T);
    // refresh: 저주를 넣고 다시 계산하면 배수가 겹치지 않는다
    mon.curses.push({ id: 'def_down', until: 99 }); Entities.refresh(mon, null, 0); Entities.refresh(mon, null, 0);
    assert.strictEqual(mon.stats.def, Math.round(st.def * 0.7 * 100) / 100);
  },

  '60초 시뮬: 탱커가 위협 1위, 피해/힐 이벤트 발생, 처치→루팅·경험치·카운터, 활성 반경 밖 몬스터는 갱신 생략'(assert) {
    const ctx = boot();
    // 2레벨 파티 vs 10마리 무리(좀비·해골이 질겨 전투가 길다). 5인 파티는 1층 고블린 6마리쯤은 5초 만에 쓸어버린다.
    const ids = ['zombie', 'zombie', 'zombie', 'skeleton', 'skeleton', 'goblin', 'goblin', 'wolf', 'wolf', 'orc'];
    const group = ids.map((id, i) => ({ id, x: 15 * T + (i % 4) * 40, y: 9 * T + Math.floor(i / 4) * 40 }));
    group.push({ id: 'wolf', x: 45 * T, y: 45 * T, groupId: 'far' });   // 30 타일 밖
    const S = setup(ctx, { level: 2, floor: 1, monsters: group, seed: 11 });
    const { battle, members, events, G } = S;
    const tank = members[0], far = S.monsters[ids.length];
    const gold0 = G.player.gold;
    sim(battle, 60, 0.1, healLoop(battle));
    assert.ok(count(events, 'damage') > 50, '피해 이벤트 ' + count(events, 'damage'));
    assert.ok(count(events, 'heal') >= 3, '힐 이벤트 ' + count(events, 'heal'));
    assert.ok(count(events, 'heal_done') >= 3 && count(events, 'cast_start') >= 3 && count(events, 'cast_done') >= 3);
    const killed = events.filter((e) => e.name === 'monster_killed');
    assert.ok(killed.length >= 3, '처치 ' + killed.length);
    assert.ok(killed.every((e) => e.p.id && e.p.family && Array.isArray(e.p.tags) && e.p.floor === 1), 'monster_killed 페이로드');
    // 위협: 피해를 준 몬스터마다 1위가 탱커
    const fought = S.monsters.filter((m) => m !== far && Object.keys(m.threat).length);
    const topIsTank = fought.filter((m) => Object.entries(m.threat).sort((a, b) => b[1] - a[1])[0][0] === tank.uid);
    assert.ok(fought.length >= 4 && topIsTank.length / fought.length >= 0.6, `탱커 위협 1위 ${topIsTank.length}/${fought.length}`);
    // 루팅·경험치·카운터
    assert.ok(count(events, 'loot') === killed.length, '루팅 이벤트');
    assert.ok(G.player.gold > gold0, '골드 증가');
    assert.ok(G.player.xp > 0 || G.player.level > 3, '경험치');
    assert.strictEqual(G.counters.kills, killed.length);
    assert.ok(G.counters.heals > 0);
    assert.strictEqual(G.player.hp, Math.round(battle.player.hp), 'G.player.hp 동기화');
    // 활성 반경(20타일) 밖 늑대는 손도 안 댔다
    assert.ok(!far.aggro && far.state === 'idle' && !far.patrol && far.hp === far.maxHp, '원거리 몬스터 미갱신');
    assert.ok(!battle.activeMonsters().includes(far));
    assert.strictEqual(battle.result, null);
  },

  '텔레그래프(circle): windup 동안 fill 이 차고, 다 차면 범위 안 아군에게 1회 피해'(assert) {
    const ctx = boot();
    const S = setup(ctx, { members: [], monsters: [{ id: 'goblin_chief', x: 12 * T, y: 10 * T }], ai: false, seed: 3 });
    const { battle, player, events } = S;
    const chief = S.monsters[0];
    const r = battle.castAbility(chief, 'aoe_small', player);
    assert.ok(r.ok && r.telegraph, JSON.stringify(r));
    const tg = battle.telegraphs[0];
    assert.strictEqual(tg.type, 'circle'); assert.strictEqual(tg.x, player.x); assert.strictEqual(tg.r, 2 * T); assert.strictEqual(tg.windup, 3);
    assert.strictEqual(count(events, 'telegraph'), 1); assert.strictEqual(chief.state, 'cast');
    const hp0 = player.hp;
    sim(battle, 1.5);
    assert.ok(tg.fill > 0.4 && tg.fill < 0.6, 'fill ' + tg.fill); assert.strictEqual(player.hp, hp0, 'windup 중엔 피해 없음');
    sim(battle, 1.7);
    assert.ok(player.hp < hp0, '피해'); assert.strictEqual(battle.telegraphs.length, 0, '발동 후 제거');
    const hits = events.filter((e) => e.name === 'damage' && e.p.type === 'telegraph');
    assert.strictEqual(hits.length, 1); assert.strictEqual(hits[0].p.abilityId, 'aoe_small');
    assert.ok(hits[0].p.amount >= Math.floor(chief.stats.atk * 1.6 * 0.9 - player.stats.def * 0.5), '피해량 ' + hits[0].p.amount);
    assert.strictEqual(count(events, 'cast_done'), 1); assert.ok(chief.cooldowns.aoe_small > battle.time, '쿨타임');
  },

  '장판(puddle): windup 후 duration 동안 안에 있으면 초당 피해 + 저주(dot) 1회, 끝나면 제거'(assert) {
    const ctx = boot();
    const S = setup(ctx, { members: [], monsters: [{ id: 'spider', x: 12 * T, y: 10 * T }], ai: false, seed: 5 });
    const { battle, player, events } = S;
    assert.ok(battle.castAbility(S.monsters[0], 'puddle_poison_small', player).ok);
    const tg = battle.telegraphs[0];
    assert.strictEqual(tg.type, 'puddle'); assert.strictEqual(tg.duration, 5);
    sim(battle, 3.05);
    assert.ok(tg.active && tg.fill === 1, '활성');
    const hp1 = player.hp;
    sim(battle, 2);
    const ticks = events.filter((e) => e.name === 'damage' && e.p.type === 'puddle');
    assert.ok(ticks.length >= 3, '장판 틱 ' + ticks.length);
    assert.ok(player.hp < hp1, '지속 피해');
    assert.ok(player.curses.some((c) => c.id === 'dot' && c.dps > 0), '맹독 저주');
    assert.strictEqual(events.filter((e) => e.name === 'curse' && e.p.id === 'dot').length, 1, '장판 저주는 1회');
    sim(battle, 3.2);
    assert.strictEqual(battle.telegraphs.length, 0, 'duration 후 제거');
  },

  '저주: applyCurse 가 파생 스탯에 반영되고 만료되면 복구, cleanse 는 root > heal_down > dot 순, 벨트 해독제·포션 자동 사용'(assert) {
    const ctx = boot(); const { Items, Inventory } = ctx;
    const S = setup(ctx, { members: [], monsters: [], seed: 9, driveHealer: false });
    const { battle, player, events, G } = S;
    const def0 = player.stats.def;
    battle.applyCurse(player, 'def_down', 5);
    assert.ok(Math.abs(player.stats.def - def0 * 0.7) < 0.01, 'def_down ' + player.stats.def);
    assert.strictEqual(count(events, 'curse'), 1);
    sim(battle, 5.2);
    assert.strictEqual(player.curses.length, 0, '만료'); assert.strictEqual(player.stats.def, def0, '복구');
    assert.strictEqual(count(events, 'curse_expired'), 1);
    battle.applyCurse(player, 'dot', 10); battle.applyCurse(player, 'root', 10); battle.applyCurse(player, 'heal_down', 10);
    assert.ok(player.stats.rooted && player.speed === 0 && player.stats.healTakenMult === 0.5);
    same(assert, battle.cleanse(player, 1), ['root']);
    same(assert, battle.cleanse(player, 1), ['heal_down']);
    assert.ok(!player.stats.rooted && player.stats.healTakenMult === 1);
    // 벨트: 저주(dot) 남음 → 해독제, HP<40% → 포션. 아이템별 쿨 10초.
    G.player.belt = ['antidote', 'hp_potion_s'];
    assert.ok(Inventory.add(G, Items.make('antidote', 2)) && Inventory.add(G, Items.make('hp_potion_s', 2)));
    sim(battle, 0.6);
    assert.strictEqual(player.curses.length, 0, '해독제 자동 사용'); assert.strictEqual(Inventory.count(G, 'antidote'), 1);
    player.hp = Math.floor(player.maxHp * 0.3); const low = player.hp;
    sim(battle, 0.6);
    assert.strictEqual(player.hp, low + 80, '포션 자동 사용'); assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 1);
    player.hp = Math.floor(player.maxHp * 0.3);
    sim(battle, 0.6);
    assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 1, '쿨타임 중엔 안 씀');
    assert.strictEqual(count(events, 'consumable_used'), 2);
  },

  '부활: 죽은 파티원에게 resurrect 시전(5초) → HP 30% 로 alive, revive 이벤트, 쿨타임; 전멸하면 result=wipe'(assert) {
    const ctx = boot();
    const S = setup(ctx, { level: 8, monsters: [], seed: 2, driveHealer: false });
    const { battle, player, members, events, G } = S;
    G.player.skillLevels.resurrect = 1;
    const tank = members[0];
    battle.damage(null, tank, 99999, { noEvade: true, noDef: true });
    assert.ok(!tank.alive && tank.state === 'dead' && count(events, 'death') === 1);
    const mp0 = player.mp;
    same(assert, battle.useSkill(player, 'resurrect', tank), { ok: true });
    assert.strictEqual(player.mp, mp0, '시전 시작 땐 MP 그대로');
    assert.strictEqual(player.cast.skillId, 'resurrect'); assert.strictEqual(player.cast.total, 5);
    assert.strictEqual(battle.useSkill(player, 'heal_basic').reason, 'casting');
    sim(battle, 5.1);
    assert.ok(tank.alive, '부활'); assert.strictEqual(tank.hp, Math.round(tank.maxHp * 0.3));
    assert.strictEqual(count(events, 'revive'), 1); assert.ok(player.cooldowns.resurrect > battle.time);
    assert.ok(player.mp >= mp0 - 120 && player.mp < mp0 - 100, 'MP 는 시전 완료 때 소모(시전 중 회복분 포함) ' + player.mp);
    // 대상 자동 선택: 죽은 사람이 없으면 실패
    player.cooldowns.resurrect = 0; player.mp = player.maxMp;
    assert.strictEqual(battle.useSkill(player, 'resurrect').reason, 'no_target');
    // 전멸
    for (const e of members.concat(player)) battle.damage(null, e, 99999, { noEvade: true, noDef: true });
    assert.strictEqual(battle.result, 'wipe'); assert.strictEqual(count(events, 'wipe'), 1);
    assert.strictEqual(battle.useSkill(player, 'heal_basic').reason, 'ended');
  },

  '보스: AI 가 phase 능력(summon)을 써서 몬스터 수가 늘고, 소환 상한 6, summon 이벤트'(assert) {
    const ctx = boot();
    const S = setup(ctx, { level: 5, floor: 1, monsters: [{ id: 'boss_goblin_king', x: 13 * T, y: 10 * T }], seed: 21 });
    const { battle, events } = S;
    const boss = S.monsters[0], n0 = battle.monsters.length;
    sim(battle, 25, 0.1, healLoop(battle));
    const summons = events.filter((e) => e.name === 'summon');
    assert.ok(summons.length >= 1, '소환 ' + summons.length);
    assert.ok(battle.monsters.length > n0 && battle.monsters.length - n0 === summons.reduce((s, e) => s + e.p.count, 0));
    assert.ok(summons[0].p.monsterId === 'goblin' && summons[0].p.owner === boss.uid && summons[0].p.count === 3);
    const spawned = battle.monsters.filter((m) => m.summonedBy === boss.uid);
    assert.ok(spawned.every((m) => m.aggro && m.groupId === boss.groupId && m.floor === 1));
    assert.ok(events.some((e) => e.name === 'telegraph' && e.p.abilityId === 'aoe_medium'), '보스 광역기');
    // 상한: 쿨을 지우고 계속 불러도 살아 있는 부하는 6 이하
    for (let i = 0; i < 4; i++) { boss.cooldowns = {}; boss.cast = null; battle.castAbility(boss, 'summon_goblins'); sim(battle, 3.1, 0.1, healLoop(battle)); }
    assert.ok(battle.summonCount(boss) <= 6, '소환 상한 ' + battle.summonCount(boss));
    assert.ok(boss.phase && boss.phase.hpBelow === 1.0 || boss.hp < boss.maxHp, '페이즈 추적');
  },

  '전멸: 1레벨 파티가 5층 트롤 무리에 전원 사망 → result=wipe'(assert) {
    const ctx = boot();
    const trolls = Array.from({ length: 8 }, (_, i) => ({ id: 'troll', x: 14 * T + (i % 4) * 36, y: 9 * T + Math.floor(i / 4) * 36 }));
    const S = setup(ctx, { level: 1, floor: 5, monsters: trolls, seed: 4 });
    const { battle, events } = S;
    sim(battle, 150, 0.1, healLoop(battle));
    assert.strictEqual(battle.result, 'wipe');
    assert.ok(battle.party().every((e) => !e.alive)); assert.strictEqual(count(events, 'wipe'), 1);
    assert.ok(count(events, 'death') >= 5);
  },

  '시전: 플레이어가 움직이면 취소(cast_cancel), MP 부족/쿨타임/해금 전 거부, 도발은 위협 ×5 + 대상 전환'(assert) {
    const ctx = boot();
    const S = setup(ctx, { level: 3, monsters: [{ id: 'goblin', x: 11 * T, y: 10 * T }], ai: false, seed: 8 });
    const { battle, player, members, events } = S;
    const gob = S.monsters[0], tank = members[0], rogue = members[1];
    assert.ok(battle.useSkill(player, 'heal_basic', tank).ok);
    assert.strictEqual(player.state, 'cast');
    battle.moveTo(player, player.x + 50, player.y, 0.1);
    assert.strictEqual(player.cast, null); assert.strictEqual(count(events, 'cast_cancel'), 1);
    assert.strictEqual(events.find((e) => e.name === 'cast_cancel').p.reason, 'moved');
    assert.strictEqual(battle.useSkill(player, 'holy_light').reason, 'locked');
    player.mp = 5; assert.strictEqual(battle.useSkill(player, 'heal_basic', tank).reason, 'mp'); player.mp = player.maxMp;
    assert.strictEqual(battle.useSkill(player, 'nope').reason, 'no_skill');
    // 도발
    gob.threat = { [rogue.uid]: 100 }; gob.target = rogue.uid; gob.aggro = true;
    assert.ok(battle.useSkill(tank, 'taunt').ok);
    assert.strictEqual(gob.threat[tank.uid], 500); assert.strictEqual(gob.target, tank.uid);
    assert.strictEqual(battle.useSkill(tank, 'taunt').reason, 'cooldown');
    assert.strictEqual(battle.useSkill(rogue, 'taunt').reason, 'not_owner');
    // 피해 위협: 탱커 ×4(1~5층), 힐 ×0.5 분산
    gob.threat = {};
    battle.damage(rogue, gob, 20, { noEvade: true, noDef: true, noCrit: true });
    battle.damage(tank, gob, 20, { noEvade: true, noDef: true, noCrit: true });
    assert.ok(gob.alive, '고블린 생존(70HP)');
    assert.ok(gob.threat[tank.uid] / gob.threat[rogue.uid] > 3.5, '탱커 보정 ' + gob.threat[tank.uid] / gob.threat[rogue.uid]);
    tank.hp = 10; const healed = battle.heal(player, tank, 50);
    assert.strictEqual(healed, 50); assert.strictEqual(gob.threat[player.uid], 25);
  },

  '파티원 AI: 비전투 시 플레이어를 대형으로 따라가고, 교전 시 근딜은 탱커의 대상, 원딜은 150~220px 유지'(assert) {
    const ctx = boot();
    const S = setup(ctx, { level: 3, monsters: [], seed: 6, at: { x: 4 * T, y: 4 * T } });
    const { battle, player, members } = S;
    for (const m of members) { m.x = 30 * T; m.y = 30 * T; }
    player.dir = 'down';
    sim(battle, 10);
    for (const m of members) assert.ok(Math.hypot(m.x - player.x, m.y - player.y) < 110, `${m.name} 거리 ${Math.hypot(m.x - player.x, m.y - player.y)}`);
    const spot = ctx.AIParty.formationSpot(members[0], battle, player);
    assert.ok(spot.y > player.y, '탱커는 앞');
    // 교전: 큰 몬스터 하나(죽지 않게 HP 를 키움)
    const troll = ctx.Entities.fromMonster(ctx.Monsters.get('troll'), 1, 12 * T, 4 * T, battle.rng);
    troll.base.maxHp = 1e9; ctx.Entities.refresh(troll); troll.hp = troll.maxHp; troll.groupId = 'g';
    battle.addMonster(troll);
    const far = [];
    sim(battle, 12, 0.1, (t) => { if (t > 6) far.push(Math.hypot(members[2].x - troll.x, members[2].y - troll.y)); });
    const tank = members[0], rogue = members[1];
    assert.strictEqual(tank.target, troll.uid); assert.strictEqual(rogue.target, troll.uid);
    assert.ok(troll.threat[tank.uid] > 0 && troll.target === tank.uid, '탱커가 어그로');
    const inBand = far.filter((d) => d >= 120 && d <= 240).length / far.length;
    assert.ok(inBand > 0.8, '원딜 거리 유지 ' + inBand.toFixed(2));
    assert.ok(Math.hypot(rogue.x - troll.x, rogue.y - troll.y) < 80, '근딜 근접');
  },

  '몬스터 AI: 순찰은 home 반경 안, 발견 시 무리 전체 교전, 리쉬를 넘으면 복귀+회복, 텔레그래프 회피'(assert) {
    const ctx = boot();
    const pack = [{ id: 'wolf', x: 40 * T, y: 40 * T }, { id: 'wolf', x: 41 * T, y: 40 * T }, { id: 'goblin', x: 40 * T, y: 41 * T }];
    const S = setup(ctx, { level: 3, monsters: pack, seed: 13, at: { x: 10 * T, y: 10 * T } });
    const { battle, player, members } = S;
    // 파티가 멀리 있으면 순찰만: 플레이어를 근처로 옮겨 활성화시키되 어그로 범위(7타일) 밖에
    player.x = 30 * T; player.y = 40 * T; for (const m of members) { m.x = 29 * T; m.y = 40 * T; }
    sim(battle, 8);
    for (const m of S.monsters) { assert.ok(!m.aggro, '순찰 중'); assert.ok(Math.hypot(m.x - m.home.x, m.y - m.home.y) <= 3 * T + 2, '순찰 반경'); }
    // 한 마리 어그로 범위에 들어가면 무리 전체
    player.x = 34 * T; battle.update(0.1);
    assert.ok(S.monsters.every((m) => m.aggro), '무리 교전');
    // 리쉬: 파티를 30타일 밖으로 순간이동시키면 복귀하며 회복
    const wolf = S.monsters[0]; wolf.hp = 1;
    for (const e of members.concat(player)) { e.x = 80 * T; e.y = 80 * T; }
    wolf.x = wolf.home.x + 26 * T; wolf.y = wolf.home.y;
    player.x = wolf.x + 2 * T; player.y = wolf.y;          // 늑대를 활성 반경에 두기 위해
    battle.update(0.1);
    assert.ok(wolf.returning && !wolf.aggro && wolf.hp === wolf.maxHp, '리쉬 복귀+회복');
    // 회피: 텔레그래프 안의 파티원이 밖으로 나간다(숲 90%)
    const S2 = setup(ctx, { level: 3, monsters: [{ id: 'goblin_chief', x: 12 * T, y: 10 * T }], seed: 17, ai: true });
    const tank = S2.members[0]; const chief = S2.monsters[0];
    S2.battle.aiEnabled = false; S2.battle.update(0.1);
    S2.battle.castAbility(chief, 'aoe_small', tank);
    const tg = S2.battle.telegraphs[0];
    S2.battle.aiEnabled = true;
    let escaped = false;
    sim(S2.battle, 2.9, 0.1, () => { if (!S2.battle.inTelegraph(tg, tank)) escaped = true; });
    assert.ok(escaped, '회피');
  },

  '파티원 스킬: 마법사 화염구는 시전 중 정지, 사냥꾼 연속 사격 3명, 도적 기습은 치명타, 성스러운 일격은 언데드만'(assert) {
    const ctx = boot();
    const gobs = [0, 1, 2, 3].map((i) => ({ id: 'goblin', x: 12 * T + i * 30, y: 10 * T }));
    const S = setup(ctx, { level: 5, monsters: gobs, ai: false, seed: 19 });
    const { battle, player, members, events } = S;
    const [, rogue, hunter, mage] = members;
    for (const m of members) { m.x = 11 * T; m.y = 10 * T; }
    const tgt = S.monsters[0];
    tgt.base.maxHp = 1e6; ctx.Entities.refresh(tgt); tgt.hp = tgt.maxHp;   // 화염구 한 방에 죽지 않게
    assert.ok(battle.useSkill(mage, 'fireball', tgt).ok); assert.strictEqual(mage.state, 'cast'); assert.strictEqual(mage.cast.total, 1.5);
    sim(battle, 1.6);
    const fb = events.filter((e) => e.name === 'damage' && e.p.skillId === 'fireball');
    assert.strictEqual(fb.length, 1); assert.strictEqual(fb[0].p.type, 'magic');
    assert.ok(battle.useSkill(hunter, 'multishot', tgt).ok);
    assert.strictEqual(events.filter((e) => e.name === 'damage' && e.p.skillId === 'multishot').length, 3, '3명');
    assert.ok(battle.useSkill(rogue, 'backstab', tgt).ok);
    const bs = events.find((e) => e.name === 'damage' && e.p.skillId === 'backstab');
    assert.ok(bs && (bs.p.crit || bs.p.evaded), '기습 치명타');
    // smite: 언데드가 아니면 거부, 해골엔 통한다
    S.G.player.skillLevels.smite = 1;
    assert.strictEqual(battle.useSkill(player, 'smite', tgt).reason, 'no_target');
    const sk = ctx.Entities.fromMonster(ctx.Monsters.get('skeleton'), 1, 12 * T, 11 * T, battle.rng); battle.addMonster(sk);
    assert.ok(battle.useSkill(player, 'smite').ok, '자동 대상(언데드)'); sim(battle, 1.6);
    assert.ok(sk.hp < sk.maxHp, '일격 피해');
    // 버프: 탱커 우선, 60초 후 만료
    S.G.player.skillLevels.buff_def = 1;
    assert.ok(battle.useSkill(player, 'buff_def').ok); sim(battle, 1.1);
    const tank = members[0]; const d0 = ctx.Stats.derive(tank.src, S.G).def;
    assert.ok(tank.buffs.some((b) => b.id === 'buff_def' && b.stat === 'def'), '탱커에게'); assert.ok(Math.abs(tank.stats.def - d0 * 1.2) < 0.02, '방어 +20%');
    sim(battle, 60);
    assert.ok(!tank.buffs.length && tank.stats.def === d0, '버프 만료');
    // 치유의 성역: 바닥에 두면 초마다 반경 안 아군 회복
    S.G.player.skillLevels.aoe_ground = 1; tank.hp = 10;
    assert.ok(battle.useSkill(player, 'aoe_ground', { x: tank.x, y: tank.y }).ok); sim(battle, 1.6);
    assert.strictEqual(battle.groundHeals.length, 1); const h1 = tank.hp; sim(battle, 2.1);
    assert.ok(tank.hp > h1 && tank.hp > 10, '성역 회복'); sim(battle, 5); assert.strictEqual(battle.groundHeals.length, 0);
  },
};
