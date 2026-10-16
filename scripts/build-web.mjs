// 앱에 넣을 웹 파일을 www/ 로 복사 (Capacitor webDir)
// 설치된 앱이 최신인지 확인할 수 있게 index.html 에 빌드 버전(커밋 + 시각)을 새김 → 홈 화면 ⓘ 에서 확인
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('game.js', `${out}/game.js`);
cpSync('audio.js', `${out}/audio.js`);
cpSync('i18n.js', `${out}/i18n.js`);
cpSync('assets', `${out}/assets`, { recursive: true });

let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) {}
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const version = `빌드 ${commit} · ${stamp}`;
const html = readFileSync('index.html', 'utf8').replace('<span id="build-ver">웹 버전</span>', `<span id="build-ver">${version}</span>`);
writeFileSync(`${out}/index.html`, html);
console.log(`www/ 준비 완료 (${version})`);
