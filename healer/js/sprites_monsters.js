// 몬스터 스프라이트 레지스트리 — 바이옴별 파일(sprites_monsters_forest.js, sprites_monsters_cave.js)이 builder 를 등록한다.
// 시트 규격: { down, up, right, left: [캔버스 × 4프레임], attack?: [캔버스...], anchor: {x, y}(발 중앙), w, h }
const MonsterSprites = (() => {
  const builders = new Map();
  const cache = new Map();

  function register(id, builder) { builders.set(id, builder); cache.delete(id); }
  function list() { return Array.from(builders.keys()); }
  function has(id) { return builders.has(id); }

  // 최근접 확대(엘리트/중간보스용) — 시트 전체를 factor 배로
  function scaled(sheet, factor) {
    const up = (c) => { const n = Pixel.make(c.width * factor, c.height * factor); const x = n.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, n.width, n.height); return n; };
    const out = { anchor: { x: sheet.anchor.x * factor, y: sheet.anchor.y * factor }, w: sheet.w * factor, h: sheet.h * factor };
    for (const k of ['down', 'up', 'right', 'left', 'attack']) if (sheet[k]) out[k] = sheet[k].map(up);
    return out;
  }
  // 색조 입히기(중간보스 변형 표시용): 불투명 픽셀 위에 색을 alpha 만큼 섞는다
  function tinted(sheet, color, alpha = 0.25) {
    const t = (c) => { const n = Pixel.make(c.width, c.height); const x = n.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, n.width, n.height); return n; };
    const out = { anchor: sheet.anchor, w: sheet.w, h: sheet.h };
    for (const k of ['down', 'up', 'right', 'left', 'attack']) if (sheet[k]) out[k] = sheet[k].map(t);
    return out;
  }
  // 등록되지 않은 id 용 대체 스프라이트(보라색 슬라임 + ?) — 게임이 멈추지 않게
  function fallback(id) {
    const w = 32, h = 32;
    const mk = (bob) => { const c = Pixel.make(w, h); const ctx = c.getContext('2d'); Pixel.ellipse(ctx, 16, 29, 10, 3, 'rgba(0,0,0,0.2)'); Pixel.circle(ctx, 16, 18 + bob, 11, '#3b2a2a'); Pixel.circle(ctx, 16, 18 + bob, 10, '#9b6fd6'); Pixel.circle(ctx, 12, 14 + bob, 3, '#d9c3ff'); Pixel.rect(ctx, 12, 18 + bob, 2, 2, '#2a1a3a'); Pixel.rect(ctx, 18, 18 + bob, 2, 2, '#2a1a3a'); return c; };
    const frames = [mk(0), mk(-1), mk(0), mk(1)];
    return { down: frames, up: frames, right: frames, left: frames, anchor: { x: 16, y: 30 }, w, h, missing: id };
  }
  function get(id) {
    if (cache.has(id)) return cache.get(id);
    let sheet;
    const b = builders.get(id);
    if (b) { try { sheet = b(); } catch (e) { console.error('[MonsterSprites]', id, e); sheet = fallback(id); } }
    else sheet = fallback(id);
    if (!sheet.w) sheet.w = sheet.down[0].width;
    if (!sheet.h) sheet.h = sheet.down[0].height;
    if (!sheet.left && sheet.right) sheet.left = sheet.right.map(Pixel.flipH);
    if (!sheet.up) sheet.up = sheet.down;
    cache.set(id, sheet);
    return sheet;
  }
  // 몬스터 정의(mDef)에 맞는 시트: size 2 는 ×1.5(반올림 없이 캔버스 배율은 정수여야 하므로 size2 → 원본이 48px 급이면 그대로, 32px 급이면 ×2 후 tint), size 3 은 보스 전용 시트 또는 ×2
  function forDef(mDef) {
    const base = get(mDef.sprite || mDef.id);
    if (mDef.tier === 'miniboss') {
      const key = 'mini:' + mDef.id;
      if (!cache.has(key)) { const s = tinted(base.w <= 34 ? scaled(base, 2) : base, '#ff4040', 0.18); cache.set(key, s); }
      return cache.get(key);
    }
    return base;
  }
  return { register, get, list, has, scaled, tinted, forDef, fallback };
})();
if (typeof module !== 'undefined') module.exports = MonsterSprites;
