// 직업 데이터 — DESIGN.md §3.1
// 7직업의 1레벨 기본 스탯·레벨당 성장·역할·스킬·공격 방식. 순수 데이터라 다른 모듈에 의존하지 않는다.
// 저장되는 stats(플레이어/파티원)는 "현재 레벨의 1차 스탯"이며, 성장은 Level.addXp 가 레벨업 때 더한다.
const Classes = (() => {
  const PRIMARY = ['str', 'def', 'agi', 'sta', 'int', 'vit'];
  const ROLES = ['tank', 'melee', 'ranged', 'healer'];
  const ROLE_NAMES = { tank: '탱커', melee: '근접 딜러', ranged: '원거리 딜러', healer: '힐러' };
  const ARMOR_NAMES = { plate: '판금', leather: '가죽', chain: '사슬', cloth: '천' };
  // 전사/무투가를 파티원으로 만들 때 탱커가 될 확률 — 파티에 탱커가 흔해야 1~5층이 쉬워진다
  const TANK_CHANCE = 0.6;
  // 전투 템포(레퍼런스 영상처럼 무리를 "베어 넘기는" 속도): 기본 공격 간격은 예전의 절반, 파티원 피해는 ×DMG_MULT.
  // 1~5층 일반 몬스터가 딜러 한두 대에 쓰러지도록 Monsters.TIER_HP(일반 몬스터 HP 배수)와 함께 맞춘다.
  const DMG_MULT = 1.5;
  // splash: 기본 공격이 대상 주변 radius(px) 안의 다른 몬스터에게 mult 배 피해를 함께 준다(전사·무투가·마검사 휘두르기, 마법사 폭발).
  // 무리를 한 덩어리로 베어 넘기는 느낌 + 탱커가 주변 몬스터 위협을 고루 쌓는다. 도적·사냥꾼은 단일 대상 고화력.

  // baseStats 합은 40~43 으로 맞추고, 성장 합은 파티원 약 6, 사제는 약 4.3(+투자 5포인트).
  // 사제 baseStats 는 State.newGame 의 초기 스탯과 같아야 한다.
  const DEFS = [
    { id: 'warrior', name: '전사', roles: ['tank', 'melee'], armor: 'plate',
      baseStats: { str: 10, def: 10, agi: 4, sta: 8, int: 2, vit: 9 },
      growth: { str: 2.0, def: 1.8, agi: 0.4, sta: 0.8, int: 0.1, vit: 1.5 },
      primary: ['str', 'def'], skills: ['taunt', 'cleave'],
      atkType: 'melee', dmgStat: 'atk', range: 40, atkInterval: 0.6, splash: { radius: 40, mult: 0.5 },
      desc: '방패와 검으로 앞장서는 전위. 도발로 적을 붙잡아 두고 강타로 베어 넘긴다.' },
    { id: 'mage', name: '마법사', roles: ['ranged'], armor: 'cloth',
      baseStats: { str: 2, def: 3, agi: 6, sta: 5, int: 17, vit: 6 },
      growth: { str: 0.2, def: 0.4, agi: 0.7, sta: 0.6, int: 3.0, vit: 1.0 },
      primary: ['int'], skills: ['fireball', 'blizzard'],
      atkType: 'magic', dmgStat: 'matk', range: 200, atkInterval: 0.8, splash: { radius: 40, mult: 0.6 },
      desc: '화염과 눈보라를 다루는 원거리 딜러. 몸이 약해 탱커 뒤에 서야 한다.' },
    { id: 'hunter', name: '사냥꾼', roles: ['ranged'], armor: 'leather',
      baseStats: { str: 7, def: 4, agi: 12, sta: 7, int: 3, vit: 8 },
      growth: { str: 0.9, def: 0.6, agi: 2.3, sta: 0.8, int: 0.3, vit: 1.1 },
      primary: ['agi', 'str'], skills: ['multishot'],
      atkType: 'ranged', dmgStat: 'atk', range: 220, atkInterval: 0.55,
      desc: '활로 멀리서 꾸준히 쏘는 원거리 딜러. 민첩이 높아 잘 피한다.' },
    { id: 'rogue', name: '도적', roles: ['melee'], armor: 'leather',
      baseStats: { str: 7, def: 4, agi: 13, sta: 6, int: 3, vit: 7 },
      growth: { str: 1.1, def: 0.5, agi: 2.5, sta: 0.6, int: 0.2, vit: 1.0 },
      primary: ['agi', 'str'], skills: ['backstab'],
      atkType: 'melee', dmgStat: 'atk', range: 40, atkInterval: 0.45,
      desc: '등 뒤에서 급소를 노리는 근접 딜러. 치명타가 자주 터진다.' },
    { id: 'spellblade', name: '마검사', roles: ['melee'], armor: 'chain',
      baseStats: { str: 8, def: 6, agi: 7, sta: 6, int: 9, vit: 7 },
      growth: { str: 1.5, def: 0.9, agi: 0.9, sta: 0.7, int: 1.2, vit: 1.1 },
      primary: ['str', 'int'], skills: ['blade_rush'],
      atkType: 'melee', dmgStat: 'hybrid', range: 44, atkInterval: 0.5, splash: { radius: 36, mult: 0.4 },
      desc: '검에 마력을 실어 베는 근접 딜러. 힘과 지능을 함께 쓴다.' },
    { id: 'priest', name: '사제', roles: ['healer'], armor: 'cloth',
      baseStats: { str: 4, def: 5, agi: 6, sta: 6, int: 14, vit: 8 },
      growth: { str: 0.3, def: 0.4, agi: 0.5, sta: 0.6, int: 1.6, vit: 0.9 },
      primary: ['int', 'vit'],
      skills: ['heal_basic', 'cleanse', 'buff_def', 'aoe_2', 'heal_fast', 'buff_atk', 'aoe_ground', 'smite',
        'resurrect', 'heal_instant', 'holy_light', 'buff_aspd', 'aoe_3', 'buff_spd', 'buff_eva', 'buff_mana'],
      atkType: 'magic', dmgStat: 'matk', range: 160, atkInterval: 0.75,
      desc: '빛의 힘으로 파티를 살리는 힐러. 치유·저주 해제·축복을 맡는다.' },
    { id: 'monk', name: '무투가', roles: ['tank', 'melee'], armor: 'plate',
      baseStats: { str: 9, def: 7, agi: 8, sta: 8, int: 2, vit: 9 },
      growth: { str: 1.7, def: 1.2, agi: 1.3, sta: 0.8, int: 0.1, vit: 1.4 },
      primary: ['str', 'agi'], skills: ['taunt', 'flurry'],
      atkType: 'melee', dmgStat: 'atk', range: 40, atkInterval: 0.4, splash: { radius: 32, mult: 0.35 },
      desc: '맨주먹으로 빠르게 몰아치는 격투가. 전사보다 가볍지만 손이 빠르다.' },
  ];
  const BY_ID = Object.fromEntries(DEFS.map((d) => [d.id, d]));

  function list() { return DEFS.map((d) => d.id); }
  function all() { return DEFS.slice(); }
  function get(id) { return BY_ID[id] || null; }

  // 레벨 lv 에서의 1차 스탯 = 1레벨 기본 + 성장×(lv-1). 정수로 반올림해 UI 에 소수가 안 보이게 한다.
  function statsAt(id, level = 1) {
    const d = get(id); if (!d) return null;
    const lv = Math.max(1, level | 0);
    const out = {};
    for (const k of PRIMARY) out[k] = Math.round(d.baseStats[k] + d.growth[k] * (lv - 1));
    return out;
  }

  // from→to 레벨업 때 더할 증가분. statsAt 과 같은 반올림을 써서 여러 번 더해도 오차가 쌓이지 않는다.
  function growthDelta(id, from, to) {
    const a = statsAt(id, from), b = statsAt(id, to);
    const out = {};
    for (const k of PRIMARY) out[k] = a && b ? b[k] - a[k] : 0;
    return out;
  }

  // 파티원 생성 시 역할 결정. 전사/무투가만 탱커·근딜 중 하나를 뽑는다.
  function pickRole(id, rng) {
    const d = get(id); if (!d) return null;
    if (d.roles.length === 1) return d.roles[0];
    const roll = rng ? rng.next() : Math.random();
    return roll < TANK_CHANCE ? 'tank' : 'melee';
  }

  function roleName(role) { return ROLE_NAMES[role] || role; }
  function armorName(armor) { return ARMOR_NAMES[armor] || armor; }
  function canWear(id, armor) { const d = get(id); return !!d && d.armor === armor; }

  return { list, all, get, statsAt, growthDelta, pickRole, roleName, armorName, canWear,
    PRIMARY, ROLES, ROLE_NAMES, ARMOR_NAMES, TANK_CHANCE, DMG_MULT };
})();
if (typeof module !== 'undefined') module.exports = Classes;
