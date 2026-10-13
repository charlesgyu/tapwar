// 상태 화면 — 플레이어 프로필(XP·HP·MP·피로), 스탯 포인트 분배, 파생 능력치, 주력 힐 선택, 자동 설정, 저장/처음부터.
// 스탯 줄마다 "1포인트가 무엇을 올리는지"를 같이 적어, 숫자만 보고는 모르는 선택을 돕는다.
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
  const STAT_INFO = {
    int: { icon: '🔮', name: '지능', per: '치유력 +1.6 · 최대 MP +9' },
    vit: { icon: '❤️', name: '체력', per: '최대 HP +12' },
    sta: { icon: '🥾', name: '지구력', per: '피로 증가 약 -2%' },
    agi: { icon: '💨', name: '민첩', per: '회피 +0.4% · 치명 +0.25%' },
    def: { icon: '🛡️', name: '방어력', per: '받는 피해 감소' },
    str: { icon: '💪', name: '힘', per: '공격력 +2' },
  };
  const STAT_ORDER = ['int', 'vit', 'sta', 'agi', 'def', 'str'];
  const SINGLE = ['heal_basic', 'heal_fast', 'heal_instant'];
  const AOE = ['aoe_2', 'aoe_3', 'aoe_ground'];
  const SETTINGS = [
    { key: 'autoHeal', name: '자동 힐', desc: 'HP가 낮은 파티원을 알아서 치유해요. 끄면 직접 눌러야 해요.' },
    { key: 'autoDodge', name: '자동 회피', desc: '붉은 장판이 깔리면 알아서 피해요.' },
    { key: 'autoFollow', name: '자동 따라가기', desc: '조작하지 않을 때 파티 뒤를 따라 걸어요.' },
  ];

  function injectStyle() {
    K.injectStyle();
    if (document.getElementById('ui-st-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-st-style';
    s.textContent = `
.st-prof { display:flex; gap:10px; align-items:center; padding:10px; margin-bottom:8px; background:linear-gradient(#fff8e6,#fff); border:2px solid #e3c98a; border-radius:12px; }
.st-pic { flex:none; width:60px; height:72px; border-radius:10px; background:linear-gradient(#efe3cc,#e2d2b4); border:2px solid #d4c29f; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; }
.st-pic canvas { width:52px; height:65px; image-rendering:pixelated; }
.st-prof .main { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.st-prof .nm { font-weight:900; font-size:16px; display:flex; align-items:baseline; gap:6px; }
.st-prof .nm small { font-size:12px; color:#7a5a3a; font-weight:800; }
.st-bl { display:grid; grid-template-columns:30px 1fr; align-items:center; gap:4px; font-size:10px; font-weight:900; color:#8a7a6a; }
.st-pts { display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-radius:10px; background:#eef6e6; border:2px solid #bfdcab; margin-bottom:6px; font-weight:900; color:#2f6b2f; font-size:13px; }
.st-pts.zero { background:#f3eee4; border-color:#e0d4bf; color:#8a7a6a; }
.st-pts b { font-size:18px; }
.st-stat { display:flex; align-items:center; gap:8px; padding:6px 8px; background:#fff; border:2px solid #e3d8c3; border-radius:10px; margin-bottom:5px; }
.st-stat .ic { font-size:20px; width:26px; text-align:center; flex:none; }
.st-stat .mid { flex:1; min-width:0; }
.st-stat .nm { font-weight:900; font-size:14px; display:flex; align-items:baseline; gap:5px; }
.st-stat .nm .v { font-variant-numeric:tabular-nums; }
.st-stat .nm .eq { font-size:11px; color:#2f8a2f; font-weight:800; }
.st-stat .per { font-size:11px; color:#8a7a6a; line-height:1.3; }
.st-stat .btn { min-width:46px; padding:6px 8px; }
.st-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; padding:8px 10px; background:#fff; border:2px solid #e3d8c3; border-radius:10px; }
.st-grid div { display:flex; justify-content:space-between; font-size:12.5px; color:#6a5a4a; padding:2px 0; border-bottom:1px dashed #eee4d2; }
.st-grid b { color:#2a2020; font-variant-numeric:tabular-nums; }
.st-skl { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:6px; }
.st-opt { position:relative; text-align:left; min-height:92px; padding:7px 7px 6px; border-radius:10px; background:#fff; border:2px solid #e3d8c3; font-family:inherit; color:#2a2020; box-shadow:0 2px 0 #e3d8c3; display:flex; flex-direction:column; gap:2px; }
.st-opt:active { transform:translateY(1px); box-shadow:none; }
.st-opt .n { font-weight:900; font-size:13px; }
.st-opt .m { font-size:10.5px; color:#7a6a5a; line-height:1.35; }
.st-opt .a { font-size:12px; font-weight:900; color:#2f8a2f; margin-top:auto; }
.st-opt.on { border-color:#5aa84a; background:#f2fae9; box-shadow:0 0 0 2px #bfe081; }
.st-opt.on:after { content:'✔'; position:absolute; right:6px; top:4px; color:#3f8f3f; font-weight:900; }
.st-opt.lock { background:#f3eee4; color:#9a8a7a; box-shadow:none; }
.st-opt.lock .a { color:#a08a70; }
.st-sub { font-size:12px; font-weight:800; color:#6a5040; margin:6px 2px 4px; }
.st-tog { display:flex; align-items:center; gap:10px; padding:8px 10px; background:#fff; border:2px solid #e3d8c3; border-radius:10px; margin-bottom:5px; min-height:52px; width:100%; text-align:left; font-family:inherit; color:#2a2020; }
.st-tog .mid { flex:1; }
.st-tog .n { font-weight:900; font-size:14px; }
.st-tog .d { font-size:11px; color:#8a7a6a; line-height:1.35; }
.st-sw { flex:none; width:50px; height:28px; border-radius:14px; background:#d9cdb5; position:relative; transition:background 0.15s; }
.st-sw:after { content:''; position:absolute; left:3px; top:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.3); transition:left 0.15s; }
.st-tog.on .st-sw { background:#5aa84a; }
.st-tog.on .st-sw:after { left:25px; }
.st-foot { display:flex; gap:8px; margin:12px 0 4px; }
.st-foot .btn { flex:1; }
`;
    document.head.appendChild(s);
  }

  function portrait() {
    const box = el('div', { class: 'st-pic' });
    try {
      const s = typeof Sprites !== 'undefined' ? Sprites.get('player') : null;
      const f = s && s.down ? s.down[0] : null;
      if (f) { const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(f, 0, 0); box.appendChild(c); return box; }
    } catch (e) { /* 스프라이트가 없으면 이모지로 */ }
    box.textContent = '🧝'; box.style.fontSize = '34px'; box.style.alignItems = 'center';
    return box;
  }
  function profile(g, d) {
    const p = g.player, pr = Level.progress(p);
    return el('div', { class: 'st-prof' }, [
      portrait(),
      el('div', { class: 'main' }, [
        el('div', { class: 'nm' }, [p.name, el('small', { text: `Lv.${pr.level} 사제${pr.max ? ' (MAX)' : ''}` })]),
        el('div', { class: 'st-bl' }, [el('span', { text: 'XP' }), pr.max ? UI.bar(1, 1, 'xp') : UI.bar(pr.xp, pr.need, 'xp')]),
        el('div', { class: 'st-bl' }, [el('span', { text: 'HP' }), UI.bar(Math.min(p.hp || 0, d.maxHp), d.maxHp, 'hp')]),
        el('div', { class: 'st-bl' }, [el('span', { text: 'MP' }), UI.bar(Math.min(p.mp || 0, d.maxMp), d.maxMp, 'mp')]),
        el('div', { class: 'st-bl' }, [el('span', { text: '피로' }), UI.bar(p.fatigue || 0, 100, 'fatigue')]),
      ]),
    ]);
  }

  function allocate(api, g, stat, n) {
    const r = Level.allocate(g, stat, n);
    if (r && r.ok) { K.save(); api.toast(`${STAT_INFO[stat].name} +${n}`, 1200); }
    else api.toast(K.reason(r));
    api.refresh();
  }
  function statSection(api, g, d) {
    const p = g.player, pts = p.statPoints || 0;
    const rows = STAT_ORDER.map((k) => {
      const base = p.stats[k] || 0, total = Math.round(d[k] || 0), bonus = total - base;
      const info = STAT_INFO[k];
      return el('div', { class: 'st-stat' }, [
        el('div', { class: 'ic', text: info.icon }),
        el('div', { class: 'mid' }, [
          el('div', { class: 'nm' }, [info.name, el('span', { class: 'v', text: String(total) }), bonus ? el('span', { class: 'eq', text: `(기본 ${base} ${bonus > 0 ? '+' : ''}${bonus})` }) : null]),
          el('div', { class: 'per', text: '1점당 ' + info.per }),
        ]),
        el('button', { class: 'btn primary', text: '+1', disabled: pts < 1, 'aria-label': `${info.name} 1 올리기`, onClick: () => allocate(api, g, k, 1) }),
        el('button', { class: 'btn', text: '+5', disabled: pts < 5, 'aria-label': `${info.name} 5 올리기`, onClick: () => allocate(api, g, k, 5) }),
      ]);
    });
    return UI.section('📊 스탯', [
      el('div', { class: 'st-pts' + (pts ? '' : ' zero') }, [el('span', { text: pts ? '분배할 스탯 포인트' : '레벨이 오르면 포인트 5개를 얻어요' }), el('b', { text: String(pts) })]),
      ...rows,
    ]);
  }
  function derivedSection(d) {
    const pairs = [
      ['최대 HP', Math.round(d.maxHp)], ['최대 MP', Math.round(d.maxMp)],
      ['치유력', d.healPower.toFixed(1)], ['마나 회복', `${d.mpRegen.toFixed(2)}/초`],
      ['시전 속도', `${Math.round((1 / (d.castSpeed || 1)) * 100)}%`], ['마나 소비', `${Math.round((d.mpCostMult || 1) * 100)}%`],
      ['회피', `${d.evasion.toFixed(1)}%`], ['치명타', `${d.crit.toFixed(1)}%`],
      ['방어력', Math.round(d.def)], ['이동 속도', Math.round(d.moveSpeed)],
      ['피로 효율', `${Math.round((d.fatigueMult || 1) * 100)}%`], ['피로 증가', `×${(d.fatigueGainMult || 1).toFixed(2)}`],
    ];
    return UI.section('📈 능력치 (장비·세트·각인·피로 반영)', el('div', { class: 'st-grid' }, pairs.map(([k, v]) => el('div', {}, [el('span', { text: k }), el('b', { text: String(v) })]))));
  }

  function skillOpt(api, g, id, slotKey, caster) {
    const d = Skills.get(id); if (!d) return null;
    const lv = Level.skillLevel(g, id), unlocked = lv > 0;
    const on = g.player.active && g.player.active[slotKey] === id;
    const ct = Skills.castTime(d, caster), mp = Skills.mpCost(d, caster), amt = Skills.healAmount(d, caster, Math.max(1, lv));
    const meta = [ct > 0 ? `시전 ${ct.toFixed(1)}초` : '즉시 시전', `MP ${mp}`];
    if (d.cooldown) meta.push(`쿨 ${d.cooldown}초`);
    const amount = d.type === 'ground_heal' ? `초당 ${amt} · ${d.duration || 6}초` : (d.targets > 1 ? `${amt} ×${d.targets}명` : `회복 ${amt}`);
    return el('button', {
      class: 'st-opt' + (on ? ' on' : '') + (unlocked ? '' : ' lock'), 'aria-pressed': on ? 'true' : 'false',
      onClick: () => {
        if (!unlocked) { api.toast(`Lv.${d.unlockLevel}에 배워요`); return; }
        if (on) return;
        g.player.active = Object.assign({}, g.player.active, { [slotKey]: id });
        K.save(); api.toast(`${slotKey === 'single' ? '단일 힐' : '광역 힐'}: ${d.name}`, 1200); api.refresh();
      },
    }, [
      el('div', { class: 'n', text: (unlocked ? '' : '🔒 ') + d.name + (unlocked && lv > 1 ? ` Lv.${lv}` : '') }),
      el('div', { class: 'm', text: meta.join(' · ') }),
      el('div', { class: 'a', text: unlocked ? amount : `Lv.${d.unlockLevel} 해금` }),
    ]);
  }
  function skillSection(api, g, d) {
    const caster = { stats: d };
    return UI.section('✨ 주력 힐', [
      el('div', { class: 'hk-hint', text: '자동 힐과 스킬 바의 힐 버튼이 여기서 고른 기도를 써요. 스킬 레벨은 신전에서 올려요.' }),
      el('div', { class: 'st-sub', text: '단일 힐' }),
      el('div', { class: 'st-skl' }, SINGLE.map((id) => skillOpt(api, g, id, 'single', caster))),
      el('div', { class: 'st-sub', text: '광역 힐' }),
      el('div', { class: 'st-skl' }, AOE.map((id) => skillOpt(api, g, id, 'aoe', caster))),
    ]);
  }
  function settingsSection(api, g) {
    const st = g.player.settings || (g.player.settings = {});
    return UI.section('⚙️ 설정', SETTINGS.map((s) => el('button', {
      class: 'st-tog' + (st[s.key] ? ' on' : ''), role: 'switch', 'aria-checked': st[s.key] ? 'true' : 'false',
      onClick: () => { st[s.key] = !st[s.key]; K.save(); api.toast(`${s.name} ${st[s.key] ? '켬' : '끔'}`, 1000); api.refresh(); },
    }, [el('div', { class: 'mid' }, [el('div', { class: 'n', text: s.name }), el('div', { class: 'd', text: s.desc })]), el('div', { class: 'st-sw' })])));
  }

  // 처음부터: 저장을 지우고 새 게임 → 프롤로그 → 마을. 부트(main.js)의 startNewGame 이 있으면 그걸 써서 자동 저장 플래그까지 맞춘다.
  async function restart(api) {
    const ok = await api.confirm('정말 처음부터 시작할까요?\n지금까지의 레벨·장비·퀘스트 진행이 모두 사라져요.', { ok: '처음부터', cancel: '취소' });
    if (!ok) return;
    UI.close(true);
    State.reset();
    if (typeof Boot !== 'undefined' && Boot.startNewGame) { await Boot.startNewGame(); return; }
    State.newGame('리프');
    K.save();
    if (typeof Story !== 'undefined' && Story.prologue) await UI.story(Story.prologue, '프롤로그');
    if (typeof Scenes !== 'undefined') Scenes.go('town');
  }

  UI.register('status', {
    title: '상태',
    full: true,
    render(root, params, api) {
      injectStyle();
      root.classList.add('hk-root');
      const g = G();
      let d;
      try { d = Stats.derive(g.player, g); } catch (e) { root.appendChild(UI.empty('능력치를 계산할 수 없어요')); return; }
      root.appendChild(profile(g, d));
      root.appendChild(statSection(api, g, d));
      root.appendChild(skillSection(api, g, d));
      root.appendChild(derivedSection(d));
      root.appendChild(settingsSection(api, g));
      root.appendChild(el('div', { class: 'st-foot' }, [
        el('button', { class: 'btn primary', text: '💾 저장', onClick: () => { const ok = (() => { try { return State.save(); } catch (e) { return false; } })(); api.toast(ok ? '저장했어요' : '이 환경에서는 저장할 수 없어요'); } }),
        el('button', { class: 'btn danger', text: '처음부터', onClick: () => restart(api) }),
      ]));
      root.appendChild(el('div', { class: 'hk-hint', style: { textAlign: 'center' }, text: `플레이 ${Math.floor((g.playTime || 0) / 60)}분 · ${g.day || 1}일째 · 최고 ${(g.tower && g.tower.highestCleared) || 0}층 돌파` }));
      if (typeof params._scroll === 'number') root.scrollTop = params._scroll;
      root.onscroll = () => { params._scroll = root.scrollTop; };
    },
  });
})();
