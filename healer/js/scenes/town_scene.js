// 마을 씬 — 라일라 마을 탐험: 탭/조이스틱 이동, NPC 배회·말풍선·대화(퀘스트 수주/완료), 시설 문 앞 안내, 상단 HUD·하단 버튼 바.
// 캔버스·카메라·입력·루프는 Scenes(scene.js)가 맡고, 이 파일은 마을 고유의 로직만 갖는다.
const TownScene = (() => {
  const TILE = Town.TILE;
  const $ = (id) => document.getElementById(id);

  let world = null;          // Town.build() 결과(바닥·오버레이·깊이정렬 오브젝트) — 비싸므로 한 번만 만든다
  let player = null;
  let npcs = [];
  let tapMark = null;
  let nearDoor = null;       // 지금 문 앞에 서 있는 건물(BUILDINGS 항목)
  let hudT = 0;
  let pendingEventT = -1;    // 챕터 마을 이벤트를 재생할 때까지 남은 시간(씬 진입 직후 바로 띄우면 화면 전환과 겹쳐 어색하다)
  let talking = false;       // 대화창이 열린 동안 중복 탭 방지
  let entered = false;
  // 직전 씬 이름 — 탑(던전)에서 돌아오면 성문 앞에 세우기 위해. 'scene_change' 는 enter 직전에 발행된다.
  let sceneNow = null, scenePrev = null;
  if (typeof Events !== 'undefined') Events.on('scene_change', (p) => { scenePrev = sceneNow; sceneNow = p && p.name; });
  const clouds = [{ x: 120, y: 240, r: 80 }, { x: 600, y: 560, r: 110 }, { x: 360, y: 880, r: 96 }];

  // ---------- NPC 배치 ----------
  // 시설 담당 NPC 는 문 옆(문 앞 칸을 막지 않게 1~2타일 옆)에 서 있고, 주민·아이는 home 반경 안을 배회한다.
  // id 는 Dialogue 의 npcId 와 1:1 — 이름·스프라이트·대사는 전부 Dialogue 에서 가져온다.
  const NPC_LAYOUT = [
    { id: 'guard1', x: 10, y: 8.3, ai: 'stand' },
    { id: 'guard2', x: 14, y: 8.3, ai: 'stand' },
    { id: 'priest_elder', x: 6.0, y: 9.5, ai: 'stand', facility: 'temple' },
    { id: 'guildmaster', x: 21.9, y: 9.5, ai: 'stand', facility: 'guild' },
    { id: 'adventurer_clerk', x: 6.0, y: 16.5, ai: 'stand', facility: 'adventurer' },
    { id: 'engraver', x: 21.9, y: 16.5, ai: 'stand', facility: 'engraver' },
    { id: 'smith', x: 2.2, y: 23.5, ai: 'stand', facility: 'smithy' },
    { id: 'banker', x: 21.9, y: 23.5, ai: 'stand', facility: 'bank' },
    { id: 'innkeeper', x: 6.0, y: 30.5, ai: 'stand', facility: 'inn' },
    { id: 'auctioneer', x: 21.9, y: 30.5, ai: 'stand', facility: 'auction' },
    { id: 'merchant1', x: 14.2, y: 30.5, ai: 'stand', facility: 'shop' },
    // 시장 상인: 좌판 뒤에 서면 차양·진열대에 가려지므로 좌판 오른쪽 옆(가운데 통로 쪽)에 세운다
    { id: 'merchant2', x: 11.35, y: 22.6, ai: 'stand' },
    { id: 'villager_a', x: 12, y: 11, ai: 'wander', home: { x: 12, y: 11, r: 3 }, speed: 60 },
    { id: 'villager_b', x: 14, y: 18, ai: 'wander', home: { x: 12, y: 18, r: 3 }, speed: 56 },
    { id: 'villager_c', x: 9, y: 15, ai: 'wander', home: { x: 10, y: 15, r: 3 }, speed: 64 },
    { id: 'villager_d', x: 12, y: 24, ai: 'wander', home: { x: 12, y: 24, r: 2 }, speed: 46 },
    { id: 'villager_e', x: 15, y: 14, ai: 'wander', home: { x: 14, y: 14, r: 3 }, speed: 58 },
    { id: 'child_a', x: 13, y: 19, ai: 'wander', home: { x: 12, y: 19, r: 3 }, speed: 88 },
    { id: 'child_b', x: 9, y: 31.5, ai: 'wander', home: { x: 12, y: 31, r: 4 }, speed: 80 },
  ];
  // 시설 건물 key → UI 화면 이름. 민가(houseA~C)는 들어갈 수 없다.
  const FACILITY_SCREENS = { shop: 'shop', auction: 'auction', bank: 'bank', smithy: 'smithy', inn: 'inn', engraver: 'engraver', temple: 'temple', adventurer: 'adventurer', guild: 'guild' };

  function makeActor(kind, x, y, opts = {}) {
    return Object.assign({ kind, x, y, dir: 'down', moving: false, animT: 0, frame: 0, speed: 104, path: null, pathIdx: 0, sprite: Sprites.get(kind), bubble: null, bubbleT: 0, ai: null, aiT: 0, talkT: 0 }, opts);
  }

  function ensureWorld() {
    if (world) return;
    world = Town.build();
    player = makeActor('player', 12 * TILE, 18.5 * TILE, { speed: 210, name: '리프' });
    npcs = NPC_LAYOUT.map((L) => {
      const info = Dialogue.npc(L.id) || { name: L.id, sprite: 'villagerA' };
      let x = L.x * TILE, y = L.y * TILE;
      // 배치 좌표가 소품/벽에 걸리면 가장 가까운 빈 칸으로(지도 소품이 바뀌어도 NPC 가 끼지 않게)
      if (!Town.canStand(x, y)) { const t = Town.nearestWalkable(Math.floor(x / TILE), Math.floor(y / TILE)); if (t) { x = t[0] * TILE + TILE / 2; y = t[1] * TILE + TILE / 2; } }
      return makeActor(info.sprite || 'villagerA', x, y, { npcId: L.id, name: info.name, ai: L.ai, home: L.home, speed: L.speed || 60, facility: L.facility || null, aiT: Math.random() * 3 });
    });
  }

  // ---------- 이동 ----------
  function tryMove(a, dx, dy) {
    let moved = false;
    if (dx) { const nx = a.x + dx; if (Town.canStand(nx, a.y)) { a.x = nx; moved = true; } }
    if (dy) { const ny = a.y + dy; if (Town.canStand(a.x, ny)) { a.y = ny; moved = true; } }
    return moved;
  }
  function setDir(a, dx, dy) {
    if (Math.abs(dx) > Math.abs(dy) * 1.2) a.dir = dx > 0 ? 'right' : 'left';
    else if (Math.abs(dy) > 0.01) a.dir = dy > 0 ? 'down' : 'up';
  }
  function faceDir(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  function followPath(a, dt) {
    if (!a.path) return false;
    // 보이는 가장 먼 지점으로 건너뛰어 격자 계단 걸음을 없앤다
    while (a.pathIdx + 1 < a.path.length && Town.lineClear(a.x, a.y, a.path[a.pathIdx + 1].x, a.path[a.pathIdx + 1].y)) a.pathIdx++;
    const p = a.path[a.pathIdx];
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
    const step = a.speed * dt;
    if (d <= step) {
      a.x = p.x; a.y = p.y; a.pathIdx++;
      if (a.pathIdx >= a.path.length) { a.path = null; if (a.onArrive) { const f = a.onArrive; a.onArrive = null; f(); } return false; }
      return true;
    }
    setDir(a, dx, dy);
    if (!tryMove(a, (dx / d) * step, (dy / d) * step)) { a.stuckT = (a.stuckT || 0) + dt; if (a.stuckT > 0.5) { a.path = null; a.onArrive = null; a.stuckT = 0; return false; } }
    else a.stuckT = 0;
    return true;
  }
  function animate(a, moving, dt) {
    a.moving = moving;
    if (moving) { a.animT += dt * (a.speed / 120) * 10; a.frame = Math.floor(a.animT) % 4; } // 120px/s 에서 10fps, 한 걸음 ≈ 12px
    else { a.animT = 0; a.frame = 0; }
  }

  // 플레이어를 (x, y) 로 길찾기 이동. onArrive 는 도착 시 1회.
  function goTo(x, y, onArrive) {
    ensureWorld();
    const path = Town.findPath(player.x, player.y, x, y);
    if (!path) { UI.toast('그곳으로는 갈 수 없어요'); return false; }
    if (Town.canStand(x, y)) path[path.length - 1] = { x, y }; // 마지막 지점은 실제 터치 지점으로
    if (path.length > 1) path.shift();                          // 시작 타일 중심은 생략(뒤로 한 걸음 물러나는 현상 방지)
    player.path = path; player.pathIdx = 0; player.onArrive = onArrive || null;
    return true;
  }
  function say(actor, text, dur = 2.6) { actor.bubble = text; actor.bubbleT = dur; }

  function updatePlayer(dt) {
    const ax = Scenes.moveAxis();
    let moving = false;
    if (ax.len) {
      player.path = null; player.onArrive = null;
      setDir(player, ax.x, ax.y);
      moving = tryMove(player, ax.x * player.speed * dt, ax.y * player.speed * dt);
    } else moving = followPath(player, dt);
    animate(player, moving, dt);
    if (player.bubbleT > 0) { player.bubbleT -= dt; if (player.bubbleT <= 0) player.bubble = null; }
  }

  function updateNpc(n, dt, G) {
    if (n.bubbleT > 0) { n.bubbleT -= dt; if (n.bubbleT <= 0) n.bubble = null; }
    if (n.talkT > 0) { n.talkT -= dt; animate(n, false, dt); return; }
    if (n.ai === 'stand') {
      n.aiT -= dt;
      if (n.aiT <= 0) {
        n.aiT = 2 + Math.random() * 4;
        n.dir = Math.random() < 0.7 ? 'down' : (Math.random() < 0.5 ? 'left' : 'right');
        // 시설 담당도 가끔 혼잣말 — 플레이어 근처일 때만(멀리서 떠드는 말풍선은 화면만 어지럽힌다)
        if (Math.hypot(n.x - player.x, n.y - player.y) < 200 && Math.random() < 0.12) say(n, Dialogue.pick(n.npcId, G, { hintChance: 0.15 }), 2.6);
      }
      animate(n, false, dt); return;
    }
    let moving = false;
    if (n.path) moving = followPath(n, dt);
    else {
      n.aiT -= dt;
      if (n.aiT <= 0) {
        n.aiT = 1.5 + Math.random() * 4;
        const h = n.home;
        const t = Town.nearestWalkable(h.x + Math.round((Math.random() * 2 - 1) * h.r), h.y + Math.round((Math.random() * 2 - 1) * h.r));
        if (t) { const path = Town.findPath(n.x, n.y, t[0] * TILE + TILE / 2, t[1] * TILE + TILE / 2); if (path && path.length > 1) { path.shift(); n.path = path; n.pathIdx = 0; } }
        if (Math.random() < 0.18) say(n, Dialogue.pick(n.npcId, G), 2.4);
      }
    }
    animate(n, moving, dt);
  }

  // ---------- 탭 ----------
  function onTap(wx, wy) {
    if (talking) return;
    let hit = null, hd = 24; // NPC 터치 반경(월드 px), 스프라이트 몸통 중심 기준
    for (const n of npcs) { const d = Math.hypot(n.x - wx, n.y - 18 - wy); if (d < hd) { hd = d; hit = n; } }
    // 탭으로는 캐릭터가 걷지 않는다(이동은 조이스틱만). 가까이 있는 NPC·건물만 탭으로 상호작용
    if (hit) {
      if (Math.hypot(hit.x - player.x, hit.y - player.y) < 72) talkTo(hit);
      else UI.toast('가까이 가서 탭하면 대화할 수 있어요', 1400);
      return;
    }
    const b = Town.buildingAtTile(Math.floor(wx / TILE), Math.floor(wy / TILE));
    if (b) {
      const d = Town.doorPoint(b);
      if (Math.hypot(d.x - player.x, d.y - player.y) < 72) enterBuilding(b);
      return;
    }
  }

  // ---------- 시설 ----------
  function enterBuilding(b) {
    if (!b || talking) return;
    if (b.kind === 'gate') { UI.open('tower'); return; }
    const screen = FACILITY_SCREENS[b.key];
    if (!screen) { UI.toast('문이 잠겨 있어요. 남의 집이에요!'); return; }
    Facilities.visit(b.key);  // 'facility_visit' — 방문 퀘스트 진행
    UI.open(screen);
  }
  function updatePrompt() {
    let best = null, bd = 40; // 문 앞 안내 거리(px)
    for (const o of world.objects) {
      if (o.kind !== 'building') continue;
      const d = Math.hypot(o.door.x - player.x, o.door.y - player.y);
      if (d < bd) { bd = d; best = o.ref; }
    }
    if (best === nearDoor) return;
    nearDoor = best;
    const el = $('prompt');
    if (!el) return;
    if (best) {
      $('prompt-name').textContent = best.name || '민가';
      $('prompt-btn').textContent = best.kind === 'gate' ? '탑에 오르기' : (FACILITY_SCREENS[best.key] ? '들어가기' : '두드리기');
      el.classList.remove('hidden');
    } else el.classList.add('hidden');
  }

  // ---------- 대화 ----------
  function rewardText(r) {
    if (!r) return '';
    const parts = [];
    if (r.gold) parts.push(UI.gold(r.gold));
    if (r.xp) parts.push(`경험치 ${r.xp}`);
    if (r.gems) parts.push(`보석 ${r.gems}`);
    const items = (r.items || []).concat(r.toBank || []);
    if (items.length) parts.push(items.map((it) => { const d = Items.get(it.id); return (d ? d.name : it.id) + (it.qty > 1 ? ` ×${it.qty}` : ''); }).join(', '));
    let s = parts.join(' · ');
    if (r.toBank && r.toBank.length) s += ' (가방이 가득 차 은행으로)';
    if (r.levelsGained) s += ` · 레벨 업!`;
    return s;
  }
  function portraitOf(kind) { const s = Sprites.get(kind); return s && s.down ? s.down[0] : null; }

  async function talkTo(n) {
    if (talking) return;
    talking = true;
    const G = State.get();
    n.dir = faceDir(n, player); player.dir = faceDir(player, n); player.path = null;
    n.talkT = 999; n.path = null; n.bubble = null;
    try {
      // 대화를 시작한 순간 '이야기했다'로 친다 — talk 목표가 같은 대화 안에서 바로 완료 선택지로 나오게
      Events.emit('npc_talk', { npcId: n.npcId });
      const lines = Dialogue.greet(n.npcId, G).slice();
      const mine = Quests.active(G).filter((q) => q.def.giver === n.npcId);
      const doing = mine.find((q) => !q.complete);
      if (doing && doing.def.text && doing.def.text.progress) lines.push(doing.def.text.progress);
      const choices = [];
      for (const q of mine.filter((q) => q.complete)) choices.push({ label: `완료: ${q.title}`, value: { t: 'complete', id: q.id }, primary: true });
      for (const d of Quests.available(G, n.npcId)) choices.push({ label: `수락: ${d.title}`, value: { t: 'accept', id: d.id }, primary: !choices.length });
      if (choices.length) choices.push({ label: '닫기', value: null });
      const portrait = portraitOf(n.kind);
      const v = await UI.dialog({ name: n.name, portrait, lines, choices: choices.length ? choices : undefined });
      if (v && v.t === 'accept') {
        const d = QuestData.get(v.id);
        if (Quests.accept(G, v.id)) {
          if (d.text && d.text.offer) await UI.dialog({ name: n.name, portrait, lines: [d.text.offer] });
          UI.toast(`퀘스트 수락: ${d.title}`, 2400);
        } else UI.toast('지금은 받을 수 없는 의뢰예요');
      } else if (v && v.t === 'complete') {
        const d = QuestData.get(v.id);
        const r = Quests.complete(G, v.id);
        if (r) {
          if (d.text && d.text.complete) await UI.dialog({ name: n.name, portrait, lines: [d.text.complete] });
          UI.toast(`완료! ${rewardText(r)}`, 3200);
        } else UI.toast('아직 완료할 수 없어요');
      }
      State.save();
    } finally {
      n.talkT = 1.2; talking = false;
      updateHud(true);
      checkTownEvent();
    }
  }

  // 챕터 마을 이벤트: 끝낸 챕터(n < 현재 챕터)의 townEvent 중 아직 안 본 가장 최근 것 하나만 재생하고,
  // 그 이전 것들은 본 것으로 처리한다(이어하기·디버그로 여러 챕터를 건너뛰어도 대화가 줄줄이 나오지 않게).
  function checkTownEvent() { if (pendingEventT < 0) pendingEventT = 0.7; }
  async function playTownEvent() {
    const G = State.get();
    const flags = G.story.flags || (G.story.flags = {});
    let latest = null;
    for (let n = 1; n < (G.story.chapter || 1); n++) {
      const ev = Story.townEvent ? Story.townEvent(n) : (Story.chapters[n] && Story.chapters[n].townEvent);
      if (!ev || flags['town_event_' + n]) continue;
      latest = { n, ev };
    }
    if (!latest) return;
    for (let n = 1; n <= latest.n; n++) flags['town_event_' + n] = true;
    State.save();
    const npc = npcs.find((x) => x.npcId === latest.ev.npc);
    talking = true;
    if (npc) { npc.talkT = 999; say(npc, '!', 1.5); }
    try {
      await UI.dialog({ name: Dialogue.name(latest.ev.npc), portrait: npc ? portraitOf(npc.kind) : null, lines: latest.ev.lines });
    } finally { talking = false; if (npc) npc.talkT = 1; }
  }

  // ---------- HUD ----------
  function updateHud(force) {
    const G = State.get(), p = G.player;
    let d = null; try { d = Stats.derive(p, G); } catch (e) { d = { maxHp: p.hp || 1, maxMp: p.mp || 1 }; }
    const set = (id, v) => { const e = $(id); if (e && e.textContent !== String(v)) e.textContent = v; };
    const bar = (id, v, m) => { const e = $(id); if (e) e.style.width = Math.max(0, Math.min(100, m ? (v / m) * 100 : 0)) + '%'; };
    set('hud-name', p.name);
    set('hud-lv', `Lv.${p.level} 사제`);
    bar('hud-hp', p.hp, d.maxHp); bar('hud-mp', p.mp, d.maxMp); bar('hud-fatigue', p.fatigue, 100);
    set('hud-hp-text', `HP ${Math.round(p.hp)}/${Math.round(d.maxHp)}`);
    set('hud-fatigue-text', `피로 ${Math.round(p.fatigue)}`);
    set('gold', Math.floor(p.gold).toLocaleString('ko-KR'));
    set('hud-place', `${G.day}일차 · ${G.story.chapter}장`);
    // 하단 버튼 배지: 분배할 스탯 포인트, 완료 보고할 퀘스트 수
    const badge = (id, n) => { const e = $(id); if (!e) return; e.textContent = n > 0 ? n : ''; e.classList.toggle('hidden', !(n > 0)); };
    badge('badge-status', p.statPoints || 0);
    let done = 0; try { done = Quests.active(G).filter((q) => q.complete).length; } catch (e) { done = 0; }
    badge('badge-quests', done);
    badge('badge-party', 0);
  }

  // ---------- 그리기 ----------
  function drawActor(ctx, a) {
    const s = a.sprite, img = s[a.dir][a.frame];
    Pixel.ellipse(ctx, Math.round(a.x), Math.round(a.y) - 1, 8, 3, 'rgba(0,0,0,0.18)'); // 발 그림자
    ctx.drawImage(img, Math.round(a.x) - s.anchor.x, Math.round(a.y) - s.anchor.y);
  }
  function drawCloudShadow(ctx, cx, cy, r) {
    // 구름 모양(타원 3개 합) + 가장자리 2px 체커 디더로 흐리게
    const col = 'rgba(40,60,90,0.05)', edge = 'rgba(40,60,90,0.025)';
    const parts = [[0, 0, r], [-Math.round(r * 0.5), -Math.round(r * 0.3), Math.round(r * 0.6)], [Math.round(r * 0.35), -Math.round(r * 0.4), Math.round(r * 0.7)]];
    const inside = (x, y, shrink) => parts.some(([ox, oy, rr]) => { const rx = rr - shrink, ry = Math.round(rr * 0.55) - shrink; if (rx <= 0 || ry <= 0) return false; const dx = (x - cx - ox) / rx, dy = (y - cy - oy) / ry; return dx * dx + dy * dy <= 1; });
    const R0 = Math.round(r * 1.1), RY = Math.round(r * 0.7);
    ctx.fillStyle = col;
    for (let y = cy - RY; y <= cy + RY; y++) {
      let run = -1;
      for (let x = cx - R0; x <= cx + R0 + 1; x++) {
        const inCore = x <= cx + R0 && inside(x, y, 2);
        if (inCore && run < 0) run = x; else if (!inCore && run >= 0) { ctx.fillRect(run, y, x - run, 1); run = -1; }
      }
    }
    ctx.fillStyle = edge;
    for (let y = cy - RY; y <= cy + RY; y++) for (let x = cx - R0 + (y & 1); x <= cx + R0; x += 2) if (inside(x, y, 0) && !inside(x, y, 2)) ctx.fillRect(x, y, 1, 1);
  }

  function draw(ctx, view) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#cfe6f5';
    ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);
    const { cx, cy } = Scenes.beginWorld(ctx);
    ctx.drawImage(world.ground, 0, 0);
    if (tapMark) {
      const r = 6 + Math.round((1 - tapMark.t) * 8);
      Pixel.ellipse(ctx, Math.round(tapMark.x), Math.round(tapMark.y), r, Math.round(r * 0.5), 'rgba(255,255,255,0.7)');
      Pixel.ellipse(ctx, Math.round(tapMark.x), Math.round(tapMark.y), r - 1, Math.max(0, Math.round(r * 0.5) - 1), 'rgba(90,170,255,0.5)');
    }
    // 깊이 정렬(발 y 가 클수록 앞)
    const list = [];
    for (const o of world.objects) {
      if (o.y + o.canvas.height < cy || o.y > cy + view.viewH || o.x + o.canvas.width < cx || o.x > cx + view.viewW) continue;
      list.push(o);
    }
    for (const n of npcs) if (Scenes.visible(n.x - 20, n.y - 48, 40, 52)) list.push({ kind: 'actor', actor: n, sortY: n.y });
    list.push({ kind: 'actor', actor: player, sortY: player.y });
    list.sort((a, b) => a.sortY - b.sortY);
    const elderAway = (State.get().story.chapter || 1) <= 5; // 1~5장: 장로는 탑에 갇혀 '수정 너머 목소리' — 반투명으로 그려 실체가 아님을 보인다
    for (const o of list) {
      if (o.kind !== 'actor') { ctx.drawImage(o.canvas, o.x, o.y); continue; }
      if (elderAway && o.actor.npcId === 'priest_elder') { ctx.globalAlpha = 0.5; drawActor(ctx, o.actor); ctx.globalAlpha = 1; }
      else drawActor(ctx, o.actor);
    }
    ctx.drawImage(world.overlay, 0, 0);
    for (const c of clouds) drawCloudShadow(ctx, Math.round(c.x), Math.round(c.y), c.r);
    Scenes.endWorld(ctx);
    // 화면 공간: 건물 간판 → 말풍선 → 조이스틱
    for (const o of world.objects) {
      if (o.kind !== 'building' || !o.ref.name) continue;
      const b = o.ref;
      const lx = o.label ? o.label.x : (b.x + b.w / 2) * TILE, ly = o.label ? o.label.y : (b.y + b.h) * TILE - 80;
      Scenes.drawLabel(ctx, b.name, lx, ly, nearDoor === b ? { bg: 'rgba(255,240,180,0.95)' } : {});
    }
    for (const a of npcs.concat([player])) if (a.bubble) Scenes.drawBubble(ctx, a.bubble, a.x, a.y - a.sprite.anchor.y - 4);
    Scenes.drawJoystick(ctx);
  }

  // ---------- 씬 수명 ----------
  let unsubs = [];
  function onPromptClick() { if (nearDoor) enterBuilding(nearDoor); }

  const scene = {
    // 배율: 마을은 던전보다 가깝게(가로 약 14타일 목표 — 실제 배율은 Scenes.applyZoom 이 0.25/0.5 단위로 맞춘다)
    zoomDivisor: 14 * 32,
    enter(params = {}) {
      ensureWorld();
      // 탑에서 돌아오면 성문 앞, 그 외(새 게임·이어하기)는 마을 중앙 광장
      if (params.from === 'dungeon' || params.from === 'tower' || scenePrev === 'dungeon') { player.x = 12 * TILE; player.y = 8.5 * TILE; player.dir = 'down'; }
      else if (!entered) { player.x = 12 * TILE; player.y = 18.5 * TILE; }
      player.path = null; player.onArrive = null; nearDoor = null;
      Scenes.followCamera(player, Town.W, Town.H, true);
      const hud = $('hud'); if (hud) hud.classList.remove('hidden');
      const pb = $('prompt-btn'); if (pb) pb.onclick = onPromptClick;
      unsubs.forEach((u) => u()); unsubs = [];
      if (typeof Events !== 'undefined') {
        // 마을에 있는 동안 상태가 바뀌면 HUD 즉시 갱신(1초 주기를 기다리지 않게)
        for (const ev of ['gold_changed', 'level_up', 'quest_completed', 'quest_accepted', 'party_changed', 'day_passed', 'stat_allocated', 'ui_close']) unsubs.push(Events.on(ev, () => updateHud(true)));
        unsubs.push(Events.on('chapter_advanced', checkTownEvent));
      }
      updateHud(true);
      if (!entered) UI.toast('드래그로 이동, 가까이서 탭하면 대화, 두 번 탭하면 메뉴!', 3500);
      entered = true;
      checkTownEvent();
    },
    exit() {
      unsubs.forEach((u) => u()); unsubs = [];
      const hud = $('hud'); if (hud) hud.classList.add('hidden');
      const pr = $('prompt'); if (pr) pr.classList.add('hidden');
      nearDoor = null;
    },
    update(dt) {
      const G = State.get();
      updatePlayer(dt);
      for (const n of npcs) updateNpc(n, dt, G);
      if (tapMark) { tapMark.t += dt * 2; if (tapMark.t >= 1) tapMark = null; }
      for (const c of clouds) { c.x += dt * 8; c.y += dt * 3; if (c.x - c.r > Town.W) c.x = -c.r; if (c.y - c.r > Town.H) c.y = -c.r; }
      Scenes.followCamera(player, Town.W, Town.H);
      updatePrompt();
      hudT -= dt; if (hudT <= 0) {
        hudT = 1; updateHud();
        // 구인구직 게시판은 마을에 있는 동안 계속 움직인다(지원 결과·새 지원자 토스트)
        if (typeof RecruitUI !== 'undefined' && RecruitUI) RecruitUI.pump();
      }
      if (pendingEventT >= 0 && !talking && !UI.isOpen() && !document.querySelector('.ui-overlay')) { pendingEventT -= dt; if (pendingEventT < 0) playTownEvent(); }
    },
    draw,
    onTap,
    onJoyStart() { if (player) { player.path = null; player.onArrive = null; } },
    // 더블탭 원형 메뉴: 첫 탭으로 시작한 이동은 취소하고 캐릭터를 중심으로 연다
    onDoubleTap() { if (player) { player.path = null; player.onArrive = null; } tapMark = null; },
    menuAnchor() { return player ? { x: player.x, y: player.y - 18 } : null; },
  };
  Scenes.register('town', scene);

  // 디버그/E2E 용 접근자(main.js 가 window.__healer 에 묶는다)
  return { scene, goTo, say, talkTo, enterBuilding, updateHud, get player() { ensureWorld(); return player; }, get npcs() { ensureWorld(); return npcs; }, npcById: (id) => { ensureWorld(); return npcs.find((n) => n.npcId === id) || null; }, NPC_LAYOUT, FACILITY_SCREENS };
})();
if (typeof module !== 'undefined') module.exports = TownScene;
