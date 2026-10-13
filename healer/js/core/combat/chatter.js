// 파티 수다(콜아웃) — DESIGN.md §8.5
// 전투 상태를 매 틱(0.1초 간격) 훑어 "말할 거리"를 찾고, 쿨타임을 지켜 Events.emit('party_say', { uid, ent, text, kind, priority, t }) 로 알린다.
// DOM 을 쓰지 않는다(말풍선은 던전 씬이 그린다). Combat.update 끝에서 Chatter.update(battle, dt) 로 불린다(battle.chatter === false 면 끔).
//  - 탱커(없으면 앞장서는 사람)가 가장 말이 많다: 풀링 "준비하세요!", 장판 경고, 보스·쫄 등장, 힐러 위험, 승리.
//  - 딜러: HP 45% 아래면 힐 요청(ent.wantsHeal = 끝나는 시각 — 씬이 머리 위에 "+" 를 깜빡인다), 빠질 때/돌아올 때, 연속 처치, 저주.
//  - 누구나: 위험했다가 회복되면 고맙다고, 쓰러질 때, 부활했을 때.
// 말이 넘치지 않게: 전체 1.5초에 한 줄(급한 힐 요청·쓰러짐은 0.6초), 한 사람은 3.5초에 한 줄, 같은 종류는 종류별 쿨타임.
// 대사 고르기는 전투 난수(battle.rng)를 건드리지 않도록 자체 난수를 쓴다(시뮬레이션 재현성 유지).
// 힐러(플레이어 = 사용자)는 말하지 않는다. AIHealer 의 대상 고르기와는 무관하다(wantsHeal 은 표시용).
const Chatter = (() => {
  const TILE = 32;
  const TICK = 0.1;
  const GLOBAL_GAP = 1.5, URGENT_GAP = 0.6, ENT_GAP = 3.5, PENDING_LIFE = 1.4;
  const HEAL_REQ = { tank: 0.40, other: 0.45 }, URGENT_HP = 0.30, THANKS_FROM = 0.35, THANKS_AT = 0.75, WANTS_HEAL_FOR = 3.5;
  const MANY_FOES = 8, BIG_PULL = 14, BANTER_KILLS = 3, BANTER_WIN = 2.2;
  // 종류별 쿨타임(초, 같은 사람 기준. g: 파티 전체 기준)
  const KIND_GAP = {
    pull: 6, pull_go: 6, many: 20, telegraph: 4.5, heal_req: 5, heal_req_tank: 4, boss: 60, miniboss: 30, summon: 10, phase: 8,
    victory: 10, healer_danger: 7, retreat: 4, return: 4, banter: 9, curse: 7, thanks: 12, death: 0, revived: 0, engage: 10,
  };
  const GLOBAL_KIND_GAP = { victory: 12, banter: 7, telegraph: 3, many: 25, engage: 10 };
  // 우선순위: 3 급함(쓰러짐·급한 힐 요청·힐러 위험·보스) > 2 중요(풀링·장판·후퇴·힐 요청) > 1 수다(승리·복귀·감사·저주) > 0 잡담
  const PRIO = {
    death: 3, heal_urgent: 3, healer_danger: 3, boss: 3, pull: 2, pull_go: 1, telegraph: 2, heal_req: 2, retreat: 2, summon: 2, phase: 2, miniboss: 2,
    curse: 1, victory: 1, return: 1, thanks: 1, revived: 2, many: 1, engage: 1, banter: 0,
  };

  // ---------------- 대사 ----------------
  // LINES[kind] = { tank?: [...], dps?: [...], any?: [...] } — 역할에 맞는 목록 + any 를 합쳐 고른다.
  const LINES = {
    pull: { tank: ['준비하세요!', '들어갑니다!', '어글 끌게요!', '제 뒤로 오세요!', '제가 먼저 갑니다. 따라오세요!', '하나, 둘… 갑니다!'] },
    pull_big: { tank: ['많아요! 뭉쳐요!', '떼거리예요. 제 뒤에 붙어요!', '큰 무리예요, 광역 준비!'] },
    pull_mini: { tank: ['중간보스예요. 준비되면 갑니다!', '강한 놈이에요. 힐 준비해 주세요!', '중간보스 잡으러 갑니다!'] },
    pull_go: { tank: ['갑니다!', '지금!', '돌격!'], dps: ['따라갈게요!', '가자!', '뒤는 맡겨요!'] },
    engage: { tank: ['어글 끌게요!', '제가 받을게요!', '다 저한테 오세요!', '붙었다! 모여요!'] },
    many: { tank: ['많아요! 뭉쳐요!', '수가 많아요, 흩어지지 마요!', '광역 갑니다, 모여요!'] },
    tg_puddle: { tank: ['장판! 피하세요!', '바닥 조심! 밖으로!', '장판 깔려요, 빠져요!'], dps: ['장판이다, 피해요!'] },
    tg_aoe: { tank: ['광역 와요, 조심!', '큰 거 옵니다! 흩어져요!', '범위기! 빠지세요!'], dps: ['범위기다, 조심!'] },
    tg_cone: { tank: ['앞에 브레스! 옆으로!', '정면 피해요!', '부채꼴 와요, 옆으로!'] },
    tg_line: { tank: ['돌진 와요! 비켜요!', '돌진! 옆으로 빠져요!', '일직선 조심!'] },
    heal_req_tank: { tank: ['힐 주세요!!', '버티기 힘들어요, 힐!', '힐러님, 저 좀요!', '방패가 깨질 것 같아요!'] },
    heal_req: { dps: ['힐 좀요!', '아파요… 힐!', '힐 부탁해요!', '피가 없어요!'] },
    heal_urgent: { tank: ['힐!! 죽어요!!', '지금 힐 안 오면 눕습니다!!'], dps: ['살려줘요! 힐!!', '죽겠어요, 힐!!', '힐!! 급해요!!'] },
    retreat: { dps: ['빠질게요!', '잠깐 뒤로!', '피 없어요, 빠집니다!', '잠깐만, 숨 좀!'], tank: ['잠깐 물러날게요, 힐!', '한 발 뒤로! 힐 주세요!'] },
    return: { dps: ['다시 갑니다!', '복귀!', '살았다, 다시 간다!', '이제 괜찮아요, 갑니다!'], tank: ['다시 잡을게요!', '괜찮아요, 다시 앞으로!'] },
    curse: { any: ['저주 걸렸어요! 해제 부탁해요', '몸이 이상해요… 해제 좀요!', '저주예요! 풀어 주세요!'] },
    curse_dot: { any: ['독이에요! 해제 부탁해요', '중독됐어요… 해제!'] },
    curse_root: { any: ['발이 묶였어요! 해제!', '못 움직여요! 해제 좀요!'] },
    boss: { tank: ['보스입니다. 집중!', '보스예요! 다들 정신 차려요!', '보스전 갑니다. 패턴 조심!'], dps: ['보스다…!'] },
    miniboss: { tank: ['중간보스! 집중해요!', '강한 놈이에요, 제가 잡고 있을게요!'] },
    summon: { tank: ['쫄 나와요! 제가 잡을게요', '부하 나왔어요! 제 쪽으로 모을게요', '쫄이다! 힐러님 조심!'] },
    phase: { tank: ['패턴 바뀝니다! 조심!', '보스가 화났어요! 정신 차려요!'] },
    healer_danger: { tank: ['힐러님 위험! 제가 뺏어올게요', '힐러님 쪽으로 간다! 막을게요!', '힐러 건드리지 마라!'] },
    victory: { tank: ['수고하셨어요~', '다음 가요', '깔끔했어요!', '정리 끝! 이동합니다'], dps: ['수고했어요~', '쉬웠다!', '좋았어요!'] },
    victory_boss: { tank: ['보스 잡았다! 다들 최고예요!', '해냈어요! 출구로 가요!'], dps: ['보스 처치! 힐러님 최고!'] },
    banter: { dps: ['쓸어버려!', '하나 더!', '한 방에 정리!', '오늘 손이 잘 풀리네!', '이 맛에 던전 오지!'], tank: ['좋아요, 계속!'] },
    banter_mini: { any: ['중간보스 처치!', '큰 놈 잡았다!'] },
    thanks: { any: ['살았다… 고마워요!', '힐 감사해요!', '휴, 살았네요!', '역시 힐러님!'] },
    death: { any: ['으악…', '먼저 갑니다…', '미안해요…', '크윽…'] },
    revived: { any: ['부활 감사합니다!', '다시 왔어요!', '한 번 더 해봐요!', '고마워요, 다시 싸울게요!'] },
  };
  // 성격 말투: 성격 문장 키워드로 정한다. 추가 대사를 섞고, 조용한 사람은 잡담을 덜 한다.
  const TONES = [
    { id: 'quiet', keys: ['말수가 적', '조용히', '말이 없', '한발 물러서', '말은 나중'], chat: 0.35 },
    { id: 'cheer', keys: ['농담', '노래', '신이 난', '칭찬', '잘 먹고'], chat: 1 },
    { id: 'caring', keys: ['힐러를', '사제를', '가족처럼', '기도문', '챙긴'], chat: 0.8 },
    { id: 'timid', keys: ['겁이 많', '길을 잘 잃'], chat: 0.8 },
    { id: 'brave', keys: ['앞장', '먼저', '승부욕', '맨주먹', '위험할수록'], chat: 0.9 },
  ];
  const TONE_LINES = {
    quiet: { victory: ['…끝.', '다음.'], pull: ['…간다.', '준비.'], thanks: ['…고마워.'], return: ['…복귀.'], retreat: ['…잠깐.'] },
    cheer: { victory: ['이겼다~! 다음 다음!', '수고 많았어요~ 히히'], banter: ['노래 한 곡 뽑을까요? 쓸어버려~', '오늘 컨디션 최고!'], thanks: ['살았다~ 힐러님 사랑해요!'], pull: ['신나게 가 봅시다!'] },
    caring: { healer_danger: ['힐러님은 제가 지킵니다!'], thanks: ['힐러님 덕분이에요, 고마워요!'], victory: ['힐러님 괜찮아요? 수고하셨어요~'], heal_req: ['힐러님, 저 조금만요…'] },
    timid: { retreat: ['무, 무서워요! 빠질게요!', '으, 잠깐만 뒤로요!'], heal_req: ['아파요… 힐 좀…!', '피, 피가…!'], return: ['다, 다시 가 볼게요!'] },
    brave: { pull: ['다 덤벼라!', '제가 다 받아낼게요!'], return: ['이 정도로는 안 쓰러져요! 다시 간다!'], banter: ['더 강한 놈 없나?'] },
  };

  function toneOf(ent) {
    if (ent._tone !== undefined) return ent._tone;
    const text = (ent.src && ent.src.personality) || '';
    const t = TONES.find((x) => x.keys.some((k) => text.includes(k)));
    ent._tone = t || null;
    return ent._tone;
  }
  const roleKey = (ent) => (ent.role === 'tank' ? 'tank' : 'dps');

  // ---------------- 상태 ----------------
  function state(battle) {
    if (battle._chat) return battle._chat;
    return (battle._chat = {
      acc: 0, seed: 0x9e3779b9, lastSay: -99, lastUrgent: -99, ents: {}, pending: [], tgSeen: {}, monN: battle.monsters.length,
      combat: false, combatStart: 0, kills: battle.kills || 0, killTimes: [], pullSeen: null, bossSeen: {}, miniSeen: {}, phaseSeen: {},
      healerHunted: false, kindLast: {}, lines: 0,
    });
  }
  function rand(st) { st.seed = (Math.imul(st.seed ^ (st.seed >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return st.seed / 4294967296; }
  function entState(st, ent) {
    return st.ents[ent.uid] || (st.ents[ent.uid] = { alive: ent.alive, curses: ent.curses.length, retreat: !!ent.retreat, low: false, last: -99, kinds: {}, ret: ent.lastReturn || null });
  }
  function pickLine(st, ent, kind) {
    const pool = [];
    const set = LINES[kind] || {};
    const role = roleKey(ent);
    if (set[role]) pool.push(...set[role]);
    if (set.any) pool.push(...set.any);
    if (!pool.length && set.tank && role !== 'tank') pool.push(...set.tank);   // 탱커 대사를 대신 맡는 앞장이
    if (!pool.length && set.dps) pool.push(...set.dps);
    const tone = toneOf(ent), base = kind.replace(/_(big|mini|tank|boss|dot|root|puddle|aoe|cone|line|urgent)$/, '');
    const extra = tone && TONE_LINES[tone.id] && (TONE_LINES[tone.id][kind] || TONE_LINES[tone.id][base]);
    if (extra && rand(st) < 0.3) return extra[Math.floor(rand(st) * extra.length)];
    if (!pool.length) return null;
    // 같은 사람이 같은 말을 연달아 하지 않게
    const es = entState(st, ent);
    let line = pool[Math.floor(rand(st) * pool.length)];
    if (pool.length > 1 && line === es.lastLine) line = pool[(pool.indexOf(line) + 1) % pool.length];
    return line;
  }
  // 말할 거리 후보를 넣는다. 같은 사람·같은 종류는 하나만. delay 초 뒤부터 말할 수 있다.
  function propose(st, battle, ent, kind, o = {}) {
    if (!ent || (ent.kind !== 'member')) return;
    const es = entState(st, ent), now = battle.time;
    const gapKey = o.gapKey || kind;
    if (now - (es.kinds[gapKey] || -99) < (KIND_GAP[gapKey] != null ? KIND_GAP[gapKey] : 5)) return;
    const gk = GLOBAL_KIND_GAP[gapKey];
    if (gk && now - (st.kindLast[gapKey] || -99) < gk) return;
    if (st.pending.some((p) => p.uid === ent.uid && p.gapKey === gapKey)) return;
    st.pending.push({ uid: ent.uid, ent, kind: o.line || kind, gapKey, priority: o.priority != null ? o.priority : (PRIO[kind] != null ? PRIO[kind] : 1),
      at: now + (o.delay || 0), expire: now + (o.delay || 0) + (o.life || PENDING_LIFE), deadOk: !!o.deadOk, wantsHeal: !!o.wantsHeal, seq: st.lines + st.pending.length });
  }
  function flush(st, battle) {
    const now = battle.time;
    st.pending = st.pending.filter((p) => p.expire >= now && (p.deadOk || p.ent.alive));
    if (!st.pending.length) return;
    const ready = st.pending.filter((p) => p.at <= now);
    if (!ready.length) return;
    ready.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    for (const p of ready) {
      const urgent = p.priority >= 3;
      if (now - st.lastSay < (urgent ? URGENT_GAP : GLOBAL_GAP)) continue;
      const es = entState(st, p.ent);
      if (!urgent && now - es.last < ENT_GAP) continue;
      const text = pickLine(st, p.ent, p.kind);
      st.pending.splice(st.pending.indexOf(p), 1);
      if (!text) continue;
      st.lastSay = now; es.last = now; es.lastLine = text; es.kinds[p.gapKey] = now; st.kindLast[p.gapKey] = now; st.lines++;
      if (p.wantsHeal) p.ent.wantsHeal = now + WANTS_HEAL_FOR;
      const payload = { uid: p.uid, ent: p.ent, text, kind: p.kind, priority: p.priority, t: now, role: p.ent.role };
      (battle.chatLog || (battle.chatLog = [])).push(payload);
      if (battle.chatLog.length > 30) battle.chatLog.shift();
      if (typeof Events !== 'undefined') Events.emit('party_say', payload);
      return;   // 한 틱에 한 줄
    }
  }

  // ---------------- 상황 읽기 ----------------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => !!e && e.alive;
  function leaderOf(battle) {
    if (typeof AIParty !== 'undefined' && AIParty.leaderOf) return AIParty.leaderOf(battle);
    return battle.members.find((m) => alive(m) && m.role === 'tank') || battle.members.find(alive) || null;
  }
  function chatty(st, ent) { const t = toneOf(ent); return !t || rand(st) < t.chat; }

  function scanParty(st, battle, inCombat) {
    const now = battle.time;
    for (const e of battle.members) {
      const es = entState(st, e), r = e.maxHp ? e.hp / e.maxHp : 1;
      // 쓰러짐·부활
      if (es.alive && !e.alive) { propose(st, battle, e, 'death', { deadOk: true, life: 2 }); es.low = false; e.wantsHeal = 0; }
      else if (!es.alive && e.alive) propose(st, battle, e, 'revived', { delay: 0.4 });
      es.alive = e.alive;
      if (!e.alive) { es.curses = 0; es.retreat = false; continue; }
      // 힐 요청(전투 중). 급하면(30% 미만) 전체 쿨을 무시한다.
      const isTank = e.role === 'tank', th = isTank ? HEAL_REQ.tank : HEAL_REQ.other;
      if (inCombat && r < th) {
        if (r < URGENT_HP) propose(st, battle, e, 'heal_urgent', { gapKey: isTank ? 'heal_req_tank' : 'heal_req', wantsHeal: true });
        else propose(st, battle, e, isTank ? 'heal_req_tank' : 'heal_req', { wantsHeal: true });
        if (e.wantsHeal > now) e.wantsHeal = Math.max(e.wantsHeal, now + 1);   // 아직 아프면 "+" 를 유지
      }
      if (e.wantsHeal && (r >= 0.7 || e.wantsHeal < now)) e.wantsHeal = 0;
      // 위험했다가 회복 → 고맙다
      if (r < THANKS_FROM) es.low = true;
      else if (es.low && r >= THANKS_AT) { es.low = false; if (chatty(st, e)) propose(st, battle, e, 'thanks', { delay: 0.3 }); }
      // 저주
      if (e.curses.length > es.curses) {
        const ids = e.curses.map((c) => c.id);
        propose(st, battle, e, ids.includes('root') ? 'curse_root' : ids.includes('dot') ? 'curse_dot' : 'curse', { gapKey: 'curse' });
      }
      es.curses = e.curses.length;
      // 후퇴·복귀(ai_party 의 ent.retreat / ent.lastReturn)
      if (!es.retreat && e.retreat) propose(st, battle, e, 'retreat');
      if (e.lastReturn && e.lastReturn !== es.ret) { es.ret = e.lastReturn; if (e.lastReturn.recovered && inCombat) propose(st, battle, e, 'return', { delay: 0.2 }); }
      es.retreat = !!e.retreat;
    }
  }
  function scanCombat(st, battle, inCombat) {
    const now = battle.time, lead = leaderOf(battle), p = battle.player;
    const engaged = inCombat ? battle.engagedMonsters() : [];
    // 풀링(ai_party 의 battle.lead.pull)
    const pull = battle.lead && battle.lead.pull;
    if (pull && pull !== st.pullSeen && lead) {
      st.pullSeen = pull;
      const kind = pull.tier === 'boss' ? 'boss' : pull.tier === 'miniboss' ? 'pull_mini' : pull.size >= BIG_PULL && rand(st) < 0.6 ? 'pull_big' : 'pull';
      propose(st, battle, lead, kind, { gapKey: kind === 'boss' ? 'boss' : 'pull', priority: kind === 'boss' ? 3 : 2 });
      if (kind === 'boss') st.bossSeen[pull.uid] = true;
    }
    if (pull && pull.phase === 'go' && !pull._said && lead) { pull._said = true; if (rand(st) < 0.5) propose(st, battle, lead, 'pull_go'); }
    // 전투 시작·끝
    if (inCombat && !st.combat) {
      st.combat = true; st.combatStart = now; st.combatKills = st.kills;
      const pulled = pull && now - pull.t0 < 8;
      if (lead && engaged.length >= MANY_FOES) propose(st, battle, lead, 'many', { delay: 0.3 });
      else if (lead && !pulled) propose(st, battle, lead, 'engage', { delay: 0.2 });
    } else if (!inCombat && st.combat) {
      st.combat = false;
      const won = battle.allies().length && st.kills > (st.combatKills || 0) && !battle.result;
      if (won) {
        const boss = battle.monsters.find((m) => m.tier === 'boss' && !m.alive && st.bossSeen[m.uid] && !st.bossCheered);
        const bossDown = !!boss; if (boss) st.bossCheered = true;
        const who = rand(st) < 0.7 ? lead : battle.members.filter(alive)[Math.floor(rand(st) * battle.members.filter(alive).length)];
        if (who) propose(st, battle, who, bossDown ? 'victory_boss' : 'victory', { gapKey: 'victory', delay: 0.6, life: 2.5 });
      }
      st.healerHunted = false;
    }
    if (!inCombat) return;
    // 보스·중간보스 교전
    for (const m of engaged) {
      if (m.tier === 'boss' && !st.bossSeen[m.uid]) { st.bossSeen[m.uid] = true; if (lead) propose(st, battle, lead, 'boss'); }
      else if (m.tier === 'miniboss' && !st.miniSeen[m.uid]) { st.miniSeen[m.uid] = true; if (lead) propose(st, battle, lead, 'miniboss'); }
      if (m.tier === 'boss' && m.phase && st.phaseSeen[m.uid] !== m.phase) { const had = st.phaseSeen[m.uid] !== undefined; st.phaseSeen[m.uid] = m.phase; if (had && lead) propose(st, battle, lead, 'phase'); }
      else if (m.tier === 'boss' && st.phaseSeen[m.uid] === undefined) st.phaseSeen[m.uid] = m.phase || null;
    }
    // 소환
    if (battle.monsters.length > st.monN) {
      const fresh = battle.monsters.slice(st.monN);
      if (fresh.some((m) => m.summonedBy) && lead) propose(st, battle, lead, 'summon');
    }
    // 힐러가 맞고 있다(몬스터가 힐러를 노림)
    const hunted = alive(p) && engaged.some((m) => m.target === p.uid && dist(m, p) < 6 * TILE);
    if (hunted && !st.healerHunted && lead && lead.role === 'tank') propose(st, battle, lead, 'healer_danger');
    st.healerHunted = hunted;
    // 연속 처치 잡담
    if (st.killTimes.length >= BANTER_KILLS && now - st.killTimes[st.killTimes.length - BANTER_KILLS] <= BANTER_WIN) {
      const dps = battle.members.filter((m) => alive(m) && m.role !== 'tank' && !m.retreat);
      const who = dps.length ? dps[Math.floor(rand(st) * dps.length)] : null;
      if (who && chatty(st, who)) propose(st, battle, who, 'banter');
      st.killTimes.length = 0;
    }
  }
  function scanTelegraphs(st, battle) {
    const lead = leaderOf(battle);
    for (const tg of battle.telegraphs) {
      if (st.tgSeen[tg.id]) continue;
      st.tgSeen[tg.id] = true;
      if (tg.resolved || !lead) continue;
      // 파티 근처(반경 + 2타일)에 떨어진 것만 외친다
      const close = battle.allies().some((e) => tg.type === 'line' || tg.type === 'cone' ? dist(e, tg) <= (tg.r || TILE) + 6 * TILE : dist(e, tg) <= (tg.r || TILE) + 2 * TILE);
      if (!close) continue;
      const owner = battle.byUid(tg.owner);
      const big = owner && owner.tier !== 'normal';
      const kind = tg.type === 'puddle' ? 'tg_puddle' : tg.type === 'cone' ? 'tg_cone' : tg.type === 'line' ? 'tg_line' : 'tg_aoe';
      if (kind === 'tg_aoe' && !big && (tg.r || 0) < 2.5 * TILE && rand(st) < 0.6) continue;   // 작은 원은 가끔만
      propose(st, battle, lead, kind, { gapKey: 'telegraph', priority: big ? 3 : 2, life: 1 });
    }
    // 오래된 기록 정리
    if (Object.keys(st.tgSeen).length > 200) { const live = new Set(battle.telegraphs.map((t) => t.id)); for (const id of Object.keys(st.tgSeen)) if (!live.has(id)) delete st.tgSeen[id]; }
  }
  function scanKills(st, battle) {
    const k = battle.kills || 0;
    if (k > st.kills) {
      for (let i = st.kills; i < k; i++) st.killTimes.push(battle.time);
      if (st.killTimes.length > 10) st.killTimes.splice(0, st.killTimes.length - 10);
      const lk = battle.lastKill;
      if (lk && lk !== st.lkSeen && lk.tier === 'miniboss') {
        const killer = lk.killer ? battle.byUid(lk.killer) : null;
        const who = killer && killer.kind === 'member' && killer.alive ? killer : battle.members.find(alive);
        if (who) propose(st, battle, who, 'banter_mini', { gapKey: 'banter', priority: 1 });
      }
      st.lkSeen = lk;
      st.kills = k;
    }
  }

  function update(battle, dt) {
    if (!battle || battle.chatter === false || !battle.members || !battle.members.length) return;
    const st = state(battle);
    st.acc += dt;
    if (st.acc < TICK) return;
    st.acc = 0;
    const inCombat = battle.inCombat();
    scanKills(st, battle);
    scanParty(st, battle, inCombat);
    scanCombat(st, battle, inCombat);
    scanTelegraphs(st, battle);
    st.monN = battle.monsters.length;
    flush(st, battle);
  }
  // 대사 수(보고·테스트용)
  function lineCount() {
    let n = 0;
    for (const set of Object.values(LINES)) for (const arr of Object.values(set)) n += arr.length;
    for (const set of Object.values(TONE_LINES)) for (const arr of Object.values(set)) n += arr.length;
    return n;
  }

  return { update, lineCount, LINES, TONE_LINES, GLOBAL_GAP, URGENT_GAP, ENT_GAP, HEAL_REQ, URGENT_HP };
})();
if (typeof module !== 'undefined') module.exports = Chatter;
