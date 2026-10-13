export const meta = {
  name: 'healer-build-all',
  description: '모두의 힐러 제작 전용: 남은 던전 그래픽 + 모든 화면 + 브라우저 통합 (비평 없음)',
  phases: [
    { title: 'Art', detail: '남은 던전 그래픽' },
    { title: 'Build', detail: '씬·UI 화면·파티원 스프라이트 병렬 구현' },
    { title: 'Integrate', detail: 'index.html 배선, 브라우저 E2E, 버그 수정' },
  ],
}
const H = '/home/user/tapwar/healer'
const SP = '/home/user/tapwar/healer/tools'
const STYLE_REFS = `${SP}/out/r2_sprites.png (현재 플레이어·NPC 시트: 외곽선 색·3톤 명암·눈 스타일을 맞출 것), ${SP}/out/r2_town_plaza.png (마을 타일 톤), ${SP}/ref/ref2_single_front_x6.png (레퍼런스 캐릭터)`
const OUT = { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, screenshots: { type: 'array', items: { type: 'string' } }, ok: { type: 'boolean' }, summary: { type: 'string' }, openIssues: { type: 'array', items: { type: 'string' } } }, required: ['files', 'ok', 'summary'] }
const CRIT = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'number' }, where: { type: 'string' }, description: { type: 'string' }, suggestion: { type: 'string' } }, required: ['severity', 'where', 'description', 'suggestion'] } }, overall: { type: 'string' } }, required: ['issues'] }

function artHeader(role) {
  return `당신은 모바일 세로 RPG "모두의 힐러"의 ${role}(픽셀 아티스트 겸 개발자). 저장소 ${H} (브랜치 claude/upbeat-euler-gdw42r, 메인 저장소에서 직접 작업, git commit 금지). 모든 그래픽은 코드로 생성한다(이미지 파일 없음).

## 먼저 읽을 것
- ${SP}/ART_SPEC.md (스타일 규칙: 좌상단 광원, 따뜻한 갈색 외곽선 #3b2a2a, 재질당 3톤, 정수 좌표·fillRect 만, Pixel 유틸)
- ${H}/DESIGN.md 의 §10 (그래픽 모듈 계약) — 당신 모듈의 API 를 그대로 지킬 것
- ${H}/js/pixel.js (수정 금지), ${H}/js/sprites.js (도트맵→캔버스 조립 방식 참고), 레지스트리 ${H}/js/sprites_monsters.js, ${H}/js/tiles_dungeon.js (수정 금지, register 로 등록)
- 스타일 레퍼런스(Read 로 볼 것): ${STYLE_REFS}
- 렌더 결과 PNG 는 반드시 Read 로 열어 눈으로 확인하고 최소 4회 고친다. PAGEERROR 는 반드시 고친다. 당신에게 배정된 파일만 만든다.`
}

const AP = {
  monForest: `${artHeader('숲 몬스터 담당')}

## 만들 파일: ${H}/js/sprites_monsters_forest.js
\`MonsterSprites.register(id, builder)\` 로 다음 20종을 등록한다(id 는 데이터와 정확히 일치): goblin, goblin_archer, goblin_shaman, wolf, spider, sheepie(양 괴물), zombie, skeleton, sprite(숲 정령), werewolf, siren, orc, orc_berserker, troll(48px), treant(48px, 나무 정령) + 보스 boss_goblin_king(고블린 왕 그락, 왕관·큰 몽둥이), boss_spider_queen(거대 거미 여왕), boss_werewolf_chief(늑대인간 족장 루가), boss_siren_queen(세이렌 여왕 네레아), boss_troll_chief(트롤 족장 모르그). 보스는 80×80.
- 스타일: 귀엽지만 몬스터답게(큰 눈·둥근 실루엣, WoW 호드/판타지 느낌의 색·장비). 플레이어 시트와 같은 외곽선·명암 규칙. 일반 32×32(몸 24~28), size2 48×48. 4방향×4프레임(좌=우 반전 가능, 뒷면은 등·꼬리 등 특징) + attack 2프레임(앞으로 기울기/무기 휘두름).
- 언데드(zombie, skeleton)는 한눈에 언데드로 보이게(뼈/썩은 피부). 세이렌은 하반신 지느러미, 늑대·거미는 4족.
- 도트맵은 가족별 템플릿(예: 고블린 3종은 같은 몸에 무기·장식만 다르게)으로 효율적으로 만들되, 서로 구분되어야 한다.
- 렌더: \`node ${SP}/harness/render_monsters.mjs ${H}/js ${SP}/out/monsters_forest.png\` (동굴 파일이 아직 없으면 숲만 나온다). 2x 미리보기 줄에서 실루엣이 읽히는지 확인.
반환: files, screenshots(최종 PNG), ok, summary, openIssues.`,

  monCave: `${artHeader('동굴 몬스터 담당')}

## 만들 파일: ${H}/js/sprites_monsters_cave.js
\`MonsterSprites.register(id, builder)\` 로 다음 16종을 등록한다(id 는 데이터와 정확히 일치): bat, cave_spider, golem_stone(48px), golem_crystal(48px), naga, naga_priest, orc_warlord(48px), troll_shaman(48px), wraith(반투명 느낌의 망령, 언데드), skeleton_knight(48px, 언데드), drake(48px, 새끼 드래곤) + 보스 boss_golem_lord(돌 골렘 군주), boss_naga_priestess(나가 여사제 샤일라), boss_orc_warchief(오크 대족장 가르돈), boss_wraith_king(망령 왕 아셀: 옛 대사제, 찢어진 사제 로브+왕관, 언데드), boss_dragon(잿빛 드래곤 바르가, 96×96 허용, 날개 펼침). 보스는 80×80.
- 스타일: 귀엽지만 몬스터답게(큰 눈·둥근 실루엣, WoW 호드/판타지 느낌). 플레이어 시트와 같은 외곽선·명암 규칙. 일반 32×32(몸 24~28), size2 48×48. 4방향×4프레임(좌=우 반전 가능) + attack 2프레임.
- 골렘은 돌/수정 질감(수정은 하늘색 결정이 박힘), 나가는 뱀 하반신, 망령은 떠 있는 느낌(발 없음·바닥 그림자만), 드래곤은 날개 펄럭임을 걷기 프레임으로.
- 렌더: \`node ${SP}/harness/render_monsters.mjs ${H}/js ${SP}/out/monsters_cave.png\`. 2x 미리보기 줄에서 실루엣이 읽히는지 확인.
반환: files, screenshots(최종 PNG), ok, summary, openIssues.`,

  tilesForest: `${artHeader('숲 던전 타일셋 담당')}

## 만들 파일: ${H}/js/tiles_forest.js  (+ 상자/출구 스프라이트)
\`DungeonTiles.registerBiome('forest', { chunk(ctx, map, ci, cj, {TILE, CHUNK}), minimapColor(tile), chestSprite(open, type), exitSprite() })\`.
- 타일 0 = 빽빽한 숲(나무 수관이 이어진 느낌: 이웃이 바닥인 가장자리는 나무 줄기·그늘이 보이는 오토타일, 안쪽은 진한 수관 패턴), 1 = 잔디 바닥(풀 결·색 변화, 흙길 느낌을 군데군데), 2 = 물(호수: 물결 하이라이트, 가장자리 모래/돌), 3 = 바닥 장식(꽃·버섯·작은 돌·낙엽, 결정적 난수로 종류 선택), 4 = 덤불(둥근 관목, 통행 불가·상자 가림).
- 오토타일: 벽(0)의 상하좌우/대각 이웃을 보고 가장자리·모서리를 그린다(위쪽 가장자리는 줄기+그림자 띠, 아래쪽은 수관 윗면). 결정적(RNG.hash(ci,cj) 시드) 변주.
- 상자 3종(normal 나무+쇠, hidden 보라 보석 박힌 상자, quest 금색 두루마리 상자) 열림/닫힘 28×24, 출구(빛나는 계단/포털) 48×56.
- 성능: 청크 1개(16×16타일, 512×512px) ≤ 8ms. 큰 면은 미리 만든 타일 캔버스를 drawImage 로 찍는다(타일 변주 4~6개 캐시).
- 렌더: \`node ${SP}/harness/render_tiles.mjs ${H}/js 1 ${SP}/out/tiles_f1\` 와 3층(\`... 3 ${SP}/out/tiles_f3\`). _spawn/_mid/_boss(폰 크기)·_overview 를 보고 "걸어 다니고 싶은 숲"인지, 벽/바닥/물 구분이 또렷한지, 이음새가 없는지 확인.
반환: files, screenshots, ok, summary, openIssues.`,

  tilesCave: `${artHeader('동굴 던전 타일셋 담당')}

## 만들 파일: ${H}/js/tiles_cave.js
\`DungeonTiles.registerBiome('cave', { chunk(ctx, map, ci, cj, {TILE, CHUNK}), minimapColor(tile) })\`.
- 타일 0 = 암벽(이웃이 바닥인 쪽에 절벽 면·바위 하이라이트가 보이는 오토타일, 안쪽은 어두운 바위 질감), 1 = 동굴 바닥(회갈색 돌바닥, 자갈·균열·색 변화), 2 = 지하수(검푸른 물, 반사 하이라이트), 3 = 장식(수정 군락(하늘색·보라 발광), 버섯(발광 버섯), 뼈, 종유석 그림자), 4 = 바위 더미(통행 불가·상자 가림).
- 분위기: 어둡지만 폰에서 읽히게(바닥은 충분히 밝은 중간 톤, 벽은 어둡게). 수정이 빛을 내는 느낌(주변 바닥에 은은한 색).
- 오토타일: 벽 상하좌우/대각 이웃 기반 가장자리·모서리. 결정적 변주.
- 성능: 청크 ≤ 8ms, 타일 캔버스 캐시.
- 렌더: \`node ${SP}/harness/render_tiles.mjs ${H}/js 6 ${SP}/out/tiles_f6\` 와 10층(\`... 10 ${SP}/out/tiles_f10\`). 숲 담당자의 상자/출구가 없으면 기본 대체 그림이 나온다(무시). _spawn/_mid/_boss·_overview 확인.
반환: files, screenshots, ok, summary, openIssues.`,

  fx: `${artHeader('전투 이펙트 담당')}

## 만들 파일: ${H}/js/fx.js — 전역 \`FX\` (DESIGN §10 API 그대로)
- \`FX.spawn(type, x, y, opts) -> fx\`(월드 좌표, fx = { type, x, y, t, duration, ...opts }), \`FX.update(dt)\`(만료 제거), \`FX.draw(ctx, cam)\`(모든 fx; cam = {x, y} 는 참고용이고 ctx 에 이미 월드 변환이 적용되어 있다고 가정), \`FX.drawOne(ctx, fx, cam)\`, \`FX.types()\`, \`FX.clear()\`.
- 타입: heal_sparkle(대상 위로 떠오르는 초록/흰 십자·반짝임 0.8s), aoe_ring(opts.r, opts.fill 0~1: 붉은 원 테두리 2px + 안쪽을 fill 비율만큼 부채꼴/농도로 채움, 완료 직전 깜빡임), puddle_circle(opts.r, fill: 빨간 마법진(룬 고리) + 지속 중 맥동), ground_heal(opts.r: 초록 성역 마법진 + 떠오르는 빛 입자), hit(피격 흰 번쩍 + 작은 파편 0.25s), projectile(opts.from/to/color, 진행률 t/duration 로 위치), levelup(금빛 기둥+별 1.2s), cast_glow(발 밑 둥근 빛 맥동, 지속 중), summon_puff(보라 연기 0.6s), revive(흰 빛 기둥 1s), damage_number(opts.text, opts.color: 떠오르며 사라지는 숫자, 폰트 bold 10px·외곽선), curse_icon(머리 위 보라 해골 점멸).
- 픽셀 스타일 유지(정수 좌표, fillRect/Pixel.circle, 1~2px 입자). 텍스트(damage_number)만 ctx.fillText 허용.
- 렌더: \`node ${SP}/harness/render_fx.mjs ${H}/js ${SP}/out/fx.png\` (타입별 진행률 0/.25/.5/.75/1 스트립). 결과를 보고 각 이펙트가 2x 배율에서 읽히는지 확인.
- 테스트: 노드에서 \`FX.spawn/update/clear\` 가 캔버스 없이 동작하는지(\`node -e\`) 확인.
반환: files, screenshots, ok, summary, openIssues.`,
}

function header(role) {
  return `당신은 모바일 세로 RPG "모두의 힐러"의 ${role}. 저장소 ${H} (브랜치 claude/upbeat-euler-gdw42r, 메인 저장소에서 직접 작업, git commit 금지).

## 먼저 읽을 것
- ${H}/DESIGN.md 전체 — 특히 §2 상태, §5 시설 API, §7 퀘스트, §8 전투(battle API), §9 Floor, §10 그래픽, §11 UI/씬 계약. 여기 적힌 API 를 그대로 쓴다. 실제 구현 시그니처는 코드로 확인(core 모듈은 이미 완성·테스트됨: \`node ${H}/tools/run_tests.js\`).
- 공통 프레임워크(이미 구현, 수정 금지): ${H}/js/ui/ui.js (+ css/ui.css), ${H}/js/scenes/scene.js (Scenes: view/cam/zoom, screenToWorld, followCamera, moveAxis, beginWorld, drawLabel/drawBubble/drawMiniBar/drawJoystick, 루프). 기존 마을 로직 참고: ${H}/js/main.js, ${H}/js/town.js, ${H}/js/sprites.js.
- 미리보기: \`node ${H}/tools/ui_preview.mjs <screen> <out.png> [paramsJSON] [stateJS]\` — 샘플 상태로 화면을 열어 스크린샷(390×844). 반드시 Read 로 열어 눈으로 확인하고 다듬는다(최소 3회). PAGEERROR/콘솔 오류 0.

## 공통 규칙
- 당신에게 배정된 파일만 만든다. 모든 화면은 \`UI.register(name, {...})\` 로 등록하고 \`Facilities.*\`/\`Inventory.*\`/\`Quests.*\` 의 \`{ ok, reason }\` 를 토스트로 보여준 뒤 \`api.refresh()\`. 상태 변경 후 \`State.save()\`.
- 세로 폰 기준(390×844), 터치 44px 이상, 한국어 UI 텍스트, 등급색은 Items.GRADES[grade].color, 골드는 UI.gold.
- 코드 주석은 한국어로 "왜"를 적는다. 콘솔 로그 금지.

## 반환
files, screenshots(최종 PNG 절대경로), ok, summary(구현한 화면/기능·주요 결정), openIssues(통합 담당자가 알아야 할 점).`
}

const P = {
  town: `${header('마을 씬·부트 담당')}

## 만들 파일
1. ${H}/js/scenes/town_scene.js — 기존 main.js 의 마을 로직(NPC 배회·말풍선, 탭/조이스틱 이동, 건물 라벨, 문 앞 안내, 구름 그림자)을 \`Scenes.register('town', scene)\` 씬으로 옮긴다(scene.js 의 view/cam/입력/헬퍼 사용, main.js 의 중복 코드 제거). 변경점:
   - NPC 는 Dialogue 의 npcId 와 1:1 (guard1, guard2, priest_elder(신전 앞 장로 엘다), smith, merchant1, merchant2, innkeeper(여관 앞), banker(은행 앞), engraver, auctioneer, guildmaster, adventurer_clerk, villager_a~e, child_a, child_b). 각 시설 앞에 담당 NPC 가 서 있고 배회 NPC 는 Dialogue 기본 대사를 말풍선으로.
   - NPC 터치 → 가까이 걸어간 뒤 \`UI.dialog({ name, portrait: 스프라이트 down[0], lines: Dialogue.greet(npcId, G), choices })\`: choices 는 그 NPC 의 수주 가능 퀘스트(\`Quests.available(G, npcId)\`) "수락: 제목" + 완료 가능 퀘스트 "완료: 제목" + "닫기". 수락/완료 시 Quests.accept/complete 호출·보상 토스트. 대화 후 'npc_talk' 이벤트.
   - 시설 문 앞 안내(들어가기) → \`UI.open('shop'|'auction'|'bank'|'smithy'|'inn'|'engraver'|'temple'|'adventurer'|'guild')\` (건물 key 매핑: shop→'shop', auction, bank, smithy, inn, engraver, temple, adventurer, guild; 민가는 "잠겨 있어요" 토스트). 'facility_visit' 이벤트. 성문 → \`UI.open('tower')\`.
   - 하단 고정 버튼 바(DOM, index.html 에 추가): 가방(inventory)·상태(status)·퀘스트(quests)·파티(party). 상단 HUD(이름·레벨·HP/MP·골드·피로)는 G 에서 매 초 갱신.
   - 챕터 진행 시 \`Story.chapters[n].townEvent\` 가 있으면 마을 진입 때 한 번 \`UI.dialog\` 로 재생(G.story.flags 로 1회 보장).
2. ${H}/js/main.js 를 부트 전용으로 다시 쓴다: DOM 준비 → \`UI.init()\` → \`Scenes.init('view')\` → 씬 등록은 각 씬 파일이 함(town_scene.js, dungeon_scene.js) → 저장 있으면 \`UI.open('title')\`(ui_title.js 가 "이어하기/새 게임" 처리 후 \`Scenes.go('town')\`) 없으면 \`State.newGame()\` → \`UI.story(Story.prologue, '프롤로그')\` → \`Scenes.go('town')\`. 60초마다·씬 전환('scene_change')·UI 닫힘 때 \`State.save()\`. 'return_town' 이벤트 → 마을로. 전역 디버그 \`window.__healer = { G: () => State.get(), Scenes, UI, State, Town, Floor, goTo, ... }\` 유지(E2E 가 사용).
3. ${H}/index.html — DESIGN §1 순서대로 모든 스크립트 태그(존재하지 않는 파일도 순서에 넣되, 통합 담당이 확인) + \`<link rel="stylesheet" href="css/ui.css">\` + css/hud.css, 기존 HUD/프롬프트/토스트 DOM 유지·하단 버튼 바 추가. 캐시 방지용 ?v= 쿼리.
검증: \`node ${SP}/harness/shoot_app.mjs ${H} ${SP}/out/town_scene\` (이 하네스는 window.__healer.goTo/Town 을 쓴다 — 유지할 것) 과 Playwright 로 NPC 대화창·시설 UI 열기(아직 화면이 없으면 "준비 중" 토스트가 정상)·하단 버튼을 찍어 확인.`,

  dungeon: `${header('던전 씬 담당')}

## 만들 파일: ${H}/js/scenes/dungeon_scene.js (+ ${H}/css/hud.css, HUD DOM 은 씬이 enter 때 생성/exit 때 제거)
\`Scenes.register('dungeon', scene)\`; enter({ floor }) 에서 \`Floor.start(G, floor)\` → fs. 핵심:
- 렌더: \`DungeonTiles.chunk(map, ci, cj)\` LRU 캐시(최대 30개, 보이는 청크만 drawImage), 깊이 정렬(몬스터·파티원·플레이어·상자·출구 — sortY 기준), 몬스터 스프라이트 \`MonsterSprites.forDef(ent.def)\`(방향·걷기 프레임, 공격 시 attack 프레임), 파티원 \`Sprites.get(ent.cls)\`(없으면 'villagerA'), 플레이어 'player'. 발 그림자. 숨김 상자는 드러난 뒤에만 그림. 텔레그래프/장판/성역은 \`FX.drawOne(ctx, { type: 'aoe_ring'|'puddle_circle'|'ground_heal', x, y, r, fill })\` 로 매 프레임, 그 외 이펙트는 battle 이벤트('damage','heal','death','cast_start','summon','revive','level_up','curse')를 구독해 \`FX.spawn\`. 데미지/힐 숫자(damage_number). 안개: 미방문 영역은 어둡게(선택, fs.visited 사용).
- 카메라: 플레이어 추적(Scenes.followCamera, 월드 경계 = map.cols*32).
- 조작: 탭 → 길찾기 이동(Town.findPath 대신 map 용 A*: Floor 또는 DungeonGen 에 있으면 사용, 없으면 씬에 구현 — 타일 160×160 이라 탐색 범위 제한), 조이스틱 → 직접 이동(시전 취소), 자동 따라가기(settings.autoFollow: 조작이 없으면 파티 무게중심 뒤 2타일을 따라감; 파티원 AI 는 비전투 시 플레이어를 따라오므로 "탐험" 은 플레이어가 탭으로 목적지를 찍으면 파티가 따라오는 방식 + 자동 탐험 버튼(가장 가까운 미방문 무리/상자/보스로 자동 이동, 전투 중 정지)).
- HUD(DOM, hud.css): 상단 파티 프레임 5개(이름·역할 아이콘·HP/MP 바·저주 아이콘·사망 표시, 탭하면 수동 힐 대상 지정), 보스 교전 시 보스 HP 바(이름·페이즈), 플레이어 시전 바, 스킬 바(하단: 단일힐(길게 누르면 기본/빠른/즉시 선택)·광역힐(2명/3명/바닥 선택)·저주 해제·버프 메뉴·필살기(쿨 표시)·부활·성스러운 일격·자동힐 토글·자동회피 토글; 해금 안 된 스킬은 잠금, 쿨타임·MP 부족 표시), 걸음·킬·상자 카운터, 층 이름, 가방/퀘스트/귀환 버튼(귀환은 확인창 → Floor.leave(fs,G,'escape') → Scenes.go('town')), 미니맵 토글(fs.visited + DungeonTiles.minimapColor, 파티/상자/보스 점).
- 자동 힐은 \`AIHealer.update(player, battle, G, dt)\` (settings.autoHeal), 수동 스킬 버튼은 \`battle.useSkill(player, skillId, target?)\`. 자동회피는 \`AIHealer.dodge\` 결과로 이동. 텔레그래프 안에 플레이어가 있으면 화면 가장자리 붉은 경고.
- 흐름: \`Floor.update(fs, G, dt)\` 호출; battle.result==='wipe' → \`Floor.leave(fs,G,'wipe')\` → \`UI.open('result', {…})\`; 보스 처치 → 챕터 outro \`UI.story\`; 출구 도달(fs.cleared) → \`Floor.leave(fs,G,'cleared')\` → result 화면 → 마을. 층 진입 시 \`Story.chapters[floor].intro\` 를 \`UI.story\` 로(한 번만, G.story.flags).
- 성능: 활성 반경 밖 몬스터는 그리지도 않음, 청크 캐시, DOM HUD 는 값이 바뀔 때만 갱신(초당 10회 제한).
검증: Playwright 스크립트 ${H}/tools/dungeon_shot.mjs 를 만들어(ui_preview.mjs 방식으로 모든 스크립트 로드 → State.newGame + 파티 4명 고용 → Scenes.init → Scenes.go('dungeon',{floor:1}) → 몇 초 진행 → 몬스터 무리 근처로 플레이어 순간이동(window.__healer) → 전투 3초 → 스크린샷) 전투 중 HUD·텔레그래프·숫자·스킬 바를 눈으로 확인. 6층도 한 번. PAGEERROR 0, 60fps 근접(Scenes.fps()).`,

  shopAuctionBank: `${header('상인·경매장·은행 UI 담당')}

## 만들 파일: ${H}/js/ui/ui_shop.js, ui_auction.js, ui_bank.js
- shop: 탭 [구매 | 판매]. 구매: Facilities.shop.stock(G) 목록을 UI.itemCard(price=Economy.buyPrice, 버튼 "구매"(수량 1/10 선택)), 판매: 가방 아이템 카드(price=Economy.sellPrice, "판매"), 장비/퀘스트 아이템 구분. 상단에 골드.
- auction: 탭 [구매 | 내 판매]. 구매: Facilities.auction.listings(G) (다음 회전까지 남은 시간 표시, "리셋권 사용" 버튼 → reset), 카드에 "구매". 내 판매: 가방에서 올리기(가격 입력 UI.prompt, 적정가 안내 = Economy.sellPrice×2 근처), 올린 목록·판매 상태, tick(G) 를 열 때·1분마다 호출해 팔린 골드 수령 토스트.
- bank: 탭 [보관함 | 가방 | 골드]. 보관함 카드 "찾기", 가방 카드 "맡기기", 골드 입/출금(UI.prompt 숫자). 칸 수 표시.`,

  smithyInnEngraverTemple: `${header('대장간·여관·각인사·신전 UI 담당')}

## 만들 파일: ${H}/js/ui/ui_smithy.js, ui_inn.js, ui_engraver.js, ui_temple.js
- smithy: 탭 [수리 | 분해 | 조합]. 수리: 장착+가방 장비 중 손상된 것 카드(내구도 바, 비용, "수리") + "전부 수리". 분해: 장비 카드("분해" → 확인창, 결과 재료 토스트, Economy.disassemblePreview 로 예상 재료 표시). 조합: Items.recipes() 목록(필요 재료 보유/부족 색 표시, "제작").
- inn: 메뉴(음식 3종 카드: 효과·가격·"먹기") + "숙박(50골드)" (피로 바 표시, 숙박 후 day+1·일일 퀘스트 리셋 토스트). 현재 피로·HP/MP 바.
- engraver: Facilities.engraver.options(G) 목록(이름·효과·비용·재료, "각인"), 현재 각인 목록·슬롯 수, 제거(있으면).
- temple: Skills.priest() 전부 — 해금 레벨·현재 레벨·효과 수치(Skills.healAmount 등으로 현재/다음 레벨 비교)·강화 비용(Facilities.temple.cost), "강화" 버튼(잠금/만렙 표시). 장로 엘다의 한 줄 인사(Dialogue.pick('priest_elder', G)).`,

  adventurerGuildPartyTower: `${header('모험가 사무소·길드·파티·탑 입장 UI 담당')}

## 만들 파일: ${H}/js/ui/ui_adventurer.js, ui_guild.js, ui_party.js, ui_tower.js
- adventurer: 탭 [고용 | 내 파티 | 의뢰 게시판]. 고용: Facilities.adventurer.candidates(G) 카드(직업 아이콘·이름·레벨·역할·주요 스탯·성격·고용비, "고용"; 4명 제한 안내). 내 파티: 멤버 카드("해고" 확인창). 게시판: Facilities.adventurer.board(G) 의 마을 의뢰(목표·보상, "수락").
- guild: 길드 없음 → Facilities.guild.list(G) 의 NPC 길드 3개(소개·고정 파티원 목록, "가입") + "길드 창설(1000골드)"(이름 UI.prompt). 길드 있음 → 이름/레벨/멤버(멤버 "영입" → recruit), "탈퇴".
- party: 파티원 상세(스탯·장비·역할·레벨/XP 바), 플레이어 포함 5칸, 역할 구성 요약(Party.roles).
- tower: 층 목록 1~10(이름·바이옴·권장 레벨·기록(클리어 횟수/최고 시간)·잠금(highestCleared+1 까지), 선택 → 파티 요약·피로 경고(≥100 불가) → "입장" → \`Scenes.go('dungeon', { floor })\`. 파티 0명이면 혼자 가는지 확인창.`,

  invStatusQuestsTitleResult: `${header('가방·상태·퀘스트·타이틀·결과 UI 담당')}

## 만들 파일: ${H}/js/ui/ui_inventory.js, ui_status.js, ui_quests.js, ui_title.js, ui_result.js
- inventory(full): 상단 장비 슬롯 12개(grid, 아이콘, 탭 → 상세 카드+해제), 벨트 칸(Inventory.beltSlots, 소모품 등록/해제), 가방 격자(bagSize, 탭 → 상세 카드: 장착/사용/버리기(확인)), 세트 효과 현황(Inventory.activeSets), 골드. 장착 실패 reason 을 한국어로.
- status: 플레이어 스탯(기본+파생: Stats.derive), 스탯 포인트 분배(+1/+5 버튼, Level.allocate), XP 바, 피로, 스킬 선택(active.single: 기본/빠른/즉시 중 해금된 것, active.aoe: 2명/3명/바닥), 설정 토글(autoHeal/autoDodge/autoFollow), "저장" "처음부터(확인창 → State.reset → 새 게임 → 프롤로그)".
- quests: 탭 [진행 | 완료 | 일일]. 진행: 제목·giver·목표 진행도(progress/count)·보상, 완료 가능하면 "완료"(giver 가 NPC 면 "NPC 에게 가서 완료" 안내만). 힌트 섹션: Quests.hintsFor 또는 questDef.hint.
- title(modal, full): 로고 "모두의 힐러", "이어하기"(State.load → Scenes.go('town')), "새 게임"(확인 → State.reset/newGame → UI.story(프롤로그) → Scenes.go('town')), 버전·짧은 조작 설명.
- result(modal): params { floor, outcome: 'cleared'|'wipe'|'escape', time, steps, kills, chests, xp, gold, items:[inst], levelUps } 표시, "마을로" 버튼 → Scenes.go('town').`,

  partySprites: `${header('파티원 직업 스프라이트 담당')}

## 할 일: ${H}/js/sprites.js 에 직업 kind 6종 추가 — warrior(판금 갑옷·검·방패), mage(로브·모자·지팡이), hunter(가죽·활·화살통), rogue(두건·단검 2자루), spellblade(사슬 갑옷·검), monk(무투복·띠·너클). \`Sprites.get('warrior')\` 등이 player 와 같은 프레임 규격(32×40, anchor 발)으로 4방향×4프레임을 돌려주게. 기존 buildCharacter 의 팔레트·오버레이(모자/투구/무기) 방식을 확장하되 기존 kind(player, villagerA~E, child, knight, priest, smith, merchant)는 픽셀 하나도 바뀌지 않아야 한다(렌더 전후 PNG 비교).
- 성별/머리색은 kind 당 고정(파티원 개인차는 없음). 무기는 지팡이처럼 오버레이로.
- 렌더: \`node ${SP}/harness/render_sprites.mjs ${H}/js ${SP}/out/party_sprites.png\` — 하네스 kinds 목록에 6종이 없으면 하네스를 복사해 수정한 뒤 확인(하네스 원본은 수정 금지). 2x 미리보기에서 직업이 구분되는지 확인, 최소 4회 다듬기.`,
}


phase('Art')
const artDone = (await parallel([
  () => agent(AP.monCave + '\n\n주의: js/sprites_monsters_cave.js 초안이 이미 있다. 읽고 이어서 완성하라(누락된 id 등록, 렌더 확인).', { label: 'monsters_cave', phase: 'Art', schema: OUT }),
  () => agent(AP.tilesForest, { label: 'tiles_forest', phase: 'Art', schema: OUT }),
  () => agent(AP.tilesCave, { label: 'tiles_cave', phase: 'Art', schema: OUT }),
  () => agent(AP.fx, { label: 'fx', phase: 'Art', schema: OUT }),
])).filter(Boolean)
log(`던전 그래픽 ${artDone.length}/4 완료`)

phase('Build')
const built = (await parallel([
  () => agent(P.town, { label: 'town_scene_boot', phase: 'Build', schema: OUT }),
  () => agent(P.dungeon, { label: 'dungeon_scene', phase: 'Build', schema: OUT }),
  () => agent(P.shopAuctionBank, { label: 'ui_shop_auction_bank', phase: 'Build', schema: OUT }),
  () => agent(P.smithyInnEngraverTemple, { label: 'ui_smithy_inn_engraver_temple', phase: 'Build', schema: OUT }),
  () => agent(P.adventurerGuildPartyTower, { label: 'ui_adventurer_guild_party_tower', phase: 'Build', schema: OUT }),
  () => agent(P.invStatusQuestsTitleResult, { label: 'ui_inventory_status_quests_title_result', phase: 'Build', schema: OUT }),
  () => agent(P.partySprites, { label: 'party_sprites', phase: 'Build', schema: OUT }),
])).filter(Boolean)
log(`구현 완료 ${built.length}/7`)
const open = built.flatMap(b => b.openIssues || []).concat(artDone.flatMap(a => a.openIssues || []))
phase('Integrate')
const integ = await agent(`${header('통합·E2E 담당')}

모든 씬/화면이 구현되었다. 전체를 실제 브라우저에서 처음부터 끝까지 돌아가게 만든다(어느 파일이든 수정 허용, 바꾼 이유 주석).
담당자들이 남긴 메모: ${open.length ? open.join(' / ') : '없음'}

1. ${H}/index.html 이 DESIGN §1 순서로 모든 실제 파일을 로드하는지 확인·수정(없는 파일 제거). css 링크. 로컬에서 \`python3 -m http.server\` 없이 file:// 로도 동작해야 한다.
2. ${H}/tools/e2e_app.mjs (Playwright, 390×844 @2x, hasTouch) 작성·통과: 새 게임 → 프롤로그 건너뛰기 → 마을 스크린샷 → NPC 대화(장로 엘다) → 메인 퀘스트 수락 → 모험가 사무소에서 4명 고용 → 상인에서 포션 구매 → 가방에서 벨트 등록·장비 장착 → 신전 스킬 강화 → 은행 입금 → 여관 식사 → 경매장 열기 → 대장간 조합 화면 → 길드 가입 → 성문 → 1층 입장(인트로 건너뛰기) → 5초 플레이 → window.__healer 로 가장 가까운 무리 옆으로 순간이동 → 전투 8초(heal 이벤트 ≥1, 데미지 숫자, 텔레그래프 스크린샷) → 상자 옆 순간이동 → 열림('chest_opened') → 보스 옆 순간이동 → 보스 HP 를 5% 로 치트 → 처치('boss_killed', summon 이 한 번은 발생했는지 로그) → 출구 → 결과 화면 → 마을 → 퀘스트 완료 → 저장 → 새로고침 → 이어하기 → 같은 상태. 각 단계 스크린샷을 ${SP}/out/e2e/ 에 저장하고 PAGEERROR/콘솔 오류 0.
3. 2~10층 입장이 모두 되는지(각 2초) 확인. 6층에서 힐러를 노리는 광역기가 나오는지 로그.
4. 발견한 버그는 전부 고친다. 성능: 1층 전투 중 Scenes.fps() ≥ 50(헤드리스 기준) 아니면 프로파일 후 최적화.
5. healer/README.md 의 "현재 구현 상태"·"코드 구조"·실행 방법 갱신(완성품 기준).
반환: files, screenshots(e2e 스크린샷 전부), ok, summary(E2E 단계별 결과 표), openIssues.`, { label: 'integrate_e2e_app', phase: 'Integrate', schema: OUT })
let shots = (integ && integ.screenshots) || []

return { art: artDone.map(a => a.ok), built: built.map(b => ({ ok: b.ok, files: b.files })), integration: integ ? integ.summary : null, screenshots: shots }
