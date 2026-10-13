export const meta = {
  name: 'healer-core-systems',
  description: '모두의 힐러 핵심 시스템(데이터·전투·던전·경제·퀘스트)을 DESIGN.md 계약대로 병렬 구현하고 통합 검증',
  phases: [
    { title: 'Systems', detail: '데이터·인벤토리·몬스터·퀘스트·던전 생성기를 병렬 구현' },
    { title: 'Combat', detail: '전투 엔진·파티/몬스터 AI → 힐러 자동 로직' },
    { title: 'Floor', detail: '층 런타임·시뮬레이션·밸런스' },
    { title: 'Verify', detail: '통합 테스트·사양 대조 리뷰·수정' },
  ],
}

const H = '/home/user/tapwar/healer'
const DESIGN = `${H}/DESIGN.md`
const OUT = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    testsPassed: { type: 'boolean' },
    summary: { type: 'string' },
    deviations: { type: 'array', items: { type: 'string' }, description: 'DESIGN.md 와 다르게 구현한 점(이유 포함)' },
    openIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'testsPassed', 'summary'],
}
const REVIEW = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'number' }, file: { type: 'string' }, description: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'description', 'fix'] } },
    verdict: { type: 'string' },
  },
  required: ['issues'],
}

function header(role) {
  return `당신은 모바일 세로 RPG "모두의 힐러"의 ${role}. 저장소 ${H} (브랜치 claude/upbeat-euler-gdw42r, 메인 저장소에서 직접 작업, git commit 금지).

## 반드시 먼저 읽을 것
- ${DESIGN} — 모듈 경계·스키마·API 계약. 여기 적힌 API 이름/시그니처/필드명을 그대로 쓴다. 바꿔야 하면 DESIGN.md 의 해당 줄을 고치고 반환값 deviations 에 이유를 적는다.
- ${H}/js/core/rng.js, events.js, state.js (이미 구현됨), ${H}/tools/load.js, run_tests.js, tests/base.test.js (테스트 작성 방식)
- 사용자의 원래 기획(요약): ${H}/README.md 의 "게임 기획 요약"

## 공통 규칙
- 각 파일은 \`const X = (() => {...})(); if (typeof module !== 'undefined') module.exports = X;\` 형태, 전역 이름으로 다른 모듈 참조. core/ 는 DOM/canvas 사용 금지.
- 당신에게 배정된 파일만 만들고/고친다. 다른 모듈(다른 사람이 동시에 만드는 중)은 DESIGN.md 의 계약만 믿고 호출하되, 테스트에서 그 모듈이 아직 없으면 \`tools/load.js\` 가 건너뛰므로 최소 스텁을 테스트 안에서 컨텍스트에 주입해 테스트한다(예: \`ctx.Items = { generate: () => ({...}) }\`).
- 테스트: \`${H}/tests/<모듈>.test.js\` 를 만들고 \`node ${H}/tools/run_tests.js <필터>\` 로 통과시킨다. 최소 6개 이상의 의미 있는 테스트(계약의 핵심 규칙 검증).
- 텍스트는 자연스러운 한국어, id 는 영어 snake_case. 숫자 밸런스는 DESIGN.md 수치를 기본으로 하되 합리적으로 보강.
- 코드 품질: 함수는 짧게, 주석은 한국어로 "왜"를 적는다. 콘솔 로그 남기지 말 것.

## 반환
files(만든/고친 파일 절대경로), testsPassed, summary(무엇을 구현했는지 핵심 API 위주), deviations, openIssues(다른 모듈이 알아야 할 점).`
}

const P = {
  classes: `${header('시스템 데이터 담당(직업·스킬·스탯·레벨)')}

## 만들 파일
1. js/core/data_classes.js — \`Classes\` (DESIGN §3.1). 7직업 전부, 역할 규칙, baseStats/growth/skills/atkType/range/atkInterval.
2. js/core/data_skills.js — \`Skills\` (DESIGN §3.2). 사제 16개 스킬을 표 그대로(id·시전·MP·쿨·해금) + 파티원 직업 스킬. \`Skills.healAmount(skillDef, caster, skillLv)\`, \`Skills.upgradeCost(skillId, lv)\` 헬퍼도 제공.
3. js/core/stats.js — \`Stats.derive(entityLike, G?)\` (DESIGN §4). 장비(baseStats×등급배수)·접사·세트(\`Inventory.activeSets\` 가 있으면 사용, 없으면 무시)·각인·버프·저주·피로를 모두 반영. 몬스터/파티원에도 쓸 수 있게 entityLike 에 equipment 가 없어도 동작.
4. js/core/level.js — \`Level\` (DESIGN §4). xpForLevel(2)=100, 40레벨 만렙, addXp 가 여러 레벨 한 번에 올리고 'level_up' 이벤트, allocate, unlockedSkills.
테스트: tests/classes.test.js, tests/skills.test.js, tests/stats_level.test.js.`,

  items: `${header('아이템·인벤토리·경제 담당')}

## 만들 파일
1. js/core/data_items.js — \`Items\` (DESIGN §3.3). 장비 템플릿은 슬롯×재질별로 충분히(천/판금/가죽/사슬 각 옷·장화·장갑·모자·벨트, 지팡이 양손/한손, 책, 목걸이/반지/귀걸이, 가방 3종, 벨트 4등급) ≥ 60개. 세트 3종(5부위), 소모품(포션 6, 해독제, 귀환 두루마리, 리셋권, 음식 3), 재료 ≥ 8, 조합 레시피 ≥ 10, 퀘스트 아이템(히든 두루마리 'scroll_hidden_f{n}' 1~10). \`Items.generate({ id?, slot?, grade?, floor?, rng, priestOnly? })\` 는 층에 맞는 등급 확률(1~5층 common 60/uncommon 30/rare 9/legendary 1 → 10층 30/40/25/5)과 접사 1~3개. 아이콘은 이모지 1글자(icon) 로 둔다(UI 가 사용).
2. js/core/inventory.js — \`Inventory\` (DESIGN §5). 장착 규칙(사제는 천만, 양손/한손+책, 반지 2칸), 가방 칸(가방 장비 bagSize 반영), 벨트 칸 수 = 벨트 등급, 세트 보너스, 소모품 사용(effect 적용 — 대상 entity 또는 G.player).
3. js/core/economy.js — \`Economy\` (DESIGN §5): sellPrice(등급·내구도 반영, 구매가의 40%), buyPrice, repairCost, disassemble(재료 1~3개, 등급 높을수록 좋은 재료).
테스트: tests/items.test.js, tests/inventory.test.js, tests/economy.test.js (등급 확률 분포, 양손 규칙, 세트 보너스, 가방 가득참, 벨트 칸 수 등).`,

  monsters: `${header('몬스터·층·드랍 담당')}

## 만들 파일
1. js/core/data_monsters.js — \`Monsters\`, \`Floors\` (DESIGN §3.4). 몬스터 ≥ 24종(목록 참고), 층별 보스 10마리(각 ≥4 능력, phases, **summon 필수**, 10층 드래곤 ≥5 능력), 중간보스는 엘리트 변형 id(예 'goblin_chief', 'spider_broodmother'…) 30개(층당 3). 능력 정의 \`Monsters.ability(id)\` ≥ 12종(aoe_circle 크기별, puddle, cone, summon 변형, charge, curse_volley, enrage, heal_self, roar). 저주 확률·층 배수(1~5 완만, 6~10 급증), 'healer' targetRule 은 6층부터만. \`Floors.get(f)\` 10층 전부: 이름(숲 1~5: 예 "속삭이는 숲 입구", "달빛 폭포 길", … / 동굴 6~10), levelRange(1층 1~3 … 10층 18~22), pool, minibosses, boss, mult, curseMult, monsterCount(300~360), landmarks ≥ 6개(한국어 지명, 던전 생성기와 NPC 힌트가 사용).
2. js/core/combat/loot.js — \`Loot\` (DESIGN §8.4). Items.generate 사용(없으면 테스트에서 스텁). 드랍 테이블: 재질 가리지 않음, 재료 드랍, 보스는 사제용 1개 보장. 상자: normal(골드+소모품+장비 1), hidden(레어↑ 사제 장비 + 'scroll_hidden_f{floor}' 두루마리 — 층당 hidden 상자가 5개면 두루마리는 첫 상자에서만 1회, 나머지는 레어 장비), quest(퀘스트 지정 아이템).
테스트: tests/monsters.test.js (10층 보스 전부 summon 보유, 층 난이도 단조 증가, pool 이 biome 과 맞음, monsterCount ≥ 300), tests/loot.test.js.`,

  quests: `${header('스토리·퀘스트·대사 담당(작가 겸 퀘스트 엔진 개발자)')}

## 만들 파일
1. js/core/data_story.js — \`Story\` (DESIGN §3.6). 프롤로그(6~10줄), 10챕터(각 intro 3~5줄, outro 3~5줄, townEvent), 10층 에필로그. 줄거리는 DESIGN 에 고정된 것을 따르되 감정선·반전(망령 왕=옛 사제, 스승의 비밀)을 살린다. 톤: 귀엽고 따뜻하지만 긴장감 있게.
2. js/core/data_quests.js — \`QuestData\` (DESIGN §3.5). 메인 ≥ 15(챕터별 선행 1~2개 + 보스 처치), 마을 의뢰 ≥ 20(giver 는 다양한 NPC, 층 1~10 분포, 종류 골고루), 일일 풀 ≥ 12, 히든 10(id 'hidden_f{n}', 두루마리 'scroll_hidden_f{n}' 획득으로 자동 수주, 목표는 그 층의 특정 chestId 'f{n}_hidden{k}' 열기 또는 몬스터 처치, 보상 레어/전설 사제 장비). 모든 보상 장비는 사제용. 각 퀘스트에 hint 한 줄.
3. js/core/data_dialogue.js — \`Dialogue\` (DESIGN §3.6). NPC 18명 각각 기본 대사 ≥ 6줄, 챕터별 대사(최소 챕터 1·3·5·6·8·10), 힌트(퀘스트/히든 상자/층 공략 팁: "6층부터는 거미가 힐러를 노려요" 등). \`Dialogue.pick\` 은 미완료 퀘스트 힌트·안 찾은 상자 힌트를 우선(30%), 나머지는 챕터 대사/기본 대사. \`Dialogue.greet\` 2~3줄.
4. js/core/quests.js — \`Quests\` 엔진 (DESIGN §7). Events 구독으로 진행(objectives 타입 전부), 선행 조건, 일일 3개 제공/리셋, 메인 완료 시 chapter 증가 + 'chapter_advanced', 히든 두루마리 'item_gained' 로 자동 수주, hintsFor(npcId). 보상 지급은 \`Inventory.add\`/골드/XP(\`Level.addXp\`) — 모듈이 없으면 안전하게 건너뜀.
테스트: tests/quests.test.js (수주→이벤트→완료→보상→챕터 증가, 일일 리셋, 히든 자동 수주, 선행 조건), tests/dialogue.test.js (모든 NPC 가 모든 챕터에서 빈 대사 없이 pick 가능, 힌트 포함률).`,

  gen: `${header('던전 생성기 담당(절차적 맵)')}

## 만들 파일
1. js/core/dungeon/gen.js — \`DungeonGen.generate(floor)\` (DESIGN §9). \`Floors.get(floor)\` 가 있으면 biome/landmarks/pool/minibosses/boss/monsterCount 를 쓰고, 없으면(테스트) 기본값. 요구: 160×160, walkableCount ≥ 10,000, 숲은 셀룰러 오토마타 공터+오솔길+호수(물 2)+덤불(4)·장식(3), 동굴은 방+통로+침식+수정 장식, spawn→boss 경로 BFS 보장, 모든 무리·상자 도달 가능, 몬스터 합계 ≥ 300(무리 60~80개, 중간보스 3 무리 포함, 보스 아레나 반대편 끝 반경 6타일 공터), 상자 ≥ 16(hidden ≥ 5, 덤불 뒤 막다른 길, id 규칙), landmarks 는 Floors 의 이름을 공간상 멀리 떨어진 특징점에 배치(호수 옆·큰 공터·막다른 길 등). 생성 < 1초(노드). 결정적(RNG.floorSeed).
2. tools/map_preview.js — \`node healer/tools/map_preview.js <floor>\` 가 맵을 160×160 문자(벽 #, 바닥 ., 물 ~, 덤불 *, 상자 C/h, 무리 m, 중간보스 M, 보스 B, 시작 S, 출구 E, 랜드마크 L)로 출력하고 통계(walkable, 몬스터 수, 상자 수, spawn→boss 거리)를 찍는다. 당신이 직접 1~10층 미리보기를 보고 "걸어 다닐 맛"이 나는지(긴 경로, 분기, 막다른 길의 상자) 확인하고 다듬어라.
테스트: tests/dungeon_gen.test.js (10층 전부 요구 수치 충족, 결정성, 연결성, 생성 시간).`,

  facilities: `${header('마을 시설·파티 담당')}

## 만들 파일
1. js/core/party.js — \`Party\` (DESIGN §6). 한국어 이름 풀(남녀 ≥ 40), 직업별 역할 결정(전사/무투가는 탱커 60%), 성격 한 줄, 레벨에 맞는 스탯(Classes.growth), 장비(직업 재질 옷+무기, Items 있으면 생성). hireCost = 100 + level*40.
2. js/core/facilities.js — \`Facilities\` (DESIGN §5 전부: shop, auction, bank, smithy, inn, engraver, temple, adventurer, guild). 경매장: hourIndex 기반 결정적 12~20개 목록(사제용 50%, 등급 분포 층 진행도 반영), 내 물건은 tick 때 가격이 적정가의 ≤1.2배면 분당 15% 확률로 팔림, 리셋권 사용. 여관: 음식 3종(피로 -20/-35/-50 + 10분 버프), 숙박 50골드. 각인사: 스탯 각인 6종 + 특수 각인 4종(20% 확률 방어↑, 20% 회피, 10% 힐 크리, 10% 마나 환급), 슬롯 제한. 신전: Skills.upgradeCost. 모험가 사무소: 하루 6명 후보(day 바뀌면 재생성), 고용/해고, board(마을 의뢰). 길드: NPC 길드 3개(각 고정 파티원 4명 memberInst 포함 — 가입 후 recruit 로 영입), create/leave. 모든 함수는 { ok, reason?, ... } 반환으로 UI 가 메시지를 띄울 수 있게.
테스트: tests/party.test.js, tests/facilities.test.js (각 시설 최소 1개 이상: 구매 골드 차감/가방 부족, 경매 회전 결정성, 은행 입출금, 수리비, 분해, 조합 재료 부족, 숙박 day+1, 각인 슬롯 제한, 스킬 강화 비용, 고용 4명 제한, 길드 생성 골드).`,

  combat: `${header('전투 엔진 담당')}

## 만들 파일 (DESIGN §8, §8.1, §8.3)
1. js/core/combat/entities.js — \`Entities\` fromPlayer/fromMember/fromMonster (Stats.derive 사용, 몬스터는 mDef.base + perFloor×(floor-1) × Floors.mult).
2. js/core/combat/combat.js — \`Combat.create\`, battle.update 등 계약 전부. 위협/어그로, 피해·회피·크리, 시전(이동 취소), 버프/저주 만료, 텔레그래프(circle/puddle fill 진행→피해), groundHeals, 사망/부활, 벨트 자동 소모품(\`Inventory.useConsumable\` 있으면), 이벤트 발행 전부, 활성 반경(20타일) 밖 몬스터는 갱신 생략. 맵은 \`{ solid(i,j), cols, rows }\` 인터페이스만 사용(테스트는 빈 맵).
   스킬 실행: 사제 스킬 타입별 효과(single_heal/aoe_heal/ground_heal/ultimate/resurrect/cleanse/buff/smite) 를 \`Skills.get\` 정의로 처리. 파티원 스킬(taunt/cleave/fireball/blizzard/multishot/backstab/blade_rush/flurry). 대상 자동 선택은 \`AIHealer.pickTarget\` 이 있으면 위임, 없으면 HP% 최저.
3. js/core/combat/ai_party.js — \`AIParty.update\` (탱커/근딜/원딜 행동, 비전투 시 플레이어 따라가기, 텔레그래프 회피).
4. js/core/combat/ai_monster.js — \`AIMonster.update\` (순찰/어그로/리쉬/능력/보스 phases/summon 상한/저주).
테스트: tests/combat.test.js — 빈 맵에서 파티(스텁 memberInst 4명)+몬스터 무리 전투를 60초 시뮬레이션해 (a) 탱커가 위협 1위, (b) 피해/힐 이벤트 발생, (c) 텔레그래프가 windup 후 피해, (d) puddle 이 지속 피해, (e) 저주 적용/만료, (f) 부활, (g) 보스 summon 으로 몬스터 수 증가, (h) 전멸 시 result='wipe'. 다른 모듈(Classes/Skills/Stats/Monsters/Items)은 이미 구현돼 있으니 실제 모듈을 로드해 테스트한다(tools/load.js 'all').`,

  healer: `${header('힐러 자동 로직 담당')}

## 만들 파일 (DESIGN §8.2 — 사용자가 지정한 우선순위를 정확히 구현)
1. js/core/combat/ai_healer.js — \`AIHealer\` decide/pickTarget/update/dodge. 규칙 1~8 을 그대로, 특히 "가장 HP 낮은 대상에게 단일힐", "광역힐도 같은 기준", "저주 해제는 저주 걸린 사람 중 HP 낮은 순". 마나 관리(MP<30% 기본힐, <20% 힐만, 벨트 포션), 시전 중 대기, 쿨/해금/MP 부족 시 다음 순위로 넘어가 **절대 꼬이지 않게**(같은 틱에 두 스킬 금지, 실패한 스킬 0.5초 재시도 금지). \`pickTarget\` 은 모든 스킬 타입을 처리(광역 무작위 N 은 HP 낮은 순 N 명으로 — 사용자 지정, ground 는 파티 무게중심, buff 는 역할별).
2. 기존 js/core/combat/combat.js 의 \`useSkill\` 이 AIHealer.pickTarget 을 호출하는지 확인하고, 필요하면 최소 수정(다른 담당자 파일이지만 통합을 위해 허용 — 바꾼 곳에 주석).
테스트: tests/ai_healer.test.js — 시나리오별 decide 결과 검증 ≥ 10개: (1) 2명 다침 → 가장 낮은 사람 단일힐, (2) HP 30% → 즉시힐 승격, (3) 3명 70% 이하 → 광역, (4) 저주 2명 중 HP 낮은 사람 cleanse, (5) root 저주 즉시 해제, (6) MP 15% → 기본힐만, (7) 죽은 탱커 + 안전 → 부활, (8) 평균 40% → 필살기, (9) 언데드+무피해 → smite, (10) 시전 중 → null, (11) 버프 유지, (12) dodge 가 텔레그래프 밖 좌표 반환.`,

  floor: `${header('층 런타임·시뮬레이션·밸런스 담당')}

## 주의: 이전 담당자가 js/core/dungeon/floor.js, tools/sim.js, tests/floor.test.js, tests/sim_smoke.test.js 초안을 이미 만들어 두었고 테스트가 통과한다(node tools/sim.js 1 300 동작). 처음부터 다시 쓰지 말고 읽어서 이어받아 완성·보강하라. 특히 밸런스 패스(3번)가 아직 안 됐다. 시뮬은 maxSeconds 를 충분히(1층 1500초 이상) 줘야 끝까지 간다.

## 만들 파일
1. js/core/dungeon/floor.js — \`Floor\` (DESIGN §9): start(맵 생성 → 몬스터 엔티티 300+ 배치, Combat.create, 상자 상태), update(활성 반경, 걸음 집계·'steps', 상자 근접(1.5타일) 자동 열기 → Loot.chest → Inventory.add/골드 → 'chest_opened', 숨김 상자 2타일 내 드러남, 보스 처치 → 출구 활성, 출구 도달 → cleared), openChest, leave(피로·기록·'floor_cleared'·파티 XP·마을 복귀 상태 정리, wipe 시 사망 페널티: 피로 +10, 내구도 -20%).
2. tools/sim.js — \`node healer/tools/sim.js <floor> [maxSeconds] [partyLevel]\`: 새 게임 + 적정 레벨 파티(탱1 근딜1 원딜1 힐러=플레이어 + 원딜1) + 층 장비 → 층 생성 → "탐험 봇"(가장 가까운 미방문 무리/상자/중간보스/보스 순으로 길찾기 이동, 전투는 AI) 으로 끝까지 진행. dt=0.1 고정 스텝으로 빠르게. 출력: 결과(cleared/wipe/timeout), 걸린 시간, 걸음 수, 킬 수, 상자 수, 플레이어 사망 횟수, 파티원 사망 횟수, 평균 MP, 사용 스킬 통계, 보스 페이즈 도달. \`--json\` 옵션.
3. 밸런스 패스: 1~10층을 각 3회 돌려 표를 만들고(README 또는 반환 summary 에), 1~5층은 적정 레벨에서 ≥90% 클리어·파티원 사망 ≤1, 6~10층은 적정 레벨+좋은 장비에서 50~80% 클리어가 되도록 \`data_monsters.js\` 의 mult/base 수치와 \`Floors.levelRange\` 만 조정(다른 로직 수정은 openIssues 에 제안). 10층은 한 번이라도 클리어되는 것을 확인.
테스트: tests/floor.test.js (start 후 몬스터 ≥300, 상자 열기 → 아이템 획득 이벤트, 보스 처치 플래그 → 출구, leave 기록), tests/sim_smoke.test.js (1층 시뮬 60초 안에 오류 없이 진행).`,
}

phase('Systems')
const pA = agent(P.classes, { label: 'classes_skills_stats_level', phase: 'Systems', schema: OUT })
const pD = agent(P.quests, { label: 'story_quests_dialogue', phase: 'Systems', schema: OUT })
const pB = agent(P.items, { label: 'items_inventory_economy', phase: 'Systems', schema: OUT })
const pE = agent(P.gen, { label: 'dungeon_gen', phase: 'Systems', schema: OUT })
const pC = agent(P.monsters, { label: 'monsters_floors_loot', phase: 'Systems', schema: OUT })
const pFac = Promise.all([pA, pB]).then(() => agent(P.facilities, { label: 'facilities_party', phase: 'Systems', schema: OUT }))

phase('Combat')
const pCombat = Promise.all([pA, pC, pB]).then(() => agent(P.combat, { label: 'combat_engine', phase: 'Combat', schema: OUT }))
const pHealer = pCombat.then(() => agent(P.healer, { label: 'ai_healer', phase: 'Combat', schema: OUT }))

phase('Floor')
const pFloor = Promise.all([pHealer, pE, pFac, pD]).then(() => agent(P.floor, { label: 'floor_sim_balance', phase: 'Floor', schema: OUT }))

const results = await Promise.all([pA, pB, pC, pD, pE, pFac, pCombat, pHealer, pFloor])
const names = ['classes', 'items', 'monsters', 'quests', 'gen', 'facilities', 'combat', 'healer', 'floor']
results.forEach((r, i) => log(`${names[i]}: ${r ? (r.testsPassed ? '테스트 통과' : '테스트 실패') + ' — ' + r.summary.slice(0, 120) : '실패(null)'}`))
const deviations = results.filter(Boolean).flatMap((r, i) => (r.deviations || []).map(d => `[${names[i]}] ${d}`))
const openIssues = results.filter(Boolean).flatMap((r, i) => (r.openIssues || []).map(d => `[${names[i]}] ${d}`))

phase('Verify')
const e2e = await agent(`${header('통합 검증 담당')}

모든 핵심 모듈이 구현되었다. 당신의 일은 전체가 맞물려 돌아가게 만드는 것이다(모든 core 파일 수정 허용, 바꾼 이유를 주석으로).
다른 담당자들이 보고한 계약 이탈: ${deviations.length ? deviations.join(' / ') : '없음'}
미해결 이슈: ${openIssues.length ? openIssues.join(' / ') : '없음'}

1. \`node ${H}/tools/run_tests.js\` 전체 실행 → 실패 전부 수정.
2. tests/e2e.test.js 작성: 새 게임 → 프롤로그 텍스트 존재 → 모험가 사무소 후보 6명 → 4명 고용 → 상점에서 포션 구매·벨트 등록 → 1층 Floor.start → 봇이 상자 1개 열고 무리 1개 전투(자동힐 동작: heal 이벤트 ≥1, 힐 대상이 당시 HP% 최저였는지 검증) → 중간보스 → 보스(summon 이벤트 발생) → 출구 → leave → 챕터 1 메인 퀘스트 완료 가능 → 보상 → State.save/load 왕복 후 동일. 그리고 2~10층 Floor.start 가 오류 없이 되는지(생성 통계 출력).
3. \`node ${H}/tools/sim.js\` 로 1, 3, 5, 6, 8, 10층 각 1회 실행해 결과 표를 summary 에 적는다. 사용자 요구 재확인: 층당 몬스터 ≥300, 중간보스 3+보스 1, 보스 summon 패턴, 걸음 ≥10,000 가능한 맵, 1~5층 쉬움·6층부터 어려움.
4. DESIGN.md 를 실제 구현과 일치하게 갱신(바뀐 API 반영).
반환 summary 에 테스트 수/통과, 시뮬 표, 남은 리스크를 적는다.`, { label: 'integrate_e2e', phase: 'Verify', schema: OUT })

const reviews = (await parallel([
  () => agent(`당신은 시니어 게임 프로그래머 리뷰어다. ${H}/js/core/** 전체와 ${DESIGN}, ${H}/README.md 기획 요약을 읽고 **사용자 기획 대비 누락/오류**를 찾는다. 관점: 힐러 스킬 우선순위(가장 HP 낮은 대상, 저주 해제 우선순위, 마나 관리, 꼬임 없음), 보스 패턴 다양성·소환, 난이도 곡선(1~5 쉬움, 6~10 급증), 시설 전부 실제 동작, 퀘스트 4종과 NPC 힌트, 세트/벨트/가방/은행, 저장. 코드를 실제로 실행(node 로 모듈 로드·함수 호출)해 확인한 것만 보고. severity 3=기획 요구 미충족/크래시, 2=동작은 하나 기획과 다름, 1=개선. 각 항목에 파일과 구체적 수정안.`, { label: 'review_spec', phase: 'Verify', schema: REVIEW }),
  () => agent(`당신은 코드 리뷰어다. ${H}/js/core/** 를 읽고 **런타임 버그·성능·일관성** 문제를 찾는다: 미정의 전역 참조, 계약과 다른 시그니처, NaN/undefined 가능성, 무한 루프, 매 틱 O(n²)(몬스터 300 × 파티 5 는 괜찮지만 300×300 은 안 됨), 저장 JSON 에 함수/순환 참조, 이벤트 리스너 누수(Floor.start 반복 시), 결정성 깨짐(던전 생성에 Math.random 사용). \`node ${H}/tools/run_tests.js\` 와 \`node ${H}/tools/sim.js 1 120\` 을 실행해 프로파일(시간)도 본다. 확인된 것만 보고, 파일·줄·수정안 포함.`, { label: 'review_code', phase: 'Verify', schema: REVIEW }),
])).filter(Boolean)
const issues = reviews.flatMap(r => r.issues || []).filter(i => i.severity >= 2).sort((a, b) => b.severity - a.severity)
log(`리뷰 이슈(severity≥2): ${issues.length}`)
let fix = null
if (issues.length) {
  fix = await agent(`${header('수정 담당')}

리뷰어가 확인한 문제를 모두 고친다(모든 core 파일·테스트 수정 허용). 고친 뒤 \`node ${H}/tools/run_tests.js\` 전체 통과와 \`node ${H}/tools/sim.js 1 180\`, \`node ${H}/tools/sim.js 6 240\` 정상 실행을 확인한다.
${issues.map((it, i) => `${i + 1}. [S${it.severity}] ${it.file}: ${it.description}\n   → ${it.fix}`).join('\n')}
반환 summary 에 항목별 처리 결과(고침/보류+이유).`, { label: 'fix_reviews', phase: 'Verify', schema: OUT })
}

return { modules: results.map((r, i) => ({ name: names[i], ok: !!(r && r.testsPassed), summary: r ? r.summary : null })), deviations, openIssues, e2e: e2e ? e2e.summary : null, reviewIssues: issues.length, fix: fix ? fix.summary : null }