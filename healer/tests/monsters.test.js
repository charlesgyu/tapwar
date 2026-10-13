const load = require('../tools/load');
const same = (assert, a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); // vm 컨텍스트 객체는 프로토타입이 달라 JSON 으로 비교
const FILES = ['core/rng.js', 'core/events.js', 'core/data_monsters.js'];
const boot = () => load(FILES);
const CURSE_IDS = ['dot', 'def_down', 'atk_down', 'aspd_down', 'spd_down', 'heal_down', 'root'];
const ABILITY_TYPES = ['aoe_circle', 'puddle', 'cone', 'summon', 'charge', 'curse_volley', 'enrage', 'heal_self', 'roar'];
// 어떤 몬스터가 그 층에서 실제로 쓰는 능력 전부(abilities + phases)
const allAbilityIds = (m) => Array.from(new Set([...(m.abilities || []), ...((m.phases || []).flatMap((p) => p.abilities))]));
const floorMonsters = (ctx, f) => { const fl = ctx.Floors.get(f); return [...fl.pool.map((p) => p.id), ...fl.minibosses, fl.boss].map((id) => ctx.Monsters.get(id)); };

module.exports = {
  '분량·무결성: 일반 ≥ 24(필수 종 전부), 중간보스 30(층당 3), 보스 10, 능력 ≥ 12(계약의 9가지 type 전부), id 중복 없음, validate() 통과'(assert) {
    const { Monsters, Floors } = boot();
    same(assert, Monsters.validate(), []);
    assert.ok(Monsters.normals().length >= 24, '일반 ' + Monsters.normals().length);
    assert.strictEqual(Monsters.bosses().length, 10);
    assert.strictEqual(Monsters.minibosses().length, 30);
    const required = ['goblin', 'goblin_archer', 'goblin_shaman', 'wolf', 'spider', 'troll', 'orc', 'orc_berserker', 'werewolf', 'siren', 'sprite', 'skeleton', 'zombie', 'sheepie',
      'bat', 'cave_spider', 'golem_stone', 'golem_crystal', 'naga', 'naga_priest', 'orc_warlord', 'troll_shaman', 'wraith', 'skeleton_knight', 'drake'];
    for (const id of required) assert.ok(Monsters.get(id) && Monsters.get(id).tier === 'normal', id);
    const ids = Monsters.list();
    assert.strictEqual(new Set(ids).size, ids.length, 'id 중복');
    for (const m of Monsters.all()) {
      assert.ok(/^[a-z0-9_]+$/.test(m.id) && m.name && m.family && Array.isArray(m.biome) && m.biome.length, m.id);
      assert.ok(['normal', 'elite', 'miniboss', 'boss'].includes(m.tier), m.id);
      for (const k of ['hp', 'atk', 'def', 'spd', 'aspd', 'range']) assert.ok(typeof m.base[k] === 'number' && m.base[k] > 0, `${m.id}.base.${k}`);
      assert.ok(m.perFloor && ['hp', 'atk', 'def'].every((k) => typeof m.perFloor[k] === 'number'), m.id + ' perFloor');
      assert.ok(typeof m.xp === 'number' && Array.isArray(m.gold) && m.gold[0] <= m.gold[1], m.id + ' xp/gold');
      assert.ok([1, 2, 3].includes(m.size) && typeof m.sprite === 'string' && typeof m.loot === 'string', m.id + ' size/sprite/loot');
      for (const c of m.curses) assert.ok(CURSE_IDS.includes(c.id) && c.chance > 0 && c.chance <= 1, `${m.id} 저주 ${c.id}`);
      if (m.tags.includes('undead')) assert.ok(['skeleton', 'zombie', 'wraith'].includes(m.family), m.id + ' 언데드 가족');
    }
    // 언데드 태그: 해골·좀비·망령 계열 전부
    for (const m of Monsters.all()) if (['skeleton', 'zombie', 'wraith'].includes(m.family)) assert.ok(m.tags.includes('undead'), m.id + ' undead 태그');
    // 능력 정의
    const abil = Monsters.abilities().map((id) => Monsters.ability(id));
    assert.ok(abil.length >= 12, '능력 ' + abil.length);
    for (const t of ABILITY_TYPES) assert.ok(abil.some((a) => a.type === t), '능력 type ' + t);
    for (const a of abil) {
      assert.ok(a.id && a.name && typeof a.windup === 'number' && typeof a.cooldown === 'number' && ['tank', 'random', 'healer', 'self'].includes(a.targetRule), a.id);
      if (['aoe_circle', 'puddle', 'cone'].includes(a.type)) { assert.ok(a.windup >= 3 && a.windup <= 5, `${a.id} windup ${a.windup}`); assert.ok(a.radius > 0, a.id + ' radius'); }
      if (a.type === 'puddle') assert.ok(a.duration > 0 && a.dpsMult > 0, a.id);
      if (a.type === 'aoe_circle' || a.type === 'cone' || a.type === 'charge') assert.ok(a.dmgMult > 0, a.id);
      if (a.type === 'summon') { assert.ok(a.summon.count >= 2 && a.summon.count <= 4, a.id + ' 소환 수'); assert.ok(Monsters.get(a.summon.id), a.id + ' 소환 대상'); }
      if (a.type === 'curse_volley') for (const c of a.curses) assert.ok(CURSE_IDS.includes(c), `${a.id} 저주 ${c}`);
    }
    // 소환 변형·원형 크기별·장판·부채꼴·돌진·격노·자가회복·포효
    assert.ok(abil.filter((a) => a.type === 'summon').length >= 8, '소환 변형');
    assert.ok(new Set(abil.filter((a) => a.type === 'aoe_circle').map((a) => a.radius)).size >= 3, '원형 크기별');
    assert.ok(Monsters.abilities().includes('roar') && Monsters.abilities().includes('enrage') && Monsters.abilities().includes('heal_self') && Monsters.abilities().includes('charge'));
    assert.strictEqual(Floors.COUNT, 10);
    // 중간보스는 층마다 3, 전부 miniboss 티어, 원본보다 크고 능력 1개 이상
    for (let f = 1; f <= 10; f++) {
      const fl = Floors.get(f);
      assert.strictEqual(fl.minibosses.length, 3, f + '층 중간보스');
      for (const id of fl.minibosses) {
        const m = Monsters.get(id), b = Monsters.get(m.baseId);
        assert.strictEqual(m.tier, 'miniboss', id);
        assert.ok(m.size > b.size && m.base.hp > b.base.hp * 3 && m.abilities.length >= 1 && m.abilities.length <= 3, id);
      }
    }
    assert.strictEqual(new Set(Floors.all().flatMap((fl) => fl.minibosses)).size, 30, '중간보스 id 가 층마다 다름');
  },

  '층 보스 10마리: 능력 ≥ 4(10층 드래곤 ≥ 5), summon 필수(abilities 와 어떤 phase 에 모두), phases 는 1.0 부터 내림차순, phaseFor/abilitiesFor'(assert) {
    const { Monsters, Floors } = boot();
    const expectFamily = { 1: 'goblin', 2: 'spider', 3: 'werewolf', 4: 'siren', 5: 'troll', 6: 'golem', 7: 'naga', 8: 'orc', 9: 'wraith', 10: 'dragon' };
    for (let f = 1; f <= 10; f++) {
      const b = Monsters.get(Floors.get(f).boss);
      assert.strictEqual(b.tier, 'boss', f + '층 보스');
      assert.strictEqual(b.family, expectFamily[f], `${f}층 보스 가족`);
      assert.ok(b.size === 3 && Monsters.isBoss(b));
      assert.ok(b.abilities.length >= (f === 10 ? 5 : 4), `${f}층 보스 능력 ${b.abilities.length}`);
      const summons = b.abilities.filter((id) => Monsters.ability(id).type === 'summon');
      assert.ok(summons.length >= 1, `${f}층 보스 summon 없음`);
      assert.ok(b.phases.some((p) => p.abilities.some((id) => summons.includes(id))), `${f}층 보스 phases 에 summon 없음`);
      // 소환 부하는 그 보스와 같은 비오임의 일반 몬스터
      for (const sid of summons) { const s = Monsters.get(Monsters.ability(sid).summon.id); assert.strictEqual(s.tier, 'normal'); assert.ok(s.biome.includes(Floors.get(f).biome), sid); }
      // 핵심 패턴 중 둘 이상(aoe_circle/puddle/curse_volley/charge/enrage)
      const types = new Set(b.abilities.map((id) => Monsters.ability(id).type));
      assert.ok(['aoe_circle', 'puddle', 'curse_volley', 'charge', 'enrage', 'cone'].filter((t) => types.has(t)).length >= 2, `${f}층 보스 패턴 다양성`);
      assert.ok(b.phases.length >= 3, `${f}층 보스 phases ${b.phases.length}`);
      assert.strictEqual(b.phases[0].hpBelow, 1.0);
      for (let i = 1; i < b.phases.length; i++) assert.ok(b.phases[i].hpBelow < b.phases[i - 1].hpBelow, '내림차순');
      for (const p of b.phases) for (const id of p.abilities) assert.ok(b.abilities.includes(id), `${b.id} phase 능력 ${id}`);
      assert.ok(b.phases[b.phases.length - 1].abilities.length >= b.phases[0].abilities.length, '후반 페이즈가 더 많은 능력');
    }
    // 9층 망령 왕은 언데드(성스러운 일격 대상), 10층 드래곤은 7개 능력·4페이즈
    assert.ok(Monsters.get('boss_wraith_king').tags.includes('undead'));
    assert.ok(Monsters.get('boss_dragon').abilities.length >= 5 && Monsters.get('boss_dragon').phases.length >= 4);
    const d = Monsters.get('boss_dragon');
    assert.strictEqual(Monsters.phaseFor(d, 1.0).hpBelow, 1.0);
    assert.strictEqual(Monsters.phaseFor(d, 0.8).hpBelow, 1.0);
    assert.strictEqual(Monsters.phaseFor(d, 0.75).hpBelow, 0.75);
    assert.strictEqual(Monsters.phaseFor(d, 0.1).hpBelow, 0.25);
    assert.ok(Monsters.abilitiesFor(d, 0.1).includes('summon_drakes') && !Monsters.abilitiesFor(d, 1.0).includes('summon_drakes'));
    same(assert, Monsters.abilitiesFor(Monsters.get('goblin'), 0.5), []);
    assert.strictEqual(Monsters.phaseFor(Monsters.get('goblin'), 0.5), null);
  },

  '난이도 단조 증가: mult/curseMult/levelRange/monsterCount, 1~5층 완만(≤1.35) 6층부터 급증(≥1.8), 저주 6층부터 2배, statsAt 도 층이 오르면 커짐'(assert) {
    const { Monsters, Floors } = boot();
    let prev = null;
    for (let f = 1; f <= 10; f++) {
      const fl = Floors.get(f);
      assert.strictEqual(fl.floor, f); assert.strictEqual(fl.chapter, f);
      assert.ok(fl.mult.hp > 0 && fl.mult.atk > 0 && fl.mult.def > 0 && fl.curseMult > 0 && fl.xpMult > 0 && fl.goldMult > 0, f + '층 배수');
      if (prev) {
        for (const k of ['hp', 'atk', 'def']) assert.ok(fl.mult[k] > prev.mult[k], `${f}층 mult.${k}`);
        assert.ok(fl.curseMult >= prev.curseMult && fl.xpMult > prev.xpMult && fl.goldMult > prev.goldMult, f + '층 curse/xp/gold');
        assert.ok(fl.levelRange[0] >= prev.levelRange[0] && fl.levelRange[1] >= prev.levelRange[1], f + '층 levelRange');
        assert.ok(fl.monsterCount >= prev.monsterCount, f + '층 monsterCount');
      }
      prev = fl;
    }
    assert.strictEqual(Floors.get(1).mult.hp, 1.0); assert.ok(Floors.get(5).mult.hp <= 1.35 && Floors.get(5).mult.hp >= 1.3);
    assert.ok(Floors.get(6).mult.hp >= 1.8 && Floors.get(10).mult.hp >= 3.6, '동굴 급증');
    assert.ok(Floors.get(6).mult.hp - Floors.get(5).mult.hp > Floors.get(5).mult.hp - Floors.get(4).mult.hp, '6층에서 점프');
    assert.ok(Floors.get(6).curseMult >= 2 * Floors.get(1).curseMult && Floors.get(5).curseMult <= 1.25, '저주 배수');
    same(assert, Floors.get(1).levelRange, [1, 3]); same(assert, Floors.get(10).levelRange, [18, 22]);
    // 같은 몬스터도 높은 층에서 더 세다(숲 공용 해골 3→9층, 오크 4→8층), 수치는 정수
    for (const [id, a, b] of [['skeleton', 3, 9], ['orc', 4, 8], ['bat', 6, 10], ['boss_goblin_king', 1, 5]]) {
      const lo = Monsters.statsAt(Monsters.get(id), a), hi = Monsters.statsAt(Monsters.get(id), b);
      for (const k of ['hp', 'atk', 'def', 'xp']) { assert.ok(hi[k] > lo[k], `${id} ${k} ${a}→${b}`); assert.ok(Number.isInteger(hi[k]), `${id} ${k} 정수`); }
      assert.ok(hi.gold[0] > lo.gold[0] && hi.gold[1] >= hi.gold[0]);
    }
    // 동굴 몬스터의 perFloor 는 6층부터 누적된다(1층 기준으로 7번 누적되지 않음)
    const bat6 = Monsters.statsAt(Monsters.get('bat'), 6);
    assert.strictEqual(bat6.hp, Math.round(Monsters.get('bat').base.hp * Floors.get(6).mult.hp * Monsters.TEMPO.cave.hpNormal));
    // 저주 확률은 층 배수를 탄다(최대 0.95)
    const sp = Monsters.get('spider');
    assert.ok(Monsters.curseChance(sp, 'dot', 2) > Monsters.curseChance(sp, 'dot', 1));
    assert.strictEqual(Monsters.curseChance(sp, 'root', 1), 0);
    assert.ok(Monsters.curseChance(Monsters.get('boss_naga_priestess'), 'heal_down', 10) <= 0.95);
    // 보스 HP 는 층이 오를수록 커진다(실전값 기준)
    let prevHp = 0;
    for (let f = 1; f <= 10; f++) { const hp = Monsters.statsAt(Monsters.get(Floors.get(f).boss), f).hp; assert.ok(hp > prevHp, f + '층 보스 HP'); prevHp = hp; }
  },

  '층 데이터: 10층 전부, 숲 1~5·동굴 6~10, pool 이 biome 과 맞음, 이름 한국어, monsterCount 300~360, landmarks ≥ 6(대사 기본 장소명 포함), forFloor'(assert) {
    const ctx = load([...FILES, 'core/data_dialogue.js']);
    const { Monsters, Floors } = ctx;
    same(assert, Floors.list(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.strictEqual(Floors.get(11), null);
    for (let f = 1; f <= 10; f++) {
      const fl = Floors.get(f);
      assert.strictEqual(fl.biome, f <= 5 ? 'forest' : 'cave', f + '층 biome');
      assert.ok(/[가-힣]/.test(fl.name) && fl.name.length >= 3, f + '층 이름 ' + fl.name);
      assert.ok(fl.monsterCount >= 300 && fl.monsterCount <= 360, f + '층 monsterCount ' + fl.monsterCount);
      assert.ok(fl.pool.length >= 4 && fl.pool.every((p) => p.weight > 0), f + '층 pool');
      for (const m of floorMonsters(ctx, f)) assert.ok(m.biome.includes(fl.biome), `${f}층 ${m.id} biome ${m.biome}`);
      assert.ok(fl.landmarks.length >= 6 && fl.landmarks.every((s) => typeof s === 'string' && /[가-힣]/.test(s)), f + '층 landmarks');
      assert.strictEqual(new Set(fl.landmarks).size, fl.landmarks.length, f + '층 랜드마크 중복');
      assert.ok(fl.landmarkDefs.length === fl.landmarks.length && fl.landmarkDefs.every((l) => /^[a-z0-9_]+$/.test(l.id) && l.kind), f + '층 landmarkDefs');
      assert.ok(fl.landmarkDefs.some((l) => l.kind === 'boss'), f + '층 보스 랜드마크');
      // NPC 대사의 기본 장소명이 실제 랜드마크 이름과 같아야 힌트가 맞아떨어진다
      for (const place of ctx.Dialogue.FALLBACK_PLACES[f]) assert.ok(fl.landmarks.includes(place), `${f}층 대사 장소 '${place}' 가 landmarks 에 없음`);
      same(assert, Monsters.forFloor(f), fl.pool);
      assert.ok(Floors.levelFor(f) >= fl.levelRange[0] && Floors.levelFor(f) <= fl.levelRange[1]);
      assert.strictEqual(Floors.landmark(f, fl.landmarks[0]).name, fl.landmarks[0]);
    }
    assert.strictEqual(new Set(Floors.all().map((f) => f.name)).size, 10, '층 이름 중복');
    same(assert, Monsters.forFloor(99), []);
    assert.ok(Floors.isForest(3) && !Floors.isForest(6));
    assert.strictEqual(Floors.nameOf(1), '속삭이는 숲 입구');
    // 숲 1~5층에서 숲 전용 종이 전부 한 번은 나오고, 동굴 6~10층에서 동굴 전용 종이 전부 나온다
    const seen = new Set(Floors.all().flatMap((fl) => fl.pool.map((p) => p.id)));
    for (const m of Monsters.normals()) assert.ok(seen.has(m.id), m.id + ' 가 어느 층 pool 에도 없음');
  },

  "힐러 겨냥: 'healer' targetRule 은 6층부터만, 1~5층 광역기는 전부 탱커 중심, 6~10층엔 매 층 힐러 겨냥 능력이 있다"(assert) {
    const ctx = boot(); const { Monsters, Floors } = ctx;
    const rulesOnFloor = (f) => new Set(floorMonsters(ctx, f).flatMap(allAbilityIds).map((id) => Monsters.ability(id)).map((a) => a.targetRule + ':' + a.type));
    for (let f = 1; f <= 5; f++) {
      const rules = rulesOnFloor(f);
      assert.ok(![...rules].some((r) => r.startsWith('healer:')), `${f}층에 힐러 겨냥 ${[...rules]}`);
      for (const r of rules) if (/aoe_circle|puddle|cone/.test(r)) assert.ok(r.startsWith('tank:'), `${f}층 광역기는 탱커 중심: ${r}`);
      assert.ok(!Floors.targetsHealer(f) && Floors.tankThreatMult(f) === 4);
    }
    for (let f = 6; f <= 10; f++) {
      assert.ok([...rulesOnFloor(f)].some((r) => r.startsWith('healer:')), `${f}층에 힐러 겨냥 없음`);
      assert.ok(Floors.targetsHealer(f) && Floors.tankThreatMult(f) === 2.5);
    }
    // 힐러 겨냥 능력을 가진 몬스터는 동굴 전용
    for (const m of Monsters.all()) if (allAbilityIds(m).some((id) => Monsters.ability(id).targetRule === 'healer')) assert.ok(!m.biome.includes('forest'), m.id);
  },

  '퀘스트 연동: QuestData 의 kill 대상(가족/태그)이 요구 층 pool 에 존재, 이름은 Monsters.get 으로 찾힘'(assert) {
    const ctx = load([...FILES, 'core/data_quests.js']);
    const { Monsters, Floors, QuestData } = ctx;
    const matches = (m, target) => target === 'any' || m.id === target || m.family === target || m.tags.includes(target);
    let checked = 0;
    for (const q of QuestData.all()) {
      const reqFloor = (q.requires && q.requires.floor) || q.floor || null;
      for (const o of q.objectives) {
        if (o.type !== 'kill') continue;
        const floor = o.floor || reqFloor;
        const where = floor ? floorMonsters(ctx, floor) : Monsters.all();
        assert.ok(where.some((m) => matches(m, o.target)), `${q.id}: ${floor || '아무'}층에 '${o.target}' 없음`);
        checked++;
      }
    }
    assert.ok(checked >= 20, '검사한 kill 목표 ' + checked);
    // 가족 이름이 계약 목록과 같다(퀘스트/도감이 가족으로 묶는다)
    const fam = Monsters.families();
    for (const f of ['goblin', 'wolf', 'spider', 'troll', 'orc', 'werewolf', 'siren', 'sprite', 'skeleton', 'zombie', 'sheepie', 'bat', 'golem', 'naga', 'wraith', 'drake', 'dragon']) assert.ok(fam.includes(f), '가족 ' + f);
    assert.strictEqual(Monsters.get('nope'), null);
    assert.strictEqual(Monsters.ability('nope'), null);
  },
};
