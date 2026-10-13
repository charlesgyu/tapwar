// 사용: NODE_PATH=$(npm root -g) node tools/smoke.js <tag> <w> <h> <dpr>  (서버: python3 -m http.server 8765)
// 그래픽 검토용 기준 스크린샷: 홈 / 나라 맵 카드 / 서울 전투 / 카드 / 아이템 소개 / 승리 화면
const { chromium } = require('playwright');
const [,, tag, w, h, dpr] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('tapwar_tutorial_seen', '1'); } catch (e) {} });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(5000);
  await p.screenshot({ path: `tools/out/${tag}_1_home.png` });
  await p.click('#enter-btn'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `tools/out/${tag}_2_stages.png` });
  await p.evaluate(() => { currentState = GAME_STATE.SELECT_START; document.getElementById('start-modal').style.display = 'none'; selectModalMap('SEOUL'); });
  await p.waitForFunction(() => currentMapKey === 'SEOUL' && rawZones.length > 0, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `tools/out/${tag}_3_select.png` });
  await p.evaluate(() => { pendingStartZone = rawZones[3]; confirmBaseSelection(); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `tools/out/${tag}_4_cards.png` });
  const pick = () => p.evaluate(() => { const m = document.getElementById('item-modal'); if (m.style.display !== 'none') { const c = document.querySelector('#item-choices .item-card'); if (c) c.click(); } });
  await pick();
  await p.evaluate(() => { gameSpeed = 4; });
  for (let t = 0; t < 20; t++) { await p.waitForTimeout(1000); await pick(); }
  await p.evaluate(() => { gameSpeed = 1; nextItemAt = 1e9; });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `tools/out/${tag}_5_battle.png` });
  await p.evaluate(() => openItemGuide()); await p.waitForTimeout(400);
  await p.screenshot({ path: `tools/out/${tag}_6_items.png` });
  await p.evaluate(() => { closeItemGuide(); gameOver(true); }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `tools/out/${tag}_7_win.png` });
  console.log(tag, JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
