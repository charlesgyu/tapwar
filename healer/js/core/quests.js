// 퀘스트 엔진 — DESIGN.md §7. Events 구독으로 목표를 진행하고, 수주/완료/보상/일일 리셋/히든 자동 수주/챕터 진행을 담당한다.
// 보상 지급은 Inventory/Level/Items 가 있으면 사용하고, 없으면(테스트·부분 로드) 골드/XP 만 직접 더한다.
const Quests = (() => {
  const DAILY_COUNT = 3;
  const ARMOR_SLOTS = ['body', 'boots', 'gloves', 'hat', 'belt'];
  const EVENT_NAMES = ['monster_killed', 'boss_killed', 'chest_opened', 'item_gained', 'npc_talk', 'facility_visit', 'floor_cleared', 'steps', 'heal_done'];
  let unsubs = [];
  let boundG = null; // 테스트/수동 바인딩용. 없으면 State.get()

  function currentG() { return boundG || (typeof State !== 'undefined' ? State.get() : null); }
  function bind(G) { boundG = G || null; }
  function emit(name, payload) { if (typeof Events !== 'undefined') Events.emit(name, payload); }
  function def(id) { return (typeof QuestData !== 'undefined') ? QuestData.get(id) : null; }

  // 저장 데이터가 옛 버전이어도 필드가 있도록 보강
  function Q(G) {
    const q = G.quests || (G.quests = {});
    q.active = q.active || []; q.completed = q.completed || []; q.hiddenFound = q.hiddenFound || [];
    q.daily = q.daily || { day: 0, offered: [], done: [] };
    q.daily.offered = q.daily.offered || []; q.daily.done = q.daily.done || [];
    G.story = G.story || { chapter: 1, flags: {} }; G.story.flags = G.story.flags || {};
    G.tower = G.tower || { highestCleared: 0, records: {} };
    return q;
  }

  // ---- 상태 조회 ----
  function need(obj) { return obj.count || obj.amount || 1; }
  function isDone(G, id) { const q = Q(G); return q.completed.includes(id) || q.daily.done.includes(id); }
  function entryOf(G, id) { return Q(G).active.find((a) => a.id === id) || null; }
  function isActive(G, id) { return !!entryOf(G, id); }

  function requirementsMet(G, d) {
    const r = d.requires || {};
    if (r.quest && !isDone(G, r.quest)) return false;
    if (r.floor && ((G.tower.highestCleared || 0) + 1) < r.floor) return false; // 그 층에 들어갈 수 있어야 한다
    if (r.level && (G.player.level || 1) < r.level) return false;
    if (d.type === 'main' && d.chapter > (G.story.chapter || 1)) return false;
    return true;
  }
  function status(G, id) {
    const d = def(id); if (!d) return 'unknown';
    if (isDone(G, id)) return 'completed';
    if (isActive(G, id)) return canComplete(G, id) ? 'completable' : 'active';
    return requirementsMet(G, d) ? 'available' : 'locked';
  }

  function available(G, npcId) {
    const q = Q(G);
    dailyRefresh(G);
    const out = [];
    for (const d of QuestData.all()) {
      if (d.type === 'hidden') continue; // 두루마리로만 수주
      if (npcId && d.giver !== npcId) continue;
      if (isActive(G, d.id) || isDone(G, d.id)) continue;
      if (d.type === 'daily' && !q.daily.offered.includes(d.id)) continue;
      if (!requirementsMet(G, d)) continue;
      out.push(d);
    }
    return out;
  }

  // ---- 수주 ----
  function inventoryCount(G, itemId) {
    if (typeof Inventory === 'undefined' || !Inventory.count) return null;
    try { return Inventory.count(G, itemId) | 0; } catch (e) { return null; }
  }
  // 이미 달성된 목표(찾은 숨겨진 상자, 가방에 있는 재료)는 수주 즉시 반영한다
  function prefill(G, entry, d) {
    d.objectives.forEach((obj, i) => {
      if (obj.type === 'chest' && obj.chestId && Q(G).hiddenFound.includes(obj.chestId)) entry.progress[i] = need(obj);
      if (obj.type === 'collect') { const c = inventoryCount(G, obj.item); if (c !== null) entry.progress[i] = Math.min(need(obj), c); }
    });
  }
  function accept(G, id, opts) {
    const d = def(id); if (!d) return false;
    const q = Q(G);
    if (isActive(G, id) || isDone(G, id)) return false;
    const force = !!(opts && opts.force);
    if (!force) {
      if (d.type === 'hidden') return false;
      if (d.type === 'daily' && !q.daily.offered.includes(id)) return false;
      if (!requirementsMet(G, d)) return false;
    }
    const entry = { id, progress: {}, acceptedDay: G.day || 1 };
    prefill(G, entry, d);
    q.active.push(entry);
    emit('quest_accepted', { id, type: d.type });
    if (allDone(entry, d)) emit('quest_completable', { id });
    return true;
  }
  function abandon(G, id) {
    const q = Q(G); const i = q.active.findIndex((a) => a.id === id);
    if (i < 0) return false;
    const d = def(id); if (d && d.type === 'main') return false; // 메인은 포기 불가
    q.active.splice(i, 1); emit('quest_abandoned', { id }); return true;
  }
  // 두루마리 아이템 획득 → 히든 퀘스트 자동 수주
  function acceptHiddenByScroll(G, itemId) {
    const qid = QuestData.questForScroll(itemId) || (def(itemId) && def(itemId).type === 'hidden' ? itemId : null);
    if (!qid) return false;
    return accept(G, qid, { force: true });
  }

  // ---- 진행 ----
  function matchKill(obj, p) {
    if (obj.floor && p.floor !== obj.floor) return false;
    const t = obj.target;
    if (!t || t === 'any' || t === '*') return true;
    return p.id === t || p.family === t || (Array.isArray(p.tags) && p.tags.includes(t));
  }
  // 이벤트 하나가 목표 하나를 얼마나 진행시키는지. collect 는 가방 수량과 동기화하므로 null(=재계산) 을 돌려준다
  function increment(obj, name, p, G) {
    p = p || {};
    switch (obj.type) {
      case 'kill': return name === 'monster_killed' && matchKill(obj, p) ? 1 : 0;
      case 'kill_boss': return name === 'boss_killed' && (!obj.floor || p.floor === obj.floor) ? 1 : 0;
      case 'chest': return name === 'chest_opened' && (!obj.floor || p.floor === obj.floor) && (!obj.chestId || p.chestId === obj.chestId) && (!obj.hidden || p.hidden) ? 1 : 0;
      case 'talk': return name === 'npc_talk' && p.npcId === obj.npc ? 1 : 0;
      case 'visit': return name === 'facility_visit' && p.id === obj.facility ? 1 : 0;
      case 'clear_floor': return name === 'floor_cleared' && (!obj.floor || p.floor === obj.floor) ? 1 : 0;
      case 'steps': return name === 'steps' ? (p.n | 0) : 0;
      case 'heal': return name === 'heal_done' ? Math.max(0, p.amount | 0) : 0;
      case 'collect': {
        if (name !== 'item_gained' || p.id !== obj.item) return 0;
        const c = inventoryCount(G, obj.item);
        return c === null ? (p.qty || 1) : null;
      }
      default: return 0;
    }
  }
  function allDone(entry, d) { return d.objectives.every((obj, i) => (entry.progress[i] || 0) >= need(obj)); }

  function handle(name, payload) {
    const G = currentG(); if (!G) return;
    const q = Q(G);
    if (name === 'item_gained' && payload && payload.id) acceptHiddenByScroll(G, payload.id);
    if (name === 'chest_opened' && payload) {
      if (payload.hidden && payload.chestId && !q.hiddenFound.includes(payload.chestId)) q.hiddenFound.push(payload.chestId);
      if (payload.questScroll) accept(G, payload.questScroll, { force: true });
    }
    for (const entry of q.active.slice()) {
      const d = def(entry.id); if (!d) continue;
      let changed = false;
      d.objectives.forEach((obj, i) => {
        const n = need(obj); const cur = entry.progress[i] || 0;
        const inc = increment(obj, name, payload, G);
        let next = cur;
        if (inc === null) next = Math.min(n, inventoryCount(G, obj.item) || 0);
        else if (inc > 0 && cur < n) next = Math.min(n, cur + inc);
        if (next !== cur) { entry.progress[i] = next; changed = true; emit('quest_progress', { id: entry.id, objIndex: i, current: next, need: n }); }
      });
      if (changed && allDone(entry, d)) emit('quest_completable', { id: entry.id });
    }
  }

  // ---- 완료·보상 ----
  function canComplete(G, id) {
    const entry = entryOf(G, id); const d = def(id);
    if (!entry || !d) return false;
    // collect 는 완료 시점의 실제 가방 수량으로 다시 확인(팔았을 수 있으므로)
    for (let i = 0; i < d.objectives.length; i++) {
      const obj = d.objectives[i];
      if (obj.type === 'collect') { const c = inventoryCount(G, obj.item); if (c !== null) entry.progress[i] = Math.min(need(obj), c); }
    }
    return allDone(entry, d);
  }
  function consumeCollected(G, d) {
    if (typeof Inventory === 'undefined' || !Inventory.remove) return;
    for (const obj of d.objectives) {
      if (obj.type !== 'collect') continue;
      let left = need(obj);
      for (const inst of (G.player.bag || []).slice()) {
        if (left <= 0) break;
        if (!inst || inst.id !== obj.item) continue;
        const take = Math.min(left, inst.qty || 1);
        try { Inventory.remove(G, inst.uid, take); } catch (e) { break; }
        left -= take;
      }
    }
  }
  function grantItem(G, spec, floor) {
    if (typeof Items === 'undefined' || !Items.generate) return null;
    const rng = (typeof RNG !== 'undefined') ? RNG.global() : null;
    let inst = null;
    try {
      if (spec.id && Items.get && Items.get(spec.id)) inst = Items.generate({ id: spec.id, grade: spec.grade, qty: spec.qty || 1, floor, rng, cls: 'priest' });
      else if (spec.slot) {
        // 방어구 부위만 천 재질을 강제한다(장신구·지팡이·책은 armor 필드가 없어 조건에 걸리면 빈 결과가 됨). 사제 착용 가능 여부는 cls 로 거른다.
        const armor = ARMOR_SLOTS.includes(spec.slot) ? 'cloth' : undefined;
        inst = Items.generate({ slot: spec.slot, grade: spec.grade || 'uncommon', floor, rng, cls: 'priest', armor, setId: spec.setId, hands: spec.hands });
      }
    } catch (e) { inst = null; }
    if (!inst) return null;
    if (spec.qty > 1 && !(inst.qty > 1)) inst.qty = spec.qty; // 수량을 모르는 생성기(스텁)용 보정
    return inst;
  }
  function deliver(G, inst) {
    let ok = false;
    if (typeof Inventory !== 'undefined' && Inventory.add) { try { ok = !!Inventory.add(G, inst); } catch (e) { ok = false; } }
    if (ok) return 'bag';
    // 가방이 가득 차면 은행으로 보낸다(은행장이 대신 받아 둠)
    G.bank = G.bank || { items: [], gold: 0, size: 60 };
    if (G.bank.items.length < (G.bank.size || 60)) { G.bank.items.push(inst); return 'bank'; }
    return 'lost';
  }
  function grantRewards(G, d) {
    const rw = d.rewards || {};
    const out = { gold: rw.gold || 0, xp: rw.xp || 0, gems: rw.gems || 0, items: [], toBank: [], skipped: [], levelsGained: 0 };
    G.player.gold = (G.player.gold || 0) + out.gold;
    G.player.gems = (G.player.gems || 0) + out.gems;
    if (out.xp) {
      if (typeof Level !== 'undefined' && Level.addXp) { try { out.levelsGained = (Level.addXp(G.player, out.xp) || {}).levelsGained || 0; } catch (e) { G.player.xp = (G.player.xp || 0) + out.xp; } }
      else G.player.xp = (G.player.xp || 0) + out.xp;
    }
    const floor = d.chapter || (d.requires && d.requires.floor) || d.floor || 1;
    for (const spec of rw.items || []) {
      const inst = grantItem(G, spec, floor);
      if (!inst) { out.skipped.push(spec); continue; }
      const where = deliver(G, inst);
      if (where === 'bag') out.items.push(inst); else if (where === 'bank') out.toBank.push(inst); else out.skipped.push(spec);
    }
    return out;
  }
  function maybeAdvanceChapter(G, d) {
    if (d.type !== 'main') return false;
    const cur = G.story.chapter || 1;
    if (d.chapter !== cur) return false;
    if (!QuestData.mainOfChapter(cur).every((m) => isDone(G, m.id))) return false;
    G.story.chapter = cur + 1;
    G.story.flags['chapter_' + cur + '_done'] = true;
    emit('chapter_advanced', { chapter: G.story.chapter, prev: cur });
    return true;
  }
  function complete(G, id) {
    if (!canComplete(G, id)) return null;
    const q = Q(G); const d = def(id);
    q.active.splice(q.active.findIndex((a) => a.id === id), 1);
    consumeCollected(G, d);
    if (d.type === 'daily') q.daily.done.push(id); else q.completed.push(id);
    const rewards = grantRewards(G, d);
    emit('quest_completed', { id, type: d.type, rewards });
    maybeAdvanceChapter(G, d);
    return rewards;
  }

  // ---- 일일 ----
  function dailyRefresh(G) {
    const q = Q(G); const day = G.day || 1;
    if (q.daily.day === day && q.daily.offered.length) return false;
    const pool = QuestData.byType('daily').map((d) => d.id);
    const seed = (typeof RNG !== 'undefined') ? RNG.hash('daily:' + day) : day;
    const r = (typeof RNG !== 'undefined') ? RNG.make(seed) : { shuffle: (a) => a.slice().sort(() => Math.random() - 0.5) };
    const offered = r.shuffle(pool).slice(0, DAILY_COUNT);
    // 지난날의 일일 퀘스트는 사라진다
    q.active = q.active.filter((a) => { const d = def(a.id); return !(d && d.type === 'daily' && a.acceptedDay !== day); });
    q.daily = { day, offered, done: [] };
    emit('daily_refreshed', { day, offered });
    return true;
  }

  // ---- 조회(UI) ----
  const FAMILY_LABEL = { any: '몬스터', undead: '언데드', goblin: '고블린', wolf: '늑대', spider: '거미', troll: '트롤', orc: '오크', werewolf: '늑대인간', siren: '세이렌', sprite: '숲 정령', skeleton: '해골', zombie: '좀비', sheepie: '셰피', bat: '박쥐', golem: '골렘', naga: '나가', wraith: '망령', drake: '새끼 용', dragon: '드래곤' };
  const FACILITY_LABEL = { shop: '잡화점', auction: '경매장', bank: '은행', smithy: '대장간', inn: '여관', engraver: '각인소', temple: '신전', adventurer: '모험가 사무소', guild: '길드', tower: '탑 입구' };
  function monsterName(id) {
    if (typeof Monsters !== 'undefined' && Monsters.get) { try { const m = Monsters.get(id); if (m && m.name) return m.name; } catch (e) {} }
    return FAMILY_LABEL[id] || id;
  }
  function itemName(id) {
    if (typeof Items !== 'undefined' && Items.get) { try { const it = Items.get(id); if (it && it.name) return it.name; } catch (e) {} }
    return id;
  }
  function objectiveLabel(obj) {
    const f = obj.floor ? `${obj.floor}층 ` : '';
    switch (obj.type) {
      case 'kill': return `${f}${monsterName(obj.target)} 처치`;
      case 'kill_boss': return obj.floor ? `${obj.floor}층 보스 처치` : '층 보스 처치';
      case 'collect': return `${itemName(obj.item)} 모으기`;
      case 'chest': return obj.chestId ? `${f}숨겨진 상자 열기` : `${f}상자 열기`;
      case 'talk': return `${(typeof Dialogue !== 'undefined' && Dialogue.name) ? Dialogue.name(obj.npc) : obj.npc}와 대화`;
      case 'visit': return `${FACILITY_LABEL[obj.facility] || obj.facility} 방문`;
      case 'clear_floor': return obj.floor ? `${obj.floor}층 클리어` : '층 클리어';
      case 'steps': return '걸음 수';
      case 'heal': return '치유량';
      default: return obj.type;
    }
  }
  function active(G) {
    return Q(G).active.map((entry) => {
      const d = def(entry.id); if (!d) return null;
      const objectives = d.objectives.map((obj, i) => ({ type: obj.type, label: objectiveLabel(obj), current: Math.min(need(obj), entry.progress[i] || 0), need: need(obj), done: (entry.progress[i] || 0) >= need(obj) }));
      return { id: entry.id, def: d, title: d.title, type: d.type, progress: entry.progress, acceptedDay: entry.acceptedDay, objectives, complete: objectives.every((o) => o.done) };
    }).filter(Boolean);
  }
  // NPC 대사에 섞을 퀘스트 힌트: 그 NPC 가 준 진행 중 퀘스트 + 수주 가능한 퀘스트의 hint
  function hintsFor(G, npcId) {
    const out = [];
    for (const a of Q(G).active) { const d = def(a.id); if (d && d.giver === npcId && d.hint && !canComplete(G, a.id)) out.push(d.hint); }
    for (const d of available(G, npcId)) if (d.hint) out.push(d.hint);
    return Array.from(new Set(out));
  }

  // ---- 이벤트 구독 ----
  function init() {
    dispose();
    if (typeof Events === 'undefined') return false;
    for (const name of EVENT_NAMES) unsubs.push(Events.on(name, (p) => handle(name, p)));
    return true;
  }
  function dispose() { for (const un of unsubs) { try { un(); } catch (e) {} } unsubs = []; }

  return { init, dispose, bind, handle, available, accept, abandon, acceptHiddenByScroll, active, canComplete, complete, dailyRefresh, hintsFor, status, objectiveLabel, isDone, isActive, DAILY_COUNT, EVENT_NAMES };
})();
if (typeof module !== 'undefined') module.exports = Quests;
