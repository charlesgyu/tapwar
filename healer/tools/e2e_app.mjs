// 앱 전체 E2E: node healer/tools/e2e_app.mjs [outDir]
// 실제 index.html 을 file:// 로 열어(서버 없이도 동작해야 하므로) 390×844 @2x 터치 폰에서 처음부터 끝까지 한 바퀴 돈다.
//   새 게임 → 프롤로그 건너뛰기 → 마을 → 장로 엘다 대화 → 메인 퀘스트 수락 → 성문 경비 대화 → 모험가 사무소 4명 고용
//   → 상인(포션·장비 구매) → 가방(벨트 등록·장착) → 신전 강화 → 은행 입금 → 여관 식사 → 경매장 → 대장간 조합 → 길드 가입
//   → 성문(탑) → 1층(인트로 건너뛰기) → 자동 탐험 5초 → 무리 옆 순간이동·전투 8초 → 상자 → 보스(소환 확인 후 HP 5% 치트) → 출구
//   → 결과 화면 → 마을 → 퀘스트 완료 → 저장 → 새로고침 → 이어하기 → 상태 비교 → 2~10층 입장(각 2초, 6층 힐러 저격 확인).
// 시설 조작은 실제 버튼 클릭, 이동은 마을 길찾기(goTo)·화면 탭을 쓴다. 던전의 순간이동·HP 치트는 window.__healer.dungeon 으로만.
// PAGEERROR/콘솔 오류(경고 제외)가 하나라도 있거나 단계가 실패하면 종료 코드 1.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(H, 'tools/out/e2e');
if (existsSync(OUT)) for (const f of (await import('node:fs')).readdirSync(OUT)) if (f.endsWith('.png')) rmSync(path.join(OUT, f));
mkdirSync(OUT, { recursive: true });
const URL = pathToFileURL(path.join(H, 'index.html')).href;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push('CONSOLE ' + m.text()); console.log('CONSOLE', m.text()); } });
page.on('requestfailed', (r) => { errors.push('REQFAIL ' + r.url()); console.log('REQFAIL', r.url()); });

const rows = [];             // 단계별 결과 표
const shots = [];
let shotN = 0;
const wait = (ms) => page.waitForTimeout(ms);
async function shot(name) { const p = path.join(OUT, `${String(++shotN).padStart(2, '0')}_${name}.png`); await page.screenshot({ path: p }); shots.push(p); return p; }
function step(name, ok, detail = '') { rows.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
const ev = (fn, arg) => page.evaluate(fn, arg);
async function until(fn, arg, ms = 10000, every = 100) {
  const t0 = Date.now();
  for (;;) { const v = await ev(fn, arg).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await wait(every); }
}
// 맨 위 오버레이(시설 화면·확인창·대화창) 안에서 글자가 맞는 버튼을 누른다
async function clickBtn(text, { exact = false, scope = '#ui-root .ui-overlay', nth = 0 } = {}) {
  const top = page.locator(scope).last();
  const loc = exact ? top.locator('button:not([disabled])', { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }) : top.locator('button:not([disabled])', { hasText: text });
  const n = await loc.count();
  if (n <= nth) return false;
  await loc.nth(nth).click();
  await wait(120);
  return true;
}
// 대화창: 줄을 넘겨 선택지가 나오면 label 을 포함한 선택지를 누른다(없으면 끝까지 넘김)
async function dialogPick(label, shotName) {
  for (let k = 0; k < 20; k++) {
    const st = await ev(() => { const o = document.querySelector('#ui-root .ui-overlay.dlg'); if (!o) return 'none'; return o.querySelector('.dlg-choices:not(.hidden)') ? 'choices' : 'lines'; });
    if (st === 'none') return k > 0 || !label;
    if (st === 'choices') {
      if (shotName) await shot(shotName);
      const b = page.locator('#ui-root .ui-overlay.dlg .dlg-choices button', { hasText: label || '닫기' }).first();
      if (!(await b.count())) { await page.locator('#ui-root .ui-overlay.dlg .dlg-choices button').last().click(); return false; }
      await b.click(); await wait(200); return true;
    }
    if (k === 0 && shotName && !label) await shot(shotName);
    await page.locator('#ui-root .ui-overlay.dlg').last().click({ position: { x: 20, y: 20 } });
    await wait(80);
  }
  return false;
}
async function finishDialogs() { for (let k = 0; k < 30; k++) { if (!(await ev(() => !!document.querySelector('#ui-root .ui-overlay.dlg')))) return; await page.locator('#ui-root .ui-overlay.dlg').last().click({ position: { x: 20, y: 20 } }); await wait(80); } }
async function skipStory() { const b = page.locator('.ui-overlay.story .story-skip'); if (await b.count()) { await b.first().click(); await wait(150); return true; } return false; }
async function closeScreen() { await ev(() => UI.close(true)); await wait(150); }
// 마을: 길찾기로 시설 문까지 걸어가 들어간다(문 앞 도착 → enterBuilding → UI.open)
async function visit(key, screen) {
  await ev((key) => { const b = Town.BUILDINGS.find((x) => x.key === key); const d = Town.doorPoint(b); window.__healer.goTo(d.x, d.y, () => window.__healer.TownScene.enterBuilding(b)); }, key);
  return until((s) => UI.current() && UI.current().name === s, screen, 30000);
}
async function talk(npcId) {
  await ev((id) => { const n = window.__healer.TownScene.npcById(id); window.__healer.goTo(n.x, n.y + 26, () => window.__healer.talkTo(id)); }, npcId);
  return until(() => !!document.querySelector('#ui-root .ui-overlay.dlg'), null, 30000);
}

// ============ 1. 새 게임 → 프롤로그 ============
await page.goto(URL);
await ev(() => { try { localStorage.clear(); } catch (e) { /* 저장 불가 환경 */ } });
await page.reload();
const story = await until(() => !!document.querySelector('.ui-overlay.story'), null, 5000);
await shot('prologue');
step('새 게임 → 프롤로그 표시', story);
await skipStory();
const inTown = await until(() => Scenes.name() === 'town' && !UI.isOpen(), null, 5000);
await wait(600);
await shot('town');
step('프롤로그 건너뛰기 → 마을', inTown, await ev(() => `fps ${Scenes.fps().toFixed(0)}`));

// 테스트 준비: 4명 고용·구매·강화 비용(새 게임 골드 300 으로는 부족) — 치트는 이것과 던전 순간이동/보스 HP 뿐
await ev(() => { window.__healer.G().player.gold = 6000; window.__healer.TownScene.updateHud(true); });

// 실제 화면 탭으로 한 번 걷기(Scenes 포인터 → TownScene.onTap → 길찾기)
const tapOk = await (async () => {
  const p0 = await ev(() => ({ x: window.__healer.player.x, y: window.__healer.player.y }));
  await page.touchscreen.tap(195, 330);
  await wait(1500);
  const p1 = await ev(() => ({ x: window.__healer.player.x, y: window.__healer.player.y }));
  return Math.hypot(p1.x - p0.x, p1.y - p0.y) > 20;
})();
step('화면 탭 이동', tapOk);

// ============ 2. NPC 대화: 장로 엘다 ============
let ok = await talk('priest_elder');
await wait(250);
await shot('talk_elder');
const talked = await dialogPick(null);
await finishDialogs();
step('NPC 대화(장로 엘다)', ok && talked, await ev(() => Dialogue.name('priest_elder')));

// ============ 3. 메인 퀘스트 수락(모험가 사무소 직원: 1장 첫 메인 '첫 걸음') ============
ok = await talk('adventurer_clerk');
const accepted = ok && await dialogPick('수락: 첫 걸음', 'quest_offer');
await finishDialogs();
const qs = await ev(() => Quests.status(window.__healer.G(), 'main_01_prepare'));
step('메인 퀘스트 수락(첫 걸음)', accepted && qs === 'active', qs);
// 목표 2: 성문 경비와 대화
await talk('guard1'); await finishDialogs();

// ============ 4. 모험가 사무소: 4명 고용 ============
ok = await visit('adventurer', 'adventurer');
await wait(200);
let hired = 0;
for (let k = 0; k < 4; k++) { if (await clickBtn('고용', { exact: true })) hired++; await wait(150); }
await shot('adventurer_hired');
const partyN = await ev(() => window.__healer.G().party.length);
step('모험가 사무소 4명 고용', ok && partyN === 4, `파티 ${partyN}명 · 퀘스트 ${await ev(() => Quests.status(window.__healer.G(), 'main_01_prepare'))}`);
await closeScreen();

// ============ 5. 상인: 포션·장비 구매 ============
ok = await visit('shop', 'shop');
await clickBtn('10개', { exact: true });
const potionName = await ev(() => Items.get('hp_potion_s').name);
const buyPotion = page.locator('#ui-root .ui-overlay').last().locator('.item-card', { hasText: potionName }).first().locator('button', { hasText: '구매' });
await buyPotion.click(); await wait(150);
// 사제가 입을 수 있는 기본 장비 하나(모자) — 다음 단계에서 장착
const hatName = await ev(() => { const s = Facilities.shop.stock(window.__healer.G()).find((x) => x.kind === 'equip' && x.def.slot === 'hat'); return s ? s.name : null; });
if (hatName) { await page.locator('#ui-root .ui-overlay').last().locator('.item-card', { hasText: hatName }).first().locator('button', { hasText: '구매' }).click(); await wait(150); }
await shot('shop');
const potions = await ev(() => Inventory.count(window.__healer.G(), 'hp_potion_s'));
step('상인 포션 구매', ok && potions >= 10, `작은 체력 포션 ${potions}개 · 장비 ${hatName || '없음'}`);
await closeScreen();

// ============ 6. 가방: 벨트 등록 + 장착 ============
await page.locator('#btn-inventory').click();
await until(() => UI.current() && UI.current().name === 'inventory');
await page.locator(`#ui-root .inv-cell[aria-label="${potionName}"]`).first().click(); await wait(150);
await clickBtn('벨트 등록');
if (hatName) { await page.locator(`#ui-root .inv-cell[aria-label="${hatName}"]`).first().click(); await wait(150); await clickBtn('장착', { exact: true }); }
await wait(150);
await shot('inventory_belt_equip');
const inv = await ev(() => { const G = window.__healer.G(); return { belt: G.player.belt.slice(), hat: G.player.equipment.hat && G.player.equipment.hat.id }; });
step('가방: 벨트 등록·장비 장착', inv.belt.includes('hp_potion_s') && (!hatName || inv.hat), JSON.stringify(inv));
await closeScreen();

// ============ 7. 신전: 스킬 강화 ============
ok = await visit('temple', 'temple');
const lv0 = await ev(() => window.__healer.G().player.skillLevels.heal_basic);
await clickBtn('강화', { exact: true });
await shot('temple');
const lv1 = await ev(() => window.__healer.G().player.skillLevels.heal_basic);
step('신전 스킬 강화', ok && lv1 === lv0 + 1, `기본 힐 Lv.${lv0} → ${lv1}`);
await closeScreen();

// ============ 8. 은행: 골드 입금 ============
ok = await visit('bank', 'bank');
await page.locator('#ui-root .ui-overlay').last().locator('.ui-tab', { hasText: '골드' }).first().click(); await wait(120);
await clickBtn('100', { exact: true });
await shot('bank');
const bankGold = await ev(() => window.__healer.G().bank.gold);
step('은행 입금', ok && bankGold >= 100, `은행 골드 ${bankGold}`);
await closeScreen();

// ============ 9. 여관: 식사 ============
ok = await visit('inn', 'inn');
await clickBtn('먹기', { exact: true });
await shot('inn');
const buffs = await ev(() => window.__healer.G().player.buffs.map((b) => b.id));
step('여관 식사', ok && buffs.length > 0, buffs.join(','));
await closeScreen();

// ============ 10. 경매장 ============
ok = await visit('auction', 'auction');
await wait(200);
await shot('auction');
const lots = await ev(() => Facilities.auction.listings(window.__healer.G()).length);
step('경매장 열기', ok && lots > 0, `매물 ${lots}개`);
await closeScreen();

// ============ 11. 대장간: 조합 화면 ============
ok = await visit('smithy', 'smithy');
await page.locator('#ui-root .ui-overlay').last().locator('.ui-tab', { hasText: '조합' }).first().click(); await wait(150);
await shot('smithy_craft');
const recipes = await ev(() => document.querySelectorAll('#ui-root .ui-overlay:last-child .ui-pane button').length);
step('대장간 조합 화면', ok && recipes > 0, `버튼 ${recipes}개`);
await closeScreen();

// ============ 12. 길드 가입 ============
ok = await visit('guild', 'guild');
await clickBtn('가입', { exact: true });
await wait(150);
await clickBtn('가입', { exact: true, scope: '#ui-root .ui-overlay.top' });   // 확인창
await wait(200);
await shot('guild');
const guild = await ev(() => window.__healer.G().guild && window.__healer.G().guild.name);
step('길드 가입', ok && !!guild, guild || '');
await closeScreen();

// ============ 13. 성문 → 1층 ============
ok = await visit('tower', 'tower');
await shot('tower');
step('성문(탑 화면)', ok);
await clickBtn('1층 입장');
const intro = await until(() => Scenes.name() === 'dungeon' && !!document.querySelector('.ui-overlay.story'), null, 8000);
await shot('dungeon_intro');
await skipStory();
const inDungeon = await until(() => Scenes.name() === 'dungeon' && !document.querySelector('.ui-overlay.story') && window.__healer.dungeon && window.__healer.dungeon.fs, null, 5000);
step('1층 입장(인트로 건너뛰기)', intro && inDungeon, await ev(() => window.__healer.dungeon.fs.map.name));

// 이벤트 기록(페이지 안에서 누적)
await ev(() => {
  const L = (window.__e2e = { heal: 0, damage: 0, telegraph: 0, summon: 0, chest: [], boss: 0, cleared: 0, healerAoe: [], casts: [] });
  const on = Events.on;
  on('heal', () => L.heal++); on('damage', () => L.damage++); on('telegraph', () => L.telegraph++);
  on('summon', (p) => { L.summon++; L.casts.push('summon:' + (p && p.abilityId)); });
  on('chest_opened', (p) => L.chest.push(p.chestId)); on('boss_killed', () => L.boss++); on('floor_cleared', () => L.cleared++);
  on('cast_start', (p) => { if (p.abilityId && /healer/.test(p.abilityId)) L.healerAoe.push(p.abilityId); });
  on('telegraph', (p) => { const t = p && (p.tg || p.telegraph || p); if (t && t.abilityId && /healer/.test(t.abilityId)) L.healerAoe.push('tg:' + t.abilityId); });
});

// ============ 14. 5초 플레이(자동 탐험 버튼) ============
await page.locator('#dhud .dh-sk', { hasText: '자동 탐험' }).click();
await wait(5000);
await shot('dungeon_explore');
const steps5 = await ev(() => window.__healer.dungeon.fs.steps);
step('5초 플레이(자동 탐험)', true, `걸음 ${steps5} · fps ${(await ev(() => Scenes.fps())).toFixed(0)}`);
await page.locator('#dhud .dh-sk', { hasText: '자동 탐험' }).click();   // 끄기(순간이동 뒤 엉뚱한 곳으로 걷지 않게)

// ============ 15. 가장 가까운 무리 → 전투 8초 ============
const grp = await ev(() => {
  const D = window.__healer.dungeon, fs = D.fs, p = D.player;
  const live = fs.map.groups.filter((g) => !g.minibossId && fs.battle.monsters.some((m) => m.groupId === g.id && m.alive));
  live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const g = live[0]; D.teleport(g.x + 3 * 32, g.y + 2 * 32); return g.id;
});
const fpsSamples = [];
let tgShot = null, dmgShot = null;
for (let t = 0; t < 16; t++) {
  await wait(500);
  fpsSamples.push(await ev(() => Scenes.fps()));
  const s = await ev(() => ({ tg: window.__healer.dungeon.battle.telegraphs.some((t) => !t.done), dn: FX && FX.list ? FX.list().some((f) => f.type === 'damage_number') : window.__e2e.damage > 0 }));
  if (s.tg && !tgShot) tgShot = await shot('combat_telegraph');
  if (s.dn && !dmgShot && t >= 3) dmgShot = await shot('combat_damage_numbers');
}
let L = await ev(() => window.__e2e);
// 일반 무리에 광역기가 없으면 중간보스 무리에서 텔레그래프를 본다(1층 일반 몬스터는 능력이 거의 없다)
if (!tgShot) {
  await ev(() => { const D = window.__healer.dungeon, fs = D.fs; const g = fs.map.groups.find((g) => g.minibossId && fs.battle.monsters.some((m) => m.groupId === g.id && m.alive)); if (g) D.teleport(g.x + 3 * 32, g.y + 2 * 32); });
  for (let t = 0; t < 40 && !tgShot; t++) { await wait(300); if (await ev(() => window.__healer.dungeon.battle.telegraphs.some((t) => !t.done))) tgShot = await shot('combat_telegraph'); }
}
const fpsMin = Math.min(...fpsSamples.slice(2)), fpsAvg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
L = await ev(() => window.__e2e);
step('전투 8초(힐 ≥1·데미지 숫자·텔레그래프)', L.heal >= 1 && L.damage > 0 && !!tgShot, `무리 ${grp} · heal ${L.heal} · damage ${L.damage} · telegraph ${L.telegraph}`);
step('성능: 1층 전투 fps ≥ 50', fpsAvg >= 50, `평균 ${fpsAvg.toFixed(1)} · 최저 ${fpsMin.toFixed(1)}`);

// ============ 16. 상자 ============
// 싸움이 남아 있으면 정리(마을 경로가 아니라 테스트 진행을 위해 남은 무리는 그대로 두고 상자로 이동)
const chestId = await ev(() => {
  const D = window.__healer.dungeon, fs = D.fs, p = D.player;
  const cs = fs.chests.filter((c) => !c.opened && !c.hidden).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  D.teleport(cs[0].x + 40, cs[0].y); return cs[0].id;
});
// 상자 1.5타일 근접 자동 열기 — 순간이동 지점이 40px 옆이라 한 걸음 다가간다
await ev((id) => { const D = window.__healer.dungeon, c = D.fs.chests.find((x) => x.id === id); D.player.x = c.x + 10; D.player.y = c.y; }, chestId);
const opened = await until((id) => window.__e2e.chest.includes(id), chestId, 6000);
await wait(300);
await shot('chest_opened');
step("상자 열기('chest_opened')", !!opened, chestId);

// ============ 17. 보스: 소환 확인 → HP 5% → 처치 ============
await ev(() => { const D = window.__healer.dungeon, b = D.fs.boss; D.teleport(b.x, b.y + 4 * 32); });
const summoned = await until(() => window.__e2e.summon > 0 || window.__healer.dungeon.fs.result, null, 30000, 200);
await shot('boss_fight');
L = await ev(() => window.__e2e);
step('보스 소환 패턴 발생', L.summon > 0, `summon ${L.summon} (${L.casts.join(',')})`);
await ev(() => { const b = window.__healer.dungeon.fs.boss; b.hp = Math.max(1, Math.round(b.maxHp * 0.05)); });
const killed = await until(() => window.__e2e.boss > 0 || window.__healer.dungeon.fs.result === 'wipe', null, 40000, 200);
L = await ev(() => window.__e2e);
await wait(400);
await shot('boss_killed');
step("보스 처치('boss_killed')", L.boss > 0, await ev(() => `결과 ${window.__healer.dungeon.fs.result || '-'} · 출구 ${window.__healer.dungeon.fs.bossDefeated}`));

// 보스 아웃트로 스토리(1.2초 뒤)
await until(() => !!document.querySelector('.ui-overlay.story'), null, 3000);
await skipStory();

// ============ 18. 출구 → 결과 화면 ============
await ev(() => { const D = window.__healer.dungeon, e = D.fs.map.exit; D.teleport(e.x, e.y); });
const resultOpen = await until(() => UI.current() && UI.current().name === 'result', null, 8000);
await wait(400);
await shot('result');
step('출구 → 결과 화면', !!resultOpen && L.boss > 0, await ev(() => { const p = UI.current() && UI.current().params; return p ? `${p.floor}층 ${p.outcome} · 처치 ${p.kills} · 경험치 ${p.xp} · 골드 ${p.gold}` : ''; }));

// ============ 19. 마을 → 퀘스트 완료 ============
await clickBtn('마을로', { exact: true });
const back = await until(() => Scenes.name() === 'town' && !UI.isOpen(), null, 5000);
await wait(300);
await finishDialogs();   // 챕터 마을 이벤트가 뜨면 넘긴다
await shot('town_return');
step('결과 → 마을 복귀', !!back, await ev(() => `성문 앞 y=${Math.round(window.__healer.player.y / 32)} · 1층 최고 ${window.__healer.G().tower.highestCleared}`));
await talk('adventurer_clerk');
const done = await dialogPick('완료: 첫 걸음', 'quest_complete');
await finishDialogs();
const qDone = await ev(() => Quests.status(window.__healer.G(), 'main_01_prepare'));
step('퀘스트 완료(첫 걸음)', done && qDone === 'completed', qDone);

// ============ 20. 저장 → 새로고침 → 이어하기 ============
const snap = () => ev(() => { const G = window.__healer.G(); return JSON.stringify({ gold: G.player.gold, lv: G.player.level, xp: G.player.xp, party: G.party.map((m) => m.uid), bank: G.bank.gold, guild: G.guild && G.guild.id, hc: G.tower.highestCleared, done: G.quests.completed, skill: G.player.skillLevels, belt: G.player.belt, hat: G.player.equipment.hat && G.player.equipment.hat.uid, chapter: G.story.chapter, bag: G.player.bag.filter(Boolean).length }); });
await ev(() => window.__healer.save());
const before = await snap();
await page.reload();
const title = await until(() => UI.current() && UI.current().name === 'title', null, 5000);
await shot('title_continue');
await clickBtn('이어하기');
const cont = await until(() => Scenes.name() === 'town' && !UI.isOpen(), null, 5000);
await wait(400);
await finishDialogs();
const after = await snap();
await shot('town_continued');
step('저장 → 새로고침 → 이어하기 → 같은 상태', !!title && !!cont && before === after, before === after ? before.slice(0, 120) + '…' : `before ${before}\nafter  ${after}`);

// ============ 21. 2~10층 입장(각 2초) · 6층 힐러 저격 ============
for (let f = 2; f <= 10; f++) {
  const r = await ev((f) => {
    const G = window.__healer.G();
    G.story.flags['dungeon_intro_' + f] = true;   // 층 인트로 연출은 1층에서 확인했으니 생략
    UI.close(true);
    Scenes.go('dungeon', { floor: f });
    const D = window.__healer.dungeon;
    return { ok: Scenes.name() === 'dungeon' && !!D.fs && D.fs.floor === f, name: D.fs && D.fs.map.name, mons: D.fs && D.fs.battle.monsters.length };
  }, f);
  await wait(2000);
  const fps = await ev(() => Scenes.fps());
  if (f === 6) {
    // 힐러를 노리는 능력을 가진 몬스터가 있는 무리 옆으로 가서 시전을 기다린다
    const target = await ev(() => {
      const D = window.__healer.dungeon, fs = D.fs;
      const has = (m) => (m.abilities || (m.def && m.def.abilities) || []).some((a) => /healer/.test(typeof a === 'string' ? a : a.id));
      const m = fs.battle.monsters.filter((m) => m.alive && has(m) && m.tier !== 'boss').sort((a, b) => Math.hypot(a.x - D.player.x, a.y - D.player.y) - Math.hypot(b.x - D.player.x, b.y - D.player.y))[0];
      if (!m) return null;
      window.__e2e.healerAoe = [];
      D.teleport(m.x + 3 * 32, m.y + 2 * 32);
      return m.def.id + ' ' + (m.abilities || m.def.abilities).map((a) => (typeof a === 'string' ? a : a.id)).join('/');
    });
    const seen = await until(() => window.__e2e.healerAoe.length > 0, null, 25000, 200);
    await shot('floor6_healer_aoe');
    const lst = await ev(() => window.__e2e.healerAoe.slice(0, 6));
    step('6층 힐러 노리는 광역기', !!seen, `${target || '대상 몬스터 없음'} → ${lst.join(', ')}`);
  } else if (f === 2 || f === 10) await shot(`floor${f}`);
  step(`${f}층 입장 2초`, r.ok, `${r.name} · 몬스터 ${r.mons} · fps ${fps.toFixed(0)}`);
}
await ev(() => { UI.close(true); Scenes.go('town'); });
await wait(300);

// ============ 결과 ============
step('PAGEERROR/콘솔 오류 0', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log('\n| # | 단계 | 결과 | 비고 |\n|---|---|---|---|');
rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`));
console.log('\nscreenshots:\n' + shots.join('\n'));
await browser.close();
process.exit(rows.every((r) => r.ok) ? 0 : 1);
