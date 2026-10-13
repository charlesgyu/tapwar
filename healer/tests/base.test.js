const load = require('../tools/load');
module.exports = {
  'RNG 는 결정적이다'(assert) {
    const ctx = load(['core/rng.js']);
    const a = ctx.RNG.make(42), b = ctx.RNG.make(42);
    for (let i = 0; i < 5; i++) assert.strictEqual(a.next(), b.next());
    assert.ok(ctx.RNG.floorSeed(3) !== ctx.RNG.floorSeed(4));
  },
  'Events emit/on/off'(assert) {
    const ctx = load(['core/events.js']);
    let n = 0; const un = ctx.Events.on('x', (p) => { n += p; });
    ctx.Events.emit('x', 2); un(); ctx.Events.emit('x', 5);
    assert.strictEqual(n, 2);
  },
  'State newGame/save/load'(assert) {
    const ctx = load(['core/rng.js', 'core/events.js', 'core/state.js']);
    const G = ctx.State.newGame('테스트');
    assert.strictEqual(G.player.name, '테스트');
    G.player.gold = 999;
    assert.ok(ctx.State.save());
    ctx.State.reset(); assert.ok(!ctx.State.hasSave());
    ctx.State.newGame('x'); G.player.gold = 1; // 새 객체
    const ctx2 = load(['core/rng.js', 'core/events.js', 'core/state.js']);
    assert.ok(!ctx2.State.load());
  },
  // 회귀: 새 게임에서 null 인 칸(장비·길드)에 값이 든 저장을 불러오면 migrate 가 Object.keys(null) 로 터졌다
  'State.load: 장비·길드가 채워진 저장도 불러온다'(assert) {
    const ctx = load(['core/rng.js', 'core/events.js', 'core/state.js']);
    const G = ctx.State.newGame('리프');
    G.player.equipment.hat = { uid: 'h1', id: 'cloth_hat_1', grade: 'common', affixes: [], durability: 50, maxDurability: 50, qty: 1 };
    G.guild = { id: 'guild_oak_shield', name: '참나무 방패단', level: 1, members: [], isOwner: false };
    G.player.gold = 777;
    ctx.State.save();
    ctx.State.set ? ctx.State.set(null) : null;
    assert.ok(ctx.State.load());
    const L = ctx.State.get();
    assert.strictEqual(L.player.gold, 777);
    assert.strictEqual(L.player.equipment.hat.id, 'cloth_hat_1');
    assert.strictEqual(L.guild.id, 'guild_oak_shield');
  },
};
