// 마을 시설 — DESIGN.md §5
// 잡화점·경매장·은행·대장간·여관·각인소·신전·모험가 사무소·길드. 골드/아이템을 실제로 주고받는 곳은 여기뿐이다.
// 모든 동작은 { ok, reason?, ... } 를 돌려줘 UI 가 실패 이유를 토스트로 띄울 수 있게 한다.
// 다른 모듈(Items/Inventory/Economy/Skills/Level/Party/Quests)은 DESIGN 계약으로만 부르고, 없으면 안전하게 실패한다.
const Facilities = (() => {
  const IDS = ['shop', 'auction', 'bank', 'smithy', 'inn', 'engraver', 'temple', 'adventurer', 'guild'];
  const NAMES = { shop: '잡화점', auction: '경매장', bank: '은행', smithy: '대장간', inn: '여관', engraver: '각인소', temple: '신전', adventurer: '모험가 사무소', guild: '길드' };

  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (reason, extra) => Object.assign({ ok: false, reason }, extra || {});
  const emit = (name, payload) => { if (typeof Events !== 'undefined') Events.emit(name, payload); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hasItems = () => typeof Items !== 'undefined';
  const hasInv = () => typeof Inventory !== 'undefined';
  const def = (id) => (hasItems() ? Items.get(id) : null);
  const rngOf = (rng) => rng || (typeof RNG !== 'undefined' ? RNG.global() : null);

  // ---- 골드 ----
  const gold = (G) => (G.player.gold || 0);
  function spend(G, n) {
    if (gold(G) < n) return false;
    G.player.gold = gold(G) - n;
    emit('gold_changed', { gold: G.player.gold, delta: -n });
    return true;
  }
  function earn(G, n) {
    G.player.gold = gold(G) + n;
    emit('gold_changed', { gold: G.player.gold, delta: n });
  }
  // 가방 아이템 찾기(장착품 제외). 시설은 가방에 든 것만 다룬다.
  function inBag(G, id) {
    if (!hasInv()) return null;
    const loc = Inventory.locate(G, id);
    return loc && loc.where === 'bag' ? loc.inst : null;
  }
  // 가방에 못 넣으면 은행장이 대신 받는다(퀘스트 보상과 같은 규칙) — 결과물이 사라지지 않게
  function deliver(G, inst) {
    if (hasInv() && Inventory.add(G, inst)) return false;
    if (!G.bank) G.bank = { items: [], gold: 0, size: 60 };
    G.bank.items.push(inst);
    return true;
  }
  // 재료 보유 확인 → 부족한 재료 id. Inventory 가 없으면 재료 없음으로 본다.
  function missingMaterial(G, materials) {
    for (const [id, q] of Object.entries(materials || {})) if (!hasInv() || Inventory.count(G, id) < q) return id;
    return null;
  }
  function consumeMaterials(G, materials) {
    for (const [id, q] of Object.entries(materials || {})) Inventory.consume(G, id, q);
  }
  function visit(id) { emit('facility_visit', { id }); }

  // ================= 잡화점 =================
  const SHOP_MATERIALS = ['thread', 'leather', 'iron_scrap', 'wood', 'herb'];
  // 수습 사제가 탑에 들어가기 전에 갖출 수 있는 기본 장비(일반 등급)
  const SHOP_EQUIP = ['staff_wood_two', 'wand_wood', 'book_prayer', 'cloth_body_1', 'cloth_boots_1', 'cloth_gloves_1', 'cloth_hat_1', 'cloth_belt_1', 'bag_s'];
  const shop = (() => {
    const entry = (d) => ({ id: d.id, name: d.name, icon: d.icon, kind: d.kind, price: Economy.buyPrice(d), currency: Economy.currency(d), def: d });
    function stock() {
      if (!hasItems()) return [];
      const out = Items.consumables().filter((d) => d.shop !== false && Economy.currency(d) === 'gold').map(entry);
      for (const id of SHOP_MATERIALS.concat(SHOP_EQUIP)) { const d = def(id); if (d) out.push(entry(d)); }
      return out;
    }
    function buy(G, itemId, qty = 1, rng) {
      const e = stock().find((s) => s.id === itemId); if (!e) return fail('not_sold');
      const n = e.kind === 'equip' ? 1 : Math.max(0, qty | 0); if (!n) return fail('bad_qty');
      const cost = e.price * n; if (gold(G) < cost) return fail('gold', { cost });
      const inst = e.kind === 'equip' ? Items.generate({ id: itemId, grade: 'common', rng: rngOf(rng) }) : Items.make(itemId, n);
      if (!hasInv() || !Inventory.add(G, inst)) return fail('bag_full');
      spend(G, cost);
      emit('shop_bought', { id: itemId, qty: n, cost, item: inst });
      return ok({ item: inst, cost });
    }
    function sell(G, itemUid, qty) {
      const inst = inBag(G, itemUid); if (!inst) return fail('not_found');
      const total = Economy.sellPrice(inst); if (total <= 0) return fail('unsellable');
      const have = inst.qty || 1, n = qty == null ? have : Math.min(have, qty | 0); if (n <= 0) return fail('bad_qty');
      const unit = total / have;              // sellPrice 는 단가×수량이라 나누면 정수
      const removed = Inventory.remove(G, itemUid, n), got = Math.floor(unit * removed);
      earn(G, got);
      emit('shop_sold', { id: inst.id, qty: removed, gold: got });
      return ok({ gold: got, qty: removed });
    }
    return { stock, buy, sell, SHOP_EQUIP, SHOP_MATERIALS };
  })();

  // ================= 경매장 =================
  // 현실 시간 1시간(hourIndex)마다 같은 시드로 목록이 돌아 모든 플레이어가 같은 매물을 본다. 리셋권은 같은 시간 안에서 다른 시드.
  const HOUR = 3600000, MINUTE = 60000;
  const AUCTION = { MIN: 12, MAX: 20, PRIEST_RATE: 0.5, MATERIAL_RATE: 0.15, FAIR_MAX: 1.2, SELL_CHANCE: 0.15, MAX_MINE: 8, MAX_TICK_MINUTES: 240, HISTORY: 20 };
  const MATERIAL_LOTS = { forest: ['magic_powder', 'spider_silk', 'monster_tooth', 'herb', 'leather'], cave: ['crystal', 'moonstone', 'holy_water', 'magic_powder', 'spider_silk'] };
  const auction = (() => {
    function A(G) {
      const a = G.auction || (G.auction = { hourIndex: 0, listings: [], mine: [], resetTickets: 1 });
      if (!Array.isArray(a.listings)) a.listings = [];
      if (!Array.isArray(a.mine)) a.mine = [];
      if (!Array.isArray(a.sold)) a.sold = [];
      if (!(a.resets >= 0)) a.resets = 0;
      return a;
    }
    const hourIndex = (now) => Math.floor((typeof now === 'number' ? now : Date.now()) / HOUR);
    // 층 진행도: 도전 가능한 최고 층 기준으로 매물 티어·등급이 올라간다
    const progressFloor = (G) => clamp(((G.tower && G.tower.highestCleared) || 0) + 1, 1, 10);
    const seedFor = (hour, resets) => (resets ? RNG.hash(`auction:${hour}:${resets}`) : hour);
    const fairPrice = (inst) => Economy.buyPrice(inst) * (inst.qty || 1);

    function materialLot(rng, floor) {
      const inst = Items.make(rng.pick(floor >= 6 ? MATERIAL_LOTS.cave : MATERIAL_LOTS.forest), rng.int(3, 10));
      return inst && { uid: inst.uid, item: inst, price: Math.max(1, Math.round(fairPrice(inst) * rng.float(0.9, 1.2))) };
    }
    function equipLot(rng, floor) {
      const opts = { floor: clamp(floor + rng.int(-2, 1), 1, 10), rng };
      if (rng.chance(AUCTION.PRIEST_RATE)) opts.cls = 'priest';
      const inst = Items.generate(opts);
      return inst && { uid: inst.uid, item: inst, price: Math.max(1, Math.round(fairPrice(inst) * rng.float(0.8, 1.3))) };
    }
    function regenerate(G, now) {
      const a = A(G), hour = hourIndex(now);
      const rng = RNG.make(seedFor(hour, a.resets)), floor = progressFloor(G);
      const n = rng.int(AUCTION.MIN, AUCTION.MAX), listings = [];
      for (let i = 0; i < n && hasItems(); i++) {
        const lot = rng.chance(AUCTION.MATERIAL_RATE) ? materialLot(rng, floor) : equipLot(rng, floor);
        if (lot) listings.push(lot);
      }
      a.hourIndex = hour; a.generated = true; a.listings = listings;
      emit('auction_refreshed', { hourIndex: hour, count: listings.length });
      return listings;
    }
    function listings(G, now) {
      const a = A(G);
      if (a.hourIndex !== hourIndex(now) || !a.generated) { a.resets = 0; regenerate(G, now); }
      return a.listings;
    }
    function buy(G, lotUid, now) {
      const a = A(G), list = listings(G, now);
      const lot = list.find((l) => l.uid === lotUid); if (!lot) return fail('not_found');
      if (gold(G) < lot.price) return fail('gold', { cost: lot.price });
      const inst = clone(lot.item);
      if (!hasInv() || !Inventory.add(G, inst)) return fail('bag_full');
      spend(G, lot.price);
      a.listings = list.filter((l) => l !== lot);
      emit('auction_bought', { item: inst, price: lot.price });
      return ok({ item: inst, price: lot.price });
    }
    function list(G, itemUid, price, now) {
      const a = A(G);
      if (a.mine.length >= AUCTION.MAX_MINE) return fail('full', { max: AUCTION.MAX_MINE });
      const inst = inBag(G, itemUid); if (!inst) return fail('not_found');
      const p = Math.floor(price); if (!(p > 0)) return fail('bad_price');
      if (Economy.sellPrice(inst) <= 0) return fail('unsellable');
      Inventory.remove(G, itemUid);
      const t = typeof now === 'number' ? now : Date.now();
      const entry = { uid: inst.uid, item: inst, price: p, listedAt: t, checkedAt: t, fair: fairPrice(inst) };
      a.mine.push(entry);
      emit('auction_listed', { item: inst, price: p });
      return ok({ listing: entry });
    }
    // 적정가(구매가)의 1.2배 이하로 내놓은 물건만 팔린다 — 바가지는 영원히 안 팔림
    const isFair = (entry) => entry.price <= entry.fair * AUCTION.FAIR_MAX;
    function sellMine(G, a, entry, now) {
      earn(G, entry.price);
      a.sold.unshift({ item: entry.item, price: entry.price, soldAt: now });
      a.sold = a.sold.slice(0, AUCTION.HISTORY);
      emit('auction_sold', { item: entry.item, price: entry.price });
    }
    // 지난 분(分)마다 15% 확률로 팔린다. 오래 떠나 있었어도 240분까지만 굴려 호출이 무거워지지 않게 한다.
    function tick(G, now, rng) {
      const a = A(G), t = typeof now === 'number' ? now : Date.now(), r = rngOf(rng), sold = [];
      for (const entry of a.mine.slice()) {
        const minutes = Math.min(AUCTION.MAX_TICK_MINUTES, Math.floor((t - entry.checkedAt) / MINUTE));
        if (minutes <= 0) continue;
        entry.checkedAt += minutes * MINUTE;
        if (!isFair(entry)) continue;
        for (let i = 0; i < minutes; i++) {
          if (!r.chance(AUCTION.SELL_CHANCE)) continue;
          sellMine(G, a, entry, t); a.mine = a.mine.filter((e) => e !== entry); sold.push(entry);
          break;
        }
      }
      return ok({ sold });
    }
    function cancel(G, lotUid) {
      const a = A(G), entry = a.mine.find((e) => e.uid === lotUid); if (!entry) return fail('not_found');
      if (!hasInv() || !Inventory.add(G, entry.item)) return fail('bag_full');
      a.mine = a.mine.filter((e) => e !== entry);
      return ok({ item: entry.item });
    }
    function reset(G, now) {
      const a = A(G);
      if (!(a.resetTickets > 0)) return fail('no_ticket');
      a.resetTickets--; a.resets++; a.hourIndex = hourIndex(now);
      return ok({ listings: regenerate(G, now), resetTickets: a.resetTickets });
    }
    const mine = (G) => A(G).mine;
    const history = (G) => A(G).sold;
    return { listings, buy, list, tick, cancel, reset, mine, history, hourIndex, isFair, fairPrice, progressFloor, CONFIG: AUCTION };
  })();

  // ================= 은행 =================
  const bank = (() => {
    const B = (G) => { const b = G.bank || (G.bank = { items: [], gold: 0, size: 60 }); if (!Array.isArray(b.items)) b.items = []; return b; };
    function deposit(G, itemUid) {
      const b = B(G), inst = inBag(G, itemUid); if (!inst) return fail('not_found');
      if (b.items.length >= b.size) return fail('bank_full', { size: b.size });
      Inventory.remove(G, itemUid);
      b.items.push(inst);
      emit('bank_changed', { action: 'deposit', item: inst });
      return ok({ item: inst });
    }
    function withdraw(G, itemUid) {
      const b = B(G), i = b.items.findIndex((it) => it && it.uid === itemUid); if (i < 0) return fail('not_found');
      const inst = b.items[i];
      if (!hasInv() || !Inventory.add(G, inst)) return fail('bag_full');
      b.items.splice(i, 1);
      emit('bank_changed', { action: 'withdraw', item: inst });
      return ok({ item: inst });
    }
    function depositGold(G, n) {
      const b = B(G), amt = Math.floor(n); if (!(amt > 0)) return fail('bad_amount');
      if (!spend(G, amt)) return fail('gold');
      b.gold += amt;
      emit('bank_changed', { action: 'deposit_gold', amount: amt });
      return ok({ gold: gold(G), bank: b.gold });
    }
    function withdrawGold(G, n) {
      const b = B(G), amt = Math.floor(n); if (!(amt > 0)) return fail('bad_amount');
      if (b.gold < amt) return fail('bank_gold', { bank: b.gold });
      b.gold -= amt; earn(G, amt);
      emit('bank_changed', { action: 'withdraw_gold', amount: amt });
      return ok({ gold: gold(G), bank: b.gold });
    }
    const items = (G) => B(G).items;
    const capacity = (G) => ({ used: B(G).items.length, size: B(G).size, gold: B(G).gold });
    return { deposit, withdraw, depositGold, withdrawGold, items, capacity };
  })();

  // ================= 대장간 =================
  const smithy = (() => {
    const isEquip = (inst) => { const d = def(inst && inst.id); return !!d && d.kind === 'equip'; };
    // 수리 대상: 가방 + 장착 중인 장비 전부
    const allEquip = (G) => (hasInv() ? Inventory.items(G).concat(Inventory.equipped(G).map((e) => e.inst)) : []).filter(isEquip);
    const fix = (inst) => { inst.durability = inst.maxDurability; };
    function repair(G, itemUid) {
      const inst = hasInv() ? Inventory.find(G, itemUid) : null; if (!inst) return fail('not_found');
      if (!isEquip(inst)) return fail('not_equip');
      const cost = Economy.repairCost(inst); if (!cost) return fail('not_damaged');
      if (!spend(G, cost)) return fail('gold', { cost });
      fix(inst);
      emit('item_repaired', { uid: inst.uid, id: inst.id, cost });
      return ok({ cost, item: inst });
    }
    function repairAll(G) {
      const damaged = allEquip(G).filter((it) => Economy.repairCost(it) > 0);
      if (!damaged.length) return fail('not_damaged');
      const cost = damaged.reduce((s, it) => s + Economy.repairCost(it), 0);
      if (!spend(G, cost)) return fail('gold', { cost });
      damaged.forEach(fix);
      emit('item_repaired', { uid: null, id: null, cost, count: damaged.length });
      return ok({ cost, count: damaged.length });
    }
    function disassemble(G, itemUid, rng) {
      const inst = inBag(G, itemUid); if (!inst) return fail('not_found');
      if (!isEquip(inst)) return fail('not_equip');
      const materials = Economy.disassemble(inst, rngOf(rng));
      Inventory.remove(G, itemUid);       // 먼저 빼서 재료가 들어갈 칸을 만든다
      const toBank = materials.filter((m) => deliver(G, m));
      emit('item_disassembled', { id: inst.id, materials });
      return ok({ materials, toBank });
    }
    function craft(G, recipeId, rng) {
      const recipe = hasItems() ? Items.recipe(recipeId) : null; if (!recipe) return fail('no_recipe');
      const chk = Economy.canCraft(G, recipe); if (!chk.ok) return fail(chk.reason, { missing: chk.missing, cost: recipe.gold });
      const rd = def(recipe.result); if (!rd) return fail('no_recipe');
      consumeMaterials(G, recipe.materials);
      spend(G, recipe.gold || 0);
      const item = rd.kind === 'equip' ? Items.generate({ id: rd.id, grade: recipe.grade, rng: rngOf(rng) }) : Items.make(rd.id, recipe.qty || 1);
      const toBank = deliver(G, item);
      emit('item_crafted', { recipeId, item, toBank });
      return ok({ item, toBank, cost: recipe.gold || 0 });
    }
    // UI 미리보기용: 레시피별 제작 가능 여부
    const recipes = (G) => (hasItems() ? Items.recipes() : []).map((r) => Object.assign({ can: Economy.canCraft(G, r) }, r));
    return { repair, repairAll, disassemble, craft, recipes, allEquip };
  })();

  // ================= 여관 =================
  // 피로 회복량은 여관 메뉴가 정한다(가방에서 먹는 같은 음식은 Items 의 -20). 버프는 Items 정의를 따른다.
  const MENU = [
    { id: 'food_bread', name: '보리빵', icon: '🍞', price: 20, fatigue: -20, buff: { stat: 'vit', value: 0.1, duration: 600 } },
    { id: 'food_pie', name: '숲 열매 파이', icon: '🥧', price: 35, fatigue: -35, buff: { stat: 'agi', value: 0.1, duration: 600 } },
    { id: 'food_stew', name: '사슴 고기 스튜', icon: '🍲', price: 45, fatigue: -50, buff: { stat: 'int', value: 0.1, duration: 600 } },
  ];
  const SLEEP_COST = 50;
  const STAT_KO = { vit: '체력', agi: '민첩', int: '지능', str: '힘', def: '방어력', sta: '지구력' };
  const inn = (() => {
    function menu() {
      return MENU.map((m) => {
        const d = def(m.id), buff = (d && d.effect && d.effect.buff) || m.buff;
        const e = Object.assign({}, m, d ? { name: d.name, icon: d.icon, price: d.price } : {}, { buff });
        e.desc = `피로 ${m.fatigue}. ${Math.round(buff.duration / 60)}분 동안 ${STAT_KO[buff.stat] || buff.stat} +${Math.round(buff.value * 100)}%.`;
        return e;
      });
    }
    function applyBuff(p, id, buff, now) {
      if (!Array.isArray(p.buffs)) p.buffs = [];
      p.buffs = p.buffs.filter((b) => b.id !== id);   // 같은 음식은 갱신
      const b = { id, stat: buff.stat, value: buff.value, until: now + buff.duration };
      p.buffs.push(b);
      return b;
    }
    function eat(G, foodId, now) {
      const m = menu().find((x) => x.id === foodId); if (!m) return fail('unknown');
      if (!spend(G, m.price)) return fail('gold', { cost: m.price });
      const p = G.player;
      p.fatigue = clamp((p.fatigue || 0) + m.fatigue, 0, 100);
      const buff = applyBuff(p, m.id, m.buff, typeof now === 'number' ? now : (G.playTime || 0));
      emit('meal_eaten', { id: m.id, fatigue: p.fatigue, buff });
      return ok({ fatigue: p.fatigue, buff, cost: m.price });
    }
    function restoreAll(G) {
      if (typeof Party !== 'undefined' && Party.heal) { Party.heal(G); return; }
      if (typeof Stats === 'undefined') return;
      const d = Stats.derive(G.player, G); G.player.hp = d.maxHp; G.player.mp = d.maxMp;
    }
    function sleep(G) {
      if (!spend(G, SLEEP_COST)) return fail('gold', { cost: SLEEP_COST });
      G.player.fatigue = 0;
      G.day = (G.day || 1) + 1;
      restoreAll(G);
      if (typeof Quests !== 'undefined' && Quests.dailyRefresh) Quests.dailyRefresh(G);
      emit('day_passed', { day: G.day });
      return ok({ day: G.day, cost: SLEEP_COST });
    }
    return { menu, eat, sleep, SLEEP_COST };
  })();

  // ================= 각인소 =================
  // 스탯 각인은 Stats.derive 가 접사처럼 더한다(퍼센트형은 정수 %). 특수 각인은 derive().specials 로 전투(Combat)에 전달된다.
  const ENGRAVINGS = [
    { id: 'eng_int', name: '지혜의 각인', stat: 'int', value: 6, cost: 300, materials: { magic_powder: 2 }, desc: '지능 +6.' },
    { id: 'eng_vit', name: '생명의 각인', stat: 'vit', value: 6, cost: 300, materials: { herb: 3, leather: 1 }, desc: '체력 +6.' },
    { id: 'eng_def', name: '바위의 각인', stat: 'def', value: 5, cost: 300, materials: { iron_scrap: 3 }, desc: '방어력 +5.' },
    { id: 'eng_heal', name: '빛의 각인', stat: 'heal_power', value: 6, cost: 500, materials: { holy_water: 1, magic_powder: 2 }, desc: '힐량 +6%.' },
    { id: 'eng_cast', name: '바람의 각인', stat: 'cast_speed', value: 6, cost: 500, materials: { spider_silk: 2, magic_powder: 2 }, desc: '시전 시간 -6%.' },
    { id: 'eng_regen', name: '샘의 각인', stat: 'mp_regen', value: 1.5, cost: 450, materials: { crystal: 1, herb: 2 }, desc: '초당 마나 회복 +1.5.' },
    { id: 'eng_guard', name: '수호의 각인', special: { id: 'guard', chance: 0.2, value: 0.3, duration: 5 }, cost: 900, materials: { iron_scrap: 4, holy_water: 1 }, desc: '피격 시 20% 확률로 5초간 방어력 +30%.' },
    { id: 'eng_evade', name: '그림자 각인', special: { id: 'evade', chance: 0.2 }, cost: 900, materials: { spider_silk: 3, magic_powder: 2 }, desc: '20% 확률로 공격을 피한다.' },
    { id: 'eng_holy_crit', name: '성광의 각인', special: { id: 'heal_crit', chance: 0.1, value: 1.5 }, cost: 1200, materials: { holy_water: 2, moonstone: 1 }, desc: '힐이 10% 확률로 1.5배가 된다.' },
    { id: 'eng_mana_back', name: '샘솟는 각인', special: { id: 'mana_refund', chance: 0.1 }, cost: 1200, materials: { crystal: 2, moonstone: 1 }, desc: '시전 후 10% 확률로 마나를 돌려받는다.' },
  ];
  const ERASE_COST = 100;
  const engraver = (() => {
    const E = (G) => { if (!Array.isArray(G.player.engravings)) G.player.engravings = []; return G.player.engravings; };
    const maxSlots = (G) => 3 + Math.floor((G.player.level || 1) / 10);
    const get = (id) => ENGRAVINGS.find((e) => e.id === id) || null;
    const owned = (G, id) => E(G).filter((e) => e.id === id).length;
    function options(G) {
      return ENGRAVINGS.map((e) => Object.assign({}, e, {
        owned: owned(G, e.id), affordable: gold(G) >= e.cost && !missingMaterial(G, e.materials), missing: missingMaterial(G, e.materials),
      }));
    }
    function engrave(G, id) {
      const e = get(id); if (!e) return fail('unknown');
      const list = E(G), max = maxSlots(G);
      if (list.length >= max) return fail('slots_full', { max });
      if (e.special && owned(G, id)) return fail('duplicate');   // 특수 각인은 하나씩만(확률이 겹치지 않게)
      if (gold(G) < e.cost) return fail('gold', { cost: e.cost });
      const missing = missingMaterial(G, e.materials); if (missing) return fail('materials', { missing });
      consumeMaterials(G, e.materials);
      spend(G, e.cost);
      const engraving = e.special ? { id: e.id, special: clone(e.special) } : { id: e.id, stat: e.stat, value: e.value };
      list.push(engraving);
      emit('engraved', { id: e.id, engraving, used: list.length, max });
      return ok({ engraving, used: list.length, max });
    }
    // 각인 지우기(인덱스). 싸게 받아 조합을 바꿔 볼 수 있게 한다.
    function erase(G, index) {
      const list = E(G); if (!(index >= 0 && index < list.length)) return fail('not_found');
      if (!spend(G, ERASE_COST)) return fail('gold', { cost: ERASE_COST });
      const [removed] = list.splice(index, 1);
      emit('engraved', { id: removed.id, engraving: null, used: list.length, max: maxSlots(G) });
      return ok({ removed, cost: ERASE_COST });
    }
    return { options, engrave, erase, maxSlots, get, ENGRAVINGS, ERASE_COST };
  })();

  // ================= 신전 =================
  const temple = (() => {
    const skillDef = (id) => (typeof Skills !== 'undefined' ? Skills.get(id) : null);
    // 해금 전이면 0. Level 이 있으면 해금 여부를 레벨로 판단한다.
    function level(G, id) {
      if (typeof Level !== 'undefined' && Level.skillLevel) return Level.skillLevel(G, id);
      return (G.player.skillLevels || {})[id] || 0;
    }
    function cost(G, skillId) {
      const d = skillDef(skillId); if (!d || d.owner !== 'priest') return null;
      const lv = level(G, skillId); if (!lv) return null;
      return Skills.upgradeCost(skillId, lv);
    }
    function upgrade(G, skillId) {
      const d = skillDef(skillId); if (!d || d.owner !== 'priest') return fail('unknown');
      const lv = level(G, skillId); if (!lv) return fail('locked', { unlockLevel: d.unlockLevel });
      const c = Skills.upgradeCost(skillId, lv); if (c == null) return fail('max_level', { level: lv });
      if (!spend(G, c)) return fail('gold', { cost: c });
      if (!G.player.skillLevels) G.player.skillLevels = {};
      G.player.skillLevels[skillId] = lv + 1;
      emit('skill_upgraded', { id: skillId, level: lv + 1, cost: c });
      return ok({ level: lv + 1, cost: c });
    }
    // UI 목록: 해금 순서대로 레벨·다음 비용
    function skills(G) {
      if (typeof Skills === 'undefined') return [];
      return Skills.priest().map((d) => { const lv = level(G, d.id); return { id: d.id, name: d.name, level: lv, unlocked: lv > 0, unlockLevel: d.unlockLevel, maxLevel: d.maxLevel, cost: lv ? Skills.upgradeCost(d.id, lv) : null, desc: d.desc }; });
    }
    return { cost, upgrade, skills };
  })();

  // ================= 모험가 사무소 =================
  const CANDIDATES_PER_DAY = 6;
  const adventurer = (() => {
    const AD = (G) => { const a = G.adventurer || (G.adventurer = { day: 0, candidates: [] }); if (!Array.isArray(a.candidates)) a.candidates = []; return a; };
    // 날짜 시드라 하루 안에서는 저장/불러오기 후에도 같은 후보. 탱커 1명·원딜 1명은 보장해 첫 파티가 굴러가게 한다.
    function generate(G, day) {
      if (typeof Party === 'undefined') return [];
      const rng = RNG.make(RNG.hash('adventurer:' + day));
      const base = G.player.level || 1;
      const forced = [{ cls: rng.pick(['warrior', 'monk']), role: 'tank' }, { cls: rng.pick(['mage', 'hunter']) }];
      const out = [];
      for (let i = 0; i < CANDIDATES_PER_DAY; i++) out.push(Party.generateMember(rng, clamp(base + rng.int(-2, 2), 1, 40), forced[i] || {}));
      return out;
    }
    function candidates(G) {
      const a = AD(G), day = G.day || 1;
      if (a.day !== day) { a.day = day; a.candidates = generate(G, day); emit('candidates_refreshed', { day, count: a.candidates.length }); }
      return a.candidates;
    }
    function hire(G, candUid) {
      const a = AD(G), cand = candidates(G).find((c) => c.uid === candUid); if (!cand) return fail('not_found');
      if (Party.isFull(G)) return fail('party_full', { max: Party.MAX });
      if (!spend(G, cand.hireCost)) return fail('gold', { cost: cand.hireCost });
      a.candidates = a.candidates.filter((c) => c !== cand);
      Party.add(G, cand);
      return ok({ member: cand, cost: cand.hireCost });
    }
    // 길드 소속 파티원은 해고해도 길드 명부로 돌아간다(언제든 다시 영입)
    function dismiss(G, memberUid) {
      const m = typeof Party !== 'undefined' ? Party.remove(G, memberUid) : null; if (!m) return fail('not_found');
      const returned = !!(m.guildId && G.guild && G.guild.id === m.guildId);
      if (returned) G.guild.members.push(m);
      return ok({ member: m, returnedToGuild: returned });
    }
    const board = (G) => (typeof Quests !== 'undefined' && Quests.available ? Quests.available(G).filter((d) => d.type === 'village') : []);
    return { candidates, hire, dismiss, board, CANDIDATES_PER_DAY };
  })();

  // ================= 길드 =================
  // NPC 길드 3개는 고정 명단. 가입하면 명단이 G.guild.members 로 복사되고, recruit 로 파티에 넣는다(한 사람은 명부·파티 중 한 곳에만 있다).
  const GUILD_COST = 1000, GUILD_NAME_MAX = 12;
  const NPC_GUILDS = [
    { id: 'guild_oak_shield', name: '참나무 방패단', level: 1, levelReq: 1, memberLevel: 3, desc: '라일라 마을 자경단에서 시작한 길드. 초보 모험가를 반긴다.',
      roster: [{ cls: 'warrior', role: 'tank', name: '강우', gender: 'm', personality: '방패를 먼저 들고 말은 나중에 한다.' }, { cls: 'hunter', name: '다은', gender: 'f', personality: '화살 하나도 허투루 쓰지 않는다.' },
        { cls: 'rogue', name: '태오', gender: 'm', personality: '보물 상자 냄새를 맡는다고 주장한다.' }, { cls: 'mage', name: '세린', gender: 'f', personality: '주문서를 늘 품에 안고 다닌다.' }] },
    { id: 'guild_moon_blade', name: '달빛 칼날', level: 2, levelReq: 6, memberLevel: 9, desc: '달빛 폭포에서 결성된 중견 길드. 빠르고 정확한 사냥을 자랑한다.',
      roster: [{ cls: 'monk', role: 'tank', name: '백호', gender: 'm', personality: '맨주먹으로 바위를 깬 적이 있다고 한다.' }, { cls: 'spellblade', name: '해인', gender: 'f', personality: '검과 마법 중 뭐가 먼저인지 늘 고민한다.' },
        { cls: 'mage', name: '도현', gender: 'm', personality: '눈보라를 부르고 자기도 춥다고 한다.' }, { cls: 'priest', name: '라온', gender: 'f', personality: '동료 힐러에게 기도문을 가르쳐 준다.' }] },
    { id: 'guild_grey_watch', name: '잿빛 파수대', level: 3, levelReq: 12, memberLevel: 15, desc: '잿빛 탑을 감시해 온 고참 길드. 동굴 층의 위험을 잘 안다.',
      roster: [{ cls: 'warrior', role: 'tank', name: '무영', gender: 'm', personality: '탑 6층의 지도를 머릿속에 넣고 다닌다.' }, { cls: 'monk', role: 'melee', name: '설우', gender: 'm', personality: '말이 없고 손이 빠르다.' },
        { cls: 'hunter', name: '유하', gender: 'f', personality: '어둠 속에서도 과녁을 놓치지 않는다.' }, { cls: 'priest', name: '혜원', gender: 'f', personality: '망령 왕의 이야기를 들려주곤 한다.' }] },
  ];
  const guild = (() => {
    let cache = null;
    // 명단은 길드 id 시드로 만들어 항상 같은 사람이 나온다
    function npcGuilds() {
      if (cache || typeof Party === 'undefined') return cache || [];
      cache = NPC_GUILDS.map((g) => {
        const rng = RNG.make(RNG.hash('guild:' + g.id));
        const members = g.roster.map((r) => Object.assign(Party.generateMember(rng, g.memberLevel, r), { guildId: g.id }));
        return { id: g.id, name: g.name, level: g.level, levelReq: g.levelReq, desc: g.desc, members };
      });
      return cache;
    }
    const current = (G) => G.guild || null;
    // 명부 + 파티에 나가 있는 길드원(화면에 "전체 구성원"으로 보여 주기 위해)
    function roster(G) {
      const g = current(G); if (!g) return [];
      const out = g.members.slice();
      if (typeof Party !== 'undefined') for (const m of Party.members(G)) if (m.guildId === g.id) out.push(m);
      return out;
    }
    function list(G) {
      const g = current(G);
      return npcGuilds().map((n) => Object.assign({}, n, { joined: !!g && g.id === n.id, members: g && g.id === n.id ? roster(G) : n.members }));
    }
    function join(G, id) {
      if (current(G)) return fail('in_guild');
      const n = npcGuilds().find((x) => x.id === id); if (!n) return fail('unknown');
      if ((G.player.level || 1) < n.levelReq) return fail('level', { levelReq: n.levelReq });
      G.guild = { id: n.id, name: n.name, level: n.level, members: clone(n.members), isOwner: false };
      emit('guild_changed', { action: 'join', guild: G.guild });
      return ok({ guild: G.guild });
    }
    function leave(G) {
      const g = current(G); if (!g) return fail('no_guild');
      const removed = [];
      if (typeof Party !== 'undefined') for (const m of Party.members(G).slice()) if (m.guildId === g.id) removed.push(Party.remove(G, m.uid));
      G.guild = null;
      emit('guild_changed', { action: 'leave', guild: g });
      return ok({ removed });
    }
    function create(G, name) {
      if (current(G)) return fail('in_guild');
      const n = String(name || '').trim(); if (!n || n.length > GUILD_NAME_MAX) return fail('bad_name', { max: GUILD_NAME_MAX });
      if (!spend(G, GUILD_COST)) return fail('gold', { cost: GUILD_COST });
      G.guild = { id: 'guild_' + RNG.hash(n + ':' + (G.day || 1)).toString(36), name: n, level: 1, members: [], isOwner: true };
      emit('guild_changed', { action: 'create', guild: G.guild });
      return ok({ guild: G.guild });
    }
    // 명부 → 파티. 길드원은 고용비가 없다(길드의 혜택).
    function recruit(G, memberUid) {
      const g = current(G); if (!g) return fail('no_guild');
      const i = g.members.findIndex((m) => m.uid === memberUid); if (i < 0) return fail('not_found');
      if (Party.isFull(G)) return fail('party_full', { max: Party.MAX });
      const [m] = g.members.splice(i, 1);
      m.guildId = g.id;
      Party.add(G, m);
      return ok({ member: m });
    }
    // 내 길드에 현재 파티원을 등록(고정 파티). 등록된 파티원은 해고해도 명부에 남는다.
    function enlist(G, memberUid) {
      const g = current(G); if (!g) return fail('no_guild');
      if (!g.isOwner) return fail('not_owner');
      const m = Party.find(G, memberUid); if (!m) return fail('not_found');
      if (m.guildId === g.id) return fail('already_member');
      m.guildId = g.id;
      emit('guild_changed', { action: 'enlist', guild: g, member: m });
      return ok({ member: m });
    }
    return { list, join, leave, create, recruit, enlist, current, roster, GUILD_COST, NPC_GUILDS };
  })();

  return { shop, auction, bank, smithy, inn, engraver, temple, adventurer, guild, visit, IDS, NAMES, MENU, ENGRAVINGS, SLEEP_COST, GUILD_COST };
})();
if (typeof module !== 'undefined') module.exports = Facilities;
