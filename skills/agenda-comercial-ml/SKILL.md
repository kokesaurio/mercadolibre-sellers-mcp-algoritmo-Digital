---
name: agenda-comercial-ml
description: La agenda comercial de MercadoLibre con Clara — fechas cruciales (Hot Sale, CyberMonday, Black Friday, Día de la Madre/Padre/Infancias, Navidad) y el cronograma de campañas y promociones que ML te ofrece. Pregunta SIEMPRE si querés participar en cada una y arma la participación validada por margen. Usar cuando pidan "¿qué fechas vienen?", "cronograma de MercadoLibre", "¿en qué promos puedo entrar?", "¿me conviene el CyberMonday?", o cuando Clara avise de una campaña o fecha.
---

# Agenda comercial — ¿participás?

## Requisito
Herramientas `ml_agenda`, `ml_promociones`, `ml_aceptar_promocion` y `ml_rentabilidad`
del conector de MercadoLibre de Algoritmo Digital (v1.19.0 o superior).

## La regla de oro
**Nunca inscribir nada sin un "sí" explícito.** Por cada campaña de ML o fecha
comercial, preguntar: **"¿Querés participar?"**. Clara lo vuelve a preguntar en cada
recordatorio (nueva invitación, 3 días y 1 día antes del cierre; 30/14/7/1 días antes
de cada fecha) hasta que el vendedor decida. Un "no" se respeta: no se vuelve a preguntar.

## Flujo
1. `ml_agenda accion=calendario` (default 60 días) → listar lo que viene, ❓ primero
   por urgencia (cierre de inscripción más cercano).
2. Por cada ❓, presentar en 1 línea: qué es, fechas, hasta cuándo se inscribe,
   cuántas publicaciones pueden entrar, y **preguntar si participa**. Si el vendedor
   está apurado, agrupar: "¿Sí a todas, no a todas, o vamos una por una?".
3. Guardar la respuesta: `ml_agenda accion=decidir ref=<id> participar=true|false`
   (con `nota` si pone condiciones, ej. "solo los termos").
4. **Si es SÍ a una campaña de ML:**
   - `ml_promociones promocion_id=<id> tipo=<tipo>` → candidatas con su precio final.
   - Validar el margen de cada una con `ml_rentabilidad` (precio final de la promo).
     🟢 conviene · 🟡 justo · 🔴 pierde plata → recomendar NO inscribir esa.
   - Mostrar la lista final y pedir OK; inscribir de a una con `ml_aceptar_promocion`.
   - Cerrar: "Cuando arranque, Clara te avisa para actualizar Mi página".
5. **Si es SÍ a una fecha comercial:** proponer el plan corto — qué productos empujar
   (los más vendidos o los del rubro de la fecha), stock suficiente, precio/promo
   propia validada por margen, publicidad (`publicidad-ml`) y Mi página
   (`mi-pagina-ml`) el día anterior.
6. **Fechas estimadas** (Hot Sale, CyberMonday, Buen Fin, vuelta a clases): avisar que
   son estimadas; cuando se confirmen, `ml_agenda accion=fecha ref=cybermonday:2026
   fecha=AAAA-MM-DD`. Fechas propias (aniversario, liquidación): `accion=fecha
   nombre=... fecha=...`.

## 🧠 Guardar lo aprendido
Reglas del vendedor del tipo "nunca entro a promos de más de 20%" o "en Navidad
siempre participo con los kits" → ofrecer guardarlas con `ml_cerebro` como nota del
negocio, y aplicarlas en las próximas decisiones (igual preguntando).

## Reglas
- Ningún precio de promo que deje margen negativo sin decirlo claro.
- No prometer resultados de ventas; sí mostrar datos (ventas de la fecha el año
  pasado si hay historial en la base: `ml_trabajadores accion=historial`).
