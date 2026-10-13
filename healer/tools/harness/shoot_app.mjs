// 실제 앱 스크린샷: node shoot_app.mjs <healerDir> <outPrefix> → <prefix>_app_start/_gate/_bank/_bottom/_walk.png
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [dir, prefix] = process.argv.slice(2);
if (!dir || !prefix) { console.error('usage: shoot_app.mjs <healerDir> <outPrefix>'); process.exit(1); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('file://' + dir.replace(/\/$/, '') + '/index.html');
await page.waitForTimeout(700);
// 새 게임이면 프롤로그가 뜬다 → 건너뛰고 마을이 열릴 때까지 대기
{ const b = page.locator('.ui-overlay.story .story-skip'); if (await b.count()) { await b.first().click(); await page.waitForTimeout(1200); } }
await page.screenshot({ path: `${prefix}_app_start.png` });
const goDoor = async (key, wait) => {
  await page.evaluate((key) => { const T = window.__healer.Town; const b = T.BUILDINGS.find(b => b.key === key); const d = T.doorPoint(b); window.__healer.goTo(d.x, d.y); }, key);
  await page.waitForTimeout(wait);
};
await goDoor('tower', 9000);
await page.screenshot({ path: `${prefix}_app_gate.png` });
await goDoor('bank', 9000);
await page.screenshot({ path: `${prefix}_app_bank.png` });
await page.evaluate(() => { const T = window.__healer.Town; window.__healer.goTo(12 * T.TILE + 8, (T.ROWS - 1.5) * T.TILE); });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${prefix}_app_bottom.png` });
// 걷는 중 프레임 (조이스틱 드래그)
await page.mouse.move(200, 500); await page.mouse.down(); await page.mouse.move(200, 430, { steps: 4 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}_app_walk.png` });
await page.mouse.up();
const info = await page.evaluate(() => ({ player: [window.__healer.player.x, window.__healer.player.y], tile: window.__healer.Town.TILE }));
console.log('wrote', ['start', 'gate', 'bank', 'bottom', 'walk'].map(k => `${prefix}_app_${k}.png`).join(' '), JSON.stringify(info));
await browser.close();
process.exit(failed ? 1 : 0);
