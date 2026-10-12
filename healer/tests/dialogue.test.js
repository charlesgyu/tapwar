const load = require('../tools/load');
const FILES = ['core/rng.js', 'core/events.js', 'core/data_quests.js', 'core/data_dialogue.js', 'core/data_story.js', 'core/state.js', 'core/quests.js'];
const REQUIRED_CHAPTERS = [1, 3, 5, 6, 8, 10];

function setup() { const ctx = load(FILES); const G = ctx.State.newGame('테스트'); ctx.RNG.seedGlobal(7); return { ctx, G, D: ctx.Dialogue }; }
function hintTexts(ctx, npcId, G) { return new Set(ctx.Dialogue.npc(npcId).hints.map((h) => h.text.replace('{place}', `'${ctx.Dialogue.placeOf(h.floor, h.chestId)}'`))); }

module.exports = {
  'NPC 19명 데이터 최소 분량(기본 ≥6, 챕터 1·3·5·6·8·10, 힌트 ≥3, 참조 무결성)'(assert) {
    const { ctx, D } = setup();
    const ids = D.ids();
    assert.ok(ids.length >= 18, 'npc ' + ids.length);
    for (const id of ['guard1', 'guard2', 'priest_elder', 'smith', 'merchant1', 'merchant2', 'innkeeper', 'banker', 'engraver', 'auctioneer', 'guildmaster', 'adventurer_clerk', 'villager_a', 'villager_b', 'villager_c', 'villager_d', 'villager_e', 'child_a', 'child_b']) assert.ok(ids.includes(id), id);
    for (const id of ids) {
      const n = D.npc(id);
      assert.ok(n.name && n.role, id);
      assert.ok(n.lines.length >= 6, `${id} lines ${n.lines.length}`);
      for (const c of REQUIRED_CHAPTERS) assert.ok(n.byChapter[c] && n.byChapter[c].length >= 1, `${id} chapter ${c}`);
      assert.ok(n.hints.length >= 3, `${id} hints`);
      for (const h of n.hints) {
        assert.ok(h.text && h.text.length > 3, `${id} hint text`);
        if (h.questId) assert.ok(ctx.QuestData.get(h.questId), `${id} hint quest ${h.questId}`);
        if (h.chestId) { assert.ok(/^f(\d+)_hidden[1-5]$/.test(h.chestId), `${id} chest ${h.chestId}`); assert.strictEqual(h.floor, Number(/^f(\d+)/.exec(h.chestId)[1])); }
      }
    }
    // 모든 층(1~10)에 숨겨진 상자 힌트가 하나 이상, 히든 퀘스트 목표 상자는 힌트가 있어야 한다
    const chestHints = new Set(ids.flatMap((id) => D.npc(id).hints.filter((h) => h.chestId).map((h) => h.chestId)));
    for (let f = 1; f <= 10; f++) assert.ok([...chestHints].some((c) => c.startsWith(`f${f}_`)), `${f}층 상자 힌트`);
    for (const h of ctx.QuestData.byType('hidden')) for (const o of h.objectives) if (o.type === 'chest') assert.ok(chestHints.has(o.chestId), `히든 목표 ${o.chestId} 힌트 없음`);
  },

  '모든 NPC 가 모든 챕터(1~11)에서 빈 대사 없이 pick/greet 가능'(assert) {
    const { ctx, G, D } = setup();
    for (const id of D.ids()) {
      for (let c = 1; c <= 11; c++) {
        G.story.chapter = c; G.tower.highestCleared = c - 1;
        for (let i = 0; i < 25; i++) {
          const s = D.pick(id, G);
          assert.ok(typeof s === 'string' && s.trim().length > 0, `${id} ch${c} 빈 대사`);
          assert.ok(!s.includes('{'), `${id} ch${c} 치환 안 됨: ${s}`);
        }
        const g = D.greet(id, G);
        assert.ok(g.length >= 2 && g.length <= 3, `${id} ch${c} greet ${g.length}줄`);
        for (const line of g) assert.ok(line && line.trim().length > 0);
      }
    }
    assert.strictEqual(D.pick('nobody', G), '…');
    // 1~5챕터 장로는 수정 너머 목소리만, 6챕터부터는 직접 대화(수정 목소리가 섞이지 않음)
    G.story.chapter = 2; assert.ok(D.greet('priest_elder', G)[0].includes('수정'));
    for (let i = 0; i < 200; i++) assert.ok(D.pick('priest_elder', G, { hintChance: 0 }).startsWith('(수정 너머로)'));
    G.story.chapter = 6; assert.ok(!D.greet('priest_elder', G)[0].includes('수정'));
    for (let i = 0; i < 200; i++) assert.ok(!D.pick('priest_elder', G, { hintChance: 0 }).startsWith('(수정 너머로)'));
    assert.ok(ctx.Story.chapters[1].intro.length >= 3);
  },

  '힌트 포함률은 약 30% (관련 힌트가 있을 때)'(assert) {
    const { ctx, G, D } = setup();
    const hints = hintTexts(ctx, 'guard1', G);
    let n = 0; const N = 4000;
    for (let i = 0; i < N; i++) if (hints.has(D.pick('guard1', G))) n++;
    const rate = n / N;
    assert.ok(rate > 0.22 && rate < 0.38, 'hint rate ' + rate);
    // 챕터 대사와 기본 대사도 섞여 나온다
    const seen = new Set(); for (let i = 0; i < 300; i++) seen.add(D.pick('guard1', G));
    const npc = D.npc('guard1');
    assert.ok(npc.byChapter[1].some((l) => seen.has(l)), '챕터 대사');
    assert.ok(npc.lines.some((l) => seen.has(l)), '기본 대사');
  },

  '미완료 퀘스트·안 찾은 상자 힌트 우선, 완료/발견한 것은 제외'(assert) {
    const { ctx, G, D } = setup();
    const goblinHint = ctx.QuestData.get('main_01_goblins');
    // 진행 중 퀘스트의 힌트는 상자 힌트보다 자주 나온다
    G.quests.active = [{ id: 'main_01_goblins', progress: {}, acceptedDay: 1 }];
    const chest1 = D.npc('guard1').hints.find((h) => h.chestId === 'f1_hidden1');
    const chestText = chest1.text.replace('{place}', `'${D.placeOf(1, 'f1_hidden1')}'`);
    const questH = D.npc('guard1').hints.find((h) => h.questId === 'main_01_goblins');
    let q = 0, c = 0;
    for (let i = 0; i < 3000; i++) { const s = D.pick('guard1', G, { hintChance: 1 }); if (s === questH.text) q++; if (s === chestText) c++; }
    assert.ok(q > c, `active quest hint ${q} > chest ${c}`);
    assert.ok(q > 0 && c > 0);
    // 완료한 퀘스트·찾은 상자 힌트는 사라진다
    G.quests.active = []; G.quests.completed = ['main_01_goblins']; G.quests.hiddenFound = ['f1_hidden1'];
    const list = D.hintsFor('guard1', G);
    assert.ok(!list.includes(questH.text));
    assert.ok(!list.includes(chestText));
    for (let i = 0; i < 500; i++) { const s = D.pick('guard1', G, { hintChance: 1 }); assert.notStrictEqual(s, questH.text); }
    assert.ok(goblinHint);
  },

  '먼 층의 힌트는 진행 전엔 숨기고, 관련 힌트가 없으면 일반 팁'(assert) {
    const { G, D } = setup();
    const orcs = D.npc('guard1').hints.find((h) => h.questId === 'v_guard_orcs').text;
    assert.ok(!D.hintsFor('guard1', G).includes(orcs), '8층 힌트는 1챕터에 안 나옴');
    G.tower.highestCleared = 7; G.story.chapter = 8;
    assert.ok(D.hintsFor('guard1', G).includes(orcs));
    // 모든 우선 힌트가 소진되면 일반 팁(퀘스트/상자 없는 힌트)이 나온다
    G.tower.highestCleared = 0; G.story.chapter = 1;
    G.quests.completed = ['main_01_goblins', 'v_guard_orcs']; G.quests.hiddenFound = ['f1_hidden1', 'f8_hidden1'];
    assert.strictEqual(D.hintsFor('guard1', G).length, 0);
    const tips = new Set(D.npc('guard1').hints.filter((h) => !h.questId && !h.chestId).map((h) => h.text));
    let t = 0; for (let i = 0; i < 300; i++) if (tips.has(D.pick('guard1', G, { hintChance: 1 }))) t++;
    assert.ok(t > 200, 'general tips ' + t);
  },

  '{place} 는 던전 생성기의 랜드마크 이름으로 치환된다(없으면 기본 장소명)'(assert) {
    const { ctx, G, D } = setup();
    const fallback = D.placeOf(1, 'f1_hidden1');
    assert.strictEqual(fallback, D.FALLBACK_PLACES[1][0]);
    const s = D.hintsFor('guard1', G).find((x) => x.includes(fallback));
    assert.ok(s && !s.includes('{place}'), s);
    // 생성기 스텁이 있으면 실제 랜드마크 이름 사용
    const ctx2 = load(FILES); ctx2.RNG.seedGlobal(1);
    ctx2.DungeonGen = { generate: (f) => ({ floor: f, landmarks: [{ id: 'lm1', name: '시험용 폭포' }], chests: [{ id: `f${f}_hidden1`, landmarkId: 'lm1', hidden: true }] }) };
    const G2 = ctx2.State.newGame('x');
    assert.strictEqual(ctx2.Dialogue.placeOf(1, 'f1_hidden1'), '시험용 폭포');
    assert.ok(ctx2.Dialogue.hintsFor('guard1', G2).some((x) => x.includes("'시험용 폭포'")));
    assert.strictEqual(ctx2.Dialogue.placeOf(1, 'f1_hidden2'), D.FALLBACK_PLACES[1][1], '없는 상자는 기본 장소명');
    assert.ok(ctx);
  },

  'greet 는 수주 가능한 퀘스트가 있으면 안내 줄을 붙인다'(assert) {
    const { ctx, G, D } = setup();
    ctx.Quests.init();
    const g = D.greet('adventurer_clerk', G);
    assert.strictEqual(g.length, 3);
    assert.ok(g[2].includes('첫 걸음'), g[2]);
    ctx.Quests.accept(G, 'main_01_prepare');
    const g2 = D.greet('adventurer_clerk', G);
    assert.ok(!g2.some((l) => l.includes('첫 걸음') && l.includes('부탁할 일')), '수주 후엔 안내 없음');
  },
};
