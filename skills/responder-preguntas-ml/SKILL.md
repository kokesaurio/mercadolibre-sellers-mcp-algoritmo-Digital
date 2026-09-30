---
name: responder-preguntas-ml
description: Responde preguntas de compradores en MercadoLibre usando el conector MCP de Algoritmo Digital. Usar SIEMPRE que el usuario quiera ver o contestar preguntas pendientes, "ponerse al día con las preguntas", pida ayuda para redactar respuestas a compradores, o pregunte cuántas preguntas tiene sin responder — aunque no mencione MercadoLibre explícitamente si hay herramientas ml_ disponibles.
---

# Responder preguntas de compradores en MercadoLibre

Flujo para despachar preguntas pendientes rápido y bien: cada hora sin
responder baja la chance de venta.

## Requisito

Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.
Con varias tiendas, resolvé la cuenta con `ml_cuentas`.

## Flujo

1. **Traer pendientes** con `ml_preguntas` (por defecto ya filtra `pend`).
   Si no hay, avisá y ofrecé revisar las respondidas o `ml_mensajes`.
2. **Contexto antes de redactar**: mirá el título y precio de la publicación
   (vienen con la pregunta o via `ml_publicaciones` con el item_id). Si la
   pregunta es de stock, verificá con `ml_stock` antes de prometer nada.
3. **Redactar TODAS las respuestas propuestas juntas**, numeradas, y
   presentarlas al usuario para que apruebe, edite o descarte cada una.4. **Publicar solo lo aprobado** con `ml_responder_pregunta`, de a una.
   Es una escritura real, pública e irreversible: jamás la ejecutes sin
   confirmación explícita de ese texto exacto en esta conversación.
5. Cerrar con el resumen: respondidas, pendientes que quedaron y por qué.

## Reglas de redacción (políticas de MercadoLibre)

- Nunca incluir teléfonos, mails, redes, links externos ni invitar a
  contactar por fuera: MercadoLibre suspende publicaciones por eso.
- Responder solo lo que los datos confirman. Si no hay dato (talle, stock,
  compatibilidad), la respuesta lo dice honestamente y ofrece alternativa.
- Tono cordial y vendedor: saludo breve, respuesta directa, cierre que
  invite a comprar ("¡Comprá con confianza!", "Estamos para ayudarte").
- Corta: 1 a 3 oraciones. El comprador lee en el celular.
- Si la pregunta es un reclamo encubierto, no improvisar: sugerir revisar
  `ml_reclamos` y tratarlo por ahí.

## Qué no hacer

- No responder en lote sin aprobación individual o de la lista completa.
- No prometer envíos, descuentos ni stock que las herramientas no confirmen.
- No discutir con compradores agresivos: respuesta neutra y profesional.