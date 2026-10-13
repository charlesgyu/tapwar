// 게임 상태 — 스키마는 DESIGN.md §2. 저장/불러오기(localStorage) 포함.
const State = (() => {
  const SAVE_KEY = 'healer.save';
  const VERSION = 1;
  let G = null;
  let uidCounter = 1;

  function uid() { uidCounter++; return 'u' + Date.now().toString(36) + uidCounter.toString(36); }

  function newGame(name = '리프') {
    G = {
      version: VERSION,
      player: {
        name, cls: 'priest', level: 1, xp: 0, statPoints: 0,
        stats: { str: 4, def: 5, agi: 6, sta: 6, int: 14, vit: 8 },
        hp: 0, mp: 0, fatigue: 0, gold: 300, gems: 0,
        skillLevels: { heal_basic: 1, cleanse: 1 },
        equipment: { neck: null, ring1: null, ring2: null, ear: null, main: null, off: null, body: null, boots: null, gloves: null, hat: null, belt: null, bag: null },
        bag: new Array(20).fill(null), bagSize: 20,
        belt: [null],
        engravings: [],
        active: { single: 'heal_basic', aoe: 'aoe_2' },
        settings: { autoHeal: true, autoDodge: false, autoFollow: true },
      },
      party: [],
      bank: { items: [], gold: 0, size: 60 },
      guild: null,
      quests: { active: [], completed: [], daily: { day: 0, offered: [], done: [] }, hiddenFound: [] },
      story: { chapter: 1, flags: {} },
      tower: { highestCleared: 0, records: {} },
      auction: { hourIndex: 0, listings: [], mine: [], resetTickets: 1 },
      adventurer: { day: 0, candidates: [] },
      // 구인구직 게시판(Recruit): 시장 모집글·지원 대기·합류/모집 중인 파티
      recruit: { market: null, pending: null, applied: {}, joined: null, posting: null, leading: null, history: [] },
      counters: { steps: 0, kills: 0, bossKills: 0, chests: 0, heals: 0 },
      day: 1, playTime: 0,
    };
    // 파생 최대값은 Stats 가 있으면 채움
    if (typeof Stats !== 'undefined' && Stats.derive) {
      try { const d = Stats.derive(G.player, G); G.player.hp = d.maxHp; G.player.mp = d.maxMp; } catch (e) { G.player.hp = 150; G.player.mp = 160; }
    } else { G.player.hp = 150; G.player.mp = 160; }
    return G;
  }

  function get() { if (!G) newGame(); return G; }
  function set(g) { G = g; return G; }

  function storage() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) {}
    return null;
  }
  function save() {
    const s = storage(); if (!s || !G) return false;
    try { s.setItem(SAVE_KEY, JSON.stringify(G)); return true; } catch (e) { console.error('save failed', e); return false; }
  }
  function load() {
    const s = storage(); if (!s) return false;
    try {
      const raw = s.getItem(SAVE_KEY); if (!raw) return false;
      const g = JSON.parse(raw);
      if (!g || g.version !== VERSION) return false;
      G = migrate(g);
      return true;
    } catch (e) { console.error('load failed', e); return false; }
  }
  function hasSave() { const s = storage(); return !!(s && s.getItem(SAVE_KEY)); }
  function reset() { const s = storage(); if (s) s.removeItem(SAVE_KEY); G = null; }
  function migrate(g) {
    // 누락 필드 보강 (이전 저장 호환)
    const base = (() => { const keep = G; const fresh = newGame(g.player && g.player.name); G = keep; return fresh; })();
    // src[k] 가 null(새 게임의 빈 장비 칸·guild 등)이면 내려가지 않는다 — typeof null === 'object' 라
    // 장비를 낀 저장을 불러올 때 Object.keys(null) 로 로드 전체가 실패하던 버그(E2E 이어하기에서 발견)
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const deep = (dst, src) => { for (const k of Object.keys(src)) { if (dst[k] === undefined) dst[k] = src[k]; else if (isObj(dst[k]) && isObj(src[k])) deep(dst[k], src[k]); } return dst; };
    return deep(g, base);
  }

  return { newGame, get, set, save, load, hasSave, reset, uid, SAVE_KEY, VERSION };
})();
if (typeof module !== 'undefined') module.exports = State;
