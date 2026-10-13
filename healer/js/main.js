// 모두의 힐러 — 마을 탐험 (게임 루프, 카메라, 입력, 캐릭터/NPC)
(() => {
  const TILE = Town.TILE;
  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');
  const promptEl = document.getElementById('prompt');
  const promptName = document.getElementById('prompt-name');
  const promptBtn = document.getElementById('prompt-btn');
  const toastEl = document.getElementById('toast');

  let DPR = 1, zoom = 3, viewW = 0, viewH = 0; // viewW/H: 월드 px 단위 화면 크기
  const cam = { x: 0, y: 0 };
  let world = null;

  // ---------- 캐릭터 ----------
  function makeActor(kind, x, y, opts = {}) {
    return Object.assign({
      kind, x, y, dir: 'down', moving: false, animT: 0, frame: 0,
      speed: 104, path: null, pathIdx: 0, target: null,
      sprite: Sprites.get(kind),
      bubble: null, bubbleT: 0,
      ai: null,
    }, opts);
  }

  const player = makeActor('player', 12 * TILE, 36 * TILE, { speed: 120, name: '리프' });

  const LINES = {
    villager: ['힐러님! 오늘도 탑에 오르시나요?', '탑 꼭대기에는 뭐가 있을까요…', '대장간 아저씨가 새 지팡이를 만들었대요.', '여관 스튜가 최고예요!', '99층… 아직 아무도 못 봤대요.', '경매장에 레어 반지가 올라왔대요!', '피로하면 여관에서 푹 쉬세요.', '저주에 걸리면 힐러님만 믿어요!', '날씨 참 좋네요~', '길드에 들어가면 든든하대요.'],
    child: ['나도 커서 힐러가 될래요!', '탑 괴물 무서워요…', '술래잡기 할래요?'],
    knight: ['탑에 들어가려면 파티가 필요합니다.', '성문은 제가 지킵니다.', '힐러님, 몸조심하세요.'],
    priest: ['신전에서 치유의 기술을 연마하세요.', '빛이 그대와 함께하길.'],
    smith: ['장비 수리는 저에게 맡기세요!', '지팡이 강화? 재료만 있으면 되죠.'],
    merchant: ['포션 사세요~ 싸게 드릴게요!', '잡템 팔러 오셨어요?', '신선한 재료 있어요!'],
  };

  const npcs = [
    makeActor('knight', 10 * TILE, 8.5 * TILE, { ai: 'stand', name: '성문 경비', lines: LINES.knight }),
    makeActor('knight', 14 * TILE, 8.5 * TILE, { ai: 'stand', name: '성문 경비', lines: LINES.knight }),
    makeActor('priest', 6.3 * TILE, 14.3 * TILE, { ai: 'stand', name: '신관', lines: LINES.priest }), // 신전 문 오른쪽(문 앞 지점을 막지 않게)
    makeActor('smith', 6.5 * TILE, 30 * TILE, { ai: 'stand', name: '대장장이', lines: LINES.smith }),
    makeActor('merchant', 9.5 * TILE, 47.3 * TILE, { ai: 'stand', name: '상인', lines: LINES.merchant }),
    makeActor('villagerE', 14.5 * TILE, 47.3 * TILE, { ai: 'stand', name: '상인', lines: LINES.merchant }),
    makeActor('villagerA', 12 * TILE, 15 * TILE, { ai: 'wander', home: { x: 12, y: 15, r: 5 }, name: '마을 주민', lines: LINES.villager, speed: 60 }),
    makeActor('villagerB', 14 * TILE, 31 * TILE, { ai: 'wander', home: { x: 12, y: 31, r: 5 }, name: '마을 주민', lines: LINES.villager, speed: 56 }),
    makeActor('villagerC', 10 * TILE, 33 * TILE, { ai: 'wander', home: { x: 12, y: 32, r: 5 }, name: '마을 주민', lines: LINES.villager, speed: 64 }),
    makeActor('villagerD', 12 * TILE, 43 * TILE, { ai: 'wander', home: { x: 12, y: 43, r: 5 }, name: '마을 주민', lines: LINES.villager, speed: 52 }),
    makeActor('child', 13 * TILE, 51 * TILE, { ai: 'wander', home: { x: 12, y: 52, r: 4 }, name: '아이', lines: LINES.child, speed: 88 }),
    makeActor('child', 10 * TILE, 58 * TILE, { ai: 'wander', home: { x: 12, y: 57, r: 4 }, name: '아이', lines: LINES.child, speed: 80 }),
    makeActor('villagerB', 13 * TILE, 23 * TILE, { ai: 'wander', home: { x: 12, y: 22, r: 4 }, name: '마을 주민', lines: LINES.villager, speed: 60 }),
    makeActor('villagerE', 16 * TILE, 33 * TILE, { ai: 'wander', home: { x: 15, y: 33, r: 4 }, name: '마을 주민', lines: LINES.villager, speed: 56 }),
  ];
  for (const n of npcs) { n.aiT = Math.random() * 3; }

  // ---------- 화면 ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    zoom = Math.max(2, Math.round(canvas.width / 384)); // 폰에서 가로 약 12타일
    viewW = canvas.width / zoom; viewH = canvas.height / zoom;
  }
  window.addEventListener('resize', resize);
  resize();

  function updateCamera(snap) {
    let tx = player.x - viewW / 2, ty = player.y - 20 - viewH / 2;
    tx = Math.max(0, Math.min(Town.W - viewW, tx));
    ty = Math.max(0, Math.min(Town.H - viewH, ty));
    if (Town.W < viewW) tx = (Town.W - viewW) / 2;
    if (Town.H < viewH) ty = (Town.H - viewH) / 2;
    if (snap) { cam.x = tx; cam.y = ty; return; }
    cam.x += (tx - cam.x) * 0.12; cam.y += (ty - cam.y) * 0.12;
  }

  // ---------- 입력 ----------
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, moved: false, startT: 0 };
  const JOY_R = 48; // CSS px
  canvas.addEventListener('pointerdown', (e) => {
    if (joy.id !== null) return;
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = 0; joy.dy = 0; joy.moved = false; joy.active = false; joy.startT = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > 10) { joy.moved = true; joy.active = true; player.path = null; player.target = null; }
    if (joy.active) {
      const k = Math.min(1, d / JOY_R);
      joy.dx = d ? (dx / d) * k : 0; joy.dy = d ? (dy / d) * k : 0;
    }
  });
  const endPointer = (e) => {
    if (e.pointerId !== joy.id) return;
    if (!joy.moved) onTap(e.clientX, e.clientY);
    joy.id = null; joy.active = false; joy.dx = 0; joy.dy = 0;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function screenToWorld(sx, sy) {
    return { x: (sx * DPR) / zoom + cam.x, y: (sy * DPR) / zoom + cam.y };
  }

  function onTap(sx, sy) {
    const w = screenToWorld(sx, sy);
    // NPC 터치 → 대화
    let hit = null, hd = 24; // NPC 터치 반경(월드 px)
    for (const n of npcs) {
      const d = Math.hypot(n.x - w.x, n.y - 18 - w.y); // 스프라이트 몸통 중심 기준
      if (d < hd) { hd = d; hit = n; }
    }
    if (hit) {
      const dist = Math.hypot(hit.x - player.x, hit.y - player.y);
      if (dist < 72) { talkTo(hit); return; }
      // 멀면 NPC 쪽으로 걸어간 뒤 대화
      goTo(hit.x, hit.y + 26, () => talkTo(hit));
      return;
    }
    // 건물 터치 → 문 앞으로
    const b = Town.buildingAtTile(Math.floor(w.x / TILE), Math.floor(w.y / TILE));
    if (b) { const d = Town.doorPoint(b); goTo(d.x, d.y); showTapMark(d.x, d.y); return; }
    goTo(w.x, w.y);
    showTapMark(w.x, w.y);
  }

  let tapMark = null;
  function showTapMark(x, y) { tapMark = { x, y, t: 0 }; }

  function goTo(x, y, onArrive) {
    const path = Town.findPath(player.x, player.y, x, y);
    if (!path) { toast('그곳으로는 갈 수 없어요'); return; }
    // 마지막 지점은 실제 터치 지점으로 (통행 가능하면)
    if (Town.canStand(x, y)) path[path.length - 1] = { x, y };
    // 시작 타일 중심은 생략
    if (path.length > 1) path.shift();
    player.path = path; player.pathIdx = 0; player.onArrive = onArrive || null;
  }

  function talkTo(n) {
    const lines = n.lines || LINES.villager;
    say(n, lines[Math.floor(Math.random() * lines.length)]);
    // 서로 마주보기
    n.dir = faceDir(n, player); n.talkT = 2.5;
    player.dir = faceDir(player, n); player.path = null;
  }
  function faceDir(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  function say(actor, text, dur = 2.6) { actor.bubble = text; actor.bubbleT = dur; }

  let toastT = 0;
  function toast(msg, dur = 2) {
    toastEl.textContent = msg; toastEl.classList.remove('hidden'); toastT = dur;
  }

  // ---------- 이동 ----------
  function tryMove(a, dx, dy) {
    let moved = false;
    if (dx) { const nx = a.x + dx; if (Town.canStand(nx, a.y)) { a.x = nx; moved = true; } }
    if (dy) { const ny = a.y + dy; if (Town.canStand(a.x, ny)) { a.y = ny; moved = true; } }
    return moved;
  }

  function followPath(a, dt) {
    if (!a.path) return false;
    // 경로 단순화: 보이는 가장 먼 지점으로
    while (a.pathIdx + 1 < a.path.length && Town.lineClear(a.x, a.y, a.path[a.pathIdx + 1].x, a.path[a.pathIdx + 1].y)) a.pathIdx++;
    const p = a.path[a.pathIdx];
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
    const step = a.speed * dt;
    if (d <= step) {
      a.x = p.x; a.y = p.y; a.pathIdx++;
      if (a.pathIdx >= a.path.length) { a.path = null; if (a.onArrive) { const f = a.onArrive; a.onArrive = null; f(); } return false; }
      return true;
    }
    const mx = (dx / d) * step, my = (dy / d) * step;
    setDir(a, dx, dy);
    if (!tryMove(a, mx, my)) { a.stuckT = (a.stuckT || 0) + dt; if (a.stuckT > 0.5) { a.path = null; a.stuckT = 0; return false; } }
    else a.stuckT = 0;
    return true;
  }

  function setDir(a, dx, dy) {
    if (Math.abs(dx) > Math.abs(dy) * 1.2) a.dir = dx > 0 ? 'right' : 'left';
    else if (Math.abs(dy) > 0.01) a.dir = dy > 0 ? 'down' : 'up';
  }

  function updatePlayer(dt) {
    let vx = 0, vy = 0;
    if (keys['arrowleft'] || keys['a']) vx -= 1;
    if (keys['arrowright'] || keys['d']) vx += 1;
    if (keys['arrowup'] || keys['w']) vy -= 1;
    if (keys['arrowdown'] || keys['s']) vy += 1;
    if (joy.active) { vx = joy.dx; vy = joy.dy; }
    let moving = false;
    if (vx || vy) {
      player.path = null;
      const len = Math.hypot(vx, vy);
      const k = joy.active ? Math.min(1, len) : 1;
      const nx = (vx / len) * k, ny = (vy / len) * k;
      setDir(player, nx, ny);
      moving = tryMove(player, nx * player.speed * dt, ny * player.speed * dt);
    } else {
      moving = followPath(player, dt);
    }
    animate(player, moving, dt);
  }

  function animate(a, moving, dt) {
    a.moving = moving;
    if (moving) { a.animT += dt * (a.speed / 120) * 10; a.frame = Math.floor(a.animT) % 4; } // 120px/s 에서 10fps, 한 걸음 ≈ 12px
    else { a.animT = 0; a.frame = 0; }
  }

  function updateNpc(n, dt) {
    if (n.bubbleT > 0) { n.bubbleT -= dt; if (n.bubbleT <= 0) n.bubble = null; }
    if (n.talkT > 0) { n.talkT -= dt; animate(n, false, dt); return; }
    if (n.ai === 'stand') {
      n.aiT -= dt;
      if (n.aiT <= 0) { n.aiT = 2 + Math.random() * 4; n.dir = Math.random() < 0.7 ? 'down' : (Math.random() < 0.5 ? 'left' : 'right'); }
      animate(n, false, dt); return;
    }
    if (n.ai === 'wander') {
      let moving = false;
      if (n.path) moving = followPath(n, dt);
      else {
        n.aiT -= dt;
        if (n.aiT <= 0) {
          n.aiT = 1.5 + Math.random() * 4;
          const h = n.home;
          const ti = h.x + Math.round((Math.random() * 2 - 1) * h.r), tj = h.y + Math.round((Math.random() * 2 - 1) * h.r);
          const t = Town.nearestWalkable(ti, tj);
          if (t) {
            const path = Town.findPath(n.x, n.y, t[0] * TILE + TILE / 2, t[1] * TILE + TILE / 2);
            if (path && path.length > 1) { path.shift(); n.path = path; n.pathIdx = 0; }
          }
          if (Math.random() < 0.15) say(n, (n.lines || LINES.villager)[Math.floor(Math.random() * (n.lines || LINES.villager).length)], 2.2);
        }
      }
      animate(n, moving, dt);
    }
  }

  // ---------- 건물 안내 ----------
  let nearBuilding = null;
  function updatePrompt() {
    let best = null, bd = 40; // 문 앞 안내 거리
    for (const o of world.objects) {
      if (o.kind !== 'building' || !o.ref.name) continue;
      const d = Math.hypot(o.door.x - player.x, o.door.y - player.y);
      if (d < bd) { bd = d; best = o.ref; }
    }
    if (best !== nearBuilding) {
      nearBuilding = best;
      if (best) { promptName.textContent = best.name; promptBtn.textContent = best.kind === 'gate' ? '탑에 오르기' : '들어가기'; promptEl.classList.remove('hidden'); }
      else promptEl.classList.add('hidden');
    }
  }
  promptBtn.addEventListener('click', () => {
    if (!nearBuilding) return;
    if (nearBuilding.kind === 'gate') toast('탑은 아직 열리지 않았어요. (전투 시스템 준비 중)', 2.5);
    else toast(nearBuilding.name + '은(는) 준비 중이에요', 2);
  });

  // ---------- 그리기 ----------
  function drawActor(a) {
    const s = a.sprite;
    const img = s[a.dir][a.frame];
    const x = Math.round(a.x) - s.anchor.x, y = Math.round(a.y) - s.anchor.y;
    Pixel.ellipse(ctx, Math.round(a.x), Math.round(a.y) - 1, 8, 3, 'rgba(0,0,0,0.18)'); // 발 그림자(스프라이트 폭 ~22px)
    ctx.drawImage(img, x, y);
  }

  function drawWorld() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#cfe6f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.setTransform(zoom, 0, 0, zoom, -cx * zoom, -cy * zoom);
    ctx.drawImage(world.ground, 0, 0);
    // 터치 표시
    if (tapMark) {
      const r = 6 + Math.round((1 - tapMark.t) * 8);
      Pixel.ellipse(ctx, Math.round(tapMark.x), Math.round(tapMark.y), r, Math.round(r * 0.5), 'rgba(255,255,255,0.7)');
      Pixel.ellipse(ctx, Math.round(tapMark.x), Math.round(tapMark.y), r - 1, Math.max(0, Math.round(r * 0.5) - 1), 'rgba(90,170,255,0.5)');
    }
    // 깊이 정렬 (아래쪽 y가 클수록 앞)
    const list = [];
    for (const o of world.objects) {
      if (o.y + o.canvas.height < cy || o.y > cy + viewH || o.x + o.canvas.width < cx || o.x > cx + viewW) continue;
      list.push(o);
    }
    for (const n of npcs) list.push({ kind: 'actor', actor: n, sortY: n.y });
    list.push({ kind: 'actor', actor: player, sortY: player.y });
    list.sort((a, b) => a.sortY - b.sortY);
    for (const o of list) {
      if (o.kind === 'actor') drawActor(o.actor);
      else ctx.drawImage(o.canvas, o.x, o.y);
    }
    ctx.drawImage(world.overlay, 0, 0);
    // 구름 그림자
    // 구름 모양(타원 3개 합) + 가장자리 2px 체커 디더로 흐리게
    for (const c of clouds) drawCloudShadow(Math.round(c.x), Math.round(c.y), c.r);
    // 화면 공간 요소
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawLabels(cx, cy);
    drawBubbles(cx, cy);
    drawJoystick();
  }

  function drawCloudShadow(cx, cy, r) {
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
    for (let y = cy - RY; y <= cy + RY; y++) for (let x = cx - R0 + ((y & 1)); x <= cx + R0; x += 2) if (inside(x, y, 0) && !inside(x, y, 2)) ctx.fillRect(x, y, 1, 1);
  }
  const clouds = [{ x: 120, y: 400, r: 80 }, { x: 600, y: 1000, r: 110 }, { x: 360, y: 1640, r: 96 }];

  function toScreen(wx, wy, cx, cy) { return { x: (wx - cx) * zoom, y: (wy - cy) * zoom }; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawLabels(cx, cy) {
    const fs = Math.round(10 * DPR);
    ctx.font = `bold ${fs}px -apple-system, "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const o of world.objects) {
      if (o.kind !== 'building' || !o.ref.name) continue;
      const b = o.ref;
      // 라벨은 건물 처마선(벽 상단) 바로 아래 — Town.build() 가 건물마다 label 좌표를 준다
      const wx = o.label ? o.label.x : (b.x + b.w / 2) * TILE, wy = o.label ? o.label.y : (b.y + b.h) * TILE - 80;
      const p = toScreen(wx, wy, cx, cy);
      if (p.x < -80 || p.x > canvas.width + 80 || p.y < -40 || p.y > canvas.height + 40) continue;
      const tw = ctx.measureText(b.name).width + 12 * DPR;
      const th = fs + 8 * DPR;
      ctx.fillStyle = nearBuilding === b ? 'rgba(255,240,180,0.95)' : 'rgba(255,255,255,0.88)';
      roundRect(p.x - tw / 2, p.y - th / 2, tw, th, 4 * DPR); ctx.fill();
      ctx.strokeStyle = 'rgba(90,64,48,0.6)'; ctx.lineWidth = DPR; ctx.stroke();
      ctx.fillStyle = '#4a3a30';
      ctx.fillText(b.name, p.x, p.y + DPR * 0.5);
    }
  }

  function drawBubbles(cx, cy) {
    const fs = Math.round(11 * DPR);
    ctx.font = `${fs}px -apple-system, "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of npcs.concat([player])) {
      if (!a.bubble) continue;
      const p = toScreen(a.x, a.y - a.sprite.anchor.y - 4, cx, cy); // 말풍선 꼬리 = 머리 위
      const tw = ctx.measureText(a.bubble).width + 14 * DPR, th = fs + 10 * DPR;
      let bx = p.x - tw / 2;
      bx = Math.max(4 * DPR, Math.min(canvas.width - tw - 4 * DPR, bx));
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      roundRect(bx, p.y - th, tw, th, 6 * DPR); ctx.fill();
      ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = DPR; ctx.stroke();
      // 꼬리
      ctx.beginPath(); ctx.moveTo(p.x - 4 * DPR, p.y); ctx.lineTo(p.x, p.y + 5 * DPR); ctx.lineTo(p.x + 4 * DPR, p.y); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
      ctx.fillStyle = '#2a2020';
      ctx.fillText(a.bubble, bx + tw / 2, p.y - th / 2 + DPR * 0.5);
    }
  }

  function drawJoystick() {
    if (!joy.active) return;
    const ox = joy.ox * DPR, oy = joy.oy * DPR, R = JOY_R * DPR;
    ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2 * DPR; ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + joy.dx * R, oy + joy.dy * R, R * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    updatePlayer(dt);
    for (const n of npcs) updateNpc(n, dt);
    if (player.bubbleT > 0) { player.bubbleT -= dt; if (player.bubbleT <= 0) player.bubble = null; }
    if (tapMark) { tapMark.t += dt * 2; if (tapMark.t >= 1) tapMark = null; }
    for (const c of clouds) { c.x += dt * 8; c.y += dt * 3; if (c.x - c.r > Town.W) { c.x = -c.r; } if (c.y - c.r > Town.H) c.y = -c.r; }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.add('hidden'); }
    updateCamera(false);
    updatePrompt();
    drawWorld();
    requestAnimationFrame(loop);
  }

  world = Town.build();
  updateCamera(true);
  toast('화면을 터치하면 그곳으로 걸어가요. 드래그하면 조이스틱!', 3.5);
  requestAnimationFrame(loop);

  // 디버그/테스트용
  window.__healer = { player, npcs, cam, goTo, say, toast, Town };
})();
