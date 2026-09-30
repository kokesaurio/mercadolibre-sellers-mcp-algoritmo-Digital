---
name: publicidad-ml
description: Analiza y optimiza la publicidad de MercadoLibre (Product Ads) y las promociones/campañas ofrecidas, usando el conector MCP de Algoritmo Digital. Usar SIEMPRE que el usuario pregunte por sus campañas, cuánto gasta en ads, si le conviene la pauta, el ACOS, si entrar al Hot Sale u otra promoción, qué publicaciones poner en promo, o cualquier tema de publicidad y promociones en MercadoLibre.
---

# Publicidad y promociones en MercadoLibre

Análisis de Product Ads y de las promociones que ofrece MercadoLibre,
terminando en decisiones: dónde invertir, qué apagar y a qué promo entrar.

## Requisito

Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.

## Product Ads

1. `ml_publicidad` (por defecto 30 días; ajustar `dias` según lo pedido):
   inversión, clics, ventas atribuidas y ACOS por campaña.
2. Leer el ACOS con criterio de margen, no en el aire: cruzar con
   `ml_rentabilidad`. La regla: **si ACOS > margen del producto, la campaña
   vende a pérdida**. Un ACOS de 15% es buenísimo con margen 40% y ruinoso
   con margen 10%.
3. Diagnóstico por campaña, en este orden:
   - ACOS mayor al margen → pausar o bajar puja: está pagando por perder.
   - Mucha inversión sin ventas atribuidas → revisar la publicación (precio,
     título, ficha) antes que la campaña: el ad trae el clic, la publicación
     no convierte. Usar la skill de mejorar publicaciones si está disponible.
   - ACOS bajo y pocas impresiones → oportunidad de escalar inversión.
4. Presentar como tabla corta: campaña, inversión, ventas, ACOS, margen del
   producto, veredicto (escalar / sostener / ajustar / pausar).
## Promociones y campañas

1. `ml_promociones` sin argumentos: qué campañas ofrece MercadoLibre ahora.
2. Con `promocion_id`: qué publicaciones son elegibles y con qué precio.
3. Evaluar cada candidata con dos números:
   - **Descuento que pone el vendedor** (no el descuento total: en las
     co-fondeadas MercadoLibre aporta una parte — decir cuánto pone cada uno).
   - **Margen resultante** al precio final, validado con `ml_rentabilidad` o
     `ml_simular_precios`. Nunca recomendar entrar a pérdida sin decirlo
     explícitamente; a veces conviene (liquidar stock), pero es una decisión
     informada del usuario, no un default.
4. Recomendar por ítem: entrar / no entrar / entrar solo si ML co-fondea.

## Qué no hacer

- No evaluar ads por ACOS sin conocer el margen.
- No recomendar "entrar a todas las promos": cada ítem se evalúa por margen.
- Las escrituras (pausar campañas, cambiar precios) no están disponibles por
  el conector salvo `ml_actualizar_publicacion`: para aceptar promociones,
  indicar el panel de promociones de Algoritmo Digital o el Seller Center.