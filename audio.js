// -------------------------------------------------------------
// 사운드: Web Audio로 직접 합성 (음원 파일 없음)
// 배경음악 = 잔잔한 앰비언트 신스 루프. 게임 중엔 긴장도에 따라 베이스·킥이 더해짐
// 효과음 = 점령·피탈·카드·큰 아이템 발동·컨셉 발동·승패만 (총알 소리 없음)
// -------------------------------------------------------------
(function () {
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const S = {
    musicOn: store('tw_music') !== '0',
    sfxOn: store('tw_sfx') !== '0',
    ctx: null, master: null, musicBus: null, sfxBus: null, delay: null,
    mode: 'home', tension: 0, nextBar: 0, bar: 0, timer: null, lastSfx: {},
  };
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // Am - F - C - G (홈/게임 공통), 각 화음은 midi 노트
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]];
  const BASS = [45, 41, 48, 43];
  const BAR = 4.0; // 한 마디 길이(초) ≈ 60bpm

  function ensure() {
    if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const c = S.ctx = new AC();
    S.master = c.createGain(); S.master.gain.value = 0.8; S.master.connect(c.destination);
    S.musicBus = c.createGain(); S.musicBus.gain.value = S.musicOn ? 0.5 : 0; S.musicBus.connect(S.master);
    S.sfxBus = c.createGain(); S.sfxBus.gain.value = S.sfxOn ? 0.6 : 0; S.sfxBus.connect(S.master);
    // 공간감: 피드백 딜레이
    const d = S.delay = c.createDelay(1.5); d.delayTime.value = 0.375;
    const fb = c.createGain(); fb.gain.value = 0.35; const lp = c.createBiquadFilter(); lp.frequency.value = 2200;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(S.musicBus);
    S.nextBar = c.currentTime + 0.1;
    S.timer = setInterval(schedule, 200);
    return true;
  }

  function env(g, t, a, peak, rel, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function voice(bus, type, freq, t, dur, peak, a, rel, cutoff, detune, toDelay) {
    const c = S.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = cutoff || 1800;
    o.connect(f); f.connect(g); g.connect(bus); if (toDelay) g.connect(S.delay);
    env(g, t, a, peak, rel, dur); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function kick(t, peak) {
    const c = S.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    o.connect(g); g.connect(S.musicBus); env(g, t, 0.005, peak, 0.25, 0.3); o.start(t); o.stop(t + 0.35);
  }

  function playBar(t, i) {
    const ch = CHORDS[i % 4], bus = S.musicBus;
    // 패드: 살짝 어긋난 톱니파 두 겹을 부드럽게
    ch.forEach(n => { [-7, 7].forEach(dt => voice(bus, 'sawtooth', midi(n), t, BAR + 0.6, 0.035, 1.2, 1.4, 900, dt)); });
    if (S.mode === 'home' && i % 2 === 1) return; // 홈은 아르페지오를 성기게
    // 아르페지오: 삼각파 8분음표 + 딜레이
    const step = BAR / 8, seq = [0, 1, 2, 1, 0, 2, 1, 2];
    const tense = S.mode === 'game' ? S.tension : 0;
    seq.forEach((k, j) => {
      if (S.mode === 'home' && j % 2) return;
      const n = ch[k] + 12 + (tense > 0.6 && j === 6 ? 12 : 0);
      voice(bus, 'triangle', midi(n), t + j * step, step * 1.6, 0.05, 0.01, step, 3000, 0, true);
    });
    if (S.mode !== 'game') return;
    // 긴장도가 오르면 베이스·킥이 더해짐
    if (tense > 0.3) {
      [0, BAR / 2].forEach(o => voice(bus, 'sine', midi(BASS[i % 4]), t + o, BAR * 0.45, 0.16 * Math.min(1, tense), 0.02, 0.3, 400));
    }
    if (tense > 0.55) for (let b = 0; b < 4; b++) kick(t + b * BAR / 4, 0.25 * tense);
  }

  function schedule() {
    if (!S.ctx || !S.musicOn) return;
    const c = S.ctx;
    if (S.nextBar < c.currentTime) S.nextBar = c.currentTime + 0.05;
    while (S.nextBar < c.currentTime + 0.6) {
      if (S.mode !== 'end') playBar(S.nextBar, S.bar++);
      S.nextBar += BAR;
    }
    if (S.mode === 'game' && typeof rawZones !== 'undefined' && rawZones.length) {
      // 긴장도: 내 지역과 적 지역 수가 비슷할수록, 컨셉이 발동 중일수록 높음
      let p = 0, e = 0;
      for (const z of rawZones) { if (z.owner === OWNER.PLAYER) p++; else if (z.owner !== OWNER.NEUTRAL) e++; }
      const close = p + e ? 1 - Math.abs(p - e) / (p + e) : 0;
      const target = Math.min(1, close * 0.8 + (p + e) / rawZones.length * 0.3);
      S.tension += (target - S.tension) * 0.05;
    }
  }

  // ---- 효과음 ----
  function sfx(name) {
    if (!S.sfxOn || !ensure()) return;
    const now = performance.now();
    if (now - (S.lastSfx[name] || 0) < 120) return; // 같은 소리 연타 방지
    S.lastSfx[name] = now;
    const c = S.ctx, t = c.currentTime + 0.01, b = S.sfxBus;
    const notes = (arr, type, step, len, peak, cut) => arr.forEach((n, i) => voice(b, type, midi(n), t + i * step, len, peak, 0.005, len * 0.8, cut || 4000));
    switch (name) {
      case 'capture': notes([72, 79], 'triangle', 0.07, 0.25, 0.22); break;
      case 'lost': notes([64, 57], 'sine', 0.09, 0.3, 0.22, 1200); break;
      case 'card': notes([76, 81, 88], 'triangle', 0.05, 0.3, 0.15); break;
      case 'pick': notes([84], 'sine', 0, 0.18, 0.2); break;
      case 'crit': notes([88, 91], 'square', 0.04, 0.12, 0.06, 3000); break;
      case 'reflect': notes([93, 86], 'triangle', 0.05, 0.2, 0.12); break;
      case 'explode': {
        const len = 0.6, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(120, t + len);
        g.gain.value = 0.45; s.connect(f); f.connect(g); g.connect(b); s.start(t);
        break;
      }
      case 'concept': notes([57, 64, 69, 76], 'sawtooth', 0.09, 0.8, 0.06, 1500); break;
      case 'win': notes([72, 76, 79, 84, 88], 'triangle', 0.12, 0.9, 0.18); break;
      case 'lose': notes([69, 65, 62, 57], 'sine', 0.22, 1.0, 0.2, 1500); break;
    }
  }

  function setMode(m) {
    S.mode = m;
    if (m === 'game') S.tension = 0;
  }
  function setMusic(on) {
    S.musicOn = on; store('tw_music', on ? '1' : '0');
    if (on) ensure();
    if (S.musicBus) S.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, S.ctx.currentTime, 0.2);
    refreshButtons();
  }
  function setSfx(on) {
    S.sfxOn = on; store('tw_sfx', on ? '1' : '0');
    if (on) ensure();
    if (S.sfxBus) S.sfxBus.gain.value = on ? 0.6 : 0;
    refreshButtons();
  }
  function refreshButtons() {
    const m = document.getElementById('music-btn'), s = document.getElementById('sfx-btn');
    if (m) m.textContent = S.musicOn ? '음악 켜짐' : '음악 꺼짐';
    if (s) s.textContent = S.sfxOn ? '효과음 켜짐' : '효과음 꺼짐';
  }
  // iOS는 사용자가 화면을 처음 만질 때만 소리를 켤 수 있음
  const unlock = () => { if (S.musicOn || S.sfxOn) ensure(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!S.ctx) return;
    if (document.hidden) S.ctx.suspend(); else S.ctx.resume();
  });
  document.addEventListener('DOMContentLoaded', refreshButtons);
  refreshButtons();

  window.Sound = { sfx, setMode, toggleMusic: () => setMusic(!S.musicOn), toggleSfx: () => setSfx(!S.sfxOn), _s: S };
})();
