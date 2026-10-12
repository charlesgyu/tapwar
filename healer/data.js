// 모두의 힐러 - 게임 데이터 정의
'use strict';

const MAX_LEVEL = 40;
const STAT_KEYS = ['str', 'def', 'agi', 'end', 'int', 'vit'];
const STAT_NAMES = { str: '힘', def: '방어력', agi: '민첩성', end: '지구력', int: '지능', vit: '체력' };

// ---------- 직업 / 역할 ----------
const CLASSES = {
  warrior: { name: '전사', armor: 'plate', roles: ['tank', 'melee'], color: '#d9534f', icon: '⚔️', main: 'str' },
  monk:    { name: '무투가', armor: 'leather', roles: ['tank', 'melee'], color: '#f0ad4e', icon: '👊', main: 'agi' },
  mage:    { name: '마법사', armor: 'cloth', roles: ['ranged'], color: '#5b8def', icon: '🔮', main: 'int' },
  hunter:  { name: '사냥꾼', armor: 'leather', roles: ['ranged'], color: '#5cb85c', icon: '🏹', main: 'agi' },
  rogue:   { name: '도적', armor: 'leather', roles: ['melee'], color: '#8e6bd1', icon: '🗡️', main: 'agi' },
  spellblade: { name: '마검사', armor: 'mail', roles: ['melee'], color: '#2bb0b5', icon: '🌀', main: 'str' },
  priest:  { name: '사제', armor: 'cloth', roles: ['healer'], color: '#f5e17a', icon: '✨', main: 'int' },
};
const ROLE_NAMES = { tank: '탱커', melee: '근접딜러', ranged: '원거리딜러', healer: '힐러' };
const ARMOR_NAMES = { plate: '판금', leather: '가죽', mail: '사슬', cloth: '천' };

// ---------- 힐러 스킬 ----------
// type: single / multi / ground / revive / cleanse / buff / attack / ult
const SKILLS = {
  heal:      { name: '기본힐', icon: '💚', type: 'single', unlock: 1, cast: 2.4, mana: 10, power: 45, cd: 0, desc: '느리지만 효율적인 단일 치유' },
  flash:     { name: '빠른힐', icon: '💛', type: 'single', unlock: 3, cast: 1.2, mana: 15, power: 45, cd: 0, desc: '기본힐보다 2배 빠른 시전, 마나 1.5배' },
  instant:   { name: '즉시힐', icon: '⚡', type: 'single', unlock: 6, cast: 0, mana: 20, power: 45, cd: 1.5, desc: '즉시 시전, 마나 2배' },
  smite:     { name: '성스러운 일격', icon: '☀️', type: 'attack', unlock: 2, cast: 1.5, mana: 12, power: 60, cd: 0, desc: '언데드에게만 통하는 신성 공격' },
  cleanse:   { name: '저주 해제', icon: '🧼', type: 'cleanse', unlock: 4, cast: 0, mana: 8, power: 0, cd: 1, desc: '대상의 모든 저주를 해제' },
  revive:    { name: '부활', icon: '👼', type: 'revive', unlock: 5, cast: 4, mana: 50, power: 0.4, cd: 0, desc: '쓰러진 아군을 HP 40%로 부활' },
  multi2:    { name: '치유의 손길', icon: '💞', type: 'multi', count: 2, unlock: 8, cast: 2, mana: 25, power: 38, cd: 0, desc: '부상당한 아군 2명 무작위 치유' },
  multi3:    { name: '치유의 기도', icon: '💗', type: 'multi', count: 3, unlock: 12, cast: 2.5, mana: 35, power: 38, cd: 0, desc: '부상당한 아군 3명 무작위 치유' },
  ground:    { name: '성역', icon: '🔆', type: 'ground', unlock: 15, cast: 1, mana: 40, power: 10, cd: 12, dur: 8, radius: 60, desc: '마법진 위 아군이 초당 회복' },
  b_atk:     { name: '힘의 축복', icon: '💪', type: 'buff', buff: 'atk', unlock: 10, cast: 0, mana: 20, cd: 3, dur: 30, desc: '파티 공격력 +20%' },
  b_dodge:   { name: '바람의 축복', icon: '🍃', type: 'buff', buff: 'dodge', unlock: 11, cast: 0, mana: 20, cd: 3, dur: 30, desc: '파티 회피 +15%' },
  b_def:     { name: '보호의 축복', icon: '🛡️', type: 'buff', buff: 'def', unlock: 13, cast: 0, mana: 20, cd: 3, dur: 30, desc: '파티 방어력 +25%' },
  b_move:    { name: '신속의 축복', icon: '👟', type: 'buff', buff: 'move', unlock: 14, cast: 0, mana: 20, cd: 3, dur: 30, desc: '파티 이동속도 +25%' },
  b_aspd:    { name: '격노의 축복', icon: '🔥', type: 'buff', buff: 'aspd', unlock: 16, cast: 0, mana: 20, cd: 3, dur: 30, desc: '파티 공격속도 +20%' },
  b_mana:    { name: '명상의 축복', icon: '🧘', type: 'buff', buff: 'mana', unlock: 18, cast: 0, mana: 15, cd: 3, dur: 30, desc: '힐러 마나 소비 -25%' },
  ult:       { name: '신의 은총', icon: '🌟', type: 'ult', unlock: 10, cast: 0, mana: 0, power: 0.8, cd: 300, desc: '모든 파티원 HP 즉시 80% 회복 (쿨 5분)' },
};
const SKILL_SLOTS = 7; // 필살기 제외 배치 칸

// ---------- 저주 / 축복 ----------
const CURSES = {
  dot:    { name: '부식', icon: '☠️', color: '#7c3' },
  defDown:{ name: '방어 저하', icon: '🛡', color: '#a66' },
  atkDown:{ name: '공격 저하', icon: '🗡', color: '#a66' },
  aspdDown:{ name: '공속 저하', icon: '🐢', color: '#a66' },
  slow:   { name: '이속 저하', icon: '🐌', color: '#a66' },
  healDown:{ name: '치유 감소', icon: '💔', color: '#c3c' },
  root:   { name: '속박', icon: '⛓', color: '#999' },
};
const BUFF_NAMES = { atk: '공격력↑', dodge: '회피↑', def: '방어↑', move: '이속↑', aspd: '공속↑', mana: '마나절약' };

// ---------- 몬스터 ----------
// tier: 등장 시작 층
const MONSTERS = [
  { id: 'goblin', name: '고블린', emoji: '👺', tier: 1, hp: 60, atk: 6, spd: 55, range: 18, undead: false, curse: ['slow'], cc: 0.05 },
  { id: 'kobold', name: '코볼트', emoji: '🐀', tier: 1, hp: 45, atk: 5, spd: 70, range: 18, undead: false, curse: ['dot'], cc: 0.05 },
  { id: 'skeleton', name: '해골 병사', emoji: '💀', tier: 2, hp: 70, atk: 7, spd: 45, range: 18, undead: true, curse: ['defDown'], cc: 0.06 },
  { id: 'wolf', name: '늑대인간', emoji: '🐺', tier: 4, hp: 90, atk: 9, spd: 80, range: 18, undead: false, curse: ['dot', 'healDown'], cc: 0.07 },
  { id: 'orc', name: '오크 전사', emoji: '👹', tier: 6, hp: 130, atk: 11, spd: 50, range: 20, undead: false, curse: ['atkDown', 'defDown'], cc: 0.07 },
  { id: 'troll', name: '트롤 주술사', emoji: '🧌', tier: 8, hp: 110, atk: 10, spd: 45, range: 110, undead: false, ranged: true, curse: ['healDown', 'aspdDown', 'dot'], cc: 0.1 },
  { id: 'ghoul', name: '구울', emoji: '🧟', tier: 10, hp: 140, atk: 12, spd: 50, range: 18, undead: true, curse: ['dot', 'slow'], cc: 0.09 },
  { id: 'naga', name: '나가', emoji: '🐍', tier: 13, hp: 150, atk: 13, spd: 60, range: 22, undead: false, curse: ['root', 'slow'], cc: 0.08 },
  { id: 'siren', name: '세이렌', emoji: '🧜', tier: 16, hp: 120, atk: 14, spd: 55, range: 120, undead: false, ranged: true, curse: ['aspdDown', 'atkDown', 'root'], cc: 0.12 },
  { id: 'shade', name: '셰이드', emoji: '👻', tier: 20, hp: 130, atk: 15, spd: 65, range: 90, undead: true, ranged: true, curse: ['healDown', 'dot'], cc: 0.12 },
  { id: 'golem', name: '골렘', emoji: '🗿', tier: 25, hp: 300, atk: 18, spd: 35, range: 22, undead: false, curse: ['slow', 'root'], cc: 0.08 },
  { id: 'drake', name: '새끼 드래곤', emoji: '🦎', tier: 30, hp: 220, atk: 20, spd: 60, range: 90, undead: false, ranged: true, curse: ['dot', 'defDown'], cc: 0.1 },
];
const BOSSES = [
  { id: 'gobking', name: '고블린 왕', emoji: '🤴', hp: 900, atk: 14, spd: 45, range: 24, undead: false, curse: ['slow', 'dot'] },
  { id: 'lich', name: '리치', emoji: '☠️', hp: 1000, atk: 16, spd: 40, range: 120, undead: true, ranged: true, curse: ['healDown', 'dot', 'root'] },
  { id: 'warchief', name: '오크 대족장', emoji: '👿', hp: 1300, atk: 20, spd: 45, range: 26, undead: false, curse: ['atkDown', 'defDown'] },
  { id: 'nagaq', name: '나가 여왕', emoji: '🐉', hp: 1200, atk: 18, spd: 50, range: 110, undead: false, ranged: true, curse: ['root', 'aspdDown'] },
  { id: 'dragon', name: '고룡', emoji: '🐲', hp: 1600, atk: 24, spd: 40, range: 120, undead: false, ranged: true, curse: ['dot', 'healDown', 'defDown'] },
];

// ---------- 아이템 ----------
const GRADES = [
  { name: '일반', color: '#c8c8c8', mult: 1.0 },
  { name: '고급', color: '#4cd964', mult: 1.5 },
  { name: '레어', color: '#4aa3ff', mult: 2.2 },
  { name: '전설', color: '#ff9f1a', mult: 3.2 },
];
const SLOTS = {
  necklace: { name: '목걸이', icon: '📿' },
  ring:     { name: '반지', icon: '💍' },
  earring:  { name: '귀걸이', icon: '🦪' },
  weapon:   { name: '무기', icon: '🪄' },
  offhand:  { name: '보조', icon: '📖' },
  chest:    { name: '옷', icon: '👘' },
  boots:    { name: '장화', icon: '👢' },
  gloves:   { name: '장갑', icon: '🧤' },
  hat:      { name: '모자', icon: '🎩' },
  belt:     { name: '벨트', icon: '🎗️' },
  bag:      { name: '가방', icon: '🎒' },
};
const ARMOR_SLOTS = ['chest', 'boots', 'gloves', 'hat', 'belt'];
const WEAPON_KINDS = {
  staff2: { name: '양손 지팡이', icon: '🦯', slot: 'weapon', twoHand: true, int: 2.0 },
  staff1: { name: '한손 지팡이', icon: '🪄', slot: 'weapon', twoHand: false, int: 1.1 },
  book:   { name: '성서', icon: '📖', slot: 'offhand', int: 0.8 },
};
const AFFIXES = {
  manaRegen: { name: '초당 마나 회복', fmt: v => `+${v.toFixed(1)}`, roll: g => 0.3 * g },
  castSpeed: { name: '캐스팅 속도', fmt: v => `+${Math.round(v)}%`, roll: g => 3 * g },
  manaCost:  { name: '마나 소비 감소', fmt: v => `-${Math.round(v)}%`, roll: g => 2.5 * g },
  moveSpeed: { name: '이동속도', fmt: v => `+${Math.round(v)}%`, roll: g => 4 * g },
  healPower: { name: '치유량', fmt: v => `+${Math.round(v)}%`, roll: g => 3 * g },
  maxMana:   { name: '최대 마나', fmt: v => `+${Math.round(v)}`, roll: g => 15 * g },
};
const SETS = {
  pilgrim: {
    name: '빛의 순례자', pieces: ARMOR_SLOTS,
    bonus: {
      2: { text: '10% 확률로 마나 소비 없음', freeMana: 0.10 },
      3: { text: '10% 확률로 기본힐 즉시 시전', instantHeal: 0.10 },
      4: { text: '10% 확률로 광역힐 즉시 시전', instantMulti: 0.10 },
      5: { text: '치유량 +15%, 필살기 쿨타임 -30%', healPct: 15, ultCdr: 0.3 },
    },
  },
  oracle: {
    name: '신탁의 예언자', pieces: ARMOR_SLOTS,
    bonus: {
      2: { text: '초당 마나 회복 +2', manaRegen: 2 },
      3: { text: '15% 확률로 치유 2배', critHeal: 0.15 },
      4: { text: '10% 확률로 마나 소비 없음', freeMana: 0.10 },
      5: { text: '10% 확률로 기본힐 즉시 시전 · 캐스팅 +15%', instantHeal: 0.10, castSpeed: 15 },
    },
  },
};
const NAMES = {
  chest: ['수련복', '사제복', '성직자 로브', '대주교의 법의'],
  boots: ['짚신', '천 장화', '순례자 장화', '성자의 발걸음'],
  gloves: ['면장갑', '비단 장갑', '축복의 장갑', '성광의 손'],
  hat: ['두건', '사제 모자', '성직자 관', '빛의 왕관'],
  belt: ['끈 벨트', '가죽 벨트', '포션 벨트', '연금술사의 허리띠'],
  bag: ['작은 주머니', '천 가방', '모험가 가방', '차원 가방'],
  necklace: ['나무 목걸이', '은 목걸이', '성수 목걸이', '천사의 눈물'],
  ring: ['구리 반지', '은 반지', '사파이어 반지', '창조의 반지'],
  earring: ['조개 귀걸이', '은 귀걸이', '진주 귀걸이', '세라핌의 깃'],
  staff2: ['참나무 지팡이', '견습 지팡이', '빛의 지팡이', '창세의 홀'],
  staff1: ['나뭇가지 완드', '사제 완드', '수정 완드', '여명의 완드'],
  book: ['낡은 기도서', '성서', '빛의 경전', '신의 계시록'],
};
const OTHER_ARMOR = {
  plate: ['철 갑옷', '강철 판금', '기사의 흉갑', '용기사의 판금'],
  leather: ['가죽 조끼', '질긴 가죽옷', '사냥꾼 가죽갑옷', '그림자 가죽'],
  mail: ['사슬 조끼', '사슬 갑옷', '룬 사슬갑옷', '마검의 갑주'],
};

// ---------- 소모품 / 재료 ----------
const CONSUMABLES = {
  hpPot:  { name: '체력 포션', icon: '🧪', price: 30, desc: '파티원(힐러) HP 30% 회복', kind: 'hp', value: 0.3 },
  hpPot2: { name: '고급 체력 포션', icon: '❤️', price: 90, desc: 'HP 60% 회복', kind: 'hp', value: 0.6 },
  mpPot:  { name: '마나 포션', icon: '🔷', price: 40, desc: '마나 35% 회복', kind: 'mp', value: 0.35 },
  mpPot2: { name: '고급 마나 포션', icon: '💠', price: 120, desc: '마나 70% 회복', kind: 'mp', value: 0.7 },
  antidote: { name: '정화수', icon: '💧', price: 25, desc: '자신의 저주 해제', kind: 'cleanse', value: 0 },
};
const MATERIALS = {
  scrap:   { name: '천 조각', icon: '🧵', price: 8 },
  ore:     { name: '철광석', icon: '🪨', price: 15 },
  essence: { name: '마력 정수', icon: '🔹', price: 40 },
  holy:    { name: '성스러운 결정', icon: '💎', price: 120 },
  junk:    { name: '몬스터 전리품', icon: '🦴', price: 12 },
  resetTicket: { name: '경매장 리셋권', icon: '🎫', price: 0 },
  hiddenScroll: { name: '수상한 두루마리', icon: '📜', price: 0 },
};

// ---------- 로그라이크 축복 (층 클리어 보상) ----------
const BOONS = [
  { id: 'healUp', name: '빛의 가호', icon: '✨', desc: '이번 도전 동안 치유량 +12%', apply: r => r.healPct += 12 },
  { id: 'manaCost', name: '절제', icon: '🧘', desc: '마나 소비 -8%', apply: r => r.manaCostPct += 8 },
  { id: 'regen', name: '샘물', icon: '⛲', desc: '초당 마나 회복 +1.5', apply: r => r.manaRegen += 1.5 },
  { id: 'partyAtk', name: '전투의 함성', icon: '📯', desc: '파티 공격력 +12%', apply: r => r.partyAtk += 12 },
  { id: 'partyDef', name: '단단한 결속', icon: '🪨', desc: '파티 받는 피해 -8%', apply: r => r.partyDef += 8 },
  { id: 'partyHp', name: '생명의 나무', icon: '🌳', desc: '파티 최대 HP +12%', apply: r => r.partyHp += 12 },
  { id: 'cast', name: '신속한 기도', icon: '⏩', desc: '캐스팅 속도 +10%', apply: r => r.castPct += 10 },
  { id: 'maxMana', name: '깊은 샘', icon: '🔵', desc: '최대 마나 +40', apply: r => r.maxMana += 40 },
  { id: 'move', name: '가벼운 발', icon: '🪶', desc: '힐러 이동속도 +12%', apply: r => r.movePct += 12 },
  { id: 'gold', name: '탐욕', icon: '💰', desc: '이번 도전 골드 획득 +25%', apply: r => r.goldPct += 25 },
  { id: 'thorns', name: '가시 갑주', icon: '🌵', desc: '탱커가 받은 피해 20% 반사', apply: r => r.thorns += 20 },
  { id: 'smite', name: '심판', icon: '⚖️', desc: '성스러운 일격 피해 +40%, 모든 적에 피해 가능', apply: r => { r.smitePct += 40; r.smiteAll = true; } },
];

// ---------- 각인 ----------
const ENGRAVES_STAT = ['str', 'def', 'agi', 'end', 'int', 'vit'];
const ENGRAVES_SPECIAL = [
  { id: 'guard', name: '수호 문양', desc: '피격 시 20% 확률로 3초간 방어력 2배' },
  { id: 'evade', name: '바람 문양', desc: '20% 확률로 적 공격 회피' },
  { id: 'clarity', name: '명석 문양', desc: '힐 시전 시 20% 확률로 마나 5 회복' },
  { id: 'swift', name: '질주 문양', desc: '광역기 범위 안에서 이동속도 +30%' },
  { id: 'echo', name: '메아리 문양', desc: '단일힐 20% 확률로 가장 약한 아군 추가 치유(50%)' },
];

// ---------- 퀘스트 ----------
const MAIN_QUESTS = [
  { floor: 3, title: '탑의 첫 발걸음', story: '마을 장로: "탑을 오를 힐러가 나타났구나. 우선 3층까지 올라보거라."' },
  { floor: 5, title: '고블린 왕', story: '5층에 고블린 왕이 자리 잡았다고 한다. 녀석을 쓰러뜨려라.' },
  { floor: 10, title: '죽음의 기운', story: '10층에서 리치의 기운이 느껴진다. 성스러운 빛이 필요하다.' },
  { floor: 15, title: '대족장의 분노', story: '오크 대족장이 부족을 이끌고 탑을 점거했다.' },
  { floor: 20, title: '심해의 노래', story: '나가 여왕의 노래가 마을까지 들려온다. 20층으로!' },
  { floor: 30, title: '용의 둥지', story: '고룡이 깨어났다. 길드의 힘을 모아야 할 때다.' },
  { floor: 40, title: '절반의 탑', story: '아무도 가보지 못한 40층. 전설이 시작된다.' },
  { floor: 50, title: '구름 위', story: '50층 위로는 하늘조차 보이지 않는다.' },
  { floor: 60, title: '시련의 회랑', story: '시련을 넘는 자만이 정상에 닿을 수 있다.' },
  { floor: 75, title: '어둠의 왕좌', story: '어둠의 군주가 왕좌를 지키고 있다.' },
  { floor: 90, title: '마지막 계단', story: '정상이 코앞이다. 동료를 믿어라.' },
  { floor: 99, title: '세상에 평화를', story: '99층을 정복하고 세상에 평화를 가져와라!' },
];
const TOWN_QUESTS = [
  { giver: '빵집 할머니', text: '고블린이 밀가루를 훔쳐가요! 고블린 {n}마리 처치', kind: 'kill', target: 'goblin', n: 8 },
  { giver: '경비대장', text: '해골 병사 {n}마리를 처치해 주게.', kind: 'kill', target: 'skeleton', n: 8 },
  { giver: '사냥꾼 조합', text: '늑대인간 {n}마리 처치', kind: 'kill', target: 'wolf', n: 6 },
  { giver: '약초상', text: '트롤 주술사 {n}마리 처치', kind: 'kill', target: 'troll', n: 6 },
  { giver: '신전 수녀', text: '언데드 {n}마리 정화', kind: 'killUndead', n: 15 },
  { giver: '여관 주인', text: '탑에서 {n}층 클리어하기', kind: 'floors', n: 5 },
  { giver: '대장장이', text: '아군 {n}회 치유하기', kind: 'heals', n: 120 },
  { giver: '모험가 사무소', text: '저주 {n}회 해제하기', kind: 'cleanses', n: 15 },
];
const DAILY_QUESTS = [
  { text: '탑 {n}층 클리어', kind: 'floors', n: 3 },
  { text: '몬스터 {n}마리 처치', kind: 'kills', n: 30 },
  { text: '치유 {n}회', kind: 'heals', n: 60 },
  { text: '부활 {n}회', kind: 'revives', n: 1 },
  { text: '저주 해제 {n}회', kind: 'cleanses', n: 5 },
];

const RECRUIT_NAMES = ['루루', '토토', '모모', '키키', '보리', '콩이', '두부', '망고', '호두', '젤리', '쿠키', '라떼', '밤톨', '뭉치', '솜이', '치즈', '감자', '꿀떡', '포도', '단비', '하리', '초코', '별이', '나비'];
const GUILDS = [
  { name: '새벽의 등불', lvl: 3, bonus: 5, desc: '초보 친화적인 따뜻한 길드' },
  { name: '강철 맹세', lvl: 6, bonus: 8, desc: '탱커가 많은 단단한 길드' },
  { name: '별빛 원정대', lvl: 9, bonus: 12, desc: '최상층을 노리는 정예 길드 (Lv.15 이상)', req: 15 },
];
