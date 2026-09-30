---
name: mejorar-publicaciones-ml
description: Audita y mejora publicaciones de MercadoLibre usando el conector MCP de Algoritmo Digital (herramientas ml_*). Usar SIEMPRE que el usuario quiera mejorar, optimizar o auditar sus publicaciones, títulos, precios o conversión en MercadoLibre; cuando pregunte "por qué no vendo", "cómo subo las ventas", "revisá mi tienda", "optimizá mis títulos", "estoy caro o barato", o pida cualquier diagnóstico o cambio sobre sus publicaciones de ML, aunque no diga la palabra "optimizar".
---

# Mejorar publicaciones de MercadoLibre

Flujo de trabajo para diagnosticar publicaciones con datos reales, priorizar
las de mayor impacto y proponer (y aplicar, con confirmación) mejoras de
título, precio, stock y estado.

## Requisito

Necesita herramientas `ml_*` de un conector de MercadoLibre de Algoritmo
Digital (este repo o el premium con CRM). Si no están, indicá instalarlo
según el README y frená ahí.
Si hay más de una tienda, resolvé primero el ID con `ml_cuentas` y pasalo en
`cuenta` en todas las llamadas.

## Paso 1 — Diagnóstico (solo lectura)

Relevá antes de opinar. Llamá estas herramientas y cruzá los resultados:

1. `ml_salud_publicaciones` — problemas de calidad (fichas incompletas, sin
   stock, pausadas, catálogo perdedor).
2. `ml_rendimiento_publicaciones` — visitas, conversión y ventas por ítem.
3. `ml_competitividad` — posición de precio frente a la competencia.
4. `ml_embudo` — dónde se pierde la venta (impresiones → visitas → compra).5. `ml_rentabilidad` — margen real por publicación, para no proponer bajas de
   precio que vendan más pero pierdan plata.

Si el usuario menciona publicidad o promociones, sumá `ml_publicidad` y
`ml_promociones`. Si nombra un producto puntual, filtrá todo a ese ítem.

## Paso 2 — Priorizar

No listes todos los problemas: elegí las 3 a 5 publicaciones donde el cambio
mueve más la aguja, con esta lógica:

- **Muchas visitas + baja conversión** → problema de precio, título confuso,
  ficha incompleta o mala reputación. Máxima prioridad: el tráfico ya está.
- **Pocas visitas** → problema de keywords en el título, categoría, catálogo
  o falta de exposición (Ads). Segunda prioridad.
- **Buena venta + margen bajo** → oportunidad de subir precio: verificar
  colchón con `ml_competitividad` y `ml_simular_precios`.
- **Sin stock o pausada con historial de ventas** → plata en la mesa, avisar
  siempre aunque no sea lo pedido.

## Paso 3 — Propuestas concretas

Para cada publicación priorizada, presentá exactamente esto:

**[item_id] Título actual**
- Problema: qué está mal y qué dato lo muestra (visitas, conversión, precio vs competencia).
- Propuesta: el cambio puntual (título nuevo exacto, precio nuevo exacto, etc.).
- Por qué: impacto esperado, en una línea.
### Reglas para títulos de MercadoLibre

- Estructura: **Producto + Marca + Modelo + característica clave** (ej.
  "Termo Acero Inoxidable Lumilagro 1 Litro Pico Cebador").
- Usar los ~60 caracteres disponibles con keywords que la gente busca; sin
  relleno.
- Nunca incluir "oferta", "envío gratis", "promo", precios ni signos de
  exclamación: MercadoLibre lo penaliza y no suma búsqueda.
- No escribir todo en mayúsculas.
- No cambiar el título de una publicación que vende bien salvo pedido
  explícito: el historial de ventas posiciona.

### Reglas para precios

- Antes de proponer una baja, verificá el margen con `ml_rentabilidad` y
  simulá con `ml_simular_precios`: nunca propongas un precio que dé margen
  negativo, y decilo si el precio competitivo no cierra con los costos.
- Si el ítem pierde el catálogo por precio, mostrá cuánto falta para ganarlo
  y qué margen quedaría.
## Paso 4 — Aplicar cambios (escritura)

`ml_actualizar_publicacion` modifica la publicación real que ven los
compradores. Por eso:

- Nunca la llames sin que el usuario haya confirmado explícitamente ese
  cambio puntual en esta conversación. Aprobar el diagnóstico no es aprobar
  los cambios.
- Mostrá el antes → después exacto de lo que vas a tocar y esperá el ok.
- Aplicá de a un ítem; si algo falla, frená y reportá antes de seguir.
- Al terminar, corré `ml_sincronizar` y verificá con `ml_publicaciones` que
  los cambios impactaron. Cerrá con el resumen de lo aplicado y sugerí
  revisar visitas y conversión en 7 días.

## Qué no hacer

- No inventes datos: si una herramienta falla o no devuelve algo, decilo.
- No propongas cambios masivos ("actualizo las 40") ni los apliques en lote.
- No toques publicaciones que el usuario no priorizó sin avisar.