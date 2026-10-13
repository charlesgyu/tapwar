// 던전 씬 스크린샷: node healer/tools/dungeon_shot.mjs <floor> <outPrefix> [level]
// ui_preview.mjs 처럼 모든 스크립트를 로드 → 새 게임 + 파티 4명(전사 탱커·도적·사냥꾼·마법사) → Scenes.go('dungeon', { floor })
// → 탐험 시작 화면 → 가장 가까운 몬스터 무리 옆으로 순간이동 → 전투 3초 → 스크린샷 → 중간보스/보스 근처 → 스크린샷(텔레그래프·보스 바)
// → 연속킬 보너스 순간 → 일시정지 메뉴 → 길게 누르기 메뉴 → 자동 탐험 몇 초.
// 추가: AUTO 탱커 앞장(lead_walk) → 풀링 "준비하세요!"(lead_pull) → 전투(lead_fight), 딜러 HP 22% 후퇴·힐 요청(retreat). 말풍선·발밑 HP/MP 바 확인용. PAGEERROR/콘솔 오류가 있으면 종료 코드 1. fps 는 Scenes.fps().
// 환경 변수 DPR(기본 3 — 아이폰 기준; 2 로 주면 안드로이드 보급형 배율 확인)
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
  'js/core/inventory.js', 'js/core/economy.js', 'js/core/facilities.js', 'js/core/party.js', 'js/core/recruit.js', 'js/core/quests.js',
  'js/core/combat/entities.js', 'js/core/combat/combat.js', 'js/core/combat/ai_party.js', 'js/core/combat/chatter.js', 'js/core/combat/ai_healer.js', 'js/core/combat/ai_monster.js', 'js/core/combat/loot.js',
  'js/core/dungeon/gen.js', 'js/core/dungeon/floor.js',
  'js/sprites_monsters.js', 'js/sprites_monsters_forest.js', 'js/sprites_monsters_cave.js', 'js/tiles_dungeon.js', 'js/tiles_forest.js', 'js/tiles_cave.js', 'js/fx.js',
  'js/ui/ui.js',
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: parseFloat(process.env.DPR || '3'), hasTouch: true, isMobile: true });
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
  window.__cancels = {};
  Events.on('cast_cancel', (p) => { if (p.uid === 'player') window.__cancels[p.reason] = (window.__cancels[p.reason] || 0) + 1; });
  if (level > 1) Level.addXp(G.player, Level.totalXpTo(level) - Level.totalXpTo(1) + 1, G);
  const rng = RNG.make(11);
  for (const [cls, role] of [['warrior', 'tank'], ['rogue', 'melee'], ['hunter', 'ranged'], ['mage', 'ranged']]) Party.add(G, Party.generateMember(rng, level, { cls, role }));
  for (const id of ['hp_potion_s', 'mp_potion_s']) { const it = Items.make(id, 5); if (it) Inventory.add(G, it); }
  // 인트로 스토리는 따로 한 장 찍고(아래) 전투 샷에선 건너뛴다
  Scenes.init('view');
  Scenes.go('dungeon', { floor });
  const D = window.__healer.dungeon;
  window.__stk = {}; const B0 = D.battle, mv = B0.moveTo; B0.moveTo = function (e, ...a) { if (e === B0.player && e.cast) { const k = new Error().stack.split('\n').slice(2, 4).join(' / ').replace(/file:[^ )]*\//g, ''); window.__stk[k] = (window.__stk[k] || 0) + 1; } return mv.call(this, e, ...a); };
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

// 자동 탐험(AUTO): 탱커가 앞장서고 딜러가 뒤따르며 힐러는 맨 뒤 → 무리 앞에서 탱커가 멈춰 "준비하세요!"(풀링) 하는 순간
await page.evaluate(() => { if (!window.__healer.dungeon.explore.on) window.__healer.dungeon.toggleExplore(); });
await wait(2600);
shots.push(await shot('lead_walk'));
const leadInfo = await page.evaluate(() => { const D = window.__healer.dungeon, B = D.battle, L = B.lead, ld = L && L.leader, p = D.player;
  return { state: L && L.state, leader: ld && ld.name, role: ld && ld.role, leaderToHealer: ld ? Math.round(Math.hypot(ld.x - p.x, ld.y - p.y)) : null,
    order: B.party().map((e) => `${e.role}:${Math.round(e.x)},${Math.round(e.y)}`) }; });
console.log('lead', JSON.stringify(leadInfo), 'cancels', JSON.stringify(await page.evaluate(() => window.__cancels)));
let pullShot = null;
for (let k = 0; k < 160 && !pullShot; k++) {
  await wait(120);
  const st = await page.evaluate(() => { const B = window.__healer.dungeon.battle; return { st: B.lead && B.lead.state, says: window.__healer.dungeon.says.map((x) => x.text) }; });
  if (st.st === 'ready') { await wait(350); pullShot = await shot('lead_pull'); console.log('pull says', JSON.stringify(await page.evaluate(() => window.__healer.dungeon.says.map((x) => x.text)))); }
}
if (pullShot) shots.push(pullShot);
// 풀링 뒤 전투 2초
await wait(2000);
shots.push(await shot('lead_fight'));
await page.evaluate(() => { if (window.__healer.dungeon.explore.on) window.__healer.dungeon.toggleExplore(); });

// 가장 가까운 무리 옆(5타일 앞)으로 순간이동 → 전투 3초
await page.evaluate(() => {
  const D = window.__healer.dungeon, fs = D.fs, p = D.player;
  const gs = fs.map.groups.filter((g) => !g.minibossId).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const g = gs.slice(0, 6).sort((a, b) => b.members.length - a.members.length)[0]; const dx = p.x - g.x, dy = p.y - g.y, L = Math.hypot(dx, dy) || 1;
  D.teleport(g.x + (dx / L) * 4 * 32, g.y + (dy / L) * 4 * 32);
  // 탱커를 무리 쪽으로 조금 앞세워 교전을 빨리 연다
});
await wait(1600);
const fight = await page.evaluate(() => ({ cancels: JSON.stringify(window.__cancels), fps: Scenes.fps(), inCombat: window.__healer.dungeon.battle.inCombat(), counts: window.__counts, cast: !!window.__healer.dungeon.player.cast }));
console.log('fight', JSON.stringify(fight));
shots.push(await shot('fight'));


// 연속킬 보너스: 무리를 차례로 찾아가며 10연속킬 배너가 뜨는 순간을 찍는다(최대 24초)
const nextGroup = () => page.evaluate(() => {
  const D = window.__healer.dungeon, fs = D.fs, p = D.player;
  const live = fs.map.groups.filter((g) => !g.minibossId && fs.battle.monsters.some((m) => m.groupId === g.id && m.alive));
  live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const g = live[0]; if (!g) return null; D.teleport(g.x + 2 * 32, g.y + 2 * 32); return g.id;
});
let comboShot = null, fpsMin = 999;
for (let k = 0; k < 120 && !comboShot; k++) {
  if (k % 16 === 0 && k) await nextGroup();
  await wait(200);
  const st = await page.evaluate(() => ({ show: !!document.querySelector('#dhud .dh-combo.show'), n: window.__healer.dungeon.combo.n, fps: Scenes.fps() }));
  fpsMin = Math.min(fpsMin, st.fps);
  if (st.show) { await wait(120); comboShot = await shot('combo'); }
}
if (!comboShot) {
  // 자연 발생이 없으면(레벨이 낮아 처치가 느릴 때) 연속 9킬 상태에서 한 마리를 잡아 배너를 띄운다
  await page.evaluate(() => { const D = window.__healer.dungeon; D.combo.n = 9; D.combo.last = 1e9; const m = D.battle.activeMonsters().find((x) => x.alive); if (m) m.hp = 1; });
  for (let k = 0; k < 20 && !comboShot; k++) { await wait(150); if (await page.evaluate(() => !!document.querySelector('#dhud .dh-combo.show'))) comboShot = await shot('combo_forced'); }
}
if (comboShot) shots.push(comboShot);
console.log('combo', JSON.stringify(await page.evaluate(() => ({ cancels: window.__cancels, combo: window.__healer.dungeon.combo, coins: window.__healer.dungeon.coins, corpses: window.__healer.dungeon.corpses, nums: FX.nums().length, fps: Scenes.fps() }))), 'fpsMin', fpsMin.toFixed(1));

// 일시정지 메뉴
await page.evaluate(() => document.querySelector('#dhud .dh-pausebtn').click());
await wait(300);
shots.push(await shot('pause'));
await page.evaluate(() => window.__healer.dungeon.closePause());

// 길게 누르기 메뉴(단일 힐 선택)
await page.evaluate(() => { const b = document.querySelector('#dhud .dh-sk[aria-label="단일 힐"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
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
console.log('mb cancels', JSON.stringify(await page.evaluate(() => window.__cancels)));
shots.push(await shot('miniboss'));

// 생존 AI: 딜러 HP 를 22% 로 떨어뜨리면(자동 힐 잠시 끔) 힐러 쪽으로 빠지며 💨 + 힐 요청 말풍선
const retreat = await page.evaluate(async () => {
  const D = window.__healer.dungeon, B = D.battle, G = State.get();
  const prevHeal = G.player.settings.autoHeal; G.player.settings.autoHeal = false;
  const m = B.members.find((e) => e.alive && e.role !== 'tank' && B.engagedMonsters().length);
  if (!m) { G.player.settings.autoHeal = prevHeal; return null; }
  m.hp = Math.round(m.maxHp * 0.22);
  window.__retreatUid = m.uid; window.__prevHeal = prevHeal;
  return { name: m.name, role: m.role };
});
let retreatShot = null;
if (retreat) {
  for (let k = 0; k < 20 && !retreatShot; k++) {
    await wait(100);
    const st = await page.evaluate(() => { const B = window.__healer.dungeon.battle, m = B.byUid(window.__retreatUid); if (m && m.alive && m.hp / m.maxHp < 0.25) m.hp = Math.round(m.maxHp * 0.22); return { retreat: !!(m && m.retreat), wants: !!(m && m.wantsHeal > B.time), alive: !!(m && m.alive) }; });
    if (st.retreat && (st.wants || k > 12)) { await wait(250); retreatShot = await shot('retreat'); }
  }
  // 회복시키면 "다시 갑니다!"
  await page.evaluate(() => { const B = window.__healer.dungeon.battle, m = B.byUid(window.__retreatUid); State.get().player.settings.autoHeal = window.__prevHeal; if (m && m.alive) B.heal(B.player, m, m.maxHp); });
  await wait(700);
  console.log('retreat', JSON.stringify(retreat), 'after', JSON.stringify(await page.evaluate(() => { const B = window.__healer.dungeon.battle, m = B.byUid(window.__retreatUid); return { retreat: !!(m && m.retreat), says: window.__healer.dungeon.says.map((x) => x.text), log: (B.chatLog || []).slice(-6).map((x) => x.ent.name + ':' + x.text) }; })));
}
if (retreatShot) shots.push(retreatShot);

// 보스: HP 바·페이즈
await page.evaluate(() => {
  const D = window.__healer.dungeon, fs = D.fs;
  D.teleport(fs.map.boss.x, fs.map.boss.y + 5 * 32);
});
let bossTg = false;
for (let k = 0; k < 16 && !bossTg; k++) { await wait(500); bossTg = await page.evaluate(() => window.__healer.dungeon.battle.telegraphs.length > 0 && window.__healer.dungeon.fs.boss.aggro); }
await page.evaluate(() => { document.querySelector('#dhud .dh-mapbtn').click(); });   // 미니맵 열기
await wait(300);
shots.push(await shot('boss'));
const end = await page.evaluate(() => ({ stk: window.__stk, cancels: window.__cancels, fps: Scenes.fps(), counts: window.__counts, bossHp: Math.round(window.__healer.dungeon.fs.boss.hp), result: window.__healer.dungeon.fs.result }));
console.log('end', JSON.stringify(end));
console.log('SHOTS', JSON.stringify(shots));
await browser.close();
process.exit(failed ? 1 : 0);
