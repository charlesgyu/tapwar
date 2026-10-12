// 모두의 힐러 - 상태, 아이템, 마을(UI)
'use strict';

const SAVE_KEY = 'everyones_healer_v1';
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.floor(n).toLocaleString('ko-KR');
const todayKey = () => new Date().toISOString().slice(0, 10);
let UID = Date.now() % 100000;
const uid = () => (++UID).toString(36) + Math.random().toString(36).slice(2, 5);

// ================= 상태 =================
function newState() {
  return {
    v: 1, gold: 300, lvl: 1, exp: 0, statPts: 0, fatigue: 0,
    stats: { str: 3, def: 5, agi: 5, end: 5, int: 10, vit: 8 },
    skills: { heal: 1 }, loadout: ['heal', 'smite', null, null, null, null, null],
    equip: { necklace: null, ring: null, earring: null, weapon: null, offhand: null, chest: null, boots: null, gloves: null, hat: null, belt: null, bag: null },
    bag: [], cons: { hpPot: 3, mpPot: 3 }, mats: {}, belt: ['mpPot', null, null, null],
    bank: { items: [], gold: 0 },
    party: [], recruits: [], recruitTime: 0,
    guild: null,
    quests: { main: 0, town: [], townTime: 0, daily: { date: '', list: [] }, hidden: [] },
    auction: { offset: 0, mine: [], bought: {} },
    engrave: { stats: {}, special: [] },
    best: 0, counters: {},
    tutorial: true,
  };
}
let S = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.v === 1) return Object.assign(newState(), d);
  } catch (e) { /* 새 게임 */ }
  const s = newState();
  // 시작 장비 & 시작 파티
  s.equip.weapon = makeItem({ slot: 'weapon', kind: 'staff1', grade: 0, ilvl: 1 });
  s.equip.chest = makeItem({ slot: 'chest', grade: 0, ilvl: 1, armor: 'cloth' });
  s.equip.belt = makeItem({ slot: 'belt', grade: 0, ilvl: 1, armor: 'cloth' });
  s.party = [makeMember('warrior', 'tank', 1), makeMember('rogue', 'melee', 1), makeMember('mage', 'ranged', 1)];
  return s;
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } }

// ================= 아이템 =================
function makeItem(o) {
  const grade = o.grade ?? rollGrade(o.ilvl || 1);
  const ilvl = Math.max(1, o.ilvl || 1);
  let slot = o.slot, kind = o.kind || null, armor = o.armor || null;
  if (slot === 'weapon' && !kind) kind = Math.random() < 0.5 ? 'staff2' : 'staff1';
  if (slot === 'offhand') kind = 'book';
  if (ARMOR_SLOTS.includes(slot) && !armor) armor = 'cloth';
  const g = GRADES[grade];
  const it = { uid: uid(), slot, kind, armor, grade, ilvl, enh: 0, dur: 100, int: 0, def: 0, affix: {}, set: null };
  const nameKey = kind || slot;
  if (armor && armor !== 'cloth' && slot === 'chest') it.name = OTHER_ARMOR[armor][grade];
  else it.name = (NAMES[nameKey] || ['장비'])[grade];
  if (ARMOR_SLOTS.includes(slot)) it.def = Math.round((3 + ilvl * 0.8) * g.mult);
  if (['necklace', 'ring', 'earring'].includes(slot)) it.int = Math.round((1 + ilvl * 0.45) * g.mult);
  if (kind) it.int = Math.round((3 + ilvl * 0.9) * g.mult * WEAPON_KINDS[kind].int);
  if (slot === 'belt') it.beltSlots = grade + 1;
  if (slot === 'bag') it.bagSlots = 6 + grade * 6;
  if (grade >= 2) {
    const n = grade === 2 ? 1 : 2;
    const keys = Object.keys(AFFIXES);
    for (let i = 0; i < n; i++) {
      const k = pick(keys);
      it.affix[k] = (it.affix[k] || 0) + AFFIXES[k].roll(grade) * rnd(0.7, 1.3) * (1 + ilvl / 40);
    }
  }
  if (ARMOR_SLOTS.includes(slot) && armor === 'cloth' && (o.set || (grade >= 2 && Math.random() < 0.3))) {
    it.set = o.set || pick(Object.keys(SETS));
    it.name = `${SETS[it.set].name}의 ${SLOTS[slot].name}`;
  }
  return it;
}
function rollGrade(ilvl) {
  const r = Math.random() * 100, b = Math.min(ilvl * 0.15, 8);
  if (r < 1.5 + b * 0.4) return 3;
  if (r < 8 + b) return 2;
  if (r < 35 + b) return 1;
  return 0;
}
function randomDrop(ilvl) {
  const slot = pick(['necklace', 'ring', 'earring', 'weapon', 'offhand', 'chest', 'chest', 'boots', 'gloves', 'hat', 'belt', 'bag']);
  let armor = null;
  if (slot === 'chest' || slot === 'boots' || slot === 'gloves' || slot === 'hat') armor = pick(['cloth', 'plate', 'leather', 'mail']);
  return makeItem({ slot, ilvl, armor });
}
function priestItem(ilvl, minGrade = 1) {
  const slot = pick(['necklace', 'ring', 'earring', 'weapon', 'offhand', 'chest', 'boots', 'gloves', 'hat', 'belt', 'bag']);
  return makeItem({ slot, ilvl, armor: 'cloth', grade: Math.max(minGrade, rollGrade(ilvl)) });
}
const enhMult = it => 1 + it.enh * 0.1;
const itemInt = it => Math.round(it.int * enhMult(it) * (it.dur <= 0 ? 0.3 : 1));
const itemDef = it => Math.round(it.def * enhMult(it) * (it.dur <= 0 ? 0.3 : 1));
const canWear = it => !it.armor || it.armor === 'cloth';
function itemValue(it) { return Math.round((10 + it.ilvl * 4) * GRADES[it.grade].mult * GRADES[it.grade].mult * (1 + it.enh * 0.3)); }
function itemLabel(it) {
  return `<span style="color:${GRADES[it.grade].color}">${it.enh ? '+' + it.enh + ' ' : ''}${it.name}</span>`;
}
function itemIcon(it) { return it.kind ? WEAPON_KINDS[it.kind].icon : SLOTS[it.slot].icon; }
function itemDesc(it) {
  const lines = [];
  const typ = it.kind ? WEAPON_KINDS[it.kind].name : SLOTS[it.slot].name;
  lines.push(`<b>${itemLabel(it)}</b>`);
  lines.push(`<small>${GRADES[it.grade].name} · ${typ}${it.armor ? ' · ' + ARMOR_NAMES[it.armor] : ''} · iLv${it.ilvl}</small>`);
  if (it.int) lines.push(`지능 +${itemInt(it)}`);
  if (it.def) lines.push(`방어력 +${itemDef(it)}`);
  if (it.beltSlots) lines.push(`벨트 칸 ${it.beltSlots}`);
  if (it.bagSlots) lines.push(`가방 칸 +${it.bagSlots}`);
  for (const k in it.affix) lines.push(`<span class="affix">${AFFIXES[k].name} ${AFFIXES[k].fmt(it.affix[k])}</span>`);
  if (it.set) {
    const n = setCount(it.set);
    lines.push(`<span class="set">[세트] ${SETS[it.set].name} (${n}/5)</span>`);
    for (const k in SETS[it.set].bonus) lines.push(`<small class="${n >= k ? 'set' : 'dim'}">${k}세트: ${SETS[it.set].bonus[k].text}</small>`);
  }
  lines.push(`<small class="dim">내구도 ${it.dur}/100</small>`);
  if (!canWear(it)) lines.push(`<small class="bad">사제는 착용 불가 (${ARMOR_NAMES[it.armor]})</small>`);
  return lines.join('<br>');
}
function setCount(set) { return ARMOR_SLOTS.filter(s => S.equip[s] && S.equip[s].set === set).length; }
function bagCap() { return 16 + (S.equip.bag ? S.equip.bag.bagSlots : 0); }
function addItem(it) {
  if (S.bag.length >= bagCap()) { toast('가방이 가득 찼습니다! 아이템을 잃었습니다: ' + it.name); return false; }
  S.bag.push(it); return true;
}
function addMat(id, n = 1) { S.mats[id] = (S.mats[id] || 0) + n; }
function addCons(id, n = 1) { S.cons[id] = (S.cons[id] || 0) + n; }

// ================= 캐릭터 계산 =================
const expNeed = l => Math.round(60 * Math.pow(l, 1.65));
function gainExp(n) {
  if (S.lvl >= MAX_LEVEL) return;
  S.exp += n;
  while (S.lvl < MAX_LEVEL && S.exp >= expNeed(S.lvl)) {
    S.exp -= expNeed(S.lvl); S.lvl++; S.statPts += 5;
    toast(`🎉 레벨 업! Lv.${S.lvl} (스탯 포인트 +5)`);
    for (const id in SKILLS) if (SKILLS[id].unlock === S.lvl) { S.skills[id] = 1; toast(`📘 새 스킬 개방: ${SKILLS[id].name}`); autoSlot(id); }
  }
}
function autoSlot(id) {
  if (id === 'ult') return;
  const i = S.loadout.indexOf(null);
  if (i >= 0) S.loadout[i] = id;
}
function fatiguePenalty() { return S.fatigue > 40 ? (S.fatigue - 40) * 0.6 : 0; } // %
function totalStats() {
  const t = {};
  for (const k of STAT_KEYS) t[k] = S.stats[k] + (S.engrave.stats[k] || 0) * 2;
  for (const s in S.equip) { const it = S.equip[s]; if (!it) continue; t.int += itemInt(it); t.def += itemDef(it); }
  if (S.guild) for (const k of STAT_KEYS) t[k] = Math.round(t[k] * (1 + S.guild.bonus / 100));
  const p = fatiguePenalty();
  for (const k of STAT_KEYS) t[k] = Math.round(t[k] * (1 - p / 100));
  return t;
}
function gearAffix(k) { let v = 0; for (const s in S.equip) { const it = S.equip[s]; if (it && it.affix[k] && it.dur > 0) v += it.affix[k]; } return v; }
function setBonuses() {
  const out = {};
  for (const id in SETS) {
    const n = setCount(id);
    for (const k in SETS[id].bonus) if (n >= k) for (const [bk, bv] of Object.entries(SETS[id].bonus[k])) if (bk !== 'text') out[bk] = (out[bk] || 0) + bv;
  }
  return out;
}
function healerDerived(run) {
  const t = totalStats(), sb = setBonuses();
  run = run || { healPct: 0, manaCostPct: 0, manaRegen: 0, castPct: 0, maxMana: 0, movePct: 0 };
  return {
    stats: t,
    maxHp: Math.round(120 + t.vit * 12 + S.lvl * 8),
    maxMana: Math.round(140 + t.int * 4 + gearAffix('maxMana') + run.maxMana),
    healMult: (1 + t.int * 0.03 + S.lvl * 0.04) * (1 + (gearAffix('healPower') + (sb.healPct || 0) + run.healPct) / 100),
    manaRegen: 2 + t.int * 0.04 + gearAffix('manaRegen') + (sb.manaRegen || 0) + run.manaRegen,
    castMult: 1 + (gearAffix('castSpeed') + (sb.castSpeed || 0) + run.castPct + t.agi * 0.2) / 100,
    manaCost: clamp(1 - (gearAffix('manaCost') + run.manaCostPct) / 100, 0.4, 1),
    move: 95 * (1 + (t.agi * 0.4 + gearAffix('moveSpeed') + run.movePct) / 100),
    armor: t.def,
    sb,
  };
}
function skillLvl(id) { return S.skills[id] || 0; }

// ================= 파티원 =================
function makeMember(cls, role, lvl) {
  const c = CLASSES[cls];
  role = role || pick(c.roles);
  return { uid: uid(), name: pick(RECRUIT_NAMES), cls, role, lvl, exp: 0, gear: rint(0, 2) };
}
function memberPower(m) {
  const g = 1 + (S.guild ? S.guild.bonus / 100 : 0) + (m.guildMember ? 0.1 : 0);
  const rm = { tank: [2.3, 0.55, 0.5], melee: [1.1, 1.25, 0.2], ranged: [0.85, 1.15, 0.12], healer: [1.0, 0.4, 0.15] }[m.role];
  const gearM = 1 + m.gear * 0.12;
  return {
    hp: Math.round((160 + m.lvl * 30) * rm[0] * g * gearM),
    atk: (9 + m.lvl * 2.8) * rm[1] * g * gearM,
    red: rm[2],
  };
}
function memberGainExp(n) {
  for (const m of S.party) {
    if (m.lvl >= MAX_LEVEL) continue;
    m.exp += n;
    while (m.lvl < MAX_LEVEL && m.exp >= expNeed(m.lvl)) { m.exp -= expNeed(m.lvl); m.lvl++; }
  }
}
function refreshRecruits(force) {
  const hour = Math.floor(Date.now() / 600000); // 10분마다 갱신
  if (!force && S.recruitTime === hour && S.recruits.length) return;
  S.recruitTime = hour;
  S.recruits = [];
  for (let i = 0; i < 6; i++) {
    const cls = pick(Object.keys(CLASSES));
    const m = makeMember(cls, null, clamp(S.lvl + rint(-3, 2), 1, MAX_LEVEL));
    m.cost = Math.round(50 + m.lvl * 30 * (1 + m.gear * 0.3));
    S.recruits.push(m);
  }
}

// ================= 퀘스트 =================
function questProgress(kind, n = 1, target) {
  S.counters[kind] = (S.counters[kind] || 0) + n;
  const bump = q => {
    if (q.done) return;
    if (q.kind === kind && (!q.target || q.target === target)) q.prog = Math.min(q.n, (q.prog || 0) + n);
  };
  S.quests.town.forEach(bump);
  S.quests.daily.list.forEach(bump);
}
function refreshTownQuests() {
  const slot = Math.floor(Date.now() / 1800000); // 30분마다 새 의뢰
  if (S.quests.townTime === slot && S.quests.town.length) return;
  const kept = S.quests.town.filter(q => q.accepted && !q.claimed);
  S.quests.town = kept;
  while (S.quests.town.length < 3) {
    const t = pick(TOWN_QUESTS);
    const n = Math.round(t.n * (1 + S.lvl / 20));
    S.quests.town.push({ id: uid(), giver: t.giver, text: t.text.replace('{n}', n), kind: t.kind, target: t.target, n, prog: 0, accepted: false });
  }
  S.quests.townTime = slot;
}
function refreshDaily() {
  if (S.quests.daily.date === todayKey()) return;
  const list = [];
  const pool = [...DAILY_QUESTS].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const d of pool) list.push({ id: uid(), text: d.text.replace('{n}', d.n), kind: d.kind, n: d.n, prog: 0 });
  S.quests.daily = { date: todayKey(), list };
}

// ================= 경매장 =================
function auctionListings() {
  const hour = Math.floor(Date.now() / 3600000);
  const seed = hour * 7919 + S.auction.offset * 104729;
  let x = seed % 2147483647;
  const rand = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < 8; i++) {
    const save = Math.random; Math.random = rand;
    const it = priestItem(clamp(S.lvl + 2, 1, 45), 1);
    Math.random = save;
    it.uid = `auc${hour}_${S.auction.offset}_${i}`;
    it.price = Math.round(itemValue(it) * (2.5 + rand()));
    out.push(it);
  }
  return { hour, items: out.filter(it => !S.auction.bought[it.uid]) };
}
function settleAuction() {
  const now = Date.now();
  S.auction.mine = S.auction.mine.filter(l => {
    if (now >= l.sellAt) { S.gold += l.price; toast(`🔨 경매장: ${l.item.name} 판매 완료! +${fmt(l.price)}G`); return false; }
    return true;
  });
}

// ================= UI 유틸 =================
const $ = sel => document.querySelector(sel);
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}
function openSheet(title, html) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  $('#sheet').classList.add('open');
}
function closeSheet() { $('#sheet').classList.remove('open'); G.cur = null; renderTop(); }
function popup(html, buttons) {
  $('#popup-body').innerHTML = html;
  const b = $('#popup-btns'); b.innerHTML = '';
  for (const [label, fn, cls] of buttons) {
    const btn = document.createElement('button'); btn.className = 'btn ' + (cls || ''); btn.innerHTML = label;
    btn.onclick = () => { $('#popup').classList.remove('open'); fn && fn(); };
    b.appendChild(btn);
  }
  $('#popup').classList.add('open');
}
function renderTop() {
  settleAuction();
  const d = healerDerived();
  $('#top').innerHTML = `
    <div class="tb-l"><b>Lv.${S.lvl}</b> <div class="xp"><i style="width:${S.lvl >= MAX_LEVEL ? 100 : S.exp / expNeed(S.lvl) * 100}%"></i></div></div>
    <div>💰 ${fmt(S.gold)}</div>
    <div title="피로도" class="${S.fatigue > 40 ? 'bad' : ''}">😪 ${Math.round(S.fatigue)}</div>
    <div>🏆 ${S.best}층</div>`;
  $('#town-info').innerHTML = `HP ${d.maxHp} · MP ${d.maxMana} · 지능 ${d.stats.int} · 방어 ${d.stats.def}${S.statPts ? ` · <b class="hot">스탯 포인트 ${S.statPts}</b>` : ''}${S.guild ? ` · 🏰 ${S.guild.name}` : ''}`;
  save();
}

// ================= 마을 건물 =================
const G = {
  cur: null,
  open(name) { G.cur = name; G['p_' + name](); },
  refresh() { if (G.cur) G['p_' + G.cur](); renderTop(); },

  // ---------- 캐릭터 ----------
  p_char() {
    const d = healerDerived(), t = d.stats;
    let html = `<div class="row-c"><div class="avatar big">${chibiSVG('#f5e17a', '✨', true)}</div>
      <div><b>힐러 Lv.${S.lvl}</b> (사제)<br><small>EXP ${fmt(S.exp)}/${fmt(expNeed(S.lvl))}</small><br>
      <small>치유 배율 x${d.healMult.toFixed(2)} · 마나회복 ${d.manaRegen.toFixed(1)}/s<br>캐스팅 x${d.castMult.toFixed(2)} · 마나소비 ${Math.round(d.manaCost * 100)}%</small></div></div>`;
    if (fatiguePenalty() > 0) html += `<div class="warn">피로 누적! 모든 능력치 -${fatiguePenalty().toFixed(0)}% (여관에서 휴식하세요)</div>`;
    html += `<h4>스탯 <small>남은 포인트: ${S.statPts}</small></h4><div class="stats">`;
    for (const k of STAT_KEYS) html += `<div class="stat"><span>${STAT_NAMES[k]}</span><b>${t[k]}</b><small>(기본 ${S.stats[k]})</small>${S.statPts ? `<button class="btn sm" onclick="G.addStat('${k}')">+</button>` : ''}</div>`;
    html += `</div><small class="dim">힘: 근접공격 · 방어력: 피해감소 · 민첩: 이동/시전속도 · 지구력: 피로 감소 · 지능: 힐량/마나 · 체력: HP</small>`;
    html += `<h4>장비</h4><div class="equip">`;
    for (const s in SLOTS) {
      const it = S.equip[s];
      html += `<div class="eslot" onclick="G.equipInfo('${s}')">${it ? `<span class="ic" style="border-color:${GRADES[it.grade].color}">${itemIcon(it)}</span><small>${itemLabel(it)}</small>` : `<span class="ic empty">${SLOTS[s].icon}</span><small class="dim">${SLOTS[s].name}</small>`}</div>`;
    }
    html += `</div>`;
    const sets = Object.keys(SETS).filter(id => setCount(id));
    for (const id of sets) html += `<div class="set">세트 ${SETS[id].name} ${setCount(id)}/5</div>`;
    html += `<h4>벨트 (자동 사용) <small>${S.equip.belt ? S.equip.belt.beltSlots : 0}칸</small></h4><div class="beltrow">`;
    const bs = S.equip.belt ? S.equip.belt.beltSlots : 0;
    for (let i = 0; i < 4; i++) {
      const c = S.belt[i];
      html += `<div class="bslot ${i >= bs ? 'locked' : ''}" onclick="${i < bs ? `G.beltPick(${i})` : ''}">${i >= bs ? '🔒' : c ? CONSUMABLES[c].icon + `<small>${S.cons[c] || 0}</small>` : '+'}</div>`;
    }
    html += `</div><small class="dim">HP 포션은 힐러 HP 40% 이하, 마나 포션은 마나 25% 이하, 정화수는 저주 시 자동 사용</small>`;
    html += G.bagHTML('equip');
    openSheet('🧝 캐릭터', html);
  },
  addStat(k) { if (S.statPts > 0) { S.statPts--; S.stats[k]++; G.refresh(); } },
  bagHTML(mode) {
    let html = `<h4>가방 <small>${S.bag.length}/${bagCap()}</small></h4><div class="bag">`;
    S.bag.forEach((it, i) => {
      html += `<div class="bitem ${canWear(it) ? '' : 'nowear'}" style="border-color:${GRADES[it.grade].color}" onclick="G.itemAct('${mode}',${i})">${itemIcon(it)}${it.enh ? `<i>+${it.enh}</i>` : ''}${it.set ? '<s>S</s>' : ''}</div>`;
    });
    html += `</div><div class="cons">`;
    for (const k in S.cons) if (S.cons[k]) html += `<span>${CONSUMABLES[k].icon}${CONSUMABLES[k].name} ×${S.cons[k]}</span>`;
    for (const k in S.mats) if (S.mats[k]) html += `<span>${MATERIALS[k].icon}${MATERIALS[k].name} ×${S.mats[k]}</span>`;
    return html + `</div>`;
  },
  equipInfo(s) {
    const it = S.equip[s];
    if (!it) return toast(`${SLOTS[s].name} 칸이 비어 있습니다`);
    popup(itemDesc(it), [['해제', () => { if (S.bag.length >= bagCap()) return toast('가방이 가득 찼습니다'); S.equip[s] = null; S.bag.push(it); G.refresh(); }], ['닫기']]);
  },
  beltPick(i) {
    const opts = Object.keys(CONSUMABLES).map(k => [`${CONSUMABLES[k].icon} ${CONSUMABLES[k].name} (${S.cons[k] || 0})`, () => { S.belt[i] = k; G.refresh(); }]);
    opts.push(['비우기', () => { S.belt[i] = null; G.refresh(); }], ['닫기']);
    popup('벨트에 등록할 소모품', opts);
  },
  itemAct(mode, i) {
    const it = S.bag[i];
    const btns = [];
    if (mode === 'equip' && canWear(it)) btns.push(['착용', () => G.equipItem(i), 'pri']);
    if (mode === 'sell') btns.push([`판매 (${fmt(itemValue(it))}G)`, () => { S.gold += itemValue(it); S.bag.splice(i, 1); G.refresh(); }, 'pri']);
    if (mode === 'smith') {
      btns.push([`강화 +${it.enh + 1}`, () => G.enhance(it)], ['수리', () => G.repair(it)], ['분해', () => G.dismantle(i)]);
    }
    if (mode === 'bank') btns.push(['은행에 맡기기', () => { if (S.bank.items.length >= 48) return toast('은행이 가득 찼습니다'); S.bank.items.push(S.bag.splice(i, 1)[0]); G.refresh(); }, 'pri']);
    if (mode === 'auction') btns.push(['경매 등록', () => G.listAuction(i), 'pri']);
    btns.push(['닫기']);
    const eq = S.equip[it.slot];
    popup(itemDesc(it) + (eq && mode === 'equip' ? `<hr><small>착용 중:</small><br>${itemDesc(eq)}` : ''), btns);
  },
  equipItem(i) {
    const it = S.bag[i];
    S.bag.splice(i, 1);
    const prev = S.equip[it.slot];
    if (prev) S.bag.push(prev);
    S.equip[it.slot] = it;
    if (it.kind === 'staff2' && S.equip.offhand) { S.bag.push(S.equip.offhand); S.equip.offhand = null; toast('양손 지팡이: 보조 장비를 해제했습니다'); }
    if (it.slot === 'offhand' && S.equip.weapon && S.equip.weapon.kind === 'staff2') { S.bag.push(S.equip.weapon); S.equip.weapon = null; toast('책을 들기 위해 양손 지팡이를 해제했습니다'); }
    if (it.slot === 'bag' && S.bag.length > bagCap()) toast('주의: 가방 공간이 부족합니다');
    G.refresh();
  },

  // ---------- 모험가 사무소 ----------
  p_office() {
    refreshRecruits(); refreshTownQuests(); refreshDaily();
    let html = `<div class="npc">🧑‍💼 <i>"어서 오세요, 힐러님! 파티를 꾸리고 의뢰도 받아 가세요."</i></div>`;
    html += `<h4>내 파티 (${S.party.length + 1}/5)</h4><div class="party-list">`;
    html += `<div class="pm me">${chibiSVG('#f5e17a', '✨')}<div><b>나</b><small>사제 · 힐러 · Lv.${S.lvl}</small></div></div>`;
    S.party.forEach((m, i) => {
      const p = memberPower(m);
      html += `<div class="pm">${chibiSVG(CLASSES[m.cls].color, CLASSES[m.cls].icon)}<div><b>${m.name}</b>${m.guildMember ? ' 🏰' : ''}<small>${CLASSES[m.cls].name} · ${ROLE_NAMES[m.role]} · Lv.${m.lvl}<br>HP ${p.hp} · 공격 ${Math.round(p.atk)}</small></div>
        <div class="col">${CLASSES[m.cls].roles.length > 1 ? `<button class="btn sm" onclick="G.swapRole(${i})">역할</button>` : ''}<button class="btn sm red" onclick="G.kick(${i})">방출</button></div></div>`;
    });
    html += `</div>`;
    html += `<h4>파티원 모집 <small>(10분마다 갱신)</small></h4><div class="party-list">`;
    S.recruits.forEach((m, i) => {
      html += `<div class="pm">${chibiSVG(CLASSES[m.cls].color, CLASSES[m.cls].icon)}<div><b>${m.name}</b><small>${CLASSES[m.cls].name} · ${ROLE_NAMES[m.role]} · Lv.${m.lvl} · 장비 ${'★'.repeat(m.gear + 1)}</small></div>
        <button class="btn sm pri" onclick="G.hire(${i})">${fmt(m.cost)}G</button></div>`;
    });
    html += `</div><button class="btn" onclick="G.joinParty()">🔎 기존 파티에 합류하기 (300G)</button>`;
    html += `<h4>📜 의뢰 게시판</h4>`;
    for (const q of S.quests.town) {
      html += `<div class="quest"><b>${q.giver}</b><br>${q.text}<div class="qbar"><i style="width:${(q.prog || 0) / q.n * 100}%"></i></div><small>${q.prog || 0}/${q.n}</small>
        ${!q.accepted ? `<button class="btn sm pri" onclick="G.acceptQ('${q.id}')">수락</button>` : q.prog >= q.n ? `<button class="btn sm gold" onclick="G.claimQ('${q.id}')">보상 받기</button>` : '<small class="dim"> 진행 중</small>'}</div>`;
    }
    html += `<h4>☀️ 일일 퀘스트 <small>(하루 3개)</small></h4>`;
    for (const q of S.quests.daily.list) {
      html += `<div class="quest">${q.text}<div class="qbar"><i style="width:${q.prog / q.n * 100}%"></i></div><small>${q.prog}/${q.n}</small>
        ${q.claimed ? '<small class="dim"> 완료</small>' : q.prog >= q.n ? `<button class="btn sm gold" onclick="G.claimDaily('${q.id}')">보상 받기</button>` : ''}</div>`;
    }
    const mq = MAIN_QUESTS[S.quests.main];
    html += `<h4>👑 메인 스토리</h4>`;
    html += mq ? `<div class="quest main"><b>${mq.title}</b><br><i>${mq.story}</i><br>목표: ${mq.floor}층 도달 (최고 ${S.best}층)
      ${S.best >= mq.floor ? `<button class="btn sm gold" onclick="G.claimMain()">보상 받기</button>` : ''}</div>` : `<div class="quest main">🌈 모든 메인 스토리를 완료했습니다. 세상에 평화가!</div>`;
    if (S.quests.hidden.length) {
      html += `<h4>❓ 히든 퀘스트</h4>`;
      for (const q of S.quests.hidden) html += `<div class="quest hidden"><b>${q.title}</b><br>${q.text} (최고 ${S.best}층)${S.best >= q.floor ? `<button class="btn sm gold" onclick="G.claimHidden('${q.id}')">보상 받기</button>` : ''}</div>`;
    }
    openSheet('🏢 모험가 사무소', html);
  },
  hire(i) {
    const m = S.recruits[i];
    if (S.party.length >= 4) return toast('파티가 가득 찼습니다 (최대 5인)');
    if (S.gold < m.cost) return toast('골드가 부족합니다');
    S.gold -= m.cost; delete m.cost; S.party.push(m); S.recruits.splice(i, 1);
    toast(`${m.name}(${CLASSES[m.cls].name}) 합류!`); G.refresh();
  },
  kick(i) { popup(`${S.party[i].name}을(를) 방출할까요?`, [['방출', () => { S.party.splice(i, 1); G.refresh(); }, 'red'], ['취소']]); },
  swapRole(i) { const m = S.party[i], r = CLASSES[m.cls].roles; m.role = r[(r.indexOf(m.role) + 1) % r.length]; G.refresh(); },
  joinParty() {
    if (S.gold < 300) return toast('골드가 부족합니다');
    const comps = [['warrior', 'tank'], ['hunter', 'ranged'], ['rogue', 'melee'], ['mage', 'ranged'], ['monk', 'tank'], ['spellblade', 'melee']];
    const tank = pick(comps.filter(c => c[1] === 'tank'));
    const others = comps.filter(c => c[1] !== 'tank').sort(() => Math.random() - 0.5).slice(0, 3);
    const party = [tank, ...others].map(([c, r]) => makeMember(c, r, clamp(S.lvl + rint(-1, 1), 1, MAX_LEVEL)));
    popup(`<b>힐러를 구하는 파티를 찾았습니다!</b><br>${party.map(m => `${CLASSES[m.cls].icon} ${m.name} ${CLASSES[m.cls].name}(${ROLE_NAMES[m.role]}) Lv.${m.lvl}`).join('<br>')}<br><small class="dim">현재 파티는 해산됩니다.</small>`,
      [['합류', () => { S.gold -= 300; S.party = party; G.refresh(); }, 'pri'], ['취소']]);
  },
  acceptQ(id) { const q = S.quests.town.find(q => q.id === id); q.accepted = true; q.prog = 0; G.refresh(); },
  claimQ(id) {
    const i = S.quests.town.findIndex(q => q.id === id), q = S.quests.town[i];
    const gold = 150 + S.lvl * 25; S.gold += gold; gainExp(40 + S.lvl * 15);
    const it = priestItem(S.lvl + 1, 1); addItem(it);
    if (Math.random() < 0.15) { addMat('resetTicket'); toast('🎫 경매장 리셋권 획득!'); }
    S.quests.town.splice(i, 1);
    popup(`의뢰 완료!<br>+${gold}G<br>보상: ${itemLabel(it)}`, [['확인']]); G.refresh();
  },
  claimDaily(id) {
    const q = S.quests.daily.list.find(q => q.id === id);
    q.claimed = true; const gold = 200 + S.lvl * 30; S.gold += gold; addMat('essence', 2);
    toast(`일일 퀘스트 완료! +${gold}G, 마력 정수 ×2`); G.refresh();
  },
  claimMain() {
    const mq = MAIN_QUESTS[S.quests.main];
    const it = priestItem(mq.floor + 2, mq.floor >= 20 ? 3 : 2);
    addItem(it); S.gold += mq.floor * 60; gainExp(mq.floor * 40);
    S.quests.main++;
    popup(`<b>${mq.title}</b> 완료!<br>+${mq.floor * 60}G<br>보상: ${itemLabel(it)}`, [['확인']]); G.refresh();
  },
  claimHidden(id) {
    const i = S.quests.hidden.findIndex(q => q.id === id), q = S.quests.hidden[i];
    const it = makeItem({ slot: pick(ARMOR_SLOTS), ilvl: q.floor + 5, grade: 3, armor: 'cloth', set: pick(Object.keys(SETS)) });
    addItem(it); S.quests.hidden.splice(i, 1);
    popup(`❓ 히든 퀘스트 <b>${q.title}</b> 완료!<br>전설 세트 장비: ${itemLabel(it)}`, [['확인']]); G.refresh();
  },

  // ---------- 길드 ----------
  p_guild() {
    let html = `<div class="npc">🏰 <i>"99층 정복은 혼자서는 불가능하지. 믿을 수 있는 동료를 모으게."</i></div>`;
    if (!S.guild) {
      html += `<h4>길드 가입</h4>`;
      GUILDS.forEach((g, i) => { html += `<div class="quest"><b>${g.name}</b> (Lv.${g.lvl})<br><small>${g.desc}<br>길드 보너스: 모든 능력치 +${g.bonus}%</small><button class="btn sm pri" onclick="G.joinGuild(${i})">가입</button></div>`; });
      html += `<h4>길드 창설</h4><div class="quest">나만의 길드를 만들어 고정 파티를 꾸리세요.<br><small>비용 1,000G · 시작 보너스 +3% (길드원이 늘수록 성장)</small><button class="btn sm gold" onclick="G.createGuild()">창설</button></div>`;
    } else {
      const g = S.guild;
      html += `<div class="quest main"><b>🏰 ${g.name}</b> ${g.own ? '(길드장)' : ''}<br>길드 보너스: 모든 능력치 +${g.bonus}% · 길드원 ${g.members.length}명</div>`;
      html += `<h4>길드원 <small>(파티 영입 무료 · 추가 능력치 +10%)</small></h4><div class="party-list">`;
      g.members.forEach((m, i) => {
        const inParty = S.party.some(p => p.uid === m.uid);
        html += `<div class="pm">${chibiSVG(CLASSES[m.cls].color, CLASSES[m.cls].icon)}<div><b>${m.name}</b><small>${CLASSES[m.cls].name} · ${ROLE_NAMES[m.role]} · Lv.${m.lvl}</small></div>
          ${inParty ? '<small class="dim">파티 중</small>' : `<button class="btn sm pri" onclick="G.guildToParty(${i})">파티 영입</button>`}</div>`;
      });
      html += `</div>`;
      if (g.own) html += `<button class="btn" onclick="G.guildRecruit()">📣 길드원 모집 (${fmt(200 + g.members.length * 150)}G)</button>
        <button class="btn" onclick="G.guildInvite()">🤝 현재 파티원을 길드에 가입시키기</button>`;
      html += `<button class="btn red" onclick="G.leaveGuild()">길드 탈퇴</button>`;
    }
    openSheet('🏰 길드', html);
  },
  joinGuild(i) {
    const g = GUILDS[i];
    if (g.req && S.lvl < g.req) return toast(`Lv.${g.req} 이상만 가입 가능합니다`);
    const members = [];
    for (let k = 0; k < 6; k++) { const m = makeMember(pick(Object.keys(CLASSES)), null, clamp(S.lvl + rint(0, 4), 1, MAX_LEVEL)); m.guildMember = true; m.gear = 2; members.push(m); }
    S.guild = { name: g.name, bonus: g.bonus, own: false, members };
    toast(`🏰 ${g.name} 길드에 가입했습니다!`); G.refresh();
  },
  createGuild() {
    if (S.gold < 1000) return toast('골드가 부족합니다 (1,000G)');
    const name = prompt('길드 이름을 입력하세요', '모두의 힐러단');
    if (!name) return;
    S.gold -= 1000; S.guild = { name: name.slice(0, 12), bonus: 3, own: true, members: [] };
    toast('🏰 길드 창설!'); G.refresh();
  },
  guildRecruit() {
    const g = S.guild, cost = 200 + g.members.length * 150;
    if (g.members.length >= 12) return toast('길드원이 가득 찼습니다 (12명)');
    if (S.gold < cost) return toast('골드가 부족합니다');
    S.gold -= cost;
    const m = makeMember(pick(Object.keys(CLASSES)), null, clamp(S.lvl + rint(-1, 3), 1, MAX_LEVEL)); m.guildMember = true; m.gear = rint(1, 2);
    g.members.push(m); g.bonus = Math.min(20, 3 + g.members.length);
    toast(`${m.name}(${CLASSES[m.cls].name}) 길드 가입!`); G.refresh();
  },
  guildInvite() {
    const g = S.guild; let n = 0;
    for (const m of S.party) if (!m.guildMember && g.members.length < 12) { m.guildMember = true; g.members.push(m); n++; }
    g.bonus = Math.min(20, 3 + g.members.length);
    toast(n ? `파티원 ${n}명이 길드에 가입했습니다` : '가입시킬 파티원이 없습니다'); G.refresh();
  },
  guildToParty(i) {
    if (S.party.length >= 4) return toast('파티가 가득 찼습니다');
    S.party.push(S.guild.members[i]); G.refresh();
  },
  leaveGuild() {
    popup('정말 길드를 탈퇴할까요?', [['탈퇴', () => { S.party = S.party.filter(m => !m.guildMember); S.guild = null; G.refresh(); }, 'red'], ['취소']]);
  },

  // ---------- 대장간 ----------
  p_smith() {
    let html = `<div class="npc">⚒️ <i>"장비가 상했군. 고치든 부수든 강화하든 말만 하게!"</i></div>`;
    const broken = Object.values(S.equip).filter(it => it && it.dur < 100);
    const cost = broken.reduce((a, it) => a + Math.ceil((100 - it.dur) * (1 + it.ilvl * 0.1)), 0);
    html += `<button class="btn" onclick="G.repairAll()">🔧 착용 장비 전체 수리 (${fmt(cost)}G)</button>`;
    html += `<h4>조합</h4><div class="quest">같은 등급 장비 3개 → 상위 등급 장비 1개 (무작위 부위)<br>`;
    for (let g = 0; g < 3; g++) { const n = S.bag.filter(it => it.grade === g).length; html += `<button class="btn sm" onclick="G.craft(${g})">${GRADES[g].name} 3개 조합 (${n}/3) · ${(g + 1) * 150}G</button> `; }
    html += `</div><h4>재료 제작</h4><div class="quest"><button class="btn sm" onclick="G.makeMat('essence')">🔹 마력 정수 (천 조각 5 + 철광석 2)</button> <button class="btn sm" onclick="G.makeMat('holy')">💎 성스러운 결정 (마력 정수 5)</button></div>`;
    html += `<small class="dim">강화: +1~+5 철광석, +6~+10 마력 정수/성스러운 결정 필요. +6부터 실패 가능.</small>`;
    html += G.bagHTML('smith');
    html += `<h4>착용 장비 강화</h4><div class="bag">`;
    for (const s in S.equip) { const it = S.equip[s]; if (it) html += `<div class="bitem" style="border-color:${GRADES[it.grade].color}" onclick="G.enhanceEquipped('${s}')">${itemIcon(it)}${it.enh ? `<i>+${it.enh}</i>` : ''}</div>`; }
    html += `</div>`;
    openSheet('⚒️ 대장간', html);
  },
  enhanceEquipped(s) { const it = S.equip[s]; popup(itemDesc(it), [[`강화 +${it.enh + 1}`, () => G.enhance(it), 'pri'], ['수리', () => G.repair(it)], ['닫기']]); },
  enhance(it) {
    if (it.enh >= 10) return toast('최대 강화입니다');
    const n = it.enh + 1, gold = Math.round(50 * n * n * (1 + it.grade));
    const mat = n <= 5 ? 'ore' : n <= 8 ? 'essence' : 'holy', mn = n <= 5 ? n : n <= 8 ? n - 5 : n - 8;
    if (S.gold < gold || (S.mats[mat] || 0) < mn) return toast(`필요: ${fmt(gold)}G + ${MATERIALS[mat].name} ×${mn}`);
    S.gold -= gold; S.mats[mat] -= mn;
    const rate = n <= 5 ? 1 : 1 - (n - 5) * 0.13;
    if (Math.random() < rate) { it.enh++; toast(`✨ 강화 성공! +${it.enh}`); }
    else toast(`💥 강화 실패... (성공률 ${Math.round(rate * 100)}%)`);
    G.refresh();
  },
  repair(it) {
    const c = Math.ceil((100 - it.dur) * (1 + it.ilvl * 0.1));
    if (S.gold < c) return toast('골드가 부족합니다');
    S.gold -= c; it.dur = 100; toast('수리 완료'); G.refresh();
  },
  repairAll() {
    for (const it of Object.values(S.equip)) if (it && it.dur < 100) { const c = Math.ceil((100 - it.dur) * (1 + it.ilvl * 0.1)); if (S.gold >= c) { S.gold -= c; it.dur = 100; } }
    toast('🔧 수리 완료'); G.refresh();
  },
  dismantle(i) {
    const it = S.bag.splice(i, 1)[0];
    addMat('scrap', rint(1, 3) + it.grade); addMat('ore', rint(0, 2) + it.grade);
    if (it.grade >= 2) addMat('essence', it.grade - 1);
    if (it.grade >= 3) addMat('holy', 1);
    toast(`분해: ${it.name} → 재료 획득`); G.refresh();
  },
  craft(g) {
    const idx = S.bag.map((it, i) => it.grade === g ? i : -1).filter(i => i >= 0).slice(0, 3);
    if (idx.length < 3) return toast('재료 장비가 부족합니다');
    const cost = (g + 1) * 150; if (S.gold < cost) return toast('골드가 부족합니다');
    const ilvl = Math.max(...idx.map(i => S.bag[i].ilvl));
    S.gold -= cost; S.bag = S.bag.filter((_, i) => !idx.includes(i));
    const it = priestItem(ilvl, g + 1); it.grade = g + 1;
    const fresh = makeItem({ slot: it.slot, kind: it.kind, ilvl, grade: g + 1, armor: 'cloth' });
    S.bag.push(fresh);
    popup(`조합 성공!<br>${itemDesc(fresh)}`, [['확인']]); G.refresh();
  },
  makeMat(id) {
    if (id === 'essence') { if ((S.mats.scrap || 0) < 5 || (S.mats.ore || 0) < 2) return toast('재료 부족'); S.mats.scrap -= 5; S.mats.ore -= 2; }
    else { if ((S.mats.essence || 0) < 5) return toast('재료 부족'); S.mats.essence -= 5; }
    addMat(id); toast(`${MATERIALS[id].name} 제작!`); G.refresh();
  },

  // ---------- 여관 ----------
  p_inn() {
    let html = `<div class="npc">🍺 <i>"탑에서 고생 많았지? 따뜻한 밥 먹고 푹 쉬어가."</i></div>`;
    html += `<div class="quest">현재 피로도: <b class="${S.fatigue > 40 ? 'bad' : ''}">${Math.round(S.fatigue)}/100</b><div class="qbar fat"><i style="width:${S.fatigue}%"></i></div><small>피로도 40 초과 시 모든 능력치가 % 단위로 하락합니다. 지구력이 높을수록 피로가 덜 쌓입니다.</small></div>`;
    const foods = [['🍞 빵과 우유', 30, 10], ['🍲 버섯 스튜', 80, 25], ['🍖 여관 특선 정식', 180, 45]];
    foods.forEach(([n, c, f], i) => { html += `<button class="btn" onclick="G.eat(${i})">${n} — ${c}G (피로 -${f})</button>`; });
    html += `<button class="btn pri" onclick="G.sleep()">🛏️ 하룻밤 숙박 — ${fmt(100 + S.lvl * 10)}G (피로 완전 회복)</button>`;
    G._foods = foods;
    openSheet('🏨 여관', html);
  },
  eat(i) { const [n, c, f] = G._foods[i]; if (S.gold < c) return toast('골드가 부족합니다'); S.gold -= c; S.fatigue = Math.max(0, S.fatigue - f); toast(`${n} 냠냠!`); G.refresh(); },
  sleep() { const c = 100 + S.lvl * 10; if (S.gold < c) return toast('골드가 부족합니다'); S.gold -= c; S.fatigue = 0; toast('😴 푹 잤다! 피로가 모두 풀렸습니다'); G.refresh(); },

  // ---------- 상인 ----------
  p_shop() {
    let html = `<div class="npc">🛒 <i>"포션 필요해? 잡동사니는 내가 사줄게!"</i></div><h4>구매</h4>`;
    for (const k in CONSUMABLES) html += `<div class="shoprow"><span>${CONSUMABLES[k].icon} ${CONSUMABLES[k].name}<small> ${CONSUMABLES[k].desc} (보유 ${S.cons[k] || 0})</small></span><button class="btn sm" onclick="G.buy('${k}',1)">${CONSUMABLES[k].price}G</button><button class="btn sm" onclick="G.buy('${k}',5)">×5</button></div>`;
    for (const k of ['scrap', 'ore', 'essence']) html += `<div class="shoprow"><span>${MATERIALS[k].icon} ${MATERIALS[k].name}<small> (보유 ${S.mats[k] || 0})</small></span><button class="btn sm" onclick="G.buyMat('${k}')">${MATERIALS[k].price * 2}G</button></div>`;
    const junk = S.mats.junk || 0;
    html += `<h4>판매</h4><button class="btn" onclick="G.sellJunk()">🦴 몬스터 전리품 ×${junk} 모두 판매 (${fmt(junk * MATERIALS.junk.price)}G)</button>
      <button class="btn" onclick="G.sellUnwearable()">👕 착용 불가 장비 모두 판매</button>`;
    html += G.bagHTML('sell');
    openSheet('🛒 상인', html);
  },
  buy(k, n) { const c = CONSUMABLES[k].price * n; if (S.gold < c) return toast('골드가 부족합니다'); S.gold -= c; addCons(k, n); G.refresh(); },
  buyMat(k) { const c = MATERIALS[k].price * 2; if (S.gold < c) return toast('골드가 부족합니다'); S.gold -= c; addMat(k); G.refresh(); },
  sellJunk() { const n = S.mats.junk || 0; S.gold += n * MATERIALS.junk.price; S.mats.junk = 0; G.refresh(); },
  sellUnwearable() { let g = 0; S.bag = S.bag.filter(it => { if (!canWear(it)) { g += itemValue(it); return false; } return true; }); S.gold += g; toast(`+${fmt(g)}G`); G.refresh(); },

  // ---------- 경매장 ----------
  p_auction() {
    const { hour, items } = auctionListings();
    const left = 60 - new Date().getMinutes();
    let html = `<div class="npc">🔨 <i>"매 정시마다 새 물건이 올라옵니다!"</i> <small>(갱신까지 ${left}분)</small></div>`;
    html += `<button class="btn" onclick="G.resetAuction()">🎫 리셋권 사용 (보유 ${S.mats.resetTicket || 0}) / 💎 유료 구매</button>`;
    html += `<h4>판매 목록</h4>`;
    items.forEach((it, i) => { html += `<div class="shoprow" onclick="G.aucView(${i})"><span><span class="ic sm" style="border-color:${GRADES[it.grade].color}">${itemIcon(it)}</span> ${itemLabel(it)}</span><button class="btn sm">${fmt(it.price)}G</button></div>`; });
    if (!items.length) html += `<small class="dim">모두 팔렸습니다. 다음 정시를 기다리세요.</small>`;
    G._auc = items;
    html += `<h4>내 등록 물품</h4>`;
    for (const l of S.auction.mine) html += `<div class="shoprow"><span>${itemLabel(l.item)}</span><small>${fmt(l.price)}G · 판매 대기 중</small></div>`;
    html += `<small class="dim">가방의 장비를 눌러 경매에 등록하세요. 판매되면 골드가 자동 입금됩니다.</small>`;
    html += G.bagHTML('auction');
    openSheet('🔨 경매장', html);
  },
  aucView(i) {
    const it = G._auc[i];
    popup(itemDesc(it), [[`구매 ${fmt(it.price)}G`, () => {
      if (S.gold < it.price) return toast('골드가 부족합니다');
      if (S.bag.length >= bagCap()) return toast('가방이 가득 찼습니다');
      S.gold -= it.price; S.auction.bought[it.uid] = 1;
      const copy = { ...it, uid: uid() }; delete copy.price; S.bag.push(copy); G.refresh();
    }, 'pri'], ['닫기']]);
  },
  resetAuction() {
    const doReset = () => { S.auction.offset++; S.auction.bought = {}; G.refresh(); };
    if ((S.mats.resetTicket || 0) > 0) { S.mats.resetTicket--; doReset(); return; }
    popup('경매장 리셋권이 없습니다.<br><small>유료 상점은 데모 버전에서 골드(500G)로 대체됩니다.</small>', [['500G로 구매/사용', () => { if (S.gold < 500) return toast('골드가 부족합니다'); S.gold -= 500; doReset(); }, 'gold'], ['닫기']]);
  },
  listAuction(i) {
    const it = S.bag[i], base = itemValue(it);
    popup(`${itemDesc(it)}<hr>희망가를 선택하세요 (비쌀수록 오래 걸림)`, [1.5, 2.5, 4].map(m => [`${fmt(base * m)}G`, () => {
      S.bag.splice(i, 1);
      S.auction.mine.push({ item: it, price: Math.round(base * m), sellAt: Date.now() + m * rnd(3, 12) * 60000 });
      toast('경매장에 등록했습니다'); G.refresh();
    }]).concat([['취소']]));
  },

  // ---------- 은행 ----------
  p_bank() {
    let html = `<div class="npc">🏦 <i>"소중한 물건은 저희가 안전하게 보관합니다."</i></div>`;
    html += `<div class="quest">보관 골드: <b>${fmt(S.bank.gold)}G</b><br>
      <button class="btn sm" onclick="G.bankGold(1)">전액 입금</button> <button class="btn sm" onclick="G.bankGold(-1)">전액 출금</button><br><small class="dim">탑에서 전멸하면 소지금의 20%를 잃습니다. 은행에 맡기면 안전합니다.</small></div>`;
    html += `<h4>보관함 <small>${S.bank.items.length}/48</small></h4><div class="bag">`;
    S.bank.items.forEach((it, i) => { html += `<div class="bitem" style="border-color:${GRADES[it.grade].color}" onclick="G.bankOut(${i})">${itemIcon(it)}${it.enh ? `<i>+${it.enh}</i>` : ''}</div>`; });
    html += `</div>`;
    html += G.bagHTML('bank');
    openSheet('🏦 은행', html);
  },
  bankGold(d) { if (d > 0) { S.bank.gold += S.gold; S.gold = 0; } else { S.gold += S.bank.gold; S.bank.gold = 0; } G.refresh(); },
  bankOut(i) {
    const it = S.bank.items[i];
    popup(itemDesc(it), [['꺼내기', () => { if (S.bag.length >= bagCap()) return toast('가방이 가득 찼습니다'); S.bag.push(S.bank.items.splice(i, 1)[0]); G.refresh(); }, 'pri'], ['닫기']]);
  },

  // ---------- 각인사 ----------
  p_engrave() {
    let html = `<div class="npc">🖋️ <i>"몸에 새긴 주문은 영원하지. 대가는 비싸지만."</i></div><h4>능력치 각인 <small>(1회당 스탯 +2)</small></h4><div class="stats">`;
    for (const k of ENGRAVES_STAT) {
      const n = S.engrave.stats[k] || 0, c = 200 + n * n * 80;
      html += `<div class="stat"><span>${STAT_NAMES[k]}</span><b>+${n * 2}</b><button class="btn sm" onclick="G.engraveStat('${k}')">${fmt(c)}G</button></div>`;
    }
    html += `</div><h4>특수 각인 <small>(최대 2개)</small></h4>`;
    for (const sp of ENGRAVES_SPECIAL) {
      const has = S.engrave.special.includes(sp.id);
      html += `<div class="shoprow"><span><b>${sp.name}</b><small> ${sp.desc}</small></span>${has ? '<button class="btn sm red" onclick="G.unengrave(\'' + sp.id + '\')">지우기</button>' : `<button class="btn sm pri" onclick="G.engraveSp('${sp.id}')">3,000G + 💎1</button>`}</div>`;
    }
    openSheet('🖋️ 각인사', html);
  },
  engraveStat(k) { const n = S.engrave.stats[k] || 0, c = 200 + n * n * 80; if (S.gold < c) return toast('골드가 부족합니다'); S.gold -= c; S.engrave.stats[k] = n + 1; toast(`${STAT_NAMES[k]} 각인 완료!`); G.refresh(); },
  engraveSp(id) {
    if (S.engrave.special.length >= 2) return toast('특수 각인은 최대 2개입니다');
    if (S.gold < 3000 || (S.mats.holy || 0) < 1) return toast('필요: 3,000G + 성스러운 결정 1');
    S.gold -= 3000; S.mats.holy--; S.engrave.special.push(id); toast('✨ 특수 각인 완료!'); G.refresh();
  },
  unengrave(id) { S.engrave.special = S.engrave.special.filter(x => x !== id); G.refresh(); },

  // ---------- 신전 ----------
  p_temple() {
    let html = `<div class="npc">⛪ <i>"빛의 가르침을 더 깊이 익히겠느냐?"</i></div>`;
    html += `<h4>전투 스킬 배치 <small>(${SKILL_SLOTS}칸 · 필살기는 고정)</small></h4><div class="loadout">`;
    S.loadout.forEach((id, i) => { html += `<div class="lslot" onclick="G.slotPick(${i})">${id ? SKILLS[id].icon + `<small>${SKILLS[id].name}</small>` : '<small class="dim">비어 있음</small>'}</div>`; });
    html += `</div><h4>스킬 레벨업 <small>(레벨당 효과 +12%, 최대 10)</small></h4>`;
    for (const id in SKILLS) {
      const sk = SKILLS[id], l = skillLvl(id);
      const c = Math.round(100 * Math.pow(l + 1, 1.8));
      html += `<div class="shoprow ${l ? '' : 'locked'}"><span>${sk.icon} <b>${sk.name}</b> ${l ? 'Lv.' + l : `<small class="dim">(Lv.${sk.unlock}에 개방)</small>`}<br><small>${sk.desc}${sk.mana ? ` · 마나 ${sk.mana}` : ''}${sk.cast ? ` · 시전 ${sk.cast}s` : ' · 즉시'}${sk.cd ? ` · 쿨 ${sk.cd}s` : ''}</small></span>
        ${l && l < 10 ? `<button class="btn sm pri" onclick="G.skillUp('${id}')">${fmt(c)}G</button>` : ''}</div>`;
    }
    openSheet('⛪ 신전', html);
  },
  skillUp(id) { const l = skillLvl(id), c = Math.round(100 * Math.pow(l + 1, 1.8)); if (S.gold < c) return toast('골드가 부족합니다'); S.gold -= c; S.skills[id] = l + 1; toast(`${SKILLS[id].name} Lv.${l + 1}!`); G.refresh(); },
  slotPick(i) {
    const opts = Object.keys(S.skills).filter(id => id !== 'ult' && !S.loadout.includes(id)).map(id => [`${SKILLS[id].icon} ${SKILLS[id].name}`, () => { S.loadout[i] = id; G.refresh(); }]);
    opts.push(['비우기', () => { S.loadout[i] = null; G.refresh(); }], ['닫기']);
    popup('이 칸에 배치할 스킬', opts);
  },

  // ---------- 탑 ----------
  p_tower() {
    const cps = [1]; for (let f = 10; f <= S.best; f += 10) cps.push(f + 1);
    const tank = S.party.some(m => m.role === 'tank');
    let html = `<div class="npc">🗼 <i>끝을 알 수 없는 탑. 최고 기록: <b>${S.best}층</b></i></div>`;
    html += `<div class="quest">파티: 나 + ${S.party.map(m => CLASSES[m.cls].icon + m.name).join(', ') || '(없음)'}${!tank ? '<br><span class="bad">⚠️ 탱커가 없습니다! 몬스터가 힐러를 노립니다.</span>' : ''}${fatiguePenalty() ? `<br><span class="bad">😪 피로 페널티 -${fatiguePenalty().toFixed(0)}%</span>` : ''}</div>`;
    html += `<h4>출발 층 선택</h4><div class="cps">`;
    for (const f of cps) html += `<button class="btn pri" onclick="startRun(${f})">${f}층부터</button>`;
    html += `</div><small class="dim">로그라이크: 매 층마다 축복을 골라 강해지며 오를 수 있는 데까지 오르세요. 층 사이에 귀환하면 전리품을 모두 가져갑니다. 전멸 시 이번 도전 골드 절반과 소지금 20%를 잃습니다.</small>`;
    html += `<h4>조작법</h4><small>• 화면을 드래그하면 힐러가 이동합니다 (이동 중엔 캐스팅 취소)<br>• 하단 파티 프레임을 눌러 대상을 선택하고 스킬을 누르세요<br>• 바닥에 빨간 범위가 차오르면 피하세요!</small>`;
    openSheet('🗼 탑 입장', html);
  },
};

// ================= 귀여운 캐릭터 SVG =================
function chibiSVG(color, icon, big) {
  return `<svg viewBox="0 0 40 44" class="chibi${big ? ' big' : ''}"><ellipse cx="20" cy="40" rx="12" ry="3" fill="#0003"/>
    <rect x="9" y="22" width="22" height="17" rx="8" fill="${color}"/><circle cx="20" cy="16" r="13" fill="#ffe0c4"/>
    <path d="M7 15 Q20 -2 33 15 Q27 8 20 9 Q13 8 7 15Z" fill="${color}"/>
    <circle cx="15" cy="18" r="2" fill="#333"/><circle cx="25" cy="18" r="2" fill="#333"/>
    <circle cx="12" cy="22" r="2" fill="#ff9aa2" opacity=".7"/><circle cx="28" cy="22" r="2" fill="#ff9aa2" opacity=".7"/>
    <path d="M18 23 Q20 25 22 23" stroke="#333" fill="none" stroke-width="1.2"/>
    <text x="30" y="36" font-size="11">${icon}</text></svg>`;
}

// ================= 시작 =================
function showTown() {
  $('#town').style.display = 'flex';
  $('#battle').style.display = 'none';
  renderTop();
}
window.addEventListener('load', () => {
  showTown();
  if (S.tutorial) {
    S.tutorial = false;
    popup(`<b>✨ 모두의 힐러에 오신 것을 환영합니다!</b><br><br>당신은 파티의 유일한 희망, <b>힐러</b>입니다.<br>탱커가 적을 붙잡고 딜러가 공격하는 동안 동료들의 HP를 지켜주세요.<br><br>목표: 끝없는 탑의 <b>99층</b>을 정복해 세상에 평화를!<br><br><small>시작 파티: 전사(탱커) · 도적 · 마법사가 함께합니다.<br>먼저 🗼 <b>탑</b>에 도전해 보세요.</small>`, [['시작하기', null, 'pri']]);
  }
});
