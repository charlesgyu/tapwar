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
  // 점령전 느낌: D단조 진행 Dm - B♭ - C - A (마지막 A가 긴장감을 만듦)
  const CHORDS = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]];
  const BASS = [38, 34, 36, 33];
  // 행진곡 선율 (마디당 8분음표 8개, 0 = 쉼)
  const MELODY = [
    [74, 0, 74, 76, 77, 0, 76, 74], [74, 0, 70, 0, 72, 74, 72, 70],
    [72, 0, 72, 74, 76, 0, 74, 72], [73, 0, 76, 0, 81, 0, 79, 76],
  ];
  const BAR = 2.2; // 한 마디 길이(초) ≈ 109bpm 행진 템포

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
  function noise(len) {
    const c = S.ctx, buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; return src;
  }
  // 전쟁 북 (낮은 타이코)
  function drum(t, peak, pitch) {
    const c = S.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(pitch || 120, t); o.frequency.exponentialRampToValueAtTime((pitch || 120) * 0.35, t + 0.3);
    o.connect(g); g.connect(S.musicBus); env(g, t, 0.004, peak, 0.3, 0.4); o.start(t); o.stop(t + 0.45);
  }
  // 스네어 (군악대 작은북)
  function snare(t, peak) {
    const c = S.ctx, src = noise(0.2), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(S.musicBus); env(g, t, 0.002, peak, 0.12, 0.15); src.start(t); src.stop(t + 0.2);
  }
  // 금관 느낌: 톱니파 + 필터가 열렸다 닫힘
  function brass(n, t, dur, peak) {
    const c = S.ctx;
    [-6, 6].forEach(dt => {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = dt;
      f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2600, t + 0.06); f.frequency.exponentialRampToValueAtTime(900, t + dur);
      o.connect(f); f.connect(g); g.connect(S.musicBus); g.connect(S.delay);
      env(g, t, 0.03, peak, Math.min(0.15, dur * 0.4), dur); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  function playBar(t, i) {
    const k = i % 4, ch = CHORDS[k], bus = S.musicBus, e = BAR / 8, s16 = BAR / 16;
    const game = S.mode === 'game', tense = game ? S.tension : 0;
    // 낮은 현악 오스티나토: 16분음표로 쉬지 않고 몰아침
    const ost = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 12];
    ost.forEach((o, j) => {
      if (!game && j % 2) return; // 홈은 8분음표로만
      voice(bus, 'sawtooth', midi(BASS[k] + 12 + o), t + j * s16, s16 * 0.9, game ? 0.06 : 0.04, 0.005, s16 * 0.5, 1100);
    });
    // 어두운 패드
    ch.forEach(n => voice(bus, 'sawtooth', midi(n - 12), t, BAR + 0.1, 0.02, 0.3, 0.4, 700, 5));
    // 전쟁 북: 1, 3박 + 당김음
    drum(t, 0.5, 110); drum(t + e * 4, 0.45, 110);
    if (game) { drum(t + e * 3, 0.3, 140); drum(t + e * 7, 0.3, 140); }
    if (!game) return;
    // 베이스
    voice(bus, 'sine', midi(BASS[k]), t, BAR * 0.5, 0.2, 0.01, 0.2, 300);
    voice(bus, 'sine', midi(BASS[k]), t + BAR / 2, BAR * 0.5, 0.2, 0.01, 0.2, 300);
    // 스네어 행진 리듬 (긴장도 0.25부터), 마지막 마디는 연타
    if (tense > 0.25) {
      [2, 6].forEach(b => snare(t + b * e, 0.18));
      if (k === 3) for (let r = 0; r < 4; r++) snare(t + BAR - (4 - r) * s16, 0.08 + r * 0.04);
    }
    // 금관 선율 (긴장도 0.45부터), 더 오르면 한 옥타브 위 겹침
    if (tense > 0.45) {
      MELODY[k].forEach((n, j) => { if (n) brass(n - 12, t + j * e, e * 0.9, 0.05); });
      if (tense > 0.7) MELODY[k].forEach((n, j) => { if (n) brass(n, t + j * e, e * 0.9, 0.03); });
    }
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
    if (m === 'game') S.tension = 0.3; // 시작부터 작은북이 깔리게
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
    if (m) {
      m.textContent = window.t ? window.t(S.musicOn ? 'music_on' : 'music_off') : (S.musicOn ? '음악 켜짐' : '음악 꺼짐');
    }
    if (s) {
      s.textContent = window.t ? window.t(S.sfxOn ? 'sfx_on' : 'sfx_off') : (S.sfxOn ? '효과음 켜짐' : '효과음 꺼짐');
    }
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

  window.Sound = { sfx, setMode, toggleMusic: () => setMusic(!S.musicOn), toggleSfx: () => setSfx(!S.sfxOn), refreshButtons, _s: S, _playBar: playBar };
})();
