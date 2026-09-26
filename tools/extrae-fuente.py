#!/usr/bin/env python3
# Saca los contornos de Rajdhani (400/600/700) de los MISMOS woff2 que carga la web y los
# deja en tools/font-vector.js, que es lo que usa el generador del og.png para escribir con
# letras de verdad en vez de la fuente de mapa de bits de 5x7.
#
# Solo hay que volver a lanzarlo si cambian las fuentes:
#   pip install fonttools && python3 tools/extrae-fuente.py
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

CHARS = (" !\"#$%&'()*+,-./0123456789:;<=>?@"
         "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_"
         "abcdefghijklmnopqrstuvwxyz"
         "áéíóúüñÁÉÍÓÚÑ¿¡·©°—–«»")

def extrae(ruta):
    f = TTFont(ruta)
    upm = f['head'].unitsPerEm
    cmap = f.getBestCmap()
    gs = f.getGlyphSet()
    hmtx = f['hmtx']
    out = {}
    for ch in CHARS:
        gn = cmap.get(ord(ch))
        if not gn: continue
        pen = SVGPathPen(gs, ntos=lambda v: str(round(v)))
        gs[gn].draw(pen)
        out[ch] = [hmtx[gn][0], pen.getCommands()]
    return {"upm": upm, "asc": f['hhea'].ascent, "desc": f['hhea'].descent, "g": out}

datos = {}
for peso, ruta in (("400","fonts/rajdhani-400.woff2"),("600","fonts/rajdhani-600.woff2"),("700","fonts/rajdhani-700.woff2")):
    datos[peso] = extrae(ruta)
    print(peso, 'glifos:', len(datos[peso]['g']), 'upm:', datos[peso]['upm'], file=sys.stderr)

js = ("// Contornos de Rajdhani (400/600/700) sacados de fonts/*.woff2 con fontTools.\n"
      "// Los genera tools/extrae-fuente.py; no se edita a mano. Solo lo usa el generador\n"
      "// del og.png: la web sigue cargando los woff2 de siempre.\n"
      "module.exports = " + json.dumps(datos, ensure_ascii=False, separators=(',',':')) + ";\n")
open('tools/font-vector.js','w',encoding='utf-8').write(js)
print('escrito tools/font-vector.js', file=sys.stderr)
