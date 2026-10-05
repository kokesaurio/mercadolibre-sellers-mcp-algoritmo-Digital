---
name: visualizador-publicaciones-ml
description: Armar el visualizador interactivo de publicaciones de MercadoLibre — tablero de tarjetas con la foto real, precio, stock y semáforo de auditoría de cada publicación, donde el vendedor toca cuáles quiere mejorar y obtiene el pedido listo para pegarle a Claude. Usar cuando pidan "armame el visualizador", "mostrame mis publicaciones con fotos", "quiero ver todas y elegir cuáles mejorar" o un tablero de la tienda.
---

# Visualizador de publicaciones

## Requisito
Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital y un
entorno que pueda crear archivos. Si falta el conector, indicá instalarlo según
el README y frená.

## Qué entrega
Un HTML interactivo (de `panel/visualizador.html` del repo) con una tarjeta por
publicación: foto real, título, precio, stock, vendidos, semáforo 🔴🟡🟢 con los
problemas de la auditoría, filtros (todas / con problemas / marcadas), selección
por toque y el botón **"Copiar pedido para Claude"** que arma el texto con las
elegidas para seguir el trabajo en el chat.

## Flujo
1. Traer los datos reales (hasta ~30 publicaciones por tablero):
   - `ml_auditar_publicaciones` → semáforo y lista de problemas por ítem.
   - `ml_publicacion` de cada una (o `ml_publicaciones`) → precio, stock,
     vendidos y la URL de la foto principal (campo **Fotos**).
2. Construir el array de datos con esa información: `{id, titulo, precio,
   stock, vendidos, semaforo: "rojo"|"ambar"|"verde", problemas: [...],
   foto: URL_REAL}`. Nada inventado: todo sale de las herramientas.
3. Tomar `panel/visualizador.html` del repo y reemplazar SOLO el bloque entre
   `/*DATOS*/` y `/*FIN*/` por el array real (dejar los marcadores).
4. Entregarlo según el entorno:
   - **Archivo HTML** (recomendado): el usuario lo abre local y las fotos de
     MercadoLibre cargan directo.
   - **Página publicada** (claude.ai): las fotos externas no cargan por
     seguridad → descargar las miniaturas e incrustarlas como data-URI, o
     avisar que se verán placeholders.
5. Indicar el uso en una línea: "tocá las que quieras mejorar, filtrá si
   querés, y pegame el pedido del botón".
6. Cuando el usuario pegue el pedido, pasar a la skill
   mejorar-publicaciones-ml y trabajar SOLO las seleccionadas, una por una y
   con confirmación antes de cada cambio.

## Reglas
- El semáforo y los problemas salen de la auditoría real, nunca estimados.
- Si hay varias cuentas, confirmar de cuál tienda es el tablero (o hacer uno
  por tienda), nunca mezclar productos de cuentas distintas.
- Con más de 30 publicaciones, proponer tableros por estado (primero las 🔴)
  o por categoría.
