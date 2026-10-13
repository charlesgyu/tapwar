// 마을 렌더: node render_town.mjs <jsDir> <outPrefix>  → <prefix>_gate/_plaza/_market/_bottom/_map.png
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync } from 'node:fs';
const [dir, prefix] = process.argv.slice(2);
if (!dir || !prefix) { console.error('usage: render_town.mjs <jsDir> <outPrefix>'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 1700 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ path: dir + '/pixel.js' });
if (existsSync(dir + '/sprites.js')) await page.addScriptTag({ path: dir + '/sprites.js' });
await page.addScriptTag({ path: dir + '/town.js' });
const result = await page.evaluate(() => {
  const t0 = performance.now();
  const world = Town.build();
  const buildMs = Math.round(performance.now() - t0);
  const T = Town.TILE;
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  // 샘플 캐릭터(크기 비교용)
  const actors = [];
  if (typeof Sprites !== 'undefined') {
    const place = (kind, bx, by, dir) => { try { const s = Sprites.get(kind); actors.push({ s, x: bx * T, y: by * T, dir }); } catch (e) {} };
    const doorOf = (key) => { const b = Town.BUILDINGS.find(b => b.key === key); return b ? Town.doorPoint(b) : null; };
    for (const [kind, key] of [['player', 'smithy'], ['villagerA', 'bank'], ['priest', 'temple'], ['knight', 'tower']]) {
      const d = doorOf(key); if (d) { try { const s = Sprites.get(kind); actors.push({ s, x: d.x, y: d.y, dir: 'down' }); } catch (e) {} }
    }
    place('villagerB', 13.5, 33.5, 'left'); place('child', 11, 47, 'right'); place('merchant', 9.5, 45.7, 'down');
  }
  function renderView(camX, camY, zoom, vw, vh) {
    c.width = vw; c.height = vh;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#cfe6f5'; ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
    ctx.drawImage(world.ground, 0, 0);
    const list = world.objects.map(o => ({ o, sortY: o.sortY }));
    for (const a of actors) list.push({ a, sortY: a.y });
    list.sort((p, q) => p.sortY - q.sortY);
    for (const it of list) {
      if (it.a) { const s = it.a.s; const img = s[it.a.dir][0]; ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(Math.round(it.a.x) - 7, Math.round(it.a.y) - 2, 14, 3); ctx.drawImage(img, Math.round(it.a.x) - s.anchor.x, Math.round(it.a.y) - s.anchor.y); }
      else ctx.drawImage(it.o.canvas, it.o.x, it.o.y);
    }
    ctx.drawImage(world.overlay, 0, 0);
    // 문 위치 표시 + 이름
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    for (const o of world.objects) {
      if (o.kind !== 'building' || !o.ref.name) continue;
      const sx = (o.door.x - camX) * zoom, sy = (o.door.y - camY) * zoom;
      if (sx < 0 || sx > vw || sy < 0 || sy > vh) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(sx - 36, sy - 40, 72, 18);
      ctx.fillStyle = '#4a3a30'; ctx.fillText(o.ref.name, sx, sy - 27);
    }
    return c.toDataURL('image/png');
  }
  const vw = 780, vh = 1688, zoom = 2; // 390x844 @2x
  const viewW = vw / zoom, viewH = vh / zoom;
  const cx = Math.max(0, Math.min(Town.W - viewW, 12 * T - viewW / 2));
  const views = {
    gate: renderView(cx, 0, zoom, vw, vh),
    plaza: renderView(cx, Math.max(0, 32 * T - viewH / 2), zoom, vw, vh),
    market: renderView(cx, Math.max(0, 46 * T - viewH / 2), zoom, vw, vh),
    bottom: renderView(cx, Town.H - viewH, zoom, vw, vh),
  };
  // 전체 맵 축소본
  const mw = 768, scale = mw / Town.W;
  c.width = mw; c.height = Math.round(Town.H * scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  const tmp = document.createElement('canvas'); tmp.width = Town.W; tmp.height = Town.H;
  const tctx = tmp.getContext('2d'); tctx.imageSmoothingEnabled = false;
  tctx.drawImage(world.ground, 0, 0);
  const list = world.objects.slice().sort((p, q) => p.sortY - q.sortY);
  for (const o of list) tctx.drawImage(o.canvas, o.x, o.y);
  tctx.drawImage(world.overlay, 0, 0);
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  views.map = c.toDataURL('image/png');
  // 충돌 격자 오버레이(디버그)
  tctx.fillStyle = 'rgba(255,0,0,0.35)';
  for (let j = 0; j < Town.ROWS; j++) for (let i = 0; i < Town.COLS; i++) if (Town.isSolidTile(i, j)) tctx.fillRect(i * T, j * T, T, T);
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  views.collision = c.toDataURL('image/png');
  return { views, buildMs, objects: world.objects.length, tile: T, W: Town.W, H: Town.H };
});
for (const [k, v] of Object.entries(result.views)) writeFileSync(`${prefix}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('wrote', Object.keys(result.views).map(k => `${prefix}_${k}.png`).join(' '), '| build', result.buildMs + 'ms', 'objects', result.objects, 'tile', result.tile, 'world', result.W + 'x' + result.H);
await browser.close();
process.exit(failed ? 1 : 0);
