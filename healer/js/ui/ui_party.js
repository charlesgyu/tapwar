// 파티 화면 + 파티원 표시 공용 도우미(PartyUI)
// 사무소·길드·탑 화면도 같은 초상화/카드/역할 칩을 쓰도록 여기서 한 번만 정의한다(화면마다 모양이 달라지면 같은 사람이 다르게 보인다).
// 다른 ui_*.js 는 PartyUI 를 render 시점에만 참조하므로 로드 순서와 무관하다.
const PartyUI = (() => {
  if (typeof UI === 'undefined') return null;
  const { el } = UI;

  // 직업 아이콘·외형 — 던전 씬의 CLASS_LOOK 과 같은 대응이라 마을/던전/UI 에서 같은 모습으로 보인다
  const CLASS_ICON = { warrior: '🛡️', monk: '👊', mage: '🔮', hunter: '🏹', rogue: '🗡️', spellblade: '⚡', priest: '✨' };
  const CLASS_LOOK = { warrior: 'knight', monk: 'villagerA', mage: 'villagerC', hunter: 'villagerD', rogue: 'villagerB', spellblade: 'villagerE', priest: 'priest' };
  const ROLE_ICON = { tank: '🛡️', melee: '⚔️', ranged: '🏹', healer: '💚' };
  const ROLE_COLOR = { tank: '#3d6fb8', melee: '#c4553a', ranged: '#3f8f4a', healer: '#b0841f' };
  const ROLE_SHORT = { tank: '탱커', melee: '근딜', ranged: '원딜', healer: '힐러' };

  const className = (cls) => (typeof Classes !== 'undefined' && Classes.get(cls) ? Classes.get(cls).name : cls);
  const roleName = (r) => (typeof Classes !== 'undefined' ? Classes.roleName(r) : (UI.ROLE_NAMES[r] || r));
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  // 이름 뒤 조사: 받침 유무로 고른다('수빈이' 대신 '수빈이가', '은찬와' 대신 '은찬과'). 한글이 아니면 받침 없음으로 본다
  function josa(word, pair) {
    const [a, b] = pair.split('/');
    const w = String(word || ''), c = w.charCodeAt(w.length - 1);
    const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
    return w + (has ? a : b);
  }

  function injectStyle() {
    if (document.getElementById('ui-partyui-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-partyui-style';
    s.textContent = `
.pu-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; margin-bottom:8px; background:#fff3d6; border:2px solid #e3c98a; border-radius:10px; }
.pu-top b { font-weight:900; font-size:16px; color:#7a5a1a; font-variant-numeric:tabular-nums; }
.pu-top small { font-size:12px; font-weight:800; color:#8a7a6a; }
.pu-hint { font-size:11px; color:#9a8a7a; margin:2px 2px 8px; line-height:1.45; }
.pu-warn { font-size:12px; font-weight:800; color:#a03a34; background:#fde6e4; border:1px solid #e8a8a2; border-radius:8px; padding:6px 8px; margin-bottom:8px; line-height:1.4; }
.pu-ok { font-size:12px; font-weight:800; color:#2f6b2f; background:#e8f5e0; border:1px solid #b5d9a2; border-radius:8px; padding:6px 8px; margin-bottom:8px; }
.pu-portrait { flex:none; width:52px; height:60px; border-radius:10px; background:linear-gradient(#efe3cc,#e2d2b4); border:2px solid #d4c29f; position:relative; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; }
.pu-portrait canvas { width:44px; height:55px; image-rendering:pixelated; }
.pu-portrait .ci { position:absolute; left:2px; top:1px; font-size:13px; line-height:1; }
.pu-portrait.sm { width:40px; height:46px; border-radius:8px; }
.pu-portrait.sm canvas { width:34px; height:42px; }
.pu-portrait.sm .ci { font-size:10px; }
.pu-card { display:flex; gap:9px; padding:8px; margin-bottom:7px; background:#fff; border:2px solid #e3d8c3; border-radius:12px; align-items:flex-start; }
.pu-card.guild { border-color:#c9b0e0; background:#fbf8ff; }
.pu-main { flex:1; min-width:0; }
.pu-name { font-weight:900; font-size:15px; color:#2a2020; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.pu-name .lv { font-size:12px; font-weight:800; color:#7a5a3a; }
.pu-sub { font-size:12px; color:#7a6a5a; margin-top:1px; }
.pu-role { display:inline-flex; align-items:center; gap:2px; font-size:11px; font-weight:800; color:#fff; border-radius:6px; padding:1px 6px; }
.pu-tag { display:inline-block; font-size:10px; font-weight:800; color:#6a4a9a; background:#efe6fb; border-radius:6px; padding:1px 5px; }
.pu-stats { display:flex; gap:8px; flex-wrap:wrap; font-size:12px; font-weight:700; color:#4a3a30; margin-top:3px; font-variant-numeric:tabular-nums; }
.pu-stats span { white-space:nowrap; }
.pu-quote { font-size:11.5px; color:#8a6a4a; font-style:italic; margin-top:3px; line-height:1.35; }
.pu-side { flex:none; display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
.pu-side .btn { min-height:44px; min-width:68px; font-size:13px; padding:6px 10px; }
.pu-cost { font-weight:900; font-size:13px; color:#7a5a1a; white-space:nowrap; }
.pu-cost.short { color:#b0504a; }
.pu-roles { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-bottom:8px; }
.pu-roles div { border-radius:9px; padding:5px 2px; text-align:center; background:#fff; border:2px solid #e3d8c3; }
.pu-roles div.zero { opacity:0.5; }
.pu-roles b { display:block; font-size:16px; font-weight:900; }
.pu-roles small { font-size:11px; font-weight:800; color:#7a6a5a; }
.pu-eq { display:flex; align-items:center; gap:6px; font-size:12px; padding:4px 6px; border-radius:8px; background:#faf6ee; margin-top:3px; border-left:4px solid #ccc; }
.pu-eq .gn { font-size:10px; font-weight:800; color:#8a7a6a; margin-left:auto; white-space:nowrap; }
`;
    document.head.appendChild(s);
  }

  // 등급색은 Items.GRADES 그대로 쓰되, 일반(#f2f2f2)은 흰 바탕에서 안 보여 글자만 어둡게 바꾼다
  function gradeColor(grade) { const g = typeof Items !== 'undefined' && Items.GRADES ? Items.GRADES[grade] : null; return g ? g.color : '#999'; }
  function gradeText(grade) { return grade === 'common' || !grade ? '#3a3030' : gradeColor(grade); }

  // 스프라이트 첫 프레임을 2배로 그린 초상화(캔버스 복사) — 스프라이트 모듈이 없으면 직업 아이콘만
  function portrait(m, small) {
    const box = el('div', { class: 'pu-portrait' + (small ? ' sm' : '') });
    try {
      if (typeof Sprites !== 'undefined') {
        const kind = m.isPlayer ? 'player' : ((Sprites.NPC_PALETTES && Sprites.NPC_PALETTES[m.cls]) ? m.cls : (CLASS_LOOK[m.cls] || 'villagerA'));
        const sheet = Sprites.get(kind), f = sheet && sheet.down && sheet.down[0];
        if (f) { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(f, 0, 0); box.appendChild(c); }
      }
    } catch (e) { /* 초상화는 장식이라 실패해도 화면은 그린다 */ }
    box.appendChild(el('span', { class: 'ci', text: CLASS_ICON[m.cls] || '❔' }));
    return box;
  }
  function roleChip(role) {
    return el('span', { class: 'pu-role', style: { background: ROLE_COLOR[role] || '#8a7a6a' }, text: `${ROLE_ICON[role] || ''} ${roleName(role)}` });
  }
  // 카드에 쓸 핵심 수치: 최대 HP·공격(직업 dmgStat 기준)·방어
  function keyStats(m, G) {
    let d = null;
    try { d = Stats.derive(m, G); } catch (e) { d = null; }
    if (!d) return { hp: m.hp || 0, atk: 0, def: 0, d: null };
    const cd = typeof Classes !== 'undefined' ? Classes.get(m.cls) : null;
    const ds = cd ? cd.dmgStat : 'atk';
    const atk = ds === 'matk' ? d.matk : ds === 'hybrid' ? (d.atk + d.matk) / 2 : d.atk;
    return { hp: d.maxHp, atk: Math.round(atk), def: Math.round(d.def), d, magic: ds === 'matk' };
  }
  function statLine(m, G) {
    const k = keyStats(m, G);
    return el('div', { class: 'pu-stats' }, [
      el('span', { text: `❤️ ${Math.round(k.hp)}` }),
      el('span', { text: `${k.magic ? '🔥' : '⚔️'} ${k.atk}` }),
      el('span', { text: `🛡 ${k.def}` }),
    ]);
  }
  // 파티원 카드 — opts: { side: [노드], quote: bool, tag: string, guild: bool }
  function memberCard(m, G, opts = {}) {
    return el('div', { class: 'pu-card' + (opts.guild ? ' guild' : '') }, [
      portrait(m),
      el('div', { class: 'pu-main' }, [
        el('div', { class: 'pu-name' }, [m.name, el('span', { class: 'lv', text: `Lv.${m.level}` }), opts.tag ? el('span', { class: 'pu-tag', text: opts.tag }) : null]),
        el('div', { class: 'pu-sub' }, [roleChip(m.role), ` ${className(m.cls)}`]),
        statLine(m, G),
        opts.quote !== false && m.personality ? el('div', { class: 'pu-quote', text: `“${m.personality}”` }) : null,
      ]),
      opts.side && opts.side.length ? el('div', { class: 'pu-side' }, opts.side) : null,
    ]);
  }
  // 역할 구성 요약 — Party.roles 는 플레이어를 세지 않으므로 힐러(나) 1을 더한다
  function roleSummary(G, extraHealer = 1) {
    const r = typeof Party !== 'undefined' ? Party.roles(G) : { tank: 0, melee: 0, ranged: 0, healer: 0 };
    const counts = { tank: r.tank || 0, melee: r.melee || 0, ranged: r.ranged || 0, healer: (r.healer || 0) + extraHealer };
    const grid = el('div', { class: 'pu-roles' }, ['tank', 'melee', 'ranged', 'healer'].map((k) => el('div', { class: counts[k] ? '' : 'zero', style: { borderColor: counts[k] ? ROLE_COLOR[k] : '#e3d8c3' } }, [
      el('b', { style: { color: ROLE_COLOR[k] }, text: `${ROLE_ICON[k]} ${counts[k]}` }), el('small', { text: ROLE_SHORT[k] }),
    ])));
    return { grid, counts, advice: roleAdvice(counts, (Party.members(G) || []).length) };
  }
  // 구성 조언 한 줄 — 1~5층에선 탱커가 없으면 힐러가 맞기 시작하므로 가장 먼저 알린다
  function roleAdvice(c, n) {
    if (n === 0) return { warn: true, text: '파티원이 없어요. 모험가 사무소 구인구직 게시판에서 힐러를 구하는 파티에 지원해 보세요.' };
    if (!c.tank) return { warn: true, text: '탱커가 없어요! 몬스터가 힐러를 노리기 쉬워요.' };
    if (!c.melee && !c.ranged) return { warn: true, text: '딜러가 없어요. 전투가 아주 길어질 거예요.' };
    if (c.tank >= 3) return { warn: true, text: '탱커가 많아 화력이 약해요.' };
    if (n < 4) return { warn: false, text: `균형 잡힌 구성이에요. 자리가 ${4 - n}칸 남았어요.` };
    return { warn: false, text: '균형 잡힌 구성이에요.' };
  }

  // ================= 파티 화면 =================
  function playerAsMember(G) {
    const p = G.player;
    return { isPlayer: true, uid: 'player', name: p.name, cls: p.cls || 'priest', role: 'healer', level: p.level, xp: p.xp, stats: p.stats, equipment: p.equipment, hp: p.hp, mp: p.mp, src: p };
  }
  function slotRow(G, list, selUid, onPick, api) {
    const row = el('div', { class: 'pt-slots' });
    for (let i = 0; i < 5; i++) {
      const m = list[i];
      if (!m) {
        row.appendChild(el('button', { class: 'pt-slot empty', onClick: () => { api.open('adventurer', { view: 'find' }); } }, [el('span', { class: 'plus', text: '＋' }), el('small', { text: '파티 찾기' })]));
        continue;
      }
      row.appendChild(el('button', { class: 'pt-slot' + (m.uid === selUid ? ' sel' : ''), onClick: () => onPick(m.uid) }, [
        portrait(m, true),
        el('small', { text: m.isPlayer ? '나' : m.name }),
        el('i', { style: { background: ROLE_COLOR[m.role] } }),
      ]));
    }
    return row;
  }
  function eqRow(slotLabel, inst) {
    if (!inst) return el('div', { class: 'pu-eq', style: { borderLeftColor: '#e3d8c3', color: '#b0a090' } }, [`${slotLabel}: 없음`]);
    const d = typeof Items !== 'undefined' ? Items.get(inst.id) : null;
    const gname = typeof Items !== 'undefined' ? Items.gradeName(inst.grade) : inst.grade;
    const dur = inst.maxDurability ? ` · 내구 ${Math.round(inst.durability)}/${inst.maxDurability}` : '';
    return el('div', { class: 'pu-eq', style: { borderLeftColor: gradeColor(inst.grade) } }, [
      el('span', { text: (d && d.icon) || '📦' }),
      el('b', { style: { color: gradeText(inst.grade) }, text: (d && d.name) || inst.id }),
      el('span', { class: 'gn', text: `${slotLabel} · ${gname}${dur}` }),
    ]);
  }
  function detail(G, m, api) {
    const k = keyStats(m, G), d = k.d || {};
    const prog = typeof Level !== 'undefined' ? Level.progress(m.isPlayer ? G.player : m) : { xp: m.xp || 0, need: 100, max: false };
    const box = el('div', { class: 'pt-detail' });
    box.appendChild(el('div', { class: 'pt-head' }, [
      portrait(m),
      el('div', { class: 'pu-main' }, [
        el('div', { class: 'pu-name' }, [m.name, el('span', { class: 'lv', text: `Lv.${m.level}` }), m.isPlayer ? el('span', { class: 'pu-tag', text: '나' }) : null, m.guildId ? el('span', { class: 'pu-tag', text: '길드원' }) : null]),
        el('div', { class: 'pu-sub' }, [roleChip(m.role), ` ${className(m.cls)}`]),
        m.personality ? el('div', { class: 'pu-quote', text: `“${m.personality}”` }) : null,
      ]),
    ]));
    const bars = el('div', { class: 'pt-bars' }, [
      el('label', { text: prog.max ? '경험치 (만렙)' : '경험치' }), prog.max ? UI.bar(1, 1, 'xp') : UI.bar(prog.xp, prog.need, 'xp'),
      el('label', { text: 'HP' }), UI.bar(Math.min(m.hp || 0, d.maxHp || 0), d.maxHp || 0, 'hp'),
      el('label', { text: 'MP' }), UI.bar(Math.min(m.mp || 0, d.maxMp || 0), d.maxMp || 0, 'mp'),
    ]);
    if (m.isPlayer) { bars.appendChild(el('label', { text: '피로' })); bars.appendChild(UI.bar(G.player.fatigue || 0, 100, 'fatigue')); }
    box.appendChild(bars);
    // 1차 스탯: 직업 주 스탯은 강조해 어떤 성장형인지 보이게
    const cd = typeof Classes !== 'undefined' ? Classes.get(m.cls) : null;
    const prim = (cd && cd.primary) || [];
    const names = (typeof Stats !== 'undefined' && Stats.NAMES) || UI.STAT_NAMES;
    box.appendChild(el('div', { class: 'ui-section-title', text: '능력치' }));
    box.appendChild(el('div', { class: 'pt-grid' }, ['str', 'def', 'agi', 'sta', 'int', 'vit'].map((s) => el('div', { class: prim.includes(s) ? 'pri' : '' }, [el('small', { text: names[s] || s }), el('b', { text: String(Math.round(d[s] != null ? d[s] : (m.stats || {})[s] || 0)) })]))));
    const derived = [
      ['공격력', Math.round(d.atk || 0)], ['마법 공격', Math.round(d.matk || 0)], ['공격 속도', `×${(d.atkSpeed || 1).toFixed(2)}`],
      ['회피', `${(d.evasion || 0).toFixed(1)}%`], ['치명타', `${(d.crit || 0).toFixed(1)}%`], ['이동 속도', Math.round(d.moveSpeed || 0)],
    ];
    if (m.isPlayer) derived.splice(1, 1, ['치유력', Math.round(d.healPower || 0)]);
    box.appendChild(el('div', { class: 'pt-grid derived' }, derived.map(([a, b]) => el('div', {}, [el('small', { text: a }), el('b', { text: String(b) })]))));
    // 장비: 파티원은 옷·무기 두 칸, 나는 장착한 것 전부
    box.appendChild(el('div', { class: 'ui-section-title', text: '장비' }));
    if (m.isPlayer) {
      const eq = typeof Inventory !== 'undefined' ? Inventory.equipped(G) : [];
      if (!eq.length) box.appendChild(UI.empty('장착한 장비가 없어요. 가방에서 장착해 보세요.'));
      for (const { slot, inst } of eq) box.appendChild(eqRow(UI.SLOT_NAMES[slot.replace(/\d$/, '')] || slot, inst));
    } else {
      box.appendChild(eqRow('무기', m.equipment && m.equipment.main));
      box.appendChild(eqRow('옷', m.equipment && m.equipment.body));
    }
    if (!m.isPlayer && typeof Skills !== 'undefined') {
      const sk = Skills.member(m.cls).filter((s) => !s.unlockLevel || s.unlockLevel <= m.level).slice(0, 4);
      if (sk.length) {
        box.appendChild(el('div', { class: 'ui-section-title', text: '자동 스킬' }));
        box.appendChild(el('div', { class: 'pt-skills' }, sk.map((s) => el('span', { text: s.name }))));
      }
    }
    const actions = [];
    if (m.isPlayer) { actions.push(el('button', { class: 'btn ghost', text: '가방', onClick: () => api.open('inventory') })); actions.push(el('button', { class: 'btn', text: '능력치·스킬', onClick: () => api.open('status') })); }
    else actions.push(el('button', { class: 'btn danger', text: '해고', onClick: () => dismissFlow(G, m, api) }));
    box.appendChild(el('div', { class: 'pt-actions' }, actions));
    return box;
  }
  // 해고 흐름은 사무소 화면과 공유 — 길드원은 명부로 돌아간다는 점을 미리 알린다
  async function dismissFlow(G, m, api) {
    const back = m.guildId && G.guild && G.guild.id === m.guildId;
    const msg = back ? `${josa(m.name, '을/를')} 파티에서 뺄까요?\n길드 명부로 돌아가 언제든 다시 영입할 수 있어요.` : `${josa(m.name, '을/를')} 해고할까요?\n고용비는 돌려받지 못하고, 다시 고용할 수 없어요.`;
    const yes = await api.confirm(msg, { ok: back ? '빼기' : '해고', cancel: '취소' });
    if (!yes) return;
    const r = Facilities.adventurer.dismiss(G, m.uid);
    if (r.ok) { save(); api.toast(r.returnedToGuild ? `${josa(m.name, '이/가')} 길드 명부로 돌아갔어요` : `${josa(m.name, '과/와')} 작별했어요`); }
    else api.toast(r.reason === 'not_found' ? '파티에서 찾을 수 없어요' : '할 수 없어요');
    api.refresh();
  }

  function injectPartyStyle() {
    if (document.getElementById('ui-party-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-party-style';
    s.textContent = `
.pt-slots { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; margin-bottom:8px; }
.pt-slot { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; padding:5px 2px 6px; min-height:78px; border:2px solid #e3d8c3; border-radius:10px; background:#fff; font-family:inherit; color:#4a3a30; }
.pt-slot small { font-size:11px; font-weight:800; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pt-slot i { position:absolute; left:6px; right:6px; bottom:2px; height:3px; border-radius:2px; }
.pt-slot.sel { border-color:#5aa84a; box-shadow:0 0 0 2px #bfe081; background:#f6fcf0; }
.pt-slot.empty { border-style:dashed; background:#faf6ee; color:#a09080; justify-content:center; }
.pt-slot.empty .plus { font-size:22px; font-weight:900; }
.pt-detail { background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:10px; }
.pt-head { display:flex; gap:10px; align-items:flex-start; margin-bottom:8px; }
.pt-bars { display:grid; grid-template-columns:52px 1fr; gap:4px 8px; align-items:center; margin-bottom:6px; }
.pt-bars label { font-size:11px; font-weight:800; color:#7a6a5a; }
.pt-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
.pt-grid div { background:#faf6ee; border-radius:8px; padding:4px 7px; display:flex; justify-content:space-between; align-items:baseline; }
.pt-grid div.pri { background:#fff0c8; box-shadow:inset 0 0 0 1px #e3c98a; }
.pt-grid small { font-size:11px; color:#7a6a5a; font-weight:700; }
.pt-grid b { font-size:14px; font-weight:900; font-variant-numeric:tabular-nums; }
.pt-grid.derived { margin-top:5px; }
.pt-grid.derived div { background:#f1f5fa; }
.pt-skills { display:flex; flex-wrap:wrap; gap:5px; }
.pt-skills span { font-size:12px; font-weight:800; color:#5a3a8a; background:#f1eafb; border-radius:7px; padding:3px 8px; }
.pt-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
.pt-actions .btn { min-height:44px; }
`;
    document.head.appendChild(s);
  }

  UI.register('party', {
    title: '파티',
    render(root, params, api) {
      injectStyle(); injectPartyStyle();
      const G = State.get();
      const members = Party.members(G);
      const list = [playerAsMember(G)].concat(members);
      if (!list.find((m) => m.uid === params.sel)) params.sel = members[0] ? members[0].uid : 'player';
      const sum = roleSummary(G);
      root.appendChild(el('div', { class: 'pu-top' }, [el('b', { text: `👥 파티 ${members.length + 1} / 5` }), el('small', { text: `파티원 ${members.length}/${Party.MAX} · 평균 Lv.${Math.round(list.reduce((a, m) => a + m.level, 0) / list.length)}` })]));
      root.appendChild(sum.grid);
      root.appendChild(el('div', { class: sum.advice.warn ? 'pu-warn' : 'pu-ok', text: sum.advice.text }));
      root.appendChild(slotRow(G, list, params.sel, (uid) => { params.sel = uid; api.refresh(); }, api));
      const m = list.find((x) => x.uid === params.sel);
      if (m) root.appendChild(detail(G, m, api));
    },
  });

  return { injectStyle, portrait, roleChip, memberCard, statLine, keyStats, roleSummary, dismissFlow, gradeColor, gradeText, className, roleName, CLASS_ICON, ROLE_ICON, ROLE_COLOR, ROLE_SHORT, save, josa };
})();
if (typeof module !== 'undefined') module.exports = PartyUI;
