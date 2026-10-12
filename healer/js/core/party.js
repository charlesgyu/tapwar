// 파티 — DESIGN.md §6
// 파티원(memberInst) 생성과 파티 공통 처리(회복·경험치). 파티원은 플레이어를 제외한 최대 4명.
// 생성은 rng 를 받아 결정적으로 만든다(모험가 사무소는 날짜 시드, 길드는 길드 id 시드로 항상 같은 사람이 나오게).
const Party = (() => {
  const MAX = 4;
  const HIRE_BASE = 100, HIRE_PER_LEVEL = 40;

  // 한국어 이름 풀 — 2~3글자. 남/여 각 40명 이상이라 하루 6명·길드 12명이 겹치지 않는다.
  const MALE_NAMES = ['도윤', '서준', '하준', '지호', '민준', '예준', '시우', '유찬', '지후', '현우', '건우', '우진', '선우', '연우', '정우',
    '승우', '태양', '은찬', '이안', '준서', '시온', '율', '한결', '강', '무영', '준혁', '태오', '세진', '도현', '재민',
    '진우', '성민', '규현', '민재', '찬영', '동하', '현서', '지환', '로운', '하람', '단우', '백호', '설우', '온유'];
  const FEMALE_NAMES = ['서연', '지우', '하은', '민서', '지아', '수아', '하린', '윤서', '채원', '다은', '예린', '소율', '유나', '지민', '아린',
    '시아', '나은', '서윤', '가은', '하율', '유진', '은서', '세아', '해인', '초아', '라온', '별', '이슬', '다인', '연서',
    '리나', '세린', '보라', '주아', '예나', '단비', '솔', '하나', '소민', '유하', '태희', '혜원', '수빈', '봄'];
  // 성격 한 줄 — 파티 화면에서 사람 느낌을 주는 장식. 전투 로직엔 영향 없다.
  const PERSONALITIES = ['말수가 적지만 믿음직하다.', '늘 먼저 앞장선다.', '농담을 멈추지 않는다.', '돈 계산이 빠르다.', '겁이 많지만 도망치진 않는다.',
    '전투 후 꼭 장비를 손질한다.', '길을 잘 잃는다.', '몬스터 이름을 전부 외운다.', '힐러를 극진히 챙긴다.', '보상 분배에 예민하다.',
    '새벽마다 검을 닦는다.', '잘 먹고 잘 잔다.', '고향 이야기를 자주 한다.', '위험할수록 신이 난다.', '조용히 뒤를 지킨다.',
    '승부욕이 지나치다.', '노래를 흥얼거린다.', '약초를 줍는 버릇이 있다.', '사제를 스승처럼 따른다.', '숫자에 약하다.',
    '보물 상자에 눈이 빛난다.', '늘 한발 물러서 생각한다.', '동료를 가족처럼 여긴다.', '잠버릇이 험하다.', '칭찬에 약하다.'];
  // 직업별 무기 id(1~5층용 / 6층부터). 사제 파티원은 지팡이.
  const WEAPONS = {
    warrior: ['sword_iron', 'sword_steel'], monk: ['knuckle_iron', 'knuckle_steel'], mage: ['staff_wood_two', 'staff_crystal_two'],
    hunter: ['bow_short', 'bow_long'], rogue: ['dagger_iron', 'dagger_shadow'], spellblade: ['sword_iron', 'sword_steel'], priest: ['wand_wood', 'wand_crystal'],
  };
  // 파티원 장비 등급은 대부분 일반. 고급·레어는 가끔.
  const GEAR_GRADES = [{ id: 'common', weight: 70 }, { id: 'uncommon', weight: 25 }, { id: 'rare', weight: 5 }];

  // 브라우저에서 최상위 const 는 globalThis 프로퍼티가 아니므로 typeof 로만 존재를 확인한다
  const hasClasses = () => typeof Classes !== 'undefined';
  const hasItems = () => typeof Items !== 'undefined' && !!Items.generate;
  const hasStats = () => typeof Stats !== 'undefined' && !!Stats.derive;
  const emit = (name, payload) => { if (typeof Events !== 'undefined') Events.emit(name, payload); };
  let uidCounter = 0;
  function newUid() {
    if (typeof State !== 'undefined' && State.uid) return State.uid();
    uidCounter++; return 'm' + uidCounter.toString(36);
  }
  function hireCost(level) { return HIRE_BASE + Math.max(1, level | 0) * HIRE_PER_LEVEL; }

  // 레벨에 맞는 층(장비 티어·등급 기준). Floors 가 없으면 2레벨당 1층으로 어림한다.
  function floorForLevel(level) {
    if (typeof Floors !== 'undefined' && Floors.get) {
      for (let f = 1; f <= 10; f++) { const d = Floors.get(f); if (d && level <= d.levelRange[1]) return f; }
      return 10;
    }
    return Math.min(10, Math.max(1, Math.ceil(level / 2)));
  }
  // Items 가 없어도 memberInst 모양은 유지한다(Stats.derive 는 모르는 아이템을 무시한다)
  function gear(id, level, rng) {
    const floor = floorForLevel(level);
    if (hasItems()) return Items.generate({ id, grade: rng.weighted(GEAR_GRADES).id, floor, rng });
    return { uid: newUid(), id, grade: 'common', affixes: [], durability: 100, maxDurability: 100, qty: 1 };
  }
  function equipmentFor(cls, level, rng) {
    const armor = hasClasses() && Classes.get(cls) ? Classes.get(cls).armor : 'cloth';
    const tier = floorForLevel(level) >= 6 ? 2 : 1;
    const weapon = (WEAPONS[cls] || WEAPONS.priest)[tier - 1];
    return { body: gear(`${armor}_body_${tier}`, level, rng), main: gear(weapon, level, rng) };
  }
  function statsFor(cls, level) {
    if (hasClasses()) return Classes.statsAt(cls, level) || { str: 5, def: 5, agi: 5, sta: 5, int: 5, vit: 5 };
    return { str: 5, def: 5, agi: 5, sta: 5, int: 5, vit: 5 };
  }
  function roleFor(cls, rng) {
    if (hasClasses()) return Classes.pickRole(cls, rng) || 'melee';
    return cls === 'priest' ? 'healer' : 'melee';
  }
  function classList() { return hasClasses() ? Classes.list() : Object.keys(WEAPONS); }
  function refill(m, G) {
    if (!hasStats()) { m.hp = 100 + m.level * 10; m.mp = 50 + m.level * 5; return; }
    const d = Stats.derive(m, G);
    m.hp = d.maxHp; m.mp = d.maxMp;
  }

  // opts: { cls?, role?, name?, gender?: 'm'|'f', personality? } — 길드 고정 파티원처럼 정해진 사람을 만들 때 쓴다
  function generateMember(rng, level = 1, opts = {}) {
    const lv = Math.max(1, Math.min(40, level | 0));
    const cls = opts.cls || rng.pick(classList());
    const gender = opts.gender || (rng.chance(0.5) ? 'm' : 'f');
    const m = {
      uid: newUid(), name: opts.name || rng.pick(gender === 'm' ? MALE_NAMES : FEMALE_NAMES), cls, gender,
      role: opts.role || roleFor(cls, rng), level: lv, xp: 0,
      stats: statsFor(cls, lv), equipment: equipmentFor(cls, lv, rng),
      hireCost: hireCost(lv), personality: opts.personality || rng.pick(PERSONALITIES),
      hp: 0, mp: 0, buffs: [], curses: [],
    };
    refill(m);
    return m;
  }

  function members(G) { if (!Array.isArray(G.party)) G.party = []; return G.party; }
  function find(G, uid) { return members(G).find((m) => m.uid === uid) || null; }
  function isFull(G) { return members(G).length >= MAX; }
  function roles(G) {
    const out = { tank: 0, melee: 0, ranged: 0, healer: 0 };
    for (const m of members(G)) out[m.role] = (out[m.role] || 0) + 1;
    return out;
  }
  // 시설(사무소·길드)이 쓰는 추가/제거. 정원·중복만 본다(골드는 시설 몫).
  function add(G, m) {
    if (!m || isFull(G) || find(G, m.uid)) return false;
    members(G).push(m);
    emit('party_changed', { action: 'add', member: m, count: members(G).length });
    return true;
  }
  function remove(G, uid) {
    const list = members(G), i = list.findIndex((m) => m.uid === uid);
    if (i < 0) return null;
    const [m] = list.splice(i, 1);
    emit('party_changed', { action: 'remove', member: m, count: list.length });
    return m;
  }

  // 마을 복귀: 파티원과 플레이어 모두 HP/MP 를 채우고 저주를 지운다(버프는 시간제라 그대로 둔다)
  function heal(G) {
    for (const m of members(G)) { refill(m, G); m.curses = []; }
    if (G.player) { refill(G.player, G); G.player.curses = []; }
    emit('party_healed', { count: members(G).length });
  }
  // 전투 경험치는 파티원 전원에게 같은 양. Level 이 없으면 xp 만 쌓는다.
  function gainXp(G, xp) {
    const out = [];
    for (const m of members(G)) {
      if (typeof Level !== 'undefined' && Level.addXp) out.push(Level.addXp(m, xp, G));
      else { m.xp = (m.xp || 0) + Math.floor(xp); out.push({ levelsGained: 0, level: m.level }); }
    }
    return out;
  }

  const roleName = (r) => (hasClasses() ? Classes.roleName(r) : r);
  const className = (c) => (hasClasses() && Classes.get(c) ? Classes.get(c).name : c);
  // UI 한 줄: '서연 Lv.3 전사(탱커)'
  function describe(m) { return `${m.name} Lv.${m.level} ${className(m.cls)}(${roleName(m.role)})`; }

  return { generateMember, members, find, isFull, roles, add, remove, heal, gainXp, hireCost, describe, floorForLevel,
    MAX, MALE_NAMES, FEMALE_NAMES, PERSONALITIES, WEAPONS };
})();
if (typeof module !== 'undefined') module.exports = Party;
