---
name: imagenes-ml
description: Generar imágenes de venta profesionales para publicaciones de MercadoLibre cumpliendo sus reglas — infografía de medidas con flechas de cota, beneficios/características con tildes, "qué incluye el paquete" y checklist de la imagen principal. Usar cuando pidan "armame las imágenes de la publicación", "infografía de medidas", "mejorá las fotos" o "imágenes para MercadoLibre".
---

# Imágenes de venta para MercadoLibre

## Qué genera
Imágenes secundarias 1200×1200 listas para subir, desde las plantillas SVG del
repo (`plantillas/`): **medidas** (flechas de cota + capacidad/peso),
**características** (4 beneficios con tilde) e **incluye** (contenido del
paquete). Además audita la imagen principal contra las reglas de ML.

## Flujo
1. Juntar los datos reales: si hay conector `ml_*`, traer la publicación con
   `ml_publicacion` (título, atributos); pedir al usuario las medidas exactas
   y la foto del producto (PNG/JPG, idealmente fondo transparente o blanco).
2. Elegir con el usuario cuáles de las 3 imágenes generar (recomendar las 3:
   medidas + características + incluye es el combo que más consultas evita).
3. Tomar la plantilla de `plantillas/`, reemplazar los `{{CAMPOS}}` con los
   datos reales y, si hay foto, reemplazar el grupo `<g id="producto">` por
   `<image href="data:...base64..." x y width height/>` manteniendo la
   composición (producto grande, aire alrededor).
4. Renderizar a PNG 1200×1200 (cairosvg) y entregar los archivos.
5. Pasar el checklist de reglas ANTES de entregar:
   - ¿Sin datos de contacto, QR, redes, links? (prohibido SIEMPRE)
   - ¿Sin "OFERTA", "envío gratis", precios ni promesas? (penaliza)
   - ¿Texto legible en miniatura de celular? (mínimo ~28px a 1200px)
   - ¿La principal del usuario cumple? (fondo blanco puro, solo producto,
     sin texto ni logos) — si no, marcarlo como lo primero a arreglar.
6. Recordar: estas imágenes van de la posición 2 en adelante; en publicaciones
   de catálogo las fotos las define MercadoLibre.

## Reglas
- Nunca inventar medidas, materiales ni certificaciones: todo dato sale del
  usuario o de la publicación. Si falta un dato, preguntarlo, no rellenarlo.
- No usar fotos ni textos de publicaciones ajenas (infracción + suspensión).
- Mantener la estética de las plantillas: fondo blanco, un acento de color,
  tipografía grande — nada de collages recargados.
