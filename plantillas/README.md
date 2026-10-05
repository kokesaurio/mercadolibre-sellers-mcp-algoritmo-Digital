# Plantillas de imágenes para publicaciones de MercadoLibre

4 plantillas SVG paramétricas (1200×1200) para generar **imágenes secundarias**
profesionales: se reemplazan los `{{CAMPOS}}` con los datos del producto y se
renderizan a PNG. Diseñadas cumpliendo las reglas de imágenes de MercadoLibre.
La skill [imagenes-ml](../skills/imagenes-ml/) automatiza todo el flujo con Claude.

| Plantilla | Para qué | Campos |
| --- | --- | --- |
| `beneficio.svg` | Beneficio principal (foto 2) | BENEFICIO, SUB, CHIP, MARCA, MODELO |
| `medidas.svg` | Medidas reales con flechas de cota | ALTO, ANCHO, CAPACIDAD, PESO, MARCA, MODELO |
| `caracteristicas.svg` | 4 beneficios con tilde + producto | TITULO_PRODUCTO, CARACT_1..4, DETALLE_1..4, MARCA, MODELO |
| `incluye.svg` | "El paquete incluye" (6 ítems) | ITEM_1..6, ITEM_1..6_DET, MARCA, MODELO |

El grupo `<g id="producto">` trae una silueta de ejemplo: **reemplazala por la
foto real** del producto (`<image href="data:image/...;base64,..." .../>`) para
el resultado final.

## Generar el set fijo de 4 (con la foto real de la publicación)

```bash
python3 generar.py --plantilla beneficio --datos datos.json --foto producto.png --salida foto-2-beneficio.png
```

`generar.py` reemplaza los `{{CAMPOS}}`, incrusta la foto real en el lugar
correcto de cada plantilla y renderiza el PNG 1200×1200. El orden de entrega:
foto 2 beneficio · foto 4 características · foto 5 medidas · foto 6 incluye.

## Renderizar a PNG (manual)

```bash
pip install cairosvg
python3 -c "import cairosvg; cairosvg.svg2png(url='medidas.svg', write_to='medidas.png', output_width=1200, output_height=1200)"
```

## Reglas de imágenes de MercadoLibre (resumen operativo)

**Imagen PRINCIPAL (la primera):** estas plantillas NO van ahí.
- Fondo blanco puro, solo el producto (ocupando la mayor parte del cuadro)
- Sin textos, logos, banners, marcos, marcas de agua ni "envío gratis/oferta"
- Mínimo 500×500, ideal 1200×1200, JPG o PNG

**Imágenes SECUNDARIAS (de la 2 en adelante):** acá brillan estas plantillas.
- Infografías de medidas, beneficios, contenido del paquete, uso real ✔
- PROHIBIDO siempre: teléfonos, mails, redes, links, QR o cualquier dato de
  contacto; promesas tipo "OFERTA", "el mejor precio", "envío gratis"
- Texto grande y de alto contraste: se tiene que leer en la miniatura del celular
- En publicaciones de **catálogo** las fotos las define MercadoLibre: estas
  imágenes aplican a publicaciones propias
