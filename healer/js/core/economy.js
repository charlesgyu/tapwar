// 경제 — DESIGN.md §5
// 구매가 = 기본가 × 등급 배수, 판매가 = 구매가의 40% × 내구도 계수, 수리비 = 구매가 × 손상비율 × 0.3, 분해 = 재료 1~3개.
// 시설(Facilities)이 골드를 실제로 주고받고, 여기서는 가격 계산과 분해 결과만 만든다.
const Economy = (() => {
  const SELL_RATE = 0.4;
  const REPAIR_RATE = 0.3;
  const AFFIX_PRICE_BONUS = 0.1;          // 접사 하나당 +10% (레어 이상 가치 반영)
  // 분해: 장비 종류별 기본 재료. 등급이 높을수록 좋은 재료(tier)가 섞인다.
  const PRIMARY_MATERIAL = { cloth: 'thread', leather: 'leather', chain: 'iron_scrap', plate: 'iron_scrap',
    staff: 'wood', book: 'thread', sword: 'iron_scrap', bow: 'wood', dagger: 'iron_scrap', knuckle: 'iron_scrap', bag: 'leather', accessory: 'iron_scrap' };
  const TIERS = { basic: ['thread', 'leather', 'iron_scrap', 'wood', 'herb'], mid: ['magic_powder', 'spider_silk', 'monster_tooth'], high: ['crystal', 'moonstone', 'holy_water'], top: ['dragon_scale'] };
  const BY_GRADE = {
    common:    { count: [1, 1], pools: ['basic'] },
    uncommon:  { count: [1, 2], pools: ['basic', 'mid'] },
    rare:      { count: [2, 3], pools: ['mid', 'high'] },
    legendary: { count: [3, 3], pools: ['high', 'top'], bonus: 'dragon_scale' },
  };

  const defOf = (x) => {
    if (!x || typeof Items === 'undefined') return null;
    if (typeof x === 'string') return Items.get(x);
    return x.kind ? x : Items.get(x.id);
  };
  // 인스턴스·정의 어느 쪽이든 grade 가 있으면 쓰고, 없으면 일반 등급
  const gradeOf = (x) => (x && typeof x === 'object' && x.grade) || 'common';
  const priceMult = (grade) => (Items.GRADES[grade] ? Items.GRADES[grade].priceMult : 1);
  function currency(x) { const d = defOf(x); return (d && d.currency) || 'gold'; }

  // def | inst | id. 인스턴스면 등급·접사를, 정의면 일반 등급을 기준으로 한다.
  function buyPrice(x) {
    const d = defOf(x); if (!d) return 0;
    const base = d.price || 0;
    if (d.kind !== 'equip') return base;
    const inst = typeof x === 'object' && !x.kind ? x : null;
    const affixes = inst && Array.isArray(inst.affixes) ? inst.affixes.length : 0;
    return Math.round(base * priceMult(gradeOf(x)) * (1 + AFFIX_PRICE_BONUS * affixes));
  }
  // 내구도 계수: 멀쩡하면 1, 완전히 망가지면 0.5 (수리하면 제값)
  function durabilityFactor(inst) {
    if (!inst || !(inst.maxDurability > 0)) return 1;
    const ratio = Math.min(1, Math.max(0, (inst.durability || 0) / inst.maxDurability));
    return 0.5 + 0.5 * ratio;
  }
  function sellPrice(inst) {
    const d = defOf(inst); if (!d || d.kind === 'quest' || (d.currency && d.currency !== 'gold')) return 0;
    const qty = Math.max(1, inst.qty || 1);
    return Math.floor(buyPrice(inst) * SELL_RATE * durabilityFactor(inst)) * qty;
  }
  function repairCost(inst) {
    const d = defOf(inst);
    if (!d || d.kind !== 'equip' || !(inst.maxDurability > 0)) return 0;
    const damaged = 1 - Math.min(1, Math.max(0, (inst.durability || 0) / inst.maxDurability));
    return Math.ceil(buyPrice(inst) * damaged * REPAIR_RATE);
  }

  // ---- 분해 ----
  function primaryMaterial(d) {
    if (d.armor) return PRIMARY_MATERIAL[d.armor];
    if (d.weapon) return PRIMARY_MATERIAL[d.weapon];
    if (d.slot === 'bag') return PRIMARY_MATERIAL.bag;
    return PRIMARY_MATERIAL.accessory;
  }
  function poolFor(grade) {
    const g = BY_GRADE[grade] || BY_GRADE.common;
    return g.pools.flatMap((t) => TIERS[t]);
  }
  // 분해로 나올 수 있는 재료 id 목록(UI 미리보기용)
  function disassemblePreview(inst) {
    const d = defOf(inst); if (!d || d.kind !== 'equip') return [];
    return Array.from(new Set([primaryMaterial(d), ...poolFor(gradeOf(inst))]));
  }
  function disassemble(inst, rng) {
    const d = defOf(inst); if (!d || d.kind !== 'equip') return [];
    const r = rng || (typeof RNG !== 'undefined' ? RNG.global() : null);
    const g = BY_GRADE[gradeOf(inst)] || BY_GRADE.common;
    const n = r ? r.int(g.count[0], g.count[1]) : g.count[0];
    const out = {};
    const put = (id, q) => { out[id] = (out[id] || 0) + q; };
    put(primaryMaterial(d), 1);
    const pool = poolFor(gradeOf(inst));
    for (let i = 1; i < n; i++) put(r ? r.pick(pool) : pool[0], 1);
    if (g.bonus) put(g.bonus, 1);     // 전설은 용 비늘 보장
    return Object.entries(out).map(([id, qty]) => Items.make(id, qty));
  }

  // 조합 비용 확인(대장간이 재료·골드를 실제로 뺀다)
  function canCraft(G, recipe) {
    if (!recipe) return { ok: false, reason: 'no_recipe' };
    if ((G.player.gold || 0) < (recipe.gold || 0)) return { ok: false, reason: 'gold' };
    for (const [id, q] of Object.entries(recipe.materials || {})) if (Inventory.count(G, id) < q) return { ok: false, reason: 'materials', missing: id };
    return { ok: true };
  }

  return { buyPrice, sellPrice, repairCost, disassemble, disassemblePreview, durabilityFactor, currency, canCraft,
    SELL_RATE, REPAIR_RATE, AFFIX_PRICE_BONUS, TIERS, PRIMARY_MATERIAL };
})();
if (typeof module !== 'undefined') module.exports = Economy;
