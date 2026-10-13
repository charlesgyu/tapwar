const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js', 'core/state.js', 'core/stats.js', 'core/level.js'];
const near = (assert, a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} expected ${b} got ${a}`);

// Items 모듈은 다른 담당이 만드는 중이라 테스트에서 최소 스텁을 주입한다
const ITEM_DEFS = {
  robe_rare: { id: 'robe_rare', slot: 'body', baseStats: { def: 6, int: 4 }, setId: 'forest_leaf' },
  boots_leaf: { id: 'boots_leaf', slot: 'boots', baseStats: { def: 2, agi: 2 }, setId: 'forest_leaf' },
  staff_two: { id: 'staff_two', slot: 'main', hands: 'two', baseStats: { int: 10 } },
  sword: { id: 'sword', slot: 'main', baseStats: { str: 5 } },
};
function stubItems(ctx) {
  ctx.Items = {
    get: (id) => ITEM_DEFS[id] || null,
    GRADES: { common: { mult: 1.0 }, uncommon: { mult: 1.25 }, rare: { mult: 1.6 }, legendary: { mult: 2.2 } },
    setBonus: (setId, count) => {
      const out = [];
      if (count >= 2) out.push({ pieces: 2, type: 'stat_pct', stat: 'int', value: 10 });
      if (count >= 3) out.push({ pieces: 3, type: 'proc', proc: 'free_mana', chance: 0.1 });
      return out;
    },
  };
}
const inst = (id, grade, extra = {}) => Object.assign({ uid: id + grade, id, grade, affixes: [], durability: 100, maxDurability: 100, qty: 1 }, extra);

module.exports = {
  '기본 공식: 1레벨 사제 maxHp 154 / maxMp 161 / healPower 22.4 / 이동 194.56'(assert) {
    const { State, Stats } = load(FILES);
    const G = State.newGame('리프');
    const d = Stats.derive(G.player, G);
    assert.strictEqual(d.maxHp, 154);          // 50 + 8×12 + 8
    assert.strictEqual(d.maxMp, 161);          // 30 + 14×9 + 5
    near(assert, d.healPower, 22.4); near(assert, d.matk, 22.4);
    near(assert, d.atk, 11);                   // 4×2 + 6×0.5
    assert.strictEqual(d.def, 5);
    near(assert, d.evasion, 2.4); near(assert, d.moveSpeed, 194.56);
    near(assert, d.mpRegen, 1.7); assert.strictEqual(d.castSpeed, 1); assert.strictEqual(d.mpCostMult, 1);
    assert.strictEqual(d.fatigueMult, 1); assert.strictEqual(d.healTakenMult, 1); assert.strictEqual(d.rooted, false);
    assert.strictEqual(G.player.hp, 154, 'State.newGame 이 Stats 로 현재 HP 를 채움');
    // 장비/스탯이 없는 대상도 깨지지 않는다
    const m = Stats.derive({ level: 3 });
    assert.strictEqual(m.maxHp, 50 + 24); assert.strictEqual(m.maxMp, 30 + 15);
  },

  '장비: 기본 스탯×등급 배수, 접사(퍼센트/평탄), 내구도 0 이면 절반'(assert) {
    const ctx = load(FILES); stubItems(ctx);
    const { State, Stats } = ctx;
    const G = State.newGame('리프');
    G.player.equipment.body = inst('robe_rare', 'rare', { affixes: [{ stat: 'cast_speed', value: 10 }, { stat: 'mp_regen', value: 2 }, { stat: 'heal_power', value: 25 }] });
    G.player.equipment.main = inst('staff_two', 'legendary');
    const d = Stats.derive(G.player, G);
    near(assert, d.def, 5 + 6 * 1.6);                          // 14.6
    near(assert, d.int, 14 + 4 * 1.6 + 10 * 2.2);              // 42.4
    assert.strictEqual(d.maxMp, Math.round(30 + 42.4 * 9 + 5));
    near(assert, d.castSpeed, 1 / 1.1, 'cast_speed 10%', 1e-2);
    near(assert, d.mpRegen, 1 + 42.4 * 0.05 + 2, 'mp_regen 평탄', 1e-2);
    near(assert, d.healPower, 42.4 * 1.6 * 1.25, 'heal_power +25%', 1e-2);
    near(assert, d.matk, 42.4 * 1.6, 'matk 는 heal_power 영향 없음', 1e-2);
    // 내구도 0 → 그 장비 효과 절반
    G.player.equipment.main.durability = 0;
    const d2 = Stats.derive(G.player, G);
    near(assert, d2.int, 14 + 4 * 1.6 + 10 * 2.2 * 0.5);
    // 등급 배수는 Items.GRADES 가 없으면 내장 표를 쓴다
    delete ctx.Items.GRADES;
    near(assert, Stats.derive(G.player, G).def, 5 + 6 * 1.6);
    assert.strictEqual(Stats.gradeMult('legendary'), 2.2);
  },

  '세트: Inventory.activeSets 우선, 없으면 장비에서 직접 세고 proc 은 procs 로 전달'(assert) {
    const ctx = load(FILES); stubItems(ctx);
    const { State, Stats } = ctx;
    const G = State.newGame('리프');
    G.player.equipment.body = inst('robe_rare', 'common');
    G.player.equipment.boots = inst('boots_leaf', 'common');
    // Inventory 없음 → 장비에서 forest_leaf 2개 → int +10%
    let d = Stats.derive(G.player, G);
    near(assert, d.int, (14 + 4) * 1.1);
    same(assert, d.procs, []);
    // Inventory.activeSets 가 있으면(플레이어) 그 결과를 쓴다 — 3셋으로 보고
    ctx.Inventory = { activeSets: () => [{ setId: 'forest_leaf', count: 3, bonuses: ctx.Items.setBonus('forest_leaf', 3) }] };
    d = Stats.derive(G.player, G);
    near(assert, d.int, (14 + 4) * 1.1);
    assert.strictEqual(d.procs.length, 1); assert.strictEqual(d.procs[0].proc, 'free_mana'); assert.strictEqual(d.procs[0].setId, 'forest_leaf');
    // 파티원은 G.player 가 아니므로 Inventory 를 거치지 않고 자기 장비로 센다
    const member = { uid: 'm1', cls: 'mage', level: 1, stats: { str: 2, def: 3, agi: 6, sta: 5, int: 17, vit: 6 }, equipment: { body: inst('robe_rare', 'common'), main: null } };
    near(assert, Stats.derive(member, G).int, 17 + 4);
  },

  '버프/저주: 배수 적용, 속박은 이동 0, 치유 저해 0.5, 만료된 버프는 now 로 걸러짐, 중복 호출에도 배수가 겹치지 않음'(assert) {
    const ctx = load(FILES); const { State, Stats } = ctx;
    const G = State.newGame('리프');
    const ent = { src: G.player, buffs: [{ id: 'buff_def', stat: 'def', value: 0.2, until: 100 }, { id: 'buff_eva', stat: 'eva', value: 0.2, until: 100 }, { id: 'buff_mana', stat: 'mana', value: -0.25, until: 50 }],
      curses: [{ id: 'spd_down', until: 100 }, { id: 'heal_down', until: 100 }] };
    let d = Stats.derive(ent, G, 10);
    near(assert, d.def, 5 * 1.2); near(assert, d.evasion, 2.4 + 20); near(assert, d.mpCostMult, 0.75);
    near(assert, d.moveSpeed, 194.56 * 0.6, '', 1e-2); assert.strictEqual(d.healTakenMult, 0.5);
    // 마나 버프는 50 에 끝남
    d = Stats.derive(ent, G, 60);
    assert.strictEqual(d.mpCostMult, 1); near(assert, d.def, 6);
    // now 를 안 주면 Combat 이 정리했다고 보고 전부 적용
    assert.strictEqual(Stats.derive(ent, G).mpCostMult, 0.75);
    // 속박·공격 약화
    ent.curses = [{ id: 'root' }, { id: 'atk_down' }, { id: 'unknown_curse' }];
    d = Stats.derive(ent, G);
    assert.strictEqual(d.moveSpeed, 0); assert.strictEqual(d.rooted, true); near(assert, d.atk, 11 * 0.7); near(assert, d.matk, 22.4 * 0.7);
    // 몬스터 기본 수치에 applyStatus 만 — 두 번 적용해도 같은 결과
    const base = { maxHp: 500, atk: 40, def: 10, moveSpeed: 90, atkSpeed: 1 };
    const once = Stats.applyStatus(base, { buffs: [{ stat: 'atk', value: 0.5 }], curses: [{ id: 'aspd_down' }] });
    const twice = Stats.applyStatus(base, { buffs: [{ stat: 'atk', value: 0.5 }], curses: [{ id: 'aspd_down' }] });
    assert.strictEqual(once.atk, 60); assert.strictEqual(once.atkSpeed, 0.7); assert.strictEqual(once.maxHp, 500);
    same(assert, once, twice);
    assert.strictEqual(base.atk, 40, '원본은 바뀌지 않음');
    assert.strictEqual(Stats.curseName('root'), '속박');
  },

  '피로: fatigueMult = 1 - fatigue/200 이 공격·힐·마나회복에만 걸리고 최대 HP 는 그대로'(assert) {
    const { State, Stats } = load(FILES);
    const G = State.newGame('리프');
    const before = Stats.derive(G.player, G);
    G.player.fatigue = 50;
    const d = Stats.derive(G.player, G);
    assert.strictEqual(d.fatigueMult, 0.75);
    near(assert, d.healPower, before.healPower * 0.75, '', 1e-2); near(assert, d.atk, before.atk * 0.75, '', 1e-2); near(assert, d.mpRegen, before.mpRegen * 0.75, '', 1e-2);
    assert.strictEqual(d.maxHp, before.maxHp); assert.strictEqual(d.maxMp, before.maxMp); assert.strictEqual(d.def, before.def);
    G.player.fatigue = 999;
    assert.strictEqual(Stats.derive(G.player, G).fatigueMult, 0.5, '피로는 100 에서 멈춤');
    // 각인은 접사와 같은 형식, special 은 specials 로 전달
    G.player.fatigue = 0;
    G.player.engravings = [{ id: 'eng_int', stat: 'int', value: 3 }, { id: 'eng_cast', stat: 'cast_speed', value: 5 }, { id: 'eng_luck', special: 'double_heal' }];
    const e = Stats.derive(G.player, G);
    assert.strictEqual(e.int, 17); near(assert, e.castSpeed, 1 / 1.05, '', 1e-2); same(assert, e.specials, ['double_heal']);
  },

  'Level.xpForLevel: 2레벨 100, 단조 증가, 만렙 40 이후 Infinity'(assert) {
    const { Level } = load(FILES);
    assert.strictEqual(Level.xpForLevel(1), 0);
    assert.strictEqual(Level.xpForLevel(2), 100);
    let prevDiff = Level.xpForLevel(2) - Level.xpForLevel(1);
    for (let l = 3; l <= 40; l++) {
      const a = Level.xpForLevel(l - 1), b = Level.xpForLevel(l);
      assert.ok(b > a, `${l}`);
      assert.ok(b - a >= prevDiff && b - a - prevDiff <= 30, `증가폭이 완만하게(2차) 커져야 함 ${l}`);
      prevDiff = b - a;
    }
    assert.strictEqual(Level.xpForLevel(41), Infinity);
    assert.ok(Level.xpForLevel(40) > 15000 && Level.xpForLevel(40) < 40000);
    assert.ok(Level.totalXpTo(40) > 200000 && Level.totalXpTo(40) < 500000);
    assert.strictEqual(Level.MAX, 40);
  },

  'Level.addXp: 여러 레벨 한 번에, 포인트 +5/레벨, HP/MP 전부 회복, 성장 반영, level_up 이벤트 1회'(assert) {
    const { State, Level, Events, Classes } = load(FILES);
    const G = State.newGame('리프');
    G.player.hp = 1; G.player.mp = 1;
    const got = [];
    Events.on('level_up', (p) => got.push(p));
    const r = Level.addXp(G.player, 100 + 224 + 50, G);    // 1→3, 50 이월
    assert.strictEqual(r.levelsGained, 2); assert.strictEqual(G.player.level, 3); assert.strictEqual(G.player.xp, 50);
    assert.strictEqual(G.player.statPoints, 10);
    assert.strictEqual(got.length, 1); assert.strictEqual(got[0].levelsGained, 2); assert.strictEqual(got[0].isPlayer, true);
    same(assert, got[0].newSkills, ['buff_def', 'aoe_2']);
    same(assert, r.newSkills, ['buff_def', 'aoe_2']);
    same(assert, G.player.stats, Classes.statsAt('priest', 3), '성장이 1차 스탯에 더해짐');
    assert.strictEqual(G.player.skillLevels.buff_def, 1); assert.strictEqual(G.player.skillLevels.aoe_2, 1);
    assert.ok(G.player.hp > 1 && G.player.mp > 1, '레벨업 시 전부 회복');
    // 레벨업 없이 쌓이기만 하면 이벤트 없음
    assert.strictEqual(Level.addXp(G.player, 10, G).levelsGained, 0);
    assert.strictEqual(got.length, 1); assert.strictEqual(G.player.xp, 60);
    assert.strictEqual(Level.addXp(G.player, 0, G).levelsGained, 0);
    // 파티원: 포인트 없음, 성장만
    const m = { uid: 'm1', name: '바위', cls: 'warrior', role: 'tank', level: 1, xp: 0, stats: Classes.statsAt('warrior', 1), equipment: { body: null, main: null } };
    const mr = Level.addXp(m, 100, G);
    assert.strictEqual(mr.levelsGained, 1); assert.strictEqual(m.level, 2); assert.strictEqual(m.statPoints, undefined);
    same(assert, m.stats, Classes.statsAt('warrior', 2));
    assert.strictEqual(got[1].isPlayer, false); assert.strictEqual(got[1].uid, 'm1');
    // 만렙 넘기지 않음
    Level.addXp(G.player, 10000000, G);
    assert.strictEqual(G.player.level, 40); assert.strictEqual(G.player.xp, 0);
    assert.strictEqual(Level.addXp(G.player, 500, G).levelsGained, 0); assert.strictEqual(G.player.xp, 0);
    assert.strictEqual(Level.progress(G.player).max, true);
  },

  'Level.allocate / unlockedSkills / skillLevel / progress'(assert) {
    const { State, Level } = load(FILES);
    const G = State.newGame('리프');
    same(assert, Level.allocate(G, 'int', 1), { ok: false, reason: 'not_enough_points' });
    G.player.statPoints = 5;
    same(assert, Level.allocate(G, 'luck', 1), { ok: false, reason: 'bad_stat' });
    same(assert, Level.allocate(G, 'int', 0), { ok: false, reason: 'bad_count' });
    same(assert, Level.allocate(G, 'int', 3), { ok: true });
    assert.strictEqual(G.player.stats.int, 17); assert.strictEqual(G.player.statPoints, 2);
    same(assert, Level.allocate(G, 'vit', 3), { ok: false, reason: 'not_enough_points' });
    same(assert, Level.unlockedSkills(1), ['heal_basic', 'cleanse']);
    same(assert, Level.unlockedSkills(5), ['heal_basic', 'cleanse', 'buff_def', 'aoe_2', 'heal_fast', 'buff_atk']);
    assert.strictEqual(Level.unlockedSkills(40).length, 16);
    same(assert, Level.newlyUnlocked(9, 10), ['holy_light']);
    assert.strictEqual(Level.skillLevel(G, 'heal_basic'), 1);
    assert.strictEqual(Level.skillLevel(G, 'holy_light'), 0, '해금 전');
    G.player.skillLevels.heal_basic = 4;
    assert.strictEqual(Level.skillLevel(G, 'heal_basic'), 4);
    const p = Level.progress({ level: 1, xp: 25 });
    same(assert, p, { level: 1, xp: 25, need: 100, pct: 0.25, max: false });
  },
};
