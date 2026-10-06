---
name: clips-ml
description: Gestionar los Clips de MercadoLibre (videos verticales cortos en las publicaciones) por API — mapear qué publicaciones tienen clips y cuáles sirven (publicado/en revisión/rechazado con motivo), producir los que faltan y subirlos cumpliendo los requisitos técnicos. Usar cuando pregunten "¿qué clips tengo?", "¿cuáles publicaciones tienen clip?", "subí este clip" o quieran videos cortos en sus publicaciones.
---

# Clips de MercadoLibre

## Qué son y por qué importan
Videos verticales cortos (estilo Reels) que se muestran EN la publicación y en
el feed de clips de la app de MercadoLibre: tráfico y conversión extra, gratis.
La API permite consultar su estado, subirlos y borrarlos.

## Requisitos técnicos de ML (validar ANTES de subir)
- Formato MP4, MOV, MPEG o AVI — ideal **MP4 con video H.264 y audio AAC**.
- **Vertical** (9:16), mínimo 360×640 — ideal 1080×1920.
- Duración **10 a 61 segundos** · máximo **280 MB** · publicación **activa**.
- La moderación tarda **24-48 hs** y hay un tope global de 1.000 clips/día:
  subidas masivas van en tandas.

## Flujo

### 1. Mapa de la tienda — "¿cuáles sirven?"
`ml_clips` sin parámetros → tabla por publicación: video clásico ✅/❌ y clips
(✅ publicados · ⏳ en revisión · ❌ rechazados), con la prioridad: las
publicaciones sin NINGÚN video primero (cruzar con ventas/visitas para empezar
por las que más facturan).

### 2. Estado de una publicación puntual
`ml_clips item_id=MLA...` → cada clip con su estado y, si está rechazado, el
motivo traducido y cómo corregirlo:
- **Video duplicado** → no resubir el mismo archivo: exportar una versión distinta.
- **Error de procesamiento** → reexportar MP4 (H.264 + AAC) y volver a subir.
- **Resolución baja** → reescalar a 1080×1920.

### 3. Producir el clip que falta
Con la skill **video-publicaciones-ml** o **ugc-ml** (destino: "video dentro de
la publicación" → SIN precio, SIN datos de contacto, SIN "oferta/envío
gratis"). Formato de salida: MP4 vertical 1080×1920, 15-45 s, H.264/AAC.

### 4. Subir y verificar
`ml_subir_clip item_id=... archivo=/ruta/MLA123-clip.mp4` (con confirmación del
usuario: es escritura). El conector valida extensión y peso antes de gastar la
subida. A las 24-48 hs, `ml_clips item_id=...` para confirmar ✅ publicado; si
quedó ❌, corregir según el motivo, `ml_borrar_clip` del rechazado y resubir.

## Reglas
- Un clip por publicación por tanda; versiones alternativas solo a pedido.
- Si la cuenta no tiene la API de clips habilitada (hoy MercadoLibre la
  documenta para Global Selling), decirlo claro y derivar la carga al panel del
  vendedor — nunca simular que se subió.
- El contenido del clip sigue las reglas de ugc-ml si lleva avatar: avatar de
  IA siempre y castellano latino neutro.
