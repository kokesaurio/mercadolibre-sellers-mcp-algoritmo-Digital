---
name: logistica-ml
description: Logística de MercadoLibre con Leo — qué despachar hoy y hasta cuándo, envíos demorados, no entregados o devueltos, y la tasa de despachos con demora que castiga la reputación. Usar cuando pidan "¿qué tengo que despachar?", "envíos demorados", "me devolvieron un paquete", "cuidar la reputación", o cuando Leo avise.
---

# Logística — despachar a tiempo y cuidar la reputación

## Requisito
`ml_despachos` y `ml_reputacion` del conector de MercadoLibre de Algoritmo Digital (v1.20.0+).

## Flujo
1. `ml_despachos` (7 días; `dias` hasta 30) → en este orden: ↩️ devueltos / no
   entregados, 🚨 demorados, 📦 para despachar (el límite más cercano primero).
   FULL no aparece como "para despachar": lo despacha MercadoLibre.
2. **Para despachar:** armar la lista del día agrupada por tipo (Flex primero:
   entrega en el día; después Colecta / punto de despacho) con el horario límite.
3. **Demorados:** proponer un mensaje corto y amable al comprador avisando la
   situación (sin datos de contacto externos, ML lo penaliza) — enviar solo con OK.
4. **Devueltos / no entregados:** revisar en el panel de ML el motivo y reponer el
   stock si el producto volvió en condiciones.
5. Si Leo avisó que **subió la tasa de despachos con demora**: es lo que más castiga
   la reputación → despachar en el día, revisar si conviene pasar productos a FULL
   o Flex, y no aceptar más ventas de lo que se puede despachar (pausar publicaciones
   sin stock real).

## 🧠 Guardar lo aprendido
Horarios de corte de la colecta, quién despacha, o el costo de envío por unidad →
ofrecer guardarlo con `ml_cerebro` (el costo de envío lo usan Ramiro y Carmen).

## Reglas
- No prometer al comprador fechas que no dependen del vendedor.
- Nunca mandar al comprador fuera de MercadoLibre.
