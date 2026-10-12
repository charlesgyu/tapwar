// 던전 타일 레지스트리 — 바이옴 구현(tiles_forest.js, tiles_cave.js)이 registerBiome 으로 등록한다.
// 타일 값: 0 벽/나무, 1 바닥, 2 물, 3 바닥 장식, 4 덤불/바위(통행 불가, 숨김 상자 가림)
const DungeonTiles = (() => {
  const TILE = 32, CHUNK = 16; // 청크 = 16×16 타일 = 512×512px
  const biomes = new Map();
  let chestCache = {}, exitCache = null;

  function registerBiome(name, impl) { biomes.set(name, impl); }
  function biome(name) { return biomes.get(name) || biomes.values().next().value || null; }

  // 청크 캔버스 (map.biome 에 등록된 구현으로 그림). 구현이 없으면 단색 대체.
  function chunk(map, ci, cj) {
    const impl = biome(map.biome);
    const c = Pixel.make(CHUNK * TILE, CHUNK * TILE);
    if (impl && impl.chunk) { impl.chunk(c.getContext('2d'), map, ci, cj, { TILE, CHUNK }); return c; }
    const ctx = c.getContext('2d');
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const ti = ci * CHUNK + i, tj = cj * CHUNK + j;
      const t = (ti < map.cols && tj < map.rows) ? map.tiles[tj * map.cols + ti] : 0;
      ctx.fillStyle = ['#3a4a3a', '#8fbf6a', '#4f8ac9', '#7fb35a', '#2f6b2f'][t] || '#000';
      ctx.fillRect(i * TILE, j * TILE, TILE, TILE);
    }
    return c;
  }
  function minimapColor(tile, biomeName) {
    const impl = biome(biomeName);
    if (impl && impl.minimapColor) return impl.minimapColor(tile);
    return ['#223322', '#9ccc5a', '#4f8ac9', '#8fbf55', '#2f6b2f'][tile] || '#000';
  }
  // 상자(열림/닫힘, type: normal|hidden|quest) — 바이옴 구현에 chestSprite 가 있으면 우선
  function chestSprite(open, type = 'normal') {
    const key = (open ? 'o' : 'c') + ':' + type;
    if (chestCache[key]) return chestCache[key];
    const impl = Array.from(biomes.values()).find(b => b.chestSprite);
    let c;
    if (impl) c = impl.chestSprite(open, type);
    else {
      c = Pixel.make(28, 24); const ctx = c.getContext('2d');
      const body = type === 'hidden' ? '#7a4fb8' : (type === 'quest' ? '#c9a23a' : '#8b5a2b');
      Pixel.ellipse(ctx, 14, 22, 12, 2, 'rgba(0,0,0,0.2)');
      Pixel.rect(ctx, 2, 8, 24, 13, '#3b2a2a'); Pixel.rect(ctx, 3, 9, 22, 11, body);
      Pixel.rect(ctx, 2, open ? 2 : 6, 24, open ? 4 : 5, '#3b2a2a'); Pixel.rect(ctx, 3, open ? 3 : 7, 22, open ? 2 : 3, Pixel.shade(body, 0.2));
      Pixel.rect(ctx, 12, 12, 4, 4, '#f2d35b');
    }
    chestCache[key] = c; return c;
  }
  function exitSprite() {
    if (exitCache) return exitCache;
    const impl = Array.from(biomes.values()).find(b => b.exitSprite);
    if (impl) { exitCache = impl.exitSprite(); return exitCache; }
    const c = Pixel.make(48, 56); const ctx = c.getContext('2d');
    Pixel.rect(ctx, 4, 8, 40, 46, '#5a5a6a'); Pixel.rect(ctx, 10, 16, 28, 38, '#1a1030'); Pixel.ellipse(ctx, 24, 34, 10, 14, '#7a62c9'); Pixel.ellipse(ctx, 24, 36, 5, 8, '#b7a6ff');
    exitCache = c; return c;
  }
  function clearCache() { chestCache = {}; exitCache = null; }
  return { TILE, CHUNK, registerBiome, biome, chunk, minimapColor, chestSprite, exitSprite, clearCache };
})();
if (typeof module !== 'undefined') module.exports = DungeonTiles;
