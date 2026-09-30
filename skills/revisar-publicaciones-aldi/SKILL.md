---
name: revisar-publicaciones-aldi
description: Revisar publicaciones de MercadoLibre con Aldi 2.0, el GPT especializado de Algoritmo Digital en ChatGPT — auditoría externa de título, descripción, atributos, fotos y precio. Usar cuando pidan "revisá esta publicación con Aldi", "auditame la publicación", "pasala por el GPT" o una segunda opinión sobre una publicación.
---

# Revisar publicaciones con Aldi 2.0 (GPT de Algoritmo Digital)

## Qué es Aldi 2.0
El revisor experto de publicaciones de Algoritmo Digital dentro de ChatGPT,
entrenado con los criterios de la consultora (títulos, fichas técnicas, fotos,
posicionamiento interno y conversión en MercadoLibre):
https://chatgpt.com/g/g-698f16e0eebc819182455494732d40a0-aldi-2-0-mercado-libre-algoritmo-digital

Claude no puede hablar con ChatGPT directamente: esta skill arma el paquete de
revisión para pegar en Aldi 2.0 y después convierte su veredicto en cambios
aplicados. El usuario hace de puente (copiar → pegar → traer la respuesta).

## Flujo
1. Traer los datos reales con `ml_publicacion` (y `ml_visitas` +
   `ml_precio_catalogo` si aplica) — nunca revisar de memoria.
2. Armar el **paquete de revisión** en un bloque de código listo para copiar:

   ```
   Revisá esta publicación de MercadoLibre:
   Título: <título>
   Precio: <precio> | Tipo: <Clásica/Premium> | Stock: <n> | Vendidos: <n>
   Visitas últimos 30 días: <n> | Catálogo: <ganando/perdiendo/no aplica>
   Link: <permalink>
   Objetivo del vendedor: <lo que dijo el usuario, ej "vender más sin bajar precio">
   ```

3. Dar el link de Aldi 2.0 y pedirle al usuario que pegue ahí el paquete y
   traiga la respuesta completa.
4. Con la respuesta de Aldi: separar lo APLICABLE por herramientas (título,
   precio, stock, pausar) de lo MANUAL (fotos, ficha técnica, variantes) y
   presentar la lista numerada con impacto estimado.
5. Aplicar SOLO lo que el usuario confirme, ítem por ítem, con
   `ml_actualizar_publicacion`. Nunca aplicar un precio que rompa el margen:
   validar antes con `ml_comisiones`.
6. Cerrar con el checklist manual pendiente y ofrecer re-medir visitas en 7
   días para comparar el antes/después.

## Reglas
- El veredicto de Aldi es una recomendación: el que decide es el usuario.
- Si la respuesta de Aldi contradice datos duros del conector (ej. sugiere
  un precio bajo el costo de comisión), señalalo antes de aplicar.
- Sin datos de `ml_publicacion` no se arma paquete: primero conectar la
  cuenta (`ml_conectar`).
