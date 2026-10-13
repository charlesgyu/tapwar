// 던전 타일 렌더: node render_tiles.mjs <jsDir> <floor> <outPrefix> → <prefix>_spawn.png, _mid.png, _boss.png, _overview.png
// jsDir 에 pixel.js, core/*, tiles_dungeon.js, (fx.js, sprites_monsters.js 선택) 가 있어야 한다.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync } from 'node:fs';
const [dir, floorArg, prefix, vx, vy] = process.argv.slice(2);
if (!dir || !floorArg || !prefix) { console.error('usage: render_tiles.mjs <jsDir> <floor> <outPrefix>'); process.exit(1); }
const floor = parseInt(floorArg, 10);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 1700 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setContent('<canvas id="c"></canvas>');
const core = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js', 'core/data_items.js', 'core/data_monsters.js', 'core/state.js', 'core/dungeon/gen.js'];
await page.addScriptTag({ path: dir + '/pixel.js' });
for (const f of core) if (existsSync(dir + '/' + f)) await page.addScriptTag({ path: dir + '/' + f });
for (const f of ['sprites.js', 'sprites_monsters.js', 'sprites_monsters_forest.js', 'sprites_monsters_cave.js', 'tiles_dungeon.js', 'tiles_forest.js', 'tiles_cave.js', 'fx.js']) if (existsSync(dir + '/' + f)) await page.addScriptTag({ path: dir + '/' + f });
const result = await page.evaluate(([floor, vx, vy]) => {
  const t0 = performance.now();
  const map = DungeonGen.generate(floor);
  const genMs = Math.round(performance.now() - t0);
  const T = 32, CH = 16; // 청크 16타일
  const c = document.getElementById('c'); const ctx = c.getContext('2d');
  const cache = new Map();
  const chunk = (ci, cj) => { const k = ci + ',' + cj; if (!cache.has(k)) cache.set(k, DungeonTiles.chunk(map, ci, cj)); return cache.get(k); };
  const t1 = performance.now();
  function view(cx, cy, zoom, vw, vh) {
    c.width = vw; c.height = vh; ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    const camX = Math.round(cx - vw / zoom / 2), camY = Math.round(cy - vh / zoom / 2);
    ctx.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
    const c0 = Math.floor(camX / (CH * T)), c1 = Math.floor((camX + vw / zoom) / (CH * T)), r0 = Math.floor(camY / (CH * T)), r1 = Math.floor((camY + vh / zoom) / (CH * T));
    for (let cj = Math.max(0, r0); cj <= r1; cj++) for (let ci = Math.max(0, c0); ci <= c1; ci++) { if (ci * CH >= map.cols || cj * CH >= map.rows) continue; ctx.drawImage(chunk(ci, cj), ci * CH * T, cj * CH * T); }
    // 상자·출구·몬스터 표시
    const draw = (img, x, y, ax, ay) => ctx.drawImage(img, Math.round(x) - ax, Math.round(y) - ay);
    for (const ch of map.chests) { try { const img = DungeonTiles.chestSprite(false, ch.type); draw(img, ch.x, ch.y, img.width / 2, img.height - 4); } catch (e) {} }
    try { const ex = DungeonTiles.exitSprite(); draw(ex, map.exit.x, map.exit.y, ex.width / 2, ex.height - 8); } catch (e) {}
    if (typeof MonsterSprites !== 'undefined') for (const g of map.groups) for (let k = 0; k < g.members.length; k++) {
      try { const def = (typeof Monsters !== 'undefined' && Monsters.get) ? Monsters.get(g.members[k]) : null; const s = def ? MonsterSprites.forDef(def) : MonsterSprites.get(g.members[k]); const img = s.down[0]; draw(img, g.x + (k % 3) * 28 - 28, g.y + Math.floor(k / 3) * 24, s.anchor.x, s.anchor.y); } catch (e) {}
    }
    if (typeof Sprites !== 'undefined') { try { const s = Sprites.get('player'); draw(s.down[0], map.spawn.x, map.spawn.y, s.anchor.x, s.anchor.y); } catch (e) {} }
    return c.toDataURL('image/png');
  }
  const vw = 780, vh = 1688, zoom = 2;
  const mid = map.groups.find(g => g.minibossId) || map.groups[Math.floor(map.groups.length / 2)];
  const views = { at: view(vx, vy, zoom, vw, vh) };
  const chunkMs = Math.round(performance.now() - t1);
  // 전체 축소본
  const scale = 768 / (map.cols * T);
  c.width = 768; c.height = Math.round(map.rows * T * scale); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  const t2 = performance.now();
  for (let cj = 0; cj < Math.ceil(map.rows / CH); cj++) for (let ci = 0; ci < Math.ceil(map.cols / CH); ci++) ctx.drawImage(chunk(ci, cj), ci * CH * T * scale, cj * CH * T * scale, CH * T * scale, CH * T * scale);
  ctx.fillStyle = 'rgba(255,0,0,0.9)'; for (const g of map.groups) ctx.fillRect(g.x * scale - 2, g.y * scale - 2, 4, 4);
  ctx.fillStyle = '#ff0'; for (const ch of map.chests) ctx.fillRect(ch.x * scale - 3, ch.y * scale - 3, 6, 6);
  ctx.fillStyle = '#0ff'; ctx.fillRect(map.spawn.x * scale - 5, map.spawn.y * scale - 5, 10, 10);
  ctx.fillStyle = '#f0f'; ctx.fillRect(map.boss.x * scale - 6, map.boss.y * scale - 6, 12, 12);
  const views2 = Object.assign(views, { overview: c.toDataURL('image/png') });
  return { views: views2, genMs, chunkMs, allChunkMs: Math.round(performance.now() - t2), walkable: map.walkableCount, groups: map.groups.length, chests: map.chests.length };
}, [floor, +vx, +vy]);
for (const [k, v] of Object.entries(result.views)) writeFileSync(`${prefix}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('wrote', Object.keys(result.views).map(k => `${prefix}_${k}.png`).join(' '), `| gen ${result.genMs}ms, 3뷰 청크 ${result.chunkMs}ms, 전체 100청크 ${result.allChunkMs}ms, walkable ${result.walkable}, groups ${result.groups}, chests ${result.chests}`);
await browser.close();
process.exit(failed ? 1 : 0);
