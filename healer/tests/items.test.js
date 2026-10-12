const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 객체는 프로토타입이 달라 JSON 으로 비교
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_items.js', 'core/state.js', 'core/stats.js'];
const boot = () => load(FILES);

module.exports = {
  '템플릿 분량: 장비 ≥ 60(슬롯×재질 전부), 세트 3종×5부위, 소모품/재료/레시피/히든 두루마리, id 중복 없음, 아이콘 1글자'(assert) {
    const { Items } = boot();
    const eq = Items.equipment();
    assert.ok(eq.length >= 60, `장비 ${eq.length}`);
    for (const armor of ['cloth', 'leather', 'chain', 'plate']) for (const slot of Items.ARMOR_SLOTS) {
      assert.ok(eq.some((d) => d.armor === armor && d.slot === slot), `${armor}/${slot} 없음`);
    }
    assert.ok(eq.some((d) => d.slot === 'main' && d.hands === 'two' && d.weapon === 'staff'), '양손 지팡이');
    assert.ok(eq.some((d) => d.slot === 'main' && d.hands === 'main' && d.weapon === 'staff'), '한손 지팡이');
    assert.ok(eq.some((d) => d.slot === 'off' && d.weapon === 'book'), '책');
    for (const slot of ['neck', 'ring', 'ear']) assert.ok(eq.filter((d) => d.slot === slot).length >= 3, slot);
    assert.strictEqual(eq.filter((d) => d.slot === 'bag').length, 3);
    for (const setId of ['novice_cloth', 'forest_leaf', 'cave_crystal']) {
      const pieces = eq.filter((d) => d.setId === setId);
      assert.strictEqual(pieces.length, 5, setId);
      same(assert, pieces.map((d) => d.slot).sort(), [...Items.ARMOR_SLOTS].sort());
      assert.ok(pieces.every((d) => d.armor === 'cloth'), '세트는 천');
      same(assert, Items.SETS[setId].pieces.slice().sort(), pieces.map((d) => d.id).sort());
    }
    const cons = Items.consumables().map((d) => d.id);
    for (const id of ['hp_potion_s', 'hp_potion_m', 'hp_potion_l', 'mp_potion_s', 'mp_potion_m', 'mp_potion_l', 'antidote', 'scroll_return', 'auction_reset_ticket']) assert.ok(cons.includes(id), id);
    assert.ok(cons.filter((id) => id.startsWith('food_')).length >= 3, '음식 3');
    assert.ok(Items.materials().length >= 8);
    assert.ok(Items.recipes().length >= 10);
    for (let f = 1; f <= 10; f++) { const s = Items.get(`scroll_hidden_f${f}`); assert.ok(s && s.kind === 'quest', `scroll_hidden_f${f}`); }
    const ids = Items.list();
    assert.strictEqual(new Set(ids).size, ids.length, 'id 중복');
    for (const d of Items.all()) {
      assert.strictEqual(Array.from(d.icon).length, 1, `${d.id} 아이콘 ${d.icon}`);
      assert.ok(d.name && d.desc && typeof d.price === 'number', d.id);
      assert.ok(['equip', 'consume', 'material', 'misc', 'quest'].includes(d.kind), d.id);
      if (d.kind === 'equip') assert.ok(Items.SLOTS.includes(d.slot), `${d.id} slot ${d.slot}`);
    }
  },

  '등급 확률: 1층 60/30/9/1, 10층 30/40/25/5, 6층은 그 사이'(assert) {
    const { Items, RNG } = boot();
    const rng = RNG.make(123);
    const sample = (floor) => {
      const n = 6000, c = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
      for (let i = 0; i < n; i++) c[Items.generate({ floor, rng, slot: 'body', armor: 'cloth' }).grade]++;
      for (const k of Object.keys(c)) c[k] = c[k] / n * 100;
      return c;
    };
    const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(1)} vs ${b}`);
    const f1 = sample(1);
    near(f1.common, 60, 3, '1층 common'); near(f1.uncommon, 30, 3, '1층 uncommon'); near(f1.rare, 9, 2, '1층 rare'); near(f1.legendary, 1, 0.8, '1층 legendary');
    const f10 = sample(10);
    near(f10.common, 30, 3, '10층 common'); near(f10.uncommon, 40, 3, '10층 uncommon'); near(f10.rare, 25, 3, '10층 rare'); near(f10.legendary, 5, 1.5, '10층 legendary');
    const w6 = Object.fromEntries(Items.gradeWeights(6).map((w) => [w.id, w.weight]));
    assert.ok(w6.common < 60 && w6.common > 30 && w6.legendary > 1 && w6.legendary < 5, '6층은 보간');
    same(assert, Items.gradeWeights(3).map((w) => w.weight), [60, 30, 9, 1]);
    // gradeMin 이 있는 템플릿은 그 아래 등급으로 안 나온다
    for (let i = 0; i < 200; i++) assert.ok(Items.gradeIndex(Items.generate({ id: 'staff_dragon_two', floor: 1, rng }).grade) >= Items.gradeIndex('rare'));
  },

  '접사: 일반/고급 0개, 레어 1~2개, 전설 2~3개, 풀 안의 stat 만, 중복 없음, 층이 높을수록 값이 큼'(assert) {
    const { Items, RNG } = boot();
    const rng = RNG.make(99);
    const pool = new Set(Items.affixPool.map((a) => a.stat));
    const countRange = { common: [0, 0], uncommon: [0, 0], rare: [1, 2], legendary: [2, 3] };
    for (const grade of Object.keys(countRange)) {
      for (let i = 0; i < 100; i++) {
        const it = Items.generate({ grade, floor: 5, rng, slot: 'body' });
        assert.strictEqual(it.grade, grade);
        const [lo, hi] = countRange[grade];
        assert.ok(it.affixes.length >= lo && it.affixes.length <= hi, `${grade} 접사 ${it.affixes.length}`);
        const stats = it.affixes.map((a) => a.stat);
        assert.strictEqual(new Set(stats).size, stats.length, '접사 중복');
        for (const a of it.affixes) { assert.ok(pool.has(a.stat), a.stat); assert.ok(a.value > 0); }
      }
    }
    const avg = (floor) => { let s = 0, n = 0; for (let i = 0; i < 300; i++) for (const a of Items.generate({ grade: 'rare', floor, rng, slot: 'hat' }).affixes) if (a.stat === 'heal_power') { s += a.value; n++; } return s / n; };
    assert.ok(avg(10) > avg(1), '10층 접사 값이 더 큼');
    assert.strictEqual(Items.affixText({ stat: 'cast_speed', value: 8 }), '시전 속도 +8%');
    assert.strictEqual(Items.affixText({ stat: 'mp_cost', value: 6 }), '마나 소비 -6%');
    assert.strictEqual(Items.affixText({ stat: 'int', value: 3 }), '지능 +3');
  },

  'generate 필터: slot/hands/setId/priestOnly/floor, id 지정, 소모품은 qty, 같은 시드면 같은 결과'(assert) {
    const { Items, RNG } = boot();
    const rng = RNG.make(5);
    for (let i = 0; i < 50; i++) {
      const a = Items.generate({ slot: 'main', hands: 'two', priestOnly: true, rng, floor: 1 });
      assert.ok(Items.get(a.id).weapon === 'staff' && Items.get(a.id).hands === 'two', a.id);
      const b = Items.generate({ slot: 'ring', rng, floor: 7 });
      assert.strictEqual(Items.get(b.id).slot, 'ring');
      const c = Items.generate({ slot: 'body', priestOnly: true, rng, floor: 3 });
      assert.strictEqual(Items.get(c.id).armor, 'cloth', '사제는 천만');
      const d = Items.generate({ floor: 9, rng, priestOnly: true });
      assert.ok(Items.canUse(Items.get(d.id), 'priest'), d.id);
      const e = Items.generate({ floor: 2, rng });
      const ed = Items.get(e.id); assert.ok(ed.floorMin <= 2 && ed.floorMax >= 2, `${e.id} 는 2층 드랍 아님`);
    }
    const s = Items.generate({ slot: 'hat', setId: 'cave_crystal', grade: 'rare', rng });
    assert.strictEqual(s.id, 'cave_crystal_hat'); assert.strictEqual(s.grade, 'rare');
    assert.ok(s.durability === 100 && s.maxDurability === 100 && s.qty === 1 && s.uid);
    const p = Items.generate({ id: 'hp_potion_m', qty: 5, grade: 'legendary', rng });
    assert.strictEqual(p.qty, 5); assert.strictEqual(p.grade, 'common'); same(assert, p.affixes, []);
    assert.strictEqual(Items.make('thread', 3).qty, 3);
    assert.strictEqual(Items.generate({ id: 'nope' }), null);
    // 층 조건으로 후보가 비면 층을 무시해서라도 돌려준다(퀘스트 보상 보장)
    assert.ok(Items.generate({ slot: 'off', priestOnly: true, floor: 99, rng }));
    const r1 = RNG.make(77), r2 = RNG.make(77);
    const x = Items.generate({ floor: 8, rng: r1 }), y = Items.generate({ floor: 8, rng: r2 });
    assert.strictEqual(x.id, y.id); assert.strictEqual(x.grade, y.grade); same(assert, x.affixes, y.affixes);
  },

  '세트 보너스 형식과 Stats 연동: 2셋 int+10%, 3셋 proc free_mana, 4/5셋 즉시시전 proc'(assert) {
    const { Items, State, Stats } = boot();
    same(assert, Items.setBonus('forest_leaf', 1), []);
    const b2 = Items.setBonus('forest_leaf', 2);
    assert.strictEqual(b2.length, 1); same(assert, { pieces: b2[0].pieces, type: b2[0].type, stat: b2[0].stat, value: b2[0].value }, { pieces: 2, type: 'stat_pct', stat: 'int', value: 10 });
    const b5 = Items.setBonus('cave_crystal', 5);
    same(assert, b5.map((b) => b.proc || b.type), ['stat_pct', 'free_mana', 'instant_basic', 'instant_aoe']);
    assert.ok(b5.slice(1).every((b) => b.type === 'proc' && b.chance === 0.1));
    same(assert, Items.setBonus('unknown', 5), []);
    // Stats.derive 가 장비의 setId 를 세어 int +10% 를 반영한다
    const G = State.newGame('리프');
    G.player.equipment.body = Items.generate({ id: 'novice_cloth_body', grade: 'common' });
    G.player.equipment.hat = Items.generate({ id: 'novice_cloth_hat', grade: 'common' });
    G.player.equipment.boots = Items.generate({ id: 'novice_cloth_boots', grade: 'common' });
    const d = Stats.derive(G.player, G);
    const rawInt = 14 + Items.statsOf(G.player.equipment.body).int + Items.statsOf(G.player.equipment.hat).int + Items.statsOf(G.player.equipment.boots).int;
    assert.ok(Math.abs(d.int - rawInt * 1.1) < 1e-6, `${d.int} vs ${rawInt * 1.1}`);
    assert.strictEqual(d.procs.length, 1); assert.strictEqual(d.procs[0].proc, 'free_mana');
    assert.strictEqual(Stats.gradeMult('rare'), Items.GRADES.rare.mult);
  },

  '소모품·레시피·착용 규칙 데이터: effect 수치, 재료 id 존재, 사제/타직업 canUse'(assert) {
    const { Items } = boot();
    const fx = (id) => Items.get(id).effect;
    same(assert, [fx('hp_potion_s').hp, fx('hp_potion_m').hp, fx('hp_potion_l').hp], [80, 250, 600]);
    same(assert, [fx('mp_potion_s').mp, fx('mp_potion_m').mp, fx('mp_potion_l').mp], [60, 180, 450]);
    assert.strictEqual(fx('antidote').cleanse, 1);
    assert.strictEqual(fx('scroll_return').teleport, 'town');
    assert.strictEqual(Items.get('auction_reset_ticket').currency, 'gems');
    for (const f of Items.consumables().filter((d) => d.id.startsWith('food_'))) {
      assert.strictEqual(f.effect.fatigue, -20); assert.strictEqual(f.effect.buff.duration, 600); assert.ok(f.effect.buff.stat && f.effect.buff.value > 0);
    }
    for (const r of Items.recipes()) {
      assert.ok(Items.get(r.result), `${r.id} 결과 ${r.result}`);
      assert.ok(Items.GRADES[r.grade] && r.gold >= 0 && r.qty >= 1, r.id);
      for (const [m, n] of Object.entries(r.materials)) { assert.ok(Items.get(m) && Items.get(m).kind === 'material', `${r.id} 재료 ${m}`); assert.ok(n >= 1); }
    }
    assert.strictEqual(Items.recipe('craft_book_moon').result, 'book_moon');
    // 착용 규칙
    assert.ok(Items.canUse(Items.get('cloth_body_1'), 'priest'));
    assert.ok(!Items.canUse(Items.get('leather_body_1'), 'priest'));
    assert.ok(!Items.canUse(Items.get('sword_iron'), 'priest'));
    assert.ok(Items.canUse(Items.get('sword_iron'), 'warrior'));
    assert.ok(Items.canUse(Items.get('book_prayer'), 'priest') && Items.canUse(Items.get('ring_copper'), 'priest') && Items.canUse(Items.get('bag_s'), 'priest'));
    assert.ok(!Items.canUse(Items.get('hp_potion_s'), 'priest'), '소모품은 장착 불가');
    assert.ok(Items.isStackable(Items.get('hp_potion_s')) && !Items.isStackable(Items.get('cloth_body_1')) && !Items.isStackable(Items.get('scroll_hidden_f1')));
    assert.strictEqual(Items.gradeName('legendary'), '전설'); assert.strictEqual(Items.slotName('off'), '보조');
  },
};
