// 숲 몬스터 스프라이트(1~5층) — 모든 그래픽을 코드로 생성한다.
// 규격: 일반 32×32(발 중앙 anchor y=30), size2 48×48(y=46), 보스 80×80(y=76). 방향 down/up/right(left 는 레지스트리가 반전) × 4프레임
// (0 서기, 1 걷기A, 2 서기, 3 걷기B) + attack 2프레임(0 뒤로 젖힘/무기 들기, 1 앞으로 기울며 휘두름).
// 스타일: 좌상단 광원, 재질당 3톤(밝음/기본/어둠), 외곽선은 따뜻한 갈색(#3b2a2a) — 레이어를 그린 뒤 4방향 1px 팽창으로 자동 외곽선을 붙인다.
// 정수 좌표·fillRect(Pixel.rect/ellipse/circle) 만 사용. pixel.js 는 수정하지 않고 필요한 헬퍼는 여기 둔다.
// 가족별 템플릿: biped(고블린 3종·오크 2종·좀비·해골·늑대인간·트롤·보스 4종), quad(늑대·셰피), spider(거미·여왕), siren(세이렌·여왕), sprite/treant 는 전용.
(() => {
  const O = '#3b2a2a';                 // 외곽선
  const SHADOW = 'rgba(0,0,0,0.22)';   // 바닥 그림자
  const WHITE = '#ffffff';
  const tone = (base, a = 0.33) => [Pixel.shade(base, a), base, Pixel.shade(base, -a)];

  // ---------- 팔레트 (밝음, 기본, 어둠) ----------
  const P = {
    gobSkin: ['#b5dc6a', '#7fb64a', '#4f7f2b'],
    gobCloth: ['#b07a4a', '#845430', '#55351c'],
    hood: ['#5f8c48', '#3f6630', '#294520'],
    purple: ['#b283d9', '#7f55b0', '#52357a'],
    bone: ['#f6efdc', '#d9ccaa', '#a4927a'],
    wolfFur: ['#b4b8c6', '#7d8294', '#4f5366'],
    wolfBelly: ['#e4e6ec', '#c9ccd6', '#9a9eaf'],
    spiderBody: ['#9a74b8', '#6a4a8a', '#3f2a58'],
    spiderMark: ['#f0d04a', '#d4a52a', '#9a721a'],
    wool: ['#fbf7ee', '#e8e0cf', '#c1b59e'],
    sheepFace: ['#5a4a46', '#3f3330', '#2a2220'],
    zombieSkin: ['#a7bd7a', '#7f9a57', '#536a39'],
    zombieCloth: ['#7f8ba4', '#55607a', '#363f55'],
    spriteBody: ['#c4ffe8', '#7fe6c0', '#3fb08e'],
    leaf: ['#a8e86a', '#63b84a', '#3a7d33'],
    wwFur: ['#9a8a7e', '#6b5c52', '#443a33'],
    wwBelly: ['#cdbfae', '#a89a8a', '#7a6c5e'],
    pants: ['#8a6a46', '#5e4630', '#3d2c1c'],
    sirenSkin: ['#f8e4d2', '#edc9ae', '#cf9f84'],
    sirenHair: ['#8ff0ea', '#3fc4c0', '#1f8a8c'],
    sirenTail: ['#7ad4ff', '#3a9edc', '#215f9a'],
    fin: ['#b8ecff', '#7fcbf2', '#3f8fbd'],
    orcSkin: ['#9fc46a', '#6a9a3c', '#3f6a23'],
    leather: ['#a07248', '#6e4a2c', '#45301c'],
    iron: ['#e3e9ee', '#aab6c2', '#6f7c8a'],
    rust: ['#c48a5a', '#8e5a36', '#5a3820'],
    warpaint: ['#ff6a5a', '#d63a2a', '#8e1e14'],
    redHair: ['#ff8a4a', '#e0522a', '#8e2f18'],
    trollSkin: ['#7fd0c0', '#3fa08e', '#246a62'],
    trollHair: ['#ffb060', '#ef7a2a', '#a04a14'],
    bark: ['#a87a4e', '#6f4a2c', '#45301c'],
    rootBark: ['#8a6440', '#5e4226', '#3a2816'],
    gold: ['#ffe680', '#e2bb55', '#9c7a22'],
    ruby: ['#ff8a8a', '#e23a3a', '#8e1a1a'],
    cape: ['#e85a5a', '#b53333', '#741c1c'],
    chiefFur: ['#e8e2d8', '#bfb6aa', '#857b70'],
    coral: ['#ffb3a0', '#ff7a6a', '#c43f3c'],
    pearl: ['#ffffff', '#e8f0f8', '#b7c5d4'],
    teal: ['#7fe0d6', '#3fb0a8', '#1f7572'],
    eyeY: '#ffd84a', eyeR: '#ff4a3a', eyeB: '#4aa8ff', eyeG: '#8cff7a', eyeV: '#c88cff',
    pupil: '#2a1a1a', teeth: '#fff6e0', tongue: '#d85a6a', nose: '#3a6a22',
  };

  // ---------- 레이어 외곽선: 불투명 픽셀을 4방향으로 1px 팽창해 외곽선 색으로 칠한 뒤 원본을 얹는다 ----------
  function outlined(src) {
    const c = Pixel.make(src.width, src.height);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) x.drawImage(src, dx, dy);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = O; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    x.drawImage(src, 0, 0);
    return c;
  }

  // ---------- 프레임 드로잉 컨텍스트 ----------
  // d.layer(fn): 새 투명 레이어에 fn 으로 그린 뒤 외곽선을 붙여 합성. d.plain(fn): 외곽선 없이 바로 합성(빛·그림자).
  function frame(w, h, fn) {
    const out = Pixel.make(w, h);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    const d = {
      w, h, ctx: octx,
      layer(f) { const L = Pixel.make(w, h); const prev = d.ctx; d.ctx = L.getContext('2d'); f(d); d.ctx = prev; octx.drawImage(outlined(L), 0, 0); },
      plain(f) { const prev = d.ctx; d.ctx = octx; f(d); d.ctx = prev; },
      alpha(a, f) { const L = Pixel.make(w, h); const prev = d.ctx; d.ctx = L.getContext('2d'); f(d); d.ctx = prev; octx.globalAlpha = a; octx.drawImage(L, 0, 0); octx.globalAlpha = 1; },
      shadow(cx, cy, rx, ry) { Pixel.ellipse(octx, cx, cy, rx, ry, SHADOW); },
      R(x, y, ww, hh, c) { if (ww <= 0 || hh <= 0) return; d.ctx.fillStyle = c; d.ctx.fillRect(x, y, ww, hh); },
      px(x, y, c) { d.ctx.fillStyle = c; d.ctx.fillRect(x, y, 1, 1); },
      E(cx, cy, rx, ry, c) { if (rx <= 0 || ry <= 0) { d.R(cx - rx, cy - ry, rx * 2 + 1, ry * 2 + 1, c); return; } Pixel.ellipse(d.ctx, cx, cy, rx, ry, c); },
      C(cx, cy, r, c) { if (r <= 0) { d.px(cx, cy, c); return; } Pixel.circle(d.ctx, cx, cy, r, c); },
      // 3톤 구/타원: 어둠 전체 → 기본(좌상 1px 이동, 1 작게) → 밝은 하이라이트(좌상)
      ball(cx, cy, rx, ry, T) {
        d.E(cx, cy, rx, ry, T[2]);
        d.E(cx - 1, cy - 1, Math.max(0, rx - 1), Math.max(0, ry - 1), T[1]);
        const hx = Math.max(1, Math.floor(rx / 3)), hy = Math.max(1, Math.floor(ry / 3));
        d.E(cx - Math.ceil(rx / 2), cy - Math.ceil(ry / 2), hx - 1, hy - 1, T[0]);
      },
      // 3톤 둥근 사각형(모서리 1px 깎음)
      rr(x, y, ww, hh, T) {
        d.R(x + 1, y, ww - 2, hh, T[2]); d.R(x, y + 1, ww, hh - 2, T[2]);
        d.R(x + 1, y + 1, ww - 3, hh - 3, T[1]);
        d.R(x + 2, y + 1, Math.max(1, Math.floor(ww / 3)), 1, T[0]); d.R(x + 1, y + 2, 1, Math.max(1, Math.floor(hh / 3)), T[0]);
      },
      // 밝은 톤 사각(단색) + 외곽 어둠 1줄: 팔다리용
      limb(x, y, ww, hh, T) { d.R(x, y, ww, hh, T[1]); d.R(x + ww - 1, y, 1, hh, T[2]); d.R(x, y + hh - 1, ww, 1, T[2]); d.R(x, y, 1, 1, T[0]); },
      // 큰 눈: 흰자(또는 색 흰자) ww×hh, 동공 pw×ph(우하단 쪽), 하이라이트 1px 좌상
      eye(x, y, ww, hh, sclera, pupil, pw = 1, ph = 2) {
        d.R(x, y, ww, hh, sclera);
        d.R(x + ww - pw - (ww > 2 ? 1 : 0), y + hh - ph, pw, ph, pupil);
        d.px(x, y, WHITE);
      },
      // 플레이어 시트 풍 홍채 눈(흰자 없음): 3×3 홍채 2톤 + 흰 하이라이트
      irisEye(x, y, iris, dark) { d.R(x, y, 3, 3, iris); d.R(x, y + 2, 3, 1, dark); d.R(x + 2, y + 1, 1, 1, dark); d.px(x, y, WHITE); },
      // 문자열 도트맵 찍기('.' 투명)
      blit(rows, pal, x, y) {
        const w0 = rows[0].length;
        for (const r of rows) if (r.length !== w0) throw new Error('도트맵 폭이 다릅니다: "' + r + '"');
        for (let j = 0; j < rows.length; j++) for (let i = 0; i < w0; i++) { const ch = rows[j][i]; if (ch === '.') continue; const col = pal[ch]; if (col) d.px(x + i, y + j, col); }
      },
    };
    fn(d);
    return out;
  }

  // 시트 조립: drawFn(d, dir, f, pose)  pose 0 걷기/서기, 1 공격 준비, 2 공격 휘두름
  function makeSheet(w, h, anchor, drawFn) {
    const sheet = { anchor, w, h };
    for (const dir of ['down', 'up', 'right']) sheet[dir] = [0, 1, 2, 3].map(f => frame(w, h, d => drawFn(d, dir, f, 0)));
    sheet.attack = [1, 2].map(pose => frame(w, h, d => drawFn(d, 'down', 0, pose)));
    return sheet;
  }
  const bobOf = (f, pose) => pose === 0 ? ((f === 1 || f === 3) ? -1 : 0) : (pose === 1 ? -1 : 1);

  // =====================================================================
  // 두발 템플릿 — 고블린/오크/좀비/해골/늑대인간/트롤/보스
  // G: { cx, footY, legH, legW, legGap, bw, bh, hr:[rx,ry], headOver, armW, armL }
  // S: { skin, cloth, legs(T, 다리 재질), face(d,cx,cy,hr,dir), hat(d,dir,cx,cy,hr), weapon(d,dir,hx,hy,pose,f), back(d,cx,bodyTop,bw,bh), body(d,...) 커스텀 몸통, feet T }
  // =====================================================================
  function biped(d, dir, f, pose, G, S) {
    const bob = bobOf(f, pose);
    const lean = pose === 2 ? 1 : 0;                       // 공격 시 상체가 1px 더 내려감(앞으로 숙임)
    const side = dir === 'right';
    const cx = G.cx, footY = G.footY;
    const legTop = footY - G.legH;
    const bw = side ? Math.max(4, Math.round(G.bw * 0.72)) : G.bw;
    const bodyTop = legTop - G.bh + 1 + bob + lean;
    const headCy = bodyTop + G.headOver - G.hr[1] + (pose === 1 ? -1 : 0);
    const legsT = S.legs || S.skin;
    const feetT = S.feet || legsT;
    d.shadow(cx, footY, Math.round(G.bw * 0.7), Math.max(2, Math.round(G.bw / 5)));

    // --- 다리 ---
    d.layer(dd => {
      if (!side) {
        const lx = cx - Math.floor(G.legGap / 2) - G.legW, rx = cx + Math.ceil(G.legGap / 2);
        const liftL = pose === 0 && f === 1 ? 2 : 0, liftR = pose === 0 && f === 3 ? 2 : 0;
        dd.limb(lx, legTop - liftL, G.legW, G.legH - liftL, legsT); dd.limb(lx - 1, footY - 2 - liftL, G.legW + 1, 2, feetT);
        dd.limb(rx, legTop - liftR, G.legW, G.legH - liftR, legsT); dd.limb(rx, footY - 2 - liftR, G.legW + 1, 2, feetT);
        if (S.legDecor) S.legDecor(dd, lx, rx, legTop, footY, G, liftL, liftR);
      } else {
        const sw = pose === 0 ? (f === 1 ? 2 : f === 3 ? -2 : 0) : (pose === 2 ? 2 : -1);
        // 뒷다리(어둡게) → 앞다리
        dd.limb(cx - 1 - sw, legTop, G.legW, G.legH, [legsT[1], legsT[2], legsT[2]]); dd.limb(cx - 2 - sw, footY - 2, G.legW + 1, 2, [feetT[1], feetT[2], feetT[2]]);
        dd.limb(cx + sw - 1, legTop, G.legW, G.legH, legsT); dd.limb(cx + sw - 1, footY - 2, G.legW + 2, 2, feetT);
      }
    });
    // --- 뒤쪽 장비(등/꼬리/망토) ---
    if (S.back) d.layer(dd => S.back(dd, dir, cx, bodyTop, bw, G.bh, headCy, G, f, pose));
    // --- 뒤쪽 팔(옆모습일 때 먼 팔은 숨김) ---
    const armY = bodyTop + 1;
    const swing = pose === 0 ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
    if (!side && !S.noArms) d.layer(dd => {
      // 왼팔(화면 왼쪽)
      const ax = cx - Math.floor(bw / 2) - G.armW;
      const ay = armY + swing + (pose === 1 ? -2 : pose === 2 ? 1 : 0);
      if (pose !== 0 && S.armsUp) { dd.limb(ax, ay - 3, G.armW, G.armL, S.skin); dd.ball(ax + 1, ay - 3, G.armW - 1, G.armW - 1, S.skin); }
      else { dd.limb(ax, ay, G.armW, G.armL, S.skin); dd.ball(ax + Math.floor(G.armW / 2), ay + G.armL, Math.floor(G.armW / 2), Math.floor(G.armW / 2), S.skin); }
      if (S.sleeve) S.sleeve(dd, ax, ay, G.armW, 'L');
    });
    // --- 몸통 ---
    d.layer(dd => {
      if (S.body) S.body(dd, dir, cx, bodyTop, bw, G.bh, f, pose);
      else dd.rr(cx - Math.floor(bw / 2), bodyTop, bw, G.bh, S.cloth || S.skin);
      if (S.bodyDecor) S.bodyDecor(dd, dir, cx, bodyTop, bw, G.bh, f, pose);
    });
    // --- 앞쪽 팔 + 무기 ---
    if (!S.noArms) d.layer(dd => {
      let hx, hy;
      if (!side) {
        const ax = cx + Math.ceil(bw / 2);
        const ay = armY - swing + (pose === 1 ? -3 : pose === 2 ? 2 : 0);
        if (pose === 1) { dd.limb(ax, ay, G.armW, G.armL - 2, S.skin); hx = ax + Math.floor(G.armW / 2); hy = ay - 1; }
        else if (pose === 2) { // 휘두름: 위팔은 아래로 짧게, 아래팔은 몸 앞을 가로질러 왼쪽으로
          const up = Math.max(2, Math.floor(G.armL * 0.45)); hx = cx - 2; hy = ay + up + Math.floor(G.armW / 2);
          dd.limb(ax, ay, G.armW, up + 1, S.skin); dd.limb(hx, ay + up, ax - hx + G.armW, G.armW, S.skin); dd.ball(hx, hy, Math.floor(G.armW / 2), Math.floor(G.armW / 2), S.skin); }
        else { dd.limb(ax, ay, G.armW, G.armL, S.skin); hx = ax + Math.floor(G.armW / 2); hy = ay + G.armL; }
        dd.ball(hx, hy, Math.floor(G.armW / 2), Math.floor(G.armW / 2), S.skin);
        if (S.sleeve) S.sleeve(dd, ax, ay, G.armW, 'R');
      } else {
        const ax = cx - Math.floor(G.armW / 2) + (pose === 2 ? 2 : 0);
        const ay = armY + 1 + (pose === 1 ? -2 : 0);
        dd.limb(ax, ay, G.armW, G.armL - 1, S.skin);
        hx = ax + Math.floor(G.armW / 2) + 1; hy = ay + G.armL - 1;
        dd.ball(hx, hy, Math.floor(G.armW / 2), Math.floor(G.armW / 2), S.skin);
        if (S.sleeve) S.sleeve(dd, ax, ay, G.armW, 'S');
      }
      if (S.weapon && dir !== 'up') S.weapon(dd, dir, hx, hy, pose, f);
    });
    // --- 머리 ---
    d.layer(dd => {
      const hcx = side ? cx + 1 : cx;
      if (S.head) S.head(dd, dir, hcx, headCy, G.hr, f, pose);
      else dd.ball(hcx, headCy, G.hr[0], G.hr[1], S.skin);
      if (dir === 'down' && S.face) S.face(dd, hcx, headCy, G.hr, f, pose);
      if (dir === 'right' && S.faceSide) S.faceSide(dd, hcx, headCy, G.hr, f, pose);
      if (dir === 'up' && S.backHead) S.backHead(dd, hcx, headCy, G.hr);
      if (S.hat) S.hat(dd, dir, hcx, headCy, G.hr, f, pose);
    });
    if (S.front) d.layer(dd => S.front(dd, dir, cx, bodyTop, bw, G.bh, headCy, G, f, pose));
  }

  // ---------- 공용 부품 ----------
  // 뾰족 귀(고블린/정령): 좌우로 뻗음
  function pointyEars(dd, dir, cx, cy, hr, T, len = 5) {
    const ey = cy - 1;
    if (dir === 'right') { dd.R(cx - hr[0] - len + 2, ey - 1, len, 2, T[1]); dd.R(cx - hr[0] - len + 2, ey + 1, len - 1, 1, T[2]); dd.px(cx - hr[0] - len + 2, ey - 1, T[0]); return; }
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? cx - hr[0] - len + 1 : cx + hr[0];
      dd.R(x0, ey - 1, len, 2, T[1]); dd.R(x0, ey + 1, len, 1, T[2]);
      dd.px(s < 0 ? x0 : x0 + len - 1, ey - 2, T[1]);
      dd.px(s < 0 ? x0 + 1 : x0 + len - 2, ey - 1, T[0]);
    }
  }
  // 고블린 얼굴: 큰 노란 눈 + 큰 코 + 이빨 웃음
  function goblinFace(dd, cx, cy, hr, opts = {}) {
    const ey = cy - 1;
    dd.eye(cx - 5, ey, 3, 3, P.eyeY, P.pupil, 1, 2); dd.eye(cx + 3, ey, 3, 3, P.eyeY, P.pupil, 1, 2);
    dd.R(cx - 1, ey + 2, 3, 2, P.gobSkin[2]); dd.px(cx - 1, ey + 2, P.gobSkin[0]);            // 코
    dd.R(cx - 3, cy + 3, 7, 1, O); dd.R(cx - 2, cy + 4, 5, 1, P.teeth); dd.px(cx, cy + 4, O);   // 입+이빨
    if (opts.brow) { dd.R(cx - 5, ey - 1, 3, 1, P.gobSkin[2]); dd.R(cx + 3, ey - 1, 3, 1, P.gobSkin[2]); }
  }
  function goblinFaceSide(dd, cx, cy, hr) {
    const ey = cy - 1;
    dd.eye(cx + 2, ey, 3, 3, P.eyeY, P.pupil, 1, 2);
    dd.R(cx + hr[0] - 1, ey + 2, 3, 2, P.gobSkin[1]); dd.px(cx + hr[0] + 1, ey + 3, P.gobSkin[2]); // 코 앞으로
    dd.R(cx + 1, cy + 3, 5, 1, O); dd.R(cx + 2, cy + 4, 3, 1, P.teeth);
  }
  // 단검(녹슨 쇠)
  function dagger(dd, dir, hx, hy, pose) {
    if (dir === 'right') { dd.R(hx + 1, hy - 1, 6, 2, P.iron[1]); dd.R(hx + 1, hy, 6, 1, P.iron[2]); dd.px(hx + 7, hy - 1, P.iron[0]); dd.R(hx - 1, hy - 2, 2, 4, P.leather[2]); return; }
    if (pose === 1) { dd.R(hx, hy - 7, 2, 7, P.iron[1]); dd.R(hx + 1, hy - 7, 1, 7, P.iron[2]); dd.px(hx, hy - 8, P.iron[0]); dd.R(hx - 1, hy - 1, 4, 1, P.leather[2]); return; }
    if (pose === 2) { dd.R(hx - 7, hy, 7, 2, P.iron[1]); dd.R(hx - 7, hy + 1, 7, 1, P.iron[2]); dd.px(hx - 8, hy, P.iron[0]); dd.R(hx, hy - 1, 1, 4, P.leather[2]); return; }
    dd.R(hx, hy, 2, 6, P.iron[1]); dd.R(hx + 1, hy, 1, 6, P.iron[2]); dd.px(hx, hy + 6, P.iron[0]); dd.R(hx - 1, hy - 1, 4, 1, P.leather[2]);
  }

  // ---------- 고블린 가족 ----------
  const GOB_G = { cx: 16, footY: 30, legH: 5, legW: 3, legGap: 3, bw: 11, bh: 8, hr: [8, 7], headOver: 3, armW: 3, armL: 6 };
  const gobBase = () => ({
    skin: P.gobSkin, cloth: P.gobCloth, legs: P.gobSkin, feet: P.gobSkin,
    face: (dd, cx, cy, hr) => goblinFace(dd, cx, cy, hr),
    faceSide: goblinFaceSide,
    bodyDecor: (dd, dir, cx, top, bw, bh) => { dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 3, bw - 2, 1, P.leather[2]); dd.px(cx, top + bh - 3, P.gold[1]); }, // 벨트
  });
  // 고블린 전사: 가죽 조끼 + 단검 + 두건 없음(머리 가운데 머리털 몇 가닥)
  MonsterSprites.register('goblin', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = gobBase();
    S.weapon = dagger;
    S.hat = (dd, dir, cx, cy, hr) => { pointyEars(dd, dir, cx, cy, hr, P.gobSkin); dd.R(cx - 1, cy - hr[1] - 1, 1, 2, P.gobSkin[2]); dd.R(cx + 1, cy - hr[1] - 1, 1, 2, P.gobSkin[2]); };
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => { dd.R(cx - 1, top + 1, 3, bh - 3, P.gobSkin[1]); dd.R(cx + 1, top + 1, 1, bh - 3, P.gobSkin[2]); dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 2, bw - 2, 1, P.leather[2]); dd.px(cx, top + bh - 2, P.gold[1]); };
    biped(d, dir, f, pose, GOB_G, S);
  }));
  // 고블린 궁수: 녹색 두건 + 활 + 등에 화살통
  MonsterSprites.register('goblin_archer', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = gobBase();
    S.cloth = P.hood;
    S.hat = (dd, dir, cx, cy, hr) => {
      pointyEars(dd, dir, cx, cy, hr, P.gobSkin);
      // 두건: 머리 윗부분 덮고 뒤로 꼬리
      dd.E(cx, cy - 4, hr[0], hr[1] - 3, P.hood[2]); dd.E(cx - 1, cy - 5, hr[0] - 1, hr[1] - 4, P.hood[1]); dd.E(cx - 3, cy - 6, 2, 1, P.hood[0]); dd.px(cx, cy - hr[1] - 1, P.hood[1]);
      if (dir === 'up') { dd.R(cx - 2, cy - 1, 4, 5, P.hood[2]); dd.R(cx - 1, cy, 2, 5, P.hood[1]); }
      else if (dir === 'right') { dd.R(cx - hr[0] - 2, cy - 2, 4, 2, P.hood[1]); dd.R(cx - hr[0] - 3, cy, 3, 2, P.hood[2]); }
    };
    S.back = (dd, dir, cx, top) => { if (dir === 'down') return; const qx = dir === 'up' ? cx + 2 : cx - 4; dd.R(qx, top - 3, 3, 8, P.leather[1]); dd.R(qx + 2, top - 3, 1, 8, P.leather[2]); dd.R(qx, top - 5, 1, 2, P.bone[1]); dd.R(qx + 1, top - 6, 1, 3, P.bone[1]); dd.px(qx + 1, top - 6, P.ruby[1]); };
    S.weapon = (dd, dir, hx, hy, pose) => {
      if (dir === 'right') { dd.R(hx + 2, hy - 8, 1, 14, P.bark[1]); dd.px(hx + 3, hy - 8, P.bark[2]); dd.px(hx + 3, hy + 5, P.bark[2]); dd.R(hx + 1, hy - 7, 1, 12, P.bone[1]); return; }
      const bx = hx + 2 + (pose === 2 ? 6 : 0);
      dd.R(bx, hy - 9, 1, 15, P.bark[1]); dd.px(bx, hy - 9, P.bark[2]); dd.px(bx, hy + 5, P.bark[2]); dd.R(bx + 1, hy - 8, 1, 13, P.bone[1]);
      if (pose === 2) { dd.R(bx - 5, hy - 2, 6, 1, P.bark[2]); dd.px(bx - 6, hy - 2, P.iron[1]); }                        // 화살
      if (pose === 1) { dd.R(bx - 3, hy - 2, 4, 1, P.bark[2]); dd.px(bx - 4, hy - 2, P.iron[1]); }
    };
    biped(d, dir, f, pose, GOB_G, S);
  }));
  // 고블린 주술사: 보라 로브 + 해골 지팡이 + 깃털 머리장식
  MonsterSprites.register('goblin_shaman', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = gobBase();
    S.cloth = P.purple; S.legs = P.purple; S.feet = P.gobSkin;
    S.face = (dd, cx, cy, hr) => { goblinFace(dd, cx, cy, hr); dd.R(cx - 3, cy + 1, 2, 1, P.warpaint[1]); dd.R(cx + 2, cy + 1, 2, 1, P.warpaint[1]); };
    S.hat = (dd, dir, cx, cy, hr) => {
      pointyEars(dd, dir, cx, cy, hr, P.gobSkin);
      // 머리띠 + 깃털 3개
      const by = cy - hr[1] + 2;
      dd.R(cx - hr[0] + 1, by, hr[0] * 2 - 1, 2, P.leather[1]); dd.R(cx - hr[0] + 1, by + 1, hr[0] * 2 - 1, 1, P.leather[2]);
      const fx = dir === 'right' ? cx - 2 : cx;
      dd.R(fx - 3, by - 5, 2, 5, P.warpaint[1]); dd.R(fx, by - 7, 2, 7, P.gold[1]); dd.R(fx + 3, by - 5, 2, 5, P.teal[1]);
      dd.px(fx - 3, by - 5, P.warpaint[0]); dd.px(fx, by - 7, P.gold[0]); dd.px(fx + 3, by - 5, P.teal[0]);
      dd.px(fx - 2, by - 1, P.warpaint[2]); dd.px(fx + 1, by - 1, P.gold[2]); dd.px(fx + 4, by - 1, P.teal[2]);
    };
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => { dd.R(cx - 2, top + 2, 1, 1, P.bone[1]); dd.R(cx, top + 2, 1, 1, P.bone[1]); dd.R(cx + 2, top + 2, 1, 1, P.bone[1]); dd.R(cx - 2, top + 1, 5, 1, P.leather[2]); }; // 뼈 목걸이
    S.weapon = (dd, dir, hx, hy, pose) => {
      const sx = dir === 'right' ? hx + 2 : hx + 2, top = hy - 12 + (pose === 1 ? -2 : pose === 2 ? 3 : 0);
      dd.R(sx, top + 4, 2, 13, P.bark[1]); dd.R(sx + 1, top + 4, 1, 13, P.bark[2]);
      dd.E(sx + 1, top + 1, 2, 2, P.bone[1]); dd.E(sx, top, 1, 1, P.bone[0]); dd.px(sx, top + 1, O); dd.px(sx + 2, top + 1, O); dd.px(sx + 1, top + 3, P.bone[2]); // 해골
      if (pose === 2) { dd.px(sx - 1, top - 2, P.eyeV); dd.px(sx + 3, top - 1, P.eyeV); dd.px(sx + 1, top - 3, P.eyeV); }
    };
    biped(d, dir, f, pose, GOB_G, S);
  }));

  // ---------- 오크 가족 ----------
  const ORC_G = { cx: 16, footY: 30, legH: 6, legW: 4, legGap: 3, bw: 15, bh: 9, hr: [7, 6], headOver: 3, armW: 4, armL: 7 };
  function orcFace(dd, cx, cy, hr, paint) {
    const ey = cy - 1;
    dd.R(cx - 6, ey - 1, 4, 1, P.orcSkin[2]); dd.R(cx + 3, ey - 1, 4, 1, P.orcSkin[2]);  // 눈썹(험악)
    dd.eye(cx - 5, ey, 3, 2, P.eyeR, P.pupil, 1, 1); dd.eye(cx + 3, ey, 3, 2, P.eyeR, P.pupil, 1, 1);
    dd.R(cx - 1, ey + 1, 3, 2, P.orcSkin[2]); dd.px(cx - 1, ey + 1, P.orcSkin[0]);
    dd.R(cx - 4, cy + 3, 9, 1, O); dd.R(cx - 4, cy + 1, 2, 3, P.teeth); dd.R(cx + 3, cy + 1, 2, 3, P.teeth); dd.px(cx - 4, cy + 1, WHITE); dd.px(cx + 3, cy + 1, WHITE); // 엄니
    if (paint) { dd.R(cx - 6, ey + 2, 3, 1, P.warpaint[1]); dd.R(cx + 4, ey + 2, 3, 1, P.warpaint[1]); dd.R(cx - 1, cy - hr[1] + 1, 3, 2, P.warpaint[1]); }
  }
  function orcFaceSide(dd, cx, cy, hr) {
    const ey = cy - 1;
    dd.R(cx + 1, ey - 1, 4, 1, P.orcSkin[2]); dd.eye(cx + 2, ey, 3, 2, P.eyeR, P.pupil, 1, 1);
    dd.R(cx + hr[0] - 1, ey + 1, 3, 2, P.orcSkin[1]); dd.px(cx + hr[0] + 1, ey + 2, P.orcSkin[2]);
    dd.R(cx + 2, cy + 3, 5, 1, O); dd.R(cx + 5, cy + 1, 2, 3, P.teeth); dd.px(cx + 5, cy + 1, WHITE);
  }
  function axe(dd, dir, hx, hy, pose, big = false) {
    const L = big ? 11 : 9;
    if (dir === 'right') { dd.R(hx + 1, hy - 1, L, 2, P.bark[1]); dd.R(hx + 1, hy, L, 1, P.bark[2]); dd.E(hx + L, hy, 2, 3, P.iron[1]); dd.R(hx + L, hy - 3, 1, 7, P.iron[2]); dd.px(hx + L - 1, hy - 2, P.iron[0]); return; }
    if (pose === 1) { dd.R(hx, hy - L, 2, L, P.bark[1]); dd.R(hx + 1, hy - L, 1, L, P.bark[2]); dd.E(hx + 3, hy - L + 1, 3, 2, P.iron[1]); dd.R(hx + 1, hy - L + 1, 5, 1, P.iron[2]); dd.px(hx + 2, hy - L, P.iron[0]); return; }
    if (pose === 2) { dd.R(hx - L, hy, L, 2, P.bark[1]); dd.R(hx - L, hy + 1, L, 1, P.bark[2]); dd.E(hx - L, hy + 1, 2, 3, P.iron[1]); dd.R(hx - L - 2, hy - 2, 1, 7, P.iron[2]); dd.px(hx - L + 1, hy - 1, P.iron[0]); return; }
    dd.R(hx, hy - 2, 2, L, P.bark[1]); dd.R(hx + 1, hy - 2, 1, L, P.bark[2]); dd.E(hx + 3, hy + L - 4, 3, 2, P.iron[1]); dd.R(hx + 1, hy + L - 3, 5, 1, P.iron[2]); dd.px(hx + 2, hy + L - 5, P.iron[0]);
  }
  MonsterSprites.register('orc', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = { skin: P.orcSkin, cloth: P.leather, legs: P.pants, feet: P.leather };
    S.face = orcFace; S.faceSide = orcFaceSide;
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      // 가죽 갑옷: 어깨 징 + 가운데 쇠판
      dd.R(cx - 1, top + 1, 3, bh - 3, P.iron[1]); dd.R(cx + 1, top + 1, 1, bh - 3, P.iron[2]); dd.px(cx - 1, top + 1, P.iron[0]);
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 3, bw - 2, 1, P.leather[2]); dd.px(cx, top + bh - 3, P.gold[1]);
      if (dir !== 'right') { dd.R(cx - Math.floor(bw / 2) - 1, top - 1, 5, 3, P.iron[1]); dd.R(cx - Math.floor(bw / 2) - 1, top + 1, 5, 1, P.iron[2]); dd.px(cx - Math.floor(bw / 2) + 1, top - 2, P.iron[2]); } // 왼쪽 어깨 갑옷+가시
      if (dir === 'right') { dd.R(cx - 2, top - 1, 5, 3, P.iron[1]); dd.R(cx - 2, top + 1, 5, 1, P.iron[2]); dd.px(cx, top - 2, P.iron[2]); }
    };
    S.hat = (dd, dir, cx, cy, hr) => { // 검은 상투 + 작은 귀
      if (dir !== 'right') { dd.R(cx - 3, cy - hr[1] - 2, 6, 3, '#2a2020'); dd.R(cx - 2, cy - hr[1] - 3, 4, 1, '#3f3030'); }
      else { dd.R(cx - 4, cy - hr[1] - 2, 5, 3, '#2a2020'); dd.R(cx - 6, cy - hr[1], 3, 2, '#2a2020'); }
      if (dir === 'down') { dd.R(cx - hr[0] - 1, cy - 1, 2, 3, P.orcSkin[1]); dd.R(cx + hr[0], cy - 1, 2, 3, P.orcSkin[1]); }
    };
    S.weapon = (dd, dir, hx, hy, pose) => axe(dd, dir, hx, hy, pose);
    biped(d, dir, f, pose, ORC_G, S);
  }));
  MonsterSprites.register('orc_berserker', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = { skin: P.orcSkin, cloth: P.orcSkin, legs: P.pants, feet: P.leather, armsUp: true };
    S.face = (dd, cx, cy, hr) => orcFace(dd, cx, cy, hr, true); S.faceSide = orcFaceSide;
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      // 맨가슴에 붉은 전투 문양 + 가죽 띠
      dd.R(cx - 5, top + 2, 2, 1, P.warpaint[1]); dd.R(cx - 4, top + 3, 2, 1, P.warpaint[1]); dd.R(cx + 1, top + 2, 2, 1, P.warpaint[1]); dd.R(cx + 2, top + 3, 2, 1, P.warpaint[1]);
      dd.R(cx - 6, top + 1, 1, bh - 2, P.leather[2]); dd.R(cx + 5, top + 1, 1, bh - 2, P.leather[2]);
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 3, bw - 2, 1, P.leather[2]); dd.px(cx, top + bh - 3, P.gold[1]);
    };
    S.hat = (dd, dir, cx, cy, hr) => { // 붉은 모히칸
      const t = cy - hr[1];
      if (dir !== 'right') { dd.R(cx - 1, t - 4, 3, 5, P.redHair[1]); dd.R(cx - 1, t - 4, 1, 5, P.redHair[0]); dd.px(cx + 1, t - 3, P.redHair[2]); dd.R(cx - 1, t - 5, 1, 1, P.redHair[1]); }
      else { for (let i = 0; i < 6; i++) { const h = [3, 5, 5, 4, 3, 2][i]; dd.R(cx + 3 - i, t - h + 1, 1, h + 1, i < 3 ? P.redHair[1] : P.redHair[2]); } dd.px(cx + 2, t - 4, P.redHair[0]); }
      if (dir === 'down') { dd.R(cx - hr[0] - 1, cy - 1, 2, 3, P.orcSkin[1]); dd.R(cx + hr[0], cy - 1, 2, 3, P.orcSkin[1]); }
    };
    S.weapon = (dd, dir, hx, hy, pose) => axe(dd, dir, hx, hy, pose);
    S.front = (dd, dir, cx, top, bw, bh, headCy, G, f, pose) => { // 왼손에도 도끼(정면)
      if (dir !== 'down') return;
      const ax = cx - Math.floor(bw / 2) - G.armW; const hx = ax + 1, hy = top + 1 + G.armL;
      if (pose === 0) { dd.R(hx - 2, hy - 1, 2, 8, P.bark[1]); dd.E(hx - 3, hy + 6, 2, 2, P.iron[1]); dd.px(hx - 4, hy + 5, P.iron[0]); }
    };
    biped(d, dir, f, pose, ORC_G, S);
  }));

  // ---------- 언데드 ----------
  const ZOM_G = { cx: 16, footY: 30, legH: 6, legW: 4, legGap: 2, bw: 12, bh: 9, hr: [7, 6], headOver: 3, armW: 3, armL: 7 };
  MonsterSprites.register('zombie', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = { skin: P.zombieSkin, cloth: P.zombieCloth, legs: P.pants, feet: P.zombieSkin, noArms: true };
    // 앞으로 뻗은 팔: 정면은 손이 가슴 앞에 크게, 옆면은 수평으로 길게
    S.front = (dd, dir, cx, top, bw, bh, headCy, G, f, pose) => {
      const sw = pose === 0 ? (f === 1 ? 1 : f === 3 ? -1 : 0) : (pose === 2 ? 2 : -2);
      if (dir === 'down') {
        dd.limb(cx - Math.floor(bw / 2) - 2, top + 1, 3, 4, P.zombieCloth); dd.limb(cx + Math.floor(bw / 2) - 1, top + 1, 3, 4, P.zombieCloth);
        dd.ball(cx - 4, top + 6 + sw, 2, 2, P.zombieSkin); dd.ball(cx + 4, top + 6 - sw, 2, 2, P.zombieSkin);
        dd.px(cx - 5, top + 8 + sw, P.zombieSkin[2]); dd.px(cx + 3, top + 8 - sw, P.zombieSkin[2]);
      } else if (dir === 'right') {
        dd.limb(cx - 1, top + 2 + sw, 9, 3, P.zombieCloth); dd.ball(cx + 9, top + 3 + sw, 2, 2, P.zombieSkin); dd.px(cx + 11, top + 3 + sw, P.zombieSkin[2]);
      } else { dd.limb(cx - Math.floor(bw / 2) - 2, top + 1, 3, 3, P.zombieCloth); dd.limb(cx + Math.floor(bw / 2) - 1, top + 1, 3, 3, P.zombieCloth); }
    };
    S.face = (dd, cx, cy, hr) => {
      const ey = cy - 1;
      dd.eye(cx - 5, ey - 1, 3, 3, '#f4f0dc', '#6a3a3a', 1, 1); dd.R(cx + 3, ey, 2, 2, '#1a1414'); dd.px(cx + 4, ey, '#ff6a4a'); // 왼쪽 눈 크게·오른쪽은 빈 구멍
      dd.R(cx - 4, cy + 3, 8, 1, O); dd.R(cx - 3, cy + 2, 1, 1, O); dd.R(cx - 1, cy + 4, 1, 1, O); dd.R(cx + 1, cy + 2, 1, 1, O); dd.R(cx + 3, cy + 4, 1, 1, O); // 꿰맨 입
      dd.R(cx + 4, cy + 2, 3, 2, P.zombieSkin[2]); dd.px(cx + 5, cy + 2, '#5a3a3a');                      // 썩은 뺨
      dd.R(cx - 2, cy - hr[1] + 1, 2, 1, P.zombieSkin[2]);
    };
    S.faceSide = (dd, cx, cy, hr) => { dd.eye(cx + 2, cy - 2, 3, 3, '#f4f0dc', '#6a3a3a', 1, 1); dd.R(cx + 1, cy + 3, 5, 1, O); dd.px(cx + 2, cy + 2, O); dd.px(cx + 4, cy + 4, O); dd.R(cx + hr[0] - 1, cy, 2, 2, P.zombieSkin[2]); };
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      // 찢어진 셔츠 사이로 보이는 갈비뼈 + 벨트
      if (dir !== 'up') { dd.R(cx - 2, top + 2, 5, 4, P.zombieSkin[1]); dd.R(cx - 2, top + 2, 5, 1, P.bone[1]); dd.R(cx - 2, top + 4, 5, 1, P.bone[1]); dd.px(cx + 2, top + 3, P.zombieSkin[2]); }
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 2, bw - 2, 1, P.leather[2]);
      // 밑단 너덜너덜
      dd.px(cx - Math.floor(bw / 2) + 2, top + bh, P.zombieCloth[2]); dd.px(cx + 2, top + bh, P.zombieCloth[2]);
    };
    S.hat = (dd, dir, cx, cy, hr) => { dd.R(cx - 4, cy - hr[1], 3, 2, '#4a3a2a'); dd.R(cx + 1, cy - hr[1] - 1, 2, 2, '#4a3a2a'); dd.px(cx - 1, cy - hr[1], '#4a3a2a'); }; // 남은 머리카락 뭉치
    S.legDecor = (dd, lx, rx, legTop, footY) => { dd.R(rx + 1, legTop + 2, 2, 2, P.zombieSkin[1]); dd.px(rx + 1, legTop + 2, P.bone[1]); }; // 바지 찢어져 무릎 뼈
    biped(d, dir, f, pose, ZOM_G, S);
  }));
  const SKEL_G = { cx: 16, footY: 30, legH: 6, legW: 3, legGap: 3, bw: 10, bh: 8, hr: [7, 6], headOver: 2, armW: 3, armL: 6 };
  MonsterSprites.register('skeleton', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = { skin: P.bone, cloth: P.bone, legs: P.bone, feet: P.bone };
    S.body = (dd, dir, cx, top, bw, bh) => {
      // 척추 + 갈비뼈(가운데 비어 보이게 어두운 바탕)
      dd.R(cx - Math.floor(bw / 2), top, bw, bh, '#4a3a3a');
      dd.R(cx - 1, top, 2, bh, P.bone[1]); dd.R(cx, top, 1, bh, P.bone[2]);
      for (let i = 0; i < 3; i++) { const y = top + 1 + i * 2; dd.R(cx - Math.floor(bw / 2), y, bw, 1, P.bone[1]); dd.px(cx - Math.floor(bw / 2), y, P.bone[0]); dd.px(cx + Math.floor(bw / 2) - 1, y, P.bone[2]); }
      dd.R(cx - Math.floor(bw / 2), top + bh - 2, bw, 2, P.bone[1]); dd.R(cx - Math.floor(bw / 2), top + bh - 1, bw, 1, P.bone[2]); // 골반
    };
    S.face = (dd, cx, cy, hr) => {
      const ey = cy - 1;
      dd.R(cx - 5, ey - 1, 4, 3, '#2a1c1c'); dd.R(cx + 2, ey - 1, 4, 3, '#2a1c1c'); dd.px(cx - 3, ey, P.eyeR); dd.px(cx + 4, ey, P.eyeR); // 눈구멍 + 붉은 불빛
      dd.R(cx - 1, ey + 2, 2, 1, '#2a1c1c'); dd.px(cx, ey + 1, '#2a1c1c');                                                                  // 코 구멍
      dd.R(cx - 4, cy + 3, 9, 2, P.bone[2]); for (let i = -4; i <= 4; i += 2) dd.px(cx + i, cy + 3, P.bone[0]);                            // 이빨
      dd.R(cx - 5, cy + 2, 1, 2, P.bone[2]); dd.R(cx + 5, cy + 2, 1, 2, P.bone[2]);
    };
    S.faceSide = (dd, cx, cy, hr) => { dd.R(cx + 2, cy - 2, 4, 3, '#2a1c1c'); dd.px(cx + 4, cy - 1, P.eyeR); dd.R(cx + 5, cy + 1, 2, 1, '#2a1c1c'); dd.R(cx + 1, cy + 3, 6, 2, P.bone[2]); for (let i = 1; i <= 5; i += 2) dd.px(cx + i, cy + 3, P.bone[0]); };
    S.hat = (dd, dir, cx, cy, hr) => { dd.px(cx - 3, cy - hr[1] + 1, P.bone[2]); dd.px(cx + 2, cy - hr[1], P.bone[2]); if (dir === 'up') { dd.R(cx - 2, cy - 2, 4, 1, P.bone[2]); } }; // 두개골 금
    S.weapon = (dd, dir, hx, hy, pose) => {
      // 녹슨 검
      if (dir === 'right') { dd.R(hx + 1, hy - 1, 8, 2, P.rust[1]); dd.R(hx + 1, hy, 8, 1, P.rust[2]); dd.px(hx + 9, hy - 1, P.rust[0]); dd.R(hx, hy - 2, 1, 4, P.iron[2]); return; }
      if (pose === 1) { dd.R(hx, hy - 9, 2, 9, P.rust[1]); dd.R(hx + 1, hy - 9, 1, 9, P.rust[2]); dd.px(hx, hy - 10, P.rust[0]); dd.R(hx - 1, hy - 1, 4, 1, P.iron[2]); return; }
      if (pose === 2) { dd.R(hx - 9, hy, 9, 2, P.rust[1]); dd.R(hx - 9, hy + 1, 9, 1, P.rust[2]); dd.px(hx - 10, hy, P.rust[0]); dd.R(hx, hy - 1, 1, 4, P.iron[2]); return; }
      dd.R(hx, hy, 2, 8, P.rust[1]); dd.R(hx + 1, hy, 1, 8, P.rust[2]); dd.px(hx, hy + 8, P.rust[0]); dd.R(hx - 1, hy - 1, 4, 1, P.iron[2]);
    };
    S.front = (dd, dir, cx, top, bw, bh, headCy, G) => { // 왼손 둥근 방패(정면/옆면)
      if (dir === 'up') return;
      const sx = dir === 'down' ? cx - Math.floor(bw / 2) - 3 : cx - 5, sy = top + 4;
      dd.ball(sx, sy, 3, 3, P.rust); dd.px(sx, sy, P.iron[1]);
    };
    biped(d, dir, f, pose, SKEL_G, S);
  }));

  // ---------- 늑대인간 ----------
  const WW_G = { cx: 16, footY: 30, legH: 6, legW: 4, legGap: 3, bw: 14, bh: 9, hr: [7, 6], headOver: 3, armW: 4, armL: 8 };
  function wolfHead(dd, dir, cx, cy, hr, fur, eye, opts = {}) {
    // 머리: 타원 + 귀 2개 + 주둥이(정면은 아래쪽 밝은 주둥이, 옆은 앞으로 튀어나옴)
    dd.ball(cx, cy, hr[0], hr[1], fur);
    const earT = opts.earT || fur;
    if (dir === 'right') {
      dd.R(cx - 3, cy - hr[1] - 3, 3, 4, earT[1]); dd.px(cx - 3, cy - hr[1] - 3, earT[0]); dd.px(cx - 1, cy - hr[1] - 1, earT[2]);
      dd.R(cx + hr[0] - 2, cy, 5, 4, fur[1]); dd.R(cx + hr[0] - 2, cy + 3, 5, 1, fur[2]); dd.R(cx + hr[0] + 1, cy + 1, 2, 2, O); dd.px(cx + hr[0] + 1, cy + 1, '#5a4a4a');
      dd.eye(cx + 1, cy - 2, 3, 2, eye, P.pupil, 1, 1);
      dd.px(cx + hr[0] - 1, cy + 4, P.teeth); dd.px(cx + hr[0] + 1, cy + 4, P.teeth);
      return;
    }
    for (const s of [-1, 1]) { const ex = cx + s * (hr[0] - 2); dd.R(ex - 1, cy - hr[1] - 3, 3, 4, earT[1]); dd.px(ex - 1, cy - hr[1] - 3, earT[0]); dd.px(ex + 1, cy - hr[1] - 1, earT[2]); }
    if (dir === 'up') return;
    dd.E(cx, cy + 3, 4, 2, opts.muzzle ? opts.muzzle[1] : fur[0]); dd.R(cx - 1, cy + 2, 3, 2, O); dd.px(cx - 1, cy + 2, '#5a4a4a');
    dd.R(cx - 6, cy - 2, 4, 1, fur[2]); dd.R(cx + 3, cy - 2, 4, 1, fur[2]);
    dd.eye(cx - 5, cy - 1, 3, 2, eye, P.pupil, 1, 1); dd.eye(cx + 3, cy - 1, 3, 2, eye, P.pupil, 1, 1);
    dd.R(cx - 3, cy + 5, 7, 1, O); dd.px(cx - 2, cy + 5, P.teeth); dd.px(cx + 2, cy + 5, P.teeth); dd.px(cx - 3, cy + 6, P.teeth); dd.px(cx + 3, cy + 6, P.teeth);
  }
  function clawHand(dd, hx, hy, dir, pose, fur) {
    if (dir === 'right') { dd.R(hx + 1, hy - 1, 3, 1, P.bone[1]); dd.R(hx + 1, hy + 1, 3, 1, P.bone[1]); dd.px(hx + 4, hy, P.bone[0]); return; }
    const dy = pose === 2 ? 1 : 0;
    dd.R(hx - 2, hy + 1 + dy, 1, 2, P.bone[1]); dd.R(hx, hy + 1 + dy, 1, 3, P.bone[1]); dd.R(hx + 2, hy + 1 + dy, 1, 2, P.bone[1]);
  }
  MonsterSprites.register('werewolf', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const S = { skin: P.wwFur, cloth: P.wwFur, legs: P.pants, feet: P.wwFur, armsUp: true };
    S.head = (dd, dir, cx, cy, hr) => wolfHead(dd, dir, cx, cy, hr, P.wwFur, P.eyeR, { muzzle: P.wwBelly });
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      if (dir !== 'up') { dd.E(cx, top + 3, 3, 2, P.wwBelly[1]); dd.px(cx - 1, top + 2, P.wwBelly[0]); } // 밝은 가슴털
      else { dd.R(cx - 2, top, 1, 3, P.wwFur[2]); dd.R(cx + 1, top + 1, 1, 3, P.wwFur[2]); }
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 2, bw - 2, 2, P.pants[1]); dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 1, bw - 2, 1, P.pants[2]); // 찢어진 바지 허리
      dd.px(cx - 3, top + bh - 1, P.pants[0]);
    };
    S.back = (dd, dir, cx, top, bw, bh) => { // 꼬리
      if (dir === 'down') return;
      const tx = dir === 'up' ? cx + 5 : cx - 8;
      dd.R(tx, top + bh - 2, 3, 4, P.wwFur[1]); dd.R(tx + (dir === 'up' ? 2 : -2), top + bh - 1, 3, 4, P.wwFur[1]); dd.px(tx + (dir === 'up' ? 3 : -2), top + bh + 2, P.wwFur[0]); dd.px(tx + 1, top + bh + 1, P.wwFur[2]);
    };
    S.weapon = (dd, dir, hx, hy, pose) => clawHand(dd, hx, hy, dir, pose, P.wwFur);
    S.front = (dd, dir, cx, top, bw, bh, headCy, G, f, pose) => { if (dir === 'down') { const ax = cx - Math.floor(bw / 2) - G.armW; clawHand(dd, ax + 1, pose !== 0 ? top - 2 : top + 1 + G.armL, 'down', pose); } };
    biped(d, dir, f, pose, WW_G, S);
  }));

  // =====================================================================
  // 네발 템플릿 — 늑대, 셰피
  // =====================================================================
  function quadLegs(dd, dir, cx, y0, legH, T, f, pose, spread, legW = 2) {
    const ph = pose === 0 ? (f === 1 ? 1 : f === 3 ? -1 : 0) : (pose === 2 ? 1 : -1);
    if (dir === 'right') {
      // 뒤→앞: 네 다리 (왼쪽 2개 뒷다리, 오른쪽 2개 앞다리). 걷기: 대각선 쌍이 엇갈림
      const xs = [cx - spread - 1, cx - spread + 2, cx + spread - 3, cx + spread];
      const ofs = [ph, -ph, -ph, ph];
      for (let i = 0; i < 4; i++) { const far = i === 0 || i === 2; dd.limb(xs[i] + ofs[i], y0, legW, legH - (far ? 1 : 0), far ? [T[1], T[2], T[2]] : T); }
    } else {
      const xs = [cx - spread - legW, cx + spread]; // 앞다리 2개(정면에서 보이는 것). 뒷다리는 몸 뒤로 살짝
      const lift = [f === 1 && pose === 0 ? 1 : 0, f === 3 && pose === 0 ? 1 : 0];
      dd.limb(xs[0] - 2, y0 - 1, legW, legH - 1, [T[1], T[2], T[2]]); dd.limb(xs[1] + 2, y0 - 1, legW, legH - 1, [T[1], T[2], T[2]]);
      dd.limb(xs[0], y0 - lift[0], legW + 1, legH - lift[0], T); dd.limb(xs[1], y0 - lift[1], legW + 1, legH - lift[1], T);
    }
  }
  MonsterSprites.register('wolf', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const bob = bobOf(f, pose); const cx = 16, footY = 30;
    d.shadow(cx, footY, dir === 'right' ? 11 : 8, 2);
    d.layer(dd => quadLegs(dd, dir, cx, footY - 5, 5, P.wolfFur, f, pose, dir === 'right' ? 7 : 4));
    if (dir === 'right') {
      d.layer(dd => { // 꼬리(뒤)
        dd.R(cx - 13, 16 + bob, 4, 3, P.wolfFur[1]); dd.R(cx - 14, 14 + bob, 3, 3, P.wolfFur[1]); dd.px(cx - 14, 14 + bob, P.wolfFur[0]); dd.R(cx - 11, 18 + bob, 2, 1, P.wolfFur[2]);
      });
      d.layer(dd => { // 몸통(길게) + 배 밝음
        dd.E(cx - 2, 20 + bob, 10, 5, P.wolfFur[2]); dd.E(cx - 3, 19 + bob, 9, 4, P.wolfFur[1]); dd.E(cx - 6, 17 + bob, 3, 1, P.wolfFur[0]);
        dd.E(cx - 1, 23 + bob, 7, 1, P.wolfBelly[1]);
        dd.R(cx - 5, 16 + bob, 1, 2, P.wolfFur[2]); dd.R(cx + 1, 17 + bob, 1, 2, P.wolfFur[2]);   // 털 결
      });
      d.layer(dd => wolfHead(dd, 'right', cx + 7, 15 + bob + (pose === 2 ? 2 : 0), [5, 4], P.wolfFur, P.eyeY, { muzzle: P.wolfBelly }));
    } else {
      d.layer(dd => { // 몸통(정면: 머리 뒤로 작게) + 엉덩이
        dd.E(cx, 21 + bob, 7, 5, P.wolfFur[2]); dd.E(cx - 1, 20 + bob, 6, 4, P.wolfFur[1]); dd.E(cx - 3, 18 + bob, 2, 1, P.wolfFur[0]);
        if (dir === 'up') { dd.R(cx - 1, 18 + bob, 1, 5, P.wolfFur[2]); dd.R(cx - 2, 15 + bob, 4, 6, P.wolfFur[1]); dd.R(cx - 1, 13 + bob, 3, 3, P.wolfFur[1]); dd.px(cx - 1, 13 + bob, P.wolfFur[0]); } // 꼬리 위로
        else dd.E(cx, 24 + bob, 4, 1, P.wolfBelly[1]);
      });
      d.layer(dd => wolfHead(dd, dir, cx, 14 + bob + (pose === 2 ? 2 : 0), [7, 5], P.wolfFur, P.eyeY, { muzzle: P.wolfBelly }));
    }
  }));
  // 셰피: 양털 뭉치 + 검은 얼굴 + 뿔 + 붉은 미친 눈
  MonsterSprites.register('sheepie', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const bob = bobOf(f, pose); const cx = 16, footY = 30;
    d.shadow(cx, footY, 9, 2);
    d.layer(dd => quadLegs(dd, dir, cx, footY - 4, 4, P.sheepFace, f, pose, dir === 'right' ? 5 : 4, 2));
    const woolBody = (dd, cxx, cy, rx, ry) => {
      dd.ball(cxx, cy, rx, ry, P.wool);
      // 뭉게 털: 가장자리에 작은 원들
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const x = Math.round(cxx + Math.cos(a) * (rx - 1)), y = Math.round(cy + Math.sin(a) * (ry - 1)); dd.C(x, y, 2, (Math.sin(a) > 0.3 || Math.cos(a) > 0.6) ? P.wool[2] : P.wool[1]); dd.px(x - 1, y - 1, P.wool[0]); }
      dd.E(cxx - 1, cy - 1, rx - 3, ry - 3, P.wool[1]); dd.E(cxx - Math.floor(rx / 2), cy - Math.floor(ry / 2), 2, 1, P.wool[0]);
      dd.px(cxx + 2, cy + 1, P.wool[2]); dd.px(cxx - 2, cy + 2, P.wool[2]);
    };
    if (dir === 'right') {
      d.layer(dd => woolBody(dd, cx - 1, 19 + bob, 10, 6));
      d.layer(dd => { // 옆 얼굴(앞쪽 아래)
        const hx = cx + 8, hy = 18 + bob + (pose === 2 ? 2 : 0);
        dd.ball(hx, hy, 4, 4, P.sheepFace); dd.R(hx + 2, hy + 1, 3, 3, P.sheepFace[1]); dd.px(hx + 4, hy + 2, O);
        dd.eye(hx - 1, hy - 2, 3, 3, P.eyeR, P.pupil, 1, 1); dd.px(hx + 1, hy + 3, P.teeth);
        dd.R(hx - 3, hy - 5, 4, 2, P.bone[1]); dd.R(hx - 4, hy - 4, 2, 2, P.bone[1]); dd.px(hx - 3, hy - 5, P.bone[0]); dd.px(hx, hy - 4, P.bone[2]); // 뿔(말림)
        dd.R(hx - 2, hy - 7, 3, 2, P.wool[1]); dd.px(hx - 2, hy - 7, P.wool[0]); // 머리 위 털
      });
    } else {
      d.layer(dd => woolBody(dd, cx, 19 + bob, 9, 6));
      if (dir === 'up') d.layer(dd => { dd.R(cx - 1, 13 + bob, 3, 3, P.wool[1]); dd.px(cx - 1, 13 + bob, P.wool[0]); for (const s of [-1, 1]) { dd.R(cx + s * 7 - 1, 14 + bob, 2, 3, P.bone[1]); dd.px(cx + s * 7 - 1, 14 + bob, P.bone[0]); } }); // 뒤: 뿔 끝과 머리 털
      else d.layer(dd => {
        const hy = 15 + bob + (pose === 2 ? 2 : 0);
        dd.ball(cx, hy, 5, 5, P.sheepFace);
        dd.R(cx - 2, hy - 7, 5, 2, P.wool[1]); dd.px(cx - 2, hy - 7, P.wool[0]); // 머리 위 털 뭉치
        for (const s of [-1, 1]) { const x0 = s < 0 ? cx - 8 : cx + 5; dd.R(x0, hy - 5, 4, 2, P.bone[1]); dd.R(s < 0 ? x0 : x0 + 3, hy - 3, 1, 2, P.bone[1]); dd.R(s < 0 ? x0 + 1 : x0 + 2, hy - 2, 1, 1, P.bone[2]); dd.px(x0 + (s < 0 ? 1 : 2), hy - 5, P.bone[0]); } // 뿔(안쪽으로 말림)
        dd.eye(cx - 4, hy - 2, 3, 3, P.eyeR, P.pupil, 1, 1); dd.eye(cx + 2, hy - 2, 3, 3, P.eyeR, P.pupil, 1, 1);
        dd.R(cx - 1, hy + 1, 2, 1, '#6a5a56');
        dd.R(cx - 2, hy + 3, 5, 1, O); dd.px(cx - 2, hy + 4, P.teeth); dd.px(cx + 2, hy + 4, P.teeth); // 송곳니
        dd.R(cx - 6, hy, 2, 2, P.sheepFace[1]); dd.R(cx + 5, hy, 2, 2, P.sheepFace[1]); // 귀
      });
    }
  }));

  // =====================================================================
  // 거미 템플릿 — 숲 거미, 거미 여왕
  // =====================================================================
  function spiderDraw(d, dir, f, pose, Q) {
    // Q: { cx, footY, abR:[rx,ry], headR:[rx,ry], legLen, body T, mark T, eye, scale }
    const bob = bobOf(f, pose); const { cx, footY } = Q; const s = Q.scale || 1;
    const abY = footY - Q.abR[1] - 2 * s + bob;
    d.shadow(cx, footY, Q.abR[0] + Q.legLen, Math.max(2, Math.round(Q.abR[1] / 2)));
    const ph = pose === 0 ? (f === 1 ? 1 : f === 3 ? -1 : 0) : (pose === 2 ? 2 : -1);
    const legT = Q.body;
    // 다리: 몸 양옆으로 4쌍(정면/뒷면) — 관절이 위로 꺾였다가 끝이 바닥으로
    const legs = (dd, back) => {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const ang = (i - 1.5) * 0.6; // 앞다리는 앞으로, 뒷다리는 뒤로
        const k = (i % 2 === 0 ? ph : -ph);
        for (const sd of [-1, 1]) {
          const ox = cx + sd * (Q.abR[0] - 1 * s);
          const kx = ox + sd * Math.round(Q.legLen * 0.7), ky = abY - Math.round(Q.legLen * 0.5) + Math.round(ang * 2 * s) + k;
          const tx = kx + sd * Math.round(Q.legLen * 0.5), ty = footY - 1 + Math.round(ang * 3 * s) + (i % 2 ? k : -k);
          segLine(dd, ox, abY + Math.round(ang * 2 * s), kx, ky, s, legT[1]); segLine(dd, kx, ky, tx, ty, s, legT[2]);
          dd.R(kx - (s > 1 ? 1 : 0), ky - (s > 1 ? 1 : 0), s, s, legT[0]);
        }
      }
    };
    d.layer(dd => legs(dd));
    d.layer(dd => {
      if (dir === 'right') {
        // 옆: 배가 뒤(왼쪽), 머리가 앞(오른쪽)
        dd.ball(cx - Q.headR[0], abY, Q.abR[0], Q.abR[1], Q.body);
        dd.ball(cx + Q.abR[0] - 1, abY + 1, Q.headR[0], Q.headR[1], Q.body);
        if (Q.mark) { dd.R(cx - Q.headR[0] - 2 * s, abY - 2 * s, 3 * s, s, Q.mark[1]); dd.R(cx - Q.headR[0] - s, abY - s, s, 2 * s, Q.mark[1]); }
        const hx = cx + Q.abR[0] - 1, hy = abY + 1;
        dd.eye(hx + 1, hy - 2 * s, 2 * s, 2 * s, Q.eye, P.pupil, s, s); dd.R(hx + Q.headR[0] - 1, hy, s, s, Q.eye);
        dd.R(hx + Q.headR[0], hy + 1, s, 2 * s, P.teeth); dd.px(hx + Q.headR[0], hy + 2 * s + 1, O);
      } else {
        // 정면: 큰 배가 뒤(위), 작은 머리 앞(아래) — 뒷면은 배만 크게
        dd.ball(cx, abY - 1, Q.abR[0], Q.abR[1], Q.body);
        if (Q.mark) { // 등 무늬(해골/십자)
          if (Q.markRows) dd.blit(Q.markRows, { a: Q.mark[1], b: Q.mark[0], c: Q.mark[2] }, cx - Math.floor(Q.markRows[0].length / 2), abY - Q.abR[1] + 1);
          else { dd.R(cx - s, abY - 3 * s, 2 * s, 4 * s, Q.mark[1]); dd.R(cx - 2 * s, abY - 2 * s, 4 * s, 2 * s, Q.mark[1]); dd.px(cx - s, abY - 3 * s, Q.mark[0]); }
        }
        if (dir === 'down') {
          const hy = abY + Q.abR[1] - Q.headR[1] + 1;
          dd.ball(cx, hy, Q.headR[0], Q.headR[1], Q.body);
          // 눈 4개(큰 2 + 작은 2) 빨강
          dd.eye(cx - 2 * s - 1, hy - s, 2 * s, 2 * s, Q.eye, P.pupil, s, s); dd.eye(cx + 2, hy - s, 2 * s, 2 * s, Q.eye, P.pupil, s, s);
          dd.R(cx - Q.headR[0] + 1, hy - 2 * s, s, s, Q.eye); dd.R(cx + Q.headR[0] - s - 1, hy - 2 * s, s, s, Q.eye);
          // 송곳니
          dd.R(cx - 2 * s, hy + Q.headR[1] - s, s, 2 * s, P.teeth); dd.R(cx + s, hy + Q.headR[1] - s, s, 2 * s, P.teeth);
          dd.R(cx - 2 * s, hy + Q.headR[1] + s, s, 1, O); dd.R(cx + s, hy + Q.headR[1] + s, s, 1, O);
        } else {
          dd.R(cx - s, abY + Q.abR[1] - 2, 2 * s, 2, Q.body[2]); // 뒤: 방적돌기
        }
      }
    });
  }
  // 선분(계단식 1px 선, fillRect)
  function segLine(dd, x0, y0, x1, y1, t, c) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (let i = 0; i < 200; i++) {
      dd.R(x, y, t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  MonsterSprites.register('spider', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) =>
    spiderDraw(d, dir, f, pose, { cx: 16, footY: 30, abR: [6, 5], headR: [4, 3], legLen: 7, body: P.spiderBody, mark: P.spiderMark, eye: P.eyeR, scale: 1 })));

  // =====================================================================
  // 숲 정령 — 떠다니는 잎사귀 정령(발 없음, 빛남)
  // =====================================================================
  MonsterSprites.register('sprite', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) => {
    const cx = 16; const hover = pose === 0 ? [0, -1, -2, -1][f] : (pose === 1 ? -2 : 1);
    d.shadow(cx, 30, 5, 2);
    d.alpha(0.35, dd => dd.E(cx, 18 + hover, 10, 9, '#7fe6c0'));
    // 꼬리(아래로 가늘어지는 빛)
    d.layer(dd => { dd.E(cx, 24 + hover, 3, 3, P.spriteBody[2]); dd.E(cx - 1, 23 + hover, 2, 2, P.spriteBody[1]); dd.R(cx - 1, 27 + hover, 2, 2, P.spriteBody[2]); dd.px(cx, 29 + hover, P.spriteBody[1]); });
    // 몸(작은 둥근 몸) + 팔
    d.layer(dd => {
      dd.ball(cx, 20 + hover, 4, 4, P.spriteBody);
      const sw = pose === 2 ? 2 : 0;
      dd.R(cx - 7, 18 + hover + (pose === 1 ? -3 : 0), 3, 2, P.spriteBody[1]); dd.R(cx + 5 + sw, 18 + hover + (pose === 1 ? -3 : 0), 3, 2, P.spriteBody[1]);
      dd.px(cx - 7, 18 + hover + (pose === 1 ? -3 : 0), P.spriteBody[0]); dd.px(cx + 5 + sw, 18 + hover + (pose === 1 ? -3 : 0), P.spriteBody[0]);
    });
    // 머리(큰 머리, 잎사귀 머리카락) + 얼굴
    d.layer(dd => {
      const hy = 12 + hover;
      dd.ball(cx, hy, 7, 6, P.spriteBody);
      // 잎사귀 머리: 위쪽에 잎 3장
      const lp = dir === 'right' ? cx - 1 : cx;
      dd.E(lp - 4, hy - 6, 2, 2, P.leaf[1]); dd.E(lp + 4, hy - 6, 2, 2, P.leaf[1]); dd.E(lp, hy - 8, 2, 3, P.leaf[1]);
      dd.px(lp - 5, hy - 7, P.leaf[0]); dd.px(lp - 1, hy - 9, P.leaf[0]); dd.px(lp + 3, hy - 7, P.leaf[0]);
      dd.R(lp, hy - 8, 1, 3, P.leaf[2]); dd.px(lp + 5, hy - 5, P.leaf[2]); dd.px(lp - 3, hy - 5, P.leaf[2]);
      if (dir === 'down') {
        dd.irisEye(cx - 5, hy - 2, '#1f6a5a', '#0f3a30'); dd.irisEye(cx + 2, hy - 2, '#1f6a5a', '#0f3a30');
        dd.R(cx - 1, hy + 3, 3, 1, '#1f6a5a'); dd.px(cx, hy + 2, '#1f6a5a');
        dd.px(cx - 6, hy + 2, '#a8ffe0'); dd.px(cx + 6, hy + 2, '#a8ffe0'); // 볼 빛
      } else if (dir === 'right') { dd.irisEye(cx + 2, hy - 2, '#1f6a5a', '#0f3a30'); dd.R(cx + 6, hy + 2, 2, 1, '#1f6a5a'); }
      else { dd.R(cx - 2, hy - 1, 4, 1, P.leaf[2]); dd.R(cx - 1, hy + 1, 2, 1, P.leaf[2]); } // 뒤: 잎맥 무늬
      pointyEars(dd, dir, cx, hy, [7, 6], P.spriteBody, 4);
    });
    // 반짝임
    d.plain(dd => { const t = f % 2; dd.px(cx - 10 + t, 10 + hover, '#e8fff4'); dd.px(cx + 9, 16 + hover - t, '#e8fff4'); dd.px(cx + 7 - t, 6 + hover, '#c4ffe8'); });
  }));

  // =====================================================================
  // 세이렌 템플릿 — 상반신 사람 + 하반신 물고기 꼬리
  // =====================================================================
  function sirenDraw(d, dir, f, pose, Q) {
    // Q: { cx, footY, s(배율 1|2), hair T, skin T, tail T, fin T, eye, crown fn, weapon fn }
    const s = Q.s || 1, cx = Q.cx, footY = Q.footY;
    const bob = pose === 0 ? [0, -1, 0, -1][f] : (pose === 1 ? -1 : 1);
    const side = dir === 'right';
    d.shadow(cx, footY, 9 * s, 2 * s);
    // 꼬리: 몸 아래에서 옆으로 굽어 지느러미
    d.layer(dd => {
      const ty = footY - 2 * s + bob;
      const wag = pose === 0 ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
      if (side) {
        dd.E(cx - 2 * s, ty - 3 * s, 7 * s, 3 * s, Q.tail[2]); dd.E(cx - 3 * s, ty - 4 * s, 6 * s, 2 * s, Q.tail[1]);
        dd.E(cx - 5 * s, ty - 5 * s, 2 * s, s, Q.tail[0]);
        // 꼬리지느러미(뒤쪽 위로)
        dd.R(cx - 11 * s, ty - 9 * s + wag, 3 * s, 7 * s, Q.fin[1]); dd.R(cx - 12 * s, ty - 11 * s + wag, 2 * s, 4 * s, Q.fin[1]); dd.R(cx - 10 * s, ty - 10 * s + wag, s, 6 * s, Q.fin[0]); dd.R(cx - 9 * s, ty - 7 * s + wag, s, 5 * s, Q.fin[2]);
      } else {
        dd.E(cx, ty - 3 * s, 7 * s, 3 * s, Q.tail[2]); dd.E(cx - s, ty - 4 * s, 6 * s, 2 * s, Q.tail[1]); dd.E(cx - 4 * s, ty - 5 * s, 2 * s, s, Q.tail[0]);
        // 비늘 점
        for (let i = -4; i <= 4; i += 2) dd.px(cx + i * s, ty - 3 * s, Q.tail[0]);
        for (let i = -3; i <= 3; i += 2) dd.px(cx + i * s, ty - 2 * s, Q.tail[2]);
        // 꼬리지느러미(오른쪽으로 삐져나옴)
        const fx = cx + 7 * s;
        dd.R(fx, ty - 6 * s + wag, 3 * s, 6 * s, Q.fin[1]); dd.R(fx + 3 * s, ty - 8 * s + wag, 2 * s, 5 * s, Q.fin[1]); dd.R(fx + s, ty - 5 * s + wag, s, 4 * s, Q.fin[0]); dd.R(fx + 2 * s, ty - 2 * s + wag, 3 * s, s, Q.fin[2]);
      }
    });
    // 상반신
    const bodyTop = footY - 8 * s - 6 * s + bob;   // 꼬리 위
    d.layer(dd => {
      const bw = side ? 5 * s : 8 * s;
      dd.rr(cx - Math.floor(bw / 2), bodyTop, bw, 6 * s + 1, Q.skin);
      // 조개/해초 상의
      const topT = Q.top || P.teal;
      dd.R(cx - Math.floor(bw / 2), bodyTop + 2 * s, bw, 2 * s, topT[1]); dd.R(cx - Math.floor(bw / 2), bodyTop + 3 * s, bw, s, topT[2]); dd.px(cx - Math.floor(bw / 2) + 1, bodyTop + 2 * s, topT[0]);
      // 팔(정면: 양팔 옆으로 — 공격 시 앞으로 뻗음)
      const ay = bodyTop + s;
      if (!side) {
        const reach = pose === 2 ? 3 * s : pose === 1 ? -2 * s : 0;
        dd.limb(cx - Math.floor(bw / 2) - 2 * s, ay - (pose === 1 ? 2 * s : 0), 2 * s, 5 * s + reach, Q.skin);
        dd.limb(cx + Math.floor(bw / 2), ay - (pose === 1 ? 2 * s : 0), 2 * s, 5 * s + reach, Q.skin);
        if (Q.weapon) Q.weapon(dd, dir, cx + Math.floor(bw / 2) + s, ay + 5 * s + reach, pose);
      } else {
        dd.limb(cx - s, ay + s, 2 * s, 5 * s, Q.skin);
        if (Q.weapon) Q.weapon(dd, dir, cx + s, ay + 6 * s, pose);
      }
    });
    // 머리 + 머리카락(길게 흘러내림, 뒤에서 보면 전부 머리카락) + 귀지느러미
    d.layer(dd => {
      const hcx = side ? cx + s : cx, hy = bodyTop - 4 * s + (pose === 1 ? -s : 0);
      const hr = [6 * s, 6 * s];
      // 뒷머리(긴 머리카락, 어깨 너머)
      dd.E(hcx - (side ? 2 * s : 0), hy + 3 * s, hr[0] - 1, 6 * s, Q.hair[2]); dd.E(hcx - (side ? 3 * s : s), hy + 2 * s, hr[0] - 2, 5 * s, Q.hair[1]);
      dd.ball(hcx, hy, hr[0], hr[1], Q.skin);
      // 앞머리: 머리 윗부분 덮음
      dd.E(hcx, hy - 4 * s, hr[0], hr[1] - 3 * s, Q.hair[1]); dd.E(hcx - s, hy - 5 * s, hr[0] - s, hr[1] - 4 * s, Q.hair[0]);
      dd.R(hcx - hr[0], hy - 2 * s, hr[0] * 2 + 1, s, Q.hair[1]);
      dd.R(hcx - hr[0] + s, hy, 2 * s, 2 * s, Q.hair[2]); dd.R(hcx + hr[0] - 3 * s, hy, 2 * s, 2 * s, Q.hair[2]); // 옆 머리 가닥
      if (dir === 'down') {
        dd.R(hcx - 2 * s, hy - s, s, s, Q.hair[2]); dd.R(hcx + s, hy - s, s, s, Q.hair[2]); // 앞머리 뾰족 끝
        const ex = hcx - 5 * s, ey = hy;
        dd.irisEye(ex, ey, Q.eye, Pixel.shade(Q.eye, -0.4)); dd.irisEye(hcx + 2 * s, ey, Q.eye, Pixel.shade(Q.eye, -0.4));
        if (s > 1) { dd.R(ex, ey, 3, 3, Q.eye); dd.R(ex + 1, ey + 1, 4, 4, Q.eye); dd.R(ex + 1, ey + 4, 4, 1, Pixel.shade(Q.eye, -0.4)); dd.px(ex, ey, WHITE); dd.R(hcx + 2 * s, ey, 3, 3, Q.eye); dd.R(hcx + 2 * s + 1, ey + 1, 4, 4, Q.eye); dd.R(hcx + 2 * s + 1, ey + 4, 4, 1, Pixel.shade(Q.eye, -0.4)); dd.px(hcx + 2 * s, ey, WHITE); }
        dd.R(hcx - s, hy + 4 * s, 2 * s + 1, s, pose === 2 ? '#8a3a4a' : '#c86a7a'); if (pose === 2) dd.R(hcx - s, hy + 4 * s, 2 * s + 1, 2 * s, '#6a2a3a');
        dd.R(hcx - 5 * s, hy + 3 * s, s, s, '#f2a7a0'); dd.R(hcx + 4 * s, hy + 3 * s, s, s, '#f2a7a0');
      } else if (side) {
        dd.irisEye(hcx + 2 * s, hy, Q.eye, Pixel.shade(Q.eye, -0.4)); dd.R(hcx + 5 * s, hy + 4 * s, 2 * s, s, '#c86a7a');
      } else {
        dd.E(hcx, hy, hr[0], hr[1], Q.hair[1]); dd.E(hcx - s, hy - s, hr[0] - s, hr[1] - s, Q.hair[0]); dd.R(hcx - 2 * s, hy - 2 * s, s, 6 * s, Q.hair[2]); dd.R(hcx + 2 * s, hy - s, s, 6 * s, Q.hair[2]);
      }
      // 귀지느러미
      const finT = Q.fin;
      if (side) { dd.R(hcx - hr[0] - 2 * s, hy - s, 3 * s, 3 * s, finT[1]); dd.R(hcx - hr[0] - 3 * s, hy, s, 2 * s, finT[1]); dd.R(hcx - hr[0] - s, hy - s, s, s, finT[0]); }
      else for (const sd of [-1, 1]) { const x0 = sd < 0 ? hcx - hr[0] - 3 * s : hcx + hr[0]; dd.R(x0, hy - s, 3 * s, 3 * s, finT[1]); dd.R(sd < 0 ? x0 - s : x0 + 3 * s, hy, s, 2 * s, finT[1]); dd.R(sd < 0 ? x0 + s : x0, hy - s, s, s, finT[0]); }
      if (Q.crown) Q.crown(dd, dir, hcx, hy, hr);
    });
    // 노래 음표(공격·떠다님)
    if (pose !== 0 || f === 2) d.plain(dd => { const nx = cx + (side ? 12 * s : 11 * s), ny = bodyTop - 6 * s; dd.R(nx, ny - 3, 1, 4, '#e8f8ff'); dd.R(nx - 1, ny, 2, 1, '#e8f8ff'); dd.px(nx + 1, ny - 3, '#e8f8ff'); });
  }
  MonsterSprites.register('siren', () => makeSheet(32, 32, { x: 16, y: 30 }, (d, dir, f, pose) =>
    sirenDraw(d, dir, f, pose, { cx: 15, footY: 30, s: 1, hair: P.sirenHair, skin: P.sirenSkin, tail: P.sirenTail, fin: P.fin, eye: P.eyeB, top: P.teal })));

  // =====================================================================
  // 트롤 (48×48) — 긴 팔·굽은 등·엄니·주황 모히칸·몽둥이
  // =====================================================================
  const TROLL_G = { cx: 24, footY: 46, legH: 8, legW: 6, legGap: 4, bw: 22, bh: 13, hr: [10, 8], headOver: 4, armW: 5, armL: 12 };
  function trollFace(dd, cx, cy, hr, big) {
    const ey = cy - 2;
    dd.R(cx - 8, ey - 2, 5, 2, P.trollSkin[2]); dd.R(cx + 4, ey - 2, 5, 2, P.trollSkin[2]); // 굵은 눈썹
    dd.eye(cx - 7, ey, 4, 3, P.eyeY, P.pupil, 2, 2); dd.eye(cx + 4, ey, 4, 3, P.eyeY, P.pupil, 2, 2);
    dd.E(cx, ey + 4, 3, 2, P.trollSkin[1]); dd.E(cx - 1, ey + 3, 2, 1, P.trollSkin[0]); dd.px(cx + 2, ey + 5, P.trollSkin[2]); // 큰 주먹코
    dd.R(cx - 6, cy + 5, 13, 1, O); dd.R(cx - 6, cy + 2, 2, 4, P.teeth); dd.R(cx + 5, cy + 2, 2, 4, P.teeth); dd.px(cx - 6, cy + 2, WHITE); dd.px(cx + 5, cy + 2, WHITE); // 엄니
    if (big) { dd.R(cx - 3, cy + 6, 7, 1, P.teeth); }
  }
  function trollFaceSide(dd, cx, cy, hr) {
    const ey = cy - 2;
    dd.R(cx + 2, ey - 2, 5, 2, P.trollSkin[2]); dd.eye(cx + 3, ey, 4, 3, P.eyeY, P.pupil, 2, 2);
    dd.E(cx + hr[0] + 1, ey + 4, 3, 2, P.trollSkin[1]); dd.px(cx + hr[0], ey + 3, P.trollSkin[0]);
    dd.R(cx + 3, cy + 5, 8, 1, O); dd.R(cx + 8, cy + 2, 2, 4, P.teeth); dd.px(cx + 8, cy + 2, WHITE);
  }
  function mohawk(dd, dir, cx, top, T, h = 7, w = 4) {
    if (dir !== 'right') { dd.R(cx - Math.floor(w / 2), top - h, w, h + 1, T[1]); dd.R(cx - Math.floor(w / 2), top - h, 1, h, T[0]); dd.R(cx + Math.floor(w / 2) - 1, top - h + 1, 1, h, T[2]); dd.R(cx - 1, top - h - 1, 2, 1, T[1]); }
    else { for (let i = 0; i < 9; i++) { const hh = Math.max(2, Math.round(h * Math.sin((i + 1) / 10 * Math.PI))); dd.R(cx + 4 - i, top - hh + 1, 1, hh + 1, i < 4 ? T[1] : T[2]); } dd.R(cx + 1, top - h + 1, 2, 2, T[0]); }
  }
  function club(dd, dir, hx, hy, pose, L = 12, w = 3, spikes = true) {
    const T = P.bark;
    if (dir === 'right') { dd.R(hx + 1, hy - 1, L, w, T[1]); dd.R(hx + 1, hy + w - 2, L, 1, T[2]); dd.E(hx + L, hy, w, w + 1, T[1]); dd.E(hx + L - 1, hy - 1, w - 1, w - 1, T[0]); if (spikes) { dd.px(hx + L + w + 1, hy - 1, P.iron[1]); dd.px(hx + L, hy - w - 2, P.iron[1]); } return; }
    if (pose === 1) { dd.R(hx, hy - L, w, L, T[1]); dd.R(hx + w - 1, hy - L, 1, L, T[2]); dd.E(hx + 1, hy - L, w + 1, w, T[1]); dd.E(hx, hy - L - 1, w - 1, w - 1, T[0]); if (spikes) { dd.px(hx - w - 1, hy - L, P.iron[1]); dd.px(hx + w + 2, hy - L, P.iron[1]); dd.px(hx + 1, hy - L - w - 1, P.iron[1]); } return; }
    if (pose === 2) { dd.R(hx - L, hy, L, w, T[1]); dd.R(hx - L, hy + w - 1, L, 1, T[2]); dd.E(hx - L, hy + 1, w, w + 1, T[1]); dd.E(hx - L - 1, hy, w - 1, w - 1, T[0]); if (spikes) { dd.px(hx - L - w - 2, hy + 1, P.iron[1]); dd.px(hx - L, hy + w + 3, P.iron[1]); dd.px(hx - L, hy - w - 1, P.iron[1]); } return; }
    dd.R(hx, hy - 1, w, L, T[1]); dd.R(hx + w - 1, hy - 1, 1, L, T[2]); dd.E(hx + 1, hy + L - 2, w + 1, w, T[1]); dd.E(hx, hy + L - 3, w - 1, w - 1, T[0]); if (spikes) { dd.px(hx - w - 1, hy + L - 2, P.iron[1]); dd.px(hx + w + 2, hy + L - 2, P.iron[1]); dd.px(hx + 1, hy + L + w - 1, P.iron[1]); }
  }
  MonsterSprites.register('troll', () => makeSheet(48, 48, { x: 24, y: 46 }, (d, dir, f, pose) => {
    const S = { skin: P.trollSkin, cloth: P.trollSkin, legs: P.trollSkin, feet: P.trollSkin, armsUp: false };
    S.face = (dd, cx, cy, hr) => trollFace(dd, cx, cy, hr); S.faceSide = trollFaceSide;
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      // 가죽 허리띠 + 배 밝은 톤 + 등(뒤) 척추 가시
      if (dir !== 'up') { dd.E(cx, top + 6, 6, 4, P.trollSkin[0]); dd.E(cx, top + 7, 5, 3, P.trollSkin[1]); }
      else { for (let i = 0; i < 4; i++) dd.R(cx - 1, top + 1 + i * 3, 2, 2, P.trollSkin[2]); }
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 3, bw - 2, 2, P.leather[1]); dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 2, bw - 2, 1, P.leather[2]); dd.R(cx - 1, top + bh - 3, 2, 2, P.gold[1]);
      if (dir !== 'right') { dd.R(cx - Math.floor(bw / 2) - 1, top, 4, 5, P.bone[1]); dd.R(cx - Math.floor(bw / 2) - 1, top + 2, 4, 1, P.bone[2]); } // 어깨 뼈 갑옷
    };
    S.hat = (dd, dir, cx, cy, hr) => { mohawk(dd, dir, cx, cy - hr[1] + 1, P.trollHair); pointyEars(dd, dir, cx, cy, hr, P.trollSkin, 5); };
    S.legDecor = (dd, lx, rx, legTop, footY, G) => { dd.R(lx, legTop, G.legW, 3, P.leather[1]); dd.R(rx, legTop, G.legW, 3, P.leather[1]); dd.R(lx, legTop + 2, G.legW, 1, P.leather[2]); dd.R(rx, legTop + 2, G.legW, 1, P.leather[2]); };
    S.weapon = (dd, dir, hx, hy, pose) => club(dd, dir, hx, hy, pose, 13, 4);
    biped(d, dir, f, pose, TROLL_G, S);
  }));

  // =====================================================================
  // 타락한 나무 정령 (48×48) — 나무 몸통·가지 팔·뿌리 다리·보라빛 눈
  // =====================================================================
  function treantDraw(d, dir, f, pose, Q) {
    const cx = Q.cx, footY = Q.footY, s = Q.s || 1;
    const bob = bobOf(f, pose);
    const sway = pose === 0 ? (f === 1 ? 1 : f === 3 ? -1 : 0) : 0;
    d.shadow(cx, footY, 12 * s, 3 * s);
    const trunkW = 14 * s, trunkTop = footY - 24 * s + bob;
    // 뿌리 다리
    d.layer(dd => {
      const rootY = footY - 7 * s;
      const ph = pose === 0 ? (f === 1 ? 2 : f === 3 ? -2 : 0) : 0;
      dd.limb(cx - 8 * s - (ph > 0 ? 1 : 0), rootY, 5 * s, 7 * s - (ph > 0 ? ph : 0), P.rootBark); dd.limb(cx + 3 * s + (ph < 0 ? 1 : 0), rootY, 5 * s, 7 * s + (ph < 0 ? ph : 0), P.rootBark);
      dd.R(cx - 11 * s, footY - 2 * s, 5 * s, 2 * s, P.rootBark[1]); dd.R(cx + 6 * s, footY - 2 * s, 5 * s, 2 * s, P.rootBark[1]);
      dd.R(cx - 2 * s, footY - 4 * s, 4 * s, 4 * s, P.rootBark[2]); dd.R(cx - 12 * s, footY - s, s, s, P.rootBark[2]); dd.R(cx + 11 * s, footY - s, s, s, P.rootBark[2]);
    });
    // 가지 팔(뒤 레이어)
    d.layer(dd => {
      const ay = trunkTop + 6 * s;
      const lift = pose === 1 ? -5 * s : pose === 2 ? 4 * s : sway;
      const arm = (sd, l) => {
        const x0 = cx + sd * (trunkW / 2);
        segLine(dd, x0, ay, x0 + sd * 7 * s, ay + 2 * s + l, 2 * s, P.bark[1]);
        segLine(dd, x0 + sd * 7 * s, ay + 2 * s + l, x0 + sd * 10 * s, ay + 7 * s + l, 2 * s, P.bark[2]);
        segLine(dd, x0 + sd * 7 * s, ay + 2 * s + l, x0 + sd * 11 * s, ay - 2 * s + l, s, P.bark[1]);
        dd.R(x0 + sd * 11 * s, ay - 3 * s + l, s, s, P.leaf[1]); dd.R(x0 + sd * 10 * s, ay + 7 * s + l, s, s, P.bark[2]);
      };
      if (dir === 'right') { arm(1, lift); } else { arm(-1, lift); arm(1, -lift); }
    });
    // 몸통(나무 껍질 세로결)
    d.layer(dd => {
      const tx = cx - trunkW / 2, th = 20 * s;
      dd.rr(tx, trunkTop, trunkW, th, P.bark);
      for (let i = 1; i < trunkW - 1; i += 3 * s) dd.R(tx + i, trunkTop + 2 * s, s, th - 5 * s, i < trunkW / 2 ? P.bark[0] : P.bark[2]);
      dd.R(tx + 3 * s, trunkTop + 8 * s, 3 * s, 5 * s, P.bark[2]); // 옹이
      if (dir === 'down') {
        // 얼굴: 보라빛 눈(타락) + 울부짖는 입(어두운 구멍)
        const ey = trunkTop + 5 * s;
        dd.R(cx - 5 * s, ey, 3 * s, 3 * s, '#1a1024'); dd.R(cx + 2 * s, ey, 3 * s, 3 * s, '#1a1024');
        dd.R(cx - 4 * s, ey + s, 2 * s, s, P.eyeV); dd.R(cx + 3 * s, ey + s, 2 * s, s, P.eyeV); dd.px(cx - 4 * s, ey + s, '#f0e0ff'); dd.px(cx + 3 * s, ey + s, '#f0e0ff');
        dd.R(cx - 3 * s, ey + 6 * s, 7 * s, pose === 2 ? 5 * s : 3 * s, '#1a1024'); dd.R(cx - 2 * s, ey + 6 * s, s, s, P.bark[0]); dd.R(cx + s, ey + 6 * s, s, s, P.bark[0]);
      } else if (dir === 'right') {
        dd.R(cx + 2 * s, trunkTop + 5 * s, 3 * s, 3 * s, '#1a1024'); dd.R(cx + 3 * s, trunkTop + 6 * s, 2 * s, s, P.eyeV);
        dd.R(cx + 3 * s, trunkTop + 11 * s, 4 * s, 2 * s, '#1a1024');
      }
    });
    // 수관(잎 뭉치: 시들어 가는 색 섞음) — 머리 위
    d.layer(dd => {
      const ly = trunkTop - 2 * s;
      const leafT = Q.leaf || P.leaf;
      dd.ball(cx, ly, 10 * s, 5 * s, leafT);
      dd.E(cx - 5 * s, ly - 4 * s, 4 * s, 3 * s, leafT[1]); dd.E(cx + 4 * s, ly - 4 * s, 5 * s, 3 * s, leafT[1]); dd.E(cx, ly - 6 * s, 4 * s, 3 * s, leafT[1]);
      dd.E(cx - 6 * s, ly - 5 * s, 2 * s, s, leafT[0]); dd.E(cx - s, ly - 7 * s, 2 * s, s, leafT[0]); dd.E(cx + 6 * s, ly - 3 * s, 2 * s, s, leafT[2]);
      // 타락: 보라 잎 몇 개
      dd.R(cx + 2 * s, ly - 2 * s, s, s, P.purple[1]); dd.R(cx - 7 * s, ly, s, s, P.purple[1]); dd.R(cx + 7 * s, ly - 5 * s, s, s, P.purple[0]); dd.R(cx - 3 * s, ly - 5 * s, s, s, P.purple[2]);
      if (dir === 'up') { dd.E(cx, ly + s, 5 * s, 2 * s, leafT[2]); }
    });
  }
  MonsterSprites.register('treant', () => makeSheet(48, 48, { x: 24, y: 46 }, (d, dir, f, pose) => treantDraw(d, dir, f, pose, { cx: 24, footY: 46, s: 1 })));

  // =====================================================================
  // 보스 (80×80)
  // =====================================================================
  // 고블린 왕 그락: 큰 고블린 + 금관(루비·종) + 붉은 망토 + 대형 가시 몽둥이
  const KING_G = { cx: 40, footY: 76, legH: 13, legW: 9, legGap: 6, bw: 32, bh: 23, hr: [20, 17], headOver: 7, armW: 8, armL: 17 };
  MonsterSprites.register('boss_goblin_king', () => makeSheet(80, 80, { x: 40, y: 76 }, (d, dir, f, pose) => {
    const S = { skin: P.gobSkin, cloth: P.leather, legs: P.gobSkin, feet: P.leather };
    S.face = (dd, cx, cy, hr) => {
      const ey = cy - 3;
      dd.R(cx - 13, ey - 3, 8, 2, P.gobSkin[2]); dd.R(cx + 5, ey - 3, 8, 2, P.gobSkin[2]);
      dd.eye(cx - 12, ey, 7, 6, P.eyeY, P.pupil, 3, 4); dd.eye(cx + 5, ey, 7, 6, P.eyeY, P.pupil, 3, 4);
      dd.E(cx, ey + 6, 4, 3, P.gobSkin[1]); dd.E(cx - 1, ey + 5, 2, 1, P.gobSkin[0]); dd.R(cx + 2, ey + 8, 2, 1, P.gobSkin[2]);
      dd.R(cx - 9, cy + 7, 19, 2, O); dd.R(cx - 8, cy + 9, 17, 3, P.teeth); for (let i = -6; i <= 6; i += 4) dd.R(cx + i, cy + 9, 1, 3, P.bone[2]);
      dd.R(cx - 10, cy + 5, 2, 4, P.teeth); dd.R(cx + 9, cy + 5, 2, 4, P.teeth);
      dd.R(cx - 15, cy + 4, 3, 2, '#d88a8a'); dd.R(cx + 13, cy + 4, 3, 2, '#d88a8a');  // 볼
    };
    S.faceSide = (dd, cx, cy, hr) => { dd.R(cx + 3, cy - 6, 8, 2, P.gobSkin[2]); dd.eye(cx + 4, cy - 3, 7, 6, P.eyeY, P.pupil, 3, 4); dd.E(cx + hr[0] + 1, cy + 4, 4, 3, P.gobSkin[1]); dd.px(cx + hr[0], cy + 3, P.gobSkin[0]); dd.R(cx + 2, cy + 7, 12, 2, O); dd.R(cx + 3, cy + 9, 10, 3, P.teeth); };
    S.hat = (dd, dir, cx, cy, hr) => {
      pointyEars(dd, dir, cx, cy, hr, P.gobSkin, 10);
      // 금관: 띠 + 뾰족 5개 + 루비 + 왼쪽에 작은 종(엘다의 종)
      const by = cy - hr[1] + 2, w = dir === 'right' ? 12 : 18;
      dd.R(cx - Math.floor(w / 2), by, w, 4, P.gold[1]); dd.R(cx - Math.floor(w / 2), by + 3, w, 1, P.gold[2]); dd.R(cx - Math.floor(w / 2) + 1, by, 4, 1, P.gold[0]);
      for (let i = 0; i < 5; i++) { const x = cx - Math.floor(w / 2) + Math.round(i * (w - 2) / 4); const h = i === 2 ? 6 : 4; dd.R(x, by - h, 2, h, P.gold[1]); dd.px(x, by - h, P.gold[0]); dd.px(x + 1, by - 1, P.gold[2]); }
      dd.R(cx - 1, by + 1, 3, 2, P.ruby[1]); dd.px(cx - 1, by + 1, P.ruby[0]);
      const bx = dir === 'right' ? cx - 8 : cx - Math.floor(w / 2) - 4;
      dd.R(bx, by - 2, 1, 3, P.gold[2]); dd.ball(bx, by + 3, 2, 2, P.gold); dd.px(bx, by + 5, P.gold[2]);
    };
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      // 털 달린 붉은 망토 깃(어깨) + 가죽 갑옷 + 해골 벨트
      dd.R(cx - Math.floor(bw / 2), top, bw, 4, P.cape[1]); dd.R(cx - Math.floor(bw / 2), top + 3, bw, 1, P.cape[2]); dd.R(cx - Math.floor(bw / 2) + 2, top, 5, 1, P.cape[0]);
      for (let i = 0; i < bw; i += 3) dd.R(cx - Math.floor(bw / 2) + i, top + 4, 2, 1, P.chiefFur[1]);
      dd.R(cx - 4, top + 5, 9, bh - 10, P.gobSkin[1]); dd.R(cx + 3, top + 5, 2, bh - 10, P.gobSkin[2]); dd.R(cx - 4, top + 5, 2, 2, P.gobSkin[0]);  // 드러난 배
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 5, bw - 2, 3, P.leather[2]); dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 5, bw - 2, 1, P.leather[1]);
      dd.ball(cx, top + bh - 4, 3, 2, P.bone); dd.px(cx - 1, top + bh - 4, O); dd.px(cx + 1, top + bh - 4, O);
    };
    S.back = (dd, dir, cx, top, bw, bh) => { // 망토(뒤/옆)
      if (dir === 'down') return;
      if (dir === 'up') { dd.rr(cx - Math.floor(bw / 2) - 2, top + 2, bw + 4, bh + 8, P.cape); dd.R(cx - 3, top + 6, 1, bh, P.cape[2]); dd.R(cx + 4, top + 4, 1, bh, P.cape[2]); }
      else { dd.rr(cx - Math.floor(bw / 2) - 6, top + 2, 9, bh + 8, P.cape); dd.R(cx - Math.floor(bw / 2) - 4, top + 5, 1, bh, P.cape[2]); }
    };
    S.legDecor = (dd, lx, rx, legTop, footY, G) => { dd.R(lx, legTop + 2, G.legW, 2, P.leather[2]); dd.R(rx, legTop + 2, G.legW, 2, P.leather[2]); };
    S.weapon = (dd, dir, hx, hy, pose) => club(dd, dir, hx, hy, pose, 22, 5);
    biped(d, dir, f, pose, KING_G, S);
  }));

  // 거대 거미 여왕: 보라 거대 거미 + 등의 금빛 해골 무늬 + 금관
  const QUEEN_MARK = [
    '...aaa...',
    '..abbba..',
    '.aabbbaa.',
    '.aa.a.aa.',
    '..aaaaa..',
    '...a.a...',
    '....a....',
    '...aaa...',
  ];
  MonsterSprites.register('boss_spider_queen', () => makeSheet(80, 80, { x: 40, y: 76 }, (d, dir, f, pose) => {
    spiderDraw(d, dir, f, pose, { cx: 40, footY: 76, abR: [20, 17], headR: [12, 9], legLen: 19, body: P.spiderBody, mark: P.spiderMark, markRows: QUEEN_MARK.map(r => r.replace(/a/g, 'a').replace(/b/g, 'b')), eye: P.eyeR, scale: 2 });
    // 금관(머리 위)
    d.layer(dd => {
      const bob = bobOf(f, pose);
      const cx = 40, abY = 76 - 17 - 4 + bob;
      let hx, hy;
      if (dir === 'right') { hx = cx + 20 - 1; hy = abY + 1 - 9; }
      else if (dir === 'down') { hx = cx; hy = abY + 17 - 9 + 1 - 9; }
      else return;
      dd.R(hx - 5, hy, 11, 3, P.gold[1]); dd.R(hx - 5, hy + 2, 11, 1, P.gold[2]);
      for (let i = -4; i <= 4; i += 4) { dd.R(hx + i - 1, hy - 3, 2, 3, P.gold[1]); dd.px(hx + i - 1, hy - 3, P.gold[0]); }
      dd.R(hx - 1, hy, 3, 2, P.purple[0]); dd.px(hx - 1, hy, WHITE);
    });
  }));

  // 늑대인간 족장 루가: 은회색 털 + 해골 어깨 + 뼈 목걸이 + 흉터
  const CHIEF_G = { cx: 40, footY: 76, legH: 15, legW: 10, legGap: 6, bw: 36, bh: 24, hr: [17, 14], headOver: 8, armW: 9, armL: 20 };
  MonsterSprites.register('boss_werewolf_chief', () => makeSheet(80, 80, { x: 40, y: 76 }, (d, dir, f, pose) => {
    const S = { skin: P.chiefFur, cloth: P.chiefFur, legs: P.pants, feet: P.chiefFur, armsUp: true };
    S.head = (dd, dir, cx, cy, hr) => {
      const fur = P.chiefFur;
      dd.ball(cx, cy, hr[0], hr[1], fur);
      if (dir === 'right') {
        dd.R(cx - 6, cy - hr[1] - 6, 5, 8, fur[1]); dd.px(cx - 6, cy - hr[1] - 6, fur[0]); dd.R(cx - 3, cy - hr[1] - 3, 2, 4, '#d8a0a0');
        dd.R(cx + hr[0] - 4, cy + 1, 10, 7, fur[1]); dd.R(cx + hr[0] - 4, cy + 6, 10, 2, fur[2]); dd.R(cx + hr[0] + 3, cy + 2, 3, 3, O); dd.px(cx + hr[0] + 3, cy + 2, '#6a5a5a');
        dd.eye(cx + 2, cy - 4, 5, 4, P.eyeY, P.pupil, 2, 2);
        dd.R(cx + hr[0] - 2, cy + 8, 2, 3, P.teeth); dd.R(cx + hr[0] + 3, cy + 8, 2, 3, P.teeth);
        dd.R(cx + 6, cy - 8, 1, 5, '#b04a4a'); // 흉터
        return;
      }
      for (const s of [-1, 1]) { const ex = cx + s * (hr[0] - 4); dd.R(ex - 2, cy - hr[1] - 6, 5, 8, fur[1]); dd.px(ex - 2, cy - hr[1] - 6, fur[0]); dd.R(ex - 1, cy - hr[1] - 4, 2, 4, '#d8a0a0'); dd.px(ex + 2, cy - hr[1] - 2, fur[2]); }
      if (dir === 'up') return;
      dd.E(cx, cy + 6, 8, 5, P.wwBelly[1]); dd.E(cx - 2, cy + 5, 5, 3, P.wwBelly[0]); dd.R(cx - 2, cy + 3, 5, 3, O); dd.R(cx - 2, cy + 3, 2, 1, '#6a5a5a');
      dd.R(cx - 12, cy - 6, 8, 2, fur[2]); dd.R(cx + 5, cy - 6, 8, 2, fur[2]);
      dd.eye(cx - 11, cy - 4, 6, 4, P.eyeY, P.pupil, 2, 2); dd.eye(cx + 6, cy - 4, 6, 4, P.eyeY, P.pupil, 2, 2);
      dd.R(cx - 7, cy + 10, 15, 2, O); dd.R(cx - 6, cy + 12, 2, 3, P.teeth); dd.R(cx + 5, cy + 12, 2, 3, P.teeth); dd.R(cx - 3, cy + 12, 1, 2, P.teeth); dd.R(cx + 3, cy + 12, 1, 2, P.teeth);
      dd.R(cx + 9, cy - 10, 1, 4, '#b04a4a'); dd.R(cx + 10, cy - 6, 1, 3, '#b04a4a'); // 흉터(오른 눈 위)
    };
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      if (dir !== 'up') { dd.E(cx, top + 8, 7, 5, P.wwBelly[1]); dd.E(cx - 2, top + 7, 4, 3, P.wwBelly[0]); }
      else { dd.R(cx - 4, top + 2, 2, bh - 8, P.chiefFur[2]); dd.R(cx + 3, top + 3, 2, bh - 9, P.chiefFur[2]); }
      // 털 뭉치(몸 양옆 어두운 톱니) + 등줄기
      for (let i = 0; i < bh - 6; i += 4) { dd.R(cx - Math.floor(bw / 2) - 1, top + 3 + i, 3, 2, P.chiefFur[2]); dd.R(cx + Math.floor(bw / 2) - 2, top + 5 + i, 3, 2, P.chiefFur[2]); }
      for (let i = 0; i < 5; i++) { dd.px(cx - 14 + i * 7, top + 1, P.chiefFur[0]); }
      // 뼈 목걸이
      for (let i = -8; i <= 8; i += 4) { dd.R(cx + i, top + 3 + (i === 0 ? 2 : Math.abs(i) === 4 ? 1 : 0), 2, 3, P.bone[1]); dd.px(cx + i, top + 3 + (i === 0 ? 2 : Math.abs(i) === 4 ? 1 : 0), P.bone[0]); }
      dd.R(cx - 10, top + 2, 21, 1, P.leather[2]);
      // 찢어진 바지 허리 + 해골 버클
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 4, bw - 2, 4, P.pants[1]); dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 1, bw - 2, 1, P.pants[2]); dd.R(cx - Math.floor(bw / 2) + 3, top + bh - 4, 6, 1, P.pants[0]);
      // 어깨 해골(왼쪽)
      if (dir !== 'right') { dd.ball(cx - Math.floor(bw / 2) + 1, top + 1, 5, 4, P.bone); dd.R(cx - Math.floor(bw / 2) - 1, top + 1, 2, 2, O); dd.R(cx - Math.floor(bw / 2) + 2, top + 1, 2, 2, O); }
      else { dd.ball(cx - 2, top, 5, 4, P.bone); dd.R(cx - 4, top, 2, 2, O); dd.R(cx - 1, top, 2, 2, O); }
    };
    S.back = (dd, dir, cx, top, bw, bh) => {
      if (dir === 'down') return;
      const tx = dir === 'up' ? cx + 10 : cx - 20;
      dd.R(tx, top + bh - 4, 6, 8, P.chiefFur[1]); dd.R(tx + (dir === 'up' ? 4 : -4), top + bh - 2, 6, 8, P.chiefFur[1]); dd.R(tx + (dir === 'up' ? 7 : -5), top + bh + 2, 4, 6, P.chiefFur[1]); dd.px(tx + (dir === 'up' ? 8 : -5), top + bh + 2, P.chiefFur[0]);
    };
    S.weapon = (dd, dir, hx, hy, pose) => {
      if (dir === 'right') { for (let i = 0; i < 3; i++) dd.R(hx + 2, hy - 3 + i * 3, 6, 2, P.bone[1]); dd.px(hx + 8, hy - 3, P.bone[0]); return; }
      const dy = pose === 2 ? 2 : 0; for (let i = -3; i <= 3; i += 3) dd.R(hx + i, hy + 2 + dy, 2, 5 - Math.abs(i) / 3, P.bone[1]);
    };
    S.front = (dd, dir, cx, top, bw, bh, headCy, G, f, pose) => { if (dir === 'down') { const hx = cx - Math.floor(bw / 2) - G.armW + 3; const hy = pose !== 0 ? top - 4 : top + 1 + G.armL; for (let i = -3; i <= 3; i += 3) dd.R(hx + i, hy + 2, 2, 5 - Math.abs(i) / 3, P.bone[1]); } };
    biped(d, dir, f, pose, CHIEF_G, S);
  }));

  // 세이렌 여왕 네레아: 2배 세이렌 + 산호 왕관 + 진주 목걸이 + 삼지창
  MonsterSprites.register('boss_siren_queen', () => makeSheet(80, 80, { x: 40, y: 76 }, (d, dir, f, pose) => {
    sirenDraw(d, dir, f, pose, {
      cx: 38, footY: 76, s: 2, hair: P.purple, skin: P.sirenSkin, tail: P.teal, fin: P.fin, eye: P.eyeV, top: P.pearl,
      crown: (dd, dir, hcx, hy, hr) => {
        const by = hy - hr[1] + 1, w = dir === 'right' ? 14 : 20;
        dd.R(hcx - Math.floor(w / 2), by, w, 4, P.coral[1]); dd.R(hcx - Math.floor(w / 2), by + 3, w, 1, P.coral[2]);
        for (let i = 0; i < 5; i++) { const x = hcx - Math.floor(w / 2) + Math.round(i * (w - 3) / 4); const h = i % 2 === 0 ? 6 : 4; dd.R(x, by - h, 3, h, P.coral[1]); dd.R(x, by - h, 1, h, P.coral[0]); dd.px(x + 1, by - h - 1, P.coral[1]); dd.px(x + 2, by - 2, P.coral[2]); }
        dd.ball(hcx, by + 1, 2, 2, P.pearl);
        if (dir !== 'up') for (let i = -8; i <= 8; i += 4) dd.ball(hcx + i, hy + hr[1] + 8 + (i === 0 ? 2 : Math.abs(i) === 4 ? 1 : 0), 1, 1, P.pearl);
      },
      weapon: (dd, dir, hx, hy, pose) => {
        const L = 26; const tx = dir === 'right' ? hx + 2 : hx + 3;
        const top = hy - L + (pose === 1 ? -4 : pose === 2 ? 6 : 0);
        dd.R(tx, top + 6, 2, L, P.gold[1]); dd.R(tx + 1, top + 6, 1, L, P.gold[2]);
        dd.R(tx - 3, top + 2, 8, 2, P.gold[1]); dd.R(tx - 3, top - 2, 2, 5, P.gold[1]); dd.R(tx, top - 3, 2, 6, P.gold[1]); dd.R(tx + 3, top - 2, 2, 5, P.gold[1]);
        dd.px(tx - 3, top - 2, P.gold[0]); dd.px(tx, top - 3, P.gold[0]); dd.px(tx + 3, top - 2, P.gold[0]); dd.R(tx + 1, top + 3, 1, 1, P.gold[2]);
        if (pose === 2) { dd.px(tx - 5, top - 1, P.fin[0]); dd.px(tx + 6, top - 3, P.fin[0]); dd.px(tx + 1, top - 6, P.fin[0]); }
      },
    });
  }));

  // 트롤 족장 모르그: 거대 트롤 + 뼈 갑옷 + 해골 달린 대형 몽둥이 + 붉은 모히칸
  const MORG_G = { cx: 40, footY: 76, legH: 15, legW: 11, legGap: 6, bw: 38, bh: 25, hr: [18, 15], headOver: 8, armW: 9, armL: 22 };
  MonsterSprites.register('boss_troll_chief', () => makeSheet(80, 80, { x: 40, y: 76 }, (d, dir, f, pose) => {
    const S = { skin: P.trollSkin, cloth: P.trollSkin, legs: P.trollSkin, feet: P.trollSkin };
    S.face = (dd, cx, cy, hr) => {
      const ey = cy - 4;
      dd.R(cx - 13, ey - 3, 8, 3, P.trollSkin[2]); dd.R(cx + 6, ey - 3, 8, 3, P.trollSkin[2]);
      dd.eye(cx - 12, ey, 6, 5, P.eyeY, P.pupil, 3, 3); dd.eye(cx + 7, ey, 6, 5, P.eyeY, P.pupil, 3, 3);
      dd.E(cx, ey + 7, 5, 3, P.trollSkin[1]); dd.E(cx - 2, ey + 6, 3, 2, P.trollSkin[0]); dd.R(cx + 3, ey + 9, 2, 1, P.trollSkin[2]);
      dd.R(cx - 10, cy + 8, 21, 2, O); dd.R(cx - 10, cy + 3, 3, 7, P.teeth); dd.R(cx + 8, cy + 3, 3, 7, P.teeth); dd.px(cx - 10, cy + 3, WHITE); dd.px(cx + 8, cy + 3, WHITE); dd.R(cx - 6, cy + 10, 13, 2, P.teeth);
      dd.R(cx - 6, cy - 10, 1, 5, '#b04a4a'); dd.R(cx - 7, cy - 6, 1, 3, '#b04a4a'); // 흉터
      dd.R(cx - 14, ey + 4, 4, 2, P.warpaint[1]); dd.R(cx + 11, ey + 4, 4, 2, P.warpaint[1]);
    };
    S.faceSide = (dd, cx, cy, hr) => { dd.R(cx + 4, cy - 7, 8, 3, P.trollSkin[2]); dd.eye(cx + 5, cy - 4, 6, 5, P.eyeY, P.pupil, 3, 3); dd.E(cx + hr[0] + 1, cy + 3, 5, 3, P.trollSkin[1]); dd.px(cx + hr[0], cy + 2, P.trollSkin[0]); dd.R(cx + 4, cy + 8, 13, 2, O); dd.R(cx + 13, cy + 3, 3, 7, P.teeth); dd.px(cx + 13, cy + 3, WHITE); };
    S.hat = (dd, dir, cx, cy, hr) => { mohawk(dd, dir, cx, cy - hr[1] + 2, P.redHair, 12, 8); pointyEars(dd, dir, cx, cy, hr, P.trollSkin, 9); dd.R(cx - hr[0] - 6, cy, 2, 2, P.gold[1]); if (dir !== 'right') dd.R(cx + hr[0] + 4, cy, 2, 2, P.gold[1]); };
    S.bodyDecor = (dd, dir, cx, top, bw, bh) => {
      if (dir !== 'up') { dd.E(cx, top + 11, 10, 7, P.trollSkin[0]); dd.E(cx, top + 12, 9, 6, P.trollSkin[1]); dd.R(cx - 3, top + 11, 7, 1, P.trollSkin[2]); dd.R(cx - 3, top + 14, 7, 1, P.trollSkin[2]); }
      else for (let i = 0; i < 6; i++) dd.R(cx - 2, top + 1 + i * 3, 4, 2, P.trollSkin[2]);
      // 뼈 흉갑(갈비뼈 줄 3개) + 양 어깨 해골
      for (let i = 0; i < 3; i++) { dd.R(cx - 12, top + 3 + i * 3, 24, 2, P.bone[1]); dd.R(cx - 12, top + 4 + i * 3, 24, 1, P.bone[2]); dd.R(cx - 12, top + 3 + i * 3, 3, 1, P.bone[0]); }
      dd.R(cx - 1, top + 2, 3, 10, P.bone[1]);
      for (const sx of (dir === 'right' ? [cx - 3] : [cx - Math.floor(bw / 2) - 1, cx + Math.floor(bw / 2) + 1])) { dd.ball(sx, top + 1, 6, 5, P.bone); dd.R(sx - 3, top, 2, 2, O); dd.R(sx + 1, top, 2, 2, O); dd.R(sx - 1, top + 3, 3, 1, P.bone[2]); }
      dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 5, bw - 2, 3, P.leather[1]); dd.R(cx - Math.floor(bw / 2) + 1, top + bh - 3, bw - 2, 1, P.leather[2]); dd.R(cx - 2, top + bh - 5, 4, 3, P.gold[1]);
    };
    S.legDecor = (dd, lx, rx, legTop, footY, G) => { dd.R(lx, legTop, G.legW, 5, P.leather[1]); dd.R(rx, legTop, G.legW, 5, P.leather[1]); dd.R(lx, legTop + 4, G.legW, 1, P.leather[2]); dd.R(rx, legTop + 4, G.legW, 1, P.leather[2]); dd.R(lx + 1, legTop + 1, 2, 2, P.bone[1]); dd.R(rx + 1, legTop + 1, 2, 2, P.bone[1]); };
    S.weapon = (dd, dir, hx, hy, pose) => {
      club(dd, dir, hx, hy, pose, 24, 6, true);
      // 몽둥이 끝에 해골
      if (dir === 'right') { dd.ball(hx + 24, hy - 1, 3, 3, P.bone); dd.px(hx + 23, hy - 1, O); dd.px(hx + 25, hy - 1, O); }
      else if (pose === 1) { dd.ball(hx + 3, hy - 24, 3, 3, P.bone); dd.px(hx + 2, hy - 24, O); dd.px(hx + 4, hy - 24, O); }
      else if (pose === 2) { dd.ball(hx - 24, hy + 2, 3, 3, P.bone); dd.px(hx - 25, hy + 2, O); dd.px(hx - 23, hy + 2, O); }
      else { dd.ball(hx + 3, hy + 22, 3, 3, P.bone); dd.px(hx + 2, hy + 22, O); dd.px(hx + 4, hy + 22, O); }
    };
    biped(d, dir, f, pose, MORG_G, S);
  }));
})();
