// 층 런타임 — DESIGN.md §9
// start: 층 맵(DungeonGen) 위에 파티 엔티티와 몬스터 300+ 마리(무리별 spots)·보스를 세우고 Combat 을 만든다.
// update: 전투 갱신(활성 반경은 Combat 이 처리) + 걸음 집계('steps') + 상자 근접 자동 열기 + 숨김 상자 드러내기
//         + 보스 처치 → 출구 활성 + 출구 도달 → cleared. 쓰러진 힐러는 전투가 끝나면 파티원이 일으켜 세운다.
//         + 길이 막혀 대상에 못 가는 몬스터는 포기하고 집으로(evade) — 몬스터·파티원 AI 에 길찾기가 없어 호수 너머로 영원히 제자리걸음을 하기 때문.
// leave: 피로(걸음·무리·보스·사망)·탑 기록·클리어 보너스 XP·마을 복귀 정리(Party.heal). wipe 면 내구도 -20%.
// 골드·아이템·경험치의 처치 보상은 Combat(autoLoot) 이 이미 적용하므로 여기서는 상자 보상만 다룬다.
const Floor = (() => {
  const TILE = 32;
  const CHEST_OPEN_R = 1.5 * TILE, HIDDEN_REVEAL_R = 2 * TILE, EXIT_R = 1.5 * TILE;
  const VISIT_R = 6;                                   // 미니맵에 밝혀지는 시야(타일)
  const STEPS_EVENT_EVERY = 100;
  const TELEPORT_STEP = 5 * TILE;                      // 한 틱에 이보다 멀리 움직였으면 걸음이 아니라 순간이동(돌진 피격 등)
  const FATIGUE = { perStep: 1 / 100, group: 2, boss: 5, death: 10 };
  const WIPE_DURABILITY = 0.2;
  const STRAGGLER_R = 10 * TILE, STRAGGLER_WAIT = 4;   // 자동 따라가기: 비전투 상태로 이만큼 떨어진 채 4초면 힐러 옆으로 붙는다
  const PLAYER_REVIVE_WAIT = 8, PLAYER_REVIVE_PCT = 0.3;
  const EVADE_AFTER = 8, EVADE_MOVE = 8;               // 교전 중 8초 동안 대상 사거리 밖에서 거리를 8px 도 못 좁힌 몬스터는 길이 막힌 것

  // 브라우저에서 최상위 const 모듈은 window 프로퍼티가 아니므로 typeof 로만 존재를 확인한다
  const Mods = {
    get Events() { return typeof Events !== 'undefined' ? Events : null; },
    get Monsters() { return typeof Monsters !== 'undefined' ? Monsters : null; },
    get Entities() { return typeof Entities !== 'undefined' ? Entities : null; },
    get Combat() { return typeof Combat !== 'undefined' ? Combat : null; },
    get DungeonGen() { return typeof DungeonGen !== 'undefined' ? DungeonGen : null; },
    get Loot() { return typeof Loot !== 'undefined' ? Loot : null; },
    get Inventory() { return typeof Inventory !== 'undefined' ? Inventory : null; },
    get Party() { return typeof Party !== 'undefined' ? Party : null; },
    get Level() { return typeof Level !== 'undefined' ? Level : null; },
    get Stats() { return typeof Stats !== 'undefined' ? Stats : null; },
    get Skills() { return typeof Skills !== 'undefined' ? Skills : null; },
    get RNG() { return typeof RNG !== 'undefined' ? RNG : null; },
  };
  const has = (name) => !!Mods[name];
  const emit = (name, payload) => { if (has('Events')) Events.emit(name, payload); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------------- 시작 ----------------
  function spawnMonsters(map, floor, rng) {
    const out = [];
    for (const g of map.groups) {
      const spots = g.spots && g.spots.length ? g.spots : [g];
      g.members.forEach((id, k) => {
        const def = Monsters.get(id); if (!def) return;
        const s = spots[k % spots.length];
        // 자리가 모자라면 같은 칸에 살짝 어긋나게 세운다(교전 중 separate 가 다시 벌려 준다)
        const j = k < spots.length ? 0 : rng.float(-6, 6);
        const e = Entities.fromMonster(def, floor, s.x + j, s.y - j, rng);
        e.groupId = g.id;
        out.push(e);
      });
    }
    const bossDef = Monsters.get(map.boss.id);
    const boss = bossDef ? Entities.fromMonster(bossDef, floor, map.boss.x, map.boss.y, rng) : null;
    if (boss) { boss.groupId = `f${floor}_boss`; out.push(boss); }
    return { monsters: out, boss };
  }
  // 막힌 자리면 가까운 설 수 있는 곳으로(ring 탐색)
  function standableNear(battle, x, y, r) {
    if (battle.canStand(x, y, r)) return { x, y };
    for (let ring = 1; ring <= 6; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k, px = x + Math.cos(a) * ring * TILE * 0.5, py = y + Math.sin(a) * ring * TILE * 0.5;
        if (battle.canStand(px, py, r)) return { x: px, y: py };
      }
    }
    return { x, y };
  }
  function placeParty(battle, player, members, spawn) {
    player.x = spawn.x; player.y = spawn.y;
    members.forEach((m, i) => {
      const p = standableNear(battle, spawn.x + (i % 2 ? 36 : -36), spawn.y + (i < 2 ? 36 : 72), m.radius);
      m.x = p.x; m.y = p.y;
    });
  }

  // opts.rng: 전투·상자용 난수(시뮬레이션 재현용). 생략 시 RNG.global().
  function start(G, floor, opts = {}) {
    const map = DungeonGen.generate(floor);
    const rng = opts.rng || (has('RNG') ? RNG.global() : null);
    const player = Entities.fromPlayer(G);
    const members = (has('Party') ? Party.members(G) : G.party || []).map((m) => Entities.fromMember(G, m));
    const { monsters, boss } = spawnMonsters(map, floor, rng);
    const battle = Combat.create({ map, player, members, monsters, rng, G, floor });
    placeParty(battle, player, members, map.spawn);
    const fs = {
      floor, map, battle, boss, steps: 0, startedAt: Date.now(), time: 0,
      chests: map.chests.map((c) => Object.assign({}, c, { opened: false, revealed: !c.hidden })),
      bossDefeated: false, cleared: false, result: null, ended: false,
      visited: new Uint8Array(map.cols * map.rows),
      kills: 0, chestsOpened: 0, playerDeaths: 0, memberDeaths: 0, fatigue: 0, groupsFought: new Set(),
      _kills0: (G.counters && G.counters.kills) || 0, _px: player.x, _py: player.y, _stepAcc: 0, _stepsEmitted: 0, _lastTile: -1,
      _wasAlive: {}, _straggle: {}, _deadFor: 0, _stuck: {},
    };
    for (const e of battle.party()) fs._wasAlive[e.uid] = true;
    markVisited(fs, player);
    emit('floor_started', { floor, name: map.name, monsters: monsters.length, chests: fs.chests.length });
    battle.logMsg(`${map.name} 에 들어섰다`);
    return fs;
  }

  // ---------------- 갱신 ----------------
  function update(fs, G, dt) {
    if (fs.ended || fs.result || !(dt > 0)) return;
    const B = fs.battle, p = B.player;
    B.update(dt);
    fs.time += dt;
    fs.kills = ((G.counters && G.counters.kills) || 0) - fs._kills0;
    trackDeaths(fs);
    if (B.result === 'wipe') { fs.result = 'wipe'; return; }
    if (!alive(p)) { carryHealer(fs, dt); return; }
    countSteps(fs, G, p);
    if (markVisited(fs, p)) checkChests(fs, G, p);
    const engaged = B.engagedMonsters();
    trackGroups(fs, engaged);
    evadeStuck(fs, engaged, dt);
    checkBoss(fs);
    checkExit(fs, p);
    followStragglers(fs, G, p, engaged, dt);
  }
  // 살아 있다가 죽은 전환만 센다(부활 후 다시 죽으면 또 센다)
  function trackDeaths(fs) {
    for (const e of fs.battle.party()) {
      const was = fs._wasAlive[e.uid];
      if (was && !e.alive) { if (e.kind === 'player') fs.playerDeaths++; else fs.memberDeaths++; }
      fs._wasAlive[e.uid] = e.alive;
    }
  }
  // 쓰러진 힐러: 교전이 끝나고 8초가 지나면 살아남은 파티원이 일으켜 세운다(HP 30%). 전원 사망이면 Combat 이 wipe 를 낸다.
  function carryHealer(fs, dt) {
    const B = fs.battle;
    if (B.engagedMonsters().length || !B.allies().length) { fs._deadFor = 0; return; }
    fs._deadFor += dt;
    if (fs._deadFor < PLAYER_REVIVE_WAIT) return;
    fs._deadFor = 0;
    B.revive(B.player, PLAYER_REVIVE_PCT, null);
    B.logMsg('파티원이 힐러를 일으켜 세웠다');
  }
  // 걸음 = 1타일 이동. 100걸음마다 'steps' { n: 100 }(퀘스트는 n 을 누적한다).
  function countSteps(fs, G, p) {
    const moved = Math.hypot(p.x - fs._px, p.y - fs._py);
    fs._px = p.x; fs._py = p.y;
    if (!(moved > 0) || moved > TELEPORT_STEP) return;
    fs._stepAcc += moved / TILE;
    const n = Math.floor(fs._stepAcc); if (!n) return;
    fs._stepAcc -= n; fs.steps += n;
    if (G.counters) G.counters.steps = (G.counters.steps || 0) + n;
    while (fs.steps - fs._stepsEmitted >= STEPS_EVENT_EVERY) {
      fs._stepsEmitted += STEPS_EVENT_EVERY;
      emit('steps', { n: STEPS_EVENT_EVERY, total: fs.steps, floor: fs.floor });
    }
  }
  // 플레이어 타일이 바뀔 때만 시야 반경을 밝힌다. 바뀌었으면 true(상자 검사도 그때만).
  function markVisited(fs, p) {
    const { cols, rows } = fs.map;
    const i = Math.floor(p.x / TILE), j = Math.floor(p.y / TILE), tile = j * cols + i;
    if (tile === fs._lastTile) return false;
    fs._lastTile = tile;
    for (let dj = -VISIT_R; dj <= VISIT_R; dj++) for (let di = -VISIT_R; di <= VISIT_R; di++) {
      if (di * di + dj * dj > VISIT_R * VISIT_R) continue;
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < cols && nj < rows) fs.visited[nj * cols + ni] = 1;
    }
    return true;
  }
  function checkChests(fs, G, p) {
    for (const c of fs.chests) {
      if (c.opened) continue;
      const d = dist(p, c);
      if (!c.revealed && d <= HIDDEN_REVEAL_R) { c.revealed = true; emit('chest_revealed', { chestId: c.id, floor: fs.floor, x: c.x, y: c.y }); fs.battle.logMsg('덤불 뒤에 숨겨진 상자가 보인다!'); }
      if (c.revealed && d <= CHEST_OPEN_R) openChest(fs, G, c.id);
    }
  }
  // 처음 교전한 무리마다 피로 +2(보스 무리는 처치 때 +5 로 따로)
  function trackGroups(fs, engaged) {
    for (const m of engaged) {
      if (!m.groupId || fs.groupsFought.has(m.groupId)) continue;
      fs.groupsFought.add(m.groupId);
      if (fs.boss && m.groupId === fs.boss.groupId) continue;
      fs.fatigue += FATIGUE.group;
    }
  }
  // 길찾기가 없는 몬스터는 벽·호수 너머의 대상을 향해 제자리걸음(또는 벽을 따라 미끄러지기)을 한다. 그대로 두면 "전투 중" 상태가
  // 영원히 풀리지 않으므로(버프·휴식·탐험 봇·쓰러진 힐러 구조가 모두 멈춘다) 사거리 밖에서 8초 동안 대상과의 거리를 한 칸(8px)도
  // 못 좁힌 몬스터는 포기하고 집으로 돌려보낸다(MMO 의 evade). 움직였는지가 아니라 "가까워졌는지"를 보는 이유: 벽을 따라 미끄러지며
  // 왔다갔다 하는 몬스터도 잡아야 하기 때문. 복귀 중 회복·저주 제거는 AIMonster.leash 와 같은 규칙. 시전 중인 몬스터는 제자리가 정상.
  function evadeStuck(fs, engaged, dt) {
    const B = fs.battle, S = fs._stuck;
    for (const m of engaged) {
      const tgt = m.target ? B.byUid(m.target) : null;
      if (m.returning || m.cast || !alive(tgt)) { delete S[m.uid]; continue; }
      const d = dist(m, tgt);
      const rec = S[m.uid] && S[m.uid].target === tgt.uid ? S[m.uid] : (S[m.uid] = { target: tgt.uid, best: d, t: 0 });
      const reach = d <= (m.range || 28) + m.radius + tgt.radius;
      if (reach || d < rec.best - EVADE_MOVE) { rec.best = Math.min(rec.best, d); rec.t = 0; continue; }
      rec.t += dt;
      if (rec.t < EVADE_AFTER) continue;
      delete S[m.uid];
      giveUp(fs, m);
    }
  }
  function giveUp(fs, m) {
    m.aggro = false; m.threat = {}; m.target = null; m.returning = true;
    m.hp = m.maxHp; m.curses = []; m.state = 'move';
    fs.battle.logMsg(`${m.name} 이(가) 길을 잃고 돌아간다`);
    emit('monster_evade', { uid: m.uid, id: m.def && m.def.id, floor: fs.floor, x: m.x, y: m.y });
  }
  function checkBoss(fs) {
    if (fs.bossDefeated || !fs.boss || fs.boss.alive) return;
    fs.bossDefeated = true; fs.fatigue += FATIGUE.boss;
    fs.battle.logMsg('출구가 열렸다');
    emit('exit_opened', { floor: fs.floor, x: fs.map.exit.x, y: fs.map.exit.y });
  }
  function checkExit(fs, p) {
    if (!fs.bossDefeated || fs.cleared || dist(p, fs.map.exit) > EXIT_R) return;
    markCleared(fs);
  }
  function markCleared(fs) {
    fs.cleared = true; fs.result = 'cleared';
    emit('floor_cleared', { floor: fs.floor, time: fs.time, steps: fs.steps, kills: fs.kills });
  }
  // 자동 따라가기: 길을 잃고(아무도 자기를 노리지 않는데) 멀리 떨어진 파티원은 힐러 옆으로 붙는다
  function followStragglers(fs, G, p, engaged, dt) {
    const settings = (G.player && G.player.settings) || {};
    if (settings.autoFollow === false) return;
    for (const m of fs.battle.members) {
      if (!alive(m)) continue;
      const far = dist(m, p) > STRAGGLER_R && !engaged.some((x) => x.target === m.uid);
      fs._straggle[m.uid] = far ? (fs._straggle[m.uid] || 0) + dt : 0;
      if (fs._straggle[m.uid] < STRAGGLER_WAIT) continue;
      fs._straggle[m.uid] = 0;
      const spot = standableNear(fs.battle, p.x - 24, p.y + 24, m.radius);
      m.x = spot.x; m.y = spot.y; m.target = null;
    }
  }

  // ---------------- 상자 ----------------
  function openChest(fs, G, chestId) {
    const chest = fs.chests.find((c) => c.id === chestId);
    if (!chest || chest.opened) return null;
    chest.opened = true; chest.revealed = true;
    const loot = has('Loot') ? Loot.chest(fs.floor, chest.type, fs.battle.rng, { G, chestId }) : { gold: 0, items: [] };
    const added = [], toBank = [], lost = [];
    G.player.gold = (G.player.gold || 0) + (loot.gold || 0);
    emit('gold_changed', { gold: G.player.gold, delta: loot.gold || 0, source: 'chest' });
    for (const it of loot.items) {
      if (has('Inventory') && Inventory.add(G, it)) { added.push(it); continue; }
      // 가방이 차면 은행장이 대신 받는다(퀘스트 보상과 같은 규칙). 은행도 차면 잃는다.
      if (G.bank && G.bank.items.length < (G.bank.size || 60)) { G.bank.items.push(it); toBank.push(it); } else lost.push(it);
    }
    if (G.counters) G.counters.chests = (G.counters.chests || 0) + 1;
    fs.chestsOpened++;
    if (chest.hidden) { const found = (G.quests = G.quests || {}).hiddenFound = G.quests.hiddenFound || []; if (!found.includes(chestId)) found.push(chestId); }
    const payload = { chestId, floor: fs.floor, hidden: !!chest.hidden, type: chest.type, landmarkId: chest.landmarkId, x: chest.x, y: chest.y,
      gold: loot.gold || 0, items: loot.items, added, toBank, lost, questScroll: loot.questScroll || null };
    emit('chest_opened', payload);
    fs.battle.logMsg(`${chest.hidden ? '숨겨진 ' : ''}상자를 열었다: 골드 ${payload.gold}, 아이템 ${loot.items.length}개`);
    return payload;
  }

  // ---------------- 떠나기 ----------------
  function fatigueGainMult(G) {
    if (!has('Stats')) return 1;
    try { return Stats.derive(G.player, G).fatigueGainMult || 1; } catch (e) { return 1; }
  }
  function applyFatigue(fs, G) {
    const raw = fs.fatigue + fs.steps * FATIGUE.perStep + fs.playerDeaths * FATIGUE.death;
    const gained = Math.round(raw * fatigueGainMult(G) * 10) / 10;
    const before = G.player.fatigue || 0;
    G.player.fatigue = clamp(Math.round((before + gained) * 10) / 10, 0, 100);
    emit('fatigue_changed', { fatigue: G.player.fatigue, delta: G.player.fatigue - before });
    return gained;
  }
  function recordRun(fs, G, cleared) {
    const t = G.tower = G.tower || { highestCleared: 0, records: {} };
    t.records = t.records || {};
    const rec = t.records[fs.floor] = t.records[fs.floor] || { clears: 0, bestTime: null, attempts: 0, wipes: 0 };
    rec.attempts++;
    if (fs.result === 'wipe') rec.wipes++;
    if (!cleared) return rec;
    rec.clears++;
    const time = Math.round(fs.time * 10) / 10;
    rec.bestTime = rec.bestTime == null ? time : Math.min(rec.bestTime, time);
    t.highestCleared = Math.max(t.highestCleared || 0, fs.floor);
    return rec;
  }
  // 클리어 보너스: 보스 경험치만큼 한 번 더(죽어 있어서 처치 경험치를 못 받은 파티원도 받는다)
  function clearBonusXp(fs, G) {
    const def = fs.boss && fs.boss.def;
    if (!def || !has('Monsters') || !has('Level')) return 0;
    const xp = Monsters.statsAt(def, fs.floor).xp || 0;
    if (!(xp > 0)) return 0;
    Level.addXp(G.player, xp, G);
    if (has('Party')) Party.gainXp(G, xp);
    return xp;
  }
  // 전멸: 장착 장비(가방·벨트 제외)와 파티원 장비 내구도 -20%
  function wipePenalty(G) {
    const hit = (inst) => { if (inst && typeof inst.durability === 'number') inst.durability = Math.max(0, inst.durability - Math.round((inst.maxDurability || 100) * WIPE_DURABILITY)); };
    for (const [slot, inst] of Object.entries(G.player.equipment || {})) if (slot !== 'bag' && slot !== 'belt') hit(inst);
    for (const m of G.party || []) for (const inst of Object.values(m.equipment || {})) hit(inst);
  }
  // 마을 복귀: 전투용 축복(스킬 버프)은 지우고 음식 버프만 남긴 뒤 전원 회복
  function returnToTown(G) {
    const isSkillBuff = (b) => has('Skills') && !!Skills.get(b.id);
    if (Array.isArray(G.player.buffs)) G.player.buffs = G.player.buffs.filter((b) => !isSkillBuff(b));
    for (const m of G.party || []) if (Array.isArray(m.buffs)) m.buffs = m.buffs.filter((b) => !isSkillBuff(b));
    if (has('Party')) Party.heal(G);
  }
  function bossPhase(fs) {
    const def = fs.boss && fs.boss.def, phases = (def && def.phases) || [];
    if (!phases.length) return { reached: fs.bossDefeated ? 1 : 0, max: 1 };
    if (fs.bossDefeated) return { reached: phases.length, max: phases.length };
    return { reached: fs.boss.phase ? phases.indexOf(fs.boss.phase) + 1 : 0, max: phases.length };
  }

  function leave(fs, G, reason) {
    if (fs.summary) return fs.summary;
    reason = reason || fs.result || 'escape';
    if (reason === 'cleared' && !fs.cleared) markCleared(fs);   // 출구 전에 직접 불린 경우(디버그·테스트)
    fs.ended = true; fs.result = reason;
    const cleared = reason === 'cleared';
    if (reason === 'wipe') wipePenalty(G);
    const fatigueGained = applyFatigue(fs, G);
    const record = recordRun(fs, G, cleared);
    const xpBonus = cleared ? clearBonusXp(fs, G) : 0;
    G.playTime = (G.playTime || 0) + fs.time;
    returnToTown(G);
    const summary = {
      floor: fs.floor, reason, cleared, time: Math.round(fs.time * 10) / 10, steps: fs.steps, kills: fs.kills, chests: fs.chestsOpened,
      playerDeaths: fs.playerDeaths, memberDeaths: fs.memberDeaths, groupsFought: fs.groupsFought.size, bossDefeated: fs.bossDefeated, bossPhase: bossPhase(fs),
      fatigueGained, xpBonus, record: Object.assign({}, record),
    };
    fs.summary = summary;
    emit('floor_left', summary);
    return summary;
  }

  return { start, update, openChest, leave, CHEST_OPEN_R, HIDDEN_REVEAL_R, EXIT_R, FATIGUE, WIPE_DURABILITY, STRAGGLER_R, PLAYER_REVIVE_WAIT, EVADE_AFTER, TILE };
})();
if (typeof module !== 'undefined') module.exports = Floor;
