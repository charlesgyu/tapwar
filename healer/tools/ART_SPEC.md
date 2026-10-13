# 모두의 힐러 — 고급 도트 그래픽 규격 (ART_SPEC)

목표: 레퍼런스 수준의 "고급 도트" 느낌. 모든 그래픽은 **코드로 생성**(이미지 파일 없음). 레퍼런스 이미지는 `ref/` 폴더에 있다.

- `ref/ref2_*`: 캐릭터 레퍼런스(숲을 사랑하는 소녀 드루이드). 약 24×34px 도트, 머리가 전체 높이의 ~45%, 큰 눈(하이라이트 포함), 머리카락 3톤 명암, 나뭇가지 화관, 갈색 망토, 초록 튜닉, 벨트, 부츠, 보석 달린 나무 지팡이. 외곽선은 어두운 갈색(검정 아님).
- `ref/ref1_*`: 마을 레퍼런스. 따뜻한 크림색 포석, 반목조(목재 골조) 크림 벽, 빨강/회색/파랑 지붕(기와 줄, 지붕창, 굴뚝), 처마 그림자, 아치문, 창문 덧문·화분, 둥근 나무(3톤), 가로등, 우물, 통/상자, 줄무늬 차양 좌판, 만국기, 울타리 잔디, 좌상단 광원.

## 전역 규칙
- **TILE = 32px** (기존 16에서 2배). 월드 24×64 타일 = 768×2048px.
- 화면 배율(zoom)은 정수. 기준: `zoom = max(2, round(canvas.width / 384))` → 폰에서 가로 약 12타일이 보임. 즉 **1 월드픽셀 = 폰 CSS 1px** 정도. 1px 디테일도 보이지만 실루엣이 2배 축소에서도 읽혀야 한다.
- 캔버스에 그릴 때 `imageSmoothingEnabled=false`, 정수 좌표만 사용(안티앨리어싱 금지). `Pixel.circle/ellipse/rect/outline`처럼 fillRect 기반 도형만 사용하고 `arc()` 등 벡터 API는 쓰지 않는다.
- 광원: 좌상단. 하이라이트는 좌/상, 그늘은 우/하. 바닥 그림자는 물체 아래 타원 또는 우하단으로 2~3px 어긋난 반투명.
- 외곽선: 어두운 **따뜻한 갈색**(`#3b2a2a` 계열). 안쪽 구분선은 그보다 밝은 색(재질색의 어두운 톤).
- 재질마다 최소 3톤(기본/밝음/어둠). 큰 면은 미세한 변화(점·줄눈·기와)로 밋밋함을 피한다.
- **pixel.js 는 수정하지 않는다.** 필요한 헬퍼(그라데이션, 디더링, 도트 선 등)는 자기 파일(sprites.js 또는 town.js) 안에 정의한다(여러 후보를 병합하기 위함).
- 코드 주석/문자열은 한국어, 식별자는 영어.

## 캐릭터 규격 (healer/js/sprites.js)
전역 `Sprites` 객체 API 유지:
```js
Sprites.get(kind) -> { down:[c0,c1,c2,c3], up:[...], right:[...], left:[...], anchor:{x,y}, w, h }
Sprites.buildCharacter(palette, opts) ; Sprites.NPC_PALETTES ; Sprites.PLAYER_PAL
```
- kind 목록(모두 동작해야 함): `player, villagerA, villagerB, villagerC, villagerD, villagerE, child, knight, priest, smith, merchant`
- 프레임: 0 = 서있기, 1 = 걷기 A, 2 = 서있기(또는 중간), 3 = 걷기 B. main.js 는 `frame = floor(t) % 4` 로 재생하고 멈추면 0번을 쓴다.
- 프레임 캔버스 권장 32×40 (몸 ~22×34). `anchor` = 발 바닥 중앙. 모든 kind 가 같은 프레임 크기/anchor 를 쓰면 좋다.
- `left` 는 `right` 를 좌우 반전해도 된다(지팡이 위치가 어색하지 않게).
- 플레이어: 레퍼런스 2 충실 — 연두 머리(3톤), 나뭇가지+잎 화관, 큰 눈(홍채 색 + 흰 하이라이트 1px), 갈색 망토(어깨), 초록 튜닉+벨트, 부츠, 보석(하늘색) 지팡이.
- NPC 는 같은 도트맵에 팔레트만 바꿔 만든다(머리색/옷색/망토색). 기사(knight)는 투구, 신관(priest)은 흰 로브+금 장식, 대장장이(smith)는 앞치마, 상인(merchant)은 앞치마/두건, 아이(child)는 더 작게(옵션 `small:true` 로 키 줄이기 허용).
- 걷기: 팔·다리·망토가 함께 움직이고 몸이 1px 위아래로 흔들리면 좋다. 4프레임이 자연스럽게 이어져야 함.
- 도트맵은 같은 폭의 문자열 배열. `Pixel.fromRows` 가 폭이 다르면 예외를 던진다. **반드시 렌더해서 눈으로 확인**할 것(아래 하네스).

## 마을 규격 (healer/js/town.js)
전역 `Town` API 유지(main.js 가 사용):
```
Town.TILE, COLS, ROWS, W, H, BUILDINGS, PROPS, build(), canStand(px,py), isSolidTile(i,j),
findPath(sx,sy,tx,ty), lineClear(x0,y0,x1,y1), doorPoint(b), buildingAtTile(i,j), nearestWalkable(i,j)
build() -> { ground: canvas(W×H), overlay: canvas(W×H), objects: [{kind:'building'|'prop', ref, canvas, x, y, sortY, door?, rect?}] }
```
- 레이아웃 배열(`BUILDINGS/WALLS/PROPS/GRASS/PLAZA/MARKET/BUNTING`)은 **타일 단위**라 TILE 을 32로 바꿔도 그대로 쓸 수 있다. 건물 key/name 은 유지(탑 입구·신전·길드·모험가 사무소·각인사·대장간·은행·여관·경매장·잡화상·민가 3채). 위치는 약간 조정 가능.
- 충돌: `canStand` 의 발 상자는 TILE=32 기준 폭 14, 높이 8 정도. 소품 발자국(`PROP_FOOT`)도 그림에 맞게.
- 건물(3/4 탑다운): 경사 지붕(용마루, 기와 줄, 처마가 벽보다 넓고 처마 아래 그림자 띠), 지붕창/굴뚝, 반목조 앞벽(보 2px, 밝은 벽), 창문(틀·유리 하이라이트·덧문·화분), 아치문(계단 1~2단), 간판 판자, 깊이감을 주는 **옆벽 띠**(우측, 어두운 톤 4~8px) 또는 벽 하단 그림자, 바닥 그림자. 각 건물이 색/형태로 구분되어야 함(대장간 굴뚝+연기, 은행 석조, 신전 흰 대리석+기둥+금 지붕+종탑, 길드/경매장 깃발, 여관 간판+통, 탑 입구 성문: 돌탑 2개+원뿔 지붕+아치+보라 포털+횃불+현수막).
- 소품: 나무(둥근 3톤 수관+하이라이트 잎, 줄기, 그림자), 가로등(빛 번짐), 통, 상자, 우물(돌+지붕+도르래+양동이), 좌판(줄무늬 차양, 상품), 표지판, 벤치/화분 추가 가능.
- 바닥: 포석(돌마다 색 변화, 1px 틈, 마모), 광장 큰 포석+방사 무늬, 시장 흙바닥, 잔디(풀 뭉치·꽃), 울타리, 돌담(성벽), 산+하늘(상단 3타일).
- overlay: 만국기(처짐 곡선, 색 교대). 구름 그림자는 main.js 가 그린다.
- 렌더 비용: build() 는 1회. 매 프레임은 drawImage 만.

## main.js 통합 시 바꿀 것(통합 담당자용)
`zoom` 공식(위), 이동 속도 2배(플레이어 120, NPC 50~90), NPC 터치 반경 24, 말풍선 y 오프셋 = 스프라이트 높이+6, 발 그림자 타원 rx≈8 ry≈3, 문 앞 거리 40, 터치 표시 크기 2배, 구름 반지름 2배, `doorPoint` y 오프셋 +16, 상단 HUD 는 그대로.

## 검증 하네스 (`harness/`)
```bash
# 캐릭터 시트 렌더 (dir = pixel.js, sprites.js 가 있는 폴더)
node harness/render_sprites.mjs <healer/js 폴더> <out.png>
# 마을 렌더: <prefix>_gate.png, _plaza.png, _market.png, _bottom.png, _map.png 생성
node harness/render_town.mjs <healer/js 폴더> <outPrefix>
# 실제 앱 스크린샷(index.html 기준, 플레이어 이동 포함): <prefix>_app_*.png
node harness/shoot_app.mjs <healer 폴더> <outPrefix>
```
PAGEERROR 가 출력되면 도트맵 폭 불일치 등 오류다. 렌더 결과 PNG 는 반드시 Read 도구로 열어 눈으로 확인하고, 레퍼런스와 나란히 비교하며 최소 4회 이상 고친다.
