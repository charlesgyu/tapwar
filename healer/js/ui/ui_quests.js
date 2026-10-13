// 퀘스트 화면 — [진행 | 완료 | 일일] 탭과 "다음에 누구를 찾아갈지" 힌트.
// 수주·완료 보고는 마을 NPC 대화에서 하므로(이야기·보상 대사가 거기 있음) 여기서는 진행도와 갈 곳을 분명히 알려 주는 데 집중한다.
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
  // 클래스 이름에 't-' 를 붙인다 — 공통 CSS 의 .hidden(display:none) 과 겹치면 히든 퀘스트 카드가 사라진다
  const TYPE = {
    main: { name: '메인', cls: 't-main', order: 0 }, village: { name: '의뢰', cls: 't-village', order: 1 },
    hidden: { name: '히든', cls: 't-hidden', order: 2 }, daily: { name: '일일', cls: 't-daily', order: 3 },
  };
  const isNpc = (id) => { try { return typeof Dialogue !== 'undefined' && Dialogue.ids().includes(id); } catch (e) { return false; } };
  const npcName = (id) => { try { return (typeof Dialogue !== 'undefined' && Dialogue.name(id)) || id; } catch (e) { return id; } };
  const npcRole = (id) => { try { return (Dialogue.npc(id) || {}).role || ''; } catch (e) { return ''; } };

  function injectStyle() {
    K.injectStyle();
    if (document.getElementById('ui-qs-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-qs-style';
    s.textContent = `
.qs-root .ui-pane { background:transparent; padding:0; }
.qs-root .ui-tab { min-height:44px; font-size:14px; }
.qs-card { background:#fff; border:2px solid #e3d8c3; border-radius:12px; padding:9px 10px; margin-bottom:8px; }
.qs-card.done { border-color:#8fc47a; background:#f6fbf1; }
.qs-card.t-main { border-left:6px solid #d9a03a; }
.qs-card.t-hidden { border-left:6px solid #8a5ae0; }
.qs-card.t-daily { border-left:6px solid #3a86e0; }
.qs-card.t-village { border-left:6px solid #5aa84a; }
.qs-tt { display:flex; align-items:center; gap:6px; font-weight:900; font-size:15px; color:#2a2020; }
.qs-type { flex:none; font-size:10px; font-weight:900; color:#fff; border-radius:6px; padding:2px 6px; }
.qs-type.t-main { background:#d9a03a; } .qs-type.t-village { background:#5aa84a; } .qs-type.t-hidden { background:#8a5ae0; } .qs-type.t-daily { background:#3a86e0; }
.qs-giver { font-size:11.5px; color:#8a7a6a; margin:2px 0 6px; }
.qs-obj { display:grid; grid-template-columns:1fr 92px; align-items:center; gap:8px; font-size:12.5px; margin:3px 0; color:#3a3030; }
.qs-obj.ok { color:#2f8a2f; font-weight:800; }
.qs-obj .ui-bar { height:16px; }
.qs-obj .ui-bar span { line-height:14px; font-size:10.5px; }
.qs-obj.ok .ui-bar i { background:linear-gradient(#b8e08a,#5aa84a); }
.qs-rw { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }
.qs-chip { font-size:11px; font-weight:800; padding:2px 7px; border-radius:10px; background:#f3eee4; color:#6a5a4a; border:1px solid #e0d4bf; white-space:nowrap; }
.qs-chip.gold { background:#fff3d0; color:#7a5a1a; border-color:#ecd28f; } .qs-chip.xp { background:#fff0db; color:#9a5a10; border-color:#efcf9a; }
.qs-hint { font-size:12px; color:#6a5a4a; background:#fbf6ea; border-radius:8px; padding:6px 8px; margin-top:7px; line-height:1.45; }
.qs-ready { display:flex; align-items:center; gap:8px; margin-top:8px; padding:7px 9px; border-radius:9px; background:#e8f5e0; border:1px solid #b5d9a2; font-size:12.5px; font-weight:800; color:#2f6b2f; line-height:1.4; }
.qs-ready .btn { margin-left:auto; flex:none; }
.qs-card { position:relative; }
.qs-tt { padding-right:50px; }
.qs-ab { position:absolute; right:4px; top:2px; min-height:44px !important; min-width:48px; padding:2px 6px; font-size:12px; color:#a08a7a; box-shadow:none !important; background:transparent; }
.qs-next { display:flex; gap:9px; align-items:flex-start; padding:8px 10px; background:#fffaf0; border:2px dashed #e3c98a; border-radius:12px; margin-bottom:6px; }
.qs-next .pin { font-size:20px; flex:none; }
.qs-next .who { font-weight:900; font-size:13.5px; }
.qs-next .who small { font-weight:700; font-size:11px; color:#8a7a6a; margin-left:4px; }
.qs-next .ql { font-size:12px; color:#5a4a3a; margin-top:2px; line-height:1.45; }
.qs-sum { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; margin-bottom:8px; }
.qs-sum div { background:#fff; border:2px solid #e3d8c3; border-radius:9px; text-align:center; padding:5px 2px; }
.qs-sum b { display:block; font-size:16px; font-weight:900; }
.qs-sum small { font-size:10.5px; font-weight:800; color:#8a7a6a; }
.qs-line { display:flex; align-items:center; gap:6px; padding:8px 10px; background:#fff; border:2px solid #e3d8c3; border-radius:10px; margin-bottom:5px; font-size:13px; font-weight:800; }
.qs-line .g { margin-left:auto; font-size:11px; color:#8a7a6a; font-weight:700; white-space:nowrap; }
`;
    document.head.appendChild(s);
  }

  function typeBadge(type) { const t = TYPE[type] || { name: type, cls: '' }; return el('span', { class: 'qs-type ' + t.cls, text: t.name }); }
  function rewardChips(d) {
    const rw = d.rewards || {}, out = [];
    if (rw.gold) out.push(el('span', { class: 'qs-chip gold', text: UI.gold(rw.gold) }));
    if (rw.xp) out.push(el('span', { class: 'qs-chip xp', text: `⭐ ${rw.xp} XP` }));
    if (rw.gems) out.push(el('span', { class: 'qs-chip', text: `💎 ${rw.gems}` }));
    for (const spec of rw.items || []) {
      let text = '', color = null;
      if (spec.id) { const it = Items.get(spec.id); text = `${(it && it.icon) || '📦'} ${(it && it.name) || spec.id}${spec.qty > 1 ? ' ×' + spec.qty : ''}`; }
      else {
        const g = K.grade(spec.grade || 'uncommon');
        const setName = spec.setId && Items.SETS && Items.SETS[spec.setId] ? Items.SETS[spec.setId].name + ' ' : '';
        const slot = spec.slot === 'main' ? (spec.hands === 'two' ? '양손 지팡이' : '지팡이') : (Items.slotName ? Items.slotName(spec.slot) : spec.slot);
        text = `🎁 ${g.name} ${setName}${slot}`; color = spec.grade;
      }
      const chip = el('span', { class: 'qs-chip', text });
      if (color && color !== 'common') { chip.style.borderColor = K.edge(color); chip.style.color = K.ink(color); }
      out.push(chip);
    }
    return out.length ? el('div', { class: 'qs-rw' }, out) : null;
  }
  function rewardText(r) {
    const parts = [];
    if (r.gold) parts.push(UI.gold(r.gold)); if (r.xp) parts.push(`XP +${r.xp}`);
    if (r.items && r.items.length) parts.push(r.items.map((i) => (K.def(i) || {}).name).filter(Boolean).join(', '));
    if (r.toBank && r.toBank.length) parts.push(`은행으로 ${r.toBank.length}개`);
    return parts.join(' · ');
  }

  // NPC 가 아닌 곳(게시판 등)에서 준 퀘스트만 여기서 바로 완료한다 — NPC 퀘스트는 대화에서 보고해야 완료 대사가 나온다
  function completeHere(api, g, q) {
    const r = Quests.complete(g, q.id);
    if (r) { K.save(); api.toast(`완료! ${rewardText(r)}${r.levelsGained ? ' · 레벨 업!' : ''}`, 3000); }
    else api.toast('아직 완료할 수 없어요');
    api.refresh();
  }
  async function abandon(api, g, q) {
    const ok = await api.confirm(`"${q.title}" 퀘스트를 포기할까요?\n진행도가 사라져요.`, { ok: '포기', cancel: '계속하기' });
    if (!ok) return;
    if (Quests.abandon(g, q.id)) { K.save(); api.toast('퀘스트를 포기했어요'); } else api.toast('메인 퀘스트는 포기할 수 없어요');
    api.refresh();
  }

  function activeCard(api, g, q) {
    const d = q.def, giver = d.giver;
    const card = el('div', { class: `qs-card ${(TYPE[q.type] || {}).cls || ''}${q.complete ? ' done' : ''}` }, [
      el('div', { class: 'qs-tt' }, [typeBadge(q.type), el('span', { text: q.title }),
        d.type !== 'main' ? el('button', { class: 'btn ghost qs-ab', text: '포기', 'aria-label': `${q.title} 포기`, onClick: () => abandon(api, g, q) }) : null]),
      el('div', { class: 'qs-giver', text: `의뢰인: ${npcName(giver)}${npcRole(giver) ? ' · ' + npcRole(giver) : ''}${d.type === 'main' && d.chapter ? ` · ${d.chapter}장` : ''}` }),
      ...q.objectives.map((o) => el('div', { class: 'qs-obj' + (o.done ? ' ok' : '') }, [
        el('span', { text: (o.done ? '✔ ' : '· ') + o.label }),
        UI.bar(o.current, o.need, 'xp'),
      ])),
      rewardChips(d),
    ]);
    if (q.complete) {
      if (isNpc(giver)) card.appendChild(el('div', { class: 'qs-ready', text: `✔ 완료! ${npcName(giver)}에게 가서 보고하세요` }));
      else card.appendChild(el('div', { class: 'qs-ready' }, [el('span', { text: '✔ 목표 달성' }), el('button', { class: 'btn primary', text: '완료', onClick: () => completeHere(api, g, q) })]));
    } else {
      const tip = (d.text && d.text.progress) || d.hint;
      if (tip) card.appendChild(el('div', { class: 'qs-hint', text: '💡 ' + tip }));
    }
    return card;
  }

  // 다음 행선지: 수주 가능한 퀘스트를 준 NPC 별로 묶고, 그 NPC 의 힌트(Quests.hintsFor)를 함께 보여 준다
  function nextSteps(g) {
    let avail = [];
    try { avail = Quests.available(g).filter((d) => d.type !== 'daily'); } catch (e) { avail = []; }
    const by = new Map();
    for (const d of avail) { if (!by.has(d.giver)) by.set(d.giver, []); by.get(d.giver).push(d); }
    const rows = Array.from(by.entries())
      .sort((a, b) => Math.min(...a[1].map((d) => TYPE[d.type].order)) - Math.min(...b[1].map((d) => TYPE[d.type].order)))
      .slice(0, 6)
      .map(([npc, list]) => {
        const hints = (() => { try { return Quests.hintsFor(g, npc); } catch (e) { return []; } })();
        return el('div', { class: 'qs-next' }, [
          el('div', { class: 'pin', text: list.some((d) => d.type === 'main') ? '❗' : '📍' }),
          el('div', {}, [
            el('div', { class: 'who' }, [npcName(npc), el('small', { text: npcRole(npc) })]),
            el('div', { class: 'ql', text: list.map((d) => `[${TYPE[d.type].name}] ${d.title}`).join(' · ') }),
            hints[0] ? el('div', { class: 'ql', style: { color: '#8a6a4a' }, text: '“' + hints[0] + '”' }) : null,
          ]),
        ]);
      });
    return rows;
  }

  function renderActive(pane, api, g) {
    const list = Quests.active(g).sort((a, b) => (b.complete - a.complete) || ((TYPE[a.type] || {}).order - (TYPE[b.type] || {}).order));
    if (!list.length) pane.appendChild(UI.empty('진행 중인 퀘스트가 없어요. 마을 사람들에게 말을 걸어 보세요.'));
    for (const q of list) pane.appendChild(activeCard(api, g, q));
    const next = nextSteps(g);
    if (next.length) pane.appendChild(UI.section('💡 힌트 — 새 의뢰가 있는 사람', next));
  }
  function renderDone(pane, api, g) {
    const qd = g.quests || {};
    const ids = (qd.completed || []).slice().reverse();
    const all = QuestData.all();
    const count = (t) => ({ done: ids.filter((id) => (QuestData.get(id) || {}).type === t).length, total: all.filter((d) => d.type === t).length });
    const sum = el('div', { class: 'qs-sum' }, ['main', 'village', 'hidden'].map((t) => { const c = count(t); return el('div', {}, [el('b', { text: `${c.done}/${c.total}` }), el('small', { text: TYPE[t].name })]); })
      .concat([el('div', {}, [el('b', { text: `${g.story ? g.story.chapter : 1}장` }), el('small', { text: '이야기' })])]));
    pane.appendChild(sum);
    if (!ids.length) { pane.appendChild(UI.empty('아직 완료한 퀘스트가 없어요.')); return; }
    for (const id of ids) {
      const d = QuestData.get(id); if (!d) continue;
      pane.appendChild(el('div', { class: 'qs-line' }, [typeBadge(d.type), el('span', { text: d.title }), el('span', { class: 'g', text: npcName(d.giver) })]));
    }
  }
  function renderDaily(pane, api, g) {
    try { Quests.dailyRefresh(g); } catch (e) { /* 일일 데이터가 없으면 빈 목록 */ }
    const daily = (g.quests && g.quests.daily) || { offered: [], done: [] };
    pane.appendChild(el('div', { class: 'hk-hint', text: `${g.day || 1}일째 일일 의뢰 ${daily.done.length}/${daily.offered.length} 완료 · 여관에서 자고 나면 새 의뢰로 바뀌어요.` }));
    const act = new Map(Quests.active(g).map((q) => [q.id, q]));
    for (const id of daily.offered) {
      const d = QuestData.get(id); if (!d) continue;
      const st = Quests.status(g, id);
      if (act.has(id)) { pane.appendChild(activeCard(api, g, act.get(id))); continue; }
      const card = el('div', { class: 'qs-card t-daily' + (st === 'completed' ? ' done' : '') }, [
        el('div', { class: 'qs-tt' }, [typeBadge('daily'), el('span', { text: d.title })]),
        el('div', { class: 'qs-giver', text: `의뢰인: ${npcName(d.giver)} · ${npcRole(d.giver)}` }),
        ...d.objectives.map((o) => el('div', { class: 'qs-obj' }, [el('span', { text: '· ' + Quests.objectiveLabel(o) }), el('span', { class: 'qs-chip', style: { justifySelf: 'end' }, text: `목표 ${(o.count || o.amount || 1).toLocaleString('ko-KR')}` })])),
        rewardChips(d),
      ]);
      if (st === 'completed') card.appendChild(el('div', { class: 'qs-ready', text: '✔ 오늘 완료했어요' }));
      else card.appendChild(el('div', { class: 'qs-hint', text: `📍 ${npcName(d.giver)}에게 말을 걸어 수락하세요` }));
      pane.appendChild(card);
    }
    if (!daily.offered.length) pane.appendChild(UI.empty('오늘은 일일 의뢰가 없어요.'));
  }

  UI.register('quests', {
    title: '퀘스트',
    full: true,
    render(root, params, api) {
      injectStyle();
      root.classList.add('hk-root', 'qs-root');
      const g = G();
      const act = Quests.active(g);
      const ready = act.filter((q) => q.complete).length;
      const draw = (fn) => (pane) => fn(pane, api, g);
      const t = UI.tabs(root, [
        { id: 'active', label: `진행 ${act.length}${ready ? ` · 보고 ${ready}` : ''}`, render: draw(renderActive) },
        { id: 'done', label: '완료', render: draw(renderDone) },
        { id: 'daily', label: '일일', render: draw(renderDaily) },
      ], params.tab || 'active');
      // 탭을 바꾸면 기억해 두어, 포기 등으로 다시 그려도 같은 탭에 머문다
      root.querySelectorAll('.ui-tab').forEach((b, i) => b.addEventListener('click', () => { params.tab = ['active', 'done', 'daily'][i]; }));
      void t;
    },
  });
})();
