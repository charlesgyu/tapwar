// 앱에 넣을 웹 파일을 www/ 로 복사 (Capacitor webDir)
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'game.js']) cpSync(f, `${out}/${f}`);
cpSync('assets', `${out}/assets`, { recursive: true });
console.log('www/ 준비 완료');
