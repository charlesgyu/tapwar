// 상태 화면 — WoW 풍 캐릭터 시트(가운데 초상 + 양옆 장비 칸 + 아이템 레벨·능력치·강화 수치) 와 스탯 분배·스킬·설정 탭.
// 장비 칸을 누르면 아래에서 선택 창이 올라와 가방 속 그 칸용 장비를 비교(▲▼)하고 바로 바꿔 낀다. 스타일은 css/status.css.
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
  const G = () => State.get();
  // ---- 탭: 캐릭터(장비 시트·능력치) | 스탯 분배 | 스킬 | 설정 ----
  const TABS = [
    { id: 'char', label: '캐릭터' },
    { id: 'alloc', label: '스탯 분배' },
    { id: 'skill', label: '스킬' },
    { id: 'opt', label: '설정' },
  ];
  // 장비 칸 배치: 초상 왼쪽 5칸 · 오른쪽 5칸 · 아래 무기 2칸
  const LEFT = ['hat', 'neck', 'ear', 'body', 'belt'];
  const RIGHT = ['gloves', 'boots', 'ring1', 'ring2', 'bag'];
  const WEAPONS = ['main', 'off'];
  const SLOT_LABEL = { hat: '모자', neck: '목걸이', ear: '귀걸이', bag: '가방', main: '주무기', body: '옷', off: '보조', belt: '벨트', gloves: '장갑', ring1: '반지 1', ring2: '반지 2', boots: '장화' };
  const SLOT_GHOST = { hat: '🎩', neck: '📿', ear: '🧿', bag: '🎒', main: '🪄', body: '👕', off: '📖', belt: '🪢', gloves: '🧤', ring1: '💍', ring2: '💍', boots: '👢' };
  const DIRS = ['down', 'left', 'up', 'right'];
  const ZOOMS = [3, 4, 5, 6];
  // 교체 비교에 쓰는 파생 수치 [키, 이름, 소수 자리, 단위]
  const COMPARE = [
    ['int', '지능', 0], ['vit', '체력', 0], ['def', '방어도', 0], ['healPower', '치유력', 1], ['maxHp', '최대 HP', 0], ['maxMp', '최대 MP', 0],
    ['mpRegen', '마나 회복', 2], ['crit', '치명타', 1, '%'], ['evasion', '회피', 1, '%'], ['moveSpeed', '이동', 0],
  ];
  const STAT_INFO = {
    int: { icon: '🔮', name: '지능', per: '치유력 +1.6 · 최대 MP +9' },
    vit: { icon: '❤️', name: '체력', per: '최대 HP +12' },
    sta: { icon: '🥾', name: '지구력', per: '피로 증가 약 -2%' },
    agi: { icon: '💨', name: '민첩', per: '회피 +0.4% · 치명 +0.25%' },
    def: { icon: '🛡️', name: '방어력', per: '받는 피해 감소' },
    str: { icon: '💪', name: '힘', per: '공격력 +2' },
  };
  const STAT_ORDER = ['int', 'vit', 'sta', 'agi', 'def', 'str'];
  const SINGLE = ['heal_basic', 'heal_fast', 'heal_instant'];
  const AOE = ['aoe_2', 'aoe_3', 'aoe_ground'];
  const SETTINGS = [
    { key: 'autoHeal', name: '자동 힐', desc: 'HP가 낮은 파티원을 알아서 치유해요. 끄면 직접 눌러야 해요.' },
    { key: 'autoDodge', name: '자동 회피', desc: '붉은 장판이 깔리면 알아서 피해요.' },
    { key: 'autoFollow', name: '자동 따라가기', desc: '조작하지 않을 때 파티 뒤를 따라 걸어요.' },
  ];

  function injectStyle() {
    K.injectStyle();
    // css/status.css 가 index.html 에 링크돼 있지 않은 환경(옛 페이지 등)을 위해 한 번만 붙인다
    if (document.querySelector('link[href*="status.css"]') || document.getElementById('ui-st-css')) return;
    let has = false;
    try { for (const sh of document.styleSheets) { const rules = sh.cssRules || []; for (const r of rules) if (r.selectorText && r.selectorText.indexOf('.stw-') >= 0) { has = true; break; } if (has) break; } } catch (e) { /* 교차 출처 시트 */ }
    if (has) return;
    const l = document.createElement('link'); l.id = 'ui-st-css'; l.rel = 'stylesheet'; l.href = 'css/status.css';
    document.head.appendChild(l);
  }

  // ---- 숫자 도우미 ----
  const ilvOf = (inst) => (inst && typeof Items !== 'undefined' && Items.itemLevel ? Items.itemLevel(inst) : 0);
  const gColor = (g) => (!g || g === 'common' ? '#d8d8d8' : K.grade(g).color);
  const num = (v) => Math.round(v || 0).toLocaleString('ko-KR');
  const pct = (v) => `${Math.round((v || 0) * 10) / 10}%`;
  function avgItemLevel(eq) {
    const list = Object.values(eq || {}).filter(Boolean);
    if (!list.length) return { avg: 0, n: 0 };
    return { avg: list.reduce((s, it) => s + ilvOf(it), 0) / list.length, n: list.length };
  }
  // 힐량 증가 %: healPower = int×1.6×(1+heal_power%)×피로 → 역산(접사·기본 스탯·각인 합)
  function healBonusPct(d) {
    const base = (d.int || 0) * 1.6 * (d.fatigueMult || 1);
    return base > 0 ? Math.max(0, (d.healPower / base - 1) * 100) : 0;
  }
  function statsLine(inst) {
    const out = [];
    const st = Items.statsOf ? Items.statsOf(inst) : {};
    for (const [k, v] of Object.entries(st)) out.push(`${(Stats.NAMES && Stats.NAMES[k]) || UI.STAT_NAMES[k] || k} +${v}`);
    for (const a of inst.affixes || []) out.push(Items.affixText(a));
    return out.join(' · ');
  }

  // ---- 초상: 저해상도 픽셀 배경 + 정수 배율 캐릭터 ----
  function drawPortrait(cv, view) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    cv.width = w * dpr; cv.height = h * dpr;
    const x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    // 배경은 4px 도트로 그린 뒤 확대한다(해 질 녘 숲 언덕 — 레퍼런스의 흐린 배경 느낌)
    const P = 4, lw = Math.ceil(w / P), lh = Math.ceil(h / P);
    const bg = document.createElement('canvas'); bg.width = lw; bg.height = lh;
    const b = bg.getContext('2d');
    const sky = ['#1c1426', '#2a1a32', '#3d2236', '#5a2e38', '#7a4034', '#93522e'];
    const horizon = Math.round(lh * 0.62);
    for (let y = 0; y < horizon; y++) {
      const t = y / horizon * (sky.length - 1), i = Math.floor(t), f = t - i;
      for (let xx = 0; xx < lw; xx++) {
        // 두 색 사이를 체크 무늬 디더로 섞는다
        const dither = ((xx + y) & 1) ? 0.66 : 0.33;
        b.fillStyle = sky[Math.min(sky.length - 1, i + (f > dither ? 1 : 0))];
        b.fillRect(xx, y, 1, 1);
      }
    }
    // 별(결정적 위치)
    b.fillStyle = '#e8d8ff';
    for (let s = 0; s < 14; s++) { const sx = (s * 37 + 11) % lw, sy = (s * 23 + 5) % Math.max(1, Math.round(horizon * 0.5)); b.fillRect(sx, sy, 1, 1); }
    // 달
    b.fillStyle = '#f6e6b0'; b.fillRect(lw - 14, 7, 4, 4); b.fillRect(lw - 15, 8, 6, 2); b.fillStyle = '#2a1a32'; b.fillRect(lw - 12, 7, 2, 2);
    // 먼 언덕·가까운 나무 실루엣
    const ridge = (base, amp, freq, phase, col) => {
      b.fillStyle = col;
      for (let xx = 0; xx < lw; xx++) { const y = Math.round(base - amp * (0.5 + 0.5 * Math.sin(xx * freq + phase)) - (xx % 5 === 0 ? 1 : 0)); b.fillRect(xx, y, 1, lh - y); }
    };
    ridge(horizon, 6, 0.11, 1.3, '#3a2236');
    ridge(horizon + 3, 4, 0.19, 0.2, '#2a1a2a');
    b.fillStyle = '#1a1220';
    for (const tx of [3, 9, lw - 8, lw - 3]) { for (let k = 0; k < 7; k++) b.fillRect(tx - (k >> 1), horizon - 10 + k, 1 + (k >> 1) * 2, 1); b.fillRect(tx, horizon - 3, 1, 4); }
    // 땅: 어두운 풀밭 + 가운데 빛 웅덩이
    for (let y = horizon + 3; y < lh; y++) for (let xx = 0; xx < lw; xx++) {
      const dx = (xx - lw / 2) / (lw * 0.42), dy = (y - (lh - 6)) / 6;
      const lit = dx * dx + dy * dy < 1;
      b.fillStyle = lit ? (((xx + y) & 1) ? '#4a5a2c' : '#55663a') : (((xx * 3 + y) % 5) ? '#1e2416' : '#262e1a');
      b.fillRect(xx, y, 1, 1);
    }
    x.drawImage(bg, 0, 0, lw * P * dpr, lh * P * dpr);
    // 가장자리를 어둡게(비네트)
    const vg = x.createRadialGradient(cv.width / 2, cv.height * 0.6, cv.height * 0.2, cv.width / 2, cv.height * 0.6, cv.height * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = vg; x.fillRect(0, 0, cv.width, cv.height);
    // 캐릭터
    let frame = null;
    try { const s = typeof Sprites !== 'undefined' ? Sprites.get('player') : null; frame = s && s[DIRS[view.dir]] ? s[DIRS[view.dir]][0] : null; } catch (e) { frame = null; }
    const sc = ZOOMS[view.zoom] * dpr;
    const groundY = Math.round(h * dpr - 14 * dpr);
    if (frame) {
      const fw = frame.width * sc, fh = frame.height * sc;
      const fx = Math.round(cv.width / 2 - fw / 2), fy = groundY - fh;
      // 발밑 그림자(도트 타원)
      x.fillStyle = 'rgba(0,0,0,0.45)';
      const sw = 18 * sc / 2, shh = Math.max(2, Math.round(sc * 1.5));
      x.fillRect(Math.round(cv.width / 2 - sw / 2), groundY - shh, Math.round(sw), shh * 2);
      x.fillRect(Math.round(cv.width / 2 - sw / 2 - sc * 2), groundY - shh + sc, Math.round(sw + sc * 4), Math.max(1, shh * 2 - sc * 2));
      x.drawImage(frame, fx, fy, fw, fh);
    } else {
      x.font = `${80 * dpr}px sans-serif`; x.textAlign = 'center'; x.fillText('🧝', cv.width / 2, groundY);
    }
  }

  function slotBtn(api, g, slot, opts = {}) {
    const inst = g.player.equipment[slot], d = K.def(inst);
    const kids = [el('span', { class: 'ic', text: d ? (d.icon || '📦') : SLOT_GHOST[slot] })];
    if (!d) kids.push(el('span', { class: 'lb', text: SLOT_LABEL[slot] }));
    if (inst && typeof inst.durability === 'number' && inst.maxDurability && inst.durability <= inst.maxDurability * 0.2) kids.push(el('span', { class: 'warn', text: inst.durability <= 0 ? '💥' : '⚠️' }));
    if (d && !opts.noIlv) kids.push(el('span', { class: 'stw-ilv', style: { color: gColor(inst.grade) }, text: String(ilvOf(inst)) }));
    const b = el('button', {
      class: 'stw-slot' + (d ? ' g-' + (inst.grade || 'common') : ' empty'),
      'aria-label': `${SLOT_LABEL[slot]}: ${d ? d.name : '비어 있음'}`,
      onClick: () => openSlotSheet(api, slot),
    }, kids);
    if (d) b.style.borderColor = gColor(inst.grade);
    return b;
  }

  function charTab(api, g, d, pane) {
    const p = g.player, pr = Level.progress(p);
    const view = api.params.view || (api.params.view = { dir: 0, zoom: 2 });
    pane.appendChild(el('div', { class: 'stw-title', text: `Lv.${pr.level} 사제 ${p.name}` }));
    const xp = el('div', { class: 'stw-xp', 'aria-label': '경험치' }, [
      el('i', { style: { width: (pr.max ? 100 : Math.max(0, Math.min(100, (pr.pct || 0) * 100))) + '%' } }),
      el('span', { text: pr.max ? '최대 레벨' : `경험치 ${num(pr.xp)} / ${num(pr.need)}` }),
    ]);
    pane.appendChild(xp);

    const cv = el('canvas');
    const redraw = () => drawPortrait(cv, view);
    const ctrl = (txt, aria, fn, dis) => el('button', { text: txt, 'aria-label': aria, disabled: dis, onClick: (e) => { e.stopPropagation(); fn(); } });
    const ctrlBar = el('div', { class: 'stw-ctrl' });
    const fillCtrl = () => {
      ctrlBar.innerHTML = '';
      ctrlBar.appendChild(ctrl('＋', '확대', () => { view.zoom = Math.min(ZOOMS.length - 1, view.zoom + 1); fillCtrl(); redraw(); }, view.zoom >= ZOOMS.length - 1));
      ctrlBar.appendChild(ctrl('－', '축소', () => { view.zoom = Math.max(0, view.zoom - 1); fillCtrl(); redraw(); }, view.zoom <= 0));
      ctrlBar.appendChild(ctrl('↺', '왼쪽으로 돌리기', () => { view.dir = (view.dir + 1) % 4; redraw(); }));
      ctrlBar.appendChild(ctrl('↻', '오른쪽으로 돌리기', () => { view.dir = (view.dir + 3) % 4; redraw(); }));
    };
    fillCtrl();
    const port = el('div', { class: 'stw-port' }, [cv, ctrlBar]);
    pane.appendChild(el('div', { class: 'stw-sheet' }, [
      el('div', { class: 'stw-col l' }, LEFT.map((s) => slotBtn(api, g, s))),
      port,
      el('div', { class: 'stw-col r' }, RIGHT.map((s) => slotBtn(api, g, s))),
    ]));
    pane.appendChild(el('div', { class: 'stw-weap' }, WEAPONS.map((s) => {
      const inst = p.equipment[s];
      return el('div', { class: 'stw-wp' }, [
        el('span', { class: 'stw-ilv', style: { color: gColor(inst && inst.grade), visibility: inst ? 'visible' : 'hidden' }, text: inst ? String(ilvOf(inst)) : '0' }),
        slotBtn(api, g, s, { noIlv: true }),
      ]);
    })));
    pane.appendChild(el('div', { class: 'stw-tip', text: '칸을 누르면 가방의 장비로 바꿔 낄 수 있어요' }));
    // 레이아웃이 잡힌 뒤 크기를 재서 그린다
    requestAnimationFrame(redraw);
    setTimeout(redraw, 60);

    // ---- 능력치 패널 ----
    const il = avgItemLevel(p.equipment);
    pane.appendChild(el('div', { class: 'stw-h', text: '아이템 레벨' }));
    pane.appendChild(el('div', { class: 'stw-ilvl' }, [il.avg.toFixed(2), el('small', { text: `장착 ${il.n} / 12칸 평균` })]));
    const row = (k, v, cls) => el('div', { class: 'r' + (cls ? ' ' + cls : '') }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]);
    pane.appendChild(el('div', { class: 'stw-h', text: '능력치' }));
    pane.appendChild(el('div', { class: 'stw-rows' }, [
      row('지능:', num(d.int)), row('체력:', num(d.vit)), row('방어도:', num(d.def)),
      row('최대 생명력:', num(d.maxHp), 'sm'), row('최대 마나:', num(d.maxMp), 'sm'),
      row('힘:', num(d.str), 'sm'), row('민첩:', num(d.agi), 'sm'), row('지구력:', num(d.sta), 'sm'),
    ]));
    pane.appendChild(el('div', { class: 'stw-h', text: '강화 수치' }));
    pane.appendChild(el('div', { class: 'stw-rows' }, [
      row('치명타:', pct(d.crit)),
      row('시전 속도:', pct((1 / (d.castSpeed || 1) - 1) * 100)),
      row('마나 소비 감소:', pct((1 - (d.mpCostMult || 1)) * 100)),
      row('초당 마나 회복:', (Math.round(d.mpRegen * 100) / 100).toFixed(2)),
      row('힐량 증가:', pct(healBonusPct(d))),
      row('이동 속도:', pct((d.moveSpeed / 230 - 1) * 100)),
      row('회피:', pct(d.evasion)),
      row('치유력:', (Math.round(d.healPower * 10) / 10).toFixed(1), 'sm'),
    ]));
    // 세트 효과(있을 때만)
    const sets = (typeof Inventory !== 'undefined' && Inventory.activeSets ? Inventory.activeSets(g) : []).filter((s) => Items.SETS && Items.SETS[s.setId]);
    if (sets.length) {
      pane.appendChild(el('div', { class: 'stw-h', text: '세트 효과' }));
      const rows = [];
      for (const s of sets) {
        const def = Items.SETS[s.setId];
        rows.push(row(`${def.icon || ''} ${def.name} 세트`, `${s.count} / 5`));
        for (const bn of def.bonuses || []) rows.push(row(`${bn.pieces}세트`, bn.desc || '', 'sm set' + (s.count >= bn.pieces ? '' : ' off')));
      }
      pane.appendChild(el('div', { class: 'stw-rows' }, rows));
    }
  }

  // ---- 장비 칸 선택 창(아래에서 올라옴) ----
  let sheetEl = null;
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  // 그 칸에 끼울 때의 파생 수치(사본으로 계산, 실제 상태는 그대로)
  function simulate(g, inst, slot) {
    const d = K.def(inst); if (!d) return null;
    const p = g.player, eq = Object.assign({}, p.equipment);
    if (d.slot === 'main' && d.hands === 'two') eq.off = null;
    if (d.slot === 'off' && eq.main && (K.def(eq.main) || {}).hands === 'two') eq.main = null;
    eq[slot] = inst;
    try {
      const before = Stats.derive(Object.assign({}, p, { equipment: Object.assign({}, p.equipment) }), g);
      const after = Stats.derive(Object.assign({}, p, { equipment: eq }), g);
      return { before, after };
    } catch (e) { return null; }
  }
  function compareSpans(sim) {
    const out = [];
    for (const [k, name, dp, unit] of COMPARE) {
      const diff = (sim.after[k] || 0) - (sim.before[k] || 0);
      const shown = Math.round(diff * Math.pow(10, dp)) / Math.pow(10, dp);
      if (!shown) continue;
      out.push(el('span', { class: diff > 0 ? 'up' : 'dn', text: `${name} ${diff > 0 ? '▲' : '▼'}${Math.abs(shown)}${unit || ''}` }));
    }
    const cs = (sim.before.castSpeed || 1) / (sim.after.castSpeed || 1) - 1;
    if (Math.abs(cs) >= 0.005) out.push(el('span', { class: cs > 0 ? 'up' : 'dn', text: `시전 속도 ${cs > 0 ? '▲' : '▼'}${Math.round(Math.abs(cs) * 100)}%` }));
    if (!out.length) out.push(el('span', { class: 'eq', text: '능력치 변화 없음' }));
    return out;
  }
  function itemRow(inst, opts = {}) {
    const d = K.def(inst) || {}, col = gColor(inst.grade);
    const icon = el('span', { class: 'stw-slot g-' + (inst.grade || 'common'), style: { borderColor: col } }, [el('span', { class: 'ic', text: d.icon || '📦' })]);
    const sub = [K.grade(inst.grade).name, (Items.SLOT_NAMES && Items.SLOT_NAMES[d.slot]) || d.slot];
    if (d.hands === 'two') sub.push('양손');
    if (d.setId && Items.SETS && Items.SETS[d.setId]) sub.push(Items.SETS[d.setId].name + ' 세트');
    if (inst.maxDurability) sub.push(`내구 ${Math.round(inst.durability)}/${inst.maxDurability}`);
    const mid = el('div', { class: 'mid' }, [
      el('div', { class: 'nm', style: { color: col }, text: d.name || inst.id }),
      el('div', { class: 'sb', text: sub.join(' · ') }),
      el('div', { class: 'st', text: statsLine(inst) }),
      opts.cmp ? el('div', { class: 'cmp' }, opts.cmp) : null,
    ]);
    const ilv = ilvOf(inst);
    const ilBox = el('div', { class: 'il', style: { color: col } }, [String(ilv), el('small', { text: '아이템 레벨' }),
      opts.base != null && ilv !== opts.base ? el('span', { class: 'd', style: { color: ilv > opts.base ? '#4ade4a' : '#ff5a5a' }, text: `${ilv > opts.base ? '▲' : '▼'}${Math.abs(ilv - opts.base)}` }) : null]);
    const tag = opts.onClick ? 'button' : 'div';
    const r = el(tag, { class: 'stw-it' + (opts.cur ? ' cur' : ''), style: { borderLeftColor: col }, onClick: opts.onClick }, [icon, mid, ilBox]);
    return r;
  }
  function openSlotSheet(api, slot) {
    closeSheet();
    const g = G(), p = g.player, cur = p.equipment[slot];
    const want = slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
    const all = Inventory.items(g).filter((it) => { const d = K.def(it); return d && d.kind === 'equip' && d.slot === want; });
    const ok = [], bad = [];
    for (const it of all) (Inventory.canEquip(g, it).ok ? ok : bad).push(it);
    ok.sort((a, b) => ilvOf(b) - ilvOf(a) || K.grade(b.grade).mult - K.grade(a.grade).mult);
    const body = el('div', { class: 'stw-pop-b' });
    body.appendChild(el('div', { class: 'stw-lbl', text: '착용 중' }));
    if (cur) {
      body.appendChild(itemRow(cur, { cur: true }));
      body.appendChild(el('div', { class: 'stw-foot', style: { margin: '0 0 8px' } }, [
        el('button', { class: 'stw-btn alt', text: '해제 → 가방', onClick: () => {
          const name = (K.def(cur) || {}).name || '장비';
          const r = Inventory.unequip(g, slot);
          if (r && r.ok) { K.save(); api.toast(`${name} 해제 → 가방`); closeSheet(); api.refresh(); }
          else api.toast(r && r.reason === 'bag_full' ? '가방이 가득 차서 벗을 수 없어요' : K.reason(r));
        } }),
      ]));
    } else body.appendChild(el('div', { class: 'stw-empty', text: `${SLOT_LABEL[slot]} 칸이 비어 있어요` }));
    body.appendChild(el('div', { class: 'stw-lbl', text: `가방의 ${SLOT_LABEL[slot].replace(/ \d$/, '')} (${ok.length})` }));
    if (!ok.length) body.appendChild(el('div', { class: 'stw-empty', text: '가방에 장착할 수 있는 장비가 없어요' }));
    const base = cur ? ilvOf(cur) : null;
    for (const it of ok) {
      const sim = simulate(g, it, slot);
      const d = K.def(it) || {};
      body.appendChild(itemRow(it, {
        base: base == null ? 0 : base,
        cmp: sim ? compareSpans(sim) : null,
        onClick: () => {
          const r = Inventory.equip(g, it.uid, slot);
          if (r && r.ok) {
            K.save();
            const off = (r.unequipped || []).map((x) => (K.def(x) || {}).name).filter(Boolean);
            api.toast(`${d.name} 장착${off.length ? ` · ${off.join(', ')} → 가방` : ''}`);
            closeSheet(); api.refresh();
          } else api.toast(r && r.reason === 'bag_full' ? '가방에 빈칸이 없어 바꿀 수 없어요' : (r && r.reason === 'level' ? `레벨 ${d.levelReq || '?'} 이상이어야 해요` : K.reason(r)));
        },
      }));
    }
    if (bad.length) body.appendChild(el('div', { class: 'stw-note', text: `사제가 쓸 수 없는 장비 ${bad.length}개는 숨겼어요(판매·분해용).` }));
    if (want === 'main') body.appendChild(el('div', { class: 'stw-note', text: '양손 지팡이를 들면 보조 손(책)은 가방으로 돌아가요.' }));
    const pop = el('div', { class: 'stw-pop', role: 'dialog', 'aria-label': `${SLOT_LABEL[slot]} 장비 선택` }, [
      el('div', { class: 'stw-pop-h' }, [el('b', { text: `${SLOT_GHOST[slot]} ${SLOT_LABEL[slot]}` }), el('button', { class: 'x', text: '✕', 'aria-label': '닫기', onClick: closeSheet })]),
      body,
    ]);
    const ov = el('div', { class: 'ui-overlay top stw-ov', onClick: (e) => { if (e.target === ov) closeSheet(); } }, [pop]);
    (document.getElementById('ui-root') || document.body).appendChild(ov);
    sheetEl = ov;
  }

  // ---- 스탯 분배 탭 ----
  function allocate(api, g, stat, n) {
    const r = Level.allocate(g, stat, n);
    if (r && r.ok) { K.save(); api.toast(`${STAT_INFO[stat].name} +${n}`, 1200); }
    else api.toast(K.reason(r));
    api.refresh();
  }
  function allocTab(api, g, d, pane) {
    const p = g.player, pr = Level.progress(p), pts = p.statPoints || 0;
    pane.appendChild(el('div', { class: 'stw-prof' }, [
      el('div', { class: 'nm' }, [p.name, el('small', { text: `Lv.${pr.level} 사제${pr.max ? ' (MAX)' : ''}` })]),
      el('div', { class: 'stw-bl' }, [el('span', { text: 'XP' }), pr.max ? UI.bar(1, 1, 'xp') : UI.bar(pr.xp, pr.need, 'xp')]),
      el('div', { class: 'stw-bl' }, [el('span', { text: 'HP' }), UI.bar(Math.min(p.hp || 0, d.maxHp), d.maxHp, 'hp')]),
      el('div', { class: 'stw-bl' }, [el('span', { text: 'MP' }), UI.bar(Math.min(p.mp || 0, d.maxMp), d.maxMp, 'mp')]),
      el('div', { class: 'stw-bl' }, [el('span', { text: '피로' }), UI.bar(p.fatigue || 0, 100, 'fatigue')]),
    ]));
    pane.appendChild(el('div', { class: 'stw-pts' + (pts ? '' : ' zero') }, [el('span', { text: pts ? '분배할 스탯 포인트' : '레벨이 오르면 포인트 5개를 얻어요' }), el('b', { text: String(pts) })]));
    for (const k of STAT_ORDER) {
      const base = p.stats[k] || 0, total = Math.round(d[k] || 0), bonus = total - base, info = STAT_INFO[k];
      pane.appendChild(el('div', { class: 'stw-al' }, [
        el('div', { class: 'ic', text: info.icon }),
        el('div', { class: 'mid' }, [
          el('div', { class: 'n' }, [info.name, el('span', { class: 'v', text: String(total) }), bonus ? el('span', { class: 'eq', text: `(기본 ${base} ${bonus > 0 ? '+' : ''}${bonus})` }) : null]),
          el('div', { class: 'per', text: '1점당 ' + info.per }),
        ]),
        el('button', { class: 'stw-btn go', text: '+1', disabled: pts < 1, 'aria-label': `${info.name} 1 올리기`, onClick: () => allocate(api, g, k, 1) }),
        el('button', { class: 'stw-btn alt', text: '+5', disabled: pts < 5, 'aria-label': `${info.name} 5 올리기`, onClick: () => allocate(api, g, k, 5) }),
      ]));
    }
  }

  // ---- 스킬 탭 ----
  function skillOpt(api, g, id, slotKey, caster) {
    const d = Skills.get(id); if (!d) return null;
    const lv = Level.skillLevel(g, id), unlocked = lv > 0;
    const on = g.player.active && g.player.active[slotKey] === id;
    const ct = Skills.castTime(d, caster), mp = Skills.mpCost(d, caster), amt = Skills.healAmount(d, caster, Math.max(1, lv));
    const meta = [ct > 0 ? `시전 ${ct.toFixed(1)}초` : '즉시 시전', `MP ${mp}`];
    if (d.cooldown) meta.push(`쿨 ${d.cooldown}초`);
    const amount = d.type === 'ground_heal' ? `초당 ${amt} · ${d.duration || 6}초` : (d.targets > 1 ? `${amt} ×${d.targets}명` : `회복 ${amt}`);
    return el('button', {
      class: 'stw-opt' + (on ? ' on' : '') + (unlocked ? '' : ' lock'), 'aria-pressed': on ? 'true' : 'false',
      onClick: () => {
        if (!unlocked) { api.toast(`Lv.${d.unlockLevel}에 배워요`); return; }
        if (on) return;
        g.player.active = Object.assign({}, g.player.active, { [slotKey]: id });
        K.save(); api.toast(`${slotKey === 'single' ? '단일 힐' : '광역 힐'}: ${d.name}`, 1200); api.refresh();
      },
    }, [
      el('div', { class: 'n', text: (unlocked ? '' : '🔒 ') + d.name + (unlocked && lv > 1 ? ` Lv.${lv}` : '') }),
      el('div', { class: 'm', text: meta.join(' · ') }),
      el('div', { class: 'a', text: unlocked ? amount : `Lv.${d.unlockLevel} 해금` }),
    ]);
  }
  function skillTab(api, g, d, pane) {
    const caster = { stats: d };
    pane.appendChild(el('div', { class: 'stw-note', text: '자동 힐과 스킬 바의 힐 버튼이 여기서 고른 기도를 써요. 스킬 레벨은 신전에서 올려요.' }));
    pane.appendChild(el('div', { class: 'stw-h', text: '단일 힐' }));
    pane.appendChild(el('div', { class: 'stw-sk' }, SINGLE.map((id) => skillOpt(api, g, id, 'single', caster))));
    pane.appendChild(el('div', { class: 'stw-h', text: '광역 힐' }));
    pane.appendChild(el('div', { class: 'stw-sk' }, AOE.map((id) => skillOpt(api, g, id, 'aoe', caster))));
  }

  // ---- 설정 탭 ----
  // 처음부터: 저장을 지우고 새 게임 → 프롤로그 → 마을. 부트(main.js)의 startNewGame 이 있으면 그걸 써서 자동 저장 플래그까지 맞춘다.
  async function restart(api) {
    const ok = await api.confirm('정말 처음부터 시작할까요?\n지금까지의 레벨·장비·퀘스트 진행이 모두 사라져요.', { ok: '처음부터', cancel: '취소' });
    if (!ok) return;
    closeSheet();
    UI.close(true);
    State.reset();
    if (typeof Boot !== 'undefined' && Boot.startNewGame) { await Boot.startNewGame(); return; }
    State.newGame('리프');
    K.save();
    if (typeof Story !== 'undefined' && Story.prologue) await UI.story(Story.prologue, '프롤로그');
    if (typeof Scenes !== 'undefined') Scenes.go('town');
  }
  function optTab(api, g, d, pane) {
    const st = g.player.settings || (g.player.settings = {});
    pane.appendChild(el('div', { class: 'stw-h', text: '자동 설정' }));
    for (const s of SETTINGS) pane.appendChild(el('button', {
      class: 'stw-tog' + (st[s.key] ? ' on' : ''), role: 'switch', 'aria-checked': st[s.key] ? 'true' : 'false',
      onClick: () => { st[s.key] = !st[s.key]; K.save(); api.toast(`${s.name} ${st[s.key] ? '켬' : '끔'}`, 1000); api.refresh(); },
    }, [el('div', { class: 'mid' }, [el('div', { class: 'n', text: s.name }), el('div', { class: 'd', text: s.desc })]), el('div', { class: 'stw-sw' })]));
    pane.appendChild(el('div', { class: 'stw-h', text: '게임' }));
    pane.appendChild(el('div', { class: 'stw-foot' }, [
      el('button', { class: 'stw-btn go', text: '💾 저장', onClick: () => { const ok = (() => { try { return State.save(); } catch (e) { return false; } })(); api.toast(ok ? '저장했어요' : '이 환경에서는 저장할 수 없어요'); } }),
      el('button', { class: 'stw-btn', text: '처음부터', onClick: () => restart(api) }),
    ]));
    pane.appendChild(el('div', { class: 'stw-note', style: { textAlign: 'center' }, text: `플레이 ${Math.floor((g.playTime || 0) / 60)}분 · ${g.day || 1}일째 · 최고 ${(g.tower && g.tower.highestCleared) || 0}층 돌파` }));
  }

  const RENDER = { char: charTab, alloc: allocTab, skill: skillTab, opt: optTab };
  UI.register('status', {
    title: '상태',
    full: true,
    render(root, params, api) {
      injectStyle();
      root.classList.add('hk-root');
      const card = root.closest && root.closest('.ui-card');
      if (card) card.classList.add('st-dark');
      const g = G();
      let d;
      try { d = Stats.derive(g.player, g); } catch (e) { root.appendChild(UI.empty('능력치를 계산할 수 없어요')); return; }
      const tab = RENDER[params.tab] ? params.tab : 'char';
      // 스탯 포인트가 남아 있으면 탭에 표시
      const pts = g.player.statPoints || 0;
      root.appendChild(el('div', { class: 'stw-tabs', role: 'tablist' }, TABS.map((t) => el('button', {
        class: 'stw-tab' + (t.id === tab ? ' on' : ''), role: 'tab', 'aria-selected': t.id === tab ? 'true' : 'false',
        text: t.label + (t.id === 'alloc' && pts ? ` (${pts})` : ''),
        onClick: () => { if (params.tab === t.id) return; params.tab = t.id; params._scroll = 0; closeSheet(); api.refresh(); },
      }))));
      const pane = el('div', { class: 'stw-pane' });
      root.appendChild(pane);
      RENDER[tab](api, g, d, pane);
      if (typeof params._scroll === 'number') root.scrollTop = params._scroll;
      root.onscroll = () => { params._scroll = root.scrollTop; };
      // 미리보기·바로가기: params.slot 이 있으면 그 칸 선택 창을 연다(한 번만)
      if (params.slot) { const s = params.slot; params.slot = null; setTimeout(() => openSlotSheet(api, s), 0); }
    },
    onClose() { closeSheet(); },
  });
})();
