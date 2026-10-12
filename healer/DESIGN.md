# 모두의 힐러 — 게임 설계 계약 (DESIGN.md)

이 문서는 여러 사람이(에이전트가) 동시에 구현해도 서로 맞물리도록 **모듈 경계·데이터 스키마·API** 를 고정한다. 구현자는 자기 모듈 밖의 API 를 이 문서대로만 사용한다. 문서와 다르게 해야 하면 문서를 먼저 고치고 그 이유를 적는다.

## 0. 원칙
- 순수 브라우저 JS(ES2020), 번들러 없음. 파일마다 전역 객체 하나를 노출한다:
  ```js
  const Foo = (() => { /* ... */ return { ... }; })();
  if (typeof module !== 'undefined') module.exports = Foo;
  ```
  다른 모듈은 전역 이름(`State`, `Combat` …)으로 참조한다. 노드 테스트에서는 `tools/load.js` 가 같은 전역 컨텍스트에 파일을 순서대로 로드한다.
- `js/core/**` 는 **DOM/canvas 를 쓰지 않는다**(노드에서 실행·테스트 가능). `js/ui/**`, `js/scenes/**`, `main.js` 만 DOM 을 쓴다.
- 좌표는 월드 px. `TILE = 32`. 타일 격자 `(i, j)` = `(floor(x/32), floor(y/32))`.
- 시간: 게임 루프 `dt`(초). 전투·이동은 실시간.
- 난수: `RNG.make(seed)` 결정적 생성기. 던전은 층별 고정 시드 `RNG.floorSeed(floor)` 로 생성해 상자 위치·지형이 항상 같다(NPC 힌트가 맞아떨어져야 하므로). 전투/드랍은 `RNG.global()`.
- 이벤트: `Events.emit(name, payload)` / `Events.on(name, fn)` / `Events.off`. 퀘스트 진행·UI 갱신·통계는 이벤트로만 연결한다(모듈 간 직접 호출 최소화).
- 텍스트(이름, 대사, 설명)는 한국어. 식별자는 영어 snake_case id, camelCase 변수.
- 저장: `State.save()` 가 `localStorage['healer.save']` 에 JSON 저장. 저장 불가 환경(노드)에서는 무시.

## 1. 파일과 로드 순서 (index.html)
```
js/pixel.js  js/sprites.js  js/town.js                       (그래픽: 마을·캐릭터)
js/core/rng.js  js/core/events.js
js/core/data_classes.js  js/core/data_skills.js  js/core/data_items.js
js/core/data_monsters.js  js/core/data_dialogue.js  js/core/data_quests.js  js/core/data_story.js
js/core/state.js  js/core/stats.js  js/core/level.js  js/core/inventory.js
js/core/economy.js  js/core/facilities.js  js/core/party.js  js/core/quests.js
js/core/combat/entities.js  js/core/combat/combat.js  js/core/combat/ai_party.js
js/core/combat/ai_healer.js  js/core/combat/ai_monster.js  js/core/combat/loot.js
js/core/dungeon/gen.js  js/core/dungeon/floor.js
js/sprites_monsters.js  js/tiles_dungeon.js  js/fx.js            (그래픽: 몬스터·던전 타일·이펙트)
js/ui/ui.js  js/ui/ui_*.js
js/scenes/scene.js  js/scenes/town_scene.js  js/scenes/dungeon_scene.js
js/main.js
```
테스트: `node healer/tools/run_tests.js` → `healer/tests/*.test.js` 전부 실행. 시뮬레이션: `node healer/tools/sim.js <floor> [seconds]`.

## 2. 상태 (core/state.js)
```js
State.newGame(name) -> G      // 새 게임 (기본 장비, 골드 300, 1레벨)
State.get() -> G              // 현재 상태 (없으면 newGame)
State.save() / State.load() -> bool / State.reset()
State.uid() -> string         // 아이템/엔티티 고유 id
```
```js
G = {
  version: 1,
  player: {
    name: '리프', cls: 'priest', level: 1, xp: 0, statPoints: 0,
    stats: { str, def, agi, sta, int, vit },          // 기본(투자) 스탯
    hp, mp,                                           // 현재값 (최대값은 Stats.derive 로 계산)
    fatigue: 0,                                       // 0~100 피로
    gold: 300, gems: 0,                               // gems: 경매장 리셋권 등 특수 재화
    skillLevels: { heal_basic: 1, cleanse: 1 },       // 사제 스킬 레벨(신전에서 올림)
    equipment: { neck, ring1, ring2, ear, main, off, body, boots, gloves, hat, belt, bag }, // itemInst|null
    bag: [itemInst|null ...], bagSize: 20,            // 가방 칸(가방 장비로 증가)
    belt: [itemId|null, ...],                         // 벨트 칸(벨트 등급별 1~4), 소모품 id 등록 → 전투 중 자동 사용
    engravings: [ { id, stat?, value?, special? } ],  // 각인
    active: { single: 'heal_basic', aoe: 'aoe_2' },   // 현재 선택한 단일힐/광역힐
    settings: { autoHeal: true, autoDodge: false, autoFollow: true },
  },
  party: [ memberInst ... ],                          // 플레이어 제외 최대 4명
  bank: { items: [itemInst ...], gold: 0, size: 60 },
  guild: null | { id, name, level, members: [memberInst...], isOwner },
  quests: { active: [ { id, progress: { [objIndex]: number }, acceptedDay } ], completed: [id],
            daily: { day, offered: [id], done: [id] }, hiddenFound: [chestId] },   // hiddenFound = 찾은 숨겨진 상자 id('f3_hidden2' …), NPC 상자 힌트 제외용
  story: { chapter: 1, flags: {} },
  tower: { highestCleared: 0, records: { [floor]: { clears, bestTime } } },
  auction: { hourIndex, listings: [ { uid, item, price } ], mine: [ { uid, item, price, listedAt } ], resetTickets: 1 },
  adventurer: { day, candidates: [memberInst...] },
  counters: { steps: 0, kills: 0, bossKills: 0, chests: 0, heals: 0 },
  day: 1, playTime: 0,
}
memberInst = { uid, name, cls, role: 'tank'|'melee'|'ranged'|'healer', level, xp, stats: {...} (현재 레벨의 1차 스탯 = Classes.statsAt(cls, level)), equipment: { body, main }, hireCost, personality,
             gender: 'm'|'f', hp, mp (현재값, Party.heal/Level.addXp 가 채움), buffs: [], curses: [], guildId? (길드 소속이면 길드 id — 해고 시 명부로 돌아감) }
itemInst   = { uid, id, grade: 'common'|'uncommon'|'rare'|'legendary', affixes: [ { stat, value } ], durability, maxDurability, qty }
```

## 3. 데이터 모듈

### 3.1 직업 (core/data_classes.js) — `Classes`
```js
Classes.list() -> [id]   // 'warrior','mage','hunter','rogue','spellblade','priest','monk'
Classes.get(id) -> { id, name, roles: ['tank','melee'], armor: 'plate'|'leather'|'chain'|'cloth',
                     baseStats: {str,def,agi,sta,int,vit}, growth: {str,...}  // 레벨당 자동 증가(레벨업 때 Level.addXp 가 stats 에 더함)
                     primary: ['str','agi'], skills: [memberSkillId...], atkType: 'melee'|'ranged'|'magic', range: px, atkInterval: s,
                     dmgStat: 'atk'|'matk'|'hybrid' (기본 공격에 쓰는 파생 스탯, 마검사는 atk·matk 평균), desc }
Classes.statsAt(id, level) -> {str..vit}       // 1레벨 기본 + growth×(level-1) 반올림. Party.generateMember 는 이것으로 stats 를 채운다
Classes.growthDelta(id, from, to) -> {str..vit} // 레벨업 증가분(정수, statsAt 과 일치) — Level.addXp 가 사용
Classes.pickRole(id, rng) -> role (전사/무투가 탱커 60%) ; Classes.roleName(role) / armorName(armor) 한국어 ; Classes.canWear(id, armor)
```
역할: 전사/무투가 = 탱커 또는 근딜(파티원 생성 시 role 결정), 마법사/사냥꾼 = 원딜, 도적/마검사 = 근딜, 사제 = 힐러.

### 3.2 스킬 (core/data_skills.js) — `Skills`
```js
Skills.get(id) -> skillDef ; Skills.priest() -> [skillDef] ; Skills.member(cls) -> [skillDef]
skillDef = { id, name, owner: 'priest'|cls, type, castTime, mpCost, cooldown, unlockLevel, maxLevel: 10,
             power: { base, intScale } | { mult }, targets: 1|2|3|'all', radius?, duration?, tick?, buff?: { stat, value }, desc,
             upgradeCost(lv) -> gold }
```
사제 스킬(필수 id, 해금 레벨):
| id | 이름 | type | 시전 | MP | 쿨 | 해금 |
|---|---|---|---|---|---|---|
| heal_basic | 기본 힐 | single_heal | 2.0s | 20 | 0 | 1 |
| cleanse | 저주 해제 | cleanse | 0.5s | 25 | 2s | 1 |
| buff_def | 수호의 축복(방어력↑) | buff | 1.0s | 30 | 8s | 2 |
| aoe_2 | 빛의 물결(무작위 2명) | aoe_heal | 2.5s | 45 | 0 | 3 |
| heal_fast | 빠른 힐 | single_heal | 1.0s | 30 | 0 | 4 |
| buff_atk | 용맹의 축복(공격력↑) | buff | 1.0s | 30 | 8s | 5 |
| aoe_ground | 치유의 성역(바닥힐) | ground_heal | 1.5s | 60 | 12s | 6 |
| smite | 성스러운 일격(언데드) | smite | 1.5s | 25 | 0 | 7 |
| resurrect | 부활 | resurrect | 5.0s | 120 | 60s | 8 |
| heal_instant | 즉시 힐 | single_heal | 0 | 40 | 3s | 9 |
| holy_light | 신성한 빛(필살기, 전원 80%) | ultimate | 0 | 50 | 300s | 10 |
| buff_aspd | 질풍의 축복(공격속도↑) | buff | 1.0s | 30 | 8s | 12 |
| aoe_3 | 빛의 파도(무작위 3명) | aoe_heal | 3.0s | 65 | 0 | 14 |
| buff_spd | 바람의 축복(이동속도↑) | buff | 1.0s | 30 | 8s | 16 |
| buff_eva | 그림자 축복(회피↑) | buff | 1.0s | 30 | 8s | 18 |
| buff_mana | 샘의 축복(마나소비↓) | buff | 1.0s | 30 | 8s | 20 |
- 힐량 = `(power.base + int * power.intScale) * (1 + 0.08 * (skillLv-1))`. 기본힐 base 60/intScale 1.6, 빠른힐 동일 힐량에 시전 2배 빠름·MP 1.5배, 즉시힐 시전 없음·MP 2배. 광역 2명/3명은 단일의 70%. 바닥힐 반경 2.5타일, 6초, 초당 단일 25%. 필살기 전원 80% 회복. 부활은 HP 30%로. 버프 60초, 수치 +20%(마나소비 -25%).
- 스킬 레벨업 비용 `upgradeCost(lv) = 150 * lv * lv` 골드(현재 lv → lv+1). `Skills.upgradeCost(skillId, lv)` 는 만렙이면 `null`.
- 헬퍼: `Skills.healAmount(def, caster, skillLv, target?)` — caster.stats.healPower(파생, 접사·피로 반영)가 있으면 int×1.6 으로 환산해 쓰고 없으면 stats.int. 비율형(holy_light `{pct:0.8, pctPerLevel:0.02}`, resurrect `{pct:0.3, pctPerLevel:0.03}`)은 target 의 maxHp×비율(target 없으면 비율 자체). 바닥힐은 초당(tick: 1) 힐량.
  `Skills.damageAmount(def, caster, skillLv)`(smite, matk 우선), `Skills.buffValue(def, skillLv)`(레벨당 +5%), `Skills.castTime(def, caster)`/`Skills.mpCost(def, caster)`(파생 castSpeed·mpCostMult 반영), `Skills.isHeal(def)`, `Skills.isBuff(def)`, `Skills.canTarget(def, target)`(smite 는 `onlyTags: ['undead']`), `Skills.list()`.
- 버프 `skillDef.buff = { stat: 'def'|'atk'|'aspd'|'spd'|'eva'|'mana', value }`(비율 +0.2, mana 는 -0.25). 엔티티 `buffs` 항목은 `{ id: skillId, stat, value, until }` 로 그대로 복사한다. `prefer: 'tank'|'dps'|'any'|'self'` 는 AI 의 대상 힌트. `Skills.BUFF_STATS` 에 한국어 이름.
파티원 스킬(자동): warrior `taunt`(도발, 위협 ×5, 12s), `cleave`; monk `taunt`, `flurry`; mage `fireball`, `blizzard`(광역); hunter `multishot`; rogue `backstab`(크리); spellblade `blade_rush`. mult 1.5~2.5, 쿨 6~15s.
  shape: `{ id, name, owner, owners?: [cls...] (도발은 전사·무투가 공유), type: 'taunt'|'attack', targets: 1|3|'aoe', radius?, hits?(연타 3), crit?(기습), dash?+range(돌진), dmgType: 'physical'|'magic'|'hybrid', threatMult?(taunt 5), power: { mult }, castTime, cooldown, mpCost, unlockLevel, maxLevel: 1 }`. `Skills.member('priest')` 는 사제 스킬 전체.

### 3.3 아이템 (core/data_items.js) — `Items`
```js
Items.get(id) -> itemDef
Items.generate(opts) -> itemInst|null // opts: { id?, slot?, grade?, floor?, rng?, priestOnly?|cls?, setId?, hands?, armor?, weapon?, qty? }
  // id 없으면 조건에 맞는 장비 템플릿을 weight 로 뽑는다(층 조건으로 후보가 비면 층을 무시해 퀘스트 보상이 비지 않게). rng 생략 시 RNG.global().
  // 등급은 opts.grade 또는 gradeWeights(floor), def.gradeMin 아래면 올린다. 소모품/재료/퀘스트는 등급 common·접사 없음·qty 반영.
Items.make(id, qty?) -> itemInst      // 무작위 요소 없는 생성(상점 재고·보상 소모품·재료)
Items.canUse(def, cls) -> bool        // 재질(Classes.canWear)·무기 종류(WEAPON_CLASSES) 착용 가능 여부. 장신구·가방은 누구나
Items.gradeWeights(floor) -> [ { id, weight } ] ; Items.setBonus(setId, count) ; Items.statsOf(inst) -> 등급·내구도 반영 스탯(UI용)
Items.affixText({stat,value}) -> '시전 속도 +8%' ; Items.gradeName(g) / slotName(s) / kindName(k) ; Items.isStackable(def) ; Items.gradeIndex(g)
Items.affixPool, Items.SETS, Items.GRADES ({ name, mult, priceMult, beltSlots, affixCount, color }), Items.GRADE_ORDER, Items.SLOTS, Items.ARMOR_SLOTS, Items.WEAPON_CLASSES
Items.all() / list() / equipment() / consumables() / materials() / byKind(kind) / forSlot(slot) / recipes() / recipe(id)
itemDef = { id, name, kind: 'equip'|'consume'|'material'|'misc'|'quest', slot?: SLOT, hands?: 'two'|'main'|'off',
            armor?: 'plate'|'leather'|'chain'|'cloth', weapon?: 'staff'|'book'|'sword'|'bow'|'dagger'|'knuckle', baseStats: { def?, int?, mp_regen?, heal_power?, ... },
            gradeMin?, setId?, beltSlots?: 1..4 (belt, 생략 시 등급으로), bagSize?: n (bag), price, currency?: 'gems', icon, desc, weight? (드랍 가중치), levelReq?,
            effect?: { hp?, mp?, hpPct?, mpPct?, cleanse?: n, fatigue?: 증감값(음수면 회복), buff?: { stat, value, duration }, teleport?: 'town', resetTickets?: n } (소모품),
            stack?: 99, shop?: bool (잡화상 판매 여부), tier?: 'basic'|'mid'|'high'|'top' (재료, 분해 등급), floorMin?, floorMax? }
SLOT: 'neck','ring','ear','main','off','body','boots','gloves','hat','belt','bag'
장비가 아닌 인스턴스(소모품·재료·퀘스트)는 durability/maxDurability 가 null 이다. 장비 id 규칙: 재질 방어구 `{armor}_{slot}_{1|2}`(1 숲 1~5층, 2 동굴 6~10층), 세트 `{setId}_{slot}`, 가방 `bag_s/m/l`(+6/+12/+20).
grade 배수(기본 스탯): common 1.0, uncommon 1.25, rare 1.6, legendary 2.2 (`Items.GRADES[grade].mult` 로도 노출). rare 이상 접사 1~3개(rare 1~2, legendary 2~3, 전설은 값 ×1.3; 값은 층이 오를수록 커짐):
  mp_regen(초당 마나), cast_speed(시전 시간 -%), mp_cost(-%), move_speed(+%), heal_power(+%), int(+), vit(+), def(+), crit(+%)
  접사/각인 `{ stat, value }` 의 단위: 퍼센트형(cast_speed, mp_cost, move_speed, heal_power, crit)은 퍼센트 정수(10 = 10%), 평탄형(int, vit, def, mp_regen)은 그대로 더한다 — Stats.derive 가 이 단위로 해석한다.
세트(천, 사제용, 옷/장화/장갑/모자/벨트 5부위): 최소 3세트 ('novice_cloth' 수습, 'forest_leaf' 숲잎, 'cave_crystal' 수정).
  효과: 2셋 → int+10%, 3셋 → 10% 확률 마나 무소비, 4셋 → 10% 확률 기본힐 즉시시전, 5셋 → 10% 확률 광역힐 즉시시전 (`Items.setBonus(setId, count)` 가 활성 효과 목록 반환).
  반환 형식: `[ { pieces: 2, type: 'stat_pct', stat: 'int', value: 10 }, { pieces: 3, type: 'proc', proc: 'free_mana'|'instant_basic'|'instant_aoe', chance: 0.1 } ]` — Stats.derive 가 stat_pct 를 반영하고 proc 은 `derive().procs` 로 Combat 에 넘긴다.
양손지팡이 = main(hands:'two'), 한손지팡이 = main(hands:'main') + 책 = off. 양손 착용 시 off 해제.
소모품: hp 포션 소/중/대(hp 80/250/600), mp 포션 소/중/대(60/180/450), 해독제(저주 1개 해제), 귀환 두루마리, 경매장 리셋권(gems), 음식(피로 -20, 10분 버프).
재료: 가죽, 쇠조각, 마법가루, 수정, 나무, 실, 괴물 이빨, 약초, 거미줄, 월장석, 성수, 용 비늘 (분해 결과·조합 재료). 조합 레시피 ≥ 10개 (`{ id, name, result: itemId, grade, qty, materials: {id: n}, gold }`).
음식 버프는 `G.player.buffs` 에 `{ id: itemId, stat, value, until }` 로 들어간다(시계는 전투 중 battle.time, 아니면 G.playTime — Entities.fromPlayer 는 G.player.buffs 를 엔티티 buffs 로 복사해야 한다).
드랍 아이템은 재질을 가리지 않는다(판금/가죽/사슬도 나옴 → 판매/분해용). 퀘스트 보상은 항상 사제용(천/지팡이/책/장신구).
퀘스트(QuestData.ITEMS)가 참조하는 고정 id — Items 는 이 id 로 정의한다:
  소모품 hp_potion_s/m/l, mp_potion_s/m/l, antidote, scroll_return ; 재료 leather, iron_scrap, magic_powder, crystal, wood, thread, monster_tooth ;
  히든 두루마리 scroll_hidden_f{n} (kind 'quest', Loot.chest 가 hidden 상자에서 줌).
`Items.generate(opts)` 는 `cls: 'priest'`(사제 착용 가능 종류만), `armor: 'cloth'`, `setId`, `hands` 옵션을 받아들인다(퀘스트 보상이 id 없이 slot 으로 요청).
```

### 3.4 몬스터·층 (core/data_monsters.js) — `Monsters`, `Floors`
```js
Monsters.get(id) -> mDef ; Monsters.forFloor(floor) -> [ { id, weight } ] ; Monsters.list()
mDef = { id, name, family, biome: ['forest'|'cave'], tags: ['undead'?,'beast'?,...], tier: 'normal'|'elite'|'miniboss'|'boss',
         base: { hp, atk, def, spd(px/s), aspd(초당 공격 횟수), range(px), threatMult? }, perFloor: { hp, atk, def } (층당 증가),
         floorBase: 1|6 (perFloor 누적 시작 층: 숲 1, 동굴 전용 6), abilities: [abilityId...], curses: [ { id, chance } ], xp, gold: [min,max], loot: lootTableId, size: 1|2|3, sprite: string,
         phases?: [ { hpBelow: 1.0, abilities: [...] }, { hpBelow: 0.7, ... } ]  (보스, hpBelow 내림차순), desc, title? (보스), baseId?/elite: true (중간보스 = 원본 변형, sprite 는 원본 공유) }
Monsters.ability(id) -> { id, name, type: 'aoe_circle'|'puddle'|'cone'|'summon'|'charge'|'curse_volley'|'enrage'|'heal_self'|'roar',
                          windup: 3~5(광역/장판/부채꼴; charge 2.5, roar 2, enrage 1), radius(px), duration?, dmgMult?, dpsMult?(장판 초당 = atk×dpsMult), curse?(장판 안·포효 대상에 거는 저주),
                          angle?(cone, 도), range?(charge), summon?: { id, count 2~4 }, curses?+count+duration (curse_volley), buff?: { atk, aspd } (enrage), pct (heal_self), threatReset? (roar),
                          cooldown, targetRule: 'tank'|'random'|'healer'|'self', desc }
Monsters.statsAt(def, floor) -> { hp, atk, def, spd, aspd, range, xp, gold: [min,max], threatMult? }   // 실전 수치 = (base + perFloor×(floor−floorBase)) × Floors.mult, xp×xpMult, gold×goldMult. Entities.fromMonster 는 이것을 쓴다
Monsters.phaseFor(def, hpRatio) -> phase|null ; Monsters.abilitiesFor(def, hpRatio) -> [abilityId] (hpRatio ≤ hpBelow 인 마지막 페이즈; 일반 몬스터는 abilities 그대로)
Monsters.curseChance(def, curseId, floor) -> 확률 (chance × Floors.curseMult, 최대 0.95) ; Monsters.validate() -> [문제 문자열] ; bosses()/minibosses()/normals()/byTier()/families()/abilities()/isBoss()/isElite()/hasTag()
```
threatMult(0.6~0.8)는 힐러를 잘 노리는 몬스터(동굴 거미·나가 사제·망령·트롤 주술사)에 있고, 탱커 위협 보정에 곱한다(낮을수록 힐러로 잘 넘어감). `Floors.tankThreatMult(f)` = 1~5층 4, 6층부터 2.5.
필수 몬스터 ≥ 24종: 숲(1~5층) 고블린(goblin, goblin_archer, goblin_shaman), 늑대(wolf), 거미(spider), 트롤(troll), 오크(orc, orc_berserker), 늑대인간(werewolf), 세이렌(siren, 호수), 숲 정령(sprite), 해골(skeleton, undead), 좀비(zombie, undead), 셰피(sheepie 양 괴물); 동굴(6~10층) 박쥐(bat), 동굴거미, 골렘(golem_stone, golem_crystal), 나가(naga, naga_priest), 오크 전사장, 트롤 주술사, 망령(wraith, undead), 해골 기사(undead), 드래곤 새끼(drake), 드래곤(dragon, 10층 보스).
층 보스(필수): 1 고블린 왕, 2 거대 거미 여왕, 3 늑대인간 족장, 4 세이렌 여왕, 5 트롤 족장(5층은 "숲의 수호자" 타락한 나무 정령도 가능), 6 돌 골렘 군주, 7 나가 여사제, 8 오크 대족장, 9 망령 왕(언데드), 10 동굴 드래곤. 중간보스 3마리/층(엘리트 변형: 더 크고 능력 1~2개).
보스 패턴: 모든 보스가 최소 4종 능력(aoe_circle, puddle, summon, curse_volley/charge/enrage 중)을 가지며 HP 구간별 phases 로 바뀐다. **summon 패턴 필수**(부하 2~4마리 소환). 10층 드래곤은 5개 이상.
난이도: `Floors.get(f).mult` = { hp, atk, def } 로 1~5층은 1.0→1.35 완만, 6층부터 1.8, 2.1, 2.5, 3.0, 3.6. 저주 확률도 6층부터 2배. 1~5층 광역기는 탱커 위치 중심, 6층부터 힐러를 노리는 능력(targetRule 'healer') 등장.
```js
Floors.get(f) -> { floor, biome: 'forest'|'cave', name, levelRange: [min,max], pool: [ {id, weight} ], minibosses: [id,id,id], boss: id,
                   mult: { hp, atk, def }, curseMult, xpMult, goldMult, monsterCount: 300~360, chapter: f, landmarks: [ '이끼 낀 바위', '폭포', ... ≥6 ],
                   landmarkDefs: [ { id: 'mossy_rock', name: '이끼 낀 바위', kind: 'rock'|'tree'|'water'|'camp'|'ruin'|'crystal'|'path'|'boss' } ], desc }
Floors.all()/list()/biomeOf(f)/isForest(f)/nameOf(f)/levelFor(f)(레벨 범위 중간)/landmark(f, idOrName)/targetsHealer(f)/tankThreatMult(f) ; Floors.COUNT = 10
```
- 각 층 landmarks 의 앞 두 개는 `Dialogue.FALLBACK_PLACES[f]` 와 같은 이름이다(생성기가 없어도 힌트가 맞도록). kind 'boss' 랜드마크는 보스 아레나 자리, 'water' 는 호수/개울 힌트.
- 중간보스 id: 1층 goblin_chief/wolf_alpha/sheepie_big … 10층 drake_elder/golem_crystal_red/naga_dragon_priest (`Floors.get(f).minibosses`). 보스 id: boss_goblin_king, boss_spider_queen, boss_werewolf_chief, boss_siren_queen, boss_troll_chief, boss_golem_lord, boss_naga_priestess, boss_orc_warchief, boss_wraith_king(언데드, '망령 왕 아셀'), boss_dragon('잿빛 드래곤 바르가').
- 경험치: 층 xpMult 는 "그 층 몬스터를 절반쯤 잡으면 levelRange 상한에 닿는" 곡선(1, 3, 5, 6.5, 7.5, 10, 12, 16, 20, 23). 보스 xp 는 층 필요 경험치의 약 10%.

### 3.5 퀘스트 데이터 (core/data_quests.js) — `QuestData`
```js
QuestData.all() -> [questDef] ; QuestData.get(id)
questDef = { id, type: 'main'|'village'|'daily'|'hidden', title, giver: npcId, chapter?, floor? (hidden), requires: { quest?, floor?, level? },
             objectives: [ { type: 'kill', target: monsterId|family|tag|'any', count, floor? } | { type: 'kill_boss', floor? } | { type: 'collect', item, count }
                           | { type: 'chest', floor?, chestId?, count? } | { type: 'talk', npc } | { type: 'visit', facility } | { type: 'clear_floor', floor? }
                           | { type: 'steps', count } | { type: 'heal', amount } ],
             rewards: { gold, xp, items: [ { id?, slot?, grade?, setId?, hands?, qty? } ], gems? }, text: { offer, progress, complete }, hint (NPC 대사용 한 줄) }
QuestData.byType(type) ; byGiver(npcId) ; mainOfChapter(n) ; hiddenForFloor(f) ; questForScroll(itemId) -> questId|null ; hiddenScroll(f) -> itemId ; ITEMS
```
- kill 의 target 은 `monster_killed` 의 id / family / tags 중 하나와 같으면 맞는다('any' 는 전부). floor 가 있으면 그 층에서만. kill_boss/clear_floor/chest 의 floor 가 없으면 아무 층(일일용).
- requires.floor = 그 층에 입장 가능해야 함(`highestCleared + 1 >= floor`). 메인은 `chapter <= G.story.chapter` 도 필요.
- rewards.items: `id` 가 있으면 그 아이템(소모품·재료), 없으면 `slot`(+grade/setId/hands) 으로 사제용 장비를 `Items.generate({ slot, grade, cls:'priest', armor:'cloth', setId, hands, floor, rng })` 로 생성. 히든 보상은 전부 rare/legendary.
필수 분량: 메인 10챕터(각 층 보스 처치로 진행, 1~2개 선행 퀘스트 포함, 총 ≥ 15개), 마을 의뢰 ≥ 20개(층 1~10 분포), 일일 풀 ≥ 12개(하루 3개 제공), 히든 ≥ 10개(각 층 숨겨진 상자에서 두루마리 획득 → 보상 레어/전설 사제 장비). 히든 상자 위치는 `chestId = 'f{floor}_hidden{n}'`, 던전 생성기가 같은 id 로 상자를 만든다.

### 3.6 대사·스토리 (core/data_dialogue.js — `Dialogue`, core/data_story.js — `Story`)
```js
Dialogue.npc(npcId) -> { name, role, sprite, lines: [string], byChapter: { [n]: [string] }, hints: [ { questId?, chestId?, floor?, text } ] }
Dialogue.pick(npcId, G, opts?) -> string   // 챕터·진행 상황에 맞는 대사(힌트는 30% 확률로 섞임, 미완료 퀘스트/안 찾은 상자 우선; opts.hintChance 로 조정)
Dialogue.greet(npcId, G) -> [string]       // 대화창용 2~3줄: 인사 → 대사 → (그 NPC 의 수주 가능 퀘스트 안내 | 추가 대사)
Dialogue.hintsFor(npcId, G) -> [string]    // 지금 유효한 우선 힌트(미완료 퀘스트·안 찾은 상자) ; Dialogue.ids() ; Dialogue.name(npcId) ; Dialogue.placeOf(floor, chestId)
npcId: 'guard1','guard2','priest_elder'(신전 장로, 스승),'smith','merchant1','merchant2','innkeeper','banker','engraver','auctioneer','guildmaster','adventurer_clerk', 'villager_a'…'villager_e', 'child_a','child_b'
Story.chapters[n] -> { n, title, floor, intro: [string] (층 진입 시), outro: [string] (보스 처치 후), townEvent?: { npc, lines } }
Story.prologue -> [string] ; Story.epilogue10 -> [string] ; Story.chapter(n) ; Story.forFloor(f) ; Story.townEvent(n) ; Story.NAMES (고유명사)
```
- 상자 힌트의 `{place}` 는 pick/greet 시점에 `DungeonGen.generate(floor).chests[chestId].landmarkId` 의 랜드마크 이름으로 치환된다(생성기가 없으면 Dialogue.FALLBACK_PLACES 의 층별 기본 장소명). 치환 결과는 층별로 캐시.
- `sprite` 는 마을 씬이 쓸 기존 Sprites kind('knight','priest','smith','merchant','villagerA'…'villagerE','child').
- `priest_elder` 는 1~5챕터엔 탑에 갇혀 있어 신전의 '기도의 수정' 너머 목소리("(수정 너머로) …")로만 말하고, 6챕터부터 직접 대화한다. 마을 씬은 1~5챕터 동안 신전 앞 NPC 를 수정/제단으로 그려도 되고 그대로 두어도 된다.
- 먼 층(현재 도전 가능 층 + 2 이상)의 힌트는 스포일러라 숨긴다.
줄거리(고정): 평화롭던 '라일라 마을' 옆에 어느 날 '잿빛 탑'이 솟아 괴물이 쏟아진다. 주인공 리프는 신전의 수습 사제. 스승 '장로 엘다'가 탑 5층에서 실종. 1~5층 숲(탑이 삼킨 숲)에서 스승의 흔적을 좇고 5층에서 스승을 구한다(트롤 족장). 6~10층 동굴에서 탑의 심장을 지키는 드래곤과 그 배후(망령 왕=옛 사제)의 진실을 알게 되고 10층 드래곤을 꺾어 1부가 끝난다(99층까지 이어질 떡밥).

## 4. 파생 스탯·레벨 (core/stats.js — `Stats`, core/level.js — `Level`)
```js
Stats.derive(entityLike, G?, now?) -> { maxHp, maxMp, atk, matk, def, healPower, evasion, crit, moveSpeed, atkSpeed, castSpeed, mpRegen, mpCostMult, fatigueMult,
                                        str, def, agi, sta, int, vit (장비 반영 후 1차 스탯), fatigueGainMult, healTakenMult, rooted, procs, specials, level }
  // entityLike = G.player | memberInst | 전투 엔티티 { src: 원본(G.player|memberInst), buffs, curses }. equipment 가 없어도 동작.
  // 저장된 stats(현재 레벨 1차 스탯, 성장은 Level.addXp 가 더함) + 장비 baseStats×등급(내구도 0 이면 그 장비 효과 절반) + 접사 + 세트(플레이어는 Inventory.activeSets, 없으면 장비 setId 직접 집계) + 각인 + 버프/저주 + 피로
  // maxHp = 50 + vit*12 + level*8 ; maxMp = 30 + int*9 + level*5 ; atk = str*2 + agi*0.5 ; matk/healPower = int*1.6 (healPower 는 heal_power% 반영) ; def = def ; evasion = agi*0.4 % (최대 40, 버프 포함 70)
  // crit = 5 + agi*0.25 (+crit 접사, 최대 60) % ; moveSpeed = 120*(1+agi*0.004)*(1+move_speed%) px/s ; atkSpeed = 1 + agi*0.003 (공격 간격 = atkInterval/atkSpeed)
  // castSpeed = 1/(1+cast_speed%) (시전 시간 배수) ; mpRegen = 1 + int*0.05 + mp_regen /s ; mpCostMult = 1 - mp_cost%
  // fatigueMult = 1 - fatigue/200 → atk/matk/healPower/mpRegen 에만 곱한다(최대 HP/MP 는 유지) ; fatigueGainMult = 1/(1+sta*0.02) (지구력: 피로 증가량 배수, Floor 가 사용)
  // 버프 { stat: 'def'|'atk'|'aspd'|'spd'|'eva'|'mana', value, until } → 해당 수치 ×(1+value) (eva 는 +value*100 포인트, atk 는 atk·matk 모두). 1차/퍼센트 스탯 이름의 버프(음식 { stat:'int', value:0.1 })는 그 스탯 +비율.
  // 저주 { id, until }: def_down ×0.7, atk_down ×0.7, aspd_down ×0.7, spd_down ×0.6, heal_down → healTakenMult 0.5, root → moveSpeed 0·rooted true, dot 은 스탯 변화 없음. now 를 주면 until<=now 인 버프/저주는 무시.
Stats.applyStatus(base, { buffs, curses }, now?) -> derived   // 몬스터처럼 1차 스탯이 없는 대상: 기본 수치({maxHp, atk, def, moveSpeed, atkSpeed...})에 버프/저주만. 항상 base 기준 새 객체라 반복 호출해도 배수가 안 겹친다.
Stats.CURSES[id] -> { name(한국어), desc } ; Stats.curseName(id) ; Stats.PRIMARY ; Stats.NAMES ; Stats.statName(k) ; Stats.gradeMult(grade)
Level.xpForLevel(lv) -> number   // lv-1 → lv 필요량. 1→2 = 100, 88k+12k² (10레벨 1,764 / 40레벨 21,684), 40 만렙, 41 이상 Infinity ; Level.totalXpTo(lv)
Level.addXp(entity, xp, G?) -> { levelsGained, level, from, newSkills }   // 플레이어·파티원 공통. xp 는 현재 레벨에서 쌓은 양(초과분 이월, 만렙이면 0)
  // 레벨업: Classes.growthDelta 를 stats 에 더함. 플레이어는 statPoints += 5/레벨, 새로 해금된 사제 스킬은 skillLevels[id] = 1. hp/mp 전부 회복.
  // Events 'level_up' { entity, uid, name, isPlayer, from, level, levelsGained, newSkills } 는 여러 레벨이 한 번에 올라도 호출당 1회.
Level.allocate(G, stat, n) -> { ok, reason?: 'bad_stat'|'bad_count'|'not_enough_points' } ('stat_allocated' 이벤트)
Level.unlockedSkills(level) -> [skillId] (사제, 해금순) ; Level.newlyUnlocked(from, to) ; Level.skillLevel(G, id) -> n (해금 전 0) ; Level.progress(entity) -> { level, xp, need, pct, max }
```

## 5. 인벤토리·경제·시설 (core/inventory.js — `Inventory`, core/economy.js — `Economy`, core/facilities.js — `Facilities`)
```js
Inventory.add(G, itemInst) -> bool(전부 못 들어가면 false, 아무것도 안 바뀜) ; remove(G, uid, qty?) -> 뺀 수량 ; consume(G, itemId, qty) -> bool ; find(G, uid) (가방+장비) ; locate(G, uid) -> { where: 'bag'|'equip', index|slot, inst } ; count(G, itemId)
  // 스택(stack>1)은 기존 스택에 합치고 넘치면 새 칸(새 uid). 모든 획득은 add 를 거치므로 'item_gained' { id, qty, uid, inst } 는 여기서만 낸다. remove 는 'item_removed'.
Inventory.bagSize(G) -> 20 + 가방 장비 bagSize ; ensureBag(G) (bag 배열 길이 맞춤) ; items(G) ; emptySlots(G) ; isFull(G)
Inventory.equip(G, uid) -> { ok, slot?, unequipped?: [inst], reason?: 'not_found'|'not_equip'|'wrong_armor'|'wrong_weapon'|'level'|'bag_full' }
  // 재질은 Items.canUse(def, G.player.cls)(사제는 천만), 무기는 지팡이/책만. 양손 지팡이 → off 해제, 책(off) → 양손 main 해제. 반지는 빈 ring1/ring2 우선, 둘 다 차면 ring1 교체.
  // 벗은 장비는 가방으로(장착하는 칸이 비므로 꽉 차도 1:1 교체는 됨). 가방 장비 교체는 "새 칸 수"에 들어가야 하고, 벨트 교체는 belt 배열을 새 칸 수로 자른다. 'equip_changed' { slot, uid, id, unequipped }.
Inventory.unequip(G, slot) -> { ok, inst?, reason?: 'empty'|'bag_full' } ; Inventory.canEquip(G, inst) ; Inventory.equipped(G) -> [ { slot, inst } ] ; Inventory.wear(G, amount, slots?) (내구도 감소, 기본 가방·벨트 제외)
Inventory.setBelt(G, idx, itemId|null) -> bool (소모품만) ; Inventory.beltSlots(G) -> n (벨트 없음 1, def.beltSlots 또는 Items.GRADES[grade].beltSlots = 1/2/3/4) ; syncBelt(G) ; 'belt_changed'
Inventory.activeSets(G) -> [ { setId, count, bonuses } ] (1개만 껴도 count 1·bonuses [] 로 나와 UI 가 n/5 표시)
Inventory.useConsumable(G, itemId, targetEntity?, now?) -> bool  // 대상 생략 시 G.player. hp/mp 는 maxHp/maxMp(엔티티) 또는 Stats.derive 상한. cleanse 는 root > heal_down > dot > 나머지 순.
  // fatigue 는 G.player.fatigue 증감(0~100), buff 는 대상 buffs 에 { id: itemId, stat, value, until: now + duration }(같은 음식은 갱신), teleport 는 'return_town' { to } 이벤트만, resetTickets 는 G.auction.resetTickets 증가.
  // 성공 시 'consumable_used' { id, effect, targetUid, isPlayer }. Combat 의 벨트 자동 사용은 useConsumable(G, itemId, playerEnt, battle.time).
Economy.buyPrice(def|inst|id) = price × Items.GRADES[grade].priceMult(1/1.6/3/8) × (1 + 0.1×접사 수) (소모품·재료는 price 그대로) ; Economy.currency(def) -> 'gold'|'gems'
Economy.sellPrice(inst) = floor(buyPrice × 0.4 × (0.5 + 0.5×내구도 비율)) × qty (퀘스트 아이템·보석 아이템은 0) ; Economy.repairCost(inst) = ceil(buyPrice × 손상비율 × 0.3)
Economy.disassemble(inst, rng) -> [itemInst materials]  // 재질별 기본 재료(천 실, 가죽 가죽, 사슬·판금 쇠조각, 지팡이 나무, 책 실, 장신구 쇠조각, 가방 가죽) + 등급별 추가: common 1개, uncommon 1~2, rare 2~3(mid/high), legendary 3 + 용 비늘
Economy.disassemblePreview(inst) -> [materialId] ; Economy.canCraft(G, recipe) -> { ok, reason?: 'no_recipe'|'gold'|'materials', missing? } (대장간 craft 가 사용)
// 모든 시설 함수는 { ok, reason?, ... } 를 돌려준다(UI 토스트용). 실패하면 골드/아이템은 그대로. 가방이 차서 못 받는 결과물(분해 재료·조합품)은 G.bank.items 로 간다(toBank).
Facilities.shop.stock(G) -> [ { id, name, icon, kind, price, currency, def } ] (포션·기본 재료 5종·기본 사제 장비 9종, 일반 등급) / buy(G, itemId, qty) -> { ok, item, cost } (reason 'not_sold'|'bad_qty'|'gold'|'bag_full') / sell(G, uid, qty?) -> { ok, gold, qty } ('not_found'|'unsellable'|'bad_qty')
Facilities.auction.listings(G, now?) (현실 시간 1시간마다 `hourIndex = floor(Date.now()/3600000)` 로 재생성, 시드 = hourIndex, 12~20개, 사제용 50%, 층 진행도(highestCleared+1) 반영, 재료 묶음 15%) / buy(G, uid, now?) / list(G, uid, price, now?) (최대 8개) / tick(G, now?, rng?) -> { ok, sold: [entry] } (적정가 Economy.buyPrice×qty 의 1.2배 이하만 분당 15% 확률, 최대 240분) / reset(G, now?) (리셋권 소모 후 즉시 재생성: 같은 시간 안에서 다른 시드) / cancel(G, uid) / mine(G) / history(G) / isFair(entry) / hourIndex(now?)
  // now 는 ms(생략 시 Date.now()). G.auction 에 resets, generated, sold(최근 20건) 가 추가되고 mine 항목은 { uid, item, price, listedAt, checkedAt, fair } 이다.
Facilities.bank.deposit(G, uid) / withdraw(G, uid) ('not_found'|'bank_full'|'bag_full') / depositGold(G, n) / withdrawGold(G, n) ('bad_amount'|'gold'|'bank_gold') / items(G) / capacity(G) -> { used, size, gold }
Facilities.smithy.repair(G, uid) (가방+장착품, 'not_found'|'not_equip'|'not_damaged'|'gold') / repairAll(G) -> { ok, cost, count } / disassemble(G, uid, rng?) -> { ok, materials, toBank } (가방 안 장비만) / craft(G, recipeId, rng?) -> { ok, item?, toBank, cost, reason?: 'no_recipe'|'gold'|'materials', missing? } / recipes(G)
Facilities.inn.menu() -> [ { id, name, icon, price, fatigue: -20|-35|-50, buff, desc } ] (보리빵/숲 열매 파이/사슴 고기 스튜 — 여관에서 먹는 피로 회복량은 메뉴 값, 가방에서 쓰는 같은 음식은 Items.effect 의 -20) / eat(G, foodId, now?) (G.player.buffs 에 { id, stat, value, until }, 같은 음식은 갱신) / sleep(G) (골드 50, 피로 0, day+1, 일일 퀘스트 리셋, HP/MP 회복 = Party.heal, 'day_passed' { day })
Facilities.engraver.options(G) -> [ { id, name, cost, materials, stat?, value?, special?, desc, owned, affordable, missing } ] / engrave(G, id) (최대 각인 수 = 3 + floor(level/10); 'unknown'|'slots_full'|'duplicate'|'gold'|'materials') / erase(G, index) (100골드) / maxSlots(G)
  // 스탯 각인 6종(int/vit/def/heal_power%/cast_speed%/mp_regen, 중복 가능) + 특수 4종(하나씩만). 저장 형식 { id, stat, value } | { id, special: { id, chance, value?, duration? } } — Stats.derive().specials 에 special 객체가 그대로 들어간다:
  //   guard { chance 0.2, value 0.3, duration 5 } 피격 시 방어 +30% 5초 ; evade { chance 0.2 } 회피 ; heal_crit { chance 0.1, value 1.5 } 힐 1.5배 ; mana_refund { chance 0.1 } 시전 마나 환급 — Combat 이 적용한다.
Facilities.temple.cost(G, skillId) -> gold|null (사제 스킬만, 해금 전·만렙 null) / upgrade(G, skillId) -> { ok, level, cost } ('unknown'|'locked'|'max_level'|'gold') / skills(G) -> [ { id, name, level, unlocked, unlockLevel, maxLevel, cost, desc } ]
Facilities.adventurer.candidates(G) (하루 6명, 직업·레벨(플레이어 ±2)·역할·고용비, 시드 RNG.hash('adventurer:'+day) 로 결정적, 탱커·원딜 1명씩 보장) / hire(G, candUid) (최대 4명, 'not_found'|'party_full'|'gold') / dismiss(G, uid) -> { ok, member, returnedToGuild } / board(G) -> 수주 가능한 마을 의뢰(Quests.available 의 type 'village')
Facilities.guild.list(G) -> NPC 길드 3개 [ { id, name, level, levelReq(1/6/12), desc, members: [memberInst×4], joined } ] (명단은 RNG.hash('guild:'+id) 시드로 고정) / join(G, id) ('in_guild'|'unknown'|'level') / leave(G) (파티의 길드원 전원 제거) / create(G, name) (골드 1000, 이름 1~12자) / recruit(G, memberUid) (명부 → 파티, 무료; 한 사람은 명부·파티 중 한 곳에만 있다) / enlist(G, memberUid) (내 길드에 현재 파티원 등록, 오너만) / current(G) / roster(G)
Facilities.visit(id) -> 'facility_visit' { id } 이벤트 ; Facilities.IDS ; Facilities.NAMES (한국어)
```
시설 이벤트: 'gold_changed' {gold, delta}, 'shop_bought', 'shop_sold', 'auction_refreshed', 'auction_bought', 'auction_listed', 'auction_sold' {item, price}, 'bank_changed', 'item_repaired', 'item_disassembled', 'item_crafted', 'meal_eaten', 'day_passed' {day}, 'engraved', 'skill_upgraded' {id, level, cost}, 'candidates_refreshed', 'party_changed' {action, member, count} (Party 가 냄), 'party_healed', 'guild_changed' {action, guild}.
피로: 100걸음당 +1, 몬스터 무리 전투당 +2, 보스 +5, 사망 +10. 피로 ≥ 100 이면 던전 입장 불가.
내구도: 장비 피격·시전 시 서서히 감소, 0 이면 효과 절반. 수리비 = 가격 × 손상비율 × 0.3.

## 6. 파티 (core/party.js — `Party`)
```js
Party.generateMember(rng, level, opts?) -> memberInst  // 직업·역할·이름(한국어 2~3글자)·성격 한 줄. stats = Classes.statsAt(cls, level), role = Classes.pickRole(cls, rng)
  // opts: { cls?, role?, name?, gender?, personality? } (길드 고정 파티원용). 장비 = 직업 재질 옷 `{armor}_body_{1|2}` + 직업 무기(1~5층 레벨이면 1티어, 6층부터 2티어), Items.generate 로 생성(등급 일반 70/고급 25/레어 5). hireCost = 100 + level×40. 이름 풀 남녀 각 40명 이상.
Party.members(G) -> [memberInst] ; Party.roles(G) -> { tank: n, melee: n, ranged: n, healer: n } ; Party.find(G, uid) ; Party.isFull(G) ; Party.MAX = 4
Party.add(G, memberInst) -> bool (정원·중복 uid 검사, 'party_changed' {action:'add'}) ; Party.remove(G, uid) -> memberInst|null ('party_changed' {action:'remove'}) — 골드 처리는 시설이 한다
Party.heal(G) (마을 복귀 시 파티원 + 플레이어 HP/MP 전부 회복, 저주 제거, 'party_healed') ; Party.gainXp(G, xp) -> [Level.addXp 결과] (전원 같은 양) ; Party.hireCost(level) ; Party.describe(m) -> '서연 Lv.3 전사(탱커)'
```

## 7. 퀘스트 엔진 (core/quests.js — `Quests`)
```js
Quests.init() (Events 구독, main.js 가 게임 시작 시 1회 호출; 멱등) ; Quests.dispose() ; Quests.handle(name, payload) (직접 호출용)
Quests.available(G, npcId?) -> [questDef] ; Quests.accept(G, id, opts?) -> bool (opts.force: 조건 무시, 히든 수주용) ; Quests.abandon(G, id) (메인은 불가)
Quests.active(G) -> [ { id, def, title, type, progress, acceptedDay, objectives: [ { type, label, current, need, done } ], complete } ]
Quests.canComplete(G, id) ; Quests.complete(G, id) -> rewards { gold, xp, gems, items: [itemInst], toBank: [itemInst], skipped: [spec], levelsGained } | null
Quests.dailyRefresh(G) (day 바뀌면 3개 제공, 지난날 일일 퀘스트 제거; available() 가 알아서 호출) ; Quests.hintsFor(G, npcId) -> [string]
Quests.status(G, id) -> 'available'|'locked'|'active'|'completable'|'completed' ; Quests.objectiveLabel(obj) -> string ; Quests.acceptHiddenByScroll(G, itemId)
```
이벤트 구독: 'monster_killed' {id, family, tags, floor}, 'boss_killed' {id, floor}, 'chest_opened' {chestId, floor, hidden, questScroll?}, 'item_gained' {id, qty}, 'npc_talk' {npcId}, 'facility_visit' {id}, 'floor_cleared' {floor, time}, 'steps' {n}, 'heal_done' {amount}.
- 챕터 진행: 메인 퀘스트 완료 시 그 챕터(`def.chapter === G.story.chapter`)의 메인 퀘스트가 전부 완료되면 `G.story.chapter` 증가 + `G.story.flags['chapter_{n}_done']` + 'chapter_advanced' {chapter, prev}. (선행 퀘스트만으로는 올라가지 않음)
- 히든: 'item_gained' {id:'scroll_hidden_f{n}'} 또는 'chest_opened' {questScroll: questId} 로 자동 수주(force). 'chest_opened' {hidden:true} 는 `G.quests.hiddenFound` 에 chestId 를 쌓고, 이미 찾은 상자가 목표면 수주 즉시 완료 가능.
- collect 목표는 `Inventory.count` 와 동기화(팔면 줄고, 완료 시 `Inventory.remove` 로 소모). Inventory 가 없으면 이벤트 qty 누적.
- 일일 완료는 `daily.done` 에만 기록(completed 에 넣지 않음 → 다른 날 다시 제공 가능). 제공 3개는 `RNG.make(RNG.hash('daily:'+day))` 로 결정적.
- 보상: 골드/보석은 직접, XP 는 `Level.addXp(G.player, xp)`, 장비는 `Items.generate` → `Inventory.add`, 가방이 차면 `G.bank.items` 로(은행장이 대신 받음). 해당 모듈이 없으면 skipped 에 담고 건너뜀.
- 발행 이벤트: 'quest_accepted' {id,type}, 'quest_progress' {id, objIndex, current, need}, 'quest_completable' {id}, 'quest_completed' {id, type, rewards}, 'quest_abandoned' {id}, 'daily_refreshed' {day, offered}, 'chapter_advanced' {chapter, prev}.
- Monsters 는 `family` 를 기본 이름(goblin, wolf, spider, troll, orc, werewolf, siren, sprite, skeleton, zombie, sheepie, bat, golem, naga, wraith, drake, dragon)으로, 언데드는 tags 에 'undead' 를 넣어야 family/tag 기반 퀘스트가 맞는다. Facility id 는 §11 의 UI.open 이름('shop','auction','bank','smithy','inn','engraver','temple','adventurer','guild').

## 8. 전투 (core/combat/*)
```js
Entities.fromPlayer(G) / fromMember(G, m) / fromMonster(mDef, floor, x, y, rng) -> ent
ent = { uid, kind: 'player'|'member'|'monster', name, cls?, role, level, def: mDef?, src?: G.player|memberInst (Stats.derive(ent) 재계산용), x, y, dir, size, radius(px 충돌),
        stats (Stats.derive 결과; 몬스터는 mDef 기반 수치에 Stats.applyStatus), hp, maxHp, mp, maxMp, alive, state: 'idle'|'move'|'attack'|'cast'|'dead',
        target: uid|null, threat: { [uid]: n } (몬스터), buffs: [ { id, stat, value, until } ], curses: [ { id, until, dps? } ],
        cooldowns: { [skillId]: untilTime }, cast: null | { skillId, t, total, target, x?, y? }, atkTimer, speed, sprite, tags, tier,
        home: {x,y} (몬스터 순찰 기준), groupId, aggroRange, leashRange }
  // 구현이 더 쓰는 필드: 공통 range/atkInterval/dmgStat(직업·mDef 에서), 몬스터 base(Stats.applyStatus 의 기준 수치)/abilities/aggro/returning/summonedBy/phase/xp/gold/floor/threatMult, 플레이어 skillLevels
Entities.refresh(ent, G?, now?) -> ent   // 버프/저주가 바뀐 뒤 파생 스탯 재계산(최대 HP/MP·speed 갱신, hp/mp 클램프). Combat 이 상태 변화마다 부른다
Combat.create({ map, player, members, monsters, rng, G?, floor?, autoLoot?, driveHealer?, ai? }) -> battle
  // G 생략 시 State.get(), floor 생략 시 monsters[0].floor. autoLoot(기본 true): 처치 시 골드·Inventory.add·Level.addXp 를 Combat 이 직접 적용(Floor 는 다시 적용하지 말 것).
  // driveHealer(기본 true): battle.update 가 AIHealer.update(player, battle, G, dt) 를 호출한다(Floor/scene 이 또 부르면 안 됨). ai:false 는 AI 전부 끔(테스트용), battle.aiEnabled 로 토글.
battle.update(dt)            // 모든 로직: 이동·어그로·공격·시전·버프/저주 만료·텔레그래프·장판·사망·루팅 이벤트
battle.time ; battle.entities ; battle.player ; battle.members ; battle.monsters ; battle.telegraphs ; battle.groundHeals ; battle.log (최근 메시지)
battle.useSkill(caster, skillId, target?) -> { ok, reason? }   // 시전 시작(캐스팅). 대상 생략 시 AIHealer.pickTarget 로 자동
battle.moveTo(ent, x, y, dt) ; battle.canStand(x, y) ; battle.inCombat() -> bool ; battle.activeMonsters() (활성 반경 20타일 내)
battle.damage(src, dst, amount, opts) ; battle.heal(src, dst, amount) ; battle.applyCurse(dst, curseId, dur) ; battle.cleanse(dst)
  // damage opts: { mult, crit(강제), noEvade, noDef, noCrit, noThreat, type: 'basic'|'magic'|'physical'|'telegraph'|'puddle'|'dot', skillId, abilityId } ; cleanse(dst, n=1) -> [제거한 저주 id]
battle.result -> null | 'wipe'
battle.castAbility(mon, abilityId, target?) -> { ok, reason?, telegraph? }   // 몬스터 능력 시전(windup 동안 cast 상태, 범위기는 텔레그래프 생성). AIMonster 가 쓴다
battle.addMonster(ent) ; battle.engagedMonsters() (aggro 상태) ; battle.allies() (살아 있는 파티) ; battle.party() ; battle.byUid(uid) ; battle.summonCount(owner)
battle.addBuff(ent, buff) ; battle.revive(ent, pct, src?) ; battle.taunt(src, mon, mult) ; battle.addThreat(mon, src, amount) ; battle.topThreat(mon) ; battle.inTelegraph(tg, ent) ; battle.cancelCast(ent, reason) ; battle.logMsg(text)
```
- 위협(어그로): 피해 ×1(탱커는 `Floors.tankThreatMult(floor)` = 1~5층 ×4, 6층부터 ×2.5, 여기에 mDef.threatMult 를 곱함; Floors 없으면 ×3), 도발은 `max(최고 위협, 50) × 5` 로 즉시 1위 + 대상 전환, 힐 ×0.5 가 교전(aggro) 중인 몬스터 전원에 분산. 몬스터는 최고 위협 대상을 공격(현재 대상이 1위의 90% 이상이면 유지). 1~5층은 힐러가 거의 안 맞음, 6층부터 'healer' 타겟 능력 등장.
- 피해 = `max(1, atk × mult − def × 0.5) × (0.9~1.1)`, 회피(dst.evasion%)/크리(src.crit%, ×1.5) 적용. 공격 속도·이동속도는 버프/저주 반영. 파티원 기본 공격은 직업 dmgStat(atk/matk/hybrid), 간격 = atkInterval/atkSpeed ; 몬스터 간격 = 1/aspd, 적중 시 `Monsters.curseChance` 로 저주.
- 텔레그래프: `battle.telegraphs: [ { id, type: 'circle'|'puddle'|'cone'|'line', x, y, r, t, windup, owner, abilityId, dmg?, dps?, duration?, fill: 0~1, resolved } ]` — windup 동안 fill 증가(색 채워짐), 완료 시 circle 은 범위 내 파티에 1회 피해, puddle 은 `active` 가 되어 duration(5s) 동안 0.5초마다 dps×0.5 피해(+`curse` 가 있으면 들어온 사람마다 1회), cone 은 `{ angle(도), facing(rad) }` 부채꼴 1회 피해, line(돌진) 은 `{ x2, y2 }` 선분 폭 r 1회 피해 후 시전자가 끝점으로 이동. 범위기 피해는 회피 불가. `battle.groundHeals` 도 같은 구조(치유의 성역: `{ type:'puddle', fill:1, hps, tick }`, 1초마다 반경 안 아군 회복).
- 저주 id: `dot`(초당 피해 = 최대 HP 2%, `curses[].dps`), `def_down`, `atk_down`, `aspd_down`, `spd_down`, `heal_down`(받는 힐 50%), `root`(이동불가). 10~20초(dur 생략 시). 같은 저주는 시간만 갱신. 죽으면 저주·스킬 버프는 사라지고 음식 버프만 남는다.
- 시전: `ent.cast` 진행 중 이동하면 취소(플레이어, reason 'moved'). 멤버/몬스터는 시전 중 정지. MP 소모·쿨타임은 **시전 완료 때**(취소되면 손해 없음, 완료 시 MP 부족/대상 소실이면 reason 'mp'/'no_target' 으로 취소). useSkill 거부 reason: 'ended'|'no_skill'|'dead'|'casting'|'cooldown'|'locked'|'not_owner'|'mp'|'no_target'. 세트 proc(instant_basic/instant_aoe → 시전 0, free_mana → MP 0)은 시전 시작 때 굴린다.
- 광역힐 대상은 useSkill 에 넘어온 대상 목록(`[ents]`, AIHealer.pickTarget 이 고른 **HP 낮은 순 N 명** — 사용자 지정)을 그대로 쓰고(`cast.targets`, 시전 완료 때 죽은 사람은 뺌), 목록이 없거나 모자라면 다친 아군 우선 무작위 N 명으로 채운다. 파티원 공격 스킬의 추가 대상(targets 3)은 사거리 안의 가까운 몬스터만. curse_volley 는 curses 중 count 개를 뽑아 각각 targetRule 로 고른 대상에게 duration 초.
- 사망: hp≤0 → alive=false. 부활 스킬로 HP 30%. 전원 사망 → `battle.result='wipe'` + 'wipe' 이벤트. 몬스터 처치 시 살아 있는 파티 전원에게 `Level.addXp(src, mDef xp)`, `Loot.roll` 결과를 골드·Inventory.add 로 적용(autoLoot) 하고 `G.counters.kills/bossKills` 증가, 힐은 `G.counters.heals`. 매 update 끝에 `G.player.hp/mp/buffs` 를 동기화.
- 벨트 자동 사용: 플레이어 HP<40% → hp 포션, MP<25% → mp 포션, 저주 걸림 → 해독제 (벨트에 등록된 것만, 아이템별 쿨 10s, 0.5초마다 검사).
- 이벤트: 'damage' {src,dst,srcUid,dstUid,amount,evaded,crit,type,skillId?,abilityId?,hp}, 'heal' {src,dst,amount,skillId,hp}, 'heal_done' {amount}(플레이어 힐만, 퀘스트용), 'death' {uid,ent,kind,name,killer}, 'revive', 'curse' {uid,id,until,src}, 'curse_expired', 'cleanse' {uid,removed}, 'cast_start'/'cast_done'/'cast_cancel' {uid,skillId|abilityId,total?,target?,reason?}, 'telegraph' {id,type,x,y,r,windup,owner,abilityId}, 'telegraph_hit', 'ground_heal', 'summon' {owner,monsterId,count,uids}, 'monster_killed' {id,family,tags,tier,floor,uid,x,y,killer}, 'boss_killed' {id,floor,uid}, 'loot' {gold,items,added,lost,uid,monsterId,x,y,applied}, 'wipe', 'boss_phase' {uid,id,hpBelow,abilities}, 'level_up'(Level 이 발행).

### 8.1 파티원 AI (ai_party.js — `AIParty.update(ent, battle, dt)`)
- 탱커: 가장 가까운 교전 몬스터(또는 힐러를 노리는 몬스터 우선)에게 접근·공격, 도발 쿨마다 사용, 몬스터가 여러 마리면 가장 위협 낮은 아군을 노리는 놈에게 도발.
- 근딜: 탱커의 대상 공격(뒤쪽 위치), 스킬 쿨마다 사용. 원딜: 사거리 유지(대상과 150~220px), 너무 가까우면 뒤로 — 단 **나를 쫓는 몬스터에게서는 물러나지 않고**(끝없는 카이팅 방지) 힐러에게서 8타일 이상 멀어지지 않는다.
- 비전투: 플레이어(힐러)를 따라감(대형: 탱커 앞 48px, 근딜 옆 40px, 원딜 뒤 44px). 탐색 중 몬스터 무리 어그로 범위에 들어오거나 힐러/자신 6타일 안에 몬스터가 보이면 교전. 힐러에게서 15타일 밖의 몬스터는 쫓지 않는다.
- 모두 텔레그래프 안에 있으면 2/3 확률로 빠져나옴(1~5층 90%). 텔레그래프마다 한 번만 굴리고(`ent.dodge`), 탈출 지점은 `AIParty.exitPoint(tg, ent, battle)`(원/장판은 바깥쪽, 부채꼴은 옆, 돌진 선은 수직). 피해·위협·스킬 효과는 전부 battle 함수로만 일으킨다.

### 8.2 힐러 자동 로직 (ai_healer.js — `AIHealer`)
```js
AIHealer.decide(player, battle, G) -> null | { skillId, target?: ent | [ents], x?, y? }   // 우선순위 규칙(아래). 광역힐은 target 이 HP 낮은 순 N 명 목록, 바닥힐은 x,y
AIHealer.pickTarget(skillDef, player, battle) -> ent|null|[ents]   // 모든 스킬 타입: 단일힐 HP% 최저, 광역힐 HP 낮은 순 N 명([ents]), 바닥힐 파티 무게중심 {x,y}(벽이면 가장 아픈 사람 발밑), 버프 역할별(prefer tank/dps/any/self, 없으면 곧 끝나는 버프), 해제 저주 걸린 사람 중 HP 최저, 부활 탱커>근딜>원딜, 일격 가장 가까운 언데드(교전 우선), 필살기 자신
AIHealer.update(player, battle, G, dt)   // settings.autoDodge 면 dodge → moveTo(시전 취소) ; settings.autoHeal 이면 decide → battle.useSkill. 한 틱(battle.time)에 useSkill 은 최대 1회(같은 틱에 두 번 불려도), 거부된 스킬은 0.5초 동안 재시도하지 않음(AIHealer.RETRY_DELAY). MP<20% 면 벨트 MP 포션(battle.beltCooldowns 공유)
AIHealer.dodge(player, battle) -> { x, y } | null   // 텔레그래프/장판(발동 중 포함) 밖 가장 가까운 안전 지점(다른 텔레그래프에도 안 걸리는 곳; autoDodge 또는 UI 표시용)
```
우선순위(위에서부터 처음 만족하는 것 실행; 시전 중이면 대기. 쿨/해금/MP/최근 거부로 못 쓰는 스킬은 같은 틱에 다음 순위로):
1. 죽은 파티원 + resurrect 사용 가능 + 즉시 위험(누군가 HP<30%) 없음 → 부활(가장 역할 중요한: 탱커 > 근딜 > 원딜, 같으면 레벨 높은 쪽).
2. (전투 중) 파티 평균 HP < 45% 또는 3명 이상 HP<40% → holy_light(쿨 가능 시). 비전투면 300초 쿨을 아낀다.
3. 저주 걸린 아군 중 **HP 가 가장 낮은** 대상 → cleanse (단, `root/heal_down/dot` 은 즉시, 나머지는 HP<70% 이거나 힐 대상이 없을 때 — 그리고 누군가 긴급(<35%)이면 급하지 않은 저주는 힐 뒤로).
4. HP% 가 가장 낮은 아군이 80% 미만이면 단일힐: 대상 HP<35% → heal_instant(가능하면) 아니면 heal_fast; 35~60% → heal_fast(해금 시) 아니면 기본; 60~80% → 플레이어가 고른 `active.single`(없으면 기본힐). 단 MP<30% 이면 항상 기본힐(효율). `active.single` 이 빠른/즉시힐이면 35~60% 에도 그것을 먼저, 긴급(<35%) 때는 즉시힐로 승격.
   **순서**: 긴급(<35%) 단일힐은 5(광역)보다 먼저, 그 외 단일힐은 5 의 조건이 안 될 때(그래야 광역 규칙이 죽은 규칙이 되지 않는다).
5. 2명 이상 HP<70% → 광역힐(3명 이상이고 aoe_3 해금이면 aoe_3, 아니면 `active.aoe` → aoe_2 → aoe_3 순으로 쓸 수 있는 것; 대상은 HP 낮은 순 N 명). 모여 있으면(파티 무게중심 2.5타일 안에 3명 이상, 그중 다친 사람 2명 이상) aoe_ground 를 무게중심에 우선. MP<30% 면 광역 대신 기본힐.
6. (전투 중) 언데드 몬스터 교전 중이고 아무도 힐 필요 없으면(최저 HP ≥ 80%) → smite(가장 가까운 교전 언데드). MP ≥ 50% 일 때만.
7. (전투 중) 버프 유지: 탱커 buff_def/buff_eva, 근딜/원딜 buff_atk, 전원 buff_aspd/buff_spd(탱커부터), 자신 buff_mana … 쿨/MP 여유(MP ≥ 50%)일 때 가장 오래 비어 있는 (버프, 대상)부터(update 가 버프를 마지막으로 본 시각을 기억; 같으면 def > atk > aspd > eva > spd > mana), 5초 안에 끝나는 버프도 갱신 대상. 탱커가 없으면 buff_def 는 딜러에게.
8. 전투 중 아니면 버프·일격·필살기는 안 함(마나 회복; 힐·해제·부활은 비전투에도 한다). 마나 관리: MP<20% 이면 기본힐·필살기 외 금지 + 벨트 MP 포션 사용, MP<30% 이면 기본힐 외 힐 금지.
위험 회피: `dodge()` 가 텔레그래프 안에 플레이어가 있으면 밖의 안전 지점을 돌려준다. autoDodge 면 자동 이동(시전 취소), 아니면 UI 가 깜빡여 알려줌. 상태는 전투 엔티티의 `player.healerAI = { failed, seen, last, tick }` 에 둔다.

### 8.3 몬스터 AI (ai_monster.js — `AIMonster.update(ent, battle, dt)`)
- 순찰(home 반경 3타일, 1.5~4초 쉬었다 이동), 어그로 범위(7타일) 안의 파티 발견 → 같은 groupId 무리(10타일 안) 전체 교전(`ent.aggro=true`, 첫 능력은 0.5~2초 뒤부터). 리쉬 25타일 넘거나 대상이 없으면 복귀(`ent.returning`)+HP 회복+저주 제거. 교전 중 같은 무리끼리 겹치면 살짝 밀어낸다.
- 능력은 쿨마다 `battle.castAbility(ent, id)` 로 → Combat 이 `targetRule` 로 대상 선택·텔레그래프 생성·효과 적용. 대상이 8타일(돌진은 range) 밖이면 쓰지 않고, heal_self 는 HP<70% 일 때만. 보스는 `Monsters.abilitiesFor(def, hp비율)` 로 phases 에 따라 능력 세트 전환('boss_phase' 이벤트), summon 은 소환 수 제한(시전자당 동시 6, Combat 이 강제).
- 저주: 공격 적중 시 `curses[].chance × Floors.curseMult`(Combat.basicAttack 이 굴림).

### 8.4 드랍 (loot.js — `Loot`)
```js
Loot.roll(mDef, floor, rng) -> { gold, items: [itemInst] }   // 일반 드랍률 25%, 엘리트 60%, 보스 100%+2 (보스 첫 장비는 사제용 보장: 1~5층 고급↑, 6층↑ 레어↑). 장비는 재질 불문(Items.generate({ floor })), 재료는 mDef.loot 테이블(Loot.TABLES; 보스 ×3 확률·×2 수량), 골드는 Monsters.statsAt(mDef, floor).gold
Loot.chest(floor, type, rng, opts?) -> { gold, items, questScroll?: questId }
  // normal: 골드 + 포션(층별 소/중/대) + 장비 1(재질 불문) + 30% 재료 ; quest: opts.item = { id, qty } 그대로 또는 { slot, grade?, setId?, hands? } 사제용(방어구는 천) 생성, 없으면 사제용 고급↑
  // hidden: 레어↑ 사제 장비 1(전설 숲 20%/동굴 30%) + 'scroll_hidden_f{floor}'(questScroll 은 QuestData.questForScroll 결과). 두루마리는 층당 첫 숨겨진 상자에서만 — 판정은 Loot.scrollTaken(G, floor, exceptChestId):
  //   같은 층 다른 hidden 상자가 hiddenFound 에 있거나, 히든 퀘스트가 active/completed 거나, 두루마리를 가방/은행에 들고 있으면 받은 것. opts = { G, chestId (지금 여는 상자, hiddenFound 에 이미 넣었어도 제외), scrollTaken?: bool (강제) }
  //   Floor.openChest 는 `Loot.chest(floor, chest.type, rng, { G, chestId })` 로 부른다. 두루마리를 이미 받은 hidden 상자는 해독제 2개로 대체.
Loot.scrollId(floor) ; Loot.potionId('hp'|'mp', floor) ; Loot.DROP_CHANCE ; Loot.TABLES ; Loot.CHEST_GOLD (1층 기준, × Floors.goldMult)
```

## 9. 던전 (core/dungeon/gen.js — `DungeonGen`, core/dungeon/floor.js — `Floor`)
```js
DungeonGen.generate(floor, opts?) -> map   // 층별 캐시(같은 객체 반환, 수정 금지). opts.noCache: 새 객체, opts.debug: map.debug 에 내부 상태
map = { floor, biome, name, cols: 160, rows: 160, tile: 32, tiles: Uint8Array(cols*rows), // 0 벽/나무, 1 바닥, 2 물(통행 불가), 3 바닥 장식(통행 가능), 4 덤불/바위(통행 불가, 숨김 상자 가림)
        solid(i, j) -> bool (범위 밖은 true), walkableCount, pathLength (spawn→boss 최단 타일 수), monsterCount,
        spawn: {x,y,i,j}, exit: {x,y,i,j},                  // 모든 위치는 월드 px(타일 중심 (i+0.5)*32) + 타일 좌표 i,j 를 함께 담는다
        landmarks: [ { id: 'f{floor}_lm{n}', name, x, y, i, j, kind: 'open'|'water'|'narrow'|'nook' } ], // Floors.get(f).landmarks 이름 순서대로, 상자/힌트 기준점
        groups: [ { id, x, y, i, j, members: [monsterId...], minibossId?, spots: [ {x,y,i,j} ... ] } ],   // 합계 ≥ 300, 무리 60~80, 중간보스 3 무리('f{floor}_mb{n}', members[0] = minibossId). spots = 무리 중심 반경 2타일 안 통행 가능 칸(가까운 순) → Floor 가 멤버를 여기에 세운다
        boss: { id, x, y, i, j, arenaR: 192 (px = 6타일) },
        chests: [ { id, x, y, i, j, type: 'normal'|'hidden', landmarkId, hidden: bool } ] }  // ≥ 16개/층(기본 12 일반 + 6 숨김), hidden 은 'f{floor}_hidden{1..6}', 일반은 'f{floor}_chest{n}'
DungeonGen.T = { WALL:0, FLOOR:1, WATER:2, DECO:3, BUSH:4 } ; DungeonGen.tileAt(map, x, y) -> 타일값(통행 불가면 -1) ; DungeonGen.clearCache() ; DungeonGen.floorInfo(floor)
```
- 요구: walkableCount ≥ 10,000 타일(만 걸음), spawn→boss 경로 존재, 모든 상자·무리 도달 가능(BFS 검증), 숲은 셀룰러 오토마타 기반 유기적 공터+오솔길+호수, 동굴은 방+통로+셀룰러 침식+수정 군락. 보스 아레나는 맵 반대편 끝(시작 모서리의 대각선 반대, 출구는 보스 뒤). 중간보스는 시작→보스 경로의 30/55/80% 지점 중 가장 트인 곳.
- 숨겨진 상자 = 랜드마크 근처(≤ 30타일) 벽 속으로 판 1칸 폭 막다른 길 끝, 둘레는 덤불(4). 상자 자체는 통행 가능 칸이라 BFS 도달 가능. 랜드마크 kind 는 이름 키워드로 정한다(호수/폭포/샘 → 물가, 복도/통로/길 → 주요 경로의 좁은 곳, 바위/나무/기둥 → 구석, 그 외 → 넓은 공터).
- 생성 시간 < 1초(노드 기준, 실제 60~170ms). 결정적(같은 층 = 같은 맵). `Floors.get` 이 없으면(테스트) 층별 기본 바이옴·랜드마크·풀을 쓴다. 미리보기: `node healer/tools/map_preview.js <floor|all> [--stats]`.
```js
Floor.start(G, floor, opts?) -> fs = { floor, map, battle, boss (보스 엔티티), chests: [ { ...map.chests[i], opened, revealed } ], steps: 0, startedAt(ms), time(초, 게임 시간), bossDefeated: false, cleared: false,
                                    result: null|'cleared'|'wipe'|'escape', visited: Uint8Array(cols×rows, 미니맵용), kills, chestsOpened, playerDeaths, memberDeaths, fatigue(누적 예정), groupsFought: Set }
  // opts.rng: 전투·상자용 난수(시뮬레이션 재현용, 기본 RNG.global()). 몬스터는 map.groups[].members 를 spots 에 세우고 groupId = 무리 id, 보스는 map.boss 에(groupId 'f{n}_boss'). 파티는 spawn 주변 설 수 있는 칸.
  // 'floor_started' { floor, name, monsters, chests }
Floor.update(fs, G, dt)   // battle.update(활성 반경은 Combat), 걸음 집계(1타일 = 1걸음, G.counters.steps, 100걸음마다 'steps' { n: 100, total, floor }), 상자 1.5타일 근접 자동 열기, 숨김 상자 2타일 내 드러남('chest_revealed' { chestId, x, y }),
                          // 보스 처치 → bossDefeated + 'exit_opened' { floor, x, y } → 출구 1.5타일 도달 → cleared + 'floor_cleared' { floor, time, steps, kills }. battle.result 'wipe' 면 fs.result = 'wipe'. result 가 정해지면 더 갱신하지 않는다(씬이 leave 를 부른다).
                          // 쓰러진 힐러는 교전이 끝나고 8초 뒤 살아남은 파티원이 일으켜 세운다(battle.revive 30%). settings.autoFollow 면 비전투 상태로 10타일 넘게 떨어진(아무도 노리지 않는) 파티원은 4초 뒤 힐러 옆으로 붙는다(길 잃음 방지).
Floor.openChest(fs, G, chestId) -> payload|null   // Loot.chest(floor, type, rng, { G, chestId }) → 골드('gold_changed')·Inventory.add(가방이 차면 G.bank.items 로 toBank, 은행도 차면 lost)·G.counters.chests·hidden 이면 G.quests.hiddenFound.
                                                   // 'chest_opened' { chestId, floor, hidden, type, landmarkId, x, y, gold, items, added, toBank, lost, questScroll }. 이미 열렸으면 null.
Floor.leave(fs, G, reason: 'cleared'|'escape'|'wipe') -> summary   // 마을 복귀 처리. 피로 = (걸음/100 + 교전 무리×2 + 보스 5 + 플레이어 사망×10) × Stats.derive(G.player).fatigueGainMult 를 G.player.fatigue 에 더함('fatigue_changed').
  // G.tower.records[floor] = { clears, bestTime, attempts, wipes }, cleared 면 highestCleared 갱신 + 보너스 XP(보스 xp 만큼 플레이어·파티원 전원; 처치 경험치는 Combat 이 이미 줬다). wipe 면 장착 장비(가방·벨트 제외)·파티원 장비 내구도 -20%.
  // 스킬 버프 제거(음식 버프만 유지) → Party.heal. G.playTime += time. summary = { floor, reason, cleared, time, steps, kills, chests, playerDeaths, memberDeaths, groupsFought, bossDefeated, bossPhase: { reached, max }, fatigueGained, xpBonus, record } ('floor_left'). 두 번 불러도 같은 요약을 돌려주고 기록은 한 번만.
```
숨겨진 상자는 덤불(4) 뒤에 있고 플레이어가 2타일 내 접근하면 드러난다. NPC 힌트는 `landmarkId` 이름으로 위치를 알려준다("3층 '달빛 폭포' 북쪽 덤불 뒤").
시뮬레이션: `node healer/tools/sim.js <floor|all> [maxSeconds] [partyLevel] [--runs=N] [--seed=N] [--gear=basic|normal|good] [--skill=N] [--json] [--trace]` — 적정 레벨 파티(탱커 전사·근딜 도적·원딜 사냥꾼·마법사 + 힐러)가 탐험 봇(가장 가까운 미방문 무리/상자/중간보스 → 보스 → 출구, BFS 길찾기, 탱커가 앞설 때까지 대기, 비전투 휴식)으로 층을 끝까지 돈다. dt 0.1 고정.

## 10. 그래픽 모듈 계약 (DOM/canvas)
```js
Sprites.get(kind) -> 시트 (기존)                                    // 플레이어·NPC·파티원(직업별 kind: warrior, mage, hunter, rogue, spellblade, monk)
MonsterSprites.get(spriteId) -> { down, up, right, left: [4 frames], attack?: [...], anchor, w, h }  // 일반 32×32, 엘리트/중간보스 48×48, 보스 80×80
DungeonTiles.chunk(map, ci, cj) -> canvas 512×512 (16×16 타일 청크, 바이옴별 바닥/벽/물/장식/덤불)   // 청크 캐시 LRU 는 scene 이 담당
DungeonTiles.chestSprite(open) ; DungeonTiles.exitSprite() ; DungeonTiles.minimapColor(tile)
FX.draw(ctx, fx, camera) ; FX.spawn(type, x, y, opts)   // heal_sparkle, aoe_ring(fill), puddle_circle(fill), hit, projectile, levelup, cast_glow, summon_puff, revive
```

## 11. 씬·UI (DOM)
- `Scenes.go(name, params)`: 'title', 'town', 'dungeon'. 각 씬은 `{ enter(params), exit(), update(dt), draw(), onPointer... }`.
- 마을 씬: 기존 main.js 로직. 시설 문 앞 `들어가기` → `UI.open('shop'|'auction'|'bank'|'smithy'|'inn'|'engraver'|'temple'|'adventurer'|'guild')`. 성문 → 층 선택(`UI.open('tower')`: 해금 층 = highestCleared+1 까지, 파티 1명 이상 필요 없음(혼자도 가능), 피로 100 이면 불가).
- 던전 씬: 청크 렌더, 깊이 정렬, 텔레그래프(원형 채움 애니메이션)·장판·성역, 상자, 출구, HUD(파티 프레임 HP/MP/저주 아이콘, 보스 HP 바, 시전 바, 스킬 바: 단일힐 선택·광역힐 선택·해제·버프 메뉴·필살기·부활·일격·자동힐 토글, 가방·퀘스트·귀환 버튼, 걸음/킬 카운터, 미니맵), 조이스틱/탭 이동(기존), 자동 따라가기.
- 공통 UI(`UI`): 모달·탭·목록·툴팁·확인창·토스트·대화창(NPC 초상=스프라이트 frame), 아이템 카드(등급색: 흰/초록/파랑/주황).
- 화면: 세로(390×844 기준), safe-area, 터치 44px 이상.

## 12. 완성 기준 (수용 테스트)
1. 새 게임 → 프롤로그 → 마을 → 모험가 사무소에서 4명 고용 → 성문 → 1층 → 몬스터 무리 전투(자동 힐 동작, 수동 스킬 가능) → 상자 → 중간보스 3 → 층 보스(소환 패턴 포함) → 출구 → 마을 복귀(보상·기록·챕터 진행).
2. 1~10층 모두 생성·클리어 가능(시뮬레이션으로 검증: 적정 레벨 파티가 1~5층 ≥ 90% 생존, 6~10층은 장비/레벨 요구).
3. 모든 시설 실제 동작(구매/판매/경매/보관/수리/분해/조합/식사/숙박/각인/스킬 강화/고용/길드).
4. 퀘스트 4종(메인/의뢰/일일/히든) 수주·진행·완료·보상, NPC 대사에 힌트.
5. 저장/불러오기, 레벨업/스탯 분배/스킬 해금, 세트 효과, 벨트 자동 소모품.
6. 콘솔 오류 0, 모바일 60fps 근접(활성 반경 갱신, 청크 캐시).
