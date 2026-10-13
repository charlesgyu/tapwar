// 전투 엔티티 — DESIGN.md §8
// 플레이어/파티원은 원본(G.player/memberInst)을 src 로 들고 Stats.derive 로 파생 스탯을 만든다.
// 몬스터는 Monsters.statsAt(mDef, floor)(= (base + perFloor×(floor−floorBase)) × Floors.mult) 를 base 로 두고
// Stats.applyStatus 로 버프/저주만 입힌다. refresh() 는 버프·저주가 바뀔 때 Combat 이 부른다.
const Entities = (() => {
  const TILE = 32;
  const AGGRO_RANGE = 7 * TILE, LEASH_RANGE = 25 * TILE;
  const RADIUS_BY_SIZE = { 1: 12, 2: 18, 3: 28 };
  const PARTY_RADIUS = 8;

  const hasStats = () => typeof Stats !== 'undefined' && !!Stats.derive;
  function newUid(prefix) {
    if (typeof State !== 'undefined' && State.uid) return State.uid();
    return prefix + Math.random().toString(36).slice(2, 10);
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // 공통 뼈대. kind 별 함수가 필요한 필드를 덮어쓴다.
  function base(kind, uid) {
    return {
      uid, kind, name: '', cls: null, role: null, level: 1, def: null, src: null,
      x: 0, y: 0, dir: 'down', size: 1, radius: PARTY_RADIUS,
      stats: {}, hp: 1, maxHp: 1, mp: 0, maxMp: 0, alive: true, state: 'idle',
      target: null, threat: {}, buffs: [], curses: [], cooldowns: {}, cast: null,
      atkTimer: 0, speed: 0, sprite: '', tags: [], tier: null,
      home: { x: 0, y: 0 }, groupId: null, aggroRange: AGGRO_RANGE, leashRange: LEASH_RANGE,
    };
  }

  // 파생 스탯을 다시 계산하고 최대 HP/MP·이동속도를 맞춘다. 버프/저주 변경 후 Combat 이 부른다.
  function refresh(ent, G, now) {
    if (ent.kind === 'monster') {
      ent.stats = hasStats() ? Stats.applyStatus(ent.base, ent, now) : Object.assign({}, ent.base);
    } else if (hasStats()) {
      ent.stats = Stats.derive(ent, G, now);
    }
    const s = ent.stats;
    if (typeof s.maxHp === 'number') ent.maxHp = s.maxHp;
    if (typeof s.maxMp === 'number') ent.maxMp = s.maxMp;
    ent.hp = clamp(ent.hp, 0, ent.maxHp);
    ent.mp = clamp(ent.mp, 0, ent.maxMp);
    ent.speed = typeof s.moveSpeed === 'number' ? s.moveSpeed : ent.speed;
    return ent;
  }

  function classInfo(cls) { return typeof Classes !== 'undefined' && Classes.get ? Classes.get(cls) : null; }

  // 플레이어·파티원 공통 채우기. 현재 HP/MP 는 원본에 있으면 그것을(던전 입장 시 상태 유지), 없으면 가득.
  function fillParty(ent, src, G, now) {
    const ci = classInfo(src.cls);
    ent.name = src.name; ent.cls = src.cls; ent.level = src.level || 1; ent.src = src;
    ent.sprite = src.cls; ent.atkType = ci ? ci.atkType : 'melee'; ent.range = ci ? ci.range : 40;
    ent.atkInterval = ci ? ci.atkInterval : 1.0; ent.dmgStat = ci ? ci.dmgStat : 'atk';
    // 음식 버프(G.player.buffs)는 전투 엔티티로 복사되어 Stats.derive 가 읽는다
    ent.buffs = Array.isArray(src.buffs) ? src.buffs.map((b) => Object.assign({}, b)) : [];
    ent.hp = Infinity; ent.mp = Infinity;
    refresh(ent, G, now);
    if (typeof src.hp === 'number' && src.hp > 0) ent.hp = Math.min(src.hp, ent.maxHp);
    if (typeof src.mp === 'number') ent.mp = Math.min(src.mp, ent.maxMp);
    return ent;
  }

  function fromPlayer(G, now = 0) {
    const p = G.player;
    const ent = base('player', 'player');
    ent.role = 'healer';
    ent.skillLevels = p.skillLevels || {};
    return fillParty(ent, p, G, now);
  }

  function fromMember(G, m, now = 0) {
    const ent = base('member', m.uid || newUid('m'));
    ent.role = m.role || 'melee';
    return fillParty(ent, m, G, now);
  }

  // 몬스터. mDef 와 층으로 실전 수치를 만들고, 원래 자리(home)를 기억해 순찰·리쉬 기준으로 쓴다.
  function fromMonster(mDef, floor, x, y, rng) {
    const st = typeof Monsters !== 'undefined' && Monsters.statsAt ? Monsters.statsAt(mDef, floor) : Object.assign({ xp: mDef.xp, gold: mDef.gold }, mDef.base);
    const ent = base('monster', newUid('mon'));
    ent.name = mDef.name; ent.def = mDef; ent.id = mDef.id; ent.floor = floor || 1;
    ent.x = x; ent.y = y; ent.home = { x, y };
    ent.size = mDef.size || 1; ent.radius = RADIUS_BY_SIZE[ent.size] || PARTY_RADIUS;
    ent.sprite = mDef.sprite || mDef.id; ent.tags = (mDef.tags || []).slice(); ent.tier = mDef.tier;
    ent.level = typeof Floors !== 'undefined' && Floors.levelFor ? Floors.levelFor(ent.floor) : ent.floor;
    ent.base = { maxHp: st.hp, maxMp: 0, atk: st.atk, matk: st.atk, def: st.def, moveSpeed: st.spd, atkSpeed: st.aspd, evasion: 0, crit: 5, healTakenMult: 1 };
    ent.range = st.range; ent.atkInterval = 1; ent.xp = st.xp; ent.gold = st.gold;
    ent.threatMult = st.threatMult || 1;
    ent.abilities = (mDef.abilities || []).slice();
    ent.aggro = false; ent.summonedBy = null; ent.phase = null;
    ent.dir = rng ? rng.pick(['down', 'left', 'right', 'up']) : 'down';
    ent.hp = Infinity;
    refresh(ent, null, 0);
    return ent;
  }

  return { fromPlayer, fromMember, fromMonster, refresh, AGGRO_RANGE, LEASH_RANGE, RADIUS_BY_SIZE, PARTY_RADIUS, TILE };
})();
if (typeof module !== 'undefined') module.exports = Entities;
