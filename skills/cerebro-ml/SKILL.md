---
name: cerebro-ml
description: El cerebro del conector de MercadoLibre — la base de datos local donde Claude guarda lo que el vendedor le enseña (costo de cada producto, % de impuestos, costo de envío, medidas, qué incluye, notas del negocio) para no volver a preguntarlo: la calculadora de rentabilidad y las demás skills lo usan solas. Usar cuando digan "acordate que...", "el costo de este producto es...", "mis impuestos son...", "¿qué sabés de este producto?", "¿qué tenés guardado?" o quieran enseñarle datos del negocio a Claude.
---

# El cerebro del conector

## Qué es
Una base de datos local (`cerebro.json`, en la máquina del vendedor, al lado de
las cuentas — cero instalación, nada sale de ahí) con el conocimiento del
negocio. Lo que se guarda una vez, no se pregunta nunca más: la calculadora de
rentabilidad toma el costo y los impuestos sola, y las medidas/qué incluye
alimentan las imágenes.

## Cómo se le enseña (guardar)
Cuando el vendedor suelta un dato del negocio, guardarlo en el momento con
`ml_cerebro accion=guardar` — sin esperar a que lo pida:
- **De un producto** (con item_id): costo, impuestos propios, costo de envío,
  medidas ("27 cm alto, 8,5 cm diámetro, 480 g"), qué incluye, notas ("el
  proveedor tarda 15 días", "los compradores siempre preguntan si trae funda").
- **Del negocio entero** (sin item_id): % de impuestos general, costo de envío
  típico, notas ("Monotributo + IIBB CABA", "no vendo a Tierra del Fuego").
  Los productos heredan estos defaults salvo que tengan el dato propio.
Confirmar en una línea QUÉ quedó guardado. Solo datos que el vendedor dijo:
el cerebro nunca guarda estimaciones ni inventos.

## Cómo se usa (las herramientas lo hacen solas)
- `ml_rentabilidad` completa costo/impuestos/envío desde el cerebro y marca
  "🧠 Usando del cerebro: ..." — y cuando el usuario pasa un dato nuevo, lo
  **aprende** automáticamente para la próxima.
- Skill imagenes-ml: antes de preguntar medidas o qué incluye, mirar
  `ml_cerebro accion=ver item_id=...` — si están guardadas, usarlas y avisar.
- `ml_cerebro accion=ver` (con o sin item) responde "¿qué sabés de...?".
- `ml_cerebro accion=olvidar item_id=...` borra un producto a pedido.

## Reglas
- Dato del vendedor = se guarda. Dato inventado = NO existe para el cerebro.
- Si un dato guardado parece desactualizado (ej. el costo cambió de precio hace
  meses y los números dan raro), preguntarle si sigue vigente antes de decidir
  con él.
- Al usar un dato del cerebro, decirlo ("🧠 usando el costo guardado") para que
  el vendedor pueda corregirlo — memoria transparente, nunca silenciosa.
- Privacidad: recordarle (si pregunta) que todo vive en SU máquina, en
  `~/.meli-sellers-mcp/cerebro.json`, y no se envía a ningún lado.
