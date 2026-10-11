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
  ENEMY: 'enemy'
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
  enemyFocusCooldown: 8.0,      // 적 집중포화 쿨타임 (8초)
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
// 아군 집중포화 구역 목록 (중복 가능, 지정한 순서대로. 마지막이 최신)
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

const MAIN_ZONE_POWER = 2; // 메인 지역 구슬 공격력
const MAIN_ZONE_HP = 400;   // 메인 지역 피 (일반 지역 50). 처음부터 메인을 노리기보다 주변을 먼저 공략하도록

function isMainZone(zone) {
  return (zone === playerMainZone && zone.owner === OWNER.PLAYER) ||
         (zone === enemyMainZone && zone.owner === OWNER.ENEMY);
}

// 특수 기술을 쓴 완전점령 지역은 공격 제한이 풀려 메인 지역처럼 싸움:
// 공격력 2, 맞닿은 목표가 없으면 전선 원거리 공격, 지정 공격·집중 포화 참여 (특수 기술 면역은 메인만)
// 지역을 잃으면(중립이 되면) 해제
// [실험] 특수 기술 없음: 완전점령 지역은 곧바로 메인처럼 공격 (원거리 + 공격력 2).
// 충전 게이지·번쩍임 표시는 그대로. false 로 바꾸면 특수 기술 버전으로 돌아감 (저장본: save/special-skill 브랜치)
const EXPERIMENT_NO_SKILL = true;
const FULL_ZONE_HP = 100; // [실험] 완전점령 지역 피
const EXP_MAIN_POWER = 5;   // [실험] 메인 지역 공격력 (완전점령 지역은 1)

// 원거리 공격(맞닿지 않은 지역 공격) 가능 여부
// [실험] 완전점령 지역만 원거리 가능 (메인도 완전점령이어야 원거리). 일반 지역·메인은 맞닿은 곳만
function canRangeAttack(zone) {
  if (EXPERIMENT_NO_SKILL) return zone.owner !== OWNER.NEUTRAL && isFullyConquered(zone);
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
  JEJU: { name: '제주', label: '제주', count: 43, file: 'assets/jeju_zones.json', maxScale: 8 }
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
  // [실험] 지시(지정 공격·집중 포화)가 없으면 원거리 가능 지역도 맞닿은 곳만 자동 공격 (힘겨루기).
  // 맞닿은 공격 대상이 없는 완전점령 지역은 지시가 있을 때만 원거리로 쏨
  if (EXPERIMENT_NO_SKILL) return pickAdjacentTarget(zone);
  if (canRangeAttack(zone)) {
    return pickAdjacentTarget(zone) || pickMainZoneFrontierTarget(zone);
  }
  if (isFullyConquered(zone)) return null;
  return pickAdjacentTarget(zone);
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

    this.x = sourceZone.cx;
    this.y = sourceZone.cy;
    
    const dx = targetZone.cx - sourceZone.cx;
    const dy = targetZone.cy - sourceZone.cy;
    this.dist = Math.hypot(dx, dy);
    this.speed = (this.owner === OWNER.PLAYER) ? baseOrbSpeed : ENEMY_CONFIG.enemyOrbSpeed;
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
    applyOrbHit(this.targetZone, this.owner, this.power, this.sourceZone);
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

  // 1. Draw Player Orbs (Solid Cobalt Blue + Clean White Border)
  ctx.save();
  ctx.fillStyle = '#2563eb';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2 * k;
  ctx.beginPath();
  let pCount = 0;
  for (let i = 0; i < flyingOrbs.length; i++) {
    const orb = flyingOrbs[i];
    if (!orb.isDead && orb.owner === OWNER.PLAYER) {
      const r = (orb.power > 1 ? 4.5 : 3.2) * k;
      ctx.moveTo(orb.x + r, orb.y);
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      pCount++;
    }
  }
  if (pCount > 0) {
    ctx.fill();
    ctx.stroke();
  }

  // 2. Draw Enemy Orbs (Solid Vermilion Red + Clean White Border)
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  let eCount = 0;
  for (let i = 0; i < flyingOrbs.length; i++) {
    const orb = flyingOrbs[i];
    if (!orb.isDead && orb.owner === OWNER.ENEMY) {
      const r = (orb.power > 1 ? 4.5 : 3.2) * k;
      ctx.moveTo(orb.x + r, orb.y);
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      eCount++;
    }
  }
  if (eCount > 0) {
    ctx.fill();
    ctx.stroke();
  }
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
  conqueredZone.owner = newOwner;
  conqueredZone.maxOrbs = ZONE_MAX_HP; // 함락된 메인은 메인 지위를 잃고 일반 지역(피 50)이 됨
  conqueredZone.orbs = conqueredZone.maxOrbs; // Full garrison upon capture
  conqueredZone.claimant = null;
  conqueredZone.protectedUntil = gameElapsedTime + CAPTURE_PROTECT_SEC;
  flashZone(conqueredZone, newOwner === OWNER.PLAYER ? ZONE_COLORS.playerStroke : ZONE_COLORS.enemyStroke);

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

  // Configure enemy buffs based on standard config
  enemyBuffs.interval = ENEMY_CONFIG.enemyInterval;
  enemyBuffs.powerLevel = 0;
  gameElapsedTime = 0;
  lastTimerText = '';

  currentState = GAME_STATE.PLAYING;
  document.getElementById('status-guide').innerText = `${zone.name} 기지 확보! 작전 개시! (적 전면 섬멸 작전)`;
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
  speed2: { title: '×2 배속', text: '게임을 2배 빠르게 진행해요.\n한 번 구매하면 모든 맵에서 계속 쓸 수 있어요.' }
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
function onSpeed2Click() {
  if (!isOwned('speed2')) {
    openPurchase('speed2');
    return;
  }
  setGameSpeed(gameSpeed === 2 ? 1 : 2);
  document.getElementById('speed2-btn').classList.toggle('on', gameSpeed === 2);
}
window.onSpeed2Click = onSpeed2Click;

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

  // [규칙]: 집중포화는 여러 곳 중복 가능. 이전 집중포화는 유지되고,
  // 완전점령(원거리) 지역은 가장 마지막에 지정한 곳으로, 그 외 지역은 맞닿은 집중포화 구역 중 최신 곳으로 사격

  // 새 집중 포화: 이전에 드래그로 빠졌던 지역도 모두 다시 참여
  rawZones.forEach(z => { z.focusOptOut = false; });
  addPlayerFocus(targetZone);
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
  if (targetZone && !isFullFriendly && targetZone.id === lastTapZoneId && (now - lastTapTime) < 380) {
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
        // [집중 포화 중 지정 공격]: 다른 지역을 지정하면 이 지역만 집중 포화에서 빠짐 (여러 지역 중복 가능)
        dragSourceZone.focusOptOut = playerFocusList.length > 0 && !playerFocusList.includes(endZone);
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
function triggerEnemyFocusFire() {
  if (currentState !== GAME_STATE.PLAYING) return;
  if (enemyFocusFireCooldown > 0) return;

  // 완전점령지역이 아닌 전선 교전 중인 적 거점들
  const activeEnemyZones = rawZones.filter(z => z.owner === OWNER.ENEMY && (!isFullyConquered(z) || isUnleashed(z)));
  if (activeEnemyZones.length === 0) return;

  // 적 거점과 맞닿은 아군 거점 중 완전점령되지 않은 거점 우선 탐색
  const candidates = [];
  activeEnemyZones.forEach(eZone => {
    eZone.neighbors.forEach(n => {
      if (n.owner === OWNER.PLAYER && !isFullyConquered(n) && !candidates.includes(n)) {
        candidates.push(n);
      }
    });
  });

  // 인접 아군 거점이 없으면 인접한 미점령(중립) 거점도 타겟
  if (candidates.length === 0) {
    activeEnemyZones.forEach(eZone => {
      eZone.neighbors.forEach(n => {
        if (n.owner === OWNER.NEUTRAL && !candidates.includes(n)) {
          candidates.push(n);
        }
      });
    });
  }

  if (candidates.length === 0) return;

  // 체력이 낮거나 전선에 노출된 취약 거점 우선 타겟
  candidates.sort((a, b) => a.orbs - b.orbs);
  const target = candidates[0];

  enemyFocusFireCooldown = ENEMY_CONFIG.enemyFocusCooldown;
  currentEnemyFocusZone = target;
  enemyFocusReticleTimer = 3.5;

  // 해당 타겟을 향해 출격 가능한 적 전선 기지들
  const firingBases = activeEnemyZones.filter(e => e.neighbors.includes(target) || (canRangeAttack(e) && canAttackTarget(e, target) && Math.random() < 0.45));
  if (firingBases.length === 0) return;

  // 적군도 동일 규칙: 즉시 추가 발사 없이 점령할 때까지 고정 사격
  firingBases.forEach(eZone => {
    eZone.isManualTarget = true;
    eZone.targetZones = [target];
  });
  flashZone(target, ZONE_COLORS.enemyStroke); // 적 집중 포화 목표 번쩍

  document.getElementById('status-guide').innerText = `[적군 집중포화 경보!]: 적 기지 ${firingBases.length}곳에서 [${target.name}]에 일제 사격을 개시했습니다!`;
}

// AI Expansion Engine
let lastAiDecisionTime = 0;
function updateAI(currentTime) {
  const decisionInterval = ENEMY_CONFIG.enemyDecisionInterval / gameSpeed;
  if (currentTime - lastAiDecisionTime < decisionInterval) return;
  lastAiDecisionTime = currentTime;

  // 1. 적군 특수 기술 사용 검토 (충전된 완전점령 지역이 있을 때)
  useEnemySpecialSkill();

  // 2. 적군 집중포화 사용 검토 (쿨타임 완료 시 아군 거점에 일제 사격)
  triggerEnemyFocusFire();

  // 3. 일반 전선 전진 및 재배치
  const enemyZones = rawZones.filter(z => z.owner === OWNER.ENEMY);
  enemyZones.forEach(eZone => {
    // Never stop or get stuck if NOT fully conquered!
    if (isFullyConquered(eZone) && !isUnleashed(eZone)) {
      eZone.targetZones = [];
      return;
    }

    if (eZone.targetZones.length === 0 || eZone.targetZones.every(t => t.owner === OWNER.ENEMY)) {
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

  // 완전점령 1개당 100ms(0.1초) 단축, 최소 500ms(0.5초) 한계
  const playerBaseInterval = Math.max(500, playerBuffs.interval - playerFullCount * 100);
  const enemyBaseInterval = Math.max(500, enemyBuffs.interval - enemyFullCount * 100);

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
    const interval = baseInterval / gameSpeed; // 2배속, 4배속 시 생성 간격 단축!

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

      zone.targetZones.forEach(target => {
        flyingOrbs.push(new FlyingOrb(zone, target, zone.owner, power));
      });
    }
  });
}


function checkWinConditions(isTimeUp = false) {
  if (currentState !== GAME_STATE.PLAYING) return;

  const pCount = rawZones.filter(z => z.owner === OWNER.PLAYER).length;
  const eCount = rawZones.filter(z => z.owner === OWNER.ENEMY).length;
  const neutralCount = rawZones.filter(z => z.owner === OWNER.NEUTRAL && !z.isHidden).length;

  const pFull = rawZones.filter(z => z.owner === OWNER.PLAYER && isFullyConquered(z)).length;
  const eFull = rawZones.filter(z => z.owner === OWNER.ENEMY && isFullyConquered(z)).length;

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
  try {
    if (nextStageAfterWin) sessionStorage.setItem('tapwar_autostart_map', nextStageAfterWin);
    sessionStorage.setItem('tapwar_in_country', selectedCountryKey || 'KR');
  } catch (e) {}
  location.reload();
}
window.goNextStage = goNextStage;

function gameOver(isWin, isSurrender = false) {
  currentState = GAME_STATE.GAME_OVER;
  const toast = document.getElementById('center-toast');
  if (toast) toast.classList.remove('show');
  const modal = document.getElementById('end-modal');
  const title = document.getElementById('end-title');
  const desc = document.getElementById('end-message');
  const timeStr = formatTimeString(gameElapsedTime);
  const mapName = MAP_CONFIGS[currentMapKey] ? MAP_CONFIGS[currentMapKey].name : currentMapKey;
  
  const nextBtn = document.getElementById('end-next-btn');
  if (nextBtn) nextBtn.hidden = true;

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
      (recordResult.isNewBest ? `<div class="end-best new">최고 기록</div>` : `<div class="end-best">최고 기록 ${bestStr}</div>`);

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
  enemyMainCharged: '#881337'
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
  const isMyMain = isPlayer && zone === playerMainZone;
  const hpRatio = zone.orbs / zone.maxOrbs;
  const chargeRatio = zone.chargeState === 'ready' ? 1 : (zone.chargeState === 'charging' ? zone.chargeTime / SKILL_CHARGE_SEC : 0);

  if (zone.owner === OWNER.NEUTRAL) {
    const gauge = zone.claimant === OWNER.PLAYER ? ZONE_COLORS.player : ZONE_COLORS.enemy;
    return { base: ZONE_COLORS.base, gauge, ratio: zone.claimant ? hpRatio : 0, stroke: ZONE_COLORS.baseStroke, width: 1.0 };
  }
  const isEnemyMain = zone.owner === OWNER.ENEMY && zone === enemyMainZone;
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
  const isAnyMain = z => (z === playerMainZone && z.owner === OWNER.PLAYER) || (z === enemyMainZone && z.owner === OWNER.ENEMY);
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
  { key: 'JP', flag: '🇯🇵', name: '일본', open: false },
  { key: 'CN', flag: '🇨🇳', name: '중국', open: false },
  { key: 'US', flag: '🇺🇸', name: '미국', open: false },
  { key: 'EU', flag: '🇪🇺', name: '유럽', open: false }
];
const DEV_UNLOCK_KEY = 'tapwar_dev_unlock_all';

// 대한민국 캠페인 순서: 구역 수가 적은 맵부터 (같으면 MAP_CONFIGS 순서)
function getCampaignOrder() {
  const keys = Object.keys(MAP_CONFIGS);
  return keys.slice().sort((a, b) => (MAP_CONFIGS[a].count - MAP_CONFIGS[b].count) || (keys.indexOf(a) - keys.indexOf(b)));
}

function isDevUnlockAll() {
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
    b.className = 'stage-card country-card' + (c.key === selectedCountryKey ? ' active' : '') + (c.open ? '' : ' locked');
    b.innerHTML = `<span class="country-flag" aria-hidden="true">${c.flag}</span><span class="stage-name">${c.name}</span>`;
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
  if (btn) btn.classList.toggle('locked', !c.open);
}

// 참전하기: 열린 국가면 도시 맵 화면으로, 잠긴 국가면 안내
function enterCountry() {
  const c = COUNTRIES.find(x => x.key === selectedCountryKey);
  if (!c || !c.open) {
    // TODO(IAP): 출시 후 인앱 구매 시트로 연결
    openSheet('', `${c ? c.name : ''} 전선`, '곧 출시돼요.\n출시되면 인앱 구매로 열 수 있어요.');
    return;
  }
  showStageView();
}
window.enterCountry = enterCountry;

function showStageView() {
  const c = COUNTRIES.find(x => x.key === selectedCountryKey) || COUNTRIES[0];
  document.getElementById('country-view').hidden = true;
  document.getElementById('stage-view').hidden = false;
  document.getElementById('country-title').textContent = c.name;
  updateStageProgress();
  try { sessionStorage.setItem('tapwar_in_country', c.key); } catch (e) {}
  // 보이게 된 뒤에 썸네일 크기·가운데 정렬 계산
  requestAnimationFrame(() => { renderStageThumbs(); selectModalMap(selectedModalMapKey); centerStageCard(selectedModalMapKey, false); });
}
function showCountryView() {
  document.getElementById('stage-view').hidden = true;
  document.getElementById('country-view').hidden = false;
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
    btn.onclick = () => {
      if (!unlocked) {
        const prev = MAP_CONFIGS[order[i - 1]];
        openSheet('', `${cfg.label} 잠김`, `${prev.label} 맵을 클리어하면 열려요.`);
        return;
      }
      selectModalMap(key);
    };
    btn.innerHTML = `<span class="stage-no">${i + 1}</span>` +
      `<canvas class="stage-thumb" id="thumb-${k}"></canvas>` +
      `<span class="stage-name">${cfg.label || key}</span>` +
      `<span class="stage-sub">${cfg.count || ''}</span>` +
      `<span class="stage-record" id="modal-${k}-record"></span>`;
    grid.appendChild(btn);
  });
  updateRecordDisplays();
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

const TUTORIAL = [
  { title: '시작 지역 고르기',
    text: '지도를 확대·이동하며 둘러보고, 시작할 지역을 탭한 뒤 확인을 누르면 그곳이 내 기지가 돼요.',
    art: svgWrap(hex(60, 70, TC.b, TC.s) + hex(105, 70, TC.yel, '#fff', 3) + hex(150, 70, TC.b, TC.s) ) },
  { title: '자동으로 넓혀요',
    text: '내 지역은 붙어 있는 땅을 자동으로 공격해요. 아래에서부터 파란색이 꽉 차면 내 땅이 돼요.',
    art: svgWrap(hex(65, 75, TC.yel, '#fff', 3) +
      `<clipPath id="tut-c1"><polygon points="${hexPoints(145, 75)}"/></clipPath>` + hex(145, 75, TC.b, TC.s) +
      `<rect x="115" y="80" width="60" height="30" fill="${TC.blue}" clip-path="url(#tut-c1)"/>` +
      orb(97, 75) + orb(110, 75)) },
  { title: '지정 공격',
    text: '내 지역을 꾹 눌러 맞닿은 곳으로 끌면 그곳을 공격해요. 내 땅으로 끌면 피를 채워 줘요. 먼 곳은 초록 지역만 지정할 수 있어요.',
    art: svgWrap(hex(55, 70, TC.blue, TC.blueS) + hex(155, 70, TC.red, TC.redS) +
      `<path d="M60 70 L148 70" stroke="${TC.blueS}" stroke-width="3" stroke-dasharray="6 6"/>` ) },
  { title: '집중 포화',
    text: '아무 지역이나 두 번 탭하면 전선의 내 지역이 모두 그곳을 쏴요. 점령할 때까지 계속돼요.',
    art: svgWrap(hex(45, 45, TC.blue, TC.blueS) + hex(45, 105, TC.blue, TC.blueS) + hex(160, 75, TC.red, TC.blueS, 4) +
      orb(88, 57) + orb(114, 65) + orb(88, 93) + orb(114, 85)) },
  { title: EXPERIMENT_NO_SKILL ? '완전 점령' : '완전 점령과 특수 기술',
    text: (EXPERIMENT_NO_SKILL ? '이웃을 모두 차지하면 초록색이 돼요. 피가 100이 되고, 지정 공격·집중 포화로 떨어진 곳도 공격할 수 있어요. 상대의 초록 지역은 내 초록 지역만 공격할 수 있어요.' : '이웃을 모두 차지하면 초록색이 돼요. 진한 초록일 때 탭하면 적 3곳의 피를 깎고, 그 지역은 기지처럼 멀리까지 강하게 공격해요.'),
    art: svgWrap(hex(60, 48, TC.blue, TC.blueS) + hex(150, 48, TC.blue, TC.blueS) + hex(60, 102, TC.blue, TC.blueS) +
      hex(150, 102, TC.blue, TC.blueS) + hex(105, 75, TC.grn2, TC.grnS, 3) ) },
  { title: '적 기지를 무너뜨려요',
    text: '적 지역을 모두 점령하면 승리!',
    art: svgWrap(hex(60, 70, TC.yel, '#fff', 3) + hex(150, 70, TC.wine, '#fff', 3) ) }
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
  const keys = Object.keys(MAP_CONFIGS);
  Object.keys(MAP_CONFIGS).forEach(key => {
    const c = document.getElementById(`thumb-${key.toLowerCase()}`);
    if (!c) return;
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
  });
}
// -------------------------------------------------------------
// 시작 연출: 지구본이 돌며 한국으로 다가간 뒤 선택한 맵 범위까지 확대 → 게임 지도로 전환
// (화면을 탭하면 건너뜀, '동작 줄이기' 설정 시 생략)
// -------------------------------------------------------------
const INTRO_SPIN_MS = 1100;
const INTRO_ZOOM_MS = 1700;
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
  if (reduce || !cfg || !worldLand) return;
  const b = cfg.bounds;
  introAnim = {
    start: performance.now(),
    lon: (b.minLng + b.maxLng) / 2,
    lat: (b.minLat + b.maxLat) / 2,
    dLat: b.maxLat - b.minLat
  };
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
  let R, lon0, lat0, alpha = 1, seaBlend = 0;

  if (el < INTRO_SPIN_MS) {
    const t = easeInOut(el / INTRO_SPIN_MS);
    lon0 = introAnim.lon - 110 * (1 - t);
    lat0 = introAnim.lat * t;
    R = R0;
  } else {
    const t = Math.min(1, (el - INTRO_SPIN_MS) / INTRO_ZOOM_MS);
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
  ctx.fillStyle = '#f6f5f0';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = area.y + area.h / 2;
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
    ctx.translate(cx + view.offsetX, cy + view.offsetY);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-cx, -cy);

    drawExactDistrictsMap(ctx);
    drawMapTitle(ctx);
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
  if (returning && COUNTRIES.some(c => c.key === returning && c.open)) {
    if (splash) splash.remove();
    selectedCountryKey = returning;
    buildCountryCards();
    let auto = null;
    try { auto = sessionStorage.getItem('tapwar_autostart_map'); sessionStorage.removeItem('tapwar_autostart_map'); } catch (e) {}
    if (auto && MAP_CONFIGS[auto] && isStageUnlocked(auto)) {
      selectedModalMapKey = auto;
      showStageView();
      // 맵 데이터가 다 불러와진 뒤 시작 (최대 5초 대기)
      const t0 = performance.now();
      const waitStart = () => {
        if (currentMapKey === auto && rawZones.length > 0 && currentMapBounds && currentMapBounds.minLng !== undefined) onStartBtnClick();
        else if (performance.now() - t0 < 5000) setTimeout(waitStart, 50);
      };
      setTimeout(waitStart, 50);
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
