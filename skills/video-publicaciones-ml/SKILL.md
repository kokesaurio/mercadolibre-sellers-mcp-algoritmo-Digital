---
name: video-publicaciones-ml
description: Producir videos de productos de MercadoLibre con HyperFrames a partir de los datos y fotos REALES de la publicación — promos para Reels/TikTok/ads, clips para la propia publicación y placas animadas del set de imágenes. Usar cuando pidan "hacé un video de esta publicación", "video del producto para Reels", "clip para la publicación" o "animá las imágenes del producto".
---

# Video de publicaciones — conector ML + HyperFrames

## Requisitos
- Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital.
- Entorno con HyperFrames disponible (la skill /hyperframes). Si NO hay
  HyperFrames, no frenar: entregar el guion por escenas + storyboard con el set
  de imágenes listo para producir en cualquier editor, y aclararlo.

## Flujo

### 1. Datos y assets reales (nunca inventados)
- `ml_publicacion` → título, precio, atributos y las **fotos reales** (campo
  Fotos): descargarlas; son la materia prima del video.
- El set fijo de 4 imágenes (skill imagenes-ml / `plantillas/generar.py`) sirve
  como placas: beneficio, características, medidas, incluye.
- Regla madre del método de imágenes: dato no confirmado = dato que no va.
  Si falta un claim (autonomía, material, garantía), preguntarlo.

### 2. Definir destino y formato (preguntar si no está claro)
| Destino | Formato | Duración |
| --- | --- | --- |
| Reels / TikTok / Shorts | 9:16 | 15–30 s |
| Anuncio (Meta/ML Ads) | 9:16 o 1:1 | 10–20 s |
| Video DENTRO de la publicación de ML | 1:1 o 16:9 | 15–45 s |

### 3. Guion por escenas — calcado del orden de fotos
Una idea por escena, 5–7 escenas: gancho con el **beneficio principal** →
**producto en uso** (fotos reales) → **características** (3 máx., con tildes) →
**medidas/compatibilidad** → **qué incluye** → cierre. Texto grande, frases de
3–6 palabras, legible sin audio.

### 4. Reglas de contenido según destino
- Video DENTRO de la publicación: mismas reglas que las imágenes — SIN precio,
  SIN datos de contacto/QR/redes, SIN "oferta/envío gratis".
- Reels/ads propios: el precio y el CTA (ej. WhatsApp del negocio) SÍ pueden
  ir; mantener la prohibición de datos no confirmados.
- Solo fotos y claims propios: nada de material de publicaciones ajenas.

### 5. Producción con HyperFrames
- Entrar SIEMPRE por la skill **/hyperframes** (es el punto de entrada
  obligatorio): con el brief armado acá, el workflow dueño suele ser
  **product-launch-video** (promo de producto) o **motion-graphics** para una
  placa animada corta sin narración.
- Una escena = una sub-composición; las fotos reales como media, las placas
  del set como escenas de apoyo; música por el catálogo de media-use (uso
  comercial permitido), nunca música con derechos.
- Marca de agua/cierre con la marca del vendedor si la tiene.

### 6. Revisar y entregar
Revisar el render escena por escena (ortografía, precio vigente con
`ml_publicacion`, coherencia texto-imagen, parecido con el modelo real).
Entregar el MP4 nombrado por publicación (`MLA123-reel.mp4`), agrupado por
producto, y mostrar el resultado al usuario antes de dar por cerrado.

## Reglas
- Un video por producto por tanda, salvo pedido explícito de variantes.
- Si el precio aparece en el video, verificarlo con el conector en el momento
  de renderizar (los precios cambian).
- Confirmar con el usuario guion y música ANTES de renderizar: el render es lo
  caro, el guion es lo barato.
