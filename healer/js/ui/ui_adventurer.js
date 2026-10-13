// 모험가 사무소 — 탭 [고용 | 내 파티 | 의뢰 게시판]
// 고용 후보는 하루 6명(날짜 시드)이라 "오늘의 후보"임을 밝히고, 파티 정원(4명)은 맨 위에 늘 보여 준다.
// 파티원 카드·해고 확인창은 PartyUI(ui_party.js)와 공유해 화면마다 같은 사람이 같은 모습으로 보이게 한다.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;

  const REASONS = {
    not_found: '그 모험가를 찾을 수 없어요',
    party_full: '파티가 가득 찼어요 (최대 4명)',
    gold: '골드가 부족해요',
  };
  const reasonText = (r) => REASONS[r.reason] || '할 수 없어요';
  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  const A = () => Facilities.adventurer;

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
`;
    document.head.appendChild(s);
  }

  function topBar(g) {
    const n = Party.members(g).length;
    return el('div', { class: 'pu-top' }, [el('b', { text: UI.gold(g.player.gold || 0) }), el('small', { text: `👥 파티원 ${n} / ${Party.MAX}` })]);
  }

  // ---------- 고용 ----------
  function renderHire(pane, params, api) {
    const g = G();
    const list = A().candidates(g);
    const full = Party.isFull(g);
    pane.appendChild(el('div', { class: full ? 'pu-warn' : 'pu-hint', text: full ? `파티가 가득 찼어요 (${Party.MAX}/${Party.MAX}). 새로 고용하려면 '내 파티'에서 한 명을 내보내세요.` : `오늘의 후보 ${list.length}명 · 파티원은 최대 ${Party.MAX}명까지. 후보는 여관에서 하룻밤 자면 바뀌어요.` }));
    if (!list.length) { pane.appendChild(UI.empty('오늘은 남은 후보가 없어요. 내일 다시 와 주세요.')); return; }
    for (const c of list) {
      const short = (g.player.gold || 0) < c.hireCost;
      pane.appendChild(PartyUI.memberCard(c, g, {
        side: [
          el('div', { class: 'pu-cost' + (short ? ' short' : ''), text: UI.gold(c.hireCost) }),
          el('button', { class: 'btn primary', text: '고용', disabled: full, onClick: () => hire(api, c) }),
        ],
      }));
    }
  }
  function hire(api, c) {
    const g = G();
    const r = A().hire(g, c.uid);
    if (r.ok) { save(); api.toast(`${PartyUI.josa(c.name, '이/가')} 파티에 합류했어요! (${UI.gold(r.cost)})`); }
    else api.toast(r.reason === 'gold' ? `골드가 부족해요 (필요 ${UI.gold(c.hireCost)})` : reasonText(r));
    api.refresh();
  }

  // ---------- 내 파티 ----------
  function renderParty(pane, params, api) {
    const g = G();
    const members = Party.members(g);
    const sum = PartyUI.roleSummary(g);
    pane.appendChild(sum.grid);
    pane.appendChild(el('div', { class: sum.advice.warn ? 'pu-warn' : 'pu-ok', text: sum.advice.text }));
    if (!members.length) {
      pane.appendChild(UI.empty('아직 동료가 없어요.'));
      pane.appendChild(el('button', { class: 'btn primary', style: { width: '100%', minHeight: '44px' }, text: '고용하러 가기', onClick: () => { params.tab = 'hire'; api.refresh(); } }));
      return;
    }
    for (const m of members) {
      const inGuild = m.guildId && g.guild && g.guild.id === m.guildId;
      pane.appendChild(PartyUI.memberCard(m, g, {
        tag: inGuild ? '길드원' : null, guild: inGuild,
        side: [
          el('button', { class: 'btn ghost', text: '상세', onClick: () => api.open('party', { sel: m.uid }) }),
          el('button', { class: 'btn danger', text: inGuild ? '빼기' : '해고', onClick: () => PartyUI.dismissFlow(g, m, api) }),
        ],
      }));
    }
  }

  // ---------- 의뢰 게시판 ----------
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
  function renderBoard(pane, params, api) {
    const g = G();
    const list = A().board(g);
    const activeVillage = (Quests.active(g) || []).filter((q) => q.type === 'village').length;
    pane.appendChild(el('div', { class: 'pu-hint', text: `마을 사람들의 의뢰예요. 진행 중인 의뢰 ${activeVillage}개 · 진행 상황은 퀘스트 창에서 볼 수 있어요.` }));
    if (!list.length) { pane.appendChild(UI.empty('지금 받을 수 있는 의뢰가 없어요. 탑을 더 오르면 새 의뢰가 붙어요.')); return; }
    for (const d of list) {
      const giver = typeof Dialogue !== 'undefined' && Dialogue.name ? Dialogue.name(d.giver) : d.giver;
      const floor = d.floor || (d.requires && d.requires.floor) || (d.objectives.find((o) => o.floor) || {}).floor;
      pane.appendChild(el('div', { class: 'adv-q' }, [
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

  UI.register('adventurer', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.adventurer : '모험가 사무소'),
    render(root, params, api) {
      PartyUI.injectStyle(); injectStyle();
      const g = G();
      root.appendChild(topBar(g));
      const nBoard = A().board(g).length;
      UI.tabs(root, [
        { id: 'hire', label: '고용', render: (p) => { params.tab = 'hire'; renderHire(p, params, api); } },
        { id: 'party', label: `내 파티 (${Party.members(g).length})`, render: (p) => { params.tab = 'party'; renderParty(p, params, api); } },
        { id: 'board', label: `의뢰 게시판${nBoard ? ` (${nBoard})` : ''}`, render: (p) => { params.tab = 'board'; renderBoard(p, params, api); } },
      ], params.tab || 'hire');
    },
  });
})();
