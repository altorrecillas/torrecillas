// Mini-lienzo 2D sin dependencias, para generar imágenes del proyecto (hoy, og.png).
//
// Por qué existe: og.png se dibujaba píxel a píxel con una fuente de mapa de bits de 5x7,
// y a tamaño grande eso se ve como una captura de 1998. Aquí hay lo justo para pintar con
// calidad: relleno de caminos con antialiasing (submuestreo por filas + cobertura exacta
// en horizontal), degradados, rectángulos redondeados, sombras suaves y texto con los
// CONTORNOS REALES de Rajdhani (los saca tools/extrae-fuente.py de los mismos woff2 que
// carga la web). Nada de esto viaja al navegador: es solo para el generador.
const FUENTE = require('./font-vector.js');

const SUB = 8; // sub-filas por píxel: sube el antialiasing, baja la velocidad

// ── Lienzo ───────────────────────────────────────────────────────────────────
function crearLienzo(w, h, fondo) {
  const px = Buffer.alloc(w * h * 3);
  const l = { w, h, px };
  if (fondo) rellenaRect(l, 0, 0, w, h, fondo);
  return l;
}
const lim = (v, a, b) => (v < a ? a : v > b ? b : v);

function mezcla(l, x, y, color, alfa) {
  if (alfa <= 0 || x < 0 || y < 0 || x >= l.w || y >= l.h) return;
  const o = (y * l.w + x) * 3;
  if (alfa >= 1) { l.px[o] = color[0]; l.px[o + 1] = color[1]; l.px[o + 2] = color[2]; return; }
  l.px[o] += (color[0] - l.px[o]) * alfa;
  l.px[o + 1] += (color[1] - l.px[o + 1]) * alfa;
  l.px[o + 2] += (color[2] - l.px[o + 2]) * alfa;
}

function rellenaRect(l, x, y, w, h, color, alfa = 1) {
  const x0 = Math.max(0, Math.round(x)), x1 = Math.min(l.w, Math.round(x + w));
  const y0 = Math.max(0, Math.round(y)), y1 = Math.min(l.h, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) mezcla(l, xx, yy, color, alfa);
}

// ── Color ────────────────────────────────────────────────────────────────────
function hex(c) {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const mezclaColor = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// paradas: [[0,'#0050d4'],[0.12,'#1a6fe0'],…] con t de 0 a 1 sobre el alto dado
function colorEnParada(paradas, t) {
  t = lim(t, 0, 1);
  for (let i = 0; i < paradas.length - 1; i++) {
    const [t0, c0] = paradas[i], [t1, c1] = paradas[i + 1];
    if (t >= t0 && t <= t1) return mezclaColor(hex(c0), hex(c1), t1 === t0 ? 0 : (t - t0) / (t1 - t0));
  }
  return hex(paradas[t <= paradas[0][0] ? 0 : paradas.length - 1][1]);
}

function degradadoVertical(l, x, y, w, h, paradas) {
  for (let yy = Math.max(0, y); yy < Math.min(l.h, y + h); yy++) {
    const c = colorEnParada(paradas, (yy - y) / h);
    for (let xx = Math.max(0, x); xx < Math.min(l.w, x + w); xx++) mezcla(l, xx, yy, c, 1);
  }
}

// ── Caminos ──────────────────────────────────────────────────────────────────
// Un camino es una lista de subcaminos; cada subcamino, una lista de puntos [x,y] ya en
// píxeles. Las curvas llegan aplanadas: el rasterizador solo ve segmentos rectos.
function rectRedondo(x, y, w, h, r) {
  const rr = Array.isArray(r) ? r : [r, r, r, r]; // sup-izq, sup-der, inf-der, inf-izq
  const pts = [];
  const arco = (cx, cy, radio, desde, hasta) => {
    if (radio <= 0) { pts.push([cx, cy]); return; }
    const n = Math.max(4, Math.ceil(radio / 1.2));
    for (let i = 0; i <= n; i++) {
      const a = desde + (hasta - desde) * (i / n);
      pts.push([cx + Math.cos(a) * radio, cy + Math.sin(a) * radio]);
    }
  };
  arco(x + rr[0], y + rr[0], rr[0], Math.PI, Math.PI * 1.5);
  arco(x + w - rr[1], y + rr[1], rr[1], Math.PI * 1.5, Math.PI * 2);
  arco(x + w - rr[2], y + h - rr[2], rr[2], 0, Math.PI * 0.5);
  arco(x + rr[3], y + h - rr[3], rr[3], Math.PI * 0.5, Math.PI);
  return [pts];
}

function elipse(cx, cy, rx, ry) {
  const n = Math.max(12, Math.ceil(Math.max(rx, ry)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return [pts];
}

const transforma = (camino, fn) => camino.map(sub => sub.map(p => fn(p[0], p[1])));
function rota(camino, ang, cx, cy) {
  const co = Math.cos(ang), si = Math.sin(ang);
  return transforma(camino, (x, y) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * co - dy * si, cy + dx * si + dy * co];
  });
}
const mueve = (camino, dx, dy) => transforma(camino, (x, y) => [x + dx, y + dy]);

// ── Relleno con antialiasing ─────────────────────────────────────────────────
// Submuestreo en vertical (SUB sub-filas) y cobertura exacta en horizontal: los bordes
// diagonales y las curvas de las letras salen limpios sin pintar 64 muestras por píxel.
function bordes(camino) {
  const es = [];
  for (const sub of camino) {
    for (let i = 0; i < sub.length; i++) {
      const a = sub[i], b = sub[(i + 1) % sub.length];
      if (a[1] !== b[1]) es.push([a[0], a[1], b[0], b[1]]);
    }
  }
  return es;
}

function coberturaFila(es, y, x0, x1, cov) {
  cov.fill(0);
  const cortes = [];
  for (let k = 0; k < SUB; k++) {
    const sy = y + (k + 0.5) / SUB;
    cortes.length = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const ya = e[1], yb = e[3];
      if ((ya <= sy && yb > sy) || (yb <= sy && ya > sy)) {
        cortes.push([e[0] + ((sy - ya) * (e[2] - e[0])) / (yb - ya), yb > ya ? 1 : -1]);
      }
    }
    if (!cortes.length) continue;
    cortes.sort((a, b) => a[0] - b[0]);
    let giro = 0;
    for (let i = 0; i < cortes.length - 1; i++) {
      giro += cortes[i][1];
      if (giro === 0) continue; // regla nonzero, la que usan las fuentes
      let xa = cortes[i][0], xb = cortes[i + 1][0];
      if (xb <= x0 || xa >= x1) continue;
      xa = Math.max(xa, x0); xb = Math.min(xb, x1);
      let pa = Math.floor(xa), pb = Math.floor(xb);
      if (pa === pb) { cov[pa - x0] += (xb - xa) / SUB; continue; }
      cov[pa - x0] += (pa + 1 - xa) / SUB;
      for (let p = pa + 1; p < pb; p++) cov[p - x0] += 1 / SUB;
      if (pb - x0 < cov.length) cov[pb - x0] += (xb - pb) / SUB;
    }
  }
}

function cajaDe(camino) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sub of camino) for (const p of sub) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

function rellena(l, camino, color, alfa = 1) {
  const es = bordes(camino);
  if (!es.length) return;
  const [bx0, by0, bx1, by1] = cajaDe(camino);
  const x0 = Math.max(0, Math.floor(bx0)), x1 = Math.min(l.w, Math.ceil(bx1) + 1);
  const y0 = Math.max(0, Math.floor(by0)), y1 = Math.min(l.h, Math.ceil(by1) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  const col = typeof color === 'string' ? hex(color) : color;
  const cov = new Float64Array(x1 - x0);
  for (let y = y0; y < y1; y++) {
    coberturaFila(es, y, x0, x1, cov);
    for (let i = 0; i < cov.length; i++) if (cov[i] > 0.002) mezcla(l, x0 + i, y, col, Math.min(1, cov[i]) * alfa);
  }
}

// Relleno con degradado vertical: el color se decide por fila, la cobertura por píxel
function rellenaDegradado(l, camino, paradas, alfa = 1) {
  const es = bordes(camino);
  if (!es.length) return;
  const [bx0, by0, bx1, by1] = cajaDe(camino);
  const x0 = Math.max(0, Math.floor(bx0)), x1 = Math.min(l.w, Math.ceil(bx1) + 1);
  const y0 = Math.max(0, Math.floor(by0)), y1 = Math.min(l.h, Math.ceil(by1) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  const cov = new Float64Array(x1 - x0);
  for (let y = y0; y < y1; y++) {
    const c = colorEnParada(paradas, (y - by0) / Math.max(1, by1 - by0));
    coberturaFila(es, y, x0, x1, cov);
    for (let i = 0; i < cov.length; i++) if (cov[i] > 0.002) mezcla(l, x0 + i, y, c, Math.min(1, cov[i]) * alfa);
  }
}

// Sombra suave: se pinta la cobertura del camino en un búfer aparte, se difumina con tres
// pasadas de caja (que es lo bastante gaussiano para el ojo) y se compone en negro.
function sombra(l, camino, { dx = 0, dy = 0, radio = 12, alfa = 0.4, color = '#000000' } = {}) {
  const mov = mueve(camino, dx, dy);
  const es = bordes(mov);
  if (!es.length) return;
  const [bx0, by0, bx1, by1] = cajaDe(mov);
  const m = Math.ceil(radio) + 2;
  const x0 = Math.max(0, Math.floor(bx0) - m), x1 = Math.min(l.w, Math.ceil(bx1) + m);
  const y0 = Math.max(0, Math.floor(by0) - m), y1 = Math.min(l.h, Math.ceil(by1) + m);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  let buf = new Float64Array(w * h);
  const cov = new Float64Array(w);
  for (let y = y0; y < y1; y++) {
    coberturaFila(es, y, x0, x1, cov);
    for (let i = 0; i < w; i++) buf[(y - y0) * w + i] = Math.min(1, cov[i]);
  }
  const r = Math.max(1, Math.round(radio / 3));
  const tmp = new Float64Array(w * h);
  for (let paso = 0; paso < 3; paso++) {
    for (let y = 0; y < h; y++) { // horizontal
      let suma = 0;
      for (let x = -r; x <= r; x++) suma += buf[y * w + lim(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = suma / (2 * r + 1);
        suma += buf[y * w + lim(x + r + 1, 0, w - 1)] - buf[y * w + lim(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) { // vertical
      let suma = 0;
      for (let y = -r; y <= r; y++) suma += tmp[lim(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        buf[y * w + x] = suma / (2 * r + 1);
        suma += tmp[lim(y + r + 1, 0, h - 1) * w + x] - tmp[lim(y - r, 0, h - 1) * w + x];
      }
    }
  }
  const col = hex(color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = buf[y * w + x] * alfa;
    if (a > 0.003) mezcla(l, x0 + x, y0 + y, col, Math.min(1, a));
  }
}

// ── Texto con los contornos de verdad ────────────────────────────────────────
// Convierte el camino SVG del glifo (M/L/Q/C/Z absolutos, que es lo que emite fontTools)
// en subcaminos aplanados, ya escalados y colocados sobre la línea de base.
function caminoGlifo(d, esc, ox, oy, inclina) {
  const subs = [];
  let pts = null, x = 0, y = 0, sx = 0, sy = 0;
  const dev = (px, py) => {
    const yy = -py * esc;            // en la fuente la Y crece hacia arriba
    return [ox + px * esc + yy * inclina, oy + yy];
  };
  const punto = (px, py) => { if (pts) pts.push(dev(px, py)); };
  const cuad = (cx, cy, ax, ay) => {
    const n = Math.max(3, Math.ceil(esc * 260));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      punto(u * u * x + 2 * u * t * cx + t * t * ax, u * u * y + 2 * u * t * cy + t * t * ay);
    }
    x = ax; y = ay;
  };
  const cubi = (c1x, c1y, c2x, c2y, ax, ay) => {
    const n = Math.max(4, Math.ceil(esc * 320));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      punto(u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ax,
            u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ay);
    }
    x = ax; y = ay;
  };
  const tok = d.match(/[MLQCZmlqcz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { if (pts && pts.length) subs.push(pts); pts = []; x = +tok[i++]; y = +tok[i++]; sx = x; sy = y; punto(x, y); }
    else if (c === 'L') { x = +tok[i++]; y = +tok[i++]; punto(x, y); }
    else if (c === 'Q') { const a = +tok[i++], b = +tok[i++], cx = +tok[i++], cy = +tok[i++]; cuad(a, b, cx, cy); }
    else if (c === 'C') { const a = +tok[i++], b = +tok[i++], cc = +tok[i++], dd = +tok[i++], e = +tok[i++], f = +tok[i++]; cubi(a, b, cc, dd, e, f); }
    else if (c === 'Z' || c === 'z') { if (pts && pts.length) { subs.push(pts); pts = null; } x = sx; y = sy; }
  }
  if (pts && pts.length) subs.push(pts);
  return subs;
}

function _peso(peso) { return FUENTE[String(peso)] || FUENTE['400']; }

function mideTexto(txt, { tam = 16, peso = 400, espaciado = 0 } = {}) {
  const f = _peso(peso), esc = tam / f.upm;
  let w = 0;
  for (const ch of String(txt)) {
    const g = f.g[ch];
    w += (g ? g[0] * esc : tam * 0.4) + espaciado;
  }
  return w - (txt.length ? espaciado : 0);
}

// x,y = origen de la línea de base. align: 'izq' | 'centro' | 'der'
function texto(l, txt, { x = 0, y = 0, tam = 16, peso = 400, color = '#000000', alfa = 1, espaciado = 0, align = 'izq', cursiva = 0, sombraTexto = null } = {}) {
  const f = _peso(peso), esc = tam / f.upm;
  const ancho = mideTexto(txt, { tam, peso, espaciado });
  let cx = align === 'centro' ? x - ancho / 2 : align === 'der' ? x - ancho : x;
  const inclina = cursiva ? Math.tan((cursiva * Math.PI) / 180) : 0;
  const caminos = [];
  for (const ch of String(txt)) {
    const g = f.g[ch];
    if (g) {
      if (g[1]) caminos.push(caminoGlifo(g[1], esc, cx, y, inclina));
      cx += g[0] * esc + espaciado;
    } else cx += tam * 0.4 + espaciado;
  }
  if (sombraTexto) for (const c of caminos) sombra(l, c, sombraTexto);
  for (const c of caminos) rellena(l, c, color, alfa);
  return ancho;
}

module.exports = {
  crearLienzo, rellenaRect, degradadoVertical, rellena, rellenaDegradado, sombra,
  rectRedondo, elipse, rota, mueve, transforma, texto, mideTexto, hex, colorEnParada, mezcla
};
