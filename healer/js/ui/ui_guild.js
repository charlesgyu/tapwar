// 길드 화면
// 길드 없음: NPC 길드 3곳(소개·고정 파티원)에 가입하거나 1000골드로 직접 창설한다.
// 길드 있음: 이름/레벨/구성원. 명부의 길드원은 고용비 없이 "영입"(recruit)으로 파티에 넣고, 오너면 현재 파티원을 길드에 "등록"(enlist)할 수 있다.
// 탈퇴하면 파티에 나가 있던 길드원도 함께 빠지므로 확인창에서 몇 명이 빠지는지 미리 알린다.
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;

  const REASONS = {
    in_guild: '이미 길드에 소속되어 있어요',
    unknown: '없는 길드예요',
    level: '레벨이 부족해요',
    no_guild: '소속된 길드가 없어요',
    bad_name: '이름은 1~12자로 지어 주세요',
    gold: '골드가 부족해요',
    not_found: '그 길드원을 찾을 수 없어요',
    party_full: '파티가 가득 찼어요 (최대 4명)',
    not_owner: '길드장만 할 수 있어요',
    already_member: '이미 길드원이에요',
  };
  const reasonText = (r) => (r.reason === 'level' && r.levelReq ? `레벨 ${r.levelReq} 이상부터 가입할 수 있어요` : REASONS[r.reason] || '할 수 없어요');
  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  const GU = () => Facilities.guild;
  const COST = () => (Facilities.GUILD_COST || GU().GUILD_COST || 1000);
  const GUILD_ICON = { guild_oak_shield: '🌳', guild_moon_blade: '🌙', guild_grey_watch: '🗼' };

  function injectStyle() {
    if (document.getElementById('ui-guild-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-guild-style';
    s.textContent = `
.gd-card { background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:10px; margin-bottom:9px; }
.gd-card.locked { background:#f6f2ea; }
.gd-head { display:flex; align-items:center; gap:9px; }
.gd-emb { flex:none; width:46px; height:46px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px; background:linear-gradient(#efe6fb,#dccbf2); border:2px solid #c9b0e0; }
.gd-head h4 { margin:0; font-size:16px; font-weight:900; color:#3a2a40; }
.gd-head .meta { font-size:11.5px; font-weight:800; color:#8a7a9a; margin-top:1px; }
.gd-head .meta.bad { color:#b0504a; }
.gd-desc { font-size:12.5px; color:#5a4a40; line-height:1.45; margin:7px 0; }
.gd-mem { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; }
.gd-mem div { display:flex; flex-direction:column; align-items:center; gap:1px; background:#faf6ee; border-radius:9px; padding:5px 2px; }
.gd-mem small { font-size:11px; font-weight:800; color:#4a3a30; white-space:nowrap; }
.gd-mem i { font-style:normal; font-size:10px; font-weight:800; white-space:nowrap; }
.gd-foot { display:flex; justify-content:flex-end; margin-top:8px; }
.gd-foot .btn, .gd-create .btn, .gd-leave { min-height:44px; min-width:96px; }
.gd-create { background:#fffaf0; border:2px dashed #d9c08a; border-radius:12px; padding:10px; display:flex; align-items:center; gap:10px; }
.gd-create div { flex:1; font-size:12px; color:#6a5a4a; line-height:1.45; }
.gd-create b { display:block; font-size:14px; color:#4a3a30; }
.gd-banner { background:linear-gradient(135deg,#5a3a8a,#3a2a5a); color:#fff; border-radius:12px; padding:12px; display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.gd-banner .gd-emb { background:rgba(255,255,255,0.15); border-color:rgba(255,255,255,0.35); }
.gd-banner h3 { margin:0; font-size:18px; font-weight:900; }
.gd-banner small { font-size:12px; font-weight:700; opacity:0.85; }
.gd-banner .own { display:inline-block; font-size:10px; font-weight:900; background:#f2d35b; color:#4a3a10; border-radius:6px; padding:1px 6px; margin-left:4px; vertical-align:2px; }
.gd-leave { width:100%; margin-top:6px; }
`;
    document.head.appendChild(s);
  }

  function topBar(g) {
    const n = Party.members(g).length;
    return el('div', { class: 'pu-top' }, [el('b', { text: UI.gold(g.player.gold || 0) }), el('small', { text: `Lv.${g.player.level} · 👥 파티원 ${n} / ${Party.MAX}` })]);
  }
  function done(api, r, okMsg) {
    if (r.ok) { save(); api.toast(okMsg); } else api.toast(reasonText(r));
    api.refresh();
  }

  // ---------- 길드 없음 ----------
  function renderNoGuild(root, api) {
    const g = G();
    root.appendChild(el('div', { class: 'pu-hint', text: '길드에 들면 고정 파티원을 고용비 없이 파티에 데려갈 수 있어요. 한 번에 한 길드에만 소속돼요.' }));
    for (const n of GU().list(g)) {
      const lack = (g.player.level || 1) < n.levelReq;
      root.appendChild(el('div', { class: 'gd-card' + (lack ? ' locked' : '') }, [
        el('div', { class: 'gd-head' }, [
          el('div', { class: 'gd-emb', text: GUILD_ICON[n.id] || '🏰' }),
          el('div', {}, [el('h4', { text: n.name }), el('div', { class: 'meta' + (lack ? ' bad' : ''), text: `길드 Lv.${n.level} · ${lack ? '🔒 ' : ''}가입 Lv.${n.levelReq} 이상 · 길드원 Lv.${n.members[0] ? n.members[0].level : '?'}` })]),
        ]),
        el('div', { class: 'gd-desc', text: n.desc }),
        el('div', { class: 'gd-mem' }, n.members.map((m) => el('div', {}, [
          PartyUI.portrait(m, true),
          el('small', { text: m.name }),
          el('i', { style: { color: PartyUI.ROLE_COLOR[m.role] }, text: `${PartyUI.className(m.cls)}·${PartyUI.ROLE_SHORT[m.role] || PartyUI.roleName(m.role)}` }),
        ]))),
        el('div', { class: 'gd-foot' }, [el('button', { class: 'btn primary', text: lack ? `Lv.${n.levelReq} 필요` : '가입', disabled: lack, onClick: () => join(api, n) })]),
      ]));
    }
    const cost = COST();
    root.appendChild(el('div', { class: 'gd-create' }, [
      el('div', {}, [el('b', { text: '🏰 나만의 길드 창설' }), `${UI.gold(cost)} · 길드장이 되어 지금 파티원을 길드원으로 등록할 수 있어요.`]),
      el('button', { class: 'btn', text: '창설', onClick: () => create(api) }),
    ]));
  }
  async function join(api, n) {
    const yes = await api.confirm(`'${n.name}'에 가입할까요?\n길드원 ${n.members.length}명을 명부에서 영입할 수 있어요.`, { ok: '가입' });
    if (!yes) return;
    done(api, GU().join(G(), n.id), `'${n.name}'에 가입했어요! 명부에서 길드원을 영입해 보세요`);
  }
  async function create(api) {
    const g = G(), cost = COST();
    if ((g.player.gold || 0) < cost) { api.toast(`골드가 부족해요 (필요 ${UI.gold(cost)})`); return; }
    const name = await api.prompt(`길드 이름을 지어 주세요 (1~12자)\n창설 비용 ${UI.gold(cost)}`, '', { maxlength: 12, placeholder: '예) 새벽빛 순례단' });
    if (name === null) return;
    done(api, GU().create(G(), name), `길드 '${name}' 창설!`);
  }

  // ---------- 길드 있음 ----------
  function renderGuild(root, api) {
    const g = G();
    const gd = GU().current(g);
    const roster = gd.members || [];
    const inParty = Party.members(g).filter((m) => m.guildId === gd.id);
    root.appendChild(el('div', { class: 'gd-banner' }, [
      el('div', { class: 'gd-emb', text: GUILD_ICON[gd.id] || '🏰' }),
      el('div', {}, [el('h3', {}, [gd.name, gd.isOwner ? el('span', { class: 'own', text: '길드장' }) : null]), el('small', { text: `길드 Lv.${gd.level || 1} · 길드원 ${roster.length + inParty.length}명 (파티 ${inParty.length})` })]),
    ]));
    const full = Party.isFull(g);
    root.appendChild(UI.section(`명부 (${roster.length})`, [
      roster.length ? null : UI.empty(gd.isOwner ? '명부가 비어 있어요. 아래에서 파티원을 길드원으로 등록하세요.' : '모든 길드원이 파티에 나가 있어요.'),
      full && roster.length ? el('div', { class: 'pu-warn', text: '파티가 가득 찼어요. 영입하려면 파티원 한 명을 빼 주세요.' }) : null,
      ...roster.map((m) => PartyUI.memberCard(m, g, { guild: true, side: [el('div', { class: 'pu-cost', text: '무료' }), el('button', { class: 'btn primary', text: '영입', disabled: full, onClick: () => done(api, GU().recruit(G(), m.uid), `${PartyUI.josa(m.name, '이/가')} 파티에 합류했어요`) })] })),
    ]));
    if (inParty.length) {
      root.appendChild(UI.section(`파티에 나간 길드원 (${inParty.length})`, inParty.map((m) => PartyUI.memberCard(m, g, { guild: true, quote: false, tag: '파티 중', side: [el('button', { class: 'btn ghost', text: '명부로', onClick: () => PartyUI.dismissFlow(g, m, api) })] }))));
    }
    // 오너만: 길드원이 아닌 현재 파티원을 등록 — 해고해도 명부에 남아 고정 파티를 꾸릴 수 있다
    if (gd.isOwner) {
      const others = Party.members(g).filter((m) => m.guildId !== gd.id);
      if (others.length) {
        root.appendChild(UI.section('파티원 등록', [
          el('div', { class: 'pu-hint', text: '등록한 파티원은 해고해도 명부에 남아 언제든 무료로 다시 데려올 수 있어요.' }),
          ...others.map((m) => PartyUI.memberCard(m, g, { quote: false, side: [el('button', { class: 'btn', text: '등록', onClick: () => done(api, GU().enlist(G(), m.uid), `${PartyUI.josa(m.name, '을/를')} 길드원으로 등록했어요`) })] })),
        ]));
      }
    }
    root.appendChild(el('button', { class: 'btn danger gd-leave', text: gd.isOwner ? '길드 해산' : '길드 탈퇴', onClick: () => leave(api, gd, inParty.length) }));
  }
  async function leave(api, gd, partyCount) {
    const extra = partyCount ? `\n파티에 있는 길드원 ${partyCount}명도 함께 떠나요.` : '';
    const msg = gd.isOwner ? `길드 '${gd.name}'의 문을 닫을까요?${extra}\n창설 비용은 돌려받지 못해요.` : `'${gd.name}'에서 탈퇴할까요?${extra}`;
    const yes = await api.confirm(msg, { ok: gd.isOwner ? '해산' : '탈퇴' });
    if (!yes) return;
    const r = GU().leave(G());
    done(api, r, gd.isOwner ? '길드를 해산했어요' : `'${gd.name}'에서 탈퇴했어요`);
  }

  UI.register('guild', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.guild : '길드'),
    render(root, params, api) {
      PartyUI.injectStyle(); injectStyle();
      const g = G();
      root.appendChild(topBar(g));
      if (GU().current(g)) renderGuild(root, api); else renderNoGuild(root, api);
    },
  });
})();
