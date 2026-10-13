# 인수인계 문서 (HANDOFF) — 모두의 힐러

> 이 문서는 **다른 세션/모델(예: Opus)이 이어받아 작업해도 막힘이 없도록** 현재 상태, 규칙, 남은 작업, 검증 방법을 정리한 것이다. 저장소만 있으면 모든 작업을 재개할 수 있다(임시 폴더 의존 없음).

## 1. 지금 상태 (한 줄 요약)
핵심 시스템(전투·힐러 AI·던전 생성·시설·퀘스트·저장)은 **완성·테스트 통과(149개)**, 마을·캐릭터 도트 그래픽은 **고급 버전으로 교체 완료**, 숲 몬스터 20종 완료. **남은 것은 던전 그래픽 일부와 "화면(UI/씬)" 전체, 그리고 통합**이다. 현재 실행 가능한 index.html 은 "마을 돌아다니기" 단계(1차 버전)이며, 핵심 시스템은 아직 화면에 연결되지 않았다.

## 2. 반드시 먼저 읽을 문서
1. `DESIGN.md` — 모듈 경계·데이터 스키마·API 계약(모든 구현의 기준). §10 그래픽 계약, §11 UI/씬 계약 포함.
2. `README.md` — 사용자의 원래 기획 요약(스킬·저주·아이템·시설·직업·스탯).
3. `tools/ART_SPEC.md` — 도트 그래픽 스타일 규칙(32px 타일, 광원, 외곽선 색, 3톤).
4. 이 문서의 §5 "남은 작업"과 §6 "작업 프롬프트".

## 3. 사용자가 정한 규칙(변경 금지)
- 세로 모바일, 귀여운 도트 그래픽, **힐러(사제) 플레이**. 파티원은 직업별 AI.
- 힐 로직: **가장 HP% 낮은 아군에게 단일힐**, 광역힐도 같은 기준(HP 낮은 순 N명), **저주 해제는 저주 걸린 사람 중 HP 낮은 순**. 마나 관리, 스킬 꼬임 없음.
- 10층까지 완성품: 층당 몬스터 ≥300, 중간보스 3 + 층 보스 1(**부하 소환 패턴 필수**), 만 걸음 이상 걸을 수 있는 맵, 숨겨진 상자(아이템·퀘스트), 1~5층 숲(쉬움), 6~10층 동굴(점점 어려움).
- 시설(경매장·여관·대장간·은행·각인사·신전·상인·모험가 사무소·길드) **전부 실제 이용 가능**. NPC 가 돌아다니며 대화하고 대화에 퀘스트 힌트.
- 사용자가 직접 플레이해 보고 피드백할 예정 → **비평/리뷰 루프는 넣지 말고 제작·통합만** 한다.
- 커밋 메시지는 한국어, 브랜치 `claude/upbeat-euler-gdw42r`, 작업 후 push. 모델명은 커밋/코드에 넣지 않는다.

## 4. 저장소 구조와 검증 명령
```
healer/
  index.html, css/ui.css              # 현재는 1차(마을 탐험) 페이지. 통합 단계에서 전체 배선 필요
  js/pixel.js, sprites.js, town.js    # 그래픽(완료). sprites.js 에 파티원 직업 kind 6종 추가 필요
  js/sprites_monsters*.js             # 몬스터 레지스트리 + 숲(완료)/동굴(초안)
  js/tiles_dungeon.js                 # 던전 타일 레지스트리(바이옴 구현 tiles_forest.js / tiles_cave.js 는 미완)
  js/fx.js                            # 미완 (이펙트)
  js/core/**                          # 핵심 시스템 전부 완료 (DESIGN.md 계약 그대로)
  js/ui/ui.js                         # 공통 UI 프레임워크(완료). ui_*.js 화면들은 미완
  js/scenes/scene.js                  # 씬 관리자(완료). town_scene.js / dungeon_scene.js 미완
  tests/*.test.js                     # node tools/run_tests.js
  tools/run_tests.js, load.js         # 노드 테스트 러너/로더
  tools/sim.js                        # 층 시뮬레이션: node tools/sim.js <층> [초] [파티레벨]
  tools/map_preview.js                # 던전 맵 문자 미리보기: node tools/map_preview.js <층>
  tools/ui_preview.mjs                # UI 화면 스크린샷: node tools/ui_preview.mjs <screen> <out.png>
  tools/harness/*.mjs                 # 그래픽 렌더 검증(Playwright): render_sprites/monsters/tiles/fx/town, shoot_app
  tools/ref/*.png                     # 레퍼런스 이미지와 현재 스타일 기준 시트
  tools/workflows/*.js                # 멀티 에이전트 워크플로우 스크립트(프롬프트 원문 포함)
  tools/out/                          # 렌더 결과물 출력 폴더
```
검증 명령 (저장소 루트 `/home/user/tapwar` 기준):
```bash
node healer/tools/run_tests.js                      # 149 passed 여야 함
node healer/tools/sim.js 1 1500                     # 1층 시뮬 (clear 까지)
node healer/tools/harness/render_sprites.mjs healer/js healer/tools/out/sprites.png
node healer/tools/harness/render_monsters.mjs healer/js healer/tools/out/monsters.png
node healer/tools/harness/render_tiles.mjs healer/js 1 healer/tools/out/tiles_f1
node healer/tools/harness/render_fx.mjs healer/js healer/tools/out/fx.png
node healer/tools/harness/shoot_app.mjs healer healer/tools/out/app      # 실제 앱 스크린샷
node healer/tools/ui_preview.mjs shop healer/tools/out/ui_shop.png
```
Playwright 는 `/opt/node-tools/node_modules/playwright/index.mjs` 에서 import 한다(하네스에 이미 적혀 있음). PNG 는 Read 도구로 열어 눈으로 확인한다.

## 5. 남은 작업 (순서대로)
### A. 던전 그래픽
| 파일 | 상태 | 내용 |
|---|---|---|
| js/sprites_monsters_cave.js | 초안 있음 | 동굴 16종(bat, cave_spider, golem_stone, golem_crystal, naga, naga_priest, orc_warlord, troll_shaman, wraith, skeleton_knight, drake + boss_golem_lord, boss_naga_priestess, boss_orc_warchief, boss_wraith_king, boss_dragon) 전부 `MonsterSprites.register` 되게 마무리 |
| js/tiles_forest.js | 없음 | `DungeonTiles.registerBiome('forest', {chunk, minimapColor, chestSprite, exitSprite})` |
| js/tiles_cave.js | 없음 | `DungeonTiles.registerBiome('cave', {chunk, minimapColor})` |
| js/fx.js | 없음 | `FX.spawn/update/draw/drawOne/types/clear` (DESIGN §10) |
| js/sprites.js | 추가 필요 | 직업 kind 6종(warrior, mage, hunter, rogue, spellblade, monk), 기존 kind 픽셀 불변 |

### B. 화면 (DESIGN §11)
- `js/scenes/town_scene.js` + `js/main.js`(부트) + `index.html` 배선 + 하단 버튼 바
- `js/scenes/dungeon_scene.js` + `css/hud.css`
- `js/ui/ui_shop.js, ui_auction.js, ui_bank.js`
- `js/ui/ui_smithy.js, ui_inn.js, ui_engraver.js, ui_temple.js`
- `js/ui/ui_adventurer.js, ui_guild.js, ui_party.js, ui_tower.js`
- `js/ui/ui_inventory.js, ui_status.js, ui_quests.js, ui_title.js, ui_result.js`

### C. 통합
- index.html 이 DESIGN §1 순서로 전부 로드, `tools/e2e_app.mjs`(Playwright) 로 새 게임→마을→시설→고용→1층 전투→상자→보스→결과→저장/불러오기 자동 확인, 버그 수정, README 갱신.

### D. 마무리
- 커밋·푸시, `healer/index.html` 을 Artifact 로 재게시(기존 URL: https://claude.ai/artifact/Ac9eXjaAk3MuSYttPb4UTu — `files` 에 js/css 전부 포함해야 함).

## 6. 작업 프롬프트(에이전트에게 그대로 줄 수 있음)
각 작업의 상세 요구는 `tools/workflows/build_all.js` 안의 `AP.*`(그래픽)와 `P.*`(화면) 프롬프트에 그대로 적혀 있다. 경로 상수는 `H = /home/user/tapwar/healer`, `SP = /home/user/tapwar/healer/tools` 로 바뀌어 있어 저장소만으로 동작한다. 워크플로우 도구가 없으면 그 프롬프트를 일반 서브에이전트(Agent 도구)나 직접 작업에 사용하면 된다. 동시에 2개 정도씩 진행하고, **파일 단위로 담당을 나누면 충돌이 없다**(각 프롬프트가 만들 파일을 명시).

## 7. 알려진 주의점
- 컨테이너 CPU 4개라 동시 에이전트는 2개. 사용량 한도에 걸리면 완료된 파일은 디스크에 남으므로 `git add -A healer && git commit` 후 이어서 하면 된다.
- `tools/load.js` 의 ORDER 에 새 core 파일을 추가해야 노드 테스트에서 로드된다(현재 core 는 전부 포함).
- `MonsterSprites.get` 은 미등록 id 에 보라색 대체 스프라이트를 돌려주므로 그래픽이 없어도 게임은 돈다. `DungeonTiles.chunk` 도 바이옴 미등록 시 단색 대체.
- 마을은 24×34 타일로 압축(좌·우 4층 시설 + 가운데 성문→광장→시장→잡화상 대로). 시장 상인은 좌판 옆 통로(11.35, 22.6)에 서 있어 가려지지 않는다.
- 저장 키 `localStorage['healer.save']`, 버전 1.
- 모험가 사무소는 **구인구직 게시판**(core/recruit.js `Recruit`, ui_adventurer.js `RecruitUI`, DESIGN §6.1)이 주 파티 구성 수단이다. 직접 고용 UI는 없앴다(코어 `Facilities.adventurer.hire` 는 테스트 호환용으로 남김). 게시판 파티는 목표 층 한 판 뒤 `Floor.leave → Recruit.finishRun` 에서 해산된다. 테스트: `tests/recruit.test.js`.
