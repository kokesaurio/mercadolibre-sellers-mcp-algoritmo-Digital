---
name: tablero-ml
description: El tablero del día (parte diario visual tipo CRM) del equipo de trabajadores de MercadoLibre — en una página ves lo que está funcionando, lo que necesita atención, tus números, los 18 trabajadores, lo que viene, la evolución de 30 días y la bitácora. Usar cuando pidan "abrí el tablero", "¿cómo venimos?" en formato visual, "mostrame el día", "panel", "CRM", o al empezar el día.
---

# Tablero del día

## Requisito
`ml_tablero` del conector de MercadoLibre de Algoritmo Digital (v1.22.0+).

## Flujo
1. `ml_tablero abrir=true` → arma la página con lo último que sabe el equipo y la abre en
   el navegador. Devuelve la frase del día y cuántas cosas funcionan / necesitan atención.
2. Leer en voz alta la frase del día y las 3 primeras urgencias, y ofrecer: "¿Arranco por
   la primera?" — cada urgencia trae la skill que la resuelve.
3. Si el vendedor quiere el detalle de un trabajador: en la página toca su fila (se abre
   su tabla), o acá `ml_trabajadores accion=resultados trabajador=<nombre>`.
4. Si el tablero sale casi vacío: el equipo todavía no trabajó. `ml_trabajadores
   accion=correr` (o "jefe, …" con un objetivo) y volver a abrirlo. Si Ramiro o Carmen
   dicen "parcial", faltan costos: `cerebro-ml`.

## Hoy y día por día
- Arriba: **lo que vendiste hoy** (ventas y unidades, contra tu promedio diario) y **lo
  que invertiste hoy en publicidad** (con lo que vendió por publicidad y el ACOS). Se trae
  en vivo cada vez que se arma el tablero.
- Dos gráficos de los últimos 30 días: **ventas por día** y **publicidad por día**. Pasando
  el mouse (o con las flechas) se ve el detalle de cada día; "Ver día por día como tabla"
  muestra todos los números.
- Si el vendedor pregunta "¿cómo vengo hoy?", leer esos dos totales primero.

## Cómo es
- Una página local (sin servidor, funciona sin internet), privada en la máquina del
  vendedor. Se regenera sola después de cada control del equipo y se recarga cada 5 min.
- La primera vez arranca un tutorial guiado; después está en "Ver tutorial".
- Tema claro y oscuro; se ve bien en celular.

## Reglas
- No inventar números que el tablero no tiene: si algo dice "sin datos todavía", decirlo.
