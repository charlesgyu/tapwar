const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 객체는 프로토타입이 달라 JSON 으로 비교
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_items.js', 'core/state.js', 'core/stats.js', 'core/inventory.js'];
function boot() {
  const ctx = load(FILES);
  const G = ctx.State.newGame('리프');
  const it = (id, grade = 'common', extra) => Object.assign(ctx.Items.generate({ id, grade, rng: ctx.RNG.make(1) }), extra || {});
  const give = (id, grade, extra) => { const x = it(id, grade, extra); ctx.assertAdd = ctx.Inventory.add(G, x); return x; };
  return Object.assign(ctx, { G, it, give });
}

module.exports = {
  '가방: 20칸, 스택 합치기(99), 넘치면 새 칸, 꽉 차면 false 이고 아무것도 안 바뀜, item_gained 이벤트'(assert) {
    const { Inventory, Items, Events, G, it } = boot();
    const gained = []; Events.on('item_gained', (p) => gained.push(p));
    assert.strictEqual(Inventory.bagSize(G), 20); assert.strictEqual(Inventory.emptySlots(G), 20);
    assert.ok(Inventory.add(G, Items.make('hp_potion_s', 60)));
    assert.ok(Inventory.add(G, Items.make('hp_potion_s', 50)));
    assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 110);
    assert.strictEqual(Inventory.items(G).length, 2, '99 + 11 로 두 칸');
    same(assert, Inventory.items(G).map((x) => x.qty), [99, 11]);
    assert.notStrictEqual(Inventory.items(G)[0].uid, Inventory.items(G)[1].uid);
    for (let i = 0; i < 18; i++) assert.ok(Inventory.add(G, it('cloth_body_1')));
    assert.ok(Inventory.isFull(G));
    assert.strictEqual(Inventory.add(G, it('ring_copper')), false, '장비는 빈칸 필요');
    assert.ok(Inventory.add(G, Items.make('hp_potion_s', 88)), '기존 스택 여유(88)엔 들어감');
    assert.strictEqual(Inventory.add(G, Items.make('hp_potion_s', 1)), false, '스택도 꽉 차면 false');
    assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 198);
    assert.strictEqual(gained.length, 21); same(assert, { id: gained[0].id, qty: gained[0].qty }, { id: 'hp_potion_s', qty: 60 });
    // remove / consume
    const stack = Inventory.items(G)[1];
    assert.strictEqual(Inventory.remove(G, stack.uid, 30), 30); assert.strictEqual(stack.qty, 69);
    assert.ok(Inventory.consume(G, 'hp_potion_s', 100)); assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 68);
    assert.strictEqual(Inventory.consume(G, 'hp_potion_s', 500), false); assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 68);
    assert.strictEqual(Inventory.remove(G, 'nope'), 0);
    assert.ok(Inventory.find(G, stack.uid) === null || Inventory.find(G, stack.uid).qty > 0);
  },

  '장착 규칙: 사제는 천만, 지팡이/책만, 벗은 장비는 가방으로, 가방이 꽉 차면 교체 실패'(assert) {
    const { Inventory, G, give } = boot();
    const robe = give('cloth_body_1', 'uncommon');
    same(assert, Inventory.equip(G, robe.uid), { ok: true, slot: 'body', unequipped: [] });
    assert.strictEqual(G.player.equipment.body, robe); assert.strictEqual(Inventory.items(G).length, 0);
    assert.strictEqual(Inventory.equip(G, give('leather_body_1').uid).reason, 'wrong_armor');
    assert.strictEqual(Inventory.equip(G, give('plate_hat_2').uid).reason, 'wrong_armor');
    assert.strictEqual(Inventory.equip(G, give('sword_iron').uid).reason, 'wrong_weapon');
    assert.strictEqual(Inventory.equip(G, give('hp_potion_s').uid).reason, 'not_equip');
    assert.strictEqual(Inventory.equip(G, 'ghost').reason, 'not_found');
    // 교체: 입던 로브가 가방으로
    const robe2 = give('novice_cloth_body', 'rare');
    const r = Inventory.equip(G, robe2.uid);
    assert.ok(r.ok && r.unequipped[0] === robe);
    assert.strictEqual(G.player.equipment.body, robe2); assert.ok(Inventory.find(G, robe.uid));
    // 가방이 꽉 찬 상태에서 교체는 가능(장착하는 칸이 비니까), 벗기만은 불가
    while (!Inventory.isFull(G)) give('thread');
    const robe3 = Inventory.items(G).find((x) => x.id === 'cloth_body_1');
    assert.ok(Inventory.equip(G, robe3.uid).ok, '꽉 차도 교체는 됨');
    assert.strictEqual(Inventory.unequip(G, 'body').reason, 'bag_full');
    assert.strictEqual(Inventory.unequip(G, 'hat').reason, 'empty');
    Inventory.remove(G, Inventory.items(G).find((x) => x.id === 'thread').uid);
    assert.ok(Inventory.unequip(G, 'body').ok); assert.strictEqual(G.player.equipment.body, null);
    assert.strictEqual(Inventory.canEquip(G, { id: 'cloth_body_1', levelReq: 0 }).ok, true);
  },

  '양손/한손+책: 양손 지팡이를 들면 책이 벗겨지고, 책을 들면 양손 지팡이가 벗겨진다. 둘 다 벗겨질 땐 빈칸 2개 필요'(assert) {
    const { Inventory, G, give } = boot();
    const wand = give('wand_wood'), book = give('book_prayer'), staff = give('staff_wood_two');
    assert.ok(Inventory.equip(G, wand.uid).ok); assert.ok(Inventory.equip(G, book.uid).ok);
    assert.strictEqual(G.player.equipment.main, wand); assert.strictEqual(G.player.equipment.off, book);
    const r = Inventory.equip(G, staff.uid);
    assert.ok(r.ok); assert.strictEqual(r.unequipped.length, 2, '완드 + 책 둘 다 벗겨짐');
    assert.strictEqual(G.player.equipment.main, staff); assert.strictEqual(G.player.equipment.off, null);
    assert.ok(Inventory.find(G, wand.uid) && Inventory.find(G, book.uid));
    // 책을 다시 들면 양손 지팡이가 벗겨진다
    assert.ok(Inventory.equip(G, book.uid).ok);
    assert.strictEqual(G.player.equipment.main, null); assert.strictEqual(G.player.equipment.off, book);
    assert.ok(Inventory.find(G, staff.uid));
    // 한손 완드는 책과 공존
    assert.ok(Inventory.equip(G, wand.uid).ok); assert.strictEqual(G.player.equipment.off, book);
    // 빈칸 부족: 완드+책 착용 상태, 가방에 양손지팡이 하나 + 나머지 전부 채움 → 양손 장착 시 빈칸 1개 더 필요
    while (!Inventory.isFull(G)) give('wood');
    assert.strictEqual(Inventory.equip(G, staff.uid).reason, 'bag_full');
    Inventory.remove(G, Inventory.items(G).find((x) => x.id === 'wood').uid);
    assert.ok(Inventory.equip(G, staff.uid).ok);
    assert.ok(Inventory.isFull(G), '완드·책이 빈 두 칸을 채움');
  },

  '반지 2칸: 빈 칸 우선, 둘 다 차면 첫째 교체'(assert) {
    const { Inventory, G, give } = boot();
    const r1 = give('ring_copper'), r2 = give('ring_silver'), r3 = give('ring_crystal');
    assert.strictEqual(Inventory.equip(G, r1.uid).slot, 'ring1');
    assert.strictEqual(Inventory.equip(G, r2.uid).slot, 'ring2');
    const res = Inventory.equip(G, r3.uid);
    assert.strictEqual(res.slot, 'ring1'); assert.strictEqual(res.unequipped[0], r1);
    assert.strictEqual(G.player.equipment.ring1, r3); assert.strictEqual(G.player.equipment.ring2, r2);
    assert.ok(Inventory.unequip(G, 'ring2').ok);
    assert.strictEqual(Inventory.equip(G, r1.uid).slot, 'ring2', '빈 ring2 로');
    same(assert, Inventory.locate(G, r1.uid), { where: 'equip', slot: 'ring2', inst: r1 });
    assert.strictEqual(Inventory.locate(G, r2.uid).where, 'bag');
  },

  '반지 칸 지정(slotHint): ring2 를 골라 교체, 반지가 아니면 무시'(assert) {
    const { Inventory, G, give } = boot();
    const r1 = give('ring_copper'), r2 = give('ring_silver'), r3 = give('ring_crystal');
    Inventory.equip(G, r1.uid); Inventory.equip(G, r2.uid);
    const res = Inventory.equip(G, r3.uid, 'ring2');
    assert.strictEqual(res.slot, 'ring2'); assert.strictEqual(res.unequipped[0], r2);
    assert.strictEqual(G.player.equipment.ring1, r1);
    const hat = give('cloth_hat_1');
    assert.strictEqual(Inventory.equip(G, hat.uid, 'ring2').slot, 'hat');
  },

  '가방 장비: 착용하면 칸이 늘고(20+12), 벗을 때 아이템이 20칸을 넘으면 실패, 작은 가방으로 교체도 같은 규칙'(assert) {
    const { Inventory, G, give } = boot();
    const bagM = give('bag_m'), bagS = give('bag_s');
    assert.ok(Inventory.equip(G, bagM.uid).ok);
    assert.strictEqual(Inventory.bagSize(G), 32); assert.strictEqual(G.player.bag.length, 32); assert.strictEqual(G.player.bagSize, 32);
    while (Inventory.items(G).length < 27) give('iron_scrap');
    assert.strictEqual(Inventory.unequip(G, 'bag').reason, 'bag_full', '27+1 > 20');
    assert.strictEqual(Inventory.equip(G, bagS.uid).reason, 'bag_full', '26칸엔 27-1+1 = 27 개가 안 들어감');
    while (Inventory.items(G).length > 26) Inventory.remove(G, Inventory.items(G).find((x) => x.id === 'iron_scrap').uid);
    assert.ok(Inventory.equip(G, bagS.uid).ok, '26-1+1 = 26 ≤ 26');
    assert.strictEqual(Inventory.bagSize(G), 26); assert.strictEqual(G.player.bag.length, 26);
    assert.strictEqual(Inventory.items(G).length, 26); assert.ok(Inventory.isFull(G));
    assert.ok(Inventory.find(G, bagM.uid), '벗은 가방은 가방 안으로');
    while (Inventory.items(G).length > 19) Inventory.remove(G, Inventory.items(G).find((x) => x.id === 'iron_scrap').uid);
    assert.ok(Inventory.unequip(G, 'bag').ok);
    assert.strictEqual(G.player.bag.length, 20); assert.strictEqual(Inventory.items(G).length, 20); assert.strictEqual(G.player.bagSize, 20);
    assert.ok(Inventory.find(G, bagS.uid) && Inventory.find(G, bagM.uid));
  },

  '벨트: 없으면 1칸, 등급별 1~4칸, 교체 시 배열 길이가 맞춰지고, 소모품만 등록'(assert) {
    const { Inventory, Items, G, give } = boot();
    assert.strictEqual(Inventory.beltSlots(G), 1); same(assert, G.player.belt, [null]);
    assert.ok(Inventory.setBelt(G, 0, 'hp_potion_s')); assert.strictEqual(Inventory.setBelt(G, 1, 'hp_potion_s'), false, '범위 밖');
    assert.strictEqual(Inventory.setBelt(G, 0, 'cloth_body_1'), false, '장비는 등록 불가');
    assert.strictEqual(Inventory.setBelt(G, 0, 'nope'), false);
    const legendary = give('cloth_belt_1', 'legendary');
    assert.ok(Inventory.equip(G, legendary.uid).ok);
    assert.strictEqual(Inventory.beltSlots(G), 4); same(assert, G.player.belt, ['hp_potion_s', null, null, null]);
    assert.ok(Inventory.setBelt(G, 3, 'antidote')); assert.ok(Inventory.setBelt(G, 2, 'mp_potion_s'));
    const uncommon = give('forest_leaf_belt', 'uncommon');
    assert.ok(Inventory.equip(G, uncommon.uid).ok);
    assert.strictEqual(Inventory.beltSlots(G), 2); same(assert, G.player.belt, ['hp_potion_s', null], '줄어든 칸의 등록은 사라짐');
    assert.ok(Inventory.setBelt(G, 0, null)); same(assert, G.player.belt, [null, null]);
    assert.ok(Inventory.unequip(G, 'belt').ok); same(assert, G.player.belt, [null]);
    // beltSlots 를 명시한 템플릿은 그 값이 우선
    const custom = give('cloth_belt_2', 'common'); Items.get('cloth_belt_2').beltSlots = 3;
    assert.ok(Inventory.equip(G, custom.uid).ok); assert.strictEqual(Inventory.beltSlots(G), 3);
    delete Items.get('cloth_belt_2').beltSlots;
    same(assert, [Items.GRADES.common.beltSlots, Items.GRADES.uncommon.beltSlots, Items.GRADES.rare.beltSlots, Items.GRADES.legendary.beltSlots], [1, 2, 3, 4]);
  },

  '세트 보너스: 숲잎 3부위 → activeSets count 3, 보너스 2개, Stats.derive 에 int+10% 와 proc 반영'(assert) {
    const { Inventory, Items, Stats, G, give } = boot();
    for (const id of ['forest_leaf_body', 'forest_leaf_boots', 'forest_leaf_gloves']) assert.ok(Inventory.equip(G, give(id, 'common').uid).ok);
    assert.ok(Inventory.equip(G, give('novice_cloth_hat', 'common').uid).ok);
    const sets = Inventory.activeSets(G).sort((a, b) => b.count - a.count);
    assert.strictEqual(sets[0].setId, 'forest_leaf'); assert.strictEqual(sets[0].count, 3); assert.strictEqual(sets[0].bonuses.length, 2);
    assert.strictEqual(sets[1].setId, 'novice_cloth'); assert.strictEqual(sets[1].count, 1); same(assert, sets[1].bonuses, []);
    const d = Stats.derive(G.player, G);
    const eq = G.player.equipment;
    const rawInt = 14 + ['body', 'boots', 'gloves', 'hat'].reduce((s, k) => s + Items.statsOf(eq[k]).int, 0);
    assert.ok(Math.abs(d.int - rawInt * 1.1) < 1e-6, `${d.int} vs ${rawInt * 1.1}`);
    assert.strictEqual(d.procs.length, 1); assert.strictEqual(d.procs[0].proc, 'free_mana'); assert.strictEqual(d.procs[0].setId, 'forest_leaf');
    assert.ok(Inventory.equip(G, give('forest_leaf_hat', 'common').uid).ok);
    assert.ok(Inventory.equip(G, give('forest_leaf_belt', 'common').uid).ok);
    const full = Inventory.activeSets(G).find((s) => s.setId === 'forest_leaf');
    assert.strictEqual(full.count, 5); same(assert, full.bonuses.map((b) => b.proc || b.type), ['stat_pct', 'free_mana', 'instant_basic', 'instant_aoe']);
    assert.strictEqual(Stats.derive(G.player, G).procs.length, 3);
  },

  '소모품 사용: HP/MP 포션(최대치 제한), 해독제(위험한 저주부터), 음식(피로·버프 갱신), 수량 감소, 없으면 false, 전투 엔티티 대상'(assert) {
    const { Inventory, Items, Stats, Events, G } = boot();
    const used = []; Events.on('consumable_used', (p) => used.push(p));
    assert.strictEqual(Inventory.useConsumable(G, 'hp_potion_s'), false, '없으면 false');
    Inventory.add(G, Items.make('hp_potion_s', 2)); Inventory.add(G, Items.make('mp_potion_l', 1));
    Inventory.add(G, Items.make('antidote', 2)); Inventory.add(G, Items.make('food_stew', 2)); Inventory.add(G, Items.make('scroll_return', 1));
    const maxHp = Stats.derive(G.player, G).maxHp;
    G.player.hp = maxHp - 30;
    assert.ok(Inventory.useConsumable(G, 'hp_potion_s'));
    assert.strictEqual(G.player.hp, maxHp, '최대치를 넘지 않음'); assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 1);
    G.player.hp = 10; assert.ok(Inventory.useConsumable(G, 'hp_potion_s')); assert.strictEqual(G.player.hp, 90); assert.strictEqual(Inventory.count(G, 'hp_potion_s'), 0);
    G.player.mp = 5; assert.ok(Inventory.useConsumable(G, 'mp_potion_l')); assert.strictEqual(G.player.mp, Stats.derive(G.player, G).maxMp);
    // 전투 엔티티(maxHp 보유)에 해독제: 속박 > 치유 저해 > 맹독 > 나머지 순으로 하나씩
    const ent = { uid: 'e1', hp: 50, maxHp: 200, alive: true, curses: [{ id: 'def_down', until: 9 }, { id: 'root', until: 9 }, { id: 'dot', until: 9 }], buffs: [] };
    assert.ok(Inventory.useConsumable(G, 'antidote', ent));
    same(assert, ent.curses.map((c) => c.id), ['def_down', 'dot']);
    assert.ok(Inventory.useConsumable(G, 'antidote', ent, 3));
    same(assert, ent.curses.map((c) => c.id), ['def_down']);
    assert.strictEqual(Inventory.count(G, 'antidote'), 0);
    assert.strictEqual(used[used.length - 1].targetUid, 'e1'); assert.strictEqual(used[used.length - 1].isPlayer, false);
    // 음식: 피로 -20(0 아래로 안 감), 버프는 G.player.buffs 에 playTime 기준 until, 같은 음식은 갱신
    G.player.fatigue = 30; G.playTime = 100;
    assert.ok(Inventory.useConsumable(G, 'food_stew'));
    assert.strictEqual(G.player.fatigue, 10);
    same(assert, G.player.buffs, [{ id: 'food_stew', stat: 'int', value: 0.1, until: 700 }]);
    G.playTime = 200; assert.ok(Inventory.useConsumable(G, 'food_stew'));
    assert.strictEqual(G.player.fatigue, 0); assert.strictEqual(G.player.buffs.length, 1); assert.strictEqual(G.player.buffs[0].until, 800);
    assert.ok(Math.abs(Stats.derive(G.player, G, 300).int - 14 * 1.1) < 1e-6, '음식 버프가 지능 +10%');
    assert.strictEqual(Stats.derive(G.player, G, 900).int, 14, '만료 후엔 사라짐');
    // 귀환 두루마리는 return_town 이벤트만 낸다
    let returned = null; Events.on('return_town', (p) => { returned = p; });
    assert.ok(Inventory.useConsumable(G, 'scroll_return')); assert.strictEqual(returned.to, 'town');
    // 죽은 엔티티에는 포션이 안 듣는다(수량만 줄지 않도록 효과 없이도 true 는 아님 → 소모는 됨)
    Inventory.add(G, Items.make('hp_potion_s', 1));
    const dead = { uid: 'd', hp: 0, maxHp: 100, alive: false };
    assert.ok(Inventory.useConsumable(G, 'hp_potion_s', dead)); assert.strictEqual(dead.hp, 0);
    assert.strictEqual(Inventory.useConsumable(G, 'cloth_body_1'), false, '장비는 사용 불가');
    // 내구도 마모
    const robe = Items.generate({ id: 'cloth_body_1', grade: 'common' }); Inventory.add(G, robe); Inventory.equip(G, robe.uid);
    Inventory.wear(G, 30); assert.strictEqual(robe.durability, 70); Inventory.wear(G, 100); assert.strictEqual(robe.durability, 0);
  },
};
