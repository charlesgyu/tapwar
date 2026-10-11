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

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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
  enemySpecialMinFull: 3,       // 특수기술 발동 필요 완전점령 지역 수 (3개)
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
  
  // 시작 모달 내 전장별 기록 뱃지 업데이트
  const koreaRecordEl = document.getElementById('modal-korea-record');
  if (koreaRecordEl) {
    const k = records.KOREA;
    if (k && k.cleared && k.bestTime !== null) {
      koreaRecordEl.innerHTML = `⭐ <b>평정 완료!</b> 최고: <span style="color:#b45309">${formatTimeString(k.bestTime)}</span> (${k.clearCount}회)`;
    } else {
      koreaRecordEl.innerHTML = `<span style="color:#94a3b8">미평정 (기록 없음)</span>`;
    }
  }

  const seoulRecordEl = document.getElementById('modal-seoul-record');
  if (seoulRecordEl) {
    const s = records.SEOUL;
    if (s && s.cleared && s.bestTime !== null) {
      seoulRecordEl.innerHTML = `⭐ <b>평정 완료!</b> 최고: <span style="color:#b45309">${formatTimeString(s.bestTime)}</span> (${s.clearCount}회)`;
    } else {
      seoulRecordEl.innerHTML = `<span style="color:#94a3b8">미평정 (기록 없음)</span>`;
    }
  }

  const gyeonggiRecordEl = document.getElementById('modal-gyeonggi-record');
  if (gyeonggiRecordEl) {
    const g = records.GYEONGGI;
    if (g && g.cleared && g.bestTime !== null) {
      gyeonggiRecordEl.innerHTML = `⭐ <b>평정 완료!</b> 최고: <span style="color:#b45309">${formatTimeString(g.bestTime)}</span> (${g.clearCount}회)`;
    } else {
      gyeonggiRecordEl.innerHTML = `<span style="color:#94a3b8">미평정 (기록 없음)</span>`;
    }
  }

  // 상단 HUD 최고 기록 뱃지
  const curRecord = records[currentMapKey];
  const bestHudEl = document.getElementById('best-timer-hud');
  if (bestHudEl) {
    if (curRecord && curRecord.cleared && curRecord.bestTime !== null) {
      bestHudEl.innerText = `(🏆최고 ${formatTimeString(curRecord.bestTime)})`;
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
let currentFocusZone = null; // 아군 집중포화 대상 구역 (단 1곳만 허용)
let focusFireCooldown = 0; // 집중포화 쿨타임 없음 (0초)
const FOCUS_FIRE_COOLDOWN_MAX = 0; // 쿨타임 없음
let focusRings = []; // 집중포화 및 타격 링 이펙트

let baseOrbSpeed = 5.2;
let focusSalvoCount = 3;

// Special Skill (완전점령 3개 이상 보유 시 발동 가능, 쿨타임 10초)
let specialSkillCooldown = 0; // 글로벌 쿨타임 (초 단위)
const SPECIAL_SKILL_COOLDOWN_MAX = 10; // 10초 쿨타임

// Enemy AI Special Skill & Focus Fire
let enemySpecialSkillCooldown = 0;
const ENEMY_SPECIAL_SKILL_COOLDOWN_MAX = 15; // 적군 15초 쿨타임
let enemyFocusFireCooldown = 0;
const ENEMY_FOCUS_FIRE_COOLDOWN_MAX = 5.0; // 5초 쿨타임
let currentEnemyFocusZone = null;
let enemyFocusReticleTimer = 0;

// 메인 지역(본진): 게임 시작 시 확보한 최초 거점. 특수 기술의 대상이 되지 않음.
// 일반 구슬 전투로 함락되면 메인 지역 지위를 잃음.
let playerMainZone = null;
let enemyMainZone = null;

const MAIN_ZONE_POWER = 2; // 메인 지역 구슬 공격력

function isMainZone(zone) {
  return (zone === playerMainZone && zone.owner === OWNER.PLAYER) ||
         (zone === enemyMainZone && zone.owner === OWNER.ENEMY);
}

// 공격 가능한 자동 목표인지: 내 점령지가 아니고, 적의 완전점령(🛡️) 철벽 기지가 아님
function isAutoAttackable(target, owner) {
  if (target.owner === owner || target.isHidden) return false;
  if (target.owner !== OWNER.NEUTRAL && isFullyConquered(target)) return false;
  return true;
}

// 메인 지역 원거리 자동 목표: 내 점령지역 전체와 맞닿아 있는 지역(전선) 중 무작위 1곳
function pickMainZoneFrontierTarget(zone) {
  const frontier = new Set();
  for (let i = 0; i < rawZones.length; i++) {
    const own = rawZones[i];
    if (own.owner !== zone.owner) continue;
    own.neighbors.forEach(n => {
      if (isAutoAttackable(n, zone.owner)) frontier.add(n);
    });
  }
  if (frontier.size === 0) return null;
  const list = [...frontier];
  return list[Math.floor(Math.random() * list.length)];
}

// 특수 기술 대상 선정 및 피해 적용 (아군/적군 공용)
// - 완전점령(🛡️)과 메인 지역은 대상에서 제외
// - 메인 지역이 살아 있으면 대상 후보 전부(최대 3곳)를 공격
// - 메인 지역을 잃은 상태라면 최후 1곳은 남겨둠(피만 깎고 중립화하지 않음)
function pickSpecialSkillTargets(candidates, mainAlive) {
  if (mainAlive) return candidates.slice(0, Math.min(3, candidates.length));
  const count = candidates.length <= 1 ? 1 : Math.min(3, candidates.length - 1);
  return candidates.slice(0, count);
}

function useSpecialSkill() {
  if (currentState !== GAME_STATE.PLAYING) return;

  // 전체 완전점령지 수 (3개 이상 보유해야 특수기술 사용 가능)
  const totalPlayerFullZones = rawZones.filter(z => z.owner === OWNER.PLAYER && isFullyConquered(z));
  if (totalPlayerFullZones.length < 3) {
    document.getElementById('status-guide').innerText = `⚠️ 특수 기술은 완전점령지역이 3개 이상일 때부터 사용 가능합니다! (현재: ${totalPlayerFullZones.length}/3개)`;
    return;
  }

  // 10초 쿨타임 체크
  if (specialSkillCooldown > 0) {
    document.getElementById('status-guide').innerText = `⏳ 특수 기술 쿨타임 대기 중입니다 (${Math.ceil(specialSkillCooldown)}초 남음)`;
    return;
  }

  // [규칙]: 특수 기술은 적의 완전점령지역(🛡️)을 제외하고, 아군 영토와 가장 인접한 적군의 일반 점령지 중 무작위 3곳 공격!
  const playerZones = rawZones.filter(z => z.owner === OWNER.PLAYER);
  const enemyZones = rawZones.filter(z => z.owner === OWNER.ENEMY && !isFullyConquered(z) && !isMainZone(z));
  const enemyMainAlive = !!(enemyMainZone && enemyMainZone.owner === OWNER.ENEMY);
  if (enemyZones.length === 0) {
    document.getElementById('status-guide').innerText = '공격 가능한 적의 일반 점령지가 없습니다! (완전점령 철벽 기지와 적 메인 지역은 특수 기술 면역)';
    return;
  }

  // 10초 쿨타임 부여
  specialSkillCooldown = SPECIAL_SKILL_COOLDOWN_MAX;

  // 1. 각 적 점령지마다 가장 가까운 아군 점령지와의 거리(및 직접 인접 여부) 계산
  enemyZones.forEach(ez => {
    let minDist = Infinity;
    let isDirectNeighbor = false;
    for (let i = 0; i < playerZones.length; i++) {
      const pz = playerZones[i];
      if (ez.neighbors && ez.neighbors.includes(pz)) {
        isDirectNeighbor = true;
      }
      const d = Math.hypot(ez.cx - pz.cx, ez.cy - pz.cy);
      if (d < minDist) minDist = d;
    }
    ez._distToPlayer = minDist;
    ez._isDirectNeighbor = isDirectNeighbor;
  });

  // 2. 아군과 가장 인접한 순서로 정렬 (직접 맞닿아 있는 전선 우선, 그 다음 최단 거리 순)
  const sortedEnemyZones = [...enemyZones].sort((a, b) => {
    if (a._isDirectNeighbor !== b._isDirectNeighbor) {
      return a._isDirectNeighbor ? -1 : 1;
    }
    return a._distToPlayer - b._distToPlayer;
  });

  // 3. 가장 가까운 상위 전선 후보군(최대 6곳) 중에서 무작위 3곳 선택
  const candidatePoolSize = Math.min(sortedEnemyZones.length, Math.max(3, Math.min(6, sortedEnemyZones.length)));
  const nearestCandidates = sortedEnemyZones.slice(0, candidatePoolSize);
  const shuffledCandidates = [...nearestCandidates].sort(() => Math.random() - 0.5);

  const targetEnemyZones = pickSpecialSkillTargets(shuffledCandidates, enemyMainAlive);

  targetEnemyZones.forEach(z => {
    // [규칙]: 피 10 감소 및 점령 요건(피 꽉 참) 미달로 점령 해제(중립화)!
    z.orbs = Math.max(0, z.orbs - 10);
    // 메인 지역을 잃은 상태에서 최후 1곳만 남았다면 피만 깎이고 구슬 전투로만 전멸되도록 보호
    if (enemyMainAlive || enemyZones.length > 1) {
      z.owner = OWNER.NEUTRAL;
    }
    z.targetZones = [];
    z.isManualTarget = false;

    // 해당 지역과 연결된 비행 중인 구슬들 즉시 소멸
    for (let j = 0; j < flyingOrbs.length; j++) {
      const orb = flyingOrbs[j];
      if (orb.sourceZone.id === z.id || orb.targetZone.id === z.id) {
        orb.isDead = true;
      }
    }

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
  document.getElementById('status-guide').innerText = `💥 [특수 기술 발동!]: 최인접 적지 [${names}] ${targetEnemyZones.length}곳 피 10 감소 및 점령 해제! (쿨타임 10초)`;
}

// 적군 AI 전용 특수 기술 (완전점령 3개 이상 보유 시 발동)
function useEnemySpecialSkill() {
  if (currentState !== GAME_STATE.PLAYING) return;

  const totalEnemyFullZones = rawZones.filter(z => z.owner === OWNER.ENEMY && isFullyConquered(z));
  if (totalEnemyFullZones.length < ENEMY_CONFIG.enemySpecialMinFull) return;
  if (enemySpecialSkillCooldown > 0) return;

  // 적군 AI의 특수 기술도 플레이어의 완전점령지역(🛡️)은 공격하지 못하고 일반 점령지만 공격!
  const playerZones = rawZones.filter(z => z.owner === OWNER.PLAYER && !isFullyConquered(z) && !isMainZone(z));
  const playerMainAlive = !!(playerMainZone && playerMainZone.owner === OWNER.PLAYER);
  if (playerZones.length === 0) return;

  enemySpecialSkillCooldown = ENEMY_SPECIAL_SKILL_COOLDOWN_MAX;

  // 무작위 아군 점령지 3곳 선택 (완전점령지 제외)
  const shuffled = [...playerZones].sort(() => Math.random() - 0.5);
  const targetPlayerZones = pickSpecialSkillTargets(shuffled, playerMainAlive);

  targetPlayerZones.forEach(z => {
    // [규칙]: 아군 점령지 피 10 감소 및 점령 해제(중립화)!
    z.orbs = Math.max(0, z.orbs - 10);
    if (playerMainAlive || playerZones.length > 1) {
      z.owner = OWNER.NEUTRAL;
    }
    z.targetZones = [];
    z.isManualTarget = false;

    // 해당 지역과 연결된 비행 중인 구슬들 즉시 소멸
    for (let j = 0; j < flyingOrbs.length; j++) {
      const orb = flyingOrbs[j];
      if (orb.sourceZone.id === z.id || orb.targetZone.id === z.id) {
        orb.isDead = true;
      }
    }

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
  document.getElementById('status-guide').innerText = `🚨 [적군 특수 기술 발동!]: 아군 점령지 [${names}] ${targetPlayerZones.length}곳 피 10 감소 및 점령 해제!`;
}

let lastSkillTimerText = '';
let lastSkillBtnDisabled = null;

function updateSpecialSkillHUD(dt) {
  if (specialSkillCooldown > 0) {
    specialSkillCooldown = Math.max(0, specialSkillCooldown - dt * gameSpeed);
  }

  const btn = document.getElementById('special-skill-btn');
  const timer = document.getElementById('special-skill-timer');
  if (!btn || !timer) return;

  const playerFullZones = rawZones.filter(z => z.owner === OWNER.PLAYER && isFullyConquered(z));
  const totalFullCount = playerFullZones.length;

  let text = '';
  let color = '';
  let disabled = false;

  if (totalFullCount < 3) {
    disabled = true;
    text = `완전점령 3개 필요 (${totalFullCount}/3)`;
    color = '#94a3b8';
  } else if (specialSkillCooldown > 0) {
    disabled = true;
    const sec = Math.ceil(specialSkillCooldown);
    text = `쿨타임 (${sec}s)`;
    color = '#f59e0b';
  } else {
    disabled = false;
    text = `특수 기술 즉시 발동! 💥`;
    color = '#22c55e';
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
    aspectRatio: 0.82
  }
};

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

function getMapArea() {
  const w = canvas.width;
  const h = canvas.height;
  const targetRatio = MAP_CONFIGS[currentMapKey] ? MAP_CONFIGS[currentMapKey].aspectRatio : 0.82;
  let mapH = Math.min(h * 0.94, 980);
  let mapW = mapH * targetRatio;

  if (mapW > w * 0.94) {
    mapW = w * 0.94;
    mapH = mapW / targetRatio;
  }

  const startX = (w - mapW) / 2;
  const startY = (h - mapH) / 2;
  return { x: startX, y: startY, w: mapW, h: mapH };
}

let cachedLinks = [];

function loadSelectedMap(mapKey) {
  currentMapKey = mapKey || 'KOREA';
  const cfg = MAP_CONFIGS[currentMapKey] || MAP_CONFIGS.KOREA;
  currentMapBounds = { ...cfg.bounds };

  // Reset in-game entities
  flyingOrbs = [];
  particles = [];
  focusRings = [];
  currentFocusZone = null;
  currentEnemyFocusZone = null;
  playerMainZone = null;
  enemyMainZone = null;
  currentPowerZone = null;
  currentEnemyPowerZone = null;
  specialSkillCooldown = 0;
  enemySpecialSkillCooldown = 0;
  focusFireCooldown = 0;
  enemyFocusFireCooldown = 0;
  gameElapsedTime = 0;
  lastTimerText = '';
  currentState = GAME_STATE.SELECT_START;
  hanRiverData = null;
  hanRiverPath = null;

  if (currentMapKey === 'SEOUL') {
    fetch('assets/seoul_han_river.json')
      .then(r => r.json())
      .then(river => {
        hanRiverData = river;
        updateZoneScreenPositions();
      })
      .catch(e => console.warn('Han river load skipped:', e));
  }

  fetch(cfg.file)
    .then(res => res.json())
    .then(data => {
      rawLinks = data.links;
      backdropZones = (data.backdrop || []).map(b => ({ ...b, path: null }));
      rawZones = data.zones.map(z => ({
        ...z,
        maxOrbs: ZONE_MAX_HP, // 모든 지역 피 50 고정 (주요 도시 가중치 없음)
        cx: 0,
        cy: 0,
        owner: OWNER.NEUTRAL,
        orbs: 0,
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

      // Reset camera view
      view.scale = 1.0;
      view.offsetX = 0;
      view.offsetY = 0;

      updateZoneScreenPositions();
      updateRecordDisplays();
      const timerEl = document.getElementById('match-timer');
      if (timerEl) timerEl.innerText = '00:00';

      const guideText = currentMapKey === 'SEOUL' 
        ? '🏙️ 서울특별시 작전: 시작할 구(예: 강남구, 마포구, 종로구 등)를 탭하세요!' 
        : '🗺️ 전국 전선 작전: 시작할 거점(예: 의령, 전주, 서울 등)을 탭하세요!';
      document.getElementById('status-guide').innerText = guideText;
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

  // Project Han River Path2D if present
  if (hanRiverData && hanRiverData.polygon) {
    const rPath = new Path2D();
    const poly = hanRiverData.polygon;
    if (poly.length >= 3) {
      const p0 = projectGeo(poly[0][0], poly[0][1], mapArea);
      rPath.moveTo(p0.x, p0.y);
      for (let i = 1; i < poly.length; i++) {
        const pt = projectGeo(poly[i][0], poly[i][1], mapArea);
        rPath.lineTo(pt.x, pt.y);
      }
      rPath.closePath();
    }
    hanRiverPath = rPath;
  }
}

function screenToWorld(sx, sy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
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
function isFullyConquered(zone) {
  if (zone.owner === OWNER.NEUTRAL) return false;
  const neighbors = zone.neighbors;
  if (!neighbors || neighbors.length === 0) return true;
  for (let i = 0; i < neighbors.length; i++) {
    if (neighbors[i].owner !== zone.owner) return false;
  }
  return true;
}

// Smart Auto-Target Selection:
function pickAutoTarget(zone) {
  // [자동 공격 규칙]: 모든 점령지역(메인 포함)은 맞닿은 지역만 무작위로 공격.
  // 메인 지역은 공격을 멈추지 않으므로, 자기와 맞닿은 목표가 없으면
  // 내 점령지역 전체와 맞닿아 있는 전선 지역 중 무작위 1곳을 원거리 공격.
  if (isMainZone(zone)) {
    return pickAdjacentTarget(zone) || pickMainZoneFrontierTarget(zone);
  }
  if (isFullyConquered(zone)) return null;
  return pickAdjacentTarget(zone);
}

function pickAdjacentTarget(zone) {

  const neighbors = zone.neighbors;
  if (!neighbors || neighbors.length === 0) return null;

  // 맞닿아 있는 적군·중립 지역 중 무작위 1곳 (적 철벽 기지 제외)
  const targets = neighbors.filter(n => isAutoAttackable(n, zone.owner));
  if (targets.length === 0) return null;
  return targets[Math.floor(Math.random() * targets.length)];
}

// 초기 맵 로드 (기본: 전국 전선)
loadSelectedMap('KOREA');

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

  // 1. Draw Player Orbs (Solid Cobalt Blue + Clean White Border)
  ctx.save();
  ctx.fillStyle = '#2563eb';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let pCount = 0;
  for (let i = 0; i < flyingOrbs.length; i++) {
    const orb = flyingOrbs[i];
    if (!orb.isDead && orb.owner === OWNER.PLAYER) {
      const r = orb.power > 1 ? 4.5 : 3.2;
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
      const r = orb.power > 1 ? 4.5 : 3.2;
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
    // If it's already full & friendly, source zone should look for next conquest target!
    if (zone.orbs >= zone.maxOrbs && sourceZone && !sourceZone.isManualTarget) {
      reRouteZone(sourceZone);
    }
  } else if (zone.owner === OWNER.NEUTRAL) {
    zone.orbs += power;
    if (zone.orbs >= zone.maxOrbs) {
      conquerZone(zone, hitOwner, sourceZone);
    }
  } else {
    // Enemy contest: Troops fight and die 1:1
    // [규칙]: 완전 점령된 지역(🛡️)은 일반 구슬 공격 절대 불가(면역)!
    if (isFullyConquered(zone)) {
      createImmuneShieldParticles(zone.cx, zone.cy);
      if (sourceZone && sourceZone.owner === hitOwner) {
        reRouteZone(sourceZone);
      }
      return;
    }

    zone.orbs -= power;
    if (zone.orbs <= 0) {
      zone.owner = OWNER.NEUTRAL;
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

let totalPlayerConquests = 0;
let nextConquestThreshold = 3; // 3 -> 6 -> 12 -> 24 -> 48 -> 96... 배수로 증가!
let isInstantConquerMode = false;

function conquerZone(conqueredZone, newOwner, conqueredBySource) {
  conqueredZone.owner = newOwner;
  conqueredZone.orbs = conqueredZone.maxOrbs; // Full garrison upon capture

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
  if (currentFocusZone && currentFocusZone.id === conqueredZone.id) {
    let effectCount = 0;
    for (let j = 0; j < flyingOrbs.length; j++) {
      const orb = flyingOrbs[j];
      if (orb.targetZone && orb.targetZone.id === conqueredZone.id && !orb.isDead) {
        orb.isDead = true;
        // 그래픽 리소스 부담을 극소화하기 위해 소수(최대 8개) 지점에서만 경량 파티클 연출
        if (effectCount < 8 && j % 3 === 0) {
          createDisintegrateParticle(orb.x, orb.y, (orb.owner === OWNER.PLAYER) ? '#38bdf8' : '#f87171');
          effectCount++;
        }
      }
    }
    focusRings.push({
      x: conqueredZone.cx,
      y: conqueredZone.cy,
      radius: 12,
      alpha: 1.0,
      color: (newOwner === OWNER.PLAYER) ? '#38bdf8' : '#ef4444'
    });
    currentFocusZone = null;
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
      titleEl.innerText = `✨ 누적 ${threshold}개 구역 점령 달성! 지원 기술 선택 (전투 진행 중!)`;
    }

    let cardsHtml = '';
    // A는 첫 1회만 제공 (아직 선택 안 한 경우)
    if (!hasPlayerUsedPower) {
      cardsHtml += `
        <div class="item-card" onclick="chooseBuff('A')">
          <div class="item-icon">💥</div>
          <div class="item-title">파워 구슬 (+2)</div>
          <div class="item-desc">점령지 1곳을 <b>파워 거점(노란색)</b>으로 지정! (1회 한정)</div>
        </div>
      `;
    }

    // 두 번째부터는 B(즉시 점령)과 C(생성 속도 가속) 반복!
    cardsHtml += `
      <div class="item-card" onclick="chooseBuff('INSTANT')">
        <div class="item-icon">🚩</div>
        <div class="item-title">즉시 점령</div>
        <div class="item-desc">원하는 목표 구역 1곳을 <b>즉시 아군 영토</b>로 점령!</div>
      </div>
      <div class="item-card" onclick="chooseBuff('C')">
        <div class="item-icon">⚡</div>
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
      document.getElementById('status-guide').innerText = `⚡ [${currentPowerZone.name}] 지역에 파워 구슬 거점 이전!`;
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
    hud.innerHTML = `<div class="buff-badge">💥 파워 거점 (+2)</div>` + hud.innerHTML;
  } else if (itemCode === 'C') {
    playerBuffs.interval = Math.max(100, playerBuffs.interval - 100);
    const secStr = (playerBuffs.interval / 1000).toFixed(1);
    hud.innerHTML = `<div class="buff-badge">⚡ 생성 속도 (${secStr}s)</div>` + hud.innerHTML;
  } else if (itemCode === 'INSTANT') {
    isInstantConquerMode = true;
    document.getElementById('status-guide').innerText = '🚩 [즉시 점령]: 즉시 점령하고 싶은 도시를 클릭하세요!';
  }

  const itemModal = document.getElementById('item-modal');
  if (itemModal) itemModal.style.display = 'none';
}

// Redirect zone to another frontier (preventing wasted troops!)
function reRouteZone(zone) {
  if (zone.isManualTarget) {
    // [사용자 요구사항]: 내가 적의 구역을 집중포화/수동지정으로 공격하다가 적의 지역이 완전점령지역으로 바뀌면
    // 즉시 그쪽 공격을 멈추고 인접지역 공격으로 자동 전환!
    const targetIsFullyConqueredEnemy = zone.targetZones.some(t => t.owner !== zone.owner && t.owner !== OWNER.NEUTRAL && isFullyConquered(t));
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

let dragSourceZone = null;
let worldMousePos = { x: 0, y: 0 };
let isDragging = false;
let lastTapTime = 0;
let lastTapZoneId = null;

// 더블클릭 / 더블탭 시 인접 아군 점령지가 해당 구역을 일제히 집중 포격! (쿨타임 없이 무제한 즉시 발동 가능)
function handleZoneDoubleClick(targetZone) {
  if (!targetZone || currentState !== GAME_STATE.PLAYING) return;

  // [지정 공격 규칙]: 내 점령지역은 집중 포격 대상이 아님
  if (targetZone.owner === OWNER.PLAYER) return;

  // [면역 규칙]: 완전 점령된 적 기지는 일반 공격 절대 불가!
  if (targetZone.owner === OWNER.ENEMY && isFullyConquered(targetZone)) {
    document.getElementById('status-guide').innerText = `🛡️ [${targetZone.name}]은(는) 완전 점령된 철벽 기지입니다!`;
    return;
  }

  // 점령 중인 아군의 전선 거점 탐색 (완전점령지역은 사격 제외! 목표가 아군 거점이면 자기 자신 제외)
  const allPlayerZones = rawZones.filter(z => z.owner === OWNER.PLAYER && z.id !== targetZone.id && (!isFullyConquered(z) || isMainZone(z)));

  if (allPlayerZones.length === 0) {
    document.getElementById('status-guide').innerText = `⚠️ 출격 가능한 전선 아군 점령지가 없습니다! (완전점령지역은 집중포화 제외)`;
    return;
  }

  // [규칙]: 집중포화 공격은 한 번에 1개 구역만 가능!
  // 다른 구역이 이미 지정되어 있었다면 이전 지정 구역의 아군 기지들을 해제하여 재배치!
  if (currentFocusZone && currentFocusZone.id !== targetZone.id) {
    rawZones.forEach(z => {
      if (z.owner === OWNER.PLAYER && z.targetZones.includes(currentFocusZone)) {
        z.isManualTarget = false;
        reRouteZone(z);
      }
    });
  }

  currentFocusZone = targetZone;
  focusFireCooldown = 0; // 쿨타임 없음!

  // 1. 완전점령지역을 제외한 전선의 모든 아군 기지가 이 단 하나의 목표 지역을 동시 타겟으로 지정!
  allPlayerZones.forEach(pZone => {
    // 집중 포격은 일회성 연발 사격만 수행. 타겟을 고정하지 않으므로
    // 사격 후 각 기지는 즉시 인접 지역 자동 공격으로 복귀 (원거리 지속 공격은 드래그 지정 시에만)

    // 2. 즉시 일제 집중 포격 (전선 모든 기지에서 3~4발 쾌속 연발 발사!)
    const isPowerZone = (currentPowerZone && currentPowerZone.id === pZone.id);
    const power = isMainZone(pZone) ? MAIN_ZONE_POWER : (isPowerZone ? (1 + playerBuffs.powerLevel * 2) : 1);

    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (currentState === GAME_STATE.PLAYING) {
          flyingOrbs.push(new FlyingOrb(pZone, targetZone, OWNER.PLAYER, power));
        }
      }, i * (70 / gameSpeed));
    }
  });

  document.getElementById('status-guide').innerText = `🔥 [${targetZone.name}] 집중 포격! 전선의 아군 ${allPlayerZones.length}개 거점에서 일제 사격 (3~4발 연발)!`;
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

  if (e.button === 2) {
    view.isPanning = true;
    view.panStartX = coords.clientX - view.offsetX;
    view.panStartY = coords.clientY - view.offsetY;
    return;
  }

  worldMousePos = screenToWorld(coords.sx, coords.sy);
  const targetZone = findZoneAtWorld(worldMousePos.x, worldMousePos.y);


  // Instant Conquer mode activated from Item Reward!
  if (isInstantConquerMode && targetZone) {
    if (targetZone.owner !== OWNER.PLAYER) {
      isInstantConquerMode = false;
      conquerZone(targetZone, OWNER.PLAYER, null);
      createHitParticles(targetZone.cx, targetZone.cy, OWNER.PLAYER);
      document.getElementById('status-guide').innerText = `🚩 [${targetZone.name}] 즉시 점령 완료! 아군 영토로 편입되었습니다.`;
      return;
    }
  }

  if (currentState === GAME_STATE.SELECT_START) {
    if (targetZone && !targetZone.isHidden) {
      targetZone.owner = OWNER.PLAYER;
      targetZone.orbs = targetZone.maxOrbs;
      lastSelectedPlayerZone = targetZone;
      playerMainZone = targetZone;

      // Assign initial auto target for starter
      const initTarget = pickAutoTarget(targetZone);
      if (initTarget) targetZone.targetZones = [initTarget];

      // Assign AI Enemy starting base (1 base)
      const baseCount = ENEMY_CONFIG.startingEnemyBases;

      const enemyCandidates = rawZones.filter(z => z.id !== targetZone.id && !z.isHidden);
      enemyCandidates.sort((a, b) => Math.hypot(b.cx - targetZone.cx, b.cy - targetZone.cy) - Math.hypot(a.cx - targetZone.cx, a.cy - targetZone.cy));

      const chosenEnemies = [];
      for (let k = 0; k < baseCount; k++) {
        const idx = Math.min(enemyCandidates.length - 1, k * 5);
        const eZone = enemyCandidates[idx];
        if (eZone && !chosenEnemies.includes(eZone)) {
          eZone.owner = OWNER.ENEMY;
          eZone.orbs = eZone.maxOrbs;
          const aiTarget = pickAutoTarget(eZone);
          if (aiTarget) eZone.targetZones = [aiTarget];
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
      document.getElementById('status-guide').innerText = `${targetZone.name} 기지 확보! 작전 개시! (적 전면 섬멸 작전)`;
    }
    return;
  }

  if (currentState !== GAME_STATE.PLAYING) return;

  // 지역 더블클릭 / 더블탭 판정 (집중 포격 발동!)
  const now = performance.now();
  if (targetZone && targetZone.id === lastTapZoneId && (now - lastTapTime) < 380) {
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
    return;
  }

  if (isDragging && dragSourceZone) {
    const endZone = findZoneAtWorld(worldMousePos.x, worldMousePos.y);
    // [지정 공격 규칙]: 내 점령지역을 제외한 모든 지역(적군·중립, 거리 무관) 지정 가능
    if (endZone && endZone.id !== dragSourceZone.id && endZone.owner !== dragSourceZone.owner) {
      // 완전 점령된 적 기지는 일반 공격 불가!
      if (endZone.owner !== dragSourceZone.owner && endZone.owner !== OWNER.NEUTRAL && isFullyConquered(endZone)) {
        document.getElementById('status-guide').innerText = `🛡️ [${endZone.name}]은(는) 완전 점령된 철벽 기지입니다! [즉시 점령] 아이템으로만 공략 가능합니다.`;
        createImmuneShieldParticles(endZone.cx, endZone.cy);
      } else {
        dragSourceZone.isManualTarget = true;
        dragSourceZone.targetZones = [endZone];
      }
    }
  }
  isDragging = false;
  dragSourceZone = null;
}

// Mouse Wheel Zoom
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
  view.scale = Math.min(view.maxScale, Math.max(view.minScale, view.scale * zoomFactor));
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

canvas.addEventListener('touchstart', (e) => {
  lastTouchTime = performance.now();
  if (e.touches.length === 2) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    initialScale = view.scale;
    initialPanMidX = (t1.clientX + t2.clientX) / 2 - view.offsetX;
    initialPanMidY = (t1.clientY + t2.clientY) / 2 - view.offsetY;
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
    view.scale = Math.min(view.maxScale, Math.max(view.minScale, initialScale * scaleFactor));

    const curMidX = (t1.clientX + t2.clientX) / 2;
    const curMidY = (t1.clientY + t2.clientY) / 2;
    view.offsetX = curMidX - initialPanMidX;
    view.offsetY = curMidY - initialPanMidY;
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
  const cards = {
    KOREA: document.getElementById('modal-map-korea'),
    SEOUL: document.getElementById('modal-map-seoul'),
    GYEONGGI: document.getElementById('modal-map-gyeonggi')
  };
  Object.keys(cards).forEach(key => {
    const card = cards[key];
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
  // 모달에서 카드 클릭 시 즉시 맵을 미리 로드하여 보여줌
  loadSelectedMap(mapKey);
  updateMapButtonsUI(mapKey);
}
window.selectModalMap = selectModalMap;

function updateMapButtonsUI(mapKey) {
  const kBtn = document.getElementById('map-btn-korea');
  const sBtn = document.getElementById('map-btn-seoul');
  const gBtn = document.getElementById('map-btn-gyeonggi');
  if (kBtn) kBtn.classList.toggle('active', mapKey === 'KOREA');
  if (sBtn) sBtn.classList.toggle('active', mapKey === 'SEOUL');
  if (gBtn) gBtn.classList.toggle('active', mapKey === 'GYEONGGI');
}
window.updateMapButtonsUI = updateMapButtonsUI;

function switchBattlefield(mapKey) {
  selectedModalMapKey = mapKey;
  loadSelectedMap(mapKey);
  updateMapButtonsUI(mapKey);
  const guideEl = document.getElementById('status-guide');
  if (guideEl) {
    if (mapKey === 'SEOUL') {
      guideEl.innerText = '🏙️ 서울특별시 작전: 시작할 자치구(예: 강남구, 마포구, 종로구 등)를 탭하세요!';
    } else if (mapKey === 'GYEONGGI') {
      guideEl.innerText = '🌲 경기도 전선 작전: 시작할 시·군(예: 수원, 고양, 용인 등)을 탭하세요!';
    } else {
      guideEl.innerText = '🗺️ 전국 전선 작전: 시작할 거점 도시를 탭하세요!';
    }
  }
}
window.switchBattlefield = switchBattlefield;

function onStartBtnClick() {
  const modal = document.getElementById('start-modal');
  if (modal) modal.style.display = 'none';
  if (currentMapKey !== selectedModalMapKey) {
    switchBattlefield(selectedModalMapKey);
  } else {
    const guideEl = document.getElementById('status-guide');
    if (guideEl) {
      if (selectedModalMapKey === 'SEOUL') {
        guideEl.innerText = '🏙️ 시작할 아군 자치구(예: 강남구, 마포구, 종로구 등)를 탭하세요!';
      } else if (selectedModalMapKey === 'GYEONGGI') {
        guideEl.innerText = '🌲 시작할 아군 시·군(예: 수원, 고양, 용인 등)을 탭하세요!';
      } else {
        guideEl.innerText = '🗺️ 시작할 아군 거점 도시를 탭하세요!';
      }
    }
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
    document.getElementById('status-guide').innerText = `⚡ [적군 아이템 발동]: 적군이 파워 거점(+2 파워 구슬)을 확보했습니다!`;
  } else if (choice === 'C') {
    enemyBuffs.interval = Math.max(100, enemyBuffs.interval - 100);
    const secStr = (enemyBuffs.interval / 1000).toFixed(1);
    document.getElementById('status-guide').innerText = `⚡ [적군 아이템 발동]: 적군 구슬 생성 속도 단축 (${secStr}s)!`;
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
      document.getElementById('status-guide').innerText = `⚠️ [적군 즉시 점령 발동!]: 적군이 [${target.name}]을(를) 강탈했습니다!`;
    }
  }
}

// 적군 AI 집중포화 (아군 전선 거점을 향해 일제 사격)
function triggerEnemyFocusFire() {
  if (currentState !== GAME_STATE.PLAYING) return;
  if (enemyFocusFireCooldown > 0) return;

  // 완전점령지역이 아닌 전선 교전 중인 적 거점들
  const activeEnemyZones = rawZones.filter(z => z.owner === OWNER.ENEMY && (!isFullyConquered(z) || isMainZone(z)));
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
  const firingBases = activeEnemyZones.filter(e => e.neighbors.includes(target) || Math.random() < 0.45);
  if (firingBases.length === 0) return;

  const salvoCount = ENEMY_CONFIG.enemyFocusSalvo;
  firingBases.forEach(eZone => {
    eZone.isManualTarget = true;
    eZone.targetZones = [target];

    const isEnemyPower = (currentEnemyPowerZone && currentEnemyPowerZone.id === eZone.id);
    const power = isMainZone(eZone) ? MAIN_ZONE_POWER : (isEnemyPower ? (1 + enemyBuffs.powerLevel * 2) : 1);

    for (let i = 0; i < salvoCount; i++) {
      setTimeout(() => {
        if (currentState === GAME_STATE.PLAYING) {
          flyingOrbs.push(new FlyingOrb(eZone, target, OWNER.ENEMY, power));
        }
      }, i * (70 / gameSpeed));
    }
  });

  document.getElementById('status-guide').innerText = `🚨 [적군 집중포화 경보!]: 적 기지 ${firingBases.length}곳에서 [${target.name}]에 일제 사격을 개시했습니다!`;
}

// AI Expansion Engine
let lastAiDecisionTime = 0;
function updateAI(currentTime) {
  const decisionInterval = ENEMY_CONFIG.enemyDecisionInterval / gameSpeed;
  if (currentTime - lastAiDecisionTime < decisionInterval) return;
  lastAiDecisionTime = currentTime;

  // 1. 적군 특수 기술 사용 검토 (완전점령 3개 이상 & 충전 보유 & 쿨타임 완료 시)
  useEnemySpecialSkill();

  // 2. 적군 집중포화 사용 검토 (쿨타임 완료 시 아군 거점에 일제 사격)
  triggerEnemyFocusFire();

  // 3. 일반 전선 전진 및 재배치
  const enemyZones = rawZones.filter(z => z.owner === OWNER.ENEMY);
  enemyZones.forEach(eZone => {
    // Never stop or get stuck if NOT fully conquered!
    if (isFullyConquered(eZone) && !isMainZone(eZone)) {
      eZone.targetZones = [];
      return;
    }

    if (eZone.targetZones.length === 0 || eZone.targetZones.every(t => t.owner === OWNER.ENEMY)) {
      const tgt = pickAutoTarget(eZone);
      if (tgt) eZone.targetZones = [tgt];
    }
  });
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

    // '완전 점령' Check: 수동 지정(전국 집중포화 등)이 아닌 경우에만 잉여 생산 중단!
    if (isFullyConquered(zone) && !zone.isManualTarget && !isMainZone(zone)) {
      zone.targetZones = [];
      return;
    }

    // If active targets are already captured by same owner, or target became a fully conquered immune zone, re-route immediately!
    const targetBecameImmune = zone.targetZones.some(t => t.owner !== zone.owner && t.owner !== OWNER.NEUTRAL && isFullyConquered(t));
    const allTargetsCaptured = zone.targetZones.length > 0 && zone.targetZones.every(t => t.owner === zone.owner);
    if (targetBecameImmune || allTargetsCaptured || zone.targetZones.length === 0) {
      // 집중포화 타겟이었을 경우 집중포화 타겟팅 해제 및 후속 구슬 소멸
      if (currentFocusZone && zone.targetZones.includes(currentFocusZone) && targetBecameImmune) {
        currentFocusZone = null;
      }
      reRouteZone(zone);
      if (zone.targetZones.length === 0) return;
    }

    const baseInterval = zone.owner === OWNER.PLAYER ? playerBaseInterval : enemyBaseInterval;
    const interval = baseInterval / gameSpeed; // 2배속, 4배속 시 생성 간격 단축!

    if (currentTime - zone.lastShotTime >= interval) {
      zone.lastShotTime = currentTime;
      
      let power = 1;
      if (isMainZone(zone)) {
        power = MAIN_ZONE_POWER;
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
  if (pFullEl) pFullEl.innerText = `🛡️${pFull}`;
  if (eFullEl) eFullEl.innerText = `🛡️${eFull}`;

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

// 항복: 실수 방지를 위해 2단계 확인 (첫 탭 ➔ 확인 상태, 3초 안에 다시 탭 ➔ 항복)
const SURRENDER_CONFIRM_MS = 3000;
let surrenderArmedUntil = 0;
let surrenderResetTimer = null;

function resetSurrenderButton() {
  surrenderArmedUntil = 0;
  const btn = document.getElementById('surrender-btn');
  if (btn) {
    btn.classList.remove('armed');
    btn.innerText = '🏳️ 항복';
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

let lastSurrenderHidden = null;
function updateSurrenderButtonVisibility() {
  const hidden = currentState !== GAME_STATE.PLAYING;
  if (hidden === lastSurrenderHidden) return;
  lastSurrenderHidden = hidden;
  const btn = document.getElementById('surrender-btn');
  if (btn) btn.hidden = hidden;
  if (hidden) resetSurrenderButton();
}

function gameOver(isWin, isSurrender = false) {
  currentState = GAME_STATE.GAME_OVER;
  const modal = document.getElementById('end-modal');
  const title = document.getElementById('end-title');
  const desc = document.getElementById('end-message');
  const timeStr = formatTimeString(gameElapsedTime);
  const mapName = MAP_CONFIGS[currentMapKey] ? MAP_CONFIGS[currentMapKey].name : currentMapKey;
  
  if (isWin) {
    title.style.color = '#2563eb';
    title.innerText = '🎉 [전면 승리] 적군 섬멸 완료!';

    const recordResult = saveBattleRecord(currentMapKey, gameElapsedTime);
    const bestStr = formatTimeString(recordResult.bestTime);

    let recordMsg = `<div style="font-size: 15px; margin-bottom: 12px; color: #0f172a;">⏱️ 작전 소요 시간: <b style="color: #2563eb; font-size: 18px;">${timeStr}</b></div>`;
    if (recordResult.isNewBest) {
      recordMsg += `<div style="background: #dcfce7; border: 1px solid #22c55e; color: #15803d; padding: 8px 12px; border-radius: 10px; margin-bottom: 12px; font-weight: 700;">🥇 전장 최고 기록 경신! 신기록 달성 (${timeStr})</div>`;
    } else {
      recordMsg += `<div style="color: #475569; font-size: 13px; margin-bottom: 10px;">🏆 전장 최고 기록: <b style="color: #b45309;">${bestStr}</b></div>`;
    }
    recordMsg += `<div style="font-size: 12px; color: #475569; line-height: 1.5;">🎖️ [${mapName}] 누적 평정: <b>${recordResult.clearCount}회</b><br>적의 모든 거점을 격파하고 전선을 완전히 평정했습니다!</div>`;

    desc.innerHTML = recordMsg;
  } else {
    title.style.color = '#ef4444';
    if (isSurrender) {
      title.innerText = '🏳️ 항복... 작전 중단';
      desc.innerHTML = `<div style="font-size: 14px; color: #475569; margin-bottom: 10px;">작전 진행 시간: <b>${timeStr}</b></div><div style="font-size: 13px; color: #334155;">스스로 항복하여 작전을 중단했습니다.<br>전열을 가다듬고 다시 도전하세요!</div>`;
      if (modal) modal.style.display = 'flex';
      return;
    }
    title.innerText = '💀 본진 함락... 작전 실패!';
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
    ctx.stroke(b.path);
  });
  ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", sans-serif';
  ctx.fillStyle = '#a8a59b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  backdropZones.forEach(b => {
    if (b.path) ctx.fillText(b.name, b.cx, b.cy);
  });
  ctx.restore();
}

function drawExactDistrictsMap(ctx) {
  drawBackdropZones(ctx);

  // 1. Draw Polygons via pre-compiled Path2D (Mini Metro Light/Minimalist Aesthetic)
  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    if (!zone.path) continue;

    const isHovered = hoveredZone && hoveredZone.id === zone.id;
    const isSelected = dragSourceZone && dragSourceZone.id === zone.id;
    const isFull = isFullyConquered(zone);

    // Reference image styling: Pure crisp white district cards with subtle shadow and light grey stroke
    // 모든 전장 동일한 지도 스타일 (전국 전선 기준)
    let fillColor = '#edebe3';
    let strokeColor = '#cfcdc4';
    let lineWidth = 1.0;

    if (zone.owner === OWNER.PLAYER) {
      if (isFull) {
        // [아군 완전 점령]: 편안하고 단정한 세이지 그린 / 에메랄드
        fillColor = '#dcfce7';
        strokeColor = '#16a34a';
        lineWidth = 2.0;
      } else {
        // [아군 교전 중]: 산뜻한 파스텔 스카이 블루 & 선명한 코발트 테두리
        fillColor = '#dbeafe';
        strokeColor = '#2563eb';
        lineWidth = 2.2;
      }
    } else if (zone.owner === OWNER.ENEMY) {
      if (isFull) {
        // [적군 완전 점령]: 딥 소프트 로즈
        fillColor = '#fee2e2';
        strokeColor = '#dc2626';
        lineWidth = 2.0;
      } else {
        // [적군 교전 중]: 소프트 레드 & 버밀리온 레드 테두리
        fillColor = '#fecaca';
        strokeColor = '#b91c1c';
        lineWidth = 2.2;
      }
    }

    if (isHovered || isSelected) {
      fillColor = zone.owner === OWNER.PLAYER ? '#bfdbfe' : '#fef08a';
      strokeColor = '#0f172a';
      lineWidth = 2.4;
    }

    ctx.fillStyle = fillColor;
    ctx.fill(zone.path);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(zone.path);
  }

  // 1.5 Draw Han River (한강 자연 수로 - 사용자 레퍼런스 스타일)
  if (currentMapKey === 'SEOUL' && hanRiverPath) {
    ctx.save();
    ctx.fillStyle = '#bfe5fa'; // 산뜻한 한강 라이트 블루
    ctx.strokeStyle = '#93cbf0';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fill(hanRiverPath);
    ctx.stroke(hanRiverPath);
    ctx.restore();
  }

  // 2. Draw Network Links (구슬이 움직이는 선 표시 제거)
  // (Network links hidden per user request)

  // 3. Drag line from source (Clean Dotted Transit Vector)
  if (isDragging && dragSourceZone) {
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

  // 5. Active Focus Fire Reticle
  drawActiveFocusReticle(ctx);
}

function drawActiveFocusReticle(ctx) {
  // 1. 아군 집중포화 목표 조준선 (미니멀 레드 서클)
  if (currentFocusZone && currentFocusZone.owner !== OWNER.PLAYER) {
    const { cx, cy } = currentFocusZone;
    const t = Date.now() / 250;
    const r = 18 + Math.sin(t * 3) * 3;

    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([5, 4]);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    ctx.setLineDash([]);
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx - r - 5, cy); ctx.lineTo(cx - r + 3, cy);
    ctx.moveTo(cx + r - 3, cy); ctx.lineTo(cx + r + 5, cy);
    ctx.moveTo(cx, cy - r - 5); ctx.lineTo(cx, cy - r + 3);
    ctx.moveTo(cx, cy + r - 3); ctx.lineTo(cx, cy + r + 5);
    ctx.stroke();

    ctx.restore();
  }

  // 2. 적군 집중포화 피격 경보 조준선
  if (currentEnemyFocusZone && enemyFocusReticleTimer > 0) {
    const { cx, cy } = currentEnemyFocusZone;
    const t = Date.now() / 150;
    const r = 21 + Math.sin(t * 4) * 3;

    ctx.save();
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner danger pulse ring
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(185, 28, 28, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.restore();
  }
}

function drawZoneBadges(ctx) {
  const isSeoul = currentMapKey === 'SEOUL';
  const baseSize = isSeoul ? 11 : 9.5;
  const fontSize = Math.max(9, Math.min(15, baseSize * Math.sqrt(view.scale)));
  const titleFont = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", sans-serif`;
  const subFont = `600 ${isSeoul ? 9.5 : 8.5}px monospace`;

  ctx.textAlign = 'center';

  for (let i = 0; i < rawZones.length; i++) {
    const zone = rawZones[i];
    const { cx: x, cy: y, name, orbs, maxOrbs, owner } = zone;
    const isFull = isFullyConquered(zone);

    let tagColor = '#64748b'; // 단일 폰트 색상 (Neutral Slate)
    if (owner === OWNER.PLAYER) tagColor = isFull ? '#16a34a' : '#2563eb';
    else if (owner === OWNER.ENEMY) tagColor = isFull ? '#dc2626' : '#b91c1c';

    // Garrison Progress Outer Arc (단일 스트로크 링 게이지)
    if (orbs > 0) {
      const fillPct = Math.min(1, orbs / maxOrbs);
      ctx.beginPath();
      ctx.arc(x, y, 7.0, -Math.PI / 2, -Math.PI / 2 + fillPct * Math.PI * 2);
      ctx.strokeStyle = tagColor;
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }

    const isPlayerPowerZone = (currentPowerZone && currentPowerZone.id === zone.id);
    const isEnemyPowerZone = (currentEnemyPowerZone && currentEnemyPowerZone.id === zone.id);

    // Name text
    ctx.font = titleFont;
    ctx.textBaseline = 'bottom';

    let prefix = '';
    if (isMainZone(zone)) prefix = '👑';
    else if (isPlayerPowerZone || isEnemyPowerZone) prefix = '⚡';
    else if (isFull) {
      prefix = '🛡️';
    }

    const labelText = `${prefix}${name}`;

    // 지역명 색상 지정
    if (isPlayerPowerZone) {
      ctx.fillStyle = '#b45309';
    } else if (isEnemyPowerZone) {
      ctx.fillStyle = '#c2410c';
    } else if (isFull) {
      ctx.fillStyle = owner === OWNER.PLAYER ? '#15803d' : '#b91c1c';
    } else {
      ctx.fillStyle = owner === OWNER.PLAYER ? '#1d4ed8' : (owner === OWNER.ENEMY ? '#b91c1c' : '#1e293b');
    }
    ctx.fillText(labelText, x, y - 2);

    // HP / Garrison text (흰색 외곽선/중복 잔상 제거: 단일 단정한 회색/소속색 텍스트만 표시)
    ctx.font = subFont;
    ctx.fillStyle = tagColor;
    ctx.textBaseline = 'top';
    ctx.fillText(`${orbs}/${maxOrbs}`, x, y + 4);
  }
}

// Render Loop
let lastTime = 0;
let lastWinCheckTime = 0;
function gameLoop(timestamp) {
  try {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateSurrenderButtonVisibility();

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
        if (enemyFocusReticleTimer <= 0) currentEnemyFocusZone = null;
      }

      // 승리/패배 조건 주기적 체크 (250ms 주기)
      if (!lastWinCheckTime || timestamp - lastWinCheckTime > 250) {
        lastWinCheckTime = timestamp;
        checkWinConditions();
      }

      for (let i = flyingOrbs.length - 1; i >= 0; i--) {
        const orb = flyingOrbs[i];
        if (!orb || orb.isDead || orb.update()) {
          flyingOrbs.splice(i, 1);
        }
      }
    }

    // Camera Matrix
    ctx.save();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.translate(cx + view.offsetX, cy + view.offsetY);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-cx, -cy);

    drawExactDistrictsMap(ctx);
    drawFocusRings(ctx);
    drawFlyingOrbs(ctx);
    drawParticles(ctx);

    ctx.restore();
  } catch (err) {
    console.error('gameLoop error:', err);
  } finally {
    requestAnimationFrame(gameLoop);
  }
}

resizeCanvas();
requestAnimationFrame(gameLoop);
