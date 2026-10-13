// 이펙트 렌더: node render_fx.mjs <jsDir> <out.png>  — FX 의 각 타입을 시간 0/0.3/0.6/0.9 로 그려 스트립을 만든다
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ path: dir + '/pixel.js' });
await page.addScriptTag({ path: dir + '/fx.js' });
const data = await page.evaluate(() => {
  const types = FX.types ? FX.types() : ['heal_sparkle', 'aoe_ring', 'puddle_circle', 'hit', 'projectile', 'levelup', 'cast_glow', 'summon_puff', 'revive', 'ground_heal'];
  const c = document.getElementById('c'); const ctx = c.getContext('2d');
  const S = 2, cell = 140, phases = [0, 0.25, 0.5, 0.75, 1.0];
  c.width = 160 + cell * phases.length; c.height = types.length * cell + 20;
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#6a9a4a'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  types.forEach((t, row) => {
    ctx.fillStyle = '#fff'; ctx.fillText(t, 6, row * cell + cell / 2);
    phases.forEach((p, col) => {
      const fx = FX.spawn(t, 0, 0, { r: 48, fill: p, color: '#ff5050' });
      fx.t = p * (fx.duration || 1);
      ctx.save(); ctx.translate(160 + col * cell + cell / 2, row * cell + cell / 2); ctx.scale(S, S);
      try { FX.drawOne(ctx, fx, { x: 0, y: 0 }); } catch (e) { ctx.fillStyle = 'red'; ctx.fillRect(-5, -5, 10, 10); }
      ctx.restore();
    });
  });
  return c.toDataURL('image/png');
});
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); console.log('wrote', out);
await browser.close();
process.exit(failed ? 1 : 0);
