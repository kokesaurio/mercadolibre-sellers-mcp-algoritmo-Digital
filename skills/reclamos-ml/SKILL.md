---
name: reclamos-ml
description: Reclamos y mediaciones de MercadoLibre con Iván — reclamos abiertos, el plazo para responder cada uno, los que pasan a mediación y cómo responder bien para cuidar la reputación. Usar cuando pidan "¿tengo reclamos?", "me hicieron un reclamo", "mediación", "devolución", o cuando Iván avise.
---

# Reclamos — responder bien y a tiempo

## Requisito
`ml_trabajadores` del conector de MercadoLibre de Algoritmo Digital (v1.21.0+).

## Flujo
1. `ml_trabajadores accion=resultados trabajador=Iván` → reclamos abiertos ordenados
   por vencimiento, con tipo (reclamo, devolución, cancelación), etapa (⚖️ mediación
   si ya intervino ML), sobre qué venta y la acción pendiente.
2. Por cada uno, de más urgente a menos:
   - Entender el motivo y mirar la venta (`ml_ordenes`, `ml_envios`).
   - Proponer la respuesta: empática, concreta, con una solución (reenvío, cambio,
     devolución del dinero) y sin culpar al comprador ni a MercadoLibre.
   - **La respuesta se envía desde la sección Reclamos de MercadoLibre** (desde ahí
     también se ofrece la devolución o el cambio). Darle al vendedor el texto listo.
3. Si quedan menos de 24 h: priorizar responder aunque la solución definitiva tarde —
   un reclamo sin respuesta lo decide MercadoLibre y pega en la reputación.
4. Al cerrarse, Iván avisa ✅. Si el motivo se repite (ej. "no es lo que esperaba"),
   proponer arreglar la publicación (`mejorar-publicaciones-ml`) o la descripción
   (`faq-descripcion-ml`) para que no vuelva a pasar.

## Reglas
- Nunca pedir al comprador que cancele, retire el reclamo o califique a cambio de algo.
- Nunca pasar datos de contacto externos.
