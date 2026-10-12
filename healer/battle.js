// 모두의 힐러 - 탑 전투 (로그라이크)
'use strict';

const AW = 360, AH = 520; // 논리 전장 크기
let R = null; // 이번 도전(run)
let B = null; // 현재 층 전투
let cvs, ctx, scale = 1, lastT = 0, raf = 0;

const floorScale = f => (1 + 0.11 * (f - 1)) * Math.pow(1.022, f - 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hasSp = id => S.engrave.special.includes(id);

// ================= 도전 시작 =================
function startRun(floor) {
  closeSheet();
  R = {
    floor, startFloor: floor, gold: 0, exp: 0, loot: [], kills: 0,
    healPct: 0, manaCostPct: 0, manaRegen: 0, castPct: 0, maxMana: 0, movePct: 0,
    partyAtk: 0, partyDef: 0, partyHp: 0, goldPct: 0, thorns: 0, smitePct: 0, smiteAll: false,
    boons: [], ultCd: 0, carry: null,
  };
  $('#town').style.display = 'none';
  $('#battle').style.display = 'flex';
  setupCanvas();
  startFloor();
  lastT = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function makeAlly(m, i) {
  const p = memberPower(m), c = CLASSES[m.cls];
  const hp = Math.round(p.hp * (1 + R.partyHp / 100));
  const pos = { tank: [180, 360], melee: [140 + i * 25, 390], ranged: [100 + i * 50, 450], healer: [250, 455] }[m.role];
  return {
    kind: 'ally', id: m.uid, name: m.name, role: m.role, cls: m.cls, color: c.color, icon: c.icon,
    x: pos[0], y: pos[1], r: 13, hp, maxHp: hp, atk: p.atk, red: p.red,
    range: m.role === 'ranged' ? 130 : m.role === 'healer' ? 120 : 22, spd: m.role === 'tank' ? 70 : 80,
    aspd: m.role === 'ranged' ? 1.3 : m.role === 'tank' ? 1.2 : 0.9, atkT: Math.random(),
    curses: {}, dead: false, dodgeSkill: 0.6 + Math.min(0.35, m.lvl * 0.01), healT: 2,
  };
}

function startFloor() {
  const d = healerDerived(R);
  const prev = B;
  B = {
    t: 0, wave: 0, waves: R.floor % 5 === 0 ? 1 : (R.floor >= 20 ? 3 : 2), betweenT: 1.2,
    allies: [], enemies: [], tele: [], grounds: [], shots: [], floats: [],
    cast: null, cds: {}, buffs: {}, target: null, joy: null, beltCd: { hp: 0, mp: 0, cl: 0 },
    paused: false, over: false, d,
  };
  const healer = {
    kind: 'healer', id: 'me', name: '나', role: 'healer', color: '#f5e17a', icon: '✨',
    x: 180, y: 470, r: 13, hp: d.maxHp, maxHp: d.maxHp, mana: d.maxMana, maxMana: d.maxMana,
    curses: {}, dead: false, guardT: 0,
  };
  B.allies.push(healer);
  S.party.forEach((m, i) => B.allies.push(makeAlly(m, i)));
  // 이전 층 상태 이어받기 (로그라이크)
  if (R.carry) {
    for (const a of B.allies) {
      const c = R.carry[a.id];
      if (!c) continue;
      if (c.dead) { a.dead = true; a.hp = 0; } else a.hp = Math.min(a.maxHp, Math.max(1, Math.round(a.maxHp * c.pct)));
      if (a.kind === 'healer') a.mana = Math.min(a.maxMana, Math.round(a.maxMana * c.mana));
    }
  }
  B.me = healer;
  renderBattleUI(true);
  if (window.onresize) window.onresize();
  floatText(180, 250, `${R.floor}층`, '#fff', 28, 1.6);
}

function spawnWave() {
  const f = R.floor, fs = floorScale(f);
  B.wave++;
  const pool = MONSTERS.filter(m => m.tier <= f);
  if (f % 5 === 0) {
    const bd = BOSSES[(f / 5 - 1) % BOSSES.length];
    const loop = Math.floor((f / 5 - 1) / BOSSES.length);
    B.enemies.push(makeEnemy(bd, fs * (1 + loop * 0.5), true, 180, -30));
    for (let i = 0; i < 2 + Math.floor(f / 15); i++) B.enemies.push(makeEnemy(pick(pool), fs, false, rnd(40, 320), rnd(-80, -20)));
  } else {
    const n = Math.min(7, 2 + Math.floor(f / 5) + rint(0, 1));
    for (let i = 0; i < n; i++) B.enemies.push(makeEnemy(pick(pool), fs, false, rnd(30, 330), rnd(-90, -15)));
  }
}
function makeEnemy(d, fs, boss, x, y) {
  const hp = Math.round(d.hp * fs);
  return {
    kind: 'enemy', ...d, x, y, r: boss ? 24 : 14, boss, hp, maxHp: hp, atk: d.atk * fs * (boss ? 1.3 : 1),
    aspd: boss ? 1.4 : 1.5, atkT: rnd(0, 1), target: null, retT: 0, curses: {},
    abilT: rnd(4, 9) * (boss ? 0.6 : 1), cc: d.cc || 0.12,
  };
}

// ================= 메인 루프 =================
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (B && !B.paused && !B.over) update(dt);
  if (B) draw();
  raf = requestAnimationFrame(loop);
}

function update(dt) {
  B.t += dt;
  const me = B.me, d = B.d;
  // 웨이브 관리
  if (!B.enemies.length) {
    if (B.wave >= B.waves) { floorCleared(); return; }
    B.betweenT -= dt;
    if (B.betweenT <= 0) { spawnWave(); B.betweenT = 1.5; }
  }
  // 쿨타임 / 버프
  for (const k in B.cds) B.cds[k] = Math.max(0, B.cds[k] - dt);
  R.ultCd = Math.max(0, R.ultCd - dt);
  for (const k in B.buffs) { B.buffs[k] -= dt; if (B.buffs[k] <= 0) delete B.buffs[k]; }
  for (const k in B.beltCd) B.beltCd[k] = Math.max(0, B.beltCd[k] - dt);
  // 마나 회복
  if (!me.dead) me.mana = Math.min(me.maxMana, me.mana + d.manaRegen * dt * (B.enemies.length ? 1 : 3));
  // 저주 지속
  for (const e of [...B.allies, ...B.enemies]) {
    for (const k in e.curses) {
      e.curses[k].t -= dt;
      if (k === 'dot' && !e.dead) damage(e, e.curses[k].dmg * dt, null, true);
      if (e.curses[k].t <= 0) delete e.curses[k];
    }
  }
  if (me.guardT > 0) me.guardT -= dt;
  // 힐러 이동
  if (!me.dead) {
    let mv = d.move * (B.buffs.move ? 1.25 : 1) * (me.curses.slow ? 0.5 : 1);
    if (hasSp('swift') && inDanger(me)) mv *= 1.3;
    if (B.joy && B.joy.mag > 0 && !me.curses.root) {
      me.x = clamp(me.x + B.joy.dx * mv * dt, 12, AW - 12);
      me.y = clamp(me.y + B.joy.dy * mv * dt, 70, AH - 12);
      if (B.cast) { cancelCast('이동하여 시전이 취소되었습니다'); }
    }
  }
  // 시전 진행
  if (B.cast) {
    B.cast.t += dt;
    if (B.cast.t >= B.cast.total) finishCast();
  }
  // 아군 AI
  for (const a of B.allies) if (a.kind === 'ally' && !a.dead) allyAI(a, dt);
  // 적 AI
  for (const e of B.enemies) enemyAI(e, dt);
  B.enemies = B.enemies.filter(e => e.hp > 0);
  // 광역기
  for (const t of B.tele) {
    t.t += dt;
    if (!t.fired && t.t >= t.fill) {
      t.fired = true;
      if (t.type === 'blast') {
        for (const a of B.allies) if (!a.dead && dist(a, t) < t.r + a.r * 0.5) damage(a, t.dmg, null, false, true);
        floatText(t.x, t.y, '💥', '#fff', 26, 0.6);
        t.dead = true;
      }
    }
    if (t.type === 'puddle' && t.fired) {
      for (const a of B.allies) if (!a.dead && dist(a, t) < t.r) damage(a, t.dmg * dt, null, true, true);
      if (t.t >= t.fill + t.dur) t.dead = true;
    }
  }
  B.tele = B.tele.filter(t => !t.dead);
  // 바닥힐
  for (const g of B.grounds) {
    g.t -= dt; g.tick -= dt;
    if (g.tick <= 0) { g.tick = 1; for (const a of B.allies) if (!a.dead && dist(a, g) < g.r) healUnit(a, g.power, true); }
  }
  B.grounds = B.grounds.filter(g => g.t > 0);
  // 투사체
  for (const s of B.shots) { s.t += dt; }
  B.shots = B.shots.filter(s => s.t < s.life);
  for (const f of B.floats) { f.t += dt; f.y -= 22 * dt; }
  B.floats = B.floats.filter(f => f.t < f.life);
  // 벨트 자동 사용
  beltAuto();
  // 실패 판정
  if (me.dead) { runFailed(); return; }
  renderBattleUI();
}

function inDanger(u) { return B.tele.some(t => dist(u, t) < t.r + 4); }

function allyAI(a, dt) {
  const rooted = !!a.curses.root;
  const spd = a.spd * (B.buffs.move ? 1.25 : 1) * (a.curses.slow ? 0.5 : 1);
  // 위험 지역 회피
  const danger = B.tele.find(t => dist(a, t) < t.r + 6 && (t.aware ??= {})[a.id] !== false);
  if (danger && !rooted) {
    if (danger.aware[a.id] === undefined) danger.aware[a.id] = Math.random() < a.dodgeSkill;
    if (danger.aware[a.id]) {
      let dx = a.x - danger.x, dy = a.y - danger.y, l = Math.hypot(dx, dy) || 1;
      a.x = clamp(a.x + dx / l * spd * 1.2 * dt, 12, AW - 12); a.y = clamp(a.y + dy / l * spd * 1.2 * dt, 70, AH - 12);
      return;
    }
  }
  // AI 사제 (파티원 힐러)
  if (a.role === 'healer') {
    a.healT -= dt;
    if (a.healT <= 0) {
      a.healT = 2.6 * (a.curses.aspdDown ? 1.5 : 1);
      const low = B.allies.filter(x => !x.dead).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (low && low.hp < low.maxHp * 0.85) { healUnit(low, a.atk * 2.2, false, true); B.shots.push({ x1: a.x, y1: a.y, x2: low.x, y2: low.y, t: 0, life: 0.3, c: '#9f9' }); }
    }
  }
  // 대상 선택
  let tgt;
  const enemies = B.enemies.filter(e => e.hp > 0 && e.y > -10);
  if (!enemies.length) { // 대형으로 복귀
    return;
  }
  if (a.role === 'tank') {
    // 탱커 아닌 아군을 노리는 적 우선
    tgt = enemies.filter(e => e.target && e.target.role !== 'tank').sort((x, y) => dist(a, x) - dist(a, y))[0]
      || enemies.sort((x, y) => dist(a, x) - dist(a, y))[0];
  } else {
    const tank = B.allies.find(x => x.role === 'tank' && !x.dead);
    tgt = (tank && tank.tgt && tank.tgt.hp > 0) ? tank.tgt : enemies.sort((x, y) => dist(a, x) - dist(a, y))[0];
  }
  a.tgt = tgt;
  const want = a.role === 'ranged' || a.role === 'healer' ? a.range * 0.9 : a.range + tgt.r * 0.6;
  const dd = dist(a, tgt);
  if (!rooted && dd > want) {
    a.x += (tgt.x - a.x) / dd * spd * dt; a.y += (tgt.y - a.y) / dd * spd * dt;
  } else if (!rooted && (a.role === 'ranged') && dd < want * 0.6) {
    a.y = clamp(a.y + spd * 0.6 * dt, 70, AH - 12);
  }
  a.atkT -= dt * (B.buffs.aspd ? 1.2 : 1) * (a.curses.aspdDown ? 0.6 : 1);
  if (dd <= a.range + tgt.r && a.atkT <= 0) {
    a.atkT = a.aspd;
    let dmg = a.atk * (1 + R.partyAtk / 100) * (B.buffs.atk ? 1.2 : 1) * (a.curses.atkDown ? 0.6 : 1) * rnd(0.85, 1.15);
    const crit = Math.random() < 0.12; if (crit) dmg *= 1.8;
    damage(tgt, dmg, a, false, false, crit);
    if (a.role === 'ranged' || a.role === 'healer') B.shots.push({ x1: a.x, y1: a.y, x2: tgt.x, y2: tgt.y, t: 0, life: 0.18, c: a.color });
  }
}

function enemyAI(e, dt) {
  const f = R.floor;
  const alive = B.allies.filter(a => !a.dead);
  if (!alive.length) return;
  const tank = alive.find(a => a.role === 'tank');
  // 어그로
  e.retT -= dt;
  if (!e.target || e.target.dead || e.retT <= 0) {
    e.retT = rnd(2, 4);
    const slip = f <= 10 ? 0 : Math.min(0.55, (f - 10) * 0.012);
    if (tank && Math.random() >= slip) e.target = tank;
    else {
      const pool = f <= 10 ? alive.filter(a => a.kind !== 'healer') : alive;
      const list = pool.length ? pool : alive;
      // 힐러는 치유 어그로로 조금 더 노려짐
      e.target = (f > 10 && Math.random() < 0.35 && !B.me.dead) ? B.me : pick(list);
    }
  }
  const t = e.target;
  const spd = e.spd * (e.curses.slow ? 0.5 : 1);
  const dd = dist(e, t);
  if (dd > e.range + t.r) { e.x += (t.x - e.x) / dd * spd * dt; e.y += (t.y - e.y) / dd * spd * dt; }
  e.atkT -= dt;
  if (dd <= e.range + t.r + 2 && e.atkT <= 0) {
    e.atkT = e.aspd;
    const dmg = e.atk * rnd(0.85, 1.15);
    damage(t, dmg, e);
    if (e.ranged) B.shots.push({ x1: e.x, y1: e.y, x2: t.x, y2: t.y, t: 0, life: 0.25, c: '#f55' });
    if (Math.random() < e.cc && e.curse) applyCurse(t, pick(e.curse), e);
  }
  // 광역기
  if (f >= 3 && e.y > 0) {
    e.abilT -= dt;
    if (e.abilT <= 0) {
      e.abilT = (e.boss ? rnd(4, 7) : rnd(9, 16)) * Math.max(0.5, 1 - f / 200);
      const healerChance = f <= 10 ? 0.35 : 0.55;
      const victim = !B.me.dead && Math.random() < healerChance ? B.me : pick(alive);
      const puddle = f >= 6 && Math.random() < 0.45;
      const r = (e.boss ? rnd(55, 75) : rnd(36, 50)) * (1 + Math.min(0.4, f / 150));
      B.tele.push({
        type: puddle ? 'puddle' : 'blast', x: victim.x, y: victim.y, r, t: 0, fill: rnd(3, 5) * Math.max(0.6, 1 - f / 250),
        dmg: puddle ? e.atk * 0.9 : e.atk * (e.boss ? 3.5 : 2.6), dur: 5, src: e.name,
      });
    }
  }
}

function applyCurse(u, type, src) {
  if (u.dead) return;
  u.curses[type] = { t: type === 'root' ? 4 : 10, dmg: type === 'dot' ? src.atk * 0.35 : 0 };
  floatText(u.x, u.y - 22, CURSES[type].icon + CURSES[type].name, '#d6f', 11, 1);
}

function damage(u, amt, src, dot, aoe, crit) {
  if (u.dead || u.hp <= 0) return;
  if (u.kind === 'enemy') {
    u.hp -= amt;
    if (!dot) floatText(u.x + rnd(-8, 8), u.y - u.r, Math.round(amt) + (crit ? '!' : ''), crit ? '#ffd23f' : '#fff', crit ? 15 : 11, 0.6);
    if (u.hp <= 0) enemyDied(u);
    return;
  }
  // 아군 피격
  let dodge = (B.buffs.dodge ? 0.15 : 0) + (u.kind === 'healer' && hasSp('evade') ? 0.2 : 0);
  if (!dot && !aoe && Math.random() < dodge) { floatText(u.x, u.y - 18, '회피', '#aef', 11, 0.6); return; }
  let red;
  if (u.kind === 'healer') {
    const armor = B.d.armor * (u.guardT > 0 ? 2 : 1);
    red = armor / (armor + 60 + R.floor * 6);
    if (hasSp('guard') && Math.random() < 0.2) u.guardT = 3;
  } else red = u.red;
  if (B.buffs.def) red += (1 - red) * 0.25;
  if (u.curses.defDown) red *= 0.5;
  amt *= (1 - red) * (1 - R.partyDef / 100);
  u.hp -= amt;
  if (R.thorns && u.role === 'tank' && src && src.kind === 'enemy' && !dot) damage(src, amt * R.thorns / 100, null, true);
  if (!dot) floatText(u.x + rnd(-6, 6), u.y - 18, '-' + Math.round(amt), '#ff6b6b', 11, 0.6);
  if (u.hp <= 0) {
    u.hp = 0; u.dead = true; u.curses = {};
    floatText(u.x, u.y - 24, `${u.name} 쓰러짐!`, '#f66', 13, 1.2);
    if (B.cast && B.cast.target === u && B.cast.sk.type !== 'revive') cancelCast();
  }
}

function enemyDied(e) {
  const f = R.floor;
  R.kills++;
  const g = Math.round((3 + f * 1.6) * (e.boss ? 12 : 1) * (1 + R.goldPct / 100));
  R.gold += g;
  R.exp += Math.round((10 + f * 4) * (e.boss ? 10 : 1));
  floatText(e.x, e.y, `+${g}G`, '#ffd23f', 12, 1);
  questProgress('kills'); questProgress('kill', 1, e.id);
  if (e.undead) questProgress('killUndead');
  if (Math.random() < 0.35) addMat('junk');
  if (Math.random() < 0.15) addMat(pick(['scrap', 'ore']));
  if (e.boss) {
    for (let i = 0; i < 2; i++) { const it = randomDrop(f + 2); if (it.grade < 2) it.grade = 2; R.loot.push(makeItem({ slot: it.slot, kind: it.kind, armor: it.armor, ilvl: f + 2, grade: it.grade })); }
    addMat('essence', 1 + Math.floor(f / 10));
    if (f >= 20) addMat('holy');
  } else if (Math.random() < 0.06) R.loot.push(randomDrop(f));
}

// ================= 치유 =================
function healUnit(u, amt, quiet, fromAI) {
  if (u.dead) return 0;
  if (u.curses.healDown) amt *= 0.5;
  const before = u.hp;
  u.hp = Math.min(u.maxHp, u.hp + amt);
  const real = u.hp - before;
  if (!quiet || real > 1) floatText(u.x + rnd(-6, 6), u.y - 20, '+' + Math.round(amt), fromAI ? '#8f8' : '#5f5', quiet ? 10 : 13, 0.8);
  if (!fromAI && !quiet) questProgress('heals');
  return real;
}
function healPower(id) {
  const sk = SKILLS[id];
  return sk.power * (1 + 0.12 * (skillLvl(id) - 1)) * B.d.healMult;
}

// ================= 스킬 사용 =================
function useSkill(id) {
  if (!B || B.paused || B.over) return;
  const sk = SKILLS[id], me = B.me;
  if (me.dead || !skillLvl(id)) return;
  if (id === 'ult') { if (R.ultCd > 0) return toast(`필살기 쿨타임 ${Math.ceil(R.ultCd)}초`); }
  else if (B.cds[id] > 0) return;
  if (B.cast) { if (sk.cast > 0) return; } // 즉시 스킬은 시전 중에도 사용 가능
  const cost = manaCost(sk);
  if (me.mana < cost) { floatText(me.x, me.y - 26, '마나 부족!', '#6af', 12, 0.8); return; }
  // 대상 결정
  let target = null;
  const sel = B.target && B.allies.includes(B.target) ? B.target : null;
  const alive = B.allies.filter(a => !a.dead);
  if (sk.type === 'single') {
    target = sel && !sel.dead ? sel : alive.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  } else if (sk.type === 'revive') {
    target = sel && sel.dead ? sel : B.allies.find(a => a.dead);
    if (!target) return toast('부활시킬 아군이 없습니다');
  } else if (sk.type === 'cleanse') {
    target = sel && !sel.dead && Object.keys(sel.curses).length ? sel : alive.find(a => Object.keys(a.curses).length);
    if (!target) return toast('저주에 걸린 아군이 없습니다');
  } else if (sk.type === 'attack') {
    const cands = B.enemies.filter(e => (e.undead || R.smiteAll) && e.y > 0);
    target = cands.sort((a, b) => dist(me, a) - dist(me, b))[0];
    if (!target) return toast('언데드가 없습니다 (성스러운 일격은 언데드에게만 통합니다)');
  } else if (sk.type === 'ground') target = sel && !sel.dead ? sel : me;
  let castTime = sk.cast / B.d.castMult * (me.curses.aspdDown ? 1.4 : 1);
  const sb = B.d.sb;
  if (id === 'heal' && sb.instantHeal && Math.random() < sb.instantHeal) { castTime = 0; floatText(me.x, me.y - 30, '세트: 즉시 시전!', '#ffb347', 11, 0.8); }
  if (sk.type === 'multi' && sb.instantMulti && Math.random() < sb.instantMulti) { castTime = 0; floatText(me.x, me.y - 30, '세트: 즉시 시전!', '#ffb347', 11, 0.8); }
  if (B.joy && B.joy.mag > 0 && castTime > 0) return toast('이동 중에는 시전할 수 없습니다');
  B.cast = { id, sk, target, t: 0, total: castTime, cost };
  if (castTime <= 0) finishCast();
}
function manaCost(sk) { return sk.mana * B.d.manaCost * (B.buffs.mana ? 0.75 : 1); }
function cancelCast(msg) { if (msg) floatText(B.me.x, B.me.y - 28, '시전 취소', '#aaa', 10, 0.6); B.cast = null; }

function finishCast() {
  const c = B.cast; B.cast = null;
  const { id, sk } = c, me = B.me;
  let t = c.target;
  if (me.dead) return;
  let cost = c.cost;
  if (B.d.sb.freeMana && Math.random() < B.d.sb.freeMana) { cost = 0; floatText(me.x, me.y - 30, '세트: 마나 소비 없음!', '#ffb347', 11, 0.8); }
  if (me.mana < cost) return;
  me.mana -= cost;
  if (sk.cd) B.cds[id] = sk.cd;
  const critMul = () => (B.d.sb.critHeal && Math.random() < B.d.sb.critHeal) ? 2 : 1;
  switch (sk.type) {
    case 'single':
      if (!t || t.dead) { me.mana += cost; return; }
      healUnit(t, healPower(id) * critMul());
      beam(me, t, '#7f7');
      if (hasSp('echo') && Math.random() < 0.2) {
        const low = B.allies.filter(a => !a.dead && a !== t).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (low) { healUnit(low, healPower(id) * 0.5); beam(t, low, '#bfb'); }
      }
      break;
    case 'multi': {
      const inj = B.allies.filter(a => !a.dead && a.hp < a.maxHp).sort(() => Math.random() - 0.5).slice(0, sk.count);
      if (!inj.length) { const any = B.allies.filter(a => !a.dead); inj.push(...any.slice(0, sk.count)); }
      for (const a of inj) { healUnit(a, healPower(id) * critMul()); beam(me, a, '#7f7'); }
      break;
    }
    case 'ground':
      B.grounds.push({ x: t.x, y: t.y, r: sk.radius, t: sk.dur, tick: 0, power: healPower(id) });
      break;
    case 'revive':
      if (!t.dead) { me.mana += cost; return; }
      t.dead = false; t.hp = t.maxHp * (sk.power + 0.03 * (skillLvl(id) - 1)); t.curses = {};
      floatText(t.x, t.y - 26, '👼 부활!', '#fff6a0', 15, 1.2);
      questProgress('revives');
      break;
    case 'cleanse': {
      const n = Object.keys(t.curses).length; t.curses = {};
      floatText(t.x, t.y - 26, '저주 해제!', '#aef', 12, 0.9);
      questProgress('cleanses', n);
      break;
    }
    case 'attack': {
      if (t.hp <= 0) return;
      const dmg = sk.power * (1 + 0.12 * (skillLvl(id) - 1)) * B.d.healMult * floorScale(R.floor) * 0.6 * (1 + R.smitePct / 100) * (t.undead ? 1 : 0.5);
      beam(me, t, '#ffe066');
      damage(t, dmg, me, false, false, true);
      break;
    }
    case 'buff':
      B.buffs[sk.buff] = sk.dur * (1 + 0.1 * (skillLvl(id) - 1));
      for (const a of B.allies) if (!a.dead) floatText(a.x, a.y - 22, BUFF_NAMES[sk.buff], '#9cf', 10, 0.8);
      break;
    case 'ult':
      R.ultCd = sk.cd * (1 - (B.d.sb.ultCdr || 0));
      for (const a of B.allies) if (!a.dead) { a.hp = Math.max(a.hp, a.maxHp * sk.power); floatText(a.x, a.y - 24, '🌟', '#fff', 18, 1); }
      B.flash = 0.6;
      break;
  }
  if (sk.type !== 'buff' && sk.type !== 'ult' && hasSp('clarity') && Math.random() < 0.2) me.mana = Math.min(me.maxMana, me.mana + 5);
}

function beam(a, b, c) { B.shots.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: 0, life: 0.35, c, w: 3 }); }

function beltAuto() {
  if (!S.equip.belt) return;
  const me = B.me, n = S.equip.belt.beltSlots;
  for (let i = 0; i < n; i++) {
    const k = S.belt[i]; if (!k || !(S.cons[k] > 0)) continue;
    const c = CONSUMABLES[k];
    if (c.kind === 'hp' && me.hp < me.maxHp * 0.4 && B.beltCd.hp <= 0) { me.hp = Math.min(me.maxHp, me.hp + me.maxHp * c.value); B.beltCd.hp = 8; S.cons[k]--; floatText(me.x, me.y - 30, c.icon + ' 자동 사용', '#f88', 11, 1); }
    if (c.kind === 'mp' && me.mana < me.maxMana * 0.25 && B.beltCd.mp <= 0) { me.mana = Math.min(me.maxMana, me.mana + me.maxMana * c.value); B.beltCd.mp = 8; S.cons[k]--; floatText(me.x, me.y - 30, c.icon + ' 자동 사용', '#8af', 11, 1); }
    if (c.kind === 'cleanse' && Object.keys(me.curses).length && B.beltCd.cl <= 0) { me.curses = {}; B.beltCd.cl = 6; S.cons[k]--; floatText(me.x, me.y - 30, c.icon + ' 정화', '#aef', 11, 1); }
  }
}

// ================= 층 클리어 / 실패 =================
function floorCleared() {
  B.over = true; cancelCast();
  const f = R.floor;
  R.carry = {};
  for (const a of B.allies) R.carry[a.id] = { dead: a.dead, pct: a.dead ? 0 : a.hp / a.maxHp, mana: a.mana ? a.mana / a.maxMana : 1 };
  if (f > S.best) S.best = f;
  questProgress('floors');
  const endF = 1 - Math.min(0.6, totalStats().end * 0.008);
  S.fatigue = Math.min(100, S.fatigue + 3 * endF);
  for (const s in S.equip) if (S.equip[s]) S.equip[s].dur = Math.max(0, S.equip[s].dur - 2);
  // 히든 퀘스트
  let hiddenMsg = '';
  if (f >= 5 && Math.random() < 0.04 && S.quests.hidden.length < 3) {
    const target = f + rint(5, 10);
    S.quests.hidden.push({ id: uid(), title: pick(['봉인된 성유물', '잊혀진 사제의 일기', '타락한 천사의 깃털', '빛의 파편']), text: `탑 ${target}층에 도달하라`, floor: target });
    hiddenMsg = `<div class="hiddenq">❓ 수상한 두루마리를 발견했다! 히든 퀘스트가 추가되었습니다.</div>`;
  }
  // 축복 3개 제시
  const opts = [...BOONS].sort(() => Math.random() - 0.5).slice(0, 3);
  B.boonOpts = opts;
  const lootHtml = R.loot.length ? R.loot.map(it => itemLabel(it)).join(', ') : '<span class="dim">없음</span>';
  $('#boon-body').innerHTML = `<h3>🎉 ${f}층 클리어!</h3>
    <div class="dim">이번 도전: 💰${fmt(R.gold)}G · ⭐${fmt(R.exp)}EXP · 처치 ${R.kills}</div>
    <div><small>전리품: ${lootHtml}</small></div>${hiddenMsg}
    <h4>축복을 하나 선택하세요</h4>
    <div class="boons">${opts.map((b, i) => `<div class="boon" onclick="pickBoon(${i})"><div class="bi">${b.icon}</div><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}</div>
    <small class="dim">쓰러진 동료는 다음 층에서 HP 25%로 일어나고, 모두 HP 30%를 회복합니다.</small>`;
  $('#boon-btns').innerHTML = '';
  $('#boon').classList.add('open');
  save();
}
function pickBoon(i) {
  const b = B.boonOpts[i];
  b.apply(R); R.boons.push(b.id);
  $('#boon-body').innerHTML = `<h3>${b.icon} ${b.name}</h3><p>${b.desc}</p><p>다음 층으로 오르시겠습니까?</p>`;
  $('#boon-btns').innerHTML = `<button class="btn pri" onclick="nextFloor()">⬆️ ${R.floor + 1}층으로</button><button class="btn" onclick="endRun(true)">🏠 마을로 귀환 (보상 획득)</button>`;
}
function nextFloor() {
  $('#boon').classList.remove('open');
  for (const id in R.carry) {
    const c = R.carry[id];
    if (c.dead) { c.dead = false; c.pct = 0.25; } else c.pct = Math.min(1, c.pct + 0.3);
    c.mana = Math.min(1, c.mana + 0.3);
  }
  R.floor++;
  startFloor();
}
function runFailed() {
  B.over = true;
  const lostGold = Math.floor(R.gold / 2), lostPocket = Math.floor(S.gold * 0.2);
  R.gold -= lostGold; S.gold -= lostPocket;
  for (const s in S.equip) if (S.equip[s]) S.equip[s].dur = Math.max(0, S.equip[s].dur - 10);
  S.fatigue = Math.min(100, S.fatigue + 8);
  R.failed = { lostGold, lostPocket };
  setTimeout(() => endRun(false), 900);
}
function endRun(ok) {
  $('#boon').classList.remove('open');
  cancelAnimationFrame(raf);
  const lvBefore = S.lvl;
  S.gold += R.gold;
  gainExp(R.exp); memberGainExp(Math.round(R.exp * 0.9));
  const kept = [], lost = [];
  for (const it of R.loot) (addItem(it) ? kept : lost).push(it);
  const reached = ok ? R.floor : R.floor - 1;
  let html = ok ? `<h3>🏠 무사 귀환!</h3>` : `<h3>💀 파티 전멸...</h3><small class="bad">이번 도전 골드 절반(${fmt(R.failed.lostGold)}G)과 소지금 ${fmt(R.failed.lostPocket)}G를 잃었습니다. 장비 내구도 -10</small>`;
  html += `<p>${R.startFloor}층 → <b>${Math.max(reached, R.startFloor - 1)}층</b> 클리어 (최고 ${S.best}층)</p>
    <p>💰 +${fmt(R.gold)}G · ⭐ +${fmt(R.exp)}EXP${S.lvl > lvBefore ? ` · 🎉 Lv.${S.lvl}` : ''}</p>
    <p>${kept.map(itemLabel).join('<br>') || '<span class="dim">획득 장비 없음</span>'}</p>`;
  if (S.fatigue > 40) html += `<small class="bad">피로가 쌓였습니다. 여관에서 쉬세요.</small>`;
  B = null; R = null;
  showTown();
  popup(html, [['확인', null, 'pri']]);
}
function retreat() {
  if (!B || B.over) return;
  B.paused = true;
  popup('전투 중 귀환하면 이번 층의 진행이 사라지지만 지금까지의 보상은 가져갑니다.', [
    ['귀환', () => { R.floor--; endRun(true); }, 'red'],
    ['계속 싸우기', () => { B.paused = false; }, 'pri'],
  ]);
}

// ================= 텍스트 =================
function floatText(x, y, text, color, size, life) { if (B) B.floats.push({ x, y, text: String(text), color, size, t: 0, life }); }

// ================= 캔버스 / 입력 =================
function setupCanvas() {
  cvs = $('#cv'); ctx = cvs.getContext('2d');
  const resize = () => {
    const wrap = $('#cvwrap'), w = wrap.clientWidth, h = wrap.clientHeight;
    scale = Math.min(w / AW, h / AH);
    const dpr = window.devicePixelRatio || 1;
    cvs.style.width = AW * scale + 'px'; cvs.style.height = AH * scale + 'px';
    cvs.width = AW * scale * dpr; cvs.height = AH * scale * dpr;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  };
  resize();
  window.onresize = resize;
  if (cvs._bound) return;
  cvs._bound = true;
  const pos = ev => { const r = cvs.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }; };
  cvs.addEventListener('pointerdown', ev => {
    if (!B) return;
    cvs.setPointerCapture(ev.pointerId);
    const p = pos(ev);
    B.joy = { sx: p.x, sy: p.y, x: p.x, y: p.y, dx: 0, dy: 0, mag: 0, t: performance.now(), moved: false };
  });
  cvs.addEventListener('pointermove', ev => {
    if (!B || !B.joy) return;
    const p = pos(ev), j = B.joy;
    j.x = p.x; j.y = p.y;
    let dx = p.x - j.sx, dy = p.y - j.sy;
    const l = Math.hypot(dx, dy);
    if (l > 10) { j.moved = true; j.dx = dx / l; j.dy = dy / l; j.mag = 1; }
    else { j.mag = 0; }
  });
  const up = ev => {
    if (!B || !B.joy) return;
    const j = B.joy; B.joy = null;
    if (!j.moved) {
      const p = { x: j.sx, y: j.sy };
      const near = B.allies.map(a => [a, dist(a, p)]).sort((a, b) => a[1] - b[1])[0];
      if (near && near[1] < 30) { B.target = near[0]; renderBattleUI(true); }
    }
  };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
}

// 그리기 함수(draw, drawChibi 등)는 art.js 에 있습니다.

// ================= 전투 UI =================
let lastUI = 0;
function renderBattleUI(force) {
  const now = performance.now();
  if (!force && now - lastUI < 90) return;
  lastUI = now;
  const me = B.me;
  const wp = B.waveSize ? (B.wave - 1 + (1 - B.enemies.length / B.waveSize)) / B.waves : 0;
  const segs = 10, fillN = Math.round(clamp(wp, 0, 1) * segs);
  $('#b-top').innerHTML = `<div class="hud">
      <button class="hud-pause" onclick="retreat()">⏸</button>
      <div class="hud-floor"><b>${R.floor}F</b>${R.floor % 5 === 0 ? '<i>BOSS</i>' : ''}</div>
      <div class="hud-res"><span>🪙 ${fmt(R.gold)}</span><span>💀 ${R.kills}</span></div>
    </div>
    <div class="hud-prog"><div class="segs">${Array.from({ length: segs }, (_, i) => `<i class="${i < fillN ? 'on' : ''}"></i>`).join('')}</div><b>${B.wave}/${B.waves}</b></div>
    <div class="buffs">${Object.keys(B.buffs).map(k => `<i>${BUFF_NAMES[k]} ${Math.ceil(B.buffs[k])}</i>`).join('')}</div>`;
  // 파티 프레임
  let html = '';
  for (const a of B.allies) {
    const p = a.hp / a.maxHp;
    html += `<div class="pf ${B.target === a ? 'sel' : ''} ${a.dead ? 'dead' : ''}" data-id="${a.id}">
      <div class="pn">${a.icon}${a.name}</div>
      <div class="hpb"><i style="width:${p * 100}%;background:${p < 0.35 ? '#f44' : p < 0.7 ? '#fc3' : '#4d4'}"></i><span>${a.dead ? '사망' : Math.ceil(a.hp)}</span></div>
      <div class="pc">${Object.keys(a.curses).map(c => `<b title="${CURSES[c].name}">${CURSES[c].icon}</b>`).join('')}</div></div>`;
  }
  const pe = $('#b-party');
  pe.innerHTML = html;
  if (!pe._bound) { pe._bound = true; pe.addEventListener('pointerdown', ev => { const f = ev.target.closest('.pf'); if (f) selectAlly(f.dataset.id); }); }
  $('#b-me').innerHTML = `<div class="mbar hp"><i style="width:${me.hp / me.maxHp * 100}%"></i><span>HP ${Math.ceil(me.hp)}/${me.maxHp}</span></div>
    <div class="mbar mp"><i style="width:${me.mana / me.maxMana * 100}%"></i><span>MP ${Math.floor(me.mana)}/${me.maxMana}</span></div>
    <div class="mbar cast ${B.cast ? '' : 'idle'}"><i style="width:${B.cast ? B.cast.t / B.cast.total * 100 : 0}%"></i><span>${B.cast ? B.cast.sk.name + (B.cast.target ? ' → ' + B.cast.target.name : '') : (B.target ? '대상: ' + B.target.name : '대상: 자동(가장 위험한 아군)')}</span></div>`;
  // 스킬바
  const bar = $('#b-skills');
  if (force || !bar.children.length) {
    bar.innerHTML = '';
    const ids = [...S.loadout, 'ult'];
    ids.forEach(id => {
      const b = document.createElement('button');
      b.className = 'sk' + (id === 'ult' ? ' ult' : '');
      b.dataset.id = id || '';
      b.innerHTML = id ? `<span>${SKILLS[id].icon}</span><small>${SKILLS[id].name}</small><em></em>` : '';
      if (id) b.addEventListener('pointerdown', ev => { ev.preventDefault(); useSkill(id); });
      bar.appendChild(b);
    });
  }
  for (const b of bar.children) {
    const id = b.dataset.id; if (!id) continue;
    const sk = SKILLS[id], cd = id === 'ult' ? R.ultCd : (B.cds[id] || 0);
    const locked = !skillLvl(id);
    const noMana = me.mana < manaCost(sk);
    b.classList.toggle('off', locked || noMana || cd > 0);
    b.querySelector('em').textContent = locked ? '🔒' : cd > 0 ? Math.ceil(cd) : '';
  }
}
function selectAlly(id) {
  if (!B) return;
  const a = B.allies.find(x => x.id === id);
  B.target = B.target === a ? null : a;
  renderBattleUI(true);
}
