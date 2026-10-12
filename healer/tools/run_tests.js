// 간단한 테스트 러너: healer/tests/*.test.js 를 실행. 각 테스트 파일은 module.exports = { name: async fn, ... } 또는 함수 배열.
// 사용: node healer/tools/run_tests.js [filter]
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const TEST_DIR = path.join(__dirname, '..', 'tests');
const filter = process.argv[2] || '';
(async () => {
  const files = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();
  let pass = 0, fail = 0;
  for (const f of files) {
    let mod;
    try { mod = require(path.join(TEST_DIR, f)); } catch (e) { console.log(`✗ ${f} (load error)\n   ${e.stack}`); fail++; continue; }
    const tests = typeof mod === 'function' ? { [f]: mod } : mod;
    for (const [name, fn] of Object.entries(tests)) {
      const t0 = Date.now();
      try { await fn(assert); pass++; console.log(`✓ ${f} › ${name} (${Date.now() - t0}ms)`); }
      catch (e) { fail++; console.log(`✗ ${f} › ${name}\n   ${(e && e.stack) || e}`); }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
