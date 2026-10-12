// 캐릭터 스프라이트 — 16x18 도트 캐릭터를 방향/프레임별로 조립한다.
// 공통 도트맵(머리·몸·다리)에 팔레트만 바꿔 여러 NPC를 만든다.
const Sprites = (() => {
  // 팔레트 문자: o 외곽선, h/H 머리카락(밝/어둠), s/S 피부(밝/그늘), e 눈, m 입,
  // g/G 옷(밝/어둠), c/C 망토·조끼(밝/어둠), b 신발, l/L 머리장식(나뭇가지/잎), t 지팡이, T 보석
  const PLAYER_PAL = {
    o: '#3a2a30', h: '#a4e4a2', H: '#5fb86f', s: '#fbe0c6', S: '#e4b494', e: '#2b5fa8', m: '#d9777f',
    g: '#5c9a45', G: '#3d6e2e', c: '#b07a44', C: '#7d4f2b', b: '#5b3b26', l: '#7b4f2b', L: '#4fc06a',
    t: '#8a5a30', T: '#8fe8ff'
  };

  // ---------- 아래(정면) ----------
  const HEAD_DOWN = [
    '......oooo......',
    '.....ohhhho.....',
    '....ohhhhhho....',
    '...ohlLlLlLho...',
    '...ohhhhhhhho...',
    '...ohhsssshho...',
    '...ohsessesho...',
    '...ohsessesho...',
    '....oSsmmsSo....',
  ];
  const BODY_DOWN = [
    '.....occcco.....',
    '....ocggggco....',
    '....ocggggco....',
    '....oSggggSo....',
    '....oGGGGGGo....',
    '.....oGGGGo.....',
  ];
  // ---------- 위(뒷모습) ----------
  const HEAD_UP = [
    '......oooo......',
    '.....ohhhho.....',
    '....ohhhhhho....',
    '...ohlLlLlLho...',
    '...ohhhhhhhho...',
    '...ohhhHHhhho...',
    '...ohHhhhhHho...',
    '...ohHhhhhHho...',
    '....oHhhhhHo....',
  ];
  const BODY_UP = [
    '.....occcco.....',
    '....occcccco....',
    '....oCccccCo....',
    '....oCccccCo....',
    '....oGGGGGGo....',
    '.....oGGGGo.....',
  ];
  // ---------- 오른쪽(옆모습) ----------
  const HEAD_RIGHT = [
    '......oooo......',
    '.....ohhhho.....',
    '....ohhhhhho....',
    '...ohlLlLlhho...',
    '...ohhhhhhhho...',
    '...oHhhhsssso...',
    '...oHhhhsseso...',
    '...oHhhhsssso...',
    '....oHhSssSo....',
  ];
  const BODY_RIGHT = [
    '.....occggo.....',
    '....oCccgggo....',
    '....oCccgggo....',
    '....oCccggSo....',
    '....oGGGGGGo....',
    '.....oGGGGo.....',
  ];
  // ---------- 다리 ----------
  const LEGS_STAND = [
    '.....ob..bo.....',
    '.....ob..bo.....',
    '.....oo..oo.....',
  ];
  const LEGS_LIFT_R = [ // 오른 다리 들기
    '.....ob..bo.....',
    '.....ob..oo.....',
    '.....oo.........',
  ];
  const LEGS_LIFT_L = [
    '.....ob..bo.....',
    '.....oo..bo.....',
    '.........oo.....',
  ];
  const LEGS_SIDE_STRIDE = [
    '.....ob..bo.....',
    '....ob....bo....',
    '....oo....oo....',
  ];
  const LEGS_SIDE_PASS = [
    '.....ob..bo.....',
    '......obbo......',
    '......oooo......',
  ];

  // 지팡이 (3 x 20)
  const STAFF = [
    '.T.',
    'TTT',
    '.T.',
    '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.', '.t.',
  ];

  // 프레임 캔버스 규격: 18 x 22, 몸은 (1,2)부터. 발 기준점(anchor) = (9, 20)
  const FW = 18, FH = 22, BX = 1, BY = 2;
  const ANCHOR = { x: 9, y: 20 };

  function frame(head, body, legs, pal, opts) {
    const rows = head.concat(body, legs);
    const c = Pixel.make(FW, FH);
    const bob = opts.bob || 0;
    if (opts.staff && opts.staffBehind) Pixel.fromRows(STAFF, pal, { canvas: c, x: opts.staffX, y: 0 + bob });
    Pixel.fromRows(rows, pal, { canvas: c, x: BX, y: BY + bob });
    if (opts.staff && !opts.staffBehind) Pixel.fromRows(STAFF, pal, { canvas: c, x: opts.staffX, y: 0 + bob });
    return c;
  }

  // 방향별 4프레임 (idle, step1, idle, step2)
  function buildCharacter(palette, opts = {}) {
    const pal = Object.assign({}, PLAYER_PAL, palette || {});
    if (opts.crown === false) { pal.l = pal.h; pal.L = pal.h; }
    const staff = !!opts.staff;
    const down = [
      frame(HEAD_DOWN, BODY_DOWN, LEGS_STAND, pal, { staff, staffX: 14 }),
      frame(HEAD_DOWN, BODY_DOWN, LEGS_LIFT_R, pal, { staff, staffX: 14, bob: -1 }),
      frame(HEAD_DOWN, BODY_DOWN, LEGS_STAND, pal, { staff, staffX: 14 }),
      frame(HEAD_DOWN, BODY_DOWN, LEGS_LIFT_L, pal, { staff, staffX: 14, bob: -1 }),
    ];
    const up = [
      frame(HEAD_UP, BODY_UP, LEGS_STAND, pal, { staff, staffX: 1, staffBehind: true }),
      frame(HEAD_UP, BODY_UP, LEGS_LIFT_L, pal, { staff, staffX: 1, staffBehind: true, bob: -1 }),
      frame(HEAD_UP, BODY_UP, LEGS_STAND, pal, { staff, staffX: 1, staffBehind: true }),
      frame(HEAD_UP, BODY_UP, LEGS_LIFT_R, pal, { staff, staffX: 1, staffBehind: true, bob: -1 }),
    ];
    const right = [
      frame(HEAD_RIGHT, BODY_RIGHT, LEGS_STAND, pal, { staff, staffX: 14 }),
      frame(HEAD_RIGHT, BODY_RIGHT, LEGS_SIDE_STRIDE, pal, { staff, staffX: 14, bob: -1 }),
      frame(HEAD_RIGHT, BODY_RIGHT, LEGS_SIDE_PASS, pal, { staff, staffX: 14 }),
      frame(HEAD_RIGHT, BODY_RIGHT, LEGS_SIDE_STRIDE, pal, { staff, staffX: 14, bob: -1 }),
    ];
    const left = right.map(Pixel.flipH);
    return { down, up, right, left, anchor: ANCHOR, w: FW, h: FH };
  }

  // ---------- NPC 팔레트 ----------
  const NPC_PALETTES = {
    villagerA: { h: '#7a4b2a', H: '#55321c', g: '#5a7fc2', G: '#3a5a92', c: '#d8c9a6', C: '#a99574' },
    villagerB: { h: '#f0c25a', H: '#c6962f', g: '#d96a6a', G: '#a84646', c: '#f3e6d0', C: '#c9b89a' },
    villagerC: { h: '#3b2a2a', H: '#241818', g: '#8f6ac2', G: '#654792', c: '#e7d4b8', C: '#b59c7a' },
    villagerD: { h: '#d9823b', H: '#a85c22', g: '#6fb07a', G: '#478253', c: '#e9dcc4', C: '#b9a984' },
    villagerE: { h: '#8d6e63', H: '#5f4a42', g: '#e5b85a', G: '#b58a2e', c: '#c9d8e6', C: '#93a7b8' },
    child: { h: '#c74a3b', H: '#8e3327', g: '#f4f1e6', G: '#c9c3b0', c: '#8fd0e8', C: '#5aa0bd' },
    knight: { h: '#c3ccd6', H: '#8d99a6', l: '#c3ccd6', L: '#d94a4a', g: '#6b7fa6', G: '#4a5c80', c: '#9aa6b5', C: '#6d7886' },
    priest: { h: '#f2f2f2', H: '#c8c8c8', g: '#f6f1e8', G: '#d4c9b8', c: '#e3c26b', C: '#b8993f' },
    smith: { h: '#5a3d2b', H: '#3b271a', g: '#7b4b2a', G: '#5a3419', c: '#5c5c5c', C: '#3c3c3c' },
    merchant: { h: '#2f2f2f', H: '#1a1a1a', g: '#f1e9d6', G: '#c7bca3', c: '#b8503f', C: '#86392d' },
  };

  const cache = {};
  function get(kind) {
    if (cache[kind]) return cache[kind];
    let s;
    if (kind === 'player') s = buildCharacter({}, { staff: true });
    else s = buildCharacter(NPC_PALETTES[kind] || {}, { crown: kind === 'knight', staff: false });
    cache[kind] = s;
    return s;
  }

  return { get, buildCharacter, NPC_PALETTES, PLAYER_PAL };
})();
if (typeof module !== 'undefined') module.exports = Sprites;
