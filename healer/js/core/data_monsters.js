// 몬스터·층 데이터 — DESIGN.md §3.4
// Monsters: 일반 26종 + 중간보스 30(층당 3, 엘리트 변형) + 층 보스 10, 능력 정의 30종.
// Floors: 1~5층 숲, 6~10층 동굴. 난이도 배수(mult)·저주 배수(curseMult)·몬스터 수·랜드마크.
// 모든 수치는 "1층 기준값"이고 실제 전투값은 Monsters.statsAt(def, floor) 가 층 배수를 곱해 만든다
// (보스도 같은 공식이라 6층 보스 base 가 5층 보다 작아 보일 수 있다 — mult 가 1.35→2.4 로 뛰기 때문).
const Monsters = (() => {
  const TILE = 32;
  const r1 = (v) => Math.round(v * 10) / 10;

  // ---------------------------------------------------------------------------
  // 능력 정의. windup 동안 텔레그래프가 차오르고 끝나면 발동한다(Combat/AIMonster).
  //  - aoe_circle: 반경 radius 1회 피해 atk×dmgMult
  //  - puddle: duration 동안 안에 있으면 초당 atk×dpsMult, curse 가 있으면 매 틱 확률 없이 1회 부여
  //  - cone: 시전자 전방 angle(도) 부채꼴, 길이 radius
  //  - charge: range 안의 대상에게 돌진, 경로 폭 radius 의 아군 피해
  //  - summon: 부하 소환(동시 6마리 제한은 AI 가 관리)
  //  - curse_volley: 대상에게 curses 중 count 개를 duration 초
  //  - enrage: 자신에게 buff(atk/aspd 비율) duration 초
  //  - heal_self: 최대 HP 의 pct 회복
  //  - roar: 반경 안 아군에게 atk_down, threatReset 이면 위협표 초기화(탱커가 다시 잡아야 함)
  // targetRule 'healer' 는 6층(동굴)부터만 쓰인다 — 1~5층 광역기는 전부 탱커 자리 중심.
  // ---------------------------------------------------------------------------
  const A = (o) => Object.assign({ radius: 0, cooldown: 12, targetRule: 'tank' }, o);
  const ABILITIES = {
    aoe_small:        A({ id: 'aoe_small', name: '내리찍기', type: 'aoe_circle', windup: 3, radius: TILE * 2, dmgMult: 1.6, cooldown: 10, desc: '탱커 자리에 작은 원. 다 차면 안의 모두가 피해.' }),
    aoe_medium:       A({ id: 'aoe_medium', name: '땅울림', type: 'aoe_circle', windup: 4, radius: TILE * 3, dmgMult: 2.0, cooldown: 14, desc: '탱커 자리에 중간 원.' }),
    aoe_large:        A({ id: 'aoe_large', name: '대지 분쇄', type: 'aoe_circle', windup: 5, radius: TILE * 5, dmgMult: 2.6, cooldown: 20, desc: '탱커 자리에 큰 원. 전원 빠져나와야 한다.' }),
    aoe_random:       A({ id: 'aoe_random', name: '낙석', type: 'aoe_circle', windup: 4, radius: TILE * 3, dmgMult: 2.0, cooldown: 12, targetRule: 'random', desc: '무작위 파티원 자리에 바위가 떨어진다.' }),
    aoe_healer_small: A({ id: 'aoe_healer_small', name: '힐러 저격', type: 'aoe_circle', windup: 3, radius: TILE * 2, dmgMult: 1.6, cooldown: 12, targetRule: 'healer', desc: '힐러 자리에 작은 원. 시전을 끊고 피해야 한다.' }),
    aoe_healer_large: A({ id: 'aoe_healer_large', name: '치유자 처단', type: 'aoe_circle', windup: 4.5, radius: TILE * 4, dmgMult: 1.8, cooldown: 18, targetRule: 'healer', desc: '힐러 자리에 큰 원.' }),
    puddle_poison_small: A({ id: 'puddle_poison_small', name: '독 웅덩이', type: 'puddle', windup: 3, radius: TILE * 2.25, duration: 5, dpsMult: 0.4, curse: 'dot', cooldown: 12, desc: '보라색 장판. 서 있으면 초당 피해와 맹독.' }),
    puddle_poison_large: A({ id: 'puddle_poison_large', name: '독안개 장판', type: 'puddle', windup: 5, radius: TILE * 4.5, duration: 6, dpsMult: 0.5, curse: 'dot', cooldown: 20, desc: '탱커 자리에 넓은 독 장판.' }),
    puddle_fire_small: A({ id: 'puddle_fire_small', name: '불씨 장판', type: 'puddle', windup: 3, radius: TILE * 2.5, duration: 5, dpsMult: 0.5, cooldown: 12, targetRule: 'random', desc: '무작위 파티원 자리에 불이 붙는다.' }),
    puddle_fire_large: A({ id: 'puddle_fire_large', name: '용암 장판', type: 'puddle', windup: 5, radius: TILE * 5, duration: 6, dpsMult: 0.6, cooldown: 22, desc: '탱커 자리에 거대한 불 장판.' }),
    puddle_shadow:    A({ id: 'puddle_shadow', name: '그림자 장판', type: 'puddle', windup: 4, radius: TILE * 3.5, duration: 6, dpsMult: 0.45, curse: 'heal_down', cooldown: 18, targetRule: 'healer', desc: '힐러 자리에 검은 장판. 안에서는 받는 힐이 반으로.' }),
    cone_breath_small: A({ id: 'cone_breath_small', name: '화염 숨결', type: 'cone', windup: 3, radius: TILE * 4.5, angle: 60, dmgMult: 2.0, cooldown: 12, desc: '전방 부채꼴 브레스.' }),
    cone_breath_large: A({ id: 'cone_breath_large', name: '잿빛 브레스', type: 'cone', windup: 4, radius: TILE * 7, angle: 80, dmgMult: 3.0, cooldown: 18, desc: '전방 넓은 브레스. 옆으로 돌아 피한다.' }),
    charge:           A({ id: 'charge', name: '돌진', type: 'charge', windup: 2.5, radius: TILE * 1.5, range: TILE * 10, dmgMult: 2.2, cooldown: 14, desc: '탱커에게 돌진. 경로 위의 아군도 맞는다.' }),
    charge_random:    A({ id: 'charge_random', name: '난폭한 돌진', type: 'charge', windup: 2.5, radius: TILE * 1.5, range: TILE * 10, dmgMult: 2.2, cooldown: 14, targetRule: 'random', desc: '무작위 파티원에게 돌진.' }),
    curse_volley:     A({ id: 'curse_volley', name: '저주 난사', type: 'curse_volley', windup: 3, curses: ['def_down', 'atk_down', 'aspd_down', 'spd_down'], count: 2, duration: 12, cooldown: 16, targetRule: 'random', desc: '무작위 파티원 둘에게 약화 저주.' }),
    curse_volley_healer: A({ id: 'curse_volley_healer', name: '침묵의 저주', type: 'curse_volley', windup: 3, curses: ['heal_down', 'root', 'dot'], count: 2, duration: 10, cooldown: 18, targetRule: 'healer', desc: '힐러에게 치유 저해·속박·맹독 중 둘.' }),
    enrage:           A({ id: 'enrage', name: '격노', type: 'enrage', windup: 1, buff: { atk: 0.4, aspd: 0.3 }, duration: 15, cooldown: 40, targetRule: 'self', desc: '15초 동안 공격력 +40%, 공격속도 +30%.' }),
    heal_self:        A({ id: 'heal_self', name: '재생', type: 'heal_self', windup: 2.5, pct: 0.15, cooldown: 25, targetRule: 'self', desc: '최대 HP 의 15% 회복. 시전 중 딜을 몰아넣어 끊는다.' }),
    roar:             A({ id: 'roar', name: '포효', type: 'roar', windup: 2, radius: TILE * 6, curse: 'atk_down', duration: 8, threatReset: true, cooldown: 24, targetRule: 'self', desc: '반경 안 아군 공격력 감소, 위협표 초기화.' }),
  };
  // summon 변형: 보스 가족별 부하. count 2~4.
  const SUMMONS = [
    ['summon_goblins', '부하 소집', 'goblin', 3, 30], ['summon_spiders', '알 부화', 'spider', 4, 32], ['summon_wolves', '늑대 부르기', 'wolf', 3, 30],
    ['summon_sirens', '합창', 'siren', 2, 34], ['summon_trolls', '전사 소집', 'troll', 2, 36], ['summon_golems', '파수꾼 기동', 'golem_stone', 2, 36],
    ['summon_naga', '근위대 소환', 'naga', 3, 34], ['summon_orcs', '전쟁 북소리', 'orc', 3, 32], ['summon_undead', '죽은 자의 부름', 'skeleton_knight', 3, 34],
    ['summon_drakes', '새끼 용 부르기', 'drake', 2, 40],
  ];
  for (const [id, name, mid, count, cooldown] of SUMMONS) {
    ABILITIES[id] = A({ id, name, type: 'summon', windup: 3, summon: { id: mid, count }, cooldown, targetRule: 'self', desc: `${name}: 부하 ${count}마리를 불러낸다. 시전 중엔 멈춘다.` });
  }

  // ---------------------------------------------------------------------------
  // 일반 몬스터. base 는 1층 기준, perFloor 는 층당 증가(생략 시 base 비율로 자동).
  // 공격력은 탱커 방어(1층 약 19 → 피해 -9.5)를 뚫어야 하므로 16 아래로는 두지 않는다.
  // ---------------------------------------------------------------------------
  const N = (id, name, family, biome, s, o = {}) => {
    const base = { hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, aspd: s.aspd, range: s.range || 28 };
    if (o.threatMult) base.threatMult = o.threatMult;
    return {
      id, name, family, biome, tags: o.tags || [], tier: 'normal', base, floorBase: biome.includes('forest') ? 1 : 6,
      perFloor: o.perFloor || { hp: Math.round(s.hp * 0.07), atk: r1(s.atk * 0.05), def: r1(s.def * 0.05) },
      abilities: o.abilities || [], curses: o.curses || [], xp: o.xp || 1, gold: o.gold || [2, 5], loot: o.loot || family,
      size: o.size || 1, sprite: o.sprite || id, desc: o.desc || '',
    };
  };
  const NORMALS = [
    // ---- 숲(1~5층) ----
    N('goblin', '고블린', 'goblin', ['forest'], { hp: 70, atk: 18, def: 3, spd: 95, aspd: 1.0 }, { tags: ['humanoid'], xp: 1, gold: [2, 6], desc: '쇠붙이를 모으는 작은 녀석. 떼로 몰려온다.' }),
    N('goblin_archer', '고블린 궁수', 'goblin', ['forest'], { hp: 55, atk: 20, def: 2, spd: 90, aspd: 0.8, range: 180 }, { tags: ['humanoid'], xp: 1.2, gold: [2, 6], desc: '멀리서 화살을 쏜다. 먼저 잡으면 편하다.' }),
    N('goblin_shaman', '고블린 주술사', 'goblin', ['forest'], { hp: 60, atk: 19, def: 2, spd: 85, aspd: 0.7, range: 160 }, { tags: ['humanoid', 'caster'], abilities: ['heal_self'], curses: [{ id: 'def_down', chance: 0.15 }], xp: 1.5, gold: [3, 8], desc: '동료를 살리려 들고 방어를 깎는 저주를 건다.' }),
    N('wolf', '늑대', 'wolf', ['forest'], { hp: 80, atk: 20, def: 3, spd: 150, aspd: 1.2 }, { tags: ['beast'], xp: 1.2, gold: [1, 4], loot: 'beast', desc: '빠르고 가죽이 좋다.' }),
    N('spider', '숲 거미', 'spider', ['forest'], { hp: 65, atk: 18, def: 2, spd: 120, aspd: 1.0 }, { tags: ['beast'], abilities: ['puddle_poison_small'], curses: [{ id: 'dot', chance: 0.2 }], xp: 1.2, gold: [1, 4], desc: '물리면 독. 해독제를 벨트에.' }),
    N('sheepie', '셰피', 'sheepie', ['forest'], { hp: 85, atk: 19, def: 4, spd: 110, aspd: 1.0 }, { tags: ['beast'], abilities: ['charge'], xp: 1.2, gold: [2, 5], loot: 'beast', desc: '양처럼 생겼지만 양이 아니다. 박치기한다.' }),
    N('zombie', '좀비', 'zombie', ['forest'], { hp: 150, atk: 19, def: 3, spd: 60, aspd: 0.7 }, { tags: ['undead'], curses: [{ id: 'dot', chance: 0.2 }, { id: 'aspd_down', chance: 0.1 }], xp: 1.4, gold: [1, 5], loot: 'undead', desc: '느리지만 질기다. 성스러운 일격이 잘 먹힌다.' }),
    N('skeleton', '해골', 'skeleton', ['forest', 'cave'], { hp: 95, atk: 21, def: 6, spd: 90, aspd: 1.0 }, { tags: ['undead'], xp: 1.4, gold: [2, 6], loot: 'undead', desc: '뼈만 남은 병사. 방어가 단단하다.' }),
    N('sprite', '숲 정령', 'sprite', ['forest'], { hp: 90, atk: 21, def: 2, spd: 130, aspd: 0.9, range: 150 }, { tags: ['spirit', 'caster'], curses: [{ id: 'root', chance: 0.15 }], xp: 1.6, gold: [2, 7], desc: '탑에 물든 정령. 덩굴로 발을 묶는다.' }),
    N('werewolf', '늑대인간', 'werewolf', ['forest'], { hp: 140, atk: 23, def: 4, spd: 150, aspd: 1.15 }, { tags: ['beast', 'humanoid'], abilities: ['charge'], curses: [{ id: 'dot', chance: 0.15 }], xp: 2.2, gold: [3, 9], loot: 'beast', desc: '달빛 아래 울부짖는다. 빠르고 세다.' }),
    N('siren', '세이렌', 'siren', ['forest'], { hp: 110, atk: 23, def: 3, spd: 100, aspd: 0.8, range: 170 }, { tags: ['caster'], abilities: ['curse_volley'], curses: [{ id: 'heal_down', chance: 0.2 }, { id: 'spd_down', chance: 0.15 }], xp: 2.0, gold: [4, 10], desc: '호수의 노래. 치유를 막고 발을 느리게 한다.' }),
    N('orc', '오크', 'orc', ['forest', 'cave'], { hp: 140, atk: 24, def: 5, spd: 100, aspd: 0.9 }, { tags: ['humanoid'], xp: 2.0, gold: [4, 10], desc: '탑에 고용된 약탈자.' }),
    N('orc_berserker', '오크 광전사', 'orc', ['forest', 'cave'], { hp: 160, atk: 26, def: 3, spd: 110, aspd: 1.05 }, { tags: ['humanoid'], abilities: ['enrage'], xp: 2.4, gold: [4, 11], desc: 'HP 가 낮을수록 세진다. 먼저 끝내라.' }),
    N('troll', '트롤', 'troll', ['forest'], { hp: 200, atk: 26, def: 6, spd: 85, aspd: 0.6, range: 36 }, { tags: ['giant'], abilities: ['aoe_small', 'heal_self'], xp: 2.6, gold: [5, 12], size: 2, desc: '오래 싸운다. 재생을 끊어야 한다.' }),
    N('treant', '타락한 나무 정령', 'sprite', ['forest'], { hp: 240, atk: 24, def: 10, spd: 60, aspd: 0.6, range: 40 }, { tags: ['spirit', 'plant'], abilities: ['aoe_small'], curses: [{ id: 'root', chance: 0.25 }], xp: 2.6, gold: [4, 10], size: 2, loot: 'sprite', desc: '숲의 수호자였던 것. 뿌리로 묶는다.' }),
    // ---- 동굴(6~10층) ----
    N('bat', '동굴 박쥐', 'bat', ['cave'], { hp: 55, atk: 22, def: 2, spd: 170, aspd: 1.4 }, { tags: ['beast', 'flying'], curses: [{ id: 'aspd_down', chance: 0.15 }], xp: 1.2, gold: [2, 6], loot: 'beast', desc: '떼로 날아든다. 날개짓이 공격을 둔하게 한다.' }),
    N('cave_spider', '동굴 거미', 'spider', ['cave'], { hp: 80, atk: 24, def: 4, spd: 130, aspd: 1.0 }, { tags: ['beast'], abilities: ['puddle_poison_small', 'aoe_healer_small'], curses: [{ id: 'dot', chance: 0.3 }], xp: 1.6, gold: [2, 7], loot: 'spider', threatMult: 0.7, desc: '동굴 거미는 힐러를 노린다. 탱커 옆에 붙어 있을 것.' }),
    N('golem_stone', '돌 골렘', 'golem', ['cave'], { hp: 180, atk: 26, def: 14, spd: 70, aspd: 0.5, range: 40 }, { tags: ['construct'], abilities: ['aoe_medium'], curses: [{ id: 'spd_down', chance: 0.2 }], xp: 2.4, gold: [5, 12], size: 2, desc: '느리지만 한 방이 무겁다. 원이 차기 전에 빠진다.' }),
    N('golem_crystal', '수정 골렘', 'golem', ['cave'], { hp: 150, atk: 27, def: 10, spd: 75, aspd: 0.6, range: 40 }, { tags: ['construct'], abilities: ['aoe_random', 'curse_volley'], curses: [{ id: 'def_down', chance: 0.2 }], xp: 2.8, gold: [6, 14], size: 2, desc: '붉은 수정을 떨어뜨린다. 저주를 뿌린다.' }),
    N('naga', '나가', 'naga', ['cave'], { hp: 110, atk: 26, def: 7, spd: 110, aspd: 0.9 }, { tags: ['humanoid', 'aquatic'], curses: [{ id: 'spd_down', chance: 0.2 }], xp: 2.2, gold: [5, 12], desc: '지하 호수의 전사. 꼬리로 발을 묶는다.' }),
    N('naga_priest', '나가 사제', 'naga', ['cave'], { hp: 90, atk: 23, def: 5, spd: 100, aspd: 0.8, range: 170 }, { tags: ['humanoid', 'aquatic', 'caster'], abilities: ['heal_self', 'curse_volley_healer'], curses: [{ id: 'heal_down', chance: 0.3 }], xp: 2.8, gold: [6, 14], threatMult: 0.7, desc: '섞여 있으면 먼저 잡는다. 안 그러면 회복한다.' }),
    N('orc_warlord', '오크 전사장', 'orc', ['cave'], { hp: 170, atk: 30, def: 9, spd: 105, aspd: 0.9, range: 36 }, { tags: ['humanoid'], abilities: ['roar', 'charge'], xp: 3.2, gold: [8, 18], size: 2, desc: '포효로 탱커의 어그로를 지운다.' }),
    N('troll_shaman', '트롤 주술사', 'troll', ['cave'], { hp: 130, atk: 25, def: 6, spd: 85, aspd: 0.6, range: 160 }, { tags: ['giant', 'caster'], abilities: ['heal_self', 'aoe_healer_small'], curses: [{ id: 'atk_down', chance: 0.2 }], xp: 3.0, gold: [7, 16], size: 2, threatMult: 0.8, desc: '동료를 살리고 힐러 자리에 주술을 떨어뜨린다.' }),
    N('wraith', '망령', 'wraith', ['cave'], { hp: 95, atk: 27, def: 5, spd: 130, aspd: 0.9, range: 150 }, { tags: ['undead', 'spirit'], abilities: ['curse_volley_healer'], curses: [{ id: 'heal_down', chance: 0.3 }, { id: 'dot', chance: 0.15 }], xp: 3.0, gold: [6, 15], threatMult: 0.6, desc: '벽을 지나 힐러에게 온다. 성스러운 일격에 약하다.' }),
    N('skeleton_knight', '해골 기사', 'skeleton', ['cave'], { hp: 160, atk: 28, def: 13, spd: 90, aspd: 0.8, range: 36 }, { tags: ['undead'], abilities: ['charge'], curses: [{ id: 'def_down', chance: 0.2 }], xp: 3.2, gold: [7, 16], size: 2, loot: 'undead', desc: '갑옷 입은 해골. 방어가 단단하고 돌진한다.' }),
    N('drake', '새끼 용', 'drake', ['cave'], { hp: 170, atk: 28, def: 9, spd: 120, aspd: 0.9, range: 44 }, { tags: ['dragon', 'flying'], abilities: ['cone_breath_small', 'puddle_fire_small'], curses: [{ id: 'dot', chance: 0.25 }], xp: 4.0, gold: [10, 22], size: 2, desc: '바르가의 새끼. 브레스와 불 장판.' }),
  ];
  const BY_ID = {};
  for (const m of NORMALS) BY_ID[m.id] = m;

  // ---------------------------------------------------------------------------
  // 중간보스: 일반의 엘리트 변형. 더 크고(size+1) HP ×4~5, 능력 1~2개. sprite 는 원본을 공유한다(스프라이트 수 절약).
  // ---------------------------------------------------------------------------
  function elite(baseId, id, name, o) {
    const b = BY_ID[baseId];
    const hpM = o.hp || 4.5, atkM = o.atk || 1.3, defM = o.def || 1.3;
    const base = Object.assign({}, b.base, { hp: Math.round(b.base.hp * hpM), atk: Math.round(b.base.atk * atkM), def: Math.round(b.base.def * defM) });
    const m = {
      id, name, family: b.family, biome: b.biome.slice(), tags: b.tags.slice(), tier: 'miniboss', base, floorBase: b.floorBase,
      perFloor: { hp: Math.round(b.perFloor.hp * hpM), atk: r1(b.perFloor.atk * atkM), def: r1(b.perFloor.def * defM) },
      abilities: o.abilities, curses: o.curses || b.curses.map((c) => Object.assign({}, c)),
      xp: r1(b.xp * 5), gold: [b.gold[0] * 5, b.gold[1] * 6], loot: b.loot, size: Math.min(3, (b.size || 1) + 1), sprite: b.sprite, desc: o.desc || '', elite: true, baseId,
    };
    BY_ID[id] = m;
    return m;
  }
  const MINIBOSSES = [
    // 1층
    elite('goblin', 'goblin_chief', '고블린 족장', { abilities: ['aoe_small'], desc: '왕의 오른팔. 부하들 사이에서 내리찍는다.' }),
    elite('wolf', 'wolf_alpha', '우두머리 늑대', { abilities: ['charge'], desc: '무리를 이끄는 늑대. 돌진이 아프다.' }),
    elite('sheepie', 'sheepie_big', '거대 셰피', { hp: 5, abilities: ['charge', 'aoe_small'], desc: '양이 아니다. 정말 아니다.' }),
    // 2층
    elite('spider', 'spider_broodmother', '거미 산모', { hp: 5, abilities: ['puddle_poison_small', 'summon_spiders'], desc: '알을 터뜨려 새끼를 부른다.' }),
    elite('goblin_shaman', 'goblin_shaman_elder', '고블린 대주술사', { abilities: ['heal_self', 'curse_volley'], desc: '저주를 두 개씩 건다.' }),
    elite('zombie', 'zombie_bloated', '부푼 좀비', { hp: 4, abilities: ['puddle_poison_small'], desc: '터지면 독이 퍼진다.' }),
    // 3층
    elite('werewolf', 'werewolf_howler', '울부짖는 늑대인간', { abilities: ['charge', 'enrage'], desc: '달을 보고 울면 격노한다.' }),
    elite('wolf', 'wolf_moon', '달빛 늑대', { hp: 5, atk: 1.5, abilities: ['charge', 'summon_wolves'], desc: '울음으로 무리를 부른다.' }),
    elite('skeleton', 'skeleton_captain', '해골 대장', { abilities: ['aoe_small'], desc: '옛 병사들의 대장. 방패가 단단하다.' }),
    // 4층
    elite('siren', 'siren_songstress', '세이렌 가수', { abilities: ['curse_volley', 'heal_self'], desc: '노래로 저주를 뿌리고 스스로를 치유한다.' }),
    elite('sprite', 'sprite_corrupted', '타락한 숲 정령', { abilities: ['aoe_small', 'curse_volley'], curses: [{ id: 'root', chance: 0.3 }], desc: '덩굴이 사방에서 솟는다.' }),
    elite('orc', 'orc_raider', '오크 약탈대장', { abilities: ['charge', 'aoe_small'], desc: '마을 물건을 뺏어 간 장본인.' }),
    // 5층
    elite('troll', 'troll_warlord', '트롤 전장', { hp: 4, abilities: ['aoe_medium', 'heal_self'], desc: '족장의 호위. 몽둥이 한 방에 방패가 깨진다.' }),
    elite('orc_berserker', 'orc_berserker_champ', '오크 광전사 투사', { abilities: ['enrage', 'charge'], desc: '격노한 채로 돌진한다.' }),
    elite('treant', 'treant_guardian', '숲의 수호자', { hp: 4, abilities: ['aoe_medium', 'summon_wolves'], desc: '타락한 거목. 숲의 짐승을 부른다.' }),
    // 6층
    elite('golem_stone', 'golem_sentinel', '골렘 파수꾼', { hp: 4, abilities: ['aoe_medium', 'aoe_healer_small'], desc: '군주의 문지기. 힐러 자리에도 내리찍는다.' }),
    elite('bat', 'bat_matriarch', '박쥐 여왕', { hp: 6, atk: 1.5, abilities: ['aoe_healer_small', 'curse_volley'], desc: '박쥐 떼의 어미. 힐러에게 달려든다.' }),
    elite('cave_spider', 'cave_spider_lurker', '동굴 거미 매복자', { hp: 5, abilities: ['puddle_poison_small', 'aoe_healer_small'], desc: '천장에 숨어 있다가 힐러 위로 떨어진다.' }),
    // 7층
    elite('naga_priest', 'naga_oracle', '나가 예언자', { hp: 5, abilities: ['curse_volley_healer', 'heal_self'], desc: '"치유자가 치유자를 데려온다" 고 예언한 자.' }),
    elite('naga', 'naga_guard_captain', '나가 근위대장', { abilities: ['charge', 'aoe_medium'], desc: '여사제의 근위대. 창으로 땅을 울린다.' }),
    elite('golem_crystal', 'golem_crystal_core', '수정 핵 골렘', { hp: 4, abilities: ['aoe_random', 'curse_volley'], desc: '수정 핵이 빛나면 낙석이 떨어진다.' }),
    // 8층
    elite('orc_warlord', 'orc_warlord_krog', '오크 전사장 크로그', { abilities: ['roar', 'charge', 'enrage'], desc: '대족장의 심복. 포효로 탱커를 떼어 놓는다.' }),
    elite('troll_shaman', 'troll_shaman_elder', '트롤 대주술사', { hp: 5, abilities: ['heal_self', 'puddle_poison_large', 'aoe_healer_small'], desc: '넓은 독 장판을 깔고 힐러를 노린다.' }),
    elite('skeleton_knight', 'skeleton_knight_commander', '해골 기사단장', { abilities: ['charge', 'aoe_medium'], desc: '해골 탑을 지키는 기사단의 우두머리.' }),
    // 9층
    elite('wraith', 'wraith_bishop', '망령 주교', { hp: 5, abilities: ['curse_volley_healer', 'puddle_shadow'], desc: '아셀을 따르던 사제의 망령. 그림자 장판을 깐다.' }),
    elite('wraith', 'wraith_banshee', '밴시', { hp: 4, atk: 1.5, abilities: ['aoe_healer_large', 'curse_volley_healer'], desc: '비명이 힐러를 찢는다.' }),
    elite('skeleton_knight', 'skeleton_knight_death', '죽음의 기사', { hp: 5, atk: 1.5, abilities: ['charge', 'aoe_large'], desc: '기사단 묘실의 주인.' }),
    // 10층
    elite('drake', 'drake_elder', '늙은 새끼 용', { hp: 5, abilities: ['cone_breath_small', 'puddle_fire_small', 'summon_drakes'], desc: '새끼 중 가장 큰 놈. 형제를 부른다.' }),
    elite('golem_crystal', 'golem_crystal_red', '붉은 수정 골렘', { hp: 5, atk: 1.5, abilities: ['aoe_random', 'aoe_healer_large'], desc: '붉은 수정이 박힌 골렘. 낙석이 힐러를 노린다.' }),
    elite('naga', 'naga_dragon_priest', '용 숭배 나가', { hp: 4, abilities: ['curse_volley_healer', 'puddle_fire_small', 'heal_self'], desc: '바르가를 섬기는 광신도.' }),
  ];

  // ---------------------------------------------------------------------------
  // 층 보스. abilities 전체 ≥ 4(10층 ≥ 5), summon 필수, phases 로 HP 구간별 능력 세트 전환.
  // base.hp 는 "1층 기준값" — 실제 = base × Floors.mult (빠른 템포의 파티 DPS 기준 45~90초 전투가 되게 잡았다).
  // ---------------------------------------------------------------------------
  function boss(id, name, family, biome, s, o) {
    const base = { hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, aspd: s.aspd, range: s.range || 40 };
    const m = {
      id, name, family, biome, tags: o.tags || [], tier: 'boss', base, perFloor: { hp: 0, atk: 0, def: 0 },
      abilities: o.abilities, phases: o.phases, curses: o.curses || [], xp: o.xp, gold: o.gold, loot: o.loot || family,
      size: 3, sprite: id, desc: o.desc || '', title: o.title || '',
    };
    BY_ID[id] = m;
    return m;
  }
  const P = (hpBelow, abilities) => ({ hpBelow, abilities });
  const BOSSES = [
    boss('boss_goblin_king', '고블린 왕 그락', 'goblin', ['forest'], { hp: 17000, atk: 34, def: 8, spd: 95, aspd: 0.7 }, {
      tags: ['humanoid'], abilities: ['aoe_medium', 'summon_goblins', 'charge', 'enrage'],
      phases: [P(1.0, ['aoe_medium', 'summon_goblins']), P(0.6, ['aoe_medium', 'summon_goblins', 'charge']), P(0.3, ['aoe_medium', 'summon_goblins', 'charge', 'enrage'])],
      xp: 30, gold: [80, 140], title: '1층 보스', desc: '엘다의 종을 왕관에 단 고블린 왕. 부하를 부를 때 멈춘다.',
    }),
    boss('boss_spider_queen', '거대 거미 여왕', 'spider', ['forest'], { hp: 19400, atk: 44, def: 9, spd: 110, aspd: 0.8 }, {
      tags: ['beast'], abilities: ['puddle_poison_large', 'summon_spiders', 'curse_volley', 'aoe_small'],
      phases: [P(1.0, ['puddle_poison_large', 'aoe_small']), P(0.7, ['puddle_poison_large', 'summon_spiders', 'aoe_small']), P(0.35, ['puddle_poison_large', 'summon_spiders', 'curse_volley', 'aoe_small'])],
      curses: [{ id: 'dot', chance: 0.35 }], xp: 30, gold: [110, 190], title: '2층 보스', desc: '기도서를 삼킨 여왕. 보라색 원이 다 차기 전에 나와야 한다.',
    }),
    boss('boss_werewolf_chief', '늑대인간 족장 루가', 'werewolf', ['forest'], { hp: 22200, atk: 42, def: 10, spd: 150, aspd: 0.9 }, {
      tags: ['beast', 'humanoid'], abilities: ['charge', 'aoe_medium', 'summon_wolves', 'enrage', 'roar'],
      phases: [P(1.0, ['charge', 'aoe_medium']), P(0.65, ['charge', 'aoe_medium', 'summon_wolves']), P(0.3, ['charge', 'aoe_medium', 'summon_wolves', 'enrage', 'roar'])],
      curses: [{ id: 'dot', chance: 0.2 }], xp: 32, gold: [140, 240], title: '3층 보스', desc: '하얀 사제의 이름을 아는 늑대인간. 달빛 제단에서 울부짖는다.',
    }),
    boss('boss_siren_queen', '세이렌 여왕 네레아', 'siren', ['forest'], { hp: 23800, atk: 52, def: 9, spd: 100, aspd: 0.8, range: 180 }, {
      tags: ['caster'], abilities: ['curse_volley', 'aoe_medium', 'summon_sirens', 'puddle_poison_large', 'heal_self'],
      phases: [P(1.0, ['curse_volley', 'aoe_medium']), P(0.7, ['curse_volley', 'aoe_medium', 'summon_sirens']), P(0.4, ['curse_volley', 'puddle_poison_large', 'summon_sirens', 'heal_self'])],
      curses: [{ id: 'heal_down', chance: 0.3 }, { id: 'spd_down', chance: 0.2 }], xp: 32, gold: [170, 280], title: '4층 보스', desc: '호수의 거짓 노래. 치유를 막는 저주가 끊이지 않는다.',
    }),
    boss('boss_troll_chief', '트롤 족장 모르그', 'troll', ['forest'], { hp: 25200, atk: 60, def: 12, spd: 85, aspd: 0.6, range: 44 }, {
      tags: ['giant'], abilities: ['aoe_large', 'summon_trolls', 'enrage', 'heal_self', 'charge'],
      phases: [P(1.0, ['aoe_large', 'charge']), P(0.7, ['aoe_large', 'charge', 'summon_trolls']), P(0.4, ['aoe_large', 'summon_trolls', 'heal_self']), P(0.2, ['aoe_large', 'summon_trolls', 'enrage', 'charge'])],
      curses: [{ id: 'def_down', chance: 0.2 }], xp: 34, gold: [220, 360], title: '5층 보스', desc: '엘다를 가둔 트롤 족장. 재생을 끊지 못하면 끝이 없다.',
    }),
    boss('boss_golem_lord', '돌 골렘 군주', 'golem', ['cave'], { hp: 25000, atk: 56, def: 20, spd: 70, aspd: 0.5, range: 48 }, {
      tags: ['construct'], abilities: ['aoe_healer_large', 'aoe_large', 'summon_golems', 'aoe_random', 'enrage'],
      phases: [P(1.0, ['aoe_large', 'aoe_random']), P(0.7, ['aoe_large', 'aoe_healer_large', 'summon_golems']), P(0.35, ['aoe_large', 'aoe_healer_large', 'summon_golems', 'aoe_random', 'enrage'])],
      curses: [{ id: 'spd_down', chance: 0.3 }], xp: 34, gold: [300, 480], title: '6층 보스', desc: '아셀의 돌판을 가슴에 품은 파수꾼. 바위는 힐러 자리에 떨어진다.',
    }),
    boss('boss_naga_priestess', '나가 여사제 샤일라', 'naga', ['cave'], { hp: 23600, atk: 50, def: 14, spd: 100, aspd: 0.8, range: 180 }, {
      tags: ['humanoid', 'aquatic', 'caster'], abilities: ['curse_volley_healer', 'puddle_poison_large', 'summon_naga', 'heal_self', 'aoe_medium'],
      phases: [P(1.0, ['curse_volley_healer', 'aoe_medium']), P(0.7, ['curse_volley_healer', 'aoe_medium', 'summon_naga']), P(0.4, ['curse_volley_healer', 'puddle_poison_large', 'summon_naga', 'heal_self'])],
      curses: [{ id: 'heal_down', chance: 0.35 }, { id: 'root', chance: 0.15 }], xp: 36, gold: [340, 560], title: '7층 보스', desc: '깊은 물의 예언자. 힐러를 침묵시키고 스스로 회복한다.',
    }),
    boss('boss_orc_warchief', '오크 대족장 가르돈', 'orc', ['cave'], { hp: 23100, atk: 44, def: 16, spd: 105, aspd: 0.9, range: 44 }, {
      tags: ['humanoid'], abilities: ['charge_random', 'roar', 'summon_orcs', 'aoe_large', 'aoe_healer_large', 'enrage'],
      phases: [P(1.0, ['charge_random', 'aoe_large']), P(0.7, ['charge_random', 'aoe_large', 'summon_orcs']), P(0.4, ['charge_random', 'aoe_large', 'summon_orcs', 'roar', 'aoe_healer_large']), P(0.2, ['charge_random', 'aoe_large', 'summon_orcs', 'roar', 'aoe_healer_large', 'enrage'])],
      curses: [{ id: 'def_down', chance: 0.25 }, { id: 'atk_down', chance: 0.15 }], xp: 36, gold: [400, 640], title: '8층 보스', desc: '망령 왕에게 고용된 대족장. 북소리와 함께 머릿수로 밀어붙인다.',
    }),
    boss('boss_wraith_king', '망령 왕 아셀', 'wraith', ['cave'], { hp: 22200, atk: 42, def: 14, spd: 120, aspd: 0.8, range: 170 }, {
      tags: ['undead', 'spirit', 'caster'], abilities: ['curse_volley_healer', 'summon_undead', 'aoe_healer_large', 'puddle_shadow', 'heal_self', 'enrage'],
      phases: [P(1.0, ['curse_volley_healer', 'puddle_shadow']), P(0.7, ['curse_volley_healer', 'puddle_shadow', 'summon_undead']), P(0.4, ['curse_volley_healer', 'aoe_healer_large', 'summon_undead', 'heal_self']), P(0.15, ['aoe_healer_large', 'summon_undead', 'enrage', 'puddle_shadow'])],
      curses: [{ id: 'heal_down', chance: 0.35 }, { id: 'dot', chance: 0.2 }], xp: 38, gold: [460, 720], title: '9층 보스', desc: '백 년 전의 대사제. "너를 치유해 주마, 영원히 아프지 않도록." 성스러운 일격이 통한다.',
    }),
    boss('boss_dragon', '잿빛 드래곤 바르가', 'dragon', ['cave'], { hp: 22500, atk: 45, def: 22, spd: 110, aspd: 0.8, range: 56 }, {
      tags: ['dragon', 'flying'], abilities: ['cone_breath_large', 'puddle_fire_large', 'summon_drakes', 'aoe_healer_large', 'charge_random', 'roar', 'enrage'],
      phases: [P(1.0, ['cone_breath_large', 'puddle_fire_large']), P(0.75, ['cone_breath_large', 'puddle_fire_large', 'summon_drakes']), P(0.5, ['cone_breath_large', 'puddle_fire_large', 'summon_drakes', 'aoe_healer_large', 'roar']), P(0.25, ['cone_breath_large', 'puddle_fire_large', 'summon_drakes', 'aoe_healer_large', 'charge_random', 'enrage'])],
      curses: [{ id: 'dot', chance: 0.3 }, { id: 'def_down', chance: 0.2 }], xp: 40, gold: [600, 1000], loot: 'dragon', title: '10층 보스', desc: '탑의 첫 번째 수호자. 브레스는 옆으로, 용암은 밖으로, 새끼는 탱커가.',
    }),
  ];

  const ALL = [...NORMALS, ...MINIBOSSES, ...BOSSES];

  // ---------------------------------------------------------------------------
  // 조회
  // ---------------------------------------------------------------------------
  function get(id) { return BY_ID[id] || null; }
  function list() { return ALL.map((m) => m.id); }
  function all() { return ALL.slice(); }
  function byTier(tier) { return ALL.filter((m) => m.tier === tier); }
  function bosses() { return BOSSES.slice(); }
  function minibosses() { return MINIBOSSES.slice(); }
  function normals() { return NORMALS.slice(); }
  function families() { return Array.from(new Set(ALL.map((m) => m.family))); }
  function ability(id) { return ABILITIES[id] || null; }
  function abilities() { return Object.keys(ABILITIES); }
  function forFloor(floor) { const f = Floors.get(floor); return f ? f.pool.map((p) => ({ id: p.id, weight: p.weight })) : []; }
  function isBoss(def) { return !!def && def.tier === 'boss'; }
  function isElite(def) { return !!def && (def.tier === 'miniboss' || def.tier === 'elite'); }
  function hasTag(def, tag) { return !!def && (def.tags || []).includes(tag); }

  // 몬스터 1마리가 특정 층에서 쓰는 전투 수치. perFloor 는 첫 등장 층(floorBase: 숲 1, 동굴 6)부터 층마다 누적, 그 위에 Floors.mult 를 곱한다.
  // 빠른 전투 템포: 일반 몬스터는 딜러 한두 대(×0.45), 중간보스는 몇 초(×3) 버티게 등급별 HP 배수를 곱한다.
  // 보스는 base.hp 자체를 45~90초 전투가 되게 잡았다(×1).
  const TIER_HP = { normal: 0.45, miniboss: 3, boss: 1 };
  // 교전(aggro) 중 이동속도 배수 — 무리가 우르르 달려든다(AIMonster 가 moveTo 에 넘긴다)
  const AGGRO_SPEED = 1.35;
  function statsAt(def, floor) {
    const f = Floors.get(floor) || Floors.get(1);
    const n = Math.max(0, (floor || 1) - (def.floorBase || 1));
    const b = def.base, p = def.perFloor || { hp: 0, atk: 0, def: 0 };
    const tierHp = TIER_HP[def.tier] || 1;
    const out = {
      hp: Math.max(1, Math.round((b.hp + p.hp * n) * f.mult.hp * tierHp)),
      atk: Math.max(1, Math.round((b.atk + p.atk * n) * f.mult.atk)),
      def: Math.max(0, Math.round((b.def + p.def * n) * f.mult.def)),
      spd: b.spd, aspd: b.aspd, range: b.range,
      xp: Math.max(1, Math.round(def.xp * f.xpMult)),
      gold: [Math.round(def.gold[0] * f.goldMult), Math.round(def.gold[1] * f.goldMult)],
    };
    if (b.threatMult) out.threatMult = b.threatMult;
    return out;
  }
  // HP 비율로 현재 페이즈(보스). phases 는 hpBelow 내림차순이고, 비율이 hpBelow 이하인 마지막 페이즈가 활성.
  function phaseFor(def, hpRatio) {
    if (!def || !def.phases || !def.phases.length) return null;
    let cur = def.phases[0];
    for (const ph of def.phases) if (hpRatio <= ph.hpBelow) cur = ph;
    return cur;
  }
  function abilitiesFor(def, hpRatio) {
    const ph = phaseFor(def, hpRatio == null ? 1 : hpRatio);
    return ph ? ph.abilities.slice() : (def && def.abilities ? def.abilities.slice() : []);
  }
  // 해당 층 저주 확률(Floors.curseMult 반영). AIMonster 가 적중 시 굴린다.
  function curseChance(def, curseId, floor) {
    const c = (def.curses || []).find((x) => x.id === curseId); if (!c) return 0;
    const f = Floors.get(floor);
    return Math.min(0.95, c.chance * (f ? f.curseMult : 1));
  }
  // 데이터 무결성 검사(테스트·개발용). 문제 목록을 돌려준다(비면 정상).
  function validate() {
    const problems = [];
    for (const m of ALL) {
      for (const a of m.abilities) if (!ABILITIES[a]) problems.push(`${m.id}: 능력 ${a} 없음`);
      for (const ph of m.phases || []) for (const a of ph.abilities) if (!m.abilities.includes(a)) problems.push(`${m.id}: 페이즈 능력 ${a} 가 abilities 에 없음`);
      for (const c of m.curses) if (!['dot', 'def_down', 'atk_down', 'aspd_down', 'spd_down', 'heal_down', 'root'].includes(c.id)) problems.push(`${m.id}: 저주 ${c.id} 없음`);
    }
    for (const a of Object.values(ABILITIES)) if (a.summon && !BY_ID[a.summon.id]) problems.push(`${a.id}: 소환 대상 ${a.summon.id} 없음`);
    for (let f = 1; f <= Floors.COUNT; f++) {
      const fl = Floors.get(f);
      for (const p of fl.pool) if (!BY_ID[p.id]) problems.push(`${f}층 pool ${p.id} 없음`);
      for (const id of fl.minibosses) if (!BY_ID[id] || BY_ID[id].tier !== 'miniboss') problems.push(`${f}층 중간보스 ${id} 없음`);
      if (!BY_ID[fl.boss] || BY_ID[fl.boss].tier !== 'boss') problems.push(`${f}층 보스 ${fl.boss} 없음`);
    }
    return problems;
  }

  return { get, list, all, byTier, bosses, minibosses, normals, families, ability, abilities, forFloor, isBoss, isElite, hasTag,
    statsAt, phaseFor, abilitiesFor, curseChance, validate, ABILITIES, TILE, TIER_HP, AGGRO_SPEED };
})();

// ---------------------------------------------------------------------------
// 층 데이터. mult 는 1~5층 완만(1.0→1.35), 6층부터 급증(HP 2.4→4.0, 공격 1.65→2.6). 저주 배수도 6층부터 2배.
// xpMult/goldMult 는 Monsters.statsAt 이 xp·gold 에 곱한다(레벨 범위에 맞춘 경험치 곡선).
// landmarks 는 던전 생성기가 같은 이름으로 지형 기준점을 만들고 NPC 상자 힌트가 그 이름을 말한다
// (Dialogue.FALLBACK_PLACES 의 이름을 각 층 앞 두 개에 그대로 둔다).
// ---------------------------------------------------------------------------
const Floors = (() => {
  const COUNT = 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const pool = (...pairs) => pairs.map(([id, weight]) => ({ id, weight }));
  // 랜드마크: [영어 id, 한국어 이름, 종류]. kind 는 생성기 힌트('rock'|'tree'|'water'|'camp'|'ruin'|'crystal'|'path'|'boss').
  const L = (id, name, kind) => ({ id, name, kind });
  // mult 는 숫자(hp·atk 공통) 또는 { hp, atk, def? }. 동굴은 HP 는 크게(전투가 길어져 힐러 저격·장판이 실제로 발동), 공격력은 완만하게
  // (탱커가 첫 3초 안에 녹지 않게) 따로 둔다. def 생략 시 1 + (hp−1)×0.7.
  const F = (floor, o) => {
    const m = typeof o.mult === 'number' ? { hp: o.mult, atk: o.mult } : o.mult;
    return {
      floor, biome: o.biome, name: o.name, levelRange: o.levelRange, pool: o.pool, minibosses: o.minibosses, boss: o.boss,
      mult: { hp: m.hp, atk: m.atk, def: m.def != null ? m.def : r2(1 + (m.hp - 1) * 0.7) }, curseMult: o.curseMult, xpMult: o.xpMult, goldMult: o.goldMult,
      monsterCount: o.monsterCount, chapter: floor, landmarkDefs: o.landmarks, landmarks: o.landmarks.map((l) => l.name), desc: o.desc,
    };
  };
  const LIST = [
    F(1, { biome: 'forest', name: '속삭이는 숲 입구', levelRange: [1, 3], mult: 1.0, curseMult: 1.0, xpMult: 1, goldMult: 1, monsterCount: 300,
      pool: pool(['goblin', 40], ['goblin_archer', 20], ['wolf', 25], ['sheepie', 15]), minibosses: ['goblin_chief', 'wolf_alpha', 'sheepie_big'], boss: 'boss_goblin_king',
      landmarks: [L('mossy_rock', '이끼 낀 바위', 'rock'), L('old_oak', '늙은 떡갈나무', 'tree'), L('goblin_trail', '고블린 발자국 길', 'path'), L('mushroom_glade', '버섯 공터', 'tree'), L('fallen_signpost', '쓰러진 이정표', 'ruin'), L('whisper_spring', '속삭이는 샘', 'water'), L('king_bonfire', '고블린 왕의 모닥불', 'boss')],
      desc: '탑이 삼킨 숲의 입구. 고블린과 늑대가 발자국을 지운다.' }),
    F(2, { biome: 'forest', name: '거미줄 골짜기', levelRange: [3, 5], mult: 1.08, curseMult: 1.05, xpMult: 3, goldMult: 1.4, monsterCount: 306,
      pool: pool(['spider', 40], ['goblin', 15], ['goblin_shaman', 15], ['zombie', 20], ['sheepie', 10]), minibosses: ['spider_broodmother', 'goblin_shaman_elder', 'zombie_bloated'], boss: 'boss_spider_queen',
      landmarks: [L('web_tunnel', '거미줄 터널', 'path'), L('rotten_log', '썩은 통나무', 'tree'), L('cocoon_tree', '하얀 고치 나무', 'tree'), L('page_rock', '기도서 조각 바위', 'rock'), L('zombie_graves', '좀비 무덤터', 'ruin'), L('egg_pool', '알 둥지 웅덩이', 'water'), L('queen_nest', '여왕의 둥지', 'boss')],
      desc: '나무 사이마다 하얀 장막. 기도서의 찢긴 페이지가 거미줄에 걸려 있다.' }),
    F(3, { biome: 'forest', name: '달빛 폭포 길', levelRange: [5, 7], mult: 1.17, curseMult: 1.1, xpMult: 5, goldMult: 1.8, monsterCount: 312,
      pool: pool(['werewolf', 30], ['wolf', 25], ['skeleton', 20], ['zombie', 10], ['sprite', 15]), minibosses: ['werewolf_howler', 'wolf_moon', 'skeleton_captain'], boss: 'boss_werewolf_chief',
      landmarks: [L('moon_falls', '달빛 폭포', 'water'), L('wolf_rock', '늑대 바위', 'rock'), L('silver_creek', '은빛 개울', 'water'), L('howling_hill', '울음의 언덕', 'rock'), L('bone_yard', '해골 묘지', 'ruin'), L('sprite_ring', '정령의 고리', 'tree'), L('chief_altar', '족장의 달빛 제단', 'boss')],
      desc: '탑 안인데도 달이 뜬다. 폭포 소리에 울음이 섞여 있다.' }),
    F(4, { biome: 'forest', name: '안개 호수', levelRange: [7, 9], mult: 1.26, curseMult: 1.15, xpMult: 6.5, goldMult: 2.3, monsterCount: 318,
      pool: pool(['siren', 35], ['sprite', 25], ['orc', 20], ['skeleton', 10], ['spider', 10]), minibosses: ['siren_songstress', 'sprite_corrupted', 'orc_raider'], boss: 'boss_siren_queen',
      landmarks: [L('mist_lake', '안개 호수', 'water'), L('broken_pier', '부서진 부두', 'ruin'), L('sunken_boat', '가라앉은 배', 'water'), L('singing_reeds', '노래하는 갈대밭', 'water'), L('orc_camp_trace', '오크 야영 흔적', 'camp'), L('lantern_path', '정령 등불 길', 'path'), L('queen_isle', '여왕의 섬', 'boss')],
      desc: '안개 위로 노래가 흐른다. 노래를 따라가면 가라앉는다.' }),
    F(5, { biome: 'forest', name: '쓰러진 거목의 숲', levelRange: [9, 11], mult: { hp: 1.35, atk: 1.28 }, curseMult: 1.2, xpMult: 7.5, goldMult: 2.8, monsterCount: 324,
      pool: pool(['troll', 30], ['orc', 25], ['orc_berserker', 20], ['treant', 15], ['werewolf', 10]), minibosses: ['troll_warlord', 'orc_berserker_champ', 'treant_guardian'], boss: 'boss_troll_chief',
      landmarks: [L('troll_camp', '트롤 야영지', 'camp'), L('fallen_giant', '쓰러진 거목', 'tree'), L('orc_spoils', '오크 전리품 더미', 'camp'), L('guardian_roots', '수호자의 뿌리', 'tree'), L('wolfman_den', '늑대인간 동굴 입구', 'rock'), L('elda_trace', '엘다의 흔적', 'ruin'), L('chief_fire', '족장의 모닥불', 'boss')],
      desc: '트롤들의 야영지. 엘다의 목소리가 끊긴 곳.' }),
    F(6, { biome: 'cave', name: '돌 파수꾼의 동굴', levelRange: [11, 13], mult: { hp: 2.4, atk: 1.65 }, curseMult: 2.0, xpMult: 10, goldMult: 3.6, monsterCount: 330,
      pool: pool(['bat', 35], ['cave_spider', 25], ['golem_stone', 25], ['skeleton_knight', 15]), minibosses: ['golem_sentinel', 'bat_matriarch', 'cave_spider_lurker'], boss: 'boss_golem_lord',
      landmarks: [L('first_fork', '첫 번째 갈림길', 'path'), L('stalactite_hall', '종유석 홀', 'crystal'), L('bat_ceiling', '박쥐 둥지 천장', 'rock'), L('mine_rail', '무너진 광산 레일', 'ruin'), L('spider_pit', '거미 알 구덩이', 'rock'), L('golem_row', '골렘 조각상 열', 'ruin'), L('lord_throne', '군주의 돌 왕좌', 'boss')],
      desc: '숲이 끝나고 돌이 시작된다. 여기부터 괴물들이 힐러를 노린다.' }),
    F(7, { biome: 'cave', name: '깊은 물의 제단', levelRange: [13, 15], mult: { hp: 2.8, atk: 1.85 }, curseMult: 2.2, xpMult: 12, goldMult: 4.4, monsterCount: 336,
      pool: pool(['naga', 35], ['naga_priest', 20], ['golem_crystal', 20], ['bat', 15], ['cave_spider', 10]), minibosses: ['naga_oracle', 'naga_guard_captain', 'golem_crystal_core'], boss: 'boss_naga_priestess',
      landmarks: [L('under_lake', '지하 호수', 'water'), L('naga_altar', '나가 제단', 'ruin'), L('crystal_cluster', '빛나는 수정 군락', 'crystal'), L('flooded_stairs', '물에 잠긴 계단', 'water'), L('prophecy_mural', '예언의 벽화', 'ruin'), L('pearl_rock', '진주 조개 바위', 'rock'), L('priestess_sanctum', '여사제의 성소', 'boss')],
      desc: '지하 호수에 나가들이 산다. 그들은 리프가 올 것을 알고 있었다.' }),
    F(8, { biome: 'cave', name: '오크 전초 요새', levelRange: [15, 17], mult: { hp: 3.2, atk: 2.1 }, curseMult: 2.5, xpMult: 16, goldMult: 5.2, monsterCount: 342,
      pool: pool(['orc', 30], ['orc_berserker', 20], ['orc_warlord', 15], ['troll_shaman', 20], ['skeleton_knight', 15]), minibosses: ['orc_warlord_krog', 'troll_shaman_elder', 'skeleton_knight_commander'], boss: 'boss_orc_warchief',
      landmarks: [L('orc_outpost', '오크 전초기지', 'camp'), L('skull_tower', '해골 탑', 'ruin'), L('drum_square', '북소리 광장', 'camp'), L('shaman_tent', '트롤 주술 천막', 'camp'), L('loot_store', '약탈품 창고', 'ruin'), L('blood_arena', '피의 투기장', 'rock'), L('warchief_gate', '대족장의 요새 문', 'boss')],
      desc: '망령 왕에게 고용된 오크들의 요새. 북소리가 나는 쪽은 무리가 크다.' }),
    F(9, { biome: 'cave', name: '잊힌 신전', levelRange: [17, 19], mult: { hp: 3.6, atk: 2.35 }, curseMult: 2.8, xpMult: 20, goldMult: 6.2, monsterCount: 351,
      pool: pool(['wraith', 35], ['skeleton_knight', 25], ['skeleton', 15], ['naga_priest', 10], ['bat', 15]), minibosses: ['wraith_bishop', 'wraith_banshee', 'skeleton_knight_death'], boss: 'boss_wraith_king',
      landmarks: [L('forgotten_temple', '잊힌 신전', 'ruin'), L('wraith_corridor', '망령의 복도', 'path'), L('pillar_hall', '무너진 기둥 홀', 'ruin'), L('asel_altar', '아셀의 제단', 'ruin'), L('white_library', '하얀 사제의 서고', 'ruin'), L('knight_crypt', '기사단 묘실', 'ruin'), L('king_throne', '망령 왕의 옥좌', 'boss')],
      desc: '백 년 전 아셀을 따르던 사제들의 망령이 떠돈다. 성스러운 일격의 층.' }),
    F(10, { biome: 'cave', name: '용의 둥지', levelRange: [18, 22], mult: { hp: 4.0, atk: 2.6 }, curseMult: 3.2, xpMult: 23, goldMult: 7.5, monsterCount: 360,
      pool: pool(['drake', 35], ['golem_crystal', 25], ['naga', 15], ['wraith', 10], ['orc_warlord', 15]), minibosses: ['drake_elder', 'golem_crystal_red', 'naga_dragon_priest'], boss: 'boss_dragon',
      landmarks: [L('dragon_nest', '용의 둥지', 'crystal'), L('burning_rock', '불타는 바위', 'rock'), L('red_crystal_cave', '붉은 수정 동굴', 'crystal'), L('scale_graveyard', '용 비늘 무덤', 'ruin'), L('drake_nests', '새끼 용 둥지', 'rock'), L('heart_stairs', '탑의 심장 계단', 'path'), L('varga_lair', '바르가의 둥지', 'boss')],
      desc: '동굴 끝, 잿빛 드래곤 바르가의 둥지. 1부의 끝.' }),
  ];
  const BY_FLOOR = Object.fromEntries(LIST.map((f) => [f.floor, f]));

  function get(f) { return BY_FLOOR[f] || null; }
  function all() { return LIST.slice(); }
  function list() { return LIST.map((f) => f.floor); }
  function biomeOf(f) { const d = get(f); return d ? d.biome : (f <= 5 ? 'forest' : 'cave'); }
  function isForest(f) { return biomeOf(f) === 'forest'; }
  function nameOf(f) { const d = get(f); return d ? d.name : `${f}층`; }
  function levelFor(f) { const d = get(f); return d ? Math.round((d.levelRange[0] + d.levelRange[1]) / 2) : 1; }
  function landmark(f, idOrName) { const d = get(f); return d ? d.landmarkDefs.find((l) => l.id === idOrName || l.name === idOrName) || null : null; }
  // 힐러 겨냥 능력이 나오는 층인가(6층부터). AIMonster/Combat 의 탱커 위협 보정(1~5층 ×4, 6층부터 ×2.5)에도 쓴다.
  function targetsHealer(f) { return biomeOf(f) === 'cave'; }
  function tankThreatMult(f) { return targetsHealer(f) ? 2.5 : 4; }

  return { get, all, list, biomeOf, isForest, nameOf, levelFor, landmark, targetsHealer, tankThreatMult, COUNT };
})();

if (typeof module !== 'undefined') { module.exports = Monsters; module.exports.Floors = Floors; }
// 노드 vm 컨텍스트에서 두 번째 전역(Floors)도 보이도록 명시적으로 올린다(브라우저는 최상위 const 로 이미 전역).
if (typeof globalThis !== 'undefined') globalThis.Floors = Floors;
