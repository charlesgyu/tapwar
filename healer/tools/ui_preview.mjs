// UI 화면 미리보기: node healer/tools/ui_preview.mjs <screen> <out.png> [paramsJSON] [stateJS]
// index.html 과 무관하게 모든 스크립트를 로드해 새 게임 상태(파티 4명·아이템·골드)를 만든 뒤 UI.open(screen) 하고 스크린샷을 찍는다.
// stateJS: 상태를 꾸미는 JS 조각(선택). 예: "G.player.gold=5000"
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [screen, out, paramsJson, stateJs] = process.argv.slice(2);
if (!screen || !out) { console.error('usage: ui_preview.mjs <screen> <out.png> [paramsJSON] [stateJS]'); process.exit(1); }
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
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
const css = existsSync(path.join(H, 'css/ui.css')) ? readFileSync(path.join(H, 'css/ui.css'), 'utf8') : '';
const hud = existsSync(path.join(H, 'css/hud.css')) ? readFileSync(path.join(H, 'css/hud.css'), 'utf8') : '';
await page.setContent(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#cfe6f5;font-family:-apple-system,"Pretendard","Noto Sans KR",sans-serif}#game{position:relative;width:100%;height:100%}canvas{display:block;width:100%;height:100%}</style><style>${css}</style><style>${hud}</style></head><body><div id="game"><canvas id="view"></canvas></div></body></html>`);
for (const f of ORDER) if (existsSync(path.join(H, f))) await page.addScriptTag({ path: path.join(H, f) });
// ui_*.js 전부
const uiDir = path.join(H, 'js/ui');
const { readdirSync } = await import('node:fs');
for (const f of readdirSync(uiDir).filter(f => f.startsWith('ui_') && f.endsWith('.js')).sort()) await page.addScriptTag({ path: path.join(uiDir, f) });
const info = await page.evaluate(({ screen, params, stateJs }) => {
  UI.init();
  const G = State.newGame('리프');
  // 샘플 상태: 파티 4명, 골드, 아이템 몇 개, 벨트
  try {
    const rng = RNG.make(7);
    for (const cls of ['warrior', 'mage', 'hunter', 'rogue']) { const m = Party.generateMember(rng, 3, { cls }); G.party.push(m); }
  } catch (e) { console.warn('party sample skipped', e.message); }
  G.player.gold = 2500; G.player.level = 5; G.player.statPoints = 10;
  try {
    for (const id of ['hp_potion_s', 'mp_potion_s']) { const inst = Items.make ? Items.make(id, 5) : null; if (inst) Inventory.add(G, inst); }
    for (let i = 0; i < 6; i++) { const inst = Items.generate({ floor: 2, rng: RNG.make(100 + i) }); if (inst) Inventory.add(G, inst); }
  } catch (e) { console.warn('items sample skipped', e.message); }
  if (stateJs) { try { new Function('G', stateJs)(G); } catch (e) { console.warn('stateJs error', e.message); } }
  const entry = UI.open(screen, params || {});
  return { opened: !!entry, screens: Array.from(UI.screens.keys()) };
}, { screen, params: paramsJson ? JSON.parse(paramsJson) : {}, stateJs: stateJs || '' });
await page.waitForTimeout(400);
await page.screenshot({ path: out });
console.log('wrote', out, JSON.stringify(info));
await browser.close();
process.exit(failed ? 1 : 0);
