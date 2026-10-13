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
    State.newGame(name || '리프');
    started = true;
    State.save();
    if (!skipIntro() && typeof Story !== 'undefined' && Story.prologue) await UI.story(Story.prologue, '프롤로그');
    Scenes.go('town');
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
