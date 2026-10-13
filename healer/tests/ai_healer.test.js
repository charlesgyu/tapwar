const load = require('../tools/load');
// 실제 모듈 전부 로드(Combat/Entities/Skills/Level/Inventory/Items/Monsters). decide 검증은 ai:false 로 파티/몬스터 AI 를 끄고 직접 부른다.
const boot = () => load('all');
const EMPTY_MAP = { cols: 100, rows: 100, solid: (i, j) => i < 0 || j < 0 || i >= 100 || j >= 100 };
const T = 32;
const MEMBERS = [['warrior', 'tank', '바위'], ['rogue', 'melee', '그림자'], ['hunter', 'ranged', '매'], ['mage', 'ranged', '불꽃']];

function memberInst(ctx, [cls, role, name], level, i) {
  return { uid: 'm' + i, name, cls, role, level, xp: 0, stats: ctx.Classes.statsAt(cls, level), equipment: { body: null, main: null }, hireCost: 0, personality: '' };
}
// spread: 파티원 간격(px). 80 이상이면 성역 반경(2.5타일) 안에 3명이 모이지 않는다.
function setup(ctx, { level = 1, floor = 1, monsters = [], seed = 7, members = MEMBERS, ai = false, driveHealer, spread = 40, at = { x: 10 * T, y: 10 * T } } = {}) {
  const G = ctx.State.newGame('리프');
  G.player.level = level;
  G.party = members.map((m, i) => memberInst(ctx, m, level, i));
  const rng = ctx.RNG.make(seed);
  const player = ctx.Entities.fromPlayer(G); player.x = at.x; player.y = at.y;
  player.hp = player.maxHp; player.mp = player.maxMp;   // newGame 의 hp 는 1레벨 기준이라 레벨을 올리면 다친 채로 시작하므로 채운다
  const mems = G.party.map((m, i) => { const e = ctx.Entities.fromMember(G, m); e.x = at.x + spread * (i + 1); e.y = at.y + (i % 2) * 30; return e; });
  const mons = monsters.map(({ id, x, y, aggro }) => { const e = ctx.Entities.fromMonster(ctx.Monsters.get(id), floor, x, y, rng); e.groupId = 'g1'; if (aggro) e.aggro = true; return e; });
  const events = [];
  ctx.Events.on('*', (p, name) => events.push({ name, p }));
  const battle = ctx.Combat.create({ map: EMPTY_MAP, player, members: mems, monsters: mons, rng, G, floor, ai, driveHealer });
  return { G, battle, player, members: mems, monsters: mons, events, rng };
}
const setHp = (e, pct) => { e.hp = Math.round(e.maxHp * pct); return e; };
const setMp = (e, pct) => { e.mp = Math.round(e.maxMp * pct); return e; };
const sim = (battle, seconds, dt = 0.1, each) => { for (let t = 0; t < seconds - 1e-9; t += dt) { battle.update(dt); if (each) each(t); } };
const count = (events, name) => events.filter((e) => e.name === name).length;
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 배열은 프로토타입이 달라 JSON 으로 비교

module.exports = {
  '(1) 2명 다침(50%, 75%) → 가장 HP 낮은 사람에게 단일힐(1레벨은 기본힐)'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 1 });
    setHp(members[2], 0.75); setHp(members[1], 0.5);
    const d = AIHealer.decide(player, battle, G);
    assert.ok(d, '결정 있음'); assert.strictEqual(d.skillId, 'heal_basic'); assert.strictEqual(d.target, members[1]);
    // 전원 80% 이상이면 아무것도 안 한다(비전투)
    setHp(members[1], 0.85); setHp(members[2], 0.9);
    assert.strictEqual(AIHealer.decide(player, battle, G), null);
  },

  '(2) HP 30% → 즉시힐로 승격, 즉시힐 쿨이면 빠른 힐; 60~80% 는 플레이어가 고른 active.single'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 9 });
    setHp(members[0], 0.3);
    let d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'heal_instant'); assert.strictEqual(d.target, members[0]);
    player.cooldowns.heal_instant = battle.time + 3;
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'heal_fast', '즉시힐 쿨 → 빠른 힐');
    // 35~60% 는 빠른 힐(기본힐이 active 여도)
    setHp(members[0], 0.5);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_fast');
    // 60~80% 는 active.single 그대로(기본힐), 플레이어가 빠른 힐을 골랐으면 빠른 힐
    setHp(members[0], 0.7);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_basic');
    G.player.active.single = 'heal_fast';
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_fast');
  },

  '(3) 3명 70% 이하(흩어짐) → 광역힐: aoe_3 해금이면 3명, 아니면 aoe_2; 대상은 HP 낮은 순 N 명'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const S = setup(ctx, { level: 14, spread: 120 });
    const { battle, player, members, G } = S;
    setHp(members[0], 0.65); setHp(members[1], 0.4); setHp(members[2], 0.55);
    let d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'aoe_3');
    same(assert, d.target.map((e) => e.uid), ['m1', 'm2', 'm0'], 'HP 낮은 순 3명');
    // aoe_3 전(3~13레벨)에는 aoe_2 로 가장 낮은 2명
    const S2 = setup(ctx, { level: 5, spread: 120 });
    setHp(S2.members[0], 0.65); setHp(S2.members[1], 0.4); setHp(S2.members[2], 0.55);
    d = AIHealer.decide(S2.player, S2.battle, S2.G);
    assert.strictEqual(d.skillId, 'aoe_2'); same(assert, d.target.map((e) => e.uid), ['m1', 'm2']);
    // 2명만 70% 미만이어도 광역(둘 다 긴급이 아닐 때)
    const S3 = setup(ctx, { level: 5, spread: 120 });
    setHp(S3.members[0], 0.6); setHp(S3.members[3], 0.5);
    d = AIHealer.decide(S3.player, S3.battle, S3.G);
    assert.strictEqual(d.skillId, 'aoe_2'); same(assert, d.target.map((e) => e.uid), ['m3', 'm0']);
    // 누군가 긴급(<35%)이면 광역보다 단일힐이 먼저
    setHp(S3.members[3], 0.2);
    d = AIHealer.decide(S3.player, S3.battle, S3.G);
    assert.strictEqual(d.skillId, 'heal_fast'); assert.strictEqual(d.target, S3.members[3]);
  },

  '(3b) 모여 있으면(무게중심 2.5타일 안 3명, 다친 2명) 성역을 무게중심에 깐다'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 6, spread: 30 });
    setHp(members[0], 0.6); setHp(members[1], 0.5);
    const d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'aoe_ground');
    const all = battle.allies();
    const cx = all.reduce((s, e) => s + e.x, 0) / all.length, cy = all.reduce((s, e) => s + e.y, 0) / all.length;
    assert.ok(Math.abs(d.x - cx) < 1e-6 && Math.abs(d.y - cy) < 1e-6, '무게중심');
    assert.ok(battle.useSkill(player, d.skillId, { x: d.x, y: d.y }).ok);
    sim(battle, 1.6);
    assert.strictEqual(battle.groundHeals.length, 1);
    // 성역이 쿨이면 광역힐로
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'aoe_2');
  },

  '(4) 저주 2명(둘 다 70% 미만) 중 HP 낮은 사람에게 저주 해제, 힐보다 먼저'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 5 });
    setHp(members[0], 0.6); setHp(members[2], 0.4);
    battle.applyCurse(members[0], 'def_down', 10); battle.applyCurse(members[2], 'atk_down', 10);
    const d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'cleanse'); assert.strictEqual(d.target, members[2]);
    // 급하지 않은 저주는 누군가 긴급(<35%)이면 힐이 먼저
    setHp(members[2], 0.3);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_fast');
    // 저주 걸린 사람이 멀쩡(HP 90%)하고 힐 대상이 따로 있으면 힐이 먼저
    setHp(members[2], 0.9); setHp(members[0], 0.9); setHp(members[1], 0.7);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_basic');
    // 힐 대상이 아무도 없으면 그제야 해제
    setHp(members[1], 1);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'cleanse');
  },

  '(5) root/heal_down/dot 저주는 HP 가 높아도, 다른 사람이 다쳤어도 즉시 해제'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 5 });
    setHp(members[1], 0.65); setHp(members[0], 0.95);
    battle.applyCurse(members[0], 'root', 10);
    let d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'cleanse'); assert.strictEqual(d.target, members[0]);
    battle.cleanse(members[0]);
    battle.applyCurse(members[3], 'heal_down', 10);
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'cleanse'); assert.strictEqual(d.target, members[3]);
    // 해제가 쿨이면 꼬이지 않고 다음 순위(힐)로
    player.cooldowns.cleanse = battle.time + 2;
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'heal_basic'); assert.strictEqual(d.target, members[1]);
  },

  '(6) 마나 관리: MP 15% 는 기본힐만(즉시힐·광역·일격·버프 금지), MP 25% 는 단일힐을 항상 기본힐로'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const skel = { id: 'skeleton', x: 14 * T, y: 10 * T, aggro: true };
    const { battle, player, members, G } = setup(ctx, { level: 20, monsters: [skel] });
    setMp(player, 0.15);
    setHp(members[0], 0.3);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_basic', '긴급해도 기본힐');
    setHp(members[0], 1);
    assert.strictEqual(AIHealer.decide(player, battle, G), null, '언데드 교전 중이지만 일격·버프 금지');
    setHp(members[0], 0.5); setHp(members[1], 0.5); setHp(members[2], 0.5);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_basic', '광역 대신 기본힐');
    setMp(player, 0.25);
    setHp(members[1], 1); setHp(members[2], 1);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_basic', 'MP<30% 는 빠른 힐 대신 기본힐');
    setHp(members[0], 1);
    assert.strictEqual(AIHealer.decide(player, battle, G), null, 'MP<50% 면 버프·일격 없음');
    setMp(player, 1);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'smite');
  },

  '(7) 죽은 탱커 + 안전(아무도 30% 미만 아님) → 부활, 역할 순서 탱커 > 딜러; 위험하면 힐이 먼저'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 8 });
    battle.damage(null, members[2], 99999, { noEvade: true, noDef: true });   // 원딜 먼저 죽고
    battle.damage(null, members[0], 99999, { noEvade: true, noDef: true });   // 탱커도 죽음
    setHp(members[1], 0.5);
    let d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'resurrect'); assert.strictEqual(d.target, members[0], '탱커 먼저');
    assert.strictEqual(AIHealer.pickTarget(ctx.Skills.get('resurrect'), player, battle), members[0]);
    setHp(members[1], 0.25);
    d = AIHealer.decide(player, battle, G);
    assert.notStrictEqual(d.skillId, 'resurrect'); assert.strictEqual(d.target, members[1], '위험하면 힐');
    // 부활 쿨이면 부활 건너뛰고 힐
    setHp(members[1], 0.5); player.cooldowns.resurrect = battle.time + 60;
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_fast');
  },

  '(8) 파티 평균 HP 40% (전투 중) → 필살기; 비전투면 아낀다; 3명 이상 40% 미만도 필살기'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const gob = { id: 'goblin', x: 14 * T, y: 10 * T, aggro: true };
    const { battle, player, members, G } = setup(ctx, { level: 10, monsters: [gob] });
    for (const e of battle.allies()) setHp(e, 0.4);
    let d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'holy_light');
    assert.ok(battle.useSkill(player, d.skillId, d.target).ok);
    assert.ok(battle.allies().every((e) => e.hp / e.maxHp >= 0.8), '전원 80% 이상');
    assert.ok(player.cooldowns.holy_light > battle.time);
    // 비전투
    const S2 = setup(ctx, { level: 10 });
    for (const e of S2.battle.allies()) setHp(e, 0.4);
    assert.notStrictEqual(AIHealer.decide(S2.player, S2.battle, S2.G).skillId, 'holy_light');
    // 평균은 높아도 3명이 40% 미만
    const S3 = setup(ctx, { level: 10, monsters: [gob] });
    setHp(S3.members[0], 0.35); setHp(S3.members[1], 0.35); setHp(S3.members[2], 0.35);
    assert.strictEqual(AIHealer.decide(S3.player, S3.battle, S3.G).skillId, 'holy_light');
  },

  '(9) 언데드 교전 중 + 아무도 안 다침 → 가장 가까운 언데드에게 일격; 언데드가 아니면 안 씀'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const mons = [{ id: 'skeleton', x: 16 * T, y: 10 * T, aggro: true }, { id: 'zombie', x: 13 * T, y: 10 * T, aggro: true }, { id: 'goblin', x: 12 * T, y: 10 * T, aggro: true }];
    const { battle, player, members, monsters, G } = setup(ctx, { level: 7, monsters: mons });
    const d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'smite'); assert.strictEqual(d.target, monsters[1], '가장 가까운 언데드(좀비)');
    assert.ok(battle.useSkill(player, 'smite').ok, '대상 자동 선택');
    assert.strictEqual(battle.player.cast.target, monsters[1].uid);
    // 다친 사람이 있으면 힐이 먼저
    player.cast = null; setHp(members[0], 0.7);
    assert.strictEqual(AIHealer.decide(player, battle, G).skillId, 'heal_basic');
    // 언데드 없음 → 일격 안 함
    const S2 = setup(ctx, { level: 7, monsters: [{ id: 'goblin', x: 12 * T, y: 10 * T, aggro: true }] });
    const d2 = AIHealer.decide(S2.player, S2.battle, S2.G);
    assert.ok(!d2 || d2.skillId !== 'smite');
  },

  '(10) 시전 중이면 decide 는 null, update 도 스킬을 요청하지 않는다'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 5 });
    setHp(members[0], 0.5);
    assert.ok(battle.useSkill(player, 'heal_basic', members[0]).ok);
    assert.ok(player.cast);
    assert.strictEqual(AIHealer.decide(player, battle, G), null);
    let calls = 0; const orig = battle.useSkill; battle.useSkill = (...a) => { calls++; return orig(...a); };
    AIHealer.update(player, battle, G, 0.1);
    assert.strictEqual(calls, 0);
    // 자동힐 꺼짐 → 아무것도 안 함
    player.cast = null; G.player.settings.autoHeal = false;
    AIHealer.update(player, battle, G, 0.1);
    assert.strictEqual(calls, 0); assert.strictEqual(player.cast, null);
  },

  '(11) 버프 유지: 전투 중 MP 여유 → 탱커 수호 > 딜러 용맹 > 질풍 …, 가장 오래 비어 있던 것부터, 곧 끝나는 버프도 갱신'(assert) {
    const ctx = boot(); const { AIHealer, Skills } = ctx;
    const gob = { id: 'goblin', x: 14 * T, y: 10 * T, aggro: true };
    const { battle, player, members, G } = setup(ctx, { level: 20, monsters: [gob] });
    const tank = members[0];
    let d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'buff_def'); assert.strictEqual(d.target, tank);
    battle.addBuff(tank, { id: 'buff_def', stat: 'def', value: 0.2, until: battle.time + 60 });
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'buff_atk'); assert.ok(d.target.role === 'melee' || d.target.role === 'ranged');
    assert.strictEqual(AIHealer.pickTarget(Skills.get('buff_atk'), player, battle).role, 'melee', '딜러 중 근딜 먼저');
    for (const m of members.slice(1)) battle.addBuff(m, { id: 'buff_atk', stat: 'atk', value: 0.2, until: battle.time + 60 });
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'buff_aspd'); assert.strictEqual(d.target, tank, '전원 버프는 탱커부터');
    assert.strictEqual(AIHealer.pickTarget(Skills.get('buff_mana'), player, battle), player, '샘의 축복은 자신');
    // 가장 오래 비어 있던 버프: 탱커의 수호가 10초 전에 끝났고 질풍은 방금 본 적이 없다면(0초부터 빔) 질풍이 먼저,
    // 둘 다 같은 시각부터 비었으면 수호(정적 순서)가 먼저
    battle.time = 1; AIHealer.update(player, battle, G, 0.1);   // update 가 "마지막으로 본 시각"을 기록(수호: 탱커 1.0)
    battle.cancelCast(player, 'test'); player.healerAI.failed = {};
    tank.buffs = tank.buffs.filter((b) => b.id !== 'buff_def'); ctx.Entities.refresh(tank, G, battle.time);
    battle.time = 2;
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'buff_aspd', '0초부터 비어 있던 질풍이 1초에 끝난 수호보다 먼저');
    // 곧 끝나는(5초 미만) 버프는 갱신 대상
    for (const e of battle.allies()) e.buffs = []; 
    for (const e of battle.allies()) for (const id of ['buff_aspd', 'buff_spd', 'buff_eva', 'buff_atk']) battle.addBuff(e, { id, stat: 'spd', value: 0.2, until: battle.time + 60 });
    battle.addBuff(tank, { id: 'buff_def', stat: 'def', value: 0.2, until: battle.time + 3 });
    battle.addBuff(player, { id: 'buff_mana', stat: 'mana', value: -0.25, until: battle.time + 60 });
    d = AIHealer.decide(player, battle, G);
    assert.strictEqual(d.skillId, 'buff_def'); assert.strictEqual(d.target, tank);
    // 비전투면 버프 안 함
    battle.monsters[0].aggro = false;
    assert.strictEqual(AIHealer.decide(player, battle, G), null);
  },

  '(12) dodge: 텔레그래프 안이면 밖의 가장 가까운 안전 지점, 밖이면 null; autoDodge 면 update 가 이동시키고 시전을 끊는다'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, monsters, G } = setup(ctx, { level: 5, monsters: [{ id: 'goblin_chief', x: 12 * T, y: 10 * T }] });
    assert.strictEqual(AIHealer.dodge(player, battle), null);
    assert.ok(battle.castAbility(monsters[0], 'aoe_small', player).ok);
    const tg = battle.telegraphs[0];
    assert.ok(battle.inTelegraph(tg, player));
    const p = AIHealer.dodge(player, battle);
    assert.ok(p && typeof p.x === 'number' && typeof p.y === 'number');
    assert.ok(!battle.inTelegraph(tg, { x: p.x, y: p.y, radius: player.radius }), '텔레그래프 밖');
    assert.ok(Math.hypot(p.x - player.x, p.y - player.y) <= tg.r + player.radius + 16 + 1, '가까운 지점');
    assert.ok(battle.canStand(p.x, p.y, player.radius));
    // autoDodge: 시전 중이어도 밖으로 나간다(이동 → 시전 취소)
    setHp(members[0], 0.5);
    assert.ok(battle.useSkill(player, 'heal_basic', members[0]).ok);
    G.player.settings.autoDodge = true;
    for (let i = 0; i < 30 && battle.inTelegraph(tg, player); i++) { battle.time += 0.05; AIHealer.update(player, battle, G, 0.05); }
    assert.ok(!battle.inTelegraph(tg, player), '빠져나옴');
    assert.ok(!player.cast || player.cast.t === 0, '시전 취소');
    // 밖으로 나온 뒤엔 다시 힐을 요청한다
    battle.time += 0.05; AIHealer.update(player, battle, G, 0.05);
    assert.ok(player.cast && ctx.Skills.get(player.cast.skillId).type === 'single_heal', '다시 힐 ' + (player.cast && player.cast.skillId));
    // 장판은 발동 뒤(active)에도 위험
    battle.telegraphs.length = 0;
    battle.telegraphs.push({ id: 'p1', type: 'puddle', x: player.x, y: player.y, r: 64, t: 3, windup: 3, fill: 1, owner: 'x', resolved: true, active: true, age: 0, acc: 0, cursed: {}, dps: 1, duration: 5 });
    assert.ok(AIHealer.dodge(player, battle));
    battle.telegraphs[0].done = true; battle.telegraphs[0].active = false;
    assert.strictEqual(AIHealer.dodge(player, battle), null, '꺼진 장판은 무시');
  },

  '꼬이지 않음: 한 틱에 스킬 요청 1회, 거부된 스킬은 0.5초 재시도 금지, 같은 틱에 두 번 불려도 한 번만'(assert) {
    const ctx = boot(); const { AIHealer } = ctx;
    const { battle, player, members, G } = setup(ctx, { level: 1 });
    setHp(members[0], 0.5);
    const calls = [];
    battle.useSkill = (c, id) => { calls.push({ t: battle.time, id }); return { ok: false, reason: 'no_target' }; };
    for (let i = 0; i < 10; i++) { battle.time += 0.1; AIHealer.update(player, battle, G, 0.1); AIHealer.update(player, battle, G, 0.1); }
    // t=0.1 거부 → 0.6 까지 금지 → 0.6 재시도 → 1.1 … : 1.0초 동안 2회
    assert.strictEqual(calls.length, 2, JSON.stringify(calls));
    assert.ok(calls[1].t - calls[0].t >= AIHealer.RETRY_DELAY - 1e-9);
    // 실패한 스킬은 건너뛰고 다음 순위로(기본힐 거부 중 저주가 생기면 해제를 요청)
    battle.applyCurse(members[1], 'dot', 10);
    battle.time += 0.1; AIHealer.update(player, battle, G, 0.1);
    assert.strictEqual(calls[calls.length - 1].id, 'cleanse');
    // 성공하면 한 틱에 하나만: update 를 여러 번 불러도 틱이 바뀌기 전엔 추가 요청 없음
    const S2 = setup(ctx, { level: 20 });
    setHp(S2.members[0], 0.5); setHp(S2.members[1], 0.5);
    let n = 0; const orig = S2.battle.useSkill; S2.battle.useSkill = (...a) => { n++; return orig(...a); };
    S2.battle.time = 1;
    AIHealer.update(S2.player, S2.battle, S2.G, 0.1); AIHealer.update(S2.player, S2.battle, S2.G, 0.1);
    assert.strictEqual(n, 1);
  },

  'Combat 통합: 대상 없이 광역힐을 쓰면 HP 낮은 순 N 명이 정확히 회복된다(무작위 아님)'(assert) {
    const ctx = boot();
    const { battle, player, members, events } = setup(ctx, { level: 14, spread: 120 });
    setHp(members[0], 0.9); setHp(members[1], 0.5); setHp(members[2], 0.6); setHp(members[3], 0.95);
    assert.ok(battle.useSkill(player, 'aoe_2').ok);
    same(assert, player.cast.targets, ['m1', 'm2']);
    sim(battle, 2.6);
    const healed = events.filter((e) => e.name === 'heal' && e.p.skillId === 'aoe_2').map((e) => e.p.dstUid).sort();
    same(assert, healed, ['m1', 'm2']);
    // 시전 중 대상이 죽으면 남은 사람 + 보충
    setHp(members[1], 0.5); setHp(members[2], 0.6); setHp(members[0], 0.7);
    assert.ok(battle.useSkill(player, 'aoe_3').ok);
    battle.damage(null, members[1], 99999, { noEvade: true, noDef: true });
    sim(battle, 3.1);
    const healed2 = events.filter((e) => e.name === 'heal' && e.p.skillId === 'aoe_3').map((e) => e.p.dstUid).sort();
    same(assert, healed2, ['m0', 'm2', 'm3']);
  },

  'pickTarget: 단일힐은 HP 최저, 해제는 저주 걸린 사람 중 최저, 바닥힐은 무게중심(벽이면 아픈 사람 발밑), 필살기는 자신'(assert) {
    const ctx = boot(); const { AIHealer, Skills } = ctx;
    const { battle, player, members } = setup(ctx, { level: 20 });
    setHp(members[3], 0.4); setHp(members[1], 0.6);
    assert.strictEqual(AIHealer.pickTarget(Skills.get('heal_basic'), player, battle), members[3]);
    battle.applyCurse(members[1], 'spd_down', 10); battle.applyCurse(members[0], 'def_down', 10);
    assert.strictEqual(AIHealer.pickTarget(Skills.get('cleanse'), player, battle), members[1]);
    const g = AIHealer.pickTarget(Skills.get('aoe_ground'), player, battle);
    assert.ok(g && typeof g.x === 'number' && !g.uid);
    battle.canStand = () => false;
    const g2 = AIHealer.pickTarget(Skills.get('aoe_ground'), player, battle);
    assert.strictEqual(g2.x, members[3].x); assert.strictEqual(g2.y, members[3].y);
    assert.strictEqual(AIHealer.pickTarget(Skills.get('holy_light'), player, battle), player);
    assert.strictEqual(AIHealer.pickTarget(Skills.get('resurrect'), player, battle), null, '죽은 사람 없음');
    assert.strictEqual(AIHealer.pickTarget(Skills.get('smite'), player, battle), null, '언데드 없음');
  },

  '벨트 MP 포션: MP<20% 면 update 가 벨트의 마나 포션을 마신다(Combat 벨트 쿨 공유)'(assert) {
    const ctx = boot(); const { AIHealer, Inventory, Items } = ctx;
    const { battle, player, G } = setup(ctx, { level: 1 });
    G.player.belt = ['mp_potion_s'];
    assert.ok(Inventory.add(G, Items.make('mp_potion_s', 2)));
    setMp(player, 0.1); const mp0 = player.mp;
    battle.time = 0.1; AIHealer.update(player, battle, G, 0.1);
    assert.ok(player.mp > mp0, '마셨다'); assert.strictEqual(Inventory.count(G, 'mp_potion_s'), 1);
    assert.ok(battle.beltCooldowns.mp_potion_s > battle.time);
    setMp(player, 0.1);
    battle.time = 0.2; AIHealer.update(player, battle, G, 0.1);
    assert.strictEqual(Inventory.count(G, 'mp_potion_s'), 1, '쿨 중엔 안 마심');
  },

  '통합 시뮬 60초: Combat 이 AI 를 구동하면 힐러가 버프·해제·힐을 하고, 시전이 겹치지 않으며, 파티가 이긴다'(assert) {
    const ctx = boot();
    // 빠른 템포의 큰 무리(30마리): 예전 10마리 무리는 이제 몇 초 만에 녹아 힐러가 할 일이 없다
    const base = ['zombie', 'zombie', 'zombie', 'skeleton', 'skeleton', 'goblin', 'goblin', 'wolf', 'wolf', 'orc'];
    const ids = base.concat(base, base);
    const mons = ids.map((id, i) => ({ id, x: 15 * T + (i % 6) * 36, y: 8 * T + Math.floor(i / 6) * 36 }));
    const { battle, player, events, G } = setup(ctx, { level: 2, monsters: mons, ai: true, seed: 11 });
    sim(battle, 60);
    const mine = events.filter((e) => (e.name === 'cast_start' || e.name === 'cast_done' || e.name === 'cast_cancel') && e.p.uid === player.uid);
    const started = mine.filter((e) => e.name === 'cast_start').map((e) => e.p.skillId);
    assert.ok(started.length >= 5, '힐러 시전 ' + JSON.stringify(started));
    assert.ok(started.includes('heal_basic') && started.includes('cleanse'), '힐과 해제 ' + JSON.stringify(started));
    assert.ok(!battle.monsters.some((m) => m.alive), '몬스터 전멸');
    let open = false;
    for (const e of mine) {
      if (e.name === 'cast_start') { assert.ok(!open, '시전이 겹침'); if (e.p.total > 0) open = true; }
      else open = false;
    }
    assert.ok(events.some((e) => e.name === 'heal' && e.p.srcUid === player.uid), '플레이어 힐');
    assert.strictEqual(battle.result, null);
    assert.ok(battle.allies().length >= 3, '생존 ' + battle.allies().length);
    assert.ok(G.counters.heals > 0);
  },
};
