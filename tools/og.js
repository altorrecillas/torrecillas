#!/usr/bin/env node
// Genera og.png (1200x630, tarjeta de Open Graph) desde cero, sin dependencias.
// El número de juegos se lee de index.html (gamesApps) para que nunca se desfase.
// Uso:  node tools/og.js            -> regenera og.png en la raíz del proyecto
//       node tools/og.js --check    -> solo dice qué número pondría, sin escribir
//
// Reconstruido en jul-2026: antes la imagen se editaba a mano y el "12 JUEGOS"
// se quedó desfasado. Este generador cierra ese agujero.
const fs = require('fs');
const path = require('path');
const { encode, chunk } = require('./png.js');
const { glyph } = require('./font5x7.js');

const ROOT = path.join(__dirname, '..');
const W = 1200, H = 630;

// -- nº de juegos, leído de la fuente de verdad --
function contarJuegos() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const gamesApps=\[([\s\S]*?)\n\];/);
  if (!m) throw new Error('no encuentro gamesApps en index.html');
  return (m[1].match(/\{key:/g) || []).length;
}

// -- lienzo RGB --
const px = Buffer.alloc(W * H * 3);
const set = (x, y, r, g, b) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = (y * W + x) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b;
};
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

// -- fondo estilo Bliss: cielo azul degradado + dos colinas verdes --
function fondo() {
  for (let y = 0; y < H; y++) {
    // cielo: azul intenso arriba -> más claro hacia el horizonte
    const t = y / (H * 0.62);
    const r = lerp(0x1c, 0x5a, Math.min(1, t));
    const g = lerp(0x4b, 0x92, Math.min(1, t));
    const b = lerp(0xb0, 0xe0, Math.min(1, t));
    for (let x = 0; x < W; x++) set(x, y, r, g, b);
  }
  // colina: seno suave, verde degradado
  const base = H * 0.62;
  for (let x = 0; x < W; x++) {
    const h = Math.sin(x / W * Math.PI) * 70 + Math.sin(x / W * Math.PI * 2.3) * 22;
    const top = Math.round(base - h);
    for (let y = top; y < H; y++) {
      const t = (y - top) / (H - top);
      set(x, y, lerp(0x6a, 0x2d, t), lerp(0xb0, 0x70, t), lerp(0x38, 0x18, t));
    }
    // filo claro de la colina
    set(x, top, 0x9c, 0xd8, 0x6a); set(x, top + 1, 0x86, 0xc4, 0x54);
  }
}

// -- logo 2x2 (los cuatro cuadrados de colores) --
function logo(x0, y0, s) {
  const cols = [[0xf2, 0x50, 0x22], [0x7f, 0xba, 0x00], [0x00, 0xa4, 0xef], [0xff, 0xb9, 0x00]];
  const gap = Math.round(s * 0.12), c = Math.round((s - gap) / 2);
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([cx, cy], i) => {
    const [r, g, b] = cols[i];
    const ox = x0 + cx * (c + gap), oy = y0 + cy * (c + gap);
    for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) {
      // esquinas redondeadas + brillo diagonal
      const rad = 6, dx = Math.min(x, c - 1 - x), dy = Math.min(y, c - 1 - y);
      if (dx < rad && dy < rad && (rad - dx) ** 2 + (rad - dy) ** 2 > rad * rad) continue;
      const sh = 1 - (x + y) / (c * 2) * 0.35;
      set(ox + x, oy + y, Math.round(r * sh + 40 * (1 - sh)), Math.round(g * sh + 40 * (1 - sh)), Math.round(b * sh + 40 * (1 - sh)));
    }
  });
}

// -- cuantización a 256 colores (median cut sin dithering: la tarjeta es plana,
//    con dithering el PNG engorda). Reduce el archivo a ~la mitad. --
function medianCut(list, depth) {
  if (depth === 0 || !list.length) {
    if (!list.length) return [[0, 0, 0]];
    let r = 0, g = 0, b = 0;
    for (const p of list) { r += p[0]; g += p[1]; b += p[2]; }
    return [[Math.round(r / list.length), Math.round(g / list.length), Math.round(b / list.length)]];
  }
  let mn = [255, 255, 255], mx = [0, 0, 0];
  for (const p of list) for (let c = 0; c < 3; c++) { if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c]; }
  let ch = 0, best = -1;
  for (let c = 0; c < 3; c++) { const r = mx[c] - mn[c]; if (r > best) { best = r; ch = c; } }
  list.sort((a, b) => a[ch] - b[ch]);
  const mid = list.length >> 1;
  return medianCut(list.slice(0, mid), depth - 1).concat(medianCut(list.slice(mid), depth - 1));
}
function palettePNG(px, w, h) {
  const pixels = [];
  for (let i = 0; i < px.length; i += 3) pixels.push([px[i], px[i + 1], px[i + 2]]);
  const step = Math.max(1, Math.floor(pixels.length / 120000));
  const pal = medianCut(pixels.filter((_, i) => i % step === 0), 8).slice(0, 256);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const cache = new Map();
  const near = (r, g, b) => { let bi = 0, bd = Infinity; for (let i = 0; i < 256; i++) { const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
  const idx = Buffer.alloc(w * h);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b] = pixels[i], key = (r << 16) | (g << 8) | b;
    let j = cache.get(key); if (j === undefined) { j = near(r, g, b); cache.set(key, j); }
    idx[i] = j;
  }
  const plte = Buffer.alloc(768);
  pal.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
  return encode(idx, w, h, 1, 3, [chunk('PLTE', plte)]);
}

// -- texto con la fuente 5x7, escalable, con sombra --
function texto(str, x0, y0, scale, col, shadow) {
  str = str.toUpperCase();
  let x = x0;
  for (const ch of str) {
    const g = glyph(ch);
    const dibujaCelda = (cx, cy, c) => {
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++)
        set(x + cx * scale + xx, y0 + cy * scale + yy, c[0], c[1], c[2]);
    };
    for (let cy = 0; cy < 7; cy++) for (let cx = 0; cx < 5; cx++) {
      if (g[cy][cx] === '1') {
        if (shadow) {
          // sombra desplazada +scale,+scale
          for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++)
            set(x + cx * scale + xx + scale, y0 + cy * scale + yy + scale, shadow[0], shadow[1], shadow[2]);
        }
      }
    }
    for (let cy = 0; cy < 7; cy++) for (let cx = 0; cx < 5; cx++)
      if (g[cy][cx] === '1') dibujaCelda(cx, cy, col);
    x += (ch === ' ' ? 3 : 6) * scale;
  }
  return x;
}

function main() {
  const n = contarJuegos();
  if (process.argv.includes('--check')) {
    console.log('og.js pondría: ' + n + ' JUEGOS');
    return;
  }
  fondo();
  logo(96, 150, 170);
  const BL = [255, 255, 255], AM = [255, 0xd5, 0x4f], SO = [0x22, 0x51, 0xa6];
  texto('TORRECILLAS OS', 310, 168, 8, BL, SO);
  texto('UN ESCRITORIO XP EN TU NAVEGADOR', 310, 272, 4, BL, SO);
  texto(n + ' JUEGOS · PAINT · PORTFOLIO', 310, 312, 4, AM, SO);
  // barra de tareas abajo
  for (let y = H - 46; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y - (H - 46)) / 46;
    set(x, y, lerp(0x2a, 0x14, t), lerp(0x5f, 0x35, t), lerp(0xc8, 0xa0, t));
  }
  texto('INICIO', 40, H - 34, 3, BL, null);
  texto('12:00', 1074, H - 34, 3, BL, null);

  const out = palettePNG(px, W, H);
  fs.writeFileSync(path.join(ROOT, 'og.png'), out);
  console.log('og.png regenerado: ' + n + ' JUEGOS, ' + out.length + ' bytes');
}
main();
