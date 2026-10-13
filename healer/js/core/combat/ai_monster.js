// 몬스터 AI — DESIGN.md §8.3
// 순찰(home 반경 3타일) → 어그로 범위(7타일) 안의 파티 발견 시 같은 무리 전체 + 4타일 안 이웃 무리까지 교전 → 리쉬(25타일) 넘으면 복귀+회복.
// 교전 중에는 Monsters.AGGRO_SPEED(×1.35)로 달려든다.
// 대상은 위협표 1위(10% 히스테리시스). 능력은 쿨마다 Combat.castAbility 로(대상 선택·텔레그래프·효과는 Combat 담당).
// 보스는 HP 비율에 따라 Monsters.abilitiesFor 가 주는 페이즈 능력 세트를 쓰고, summon 은 Combat 의 동시 6마리 상한을 따른다.
const AIMonster = (() => {
  const TILE = 32;
  const PATROL_RADIUS = 3 * TILE, PATROL_WAIT = [1.5, 4], HOME_SLACK = 10;
  const HYSTERESIS = 1.1, ABILITY_REACH = 8 * TILE, FIRST_USE_DELAY = [0.5, 2.0];
  const HEAL_SELF_BELOW = 0.7, GROUP_CALL_RANGE = 10 * TILE;
  // 눈덩이 어그로: 무리가 덤비면 무리원 주변 4타일 안의 다른 몬스터(와 그 무리)까지 함께 달려든다(한 단계만 번진다).
  const NEIGHBOR_CALL_RANGE = 4 * TILE;
  // 큰 무리의 일반 몬스터가 한꺼번에 능력을 쏟지 않게: 같은 무리에서 동시에 시전 중인 일반 몬스터는 최대 2마리
  // (돌진 8개가 탱커에게 동시에 꽂히면 1~5층도 순식간에 전멸한다). 중간보스·보스는 제한 없음.
  const GROUP_CAST_CAP = 2;
  const REAGGRO_DELAY = 15;                                    // 리쉬·포기 뒤 15초 동안은 먼저 덤비지 않는다(맞으면 싸운다)
  const aggroSpeed = () => (mons() && mons().AGGRO_SPEED) || 1.35;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  const inRange = (a, b, range) => dist(a, b) <= range + a.radius + b.radius;
  const mons = () => (typeof Monsters !== 'undefined' ? Monsters : null);

  function update(ent, battle, dt) {
    if (!alive(ent) || ent.cast) return;                 // 능력 시전 중엔 멈춘다
    if (ent.returning) return goHome(ent, battle, dt);
    if (!ent.aggro) { lookForParty(ent, battle); if (!ent.aggro) return patrol(ent, battle, dt); }
    fight(ent, battle, dt);
  }

  // ---- 순찰·발견 ----
  function patrol(ent, battle, dt) {
    const p = ent.patrol || (ent.patrol = { to: null, wait: battle.rng.float(0, PATROL_WAIT[1]) });
    if (!p.to) {
      p.wait -= dt;
      if (p.wait > 0) { ent.state = 'idle'; return; }
      const a = battle.rng.float(0, Math.PI * 2), r = battle.rng.float(TILE, PATROL_RADIUS);
      const to = { x: ent.home.x + Math.cos(a) * r, y: ent.home.y + Math.sin(a) * r };
      if (!battle.canStand(to.x, to.y, ent.radius)) { p.wait = 0.5; return; }
      p.to = to;
    }
    if (dist(ent, p.to) <= HOME_SLACK || !battle.moveTo(ent, p.to.x, p.to.y, dt)) { p.to = null; p.wait = battle.rng.float(PATROL_WAIT[0], PATROL_WAIT[1]); ent.state = 'idle'; }
  }
  function lookForParty(ent, battle) {
    if (ent.noAggroUntil > battle.time) return;            // 막 포기하고 돌아온 몬스터는 잠시 다시 덤비지 않는다(제자리 어그로 반복 방지)
    const found = battle.allies().find((e) => dist(e, ent) <= ent.aggroRange);
    if (found) aggroGroup(ent, battle, found);
  }
  // 한 마리가 발견하면 같은 무리(groupId)가 함께 덤비고, 무리원 4타일 안의 이웃 몬스터와 그 무리도 한 번 더 끌려온다(눈덩이).
  function aggroGroup(ent, battle, found) {
    const mates = groupMates(ent, battle).concat(ent);
    const near = battle.activeMonsters ? battle.activeMonsters() : battle.monsters.filter(alive);
    const pulled = new Set(mates);
    for (const n of near) {
      if (pulled.has(n) || n.aggro || n.returning || n.tier === 'boss') continue;   // 층 보스는 끌려오지 않는다(아레나에서 기다린다)
      if (!mates.some((m) => dist(m, n) <= NEIGHBOR_CALL_RANGE)) continue;
      for (const x of groupMates(n, battle).concat(n)) pulled.add(x);
    }
    for (const m of pulled) engage(m, battle, found);
  }
  function groupMates(ent, battle) {
    return ent.groupId == null ? [ent] : battle.monsters.filter((m) => alive(m) && m.groupId === ent.groupId && dist(m, ent) <= GROUP_CALL_RANGE);
  }
  function engage(m, battle, found) {
    if (m.aggro || m.returning || m.noAggroUntil > battle.time) return;
    m.aggro = true; m.target = found.uid; m.patrol = null;
    if (!m.threat[found.uid]) m.threat[found.uid] = 1;
    staggerCooldowns(m, battle);
    // 첫 공격도 흩어 놓는다 — 무리 15마리의 첫 타가 같은 틱에 꽂히면 힐로 받을 수 없는 일격사가 난다
    const iv = 1 / Math.max(0.05, (m.stats && m.stats.atkSpeed) || 1);
    m.atkTimer = Math.max(m.atkTimer || 0, battle.rng.float(0.3, 1.2) * iv);
  }
  // 첫 능력은 조금 뒤에(무리 전체가 같은 순간에 쏟아 붓지 않게)
  function staggerCooldowns(m, battle) {
    for (const id of m.abilities || []) if (!(m.cooldowns[id] > battle.time)) m.cooldowns[id] = battle.time + battle.rng.float(FIRST_USE_DELAY[0], FIRST_USE_DELAY[1]);
  }

  // ---- 교전 ----
  function fight(ent, battle, dt) {
    if (dist(ent, ent.home) > ent.leashRange) return leash(ent, battle);
    const tgt = chooseTarget(ent, battle);
    if (!tgt) return leash(ent, battle);
    ent.target = tgt.uid;
    if (tryAbility(ent, battle, tgt)) return;
    if (!inRange(ent, tgt, ent.range || 28)) { battle.moveTo(ent, tgt.x, tgt.y, dt, aggroSpeed()); separate(ent, battle); }
  }
  // 위협 1위. 현재 대상이 1위의 90% 이상이면 그대로(왔다갔다 방지). 위협표가 비면 가장 가까운 아군.
  function chooseTarget(ent, battle) {
    const top = battle.topThreat(ent);
    const cur = ent.target ? battle.byUid(ent.target) : null;
    if (top && alive(cur) && cur !== top && (ent.threat[cur.uid] || 0) * HYSTERESIS >= (ent.threat[top.uid] || 0)) return cur;
    if (top) return top;
    const list = battle.allies();
    return list.reduce((b, e) => (!b || dist(e, ent) < dist(b, ent) ? e : b), null);
  }
  function leash(ent, battle) {
    ent.aggro = false; ent.threat = {}; ent.target = null; ent.returning = true;
    ent.hp = ent.maxHp; ent.curses = [];                         // 복귀하며 회복
    ent.noAggroUntil = battle.time + REAGGRO_DELAY;
    ent.state = 'move';
  }
  function goHome(ent, battle, dt) {
    if (dist(ent, ent.home) <= HOME_SLACK || !battle.moveTo(ent, ent.home.x, ent.home.y, dt)) { ent.returning = false; ent.state = 'idle'; ent.patrol = null; }
  }
  // 같은 무리끼리 겹치지 않게 살짝 밀어낸다(그림이 뭉개지지 않게)
  function separate(ent, battle) {
    for (const m of battle.activeMonsters()) {
      if (m === ent) continue;
      const d = dist(ent, m), min = ent.radius + m.radius;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) * 0.5, nx = ent.x + ((ent.x - m.x) / d) * push, ny = ent.y + ((ent.y - m.y) / d) * push;
      if (battle.canStand(nx, ny, ent.radius)) { ent.x = nx; ent.y = ny; }
    }
  }

  // ---- 능력 ----
  function groupCasting(ent, battle) {
    let n = 0;
    for (const m of battle.monsters) if (m !== ent && m.cast && m.groupId === ent.groupId && m.tier === 'normal' && alive(m)) n++;
    return n;
  }
  function tryAbility(ent, battle, tgt) {
    const M = mons(); if (!M || !ent.def) return false;
    if (ent.tier === 'normal' && ent.groupId != null && ent.abilities.length && groupCasting(ent, battle) >= GROUP_CAST_CAP) return false;
    const ratio = ent.hp / ent.maxHp;
    trackPhase(ent, battle, ratio);
    for (const id of M.abilitiesFor(ent.def, ratio)) {
      if ((ent.cooldowns[id] || 0) > battle.time) continue;
      const ab = M.ability(id); if (!ab || !worthUsing(ab, ent, battle, tgt, ratio)) continue;
      if (battle.castAbility(ent, id).ok) return true;
    }
    return false;
  }
  function worthUsing(ab, ent, battle, tgt, ratio) {
    if (ab.type === 'summon') return battle.summonCount(ent) < 6;
    if (ab.type === 'heal_self') return ratio < HEAL_SELF_BELOW;
    if (ab.targetRule === 'self') return true;
    const ref = ab.targetRule === 'healer' && alive(battle.player) ? battle.player : tgt;
    const reach = ab.type === 'charge' ? (ab.range || ABILITY_REACH) : ABILITY_REACH;
    return !!ref && dist(ent, ref) <= reach;
  }
  // 보스 페이즈 전환을 이벤트로 알린다(UI 연출·로그용). 첫 설정은 알리지 않는다.
  function trackPhase(ent, battle, ratio) {
    const M = mons(); const ph = M.phaseFor(ent.def, ratio);
    if (!ph || ent.phase === ph) return;
    const prev = ent.phase; ent.phase = ph;
    if (!prev) return;
    battle.logMsg(`${ent.name} 의 기세가 바뀐다!`);
    if (typeof Events !== 'undefined') Events.emit('boss_phase', { uid: ent.uid, ent, id: ent.def.id, hpBelow: ph.hpBelow, abilities: ph.abilities.slice() });
  }

  return { update, chooseTarget, aggroGroup, PATROL_RADIUS, HYSTERESIS, NEIGHBOR_CALL_RANGE };
})();
if (typeof module !== 'undefined') module.exports = AIMonster;
