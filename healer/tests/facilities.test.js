const load = require('../tools/load');
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js', 'core/data_items.js', 'core/data_monsters.js',
  'core/data_dialogue.js', 'core/data_quests.js', 'core/data_story.js', 'core/state.js', 'core/stats.js', 'core/level.js', 'core/inventory.js',
  'core/economy.js', 'core/facilities.js', 'core/party.js', 'core/quests.js'];
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const HOUR = 3600000, MIN = 60000;
function boot(gold = 300) {
  const ctx = load(FILES);
  const G = ctx.State.newGame('테스트'); G.player.gold = gold;
  return { ctx, G, F: ctx.Facilities };
}
// 가방에 재료/소모품을 넣는다
function give(ctx, G, id, qty = 1) { const inst = ctx.Items.make(id, qty); ctx.Inventory.add(G, inst); return inst; }
function giveEquip(ctx, G, id, grade = 'common') { const inst = ctx.Items.generate({ id, grade, rng: ctx.RNG.make(3) }); inst.affixes = []; ctx.Inventory.add(G, inst); return inst; }
function fillBag(ctx, G) { while (!ctx.Inventory.isFull(G)) give(ctx, G, 'scroll_hidden_f1'); }
const sig = (listings) => listings.map((l) => `${l.item.id}/${l.item.grade}/${l.item.qty}/${l.price}/${l.item.affixes.map((a) => a.stat + a.value).join('+')}`);

module.exports = {
  '잡화점: 재고(포션·기본 재료·기본 장비), 구매 시 골드 차감, 골드 부족/가방 부족이면 아무것도 안 바뀜'(assert) {
    const { ctx, G, F } = boot(300);
    const stock = F.shop.stock(G);
    assert.ok(stock.some((s) => s.id === 'hp_potion_s') && stock.some((s) => s.id === 'herb') && stock.some((s) => s.id === 'staff_wood_two'));
    assert.ok(!stock.some((s) => s.id === 'auction_reset_ticket'), '보석 아이템은 안 판다');
    assert.ok(!stock.some((s) => s.id === 'food_bread'), '음식은 여관에서');
    const r = F.shop.buy(G, 'hp_potion_s', 3);
    assert.ok(r.ok); assert.strictEqual(r.cost, 90); assert.strictEqual(G.player.gold, 210); assert.strictEqual(ctx.Inventory.count(G, 'hp_potion_s'), 3);
    same(assert, F.shop.buy(G, 'hp_potion_l', 1), { ok: false, reason: 'gold', cost: 250 });
    assert.strictEqual(G.player.gold, 210);
    assert.strictEqual(F.shop.buy(G, 'nope').reason, 'not_sold');
    G.player.gold = 100;
    assert.strictEqual(F.shop.buy(G, 'cloth_body_1').reason, 'gold', '장비도 골드 확인');
    G.player.gold = 1000;
    const eq = F.shop.buy(G, 'staff_wood_two', 5);
    assert.ok(eq.ok && eq.item.grade === 'common' && eq.cost === 150, '장비는 1개·일반 등급');
    fillBag(ctx, G);
    const before = G.player.gold;
    assert.strictEqual(F.shop.buy(G, 'mp_potion_s', 1).reason, 'bag_full');
    assert.strictEqual(G.player.gold, before, '실패하면 골드 그대로');
  },

  '잡화점 판매: Economy.sellPrice 로 골드 지급, 일부 수량 판매, 퀘스트 아이템은 못 판다'(assert) {
    const { ctx, G, F } = boot(0);
    const potions = give(ctx, G, 'hp_potion_m', 5);
    const r = F.shop.sell(G, potions.uid, 2);
    assert.ok(r.ok); assert.strictEqual(r.qty, 2); assert.strictEqual(r.gold, Math.floor(90 * 0.4) * 2); assert.strictEqual(G.player.gold, r.gold);
    assert.strictEqual(ctx.Inventory.count(G, 'hp_potion_m'), 3);
    const robe = giveEquip(ctx, G, 'cloth_body_1', 'rare');
    const all = F.shop.sell(G, robe.uid);
    assert.strictEqual(all.gold, ctx.Economy.sellPrice(robe)); assert.strictEqual(ctx.Inventory.find(G, robe.uid), null);
    const scroll = give(ctx, G, 'scroll_hidden_f2');
    assert.strictEqual(F.shop.sell(G, scroll.uid).reason, 'unsellable');
    assert.strictEqual(F.shop.sell(G, 'nope').reason, 'not_found');
  },

  '경매장 회전: hourIndex 시드로 결정적(같은 시간 → 같은 목록 12~20개), 시간이 바뀌면 다른 목록, 사제용 섞임, 층 진행도 반영'(assert) {
    const { ctx, G, F } = boot(0);
    const now = HOUR * 500000;
    const a = F.auction.listings(G, now);
    assert.ok(a.length >= 12 && a.length <= 20, `매물 ${a.length}`);
    assert.strictEqual(G.auction.hourIndex, 500000);
    const G2 = ctx.State.newGame('둘');
    same(assert, sig(F.auction.listings(G2, now + 10 * MIN)), sig(a), '같은 시간이면 같은 매물');
    assert.strictEqual(F.auction.listings(G, now + 30 * MIN), a, '같은 시간 안에서는 재생성 안 함');
    const b = F.auction.listings(G, now + HOUR);
    assert.notDeepStrictEqual(sig(b), sig(a), '시간이 바뀌면 다른 매물');
    const priest = a.filter((l) => { const d = ctx.Items.get(l.item.id); return d.kind === 'equip' && ctx.Items.canUse(d, 'priest'); });
    assert.ok(priest.length >= 3, '사제용 장비가 섞여 있다');
    for (const l of a) assert.ok(l.price > 0 && l.uid === l.item.uid);
    // 층 진행도: 10층 직전이면 2티어·높은 등급이 나온다
    const late = ctx.State.newGame('후반'); late.tower.highestCleared = 8;
    const hi = F.auction.listings(late, now);
    const tier2 = hi.filter((l) => /_2$/.test(l.item.id) || ['legendary', 'rare'].includes(l.item.grade));
    assert.ok(tier2.length > 0, '후반엔 동굴 장비/고등급이 나온다');
    assert.strictEqual(F.auction.progressFloor(late), 9);
  },

  '경매장 구매/등록/리셋: 구매 골드 차감·목록에서 제거, 등록은 가방에서 빠짐, 리셋권 소모 후 다른 목록'(assert) {
    const { ctx, G, F } = boot(100);
    const now = HOUR * 500001;
    const list = F.auction.listings(G, now);
    const cheap = list.slice().sort((x, y) => x.price - y.price)[0];
    G.player.gold = cheap.price - 1;
    assert.strictEqual(F.auction.buy(G, cheap.uid, now).reason, 'gold');
    G.player.gold = cheap.price;
    const r = F.auction.buy(G, cheap.uid, now);
    assert.ok(r.ok && r.item.id === cheap.item.id); assert.strictEqual(G.player.gold, 0);
    assert.ok(!F.auction.listings(G, now).some((l) => l.uid === cheap.uid), '산 물건은 목록에서 사라짐');
    assert.strictEqual(F.auction.buy(G, cheap.uid, now).reason, 'not_found');
    const robe = giveEquip(ctx, G, 'cloth_body_1', 'uncommon');
    assert.strictEqual(F.auction.list(G, robe.uid, 0, now).reason, 'bad_price');
    const l = F.auction.list(G, robe.uid, 200, now);
    assert.ok(l.ok); assert.strictEqual(ctx.Inventory.find(G, robe.uid), null); assert.strictEqual(F.auction.mine(G).length, 1);
    assert.strictEqual(F.auction.list(G, robe.uid, 10, now).reason, 'not_found');
    const sigBefore = sig(F.auction.listings(G, now));
    assert.strictEqual(G.auction.resetTickets, 1);
    const rs = F.auction.reset(G, now);
    assert.ok(rs.ok); assert.strictEqual(G.auction.resetTickets, 0);
    assert.notDeepStrictEqual(sig(F.auction.listings(G, now)), sigBefore, '리셋하면 같은 시간이라도 다른 매물');
    assert.strictEqual(F.auction.reset(G, now).reason, 'no_ticket');
    const c = F.auction.cancel(G, robe.uid);
    assert.ok(c.ok && ctx.Inventory.find(G, robe.uid), '취소하면 가방으로');
  },

  '경매장 tick: 적정가 1.2배 이하만 분당 15% 확률로 팔려 골드 지급, 바가지는 안 팔림, 240분까지만 굴림'(assert) {
    const { ctx, G, F } = boot(0);
    const now = HOUR * 500002;
    const fair = giveEquip(ctx, G, 'cloth_body_1'), greedy = giveEquip(ctx, G, 'cloth_boots_1');
    const fairPrice = ctx.Economy.buyPrice(fair);
    F.auction.list(G, fair.uid, Math.floor(fairPrice * 1.2), now);
    F.auction.list(G, greedy.uid, ctx.Economy.buyPrice(greedy) * 3, now);
    const never = { chance: () => false }, always = { chance: () => true };
    same(assert, F.auction.tick(G, now + 30 * 1000, always), { ok: true, sold: [] }, '1분이 안 지나면 아무 일도 없음');
    let r = F.auction.tick(G, now + 5 * MIN, never);
    assert.strictEqual(r.sold.length, 0); assert.strictEqual(F.auction.mine(G).length, 2);
    r = F.auction.tick(G, now + 6 * MIN, always);
    assert.strictEqual(r.sold.length, 1); assert.strictEqual(r.sold[0].uid, fair.uid);
    assert.strictEqual(G.player.gold, Math.floor(fairPrice * 1.2), '판매가 전액 지급');
    assert.strictEqual(F.auction.mine(G).length, 1); assert.strictEqual(F.auction.history(G)[0].item.uid, fair.uid);
    assert.strictEqual(F.auction.tick(G, now + 10 * HOUR, always).sold.length, 0, '바가지는 영원히 안 팔림');
    assert.ok(!F.auction.isFair(F.auction.mine(G)[0]));
    // 실제 확률: 100분 동안 15% 면 거의 확실히 팔린다
    const G3 = ctx.State.newGame('셋'); const x = giveEquip(ctx, G3, 'wand_wood');
    F.auction.list(G3, x.uid, 50, now);
    assert.strictEqual(F.auction.tick(G3, now + 100 * MIN, ctx.RNG.make(1)).sold.length, 1);
  },

  '은행: 아이템 입출금(가방↔은행, 은행 60칸/가방 가득 거부), 골드 입출금(부족·잘못된 금액 거부)'(assert) {
    const { ctx, G, F } = boot(500);
    const potion = give(ctx, G, 'hp_potion_s', 4);
    const d = F.bank.deposit(G, potion.uid);
    assert.ok(d.ok); assert.strictEqual(ctx.Inventory.count(G, 'hp_potion_s'), 0); assert.strictEqual(G.bank.items.length, 1);
    assert.strictEqual(F.bank.deposit(G, potion.uid).reason, 'not_found');
    const w = F.bank.withdraw(G, potion.uid);
    assert.ok(w.ok); assert.strictEqual(ctx.Inventory.count(G, 'hp_potion_s'), 4); assert.strictEqual(G.bank.items.length, 0);
    assert.strictEqual(F.bank.withdraw(G, potion.uid).reason, 'not_found');
    const robe = giveEquip(ctx, G, 'cloth_body_1'); F.bank.deposit(G, robe.uid); fillBag(ctx, G);
    assert.strictEqual(F.bank.withdraw(G, robe.uid).reason, 'bag_full');
    G.bank.size = 1;
    assert.strictEqual(F.bank.deposit(G, ctx.Inventory.items(G)[0].uid).reason, 'bank_full');
    same(assert, F.bank.depositGold(G, 200), { ok: true, gold: 300, bank: 200 });
    assert.strictEqual(F.bank.depositGold(G, 301).reason, 'gold');
    assert.strictEqual(F.bank.depositGold(G, 0).reason, 'bad_amount');
    assert.strictEqual(F.bank.withdrawGold(G, 201).reason, 'bank_gold');
    same(assert, F.bank.withdrawGold(G, 150.9), { ok: true, gold: 450, bank: 50 });
    same(assert, F.bank.capacity(G), { used: 1, size: 1, gold: 50 });
  },

  '대장간 수리: Economy.repairCost 만큼 차감하고 내구도 회복, 멀쩡하면 not_damaged, repairAll 은 장착품 포함 합산'(assert) {
    const { ctx, G, F } = boot(10);
    const robe = giveEquip(ctx, G, 'cloth_body_1', 'rare'); robe.durability = 40;
    const cost = ctx.Economy.repairCost(robe); assert.ok(cost > 0);
    assert.strictEqual(F.smithy.repair(G, robe.uid).reason, 'gold');
    G.player.gold = cost;
    same(assert, F.smithy.repair(G, robe.uid), { ok: true, cost, item: robe });
    assert.strictEqual(robe.durability, robe.maxDurability); assert.strictEqual(G.player.gold, 0);
    assert.strictEqual(F.smithy.repair(G, robe.uid).reason, 'not_damaged');
    assert.strictEqual(F.smithy.repair(G, give(ctx, G, 'hp_potion_s').uid).reason, 'not_equip');
    assert.strictEqual(F.smithy.repair(G, 'nope').reason, 'not_found');
    ctx.Inventory.equip(G, robe.uid); robe.durability = 0;
    const staff = giveEquip(ctx, G, 'staff_wood_two'); staff.durability = 50;
    const total = ctx.Economy.repairCost(robe) + ctx.Economy.repairCost(staff);
    assert.strictEqual(F.smithy.repairAll(G).reason, 'gold');
    G.player.gold = total;
    same(assert, F.smithy.repairAll(G), { ok: true, cost: total, count: 2 });
    assert.strictEqual(robe.durability, 100); assert.strictEqual(staff.durability, 100);
    assert.strictEqual(F.smithy.repairAll(G).reason, 'not_damaged');
  },

  '대장간 분해/조합: 분해하면 장비가 사라지고 재료가 들어온다, 조합은 재료 부족/골드 부족이면 거부, 성공 시 재료·골드 소모'(assert) {
    const { ctx, G, F } = boot(100);
    const robe = giveEquip(ctx, G, 'cloth_body_1', 'legendary');
    const r = F.smithy.disassemble(G, robe.uid, ctx.RNG.make(2));
    assert.ok(r.ok); assert.strictEqual(ctx.Inventory.find(G, robe.uid), null);
    assert.ok(r.materials.some((m) => m.id === 'thread') && r.materials.some((m) => m.id === 'dragon_scale'), '천은 실, 전설은 용 비늘');
    for (const m of r.materials) assert.ok(ctx.Inventory.count(G, m.id) >= m.qty, m.id);
    assert.strictEqual(F.smithy.disassemble(G, give(ctx, G, 'herb').uid).reason, 'not_equip');
    // 조합: HP 포션 = 약초 3 + 실 1 + 30골드
    assert.strictEqual(F.smithy.craft(G, 'nope').reason, 'no_recipe');
    const c1 = F.smithy.craft(G, 'craft_hp_potion_m');
    assert.strictEqual(c1.reason, 'materials'); assert.strictEqual(c1.missing, 'herb');
    give(ctx, G, 'herb', 3); give(ctx, G, 'thread', 1);
    G.player.gold = 29;
    assert.strictEqual(F.smithy.craft(G, 'craft_hp_potion_m').reason, 'gold');
    G.player.gold = 30;
    const c2 = F.smithy.craft(G, 'craft_hp_potion_m');
    assert.ok(c2.ok); assert.strictEqual(c2.item.id, 'hp_potion_m'); assert.strictEqual(c2.item.qty, 2); assert.strictEqual(c2.toBank, false);
    assert.strictEqual(G.player.gold, 0); assert.strictEqual(ctx.Inventory.count(G, 'herb'), 1); assert.strictEqual(ctx.Inventory.count(G, 'hp_potion_m'), 2);
    // 장비 레시피는 레시피 등급으로 생성
    give(ctx, G, 'wood', 6); give(ctx, G, 'magic_powder', 2); G.player.gold = 200;
    const c3 = F.smithy.craft(G, 'craft_staff_oak', ctx.RNG.make(1));
    assert.ok(c3.ok); assert.strictEqual(c3.item.id, 'staff_oak_two'); assert.strictEqual(c3.item.grade, 'uncommon');
    assert.ok(F.smithy.recipes(G).every((x) => typeof x.can.ok === 'boolean'));
  },

  '여관: 음식 3종(피로 -20/-35/-50 + 10분 버프), 숙박 50골드로 피로 0·day+1·HP/MP 회복·일일 퀘스트 리셋'(assert) {
    const { ctx, G, F } = boot(200);
    const menu = F.inn.menu();
    same(assert, menu.map((m) => [m.id, m.fatigue, m.buff.duration]), [['food_bread', -20, 600], ['food_pie', -35, 600], ['food_stew', -50, 600]]);
    G.player.fatigue = 90;
    const e = F.inn.eat(G, 'food_stew', 100);
    assert.ok(e.ok); assert.strictEqual(G.player.fatigue, 40); assert.strictEqual(G.player.gold, 155);
    same(assert, G.player.buffs, [{ id: 'food_stew', stat: 'int', value: 0.1, until: 700 }]);
    F.inn.eat(G, 'food_stew', 200);
    assert.strictEqual(G.player.buffs.length, 1, '같은 음식은 갱신'); assert.strictEqual(G.player.buffs[0].until, 800);
    F.inn.eat(G, 'food_bread', 200);
    assert.strictEqual(G.player.fatigue, 0, '0 아래로 안 내려감');
    assert.strictEqual(F.inn.eat(G, 'nope').reason, 'unknown');
    G.player.gold = 49;
    assert.strictEqual(F.inn.sleep(G).reason, 'gold');
    G.player.gold = 50; G.player.fatigue = 70; G.player.hp = 1; G.player.mp = 1;
    ctx.Party.add(G, ctx.Party.generateMember(ctx.RNG.make(1), 2)); G.party[0].hp = 1;
    const days = []; ctx.Events.on('day_passed', (p) => days.push(p.day));
    const s = F.inn.sleep(G);
    same(assert, s, { ok: true, day: 2, cost: 50 });
    assert.strictEqual(G.player.gold, 0); assert.strictEqual(G.player.fatigue, 0); assert.strictEqual(G.day, 2);
    assert.strictEqual(G.player.hp, ctx.Stats.derive(G.player, G).maxHp); assert.strictEqual(G.party[0].hp, ctx.Stats.derive(G.party[0], G).maxHp);
    assert.strictEqual(G.quests.daily.day, 2, '일일 퀘스트가 새 날로 리셋'); assert.strictEqual(G.quests.daily.offered.length, 3);
    same(assert, days, [2]);
  },

  '각인소: 스탯 6종 + 특수 4종, 슬롯 3 + floor(level/10), 골드·재료 소모, 특수 각인 중복 거부, Stats.derive 에 반영'(assert) {
    const { ctx, G, F } = boot(10000);
    const opts = F.engraver.options(G);
    assert.strictEqual(opts.filter((o) => o.stat).length, 6); assert.strictEqual(opts.filter((o) => o.special).length, 4);
    same(assert, opts.filter((o) => o.special).map((o) => [o.special.id, o.special.chance]), [['guard', 0.2], ['evade', 0.2], ['heal_crit', 0.1], ['mana_refund', 0.1]]);
    assert.ok(opts.every((o) => !o.affordable), '재료가 없으면 affordable=false');
    assert.strictEqual(F.engraver.maxSlots(G), 3);
    const r0 = F.engraver.engrave(G, 'eng_int');
    assert.strictEqual(r0.reason, 'materials'); assert.strictEqual(r0.missing, 'magic_powder');
    give(ctx, G, 'magic_powder', 20); give(ctx, G, 'iron_scrap', 20); give(ctx, G, 'holy_water', 5); give(ctx, G, 'spider_silk', 10);
    const intBefore = ctx.Stats.derive(G.player, G).int;
    const r1 = F.engraver.engrave(G, 'eng_int');
    assert.ok(r1.ok); same(assert, r1.engraving, { id: 'eng_int', stat: 'int', value: 6 }); assert.strictEqual(G.player.gold, 9700); assert.strictEqual(ctx.Inventory.count(G, 'magic_powder'), 18);
    assert.strictEqual(ctx.Stats.derive(G.player, G).int, intBefore + 6, '각인이 파생 스탯에 반영');
    assert.ok(F.engraver.engrave(G, 'eng_guard').ok);
    assert.strictEqual(F.engraver.engrave(G, 'eng_guard').reason, 'duplicate');
    same(assert, ctx.Stats.derive(G.player, G).specials, [{ id: 'guard', chance: 0.2, value: 0.3, duration: 5 }]);
    assert.ok(F.engraver.engrave(G, 'eng_int').ok, '스탯 각인은 중복 가능');
    assert.strictEqual(F.engraver.engrave(G, 'eng_def').reason, 'slots_full');
    G.player.level = 10;
    assert.strictEqual(F.engraver.maxSlots(G), 4);
    G.player.gold = 100;
    assert.strictEqual(F.engraver.engrave(G, 'eng_def').reason, 'gold');
    G.player.gold = 300;
    assert.ok(F.engraver.engrave(G, 'eng_def').ok);
    assert.strictEqual(G.player.engravings.length, 4);
    assert.strictEqual(F.engraver.engrave(G, 'nope').reason, 'unknown');
    G.player.gold = 100;
    assert.ok(F.engraver.erase(G, 0).ok); assert.strictEqual(G.player.engravings.length, 3); assert.strictEqual(G.player.gold, 0);
  },

  '신전: 비용 = Skills.upgradeCost(150×lv²), 강화 시 skillLevels 증가, 해금 전/만렙/골드 부족 거부'(assert) {
    const { ctx, G, F } = boot(0);
    assert.strictEqual(F.temple.cost(G, 'heal_basic'), 150);
    assert.strictEqual(F.temple.cost(G, 'buff_def'), null, '해금 전');
    assert.strictEqual(F.temple.cost(G, 'taunt'), null, '파티원 스킬은 신전에서 못 올림');
    assert.strictEqual(F.temple.upgrade(G, 'heal_basic').reason, 'gold');
    assert.strictEqual(F.temple.upgrade(G, 'buff_def').reason, 'locked');
    assert.strictEqual(F.temple.upgrade(G, 'taunt').reason, 'unknown');
    G.player.gold = 150 + 600;
    same(assert, F.temple.upgrade(G, 'heal_basic'), { ok: true, level: 2, cost: 150 });
    assert.strictEqual(F.temple.cost(G, 'heal_basic'), 600);
    same(assert, F.temple.upgrade(G, 'heal_basic'), { ok: true, level: 3, cost: 600 });
    assert.strictEqual(G.player.gold, 0); assert.strictEqual(G.player.skillLevels.heal_basic, 3);
    assert.strictEqual(ctx.Level.skillLevel(G, 'heal_basic'), 3);
    G.player.skillLevels.cleanse = 10;
    assert.strictEqual(F.temple.cost(G, 'cleanse'), null);
    assert.strictEqual(F.temple.upgrade(G, 'cleanse').reason, 'max_level');
    // 레벨업으로 해금되면(skillLevels 에 없어도) 1레벨로 보고 올릴 수 있다
    G.player.level = 2; G.player.gold = 150;
    assert.ok(F.temple.upgrade(G, 'buff_def').ok); assert.strictEqual(G.player.skillLevels.buff_def, 2);
    const list = F.temple.skills(G);
    assert.strictEqual(list.length, ctx.Skills.priest().length);
    assert.ok(list.find((s) => s.id === 'heal_basic').level === 3 && list.find((s) => s.id === 'aoe_2').unlocked === false);
  },

  '모험가 사무소: 하루 6명(플레이어 ±2 레벨, 날짜 시드로 결정적), 고용 골드 차감·4명 제한, 해고, day 바뀌면 새 후보, board 는 마을 의뢰'(assert) {
    const { ctx, G, F } = boot(100000);
    G.player.level = 5;
    const c = F.adventurer.candidates(G);
    assert.strictEqual(c.length, 6);
    for (const m of c) { assert.ok(m.level >= 3 && m.level <= 7, `레벨 ${m.level}`); assert.strictEqual(m.hireCost, 100 + m.level * 40); assert.ok(m.name && m.cls && m.role); }
    assert.ok(c.some((m) => m.role === 'tank') && c.some((m) => m.role === 'ranged'), '탱커·원딜 보장');
    const G2 = ctx.State.newGame('둘'); G2.player.level = 5;
    same(assert, F.adventurer.candidates(G2).map((m) => [m.name, m.cls, m.level]), c.map((m) => [m.name, m.cls, m.level]), '같은 날 같은 후보');
    assert.strictEqual(F.adventurer.candidates(G), c, '같은 날엔 다시 만들지 않음');
    const first = c[0], cost = first.hireCost;
    G.player.gold = cost - 1;
    assert.strictEqual(F.adventurer.hire(G, first.uid).reason, 'gold');
    G.player.gold = 100000;
    const h = F.adventurer.hire(G, first.uid);
    assert.ok(h.ok && h.member === first); assert.strictEqual(G.player.gold, 100000 - cost);
    assert.strictEqual(F.adventurer.candidates(G).length, 5, '고용한 사람은 후보에서 빠짐');
    assert.strictEqual(F.adventurer.hire(G, first.uid).reason, 'not_found');
    for (const m of F.adventurer.candidates(G).slice(0, 3)) assert.ok(F.adventurer.hire(G, m.uid).ok);
    assert.strictEqual(G.party.length, 4);
    assert.strictEqual(F.adventurer.hire(G, F.adventurer.candidates(G)[0].uid).reason, 'party_full');
    same(assert, F.adventurer.dismiss(G, first.uid), { ok: true, member: first, returnedToGuild: false });
    assert.strictEqual(G.party.length, 3);
    assert.strictEqual(F.adventurer.dismiss(G, first.uid).reason, 'not_found');
    G.day = 2;
    const next = F.adventurer.candidates(G);
    assert.strictEqual(next.length, 6); assert.notDeepStrictEqual(next.map((m) => m.name), c.map((m) => m.name));
    const board = F.adventurer.board(G);
    assert.ok(board.length > 0 && board.every((q) => q.type === 'village'));
  },

  '길드: NPC 길드 3개(고정 4명), 가입 레벨 조건, recruit 로 영입(무료·명부↔파티 이동), 해고하면 명부로, 탈퇴 시 길드원 제거, 창설 1000골드'(assert) {
    const { ctx, G, F } = boot(0);
    const list = F.guild.list(G);
    assert.strictEqual(list.length, 3);
    for (const g of list) { assert.strictEqual(g.members.length, 4); assert.ok(g.members.some((m) => m.role === 'tank')); assert.ok(!g.joined); }
    same(assert, F.guild.list(G).map((g) => g.members.map((m) => m.name)), list.map((g) => g.members.map((m) => m.name)), '명단은 고정');
    assert.strictEqual(F.guild.join(G, 'guild_grey_watch').reason, 'level');
    assert.strictEqual(F.guild.join(G, 'nope').reason, 'unknown');
    assert.strictEqual(F.guild.recruit(G, 'x').reason, 'no_guild');
    const j = F.guild.join(G, 'guild_oak_shield');
    assert.ok(j.ok); assert.strictEqual(G.guild.id, 'guild_oak_shield'); assert.strictEqual(G.guild.isOwner, false); assert.strictEqual(G.guild.members.length, 4);
    assert.strictEqual(F.guild.join(G, 'guild_moon_blade').reason, 'in_guild');
    assert.ok(F.guild.list(G)[0].joined);
    const tank = G.guild.members.find((m) => m.role === 'tank');
    const r = F.guild.recruit(G, tank.uid);
    assert.ok(r.ok); assert.strictEqual(G.player.gold, 0, '길드원 영입은 무료'); assert.strictEqual(G.party.length, 1); assert.strictEqual(G.guild.members.length, 3);
    assert.strictEqual(G.party[0].guildId, 'guild_oak_shield');
    assert.strictEqual(F.guild.roster(G).length, 4, '명부 + 파티 = 4명');
    assert.strictEqual(F.guild.recruit(G, tank.uid).reason, 'not_found');
    const d = F.adventurer.dismiss(G, tank.uid);
    assert.ok(d.ok && d.returnedToGuild); assert.strictEqual(G.guild.members.length, 4); assert.strictEqual(G.party.length, 0);
    for (const m of G.guild.members.slice()) F.guild.recruit(G, m.uid);
    assert.strictEqual(G.party.length, 4);
    ctx.Party.add(G, ctx.Party.generateMember(ctx.RNG.make(1), 1));
    const lv = F.guild.leave(G);
    assert.ok(lv.ok); assert.strictEqual(lv.removed.length, 4); assert.strictEqual(G.guild, null); assert.strictEqual(G.party.length, 0, '길드원 전원 이탈');
    assert.strictEqual(F.guild.leave(G).reason, 'no_guild');
    // 창설
    assert.strictEqual(F.guild.create(G, '빛의 손').reason, 'gold');
    G.player.gold = 1000;
    assert.strictEqual(F.guild.create(G, '   ').reason, 'bad_name');
    assert.strictEqual(F.guild.create(G, '이름이너무길어서안되는길드이름').reason, 'bad_name');
    const c = F.guild.create(G, '빛의 손');
    assert.ok(c.ok); assert.strictEqual(G.player.gold, 0); assert.strictEqual(G.guild.name, '빛의 손'); assert.ok(G.guild.isOwner); assert.strictEqual(G.guild.level, 1);
    assert.strictEqual(F.guild.create(G, '다른 길드').reason, 'in_guild');
    // 내 길드에 파티원 등록 → 해고해도 명부에 남고 다시 영입
    const m = ctx.Party.generateMember(ctx.RNG.make(2), 1); ctx.Party.add(G, m);
    assert.ok(F.guild.enlist(G, m.uid).ok); assert.strictEqual(F.guild.enlist(G, m.uid).reason, 'already_member');
    assert.ok(F.adventurer.dismiss(G, m.uid).returnedToGuild); assert.strictEqual(G.guild.members[0], m);
    assert.ok(F.guild.recruit(G, m.uid).ok); assert.strictEqual(G.party[0], m);
  },

  '시설 id/이름과 visit 이벤트 ; 다른 모듈이 없어도 안전하게 실패한다'(assert) {
    const { ctx, G, F } = boot(100);
    same(assert, F.IDS, ['shop', 'auction', 'bank', 'smithy', 'inn', 'engraver', 'temple', 'adventurer', 'guild']);
    const seen = []; ctx.Events.on('facility_visit', (p) => seen.push(p.id));
    F.visit('inn'); same(assert, seen, ['inn']);
    assert.strictEqual(F.NAMES.adventurer, '모험가 사무소');
    const bare = load(['core/rng.js', 'core/events.js', 'core/state.js', 'core/facilities.js']);
    const B = bare.State.newGame('x');
    assert.strictEqual(bare.Facilities.adventurer.candidates(B).length, 0);
    assert.strictEqual(bare.Facilities.guild.list(B).length, 0);
    assert.strictEqual(bare.Facilities.temple.cost(B, 'heal_basic'), null);
    assert.strictEqual(bare.Facilities.adventurer.board(B).length, 0);
    assert.ok(bare.Facilities.inn.sleep(B).ok, 'Party/Quests 없이도 숙박은 된다');
    B.player.gold = 1000;
    assert.strictEqual(bare.Facilities.engraver.engrave(B, 'eng_int').reason, 'materials', 'Inventory 없음 = 재료 없음');
    assert.strictEqual(bare.Facilities.bank.deposit(B, 'x').reason, 'not_found');
  },
};
