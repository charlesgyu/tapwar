// 구인구직 게시판(Recruit) — 시장 결정성, 지원 수락, 합류 파티 해산, 게시료, 역할 칸 쌓기, 지원자, 취소 환불
const load = require('../tools/load');
const boot = () => { const c = load('all'); const G = c.State.newGame('리프'); return Object.assign(c, { G }); };
const T0 = 1800000000000;   // 고정 시각(ms)
const pick = (p) => ({ title: p.title, floor: p.floor, lr: p.levelRange, tags: p.tags, slots: p.slots, names: p.members.map((m) => `${m.name}/${m.cls}/${m.role}/${m.level}`), gold: p.bonusGold });

module.exports = {
  '시장: 같은 버킷이면 같은 모집글, 다른 버킷이면 다름, 10~16개, 힐러 지원 가능한 글 ≥ 3'(assert) {
    const { Recruit, G } = boot();
    const b = Recruit.bucketOf(T0);
    const a = Recruit.generate(G, b).map(pick), a2 = Recruit.generate(G, b).map(pick);
    assert.deepStrictEqual(a, a2, '결정적');
    assert.notDeepStrictEqual(Recruit.generate(G, b + 1).map(pick), a, '다음 버킷은 다른 글');
    const list = Recruit.posts(G, T0);
    assert.ok(list.length >= 10 && list.length <= 16, `글 ${list.length}개`);
    assert.ok(list.filter((p) => Recruit.fits(G, p)).length >= 3, '1레벨이 지원할 수 있는 힐러 모집글');
    assert.ok(list.some((p) => !Recruit.healerOpen(p)), '힐러 자리 없는 글도 섞여 있다');
    for (const p of list) {
      assert.ok(p.members.length >= 1 && p.members.length + Recruit.slotTotal(p.slots) <= 5, '구성 인원');
      assert.ok(p.title && p.tags.length >= 1 && p.floor >= 1 && p.floor <= 10);
      if (Recruit.healerOpen(p)) assert.ok(p.members.length + Recruit.slotTotal(p.slots) - 1 <= 4, '합류 후 파티원 ≤ 4');
    }
    // 같은 버킷 안에서 다시 불러도 같은 시장 객체
    assert.strictEqual(Recruit.market(G, T0 + 1000), Recruit.market(G, T0));
  },

  '시장 tick: 시간이 흐르면 자리가 차고 새 글이 오며 개수는 10~16 유지'(assert) {
    const { Recruit, G } = boot();
    const start = Recruit.bucketOf(T0) * Recruit.BUCKET_MS + 1000;
    Recruit.market(G, start);
    const kinds = {};
    for (let t = 1; t <= 40; t++) {
      const { events } = Recruit.tick(G, start + t * Recruit.CHURN_MS);
      for (const e of events) kinds[e.type] = (kinds[e.type] || 0) + 1;
      const n = Recruit.posts(G, start + t * Recruit.CHURN_MS).length;
      assert.ok(n >= 10 && n <= 16, `글 ${n}개`);
    }
    assert.ok(kinds.slot_filled > 0 && kinds.post_new > 0, JSON.stringify(kinds));
    assert.ok(Recruit.counters(G, start + 40 * Recruit.CHURN_MS).matchedToday > 0);
  },

  '지원: 레벨 적합도 — 범위 안 높음, 아래 낮음, 훨씬 위는 수락하지만 보상 분배 감소'(assert) {
    const { Recruit, RNG, G } = boot();
    const p = { levelRange: [5, 7] };
    G.player.level = 6; const ok = Recruit.fit(G, p);
    G.player.level = 3; const low = Recruit.fit(G, p);
    G.player.level = 12; const high = Recruit.fit(G, p);
    assert.ok(ok.chance >= 0.9 && low.chance <= 0.3 && high.chance >= 0.9, `${ok.chance} ${low.chance} ${high.chance}`);
    assert.strictEqual(ok.bonusMult, 1); assert.ok(high.bonusMult < 1);
    // 실제 apply 의 수락률(여러 번 굴려 비교)
    const rate = (level) => {
      let acc = 0;
      const c = boot(); c.G.player.level = level;
      const post = c.Recruit.posts(c.G, T0).find((q) => c.Recruit.healerOpen(q));
      post.levelRange = [5, 7];
      for (let i = 0; i < 200; i++) {
        c.G.recruit.pending = null;
        const r = c.Recruit.apply(c.G, post.id, T0, RNG.make(i + 1));
        assert.ok(r.ok && r.delay >= 2000 && r.delay <= 6000);
        if (c.G.recruit.pending.accepted) acc++;
      }
      return acc / 200;
    };
    const inRate = rate(6), lowRate = rate(2);
    assert.ok(inRate > 0.8 && lowRate < 0.2, `in ${inRate} low ${lowRate}`);
  },

  '지원 → 검토 → 합류: G.party 교체, 목표 층 고정, 돌파 후 해산·보상 지급, 원래 파티 복귀'(assert) {
    const { Recruit, Party, RNG, G, Floor } = boot();
    const old = Party.generateMember(RNG.make(3), 2, { cls: 'warrior', role: 'tank' });
    G.party.push(old);
    const post = Recruit.posts(G, T0).find((p) => Recruit.fits(G, p));
    // 수락이 나오는 rng 를 찾는다(적정 레벨이라 거의 첫 시도)
    let seed = 1; for (;; seed++) { const r = RNG.make(seed); if (r.next() < Recruit.fit(G, post).chance) break; }
    const ap = Recruit.apply(G, post.id, T0, RNG.make(seed));
    assert.ok(ap.ok);
    assert.strictEqual(Recruit.apply(G, post.id, T0).reason, 'pending', '검토 중엔 다른 지원 불가');
    assert.strictEqual(Recruit.tick(G, T0 + 1000).events.filter((e) => e.type === 'apply_result').length, 0, '아직 검토 중');
    const res = Recruit.tick(G, T0 + 7000).events.find((e) => e.type === 'apply_result');
    assert.ok(res && res.ok, JSON.stringify(res));
    const j = G.recruit.joined;
    assert.ok(j && j.floor === post.floor && j.leaderName === post.leader.name && j.rewardBonus > 0);
    assert.ok(G.party.length >= 1 && G.party.length <= 4 && G.party.includes(post.leader), '파티 = 모집글 파티');
    assert.ok(!G.party.includes(old));
    assert.ok(!G.party.some((m) => m.role === 'healer' && m === post.leader));
    assert.strictEqual(Recruit.allowedFloor(G), post.floor);
    assert.strictEqual(Recruit.apply(G, post.id, T0 + 8000).reason, 'joined');
    // 실제 Floor.leave 로 돌파 처리
    const gold0 = G.player.gold;
    const fs = Floor.start(G, post.floor);
    const sum = Floor.leave(fs, G, 'cleared');
    assert.ok(sum.recruit && sum.recruit.kind === 'joined' && sum.recruit.bonusGold === j.rewardBonus);
    assert.strictEqual(G.player.gold, gold0 + j.rewardBonus);
    assert.strictEqual(G.recruit.joined, null);
    assert.strictEqual(JSON.stringify(G.party.map((m) => m.uid)), JSON.stringify([old.uid]), '원래 파티 복귀');
    assert.strictEqual(Recruit.allowedFloor(G), null);
    assert.strictEqual(G.recruit.history[0].bonusGold, j.rewardBonus);
  },

  '전멸/귀환이면 보상 없이 해산, 탈퇴하면 즉시 원래 파티'(assert) {
    const { Recruit, RNG, G, Floor } = boot();
    const post = Recruit.posts(G, T0).find((p) => Recruit.fits(G, p));
    Recruit.join(G, post, 1, T0);
    const gold0 = G.player.gold;
    const sum = Floor.leave(Floor.start(G, post.floor), G, 'wipe');
    assert.strictEqual(sum.recruit.bonusGold, 0); assert.strictEqual(G.player.gold, gold0);
    assert.strictEqual(G.party.length, 0); assert.strictEqual(G.recruit.joined, null);
    const post2 = Recruit.posts(G, T0).find((p) => Recruit.fits(G, p) && p.state === 'open');
    Recruit.join(G, post2, 1, T0);
    assert.ok(G.party.length > 0);
    assert.ok(Recruit.leave(G).ok); assert.strictEqual(G.party.length, 0);
    // 거절되면 같은 글엔 다시 못 낸다
    const post3 = Recruit.posts(G, T0).find((p) => Recruit.healerOpen(p) && p.state === 'open');
    let seed = 1; for (;; seed++) if (RNG.make(seed).next() >= Recruit.fit(G, post3).chance) break;
    Recruit.apply(G, post3.id, T0, RNG.make(seed));
    const r = Recruit.tick(G, T0 + 7000).events.find((e) => e.type === 'apply_result');
    assert.ok(r && !r.ok);
    assert.strictEqual(Recruit.apply(G, post3.id, T0 + 8000).reason, 'already_rejected');
    assert.strictEqual(Recruit.apply(G, 'nope', T0).reason, 'gone');
    const other = Recruit.posts(G, T0).find((p) => p.state === 'open' && !(p.slots.healer > 0));
    if (other) assert.strictEqual(Recruit.apply(G, other.id, T0 + 8000).reason, 'no_healer_slot');
  },

  '게시료: 시작 골드 300 으로는 1~2칸 모집도 못 올린다, 층·칸 수에 비례'(assert) {
    const { Recruit, G } = boot();
    assert.strictEqual(G.player.gold, 300);
    assert.ok(Recruit.feeFor(1, 1) > 300 && Recruit.feeFor(1, 2) > 300);
    assert.strictEqual(Recruit.feeFor(1, 1), 400);
    assert.strictEqual(Recruit.feeFor(3, 2), 2 * (150 + 60 * 3));
    assert.ok(Recruit.feeFor(5, 2) > Recruit.feeFor(1, 2) && Recruit.feeFor(1, 4) > Recruit.feeFor(1, 2));
    const d = Recruit.newDraft(G); Recruit.addSlot(G, d, 'tank');
    const r = Recruit.post(G, d, T0);
    assert.strictEqual(r.reason, 'gold'); assert.strictEqual(G.player.gold, 300, '실패하면 골드 그대로');
    assert.strictEqual(Recruit.post(G, Recruit.newDraft(G), T0).reason, 'no_slots');
    const locked = Recruit.newDraft(G); locked.floor = 3; Recruit.addSlot(G, locked, 'tank'); G.player.gold = 99999;
    assert.strictEqual(Recruit.post(G, locked, T0).reason, 'floor_locked');
  },

  '역할 버튼: 누를수록 칸이 쌓이고(탱커 2·근딜 2) 정원 4 를 넘지 못한다, 빼기·초기화'(assert) {
    const { Recruit, Party, RNG, G } = boot();
    const d = Recruit.newDraft(G);
    Recruit.addSlot(G, d, 'tank'); Recruit.addSlot(G, d, 'tank');
    Recruit.addSlot(G, d, 'melee'); Recruit.addSlot(G, d, 'melee');
    assert.deepStrictEqual(Object.assign({}, d.slots), { tank: 2, melee: 2, ranged: 0, healer: 0 });
    assert.strictEqual(Recruit.addSlot(G, d, 'melee').reason, 'slots_full');
    assert.ok(Recruit.removeSlot(d, 'tank').ok); assert.strictEqual(d.slots.tank, 1);
    assert.strictEqual(Recruit.removeSlot(d, 'ranged').reason, 'empty');
    Recruit.resetSlots(d); assert.strictEqual(Recruit.slotTotal(d.slots), 0);
    // 이미 파티원이 있으면 남은 자리만큼만
    G.party.push(Party.generateMember(RNG.make(1), 1), Party.generateMember(RNG.make(2), 1), Party.generateMember(RNG.make(3), 1));
    assert.strictEqual(Recruit.slotCap(G), 1);
    Recruit.addSlot(G, d, 'ranged');
    assert.strictEqual(Recruit.addSlot(G, d, 'ranged').reason, 'slots_full');
  },

  '모집 등록 → 지원자는 요청한 역할만, 레벨은 층 권장 근처 → 수락·마감 → 리더 파티 → 판 끝나면 해산'(assert) {
    const { Recruit, Floors, G, Floor } = boot();
    G.player.gold = 5000; G.tower.highestCleared = 2;
    const d = Recruit.newDraft(G); d.floor = 3;
    Recruit.addSlot(G, d, 'tank'); Recruit.addSlot(G, d, 'ranged'); Recruit.addSlot(G, d, 'ranged');
    const fee = Recruit.draftFee(d);
    const r = Recruit.post(G, d, T0);
    assert.ok(r.ok && r.fee === fee && G.player.gold === 5000 - fee);
    assert.strictEqual(Recruit.post(G, d, T0).reason, 'posting');
    const ps = G.recruit.posting;
    const [lo, hi] = Floors.get(3).levelRange;
    let t = T0;
    const seen = [];
    for (let i = 0; i < 40 && ps.applicants.length + seen.length < 12; i++) {
      t += 3000;
      const ev = Recruit.tick(G, t).events.filter((e) => e.type === 'applicant');
      for (const e of ev) seen.push(e);
      // 대기열이 차면 거절해서 비운다(계속 오는지 보려고)
      if (ps.applicants.length >= 5) Recruit.rejectApplicant(G, ps.applicants[0].id);
    }
    assert.ok(seen.length >= 5, `지원자 ${seen.length}명`);
    for (const e of seen) {
      assert.ok(e.role === 'tank' || e.role === 'ranged', e.role);
      assert.ok(e.level >= lo - 1 && e.level <= hi + 1, `Lv.${e.level}`);
    }
    // 탱커 1 수락 → 두 번째 탱커는 거절(정원)
    const tankApp = () => ps.applicants.find((a) => a.member.role === 'tank');
    while (!tankApp()) { t += 3000; Recruit.tick(G, t); if (ps.applicants.length >= 5) Recruit.rejectApplicant(G, ps.applicants.find((a) => a.member.role !== 'tank').id); }
    const tk = tankApp(); assert.ok(Recruit.acceptApplicant(G, tk.id).ok);
    assert.ok(!ps.applicants.some((a) => a.member.role === 'tank'), '찬 역할의 대기자는 돌려보냄');
    assert.strictEqual(Recruit.closePosting(G).ok, true);
    assert.strictEqual(G.party.length, 1); assert.strictEqual(G.party[0].role, 'tank');
    assert.strictEqual(Recruit.allowedFloor(G), 3);
    const sum = Floor.leave(Floor.start(G, 3), G, 'escape');
    assert.strictEqual(sum.recruit.kind, 'leading');
    assert.strictEqual(G.party.length, 0); assert.strictEqual(Recruit.allowedFloor(G), null);
  },

  '모집 취소: 게시료 절반 환불, 마감은 수락한 사람이 있어야'(assert) {
    const { Recruit, G } = boot();
    G.player.gold = 1000;
    const d = Recruit.newDraft(G); Recruit.addSlot(G, d, 'tank'); Recruit.addSlot(G, d, 'melee');
    const fee = Recruit.post(G, d, T0).fee;
    assert.strictEqual(Recruit.closePosting(G).reason, 'no_members');
    const c = Recruit.cancelPosting(G);
    assert.ok(c.ok && c.refund === Math.floor(fee / 2));
    assert.strictEqual(G.player.gold, 1000 - fee + Math.floor(fee / 2));
    assert.strictEqual(G.recruit.posting, null);
    assert.strictEqual(Recruit.cancelPosting(G).reason, 'none');
  },

  '저장 호환: recruit 없는 옛 저장도 불러오면 기본값이 생긴다'(assert) {
    const { State, Recruit } = boot();
    const G = State.get(); delete G.recruit; State.save();
    assert.ok(State.load());
    const L = State.get();
    assert.ok(L.recruit && L.recruit.joined === null && Array.isArray(L.recruit.history));
    assert.ok(Recruit.posts(L, T0).length >= 10);
  },
};
