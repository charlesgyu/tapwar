const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 객체는 프로토타입이 달라 JSON 으로 비교
const FILES = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_items.js', 'core/data_monsters.js', 'core/data_quests.js', 'core/state.js', 'core/combat/loot.js'];
const boot = () => load(FILES);
const isInst = (assert, ctx, it) => { assert.ok(it && it.uid && it.id && ctx.Items.get(it.id), '아이템 인스턴스 ' + JSON.stringify(it)); assert.ok(['common', 'uncommon', 'rare', 'legendary'].includes(it.grade), it.id); };
const equips = (ctx, items) => items.filter((it) => ctx.Items.get(it.id).kind === 'equip');
const rate = (ctx, id, floor, n, seed) => { const rng = ctx.RNG.make(seed); let hit = 0; for (let i = 0; i < n; i++) if (equips(ctx, ctx.Loot.roll(ctx.Monsters.get(id), floor, rng).items).length) hit++; return hit / n; };

module.exports = {
  '드랍률: 일반 ≈25%, 중간보스 ≈60%, 보스 100%(장비 3개 이상), 결과는 유효한 itemInst, 퀘스트 아이템은 절대 안 나옴'(assert) {
    const ctx = boot(); const { Loot, Monsters, Items, RNG } = ctx;
    const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(3)} vs ${b}`);
    near(rate(ctx, 'goblin', 1, 4000, 1), 0.25, 0.03, '일반');
    near(rate(ctx, 'goblin_chief', 1, 4000, 2), 0.6, 0.03, '중간보스');
    assert.strictEqual(rate(ctx, 'boss_goblin_king', 1, 300, 3), 1, '보스');
    const rng = RNG.make(7);
    for (let i = 0; i < 200; i++) {
      const r = Loot.roll(Monsters.get(i % 2 ? 'boss_troll_chief' : 'wolf'), 5, rng);
      assert.ok(Number.isInteger(r.gold) && r.gold >= 0);
      for (const it of r.items) { isInst(assert, ctx, it); assert.notStrictEqual(Items.get(it.id).kind, 'quest', '퀘스트 아이템 드랍'); }
      if (i % 2) assert.ok(equips(ctx, r.items).length >= 1 + Loot.BOSS_EXTRA_EQUIP, '보스 장비 수');
    }
    same(assert, Loot.DROP_CHANCE, { normal: 0.25, elite: 0.6, miniboss: 0.6, boss: 1.0 });
  },

  '보스: 사제용 장비 1개 보장(1~5층 고급↑, 6층↑ 레어↑), 10층 드래곤은 용 비늘 확정, 보스 재료는 수량이 많다'(assert) {
    const ctx = boot(); const { Loot, Monsters, Items, RNG } = ctx;
    const rng = RNG.make(11);
    for (let f = 1; f <= 10; f++) {
      const boss = Monsters.get(ctx.Floors.get(f).boss);
      for (let i = 0; i < 40; i++) {
        const r = Loot.roll(boss, f, rng);
        const priest = equips(ctx, r.items).filter((it) => Items.canUse(Items.get(it.id), 'priest'));
        assert.ok(priest.length >= 1, `${f}층 보스 사제용 없음`);
        assert.ok(priest.some((it) => Items.gradeIndex(it.grade) >= Items.gradeIndex(f >= 6 ? 'rare' : 'uncommon')), `${f}층 보스 사제용 등급`);
        if (f === 10) { const scale = r.items.find((it) => it.id === 'dragon_scale'); assert.ok(scale && scale.qty >= 4, '용 비늘'); }
        assert.ok(r.gold >= Monsters.statsAt(boss, f).gold[0] && r.gold <= Monsters.statsAt(boss, f).gold[1], '보스 골드 범위');
      }
    }
  },

  '재료·골드: 고블린은 쇠조각, 늑대(beast)는 가죽, 거미는 거미줄이 나오고, 재질을 가리지 않아 가죽/판금 장비도 나오며, 골드는 층이 오르면 커진다'(assert) {
    const ctx = boot(); const { Loot, Monsters, Items, RNG } = ctx;
    const rng = RNG.make(21);
    const seenMat = (id, floor, n) => { const s = new Set(); for (let i = 0; i < n; i++) for (const it of Loot.roll(Monsters.get(id), floor, rng).items) s.add(it.id); return s; };
    assert.ok(seenMat('goblin', 1, 300).has('iron_scrap'), '고블린 쇠조각');
    assert.ok(seenMat('wolf', 1, 300).has('leather'), '늑대 가죽');
    assert.ok(seenMat('spider', 2, 300).has('spider_silk'), '거미 거미줄');
    assert.ok(seenMat('golem_crystal', 10, 300).has('crystal'), '수정 골렘 수정');
    const armors = new Set();
    for (let i = 0; i < 2000; i++) for (const it of equips(ctx, Loot.roll(Monsters.get('orc'), 4, rng).items)) { const d = Items.get(it.id); if (d.armor) armors.add(d.armor); }
    assert.ok(armors.size >= 3 && armors.has('cloth'), '재질 가리지 않음 ' + [...armors]);
    const avgGold = (floor) => { let s = 0; for (let i = 0; i < 500; i++) s += Loot.roll(Monsters.get('orc'), floor, rng).gold; return s / 500; };
    assert.ok(avgGold(8) > avgGold(4) * 1.5 && avgGold(4) > avgGold(1), '골드 층 증가');
    // 포션은 층에 따라 소/중/대
    assert.strictEqual(Loot.potionId('hp', 1), 'hp_potion_s'); assert.strictEqual(Loot.potionId('mp', 5), 'mp_potion_m'); assert.strictEqual(Loot.potionId('hp', 9), 'hp_potion_l');
    // 드랍 장비는 층 조건을 지킨다(1층에서 동굴 장비 안 나옴)
    for (let i = 0; i < 500; i++) for (const it of equips(ctx, Loot.roll(Monsters.get('wolf'), 1, rng).items)) { const d = Items.get(it.id); assert.ok(d.floorMin == null || d.floorMin <= 1, it.id); }
  },

  '일반 상자: 골드 + 소모품 + 장비 1, 층이 오르면 골드가 커진다'(assert) {
    const ctx = boot(); const { Loot, Items, RNG } = ctx;
    const rng = RNG.make(31);
    let g1 = 0, g10 = 0;
    for (let i = 0; i < 200; i++) {
      const c = Loot.chest(1, 'normal', rng), c10 = Loot.chest(10, 'normal', rng);
      g1 += c.gold; g10 += c10.gold;
      for (const it of c.items) isInst(assert, ctx, it);
      assert.ok(c.items.some((it) => Items.get(it.id).kind === 'consume'), '소모품');
      assert.strictEqual(equips(ctx, c.items).length, 1, '장비 1');
      assert.strictEqual(c.questScroll, undefined);
    }
    assert.ok(g1 > 0 && g10 > g1 * 3, '상자 골드 층 증가');
  },

  '숨겨진 상자: 레어↑ 사제 장비 + 두루마리(questScroll = 히든 퀘스트 id)는 층당 첫 상자에서만, 이미 찾은 층/진행 중 퀘스트/소지 중이면 레어 장비만'(assert) {
    const ctx = boot(); const { Loot, Items, QuestData, RNG, State } = ctx;
    const rng = RNG.make(41);
    for (let f = 1; f <= 10; f++) {
      const G = State.newGame('t');
      const c = Loot.chest(f, 'hidden', rng, { G, chestId: `f${f}_hidden1` });
      const eq = equips(ctx, c.items);
      assert.ok(eq.length >= 1 && eq.every((it) => Items.canUse(Items.get(it.id), 'priest') && Items.gradeIndex(it.grade) >= Items.gradeIndex('rare')), `${f}층 히든 장비`);
      assert.ok(c.items.some((it) => it.id === `scroll_hidden_f${f}`), `${f}층 두루마리`);
      assert.strictEqual(c.questScroll, QuestData.questForScroll(`scroll_hidden_f${f}`), `${f}층 questScroll`);
      assert.ok(c.questScroll, 'questScroll 은 퀘스트 id');
      // Floor 가 hiddenFound 에 이 상자를 먼저 넣고 불러도 첫 상자로 본다
      G.quests.hiddenFound.push(`f${f}_hidden1`);
      assert.ok(Loot.chest(f, 'hidden', rng, { G, chestId: `f${f}_hidden1` }).items.some((it) => it.id === `scroll_hidden_f${f}`), '자기 자신은 제외');
      // 같은 층의 다른 숨겨진 상자를 이미 찾았으면 두루마리 없음
      const c2 = Loot.chest(f, 'hidden', rng, { G, chestId: `f${f}_hidden2` });
      assert.ok(!c2.items.some((it) => it.id === `scroll_hidden_f${f}`) && c2.questScroll === undefined, `${f}층 두 번째 상자`);
      assert.ok(equips(ctx, c2.items).every((it) => Items.gradeIndex(it.grade) >= Items.gradeIndex('rare')), '그래도 레어↑ 장비');
    }
    // 진행 중/완료 퀘스트, 가방 소지, 명시 플래그
    const G = State.newGame('t');
    G.quests.active.push({ id: QuestData.questForScroll('scroll_hidden_f3'), progress: {}, acceptedDay: 1 });
    assert.ok(Loot.scrollTaken(G, 3) && !Loot.scrollTaken(G, 4));
    const G2 = State.newGame('t'); G2.player.bag[0] = Items.make('scroll_hidden_f4');
    assert.ok(Loot.scrollTaken(G2, 4));
    const G3 = State.newGame('t'); G3.quests.completed.push(QuestData.questForScroll('scroll_hidden_f5'));
    assert.ok(Loot.scrollTaken(G3, 5));
    assert.ok(!Loot.chest(2, 'hidden', rng, { scrollTaken: true }).items.some((it) => it.id === 'scroll_hidden_f2'));
    assert.ok(Loot.chest(2, 'hidden', rng, { scrollTaken: false }).items.some((it) => it.id === 'scroll_hidden_f2'));
    assert.ok(Loot.chest(2, 'hidden', rng).items.some((it) => it.id === 'scroll_hidden_f2'), 'G 없으면 첫 상자로 본다');
    // 전설도 섞인다(동굴 30%)
    let leg = 0; for (let i = 0; i < 300; i++) if (equips(ctx, Loot.chest(8, 'hidden', rng, { scrollTaken: true }).items).some((it) => it.grade === 'legendary')) leg++;
    assert.ok(leg > 40 && leg < 150, '전설 비율 ' + leg);
  },

  '퀘스트 상자: 지정 아이템(id+qty) 그대로, 슬롯 지정이면 사제용 천 장비, 미지정이면 사제용 고급↑'(assert) {
    const ctx = boot(); const { Loot, Items, RNG } = ctx;
    const rng = RNG.make(51);
    const a = Loot.chest(3, 'quest', rng, { item: { id: 'hp_potion_m', qty: 3 } });
    assert.strictEqual(a.items.length, 1); assert.strictEqual(a.items[0].id, 'hp_potion_m'); assert.strictEqual(a.items[0].qty, 3); assert.ok(a.gold > 0);
    for (let i = 0; i < 50; i++) {
      const b = Loot.chest(3, 'quest', rng, { item: { slot: 'body', grade: 'rare' } });
      const d = Items.get(b.items[0].id);
      assert.ok(d.slot === 'body' && d.armor === 'cloth' && b.items[0].grade === 'rare', b.items[0].id);
      const c = Loot.chest(7, 'quest', rng, { item: { slot: 'main', hands: 'two' } });
      assert.ok(Items.get(c.items[0].id).hands === 'two' && Items.canUse(Items.get(c.items[0].id), 'priest'), c.items[0].id);
      const e = Loot.chest(2, 'quest', rng);
      assert.ok(Items.canUse(Items.get(e.items[0].id), 'priest') && Items.gradeIndex(e.items[0].grade) >= 1, e.items[0].id);
    }
  },

  'Items 가 없어도(스텁) 깨지지 않는다: 스텁 generate 를 쓰고, 재료/두루마리는 비며 골드는 나온다'(assert) {
    const ctx = load(['core/rng.js', 'core/events.js', 'core/data_monsters.js', 'core/combat/loot.js']);
    let n = 0;
    ctx.Items = { generate: (o) => ({ uid: 'i' + (++n), id: o.id || 'gen', grade: o.grade || 'common', qty: o.qty || 1, cls: o.cls || null }) };
    const rng = ctx.RNG.make(61);
    const r = ctx.Loot.roll(ctx.Monsters.get('boss_goblin_king'), 1, rng);
    assert.ok(r.gold > 0 && r.items.length >= 3 && r.items[0].cls === 'priest', '스텁 generate 사용');
    const h = ctx.Loot.chest(2, 'hidden', rng);
    assert.ok(h.items.some((it) => it.id === 'scroll_hidden_f2') && h.items.some((it) => it.grade === 'rare' || it.grade === 'legendary'));
    assert.strictEqual(h.questScroll, undefined, 'QuestData 없으면 questScroll 생략');
    ctx.Items = undefined;
    const r2 = ctx.Loot.roll(ctx.Monsters.get('wolf'), 1, rng);
    assert.ok(r2.gold >= 0 && Array.isArray(r2.items) && r2.items.length === 0, 'Items 없음');
    assert.ok(ctx.Loot.chest(1, 'normal', rng).gold > 0);
  },
};
