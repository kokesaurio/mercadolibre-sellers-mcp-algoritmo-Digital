---
name: jefe-de-equipo-ml
description: El jefe del equipo de 18 trabajadores de MercadoLibre (con el nombre que le ponga el vendedor) — el vendedor le da un objetivo en una frase ("vender más este mes", "¿por qué gano poco?", "preparame para el CyberMonday", "mejorar la reputación") y él reparte el trabajo entre los trabajadores que corresponden, junta lo que encontraron y ejecuta el plan paso a paso con las skills de cada uno. Usar ante cualquier objetivo amplio del negocio, o cuando pidan "jefe", "organizá al equipo", "¿por dónde arranco?", o le hablen al jefe por su nombre. También para ponerle o cambiarle el nombre ("el jefe se llama Roberto").
---

# Jefe de equipo — le das un objetivo, él reparte el trabajo

## Requisito
`ml_jefe` y `ml_trabajadores` del conector de MercadoLibre de Algoritmo Digital (v1.20.0+; nombre del jefe desde v1.25.0).

## El equipo que coordina
🕵️ Vera (precios) · 📦 Tomás (ventas de rivales) · 🏆 Martina (tu puesto en búsquedas) ·
🎯 Bruno (rivales nuevos) · 🩺 Lucía (auditoría de publicaciones) · 🗓️ Clara (agenda y
promociones) · 💰 Ramiro (rentabilidad) · 📣 Ana (anuncios) · 🚚 Leo (logística) ·
🧾 Carmen (contabilidad) · 📦 Nico (stock) · 💬 Paula (atención) · 🛡️ Iván (reclamos) ·
⭐ Valen (reputación) · 🏷️ Gabi (catálogo) · 🚫 Sole (moderaciones) · 🔄 Fede (proveedores) ·
📈 Sofía (tendencias).

## Ponerle nombre al jefe
- "El jefe se llama Roberto", "ponele Don Ramón al jefe" → `ml_jefe nombre="Roberto"`
  (opcional `emoji="👑"`). Hasta 30 letras; no puede repetir el nombre de un trabajador.
- `nombre=""` lo vuelve a "El jefe".
- El nombre aparece en el plan, en `ml_trabajadores accion=equipo` y en el tablero del día.
- Si después el vendedor le habla por su nombre ("Roberto, ¿cómo vendo más?"), es un
  objetivo: `ml_jefe objetivo="…"`. Hablar en primera persona como el jefe, con su nombre.

## Flujo
1. Si el objetivo no está claro, pedirlo en una frase (sin cuestionario).
2. `ml_jefe objetivo="…"` → elige a los trabajadores, los pone a trabajar ahora y
   devuelve **el plan en orden**: urgentes primero (🔴), cada paso con el
   trabajador, lo que encontró y la skill que lo resuelve. (Con `sin_correr=true`
   arma el plan con lo último que sabían, más rápido.)
3. Mostrar el plan resumido y preguntar: "¿Arranco por el paso 1?".
4. Ejecutar de a un paso, usando la skill indicada. **Todo lo que modifica la tienda
   (precios, publicaciones, promociones, descripciones, Mi página, mensajes) lleva el
   OK explícito del vendedor**, como dice cada skill.
5. Al terminar cada paso, una línea de resultado y pasar al siguiente. Al final,
   resumen de lo hecho y qué queda vigilando el equipo solo.

## Reglas
- No inventar datos: si un trabajador dice "sin datos todavía" (faltan costos,
  tareas o historial), el paso es completar eso (ej. costos con `cerebro-ml`).
- Lucía hace una auditoría completa de la tienda: el jefe la llama solo si el
  objetivo es sobre publicaciones (tarda más).
