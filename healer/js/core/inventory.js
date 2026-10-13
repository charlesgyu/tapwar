// 인벤토리 — DESIGN.md §5
// 가방 칸(기본 20 + 가방 장비), 장착 규칙(직업 재질·양손/한손+책·반지 2칸), 벨트 칸(벨트 등급), 세트 집계, 소모품 사용.
// 모든 아이템 획득은 Inventory.add 를 거치므로 'item_gained' 이벤트는 여기서만 낸다(퀘스트 collect 가 듣는다).
const Inventory = (() => {
  const BASE_BAG = 20;
  const BASE_BELT = 1;
  // 해독제가 먼저 푸는 저주 순서(가장 위험한 것부터). AIHealer 의 즉시 해제 규칙과 같다.
  const CLEANSE_PRIORITY = ['root', 'heal_down', 'dot', 'def_down', 'atk_down', 'aspd_down', 'spd_down'];

  const def = (inst) => (inst && typeof Items !== 'undefined' ? Items.get(inst.id) : null);
  const emit = (name, payload) => { if (typeof Events !== 'undefined') Events.emit(name, payload); };
  const fail = (reason) => ({ ok: false, reason });
  function newUid() {
    if (typeof State !== 'undefined' && State.uid) return State.uid();
    return 'i' + Math.random().toString(36).slice(2, 10);
  }

  // ---- 가방 칸 ----
  function bagSize(G) {
    const d = def(G.player.equipment.bag);
    return BASE_BAG + ((d && d.bagSize) || 0);
  }
  // bag 배열 길이를 bagSize 에 맞춘다. 줄어들 때는 아이템을 앞으로 모은다(호출 전에 들어가는지 확인한다).
  function ensureBag(G) {
    const p = G.player, size = bagSize(G);
    if (!Array.isArray(p.bag)) p.bag = [];
    if (p.bag.length > size) p.bag = p.bag.filter(Boolean);
    while (p.bag.length < size) p.bag.push(null);
    p.bagSize = size;
    return p.bag;
  }
  function items(G) { return ensureBag(G).filter(Boolean); }
  function emptySlots(G) { return ensureBag(G).filter((it) => !it).length; }
  function isFull(G) { return emptySlots(G) === 0; }
  function indexOf(G, uid) { return ensureBag(G).findIndex((it) => it && it.uid === uid); }

  function find(G, uid) {
    const i = indexOf(G, uid);
    if (i >= 0) return G.player.bag[i];
    for (const it of Object.values(G.player.equipment)) if (it && it.uid === uid) return it;
    return null;
  }
  function locate(G, uid) {
    const i = indexOf(G, uid);
    if (i >= 0) return { where: 'bag', index: i, inst: G.player.bag[i] };
    for (const [slot, it] of Object.entries(G.player.equipment)) if (it && it.uid === uid) return { where: 'equip', slot, inst: it };
    return null;
  }
  function count(G, itemId) {
    let n = 0;
    for (const it of items(G)) if (it.id === itemId) n += it.qty || 1;
    return n;
  }

  // 스택 가능한 아이템이 들어갈 수 있는 총량(기존 스택 여유 + 빈칸)
  function stackRoom(bag, d) {
    let room = 0;
    for (const it of bag) room += it ? (it.id === d.id ? Math.max(0, d.stack - (it.qty || 1)) : 0) : d.stack;
    return room;
  }
  function addStack(bag, inst, d) {
    let qty = inst.qty || 1;
    for (const it of bag) {
      if (!qty) break;
      if (it && it.id === d.id && (it.qty || 1) < d.stack) { const n = Math.min(qty, d.stack - (it.qty || 1)); it.qty = (it.qty || 1) + n; qty -= n; }
    }
    let first = true;
    for (let i = 0; i < bag.length && qty; i++) {
      if (bag[i]) continue;
      const n = Math.min(qty, d.stack);
      // 첫 새 칸은 원래 객체를 쓰고(uid 유지), 넘치는 칸은 새 uid 를 준다
      bag[i] = first ? Object.assign(inst, { qty: n }) : Object.assign({}, inst, { uid: newUid(), qty: n });
      first = false; qty -= n;
    }
  }
  // 전부 들어갈 때만 넣는다(일부만 들어가면 드랍 처리가 꼬이므로). 성공 시 'item_gained' { id, qty, uid, inst }.
  function add(G, inst) {
    const d = def(inst); if (!d) return false;
    const bag = ensureBag(G);
    const qty = inst.qty || 1;
    if (Items.isStackable(d)) {
      if (stackRoom(bag, d) < qty) return false;
      addStack(bag, inst, d);
    } else {
      const i = bag.indexOf(null); if (i < 0) return false;
      inst.qty = 1; bag[i] = inst;
    }
    emit('item_gained', { id: d.id, qty, uid: inst.uid, inst });
    return true;
  }
  // 가방에서 qty 만큼 뺀다(기본: 그 칸 전부). 뺀 수량을 돌려주고 없으면 0.
  function remove(G, uid, qty) {
    const i = indexOf(G, uid); if (i < 0) return 0;
    const it = G.player.bag[i];
    const have = it.qty || 1, n = qty == null ? have : Math.min(have, qty | 0);
    if (n <= 0) return 0;
    if (n >= have) G.player.bag[i] = null; else it.qty = have - n;
    emit('item_removed', { id: it.id, qty: n, uid });
    return n;
  }
  // itemId 기준으로 qty 개 소모(여러 스택에 걸쳐). 부족하면 아무것도 안 빼고 false.
  function consume(G, itemId, qty = 1) {
    if (count(G, itemId) < qty) return false;
    let left = qty;
    for (const it of items(G)) { if (!left) break; if (it.id === itemId) left -= remove(G, it.uid, left); }
    return true;
  }

  // ---- 장착 ----
  const isTwoHanded = (inst) => { const d = def(inst); return !!d && d.hands === 'two'; };
  function canEquip(G, inst) {
    const d = def(inst);
    if (!d || d.kind !== 'equip') return fail('not_equip');
    if (d.armor && !Items.canUse(d, G.player.cls)) return fail('wrong_armor');
    if (d.weapon && !Items.canUse(d, G.player.cls)) return fail('wrong_weapon');
    if (d.levelReq && (G.player.level || 1) < d.levelReq) return fail('level');
    return { ok: true };
  }
  // 반지는 빈 칸 우선, 둘 다 차 있으면 첫째를 교체. hint('ring1'|'ring2')를 주면 그 칸에 끼운다(상태창 슬롯 탭).
  function targetSlot(G, d, hint) {
    if (d.slot !== 'ring') return d.slot;
    if (hint === 'ring1' || hint === 'ring2') return hint;
    const eq = G.player.equipment;
    return !eq.ring1 ? 'ring1' : (!eq.ring2 ? 'ring2' : 'ring1');
  }
  // 장착 때 벗겨질 슬롯 목록: 같은 슬롯 + 양손/보조 충돌
  function displacedSlots(G, d, slot) {
    const eq = G.player.equipment, out = [];
    if (eq[slot]) out.push(slot);
    if (d.slot === 'main' && d.hands === 'two' && eq.off) out.push('off');
    if (d.slot === 'off' && eq.main && isTwoHanded(eq.main)) out.push('main');
    return out;
  }
  function placeInBag(G, inst) {
    const bag = G.player.bag, i = bag.indexOf(null);
    if (i >= 0) bag[i] = inst;
    return i >= 0;
  }
  // 벨트 배열 길이를 칸 수에 맞춘다(줄면 뒤쪽 등록이 사라진다)
  function syncBelt(G) {
    const n = beltSlots(G), p = G.player;
    if (!Array.isArray(p.belt)) p.belt = [];
    p.belt = p.belt.slice(0, n);
    while (p.belt.length < n) p.belt.push(null);
    return p.belt;
  }
  function afterSlotChange(G, slot) {
    if (slot === 'bag') ensureBag(G);
    if (slot === 'belt') syncBelt(G);
  }
  function equip(G, uid, slotHint) {
    const i = indexOf(G, uid); if (i < 0) return fail('not_found');
    const inst = G.player.bag[i], d = def(inst);
    const chk = canEquip(G, inst); if (!chk.ok) return chk;
    const slot = targetSlot(G, d, slotHint), displaced = displacedSlots(G, d, slot);
    // 공간: 장착하면 가방 한 칸이 비고, 벗겨진 장비가 그만큼 들어가야 한다. 가방 교체는 새 칸 수 기준.
    const after = items(G).length - 1 + displaced.length;
    const cap = d.slot === 'bag' ? BASE_BAG + (d.bagSize || 0) : bagSize(G);
    if (after > cap) return fail('bag_full');
    const eq = G.player.equipment;
    G.player.bag[i] = null;
    const removed = displaced.map((s) => { const it = eq[s]; eq[s] = null; return it; });
    eq[slot] = inst;
    afterSlotChange(G, d.slot);
    for (const it of removed) placeInBag(G, it);
    emit('equip_changed', { slot, uid: inst.uid, id: inst.id, unequipped: removed.map((it) => it.uid) });
    return { ok: true, slot, unequipped: removed };
  }
  function unequip(G, slot) {
    const eq = G.player.equipment;
    const inst = eq[slot]; if (!inst) return fail('empty');
    const d = def(inst);
    const cap = d && d.slot === 'bag' ? BASE_BAG : bagSize(G);
    if (items(G).length + 1 > cap) return fail('bag_full');
    eq[slot] = null;
    afterSlotChange(G, d ? d.slot : slot);
    placeInBag(G, inst);
    emit('equip_changed', { slot, uid: null, id: null, unequipped: [inst.uid] });
    return { ok: true, inst };
  }
  function equipped(G) { return Object.entries(G.player.equipment).filter(([, it]) => it).map(([slot, inst]) => ({ slot, inst })); }
  // 내구도 감소(피격·시전). slots 생략 시 가방·벨트를 뺀 모든 장비.
  function wear(G, amount, slots) {
    const eq = G.player.equipment;
    const keys = slots || Object.keys(eq).filter((s) => s !== 'bag' && s !== 'belt');
    for (const s of keys) { const it = eq[s]; if (it && typeof it.durability === 'number') it.durability = Math.max(0, it.durability - amount); }
  }

  // ---- 벨트 ----
  function beltSlots(G) {
    const inst = G.player.equipment.belt, d = def(inst);
    if (!d) return BASE_BELT;
    if (d.beltSlots) return d.beltSlots;
    const g = Items.GRADES[inst.grade];
    return (g && g.beltSlots) || BASE_BELT;
  }
  function setBelt(G, idx, itemId) {
    const belt = syncBelt(G);
    if (!(idx >= 0 && idx < belt.length)) return false;
    if (itemId != null) { const d = Items.get(itemId); if (!d || d.kind !== 'consume') return false; }
    belt[idx] = itemId == null ? null : itemId;
    emit('belt_changed', { idx, itemId: belt[idx] });
    return true;
  }

  // ---- 세트 ----
  function activeSets(G) {
    const counts = {};
    for (const { inst } of equipped(G)) { const d = def(inst); if (d && d.setId) counts[d.setId] = (counts[d.setId] || 0) + 1; }
    return Object.entries(counts).map(([setId, n]) => ({ setId, count: n, bonuses: Items.setBonus(setId, n) }));
  }

  // ---- 소모품 ----
  function maxOf(G, tgt, key) {
    if (typeof tgt[key] === 'number') return tgt[key];
    if (typeof Stats !== 'undefined' && Stats.derive) { try { return Stats.derive(tgt, G)[key]; } catch (e) { /* 파생 실패 시 상한 없음 */ } }
    return Infinity;
  }
  function restore(G, tgt, key, flat, pct) {
    if (tgt.alive === false) return;
    const max = maxOf(G, tgt, key === 'hp' ? 'maxHp' : 'maxMp');
    const gain = (flat || 0) + (pct ? max * pct : 0);
    tgt[key] = Math.min(max, (tgt[key] || 0) + gain);
  }
  function cleanseCurses(tgt, n) {
    if (!Array.isArray(tgt.curses) || !tgt.curses.length) return;
    const rank = (c) => { const i = CLEANSE_PRIORITY.indexOf(c.id); return i < 0 ? 99 : i; };
    const sorted = tgt.curses.slice().sort((a, b) => rank(a) - rank(b));
    const gone = new Set(sorted.slice(0, n));
    tgt.curses = tgt.curses.filter((c) => !gone.has(c));
  }
  // 같은 음식 버프는 갱신(중복 안 쌓임). 시계는 전투 중이면 battle.time, 아니면 G.playTime.
  function applyBuff(tgt, id, buff, now) {
    if (!Array.isArray(tgt.buffs)) tgt.buffs = [];
    tgt.buffs = tgt.buffs.filter((b) => b.id !== id);
    tgt.buffs.push({ id, stat: buff.stat, value: buff.value, until: now + (buff.duration || 600) });
  }
  function applyEffect(G, id, fx, tgt, now) {
    if (fx.hp || fx.hpPct) restore(G, tgt, 'hp', fx.hp, fx.hpPct);
    if (fx.mp || fx.mpPct) restore(G, tgt, 'mp', fx.mp, fx.mpPct);
    if (fx.cleanse) cleanseCurses(tgt, fx.cleanse);
    if (fx.fatigue) G.player.fatigue = Math.min(100, Math.max(0, (G.player.fatigue || 0) + fx.fatigue));
    if (fx.buff) applyBuff(tgt, id, fx.buff, now);
    if (fx.resetTickets) G.auction.resetTickets = (G.auction.resetTickets || 0) + fx.resetTickets;
    if (fx.teleport) emit('return_town', { reason: 'scroll', to: fx.teleport });
  }
  // targetEntity: 전투 엔티티(hp/maxHp/curses 보유) 또는 생략 시 G.player. now: 버프 시계(전투 중 battle.time).
  function useConsumable(G, itemId, targetEntity, now) {
    const d = Items.get(itemId);
    if (!d || d.kind !== 'consume' || !d.effect) return false;
    const stack = items(G).find((it) => it.id === itemId); if (!stack) return false;
    const tgt = targetEntity || G.player;
    const clock = typeof now === 'number' ? now : (G.playTime || 0);
    applyEffect(G, d.id, d.effect, tgt, clock);
    remove(G, stack.uid, 1);
    emit('consumable_used', { id: d.id, effect: d.effect, targetUid: tgt.uid || null, isPlayer: tgt === G.player });
    return true;
  }

  return { add, remove, consume, find, locate, count, items, emptySlots, isFull, bagSize, ensureBag,
    equip, unequip, canEquip, equipped, wear, setBelt, beltSlots, syncBelt, activeSets, useConsumable,
    BASE_BAG, BASE_BELT, CLEANSE_PRIORITY };
})();
if (typeof module !== 'undefined') module.exports = Inventory;
