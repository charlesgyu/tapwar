// 여관 화면 — 현재 피로·HP·MP 와 음식 버프를 보여 주고, 음식 3종(피로 회복+10분 버프)과 숙박(하루 넘기기)을 판다.
// 숙박은 일일 퀘스트를 갈아엎으므로 진행 중인 일일 퀘스트가 있으면 한 번 묻는다.
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
  const STAT_KO = { vit: '체력', agi: '민첩', int: '지능', str: '힘', def: '방어력', sta: '지구력' };
  const now = (g) => g.playTime || 0;   // 마을에서는 전투 시계가 없으므로 Facilities.inn.eat 과 같은 시계(playTime)를 쓴다

  // 피로 단계 문구: 숫자만으로는 얼마나 위험한지 감이 안 와서 덧붙인다(≥100 이면 탑 입장 불가)
  function fatigueNote(f) {
    if (f >= 100) return { text: '탑에 들어갈 수 없어요! 쉬어야 해요', cls: 'warn' };
    if (f >= 70) return { text: '몹시 지침 · 치유력이 많이 떨어져요', cls: 'warn' };
    if (f >= 40) return { text: '조금 지침 · 치유력이 떨어지기 시작해요', cls: '' };
    return { text: '쌩쌩해요', cls: 'ok' };
  }

  function statusPanel(g) {
    const p = g.player;
    const d = Stats.derive(p, g);
    const f = Math.round(p.fatigue || 0);
    const note = fatigueNote(f);
    const buffs = (p.buffs || []).filter((b) => b.until > now(g));
    return el('div', { class: 'fac-panel' }, [
      el('div', { class: 'fac-lbl' }, [el('span', { text: `😮‍💨 피로` }), el('span', { class: 'fac-badge ' + note.cls, text: note.text })]),
      UI.bar(f, 100, 'fatigue'),
      el('div', { class: 'fac-lbl', text: '❤️ HP' }), UI.bar(p.hp == null ? d.maxHp : p.hp, d.maxHp, 'hp'),
      el('div', { class: 'fac-lbl', text: '💧 MP' }), UI.bar(p.mp == null ? d.maxMp : p.mp, d.maxMp, 'mp'),
      buffs.length ? el('div', { class: 'fac-chips', style: { marginTop: '6px' } }, buffs.map((b) => {
        const left = Math.max(1, Math.ceil((b.until - now(g)) / 60));
        const food = typeof Items !== 'undefined' && Items.get(b.id);
        return el('span', { class: 'fac-chip', text: `${food ? food.icon + ' ' : ''}${STAT_KO[b.stat] || b.stat} +${Math.round(b.value * 100)}% · ${left}분` });
      })) : null,
    ]);
  }

  function menuCard(api, g, m) {
    const afford = (g.player.gold || 0) >= m.price;
    const active = (g.player.buffs || []).some((b) => b.id === m.id && b.until > now(g));
    const c = el('div', { class: 'item-card', 'data-grade': 'common' }, [
      el('div', { class: 'item-icon', text: m.icon || '🍽️' }),
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name' }, [m.name, active ? el('span', { class: 'fac-badge ok', text: '효과 중' }) : null]),
        el('div', { class: 'fac-chips' }, [
          el('span', { class: 'fac-chip', text: `피로 ${m.fatigue}` }),
          el('span', { class: 'fac-chip plain', text: `${STAT_KO[m.buff.stat] || m.buff.stat} +${Math.round(m.buff.value * 100)}% · ${Math.round(m.buff.duration / 60)}분` }),
        ]),
      ]),
      el('div', { class: 'item-side' }, [
        el('div', { class: 'item-price', text: `🪙 ${m.price}` }),
        el('button', { class: 'btn small primary', text: active ? '또 먹기' : '먹기', disabled: !afford,
          onClick: () => K.done(api, Facilities.inn.eat(g, m.id, now(g)), (r) => `${m.icon} ${m.name} 냠냠! 피로 ${Math.round(r.fatigue)} · ${STAT_KO[m.buff.stat] || ''} +${Math.round(m.buff.value * 100)}%`) }),
      ]),
    ]);
    return c;
  }

  async function sleep(api, g) {
    // 진행 중인 일일 퀘스트는 날이 바뀌면 사라지므로 미리 알린다
    let dailyLeft = 0;
    try { dailyLeft = Quests.active(g).filter((q) => q.type === 'daily' && !q.complete).length; } catch (e) { dailyLeft = 0; }
    if (dailyLeft) {
      const yes = await api.confirm(`진행 중인 일일 의뢰 ${dailyLeft}개가 있어요.\n자고 나면 새 의뢰로 바뀌어요. 그래도 잘까요?`, { ok: '잔다' });
      if (!yes) return;
    }
    K.done(api, Facilities.inn.sleep(g), (r) => `🌙 푹 잤어요! ${r.day}일째 아침 · 피로 0, HP/MP 회복 · 일일 의뢰가 새로 바뀌었어요`);
  }

  UI.register('inn', {
    title: () => (typeof Facilities !== 'undefined' && Facilities.NAMES ? Facilities.NAMES.inn : '여관'),
    render(root, params, api) {
      K.injectStyle();
      root.classList.add('fac-root');
      const g = G();
      root.appendChild(K.top(g, `☀️ ${g.day || 1}일째`));
      const hello = K.npc('innkeeper', g, { cache: params });
      if (hello) root.appendChild(hello);
      root.appendChild(statusPanel(g));

      // 숙박은 이 화면의 핵심 행동이라 스크롤 없이 보이도록 메뉴보다 위에 둔다
      const cost = Facilities.inn.SLEEP_COST || 50;
      const afford = (g.player.gold || 0) >= cost;
      root.appendChild(el('div', { class: 'item-card', 'data-grade': 'common', style: { borderColor: '#b9a6e6', background: '#f6f1ff' } }, [
        el('div', { class: 'item-icon', text: '🛏️' }),
        el('div', { class: 'item-main' }, [
          el('div', { class: 'item-name', text: '하룻밤 숙박' }),
          el('div', { class: 'item-desc', text: '피로 0 · 나와 동료 HP·MP 가득 · 다음 날로 (일일 의뢰 교체)' }),
        ]),
        el('div', { class: 'item-side' }, [
          el('div', { class: 'item-price', text: `🪙 ${cost}` }),
          el('button', { class: 'btn small primary', disabled: !afford, text: '숙박', onClick: () => sleep(api, g) }),
        ]),
      ]));

      root.appendChild(UI.section('🍽️ 오늘의 메뉴', Facilities.inn.menu().map((m) => menuCard(api, g, m))));
      root.appendChild(el('div', { class: 'fac-hint', text: '여관에서 갓 만든 음식은 가방에 넣어 다니는 음식보다 피로가 더 많이 풀려요. 같은 음식을 또 먹으면 버프 시간이 새로 시작돼요.' }));
    },
  });
})();
