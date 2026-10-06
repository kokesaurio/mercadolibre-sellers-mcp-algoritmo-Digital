---
name: calculadora-ml
description: La calculadora de rentabilidad real de un producto de MercadoLibre — pregunta el precio (o lo trae de la publicación), el costo del producto y los impuestos, suma la comisión real de ML y lo que está gastando de publicidad EN VIVO, y entrega el desglose peso por peso con la ganancia neta, el margen y el ACOS máximo que aguanta. Usar cuando pregunten "¿cuánto gano con este producto?", "calculame la rentabilidad", "¿me conviene este precio?" o "¿cuánto me queda después de todo?".
---

# Calculadora de rentabilidad real

## Qué responde
"¿Cuánto te queda DE VERDAD por cada venta?" — con la comisión real del tipo de
publicación, la publicidad que está gastando ahora (Product Ads en vivo), los
impuestos y el costo. El número que la mayoría de los vendedores no tiene.

## Flujo (preguntar, nunca inventar)
1. **Identificar el producto**: si dan un item_id o link, `ml_rentabilidad
   item_id=...` trae solo el precio y el tipo de publicación reales. Si no,
   **preguntar el precio de venta**.
2. **Preguntar el costo del producto** (lo que le sale al vendedor, con su IVA
   si corresponde). NUNCA estimarlo.
3. **Preguntar el % de impuestos** sobre la venta. Orientar sin decidir por él:
   depende de su situación (monotributo vs responsable inscripto, IIBB de su
   provincia, percepciones) — si no lo sabe, que se lo pida al contador; para
   una primera pasada puede dar un % aproximado y se recalcula después.
4. **Envío**: si la publicación ofrece envío gratis, preguntar cuánto le cuesta
   el envío por unidad (o correr una pasada con $ 0 y otra con el costo real).
5. Correr `ml_rentabilidad` con todo → la herramienta suma sola la **comisión
   real** (tarifa del sitio para ese precio y tipo) y la **publicidad por
   unidad** (gasto de Product Ads del período ÷ ventas por ads, en vivo).
6. Leer el resultado con el usuario:
   - **Ganancia neta y margen** con semáforo (🔴 pérdida / 🟡 <10% / 🟢 sano).
   - **ACOS máximo**: arriba de ese número la publicidad se come la ganancia —
     compararlo con el ACOS real de `ml_publicidad`.
   - Si da pérdida: el precio de equilibrio viene calculado; validarlo contra
     `ml_precio_catalogo` (ganar el catálogo perdiendo plata no es ganar).

## Reglas
- Costo e impuestos SIEMPRE los pone el usuario: dato no confirmado = dato que
  se pregunta.
- Si cambia el precio, recalcular: la comisión y los impuestos son % del precio.
- Con varios productos, una tabla comparativa de márgenes (correr la calculadora
  por ítem) y señalar cuál conviene empujar con publicidad.
- Recordar que el gasto de ads por unidad es un promedio del período: si la
  campaña es nueva, tomarlo como referencia, no como sentencia.
