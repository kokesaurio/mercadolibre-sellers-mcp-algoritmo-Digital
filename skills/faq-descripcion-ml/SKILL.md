---
name: faq-descripcion-ml
description: Contempla las preguntas que te hacen los compradores en MercadoLibre y las agrega a la descripción de la publicación como "Preguntas frecuentes", con las respuestas reales del vendedor. Usar cuando pidan "sumá las preguntas a la descripción", "armá las preguntas frecuentes", "me preguntan siempre lo mismo", o cuando Lucía (la auditora) avise que hay preguntas repetidas que faltan en la descripción.
---

# Preguntas de compradores → preguntas frecuentes en la descripción

## Requisito
Herramienta `ml_faq_descripcion` del conector de MercadoLibre de Algoritmo Digital
(v1.18.0 o superior). En modo solo lectura (`ML_SOLO_LECTURA=1`) no existe: avisá.

## Por qué
Cada pregunta repetida es un comprador que dudó. Si la respuesta ya está en la
descripción, compra sin preguntar (o pregunta menos) y respondés menos.

## Flujo
1. **Origen**:
   - Si viene de una alerta de Lucía (❓ "reciben preguntas repetidas que no están en
     su descripción") → `ml_faq_descripcion todas=true` (todas las que marcó).
   - Si nombra una publicación → `ml_faq_descripcion item_id=MLA...`.
2. **Mostrar la propuesta** (sin `aplicar`): por publicación, cada pregunta con
   cuántas veces se repitió y la respuesta que va a quedar.
3. **Confirmar**: preguntar "¿Las aplico tal cual?". Si quiere cambiar una respuesta,
   pedile el texto exacto y primero respondé o editá esa pregunta en ML (la
   herramienta usa siempre la respuesta real más reciente — nunca inventa).
4. **Aplicar** con `aplicar=true` solo después del OK explícito.
5. Cerrar: "La próxima auditoría de Lucía ya no las marca; si aparecen preguntas
   nuevas, el bloque se actualiza sin duplicar".

## Qué hace la herramienta (para explicarlo si preguntan)
- Agrupa las preguntas parecidas aunque estén escritas distinto ("¿qué medidas
  tiene?" / "cuánto mide de alto") y prioriza las que más se repiten (por defecto
  2+ veces; `min_veces=1` incluye todas las respondidas). Máximo 8 (`maximo` hasta 15).
- Usa la respuesta real más reciente del vendedor, sin saludos ni firmas.
- **Nunca** pone en la descripción: stock, precio, cuotas, descuentos, envíos o
  plazos (cambian o los resuelve ML) ni respuestas con teléfono, mail, links,
  WhatsApp o redes (ML penaliza los datos de contacto).
- No repite lo que la descripción ya explica.
- Agrega un bloque marcado `PREGUNTAS FRECUENTES … (Fin de preguntas frecuentes)`
  al final: lo de antes se respeta, lo nuevo se suma, nunca se duplica. Respeta el
  límite de 50.000 caracteres de ML.

## 🧠 Guardar lo aprendido
Si en las respuestas aparecen datos durables del producto (medidas, qué incluye,
garantía), ofrecé guardarlos con `ml_cerebro` para que imágenes, calculadora y
respuestas futuras los usen.

## Reglas
- Escribe en la publicación real: SIEMPRE con confirmación explícita.
- Si una respuesta del vendedor tiene un error o está desactualizada, no la
  publiques: avisá y sugerí corregirla primero.
