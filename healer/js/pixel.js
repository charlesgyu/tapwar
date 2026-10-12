// 픽셀 아트 유틸리티 — 문자열 도트맵으로 스프라이트를 만들고, 저해상도 캔버스에 또렷한 도형을 그린다.
const Pixel = (() => {
  function make(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // rows: 같은 길이의 문자열 배열, palette: { 문자: 색 } ('.' 은 투명)
  function fromRows(rows, palette, opts = {}) {
    const h = rows.length, w = rows[0].length;
    for (const r of rows) if (r.length !== w) throw new Error('도트맵 폭이 다릅니다: "' + r + '" (' + r.length + ' != ' + w + ')');
    const padX = opts.padX || 0, padY = opts.padY || 0;
    const c = opts.canvas || make(w + padX * 2, h + padY * 2);
    const ctx = c.getContext('2d');
    const ox = (opts.x || 0) + padX, oy = (opts.y || 0) + padY;
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const col = palette[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
    return c;
  }

  function flipH(src) {
    const c = make(src.width, src.height);
    const ctx = c.getContext('2d');
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    return c;
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // 1px 테두리 사각형
  function outline(ctx, x, y, w, h, color) {
    rect(ctx, x, y, w, 1, color);
    rect(ctx, x, y + h - 1, w, 1, color);
    rect(ctx, x, y, 1, h, color);
    rect(ctx, x + w - 1, y, 1, h, color);
  }

  // 안티앨리어싱 없는 채운 원
  function circle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    }
  }

  function ellipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) {
      const t = dy / ry;
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    }
  }

  // 결정적 난수 (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 색을 밝게/어둡게 (amt: -1 ~ 1)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
    r = f(r); g = f(g); b = f(b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  return { make, fromRows, flipH, rect, outline, circle, ellipse, rng, shade };
})();
