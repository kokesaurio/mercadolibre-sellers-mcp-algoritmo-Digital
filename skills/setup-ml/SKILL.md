---
name: setup-ml
description: Asistente de puesta en marcha del conector de MercadoLibre de Algoritmo Digital — verifica la instalación, conecta la(s) cuenta(s), fija la predeterminada, arma la vigilancia inicial de competidores y corre el primer panel + auditoría para dejar todo configurado. Usar cuando digan "setup", "configurame todo", "ayudame a arrancar", "empecemos" o en el primer uso del conector.
---

# Setup del conector de MercadoLibre

## Objetivo
Dejar al vendedor operativo en una sola conversación: cuenta(s) conectada(s),
vigilancia armada y su primera foto del negocio, sin que toque nada técnico.

## Pasos (en orden, sin saltear)
1. **Verificar el conector**: correr `ml_cuentas`. Si las herramientas `ml_*`
   no existen, guiar la instalación con el README del repo (instalador
   `npx ... instalar` o la guía ilustrada) y frenar hasta que esté.
2. **Conectar la cuenta**: si no hay ninguna, correr `ml_conectar` y acompañar
   el flujo (link → autorizar → pegar código). Si falla, usar la tabla de "los
   5 errores clásicos" del README para diagnosticar (redirect URI exacta y
   scope offline_access son los sospechosos de siempre).
3. **¿Más tiendas?** Preguntar si maneja varias cuentas: conectarlas todas y
   fijar la predeterminada con `ml_cuentas` (⭐). Explicar en una línea cómo
   elegir tienda por pedido.
4. **Primera foto del negocio**: correr `ml_panel_ventas` y
   `ml_auditar_publicaciones` (límite 10) y presentar: cómo viene el mes, las
   3 publicaciones más urgentes de arreglar y cuántas están sin video.
5. **Vigilancia inicial**: preguntar 2-3 competidores directos y 1-2 búsquedas
   clave; cargarlos con `ml_vigilar` (+ tendencias de su categoría). Explicar
   que el control es "¿qué cambió en la competencia?" una vez por semana.
6. **Skills**: recomendar subir las skills del repo (carpeta `skills/`, guía en
   `skills/README.md`) empezando por panel-ventas, responder-preguntas y
   vigilancia.
7. **Cierre**: entregar la rutina sugerida (diaria: panel + preguntas ·
   semanal: vigilancia + visualizador + mejoras) y las 3 primeras acciones
   concretas que salieron de la auditoría.

## Reglas
- Un paso por vez, confirmando que funcionó antes de seguir.
- Nunca pedir el Secret por el chat si ya está configurado: solo se usa en la
  instalación.
- Si algo falla, diagnosticar con el mensaje de error real, no adivinar.
