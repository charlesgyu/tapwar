// 아이템 데이터 — DESIGN.md §3.3
// 장비 템플릿(재질×슬롯×2티어 + 세트 3종 + 무기/장신구/가방), 소모품, 재료, 퀘스트 아이템, 조합 레시피.
// 무작위 생성(Items.generate)은 층에 맞는 등급 확률과 rare 이상 접사를 굴린다. 순수 데이터라 DOM 을 쓰지 않는다.
const Items = (() => {
  const GRADE_ORDER = ['common', 'uncommon', 'rare', 'legendary'];
  // mult 는 장비 기본 스탯 배수(Stats.derive 가 사용), priceMult 는 구매가 배수(Economy), beltSlots 는 벨트 칸 수(Inventory)
  const GRADES = {
    common:    { id: 'common',    name: '일반', mult: 1.0,  priceMult: 1,   beltSlots: 1, affixCount: [0, 0], color: '#f2f2f2' },
    uncommon:  { id: 'uncommon',  name: '고급', mult: 1.25, priceMult: 1.6, beltSlots: 2, affixCount: [0, 0], color: '#6fd36f' },
    rare:      { id: 'rare',      name: '레어', mult: 1.6,  priceMult: 3,   beltSlots: 3, affixCount: [1, 2], color: '#5aa0ff' },
    legendary: { id: 'legendary', name: '전설', mult: 2.2,  priceMult: 8,   beltSlots: 4, affixCount: [2, 3], color: '#ff9a3c' },
  };
  // 층별 등급 확률: 1~5층은 고정, 6층부터 10층 값으로 선형 보간
  const GRADE_W_F5 = [60, 30, 9, 1], GRADE_W_F10 = [30, 40, 25, 5];
  const SLOTS = ['neck', 'ring', 'ear', 'main', 'off', 'body', 'boots', 'gloves', 'hat', 'belt', 'bag'];
  const SLOT_NAMES = { neck: '목걸이', ring: '반지', ear: '귀걸이', main: '주무기', off: '보조', body: '옷', boots: '장화', gloves: '장갑', hat: '모자', belt: '벨트', bag: '가방' };
  const KIND_NAMES = { equip: '장비', consume: '소모품', material: '재료', misc: '기타', quest: '퀘스트' };
  const ARMOR_SLOTS = ['body', 'boots', 'gloves', 'hat', 'belt'];
  // 직업별 착용 가능 재질/무기. 사제는 천 + 지팡이/책만.
  const ARMOR_CLASSES = { cloth: ['priest', 'mage'], leather: ['hunter', 'rogue'], chain: ['spellblade'], plate: ['warrior', 'monk'] };
  const WEAPON_CLASSES = { staff: ['priest', 'mage'], book: ['priest', 'mage'], sword: ['warrior', 'spellblade'], bow: ['hunter'], dagger: ['rogue'], knuckle: ['monk'] };
  const BASE_DURABILITY = 100;

  // ---- 접사: rare 이상. 퍼센트형은 정수 %(10 = 10%), 평탄형은 그대로 더한다(Stats.derive 규약) ----
  const affixPool = [
    { stat: 'mp_regen',   name: '마나 회복', kind: 'flat', unit: '/초', min: 0.5, max: 1.2, perFloor: 0.1, decimals: 1 },
    { stat: 'cast_speed', name: '시전 속도', kind: 'pct',  unit: '%',  min: 5, max: 10, perFloor: 0.5 },
    { stat: 'mp_cost',    name: '마나 소비', kind: 'pct',  unit: '%',  min: 5, max: 10, perFloor: 0.5, sign: '-' },
    { stat: 'move_speed', name: '이동 속도', kind: 'pct',  unit: '%',  min: 4, max: 8, perFloor: 0.3 },
    { stat: 'heal_power', name: '치유량',    kind: 'pct',  unit: '%',  min: 5, max: 10, perFloor: 0.6 },
    { stat: 'int',        name: '지능',      kind: 'flat', unit: '',   min: 2, max: 4, perFloor: 0.5 },
    { stat: 'vit',        name: '체력',      kind: 'flat', unit: '',   min: 2, max: 4, perFloor: 0.5 },
    { stat: 'def',        name: '방어력',    kind: 'flat', unit: '',   min: 2, max: 4, perFloor: 0.5 },
    { stat: 'crit',       name: '치명타',    kind: 'pct',  unit: '%',  min: 3, max: 6, perFloor: 0.3 },
  ];
  const AFFIX_BY_STAT = Object.fromEntries(affixPool.map((a) => [a.stat, a]));
  const LEGENDARY_AFFIX_MULT = 1.3;

  // ---- 세트(천, 사제용 5부위). 효과는 DESIGN 공통: 2셋 int+10%, 3/4/5셋 10% 확률 발동 ----
  const SET_BONUSES = [
    { pieces: 2, type: 'stat_pct', stat: 'int', value: 10, desc: '지능 +10%' },
    { pieces: 3, type: 'proc', proc: 'free_mana', chance: 0.1, desc: '10% 확률로 마나 무소비' },
    { pieces: 4, type: 'proc', proc: 'instant_basic', chance: 0.1, desc: '10% 확률로 기본 힐 즉시 시전' },
    { pieces: 5, type: 'proc', proc: 'instant_aoe', chance: 0.1, desc: '10% 확률로 광역 힐 즉시 시전' },
  ];
  const SETS = {
    novice_cloth: { id: 'novice_cloth', name: '수습 사제', floorMin: 1, floorMax: 4, mult: 1.3, priceMult: 1.5, icon: '👕', desc: '신전이 수습 사제에게 내리는 옷. 소박하지만 기도를 잘 담는다.' },
    forest_leaf:  { id: 'forest_leaf',  name: '숲잎',     floorMin: 3, floorMax: 6, mult: 2.0, priceMult: 3,   icon: '🍃', desc: '탑이 삼킨 숲의 잎사귀로 짠 옷. 숲 정령의 가호가 깃들어 있다.' },
    cave_crystal: { id: 'cave_crystal', name: '수정',     floorMin: 6, floorMax: 10, mult: 3.2, priceMult: 6,  icon: '💠', desc: '동굴 수정 가루를 실에 먹여 짠 옷. 마력이 끊임없이 흐른다.' },
  };
  for (const s of Object.values(SETS)) { s.bonuses = SET_BONUSES.map((b) => Object.assign({}, b)); s.pieces = []; }

  // ---- 방어구: 재질 4 × 슬롯 5 × 티어 2(숲 1~5층 / 동굴 6~10층) = 40 ----
  const MATERIAL = {
    cloth:   { name: '천',   tier2: '달빛', icon: '👕', stats: { def: 3, int: 3 } },
    leather: { name: '가죽', tier2: '그림자', icon: '🥋', stats: { def: 5, agi: 2 } },
    chain:   { name: '사슬', tier2: '강철', icon: '⛓', stats: { def: 7, str: 1 } },
    plate:   { name: '판금', tier2: '흑철', icon: '🛡', stats: { def: 9, vit: 1 } },
  };
  const ARMOR_SLOT = {
    body:   { ratio: 1.0, price: 120, noun: { cloth: '로브', leather: '조끼', chain: '갑옷', plate: '갑옷' } },
    boots:  { ratio: 0.5, price: 70, icon: '👢', noun: '장화' },
    gloves: { ratio: 0.5, price: 70, icon: '🧤', noun: '장갑' },
    hat:    { ratio: 0.6, price: 80, icon: '🎩', noun: { cloth: '후드', leather: '모자', chain: '투구', plate: '투구' } },
    belt:   { ratio: 0.4, price: 90, icon: '🪢', noun: '벨트' },
  };
  const ARMOR_TIERS = [
    { n: 1, floorMin: 1, floorMax: 5, mult: 1, priceMult: 1 },
    { n: 2, floorMin: 6, floorMax: 10, mult: 2.4, priceMult: 4 },
  ];
  const noun = (slot, armor) => { const n = ARMOR_SLOT[slot].noun; return typeof n === 'string' ? n : n[armor]; };
  const scaleStats = (stats, mult) => {
    const out = {};
    for (const [k, v] of Object.entries(stats)) out[k] = Math.max(1, Math.round(v * mult));
    return out;
  };
  function armorDef(armor, slot, tier) {
    const m = MATERIAL[armor], s = ARMOR_SLOT[slot];
    const prefix = tier.n === 1 ? m.name : m.tier2;
    return {
      id: `${armor}_${slot}_${tier.n}`, name: `${prefix} ${noun(slot, armor)}`, kind: 'equip', slot, armor,
      baseStats: scaleStats(m.stats, s.ratio * tier.mult), price: Math.round(s.price * tier.priceMult),
      icon: s.icon || m.icon, floorMin: tier.floorMin, floorMax: tier.floorMax,
      desc: `${prefix}으로 만든 ${noun(slot, armor)}. ${m.name} 재질이라 ${armorWearers(armor)}이(가) 입는다.`,
    };
  }
  function armorWearers(armor) {
    const names = { priest: '사제', mage: '마법사', hunter: '사냥꾼', rogue: '도적', spellblade: '마검사', warrior: '전사', monk: '무투가' };
    return ARMOR_CLASSES[armor].map((c) => names[c]).join('·');
  }
  function setDef(set, slot) {
    const s = ARMOR_SLOT[slot];
    const def = {
      id: `${set.id}_${slot}`, name: `${set.name} ${noun(slot, 'cloth')}`, kind: 'equip', slot, armor: 'cloth', setId: set.id,
      baseStats: scaleStats({ def: 3, int: 4 }, s.ratio * set.mult), price: Math.round(s.price * set.priceMult),
      icon: s.icon || set.icon, floorMin: set.floorMin, floorMax: set.floorMax, weight: 0.4, desc: set.desc,
    };
    set.pieces.push(def.id);
    return def;
  }
  const ARMOR = [];
  for (const armor of Object.keys(MATERIAL)) for (const slot of ARMOR_SLOTS) for (const tier of ARMOR_TIERS) ARMOR.push(armorDef(armor, slot, tier));
  for (const set of Object.values(SETS)) for (const slot of ARMOR_SLOTS) ARMOR.push(setDef(set, slot));

  // ---- 무기·장신구·가방 ----
  const E = (o) => Object.assign({ kind: 'equip', baseStats: {} }, o);
  const WEAPONS = [
    // 양손 지팡이(main, hands 'two')
    E({ id: 'staff_wood_two', name: '나무 지팡이', slot: 'main', hands: 'two', weapon: 'staff', icon: '🪄', price: 150, baseStats: { int: 6 }, floorMin: 1, floorMax: 3, desc: '곧게 자란 가지를 다듬은 지팡이. 수습 사제의 첫 무기.' }),
    E({ id: 'staff_oak_two', name: '참나무 지팡이', slot: 'main', hands: 'two', weapon: 'staff', icon: '🪄', price: 400, baseStats: { int: 10, vit: 2 }, floorMin: 3, floorMax: 6, desc: '숲의 오래된 참나무로 깎았다. 묵직하지만 마력이 잘 흐른다.' }),
    E({ id: 'staff_crystal_two', name: '수정 지팡이', slot: 'main', hands: 'two', weapon: 'staff', icon: '🪄', price: 1200, baseStats: { int: 16, vit: 3 }, floorMin: 6, floorMax: 10, desc: '끝에 동굴 수정을 박은 지팡이. 치유의 빛이 더 멀리 닿는다.' }),
    E({ id: 'staff_dragon_two', name: '용골 지팡이', slot: 'main', hands: 'two', weapon: 'staff', icon: '🪄', price: 3000, gradeMin: 'rare', baseStats: { int: 22, vit: 4, heal_power: 5 }, floorMin: 9, floorMax: 10, weight: 0.3, desc: '드래곤의 뼈로 만든 지팡이. 탑의 심장 가까이에서만 나온다.' }),
    // 한손 지팡이(main, hands 'main') + 책(off)
    E({ id: 'wand_wood', name: '나무 완드', slot: 'main', hands: 'main', weapon: 'staff', icon: '🪄', price: 110, baseStats: { int: 4 }, floorMin: 1, floorMax: 4, desc: '한 손으로 쥐는 짧은 지팡이. 다른 손에 책을 들 수 있다.' }),
    E({ id: 'wand_moon', name: '달빛 완드', slot: 'main', hands: 'main', weapon: 'staff', icon: '🪄', price: 350, baseStats: { int: 7, vit: 1 }, floorMin: 3, floorMax: 7, desc: '달빛을 머금은 은나무 완드.' }),
    E({ id: 'wand_crystal', name: '수정 완드', slot: 'main', hands: 'main', weapon: 'staff', icon: '🪄', price: 1000, baseStats: { int: 11, vit: 2 }, floorMin: 6, floorMax: 10, desc: '수정 결정을 깎아 만든 완드. 가볍고 날카롭게 마력을 모은다.' }),
    E({ id: 'book_prayer', name: '기도서', slot: 'off', hands: 'off', weapon: 'book', icon: '📖', price: 120, baseStats: { int: 3, mp_regen: 0.5 }, floorMin: 1, floorMax: 4, desc: '신전의 기도문을 적은 책. 읽을수록 마나가 돌아온다.' }),
    E({ id: 'book_moon', name: '달빛 성서', slot: 'off', hands: 'off', weapon: 'book', icon: '📖', price: 380, baseStats: { int: 5, mp_regen: 1 }, floorMin: 3, floorMax: 7, desc: '달빛 아래서만 읽히는 성서.' }),
    E({ id: 'book_crystal', name: '수정 성서', slot: 'off', hands: 'off', weapon: 'book', icon: '📖', price: 1100, baseStats: { int: 8, mp_regen: 1.5, heal_power: 3 }, floorMin: 6, floorMax: 10, desc: '수정 가루로 글자를 새긴 성서. 치유의 문장이 빛난다.' }),
    // 파티원용 무기(드랍 → 판매/분해용. 사제는 못 든다)
    E({ id: 'sword_iron', name: '쇠검', slot: 'main', hands: 'main', weapon: 'sword', icon: '🗡', price: 140, baseStats: { str: 6 }, floorMin: 1, floorMax: 5, desc: '병사들이 쓰는 평범한 검.' }),
    E({ id: 'sword_steel', name: '강철검', slot: 'main', hands: 'main', weapon: 'sword', icon: '🗡', price: 560, baseStats: { str: 12, def: 2 }, floorMin: 6, floorMax: 10, desc: '잘 벼린 강철검. 전사와 마검사가 쓴다.' }),
    E({ id: 'bow_short', name: '단궁', slot: 'main', hands: 'two', weapon: 'bow', icon: '🏹', price: 140, baseStats: { agi: 5, str: 2 }, floorMin: 1, floorMax: 5, desc: '숲에서 쓰기 좋은 짧은 활.' }),
    E({ id: 'bow_long', name: '장궁', slot: 'main', hands: 'two', weapon: 'bow', icon: '🏹', price: 560, baseStats: { agi: 10, str: 4 }, floorMin: 6, floorMax: 10, desc: '멀리까지 쏘는 긴 활. 사냥꾼의 자랑.' }),
    E({ id: 'dagger_iron', name: '쇠 단검', slot: 'main', hands: 'main', weapon: 'dagger', icon: '🔪', price: 130, baseStats: { agi: 6 }, floorMin: 1, floorMax: 5, desc: '가볍고 빠른 단검.' }),
    E({ id: 'dagger_shadow', name: '그림자 단검', slot: 'main', hands: 'main', weapon: 'dagger', icon: '🔪', price: 540, baseStats: { agi: 12, str: 2 }, floorMin: 6, floorMax: 10, desc: '빛을 삼키는 검은 단검. 도적이 탐낸다.' }),
    E({ id: 'knuckle_iron', name: '쇠 너클', slot: 'main', hands: 'main', weapon: 'knuckle', icon: '👊', price: 130, baseStats: { str: 5, agi: 3 }, floorMin: 1, floorMax: 5, desc: '주먹에 끼우는 쇠 장갑.' }),
    E({ id: 'knuckle_steel', name: '강철 너클', slot: 'main', hands: 'main', weapon: 'knuckle', icon: '👊', price: 540, baseStats: { str: 10, agi: 5 }, floorMin: 6, floorMax: 10, desc: '무투가의 강철 주먹.' }),
  ];
  const ACCESSORIES = [
    E({ id: 'neck_wood', name: '나무 목걸이', slot: 'neck', icon: '📿', price: 90, baseStats: { vit: 2 }, floorMin: 1, floorMax: 4, weight: 0.6, desc: '나무 구슬을 꿴 소박한 목걸이.' }),
    E({ id: 'neck_silver', name: '은 목걸이', slot: 'neck', icon: '📿', price: 320, baseStats: { vit: 4, int: 2 }, floorMin: 3, floorMax: 7, weight: 0.6, desc: '은으로 만든 목걸이. 저주를 조금 막아 준다고 한다.' }),
    E({ id: 'neck_moonstone', name: '월장석 목걸이', slot: 'neck', icon: '📿', price: 1000, baseStats: { vit: 6, int: 4, heal_power: 5 }, floorMin: 6, floorMax: 10, weight: 0.6, desc: '월장석이 박힌 목걸이. 치유의 빛을 키운다.' }),
    E({ id: 'ring_copper', name: '구리 반지', slot: 'ring', icon: '💍', price: 80, baseStats: { int: 2 }, floorMin: 1, floorMax: 4, weight: 0.6, desc: '구리로 만든 반지. 두 손에 하나씩 낄 수 있다.' }),
    E({ id: 'ring_silver', name: '은 반지', slot: 'ring', icon: '💍', price: 300, baseStats: { int: 4, mp_regen: 0.5 }, floorMin: 3, floorMax: 7, weight: 0.6, desc: '은 반지. 마나가 조금씩 돌아온다.' }),
    E({ id: 'ring_crystal', name: '수정 반지', slot: 'ring', icon: '💍', price: 950, baseStats: { int: 7, mp_regen: 1 }, floorMin: 6, floorMax: 10, weight: 0.6, desc: '수정을 박은 반지. 마력이 샘솟는다.' }),
    E({ id: 'ear_bead', name: '구슬 귀걸이', slot: 'ear', icon: '🧿', price: 80, baseStats: { agi: 2 }, floorMin: 1, floorMax: 4, weight: 0.6, desc: '작은 유리 구슬 귀걸이.' }),
    E({ id: 'ear_silver', name: '은 귀걸이', slot: 'ear', icon: '🧿', price: 300, baseStats: { agi: 3, int: 2 }, floorMin: 3, floorMax: 7, weight: 0.6, desc: '은 귀걸이. 몸이 가벼워진다.' }),
    E({ id: 'ear_crystal', name: '수정 귀걸이', slot: 'ear', icon: '🧿', price: 950, baseStats: { agi: 4, int: 5, cast_speed: 3 }, floorMin: 6, floorMax: 10, weight: 0.6, desc: '수정 귀걸이. 주문이 조금 빨라진다.' }),
  ];
  // 가방: 기본 20칸 + bagSize. 등급이 있어도 칸 수는 안 변한다(스탯이 없으므로).
  const BAGS = [
    E({ id: 'bag_s', name: '작은 가방', slot: 'bag', bagSize: 6, icon: '🎒', price: 200, floorMin: 1, floorMax: 5, weight: 0.3, desc: '가방 칸 +6.' }),
    E({ id: 'bag_m', name: '여행자 가방', slot: 'bag', bagSize: 12, icon: '🎒', price: 600, floorMin: 4, floorMax: 8, weight: 0.3, desc: '가방 칸 +12.' }),
    E({ id: 'bag_l', name: '큰 가방', slot: 'bag', bagSize: 20, icon: '🎒', price: 1500, floorMin: 7, floorMax: 10, weight: 0.3, desc: '가방 칸 +20.' }),
  ];

  // ---- 소모품. effect 의 fatigue 는 증감값(음수면 회복), buff 는 G.player.buffs 로 들어간다(Inventory.useConsumable) ----
  const C = (o) => Object.assign({ kind: 'consume', stack: 99, baseStats: {}, shop: true }, o);
  const CONSUMABLES = [
    C({ id: 'hp_potion_s', name: '작은 HP 포션', icon: '🧪', price: 30, effect: { hp: 80 }, desc: 'HP를 80 회복한다.' }),
    C({ id: 'hp_potion_m', name: 'HP 포션', icon: '🧪', price: 90, effect: { hp: 250 }, desc: 'HP를 250 회복한다.' }),
    C({ id: 'hp_potion_l', name: '큰 HP 포션', icon: '🧪', price: 250, effect: { hp: 600 }, desc: 'HP를 600 회복한다.' }),
    C({ id: 'mp_potion_s', name: '작은 MP 포션', icon: '🔮', price: 35, effect: { mp: 60 }, desc: 'MP를 60 회복한다.' }),
    C({ id: 'mp_potion_m', name: 'MP 포션', icon: '🔮', price: 100, effect: { mp: 180 }, desc: 'MP를 180 회복한다.' }),
    C({ id: 'mp_potion_l', name: '큰 MP 포션', icon: '🔮', price: 280, effect: { mp: 450 }, desc: 'MP를 450 회복한다.' }),
    C({ id: 'antidote', name: '해독제', icon: '🌿', price: 50, effect: { cleanse: 1 }, desc: '저주를 하나 풀어 준다. 속박·치유 저해·맹독부터.' }),
    C({ id: 'scroll_return', name: '귀환 두루마리', icon: '📜', price: 80, effect: { teleport: 'town' }, desc: '탑 어디서든 마을로 돌아간다.' }),
    C({ id: 'auction_reset_ticket', name: '경매장 리셋권', icon: '🎫', price: 1, currency: 'gems', shop: false, stack: 20, effect: { resetTickets: 1 }, desc: '경매장 목록을 즉시 새로 고친다. 보석으로 산다.' }),
    C({ id: 'food_bread', name: '보리빵', icon: '🍞', price: 20, shop: false, effect: { fatigue: -20, buff: { stat: 'vit', value: 0.1, duration: 600 } }, desc: '피로 -20. 10분 동안 체력 +10%.' }),
    C({ id: 'food_stew', name: '사슴 고기 스튜', icon: '🍲', price: 45, shop: false, effect: { fatigue: -20, buff: { stat: 'int', value: 0.1, duration: 600 } }, desc: '피로 -20. 10분 동안 지능 +10%.' }),
    C({ id: 'food_pie', name: '숲 열매 파이', icon: '🥧', price: 35, shop: false, effect: { fatigue: -20, buff: { stat: 'agi', value: 0.1, duration: 600 } }, desc: '피로 -20. 10분 동안 민첩 +10%.' }),
  ];

  // ---- 재료: tier 는 분해 결과 등급(Economy.disassemble) ----
  const M = (o) => Object.assign({ kind: 'material', stack: 99, baseStats: {} }, o);
  const MATERIALS = [
    M({ id: 'thread', name: '실', icon: '🧵', price: 6, tier: 'basic', desc: '천 장비를 만들고 분해하면 나온다.' }),
    M({ id: 'leather', name: '가죽', icon: '🟫', price: 12, tier: 'basic', desc: '짐승 가죽. 가방과 가죽 장비의 재료.' }),
    M({ id: 'iron_scrap', name: '쇠조각', icon: '⚙', price: 10, tier: 'basic', desc: '녹슨 쇠붙이. 사슬·판금 장비를 분해하면 나온다.' }),
    M({ id: 'wood', name: '나무', icon: '🪵', price: 8, tier: 'basic', desc: '단단한 나무. 지팡이의 재료.' }),
    M({ id: 'herb', name: '약초', icon: '🌱', price: 10, tier: 'basic', desc: '숲에서 자라는 약초. 포션의 재료.' }),
    M({ id: 'magic_powder', name: '마법가루', icon: '✨', price: 25, tier: 'mid', desc: '마력이 깃든 가루. 두루마리와 완드의 재료.' }),
    M({ id: 'spider_silk', name: '거미줄', icon: '🕸', price: 20, tier: 'mid', desc: '질긴 거미줄. 숲잎 장비의 실로 쓴다.' }),
    M({ id: 'monster_tooth', name: '괴물 이빨', icon: '🦷', price: 15, tier: 'mid', desc: '괴물의 이빨. 상인이 사 준다.' }),
    M({ id: 'crystal', name: '수정', icon: '💠', price: 60, tier: 'high', desc: '동굴 수정. 수정 장비의 핵심 재료.' }),
    M({ id: 'moonstone', name: '월장석', icon: '🌙', price: 120, tier: 'high', desc: '달빛을 머금은 돌. 장신구에 쓴다.' }),
    M({ id: 'holy_water', name: '성수', icon: '💧', price: 40, tier: 'high', desc: '신전에서 축복한 물. 해독제의 재료.' }),
    M({ id: 'dragon_scale', name: '용 비늘', icon: '🐉', price: 400, tier: 'top', desc: '드래곤의 비늘. 전설 장비를 분해해야 나온다.' }),
  ];

  // ---- 퀘스트 아이템: 층별 숨겨진 상자의 두루마리. 줍는 순간 히든 퀘스트가 열린다(Quests) ----
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const QUEST_ITEMS = [];
  for (let f = 1; f <= 10; f++) {
    QUEST_ITEMS.push({ id: `scroll_hidden_f${f}`, name: `잿빛 두루마리 ${ROMAN[f - 1]}`, kind: 'quest', icon: '📜', price: 0, stack: 1, baseStats: {},
      floorMin: f, floorMax: f, desc: `${f}층 숨겨진 상자에서 나온 두루마리. 탑의 옛 주인이 남긴 글이 적혀 있다.` });
  }

  // ---- 조합 레시피(대장간). grade 는 결과 등급, qty 는 결과 개수 ----
  const R = (o) => Object.assign({ grade: 'common', qty: 1 }, o);
  const RECIPES = [
    R({ id: 'craft_hp_potion_m', name: 'HP 포션 조합', result: 'hp_potion_m', qty: 2, materials: { herb: 3, thread: 1 }, gold: 30 }),
    R({ id: 'craft_mp_potion_m', name: 'MP 포션 조합', result: 'mp_potion_m', qty: 2, materials: { magic_powder: 2, herb: 1 }, gold: 40 }),
    R({ id: 'craft_antidote', name: '해독제 조합', result: 'antidote', qty: 2, materials: { herb: 2, holy_water: 1 }, gold: 30 }),
    R({ id: 'craft_scroll_return', name: '귀환 두루마리 제작', result: 'scroll_return', materials: { magic_powder: 2, thread: 1 }, gold: 50 }),
    R({ id: 'craft_staff_oak', name: '참나무 지팡이 제작', result: 'staff_oak_two', grade: 'uncommon', materials: { wood: 6, magic_powder: 2 }, gold: 200 }),
    R({ id: 'craft_staff_crystal', name: '수정 지팡이 제작', result: 'staff_crystal_two', grade: 'rare', materials: { crystal: 5, wood: 4, magic_powder: 3 }, gold: 700 }),
    R({ id: 'craft_book_moon', name: '달빛 성서 제작', result: 'book_moon', grade: 'rare', materials: { thread: 3, magic_powder: 4, moonstone: 1 }, gold: 400 }),
    R({ id: 'craft_ring_crystal', name: '수정 반지 세공', result: 'ring_crystal', grade: 'rare', materials: { crystal: 3, iron_scrap: 2 }, gold: 350 }),
    R({ id: 'craft_neck_moonstone', name: '월장석 목걸이 세공', result: 'neck_moonstone', grade: 'rare', materials: { moonstone: 1, thread: 2, iron_scrap: 2 }, gold: 400 }),
    R({ id: 'craft_bag_m', name: '여행자 가방 제작', result: 'bag_m', materials: { leather: 8, thread: 6 }, gold: 300 }),
    R({ id: 'craft_bag_l', name: '큰 가방 제작', result: 'bag_l', materials: { leather: 15, thread: 10, spider_silk: 4 }, gold: 800 }),
    R({ id: 'craft_forest_leaf_body', name: '숲잎 로브 제작', result: 'forest_leaf_body', grade: 'rare', materials: { thread: 6, spider_silk: 3, magic_powder: 2 }, gold: 500 }),
    R({ id: 'craft_forest_leaf_boots', name: '숲잎 장화 제작', result: 'forest_leaf_boots', grade: 'rare', materials: { leather: 2, thread: 4, spider_silk: 2 }, gold: 400 }),
    R({ id: 'craft_forest_leaf_gloves', name: '숲잎 장갑 제작', result: 'forest_leaf_gloves', grade: 'rare', materials: { thread: 4, spider_silk: 2, herb: 2 }, gold: 400 }),
    R({ id: 'craft_forest_leaf_hat', name: '숲잎 후드 제작', result: 'forest_leaf_hat', grade: 'rare', materials: { thread: 4, spider_silk: 2, magic_powder: 1 }, gold: 420 }),
    R({ id: 'craft_forest_leaf_belt', name: '숲잎 벨트 제작', result: 'forest_leaf_belt', grade: 'rare', materials: { leather: 3, spider_silk: 2, thread: 2 }, gold: 450 }),
    R({ id: 'craft_cave_crystal_body', name: '수정 로브 제작', result: 'cave_crystal_body', grade: 'rare', materials: { crystal: 6, thread: 6, magic_powder: 4 }, gold: 900 }),
    R({ id: 'craft_cave_crystal_boots', name: '수정 장화 제작', result: 'cave_crystal_boots', grade: 'rare', materials: { crystal: 3, leather: 3, thread: 4 }, gold: 700 }),
    R({ id: 'craft_cave_crystal_gloves', name: '수정 장갑 제작', result: 'cave_crystal_gloves', grade: 'rare', materials: { crystal: 3, thread: 4, magic_powder: 2 }, gold: 700 }),
    R({ id: 'craft_cave_crystal_hat', name: '수정 후드 제작', result: 'cave_crystal_hat', grade: 'rare', materials: { crystal: 4, thread: 4, moonstone: 1 }, gold: 750 }),
    R({ id: 'craft_cave_crystal_belt', name: '수정 벨트 제작', result: 'cave_crystal_belt', grade: 'rare', materials: { crystal: 3, leather: 4, thread: 2 }, gold: 800 }),
    R({ id: 'craft_staff_dragon', name: '용골 지팡이 제작', result: 'staff_dragon_two', grade: 'legendary', materials: { dragon_scale: 2, crystal: 6, magic_powder: 6 }, gold: 3000 }),
  ];
  const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

  const EQUIP = [...ARMOR, ...WEAPONS, ...ACCESSORIES, ...BAGS];
  const ALL = [...EQUIP, ...CONSUMABLES, ...MATERIALS, ...QUEST_ITEMS];
  const BY_ID = Object.fromEntries(ALL.map((d) => [d.id, d]));

  // ---- 조회 ----
  function get(id) { return BY_ID[id] || null; }
  function all() { return ALL.slice(); }
  function list() { return ALL.map((d) => d.id); }
  function byKind(kind) { return ALL.filter((d) => d.kind === kind); }
  function equipment() { return EQUIP.slice(); }
  function consumables() { return CONSUMABLES.slice(); }
  function materials() { return MATERIALS.slice(); }
  function recipes() { return RECIPES.slice(); }
  function recipe(id) { return RECIPE_BY_ID[id] || null; }
  function forSlot(slot) { return EQUIP.filter((d) => d.slot === slot); }
  function gradeName(grade) { return GRADES[grade] ? GRADES[grade].name : grade; }
  function slotName(slot) { return SLOT_NAMES[slot] || slot; }
  function kindName(kind) { return KIND_NAMES[kind] || kind; }
  function isEquip(def) { return !!def && def.kind === 'equip'; }
  function isStackable(def) { return !!def && def.kind !== 'equip' && (def.stack || 1) > 1; }
  function gradeIndex(grade) { return Math.max(0, GRADE_ORDER.indexOf(grade)); }

  // 착용 가능 여부: 재질은 Classes.canWear(있으면)로, 무기는 내장 표로 판단. 장신구·가방은 누구나.
  function canUse(def, cls) {
    if (!def || def.kind !== 'equip') return false;
    if (!cls) return true;
    if (def.armor) {
      if (typeof Classes !== 'undefined' && Classes.canWear) return Classes.canWear(cls, def.armor);
      return (ARMOR_CLASSES[def.armor] || []).includes(cls);
    }
    if (def.weapon) return (WEAPON_CLASSES[def.weapon] || []).includes(cls);
    return true;
  }

  function setBonus(setId, count) {
    const s = SETS[setId]; if (!s) return [];
    return s.bonuses.filter((b) => b.pieces <= (count | 0)).map((b) => Object.assign({}, b));
  }

  // 층별 등급 가중치 [{ id, weight }]. 1~5층 60/30/9/1 → 10층 30/40/25/5.
  function gradeWeights(floor = 1) {
    const f = Math.min(10, Math.max(1, floor || 1));
    const t = f <= 5 ? 0 : (f - 5) / 5;
    return GRADE_ORDER.map((id, i) => ({ id, weight: GRADE_W_F5[i] + (GRADE_W_F10[i] - GRADE_W_F5[i]) * t }));
  }

  // ---- 접사 ----
  function rollAffixValue(a, grade, floor, rng) {
    let v = rng.float(a.min, a.max) + a.perFloor * (Math.max(1, floor) - 1);
    if (grade === 'legendary') v *= LEGENDARY_AFFIX_MULT;
    const p = Math.pow(10, a.decimals || 0);
    return Math.round(v * p) / p;
  }
  function rollAffixes(grade, floor, rng) {
    const [min, max] = GRADES[grade].affixCount;
    const n = max ? rng.int(min, max) : 0;
    if (!n) return [];
    return rng.shuffle(affixPool).slice(0, n).map((a) => ({ stat: a.stat, value: rollAffixValue(a, grade, floor, rng) }));
  }
  function affixText(affix) {
    const a = AFFIX_BY_STAT[affix.stat];
    if (!a) return `${affix.stat} +${affix.value}`;
    return `${a.name} ${a.sign || '+'}${affix.value}${a.unit}`;
  }
  // 등급 배수를 적용한 장비 스탯(UI 표시용). 내구도 0 이면 절반(Stats.derive 와 같은 규칙).
  function statsOf(inst) {
    const def = get(inst && inst.id); if (!def || def.kind !== 'equip') return {};
    const mult = GRADES[inst.grade] ? GRADES[inst.grade].mult : 1;
    const broken = typeof inst.durability === 'number' && inst.durability <= 0 ? 0.5 : 1;
    const out = {};
    for (const [k, v] of Object.entries(def.baseStats || {})) out[k] = Math.round(v * mult * broken * 10) / 10;
    return out;
  }

  // ---- 생성 ----
  let uidCounter = 1;
  function newUid() {
    if (typeof State !== 'undefined' && State.uid) return State.uid();
    uidCounter++; return 'i' + uidCounter.toString(36);
  }
  function rngOf(opts) {
    if (opts && opts.rng) return opts.rng;
    if (typeof RNG !== 'undefined') return RNG.global();
    return { next: Math.random, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), float: (a, b) => a + Math.random() * (b - a), weighted: (xs) => xs[0], shuffle: (xs) => xs.slice() };
  }
  const inFloor = (d, floor) => floor == null || ((d.floorMin == null || d.floorMin <= floor) && (d.floorMax == null || d.floorMax >= floor));
  function matches(d, opts, cls, floor) {
    return (!opts.slot || d.slot === opts.slot) && (!opts.setId || d.setId === opts.setId) && (!opts.hands || d.hands === opts.hands)
      && (!opts.armor || d.armor === opts.armor) && (!opts.weapon || d.weapon === opts.weapon) && (!cls || canUse(d, cls)) && inFloor(d, floor);
  }
  // 조건에 맞는 템플릿 후보. 층 조건으로 비면 층을 무시하고 다시 찾는다(퀘스트 보상이 비는 일이 없도록).
  function candidates(opts) {
    const cls = opts.priestOnly ? 'priest' : opts.cls;
    const withFloor = EQUIP.filter((d) => matches(d, opts, cls, opts.floor));
    return withFloor.length ? withFloor : EQUIP.filter((d) => matches(d, opts, cls, null));
  }
  function pickGrade(def, opts, rng) {
    let grade = opts.grade && GRADES[opts.grade] ? opts.grade : rng.weighted(gradeWeights(opts.floor || 1)).id;
    if (def.gradeMin && gradeIndex(grade) < gradeIndex(def.gradeMin)) grade = def.gradeMin;
    return grade;
  }
  function instance(def, grade, qty) {
    const equip = def.kind === 'equip';
    const dur = equip ? def.durability || BASE_DURABILITY : null;
    return { uid: newUid(), id: def.id, grade, affixes: [], durability: dur, maxDurability: dur, qty: equip ? 1 : Math.max(1, qty | 0) };
  }
  // opts: { id?, slot?, grade?, floor?, rng?, priestOnly?|cls?, setId?, hands?, armor?, weapon?, qty? }
  function generate(opts = {}) {
    const rng = rngOf(opts);
    let def = opts.id ? get(opts.id) : null;
    if (!def && !opts.id) { const pool = candidates(opts); if (pool.length) def = rng.weighted(pool.map((d) => ({ d, weight: d.weight || 1 }))).d; }
    if (!def) return null;
    if (def.kind !== 'equip') return instance(def, def.grade || 'common', opts.qty);
    const inst = instance(def, pickGrade(def, opts, rng), 1);
    inst.affixes = rollAffixes(inst.grade, opts.floor || 1, rng);
    return inst;
  }
  // 무작위 요소 없는 생성(상점 재고, 보상 소모품, 재료)
  function make(id, qty = 1) { return generate({ id, qty }); }

  return { get, all, list, byKind, equipment, consumables, materials, recipes, recipe, forSlot,
    generate, make, statsOf, canUse, setBonus, gradeWeights, affixText, gradeName, slotName, kindName, isEquip, isStackable, gradeIndex,
    affixPool, SETS, GRADES, GRADE_ORDER, SLOTS, SLOT_NAMES, ARMOR_SLOTS, ARMOR_CLASSES, WEAPON_CLASSES, SET_BONUSES, BASE_DURABILITY };
})();
if (typeof module !== 'undefined') module.exports = Items;
