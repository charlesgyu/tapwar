const load = require('../tools/load');
const FILES = ['core/rng.js', 'core/events.js', 'core/data_quests.js', 'core/data_dialogue.js', 'core/data_story.js'];

module.exports = {
  '프롤로그 6~10줄, 챕터 10개(intro/outro 3~5줄), 에필로그'(assert) {
    const ctx = load(FILES); const S = ctx.Story;
    assert.ok(S.prologue.length >= 6 && S.prologue.length <= 10, 'prologue ' + S.prologue.length);
    assert.ok(S.epilogue10.length >= 3);
    for (let n = 1; n <= 10; n++) {
      const c = S.chapters[n];
      assert.ok(c && c.n === n && c.floor === n && c.title, 'chapter ' + n);
      assert.ok(c.intro.length >= 3 && c.intro.length <= 5, `ch${n} intro ${c.intro.length}`);
      assert.ok(c.outro.length >= 3 && c.outro.length <= 5, `ch${n} outro ${c.outro.length}`);
      for (const l of c.intro.concat(c.outro)) assert.ok(l.trim().length > 0);
      if (c.townEvent) { assert.ok(ctx.Dialogue.npc(c.townEvent.npc), `ch${n} townEvent npc`); assert.ok(c.townEvent.lines.length >= 1); }
    }
    assert.strictEqual(S.chapter(11), null);
    assert.strictEqual(S.forFloor(5).title, S.chapters[5].title);
    assert.strictEqual(S.list().length, 10);
    assert.strictEqual(S.townEvent(5).npc, 'priest_elder');
  },
  '줄거리 고정 요소: 스승 실종→5층 구출, 망령 왕=옛 사제, 10층 드래곤, 99층 떡밥'(assert) {
    const ctx = load(FILES); const S = ctx.Story;
    const text = (arr) => arr.join('\n');
    assert.ok(text(S.prologue).includes('엘다') && text(S.prologue).includes('5층'));
    assert.ok(text(S.chapters[5].outro).includes('엘다') || text(S.chapters[5].intro).includes('엘다'));
    assert.ok(text(S.chapters[9].intro).includes('아셀') && text(S.chapters[9].intro).includes('망령'));
    assert.ok(text(S.chapters[10].intro).includes('드래곤'));
    assert.ok(text(S.chapters[10].outro).includes('99층') || text(S.epilogue10).includes('99층'));
    assert.ok(text(S.chapters[6].intro).includes('힐러'), '6층부터 힐러를 노린다는 경고');
  },
};
