// 가방 화면 — 장비 12칸(인형 배치) · 벨트 칸 · 가방 격자 · 세트 효과 · 골드.
// 칸을 누르면 화면 아래에 붙는 상세 카드에서 장착/해제/사용/벨트 등록/버리기를 한다(목록을 스크롤해도 카드가 보이도록 sticky).
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
  // 3×4 인형 배치: 머리줄(모자·목걸이·귀걸이·가방) / 몸통줄(무기·옷·보조·벨트) / 아랫줄(장갑·반지·반지·장화)
  const LAYOUT = ['hat', 'neck', 'ear', 'bag', 'main', 'body', 'off', 'belt', 'gloves', 'ring1', 'ring2', 'boots'];
  const SLOT_LABEL = { hat: '모자', neck: '목걸이', ear: '귀걸이', bag: '가방', main: '무기', body: '옷', off: '보조', belt: '벨트', gloves: '장갑', ring1: '반지', ring2: '반지', boots: '장화' };
  const SLOT_GHOST = { hat: '🎩', neck: '📿', ear: '✧', bag: '🎒', main: '🪄', body: '👕', off: '📖', belt: '➰', gloves: '🧤', ring1: '💍', ring2: '💍', boots: '👢' };
  const KIND_ORDER = { equip: 0, consume: 1, material: 2, quest: 3, misc: 4 };
  // 장착 전후 비교에 쓰는 파생 수치(바뀐 것만 보여 준다)
  const COMPARE = [
    ['maxHp', '최대 HP', 0], ['maxMp', '최대 MP', 0], ['healPower', '치유력', 1], ['def', '방어력', 0], ['int', '지능', 0], ['vit', '체력', 0],
    ['mpRegen', '마나 회복', 2], ['crit', '치명타', 1, '%'], ['evasion', '회피', 1, '%'], ['moveSpeed', '이동 속도', 0],
  ];

  function injectStyle() {
    K.injectStyle();
    if (document.getElementById('ui-inv-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-inv-style';
    s.textContent = `
.inv-eq { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
.inv-cell { position:relative; aspect-ratio:1; min-height:44px; background:#fff; border:2px solid #d9cdb5; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:26px; padding:0; font-family:inherit; color:#2a2020; box-shadow:0 2px 0 #e3d8c3; }
.inv-cell:active { transform:translateY(1px); box-shadow:none; }
.inv-cell.empty { background:#f6f0e3; border-style:dashed; }
.inv-cell.empty .ic { opacity:0.28; filter:grayscale(1); }
.inv-cell .lbl { position:absolute; left:0; right:0; bottom:2px; font-size:10px; font-weight:800; color:#8a7a6a; text-align:center; line-height:1; }
.inv-cell .q { position:absolute; right:4px; bottom:2px; font-size:11px; font-weight:900; color:#3a3030; text-shadow:0 0 2px #fff, 0 0 2px #fff; }
.inv-cell .gdot { position:absolute; left:4px; top:4px; width:7px; height:7px; border-radius:50%; }
.inv-cell .warn { position:absolute; right:3px; top:2px; font-size:11px; }
.inv-cell.sel { border-color:#5aa84a !important; box-shadow:0 0 0 3px #bfe081; }
.inv-eq .inv-cell { aspect-ratio:1.3; font-size:24px; }
.inv-cell.eqc .ic { margin-top:-12px; }
.inv-bag { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; }
.inv-bag .inv-cell { font-size:24px; border-radius:9px; }
.inv-belt { display:flex; gap:6px; }
.inv-belt .inv-cell { width:64px; flex:none; font-size:24px; }
.inv-belt .inv-cell.locked { opacity:0.35; border-style:dotted; }
.inv-head { display:flex; align-items:center; justify-content:space-between; margin:10px 0 6px; }
.inv-head .ui-section-title { margin:0; }
.inv-head .btn { min-height:34px !important; padding:4px 10px; font-size:12px; }
.inv-detail { position:sticky; bottom:-10px; margin:10px -12px -10px; padding:10px 12px 12px; background:#fbf6ea; border-top:2px solid #c9b89a; box-shadow:0 -6px 14px rgba(60,40,20,0.14); z-index:2; animation:inv-up 0.16s ease-out; }
.inv-detail .item-card { margin-bottom:6px; }
.inv-detail .inv-acts { display:flex; gap:6px; flex-wrap:wrap; }
.inv-detail .inv-acts .btn { flex:1 1 0; min-width:76px; }
.inv-detail .x { position:absolute; right:8px; top:-16px; width:32px; height:32px; border-radius:50%; border:2px solid #c9b89a; background:#fff; font-weight:900; color:#5a4030; }
.inv-cmp { display:flex; flex-wrap:wrap; gap:4px 10px; font-size:12px; font-weight:800; margin:2px 2px 8px; }
.inv-cmp .up { color:#2f8a2f; } .inv-cmp .down { color:#c0403a; }
.inv-cmp-h { font-size:11px; font-weight:800; color:#8a7a6a; margin:0 2px 2px; }
.inv-dura { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:800; color:#7a6a5a; margin:0 2px 8px; }
.inv-dura .ui-bar { flex:1; }
.inv-dura .ui-bar i { background:linear-gradient(#bfe39a,#6aa84a); }
.inv-dura.low .ui-bar i { background:linear-gradient(#ffb36a,#e0702a); }
.inv-pick { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
.inv-pick .btn { min-height:44px; background:#fff; color:#3a3030; box-shadow:0 2px 0 #c9b89a; font-size:13px; }
.inv-pick .btn.on { background:#e8f5e0; box-shadow:0 2px 0 #8fc47a; }
.inv-set { padding:8px 10px; border-radius:10px; background:#fff; border:2px solid #e3d8c3; margin-bottom:6px; }
.inv-set .nm { font-weight:900; font-size:14px; display:flex; justify-content:space-between; align-items:center; }
.inv-set .pips { display:flex; gap:3px; margin:4px 0; }
.inv-set .pips i { flex:1; height:6px; border-radius:3px; background:#e6dccb; }
.inv-set .pips i.on { background:#5aa84a; }
.inv-set .bn { font-size:12px; color:#9a8a7a; line-height:1.5; }
.inv-set .bn.on { color:#2f6b2f; font-weight:800; }
@keyframes inv-up { from { transform:translateY(20px); opacity:0; } to { transform:none; opacity:1; } }
`;
    document.head.appendChild(s);
  }

  function cell(inst, opts = {}) {
    const d = K.def(inst);
    const g = inst && inst.grade;
    const kids = [el('span', { class: 'ic', text: d ? (d.icon || '📦') : (opts.ghost || '') })];
    if (d && g && g !== 'common') kids.push(el('i', { class: 'gdot', style: { background: K.grade(g).color } }));
    if (opts.label) kids.push(el('span', { class: 'lbl', text: opts.label }));
    if (inst && (inst.qty || 1) > 1 && !opts.label) kids.push(el('span', { class: 'q', text: '×' + inst.qty }));
    if (inst && typeof inst.durability === 'number' && inst.maxDurability && inst.durability <= inst.maxDurability * 0.2) kids.push(el('span', { class: 'warn', text: inst.durability <= 0 ? '💥' : '⚠️' }));
    const b = el('button', { class: 'inv-cell' + (inst ? '' : ' empty') + (opts.sel ? ' sel' : '') + (opts.cls ? ' ' + opts.cls : ''), 'aria-label': opts.aria || (d ? d.name : '빈 칸'), onClick: opts.onClick }, kids);
    if (d) b.style.borderColor = K.edge(g);
    return b;
  }

  // 장착했을 때의 파생 스탯 미리보기: 사본 플레이어에 장비만 바꿔 끼워 Stats.derive 로 비교한다(실제 상태는 건드리지 않음)
  function simulateEquip(g, inst) {
    const d = K.def(inst); if (!d || typeof Stats === 'undefined') return null;
    const p = g.player, eq = Object.assign({}, p.equipment);
    const slot = d.slot === 'ring' ? (!eq.ring1 ? 'ring1' : (!eq.ring2 ? 'ring2' : 'ring1')) : d.slot;
    if (d.slot === 'main' && d.hands === 'two') eq.off = null;
    if (d.slot === 'off' && eq.main && (K.def(eq.main) || {}).hands === 'two') eq.main = null;
    eq[slot] = inst;
    try {
      // 사본끼리 비교해야 세트 집계 방식이 같아진다(G.player 는 Inventory.activeSets 를 쓰므로)
      const before = Stats.derive(Object.assign({}, p, { equipment: Object.assign({}, p.equipment) }), g);
      const after = Stats.derive(Object.assign({}, p, { equipment: eq }), g);
      return { slot, before, after };
    } catch (e) { return null; }
  }
  function compareRow(sim) {
    const out = [];
    for (const [k, name, dp, unit] of COMPARE) {
      const a = sim.before[k] || 0, b = sim.after[k] || 0, diff = b - a;
      const shown = Math.round(diff * Math.pow(10, dp)) / Math.pow(10, dp);
      if (!shown) continue;
      out.push(el('span', { class: diff > 0 ? 'up' : 'down', text: `${name} ${diff > 0 ? '▲' : '▼'}${Math.abs(shown)}${unit || ''}` }));
    }
    // 시전 속도는 배수(작을수록 빠름)라 따로 퍼센트로
    const cs = (sim.before.castSpeed || 1) / (sim.after.castSpeed || 1) - 1;
    if (Math.abs(cs) >= 0.005) out.push(el('span', { class: cs > 0 ? 'up' : 'down', text: `시전 속도 ${cs > 0 ? '▲' : '▼'}${Math.round(Math.abs(cs) * 100)}%` }));
    return out;
  }
  function failText(g, inst, r) {
    if (r && r.reason === 'level') { const d = K.def(inst); return `레벨 ${(d && d.levelReq) || '?'} 이상이어야 착용할 수 있어요`; }
    if (r && r.reason === 'bag_full') return '가방에 빈칸이 없어 벗은 장비를 넣을 수 없어요';
    return K.reason(r);
  }
  function duraLine(inst) {
    if (!inst || typeof inst.durability !== 'number' || !inst.maxDurability) return null;
    const low = inst.durability <= inst.maxDurability * 0.2;
    return el('div', { class: 'inv-dura' + (low ? ' low' : '') }, [
      el('span', { text: '내구도' }), UI.bar(inst.durability, inst.maxDurability),
      inst.durability <= 0 ? el('span', { class: 'hk-badge warn', text: '효과 절반' }) : (low ? el('span', { class: 'hk-badge warn', text: '대장간 수리' }) : null),
    ]);
  }
  function effectText(d) {
    const e = d.effect || {}, parts = [];
    if (e.hp) parts.push(`HP +${e.hp}`); if (e.mp) parts.push(`MP +${e.mp}`);
    if (e.hpPct) parts.push(`HP ${Math.round(e.hpPct * 100)}%`); if (e.mpPct) parts.push(`MP ${Math.round(e.mpPct * 100)}%`);
    if (e.cleanse) parts.push('저주 해제'); if (e.fatigue) parts.push(`피로 ${e.fatigue > 0 ? '+' : ''}${e.fatigue}`);
    if (e.buff) parts.push('버프'); if (e.teleport) parts.push('마을로 귀환'); if (e.resetTickets) parts.push(`리셋권 +${e.resetTickets}`);
    return parts.join(', ');
  }

  // 받침 유무로 조사를 고른다 — "포션을(를)" 같은 기계적인 표기를 피하려고
  function josa(word, pair) {
    const [a, b] = pair.split('/'), w = String(word || ''), c = w.charCodeAt(w.length - 1);
    if (!(c >= 0xac00 && c <= 0xd7a3)) return w + a;
    return w + (((c - 0xac00) % 28) ? a : b);
  }

  // ---- 동작 ----
  function doEquip(api, g, inst) {
    const name = (K.def(inst) || {}).name || '장비';
    const r = Inventory.equip(g, inst.uid);
    if (r && r.ok) {
      K.save();
      const off = (r.unequipped || []).map((it) => (K.def(it) || {}).name).filter(Boolean);
      api.toast(`${name} 장착${off.length ? ` · ${off.join(', ')} 해제` : ''}`);
      api.params.sel = { where: 'equip', slot: r.slot };
    } else api.toast(failText(g, inst, r));
    api.refresh();
  }
  function doUnequip(api, g, slot) {
    const inst = g.player.equipment[slot];
    const r = Inventory.unequip(g, slot);
    if (r && r.ok) { K.save(); api.toast(`${(K.def(inst) || {}).name || '장비'} 해제 → 가방`); api.params.sel = { where: 'bag', uid: inst.uid }; }
    else api.toast(r && r.reason === 'bag_full' ? '가방이 가득 차서 벗을 수 없어요' : K.reason(r));
    api.refresh();
  }
  function doUse(api, g, inst) {
    const d = K.def(inst); if (!d) return;
    const left = (inst.qty || 1) - 1;
    const ok = Inventory.useConsumable(g, d.id);
    if (ok) { K.save(); api.toast(`${d.name} 사용 · ${effectText(d)}`); if (left <= 0) api.params.sel = null; }
    else api.toast('지금은 쓸 수 없어요');
    api.refresh();
  }
  async function doDrop(api, g, inst) {
    const d = K.def(inst) || {};
    if (d.kind === 'quest') { api.toast('퀘스트 물건은 버릴 수 없어요'); return; }
    const qty = inst.qty || 1;
    const ok = await api.confirm(`${qty > 1 ? `${d.name} ${qty}개를` : josa(d.name, '을/를')} 버릴까요?\n버린 물건은 되찾을 수 없어요.`, { ok: '버리기', cancel: '그만두기' });
    if (!ok) return;
    const n = Inventory.remove(g, inst.uid);
    if (n) { K.save(); api.toast(`${d.name} ${n > 1 ? n + '개 ' : ''}버림`); api.params.sel = null; }
    else api.toast('버릴 수 없어요');
    api.refresh();
  }
  function beltRegister(api, g, itemId, idx) {
    const belt = Inventory.syncBelt(g);
    let i = idx;
    if (i == null) {
      if (belt.includes(itemId)) { api.toast('이미 벨트에 있어요'); return; }
      i = belt.indexOf(null);
      if (i < 0) { api.toast('벨트 칸이 가득 찼어요. 벨트 칸을 눌러 바꿔 주세요'); return; }
    }
    if (Inventory.setBelt(g, i, itemId)) {
      K.save();
      api.toast(itemId ? `벨트 ${i + 1}번 칸에 ${(Items.get(itemId) || {}).name} 등록 — 전투 중 자동 사용` : `벨트 ${i + 1}번 칸 비움`);
    } else api.toast('소모품만 벨트에 걸 수 있어요');
    api.refresh();
  }
  // 정리: 장비(등급 높은 순) → 소모품 → 재료 → 퀘스트 순으로 앞에서부터 채운다. 칸 수·내용물은 그대로라 상태 규칙을 깨지 않는다.
  function sortBag(api, g) {
    const bag = Inventory.ensureBag(g);
    const list = bag.filter(Boolean);
    const gi = (it) => (Items.gradeIndex ? Items.gradeIndex(it.grade) : 0);
    list.sort((a, b) => {
      const da = K.def(a) || {}, db = K.def(b) || {};
      return (KIND_ORDER[da.kind] ?? 9) - (KIND_ORDER[db.kind] ?? 9) || gi(b) - gi(a) || String(da.slot || '').localeCompare(String(db.slot || '')) || String(a.id).localeCompare(String(b.id));
    });
    for (let i = 0; i < bag.length; i++) bag[i] = list[i] || null;
    K.save(); api.toast('가방을 정리했어요'); api.refresh();
  }

  // ---- 상세 카드 ----
  function detailFor(api, g) {
    const sel = api.params.sel; if (!sel) return null;
    const box = el('div', { class: 'inv-detail' });
    box.appendChild(el('button', { class: 'x', text: '✕', 'aria-label': '닫기', onClick: () => { api.params.sel = null; api.refresh(); } }));
    if (sel.where === 'belt') return beltDetail(api, g, sel.idx, box);
    const inst = sel.where === 'equip' ? g.player.equipment[sel.slot] : Inventory.find(g, sel.uid);
    if (!inst) { api.params.sel = null; return null; }
    const d = K.def(inst) || {};
    const acts = [];
    if (sel.where === 'equip') {
      box.appendChild(K.card(inst, { desc: true }));
      box.appendChild(duraLine(inst));
      acts.push(el('button', { class: 'btn ghost', text: '가방으로 해제', onClick: () => doUnequip(api, g, sel.slot) }));
    } else {
      box.appendChild(K.card(inst, { desc: true }));
      if (d.kind === 'equip') {
        box.appendChild(duraLine(inst));
        const chk = Inventory.canEquip(g, inst);
        if (!chk.ok) box.appendChild(el('div', { class: 'hk-warn', text: '⚠️ ' + failText(g, inst, chk) }));
        else {
          const sim = simulateEquip(g, inst);
          if (sim) {
            const cur = g.player.equipment[sim.slot];
            const rows = compareRow(sim);
            box.appendChild(el('div', { class: 'inv-cmp-h', text: cur ? `착용 중인 ${(K.def(cur) || {}).name} 대신 끼우면` : `빈 ${SLOT_LABEL[sim.slot]} 칸에 끼우면` }));
            box.appendChild(el('div', { class: 'inv-cmp' }, rows.length ? rows : [el('span', { text: '능력치 변화 없음' })]));
          }
        }
        acts.push(el('button', { class: 'btn primary', text: '장착', onClick: () => doEquip(api, g, inst) }));
      } else if (d.kind === 'consume') {
        if (d.effect && !d.effect.teleport) acts.push(el('button', { class: 'btn primary', text: '사용', onClick: () => doUse(api, g, inst) }));
        else if (d.effect && d.effect.teleport) box.appendChild(el('div', { class: 'hk-hint', text: '던전 안에서 쓰면 마을로 돌아와요. 벨트에 걸어 두거나 던전에서 가방을 열어 쓰세요.' }));
        const inBelt = (g.player.belt || []).includes(d.id);
        acts.push(el('button', { class: 'btn', text: inBelt ? '벨트에 있음' : '벨트 등록', disabled: inBelt, onClick: () => beltRegister(api, g, d.id) }));
        if (d.effect && d.effect.teleport && typeof Scenes !== 'undefined' && Scenes.name && Scenes.name() === 'dungeon') acts.push(el('button', { class: 'btn primary', text: '사용', onClick: () => doUse(api, g, inst) }));
      }
      acts.push(el('button', { class: 'btn danger', text: '버리기', onClick: () => doDrop(api, g, inst) }));
    }
    box.appendChild(el('div', { class: 'inv-acts' }, acts));
    return box;
  }
  function beltDetail(api, g, idx, box) {
    const belt = Inventory.syncBelt(g), cur = belt[idx];
    const cd = cur ? Items.get(cur) : null;
    box.appendChild(el('div', { class: 'ui-section-title', text: `벨트 ${idx + 1}번 칸 ${cd ? '· ' + cd.name : '· 비어 있음'}` }));
    box.appendChild(el('div', { class: 'hk-hint', text: '벨트에 건 소모품은 전투 중 필요할 때 자동으로 사용돼요(HP·MP가 낮거나 저주에 걸렸을 때).' }));
    // 가방에 있는 소모품 종류(같은 id 는 하나로)
    const ids = [];
    for (const it of Inventory.items(g)) { const d = K.def(it); if (d && d.kind === 'consume' && !ids.includes(d.id)) ids.push(d.id); }
    if (cd && !ids.includes(cur)) ids.unshift(cur);
    if (!ids.length) box.appendChild(UI.empty('가방에 소모품이 없어요. 잡화점에서 포션을 사 보세요.'));
    else box.appendChild(el('div', { class: 'inv-pick' }, ids.map((id) => {
      const d = Items.get(id);
      return el('button', { class: 'btn' + (id === cur ? ' on' : ''), onClick: () => beltRegister(api, g, id === cur ? null : id, idx) }, `${d.icon || ''} ${d.name} ×${Inventory.count(g, id)}`);
    })));
    if (cur) box.appendChild(el('div', { class: 'inv-acts' }, [el('button', { class: 'btn ghost', text: '이 칸 비우기', onClick: () => beltRegister(api, g, null, idx) })]));
    return box;
  }

  // ---- 섹션 ----
  function equipSection(api, g) {
    const eq = g.player.equipment, sel = api.params.sel;
    const grid = el('div', { class: 'inv-eq' }, LAYOUT.map((slot) => cell(eq[slot], {
      label: SLOT_LABEL[slot], ghost: SLOT_GHOST[slot], cls: 'eqc', sel: sel && sel.where === 'equip' && sel.slot === slot,
      aria: `${SLOT_LABEL[slot]}: ${eq[slot] ? (K.def(eq[slot]) || {}).name : '비어 있음'}`,
      onClick: () => {
        if (!eq[slot]) { api.toast(`${SLOT_LABEL[slot]} 칸이 비어 있어요. 가방에서 장비를 눌러 장착하세요`); return; }
        api.params.sel = sel && sel.where === 'equip' && sel.slot === slot ? null : { where: 'equip', slot }; api.refresh();
      },
    })));
    return el('div', {}, [el('div', { class: 'inv-head' }, [el('div', { class: 'ui-section-title', text: '🧝 장비' })]), grid]);
  }
  function beltSection(api, g) {
    const n = Inventory.beltSlots(g), belt = Inventory.syncBelt(g), sel = api.params.sel;
    const cells = [];
    for (let i = 0; i < 4; i++) {
      if (i >= n) { cells.push(el('button', { class: 'inv-cell empty locked', 'aria-label': '잠긴 벨트 칸', onClick: () => api.toast('더 좋은 등급의 벨트를 차면 칸이 늘어나요(일반 1 · 고급 2 · 레어 3 · 전설 4)') }, [el('span', { class: 'ic', text: '🔒' })])); continue; }
      const id = belt[i], d = id ? Items.get(id) : null, have = id ? Inventory.count(g, id) : 0;
      const c = cell(d ? { id, qty: 1 } : null, { ghost: '＋', sel: sel && sel.where === 'belt' && sel.idx === i, aria: `벨트 ${i + 1}번 칸`, onClick: () => { api.params.sel = sel && sel.where === 'belt' && sel.idx === i ? null : { where: 'belt', idx: i }; api.refresh(); } });
      if (d) { c.appendChild(el('span', { class: 'q', text: '×' + have })); if (!have) c.style.opacity = '0.5'; }
      cells.push(c);
    }
    return el('div', {}, [
      el('div', { class: 'inv-head' }, [el('div', { class: 'ui-section-title', text: `➰ 벨트 (${n}칸) — 전투 중 자동 사용` })]),
      el('div', { class: 'inv-belt' }, cells),
    ]);
  }
  function bagSection(api, g) {
    const bag = Inventory.ensureBag(g), sel = api.params.sel;
    const used = bag.filter(Boolean).length;
    const grid = el('div', { class: 'inv-bag' }, bag.map((inst) => cell(inst, {
      sel: inst && sel && sel.where === 'bag' && sel.uid === inst.uid,
      onClick: () => { if (!inst) return; api.params.sel = sel && sel.uid === inst.uid ? null : { where: 'bag', uid: inst.uid }; api.refresh(); },
    })));
    return el('div', {}, [
      el('div', { class: 'inv-head' }, [
        el('div', { class: 'ui-section-title', text: `🎒 가방 ${used}/${bag.length}` }),
        used ? el('button', { class: 'btn ghost', text: '정리', onClick: () => sortBag(api, g) }) : null,
      ]),
      used ? grid : el('div', {}, [grid, el('div', { class: 'hk-hint', text: '가방이 비어 있어요. 던전 상자와 몬스터에게서 물건을 얻을 수 있어요.' })]),
    ]);
  }
  function setSection(g) {
    const sets = (Inventory.activeSets(g) || []).filter((s) => Items.SETS && Items.SETS[s.setId]);
    if (!sets.length) return el('div', {}, [
      el('div', { class: 'inv-head' }, [el('div', { class: 'ui-section-title', text: '✨ 세트 효과' })]),
      el('div', { class: 'hk-hint', text: '같은 세트의 천 옷·장화·장갑·모자·벨트를 2개 이상 입으면 효과가 생겨요.' }),
    ]);
    return el('div', {}, [el('div', { class: 'inv-head' }, [el('div', { class: 'ui-section-title', text: '✨ 세트 효과' })])].concat(sets.map((s) => {
      const def = Items.SETS[s.setId], all = def.bonuses || Items.SET_BONUSES || [];
      const total = 5;
      const pips = el('div', { class: 'pips' }); for (let i = 0; i < total; i++) pips.appendChild(el('i', { class: i < s.count ? 'on' : '' }));
      return el('div', { class: 'inv-set' }, [
        el('div', { class: 'nm' }, [el('span', { text: `${def.icon || ''} ${def.name} 세트` }), el('span', { class: 'hk-badge ' + (s.count >= 2 ? 'ok' : ''), text: `${s.count}/${total}` })]),
        pips,
        ...all.map((b) => el('div', { class: 'bn' + (s.count >= b.pieces ? ' on' : ''), text: `${s.count >= b.pieces ? '✔' : '·'} ${b.pieces}세트: ${b.desc || ''}` })),
      ]);
    })));
  }

  UI.register('inventory', {
    title: '가방',
    full: true,
    render(root, params, api) {
      injectStyle();
      root.classList.add('hk-root');
      const g = G();
      Inventory.ensureBag(g);
      root.appendChild(el('div', { class: 'hk-top' }, [
        el('b', { text: UI.gold(g.player.gold || 0) }),
        el('small', { text: `빈칸 ${Inventory.emptySlots(g)} · Lv.${g.player.level} ${g.player.name}` }),
      ]));
      root.appendChild(equipSection(api, g));
      root.appendChild(beltSection(api, g));
      root.appendChild(bagSection(api, g));
      root.appendChild(setSection(g));
      const det = detailFor(api, g);
      if (det) root.appendChild(det);
      // 상세 카드를 새로 열면 그 내용이 보이도록(스크롤 위치는 refresh 마다 위로 돌아가므로 이전 위치 복원)
      if (typeof params._scroll === 'number') root.scrollTop = params._scroll;
      root.onscroll = () => { params._scroll = root.scrollTop; };
    },
  });
})();
