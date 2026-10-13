// 파티 수다(Chatter)·탱커 앞장(AIParty.lead) 테스트 — DESIGN §8.1, §8.5
const load = require('../tools/load');
const T = 32;
const EMPTY_MAP = { cols: 100, rows: 100, solid: (i, j) => i < 0 || j < 0 || i >= 100 || j >= 100 };
const MEMBERS = [['warrior', 'tank', '바위'], ['rogue', 'melee', '그림자'], ['hunter', 'ranged', '매'], ['mage', 'ranged', '불꽃']];
function memberInst(ctx, [cls, role, name], level, i) {
  return { uid: 'm' + i, name, cls, role, level, xp: 0, stats: ctx.Classes.statsAt(cls, level), equipment: { body: null, main: null }, hireCost: 0, personality: '' };
}
function setup(ctx, { level = 3, at = { x: 10 * T, y: 10 * T }, seed = 3 } = {}) {
  const G = ctx.State.newGame('리프');
  G.player.level = level;
  G.party = MEMBERS.map((m, i) => memberInst(ctx, m, level, i));
  const rng = ctx.RNG.make(seed);
  const player = ctx.Entities.fromPlayer(G); player.x = at.x; player.y = at.y;
  const mems = G.party.map((m, i) => { const e = ctx.Entities.fromMember(G, m); e.x = at.x + 30 * (i % 2 ? 1 : -1); e.y = at.y + 30 + 20 * i; return e; });
  const says = [];
  ctx.Events.on('party_say', (p) => says.push(p));
  const battle = ctx.Combat.create({ map: EMPTY_MAP, player, members: mems, monsters: [], rng, G, floor: 1, driveHealer: false });
  return { G, battle, player, members: mems, says, rng };
}
// 죽지 않고(HP 큼) 거의 아프지 않게(공격력 1) 때리는 트롤
function dummy(ctx, battle, x, y, o = {}) {
  const m = ctx.Entities.fromMonster(ctx.Monsters.get('troll'), 1, x, y, battle.rng);
  m.base.maxHp = 1e9; m.base.atk = 1; m.abilities = []; if (o.rooted) m.base.moveSpeed = 0;
  ctx.Entities.refresh(m); m.hp = m.maxHp; m.groupId = o.groupId || 'g';
  battle.addMonster(m);
  return m;
}
const run = (battle, seconds, each, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) { battle.update(dt); if (each) each(t); } };

module.exports = {
  '쿨타임: 전원이 계속 빈사여도 말은 넘치지 않는다(전체 1.5초·급한 말 0.6초 간격, 같은 사람 같은 요청은 쿨마다)'(assert) {
    const ctx = load('all');
    const { battle, members, says } = setup(ctx);
    const troll = dummy(ctx, battle, 12 * T, 12 * T);
    troll.aggro = true; troll.threat[members[0].uid] = 10;
    run(battle, 12, () => { for (const m of members) if (m.alive) m.hp = Math.max(1, Math.round(m.maxHp * 0.2)); });
    assert.ok(says.length >= 3, '조용하면 안 된다: ' + says.length);
    assert.ok(says.length <= 16, '너무 많다: ' + says.length);
    for (let k = 1; k < says.length; k++) {
      const gap = says[k].t - says[k - 1].t;
      assert.ok(gap >= ctx.Chatter.URGENT_GAP - 1e-6, '급한 말도 0.6초 간격 ' + gap);
      if (says[k].priority < 3) assert.ok(gap >= ctx.Chatter.GLOBAL_GAP - 1e-6, '보통 말은 1.5초 간격 ' + gap);
    }
    const byUid = {};
    for (const s of says.filter((x) => x.kind.startsWith('heal_'))) (byUid[s.uid] = byUid[s.uid] || []).push(s.t);
    for (const ts of Object.values(byUid)) for (let k = 1; k < ts.length; k++) assert.ok(ts[k] - ts[k - 1] >= 3.9, '같은 사람 힐 요청 쿨 ' + (ts[k] - ts[k - 1]));
    assert.ok(ctx.Chatter.lineCount() >= 100, '대사 수 ' + ctx.Chatter.lineCount());
  },

  '힐 요청: 전투 중 HP 45% 아래 딜러가 "힐" 을 외치고 wantsHeal 표시, 회복되면 고맙다고 한다'(assert) {
    const ctx = load('all');
    const { battle, player, members, says } = setup(ctx);
    const troll = dummy(ctx, battle, 12 * T, 12 * T);
    troll.aggro = true; troll.threat[members[0].uid] = 10;
    const mage = members[3];
    mage.hp = Math.round(mage.maxHp * 0.25);
    run(battle, 1.5, () => { if (mage.hp / mage.maxHp > 0.25) mage.hp = Math.round(mage.maxHp * 0.25); });
    const req = says.find((s) => s.uid === mage.uid && s.kind.startsWith('heal_'));
    assert.ok(req, '힐 요청: ' + JSON.stringify(says.map((s) => s.kind + ':' + s.text)));
    assert.ok(/힐/.test(req.text), req.text);
    assert.ok(mage.wantsHeal > battle.time, 'wantsHeal 표시');
    battle.heal(player, mage, mage.maxHp);
    run(battle, 3.5);
    assert.ok(!(mage.wantsHeal > battle.time), '회복하면 표시 해제');
    assert.ok(says.some((s) => s.uid === mage.uid && s.kind === 'thanks'), '감사: ' + JSON.stringify(says.map((s) => s.kind)));
    assert.ok(!says.some((s) => s.uid === player.uid), '힐러(플레이어)는 말하지 않는다');
  },

  '탱커 앞장: 무리 앞에서 멈춰 "준비하세요" 류를 외치고, 파티가 모인 뒤 돌진해 교전한다(외침이 어그로보다 먼저)'(assert) {
    const ctx = load('all');
    const { battle, player, members, says } = setup(ctx, { at: { x: 6 * T, y: 10 * T } });
    const tank = members[0];
    const trolls = [dummy(ctx, battle, 24 * T, 10 * T, { groupId: 'pack' }), dummy(ctx, battle, 25 * T, 11 * T, { groupId: 'pack' })];
    assert.strictEqual(ctx.AIParty.leaderOf(battle), tank, '탱커가 앞장');
    const pts = []; for (let x = 7; x <= 24; x++) pts.push({ x: (x + 0.5) * T, y: 10.5 * T });
    ctx.AIParty.lead(battle, pts, { kind: 'group', id: 'pack' });
    let readyAt = null, readyDist = null, aggroAt = null, still = true, readyPos = null, order = null;
    run(battle, 14, () => {
      // 씬처럼 힐러는 앞장이 뒤 2.7타일을 따라간다
      const spot = ctx.AIParty.behindSpot(battle, 2.7 * T, 0, player.radius);
      if (spot && Math.hypot(spot.x - player.x, spot.y - player.y) > 6) battle.moveTo(player, spot.x, spot.y, 0.1);
      const L = battle.lead;
      if (L && L.state === 'ready') {
        if (readyAt == null) { readyAt = battle.time; readyDist = Math.hypot(trolls[0].x - tank.x, trolls[0].y - tank.y); readyPos = { x: tank.x, y: tank.y }; }
        else if (Math.hypot(tank.x - readyPos.x, tank.y - readyPos.y) > 2) still = false;
      }
      if (aggroAt == null && trolls.some((m) => m.aggro)) {
        aggroAt = battle.time;
        order = { tank: Math.hypot(tank.x - trolls[0].x, tank.y - trolls[0].y), healer: Math.hypot(player.x - trolls[0].x, player.y - trolls[0].y) };
      }
    });
    assert.ok(readyAt != null, '풀링 준비 상태가 있어야 한다');
    assert.ok(readyDist >= 7 * T, '어그로 범위 밖에서 멈춘다 ' + (readyDist / T).toFixed(1));
    assert.ok(still, '준비 중엔 제자리');
    assert.ok(aggroAt != null && aggroAt - readyAt >= ctx.AIParty.PULL_WAIT - 1e-6, '모인 뒤 돌진 ' + aggroAt + ' / ' + readyAt);
    const pull = says.find((s) => s.uid === tank.uid && /^pull|^boss/.test(s.kind));
    assert.ok(pull, '탱커 외침: ' + JSON.stringify(says.map((s) => s.kind)));
    assert.ok(pull.t <= aggroAt, '외침이 어그로보다 먼저');
    // 탱커가 먼저, 힐러는 뒤
    assert.ok(order.tank + 2 * T < order.healer, '탱커가 앞, 힐러가 뒤 ' + JSON.stringify(order));
    assert.ok(trolls.every((m) => m.aggro), '교전 시작');
  },

  '앞장이 없으면: 탱커가 없으면 HP 가장 높은 근딜, 파티원이 없으면 null(힐러가 앞장)'(assert) {
    const ctx = load('all');
    const { battle, members } = setup(ctx);
    members[0].alive = false;
    assert.strictEqual(ctx.AIParty.leaderOf(battle), members[1], '근딜');
    for (const m of members) m.alive = false;
    assert.strictEqual(ctx.AIParty.leaderOf(battle), null);
  },
};
