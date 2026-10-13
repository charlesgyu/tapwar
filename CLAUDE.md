# TAPWAR 인수인계 (새 세션은 이 파일부터 읽기)

## 대화 규칙
- 사용자는 한국인. **항상 한국어**로, 쉬운 말로 설명. 기술 용어는 꼭 필요할 때만.
- 사용자는 비개발자에 가까움. 화면 캡처를 보내면 "무엇을 어디에 입력할지"를 단계로 알려 줄 것.
- 토큰을 아낄 것. 큰 멀티에이전트 워크플로우·비평 루프는 사용자가 명시적으로 원할 때만. 보통은 직접 수정 → `node --check` → 스크린샷 1~2장 확인 → 배포.

## 프로젝트
- 바닐라 JS 캔버스 전략 게임. 파일: `game.js`(게임 전부, ~5500줄), `index.html`(CSS·DOM), `audio.js`(Web Audio 합성 음악·효과음), `assets/*.json`(지도), `assets/earth.png`(Earth 카드 지구본).
- iOS 앱(Capacitor 8): `ios/App`. 네이티브 플러그인 2개: `GameCenterPlugin.swift`(순위표), `StorePlugin.swift`(StoreKit 2 인앱 구매). `App.entitlements`(Game Center). 번들 ID `com.tapwar.game`.
- 게임 규칙·수치·시간은 `GAME_RULES.md`가 기준. 규칙을 바꾸면 거기도 같이 고친다.
- 웹은 서비스 안 함(앱만 출시). 웹용 아티팩트는 테스트 전용.

## 매번 하는 배포 순서 (사용자 요청: 바꿀 때마다 전부)
1. `node --check game.js`
2. `index.html`의 `game.js?v=20261012_items_vNN` / `audio.js?v=...` **버전 숫자 +1** (현재 v62). 휴대폰이 새 파일을 받게 하는 용도.
3. `GAME_RULES.md` 갱신(규칙이 바뀐 경우).
4. 커밋 → `git push -u origin claude/tapwar-review-c45ygv` → PR(base main) 생성 → **바로 머지**(사용자 지시: 매번 머지). PR 본문 끝에 Claude Code 꼬리말.
5. 아티팩트 갱신: `tools/make_artifact.sh <출력경로>`로 index.html에서 아티팩트용 html을 만들고, Artifact 도구로 **기존 URL** `https://claude.ai/artifact/B7TasT5a1TiX2ihVvpXGV7` 에 publish(`files`에 `game.js`, `audio.js`, 필요 시 `assets/earth.png`). 새 세션이면 먼저 `read`로 그 URL을 읽어야 publish가 허용됨.
6. 사용자에게 한국어로 바뀐 점·확인한 범위·확인 못 한 부분을 솔직히 보고.

## 테스트 방법
- 로컬 서버: `cd <repo> && python3 -m http.server 8765 &` (백그라운드 명령은 2시간 제한으로 죽으니 다시 띄울 것).
- Playwright 전역 설치됨: `NODE_PATH=$(npm root -g) node tools/smoke.js <tag> <w> <h> <dpr>` → `tools/out/<tag>_*.png` 7장(홈·맵카드·본진선택·카드·전투·아이템소개·승리). 폰 402×874×2, 아이패드 1032×1376×2.
- 튜토리얼 건너뛰기: `localStorage.tapwar_tutorial_seen='1'`. 게임 상태 조작용 전역: `currentState, GAME_STATE, selectModalMap(key), rawZones, pendingStartZone, confirmBaseSelection(), gameSpeed, nextItemAt, gameOver(bool), triggerCountryEvent(cc), fogUntil, openItemGuide(), openPurchase(id)`.
- 그래픽 확인은 스크린샷을 Read로 직접 봐야 함(코드만 보고 "됐다"고 하지 말 것).

## 현재 상태 (2026-10-13)
- App Store Connect: 앱 `TAPWAR-점령전` 생성, 빌드 1.0(1) 업로드됨, 스크린샷·설명·개인정보·연령등급(9+, 한국 전체)·순위표 10개·인앱구입 2개 등록, **심사 제출 완료**. 결과 대기 중.
- 유료 앱 계약: 사용자가 비즈니스 메뉴에서 처리 중(케이뱅크 계좌, 사업자등록번호 세금 양식 제출 시 "나중에 다시 시도" 오류가 났었음 → 재시도 안내함).
- 빌드 1.0(1)은 v53 쯤 코드. 그 뒤 바뀐 것(Earth 카드, 순위 나라별만, 결제 화면 문구 '모든 나라 열기', 그래픽 전면 개선 v59)은 **다음 빌드(Build 2)** 에 들어감. Mac에서: `git pull` → `npm run ios:sync` → Xcode Build 2 → Archive → 업로드.
- 소개/개인정보 사이트: 공개 저장소 `charlesgyu/tapwar-site`(GitHub Pages) → `https://charlesgyu.github.io/tapwar-site/` , `/privacy.html`, 지원 URL `/#support`. 아이콘 바꾸면 거기 `icon.png`도 갱신.
- 인앱 상품 ID: `com.tapwar.game.speed`(2배속), `com.tapwar.game.allcountries`(모든 나라 열기). 순위표 ID: `tapwar.leaderboard.{kr,jp,cn,us,fr,de,it,es,gb,wd}.totaltime`.
- 출시용 플래그: `DEV_TEST_SPEED/DEV_TEST_COUNTRIES/DEV_UNLOCK_ALL_MAPS = false`, `MAP_RANKINGS = false`. 로고 5번 탭 치트는 제거됨.

## 사용자가 정한 결정(되돌리지 말 것)
- 영토 색: 내 지역 파랑, 적 빨강, 내 완전점령 초록, 본진 노랑, 적 본진 와인색(한 번 바꿨다가 되돌림).
- 연결선 없음. 지역 중심 점 + 파문으로 표시. 지역 이름은 점 위에.
- 카드 5장(모든 맵). 컨셉: 나라 50초마다, 전세계 15초 후 1분마다. 필사즉생 4배.
- 속사·보급·버프·저주의 "다음 5공격"은 터진 지역에서만.
- 게임 중 상단 안내문은 전부 띄우지 않음(`statusQuiet`). 적 카드·경보뿐 아니라 "피가 가득"·"충전 중" 같은 짧은 문구도 (v60). 본진 선택 안내만 남김.
- 배속 버튼은 ×1/×2 두 개, ×2는 유료. 구매 전 나라는 '둘러보기'로 맵을 잠긴 모습으로 구경, 그 화면에서 '구매하기'.
- 홈 국가 카드 마지막은 'Earth'(지구본 그림), 들어가면 전세계 맵 카드 + 순위 카드.
- 총알 효과음 없음. 음악은 점령전 행진곡 풍.
- 미니맵·아이템 카드 칸은 테두리 상자 없이 지도 위에 바로 놓음. 아이템 카드 고르기 제목 옆 진행 점(•••••) 없음 (v61).
- 홈 하늘 별: `game.js` 끝 `homeSky()`가 `#sky-stars` 캔버스에 그림. 4~10초 주기로 천천히 은은하게 밝아졌다 어두워짐, 7~16초마다 별똥별 하나 (v62). 경박하게 빠른 반짝임은 금지.

## 그래픽 구조 (v59, 자세한 설계는 GAME_RULES.md '그래픽' 절)
- CSS 토큰은 `index.html` `:root`(남색 `--navy-*`, 돌색 `--line/--muted...`, 노랑 `--accent/--accent-ground`, 반지름 `--r-*`). 홈·스플래시는 남색 우주, 지도는 밝은 종이.
- game.js 주요 함수: `drawExactDistrictsMap`(격자→그림자→배경→지역→테두리→강→번쩍), `getZoneStyle`/`zoneFillStyle`(그라데이션 게이지, 안개는 CanvasPattern), `getMapShadow`(캐시 비트맵), `drawZoneBadges`(이름+흰 테두리), `drawFlyingOrbs`(꼬리·글로우 스프라이트), `pushParticle/updateParticles/drawParticles`, `addShake/shakeOffset`, `addScreenFlash`, `FX` 표 + `drawFx`, `drawHudClock`(화면 좌표 시계 알약), `showStatus/statusQuiet`, `drawMapThumb(canvas,key,status)`(홈 카드·결과 카드 미니 지도), `celebrateWin`/`gameOver`(지연 종료·연출·결과 카드·색종이).
