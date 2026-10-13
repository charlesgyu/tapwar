// 잡화점(상인) 화면 — 탭 [구매 | 판매]
// 구매: Facilities.shop.stock 의 소모품·재료·기본 장비를 1개/10개 단위로 산다(장비는 항상 1개).
// 판매: 가방의 장비 / 소모품·재료 / 퀘스트 아이템을 나눠 보여 주고, 퀘스트 아이템은 팔 수 없음을 미리 알린다.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;

  const REASONS = {
    not_sold: '이 가게에서 팔지 않는 물건이에요',
    bad_qty: '수량이 올바르지 않아요',
    gold: '골드가 부족해요',
    bag_full: '가방이 가득 찼어요',
    not_found: '가방에서 찾을 수 없어요',
    unsellable: '이 물건은 팔 수 없어요',
  };
  const reasonText = (r) => REASONS[r.reason] || '할 수 없어요';
  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경(미리보기 등)은 무시 */ } };
  const defOf = (id) => (typeof Items !== 'undefined' ? Items.get(id) : null);

  // 화면 전용 스타일은 한 번만 주입 — 공통 ui.css 는 손대지 않기로 했으므로 여기서 보충한다
  function injectStyle() {
    if (document.getElementById('ui-shop-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-shop-style';
    s.textContent = `
.shop-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; margin-bottom:8px; background:#fff3d6; border:2px solid #e3c98a; border-radius:10px; }
.shop-gold { font-weight:900; font-size:17px; color:#7a5a1a; }
.shop-bag { font-size:12px; font-weight:700; color:#8a7a6a; }
.shop-seg { display:flex; gap:0; border-radius:9px; overflow:hidden; border:2px solid #c9b89a; }
.shop-seg button { border:0; min-width:56px; min-height:44px; padding:0 12px; font-weight:800; font-size:13px; background:#fff; color:#7a6a5a; font-family:inherit; }
.shop-seg button.on { background:#5aa84a; color:#fff; }
.shop-hint { font-size:11px; color:#9a8a7a; margin:2px 2px 8px; line-height:1.4; }
.shop-root .item-card .btn.small { min-height:44px; min-width:64px; font-size:13px; }
.shop-root .item-card[data-grade="common"] { border-color:#d9cdb5 !important; }
.shop-root .item-card[data-grade="common"] .item-name { color:#3a3030 !important; }
.shop-root .item-card[data-grade="uncommon"] .item-name { filter: brightness(0.72) saturate(1.3); }
.shop-root .item-card[data-grade="legendary"] .item-name { filter: brightness(0.85); }
.shop-lock { font-size:11px; font-weight:800; color:#b0504a; }
`;
    document.head.appendChild(s);
  }

  // 일반 등급 색(#f2f2f2)은 흰 카드 위에서 안 보여 data-grade 로 표시해 스타일에서 어둡게 바꾼다
  function card(instOrDef, opts) {
    const c = UI.itemCard(instOrDef, opts);
    const grade = instOrDef.grade || (defOf(instOrDef.id) || {}).grade || 'common';
    c.setAttribute('data-grade', grade);
    return c;
  }

  function topBar(g) {
    const empty = Inventory.emptySlots(g), size = Inventory.bagSize(g);
    return el('div', { class: 'shop-top' }, [
      el('div', { class: 'shop-gold', text: UI.gold(g.player.gold || 0) }),
      el('div', { class: 'shop-bag', text: `🎒 가방 ${size - empty}/${size}` }),
    ]);
  }

  function result(api, r, okMsg) {
    if (r.ok) { api.toast(okMsg); save(); }
    else api.toast(reasonText(r));
    api.refresh();
  }

  // ---------- 구매 ----------
  function renderBuy(pane, params, api) {
    const g = G();
    const qty = params.qty === 10 ? 10 : 1;
    const seg = el('div', { class: 'shop-seg' }, [1, 10].map((n) =>
      el('button', { class: n === qty ? 'on' : '', text: `${n}개`, onClick: () => { params.qty = n; api.refresh(); } })));
    pane.appendChild(UI.row([el('div', { class: 'ui-section-title', text: '구매 수량' }), seg], 'between'));
    pane.appendChild(el('div', { class: 'shop-hint', text: '장비는 한 번에 1개씩만 살 수 있어요.' }));

    const stock = Facilities.shop.stock(g);
    if (!stock.length) { pane.appendChild(UI.empty('오늘은 팔 물건이 없어요')); return; }
    const groups = [['consume', '🧪 소모품'], ['material', '🧵 재료'], ['equip', '🛡️ 기본 장비']];
    for (const [kind, title] of groups) {
      const list = stock.filter((s) => s.kind === kind);
      if (!list.length) continue;
      const cards = list.map((s) => {
        const n = s.kind === 'equip' ? 1 : qty;
        const cost = s.price * n;
        const afford = (g.player.gold || 0) >= cost;
        return card(s.def, {
          price: n > 1 ? `${s.price} ×${n} = ${cost}` : s.price,
          buttons: [{
            label: n > 1 ? `구매 ×${n}` : '구매', cls: 'primary', disabled: !afford,
            onClick: () => result(api, Facilities.shop.buy(g, s.id, n), `${s.name}${n > 1 ? ` ${n}개` : ''}를 샀어요 (-${cost})`),
          }],
        });
      });
      pane.appendChild(UI.section(title, cards));
    }
  }

  // ---------- 판매 ----------
  async function sell(api, g, inst, n) {
    const d = defOf(inst.id) || {};
    // 레어 이상 장비는 되돌릴 수 없으니 한 번 묻는다
    if (d.kind === 'equip' && (inst.grade === 'rare' || inst.grade === 'legendary')) {
      const yes = await api.confirm(`${(Items.GRADES[inst.grade] || {}).name || ''} 장비 "${d.name}"을(를) 팔까요?\n경매장에 올리면 더 비싸게 팔 수도 있어요.`, { ok: '판매' });
      if (!yes) return;
    }
    const r = Facilities.shop.sell(g, inst.uid, n);
    result(api, r, r.ok ? `${d.name || inst.id}${r.qty > 1 ? ` ${r.qty}개` : ''}를 팔았어요 (+${r.gold})` : '');
  }

  function sellCard(api, g, inst) {
    const total = Economy.sellPrice(inst);
    const have = inst.qty || 1;
    if (total <= 0) {
      const c = card(inst, { compact: true });
      c.querySelector('.item-side').appendChild(el('div', { class: 'shop-lock', text: '판매 불가' }));
      return c;
    }
    const unit = Math.floor(total / have);
    const buttons = have > 1
      ? [{ label: '1개', onClick: () => sell(api, g, inst, 1) }, { label: '전부', cls: 'primary', onClick: () => sell(api, g, inst, null) }]
      : [{ label: '판매', cls: 'primary', onClick: () => sell(api, g, inst, null) }];
    return card(inst, { price: have > 1 ? `${unit} ×${have} = ${total}` : total, buttons, desc: false });
  }

  function renderSell(pane, params, api) {
    const g = G();
    const items = Inventory.items(g);
    if (!items.length) { pane.appendChild(UI.empty('가방이 비어 있어요')); return; }
    const kindOf = (inst) => ((defOf(inst.id) || {}).kind);
    const equips = items.filter((i) => kindOf(i) === 'equip');
    const quests = items.filter((i) => kindOf(i) === 'quest');
    const others = items.filter((i) => kindOf(i) !== 'equip' && kindOf(i) !== 'quest');
    pane.appendChild(el('div', { class: 'shop-hint', text: '판매가는 구매가의 40%이고, 내구도가 닳은 장비는 덜 받아요. 장착 중인 장비는 여기 나오지 않아요.' }));
    if (equips.length) pane.appendChild(UI.section(`🛡️ 장비 (${equips.length})`, equips.map((i) => sellCard(api, g, i))));
    if (others.length) pane.appendChild(UI.section(`🧪 소모품·재료 (${others.length})`, others.map((i) => sellCard(api, g, i))));
    if (quests.length) pane.appendChild(UI.section(`📜 퀘스트 아이템 (${quests.length})`, quests.map((i) => sellCard(api, g, i))));
  }

  UI.register('shop', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.shop : '잡화점'),
    render(root, params, api) {
      injectStyle();
      root.classList.add('shop-root');
      root.appendChild(topBar(G()));
      // UI.tabs 는 다시 그릴 때 activeId 로 돌아가므로, 현재 탭을 params 에 기억해 구매/판매 후에도 탭이 유지되게 한다
      UI.tabs(root, [
        { id: 'buy', label: '구매', render: (p) => { params.tab = 'buy'; renderBuy(p, params, api); } },
        { id: 'sell', label: '판매', render: (p) => { params.tab = 'sell'; renderSell(p, params, api); } },
      ], params.tab || 'buy');
    },
  });
})();
