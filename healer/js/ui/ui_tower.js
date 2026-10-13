// 잿빛 탑 입장 화면 — 층 목록(1~10) → 층 선택 → 파티 요약·피로 확인 → 입장(Scenes.go('dungeon', { floor }))
// 잠금 규칙은 DESIGN §3.5 와 같은 "highestCleared + 1 층까지 입장 가능". 처음 열면 도전 중인 층을 골라 둔다.
// 선택한 층은 목록 안에서 펼쳐 보여 준다(세로 화면에서 위아래로 오가지 않게).
(() => {
  if (typeof UI === 'undefined') return;
  const { el } = UI;

  const FLOOR_COUNT = () => (typeof Floors !== 'undefined' && Floors.COUNT) || 10;
  const FATIGUE_MAX = 100;    // 피로 ≥ 100 이면 입장 불가(DESIGN §5)
  const FATIGUE_WARN = 70;
  const G = () => State.get();
  const save = () => { try { State.save(); } catch (e) { /* 저장 불가 환경은 무시 */ } };
  const tower = (g) => (g.tower = g.tower || { highestCleared: 0, records: {} });
  const maxOpen = (g) => Math.min(FLOOR_COUNT(), (tower(g).highestCleared || 0) + 1);
  const fmtTime = (t) => { if (!(t > 0)) return '-'; const m = Math.floor(t / 60), s = Math.round(t % 60); return m ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`; };
  const bossName = (fd) => { const b = fd && fd.boss && typeof Monsters !== 'undefined' ? Monsters.get(fd.boss) : null; return b ? b.name : '???'; };
  // 구인구직 파티(합류/모집)면 그 파티의 목표 층만 들어갈 수 있다(null = 제한 없음)
  const partyFloor = (g) => (typeof Recruit !== 'undefined' ? Recruit.allowedFloor(g) : null);
  const recruitState = (g) => (typeof Recruit !== 'undefined' ? Recruit.ensure(g) : {});
  const chapterTitle = (f) => { const c = typeof Story !== 'undefined' && Story.chapter ? Story.chapter(f) : null; return c ? c.title : ''; };

  function injectStyle() {
    if (document.getElementById('ui-tower-style')) return;
    const s = document.createElement('style');
    s.id = 'ui-tower-style';
    s.textContent = `
.tw-sum { display:flex; align-items:center; gap:10px; padding:8px 10px; margin-bottom:8px; border-radius:12px; background:linear-gradient(135deg,#4a4458,#2e2a38); color:#f1e4c8; }
.tw-sum .ic { font-size:26px; }
.tw-sum b { display:block; font-size:15px; font-weight:900; }
.tw-sum small { font-size:12px; opacity:0.85; }
.tw-row { scroll-margin-top:8px; width:100%; display:flex; align-items:center; gap:9px; padding:8px 10px; min-height:58px; border:2px solid #e3d8c3; border-radius:12px; background:#fff; font-family:inherit; text-align:left; color:#2a2020; margin-bottom:6px; }
.tw-row.cave { background:#f4f2f8; }
.tw-row.sel { border-color:#5aa84a; box-shadow:0 0 0 2px #bfe081; border-bottom-left-radius:0; border-bottom-right-radius:0; margin-bottom:0; }
.tw-row.locked { background:#ece7de; color:#9a8f82; }
.tw-num { flex:none; width:40px; height:40px; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; font-size:16px; line-height:1; color:#fff; background:#5f8f4a; }
.tw-num small { font-size:9px; font-weight:800; opacity:0.85; margin-top:1px; }
.tw-row.cave .tw-num { background:#6a5a8a; }
.tw-row.locked .tw-num { background:#b8ad9e; }
.tw-mid { flex:1; min-width:0; }
.tw-mid b { display:block; font-size:14.5px; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tw-mid small { display:block; font-size:11.5px; font-weight:700; color:#8a7a6a; margin-top:1px; }
.tw-right { flex:none; text-align:right; font-size:11px; font-weight:800; color:#7a6a5a; line-height:1.35; }
.tw-right .clr { color:#2f6b2f; }
.tw-right .new { display:inline-block; color:#fff; background:#e0883a; border-radius:6px; padding:1px 6px; }
.tw-lock { font-size:18px; }
.tw-detail { border:2px solid #5aa84a; border-top:0; border-radius:0 0 12px 12px; background:#fbfdf8; padding:10px; margin-bottom:8px; }
.tw-desc { font-size:12.5px; color:#5a4a40; line-height:1.45; margin-bottom:8px; }
.tw-facts { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:8px; }
.tw-facts div { background:#fff; border:1px solid #e3d8c3; border-radius:8px; padding:5px 6px; }
.tw-facts small { display:block; font-size:10.5px; font-weight:800; color:#8a7a6a; }
.tw-facts .boss { grid-column:1 / -1; display:flex; align-items:baseline; gap:8px; background:#fff6f0; border-color:#efc9b0; }
.tw-facts .boss b { color:#9a3a2a; }
.tw-facts b { font-size:13px; font-weight:900; font-variant-numeric:tabular-nums; }
.tw-party { display:flex; gap:4px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }
.tw-party .lvl { margin-left:auto; font-size:12px; font-weight:900; text-align:right; }
.tw-party .lvl.low { color:#b0504a; }
.tw-party .lvl.ok { color:#2f6b2f; }
.tw-fat { display:grid; grid-template-columns:40px 1fr; gap:6px; align-items:center; margin:6px 0; font-size:11px; font-weight:800; color:#7a6a5a; }
.tw-go { width:100%; min-height:52px; font-size:17px; margin-top:4px; }
.tw-goal { display:flex; align-items:center; gap:8px; padding:8px 10px; margin-bottom:8px; border-radius:12px; background:#e8f5e0; border:2px solid #a9d494; color:#2f6b2f; font-weight:800; font-size:12.5px; line-height:1.35; }
.tw-goal .ic { font-size:24px; }
.tw-goal .tx { flex:1; min-width:0; }
.tw-goal b { display:block; font-size:15px; font-weight:900; color:#245a24; }
.tw-goal .btn { flex:none; min-height:44px; padding:6px 12px; }
.tw-row.other { opacity:0.55; }
`;
    document.head.appendChild(s);
  }

  function floorRow(g, f, sel, onPick) {
    const fd = Floors.get(f) || { name: `${f}층`, biome: 'forest', levelRange: [1, 1] };
    const pf = partyFloor(g);
    const locked = f > maxOpen(g) && f !== pf;
    const rec = tower(g).records[f];
    const cave = fd.biome === 'cave';
    const right = locked
      ? el('div', { class: 'tw-right' }, [el('span', { class: 'tw-lock', text: '🔒' })])
      : rec && rec.clears
        ? el('div', { class: 'tw-right' }, [el('div', { class: 'clr', text: `✔ 클리어 ${rec.clears}회` }), el('div', { text: `⏱ ${fmtTime(rec.bestTime)}` })])
        : el('div', { class: 'tw-right' }, [el('span', { class: 'new', text: '도전!' }), rec && rec.attempts ? el('div', { text: `시도 ${rec.attempts}회` }) : null]);
    return el('button', { class: 'tw-row' + (cave ? ' cave' : '') + (locked ? ' locked' : '') + (sel ? ' sel' : '') + (pf && pf !== f ? ' other' : ''), 'data-floor': f, onClick: () => onPick(f, locked) }, [
      el('div', { class: 'tw-num' }, [String(f), el('small', { text: '층' })]),
      el('div', { class: 'tw-mid' }, [
        el('b', { text: locked ? `${cave ? '🪨' : '🌲'} ???` : `${cave ? '🪨' : '🌲'} ${fd.name}` }),
        el('small', { text: `${cave ? '동굴' : '숲'} · 권장 Lv.${fd.levelRange[0]}~${fd.levelRange[1]}${locked ? ` · ${f - 1}층 클리어 시 열림` : ''}` }),
      ]),
      right,
    ]);
  }

  function detail(g, f, api) {
    const fd = Floors.get(f) || { name: `${f}층`, levelRange: [1, 1] };
    const rec = tower(g).records[f] || {};
    const members = Party.members(g);
    const box = el('div', { class: 'tw-detail' });
    const ch = chapterTitle(f);
    if (fd.desc || ch) box.appendChild(el('div', { class: 'tw-desc', text: [ch ? `${f}장 · ${ch}` : '', fd.desc || ''].filter(Boolean).join('\n') }));
    box.appendChild(el('div', { class: 'tw-facts' }, [
      el('div', { class: 'boss' }, [el('small', { text: '👑 층 보스' }), el('b', { text: bossName(fd) })]),
      el('div', {}, [el('small', { text: '클리어' }), el('b', { text: `${rec.clears || 0}회` })]),
      el('div', {}, [el('small', { text: '최고 기록' }), el('b', { text: fmtTime(rec.bestTime) })]),
    ]));

    // 파티 요약: 초상화 + 평균 레벨 vs 권장
    const all = [{ isPlayer: true, cls: 'priest', level: g.player.level, role: 'healer', name: g.player.name }].concat(members);
    const avg = Math.round(all.reduce((a, m) => a + (m.level || 1), 0) / all.length);
    const low = avg < fd.levelRange[0];
    box.appendChild(el('div', { class: 'ui-section-title', text: `파티 (${all.length}/5)` }));
    box.appendChild(el('div', { class: 'tw-party' }, [
      ...all.map((m) => PartyUI.portrait(m, true)),
      el('div', { class: 'lvl ' + (low ? 'low' : 'ok') }, [`평균 Lv.${avg}`, el('br'), low ? '⚠ 권장보다 낮음' : '✔ 적정']),
    ]));
    const advice = PartyUI.roleSummary(g).advice;
    if (advice.warn) box.appendChild(el('div', { class: 'pu-warn', text: advice.text }));

    // 피로: 100 이상이면 입장 버튼을 잠근다(Floor 쪽도 막지만 이유를 먼저 보여 준다)
    const fat = Math.round(g.player.fatigue || 0);
    box.appendChild(el('div', { class: 'tw-fat' }, [el('span', { text: '피로' }), UI.bar(fat, FATIGUE_MAX, 'fatigue')]));
    const tired = fat >= FATIGUE_MAX;
    if (tired) box.appendChild(el('div', { class: 'pu-warn', text: '너무 지쳐서 탑에 들어갈 수 없어요. 여관에서 하룻밤 쉬거나 음식을 먹어 피로를 풀어 주세요.' }));
    else if (fat >= FATIGUE_WARN) box.appendChild(el('div', { class: 'pu-warn', text: `피로가 ${fat}이에요. 공격력·치유력·마나 회복이 ${Math.round(fat / 2)}% 떨어진 상태예요.` }));
    if (typeof Inventory !== 'undefined' && Inventory.isFull(g)) box.appendChild(el('div', { class: 'pu-hint', text: '🎒 가방이 가득 찼어요. 전리품은 은행으로 보내져요.' }));

    box.appendChild(el('button', { class: 'btn primary tw-go', text: tired ? '입장 불가 (피로)' : `${f}층 입장`, disabled: tired, onClick: () => enter(g, f, api) }));
    return box;
  }

  async function enter(g, f, api) {
    if ((g.player.fatigue || 0) >= FATIGUE_MAX) { api.toast('너무 지쳐서 들어갈 수 없어요'); return; }
    const pf = partyFloor(g);
    if (pf && f !== pf) { api.toast(`파티 목표 층(${pf}층)만 들어갈 수 있어요`); return; }
    if (f > maxOpen(g) && f !== pf) { api.toast('아직 열리지 않은 층이에요'); return; }
    if (recruitState(g).posting) {
      const yes = await api.confirm('게시판에 모집 중인 글이 있어요.\n마감하지 않고 지금 파티로 출발할까요?', { ok: '그냥 출발', cancel: '그만두기' });
      if (!yes) return;
    }
    if (!Party.members(g).length) {
      const yes = await api.confirm('동료 없이 혼자 탑에 들어갈까요?\n힐러 혼자서는 몬스터를 쓰러뜨리기 어려워요.\n(모험가 사무소 게시판에서 힐러를 구하는 파티를 찾을 수 있어요)', { ok: '혼자 가기', cancel: '그만두기' });
      if (!yes) return;
    }
    if (typeof Scenes === 'undefined' || !Scenes.go) { api.toast('던전을 열 수 없어요'); return; }
    save();
    UI.close(true);
    Scenes.go('dungeon', { floor: f });
  }

  UI.register('tower', {
    title: '잿빛 탑',
    render(root, params, api) {
      PartyUI.injectStyle(); injectStyle();
      const g = G();
      const hc = tower(g).highestCleared || 0;
      const pf = partyFloor(g);
      if (pf) params.floor = pf;
      else if (!params.floor || params.floor > maxOpen(g)) params.floor = maxOpen(g);
      root.appendChild(el('div', { class: 'tw-sum' }, [
        el('span', { class: 'ic', text: '🗼' }),
        el('div', {}, [el('b', { text: hc ? `최고 ${hc}층 돌파` : '아직 오른 층이 없어요' }), el('small', { text: hc >= FLOOR_COUNT() ? '모든 층을 돌파했어요!' : `지금 도전할 층: ${maxOpen(g)}층` })]),
      ]));
      if (pf) {
        const rs = recruitState(g), j = rs.joined;
        root.appendChild(el('div', { class: 'tw-goal' }, [
          el('span', { class: 'ic', text: j ? '🤝' : '👑' }),
          el('div', { class: 'tx' }, [el('b', { text: `파티 목표: ${pf}층` }), j ? `${j.leaderName}님 파티 · 돌파 보상 🪙 +${j.rewardBonus}` : '내가 모은 파티 · 다녀오면 해산']),
          el('button', { class: 'btn danger', text: j ? '탈퇴' : '해산', onClick: async () => {
            const yes = await api.confirm(j ? `${j.leaderName}님 파티에서 탈퇴할까요?` : '모은 파티를 해산할까요?', { ok: j ? '탈퇴' : '해산', cancel: '그만두기' });
            if (!yes) return;
            Recruit.leave(g); save(); api.toast(j ? '파티에서 탈퇴했어요' : '파티를 해산했어요'); api.refresh();
          } }),
        ]));
      }
      let selEl = null;
      for (let f = 1; f <= FLOOR_COUNT(); f++) {
        const sel = f === params.floor;
        const row = floorRow(g, f, sel, (ff, locked) => {
          if (pf && ff !== pf) { api.toast(`파티 목표 층(${pf}층)만 들어갈 수 있어요`); return; }
          if (locked) { api.toast(`${ff - 1}층 보스를 쓰러뜨리면 열려요`); return; }
          params.floor = ff; api.refresh();
        });
        root.appendChild(row);
        if (sel) { root.appendChild(detail(g, f, api)); selEl = row; }
      }
      // 고른 층이 화면 밖이면 보이게(높은 층에 도전 중일 때 바로 입장 버튼이 보이도록)
      if (selEl && params.floor > 2) setTimeout(() => { try { selEl.scrollIntoView({ block: 'start' }); } catch (e) { /* 무시 */ } }, 0);
    },
  });
})();
