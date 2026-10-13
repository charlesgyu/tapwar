// 파티원 AI — DESIGN.md §8.1
// 탱커: 힐러를 노리는 놈 우선 → 가장 가까운 교전 몬스터, 도발 쿨마다. 근딜: 탱커의 대상을 뒤에서. 원딜: 150~220px 유지.
// 비전투: 플레이어 주위 1.5타일 안 대형으로 바짝 붙어 따라간다(멀어지면 빠르게 따라잡음). 탐색 중 8타일 안의 몬스터는 바로 덮친다.
// 텔레그래프 안이면 확률(숲 90%, 동굴 2/3)로 빠져나온다.
// 실제 피해·위협은 Combat 이 처리하므로 여기서는 대상·위치·스킬 요청만 한다.
const AIParty = (() => {
  const TILE = 32;
  const DODGE_FOREST = 0.9, DODGE_CAVE = 2 / 3, DODGE_MARGIN = 16;
  const RANGED_MIN = 150, RANGED_MAX = 220;
  const FOLLOW_SLACK = 16, ENGAGE_RANGE = 8 * TILE, MAX_CHASE = 15 * TILE, RETREAT_LEASH = 8 * TILE;
  // 빠른 템포: 파티는 힐러 주위 1.5타일 안에 덩어리로 붙어 다니고(뒤처지면 ×1.5 로 따라잡음), 적에게는 ×1.25 로 달려든다.
  const CATCHUP_DIST = 1.5 * TILE, CATCHUP_SPEED = 1.5, CHASE_SPEED = 1.25;
  const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  const nearest = (list, from) => list.reduce((best, m) => (!best || dist(m, from) < dist(best, from) ? m : best), null);
  const inRange = (a, b, range) => dist(a, b) <= range + a.radius + b.radius;
  const isForest = (floor) => (typeof Floors !== 'undefined' && Floors.isForest ? Floors.isForest(floor) : floor <= 5);
  const skillsOf = (ent) => (typeof Skills !== 'undefined' && Skills.member ? Skills.member(ent.cls) : []);

  function update(ent, battle, dt) {
    recordTrail(battle);
    if (!alive(ent) || ent.cast) return;
    if (dodge(ent, battle, dt)) return;
    const foes = findFoes(ent, battle);
    if (!foes.length) return follow(ent, battle, dt);
    if (ent.role === 'tank') tank(ent, battle, foes, dt);
    else if (ent.role === 'ranged') ranged(ent, battle, foes, dt);
    else melee(ent, battle, foes, dt);
  }

  // 교전 몬스터 + 바로 근처에서 발견한 몬스터. 힐러에게서 너무 먼 놈은 쫓지 않는다(파티가 흩어지지 않게).
  function findFoes(ent, battle) {
    const anchor = alive(battle.player) ? battle.player : ent;
    const near = battle.activeMonsters().filter((m) => dist(m, ent) <= ENGAGE_RANGE || dist(m, anchor) <= ENGAGE_RANGE);
    const set = new Set(battle.engagedMonsters().concat(near));
    return Array.from(set).filter((m) => alive(m) && dist(m, anchor) <= MAX_CHASE);
  }

  // ---- 회피 ----
  function dangerous(tg) { return tg.type === 'puddle' ? !!tg.active || !tg.resolved : !tg.resolved; }
  function dodge(ent, battle, dt) {
    const tg = battle.telegraphs.find((t) => dangerous(t) && battle.inTelegraph(t, ent));
    if (!tg) { ent.dodge = null; return false; }
    // 텔레그래프마다 한 번만 "피할지" 굴린다(매 프레임 굴리면 결국 항상 피하게 된다)
    if (!ent.dodge || ent.dodge.id !== tg.id) {
      const go = battle.rng.chance(isForest(battle.floor) ? DODGE_FOREST : DODGE_CAVE);
      ent.dodge = { id: tg.id, go, to: go ? exitPoint(tg, ent, battle) : null };
    }
    if (!ent.dodge.go || !ent.dodge.to) return false;
    battle.moveTo(ent, ent.dodge.to.x, ent.dodge.to.y, dt);
    return true;
  }
  function exitPoint(tg, ent, battle) {
    const out = ent.radius + DODGE_MARGIN;
    const cands = [];
    if (tg.type === 'cone') {
      const half = (tg.angle * Math.PI / 180) / 2, d = Math.max(40, dist(tg, ent));
      for (const s of [1, -1]) { const a = tg.facing + s * (half + 0.35); cands.push({ x: tg.x + Math.cos(a) * d, y: tg.y + Math.sin(a) * d }); }
    } else if (tg.type === 'line') {
      const vx = tg.x2 - tg.x, vy = tg.y2 - tg.y, len = Math.hypot(vx, vy) || 1;
      for (const s of [1, -1]) cands.push({ x: ent.x + (-vy / len) * s * (tg.r + out), y: ent.y + (vx / len) * s * (tg.r + out) });
    } else {
      const d = dist(tg, ent);
      const base = d > 1 ? Math.atan2(ent.y - tg.y, ent.x - tg.x) : battle.rng.float(0, Math.PI * 2);
      for (const off of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) cands.push({ x: tg.x + Math.cos(base + off) * (tg.r + out), y: tg.y + Math.sin(base + off) * (tg.r + out) });
    }
    cands.sort((a, b) => dist(a, ent) - dist(b, ent));
    return cands.find((p) => battle.canStand(p.x, p.y, ent.radius)) || null;
  }

  // ---- 비전투: 대형 따라가기 ----
  // 파티원 AI 에는 길찾기가 없어서, 힐러가 모퉁이를 돌면 벽에 막혀 뒤처졌다. 힐러가 지나간 발자국(trail)을 기억해 두고
  // 대형 자리가 벽 너머면 "보이는 발자국 중 힐러에게 가장 가까운 것"으로 걸어간다(사람이 앞사람 발자국을 따라가듯).
  const TRAIL_STEP = 12, TRAIL_MAX = 160, LOS_STEP = 8;
  function recordTrail(battle) {
    const p = battle.player; if (!alive(p)) return;
    const tr = battle._trail || (battle._trail = []);
    const last = tr[tr.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < TRAIL_STEP) return;
    tr.push({ x: p.x, y: p.y });
    if (tr.length > TRAIL_MAX) tr.shift();
  }
  function clearPath(battle, a, b, r) {
    const d = dist(a, b), n = Math.ceil(d / LOS_STEP);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (!battle.canStand(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r)) return false;
    }
    return true;
  }
  function trailPoint(ent, battle) {
    const tr = battle._trail || [];
    for (let k = tr.length - 1; k >= 0; k--) if (clearPath(battle, ent, tr[k], ent.radius)) return tr[k];
    return null;
  }
  // 벽·물에 막힌 대상에게 가는 길: 타일 BFS(최대 NAV_MAX 칸, 목표 칸에서 조기 종료)로 경로를 만들어 1.5초 동안 재사용한다.
  // 직선이 트여 있으면 그냥 직진. 경로를 못 찾으면 직진(예전 동작)으로 둔다.
  const NAV_MAX = 2500, NAV_TTL = 1.5;
  function navPath(battle, from, to) {
    const map = battle.map; if (!map || !map.solid) return null;
    const cols = map.cols, rows = map.rows;
    const si = Math.floor(from.x / TILE), sj = Math.floor(from.y / TILE), ti = Math.floor(to.x / TILE), tj = Math.floor(to.y / TILE);
    if (map.solid(ti, tj)) return null;
    const start = sj * cols + si, goal = tj * cols + ti;
    const prev = new Map([[start, -1]]), q = [start];
    for (let h = 0; h < q.length && q.length < NAV_MAX; h++) {
      const c = q[h];
      if (c === goal) break;
      const i = c % cols, j = (c / cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + dx, nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || map.solid(ni, nj)) continue;
        const n = nj * cols + ni; if (prev.has(n)) continue;
        prev.set(n, c); q.push(n);
      }
    }
    if (!prev.has(goal)) return null;
    const path = [];
    for (let c = goal; c !== start && c >= 0; c = prev.get(c)) path.push({ x: (c % cols + 0.5) * TILE, y: (((c / cols) | 0) + 0.5) * TILE });
    return path.reverse();
  }
  function navTo(ent, battle, x, y, dt, mult) {
    const to = { x, y };
    if (clearPath(battle, ent, to, ent.radius)) { ent._nav = null; return battle.moveTo(ent, x, y, dt, mult); }
    const key = Math.floor(x / TILE) + ',' + Math.floor(y / TILE);
    let nav = ent._nav;
    if (!nav || nav.key !== key || battle.time - nav.t > NAV_TTL) nav = ent._nav = { key, t: battle.time, path: navPath(battle, ent, to) || [], k: 0 };
    while (nav.k < nav.path.length && dist(ent, nav.path[nav.k]) <= 6) nav.k++;
    if (nav.k >= nav.path.length) return battle.moveTo(ent, x, y, dt, mult);
    // 앞의 웨이포인트 중 직선으로 보이는 가장 먼 것(최대 4칸 앞)으로 — 계단식 움직임을 줄인다
    let wp = nav.path[nav.k];
    for (let k = Math.min(nav.path.length - 1, nav.k + 4); k > nav.k; k--) if (clearPath(battle, ent, nav.path[k], ent.radius)) { wp = nav.path[k]; nav.k = k; break; }
    return battle.moveTo(ent, wp.x, wp.y, dt, mult);
  }
  function follow(ent, battle, dt) {
    const p = battle.player;
    if (!alive(p)) { ent.state = 'idle'; return; }
    const spot = formationSpot(ent, battle, p);
    const d = dist(ent, spot);
    if (d <= FOLLOW_SLACK) { ent.state = 'idle'; return; }
    ent.target = null;
    const mult = d > CATCHUP_DIST ? CATCHUP_SPEED : 1.1;
    // 가까우면 바로, 멀고 벽에 가리면 발자국을 따라간다
    const go = d <= CATCHUP_DIST * 2 || clearPath(battle, ent, spot, ent.radius) ? spot : (trailPoint(ent, battle) || spot);
    battle.moveTo(ent, go.x, go.y, dt, mult);
  }
  function formationSpot(ent, battle, p) {
    const [dx, dy] = DIRS[p.dir] || DIRS.down;
    const px = -dy, py = dx;                                    // 진행 방향의 수직
    const same = battle.members.filter((m) => m.role === ent.role);
    const side = same.indexOf(ent) % 2 === 0 ? 1 : -1, lane = Math.floor(same.indexOf(ent) / 2) + 1;
    // 전부 힐러에게서 1.5타일(48px) 안: 탱커 앞 36, 근딜 옆 30, 원딜 뒤 30 + 옆 20
    if (ent.role === 'tank') return { x: p.x + dx * 36 + px * 20 * side * (lane - 1), y: p.y + dy * 36 + py * 20 * side * (lane - 1) };
    if (ent.role === 'ranged') return { x: p.x - dx * 30 + px * 20 * side * lane, y: p.y - dy * 30 + py * 20 * side * lane };
    return { x: p.x + dx * 12 + px * 30 * side * lane, y: p.y + dy * 12 + py * 30 * side * lane };
  }

  // ---- 역할별 전투 ----
  function useAttackSkills(ent, battle, tgt) {
    for (const def of skillsOf(ent)) {
      if (def.type !== 'attack') continue;
      const reach = def.dash ? (def.range || 5 * TILE) : (ent.range || 40);
      if (!inRange(ent, tgt, reach)) continue;
      if (battle.useSkill(ent, def.id, tgt).ok) return true;
    }
    return false;
  }
  function tank(ent, battle, foes, dt) {
    const healerUid = battle.player ? battle.player.uid : null;
    const tgt = foes.find((m) => m.target === healerUid) || foes.find((m) => m.target && m.target !== ent.uid) || nearest(foes, ent);
    ent.target = tgt.uid;
    const taunt = typeof Skills !== 'undefined' ? Skills.get('taunt') : null;
    if (taunt && foes.some((m) => m.target !== ent.uid && dist(m, ent) <= (taunt.radius || 4 * TILE))) battle.useSkill(ent, 'taunt');
    if (!inRange(ent, tgt, ent.range || 40)) return approach(ent, battle, tgt, dt);
    useAttackSkills(ent, battle, tgt);
  }
  // 딜러 대상: 힐러를 노리는 놈 → (보스·중간보스 전엔) 탱커의 대상 → 내게 가장 가까운 놈.
  // 무리 사냥에서 넷이 한 마리를 노리면 한 방에 죽어 나머지 타격이 낭비되므로 일반 몬스터는 각자 가까운 놈을 친다.
  function dpsTarget(ent, battle, foes) {
    const healerUid = battle.player ? battle.player.uid : null;
    const onHealer = foes.filter((m) => m.target === healerUid);
    if (onHealer.length) return nearest(onHealer, ent);
    const shared = sharedTarget(battle, foes);
    if (shared && shared.tier !== 'normal') return shared;
    return nearest(foes, ent) || shared;
  }
  function melee(ent, battle, foes, dt) {
    const tgt = dpsTarget(ent, battle, foes);
    ent.target = tgt.uid;
    if (inRange(ent, tgt, ent.range || 40)) { useAttackSkills(ent, battle, tgt); return; }
    if (useAttackSkills(ent, battle, tgt)) return;                 // 돌진기는 멀리서도 쓴다
    const spot = rearSpot(ent, battle, tgt);
    if (!clearPath(battle, ent, spot, ent.radius) || !battle.moveTo(ent, spot.x, spot.y, dt, CHASE_SPEED)) approach(ent, battle, tgt, dt);
  }
  function ranged(ent, battle, foes, dt) {
    const tgt = dpsTarget(ent, battle, foes);
    ent.target = tgt.uid;
    const d = dist(ent, tgt), maxR = Math.min(ent.range || RANGED_MAX, RANGED_MAX);
    if (d > maxR) return approach(ent, battle, tgt, dt, maxR * 0.9);
    if (d < RANGED_MIN && canRetreat(ent, battle, tgt)) { retreat(ent, battle, tgt, dt); return; }
    useAttackSkills(ent, battle, tgt);
  }
  // 나를 쫓는 놈에게서 물러나 봐야 끝없이 끌려다닐 뿐이라, 다른 사람을 노리는 몬스터에게서만 거리를 벌린다.
  // 힐러(없으면 탱커)에게서 너무 멀어지지도 않는다.
  function canRetreat(ent, battle, tgt) {
    if (tgt.target === ent.uid) return false;
    const anchor = alive(battle.player) ? battle.player : battle.members.find((m) => alive(m) && m.role === 'tank');
    return !anchor || dist(ent, anchor) < RETREAT_LEASH;
  }
  // 탱커가 붙잡고 있는 대상을 함께 때린다(딜 집중)
  function sharedTarget(battle, foes) {
    const tank = battle.members.find((m) => alive(m) && m.role === 'tank' && m.target);
    return tank ? foes.find((m) => m.uid === tank.target) || null : null;
  }
  function approach(ent, battle, tgt, dt, stopAt) {
    const d = dist(ent, tgt), stop = stopAt != null ? stopAt : 0;
    if (d <= stop) return;
    navTo(ent, battle, tgt.x, tgt.y, dt, CHASE_SPEED);
  }
  function retreat(ent, battle, tgt, dt) {
    const d = dist(ent, tgt) || 1;
    const to = { x: ent.x + ((ent.x - tgt.x) / d) * TILE, y: ent.y + ((ent.y - tgt.y) / d) * TILE };
    if (!battle.moveTo(ent, to.x, to.y, dt)) ent.state = 'idle';
  }
  // 근딜의 자리: 탱커(없으면 힐러) 반대편
  function rearSpot(ent, battle, tgt) {
    const from = battle.members.find((m) => alive(m) && m.role === 'tank') || battle.player || ent;
    const d = dist(tgt, from) || 1, gap = tgt.radius + ent.radius + 6;
    return { x: tgt.x + ((tgt.x - from.x) / d) * gap, y: tgt.y + ((tgt.y - from.y) / d) * gap };
  }

  return { update, findFoes, exitPoint, formationSpot, RANGED_MIN, RANGED_MAX, DODGE_FOREST, DODGE_CAVE };
})();
if (typeof module !== 'undefined') module.exports = AIParty;
