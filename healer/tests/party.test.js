const load = require('../tools/load');
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js', 'core/data_items.js', 'core/data_monsters.js',
  'core/state.js', 'core/stats.js', 'core/level.js', 'core/inventory.js', 'core/economy.js', 'core/party.js'];
const boot = () => load(FILES);
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

module.exports = {
  '이름 풀: 남녀 각 40명 이상, 전부 2~3글자 한국어, 중복 없음'(assert) {
    const { Party } = boot();
    for (const pool of [Party.MALE_NAMES, Party.FEMALE_NAMES]) {
      assert.ok(pool.length >= 40, `이름 ${pool.length}개`);
      assert.strictEqual(new Set(pool).size, pool.length, '중복 이름');
      for (const n of pool) assert.ok(/^[가-힣]{1,3}$/.test(n), n);
    }
    assert.ok(Party.PERSONALITIES.length >= 20);
  },

  'generateMember: 같은 시드면 같은 사람, 스탯은 Classes.statsAt, 고용비 100+level×40, 성격 한 줄'(assert) {
    const { Party, Classes, RNG } = boot();
    const a = Party.generateMember(RNG.make(5), 7), b = Party.generateMember(RNG.make(5), 7);
    const strip = (m) => ({ name: m.name, cls: m.cls, role: m.role, level: m.level, stats: m.stats, personality: m.personality, body: m.equipment.body.id, main: m.equipment.main.id });
    same(assert, strip(a), strip(b), '시드 결정성');
    assert.notStrictEqual(a.uid, b.uid, 'uid 는 고유');
    same(assert, a.stats, Classes.statsAt(a.cls, 7));
    assert.strictEqual(a.hireCost, 100 + 7 * 40);
    assert.ok(Party.PERSONALITIES.includes(a.personality));
    assert.ok(a.hp > 0 && a.mp >= 0, 'HP/MP 가 채워져 있다');
    assert.strictEqual(a.xp, 0);
    assert.ok(Classes.get(a.cls).roles.includes(a.role), '직업에 맞는 역할');
    const capped = Party.generateMember(RNG.make(1), 99);
    assert.strictEqual(capped.level, 40, '만렙 40 을 넘지 않는다');
    assert.strictEqual(Party.hireCost(1), 140);
  },

  'opts 로 직업·역할·이름·성별을 고정할 수 있다 (길드 고정 파티원용)'(assert) {
    const { Party, RNG } = boot();
    const m = Party.generateMember(RNG.make(9), 3, { cls: 'priest', name: '라온', gender: 'f', personality: '테스트' });
    assert.strictEqual(m.cls, 'priest'); assert.strictEqual(m.role, 'healer'); assert.strictEqual(m.name, '라온'); assert.strictEqual(m.personality, '테스트');
    const t = Party.generateMember(RNG.make(9), 3, { cls: 'warrior', role: 'melee' });
    assert.strictEqual(t.role, 'melee');
  },

  '역할: 전사/무투가는 탱커 약 60%, 마법사·사냥꾼 원딜, 도적·마검사 근딜, 사제 힐러'(assert) {
    const { Party, RNG } = boot();
    const rng = RNG.make(77);
    let tanks = 0; const N = 400;
    for (let i = 0; i < N; i++) if (Party.generateMember(rng, 1, { cls: i % 2 ? 'warrior' : 'monk' }).role === 'tank') tanks++;
    assert.ok(tanks / N > 0.5 && tanks / N < 0.7, `탱커 비율 ${tanks / N}`);
    const expect = { mage: 'ranged', hunter: 'ranged', rogue: 'melee', spellblade: 'melee', priest: 'healer' };
    for (const [cls, role] of Object.entries(expect)) assert.strictEqual(Party.generateMember(rng, 1, { cls }).role, role, cls);
  },

  '장비: 직업 재질 옷 + 직업 무기, 레벨이 높으면 2티어(동굴) 장비, 실제 Items 인스턴스'(assert) {
    const { Party, Classes, Items, RNG } = boot();
    const rng = RNG.make(3);
    for (const cls of Classes.list()) {
      const low = Party.generateMember(rng, 2, { cls }), high = Party.generateMember(rng, 15, { cls });
      const armor = Classes.get(cls).armor;
      assert.strictEqual(low.equipment.body.id, `${armor}_body_1`, cls);
      assert.strictEqual(high.equipment.body.id, `${armor}_body_2`, cls);
      for (const m of [low, high]) {
        const w = Items.get(m.equipment.main.id);
        assert.ok(w && w.slot === 'main' && Items.canUse(w, cls), `${cls} 무기 ${m.equipment.main.id}`);
        assert.ok(Items.canUse(Items.get(m.equipment.body.id), cls));
        assert.ok(m.equipment.main.maxDurability > 0 && Array.isArray(m.equipment.main.affixes), '진짜 itemInst');
      }
    }
    assert.strictEqual(Party.floorForLevel(1), 1); assert.strictEqual(Party.floorForLevel(12), 6); assert.strictEqual(Party.floorForLevel(40), 10);
  },

  'Items 가 없어도 memberInst 모양을 유지한다 (장비 id 만 가진 최소 인스턴스)'(assert) {
    const ctx = load(['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/party.js']);
    const m = ctx.Party.generateMember(ctx.RNG.make(2), 4, { cls: 'hunter' });
    assert.strictEqual(m.equipment.body.id, 'leather_body_1');
    assert.strictEqual(m.equipment.main.id, 'bow_short');
    assert.strictEqual(m.equipment.main.grade, 'common');
    assert.ok(m.hp > 0, 'Stats 없이도 임시 HP');
  },

  'members/roles/add/remove: 최대 4명, 중복 uid 거부, party_changed 이벤트'(assert) {
    const { Party, State, Events, RNG } = boot();
    const G = State.newGame('t'); const rng = RNG.make(1);
    const events = []; Events.on('party_changed', (p) => events.push(p.action));
    const made = [];
    for (let i = 0; i < 5; i++) { const m = Party.generateMember(rng, 1, { cls: ['warrior', 'mage', 'rogue', 'priest', 'monk'][i], role: i === 0 ? 'tank' : undefined }); made.push(m); }
    for (let i = 0; i < 4; i++) assert.ok(Party.add(G, made[i]));
    assert.ok(!Party.add(G, made[4]), '5번째는 거부');
    assert.ok(!Party.add(G, made[0]), '같은 uid 거부');
    assert.ok(Party.isFull(G));
    assert.strictEqual(Party.members(G).length, 4);
    same(assert, Party.roles(G), { tank: 1, melee: 1, ranged: 1, healer: 1 });
    assert.strictEqual(Party.remove(G, made[1].uid).uid, made[1].uid);
    assert.strictEqual(Party.remove(G, 'nope'), null);
    assert.strictEqual(Party.find(G, made[0].uid), made[0]);
    assert.ok(!Party.isFull(G));
    same(assert, events, ['add', 'add', 'add', 'add', 'remove']);
    assert.ok(/Lv\.1 전사\(탱커\)/.test(Party.describe(made[0])));
  },

  'heal: 파티원·플레이어 HP/MP 전부 회복 + 저주 제거 ; gainXp: 전원 Level.addXp'(assert) {
    const { Party, State, Stats, Level, RNG } = boot();
    const G = State.newGame('t'); const rng = RNG.make(4);
    for (let i = 0; i < 3; i++) Party.add(G, Party.generateMember(rng, 2));
    for (const m of G.party) { m.hp = 1; m.mp = 0; m.curses = [{ id: 'dot', until: 99 }]; }
    G.player.hp = 3; G.player.curses = [{ id: 'root', until: 99 }];
    Party.heal(G);
    for (const m of G.party) { const d = Stats.derive(m, G); assert.strictEqual(m.hp, d.maxHp); assert.strictEqual(m.mp, d.maxMp); assert.strictEqual(m.curses.length, 0); }
    assert.strictEqual(G.player.hp, Stats.derive(G.player, G).maxHp); assert.strictEqual(G.player.curses.length, 0);
    const res = Party.gainXp(G, Level.xpForLevel(3) + 5);
    assert.strictEqual(res.length, 3);
    for (const m of G.party) { assert.strictEqual(m.level, 3, '2→3 레벨업'); assert.strictEqual(m.xp, 5, '초과분 이월'); }
    same(assert, G.party[0].stats, require('../js/core/data_classes.js').statsAt(G.party[0].cls, 3), '성장이 statsAt 과 일치');
  },
};
