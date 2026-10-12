// 드랍·상자 — DESIGN.md §8.4
// Loot.roll(mDef, floor, rng): 몬스터 처치 보상. 장비 드랍률 일반 25% / 엘리트·중간보스 60% / 보스 100%+2(사제용 1개 보장).
//   장비는 재질을 가리지 않는다(판금·가죽도 나옴 → 판매/분해용). 재료는 가족별 테이블, 보스는 재료 확률·수량이 뛴다.
// Loot.chest(floor, type, rng, opts): 상자. normal(골드+소모품+장비 1) / hidden(레어↑ 사제 장비 + 층 첫 번째만 히든 두루마리) / quest(지정 아이템).
// Items 가 없으면(테스트 스텁 없이 단독 로드) 아이템 없이 골드만 준다.
const Loot = (() => {
  const DROP_CHANCE = { normal: 0.25, elite: 0.6, miniboss: 0.6, boss: 1.0 };
  const BOSS_EXTRA_EQUIP = 2;          // 보스는 100% 1개 + 추가 2개
  const BOSS_MATERIAL_MULT = 3;        // 보스 재료 확률 배수(최대 1)
  const ELITE_MATERIAL_MULT = 1.5;
  const CHEST_GOLD = { normal: [20, 40], hidden: [60, 110], quest: [40, 70] };   // 1층 기준, Floors.goldMult 를 곱한다
  const LEGENDARY_CHANCE = { forest: 0.2, cave: 0.3 };                         // 숨겨진 상자의 전설 확률(나머지는 레어)

  // ---- 재료 테이블: mDef.loot → 항목. qty 생략 시 1개. ----
  const T = (id, chance, qty) => ({ id, chance, qty: qty || [1, 1] });
  const TABLES = {
    goblin:  [T('iron_scrap', 0.35, [1, 2]), T('wood', 0.2), T('monster_tooth', 0.1)],
    beast:   [T('leather', 0.4, [1, 2]), T('monster_tooth', 0.25)],
    spider:  [T('spider_silk', 0.4, [1, 2]), T('herb', 0.15), T('monster_tooth', 0.1)],
    undead:  [T('magic_powder', 0.15), T('iron_scrap', 0.15), T('holy_water', 0.05)],
    troll:   [T('leather', 0.3), T('monster_tooth', 0.3, [1, 2]), T('herb', 0.2)],
    orc:     [T('iron_scrap', 0.35, [1, 2]), T('leather', 0.2), T('monster_tooth', 0.15)],
    siren:   [T('moonstone', 0.08), T('magic_powder', 0.25), T('herb', 0.15)],
    sprite:  [T('magic_powder', 0.35), T('herb', 0.3, [1, 2]), T('wood', 0.2)],
    golem:   [T('iron_scrap', 0.35, [1, 2]), T('crystal', 0.25)],
    naga:    [T('crystal', 0.2), T('moonstone', 0.12), T('magic_powder', 0.2)],
    wraith:  [T('magic_powder', 0.3), T('holy_water', 0.15), T('moonstone', 0.08)],
    drake:   [T('crystal', 0.3), T('monster_tooth', 0.3), T('dragon_scale', 0.05)],
    dragon:  [T('dragon_scale', 1.0, [2, 3]), T('crystal', 1.0, [3, 5]), T('monster_tooth', 0.6, [2, 4])],
    // 가족 이름이 테이블에 없을 때의 기본
    default: [T('monster_tooth', 0.2), T('herb', 0.1)],
  };
  // 누구나 떨어뜨리는 소모품(층이 오르면 포션 크기가 커진다)
  const COMMON_CONSUMABLES = [{ kind: 'hp', chance: 0.06 }, { kind: 'mp', chance: 0.05 }, { id: 'antidote', chance: 0.03 }];
  // 상자 비오임별 재료
  const CHEST_MATERIALS = { forest: ['herb', 'wood', 'leather', 'thread'], cave: ['iron_scrap', 'crystal', 'magic_powder', 'thread'] };

  // ---- 다른 모듈(있으면 사용) ----
  const hasItems = () => typeof Items !== 'undefined' && !!Items && typeof Items.generate === 'function';
  const floorInfo = (floor) => (typeof Floors !== 'undefined' && Floors.get ? Floors.get(floor) : null);
  const goldMult = (floor) => { const f = floorInfo(floor); return f && f.goldMult ? f.goldMult : 1 + 0.5 * (Math.max(1, floor) - 1); };
  const biomeOf = (floor) => { const f = floorInfo(floor); return f ? f.biome : (floor <= 5 ? 'forest' : 'cave'); };
  const rngOf = (rng) => rng || (typeof RNG !== 'undefined' ? RNG.global() : null);
  const push = (arr, inst) => { if (inst) arr.push(inst); return inst; };

  function make(id, qty) {
    if (!hasItems()) return null;
    if (typeof Items.make === 'function') return Items.make(id, qty || 1);
    return Items.generate({ id, qty: qty || 1 });
  }
  function gen(opts) { return hasItems() ? Items.generate(opts) : null; }
  function potionId(kind, floor) { return `${kind}_potion_${floor <= 3 ? 's' : floor <= 7 ? 'm' : 'l'}`; }
  // 층 등급표로 굴리되 최소 등급을 보장한다(보스 사제 장비·퀘스트 상자용)
  function gradeAtLeast(floor, rng, minGrade) {
    if (!hasItems() || !Items.gradeWeights || !Items.gradeIndex) return minGrade;
    const rolled = rng.weighted(Items.gradeWeights(floor)).id;
    return Items.gradeIndex(rolled) >= Items.gradeIndex(minGrade) ? rolled : minGrade;
  }

  // ---- 몬스터 처치 ----
  function goldOf(mDef, floor, rng) {
    let range = mDef.gold || [0, 0];
    if (typeof Monsters !== 'undefined' && Monsters.statsAt) range = Monsters.statsAt(mDef, floor).gold;
    else range = [Math.round(range[0] * goldMult(floor)), Math.round(range[1] * goldMult(floor))];
    return rng.int(range[0], range[1]);
  }
  function equipCount(mDef, rng) {
    const tier = mDef.tier || 'normal';
    const base = rng.chance(DROP_CHANCE[tier] != null ? DROP_CHANCE[tier] : DROP_CHANCE.normal) ? 1 : 0;
    return tier === 'boss' ? base + BOSS_EXTRA_EQUIP : base;
  }
  function materialsOf(mDef, floor, rng) {
    const out = [];
    const table = TABLES[mDef.loot] || TABLES[mDef.family] || TABLES.default;
    const mult = mDef.tier === 'boss' ? BOSS_MATERIAL_MULT : (mDef.tier === 'miniboss' || mDef.tier === 'elite') ? ELITE_MATERIAL_MULT : 1;
    for (const t of table) {
      if (!rng.chance(Math.min(1, t.chance * mult))) continue;
      const qty = rng.int(t.qty[0], t.qty[1]) * (mDef.tier === 'boss' ? 2 : 1);
      push(out, make(t.id, qty));
    }
    for (const c of COMMON_CONSUMABLES) {
      if (!rng.chance(Math.min(1, c.chance * mult))) continue;
      push(out, make(c.id || potionId(c.kind, floor), 1));
    }
    return out;
  }
  function roll(mDef, floor, rng) {
    const r = rngOf(rng);
    const items = [];
    const n = equipCount(mDef, r);
    // 보스는 첫 장비를 사제용으로 보장(고급 이상, 동굴은 레어 이상)
    if (mDef.tier === 'boss') push(items, gen({ floor, rng: r, cls: 'priest', grade: gradeAtLeast(floor, r, floor >= 6 ? 'rare' : 'uncommon') }));
    for (let i = items.length; i < n; i++) push(items, gen({ floor, rng: r }));
    items.push(...materialsOf(mDef, floor, r));
    return { gold: goldOf(mDef, floor, r), items };
  }

  // ---- 숨겨진 상자 두루마리를 이미 받았는가 ----
  // 같은 층의 다른 숨겨진 상자를 이미 찾았거나(hiddenFound), 히든 퀘스트가 진행/완료 중이거나, 두루마리를 들고 있으면 받은 것.
  // exceptChestId: 지금 여는 상자(Floor 가 hiddenFound 에 먼저 넣고 Loot 를 불러도 첫 상자로 판정되게).
  function scrollTaken(G, floor, exceptChestId) {
    if (!G) return false;
    const sid = scrollId(floor);
    const q = G.quests || {};
    const qid = typeof QuestData !== 'undefined' && QuestData.questForScroll ? QuestData.questForScroll(sid) : null;
    if (qid && ((q.completed || []).includes(qid) || (q.active || []).some((a) => a.id === qid))) return true;
    if ((q.hiddenFound || []).some((id) => id !== exceptChestId && String(id).startsWith(`f${floor}_hidden`))) return true;
    if (typeof Inventory !== 'undefined' && Inventory.count) { try { if (Inventory.count(G, sid) > 0) return true; } catch (e) {} }
    const bag = (G.player && G.player.bag) || [], bank = (G.bank && G.bank.items) || [];
    return bag.concat(bank).some((it) => it && it.id === sid);
  }
  function scrollId(floor) { return `scroll_hidden_f${floor}`; }

  // ---- 상자 ----
  function chestGold(floor, type, rng) {
    const [a, b] = CHEST_GOLD[type] || CHEST_GOLD.normal;
    return Math.round(rng.int(a, b) * goldMult(floor));
  }
  function normalChest(floor, rng, items) {
    push(items, make(potionId(rng.chance(0.6) ? 'hp' : 'mp', floor), rng.int(1, 2)));
    push(items, gen({ floor, rng }));
    if (rng.chance(0.3)) push(items, make(rng.pick(CHEST_MATERIALS[biomeOf(floor)]), rng.int(1, 3)));
  }
  function hiddenChest(floor, rng, items, opts) {
    const grade = rng.chance(LEGENDARY_CHANCE[biomeOf(floor)]) ? 'legendary' : 'rare';
    push(items, gen({ floor, rng, cls: 'priest', grade }));
    const taken = typeof opts.scrollTaken === 'boolean' ? opts.scrollTaken : scrollTaken(opts.G, floor, opts.chestId);
    if (taken) { push(items, make('antidote', 2)); return null; }   // 두루마리 대신 소모품 약간
    push(items, make(scrollId(floor), 1));
    // 퀘스트 id 를 알면 함께 돌려준다(Quests 는 'item_gained' 의 두루마리 id 로도 자동 수주하므로 없어도 된다)
    return typeof QuestData !== 'undefined' && QuestData.questForScroll ? QuestData.questForScroll(scrollId(floor)) : null;
  }
  function questChest(floor, rng, items, opts) {
    const spec = opts.item;
    if (spec && spec.id) { push(items, make(spec.id, spec.qty || 1)); return; }
    if (!spec) { push(items, gen({ floor, rng, cls: 'priest', grade: gradeAtLeast(floor, rng, 'uncommon') })); return; }
    // 슬롯 지정 장비: 사제용. 방어구 슬롯이면 천으로 고정(퀘스트 보상 규칙과 동일)
    const armorSlots = hasItems() && Items.ARMOR_SLOTS ? Items.ARMOR_SLOTS : ['body', 'boots', 'gloves', 'hat', 'belt'];
    const o = Object.assign({ floor, rng, cls: 'priest' }, spec);
    if (armorSlots.includes(spec.slot)) o.armor = 'cloth';
    push(items, gen(o));
  }
  // opts: { chestId?, G?, scrollTaken?, item?: { id, qty } | { slot, grade?, setId?, hands? } }
  function chest(floor, type, rng, opts = {}) {
    const r = rngOf(rng);
    const items = [];
    const out = { gold: chestGold(floor, type, r), items };
    if (type === 'hidden') { const q = hiddenChest(floor, r, items, opts); if (q) out.questScroll = q; }
    else if (type === 'quest') questChest(floor, r, items, opts);
    else normalChest(floor, r, items);
    return out;
  }

  return { roll, chest, scrollTaken, scrollId, goldOf, materialsOf, potionId, DROP_CHANCE, TABLES, CHEST_GOLD, BOSS_EXTRA_EQUIP };
})();
if (typeof module !== 'undefined') module.exports = Loot;
