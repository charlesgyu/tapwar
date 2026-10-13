// 전투 엔진 — DESIGN.md §8
// battle.update(dt) 한 번에 이동·어그로·기본 공격·시전·버프/저주 만료·텔레그래프/장판·성역·사망·루팅을 처리한다.
// AI(AIParty/AIMonster/AIHealer)는 "대상 고르기·이동·스킬 요청"만 하고, 실제 피해/힐/상태 변화는 전부 여기 함수를 거친다
// (위협·이벤트·카운터가 한 곳에서만 갱신되도록). 맵은 { solid(i,j), cols, rows } 만 쓴다.
const Combat = (() => {
  const TILE = 32;
  const ACTIVE_RANGE = 20 * TILE;          // 이 반경 밖 몬스터는 갱신하지 않는다(성능)
  const PUDDLE_TICK = 0.5, GROUND_HEAL_TICK = 1, BELT_CHECK = 0.5, BELT_COOLDOWN = 10, REFRESH_EVERY = 2;
  const HEAL_THREAT = 0.5, TAUNT_MIN_THREAT = 50, CRIT_MULT = 1.5;
  const DEFAULT_TANK_THREAT = 3;           // Floors 가 없을 때의 탱커 위협 보정
  const CURSE_DURATION = [10, 20];
  const DOT_PCT = 0.02;                     // 맹독: 초당 최대 HP 2%
  const LOG_MAX = 50;
  const MAX_SUMMONS = 6;                    // 보스 소환 부하 동시 상한
  // 한 대상을 동시에 근접 공격할 수 있는 몬스터 수(자리 다툼). 무리 20마리가 탱커 하나를 한꺼번에 때리지 못한다 —
  // 나머지는 둘러싸고 차례를 기다린다(원거리는 제한 없음). 1초 창으로 센다.
  const MELEE_SLOTS = 5, MELEE_RANGE_MAX = 60, SLOT_WINDOW = 1;
  // 일반 몬스터 능력(돌진·내리찍기·장판) 피해 배수: 무리가 커져 능력이 자주 나오고, 파티가 한 덩어리로 붙어 다녀
  // 범위기 한 번에 여럿이 맞으므로 줄인다. 중간보스·보스는 그대로(×1).
  const NORMAL_ABILITY_MULT = 0.6;
  const CLEANSE_PRIORITY = ['root', 'heal_down', 'dot', 'def_down', 'atk_down', 'aspd_down', 'spd_down'];

  // 브라우저에서 최상위 const 모듈은 window 프로퍼티가 아니므로 typeof 로만 존재를 확인한다(노드 vm 도 동일하게 동작).
  const Mods = {
    get Events() { return typeof Events !== 'undefined' ? Events : null; },
    get Skills() { return typeof Skills !== 'undefined' ? Skills : null; },
    get Monsters() { return typeof Monsters !== 'undefined' ? Monsters : null; },
    get Floors() { return typeof Floors !== 'undefined' ? Floors : null; },
    get Entities() { return typeof Entities !== 'undefined' ? Entities : null; },
    get Inventory() { return typeof Inventory !== 'undefined' ? Inventory : null; },
    get Items() { return typeof Items !== 'undefined' ? Items : null; },
    get Level() { return typeof Level !== 'undefined' ? Level : null; },
    get Loot() { return typeof Loot !== 'undefined' ? Loot : null; },
    get AIParty() { return typeof AIParty !== 'undefined' ? AIParty : null; },
    get AIMonster() { return typeof AIMonster !== 'undefined' ? AIMonster : null; },
    get AIHealer() { return typeof AIHealer !== 'undefined' ? AIHealer : null; },
    get RNG() { return typeof RNG !== 'undefined' ? RNG : null; },
    get State() { return typeof State !== 'undefined' ? State : null; },
    get Classes() { return typeof Classes !== 'undefined' ? Classes : null; },
    get Chatter() { return typeof Chatter !== 'undefined' ? Chatter : null; },
  };
  const has = (name) => !!Mods[name];
  const emit = (name, payload) => { if (has('Events')) Events.emit(name, payload); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isParty = (e) => e.kind === 'player' || e.kind === 'member';
  const alive = (e) => !!e && e.alive;
  const lowest = (list, key) => list.reduce((best, e) => (!best || key(e) < key(best) ? e : best), null);

  function create(opts) {
    const map = opts.map || { solid: () => false, cols: 1e9, rows: 1e9 };
    const rng = opts.rng || (has('RNG') ? RNG.global() : { next: Math.random, chance: (p) => Math.random() < p, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), pick: (a) => a[Math.floor(Math.random() * a.length)], float: (a, b) => a + Math.random() * (b - a) });
    const G = opts.G || (has('State') ? State.get() : null);
    const player = opts.player || null;
    const members = (opts.members || []).slice();
    const monsters = (opts.monsters || []).slice();
    const floor = opts.floor || (monsters[0] && monsters[0].floor) || 1;
    const B = {
      // 전투 시계는 G.playTime 에서 시작한다 — 음식 버프 until 이 마을에서 playTime 기준으로 찍히므로(Facilities.inn.eat·Inventory.useConsumable)
      // 0 에서 시작하면 오래 플레이한 저장일수록 음식 버프가 던전에서 몇 시간씩 지속됐다. Floor.leave 가 playTime += fs.time 으로 이어 붙인다.
      time: typeof opts.time === 'number' ? opts.time : ((G && typeof G.playTime === 'number') ? G.playTime : 0), map, rng, G, floor, player, members, monsters,
      entities: [player, ...members, ...monsters].filter(Boolean),
      telegraphs: [], groundHeals: [], log: [], result: null,
      autoLoot: opts.autoLoot !== false, driveHealer: opts.driveHealer !== false, aiEnabled: opts.ai !== false,
      // deferGold: 씬이 바닥에 떨어진 동전을 주워 담는 경우 true — 처치 골드를 즉시 더하지 않고 'monster_killed'/'loot' 의 gold·x·y 로만 알린다.
      // 씬은 동전을 주울 때 battle.collectGold(amount) 를 부른다. 기본 false(테스트·시뮬은 예전처럼 즉시 적용).
      deferGold: !!opts.deferGold,
      chatter: opts.chatter !== false, kills: 0, lastKill: null, lead: null,
      beltCooldowns: {}, _tgSeq: 0, _belt: 0, _refresh: 0,
    };
    const party = () => B.entities.filter(isParty);
    const allies = () => party().filter(alive);

    function logMsg(text) { B.log.push({ t: B.time, text }); if (B.log.length > LOG_MAX) B.log.shift(); }

    // ---------------- 지형·이동 ----------------
    function canStand(x, y, r = 0) {
      const pts = r ? [[x, y], [x - r, y], [x + r, y], [x, y - r], [x, y + r]] : [[x, y]];
      return pts.every(([px, py]) => !map.solid(Math.floor(px / TILE), Math.floor(py / TILE)));
    }
    function faceTo(ent, dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) ent.dir = dx < 0 ? 'left' : 'right';
      else if (dy !== 0) ent.dir = dy < 0 ? 'up' : 'down';
    }
    // 목표 쪽으로 speed×dt 만큼. 막히면 축 하나씩 미끄러진다. 플레이어는 움직이면 시전이 끊긴다.
    // speedMult(선택): 교전 중 몬스터 돌진(×1.35)·뒤처진 파티원 따라잡기처럼 잠깐 빠르게 움직일 때.
    function moveTo(ent, x, y, dt, speedMult) {
      if (!alive(ent) || !(ent.speed > 0) || (ent.stats && ent.stats.rooted)) return false;
      const dx = x - ent.x, dy = y - ent.y, d = Math.hypot(dx, dy);
      if (d < 0.5) return false;
      const step = Math.min(d, ent.speed * (speedMult > 0 ? speedMult : 1) * dt);
      const nx = ent.x + (dx / d) * step, ny = ent.y + (dy / d) * step;
      let moved = false;
      if (canStand(nx, ny, ent.radius)) { ent.x = nx; ent.y = ny; moved = true; }
      else if (canStand(nx, ent.y, ent.radius)) { ent.x = nx; moved = true; }
      else if (canStand(ent.x, ny, ent.radius)) { ent.y = ny; moved = true; }
      if (!moved) return false;
      faceTo(ent, dx, dy);
      if (ent.kind === 'player' && ent.cast) cancelCast(ent, 'moved');
      if (ent.state !== 'cast') ent.state = 'move';
      return true;
    }
    function nearestStandable(x, y, r) {
      if (canStand(x, y, r)) return { x, y };
      for (let ring = 1; ring <= 4; ring++) {
        for (let k = 0; k < 8; k++) {
          const a = (Math.PI / 4) * k, px = x + Math.cos(a) * ring * TILE, py = y + Math.sin(a) * ring * TILE;
          if (canStand(px, py, r)) return { x: px, y: py };
        }
      }
      return { x, y };
    }

    // ---------------- 상태(버프/저주) ----------------
    function refresh(ent) { if (has('Entities')) Entities.refresh(ent, G, B.time); }
    function addBuff(ent, buff) {
      ent.buffs = ent.buffs.filter((b) => b.id !== buff.id);
      ent.buffs.push(buff);
      refresh(ent);
    }
    function applyCurse(dst, curseId, dur, o = {}) {
      if (!alive(dst)) return false;
      const d = dur || rng.int(CURSE_DURATION[0], CURSE_DURATION[1]);
      const until = B.time + d;
      const cur = dst.curses.find((c) => c.id === curseId);
      if (cur) cur.until = Math.max(cur.until, until);
      else dst.curses.push(curseId === 'dot' ? { id: 'dot', until, dps: o.dps || Math.max(2, Math.round(dst.maxHp * DOT_PCT)) } : { id: curseId, until });
      refresh(dst);
      emit('curse', { uid: dst.uid, ent: dst, id: curseId, until, src: o.src ? o.src.uid : null });
      return true;
    }
    function cleanse(dst, n = 1) {
      if (!dst || !dst.curses.length) return [];
      const rank = (c) => { const i = CLEANSE_PRIORITY.indexOf(c.id); return i < 0 ? 99 : i; };
      const gone = dst.curses.slice().sort((a, b) => rank(a) - rank(b)).slice(0, n);
      dst.curses = dst.curses.filter((c) => !gone.includes(c));
      refresh(dst);
      const removed = gone.map((c) => c.id);
      emit('cleanse', { uid: dst.uid, ent: dst, removed });
      return removed;
    }
    // 만료된 버프/저주를 지운다. 무언가 빠졌을 때만 파생 스탯을 다시 계산한다.
    function expireStatus(ent) {
      const nb = ent.buffs.filter((b) => !(typeof b.until === 'number' && b.until <= B.time));
      const nc = ent.curses.filter((c) => c.until > B.time);
      if (nb.length === ent.buffs.length && nc.length === ent.curses.length) return;
      for (const c of ent.curses) if (!nc.includes(c)) emit('curse_expired', { uid: ent.uid, ent, id: c.id });
      ent.buffs = nb; ent.curses = nc;
      refresh(ent);
    }
    function tickDot(ent, dt) {
      for (const c of ent.curses) if (c.id === 'dot' && c.dps) {
        c.acc = (c.acc || 0) + dt;
        if (c.acc >= 1) { c.acc -= 1; damage(null, ent, c.dps, { type: 'dot', noEvade: true, noDef: true, noThreat: true }); }
      }
    }

    // ---------------- 위협(어그로) ----------------
    function tankThreatMult() { return has('Floors') && Floors.tankThreatMult ? Floors.tankThreatMult(B.floor) : DEFAULT_TANK_THREAT; }
    function addThreat(mon, src, amount) {
      if (!alive(mon) || !src || !isParty(src)) return;
      const mult = src.role === 'tank' ? tankThreatMult() * (mon.threatMult || 1) : 1;
      mon.threat[src.uid] = (mon.threat[src.uid] || 0) + amount * mult;
      mon.aggro = true;
    }
    function engaged() { return B.monsters.filter((m) => alive(m) && m.aggro); }
    function spreadHealThreat(src, amount) {
      const list = engaged(); if (!list.length) return;
      const each = (amount * HEAL_THREAT) / list.length;
      for (const m of list) m.threat[src.uid] = (m.threat[src.uid] || 0) + each;
    }
    function topThreat(mon) {
      let best = null, bestV = -1;
      for (const [uid, v] of Object.entries(mon.threat)) {
        const e = byUid(uid);
        if (alive(e) && v > bestV) { best = e; bestV = v; }
      }
      return best;
    }
    function taunt(src, mon, mult) {
      const top = Math.max(TAUNT_MIN_THREAT, ...Object.values(mon.threat), mon.threat[src.uid] || 0);
      mon.threat[src.uid] = top * mult;
      mon.target = src.uid; mon.aggro = true;
    }
    function byUid(uid) { return B.entities.find((e) => e.uid === uid) || null; }

    // ---------------- 피해·힐 ----------------
    // 파티(플레이어·파티원)의 공격력에는 Classes.DMG_MULT(빠른 전투 템포 보정)를 곱한다. 몬스터는 그대로.
    function partyDmgMult(src) { return isParty(src) && has('Classes') && Classes.DMG_MULT ? Classes.DMG_MULT : 1; }
    function attackPower(src, dmgType) {
      const s = src.stats || {};
      const kind = dmgType || src.dmgStat || 'atk';
      const m = partyDmgMult(src);
      if (kind === 'magic' || kind === 'matk') return (s.matk || s.atk || 0) * m;
      if (kind === 'hybrid') return (((s.atk || 0) + (s.matk || 0)) / 2) * m;
      return (s.atk || 0) * m;
    }
    // 피해 = max(1, atk×mult − def×0.5) × (0.9~1.1). opts: { mult, crit(강제), noEvade, noDef, noThreat, type, skillId, abilityId, amount(고정) }
    function damage(src, dst, amount, o = {}) {
      if (!alive(dst) || B.result) return 0;
      if (!o.noEvade && src && rng.chance(((dst.stats && dst.stats.evasion) || 0) / 100)) {
        emit('damage', { src, dst, srcUid: src.uid, dstUid: dst.uid, amount: 0, evaded: true, crit: false, type: o.type || 'hit', skillId: o.skillId });
        return 0;
      }
      const def = o.noDef ? 0 : ((dst.stats && dst.stats.def) || 0) * 0.5;
      const crit = o.crit === true || (src && !o.noCrit && rng.chance(((src.stats && src.stats.crit) || 0) / 100));
      let dmg = Math.max(1, amount * (o.mult || 1) - def) * rng.float(0.9, 1.1) * (crit ? CRIT_MULT : 1);
      dmg = Math.max(1, Math.round(dmg));
      dst.hp = Math.max(0, dst.hp - dmg);
      if (dst.kind === 'monster') dst.lastHurt = B.time;   // Floor 의 "닿지 않는 원거리 몬스터" 판정용
      if (src && dst.kind === 'monster' && !o.noThreat) addThreat(dst, src, dmg);
      if (src && isParty(dst) && dst.kind === 'player' && has('Inventory') && Inventory.wear && G) Inventory.wear(G, 0.05);
      emit('damage', { src, dst, srcUid: src ? src.uid : null, dstUid: dst.uid, amount: dmg, evaded: false, crit, type: o.type || 'hit', skillId: o.skillId, abilityId: o.abilityId, hp: dst.hp });
      if (dst.hp <= 0) die(dst, src);
      return dmg;
    }
    function heal(src, dst, amount, o = {}) {
      if (!alive(dst) || !(amount > 0)) return 0;
      const eff = Math.min(dst.maxHp - dst.hp, Math.round(amount * ((dst.stats && dst.stats.healTakenMult) || 1)));
      if (eff <= 0) return 0;
      dst.hp += eff;
      if (src && isParty(src) && dst.kind !== 'monster') spreadHealThreat(src, eff);
      if (G && src && src.kind === 'player') G.counters.heals = (G.counters.heals || 0) + eff;
      emit('heal', { src, dst, srcUid: src ? src.uid : null, dstUid: dst.uid, amount: eff, skillId: o.skillId, hp: dst.hp });
      if (src && src.kind === 'player') emit('heal_done', { amount: eff, targetUid: dst.uid, skillId: o.skillId });
      return eff;
    }

    // ---------------- 사망·부활·루팅 ----------------
    function die(ent, killer) {
      ent.alive = false; ent.state = 'dead'; ent.hp = 0; ent.cast = null; ent.target = null;
      // 저주와 축복(스킬 버프)은 죽으면 사라지고, 음식 버프(아이템 id)는 남긴다
      ent.curses = []; ent.buffs = ent.buffs.filter((b) => !(has('Skills') && Skills.get(b.id)));
      emit('death', { uid: ent.uid, ent, kind: ent.kind, name: ent.name, killer: killer ? killer.uid : null });
      logMsg(`${ent.name} 쓰러짐`);
      if (ent.kind === 'monster') onMonsterKilled(ent, killer);
      else { for (const m of B.monsters) if (m.target === ent.uid) m.target = null; checkWipe(); }
    }
    function revive(ent, pct, src) {
      if (alive(ent)) return false;
      ent.alive = true; ent.state = 'idle';
      refresh(ent);
      ent.hp = Math.max(1, Math.round(ent.maxHp * pct));
      emit('revive', { uid: ent.uid, ent, hp: ent.hp, src: src ? src.uid : null });
      logMsg(`${ent.name} 부활`);
      return true;
    }
    function checkWipe() {
      if (B.result || party().some(alive)) return;
      B.result = 'wipe';
      emit('wipe', { floor: B.floor, time: B.time });
    }
    function onMonsterKilled(ent, killer) {
      const d = ent.def || {};
      for (const m of B.monsters) delete m.threat[ent.uid];
      // 파티 수다(Chatter)가 연속 처치·중간보스 처치를 읽는다
      B.kills = (B.kills || 0) + 1; B.lastKill = { uid: ent.uid, killer: killer ? killer.uid : null, tier: d.tier, t: B.time };
      if (G) { G.counters.kills = (G.counters.kills || 0) + 1; if (d.tier === 'boss') G.counters.bossKills = (G.counters.bossKills || 0) + 1; }
      // 드랍을 먼저 굴려 처치 이벤트에 골드·위치를 싣는다(씬이 그 자리에 동전을 뿌린다). deferGold 면 골드는 씬이 collectGold 로 더한다.
      const loot = has('Loot') && Loot.roll && d.id ? Loot.roll(d, B.floor, rng) : null;
      const gold = loot ? (loot.gold || 0) : 0;
      emit('monster_killed', { id: d.id, family: d.family, tags: d.tags || [], tier: d.tier, floor: B.floor, uid: ent.uid, ent, x: ent.x, y: ent.y,
        killer: killer ? killer.uid : null, gold, goldDeferred: B.deferGold && gold > 0 });
      if (d.tier === 'boss') emit('boss_killed', { id: d.id, floor: B.floor, uid: ent.uid });
      grantXp(ent.xp || 0);
      if (loot) dropLoot(ent, loot);
    }
    function grantXp(xp) {
      if (!(xp > 0) || !has('Level') || !Level.addXp) return;
      for (const e of allies()) {
        if (!e.src) continue;
        const r = Level.addXp(e.src, xp, G);
        if (r.levelsGained) { refresh(e); e.hp = e.maxHp; e.mp = e.maxMp; e.level = e.src.level; }
      }
    }
    function dropLoot(ent, loot) {
      const added = [], lost = [];
      if (B.autoLoot && G) {
        if (!B.deferGold) G.player.gold = (G.player.gold || 0) + (loot.gold || 0);
        for (const it of loot.items) { if (has('Inventory') && Inventory.add && Inventory.add(G, it)) added.push(it); else lost.push(it); }
      }
      emit('loot', { gold: loot.gold, items: loot.items, added, lost, uid: ent.uid, monsterId: ent.def && ent.def.id, x: ent.x, y: ent.y,
        applied: B.autoLoot && !!G, goldDeferred: B.deferGold && (loot.gold || 0) > 0 });
    }
    // deferGold 일 때 씬이 동전을 주우면 부른다. G.player.gold 에 더하고 'gold_changed' { source: 'pickup' } 를 낸다.
    function collectGold(amount, x, y) {
      const n = Math.max(0, Math.round(amount || 0));
      if (!G || !n) return 0;
      G.player.gold = (G.player.gold || 0) + n;
      emit('gold_changed', { gold: G.player.gold, delta: n, source: 'pickup', x, y });
      return n;
    }

    // ---------------- 시전(스킬) ----------------
    function skillLevelOf(caster, id) {
      if (caster.kind === 'player') return G && has('Level') && Level.skillLevel ? Level.skillLevel(G, id) : ((caster.skillLevels || {})[id] || 1);
      return 1;
    }
    function canUseSkill(caster, def) {
      if (!alive(caster)) return 'dead';
      if (caster.cast) return 'casting';
      if ((caster.cooldowns[def.id] || 0) > B.time) return 'cooldown';
      if (caster.kind === 'player') { if (skillLevelOf(caster, def.id) < 1) return 'locked'; }
      else if (def.owner !== caster.cls && !(def.owners || []).includes(caster.cls)) return 'not_owner';
      if (caster.kind === 'member' && caster.level < (def.unlockLevel || 1)) return 'locked';
      if (caster.mp < Skills.mpCost(def, caster)) return 'mp';
      return null;
    }
    // 대상 자동 선택: AIHealer.pickTarget 이 있으면 위임, 없으면 단순 규칙(HP% 최저 등)
    function pickTarget(def, caster) {
      if (has('AIHealer') && AIHealer.pickTarget) { const t = AIHealer.pickTarget(def, caster, B); if (t) return t; }
      const hpPct = (e) => e.hp / e.maxHp;
      switch (def.type) {
        case 'resurrect': return party().find((e) => !e.alive) || null;
        case 'cleanse': return lowest(allies().filter((e) => e.curses.length), hpPct);
        case 'smite': return lowest(B.monsters.filter((m) => alive(m) && Skills.canTarget(def, m)), (m) => dist(m, caster));
        case 'buff': return buffTarget(def, caster);
        case 'ground_heal': { const t = lowest(allies(), hpPct) || caster; return { x: t.x, y: t.y }; }
        case 'taunt': case 'attack': return lowest(engaged().length ? engaged() : B.monsters.filter(alive), (m) => dist(m, caster));
        default: return lowest(allies(), hpPct);
      }
    }
    function buffTarget(def, caster) {
      const list = allies().filter((e) => !e.buffs.some((b) => b.id === def.id));
      const pref = def.prefer || 'any';
      if (pref === 'self') return caster;
      const byRole = pref === 'tank' ? list.filter((e) => e.role === 'tank') : pref === 'dps' ? list.filter((e) => e.role === 'melee' || e.role === 'ranged') : [];
      return byRole[0] || list[0] || null;
    }
    function validTarget(def, caster, target) {
      if (def.type === 'ground_heal') return !!target && typeof target.x === 'number';
      if (def.type === 'ultimate') return true;
      if (def.type === 'taunt') return true;
      // [AIHealer 통합] 광역힐은 AIHealer.pickTarget 이 고른 대상 목록([ents], HP 낮은 순 N 명)을 그대로 받는다
      if (def.type === 'aoe_heal' && Array.isArray(target)) return target.some((e) => isParty(e) && alive(e));
      if (!target) return false;
      if (def.type === 'resurrect') return isParty(target) && !target.alive;
      if (def.type === 'smite' || def.type === 'attack') return target.kind === 'monster' && alive(target) && Skills.canTarget(def, target);
      return isParty(target) && alive(target);
    }
    // 세트 proc: 기본힐/광역힐 즉시 시전, 마나 무소비. Stats.derive().procs 로 들어온다.
    function procs(caster, kind) {
      const list = (caster.stats && caster.stats.procs) || [];
      return list.some((p) => (p.proc || p.type) === kind && rng.chance(p.chance || 0));
    }
    function useSkill(caster, skillId, target) {
      if (B.result) return { ok: false, reason: 'ended' };
      const def = has('Skills') ? Skills.get(skillId) : null;
      if (!def) return { ok: false, reason: 'no_skill' };
      const why = canUseSkill(caster, def);
      if (why) return { ok: false, reason: why };
      const tgt = target == null ? pickTarget(def, caster) : target;
      if (!validTarget(def, caster, tgt)) return { ok: false, reason: 'no_target' };
      let total = Skills.castTime(def, caster);
      if (caster.kind === 'player' && ((def.type === 'single_heal' && def.id === 'heal_basic' && procs(caster, 'instant_basic')) || (def.type === 'aoe_heal' && procs(caster, 'instant_aoe')))) total = 0;
      const pos = tgt && typeof tgt.x === 'number' && !tgt.uid ? tgt : null;
      const targets = Array.isArray(tgt) ? tgt.map((e) => e.uid) : null;   // [AIHealer 통합] 광역힐 대상 목록
      const cast = { skillId, t: 0, total, target: tgt && tgt.uid ? tgt.uid : null, targets, x: pos ? pos.x : undefined, y: pos ? pos.y : undefined, free: caster.kind === 'player' && procs(caster, 'free_mana') };
      emit('cast_start', { uid: caster.uid, ent: caster, skillId, total, target: cast.target });
      if (total <= 0) { finishCast(caster, cast); return { ok: true, instant: true }; }
      caster.cast = cast; caster.state = 'cast';
      return { ok: true };
    }
    function cancelCast(ent, reason) {
      if (!ent.cast) return;
      const c = ent.cast; ent.cast = null;
      if (ent.state === 'cast') ent.state = 'idle';
      emit('cast_cancel', { uid: ent.uid, ent, skillId: c.skillId, abilityId: c.abilityId, reason });
    }
    function finishCast(caster, cast) {
      caster.cast = null; if (caster.state === 'cast') caster.state = 'idle';
      const def = Skills.get(cast.skillId);
      const cost = cast.free ? 0 : Skills.mpCost(def, caster);
      if (caster.mp < cost) { emit('cast_cancel', { uid: caster.uid, ent: caster, skillId: def.id, reason: 'mp' }); return; }
      const picked = cast.targets ? cast.targets.map(byUid).filter(alive) : null;   // [AIHealer 통합] 광역힐 대상 목록
      const target = cast.target ? byUid(cast.target) : (cast.x != null ? { x: cast.x, y: cast.y } : picked ? (picked.length ? picked : allies()) : null);
      if (!validTarget(def, caster, target)) { emit('cast_cancel', { uid: caster.uid, ent: caster, skillId: def.id, reason: 'no_target' }); return; }
      caster.mp -= cost;
      if (def.cooldown) caster.cooldowns[def.id] = B.time + def.cooldown;
      if (caster.kind === 'player' && has('Inventory') && Inventory.wear && G) Inventory.wear(G, 0.02);
      executeSkill(caster, def, target);
      emit('cast_done', { uid: caster.uid, ent: caster, skillId: def.id, target: cast.target });
    }
    function executeSkill(caster, def, target) {
      const lv = skillLevelOf(caster, def.id);
      switch (def.type) {
        case 'single_heal': return heal(caster, target, Skills.healAmount(def, caster, lv, target), { skillId: def.id });
        case 'aoe_heal': return aoeHeal(caster, def, lv, Array.isArray(target) ? target : null);
        case 'ground_heal': return placeGroundHeal(caster, def, lv, target);
        case 'ultimate': return allies().forEach((e) => heal(caster, e, Skills.healAmount(def, caster, lv, e), { skillId: def.id }));
        case 'resurrect': return revive(target, Skills.healAmount(def, caster, lv), caster);
        case 'cleanse': return cleanse(target, (def.power && def.power.count) || 1);
        case 'buff': return addBuff(target, { id: def.id, stat: def.buff.stat, value: Skills.buffValue(def, lv), until: B.time + (def.duration || 60) });
        case 'smite': return damage(caster, target, Skills.damageAmount(def, caster, lv), { type: 'magic', skillId: def.id, noEvade: true });
        case 'taunt': return memberTaunt(caster, def);
        case 'attack': return memberAttack(caster, def, target);
        default: return null;
      }
    }
    // 광역힐: [AIHealer 통합] 넘어온 대상 목록(HP 낮은 순 N 명)을 먼저 채우고,
    // 목록이 없거나 모자라면 다친 아군 중 무작위 N 명(다친 사람이 모자라면 나머지로 채움)
    function aoeHeal(caster, def, lv, picked) {
      const n = typeof def.targets === 'number' ? def.targets : allies().length;
      const chosen = (picked || []).filter(alive).slice(0, n);
      const others = allies().filter((e) => !chosen.includes(e));
      const hurt = shuffle(others.filter((e) => e.hp < e.maxHp)), rest = shuffle(others.filter((e) => e.hp >= e.maxHp));
      for (const e of chosen.concat(hurt, rest).slice(0, n)) heal(caster, e, Skills.healAmount(def, caster, lv, e), { skillId: def.id });
    }
    function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function placeGroundHeal(caster, def, lv, pos) {
      const gh = { id: 'gh' + (++B._tgSeq), type: 'puddle', x: pos.x, y: pos.y, r: def.radius || 2.5 * TILE, t: 0, windup: 0, fill: 1,
        owner: caster.uid, duration: def.duration || 6, hps: Skills.healAmount(def, caster, lv), tick: def.tick || GROUND_HEAL_TICK, acc: 0, skillId: def.id };
      B.groundHeals.push(gh);
      emit('ground_heal', { id: gh.id, x: gh.x, y: gh.y, r: gh.r, duration: gh.duration, owner: caster.uid });
      return gh;
    }
    function memberTaunt(caster, def) {
      const r = def.radius || 4 * TILE;
      for (const m of B.monsters) if (alive(m) && dist(m, caster) <= r + m.radius) taunt(caster, m, def.threatMult || 5);
      logMsg(`${caster.name} 도발`);
    }
    function memberAttack(caster, def, target) {
      const power = attackPower(caster, def.dmgType) * ((def.power && def.power.mult) || 1);
      if (def.dash && target) dashTo(caster, target);
      let victims = [target];
      if (def.targets === 'aoe') victims = B.monsters.filter((m) => alive(m) && dist(m, target) <= (def.radius || 2 * TILE) + m.radius);
      else if (typeof def.targets === 'number' && def.targets > 1) {
        // 추가 대상은 사거리 안의 가까운 놈만(멀리서 순찰 중인 몬스터를 깨우지 않게)
        const reach = def.range || caster.range || 40;
        const others = B.monsters.filter((m) => alive(m) && m !== target && inRange(caster, m, reach)).sort((a, b) => dist(a, caster) - dist(b, caster));
        victims = [target, ...others].slice(0, def.targets);
      }
      for (const v of victims) for (let h = 0; h < (def.hits || 1); h++) damage(caster, v, power, { type: def.dmgType || 'physical', skillId: def.id, crit: def.crit === true ? true : undefined });
    }
    function dashTo(ent, target) {
      const d = dist(ent, target); if (d < 1) return;
      const gap = ent.radius + target.radius + 4;
      const p = nearestStandable(target.x - ((target.x - ent.x) / d) * gap, target.y - ((target.y - ent.y) / d) * gap, ent.radius);
      ent.x = p.x; ent.y = p.y; faceTo(ent, target.x - ent.x, target.y - ent.y);
    }
    function advanceCast(ent, dt) {
      const c = ent.cast; if (!c) return;
      c.t += dt;
      if (c.t < c.total) return;
      if (c.abilityId) finishAbility(ent, c); else finishCast(ent, c);
    }

    // ---------------- 몬스터 능력·텔레그래프 ----------------
    function abilityTarget(ab, mon) {
      const rule = ab.targetRule || 'tank';
      if (rule === 'self') return mon;
      if (rule === 'healer') return alive(B.player) ? B.player : rng.pick(allies()) || null;
      if (rule === 'random') return allies().length ? rng.pick(allies()) : null;
      return topThreat(mon) || (mon.target ? byUid(mon.target) : null) || lowest(allies(), (e) => dist(e, mon));
    }
    function summonCount(owner) { return B.monsters.filter((m) => alive(m) && m.summonedBy === owner.uid).length; }
    // 능력 시전 시작. windup 동안 몬스터는 멈추고(cast), 범위기는 텔레그래프가 차오른다.
    function castAbility(mon, abilityId, target) {
      if (!alive(mon) || mon.cast || B.result) return { ok: false, reason: 'busy' };
      const ab = has('Monsters') ? Monsters.ability(abilityId) : null;
      if (!ab) return { ok: false, reason: 'no_ability' };
      if ((mon.cooldowns[abilityId] || 0) > B.time) return { ok: false, reason: 'cooldown' };
      if (ab.type === 'summon' && summonCount(mon) >= MAX_SUMMONS) return { ok: false, reason: 'summon_cap' };
      const tgt = target || abilityTarget(ab, mon);
      if (!tgt) return { ok: false, reason: 'no_target' };
      const tg = makeTelegraph(mon, ab, tgt);
      mon.cast = { abilityId, t: 0, total: ab.windup || 0, target: tgt.uid, telegraphId: tg ? tg.id : null };
      mon.state = 'cast';
      mon.cooldowns[abilityId] = B.time + (ab.cooldown || 10);
      emit('cast_start', { uid: mon.uid, ent: mon, abilityId, total: mon.cast.total, target: tgt.uid });
      logMsg(`${mon.name}: ${ab.name}`);
      return { ok: true, telegraph: tg };
    }
    function makeTelegraph(mon, ab, tgt) {
      const am = mon.tier === 'normal' ? NORMAL_ABILITY_MULT : 1;
      const common = { id: 'tg' + (++B._tgSeq), t: 0, windup: ab.windup || 0, fill: 0, owner: mon.uid, abilityId: ab.id, resolved: false };
      let tg = null;
      if (ab.type === 'aoe_circle') tg = Object.assign(common, { type: 'circle', x: tgt.x, y: tgt.y, r: ab.radius, dmg: mon.stats.atk * (ab.dmgMult || 1) * am });
      else if (ab.type === 'puddle') tg = Object.assign(common, { type: 'puddle', x: tgt.x, y: tgt.y, r: ab.radius, dps: mon.stats.atk * (ab.dpsMult || 0.5) * am, duration: ab.duration || 5, curse: ab.curse || null, acc: 0, cursed: {}, active: false });
      else if (ab.type === 'cone') tg = Object.assign(common, { type: 'cone', x: mon.x, y: mon.y, r: ab.radius, angle: ab.angle || 60, facing: Math.atan2(tgt.y - mon.y, tgt.x - mon.x), dmg: mon.stats.atk * (ab.dmgMult || 1) * am });
      else if (ab.type === 'charge') { const e = chargeEnd(mon, tgt, ab.range || 10 * TILE); tg = Object.assign(common, { type: 'line', x: mon.x, y: mon.y, x2: e.x, y2: e.y, r: ab.radius || TILE, dmg: mon.stats.atk * (ab.dmgMult || 1) * am }); }
      if (!tg) return null;
      B.telegraphs.push(tg);
      emit('telegraph', { id: tg.id, type: tg.type, x: tg.x, y: tg.y, r: tg.r, windup: tg.windup, owner: mon.uid, abilityId: ab.id });
      return tg;
    }
    function chargeEnd(mon, tgt, range) {
      const d = dist(mon, tgt), len = Math.min(d, range);
      if (d < 1) return { x: mon.x, y: mon.y };
      return { x: mon.x + ((tgt.x - mon.x) / d) * len, y: mon.y + ((tgt.y - mon.y) / d) * len };
    }
    function finishAbility(mon, cast) {
      mon.cast = null; if (mon.state === 'cast') mon.state = 'idle';
      const ab = Monsters.ability(cast.abilityId);
      const tgt = cast.target ? byUid(cast.target) : null;
      if (ab.type === 'summon') summon(mon, ab);
      else if (ab.type === 'curse_volley') curseVolley(mon, ab);
      else if (ab.type === 'enrage') enrage(mon, ab);
      else if (ab.type === 'heal_self') heal(mon, mon, Math.round(mon.maxHp * (ab.pct || 0.15)), { skillId: ab.id });
      else if (ab.type === 'roar') roar(mon, ab);
      // 범위기(circle/puddle/cone/line)는 텔레그래프가 다 차면 스스로 발동한다
      emit('cast_done', { uid: mon.uid, ent: mon, abilityId: ab.id, target: tgt ? tgt.uid : null });
    }
    function summon(mon, ab) {
      const n = Math.min(ab.summon.count, MAX_SUMMONS - summonCount(mon));
      const def = Monsters.get(ab.summon.id); if (!def || n <= 0 || !has('Entities')) return;
      const spawned = [];
      for (let i = 0; i < n; i++) {
        const a = rng.float(0, Math.PI * 2), r = rng.float(40, 80);
        const p = nearestStandable(mon.x + Math.cos(a) * r, mon.y + Math.sin(a) * r, 12);
        const e = Entities.fromMonster(def, B.floor, p.x, p.y, rng);
        e.summonedBy = mon.uid; e.groupId = mon.groupId; e.aggro = true; e.threat = Object.assign({}, mon.threat);
        addMonster(e); spawned.push(e);
      }
      emit('summon', { owner: mon.uid, ent: mon, abilityId: ab.id, monsterId: def.id, count: spawned.length, uids: spawned.map((e) => e.uid) });
    }
    function curseVolley(mon, ab) {
      const picks = shuffle(ab.curses || []).slice(0, ab.count || 1);
      for (const id of picks) { const t = abilityTarget(ab, mon); if (t && isParty(t)) applyCurse(t, id, ab.duration, { src: mon }); }
    }
    function enrage(mon, ab) {
      const until = B.time + (ab.duration || 15);
      if (ab.buff && ab.buff.atk) addBuff(mon, { id: ab.id + '_atk', stat: 'atk', value: ab.buff.atk, until });
      if (ab.buff && ab.buff.aspd) addBuff(mon, { id: ab.id + '_aspd', stat: 'aspd', value: ab.buff.aspd, until });
    }
    function roar(mon, ab) {
      for (const e of allies()) if (dist(e, mon) <= (ab.radius || 0) + e.radius && ab.curse) applyCurse(e, ab.curse, ab.duration, { src: mon });
      if (ab.threatReset) { mon.threat = {}; mon.target = null; logMsg(`${mon.name} 의 포효에 위협이 초기화됨`); }
    }
    function addMonster(ent) { B.monsters.push(ent); B.entities.push(ent); return ent; }

    // 텔레그래프 진행: windup 동안 fill 이 차고, 다 차면 종류별로 발동한다.
    function updateTelegraphs(dt) {
      for (const tg of B.telegraphs) {
        const owner = byUid(tg.owner);
        if (!tg.resolved) {
          tg.t += dt; tg.fill = tg.windup > 0 ? Math.min(1, tg.t / tg.windup) : 1;
          if (tg.fill >= 1) { tg.resolved = true; resolveTelegraph(tg, owner); }
        } else if (tg.type === 'puddle') tickPuddle(tg, owner, dt);
      }
      B.telegraphs = B.telegraphs.filter((tg) => !tg.done);
    }
    function resolveTelegraph(tg, owner) {
      const victims = allies().filter((e) => inTelegraph(tg, e));
      if (tg.type === 'puddle') { tg.active = true; tg.age = 0; return; }
      if (tg.type === 'line' && owner && alive(owner)) { const p = nearestStandable(tg.x2, tg.y2, owner.radius); owner.x = p.x; owner.y = p.y; }
      for (const e of victims) damage(owner, e, tg.dmg, { type: 'telegraph', abilityId: tg.abilityId, noEvade: true });
      emit('telegraph_hit', { id: tg.id, type: tg.type, abilityId: tg.abilityId, victims: victims.map((e) => e.uid) });
      tg.done = true;
    }
    function tickPuddle(tg, owner, dt) {
      tg.age += dt; tg.acc += dt;
      if (tg.age >= tg.duration) { tg.done = true; return; }
      if (tg.acc < PUDDLE_TICK) return;
      tg.acc -= PUDDLE_TICK;
      for (const e of allies().filter((x) => inTelegraph(tg, x))) {
        damage(owner, e, tg.dps * PUDDLE_TICK, { type: 'puddle', abilityId: tg.abilityId, noEvade: true, noDef: true });
        if (tg.curse && !tg.cursed[e.uid] && alive(e)) { tg.cursed[e.uid] = true; applyCurse(e, tg.curse, null, { src: owner }); }
      }
    }
    // 원·장판은 거리, 부채꼴은 각도, 선(돌진)은 선분까지의 거리로 판정. AI 회피도 이 함수를 쓴다.
    function inTelegraph(tg, e) {
      if (tg.type === 'cone') {
        const d = dist(tg, e); if (d > tg.r + e.radius) return false;
        let a = Math.atan2(e.y - tg.y, e.x - tg.x) - tg.facing;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        return Math.abs(a) <= (tg.angle * Math.PI / 180) / 2;
      }
      if (tg.type === 'line') return segDist(tg.x, tg.y, tg.x2, tg.y2, e.x, e.y) <= tg.r + e.radius;
      return dist(tg, e) <= tg.r + e.radius;
    }
    function segDist(ax, ay, bx, by, px, py) {
      const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
      const t = len2 ? clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1) : 0;
      return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
    }
    function updateGroundHeals(dt) {
      for (const gh of B.groundHeals) {
        gh.t += dt; gh.acc += dt;
        if (gh.t >= gh.duration) { gh.done = true; continue; }
        if (gh.acc < gh.tick) continue;
        gh.acc -= gh.tick;
        const owner = byUid(gh.owner);
        for (const e of allies()) if (dist(gh, e) <= gh.r + e.radius) heal(owner, e, gh.hps * gh.tick, { skillId: gh.skillId });
      }
      B.groundHeals = B.groundHeals.filter((g) => !g.done);
    }

    // ---------------- 기본 공격 ----------------
    function attackInterval(ent) {
      const aspd = (ent.stats && ent.stats.atkSpeed) || 1;
      return ent.kind === 'monster' ? 1 / Math.max(0.05, aspd) : (ent.atkInterval || 1) / Math.max(0.05, aspd);
    }
    function inRange(a, b, range) { return dist(a, b) <= range + a.radius + b.radius; }
    function basicAttack(ent, dt) {
      ent.atkTimer = Math.max(0, ent.atkTimer - dt);
      const tgt = ent.target ? byUid(ent.target) : null;
      if (!alive(tgt) || ent.cast || !inRange(ent, tgt, ent.range || 40)) { if (ent.state === 'attack') ent.state = 'idle'; return; }
      ent.state = 'attack'; faceTo(ent, tgt.x - ent.x, tgt.y - ent.y);
      if (ent.atkTimer > 0) return;
      if (ent.kind === 'monster' && !meleeSlot(ent, tgt)) return;
      ent.atkTimer = attackInterval(ent);
      const power = attackPower(ent);
      // 휘두르기/폭발(Classes splash): 대상 주변 몬스터도 함께 맞는다. 대상이 이 공격으로 죽어도 주변 피해는 들어간다.
      const splashed = ent.splash && isParty(ent) ? B.monsters.filter((m) => m !== tgt && alive(m) && dist(m, tgt) <= ent.splash.radius + m.radius) : null;
      const dealt = damage(ent, tgt, power, { type: 'basic' });
      if (splashed) for (const m of splashed) damage(ent, m, power * ent.splash.mult, { type: 'splash', noCrit: true });
      if (dealt > 0 && ent.kind === 'monster') rollCurses(ent, tgt);
    }
    // 근접 몬스터 자리: 최근 1초 안에 이 대상을 근접으로 친 다른 몬스터가 MELEE_SLOTS 이상이면 이번엔 못 친다
    function meleeSlot(mon, tgt) {
      if ((mon.range || 28) > MELEE_RANGE_MAX) return true;
      const slots = tgt._melee || (tgt._melee = {});
      let n = 0;
      for (const uid in slots) { if (B.time - slots[uid] > SLOT_WINDOW) delete slots[uid]; else if (uid !== mon.uid) n++; }
      if (n >= MELEE_SLOTS) return false;
      slots[mon.uid] = B.time;
      return true;
    }
    function rollCurses(mon, dst) {
      if (!has('Monsters') || !mon.def) return;
      for (const c of mon.def.curses || []) if (rng.chance(Monsters.curseChance(mon.def, c.id, B.floor))) applyCurse(dst, c.id, null, { src: mon });
    }

    // ---------------- 벨트 자동 소모품 ----------------
    function beltAuto() {
      if (!G || !alive(B.player) || !has('Inventory') || !Inventory.useConsumable || !has('Items')) return;
      const p = B.player, need = p.hp / p.maxHp < 0.4 ? 'hp' : p.mp / p.maxMp < 0.25 ? 'mp' : p.curses.length ? 'cleanse' : null;
      if (!need) return;
      for (const id of G.player.belt || []) {
        if (!id || (B.beltCooldowns[id] || 0) > B.time) continue;
        const d = Items.get(id); const fx = d && d.effect; if (!fx) continue;
        const fits = need === 'hp' ? (fx.hp || fx.hpPct) : need === 'mp' ? (fx.mp || fx.mpPct) : fx.cleanse;
        if (!fits) continue;
        if (Inventory.useConsumable(G, id, p, B.time)) { B.beltCooldowns[id] = B.time + BELT_COOLDOWN; if (fx.buff || fx.cleanse) refresh(p); logMsg(`${d.name} 자동 사용`); return; }
      }
    }

    // ---------------- 갱신 루프 ----------------
    function activeMonsters() {
      const c = B.player || B.members[0];
      return B.monsters.filter((m) => alive(m) && (!c || dist(m, c) <= ACTIVE_RANGE));
    }
    function inCombat() { return !B.result && activeMonsters().some((m) => m.aggro); }
    function regen(ent, dt) {
      if (ent.maxMp > 0 && ent.mp < ent.maxMp) ent.mp = Math.min(ent.maxMp, ent.mp + ((ent.stats && ent.stats.mpRegen) || 0) * dt);
    }
    function updateParty(ent, dt) {
      if (!alive(ent)) return;
      expireStatus(ent); tickDot(ent, dt); regen(ent, dt);
      if (!alive(ent)) return;
      if (B.aiEnabled) {
        if (ent.kind === 'member' && has('AIParty')) AIParty.update(ent, B, dt);
        if (ent.kind === 'player' && B.driveHealer && has('AIHealer') && AIHealer.update) AIHealer.update(ent, B, G, dt);
      }
      advanceCast(ent, dt);
      basicAttack(ent, dt);
    }
    function updateMonster(mon, dt) {
      expireStatus(mon); tickDot(mon, dt);
      if (!alive(mon)) return;
      if (B.aiEnabled && has('AIMonster')) AIMonster.update(mon, B, dt);
      advanceCast(mon, dt);
      basicAttack(mon, dt);
    }
    function syncPlayer() {
      if (!G || !B.player) return;
      G.player.hp = Math.round(B.player.hp); G.player.mp = Math.round(B.player.mp);
      G.player.buffs = B.player.buffs.filter((b) => !b.until || b.until > B.time);
    }
    function update(dt) {
      if (B.result || !(dt > 0)) return;
      B.time += dt;
      for (const e of party()) updateParty(e, dt);
      for (const m of activeMonsters()) updateMonster(m, dt);
      updateTelegraphs(dt); updateGroundHeals(dt);
      B._belt += dt; if (B._belt >= BELT_CHECK) { B._belt = 0; beltAuto(); }
      B._refresh += dt; if (B._refresh >= REFRESH_EVERY) { B._refresh = 0; if (alive(B.player)) refresh(B.player); }
      // 파티 수다: 상태를 훑어 'party_say' 를 낸다(AI 가 꺼져 있거나 battle.chatter === false 면 조용)
      if (B.aiEnabled && B.chatter !== false && has('Chatter')) Chatter.update(B, dt);
      syncPlayer();
    }

    Object.assign(B, {
      update, useSkill, cancelCast, moveTo, canStand, inCombat, activeMonsters, engagedMonsters: engaged,
      allies, party, byUid, damage, heal, applyCurse, cleanse, addBuff, revive, taunt, addThreat, topThreat,
      castAbility, addMonster, inTelegraph, summonCount, log: B.log, logMsg, collectGold,
    });
    return B;
  }

  return { create, ACTIVE_RANGE, TILE, CLEANSE_PRIORITY };
})();
if (typeof module !== 'undefined') module.exports = Combat;
