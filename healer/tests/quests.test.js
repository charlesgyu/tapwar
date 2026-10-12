const load = require('../tools/load');

const FILES = ['core/rng.js', 'core/events.js', 'core/data_quests.js', 'core/data_dialogue.js', 'core/data_story.js', 'core/state.js', 'core/quests.js'];
const PRIEST_SLOTS = ['neck', 'ring', 'ear', 'main', 'off', 'body', 'boots', 'gloves', 'hat', 'belt', 'bag'];

// 다른 모듈(Items/Inventory/Level)은 아직 없을 수 있으므로 최소 스텁을 컨텍스트에 주입한다
function stubs(ctx) {
  const KNOWN = new Set(['hp_potion_s', 'hp_potion_m', 'hp_potion_l', 'mp_potion_s', 'mp_potion_m', 'mp_potion_l', 'antidote', 'iron_scrap', 'leather', 'crystal']);
  let n = 0;
  ctx.Items = {
    get: (id) => (KNOWN.has(id) ? { id, name: id, kind: id.includes('potion') ? 'consume' : 'material', stack: 99 } : null),
    generate: (o) => ({ uid: 'i' + (++n), id: o.id || `gen_${o.slot}`, slot: o.slot || null, grade: o.grade || 'common', cls: o.cls || null, armor: o.armor || null, setId: o.setId || null, qty: 1 }),
  };
  ctx.Inventory = {
    add: (G, inst) => { const i = G.player.bag.indexOf(null); if (i < 0) return false; G.player.bag[i] = inst; return true; },
    count: (G, id) => G.player.bag.reduce((s, it) => s + (it && it.id === id ? (it.qty || 1) : 0), 0),
    remove: (G, uid, qty) => { const i = G.player.bag.findIndex((it) => it && it.uid === uid); if (i < 0) return false; const it = G.player.bag[i]; if ((it.qty || 1) <= (qty || 1)) G.player.bag[i] = null; else it.qty -= qty; return true; },
  };
  ctx.Level = { addXp: (ent, xp) => { ent.xp += xp; return { levelsGained: 0 }; } };
  return ctx;
}
function setup(withStubs = true) {
  const ctx = load(FILES);
  if (withStubs) stubs(ctx);
  const G = ctx.State.newGame('테스트');
  ctx.Quests.init();
  return { ctx, G, E: ctx.Events, Q: ctx.Quests, D: ctx.QuestData };
}
function kill(E, id, family, floor, tags) { E.emit('monster_killed', { id, family, tags: tags || [], floor: floor || 1 }); }

module.exports = {
  'QuestData 분량·무결성(메인≥15, 의뢰≥20, 일일≥12, 히든 10, 사제용 보상)'(assert) {
    const ctx = load(FILES);
    const D = ctx.QuestData, all = D.all();
    const by = (t) => all.filter((q) => q.type === t);
    assert.ok(by('main').length >= 15, 'main ' + by('main').length);
    assert.ok(by('village').length >= 20, 'village ' + by('village').length);
    assert.ok(by('daily').length >= 12, 'daily ' + by('daily').length);
    assert.strictEqual(by('hidden').length, 10);
    assert.strictEqual(new Set(all.map((q) => q.id)).size, all.length, '중복 id');
    const npcIds = new Set(ctx.Dialogue.ids());
    for (const q of all) {
      assert.ok(npcIds.has(q.giver), `${q.id} giver ${q.giver}`);
      assert.ok(q.title && q.text && q.text.offer && q.text.progress && q.text.complete && q.hint, `${q.id} 텍스트 누락`);
      assert.ok(q.objectives.length >= 1, `${q.id} objectives`);
      if (q.requires && q.requires.quest) assert.ok(D.get(q.requires.quest), `${q.id} requires ${q.requires.quest}`);
      for (const it of (q.rewards.items || [])) { if (it.slot) assert.ok(PRIEST_SLOTS.includes(it.slot), `${q.id} slot ${it.slot}`); }
    }
    // 메인: 챕터 1~10 각각 보스 처치 퀘스트가 있고, 선행 1개 이상
    for (let c = 1; c <= 10; c++) {
      const ms = D.mainOfChapter(c);
      assert.ok(ms.length >= 2, `챕터 ${c} 메인 ${ms.length}`);
      assert.ok(ms.some((m) => m.objectives.some((o) => o.type === 'kill_boss' && o.floor === c)), `챕터 ${c} 보스 퀘스트`);
    }
    // 히든: id/층/두루마리/보상 등급
    for (let f = 1; f <= 10; f++) {
      const h = D.get('hidden_f' + f);
      assert.ok(h && h.floor === f, 'hidden_f' + f);
      assert.strictEqual(D.questForScroll(D.hiddenScroll(f)), h.id);
      assert.ok(h.objectives.every((o) => (o.type === 'chest' && new RegExp(`^f${f}_hidden\\d$`).test(o.chestId)) || (o.type === 'kill' && o.floor === f)), h.id + ' objectives');
      assert.ok(h.rewards.items.some((it) => it.slot && ['rare', 'legendary'].includes(it.grade)), h.id + ' 보상');
    }
    // 의뢰가 1~10층에 고루 분포
    const floors = new Set(by('village').map((q) => q.requires.floor));
    for (let f = 1; f <= 10; f++) assert.ok(floors.has(f), `의뢰 ${f}층 없음`);
    assert.ok(new Set(by('village').map((q) => q.giver)).size >= 10, '의뢰 giver 다양성');
  },

  '수주 → 이벤트 → 완료 → 보상 → 챕터 증가'(assert) {
    const { G, E, Q } = setup();
    const events = []; E.on('chapter_advanced', (p) => events.push(p));
    assert.ok(Q.available(G, 'adventurer_clerk').some((q) => q.id === 'main_01_prepare'));
    assert.ok(!Q.available(G).some((q) => q.id === 'main_01_goblins'), '선행 전에는 안 보임');
    assert.ok(Q.accept(G, 'main_01_prepare'));
    assert.ok(!Q.accept(G, 'main_01_prepare'), '중복 수주 불가');
    E.emit('facility_visit', { id: 'adventurer' });
    assert.ok(!Q.canComplete(G, 'main_01_prepare'));
    E.emit('npc_talk', { npcId: 'guard1' });
    assert.ok(Q.canComplete(G, 'main_01_prepare'));
    const gold0 = G.player.gold;
    const rw = Q.complete(G, 'main_01_prepare');
    assert.strictEqual(G.player.gold, gold0 + 100);
    assert.strictEqual(G.player.xp, 40);
    assert.strictEqual(rw.items.length, 2);
    assert.strictEqual(rw.items.find((i) => i.id === 'hp_potion_s').qty, 3);
    assert.ok(G.player.bag.filter(Boolean).length === 2, '가방에 들어감');
    assert.strictEqual(G.story.chapter, 1, '선행 퀘스트는 챕터를 올리지 않음');

    assert.ok(Q.accept(G, 'main_01_goblins'));
    for (let i = 0; i < 10; i++) kill(E, i % 2 ? 'goblin_archer' : 'goblin', 'goblin', 1);
    assert.ok(Q.canComplete(G, 'main_01_goblins'));
    const rw2 = Q.complete(G, 'main_01_goblins');
    assert.strictEqual(rw2.items[0].cls, 'priest', '보상 장비는 사제용 생성');
    assert.strictEqual(rw2.items[0].setId, 'novice_cloth');

    assert.ok(Q.accept(G, 'main_01_boss'));
    E.emit('boss_killed', { id: 'goblin_king', floor: 2 });
    assert.ok(!Q.canComplete(G, 'main_01_boss'), '다른 층 보스는 안 침');
    E.emit('boss_killed', { id: 'goblin_king', floor: 1 });
    assert.ok(Q.complete(G, 'main_01_boss'));
    assert.strictEqual(G.story.chapter, 2);
    assert.strictEqual(JSON.stringify(events), JSON.stringify([{ chapter: 2, prev: 1 }]));
    assert.ok(G.story.flags.chapter_1_done);
    assert.ok(Q.available(G, 'priest_elder').some((q) => q.id === 'main_02_pages'), '다음 챕터 메인 열림');
    assert.ok(G.quests.completed.includes('main_01_boss'));
  },

  '선행 조건(퀘스트·층·레벨·챕터)'(assert) {
    const { G, Q } = setup();
    assert.ok(!Q.accept(G, 'main_01_boss'), '선행 퀘스트 미완료');
    assert.strictEqual(Q.status(G, 'main_01_boss'), 'locked');
    assert.ok(!Q.available(G, 'guildmaster').some((q) => q.id === 'v_guild_trolls'), '5층 미해금');
    G.tower.highestCleared = 4;
    assert.ok(Q.available(G, 'guildmaster').some((q) => q.id === 'v_guild_trolls'), '4층 클리어 후 5층 의뢰 열림');
    assert.ok(Q.available(G, 'smith').some((q) => q.id === 'v_smith_scrap'), '1층 의뢰는 처음부터');
    assert.ok(!Q.available(G).some((q) => q.type === 'hidden'), '히든은 목록에 안 나옴');
    assert.ok(!Q.accept(G, 'hidden_f1'), '히든은 직접 수주 불가');
    // 메인은 챕터가 맞아야 함 (완료 처리로 선행만 맞춘 경우)
    G.quests.completed.push('main_02_pages');
    assert.ok(!Q.accept(G, 'main_02_boss'), '챕터 1 인데 챕터 2 메인은 불가');
  },

  '일일 퀘스트: 3개 제공, 날이 바뀌면 리셋, 완료는 daily.done 에만'(assert) {
    const { G, Q, D } = setup();
    assert.ok(Q.dailyRefresh(G));
    assert.strictEqual(G.quests.daily.day, 1);
    assert.strictEqual(G.quests.daily.offered.length, 3);
    assert.strictEqual(new Set(G.quests.daily.offered).size, 3);
    for (const id of G.quests.daily.offered) assert.strictEqual(D.get(id).type, 'daily');
    assert.ok(!Q.dailyRefresh(G), '같은 날엔 리셋 안 함');
    const offered1 = G.quests.daily.offered.slice();
    const av = Q.available(G, 'adventurer_clerk').filter((q) => q.type === 'daily').map((q) => q.id);
    assert.strictEqual(JSON.stringify(av.sort()), JSON.stringify(offered1.slice().sort()));
    const first = offered1[0];
    assert.ok(Q.accept(G, first));
    assert.ok(!Q.accept(G, D.byType('daily').find((q) => !offered1.includes(q.id)).id), '제공되지 않은 일일은 수주 불가');
    // 강제로 완료 처리
    const entry = G.quests.active.find((a) => a.id === first);
    D.get(first).objectives.forEach((o, i) => { entry.progress[i] = o.count || o.amount || 1; });
    if (D.get(first).objectives.some((o) => o.type === 'collect')) { G.player.bag[0] = { uid: 'x', id: D.get(first).objectives.find((o) => o.type === 'collect').item, qty: 99 }; }
    assert.ok(Q.complete(G, first));
    assert.ok(G.quests.daily.done.includes(first));
    assert.ok(!G.quests.completed.includes(first), '일일은 completed 에 넣지 않음');
    assert.ok(!Q.available(G, 'adventurer_clerk').some((q) => q.id === first));
    // 다음 날
    assert.ok(Q.accept(G, offered1[1]));
    G.day = 2;
    assert.ok(Q.dailyRefresh(G));
    assert.strictEqual(G.quests.daily.day, 2);
    assert.strictEqual(G.quests.daily.done.length, 0);
    assert.ok(!G.quests.active.some((a) => a.id === offered1[1]), '지난날 일일은 사라짐');
    // 결정적: 같은 날은 같은 제공
    const again = load(FILES); const G2 = again.State.newGame('x'); G2.day = 2; again.Quests.dailyRefresh(G2);
    assert.strictEqual(JSON.stringify(G2.quests.daily.offered), JSON.stringify(G.quests.daily.offered));
  },

  '히든 두루마리 획득 → 자동 수주 → 숨겨진 상자 → 레어 이상 사제 장비'(assert) {
    const { G, E, Q } = setup();
    E.emit('item_gained', { id: 'scroll_hidden_f3', qty: 1 });
    assert.ok(Q.isActive(G, 'hidden_f3'));
    E.emit('chest_opened', { chestId: 'f3_hidden1', floor: 3, hidden: true });
    assert.ok(!Q.canComplete(G, 'hidden_f3'), '다른 상자');
    assert.strictEqual(JSON.stringify(G.quests.hiddenFound), JSON.stringify(['f3_hidden1']));
    E.emit('chest_opened', { chestId: 'f3_hidden2', floor: 3, hidden: true });
    assert.ok(Q.canComplete(G, 'hidden_f3'));
    const rw = Q.complete(G, 'hidden_f3');
    assert.ok(rw.items.length === 1 && ['rare', 'legendary'].includes(rw.items[0].grade) && rw.items[0].cls === 'priest');
    // 이미 찾은 상자가 목표면 수주 즉시 완료 가능
    E.emit('chest_opened', { chestId: 'f5_hidden4', floor: 5, hidden: true });
    E.emit('item_gained', { id: 'scroll_hidden_f5' });
    assert.ok(Q.canComplete(G, 'hidden_f5'));
    // Loot.chest 가 questScroll 을 chest_opened 에 실어 보내도 수주
    E.emit('chest_opened', { chestId: 'f7_hidden1', floor: 7, hidden: true, questScroll: 'hidden_f7' });
    assert.ok(Q.isActive(G, 'hidden_f7'));
    assert.ok(!Q.abandon(G, 'main_01_prepare'), '없는 건 포기 불가');
    assert.ok(Q.abandon(G, 'hidden_f7'));
  },

  'kill 목표: id/family/tags 매칭, 층 제한, any'(assert) {
    const { G, E, Q } = setup();
    Q.accept(G, 'hidden_f2', { force: true }); // 2층 거미 15
    kill(E, 'cave_spider', 'spider', 6);
    assert.strictEqual(Q.active(G)[0].objectives[0].current, 0, '다른 층은 무시');
    kill(E, 'spider', 'spider', 2); kill(E, 'spider_elite', 'spider', 2, ['beast']);
    assert.strictEqual(Q.active(G)[0].objectives[0].current, 2);
    Q.accept(G, 'd_undead_10', { force: true });
    kill(E, 'skeleton', 'skeleton', 3, ['undead']); kill(E, 'wolf', 'wolf', 3, ['beast']);
    assert.strictEqual(Q.active(G).find((a) => a.id === 'd_undead_10').objectives[0].current, 1, 'tags 로 언데드 매칭');
    Q.accept(G, 'd_hunt_20', { force: true });
    kill(E, 'anything', 'x', 9);
    assert.strictEqual(Q.active(G).find((a) => a.id === 'd_hunt_20').objectives[0].current, 1);
    const progressEvents = []; E.on('quest_progress', (p) => progressEvents.push(p));
    kill(E, 'spider', 'spider', 2);
    assert.ok(progressEvents.some((p) => p.id === 'hidden_f2' && p.current === 3 && p.need === 15));
  },

  'collect 목표는 가방 수량과 동기화되고 완료 시 소모된다'(assert) {
    const { G, E, Q } = setup();
    assert.ok(Q.accept(G, 'v_smith_scrap'));
    G.player.bag[0] = { uid: 'a1', id: 'iron_scrap', qty: 3 };
    E.emit('item_gained', { id: 'iron_scrap', qty: 3 });
    assert.strictEqual(Q.active(G)[0].objectives[0].current, 3);
    assert.ok(!Q.canComplete(G, 'v_smith_scrap'));
    G.player.bag[1] = { uid: 'a2', id: 'iron_scrap', qty: 4 };
    E.emit('item_gained', { id: 'iron_scrap', qty: 4 });
    assert.ok(Q.canComplete(G, 'v_smith_scrap'));
    G.player.bag[1] = null; // 팔아 버림
    assert.ok(!Q.canComplete(G, 'v_smith_scrap'), '완료 시점에 재확인');
    G.player.bag[1] = { uid: 'a3', id: 'iron_scrap', qty: 4 };
    assert.ok(Q.complete(G, 'v_smith_scrap'));
    assert.strictEqual(G.player.bag.reduce((s, it) => s + (it && it.id === 'iron_scrap' ? it.qty : 0), 0), 2, '5개 소모');
  },

  'steps/heal/clear_floor/visit 목표와 완료 가능 이벤트'(assert) {
    const { G, E, Q } = setup();
    const completable = []; E.on('quest_completable', (p) => completable.push(p.id));
    Q.accept(G, 'd_steps_1500', { force: true }); Q.accept(G, 'd_heal_5000', { force: true }); Q.accept(G, 'd_clear_any', { force: true }); Q.accept(G, 'd_patrol', { force: true });
    for (let i = 0; i < 15; i++) E.emit('steps', { n: 100 });
    E.emit('heal_done', { amount: 4000 }); E.emit('heal_done', { amount: 1500 });
    E.emit('floor_cleared', { floor: 3, time: 100 });
    E.emit('facility_visit', { id: 'smithy' }); E.emit('facility_visit', { id: 'shop' });
    assert.ok(['d_steps_1500', 'd_heal_5000', 'd_clear_any', 'd_patrol'].every((id) => Q.canComplete(G, id)));
    assert.strictEqual(JSON.stringify(completable.sort()), JSON.stringify(['d_clear_any', 'd_heal_5000', 'd_patrol', 'd_steps_1500']));
    const a = Q.active(G).find((x) => x.id === 'd_heal_5000');
    assert.strictEqual(a.objectives[0].current, 5000, '상한에서 멈춤');
    assert.ok(a.complete);
  },

  'hintsFor: 진행 중·수주 가능한 퀘스트의 힌트'(assert) {
    const { G, Q, D } = setup();
    assert.ok(Q.hintsFor(G, 'adventurer_clerk').includes(D.get('main_01_prepare').hint));
    Q.accept(G, 'main_01_prepare'); G.quests.completed.push('main_01_prepare'); G.quests.active = [];
    Q.accept(G, 'main_01_goblins');
    const h = Q.hintsFor(G, 'guard1');
    assert.ok(h.includes(D.get('main_01_goblins').hint));
    assert.ok(!h.includes(D.get('v_guard_orcs').hint), '8층 의뢰는 아직');
  },

  '보상 모듈(Items/Inventory/Level)이 없어도 안전하게 동작'(assert) {
    const { G, E, Q } = setup(false);
    Q.accept(G, 'main_01_prepare');
    E.emit('facility_visit', { id: 'adventurer' }); E.emit('npc_talk', { npcId: 'guard1' });
    const rw = Q.complete(G, 'main_01_prepare');
    assert.strictEqual(rw.gold, 100); assert.strictEqual(G.player.xp, 40);
    assert.strictEqual(rw.items.length, 0); assert.strictEqual(rw.skipped.length, 2);
  },

  '가방이 가득 차면 보상은 은행으로'(assert) {
    const { G, E, Q } = setup();
    G.player.bag.fill({ uid: 'junk', id: 'junk', qty: 1 });
    Q.accept(G, 'main_01_prepare');
    E.emit('facility_visit', { id: 'adventurer' }); E.emit('npc_talk', { npcId: 'guard1' });
    const rw = Q.complete(G, 'main_01_prepare');
    assert.strictEqual(rw.items.length, 0); assert.strictEqual(rw.toBank.length, 2); assert.strictEqual(G.bank.items.length, 2);
  },
};
