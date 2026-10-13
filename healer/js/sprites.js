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
    const pal = Object.assign({}, PLAYER_PAL, palette || {});
    const crown = !!opts.crown;
    const staff = !!opts.staff;
    const small = !!opts.small;
    const cape = opts.cape !== false;
    const hat = opts.hat || null;
    const hair = opts.hair || 'bob';
    const apron = !!opts.apron, beard = !!opts.beard, robe = !!opts.robe;

    // 아이: 머리 2행·몸통 2행·다리 2행 줄이기
    const headH = HEAD_H - (small ? 2 : 0);
    const torsoH = TORSO_H - (small ? 2 : 0);
    const tunicD = small ? dropRows(TUNIC_DOWN, [5, 6]) : TUNIC_DOWN;
    const tunicU = small ? dropRows(TUNIC_UP, [5, 6]) : TUNIC_UP;
    const tunicR = small ? dropRows(TUNIC_RIGHT, [5, 6]) : TUNIC_RIGHT;
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
      return parts;
    }

    function frameDown(legs, bob, armL, armR, hem, tip) {
      const y = by - bob;
      const parts = [];
      if (staff) parts.push([STAFF, 1, y - 1]);
      if (!robe) parts.push([legs, BX, y + legY]);
      parts.push([tunicD, BX, y + headH]);
      if (robe) { parts.push([ROBE_DOWN, BX, y + robeY]); if (tip) parts.push([tip, BX, y + robeY + 7]); }
      if (cape) {
        parts.push([CAPE_DOWN, BX, y + headH]);
        if (hem === 'L') parts.push([CAPE_HEM_DOWN_L, BX, y + hemDownY]);
        if (hem === 'R') parts.push([CAPE_HEM_DOWN_R, BX, y + hemDownY]);
      }
      if (apron) parts.push([APRON_DOWN, BX, y + headH + 2]);
      if (staff) parts.push([ARM_STAFF_DOWN, BX, y + armY + armL]);
      else parts.push([ARM_FRONT, BX + 2, y + armY + armL]);
      parts.push([ARM_FRONT, BX + 17, y + armY + armR]);
      parts.push([headD, hx, y]);
      parts.push(...hairParts('down', y));
      if (beard) parts.push([BEARD_DOWN, BX, y + 14]);
      if (crown) parts.push([CROWN_DOWN, BX, y + 2]);
      parts.push(...hatParts('down', y));
      return compose(parts, pal);
    }
    function frameUp(legs, bob, armL, armR, hem, tip) {
      const y = by - bob;
      const parts = [];
      if (!robe) parts.push([legs, BX, y + legY]);
      parts.push([tunicU, BX, y + headH]);
      if (robe) { parts.push([ROBE_UP, BX, y + robeY]); if (tip) parts.push([tip, BX, y + robeY + 7]); }
      if (cape) {
        parts.push([capeU, BX, y + headH]);
        if (hem === 'L') parts.push([CAPE_HEM_UP_L, BX, y + hemUpY]);
        if (hem === 'R') parts.push([CAPE_HEM_UP_R, BX, y + hemUpY]);
      }
      const arm = cape ? ARM_BACK : ARM_BACK_NOCAPE;
      parts.push([arm, BX + 2, y + armY + armL]);
      parts.push([arm, BX + 17, y + armY + armR]);
      parts.push([headU, hx, y]);
      parts.push(...hairParts('up', y));
      if (crown) parts.push([CROWN_DOWN, BX, y + 2]);
      parts.push(...hatParts('up', y));
      if (staff) parts.push([STAFF, BX + 18, y - 1]);
      return compose(parts, pal);
    }
    function frameRight(legs, bob, arm, fly, tip) {
      const y = by - bob;
      const parts = [];
      if (fly && cape) parts.push([CAPE_FLY_RIGHT, BX, y + headH + 3]);
      if (!robe) parts.push([legs, BX, y + legY]);
      parts.push([tunicR, BX, y + headH]);
      if (robe) { parts.push([ROBE_RIGHT, BX, y + robeY]); if (tip) parts.push([tip, BX, y + robeY + 7]); }
      if (cape) parts.push([capeR, BX, y + headH]);
      if (apron) parts.push([APRON_RIGHT, BX, y + headH + 2]);
      if (!staff) parts.push([ARM_SIDE, BX + 12 + arm, y + armY]);
      parts.push([headR, hx, y]);
      parts.push(...hairParts('right', y));
      if (beard) parts.push([BEARD_RIGHT, BX, y + 14]);
      if (crown) parts.push([CROWN_RIGHT, BX, y + 2]);
      parts.push(...hatParts('right', y));
      // 지팡이는 얼굴 앞쪽에, 손이 자루를 덮도록 팔은 지팡이 뒤에 그린다
      if (staff) { parts.push([STAFF_SIDE, 22, y - 1]); parts.push([ARM_SIDE_STAFF, BX + 14, y + armY]); }
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
