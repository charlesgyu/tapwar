// 던전 씬 — DESIGN §9(Floor) · §8(battle) · §10(그래픽) · §11(씬/UI 계약)
// 층 런타임(Floor)·전투(Combat)·AI 는 core 가 전부 처리하고, 이 씬은 "보여 주기 + 조작 + 흐름(인트로/결과/귀환)" 만 맡는다.
//  - 자동 힐/자동 회피는 battle.update 안에서 AIHealer.update 가 이미 돈다(driveHealer 기본 true). 씬이 또 부르면 같은 틱 중복 방지
//    덕에 큰 사고는 없지만 계약(DESIGN §8 "Floor/scene 이 또 부르면 안 됨")을 지키려고 설정 토글만 한다.
//  - HUD 는 DOM(#dhud, css/hud.css). 값이 바뀔 때만, 초당 10회까지만 건드린다(모바일 레이아웃 비용).
const DungeonScene = (() => {
  const TILE = 32, CHUNK_T = 16, CHUNK_PX = CHUNK_T * TILE, CHUNK_MAX = 30;
  const HUD_EVERY = 0.1;                     // HUD 갱신 주기(초)
  const MANUAL_HOLD = 1.5;                   // 수동 조작 뒤 이 시간 동안은 자동 이동(따라가기·탐험)을 하지 않는다
  const FOLLOW_START = 3 * TILE, FOLLOW_FORCE = 7 * TILE, FOLLOW_STOP = 24, FOLLOW_BEHIND = 2 * TILE;
  const TAP_PICK_R = 18;                     // 파티원 탭 판정 반경(px, 몸통 중심 기준)
  const ASTAR_BUDGET = 14000;                // 탭 길찾기 노드 상한(160×160 맵 전체를 뒤지지 않게)
  const ACTIVE_R = (typeof Combat !== 'undefined' && Combat.ACTIVE_RANGE) || 20 * TILE;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;

  // 스킬 표시용 아이콘(데이터에 아이콘이 없어서 씬이 정한다)
  const SKILL_ICON = {
    heal_basic: '💚', heal_fast: '💨', heal_instant: '⚡', aoe_2: '🌊', aoe_3: '🌊', aoe_ground: '⭕', cleanse: '🧪',
    buff_def: '🛡️', buff_atk: '⚔️', buff_aspd: '🌀', buff_spd: '👟', buff_eva: '🌫️', buff_mana: '💧',
    holy_light: '☀️', resurrect: '🕊️', smite: '✝️',
  };
  const ROLE_ICON = { tank: '🛡️', melee: '⚔️', ranged: '🏹', healer: '✚' };
  const CURSE_ICON = { dot: '☠', def_down: '🛡', atk_down: '🗡', aspd_down: '🐌', spd_down: '🥾', heal_down: '💔', root: '⛓' };
  // 직업 전용 스프라이트가 아직 없으면 직업 느낌이 나는 마을 주민 외형으로(전부 같은 얼굴이면 누가 누군지 모른다)
  const CLASS_LOOK = { warrior: 'knight', monk: 'villagerA', mage: 'villagerC', hunter: 'villagerD', rogue: 'villagerB', spellblade: 'villagerE', priest: 'priest' };
  const SINGLE = ['heal_basic', 'heal_fast', 'heal_instant'];
  const AOE = ['aoe_2', 'aoe_3', 'aoe_ground'];
  const BUFFS = ['buff_def', 'buff_atk', 'buff_aspd', 'buff_spd', 'buff_eva', 'buff_mana'];
  const REASON = {
    cooldown: '아직 쿨타임이에요', mp: 'MP가 부족해요', locked: '아직 배우지 않은 스킬이에요', no_target: '대상이 없어요',
    dead: '쓰러져 있어서 쓸 수 없어요', casting: '다른 주문을 시전 중이에요', ended: '전투가 끝났어요', no_skill: '알 수 없는 스킬',
  };

  // ---------------- 상태 ----------------
  let G = null, fs = null, map = null, battle = null, player = null, floorNo = 1;
  let time = 0, hudAcc = 0, manualT = 99, ending = false, blockers = 0;
  let route = null;                          // { kind: 'tap'|'explore'|'follow', pts: [{x,y}], stuck, at }
  let followMoving = false, tapMark = null, selUid = null;
  const explore = { on: false, target: null, done: new Set(), unreachable: new Set(), rest: 0, wait: 0, lead: 0, status: '' };
  const chunks = new Map();                  // 'ci,cj' → canvas (LRU: Map 삽입 순서 = 오래된 순)
  const anim = new Map();                    // uid → { px, py, t, frame, atk, moving }
  let unsubs = [];
  let hud = null;
  let runStats = null;
  let fogStyle = 'rgba(8, 6, 16, 0.62)';

  // ---------------- 유틸 ----------------
  function settings() { return (G.player.settings = G.player.settings || { autoHeal: true, autoDodge: false, autoFollow: true }); }
  function skillLv(id) { return typeof Level !== 'undefined' && Level.skillLevel ? Level.skillLevel(G, id) : ((G.player.skillLevels || {})[id] || 0); }
  function unlocked(id) { return skillLv(id) >= 1; }
  function toast(msg, ms) { if (typeof UI !== 'undefined') UI.toast(msg, ms); }
  function byUid(uid) { return uid ? battle.byUid(uid) : null; }
  function sheetFor(ent) {
    if (ent.kind === 'monster') return MonsterSprites.forDef(ent.def);
    if (ent.kind === 'player') return Sprites.get('player');
    const pal = Sprites.NPC_PALETTES || {};
    return Sprites.get(pal[ent.cls] ? ent.cls : (CLASS_LOOK[ent.cls] || 'villagerA'));
  }
  function canStandLine(a, b, r) {
    const n = Math.ceil(dist(a, b) / 8);
    for (let k = 1; k <= n; k++) { const t = k / n; if (!battle.canStand(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r)) return false; }
    return true;
  }
  function totalXp(p) { return (typeof Level !== 'undefined' && Level.totalXpTo ? Level.totalXpTo(p.level) : 0) + (p.xp || 0); }

  // ---------------- 길찾기: A*(8방향, 모서리 끼임 방지, 노드 상한) ----------------
  // 160×160 = 25,600 칸. 배열을 씬 수명 동안 재사용하고 "스탬프"로 초기화를 대신해 탭마다 할당하지 않는다.
  let AS = null;
  function astarArrays() {
    const n = map.cols * map.rows;
    if (!AS || AS.n !== n) AS = { n, g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), closed: new Uint32Array(n), stamp: 0, hf: new Float32Array(n * 2), hi: new Int32Array(n * 2) };
    return AS;
  }
  function nearestOpen(i, j, R = 4) {
    if (!map.solid(i, j)) return [i, j];
    for (let r = 1; r <= R; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || map.solid(i + di, j + dj)) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }
  // 목표에 못 닿으면(상한 초과) 목표에 가장 가까웠던 칸까지의 경로를 돌려준다 — 멀리 찍어도 그쪽으로는 걸어간다
  function findPath(sx, sy, tx, ty, budget = ASTAR_BUDGET) {
    const cols = map.cols, A = astarArrays();
    const s = nearestOpen(Math.floor(sx / TILE), Math.floor(sy / TILE), 1), g = nearestOpen(Math.floor(tx / TILE), Math.floor(ty / TILE));
    if (!s || !g) return null;
    const stamp = ++A.stamp, start = s[1] * cols + s[0], goal = g[1] * cols + g[0];
    const h = (i, j) => { const dx = Math.abs(i - g[0]), dy = Math.abs(j - g[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    let size = 0;
    const push = (f, idx) => { let k = size++; A.hf[k] = f; A.hi[k] = idx; while (k > 0) { const p = (k - 1) >> 1; if (A.hf[p] <= A.hf[k]) break; [A.hf[p], A.hf[k]] = [A.hf[k], A.hf[p]]; [A.hi[p], A.hi[k]] = [A.hi[k], A.hi[p]]; k = p; } };
    const pop = () => {
      const top = A.hi[0]; size--; A.hf[0] = A.hf[size]; A.hi[0] = A.hi[size];
      let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < size && A.hf[l] < A.hf[m]) m = l; if (r < size && A.hf[r] < A.hf[m]) m = r; if (m === k) break; [A.hf[m], A.hf[k]] = [A.hf[k], A.hf[m]]; [A.hi[m], A.hi[k]] = [A.hi[k], A.hi[m]]; k = m; }
      return top;
    };
    A.seen[start] = stamp; A.g[start] = 0; A.came[start] = -1; push(h(s[0], s[1]), start);
    let best = start, bestH = h(s[0], s[1]), iter = 0, found = false;
    while (size > 0 && iter++ < budget && size < A.hf.length - 8) {
      const cur = pop();
      if (A.closed[cur] === stamp) continue;
      A.closed[cur] = stamp;
      if (cur === goal) { found = true; best = cur; break; }
      const ci = cur % cols, cj = (cur / cols) | 0;
      const hc = h(ci, cj); if (hc < bestH) { bestH = hc; best = cur; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (map.solid(ni, nj)) continue;
        if (di && dj && (map.solid(ci + di, cj) || map.solid(ci, cj + dj))) continue;
        const nk = nj * cols + ni; if (A.closed[nk] === stamp) continue;
        const ng = A.g[cur] + (di && dj ? 1.414 : 1);
        if (A.seen[nk] !== stamp || ng < A.g[nk]) { A.seen[nk] = stamp; A.g[nk] = ng; A.came[nk] = cur; push(ng + h(ni, nj), nk); }
      }
    }
    if (best === start && !found) return null;
    const pts = [];
    for (let k = best; k >= 0 && k !== start; k = A.came[k]) pts.push({ x: (k % cols + 0.5) * TILE, y: (((k / cols) | 0) + 0.5) * TILE });
    pts.reverse();
    // 정확히 찍은 자리로(그 칸이 열려 있을 때만)
    if (found && !map.solid(Math.floor(tx / TILE), Math.floor(ty / TILE)) && pts.length) pts[pts.length - 1] = { x: tx, y: ty };
    return pts;
  }
  // 자동 탐험용 BFS(4방향, 맵 전체 — 목표 후보 여럿의 실제 걸음 수를 한 번에 얻는다)
  let BF = null;
  function bfsFrom(i0, j0) {
    const cols = map.cols, n = cols * map.rows;
    if (!BF || BF.n !== n) BF = { n, dist: new Int32Array(n), prev: new Int32Array(n), q: new Int32Array(n) };
    BF.dist.fill(-1);
    const s = j0 * cols + i0; let h = 0, t = 0; BF.dist[s] = 0; BF.prev[s] = -1; BF.q[t++] = s;
    while (h < t) {
      const c = BF.q[h++], i = c % cols, j = (c / cols) | 0;
      for (let k = 0; k < 4; k++) {
        const ni = i + (k === 0 ? 1 : k === 1 ? -1 : 0), nj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (map.solid(ni, nj)) continue;
        const nc = nj * cols + ni; if (BF.dist[nc] >= 0) continue;
        BF.dist[nc] = BF.dist[c] + 1; BF.prev[nc] = c; BF.q[t++] = nc;
      }
    }
    return BF;
  }

  // ---------------- 이동 ----------------
  // 경로 따라가기. 다음 다음 점이 곧게 보이면 건너뛰어 계단 모양 걸음을 줄인다. 반환: 'arrived'|'stuck'|null
  function followRoute(dt) {
    if (!route || !route.pts) return 'arrived';
    const pts = route.pts;
    while (pts.length && dist(player, pts[0]) < 5) pts.shift();
    if (!pts.length) { route = null; return 'arrived'; }
    if (pts.length > 1 && canStandLine(player, pts[1], player.radius)) pts.shift();
    const bx = player.x, by = player.y;
    battle.moveTo(player, pts[0].x, pts[0].y, dt);
    if (Math.hypot(player.x - bx, player.y - by) > 0.2 || (player.stats && player.stats.rooted)) route.stuck = 0;
    else if ((route.stuck = (route.stuck || 0) + dt) > 1.2) { route = null; return 'stuck'; }
    return null;
  }

  // 전투 중 자동 따라가기: 파티 무게중심에서 적 반대쪽으로 2타일. 멀어졌을 때만 움직여 시전이 매번 끊기지 않게 한다.
  function followParty(dt) {
    const mates = battle.members.filter(alive);
    if (!mates.length) return;
    let cx = 0, cy = 0; for (const m of mates) { cx += m.x; cy += m.y; } cx /= mates.length; cy /= mates.length;
    const foes = battle.engagedMonsters();
    let fx = cx, fy = cy + 1;
    if (foes.length) { fx = 0; fy = 0; for (const f of foes) { fx += f.x; fy += f.y; } fx /= foes.length; fy /= foes.length; }
    let vx = cx - fx, vy = cy - fy; const L = Math.hypot(vx, vy) || 1; vx /= L; vy /= L;
    let spot = { x: cx + vx * FOLLOW_BEHIND, y: cy + vy * FOLLOW_BEHIND };
    if (!battle.canStand(spot.x, spot.y, player.radius)) spot = { x: cx, y: cy };
    const d = dist(player, spot);
    if (followMoving) { if (d < FOLLOW_STOP) { followMoving = false; route = null; return; } }
    else if ((d > FOLLOW_START && !player.cast) || d > FOLLOW_FORCE) followMoving = true;
    if (!followMoving) return;
    if (canStandLine(player, spot, player.radius)) { route = null; battle.moveTo(player, spot.x, spot.y, dt); return; }
    if (!route || route.kind !== 'follow' || time - route.at > 1) {
      const pts = findPath(player.x, player.y, spot.x, spot.y, 4000);
      route = pts ? { kind: 'follow', pts, at: time } : null;
      if (!route) { followMoving = false; return; }
    }
    if (followRoute(dt) === 'stuck') followMoving = false;
  }

  // ---------------- 자동 탐험 ----------------
  function groupAlive(g) { return battle.monsters.some((m) => m.groupId === g.id && m.alive); }
  function exploreCandidates() {
    const list = [];
    for (const g of map.groups) {
      if (explore.done.has(g.id) || explore.unreachable.has(g.id) || fs.groupsFought.has(g.id)) continue;
      if (!groupAlive(g)) { explore.done.add(g.id); continue; }
      list.push({ kind: 'group', id: g.id, i: g.i, j: g.j, x: g.x, y: g.y, r: 2.5 * TILE });
    }
    // 숨긴 상자는 드러난 뒤에만 노린다(자동 탐험이 비밀을 대신 찾아 주면 NPC 힌트가 무의미해진다)
    for (const c of fs.chests) if (!c.opened && c.revealed && !explore.unreachable.has(c.id)) list.push({ kind: 'chest', id: c.id, i: c.i, j: c.j, x: c.x, y: c.y, r: 12 });
    if (fs.boss && fs.boss.alive && !explore.unreachable.has('boss')) list.push({ kind: 'boss', id: 'boss', i: map.boss.i, j: map.boss.j, x: map.boss.x, y: map.boss.y, r: 5 * TILE });
    if (fs.bossDefeated) list.push({ kind: 'exit', id: 'exit', i: map.exit.i, j: map.exit.j, x: map.exit.x, y: map.exit.y, r: 8 });
    return list;
  }
  function chooseExplore() {
    const i0 = Math.floor(player.x / TILE), j0 = Math.floor(player.y / TILE);
    const B = bfsFrom(i0, j0), cols = map.cols;
    let best = null;
    for (const c of exploreCandidates()) {
      const d = B.dist[c.j * cols + c.i];
      if (d < 0) { explore.unreachable.add(c.id); continue; }
      // 보스는 다른 볼일을 다 본 뒤에(가까워도 마지막) — 보스부터 가면 상자·무리 경험치를 놓친다
      const w = c.kind === 'boss' ? d + 100000 : d;
      if (!best || w < best.w) best = { w, c };
    }
    if (!best) return false;
    const pts = [];
    for (let k = best.c.j * cols + best.c.i; k >= 0 && k !== j0 * cols + i0; k = B.prev[k]) pts.push({ x: (k % cols + 0.5) * TILE, y: (((k / cols) | 0) + 0.5) * TILE });
    explore.target = best.c;
    route = { kind: 'explore', pts: pts.reverse(), at: time };
    return true;
  }
  // 몬스터가 보이면 탱커가 앞설 때까지 잠깐 멈춘다(힐러가 먼저 뛰어들면 어그로가 힐러에게 튄다)
  function waitForTank(dt) {
    const tank = battle.members.find((m) => alive(m) && m.role === 'tank');
    if (!tank) return false;
    let near = null, nd = 8 * TILE;
    for (const m of battle.activeMonsters()) { if (m.returning) continue; const d = dist(m, player); if (d < nd) { nd = d; near = m; } }
    if (!near || dist(tank, near) < nd) { explore.lead = 0; return false; }
    explore.lead += dt;
    return explore.lead < 3;
  }
  function exploreStep(dt) {
    const p = player;
    const low = battle.allies().some((e) => e.hp / e.maxHp < 0.6) || (p.maxMp > 0 && p.mp / p.maxMp < 0.35);
    if (low && explore.rest < 25) { explore.rest += dt; explore.status = '🍃 숨 고르는 중…'; return; }
    if (!low) explore.rest = 0;
    const far = battle.members.some((m) => alive(m) && dist(m, p) > 6 * TILE);
    if (far && explore.wait < 4) { explore.wait += dt; explore.status = '👥 파티를 기다리는 중…'; return; }
    if (!far) explore.wait = 0;
    if (waitForTank(dt)) { explore.status = '🛡️ 탱커가 앞장서기를 기다리는 중…'; return; }
    if (!route || route.kind !== 'explore' || !explore.target) {
      if (!chooseExplore()) { explore.on = false; explore.status = ''; toast('더 둘러볼 곳이 없어요'); return; }
    }
    const t = explore.target;
    explore.status = '🧭 ' + ({ group: '몬스터 무리', chest: '상자', boss: '보스', exit: '출구' }[t.kind] || '') + '(으)로 이동 중';
    const reached = dist(p, t) <= t.r;
    const r = reached ? 'arrived' : followRoute(dt);
    if (r === 'arrived') {
      if (t.kind === 'group') explore.done.add(t.id);
      else if (t.kind === 'chest') { const c = fs.chests.find((x) => x.id === t.id); if (c && !c.opened) explore.unreachable.add(t.id); }
      explore.target = null; route = null;
    } else if (r === 'stuck') { explore.unreachable.add(t.id); explore.target = null; route = null; }
  }

  // ---------------- 조작 ----------------
  function control(dt) {
    manualT += dt;
    if (!alive(player)) { route = null; followMoving = false; return; }
    const ax = Scenes.moveAxis();
    if (ax.len > 0) {
      manualT = 0; route = null; followMoving = false; explore.target = null;
      battle.moveTo(player, player.x + ax.x * 64, player.y + ax.y * 64, dt * ax.len);
      return;
    }
    // 자동 회피가 이번 틱에 피할 곳으로 데려갈 것이면 다른 이동은 끼어들지 않는다
    if (settings().autoDodge && typeof AIHealer !== 'undefined' && AIHealer.dodge(player, battle)) return;
    if (route && route.kind === 'tap') { followRoute(dt); return; }
    if (battle.inCombat()) {
      if (route && route.kind === 'explore') { route = null; explore.target = null; }
      explore.rest = 0; explore.status = explore.on ? '⚔️ 전투 중 — 탐험 일시정지' : '';
      if (settings().autoFollow !== false && manualT > MANUAL_HOLD) followParty(dt);
      return;
    }
    followMoving = false;
    if (route && route.kind === 'follow') route = null;
    if (explore.on && manualT > MANUAL_HOLD) exploreStep(dt);
    else explore.status = '';
  }

  function onTap(wx, wy) {
    if (!fs || ending) return;
    closePop();
    // 파티원(자신 포함)을 탭하면 수동 대상 지정
    let pick = null, pd = TAP_PICK_R;
    for (const e of battle.party()) { const d = Math.hypot(e.x - wx, e.y - 14 - wy); if (d < pd) { pd = d; pick = e; } }
    if (pick) { selectTarget(pick.uid); return; }
    if (!alive(player)) return;
    const pts = findPath(player.x, player.y, wx, wy);
    if (!pts || !pts.length) { toast('그곳으로는 갈 수 없어요', 1200); return; }
    route = { kind: 'tap', pts, at: time };
    tapMark = { x: wx, y: wy, t: 0 };
    manualT = 0; followMoving = false; explore.target = null;
  }
  function selectTarget(uid) {
    selUid = selUid === uid ? null : uid;
    const e = byUid(selUid);
    toast(e ? `대상: ${e.name}` : '대상 지정 해제 (자동 선택)', 1000);
    hudTick(true);
  }

  // ---------------- 수동 스킬 ----------------
  function manualTarget(def) {
    const e = byUid(selUid);
    if (!e) return undefined;
    if (def.type === 'resurrect') return e.alive ? undefined : e;
    if (!e.alive) return undefined;
    if (def.type === 'cleanse' && !e.curses.length) return undefined;
    if (def.type === 'single_heal' || def.type === 'cleanse' || def.type === 'buff') return e;
    return undefined;
  }
  function cast(skillId, explicitTarget) {
    if (!fs || ending) return;
    const def = Skills.get(skillId); if (!def) return;
    if (!unlocked(skillId)) { toast(`${def.name}: Lv.${def.unlockLevel} 에 배워요`); return; }
    // 자동 힐이 시전 중이던 주문은 수동 명령이 우선한다
    if (player.cast && player.cast.skillId !== skillId) battle.cancelCast(player, 'manual');
    const tgt = explicitTarget !== undefined ? explicitTarget : manualTarget(def);
    const r = battle.useSkill(player, skillId, tgt);
    if (!r || !r.ok) toast(`${def.name}: ${REASON[r && r.reason] || '쓸 수 없어요'}`, 1300);
    hudTick(true);
  }

  // ---------------- 렌더 ----------------
  function chunkCanvas(ci, cj) {
    const key = ci + ',' + cj;
    let c = chunks.get(key);
    if (c) { chunks.delete(key); chunks.set(key, c); return c; }
    c = DungeonTiles.chunk(map, ci, cj);
    chunks.set(key, c);
    if (chunks.size > CHUNK_MAX) chunks.delete(chunks.keys().next().value);
    return c;
  }
  function drawTiles(ctx, cx, cy, vw, vh) {
    const c0 = Math.max(0, Math.floor(cx / CHUNK_PX)), c1 = Math.min(Math.ceil(map.cols / CHUNK_T) - 1, Math.floor((cx + vw) / CHUNK_PX));
    const r0 = Math.max(0, Math.floor(cy / CHUNK_PX)), r1 = Math.min(Math.ceil(map.rows / CHUNK_T) - 1, Math.floor((cy + vh) / CHUNK_PX));
    for (let cj = r0; cj <= r1; cj++) for (let ci = c0; ci <= c1; ci++) ctx.drawImage(chunkCanvas(ci, cj), ci * CHUNK_PX, cj * CHUNK_PX);
  }
  // 안개: 아직 밝히지 않은(fs.visited=0) 타일을 어둡게. 화면에 보이는 타일만(약 13×27칸).
  function drawFog(ctx, cx, cy, vw, vh) {
    const i0 = Math.max(0, Math.floor(cx / TILE)), i1 = Math.min(map.cols - 1, Math.floor((cx + vw) / TILE));
    const j0 = Math.max(0, Math.floor(cy / TILE)), j1 = Math.min(map.rows - 1, Math.floor((cy + vh) / TILE));
    ctx.fillStyle = fogStyle;
    const v = fs.visited, cols = map.cols;
    for (let j = j0; j <= j1; j++) {
      let run = -1;
      for (let i = i0; i <= i1 + 1; i++) {
        const dark = i <= i1 && !v[j * cols + i];
        if (dark && run < 0) run = i;
        else if (!dark && run >= 0) { ctx.fillRect(run * TILE, j * TILE, (i - run) * TILE, TILE); run = -1; }
      }
    }
  }
  function inView(x, y, cx, cy, vw, vh, m = 96) { return x > cx - m && x < cx + vw + m && y > cy - m && y < cy + vh + m * 1.5; }

  function drawEntity(ctx, e) {
    const s = sheetFor(e); if (!s) return;
    const a = anim.get(e.uid);
    const dir = s[e.dir] ? e.dir : 'down';
    let img;
    if (a && a.atk > 0 && s.attack && s.attack.length) img = s.attack[a.atk > 0.14 ? 0 : Math.min(1, s.attack.length - 1)];
    else img = s[dir][a && a.moving ? a.frame : 0] || s.down[0];
    let ox = 0, oy = 0;
    // 공격 프레임이 없는 파티원은 대상 쪽으로 살짝 내딛는 것으로 공격을 보여 준다
    if (a && a.atk > 0 && !(s.attack && s.attack.length)) { const k = Math.sin((a.atk / 0.3) * Math.PI) * 3; ox = (dir === 'left' ? -k : dir === 'right' ? k : 0); oy = (dir === 'up' ? -k : dir === 'down' ? k : 0); }
    const x = Math.round(e.x + ox), y = Math.round(e.y + oy);
    const rw = Math.max(6, Math.round(s.w * 0.28));
    Pixel.ellipse(ctx, x, y - 1, rw, Math.max(2, Math.round(rw * 0.38)), 'rgba(0,0,0,0.28)');
    if (!e.alive) { const o = ctx.globalAlpha; ctx.globalAlpha = 0.45; ctx.drawImage(img, x - s.anchor.x, y - s.anchor.y); ctx.globalAlpha = o; return; }
    ctx.drawImage(img, x - s.anchor.x, y - s.anchor.y);
  }

  function draw(ctx, view) {
    if (!fs) return;
    Scenes.followCamera(player, map.cols * TILE, map.rows * TILE, false, -28, 0.16);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = map.biome === 'cave' ? '#141018' : '#14200f';
    ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);
    const { cx, cy } = Scenes.beginWorld(ctx);
    const vw = view.viewW, vh = view.viewH;
    drawTiles(ctx, cx, cy, vw, vh);
    drawFog(ctx, cx, cy, vw, vh);

    // 바닥에 붙는 것: 성역 → 텔레그래프/장판 → 탭 표시 → 대상 고리 → 시전 빛
    for (const gh of battle.groundHeals) if (inView(gh.x, gh.y, cx, cy, vw, vh, gh.r)) FX.drawOne(ctx, { type: 'ground_heal', x: gh.x, y: gh.y, r: gh.r, fill: 1, t: time });
    for (const tg of battle.telegraphs) {
      if (tg.done && !(tg.type === 'puddle' && tg.active)) continue;
      if (!inView(tg.x, tg.y, cx, cy, vw, vh, (tg.r || 32) + 64)) continue;
      if (tg.type === 'circle') FX.drawOne(ctx, { type: 'aoe_ring', x: tg.x, y: tg.y, r: tg.r, fill: tg.fill, t: time });
      else if (tg.type === 'puddle') FX.drawOne(ctx, { type: 'puddle_circle', x: tg.x, y: tg.y, r: tg.r, fill: tg.active ? 1 : tg.fill, t: time });
      else FX.drawOne(ctx, tg);   // cone/line 은 FX 가 별칭으로 그대로 받는다(facing·angle·x2·y2 필요)
    }
    if (tapMark) {
      const r = 5 + Math.round((1 - Math.min(1, tapMark.t * 2)) * 7);
      Pixel.ellipse(ctx, Math.round(tapMark.x), Math.round(tapMark.y), r, Math.max(1, Math.round(r * 0.5)), 'rgba(255,255,255,0.65)');
      Pixel.ellipse(ctx, Math.round(tapMark.x), Math.round(tapMark.y), Math.max(1, r - 2), Math.max(1, Math.round(r * 0.5) - 1), 'rgba(120,220,140,0.55)');
    }
    const sel = byUid(selUid);
    if (sel) { const k = (Math.floor(time * 4) & 1); Pixel.ellipse(ctx, Math.round(sel.x), Math.round(sel.y) - 1, 12 + k, 5, 'rgba(127,224,122,0.55)'); Pixel.ellipse(ctx, Math.round(sel.x), Math.round(sel.y) - 1, 9 + k, 3, 'rgba(20,40,20,0.35)'); }
    for (const e of battle.party()) if (e.alive && e.cast) FX.drawOne(ctx, { type: 'cast_glow', x: e.x, y: e.y, t: time, color: e.kind === 'player' ? '#ffe9a0' : '#8ad8ff' });

    // 깊이 정렬: 발(y) 기준
    const list = [];
    for (const c of fs.chests) if (c.revealed && inView(c.x, c.y, cx, cy, vw, vh)) list.push({ y: c.y, chest: c });
    if (inView(map.exit.x, map.exit.y, cx, cy, vw, vh)) list.push({ y: map.exit.y, exit: true });
    for (const e of battle.party()) if (inView(e.x, e.y, cx, cy, vw, vh)) list.push({ y: e.y + (e.alive ? 0 : -40), ent: e });
    for (const m of battle.monsters) {
      if (!m.alive || !inView(m.x, m.y, cx, cy, vw, vh, 120) || dist(m, player) > ACTIVE_R) continue;
      list.push({ y: m.y, ent: m });
    }
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.ent) drawEntity(ctx, it.ent);
      else if (it.chest) { const img = DungeonTiles.chestSprite(it.chest.opened, it.chest.type); ctx.drawImage(img, Math.round(it.chest.x - img.width / 2), Math.round(it.chest.y - img.height + 6)); }
      else if (it.exit) {
        const img = DungeonTiles.exitSprite(); const o = ctx.globalAlpha;
        if (!fs.bossDefeated) ctx.globalAlpha = 0.35;   // 보스를 잡기 전엔 닫힌 문처럼 흐리게
        ctx.drawImage(img, Math.round(map.exit.x - img.width / 2), Math.round(map.exit.y - img.height + 8)); ctx.globalAlpha = o;
      }
    }
    // 머리 위 저주 표시(매 프레임, 저주가 있는 동안)
    for (const it of list) {
      const e = it.ent; if (!e || !e.alive || !e.curses.length) continue;
      const s = sheetFor(e); FX.drawOne(ctx, { type: 'curse_icon', x: e.x, y: e.y, dy: (s ? s.anchor.y : 30) + 6, t: time + (e.uid.length % 3) * 0.2 });
    }
    FX.draw(ctx);
    Scenes.endWorld(ctx);

    // 화면 공간: 미니 HP 바·이름표(또렷한 글자)
    for (const it of list) {
      const e = it.ent; if (!e || !e.alive) continue;
      const s = sheetFor(e), top = e.y - (s ? s.anchor.y : 30) - 4;
      if (e.kind === 'monster') {
        if (e.tier === 'boss') continue;            // 보스는 상단 큰 바
        if (e.aggro || e.hp < e.maxHp) Scenes.drawMiniBar(ctx, e.x, top, e.hp, e.maxHp, { w: e.tier === 'miniboss' ? 40 : 24, h: 3, color: '#e04a4a' });
        if (e.tier === 'miniboss') Scenes.drawLabel(ctx, e.name, e.x, top - 9, { size: 9, bg: 'rgba(60,20,20,0.85)', color: '#ffcf9a', border: '#c04a3a' });
      } else if (e.kind === 'member') {
        Scenes.drawMiniBar(ctx, e.x, top, e.hp, e.maxHp, { w: 22, h: 3, color: e.hp / e.maxHp < 0.35 ? '#ff6a4a' : '#5ad06a' });
      }
    }
    Scenes.drawJoystick(ctx);
  }

  // ---------------- 갱신 ----------------
  function updateAnims(dt) {
    const touch = (e) => {
      let a = anim.get(e.uid);
      if (!a) { a = { px: e.x, py: e.y, t: 0, frame: 0, atk: 0, moving: false }; anim.set(e.uid, a); }
      const moved = Math.hypot(e.x - a.px, e.y - a.py);
      a.px = e.x; a.py = e.y;
      a.moving = moved > 0.05 && moved < 3 * TILE;
      if (a.moving) { a.t += dt * Math.max(6, (e.speed || 100) / 12); a.frame = Math.floor(a.t) % 4; } else { a.t = 0; a.frame = 0; }
      if (a.atk > 0) a.atk = Math.max(0, a.atk - dt);
    };
    for (const e of battle.party()) touch(e);
    for (const m of battle.monsters) if (m.alive && dist(m, player) <= ACTIVE_R) touch(m);
  }

  function update(dt) {
    if (!fs || ending) return;
    time += dt;
    if (tapMark) { tapMark.t += dt; if (tapMark.t > 0.6) tapMark = null; }
    // 스토리·확인창이 떠 있으면 세계를 멈춘다(UI 스택에 안 올라가서 Scenes 가 자동으로 멈춰 주지 않는다)
    if (blockers > 0) return;
    control(dt);
    Floor.update(fs, G, dt);
    FX.update(dt);
    updateAnims(dt);
    hudAcc += dt;
    if (hudAcc >= HUD_EVERY) { hudAcc = 0; hudTick(); }
    checkFlow();
  }
  function checkFlow() {
    if (fs.result === 'wipe' || battle.result === 'wipe') finish('wipe');
    else if (fs.result === 'cleared' || fs.cleared) finish('cleared');
  }

  // ---------------- 흐름: 스토리·결과·귀환 ----------------
  function playStory(lines, title) {
    if (!lines || !lines.length || typeof UI === 'undefined') return Promise.resolve();
    blockers++;
    return UI.story(lines, title).then(() => { blockers = Math.max(0, blockers - 1); });
  }
  function chapterOf(floor) { return typeof Story !== 'undefined' ? ((Story.chapters && Story.chapters[floor]) || (Story.forFloor && Story.forFloor(floor))) : null; }
  function storyOnce(key, lines, title) {
    const flags = (G.story = G.story || { chapter: 1, flags: {} }).flags = G.story.flags || {};
    if (flags[key]) return Promise.resolve();
    flags[key] = true;
    State.save();
    return playStory(lines, title);
  }
  function finish(reason) {
    if (ending) return;
    ending = true; route = null; closePop();
    const summary = Floor.leave(fs, G, reason);
    const xp = Math.max(0, totalXp(G.player) - runStats.xp0);
    State.save();
    if (reason === 'escape') { goTown(); toast('마을로 돌아왔어요'); return; }
    const params = Object.assign({}, summary, {
      floor: floorNo, outcome: reason, time: summary.time, steps: summary.steps, kills: summary.kills, chests: summary.chests,
      xp, gold: runStats.gold, items: runStats.items.slice(), levelUps: runStats.levelUps.slice(), summary,
    });
    // 전멸은 쓰러지는 장면을 잠깐 보여 준 뒤 결과창(곧바로 창이 덮으면 무슨 일이 있었는지 모른다)
    setTimeout(() => {
      if (!fs) return;
      hudTick(true);
      // 결과 화면(ui_result.js)이 등록돼 있을 때만 연다 — 없으면 UI.open 이 "준비 중" 토스트를 띄우므로 미리 확인
      const entry = typeof UI !== 'undefined' && UI.screens && UI.screens.has('result') ? UI.open('result', params) : null;
      if (entry) return;     // 결과 화면의 "마을로"(또는 닫기 → ui_close) 가 마을로 보낸다
      // 결과 화면이 아직 없으면 스토리 연출로 요약을 보여 주고 마을로
      const mm = Math.floor(summary.time / 60), ss = Math.round(summary.time % 60);
      playStory([
        reason === 'cleared' ? `${floorNo}층을 돌파했다! (${mm}분 ${ss}초)` : '파티가 쓰러졌다… 마을로 실려 간다.',
        `걸음 ${summary.steps} · 처치 ${summary.kills} · 상자 ${summary.chests}`,
        `경험치 +${xp} · 골드 +${runStats.gold}${runStats.items.length ? ` · 아이템 ${runStats.items.length}개` : ''}`,
      ], reason === 'cleared' ? '층 돌파' : '전멸').then(goTown);
    }, reason === 'wipe' ? 1400 : 400);
  }
  function goTown() { if (Scenes.name() === 'dungeon') Scenes.go('town'); }
  async function askEscape() {
    if (ending) return;
    blockers++;
    const ok = await UI.confirm(fs.bossDefeated ? '마을로 돌아갈까요?' : '탐험을 그만두고 마을로 돌아갈까요?\n(돌파 기록은 남지 않아요)', { ok: '귀환', cancel: '계속 탐험' });
    blockers = Math.max(0, blockers - 1);
    if (ok) finish('escape');
  }

  // ---------------- 이벤트 → 이펙트·토스트 ----------------
  function near(e) { return e && Math.abs(e.x - player.x) < 420 && Math.abs(e.y - player.y) < 620; }
  function headY(e) { const s = sheetFor(e); return e.y - (s ? Math.min(s.anchor.y, 60) : 28); }
  function subscribe() {
    const on = (name, fn) => unsubs.push(Events.on(name, (p) => { if (fs && !ending) fn(p || {}); }));
    on('damage', (p) => {
      const dst = p.dst, src = p.src;
      if (src) { const a = anim.get(src.uid); if (a && (p.type === 'basic' || p.skillId)) a.atk = 0.3; }
      if (!near(dst)) return;
      const y = headY(dst) + 4;
      if (p.evaded) { FX.spawn('damage_number', dst.x, y, { text: '회피', color: '#cfe8ff' }); return; }
      if (!(p.amount > 0)) return;
      const toParty = dst.kind !== 'monster';
      FX.spawn('damage_number', dst.x + ((p.amount * 7) % 9) - 4, y, { text: String(Math.round(p.amount)), color: toParty ? '#ff7a6a' : (p.crit ? '#ffd040' : '#ffffff'), crit: !!p.crit, dx: toParty ? -4 : 4 });
      if (p.type === 'basic' || p.type === 'telegraph' || p.skillId) FX.spawn('hit', dst.x, dst.y - 12);
      if (src && p.type === 'basic' && (src.atkType === 'ranged' || src.atkType === 'magic') && near(src)) FX.spawn('projectile', src.x, src.y - 14, { from: { x: src.x, y: src.y - 14 }, to: { x: dst.x, y: dst.y - 12 }, color: src.atkType === 'magic' ? '#b48aff' : '#e8d8a0' });
    });
    on('heal', (p) => {
      if (!near(p.dst) || !(p.amount > 0)) return;
      FX.spawn('damage_number', p.dst.x, headY(p.dst) + 2, { text: '+' + Math.round(p.amount), color: '#7dff8a' });
      if (p.skillId !== 'aoe_ground') FX.spawn('heal_sparkle', p.dst.x, p.dst.y - 10);
    });
    on('death', (p) => {
      const e = p.ent; if (!near(e)) return;
      FX.spawn(e.kind === 'monster' ? 'summon_puff' : 'hit', e.x, e.y - 8);
      if (e.kind !== 'monster') toast(`${e.name} 이(가) 쓰러졌다!`, 1500);
    });
    on('cast_start', (p) => {
      const e = p.ent; if (!near(e)) return;
      // 몬스터 능력은 머리 위에 이름을 띄워 "곧 뭔가 온다" 를 알린다(텔레그래프와 함께)
      if (e.kind === 'monster' && p.abilityId && typeof Monsters !== 'undefined' && Monsters.ability) {
        const ab = Monsters.ability(p.abilityId);
        if (ab) FX.spawn('damage_number', e.x, headY(e) - (e.tier === 'normal' ? 6 : 24), { text: ab.name + '!', color: '#ffb060', duration: 1.4 });
      }
      if (e.kind === 'player' && p.skillId === 'holy_light') FX.spawn('levelup', e.x, e.y);
    });
    on('summon', (p) => { for (const uid of p.uids || []) { const m = byUid(uid); if (m) FX.spawn('summon_puff', m.x, m.y - 8); } if (p.ent && near(p.ent)) toast(`${p.ent.name} 이(가) 부하를 불렀다!`, 1500); });
    on('revive', (p) => { const e = p.ent || byUid(p.uid); if (e) { FX.spawn('revive', e.x, e.y); toast(`${e.name} 부활!`, 1200); } });
    on('level_up', (p) => {
      const e = p.isPlayer ? player : battle.party().find((x) => x.src === p.entity || x.uid === p.uid);
      if (e) FX.spawn('levelup', e.x, e.y);
      runStats.levelUps.push({ name: p.name, level: p.level, isPlayer: !!p.isPlayer, newSkills: p.newSkills || [] });
      if (p.isPlayer) { player.skillLevels = G.player.skillLevels; toast(`레벨 업! Lv.${p.level}${p.newSkills && p.newSkills.length ? ' · 새 스킬: ' + p.newSkills.map((id) => (Skills.get(id) || {}).name || id).join(', ') : ''}`, 2200); }
      hudTick(true);
    });
    on('curse', (p) => {
      const e = p.ent || byUid(p.uid); if (!near(e) || e.kind === 'monster') return;
      FX.spawn('damage_number', e.x, headY(e) - 8, { text: (typeof Stats !== 'undefined' && Stats.curseName ? Stats.curseName(p.id) : p.id), color: '#d89aff', duration: 1.2 });
    });
    on('boss_phase', (p) => { if (fs.boss && p.uid === fs.boss.uid) toast(`${fs.boss.name}의 기세가 달라졌다! (페이즈 ${phaseOf(fs.boss).n})`, 1800); });
    on('boss_killed', (p) => {
      if (p.floor !== floorNo) return;
      const ch = chapterOf(floorNo);
      toast('보스 처치! 출구가 열렸어요', 2200);
      if (ch && ch.outro) setTimeout(() => { if (fs && !ending) storyOnce('dungeon_outro_' + floorNo, ch.outro, `${ch.n}장 · ${ch.title}`); }, 1200);
    });
    on('chest_revealed', () => toast('덤불 뒤에 숨겨진 상자가 보여요!', 1600));
    on('chest_opened', (p) => {
      const names = (p.items || []).map((it) => { const d = typeof Items !== 'undefined' ? Items.get(it.id) : null; return d ? d.name : it.id; });
      toast(`${p.hidden ? '숨겨진 ' : ''}상자: ${UI.gold(p.gold || 0)}${names.length ? ' · ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ` 외 ${names.length - 2}` : '') : ''}`, 2000);
      FX.spawn('heal_sparkle', p.x, p.y - 8, { color: '#ffd040' });
      runStats.gold += p.gold || 0;
    });
    // 처치 골드는 Combat 이 'loot' 로, 상자 골드는 'chest_opened' 로 알린다(gold_changed 는 상점 거래에도 나서 쓰지 않는다)
    on('loot', (p) => { if (p.gold > 0) runStats.gold += p.gold; });
    on('item_gained', (p) => { if (p.inst) runStats.items.push(p.inst); });
    // 결과 화면을 닫으면 마을로 — ending 뒤에 오는 이벤트라 위 가드(on) 를 거치지 않는다
    unsubs.push(Events.on('ui_close', (p) => { if (p && p.name === 'result' && ending) goTown(); }));
  }

  // ---------------- HUD (DOM) ----------------
  const el = (tag, attrs, kids) => UI.el(tag, attrs, kids);
  // 값이 바뀔 때만 DOM 에 쓴다
  function setText(node, v) { if (node._t !== v) { node._t = v; node.textContent = v; } }
  function setW(node, pct) { const v = Math.max(0, Math.min(100, pct)).toFixed(1) + '%'; if (node._w !== v) { node._w = v; node.style.width = v; } }
  function setH(node, pct) { const v = Math.max(0, Math.min(100, pct)).toFixed(1) + '%'; if (node._h !== v) { node._h = v; node.style.height = v; } }
  function setCls(node, cls, on) { on = !!on; if (!node._c) node._c = {}; if (node._c[cls] !== on) { node._c[cls] = on; node.classList.toggle(cls, on); } }

  function buildHud() {
    removeHud();
    const root = el('div', { id: 'dhud' });
    // 상단: 파티 프레임
    const party = el('div', { class: 'dh-party' });
    const frames = [];
    for (let k = 0; k < 5; k++) {
      const nm = el('span'), ri = el('b'), hp = el('i'), mp = el('i'), hpn = el('span', { class: 'hpn' }), cs = el('div', { class: 'cs' }), dead = el('div', { class: 'dead hidden' }, ['💀 쓰러짐']);
      const hpBar = el('div', { class: 'dh-bar' }, [hp]), mpBar = el('div', { class: 'dh-bar mp' }, [mp]);
      const btn = el('button', { class: 'dh-pf', onClick: () => { const f = frames[k]; if (f.uid) selectTarget(f.uid); } }, [el('div', { class: 'nm' }, [ri, nm]), hpBar, mpBar, hpn, cs, dead]);
      party.appendChild(btn);
      frames.push({ btn, nm, ri, hp, mp, hpn, hpBar, mpBar, cs, dead, uid: null });
    }
    const floorName = el('span', { class: 'fl' }), counters = el('span', { class: 'ct' });
    const info = el('div', { class: 'dh-info panel' }, [floorName, counters]);
    const bossName = el('span'), bossPhase = el('small'), bossHp = el('i');
    const boss = el('div', { class: 'dh-boss panel hidden' }, [el('div', { class: 'bn' }, [bossName, bossPhase]), el('div', { class: 'dh-bar' }, [bossHp])]);
    const top = el('div', { class: 'dh-top' }, [party, info, boss]);
    // 오른쪽: 지도·가방·퀘스트·귀환
    const mapBtn = el('button', { onClick: () => toggleMap() }, ['🗺️', el('small', { text: '지도' })]);
    const side = el('div', { class: 'dh-side' }, [
      mapBtn,
      el('button', { onClick: () => UI.open('inventory') }, ['🎒', el('small', { text: '가방' })]),
      el('button', { onClick: () => UI.open('quests') }, ['📜', el('small', { text: '퀘스트' })]),
      el('button', { onClick: () => askEscape() }, ['🏠', el('small', { text: '귀환' })]),
    ]);
    const mini = el('canvas', { class: 'dh-map hidden', width: 300, height: 300, onClick: () => toggleMap(false) });
    const warn = el('div', { class: 'dh-warn' }, [el('div', { class: 'dh-warn-txt', text: '⚠ 위험 범위! 벗어나세요' })]);
    // 하단: 시전 바 + 상태 + 스킬 바
    const castFill = el('i'), castText = el('span');
    const castBar = el('div', { class: 'dh-cast hidden' }, [castFill, castText]);
    const status = el('div', { class: 'dh-status hidden' });
    const skills = el('div', { class: 'dh-skills panel' });
    const sk = {};
    const mk = (key, opts) => {
      const ic = el('span', { class: 'ic' }), nm = el('span', { class: 'nm' }), sub = el('span', { class: 'sub' }), cd = el('i', { class: 'cd' }), cdt = el('b', { class: 'cdt' }), badge = el('span', { class: 'badge hidden' });
      const btn = el('button', { class: 'dh-sk' + (opts.toggle ? ' toggle' : '') }, [ic, nm, sub, cd, cdt, badge, opts.more ? el('span', { class: 'more', text: '▾' }) : null]);
      holdable(btn, opts.tap, opts.hold);
      skills.appendChild(btn);
      sk[key] = { btn, ic, nm, sub, cd, cdt, badge };
    };
    mk('single', { more: true, tap: () => cast(G.player.active.single || 'heal_basic'), hold: () => openChooser('single') });
    mk('aoe', { more: true, tap: () => cast(G.player.active.aoe || 'aoe_2'), hold: () => openChooser('aoe') });
    mk('cleanse', { tap: () => cast('cleanse') });
    mk('buff', { more: true, tap: () => openChooser('buff'), hold: () => openChooser('buff') });
    mk('holy_light', { tap: () => cast('holy_light') });
    mk('resurrect', { tap: () => cast('resurrect') });
    mk('smite', { tap: () => cast('smite') });
    mk('autoHeal', { toggle: true, tap: () => toggleSetting('autoHeal', '자동 힐') });
    mk('autoDodge', { toggle: true, tap: () => toggleSetting('autoDodge', '자동 회피') });
    mk('explore', { toggle: true, tap: () => toggleExplore() });
    const bottom = el('div', { class: 'dh-bottom' }, [castBar, status, skills]);
    const back = el('div', { class: 'dh-back hidden', onClick: () => closePop() });
    const pop = el('div', { class: 'dh-pop panel hidden' });
    root.append(warn, top, side, mini, bottom, back, pop);
    (document.getElementById('game') || document.body).appendChild(root);
    hud = { root, frames, floorName, counters, boss, bossName, bossPhase, bossHp, side, mapBtn, mini, warn, castBar, castFill, castText, status, sk, back, pop, mapOpen: false, mapAcc: 9, mapImg: null };
  }
  function removeHud() { const old = document.getElementById('dhud'); if (old) old.remove(); hud = null; }

  // 탭 = 바로 시전, 길게 누르기(0.42초) = 선택 메뉴. click 대신 pointer 이벤트로 직접 판정해 두 동작이 겹치지 않게 한다.
  function holdable(btn, onTap, onHold) {
    let timer = null, held = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); held = false; clear(); if (onHold) timer = setTimeout(() => { timer = null; held = true; onHold(); }, 420); });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); const was = !!timer || !onHold; clear(); if (!held && was) onTap(); });
    btn.addEventListener('pointerleave', clear);
    btn.addEventListener('pointercancel', clear);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function toggleSetting(key, label) {
    const s = settings(); s[key] = !s[key];
    toast(`${label} ${s[key] ? '켜짐' : '꺼짐'}`, 1000);
    State.save(); hudTick(true);
  }
  function toggleExplore() {
    explore.on = !explore.on; explore.target = null; explore.unreachable.clear();
    if (route && route.kind === 'explore') route = null;
    manualT = 99;
    toast(explore.on ? '자동 탐험 시작 — 가까운 무리·상자·보스로 갑니다' : '자동 탐험 멈춤', 1400);
    hudTick(true);
  }
  function toggleMap(force) {
    hud.mapOpen = force === undefined ? !hud.mapOpen : force;
    hud.mapAcc = 9;
    hudTick(true);
  }

  // 길게 누르기 선택 메뉴: 단일힐 / 광역힐 / 버프
  function openChooser(kind) {
    if (!hud) return;
    const pop = hud.pop; pop.innerHTML = '';
    const ids = kind === 'single' ? SINGLE : kind === 'aoe' ? AOE : BUFFS;
    const cur = kind === 'single' ? G.player.active.single : kind === 'aoe' ? G.player.active.aoe : null;
    const tgt = byUid(selUid);
    pop.appendChild(el('div', { class: 'pt', text: kind === 'single' ? '단일 힐 선택 (탭하면 바로 시전)' : kind === 'aoe' ? '광역 힐 선택 (탭하면 바로 시전)' : `축복 — ${tgt && tgt.alive ? tgt.name + '에게' : '자동 대상'}` }));
    for (const id of ids) {
      const def = Skills.get(id); if (!def) continue;
      const lock = !unlocked(id);
      const ct = Skills.castTime(def, player), mp = Math.round(Skills.mpCost(def, player));
      const b = el('button', { class: id === cur ? 'cur' : '', disabled: lock, onClick: () => {
        if (kind === 'single') G.player.active.single = id;
        else if (kind === 'aoe') G.player.active.aoe = id;
        closePop(); State.save(); cast(id);
      } }, [
        el('span', { class: 'ic', text: lock ? '🔒' : SKILL_ICON[id] || '✨' }),
        el('span', { class: 'tx' }, [el('b', { text: def.name + (id === cur ? ' ✓' : '') }), el('small', { text: lock ? `Lv.${def.unlockLevel} 에 배움` : (def.desc || '').slice(0, 34) })]),
        el('span', { class: 'mp', text: lock ? '' : `${ct > 0 ? ct.toFixed(1) + '초 · ' : '즉시 · '}MP ${mp}` }),
      ]);
      pop.appendChild(b);
    }
    pop.classList.remove('hidden'); hud.back.classList.remove('hidden');
  }
  function closePop() { if (!hud) return; hud.pop.classList.add('hidden'); hud.back.classList.add('hidden'); }

  function phaseOf(boss) {
    const phases = (boss.def && boss.def.phases) || [];
    const i = boss.phase ? phases.indexOf(boss.phase) : 0;
    return { n: Math.max(1, i + 1), max: Math.max(1, phases.length) };
  }
  function cdLeft(id) { return Math.max(0, (player.cooldowns[id] || 0) - battle.time); }
  function paintSkill(s, id, extra = {}) {
    const def = Skills.get(id);
    const lock = !unlocked(id);
    setText(s.ic, lock ? '🔒' : (SKILL_ICON[id] || '✨'));
    setText(s.nm, extra.name || (def ? def.name : id));
    const mp = def ? Math.round(Skills.mpCost(def, player)) : 0;
    setText(s.sub, lock ? `Lv.${def ? def.unlockLevel : '?'}` : `MP ${mp}`);
    const left = lock ? 0 : cdLeft(id);
    setH(s.cd, def && def.cooldown ? (left / def.cooldown) * 100 : 0);
    setText(s.cdt, left > 0 ? (left >= 60 ? Math.ceil(left / 60) + '분' : Math.ceil(left) + '') : '');
    setCls(s.btn, 'locked', lock);
    setCls(s.btn, 'nomp', !lock && player.mp < mp);
    setCls(s.btn, 'casting', !!(player.cast && player.cast.skillId === id));
    setCls(s.btn, 'ready', !lock && !left && !!extra.ready && player.mp >= mp);
    if (extra.badge && !lock) { setText(s.badge, String(extra.badge)); setCls(s.badge, 'hidden', false); } else setCls(s.badge, 'hidden', true);
  }
  function paintToggle(s, icon, name, on, sub) {
    setText(s.ic, icon); setText(s.nm, name); setText(s.sub, sub || (on ? '켜짐' : '꺼짐'));
    setCls(s.btn, 'on', on); setH(s.cd, 0); setText(s.cdt, ''); setCls(s.badge, 'hidden', true);
  }

  function hudTick(force) {
    if (!hud || !fs) return;
    const party = battle.party();
    // 파티 프레임: 플레이어 먼저, 그 뒤 파티원
    for (let k = 0; k < 5; k++) {
      const f = hud.frames[k], e = party[k];
      setCls(f.btn, 'hidden', !e);
      if (!e) { f.uid = null; continue; }
      f.uid = e.uid;
      setText(f.ri, ROLE_ICON[e.role] || '•');
      setText(f.nm, e.name);
      setText(f.hpn, `${Math.max(0, Math.ceil(e.hp))}/${Math.round(e.maxHp)}`);
      const hpP = e.maxHp ? (e.hp / e.maxHp) * 100 : 0;
      setW(f.hp, e.alive ? hpP : 0); setW(f.mp, e.maxMp ? (e.mp / e.maxMp) * 100 : 0);
      setCls(f.hpBar, 'low', e.alive && hpP < 60 && hpP >= 35); setCls(f.hpBar, 'crit', e.alive && hpP < 35);
      setCls(f.btn, 'me', e.kind === 'player'); setCls(f.btn, 'sel', e.uid === selUid);
      setCls(f.dead, 'hidden', e.alive);
      const cs = e.alive ? e.curses.map((c) => CURSE_ICON[c.id] || '✖').join('') : '';
      if (f.cs._t !== cs) { f.cs._t = cs; f.cs.innerHTML = ''; for (const c of e.alive ? e.curses : []) f.cs.appendChild(el('em', { text: CURSE_ICON[c.id] || '✖', title: Stats.curseName ? Stats.curseName(c.id) : c.id })); }
    }
    // 층 이름·카운터
    setText(hud.floorName, `${floorNo}층 · ${map.name || ''}`);
    const opened = fs.chests.filter((c) => c.opened).length;
    setText(hud.counters, `👣 ${fs.steps}  ⚔️ ${fs.kills}  📦 ${opened}/${fs.chests.filter((c) => !c.hidden).length}`);
    // 보스 바: 교전 중이거나 깎였을 때
    const b = fs.boss, showBoss = !!(b && b.alive && (b.aggro || b.hp < b.maxHp) && dist(b, player) < ACTIVE_R);
    setCls(hud.boss, 'hidden', !showBoss);
    setCls(hud.side, 'boss', showBoss); setCls(hud.mini, 'boss', showBoss);
    if (showBoss) {
      const ph = phaseOf(b);
      setText(hud.bossName, `👑 ${b.name}`);
      setText(hud.bossPhase, `페이즈 ${ph.n}/${ph.max} · ${Math.ceil((b.hp / b.maxHp) * 100)}%`);
      setW(hud.bossHp, (b.hp / b.maxHp) * 100);
    }
    // 시전 바
    const c = player.cast;
    setCls(hud.castBar, 'hidden', !c);
    if (c) { const def = Skills.get(c.skillId); setW(hud.castFill, c.total ? (c.t / c.total) * 100 : 100); setText(hud.castText, `${def ? def.name : c.skillId} ${Math.max(0, c.total - c.t).toFixed(1)}초`); }
    // 탐험 상태
    setCls(hud.status, 'hidden', !explore.status);
    if (explore.status) setText(hud.status, explore.status);
    // 위험 경고: 텔레그래프 안에 서 있으면 화면 가장자리 붉게
    const danger = alive(player) && typeof AIHealer !== 'undefined' && !!AIHealer.dodge(player, battle);
    setCls(hud.warn, 'on', danger);
    // 스킬 바
    const P = G.player, sk = hud.sk;
    const hurt = battle.allies().filter((e) => e.hp / e.maxHp < 0.7).length;
    const cursed = battle.allies().filter((e) => e.curses.length).length;
    const deadN = party.filter((e) => !e.alive).length;
    const undead = battle.engagedMonsters().some((m) => (m.tags || []).includes('undead'));
    paintSkill(sk.single, P.active.single || 'heal_basic', { ready: hurt > 0 });
    paintSkill(sk.aoe, P.active.aoe || 'aoe_2', { ready: hurt >= 2 });
    paintSkill(sk.cleanse, 'cleanse', { badge: cursed, ready: cursed > 0 });
    const buffUnlocked = BUFFS.some(unlocked);
    paintSkill(sk.buff, BUFFS.find(unlocked) || 'buff_def', { name: '축복' });
    if (buffUnlocked) { setText(sk.buff.ic, '🙏'); setText(sk.buff.sub, '메뉴'); }
    paintSkill(sk.holy_light, 'holy_light', { name: '필살기', ready: hurt >= 3 });
    paintSkill(sk.resurrect, 'resurrect', { badge: deadN, ready: deadN > 0 });
    paintSkill(sk.smite, 'smite', { name: '일격', ready: undead });
    const st = settings();
    paintToggle(sk.autoHeal, '🤖', '자동 힐', st.autoHeal !== false);
    paintToggle(sk.autoDodge, '🏃', '자동 회피', !!st.autoDodge);
    paintToggle(sk.explore, '🧭', '자동 탐험', explore.on);
    // 지도
    setCls(hud.mini, 'hidden', !hud.mapOpen); setCls(hud.mapBtn, 'on', hud.mapOpen);
    if (hud.mapOpen) drawMinimap(force);
  }

  // 미니맵: 방문한 칸만 지형색(DungeonTiles.minimapColor), 0.5초마다 바탕을 다시 만들고 점(파티·상자·보스·출구)은 매 HUD 틱
  let tileRGB = null;
  function minimapRGB() {
    if (tileRGB && tileRGB.biome === map.biome) return tileRGB;
    const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d');
    const out = { biome: map.biome };
    for (let t = 0; t <= 4; t++) { x.clearRect(0, 0, 1, 1); x.fillStyle = DungeonTiles.minimapColor(t, map.biome); x.fillRect(0, 0, 1, 1); out[t] = x.getImageData(0, 0, 1, 1).data.slice(0, 3); }
    return (tileRGB = out);
  }
  function drawMinimap(force) {
    const cv = hud.mini, ctx = cv.getContext('2d'), W = cv.width, cols = map.cols, rows = map.rows;
    hud.mapAcc += HUD_EVERY;
    if (!hud.mapImg || hud.mapAcc >= 0.5 || force) {
      hud.mapAcc = 0;
      const rgb = minimapRGB();
      const img = hud.mapImg && hud.mapImg.width === cols ? hud.mapImg : (hud.mapImg = new ImageData(cols, rows));
      const d = img.data, v = fs.visited, tiles = map.tiles;
      for (let k = 0; k < cols * rows; k++) {
        const o = k * 4;
        if (!v[k]) { d[o] = 18; d[o + 1] = 14; d[o + 2] = 20; d[o + 3] = 255; continue; }
        const c = rgb[tiles[k]] || rgb[0]; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      hud.mapBase = hud.mapBase || document.createElement('canvas');
      hud.mapBase.width = cols; hud.mapBase.height = rows;
      hud.mapBase.getContext('2d').putImageData(img, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hud.mapBase, 0, 0, W, W * rows / cols);
    const k = W / (cols * TILE);
    const dot = (x, y, r, col) => { const X = Math.round(x * k), Y = Math.round(y * k); ctx.fillStyle = '#000'; ctx.fillRect(X - r - 1, Y - r - 1, r * 2 + 2, r * 2 + 2); ctx.fillStyle = col; ctx.fillRect(X - r, Y - r, r * 2, r * 2); };
    for (const c of fs.chests) if (c.revealed && !c.opened && fs.visited[c.j * cols + c.i]) dot(c.x, c.y, 2, c.hidden ? '#c88aff' : '#ffd040');
    if (fs.boss && fs.boss.alive) dot(fs.boss.x, fs.boss.y, 4, '#ff3a3a');
    if (fs.bossDefeated) dot(map.exit.x, map.exit.y, 4, '#9a8aff');
    for (const m of battle.members) if (m.alive) dot(m.x, m.y, 1, '#7fe07a');
    dot(player.x, player.y, 3, (Math.floor(time * 3) & 1) ? '#ffffff' : '#ffe08a');
  }

  // ---------------- 진입·종료 ----------------
  function enter(params) {
    G = State.get();
    floorNo = Math.max(1, (params && params.floor) || 1);
    G.player.active = G.player.active || { single: 'heal_basic', aoe: 'aoe_2' };
    settings();
    fs = Floor.start(G, floorNo);
    map = fs.map; battle = fs.battle; player = battle.player;
    time = 0; hudAcc = 0; manualT = 99; ending = false; blockers = 0; route = null; followMoving = false; tapMark = null; selUid = null;
    explore.on = false; explore.target = null; explore.done = new Set(); explore.unreachable = new Set(); explore.rest = 0; explore.wait = 0; explore.lead = 0; explore.status = '';
    chunks.clear(); anim.clear();
    runStats = { gold: 0, items: [], levelUps: [], xp0: totalXp(G.player) };
    fogStyle = map.biome === 'cave' ? 'rgba(6, 4, 12, 0.66)' : 'rgba(6, 12, 8, 0.6)';
    if (typeof FX !== 'undefined') FX.clear();
    buildHud();
    subscribe();
    Scenes.followCamera(player, map.cols * TILE, map.rows * TILE, true, -28);
    hudTick(true);
    // 디버그·E2E 용 핸들(main.js 의 window.__healer 를 덮어쓰지 않고 붙인다)
    if (typeof window !== 'undefined') {
      window.__healer = window.__healer || {};
      window.__healer.dungeon = { get fs() { return fs; }, get battle() { return battle; }, get player() { return player; }, teleport, cast, findPath, toggleExplore, finish, hudTick };
    }
    const ch = chapterOf(floorNo);
    if (ch && ch.intro && ch.intro.length) storyOnce('dungeon_intro_' + floorNo, ch.intro, `${ch.n}장 · ${ch.title}`).then(() => toast(`${floorNo}층 · ${map.name}`, 1600));
    else toast(`${floorNo}층 · ${map.name}`, 1600);
  }
  // 순간이동(디버그·테스트): 파티도 함께 옆으로 옮겨 진형이 깨지지 않게
  function teleport(x, y) {
    const spot = (px, py, r) => { if (battle.canStand(px, py, r)) return { x: px, y: py }; for (let ring = 1; ring < 6; ring++) for (let a = 0; a < 8; a++) { const qx = px + Math.cos(a * Math.PI / 4) * ring * 16, qy = py + Math.sin(a * Math.PI / 4) * ring * 16; if (battle.canStand(qx, qy, r)) return { x: qx, y: qy }; } return { x: px, y: py }; };
    const p = spot(x, y, player.radius); player.x = p.x; player.y = p.y;
    battle.members.forEach((m, i) => { const q = spot(p.x + [-30, 30, -30, 30][i % 4], p.y + [-24, -24, 30, 30][i % 4], m.radius); m.x = q.x; m.y = q.y; });
    route = null;
    fs._px = p.x; fs._py = p.y;   // 순간이동을 걸음으로 세지 않게
    Scenes.followCamera(player, map.cols * TILE, map.rows * TILE, true, -28);
  }
  function exit() {
    for (const u of unsubs) { try { u(); } catch (e) { /* 이미 해제됨 */ } }
    unsubs = [];
    // 귀환 두루마리 등 씬 밖에서 마을로 간 경우에도 층 정리(피로·기록·회복)는 한 번 한다
    if (fs && !fs.summary) { Floor.leave(fs, G, 'escape'); State.save(); }
    removeHud();
    if (typeof FX !== 'undefined') FX.clear();
    chunks.clear(); anim.clear();
    fs = null; battle = null; player = null; map = null;
  }

  const scene = { enter, exit, update, draw, onTap, onJoyStart() { closePop(); route = null; followMoving = false; manualT = 0; }, onJoyEnd() { manualT = 0; } };
  if (typeof Scenes !== 'undefined') Scenes.register('dungeon', scene);
  return { scene, findPath: (...a) => findPath(...a), get fs() { return fs; } };
})();
if (typeof module !== 'undefined') module.exports = DungeonScene;
