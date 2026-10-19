---
name: stock-ml
description: Stock y reposición en MercadoLibre con Nico — cuántos días de stock te quedan de cada producto según lo que vendés por día, qué se corta esta semana, qué se quedó sin stock vendiendo y qué tiene stock parado. Usar cuando pidan "¿qué tengo que reponer?", "¿cuánto stock me queda?", "se me corta el stock", o cuando Nico avise.
---

# Stock — reponer antes del quiebre

## Requisito
`ml_trabajadores` del conector de MercadoLibre de Algoritmo Digital (v1.21.0+).

## Por qué importa
Una publicación que se queda sin stock pierde el posicionamiento que ganó con sus
ventas: al volver, arranca de atrás. Reponer a tiempo vale más que cualquier mejora.

## Flujo
1. `ml_trabajadores accion=resultados trabajador=Nico` → tabla con stock, ventas por
   día y **días de stock** (🛑 sin stock vendiendo, ⏳ ≤3 días, 📦 ≤7 días).
2. Para cada producto que se corta: cuánto pedir = ventas por día × días hasta que
   llegue la mercadería + 2 semanas de margen. Preguntar el tiempo de entrega del
   proveedor y guardarlo con `ml_cerebro` como nota del producto.
3. Mientras llega: no pausar si todavía hay unidades (pausar también hace perder
   posicionamiento); si conviene, subir un poco el precio para estirar el stock (con
   `calculadora-ml`). Si se cortó: actualizar el stock apenas entre la mercadería.
4. **Stock parado** (sin ventas en 30 días con 20+ unidades): proponer promo, revisión
   de la publicación (`mejorar-publicaciones-ml`) o publicidad, validando margen.
5. Si el producto es de reventa, mirar a Fede (proveedores): si el proveedor está sin
   stock, avisar antes de comprometer ventas.

## Reglas
- El stock en ML se cambia con `ml_actualizar_publicacion` y solo con OK.
- Las ventas por día son de los últimos 30 días: en fechas especiales, ajustar.
