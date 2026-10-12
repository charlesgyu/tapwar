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
            daily: { day, offered: [id], done: [id] }, hiddenFound: [id] },
  story: { chapter: 1, flags: {} },
  tower: { highestCleared: 0, records: { [floor]: { clears, bestTime } } },
  auction: { hourIndex, listings: [ { uid, item, price } ], mine: [ { uid, item, price, listedAt } ], resetTickets: 1 },
  adventurer: { day, candidates: [memberInst...] },
  counters: { steps: 0, kills: 0, bossKills: 0, chests: 0, heals: 0 },
  day: 1, playTime: 0,
}
memberInst = { uid, name, cls, role: 'tank'|'melee'|'ranged'|'healer', level, xp, stats: {...}, equipment: { body, main }, hireCost, personality }
itemInst   = { uid, id, grade: 'common'|'uncommon'|'rare'|'legendary', affixes: [ { stat, value } ], durability, maxDurability, qty }
```

## 3. 데이터 모듈

### 3.1 직업 (core/data_classes.js) — `Classes`
```js
Classes.list() -> [id]   // 'warrior','mage','hunter','rogue','spellblade','priest','monk'
Classes.get(id) -> { id, name, roles: ['tank','melee'], armor: 'plate'|'leather'|'chain'|'cloth',
                     baseStats: {str,def,agi,sta,int,vit}, growth: {str,...}  // 레벨당 자동 증가
                     primary: ['str','agi'], skills: [memberSkillId...], atkType: 'melee'|'ranged'|'magic', range: px, atkInterval: s }
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
- 스킬 레벨업 비용 `upgradeCost(lv) = 150 * lv * lv` 골드.
파티원 스킬(자동): warrior `taunt`(도발, 위협 ×5, 12s), `cleave`; monk `taunt`, `flurry`; mage `fireball`, `blizzard`(광역); hunter `multishot`; rogue `backstab`(크리); spellblade `blade_rush`. mult 1.5~2.5, 쿨 6~15s.

### 3.3 아이템 (core/data_items.js) — `Items`
```js
Items.get(id) -> itemDef
Items.generate(opts) -> itemInst      // opts: { id?, slot?, grade?, floor?, rng } 무작위 생성(등급·접사)
Items.affixPool, Items.SETS, Items.GRADES, Items.SLOTS, Items.recipes(), Items.consumables()
itemDef = { id, name, kind: 'equip'|'consume'|'material'|'misc'|'quest', slot?: SLOT, hands?: 'two'|'main'|'off',
            armor?: 'plate'|'leather'|'chain'|'cloth', baseStats: { def?, int?, ... }, gradeMin?, setId?,
            beltSlots?: 1..4 (belt), bagSize?: n (bag), price, icon, desc,
            effect?: { hp?, mp?, hpPct?, mpPct?, cleanse?, fatigue?, buff? } (소모품), stack?: 99, floorMin?, floorMax? }
SLOT: 'neck','ring','ear','main','off','body','boots','gloves','hat','belt','bag'
grade 배수(기본 스탯): common 1.0, uncommon 1.25, rare 1.6, legendary 2.2. rare 이상 접사 1~3개:
  mp_regen(초당 마나), cast_speed(시전 시간 -%), mp_cost(-%), move_speed(+%), heal_power(+%), int(+), vit(+), def(+), crit(+%)
세트(천, 사제용, 옷/장화/장갑/모자/벨트 5부위): 최소 3세트 ('novice_cloth' 수습, 'forest_leaf' 숲잎, 'cave_crystal' 수정).
  효과: 2셋 → int+10%, 3셋 → 10% 확률 마나 무소비, 4셋 → 10% 확률 기본힐 즉시시전, 5셋 → 10% 확률 광역힐 즉시시전 (`Items.setBonus(setId, count)` 가 활성 효과 목록 반환).
양손지팡이 = main(hands:'two'), 한손지팡이 = main(hands:'main') + 책 = off. 양손 착용 시 off 해제.
소모품: hp 포션 소/중/대(hp 80/250/600), mp 포션 소/중/대(60/180/450), 해독제(저주 1개 해제), 귀환 두루마리, 경매장 리셋권(gems), 음식(피로 -20, 10분 버프).
재료: 가죽, 쇠조각, 마법가루, 수정, 나무, 실, 괴물 이빨 … (분해 결과·조합 재료). 조합 레시피 ≥ 10개 (`{ id, result: itemId, grade, materials: {id: n}, gold }`).
드랍 아이템은 재질을 가리지 않는다(판금/가죽/사슬도 나옴 → 판매/분해용). 퀘스트 보상은 항상 사제용(천/지팡이/책/장신구).
```

### 3.4 몬스터·층 (core/data_monsters.js) — `Monsters`, `Floors`
```js
Monsters.get(id) -> mDef ; Monsters.forFloor(floor) -> [ { id, weight } ] ; Monsters.list()
mDef = { id, name, family, biome: ['forest'|'cave'], tags: ['undead'?,'beast'?,...], tier: 'normal'|'elite'|'miniboss'|'boss',
         base: { hp, atk, def, spd(px/s), aspd(초당 공격 횟수), range(px), threatMult? }, perFloor: { hp, atk, def } (층당 증가),
         abilities: [abilityId...], curses: [ { id, chance } ], xp, gold: [min,max], loot: lootTableId, size: 1|2|3, sprite: string,
         phases?: [ { hpBelow: 1.0, abilities: [...] }, { hpBelow: 0.7, ... } ]  (보스) }
Monsters.ability(id) -> { id, name, type: 'aoe_circle'|'puddle'|'cone'|'summon'|'charge'|'curse_volley'|'enrage'|'heal_self'|'roar',
                          windup: 3~5, radius(px), duration?, dmgMult?, dps?, summon?: { id, count }, cooldown, targetRule: 'tank'|'random'|'healer'|'self' }
```
필수 몬스터 ≥ 24종: 숲(1~5층) 고블린(goblin, goblin_archer, goblin_shaman), 늑대(wolf), 거미(spider), 트롤(troll), 오크(orc, orc_berserker), 늑대인간(werewolf), 세이렌(siren, 호수), 숲 정령(sprite), 해골(skeleton, undead), 좀비(zombie, undead), 셰피(sheepie 양 괴물); 동굴(6~10층) 박쥐(bat), 동굴거미, 골렘(golem_stone, golem_crystal), 나가(naga, naga_priest), 오크 전사장, 트롤 주술사, 망령(wraith, undead), 해골 기사(undead), 드래곤 새끼(drake), 드래곤(dragon, 10층 보스).
층 보스(필수): 1 고블린 왕, 2 거대 거미 여왕, 3 늑대인간 족장, 4 세이렌 여왕, 5 트롤 족장(5층은 "숲의 수호자" 타락한 나무 정령도 가능), 6 돌 골렘 군주, 7 나가 여사제, 8 오크 대족장, 9 망령 왕(언데드), 10 동굴 드래곤. 중간보스 3마리/층(엘리트 변형: 더 크고 능력 1~2개).
보스 패턴: 모든 보스가 최소 4종 능력(aoe_circle, puddle, summon, curse_volley/charge/enrage 중)을 가지며 HP 구간별 phases 로 바뀐다. **summon 패턴 필수**(부하 2~4마리 소환). 10층 드래곤은 5개 이상.
난이도: `Floors.get(f).mult` = { hp, atk, def } 로 1~5층은 1.0→1.35 완만, 6층부터 1.8, 2.1, 2.5, 3.0, 3.6. 저주 확률도 6층부터 2배. 1~5층 광역기는 탱커 위치 중심, 6층부터 힐러를 노리는 능력(targetRule 'healer') 등장.
```js
Floors.get(f) -> { floor, biome: 'forest'|'cave', name, levelRange: [min,max], pool: [ {id, weight} ], minibosses: [id,id,id], boss: id,
                   mult, curseMult, monsterCount: 300+, chapter: f, landmarks: [ '이끼 낀 바위', '폭포', ... ≥6 ] }
```

### 3.5 퀘스트 데이터 (core/data_quests.js) — `QuestData`
```js
QuestData.all() -> [questDef] ; QuestData.get(id)
questDef = { id, type: 'main'|'village'|'daily'|'hidden', title, giver: npcId, chapter?, requires: { quest?, floor?, level? },
             objectives: [ { type: 'kill', target: monsterId|family, count } | { type: 'kill_boss', floor } | { type: 'collect', item, count }
                           | { type: 'chest', floor, chestId } | { type: 'talk', npc } | { type: 'visit', facility } | { type: 'clear_floor', floor }
                           | { type: 'steps', count } | { type: 'heal', amount } ],
             rewards: { gold, xp, items: [ { id, grade? } ], gems? }, text: { offer, progress, complete }, hint? (NPC 대사용 한 줄) }
```
필수 분량: 메인 10챕터(각 층 보스 처치로 진행, 1~2개 선행 퀘스트 포함, 총 ≥ 15개), 마을 의뢰 ≥ 20개(층 1~10 분포), 일일 풀 ≥ 12개(하루 3개 제공), 히든 ≥ 10개(각 층 숨겨진 상자에서 두루마리 획득 → 보상 레어/전설 사제 장비). 히든 상자 위치는 `chestId = 'f{floor}_hidden{n}'`, 던전 생성기가 같은 id 로 상자를 만든다.

### 3.6 대사·스토리 (core/data_dialogue.js — `Dialogue`, core/data_story.js — `Story`)
```js
Dialogue.npc(npcId) -> { name, role, lines: [string], byChapter: { [n]: [string] }, hints: [ { questId?, chestId?, floor?, text } ] }
Dialogue.pick(npcId, G) -> string          // 챕터·진행 상황에 맞는 대사(힌트는 30% 확률로 섞임, 미완료 퀘스트/안 찾은 상자 우선)
Dialogue.greet(npcId, G) -> [string]       // 대화창용 2~3줄
npcId: 'guard1','guard2','priest_elder'(신전 장로, 스승),'smith','merchant1','merchant2','innkeeper','banker','engraver','auctioneer','guildmaster','adventurer_clerk', 'villager_a'…'villager_e', 'child_a','child_b'
Story.chapters[n] -> { n, title, floor, intro: [string] (층 진입 시), outro: [string] (보스 처치 후), townEvent?: { npc, lines } }
Story.prologue -> [string] ; Story.epilogue10 -> [string]
```
줄거리(고정): 평화롭던 '라일라 마을' 옆에 어느 날 '잿빛 탑'이 솟아 괴물이 쏟아진다. 주인공 리프는 신전의 수습 사제. 스승 '장로 엘다'가 탑 5층에서 실종. 1~5층 숲(탑이 삼킨 숲)에서 스승의 흔적을 좇고 5층에서 스승을 구한다(트롤 족장). 6~10층 동굴에서 탑의 심장을 지키는 드래곤과 그 배후(망령 왕=옛 사제)의 진실을 알게 되고 10층 드래곤을 꺾어 1부가 끝난다(99층까지 이어질 떡밥).

## 4. 파생 스탯·레벨 (core/stats.js — `Stats`, core/level.js — `Level`)
```js
Stats.derive(entityLike, G?) -> { maxHp, maxMp, atk, matk, def, healPower, evasion, crit, moveSpeed, atkSpeed, castSpeed, mpRegen, mpCostMult, fatigueMult }
  // 기본 스탯 + 레벨 성장 + 장비 baseStats×등급 + 접사 + 세트 + 각인 + 버프/저주 + 피로(fatigueMult = 1 - fatigue/200)
  // maxHp = 50 + vit*12 + level*8 ; maxMp = 30 + int*9 + level*5 ; atk = str*2 (+agi*0.5) ; matk/healPower = int*1.6 ; def ; evasion = agi*0.4 % (최대 40)
  // moveSpeed = 120 * (1 + agi*0.004) px/s ; castSpeed = 1 / (1 + cast_speed%) ; mpRegen = 1 + int*0.05 /s
Level.xpForLevel(lv) -> number (lv 40 만렙, 1→2 = 100, 완만한 2차 증가) ; Level.addXp(entity, xp) -> { levelsGained }
  // 레벨업: statPoints += 5 (플레이어), hp/mp 전부 회복, Events 'level_up'
Level.allocate(G, stat, n) ; Level.unlockedSkills(level) -> [skillId]
```

## 5. 인벤토리·경제·시설 (core/inventory.js — `Inventory`, core/economy.js — `Economy`, core/facilities.js — `Facilities`)
```js
Inventory.add(G, itemInst) -> bool(공간 없으면 false) ; remove(G, uid, qty?) ; find(G, uid) ; count(G, itemId)
Inventory.equip(G, uid) -> { ok, reason? }   // 슬롯/재질/양손 규칙, 빈 반지 슬롯 우선, 벗은 장비는 가방으로
Inventory.unequip(G, slot) ; Inventory.setBelt(G, idx, itemId|null) ; Inventory.beltSlots(G) -> n
Inventory.activeSets(G) -> [ { setId, count, bonuses } ] ; Inventory.useConsumable(G, itemId, targetEntity?) -> bool
Economy.sellPrice(inst) ; Economy.buyPrice(def) ; Economy.repairCost(inst) ; Economy.disassemble(inst, rng) -> [itemInst materials]
Facilities.shop.stock(G) / buy(G, itemId, qty) / sell(G, uid, qty)
Facilities.auction.listings(G) (현실 시간 1시간마다 `hourIndex = floor(Date.now()/3600000)` 로 재생성, 시드 = hourIndex) / buy(G, uid) / list(G, uid, price) / tick(G) (내 물건이 가격 대비 확률로 팔려 골드 지급) / reset(G) (리셋권 소모 후 즉시 재생성)
Facilities.bank.deposit(G, uid) / withdraw(G, uid) / depositGold(G, n) / withdrawGold(G, n)
Facilities.smithy.repair(G, uid) / repairAll(G) / disassemble(G, uid) / craft(G, recipeId) -> { ok, item?, reason? }
Facilities.inn.menu() / eat(G, foodId) / sleep(G) (골드 50, 피로 0, day+1, 일일 퀘스트 리셋, HP/MP 회복)
Facilities.engraver.options(G) -> [ { id, name, cost, materials, stat?, value?, special? } ] / engrave(G, id) (최대 각인 수 = 3 + floor(level/10))
Facilities.temple.cost(G, skillId) / upgrade(G, skillId)
Facilities.adventurer.candidates(G) (하루 6명, 직업·레벨(플레이어 ±2)·역할·고용비) / hire(G, candUid) (최대 4명) / dismiss(G, uid) / board(G) -> 수주 가능한 마을 의뢰
Facilities.guild.list(G) -> NPC 길드 3개(고정 파티원 구성, 가입 시 그 파티원들을 영입 가능) / join(G, id) / leave(G) / create(G, name) (골드 1000) / recruit(G, candUid)
```
피로: 100걸음당 +1, 몬스터 무리 전투당 +2, 보스 +5, 사망 +10. 피로 ≥ 100 이면 던전 입장 불가.
내구도: 장비 피격·시전 시 서서히 감소, 0 이면 효과 절반. 수리비 = 가격 × 손상비율 × 0.3.

## 6. 파티 (core/party.js — `Party`)
```js
Party.generateMember(rng, level, opts?) -> memberInst  // 직업·역할·이름(한국어 2~3글자)·성격 한 줄
Party.members(G) -> [memberInst] ; Party.roles(G) -> { tank: n, melee: n, ranged: n, healer: n }
Party.heal(G) (마을 복귀 시 전원 회복) ; Party.gainXp(G, xp)
```

## 7. 퀘스트 엔진 (core/quests.js — `Quests`)
```js
Quests.available(G, npcId?) -> [questDef] ; Quests.accept(G, id) -> bool ; Quests.active(G) ; Quests.canComplete(G, id) ; Quests.complete(G, id) -> rewards
Quests.dailyRefresh(G) (day 바뀌면 3개 제공) ; Quests.hintsFor(G, npcId) -> [string]
```
이벤트 구독: 'monster_killed' {id, family, tags, floor}, 'boss_killed' {id, floor}, 'chest_opened' {chestId, floor, hidden}, 'item_gained' {id, qty}, 'npc_talk' {npcId}, 'facility_visit' {id}, 'floor_cleared' {floor, time}, 'steps' {n}, 'heal_done' {amount}. 메인 퀘스트 완료 시 `G.story.chapter` 증가 + 'chapter_advanced'.

## 8. 전투 (core/combat/*)
```js
Entities.fromPlayer(G) / fromMember(G, m) / fromMonster(mDef, floor, x, y, rng) -> ent
ent = { uid, kind: 'player'|'member'|'monster', name, cls?, role, level, def: mDef?, x, y, dir, size, radius(px 충돌),
        stats (Stats.derive 결과), hp, maxHp, mp, maxMp, alive, state: 'idle'|'move'|'attack'|'cast'|'dead',
        target: uid|null, threat: { [uid]: n } (몬스터), buffs: [ { id, stat, value, until } ], curses: [ { id, until, dps? } ],
        cooldowns: { [skillId]: untilTime }, cast: null | { skillId, t, total, target, x?, y? }, atkTimer, speed, sprite, tags, tier,
        home: {x,y} (몬스터 순찰 기준), groupId, aggroRange, leashRange }
Combat.create({ map, player, members, monsters, rng }) -> battle
battle.update(dt)            // 모든 로직: 이동·어그로·공격·시전·버프/저주 만료·텔레그래프·장판·사망·루팅 이벤트
battle.time ; battle.entities ; battle.player ; battle.members ; battle.monsters ; battle.telegraphs ; battle.groundHeals ; battle.log (최근 메시지)
battle.useSkill(caster, skillId, target?) -> { ok, reason? }   // 시전 시작(캐스팅). 대상 생략 시 AIHealer.pickTarget 로 자동
battle.moveTo(ent, x, y, dt) ; battle.canStand(x, y) ; battle.inCombat() -> bool ; battle.activeMonsters() (활성 반경 20타일 내)
battle.damage(src, dst, amount, opts) ; battle.heal(src, dst, amount) ; battle.applyCurse(dst, curseId, dur) ; battle.cleanse(dst)
battle.result -> null | 'wipe'
```
- 위협(어그로): 피해 ×1(탱커 ×3, 도발 ×5 즉시), 힐 ×0.5 가 피해 받은 몬스터 전원에 분산. 몬스터는 최고 위협 대상을 공격. 1~5층은 탱커 위협 보정 ×4 라 힐러가 거의 안 맞음, 6층부터 ×2.5 로 줄고 'healer' 타겟 능력 등장.
- 피해 = `max(1, atk × mult − def × 0.5) × (0.9~1.1)`, 회피/크리 적용. 공격 속도·이동속도는 버프/저주 반영.
- 텔레그래프: `battle.telegraphs: [ { id, type: 'circle'|'puddle', x, y, r, t, windup, owner, dmg?, dps?, duration?, fill: 0~1 } ]` — windup 동안 fill 증가(색 채워짐), 완료 시 circle 은 범위 내 파티에 1회 피해, puddle 은 duration(5s) 동안 안에 있으면 초당 dps. `battle.groundHeals` 도 같은 구조(치유의 성역).
- 저주 id: `dot`(초당 피해), `def_down`, `atk_down`, `aspd_down`, `spd_down`, `heal_down`(받는 힐 50%), `root`(이동불가). 10~20초.
- 시전: `ent.cast` 진행 중 이동하면 취소(플레이어). 멤버/몬스터는 시전 중 정지.
- 사망: hp≤0 → alive=false. 부활 스킬로 HP 30%. 전원 사망 → `battle.result='wipe'`.
- 벨트 자동 사용: 플레이어 HP<40% → hp 포션, MP<25% → mp 포션, 저주 걸림 → 해독제 (벨트에 등록된 것만, 아이템별 쿨 10s).
- 이벤트: 'damage','heal','death','revive','curse','cleanse','cast_start','cast_done','cast_cancel','telegraph','summon','monster_killed','boss_killed','loot','level_up'.

### 8.1 파티원 AI (ai_party.js — `AIParty.update(ent, battle, dt)`)
- 탱커: 가장 가까운 교전 몬스터(또는 힐러를 노리는 몬스터 우선)에게 접근·공격, 도발 쿨마다 사용, 몬스터가 여러 마리면 가장 위협 낮은 아군을 노리는 놈에게 도발.
- 근딜: 탱커의 대상 공격(뒤쪽 위치), 스킬 쿨마다 사용. 원딜: 사거리 유지(대상과 150~220px), 너무 가까우면 뒤로.
- 비전투: 플레이어(힐러)를 따라감(대형: 탱커 앞, 딜러 옆). 탐색 중 몬스터 무리 어그로 범위에 들어오면 교전.
- 모두 텔레그래프 안에 있으면 2/3 확률로 빠져나옴(1~5층 90%).

### 8.2 힐러 자동 로직 (ai_healer.js — `AIHealer`)
```js
AIHealer.decide(player, battle, G) -> null | { skillId, target?: ent, x?, y? }   // 우선순위 규칙(아래)
AIHealer.pickTarget(skillDef, player, battle) -> ent|null|[ents]
AIHealer.update(player, battle, G, dt)   // settings.autoHeal 이면 decide → battle.useSkill
AIHealer.dodge(player, battle) -> { x, y } | null   // 텔레그래프/장판 밖 가장 가까운 안전 지점(autoDodge 또는 UI 표시용)
```
우선순위(위에서부터 처음 만족하는 것 실행; 시전 중이면 대기):
1. 죽은 파티원 + resurrect 사용 가능 + 즉시 위험(누군가 HP<30%) 없음 → 부활(가장 역할 중요한: 탱커 > 딜러).
2. 파티 평균 HP < 45% 또는 3명 이상 HP<40% → holy_light(쿨 가능 시).
3. 저주 걸린 아군 중 **HP 가 가장 낮은** 대상 → cleanse (단, `root/heal_down/dot` 은 즉시, 나머지는 HP<70% 이거나 힐 대상이 없을 때).
4. HP% 가 가장 낮은 아군이 80% 미만이면 단일힐: 대상 HP<35% → heal_instant(가능하면) 아니면 heal_fast; 35~60% → heal_fast(해금 시) 아니면 기본; 60~80% → 기본힐. 단 MP<30% 이면 항상 기본힐(효율). 플레이어가 고른 `active.single` 이 있으면 그 스킬 우선, 긴급(<35%) 때만 즉시힐로 승격.
5. 2명 이상 HP<70% → 광역힐(`active.aoe`; 3명 이상이고 aoe_3 해금이면 aoe_3; 모두 모여 있으면(반경 2.5타일 안에 3명 이상) aoe_ground 우선).
6. 언데드 몬스터 교전 중이고 아무도 힐 필요 없으면 → smite.
7. 버프 유지: 탱커 buff_def, 근딜/원딜 buff_atk, 전원 buff_aspd … 쿨/MP 여유(MP>50%)일 때 가장 오래 비어 있는 버프부터.
8. 전투 중 아니면 아무것도 안 함(마나 회복). 마나 관리: MP<20% 이면 기본힐 외 금지, 벨트 MP 포션 사용.
위험 회피: `dodge()` 가 텔레그래프 안에 플레이어가 있으면 밖의 안전 지점을 돌려준다. autoDodge 면 자동 이동(시전 취소), 아니면 UI 가 깜빡여 알려줌.

### 8.3 몬스터 AI (ai_monster.js — `AIMonster.update(ent, battle, dt)`)
- 순찰(home 반경 3타일), 어그로 범위(7타일) 안의 파티 발견 → 무리 전체 교전. 리쉬 25타일 넘으면 복귀+회복.
- 능력은 쿨마다 `targetRule` 로 대상 선택 → 텔레그래프 생성. 보스는 phases 에 따라 능력 세트 전환, summon 은 소환 수 제한(동시 6).
- 저주: 공격 적중 시 `curses[].chance × Floors.curseMult`.

### 8.4 드랍 (loot.js — `Loot`)
```js
Loot.roll(mDef, floor, rng) -> { gold, items: [itemInst] }   // 일반 드랍률 25%, 엘리트 60%, 보스 100%+2
Loot.chest(floor, type, rng) -> { gold, items, questScroll?: questId }  // hidden: 레어 이상 1개 + 히든 퀘스트 두루마리
```

## 9. 던전 (core/dungeon/gen.js — `DungeonGen`, core/dungeon/floor.js — `Floor`)
```js
DungeonGen.generate(floor) -> map
map = { floor, biome, cols: 160, rows: 160, tiles: Uint8Array(cols*rows), // 0 벽/나무, 1 바닥, 2 물(통행 불가), 3 바닥 장식(통행 가능), 4 덤불/바위(통행 불가, 숨김 상자 가림)
        solid(i, j) -> bool, walkableCount, spawn: {x,y}, exit: {x,y},
        landmarks: [ { id, name, x, y, kind } ],            // Floors.get(f).landmarks 이름 사용, 상자/힌트 기준점
        groups: [ { id, x, y, members: [monsterId...], minibossId? } ],   // 합계 몬스터 ≥ 300, 중간보스 3 (각각 자기 무리와 함께)
        boss: { id, x, y, arenaR },
        chests: [ { id, x, y, type: 'normal'|'hidden'|'quest', landmarkId, hidden: bool } ] }  // ≥ 16개/층, hidden ≥ 5 (막다른 길·덤불 뒤), id 규칙 'f{floor}_hidden{n}', 'f{floor}_chest{n}'
```
- 요구: walkableCount ≥ 10,000 타일(만 걸음), spawn→boss 경로 존재, 모든 상자·무리 도달 가능(BFS 검증), 숲은 셀룰러 오토마타 기반 유기적 공터+오솔길+호수, 동굴은 방+통로+셀룰러 침식+수정 군락. 보스 아레나는 맵 반대편 끝. 중간보스는 주요 분기 지점.
- 생성 시간 < 1초(노드 기준). 결정적(같은 층 = 같은 맵).
```js
Floor.start(G, floor) -> fs = { floor, map, battle, chests, steps: 0, startedAt, bossDefeated: false, cleared: false, visited: Uint8Array(미니맵용) }
Floor.update(fs, G, dt)   // 활성 반경 내 엔티티만 갱신, 걸음 수 집계('steps' 이벤트 100걸음마다), 상자 근접 자동 열기('chest_opened'), 보스 처치 → bossDefeated → exit 활성, 출구 도달 → cleared ('floor_cleared')
Floor.openChest(fs, G, chestId) ; Floor.leave(fs, G, reason: 'cleared'|'escape'|'wipe')  // 마을 복귀 처리(피로·보상·기록)
```
숨겨진 상자는 덤불(4) 뒤에 있고 플레이어가 2타일 내 접근하면 드러난다. NPC 힌트는 `landmarkId` 이름으로 위치를 알려준다("3층 '달빛 폭포' 북쪽 덤불 뒤").

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
