// TapWar - Exact Real Administrative Map Engine (Troop Advance & Auto-Relay Edition)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let view = {
  scale: 1.0,
  minScale: 0.7,
  maxScale: 3.5,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0
};

// 화면(논리) 크기와 기기 픽셀 비율: 캔버스는 실제 픽셀 수(×DPR)로 그려 레티나에서도 선명하게
let viewW = window.innerWidth, viewH = window.innerHeight;
let DPR = Math.min(window.devicePixelRatio || 1, 3);
function resizeCanvas() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(viewW * DPR);
  canvas.height = Math.round(viewH * DPR);
  updateZoneScreenPositions();
}
window.addEventListener('resize', resizeCanvas);

// Game States
const GAME_STATE = {
  SELECT_START: 'SELECT_START',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER'
};
let currentState = GAME_STATE.SELECT_START;

const OWNER = {
  NEUTRAL: 'neutral',
  PLAYER: 'player',
  ENEMY: 'enemy',
  ENEMY2: 'enemy2' // 전세계 3파전의 두 번째 적
};

const playerBuffs = {
  powerLevel: 0, // 파워 구슬 획득 횟수
  interval: 1000 // 최초 1.0초에 하나씩 생성!
};

let gameSpeed = 1; // 1x, 2x, 4x 배속

function setGameSpeed(speed) {
  gameSpeed = speed;
  document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`speed-${speed}x`);
  if (targetBtn) targetBtn.classList.add('active');
}

// Enemy AI Standard Parameters
const ENEMY_CONFIG = {
  enemyInterval: 1000,          // 아군과 동일한 1.0초 기본 생성 주기
  enemyDecisionInterval: 800,   // AI 전황 판단 주기 (800ms)
  enemyOrbSpeed: 5.2,           // 아군(baseOrbSpeed=5.2)과 동일한 비행 속도
  enemyFocusCooldown: 5.0,      // 적 집중포화 재판단 주기 (5초)
  enemyFocusSalvo: 3,           // 적 집중포화 일제 사격 수
  enemySpecialCooldown: 20,     // 특수기술 쿨타임 (20초)
  startingEnemyBases: 1         // 시작 적 거점 수 (1개, 플레이어와 1:1 대등)
};

// 작전 소요 시간 측정 (스톱워치 기록계)
let gameElapsedTime = 0;
let lastTimerText = '';

// 작전 수행 기록 관리 (localStorage 기반)
const STORAGE_KEY_RECORDS = 'tapwar_battle_records';

function getBattleRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('localStorage read error:', e);
  }
  return {
    KOREA: { cleared: false, bestTime: null, clearCount: 0, lastClearedAt: null },
    SEOUL: { cleared: false, bestTime: null, clearCount: 0, lastClearedAt: null },
    GYEONGGI: { cleared: false, bestTime: null, clearCount: 0, lastClearedAt: null }
  };
}

function saveBattleRecord(mapKey, elapsedSec) {
  const records = getBattleRecords();
  if (!records[mapKey]) {
    records[mapKey] = { cleared: false, bestTime: null, clearCount: 0 };
  }
  const entry = records[mapKey];
  
  let isNewBest = false;
  if (entry.bestTime === null || elapsedSec < entry.bestTime) {
    entry.bestTime = elapsedSec;
    isNewBest = true;
  }
  entry.cleared = true;
  entry.clearCount = (entry.clearCount || 0) + 1;
  entry.lastClearedTime = elapsedSec;
  entry.lastClearedAt = new Date().toISOString();
  records[mapKey] = entry;

  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
  updateRecordDisplays();
  return { isNewBest, bestTime: entry.bestTime, clearCount: entry.clearCount };
}

function formatTimeString(sec) {
  if (sec === null || sec === undefined) return '--:--';
  const mins = Math.floor(sec / 60).toString().padStart(2, '0');
  const secs = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function updateRecordDisplays() {
  const records = getBattleRecords();
  
  // 시작 모달 내 전장별 기록 뱃지 업데이트 (MAP_CONFIGS의 모든 전장)
  Object.keys(MAP_CONFIGS).forEach(key => {
    const el = document.getElementById(`modal-${key.toLowerCase()}-record`);
    if (!el) return;
    const r = records[key];
    // 기록이 있을 때만 최고 기록 표시 (없으면 비워 둠)
    el.textContent = (r && r.cleared && r.bestTime !== null) ? `${formatTimeString(r.bestTime)}` : '';
  });

  // 상단 HUD 최고 기록 뱃지
  const curRecord = records[currentMapKey];
  const bestHudEl = document.getElementById('best-timer-hud');
  if (bestHudEl) {
    if (curRecord && curRecord.cleared && curRecord.bestTime !== null) {
      bestHudEl.innerText = `(최고 ${formatTimeString(curRecord.bestTime)})`;
    } else {
      bestHudEl.innerText = `(미평정)`;
    }
  }
}
window.updateRecordDisplays = updateRecordDisplays;

// [설정]: 아이템 적용 임시 비활성화 (지우지 않고 테스트용으로 비활성화)
const ENABLE_ITEMS = false;

let currentPowerZone = null; // 파워 구슬이 지정된 단 1곳의 점령지
let currentEnemyPowerZone = null; // 적군 파워 구슬 거점
let currentFocusZone = null; // 아군 집중포화: 가장 마지막에 지정한 구역
// 아군 집중포화 구역 목록 (지금은 한 곳만: 더블탭하면 새 곳으로 옮겨감)
let playerFocusList = [];
function syncFocus() { currentFocusZone = playerFocusList[playerFocusList.length - 1] || null; }
function addPlayerFocus(z) { playerFocusList = playerFocusList.filter(f => f !== z); playerFocusList.push(z); syncFocus(); }
function removePlayerFocus(z) { playerFocusList = playerFocusList.filter(f => f !== z); syncFocus(); }

// 이 지역이 사격할 집중포화 구역
// - 원거리 가능(완전점령) 지역: 가장 마지막에 지정한 집중포화 구역
// - 그 외: 맞닿은 집중포화 구역 중 가장 최근 것
function focusForZone(zone) {
  if (zone.owner !== OWNER.PLAYER || zone.focusOptOut || playerFocusList.length === 0) return null;
  if (isFullyConquered(zone) && !isUnleashed(zone)) return null;
  for (let i = playerFocusList.length - 1; i >= 0; i--) {
    const f = playerFocusList[i];
    if (f === zone || !canAttackTarget(zone, f)) continue;
    if (canRangeAttack(zone) || zone.neighbors.includes(f)) return f;
  }
  return null;
}
let focusFireCooldown = 0; // 집중포화 쿨타임 없음 (0초)
const FOCUS_FIRE_COOLDOWN_MAX = 0; // 쿨타임 없음
let focusRings = []; // 집중포화 및 타격 링 이펙트

let baseOrbSpeed = 5.2;
let focusSalvoCount = 3;

// Special Skill (완전점령 지역 1곳당 10초 충전 후 1발, 사용 시 소모)
// [특수 기술 충전 규칙]
// - 완전점령 지역 1곳마다 특수 기술 1발을 충전할 수 있음
// - 완전점령 상태를 10초(게임 시간) 유지하면 그 지역에 1발 충전 완료
// - 사용하면 그 지역의 1발은 소모되어, 완전점령이 풀렸다가 다시 완전점령되어야 재충전
// - 충전 중이든 충전 완료든 완전점령이 풀리면 리셋
const SKILL_CHARGE_SEC = 10;
const SKILL_DENIED_FLASH = '#94a3b8'; // 특수 기술을 지금 쓸 수 없을 때 탭한 지역 테두리 회색 번쩍
const SKILL_GCD_SEC = 10;       // 특수 기술 글로벌 쿨타임 (게임 시간)
let playerSkillGcdUntil = 0;    // 아군 글로벌 쿨타임 종료 시각 (gameElapsedTime 기준)
let enemySkillGcdUntil = 0;     // 적군 글로벌 쿨타임 종료 시각
// 최초 해금: 완전점령 지역을 1곳 이상 확보한 적이 있어야 특수 기술 충전·사용 가능 (이후에는 조건 없음)
const SKILL_UNLOCK_FULL_COUNT = 1;
const skillUnlocked = { player: false, enemy: false };
const gcdWasActive = { player: false, enemy: false };
let specialSkillCooldown = 0; // (미사용) 이전 글로벌 쿨타임 호환용

// Enemy AI Special Skill & Focus Fire
let enemySpecialSkillCooldown = 0;
const ENEMY_SPECIAL_SKILL_MIN_GAP = 10; // 적군도 아군과 같은 글로벌 쿨타임
let enemyFocusFireCooldown = 0;
const ENEMY_FOCUS_FIRE_COOLDOWN_MAX = 5.0; // 5초 쿨타임
let currentEnemyFocusZone = null;
let enemyFocusReticleTimer = 0;

// 메인 지역(본진): 게임 시작 시 확보한 최초 거점. 특수 기술의 대상이 되지 않음.
// 일반 구슬 전투로 함락되면 메인 지역 지위를 잃음.
let playerMainZone = null;
let enemyMainZone = null;
// [이탈리아 '최고의 지휘관'] 양쪽에 무작위로 하나씩 더 생기는 본진 (zone.mainOwner 로 주인 기록)
const extraMains = new Set();
function isExtraMainOf(zone, owner) { return extraMains.has(zone) && zone.mainOwner === owner && zone.owner === owner; }
let enemy2MainZone = null;
// 3파전(나 vs 적 vs 적2 보라): 지금은 어느 맵도 쓰지 않음 (전세계도 1:1). 다시 쓰려면 여기서 켜기
function isThreeWay() { return false; }
// [원거리 규칙] 모든 맵: 맞닿지 않은 곳으로 쏘는 구슬은 2배 느리고, 그런 지역은 발사 간격도 2배
const RANGED_SLOW = 2;
const RANGED_INTERVAL_MULT = 2;
function isRangedShot(src, tgt) {
  return !!src && !!tgt && src !== tgt && !!src.neighbors && !src.neighbors.includes(tgt);
}

const MAIN_ZONE_POWER = 2; // 메인 지역 구슬 공격력
const MAIN_ZONE_HP = 400;   // 메인 지역 피 (일반 지역 50). 처음부터 메인을 노리기보다 주변을 먼저 공략하도록
const EXTRA_MAIN_HP = MAIN_ZONE_HP / 2; // 이탈리아·전세계 추가 본진

function isMainZone(zone) {
  return (zone === playerMainZone && zone.owner === OWNER.PLAYER) ||
         (zone === enemyMainZone && zone.owner === OWNER.ENEMY) ||
         (extraMains.has(zone) && zone.mainOwner === zone.owner) ||
         (zone === enemy2MainZone && zone.owner === OWNER.ENEMY2);
}

// 특수 기술을 쓴 완전점령 지역은 공격 제한이 풀려 메인 지역처럼 싸움:
// 공격력 2, 맞닿은 목표가 없으면 전선 원거리 공격, 지정 공격·집중 포화 참여 (특수 기술 면역은 메인만)
// 지역을 잃으면(중립이 되면) 해제
// [정식 규칙: 완전점령 전략 버전] 특수 기술 없음. 원거리는 완전점령 지역이 지시받을 때만, 메인 공격력 5 등.
// (코드 안의 '[실험]' 표시는 이 규칙을 뜻함. false 로 바꾸면 예전 특수 기술 버전 동작)
const EXPERIMENT_NO_SKILL = true;
const FULL_ZONE_HP = 100; // [실험] 완전점령 지역 피
const EXP_MAIN_POWER = 5;   // [실험] 메인 지역 공격력 (완전점령 지역은 1)

// 원거리 공격(맞닿지 않은 지역 공격) 가능 여부
// [실험] 완전점령 지역만 원거리 가능 (메인도 완전점령이어야 원거리). 일반 지역·메인은 맞닿은 곳만
function canRangeAttack(zone) {
  // [아이템 장거리 사격] 모든 내 지역 원거리 가능
  if (zone.owner !== OWNER.NEUTRAL && hasItem(zone.owner, 'longrange')) return true;
  // 완전점령 후 충전 게이지(10초)가 다 차야 원거리 가능
  if (EXPERIMENT_NO_SKILL) return zone.owner !== OWNER.NEUTRAL && isFullyConquered(zone) && zone.chargeState === 'ready';
  return isUnleashed(zone);
}

// 구슬 공격력: [실험] 메인 5, 그 외(완전점령 포함) 1 / 기존: 메인·해제 지역 2
function getZonePower(zone) {
  if (EXPERIMENT_NO_SKILL) return isMainZone(zone) ? EXP_MAIN_POWER : 1;
  return isUnleashed(zone) ? MAIN_ZONE_POWER : 1;
}

function isUnleashed(zone) {
  if (EXPERIMENT_NO_SKILL && zone.owner !== OWNER.NEUTRAL && isFullyConquered(zone)) return true;
  return isMainZone(zone) || (!!zone.unleashed && zone.unleashedOwner === zone.owner);
}
function unleashZone(zone) {
  zone.unleashed = true;
  zone.unleashedOwner = zone.owner;
}

// 공격 가능한 자동 목표인지: 내 점령지가 아니고, 적의 완전점령() 철벽 기지가 아님
function isAutoAttackable(target, owner, attacker) {
  if (target.owner === owner || target.isHidden) return false;
  return canAttackTarget(attacker, target);
}

// 상대의 완전점령 지역(철벽)을 이 지역이 공격할 수 있는지
// [실험] 완전점령 지역은 상대의 완전점령 지역으로만 공격 가능 (양쪽 동일). 실험이 아니면 항상 면역
function canAttackTarget(attacker, target) {
  if (!target || target.owner === OWNER.NEUTRAL) return true;
  if (attacker && target.owner === attacker.owner) return true;
  if (!isFullyConquered(target)) return true;
  return EXPERIMENT_NO_SKILL && !!attacker && attacker.owner !== OWNER.NEUTRAL &&
    attacker.owner !== target.owner && isFullyConquered(attacker);
}

// 메인 지역 원거리 자동 목표: 내 점령지역 전체와 맞닿아 있는 지역(전선) 중 무작위 1곳
function pickMainZoneFrontierTarget(zone) {
  const frontier = new Set();
  for (let i = 0; i < rawZones.length; i++) {
    const own = rawZones[i];
    if (own.owner !== zone.owner) continue;
    own.neighbors.forEach(n => {
      if (isAutoAttackable(n, zone.owner, zone)) frontier.add(n);
    });
  }
  if (frontier.size === 0) return null;
  const list = [...frontier];
  return list[Math.floor(Math.random() * list.length)];
}

// [특수 기술 대상 우선순위] (메인 지역은 항상 제외, 피가 닳은 점령지도 대상)
// 1순위: 일반 점령지역 (완전점령 아님)
// 2순위: 1순위가 3곳보다 적으면 부족한 수만큼 완전점령지역으로 채움
//   예) 점령지역 2곳 → 점령지역 2 + 완전점령 1 / 점령지역 1곳 → 점령지역 1 + 완전점령 2
// 같은 순위 안에서는 공격하는 쪽 지역과 가까운 순: 맞닿은 지역 우선 → 최단 거리 순 (동률은 무작위)
function buildSkillTargetList(victimOwner) {
  const attackerOwner = victimOwner === OWNER.PLAYER ? OWNER.ENEMY : OWNER.PLAYER;
  const attackers = rawZones.filter(z => z.owner === attackerOwner);
  // 피해 대상: 상대 점령지(메인 제외) + 상대가 점령 중인 중립 지역(줄다리기 게이지가 상대 색으로 조금이라도 찬 곳)
  const victims = rawZones.filter(z => !z.isHidden &&
    ((z.owner === victimOwner && !isMainZone(z)) ||
     (z.owner === OWNER.NEUTRAL && z.claimant === victimOwner && z.orbs > 0)));
  victims.forEach(v => {
    let minDist = Infinity;
    let touching = false;
    for (let i = 0; i < attackers.length; i++) {
      const a = attackers[i];
      if (v.neighbors.includes(a)) touching = true;
      const d = Math.hypot(v.cx - a.cx, v.cy - a.cy);
      if (d < minDist) minDist = d;
    }
    v._skillTouching = touching;
    v._skillDist = minDist;
    v._skillTie = Math.random();
  });
  const byProximity = (a, b) => {
    if (a._skillTouching !== b._skillTouching) return a._skillTouching ? -1 : 1;
    if (a._skillDist !== b._skillDist) return a._skillDist - b._skillDist;
    return a._skillTie - b._skillTie;
  };
  const normal = victims.filter(z => !isFullyConquered(z)).sort(byProximity);
  const full = victims.filter(z => isFullyConquered(z)).sort(byProximity);
  return normal.concat(full);
}

const SKILL_DAMAGE = 10;
// 특수 기술 피해: 소유는 유지한 채 피만 깎음. 0 이하가 되면 중립(공격한 쪽 우세 게이지 0)
function applySkillDamage(zone, attacker) {
  // 점령 중인 중립 지역: 상대 게이지를 10 깎고, 넘치는 만큼은 공격한 쪽 게이지로 넘어감
  if (zone.owner === OWNER.NEUTRAL) {
    zone.orbs -= SKILL_DAMAGE;
    if (zone.orbs <= 0) {
      zone.claimant = -zone.orbs > 0 ? attacker : null;
      zone.orbs = Math.max(0, -zone.orbs);
    }
    return;
  }
  zone.orbs -= SKILL_DAMAGE;
  if (zone.orbs <= 0) {
    zone.owner = OWNER.NEUTRAL;
    zone.maxOrbs = ZONE_MAX_HP;
    zone.claimant = -zone.orbs > 0 ? attacker : null;
    zone.orbs = Math.max(0, -zone.orbs);
    zone.targetZones = [];
    zone.isManualTarget = false;
  }
}

// 특수 기술 대상: 우선순위대로 정렬된 후보 중 최대 3곳 (중립화하지 않으므로 최후 거점 보호 불필요)
function pickSpecialSkillTargets(candidates) {
  return candidates.slice(0, Math.min(3, candidates.length));
}

// 특수 기술 발동: 충전 완료()된 아군 완전점령 지역을 탭하면 그 지역의 1발을 사용
function useSpecialSkill(sourceZone) {
  if (EXPERIMENT_NO_SKILL) return;
  if (currentState !== GAME_STATE.PLAYING) return;
  if (!sourceZone || sourceZone.owner !== OWNER.PLAYER || sourceZone.chargeState !== 'ready') return;
  if (gameElapsedTime < playerSkillGcdUntil) return; // 글로벌 쿨타임 중 (지역 위 시계 방향 쿨타임 표시)

  // [규칙]: 메인 제외, 1순위 점령지역 → 2순위 완전점령지역으로 최대 3곳 공격
  const enemyZones = buildSkillTargetList(OWNER.ENEMY);
  const enemyMainAlive = !!(enemyMainZone && enemyMainZone.owner === OWNER.ENEMY);
  if (enemyZones.length === 0) {
    document.getElementById('status-guide').innerText = '특수 기술로 공격할 적 지역이 없습니다! (적 메인 지역은 특수 기술 면역)';
    flashZone(sourceZone, SKILL_DENIED_FLASH);
    return;
  }

  sourceZone.chargeState = 'spent';
  unleashZone(sourceZone);
  playerSkillGcdUntil = gameElapsedTime + SKILL_GCD_SEC;

  const targetEnemyZones = pickSpecialSkillTargets(enemyZones, enemyMainAlive);

  targetEnemyZones.forEach(z => {
    // [규칙]: 피 10 감소. 지역은 계속 소유 진영의 것이며 공격도 계속함 (중립화하지 않음)
    // 피가 0이 되면 일반 전투와 같이 중립으로 전환
    applySkillDamage(z, OWNER.PLAYER);

    createDisintegrateParticle(z.cx, z.cy, '#ef4444');
    focusRings.push({
      x: z.cx,
      y: z.cy,
      radius: 18,
      alpha: 1.0,
      color: '#ef4444'
    });
  });

  // 점령 해제에 따라 주위 점령지역들이 부족한 피를 채우고 점령하기 위해 자동 재타겟팅
  rawZones.forEach(z => {
    if (z.owner !== OWNER.NEUTRAL && !z.isManualTarget) {
      reRouteZone(z);
    }
  });

  updatePowerZone();
  updateEnemyPowerZone();

  const names = targetEnemyZones.map(tz => tz.name).join(', ');
  document.getElementById('status-guide').innerText = `[특수 기술 발동!]: 적지 [${names}] ${targetEnemyZones.length}곳 피 10 감소! ([${sourceZone.name}] 충전 사용, 남은 충전: ${getReadySkillZones(OWNER.PLAYER).length}발)`;
}

// 적군 AI 전용 특수 기술 (아군과 동일한 충전 규칙)
function useEnemySpecialSkill() {
  if (EXPERIMENT_NO_SKILL) return;
  if (currentState !== GAME_STATE.PLAYING) return;

  if (getReadySkillZones(OWNER.ENEMY).length === 0) return;
  // 적군은 충전이 있어도 연사하지 않도록 최소 간격 유지
  if (enemySpecialSkillCooldown > 0) return;

  // 적군 AI도 동일 우선순위: 메인 제외, 1순위 점령지역 → 2순위 완전점령지역
  const playerZones = buildSkillTargetList(OWNER.PLAYER);
  const playerMainAlive = !!(playerMainZone && playerMainZone.owner === OWNER.PLAYER);
  if (playerZones.length === 0) return;

  enemySpecialSkillCooldown = ENEMY_SPECIAL_SKILL_MIN_GAP;
  enemySkillGcdUntil = gameElapsedTime + SKILL_GCD_SEC;
  consumeSkillCharge(OWNER.ENEMY);

  const targetPlayerZones = pickSpecialSkillTargets(playerZones, playerMainAlive);

  targetPlayerZones.forEach(z => {
    // [규칙]: 피 10 감소. 지역은 계속 소유 진영의 것이며 공격도 계속함 (중립화하지 않음)
    // 피가 0이 되면 일반 전투와 같이 중립으로 전환
    applySkillDamage(z, OWNER.ENEMY);

    createDisintegrateParticle(z.cx, z.cy, '#38bdf8');
    focusRings.push({
      x: z.cx,
      y: z.cy,
      radius: 18,
      alpha: 1.0,
      color: '#ef4444'
    });
  });

  // 점령 해제에 따라 주위 점령지역들이 자동 재타겟팅
  rawZones.forEach(z => {
    if (z.owner !== OWNER.NEUTRAL && !z.isManualTarget) {
      reRouteZone(z);
    }
  });

  updatePowerZone();
  updateEnemyPowerZone();

  const names = targetPlayerZones.map(tz => tz.name).join(', ');
  document.getElementById('status-guide').innerText = `[적군 특수 기술 발동!]: 아군 점령지 [${names}] ${targetPlayerZones.length}곳 피 10 감소!`;
}

// 지역별 충전 상태 갱신: state = null(완전점령 아님) | 'charging' | 'ready' | 'spent'
function updateSkillCharges(dt) {
  // 최초 해금 판정: 완전점령 1곳을 처음 달성하면 그 진영은 이후 계속 해금 상태
  [OWNER.PLAYER, OWNER.ENEMY].forEach(owner => {
    if (skillUnlocked[owner]) return;
    let count = 0;
    for (let i = 0; i < rawZones.length; i++) {
      if (rawZones[i].owner === owner && isFullyConquered(rawZones[i])) count++;
    }
    if (count >= SKILL_UNLOCK_FULL_COUNT) skillUnlocked[owner] = true;
  });

  // 글로벌 쿨타임이 끝나는 순간: 다시 사용 가능해진 충전 지역의 테두리를 번쩍
  [[OWNER.PLAYER, playerSkillGcdUntil], [OWNER.ENEMY, enemySkillGcdUntil]].forEach(([owner, until]) => {
    const active = gameElapsedTime < until;
    if (gcdWasActive[owner] && !active) {
      for (let i = 0; i < rawZones.length; i++) {
        const z = rawZones[i];
        if (z.owner === owner && z.chargeState === 'ready') {
          const isMyMain = z.owner === OWNER.PLAYER && z === playerMainZone;
          flashZone(z, isMyMain ? ZONE_COLORS.mainCharged : (owner === OWNER.PLAYER ? ZONE_COLORS.playerFullCharged : ZONE_COLORS.enemyFullCharged));
        }
      }
    }
    gcdWasActive[owner] = active;
  });

  for (let i = 0; i < rawZones.length; i++) {
    const z = rawZones[i];
    if (z.unleashed && z.owner !== z.unleashedOwner) z.unleashed = false; // 잃은 지역은 해제
    // [실험] 완전점령 지역은 피 100 (메인 제외). 완전점령이 풀리면 다시 50
    if (EXPERIMENT_NO_SKILL && !isMainZone(z)) {
      const fortress = z.owner !== OWNER.NEUTRAL && isFullyConquered(z);
      if (fortress && !z.fortressHp) {
        z.fortressHp = true;
        z.maxOrbs = FULL_ZONE_HP;
        z.orbs = FULL_ZONE_HP;
      } else if (!fortress && z.fortressHp) {
        z.fortressHp = false;
        if (z.owner !== OWNER.NEUTRAL) {
          z.maxOrbs = ZONE_MAX_HP;
          z.orbs = Math.min(z.orbs, ZONE_MAX_HP);
        }
      }
    }
    // 해금 전에는 충전이 시작되지 않음 (연한 완전점령 색 유지)
    const full = z.owner !== OWNER.NEUTRAL && isFullyConquered(z) && skillUnlocked[z.owner];
    if (!full || z.chargeOwner !== z.owner) {
      z.chargeState = full ? 'charging' : null;
      z.chargeTime = 0;
      z.chargeOwner = full ? z.owner : null;
      continue;
    }
    if (z.chargeState === 'charging') {
      z.chargeTime += dt * gameSpeed;
      if (z.chargeTime >= SKILL_CHARGE_SEC) {
        z.chargeState = 'ready';
        // 충전 완료: 테두리가 같은 색으로 번쩍
        const isMyMain = z.owner === OWNER.PLAYER && z === playerMainZone;
        flashZone(z, isMyMain ? ZONE_COLORS.mainCharged : (z.owner === OWNER.PLAYER ? ZONE_COLORS.playerFullCharged : ZONE_COLORS.enemyFullCharged));
      }
    }
  }
}

function getReadySkillZones(owner) {
  return rawZones.filter(z => z.owner === owner && z.chargeState === 'ready');
}

// 충전 완료된 지역 1곳의 1발을 소모
function consumeSkillCharge(owner) {
  const ready = getReadySkillZones(owner);
  if (ready.length === 0) return false;
  ready[0].chargeState = 'spent';
  unleashZone(ready[0]);
  return true;
}

let lastSkillTimerText = '';
let lastSkillBtnDisabled = null;

function updateSpecialSkillHUD(dt) {
  updateSkillCharges(dt);

  const btn = document.getElementById('special-skill-btn');
  const timer = document.getElementById('special-skill-timer');
  if (!btn || !timer) return;

  const own = rawZones.filter(z => z.owner === OWNER.PLAYER && z.chargeState);
  const readyCount = own.filter(z => z.chargeState === 'ready').length;
  const charging = own.filter(z => z.chargeState === 'charging');

  let text = '';
  let color = '';
  let disabled = false;

  if (readyCount > 0) {
    text = `${readyCount}발 발사 가능! `;
    color = '#22c55e';
  } else if (charging.length > 0) {
    disabled = true;
    const remain = Math.min(...charging.map(z => SKILL_CHARGE_SEC - z.chargeTime));
    text = `충전 중 (${Math.max(1, Math.ceil(remain))}s)`;
    color = '#f59e0b';
  } else if (own.length > 0) {
    disabled = true;
    text = '재충전: 완전점령 풀렸다 다시 확보';
    color = '#94a3b8';
  } else {
    disabled = true;
    text = '완전점령 지역 필요';
    color = '#94a3b8';
  }

  if (disabled !== lastSkillBtnDisabled) {
    lastSkillBtnDisabled = disabled;
    if (disabled) btn.classList.add('disabled');
    else btn.classList.remove('disabled');
  }

  if (text !== lastSkillTimerText) {
    lastSkillTimerText = text;
    timer.innerText = text;
    timer.style.color = color;
  }
}

const ZONE_MAX_HP = 50;
let currentMapKey = 'KOREA';

const MAP_CONFIGS = {
  KOREA: {
    name: '한반도 전국 전선 (164개 시·군)',
    maxScale: 14,                     // 전국처럼 큰 맵은 4배 더 확대 (기본 3.5 → 14)
    minimap: { w: 84, h: 104 },       // 세로로 긴 전국 맵은 미니맵을 작게
    file: 'assets/south_korea_exact_zones.json',
    bounds: { minLng: 125.7, maxLng: 131.1, minLat: 33.1, maxLat: 38.65 },
    aspectRatio: 0.82
  },
  SEOUL: {
    name: '서울특별시 전선 (25개 자치구)',
    file: 'assets/seoul_exact_zones.json',
    bounds: { minLng: 126.75, maxLng: 127.20, minLat: 37.42, maxLat: 37.71 },
    aspectRatio: 1.12
  },
  GYEONGGI: {
    name: '경기도 전선 (31개 시·군)',
    file: 'assets/gyeonggi_exact_zones.json',
    bounds: { minLng: 126.487, maxLng: 127.8755, minLat: 36.8639, maxLat: 38.3114 },
    aspectRatio: 0.82,
    guide: '경기도 전선 작전: 시작할 시·군(예: 수원, 고양, 용인 등)을 탭하세요!'
  },
  // 시·도 맵 (tools/make_region_map.py로 생성. 범위·화면 비율은 맵 JSON의 meta.bounds에서 계산)
  BUSAN: { name: '부산', label: '부산', count: 20, file: 'assets/busan_zones.json', maxScale: 8 },
  DAEGU: { name: '대구', label: '대구', count: 24, file: 'assets/daegu_zones.json', maxScale: 8 },
  INCHEON: { name: '인천', label: '인천', count: 26, file: 'assets/incheon_zones.json', maxScale: 8 },
  GWANGJU_JEONNAM: { name: '전남광주', label: '전남광주', count: 27, file: 'assets/gwangju_jeonnam_zones.json', maxScale: 8 },
  DAEJEON: { name: '대전', label: '대전', count: 82, file: 'assets/daejeon_zones.json', maxScale: 8 },
  ULSAN: { name: '울산', label: '울산', count: 16, file: 'assets/ulsan_zones.json', maxScale: 8 },
  SEJONG: { name: '세종', label: '세종', count: 24, file: 'assets/sejong_zones.json', maxScale: 8 },
  GANGWON: { name: '강원', label: '강원', count: 25, file: 'assets/gangwon_zones.json', maxScale: 8 },
  CHUNGBUK: { name: '충북', label: '충북', count: 25, file: 'assets/chungbuk_zones.json', maxScale: 8 },
  CHUNGNAM: { name: '충남', label: '충남', count: 25, file: 'assets/chungnam_zones.json', maxScale: 8 },
  JEONBUK: { name: '전북', label: '전북', count: 25, file: 'assets/jeonbuk_zones.json', maxScale: 8 },
  GYEONGBUK: { name: '경북', label: '경북', count: 25, file: 'assets/gyeongbuk_zones.json', maxScale: 8 },
  GYEONGNAM: { name: '경남', label: '경남', count: 25, file: 'assets/gyeongnam_zones.json', maxScale: 8 },
  JEJU: { name: '제주', label: '제주', count: 43, file: 'assets/jeju_zones.json', maxScale: 8 },
  // 일본 (country: 'JP') — tools/build_japan_maps.sh 로 생성
  JP_HOKKAIDO: { country: 'JP', name: '홋카이도', label: '홋카이도', count: 14, file: 'assets/jp_hokkaido_zones.json', maxScale: 8, enemyStrength: 0.8 }, // 일본 첫 맵: 적 생산 0.8배로 쉽게
  JP_SHIKOKU: { country: 'JP', name: '시코쿠', label: '시코쿠', count: 16, file: 'assets/jp_shikoku_zones.json', maxScale: 8 },
  JP_CHUGOKU: { country: 'JP', name: '주고쿠', label: '주고쿠', count: 20, file: 'assets/jp_chugoku_zones.json', maxScale: 8 },
  JP_TOHOKU: { country: 'JP', name: '도호쿠', label: '도호쿠', count: 25, file: 'assets/jp_tohoku_zones.json', maxScale: 8 },
  JP_KANTO: { country: 'JP', name: '간토', label: '간토', count: 25, file: 'assets/jp_kanto_zones.json', maxScale: 8 },
  JP_KINKI: { country: 'JP', name: '긴키', label: '긴키', count: 25, file: 'assets/jp_kinki_zones.json', maxScale: 8 },
  JP_KYUSHU: { country: 'JP', name: '규슈·오키나와', label: '규슈·오키나와', count: 25, file: 'assets/jp_kyushu_zones.json', maxScale: 8 },
  JP_CHUBU: { country: 'JP', name: '주부', label: '주부', count: 27, file: 'assets/jp_chubu_zones.json', maxScale: 8 },
  JP_TOKYO: { country: 'JP', name: '도쿄', label: '도쿄', count: 29, file: 'assets/jp_tokyo_zones.json', maxScale: 10 },
  JP_JAPAN: { country: 'JP', name: '일본 전국', label: '일본 전국', count: 177, file: 'assets/jp_japan_zones.json', maxScale: 40 },
  // CN — tools/build_*_maps.sh 로 생성
  CN_DONGBEI: { country: 'CN', name: '둥베이', label: '둥베이', count: 20, file: 'assets/cn_dongbei_zones.json', maxScale: 8 },
  CN_HUAZHONG: { country: 'CN', name: '화중', label: '화중', count: 22, file: 'assets/cn_huazhong_zones.json', maxScale: 8 },
  CN_HUANAN: { country: 'CN', name: '화난', label: '화난', count: 22, file: 'assets/cn_huanan_zones.json', maxScale: 8 },
  CN_HUABEI: { country: 'CN', name: '화북', label: '화북', count: 25, file: 'assets/cn_huabei_zones.json', maxScale: 8 },
  CN_HUADONG: { country: 'CN', name: '화둥', label: '화둥', count: 27, file: 'assets/cn_huadong_zones.json', maxScale: 8 },
  CN_XINAN: { country: 'CN', name: '시난', label: '시난', count: 25, file: 'assets/cn_xinan_zones.json', maxScale: 8 },
  CN_XIBEI: { country: 'CN', name: '시베이', label: '시베이', count: 25, file: 'assets/cn_xibei_zones.json', maxScale: 8 },
  CN_CHINA: { country: 'CN', name: '중국 전국', label: '중국 전국', count: 166, file: 'assets/cn_china_zones.json', maxScale: 40 },
  // US — tools/build_*_maps.sh 로 생성
  US_NEWENGLAND: { country: 'US', name: '뉴잉글랜드', label: '뉴잉글랜드', count: 16, file: 'assets/us_newengland_zones.json', maxScale: 8 },
  US_MIDATLANTIC: { country: 'US', name: '중부 대서양', label: '중부 대서양', count: 18, file: 'assets/us_midatlantic_zones.json', maxScale: 8 },
  US_SOUTHCENTRAL: { country: 'US', name: '남부 내륙', label: '남부 내륙', count: 20, file: 'assets/us_southcentral_zones.json', maxScale: 8 },
  US_PACIFIC: { country: 'US', name: '태평양 연안', label: '태평양 연안', count: 20, file: 'assets/us_pacific_zones.json', maxScale: 8 },
  US_GREATLAKES: { country: 'US', name: '오대호', label: '오대호', count: 22, file: 'assets/us_greatlakes_zones.json', maxScale: 8 },
  US_PLAINS: { country: 'US', name: '중서부 평원', label: '중서부 평원', count: 24, file: 'assets/us_plains_zones.json', maxScale: 8 },
  US_SOUTHWEST: { country: 'US', name: '남서부', label: '남서부', count: 24, file: 'assets/us_southwest_zones.json', maxScale: 8 },
  US_SOUTHATLANTIC: { country: 'US', name: '남동부 해안', label: '남동부 해안', count: 25, file: 'assets/us_southatlantic_zones.json', maxScale: 8 },
  US_MOUNTAIN: { country: 'US', name: '로키 산맥', label: '로키 산맥', count: 25, file: 'assets/us_mountain_zones.json', maxScale: 8 },
  US_USA: { country: 'US', name: '미국 본토', label: '미국 본토', count: 194, file: 'assets/us_usa_zones.json', maxScale: 40 },
  // 프랑스 — tools/build_europe_nation_maps.sh 로 생성 (전국 = 지방 합침)
  FR_NORTH: { country: 'FR', name: '프랑스 북부', label: '프랑스 북부', count: 20, file: 'assets/fr_north_zones.json', maxScale: 8 },
  FR_WEST: { country: 'FR', name: '프랑스 서부', label: '프랑스 서부', count: 20, file: 'assets/fr_west_zones.json', maxScale: 8 },
  FR_SOUTH: { country: 'FR', name: '프랑스 남부', label: '프랑스 남부', count: 18, file: 'assets/fr_south_zones.json', maxScale: 8 },
  FR_EAST: { country: 'FR', name: '프랑스 동부', label: '프랑스 동부', count: 18, file: 'assets/fr_east_zones.json', maxScale: 8 },
  FR_FRANCE: { country: 'FR', name: '프랑스 전국', label: '프랑스 전국', count: 76, file: 'assets/fr_france_zones.json', maxScale: 20 },
  // 독일 — tools/build_europe_nation_maps.sh 로 생성 (전국 = 지방 합침)
  DE_NORTH: { country: 'DE', name: '독일 북부', label: '독일 북부', count: 20, file: 'assets/de_north_zones.json', maxScale: 8 },
  DE_EAST: { country: 'DE', name: '독일 동부', label: '독일 동부', count: 20, file: 'assets/de_east_zones.json', maxScale: 8 },
  DE_WEST: { country: 'DE', name: '독일 서부', label: '독일 서부', count: 20, file: 'assets/de_west_zones.json', maxScale: 8 },
  DE_SOUTH: { country: 'DE', name: '독일 남부', label: '독일 남부', count: 20, file: 'assets/de_south_zones.json', maxScale: 8 },
  DE_GERMANY: { country: 'DE', name: '독일 전국', label: '독일 전국', count: 80, file: 'assets/de_germany_zones.json', maxScale: 20 },
  // 이탈리아 — tools/build_europe_nation_maps.sh 로 생성 (전국 = 지방 합침)
  IT_NORTHWEST: { country: 'IT', name: '이탈리아 북서부', label: '이탈리아 북서부', count: 18, file: 'assets/it_northwest_zones.json', maxScale: 8 },
  IT_NORTHEAST: { country: 'IT', name: '이탈리아 북동부', label: '이탈리아 북동부', count: 18, file: 'assets/it_northeast_zones.json', maxScale: 8 },
  IT_CENTER: { country: 'IT', name: '이탈리아 중부', label: '이탈리아 중부', count: 18, file: 'assets/it_center_zones.json', maxScale: 8 },
  IT_SOUTH: { country: 'IT', name: '이탈리아 남부', label: '이탈리아 남부', count: 20, file: 'assets/it_south_zones.json', maxScale: 8 },
  IT_ISLANDS: { country: 'IT', name: '이탈리아 섬', label: '이탈리아 섬', count: 14, file: 'assets/it_islands_zones.json', maxScale: 8 },
  IT_ITALY: { country: 'IT', name: '이탈리아 전국', label: '이탈리아 전국', count: 88, file: 'assets/it_italy_zones.json', maxScale: 20 },
  // 스페인 — tools/build_europe_nation_maps.sh 로 생성 (전국 = 지방 합침)
  ES_NORTH: { country: 'ES', name: '스페인 북부', label: '스페인 북부', count: 14, file: 'assets/es_north_zones.json', maxScale: 8 },
  ES_EAST: { country: 'ES', name: '스페인 동부', label: '스페인 동부', count: 9, file: 'assets/es_east_zones.json', maxScale: 8 },
  ES_CENTER: { country: 'ES', name: '스페인 중부', label: '스페인 중부', count: 15, file: 'assets/es_center_zones.json', maxScale: 8 },
  ES_SOUTH: { country: 'ES', name: '스페인 남부', label: '스페인 남부', count: 10, file: 'assets/es_south_zones.json', maxScale: 8 },
  ES_SPAIN: { country: 'ES', name: '스페인 전국', label: '스페인 전국', count: 48, file: 'assets/es_spain_zones.json', maxScale: 20 },
  // 영국 — tools/build_europe_nation_maps.sh 로 생성 (전국 = 지방 합침)
  GB_SOUTH: { country: 'GB', name: '잉글랜드 남부', label: '잉글랜드 남부', count: 20, file: 'assets/gb_south_zones.json', maxScale: 8 },
  GB_MIDDLE: { country: 'GB', name: '잉글랜드 중북부', label: '잉글랜드 중북부', count: 20, file: 'assets/gb_middle_zones.json', maxScale: 8 },
  GB_SCOTLAND: { country: 'GB', name: '스코틀랜드', label: '스코틀랜드', count: 16, file: 'assets/gb_scotland_zones.json', maxScale: 8 },
  GB_WALESNI: { country: 'GB', name: '웨일스·북아일랜드', label: '웨일스·북아일랜드', count: 14, file: 'assets/gb_walesni_zones.json', maxScale: 8 },
  GB_UK: { country: 'GB', name: '영국 전국', label: '영국 전국', count: 70, file: 'assets/gb_uk_zones.json', maxScale: 20 },
  // WD — tools/build_*_maps.sh 로 생성
  WD_WORLD: { country: 'WD', name: '전세계', label: '전세계', count: 300, file: 'assets/w_world_zones.json', maxScale: 30 },
};
MAP_CONFIGS.KOREA.label = '전국'; MAP_CONFIGS.KOREA.count = 164;
MAP_CONFIGS.SEOUL.label = '서울'; MAP_CONFIGS.SEOUL.count = 25;
MAP_CONFIGS.GYEONGGI.label = '경기'; MAP_CONFIGS.GYEONGGI.count = 31;
MAP_CONFIGS.KOREA.guide = '전국 전선 작전: 시작할 거점 도시를 탭하세요!';
MAP_CONFIGS.SEOUL.guide = '서울특별시 작전: 시작할 자치구(예: 강남구, 마포구, 종로구 등)를 탭하세요!';

let currentMapBounds = { ...MAP_CONFIGS.KOREA.bounds };

let rawZones = [];
let backdropZones = []; // 플레이 불가 배경 지역 (예: 경기도 맵 안쪽의 서울·인천) - 빈 구멍 없이 지도를 채움
let rawLinks = [];
let flyingOrbs = [];
let particles = [];
let hoveredZone = null;
let lastSelectedPlayerZone = null; // Currently focused zone for tap burst
let hanRiverData = null;
let hanRiverPath = null;

function projectGeo(lng, lat, mapArea) {
  const normX = (lng - currentMapBounds.minLng) / (currentMapBounds.maxLng - currentMapBounds.minLng);
  const normY = 1 - (lat - currentMapBounds.minLat) / (currentMapBounds.maxLat - currentMapBounds.minLat);
  return {
    x: mapArea.x + normX * mapArea.w,
    y: mapArea.y + normY * mapArea.h
  };
}

function getMapHeaderHeight() {
  return Math.max(84, Math.min(viewH * 0.15, 150));
}

function getMapArea() {
  const w = viewW;
  const h = viewH;
  const targetRatio = MAP_CONFIGS[currentMapKey] ? MAP_CONFIGS[currentMapKey].aspectRatio : 0.82;
  // 위쪽에 맵 이름·진행 시간을 새길 머리 공간을 비워 두고, 지도는 그 아래에만 배치 (글자가 지역을 가리지 않게)
  const head = getMapHeaderHeight();
  let mapH = Math.min((h - head) * 0.94, 980);
  let mapW = mapH * targetRatio;

  if (mapW > w * 0.94) {
    mapW = w * 0.94;
    mapH = mapW / targetRatio;
  }

  const startX = (w - mapW) / 2;
  const startY = head + (h - head - mapH) / 2;
  return { x: startX, y: startY, w: mapW, h: mapH };
}

let cachedLinks = [];

function loadSelectedMap(mapKey) {
  currentMapKey = mapKey || 'KOREA';
  const cfg = MAP_CONFIGS[currentMapKey] || MAP_CONFIGS.KOREA;
  if (cfg.bounds) currentMapBounds = { ...cfg.bounds };

  // Reset in-game entities
  flyingOrbs = [];
  particles = [];
  focusRings = [];
  currentFocusZone = null;
  playerFocusList = [];
  currentEnemyFocusZone = null;
  playerMainZone = null;
  enemyMainZone = null;
  extraMains.clear();
  enemy2MainZone = null;
  resetAi2();
  playerSkillGcdUntil = 0;
  enemySkillGcdUntil = 0;
  skillUnlocked.player = false;
  skillUnlocked.enemy = false;
  currentPowerZone = null;
  currentEnemyPowerZone = null;
  specialSkillCooldown = 0;
  enemySpecialSkillCooldown = 0;
  focusFireCooldown = 0;
  enemyFocusFireCooldown = 0;
  gameElapsedTime = 0;
  resetCountryEvent();
  resetItems();
  enemyCommandTimer = ENEMY_COMMAND_SEC;
  lastEnemyCommandCheck = 0;
  lastTimerText = '';
  currentState = GAME_STATE.SELECT_START;
  startGuideShown = false;
  hanRiverData = null;
  hanRiverPath = null;


  fetch(cfg.file)
    .then(res => res.json())
    .then(data => {
      // 범위·화면 비율이 설정에 없으면 맵 JSON의 meta.bounds로 계산 (위도에 따른 경도 축소 반영)
      if (!cfg.bounds && data.meta && data.meta.bounds) {
        const b = data.meta.bounds;
        cfg.bounds = { ...b };
        cfg.aspectRatio = ((b.maxLng - b.minLng) * Math.cos(((b.minLat + b.maxLat) / 2) * Math.PI / 180)) / (b.maxLat - b.minLat);
      }
      currentMapBounds = { ...cfg.bounds };
      rawLinks = data.links;
      backdropZones = (data.backdrop || []).map(b => ({ ...b, path: null }));
      // 큰 물(강·호수): 지도에 물로 표시. 점령 불가
      hanRiverData = (data.water && data.water.length) ? data.water : null;
      rawZones = data.zones.map(z => ({
        ...z,
        maxOrbs: ZONE_MAX_HP, // 모든 지역 피 50 고정 (주요 도시 가중치 없음)
        cx: 0,
        cy: 0,
        owner: OWNER.NEUTRAL,
        orbs: 0,
        claimant: null,       // 중립 지역 줄다리기 게이지의 현재 우세 진영 (orbs = 게이지 크기)
        protectedUntil: 0,    // 점령 직후 보호 종료 시각 (게임 시간, 초)
        focusOptOut: false,   // 집중 포화 중 드래그 지정 공격으로 집중 포화에서 빠진 지역
        targetZones: [],
        isManualTarget: false,
        lastShotTime: 0,
        hasGivenItem: false,
        specialSkillCooldown: 0,
        neighbors: [],
        path: null,
        bbox: null
      }));

      const zoneMap = new Map();
      rawZones.forEach(z => zoneMap.set(z.id, z));
      cachedLinks = [];
      rawLinks.forEach(([id1, id2]) => {
        const z1 = zoneMap.get(id1);
        const z2 = zoneMap.get(id2);
        if (z1 && z2) {
          if (!z1.neighbors.includes(z2)) z1.neighbors.push(z2);
          if (!z2.neighbors.includes(z1)) z2.neighbors.push(z1);
          cachedLinks.push({ z1, z2 });
        }
      });
      // 물(강·호수)을 사이에 둔 연결: 공격은 가능하지만 완전점령 판정에서는 제외
      rawZones.forEach(z => { z.waterNeighbors = new Set(); });
      (data.waterLinks || []).forEach(([id1, id2]) => {
        const z1 = zoneMap.get(id1);
        const z2 = zoneMap.get(id2);
        if (z1 && z2) {
          z1.waterNeighbors.add(z2);
          z2.waterNeighbors.add(z1);
        }
      });

      // Reset camera view (맵 크기에 따라 최대 확대 배율 다름)
      view.scale = 1.0;
      view.offsetX = 0;
      view.offsetY = 0;
      view.maxScale = cfg.maxScale || 3.5;
      setGameSpeed(1);
      const s2 = document.getElementById('speed2-btn');
      if (s2) s2.classList.remove('on');
      pendingStartZone = null;

      updateZoneScreenPositions();
      updateRecordDisplays();
      const timerEl = document.getElementById('match-timer');
      if (timerEl) timerEl.innerText = '00:00';

      document.getElementById('status-guide').innerText = START_GUIDE_TEXT;
    })
    .catch(err => console.error('Failed to load map data:', err));
}

function updateZoneScreenPositions() {
  if (!rawZones.length) return;
  const mapArea = getMapArea();
  rawZones.forEach(z => {
    const pt = projectGeo(z.lng, z.lat, mapArea);
    z.cx = pt.x;
    z.cy = pt.y;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const path = new Path2D();
    z.screenPolys = z.polygons.map(poly => {
      const projected = poly.map(([lng, lat]) => {
        const p = projectGeo(lng, lat, mapArea);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        return p;
      });
      if (projected.length >= 3) {
        path.moveTo(projected[0].x, projected[0].y);
        for (let i = 1; i < projected.length; i++) {
          path.lineTo(projected[i].x, projected[i].y);
        }
        path.closePath();
      }
      return projected;
    });
    z.path = path;
    z.bbox = { minX, maxX, minY, maxY };
  });

  backdropZones.forEach(b => {
    const path = new Path2D();
    b.polygons.forEach(poly => {
      if (poly.length < 3) return;
      poly.forEach(([lng, lat], i) => {
        const p = projectGeo(lng, lat, mapArea);
        if (i === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y);
      });
      path.closePath();
    });
    b.path = path;
    const c = projectGeo(b.lng, b.lat, mapArea);
    b.cx = c.x;
    b.cy = c.y;
  });

  // 큰 물(강·호수) Path2D
  if (hanRiverData) {
    const rPath = new Path2D();
    hanRiverData.forEach(w => w.polygons.forEach(poly => {
      if (poly.length < 3) return;
      poly.forEach(([lng, lat], i) => {
        const pt = projectGeo(lng, lat, mapArea);
        if (i === 0) rPath.moveTo(pt.x, pt.y); else rPath.lineTo(pt.x, pt.y);
      });
      rPath.closePath();
    }));
    hanRiverPath = rPath;
  }
}

function screenToWorld(sx, sy) {
  const cx = viewW / 2;
  const cy = viewH / 2;
  return {
    x: (sx - cx - view.offsetX) / view.scale + cx,
    y: (sy - cy - view.offsetY) / view.scale + cy
  };
}

function isPointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function findZoneAtWorld(wx, wy) {
  const pt = { x: wx, y: wy };
  for (let i = 0; i < rawZones.length; i++) {
    const z = rawZones[i];
    if (z.bbox) {
      if (wx < z.bbox.minX || wx > z.bbox.maxX || wy < z.bbox.minY || wy > z.bbox.maxY) {
        continue;
      }
    }
    if (z.screenPolys) {
      for (let j = 0; j < z.screenPolys.length; j++) {
        if (isPointInPoly(pt, z.screenPolys[j])) return z;
      }
    }
  }
  return rawZones.find(z => Math.hypot(z.cx - wx, z.cy - wy) <= 16);
}

function areZonesConnected(zA, zB) {
  return zA.neighbors && zA.neighbors.includes(zB);
}

// O(1) 초고속 이웃 탐색 (수천만 번의 O(N^2) 탐색 제거)
function getNeighbors(zone) {
  return zone.neighbors || [];
}

// Exact Territory Status:
// 완전점령: 맞닿은 모든 이웃이 같은 진영. 단, 큰 물(강·호수) 건너 이웃은 세지 않음
// → 강가 지역은 강이 아군 지역처럼 방어선이 되어 완전점령이 쉬운 전략적 요충지
function isFullyConquered(zone) {
  if (zone.owner === OWNER.NEUTRAL) return false;
  const neighbors = zone.neighbors;
  if (!neighbors || neighbors.length === 0) return true;
  const water = zone.waterNeighbors;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (water && water.has(n)) continue;
    if (n.owner !== zone.owner) return false;
  }
  return true;
}

// Smart Auto-Target Selection:
function pickAutoTarget(zone) {
  // [자동 공격 규칙]: 모든 점령지역(메인 포함)은 맞닿은 지역만 무작위로 공격.
  // 메인 지역은 공격을 멈추지 않으므로, 자기와 맞닿은 목표가 없으면
  // 내 점령지역 전체와 맞닿아 있는 전선 지역 중 무작위 1곳을 원거리 공격.
  // 원거리 가능(완전점령 + 게이지 완충) 지역: 맞닿은 목표가 없으면 내 영토와 맞닿은 전선 지역(내 땅 아닌 곳) 중
  // 무작위 1곳을 자동으로 원거리 공격. 적 한가운데처럼 내 영토와 떨어진 곳은 지시(지정·집중 포화)할 때만
  if (EXPERIMENT_NO_SKILL) {
    if (canRangeAttack(zone)) return pickAdjacentTarget(zone) || pickMainZoneFrontierTarget(zone);
    return pickAdjacentTarget(zone);
  }
  if (canRangeAttack(zone)) {
    return pickAdjacentTarget(zone) || pickMainZoneFrontierTarget(zone);
  }
  if (isFullyConquered(zone)) return null;
  return pickAdjacentTarget(zone);
}

// [적 AI 전략 점수] 높을수록 우선 공격
// 1순위: 내(적) 완전점령 지역을 가장 빨리 만든다 → 완전점령까지 남은 이웃이 적은 적 지역의 빈 이웃일수록 높음
// 2순위: 상대(플레이어)의 완전점령 지역을 풀어 버린다 → 플레이어 완전점령 지역과 맞닿은 플레이어 지역
// 그 밖: 피가 적게 남은 곳, 중립 지역 소폭 가점
// 지금 생각 중인 AI 진영 (3파전에서는 적·적2가 번갈아 같은 AI 코드를 씀)
let AI = OWNER.ENEMY;
function aiTargetScore(t) {
  if (!t || t.owner === AI || t.isHidden) return -1;
  let score = 0;
  for (let i = 0; i < t.neighbors.length; i++) {
    const n = t.neighbors[i];
    if (n.owner === AI && !isFullyConquered(n)) {
      let missing = 0;
      for (let j = 0; j < n.neighbors.length; j++) {
        const m = n.neighbors[j];
        if (n.waterNeighbors && n.waterNeighbors.has(m)) continue;
        if (m.owner !== AI) missing++;
      }
      if (missing > 0) score += 4 / missing; // 1곳만 더 먹으면 완전점령 → 4점
    }
    if (t.owner !== OWNER.NEUTRAL && n.owner === t.owner && isFullyConquered(n) && !isMainZone(n)) score += 3;
  }
  // 빈 땅(중립) 확장이 기본: 방어 중인 플레이어 땅보다 우선. 플레이어 땅은 피가 많이 깎였을 때만 가점
  if (t.owner === OWNER.NEUTRAL) score += 1.2 + (t.claimant === AI ? 0.6 : 0);
  else score += (1 - t.orbs / Math.max(1, t.maxOrbs)) * 1.2;
  return score;
}

// 전략 점수에 비례한 확률로 목표 선택. 이미 여러 적 지역이 쏘고 있는 곳은 점수를 깎아
// 한 곳에 몰려 과잉 사격하지 않고 전선 전체로 고르게 퍼지게 함
function pickBestAiTarget(list) {
  if (list.length === 0) return null;
  const crowd = new Map();
  rawZones.forEach(z => { if (z.owner === AI) z.targetZones.forEach(t => crowd.set(t, (crowd.get(t) || 0) + 1)); });
  const w = list.map(t => {
    const sc = Math.max(0.05, aiTargetScore(t) - 0.6 * (crowd.get(t) || 0));
    return sc * sc;
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

function pickAdjacentTarget(zone) {

  const neighbors = zone.neighbors;
  if (!neighbors || neighbors.length === 0) return null;

  // 맞닿아 있는 적군·중립 지역 중 무작위 1곳 (적 철벽 기지 제외)
  const targets = neighbors.filter(n => isAutoAttackable(n, zone.owner, zone));
  if (targets.length === 0) return null;
  return targets[Math.floor(Math.random() * targets.length)];
}

// 초기 맵 로드 (기본: 전국 전선)
// 초기 맵은 파일 끝의 홈 화면 초기화에서 다음 스테이지로 로드

// Troop/Orb Class
class FlyingOrb {
  constructor(sourceZone, targetZone, owner, power = 1) {
    this.sourceZone = sourceZone;
    this.targetZone = targetZone;
    this.owner = owner;
    this.power = power;
    // 완전점령 지역(메인 제외)에서 쏜 구슬은 더 진한 색으로 표시
    this.fromFull = sourceZone.owner !== OWNER.NEUTRAL && isFullyConquered(sourceZone) && !isMainZone(sourceZone);

    this.x = sourceZone.cx;
    this.y = sourceZone.cy;
    
    const dx = targetZone.cx - sourceZone.cx;
    const dy = targetZone.cy - sourceZone.cy;
    this.dist = Math.hypot(dx, dy);
    this.speed = (this.owner === OWNER.PLAYER) ? baseOrbSpeed : ENEMY_CONFIG.enemyOrbSpeed;
    // [원거리] 맞닿지 않은 곳으로 가는 구슬은 2배 느림
    // [아이템 속사] 원거리 느려짐 없음, 오히려 1.5배
    if (isRangedShot(sourceZone, targetZone)) this.speed = (hasItem(owner, 'rapid') && isRivalMarked(targetZone, owner)) ? this.speed * 1.5 : this.speed / RANGED_SLOW;
    this.progress = 0;
    this.curve = (Math.random() - 0.5) * 16;
    this.isDead = false;
  }

  update() {
    if (this.isDead) return true;
    this.progress += (this.speed * gameSpeed) / this.dist;
    if (this.progress >= 1) {
      this.arrive();
      return true;
    }

    const t = this.progress;
    const directX = this.sourceZone.cx + (this.targetZone.cx - this.sourceZone.cx) * t;
    const directY = this.sourceZone.cy + (this.targetZone.cy - this.sourceZone.cy) * t;

    const nx = -(this.targetZone.cy - this.sourceZone.cy) / this.dist;
    const ny = (this.targetZone.cx - this.sourceZone.cx) / this.dist;
    const arc = Math.sin(t * Math.PI) * this.curve;

    this.x = directX + nx * arc;
    this.y = directY + ny * arc;

    return false;
  }

  arrive() {
    const t = this.targetZone, own = this.owner;
    const fighters = o => o === OWNER.PLAYER || o === OWNER.ENEMY;
    const rivalHit = fighters(own) && fighters(t.owner) && t.owner !== own;
    // [아이템] 카드는 중립 땅에는 효과 없음 (상대 색이 조금이라도 있으면 상대 땅으로 침)
    // 공격 쪽: 파워샷(상대 땅 2배) → 이 공격의 '공격력'
    let attack = this.power;
    if (hasItem(own, 'power') && isRivalMarked(t, own)) attack *= 2;
    if (rivalHit) {
      // [아이템 반사 방패] 30% 확률로 쏜 곳으로 그대로 되돌림 (되돌린 구슬은 다시 반사되지 않음)
      if (!this.reflected && this.sourceZone && hasItem(t.owner, 'reflect') && Math.random() < ITEM_CHANCE) {
        const back = new FlyingOrb(t, this.sourceZone, t.owner, this.power);
        back.reflected = true;
        flyingOrbs.push(back);
        return;
      }
      // [아이템 흡수] 30% 확률로 막고, 내 피를 상대 공격력의 2배만큼 채움
      if (hasItem(t.owner, 'absorb') && Math.random() < ITEM_CHANCE) {
        t.orbs = Math.min(t.maxOrbs, t.orbs + attack * 2);
        return;
      }
    }
    // [아이템 크리티컬] 상대 땅에 30% 확률로 3배 (반사된 구슬도 해당)
    if (hasItem(own, 'crit') && isRivalMarked(t, own) && Math.random() < ITEM_CHANCE) {
      attack *= 3;
      flashZone(t, '#f59e0b');
    }
    // 맞는 쪽: 철벽(상대 구슬 50%)
    const power = itemHitPower(attack, own, t);
    const wasRival = t.owner !== OWNER.NEUTRAL && t.owner !== own;
    applyOrbHit(t, own, power, this.sourceZone);
    // [아이템 관통탄] 맞닿은 공격·원거리 공격 모두: 맞힌 상대 지역에서 옆의 상대 지역으로 튕겨 나감
    // 첫 타격 → 두 번째(원래 공격력의 50%) → 세 번째(30%)까지. 이미 맞힌 지역으로는 튕기지 않음
    // (도착할 때마다 파워샷·크리티컬·철벽 등은 그대로 계산)
    const step = this.pierceStep || 0;
    if (wasRival && step < PIERCE_RATIOS.length && hasItem(own, 'pierce')) {
      const hit = this.pierceHit || [this.sourceZone];
      const next = t.neighbors.filter(n => !hit.includes(n) && n !== t && n.owner !== OWNER.NEUTRAL && n.owner !== own);
      if (next.length) {
        const n2 = next[Math.floor(Math.random() * next.length)];
        const basePower = this.pierceBase || this.power;
        const bounce = new FlyingOrb(t, n2, own, basePower * PIERCE_RATIOS[step]);
        bounce.pierceStep = step + 1;
        bounce.pierceBase = basePower;
        bounce.pierceHit = hit.concat([t]);
        flyingOrbs.push(bounce);
      }
    }
  }

  draw(ctx) {
    // Mini Metro flat passenger token style: Solid colored circle with clean white ring
    ctx.beginPath();
    const r = this.power > 1 ? 4.5 : 3.2;
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = (this.owner === OWNER.PLAYER) ? '#2563eb' : '#dc2626';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

// 2회 단일 Draw Call로 전체 비행 구슬을 렌더링하는 초경량 일괄 렌더러 (미니 메트로 스타일)
function drawFlyingOrbs(ctx) {
  if (flyingOrbs.length === 0) return;
  // 확대해도 구슬이 지역을 덮지 않도록 배율에 따라 크기 보정 (화면상 크기 증가를 완만하게)
  const k = 1 / Math.sqrt(view.scale);

  // 진영·완전점령 여부별로 한 번에 그림 (아군 파랑 / 아군 완전점령 진한 파랑 / 적 빨강 / 적 완전점령 진한 빨강)
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2 * k;
  const passes = [
    [OWNER.PLAYER, false, '#2563eb'], [OWNER.PLAYER, true, '#1e3a8a'],
    [OWNER.ENEMY, false, '#dc2626'], [OWNER.ENEMY, true, '#7f1d1d'],
    [OWNER.ENEMY2, false, '#8b5cf6'], [OWNER.ENEMY2, true, '#4c1d95'],
    [REBEL, false, '#7c3aed']
  ];
  const fog = isFogActive(); // [영국 안개] 적 구슬은 막 출발할 때 방향만 살짝 보임
  passes.forEach(([owner, full, color]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    let count = 0;
    for (let i = 0; i < flyingOrbs.length; i++) {
      const orb = flyingOrbs[i];
      if (orb.isDead || orb.owner !== owner || !!orb.fromFull !== full) continue;
      if (fog && owner === OWNER.ENEMY && orb.progress > FOG_VISIBLE_PROGRESS) continue;
      const r = (orb.isCannon ? 9.6 : orb.power > 1 ? 4.5 : 3.2) * k;
      ctx.moveTo(orb.x + r, orb.y);
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      count++;
    }
    if (count > 0) { ctx.fill(); ctx.stroke(); }
  });
  ctx.restore();
}

// 집중포화 완충/점령 시 날아가던 구슬이 일제히 소멸할 때 연출되는 초경량 이펙트 시스템 (리소스 최소화)

function createDisintegrateParticle(x, y, color = '#38bdf8') {
  if (particles.length >= 15) return; // 최대 15개로 리소스 엄격 제한
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 2.0,
    vy: (Math.random() - 0.5) * 2.0,
    alpha: 0.9,
    size: 2.0,
    color
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * gameSpeed;
    p.y += p.vy * gameSpeed;
    p.alpha -= 0.05 * gameSpeed;
    if (p.alpha <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  if (particles.length === 0) return;
  ctx.save();
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function updateFocusRings() {
  for (let i = focusRings.length - 1; i >= 0; i--) {
    const ring = focusRings[i];
    ring.radius += 2.5 * gameSpeed;
    ring.alpha -= 0.05 * gameSpeed;
    if (ring.alpha <= 0) focusRings.splice(i, 1);
  }
}

function drawFocusRings(ctx) {
  if (focusRings.length === 0) return;
  ctx.save();
  ctx.lineWidth = 2.0;
  focusRings.forEach(ring => {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = Math.max(0, ring.alpha);
    ctx.stroke();
  });
  ctx.restore();
}

function createHitParticles() {}
function createFocusFireParticles() {}
function createImmuneShieldParticles() {}

// -------------------------------------------------------------
// COMBAT & REAL-TIME RELAY RE-TARGETING
// -------------------------------------------------------------
function applyOrbHit(zone, hitOwner, power, sourceZone) {
  // [프랑스 혁명] 반란군(중립 지역) 구슬: 점령 지역의 피를 깎고, 0 이 되면 중립으로
  if (hitOwner === REBEL) {
    if (zone.owner === OWNER.NEUTRAL || gameElapsedTime < zone.protectedUntil) return;
    zone.orbs -= power;
    if (zone.orbs <= 0) neutralizeZone(zone);
    return;
  }
  if (zone.owner === hitOwner) {
    // If friendly zone, reinforce defense
    zone.orbs = Math.min(zone.maxOrbs, zone.orbs + power);
    if (zone.orbs >= zone.maxOrbs && playerFocusList.includes(zone)) removePlayerFocus(zone);
    // If it's already full & friendly, source zone should look for next conquest target!
    if (zone.orbs >= zone.maxOrbs && sourceZone && !sourceZone.isManualTarget) {
      reRouteZone(sourceZone);
    }
  } else if (zone.owner === OWNER.NEUTRAL) {
    // [줄다리기 게이지]: 중립 지역은 우세 진영(claimant)과 게이지(orbs)를 가짐.
    // 같은 편 구슬은 게이지를 올리고, 상대 구슬은 깎음. 0을 넘어가면 우세 진영이 뒤집힘.
    // 게이지가 50에 닿은 진영이 점령.
    if (!zone.claimant || zone.orbs <= 0) {
      zone.claimant = hitOwner;
      zone.orbs = 0;
    }
    if (zone.claimant === hitOwner) {
      zone.orbs += power;
    } else {
      zone.orbs -= power;
      if (zone.orbs < 0) {
        zone.claimant = hitOwner;
        zone.orbs = -zone.orbs;
      }
    }
    if (zone.orbs >= zone.maxOrbs) {
      conquerZone(zone, hitOwner, sourceZone);
    }
  } else {
    // Enemy contest: Troops fight and die 1:1
    // [규칙]: 완전 점령된 지역()은 일반 구슬 공격 절대 불가(면역)!
    if (!canAttackTarget(sourceZone && sourceZone.owner === hitOwner ? sourceZone : null, zone)) {
      createImmuneShieldParticles(zone.cx, zone.cy);
      if (sourceZone && sourceZone.owner === hitOwner) {
        reRouteZone(sourceZone);
      }
      return;
    }

    // [점령 직후 보호]: 막 점령된 지역은 잠시 피해를 받지 않음 (주인이 1초에 여러 번 바뀌는 혼전 방지)
    if (gameElapsedTime < zone.protectedUntil) {
      return;
    }

    zone.orbs -= power;
    if (zone.orbs <= 0) {
      zone.owner = OWNER.NEUTRAL;
      extraMains.delete(zone);
      zone.maxOrbs = ZONE_MAX_HP; // 메인이었다면 중립이 되면서 일반 지역(피 50)으로
      zone.claimant = hitOwner;
      zone.targetZones = [];
      zone.isManualTarget = false;
      zone.orbs = Math.abs(zone.orbs);
      if (zone.orbs >= zone.maxOrbs) {
        conquerZone(zone, hitOwner, sourceZone);
      } else {
        checkWinConditions();
      }
    }
  }
}

const CAPTURE_PROTECT_SEC = 1.5; // 점령 직후 보호 시간 (게임 시간 기준, 배속 연동)

// [공중 충돌]: 두 지역 사이를 서로 마주 보고 날아가는 적대 구슬은 중간에서 만나면 함께 소멸.
// 같은 두 지역 사이 구슬끼리만 비교하므로 전체 비용은 O(구슬 수).
function resolveOrbCollisions() {
  if (flyingOrbs.length < 2) return;
  const lanes = new Map();
  for (let i = 0; i < flyingOrbs.length; i++) {
    const orb = flyingOrbs[i];
    if (orb.isDead) continue;
    const a = orb.sourceZone.id, b = orb.targetZone.id;
    const key = a < b ? a + '|' + b : b + '|' + a;
    let lane = lanes.get(key);
    if (!lane) {
      lane = { fwd: [], back: [] };
      lanes.set(key, lane);
    }
    (a < b ? lane.fwd : lane.back).push(orb);
  }

  lanes.forEach(lane => {
    if (lane.fwd.length === 0 || lane.back.length === 0) return;
    // 가장 앞서 나간 구슬끼리 먼저 만남
    lane.fwd.sort((o1, o2) => o2.progress - o1.progress);
    lane.back.sort((o1, o2) => o2.progress - o1.progress);
    let i = 0, j = 0;
    while (i < lane.fwd.length && j < lane.back.length) {
      const f = lane.fwd[i], k = lane.back[j];
      if (f.owner === k.owner) {
        // 같은 편끼리는 충돌하지 않음: 더 뒤처진 쪽을 건너뜀
        if (f.progress < k.progress) i++; else j++;
        continue;
      }
      if (f.progress + k.progress < 1) break; // 아직 만나지 않음
      const hit = Math.min(f.power, k.power);
      f.power -= hit;
      k.power -= hit;
      createDisintegrateParticle((f.x + k.x) / 2, (f.y + k.y) / 2, '#a855f7');
      if (f.power <= 0) { f.isDead = true; i++; }
      if (k.power <= 0) { k.isDead = true; j++; }
    }
  });
}

let totalPlayerConquests = 0;
let nextConquestThreshold = 3; // 3 -> 6 -> 12 -> 24 -> 48 -> 96... 배수로 증가!
let isInstantConquerMode = false;

function conquerZone(conqueredZone, newOwner, conqueredBySource) {
  extraMains.delete(conqueredZone); // 빼앗긴 추가 본진은 본진 지위를 잃음
  conqueredZone.owner = newOwner;
  conqueredZone.maxOrbs = ZONE_MAX_HP; // 함락된 메인은 메인 지위를 잃고 일반 지역(피 50)이 됨
  conqueredZone.orbs = conqueredZone.maxOrbs; // Full garrison upon capture
  conqueredZone.claimant = null;
  conqueredZone.protectedUntil = gameElapsedTime + CAPTURE_PROTECT_SEC;
  flashZone(conqueredZone, newOwner === OWNER.PLAYER ? ZONE_COLORS.playerStroke : newOwner === OWNER.ENEMY2 ? ZONE_COLORS.enemy2Stroke : ZONE_COLORS.enemyStroke);

  // 1. Conquered Zone immediately starts advancing towards an adjacent front!
  const newTarget = pickAutoTarget(conqueredZone);
  conqueredZone.targetZones = newTarget ? [newTarget] : [];
  conqueredZone.isManualTarget = false;

  // 2. Source Zone redirect
  if (conqueredBySource && conqueredBySource.owner === newOwner) {
    reRouteZone(conqueredBySource);
  }

  // Also check all other friendly zones that were attacking this conqueredZone
  rawZones.forEach(z => {
    if (z.owner === newOwner && z.targetZones.includes(conqueredZone)) {
      reRouteZone(z);
    }
  });

  // [사용자 요구사항]: 집중포화로 인해 그 지역이 점령되면 날아가던 구슬들이 없어질 때 그 효과(파티클 & 충격파)를 주면서 소멸!
  const wasPlayerFocus = playerFocusList.includes(conqueredZone);
  const wasEnemyFocus = currentEnemyFocusZone && currentEnemyFocusZone.id === conqueredZone.id;
  if (wasPlayerFocus || wasEnemyFocus) {
    // [집중 포화 점령]: 점령되는 순간 그 지역으로 날아가던 모든 구슬은 소멸 (별도 그래픽 효과 없음)
    for (let j = 0; j < flyingOrbs.length; j++) {
      const orb = flyingOrbs[j];
      if (orb.targetZone && orb.targetZone.id === conqueredZone.id) orb.isDead = true;
    }
    if (wasPlayerFocus) removePlayerFocus(conqueredZone);
  }

  // Player gets item reward at doubling intervals (3 -> 6 -> 12 -> 24...)
  if (ENABLE_ITEMS) {
    if (newOwner === OWNER.PLAYER) {
      totalPlayerConquests++;
      if (totalPlayerConquests >= nextConquestThreshold) {
        triggerItemSelection(totalPlayerConquests, nextConquestThreshold);
        nextConquestThreshold *= 2;
      }
    } else if (newOwner === OWNER.ENEMY) {
      // 적군 AI도 점령마다 지속적으로 적극적인 아이템 획득 및 사용!
      totalEnemyConquests++;
      if (totalEnemyConquests >= nextEnemyConquestThreshold) {
        triggerEnemyItemSelection();
        nextEnemyConquestThreshold += 3;
      }
    }
  }

  if (currentEnemyFocusZone && currentEnemyFocusZone.id === conqueredZone.id) {
    currentEnemyFocusZone = null;
    enemyFocusReticleTimer = 0;
  }

  // If power zone became fully conquered or changed, transfer it immediately!
  updatePowerZone();
  updateEnemyPowerZone();

  checkWinConditions();
}

let hasPlayerUsedPower = false;
let hasEnemyUsedPower = false;

function triggerItemSelection(currentCount, threshold) {
  const modal = document.getElementById('item-modal');
  const cardGrid = document.getElementById('item-card-grid');
  if (modal && cardGrid) {
    const titleEl = document.getElementById('item-modal-title');
    if (titleEl) {
      titleEl.innerText = `누적 ${threshold}개 구역 점령 달성! 지원 기술 선택 (전투 진행 중!)`;
    }

    let cardsHtml = '';
    // A는 첫 1회만 제공 (아직 선택 안 한 경우)
    if (!hasPlayerUsedPower) {
      cardsHtml += `
        <div class="item-card" onclick="chooseBuff('A')">
          <div class="item-icon"></div>
          <div class="item-title">파워 구슬 (+2)</div>
          <div class="item-desc">점령지 1곳을 <b>파워 거점(노란색)</b>으로 지정! (1회 한정)</div>
        </div>
      `;
    }

    // 두 번째부터는 B(즉시 점령)과 C(생성 속도 가속) 반복!
    cardsHtml += `
      <div class="item-card" onclick="chooseBuff('INSTANT')">
        <div class="item-icon"></div>
        <div class="item-title">즉시 점령</div>
        <div class="item-desc">원하는 목표 구역 1곳을 <b>즉시 아군 영토</b>로 점령!</div>
      </div>
      <div class="item-card" onclick="chooseBuff('C')">
        <div class="item-icon"></div>
        <div class="item-title">생성 속도 가속</div>
        <div class="item-desc">구슬 생성 주기 <b>0.1초 단축</b> (현재: ${(playerBuffs.interval/1000).toFixed(1)}s)</div>
      </div>
    `;

    cardGrid.innerHTML = cardsHtml;
    // Adjust grid columns if 2 cards
    cardGrid.style.gridTemplateColumns = !hasPlayerUsedPower ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)';
    modal.style.display = 'block';
  }
}

// Assign or transfer Power Zone (must be an active conquered zone, not fully conquered)
function updatePowerZone() {
  if (!ENABLE_ITEMS || playerBuffs.powerLevel <= 0) {
    currentPowerZone = null;
    return;
  }

  if (!currentPowerZone || currentPowerZone.owner !== OWNER.PLAYER || isFullyConquered(currentPowerZone)) {
    const activePlayerZones = rawZones.filter(z => z.owner === OWNER.PLAYER && !isFullyConquered(z));
    if (activePlayerZones.length > 0) {
      currentPowerZone = activePlayerZones[Math.floor(Math.random() * activePlayerZones.length)];
      document.getElementById('status-guide').innerText = `[${currentPowerZone.name}] 지역에 파워 구슬 거점 이전!`;
    } else {
      currentPowerZone = null;
    }
  }
}

function chooseBuff(itemCode) {
  const hud = document.getElementById('buff-hud');
  if (itemCode === 'A') {
    hasPlayerUsedPower = true;
    playerBuffs.powerLevel = 1;
    updatePowerZone();
    hud.innerHTML = `<div class="buff-badge">파워 거점 (+2)</div>` + hud.innerHTML;
  } else if (itemCode === 'C') {
    playerBuffs.interval = Math.max(100, playerBuffs.interval - 100);
    const secStr = (playerBuffs.interval / 1000).toFixed(1);
    hud.innerHTML = `<div class="buff-badge">생성 속도 (${secStr}s)</div>` + hud.innerHTML;
  } else if (itemCode === 'INSTANT') {
    isInstantConquerMode = true;
    document.getElementById('status-guide').innerText = '[즉시 점령]: 즉시 점령하고 싶은 도시를 클릭하세요!';
  }

  const itemModal = document.getElementById('item-modal');
  if (itemModal) itemModal.style.display = 'none';
}

// Redirect zone to another frontier (preventing wasted troops!)
function reRouteZone(zone) {
  if (zone.isManualTarget) {
    // [사용자 요구사항]: 내가 적의 구역을 집중포화/수동지정으로 공격하다가 적의 지역이 완전점령지역으로 바뀌면
    // 즉시 그쪽 공격을 멈추고 인접지역 공격으로 자동 전환!
    const targetIsFullyConqueredEnemy = zone.targetZones.some(t => !canAttackTarget(zone, t));
    const allFriendlyFull = zone.targetZones.every(t => t.owner === zone.owner && t.orbs >= t.maxOrbs);
    if (!targetIsFullyConqueredEnemy && !allFriendlyFull) return;
  }

  const nextTarget = pickAutoTarget(zone);
  if (nextTarget) {
    zone.targetZones = [nextTarget];
    zone.isManualTarget = false;
  } else {
    zone.targetZones = [];
    zone.isManualTarget = false;
  }
}

function beginGameAtZone(zone) {
  zone.owner = OWNER.PLAYER;
  zone.maxOrbs = MAIN_ZONE_HP; zone.orbs = MAIN_ZONE_HP; // 내 메인 지역 피 400
  lastSelectedPlayerZone = zone;
  playerMainZone = zone;

  // Assign initial auto target for starter
  const initTarget = pickAutoTarget(zone);
  if (initTarget) zone.zones = [initTarget];

  // Assign AI Enemy starting base (1 base)
  const baseCount = ENEMY_CONFIG.startingEnemyBases;

  const enemyCandidates = rawZones.filter(z => z.id !== zone.id && !z.isHidden);
  // 이웃이 1곳뿐인 외딴 섬(추자도·울릉도 등)에서는 적이 시작하지 않도록 제외 (후보가 남을 때만)
  const wellConnected = enemyCandidates.filter(z => z.neighbors.length >= 2);
  if (wellConnected.length > 0) enemyCandidates.splice(0, enemyCandidates.length, ...wellConnected);
  enemyCandidates.sort((a, b) => Math.hypot(b.cx - zone.cx, b.cy - zone.cy) - Math.hypot(a.cx - zone.cx, a.cy - zone.cy));

  const chosenEnemies = [];
  for (let k = 0; k < baseCount; k++) {
    const idx = Math.min(enemyCandidates.length - 1, k * 5);
    const eZone = enemyCandidates[idx];
    if (eZone && !chosenEnemies.includes(eZone)) {
      eZone.owner = OWNER.ENEMY;
      eZone.maxOrbs = MAIN_ZONE_HP; eZone.orbs = MAIN_ZONE_HP; // 적 메인 지역 피 400
      const aiTarget = pickAutoTarget(eZone);
      if (aiTarget) eZone.zones = [aiTarget];
      chosenEnemies.push(eZone);
      if (!enemyMainZone) enemyMainZone = eZone;
    }
  }

  // [이탈리아 '최고의 지휘관'] 나·적 모두 무작위 빈 땅에 본진 1개씩 더 → 총 2개 (전세계는 2개씩 더 → 총 3개)
  // 이미 점령된 땅과 맞닿지 않은 곳. 추가 본진의 피는 원래 본진의 절반
  const extraCount = currentCountryKey() === 'IT' ? 1 : currentCountryKey() === 'WD' ? 2 : 0;
  for (let e = 0; e < extraCount; e++) {
    [OWNER.PLAYER, OWNER.ENEMY].forEach(owner => {
      const free = rawZones.filter(z => z.owner === OWNER.NEUTRAL && !z.isHidden && z.neighbors.length >= 2 &&
        !z.neighbors.some(n => n.owner !== OWNER.NEUTRAL));
      const z = free[Math.floor(Math.random() * free.length)];
      if (!z) return;
      z.owner = owner;
      z.mainOwner = owner;
      z.maxOrbs = EXTRA_MAIN_HP; z.orbs = EXTRA_MAIN_HP;
      extraMains.add(z);
      const t = pickAutoTarget(z);
      z.targetZones = t ? [t] : [];
    });
  }

  // [3파전] 두 번째 적 본진: 나·첫 적 본진 양쪽에서 가장 먼 곳
  if (isThreeWay() && enemyMainZone) {
    const d = z => Math.min(Math.hypot(z.cx - zone.cx, z.cy - zone.cy), Math.hypot(z.cx - enemyMainZone.cx, z.cy - enemyMainZone.cy));
    const e2 = enemyCandidates.filter(z => z.owner === OWNER.NEUTRAL).sort((a, b) => d(b) - d(a))[0];
    if (e2) {
      e2.owner = OWNER.ENEMY2;
      e2.maxOrbs = MAIN_ZONE_HP; e2.orbs = MAIN_ZONE_HP;
      const t2 = pickAutoTarget(e2);
      if (t2) e2.zones = [t2];
      enemy2MainZone = e2;
    }
  }

  // Configure enemy buffs based on standard config
  enemyBuffs.interval = ENEMY_CONFIG.enemyInterval;
  enemyBuffs.powerLevel = 0;
  gameElapsedTime = 0;
  lastTimerText = '';

  currentState = GAME_STATE.PLAYING;
  document.getElementById('status-guide').innerText = `${zone.name} 기지 확보! 작전 개시! (적 전면 섬멸 작전)`;
  if (itemMode) { nextItemAt = 0; openItemPick(); }
}

const START_GUIDE_TEXT = '본진을 선택하세요';
let pendingStartZone = null; // 본진 후보 (확인 팝업에서 확인하면 시작)
let pointerDownPos = { x: 0, y: 0 };
const TAP_MOVE_TOLERANCE = 8; // 이 거리(px) 이하로 움직이면 탭으로 판정

function startPan(coords) {
  view.isPanning = true;
  view.panStartX = coords.clientX - view.offsetX;
  view.panStartY = coords.clientY - view.offsetY;
}

// 본진 선택: 지역을 탭하면 '○○ / 본진으로 지정하시겠습니까?' 확인 팝업
function handleStartSelectTap(zone) {
  if (!zone || zone.isHidden) return;
  pendingStartZone = zone;
  flashZone(zone, ZONE_COLORS.main);
  document.getElementById('confirm-base-name').textContent = zone.name;
  document.getElementById('confirm-base').style.display = 'flex';
}
function confirmBaseSelection() {
  document.getElementById('confirm-base').style.display = 'none';
  const zone = pendingStartZone;
  pendingStartZone = null;
  if (zone && currentState === GAME_STATE.SELECT_START) beginGameAtZone(zone);
}
function cancelBaseSelection() {
  document.getElementById('confirm-base').style.display = 'none';
  pendingStartZone = null;
}
window.confirmBaseSelection = confirmBaseSelection;
window.cancelBaseSelection = cancelBaseSelection;

// -------------------------------------------------------------
// 유료 기능 (인앱 구매). 지금은 앱스토어 결제 연결 전이라 결제 화면만 표시
// -------------------------------------------------------------
const PRODUCTS = {
  speed2: { title: '배속', text: '게임을 2배·4배 빠르게 진행해요.\n한 번 구매하면 모든 맵에서 계속 쓸 수 있어요.' }
};
const OWNED_KEY = 'tapwar_owned_products';
let purchaseProductId = null;

function isOwned(id) {
  try { return (JSON.parse(localStorage.getItem(OWNED_KEY) || '[]')).includes(id); } catch (e) { return false; }
}
function openPurchase(id) {
  const p = PRODUCTS[id];
  if (!p) return;
  purchaseProductId = id;
  document.getElementById('purchase-title').textContent = p.title;
  document.getElementById('purchase-text').textContent = p.text;
  // TODO(IAP): StoreKit에서 받은 현지 가격 표시
  document.getElementById('purchase-price').textContent = '';
  const buy = document.getElementById('purchase-buy');
  buy.textContent = '구매하기';
  buy.disabled = false;
  document.getElementById('purchase').style.display = 'flex';
}
function closePurchase() {
  document.getElementById('purchase').style.display = 'none';
  purchaseProductId = null;
}
function buyProduct() {
  // TODO(IAP): StoreKit 결제 → 성공 시 OWNED_KEY에 저장(구매 복원 시에도 동일)
  const buy = document.getElementById('purchase-buy');
  buy.textContent = '앱스토어 결제 연결 후 구매할 수 있어요';
  buy.disabled = true;
}
window.closePurchase = closePurchase;
window.buyProduct = buyProduct;

// 게임 중 ×2 버튼: 구매했으면 1배속↔2배속 전환, 아니면 결제 화면
// 배속(유료 상품 하나): 구매하면 버튼을 누를 때마다 ×1 → ×2 → ×4 → ×1
// [테스트용] DEV_TEST_SPEED 가 true 면 구매 없이도 사용 가능. 정식 출시 전 false 로
const DEV_TEST_SPEED = true;

// -------------------------------------------------------------
// 진동 (iOS 앱: Capacitor Haptics, 웹: navigator.vibrate 지원 기기만)
//   short: 짧게 한 번 / strong: 나라 컨셉 발동 / long: 살짝 길게(패배) / triple: 짧게 세 번(승리)
// -------------------------------------------------------------
const HapticsPlugin = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
  window.Capacitor.registerPlugin) ? window.Capacitor.registerPlugin('Haptics') : null;
function haptic(kind) {
  try {
    if (HapticsPlugin) {
      if (kind === 'long') HapticsPlugin.vibrate({ duration: 400 });
      else if (kind === 'triple') [0, 160, 320].forEach(t => setTimeout(() => HapticsPlugin.impact({ style: 'MEDIUM' }), t));
      else HapticsPlugin.impact({ style: kind === 'strong' ? 'HEAVY' : 'MEDIUM' });
      return;
    }
    if (navigator.vibrate) {
      navigator.vibrate({ short: 30, strong: 60, long: 400, triple: [40, 120, 40, 120, 40] }[kind] || 30);
    }
  } catch (e) {}
}

function onSpeed2Click() {
  haptic('short');
  const btn = document.getElementById('speed2-btn');
  if (!DEV_TEST_SPEED && !isOwned('speed2')) {
    openPurchase('speed2');
    return;
  }
  const next = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 4 : 1;
  setGameSpeed(next);
  btn.textContent = `×${next}`; // 현재 배속 표시
  btn.classList.toggle('on', next > 1);
}
window.onSpeed2Click = onSpeed2Click;
if (DEV_TEST_SPEED || isOwned('speed2')) { const b = document.getElementById('speed2-btn'); if (b) b.textContent = `×${gameSpeed}`; }

// 상단 플레이 시간·본진 안내·×2 버튼 표시 상태
let lastHudKey = '';
function updateHudVisibility() {
  const modalOpen = document.getElementById('start-modal').style.display !== 'none';
  const confirmOpen = document.getElementById('confirm-base').style.display !== 'none';
  const playing = currentState === GAME_STATE.PLAYING;
  const choosing = currentState === GAME_STATE.SELECT_START && !modalOpen && !introAnim && !confirmOpen;
  const key = `${playing}|${choosing}`;
  if (key === lastHudKey) return;
  lastHudKey = key;
  document.getElementById('top-timer').hidden = true; // 진행 시간은 지도 위 맵 이름 아래에 새김
  document.getElementById('speed2-btn').hidden = !playing;
  // 시작 안내는 상단 띠 대신, 처음 한 번 화면 가운데에 글자만 1초 떴다 사라짐
  document.getElementById('status-guide').hidden = true;
  if (choosing && !startGuideShown) {
    startGuideShown = true;
    flashCenterText(START_GUIDE_TEXT);
  }
}

let startGuideShown = false;
function flashCenterText(text) {
  const el = document.getElementById('center-toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // 애니메이션 다시 시작
  el.classList.add('show');
}

let dragSourceZone = null;
let worldMousePos = { x: 0, y: 0 };
let isDragging = false;
let lastTapTime = 0;
const DOUBLE_TAP_MS = 450; // 같은 지역을 이 시간 안에 두 번 누르면 더블탭(집중포화)
let lastTapZoneId = null;

// 더블클릭 / 더블탭 시 인접 아군 점령지가 해당 구역을 일제히 집중 포격! (쿨타임 없이 무제한 즉시 발동 가능)
function handleZoneDoubleClick(targetZone) {
  if (!targetZone || currentState !== GAME_STATE.PLAYING) return;

  // [방어 지원]: 내 점령지역에 집중 포격하면 아군 구슬이 들어가 피를 회복(최대 50)
  if (targetZone.owner === OWNER.PLAYER && targetZone.orbs >= targetZone.maxOrbs) {
    document.getElementById('status-guide').innerText = `[${targetZone.name}]은(는) 이미 피가 가득 찼습니다!`;
    return;
  }

  // [면역 규칙]: 완전 점령된 적 기지는 일반 공격 절대 불가!
  // [실험] 적 완전점령 지역은 내 완전점령 지역만 사격에 참여
  const targetIsFortress = targetZone.owner === OWNER.ENEMY && isFullyConquered(targetZone);
  if (targetIsFortress && !EXPERIMENT_NO_SKILL) {
    document.getElementById('status-guide').innerText = `[${targetZone.name}]은(는) 완전 점령된 철벽 기지입니다!`;
    return;
  }

  // 점령 중인 아군의 전선 거점 탐색 (완전점령지역은 사격 제외! 목표가 아군 거점이면 자기 자신 제외)
  const allPlayerZones = rawZones.filter(z => z.owner === OWNER.PLAYER && z.id !== targetZone.id &&
    (!isFullyConquered(z) || isUnleashed(z)) && canAttackTarget(z, targetZone) &&
    (canRangeAttack(z) || z.neighbors.includes(targetZone))); // 원거리 불가 지역은 맞닿은 경우만 참여

  if (allPlayerZones.length === 0) {
    document.getElementById('status-guide').innerText = `출격 가능한 전선 아군 점령지가 없습니다! (완전점령지역은 집중포화 제외)`;
    return;
  }

  // [규칙]: 집중포화는 한 곳만. 다른 곳을 더블탭하면 집중포화가 그쪽으로 옮겨감.
  // 이전 목표를 쏘던 지역은 풀어 주고(새 목표에 닿으면 아래에서 다시 합류, 아니면 평소 자동 공격)
  const oldFocus = playerFocusList.slice();
  playerFocusList = [];
  syncFocus();
  rawZones.forEach(z => {
    if (z.owner === OWNER.PLAYER && z.isManualTarget && z.targetZones.some(t => oldFocus.includes(t))) {
      z.isManualTarget = false;
      const t = pickAutoTarget(z);
      z.targetZones = t ? [t] : [];
    }
  });

  // 새 집중 포화: 이전에 드래그로 빠졌던 지역도 모두 다시 참여
  rawZones.forEach(z => { z.focusOptOut = false; });
  addPlayerFocus(targetZone);
  haptic('short'); // 집중포화 시전
  focusFireCooldown = 0; // 쿨타임 없음!

  // 전선의 모든 아군 기지(완전점령 제외, 메인 포함)가 목표를 고정 타겟으로 지정하고
  // 평소 생산 주기대로 점령(또는 피 회복)될 때까지 계속 사격.
  // 즉시 추가 발사는 없음: 더블탭을 반복해도 구슬이 더 나가지 않음.
  allPlayerZones.forEach(pZone => {
    const f = focusForZone(pZone);
    if (!f) return;
    pZone.isManualTarget = true;
    pZone.targetZones = [f];
  });
  // 집중 포화 지정 순간: 목표 지역 테두리 번쩍 (내 지역 보급이면 초록)
  flashZone(targetZone, targetZone.owner === OWNER.PLAYER ? ZONE_COLORS.playerFullCharged : ZONE_COLORS.playerStroke);

  document.getElementById('status-guide').innerText = targetZone.owner === OWNER.PLAYER
    ? `[${targetZone.name}] 방어 지원! 아군 ${allPlayerZones.length}개 거점에서 피가 찰 때까지 보급!`
    : `[${targetZone.name}] 집중 포화! 아군 ${allPlayerZones.length}개 거점에서 점령할 때까지 일제 사격!`;
}

function getEventCoords(e) {
  const rect = canvas.getBoundingClientRect();
  let clientX = e.clientX;
  let clientY = e.clientY;

  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  }

  return {
    sx: clientX - rect.left,
    sy: clientY - rect.top,
    clientX: clientX,
    clientY: clientY
  };
}

function onPointerDown(e) {
  const coords = getEventCoords(e);
  if (introAnim) { skipIntro(); return; } // 시작 연출 중 탭하면 건너뜀

  if (e.button === 2) {
    view.isPanning = true;
    view.panStartX = coords.clientX - view.offsetX;
    view.panStartY = coords.clientY - view.offsetY;
    return;
  }

  worldMousePos = screenToWorld(coords.sx, coords.sy);
  const targetZone = findZoneAtWorld(worldMousePos.x, worldMousePos.y);
  pointerDownPos = { x: coords.clientX, y: coords.clientY };


  // Instant Conquer mode activated from Item Reward!
  if (isInstantConquerMode && targetZone) {
    if (targetZone.owner !== OWNER.PLAYER) {
      isInstantConquerMode = false;
      conquerZone(targetZone, OWNER.PLAYER, null);
      createHitParticles(targetZone.cx, targetZone.cy, OWNER.PLAYER);
      document.getElementById('status-guide').innerText = `[${targetZone.name}] 즉시 점령 완료! 아군 영토로 편입되었습니다.`;
      return;
    }
  }

  // [시작 구역 선택]: 맵을 둘러볼 수 있도록 드래그는 화면 이동, 탭 1번 = 선택, 같은 곳 다시 탭 = 시작
  // (탭/드래그 구분은 손을 뗄 때 판정)
  if (currentState === GAME_STATE.SELECT_START) {
    startPan(coords);
    return;
  }

  if (currentState !== GAME_STATE.PLAYING) return;

  // 지역 더블클릭 / 더블탭 판정 (집중 포격 발동!)
  const now = performance.now();
  // 피가 가득 찬 아군 지역은 더블탭(방어 지원)할 일이 없으므로 탭으로 처리 (특수 기술 연속 사용 가능)
  const isFullFriendly = targetZone && targetZone.owner === OWNER.PLAYER &&
    (targetZone.orbs >= targetZone.maxOrbs || isFullyConquered(targetZone));
  if (targetZone && !isFullFriendly && targetZone.id === lastTapZoneId && (now - lastTapTime) < DOUBLE_TAP_MS) {
    handleZoneDoubleClick(targetZone);
    lastTapTime = 0;
    lastTapZoneId = null;
    isDragging = false;
    dragSourceZone = null;
    return;
  }
  lastTapTime = now;
  lastTapZoneId = targetZone ? targetZone.id : null;

  if (targetZone && targetZone.owner === OWNER.PLAYER) {
    dragSourceZone = targetZone;
    lastSelectedPlayerZone = targetZone;
    isDragging = true;
  } else {
    // [화면 이동]: 내 지역이 아닌 곳(적·중립 지역, 맵 바깥)에서 시작한 한 손가락/마우스 드래그
    startPan(coords);
  }
}

function onPointerMove(e) {
  const coords = getEventCoords(e);
  if (view.isPanning) {
    view.offsetX = coords.clientX - view.panStartX;
    view.offsetY = coords.clientY - view.panStartY;
    return;
  }

  worldMousePos = screenToWorld(coords.sx, coords.sy);
  hoveredZone = findZoneAtWorld(worldMousePos.x, worldMousePos.y);
}

function onPointerUp(e) {
  if (view.isPanning) {
    view.isPanning = false;
    if (currentState === GAME_STATE.SELECT_START) {
      const c = getEventCoords(e);
      const moved = Math.hypot(c.clientX - pointerDownPos.x, c.clientY - pointerDownPos.y);
      if (moved <= TAP_MOVE_TOLERANCE) {
        const w = screenToWorld(c.sx, c.sy);
        handleStartSelectTap(findZoneAtWorld(w.x, w.y));
      }
    }
    return;
  }

  if (isDragging && dragSourceZone) {
    const endZone = findZoneAtWorld(worldMousePos.x, worldMousePos.y);

    // [특수 기술]: 드래그 없이 아군 완전점령 지역을 탭하면 그 지역의 충전 1발 사용
    if (!EXPERIMENT_NO_SKILL && endZone === dragSourceZone && isFullyConquered(endZone)) {
      const guide = document.getElementById('status-guide');
      if (!skillUnlocked[OWNER.PLAYER]) {
        const n = rawZones.filter(z => z.owner === OWNER.PLAYER && isFullyConquered(z)).length;
        guide.innerText = `특수 기술은 완전점령 지역 ${SKILL_UNLOCK_FULL_COUNT}곳을 처음 확보하면 열립니다 (${n}/${SKILL_UNLOCK_FULL_COUNT})`;
        flashZone(endZone, SKILL_DENIED_FLASH);
      } else if (endZone.chargeState === 'ready' && gameElapsedTime < playerSkillGcdUntil) {
        guide.innerText = `특수 기술 글로벌 쿨타임 (${Math.ceil(playerSkillGcdUntil - gameElapsedTime)}초 남음)`;
        flashZone(endZone, SKILL_DENIED_FLASH);
      } else if (endZone.chargeState === 'ready') {
        useSpecialSkill(endZone);
      } else if (endZone.chargeState === 'charging') {
        guide.innerText = `[${endZone.name}] 특수 기술 충전 중 (${Math.max(1, Math.ceil(SKILL_CHARGE_SEC - endZone.chargeTime))}초 남음)`;
        flashZone(endZone, SKILL_DENIED_FLASH);
      } else if (endZone.chargeState === 'spent') {
        guide.innerText = `[${endZone.name}] 특수 기술 사용 완료. 이제 메인처럼 공격해요.`;
      }
    }

    // [완전점령 지역 공격 불가]: 완전점령 지역(메인 제외)은 특수 기술 외 어떤 공격도 할 수 없음 → 지정 공격 무시
    const sourceCanAttack = !isFullyConquered(dragSourceZone) || isUnleashed(dragSourceZone);

    // [지정 공격 규칙]: 모든 지역(적군·중립·아군, 거리 무관) 지정 가능
    // 아군 지역 지정 = 방어 지원(피 회복). 피가 가득 차면 자동 공격으로 복귀
    if (sourceCanAttack && endZone && endZone.id !== dragSourceZone.id) {
      // 완전 점령된 적 기지는 일반 공격 불가!
      if (!canRangeAttack(dragSourceZone) && !dragSourceZone.neighbors.includes(endZone)) {
        // 원거리 지정은 완전점령 지역만 가능: 맞닿지 않은 곳은 무시
        flashZone(dragSourceZone, SKILL_DENIED_FLASH);
      } else if (!canAttackTarget(dragSourceZone, endZone)) {
        document.getElementById('status-guide').innerText = `[${endZone.name}]은(는) 완전 점령된 철벽 기지입니다! [즉시 점령] 아이템으로만 공략 가능합니다.`;
        createImmuneShieldParticles(endZone.cx, endZone.cy);
      } else {
        dragSourceZone.isManualTarget = true;
        dragSourceZone.targetZones = [endZone];
        // [집중 포화 중 지정 공격]: 지정하면 이 지역은 집중 포화에서 빠지고 지정한 곳만 공격
        // (지정한 곳이 다른 집중포화 구역이어도 마찬가지. 예전엔 가장 최근 집중포화 구역으로 끌려가 지정이 무시됨)
        dragSourceZone.focusOptOut = playerFocusList.length > 0;
      }
    }
  }
  isDragging = false;
  dragSourceZone = null;
}

// Mouse Wheel Zoom
// 화면의 한 점(sx, sy: 캔버스 좌표)을 고정한 채 배율 변경
function zoomAt(newScale, sx, sy, worldAnchor) {
  const s2 = Math.min(view.maxScale, Math.max(view.minScale, newScale));
  const w = worldAnchor || screenToWorld(sx, sy);
  const cx = viewW / 2, cy = viewH / 2;
  view.scale = s2;
  view.offsetX = sx - cx - (w.x - cx) * s2;
  view.offsetY = sy - cy - (w.y - cy) * s2;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
  const c = getEventCoords(e);
  zoomAt(view.scale * zoomFactor, c.sx, c.sy); // 마우스 위치를 중심으로 확대/축소
}, { passive: false });

canvas.addEventListener('contextmenu', e => e.preventDefault());
// 터치 후 브라우저가 자동 생성하는 호환 마우스 이벤트(mousedown/mouseup)는 무시
// (무시하지 않으면 탭 1회가 touchstart + mousedown 2번으로 처리되어 더블탭 집중 포격이 오발동)
let lastTouchTime = 0;
const TOUCH_MOUSE_GUARD_MS = 800;
function isEmulatedMouse() {
  return performance.now() - lastTouchTime < TOUCH_MOUSE_GUARD_MS;
}
canvas.addEventListener('mousedown', (e) => { if (!isEmulatedMouse()) onPointerDown(e); });
window.addEventListener('mousemove', (e) => { if (!isEmulatedMouse()) onPointerMove(e); });
window.addEventListener('mouseup', (e) => { if (!isEmulatedMouse()) onPointerUp(e); });

// Mobile Multi-Touch (Pinch Zoom & Pan) Variables
let initialPinchDist = null;
let initialScale = 1.0;
let initialPanMidX = 0;
let initialPanMidY = 0;
let pinchWorldAnchor = null;

canvas.addEventListener('touchstart', (e) => {
  lastTouchTime = performance.now();
  if (e.touches.length === 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    initialScale = view.scale;
    initialPanMidX = (t1.clientX + t2.clientX) / 2 - view.offsetX;
    initialPanMidY = (t1.clientY + t2.clientY) / 2 - view.offsetY;
    // 두 손가락 가운데 지점의 월드 좌표를 기억해 그 지점을 중심으로 확대
    const r = canvas.getBoundingClientRect();
    pinchWorldAnchor = screenToWorld((t1.clientX + t2.clientX) / 2 - r.left, (t1.clientY + t2.clientY) / 2 - r.top);
    view.isPanning = false;
    isDragging = false;
    dragSourceZone = null;
    e.preventDefault();
  } else if (e.touches.length === 1) {
    initialPinchDist = null;
    onPointerDown(e);
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && initialPinchDist !== null) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const scaleFactor = currentDist / initialPinchDist;
    const r = canvas.getBoundingClientRect();
    const curMidX = (t1.clientX + t2.clientX) / 2 - r.left;
    const curMidY = (t1.clientY + t2.clientY) / 2 - r.top;
    zoomAt(initialScale * scaleFactor, curMidX, curMidY, pinchWorldAnchor);
    e.preventDefault();
  } else if (e.touches.length === 1) {
    onPointerMove(e);
  }
}, { passive: false });

window.addEventListener('touchend', (e) => {
  lastTouchTime = performance.now();
  if (e.touches.length < 2) {
    initialPinchDist = null;
  }
  if (e.touches.length === 0) {
    onPointerUp(e);
  }
});

let selectedModalMapKey = 'KOREA';

function selectModalMap(mapKey) {
  selectedModalMapKey = mapKey;
  Object.keys(MAP_CONFIGS).forEach(key => {
    const card = document.getElementById(`modal-map-${key.toLowerCase()}`);
    if (card) {
      if (key === mapKey) {
        card.classList.add('active');
        card.style.borderColor = '#0f172a';
        card.style.background = '#ffffff';
        card.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.12)';
      } else {
        card.classList.remove('active');
        card.style.borderColor = '#e2e8f0';
        card.style.background = '#f8fafc';
        card.style.boxShadow = 'none';
      }
    }
  });
  centerStageCard(mapKey);
  // 모달에서 카드 클릭 시 즉시 맵을 미리 로드하여 보여줌
  loadSelectedMap(mapKey);
  updateMapButtonsUI(mapKey);
}
window.selectModalMap = selectModalMap;

function updateMapButtonsUI(mapKey) {
  Object.keys(MAP_CONFIGS).forEach(key => {
    const btn = document.getElementById(`map-btn-${key.toLowerCase()}`);
    if (btn) btn.classList.toggle('active', mapKey === key);
  });
}
window.updateMapButtonsUI = updateMapButtonsUI;

function switchBattlefield(mapKey) {
  selectedModalMapKey = mapKey;
  loadSelectedMap(mapKey);
  updateMapButtonsUI(mapKey);
  const guideEl = document.getElementById('status-guide');
  if (guideEl) guideEl.innerText = START_GUIDE_TEXT;
}
window.switchBattlefield = switchBattlefield;

function onStartBtnClick() {
  const modal = document.getElementById('start-modal');
  if (modal) modal.style.display = 'none';
  startIntroZoom(selectedModalMapKey);
  if (currentMapKey !== selectedModalMapKey) {
    switchBattlefield(selectedModalMapKey);
  } else {
    const guideEl = document.getElementById('status-guide');
    if (guideEl) guideEl.innerText = START_GUIDE_TEXT;
  }
}
window.onStartBtnClick = onStartBtnClick;

// 시작 버튼/전장 카드 클릭은 index.html의 onclick 속성으로만 처리 (중복 리스너 등록 시 클릭 1회가 2번 실행됨)

// Rapid Tap Burst from player's advancing bases
function triggerPlayerTapBurst() {
  let routed = false;
  rawZones.forEach(src => {
    if (src.owner === OWNER.PLAYER && src.targetZones.length > 0) {
      src.targetZones.forEach(tgt => {
        flyingOrbs.push(new FlyingOrb(src, tgt, OWNER.PLAYER, playerBuffs.power));
      });
      routed = true;
    }
  });
}

// Enemy AI Buffs & Power Zone
const enemyBuffs = {
  powerLevel: 0,
  interval: 1000 // 적군도 최초 1.0초마다 생성!
};
let totalEnemyConquests = 0;
let nextEnemyConquestThreshold = 3;

function updateEnemyPowerZone() {
  if (!ENABLE_ITEMS || enemyBuffs.powerLevel <= 0) {
    currentEnemyPowerZone = null;
    return;
  }
  if (!currentEnemyPowerZone || currentEnemyPowerZone.owner !== OWNER.ENEMY || isFullyConquered(currentEnemyPowerZone)) {
    const activeEnemyZones = rawZones.filter(z => z.owner === OWNER.ENEMY && !isFullyConquered(z));
    if (activeEnemyZones.length > 0) {
      currentEnemyPowerZone = activeEnemyZones[Math.floor(Math.random() * activeEnemyZones.length)];
    } else {
      currentEnemyPowerZone = null;
    }
  }
}

// AI chooses item freely when reaching conquest threshold (3, 6, 9...)
function triggerEnemyItemSelection() {
  let choices = ['INSTANT', 'C'];
  if (!hasEnemyUsedPower) {
    choices.push('A');
  }

  const choice = choices[Math.floor(Math.random() * choices.length)];

  if (choice === 'A') {
    hasEnemyUsedPower = true;
    enemyBuffs.powerLevel = 1;
    updateEnemyPowerZone();
    document.getElementById('status-guide').innerText = `[적군 아이템 발동]: 적군이 파워 거점(+2 파워 구슬)을 확보했습니다!`;
  } else if (choice === 'C') {
    enemyBuffs.interval = Math.max(100, enemyBuffs.interval - 100);
    const secStr = (enemyBuffs.interval / 1000).toFixed(1);
    document.getElementById('status-guide').innerText = `[적군 아이템 발동]: 적군 구슬 생성 속도 단축 (${secStr}s)!`;
  } else if (choice === 'INSTANT') {
    // Enemy instantly claims an unconquered or player-held frontier zone!
    const candidates = rawZones.filter(z => z.owner !== OWNER.ENEMY && !z.isHidden);
    if (candidates.length > 0) {
      const enemyFrontlines = rawZones.filter(z => z.owner === OWNER.ENEMY && !isFullyConquered(z));
      if (enemyFrontlines.length > 0) {
        const ref = enemyFrontlines[Math.floor(Math.random() * enemyFrontlines.length)];
        candidates.sort((a, b) => Math.hypot(a.cx - ref.cx, a.cy - ref.cy) - Math.hypot(b.cx - ref.cx, b.cy - ref.cy));
      }
      const target = candidates[0];
      conquerZone(target, OWNER.ENEMY, null);
      createHitParticles(target.cx, target.cy, OWNER.ENEMY);
      document.getElementById('status-guide').innerText = `[적군 즉시 점령 발동!]: 적군이 [${target.name}]을(를) 강탈했습니다!`;
    }
  }
}

// 적군 AI 집중포화 (아군 전선 거점을 향해 일제 사격)
// [적 지정 공격] 사람이 손으로 하듯 한 번에 한 지역만, 정해진 간격으로
const ENEMY_COMMAND_SEC = 1.5;
// [난이도] 적 생산 속도 배율 (1 = 플레이어와 같음). 방치하면 적이 아슬아슬하게 이기도록 맞춘 값
const ENEMY_PRODUCTION = 1.0; // 맵별 보정은 MAP_CONFIGS[].enemyStrength (곱함)
let enemyCommandTimer = ENEMY_COMMAND_SEC;
let lastEnemyCommandCheck = 0;
function issueEnemyCommand() {
  if (currentState !== GAME_STATE.PLAYING) return;
  let bestZone = null, bestTarget = null, bestScore = 1;
  rawZones.forEach(z => {
    if (z.owner !== AI || z.isManualTarget) return;
    if (isFullyConquered(z) && !isUnleashed(z)) return;
    const opts = canRangeAttack(z)
      ? rawZones.filter(t => t.owner !== AI && rawZones.some(e => e.owner === AI && e.neighbors.includes(t)))
      : z.neighbors;
    opts.forEach(t => {
      if (t.owner === AI || !canAttackTarget(z, t)) return;
      const sc = aiTargetScore(t) + Math.random() * 0.2;
      const cur = z.targetZones[0] ? aiTargetScore(z.targetZones[0]) : 0;
      if (sc - cur > bestScore) { bestScore = sc - cur; bestZone = z; bestTarget = t; }
    });
  });
  if (!bestZone) return;
  bestZone.isManualTarget = true;
  bestZone.targetZones = [bestTarget];
}

function triggerEnemyFocusFire() {
  if (currentState !== GAME_STATE.PLAYING) return;
  if (enemyFocusFireCooldown > 0) return;

  // 완전점령지역이 아닌 전선 교전 중인 적 거점들
  const activeEnemyZones = rawZones.filter(z => z.owner === AI && (!isFullyConquered(z) || isUnleashed(z)));
  if (activeEnemyZones.length === 0) return;

  // 공격 가능한 후보: 적 지역과 맞닿은 곳 + 원거리 완충 지역이 닿는 곳. 전략 점수가 가장 높은 곳을 집중 포화
  const rangers = activeEnemyZones.filter(e => canRangeAttack(e));
  const candSet = new Set();
  activeEnemyZones.forEach(eZone => eZone.neighbors.forEach(n => {
    if (n.owner !== AI && canAttackTarget(eZone, n)) candSet.add(n);
  }));
  rangers.forEach(r => rawZones.forEach(n => {
    if (n.owner !== AI && !n.isHidden && canAttackTarget(r, n) &&
        rawZones.some(e => e.owner === AI && e.neighbors.includes(n))) candSet.add(n);
  }));
  const candidates = [...candSet];
  if (candidates.length === 0) return;
  const target = pickBestAiTarget(candidates);
  if (!target || aiTargetScore(target) < 1) return; // 전략적 가치가 낮으면 집중 포화 아낌

  // 이전 집중 포화 목표를 쏘던 기지는 풀어 새 목표에 합류
  if (currentEnemyFocusZone && currentEnemyFocusZone !== target) {
    rawZones.forEach(z => {
      if (z.owner === AI && z.isManualTarget && z.targetZones.includes(currentEnemyFocusZone)) z.isManualTarget = false;
    });
  }
  enemyFocusFireCooldown = ENEMY_CONFIG.enemyFocusCooldown;
  currentEnemyFocusZone = target;
  enemyFocusReticleTimer = 3.5;

  // 해당 타겟을 향해 출격 가능한 적 전선 기지들
  // 맞닿은 기지 전부 + 원거리 완충 기지는 가까운 3곳만 (전 병력을 한 곳에 묶어 다른 전선을 비우지 않게)
  const adjBases = activeEnemyZones.filter(e => canAttackTarget(e, target) && e.neighbors.includes(target));
  const rangeBases = activeEnemyZones
    .filter(e => !adjBases.includes(e) && canRangeAttack(e) && canAttackTarget(e, target))
    .sort((a, b) => Math.hypot(a.cx - target.cx, a.cy - target.cy) - Math.hypot(b.cx - target.cx, b.cy - target.cy))
    .slice(0, 3);
  const firingBases = adjBases.concat(rangeBases);
  if (firingBases.length === 0) return;

  // 적군도 동일 규칙: 즉시 추가 발사 없이 점령할 때까지 고정 사격
  firingBases.forEach(eZone => {
    eZone.isManualTarget = true;
    eZone.targetZones = [target];
  });
  flashZone(target, AI === OWNER.ENEMY2 ? ZONE_COLORS.enemy2Stroke : ZONE_COLORS.enemyStroke); // 적 집중 포화 목표 번쩍

  document.getElementById('status-guide').innerText = `[${AI === OWNER.ENEMY2 ? '보라 적군' : '적군'} 집중포화 경보!]: 적 기지 ${firingBases.length}곳에서 [${target.name}]에 일제 사격을 개시했습니다!`;
}

// AI Expansion Engine
let lastAiDecisionTime = 0;
// 적2 AI 상태 (적1 은 전역 변수 그대로, 적2 차례에만 바꿔 끼움)
let ai2 = null;
function resetAi2() { ai2 = { focus: null, cd: 0, reticle: 0, cmd: ENEMY_COMMAND_SEC, lastCheck: 0, lastRun: 0 }; }
resetAi2();
function updateAI(currentTime) {
  const decisionInterval = ENEMY_CONFIG.enemyDecisionInterval / gameSpeed;
  if (currentTime - lastAiDecisionTime < decisionInterval) return;
  lastAiDecisionTime = currentTime;
  AI = OWNER.ENEMY;
  updateAIFor(currentTime);
  if (!isThreeWay() || !rawZones.some(z => z.owner === OWNER.ENEMY2)) return;
  const dt = ai2.lastRun ? (currentTime - ai2.lastRun) / 1000 * gameSpeed : 0;
  ai2.lastRun = currentTime;
  ai2.cd = Math.max(0, ai2.cd - dt);
  const saved = [currentEnemyFocusZone, enemyFocusFireCooldown, enemyFocusReticleTimer, enemyCommandTimer, lastEnemyCommandCheck];
  [currentEnemyFocusZone, enemyFocusFireCooldown, enemyFocusReticleTimer, enemyCommandTimer, lastEnemyCommandCheck] = [ai2.focus, ai2.cd, 0, ai2.cmd, ai2.lastCheck];
  AI = OWNER.ENEMY2;
  try { updateAIFor(currentTime); } finally {
    [ai2.focus, ai2.cd, ai2.cmd, ai2.lastCheck] = [currentEnemyFocusZone, enemyFocusFireCooldown, enemyCommandTimer, lastEnemyCommandCheck];
    [currentEnemyFocusZone, enemyFocusFireCooldown, enemyFocusReticleTimer, enemyCommandTimer, lastEnemyCommandCheck] = saved;
    AI = OWNER.ENEMY;
  }
}
function updateAIFor(currentTime) {

  // 1. 적군 특수 기술 사용 검토 (충전된 완전점령 지역이 있을 때)
  if (AI === OWNER.ENEMY) useEnemySpecialSkill();

  // 2. 적군 집중포화 사용 검토 (쿨타임 완료 시 아군 거점에 일제 사격)
  triggerEnemyFocusFire();

  // 2-1. 지정 공격: 사람처럼 일정 간격(ENEMY_COMMAND_SEC)마다 한 지역에만 지시
  enemyCommandTimer -= (currentTime - (lastEnemyCommandCheck || currentTime)) / 1000 * gameSpeed;
  lastEnemyCommandCheck = currentTime;
  if (enemyCommandTimer <= 0) {
    enemyCommandTimer = ENEMY_COMMAND_SEC;
    issueEnemyCommand();
  }

  // 3. 일반 전선 전진 및 재배치
  const enemyZones = rawZones.filter(z => z.owner === AI);
  enemyZones.forEach(eZone => {
    // Never stop or get stuck if NOT fully conquered!
    if (isFullyConquered(eZone) && !isUnleashed(eZone)) {
      eZone.targetZones = [];
      return;
    }

    if (eZone.targetZones.length === 0 || eZone.targetZones.every(t => t.owner === AI)) {
      const tgt = pickAutoTarget(eZone);
      if (tgt) eZone.targetZones = [tgt];
    }
  });
}

// 아군 집중 포화 참여 대상인지: 전선 기지(메인은 완전점령이어도 참여), 드래그로 빠진 지역 제외
function shouldJoinPlayerFocus(zone) {
  return !!focusForZone(zone);
}

// Continuous automatic troop generation (adjusted by gameSpeed 1x, 2x, 4x!)
function updateOrbSpawners(currentTime) {
  // 완전점령지역 보유 수에 따른 생성 간격 가속 보너스 계산 (1개당 -0.1초 단축, 최소 간격 0.2초=200ms 한계)
  let playerFullCount = 0;
  let enemyFullCount = 0;
  for (let i = 0; i < rawZones.length; i++) {
    const z = rawZones[i];
    if (isFullyConquered(z)) {
      if (z.owner === OWNER.PLAYER) playerFullCount++;
      else if (z.owner === OWNER.ENEMY) enemyFullCount++;
    }
  }

  // 생산 간격은 완전점령 수와 관계없이 고정 (완전점령 보너스 없음)
  const playerBaseInterval = playerBuffs.interval;
  const mapCfg = MAP_CONFIGS[currentMapKey] || {};
  const enemyBaseInterval = enemyBuffs.interval / (ENEMY_PRODUCTION * (mapCfg.enemyStrength || 1));

  rawZones.forEach(zone => {
    if (zone.owner === OWNER.NEUTRAL) return;

    // [집중 포화 유지]: 집중 포화가 진행 중이면 참여 대상 기지(메인 포함, 도중에 새로 점령한 전선 포함)는
    // 드래그로 따로 지정하지 않은 한 계속 집중 포화 목표를 사격
    const myFocus = focusForZone(zone);
    if (myFocus && !(zone.targetZones.length === 1 && zone.targetZones[0] === myFocus)) {
      zone.isManualTarget = true;
      zone.targetZones = [myFocus];
    }

    // '완전 점령' Check: 수동 지정(전국 집중포화 등)이 아닌 경우에만 잉여 생산 중단!
    // [완전점령 지역]: 메인 외에는 지정 공격·집중 포화 여부와 관계없이 구슬을 쏘지 않음
    if (isFullyConquered(zone) && !isUnleashed(zone)) {
      zone.targetZones = [];
      zone.isManualTarget = false;
      return;
    }

    // If active targets are already captured by same owner, or target became a fully conquered immune zone, re-route immediately!
    const targetBecameImmune = zone.targetZones.some(t => !canAttackTarget(zone, t));
    const allTargetsCaptured = zone.targetZones.length > 0 && zone.targetZones.every(t => t.owner === zone.owner);
    if (targetBecameImmune || allTargetsCaptured || zone.targetZones.length === 0) {
      // 집중포화 타겟이었을 경우 집중포화 타겟팅 해제 및 후속 구슬 소멸
      reRouteZone(zone);
      if (zone.targetZones.length === 0) return;
    }

    const baseInterval = zone.owner === OWNER.PLAYER ? playerBaseInterval : enemyBaseInterval;
    // [중국 사막] 모래폭풍에 걸린 지역은 공격 속도 50% (간격 2배)
    const slow = zone.slowUntil && gameElapsedTime < zone.slowUntil ? 2 : 1;
    // [원거리] 맞닿지 않은 곳을 쏘는 지역은 발사 간격 2배
    const ranged = zone.targetZones.some(t => isRangedShot(zone, t));
    // 속사는 구슬 속도만, 발사 간격은 그대로
    const rangedMult = ranged ? RANGED_INTERVAL_MULT : 1;
    const supply = hasItem(zone.owner, 'supply') ? 1 / 1.3 : 1; // [아이템 보급] 내 생산 30% 빠르게
    const interval = baseInterval * rangedMult * supply * slow / gameSpeed; // 2배속, 4배속 시 생성 간격 단축!

    if (currentTime - zone.lastShotTime >= interval) {
      zone.lastShotTime = currentTime;
      
      let power = 1;
      if (EXPERIMENT_NO_SKILL || isUnleashed(zone)) {
        power = getZonePower(zone);
      } else if (zone.owner === OWNER.PLAYER) {
        const isPowerZone = (currentPowerZone && currentPowerZone.id === zone.id);
        power = isPowerZone ? (1 + playerBuffs.powerLevel * 2) : 1;
      } else {
        const isEnemyPowerZone = (currentEnemyPowerZone && currentEnemyPowerZone.id === zone.id);
        power = isEnemyPowerZone ? (1 + enemyBuffs.powerLevel * 2) : 1;
      }

      // [미국 자본주의] 호황 지역은 구슬 공격력 5
      if (zone.boostUntil && gameElapsedTime < zone.boostUntil) power = Math.max(power, COUNTRY_EVENT_CFG.US.power);
      zone.targetZones.forEach(target => {
        flyingOrbs.push(new FlyingOrb(zone, target, zone.owner, power));
      });
    }
  });
}


// -------------------------------------------------------------
// 나라별 컨셉 이벤트 (게임 시간 기준, 나·적 구분 없이 무작위 점령 지역에 적용, 메인 지역 제외)
//   JP 지진: 주기마다 무작위 지역들의 피 50% 감소 + 화면 흔들림
//   CN 사막: 1분마다 무작위 지역들의 공격 속도 10초 동안 50%
//   US 자본주의: 1분마다 무작위 지역들의 구슬 공격력 10초 동안 5
// -------------------------------------------------------------
const COUNTRY_EVENT_CFG = {
  JP: { every: 45, share: 0.15, min: 2, toast: '지진!', color: '#92400e' },
  CN: { every: 60, share: 0.2, min: 2, duration: 10, toast: '모래폭풍', color: '#d97706' },
  US: { every: 60, share: 0.15, min: 2, duration: 10, power: 5, toast: '자본주의 호황', color: '#eab308' },
  FR: { every: 60, duration: 10, fireEvery: 1.0, toast: '혁명!', color: '#7c3aed' },
  ES: { every: 60, power: 20, toast: '대항해시대 포격!', color: '#b45309' },
  DE: { every: 60, tankSec: 3.5, width: 0.07, toast: '전차 돌파!', color: '#3f6212' }
};
const REBEL = 'rebel';
const FOG_VISIBLE_PROGRESS = 0.12;
let revoltUntil = 0, revoltNextShot = 0;
let tankAnim = null; // { x0, y0, x1, y1, t0(게임 시간), dur, hit:Set }

function currentCountryKey() {
  return (MAP_CONFIGS[currentMapKey] || {}).country || 'KR';
}

// 지역을 중립으로 되돌림 (전차·반란)
function neutralizeZone(z) {
  if (isMainZone(z)) return;
  z.owner = OWNER.NEUTRAL;
  z.maxOrbs = ZONE_MAX_HP;
  z.orbs = 0;
  z.claimant = null;
  z.targetZones = [];
  z.isManualTarget = false;
  z.fortressHp = false;
  z.chargeState = null;
  z.unleashed = false;
  if (typeof removePlayerFocus === 'function' && playerFocusList.includes(z)) removePlayerFocus(z);
  rawZones.forEach(o => { if (o.owner !== OWNER.NEUTRAL && o.targetZones.includes(z) && !o.isManualTarget) reRouteZone(o); });
}

// 혁명 중: 점령 지역과 맞닿은 중립 지역이 주기마다 주변 점령 지역 하나를 공격
function updateRevolt() {
  if (gameElapsedTime >= revoltUntil || gameElapsedTime < revoltNextShot) return;
  revoltNextShot = gameElapsedTime + COUNTRY_EVENT_CFG.FR.fireEvery;
  rawZones.forEach(z => {
    if (z.owner !== OWNER.NEUTRAL || z.isHidden) return;
    const tg = z.neighbors.filter(n => n.owner !== OWNER.NEUTRAL);
    if (tg.length === 0) return;
    flyingOrbs.push(new FlyingOrb(z, tg[Math.floor(Math.random() * tg.length)], REBEL, 1));
  });
}

// 전차: 맵을 가로질러 지나가며 경로 근처 지역을 중립으로
function startTank() {
  const area = getMapArea();
  const ang = Math.random() * Math.PI;
  const cx = area.x + area.w / 2, cy = area.y + area.h / 2, L = Math.hypot(area.w, area.h) / 2;
  const off = (Math.random() - 0.5) * 0.6;
  const ox = -Math.sin(ang) * off * L, oy = Math.cos(ang) * off * L;
  tankAnim = { x0: cx - Math.cos(ang) * L + ox, y0: cy - Math.sin(ang) * L + oy, x1: cx + Math.cos(ang) * L + ox, y1: cy + Math.sin(ang) * L + oy,
               t0: gameElapsedTime, dur: COUNTRY_EVENT_CFG.DE.tankSec, hit: new Set(), w: Math.min(area.w, area.h) * COUNTRY_EVENT_CFG.DE.width };
}
function updateTank() {
  if (!tankAnim) return;
  const k = (gameElapsedTime - tankAnim.t0) / tankAnim.dur;
  if (k >= 1) { tankAnim = null; return; }
  const x = tankAnim.x0 + (tankAnim.x1 - tankAnim.x0) * k, y = tankAnim.y0 + (tankAnim.y1 - tankAnim.y0) * k;
  rawZones.forEach(z => {
    if (tankAnim.hit.has(z) || z.owner === OWNER.NEUTRAL) return;
    if (Math.hypot(z.cx - x, z.cy - y) < tankAnim.w) {
      tankAnim.hit.add(z);
      if (!isMainZone(z)) { neutralizeZone(z); flashZone(z, COUNTRY_EVENT_CFG.DE.color); }
    }
  });
}
function drawTank(ctx) {
  if (!tankAnim) return;
  const k = Math.min(1, (gameElapsedTime - tankAnim.t0) / tankAnim.dur);
  const x = tankAnim.x0 + (tankAnim.x1 - tankAnim.x0) * k, y = tankAnim.y0 + (tankAnim.y1 - tankAnim.y0) * k;
  const ang = Math.atan2(tankAnim.y1 - tankAnim.y0, tankAnim.x1 - tankAnim.x0);
  const s = tankAnim.w * 0.9;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(63, 98, 18, 0.18)';
  ctx.fillRect(-s * 6, -s * 0.8, s * 6, s * 1.6); // 지나온 자국
  ctx.fillStyle = '#3f6212'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / view.scale;
  ctx.beginPath(); ctx.roundRect(-s, -s * 0.7, s * 2, s * 1.4, s * 0.25); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4d7c0f';
  ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillRect(0, -s * 0.12, s * 1.5, s * 0.24);
  ctx.restore();
}
let countryEventNext = 0;
let quakeUntilMs = 0;
// -------------------------------------------------------------
// 아이템 모드: 시작할 때 카드 3장 중 1장, 이후 30초마다 또 1장 (총 4번). 이미 고른 카드는 다시 안 나옴.
// 적도 같은 때 무작위로 1장씩 고름. 고른 카드는 화면 아래에 아이콘으로 (나: 파랑, 적: 빨강)
// 아이템 모드 판은 기록·순위에 남기지 않음
// -------------------------------------------------------------
// 고르는 카드 수: 일반 맵 3장, 나라 전국 맵 4장, 전세계 5장
const NATIONAL_MAPS = new Set(['KOREA', 'JP_JAPAN', 'CN_CHINA', 'US_USA', 'FR_FRANCE', 'DE_GERMANY', 'IT_ITALY', 'ES_SPAIN', 'GB_UK']);
function itemRounds() {
  if (currentCountryKey() === 'WD') return 5;
  return NATIONAL_MAPS.has(currentMapKey) ? 4 : 3;
}
const ITEM_EVERY_SEC = 30;
const REBUILD_EVERY_SEC = 5;
const REBUILD_HP = 2;
const ITEM_CHANCE = 0.3; // 반사·흡수·크리티컬 확률
const PIERCE_RATIOS = [0.5, 0.3]; // 관통탄 튕긴 구슬 공격력: 두 번째 50%, 세 번째 30%
const ITEM_ICON = {
  rapid: '<path d="M3 8h9M5 12h10M3 16h9"/><circle cx="18" cy="12" r="3"/>',
  power: '<circle cx="12" cy="12" r="6"/><path d="M12 9v6M9 12h6"/>',
  pierce: '<path d="M3 12h17M15 7l5 5-5 5"/><rect x="9" y="6" width="3" height="12" rx="1"/>',
  fortress: '<path d="M4 20V9l3 2V7l2.5 2L12 6l2.5 3L17 7v4l3-2v11z"/>',
  rebuild: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
  reflect: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M15 10l-3 3-3-3"/>',
  longrange: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  supply: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  crit: '<path d="M12 2l2.4 6.6L21 9l-5.2 4.3L17.6 21 12 17.3 6.4 21l1.8-7.7L3 9l6.6-.4z"/>',
  absorb: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M7 12h10"/>'
};
const ITEMS = [
  { key: 'rapid', name: '속사', desc: '상대 땅으로 가는 원거리 구슬이 빠르게 (발사 간격 그대로)' },
  { key: 'power', name: '파워샷', desc: '상대 땅 공격력 2배 (상대 색이 조금이라도 있는 곳)' },
  { key: 'pierce', name: '관통탄', desc: '옆 상대 지역으로 두 번 더 튕김 (50% → 30%)' },
  { key: 'fortress', name: '철벽', desc: '상대 공격을 50%만 받음' },
  { key: 'rebuild', name: '재건', desc: '5초마다 내 모든 지역 피 +2' },
  { key: 'reflect', name: '반사 방패', desc: '30% 확률로 상대 구슬을 쏜 곳으로 되돌림' },
  { key: 'longrange', name: '장거리 사격', desc: '모든 내 지역이 원거리 공격 가능' },
  { key: 'supply', name: '보급', desc: '내 생산 속도 30% 빠르게' },
  { key: 'crit', name: '크리티컬', desc: '30% 확률로 상대 땅에 3배 피해' },
  { key: 'absorb', name: '흡수', desc: '30% 확률로 상대 공격을 막고 그 2배만큼 회복' }
];
const itemMode = true; // 모든 판이 아이템 모드 (노멀 모드 없음)
let itemsOf = { player: [], enemy: [] };
let itemRound = 0;
let nextItemAt = 0;
let rebuildAt = { player: 0, enemy: 0 };
let itemChoices = [];

// [아이템 상호작용] 구슬이 실제로 주는 양: 공격하는 쪽 카드(파워샷 등)로 정해진 power 에
// 맞는 쪽 카드를 적용. 철벽: 상대(적·나) 구슬에 맞을 때만 50% (중립 땅·자기 땅에는 그대로)
function itemHitPower(power, attacker, target) {
  if (!itemMode || !target) return power;
  const victim = target.owner;
  if (victim !== OWNER.NEUTRAL && victim !== attacker && hasItem(victim, 'fortress')) return power * 0.5;
  return power;
}
// 상대 색이 조금이라도 있는 지역: 상대 땅, 또는 상대 게이지가 찬 중립 땅
function isRivalMarked(t, attacker) {
  if (t.owner !== OWNER.NEUTRAL) return t.owner !== attacker;
  return !!t.claimant && t.claimant !== attacker && t.orbs > 0;
}
function hasItem(owner, key) { return itemMode && !!itemsOf[owner] && itemsOf[owner].includes(key); }
function itemRival(owner) { return owner === OWNER.PLAYER ? OWNER.ENEMY : OWNER.PLAYER; }
function itemIconSvg(key, size = 28) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ITEM_ICON[key]}</svg>`;
}


function resetItems() {
  itemsOf = { player: [], enemy: [] };
  itemRound = 0;
  nextItemAt = 0;
  rebuildAt = { player: 0, enemy: 0 };
  const m = document.getElementById('item-modal');
  if (m) m.style.display = 'none';
  renderItemBar();
}

function shuffled(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// 카드 고르기: 게임을 멈추고 내 카드 3장을 보여줌. 적은 같은 때 무작위로 1장
function openItemPick() {
  if (!itemMode || itemRound >= itemRounds()) return;
  currentState = GAME_STATE.PAUSED;
  const toast = document.getElementById('center-toast');
  if (toast) toast.classList.remove('show');
  itemChoices = shuffled(ITEMS.filter(it => !itemsOf.player.includes(it.key))).slice(0, 3);
  const m = document.getElementById('item-modal');
  const list = document.getElementById('item-choices');
  document.getElementById('item-round').textContent = `${itemRound + 1}/${itemRounds()}`;
  list.innerHTML = '';
  itemChoices.forEach(it => {
    const b = document.createElement('button');
    b.className = 'item-card';
    b.innerHTML = itemCardHtml(it);
    b.onclick = () => chooseItem(it.key);
    list.appendChild(b);
  });
  m.style.display = 'flex';
  renderItemBar();
  haptic('short'); // 아이템 카드 등장
}

// 카드 모양 (고르기 화면·고른 카드 크게 보기 공통)
function itemCardHtml(it) {
  return `<span class="item-icon">${itemIconSvg(it.key, 52)}</span><span class="item-name">${it.name}</span><span class="item-desc">${it.desc}</span>`;
}
function gainItem(owner, key) {
  itemsOf[owner].push(key);
  if (key === 'rebuild') rebuildAt[owner] = gameElapsedTime + REBUILD_EVERY_SEC;
}

function chooseItem(key) {
  if (currentState !== GAME_STATE.PAUSED) return;
  gainItem(OWNER.PLAYER, key);
  const pool = ITEMS.filter(it => !itemsOf.enemy.includes(it.key));
  const ek = pool[Math.floor(Math.random() * pool.length)].key;
  gainItem(OWNER.ENEMY, ek);
  itemRound++;
  nextItemAt = gameElapsedTime + ITEM_EVERY_SEC;
  document.getElementById('item-modal').style.display = 'none';
  currentState = GAME_STATE.PLAYING;
  renderItemBar();
  const mine = ITEMS.find(it => it.key === key).name, theirs = ITEMS.find(it => it.key === ek).name;
  document.getElementById('status-guide').innerText = `[${mine}] 선택! 적은 [${theirs}]을(를) 골랐습니다.`;
  flashCenterText(`적: ${theirs}`);
}
window.chooseItem = chooseItem;

// 화면 아래 고른 카드: 왼쪽 나(파랑), 오른쪽 적(빨강). 아이콘을 누르면 이름·설명
// 화면 아래 카드 칸: 위 줄 내 카드(파랑), 아래 줄 적 카드(빨강). 이 맵에서 고를 수만큼 빈 칸을 미리 둠
function renderItemBar() {
  const bar = document.getElementById('item-bar');
  if (!bar) return;
  const show = itemMode && rawZones.length > 0 && currentState !== GAME_STATE.SELECT_START;
  bar.hidden = !show;
  if (!show) return;
  const n = itemRounds();
  const row = (owner, cls) => {
    let h = '';
    for (let i = 0; i < n; i++) {
      const k = itemsOf[owner][i];
      h += k ? `<span class="item-chip ${cls}" data-key="${k}" data-owner="${owner}">${itemIconSvg(k, 26)}</span>`
             : `<span class="item-slot ${cls}"></span>`;
    }
    return `<div class="item-side ${cls}">${h}</div>`;
  };
  bar.innerHTML = row(OWNER.PLAYER, 'mine') + row(OWNER.ENEMY, 'theirs');
  // 카드를 누르고 있는 동안만 화면 가운데에 카드 (손을 떼면 바로 사라짐)
  bar.querySelectorAll('.item-chip').forEach(ch => {
    const show = e => { e.preventDefault(); showItemInfo(ch.dataset.key, ch.dataset.owner); };
    ch.addEventListener('pointerdown', show);
    ch.addEventListener('pointerup', () => hideItemInfo(0));
    ch.addEventListener('pointerleave', () => hideItemInfo(0));
    ch.addEventListener('pointercancel', () => hideItemInfo(0));
  });
}
let itemTipTimer = null;
function hideItemInfo(delay) {
  clearTimeout(itemTipTimer);
  itemTipTimer = setTimeout(() => { const tip = document.getElementById('item-tip'); if (tip) tip.hidden = true; }, delay || 0);
}
function showItemInfo(key, owner) {
  // 화면 가운데에 고르기 화면과 같은 카드로 크게 (나: 파랑, 적: 빨강)
  const it = ITEMS.find(x => x.key === key);
  const tip = document.getElementById('item-tip');
  if (!it || !tip) return;
  clearTimeout(itemTipTimer);
  const toast = document.getElementById('center-toast');
  if (toast) toast.classList.remove('show');
  tip.innerHTML = `<div class="item-tip-owner ${owner === OWNER.PLAYER ? 'mine' : 'theirs'}">${owner === OWNER.PLAYER ? '내 카드' : '적 카드'}</div>` +
    `<div class="item-card ${owner === OWNER.PLAYER ? 'mine' : 'theirs'}">${itemCardHtml(it)}</div>`;
  tip.hidden = false;
}
window.showItemInfo = showItemInfo;

// 매 프레임: 다음 카드 시간, 재건(30초마다 전체 회복)
function updateItems() {
  if (!itemMode) return;
  [OWNER.PLAYER, OWNER.ENEMY].forEach(owner => {
    // [아이템 재건] 5초마다 내 모든 지역 피 +2
    if (hasItem(owner, 'rebuild') && gameElapsedTime >= rebuildAt[owner]) {
      rebuildAt[owner] = gameElapsedTime + REBUILD_EVERY_SEC;
      rawZones.forEach(z => { if (z.owner === owner) z.orbs = Math.min(z.maxOrbs, z.orbs + REBUILD_HP); });
    }
  });
  if (itemRound < itemRounds() && gameElapsedTime >= nextItemAt) openItemPick();
}

// 맵 화면에서 나라 이름 아래에 보여 줄 컨셉 [이름, 설명]
const COUNTRY_CONCEPT = {
  JP: ['지진', '45초마다 무작위 점령 지역들의 피가 절반으로 깎이고 화면이 흔들려요'],
  CN: ['모래폭풍', '1분마다 무작위 점령 지역들의 공격 속도가 10초 동안 절반이 돼요'],
  US: ['자본주의 호황', '1분마다 무작위 점령 지역들의 공격력이 10초 동안 강해져요'],
  FR: ['혁명', '1분마다 10초 동안 점령 지역과 맞닿은 중립 지역이 주변을 공격해요'],
  DE: ['전차 돌파', '1분마다 전차가 지나가고, 지나간 지역은 중립이 돼요 (본진 제외)'],
  IT: ['최고의 지휘관', '본진 2개로 시작해요. 하나는 무작위 위치에 생겨요'],
  WD: ['세계 대전', '본진 3개로 시작하고, 30초마다 나라 컨셉 하나가 무작위로 일어나요. 카드는 5장 골라요'],
  ES: ['대항해시대', '1분마다 양쪽의 완전점령 지역 한 곳이 대포를 쏴요 (공격력 20)'],
  GB: ['안개', '적의 구슬은 처음 방향만 보이고 어디로 가는지는 보이지 않아요']
};
// [전세계 '세계 대전'] 30초마다 나라 컨셉 하나가 무작위로 (구역이 많은 만큼 더 많은 지역에)
const WORLD_EVENT_EVERY = 30;
const WORLD_EVENT_KEYS = ['JP', 'CN', 'US', 'FR', 'DE', 'ES', 'GB'];
const WORLD_FOG_SEC = 30;
let fogUntil = 0;
function isFogActive() { return currentCountryKey() === 'GB' || gameElapsedTime < fogUntil; }
// 맵이 클수록 이벤트가 걸리는 지역 수를 늘림 (전세계 300구역 → 3배)
function eventScale() { return currentCountryKey() === 'WD' ? Math.max(1, Math.round(rawZones.length / 100)) : 1; }
function resetCountryEvent() {
  const country = (MAP_CONFIGS[currentMapKey] || {}).country;
  const c = COUNTRY_EVENT_CFG[country];
  countryEventNext = country === 'WD' ? WORLD_EVENT_EVERY : (c ? c.every : 0);
  quakeUntilMs = 0;
  revoltUntil = 0; revoltNextShot = 0; tankAnim = null; fogUntil = 0;
}
// 대항해시대: 양쪽 각각 무작위 완전점령 지역 1곳이 전선으로 대포(큰 구슬, 공격력 20) 발사
function fireCannons(c) {
  let fired = false;
  [OWNER.PLAYER, OWNER.ENEMY].forEach(owner => {
   const full = shuffled(rawZones.filter(z => z.owner === owner && !z.isHidden && isFullyConquered(z)));
   full.slice(0, eventScale()).forEach(src => {
    const tg = pickMainZoneFrontierTarget(src);
    if (!tg) return;
    const orb = new FlyingOrb(src, tg, owner, c.power);
    orb.isCannon = true;
    flyingOrbs.push(orb);
    flashZone(src, c.color);
    fired = true;
   });
  });
  if (fired) flashCenterText(c.toast);
}
function pickEventZones(c) {
  const owned = rawZones.filter(z => z.owner !== OWNER.NEUTRAL && !isMainZone(z) && !z.isHidden);
  const n = Math.min(owned.length, Math.max(c.min * eventScale(), Math.round(owned.length * c.share)));
  for (let i = owned.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [owned[i], owned[j]] = [owned[j], owned[i]]; }
  return owned.slice(0, n);
}
function updateCountryEvent() {
  const country = (MAP_CONFIGS[currentMapKey] || {}).country;
  updateRevolt();
  updateTank();
  if (!countryEventNext || gameElapsedTime < countryEventNext) return;
  if (country === 'WD') {
    countryEventNext = gameElapsedTime + WORLD_EVENT_EVERY;
    triggerCountryEvent(WORLD_EVENT_KEYS[Math.floor(Math.random() * WORLD_EVENT_KEYS.length)]);
    return;
  }
  const c = COUNTRY_EVENT_CFG[country];
  if (!c) return;
  countryEventNext = gameElapsedTime + c.every;
  triggerCountryEvent(country);
}
function triggerCountryEvent(country) {
  haptic('strong'); // 나라 컨셉 발동 알림
  if (country === 'GB') { fogUntil = gameElapsedTime + WORLD_FOG_SEC; flashCenterText('안개!'); return; }
  const c = COUNTRY_EVENT_CFG[country];
  if (!c) return;
  if (country === 'FR') { revoltUntil = gameElapsedTime + c.duration; revoltNextShot = gameElapsedTime; flashCenterText(c.toast); return; }
  if (country === 'DE') { startTank(); flashCenterText(c.toast); return; }
  if (country === 'ES') { fireCannons(c); return; }
  const zones = pickEventZones(c);
  if (zones.length === 0) return;
  zones.forEach(z => {
    if (country === 'JP') z.orbs = Math.max(1, Math.floor(z.orbs * 0.5));
    if (country === 'CN') z.slowUntil = gameElapsedTime + c.duration;
    if (country === 'US') z.boostUntil = gameElapsedTime + c.duration;
    flashZone(z, c.color);
  });
  if (country === 'JP') quakeUntilMs = performance.now() + 700;
  flashCenterText(c.toast);
}
function quakeShakeOffset() {
  const left = quakeUntilMs - performance.now();
  if (left <= 0) return { x: 0, y: 0 };
  const a = 7 * (left / 700);
  return { x: (Math.random() - 0.5) * 2 * a, y: (Math.random() - 0.5) * 2 * a };
}
// 사막(모래색)·호황(금색) 효과가 걸린 지역 표시: 지역 위에 반투명 색 + 테두리
function drawCountryEventMarks(ctx) {
  const t = gameElapsedTime;
  for (let i = 0; i < rawZones.length; i++) {
    const z = rawZones[i];
    if (!z.path) continue;
    let color = null;
    if (t < revoltUntil && z.owner === OWNER.NEUTRAL && z.neighbors.some(n => n.owner !== OWNER.NEUTRAL)) color = COUNTRY_EVENT_CFG.FR.color;
    else if (z.slowUntil && t < z.slowUntil) color = COUNTRY_EVENT_CFG.CN.color;
    else if (z.boostUntil && t < z.boostUntil) color = COUNTRY_EVENT_CFG.US.color;
    if (!color) continue;
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(performance.now() / 180);
    ctx.fillStyle = color;
    ctx.fill(z.path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 / view.scale;
    ctx.stroke(z.path);
    ctx.restore();
  }
}

function checkWinConditions(isTimeUp = false) {
  if (currentState !== GAME_STATE.PLAYING) return;

  const pCount = rawZones.filter(z => z.owner === OWNER.PLAYER).length;
  const eCount = rawZones.filter(z => z.owner === OWNER.ENEMY || z.owner === OWNER.ENEMY2).length;
  const neutralCount = rawZones.filter(z => z.owner === OWNER.NEUTRAL && !z.isHidden).length;

  const pFull = rawZones.filter(z => z.owner === OWNER.PLAYER && isFullyConquered(z)).length;
  const eFull = rawZones.filter(z => (z.owner === OWNER.ENEMY || z.owner === OWNER.ENEMY2) && isFullyConquered(z)).length;

  const pEl = document.getElementById('player-count');
  const eEl = document.getElementById('enemy-count');
  const pFullEl = document.getElementById('player-full-count');
  const eFullEl = document.getElementById('enemy-full-count');

  if (pEl) pEl.innerText = pCount;
  if (eEl) eEl.innerText = eCount;
  if (pFullEl) pFullEl.innerText = `${pFull}`;
  if (eFullEl) eFullEl.innerText = `${eFull}`;

  // 패배 요건: 아군 점령지 0곳
  if (pCount === 0) {
    gameOver(false);
    return;
  }

  // 승리 요건: 적군 전멸 (적 거점 0곳)
  if (eCount === 0) {
    gameOver(true);
    return;
  }
}

// 항복: 실수 방지를 위해 2단계 확인 (첫 탭 확인 상태, 3초 안에 다시 탭 항복)
const SURRENDER_CONFIRM_MS = 3000;
let surrenderArmedUntil = 0;
let surrenderResetTimer = null;

function resetSurrenderButton() {
  surrenderArmedUntil = 0;
  const btn = document.getElementById('surrender-btn');
  if (btn) {
    btn.classList.remove('armed');
    btn.innerText = '항복';
  }
}

function onSurrenderClick() {
  if (currentState !== GAME_STATE.PLAYING) return;
  const btn = document.getElementById('surrender-btn');
  const now = performance.now();

  if (now < surrenderArmedUntil) {
    clearTimeout(surrenderResetTimer);
    resetSurrenderButton();
    gameOver(false, true);
    return;
  }

  surrenderArmedUntil = now + SURRENDER_CONFIRM_MS;
  if (btn) {
    btn.classList.add('armed');
    btn.innerText = '한 번 더 누르면 항복';
  }
  clearTimeout(surrenderResetTimer);
  surrenderResetTimer = setTimeout(resetSurrenderButton, SURRENDER_CONFIRM_MS);
}
window.onSurrenderClick = onSurrenderClick;

// 시작 전(시작 지역 고르는 중) 홈으로: 전장 선택 화면을 다시 열고 선택 초기화
function goHome() {
  if (currentState !== GAME_STATE.SELECT_START) return;
  introAnim = null;
  pendingStartZone = null;
  view.scale = 1;
  view.offsetX = 0;
  view.offsetY = 0;
  const modal = document.getElementById('start-modal');
  if (modal) modal.style.display = 'flex';
}
window.goHome = goHome;

let lastHomeHidden = null;
function updateHomeButtonVisibility() {
  const modal = document.getElementById('start-modal');
  const hidden = currentState !== GAME_STATE.SELECT_START || !modal || modal.style.display !== 'none';
  if (hidden === lastHomeHidden) return;
  lastHomeHidden = hidden;
  const btn = document.getElementById('home-btn');
  if (btn) btn.hidden = hidden;
}

let lastSurrenderHidden = null;
function updateSurrenderButtonVisibility() {
  const hidden = currentState !== GAME_STATE.PLAYING;
  if (hidden === lastSurrenderHidden) return;
  lastSurrenderHidden = hidden;
  const btn = document.getElementById('surrender-btn');
  if (btn) btn.hidden = hidden;
  if (hidden) resetSurrenderButton();
}

// 받침 유무에 따라 을/를
function josaEulReul(word) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xAC00 || c > 0xD7A3) return '을(를)';
  return (c - 0xAC00) % 28 ? '을' : '를';
}

// 승리 후 '다음 맵으로': 다음 맵을 골라 둔 채 홈을 다시 열고 바로 시작
let nextStageAfterWin = null;
function goNextStage() {
  const next = nextStageAfterWin;
  if (!next || !MAP_CONFIGS[next]) { location.reload(); return; }
  // 화면을 빠져나갔다 들어오는 시작 연출 없이 그 자리에서 바로 다음 맵을 불러옴
  document.getElementById('end-modal').style.display = 'none';
  selectedModalMapKey = next;
  selectModalMap(next);
  updateStageProgress();
}
window.goNextStage = goNextStage;

// 다시 도전: 시작 연출 없이 같은 맵을 그 자리에서 다시 불러옴
function retryStage() {
  const key = currentMapKey;
  document.getElementById('end-modal').style.display = 'none';
  selectedModalMapKey = key;
  selectModalMap(key);
}
window.retryStage = retryStage;

function gameOver(isWin, isSurrender = false) {
  currentState = GAME_STATE.GAME_OVER;
  haptic(isWin ? 'triple' : 'long');
  const im = document.getElementById('item-modal');
  if (im) im.style.display = 'none';
  const toast = document.getElementById('center-toast');
  if (toast) toast.classList.remove('show');
  const modal = document.getElementById('end-modal');
  const title = document.getElementById('end-title');
  const desc = document.getElementById('end-message');
  const timeStr = formatTimeString(gameElapsedTime);
  const mapName = MAP_CONFIGS[currentMapKey] ? MAP_CONFIGS[currentMapKey].name : currentMapKey;
  
  const nextBtn = document.getElementById('end-next-btn');
  if (nextBtn) nextBtn.hidden = true;
  // 패배·항복이면 같은 맵 다시 도전 버튼
  const retryBtn = document.getElementById('end-retry-btn');
  if (retryBtn) retryBtn.hidden = !!isWin;

  if (isWin) {
    // 승리: 축하합니다. / [맵이름]을 점령했습니다. / 기록 / 다음 맵으로 · 홈으로
    const label = MAP_CONFIGS[currentMapKey] ? MAP_CONFIGS[currentMapKey].label : currentMapKey;
    title.style.color = '#1e293b';
    title.innerText = '축하합니다.';

    const recordResult = saveBattleRecord(currentMapKey, gameElapsedTime);
    const bestStr = formatTimeString(recordResult.bestTime);
    desc.innerHTML =
      `<div class="end-sub">${label}${josaEulReul(label)} 점령했습니다.</div>` +
      `<div class="end-record-label">기록</div>` +
      `<div class="end-record">${timeStr}</div>` +
      (recordResult.isNewBest ? `<div class="end-best new">최고 기록</div>` : `<div class="end-best">최고 기록 ${bestStr}</div>`) +
      `<div class="end-total">${(COUNTRIES.find(x => x.key === selectedCountryKey) || COUNTRIES[0]).name} 총 시간 ${formatLongTime(getCampaignTotalTime().sum)}</div>`;
    submitMapRanking(selectedCountryKey || 'KR', currentMapKey, gameElapsedTime);
    submitCountryRanking(selectedCountryKey || 'KR');

    // 캠페인 다음 맵 (클리어로 열림)
    const order = getCampaignOrder();
    nextStageAfterWin = order[order.indexOf(currentMapKey) + 1] || null;
    if (nextBtn) nextBtn.hidden = !nextStageAfterWin;
  } else {
    title.style.color = '#ef4444';
    if (isSurrender) {
      title.innerText = '항복... 작전 중단';
      desc.innerHTML = `<div style="font-size: 14px; color: #475569; margin-bottom: 10px;">작전 진행 시간: <b>${timeStr}</b></div><div style="font-size: 13px; color: #334155;">스스로 항복하여 작전을 중단했습니다.<br>전열을 가다듬고 다시 도전하세요!</div>`;
      if (modal) modal.style.display = 'flex';
      return;
    }
    title.innerText = '본진 함락... 작전 실패!';
    desc.innerHTML = `<div style="font-size: 14px; color: #475569; margin-bottom: 10px;">작전 진행 시간: <b>${timeStr}</b></div><div style="font-size: 13px; color: #334155;">적의 공세에 아군의 모든 거점이 함락되었습니다.<br>전열을 가다듬고 다시 도전하세요!</div>`;
  }
  if (modal) modal.style.display = 'flex';
}

// -------------------------------------------------------------
// RENDER TACTICAL ADMINISTRATIVE MAP
// -------------------------------------------------------------
function drawBackdropZones(ctx) {
  if (backdropZones.length === 0) return;
  ctx.save();
  ctx.fillStyle = '#e2e0d8';
  ctx.strokeStyle = '#cfcdc4';
  ctx.lineWidth = 1.0;
  ctx.lineJoin = 'round';
  backdropZones.forEach(b => {
    if (!b.path) return;
    // 외곽선 없이 면만 칠함 (내부 구 경계선이 보이지 않도록, 미세 틈은 같은 색 선으로 메움)
    ctx.fill(b.path);
    ctx.strokeStyle = '#e2e0d8';
    ctx.lineWidth = 1.2 / view.scale;
    ctx.stroke(b.path);
  });
  ctx.font = `600 ${ZONE_LABEL_PX / view.scale}px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", sans-serif`;
  ctx.fillStyle = '#a8a59b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  backdropZones.forEach(b => {
    if (b.path) ctx.fillText(b.name, b.cx, b.cy);
  });
  ctx.restore();
}

// -------------------------------------------------------------
// 지역 색상 표현 (글자 대신 색으로 상태 표시)
// - 중립: 바탕색 + 아래에서 차오르는 줄다리기 게이지 (우세 진영 색)
// - 점령지: 피(0~50)만큼 아래에서 소유 진영 색이 차오름
// - 내 메인: 밝은 노란색 + 흰 테두리
// - 완전점령: 연한 색 바탕 위로 10초에 걸쳐 진한 색이 차오름(특수 기술 충전), 충전 완료 시 테두리 번쩍
// - 특수 기술 사용 후: 다시 연한 완전점령 색
// - 점령 순간: 테두리가 점령한 진영 색으로 번쩍
// -------------------------------------------------------------
const ZONE_COLORS = {
  base: '#edebe3',
  baseStroke: '#cfcdc4',
  player: '#60a5fa',
  playerStroke: '#2563eb',
  enemy: '#f87171',
  enemyStroke: '#b91c1c',
  playerFull: '#bbf7d0',
  playerFullCharged: '#22c55e',
  playerFullStroke: '#16a34a',
  enemyFull: '#fecaca',
  enemyFullCharged: '#dc2626',
  enemyFullStroke: '#991b1b',
  main: '#fde047',
  mainCharged: '#eab308',
  mainStroke: '#ffffff',
  enemyMain: '#be123c',        // 적 메인: 진한 와인 레드 + 흰 테두리
  enemyMainCharged: '#881337',
  enemy2: '#a78bfa',           // 3파전 두 번째 적: 보라
  enemy2Stroke: '#6d28d9',
  enemy2Full: '#ddd6fe',
  enemy2FullCharged: '#7c3aed',
  enemy2FullStroke: '#5b21b6',
  enemy2Main: '#6d28d9',
  enemy2MainCharged: '#4c1d95'
};
const ZONE_FLASH_MS = 700;

function flashZone(zone, color) {
  zone.flashAt = performance.now();
  zone.flashColor = color;
}

// 지역 모양 안을 아래에서부터 ratio(0~1)만큼 color로 채움
function fillZoneFromBottom(ctx, zone, ratio, color) {
  if (ratio <= 0 || !zone.bbox) return;
  const r = Math.min(1, ratio);
  const { minX, maxX, minY, maxY } = zone.bbox;
  const h = (maxY - minY) * r;
  ctx.save();
  ctx.clip(zone.path);
  ctx.fillStyle = color;
  ctx.fillRect(minX - 1, maxY - h, maxX - minX + 2, h + 1);
  ctx.restore();
}

function getZoneStyle(zone) {
  const isFull = isFullyConquered(zone);
  const isPlayer = zone.owner === OWNER.PLAYER;
  const isMyMain = isPlayer && (zone === playerMainZone || isExtraMainOf(zone, OWNER.PLAYER));
  const hpRatio = zone.orbs / zone.maxOrbs;
  const chargeRatio = zone.chargeState === 'ready' ? 1 : (zone.chargeState === 'charging' ? zone.chargeTime / SKILL_CHARGE_SEC : 0);

  if (zone.owner === OWNER.NEUTRAL) {
    const gauge = zone.claimant === OWNER.PLAYER ? ZONE_COLORS.player : zone.claimant === OWNER.ENEMY2 ? ZONE_COLORS.enemy2 : ZONE_COLORS.enemy;
    return { base: ZONE_COLORS.base, gauge, ratio: zone.claimant ? hpRatio : 0, stroke: ZONE_COLORS.baseStroke, width: 1.0 };
  }
  if (zone.owner === OWNER.ENEMY2) {
    if (zone === enemy2MainZone) {
      return isFull && hpRatio >= 1
        ? { base: ZONE_COLORS.enemy2Main, gauge: ZONE_COLORS.enemy2MainCharged, ratio: chargeRatio, stroke: ZONE_COLORS.mainStroke, width: 3.2 }
        : { base: ZONE_COLORS.base, gauge: ZONE_COLORS.enemy2Main, ratio: hpRatio, stroke: ZONE_COLORS.mainStroke, width: 3.2 };
    }
    return isFull && hpRatio >= 1
      ? { base: ZONE_COLORS.enemy2Full, gauge: ZONE_COLORS.enemy2FullCharged, ratio: chargeRatio, stroke: ZONE_COLORS.enemy2FullStroke, width: 2.0 }
      : { base: ZONE_COLORS.base, gauge: ZONE_COLORS.enemy2, ratio: hpRatio, stroke: ZONE_COLORS.enemy2Stroke, width: 2.0 };
  }
  const isEnemyMain = zone.owner === OWNER.ENEMY && (zone === enemyMainZone || isExtraMainOf(zone, OWNER.ENEMY));
  if (isEnemyMain) {
    if (isFull && hpRatio >= 1) {
      return { base: ZONE_COLORS.enemyMain, gauge: ZONE_COLORS.enemyMainCharged, ratio: chargeRatio, stroke: ZONE_COLORS.mainStroke, width: 3.2 };
    }
    return { base: ZONE_COLORS.base, gauge: ZONE_COLORS.enemyMain, ratio: hpRatio, stroke: ZONE_COLORS.mainStroke, width: 3.2 };
  }
  if (isMyMain) {
    if (isFull && hpRatio >= 1) {
      return { base: ZONE_COLORS.main, gauge: ZONE_COLORS.mainCharged, ratio: chargeRatio, stroke: ZONE_COLORS.mainStroke, width: 3.2 };
    }
    return { base: ZONE_COLORS.base, gauge: ZONE_COLORS.main, ratio: hpRatio, stroke: ZONE_COLORS.mainStroke, width: 3.2 };
  }
  if (isFull && hpRatio >= 1) {
    return isPlayer
      ? { base: ZONE_COLORS.playerFull, gauge: ZONE_COLORS.playerFullCharged, ratio: chargeRatio, stroke: ZONE_COLORS.playerFullStroke, width: 2.0 }
      : { base: ZONE_COLORS.enemyFull, gauge: ZONE_COLORS.enemyFullCharged, ratio: chargeRatio, stroke: ZONE_COLORS.enemyFullStroke, width: 2.0 };
  }
  return isPlayer
    ? { base: ZONE_COLORS.base, gauge: ZONE_COLORS.player, ratio: hpRatio, stroke: ZONE_COLORS.playerStroke, width: 2.0 }
    : { base: ZONE_COLORS.base, gauge: ZONE_COLORS.enemy, ratio: hpRatio, stroke: ZONE_COLORS.enemyStroke, width: 2.0 };
}

// 특수 기술 글로벌 쿨타임 표시: 해당 진영의 충전 완료 지역 위 어두운 부채꼴이 시계 방향으로 걷힘
function drawSkillGcdSweep(ctx, owner, gcdUntil) {
  const remain = gcdUntil - gameElapsedTime;
  if (remain <= 0) return;
  const f = Math.min(1, remain / SKILL_GCD_SEC); // 남은 비율
  const start = -Math.PI / 2 + (1 - f) * Math.PI * 2;
  const end = -Math.PI / 2 + Math.PI * 2;
  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    if (zone.owner !== owner || zone.chargeState !== 'ready' || !zone.path || !zone.bbox) continue;
    const { minX, maxX, minY, maxY } = zone.bbox;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const r = Math.hypot(maxX - minX, maxY - minY);
    ctx.save();
    ctx.clip(zone.path);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(start) * r, cy + Math.sin(start) * r);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5 / view.scale;
    ctx.stroke();
    ctx.restore();
  }
}

// 맵 이름을 지도 도화지에 새김: 월드 좌표로 그려 확대·이동하면 지도와 함께 커지고 움직임
// 7세그먼트 디지털 시계 숫자 (탁상 디지털 시계처럼 숫자 획만). cx: 가운데 x, top: 위 y, h: 숫자 높이
const SEG_DIGITS = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g'
};
function drawSevenSegment(ctx, text, cx, top, h) {
  const w = h * 0.56, t = h * 0.17, gap = t * 0.14, space = h * 0.16, colonW = h * 0.26;
  let total = 0;
  for (const ch of text) total += (ch === ':' ? colonW : w) + space;
  total -= space;
  const segPath = (x0, y0, x1, y1) => {
    // 양끝이 뾰족한 육각형 획
    const p = new Path2D();
    if (y0 === y1) {
      x0 += gap; x1 -= gap;
      p.moveTo(x0, y0); p.lineTo(x0 + t / 2, y0 - t / 2); p.lineTo(x1 - t / 2, y0 - t / 2);
      p.lineTo(x1, y0); p.lineTo(x1 - t / 2, y0 + t / 2); p.lineTo(x0 + t / 2, y0 + t / 2);
    } else {
      y0 += gap; y1 -= gap;
      p.moveTo(x0, y0); p.lineTo(x0 + t / 2, y0 + t / 2); p.lineTo(x0 + t / 2, y1 - t / 2);
      p.lineTo(x0, y1); p.lineTo(x0 - t / 2, y1 - t / 2); p.lineTo(x0 - t / 2, y0 + t / 2);
    }
    p.closePath();
    return p;
  };
  const paths = [];
  let x = cx - total / 2;
  for (const ch of text) {
    if (ch === ':') {
      const r = t * 0.55, mx = x + colonW / 2;
      [top + h * 0.3, top + h * 0.7].forEach(y => { const p = new Path2D(); p.arc(mx, y, r, 0, Math.PI * 2); paths.push(p); });
      x += colonW + space;
      continue;
    }
    const L = x + t / 2, R = x + w - t / 2, T = top + t / 2, M = top + h / 2, B = top + h - t / 2;
    const seg = { a: [L, T, R, T], g: [L, M, R, M], d: [L, B, R, B], f: [L, T, L, M], e: [L, M, L, B], b: [R, T, R, M], c: [R, M, R, B] };
    for (const k of (SEG_DIGITS[ch] || '')) paths.push(segPath(...seg[k]));
    x += w + space;
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = t * 0.45;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  paths.forEach(p => ctx.stroke(p));
  ctx.fillStyle = '#111111';
  paths.forEach(p => ctx.fill(p));
  ctx.restore();
}

function drawMapTitle(ctx) {
  const cfg = MAP_CONFIGS[currentMapKey];
  if (!cfg || !cfg.label || introAnim) return;
  const area = getMapArea();
  const head = getMapHeaderHeight();
  const showTime = currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.GAME_OVER;
  // 머리 공간(지도 위쪽 빈 곳) 안에만 그림: 이름 + 시계, 지도와는 여유 간격
  const size = head * 0.36;
  const clockH = head * 0.26;
  const blockH = size + (showTime ? size * 0.18 + clockH : 0);
  const top = area.y - head * 0.12 - blockH;
  const tx = area.x + area.w / 2;
  ctx.save();
  ctx.font = `900 ${size}px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
  ctx.fillText(cfg.label, tx, top);
  ctx.restore();
  if (showTime) drawSevenSegment(ctx, formatTimeString(gameElapsedTime), tx, top + size * 1.18, clockH);
}

function drawExactDistrictsMap(ctx) {
  drawBackdropZones(ctx);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. 면 채우기 (바탕 + 아래에서 차오르는 게이지)
  const styles = new Array(rawZones.length);
  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    if (!zone.path) continue;
    const st = getZoneStyle(zone);
    styles[i] = st;
    ctx.fillStyle = st.base;
    ctx.fill(zone.path);
    // 안티앨리어싱으로 생기는 경계의 머리카락 틈만 메우는 얇은 덧칠 (맵 데이터는 build_map.py로 경계가 정확히 맞물림)
    ctx.strokeStyle = st.ratio >= 1 ? st.gauge : st.base;
    ctx.lineWidth = 1.2 / view.scale;
    ctx.stroke(zone.path);
    fillZoneFromBottom(ctx, zone, st.ratio, st.gauge);
  }

  // 2. 테두리: 중립 → 점령지 → 메인 순으로 그려 굵은 테두리가 이웃 선에 덮이지 않게 함
  const strokePass = (filter) => {
    for (let i = 0; i < rawZones.length; i++) {
      const zone = rawZones[i];
      const st = styles[i];
      if (!st || !filter(zone)) continue;
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = st.width / view.scale; // 확대해도 화면상 테두리 두께 유지
      if (zone.owner === OWNER.NEUTRAL) {
        ctx.stroke(zone.path);
        continue;
      }
      // 점령지 테두리: 두 배 굵기로 그린 뒤 면을 다시 칠해 바깥쪽 절반만 남김
      // (여러 조각으로 된 지역(예: 수원 4개 구)의 안쪽 경계선이 보이지 않도록)
      ctx.lineWidth *= 2;
      ctx.stroke(zone.path);
      ctx.fillStyle = st.base;
      ctx.fill(zone.path);
      fillZoneFromBottom(ctx, zone, st.ratio, st.gauge);
    }
  };
  strokePass(z => z.owner === OWNER.NEUTRAL);
  const isAnyMain = z => isMainZone(z);
  strokePass(z => z.owner !== OWNER.NEUTRAL && !isAnyMain(z));
  strokePass(isAnyMain);

  // 2.5 시작 구역 후보: 노란색 + 흰 테두리 (한 번 더 탭하면 시작)
  if (currentState === GAME_STATE.SELECT_START && pendingStartZone && pendingStartZone.path) {
    const pulse = 0.65 + 0.25 * Math.sin(performance.now() / 220);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = ZONE_COLORS.main;
    ctx.fill(pendingStartZone.path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.2 / view.scale;
    ctx.stroke(pendingStartZone.path);
    ctx.restore();
  }

  // 3. 선택(드래그 시작) 지역 강조
  if (dragSourceZone && dragSourceZone.path) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6 / view.scale;
    ctx.stroke(dragSourceZone.path);
  }

  // 3.5 특수 기술 글로벌 쿨타임: 충전 완료된 내 지역 위로 어두운 부채꼴이 시계 방향으로 걷히며 돌아감
  //     (월드 오브 워크래프트 스킬 아이콘 쿨타임 방식)
  drawSkillGcdSweep(ctx, OWNER.PLAYER, playerSkillGcdUntil);
  drawSkillGcdSweep(ctx, OWNER.ENEMY, enemySkillGcdUntil);

  // 4. 번쩍 효과 (점령 순간, 특수 기술 충전 완료 순간)
  const now = performance.now();
  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    if (!zone.flashAt || !zone.path) continue;
    const t = (now - zone.flashAt) / ZONE_FLASH_MS;
    if (t >= 1) { zone.flashAt = 0; continue; }
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = zone.flashColor;
    ctx.lineWidth = (3 + 5 * (1 - t)) / view.scale;
    ctx.stroke(zone.path);
    ctx.restore();
  }

  // 1.5 큰 물(강·호수)
  if (hanRiverPath) {
    ctx.save();
    ctx.fillStyle = '#bfe5fa'; // 산뜻한 한강 라이트 블루
    ctx.strokeStyle = '#93cbf0';
    ctx.lineWidth = 1.6 / view.scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fill(hanRiverPath);
    ctx.stroke(hanRiverPath);
    ctx.restore();
  }

  // 2. Draw Network Links (구슬이 움직이는 선 표시 제거)
  // (Network links hidden per user request)

  // 3. Drag line from source (Clean Dotted Transit Vector) - 공격할 수 없는 완전점령 지역에서는 표시 안 함
  if (isDragging && dragSourceZone && (!isFullyConquered(dragSourceZone) || isUnleashed(dragSourceZone))) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dragSourceZone.cx, dragSourceZone.cy);
    ctx.lineTo(worldMousePos.x, worldMousePos.y);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Zone Labels & Badges
  drawZoneBadges(ctx);

  // 집중 포화 조준선 그래픽은 표시하지 않음
}

// 지역 이름만 작게 표시 (상태는 색으로 표현하므로 숫자·아이콘 표시 없음)
// 글자 크기는 확대 배율과 무관하게 화면에서 일정하게 유지하고,
// 화면상 지역이 이름보다 작으면 이름을 생략해 겹침 방지
const ZONE_LABEL_PX = 10;
function drawZoneBadges(ctx) {
  const fontSize = ZONE_LABEL_PX / view.scale;
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    if (!zone.bbox) continue;
    const w = ctx.measureText(zone.name).width;
    if (zone.bbox.maxX - zone.bbox.minX < w * 0.9) continue;
    ctx.fillText(zone.name, zone.cx, zone.cy);
  }
}

// -------------------------------------------------------------
// MINIMAP: 왼쪽 아래에 전체 맵 전황(지역 색 그대로) + 현재 보고 있는 화면 영역 표시
// 미니맵을 탭하거나 드래그하면 그 위치로 화면 이동
// -------------------------------------------------------------
const MINIMAP_MAX_W = 140;
const MINIMAP_MAX_H = 170;
const MINIMAP_REDRAW_MS = 100; // 리소스 절약: 초당 10회만 다시 그림
const minimapCanvas = document.getElementById('minimap');
const minimapCard = document.getElementById('minimap-card');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
let minimapLayout = null; // { scale, area, cssW, cssH }
let lastMinimapDraw = 0;
let lastMinimapHidden = null;

function layoutMinimap() {
  if (!minimapCanvas) return null;
  const area = getMapArea();
  const mm = (MAP_CONFIGS[currentMapKey] && MAP_CONFIGS[currentMapKey].minimap) || { w: MINIMAP_MAX_W, h: MINIMAP_MAX_H };
  const scale = Math.min(mm.w / area.w, mm.h / area.h);
  const cssW = Math.round(area.w * scale);
  const cssH = Math.round(area.h * scale);
  const dpr = window.devicePixelRatio || 1;
  if (minimapCanvas.width !== Math.round(cssW * dpr) || minimapCanvas.height !== Math.round(cssH * dpr)) {
    minimapCanvas.width = Math.round(cssW * dpr);
    minimapCanvas.height = Math.round(cssH * dpr);
    minimapCanvas.style.width = cssW + 'px';
    minimapCanvas.style.height = cssH + 'px';
  }
  return { scale, area, cssW, cssH, dpr };
}

// 지도 전체가 화면 안에 다 보이면 true → 미니맵이 필요 없으니 숨김 (확대해서 화면을 넘어가면 나타남)
function mapFitsOnScreen() {
  const area = getMapArea();
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(viewW, viewH);
  const eps = 1;
  return area.x >= tl.x - eps && area.y >= tl.y - eps &&
         area.x + area.w <= br.x + eps && area.y + area.h <= br.y + eps;
}

function drawMinimap(timestamp) {
  if (!minimapCtx) return;
  const startModalOpen = document.getElementById('start-modal').style.display !== 'none';
  const hidden = !!introAnim || !(currentState === GAME_STATE.PLAYING || (currentState === GAME_STATE.SELECT_START && !startModalOpen)) || rawZones.length === 0 || mapFitsOnScreen();
  if (hidden !== lastMinimapHidden) {
    lastMinimapHidden = hidden;
    minimapCard.hidden = hidden;
  }
  if (hidden || timestamp - lastMinimapDraw < MINIMAP_REDRAW_MS) return;
  lastMinimapDraw = timestamp;

  const L = layoutMinimap();
  minimapLayout = L;
  const m = minimapCtx;
  const k = L.scale * L.dpr;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  // 월드 좌표 그대로 그리도록 변환 (지역 Path2D 재사용)
  m.setTransform(k, 0, 0, k, -L.area.x * k, -L.area.y * k);
  m.lineJoin = 'round';

  backdropZones.forEach(b => {
    if (!b.path) return;
    m.fillStyle = '#e2e0d8';
    m.fill(b.path);
  });

  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    if (!zone.path) continue;
    const st = getZoneStyle(zone);
    m.fillStyle = st.base;
    m.fill(zone.path);
    m.strokeStyle = st.ratio >= 1 ? st.gauge : st.base;
    m.lineWidth = 2 / L.scale;
    m.stroke(zone.path);
    fillZoneFromBottom(m, zone, st.ratio, st.gauge);
  }
  // 경계선 (얇게)
  m.lineWidth = 0.6 / L.scale;
  m.strokeStyle = 'rgba(120, 113, 108, 0.45)';
  for (let i = 0; i < rawZones.length; i++) {
    if (rawZones[i].path) m.stroke(rawZones[i].path);
  }
  if (playerMainZone && playerMainZone.owner === OWNER.PLAYER && playerMainZone.path) {
    m.strokeStyle = '#ffffff';
    m.lineWidth = 1.6 / L.scale;
    m.stroke(playerMainZone.path);
  }
  if (hanRiverPath) {
    m.fillStyle = '#bfe5fa';
    m.fill(hanRiverPath);
  }

  // 현재 보고 있는 화면 영역
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(viewW, viewH);
  m.strokeStyle = '#0f172a';
  m.lineWidth = 1.6 / L.scale;
  m.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  m.fillStyle = 'rgba(15, 23, 42, 0.08)';
  m.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
}

// 미니맵 탭/드래그 → 해당 월드 지점이 화면 중앙에 오도록 이동
function moveViewToMinimapPoint(clientX, clientY) {
  if (!minimapLayout) return;
  const rect = minimapCanvas.getBoundingClientRect();
  const wx = minimapLayout.area.x + (clientX - rect.left) / minimapLayout.scale;
  const wy = minimapLayout.area.y + (clientY - rect.top) / minimapLayout.scale;
  view.offsetX = (viewW / 2 - wx) * view.scale;
  view.offsetY = (viewH / 2 - wy) * view.scale;
  lastMinimapDraw = 0; // 즉시 갱신
}

if (minimapCanvas) {
  let minimapDragging = false;
  minimapCanvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    minimapDragging = true;
    try { minimapCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    moveViewToMinimapPoint(e.clientX, e.clientY);
  });
  minimapCanvas.addEventListener('pointermove', e => {
    if (!minimapDragging) return;
    e.preventDefault();
    moveViewToMinimapPoint(e.clientX, e.clientY);
  });
  const endMinimapDrag = () => { minimapDragging = false; };
  minimapCanvas.addEventListener('pointerup', endMinimapDrag);
  minimapCanvas.addEventListener('pointercancel', endMinimapDrag);
}

// -------------------------------------------------------------
// 시작 화면 전장 썸네일: 각 맵 실제 모양을 파스텔 실루엣으로 그림
// -------------------------------------------------------------
const THUMB_PALETTE = ['#93c5fd', '#fda4af', '#86efac', '#fcd34d', '#c4b5fd', '#fdba74', '#5eead4', '#f9a8d4'];

// -------------------------------------------------------------
// 홈 화면: 나라 선택 + 대한민국 캠페인(구역 적은 맵부터, 클리어하면 다음 맵 열림) + 튜토리얼
// -------------------------------------------------------------
const COUNTRIES = [
  { key: 'KR', flag: '🇰🇷', name: '대한민국', open: true },
  { key: 'JP', flag: '🇯🇵', name: '일본', open: false, paid: true },
  { key: 'CN', flag: '🇨🇳', name: '중국', open: false, paid: true },
  { key: 'US', flag: '🇺🇸', name: '미국', open: false, paid: true },
  { key: 'FR', flag: '🇫🇷', name: '프랑스', open: false, paid: true },
  { key: 'DE', flag: '🇩🇪', name: '독일', open: false, paid: true },
  { key: 'IT', flag: '🇮🇹', name: '이탈리아', open: false, paid: true },
  { key: 'ES', flag: '🇪🇸', name: '스페인', open: false, paid: true },
  { key: 'GB', flag: '🇬🇧', name: '영국', open: false, paid: true },
  { key: 'WD', flag: '🌏', name: '전세계', open: false, paid: true }
];
const DEV_UNLOCK_KEY = 'tapwar_dev_unlock_all';
// [테스트용] 유료 나라(일본·중국·미국·유럽 5개국·전세계)를 구매 없이 열기. 출시 전 false (인앱 구매 'country_jp' 등으로 열림)
const DEV_TEST_COUNTRIES = true;
function isCountryOpen(c) {
  return !!c && (c.open || (c.paid && (DEV_TEST_COUNTRIES || isOwned(`country_${c.key.toLowerCase()}`))));
}

// 대한민국 캠페인 순서: 구역 수가 적은 맵부터 (같으면 MAP_CONFIGS 순서)
function getCampaignOrder(country) {
  if (!country) { try { country = selectedCountryKey; } catch (e) { country = 'KR'; } }
  const keys = Object.keys(MAP_CONFIGS).filter(k => (MAP_CONFIGS[k].country || 'KR') === (country || 'KR'));
  return keys.slice().sort((a, b) => (MAP_CONFIGS[a].count - MAP_CONFIGS[b].count) || (keys.indexOf(a) - keys.indexOf(b)));
}

// [테스트용] true 면 모든 나라의 모든 맵을 클리어 여부와 관계없이 바로 플레이. 출시 전 false
const DEV_UNLOCK_ALL_MAPS = true;
function isDevUnlockAll() {
  if (DEV_UNLOCK_ALL_MAPS) return true;
  try { return localStorage.getItem(DEV_UNLOCK_KEY) === '1'; } catch (e) { return false; }
}

function isStageCleared(key) {
  const r = getBattleRecords()[key];
  return !!(r && r.cleared);
}

function isStageUnlocked(key) {
  if (isDevUnlockAll() || isStageCleared(key)) return true; // 한 번 클리어한 맵은 항상 열림
  const order = getCampaignOrder();
  const i = order.indexOf(key);
  return i <= 0 || isStageCleared(order[i - 1]);
}

// 다음에 할 스테이지: 열려 있고 아직 클리어하지 않은 첫 맵 (모두 깼으면 마지막 맵)
function getNextStageKey() {
  const order = getCampaignOrder();
  return order.find(k => isStageUnlocked(k) && !isStageCleared(k)) || order[order.length - 1];
}

function openSheet(icon, title, text) {
  const iconEl = document.getElementById('sheet-icon');
  iconEl.textContent = icon;
  iconEl.style.display = icon ? '' : 'none';
  document.getElementById('sheet-title').textContent = title;
  document.getElementById('sheet-text').textContent = text;
  document.getElementById('sheet').style.display = 'flex';
}
function closeSheet() {
  document.getElementById('sheet').style.display = 'none';
}
window.closeSheet = closeSheet;

function restorePurchases() {
  // TODO(IAP): App Store 상품 등록 후 StoreKit 구매 복원 연결
  openSheet('', '구매 복원', '앱스토어 결제를 연결한 뒤에 사용할 수 있어요.\n같은 Apple ID로 산 나라·기능을 다시 열어 줍니다.');
}
window.restorePurchases = restorePurchases;

// 홈 1단계: 국가 카드 (맵 카드처럼 가로 슬라이드). 선택한 국가를 가운데로
let selectedCountryKey = 'KR';
function buildCountryCards() {
  const grid = document.getElementById('country-grid');
  if (!grid) return;
  grid.innerHTML = '';
  COUNTRIES.forEach(c => {
    const b = document.createElement('button');
    b.id = `country-${c.key.toLowerCase()}`;
    b.className = 'stage-card country-card' + (c.key === selectedCountryKey ? ' active' : '') + (isCountryOpen(c) ? '' : ' locked');
    const maps = getCampaignOrder(c.key);
    if (maps.length === 1) {
      // 맵이 하나뿐인 나라(전세계): 국기 대신 맵 카드 모양 (썸네일·구역 수·최고 기록)
      const key = maps[0], cfg = MAP_CONFIGS[key];
      const r = getBattleRecords()[key];
      const cleared = !!(r && r.cleared && r.bestTime !== null && r.bestTime !== undefined);
      if (cleared) b.classList.add('cleared');
      b.innerHTML = `<span class="stage-no">1</span>` +
        `<canvas class="stage-thumb" id="cthumb-${key.toLowerCase()}"></canvas>` +
        `<span class="stage-title"><span class="stage-name">${cfg.label || c.name}</span><span class="stage-sub">${cfg.count || ''}</span></span>` +
        `<span class="stage-recrow"><span class="stage-record">${cleared ? formatTimeString(r.bestTime) : ''}</span></span>`;
      requestAnimationFrame(() => drawMapThumb(document.getElementById(`cthumb-${key.toLowerCase()}`), key));
    } else {
      b.innerHTML = `<span class="country-flag" aria-hidden="true">${c.flag}</span><span class="stage-name">${c.name}</span>`;
    }
    b.onclick = () => selectCountry(c.key);
    grid.appendChild(b);
  });
}

function selectCountry(key) {
  selectedCountryKey = key;
  document.querySelectorAll('#country-grid .country-card').forEach(el => {
    el.classList.toggle('active', el.id === `country-${key.toLowerCase()}`);
  });
  centerCard('country-grid', document.getElementById(`country-${key.toLowerCase()}`));
  const c = COUNTRIES.find(x => x.key === key);
  const btn = document.getElementById('enter-btn');
  if (btn) btn.classList.toggle('locked', !isCountryOpen(c));
}

// 참전하기: 열린 국가면 도시 맵 화면으로, 잠긴 국가면 안내
function enterCountry() {
  const c = COUNTRIES.find(x => x.key === selectedCountryKey);
  if (!isCountryOpen(c)) {
    // TODO(IAP): 출시 후 인앱 구매 시트로 연결
    openSheet('', `${c ? c.name : ''} 전선`, '곧 출시돼요.\n출시되면 인앱 구매로 열 수 있어요.');
    return;
  }
  // 맵이 하나뿐인 나라(전세계): 맵 고르기 없이 바로 본진 선택으로
  const only = getCampaignOrder(c.key);
  if (only.length === 1) {
    selectedModalMapKey = only[0];
    showStageView();
    // 거쳐 가는 화면에서도 맵 카드가 맨 앞(가운데)에 보이도록: 레이아웃이 잡힌 뒤 몇 번 더 맞춤
    [50, 200, 500].forEach(ms => setTimeout(() => centerStageCard(only[0], false), ms));
    startWhenMapLoaded(only[0]);
    return;
  }
  showStageView();
}
window.enterCountry = enterCountry;
// 맵 데이터가 다 불러와진 뒤 시작 (최대 5초 대기)
function startWhenMapLoaded(key) {
  const t0 = performance.now();
  const waitStart = () => {
    if (currentMapKey === key && rawZones.length > 0 && MAP_CONFIGS[key].bounds) onStartBtnClick();
    else if (performance.now() - t0 < 5000) setTimeout(waitStart, 50);
  };
  setTimeout(waitStart, 50);
}

function showStageView() {
  const c = COUNTRIES.find(x => x.key === selectedCountryKey) || COUNTRIES[0];
  document.getElementById('country-view').hidden = true;
  document.getElementById('stage-view').hidden = false;
  // 맵 카드 화면에서는 튜토리얼·구매 복원 링크 숨김
  const links = document.getElementById('home-links');
  if (links) links.hidden = true;
  document.getElementById('country-title').textContent = c.name;
  // 나라 컨셉 설명 (이름 아래)
  const concept = COUNTRY_CONCEPT[c.key];
  const conceptEl = document.getElementById('country-concept');
  if (conceptEl) {
    conceptEl.hidden = !concept;
    conceptEl.innerHTML = concept ? `<b>${concept[0]}</b>${concept[1]}` : '';
  }
  // 나라가 바뀌면 그 나라 캠페인의 다음 맵을 고름
  if ((MAP_CONFIGS[selectedModalMapKey].country || 'KR') !== c.key) selectedModalMapKey = getNextStageKey();
  updateStageProgress();
  try { sessionStorage.setItem('tapwar_in_country', c.key); } catch (e) {}
  // 보이게 된 뒤에 썸네일 크기·가운데 정렬 계산
  requestAnimationFrame(() => { renderStageThumbs(); selectModalMap(selectedModalMapKey); centerStageCard(selectedModalMapKey, false); });
}
function showCountryView() {
  document.getElementById('stage-view').hidden = true;
  document.getElementById('country-view').hidden = false;
  const links = document.getElementById('home-links');
  if (links) links.hidden = false;
  try { sessionStorage.removeItem('tapwar_in_country'); } catch (e) {}
  requestAnimationFrame(() => selectCountry(selectedCountryKey));
}
window.showCountryView = showCountryView;

// 클리어한 맵 수 / 전체 맵 수
function updateStageProgress() {
  const el = document.getElementById('stage-progress');
  if (!el) return;
  const order = getCampaignOrder();
  el.textContent = `${order.filter(isStageCleared).length}/${order.length}`;
  const totalEl = document.getElementById('stage-total-time');
  if (totalEl) {
    const t = getCampaignTotalTime();
    totalEl.textContent = t.count > 0 ? `총 시간 ${formatLongTime(t.sum)}` : '';
  }
}

// 총 작전 시간: 클리어한 맵들의 최고 기록(가장 빨리 이긴 시간)을 모두 더한 값. 짧을수록 좋은 기록
function getCampaignTotalTime() {
  const records = getBattleRecords();
  let sum = 0, count = 0;
  getCampaignOrder().forEach(k => {
    const r = records[k];
    if (r && r.cleared && r.bestTime !== null && r.bestTime !== undefined) { sum += r.bestTime; count++; }
  });
  return { sum, count };
}

// -------------------------------------------------------------
// 나라별 글로벌 순위 (Apple 게임 센터 순위표)
// - 나라의 모든 맵을 클리어하면 '총 시간'(맵별 최고 기록 합)을 그 나라 순위표에 제출 (낮을수록 높은 순위)
// - App Store Connect 에서 만든 순위표 ID 로 바꿔 넣을 것 (형식: 경과 시간 - 초 단위, 정렬: 낮은 점수 우선)
// -------------------------------------------------------------
const LEADERBOARDS = {
  KR: 'tapwar.leaderboard.kr.totaltime', // TODO: App Store Connect 순위표 ID
  JP: 'tapwar.leaderboard.jp.totaltime',
  CN: 'tapwar.leaderboard.cn.totaltime',
  US: 'tapwar.leaderboard.us.totaltime',
  FR: 'tapwar.leaderboard.fr.totaltime',
  DE: 'tapwar.leaderboard.de.totaltime',
  IT: 'tapwar.leaderboard.it.totaltime',
  ES: 'tapwar.leaderboard.es.totaltime',
  GB: 'tapwar.leaderboard.gb.totaltime',
  WD: 'tapwar.leaderboard.wd.totaltime'
};
const GameCenter = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
  window.Capacitor.registerPlugin) ? window.Capacitor.registerPlugin('GameCenter') : null;
if (GameCenter) GameCenter.authenticate().catch(() => {});

// 맵별 순위표 ID: 나라 순위표 ID 뒤에 맵 키 (예: tapwar.leaderboard.kr.ulsan). App Store Connect 에서 같은 이름으로 만들 것
function mapLeaderboardId(countryKey, mapKey) {
  const base = LEADERBOARDS[countryKey];
  return base ? base.replace(/totaltime$/, mapKey.toLowerCase()) : null;
}

// 맵을 이길 때마다: 그 맵 기록을 맵별 순위표에 제출 (게임 센터가 최고 기록만 남김)
function submitMapRanking(countryKey, mapKey, sec) {
  const id = mapLeaderboardId(countryKey, mapKey);
  if (!id || !GameCenter) return;
  GameCenter.submitScore({ leaderboardId: id, score: Math.round(sec) }).catch(() => {});
}

// 상위 몇 % (게임 센터에서 내 순위·전체 인원을 받아 계산). 웹·미연결이면 비워 둠
const EXACT_RANK_LIMIT = 20; // 이 순위까지만 정확한 등수 표시
function rankPercentText(rank, total) {
  if (!rank || !total) return '';
  const pct = Math.max(1, Math.ceil(rank / total * 100));
  return `상위 ${pct}%`;
}
function loadRankPercents() {
  if (!GameCenter) return;
  const c = COUNTRIES.find(x => x.key === selectedCountryKey) || COUNTRIES[0];
  getCampaignOrder().forEach(key => {
    if (!isStageCleared(key)) return;
    const el = document.getElementById(`rank-${key.toLowerCase()}`);
    const id = mapLeaderboardId(c.key, key);
    if (!el || !id) return;
    GameCenter.getRank({ leaderboardId: id }).then(r => { el.textContent = rankPercentText(r.rank, r.total); }).catch(() => {});
  });
  const totalEl = document.getElementById('rank-total');
  if (totalEl && LEADERBOARDS[c.key]) {
    // 순위 카드(총 시간): 1~20위(랭커)는 정확한 순위만, 21위부터는 상위 몇 %
    GameCenter.getRank({ leaderboardId: LEADERBOARDS[c.key] }).then(r => {
      if (!r.rank || !r.total) return;
      totalEl.innerHTML = r.rank <= EXACT_RANK_LIMIT
        ? `<b class="rank-exact">${r.rank}위</b>`
        : `<b class="rank-exact">${rankPercentText(r.rank, r.total)}</b>`;
    }).catch(() => {});
  }
}

// 맵별 순위 보기
function openMapRanking(mapKey) {
  const c = COUNTRIES.find(x => x.key === selectedCountryKey) || COUNTRIES[0];
  const id = mapLeaderboardId(c.key, mapKey);
  if (GameCenter && id) { GameCenter.showLeaderboard({ leaderboardId: id }).catch(() => {}); return; }
  const r = getBattleRecords()[mapKey];
  openSheet('', `${MAP_CONFIGS[mapKey].label} 순위`, `내 최고 기록 ${r && r.bestTime != null ? formatTimeString(r.bestTime) : '-'}\n맵별 순위는 아이폰 앱(게임 센터)에서 볼 수 있어요.`);
}
window.openMapRanking = openMapRanking;

// 나라의 모든 맵을 깼으면 총 시간을 순위표에 제출 (맵 기록을 줄이면 총 시간도 줄어 다시 제출 → 순위 갱신)
function submitCountryRanking(countryKey) {
  const id = LEADERBOARDS[countryKey];
  const order = getCampaignOrder();
  if (!id || !GameCenter || !order.every(isStageCleared)) return;
  const total = Math.round(getCampaignTotalTime().sum);
  GameCenter.submitScore({ leaderboardId: id, score: total }).catch(() => {});
}

// 순위 보기 (고른 나라의 순위표)
function openRanking() {
  const c = COUNTRIES.find(x => x.key === selectedCountryKey) || COUNTRIES[0];
  if (GameCenter && LEADERBOARDS[c.key]) {
    GameCenter.showLeaderboard({ leaderboardId: LEADERBOARDS[c.key] }).catch(() => {});
    return;
  }
  const order = getCampaignOrder();
  const done = order.filter(isStageCleared).length;
  openSheet('', `${c.name} 순위`, `${c.name}의 모든 맵(${order.length}개)을 클리어하면 총 시간으로 전 세계 순위에 올라가요.\n순위는 아이폰 앱(게임 센터)에서 볼 수 있어요. (${done}/${order.length} 클리어)`);
}
window.openRanking = openRanking;

// 1시간이 넘을 수 있는 시간 표시 (h:mm:ss 또는 mm:ss)
function formatLongTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// 가로 슬라이드 공통: 터치 스와이프(기본) + 마우스 끌기 + 마우스 휠(세로→가로)
// 스테이지 카드 줄과 나라 버튼 줄에 적용
function enableHorizontalSlide(el) {
  if (!el) return;
  el.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, { passive: false });
  let down = false, startX = 0, startLeft = 0, moved = false;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false;
    startX = e.clientX; startLeft = el.scrollLeft;
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
  });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) moved = true;
    el.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    el.style.scrollSnapType = '';
    el.style.scrollBehavior = '';
  });
  // 끌어서 넘긴 경우에는 카드 클릭으로 처리하지 않음
  el.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
}
enableHorizontalSlide(document.getElementById('stage-grid'));
enableHorizontalSlide(document.getElementById('country-grid'));

// 스테이지 줄 좌우 화살표 (PC에서 넘길 수 있다는 걸 보여 줌)
// 카드를 슬라이드 가운데로
function centerCard(gridId, card, smooth = true) {
  const grid = document.getElementById(gridId);
  if (!grid || !card) return;
  const left = card.offsetLeft - (grid.clientWidth - card.offsetWidth) / 2;
  grid.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
}
function centerStageCard(mapKey, smooth = true) {
  centerCard('stage-grid', document.getElementById(`modal-map-${mapKey.toLowerCase()}`), smooth);
}

// 화살표: 카드 한 장씩 이동 (가운데 정렬 유지)
function slideGrid(gridId, dir) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const card = grid.querySelector('.stage-card');
  const step = card ? card.offsetWidth + parseFloat(getComputedStyle(grid).columnGap || 12) : grid.clientWidth * 0.8;
  grid.scrollBy({ left: dir * step, behavior: 'smooth' });
}
window.slideGrid = slideGrid;
const slideStages = dir => slideGrid('stage-grid', dir);
window.slideStages = slideStages;

// 시작 화면 스테이지 카드 (캠페인 순서, 잠김·클리어 표시)
function buildStageCards() {
  const grid = document.getElementById('stage-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const order = getCampaignOrder();
  order.forEach((key, i) => {
    const cfg = MAP_CONFIGS[key];
    const k = key.toLowerCase();
    const unlocked = isStageUnlocked(key);
    const cleared = isStageCleared(key);
    const btn = document.createElement('button');
    btn.id = `modal-map-${k}`;
    btn.className = 'stage-card' + (key === selectedModalMapKey ? ' active' : '') +
      (unlocked ? '' : ' locked') + (cleared ? ' cleared' : '');
    btn.onclick = (e) => {
      if (!unlocked) {
        const prev = MAP_CONFIGS[order[i - 1]];
        openSheet('', `${cfg.label} 잠김`, `${prev.label} 맵을 클리어하면 열려요.`);
        return;
      }
      selectModalMap(key);
    };
    btn.innerHTML = `<span class="stage-no">${i + 1}</span>` +
      `<canvas class="stage-thumb" id="thumb-${k}"></canvas>` +
      `<span class="stage-title"><span class="stage-name">${cfg.label || key}</span><span class="stage-sub">${cfg.count || ''}</span></span>` +
      `<span class="stage-recrow"><span class="stage-record" id="modal-${k}-record"></span>` +
      (cleared ? `<span class="map-rank-pct" id="rank-${k}"></span>` : '') + `</span>`;
    grid.appendChild(btn);
  });
  // 마지막 맵 다음 카드: 이 나라의 글로벌 순위 (총 시간)
  const total = getCampaignTotalTime();
  const allDone = order.every(isStageCleared);
  const rank = document.createElement('button');
  rank.id = 'ranking-card';
  rank.className = 'stage-card ranking-card' + (allDone ? '' : ' locked');
  rank.onclick = openRanking;
  // 총 시간은 화면 위쪽에 이미 있으므로 카드에는 순위만
  rank.innerHTML = `<span class="ranking-title">순위</span>` +
    (allDone ? `<span class="map-rank-pct" id="rank-total"></span>`
      : `<span class="ranking-time">${order.filter(isStageCleared).length}/${order.length}</span><span class="stage-sub">모든 맵 클리어 후 참여</span>`);
  grid.appendChild(rank);
  updateRecordDisplays();
  loadRankPercents();
  // 가로 슬라이드: 선택된(다음에 할) 스테이지가 보이도록 이동
  const sel = document.getElementById(`modal-map-${selectedModalMapKey.toLowerCase()}`);
  if (sel) requestAnimationFrame(() => { grid.scrollLeft = sel.offsetLeft - (grid.clientWidth - sel.offsetWidth) / 2; });
}

// 로고 5번 탭: (개발·테스트용) 모든 맵 열기/닫기
(function setupDevUnlock() {
  const logo = document.getElementById('start-logo');
  if (!logo) return;
  let taps = 0, timer = null;
  logo.addEventListener('click', () => {
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) {
      taps = 0;
      const on = !isDevUnlockAll();
      try { localStorage.setItem(DEV_UNLOCK_KEY, on ? '1' : '0'); } catch (e) {}
      renderStageThumbs();
      openSheet('', on ? '테스트: 모든 맵 열림' : '테스트: 잠금 복원',
        on ? '개발 확인용으로 모든 스테이지를 열었어요.' : '캠페인 잠금을 다시 적용했어요.');
    }
  });
})();

// -------------------------------------------------------------
// 튜토리얼 (처음 실행 시 자동, 홈의 '튜토리얼'로 다시 보기)
// -------------------------------------------------------------
const TUTORIAL_KEY = 'tapwar_tutorial_seen';
const TC = { b: '#edebe3', s: '#cfcdc4', blue: '#60a5fa', blueS: '#2563eb', red: '#f87171', redS: '#b91c1c', yel: '#fde047', grn2: '#22c55e', grnS: '#16a34a', wine: '#be123c' };
function hexPoints(x, y, r = 26) {
  return [0, 1, 2, 3, 4, 5].map(k => {
    const a = Math.PI / 3 * k + Math.PI / 6;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}
const hex = (x, y, fill, stroke = '#ffffff', w = 2) =>
  `<polygon points="${hexPoints(x, y)}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`;
const svgWrap = inner => `<svg viewBox="0 0 210 150" aria-hidden="true">${inner}</svg>`;
const orb = (x, y, c = TC.blueS) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;

// 튜토리얼 그림 애니메이션 (SVG SMIL, 모든 동작이 한 주기 D초로 반복)
const kt = arr => arr.map(v => +v.toFixed(4)).join(';');
// 시각 t(0~1)마다 값이 바뀌는 애니메이션: frames = [[t, value], ...] (0과 1 포함)
const animAttr = (attr, D, frames, discrete = false) =>
  `<animate attributeName="${attr}" dur="${D}s" repeatCount="indefinite" ${discrete ? 'calcMode="discrete"' : ''} ` +
  `keyTimes="${kt(frames.map(f => f[0]))}" values="${frames.map(f => f[1]).join(';')}"/>`;
// 색이 바뀌는 육각형
const hexAnim = (x, y, D, fills, stroke = '#ffffff', w = 2, r = 26) =>
  `<polygon points="${hexPoints(x, y, r)}" fill="${fills[0][1]}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round">` +
  animAttr('fill', D, fills, true) + `</polygon>`;
// t0~t1 동안 (x1,y1) → (x2,y2) 로 날아가는 구슬
const flyOrb = (x1, y1, x2, y2, t0, t1, D, c = TC.blueS) => {
  const e = 0.001;
  return `<circle r="4.5" fill="${c}" stroke="#fff" stroke-width="1.5" cx="${x1}" cy="${y1}" opacity="0">` +
    animAttr('cx', D, [[0, x1], [t0, x1], [t1, x2], [1, x2]]) +
    animAttr('cy', D, [[0, y1], [t0, y1], [t1, y2], [1, y2]]) +
    animAttr('opacity', D, [[0, 0], [Math.max(0, t0 - e), 0], [t0, 1], [t1, 1], [Math.min(1, t1 + e), 0], [1, 0]]) +
    `</circle>`;
};
// 탭할 때 퍼지는 물결
const tapRipple = (x, y, t, D) =>
  `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#1e293b" stroke-width="2.5" opacity="0">` +
  animAttr('r', D, [[0, 4], [t, 4], [Math.min(1, t + 0.12), 20], [1, 20]]) +
  animAttr('opacity', D, [[0, 0], [Math.max(0, t - 0.001), 0], [t, 0.7], [Math.min(1, t + 0.12), 0], [1, 0]]) + `</circle>`;
// 손가락 위치 (반투명 점): frames = [[t, x, y, opacity], ...]
const finger = (D, frames) =>
  `<circle r="9" fill="#1e293b" fill-opacity="0.35" stroke="#1e293b" stroke-opacity="0.5" stroke-width="1.5" cx="${frames[0][1]}" cy="${frames[0][2]}" opacity="0">` +
  animAttr('cx', D, frames.map(f => [f[0], f[1]])) + animAttr('cy', D, frames.map(f => [f[0], f[2]])) +
  animAttr('opacity', D, frames.map(f => [f[0], f[3]])) + `</circle>`;
// 아래에서 차오르는 파란 게이지 (t0~t1 동안 0 → 가득)
const riseFill = (id, x, y, t0, t1, D, color = TC.blue, r = 26) => {
  const top = y - r, h = r * 2;
  return `<clipPath id="${id}"><polygon points="${hexPoints(x, y, r)}"/></clipPath>` +
    `<rect x="${x - r}" y="${top + h}" width="${r * 2}" height="0" fill="${color}" clip-path="url(#${id})">` +
    animAttr('y', D, [[0, top + h], [t0, top + h], [t1, top], [0.97, top], [1, top + h]]) +
    animAttr('height', D, [[0, 0], [t0, 0], [t1, h], [0.97, h], [1, 0]]) + `</rect>`;
};

// 게이지 위에 다시 그리는 테두리 (색이 시간에 따라 바뀜)
const outlineAnim = (x, y, D, strokes, w = 2, r = 26) =>
  `<polygon points="${hexPoints(x, y, r)}" fill="none" stroke="${strokes[0][1]}" stroke-width="${w}" stroke-linejoin="round">` +
  animAttr('stroke', D, strokes, true) + `</polygon>`;

const TUTORIAL = [
  { title: '시작 지역 고르기',
    text: '지도를 확대·이동하며 둘러보고, 시작할 지역을 탭한 뒤 확인을 누르면 그곳이 내 기지가 돼요.',
    art: (() => { const D = 3;
      return svgWrap(hex(60, 70, TC.b, TC.s) + hex(150, 70, TC.b, TC.s) +
        hexAnim(105, 70, D, [[0, TC.b], [0.4, TC.yel], [1, TC.yel]], '#fff', 3) +
        finger(D, [[0, 175, 125, 0], [0.08, 175, 125, 1], [0.32, 105, 72, 1], [0.5, 105, 72, 1], [0.6, 105, 72, 0], [1, 105, 72, 0]]) +
        tapRipple(105, 72, 0.36, D)); })() },
  { title: '자동으로 넓혀요',
    text: '내 지역은 붙어 있는 땅을 자동으로 공격해요. 아래에서부터 파란색이 꽉 차면 내 땅이 돼요.',
    art: (() => { const D = 3.4;
      return svgWrap(hex(82, 75, TC.yel, '#fff', 3) +
        hexAnim(127, 75, D, [[0, TC.b], [0.82, TC.blue], [0.97, TC.blue], [1, TC.b]], TC.s) +
        riseFill('tut-r2', 127, 75, 0.05, 0.82, D) + outlineAnim(127, 75, D, [[0, TC.s], [0.82, TC.blueS], [0.97, TC.blueS], [1, TC.s]]) +
        [0.05, 0.2, 0.35, 0.5, 0.65].map(t => flyOrb(82, 75, 127, 75, t, t + 0.12, D)).join('')); })() },
  { title: '지정 공격',
    text: '내 지역을 꾹 눌러 맞닿은 곳으로 끌면 그곳을 공격해요. 내 땅으로 끌면 피를 채워 줘요.',
    art: (() => { const D = 3.6;
      return svgWrap(hex(60, 75, TC.blue, TC.blueS) + hex(105, 75, TC.blue, TC.blueS) +
        hexAnim(150, 75, D, [[0, TC.red], [0.88, TC.blue], [0.97, TC.blue], [1, TC.red]], TC.redS) +
        riseFill('tut-r3', 150, 75, 0.45, 0.88, D) + outlineAnim(150, 75, D, [[0, TC.redS], [0.88, TC.blueS], [0.97, TC.blueS], [1, TC.redS]]) +
        finger(D, [[0, 105, 75, 0], [0.06, 105, 75, 1], [0.16, 105, 75, 1], [0.36, 150, 75, 1], [0.44, 150, 75, 0], [1, 150, 75, 0]]) +
        `<line x1="105" y1="75" x2="105" y2="75" stroke="${TC.blueS}" stroke-width="3" stroke-dasharray="5 4" opacity="0">` +
          animAttr('x2', D, [[0, 105], [0.16, 105], [0.36, 146], [1, 146]]) +
          animAttr('opacity', D, [[0, 0], [0.15, 0], [0.16, 1], [0.44, 1], [0.5, 0], [1, 0]]) + `</line>` +
        [0.45, 0.58, 0.71].map(t => flyOrb(105, 75, 150, 75, t, t + 0.1, D)).join('')); })() },
  { title: '집중 포화',
    text: '아무 지역이나 두 번 탭하면 전선의 내 지역이 모두 그곳을 쏴요. 점령할 때까지 계속돼요.',
    // 파랑 2 · 빨강 2가 맞붙어 각자 앞의 적을 공격 → 빨강 하나를 두 번 탭 → 파랑 둘 다 그곳만 공격
    art: (() => { const D = 4.6;
      const B1 = [72, 52], B2 = [94.5, 91], R1 = [117, 52], R2 = [139.5, 91];
      return svgWrap(hex(B1[0], B1[1], TC.blue, TC.blueS) + hex(B2[0], B2[1], TC.blue, TC.blueS) +
        hex(R2[0], R2[1], TC.red, TC.redS) +
        hexAnim(R1[0], R1[1], D, [[0, TC.red], [0.9, TC.blue], [0.97, TC.blue], [1, TC.red]], TC.redS) +
        riseFill('tut-r4', R1[0], R1[1], 0.55, 0.9, D) +
        outlineAnim(R1[0], R1[1], D, [[0, TC.redS], [0.47, '#1e293b'], [0.53, TC.redS], [0.9, TC.blueS], [0.97, TC.blueS], [1, TC.redS]], 2.5) +
        // 1) 각자 공격: 파랑1 → 빨강1, 파랑2 → 빨강2
        [0.02, 0.14, 0.26].map(t => flyOrb(B1[0], B1[1], R1[0], R1[1], t, t + 0.08, D) + flyOrb(B2[0], B2[1], R2[0], R2[1], t + 0.04, t + 0.12, D)).join('') +
        // 2) 빨강1 두 번 탭
        finger(D, [[0, 175, 135, 0], [0.3, 175, 135, 0], [0.34, 175, 135, 1], [0.42, R1[0], R1[1] + 2, 1], [0.54, R1[0], R1[1] + 2, 1], [0.6, R1[0], R1[1] + 2, 0], [1, R1[0], R1[1] + 2, 0]]) +
        tapRipple(R1[0], R1[1] + 2, 0.44, D) + tapRipple(R1[0], R1[1] + 2, 0.51, D) +
        // 3) 파랑 둘 다 빨강1만 공격
        [0.56, 0.66, 0.76].map(t => flyOrb(B1[0], B1[1], R1[0], R1[1], t, t + 0.08, D) + flyOrb(B2[0], B2[1], R1[0], R1[1], t + 0.03, t + 0.11, D)).join('')); })() },
  { title: '완전 점령',
    text: '이웃을 모두 차지하면 초록색이 되고 게이지가 차올라요. 게이지가 다 차서 진한 초록이 되면 원거리 공격이 가능해져요.',
    art: (() => { const D = 5, cx = 70, cy = 75;
      // 가운데 지역을 둘러싼 이웃 6곳이 하나씩 내 땅이 되고 → 가운데가 초록 → 먼 곳으로 원거리 공격
      const ring = [[cx + 45, cy], [cx + 22.5, cy - 39], [cx - 22.5, cy - 39], [cx - 45, cy], [cx - 22.5, cy + 39], [cx + 22.5, cy + 39]];
      return svgWrap(ring.map(([x, y], i) => hexAnim(x, y, D, [[0, TC.b], [0.06 + i * 0.07, TC.blue], [0.97, TC.blue], [1, TC.b]], TC.blueS)).join('') +
        hexAnim(cx, cy, D, [[0, TC.blue], [0.46, '#bbf7d0'], [0.97, '#bbf7d0'], [1, TC.blue]], '#ffffff', 3) +
        riseFill('tut-r5', cx, cy, 0.46, 0.66, D, TC.grn2) + outlineAnim(cx, cy, D, [[0, '#ffffff'], [1, '#ffffff']], 3) +
        `<polygon points="${hexPoints(185, 40, 17)}" fill="${TC.red}" stroke="${TC.redS}" stroke-width="2" stroke-linejoin="round"/>` +
        [0.7, 0.8, 0.9].map(t => flyOrb(cx, cy, 185, 40, t, t + 0.07, D, TC.grnS)).join('')); })() },
  { title: '적 기지를 무너뜨려요',
    text: '적 지역을 모두 점령하면 승리!',
    art: (() => { const D = 3.6;
      return svgWrap(hex(60, 75, TC.yel, '#fff', 3) + hex(105, 75, TC.blue, TC.blueS) +
        hexAnim(150, 75, D, [[0, TC.wine], [0.85, TC.blue], [0.97, TC.blue], [1, TC.wine]], '#fff', 3) +
        riseFill('tut-r6', 150, 75, 0.1, 0.85, D) + outlineAnim(150, 75, D, [[0, '#ffffff'], [0.85, TC.blueS], [0.97, TC.blueS], [1, '#ffffff']], 3) +
        [0.1, 0.25, 0.4, 0.55, 0.7].map(t => flyOrb(105, 75, 150, 75, t, t + 0.1, D)).join('')); })() }
];
let tutorialIndex = 0;

function renderTutorial() {
  const t = TUTORIAL[tutorialIndex];
  document.getElementById('tut-art').innerHTML = t.art;
  document.getElementById('tut-title').textContent = t.title;
  document.getElementById('tut-text').textContent = t.text;
  document.getElementById('tut-dots').innerHTML = TUTORIAL.map((_, i) => `<i class="${i === tutorialIndex ? 'on' : ''}"></i>`).join('');
  document.getElementById('tut-prev').disabled = tutorialIndex === 0;
  document.getElementById('tut-next').textContent = tutorialIndex === TUTORIAL.length - 1 ? '시작하기' : '다음';
}
function openTutorial() {
  tutorialIndex = 0;
  renderTutorial();
  document.getElementById('tutorial').style.display = 'flex';
}
function closeTutorial() {
  document.getElementById('tutorial').style.display = 'none';
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {}
}
function tutorialStep(d) {
  const n = tutorialIndex + d;
  if (n >= TUTORIAL.length) { closeTutorial(); return; }
  tutorialIndex = Math.max(0, n);
  renderTutorial();
}
window.openTutorial = openTutorial;
window.closeTutorial = closeTutorial;
window.tutorialStep = tutorialStep;

function renderStageThumbs() {
  buildStageCards();
  updateStageProgress();
  Object.keys(MAP_CONFIGS).forEach(key => drawMapThumb(document.getElementById(`thumb-${key.toLowerCase()}`), key));
}
// 맵 썸네일: 맵 모양을 캔버스에 단색으로
function drawMapThumb(c, key) {
  if (!c) return;
  const keys = Object.keys(MAP_CONFIGS);
  {
    fetch(MAP_CONFIGS[key].file).then(r => r.json()).then(data => {
      const dpr = window.devicePixelRatio || 1;
      const size = c.clientWidth || 96;
      c.width = size * dpr;
      c.height = size * dpr;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      data.zones.forEach(z => z.polygons.forEach(r => r.forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      })));
      const kx = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
      const w = (maxX - minX) * kx, h = maxY - minY;
      const pad = 6 * dpr;
      const sc = Math.min((c.width - pad * 2) / w, (c.height - pad * 2) / h);
      const ox = (c.width - w * sc) / 2, oy = (c.height - h * sc) / 2;
      const g = c.getContext('2d');
      const path = new Path2D();
      data.zones.forEach(z => z.polygons.forEach(r => {
        r.forEach(([x, y], i) => {
          const px = ox + (x - minX) * kx * sc, py = oy + (maxY - y) * sc;
          if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
        });
        path.closePath();
      }));
      const color = THUMB_PALETTE[keys.indexOf(key) % THUMB_PALETTE.length];
      g.fillStyle = color;
      g.strokeStyle = color;
      g.lineWidth = 2 * dpr;
      g.lineJoin = 'round';
      g.fill(path);
      g.stroke(path);
    }).catch(() => {});
  }
}
// -------------------------------------------------------------
// 시작 연출: 지구본이 돌며 한국으로 다가간 뒤 선택한 맵 범위까지 확대 → 게임 지도로 전환
// (화면을 탭하면 건너뜀, '동작 줄이기' 설정 시 생략)
// -------------------------------------------------------------
const INTRO_SPIN_MS = 1100;
const INTRO_ZOOM_MS = 2100;
const INTRO_FADE_FROM = 0.72; // 확대 구간의 이 지점부터 게임 지도로 서서히 전환
let worldLand = null;
let introAnim = null;
// world: Natural Earth 110m 육지, korea: 우리 전국 맵을 합친 한국 윤곽(제주도 등 섬 포함)
fetch('assets/world_land.json').then(r => r.json()).then(d => {
  worldLand = Array.isArray(d) ? d : d.world.concat(d.korea || []);
}).catch(() => {});

// 두 색(#rrggbb) 사이 보간
function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (v, sh) => (v >> sh) & 255;
  const m = sh => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

function startIntroZoom(mapKey) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cfg = MAP_CONFIGS[mapKey];
  if (reduce || !cfg || !cfg.bounds || !worldLand) return;
  const b = cfg.bounds;
  introAnim = {
    start: performance.now(),
    lon: (b.minLng + b.maxLng) / 2,
    lat: (b.minLat + b.maxLat) / 2,
    dLat: b.maxLat - b.minLat,
    // 우주 배경 별 (화면 비율 좌표)
    stars: Array.from({ length: 140 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.6 + 0.4, p: Math.random() * Math.PI * 2
    })),
    // 확대할 때 헤치고 지나가는 구름 (각도·거리·등장 시점·크기)
    clouds: Array.from({ length: 26 }, () => ({
      ang: Math.random() * Math.PI * 2, d0: Math.random() * 0.35 + 0.05,
      t0: Math.random() * 0.55 + 0.05, size: Math.random() * 0.5 + 0.6, puffs: Math.floor(Math.random() * 3) + 3,
      seed: Math.random() * 1000
    }))
  };
}

// 확대 중 구름: 화면 가운데에서 바깥으로 커지며 스쳐 지나감 (t: 확대 진행 0~1)
function drawIntroClouds(ctx, t, W, H, cx, cy) {
  const span = 0.32; // 구름 하나가 지나가는 시간(확대 구간 비율)
  const diag = Math.hypot(W, H);
  introAnim.clouds.forEach(c => {
    const k = (t - c.t0) / span;
    if (k <= 0 || k >= 1) return;
    const dist = (c.d0 + Math.pow(k, 2.2) * 1.1) * diag * 0.6;
    const x = cx + Math.cos(c.ang) * dist, y = cy + Math.sin(c.ang) * dist;
    const size = c.size * diag * (0.06 + k * k * 0.5);
    const alpha = Math.sin(k * Math.PI) * 0.85;
    for (let i = 0; i < c.puffs; i++) {
      const a2 = c.seed + i * 2.1;
      const px = x + Math.cos(a2) * size * 0.45, py = y + Math.sin(a2) * size * 0.3;
      const pr = size * (0.55 + ((c.seed * (i + 1)) % 1) * 0.35);
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // 구름 속을 지날 때 화면 전체가 살짝 하얗게
  const haze = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.15) / 0.6)) * Math.PI)) * 0.35;
  if (haze > 0) {
    ctx.fillStyle = `rgba(255,255,255,${haze})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function skipIntro() {
  introAnim = null;
}

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// 육지 윤곽 한 개를 정사영으로 그림: 지구 뒤편으로 넘어가는 구간은 직선이 아니라
// 지평선(원 둘레)을 따라가게 해서, 확대 시 바다 위에 땅 색이 잘못 칠해지지 않게 함
function traceOrthoRing(ctx, ring, lon0, lat0, R, cx, cy) {
  const d2r = Math.PI / 180;
  const φ0 = lat0 * d2r, λ0 = lon0 * d2r;
  const sφ0 = Math.sin(φ0), cφ0 = Math.cos(φ0);
  let started = false, prevHidden = false, prevAng = 0, anyVisible = false;
  for (let j = 0; j < ring.length; j++) {
    const φ = ring[j][1] * d2r, dλ = ring[j][0] * d2r - λ0;
    const cφ = Math.cos(φ), sφ = Math.sin(φ), cdl = Math.cos(dλ);
    const cosc = sφ0 * sφ + cφ0 * cφ * cdl;
    const x = cφ * Math.sin(dλ);
    const y = cφ0 * sφ - sφ0 * cφ * cdl;
    if (cosc >= 0) {
      anyVisible = true;
      const px = cx + x * R, py = cy - y * R;
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
      prevHidden = false;
    } else {
      const ang = Math.atan2(-y, x); // 화면 좌표계 기준 지평선 각도
      if (!started) {
        ctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
        started = true;
      } else if (prevHidden) {
        let d = ang - prevAng;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        ctx.arc(cx, cy, R, prevAng, prevAng + d, d < 0);
      } else {
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      }
      prevHidden = true;
      prevAng = ang;
    }
  }
  if (started) ctx.closePath();
  return anyVisible;
}

// 정사영(orthographic) 투영: 지구 뒤편 점은 지평선(원 둘레)으로 붙임
function orthoProject(lon, lat, lon0, lat0, R, cx, cy) {
  const d2r = Math.PI / 180;
  const φ = lat * d2r, λ = lon * d2r, φ0 = lat0 * d2r, λ0 = lon0 * d2r;
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  let x = Math.cos(φ) * Math.sin(λ - λ0);
  let y = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  if (cosc < 0) {
    const n = Math.hypot(x, y) || 1;
    x /= n; y /= n;
  }
  return [cx + x * R, cy - y * R];
}

// 반환값: 게임 지도 위에 덮을 인트로 불투명도 (0이면 종료)
function drawIntro(ctx) {
  if (!introAnim) return;
  const W = viewW, H = viewH;
  const el = performance.now() - introAnim.start;
  const area = getMapArea();
  const R0 = Math.min(W, H) * 0.36;
  const Rf = area.h / (introAnim.dLat * Math.PI / 180);
  let R, lon0, lat0, alpha = 1, seaBlend = 0, zoomT = -1;

  if (el < INTRO_SPIN_MS) {
    const t = easeInOut(el / INTRO_SPIN_MS);
    lon0 = introAnim.lon - 110 * (1 - t);
    lat0 = introAnim.lat * t;
    R = R0;
  } else {
    const t = Math.min(1, (el - INTRO_SPIN_MS) / INTRO_ZOOM_MS);
    zoomT = t;
    const e = easeInOut(t);
    lon0 = introAnim.lon;
    lat0 = introAnim.lat;
    R = R0 * Math.pow(Rf / R0, e);
    // 확대될수록 바다색을 게임 지도 바탕색으로 서서히 바꿔, 지도로 넘어갈 때 번쩍이지 않게 함
    seaBlend = Math.min(1, Math.max(0, (t - 0.35) / (INTRO_FADE_FROM - 0.35)));
    if (t > INTRO_FADE_FROM) alpha = 1 - (t - INTRO_FADE_FROM) / (1 - INTRO_FADE_FROM);
    if (t >= 1) {
      introAnim = null;
      return;
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  const cx = W / 2, cy = area.y + area.h / 2;
  // 우주 배경: 짙은 남색 그라데이션 + 반짝이는 별
  const space = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.7);
  space.addColorStop(0, '#16213e');
  space.addColorStop(1, '#05070f');
  ctx.fillStyle = space;
  ctx.fillRect(0, 0, W, H);
  const tw = performance.now() / 600;
  introAnim.stars.forEach(st => {
    ctx.globalAlpha = alpha * st.a * (0.65 + 0.35 * Math.sin(tw + st.p));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = alpha;
  // 대기권 빛 (지구 둘레의 푸른 테)
  if (R < Math.hypot(W, H)) {
    const glow = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.12);
    glow.addColorStop(0, 'rgba(125, 200, 255, 0.55)');
    glow.addColorStop(1, 'rgba(125, 200, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    ctx.fill();
  }
  // 바다 (지구가 화면보다 훨씬 커지면 원 대신 화면 전체를 칠함: 거대한 원 그리기에서 생기는 깜빡임 방지)
  const seaColor = mixColor('#bfe5fa', '#f6f5f0', seaBlend);
  const huge = R > Math.hypot(W, H) * 2;
  ctx.beginPath();
  if (huge) ctx.rect(0, 0, W, H);
  else ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = seaColor;
  ctx.fill();
  // 육지
  ctx.save();
  ctx.clip();
  const landPath = new Path2D();
  for (let i = 0; i < worldLand.length; i++) {
    // 화면에 보이는 점이 없는 윤곽(지구 뒤편 전체)은 그리지 않음
    const sub = new Path2D();
    if (traceOrthoRing(sub, worldLand[i], lon0, lat0, R, cx, cy)) landPath.addPath(sub);
  }
  ctx.fillStyle = '#edebe3';
  ctx.fill(landPath);
  ctx.strokeStyle = '#cfcdc4';
  ctx.lineWidth = 1;
  ctx.stroke(landPath);
  // 목표 지점 표시 (노란 점)
  const [tx, ty] = orthoProject(introAnim.lon, introAnim.lat, lon0, lat0, R, cx, cy);
  ctx.beginPath();
  ctx.arc(tx, ty, 5, 0, Math.PI * 2);
  ctx.fillStyle = ZONE_COLORS.main;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  if (zoomT >= 0) drawIntroClouds(ctx, zoomT, W, H, cx, cy);
  ctx.restore();
}

// Render Loop
let lastTime = 0;
let lastWinCheckTime = 0;
function gameLoop(timestamp) {
  try {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    updateSurrenderButtonVisibility();
    updateHomeButtonVisibility();
    updateHudVisibility();

    if (currentState === GAME_STATE.PLAYING) {
      // 작전 소요 시간 측정 (스톱워치 기록계, 배속 연동)
      gameElapsedTime += dt * gameSpeed;
      const timerStr = formatTimeString(gameElapsedTime);
      if (timerStr !== lastTimerText) {
        lastTimerText = timerStr;
        const timerEl = document.getElementById('match-timer');
        if (timerEl) {
          timerEl.innerText = timerStr;
          timerEl.style.color = '#b45309';
        }
      }

      updateAI(timestamp);
      updateOrbSpawners(timestamp);
      updateSpecialSkillHUD(dt);
      updateCountryEvent();
      updateItems();
      updateParticles();
      updateFocusRings();

      // 집중포화 5초 쿨타임 갱신 (배속 연동)
      if (focusFireCooldown > 0) {
        focusFireCooldown = Math.max(0, focusFireCooldown - dt * gameSpeed);
      }

      // 적군 쿨타임 및 피격 경보 타이머 갱신 (배속 연동)
      if (enemySpecialSkillCooldown > 0) {
        enemySpecialSkillCooldown = Math.max(0, enemySpecialSkillCooldown - dt * gameSpeed);
      }
      if (enemyFocusFireCooldown > 0) {
        enemyFocusFireCooldown = Math.max(0, enemyFocusFireCooldown - dt * gameSpeed);
      }
      if (enemyFocusReticleTimer > 0) {
        enemyFocusReticleTimer = Math.max(0, enemyFocusReticleTimer - dt * gameSpeed);
      }

      // 승리/패배 조건 주기적 체크 (250ms 주기)
      if (!lastWinCheckTime || timestamp - lastWinCheckTime > 250) {
        lastWinCheckTime = timestamp;
        checkWinConditions();
      }

      resolveOrbCollisions();
      for (let i = flyingOrbs.length - 1; i >= 0; i--) {
        const orb = flyingOrbs[i];
        if (!orb || orb.isDead || orb.update()) {
          flyingOrbs.splice(i, 1);
        }
      }
    }

    // Camera Matrix
    ctx.save();
    const cx = viewW / 2;
    const cy = viewH / 2;
    const shake = quakeShakeOffset();
    ctx.translate(cx + view.offsetX + shake.x, cy + view.offsetY + shake.y);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-cx, -cy);

    drawExactDistrictsMap(ctx);
    drawMapTitle(ctx);
    drawCountryEventMarks(ctx);
    drawTank(ctx);
    drawFocusRings(ctx);
    drawFlyingOrbs(ctx);
    drawParticles(ctx);

    ctx.restore();

    drawIntro(ctx);
    drawMinimap(timestamp);
  } catch (err) {
    console.error('gameLoop error:', err);
  } finally {
    requestAnimationFrame(gameLoop);
  }
}

resizeCanvas();
requestAnimationFrame(gameLoop);

// 홈 화면 초기화: 다음에 할 스테이지 선택, 처음 실행이면 튜토리얼
selectedModalMapKey = getNextStageKey();
renderStageThumbs();
selectModalMap(selectedModalMapKey);
buildCountryCards();

function maybeOpenTutorial() {
  try { if (localStorage.getItem(TUTORIAL_KEY) !== '1') openTutorial(); } catch (e) { openTutorial(); }
}

// 앱 첫 실행: TAPWAR 가 가운데에서 한 글자씩 타이핑된 뒤 홈(국가 고르기)으로.
// 게임을 마치고 홈으로 돌아온 경우(같은 세션)에는 연출 없이 그 국가의 도시 맵 화면으로.
(function startHome() {
  const splash = document.getElementById('splash');
  let returning = null;
  try { returning = sessionStorage.getItem('tapwar_in_country'); } catch (e) {}
  if (returning && COUNTRIES.some(c => c.key === returning && isCountryOpen(c))) {
    if (splash) splash.remove();
    selectedCountryKey = returning;
    buildCountryCards();
    let auto = null;
    try { auto = sessionStorage.getItem('tapwar_autostart_map'); sessionStorage.removeItem('tapwar_autostart_map'); } catch (e) {}
    if (auto && MAP_CONFIGS[auto] && isStageUnlocked(auto)) {
      selectedModalMapKey = auto;
      showStageView();
      startWhenMapLoaded(auto);
      return;
    }
    // 맵이 하나뿐인 나라는 맵 화면 없이 나라 고르기로
    if (getCampaignOrder(returning).length === 1) {
      requestAnimationFrame(() => selectCountry(returning));
      maybeOpenTutorial();
      return;
    }
    showStageView();
    maybeOpenTutorial();
    return;
  }
  requestAnimationFrame(() => selectCountry(selectedCountryKey));
  const textEl = document.getElementById('splash-text');
  if (!splash || !textEl) { maybeOpenTutorial(); return; }
  const word = 'TAPWAR';
  let i = 0;
  const typeNext = () => {
    textEl.textContent = word.slice(0, ++i);
    if (i < word.length) { setTimeout(typeNext, 140); return; }
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => { splash.remove(); maybeOpenTutorial(); }, 450);
    }, 650);
  };
  setTimeout(typeNext, 300);
})();
