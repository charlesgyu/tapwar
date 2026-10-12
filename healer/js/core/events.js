// 전역 이벤트 버스 — 모듈 간 느슨한 연결(퀘스트 진행, UI 갱신, 통계)
const Events = (() => {
  const handlers = new Map();
  function on(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); return () => off(name, fn); }
  function off(name, fn) { const s = handlers.get(name); if (s) s.delete(fn); }
  function once(name, fn) { const un = on(name, (p) => { un(); fn(p); }); return un; }
  function emit(name, payload) {
    const s = handlers.get(name);
    if (s) for (const fn of Array.from(s)) { try { fn(payload, name); } catch (e) { console.error('[Events]', name, e); } }
    const any = handlers.get('*');
    if (any) for (const fn of Array.from(any)) { try { fn(payload, name); } catch (e) { console.error('[Events]', name, e); } }
  }
  function clear() { handlers.clear(); }
  return { on, off, once, emit, clear };
})();
if (typeof module !== 'undefined') module.exports = Events;
