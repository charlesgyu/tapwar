// 모두의 힐러 — 부트: UI·씬 초기화, 새 게임/이어하기 분기, 자동 저장, 마을 복귀 배선, 디버그 접근자.
// 게임 로직은 각 씬(town_scene.js, dungeon_scene.js)과 화면(ui_*.js)에 있고, 여기서는 순서와 연결만 맡는다.
const Boot = (() => {
  const AUTOSAVE_MS = 60 * 1000;
  let saveTimer = null;
  let booted = false;

  // 저장은 게임이 시작된 뒤에만 — 타이틀 화면에서 State.get() 이 빈 새 게임을 만들어 기존 저장을 덮어쓰는 일을 막는다
  let started = false;
  function save() { if (started) State.save(); }

  // 새 게임: 상태 생성 → 프롤로그 → 마을. 타이틀 화면의 "새 게임"도 이걸 써도 된다.
  async function startNewGame(name) {
    State.reset();
    const G = State.newGame(name || '리프');
    giveStarterGear(G);
    started = true;
    State.save();
    if (!skipIntro() && typeof Story !== 'undefined' && Story.prologue) await UI.story(Story.prologue, '프롤로그');
    Scenes.go('town');
  }
  // 기본 장비(DESIGN §2 "기본 장비"): 나무 완드 + 천 로브(일반). State.newGame 은 코어 테스트들이 빈 장비를 전제로 계산하므로
  // 실제 게임의 새 게임 경로(여기)에서만 입힌다. 빈손이면 파티 화면이 "장착한 장비가 없어요" 를 띄우고 1층 첫 전투가 너무 빡빡했다.
  function giveStarterGear(G) {
    if (typeof Items === 'undefined' || !Items.make) return;
    for (const [slot, id] of [['main', 'wand_wood'], ['body', 'cloth_body_1']]) {
      if (G.player.equipment[slot]) continue;
      try { const inst = Items.make(id, 1); if (inst) { inst.grade = 'common'; G.player.equipment[slot] = inst; } } catch (e) { /* 데이터에 없는 id 면 빈손 유지 */ }
    }
    try { const d = Stats.derive(G.player, G); G.player.hp = d.maxHp; G.player.mp = d.maxMp; } catch (e) { /* 최대치 계산 실패 시 newGame 값 유지 */ }
  }
  // 이어하기: 저장 불러오기 → 마을. 불러오기에 실패하면 새 게임으로.
  function continueGame() {
    if (!State.load()) return startNewGame();
    started = true;
    Scenes.go('town');
    return Promise.resolve();
  }
  // E2E·미리보기에서 프롤로그 연출을 건너뛰기 위한 스위치(?nointro 또는 window.__healerSkipIntro)
  function skipIntro() {
    try { return !!window.__healerSkipIntro || /[?&]nointro\b/.test(location.search); } catch (e) { return false; }
  }

  function wire() {
    // 퀘스트 엔진은 이벤트로 진행되므로 어떤 화면보다 먼저 구독(멱등)
    if (typeof Quests !== 'undefined' && Quests.init) Quests.init();
    saveTimer = setInterval(save, AUTOSAVE_MS);
    // 마을에서 보낸 시간도 플레이 시간(G.playTime)으로 센다. 음식 버프 until·상태 화면 "플레이 N분"이 이 시계를 쓰고
    // 던전 시간은 Floor.leave 가 더하며 전투 시계도 playTime 에서 시작하므로(combat.js) 두 시계가 끊김 없이 이어진다.
    // 탭이 숨겨졌을 때는 세지 않는다(백그라운드에 둔 사이 버프가 다 끝나 버리지 않게).
    setInterval(() => {
      if (!started || document.hidden || Scenes.name() !== 'town') return;
      const G = State.get(); G.playTime = (G.playTime || 0) + 1;
    }, 1000);
    // 경매장 판매 정산은 경매장 화면이 열려 있을 때만 돌아서(ui_auction.js) 닫혀 있으면 팔린 소식을 모른다.
    // 1분마다 여기서도 굴려 마을·던전 어디서든 토스트로 알린다(경매장 화면이 열려 있으면 그쪽 타이머에 맡긴다).
    setInterval(() => {
      if (!started || typeof Facilities === 'undefined' || !Facilities.auction) return;
      const cur = UI.current && UI.current();
      if (cur && cur.name === 'auction') return;
      let r = null; try { r = Facilities.auction.tick(State.get()); } catch (e) { return; }
      if (!r || !r.ok || !r.sold.length) return;
      const total = r.sold.reduce((a, e) => a + (e.price || 0), 0);
      UI.toast(`경매장: 물건 ${r.sold.length}개가 팔렸어요! +${total.toLocaleString('ko-KR')} 골드`, 2600);
      State.save();
    }, 60 * 1000);
    Events.on('scene_change', save);
    Events.on('ui_close', save);
    // 타이틀 화면(ui_title.js)이 State.load/newGame 후 마을로 보내면 그때부터 자동 저장 대상
    Events.on('scene_change', () => { started = true; });
    // 귀환 두루마리 등: 지금 던전이면 마을로(던전 씬이 스스로 정리하고 보내는 경우와 겹쳐도 같은 씬이면 무시)
    Events.on('return_town', () => { if (Scenes.name() !== 'town') Scenes.go('town', { from: 'dungeon' }); });
    // 앱을 닫거나 백그라운드로 보낼 때 마지막 상태 보존(모바일은 unload 가 안 올 때가 많아 visibilitychange 도 듣는다)
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  }

  function boot() {
    if (booted) return;
    booted = true;
    UI.init();
    Scenes.init('view');
    wire();
    if (State.hasSave()) {
      // 타이틀 화면이 아직 없으면(통합 전) 바로 이어하기
      if (UI.screens && UI.screens.has('title')) UI.open('title');
      else continueGame();
    } else startNewGame();
  }

  // 마을 씬에서 플레이어를 걸려 보내기(E2E 하네스가 window.__healer.goTo 를 쓴다)
  function goTo(x, y, onArrive) { return TownScene.goTo(x, y, onArrive); }

  window.__healer = {
    G: () => State.get(),
    Scenes, UI, State, Town, Events,
    Floor: typeof Floor !== 'undefined' ? Floor : null,
    TownScene,
    get player() { return TownScene.player; },
    get npcs() { return TownScene.npcs; },
    goTo,
    say: (...a) => TownScene.say(...a),
    talkTo: (npcId) => { const n = TownScene.npcById(npcId); if (n) TownScene.talkTo(n); return !!n; },
    toast: (msg, ms) => UI.toast(msg, ms),
    newGame: startNewGame,
    continueGame,
    save: () => State.save(),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { boot, startNewGame, continueGame, save };
})();
