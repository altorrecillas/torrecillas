#!/usr/bin/env node
// Genera og.png (1200x630, la tarjeta que se ve al compartir el enlace) desde cero, sin
// dependencias. El número de juegos se lee de index.html (gamesApps) para que nunca se
// desfase, y viaja también en un trozo tEXt del PNG para que la suite pueda comprobarlo.
// Uso:  node tools/og.js            -> regenera og.png en la raíz del proyecto
//       node tools/og.js --check    -> solo dice qué número pondría, sin escribir
//
// Reconstruido en ago-2026: la versión anterior escribía con una fuente de mapa de bits de
// 5x7 escalada x4 y a tamaño de tarjeta se veía como una captura de 1998. Ahora dibuja el
// escritorio de verdad —fondo Bliss, una ventana XP con su barra de título y la barra de
// tareas— con antialiasing y los contornos reales de Rajdhani (tools/dibujo.js).
const fs = require('fs');
const path = require('path');
const { encode, chunk } = require('./png.js');
const D = require('./dibujo.js');

const ROOT = path.join(__dirname, '..');
const W = 1200, H = 630;

// -- nº de juegos, leído de la fuente de verdad --
function contarJuegos() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const gamesApps=\[([\s\S]*?)\n\];/);
  if (!m) throw new Error('no encuentro gamesApps en index.html');
  return (m[1].match(/\{key:/g) || []).length;
}

// ── Fondo: cielo Bliss y dos colinas ─────────────────────────────────────────
// La colina va curvada (no una banda plana como el fondo de escritorio) porque a este
// tamaño una línea recta de horizonte canta muchísimo.
function colina(altoIzq, altoCima, xCima, altoDer) {
  const pts = [];
  for (let x = 0; x <= W; x += 4) {
    let y;
    if (x <= xCima) {
      const t = x / xCima;                       // subida suave
      y = altoIzq + (altoCima - altoIzq) * (0.5 - Math.cos(t * Math.PI) / 2);
    } else {
      const t = (x - xCima) / (W - xCima);       // bajada larga
      y = altoCima + (altoDer - altoCima) * (0.5 - Math.cos(t * Math.PI) / 2);
    }
    pts.push([x, y]);
  }
  pts.push([W, H], [0, H]);
  return [pts];
}

function fondo(l) {
  D.degradadoVertical(l, 0, 0, W, H, [
    [0, '#0050d4'], [0.22, '#1a6fe0'], [0.42, '#4a9af0'], [0.62, '#87c0f8'], [0.78, '#b0d8ff'], [1, '#cfe6ff']
  ]);
  D.rellenaDegradado(l, colina(392, 330, 430, 470), [[0, '#8ec96b'], [0.45, '#6ab04c'], [1, '#4a9a2a']]);
  D.rellenaDegradado(l, colina(486, 452, 250, 560), [[0, '#5da832'], [0.5, '#3d8822'], [1, '#2d7018']]);
}

// Velo por la izquierda: sin él, el blanco del texto se pelea con el cielo claro del horizonte
function velo(l) {
  const col = D.hex('#031236');
  for (let x = 0; x < 760; x++) {
    const a = 0.52 * (1 - x / 760) ** 1.3;
    for (let y = 0; y < H - 46; y++) D.mezcla(l, x, y, col, a);
  }
}

// ── Logo: la bandera 2x2, con su brillo y su inclinación ─────────────────────
const TEJAS = [
  [['#ff7a45', '#e63a0a']], [['#9fdc2e', '#5f9e00']], [['#3ec5ff', '#0080d8']], [['#ffd24a', '#f0a000']]
];
function logo(l, x, y, lado, hueco, radio, ang) {
  const cx = x + lado + hueco / 2, cy = y + lado + hueco / 2;
  TEJAS.forEach((teja, i) => {
    const tx = x + (i % 2) * (lado + hueco), ty = y + Math.floor(i / 2) * (lado + hueco);
    const forma = D.rota(D.rectRedondo(tx, ty, lado, lado, radio), ang, cx, cy);
    D.rellenaDegradado(l, forma, [[0, teja[0][0]], [1, teja[0][1]]]);
    // brillo de arriba, como el cristal de XP
    const luz = D.rota(D.rectRedondo(tx, ty, lado, lado * 0.46, [radio, radio, 2, 2]), ang, cx, cy);
    D.rellena(l, luz, '#ffffff', 0.22);
  });
}

// ── La ventana ───────────────────────────────────────────────────────────────
function ventana(l, x, y, w, h) {
  const marco = D.rectRedondo(x, y, w, h, [8, 8, 0, 0]);
  D.sombra(l, marco, { dx: 0, dy: 14, radio: 26, alfa: 0.42 });
  D.rellena(l, marco, '#0054e3');                                  // borde azul de 2px
  D.rellena(l, D.rectRedondo(x + 2, y + 2, w - 4, h - 4, [6, 6, 0, 0]), '#ece9d8');

  // Barra de título con el degradado exacto del tema
  const bt = D.rectRedondo(x + 2, y + 2, w - 4, 30, [6, 6, 0, 0]);
  D.rellenaDegradado(l, bt, [
    [0, '#0997ff'], [0.08, '#0053e0'], [0.2, '#0050d8'], [0.4, '#0060e8'],
    [0.6, '#0070f0'], [0.8, '#0058e0'], [0.95, '#0048c8'], [1, '#0040b8']
  ]);
  D.rellena(l, D.rectRedondo(x + 2, y + 2, w - 4, 14, [6, 6, 0, 0]), '#ffffff', 0.2);

  // Iconito de paleta + título
  D.rellena(l, D.elipse(x + 18, y + 17, 7, 7), '#ffffff', 0.9);
  [['#e63a0a', -3.2, -2.4], ['#0080d8', 1.6, -3.2], ['#5f9e00', 2.8, 1.4]].forEach(([c, dx, dy]) =>
    D.rellena(l, D.elipse(x + 18 + dx, y + 17 + dy, 1.7, 1.7), c));
  D.texto(l, 'Paint', { x: x + 31, y: y + 21, tam: 13, peso: 600, color: '#ffffff' });

  // Botones de la derecha
  [[false, 0], [false, 1], [true, 2]].forEach(([rojo, i]) => {
    const bx = x + w - 74 + i * 23;
    D.rellena(l, D.rectRedondo(bx, y + 8, 20, 18, 3), '#ffffff', 0.5);
    D.rellenaDegradado(l, D.rectRedondo(bx + 1, y + 9, 18, 16, 3),
      rojo ? [[0, '#ff8a63'], [1, '#d3341a']] : [[0, '#4a9bff'], [1, '#0f5ad0']]);
  });

  // Menú
  let mx = x + 19;
  ['Archivo', 'Edición', 'Ver', 'Imagen'].forEach(op => {
    mx += D.texto(l, op, { x: mx, y: y + 48, tam: 12, peso: 400, color: '#2b2b2b' }) + 16;
  });
  D.rellenaRect(l, x + 3, y + 56, w - 6, 1, D.hex('#d6d2c2'));

  // Caja de herramientas
  for (let i = 0; i < 6; i++) {
    const tx = x + 12 + (i % 2) * 21, ty = y + 68 + Math.floor(i / 2) * 21;
    D.rellena(l, D.rectRedondo(tx, ty, 18, 18, 3), i === 0 ? '#ffffff' : '#dcd8c8');
    D.rellena(l, D.rectRedondo(tx, ty, 18, 18, 3), '#9b9683', 0.55);
    D.rellena(l, D.rectRedondo(tx + 1, ty + 1, 16, 16, 2), i === 0 ? '#ffffff' : '#dcd8c8');
  }

  // Lienzo del Paint con un dibujo hecho a mano
  const lx = x + 56, ly = y + 68, lw = w - 70, lh = h - 84;
  D.rellena(l, D.rectRedondo(lx, ly, lw, lh, 0), '#9b9683');
  D.rellena(l, D.rectRedondo(lx + 1, ly + 1, lw - 2, lh - 2, 0), '#ffffff');
  const recorta = (camino) => camino.map(sub => sub.map(([px, py]) => [
    Math.min(lx + lw - 2, Math.max(lx + 1, px)), Math.min(ly + lh - 2, Math.max(ly + 1, py))
  ]));
  const cerro = (base, cima, xc) => recorta([[...Array.from({ length: 61 }, (_, i) => {
    const px = lx + (i / 60) * lw;
    const t = Math.abs(px - xc) / lw;
    return [px, base - (base - cima) * Math.max(0, 1 - t * 2.6)];
  }), [lx + lw, ly + lh], [lx, ly + lh]]]);
  D.rellena(l, D.elipse(lx + lw - 62, ly + 44, 22, 22), '#ffd24a');
  D.rellena(l, cerro(ly + lh - 34, ly + lh - 96, lx + lw * 0.34), '#8ec96b');
  D.rellena(l, cerro(ly + lh - 12, ly + lh - 54, lx + lw * 0.66), '#5da832');
  [[0.16, 0.2, 1], [0.44, 0.13, 0.78]].forEach(([px, py, esc]) => {
    const cx = lx + lw * px, cy = ly + lh * py;
    [[-13, 2, 12, 7], [0, -3, 15, 10], [14, 2, 11, 7]].forEach(([dx, dy, rx, ry]) =>
      D.rellena(l, D.elipse(cx + dx * esc, cy + dy * esc, rx * esc, ry * esc), '#cfe8ff'));
  });
}

// ── Barra de tareas ──────────────────────────────────────────────────────────
function barraTareas(l) {
  const y = H - 46;
  D.degradadoVertical(l, 0, y, W, 46, [
    [0, '#3168d5'], [0.03, '#2456b8'], [0.06, '#1941a5'], [0.94, '#1941a5'], [1, '#1635a0']
  ]);
  D.rellenaRect(l, 0, y, W, 1, D.hex('#7ea6f0'));
  const bw = 148;
  D.rellenaDegradado(l, D.rectRedondo(-14, y, bw + 14, 46, [0, 13, 13, 0]), [
    [0, '#3c9a3c'], [0.15, '#308a30'], [0.5, '#2d7e2d'], [0.85, '#257025'], [1, '#1e651e']
  ]);
  D.rellena(l, D.rectRedondo(-14, y, bw + 14, 12, [0, 13, 3, 0]), '#ffffff', 0.14);
  logo(l, 16, y + 12, 11, 2, 2, -0.087);
  D.texto(l, 'inicio', { x: 52, y: y + 31, tam: 19, peso: 700, color: '#ffffff', cursiva: -11 });

  // Botón de la ventana abierta: sin él la barra parece un escritorio recién arrancado
  const tb = D.rectRedondo(bw + 12, y + 5, 168, 36, 4);
  D.rellenaDegradado(l, tb, [[0, '#4a86e8'], [0.5, '#2f6cd8'], [1, '#1f57bc']]);
  D.rellena(l, D.rectRedondo(bw + 12, y + 5, 168, 12, [4, 4, 2, 2]), '#ffffff', 0.13);
  D.rellena(l, D.elipse(bw + 32, y + 23, 7, 7), '#ffffff', 0.92);
  [['#e63a0a', -3.2, -2.4], ['#0080d8', 1.6, -3.2], ['#5f9e00', 2.8, 1.4]].forEach(([c, dx, dy]) =>
    D.rellena(l, D.elipse(bw + 32 + dx, y + 23 + dy, 1.7, 1.7), c));
  D.texto(l, 'Paint', { x: bw + 46, y: y + 28, tam: 14, peso: 400, color: '#ffffff' });

  // Bandeja del sistema, con su separador hundido
  D.rellenaRect(l, W - 92, y + 6, 1, 34, D.hex('#12327f'));
  D.rellenaRect(l, W - 91, y + 6, 1, 34, D.hex('#5a8ae8'));
  D.texto(l, '12:00', { x: W - 22, y: y + 29, tam: 15, peso: 400, color: '#ffffff', align: 'der' });
}

// ── Composición ──────────────────────────────────────────────────────────────
function dibuja(nJuegos) {
  const l = D.crearLienzo(W, H);
  fondo(l);
  velo(l);
  ventana(l, 686, 118, 462, 336);

  logo(l, 64, 132, 42, 5, 7, -0.105);
  const sombraTexto = { dx: 0, dy: 3, radio: 14, alfa: 0.5 };
  let x = 175;
  x += D.texto(l, 'Torrecillas', { x, y: 198, tam: 64, peso: 700, color: '#ffffff', sombraTexto });
  D.texto(l, 'OS', { x: x + 14, y: 198, tam: 36, peso: 700, color: '#ffd24a', espaciado: 3, sombraTexto });

  D.texto(l, 'Un escritorio XP que vive en tu navegador', {
    x: 64, y: 290, tam: 31, peso: 600, color: '#ffffff', sombraTexto: { dx: 0, dy: 2, radio: 10, alfa: 0.45 }
  });

  // Píldora con lo que hay dentro
  const partes = [String(nJuegos), 'juegos', '·', 'Paint', '·', 'Terminal', '·', 'Portfolio'];
  const tam = 20, sep = 9;
  const anchos = partes.map(p => D.mideTexto(p, { tam, peso: 600 }));
  const anchoTexto = anchos.reduce((a, b) => a + b, 0) + sep * (partes.length - 1);
  const px = 64, py = 328, ph = 46, pw = anchoTexto + 40;
  D.rellena(l, D.rectRedondo(px, py, pw, ph, ph / 2), '#041640', 0.42);
  D.rellena(l, D.rectRedondo(px, py, pw, ph, ph / 2), '#ffffff', 0.1);
  D.rellena(l, D.rectRedondo(px + 1, py + 1, pw - 2, ph - 2, (ph - 2) / 2), '#041640', 0.32);
  let tx = px + 20;
  partes.forEach((p, i) => {
    const esNumero = i === 0, esPunto = p === '·';
    tx += D.texto(l, p, {
      x: tx, y: py + 31, tam, peso: esNumero ? 700 : 600,
      color: esNumero ? '#ffd24a' : '#ffffff', alfa: esPunto ? 0.5 : 1
    }) + sep;
  });

  barraTareas(l);
  return l;
}

// ── Salida ───────────────────────────────────────────────────────────────────
const n = contarJuegos();
if (process.argv.includes('--check')) {
  console.log('og.js pondría: ' + n + ' juegos');
  process.exit(0);
}
const lienzo = dibuja(n);
// El número también va escrito en un trozo tEXt: así la suite comprueba que la imagen no se
// ha quedado desfasada sin tener que leer píxeles (que era lo que obligaba a la fuente de
// mapa de bits: sus dígitos se podían reconocer uno a uno).
const extra = [
  chunk('tEXt', Buffer.from('juegos\0' + n, 'latin1')),
  chunk('tEXt', Buffer.from('Software\0Torrecillas OS · tools/og.js', 'latin1'))
];
const png = encode(lienzo.px, W, H, 3, 2, extra);
fs.writeFileSync(path.join(ROOT, 'og.png'), png);
console.log('og.png escrito: ' + W + 'x' + H + ', ' + n + ' juegos, ' + Math.round(png.length / 1024) + ' KB');
