// 구인구직 게시판 — 모험가 사무소의 파티 모집 시장 (DOM 없음)
// 1) 시장 모집글: 현실 시간 3분 버킷(+날짜·진행도) 시드로 결정적으로 만든 뒤, tick 마다 자리 채움·마감·새 글 등록이 일어나는 "살아 있는" 목록.
// 2) 지원: 힐러 자리가 있는 글에 지원 → 2~6초 검토 → 레벨이 맞으면 높은 확률로 합류(G.party 를 그 파티로 교체, 원래 파티는 보관 후 복귀).
// 3) 모집 등록: 층·역할 칸을 쌓아 게시료를 내고 리더가 된다 → 지원자가 시간차로 도착 → 수락/거절 → 마감하면 그 파티로 출발.
// 합류/모집 파티는 그 층 한 판(돌파·전멸·귀환)이 끝나면 해산된다(Floor.leave → Recruit.finishRun).
const Recruit = (() => {
  const BUCKET_MS = 180000;              // 시장 재생성 주기(현실 3분)
  const CHURN_MS = 4000;                 // 이 간격마다 시장이 한 번 움직인다(자리 채움·새 글)
  const MAX_CHURN_STEPS = 8;             // 오래 비웠다 돌아와도 한 번에 이만큼만 움직인다
  const MIN_POSTS = 10, MAX_POSTS = 16, BASE_POSTS = 13;
  const MIN_HEALER_POSTS = 3;            // 지원할 수 있는(층 열림·레벨 맞음) 힐러 모집글 최소 수
  const POST_TTL = 12 * 60000;           // 12분 지나도 안 찬 글은 내려간다
  const FULL_LINGER = 2500;              // "모집 완료" 도장을 보여 주는 시간
  const APPLY_DELAY = [2000, 6000];      // 지원 검토 시간
  const APPLICANT_GAP = [3000, 10000];   // 내 모집글에 지원자가 오는 간격
  const MAX_APPLICANTS = 5;              // 대기 지원자 최대
  const FEE_MIN = 400, FEE_BASE = 150, FEE_PER_FLOOR = 60;   // 게시료 = max(400, 칸 수 × (150 + 60×층))
  const REFUND = 0.5;                    // 모집 취소 시 게시료 환불 비율
  const ROLES = ['tank', 'melee', 'ranged', 'healer'];
  const ROLE_CLASSES = { tank: ['warrior', 'monk'], melee: ['rogue', 'spellblade', 'warrior', 'monk'], ranged: ['mage', 'hunter'], healer: ['priest'] };
  const ROLE_SHORT = { tank: '탱커', melee: '근딜', ranged: '원딜', healer: '힐러' };
  const TAGS = ['초보환영', '빡겜', '친목', '보스만', '파밍'];

  const hasParty = () => typeof Party !== 'undefined';
  const hasFloors = () => typeof Floors !== 'undefined' && !!Floors.get;
  const emit = (name, payload) => { if (typeof Events !== 'undefined') Events.emit(name, payload); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const MAX = () => (hasParty() ? Party.MAX : 4);
  const FLOOR_COUNT = () => (typeof Floors !== 'undefined' && Floors.COUNT) || 10;

  // ---------------- 상태 ----------------
  function ensure(G) {
    const r = G.recruit || (G.recruit = {});
    if (!r.market || typeof r.market !== 'object') r.market = null;
    if (!r.applied || typeof r.applied !== 'object') r.applied = {};
    if (!Array.isArray(r.history)) r.history = [];
    if (r.pending === undefined) r.pending = null;
    if (r.joined === undefined) r.joined = null;
    if (r.posting === undefined) r.posting = null;
    if (r.leading === undefined) r.leading = null;
    return r;
  }
  const bucketOf = (now) => Math.floor((now == null ? Date.now() : now) / BUCKET_MS);
  const playerLevel = (G) => (G.player && G.player.level) || 1;
  const highest = (G) => (G.tower && G.tower.highestCleared) || 0;
  const maxOpen = (G) => Math.min(FLOOR_COUNT(), highest(G) + 1);
  function floorInfo(f) {
    const d = hasFloors() ? Floors.get(f) : null;
    const boss = d && d.boss && typeof Monsters !== 'undefined' && Monsters.get(d.boss) ? Monsters.get(d.boss).name : null;
    return { floor: f, name: (d && d.name) || `${f}층`, levelRange: (d && d.levelRange) || [Math.max(1, f * 2 - 1), f * 2 + 1], boss: boss || '층 보스', biome: (d && d.biome) || (f >= 6 ? 'cave' : 'forest') };
  }
  // 이 층 파티원 레벨 기준(권장 범위)
  const recommended = (f) => floorInfo(f).levelRange;

  // 게시료: 시작 골드 300 으로는 한 칸짜리도 못 올린다(처음엔 남의 파티에 지원하며 시작)
  function feeFor(floor, slotCount) {
    const n = Math.max(1, slotCount | 0);
    return Math.max(FEE_MIN, n * (FEE_BASE + FEE_PER_FLOOR * Math.max(1, floor | 0)));
  }
  const slotTotal = (slots) => ROLES.reduce((a, r) => a + ((slots && slots[r]) || 0), 0);
  const emptySlots = () => ({ tank: 0, melee: 0, ranged: 0, healer: 0 });

  // "방금 전 / 3분 전"
  function ago(ms, now) {
    const s = Math.max(0, Math.floor(((now == null ? Date.now() : now) - ms) / 1000));
    if (s < 60) return '방금 전';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    return `${Math.floor(s / 3600)}시간 전`;
  }

  // ---------------- 모집글 만들기 ----------------
  function pickFloor(rng, open) {
    const items = [];
    for (let f = 1; f <= FLOOR_COUNT(); f++) {
      const d = f - open;
      const w = d === 0 ? 40 : d === -1 ? 22 : d === 1 ? 12 : d === -2 ? 10 : d === 2 ? 5 : d < 0 ? 3 : 1;
      items.push({ f, weight: w });
    }
    return rng.weighted(items).f;
  }
  function pickTags(rng, floor) {
    const n = rng.chance(0.35) ? 2 : 1;
    const pool = TAGS.slice();
    if (floor <= 2) pool.push('초보환영', '초보환영');
    const out = [];
    while (out.length < n) { const t = rng.pick(pool); if (!out.includes(t) && !(t === '초보환영' && out.includes('빡겜')) && !(t === '빡겜' && out.includes('초보환영'))) out.push(t); }
    return out;
  }
  function needText(slots) {
    const parts = ROLES.filter((r) => slots[r] > 0).map((r) => ROLE_SHORT[r] + (slots[r] > 1 ? ` ${slots[r]}` : ''));
    return parts.join('·');
  }
  // 제목 — 층·보스·태그·필요한 자리로 조합한 말투 다양한 글
  const TITLES_HEALER = [
    (c) => `${c.f}층 ${c.boss} 잡으실 힐러님 구해요!${c.tag('초보환영') ? ' 초보 환영' : ''}`,
    (c) => `[${c.f}층] 힐러님 한 분만 오시면 바로 출발합니다`,
    (c) => `${c.fname} ${c.tag('파밍') ? '파밍팟' : '돌파팟'} 힐러님 모십니다 🙏`,
    (c) => `힐러 급구!! ${c.f}층 ${c.tag('보스만') ? '보스만 잡고 빠져요' : '같이 가요'}`,
    (c) => `${c.tag('친목') ? '친목팟 ' : ''}${c.f}층 힐러님 찾아요~ 분위기 좋아요`,
    (c) => `${c.f}층 클리어 목표! 힐 잘 주시는 분 (${c.need})`,
    (c) => `초보끼리 ${c.f}층 도전해요, 힐러님 환영 ㅎㅎ`,
    (c) => `${c.f}층 ${c.tag('빡겜') ? '기록 단축 빡겜' : '천천히 가는 팟'} · ${c.need} 구함`,
    (c) => `사제님 계신가요? ${c.fname} 같이 가요`,
    (c) => `${c.boss} 트라이 ${c.n}트째… 힐러님 도와주세요 ㅠ`,
  ];
  const TITLES_OTHER = [
    (c) => `${c.f}층 ${c.need} 구합니다 (힐러 있음)`,
    (c) => `[${c.f}층] ${c.need} 한 자리! 바로 출발`,
    (c) => `${c.fname} ${c.tag('파밍') ? '파밍' : '돌파'} ${c.need} 모집`,
    (c) => `${c.f}층 ${c.boss} 잡으러 가요 · ${c.need} 오세요`,
    (c) => `${c.tag('친목') ? '친목팟 ' : ''}${c.need} 구해요~ ${c.f}층`,
    (c) => `${c.need} 급구 ${c.f}층 ${c.tag('빡겜') ? '숙련자만' : '아무나 환영'}`,
  ];
  function makeTitle(rng, floor, tags, slots, seekHealer) {
    const fi = floorInfo(floor);
    const c = { f: floor, fname: fi.name, boss: fi.boss, need: needText(slots), n: rng.int(2, 9), tag: (t) => tags.includes(t) };
    return rng.pick(seekHealer ? TITLES_HEALER : TITLES_OTHER)(c);
  }
  const NPC_LINES = ['딜은 자신 있어요!', '힐만 잘 받으면 안 죽어요 ㅎㅎ', '경험치 나눠요~', '보스 패턴 다 알아요', '물약 넉넉히 챙겼어요', '오늘 처음이에요 잘 부탁드려요', '말 안 하고 열심히 할게요', '지각 안 해요!'];

  function member(rng, role, lo, hi, opts = {}) {
    const lv = clamp(rng.int(lo, hi), 1, 40);
    if (!hasParty()) return { uid: 'n' + rng.int(1, 1e9), name: '모험가', cls: ROLE_CLASSES[role][0], role, level: lv, hp: 100, mp: 50, buffs: [], curses: [] };
    return Party.generateMember(rng, lv, Object.assign({ cls: rng.pick(ROLE_CLASSES[role]), role }, opts));
  }

  // o: { id, createdAt, floor?, seekHealer?, fitLevel? }
  function makePost(rng, G, o) {
    const open = maxOpen(G), L = playerLevel(G);
    const floor = clamp(o.floor || pickFloor(rng, open), 1, FLOOR_COUNT());
    const tags = pickTags(rng, floor);
    let [lo, hi] = recommended(floor);
    if (tags.includes('초보환영')) lo = Math.max(1, lo - 2);
    if (tags.includes('빡겜')) { lo = Math.max(1, hi - 1); hi += 2; }
    if (o.fitLevel) { lo = Math.min(lo, L); hi = Math.max(hi, L); }
    const seekHealer = o.seekHealer != null ? !!o.seekHealer : rng.chance(0.55);
    // 구성: 파티원 + 빈 자리 = 3~5 (힐러 자리는 플레이어가 들어가므로 합류 후 파티원 ≤ 4)
    const total = rng.int(3, 5);
    const others = [];
    for (let i = 0; i < total - 2; i++) others.push(rng.pick(['melee', 'ranged', 'melee', 'ranged', 'tank']));
    const full = ['tank'].concat(others);
    const slots = emptySlots();
    let memberRoles;
    if (seekHealer) {
      slots.healer = 1;
      const extraOpen = rng.chance(0.4) ? rng.int(1, Math.min(2, full.length - 1)) : 0;
      const order = rng.shuffle(full.map((r, i) => i));
      const openIdx = new Set(order.slice(0, extraOpen));
      memberRoles = full.filter((r, i) => !openIdx.has(i));
      for (const i of openIdx) slots[full[i]]++;
    } else {
      // 힐러는 이미 있고(NPC 사제) 딜러/탱커를 구하는 글 — 플레이어는 지원 불가(시장이 붐비는 느낌용)
      const openN = rng.int(1, Math.min(2, full.length));
      const order = rng.shuffle(full.map((r, i) => i));
      const openIdx = new Set(order.slice(0, openN));
      memberRoles = ['healer'].concat(full.filter((r, i) => !openIdx.has(i)));
      for (const i of openIdx) slots[full[i]]++;
    }
    if (!memberRoles.length) { memberRoles = [full[0]]; slots[full[0]] = Math.max(0, slots[full[0]] - 1); }
    // 리더는 탱커/딜러가 먼저(힐러가 리더인 글은 어색하다), 레벨은 범위 위쪽
    memberRoles.sort((a, b) => (a === 'healer') - (b === 'healer'));
    const members = memberRoles.map((role, i) => member(rng, role, i === 0 ? Math.max(lo, hi - 1) : lo, hi));
    const fi = floorInfo(floor);
    const bonusGold = Math.round((60 + 45 * floor) * (tags.includes('보스만') ? 1.3 : 1) * (tags.includes('빡겜') ? 1.2 : 1) * rng.float(0.85, 1.2) / 5) * 5;
    return {
      id: o.id, floor, floorName: fi.name, title: makeTitle(rng, floor, tags, slots, seekHealer), tags, levelRange: [lo, hi],
      leader: members[0], members, slots, size: members.length + slotTotal(slots), bonusGold,
      createdAt: o.createdAt, state: 'open', fullAt: null, quote: rng.pick(NPC_LINES),
    };
  }

  const healerOpen = (p) => p.state === 'open' && (p.slots.healer || 0) > 0;
  // 플레이어가 지원해 볼 만한 글(층이 열려 있고 레벨이 범위 안이거나 위)
  const fits = (G, p) => healerOpen(p) && p.floor <= maxOpen(G) && playerLevel(G) >= p.levelRange[0];

  // 버킷의 기본 시장(순수 함수: 같은 버킷·날짜·진행도·레벨이면 같은 글)
  function generate(G, bucket) {
    const L = playerLevel(G);
    const rng = RNG.make(RNG.hash(`recruit:${bucket}:${G.day || 1}:${highest(G)}:${L}`));
    const start = bucket * BUCKET_MS;
    const posts = [];
    for (let i = 0; i < BASE_POSTS; i++) {
      // 시간은 버킷 시작 기준 0~9분 전에 흩어 놓는다("방금 전 ~ 9분 전")
      const createdAt = start - rng.int(0, 9) * 60000 - rng.int(0, 59) * 1000;
      posts.push(makePost(rng, G, { id: `rp${bucket}_${i}`, createdAt }));
    }
    // 지원할 수 있는 힐러 모집글을 늘 몇 개는 보장(초반 플레이어의 주 진입로)
    let k = 0;
    while (posts.filter((p) => fits(G, p)).length < MIN_HEALER_POSTS && k < 6) {
      const f = clamp(maxOpen(G) - (k % 2), 1, maxOpen(G));
      const p = makePost(rng, G, { id: `rp${bucket}_f${k}`, createdAt: start - rng.int(0, 4) * 60000 - rng.int(0, 59) * 1000, floor: f, seekHealer: true, fitLevel: true });
      // 덜 중요한 글(힐러 자리 없는 글)을 갈아 끼운다
      const idx = posts.findIndex((q) => !healerOpen(q));
      if (idx >= 0) posts[idx] = p; else posts.push(p);
      k++;
    }
    posts.sort((a, b) => b.createdAt - a.createdAt);
    return posts;
  }

  // ---------------- 시장 ----------------
  function market(G, now) {
    now = now == null ? Date.now() : now;
    const r = ensure(G), bucket = bucketOf(now);
    if (!r.market || r.market.bucket !== bucket) {
      const keep = r.market && r.pending ? r.market.posts.filter((p) => p.id === r.pending.postId) : [];
      const posts = generate(G, bucket);
      for (const p of keep) if (!posts.some((q) => q.id === p.id)) posts.unshift(p);
      r.market = { bucket, posts, lastTick: now, churn: 0, matched: (r.market && r.market.matched) || 0, seq: 0, day: dayKey(now) };
      r.applied = {};
    }
    if (r.market.day !== dayKey(now)) { r.market.day = dayKey(now); r.market.matched = 0; }
    return r.market;
  }
  const dayKey = (now) => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  function posts(G, now) { return market(G, now).posts; }
  function find(G, postId, now) { return posts(G, now).find((p) => p.id === postId) || null; }
  // 머리줄 숫자: 실시간 모집글 수 · 오늘 매칭 건수(하루 흐름에 따라 늘어나는 기본값 + 실제 체결)
  function counters(G, now) {
    now = now == null ? Date.now() : now;
    const m = market(G, now), d = new Date(now);
    const mins = d.getHours() * 60 + d.getMinutes();
    return { live: m.posts.filter((p) => p.state === 'open').length, matchedToday: 23 + Math.floor(mins / 7) + (m.matched || 0) };
  }

  function fillOne(rng, p, role) {
    const [lo, hi] = p.levelRange;
    p.members.push(member(rng, role, lo, hi));
    p.slots[role]--;
    if (slotTotal(p.slots) <= 0) return true;
    return false;
  }
  function markFull(m, p, now) { p.state = 'full'; p.fullAt = now; m.matched = (m.matched || 0) + 1; }

  // 시장 한 걸음: 마감 글 정리 → 자리 하나 채우기 → 새 글
  function churnStep(G, m, now, out) {
    const r = ensure(G);
    const rng = RNG.make(RNG.hash(`recruit-churn:${m.bucket}:${m.churn++}`));
    const pendingId = r.pending && r.pending.postId;
    // 정리
    m.posts = m.posts.filter((p) => {
      if (p.id === pendingId) return true;
      const gone = (p.state === 'full' && now - (p.fullAt || 0) >= FULL_LINGER) || (p.state === 'open' && now - p.createdAt > POST_TTL);
      if (gone) out.push({ type: 'removed', id: p.id });
      return !gone;
    });
    // 자리 채우기(다른 모험가가 먼저 들어감) — 지원 검토 중인 글은 건드리지 않는다
    const openPosts = m.posts.filter((p) => p.state === 'open' && p.id !== pendingId);
    if (openPosts.length && rng.chance(0.55)) {
      const p = rng.pick(openPosts);
      const roles = ROLES.filter((x) => p.slots[x] > 0);
      if (roles.length) {
        const role = rng.pick(roles);
        const done = fillOne(rng, p, role);
        out.push({ type: 'slot_filled', id: p.id, role, member: p.members[p.members.length - 1] });
        if (done) { markFull(m, p, now); out.push({ type: 'post_full', id: p.id }); }
      }
    }
    // 새 글
    const openCount = m.posts.filter((p) => p.state === 'open').length;
    if (m.posts.length < MAX_POSTS && (openCount < MIN_POSTS || rng.chance(0.4))) {
      const needHealer = m.posts.filter((p) => fits(G, p)).length < MIN_HEALER_POSTS;
      const p = makePost(rng, G, { id: `rp${m.bucket}_n${m.seq = (m.seq || 0) + 1}`, createdAt: now, seekHealer: needHealer ? true : undefined, fitLevel: needHealer, floor: needHealer ? maxOpen(G) : undefined });
      m.posts.unshift(p);
      out.push({ type: 'post_new', id: p.id });
    }
  }

  // 지원 검토 결과 처리
  function resolvePending(G, now, out) {
    const r = ensure(G), pd = r.pending;
    if (!pd || now < pd.decideAt) return;
    r.pending = null;
    const p = find(G, pd.postId, now);
    let res;
    if (!p || p.state !== 'open') res = { ok: false, reason: 'gone' };
    else if (!(p.slots.healer > 0)) res = { ok: false, reason: 'taken' };
    else if (!pd.accepted) { r.applied[p.id] = 'rejected'; res = { ok: false, reason: pd.reason || 'rejected' }; }
    else res = join(G, p, pd.bonusMult, now);
    out.push(Object.assign({ type: 'apply_result', id: pd.postId, title: p ? p.title : '', leaderName: p ? p.leader.name : '' }, res));
    emit('recruit_apply_result', Object.assign({ postId: pd.postId }, res));
  }

  // 내 모집글에 지원자 도착
  function applicantStep(G, now, out) {
    const ps = ensure(G).posting;
    if (!ps) return;
    let guard = 0;
    while (now >= ps.nextAt && guard++ < 3) {
      const rng = RNG.make(RNG.hash(`recruit-app:${ps.createdAt}:${ps.seq}`));
      ps.nextAt += rng.int(APPLICANT_GAP[0], APPLICANT_GAP[1]);
      if (ps.nextAt < now - APPLICANT_GAP[1]) ps.nextAt = now + rng.int(APPLICANT_GAP[0], APPLICANT_GAP[1]);
      const need = remainingNeed(ps);
      const roles = ROLES.filter((x) => need[x] > 0);
      if (!roles.length || ps.applicants.length >= MAX_APPLICANTS) continue;
      // 이미 대기 중인 지원자가 필요 수보다 많은 역할은 덜 뽑는다(그래도 고를 여지는 남긴다)
      const waiting = (role) => ps.applicants.filter((a) => a.member.role === role).length;
      const pool = roles.filter((x) => waiting(x) <= need[x]);
      const role = rng.pick(pool.length ? pool : roles);
      const [lo, hi] = recommended(ps.floor);
      const m = member(rng, role, Math.max(1, lo - 1), hi + 1);
      const a = { id: `ap${ps.seq++}`, member: m, at: now, msg: rng.pick(APPLY_LINES[role]) };
      ps.applicants.push(a);
      out.push({ type: 'applicant', id: a.id, role, name: m.name, level: m.level });
      emit('recruit_applicant', { id: a.id, role, name: m.name });
    }
  }
  const APPLY_LINES = {
    tank: ['어그로 하나는 자신 있습니다!', '방패 새로 맞췄어요. 맞는 건 제가 할게요', '탱 3년차입니다 잘 부탁드려요', '앞은 제가 막을게요!'],
    melee: ['딜 1등 해 볼게요', '보스 뒤 잡는 거 자신 있어요', '근딜인데 힐 많이 안 먹어요 ㅎㅎ', '칼 갈고 왔습니다'],
    ranged: ['멀리서 꾸준히 넣을게요', '장판 잘 피해요!', '원딜 구하신다길래 왔어요', '마나 물약 챙겼습니다'],
    healer: ['보조 힐 맡을게요', '해제는 제가 할게요!', '힐러 둘이면 든든하죠', '기도문 다 외워 왔어요'],
  };
  function remainingNeed(ps) {
    const need = Object.assign(emptySlots(), ps.slots);
    for (const m of ps.accepted) need[m.role] = Math.max(0, (need[m.role] || 0) - 1);
    return need;
  }

  // 매 프레임/초마다 불러도 된다. 반환 { events: [...] }
  function tick(G, now) {
    now = now == null ? Date.now() : now;
    const r = ensure(G), m = market(G, now);
    const out = [];
    let steps = Math.floor((now - m.lastTick) / CHURN_MS);
    if (steps > 0) {
      if (steps > MAX_CHURN_STEPS) { m.lastTick = now - ((now - m.lastTick) % CHURN_MS); steps = MAX_CHURN_STEPS; }
      else m.lastTick += steps * CHURN_MS;
      for (let i = 0; i < steps; i++) churnStep(G, m, now, out);
    }
    resolvePending(G, now, out);
    applicantStep(G, now, out);
    if (r.joined || r.leading) { /* 출발 대기 중엔 시장만 움직인다 */ }
    return { events: out };
  }

  // ---------------- 지원 ----------------
  // 레벨 적합도: 범위 안 = 높은 확률, 아래 = 낮음, 훨씬 위 = 받아 주지만 보상 분배가 줄어든다
  function fit(G, p) {
    const L = playerLevel(G), [lo, hi] = p.levelRange;
    if (L < lo) { const d = lo - L; return { kind: 'low', chance: Math.max(0.05, 0.75 - 0.25 * d), bonusMult: 1, text: `레벨이 ${d} 낮아요 · 수락 확률 낮음` }; }
    if (L > hi) { const d = L - hi; return { kind: 'high', chance: 0.97, bonusMult: d >= 3 ? 0.5 : 0.8, text: d >= 3 ? '고렙 지원 · 보상 분배 50%' : '레벨이 조금 높아요 · 보상 분배 80%' }; }
    return { kind: 'in', chance: 0.92, bonusMult: 1, text: '레벨 적정 · 수락 확률 높음' };
  }
  function busy(G) {
    const r = ensure(G);
    if (r.joined) return 'joined';
    if (r.leading) return 'leading';
    if (r.posting) return 'posting';
    if (r.pending) return 'pending';
    return null;
  }
  // 지원하기: 결과는 2~6초 뒤 tick 에서 나온다(apply_result)
  function apply(G, postId, now, rng) {
    now = now == null ? Date.now() : now;
    const r = ensure(G);
    const b = busy(G); if (b) return { ok: false, reason: b };
    const p = find(G, postId, now);
    if (!p || p.state !== 'open') return { ok: false, reason: 'gone' };
    if (!(p.slots.healer > 0)) return { ok: false, reason: 'no_healer_slot' };
    if (r.applied[p.id] === 'rejected') return { ok: false, reason: 'already_rejected' };
    rng = rng || RNG.global();
    const f = fit(G, p);
    const accepted = rng.next() < f.chance;
    const delay = rng.int(APPLY_DELAY[0], APPLY_DELAY[1]);
    r.pending = { postId: p.id, at: now, decideAt: now + delay, accepted, bonusMult: f.bonusMult, reason: accepted ? null : (f.kind === 'low' ? 'level_low' : 'rejected') };
    return { ok: true, delay, fit: f };
  }
  function cancelApply(G) { const r = ensure(G); if (!r.pending) return { ok: false, reason: 'none' }; r.pending = null; return { ok: true }; }

  // 합류: 남은 빈 자리는 다른 모험가가 곧바로 채워 출발 준비 완료. 원래 파티는 보관했다가 해산 때 돌려준다.
  function join(G, p, bonusMult = 1, now) {
    const r = ensure(G);
    const rng = RNG.make(RNG.hash(`recruit-join:${p.id}`));
    let healerTaken = false;
    for (const role of ROLES) {
      while (p.slots[role] > 0) {
        if (role === 'healer' && !healerTaken) { healerTaken = true; p.slots.healer--; continue; }
        fillOne(rng, p, role);
      }
    }
    const party = p.members.slice(0, MAX());
    const prevParty = Array.isArray(G.party) ? G.party.slice() : [];
    G.party = party;
    const rewardBonus = Math.round((p.bonusGold * bonusMult) / 5) * 5;
    r.joined = { postId: p.id, floor: p.floor, leaderName: p.leader.name, leaderUid: p.leader.uid, title: p.title, rewardBonus, at: now == null ? Date.now() : now, prevParty };
    const m = r.market;
    if (m) markFull(m, p, now == null ? Date.now() : now);
    emit('party_changed', { action: 'join', count: party.length });
    emit('recruit_joined', { postId: p.id, floor: p.floor, leaderName: p.leader.name });
    return { ok: true, floor: p.floor, rewardBonus, party };
  }

  // 탈퇴(합류 파티) / 해산(내가 모은 파티)
  function leave(G) {
    const r = ensure(G);
    if (r.joined) {
      G.party = (r.joined.prevParty || []).slice();
      const info = { kind: 'joined', floor: r.joined.floor, leaderName: r.joined.leaderName };
      r.joined = null;
      emit('party_changed', { action: 'leave', count: G.party.length });
      return Object.assign({ ok: true }, info);
    }
    if (r.leading) {
      const uids = new Set(r.leading.memberUids || []);
      G.party = (G.party || []).filter((m) => !uids.has(m.uid));
      const info = { kind: 'leading', floor: r.leading.floor };
      r.leading = null;
      emit('party_changed', { action: 'disband', count: G.party.length });
      return Object.assign({ ok: true }, info);
    }
    return { ok: false, reason: 'none' };
  }
  // 탑 입장 제한: 파티 목표 층만 들어갈 수 있다(null = 제한 없음)
  function allowedFloor(G) { const r = ensure(G); return (r.joined && r.joined.floor) || (r.leading && r.leading.floor) || null; }

  // 층 한 판이 끝나면(Floor.leave) 파티 해산 + 돌파 시 보상 분배
  function finishRun(G, run) {
    const r = ensure(G);
    const floor = run && run.floor, cleared = !!(run && (run.cleared || run.reason === 'cleared'));
    const reason = (run && run.reason) || (cleared ? 'cleared' : 'escape');
    let res = null;
    if (r.joined && r.joined.floor === floor) {
      const j = r.joined;
      const bonusGold = cleared ? j.rewardBonus || 0 : 0;
      if (bonusGold) { G.player.gold = (G.player.gold || 0) + bonusGold; emit('gold_changed', { gold: G.player.gold, delta: bonusGold, source: 'recruit' }); }
      leave(G);
      res = { kind: 'joined', floor, cleared, reason, bonusGold, leaderName: j.leaderName, title: j.title };
    } else if (r.leading && r.leading.floor === floor) {
      const n = (r.leading.memberUids || []).length;
      leave(G);
      res = { kind: 'leading', floor, cleared, reason, bonusGold: 0, count: n };
    }
    if (res) { r.history.unshift(Object.assign({ day: G.day || 1 }, res)); r.history.length = Math.min(r.history.length, 10); emit('recruit_disbanded', res); }
    return res;
  }

  // ---------------- 모집 등록(내가 리더) ----------------
  const slotCap = (G) => Math.max(0, MAX() - (Array.isArray(G.party) ? G.party.length : 0));
  function newDraft(G) { return { floor: maxOpen(G), slots: emptySlots() }; }
  // 역할 버튼: 누를 때마다 한 칸씩 쌓인다(정원 = 4 − 현재 파티원)
  function addSlot(G, draft, role) {
    if (!ROLES.includes(role)) return { ok: false, reason: 'bad_role' };
    if (slotTotal(draft.slots) >= slotCap(G)) return { ok: false, reason: 'slots_full', cap: slotCap(G) };
    draft.slots[role] = (draft.slots[role] || 0) + 1;
    return { ok: true, total: slotTotal(draft.slots) };
  }
  function removeSlot(draft, role) {
    if (!(draft.slots[role] > 0)) return { ok: false, reason: 'empty' };
    draft.slots[role]--;
    return { ok: true, total: slotTotal(draft.slots) };
  }
  function resetSlots(draft) { draft.slots = emptySlots(); return draft; }
  function draftFee(draft) { return feeFor(draft.floor, slotTotal(draft.slots)); }

  function post(G, draft, now) {
    now = now == null ? Date.now() : now;
    const r = ensure(G);
    const b = busy(G); if (b) return { ok: false, reason: b };
    const floor = draft.floor | 0;
    if (floor < 1 || floor > maxOpen(G)) return { ok: false, reason: 'floor_locked' };
    const n = slotTotal(draft.slots);
    if (n < 1) return { ok: false, reason: 'no_slots' };
    if (n > slotCap(G)) return { ok: false, reason: 'slots_full', cap: slotCap(G) };
    const fee = feeFor(floor, n);
    if ((G.player.gold || 0) < fee) return { ok: false, reason: 'gold', fee };
    G.player.gold -= fee;
    emit('gold_changed', { gold: G.player.gold, delta: -fee, source: 'recruit_fee' });
    const rng = RNG.make(RNG.hash(`recruit-post:${now}`));
    r.posting = { floor, slots: Object.assign(emptySlots(), draft.slots), fee, createdAt: now, applicants: [], accepted: [], seq: 0,
      nextAt: now + rng.int(APPLICANT_GAP[0], 5000), title: `${floor}층 ${needText(draft.slots)} 모집합니다 (리더 ${G.player.name || '리프'})` };
    emit('recruit_posted', { floor, fee, slots: r.posting.slots });
    return { ok: true, fee, posting: r.posting };
  }
  function acceptApplicant(G, appId) {
    const ps = ensure(G).posting; if (!ps) return { ok: false, reason: 'none' };
    const a = ps.applicants.find((x) => x.id === appId); if (!a) return { ok: false, reason: 'not_found' };
    if (!(remainingNeed(ps)[a.member.role] > 0)) return { ok: false, reason: 'role_full' };
    ps.applicants = ps.applicants.filter((x) => x !== a);
    ps.accepted.push(a.member);
    // 그 역할이 다 찼으면 같은 역할 대기자는 돌려보낸다
    const need = remainingNeed(ps);
    ps.applicants = ps.applicants.filter((x) => need[x.member.role] > 0);
    return { ok: true, member: a.member, complete: slotTotal(need) === 0 };
  }
  function rejectApplicant(G, appId) {
    const ps = ensure(G).posting; if (!ps) return { ok: false, reason: 'none' };
    const n = ps.applicants.length;
    ps.applicants = ps.applicants.filter((x) => x.id !== appId);
    return ps.applicants.length < n ? { ok: true } : { ok: false, reason: 'not_found' };
  }
  // 모집 마감: 수락한 사람들로 출발(최소 1명)
  function closePosting(G) {
    const r = ensure(G), ps = r.posting; if (!ps) return { ok: false, reason: 'none' };
    if (!ps.accepted.length) return { ok: false, reason: 'no_members' };
    const uids = [];
    for (const m of ps.accepted) {
      if (hasParty() ? Party.add(G, m) : (G.party.push(m), true)) uids.push(m.uid);
    }
    r.leading = { floor: ps.floor, memberUids: uids, fee: ps.fee, at: Date.now() };
    r.posting = null;
    if (r.market) r.market.matched = (r.market.matched || 0) + 1;
    emit('recruit_closed', { floor: ps.floor, count: uids.length });
    return { ok: true, floor: ps.floor, count: uids.length };
  }
  // 모집 취소: 게시료 절반 환불
  function cancelPosting(G) {
    const r = ensure(G), ps = r.posting; if (!ps) return { ok: false, reason: 'none' };
    const refund = Math.floor(ps.fee * REFUND);
    G.player.gold = (G.player.gold || 0) + refund;
    emit('gold_changed', { gold: G.player.gold, delta: refund, source: 'recruit_refund' });
    r.posting = null;
    return { ok: true, refund };
  }

  return {
    ensure, tick, market, posts, find, counters, generate, fit, fits, apply, cancelApply, join, leave, allowedFloor, finishRun, busy,
    feeFor, slotTotal, newDraft, addSlot, removeSlot, resetSlots, draftFee, slotCap, post, acceptApplicant, rejectApplicant, closePosting, cancelPosting, remainingNeed,
    bucketOf, ago, maxOpen, floorInfo, healerOpen, needText,
    BUCKET_MS, CHURN_MS, FEE_MIN, FEE_BASE, FEE_PER_FLOOR, REFUND, ROLES, ROLE_SHORT, TAGS, APPLY_DELAY, APPLICANT_GAP, MIN_POSTS, MAX_POSTS, FULL_LINGER,
  };
})();
if (typeof module !== 'undefined') module.exports = Recruit;
