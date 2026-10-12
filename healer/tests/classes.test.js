const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js', 'core/state.js'];
const PRIMARY = ['str', 'def', 'agi', 'sta', 'int', 'vit'];
const sum = (o) => PRIMARY.reduce((s, k) => s + o[k], 0);

module.exports = {
  '7직업이 계약 순서대로 있고 필수 필드를 모두 가진다'(assert) {
    const { Classes } = load(FILES);
    same(assert, Classes.list(), ['warrior', 'mage', 'hunter', 'rogue', 'spellblade', 'priest', 'monk']);
    assert.strictEqual(Classes.list().length, 7);
    for (const id of Classes.list()) {
      const c = Classes.get(id);
      assert.strictEqual(c.id, id);
      assert.ok(c.name && /[가-힣]/.test(c.name), `${id} 한국어 이름`);
      assert.ok(['plate', 'leather', 'chain', 'cloth'].includes(c.armor));
      for (const k of PRIMARY) { assert.ok(c.baseStats[k] > 0, `${id}.baseStats.${k}`); assert.ok(c.growth[k] >= 0, `${id}.growth.${k}`); }
      assert.ok(Array.isArray(c.primary) && c.primary.length >= 1);
      assert.ok(['melee', 'ranged', 'magic'].includes(c.atkType));
      assert.ok(c.range > 0 && c.atkInterval > 0);
      assert.ok(c.skills.length >= 1);
    }
    assert.strictEqual(Classes.get('nope'), null);
  },

  '역할 규칙: 전사/무투가 탱커·근딜, 마법사/사냥꾼 원딜, 도적/마검사 근딜, 사제 힐러'(assert) {
    const { Classes } = load(FILES);
    same(assert, Classes.get('warrior').roles, ['tank', 'melee']);
    same(assert, Classes.get('monk').roles, ['tank', 'melee']);
    same(assert, Classes.get('mage').roles, ['ranged']);
    same(assert, Classes.get('hunter').roles, ['ranged']);
    same(assert, Classes.get('rogue').roles, ['melee']);
    same(assert, Classes.get('spellblade').roles, ['melee']);
    same(assert, Classes.get('priest').roles, ['healer']);
    // 재질: 전사·무투가 판금, 사냥꾼·도적 가죽, 마검사 사슬, 마법사·사제 천
    assert.strictEqual(Classes.get('warrior').armor, 'plate');
    assert.strictEqual(Classes.get('rogue').armor, 'leather');
    assert.strictEqual(Classes.get('spellblade').armor, 'chain');
    assert.strictEqual(Classes.get('priest').armor, 'cloth');
    assert.ok(Classes.canWear('priest', 'cloth') && !Classes.canWear('priest', 'plate'));
  },

  'pickRole 은 rng 에 결정적이고 단일 역할 직업은 항상 그 역할'(assert) {
    const { Classes, RNG } = load(FILES);
    for (const id of ['mage', 'hunter']) assert.strictEqual(Classes.pickRole(id, RNG.make(1)), 'ranged');
    for (const id of ['rogue', 'spellblade']) assert.strictEqual(Classes.pickRole(id, RNG.make(1)), 'melee');
    assert.strictEqual(Classes.pickRole('priest', RNG.make(1)), 'healer');
    const seen = new Set();
    for (let s = 0; s < 50; s++) seen.add(Classes.pickRole('warrior', RNG.make(s)));
    same(assert, [...seen].sort(), ['melee', 'tank']);
    assert.strictEqual(Classes.pickRole('monk', RNG.make(7)), Classes.pickRole('monk', RNG.make(7)));
    assert.strictEqual(Classes.pickRole('nope', RNG.make(1)), null);
  },

  '사제 기본 스탯은 State.newGame 의 초기 스탯과 같다'(assert) {
    const { Classes, State } = load(FILES);
    const G = State.newGame('테스트');
    same(assert, Classes.get('priest').baseStats, G.player.stats);
    same(assert, Classes.statsAt('priest', 1), G.player.stats);
  },

  'statsAt/growthDelta: 레벨에 따라 커지고 증가분을 누적해도 statsAt 과 일치'(assert) {
    const { Classes } = load(FILES);
    for (const id of Classes.list()) {
      const c = Classes.get(id);
      assert.ok(sum(c.baseStats) >= 38 && sum(c.baseStats) <= 46, `${id} 기본 합 ${sum(c.baseStats)}`);
      const g = sum(c.growth);
      if (id === 'priest') assert.ok(g >= 3.5 && g <= 5.5, '사제 성장은 투자 포인트가 있어 완만');
      else assert.ok(g >= 5 && g <= 7.5, `${id} 성장 합 ${g}`);
      const s1 = Classes.statsAt(id, 1), s40 = Classes.statsAt(id, 40);
      same(assert, s1, c.baseStats);
      assert.ok(sum(s40) > sum(s1) + 150, `${id} 40레벨 합 ${sum(s40)}`);
      // 1→5→12→40 을 세 번 나눠 더해도 statsAt(40) 과 같아야 한다
      const acc = { ...s1 };
      for (const [a, b] of [[1, 5], [5, 12], [12, 40]]) { const d = Classes.growthDelta(id, a, b); for (const k of PRIMARY) acc[k] += d[k]; }
      same(assert, acc, s40);
      for (const k of PRIMARY) assert.ok(Number.isInteger(s40[k]), '정수 스탯');
    }
    assert.strictEqual(Classes.statsAt('nope', 3), null);
  },

  '직업의 주 스탯은 성장이 가장 크고, 스킬 id 는 Skills 에 존재한다'(assert) {
    const { Classes, Skills } = load(FILES);
    for (const id of Classes.list()) {
      const c = Classes.get(id);
      const top = PRIMARY.slice().sort((a, b) => c.growth[b] - c.growth[a])[0];
      assert.strictEqual(top, c.primary[0], `${id} 주 스탯 ${c.primary[0]} 성장이 최대여야 함(최대: ${top})`);
      for (const sk of c.skills) {
        const def = Skills.get(sk);
        assert.ok(def, `${id} 스킬 ${sk} 정의 없음`);
        const owners = def.owners || [def.owner];
        assert.ok(owners.includes(id), `${sk} 는 ${id} 소유가 아님`);
      }
      same(assert, Skills.member(id).map((s) => s.id), c.skills, `${id} 스킬 목록 순서`);
    }
    assert.strictEqual(Classes.roleName('tank'), '탱커');
    assert.strictEqual(Classes.armorName('cloth'), '천');
  },
};
