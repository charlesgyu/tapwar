// 모험가 사무소 — 구인구직 게시판(파티 찾기·파티원 모집·내 파티/모집 현황) + 의뢰 게시판
// 들어오면 큰 버튼 4개짜리 게시판 메뉴가 먼저 나오고, 각 메뉴는 같은 창 안의 하위 화면(params.view)이다.
// 시장은 1초마다 Recruit.tick 으로 움직이며(자리 채움·마감·새 글·지원 결과·지원자 도착), 목록은 통째로 다시 그리지 않고
// 글 id 별로 바뀐 카드만 갈아 끼워(버튼을 누르는 중에 사라지지 않게) 새 글은 미끄러져 들어오고 마감 글은 흐려지며 빠진다.
// RecruitUI.pump() 는 마을 씬도 1초마다 불러, 게시판을 닫아 둔 사이에도 지원 결과·새 지원자를 토스트로 알려 준다.
const RecruitUI = (() => {
  if (typeof UI === 'undefined') return null;
  const { el } = UI;

  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  const A = () => Facilities.adventurer;
  const R = () => (typeof Recruit !== 'undefined' ? Recruit : null);
  const ROLES = ['tank', 'melee', 'ranged', 'healer'];
  const ICON = { tank: '🛡️', melee: '⚔️', ranged: '🏹', healer: '✚' };
  const SHORT = { tank: '탱커', melee: '근접딜러', ranged: '원거리딜러', healer: '힐러' };
  const COLOR = { tank: '#3d6fb8', melee: '#c4553a', ranged: '#3f8f4a', healer: '#c9961f' };
  const CLASS_ICON = { warrior: '🛡️', monk: '👊', mage: '🔮', hunter: '🏹', rogue: '🗡️', spellblade: '⚡', priest: '✨' };
  const className = (c) => (typeof Classes !== 'undefined' && Classes.get(c) ? Classes.get(c).name : c);
  const josa = (w, p) => (typeof PartyUI !== 'undefined' && PartyUI ? PartyUI.josa(w, p) : w);
  const FLOOR_COUNT = () => (typeof Floors !== 'undefined' && Floors.COUNT) || 10;
  const NEW_MS = 45000;

  const APPLY_REASONS = {
    joined: '이미 다른 파티에 합류해 있어요', leading: '내 파티가 출발을 기다리고 있어요', posting: '모집 글을 올린 동안엔 지원할 수 없어요',
    pending: '다른 파티의 답을 기다리는 중이에요', floor_locked: '아직 못 가 본 층이에요', gone: '모집글이 내려갔어요', no_healer_slot: '힐러 자리가 없어요', already_rejected: '이미 거절된 글이에요',
  };
  const RESULT_FAIL = { level_low: '레벨이 낮다고 거절당했어요 ㅠ', rejected: '아쉽게도 다른 분을 뽑았대요', gone: '모집글이 내려갔어요', taken: '다른 힐러가 먼저 들어갔어요' };
  const POST_REASONS = { gold: '골드가 부족해요', no_slots: '필요한 자리를 하나 이상 골라 주세요', slots_full: '파티 정원(4명)을 넘었어요', floor_locked: '아직 열리지 않은 층이에요',
    joined: '다른 파티에 합류한 상태예요', leading: '이미 출발 대기 중인 파티가 있어요', posting: '이미 올린 모집 글이 있어요', pending: '지원 결과를 기다리는 중이에요' };

  // ---------------- 스타일 ----------------
  function injectStyle() {
    if (document.getElementById('ui-adv-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-adv-style';
    s.textContent = `
.adv-q { background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:9px 10px; margin-bottom:7px; }
.adv-q h4 { margin:0; font-size:15px; font-weight:900; color:#3a2a20; display:flex; align-items:center; gap:6px; }
.adv-q .giver { font-size:11px; font-weight:700; color:#8a7a6a; margin-top:1px; }
.adv-q .offer { font-size:12px; color:#5a4a40; margin:5px 0; line-height:1.45; }
.adv-q ul { margin:4px 0 0; padding:0; list-style:none; }
.adv-q li { font-size:12.5px; font-weight:700; color:#3a5a8a; padding:2px 0; }
.adv-q li::before { content:'◆ '; color:#9ab4dc; }
.adv-rw { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.adv-rw span { font-size:11.5px; font-weight:800; border-radius:7px; padding:2px 7px; background:#fff3d6; color:#7a5a1a; }
.adv-rw span.xp { background:#eef4ff; color:#3a5a8a; }
.adv-rw span.it { background:#f3f0ea; color:#4a3a30; border-left:3px solid #ccc; }
.adv-q .foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; }
.adv-q .foot .btn { min-height:44px; min-width:84px; }
.adv-fl { font-size:10px; font-weight:900; color:#fff; background:#7a5a3a; border-radius:6px; padding:1px 6px; }

/* 게시판 머리 */
.rb-board { position:relative; border-radius:14px; padding:10px 12px 11px; margin-bottom:9px; color:#fff8e8;
  background:radial-gradient(circle at 20% 30%, rgba(255,255,255,0.08) 0 2px, transparent 3px) 0 0/14px 14px, radial-gradient(circle at 70% 60%, rgba(0,0,0,0.07) 0 2px, transparent 3px) 0 0/11px 11px, linear-gradient(160deg,#b9844c,#8f5f33);
  box-shadow:inset 0 0 0 3px #6e4523, inset 0 -4px 0 rgba(0,0,0,0.18); }
.rb-board h3 { margin:0; font-size:18px; font-weight:900; letter-spacing:-0.3px; text-shadow:0 2px 0 rgba(0,0,0,0.3); display:flex; align-items:center; gap:6px; }
.rb-live { display:flex; align-items:center; gap:6px; margin-top:4px; font-size:12.5px; font-weight:800; }
.rb-live b { font-size:15px; color:#ffe27a; font-variant-numeric:tabular-nums; display:inline-block; }
.rb-live b.bump { animation:rb-bump 0.5s ease-out; }
.rb-dot { width:9px; height:9px; border-radius:50%; background:#ff5a4a; box-shadow:0 0 0 0 rgba(255,90,74,0.7); animation:rb-pulse 1.4s infinite; flex:none; }
.rb-board.sm { padding:7px 10px; margin-bottom:8px; }
.rb-board.sm h3, .rb-board.sm .rb-pin { display:none; }
.rb-board.sm .rb-live { margin-top:0; }
.rb-pin { position:absolute; right:12px; top:-5px; font-size:20px; transform:rotate(18deg); }
@keyframes rb-pulse { 0% { box-shadow:0 0 0 0 rgba(255,90,74,0.7); } 70% { box-shadow:0 0 0 8px rgba(255,90,74,0); } 100% { box-shadow:0 0 0 0 rgba(255,90,74,0); } }
@keyframes rb-bump { 0% { transform:scale(1.5); color:#fff; } 100% { transform:scale(1); } }

/* 메뉴 */
.rb-menu { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.rb-mbtn { position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:2px; min-height:96px; padding:10px 11px; border:0; border-radius:14px; text-align:left; font-family:inherit; color:#fff; box-shadow:0 3px 0 rgba(0,0,0,0.25); }
.rb-mbtn:active { transform:translateY(2px); box-shadow:none; }
.rb-mbtn .ic { font-size:28px; line-height:1; }
.rb-mbtn b { font-size:16px; font-weight:900; margin-top:3px; }
.rb-mbtn small { font-size:11.5px; font-weight:700; opacity:0.92; line-height:1.3; }
.rb-mbtn .cnt { position:absolute; right:8px; top:8px; min-width:22px; height:22px; padding:0 6px; border-radius:11px; background:#fff; color:#c0392b; font-size:12px; font-weight:900; display:flex; align-items:center; justify-content:center; }
.rb-mbtn.find { background:linear-gradient(150deg,#5bb04a,#2f7d3a); }
.rb-mbtn.post { background:linear-gradient(150deg,#e39a3b,#b8662a); }
.rb-mbtn.mine { background:linear-gradient(150deg,#5a86c8,#3a5a9a); }
.rb-mbtn.quest { background:linear-gradient(150deg,#9a7ab8,#6a4a8a); }

/* 상태 띠 */
.rb-status { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:11px; margin-bottom:9px; font-size:12.5px; font-weight:800; line-height:1.35; border:2px solid; }
.rb-status .ic { font-size:22px; flex:none; }
.rb-status .tx { flex:1; min-width:0; }
.rb-status .btn { min-height:40px; padding:6px 10px; font-size:12.5px; flex:none; }
.rb-status.wait { background:#fff7df; border-color:#efd290; color:#7a5a1a; }
.rb-status.go { background:#e8f5e0; border-color:#a9d494; color:#2f6b2f; }
.rb-status.lead { background:#fff0e0; border-color:#efc08a; color:#8a4a1a; }

/* 띠 목록(최근 글) */
.rb-ticker { background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:4px 8px; }
.rb-tk { display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px dashed #eadfca; font-size:12px; min-height:30px; }
.rb-tk:last-child { border-bottom:0; }
.rb-tk .t { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:800; color:#3a2a20; }
.rb-tk .a { flex:none; font-size:10.5px; color:#9a8a7a; font-weight:700; }

/* 필터 */
.rb-filter { display:flex; gap:5px; margin-bottom:8px; }
.rb-filter button { flex:1; min-height:38px; border:2px solid #e3d8c3; background:#fff; border-radius:19px; font-family:inherit; font-size:12.5px; font-weight:800; color:#7a6a5a; }
.rb-filter button.on { background:#3a2a20; border-color:#3a2a20; color:#fff; }
.rb-subhead { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
.rb-subhead .rb-back, .rb-subhead .rb-board { margin-bottom:0; }
.rb-subhead .rb-board { flex:1; min-width:0; }
.rb-subhead .rb-live { font-size:11.5px; white-space:nowrap; }
.rb-subhead .rb-live b { font-size:13.5px; }
.rb-back { display:inline-flex; align-items:center; gap:4px; min-height:36px; padding:4px 10px 4px 6px; margin-bottom:8px; border:0; border-radius:18px; background:#efe5d2; color:#5a4030; font-family:inherit; font-size:13px; font-weight:900; }

/* 모집글 카드 */
.rc-list { position:relative; }
.rc-post { position:relative; background:#fffdf7; border:2px solid #e3d8c3; border-left:6px solid #5f8f4a; border-radius:12px; padding:8px 9px 8px 9px; margin-bottom:7px; overflow:hidden; transition:opacity 0.4s, transform 0.4s; }
.rc-post.cave { border-left-color:#6a5a8a; }
.rc-post.seek { border-color:#efd290; border-left-color:#e0a83a; background:#fffcf0; }
.rc-post.nohealer { background:#f5f2ec; }
.rc-post.nohealer .rc-title { color:#8a7f72; }
.rc-post.full { opacity:0.72; }
.rc-post.rc-in { animation:rc-in 0.5s ease-out; }
.rc-post.rc-bump { animation:rc-bump 0.6s ease-out; }
.rc-post.rc-out, .rb-tk.rc-out, .rc-app.rc-out { opacity:0; transform:translateX(40px); pointer-events:none; }
.rb-tk.rc-in, .rc-app.rc-in { animation:rc-in 0.5s ease-out; }
@keyframes rc-in { 0% { opacity:0; transform:translateY(-14px) scale(0.97); background:#fff4c2; } 60% { opacity:1; } 100% { transform:none; } }
@keyframes rc-bump { 0% { box-shadow:0 0 0 3px #ffd55a; } 100% { box-shadow:0 0 0 0 rgba(255,213,90,0); } }
.rc-hd { display:flex; align-items:flex-start; gap:7px; }
.rc-fl { flex:none; min-width:34px; height:34px; border-radius:9px; background:#5f8f4a; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; font-size:15px; line-height:1; }
.rc-fl small { font-size:8.5px; font-weight:800; opacity:0.9; margin-top:1px; }
.rc-post.cave .rc-fl { background:#6a5a8a; }
.rc-title { flex:1; min-width:0; font-size:14px; font-weight:900; color:#2a2020; line-height:1.3; word-break:keep-all; }
.rc-new { flex:none; font-size:9.5px; font-weight:900; color:#fff; background:#e5483a; border-radius:5px; padding:2px 5px; animation:rc-blink 1s steps(2) infinite; }
@keyframes rc-blink { 50% { opacity:0.55; } }
.rc-lead { display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:700; color:#7a6a5a; margin:3px 0 4px 41px; flex-wrap:wrap; }
.rc-lead b { color:#3a2a20; font-weight:900; }
.rc-lead .crown { font-size:11px; }
.rc-slots { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.rc-dot { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; color:#fff; flex:none; }
.rc-dot.open { background:#fff; border:2px dashed currentColor; font-size:12px; }
.rc-dot.open.heal { border-style:solid; background:#fff6d8; animation:rc-glow 1.6s ease-in-out infinite; }
.rc-dot.me { box-shadow:0 0 0 2px #fff, 0 0 0 4px #c9961f; }
@keyframes rc-glow { 50% { box-shadow:0 0 0 4px rgba(224,168,58,0.35); } }
.rc-cnt { font-size:11px; font-weight:900; color:#8a7a6a; margin-left:3px; font-variant-numeric:tabular-nums; }
.rc-ft { display:flex; align-items:center; gap:8px; }
.rc-ft .rc-slots { flex:1; min-width:0; }
.rc-meta { display:flex; flex-wrap:wrap; gap:3px; margin-top:6px; }
.rc-tag { font-size:10.5px; font-weight:800; color:#6a5a4a; background:#f1e9da; border-radius:6px; padding:2px 5px; }
.rc-tag.lv { background:#e5f2dc; color:#2f6b2f; } .rc-tag.lv.low { background:#fbe1de; color:#b0403a; } .rc-tag.lv.high { background:#fff0d6; color:#a0641a; }
.rc-tag.rw { background:#fff3c8; color:#7a5a10; }
.rc-ft .btn { flex:none; min-height:44px; min-width:92px; font-size:13.5px; padding:6px 10px; }
.rc-ft .btn.wait { background:#e0a83a; box-shadow:0 2px 0 #9a6a1a; opacity:1; }
.rc-ft .btn.na { background:#c9c0b2; box-shadow:none; color:#fff; opacity:1; font-size:12px; }
.rc-stamp { position:absolute; right:10px; top:30%; transform:rotate(-12deg); border:3px solid #d9534f; color:#d9534f; font-weight:900; font-size:17px; padding:2px 8px; border-radius:8px; background:rgba(255,255,255,0.8); animation:rc-stamp 0.35s ease-out; }
@keyframes rc-stamp { 0% { transform:rotate(-12deg) scale(2.2); opacity:0; } 100% { transform:rotate(-12deg) scale(1); opacity:1; } }
.rc-spin { display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.5); border-top-color:#fff; border-radius:50%; animation:rc-spin 0.8s linear infinite; vertical-align:-2px; margin-right:4px; }
@keyframes rc-spin { to { transform:rotate(360deg); } }

/* 모집 등록 */
.rp-sec { font-size:13px; font-weight:900; color:#5a4030; margin:4px 2px 6px; }
.rp-floors { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; margin-bottom:6px; }
.rp-floors button { min-height:44px; border:2px solid #e3d8c3; background:#fff; border-radius:10px; font-family:inherit; font-size:15px; font-weight:900; color:#3a2a20; }
.rp-floors button.on { background:#5f8f4a; border-color:#3f6f2a; color:#fff; }
.rp-floors button.cave.on { background:#6a5a8a; border-color:#4a3a6a; }
.rp-floors button:disabled { color:#b8ad9e; background:#ece7de; }
.rp-finfo { font-size:12px; font-weight:700; color:#7a6a5a; background:#fff; border:1px solid #e3d8c3; border-radius:9px; padding:6px 8px; margin-bottom:10px; }
.rp-roles { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:8px; }
.rp-role { position:relative; display:flex; align-items:center; gap:8px; min-height:62px; padding:8px 38px 8px 10px; border:0; border-radius:12px; color:#fff; font-family:inherit; text-align:left; box-shadow:0 3px 0 rgba(0,0,0,0.22); }
.rp-role:active { transform:translateY(2px); box-shadow:none; }
.rp-role .ic { font-size:24px; }
.rp-role b { font-size:15px; font-weight:900; display:block; }
.rp-role small { font-size:10.5px; opacity:0.9; font-weight:700; }
.rp-role .n { position:absolute; right:7px; top:7px; min-width:26px; height:26px; border-radius:13px; background:#fff; font-weight:900; font-size:14px; display:flex; align-items:center; justify-content:center; }
.rp-role .n.zero { opacity:0; }
.rp-role.pop .n { animation:rb-bump 0.35s ease-out; }
.rp-minus { position:absolute; right:6px; bottom:6px; width:28px; height:24px; border-radius:8px; background:rgba(0,0,0,0.28); color:#fff; font-weight:900; font-size:17px; line-height:1; display:flex; align-items:center; justify-content:center; }
.rp-preview { display:flex; align-items:center; gap:5px; flex-wrap:wrap; padding:8px; border-radius:11px; background:#fff; border:2px dashed #e3d8c3; margin-bottom:8px; min-height:46px; }
.rp-preview .lbl { font-size:11px; font-weight:800; color:#8a7a6a; margin-left:auto; }
.rp-preview .reset { border:0; background:#efe5d2; color:#5a4030; border-radius:8px; font-family:inherit; font-size:11.5px; font-weight:800; padding:5px 8px; min-height:30px; }
.rp-fee { display:flex; align-items:center; gap:8px; padding:9px 10px; border-radius:12px; background:#fff3d6; border:2px solid #e3c98a; margin-bottom:8px; }
.rp-fee .v { font-size:20px; font-weight:900; color:#7a5a1a; font-variant-numeric:tabular-nums; }
.rp-fee small { display:block; font-size:10.5px; font-weight:700; color:#8a7a6a; }
.rp-fee .have { margin-left:auto; text-align:right; font-size:12px; font-weight:900; color:#5a4a30; }
.rp-fee .have.short { color:#b0403a; }
.rp-go { width:100%; min-height:54px; font-size:17px; }

/* 내 모집 현황 */
.rm-card { background:#fff; border:2px solid #efc08a; border-radius:12px; padding:9px 10px; margin-bottom:8px; }
.rm-card h4 { margin:0; font-size:15px; font-weight:900; color:#3a2a20; display:flex; gap:6px; align-items:center; }
.rm-card .sub { font-size:11.5px; font-weight:700; color:#8a7a6a; margin:2px 0 6px; }
.rm-waiting { text-align:center; font-size:12.5px; font-weight:800; color:#9a8a7a; padding:12px 6px; background:#faf6ee; border-radius:10px; margin-bottom:7px; }
.rm-waiting i { display:inline-block; animation:rc-blink 1s steps(2) infinite; font-style:normal; }
.rc-app { display:flex; gap:8px; align-items:center; background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:7px 8px; margin-bottom:6px; transition:opacity 0.4s, transform 0.4s; }
.rc-app .mid { flex:1; min-width:0; }
.rc-app .nm { font-size:14px; font-weight:900; color:#2a2020; display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
.rc-app .nm small { font-size:11.5px; color:#7a5a3a; font-weight:800; }
.rc-app .msg { font-size:11.5px; color:#8a6a4a; font-style:italic; margin-top:2px; }
.rc-app .bt { display:flex; flex-direction:column; gap:4px; flex:none; }
.rc-app .bt .btn { min-height:40px; min-width:60px; padding:4px 8px; font-size:13px; }
.rc-app .bt .btn.ghost { box-shadow:0 2px 0 #c9b89a, inset 0 0 0 1px #e3d8c3; }
.rm-foot { display:flex; gap:7px; margin-top:8px; }
.rm-foot .btn { flex:1; min-height:50px; font-size:14.5px; }
.rm-hist { font-size:12px; font-weight:700; color:#6a5a4a; padding:5px 2px; border-bottom:1px dashed #e3d8c3; }
`;
    document.head.appendChild(s);
  }

  // ---------------- 공용 조각 ----------------
  function topBar(g) {
    const n = Party.members(g).length;
    return el('div', { class: 'pu-top' }, [el('b', { class: 'rb-gold', text: UI.gold(g.player.gold || 0) }), el('small', { text: `👥 파티원 ${n} / ${Party.MAX}` })]);
  }
  function boardHead(g, small) {
    const c = R().counters(g);
    return el('div', { class: 'rb-board' + (small ? ' sm' : '') }, [
      el('span', { class: 'rb-pin', text: '📌' }),
      el('h3', { text: '📋 구인구직 게시판' }),
      el('div', { class: 'rb-live' }, [el('span', { class: 'rb-dot' }), '실시간 모집글 ', el('b', { class: 'rb-n-live', text: String(c.live) }), '건 · 오늘 매칭 ', el('b', { class: 'rb-n-match', text: String(c.matchedToday) }), '건']),
    ]);
  }
  function updateHead(root, g) {
    const c = R().counters(g);
    const set = (sel, v) => { const n = root.querySelector(sel); if (n && n.textContent !== String(v)) { n.textContent = String(v); n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); } };
    set('.rb-n-live', c.live); set('.rb-n-match', c.matchedToday);
    const gd = root.querySelector('.rb-gold'); if (gd) gd.textContent = UI.gold(g.player.gold || 0);
  }
  const back = (params, api) => el('button', { class: 'rb-back', onClick: () => { params.view = null; api.refresh(); } }, ['‹ 게시판']);
  function dot(role, opts = {}) {
    const c = COLOR[role] || '#8a7a6a';
    if (opts.open) return el('span', { class: 'rc-dot open' + (role === 'healer' ? ' heal' : ''), style: { color: c }, title: `${SHORT[role]} 자리`, text: ICON[role] });
    return el('span', { class: 'rc-dot' + (opts.me ? ' me' : ''), style: { background: c }, title: opts.title || SHORT[role], text: ICON[role] });
  }
  // 상태 띠: 지원 검토 중 / 합류 / 모집 중 / 출발 대기
  function statusStrip(g, params, api) {
    const r = R().ensure(g);
    const go = (view) => { params.view = view; api.refresh(); };
    if (r.pending) {
      const p = R().find(g, r.pending.postId);
      return el('div', { class: 'rb-status wait' }, [el('span', { class: 'ic', text: '⏳' }), el('div', { class: 'tx' }, [`${p ? p.leader.name + '님' : '리더'}이 지원서를 검토 중이에요…`]), el('span', { class: 'rc-spin', style: { borderColor: '#e0c070', borderTopColor: '#7a5a1a' } })]);
    }
    if (r.joined) return el('div', { class: 'rb-status go' }, [el('span', { class: 'ic', text: '🤝' }), el('div', { class: 'tx' }, [`${r.joined.leaderName}님 파티 합류 중 · 목표 ${r.joined.floor}층`]), el('button', { class: 'btn primary', text: '🗼 출발', onClick: () => api.open('tower') })]);
    if (r.posting) return el('div', { class: 'rb-status lead' }, [el('span', { class: 'ic', text: '📣' }), el('div', { class: 'tx' }, [`내 모집글 진행 중 · 지원자 ${r.posting.applicants.length}명 대기`]), el('button', { class: 'btn', text: '보기', onClick: () => go('mine') })]);
    if (r.leading) return el('div', { class: 'rb-status go' }, [el('span', { class: 'ic', text: '👑' }), el('div', { class: 'tx' }, [`내 파티 출발 대기 · 목표 ${r.leading.floor}층`]), el('button', { class: 'btn primary', text: '🗼 출발', onClick: () => api.open('tower') })]);
    return null;
  }

  // 목록 동기화: key 가 같고 sig 가 같으면 그대로, sig 가 바뀌면 그 카드만 교체, 새 key 는 rc-in, 사라진 key 는 rc-out 후 제거
  function syncList(box, items, key, sig, build) {
    const old = new Map();
    for (const n of Array.from(box.children)) if (n.dataset && n.dataset.key) old.set(n.dataset.key, n);
    const keep = new Set();
    let prev = null;
    for (const it of items) {
      const k = key(it), s = sig(it); keep.add(k);
      let n = old.get(k);
      if (n && n.dataset.sig !== s) { const nn = build(it); nn.dataset.key = k; nn.dataset.sig = s; nn.classList.add('rc-bump'); n.replaceWith(nn); n = nn; }
      else if (!n) { n = build(it); n.dataset.key = k; n.dataset.sig = s; if (box.dataset.ready) n.classList.add('rc-in'); }
      const want = prev ? prev.nextSibling : box.firstChild;
      if (n !== want) box.insertBefore(n, want);
      prev = n;
    }
    for (const [k, n] of old) if (!keep.has(k)) { n.dataset.key = ''; n.classList.add('rc-out'); setTimeout(() => n.remove(), 420); }
    box.dataset.ready = '1';
  }

  // ---------------- 1초 펌프(마을 씬도 부른다) ----------------
  let liveFn = null, timer = null;
  function viewing(view) { const c = UI.current(); return !!(c && c.name === 'adventurer' && (c.params.view || null) === view); }
  function pump() {
    const Rc = R(); if (!Rc || typeof State === 'undefined') return [];
    const g = G();
    let events = [];
    try { events = Rc.tick(g).events; } catch (e) { console.error('[recruit]', e); return []; }
    let dirty = false;
    for (const e of events) {
      if (e.type === 'apply_result') {
        dirty = true;
        if (e.ok) {
          UI.toast(`🎉 ${e.leaderName}님 파티에 합류했어요! 목표 ${e.floor}층 — 성문에서 출발하세요`, 3600);
          const c = UI.current();
          if (c && c.name === 'adventurer') { c.params.view = 'mine'; UI.refresh(); }
        } else UI.toast(`😢 ${RESULT_FAIL[e.reason] || '거절당했어요'}`, 2600);
      } else if (e.type === 'applicant') {
        dirty = true;
        if (!viewing('mine')) UI.toast(`📮 새 지원자! ${e.name} Lv.${e.level} (${SHORT[e.role]})`, 2200);
      }
    }
    if (dirty) save();
    if (liveFn) { try { liveFn(events); } catch (e) { console.error('[recruit ui]', e); } }
    return events;
  }
  function startLive(root, fn) {
    liveFn = fn;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); timer = null; liveFn = null; return; }
      pump();
    }, 1000);
  }

  // ---------------- 메뉴(홈) ----------------
  function renderHome(root, params, api) {
    const g = G();
    root.appendChild(boardHead(g));
    const st = statusStrip(g, params, api); if (st) root.appendChild(st);
    const posts = R().posts(g);
    const healerN = posts.filter((p) => R().healerOpen(p)).length;
    const r = R().ensure(g);
    const go = (view) => { params.view = view; api.refresh(); };
    const nBoard = A().board(g).length;
    const mineSub = r.posting ? `지원자 ${r.posting.applicants.length}명 대기 중` : r.joined ? `${r.joined.leaderName}님 파티 · ${r.joined.floor}층` : r.leading ? `출발 대기 · ${r.leading.floor}층` : `파티원 ${Party.members(g).length}명`;
    root.appendChild(el('div', { class: 'rb-menu' }, [
      el('button', { class: 'rb-mbtn find', 'data-menu': 'find', onClick: () => go('find') }, [el('span', { class: 'ic', text: '🔍' }), el('b', { text: '파티 찾기' }), el('small', { text: '힐러 구하는 파티에 지원' }), healerN ? el('span', { class: 'cnt rb-n-heal', text: String(healerN) }) : null]),
      el('button', { class: 'rb-mbtn post', 'data-menu': 'post', onClick: () => go(r.posting ? 'mine' : 'post') }, [el('span', { class: 'ic', text: '📣' }), el('b', { text: '파티원 모집' }), el('small', { text: r.posting ? '모집 진행 중' : `리더가 되어 등록 · 게시료 ${R().FEE_MIN}골드~` })]),
      el('button', { class: 'rb-mbtn mine', 'data-menu': 'mine', onClick: () => go('mine') }, [el('span', { class: 'ic', text: '👥' }), el('b', { text: '내 파티 / 모집 현황' }), el('small', { text: mineSub }), r.posting && r.posting.applicants.length ? el('span', { class: 'cnt', text: String(r.posting.applicants.length) }) : null]),
      el('button', { class: 'rb-mbtn quest', 'data-menu': 'quests', onClick: () => go('quests') }, [el('span', { class: 'ic', text: '📜' }), el('b', { text: '의뢰 게시판' }), el('small', { text: '마을 사람들의 의뢰' }), nBoard ? el('span', { class: 'cnt', text: String(nBoard) }) : null]),
    ]));
    root.appendChild(el('div', { class: 'ui-section-title', text: '⚡ 방금 올라온 글' }));
    const tk = el('div', { class: 'rb-ticker' });
    root.appendChild(tk);
    const fill = () => {
      const list = R().posts(g).filter((p) => p.state === 'open').slice(0, 5);
      syncList(tk, list, (p) => p.id, (p) => `${p.members.length}|${R().slotTotal(p.slots)}`, (p) => el('div', { class: 'rb-tk' }, [
        el('span', { class: 'adv-fl', style: { background: p.floor >= 6 ? '#6a5a8a' : '#5f8f4a' }, text: `${p.floor}층` }),
        el('span', { class: 't', text: `${p.slots.healer > 0 ? '✚ ' : ''}${p.title}` }),
        el('span', { class: 'a', 'data-t': String(p.createdAt), text: R().ago(p.createdAt) }),
      ]));
      for (const n of tk.querySelectorAll('[data-t]')) n.textContent = R().ago(+n.dataset.t);
    };
    fill();
    root.appendChild(el('div', { class: 'pu-hint', style: { marginTop: '8px' }, text: '💡 처음엔 게시료를 낼 골드가 없으니, 레벨이 맞는 "힐러 구해요" 글에 지원해서 파티에 끼어 보세요. 돌파하면 리더가 보상을 나눠 줘요.' }));
    startLive(root, () => {
      updateHead(root, g); fill();
      const hn = root.querySelector('.rb-n-heal'); if (hn) hn.textContent = String(R().posts(g).filter((p) => R().healerOpen(p)).length);
    });
  }

  // ---------------- 파티 찾기 ----------------
  function postCard(g, p, api, rerender) {
    const r = R().ensure(g), Rc = R();
    const seek = Rc.healerOpen(p), cave = p.floor >= 6;
    const f = Rc.fit(g, p);
    const pendingHere = r.pending && r.pending.postId === p.id;
    const isNew = Date.now() - p.createdAt < NEW_MS && p.state === 'open';
    const dots = [];
    for (const m of p.members) dots.push(dot(m.role, { title: `${m.name} Lv.${m.level} ${className(m.cls)}` }));
    for (const role of ROLES) for (let i = 0; i < (p.slots[role] || 0); i++) dots.push(dot(role, { open: true }));
    let btn;
    if (p.state !== 'open') btn = el('button', { class: 'btn na', disabled: true, text: '모집 완료' });
    else if (!seek) btn = el('button', { class: 'btn na', disabled: true, text: '힐러 자리 없음' });
    else if (pendingHere) btn = el('button', { class: 'btn wait', disabled: true }, [el('span', { class: 'rc-spin' }), '검토 중…']);
    else if (p.floor > Rc.maxOpen(g)) btn = el('button', { class: 'btn na', disabled: true, text: `🔒 ${p.floor}층 미개방` });
    else if (r.applied[p.id] === 'rejected') btn = el('button', { class: 'btn na', disabled: true, text: '거절됨' });
    else btn = el('button', { class: 'btn primary', 'data-apply': p.id, text: '지원하기', disabled: !!Rc.busy(g), onClick: () => applyTo(g, p, api, rerender) });
    const lvCls = f.kind === 'low' ? ' low' : f.kind === 'high' ? ' high' : '';
    return el('div', { class: 'rc-post' + (cave ? ' cave' : '') + (seek ? ' seek' : ' nohealer') + (p.state !== 'open' ? ' full' : '') }, [
      el('div', { class: 'rc-hd' }, [
        el('div', { class: 'rc-fl' }, [String(p.floor), el('small', { text: '층' })]),
        el('div', { class: 'rc-title', text: p.title }),
        isNew ? el('span', { class: 'rc-new', text: 'NEW' }) : null,
      ]),
      el('div', { class: 'rc-lead' }, [el('span', { class: 'crown', text: '👑' }), el('b', { text: p.leader.name }), `Lv.${p.leader.level} ${CLASS_ICON[p.leader.cls] || ''}${className(p.leader.cls)}`, ' · ', el('span', { 'data-t': String(p.createdAt), text: Rc.ago(p.createdAt) })]),
      el('div', { class: 'rc-ft' }, [
        el('div', { class: 'rc-slots' }, dots.concat([el('span', { class: 'rc-cnt', text: `${p.members.length}/${p.members.length + Rc.slotTotal(p.slots)}` })])),
        btn,
      ]),
      el('div', { class: 'rc-meta' }, [
        el('span', { class: 'rc-tag lv' + (seek ? lvCls : ''), text: `Lv.${p.levelRange[0]}~${p.levelRange[1]}` }),
        el('span', { class: 'rc-tag rw', text: `🪙 +${p.bonusGold}` }),
        ...p.tags.map((t) => el('span', { class: 'rc-tag', text: '#' + t })),
      ]),
      p.state !== 'open' ? el('div', { class: 'rc-stamp', text: '모집 완료' }) : null,
    ]);
  }
  function applyTo(g, p, api, rerender) {
    const res = R().apply(g, p.id);
    if (!res.ok) { api.toast(APPLY_REASONS[res.reason] || '지원할 수 없어요'); return; }
    save();
    api.toast(`📨 ${p.leader.name}님께 지원서를 보냈어요 · ${res.fit.text}`, 2400);
    rerender();
  }
  function renderFind(root, params, api) {
    const g = G(), Rc = R();
    root.appendChild(el('div', { class: 'rb-subhead' }, [back(params, api), boardHead(g, true)]));
    const stBox = el('div'); root.appendChild(stBox);
    const filt = params.filter || 'all';
    const FILTERS = [['all', '전체'], ['healer', '✚ 힐러 구함'], ['fit', '지원 가능']];
    root.appendChild(el('div', { class: 'rb-filter' }, FILTERS.map(([id, label]) => el('button', { class: filt === id ? 'on' : '', onClick: () => { params.filter = id; api.refresh(); } }, [label]))));
    const list = el('div', { class: 'rc-list' });
    root.appendChild(list);
    const emptyBox = el('div'); root.appendChild(emptyBox);
    const busyKey = () => { const r = Rc.ensure(g); return `${Rc.busy(g) || ''}:${r.pending ? r.pending.postId : ''}:${Object.keys(r.applied).join(',')}`; };
    const fill = () => {
      stBox.innerHTML = ''; const st = statusStrip(g, params, api); if (st) stBox.appendChild(st);
      let posts = Rc.posts(g).slice();
      if (filt === 'healer') posts = posts.filter((p) => Rc.healerOpen(p) || p.state !== 'open');
      if (filt === 'fit') posts = posts.filter((p) => Rc.fits(g, p) || p.state !== 'open');
      // 힐러 자리 있는 글이 위로(같으면 최신순)
      posts.sort((a, b) => ((b.state === 'open') - (a.state === 'open')) || (Rc.fits(g, b) - Rc.fits(g, a)) || (Rc.healerOpen(b) - Rc.healerOpen(a)) || (b.createdAt - a.createdAt));
      const bk = busyKey();
      syncList(list, posts, (p) => p.id, (p) => `${p.state}|${p.members.length}|${Rc.slotTotal(p.slots)}|${bk}|${Date.now() - p.createdAt < NEW_MS}`, (p) => postCard(g, p, api, fill));
      for (const n of list.querySelectorAll('[data-t]')) n.textContent = Rc.ago(+n.dataset.t);
      emptyBox.innerHTML = '';
      if (!posts.length) emptyBox.appendChild(UI.empty('조건에 맞는 글이 없어요. 잠시 뒤 새 글이 올라와요.'));
    };
    fill();
    startLive(root, () => { updateHead(root, g); fill(); });
  }

  // ---------------- 파티원 모집(등록) ----------------
  function renderPost(root, params, api) {
    const g = G(), Rc = R(), r = Rc.ensure(g);
    root.appendChild(el('div', { class: 'rb-subhead' }, [back(params, api), boardHead(g, true)]));
    const b = Rc.busy(g);
    if (b) {
      const st = statusStrip(g, params, api); if (st) root.appendChild(st);
      root.appendChild(el('div', { class: 'pu-warn', text: `${POST_REASONS[b] || '지금은 모집 글을 올릴 수 없어요'}. ${b === 'posting' ? "'내 파티 / 모집 현황'에서 지원자를 확인하세요." : ''}` }));
      startLive(root, () => updateHead(root, g));
      return;
    }
    const d = params.draft = params.draft || Rc.newDraft(g);
    if (d.floor > Rc.maxOpen(g)) d.floor = Rc.maxOpen(g);
    const cap = Rc.slotCap(g);
    // ① 층
    root.appendChild(el('div', { class: 'rp-sec', text: '① 어느 층에 갈까요?' }));
    const fl = el('div', { class: 'rp-floors' });
    for (let f = 1; f <= FLOOR_COUNT(); f++) {
      const locked = f > Rc.maxOpen(g);
      fl.appendChild(el('button', { class: (f === d.floor ? 'on' : '') + (f >= 6 ? ' cave' : ''), disabled: locked, onClick: () => { d.floor = f; api.refresh(); } }, [locked ? '🔒' : `${f}층`]));
    }
    root.appendChild(fl);
    const fi = Rc.floorInfo(d.floor);
    root.appendChild(el('div', { class: 'rp-finfo', text: `${fi.biome === 'cave' ? '🪨' : '🌲'} ${fi.name} · 권장 Lv.${fi.levelRange[0]}~${fi.levelRange[1]} · 👑 ${fi.boss}` }));
    // ② 자리
    root.appendChild(el('div', { class: 'rp-sec', text: `② 필요한 자리 — 누를 때마다 한 자리씩 (최대 ${cap}자리)` }));
    const grid = el('div', { class: 'rp-roles' });
    for (const role of ROLES) {
      const n = d.slots[role] || 0;
      const card = el('button', { class: 'rp-role', 'data-role': role, style: { background: `linear-gradient(150deg, ${COLOR[role]}, ${shade(COLOR[role])})` }, onClick: () => {
        const res = Rc.addSlot(g, d, role);
        if (!res.ok) { api.toast(res.reason === 'slots_full' ? `자리는 최대 ${cap}개까지예요 (파티 정원 4명)` : '추가할 수 없어요'); return; }
        params.pop = role; api.refresh();
      } }, [
        el('span', { class: 'ic', text: ICON[role] }),
        el('div', {}, [el('b', { text: SHORT[role] }), el('small', { text: role === 'healer' ? '보조 힐러' : role === 'tank' ? '전사·무투가' : role === 'melee' ? '도적·마검사·전사' : '마법사·사냥꾼' })]),
        el('span', { class: 'n' + (n ? '' : ' zero'), style: { color: COLOR[role] }, text: `×${n}` }),
      ]);
      if (params.pop === role) card.classList.add('pop');
      if (n) card.appendChild(el('span', { class: 'rp-minus', role: 'button', text: '−', onClick: (e) => { e.stopPropagation(); Rc.removeSlot(d, role); params.pop = null; api.refresh(); } }));
      grid.appendChild(card);
    }
    params.pop = null;
    root.appendChild(grid);
    // 미리보기: 나(리더 힐러) + 빈 자리
    const total = Rc.slotTotal(d.slots);
    const pv = el('div', { class: 'rp-preview' }, [dot('healer', { me: true, title: '나 (리더)' })]);
    for (const m of Party.members(g)) pv.appendChild(dot(m.role, { title: m.name }));
    for (const role of ROLES) for (let i = 0; i < (d.slots[role] || 0); i++) pv.appendChild(dot(role, { open: true }));
    pv.appendChild(el('span', { class: 'lbl', text: total ? `모집 ${total}자리` : '역할 버튼을 눌러 자리를 추가하세요' }));
    if (total) pv.appendChild(el('button', { class: 'reset', text: '초기화', onClick: () => { Rc.resetSlots(d); api.refresh(); } }));
    root.appendChild(pv);
    // 게시료
    const fee = Rc.feeFor(d.floor, Math.max(1, total)), gold = g.player.gold || 0, short = gold < fee;
    root.appendChild(el('div', { class: 'rp-fee' }, [
      el('div', {}, [el('small', { text: '게시료' }), el('span', { class: 'v', text: UI.gold(fee) }), el('small', { text: `${Math.max(1, total)}자리 × (${Rc.FEE_BASE} + ${Rc.FEE_PER_FLOOR}×${d.floor}층) · 최소 ${Rc.FEE_MIN}` })]),
      el('div', { class: 'have' + (short ? ' short' : '') }, [el('small', { text: '보유' }), UI.gold(gold)]),
    ]));
    if (short) root.appendChild(el('div', { class: 'pu-warn' }, [`골드가 ${fee - gold} 부족해요. 먼저 힐러를 구하는 파티에 지원해서 보상을 모아 보세요. `, el('button', { class: 'btn small', text: '파티 찾기', onClick: () => { params.view = 'find'; api.refresh(); } })]));
    root.appendChild(el('button', { class: 'btn primary rp-go', 'data-post': '1', disabled: !total || short, text: total ? `📣 등록 (${UI.gold(fee)})` : '자리를 골라 주세요', onClick: () => {
      const res = Rc.post(g, d, Date.now());
      if (!res.ok) { api.toast(res.reason === 'gold' ? `골드가 부족해요 (게시료 ${UI.gold(res.fee)})` : POST_REASONS[res.reason] || '등록할 수 없어요'); return; }
      save(); params.draft = null; params.view = 'mine';
      api.toast(`📣 모집 글을 올렸어요! 지원자가 곧 찾아올 거예요 (${UI.gold(res.fee)})`, 2600);
      api.refresh();
    } }));
    root.appendChild(el('div', { class: 'pu-hint', style: { marginTop: '6px' }, text: '등록하면 내가 파티 리더가 돼요. 지원자를 수락하고 "모집 마감"을 누르면 출발 준비 완료! 취소하면 게시료의 절반을 돌려받아요. 모집한 파티는 그 층을 한 번 다녀오면 해산해요.' }));
    startLive(root, () => updateHead(root, g));
  }
  function shade(hex) { const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(v * 0.72).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); }

  // ---------------- 내 파티 / 모집 현황 ----------------
  function renderMine(root, params, api) {
    const g = G(), Rc = R(), r = Rc.ensure(g);
    root.appendChild(back(params, api));
    if (r.posting) return renderPosting(root, params, api);
    const st = statusStrip(g, params, api); if (st) root.appendChild(st);
    if (r.pending) {
      const p = Rc.find(g, r.pending.postId);
      if (p) root.appendChild(postCard(g, p, api, () => api.refresh()));
      root.appendChild(el('button', { class: 'btn ghost', style: { width: '100%', minHeight: '44px' }, text: '지원 취소', onClick: () => { Rc.cancelApply(g); save(); api.refresh(); } }));
    }
    if (r.joined || r.leading) {
      const j = r.joined, l = r.leading;
      root.appendChild(el('div', { class: 'rm-card', style: { borderColor: '#a9d494' } }, [
        el('h4', {}, [el('span', { class: 'adv-fl', style: { background: '#5f8f4a' }, text: `${(j || l).floor}층` }), j ? `${j.leaderName}님의 파티` : '내가 모은 파티 (리더)']),
        el('div', { class: 'sub', text: j ? `"${j.title}" · 돌파 보상 🪙 +${j.rewardBonus}` : '모집으로 모인 동료들이에요.' }),
        el('div', { class: 'pu-hint', style: { margin: 0 }, text: `목표 ${(j || l).floor}층을 한 번 다녀오면(돌파·전멸·귀환) 파티는 해산해요.` }),
      ]));
    }
    const members = Party.members(g);
    const sum = PartyUI.roleSummary(g);
    root.appendChild(sum.grid);
    if (!r.joined && !r.leading) root.appendChild(el('div', { class: sum.advice.warn ? 'pu-warn' : 'pu-ok', text: sum.advice.text }));
    if (!members.length) {
      root.appendChild(UI.empty('아직 동료가 없어요.'));
      root.appendChild(el('button', { class: 'btn primary', style: { width: '100%', minHeight: '48px' }, text: '🔍 힐러 구하는 파티 찾기', onClick: () => { params.view = 'find'; api.refresh(); } }));
    }
    for (const m of members) {
      const inGuild = m.guildId && g.guild && g.guild.id === m.guildId;
      const leader = r.joined && r.joined.leaderUid === m.uid;
      const side = [el('button', { class: 'btn ghost', text: '상세', onClick: () => api.open('party', { sel: m.uid }) })];
      if (!r.joined && !(r.leading && (r.leading.memberUids || []).includes(m.uid))) side.push(el('button', { class: 'btn danger', text: inGuild ? '빼기' : '해고', onClick: () => PartyUI.dismissFlow(g, m, api) }));
      root.appendChild(PartyUI.memberCard(m, g, { tag: leader ? '👑 리더' : inGuild ? '길드원' : null, guild: inGuild, side }));
    }
    if (r.joined || r.leading) {
      root.appendChild(el('div', { class: 'rm-foot' }, [
        el('button', { class: 'btn primary', text: '🗼 성문으로 출발', onClick: () => api.open('tower') }),
        el('button', { class: 'btn danger', text: r.joined ? '탈퇴' : '해산', onClick: () => leaveFlow(g, api) }),
      ]));
    }
    if (r.history.length) {
      root.appendChild(el('div', { class: 'ui-section-title', style: { marginTop: '10px' }, text: '📒 최근 파티 기록' }));
      for (const h of r.history.slice(0, 5)) {
        const out = h.cleared ? '돌파' : h.reason === 'wipe' ? '전멸' : '귀환';
        root.appendChild(el('div', { class: 'rm-hist', text: `${h.day}일차 · ${h.floor}층 ${out} · ${h.kind === 'joined' ? `${h.leaderName}님 파티${h.bonusGold ? ` · 🪙 +${h.bonusGold}` : ''}` : `내 모집 파티 ${h.count}명`}` }));
      }
    }
    startLive(root, (events) => { if (events.some((e) => e.type === 'apply_result')) return; });
  }
  async function leaveFlow(g, api) {
    const r = R().ensure(g);
    const yes = await api.confirm(r.joined ? `${r.joined.leaderName}님 파티에서 탈퇴할까요?\n돌파 보상은 받을 수 없어요.` : '모은 파티를 해산할까요?\n게시료는 돌려받지 못해요.', { ok: r.joined ? '탈퇴' : '해산', cancel: '그만두기' });
    if (!yes) return;
    const res = R().leave(g);
    if (res.ok) { save(); api.toast(res.kind === 'joined' ? '파티에서 탈퇴했어요' : '파티를 해산했어요'); }
    api.refresh();
  }

  function applicantCard(g, a, api, rerender) {
    const m = a.member;
    return el('div', { class: 'rc-app' }, [
      PartyUI.portrait(m, true),
      el('div', { class: 'mid' }, [
        el('div', { class: 'nm' }, [m.name, el('small', { text: `Lv.${m.level}` }), el('span', { class: 'pu-role', style: { background: COLOR[m.role] }, text: `${ICON[m.role]} ${SHORT[m.role]}` }), el('small', { text: className(m.cls) })]),
        el('div', { class: 'msg', text: `“${a.msg}”` }),
      ]),
      el('div', { class: 'bt' }, [
        el('button', { class: 'btn primary', 'data-accept': a.id, text: '수락', onClick: () => {
          const res = R().acceptApplicant(g, a.id);
          if (!res.ok) { api.toast(res.reason === 'role_full' ? `${SHORT[m.role]} 자리는 다 찼어요` : '수락할 수 없어요'); return; }
          save(); api.toast(res.complete ? `✅ ${josa(m.name, '이/가')} 합류! 자리가 다 찼어요 — 모집 마감하고 출발하세요` : `✅ ${josa(m.name, '이/가')} 합류했어요`);
          rerender();
        } }),
        el('button', { class: 'btn ghost', text: '거절', onClick: () => { R().rejectApplicant(g, a.id); save(); rerender(); } }),
      ]),
    ]);
  }
  function renderPosting(root, params, api) {
    const g = G(), Rc = R(), ps = Rc.ensure(g).posting;
    const head = el('div'); root.appendChild(head);
    const apTitle = el('div', { class: 'ui-section-title' }); root.appendChild(apTitle);
    const list = el('div'); root.appendChild(list);
    const waitBox = el('div'); root.appendChild(waitBox);
    const foot = el('div'); root.appendChild(foot);
    const draw = () => {
      const cur = Rc.ensure(g).posting;
      if (!cur) { api.refresh(); return; }
      const need = Rc.remainingNeed(cur);
      head.innerHTML = '';
      const dots = [dot('healer', { me: true, title: '나 (리더)' })];
      for (const m of cur.accepted) dots.push(dot(m.role, { title: m.name }));
      for (const role of ROLES) for (let i = 0; i < need[role]; i++) dots.push(dot(role, { open: true }));
      head.appendChild(el('div', { class: 'rm-card' }, [
        el('h4', {}, [el('span', { class: 'adv-fl', style: { background: '#e39a3b' }, text: `${cur.floor}층` }), '📣 내 모집글']),
        el('div', { class: 'sub' }, [cur.title, ' · ', el('span', { 'data-t': String(cur.createdAt), text: Rc.ago(cur.createdAt) }), ` · 게시료 ${UI.gold(cur.fee)}`]),
        el('div', { class: 'rc-slots' }, dots.concat([el('span', { class: 'rc-cnt', text: `수락 ${cur.accepted.length} / ${Rc.slotTotal(cur.slots)}` })])),
      ]));
      apTitle.textContent = `📮 지원자 ${cur.applicants.length}명`;
      syncList(list, cur.applicants, (a) => a.id, (a) => `${a.id}`, (a) => applicantCard(g, a, api, draw));
      waitBox.innerHTML = '';
      const left = Rc.slotTotal(need);
      if (left && !cur.applicants.length) waitBox.appendChild(el('div', { class: 'rm-waiting' }, ['지원자를 기다리는 중', el('i', { text: ' · · ·' })]));
      if (!left) waitBox.appendChild(el('div', { class: 'pu-ok', text: '모든 자리가 찼어요! 모집 마감을 누르고 출발하세요.' }));
      foot.innerHTML = '';
      foot.appendChild(el('div', { class: 'rm-foot' }, [
        el('button', { class: 'btn primary', 'data-close': '1', disabled: !cur.accepted.length, text: cur.accepted.length ? `모집 마감 (${cur.accepted.length}명)` : '모집 마감', onClick: () => {
          const res = Rc.closePosting(g);
          if (!res.ok) { api.toast('수락한 파티원이 한 명은 있어야 해요'); return; }
          save(); api.toast(`🎉 파티 결성! ${res.count}명과 함께 ${res.floor}층으로 — 성문에서 출발하세요`, 3000); api.refresh();
        } }),
        el('button', { class: 'btn danger', text: `취소 · 환불 ${Math.floor(cur.fee * Rc.REFUND)}`, onClick: async () => {
          const yes = await api.confirm(`모집을 취소할까요?\n게시료의 절반(${UI.gold(Math.floor(cur.fee * Rc.REFUND))})만 돌려받아요.`, { ok: '취소하기', cancel: '계속 모집' });
          if (!yes) return;
          const res = Rc.cancelPosting(g);
          if (res.ok) { save(); api.toast(`모집을 취소했어요 (${UI.gold(res.refund)} 환불)`); }
          api.refresh();
        } }),
      ]));
    };
    draw();
    let lastN = ps.applicants.length;
    startLive(root, (events) => {
      for (const n of head.querySelectorAll('[data-t]')) n.textContent = Rc.ago(+n.dataset.t);
      const cur = Rc.ensure(g).posting;
      if (events.some((e) => e.type === 'applicant') || (cur && cur.applicants.length !== lastN)) { draw(); lastN = cur ? cur.applicants.length : 0; }
    });
  }

  // ---------------- 의뢰 게시판 ----------------
  function rewardChips(rw) {
    const out = [];
    if (rw.gold) out.push(el('span', { text: UI.gold(rw.gold) }));
    if (rw.xp) out.push(el('span', { class: 'xp', text: `✨ 경험치 ${rw.xp}` }));
    if (rw.gems) out.push(el('span', { text: `💎 ${rw.gems}` }));
    for (const it of rw.items || []) {
      let label, grade = it.grade || 'common';
      if (it.id) { const d = Items.get(it.id); label = `${(d && d.icon) || '📦'} ${(d && d.name) || it.id}${it.qty > 1 ? ` ×${it.qty}` : ''}`; }
      else {
        // id 없는 보상은 수주 시점에 생성되는 사제 장비라 부위·등급만 미리 알려 준다
        const setName = it.setId && Items.SETS && Items.SETS[it.setId] ? ` (${Items.SETS[it.setId].name})` : '';
        label = `🎁 ${Items.gradeName(grade)} ${UI.SLOT_NAMES[it.slot] || '장비'}${setName}`;
      }
      out.push(el('span', { class: 'it', style: { borderLeftColor: PartyUI.gradeColor(grade) }, text: label }));
    }
    return el('div', { class: 'adv-rw' }, out);
  }
  function renderQuests(root, params, api) {
    const g = G();
    root.appendChild(back(params, api));
    const list = A().board(g);
    const activeVillage = (Quests.active(g) || []).filter((q) => q.type === 'village').length;
    root.appendChild(el('div', { class: 'pu-hint', text: `마을 사람들의 의뢰예요. 진행 중인 의뢰 ${activeVillage}개 · 진행 상황은 퀘스트 창에서 볼 수 있어요.` }));
    if (!list.length) { root.appendChild(UI.empty('지금 받을 수 있는 의뢰가 없어요. 탑을 더 오르면 새 의뢰가 붙어요.')); return; }
    for (const d of list) {
      const giver = typeof Dialogue !== 'undefined' && Dialogue.name ? Dialogue.name(d.giver) : d.giver;
      const floor = d.floor || (d.requires && d.requires.floor) || (d.objectives.find((o) => o.floor) || {}).floor;
      root.appendChild(el('div', { class: 'adv-q' }, [
        el('h4', {}, [floor ? el('span', { class: 'adv-fl', text: `${floor}층` }) : null, d.title]),
        el('div', { class: 'giver', text: `의뢰인 · ${giver}` }),
        d.text && d.text.offer ? el('div', { class: 'offer', text: d.text.offer }) : null,
        el('ul', {}, d.objectives.map((o) => el('li', { text: `${Quests.objectiveLabel(o)}${o.count > 1 || o.amount ? ` (${o.count || o.amount})` : ''}` }))),
        el('div', { class: 'foot' }, [rewardChips(d.rewards || {}), el('button', { class: 'btn primary', text: '수락', onClick: () => accept(api, d) })]),
      ]));
    }
  }
  function accept(api, d) {
    const g = G();
    if (Quests.accept(g, d.id)) { save(); api.toast(`의뢰 "${d.title}" 수락!`); }
    else api.toast('이 의뢰는 지금 받을 수 없어요');
    api.refresh();
  }

  const VIEWS = { find: renderFind, post: renderPost, mine: renderMine, quests: renderQuests };
  const TITLES = { find: '파티 찾기', post: '파티원 모집', mine: '내 파티 / 모집 현황', quests: '의뢰 게시판' };
  // 예전 탭 이름(tab: 'hire'|'party'|'board')으로 열어도 맞는 화면으로
  const LEGACY = { hire: 'find', party: 'mine', board: 'quests' };

  UI.register('adventurer', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.adventurer : '모험가 사무소'),
    render(root, params, api) {
      PartyUI.injectStyle(); injectStyle();
      if (params.tab && !params.view) { params.view = LEGACY[params.tab] || null; params.tab = null; }
      liveFn = null;
      const g = G();
      if (!R()) { root.appendChild(UI.empty('게시판을 불러올 수 없어요')); return; }
      R().tick(g);
      api.setTitle(`${typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.adventurer : '모험가 사무소'}${params.view ? ' · ' + TITLES[params.view] : ''}`);
      root.appendChild(topBar(g));
      (VIEWS[params.view] || renderHome)(root, params, api);
    },
    onClose() { if (timer) clearInterval(timer); timer = null; liveFn = null; },
  });

  return { pump, syncList };
})();
if (typeof module !== 'undefined') module.exports = RecruitUI;
