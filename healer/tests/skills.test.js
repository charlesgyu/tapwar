const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js'];

// DESIGN.md §3.2 표 그대로: [id, type, 시전, MP, 쿨, 해금]
const TABLE = [
  ['heal_basic', 'single_heal', 2.0, 20, 0, 1], ['cleanse', 'cleanse', 0.5, 25, 2, 1], ['buff_def', 'buff', 1.0, 30, 8, 2],
  ['aoe_2', 'aoe_heal', 2.5, 45, 0, 3], ['heal_fast', 'single_heal', 1.0, 30, 0, 4], ['buff_atk', 'buff', 1.0, 30, 8, 5],
  ['aoe_ground', 'ground_heal', 1.5, 60, 12, 6], ['smite', 'smite', 1.5, 25, 0, 7], ['resurrect', 'resurrect', 5.0, 120, 60, 8],
  ['heal_instant', 'single_heal', 0, 40, 3, 9], ['holy_light', 'ultimate', 0, 50, 300, 10], ['buff_aspd', 'buff', 1.0, 30, 8, 12],
  ['aoe_3', 'aoe_heal', 3.0, 65, 0, 14], ['buff_spd', 'buff', 1.0, 30, 8, 16], ['buff_eva', 'buff', 1.0, 30, 8, 18],
  ['buff_mana', 'buff', 1.0, 30, 8, 20],
];

module.exports = {
  '사제 16개 스킬이 표의 id·type·시전·MP·쿨·해금 그대로다'(assert) {
    const { Skills } = load(FILES);
    const list = Skills.priest();
    assert.strictEqual(list.length, 16);
    TABLE.forEach(([id, type, cast, mp, cd, unlock], i) => {
      const s = list[i];
      assert.strictEqual(s.id, id, `순서 ${i}`);
      assert.strictEqual(s.type, type, id);
      assert.strictEqual(s.castTime, cast, `${id} 시전`);
      assert.strictEqual(s.mpCost, mp, `${id} MP`);
      assert.strictEqual(s.cooldown, cd, `${id} 쿨`);
      assert.strictEqual(s.unlockLevel, unlock, `${id} 해금`);
      assert.strictEqual(s.owner, 'priest');
      assert.strictEqual(s.maxLevel, 10);
      assert.ok(s.name && /[가-힣]/.test(s.name) && s.desc.length > 5, `${id} 한국어 이름/설명`);
      assert.strictEqual(typeof s.upgradeCost, 'function');
      assert.strictEqual(Skills.get(id), s);
    });
    assert.strictEqual(Skills.get('nope'), null);
  },

  '힐량 공식: (base + int×intScale)×(1+0.08×(lv-1)), 빠른/즉시힐은 기본힐과 동일, 광역은 70%'(assert) {
    const { Skills } = load(FILES);
    const caster = { stats: { int: 14 } };
    const basic = Skills.get('heal_basic');
    same(assert, basic.power, { base: 60, intScale: 1.6 });
    assert.strictEqual(Skills.healAmount(basic, caster, 1), 82);            // 60 + 22.4
    assert.strictEqual(Skills.healAmount(basic, caster, 10), 142);          // 82.4 × 1.72
    assert.strictEqual(Skills.healAmount(Skills.get('heal_fast'), caster, 1), 82);
    assert.strictEqual(Skills.healAmount(Skills.get('heal_instant'), caster, 1), 82);
    assert.strictEqual(Skills.healAmount(Skills.get('aoe_2'), caster, 1), Math.round(82.4 * 0.7));
    assert.strictEqual(Skills.healAmount(Skills.get('aoe_3'), caster, 1), Math.round(82.4 * 0.7));
    // 바닥힐: 반경 2.5타일, 6초, 매초 단일의 25%
    const g = Skills.get('aoe_ground');
    assert.strictEqual(g.radius, 80); assert.strictEqual(g.duration, 6); assert.strictEqual(g.tick, 1);
    assert.strictEqual(Skills.healAmount(g, caster, 1), Math.round(82.4 * 0.25));
    // 지능이 없는 시전자/빈 정의는 0
    assert.strictEqual(Skills.healAmount(basic, null, 1), 60);
    assert.strictEqual(Skills.healAmount(null, caster, 1), 0);
  },

  '파생 스탯(healPower)이 있으면 접사·피로가 반영된 값을 우선 쓴다'(assert) {
    const { Skills } = load(FILES);
    const basic = Skills.get('heal_basic');
    // healPower 44.8 = int 28 상당 → 60 + 44.8 = 104.8
    assert.strictEqual(Skills.healAmount(basic, { stats: { int: 14, healPower: 44.8 } }, 1), 105);
    // 전투 엔티티가 아닌 G.player(1차 스탯만)도 그대로 동작
    assert.strictEqual(Skills.healAmount(basic, { stats: { int: 20 } }, 1), 92);
    // smite 는 matk 우선
    assert.strictEqual(Skills.damageAmount(Skills.get('smite'), { stats: { matk: 32 } }, 1), 80); // 50 + 20×1.5
    assert.ok(!Skills.canTarget(Skills.get('smite'), { tags: ['beast'] }));
    assert.ok(Skills.canTarget(Skills.get('smite'), { tags: ['undead'] }));
    assert.ok(Skills.canTarget(basic, { tags: [] }));
  },

  '필살기 전원 80%, 부활 30%, 버프 60초 +20%(마나 -25%)'(assert) {
    const { Skills } = load(FILES);
    const tank = { maxHp: 1000 };
    assert.strictEqual(Skills.healAmount(Skills.get('holy_light'), null, 1, tank), 800);
    assert.strictEqual(Skills.healAmount(Skills.get('holy_light'), null, 1), 0.8);
    assert.strictEqual(Skills.healAmount(Skills.get('resurrect'), null, 1, { stats: { maxHp: 500 } }), 150);
    assert.ok(Skills.pctAt(Skills.get('holy_light'), 10) <= 1 && Skills.pctAt(Skills.get('holy_light'), 10) > 0.8);
    assert.strictEqual(Skills.get('holy_light').targets, 'all');
    const buffs = { buff_def: 'def', buff_atk: 'atk', buff_aspd: 'aspd', buff_spd: 'spd', buff_eva: 'eva', buff_mana: 'mana' };
    for (const [id, stat] of Object.entries(buffs)) {
      const s = Skills.get(id);
      assert.strictEqual(s.duration, 60, id);
      assert.strictEqual(s.buff.stat, stat, id);
      assert.strictEqual(s.buff.value, stat === 'mana' ? -0.25 : 0.2, id);
      assert.ok(Skills.isBuff(s));
      assert.ok(Object.keys(Skills.BUFF_STATS).includes(stat));
    }
    assert.ok(Math.abs(Skills.buffValue(Skills.get('buff_def'), 1) - 0.2) < 1e-9);
    assert.ok(Skills.buffValue(Skills.get('buff_def'), 10) > 0.2);
    assert.ok(Skills.buffValue(Skills.get('buff_mana'), 10) < -0.25);
    assert.ok(Skills.isHeal(Skills.get('aoe_ground')) && !Skills.isHeal(Skills.get('cleanse')));
  },

  '스킬 강화 비용 150×lv×lv, 만렙이면 null'(assert) {
    const { Skills } = load(FILES);
    assert.strictEqual(Skills.upgradeCost('heal_basic', 1), 150);
    assert.strictEqual(Skills.upgradeCost('heal_basic', 3), 1350);
    assert.strictEqual(Skills.upgradeCost('heal_basic', 9), 12150);
    assert.strictEqual(Skills.upgradeCost('heal_basic', 10), null);
    assert.strictEqual(Skills.get('aoe_3').upgradeCost(2), 600);
    assert.strictEqual(Skills.upgradeCost('nope', 1), null);
    assert.strictEqual(Skills.upgradeCost('taunt', 1), null, '파티원 스킬은 강화 없음');
  },

  '파티원 스킬: 직업별 구성, 도발 위협×5 쿨12, mult 1.5~2.5, 쿨 6~15'(assert) {
    const { Skills } = load(FILES);
    same(assert, Skills.member('warrior').map((s) => s.id), ['taunt', 'cleave']);
    same(assert, Skills.member('monk').map((s) => s.id), ['taunt', 'flurry']);
    same(assert, Skills.member('mage').map((s) => s.id), ['fireball', 'blizzard']);
    same(assert, Skills.member('hunter').map((s) => s.id), ['multishot']);
    same(assert, Skills.member('rogue').map((s) => s.id), ['backstab']);
    same(assert, Skills.member('spellblade').map((s) => s.id), ['blade_rush']);
    assert.strictEqual(Skills.member('priest').length, 16, '사제 파티원은 사제 스킬');
    same(assert, Skills.member('nope'), []);
    const taunt = Skills.get('taunt');
    assert.strictEqual(taunt.type, 'taunt'); assert.strictEqual(taunt.threatMult, 5); assert.strictEqual(taunt.cooldown, 12);
    for (const cls of ['warrior', 'monk', 'mage', 'hunter', 'rogue', 'spellblade']) {
      for (const s of Skills.member(cls)) {
        if (s.type === 'taunt') continue;
        assert.strictEqual(s.type, 'attack', s.id);
        assert.ok(s.power.mult >= 1.5 && s.power.mult <= 2.5, `${s.id} mult ${s.power.mult}`);
        assert.ok(s.cooldown >= 6 && s.cooldown <= 15, `${s.id} 쿨 ${s.cooldown}`);
        assert.ok(s.name && s.desc);
      }
    }
    assert.strictEqual(Skills.get('blizzard').targets, 'aoe');
    assert.strictEqual(Skills.get('multishot').targets, 3);
    assert.ok(Skills.get('backstab').crit);
  },

  'castTime/mpCost 헬퍼는 시전자의 castSpeed·mpCostMult 를 반영한다'(assert) {
    const { Skills } = load(FILES);
    const basic = Skills.get('heal_basic');
    assert.strictEqual(Skills.castTime(basic, null), 2);
    assert.strictEqual(Skills.castTime(basic, { stats: { castSpeed: 0.8 } }), 1.6);
    assert.strictEqual(Skills.mpCost(basic, { stats: { mpCostMult: 0.75 } }), 15);
    assert.strictEqual(Skills.mpCost(basic, {}), 20);
    assert.strictEqual(Skills.list().length, 16 + 8);
  },
};
