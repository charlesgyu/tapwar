// 파티원 AI — DESIGN.md §8.1
// 탱커: 힐러를 노리는 놈 우선 → 가장 가까운 교전 몬스터, 도발 쿨마다. 근딜: 탱커의 대상을 뒤에서. 원딜: 150~220px 유지.
// 비전투: 플레이어 뒤를 대형으로 따라간다. 텔레그래프 안이면 확률(숲 90%, 동굴 2/3)로 빠져나온다.
// 실제 피해·위협은 Combat 이 처리하므로 여기서는 대상·위치·스킬 요청만 한다.
const AIParty = (() => {
  const TILE = 32;
  const DODGE_FOREST = 0.9, DODGE_CAVE = 2 / 3, DODGE_MARGIN = 16;
  const RANGED_MIN = 150, RANGED_MAX = 220;
  const FOLLOW_SLACK = 28, ENGAGE_RANGE = 6 * TILE, MAX_CHASE = 15 * TILE, RETREAT_LEASH = 8 * TILE;
  const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  const nearest = (list, from) => list.reduce((best, m) => (!best || dist(m, from) < dist(best, from) ? m : best), null);
  const inRange = (a, b, range) => dist(a, b) <= range + a.radius + b.radius;
  const isForest = (floor) => (typeof Floors !== 'undefined' && Floors.isForest ? Floors.isForest(floor) : floor <= 5);
  const skillsOf = (ent) => (typeof Skills !== 'undefined' && Skills.member ? Skills.member(ent.cls) : []);

  function update(ent, battle, dt) {
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
  function follow(ent, battle, dt) {
    const p = battle.player;
    if (!alive(p)) { ent.state = 'idle'; return; }
    const spot = formationSpot(ent, battle, p);
    if (dist(ent, spot) > FOLLOW_SLACK) { ent.target = null; battle.moveTo(ent, spot.x, spot.y, dt); }
    else ent.state = 'idle';
  }
  function formationSpot(ent, battle, p) {
    const [dx, dy] = DIRS[p.dir] || DIRS.down;
    const px = -dy, py = dx;                                    // 진행 방향의 수직
    const same = battle.members.filter((m) => m.role === ent.role);
    const side = same.indexOf(ent) % 2 === 0 ? 1 : -1, lane = Math.floor(same.indexOf(ent) / 2) + 1;
    if (ent.role === 'tank') return { x: p.x + dx * 48 * lane + px * 20 * side * (lane - 1), y: p.y + dy * 48 * lane + py * 20 * side * (lane - 1) };
    if (ent.role === 'ranged') return { x: p.x - dx * 44 + px * 28 * side * lane, y: p.y - dy * 44 + py * 28 * side * lane };
    return { x: p.x + dx * 16 + px * 40 * side * lane, y: p.y + dy * 16 + py * 40 * side * lane };
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
  function melee(ent, battle, foes, dt) {
    const tgt = sharedTarget(battle, foes) || nearest(foes, ent);
    ent.target = tgt.uid;
    if (inRange(ent, tgt, ent.range || 40)) { useAttackSkills(ent, battle, tgt); return; }
    if (useAttackSkills(ent, battle, tgt)) return;                 // 돌진기는 멀리서도 쓴다
    const spot = rearSpot(ent, battle, tgt);
    if (!battle.moveTo(ent, spot.x, spot.y, dt)) approach(ent, battle, tgt, dt);
  }
  function ranged(ent, battle, foes, dt) {
    const tgt = sharedTarget(battle, foes) || nearest(foes, ent);
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
    battle.moveTo(ent, tgt.x, tgt.y, dt);
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
