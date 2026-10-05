#!/usr/bin/env python3
"""Generador de imágenes de venta para MercadoLibre (Algoritmo Digital).
Toma una plantilla, los datos del producto y la FOTO REAL de la publicación,
y produce el PNG 1200x1200 listo para subir.

Uso:
  python3 generar.py --plantilla medidas --datos datos.json --foto producto.png --salida foto-5-medidas.png
datos.json: {"ALTO": "27 cm", "ANCHO": "8,5 cm", ...}  (los {{CAMPOS}} de la plantilla)
Requiere: pip install cairosvg
"""
import argparse, base64, json, os, re, sys
import cairosvg

# Caja (x, y, ancho, alto) donde va la foto real en cada plantilla
CAJAS = {
    'medidas': (430, 260, 340, 680),
    'caracteristicas': (120, 260, 360, 680),
    'beneficio': (360, 250, 480, 700),
    'incluye': None,  # esta plantilla no lleva foto del producto
}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--plantilla', required=True, choices=list(CAJAS))
    p.add_argument('--datos', required=True, help='JSON con los {{CAMPOS}}')
    p.add_argument('--foto', help='Foto real del producto (png/jpg), reemplaza la silueta')
    p.add_argument('--salida', required=True)
    a = p.parse_args()

    base = os.path.dirname(os.path.abspath(__file__))
    svg = open(os.path.join(base, a.plantilla + '.svg'), encoding='utf-8').read()

    datos = json.load(open(a.datos, encoding='utf-8'))
    for k, v in datos.items():
        svg = svg.replace('{{' + k + '}}', str(v))
    faltan = sorted(set(re.findall(r'{{(\w+)}}', svg)))
    if faltan:
        print('⚠️  Campos sin dato (quedan vacíos): ' + ', '.join(faltan), file=sys.stderr)
        for k in faltan:
            svg = svg.replace('{{' + k + '}}', '')

    if a.foto and CAJAS[a.plantilla]:
        x, y, w, h = CAJAS[a.plantilla]
        ext = os.path.splitext(a.foto)[1].lower()
        mime = 'image/png' if ext == '.png' else 'image/jpeg'
        b64 = base64.b64encode(open(a.foto, 'rb').read()).decode()
        imagen = (f'<image href="data:{mime};base64,{b64}" x="{x}" y="{y}" '
                  f'width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>')
        svg = re.sub(r'<g id="producto">.*?</g>', imagen, svg, flags=re.S)

    cairosvg.svg2png(bytestring=svg.encode(), write_to=a.salida, output_width=1200, output_height=1200)
    print('✅ ' + a.salida)

if __name__ == '__main__':
    main()
