// 힐러 자동 로직 — DESIGN.md §8.2
// decide() 는 우선순위(부활 > 필살기 > 저주 해제 > 긴급 단일힐 > 광역힐 > 단일힐 > 일격 > 버프)를 위에서부터 훑어
// 처음 만족하는 스킬 하나만 돌려준다. 쿨/해금/MP 가 안 되는 스킬은 같은 틱 안에서 다음 순위로 넘어가고,
// useSkill 이 거부한 스킬은 0.5초 동안 다시 시도하지 않는다. update() 는 한 틱에 useSkill 을 최대 한 번만 부른다.
// 피해·힐·이동은 전부 battle 함수(useSkill/moveTo)를 거친다. DOM 없음.
const AIHealer = (() => {
  const TILE = 32;
  const RETRY_DELAY = 0.5;                  // 거부된 스킬 재시도 금지 시간
  const REBUFF_WINDOW = 5;                  // 버프가 이만큼 남으면 "비어 가는 중"으로 보고 다시 건다
  const BELT_COOLDOWN = 10;                 // Combat.beltAuto 와 같은 값(같은 battle.beltCooldowns 를 공유)
  const DODGE_MARGIN = 16;
  const HP = { critical: 0.3, urgent: 0.35, moderate: 0.6, hurt: 0.7, routine: 0.8, ultAvg: 0.45, ultLow: 0.4 };
  const MP = { healOnly: 0.2, basicOnly: 0.3, reserve: 0.5 };
  const URGENT_CURSES = ['root', 'heal_down', 'dot'];
  const ROLE_ORDER = { tank: 0, melee: 1, ranged: 2, healer: 3 };
  const BUFF_ORDER = ['buff_def', 'buff_atk', 'buff_aspd', 'buff_eva', 'buff_spd', 'buff_mana'];
  const BUFF_ROLES = { tank: ['tank'], dps: ['melee', 'ranged'], any: ['tank', 'melee', 'ranged', 'healer'] };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  const hpPct = (e) => (e.maxHp > 0 ? e.hp / e.maxHp : 1);
  const mpPct = (e) => (e.maxMp > 0 ? e.mp / e.maxMp : 0);
  const byHp = (list) => list.slice().sort((a, b) => hpPct(a) - hpPct(b));
  const roleRank = (e) => (ROLE_ORDER[e.role] != null ? ROLE_ORDER[e.role] : 9);
  const skill = (id) => (id && typeof Skills !== 'undefined' ? Skills.get(id) : null);
  const isUndead = (def, m) => (typeof Skills !== 'undefined' && Skills.canTarget ? Skills.canTarget(def, m) : (m.tags || []).includes('undead'));
  const nearest = (list, from) => list.reduce((best, m) => (!best || dist(m, from) < dist(best, from) ? m : best), null);

  // 전투 엔티티에 붙는 기억: 거부된 스킬, 버프를 마지막으로 본 시각, 마지막 행동 틱
  function memo(player) { return player.healerAI || (player.healerAI = { failed: {}, seen: {}, last: null, tick: -1 }); }

  function skillLevel(player, G, id) {
    if (G && typeof Level !== 'undefined' && Level.skillLevel) return Level.skillLevel(G, id);
    return (player.skillLevels || {})[id] || 0;
  }
  function settingsOf(G) { return (G && G.player && G.player.settings) || {}; }

  // ---------------- 판단 재료 ----------------
  function context(player, battle, G) {
    G = G || battle.G || null;
    const allies = battle.allies();
    const sorted = byHp(allies);
    return {
      player, battle, G, time: battle.time, mp: mpPct(player), m: memo(player), allies, sorted, lowest: sorted[0] || null,
      dead: battle.party().filter((e) => !e.alive), active: (G && G.player && G.player.active) || {},
      // inCombat 은 몬스터 전체를 훑으므로(활성 반경 검사) 필살기·일격·버프 규칙까지 내려왔을 때만 계산한다
      get inCombat() { if (this._inCombat == null) this._inCombat = battle.inCombat(); return this._inCombat; },
    };
  }
  // 마나 정책: MP<20% 는 기본힐·필살기만, MP<30% 는 기본힐 외 힐/일격/버프 금지, 버프·일격은 MP 50% 이상에서만
  function manaAllows(c, def) {
    if (c.mp < MP.healOnly) return def.id === 'heal_basic' || def.type === 'ultimate';
    if (def.type === 'buff' || def.type === 'smite') return c.mp >= MP.reserve;
    if (c.mp < MP.basicOnly) return !(def.type === 'aoe_heal' || def.type === 'ground_heal' || (def.type === 'single_heal' && def.id !== 'heal_basic'));
    return true;
  }
  // 지금 이 스킬을 요청해도 되는가(해금·쿨·MP·최근 거부·마나 정책). 되면 def, 아니면 null
  function usable(c, id) {
    const def = skill(id);
    if (!def || def.owner !== 'priest') return null;
    if (skillLevel(c.player, c.G, id) < 1) return null;
    if ((c.player.cooldowns[id] || 0) > c.time) return null;
    if ((c.m.failed[id] || 0) > c.time) return null;
    if (c.player.mp < Skills.mpCost(def, c.player)) return null;
    return manaAllows(c, def) ? def : null;
  }

  // ---------------- 대상 선택 ----------------
  function centroid(battle) {
    const list = battle.allies(); if (!list.length) return null;
    const x = list.reduce((s, e) => s + e.x, 0) / list.length, y = list.reduce((s, e) => s + e.y, 0) / list.length;
    if (battle.canStand(x, y)) return { x, y };
    const low = byHp(list)[0];                       // 무게중심이 벽이면 가장 아픈 사람 발밑
    return { x: low.x, y: low.y };
  }
  function pickResurrect(battle) {
    const dead = battle.party().filter((e) => !e.alive);
    dead.sort((a, b) => roleRank(a) - roleRank(b) || (b.level || 0) - (a.level || 0));
    return dead[0] || null;
  }
  function needsBuff(e, id, time) {
    const b = e.buffs.find((x) => x.id === id);
    return !b || (typeof b.until === 'number' && b.until - time < REBUFF_WINDOW);
  }
  // 버프 대상 후보를 역할 순으로. prefer 'tank' 는 탱커가 없으면 딜러가 맞고 있을 테니 딜러에게.
  function buffCandidates(def, caster, allies, time) {
    const pref = def.prefer || 'any';
    if (pref === 'self') return alive(caster) && needsBuff(caster, def.id, time) ? [caster] : [];
    let roles = BUFF_ROLES[pref] || BUFF_ROLES.any;
    if (pref === 'tank' && !allies.some((e) => e.role === 'tank')) roles = BUFF_ROLES.dps;
    return allies.filter((e) => roles.includes(e.role) && needsBuff(e, def.id, time))
      .sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role));
  }
  function pickSmite(def, caster, battle, engagedOnly) {
    const engaged = battle.engagedMonsters().filter((m) => isUndead(def, m));
    if (engaged.length || engagedOnly) return nearest(engaged, caster);
    return nearest(battle.activeMonsters().filter((m) => isUndead(def, m)), caster);
  }
  function nearestFoe(caster, battle) {
    const engaged = battle.engagedMonsters();
    return nearest(engaged.length ? engaged : battle.activeMonsters(), caster);
  }
  // 모든 스킬 타입. 광역힐은 HP 낮은 순 N 명(사용자 지정), 바닥힐은 파티 무게중심, 버프는 역할별.
  function pickTarget(def, caster, battle) {
    if (!def) return null;
    const allies = battle.allies();
    switch (def.type) {
      case 'single_heal': return byHp(allies)[0] || null;
      case 'aoe_heal': { const n = typeof def.targets === 'number' ? def.targets : allies.length; const list = byHp(allies).slice(0, n); return list.length ? list : null; }
      case 'ground_heal': return centroid(battle);
      case 'ultimate': return caster;
      case 'resurrect': return pickResurrect(battle);
      case 'cleanse': return byHp(allies.filter((e) => e.curses.length))[0] || null;
      case 'buff': return buffCandidates(def, caster, allies, battle.time)[0] || null;
      case 'smite': return pickSmite(def, caster, battle, false);
      case 'attack': return nearestFoe(caster, battle);
      default: return null;                     // taunt 등은 Combat 이 직접 고른다
    }
  }

  // ---------------- 우선순위 규칙 ----------------
  // 1. 죽은 파티원 + 부활 가능 + 즉시 위험(HP<30%) 없음 → 탱커 > 근딜 > 원딜 순
  function ruleResurrect(c) {
    if (!c.dead.length || c.allies.some((e) => hpPct(e) < HP.critical)) return null;
    if (!usable(c, 'resurrect')) return null;
    const t = pickResurrect(c.battle);
    return t ? { skillId: 'resurrect', target: t } : null;
  }
  // 2. 평균 HP<45% 또는 3명 이상 HP<40% → 필살기(전투 중에만: 300초 쿨을 아낀다)
  function ruleUltimate(c) {
    if (!c.inCombat || !c.allies.length) return null;
    const avg = c.allies.reduce((s, e) => s + hpPct(e), 0) / c.allies.length;
    const low = c.allies.filter((e) => hpPct(e) < HP.ultLow).length;
    if (avg >= HP.ultAvg && low < 3) return null;
    return usable(c, 'holy_light') ? { skillId: 'holy_light' } : null;
  }
  // 3. 저주 걸린 아군 중 HP 가 가장 낮은 대상. root/heal_down/dot 은 즉시, 나머지는 HP<70% 이거나 힐 대상이 없을 때
  //    (단, 누군가 긴급(<35%)이면 급하지 않은 저주는 힐 뒤로 미룬다)
  function ruleCleanse(c) {
    if (!usable(c, 'cleanse')) return null;
    const critical = c.allies.some((e) => hpPct(e) < HP.urgent);
    const needHeal = !!c.lowest && hpPct(c.lowest) < HP.routine;
    const urgent = (e) => e.curses.some((x) => URGENT_CURSES.includes(x.id));
    const cands = c.allies.filter((e) => e.curses.length && (urgent(e) || (!critical && (hpPct(e) < HP.hurt || !needHeal))));
    const t = byHp(cands)[0];
    return t ? { skillId: 'cleanse', target: t } : null;
  }
  // 단일힐 스킬 고르기. 긴급(<35%)은 즉시힐로 승격, 35~60% 는 빠른 힐, 60~80% 는 플레이어가 고른 active.single. MP<30% 면 항상 기본힐.
  function healWith(c, target) {
    const pct = hpPct(target), act = c.active.single, actDef = skill(act);
    const actFast = actDef && actDef.type === 'single_heal' && actDef.castTime <= 1 ? act : null;
    let order;
    if (c.mp < MP.basicOnly) order = ['heal_basic'];
    else if (pct < HP.urgent) order = ['heal_instant', 'heal_fast', act, 'heal_basic'];
    else if (pct < HP.moderate) order = [actFast, 'heal_fast', act, 'heal_basic'];
    else order = [act, 'heal_basic'];
    for (const id of order) {
      const def = usable(c, id);
      if (def && def.type === 'single_heal') return { skillId: id, target };
    }
    return null;
  }
  // 4a. 누군가 긴급(<35%)이면 광역보다 단일힐이 먼저
  function ruleEmergencyHeal(c) {
    return c.lowest && hpPct(c.lowest) < HP.urgent ? healWith(c, c.lowest) : null;
  }
  // 5. 2명 이상 HP<70% → 광역힐. 모여 있으면(무게중심 2.5타일 안에 3명 이상, 그중 다친 사람 2명 이상) 성역 우선, 3명 이상이면 aoe_3
  function ruleAoe(c) {
    const hurt = c.allies.filter((e) => hpPct(e) < HP.hurt);
    if (hurt.length < 2) return null;
    const ground = usable(c, 'aoe_ground');
    if (ground) {
      const pos = centroid(c.battle), r = ground.radius || 2.5 * TILE;
      const inside = (list) => list.filter((e) => dist(e, pos) <= r).length;
      if (pos && inside(c.allies) >= 3 && inside(hurt) >= 2) return { skillId: 'aoe_ground', x: pos.x, y: pos.y };
    }
    const actDef = skill(c.active.aoe);
    const order = [hurt.length >= 3 ? 'aoe_3' : null, actDef && actDef.type === 'aoe_heal' ? c.active.aoe : null, 'aoe_2', 'aoe_3'];
    for (const id of order) {
      const def = id && usable(c, id);
      if (def) return { skillId: id, target: pickTarget(def, c.player, c.battle) };
    }
    return null;
  }
  // 4b. HP% 가 가장 낮은 아군이 80% 미만이면 단일힐
  function ruleSingleHeal(c) {
    return c.lowest && hpPct(c.lowest) < HP.routine ? healWith(c, c.lowest) : null;
  }
  // 6. 언데드와 교전 중이고 아무도 힐이 필요 없으면 일격
  function ruleSmite(c) {
    if (!c.inCombat || (c.lowest && hpPct(c.lowest) < HP.routine)) return null;
    const def = usable(c, 'smite'); if (!def) return null;
    const t = pickSmite(def, c.player, c.battle, true);
    return t ? { skillId: 'smite', target: t } : null;
  }
  // 7. 버프 유지: 전투 중 + MP 여유. 가장 오래 비어 있던 (버프, 대상)부터, 같으면 방어(탱커) > 공격(딜러) > 공속 … 순
  function ruleBuff(c) {
    if (!c.inCombat) return null;
    let best = null;
    for (const id of BUFF_ORDER) {
      const def = usable(c, id); if (!def) continue;
      for (const e of buffCandidates(def, c.player, c.allies, c.time)) {
        const missing = c.time - (c.m.seen[id + '|' + e.uid] || 0);
        if (!best || missing > best.missing) best = { missing, id, target: e };
      }
    }
    return best ? { skillId: best.id, target: best.target } : null;
  }

  function decide(player, battle, G) {
    if (!alive(player) || player.cast || battle.result) return null;
    const c = context(player, battle, G);
    return ruleResurrect(c) || ruleUltimate(c) || ruleCleanse(c) || ruleEmergencyHeal(c) || ruleAoe(c)
      || ruleSingleHeal(c) || ruleSmite(c) || ruleBuff(c) || null;
  }

  // ---------------- 위험 회피 ----------------
  function dangerous(tg) { return tg.type === 'puddle' ? !tg.resolved || !!tg.active : !tg.resolved; }
  function exitCandidates(tg, ent) {
    const out = ent.radius + DODGE_MARGIN, pts = [];
    if (tg.type === 'cone') {
      const half = (tg.angle * Math.PI / 180) / 2, d = Math.max(40, dist(tg, ent));
      for (const s of [1, -1]) { const a = tg.facing + s * (half + 0.35); pts.push({ x: tg.x + Math.cos(a) * d, y: tg.y + Math.sin(a) * d }); }
    } else if (tg.type === 'line') {
      const vx = tg.x2 - tg.x, vy = tg.y2 - tg.y, len = Math.hypot(vx, vy) || 1;
      for (const s of [1, -1]) pts.push({ x: ent.x + (-vy / len) * s * (tg.r + out), y: ent.y + (vx / len) * s * (tg.r + out) });
    } else {
      const d = dist(tg, ent), base = d > 1 ? Math.atan2(ent.y - tg.y, ent.x - tg.x) : 0;
      for (let k = 0; k < 12; k++) { const a = base + (k * Math.PI) / 6; pts.push({ x: tg.x + Math.cos(a) * (tg.r + out), y: tg.y + Math.sin(a) * (tg.r + out) }); }
    }
    return pts;
  }
  // 플레이어가 위험한 텔레그래프/장판 안이면 밖의 가장 가까운(다른 텔레그래프에도 안 걸리는) 안전 지점
  function dodge(player, battle) {
    if (!alive(player)) return null;
    const danger = battle.telegraphs.filter((t) => dangerous(t));
    const inside = danger.filter((t) => battle.inTelegraph(t, player));
    if (!inside.length) return null;
    const probe = { x: 0, y: 0, radius: player.radius };
    const safe = (p) => { probe.x = p.x; probe.y = p.y; return battle.canStand(p.x, p.y, player.radius) && !danger.some((t) => battle.inTelegraph(t, probe)); };
    const pts = inside.flatMap((t) => exitCandidates(t, player)).filter(safe);
    pts.sort((a, b) => dist(a, player) - dist(b, player));
    return pts[0] ? { x: pts[0].x, y: pts[0].y } : null;
  }

  // ---------------- 틱 ----------------
  // 버프를 마지막으로 본 시각을 적어 두면 "가장 오래 비어 있는 버프"를 알 수 있다
  function trackBuffs(m, battle) {
    for (const e of battle.allies()) for (const b of e.buffs) if (BUFF_ORDER.includes(b.id)) m.seen[b.id + '|' + e.uid] = battle.time;
  }
  // 벨트의 MP 포션. Combat.beltAuto(MP<25%) 와 같은 쿨 표를 써서 두 번 마시지 않는다
  function drinkMana(player, battle, G) {
    if (!G || typeof Inventory === 'undefined' || !Inventory.useConsumable || typeof Items === 'undefined') return false;
    const cd = battle.beltCooldowns || (battle.beltCooldowns = {});
    for (const id of G.player.belt || []) {
      if (!id || (cd[id] || 0) > battle.time) continue;
      const def = Items.get(id), fx = def && def.effect;
      if (!fx || !(fx.mp || fx.mpPct)) continue;
      if (Inventory.useConsumable(G, id, player, battle.time)) { cd[id] = battle.time + BELT_COOLDOWN; return true; }
    }
    return false;
  }
  function targetArg(d) {
    if (d.target != null) return d.target;
    return typeof d.x === 'number' ? { x: d.x, y: d.y } : undefined;
  }
  function update(player, battle, G, dt) {
    if (!alive(player) || battle.result) return;
    G = G || battle.G || null;
    const m = memo(player);
    if (m.tick === battle.time) return;              // 같은 틱에 두 번 불려도 스킬은 한 번만
    m.tick = battle.time;
    trackBuffs(m, battle);
    const settings = settingsOf(G);
    if (settings.autoDodge) {
      const p = dodge(player, battle);
      if (p && battle.moveTo(player, p.x, p.y, dt)) return;   // 이동하면 시전은 끊긴다(Combat.moveTo)
    }
    if (settings.autoHeal === false || player.cast) return;
    if (mpPct(player) < MP.healOnly) drinkMana(player, battle, G);
    const d = decide(player, battle, G);
    if (!d) return;
    const r = battle.useSkill(player, d.skillId, targetArg(d));
    if (r && r.ok) m.last = { skillId: d.skillId, t: battle.time };
    else m.failed[d.skillId] = battle.time + RETRY_DELAY;
  }

  return { decide, pickTarget, update, dodge, HP, MP, RETRY_DELAY, REBUFF_WINDOW, URGENT_CURSES, BUFF_ORDER };
})();
if (typeof module !== 'undefined') module.exports = AIHealer;
