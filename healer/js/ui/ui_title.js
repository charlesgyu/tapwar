// 타이틀 화면 — 로고·탑 그림·저장 요약·이어하기/새 게임·짧은 조작 설명.
// 부트(main.js)가 저장이 있을 때 연다. 닫기(✕/ESC)로 빠져나가면 아무 씬도 없는 빈 화면이 되므로 헤더를 숨기고, 그래도 닫히면 다시 연다.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;
  // ---- 개인 화면 공통 도구(가방·상태·퀘스트·타이틀·결과) ----
  // 다섯 파일이 어떤 순서로 로드돼도 동작하도록 각 파일에 같은 코드를 두고, 먼저 로드된 쪽이 UI.__hk 에 한 번만 만든다.
  const K = UI.__hk || (UI.__hk = (() => {
    const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경(미리보기 등)은 무시 */ } };
    const grade = (g) => (typeof Items !== 'undefined' && Items.GRADES && Items.GRADES[g]) || { name: g || '일반', color: '#d9cdb5' };
    // 일반 등급 색(#f2f2f2)은 크림색 배경에서 안 보여 글자에는 진한 갈색을, 고급(연두)은 조금 어둡게 쓴다
    function ink(g) {
      if (!g || g === 'common') return '#4a3a30';
      const c = grade(g).color;
      if (g !== 'uncommon' || !/^#[0-9a-f]{6}$/i.test(c)) return c;
      const n = parseInt(c.slice(1), 16), f = (v) => Math.round(v * 0.68).toString(16).padStart(2, '0');
      return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
    }
    const edge = (g) => (!g || g === 'common' ? '#d9cdb5' : grade(g).color);
    const REASONS = {
      not_found: '물건을 찾을 수 없어요', not_equip: '장비가 아니라 착용할 수 없어요', wrong_armor: '사제는 천 옷만 입을 수 있어요',
      wrong_weapon: '사제는 지팡이와 책만 쓸 수 있어요', level: '레벨이 부족해요', bag_full: '가방이 가득 찼어요', empty: '비어 있는 칸이에요',
      bad_stat: '알 수 없는 능력치예요', bad_count: '잘못된 수치예요', not_enough_points: '스탯 포인트가 부족해요', no_player: '플레이어 정보가 없어요',
    };
    const reason = (r, extra) => (r && REASONS[r.reason]) ? REASONS[r.reason] + (extra || '') : '할 수 없어요';
    function injectStyle() {
      if (document.getElementById('ui-hk-style')) return;
      const s = document.createElement('style');
      s.id = 'ui-hk-style';
      s.textContent = `
.hk-root .btn { min-height:44px; }
.hk-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; margin-bottom:8px; background:#fff3d6; border:2px solid #e3c98a; border-radius:10px; }
.hk-top b { font-weight:900; font-size:16px; color:#7a5a1a; font-variant-numeric:tabular-nums; }
.hk-top small { font-size:12px; font-weight:800; color:#8a7a6a; }
.hk-hint { font-size:11px; color:#9a8a7a; margin:2px 2px 8px; line-height:1.45; }
.hk-panel { background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:8px 10px; margin-bottom:8px; }
.hk-badge { display:inline-block; font-size:10px; font-weight:800; padding:1px 6px; border-radius:8px; background:#e9dcc5; color:#6a5040; vertical-align:middle; margin-left:4px; white-space:nowrap; }
.hk-badge.ok { background:#dff0d4; color:#2f6b2f; } .hk-badge.warn { background:#fbe9e7; color:#b0403a; } .hk-badge.blue { background:#dde9fb; color:#2a5aa0; } .hk-badge.gold { background:#fff0c2; color:#8a6410; }
.hk-warn { font-size:12px; font-weight:800; color:#a03a34; background:#fde6e4; border:1px solid #e8a8a2; border-radius:8px; padding:6px 8px; margin:6px 0; line-height:1.4; }
.hk-root .item-card[data-grade="common"] { border-color:#d9cdb5 !important; }
.hk-root .item-card[data-grade="common"] .item-name { color:#3a3030 !important; }
.hk-root .item-card[data-grade="uncommon"] .item-name { filter:brightness(0.72) saturate(1.3); }
.hk-root .item-card .btn.small { min-height:44px; min-width:60px; font-size:13px; }
`;
      document.head.appendChild(s);
    }
    function card(instOrDef, opts) {
      const c = UI.itemCard(instOrDef, opts || {});
      const d = (typeof Items !== 'undefined' && instOrDef && instOrDef.id && Items.get(instOrDef.id)) || {};
      c.setAttribute('data-grade', (instOrDef && instOrDef.grade) || d.grade || 'common');
      return c;
    }
    const def = (inst) => (inst && typeof Items !== 'undefined' ? Items.get(inst.id) : null) || null;
    const time = (s) => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
    return { save, grade, ink, edge, REASONS, reason, injectStyle, card, def, time };
  })());
  const VERSION = 'v0.1 · 1부 잿빛 탑 1~10층';
  const HELP = [
    ['👆', '화면을 끌면 이동, 문·사람을 누르면 들어가기·대화'],
    ['💚', '자동 힐이 기본 — 위급할 땐 파티원을 눌러 직접 치유'],
    ['⭕', '붉은 원이 차오르면 피하기, 저주(보라)는 해제'],
  ];

  function injectStyle() {
    K.injectStyle();
    if (document.getElementById('ui-tt-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-tt-style';
    s.textContent = `
.ui-card.tt-card { background:#1d1a2e; border-color:#2a2238; box-shadow:0 4px 0 #120e1c, 0 12px 30px rgba(0,0,0,0.5); }
.ui-card.tt-card .ui-head { display:none; }
.ui-card.tt-card .ui-body { padding:0; display:flex; flex-direction:column; }
.tt-sky { position:relative; flex:1 1 auto; min-height:300px; overflow:hidden; }
.tt-sky canvas.bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 100%; image-rendering:pixelated; }
.tt-sky canvas.hero { position:absolute; left:50%; bottom:6px; transform:translateX(-50%); width:88px; height:110px; image-rendering:pixelated; animation:tt-bob 2.4s ease-in-out infinite; }
.tt-logo { position:absolute; left:0; right:0; top:9%; text-align:center; }
.tt-logo h1 { margin:0; font-size:44px; font-weight:900; letter-spacing:2px; color:#fff6dc; text-shadow:0 3px 0 #7a4a2a, 0 -2px 0 #7a4a2a, 3px 0 0 #7a4a2a, -3px 0 0 #7a4a2a, 0 6px 14px rgba(0,0,0,0.55); }
.tt-logo h1 span { color:#9cf09a; }
.tt-logo p { margin:6px 0 0; font-size:13px; font-weight:800; color:#f1dfb8; letter-spacing:1px; text-shadow:0 1px 3px rgba(0,0,0,0.7); }
.tt-panel { flex:none; background:#fbf6ea; border-top:3px solid #5a4030; border-radius:16px 16px 0 0; padding:14px 14px 10px; margin-top:-14px; position:relative; }
.tt-save { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; background:#fff3d6; border:2px solid #e3c98a; margin-bottom:10px; font-size:12.5px; color:#6a5040; font-weight:700; }
.tt-save b { display:block; font-size:14px; color:#4a3020; font-weight:900; }
.tt-save .ic { font-size:24px; }
.tt-btns { display:flex; flex-direction:column; gap:8px; }
.tt-btns .btn { width:100%; min-height:52px; font-size:17px; border-radius:12px; }
.tt-help { margin:12px 2px 4px; display:flex; flex-direction:column; gap:4px; }
.tt-help div { display:flex; gap:8px; font-size:12px; color:#6a5a4a; line-height:1.4; }
.tt-help div span:first-child { width:20px; text-align:center; flex:none; }
.tt-ver { text-align:center; font-size:10.5px; color:#a89a88; margin-top:6px; }
@keyframes tt-bob { 0%,100% { transform:translateX(-50%) translateY(0); } 50% { transform:translateX(-50%) translateY(-3px); } }
`;
    document.head.appendChild(s);
  }

  // 저장 요약: 불러오지 않고 원본 JSON 만 읽어 보여 준다(이어하기 전 상태를 건드리지 않게)
  function saveInfo() {
    let has = false;
    try { has = State.hasSave(); } catch (e) { has = false; }
    if (!has) return null;
    try {
      const g = JSON.parse(localStorage.getItem(State.SAVE_KEY));
      const p = g.player || {};
      const mins = Math.floor((g.playTime || 0) / 60);
      return { name: p.name || '리프', level: p.level || 1, chapter: (g.story && g.story.chapter) || 1, best: (g.tower && g.tower.highestCleared) || 0, party: (g.party || []).length, day: g.day || 1, mins };
    } catch (e) { return { name: '리프', unknown: true }; }
  }

  // 배경: 저녁 하늘 + 멀리 솟은 잿빛 탑 + 라일라 마을 지붕 실루엣(작은 캔버스를 키워 도트 느낌)
  function drawSky(c) {
    const W = 120, H = 150; c.width = W; c.height = H;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a2650'); sky.addColorStop(0.45, '#7a5a8a'); sky.addColorStop(0.75, '#e8956a'); sky.addColorStop(1, '#f3c27a');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    // 별: 고정 시드라 매번 같은 자리
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    x.fillStyle = '#fff6dc';
    for (let i = 0; i < 26; i++) { const sx = Math.floor(rnd() * W), sy = Math.floor(rnd() * H * 0.4); x.globalAlpha = 0.4 + rnd() * 0.6; x.fillRect(sx, sy, 1, 1); }
    x.globalAlpha = 1;
    // 달
    x.fillStyle = '#fff1c8'; x.beginPath(); x.arc(86, 50, 6, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#4a3a6a'; x.beginPath(); x.arc(89, 48, 5, 0, Math.PI * 2); x.fill();
    // 먼 산
    x.fillStyle = '#5a4a72';
    x.beginPath(); x.moveTo(0, 112); for (let i = 0; i <= W; i += 8) x.lineTo(i, 104 + Math.sin(i * 0.11) * 6 + Math.cos(i * 0.05) * 4); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    // 잿빛 탑: 위로 갈수록 좁아지는 층 + 창문 불빛
    const tx = 60;
    for (let i = 0; i < 7; i++) {
      const y = 114 - i * 10, w = 20 - i * 1.6;
      x.fillStyle = i % 2 ? '#4a4458' : '#55506a';
      x.fillRect(Math.round(tx - w / 2), y - 10, Math.round(w), 10);
      x.fillStyle = '#3a3448'; x.fillRect(Math.round(tx - w / 2) - 1, y - 1, Math.round(w) + 2, 1);
      if (i % 2 === 0) { x.fillStyle = '#ffd46a'; x.fillRect(tx - 1, y - 7, 2, 3); }
    }
    x.fillStyle = '#6a6080'; x.beginPath(); x.moveTo(tx - 5, 44); x.lineTo(tx, 32); x.lineTo(tx + 5, 44); x.fill();
    // 탑 꼭대기의 불길한 빛
    const glow = x.createRadialGradient(tx, 32, 0, tx, 32, 16); glow.addColorStop(0, 'rgba(200,120,255,0.75)'); glow.addColorStop(1, 'rgba(200,120,255,0)');
    x.fillStyle = glow; x.fillRect(tx - 16, 16, 32, 32);
    // 숲
    x.fillStyle = '#2f4a3a';
    for (let i = -4; i < W + 8; i += 7) { const h = 10 + ((i * 13) % 7); x.beginPath(); x.moveTo(i, 124); x.lineTo(i + 4, 124 - h); x.lineTo(i + 8, 124); x.fill(); }
    // 마을 지붕
    x.fillStyle = '#3a2a2a'; x.fillRect(0, 124, W, H - 124);
    const roofs = [[6, 14, '#a8503a'], [24, 12, '#6a7ab0'], [86, 14, '#b07a3a'], [104, 12, '#a8503a']];
    for (const [rx, rw, col] of roofs) {
      x.fillStyle = '#e8d8b8'; x.fillRect(rx + 1, 128, rw - 2, 10);
      x.fillStyle = col; x.beginPath(); x.moveTo(rx - 1, 129); x.lineTo(rx + rw / 2, 120); x.lineTo(rx + rw + 1, 129); x.fill();
      x.fillStyle = '#ffd46a'; x.fillRect(rx + 3, 131, 2, 2);
    }
    x.fillStyle = '#6a8a4a'; x.fillRect(0, 138, W, H - 138);
    x.fillStyle = '#7a9a5a'; for (let i = 0; i < W; i += 3) x.fillRect(i, 138, 1, 1);
  }
  function hero() {
    try {
      const sh = typeof Sprites !== 'undefined' ? Sprites.get('player') : null;
      const f = sh && sh.down ? sh.down[0] : null; if (!f) return null;
      const c = el('canvas', { class: 'hero' }); c.width = f.width; c.height = f.height;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(f, 0, 0);
      return c;
    } catch (e) { return null; }
  }

  function startTown() { if (typeof Scenes !== 'undefined' && Scenes.go) Scenes.go('town'); }
  function cont(api) {
    let ok = false;
    try { ok = State.load(); } catch (e) { ok = false; }
    if (!ok) { api.toast('저장을 불러오지 못했어요. 새 게임으로 시작해 주세요', 2600); return; }
    api.params._chosen = true;
    UI.close(true);
    startTown();
  }
  async function newGame(api, hasSave) {
    if (hasSave) {
      const ok = await api.confirm('새 게임을 시작할까요?\n저장된 모험(레벨·장비·퀘스트)이 지워져요.', { ok: '새 게임', cancel: '취소' });
      if (!ok) return;
    }
    api.params._chosen = true;
    UI.close(true);
    State.reset();
    // 부트의 startNewGame 은 자동 저장 플래그까지 맞추므로 있으면 그것을 쓴다(새 게임 → 프롤로그 → 마을)
    if (typeof Boot !== 'undefined' && Boot.startNewGame) { await Boot.startNewGame(); return; }
    State.newGame('리프');
    K.save();
    if (typeof Story !== 'undefined' && Story.prologue) await UI.story(Story.prologue, '프롤로그');
    startTown();
  }

  UI.register('title', {
    title: '모두의 힐러',
    full: true,
    modal: true,
    render(root, params, api) {
      injectStyle();
      root.classList.add('hk-root');
      const card = root.closest('.ui-card'); if (card) card.classList.add('tt-card');
      const info = saveInfo();
      const bg = el('canvas', { class: 'bg' }); drawSky(bg);
      root.appendChild(el('div', { class: 'tt-sky' }, [
        bg,
        el('div', { class: 'tt-logo' }, [el('h1', { html: '모두의 <span>힐러</span>' }), el('p', { text: '잿빛 탑과 라일라 마을' })]),
        hero(),
      ]));
      const panel = el('div', { class: 'tt-panel' });
      if (info) panel.appendChild(el('div', { class: 'tt-save' }, [
        el('span', { class: 'ic', text: '📖' }),
        el('div', {}, info.unknown
          ? [el('b', { text: '저장된 모험이 있어요' })]
          : [el('b', { text: `${info.name} · Lv.${info.level} · ${info.chapter}장` }), `최고 ${info.best}층 돌파 · 동료 ${info.party}명 · ${info.day}일째 · ${info.mins}분`]),
      ]));
      panel.appendChild(el('div', { class: 'tt-btns' }, [
        info ? el('button', { class: 'btn primary', text: '이어하기', onClick: () => cont(api) }) : null,
        el('button', { class: 'btn ' + (info ? 'ghost' : 'primary'), text: '새 게임', onClick: () => newGame(api, !!info) }),
      ]));
      panel.appendChild(el('div', { class: 'tt-help' }, HELP.map(([i, t]) => el('div', {}, [el('span', { text: i }), el('span', { text: t })]))));
      panel.appendChild(el('div', { class: 'tt-ver', text: VERSION }));
      root.appendChild(panel);
    },
    // ESC 등으로 선택 없이 닫혔고 아직 씬이 없으면(부팅 직후) 빈 화면에 갇히지 않게 다시 연다
    onClose(params) {
      if (params && params._chosen) return;
      const noScene = typeof Scenes === 'undefined' || !Scenes.name || !Scenes.name();
      if (noScene) setTimeout(() => UI.open('title', {}), 0);
    },
  });
})();
