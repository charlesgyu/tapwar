// 각인소 화면 — 위: 내 각인 슬롯(빈 칸 포함, 지우기), 아래: 새길 수 있는 각인 목록(스탯 6종 / 특수 4종).
// 슬롯 수는 3 + 레벨/10 이라 다음 칸이 언제 열리는지도 같이 보여 준다.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;
  // ---- 시설 화면 공통 도구(대장간·여관·각인소·신전) ----
  // 네 파일이 어떤 순서로 로드돼도 동작하도록 각 파일에 같은 코드를 두고, 먼저 로드된 쪽이 UI.__fac 에 한 번만 만든다.
  const K = UI.__fac || (UI.__fac = (() => {
    const { el } = UI;
    // 받침 유무로 조사를 고른다 — "각인을(를)" 같은 기계적인 표기를 피하려고
    function josa(word, pair) {
      const [a, b] = pair.split('/');
      const c = String(word || '').charCodeAt(String(word || '').length - 1);
      if (!(c >= 0xac00 && c <= 0xd7a3)) return word + a;
      return word + (((c - 0xac00) % 28) ? a : b);
    }
    const REASONS = {
      not_found: '물건을 찾을 수 없어요', not_equip: '장비만 할 수 있어요', not_damaged: '수리할 곳이 없어요',
      gold: '골드가 부족해요', materials: '재료가 부족해요', no_recipe: '알 수 없는 제작법이에요', bag_full: '가방이 가득 찼어요',
      unknown: '알 수 없는 항목이에요', slots_full: '각인 칸이 가득 찼어요', duplicate: '특수 각인은 하나만 새길 수 있어요',
      locked: '아직 배우지 않은 기도예요', max_level: '이미 최고 레벨이에요',
    };
    const reason = (r) => {
      let t = REASONS[r && r.reason] || '할 수 없어요';
      if (r && r.reason === 'materials' && r.missing && typeof Items !== 'undefined') { const d = Items.get(r.missing); if (d) t = `${josa(d.name, '이/가')} 부족해요`; }
      if (r && r.reason === 'gold' && r.cost) t += ` (${UI.gold(r.cost)} 필요)`;
      return t;
    };
    const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경(미리보기 등)은 무시 */ } };
    // 결과 공통 처리: 성공이면 저장 후 토스트, 실패면 이유 토스트 → 다시 그리기
    function done(api, r, okMsg) {
      if (r && r.ok) { save(); api.toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); } else api.toast(reason(r));
      api.refresh();
    }
    function injectStyle() {
      if (document.getElementById('ui-fac-style')) return;
      const s = document.createElement('style');
      s.id = 'ui-fac-style';
      s.textContent = `
.fac-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; margin-bottom:8px; background:#fff3d6; border:2px solid #e3c98a; border-radius:10px; }
.fac-gold { font-weight:900; font-size:17px; color:#7a5a1a; }
.fac-top-sub { font-size:12px; font-weight:700; color:#8a7a6a; text-align:right; }
.fac-npc { display:flex; gap:10px; align-items:center; margin-bottom:8px; }
.fac-portrait { flex:none; width:52px; height:60px; border-radius:10px; background:#e9dcc5; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; font-size:30px; line-height:60px; }
.fac-portrait canvas { image-rendering: pixelated; width:48px; height:48px; margin-bottom:4px; }
.fac-bubble { position:relative; flex:1; background:#fff; border:2px solid #d9cdb5; border-radius:12px; padding:7px 10px; font-size:13px; line-height:1.45; color:#3a3030; }
.fac-bubble b { display:block; font-size:11px; color:#7a5a3a; margin-bottom:1px; }
.fac-bubble:before { content:''; position:absolute; left:-8px; top:20px; border:7px solid transparent; border-right-color:#d9cdb5; border-left:0; }
.fac-hint { font-size:11px; color:#9a8a7a; margin:2px 2px 8px; line-height:1.45; }
.fac-chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.fac-chip { font-size:11px; font-weight:700; padding:2px 7px; border-radius:10px; background:#eef6e6; color:#2f6b2f; border:1px solid #bfdcab; white-space:nowrap; }
.fac-chip.lack { background:#fbe9e7; color:#b0403a; border-color:#efbcb5; }
.fac-chip.plain { background:#f3eee4; color:#6a5a4a; border-color:#e0d4bf; }
.fac-badge { display:inline-block; font-size:10px; font-weight:800; padding:1px 6px; border-radius:8px; background:#e9dcc5; color:#6a5040; vertical-align:middle; margin-left:4px; }
.fac-badge.ok { background:#dff0d4; color:#2f6b2f; } .fac-badge.warn { background:#fbe9e7; color:#b0403a; } .fac-badge.blue { background:#dde9fb; color:#2a5aa0; }
.fac-root .btn { min-height:44px; }
.fac-root .item-card .btn.small { min-height:44px; min-width:64px; font-size:13px; }
.fac-root .item-card[data-grade="common"] { border-color:#d9cdb5 !important; }
.fac-root .item-card[data-grade="common"] .item-name { color:#3a3030 !important; }
.fac-root .item-card[data-grade="uncommon"] .item-name { filter: brightness(0.72) saturate(1.3); }
.fac-root .item-card[data-grade="legendary"] .item-name { filter: brightness(0.85); }
.fac-dura { margin-top:4px; max-width:200px; }
.fac-dura.low i { background: linear-gradient(#ffb36a, #e0702a); }
.fac-big { width:100%; margin:2px 0 10px; font-size:15px; }
.fac-panel { background:#fff; border:2px solid #e3d8c3; border-radius:10px; padding:8px 10px; margin-bottom:8px; }
.fac-lbl { font-size:11px; font-weight:800; color:#7a6a5a; margin:4px 0 2px; display:flex; justify-content:space-between; }
`;
      document.head.appendChild(s);
    }
    // 흰 카드에서 일반 등급 색(#f2f2f2)이 안 보여 data-grade 를 달아 스타일에서 어둡게 바꾼다
    function card(instOrDef, opts, grade) {
      const c = UI.itemCard(instOrDef, opts || {});
      const d = (typeof Items !== 'undefined' && instOrDef.id && Items.get(instOrDef.id)) || {};
      c.setAttribute('data-grade', grade || instOrDef.grade || d.grade || 'common');
      return c;
    }
    function top(g, sub) {
      return el('div', { class: 'fac-top' }, [el('div', { class: 'fac-gold', text: UI.gold(g.player.gold || 0) }), sub ? el('div', { class: 'fac-top-sub', text: sub }) : null]);
    }
    // NPC 한마디 — 시설에 들어올 때마다 대사가 바뀌어 마을이 살아 있게 보인다. 대사 모듈이 없으면 생략.
    // cache(보통 화면 params)에 대사를 기억해, 버튼을 눌러 refresh 할 때마다 말이 바뀌어 산만해지지 않게 한다.
    function npc(npcId, g, opts = {}) {
      if (typeof Dialogue === 'undefined') return null;
      let line = '', name = '', sprite = null;
      const cache = opts.cache || {};
      try {
        line = cache.npcLine || (cache.npcLine = Dialogue.pick(npcId, g));
        name = Dialogue.name(npcId); sprite = (Dialogue.npc(npcId) || {}).sprite;
      } catch (e) { return null; }
      if (!line) return null;
      const pic = el('div', { class: 'fac-portrait' });
      // opts.icon 은 대사를 보고 정할 수도 있다(장로의 '수정 너머' 목소리처럼)
      if (typeof opts.icon === 'function') opts = Object.assign({}, opts, { icon: opts.icon(line) });
      let canvas = null;
      if (!opts.icon && sprite && typeof Sprites !== 'undefined') { try { const s = Sprites.get(sprite); canvas = s && s.down ? s.down[0] : null; } catch (e) { canvas = null; } }
      if (canvas) { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(canvas, 0, 0); pic.appendChild(c); }
      else pic.textContent = opts.icon || '🙂';
      return el('div', { class: 'fac-npc' }, [pic, el('div', { class: 'fac-bubble' }, [el('b', { text: name }), line])]);
    }
    // 재료 칩: 보유/필요 수량을 색으로 보여 무엇을 더 구해야 하는지 한눈에 알게 한다
    function chips(materials, g, plain) {
      const list = Object.entries(materials || {});
      if (!list.length) return null;
      return el('div', { class: 'fac-chips' }, list.map(([id, need]) => {
        const d = (typeof Items !== 'undefined' && Items.get(id)) || { name: id, icon: '📦' };
        if (plain) return el('span', { class: 'fac-chip plain', text: `${d.icon || ''} ${d.name}${need > 1 ? ' ×' + need : ''}` });
        const have = Inventory.count(g, id);
        return el('span', { class: 'fac-chip' + (have < need ? ' lack' : ''), text: `${d.icon || ''} ${d.name} ${have}/${need}` });
      }));
    }
    const matName = (id) => { const d = typeof Items !== 'undefined' && Items.get(id); return d ? d.name : id; };
    return { josa, REASONS, reason, save, done, injectStyle, card, top, npc, chips, matName };
  })());
  const G = () => State.get();
  const E = () => Facilities.engraver;
  const ICON = { int: '📘', vit: '💚', def: '🪨', heal_power: '✨', cast_speed: '🌬️', mp_regen: '💧', guard: '🛡️', evade: '🌑', heal_crit: '🌟', mana_refund: '🔄' };
  const iconOf = (e) => ICON[e.stat || (e.special && e.special.id)] || '🔱';
  const optOf = (id) => (E().get ? E().get(id) : null) || {};

  function slotRow(api, g, eng, index) {
    const o = optOf(eng.id);
    const cost = E().ERASE_COST || 100;
    return el('div', { class: 'item-card compact', 'data-grade': eng.special ? 'rare' : 'common', style: { borderColor: eng.special ? '#5aa0ff' : '#d9cdb5' } }, [
      el('div', { class: 'item-icon', text: iconOf(o.id ? o : eng) }),
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name', text: o.name || eng.id }),
        el('div', { class: 'item-stats', text: o.desc || '' }),
      ]),
      el('div', { class: 'item-side' }, [
        el('button', { class: 'btn small ghost', text: `지우기 🪙${cost}`, onClick: async () => {
          const yes = await api.confirm(`${K.josa(o.name || eng.id, '을/를')} 지울까요?\n${UI.gold(cost)}이 들고, 쓴 재료는 돌아오지 않아요.`, { ok: '지우기' });
          if (!yes) return;
          K.done(api, E().erase(g, index), `${K.josa(o.name || '각인', '을/를')} 지웠어요 (-${cost})`);
        } }),
      ]),
    ]);
  }

  function emptySlot(i) {
    return el('div', { class: 'eng-empty', text: `빈 각인 칸 ${i + 1}` });
  }

  function optionCard(api, g, o, full) {
    const goldOk = (g.player.gold || 0) >= o.cost;
    const dup = !!o.special && o.owned > 0;
    let label = '각인', disabled = false;
    if (dup) { label = '새김'; disabled = true; }
    else if (full) { disabled = true; }
    else if (!o.affordable) { disabled = true; }
    const badge = o.owned ? el('span', { class: 'fac-badge ok', text: o.special ? '새겨짐' : `보유 ${o.owned}` }) : null;
    return el('div', { class: 'item-card', 'data-grade': o.special ? 'rare' : 'common', style: { borderColor: o.special ? '#5aa0ff' : '#d9cdb5', opacity: dup ? 0.7 : 1 } }, [
      el('div', { class: 'item-icon', text: iconOf(o) }),
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name', style: o.special ? { color: '#2a5aa0' } : {} }, [o.name, badge]),
        el('div', { class: 'item-stats', text: o.desc }),
        K.chips(o.materials, g),
      ]),
      el('div', { class: 'item-side' }, [
        el('div', { class: 'item-price', style: { color: goldOk ? '#7a5a1a' : '#b0403a' }, text: `🪙 ${o.cost}` }),
        el('button', { class: 'btn small primary', text: label, disabled,
          onClick: () => K.done(api, E().engrave(g, o.id), (r) => `🔱 ${K.josa(o.name, '을/를')} 새겼어요! (${r.used}/${r.max})`) }),
      ]),
    ]);
  }

  function injectLocal() {
    if (document.getElementById('ui-eng-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-eng-style';
    s.textContent = `
.eng-empty { border:2px dashed #d9cdb5; border-radius:10px; padding:10px; margin-bottom:4px; text-align:center; font-size:12px; font-weight:700; color:#b0a08a; background:#fffdf7; }
.eng-next { font-size:11px; color:#8a7a6a; text-align:center; margin:2px 0 6px; }
`;
    document.head.appendChild(s);
  }

  UI.register('engraver', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.engraver : '각인소'),
    render(root, params, api) {
      K.injectStyle(); injectLocal();
      root.classList.add('fac-root');
      const g = G();
      const list = g.player.engravings || [];
      const max = E().maxSlots(g);
      const full = list.length >= max;
      root.appendChild(K.top(g, `🔱 각인 ${list.length}/${max}`));
      const hello = K.npc('engraver', g, { cache: params });
      if (hello) root.appendChild(hello);

      // 내 각인: 빈 칸까지 그려 남은 자리가 바로 보이게 한다
      const slots = [];
      for (let i = 0; i < max; i++) slots.push(list[i] ? slotRow(api, g, list[i], i) : emptySlot(i));
      // 레벨이 낮아져 칸보다 각인이 많아진 경우(이론상)도 지울 수 있게 남는 것까지 그린다
      for (let i = max; i < list.length; i++) slots.push(slotRow(api, g, list[i], i));
      const lv = g.player.level || 1;
      const nextLv = (Math.floor(lv / 10) + 1) * 10;
      slots.push(el('div', { class: 'eng-next', text: `레벨 ${nextLv}이 되면 각인 칸이 하나 더 열려요` }));
      root.appendChild(UI.section('🔱 나의 각인', slots));

      const opts = E().options(g);
      const stat = opts.filter((o) => !o.special), special = opts.filter((o) => o.special);
      if (full) root.appendChild(el('div', { class: 'fac-hint', style: { color: '#b0403a', fontWeight: 700 }, text: '각인 칸이 가득 찼어요. 새로 새기려면 먼저 하나를 지워야 해요.' }));
      root.appendChild(UI.section('📈 능력 각인 · 여러 번 새길 수 있어요', stat.map((o) => optionCard(api, g, o, full))));
      root.appendChild(UI.section('🌟 특수 각인 · 종류마다 하나씩', special.map((o) => optionCard(api, g, o, full))));
    },
  });
})();
