export const meta = {
  name: 'healer-art-dungeon',
  description: '모두의 힐러 던전 그래픽: 몬스터 36종 스프라이트, 숲/동굴 타일셋, 전투 이펙트 제작 + 비평·수정',
  phases: [
    { title: 'Make', detail: '몬스터(숲/동굴)·타일(숲/동굴)·이펙트를 병렬 제작' },
    { title: 'Critique', detail: '비평가가 렌더 결과를 검토' },
    { title: 'Fix', detail: '지적 사항 수정' },
  ],
}
const SP = '/home/user/tapwar/healer/tools'
const H = '/home/user/tapwar/healer'
const STYLE_REFS = `${SP}/out/r2_sprites.png (현재 플레이어·NPC 시트: 외곽선 색·3톤 명암·눈 스타일을 맞출 것), ${SP}/out/r2_town_plaza.png (마을 타일 톤), ${SP}/ref/ref2_single_front_x6.png (레퍼런스 캐릭터)`
const OUT = { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, screenshots: { type: 'array', items: { type: 'string' } }, ok: { type: 'boolean' }, summary: { type: 'string' }, openIssues: { type: 'array', items: { type: 'string' } } }, required: ['files', 'screenshots', 'ok', 'summary'] }
const CRIT = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'number' }, where: { type: 'string' }, description: { type: 'string' }, suggestion: { type: 'string' } }, required: ['severity', 'where', 'description', 'suggestion'] } }, overall: { type: 'string' } }, required: ['issues'] }

function header(role) {
  return `당신은 모바일 세로 RPG "모두의 힐러"의 ${role}(픽셀 아티스트 겸 개발자). 저장소 ${H} (브랜치 claude/upbeat-euler-gdw42r, 메인 저장소에서 직접 작업, git commit 금지). 모든 그래픽은 코드로 생성한다(이미지 파일 없음).

## 먼저 읽을 것
- ${SP}/ART_SPEC.md (스타일 규칙: 좌상단 광원, 따뜻한 갈색 외곽선 #3b2a2a, 재질당 3톤, 정수 좌표·fillRect 만, Pixel 유틸)
- ${H}/DESIGN.md 의 §10 (그래픽 모듈 계약) — 당신 모듈의 API 를 그대로 지킬 것
- ${H}/js/pixel.js (수정 금지), ${H}/js/sprites.js (도트맵→캔버스 조립 방식 참고), 레지스트리 ${H}/js/sprites_monsters.js, ${H}/js/tiles_dungeon.js (수정 금지, register 로 등록)
- 스타일 레퍼런스(Read 로 볼 것): ${STYLE_REFS}
- 렌더 결과 PNG 는 반드시 Read 로 열어 눈으로 확인하고 최소 4회 고친다. PAGEERROR 는 반드시 고친다. 당신에게 배정된 파일만 만든다.`
}

const P = {
  monForest: `${header('숲 몬스터 담당')}

## 만들 파일: ${H}/js/sprites_monsters_forest.js
\`MonsterSprites.register(id, builder)\` 로 다음 20종을 등록한다(id 는 데이터와 정확히 일치): goblin, goblin_archer, goblin_shaman, wolf, spider, sheepie(양 괴물), zombie, skeleton, sprite(숲 정령), werewolf, siren, orc, orc_berserker, troll(48px), treant(48px, 나무 정령) + 보스 boss_goblin_king(고블린 왕 그락, 왕관·큰 몽둥이), boss_spider_queen(거대 거미 여왕), boss_werewolf_chief(늑대인간 족장 루가), boss_siren_queen(세이렌 여왕 네레아), boss_troll_chief(트롤 족장 모르그). 보스는 80×80.
- 스타일: 귀엽지만 몬스터답게(큰 눈·둥근 실루엣, WoW 호드/판타지 느낌의 색·장비). 플레이어 시트와 같은 외곽선·명암 규칙. 일반 32×32(몸 24~28), size2 48×48. 4방향×4프레임(좌=우 반전 가능, 뒷면은 등·꼬리 등 특징) + attack 2프레임(앞으로 기울기/무기 휘두름).
- 언데드(zombie, skeleton)는 한눈에 언데드로 보이게(뼈/썩은 피부). 세이렌은 하반신 지느러미, 늑대·거미는 4족.
- 도트맵은 가족별 템플릿(예: 고블린 3종은 같은 몸에 무기·장식만 다르게)으로 효율적으로 만들되, 서로 구분되어야 한다.
- 렌더: \`node ${SP}/harness/render_monsters.mjs ${H}/js ${SP}/out/monsters_forest.png\` (동굴 파일이 아직 없으면 숲만 나온다). 2x 미리보기 줄에서 실루엣이 읽히는지 확인.
반환: files, screenshots(최종 PNG), ok, summary, openIssues.`,

  monCave: `${header('동굴 몬스터 담당')}

## 만들 파일: ${H}/js/sprites_monsters_cave.js
\`MonsterSprites.register(id, builder)\` 로 다음 16종을 등록한다(id 는 데이터와 정확히 일치): bat, cave_spider, golem_stone(48px), golem_crystal(48px), naga, naga_priest, orc_warlord(48px), troll_shaman(48px), wraith(반투명 느낌의 망령, 언데드), skeleton_knight(48px, 언데드), drake(48px, 새끼 드래곤) + 보스 boss_golem_lord(돌 골렘 군주), boss_naga_priestess(나가 여사제 샤일라), boss_orc_warchief(오크 대족장 가르돈), boss_wraith_king(망령 왕 아셀: 옛 대사제, 찢어진 사제 로브+왕관, 언데드), boss_dragon(잿빛 드래곤 바르가, 96×96 허용, 날개 펼침). 보스는 80×80.
- 스타일: 귀엽지만 몬스터답게(큰 눈·둥근 실루엣, WoW 호드/판타지 느낌). 플레이어 시트와 같은 외곽선·명암 규칙. 일반 32×32(몸 24~28), size2 48×48. 4방향×4프레임(좌=우 반전 가능) + attack 2프레임.
- 골렘은 돌/수정 질감(수정은 하늘색 결정이 박힘), 나가는 뱀 하반신, 망령은 떠 있는 느낌(발 없음·바닥 그림자만), 드래곤은 날개 펄럭임을 걷기 프레임으로.
- 렌더: \`node ${SP}/harness/render_monsters.mjs ${H}/js ${SP}/out/monsters_cave.png\`. 2x 미리보기 줄에서 실루엣이 읽히는지 확인.
반환: files, screenshots(최종 PNG), ok, summary, openIssues.`,

  tilesForest: `${header('숲 던전 타일셋 담당')}

## 만들 파일: ${H}/js/tiles_forest.js  (+ 상자/출구 스프라이트)
\`DungeonTiles.registerBiome('forest', { chunk(ctx, map, ci, cj, {TILE, CHUNK}), minimapColor(tile), chestSprite(open, type), exitSprite() })\`.
- 타일 0 = 빽빽한 숲(나무 수관이 이어진 느낌: 이웃이 바닥인 가장자리는 나무 줄기·그늘이 보이는 오토타일, 안쪽은 진한 수관 패턴), 1 = 잔디 바닥(풀 결·색 변화, 흙길 느낌을 군데군데), 2 = 물(호수: 물결 하이라이트, 가장자리 모래/돌), 3 = 바닥 장식(꽃·버섯·작은 돌·낙엽, 결정적 난수로 종류 선택), 4 = 덤불(둥근 관목, 통행 불가·상자 가림).
- 오토타일: 벽(0)의 상하좌우/대각 이웃을 보고 가장자리·모서리를 그린다(위쪽 가장자리는 줄기+그림자 띠, 아래쪽은 수관 윗면). 결정적(RNG.hash(ci,cj) 시드) 변주.
- 상자 3종(normal 나무+쇠, hidden 보라 보석 박힌 상자, quest 금색 두루마리 상자) 열림/닫힘 28×24, 출구(빛나는 계단/포털) 48×56.
- 성능: 청크 1개(16×16타일, 512×512px) ≤ 8ms. 큰 면은 미리 만든 타일 캔버스를 drawImage 로 찍는다(타일 변주 4~6개 캐시).
- 렌더: \`node ${SP}/harness/render_tiles.mjs ${H}/js 1 ${SP}/out/tiles_f1\` 와 3층(\`... 3 ${SP}/out/tiles_f3\`). _spawn/_mid/_boss(폰 크기)·_overview 를 보고 "걸어 다니고 싶은 숲"인지, 벽/바닥/물 구분이 또렷한지, 이음새가 없는지 확인.
반환: files, screenshots, ok, summary, openIssues.`,

  tilesCave: `${header('동굴 던전 타일셋 담당')}

## 만들 파일: ${H}/js/tiles_cave.js
\`DungeonTiles.registerBiome('cave', { chunk(ctx, map, ci, cj, {TILE, CHUNK}), minimapColor(tile) })\`.
- 타일 0 = 암벽(이웃이 바닥인 쪽에 절벽 면·바위 하이라이트가 보이는 오토타일, 안쪽은 어두운 바위 질감), 1 = 동굴 바닥(회갈색 돌바닥, 자갈·균열·색 변화), 2 = 지하수(검푸른 물, 반사 하이라이트), 3 = 장식(수정 군락(하늘색·보라 발광), 버섯(발광 버섯), 뼈, 종유석 그림자), 4 = 바위 더미(통행 불가·상자 가림).
- 분위기: 어둡지만 폰에서 읽히게(바닥은 충분히 밝은 중간 톤, 벽은 어둡게). 수정이 빛을 내는 느낌(주변 바닥에 은은한 색).
- 오토타일: 벽 상하좌우/대각 이웃 기반 가장자리·모서리. 결정적 변주.
- 성능: 청크 ≤ 8ms, 타일 캔버스 캐시.
- 렌더: \`node ${SP}/harness/render_tiles.mjs ${H}/js 6 ${SP}/out/tiles_f6\` 와 10층(\`... 10 ${SP}/out/tiles_f10\`). 숲 담당자의 상자/출구가 없으면 기본 대체 그림이 나온다(무시). _spawn/_mid/_boss·_overview 확인.
반환: files, screenshots, ok, summary, openIssues.`,

  fx: `${header('전투 이펙트 담당')}

## 만들 파일: ${H}/js/fx.js — 전역 \`FX\` (DESIGN §10 API 그대로)
- \`FX.spawn(type, x, y, opts) -> fx\`(월드 좌표, fx = { type, x, y, t, duration, ...opts }), \`FX.update(dt)\`(만료 제거), \`FX.draw(ctx, cam)\`(모든 fx; cam = {x, y} 는 참고용이고 ctx 에 이미 월드 변환이 적용되어 있다고 가정), \`FX.drawOne(ctx, fx, cam)\`, \`FX.types()\`, \`FX.clear()\`.
- 타입: heal_sparkle(대상 위로 떠오르는 초록/흰 십자·반짝임 0.8s), aoe_ring(opts.r, opts.fill 0~1: 붉은 원 테두리 2px + 안쪽을 fill 비율만큼 부채꼴/농도로 채움, 완료 직전 깜빡임), puddle_circle(opts.r, fill: 빨간 마법진(룬 고리) + 지속 중 맥동), ground_heal(opts.r: 초록 성역 마법진 + 떠오르는 빛 입자), hit(피격 흰 번쩍 + 작은 파편 0.25s), projectile(opts.from/to/color, 진행률 t/duration 로 위치), levelup(금빛 기둥+별 1.2s), cast_glow(발 밑 둥근 빛 맥동, 지속 중), summon_puff(보라 연기 0.6s), revive(흰 빛 기둥 1s), damage_number(opts.text, opts.color: 떠오르며 사라지는 숫자, 폰트 bold 10px·외곽선), curse_icon(머리 위 보라 해골 점멸).
- 픽셀 스타일 유지(정수 좌표, fillRect/Pixel.circle, 1~2px 입자). 텍스트(damage_number)만 ctx.fillText 허용.
- 렌더: \`node ${SP}/harness/render_fx.mjs ${H}/js ${SP}/out/fx.png\` (타입별 진행률 0/.25/.5/.75/1 스트립). 결과를 보고 각 이펙트가 2x 배율에서 읽히는지 확인.
- 테스트: 노드에서 \`FX.spawn/update/clear\` 가 캔버스 없이 동작하는지(\`node -e\`) 확인.
반환: files, screenshots, ok, summary, openIssues.`,
}

phase('Make')
const [mf, mc, tf, tc, fx] = await parallel([
  () => agent(P.monForest, { label: 'monsters_forest', phase: 'Make', schema: OUT }),
  () => agent(P.monCave, { label: 'monsters_cave', phase: 'Make', schema: OUT }),
  () => agent(P.tilesForest, { label: 'tiles_forest', phase: 'Make', schema: OUT }),
  () => agent(P.tilesCave, { label: 'tiles_cave', phase: 'Make', schema: OUT }),
  () => agent(P.fx, { label: 'fx', phase: 'Make', schema: OUT }),
])
const made = [mf, mc, tf, tc, fx].filter(Boolean)
log(`제작 완료: ${made.map(m => m.summary.slice(0, 60)).join(' | ')}`)
const shots = made.flatMap(m => m.screenshots || [])

phase('Critique')
const crits = (await parallel([
  () => agent(`당신은 픽셀 아트 비평가다. "모두의 힐러" 몬스터 스프라이트를 검토한다. 스타일 기준: ${STYLE_REFS}, 규격 ${SP}/ART_SPEC.md, ${H}/DESIGN.md §10.
먼저 \`node ${SP}/harness/render_monsters.mjs ${H}/js ${SP}/out/monsters_all.png\` 를 실행해 전체 시트를 만들고 Read 로 본다(PAGEERROR 가 있으면 그것이 severity 3). 36종 전부 등록되었는지(MonsterSprites.list()), 크기 규격(일반 32, size2 48, 보스 80~96), 4방향·4프레임·attack 존재, 2x 미리보기에서 실루엣·종류 구분, 플레이어 시트와 외곽선/명암 일관성, 언데드 표현, 보스의 위압감을 평가한다. severity 3=깨짐/누락/규격 위반, 2=품질 분명히 개선, 1=취향. 각 항목에 id 와 픽셀 단위 수정안.`, { label: 'critic_monsters', phase: 'Critique', schema: CRIT }),
  () => agent(`당신은 픽셀 아트 비평가다. "모두의 힐러" 던전 타일셋(숲/동굴)과 이펙트를 검토한다. 스타일 기준: ${STYLE_REFS}, 규격 ${SP}/ART_SPEC.md, ${H}/DESIGN.md §10.
먼저 \`node ${SP}/harness/render_tiles.mjs ${H}/js 1 ${SP}/out/c_f1\`, \`... 4 ${SP}/out/c_f4\`, \`... 6 ${SP}/out/c_f6\`, \`... 10 ${SP}/out/c_f10\`, \`node ${SP}/harness/render_fx.mjs ${H}/js ${SP}/out/c_fx.png\` 를 실행하고 PNG 를 Read 로 본다(PAGEERROR 는 severity 3). 평가: 벽/바닥/물/덤불/장식이 폰 크기에서 또렷이 구분되는가, 오토타일 이음새·모서리 오류, 청크 경계선, 몬스터·상자·출구가 바닥 위에서 잘 보이는가(대비), 숲/동굴 분위기 차이, 청크 렌더 시간(하네스 출력)이 8ms/청크 이하인가, 이펙트 각 타입이 진행률에 따라 읽히는가. severity 3=깨짐/규격 위반/성능 초과, 2=품질 분명히 개선, 1=취향. 파일·함수·픽셀 단위 수정안.`, { label: 'critic_tiles_fx', phase: 'Critique', schema: CRIT }),
])).filter(Boolean)
const issues = crits.flatMap(c => c.issues || []).filter(i => i.severity >= 2).sort((a, b) => b.severity - a.severity)
log(`비평 이슈(severity≥2): ${issues.length}`)

phase('Fix')
let fix = null
if (issues.length) {
  fix = await agent(`${header('수정 담당')}

비평가가 지적한 문제를 모두 고친다(js/sprites_monsters_forest.js, sprites_monsters_cave.js, tiles_forest.js, tiles_cave.js, fx.js 수정 허용).
${issues.map((it, i) => `${i + 1}. [S${it.severity}] ${it.where}: ${it.description}\n   → ${it.suggestion}`).join('\n')}
수정 후 \`node ${SP}/harness/render_monsters.mjs ${H}/js ${SP}/out/monsters_fixed.png\`, \`node ${SP}/harness/render_tiles.mjs ${H}/js 1 ${SP}/out/fixed_f1\`, \`... 6 ${SP}/out/fixed_f6\`, \`node ${SP}/harness/render_fx.mjs ${H}/js ${SP}/out/fx_fixed.png\` 로 재검증하고 PNG 를 눈으로 확인한다. PAGEERROR 0.
반환: files, screenshots(최종 PNG), ok, summary(항목별 처리), openIssues(보류 항목과 이유).`, { label: 'fix', phase: 'Fix', schema: OUT })
}
return { made: made.map(m => ({ ok: m.ok, files: m.files })), issues: issues.length, fix: fix ? fix.summary : null, screenshots: fix ? fix.screenshots : shots }