// 스킬 데이터 — DESIGN.md §3.2
// 사제 16개 스킬(표 그대로)과 파티원 자동 스킬. 힐량/비용 계산 헬퍼를 함께 둔다.
const Skills = (() => {
  const HEAL = { base: 60, intScale: 1.6 };          // 기본 힐 기준값
  const AOE_RATE = 0.7;                               // 광역 2/3명은 단일의 70%
  const GROUND_RATE = 0.25;                           // 바닥힐 초당 단일의 25%
  const BUFF_DURATION = 60, BUFF_VALUE = 0.2, MANA_VALUE = -0.25;
  const LEVEL_SCALE = 0.08;                           // 스킬 레벨당 +8%
  const BUFF_LEVEL_SCALE = 0.05;                      // 버프 수치는 레벨당 +5% (힐보다 완만하게)
  const TILE = 32;

  const BUFF_STATS = { def: '방어력', atk: '공격력', aspd: '공격속도', spd: '이동속도', eva: '회피', mana: '마나 소비' };

  const scaled = (base, rate) => ({ base: +(base.base * rate).toFixed(2), intScale: +(base.intScale * rate).toFixed(3) });
  // 시전 시간은 빠른 전투 템포에 맞춰 줄였다(기본 힐 1.2초, 빠른 힐 0.6초, 광역 1.5/1.8초, 버프 0.6초).
  const P = (o) => Object.assign({ owner: 'priest', maxLevel: 10, targets: 1, castTime: 0, mpCost: 0, cooldown: 0, unlockLevel: 1 }, o);

  // 표의 순서(해금 레벨순)를 그대로 유지한다 — UI 스킬 목록과 Level.unlockedSkills 가 이 순서를 쓴다.
  const PRIEST = [
    P({ id: 'heal_basic', name: '기본 힐', type: 'single_heal', castTime: 1.2, mpCost: 20, cooldown: 0, unlockLevel: 1,
      power: { ...HEAL }, desc: '아군 한 명의 HP를 회복한다. 시전이 느리지만 마나 효율이 가장 좋다.' }),
    P({ id: 'cleanse', name: '저주 해제', type: 'cleanse', castTime: 0.4, mpCost: 25, cooldown: 2, unlockLevel: 1,
      power: { count: 1 }, desc: '아군의 저주를 하나 풀어 준다. 저주에 걸린 아군 중 HP가 가장 낮은 쪽부터.' }),
    P({ id: 'buff_def', name: '수호의 축복', type: 'buff', castTime: 0.6, mpCost: 30, cooldown: 8, unlockLevel: 2,
      duration: BUFF_DURATION, buff: { stat: 'def', value: BUFF_VALUE }, prefer: 'tank',
      desc: '60초 동안 아군의 방어력을 20% 올린다. 탱커에게 먼저.' }),
    P({ id: 'aoe_2', name: '빛의 물결', type: 'aoe_heal', castTime: 1.5, mpCost: 45, cooldown: 0, unlockLevel: 3, targets: 2,
      power: scaled(HEAL, AOE_RATE), desc: '무작위 아군 2명의 HP를 회복한다. 한 명당 단일 힐의 70%.' }),
    P({ id: 'heal_fast', name: '빠른 힐', type: 'single_heal', castTime: 0.6, mpCost: 30, cooldown: 0, unlockLevel: 4,
      power: { ...HEAL }, desc: '기본 힐과 같은 양을 두 배 빠르게 회복한다. 마나는 1.5배.' }),
    P({ id: 'buff_atk', name: '용맹의 축복', type: 'buff', castTime: 0.6, mpCost: 30, cooldown: 8, unlockLevel: 5,
      duration: BUFF_DURATION, buff: { stat: 'atk', value: BUFF_VALUE }, prefer: 'dps',
      desc: '60초 동안 아군의 공격력을 20% 올린다. 딜러에게 먼저.' }),
    P({ id: 'aoe_ground', name: '치유의 성역', type: 'ground_heal', castTime: 1.0, mpCost: 60, cooldown: 12, unlockLevel: 6, targets: 'all',
      radius: 2.5 * TILE, duration: 6, tick: 1, power: scaled(HEAL, GROUND_RATE),
      desc: '바닥에 성역을 펼친다. 6초 동안 반경 2.5타일 안의 아군이 매초 단일 힐의 25%만큼 회복한다.' }),
    P({ id: 'smite', name: '성스러운 일격', type: 'smite', castTime: 1.0, mpCost: 25, cooldown: 0, unlockLevel: 7,
      power: { base: 50, intScale: 1.5 }, onlyTags: ['undead'],
      desc: '언데드에게 성스러운 피해를 준다. 다른 괴물에게는 통하지 않는다.' }),
    P({ id: 'resurrect', name: '부활', type: 'resurrect', castTime: 3.0, mpCost: 120, cooldown: 60, unlockLevel: 8,
      power: { pct: 0.3, pctPerLevel: 0.03 }, desc: '쓰러진 아군을 HP 30%로 되살린다. 시전이 길어 안전할 때 써야 한다.' }),
    P({ id: 'heal_instant', name: '즉시 힐', type: 'single_heal', castTime: 0, mpCost: 40, cooldown: 3, unlockLevel: 9,
      power: { ...HEAL }, desc: '시전 없이 바로 회복한다. 마나는 두 배. 위급할 때.' }),
    P({ id: 'holy_light', name: '신성한 빛', type: 'ultimate', castTime: 0, mpCost: 50, cooldown: 300, unlockLevel: 10, targets: 'all',
      power: { pct: 0.8, pctPerLevel: 0.02 }, desc: '필살기. 파티 전원의 HP를 즉시 80% 회복한다. 쿨타임 5분.' }),
    P({ id: 'buff_aspd', name: '질풍의 축복', type: 'buff', castTime: 0.6, mpCost: 30, cooldown: 8, unlockLevel: 12,
      duration: BUFF_DURATION, buff: { stat: 'aspd', value: BUFF_VALUE }, prefer: 'any',
      desc: '60초 동안 아군의 공격속도를 20% 올린다.' }),
    P({ id: 'aoe_3', name: '빛의 파도', type: 'aoe_heal', castTime: 1.8, mpCost: 65, cooldown: 0, unlockLevel: 14, targets: 3,
      power: scaled(HEAL, AOE_RATE), desc: '무작위 아군 3명의 HP를 회복한다. 한 명당 단일 힐의 70%.' }),
    P({ id: 'buff_spd', name: '바람의 축복', type: 'buff', castTime: 0.6, mpCost: 30, cooldown: 8, unlockLevel: 16,
      duration: BUFF_DURATION, buff: { stat: 'spd', value: BUFF_VALUE }, prefer: 'any',
      desc: '60초 동안 아군의 이동속도를 20% 올린다.' }),
    P({ id: 'buff_eva', name: '그림자 축복', type: 'buff', castTime: 0.6, mpCost: 30, cooldown: 8, unlockLevel: 18,
      duration: BUFF_DURATION, buff: { stat: 'eva', value: BUFF_VALUE }, prefer: 'tank',
      desc: '60초 동안 아군의 회피를 20% 올린다.' }),
    P({ id: 'buff_mana', name: '샘의 축복', type: 'buff', castTime: 0.6, mpCost: 30, cooldown: 8, unlockLevel: 20,
      duration: BUFF_DURATION, buff: { stat: 'mana', value: MANA_VALUE }, prefer: 'self',
      desc: '60초 동안 마나 소비를 25% 줄인다. 보통 자신에게 건다.' }),
  ];

  // 파티원 자동 스킬. type 은 'taunt' | 'attack'. attack 은 targets(1 | 3 | 'aoe'), radius, hits, crit, dash 로 변형.
  // 전사·무투가가 같은 '도발'을 쓰므로 owners 로 공유 직업을 적는다(owner 는 대표 직업).
  // 파티원 스킬은 무리 사냥 템포에 맞춰 쿨타임·마나를 예전의 절반으로 둔다(강타·눈보라가 자주 터져야 "베어 넘기는" 맛이 난다).
  const M = (o) => Object.assign({ maxLevel: 1, targets: 1, castTime: 0, mpCost: 0, unlockLevel: 1, dmgType: 'physical' }, o);
  const MEMBER = [
    M({ id: 'taunt', name: '도발', owner: 'warrior', owners: ['warrior', 'monk'], type: 'taunt', cooldown: 6, threatMult: 5,
      radius: 5 * TILE, power: { mult: 0 }, desc: '주변 적의 위협을 자신에게 끌어온다. 위협 ×5.' }),
    M({ id: 'cleave', name: '강타', owner: 'warrior', type: 'attack', cooldown: 4, mpCost: 8, targets: 'aoe', radius: 2.5 * TILE,
      power: { mult: 1.8 }, desc: '앞쪽 적들을 한꺼번에 베어 넘긴다.' }),
    M({ id: 'flurry', name: '연타', owner: 'monk', type: 'attack', cooldown: 5, mpCost: 8, hits: 3,
      power: { mult: 2.1 }, desc: '세 번 연속으로 주먹을 꽂는다.' }),
    M({ id: 'fireball', name: '화염구', owner: 'mage', type: 'attack', cooldown: 3, mpCost: 10, castTime: 0.6, dmgType: 'magic',
      power: { mult: 2.5 }, desc: '불덩이를 날려 큰 피해를 준다.' }),
    M({ id: 'blizzard', name: '눈보라', owner: 'mage', type: 'attack', cooldown: 8, mpCost: 18, castTime: 0.9, dmgType: 'magic',
      targets: 'aoe', radius: 3 * TILE, unlockLevel: 5, power: { mult: 1.6 }, desc: '넓은 범위에 얼음 폭풍을 내린다.' }),
    M({ id: 'multishot', name: '연속 사격', owner: 'hunter', type: 'attack', cooldown: 4, mpCost: 8, targets: 3, unlockLevel: 2,
      power: { mult: 1.5 }, desc: '화살 세 발을 서로 다른 적에게 쏜다.' }),
    M({ id: 'backstab', name: '기습', owner: 'rogue', type: 'attack', cooldown: 4.5, mpCost: 8, crit: true, unlockLevel: 2,
      power: { mult: 2.5 }, desc: '등 뒤를 찔러 반드시 치명타를 낸다.' }),
    M({ id: 'blade_rush', name: '검격 돌진', owner: 'spellblade', type: 'attack', cooldown: 5, mpCost: 10, dash: true, range: 5 * TILE,
      unlockLevel: 2, dmgType: 'hybrid', power: { mult: 2.0 }, desc: '마력을 두른 검으로 적에게 돌진해 벤다.' }),
  ];

  // 스킬 레벨업 비용(현재 lv → lv+1). 만렙이면 null.
  function upgradeCostFor(def, lv) {
    const l = Math.max(1, lv | 0);
    if (!def || l >= def.maxLevel) return null;
    return 150 * l * l;
  }
  const ALL = PRIEST.concat(MEMBER);
  for (const d of ALL) d.upgradeCost = (lv) => upgradeCostFor(d, lv);
  const BY_ID = Object.fromEntries(ALL.map((d) => [d.id, d]));

  function get(id) { return BY_ID[id] || null; }
  function list() { return ALL.map((d) => d.id); }
  function priest() { return PRIEST.slice(); }
  // 사제 파티원도 같은 사제 스킬을 쓴다. Classes.get(cls).skills 의 순서를 따른다.
  function member(cls) {
    if (cls === 'priest') return priest();
    return MEMBER.filter((d) => d.owner === cls || (d.owners && d.owners.includes(cls)));
  }
  function upgradeCost(skillId, lv) { return upgradeCostFor(get(skillId), lv); }

  function levelScale(lv) { return 1 + LEVEL_SCALE * (Math.max(1, lv | 0) - 1); }
  function pctAt(def, lv) {
    const p = def.power || {};
    return Math.min(1, (p.pct || 0) + (p.pctPerLevel || 0) * (Math.max(1, lv | 0) - 1));
  }

  // 시전자의 "힐에 쓰는 지능". 파생 스탯(healPower = int×1.6 에 접사·피로 반영)이 있으면 그것을 우선 쓴다.
  function casterInt(caster) {
    if (!caster) return 0;
    const s = caster.stats || caster;
    if (typeof s.healPower === 'number') return s.healPower / 1.6;
    return typeof s.int === 'number' ? s.int : 0;
  }
  function casterMagic(caster) {
    if (!caster) return 0;
    const s = caster.stats || caster;
    if (typeof s.matk === 'number') return s.matk / 1.6;
    return casterInt(caster);
  }
  function targetMaxHp(target) {
    if (!target) return 0;
    if (typeof target.maxHp === 'number') return target.maxHp;
    return target.stats && typeof target.stats.maxHp === 'number' ? target.stats.maxHp : 0;
  }

  // 힐량. 단일/광역/바닥(초당)은 (base + int×intScale)×레벨 배수, 필살기/부활은 대상 최대 HP 비율.
  // 비율형인데 target 이 없으면 비율(0~1) 자체를 돌려준다.
  function healAmount(def, caster, skillLv = 1, target) {
    if (!def || !def.power) return 0;
    if (def.power.pct != null) {
      const pct = pctAt(def, skillLv);
      return target ? Math.round(targetMaxHp(target) * pct) : pct;
    }
    if (def.power.base == null) return 0;
    return Math.round((def.power.base + casterInt(caster) * (def.power.intScale || 0)) * levelScale(skillLv));
  }
  // 사제 공격 스킬(smite) 피해량. 파티원 스킬(mult)은 Combat 이 atk×mult 로 계산한다.
  function damageAmount(def, caster, skillLv = 1) {
    if (!def || !def.power || def.power.base == null) return 0;
    return Math.round((def.power.base + casterMagic(caster) * (def.power.intScale || 0)) * levelScale(skillLv));
  }
  function buffValue(def, skillLv = 1) {
    if (!def || !def.buff) return 0;
    return +(def.buff.value * (1 + BUFF_LEVEL_SCALE * (Math.max(1, skillLv | 0) - 1))).toFixed(4);
  }
  // 실제 시전 시간/마나: 파생 스탯 castSpeed·mpCostMult 가 있으면 반영
  function castTime(def, caster) {
    const s = (caster && caster.stats) || {};
    return +(def.castTime * (typeof s.castSpeed === 'number' ? s.castSpeed : 1)).toFixed(3);
  }
  function mpCost(def, caster) {
    const s = (caster && caster.stats) || {};
    return Math.round(def.mpCost * (typeof s.mpCostMult === 'number' ? s.mpCostMult : 1));
  }
  function isHeal(def) { return !!def && (def.type === 'single_heal' || def.type === 'aoe_heal' || def.type === 'ground_heal' || def.type === 'ultimate'); }
  function isBuff(def) { return !!def && def.type === 'buff'; }
  function canTarget(def, target) {
    if (!def || !def.onlyTags) return true;
    const tags = (target && target.tags) || [];
    return def.onlyTags.some((t) => tags.includes(t));
  }

  return { get, list, priest, member, upgradeCost, healAmount, damageAmount, buffValue, castTime, mpCost, levelScale, pctAt,
    isHeal, isBuff, canTarget, BUFF_STATS, BUFF_DURATION, LEVEL_SCALE };
})();
if (typeof module !== 'undefined') module.exports = Skills;
