const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 객체는 프로토타입이 달라 JSON 으로 비교
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_items.js', 'core/state.js', 'core/stats.js', 'core/inventory.js', 'core/economy.js'];
const boot = () => load(FILES);
const inst = (ctx, id, grade = 'common', extra) => Object.assign(ctx.Items.generate({ id, grade, rng: ctx.RNG.make(3) }), extra || {});

module.exports = {
  '구매가: 기본가 × 등급 배수(1/1.6/3/8), 접사 하나당 +10%, def/inst/id 모두 받음, 소모품은 등급 무관'(assert) {
    const ctx = boot(); const { Economy, Items } = ctx;
    const def = Items.get('cloth_body_1');
    assert.strictEqual(Economy.buyPrice(def), def.price);
    assert.strictEqual(Economy.buyPrice('cloth_body_1'), def.price);
    const prices = ['common', 'uncommon', 'rare', 'legendary'].map((g) => Economy.buyPrice(Object.assign(inst(ctx, 'cloth_body_1', g), { affixes: [] })));
    same(assert, prices, [120, 192, 360, 960]);
    assert.ok(prices[0] < prices[1] && prices[1] < prices[2] && prices[2] < prices[3]);
    const withAffix = inst(ctx, 'cloth_body_1', 'rare', { affixes: [{ stat: 'int', value: 3 }, { stat: 'vit', value: 2 }] });
    assert.strictEqual(Economy.buyPrice(withAffix), Math.round(120 * 3 * 1.2));
    assert.strictEqual(Economy.buyPrice(Items.make('hp_potion_m', 5)), 90, '소모품은 수량·등급 무관 단가');
    assert.strictEqual(Economy.buyPrice('nope'), 0);
    assert.strictEqual(Economy.currency('auction_reset_ticket'), 'gems'); assert.strictEqual(Economy.currency('hp_potion_s'), 'gold');
  },

  '판매가: 구매가의 40%, 내구도에 따라 50%~100%, 스택은 수량 곱, 퀘스트 아이템·보석 아이템은 0'(assert) {
    const ctx = boot(); const { Economy, Items } = ctx;
    const robe = inst(ctx, 'cloth_body_1', 'rare', { affixes: [] });
    assert.strictEqual(Economy.sellPrice(robe), Math.floor(360 * 0.4));
    robe.durability = 50; assert.strictEqual(Economy.sellPrice(robe), Math.floor(360 * 0.4 * 0.75));
    robe.durability = 0; assert.strictEqual(Economy.sellPrice(robe), Math.floor(360 * 0.4 * 0.5));
    assert.strictEqual(Economy.durabilityFactor(robe), 0.5);
    assert.strictEqual(Economy.sellPrice(Items.make('thread', 10)), Math.floor(6 * 0.4) * 10);
    assert.strictEqual(Economy.sellPrice(Items.make('hp_potion_l', 3)), 100 * 3);
    assert.strictEqual(Economy.sellPrice(Items.make('scroll_hidden_f3')), 0);
    assert.strictEqual(Economy.sellPrice(Items.make('auction_reset_ticket')), 0);
    const leg = inst(ctx, 'staff_dragon_two', 'legendary', { affixes: [{ stat: 'int', value: 5 }, { stat: 'heal_power', value: 12 }] });
    assert.ok(Economy.sellPrice(leg) > Economy.sellPrice(robe) * 10, '전설 장비는 훨씬 비싸게 팔림');
  },

  '수리비: 구매가 × 손상비율 × 0.3, 멀쩡하면 0, 소모품은 0'(assert) {
    const ctx = boot(); const { Economy, Items } = ctx;
    const robe = inst(ctx, 'cloth_body_2', 'uncommon', { affixes: [] });
    const buy = Economy.buyPrice(robe);
    assert.strictEqual(Economy.repairCost(robe), 0);
    robe.durability = 40; assert.strictEqual(Economy.repairCost(robe), Math.ceil(buy * 0.6 * 0.3));
    robe.durability = 0; assert.strictEqual(Economy.repairCost(robe), Math.ceil(buy * 0.3));
    assert.strictEqual(Economy.repairCost(Items.make('hp_potion_s')), 0);
    assert.ok(Economy.repairCost(robe) < buy * 0.4, '수리가 다시 사는 것보다 싸다');
  },

  '분해: 등급별 재료 1~3개(전설은 용 비늘 보장), 재질별 기본 재료 포함, 결과는 실제 재료 인스턴스, 같은 시드면 같은 결과'(assert) {
    const ctx = boot(); const { Economy, Items, RNG } = ctx;
    const total = (mats) => mats.reduce((s, m) => s + m.qty, 0);
    const ids = (mats) => mats.map((m) => m.id);
    const ranges = { common: [1, 1], uncommon: [1, 2], rare: [2, 3], legendary: [4, 4] };
    const rng = RNG.make(11);
    for (const [grade, [lo, hi]] of Object.entries(ranges)) {
      for (let i = 0; i < 50; i++) {
        const mats = Economy.disassemble(inst(ctx, 'cloth_body_1', grade), rng);
        const n = total(mats);
        assert.ok(n >= lo && n <= hi, `${grade} 재료 ${n}`);
        assert.ok(ids(mats).includes('thread'), '천은 실');
        for (const m of mats) { const d = Items.get(m.id); assert.ok(d && d.kind === 'material', m.id); assert.ok(m.qty >= 1 && m.uid); }
        if (grade === 'legendary') assert.ok(ids(mats).includes('dragon_scale'), '전설은 용 비늘');
        if (grade === 'common') same(assert, ids(mats), ['thread']);
        if (grade === 'rare' || grade === 'legendary') assert.ok(!ids(mats).some((id) => id !== 'thread' && Economy.TIERS.basic.includes(id)), '레어 이상은 기본 재료가 안 섞임');
      }
    }
    assert.ok(ids(Economy.disassemble(inst(ctx, 'plate_body_1'), rng)).includes('iron_scrap'));
    assert.ok(ids(Economy.disassemble(inst(ctx, 'leather_boots_2'), rng)).includes('leather'));
    assert.ok(ids(Economy.disassemble(inst(ctx, 'staff_oak_two'), rng)).includes('wood'));
    assert.ok(ids(Economy.disassemble(inst(ctx, 'bag_s'), rng)).includes('leather'));
    assert.ok(ids(Economy.disassemble(inst(ctx, 'ring_silver'), rng)).includes('iron_scrap'));
    same(assert, Economy.disassemble(Items.make('hp_potion_s'), rng), []);
    const a = Economy.disassemble(inst(ctx, 'cave_crystal_body', 'rare'), RNG.make(5)), b = Economy.disassemble(inst(ctx, 'cave_crystal_body', 'rare'), RNG.make(5));
    same(assert, ids(a), ids(b)); same(assert, a.map((m) => m.qty), b.map((m) => m.qty));
    assert.ok(Economy.disassemblePreview(inst(ctx, 'cave_crystal_body', 'rare')).includes('crystal'));
    assert.ok(Economy.disassemblePreview(inst(ctx, 'cloth_body_1', 'common')).includes('thread'));
  },

  '분해 결과는 Inventory.add 로 들어가고, canCraft 는 골드·재료를 확인한다'(assert) {
    const ctx = boot(); const { Economy, Items, Inventory, State, RNG } = ctx;
    const G = State.newGame('리프');
    for (const m of Economy.disassemble(inst(ctx, 'forest_leaf_hat', 'rare'), RNG.make(2))) assert.ok(Inventory.add(G, m));
    assert.ok(Inventory.items(G).length >= 1 && Inventory.count(G, 'thread') >= 1);
    const recipe = Items.recipe('craft_hp_potion_m');
    assert.strictEqual(Economy.canCraft(G, recipe).reason, 'materials');
    Inventory.add(G, Items.make('herb', 3)); Inventory.add(G, Items.make('thread', 1));
    G.player.gold = 10; assert.strictEqual(Economy.canCraft(G, recipe).reason, 'gold');
    G.player.gold = 300; same(assert, Economy.canCraft(G, recipe), { ok: true });
    assert.strictEqual(Economy.canCraft(G, null).reason, 'no_recipe');
  },

  '가격 체계 일관성: 모든 장비는 상위 티어가 더 비싸고, 세트·전설 템플릿은 일반 템플릿보다 비싸며, 판매가 < 구매가'(assert) {
    const ctx = boot(); const { Economy, Items } = ctx;
    for (const armor of ['cloth', 'leather', 'chain', 'plate']) for (const slot of Items.ARMOR_SLOTS) {
      assert.ok(Items.get(`${armor}_${slot}_2`).price > Items.get(`${armor}_${slot}_1`).price, `${armor}_${slot}`);
    }
    assert.ok(Items.get('cave_crystal_body').price > Items.get('forest_leaf_body').price && Items.get('forest_leaf_body').price > Items.get('novice_cloth_body').price);
    for (const d of Items.equipment()) {
      for (const grade of Items.GRADE_ORDER) {
        const it = inst(ctx, d.id, grade, { affixes: [] });
        assert.ok(Economy.sellPrice(it) < Economy.buyPrice(it), `${d.id} ${grade}`);
      }
    }
  },
};
