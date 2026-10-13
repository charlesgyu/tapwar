// 층 결과 화면 — 던전 씬이 돌파/전멸 때 UI.open('result', params) 로 연다.
// params: { floor, outcome: 'cleared'|'wipe'|'escape', time, steps, kills, chests, xp, gold, items:[inst], levelUps:[{name, level, isPlayer, newSkills}], summary? (Floor.leave 결과) }
// "마을로" 는 결과창을 닫고 마을 씬으로 보낸다(던전 씬도 ui_close 를 듣고 마을로 보내므로 이미 마을이면 다시 가지 않는다).
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
  const OUTCOME = {
    cleared: { icon: '🏆', title: (f) => `${f}층 돌파!`, cls: 'win', line: '보스를 쓰러뜨리고 출구에 닿았어요.' },
    wipe: { icon: '💫', title: () => '전멸…', cls: 'lose', line: '파티가 쓰러져 마을로 실려 왔어요.' },
    escape: { icon: '🏃', title: () => '귀환', cls: 'esc', line: '탐험을 멈추고 마을로 돌아왔어요.' },
  };
  const outcomeOf = (p) => OUTCOME[p && p.outcome] || OUTCOME.escape;

  function injectStyle() {
    K.injectStyle();
    if (document.getElementById('ui-rs-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-rs-style';
    s.textContent = `
.rs-ban { position:relative; text-align:center; padding:14px 10px 12px; border-radius:14px; margin-bottom:10px; color:#fff; overflow:hidden; }
.rs-ban.win { background:linear-gradient(160deg,#f6c34a,#d98a2a); box-shadow:inset 0 -4px 0 rgba(0,0,0,0.15); }
.rs-ban.lose { background:linear-gradient(160deg,#7a6a9a,#4a3a6a); box-shadow:inset 0 -4px 0 rgba(0,0,0,0.2); }
.rs-ban.esc { background:linear-gradient(160deg,#8ab0c8,#5a7a9a); box-shadow:inset 0 -4px 0 rgba(0,0,0,0.15); }
.rs-ban .ic { font-size:44px; line-height:1; animation:rs-pop 0.4s ease-out; }
.rs-ban h2 { margin:4px 0 0; font-size:24px; font-weight:900; text-shadow:0 2px 0 rgba(0,0,0,0.25); }
.rs-ban .ch { font-size:12.5px; font-weight:800; opacity:0.92; margin-top:2px; }
.rs-ban .ln { font-size:12px; opacity:0.9; margin-top:4px; }
.rs-ban .rec { display:inline-block; margin-top:6px; font-size:11px; font-weight:900; padding:2px 8px; border-radius:10px; background:rgba(255,255,255,0.28); }
.rs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:8px; }
.rs-grid div { background:#fff; border:2px solid #e3d8c3; border-radius:10px; padding:6px 4px; text-align:center; }
.rs-grid b { display:block; font-size:17px; font-weight:900; color:#2a2020; font-variant-numeric:tabular-nums; }
.rs-grid small { font-size:11px; font-weight:800; color:#8a7a6a; }
.rs-grid .xp b { color:#b0741a; } .rs-grid .gold b { color:#7a5a1a; }
.rs-notes { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; }
.rs-note { font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:10px; background:#f3eee4; color:#6a5a4a; border:1px solid #e0d4bf; }
.rs-note.warn { background:#fde6e4; color:#a03a34; border-color:#e8a8a2; }
.rs-note.ok { background:#e8f5e0; color:#2f6b2f; border-color:#b5d9a2; }
.rs-lv { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:10px; background:#fff8e0; border:2px solid #f0d68a; margin-bottom:5px; font-size:13px; font-weight:800; }
.rs-lv .up { color:#c07a10; font-weight:900; margin-left:auto; white-space:nowrap; }
.rs-lv small { display:block; font-size:11px; color:#7a6a3a; font-weight:700; }
.rs-items { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
.rs-it { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; min-height:76px; padding:6px 3px 5px; background:#fff; border:2px solid #d9cdb5; border-radius:10px; font-family:inherit; }
.rs-it .ic { font-size:26px; line-height:1.1; }
.rs-it .q { position:absolute; right:4px; top:3px; font-size:11px; font-weight:900; color:#5a4a3a; }
.rs-it .nm { font-size:10.5px; font-weight:800; line-height:1.25; text-align:center; word-break:keep-all; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.rs-more { text-align:center; font-size:12px; color:#8a7a6a; font-weight:800; padding:4px; }
.rs-foot { position:sticky; bottom:-10px; margin:10px -12px -10px; padding:10px 12px 12px; background:#fbf6ea; border-top:2px solid #e3d8c3; display:flex; gap:8px; }
.rs-foot .btn { min-height:52px; font-size:16px; }
.rs-foot .btn.primary { flex:2; } .rs-foot .btn.ghost { flex:1; }
@keyframes rs-pop { 0% { transform:scale(0.3); opacity:0; } 70% { transform:scale(1.15); } 100% { transform:scale(1); opacity:1; } }
`;
    document.head.appendChild(s);
  }

  const num = (n) => Math.floor(n || 0).toLocaleString('ko-KR');
  function chapterTitle(floor) {
    try { const ch = typeof Story !== 'undefined' && (Story.chapter ? Story.chapter(floor) : Story.forFloor(floor)); return ch && ch.title ? `${ch.n || floor}장 · ${ch.title}` : ''; } catch (e) { return ''; }
  }
  // 같은 아이템(소모품·재료)은 한 줄로 합치고, 등급 높은 것부터 보여 준다
  function groupItems(items) {
    const map = new Map();
    for (const inst of items || []) {
      if (!inst || !inst.id) continue;
      const d = K.def(inst);
      const stack = d && Items.isStackable && Items.isStackable(d);
      const key = stack ? inst.id : inst.uid || Math.random();
      if (map.has(key)) map.get(key).qty += inst.qty || 1;
      else map.set(key, Object.assign({}, inst, { qty: inst.qty || 1 }));
    }
    const gi = (it) => (Items.gradeIndex ? Items.gradeIndex(it.grade) : 0);
    return Array.from(map.values()).sort((a, b) => gi(b) - gi(a));
  }
  // 레벨업 기록은 레벨마다 쌓일 수 있어 사람별 최종 레벨로 합친다
  function groupLevels(list) {
    const by = new Map();
    for (const l of list || []) {
      const k = l.name || '?';
      const cur = by.get(k) || { name: k, level: 0, isPlayer: !!l.isPlayer, newSkills: [] };
      cur.level = Math.max(cur.level, l.level || 0); cur.isPlayer = cur.isPlayer || !!l.isPlayer;
      cur.newSkills = cur.newSkills.concat(l.newSkills || []);
      by.set(k, cur);
    }
    return Array.from(by.values()).sort((a, b) => b.isPlayer - a.isPlayer);
  }

  // 아이템 타일: 한눈에 여러 개를 보이게 아이콘+이름만, 누르면 상세(능력치) 토스트
  function itemTile(api, inst) {
    const d = K.def(inst) || { name: inst.id, icon: '📦' };
    const g = inst.grade || 'common';
    const stats = Items.statsOf ? Object.entries(Items.statsOf(inst)).map(([k, v]) => `${UI.STAT_NAMES[k] || k} +${v}`) : [];
    for (const a of inst.affixes || []) stats.push(Items.affixText ? Items.affixText(a) : `${a.stat} +${a.value}`);
    return el('button', { class: 'rs-it', style: { borderColor: K.edge(g) }, onClick: () => api.toast(`${K.grade(g).name} ${d.name}${stats.length ? ' · ' + stats.join(', ') : (d.desc ? ' · ' + d.desc : '')}`, 2600) }, [
      el('span', { class: 'ic', text: d.icon || '📦' }),
      (inst.qty || 1) > 1 ? el('span', { class: 'q', text: '×' + inst.qty }) : null,
      el('span', { class: 'nm', style: { color: K.ink(g) }, text: d.name }),
    ]);
  }

  function goTown(api) {
    api.close();
    if (typeof Scenes !== 'undefined' && Scenes.name && Scenes.name() !== 'town') Scenes.go('town');
  }

  UI.register('result', {
    // 큰 제목은 배너가 맡으므로 머리줄은 층 번호만
    title: (p) => `${(p && p.floor) || 1}층 탐험 결과`,
    modal: true,
    render(root, params, api) {
      injectStyle();
      root.classList.add('hk-root');
      const p = params || {}, sum = p.summary || {}, o = outcomeOf(p), floor = p.floor || sum.floor || 1;
      const time = p.time != null ? p.time : sum.time;
      const rec = sum.record || null;
      const best = p.outcome === 'cleared' && rec && rec.bestTime != null && Math.abs(rec.bestTime - time) < 0.05;
      root.appendChild(el('div', { class: 'rs-ban ' + o.cls }, [
        el('div', { class: 'ic', text: o.icon }),
        el('h2', { text: o.title(floor) }),
        chapterTitle(floor) ? el('div', { class: 'ch', text: chapterTitle(floor) }) : null,
        el('div', { class: 'ln', text: o.line }),
        best ? el('span', { class: 'rec', text: rec.clears > 1 ? '⏱ 최고 기록 갱신!' : '⏱ 첫 돌파 기록' }) : (rec && rec.bestTime != null && p.outcome === 'cleared' ? el('span', { class: 'rec', text: `최고 기록 ${K.time(rec.bestTime)}` }) : null),
      ]));
      const cells = [
        ['⏱', '시간', K.time(time), ''], ['👣', '걸음', num(p.steps != null ? p.steps : sum.steps), ''], ['⚔️', '처치', num(p.kills != null ? p.kills : sum.kills), ''],
        ['📦', '상자', num(p.chests != null ? p.chests : sum.chests), ''], ['⭐', '경험치', '+' + num(p.xp), 'xp'], ['🪙', '골드', '+' + num(p.gold), 'gold'],
      ];
      root.appendChild(el('div', { class: 'rs-grid' }, cells.map(([i, k, v, c]) => el('div', { class: c }, [el('b', { text: v }), el('small', { text: `${i} ${k}` })]))));
      // 부가 정보: 무엇을 잃고 얻었는지(피로·내구도·보스 보너스)를 숨기지 않는다
      const notes = [];
      if (sum.xpBonus) notes.push(['ok', `보스 보너스 경험치 +${num(sum.xpBonus)}`]);
      if (sum.fatigueGained) notes.push(['', `피로 +${Math.round(sum.fatigueGained)}`]);
      if (p.outcome === 'wipe') notes.push(['warn', '장비 내구도 -20%']);
      if (sum.memberDeaths) notes.push(['warn', `동료가 ${sum.memberDeaths}번 쓰러졌어요`]);
      if (sum.playerDeaths) notes.push(['warn', `${(State.get().player || {}).name || '리프'}가 ${sum.playerDeaths}번 쓰러졌어요`]);
      if (p.outcome === 'cleared' && floor < 10) notes.push(['ok', `${floor + 1}층 도전 가능`]);
      if (notes.length) root.appendChild(el('div', { class: 'rs-notes' }, notes.map(([c, t]) => el('span', { class: 'rs-note ' + c, text: t }))));
      const lvs = groupLevels(p.levelUps);
      if (lvs.length) root.appendChild(UI.section('🎉 레벨 업', lvs.map((l) => el('div', { class: 'rs-lv' }, [
        el('div', {}, [l.name + (l.isPlayer ? ' (나)' : ''), l.newSkills.length ? el('small', { text: '새 기도: ' + l.newSkills.map((id) => ((typeof Skills !== 'undefined' && Skills.get(id)) || {}).name || id).join(', ') }) : null]),
        el('span', { class: 'up', text: `Lv.${l.level} ▲` }),
      ]))));
      if (lvs.some((l) => l.isPlayer)) root.appendChild(el('div', { class: 'hk-hint', text: '스탯 포인트를 얻었어요 — 상태 화면에서 분배하세요.' }));
      const items = groupItems(p.items);
      const SHOW = 12;
      root.appendChild(UI.section(`🎁 얻은 물건 ${items.length ? items.length + '종' : ''}`, items.length
        ? [el('div', { class: 'rs-items' }, items.slice(0, SHOW).map((it) => itemTile(api, it)))].concat(items.length > SHOW ? [el('div', { class: 'rs-more', text: `외 ${items.length - SHOW}종 — 가방에서 확인하세요` })] : [])
        : [UI.empty(p.outcome === 'wipe' ? '이번엔 건진 물건이 없어요.' : '얻은 물건이 없어요.')]));
      if (p.outcome === 'wipe') root.appendChild(el('div', { class: 'hk-hint', text: '💡 대장간에서 장비를 수리하고, 여관에서 피로를 풀고, 벨트에 포션을 걸어 두면 훨씬 버티기 쉬워요.' }));
      root.appendChild(el('div', { class: 'rs-foot' }, [
        items.length ? el('button', { class: 'btn ghost', text: '🎒 가방', onClick: () => UI.open('inventory') }) : null,
        el('button', { class: 'btn primary', text: '마을로', onClick: () => goTown(api) }),
      ]));
    },
  });
})();
