export const meta = {
  name: 'healer-art-upgrade',
  description: '모두의 힐러 도트 그래픽 고급화: 후보 생성 → 심사 → 통합 → 비평/수정',
  phases: [
    { title: 'Generate', detail: '캐릭터/마을 후보를 각각 다른 방향으로 제작 (worktree)' },
    { title: 'Judge', detail: '심사위원이 렌더 결과를 레퍼런스와 비교해 채점' },
    { title: 'Integrate', detail: '우승 후보를 본 저장소에 통합하고 main.js 조정' },
    { title: 'Critique', detail: '관점별 비평가가 최종 스크린샷을 검토' },
    { title: 'Fix', detail: '지적 사항 수정 후 재검증' },
  ],
}

const SP = '/home/user/tapwar/healer/tools'
const REPO = '/home/user/tapwar'
const SPEC = `${SP}/ART_SPEC.md`
const REFS_SPRITES = `${SP}/ref/ref2_single_front_x6.png, ${SP}/ref/ref2_single_side_x6.png, ${SP}/ref/ref2_single_back_x6.png, ${SP}/ref/ref2_row1_idle_walk.png, ${SP}/ref/ref2_row2_run.png`
const REFS_TOWN = `${SP}/ref/ref1_town_full.png, ${SP}/ref/ref1_house_grey_roof.png, ${SP}/ref/ref1_houses_left.png, ${SP}/ref/ref1_street_chars.png, ${SP}/ref/ref1_market_bottom.png, ${SP}/ref/ref1_top_town.png`

const CAND = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    candidateDir: { type: 'string', description: '최종 파일과 PNG 를 복사해 둔 폴더(절대경로)' },
    files: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' }, description: '심사용 PNG 절대경로' },
    rounds: { type: 'number' },
    notes: { type: 'string' },
    ok: { type: 'boolean' },
  },
  required: ['label', 'candidateDir', 'files', 'screenshots', 'ok'],
}
const JUDGE = {
  type: 'object',
  properties: {
    scores: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, score: { type: 'number' }, strengths: { type: 'string' }, weaknesses: { type: 'string' } }, required: ['label', 'score'] } },
    winner: { type: 'string' },
    improvements: { type: 'array', items: { type: 'string' }, description: '우승작에 적용할 구체적 개선 지시(다른 후보의 장점 이식 포함)' },
  },
  required: ['scores', 'winner', 'improvements'],
}
const INTEG = {
  type: 'object',
  properties: {
    screenshots: { type: 'array', items: { type: 'string' } },
    changedFiles: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    knownIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['screenshots', 'changedFiles', 'summary'],
}
const CRIT = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'number', description: '3=심각(반드시 수정) 2=중요 1=사소' }, where: { type: 'string' }, description: { type: 'string' }, suggestion: { type: 'string' } }, required: ['severity', 'where', 'description', 'suggestion'] } },
    overall: { type: 'string' },
  },
  required: ['issues'],
}
const FIX = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'skipped', 'screenshots'],
}

const SPRITE_ANGLES = [
  { key: 'A', angle: '레퍼런스 2(드루이드 소녀)에 최대한 충실. 프레임 32×40, 몸 약 22×34, 머리가 전체 높이의 ~45%. 눈은 2×3px 홍채(파랑/초록)+흰 하이라이트 1px, 속눈썹 느낌의 윗선. 머리카락 3톤+가닥 선, 나뭇가지 화관(갈색 가지+잎 3~4개), 갈색 망토(어깨를 덮음), 초록 튜닉+벨트+버클, 갈색 부츠, 나무 지팡이+하늘색 보석. 외곽선은 #3b2a2a 계열 따뜻한 갈색.' },
  { key: 'B', angle: '16비트 JRPG(크로노 트리거·성검전설 3 풍) 스타일. 프레임 32×40, 몸 약 20×32. 선명한 실루엣, 강한 명암 대비, 선택적 외곽선(밝은 쪽은 외곽선을 재질 어두운 톤으로), 머리카락 뭉치(클러스터) 표현, 뺨 홍조 1px, 망토가 걸을 때 흔들림. 레퍼런스 2의 색과 아이템(화관·망토·튜닉·지팡이)은 그대로 유지.' },
]
const TOWN_ANGLES = [
  { key: 'A', angle: '레퍼런스 1(일러스트 마을)에 최대한 충실. 따뜻한 크림 포석(돌마다 미세한 색 변화, 1px 틈), 반목조 크림 벽, 기와 줄이 보이는 경사 지붕과 처마 밑 그림자 띠, 아치문과 계단, 덧문·화분 창문, 둥근 3톤 수관 나무, 가로등 빛 번짐, 줄무늬 차양 좌판. 색감은 부드럽고 채도가 적당한 파스텔.' },
  { key: 'B', angle: '선명한 클래식 RPG 타일셋 느낌(스타듀 밸리·RPG Maker 고급 타일). 강한 외곽선과 또렷한 3톤 명암, 건물은 옆벽 띠(우측 6~8px 어두운 톤)와 지붕 2면(용마루 기준 앞면/뒷면)으로 입체감, 바닥은 포석·흙길·잔디 경계에 테두리 타일, 소품은 두껍고 귀엽게. 레퍼런스 1의 건물 배치/색 계열(빨강·회색·파랑 지붕, 크림 벽)은 유지.' },
]

function genPrompt(kind, a) {
  const isSprites = kind === 'sprites'
  const target = isSprites ? 'healer/js/sprites.js' : 'healer/js/town.js'
  const harness = isSprites
    ? `node ${SP}/harness/render_sprites.mjs "$(pwd)/healer/js" <out.png>`
    : `node ${SP}/harness/render_town.mjs "$(pwd)/healer/js" <outPrefix>`
  const refs = isSprites ? REFS_SPRITES : REFS_TOWN
  const candDir = `${SP}/out/candidates/${kind}-${a.key}`
  const extra = isSprites
    ? `- 모든 kind(player, villagerA~E, child, knight, priest, smith, merchant)가 동작해야 하며 서로 구분되어야 한다(머리 모양/모자/투구/앞치마 등 작은 변형 포함 가능).
- 4방향 × 4프레임(0 서기, 1 걷기A, 2 서기/중간, 3 걷기B). 걷기 프레임은 다리·팔·망토가 움직이고 몸이 1px 흔들린다.
- 시트 PNG 하단의 "게임 배율(2x) 미리보기"가 실제 폰에서 보이는 크기다. 이 크기에서도 눈·화관·지팡이가 읽혀야 한다.`
    : `- TILE 을 32 로 바꾸고 모든 픽셀 치수(창문, 문, 기와 줄, 울타리, 포석 셀 등)를 새 해상도에 맞게 다시 설계한다. 레이아웃 배열(건물/소품/잔디/광장/시장/만국기)은 타일 단위라 그대로 두되 필요하면 소품을 더 추가해 생동감을 준다(벤치, 화분, 빨랫줄, 나무상자 더미, 꽃밭 등).
- 캐릭터는 폭 ~22px, 키 ~34px 라고 가정하라(하네스가 놓는 샘플 캐릭터는 옛 18×22 크기라 작게 보인다. 무시해도 됨). 문은 최소 36px 높이, 1층 벽 높이는 캐릭터 키보다 커야 한다.
- A* / canStand / lineClear / nearestWalkable 등 로직은 유지하되 발 상자 크기(폭 14, 높이 8)와 PROP_FOOT 만 조정한다. 충돌 격자 PNG(<prefix>_collision.png)로 건물·소품 발자국이 그림과 맞는지 확인한다.
- build() 가 300ms 이내로 끝나야 한다(하네스가 build 시간을 출력함).`
  return `당신은 픽셀 아트 아티스트 겸 프론트엔드 개발자다. 모바일 세로 RPG "모두의 힐러"의 ${isSprites ? '캐릭터 스프라이트' : '마을 그래픽'}을 코드로 생성하는 고급 도트 버전으로 다시 만든다.

## 당신의 스타일 방향 (후보 ${a.key})
${a.angle}

## 먼저 읽을 것
1. 규격 문서: ${SPEC} (API 계약·치수·스타일 규칙. 반드시 지킬 것)
2. 레퍼런스 이미지(Read 도구로 열어 눈으로 볼 것): ${refs}
3. 현재 코드: healer/js/pixel.js (수정 금지, 유틸 참고), healer/js/${isSprites ? 'sprites.js' : 'town.js'} (교체 대상), healer/js/main.js (API 사용처 참고)

## 작업
- 작업 폴더는 지금 있는 git worktree 다(pwd 로 확인). ${target} 을 완전히 새로 작성한다. pixel.js 는 수정하지 말고 필요한 헬퍼는 ${target} 안에 둔다.
${extra}
- 렌더 → Read 로 PNG 열어 확인 → 레퍼런스와 비교 → 수정, 을 **최소 5회** 반복한다. 매 회 무엇이 레퍼런스와 다른지(비율, 명암 톤 수, 외곽선 색, 디테일 밀도) 구체적으로 적고 고쳐라. PAGEERROR 가 나오면 반드시 고친다.
  렌더 명령: ${harness}
- 완성되면 \`${candDir}/\` 폴더를 만들어 최종 ${target.split('/').pop()} 과 최종 렌더 PNG 들을 복사한다(판정자가 이 폴더만 본다).
- git commit 은 하지 않는다.

## 반환
label="${kind}-${a.key}", candidateDir, files(복사한 파일 절대경로), screenshots(최종 PNG 절대경로, 심사위원이 볼 것), rounds(반복 횟수), notes(스타일 요약과 알려진 한계), ok(렌더 오류 없이 완성했으면 true).`
}

function judgePrompt(kind, cands, i) {
  const isSprites = kind === 'sprites'
  const lens = ['레퍼런스 유사도와 아트 디렉션(색·명암·디테일 밀도)', '폰 화면 가독성과 귀여움(2x 배율에서 실루엣·표정·구분 가능성)', '일관성과 완성도(프레임/건물 간 통일성, 애니메이션 자연스러움, 깨진 픽셀·클리핑 없음)'][i % 3]
  const list = cands.map(c => `- ${c.label}: 폴더 ${c.candidateDir}\n  PNG: ${c.screenshots.join(', ')}\n  제작자 메모: ${c.notes || ''}`).join('\n')
  return `당신은 픽셀 아트 심사위원이다. 모바일 RPG "모두의 힐러"의 ${isSprites ? '캐릭터 스프라이트' : '마을 그래픽'} 후보들을 평가한다. 당신의 주된 관점: **${lens}** (다른 요소도 보되 이 관점에 가중치를 둔다).

레퍼런스(Read 로 열어볼 것): ${isSprites ? REFS_SPRITES : REFS_TOWN}
규격: ${SPEC}

후보:
${list}

각 후보의 PNG 를 모두 Read 로 열어 레퍼런스와 비교하라. ${isSprites ? '시트 하단의 2x 미리보기(실제 폰 크기)도 반드시 보라.' : '_gate/_plaza/_market/_bottom 뷰(실제 폰 크기)와 _map 전체도, _collision 의 충돌 격자가 그림과 맞는지도 보라.'}
1~10점으로 채점(소수점 허용)하고, 우승작을 고르고, 우승작에 적용할 **구체적인 개선 지시 5~10개**를 써라(픽셀 단위로: 예 "지붕 기와 줄 간격을 6px→4px", "눈 하이라이트를 우상단 1px 추가", "처마 아래 2px 어두운 띠 추가"). 다른 후보의 더 나은 요소가 있으면 "X 후보의 ○○를 이식" 형태로 포함하라.`
}

function integPrompt(sp, tw) {
  return `당신은 "모두의 힐러"(${REPO}/healer, 브랜치 claude/upbeat-euler-gdw42r 가 이미 체크아웃되어 있음) 의 그래픽 고급화 통합 담당자다. git commit 은 하지 마라(사용자가 검토 후 커밋).

## 읽을 것
- 규격: ${SPEC} (특히 "main.js 통합 시 바꿀 것")
- 현재 코드: ${REPO}/healer/js/{pixel.js,sprites.js,town.js,main.js}, ${REPO}/healer/index.html

## 우승 후보
- 캐릭터: ${sp.winner ? `${sp.winner.label} → ${sp.winner.candidateDir} (파일: ${sp.winner.files.join(', ')})` : '없음(현재 sprites.js 유지)'}
  심사위원 개선 지시:\n${(sp.improvements || []).map(s => '  * ' + s).join('\n')}
- 마을: ${tw.winner ? `${tw.winner.label} → ${tw.winner.candidateDir} (파일: ${tw.winner.files.join(', ')})` : '없음(현재 town.js 유지)'}
  심사위원 개선 지시:\n${(tw.improvements || []).map(s => '  * ' + s).join('\n')}
${sp.cands ? `- 참고용 다른 캐릭터 후보: ${sp.cands.map(c => c.candidateDir).join(', ')}` : ''}
${tw.cands ? `- 참고용 다른 마을 후보: ${tw.cands.map(c => c.candidateDir).join(', ')}` : ''}

## 작업
1. 우승 sprites.js / town.js 를 ${REPO}/healer/js/ 에 복사한다(pixel.js 는 그대로).
2. main.js 를 TILE=32 와 새 스프라이트 크기에 맞게 조정한다: zoom 공식 \`Math.max(2, Math.round(canvas.width / 384))\`, 이동 속도(플레이어 120, NPC 는 기존 값×2), NPC 터치 반경 24, 말풍선 y 오프셋(스프라이트 높이+6), 발 그림자 타원(rx 8, ry 3 — 스프라이트 폭에 맞춰), 문 앞 안내 거리 40, 터치 표시 크기 2배, 구름 반지름 2배, 라벨 y 오프셋(건물 벽 높이에 맞게), 탭 좌표→타일 변환이 Town.TILE 을 쓰는지 확인. NPC 초기 위치는 타일×TILE 이므로 그대로 둔다. 걷기 애니메이션 속도(animT 계수)도 새 보폭에 맞춰 자연스럽게.
3. 심사위원 개선 지시를 가능한 한 모두 반영한다(픽셀 단위 수정). 다른 후보의 더 나은 요소도 이식한다.
4. 검증: \`node ${SP}/harness/shoot_app.mjs ${REPO}/healer ${SP}/out/r0\` (폴더 미리 생성) 로 앱 스크린샷을 찍고, \`node ${SP}/harness/render_sprites.mjs ${REPO}/healer/js ${SP}/out/r0_sprites.png\`, \`node ${SP}/harness/render_town.mjs ${REPO}/healer/js ${SP}/out/r0_town\` 도 실행한다. 모든 PNG 를 Read 로 열어 확인: 캐릭터가 건물·문 크기와 어울리는지, 깊이 정렬(캐릭터가 건물 앞/뒤)이 맞는지, 라벨·말풍선·안내 UI 위치, 충돌(문 앞에 설 수 있는지, 소품에 끼지 않는지), 걷기 애니메이션 프레임. 문제가 있으면 고치고 다시 찍는다(최소 3회 반복).
5. PAGEERROR/콘솔 오류 0 이어야 한다. healer/README.md 의 "코드 구조"와 타일 크기 설명(16→32)을 갱신한다.

## 반환
screenshots(최종 PNG 절대경로들), changedFiles, summary(무엇을 어떻게 바꿨는지), knownIssues(남은 문제).`
}

function critPrompt(shots, lens, round) {
  return `당신은 "모두의 힐러" 그래픽 비평가다. 관점: **${lens}**.
레퍼런스: ${REFS_SPRITES}, ${REFS_TOWN}
규격: ${SPEC}
최종 결과 PNG(모두 Read 로 열 것): ${shots.join(', ')}
코드 위치: ${REPO}/healer (js/sprites.js, js/town.js, js/main.js) — 필요하면 코드도 읽어 원인을 짚어라.

레퍼런스 수준의 "고급 도트"에 도달했는지 냉정하게 평가하고, 구체적이고 실행 가능한 문제 목록을 만들어라(어디서, 무엇이, 어떻게 고칠지, 픽셀/색상 값까지). severity 3 은 눈에 확 띄는 결함(깨짐, 잘림, 정렬 오류, 비율 붕괴, 레퍼런스와 동떨어진 색), 2 는 품질을 분명히 올릴 수 있는 것, 1 은 취향. 라운드 ${round}.`
}

function fixPrompt(issues, round) {
  const list = issues.map((it, i) => `${i + 1}. [S${it.severity}] ${it.where}: ${it.description}\n   → ${it.suggestion}`).join('\n')
  return `당신은 "모두의 힐러"(${REPO}/healer, 브랜치 claude/upbeat-euler-gdw42r) 그래픽 수정 담당자다. git commit 은 하지 마라.
규격: ${SPEC}. 레퍼런스: ${REFS_SPRITES}, ${REFS_TOWN}

비평가들이 지적한 문제(severity 높은 순). 3 과 2 는 모두 고치고, 1 은 쉬우면 고친다:
${list}

수정 후 반드시 재검증한다: \`node ${SP}/harness/shoot_app.mjs ${REPO}/healer ${SP}/out/r${round}\`, \`node ${SP}/harness/render_sprites.mjs ${REPO}/healer/js ${SP}/out/r${round}_sprites.png\`, \`node ${SP}/harness/render_town.mjs ${REPO}/healer/js ${SP}/out/r${round}_town\`. PNG 를 Read 로 열어 고쳐졌는지 눈으로 확인하고, 새로 생긴 문제가 없는지 본다. PAGEERROR 0.
반환: fixed(고친 항목 번호와 요약), skipped(못 고친 항목과 이유), screenshots(최종 PNG 절대경로).`
}

async function track(kind) {
  const angles = kind === 'sprites' ? SPRITE_ANGLES : TOWN_ANGLES
  const cands = (await parallel(angles.map(a => () =>
    agent(genPrompt(kind, a), { label: `gen:${kind}-${a.key}`, phase: 'Generate', schema: CAND, isolation: 'worktree' })
  ))).filter(Boolean).filter(c => c.ok && c.screenshots && c.screenshots.length)
  log(`${kind}: 후보 ${cands.length}개 완성 (${cands.map(c => c.label).join(', ')})`)
  if (!cands.length) return { kind, winner: null, improvements: [], cands: [] }
  const judges = (await parallel([0, 1, 2].map(i => () =>
    agent(judgePrompt(kind, cands, i), { label: `judge:${kind}-${i + 1}`, phase: 'Judge', schema: JUDGE })
  ))).filter(Boolean)
  const totals = {}
  for (const j of judges) for (const s of j.scores) totals[s.label] = (totals[s.label] || 0) + s.score
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const winner = cands.find(c => c.label === (ranked[0] ? ranked[0][0] : '')) || cands[0]
  const improvements = judges.flatMap(j => j.improvements || [])
  log(`${kind}: 우승 ${winner.label} (합계 ${JSON.stringify(totals)})`)
  return { kind, winner, totals, improvements, cands, judges }
}

phase('Generate')
const [sp, tw] = await parallel([() => track('sprites'), () => track('town')])

phase('Integrate')
const integ = await agent(integPrompt(sp || { improvements: [] }, tw || { improvements: [] }), { label: 'integrate', phase: 'Integrate', schema: INTEG })
let shots = (integ && integ.screenshots) || []
log(`통합 완료: ${integ ? integ.summary.slice(0, 200) : '실패'}`)

const LENSES = ['아트 디렉션(레퍼런스 유사도, 색·명암·디테일)', '폰 화면 가독성·UI 어울림(2x 배율, 라벨/말풍선/안내)', '기술 결함(클리핑, 깊이 정렬, 충돌 vs 그림, 애니메이션 끊김, 타일 이음새)']
const fixLog = []
for (let round = 1; round <= 2; round++) {
  phase('Critique')
  const crits = (await parallel(LENSES.map((l, i) => () =>
    agent(critPrompt(shots, l, round), { label: `critic:${i + 1}-r${round}`, phase: 'Critique', schema: CRIT })
  ))).filter(Boolean)
  const issues = crits.flatMap(c => c.issues || []).filter(it => it.severity >= 2).sort((a, b) => b.severity - a.severity)
  log(`비평 라운드 ${round}: severity≥2 문제 ${issues.length}개`)
  if (!issues.length) break
  phase('Fix')
  const fx = await agent(fixPrompt(issues.slice(0, 18), round), { label: `fix:r${round}`, phase: 'Fix', schema: FIX })
  if (fx) { fixLog.push(fx); if (fx.screenshots && fx.screenshots.length) shots = fx.screenshots }
  if (issues.length > 18) log(`라운드 ${round}: 상위 18개만 수정, ${issues.length - 18}개는 보류`)
}

return {
  spriteWinner: sp && sp.winner ? sp.winner.label : null, spriteTotals: sp ? sp.totals : null,
  townWinner: tw && tw.winner ? tw.winner.label : null, townTotals: tw ? tw.totals : null,
  integration: integ, fixes: fixLog, finalScreenshots: shots,
}