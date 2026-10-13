// 시뮬레이션 연기 테스트: 1층을 60초(게임 시간) 돌려 봇·층·전투가 오류 없이 맞물리는지 본다.
const sim = require('../tools/sim');

module.exports = {
  '1층 시뮬 60초: 오류 없이 진행, 걸음·통계 필드가 채워진다'(assert) {
    const r = sim.run({ floor: 1, maxSeconds: 60, seed: 1 });
    assert.ok(['cleared', 'wipe', 'timeout'].includes(r.result), r.result);
    assert.strictEqual(r.time, 60, '60초를 다 돌았다 ' + r.time);
    assert.ok(r.steps > 20, '봇이 움직였다 ' + r.steps);
    assert.ok(r.monsters >= 301 && r.chestsTotal >= 16 && r.groupsTotal >= 18);
    assert.ok(r.level === 2 && r.gear === 'normal' && r.partyLevels.length === 5, '적정 레벨 파티 5인');
    assert.ok(r.avgMp > 0 && r.avgMp <= 1, '평균 MP ' + r.avgMp);
    assert.ok(typeof r.skills === 'object' && typeof r.playerDeaths === 'number' && typeof r.memberDeaths === 'number');
    assert.ok(r.boss && r.boss.phases >= 3 && !r.boss.defeated, '보스 페이즈 정보');
    assert.ok(r.realMs < 20000, '실제 시간 ' + r.realMs + 'ms');
  },
  '같은 시드는 같은 결과(결정적), 결과 문자열/표 출력이 만들어진다'(assert) {
    const a = sim.run({ floor: 1, maxSeconds: 30, seed: 7 }), b = sim.run({ floor: 1, maxSeconds: 30, seed: 7 });
    assert.strictEqual(a.steps, b.steps); assert.strictEqual(a.kills, b.kills); assert.deepStrictEqual(a.skills, b.skills);
    const text = sim.fmt(a);
    assert.ok(text.includes('1층') && text.includes('결과:') && text.includes('스킬:'));
    assert.ok(sim.table([a, b]).split('\n').length === 3);
  },
};
