// 층 시뮬레이션 — 적정 레벨 파티(탱1 근딜1 원딜2 + 힐러=플레이어)가 탐험 봇으로 층을 끝까지 돈다.
// 사용: node healer/tools/sim.js <floor|all> [maxSeconds] [partyLevel] [--json] [--seed=1] [--runs=1] [--gear=basic|normal|good] [--skill=N] [--nododge] [--quiet] [--trace]
//   봇: 가장 가까운(BFS 걸음 수) 미방문 무리/상자/중간보스 → 모두 돌면 보스 → 출구. 전투 중엔 제자리(힐러 AI 가 시전), 비전투엔 HP/MP 가 찰 때까지 쉰다.
//   dt=0.1 고정 스텝. 결과: cleared/wipe/timeout, 걸린 시간, 걸음·킬·상자, 사망 횟수, 평균 MP, 스킬 사용 통계, 보스 페이즈.
// 모듈로도 쓴다: require('./sim').run({ floor, maxSeconds, level, seed, gear, skill }) -> stats (tests/sim_smoke.test.js)
const load = require('./load');
const TILE = 32, DT = 0.1;
const GEAR_GRADE = { basic: 'common', normal: 'uncommon', good: 'rare' };
const SET_FOR_FLOOR = (f) => (f >= 6 ? 'cave_crystal' : f >= 3 ? 'forest_leaf' : 'novice_cloth');
const ARRIVE = { group: 3 * TILE, miniboss: 3 * TILE, boss: 3 * TILE, chest: 0.5 * TILE, exit: 0.5 * TILE };
const REST = { hp: 0.7, mpLow: 0.35, mpOk: 0.8, max: 45 };
const STUCK_SECONDS = 2.5, STRAGGLER_WAIT_R = 7 * TILE, STRAGGLER_MAX_WAIT = 6;
const LOOKOUT_R = 9 * TILE, LEAD_MAX_WAIT = 4;   // 몬스터가 보이면 탱커가 앞설 때까지(최대 4초) 기다린다

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = (e) => !!e && e.alive;
const pct = (v) => Math.round(v * 100);

// ---------------- 파티 구성 ----------------
function allocatePoints(ctx, G) {
  // 사제는 레벨당 5포인트: 지능 3·체력 2 (힐량과 생존의 표준 분배)
  while ((G.player.statPoints || 0) >= 5) { ctx.Level.allocate(G, 'int', 3); ctx.Level.allocate(G, 'vit', 2); }
  if (G.player.statPoints > 0) ctx.Level.allocate(G, 'int', G.player.statPoints);
}
function setupPlayer(ctx, G, level, floor, o) {
  const { Classes, Level, Items, Inventory, Loot } = ctx;
  const p = G.player;
  p.level = level; p.stats = Classes.statsAt('priest', level); p.statPoints = 5 * (level - 1);
  allocatePoints(ctx, G);
  for (const id of Level.unlockedSkills(level)) p.skillLevels[id] = o.skill;
  p.settings.autoDodge = o.dodge; p.settings.autoHeal = true;
  // 층 장비: 등급은 프리셋, good 은 층 세트 5부위를 맞춘다
  const grade = GEAR_GRADE[o.gear], setId = o.gear === 'good' ? SET_FOR_FLOOR(floor) : null;
  const picks = [['body'], ['boots'], ['gloves'], ['hat'], ['belt'], ['main', { hands: 'two' }], ['neck'], ['ring'], ['ring'], ['ear']];
  for (const [slot, extra] of picks) {
    const armor = ['body', 'boots', 'gloves', 'hat', 'belt'].includes(slot);
    const opts = Object.assign({ slot, floor, grade, rng: o.rng, cls: 'priest' }, armor ? (setId ? { setId } : { armor: 'cloth' }) : {}, extra || {});
    const it = Items.generate(opts); if (!it || !Inventory.add(G, it)) continue;
    Inventory.equip(G, it.uid);
  }
  // 벨트: HP/MP 포션(층 크기) + 해독제, 가방에 넉넉히
  const belt = [Loot.potionId('hp', floor), Loot.potionId('mp', floor), 'antidote'];
  const slots = Inventory.beltSlots(G);
  for (let i = 0; i < Math.min(slots, belt.length); i++) { Inventory.add(G, Items.make(belt[i], 10)); Inventory.setBelt(G, i, belt[i]); }
  p.hp = 0; p.mp = 0; ctx.Party.heal(G);   // 파생 최대값으로 채운다
}
function setupMembers(ctx, G, level, floor, o) {
  const { Party, Items, Classes } = ctx;
  const comp = [['warrior', 'tank'], ['rogue', 'melee'], ['hunter', 'ranged'], ['mage', 'ranged']];
  for (const [cls, role] of comp) {
    const m = Party.generateMember(o.rng, level, { cls, role });
    if (o.gear !== 'normal') { // 프리셋 등급으로 장비를 다시 만든다(normal 은 생성기 기본 분포 70/25/5 그대로)
      const tier = floor >= 6 ? 2 : 1, armor = Classes.get(cls).armor;
      m.equipment.body = Items.generate({ id: `${armor}_body_${tier}`, grade: GEAR_GRADE[o.gear], floor, rng: o.rng });
      m.equipment.main = Items.generate({ id: Party.WEAPONS[cls][tier - 1], grade: GEAR_GRADE[o.gear], floor, rng: o.rng });
    }
    Party.add(G, m);
  }
  Party.heal(G);
}

// ---------------- 탐험 봇 ----------------
function makeBot(ctx, fs, G) {
  const { map, battle } = fs, p = battle.player, cols = map.cols, rows = map.rows;
  const S = { target: null, path: [], wp: 0, stuck: 0, rest: 0, resting: false, wait: 0, visited: new Set(), unreachable: new Set(), replans: 0,
    budget: { dead: 0, cast: 0, combat: 0, rest: 0, stragglers: 0, lead: 0, move: 0 } };   // 시간이 어디에 쓰였는지(진단용)
  const tileOf = (e) => ({ i: Math.floor(e.x / TILE), j: Math.floor(e.y / TILE) });

  function bfs(from) {
    const dist = new Int32Array(cols * rows).fill(-1), prev = new Int32Array(cols * rows).fill(-1), q = new Int32Array(cols * rows);
    let h = 0, t = 0; const s = from.j * cols + from.i; dist[s] = 0; q[t++] = s;
    while (h < t) {
      const c = q[h++], i = c % cols, j = (c / cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + dx, nj = j + dy; if (map.solid(ni, nj)) continue;
        const nc = nj * cols + ni; if (dist[nc] >= 0) continue;
        dist[nc] = dist[c] + 1; prev[nc] = c; q[t++] = nc;
      }
    }
    return { dist, prev };
  }
  const groupDead = (g) => !battle.monsters.some((m) => m.groupId === g.id && alive(m));
  function candidates() {
    const list = [];
    for (const g of map.groups) {
      if (S.visited.has(g.id) || S.unreachable.has(g.id)) continue;
      if (groupDead(g)) { S.visited.add(g.id); continue; }
      list.push({ kind: g.minibossId ? 'miniboss' : 'group', id: g.id, i: g.i, j: g.j, x: g.x, y: g.y });
    }
    for (const c of fs.chests) if (!c.opened && !S.unreachable.has(c.id)) list.push({ kind: 'chest', id: c.id, i: c.i, j: c.j, x: c.x, y: c.y });
    if (list.length) return list;
    return fs.bossDefeated ? [Object.assign({ kind: 'exit', id: 'exit' }, map.exit)] : [Object.assign({ kind: 'boss', id: 'boss' }, map.boss)];
  }
  // BFS 걸음 수로 가장 가까운 목표를 고르고 경로(타일 중심 목록)를 만든다
  function choose() {
    const from = tileOf(p), { dist, prev } = bfs(from);
    let best = null;
    for (const c of candidates()) {
      const d = dist[c.j * cols + c.i];
      if (d < 0) { S.unreachable.add(c.id); continue; }
      if (!best || d < best.d) best = { d, c };
    }
    if (!best) return false;
    const path = [];
    for (let cell = best.c.j * cols + best.c.i; cell >= 0 && cell !== from.j * cols + from.i; cell = prev[cell]) path.push({ x: (cell % cols + 0.5) * TILE, y: (((cell / cols) | 0) + 0.5) * TILE });
    S.target = best.c; S.path = path.reverse(); S.wp = 0; S.stuck = 0;
    return true;
  }
  function arrive() {
    const t = S.target; S.target = null;
    if (t.kind === 'group' || t.kind === 'miniboss') S.visited.add(t.id);
    else if (t.kind === 'chest') { const c = fs.chests.find((x) => x.id === t.id); if (c && !c.opened) S.unreachable.add(t.id); }
  }
  // 힐러는 제자리에서 시전해야 하므로 전투·시전 중엔 움직이지 않는다. 비전투엔 파티가 회복될 때까지 쉰다(최대 45초).
  function needRest(inCombat) {
    const lowHp = battle.allies().some((e) => e.hp / e.maxHp < REST.hp);
    const mp = p.maxMp > 0 ? p.mp / p.maxMp : 1;
    if (S.resting) { S.resting = lowHp || mp < REST.mpOk; } else S.resting = lowHp || mp < REST.mpLow;
    if (!S.resting || inCombat) { S.rest = 0; return false; }
    S.rest += DT;
    if (S.rest > REST.max) { S.resting = false; S.rest = 0; return false; }
    return true;
  }
  function waitStragglers() {
    const far = battle.members.some((m) => alive(m) && dist(m, p) > STRAGGLER_WAIT_R);
    S.wait = far ? S.wait + DT : 0;
    return far && S.wait < STRAGGLER_MAX_WAIT;
  }
  // 몬스터가 눈에 들어오면 힐러가 먼저 들어가지 않는다: 탱커가 그 몬스터에 더 가까워질 때까지 멈춘다(사람이라면 그렇게 한다)
  function waitForTank() {
    const tank = battle.members.find((m) => alive(m) && m.role === 'tank');
    if (!tank) return false;
    let near = null, nd = LOOKOUT_R;
    for (const m of battle.activeMonsters()) { if (m.returning) continue; const d = dist(m, p); if (d < nd) { nd = d; near = m; } }
    if (!near || dist(tank, near) < nd) { S.lead = 0; return false; }
    S.lead = (S.lead || 0) + DT;
    return S.lead < LEAD_MAX_WAIT;
  }
  function follow(dt) {
    if (dist(p, S.target) <= ARRIVE[S.target.kind]) return arrive();
    const wp = S.path[S.wp];
    if (!wp) return arrive();
    if (dist(p, wp) <= 6) { S.wp++; return; }
    const bx = p.x, by = p.y;
    battle.moveTo(p, wp.x, wp.y, dt);
    if (dist(p, { x: bx, y: by }) >= 0.5 || (p.stats && p.stats.rooted)) { S.stuck = 0; return; }
    S.stuck += dt;
    if (S.stuck < STUCK_SECONDS) return;
    // 막혔으면 경로를 다시 짜고, 두 번째도 막히면 그 목표는 포기한다
    S.stuck = 0; S.replans++;
    if (S.replans % 2 === 0) S.unreachable.add(S.target.id);
    S.target = null;
  }
  const spend = (k, dt) => { S.budget[k] += dt; };
  function step(dt) {
    if (fs.result) return;
    if (!alive(p)) return spend('dead', dt);
    if (p.cast) return spend('cast', dt);
    const inCombat = battle.inCombat();
    if (inCombat) return spend('combat', dt);
    if (needRest(inCombat)) return spend('rest', dt);
    if (waitStragglers()) return spend('stragglers', dt);
    if (waitForTank()) return spend('lead', dt);
    if (!S.target && !choose()) return;
    spend('move', dt);
    follow(dt);
  }
  return { step, state: S };
}

// ---------------- 한 판 ----------------
function run(o = {}) {
  const floor = o.floor || 1, seed = o.seed || 1;
  const ctx = load('all');
  const { State, RNG, Floor, Floors, Events, Monsters } = ctx;
  RNG.seedGlobal(seed);
  const level = o.level || Floors.levelFor(floor);
  const opts = { rng: RNG.make(seed * 7919 + 17), gear: o.gear || (floor >= 6 ? 'good' : 'normal'), skill: o.skill || (floor >= 6 ? 3 : 1), dodge: o.dodge !== false };
  const G = State.newGame('시뮬');
  setupPlayer(ctx, G, level, floor, opts);
  setupMembers(ctx, G, level, floor, opts);
  const fs = Floor.start(G, floor, { rng: RNG.make(seed) });
  const bot = makeBot(ctx, fs, G);
  const st = { skills: {}, cancels: 0, bossPhase: 0, bossEngaged: false, playerHits: 0, mpSamples: 0, mpSum: 0, levelUps: 0, cursesOnPlayer: 0 };
  const bossUid = fs.boss ? fs.boss.uid : null;
  Events.on('cast_done', (e) => { if (e.uid === 'player' && e.skillId) st.skills[e.skillId] = (st.skills[e.skillId] || 0) + 1; });
  Events.on('cast_cancel', (e) => { if (e.uid === 'player' && e.skillId) st.cancels++; });
  Events.on('boss_phase', (e) => { if (e.uid === bossUid && e.ent && e.ent.def) st.bossPhase = Math.max(st.bossPhase, e.ent.def.phases.indexOf(e.ent.phase) + 1); });
  Events.on('damage', (e) => { if (e.dstUid === 'player' && !e.evaded) st.playerHits++; });
  Events.on('curse', (e) => { if (e.uid === 'player') st.cursesOnPlayer++; });
  Events.on('level_up', (e) => { st.levelUps += e.levelsGained || 1; });
  if (o.trace) attachTrace(ctx, fs, G);
  const maxSeconds = o.maxSeconds || 3600;
  const t0 = Date.now();
  let nextSample = 0;
  for (let t = 0; t < maxSeconds && !fs.result; t += DT) {
    Floor.update(fs, G, DT);
    bot.step(DT);
    if (o.onTick) o.onTick(fs, G, bot, ctx);   // 진단·테스트용 훅(매 스텝)
    if (fs.boss && fs.boss.aggro) st.bossEngaged = true;
    if (fs.time >= nextSample) { nextSample += 1; st.mpSamples++; st.mpSum += fs.battle.player.maxMp ? fs.battle.player.mp / fs.battle.player.maxMp : 0; }
  }
  const result = fs.result || 'timeout';
  const bossHp = fs.boss ? fs.boss.hp / fs.boss.maxHp : 0;
  const summary = Floor.leave(fs, G, fs.result || 'escape');
  const phases = fs.boss && fs.boss.def.phases ? fs.boss.def.phases.length : 1;
  return {
    floor, name: fs.map.name, level, gear: opts.gear, skill: opts.skill, seed, result, time: summary.time, realMs: Date.now() - t0,
    steps: summary.steps, kills: summary.kills, monsters: fs.battle.monsters.length, chests: summary.chests, chestsTotal: fs.chests.length,
    groupsVisited: bot.state.visited.size, groupsTotal: fs.map.groups.length, unreachable: Array.from(bot.state.unreachable),
    playerDeaths: summary.playerDeaths, memberDeaths: summary.memberDeaths, avgMp: st.mpSamples ? st.mpSum / st.mpSamples : 0,
    skills: st.skills, cancels: st.cancels, playerHits: st.playerHits, cursesOnPlayer: st.cursesOnPlayer,
    boss: { engaged: st.bossEngaged, defeated: summary.bossDefeated, phase: summary.bossDefeated ? phases : Math.max(st.bossPhase, st.bossEngaged ? 1 : 0), phases, hpLeft: summary.bossDefeated ? 0 : bossHp },
    fatigueGained: summary.fatigueGained, levelUps: st.levelUps, partyLevels: [G.player.level].concat(G.party.map((m) => m.level)),
    budget: Object.fromEntries(Object.entries(bot.state.budget).map(([k, v]) => [k, Math.round(v)])),
  };
}

// 진단용 추적: 사망·부활·보스 페이즈·전멸을 시간과 함께 찍는다
function attachTrace(ctx, fs, G) {
  const { Events } = ctx, B = fs.battle;
  const t = () => fs.time.toFixed(1).padStart(7);
  const party = () => B.party().map((e) => `${e.name}${e.alive ? '' : '†'}${Math.round(e.hp)}/${e.maxHp}`).join(' ');
  const foes = () => B.engagedMonsters().map((m) => m.name).join(',');
  Events.on('death', (e) => { if (e.kind === 'monster') return; const k = e.killer ? B.byUid(e.killer) : null; console.log(`[${t()}] 사망 ${e.name} ← ${k ? k.name : '?'} | 적 ${foes()} | ${party()}`); });
  Events.on('revive', (e) => console.log(`[${t()}] 부활 ${e.ent.name}`));
  Events.on('boss_phase', (e) => console.log(`[${t()}] 보스 페이즈 ${e.hpBelow} ${e.abilities.join(',')}`));
  Events.on('telegraph_hit', (e) => { if (e.victims.includes('player')) console.log(`[${t()}] 힐러 피격 ${e.abilityId}`); });
  Events.on('wipe', () => console.log(`[${t()}] 전멸`));
  Events.on('floor_cleared', () => console.log(`[${t()}] 클리어`));
}

// ---------------- 출력 ----------------
function fmt(r) {
  const skills = Object.entries(r.skills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ') || '(없음)';
  const boss = r.boss.defeated ? `처치(페이즈 ${r.boss.phases}/${r.boss.phases})` : r.boss.engaged ? `교전(페이즈 ${r.boss.phase}/${r.boss.phases}, HP ${pct(r.boss.hpLeft)}%)` : '미교전';
  return [
    `=== ${r.floor}층 ${r.name} | 파티 Lv.${r.level} | 장비 ${r.gear} | 스킬 Lv.${r.skill} | seed ${r.seed} ===`,
    `결과: ${r.result}  시간: ${r.time}s (실제 ${(r.realMs / 1000).toFixed(1)}s)  걸음: ${r.steps}  킬: ${r.kills}/${r.monsters}  상자: ${r.chests}/${r.chestsTotal}  무리: ${r.groupsVisited}/${r.groupsTotal}`,
    `플레이어 사망: ${r.playerDeaths}  파티원 사망: ${r.memberDeaths}  평균 MP: ${pct(r.avgMp)}%  피격: ${r.playerHits}  저주: ${r.cursesOnPlayer}  보스: ${boss}  피로 +${r.fatigueGained}  레벨업 ${r.levelUps} → [${r.partyLevels.join(',')}]`,
    `스킬: ${skills}  (취소 ${r.cancels})`,
    `시간 배분(초): ${Object.entries(r.budget).map(([k, v]) => `${k} ${v}`).join('  ')}`,
  ].join('\n');
}
function table(rows) {
  const by = {};
  for (const r of rows) (by[r.floor] = by[r.floor] || []).push(r);
  const lines = ['| 층 | Lv | 장비 | 판수 | 클리어 | 평균 시간 | 플레이어 사망 | 파티원 사망 | 평균 MP | 보스 페이즈 |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const f of Object.keys(by).map(Number).sort((a, b) => a - b)) {
    const rs = by[f], n = rs.length, avg = (k) => (rs.reduce((s, r) => s + k(r), 0) / n);
    lines.push(`| ${f} | ${rs[0].level} | ${rs[0].gear} | ${n} | ${rs.filter((r) => r.result === 'cleared').length}/${n} | ${Math.round(avg((r) => r.time))}s | ${avg((r) => r.playerDeaths).toFixed(1)} | ${avg((r) => r.memberDeaths).toFixed(1)} | ${pct(avg((r) => r.avgMp))}% | ${rs.map((r) => `${r.boss.phase}/${r.boss.phases}`).join(' ')} |`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const pos = argv.filter((a) => !a.startsWith('--')), flag = (k, d) => { const f = argv.find((a) => a.startsWith(`--${k}=`)); return f ? f.slice(k.length + 3) : d; };
  return {
    floors: pos[0] === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [parseInt(pos[0] || '1', 10)],
    maxSeconds: pos[1] ? parseFloat(pos[1]) : 3600, level: pos[2] ? parseInt(pos[2], 10) : 0,
    seed: parseInt(flag('seed', '1'), 10), runs: parseInt(flag('runs', '1'), 10), gear: flag('gear', ''), skill: parseInt(flag('skill', '0'), 10),
    json: argv.includes('--json'), quiet: argv.includes('--quiet'), dodge: !argv.includes('--nododge'), trace: argv.includes('--trace'),
  };
}
function main() {
  const a = parseArgs(process.argv.slice(2));
  const rows = [];
  for (const floor of a.floors) for (let k = 0; k < a.runs; k++) {
    const r = run({ floor, maxSeconds: a.maxSeconds, level: a.level || undefined, seed: a.seed + k, gear: a.gear || undefined, skill: a.skill || undefined, dodge: a.dodge, trace: a.trace });
    rows.push(r);
    if (!a.json && !a.quiet) console.log(fmt(r) + '\n');
  }
  if (a.json) console.log(JSON.stringify(rows.length === 1 ? rows[0] : rows, null, 2));
  else if (rows.length > 1) console.log(table(rows));
}
if (require.main === module) main();
module.exports = { run, fmt, table, makeBot, DT };
