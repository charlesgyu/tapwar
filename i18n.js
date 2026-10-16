// TapWar - Internationalization Module (KO / EN)
(function () {
  const STORAGE_KEY = 'tapwar_lang';

  // 1. Language Detection & State
  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ko' || saved === 'en') return saved;
      const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
      if (navLang.startsWith('ko')) return 'ko';
    } catch (e) {}
    return 'en';
  }

  let currentLang = detectLang();

  // 2. Translations
  const I18N = {
    ko: {
      home: '← 홈',
      surrender: '항복',
      confirm: '확인',
      cancel: '취소',
      close: '닫기',
      buy: '구매하기',
      purchased: '구매 완료',
      start: '시작',
      deploy: '참전하기',
      explore: '둘러보기',
      locked: '잠김',
      maps_count: '{count}개 맵',
      maps: '맵',
      total_time: '총 시간 {time}',
      music_on: '음악 켜짐',
      music_off: '음악 꺼짐',
      sfx_on: '효과음 켜짐',
      sfx_off: '효과음 꺼짐',
      tutorial_link: '튜토리얼',
      items_link: '아이템',
      restore_link: '구매 복원',
      lang_toggle: '🌐 English',

      confirm_base_title: '본진 지정',
      confirm_base_text: '본진으로 지정하시겠습니까?',
      start_guide: '본진을 선택하세요',

      item_pick_title: '아이템 카드',
      item_pick_sub: '한 장을 고르세요. 적도 한 장을 고릅니다.',
      my_card: '내 카드',
      enemy_card: '적 카드',
      item_guide_title: '아이템 소개',
      item_guide_sub: '30초마다 한 장씩, 모두 10번 골라요. 고른 카드는 내 모든 지역에 적용되고, 확률은 지역·구슬마다 따로 굴려요. 같은 카드를 또 고르면 확률이 +10%씩 올라가요(한 카드 최대 3장, 장거리 사격은 1장).',
      item_selected_status: '[{mine}] 선택! 적은 [{theirs}]을(를) 골랐습니다.',
      item_stack_owned: '{count}장째 +{bonus}%',
      item_stack_held: '{count}장 +{bonus}%',

      tut_skip: '건너뛰기',
      tut_prev: '이전',
      tut_next: '다음',
      tut_start: '시작하기',

      victory_eyebrow: '점령 완료',
      victory_title: '점령 완료',
      victory_sub: '{name}을(를) 점령했습니다.',
      record_label: '기록',
      first_record: '첫 기록',
      new_record: '최고 기록 갱신 ↑ −{diff}',
      best_record: '최고 {time}',
      total_time_country: '{country} 총 시간 {time}',
      next_map: '다음 맵으로',
      retry: '다시 도전',
      go_home: '홈으로',
      defeat_eyebrow_surrender: '작전 중단',
      defeat_eyebrow_fallen: '본진 함락',
      defeat_sub_surrender: '스스로 항복하여 작전을 중단했습니다.',
      defeat_sub_fallen: '적의 공세에 아군의 모든 거점이 함락되었습니다.',
      defeat_record_label: '작전 진행 시간',
      defeat_tip: '전열을 가다듬고 다시 도전하세요!',

      next_concept_in: '{name} · 다음까지 {sec}초',
      next_concept_world: '{name} · 다음 컨셉까지 {sec}초',

      rank_title: '순위',
      rank_lock_sub: '모든 맵 클리어 후 참여',
      rank_sheet_title: '{name} 순위',
      rank_sheet_text: '{name}의 모든 맵({total}개)을 클리어하면 총 시간으로 전 세계 순위에 올라가요.\n순위는 앱(게임 센터)에서 볼 수 있어요. ({cleared}/{total} 클리어)',

      product_speed2_title: '2배속',
      product_speed2_text: '게임을 2배 빠르게 진행해요.\n한 번 구매하면 모든 맵에서 계속 쓸 수 있어요.',
      product_all_countries_title: '모든 나라 열기',
      product_all_countries_text: '일본·중국·미국·유럽 5개국·Earth 전선을 모두 열어요.\n한 번 구매하면 계속 플레이할 수 있어요.',
      purchase_processing: '결제 중…',
      purchase_pending: '승인 대기 중이에요',
      purchase_failed: '결제에 실패했어요. 다시 시도',
      purchase_not_native: '앱에서 구매할 수 있어요',
      purchase_complete_title: '구매 완료',
      purchase_complete_text: '{title}을(를) 쓸 수 있어요.',
      restore_title: '구매 복원',
      restore_not_native: '앱에서 사용할 수 있어요.\n같은 스토어 계정으로 산 나라·기능을 다시 열어 줍니다.',
      restore_success: '복원했어요: {names}',
      restore_none: '이 계정으로 구매한 항목이 없어요.',
      restore_fail: '복원에 실패했어요. 잠시 후 다시 시도해 주세요.',
      map_locked_title: '{name} 잠김',
      map_locked_text: '{prev} 맵을 클리어하면 열려요.',
      country_coming_soon: '곧 출시돼요.'
    },
    en: {
      home: '← HOME',
      surrender: 'SURRENDER',
      confirm: 'Confirm',
      cancel: 'Cancel',
      close: 'Close',
      buy: 'Buy',
      purchased: 'Purchased',
      start: 'START',
      deploy: 'DEPLOY',
      explore: 'EXPLORE',
      locked: 'Locked',
      maps_count: '{count} Maps',
      maps: 'Maps',
      total_time: 'Total Time {time}',
      music_on: 'Music ON',
      music_off: 'Music OFF',
      sfx_on: 'SFX ON',
      sfx_off: 'SFX OFF',
      tutorial_link: 'HOW TO PLAY',
      items_link: 'ITEMS',
      restore_link: 'RESTORE',
      lang_toggle: '🌐 한국어',

      confirm_base_title: 'Headquarters',
      confirm_base_text: 'Set as your Headquarters?',
      start_guide: 'Select your Headquarters',

      item_pick_title: 'ITEM CARDS',
      item_pick_sub: 'Pick one card. The enemy will also pick one.',
      my_card: 'YOUR CARD',
      enemy_card: 'ENEMY CARD',
      item_guide_title: 'Item Guide',
      item_guide_sub: 'Pick a card every 30 seconds (up to 10 rounds). Selected cards apply to all your regions with independent proc chances per region/orb. Stacking the same card increases proc chance by +10% (max 3 cards, Long Range max 1).',
      item_selected_status: 'Selected [{mine}]! Enemy picked [{theirs}].',
      item_stack_owned: 'Card #{count} +{bonus}%',
      item_stack_held: '{count} Cards +{bonus}%',

      tut_skip: 'Skip',
      tut_prev: 'Prev',
      tut_next: 'Next',
      tut_start: 'Start',

      victory_eyebrow: 'VICTORY',
      victory_title: 'VICTORY',
      victory_sub: 'Captured {name}.',
      record_label: 'RECORD',
      first_record: 'FIRST RECORD',
      new_record: 'NEW RECORD ↑ −{diff}',
      best_record: 'BEST {time}',
      total_time_country: '{country} Total Time: {time}',
      next_map: 'NEXT MAP',
      retry: 'RETRY',
      go_home: 'HOME',
      defeat_eyebrow_surrender: 'OPERATION ABORTED',
      defeat_eyebrow_fallen: 'DEFEATED',
      defeat_sub_surrender: 'Surrendered and aborted the operation.',
      defeat_sub_fallen: 'All friendly bases were overrun by enemy forces.',
      defeat_record_label: 'TIME ELAPSED',
      defeat_tip: 'Regroup and try again!',

      next_concept_in: '{name} · Next in {sec}s',
      next_concept_world: '{name} · Next in {sec}s',

      rank_title: 'RANK',
      rank_lock_sub: 'Clear all maps to rank',
      rank_sheet_title: '{name} Leaderboard',
      rank_sheet_text: 'Clear all {total} maps in {name} to compete on global leaderboards by total time.\nLeaderboards are available in Game Center. ({cleared}/{total} Cleared)',

      product_speed2_title: '2x Speed',
      product_speed2_text: 'Speed up gameplay by 2x.\nPermanently unlocked for all maps.',
      product_all_countries_title: 'Unlock All Countries',
      product_all_countries_text: 'Unlock Japan, China, USA, Europe, and Earth campaigns.\nPermanently unlocked.',
      purchase_processing: 'Processing…',
      purchase_pending: 'Waiting for approval…',
      purchase_failed: 'Purchase failed. Please try again.',
      purchase_not_native: 'Available in app',
      purchase_complete_title: 'Purchased',
      purchase_complete_text: '{title} is now active.',
      restore_title: 'Restore Purchases',
      restore_not_native: 'Available in app.\nRestores previously purchased campaigns & features on this account.',
      restore_success: 'Restored: {names}',
      restore_none: 'No previous purchases found for this account.',
      restore_fail: 'Restore failed. Please try again later.',
      map_locked_title: '{name} Locked',
      map_locked_text: 'Clear {prev} to unlock.',
      country_coming_soon: 'Coming soon.'
    }
  };

  // 3. Country Names
  const COUNTRIES_KO = {
    KR: '대한민국',
    JP: '일본',
    CN: '중국',
    US: '미국',
    FR: '프랑스',
    DE: '독일',
    IT: '이탈리아',
    ES: '스페인',
    GB: '영국',
    WD: 'Earth'
  };

  const COUNTRIES_EN = {
    KR: 'South Korea',
    JP: 'Japan',
    CN: 'China',
    US: 'United States',
    FR: 'France',
    DE: 'Germany',
    IT: 'Italy',
    ES: 'Spain',
    GB: 'United Kingdom',
    WD: 'Earth'
  };

  // 4. Country Concepts
  const COUNTRY_CONCEPT_KO = {
    KR: ['필사즉생', '50초마다 10초 동안 피가 깎인 지역의 공격력이 4배가 돼요'],
    JP: ['지진', '50초마다 모든 완전점령 지역이 10초 동안 공격을 멈추고 화면이 흔들려요'],
    CN: ['모래폭풍', '50초마다 모든 완전점령 지역의 공격 속도가 10초 동안 절반이 돼요'],
    US: ['자본주의 호황', '50초마다 무작위 점령 지역들의 공격력이 10초 동안 강해져요'],
    FR: ['혁명', '50초마다 10초 동안 점령 지역과 맞닿은 중립 지역이 주변을 공격해요'],
    DE: ['전차 돌파', '50초마다 전차가 지나가고, 지나간 지역은 중립이 돼요 (본진 제외)'],
    IT: ['최고의 지휘관', '본진 2개로 시작해요. 하나는 무작위 위치에 생겨요'],
    ES: ['대항해시대', '50초마다 10초 동안 모든 완전점령 지역이 1초마다 대포를 쏴요 (공격력 20)'],
    GB: ['안개', '내 지역이 아닌 곳은 모두 검게 가려지고 적의 구슬은 보이지 않아요'],
    WD: ['세계 대전', '15초부터 1분마다 나라 컨셉 2개가 무작위로 3배 효과로 일어나요. 카드는 5장 골라요']
  };

  const COUNTRY_CONCEPT_EN = {
    KR: ['Desperate Stand', 'Every 50s for 10s, damaged regions deal 4x attack power.'],
    JP: ['Earthquake', 'Every 50s for 10s, fully conquered regions cease attack and screen shakes.'],
    CN: ['Sandstorm', 'Every 50s for 10s, fully conquered regions attack at half speed.'],
    US: ['Capitalist Boom', 'Every 50s for 10s, random controlled regions gain increased attack power.'],
    FR: ['Revolution', 'Every 50s for 10s, neutral regions bordering controlled areas attack neighbors.'],
    DE: ['Panzer Assault', 'Every 50s, a tank sweeps across; traversed regions become neutral (except HQ).'],
    IT: ['Supreme Commander', 'Start with 2 HQs. One spawns in a random location.'],
    ES: ['Age of Discovery', 'Every 50s for 10s, all fully conquered regions fire cannons every 1s (Power: 20).'],
    GB: ['London Fog', 'Unowned regions are covered in dense fog and enemy orbs are hidden.'],
    WD: ['World War', 'Starting at 15s, every 1m two country events trigger with 3x effect. Pick 5 cards.']
  };

  // 5. Items (14 types)
  const ITEMS_KO = [
    { key: 'power', name: '파워샷', desc: '20% 확률로 공격력 50% 증가' },
    { key: 'crit', name: '크리티컬', desc: '10% 확률로 공격력 2배' },
    { key: 'pierce', name: '튕기기', desc: '10% 확률로 옆 상대 지역으로 한 번 더 튕김 (튕긴 곳은 기본 공격력만)' },
    { key: 'explode', name: '폭발', desc: '10% 확률로 맞힌 곳에 붙은 모든 상대 지역에 50% 피해' },
    { key: 'piercing', name: '관통샷', desc: '10% 확률로 상대의 모든 방어 효과 무시' },
    { key: 'paralyze', name: '마비', desc: '10% 확률로 맞은 상대 지역의 다음 5발 공격 속도 50% 감소' },
    { key: 'rapid', name: '속사', desc: '10% 확률로 다음 5공격을 2배 빨리 쏘고 2배 빠르게 날아감' },
    { key: 'curse', name: '저주샷', desc: '10% 확률로 맞은 상대 지역의 다음 5공격에 아이템 효과 없음' },
    { key: 'buff', name: '버프샷', desc: '10% 확률로 내 다음 5공격의 모든 아이템 효과 2배' },
    { key: 'fortress', name: '철벽', desc: '10% 확률로 상대 공격을 완전히 막고 쏜 곳으로 되돌림' },
    { key: 'absorb', name: '흡수', desc: '10% 확률로 상대 공격을 막고 그 2배만큼 회복' },
    { key: 'rebuild', name: '재건', desc: '내 지역에 쏘면 10% 확률로 회복 2배, 그때 30% 확률로 붙은 내 지역도 회복' },
    { key: 'longrange', name: '장거리 사격', desc: '모든 내 지역이 원거리 공격 가능' },
    { key: 'supply', name: '보급', desc: '10% 확률로 다음 5공격 동안 내 모든 카드 확률 +10%' }
  ];

  const ITEMS_EN = [
    { key: 'power', name: 'Power Shot', desc: '20% chance to increase attack power by 50%' },
    { key: 'crit', name: 'Critical', desc: '10% chance to double attack power' },
    { key: 'pierce', name: 'Bounce', desc: '10% chance to bounce once to an adjacent enemy region' },
    { key: 'explode', name: 'Explosion', desc: '10% chance to deal 50% damage to all adjacent enemy regions' },
    { key: 'piercing', name: 'Armor Piercing', desc: '10% chance to ignore all enemy defense effects' },
    { key: 'paralyze', name: 'Paralyze', desc: '10% chance to reduce enemy region\'s attack speed by 50% for next 5 shots' },
    { key: 'rapid', name: 'Rapid Fire', desc: '10% chance to fire next 5 attacks 2x faster with 2x orb speed' },
    { key: 'curse', name: 'Curse', desc: '10% chance to nullify item effects on hit enemy region\'s next 5 attacks' },
    { key: 'buff', name: 'Buff', desc: '10% chance to double all item effects for your next 5 attacks' },
    { key: 'fortress', name: 'Iron Wall', desc: '10% chance to block enemy attack and deflect it back' },
    { key: 'absorb', name: 'Absorb', desc: '10% chance to absorb enemy attack and recover 2x health' },
    { key: 'rebuild', name: 'Rebuild', desc: '10% chance for 2x heal on own region; 30% chance to heal adjacent friendly regions' },
    { key: 'longrange', name: 'Long Range', desc: 'All friendly regions can perform long-range attacks' },
    { key: 'supply', name: 'Supply', desc: '10% chance to grant +10% proc chance to all your cards for next 5 attacks' }
  ];

  const ITEM_CAT_KO = {
    power: '공격', crit: '공격', pierce: '공격', explode: '공격', piercing: '공격', paralyze: '공격',
    rapid: '다음 5공격', supply: '다음 5공격', buff: '다음 5공격', curse: '다음 5공격',
    fortress: '방어·회복', absorb: '방어·회복', rebuild: '방어·회복',
    longrange: '항상'
  };

  const ITEM_CAT_EN = {
    power: 'Attack', crit: 'Attack', pierce: 'Attack', explode: 'Attack', piercing: 'Attack', paralyze: 'Attack',
    rapid: 'Next 5', supply: 'Next 5', buff: 'Next 5', curse: 'Next 5',
    fortress: 'Defense', absorb: 'Defense', rebuild: 'Defense',
    longrange: 'Passive'
  };

  const ITEM_GUIDE_GROUPS_KO = [
    ['공격할 때', ['power', 'crit', 'pierce', 'explode', 'piercing', 'paralyze']],
    ['다음 5공격 동안 (터진 지역에서만)', ['rapid', 'supply', 'buff', 'curse']],
    ['막을 때 · 회복', ['fortress', 'absorb', 'rebuild']],
    ['항상 켜짐', ['longrange']]
  ];

  const ITEM_GUIDE_GROUPS_EN = [
    ['When Attacking', ['power', 'crit', 'pierce', 'explode', 'piercing', 'paralyze']],
    ['For Next 5 Attacks', ['rapid', 'supply', 'buff', 'curse']],
    ['Defense & Recovery', ['fortress', 'absorb', 'rebuild']],
    ['Passive', ['longrange']]
  ];

  // 6. Tutorial Text
  const TUTORIAL_TEXT_KO = [
    { title: '시작 지역 고르기', text: '지도를 확대·이동하며 둘러보고, 시작할 지역을 탭한 뒤 확인을 누르면 그곳이 내 기지가 돼요.' },
    { title: '자동으로 넓혀요', text: '내 지역은 붙어 있는 땅을 자동으로 공격해요. 아래에서부터 파란색이 꽉 차면 내 땅이 돼요.' },
    { title: '지정 공격', text: '내 지역을 꾹 눌러 맞닿은 곳으로 끌면 그곳을 공격해요. 내 땅으로 끌면 피를 채워 줘요.' },
    { title: '집중 포화', text: '아무 지역이나 두 번 탭하면 전선의 내 지역이 모두 그곳을 쏴요. 점령할 때까지 계속돼요.' },
    { title: '완전 점령', text: '이웃을 모두 차지하면 초록색이 되고 게이지가 차올라요. 게이지가 다 차서 진한 초록이 되면 원거리 공격이 가능해져요.' },
    { title: '적 기지를 무너뜨려요', text: '적 지역을 모두 점령하면 승리!' }
  ];

  const TUTORIAL_TEXT_EN = [
    { title: 'Choose Starting Base', text: 'Explore the map, tap a region, and confirm to establish your headquarters.' },
    { title: 'Auto Expansion', text: 'Your regions auto-attack adjacent lands. Once filled blue, the region is yours!' },
    { title: 'Targeted Attack', text: 'Press and drag from your region to an adjacent land to attack, or to your own land to reinforce.' },
    { title: 'Focus Fire', text: 'Double-tap any region to direct all frontline attacks there until captured.' },
    { title: 'Full Conquest', text: 'Surround a region completely to turn it green. Once charged, it unlocks long-range attacks!' },
    { title: 'Defeat the Enemy', text: 'Conquer all enemy regions to achieve victory!' }
  ];

  // 7. Map Labels (English Translations)
  const MAP_LABELS_EN = {
    KOREA: 'Korea (Nationwide)',
    SEOUL: 'Seoul',
    GYEONGGI: 'Gyeonggi',
    BUSAN: 'Busan',
    DAEGU: 'Daegu',
    INCHEON: 'Incheon',
    GWANGJU_JEONNAM: 'Gwangju & Jeonnam',
    DAEJEON: 'Daejeon',
    ULSAN: 'Ulsan',
    SEJONG: 'Sejong',
    GANGWON: 'Gangwon',
    CHUNGBUK: 'Chungbuk',
    CHUNGNAM: 'Chungnam',
    JEONBUK: 'Jeonbuk',
    GYEONGBUK: 'Gyeongbuk',
    GYEONGNAM: 'Gyeongnam',
    JEJU: 'Jeju',
    JP_HOKKAIDO: 'Hokkaido',
    JP_SHIKOKU: 'Shikoku',
    JP_CHUGOKU: 'Chugoku',
    JP_TOHOKU: 'Tohoku',
    JP_KANTO: 'Kanto',
    JP_KINKI: 'Kinki',
    JP_KYUSHU: 'Kyushu & Okinawa',
    JP_CHUBU: 'Chubu',
    JP_TOKYO: 'Tokyo',
    JP_JAPAN: 'Japan (Nationwide)',
    CN_DONGBEI: 'Northeast (Dongbei)',
    CN_HUAZHONG: 'Central China',
    CN_HUANAN: 'South China',
    CN_HUABEI: 'North China',
    CN_HUADONG: 'East China',
    CN_XINAN: 'Southwest China',
    CN_XIBEI: 'Northwest China',
    CN_CHINA: 'China (Nationwide)',
    US_NEWENGLAND: 'New England',
    US_MIDATLANTIC: 'Mid-Atlantic',
    US_SOUTHCENTRAL: 'South Central',
    US_PACIFIC: 'Pacific Coast',
    US_GREATLAKES: 'Great Lakes',
    US_PLAINS: 'The Plains',
    US_SOUTHWEST: 'Southwest',
    US_SOUTHATLANTIC: 'South Atlantic',
    US_MOUNTAIN: 'Rocky Mountains',
    US_USA: 'USA (Mainland)',
    FR_NORTH: 'Northern France',
    FR_WEST: 'Western France',
    FR_SOUTH: 'Southern France',
    FR_EAST: 'Eastern France',
    FR_FRANCE: 'France (Nationwide)',
    DE_NORTH: 'Northern Germany',
    DE_EAST: 'Eastern Germany',
    DE_WEST: 'Western Germany',
    DE_SOUTH: 'Southern Germany',
    DE_GERMANY: 'Germany (Nationwide)',
    IT_NORTHWEST: 'Northwest Italy',
    IT_NORTHEAST: 'Northeast Italy',
    IT_CENTER: 'Central Italy',
    IT_SOUTH: 'Southern Italy',
    IT_ISLANDS: 'Italian Islands',
    IT_ITALY: 'Italy (Nationwide)',
    ES_NORTH: 'Northern Spain',
    ES_EAST: 'Eastern Spain',
    ES_CENTER: 'Central Spain',
    ES_SOUTH: 'Southern Spain',
    ES_SPAIN: 'Spain (Nationwide)',
    GB_SOUTH: 'Southern England',
    GB_MIDDLE: 'Midlands & North',
    GB_SCOTLAND: 'Scotland',
    GB_WALESNI: 'Wales & N. Ireland',
    GB_UK: 'UK (Nationwide)',
    WD_WORLD: 'World (300 Regions)'
  };

  // 8. Public Helper Functions
  function getLang() {
    return currentLang;
  }

  function t(key, params) {
    const langDict = I18N[currentLang] || I18N.en;
    let str = langDict[key] || (I18N.ko && I18N.ko[key]) || key;
    if (params) {
      Object.keys(params).forEach(k => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
      });
    }
    return str;
  }

  function getCountryName(key) {
    if (currentLang === 'en') return COUNTRIES_EN[key] || key;
    return COUNTRIES_KO[key] || (window.COUNTRIES && window.COUNTRIES.find(x => x.key === key)?.name) || key;
  }

  function getCountryConcept(key) {
    return (currentLang === 'en' ? COUNTRY_CONCEPT_EN[key] : COUNTRY_CONCEPT_KO[key]) || COUNTRY_CONCEPT_KO[key] || null;
  }

  function getItems() {
    return currentLang === 'en' ? ITEMS_EN : ITEMS_KO;
  }

  function getItemCat(key) {
    return (currentLang === 'en' ? ITEM_CAT_EN[key] : ITEM_CAT_KO[key]) || '';
  }

  function getItemGuideGroups() {
    return currentLang === 'en' ? ITEM_GUIDE_GROUPS_EN : ITEM_GUIDE_GROUPS_KO;
  }

  function getTutorialText(index) {
    const list = currentLang === 'en' ? TUTORIAL_TEXT_EN : TUTORIAL_TEXT_KO;
    return list[index] || list[0];
  }

  function getMapLabel(key) {
    if (currentLang === 'en' && MAP_LABELS_EN[key]) return MAP_LABELS_EN[key];
    if (window.MAP_CONFIGS && window.MAP_CONFIGS[key]) {
      return window.MAP_CONFIGS[key].label || window.MAP_CONFIGS[key].name || key;
    }
    return key;
  }

  function updateDomTexts() {
    document.documentElement.lang = currentLang;

    // Fixed Buttons & Links
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) homeBtn.textContent = t('home');

    const surrenderBtn = document.getElementById('surrender-btn');
    if (surrenderBtn) surrenderBtn.textContent = t('surrender');

    const langBtn = document.getElementById('lang-btn');
    if (langBtn) langBtn.textContent = t('lang_toggle');

    const tutLink = document.getElementById('link-tut');
    if (tutLink) tutLink.textContent = t('tutorial_link');

    const itemsLink = document.getElementById('link-items');
    if (itemsLink) itemsLink.textContent = t('items_link');

    const restoreLink = document.getElementById('link-restore');
    if (restoreLink) restoreLink.textContent = t('restore_link');

    // Confirm Base Modal
    const confirmBaseCard = document.getElementById('confirm-base');
    if (confirmBaseCard && typeof confirmBaseCard.querySelector === 'function') {
      const p = confirmBaseCard.querySelector('.sheet-text');
      if (p) p.textContent = t('confirm_base_text');
      const prev = confirmBaseCard.querySelector('.tut-prev');
      if (prev) prev.textContent = t('cancel');
      const next = confirmBaseCard.querySelector('.tut-next');
      if (next) next.textContent = t('confirm');
    }

    // Item Selection Modal Title
    const itemPickSub = document.querySelector('.item-pick-sub');
    if (itemPickSub) itemPickSub.textContent = t('item_pick_sub');

    // Tutorial Card Fixed Buttons
    const tutSkip = document.querySelector('.tut-skip');
    if (tutSkip) tutSkip.textContent = t('tut_skip');
    const tutPrev = document.getElementById('tut-prev');
    if (tutPrev) tutPrev.textContent = t('tut_prev');

    // End Modal Fixed Buttons
    const endHomeBtn = document.getElementById('end-home-btn');
    if (endHomeBtn) endHomeBtn.textContent = t('go_home');
    const endNextBtn = document.getElementById('end-next-btn');
    if (endNextBtn) endNextBtn.textContent = t('next_map');
    const endRetryBtn = document.getElementById('end-retry-btn');
    if (endRetryBtn) endRetryBtn.textContent = t('retry');

    // Audio Buttons
    if (window.Sound && typeof window.Sound.refreshButtons === 'function') {
      window.Sound.refreshButtons();
    }
  }

  function setLang(lang) {
    if (lang !== 'ko' && lang !== 'en') return;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    updateDomTexts();

    // Trigger in-game re-renders if available
    if (typeof window.buildCountryCards === 'function') window.buildCountryCards();
    if (typeof window.selectCountry === 'function') window.selectCountry(window.selectedCountryKey || 'KR');
    if (typeof window.updateStartBtn === 'function') window.updateStartBtn();
    if (typeof window.buildStageCards === 'function') window.buildStageCards();
    if (typeof window.updateStageProgress === 'function') window.updateStageProgress();
    if (typeof window.renderTutorial === 'function' && document.getElementById('tutorial') && document.getElementById('tutorial').style.display !== 'none') {
      window.renderTutorial();
    }
    if (typeof window.openItemGuide === 'function' && document.getElementById('item-guide') && document.getElementById('item-guide').style.display !== 'none') {
      window.openItemGuide();
    }
    if (typeof window.renderItemBar === 'function') window.renderItemBar();
  }

  function toggleLang() {
    setLang(currentLang === 'ko' ? 'en' : 'ko');
  }

  // Export to window
  window.I18N = I18N;
  window.getLang = getLang;
  window.setLang = setLang;
  window.toggleLang = toggleLang;
  window.t = t;
  window.getCountryName = getCountryName;
  window.getCountryConcept = getCountryConcept;
  window.getItems = getItems;
  window.getItemCat = getItemCat;
  window.getItemGuideGroups = getItemGuideGroups;
  window.getTutorialText = getTutorialText;
  window.getMapLabel = getMapLabel;
  window.updateDomTexts = updateDomTexts;

  document.addEventListener('DOMContentLoaded', () => {
    updateDomTexts();
  });
})();
