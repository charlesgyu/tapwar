// 캐릭터 스프라이트 — 32x40 프레임, 몸 약 22x34 의 고급 도트 캐릭터를 방향/프레임별로 조립한다.
// 레퍼런스(숲의 드루이드 소녀)에 맞춘 비율: 머리가 전체 높이의 ~47%, 큰 눈(3x3 홍채 2톤 + 흰 하이라이트 + 속눈썹선),
// 나뭇가지+잎 묶음 화관, 어깨를 덮는 갈색 망토(걷기 때 밑단이 흔들림), 벨트 달린 초록 튜닉(잎 무늬), 부츠, 보석 달린 나무 지팡이.
// 레이어: 다리 → 튜닉 → (로브) → 망토 → 앞치마 → 팔 → 머리 → 머리모양/수염/화관/모자 → (지팡이).
// NPC 는 같은 도트맵에 팔레트와 덧그림(짧은/긴 머리·투구·밀짚모자·두건·머리띠·앞치마·수염·로브)만 바꿔 만든다.
// pixel.js 는 건드리지 않고, 필요한 헬퍼(지우기 지원 blit, 좌우 반전, 행/열 삭제, 대각선 밀기)는 여기 둔다.
const Sprites = (() => {
  // ---------- 팔레트 문자 ----------
  // o 외곽선(따뜻한 갈색) / y h H D 머리카락(하이라이트·밝음·중간·어둠) / s S 피부(밝음·그늘) x 홍조
  // k 속눈썹선, f e E 홍채(밝음·기본·어둠), W 흰 하이라이트, m 입(어두운 살색)
  // g G d 튜닉(밝음·중간·어둠), n 금색 장식선 / c C K 망토(밝음·중간·어둠)
  // b 벨트, B 버클 / u U 부츠(밝음·어둠) / l 나뭇가지, L v 잎(밝음·어둠)
  // p P 지팡이 나무(밝음·어둠), j J i 보석(밝음·어둠·반짝) / a A 앞치마(밝음·어둠)
  // 1 2 3 금속(밝음·중간·어둠), r 깃털·머리띠(빨강) / T t 밀짚(밝음·어둠) / z Z 두건(밝음·어둠) / # 지우기(투명으로)
  const PLAYER_PAL = {
    o: '#3b2a2a',
    y: '#c6eeb0', h: '#a3dc92', H: '#6fbd78', D: '#3f8a56',
    s: '#f6cfa6', S: '#d9a37a', x: '#f0a69a',
    k: '#2e2230', f: '#58c9b0', e: '#3fae96', E: '#1f6e60', W: '#ffffff', m: '#c0674e',
    g: '#86bd5a', G: '#5a8f3e', d: '#39622c', n: '#d6bb5c',
    c: '#b8834d', C: '#8c5c33', K: '#5f3c21',
    b: '#6b4423', B: '#e2bb55',
    u: '#9a6540', U: '#5f3d25',
    l: '#7a4a28', L: '#9ae56b', v: '#4fa848',
    p: '#a3703e', P: '#6b4527', j: '#a8ecff', J: '#4fb4e8', i: '#ffffff',
    a: '#d9c9a6', A: '#a99272',
    '1': '#e3e9ee', '2': '#aab6c2', '3': '#6f7c8a', r: '#d94a4a',
    T: '#e9c978', t: '#b58d3a', z: '#6f8fc0', Z: '#4a6a9a',
  };

  // 직업 전용 문자 기본값 — PLAYER_PAL 에 섞지 않아 기존 kind 팔레트는 그대로
  const JOB_PAL = {
    w: '#c08a52', q: '#7d5530', I: '#f4ecd8', V: '#9ff0ff', X: '#3fb6e0', R: '#8a2a2a',
  };

  // ======================================================================
  // 정면 (down)  — 몸 도트맵은 모두 22 열 기준. 머리 16행, 몸통 12행, 다리 6행(+예비 1행)
  // ======================================================================
  const HEAD_DOWN = [
    '.......oooooooo.......', // 0
    '.....ooyyyyyhhoo......', // 1 파스텔 톱 밴드(왼쪽 60%)
    '....oyyyyyyyhhhho.....', // 2
    '...ohyyyyyhhhhhhhhho..', // 3
    '..ohhyyhhhhhhhhhhhHo..', // 4 쐐기 꼬리
    '..ohhhhhhhhhhhhhhHHo..', // 5
    '..ohhhhhhhhhhhhhhHHo..', // 6
    '..ohhhhhhhhhhhhhhHHo..', // 7
    '..ohhhHhhHhhHhhHhHHo..', // 8 앞머리 가닥 선
    '..ohHsHssDssDssHsHHo..', // 9 이마(톱니는 눈 사이 col 9/12 만 D, 눈 위는 H → 눈썹처럼 안 보이게)
    '..ohHskkksssskkksDHo..', // 10 속눈썹선(3px, 1행)
    '..oHhsWffssssWffsHDo..', // 11 홍채 1행: 흰 하이라이트 + 밝은 청록
    '.ohHhsEeessssEeesHDHo.', // 12 옆머리가 바깥으로 퍼짐(단발), 가닥 선 H
    '.ohHhsEEessssEEesHDHo.', // 13 홍채 아래 어두운 2톤
    '..oHHxsssmssmsssxDHo..', // 14 홍조 + 미소 양끝
    '...ooooSSsmmsSSoooo...', // 15 턱 + 미소 가운데
  ];
  // 화관(정면/뒷면 공용): 행 2~6 에 덧그림. 양끝 가지 끝이 머리 위로 솟고, 잎은 2x2 묶음, 가지는 2행 꼬임
  const CROWN_DOWN = [
    '..o.......L........o..', // 2 잎 하나가 가지 위로
    '.olo.LL...LL...LL.olo.', // 3 잎 묶음 윗줄
    '.ollKLvKllLvKKlLvlKKo.', // 4 가지(l/K 꼬임) + 잎 묶음 아랫줄
    '..oKKllKKllKKllKKllo..', // 5 두 번째 가지(엇갈림)
    '..oHHHHHHHHHHHHHHHHo..', // 6 화관 그림자(머리카락 어두운 띠)
  ];
  // 튜닉(정면): 망토 아래까지 전부 그려 두고 망토를 덧그린다 (망토 없는 NPC 도 쓸 수 있게)
  const TUNIC_DOWN = [
    '......ogggggGGGo......', // 16 깃
    '....oggggnggngGGGGo...', // 17 금 V 네크 시작
    '...oGgggnggggnggGGGdo.', // 18
    '...oGgggnggggnggGGGdo.', // 19
    '...oGGGgnggggnGGGGdo..', // 20
    '....oGGGGnggnGGGddo...', // 21 가운데 밝은 판 + 금 솔기
    '....oGGGGnggnGGGddo...', // 22
    '....obbbbbBBbbbbbbo...', // 23 벨트 + 버클
    '....oGgGGnggnGGGddo...', // 24 잎 무늬(마름모) 시작
    '...oGgGgGnggnGgGdddo..', // 25 치마 퍼짐
    '...oGGgGGnggnGGgdddo..', // 26
    '...onnnnnnnnnnnnnnno..', // 27 금색 단
  ];
  // 망토(정면): 행 16~20, 가운데 트임으로 튜닉 V 가 보인다
  const CAPE_DOWN = [
    '.....occcccccccco.....', // 16
    '...occcccc..ccccCCo...', // 17
    '..oCccccc....ccccCCKo.', // 18
    '..oKCccc......ccCKKKo.', // 19
    '...oKKKK......KKKKKo..', // 20 망토 자락(어두운 단)
  ];
  // 걷기 때 망토 자락 흔들림: 행 19~20 의 한쪽 절반을 1px 아래로(끝 1px 은 밝은 톤)
  const CAPE_HEM_DOWN_L = [
    '..oKCccc..............',
    '...oKKKc..............',
  ];
  const CAPE_HEM_DOWN_R = [
    '..............ccCKKKo.',
    '..............cKKKKo..',
  ];
  // 다리: 7행(마지막 행은 걷기 때 디딤 다리를 1px 늘리는 용도)
  const LEGS_DOWN_STAND = [
    '......ouuuoouuuo......', // 28 부츠 커프
    '......ouUUoouUUo......', // 29
    '......ouUUoouUUo......', // 30
    '......oUUUooUUUo......', // 31
    '......oUUUooUUUo......', // 32
    '......oooo..oooo......', // 33
    '......................', // 34
  ];
  const LEGS_DOWN_WALK_A = [ // 왼발(화면 왼쪽) 들기, 오른발 디딤
    '......ouuuoouuuo......',
    '......ouUUoouUUo......',
    '......ouUUoouUUo......',
    '......oooo.oUUUo......',
    '...........oUUUo......',
    '...........oUUUo......',
    '...........ooooo......',
  ];
  // 신관 로브(발목까지): 다리 대신 행 27~33, 걷기 프레임에서만 디딤발 끝 2px 노출
  const ROBE_DOWN = [
    '...oGGGGGnggnGGGdddo..', // 27 (튜닉 금단을 덮어 이어 그린다)
    '...oGGGGGnggnGGGdddo..',
    '...oGGGGGnggnGGGdddo..',
    '...oGGGGGnggnGGGdddo..',
    '...oGGGGGnggnGGGdddo..',
    '...onnnnnnnnnnnnnnno..', // 32 금 단
    '....oooooooooooooo....', // 33
  ];
  const ROBE_UP = [
    '...oGGGGGGGGGGGGdddo..',
    '...oGGGGGGGGGGGGdddo..',
    '...oGGGGGGGGGGGGdddo..',
    '...oGGGGGGGGGGGGdddo..',
    '...oGGGGGGGGGGGGdddo..',
    '...onnnnnnnnnnnnnnno..',
    '....oooooooooooooo....',
  ];
  const FOOT_TIP_L = ['......oUUo............']; // 행 34
  const FOOT_TIP_R = ['............oUUo......'];
  // 팔(3열): 소매 + 손. 정면·뒷면 공용
  const ARM_FRONT = [
    'ogo',
    'oGo',
    'odo',
    'oso',
    'oSo',
    '.o.',
  ];
  // 지팡이를 쥔 팔(정면): 바깥으로 뻗어 지팡이를 잡는다 (6열, 몸 0열부터)
  const ARM_STAFF_DOWN = [
    '..ogo.',
    '..oGo.',
    '.oGGo.',
    'oGGo..',
    'osso..',
    'oSSo..',
    '.oo...',
  ];

  // ======================================================================
  // 뒷면 (up)
  // ======================================================================
  const HEAD_UP = [
    '.......oooooooo.......', // 0
    '.....ooyyyyyhhoo......', // 1
    '....oyyyyyyyhhhho.....', // 2
    '...ohyyyyyhhhhhhhhho..', // 3
    '..ohhyyhhhhhhhhhhhHo..', // 4
    '..ohhhhhhhhhhhhhhHHo..', // 5
    '..ohhhhhhhhhhhhhhHHo..', // 6
    '..ohhhhhhhhhhhhhhHHo..', // 7
    '..ohhhhHhhhhhHhhHHHo..', // 8
    '..ohhhhHhhhhhHhhHHHo..', // 9
    '..ohHhhHhhhhhHhHHHHo..', // 10
    '..ohHhhhhhhhhhHHHHDo..', // 11
    '..oHHhhhhhhhhHHHHHDo..', // 12
    '..oHHHhhhhhhHHHHHDDo..', // 13
    '...oHDHHHDHHHDHHDDo...', // 14 머리카락 가닥 끝(어두운 선)
    '....oooDoooDoooDoo....', // 15
  ];
  const TUNIC_UP = [
    '......ogggggGGGo......', // 16
    '....ogggggGGGGGGGo....', // 17
    '...oGggggGGGGGGGGGdo..', // 18
    '...oGggggGGGGGGGGGdo..', // 19
    '...oGggggGGGGGGGGGdo..', // 20
    '....oGGGGGGGGGGGGdo...', // 21
    '....oGGGGGGGGGGGGdo...', // 22
    '....oGGGGGGGGGGGGdo...', // 23
    '....oGGgGGGGGgGGGdo...', // 24 잎 무늬
    '...oGGGGGGgGGGGGdddo..', // 25
    '...oGgGGGGGGGGgGdddo..', // 26
    '...onnnnnnnnnnnnnnno..', // 27
  ];
  // 망토(뒷면): 둥근 어깨(밝은 톤) + 곡선 단 2줄 + 어두운 밑단
  const CAPE_UP = [
    '.....occcccccccco.....', // 16 어깨 꼭대기(밝음)
    '...occccccccccccccCo..', // 17
    '..occccccccccccccCCKo.', // 18
    '..oCcccCCccccCCcCCKKo.', // 19 곡선 단 1(양끝)
    '..oCCccccCCCCcccCCKKo.', // 20 곡선 단 1(처진 가운데)
    '...oKKCCCCCCCCCCCKKo..', // 21 곡선 단 2(양끝)
    '....oKKKKKKKKKKKKKo...', // 22 어두운 밑단
  ];
  const CAPE_HEM_UP_L = [
    '...oKKCCCCC...........',
    '....oKKKKKKc..........',
  ];
  const CAPE_HEM_UP_R = [
    '...........CCCCCCKKo..',
    '...........cKKKKKKo...',
  ];
  const ARM_BACK = [
    'oCo',
    'oKo',
    'oGo',
    'odo',
    'oso',
    'oSo',
    '.o.',
  ];
  const ARM_BACK_NOCAPE = [
    'oGo',
    'oGo',
    'oGo',
    'odo',
    'oso',
    'oSo',
    '.o.',
  ];

  // ======================================================================
  // 옆면 (right)  — left 는 좌우 반전. 얼굴 폭 6px, 코 돌기, 눈 3x3, 입/홍조 분리
  // ======================================================================
  const HEAD_RIGHT = [
    '......ooooooooo.......', // 0
    '....oohyyyyyhhhoo.....', // 1
    '....ohyyyyyyhhhhho....', // 2
    '...ohyyyyyhhhhhhhho...', // 3
    '..ohhyyhhhhhhhhhhhho..', // 4
    '..ohhhhhhhhhhhhhhhHo..', // 5
    '..ohhhhhhhhhhhhhhhHo..', // 6
    '..ohhhhhhhhhhhhhhhHo..', // 7
    '..ohhhhhhhhhhHsssssso.', // 8 이마 드러남
    '..ohHhhhhhHhHssssssso.', // 9 앞머리가 대각선으로 + 뒤통수 가닥(눈 위 열은 h 유지)
    '..ohHhhHhhHhHskkkssso.', // 10 속눈썹선
    '..ohHhhHhhhhHsWffssso.', // 11 눈
    '..ohHhhHhhhhHsEeesssso', // 12 코 돌기(외곽선 1px 바깥)
    '..oHDhhhhhhhHsEEersSo.', // 13 홍조(r 자리는 x) — 아래에서 치환
    '...oDHhhhhhhHSsssssmo.', // 14 입(얼굴 가장자리)
    '....oDDHhhhoooSSSSoo..', // 15 턱 + 뒤 머리 가닥
  ].map((r, i) => (i === 13 ? r.replace('r', 'x') : r));
  const CROWN_RIGHT = CROWN_DOWN;
  const TUNIC_RIGHT = [
    '......ogggggggo.......', // 16 깃
    '.....oGgggggggggggo...', // 17
    '....oGGggggggggggggo..', // 18
    '....oGGgggggggnggggo..', // 19
    '....oGGggggggggggGo...', // 20
    '....oGGggggggggggGo...', // 21
    '....oGGggggggggggGo...', // 22
    '....obbbbbbbbbBbbbo...', // 23 벨트
    '.....oGGGGGgggggddo...', // 24
    '......oGGGGgggggddo...', // 25
    '.......oGGGgggggddo...', // 26
    '.......onnnnnnnnnno...', // 27
  ];
  // 망토(옆면): 등 뒤로 좁아지며 늘어짐
  const CAPE_RIGHT = [
    '......occccccco.......', // 16
    '.....occcccccccc......', // 17
    '....oCcccccccccc......', // 18
    '....oKCcccccccK.......', // 19
    '....oKCccccKo.........', // 20
    '....oKCcccKo..........', // 21
    '....oKCccKo...........', // 22
    '....oKCcKo............', // 23
    '.....oKKo.............', // 24
    '......oo..............', // 25
  ];
  // 걷기 때 뒤로 날리는 망토 자락(옆면): 행 19~23, 몸 0열부터
  const CAPE_FLY_RIGHT = [
    '...oo.',
    '..oCCo',
    '.oKCCo',
    '.oKKo.',
    '..oo..',
  ];
  const ROBE_RIGHT = [
    '.......oGGGgggggddo...', // 27
    '.......oGGGgggggddo...',
    '.......oGGGgggggddo...',
    '.......oGGGgggggddo...',
    '.......oGGGgggggddo...',
    '.......onnnnnnnnnno...', // 32
    '........oooooooooo....', // 33
  ];
  const LEGS_RIGHT_STAND = [
    '........ouuuuuo.......',
    '........ouUUUUo.......',
    '........ouUUUUo.......',
    '........oUUUUUUo......',
    '........oUUUUUUo......',
    '........oooooooo......',
    '......................',
  ];
  const LEGS_RIGHT_WALK_A = [ // 앞다리 디딤, 뒷다리 들림
    '........ouuuuuo.......',
    '.......ouUUouUUo......',
    '......oUUUo.oUUUo.....',
    '.....oUUUo..oUUUUo....',
    '.....ooooo..oUUUUo....',
    '............oUUUUo....',
    '............oooooo....',
  ];
  const LEGS_RIGHT_WALK_B = [ // 뒷다리 디딤, 앞다리 들림
    '........ouuuuuo.......',
    '.......ouUUouUUo......',
    '......oUUUo.oUUUo.....',
    '.....oUUUUo..oUUUo....',
    '.....oUUUUo..ooooo....',
    '.....oUUUUo...........',
    '.....oooooo...........',
  ];
  // 옆면 팔(앞쪽 팔만 보임, 4열)
  const ARM_SIDE = [
    '.ogo',
    '.oGo',
    '.odo',
    '.oso',
    '.oSo',
    '..o.',
  ];
  // 옆면: 앞으로 뻗어 기울어진 지팡이 자루를 벨트 높이에서 쥔 팔(12열, 몸 14열부터)
  const ARM_SIDE_STAFF = [
    '.ogo........',
    '..oGGo......',
    '...oGGGo....',
    '.....oGsso..',
    '......oSSo..',
    '.......oo...',
  ];

  // ======================================================================
  // 지팡이 (8열 x 35행): 다면체 크리스탈 보석(반짝 2개) → 갈래 가지 → 나무 자루(p/P 2톤) + 잎 묶음
  // ======================================================================
  const STAFF = [
    '....o...',
    '...ojoi.',
    '..ojjJo.',
    '..ojJJo.',
    '..oJJJo.',
    '.i.oJo..',
    '.lopPPol',
    '..opPo..',
    '..opPo..',
    '.LopPo..',
    'vLopPoL.',
    '..opPoLv',
    'LLopPo..',
    'LvopPo..',
    '..oPPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPoLL',
    '..opPoLv',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..oPPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..opPo..',
    '..oPPo..',
    '..oooo..',
  ];

  // ======================================================================
  // 덧그림(오버레이)
  // ======================================================================
  // 짧은 머리: 얼굴 옆으로 내려오는 머리 가닥을 지우고 얼굴 외곽선을 복구 (정면 왼쪽, 행 10~15, 몸 1열부터 4열)
  const SHORT_L = [
    '.#oo',
    '.##o',
    '###o',
    '###o',
    '.##o',
    '.##.',
  ];
  const SHORT_UP = [ // 뒷면: 아래쪽 머리를 짧게 + 목(피부)로 몸과 잇는다 (행 12~15, 22열)
    '..oHHhhhhhhhhhHHHHDo..',
    '...oHHHDHHHDHHHDHDo...',
    '...#oooSSSSSSSSooo#...',
    '....###oSSSSSSo###....',
  ];
  const SHORT_SIDE = [ // 옆면: 뒤통수 아래 가닥을 짧게 (행 12~15, 22열)
    '..ohHhhHhhhhHsEeesssso',
    '..oHDhhhhhhhHsEEexsSo.',
    '...ooooooHhhHSsssssmo.',
    '....#####oooooSSSSoo..',
  ];
  // 긴 머리: 어깨 위까지 3행 더 내려온다
  const LONG_DOWN = [ // 행 16~18
    '..ohHo..........oHDo..',
    '..ohHo..........oHDo..',
    '...ooo...........ooo..',
  ];
  const LONG_UP = [ // 행 14~18
    '..oHHHhhhhhhHHHHHDDo..',
    '..oHHHhhhhhhHHHHHDDo..',
    '..oHHHHhhhhhHHHHHDDo..',
    '...oHDHHHDHHHDHHDDo...',
    '....oooDoooDoooDoo....',
  ];
  const LONG_SIDE = [ // 행 16~18
    '....oDDHhhho..........',
    '.....oDDHhho..........',
    '......ooooo...........',
  ];
  // 기사 투구(정면): 둥근 돔 + 밝은 챙 + 뺨 가리개 + 2x3 붉은 깃. 행 0~14, 22열
  const HELMET_DOWN = [
    '.........orro.........',
    '........oorroo........',
    '......oo11rr22oo......',
    '....oo1111112222oo....',
    '...o11111111222223o...',
    '..o1111111112222233o..',
    '..o1111111122222233o..',
    '..o2222222222222333o..',
    '..o1111111111111111o..', // 챙(밝은 띠)
    '..o3333333333333333o..',
    '..o23o..........o32o..', // 뺨 가리개
    '..o23o..........o32o..',
    '.#o23o..........o32o#.',
    '.#o33o..........o33o#.',
    '..#oo............oo#..',
  ];
  const HELMET_UP = [ // 뒷면: 목 가리개를 몸까지 2행 연장
    '.........orro.........',
    '........oorroo........',
    '......oo11rr22oo......',
    '....oo1111112222oo....',
    '...o11111111222223o...',
    '..o1111111112222233o..',
    '..o1111111122222233o..',
    '..o2222222222222333o..',
    '..o1111111111111111o..',
    '..o3333333333333333o..',
    '..o2222222222222233o..',
    '..o2222222222222233o..',
    '..o2222222222222233o..',
    '..o3333333333333333o..',
    '...o33333333333333o...',
    '....oooooooooooooo....',
  ];
  const HELMET_RIGHT = [
    '........orro..........',
    '.......oorroo.........',
    '.....oo11rr22oo.......',
    '...oo1111112222oo.....',
    '..o111111112222223o...',
    '..o1111111122222233o..',
    '..o1111111122222233o..',
    '..o2222222222222333o..',
    '..o1111111111111111o..',
    '..o3333333333333333o..',
    '..o233o...............',
    '..o233o...............',
    '..o333o...............',
    '...ooo................',
    '......................',
  ];
  // 상인 두건(빨강 천, 옆 매듭): 행 0~7
  const BANDANA_DOWN = [
    '.......oooooooo.......',
    '.....oocCCCCCCCoo.....',
    '....ocCCCCCCCCCCCo....',
    '...ocCCCCCCCCCCCCCo...',
    '..ocCCCCCCCCCCCCCCKo..',
    '..oCCCCCCCCCCCCCCCKoo.',
    '..oKKKKKKKKKKKKKKKKoKo',
    '...oooooooooooooooo.o.',
  ];
  const BANDANA_RIGHT = [
    '......ooooooooo.......',
    '....oocCCCCCCCCoo.....',
    '....ocCCCCCCCCCCCo....',
    '...ocCCCCCCCCCCCCCo...',
    '.oocCCCCCCCCCCCCCCCo..',
    'oKoCCCCCCCCCCCCCCCCo..',
    '.ooKKKKKKKKKKKKKKKKo..',
    '...oooooooooooooooo...',
  ];
  // 밀짚모자(villagerD): 크라운 2톤 + 어두운 띠 + 머리보다 1px 넓은 챙. 행 0~5
  const STRAW_DOWN = [
    '........oooooo........',
    '.......oTTTTTto.......',
    '......oTTTTTTtto......',
    '......obbbbbbbbo......',
    '.oTTTTTTTTTTTTTTTttto.',
    '..oooooooooooooooooo..',
  ];
  const STRAW_RIGHT = STRAW_DOWN;
  // 파란 두건(villagerE): 머리 행 0~8 을 덮고 앞머리·옆머리만 노출. 뒷면은 목덜미까지 + 매듭
  const KERCHIEF_DOWN = [
    '.......oooooooo.......',
    '.....oozzzzzZZoo......',
    '....ozzzzzzzzZZZo.....',
    '...ozzzzzzzzzzzZZZo...',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..oZZZZZZZZZZZZZZZZo..',
  ];
  const KERCHIEF_UP = [
    '.......oooooooo.......',
    '.....oozzzzzZZoo......',
    '....ozzzzzzzzZZZo.....',
    '...ozzzzzzzzzzzZZZo...',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..ozzzzzzzzzzzzzZZZo..',
    '..oZZzzzzzzzzzzzZZZo..',
    '..oZZZzzzzzzzzzZZZZo..',
    '..oZZZZZZZZZZZZZZZZo..',
    '...oooooooZZoooooooo..', // 매듭
    '.........oZZo.........',
    '..........oo..........',
  ];
  const KERCHIEF_RIGHT = [
    '......ooooooooo.......',
    '....oozzzzzzzZZoo.....',
    '....ozzzzzzzzzzZZo....',
    '...ozzzzzzzzzzzzZZo...',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..oZZZZZZZZZZZo.......',
    'oZZo..................', // 뒤 매듭
    '.oo...................',
  ];
  // 신관 금 머리띠(행 5) / 대장장이 빨간 머리띠(행 8)
  const CIRCLET = ['..onnnnnnnnnnnnnnnno..'];
  const HEADBAND_DOWN = ['..orrrrrrrrrrrrrrrro..'];
  const HEADBAND_RIGHT = ['..orrrrrrrrrrrrrrrrro.'];
  // 앞치마(정면): 멜빵 + 가슴판 + 치마. 행 18~27, 22열
  const APRON_DOWN = [
    '.........o....o.......',
    '.........o....o.......',
    '........oaaaaAo.......',
    '........oaaaaAo.......',
    '........oaaaaAo.......',
    '.......oaaaaaAAo......',
    '......oaaaaaaAAo......',
    '......oaaaaaAAAo......',
    '......oaaaaaAAAo......',
    '......oAAAAAAAAo......',
  ];
  const APRON_RIGHT = [ // 옆면: 앞쪽에 걸린 앞치마 행 18~27
    '..............o.......',
    '..............o.......',
    '.............oaAo.....',
    '.............oaAo.....',
    '.............oaAo.....',
    '............oaaAo.....',
    '............oaaAAo....',
    '............oaaAAo....',
    '............oaaAAo....',
    '............oAAAAo....',
  ];
  // 수염(대장장이): 입 아래 턱을 덮는 짙은 갈색 띠, 행 14~17
  const BEARD_DOWN = [
    '....oDDsssmmsssDDo....',
    '.....oDDDDDDDDDDo.....',
    '......oDDDDDDDDo......',
    '.......oDDDDDDo.......',
  ];
  const BEARD_RIGHT = [
    '.............DDssssmo.',
    '.............oDDDDDDo.',
    '..............oDDDDo..',
    '...............oooo...',
  ];

  // ======================================================================
  // 파티원 직업 덧그림 — 기존 kind 와 겹치지 않게 새 opts(weapon/shield/quiver/pauldrons/tabard/mail/mask)와
  // 새 hat(horned/wizard/feather/hood/topknot)으로만 켜진다. 좌표는 몸 도트맵(22열) 기준, 음수 행은 머리 위.
  // 새 팔레트 문자(기존 kind 는 쓰지 않음): w q 무기 나무(밝음·어둠), I 활시위·룬 반짝, V X 마검 칼날(밝음·어둠), R 진홍(방패·휘장 어둠)
  // ======================================================================
  // 전사 뿔 투구(정면/뒷면 공용 돔): 행 0~8, 금 테두리 + 코 가리개(정면만)
  const HORNED_DOME = [
    '.......oooooooo.......', // 0
    '.....oo1111112222oo...', // 1
    '...o1i11111112222o3o..', // 2
    '..o1i111111112222233o.', // 3
    '..o11111111112222233o.', // 4
    '..o11111111122222333o.', // 5
    '..o22222222222223333o.', // 6
    '..onnnnnnnnnnnnnnnnno.', // 7 금 테두리
    '..o33333333333333333o.', // 8
  ];
  // 뿔(왼쪽, 상아색). 행 -2 부터, 몸 -2열부터(5열) — 오른쪽은 좌우 반전해 몸 19열에
  const HORN_L = [
    'o....',
    'oao..',
    'oao..',
    'oaao.',
    '.oaAo',
    '..oAA',
    '...oo',
  ];
  const HORNED_SIDE = [ // 옆면 돔: 앞쪽(오른쪽)이 이마 위에서 끝난다
    '......ooooooooo.......',
    '....oo1111112222o.....',
    '...o1i111111122223o...',
    '..o1i11111111222233o..',
    '..o1111111111222233o..',
    '..o1111111111222233o..',
    '..o2222222222223333oo.',
    '..onnnnnnnnnnnnnnnnnno',
    '..o333333333333o......',
  ];
  const HORN_SIDE = [ // 옆면: 머리 꼭대기 뒤쪽에서 위로 휘는 뿔 하나(몸 4열, 행 -3)
    '.oo...',
    'oao...',
    'oaAo..',
    '.oaAo.',
    '..oAAo',
    '...oo.',
  ];
  // 마법사 고깔모자: 행 -4~7, 끝이 오른쪽으로 꺾인다. 띠 n + 별 i
  const WIZARD_HAT = [
    '..............ooo.....', // -4
    '............oozZZo....', // -3
    '..........oozzzZo.....', // -2
    '.........ozzzzZZo.....', // -1
    '........ozzzzzZZo.....', // 0
    '.......ozzzzzzZZZo....', // 1
    '.......ozzizzzZZZo....', // 2
    '......ozzzzzzzzZZZo...', // 3
    '......onnnnnnnnnnno...', // 4 띠
    '.....ozzzzzzzzzzZZZo..', // 5
    'ooooozzzzzzzzzzzzZZZoo', // 6 챙
    'ozzzzzzzzzzzzzzzzzZZZo', // 7
    '.oooZZZZZZZZZZZZZZZoo.', // 8
  ];
  const WIZARD_HAT_UP = WIZARD_HAT.map((r, i) => (i === 6 ? r.replace('i', 'z') : r));
  const WIZARD_HAT_SIDE = [
    '.....ooo..............', // -4 끝이 뒤로 꺾인다
    '....oZZzoo............',
    '.....oZzzzoo..........',
    '.....oZZzzzzo.........',
    '.....oZZzzzzzo........',
    '....oZZZzzzzzzo.......',
    '....oZZZzzzzizo.......',
    '...oZZZzzzzzzzzo......',
    '...onnnnnnnnnnno......',
    '..oZZZzzzzzzzzzzo.....',
    'ooZZZzzzzzzzzzzzzooooo',
    'oZZZzzzzzzzzzzzzzzzzzo',
    '.ooZZZZZZZZZZZZZZZZoo.',
  ];
  // 사냥꾼 깃털 모자(초록 펠트, 앞이 뾰족) + 빨간 깃털: 행 -3~6
  const FEATHER_CAP = [
    '..................oo..', // -3 깃털 끝
    '.................oro..', // -2
    '................orro..', // -1
    '.......oooooooooorro..', // 0
    '.....oozzzzzzZZorrZo..', // 1
    '....ozzzzzzzzzZZorZo..', // 2
    '...ozzzzzzzzzzzZZoZZo.', // 3
    '..ozzzzzzzzzzzzzZZZZo.', // 4
    '..oZZZZZZZZZZZZZZZZZo.', // 5
    '..obbbbbbbbbbbbbbbbbo.', // 6 가죽 띠
  ];
  const FEATHER_CAP_SIDE = [
    '..oo..................', // -3 깃털이 뒤로
    '..oro.................',
    '..orro................',
    '..orroooooooo.........',
    '..oZrrozzzzzzoo.......',
    '..oZZrozzzzzzzzo......',
    '..oZZZozzzzzzzzzo.....',
    '..oZZZZzzzzzzzzzzooo..', // 앞챙이 앞으로 뾰족
    '..oZZZZZZZZZZZZZZZzzoo',
    '..obbbbbbbbbbbbbbbbbo.',
  ];
  // 도적 두건: 머리 전체를 덮고 얼굴 가장자리와 어깨까지 내려온다. 행 0~17
  const HOOD_DOWN = [
    '.......oooooooo.......', // 0
    '.....oozzzzzzZZoo.....', // 1
    '....ozzzzzzzzzZZZo....', // 2
    '...ozzzzzzzzzzzzZZo...', // 3
    '..ozzzzzzzzzzzzzzZZo..', // 4
    '..ozzzzzzzzzzzzzzZZo..', // 5
    '..ozzzzzzzzzzzzzzZZo..', // 6
    '..ozZZZZZZZZZZZZZZZo..', // 7
    '..ozZoooooooooooozZo..', // 8 얼굴 테두리(그늘)
    '..ozZo..........ozZo..', // 9
    '..ozZo..........ozZo..', // 10
    '..ozZo..........ozZo..', // 11
    '.ozzZo..........ozZZo.', // 12
    '.ozzZo..........ozZZo.', // 13
    '.ozzZZo........oZZZZo.', // 14
    '..ozzZZo......oZZZZo..', // 15
  ];
  // 도적 복면: 입·홍조 행을 덮는다(행 13~15)
  const MASK_DOWN = [ // 붉은 복면 — 어두운 두건 속에서 도적을 한눈에 구분하게 하는 포인트 색
    '.....oooooooooooo.....',
    '.....orrrrrrrrrRo.....',
    '......oRRRRRRRRo......',
  ];
  const HOOD_UP = [
    '.......oooooooo.......',
    '.....oozzzzzzZZoo.....',
    '....ozzzzzzzzzZZZo....',
    '...ozzzzzzzzzzzzZZo...',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..ozzzzzzzzzzzzzzZZo..',
    '..oZzzzzzzzzzzzzZZZo..',
    '.oZZzzzzzzzzzzzzZZZZo.',
    '.oZZZzzzzzzzzzzZZZZZo.',
    '.oZZZZZZZZZZZZZZZZZZo.',
    '..ooZZZZZZZZZZZZZZoo..',
  ];
  const HOOD_SIDE = [
    '......ooooooooo.......',
    '....oozzzzzzzZZoo.....',
    '....ozzzzzzzzzzZZo....',
    '...ozzzzzzzzzzzzzZo...',
    '..ozzzzzzzzzzzzzzzZo..',
    '..ozzzzzzzzzzzzzzzZo..',
    '..ozzzzzzzzzzzzzzzZZo.',
    '..ozzzzzzzzzzzzZZZZZZo',
    '..ozzzzzzzzzzZoooooooo', // 8 얼굴 테두리
    '..ozzzzzzzzzZo........',
    '..ozzzzzzzzzZo........',
    '..ozzzzzzzzzZo........',
    '.oZzzzzzzzzzZo........',
    '.oZZzzzzzzzzZo........',
    '.oZZZzzzzzzZZo........',
    '..ooZZZZZZZZZo........',
  ];
  const MASK_SIDE = [
    '.............ooooooooo',
    '.............orrrrrrRo',
    '.............ooRRRRRo.',
  ];
  // 무투가 상투(머리 위 쪽진 머리, 행 -3~1) — 붉은 머리띠(HEADBAND)와 함께 쓴다
  const TOPKNOT = [
    '.........oooo.........',
    '........ohhHHo........',
    '........oHHDDo........',
    '.........orro.........',
    '........oohhoo........',
  ];
  const TOPKNOT_SIDE = [
    '.....oooo.............',
    '....ohhHHo............',
    '....oHHDDo............',
    '.....orro.............',
    '.....oohhoo...........',
  ];

  // ---------- 몸통 덧그림 ----------
  // 판금 어깨받이(전사): 행 16~20, 정면 왼쪽(몸 0열부터). 오른쪽은 반전해 몸 16열에
  const PAULDRON_L = [
    '.ooooo',
    'o1i112',
    'o11122',
    'o22233',
    '.onnno',
  ];
  const PAULDRON_SIDE = [ // 옆면: 팔 위 둥근 어깨 하나(몸 10열부터) — 가로 금줄이 몸통을 가르지 않게 짧게
    '...oooo...',
    '..o1i12o..',
    '.o111223o.',
    '.o222233o.',
    '..onnnno..',
  ];
  // 진홍 휘장(전사): 벨트 아래 행 24~29, 다리 사이로 늘어뜨린다
  const TABARD_DOWN = [
    '........orrrRo........',
    '........orrrRo........',
    '........orrrRo........',
    '........orrrRo........',
    '........oRRRRo........',
    '.........oooo.........',
  ];
  const TABARD_SIDE = [
    '..............orRo....',
    '..............orRo....',
    '..............orRo....',
    '..............orRo....',
    '..............oRRo....',
    '...............oo.....',
  ];
  // 화살통 멜빵(사냥꾼, 정면): 오른 어깨에서 왼 허리로 비스듬히. 행 16~23
  const STRAP_DOWN = [
    '.............obo......',
    '............obo.......',
    '...........obo........',
    '..........obo.........',
    '.........obo..........',
    '........obo...........',
    '.......obo............',
  ];

  // ---------- 무기 ----------
  // 장검(8열): 칼끝 행 0, 날밑 행 13, 손잡이 14~15, 폼멜 16. 지팡이와 같은 자리(프레임 x=1)에 세워 쥔다
  const SWORD = [
    '...oo...',
    '..oi2o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '..o12o..',
    '.oo12oo.',
    'oBBBBBBo',
    '.oobboo.',
    '..obbo..',
    '..oBBo..',
    '...oo...',
  ];
  // 마검: 푸른 빛 칼날 + 룬 반짝(I), 날밑은 은색
  const RUNEBLADE = SWORD.map((r, i) => (i >= 1 && i <= 12 ? r.replace('i', 'I').replace('12', i % 4 === 2 ? 'IX' : 'VX') : i === 13 ? 'o111112o' : r));
  // 연 모양 방패(9열 x 11행): 진홍 바탕 + 금 십자
  const SHIELD = [
    '.ooooooo.',
    'onnnnnnno',
    'onrrnrRno',
    'onrrnrRno',
    'onnnnnnno',
    'onrrnrRno',
    '.onrnRno.',
    '.onrnRno.',
    '..onnno..',
    '...ono...',
    '....o....',
  ];
  const SHIELD_BACK = [ // 뒷면에서 본 방패: 나무 안쪽 + 가죽 끈
    '.ooooooo.',
    'onnnnnnno',
    'onwwwwqno',
    'onbbbbbno',
    'onwwwwqno',
    'onwwwwqno',
    '.onbbbno.',
    '.onwwqno.',
    '..onnno..',
    '...ono...',
    '....o....',
  ];
  const SHIELD_EDGE = [ // 옆면: 등 뒤로 비스듬히 보이는 방패 가장자리
    '.oo.',
    'onRo',
    'onRo',
    'onRo',
    'onRo',
    'onRo',
    'onRo',
    '.onRo'.slice(0, 4),
    '.ono',
    '..o.',
  ];
  // 활(정면, 8열 x 18행): 손잡이는 몸 18~19열, 시위(I)는 몸 위를 지나간다
  const BOW_DOWN = [
    '..oo....',
    '.Iowo...',
    '.I.owo..',
    '.I.owo..',
    '.I..owo.',
    '.I..owqo',
    '.I..owqo',
    '.I..obbo',
    '.I..obbo',
    '.I..obbo',
    '.I..owqo',
    '.I..owqo',
    '.I..owo.',
    '.I.owo..',
    '.I.owo..',
    '.Iowo...',
    '..oo....',
  ];
  // 활(옆면): 앞으로 내민 손에 세워 쥔다(몸 17열부터, 활대가 앞쪽으로 휜다)
  const BOW_SIDE = [
    '.oo.....',
    '.owo..I.'.replace('I', '.'),
    '..owo.I.',
    '..owo.I.',
    '...owoI.',
    '...owqI.',
    '...obbI.',
    '...obbI.',
    '...obbI.',
    '...owqI.',
    '...owoI.',
    '..owo.I.',
    '..owo.I.',
    '.owo..I.',
    '.oo.....',
  ].map(r => r.padEnd(8, '.'));
  // 화살통(뒷면·옆면): 깃털(r/a) + 가죽 통(p/P) + 금 띠(B)
  const QUIVER = [
    '.o.o.o.',
    'oroaoro',
    'oroaoro',
    'ooooooo',
    'opppPPo',
    'oBBBBBo',
    'opppPPo',
    'opppPPo',
    'opppPPo',
    'opppPPo',
    'oBBBBBo',
    '.ooooo.',
  ];
  // 단검(역수로 쥔 칼날이 아래를 향한다, 5열 x 6행) — 손 바로 아래에 둔다
  const DAGGER = [
    'oBBBo',
    '.oi2o',
    '.o12o',
    '.o12o',
    '..o2o',
    '..oo.',
  ];
  // 마법사 지팡이: 금 갈고리가 감싼 보랏빛 보주(j/J/i) + 어두운 나무 자루
  const MAGE_STAFF = [
    '..oooo..',
    '.onjjno.',
    'ono.jJno'.replace('.', 'j'),
    'onjjJJno',
    'onjJJJno',
    '.onJJno.',
    '..onno..',
    '..opPo..',
    '..opPo..',
    '.nopPon.',
    '..opPo..',
  ].concat(Array.from({ length: 23 }, (_, i) => (i === 12 ? '..oPPo..' : '..opPo..')), ['..oooo..']);
  // 너클(무투가): 손을 덮는 금속 주먹 덧그림(5열 x 4행)
  const KNUCKLE = [ // 놋쇠 너클 — 주황 무투복과 대비되게 한 칸 크게
    '.ooo.',
    'owiwo',
    'owwqo',
    'oqqqo',
    '.ooo.',
  ];
  const KNUCKLE_SIDE = [
    '.ooo.',
    'owiwo',
    'owwqo',
    'oqqqo',
    '.ooo.',
  ];

  // ======================================================================
  // 프레임 규격
  // ======================================================================
  const FW = 32, FH = 40;      // 프레임 캔버스
  const BX = 5, BY = 4;        // 몸 도트맵(22x34)의 프레임 내 위치
  const ANCHOR = { x: 16, y: 38 }; // 발 바닥 중앙
  const HEAD_H = 16, TORSO_H = 12;

  // ---------- 헬퍼 ----------
  // 문자열 도트맵을 캔버스에 찍는다. '#' 은 그 자리를 투명하게 지운다('.' 은 건너뜀).
  function blit(ctx, rows, pal, x, y) {
    const w = rows[0].length;
    for (const r of rows) if (r.length !== w) throw new Error('도트맵 폭이 다릅니다: "' + r + '" (' + r.length + ' != ' + w + ')');
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < w; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        if (ch === '#') { ctx.clearRect(x + i, y + j, 1, 1); continue; }
        const col = pal[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  // 행 좌우 반전
  function mirrorRows(rows) { return rows.map(r => r.split('').reverse().join('')); }
  // 지정 인덱스 행 삭제 (아이 키 줄이기용)
  function dropRows(rows, idx) { return rows.filter((_, i) => !idx.includes(i)); }
  // 지정 인덱스 열 삭제 (아이 머리 폭 줄이기용)
  function dropCols(rows, idx) { return rows.map(r => r.split('').filter((_, i) => !idx.includes(i)).join('')); }
  // 행마다 오른쪽으로 밀어 대각선 기울기를 만든다 (옆면 지팡이). shiftFn(rowIndex) → 밀 칸 수
  function slant(rows, shiftFn, maxShift) {
    return rows.map((r, i) => { const s = shiftFn(i); return '.'.repeat(s) + r + '.'.repeat(maxShift - s); });
  }
  // 사슬 갑옷 무늬: 튜닉 면(g/G)을 한 칸 걸러 어둡게 바꿔 고리 격자처럼 보이게 한다(깃·벨트·단은 유지)
  function mailTexture(rows) {
    return rows.map((r, j) => (j === 0 || j === rows.length - 1 ? r : r.split('').map((ch, i) => {
      if ((i + j) % 2) return ch;
      return ch === 'g' ? 'G' : ch === 'G' ? 'd' : ch;
    }).join('')));
  }
  // 특정 행/열 문자 치환
  function setAt(rows, r, c, ch) { const out = rows.slice(); out[r] = out[r].slice(0, c) + ch + out[r].slice(c + 1); return out; }

  // 옆면 지팡이: 위(보석)가 앞쪽, 아래가 뒤쪽으로 4단 계단 기울기
  const STAFF_SIDE = slant(STAFF, (i) => 3 - Math.floor(i / 9), 3);
  // 아이 머리: 양쪽 1열(안쪽 머리카락), 2행(머리 중간 + 볼 행) 줄이기 → 얼굴 비중이 커져 아이로 읽힌다
  const CHILD_DROP_COLS = [3, 18], CHILD_DROP_ROWS = [7, 14];
  function childHead(rows) { return dropCols(dropRows(rows, CHILD_DROP_ROWS), CHILD_DROP_COLS); }
  const HEAD_DOWN_CHILD = childHead(setAt(setAt(HEAD_DOWN, 13, 5, 'x'), 13, 16, 'x')); // 홍조는 눈 아랫줄로
  const HEAD_UP_CHILD = childHead(HEAD_UP);
  const HEAD_RIGHT_CHILD = childHead(HEAD_RIGHT);
  const SHORT_L_CHILD = dropCols(dropRows(SHORT_L, [4]), [2]);       // 몸 1~4열 → 3열 (열 3 삭제), 행 14 삭제
  const SHORT_UP_CHILD = dropCols(dropRows(SHORT_UP, [2]), CHILD_DROP_COLS);
  const SHORT_SIDE_CHILD = dropCols(dropRows(SHORT_SIDE, [2]), CHILD_DROP_COLS);

  // 한 프레임 조립. parts: 그리기 순서대로 [rows, x, y]
  function compose(parts, pal) {
    const c = Pixel.make(FW, FH);
    const ctx = c.getContext('2d');
    for (const p of parts) if (p) blit(ctx, p[0], pal, p[1], p[2]);
    return c;
  }

  // 방향별 4프레임 (0 서기, 1 걷기A, 2 서기, 3 걷기B)
  // opts: staff, crown, small(아이), cape(기본 true), hat('helmet'|'bandana'|'straw'|'kerchief'|'circlet'|'headband'),
  //       hair('bob'|'long'|'short'), apron, beard, robe(발목 로브)
  function buildCharacter(palette, opts = {}) {
    const pal = Object.assign({}, PLAYER_PAL, JOB_PAL, palette || {});
    const crown = !!opts.crown;
    const staff = !!opts.staff;
    const small = !!opts.small;
    const cape = opts.cape !== false;
    const hat = opts.hat || null;
    const hair = opts.hair || 'bob';
    const apron = !!opts.apron, beard = !!opts.beard, robe = !!opts.robe;
    // 파티원 직업 전용 옵션 — 기존 kind 는 모두 꺼져 있어 그리기 순서·픽셀이 그대로다
    const weapon = opts.weapon || null; // 'sword' | 'runeblade' | 'bow' | 'daggers' | 'knuckles'
    const shield = !!opts.shield, quiver = !!opts.quiver, pauldrons = !!opts.pauldrons, tabard = !!opts.tabard, mask = !!opts.mask;
    const blade = weapon === 'sword' ? SWORD : weapon === 'runeblade' ? RUNEBLADE : null;
    const staffD = opts.staffMap || STAFF;
    const staffR = opts.staffMap ? slant(opts.staffMap, (i) => 3 - Math.floor(i / 9), 3) : STAFF_SIDE;
    const bladeR = blade ? slant(blade, (i) => (i < 6 ? 2 : i < 12 ? 1 : 0), 2) : null;
    // 뒷면에서 검을 쥔 팔: 정면 팔을 반전하고, 망토가 있으면 어깨 두 줄을 망토색으로
    const armHoldUp = mirrorRows(ARM_STAFF_DOWN).map((r, i) => (cape && i < 2 ? r.replace(/g/g, 'C').replace(/G/g, 'K') : r));

    // 아이: 머리 2행·몸통 2행·다리 2행 줄이기
    const headH = HEAD_H - (small ? 2 : 0);
    const torsoH = TORSO_H - (small ? 2 : 0);
    const mailF = opts.mail ? mailTexture : (r) => r; // 사슬 갑옷: 튜닉 면에 체크 무늬
    const tunicD = mailF(small ? dropRows(TUNIC_DOWN, [5, 6]) : TUNIC_DOWN);
    const tunicU = mailF(small ? dropRows(TUNIC_UP, [5, 6]) : TUNIC_UP);
    const tunicR = mailF(small ? dropRows(TUNIC_RIGHT, [5, 6]) : TUNIC_RIGHT);
    const capeU = small ? dropRows(CAPE_UP, [3, 4]) : CAPE_UP;
    const capeR = small ? dropRows(CAPE_RIGHT, [6, 7]) : CAPE_RIGHT;
    const legFix = small ? [2, 3] : [];
    const legsDS = dropRows(LEGS_DOWN_STAND, legFix), legsDA = dropRows(LEGS_DOWN_WALK_A, legFix), legsDB = mirrorRows(legsDA);
    const legsRS = dropRows(LEGS_RIGHT_STAND, legFix), legsRA = dropRows(LEGS_RIGHT_WALK_A, legFix), legsRB = dropRows(LEGS_RIGHT_WALK_B, legFix);
    const legY = headH + torsoH;
    const by = BY + (HEAD_H + TORSO_H + 6) - (headH + torsoH + (small ? 4 : 6)); // 발이 같은 위치에 오게 몸 전체를 내림
    const armY = headH + 5;            // 팔 시작 행(몸 좌표)
    const headD = small ? HEAD_DOWN_CHILD : HEAD_DOWN, headU = small ? HEAD_UP_CHILD : HEAD_UP, headR = small ? HEAD_RIGHT_CHILD : HEAD_RIGHT;
    const hx = small ? BX + 1 : BX;    // 아이 머리는 1px 안쪽
    const hemDownY = headH + 4;        // 망토 자락 행(정면 20)
    const hemUpY = headH + (small ? 3 : 5); // 망토 자락 행(뒷면 21)
    const robeY = headH + torsoH - 1;  // 로브 시작 행(튜닉 금단 자리)

    function hairParts(dir, y) {
      const parts = [];
      if (dir === 'down') {
        if (hair === 'short') { const m = small ? SHORT_L_CHILD : SHORT_L; parts.push([m, hx + 1, y + 10]); parts.push([mirrorRows(m), hx + (small ? 18 : 17), y + 10]); }
        if (hair === 'long') parts.push([LONG_DOWN, BX, y + headH]);
      } else if (dir === 'up') {
        if (hair === 'short') parts.push([small ? SHORT_UP_CHILD : SHORT_UP, hx, y + 12]);
        if (hair === 'long') parts.push([LONG_UP, BX, y + 14]);
      } else {
        if (hair === 'short') parts.push([small ? SHORT_SIDE_CHILD : SHORT_SIDE, hx, y + 12]);
        if (hair === 'long') parts.push([LONG_SIDE, BX, y + headH]);
      }
      return parts;
    }
    function hatParts(dir, y) {
      const parts = [];
      if (hat === 'helmet') parts.push([dir === 'down' ? HELMET_DOWN : dir === 'up' ? HELMET_UP : HELMET_RIGHT, BX, y]);
      if (hat === 'bandana') parts.push([dir === 'right' ? BANDANA_RIGHT : BANDANA_DOWN, BX, y]);
      if (hat === 'straw') parts.push([dir === 'right' ? STRAW_RIGHT : STRAW_DOWN, BX, y]);
      if (hat === 'kerchief') parts.push([dir === 'down' ? KERCHIEF_DOWN : dir === 'up' ? KERCHIEF_UP : KERCHIEF_RIGHT, BX, y]);
      if (hat === 'circlet') parts.push([CIRCLET, BX, y + 5]);
      if (hat === 'headband') parts.push([dir === 'right' ? HEADBAND_RIGHT : HEADBAND_DOWN, BX, y + 8]);
      if (hat === 'horned') {
        if (dir === 'right') { parts.push([HORN_SIDE, BX + 4, y - 3]); parts.push([HORNED_SIDE, BX, y]); }
        else {
          parts.push([HORN_L, BX - 2, y - 2]); parts.push([mirrorRows(HORN_L), BX + 19, y - 2]);
          parts.push([HORNED_DOME, BX, y]);
        }
      }
      if (hat === 'wizard') parts.push([dir === 'down' ? WIZARD_HAT : dir === 'up' ? WIZARD_HAT_UP : WIZARD_HAT_SIDE, BX, y - 4]);
      if (hat === 'feather') parts.push([dir === 'right' ? FEATHER_CAP_SIDE : FEATHER_CAP, BX, y - 3]);
      if (hat === 'hood') parts.push([dir === 'down' ? HOOD_DOWN : dir === 'up' ? HOOD_UP : HOOD_SIDE, BX, y]);
      if (hat === 'topknot') {
        parts.push([dir === 'right' ? HEADBAND_RIGHT : HEADBAND_DOWN, BX, y + 8]);
        parts.push([dir === 'right' ? TOPKNOT_SIDE : TOPKNOT, BX, y - 3]);
      }
      return parts;
    }

    function frameDown(legs, bob, armL, armR, hem, tip) {
      const y = by - bob;
      const parts = [];
      if (staff) parts.push([staffD, 1, y - 1]);
      if (blade) parts.push([blade, 1, y + 11 + armL]);
      if (!robe) parts.push([legs, BX, y + legY]);
      parts.push([tunicD, BX, y + headH]);
      if (robe) { parts.push([ROBE_DOWN, BX, y + robeY]); if (tip) parts.push([tip, BX, y + robeY + 7]); }
      if (cape) {
        parts.push([CAPE_DOWN, BX, y + headH]);
        if (hem === 'L') parts.push([CAPE_HEM_DOWN_L, BX, y + hemDownY]);
        if (hem === 'R') parts.push([CAPE_HEM_DOWN_R, BX, y + hemDownY]);
      }
      if (apron) parts.push([APRON_DOWN, BX, y + headH + 2]);
      if (tabard) parts.push([TABARD_DOWN, BX, y + 24]);
      if (quiver) parts.push([STRAP_DOWN, BX, y + 16]);
      if (pauldrons) { parts.push([PAULDRON_L, BX, y + 16]); parts.push([mirrorRows(PAULDRON_L), BX + 16, y + 16]); }
      if (weapon === 'bow') parts.push([BOW_DOWN, BX + 13, y + 15 + armR]);
      if (staff || blade) parts.push([ARM_STAFF_DOWN, BX, y + armY + armL]);
      else parts.push([ARM_FRONT, BX + 2, y + armY + armL]);
      parts.push([ARM_FRONT, BX + 17, y + armY + armR]);
      if (shield) parts.push([SHIELD, BX + 14, y + 19 + armR]);
      if (weapon === 'daggers') { parts.push([DAGGER, BX + 1, y + 26 + armL]); parts.push([mirrorRows(DAGGER), BX + 16, y + 26 + armR]); }
      if (weapon === 'knuckles') { parts.push([KNUCKLE, BX + 1, y + 23 + armL]); parts.push([KNUCKLE, BX + 16, y + 23 + armR]); }
      parts.push([headD, hx, y]);
      parts.push(...hairParts('down', y));
      if (mask) parts.push([MASK_DOWN, BX, y + 13]);
      if (beard) parts.push([BEARD_DOWN, BX, y + 14]);
      if (crown) parts.push([CROWN_DOWN, BX, y + 2]);
      parts.push(...hatParts('down', y));
      return compose(parts, pal);
    }
    function frameUp(legs, bob, armL, armR, hem, tip) {
      const y = by - bob;
      const parts = [];
      if (blade) parts.push([blade, BX + 16, y + 11 + armR]);
      if (weapon === 'bow') parts.push([mirrorRows(BOW_DOWN), BX - 2, y + 16 + armL]);
      if (!robe) parts.push([legs, BX, y + legY]);
      parts.push([tunicU, BX, y + headH]);
      if (robe) { parts.push([ROBE_UP, BX, y + robeY]); if (tip) parts.push([tip, BX, y + robeY + 7]); }
      if (cape) {
        parts.push([capeU, BX, y + headH]);
        if (hem === 'L') parts.push([CAPE_HEM_UP_L, BX, y + hemUpY]);
        if (hem === 'R') parts.push([CAPE_HEM_UP_R, BX, y + hemUpY]);
      }
      if (tabard) parts.push([TABARD_DOWN.map(r => r.replace(/r/g, 'R')), BX, y + 24]);
      if (pauldrons) { parts.push([PAULDRON_L, BX, y + 16]); parts.push([mirrorRows(PAULDRON_L), BX + 16, y + 16]); }
      const arm = cape ? ARM_BACK : ARM_BACK_NOCAPE;
      parts.push([arm, BX + 2, y + armY + armL]);
      if (blade) parts.push([armHoldUp, BX + 16, y + armY + armR]);
      else parts.push([arm, BX + 17, y + armY + armR]);
      if (shield) parts.push([SHIELD_BACK, BX - 1, y + 19 + armL]);
      if (weapon === 'daggers') { parts.push([DAGGER, BX + 1, y + 27 + armL]); parts.push([mirrorRows(DAGGER), BX + 16, y + 27 + armR]); }
      if (weapon === 'knuckles') { parts.push([KNUCKLE, BX + 1, y + 24 + armL]); parts.push([KNUCKLE, BX + 16, y + 24 + armR]); }
      parts.push([headU, hx, y]);
      parts.push(...hairParts('up', y));
      if (crown) parts.push([CROWN_DOWN, BX, y + 2]);
      parts.push(...hatParts('up', y));
      if (quiver) parts.push([QUIVER, BX + 13, y + 13]);
      if (staff) parts.push([staffD, BX + 18, y - 1]);
      return compose(parts, pal);
    }
    function frameRight(legs, bob, arm, fly, tip) {
      const y = by - bob;
      const parts = [];
      if (fly && cape) parts.push([CAPE_FLY_RIGHT, BX, y + headH + 3]);
      if (shield) parts.push([SHIELD_EDGE, BX + 1, y + 18]);
      if (!robe) parts.push([legs, BX, y + legY]);
      parts.push([tunicR, BX, y + headH]);
      if (robe) { parts.push([ROBE_RIGHT, BX, y + robeY]); if (tip) parts.push([tip, BX, y + robeY + 7]); }
      if (cape) parts.push([capeR, BX, y + headH]);
      if (apron) parts.push([APRON_RIGHT, BX, y + headH + 2]);
      if (tabard) parts.push([TABARD_SIDE, BX, y + 24]);
      if (quiver) parts.push([QUIVER, BX + 1, y + 13]);
      if (pauldrons) parts.push([PAULDRON_SIDE, BX + 10, y + 16]);
      const holdSide = staff || blade || weapon === 'bow';
      if (!holdSide) parts.push([ARM_SIDE, BX + 12 + arm, y + armY]);
      if (weapon === 'daggers') parts.push([DAGGER, BX + 12 + arm, y + 26]);
      if (weapon === 'knuckles') parts.push([KNUCKLE_SIDE, BX + 13 + arm, y + 23]);
      parts.push([headR, hx, y]);
      parts.push(...hairParts('right', y));
      if (mask) parts.push([MASK_SIDE, BX, y + 13]);
      if (beard) parts.push([BEARD_RIGHT, BX, y + 14]);
      if (crown) parts.push([CROWN_RIGHT, BX, y + 2]);
      parts.push(...hatParts('right', y));
      // 지팡이는 얼굴 앞쪽에, 손이 자루를 덮도록 팔은 지팡이 뒤에 그린다
      if (staff) { parts.push([staffR, 22, y - 1]); parts.push([ARM_SIDE_STAFF, BX + 14, y + armY]); }
      if (blade) { parts.push([bladeR, 23, y + 10]); parts.push([ARM_SIDE_STAFF, BX + 14, y + armY]); }
      if (weapon === 'bow') { parts.push([mirrorRows(BOW_SIDE), BX + 19, y + 17]); parts.push([ARM_SIDE_STAFF, BX + 14, y + armY]); }
      return compose(parts, pal);
    }

    const down = [
      frameDown(legsDS, 0, 0, 0, null, null),
      frameDown(legsDA, 1, 1, -1, 'R', FOOT_TIP_R),
      frameDown(legsDS, 0, 0, 0, null, null),
      frameDown(legsDB, 1, -1, 1, 'L', FOOT_TIP_L),
    ];
    const up = [
      frameUp(legsDS, 0, 0, 0, null, null),
      frameUp(legsDB, 1, -1, 1, 'L', FOOT_TIP_L),
      frameUp(legsDS, 0, 0, 0, null, null),
      frameUp(legsDA, 1, 1, -1, 'R', FOOT_TIP_R),
    ];
    const right = [
      frameRight(legsRS, 0, 0, false, null),
      frameRight(legsRA, 1, 1, true, FOOT_TIP_R),
      frameRight(legsRS, 0, 0, false, null),
      frameRight(legsRB, 1, -1, true, FOOT_TIP_L),
    ];
    const left = right.map(Pixel.flipH);
    return { down, up, right, left, anchor: ANCHOR, w: FW, h: FH };
  }

  // ---------- NPC 팔레트 ----------
  const NPC_PALETTES = {
    villagerA: { y: '#b98a63', h: '#8a5a36', H: '#64401f', D: '#452a14', e: '#6b4426', E: '#3b2316', f: '#8a5a3a', g: '#8fb0e0', G: '#5579b8', d: '#3a5790', n: '#e3dcc4', c: '#e2d3b0', C: '#b9a67f', K: '#8c7a58' },
    villagerB: { y: '#fbe39c', h: '#f0c25a', H: '#c6962f', D: '#8f6a1c', e: '#5a8ad0', E: '#2f5a9a', f: '#8ab4ea', g: '#f09a92', G: '#c45a52', d: '#8a3a34', n: '#f7e6c0', c: '#f1e5cf', C: '#c8b797', K: '#978666' },
    villagerC: { y: '#6a5560', h: '#4a3640', H: '#33232c', D: '#1f151b', e: '#6b4426', E: '#3b2316', f: '#8a5a3a', g: '#b899e0', G: '#7d5bb2', d: '#553c80', n: '#ece0b8', c: '#e7d4b8', C: '#b59c7a', K: '#86705a' },
    villagerD: { y: '#f5b06a', h: '#e08a40', H: '#b36228', D: '#80411a', e: '#4a9a6a', E: '#246a44', f: '#7cc49a', g: '#9ed29a', G: '#5a9a60', d: '#3b6a40', n: '#e8dcae', c: '#e9dcc4', C: '#b9a984', K: '#8c7c5c', b: '#5a3a1e' },
    villagerE: { y: '#b9a39a', h: '#8d6e63', H: '#654c43', D: '#46332d', e: '#6b4426', E: '#3b2316', f: '#8a5a3a', g: '#f3d27a', G: '#c9962f', d: '#8f6a1e', n: '#f8efcf', c: '#cfdbe6', C: '#98acbd', K: '#6f8495' },
    child: { y: '#f28d6e', h: '#d9553f', H: '#a63b2b', D: '#73261b', e: '#5a8ad0', E: '#2f5a9a', f: '#8ab4ea', g: '#ffffff', G: '#e9e3d2', d: '#bbb29c', n: '#8fd0e8', c: '#93d2ea', C: '#5fa6c4', K: '#3f7a94' },
    knight: { y: '#c3ccd6', h: '#9aa6b5', H: '#6d7886', D: '#4e5661', g: '#7f93c0', G: '#4f6392', d: '#35466c', n: '#d9c56a', c: '#e86a6a', C: '#b84040', K: '#7a2828', u: '#6f6f78', U: '#444450', b: '#3a2e2a', B: '#c8c8c8' },
    priest: { y: '#f3eefb', h: '#c9b6e0', H: '#9d86c2', D: '#6f5a92', e: '#6a9ad8', E: '#3a60a0', f: '#9dc2ee', g: '#ffffff', G: '#ece5d8', d: '#c9bfab', n: '#e2b84a', c: '#e8c46a', C: '#c39a3c', K: '#8e6d25', b: '#c39a3c', B: '#f3dc8a' },
    smith: { y: '#8d6a55', h: '#5f4030', H: '#452c20', D: '#2d1b13', e: '#6b4426', E: '#3b2316', f: '#8a5a3a', g: '#a8744a', G: '#7a4e2c', d: '#553518', n: '#8a6a44', c: '#6a6a6a', C: '#4a4a4a', K: '#303030', a: '#9a9a9a', A: '#5e5e5e', s: '#f0c9a4', S: '#d19d78', r: '#d44a3a' },
    // ---- 파티원 직업(성별·머리색은 직업마다 고정) ----
    // 전사: 갈색 짧은 머리 남성, 은빛 판금 + 금 테두리, 진홍 휘장·방패
    warrior: { y: '#c79a6a', h: '#9a6a3e', H: '#6e4826', D: '#4a2e17', f: '#9cc4ea', e: '#5a8ad0', E: '#2f5a9a',
      g: '#dfe5ec', G: '#a1adbd', d: '#626e7d', n: '#e0b84e', b: '#5a3a22', B: '#e0b84e', u: '#a7b2bf', U: '#5f6a79',
      a: '#f5ecd4', A: '#c2ad84', r: '#d94848', R: '#8e2626', w: '#b98552', q: '#7a5230' },
    // 마법사: 구릿빛 긴 머리 여성, 보라 로브·고깔모자, 보주 지팡이
    mage: { y: '#ffb38a', h: '#ee7f52', H: '#c1532f', D: '#86331b', f: '#c9a2ff', e: '#9a6ae0', E: '#5e3a9e',
      g: '#a98be8', G: '#7752c9', d: '#4c3190', n: '#f2cc5a', b: '#4c3190', B: '#f2cc5a',
      z: '#7d5ad6', Z: '#4a2f99', j: '#ffb8f0', J: '#d75ad0', i: '#ffffff', p: '#6e4a3a', P: '#43291f' },
    // 사냥꾼: 금발 긴 머리 여성, 가죽 튜닉 + 초록 망토, 깃털 모자, 활·화살통
    hunter: { y: '#fff0a8', h: '#f4d36a', H: '#c9a23a', D: '#8e6e1e', f: '#8fdc8a', e: '#4caa5a', E: '#2a6e38',
      g: '#c99a62', G: '#9a6c3c', d: '#674421', n: '#e2c27e', b: '#4a2e17', B: '#e0b84e', u: '#7a5230', U: '#4a2e17',
      c: '#6fae5a', C: '#46803a', K: '#2c5626', z: '#5f9a4a', Z: '#3a6a30', r: '#e04848', a: '#f5efe0',
      p: '#9a6a3e', P: '#62401f', w: '#b07a42', q: '#734a22' },
    // 도적: 두건·복면, 짙은 보라 가죽, 쌍단검(머리는 두건에 가려 거의 안 보임)
    rogue: { y: '#7a7088', h: '#4e465c', H: '#363044', D: '#221d2c', f: '#ffd36a', e: '#e0a020', E: '#8a5a10',
      g: '#7d779a', G: '#58527a', d: '#3a3554', n: '#b3a6ea', b: '#2a2234', B: '#d8d8e6', u: '#58527a', U: '#34304a',
      c: '#5a4a7e', C: '#40345e', K: '#2a2240', z: '#625888', Z: '#3c355a', r: '#d24a5a', R: '#8e2a3a' },
    // 마검사: 은청색 긴 머리 여성, 사슬 갑옷 + 남색 망토, 푸르게 빛나는 마검
    spellblade: { y: '#f0f6ff', h: '#c4d6f0', H: '#8ea6cc', D: '#5c7099', f: '#9ff0ff', e: '#3fb6e0', E: '#1f6e90',
      g: '#c9d1da', G: '#8b96a4', d: '#56606e', n: '#7fd4ff', b: '#3a3550', B: '#7fd4ff', u: '#5a5f78', U: '#363a50',
      c: '#4f6cc4', C: '#33489a', K: '#212f6a' },
    // 무투가: 검은 짧은 머리 남성 + 상투·붉은 머리띠, 주황 무투복 + 검은 띠, 쇠 너클
    monk: { y: '#6a5a5a', h: '#3a2e2e', H: '#261c1c', D: '#140e0e', f: '#c9945a', e: '#8a5a2e', E: '#4a2e14',
      g: '#ffc46a', G: '#e98a2e', d: '#a85a16', n: '#fff1d0', b: '#262020', B: '#262020', u: '#f1e6cc', U: '#c2ae88',
      s: '#f2c49a', S: '#d4996c', r: '#d83a3a', w: '#ffd86a', q: '#b8862a', i: '#fff8d8' },
    merchant: { y: '#5a5a5a', h: '#3a3a3a', H: '#262626', D: '#161616', e: '#6b4426', E: '#3b2316', f: '#8a5a3a', g: '#f7f0dc', G: '#d7cbae', d: '#ab9f82', n: '#c9b27a', c: '#c9533f', C: '#95392d', K: '#66261e', a: '#fbf4e2', A: '#cfc3a6' },
  };
  const NPC_OPTS = {
    villagerA: { hair: 'short' },
    villagerB: { hair: 'long', cape: false },
    villagerC: { hair: 'long' },
    villagerD: { hair: 'short', hat: 'straw', cape: false },
    villagerE: { hair: 'long', hat: 'kerchief', cape: false },
    child: { small: true, hair: 'short' },
    knight: { hat: 'helmet' },
    priest: { hat: 'circlet', robe: true },
    smith: { hair: 'short', hat: 'headband', apron: true, beard: true, cape: false },
    merchant: { hat: 'bandana', apron: true, cape: false },
    warrior: { hair: 'short', hat: 'horned', cape: false, pauldrons: true, tabard: true, weapon: 'sword', shield: true },
    mage: { hair: 'long', hat: 'wizard', robe: true, cape: false, staff: true, staffMap: MAGE_STAFF },
    hunter: { hair: 'long', hat: 'feather', weapon: 'bow', quiver: true },
    rogue: { hat: 'hood', mask: true, weapon: 'daggers' },
    spellblade: { hair: 'long', mail: true, weapon: 'runeblade' },
    monk: { hair: 'short', hat: 'topknot', cape: false, weapon: 'knuckles' },
  };

  const cache = {};
  function get(kind) {
    if (cache[kind]) return cache[kind];
    let s;
    if (kind === 'player') s = buildCharacter({}, { staff: true, crown: true });
    else s = buildCharacter(NPC_PALETTES[kind] || {}, Object.assign({ crown: false, staff: false }, NPC_OPTS[kind] || {}));
    cache[kind] = s;
    return s;
  }

  return { get, buildCharacter, NPC_PALETTES, NPC_OPTS, PLAYER_PAL };
})();
if (typeof module !== 'undefined') module.exports = Sprites;
