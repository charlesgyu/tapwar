// 경매장 화면 — 탭 [구매 | 내 판매]
// 매물은 현실 시간 1시간마다 바뀌므로 다음 회전까지 남은 시간을 1초마다 갱신하고, 시간이 넘어가면 목록을 다시 그린다.
// 내 판매는 Facilities.auction.tick 이 "지난 분마다" 판매를 굴리므로, 열 때 한 번 + 열려 있는 동안 1분마다 호출해 수령 토스트를 띄운다.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;

  const REASONS = {
    not_found: '이미 팔렸거나 사라진 매물이에요',
    gold: '골드가 부족해요',
    bag_full: '가방이 가득 찼어요',
    full: '최대 8개까지만 올릴 수 있어요',
    bad_price: '가격을 1 이상의 숫자로 적어 주세요',
    unsellable: '이 물건은 경매에 올릴 수 없어요',
    no_ticket: '리셋권이 없어요',
  };
  const reasonText = (r) => REASONS[r.reason] || '할 수 없어요';
  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  const defOf = (id) => (typeof Items !== 'undefined' ? Items.get(id) : null);
  const nameOf = (inst) => { const d = defOf(inst.id) || {}; return `${d.name || inst.id}${inst.qty > 1 ? ` ×${inst.qty}` : ''}`; };
  const A = () => Facilities.auction;
  const FAIR_MAX = () => (A().CONFIG && A().CONFIG.FAIR_MAX) || 1.2;
  const MAX_MINE = () => (A().CONFIG && A().CONFIG.MAX_MINE) || 8;
  const fairOf = (inst) => (A().fairPrice ? A().fairPrice(inst) : Economy.buyPrice(inst) * (inst.qty || 1));

  function injectStyle() {
    if (document.getElementById('ui-auction-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-auction-style';
    s.textContent = `
.auc-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; margin-bottom:8px; background:#fff3d6; border:2px solid #e3c98a; border-radius:10px; }
.auc-gold { font-weight:900; font-size:17px; color:#7a5a1a; }
.auc-tix { font-size:12px; font-weight:800; color:#6a4aa0; background:#efe6ff; border-radius:8px; padding:4px 8px; }
.auc-timer { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px 10px; }
.auc-clock { font-size:12px; color:#7a6a5a; line-height:1.35; }
.auc-clock b { display:block; font-size:18px; color:#4a3a30; font-variant-numeric: tabular-nums; }
.auc-root .item-card .btn.small { min-height:44px; min-width:64px; font-size:13px; }
.auc-root .btn { min-height:44px; }
.auc-root .item-card[data-grade="common"] { border-color:#d9cdb5 !important; }
.auc-root .item-card[data-grade="common"] .item-name { color:#3a3030 !important; }
.auc-root .item-card[data-grade="uncommon"] .item-name { filter: brightness(0.72) saturate(1.3); }
.auc-root .item-card[data-grade="legendary"] .item-name { filter: brightness(0.85); }
.auc-tag { font-size:11px; font-weight:800; border-radius:6px; padding:2px 6px; white-space:nowrap; }
.auc-tag.cheap { background:#e2f5dc; color:#2f6b2f; }
.auc-tag.pricey { background:#fde6e4; color:#a03a34; }
.auc-tag.even { background:#f0ebe2; color:#7a6a5a; }
.auc-tag.wait { background:#e2f5dc; color:#2f6b2f; }
.auc-tag.stuck { background:#fde6e4; color:#a03a34; }
.auc-hint { font-size:11px; color:#9a8a7a; margin:2px 2px 8px; line-height:1.45; }
.auc-sold { display:flex; justify-content:space-between; font-size:12px; padding:6px 4px; border-bottom:1px dashed #e3d8c3; }
.auc-sold span:last-child { font-weight:800; color:#7a5a1a; }
`;
    document.head.appendChild(s);
  }

  function card(inst, opts, tag) {
    const c = UI.itemCard(inst, opts);
    c.setAttribute('data-grade', inst.grade || 'common');
    if (tag) c.querySelector('.item-side').insertBefore(tag, c.querySelector('.item-side').firstChild);
    return c;
  }

  // ---- 타이머: 화면이 열려 있는 동안만 돈다 ----
  let clockTimer = null, tickTimer = null, shownHour = null;
  function stopTimers() { clearInterval(clockTimer); clearInterval(tickTimer); clockTimer = tickTimer = null; }
  const isOpenHere = () => { const c = UI.current(); return !!c && c.name === 'auction'; };
  const leftText = () => {
    const ms = 3600000 - (Date.now() % 3600000), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  // 판매 정산: 팔린 물건은 골드가 이미 들어온 뒤라 토스트로 알리고 저장만 한다
  function runTick(toast) {
    const r = A().tick(G());
    if (!r.ok || !r.sold.length) return false;
    const total = r.sold.reduce((a, e) => a + e.price, 0);
    toast(r.sold.length === 1 ? `"${nameOf(r.sold[0].item)}" 이(가) 팔렸어요! +${total.toLocaleString('ko-KR')} 골드` : `물건 ${r.sold.length}개가 팔렸어요! +${total.toLocaleString('ko-KR')} 골드`, 2600);
    save();
    return true;
  }
  function startTimers() {
    if (clockTimer) return;
    clockTimer = setInterval(() => {
      if (!isOpenHere()) { if (!UI.isOpen() || !UI.screens.has('auction')) stopTimers(); return; }
      const node = document.querySelector('.auc-clock b'); if (node) node.textContent = leftText();
      // 정각이 지나면 새 매물로 다시 그린다(listings 가 hourIndex 를 보고 재생성)
      if (A().hourIndex() !== shownHour) UI.refresh();
    }, 1000);
    tickTimer = setInterval(() => { if (isOpenHere() && runTick(UI.toast)) UI.refresh(); }, 60000);
  }

  // ---------- 구매 ----------
  function priceTag(lot) {
    const fair = fairOf(lot.item); if (!(fair > 0)) return null;
    const pct = Math.round((lot.price / fair - 1) * 100);
    if (pct <= -5) return el('span', { class: 'auc-tag cheap', text: `시세 ${pct}%` });
    if (pct >= 5) return el('span', { class: 'auc-tag pricey', text: `시세 +${pct}%` });
    return el('span', { class: 'auc-tag even', text: '시세 그대로' });
  }
  function renderBuy(pane, params, api) {
    const g = G();
    const lots = A().listings(g);
    shownHour = A().hourIndex();
    const tickets = (g.auction && g.auction.resetTickets) || 0;
    pane.appendChild(el('div', { class: 'auc-timer' }, [
      el('div', { class: 'auc-clock' }, ['다음 매물 교체까지', el('b', { text: leftText() })]),
      el('button', {
        class: 'btn ' + (tickets > 0 ? 'primary' : 'ghost'), text: `🎟️ 리셋권 사용 (${tickets})`, disabled: tickets <= 0,
        onClick: async () => {
          if (!(await api.confirm(`리셋권 1장을 써서 매물을 지금 바로 새로 받을까요?\n(남은 리셋권 ${tickets}장)`, { ok: '사용' }))) return;
          const r = A().reset(g);
          if (r.ok) { api.toast(`새 매물 ${r.listings.length}개가 들어왔어요`); save(); } else api.toast(reasonText(r));
          api.refresh();
        },
      }),
    ]));
    if (!lots.length) { pane.appendChild(UI.empty('지금은 매물이 없어요. 다음 교체를 기다려 주세요')); return; }
    // 사제가 쓸 수 있는 장비를 먼저 보여 준다 — 매물 절반이 사제용이라 찾기 쉽게
    const usable = (inst) => { const d = defOf(inst.id); return d && d.kind === 'equip' && Items.canUse && Items.canUse(d, g.player.cls); };
    const sorted = lots.slice().sort((a, b) => (usable(b.item) - usable(a.item)) || (Items.gradeIndex ? Items.gradeIndex(b.item.grade) - Items.gradeIndex(a.item.grade) : 0));
    pane.appendChild(el('div', { class: 'auc-hint', text: `매물 ${lots.length}개 · 사제가 착용할 수 있는 장비가 위에 있어요.` }));
    for (const lot of sorted) {
      pane.appendChild(card(lot.item, {
        price: lot.price.toLocaleString('ko-KR'), desc: false,
        buttons: [{
          label: '구매', cls: 'primary', disabled: (g.player.gold || 0) < lot.price,
          onClick: async () => {
            if (lot.price >= 1000 && !(await api.confirm(`"${nameOf(lot.item)}"을(를) ${lot.price.toLocaleString('ko-KR')} 골드에 살까요?`, { ok: '구매' }))) return;
            const r = A().buy(g, lot.uid);
            if (r.ok) { api.toast(`"${nameOf(r.item)}"을(를) 샀어요 (-${r.price})`); save(); } else api.toast(reasonText(r));
            api.refresh();
          },
        }],
      }, priceTag(lot)));
    }
  }

  // ---------- 내 판매 ----------
  async function listItem(api, g, inst) {
    const sp = Economy.sellPrice(inst);
    const fairMax = Math.floor(fairOf(inst) * FAIR_MAX());
    // 추천가는 상점 판매가의 2배 — 항상 "팔리는 가격"(적정가×1.2) 안쪽이라 처음 써 보는 사람도 안전하다
    const suggest = Math.max(1, Math.min(fairMax, sp * 2));
    const msg = `"${nameOf(inst)}" 판매 가격을 정해 주세요.\n상점에 팔면 ${sp.toLocaleString('ko-KR')} 골드\n추천가 ${suggest.toLocaleString('ko-KR')} 골드 근처\n${fairMax.toLocaleString('ko-KR')} 골드를 넘으면 아무도 사지 않아요.`;
    const v = await api.prompt(msg, String(suggest), { maxlength: 9, placeholder: '숫자만' });
    if (v === null) return;
    const price = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
    if (!(price > 0)) { api.toast(REASONS.bad_price); return; }
    if (price < sp && !(await api.confirm(`상점 판매가(${sp})보다 싸게 올려요. 계속할까요?`, { ok: '올리기' }))) return;
    const r = A().list(g, inst.uid, price);
    if (r.ok) { api.toast(price > fairMax ? '올렸어요. 하지만 너무 비싸서 안 팔릴 거예요' : `${price.toLocaleString('ko-KR')} 골드에 올렸어요`); save(); }
    else api.toast(reasonText(r));
    api.refresh();
  }

  function renderMine(pane, params, api) {
    const g = G();
    const mine = A().mine(g), max = MAX_MINE();
    const mineCards = mine.map((e) => {
      const fair = A().isFair(e);
      const tag = el('span', { class: 'auc-tag ' + (fair ? 'wait' : 'stuck'), text: fair ? '판매 중' : '너무 비쌈' });
      return card(e.item, {
        price: e.price.toLocaleString('ko-KR'), desc: false, compact: true,
        buttons: [{
          label: '회수', cls: 'ghost',
          onClick: () => {
            const r = A().cancel(g, e.uid);
            if (r.ok) { api.toast(`"${nameOf(r.item)}"을(를) 가방으로 돌려받았어요`); save(); } else api.toast(reasonText(r));
            api.refresh();
          },
        }],
      }, tag);
    });
    pane.appendChild(UI.section(`📦 올린 물건 (${mine.length}/${max})`, mine.length ? mineCards : [UI.empty('아직 올린 물건이 없어요')]));
    if (mine.some((e) => !A().isFair(e))) pane.appendChild(el('div', { class: 'auc-hint', text: '"너무 비쌈" 물건은 적정가의 1.2배를 넘어 팔리지 않아요. 회수해서 다시 올려 보세요.' }));
    else if (mine.length) pane.appendChild(el('div', { class: 'auc-hint', text: '1분마다 누군가 살 수 있어요. 팔리면 골드가 바로 들어와요(던전에 가 있어도 돌아오면 정산).' }));

    const sellable = Inventory.items(g).filter((i) => Economy.sellPrice(i) > 0);
    const full = mine.length >= max;
    const bagCards = sellable.map((inst) => card(inst, {
      price: `상점 ${Economy.sellPrice(inst).toLocaleString('ko-KR')}`, desc: false, compact: true,
      buttons: [{ label: '올리기', cls: 'primary', disabled: full, onClick: () => listItem(api, g, inst) }],
    }));
    pane.appendChild(UI.section('🎒 가방에서 올리기', sellable.length ? bagCards : [UI.empty('올릴 수 있는 물건이 없어요')]));

    const hist = A().history(g).slice(0, 5);
    if (hist.length) {
      pane.appendChild(UI.section('🧾 최근 판매', hist.map((h) => el('div', { class: 'auc-sold' }, [el('span', { text: nameOf(h.item) }), el('span', { text: `+${h.price.toLocaleString('ko-KR')}` })]))));
    }
  }

  UI.register('auction', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.auction : '경매장'),
    render(root, params, api) {
      injectStyle();
      // 처음 열 때 한 번만 정산 — refresh 때마다 돌리면 안 되므로 params 에 표시
      if (!params._ticked) { params._ticked = true; runTick(api.toast); }
      startTimers();
      root.classList.add('auc-root');
      const g = G();
      root.appendChild(el('div', { class: 'auc-top' }, [
        el('div', { class: 'auc-gold', text: UI.gold(g.player.gold || 0) }),
        el('div', { class: 'auc-tix', text: `🎟️ 리셋권 ${(g.auction && g.auction.resetTickets) || 0}장` }),
      ]));
      UI.tabs(root, [
        { id: 'buy', label: '구매', render: (p) => { params.tab = 'buy'; renderBuy(p, params, api); } },
        { id: 'mine', label: `내 판매 (${A().mine(g).length})`, render: (p) => { params.tab = 'mine'; renderMine(p, params, api); } },
      ], params.tab || 'buy');
    },
    onClose() { stopTimers(); },
  });
})();
