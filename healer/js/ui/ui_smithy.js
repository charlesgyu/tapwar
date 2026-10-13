// 대장간 화면 — 탭 [수리 | 분해 | 조합]
// 수리: 장착+가방 장비 중 손상된 것(내구도 바·비용) + 전부 수리. 분해: 가방 장비 → 예상 재료 미리보기 후 확인창.
// 조합: Items.recipes() 전부, 재료 보유/부족을 칩 색으로 보여 주고 가능한 것을 위로 올린다.
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
  const defOf = (id) => (typeof Items !== 'undefined' ? Items.get(id) : null) || { id, name: id };
  const isEquip = (inst) => (defOf(inst.id).kind === 'equip');

  // 내구도 바: 30% 아래는 주황으로 바꿔 곧 효과가 반감된다는 것을 알린다
  function duraBar(inst) {
    const max = inst.maxDurability || 0, cur = Math.max(0, inst.durability || 0);
    const b = UI.bar(cur, max, 'xp');
    b.classList.add('fac-dura');
    if (max && cur / max < 0.3) b.classList.add('low');
    return b;
  }
  // 등급별 '확정 재료 외' 추가 개수 — Economy.disassemble 의 총 개수(일반 1, 고급 1~2, 레어 2~3, 전설 3)에서 확정 1개를 뺀 값.
  // 일반 등급은 추가가 없으므로 무작위 후보를 보여 주지 않는다(헛된 기대를 주지 않게).
  const EXTRA = { common: null, uncommon: '0~1개', rare: '1~2개', legendary: '2개 + 용 비늘' };
  const appendMain = (c, node) => { const m = c.querySelector('.item-main'); if (m && node) m.appendChild(node); return c; };

  // ---------- 수리 ----------
  function renderRepair(pane, params, api) {
    const g = G();
    const equipped = new Set(Inventory.equipped(g).map((e) => e.inst.uid));
    const all = Facilities.smithy.allEquip(g);
    const damaged = all.filter((it) => Economy.repairCost(it) > 0)
      .sort((a, b) => (equipped.has(b.uid) - equipped.has(a.uid)) || (a.durability / a.maxDurability - b.durability / b.maxDurability));
    if (!damaged.length) {
      pane.appendChild(UI.empty(all.length ? '모든 장비가 멀쩡해요. 탑에 다녀온 뒤 다시 들러요!' : '수리할 장비가 없어요'));
      return;
    }
    const total = damaged.reduce((s, it) => s + Economy.repairCost(it), 0);
    const afford = (g.player.gold || 0) >= total;
    pane.appendChild(el('button', {
      class: 'btn primary fac-big', disabled: !afford,
      text: `🔨 전부 수리 (${damaged.length}개 · ${UI.gold(total)})`,
      onClick: () => K.done(api, Facilities.smithy.repairAll(g), (r) => `장비 ${r.count}개를 수리했어요 (-${r.cost})`),
    }));
    pane.appendChild(el('div', { class: 'fac-hint', text: '내구도가 0이 되면 그 장비의 효과가 절반으로 떨어져요. 수리비 = 가격 × 손상 비율 × 30%.' }));
    const make = (inst) => {
      const cost = Economy.repairCost(inst);
      const c = K.card(inst, {
        price: cost, desc: false,
        buttons: [{ label: '수리', cls: 'primary', disabled: (g.player.gold || 0) < cost,
          onClick: () => K.done(api, Facilities.smithy.repair(g, inst.uid), (r) => `${defOf(inst.id).name} 수리 완료 (-${r.cost})`) }],
      });
      if (equipped.has(inst.uid)) c.querySelector('.item-name').appendChild(el('span', { class: 'fac-badge blue', text: '장착 중' }));
      return appendMain(c, duraBar(inst));
    };
    const eq = damaged.filter((i) => equipped.has(i.uid)), bag = damaged.filter((i) => !equipped.has(i.uid));
    if (eq.length) pane.appendChild(UI.section(`🛡️ 장착 중 (${eq.length})`, eq.map(make)));
    if (bag.length) pane.appendChild(UI.section(`🎒 가방 (${bag.length})`, bag.map(make)));
  }

  // ---------- 분해 ----------
  async function disassemble(api, g, inst) {
    const d = defOf(inst.id);
    const gname = (Items.GRADES[inst.grade] || {}).name || '';
    const [first, ...all] = Economy.disassemblePreview(inst);
    const pool = EXTRA[inst.grade] ? all : [];
    const preview = `${first ? K.matName(first) + ' 1개' : ''}${pool.length ? ` + 무작위 ${EXTRA[inst.grade]}\n(${pool.map(K.matName).join(', ')} 중)` : ''}`;
    const warn = (inst.grade === 'rare' || inst.grade === 'legendary') ? '\n⚠️ 귀한 장비예요. 되돌릴 수 없어요!' : '';
    const yes = await api.confirm(`${gname} ${K.josa(d.name, '을/를')} 분해할까요?\n얻는 재료: ${preview}${warn}`, { ok: '분해' });
    if (!yes) return;
    const r = Facilities.smithy.disassemble(g, inst.uid);
    K.done(api, r, (res) => {
      // 같은 재료는 한 줄로 합쳐 "실 ×2, 마법가루 ×1" 처럼 보여 준다
      const sum = {};
      for (const m of res.materials || []) sum[m.id] = (sum[m.id] || 0) + (m.qty || 1);
      const txt = Object.entries(sum).map(([id, q]) => `${K.matName(id)} ×${q}`).join(', ') || '재료 없음';
      return `분해 완료: ${txt}${res.toBank && res.toBank.length ? ' (가방이 차서 일부는 은행으로)' : ''}`;
    });
  }
  function renderDisassemble(pane, params, api) {
    const g = G();
    const items = Inventory.items(g).filter(isEquip)
      .sort((a, b) => Items.gradeIndex(a.grade) - Items.gradeIndex(b.grade));
    pane.appendChild(el('div', { class: 'fac-hint', text: '가방 속 장비를 녹여 재료로 바꿔요. 등급이 높을수록 귀한 재료가 더 많이 나와요. 장착 중인 장비는 먼저 벗어야 해요.' }));
    if (!items.length) { pane.appendChild(UI.empty('가방에 분해할 장비가 없어요')); return; }
    pane.appendChild(UI.section(`🔥 분해할 수 있는 장비 (${items.length})`, items.map((inst) => {
      const c = K.card(inst, { desc: false, buttons: [{ label: '분해', cls: 'danger', onClick: () => disassemble(api, g, inst) }] });
      // 미리보기 첫 칸은 재질별 확정 재료, 나머지는 등급별 무작위 추가 재료 후보
      const [first, ...all] = Economy.disassemblePreview(inst);
      const pool = EXTRA[inst.grade] ? all : [];
      const pv = {}; for (const id of pool) pv[id] = 1;
      const box = el('div', {}, [
        el('div', { class: 'fac-lbl', text: '예상 재료' }),
        el('div', { class: 'fac-chips' }, [
          first ? el('span', { class: 'fac-chip', text: `확정 ${K.matName(first)}` }) : null,
          pool.length ? el('span', { class: 'fac-chip plain', text: `+ 무작위 ${EXTRA[inst.grade]}` }) : null,
        ]),
        K.chips(pv, g, true),
      ]);
      return appendMain(c, box);
    })));
  }

  // ---------- 조합 ----------
  function recipeCard(api, g, r) {
    const rd = defOf(r.result);
    const grade = r.grade || 'common';
    const gi = Items.GRADES[grade] || {};
    const can = r.can || Economy.canCraft(g, r);
    const goldOk = (g.player.gold || 0) >= (r.gold || 0);
    const kindTxt = rd.kind === 'equip' ? [gi.name, rd.slot ? (UI.SLOT_NAMES[rd.slot] || rd.slot) : ''].filter(Boolean).join(' · ') : (Items.kindName ? Items.kindName(rd.kind) : '');
    const c = el('div', { class: 'item-card', 'data-grade': grade, style: { borderColor: can.ok ? gi.color : '#e3d8c3' } }, [
      el('div', { class: 'item-icon', text: rd.icon || '📦' }),
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name', style: { color: gi.color }, text: `${rd.name}${(r.qty || 1) > 1 ? ' ×' + r.qty : ''}` }),
        el('div', { class: 'item-sub', text: `${r.name}${kindTxt ? ' · ' + kindTxt : ''}` }),
        K.chips(r.materials, g),
      ]),
      el('div', { class: 'item-side' }, [
        el('div', { class: 'item-price', style: { color: goldOk ? '#7a5a1a' : '#b0403a' }, text: `🪙 ${r.gold || 0}` }),
        el('button', { class: 'btn small primary', text: '제작', disabled: !can.ok,
          onClick: () => K.done(api, Facilities.smithy.craft(g, r.id), (res) => {
            const n = res.item && res.item.qty > 1 ? ` ${res.item.qty}개` : '';
            return `${rd.name}${n} 완성! (-${res.cost})${res.toBank ? ' 가방이 차서 은행으로 보냈어요' : ''}`;
          }) }),
      ]),
    ]);
    return c;
  }
  function renderCraft(pane, params, api) {
    const g = G();
    const list = Facilities.smithy.recipes(g);
    if (!list.length) { pane.appendChild(UI.empty('아직 아는 제작법이 없어요')); return; }
    // 지금 만들 수 있는 것을 위로 — 원래 순서(싼 것 → 비싼 것)는 그 안에서 유지
    const ready = list.filter((r) => r.can && r.can.ok), rest = list.filter((r) => !(r.can && r.can.ok));
    pane.appendChild(el('div', { class: 'fac-hint', text: '재료 칩이 빨간색이면 부족한 재료예요. 재료는 분해·드랍·잡화점에서 구할 수 있어요.' }));
    if (ready.length) pane.appendChild(UI.section(`✅ 지금 만들 수 있어요 (${ready.length})`, ready.map((r) => recipeCard(api, g, r))));
    pane.appendChild(UI.section(`📜 제작법 (${rest.length})`, rest.map((r) => recipeCard(api, g, r))));
  }

  UI.register('smithy', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.smithy : '대장간'),
    render(root, params, api) {
      K.injectStyle();
      root.classList.add('fac-root');
      const g = G();
      const size = Inventory.bagSize(g), used = size - Inventory.emptySlots(g);
      root.appendChild(K.top(g, `🎒 가방 ${used}/${size}`));
      const hello = K.npc('smith', g, { cache: params });
      if (hello) root.appendChild(hello);
      // 탭을 params 에 기억해 수리/분해/제작 뒤 refresh 해도 같은 탭에 머문다
      UI.tabs(root, [
        { id: 'repair', label: '🔨 수리', render: (p) => { params.tab = 'repair'; renderRepair(p, params, api); } },
        { id: 'dis', label: '🔥 분해', render: (p) => { params.tab = 'dis'; renderDisassemble(p, params, api); } },
        { id: 'craft', label: '⚒️ 조합', render: (p) => { params.tab = 'craft'; renderCraft(p, params, api); } },
      ], params.tab || 'repair');
    },
  });
})();
