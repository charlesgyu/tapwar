// 결정적 난수 (mulberry32) — 던전 생성/경매장 회전 등 재현이 필요한 곳에 사용
const RNG = (() => {
  function make(seed) {
    let a = (seed >>> 0) || 1;
    const next = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      int(min, max) { return min + Math.floor(next() * (max - min + 1)); },      // [min, max]
      float(min, max) { return min + next() * (max - min); },
      chance(p) { return next() < p; },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      weighted(items) { // [{ weight, ... }] 또는 [{ id, weight }]
        let total = 0; for (const it of items) total += it.weight || 1;
        let x = next() * total;
        for (const it of items) { x -= (it.weight || 1); if (x < 0) return it; }
        return items[items.length - 1];
      },
      shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    };
    return r;
  }
  let _global = make((Date.now() & 0xffffffff) >>> 0);
  function global() { return _global; }
  function seedGlobal(seed) { _global = make(seed); }
  function floorSeed(floor) { return 1000 + floor * 7919; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  return { make, global, seedGlobal, floorSeed, hash };
})();
if (typeof module !== 'undefined') module.exports = RNG;
