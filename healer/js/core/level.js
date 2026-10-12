// 레벨·경험치 — DESIGN.md §4
// xp 는 "현재 레벨에서 쌓은 양"으로 저장한다(레벨업 시 필요량을 빼고 남는 양은 이월). 만렙 40.
const Level = (() => {
  const MAX = 40;
  const POINTS_PER_LEVEL = 5;

  // lv-1 → lv 에 필요한 경험치. 2레벨 100, 완만한 2차 증가(10레벨 1,764 / 40레벨 21,684).
  function xpForLevel(lv) {
    if (lv <= 1) return 0;
    if (lv > MAX) return Infinity;
    const k = lv - 1;
    return 88 * k + 12 * k * k;
  }
  function totalXpTo(lv) {
    let sum = 0;
    for (let l = 2; l <= Math.min(lv, MAX); l++) sum += xpForLevel(l);
    return sum;
  }
  // 투자 포인트를 가진 쪽만 플레이어다(파티원은 자동 성장만 한다)
  function isPlayer(entity) { return !!entity && typeof entity.statPoints === 'number'; }

  function unlockedSkills(level) {
    if (typeof Skills === 'undefined') return [];
    return Skills.priest().filter((s) => s.unlockLevel <= level).map((s) => s.id);
  }
  function newlyUnlocked(from, to) {
    const before = new Set(unlockedSkills(from));
    return unlockedSkills(to).filter((id) => !before.has(id));
  }
  // 해금된 스킬은 skillLevels 에 1레벨로 적어 둔다. Combat/신전은 skillLevels[id] >= 1 을 "쓸 수 있음"으로 본다.
  function grantSkills(entity, ids) {
    if (!entity.skillLevels) return;
    for (const id of ids) if (!entity.skillLevels[id]) entity.skillLevels[id] = 1;
  }
  function applyGrowth(entity, from, to) {
    if (typeof Classes === 'undefined' || !entity.cls || !entity.stats) return;
    const d = Classes.growthDelta(entity.cls, from, to);
    for (const k of Object.keys(d)) entity.stats[k] = (entity.stats[k] || 0) + d[k];
  }
  function refill(entity, G) {
    if (typeof Stats === 'undefined') return;
    const d = Stats.derive(entity, G);
    entity.hp = d.maxHp; entity.mp = d.maxMp;
  }

  function addXp(entity, xp, G) {
    if (!entity || !(xp > 0)) return { levelsGained: 0, level: entity ? entity.level : 0 };
    if (!(entity.level >= 1)) entity.level = 1;
    if (entity.level >= MAX) { entity.xp = 0; return { levelsGained: 0, level: MAX }; }
    const from = entity.level;
    entity.xp = (entity.xp || 0) + Math.floor(xp);
    while (entity.level < MAX && entity.xp >= xpForLevel(entity.level + 1)) {
      entity.xp -= xpForLevel(entity.level + 1);
      entity.level++;
    }
    if (entity.level >= MAX) entity.xp = 0;
    const levelsGained = entity.level - from;
    const result = { levelsGained, level: entity.level, from, newSkills: [] };
    if (!levelsGained) return result;
    applyGrowth(entity, from, entity.level);
    const player = isPlayer(entity);
    if (player) {
      entity.statPoints += POINTS_PER_LEVEL * levelsGained;
      result.newSkills = newlyUnlocked(from, entity.level);
      grantSkills(entity, result.newSkills);
    }
    refill(entity, G);
    // 여러 레벨이 한 번에 올라도 이벤트는 한 번(토스트/연출 중복 방지). levelsGained 로 구분한다.
    if (typeof Events !== 'undefined') {
      Events.emit('level_up', { entity, uid: entity.uid, name: entity.name, isPlayer: player, from, level: entity.level, levelsGained, newSkills: result.newSkills });
    }
    return result;
  }

  function allocate(G, stat, n = 1) {
    const p = G && G.player; if (!p) return { ok: false, reason: 'no_player' };
    const count = n | 0;
    if (typeof Stats !== 'undefined' ? !Stats.PRIMARY.includes(stat) : !(stat in p.stats)) return { ok: false, reason: 'bad_stat' };
    if (count <= 0) return { ok: false, reason: 'bad_count' };
    if ((p.statPoints || 0) < count) return { ok: false, reason: 'not_enough_points' };
    p.stats[stat] = (p.stats[stat] || 0) + count;
    p.statPoints -= count;
    if (typeof Events !== 'undefined') Events.emit('stat_allocated', { stat, n: count, left: p.statPoints });
    return { ok: true };
  }

  function progress(entity) {
    const level = Math.max(1, (entity && entity.level) || 1);
    const need = level >= MAX ? 0 : xpForLevel(level + 1);
    const xp = Math.min((entity && entity.xp) || 0, need || 0);
    return { level, xp, need, pct: need ? xp / need : 1, max: level >= MAX };
  }
  // 플레이어의 사제 스킬 레벨. 해금 전이면 0.
  function skillLevel(G, skillId) {
    const p = G && G.player; if (!p) return 0;
    const lv = (p.skillLevels || {})[skillId];
    if (lv) return lv;
    return unlockedSkills(p.level || 1).includes(skillId) ? 1 : 0;
  }

  return { MAX, POINTS_PER_LEVEL, xpForLevel, totalXpTo, addXp, allocate, unlockedSkills, newlyUnlocked, progress, skillLevel };
})();
if (typeof module !== 'undefined') module.exports = Level;
