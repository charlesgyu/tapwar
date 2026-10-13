// 노드에서 브라우저 전역 스타일 스크립트를 같은 컨텍스트에 순서대로 로드한다.
// 사용: const ctx = require('./load')(['core/rng.js', 'core/events.js', ...]); ctx.RNG ...
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JS_DIR = path.join(__dirname, '..', 'js');

const ORDER = [
  'core/rng.js', 'core/events.js',
  'core/data_classes.js', 'core/data_skills.js', 'core/data_items.js', 'core/data_monsters.js',
  'core/data_dialogue.js', 'core/data_quests.js', 'core/data_story.js',
  'core/state.js', 'core/stats.js', 'core/level.js', 'core/inventory.js',
  'core/economy.js', 'core/facilities.js', 'core/party.js', 'core/recruit.js', 'core/quests.js',
  'core/combat/entities.js', 'core/combat/combat.js', 'core/combat/ai_party.js',
  'core/combat/ai_healer.js', 'core/combat/ai_monster.js', 'core/combat/loot.js',
  'core/dungeon/gen.js', 'core/dungeon/floor.js',
];

function load(files, opts = {}) {
  const sandbox = { console, Math, Date, JSON, Array, Object, Number, String, Boolean, Map, Set, Uint8Array, Uint16Array, Int32Array, Float32Array, Error, TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }, setTimeout, clearTimeout, structuredClone: (x) => JSON.parse(JSON.stringify(x)) };
  if (opts.localStorage !== false) { const mem = {}; sandbox.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } }; }
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const list = files === 'all' || !files ? ORDER : files;
  for (const f of list) {
    const p = path.isAbsolute(f) ? f : path.join(JS_DIR, f);
    if (!fs.existsSync(p)) { if (opts.strict) throw new Error('missing ' + p); continue; }
    const code = fs.readFileSync(p, 'utf8');
    // 전역 const 선언이 컨텍스트 전역이 되도록 var 로 승격하지 않고, 파일 끝에 명시적 노출을 기대한다.
    vm.runInContext(code + '\n', ctx, { filename: p });
    // 파일의 최상위 const 가 전역 객체 프로퍼티가 아니므로 module.exports 로 노출된 이름을 전역에 올린다.
    const m = code.match(/module\.exports\s*=\s*([A-Za-z_$][\w$]*)/);
    if (m) { const name = m[1]; vm.runInContext(`globalThis.${name} = ${name};`, ctx); }
  }
  return ctx;
}
load.ORDER = ORDER;
load.JS_DIR = JS_DIR;
module.exports = load;
