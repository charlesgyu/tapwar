// 파생 스탯 — DESIGN.md §4
// 저장된 1차 스탯(str/def/agi/sta/int/vit)에 장비·접사·세트·각인·버프·저주·피로를 얹어 전투용 수치를 만든다.
// 몬스터처럼 1차 스탯이 없는 대상은 Stats.applyStatus(base, ent) 로 버프/저주만 입힌다.
const Stats = (() => {
  const PRIMARY = ['str', 'def', 'agi', 'sta', 'int', 'vit'];
  const NAMES = { str: '힘', def: '방어력', agi: '민첩', sta: '지구력', int: '지능', vit: '체력' };
  const GRADE_MULT = { common: 1.0, uncommon: 1.25, rare: 1.6, legendary: 2.2 };
  // 접사/각인의 퍼센트 스탯(value 10 = 10%)과 평탄 가산 스탯
  const PCT_KEYS = ['cast_speed', 'mp_cost', 'move_speed', 'heal_power', 'crit'];
  const FLAT_KEYS = ['mp_regen', 'hp', 'mp', 'atk', 'matk', 'heal'];
  // 버프 stat id(Skills.buff / 음식 버프 공통). 값은 비율(+0.2 = +20%), eva 만 회피 포인트(+0.2 → +20)
  const BUFF_STATS = ['def', 'atk', 'aspd', 'spd', 'eva', 'mana'];
  const CURSES = {
    dot: { name: '맹독', desc: '초당 피해를 입는다.' },
    def_down: { name: '방어 약화', mult: { def: 0.7 }, desc: '방어력 30% 감소.' },
    atk_down: { name: '공격 약화', mult: { atk: 0.7 }, desc: '공격력 30% 감소.' },
    aspd_down: { name: '둔화', mult: { aspd: 0.7 }, desc: '공격속도 30% 감소.' },
    spd_down: { name: '감속', mult: { spd: 0.6 }, desc: '이동속도 40% 감소.' },
    heal_down: { name: '치유 저해', healTakenMult: 0.5, desc: '받는 힐 50% 감소.' },
    root: { name: '속박', rooted: true, desc: '움직일 수 없다.' },
  };
  const EVASION_CAP = 40, EVASION_HARD_CAP = 70, CRIT_CAP = 60;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const has = (o, k) => !!o && typeof o[k] === 'number';

  function gradeMult(grade) {
    const g = typeof Items !== 'undefined' && Items.GRADES && Items.GRADES[grade];
    if (g && typeof g.mult === 'number') return g.mult;
    return GRADE_MULT[grade] || 1;
  }
  function itemDef(inst) {
    if (!inst || !inst.id || typeof Items === 'undefined' || !Items.get) return null;
    return Items.get(inst.id) || null;
  }
  // 전투 엔티티는 src 에 원본(G.player/memberInst)을 두고, 자신은 buffs/curses 만 가진다.
  function sourceOf(e) { return (e && e.src) || e || {}; }
  // until 이 있고 now 가 주어지면 만료된 것은 뺀다(Combat 이 정리하기 전에 불려도 안전하게)
  function live(list, now) {
    if (!Array.isArray(list)) return [];
    if (typeof now !== 'number') return list;
    return list.filter((b) => !(typeof b.until === 'number' && b.until <= now));
  }

  function newAcc(src) {
    const prim = {};
    for (const k of PRIMARY) prim[k] = has(src.stats, k) ? src.stats[k] : 0;
    const pct = {}, flat = {}, pctPrim = {};
    for (const k of PCT_KEYS) pct[k] = 0;
    for (const k of FLAT_KEYS) flat[k] = 0;
    for (const k of PRIMARY) pctPrim[k] = 0;
    return { prim, pct, flat, pctPrim, procs: [], specials: [] };
  }
  // 접사·각인·장비 기본 스탯 공통 처리. 모르는 stat 은 무시한다(다른 모듈이 새 접사를 추가해도 깨지지 않게).
  function addMod(acc, stat, value, mult = 1) {
    if (typeof value !== 'number') return;
    if (PRIMARY.includes(stat)) acc.prim[stat] += value * mult;
    else if (PCT_KEYS.includes(stat)) acc.pct[stat] += value * mult;
    else if (FLAT_KEYS.includes(stat)) acc.flat[stat] += value * mult;
  }
  function applyItem(acc, inst) {
    const def = itemDef(inst); if (!def) return;
    // 내구도 0 이면 효과 절반(기본 스탯·접사 모두)
    const broken = typeof inst.durability === 'number' && inst.durability <= 0 ? 0.5 : 1;
    const gm = gradeMult(inst.grade) * broken;
    for (const [k, v] of Object.entries(def.baseStats || {})) addMod(acc, k, v, gm);
    for (const a of inst.affixes || []) addMod(acc, a.stat, a.value, broken);
  }
  function applyEquipment(acc, equipment) {
    if (!equipment) return;
    for (const inst of Object.values(equipment)) if (inst) applyItem(acc, inst);
  }
  function applyEngravings(acc, engravings) {
    for (const e of engravings || []) {
      if (e.special) acc.specials.push(e.special);
      if (e.stat) addMod(acc, e.stat, e.value);
    }
  }

  // 세트 효과: Inventory.activeSets(G) 가 있으면(플레이어) 그것을, 없으면 장비의 setId 를 직접 센다.
  function setEntries(src, G) {
    const isPlayer = G && (src === G.player);
    if (isPlayer && typeof Inventory !== 'undefined' && Inventory.activeSets) return Inventory.activeSets(G) || [];
    if (typeof Items === 'undefined' || !Items.setBonus) return [];
    const counts = {};
    for (const inst of Object.values(src.equipment || {})) {
      const def = itemDef(inst);
      if (def && def.setId) counts[def.setId] = (counts[def.setId] || 0) + 1;
    }
    return Object.entries(counts).map(([setId, count]) => ({ setId, count, bonuses: Items.setBonus(setId, count) || [] }));
  }
  function applySets(acc, src, G) {
    for (const s of setEntries(src, G)) {
      for (const b of s.bonuses || []) {
        if (b.type === 'proc' || b.proc) acc.procs.push(Object.assign({ setId: s.setId }, b));
        else if ((b.type === 'stat_pct' || b.pct) && PRIMARY.includes(b.stat)) acc.pctPrim[b.stat] += b.value;
        else if (b.stat) addMod(acc, b.stat, b.value);
      }
    }
  }
  // 1차 스탯·퍼센트 스탯에 걸리는 버프(음식 등)는 파생 전에 넣는다.
  // 'def'/'atk' 처럼 전투 버프 id 와 겹치는 이름은 applyStatus 가 맡으므로 여기서 건너뛴다(이중 적용 방지).
  function applyPrimaryBuffs(acc, buffs) {
    for (const b of buffs) {
      if (BUFF_STATS.includes(b.stat)) continue;
      if (PRIMARY.includes(b.stat)) acc.pctPrim[b.stat] += b.value * 100;
      else if (PCT_KEYS.includes(b.stat)) acc.pct[b.stat] += b.value * 100;
      else if (FLAT_KEYS.includes(b.stat)) acc.flat[b.stat] += b.value;
    }
  }

  function computeBase(acc, src) {
    const p = {};
    for (const k of PRIMARY) p[k] = acc.prim[k] * (1 + acc.pctPrim[k] / 100);
    const level = Math.max(1, src.level || 1);
    const fatigueMult = 1 - clamp(src.fatigue || 0, 0, 100) / 200;
    const { pct, flat } = acc;
    return {
      level, fatigueMult,
      str: p.str, def: p.def, agi: p.agi, sta: p.sta, int: p.int, vit: p.vit,
      maxHp: Math.max(1, Math.round(50 + p.vit * 12 + level * 8 + flat.hp)),
      maxMp: Math.max(0, Math.round(30 + p.int * 9 + level * 5 + flat.mp)),
      // 피로는 "내는 힘"(공격·힐·마나 회복)만 깎는다. 최대 HP/MP 를 깎으면 현재값이 튀어서 제외.
      atk: (p.str * 2 + p.agi * 0.5 + flat.atk) * fatigueMult,
      matk: (p.int * 1.6 + flat.matk) * fatigueMult,
      healPower: (p.int * 1.6 + flat.heal) * (1 + pct.heal_power / 100) * fatigueMult,
      evasion: Math.min(EVASION_CAP, p.agi * 0.4),
      crit: clamp(5 + p.agi * 0.25 + pct.crit, 0, CRIT_CAP),
      moveSpeed: 120 * (1 + p.agi * 0.004) * (1 + pct.move_speed / 100),
      atkSpeed: 1 + p.agi * 0.003,
      castSpeed: 1 / (1 + pct.cast_speed / 100),
      mpRegen: (1 + p.int * 0.05 + flat.mp_regen) * fatigueMult,
      mpCostMult: Math.max(0.1, 1 - pct.mp_cost / 100),
      fatigueGainMult: 1 / (1 + p.sta * 0.02),
      healTakenMult: 1, rooted: false,
      procs: acc.procs, specials: acc.specials,
    };
  }

  // 버프/저주 반영. base 는 computeBase 결과이거나 몬스터의 기본 수치({ maxHp, atk, def, moveSpeed, atkSpeed ... }).
  // 항상 base 를 기준으로 새 객체를 만들어, 여러 번 불러도 배수가 겹쳐 쌓이지 않는다.
  function applyStatus(base, holder, now) {
    const out = Object.assign({ healTakenMult: 1, rooted: false }, base);
    const m = { def: 1, atk: 1, aspd: 1, spd: 1, mana: 1 };
    let evaAdd = 0;
    for (const b of live(holder && holder.buffs, now)) {
      if (!BUFF_STATS.includes(b.stat) || typeof b.value !== 'number') continue;
      if (b.stat === 'eva') evaAdd += b.value * 100; else m[b.stat] *= 1 + b.value;
    }
    for (const c of live(holder && holder.curses, now)) {
      const cd = CURSES[c.id]; if (!cd) continue;
      for (const [k, v] of Object.entries(cd.mult || {})) m[k] *= v;
      if (cd.healTakenMult) out.healTakenMult = Math.min(out.healTakenMult, cd.healTakenMult);
      if (cd.rooted) out.rooted = true;
    }
    if (has(base, 'def')) out.def = r2(base.def * m.def);
    if (has(base, 'atk')) out.atk = r2(base.atk * m.atk);
    if (has(base, 'matk')) out.matk = r2(base.matk * m.atk);
    if (has(base, 'atkSpeed')) out.atkSpeed = r2(base.atkSpeed * m.aspd);
    if (has(base, 'moveSpeed')) out.moveSpeed = out.rooted ? 0 : r2(base.moveSpeed * m.spd);
    if (has(base, 'evasion')) out.evasion = r2(clamp(base.evasion + evaAdd, 0, EVASION_HARD_CAP));
    if (has(base, 'mpCostMult')) out.mpCostMult = r2(Math.max(0, base.mpCostMult * m.mana));
    for (const k of ['healPower', 'crit', 'castSpeed', 'mpRegen', 'fatigueMult', 'fatigueGainMult', ...PRIMARY]) if (has(out, k)) out[k] = r2(out[k]);
    return out;
  }

  function derive(entityLike, G, now) {
    const src = sourceOf(entityLike);
    const holder = entityLike && Array.isArray(entityLike.buffs) ? entityLike : src;
    const acc = newAcc(src);
    applyEquipment(acc, src.equipment);
    applyEngravings(acc, src.engravings);
    applySets(acc, src, G);
    applyPrimaryBuffs(acc, live(holder.buffs, now));
    return applyStatus(computeBase(acc, src), holder, now);
  }

  function statName(k) { return NAMES[k] || k; }
  function curseName(id) { return CURSES[id] ? CURSES[id].name : id; }

  return { derive, applyStatus, gradeMult, statName, curseName, PRIMARY, NAMES, CURSES, BUFF_STATS, GRADE_MULT, PCT_KEYS, FLAT_KEYS };
})();
if (typeof module !== 'undefined') module.exports = Stats;
