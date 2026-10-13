// 신전 화면 — 사제 스킬 전부를 해금 순서대로 보여 주고, 현재 레벨 → 다음 레벨의 효과 수치를 비교해 강화한다.
// 효과 수치는 Skills.healAmount 등으로 지금 내 스탯(장비·피로 반영)을 넣어 계산해 "실제로 얼마나 좋아지는지"를 보여 준다.
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
  const TYPE_KO = { single_heal: '단일 힐', aoe_heal: '광역 힐', ground_heal: '바닥 힐', ultimate: '필살기', buff: '축복', cleanse: '해제', smite: '공격', resurrect: '부활' };
  const pct = (v) => `${Math.round(v * 100)}%`;

  // 레벨 lv 에서의 핵심 효과 [앞말, 수치, 뒷말]. 수치만 따로 떼어 "회복 96 → 102" 처럼 바뀌는 부분만 비교한다.
  // 비율형(필살기·부활)은 target 없이 부르면 비율 자체가 나온다.
  function effectAt(d, caster, lv) {
    switch (d.type) {
      case 'single_heal': return ['회복', `${Skills.healAmount(d, caster, lv)}`, ''];
      case 'aoe_heal': return ['1인당 회복', `${Skills.healAmount(d, caster, lv)}`, ` ×${d.targets}명`];
      case 'ground_heal': return ['초당 회복', `${Skills.healAmount(d, caster, lv)}`, ` · ${d.duration || 6}초`];
      case 'ultimate': return ['전원 최대 HP의', pct(Skills.healAmount(d, caster, lv)), ' 회복'];
      case 'resurrect': return ['HP', pct(Skills.healAmount(d, caster, lv)), '로 부활'];
      case 'smite': return ['언데드 피해', `${Skills.damageAmount(d, caster, lv)}`, ''];
      case 'buff': {
        const v = Skills.buffValue(d, lv);
        const name = (Skills.BUFF_STATS && Skills.BUFF_STATS[d.buff.stat]) || d.buff.stat;
        return [name, `${v < 0 ? '-' : '+'}${pct(Math.abs(v))}`, ` · ${d.duration || 60}초`];
      }
      case 'cleanse': return ['저주', `${(d.power && d.power.count) || 1}개`, ' 해제'];
      default: return ['', '', ''];
    }
  }
  function metaLine(d, caster) {
    const parts = [];
    const ct = Skills.castTime(d, caster);
    parts.push(ct > 0 ? `시전 ${ct.toFixed(1)}초` : '즉시 시전');
    parts.push(`MP ${Skills.mpCost(d, caster)}`);
    if (d.cooldown) parts.push(`쿨 ${d.cooldown >= 60 ? Math.round(d.cooldown / 60) + '분' : d.cooldown + '초'}`);
    return parts.join(' · ');
  }

  // 레벨 점: 10칸 막대로 성장 정도를 한눈에
  function pips(lv, max) {
    const box = el('div', { class: 'tpl-pips' });
    for (let i = 1; i <= max; i++) box.appendChild(el('i', { class: i <= lv ? 'on' : '' }));
    return box;
  }

  function skillCard(api, g, s, caster) {
    const d = Skills.get(s.id);
    const lv = s.level, max = s.maxLevel || 10;
    const locked = !s.unlocked, maxed = !locked && s.cost == null;
    const cost = Facilities.temple.cost(g, s.id);
    const goldOk = cost != null && (g.player.gold || 0) >= cost;
    const now = effectAt(d, caster, Math.max(1, lv));
    const next = !locked && !maxed ? effectAt(d, caster, lv + 1) : null;
    const isActive = g.player.active && (g.player.active.single === s.id || g.player.active.aoe === s.id);

    const head = el('div', { class: 'tpl-head' }, [
      el('span', { class: 'tpl-name', text: d.name }),
      el('span', { class: 'fac-badge', text: TYPE_KO[d.type] || d.type }),
      isActive ? el('span', { class: 'fac-badge blue', text: '사용 중' }) : null,
      locked ? el('span', { class: 'fac-badge warn', text: `🔒 Lv.${s.unlockLevel} 해금` }) : el('span', { class: 'tpl-lv', text: `Lv.${lv}/${max}` }),
    ]);
    // 다음 레벨과 수치가 같으면(저주 해제처럼 레벨 효과가 없는 기도) 화살표를 생략해 오해를 줄인다
    const changes = next && next[1] !== now[1];
    const effect = el('div', { class: 'tpl-effect' }, [
      `${now[0]} `, el('span', { text: now[1] }),
      changes ? el('b', { text: ' → ' }) : null,
      changes ? el('span', { class: 'tpl-next', text: next[1] }) : null,
      now[2],
    ]);
    let side;
    if (locked) side = el('div', { class: 'tpl-state', text: '🔒' });
    else if (maxed) side = el('div', { class: 'tpl-state max', text: '⭐ 만렙' });
    else side = el('div', { class: 'item-side' }, [
      el('div', { class: 'item-price', style: { color: goldOk ? '#7a5a1a' : '#b0403a' }, text: `🪙 ${cost.toLocaleString('ko-KR')}` }),
      el('button', { class: 'btn small primary', text: '강화', disabled: !goldOk,
        onClick: () => K.done(api, Facilities.temple.upgrade(g, s.id), (r) => `✨ ${d.name} Lv.${r.level}! (-${r.cost.toLocaleString('ko-KR')})`) }),
    ]);

    return el('div', { class: 'tpl-card' + (locked ? ' locked' : '') }, [
      el('div', { class: 'tpl-main' }, [
        head,
        locked ? null : pips(lv, max),
        effect,
        el('div', { class: 'tpl-meta', text: metaLine(d, caster) }),
        el('div', { class: 'item-desc', text: d.desc }),
      ]),
      side,
    ]);
  }

  function injectLocal() {
    if (document.getElementById('ui-tpl-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-tpl-style';
    s.textContent = `
.tpl-card { display:flex; gap:8px; align-items:center; background:#fff; border:2px solid #e3c98a; border-radius:10px; padding:8px 10px; margin-bottom:6px; }
.tpl-card.locked { background:#f4f0e8; border-color:#e0d6c4; }
.tpl-card.locked .tpl-name, .tpl-card.locked .tpl-effect { color:#9a8a7a; }
.tpl-main { flex:1; min-width:0; }
.tpl-head { display:flex; align-items:center; flex-wrap:wrap; gap:2px; }
.tpl-name { font-weight:900; font-size:14px; color:#3a2a20; margin-right:2px; }
.tpl-lv { margin-left:auto; font-size:12px; font-weight:900; color:#a07a1a; }
.tpl-pips { display:flex; gap:2px; margin:4px 0 3px; }
.tpl-pips i { flex:1; height:5px; border-radius:3px; background:#eadfca; }
.tpl-pips i.on { background:linear-gradient(#ffe08a, #e0a43a); }
.tpl-effect { font-size:13px; font-weight:800; color:#2f6b2f; }
.tpl-effect b { color:#a07a1a; }
.tpl-next { color:#1f8a3a; background:#e6f6dc; border-radius:4px; padding:0 3px; }
.tpl-card .item-desc { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.tpl-meta { font-size:11px; color:#7a6a5a; margin-top:1px; }
.tpl-state { flex:none; min-width:64px; text-align:center; font-size:12px; font-weight:900; color:#9a8a7a; }
.tpl-state.max { color:#c08a1a; }
.tpl-card .btn.small { min-height:44px; min-width:64px; font-size:13px; }
`;
    document.head.appendChild(s);
  }

  UI.register('temple', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.temple : '신전'),
    render(root, params, api) {
      K.injectStyle(); injectLocal();
      root.classList.add('fac-root');
      const g = G();
      // 1~5챕터의 장로는 탑에 갇혀 '기도의 수정' 너머로만 말한다(DESIGN §3.6) — 초상 대신 수정을 보여 준다
      // 대사 자체가 '(수정 너머로)' 로 시작하는 경우(힌트 대사)도 있어 대사 내용까지 본다
      const chapterBehind = ((g.story && g.story.chapter) || 1) < 6;
      const hello = K.npc('priest_elder', g, { cache: params, icon: (line) => (chapterBehind || /수정 너머/.test(line) ? '🔮' : null) });
      const list = Facilities.temple.skills(g);
      const learned = list.filter((s) => s.unlocked).length;
      root.appendChild(K.top(g, `🙏 기도 ${learned}/${list.length}`));
      if (hello) root.appendChild(hello);
      root.appendChild(el('div', { class: 'fac-hint', text: '강화할수록 회복량이 레벨당 8%, 축복 효과가 5%씩 커져요. 수치는 지금 내 지능·장비·피로를 반영한 값이에요.' }));
      // 캐스터 스탯은 한 번만 계산해 모든 카드에 쓴다(카드마다 derive 하면 낭비)
      const caster = { stats: Stats.derive(g.player, g) };
      const unlocked = list.filter((s) => s.unlocked), locked = list.filter((s) => !s.unlocked);
      root.appendChild(UI.section(`✨ 배운 기도 (${unlocked.length})`, unlocked.map((s) => skillCard(api, g, s, caster))));
      if (locked.length) root.appendChild(UI.section(`🔒 아직 배우지 못한 기도 (${locked.length})`, locked.map((s) => skillCard(api, g, s, caster))));
    },
  });
})();
