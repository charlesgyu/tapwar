// 공통 UI 프레임워크(DOM) — 모달 화면 등록/열기, 탭, 토스트, 확인창, NPC 대화창, 스토리 연출, 아이템 카드
// 각 화면은 ui_*.js 에서 UI.register('shop', { title, render(root, params, api) }) 로 등록한다.
const UI = (() => {
  const screens = new Map();
  const stack = [];       // 열린 모달 스택 [{ name, params, el }]
  let root = null, toastEl = null, toastTimer = null;

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) { if (c === null || c === undefined || c === false) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }

  function init() {
    if (root) return;
    root = el('div', { id: 'ui-root' });
    toastEl = el('div', { id: 'ui-toast', class: 'hidden' });
    document.body.appendChild(root); document.body.appendChild(toastEl);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) close(); });
  }

  function register(name, screen) { screens.set(name, screen); }
  function isOpen() { return stack.length > 0; }
  function current() { return stack[stack.length - 1] || null; }

  // 화면 열기: 모달 카드(제목·닫기 버튼·본문). opts.full 이면 전체 화면.
  function open(name, params = {}) {
    init();
    const screen = screens.get(name);
    if (!screen) { toast(`"${name}" 화면은 아직 준비 중이에요`); return null; }
    const body = el('div', { class: 'ui-body' });
    const title = typeof screen.title === 'function' ? screen.title(params) : (screen.title || name);
    const card = el('div', { class: 'ui-card' + (screen.full ? ' full' : '') }, [
      el('div', { class: 'ui-head' }, [el('div', { class: 'ui-title', text: title }), el('button', { class: 'ui-close', text: '✕', onClick: () => close() })]),
      body,
    ]);
    const overlay = el('div', { class: 'ui-overlay', onClick: (e) => { if (e.target === overlay && !screen.modal) close(); } }, [card]);
    const entry = { name, params, el: overlay, screen, body };
    stack.push(entry);
    root.appendChild(overlay);
    render(entry);
    Events.emit('ui_open', { name, params });
    return entry;
  }
  function render(entry) {
    entry = entry || current(); if (!entry) return;
    entry.body.innerHTML = '';
    const api = { close, refresh: () => render(entry), toast, confirm, prompt, open, params: entry.params, setTitle: (t) => { entry.el.querySelector('.ui-title').textContent = t; } };
    try { entry.screen.render(entry.body, entry.params, api); }
    catch (e) { console.error('[UI]', entry.name, e); entry.body.appendChild(el('div', { class: 'ui-error', text: '화면을 그리는 중 오류: ' + e.message })); }
  }
  function refresh() { render(current()); }
  function close(all = false) {
    while (stack.length) {
      const entry = stack.pop();
      if (entry.screen.onClose) { try { entry.screen.onClose(entry.params); } catch (e) { console.error(e); } }
      entry.el.remove();
      Events.emit('ui_close', { name: entry.name });
      if (!all) break;
    }
  }

  function toast(msg, ms = 2000) {
    init();
    toastEl.textContent = msg; toastEl.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
  }

  // 확인창 → Promise<boolean>
  function confirm(msg, opts = {}) {
    init();
    return new Promise((resolve) => {
      const done = (v) => { overlay.remove(); resolve(v); };
      const overlay = el('div', { class: 'ui-overlay top' }, [el('div', { class: 'ui-card small' }, [
        el('div', { class: 'ui-body' }, [el('p', { class: 'ui-msg', text: msg })]),
        el('div', { class: 'ui-actions' }, [
          el('button', { class: 'btn ghost', text: opts.cancel || '취소', onClick: () => done(false) }),
          el('button', { class: 'btn primary', text: opts.ok || '확인', onClick: () => done(true) }),
        ]),
      ])]);
      root.appendChild(overlay);
    });
  }
  // 입력창 → Promise<string|null>
  function prompt(msg, def = '', opts = {}) {
    init();
    return new Promise((resolve) => {
      const input = el('input', { class: 'ui-input', value: def, maxlength: opts.maxlength || 12, placeholder: opts.placeholder || '' });
      const done = (v) => { overlay.remove(); resolve(v); };
      const overlay = el('div', { class: 'ui-overlay top' }, [el('div', { class: 'ui-card small' }, [
        el('div', { class: 'ui-body' }, [el('p', { class: 'ui-msg', text: msg }), input]),
        el('div', { class: 'ui-actions' }, [
          el('button', { class: 'btn ghost', text: '취소', onClick: () => done(null) }),
          el('button', { class: 'btn primary', text: '확인', onClick: () => done(input.value.trim()) }),
        ]),
      ])]);
      root.appendChild(overlay);
      setTimeout(() => input.focus(), 50);
    });
  }

  // NPC 대화창: 한 줄씩 탭으로 넘김, 마지막에 choices 가 있으면 선택 → Promise<value|null>
  // portrait: 캔버스(스프라이트 프레임) 또는 null
  function dialog({ name, portrait, lines, choices }) {
    init();
    return new Promise((resolve) => {
      let i = 0;
      const text = el('div', { class: 'dlg-text' });
      const choiceBox = el('div', { class: 'dlg-choices hidden' });
      const hint = el('div', { class: 'dlg-hint', text: '탭하여 계속 ▸' });
      const portraitBox = el('div', { class: 'dlg-portrait' });
      if (portrait) { const c = document.createElement('canvas'); c.width = portrait.width * 2; c.height = portrait.height * 2; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(portrait, 0, 0, c.width, c.height); portraitBox.appendChild(c); }
      const box = el('div', { class: 'dlg-box' }, [portraitBox, el('div', { class: 'dlg-main' }, [el('div', { class: 'dlg-name', text: name || '' }), text, choiceBox, hint])]);
      const overlay = el('div', { class: 'ui-overlay dlg top' }, [box]);
      const finish = (v) => { overlay.remove(); resolve(v); };
      const show = () => {
        if (i < lines.length) { text.textContent = lines[i]; return; }
        if (choices && choices.length) {
          hint.classList.add('hidden'); choiceBox.classList.remove('hidden');
          for (const ch of choices) choiceBox.appendChild(el('button', { class: 'btn ' + (ch.primary ? 'primary' : ''), text: ch.label, onClick: (e) => { e.stopPropagation(); finish(ch.value); } }));
        } else finish(null);
      };
      overlay.addEventListener('click', () => { if (i < lines.length) { i++; show(); } });
      root.appendChild(overlay);
      show();
    });
  }

  // 스토리 연출: 어두운 화면에 문장을 하나씩 → Promise
  function story(lines, title = '') {
    init();
    return new Promise((resolve) => {
      let i = 0;
      const text = el('div', { class: 'story-text' });
      const box = el('div', { class: 'story-box' }, [title ? el('div', { class: 'story-title', text: title }) : null, text, el('div', { class: 'dlg-hint', text: '탭하여 계속 ▸' })]);
      const overlay = el('div', { class: 'ui-overlay story top' }, [box, el('button', { class: 'btn ghost story-skip', text: '건너뛰기', onClick: (e) => { e.stopPropagation(); overlay.remove(); resolve(); } })]);
      const show = () => { if (i >= lines.length) { overlay.remove(); resolve(); return; } text.textContent = lines[i]; text.classList.remove('fade'); void text.offsetWidth; text.classList.add('fade'); };
      overlay.addEventListener('click', () => { i++; show(); });
      root.appendChild(overlay);
      show();
    });
  }

  // 탭 묶음: tabs = [{ id, label, render(container) }]
  function tabs(container, list, activeId) {
    const bar = el('div', { class: 'ui-tabs' });
    const pane = el('div', { class: 'ui-pane' });
    let active = activeId || (list[0] && list[0].id);
    const draw = () => {
      bar.innerHTML = ''; pane.innerHTML = '';
      for (const t of list) bar.appendChild(el('button', { class: 'ui-tab' + (t.id === active ? ' active' : ''), text: t.label, onClick: () => { active = t.id; draw(); } }));
      const t = list.find(x => x.id === active); if (t) t.render(pane);
    };
    container.appendChild(bar); container.appendChild(pane);
    draw();
    return { set: (id) => { active = id; draw(); }, redraw: draw };
  }

  // 아이템 카드: inst(itemInst) 또는 def. opts.buttons = [{label, onClick, cls}], opts.price, opts.compact
  function itemCard(instOrDef, opts = {}) {
    const def = instOrDef.id && typeof Items !== 'undefined' ? (Items.get(instOrDef.id) || instOrDef) : instOrDef;
    const inst = instOrDef.uid ? instOrDef : null;
    const grade = (inst && inst.grade) || def.grade || 'common';
    const gi = (typeof Items !== 'undefined' && Items.GRADES && Items.GRADES[grade]) || { name: grade, color: '#999' };
    const statsText = [];
    if (def.baseStats) { const mult = (typeof Items !== 'undefined' && Items.GRADES && Items.GRADES[grade]) ? Items.GRADES[grade].mult : 1; for (const [k, v] of Object.entries(def.baseStats)) statsText.push(`${STAT_NAMES[k] || k} +${Math.round(v * mult)}`); }
    if (inst && inst.affixes) for (const a of inst.affixes) statsText.push(typeof Items !== 'undefined' && Items.affixText ? Items.affixText(a) : `${a.stat} +${a.value}`);
    if (def.effect) { const e = def.effect; const parts = []; if (e.hp) parts.push(`HP +${e.hp}`); if (e.mp) parts.push(`MP +${e.mp}`); if (e.hpPct) parts.push(`HP ${Math.round(e.hpPct * 100)}%`); if (e.mpPct) parts.push(`MP ${Math.round(e.mpPct * 100)}%`); if (e.cleanse) parts.push('저주 해제'); if (e.fatigue) parts.push(`피로 ${e.fatigue}`); statsText.push(parts.join(', ')); }
    const sub = [];
    if (def.slot) sub.push(SLOT_NAMES[def.slot] || def.slot);
    if (def.armor) sub.push(ARMOR_NAMES[def.armor] || def.armor);
    if (def.setId && typeof Items !== 'undefined' && Items.SETS && Items.SETS[def.setId]) sub.push('세트: ' + Items.SETS[def.setId].name);
    if (inst && inst.maxDurability) sub.push(`내구 ${Math.round(inst.durability)}/${inst.maxDurability}`);
    const qty = inst && inst.qty > 1 ? ` ×${inst.qty}` : '';
    const card = el('div', { class: 'item-card' + (opts.compact ? ' compact' : ''), style: { borderColor: gi.color } }, [
      el('div', { class: 'item-icon', text: def.icon || '📦' }),
      el('div', { class: 'item-main' }, [
        // 일반 등급 색(#f2f2f2)은 흰 카드 위에서 안 읽혀 이름만 진한 글자색으로(테두리는 등급색 유지) — 여러 화면 담당자가 각자 덧칠하던 것을 여기서 한 번에
        el('div', { class: 'item-name', style: { color: grade === 'common' ? '#4a3a30' : gi.color }, text: `${def.name || def.id}${qty}` }),
        el('div', { class: 'item-sub', text: [gi.name].concat(sub).join(' · ') }),
        statsText.length ? el('div', { class: 'item-stats', text: statsText.join(' / ') }) : null,
        opts.desc !== false && def.desc && !opts.compact ? el('div', { class: 'item-desc', text: def.desc }) : null,
      ]),
      el('div', { class: 'item-side' }, [
        opts.price !== undefined ? el('div', { class: 'item-price', text: `🪙 ${opts.price}` }) : null,
        ...(opts.buttons || []).map(b => el('button', { class: 'btn small ' + (b.cls || ''), text: b.label, disabled: b.disabled, onClick: (e) => { e.stopPropagation(); b.onClick(inst || def); } })),
      ]),
    ]);
    if (opts.onClick) card.addEventListener('click', () => opts.onClick(inst || def));
    return card;
  }

  const STAT_NAMES = { str: '힘', def: '방어력', agi: '민첩', sta: '지구력', int: '지능', vit: '체력', hp: 'HP', mp: 'MP' };
  const SLOT_NAMES = { neck: '목걸이', ring: '반지', ear: '귀걸이', main: '무기', off: '보조', body: '옷', boots: '장화', gloves: '장갑', hat: '모자', belt: '벨트', bag: '가방' };
  const ARMOR_NAMES = { plate: '판금', leather: '가죽', chain: '사슬', cloth: '천' };
  const ROLE_NAMES = { tank: '탱커', melee: '근접딜러', ranged: '원거리딜러', healer: '힐러' };

  function gold(n) { return `🪙 ${Math.floor(n).toLocaleString('ko-KR')}`; }
  function bar(value, max, cls = '') { const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0)); return el('div', { class: 'ui-bar ' + cls }, [el('i', { style: { width: pct + '%' } }), el('span', { text: `${Math.round(value)}/${Math.round(max)}` })]); }
  function empty(text) { return el('div', { class: 'ui-empty', text }); }
  function row(children, cls = '') { return el('div', { class: 'ui-row ' + cls }, children); }
  function section(title, children) { return el('div', { class: 'ui-section' }, [el('div', { class: 'ui-section-title', text: title }), ...[].concat(children)]); }

  return { init, register, open, close, refresh, render, isOpen, current, toast, confirm, prompt, dialog, story, tabs, itemCard, el, gold, bar, empty, row, section, STAT_NAMES, SLOT_NAMES, ARMOR_NAMES, ROLE_NAMES, screens };
})();
if (typeof module !== 'undefined') module.exports = UI;
