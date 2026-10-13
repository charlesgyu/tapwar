// 은행 화면 — 탭 [보관함 | 가방 | 골드]
// 보관함은 칸 수(기본 60)가 정해져 있어 위에 "사용 칸/전체 칸"을 항상 보여 주고, 가득 차면 맡기기 버튼을 잠근다.
// 골드는 자주 쓰는 금액 버튼 + 직접 입력(UI.prompt)을 함께 둔다 — 휴대폰에서 숫자 타이핑을 줄이려고.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;

  const REASONS = {
    not_found: '물건을 찾을 수 없어요',
    bank_full: '보관함이 가득 찼어요',
    bag_full: '가방이 가득 찼어요',
    bad_amount: '금액을 1 이상의 숫자로 적어 주세요',
    gold: '가진 골드가 부족해요',
    bank_gold: '맡긴 골드가 부족해요',
  };
  const reasonText = (r) => REASONS[r.reason] || '할 수 없어요';
  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  const defOf = (id) => (typeof Items !== 'undefined' ? Items.get(id) : null);
  const nameOf = (inst) => { const d = defOf(inst.id) || {}; return `${d.name || inst.id}${inst.qty > 1 ? ` ×${inst.qty}` : ''}`; };
  const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
  const B = () => Facilities.bank;

  function injectStyle() {
    if (document.getElementById('ui-bank-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-bank-style';
    s.textContent = `
.bank-top { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px; }
.bank-stat { background:#fff3d6; border:2px solid #e3c98a; border-radius:10px; padding:6px 10px; }
.bank-stat small { display:block; font-size:11px; font-weight:700; color:#8a7a6a; }
.bank-stat b { font-size:16px; font-weight:900; color:#7a5a1a; font-variant-numeric: tabular-nums; }
.bank-stat.cap { background:#eef4ff; border-color:#b9cdf0; }
.bank-stat.cap b { color:#3a5a8a; }
.bank-stat.full { background:#fde6e4; border-color:#e8a8a2; }
.bank-stat.full b { color:#a03a34; }
.bank-root .item-card .btn.small { min-height:44px; min-width:64px; font-size:13px; }
.bank-root .btn { min-height:44px; }
.bank-root .item-card[data-grade="common"] { border-color:#d9cdb5 !important; }
.bank-root .item-card[data-grade="common"] .item-name { color:#3a3030 !important; }
.bank-root .item-card[data-grade="uncommon"] .item-name { filter: brightness(0.72) saturate(1.3); }
.bank-root .item-card[data-grade="legendary"] .item-name { filter: brightness(0.85); }
.bank-hint { font-size:11px; color:#9a8a7a; margin:2px 2px 8px; line-height:1.45; }
.bank-box { border:2px solid #e3d8c3; border-radius:12px; padding:10px; margin-bottom:10px; background:#fffdf7; }
.bank-box h4 { margin:0 0 4px; font-size:14px; font-weight:900; color:#4a3a30; }
.bank-box .bank-hint { margin:0 0 8px; }
.bank-chips { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; }
.bank-chips .btn { padding:6px 4px; font-size:13px; }
`;
    document.head.appendChild(s);
  }

  function card(inst, opts) {
    const c = UI.itemCard(inst, opts);
    c.setAttribute('data-grade', inst.grade || 'common');
    return c;
  }

  function topBar(g) {
    const cap = B().capacity(g);
    const bagSize = Inventory.bagSize(g), bagUsed = bagSize - Inventory.emptySlots(g);
    const stat = (label, value, cls = '') => el('div', { class: 'bank-stat ' + cls }, [el('small', { text: label }), el('b', { text: value })]);
    return el('div', { class: 'bank-top' }, [
      stat('가진 골드', UI.gold(g.player.gold || 0)),
      stat('맡긴 골드', UI.gold(cap.gold || 0)),
      stat('🏦 보관함', `${cap.used} / ${cap.size}칸`, 'cap' + (cap.used >= cap.size ? ' full' : '')),
      stat('🎒 가방', `${bagUsed} / ${bagSize}칸`, 'cap' + (bagUsed >= bagSize ? ' full' : '')),
    ]);
  }

  function done(api, r, okMsg) {
    if (r.ok) { api.toast(okMsg); save(); } else api.toast(reasonText(r));
    api.refresh();
  }

  // ---------- 보관함 ----------
  function renderVault(pane, params, api) {
    const g = G();
    const items = B().items(g).filter(Boolean);
    if (!items.length) { pane.appendChild(UI.empty('보관함이 비어 있어요. 가방 탭에서 물건을 맡겨 보세요')); return; }
    const bagFull = Inventory.isFull(g);
    // 가방이 차서 대장간·퀘스트 보상이 은행으로 넘어온 경우가 많아 안내를 붙인다
    pane.appendChild(el('div', { class: 'bank-hint', text: bagFull ? '가방이 가득 찼어요. 같은 소모품·재료 묶음에 합칠 수 있는 것만 찾을 수 있어요.' : '가방이 가득 찼을 때 받은 보상·제작품도 여기에 보관돼요.' }));
    for (const inst of items) {
      pane.appendChild(card(inst, {
        compact: true, desc: false,
        buttons: [{ label: '찾기', cls: 'primary', onClick: () => done(api, B().withdraw(g, inst.uid), `"${nameOf(inst)}"을(를) 찾았어요`) }],
      }));
    }
  }

  // ---------- 가방 ----------
  function renderBag(pane, params, api) {
    const g = G();
    const items = Inventory.items(g);
    if (!items.length) { pane.appendChild(UI.empty('가방이 비어 있어요')); return; }
    const cap = B().capacity(g), full = cap.used >= cap.size;
    pane.appendChild(el('div', { class: 'bank-hint', text: full ? '보관함이 가득 찼어요. 먼저 물건을 찾아가 주세요.' : '장착 중인 장비는 여기 나오지 않아요. 맡긴 물건은 던전에서 잃어버리지 않아요.' }));
    for (const inst of items) {
      pane.appendChild(card(inst, {
        compact: true, desc: false,
        buttons: [{ label: '맡기기', disabled: full, onClick: () => done(api, B().deposit(g, inst.uid), `"${nameOf(inst)}"을(를) 맡겼어요`) }],
      }));
    }
  }

  // ---------- 골드 ----------
  async function askAmount(api, title, max) {
    const v = await api.prompt(`${title}\n(최대 ${fmt(max)} 골드)`, String(max), { maxlength: 10, placeholder: '숫자만' });
    if (v === null) return null;
    const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
    if (!(n > 0)) { api.toast(REASONS.bad_amount); return null; }
    return n;
  }
  function goldBox(api, g, kind) {
    const isIn = kind === 'in';
    const have = isIn ? (g.player.gold || 0) : (B().capacity(g).gold || 0);
    const run = (n) => {
      const r = isIn ? B().depositGold(g, n) : B().withdrawGold(g, n);
      done(api, r, isIn ? `${fmt(n)} 골드를 맡겼어요` : `${fmt(n)} 골드를 찾았어요`);
    };
    const chip = (label, n) => el('button', { class: 'btn ghost', text: label, disabled: !(n > 0) || n > have, onClick: () => run(n) });
    return el('div', { class: 'bank-box' }, [
      el('h4', { text: isIn ? '⬇️ 입금 (가방 → 은행)' : '⬆️ 출금 (은행 → 가방)' }),
      el('div', { class: 'bank-hint', text: isIn ? `가진 골드 ${fmt(have)} · 맡긴 골드는 쓸 수 없지만 안전해요.` : `맡긴 골드 ${fmt(have)}` }),
      el('div', { class: 'bank-chips' }, [chip('100', 100), chip('1,000', 1000), chip('절반', Math.floor(have / 2)), chip('전부', have)]),
      el('button', { class: 'btn ' + (isIn ? 'primary' : ''), style: { width: '100%', marginTop: '8px' }, text: isIn ? '금액 입력해서 입금' : '금액 입력해서 출금', disabled: have <= 0,
        onClick: async () => { const n = await askAmount(api, isIn ? '얼마를 맡길까요?' : '얼마를 찾을까요?', have); if (n) run(n); } }),
    ]);
  }
  function renderGold(pane, params, api) {
    const g = G();
    pane.appendChild(goldBox(api, g, 'in'));
    pane.appendChild(goldBox(api, g, 'out'));
  }

  UI.register('bank', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.bank : '은행'),
    render(root, params, api) {
      injectStyle();
      root.classList.add('bank-root');
      const g = G();
      root.appendChild(topBar(g));
      const cap = B().capacity(g);
      UI.tabs(root, [
        { id: 'vault', label: `보관함 (${cap.used})`, render: (p) => { params.tab = 'vault'; renderVault(p, params, api); } },
        { id: 'bag', label: '가방', render: (p) => { params.tab = 'bag'; renderBag(p, params, api); } },
        { id: 'gold', label: '골드', render: (p) => { params.tab = 'gold'; renderGold(p, params, api); } },
      ], params.tab || 'vault');
    },
  });
})();
