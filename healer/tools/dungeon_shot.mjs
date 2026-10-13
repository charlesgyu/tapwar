// 던전 씬 스크린샷: node healer/tools/dungeon_shot.mjs <floor> <outPrefix> [level]
// ui_preview.mjs 처럼 모든 스크립트를 로드 → 새 게임 + 파티 4명(전사 탱커·도적·사냥꾼·마법사) → Scenes.go('dungeon', { floor })
// → 탐험 시작 화면 → 가장 가까운 몬스터 무리 옆으로 순간이동 → 전투 3초 → 스크린샷 → 중간보스/보스 근처 → 스크린샷(텔레그래프·보스 바)
// → 미니맵·길게 누르기 메뉴 → 자동 탐험 몇 초. PAGEERROR/콘솔 오류가 있으면 종료 코드 1. fps 는 Scenes.fps().
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const floor = parseInt(process.argv[2] || '1', 10);
const prefix = process.argv[3] || path.join(H, 'tools/out/dungeon_f' + floor);
const level = parseInt(process.argv[4] || (floor >= 6 ? '16' : String(floor * 2)), 10);
const ORDER = [
  'js/pixel.js', 'js/sprites.js', 'js/town.js',
  'js/core/rng.js', 'js/core/events.js', 'js/core/data_classes.js', 'js/core/data_skills.js', 'js/core/data_items.js', 'js/core/data_monsters.js',
  'js/core/data_dialogue.js', 'js/core/data_quests.js', 'js/core/data_story.js', 'js/core/state.js', 'js/core/stats.js', 'js/core/level.js',
  'js/core/inventory.js', 'js/core/economy.js', 'js/core/facilities.js', 'js/core/party.js', 'js/core/quests.js',
  'js/core/combat/entities.js', 'js/core/combat/combat.js', 'js/core/combat/ai_party.js', 'js/core/combat/ai_healer.js', 'js/core/combat/ai_monster.js', 'js/core/combat/loot.js',
  'js/core/dungeon/gen.js', 'js/core/dungeon/floor.js',
  'js/sprites_monsters.js', 'js/sprites_monsters_forest.js', 'js/sprites_monsters_cave.js', 'js/tiles_dungeon.js', 'js/tiles_forest.js', 'js/tiles_cave.js', 'js/fx.js',
  'js/ui/ui.js',
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
let failed = false;
page.on('pageerror', (e) => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { failed = true; console.log('CONSOLE', m.text()); } });
const css = ['css/ui.css', 'css/hud.css'].map((f) => existsSync(path.join(H, f)) ? readFileSync(path.join(H, f), 'utf8') : '').join('\n');
await page.setContent(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><style>*{box-sizing:border-box;margin:0;padding:0;user-select:none}html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:-apple-system,"Pretendard","Noto Sans KR",sans-serif;touch-action:none}#game{position:relative;width:100%;height:100%}canvas{display:block;width:100%;height:100%}</style><style>${css}</style></head><body><div id="game"><canvas id="view"></canvas></div></body></html>`);
for (const f of ORDER) if (existsSync(path.join(H, f))) await page.addScriptTag({ path: path.join(H, f) });
for (const f of readdirSync(path.join(H, 'js/ui')).filter((f) => f.startsWith('ui_') && f.endsWith('.js')).sort()) await page.addScriptTag({ path: path.join(H, 'js/ui', f) });
for (const f of ['js/scenes/scene.js', 'js/scenes/town_scene.js', 'js/scenes/dungeon_scene.js']) if (existsSync(path.join(H, f))) await page.addScriptTag({ path: path.join(H, f) });

const shot = async (name) => { const p = `${prefix}_${name}.png`; await page.screenshot({ path: p }); console.log('wrote', p); return p; };
const wait = (ms) => page.waitForTimeout(ms);

const info = await page.evaluate(({ floor, level }) => {
  UI.init();
  const G = State.newGame('리프');
  window.__counts = {};
  Events.on('*', (p, name) => { window.__counts[name] = (window.__counts[name] || 0) + 1; });
  if (level > 1) Level.addXp(G.player, Level.totalXpTo(level) - Level.totalXpTo(1) + 1, G);
  const rng = RNG.make(11);
  for (const [cls, role] of [['warrior', 'tank'], ['rogue', 'melee'], ['hunter', 'ranged'], ['mage', 'ranged']]) Party.add(G, Party.generateMember(rng, level, { cls, role }));
  for (const id of ['hp_potion_s', 'mp_potion_s']) { const it = Items.make(id, 5); if (it) Inventory.add(G, it); }
  // 인트로 스토리는 따로 한 장 찍고(아래) 전투 샷에선 건너뛴다
  Scenes.init('view');
  Scenes.go('dungeon', { floor });
  const D = window.__healer.dungeon;
  return { name: D.fs.map.name, level: G.player.level, skills: Object.keys(G.player.skillLevels), groups: D.fs.map.groups.length };
}, { floor, level });
console.log('floor', floor, JSON.stringify(info));
await wait(700);
const shots = [];
shots.push(await shot('intro'));
// 스토리 건너뛰기
await page.evaluate(() => { const b = document.querySelector('.story-skip'); if (b) b.click(); });
await wait(1500);
shots.push(await shot('start'));

// 가장 가까운 무리 옆(5타일 앞)으로 순간이동 → 전투 3초
await page.evaluate(() => {
  const D = window.__healer.dungeon, fs = D.fs, p = D.player;
  const gs = fs.map.groups.filter((g) => !g.minibossId).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const g = gs.slice(0, 6).sort((a, b) => b.members.length - a.members.length)[0]; const dx = p.x - g.x, dy = p.y - g.y, L = Math.hypot(dx, dy) || 1;
  D.teleport(g.x + (dx / L) * 4 * 32, g.y + (dy / L) * 4 * 32);
  // 탱커를 무리 쪽으로 조금 앞세워 교전을 빨리 연다
});
await wait(1600);
const fight = await page.evaluate(() => ({ fps: Scenes.fps(), inCombat: window.__healer.dungeon.battle.inCombat(), counts: window.__counts, cast: !!window.__healer.dungeon.player.cast }));
console.log('fight', JSON.stringify(fight));
shots.push(await shot('fight'));

// 길게 누르기 메뉴(단일 힐 선택)
await page.evaluate(() => { const b = document.querySelectorAll('#dhud .dh-sk')[0]; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
await wait(600);
shots.push(await shot('chooser'));
await page.evaluate(() => { document.querySelector('#dhud .dh-back').click(); });

// 중간보스 무리 → 텔레그래프가 보일 때까지(최대 8초)
await page.evaluate(() => {
  const D = window.__healer.dungeon, fs = D.fs;
  const g = fs.map.groups.find((x) => x.minibossId);
  D.teleport(g.x - 3 * 32, g.y + 3 * 32);
});
let tgSeen = false;
for (let k = 0; k < 16 && !tgSeen; k++) { await wait(500); tgSeen = await page.evaluate(() => window.__healer.dungeon.battle.telegraphs.length > 0); }
shots.push(await shot('miniboss'));

// 보스: HP 바·페이즈
await page.evaluate(() => {
  const D = window.__healer.dungeon, fs = D.fs;
  D.teleport(fs.map.boss.x, fs.map.boss.y + 5 * 32);
});
let bossTg = false;
for (let k = 0; k < 16 && !bossTg; k++) { await wait(500); bossTg = await page.evaluate(() => window.__healer.dungeon.battle.telegraphs.length > 0 && window.__healer.dungeon.fs.boss.aggro); }
await page.evaluate(() => { document.querySelector('#dhud .dh-side button').click(); });   // 미니맵 열기
await wait(300);
shots.push(await shot('boss'));
const end = await page.evaluate(() => ({ fps: Scenes.fps(), counts: window.__counts, bossHp: Math.round(window.__healer.dungeon.fs.boss.hp), result: window.__healer.dungeon.fs.result }));
console.log('end', JSON.stringify(end));
console.log('SHOTS', JSON.stringify(shots));
await browser.close();
process.exit(failed ? 1 : 0);
