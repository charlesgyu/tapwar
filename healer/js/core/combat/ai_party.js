// 파티원 AI — DESIGN.md §8.1
// 탱커: 힐러를 노리는 놈 우선 → 가장 가까운 교전 몬스터, 도발 쿨마다. 근딜: 탱커의 대상을 뒤에서. 원딜: 150~220px 유지.
// 비전투: 플레이어 주위 1.5타일 안 대형으로 바짝 붙어 따라간다(멀어지면 빠르게 따라잡음). 탐색 중 8타일 안의 몬스터는 바로 덮친다.
//   단, battle.lead 가 켜져 있으면(자동 탐험) "앞장서는 사람"(탱커 → HP 높은 근딜 → 아무나)이 경로를 따라 먼저 걷고,
//   나머지는 그 발자국을 따라가며, 무리 앞에서는 멈춰 "준비하세요!" → 파티가 모이면 돌진한다(풀링). 힐러(플레이어)는 씬이 뒤에 세운다.
// 생존: 딜러는 HP 30% 아래(마지막 전투원이 아니면)면 힐러 쪽으로 빠졌다가 60% 넘으면 복귀, 탱커는 25% 아래면 잠깐 힐러 쪽으로 물러선다(도발은 계속).
// 텔레그래프 안이면 확률(숲 90%, 동굴 2/3)로 빠져나온다.
// 실제 피해·위협은 Combat 이 처리하므로 여기서는 대상·위치·스킬 요청만 한다.
const AIParty = (() => {
  const TILE = 32;
  const DODGE_FOREST = 0.9, DODGE_CAVE = 2 / 3, DODGE_MARGIN = 16;
  const RANGED_MIN = 150, RANGED_MAX = 220;
  const FOLLOW_SLACK = 16, ENGAGE_RANGE = 8 * TILE, MAX_CHASE = 12 * TILE, RETREAT_LEASH = 8 * TILE;
  // 빠른 템포: 파티는 힐러 주위 1.5타일 안에 덩어리로 붙어 다니고(뒤처지면 ×1.5 로 따라잡음), 적에게는 ×1.25 로 달려든다.
  const CATCHUP_DIST = 0.75 * TILE, CATCHUP_SPEED = 1.6, CHASE_SPEED = 1.25;
  const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
  // 생존: 딜러 30% 미만이면 빠지고 60% 넘으면 복귀(최대 8초, 다시 빠지기까지 5초). 탱커는 25% 미만이면 2.2초 물러섰다 복귀(45%↑, 쿨 8초).
  const RETREAT_HP = 0.30, RETURN_HP = 0.60, RETREAT_MAX = 8, RETREAT_CD = 5, RETREAT_SPEED = 1.15;
  const TANK_BACK_HP = 0.25, TANK_OK_HP = 0.45, TANK_BACK_MAX = 2.2, TANK_BACK_CD = 8;
  // 앞장서기(battle.lead): 걷는 속도는 힐러가 따라올 수 있게 힐러 속도의 90%, 힐러가 6타일 넘게 처지면 기다린다.
  // 무리 9타일 앞에서 멈춰 1.2초(파티가 모이면) ~ 3초(안 모여도) 기다린 뒤 돌진. 같은 무리는 30초 안에 다시 멈추지 않는다.
  const LEAD_PACE = 0.9, LEAD_WAIT_R = 6 * TILE, LEAD_STUCK = 2.5;
  const PULL_STOP = 9 * TILE, PULL_WAIT = 1.2, PULL_MAX_WAIT = 3, PULL_GIVEUP = 7, PULL_REPEAT = 30;
  const GATHER_HEALER = 4.5 * TILE, GATHER_MATE = 4 * TILE;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  const nearest = (list, from) => list.reduce((best, m) => (!best || dist(m, from) < dist(best, from) ? m : best), null);
  const inRange = (a, b, range) => dist(a, b) <= range + a.radius + b.radius;
  const isForest = (floor) => (typeof Floors !== 'undefined' && Floors.isForest ? Floors.isForest(floor) : floor <= 5);
  const skillsOf = (ent) => (typeof Skills !== 'undefined' && Skills.member ? Skills.member(ent.cls) : []);

  function update(ent, battle, dt) {
    recordTrail(battle);
    recordLeadTrail(battle);
    if (!alive(ent)) { ent.retreat = null; return; }
    if (ent.cast) return;
    if (dodge(ent, battle, dt)) return;
    const foes = findFoes(ent, battle);
    if (!foes.length) {
      if (ent.retreat) endRetreat(ent, battle, false);
      const L = activeLead(battle);
      if (L && L.leader === ent) return leadWalk(ent, battle, L, dt);
      if (L) return followLeader(ent, battle, L, dt);
      return follow(ent, battle, dt);
    }
    if (survive(ent, battle, foes, dt)) return;
    if (ent.role === 'tank') tank(ent, battle, foes, dt);
    else if (ent.role === 'ranged') ranged(ent, battle, foes, dt);
    else melee(ent, battle, foes, dt);
  }

  // 교전 몬스터 + 바로 근처에서 발견한 몬스터. 힐러에게서 너무 먼 놈은 쫓지 않는다(파티가 흩어지지 않게).
  function findFoes(ent, battle) {
    // 힐러가 쓰러져 있어도 그 자리가 기준(파티원이 지키다 일으켜 세운다) — 기준을 자기 자신으로 바꾸면 사슬처럼 끌려가 보스까지 간다
    const anchor = battle.player || ent;
    // 아직 안 덤빈 몬스터는 "힐러" 기준 8타일 안만 덮친다(파티원 자기 기준으로 잡으면 사슬처럼 끌려가 덩어리가 흩어진다). 복귀 중인 놈은 쫓지 않는다.
    const near = battle.activeMonsters().filter((m) => !m.returning && dist(m, anchor) <= ENGAGE_RANGE);
    const set = new Set(battle.engagedMonsters().concat(near));
    return Array.from(set).filter((m) => alive(m) && !m.returning && dist(m, anchor) <= MAX_CHASE);
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
    if (!p) { ent.state = 'idle'; return; }
    const spot = formationSpot(ent, battle, p);   // 쓰러진 힐러 곁으로도 모인다(Floor 가 교전이 끝나면 일으켜 세운다)
    const d = dist(ent, spot);
    if (d <= FOLLOW_SLACK) { ent.state = 'idle'; return; }
    ent.target = null;
    const mult = d > CATCHUP_DIST ? CATCHUP_SPEED : 1.1;
    // 가까우면 바로, 멀고 벽에 가리면 발자국을 따라간다
    const go = d <= TILE * 1.5 || clearPath(battle, ent, spot, ent.radius) ? spot : (trailPoint(ent, battle) || spot);
    battle.moveTo(ent, go.x, go.y, dt, mult);
  }
  function formationSpot(ent, battle, p) {
    const [dx, dy] = DIRS[p.dir] || DIRS.down;
    const px = -dy, py = dx;                                    // 진행 방향의 수직
    const same = battle.members.filter((m) => m.role === ent.role);
    const side = same.indexOf(ent) % 2 === 0 ? 1 : -1, lane = Math.floor(same.indexOf(ent) / 2) + 1;
    // 전부 힐러에게서 1타일(32px) 남짓: 탱커 앞 30, 근딜 옆 24, 원딜 뒤 24 + 옆 16 — 레퍼런스처럼 한 덩어리로 붙어 다닌다
    if (ent.role === 'tank') return { x: p.x + dx * 30 + px * 18 * side * (lane - 1), y: p.y + dy * 30 + py * 18 * side * (lane - 1) };
    if (ent.role === 'ranged') return { x: p.x - dx * 24 + px * 16 * side * lane, y: p.y - dy * 24 + py * 16 * side * lane };
    return { x: p.x + dx * 10 + px * 24 * side * lane, y: p.y + dy * 10 + py * 24 * side * lane };
  }

  // ---- 앞장서기(battle.lead): 자동 탐험에서 탱커가 길을 열고 나머지가 뒤따른다 ----
  // battle.lead = { on, pts: [{x,y}], k, goal, state: 'walk'|'arrived'|'wait'|'ready'|'pull'|'stuck'|'hold', leader(ent), pull, stuck }
  // 씬/시뮬이 lead(battle, pts, goal) 로 경로를 주고, 전투가 시작되면(적이 보이면) 평소 전투 AI 가 이어받는다.
  // 앞장서는 사람: 탱커 → (없으면) 최대 HP 가 가장 큰 근딜 → 아무 파티원. 파티원이 없으면 null(힐러가 앞장서는 예전 방식).
  function leaderOf(battle) {
    const ms = battle.members.filter(alive);
    if (!ms.length) return null;
    const byHp = (list) => list.reduce((b, m) => (!b || m.maxHp > b.maxHp ? m : b), null);
    return ms.find((m) => m.role === 'tank') || byHp(ms.filter((m) => m.role === 'melee')) || byHp(ms);
  }
  function activeLead(battle) {
    const L = battle.lead;
    if (!L || !L.on) return null;
    const ld = leaderOf(battle);
    if (!ld) return null;
    if (L.leader !== ld) { L.leader = ld; battle._leadTrail = [{ x: ld.x, y: ld.y }]; }
    return L;
  }
  // 경로를 주며 앞장서기를 켠다. pts 가 비어 있으면 제자리에서 기다린다(휴식·대기).
  function lead(battle, pts, goal) {
    const L = battle.lead && battle.lead.on ? battle.lead : (battle.lead = { on: true, pts: [], k: 0, goal: null, state: 'hold', leader: null, pull: null, stuck: 0 });
    L.pts = (pts || []).slice(); L.k = 0; L.goal = goal || null; L.stuck = 0;
    if (!L.pts.length) L.pull = null;                            // 멈추라는데(휴식·전투) 준비 중이던 풀링은 취소
    L.state = L.pts.length ? 'walk' : 'hold';
    activeLead(battle);
    return L;
  }
  function unlead(battle) { battle.lead = null; }
  function recordLeadTrail(battle) {
    const L = battle.lead; if (!L || !L.on || !alive(L.leader)) return;
    const tr = battle._leadTrail || (battle._leadTrail = []);
    const last = tr[tr.length - 1], ld = L.leader;
    if (last && Math.hypot(ld.x - last.x, ld.y - last.y) < TRAIL_STEP) return;
    tr.push({ x: ld.x, y: ld.y });
    if (tr.length > TRAIL_MAX) tr.shift();
  }
  // 앞장서는 사람이 걸어온 발자국을 거슬러 back(px) 만큼 뒤의 지점. side(px) 는 그 자리에서 진행 방향 옆으로(설 수 없으면 0).
  // 발자국이 짧으면(막 출발) 바라보는 방향의 반대쪽으로 편다.
  function behindSpot(battle, back, side = 0, r = 8) {
    const L = battle.lead, ld = L && L.leader;
    if (!ld) return null;
    const tr = battle._leadTrail || [];
    let prev = { x: ld.x, y: ld.y }, acc = 0, spot = null, dir = null;
    for (let k = tr.length - 1; k >= 0 && !spot; k--) {
      const q = tr[k], d = dist(prev, q);
      if (d < 0.01) continue;
      if (acc + d >= back) { const t = (back - acc) / d; spot = { x: prev.x + (q.x - prev.x) * t, y: prev.y + (q.y - prev.y) * t }; dir = { x: (prev.x - q.x) / d, y: (prev.y - q.y) / d }; }
      else { acc += d; prev = q; dir = { x: (ld.x - q.x) || 0, y: (ld.y - q.y) || 0 }; }
    }
    if (!spot) {
      const [dx, dy] = DIRS[ld.dir] || DIRS.down, left = back - acc;
      const cand = { x: prev.x - dx * left, y: prev.y - dy * left };
      spot = battle.canStand(cand.x, cand.y, r) && clearPath(battle, prev, cand, r) ? cand : prev;
      dir = { x: dx, y: dy };
    }
    if (side && dir) {
      const L2 = Math.hypot(dir.x, dir.y) || 1, px = -dir.y / L2, py = dir.x / L2;
      const s2 = { x: spot.x + px * side, y: spot.y + py * side };
      if (battle.canStand(s2.x, s2.y, r) && clearPath(battle, spot, s2, r)) return s2;
    }
    return spot;
  }
  // 따라가는 순서: 근딜 → 원딜 → 그 밖(같은 역할은 파티 순서). 두 명씩 줄을 선다.
  function followerSlot(ent, battle, L) {
    const order = { tank: 0, melee: 1, healer: 3, ranged: 2 };
    const list = battle.members.filter((m) => alive(m) && m !== L.leader).sort((a, b) => (order[a.role] || 0) - (order[b.role] || 0) || battle.members.indexOf(a) - battle.members.indexOf(b));
    const i = Math.max(0, list.indexOf(ent));
    return { back: 34 + Math.floor(i / 2) * 24, side: (i % 2 ? -1 : 1) * 14 };
  }
  function followLeader(ent, battle, L, dt) {
    const slot = followerSlot(ent, battle, L);
    const spot = behindSpot(battle, slot.back, slot.side, ent.radius);
    if (!spot) return follow(ent, battle, dt);
    const d = dist(ent, spot);
    if (d <= 10) { ent.state = 'idle'; return; }
    ent.target = null;
    navTo(ent, battle, spot.x, spot.y, dt, d > TILE ? CATCHUP_SPEED : 1.1);
  }
  function partyGathered(ent, battle) {
    const p = battle.player;
    if (alive(p) && dist(p, ent) > GATHER_HEALER) return false;
    return battle.members.every((m) => !alive(m) || m === ent || dist(m, ent) <= GATHER_MATE);
  }
  // 풀링: 길 앞(9타일 안)에 아직 안 덤빈 몬스터가 보이면 멈춰 "준비하세요!" → 파티가 모이면(1.2초 이상) 또는 3초 뒤 돌진.
  // 몬스터가 덤비면(aggro) 다음 틱부터는 전투 AI(도발 포함)가 이어받는다.
  function pullStep(ent, battle, L, dt) {
    const now = battle.time, pull = L.pull;
    if (pull) {
      const tgt = battle.byUid(pull.uid);
      if (!alive(tgt) || tgt.aggro || tgt.returning || now - pull.t0 > PULL_GIVEUP) { L.pull = null; return false; }
      if (pull.phase === 'ready') {
        ent.state = 'idle'; ent.target = null; L.state = 'ready';
        const dx = tgt.x - ent.x, dy = tgt.y - ent.y;
        ent.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        if ((now - pull.t0 >= PULL_WAIT && partyGathered(ent, battle)) || now - pull.t0 >= PULL_MAX_WAIT) { pull.phase = 'go'; pull.tGo = now; }
        return true;
      }
      L.state = 'pull';
      navTo(ent, battle, tgt.x, tgt.y, dt, CHASE_SPEED);
      return true;
    }
    if (L.k >= L.pts.length) return false;                     // 쉬는 중(경로 없음)엔 먼저 덤비지 않는다
    const pulled = battle._pulled || (battle._pulled = {});
    let near = null, nd = PULL_STOP;
    for (const m of battle.activeMonsters()) {
      if (m.aggro || m.returning) continue;
      const d = dist(m, ent);
      if (d < nd && !(pulled[m.groupId || m.uid] > now - PULL_REPEAT)) { nd = d; near = m; }
    }
    if (!near) return false;
    pulled[near.groupId || near.uid] = now;
    const g = near.groupId != null ? battle.monsters.filter((m) => alive(m) && m.groupId === near.groupId) : [near];
    L.pull = { uid: near.uid, groupId: near.groupId, phase: 'ready', t0: now, size: g.length, tier: g.some((m) => m.tier === 'boss') ? 'boss' : g.some((m) => m.tier === 'miniboss') ? 'miniboss' : 'normal' };
    return pullStep(ent, battle, L, dt);
  }
  function leadWalk(ent, battle, L, dt) {
    if (pullStep(ent, battle, L, dt)) return;
    const p = battle.player;
    if (L.k >= L.pts.length) { ent.state = 'idle'; if (L.state === 'walk') L.state = 'arrived'; return; }
    if (alive(p) && dist(ent, p) > LEAD_WAIT_R) { ent.state = 'idle'; L.state = 'wait'; return; }
    while (L.k < L.pts.length && dist(ent, L.pts[L.k]) <= 8) L.k++;
    if (L.k >= L.pts.length) { ent.state = 'idle'; L.state = 'arrived'; return; }
    let wp = L.pts[L.k];
    for (let k = Math.min(L.pts.length - 1, L.k + 4); k > L.k; k--) if (clearPath(battle, ent, L.pts[k], ent.radius)) { wp = L.pts[k]; L.k = k; break; }
    const mult = alive(p) && ent.speed > 0 ? Math.min(1, (p.speed * LEAD_PACE) / ent.speed) : 1;
    ent.target = null;
    const bx = ent.x, by = ent.y;
    battle.moveTo(ent, wp.x, wp.y, dt, mult);
    L.state = 'walk';
    if (Math.hypot(ent.x - bx, ent.y - by) > 0.3 || (ent.stats && ent.stats.rooted)) L.stuck = 0;
    else if ((L.stuck += dt) > LEAD_STUCK) L.state = 'stuck';
  }

  // ---- 생존: 다치면 빠졌다가 회복되면 돌아온다 ----
  // ent.retreat = { since, until, tank? } 동안은 힐러 쪽(공격자 반대편)으로 물러난다. 끝나면 ent.lastReturn = { t, recovered }.
  function lastFighter(ent, battle) { return !battle.members.some((m) => m !== ent && alive(m) && !m.retreat); }
  function endRetreat(ent, battle, recovered) {
    const R = ent.retreat; if (!R) return;
    ent.retreat = null;
    ent.retreatCd = battle.time + (R.tank ? TANK_BACK_CD : RETREAT_CD);
    ent.lastReturn = { t: battle.time, recovered: !!recovered, tank: !!R.tank };
  }
  function survive(ent, battle, foes, dt) {
    const r = ent.hp / ent.maxHp, now = battle.time, isTank = ent.role === 'tank';
    const healer = alive(battle.player) ? battle.player : null;
    if (ent.retreat) {
      const ok = r >= (isTank ? TANK_OK_HP : RETURN_HP);
      if (ok || now >= ent.retreat.until || (!isTank && lastFighter(ent, battle))) { endRetreat(ent, battle, ok); return false; }
      if (isTank) { tankBack(ent, battle, foes, healer, dt); return true; }
      retreatMove(ent, battle, foes, healer, dt);
      return true;
    }
    if (now < (ent.retreatCd || 0)) return false;
    if (isTank) {
      if (r < TANK_BACK_HP && healer && dist(ent, healer) > 1.5 * TILE) { ent.retreat = { since: now, until: now + TANK_BACK_MAX, tank: true }; tankBack(ent, battle, foes, healer, dt); return true; }
      return false;
    }
    if (r < RETREAT_HP && !lastFighter(ent, battle)) {
      ent.retreat = { since: now, until: now + RETREAT_MAX };
      retreatMove(ent, battle, foes, healer, dt);
      return true;
    }
    return false;
  }
  // 탱커: 도발은 계속 쓰면서 힐러 쪽으로 반걸음 물러선다(대상은 그대로 — 사거리 안이면 평타도 친다)
  function tankBack(ent, battle, foes, healer, dt) {
    const taunt = typeof Skills !== 'undefined' ? Skills.get('taunt') : null;
    if (taunt && foes.some((m) => m.target !== ent.uid && dist(m, ent) <= (taunt.radius || 4 * TILE))) battle.useSkill(ent, 'taunt');
    if (!ent.target || !alive(battle.byUid(ent.target))) ent.target = nearest(foes, ent).uid;
    if (!healer || ent.cast) return;
    if (dist(ent, healer) > 1.2 * TILE) navTo(ent, battle, healer.x, healer.y, dt);
  }
  // 딜러: 나를 노리는 놈들(없으면 가장 가까운 적)의 반대편, 힐러 바로 뒤로 간다. 이미 거기면 힐러 반경 안에서 한 칸 더 벌린다.
  // 원딜은 대상을 유지해 물러나며 쏘고, 근딜은 손을 뗀다.
  function retreatMove(ent, battle, foes, healer, dt) {
    const mine = foes.filter((m) => m.target === ent.uid);
    const threat = mine.length ? mine : [nearest(foes, ent)];
    let cx = 0, cy = 0; for (const m of threat) { cx += m.x; cy += m.y; } cx /= threat.length; cy /= threat.length;
    const anchor = healer || battle.members.find((m) => alive(m) && m.role === 'tank' && m !== ent) || ent;
    let ax = anchor.x - cx, ay = anchor.y - cy; const AL = Math.hypot(ax, ay) || 1; ax /= AL; ay /= AL;
    let spot = { x: anchor.x + ax * 1.5 * TILE, y: anchor.y + ay * 1.5 * TILE };
    if (!battle.canStand(spot.x, spot.y, ent.radius)) spot = { x: anchor.x, y: anchor.y };
    if (dist(ent, spot) < 20) {
      const near = nearest(threat, ent), d = dist(ent, near) || 1;
      const away = { x: ent.x + ((ent.x - near.x) / d) * 2 * TILE, y: ent.y + ((ent.y - near.y) / d) * 2 * TILE };
      if (d < 2 * TILE && battle.canStand(away.x, away.y, ent.radius) && dist(away, anchor) < 4 * TILE) spot = away;
    }
    if (ent.role === 'ranged') { const t = dpsTarget(ent, battle, foes); ent.target = t ? t.uid : null; }
    else ent.target = null;
    if (dist(ent, spot) > 6) navTo(ent, battle, spot.x, spot.y, dt, RETREAT_SPEED);
    else ent.state = 'idle';
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

  return { update, findFoes, exitPoint, formationSpot, leaderOf, lead, unlead, behindSpot, activeLead, RANGED_MIN, RANGED_MAX, DODGE_FOREST, DODGE_CAVE,
    RETREAT_HP, RETURN_HP, TANK_BACK_HP, PULL_STOP, PULL_WAIT };
})();
if (typeof module !== 'undefined') module.exports = AIParty;
