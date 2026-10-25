---
name: nichos-ml
description: Descubrir y validar nichos de MercadoLibre con la API oficial (sin Nubimetrics ni planillas) — ordena publicaciones por rotación, dice si un producto se vende hoy o vendió en el pasado, si hay oportunidad o monopolio, el techo de demanda, si es tendencia, estacional o evergreen, y si los números cierran con tu costo. Arma el ranking de oportunidades entre varios nichos. Usar cuando pregunten "qué producto vender", "¿este nicho tiene lugar?", "¿hay monopolio?", "¿cuánto puedo vender?", "dame el ranking de oportunidades", "¿esto se vende o fue moda?", "buscame un nicho".
---

# Descubrir nichos con la API oficial de MercadoLibre

## Requisito
`ml_nichos` del conector de MercadoLibre de Algoritmo Digital (v1.29.0+), con una
cuenta conectada. Todo sale de la API oficial: no hace falta bajar reportes.

## Las 6 preguntas que responde
1. **¿Cuánto rota?** Ordena las publicaciones de mayor a menor rotación
   (unidades por mes = vendidos ÷ antigüedad).
2. **¿Se vende hoy o vendió en el pasado?** Compara las visitas de los últimos 5 meses
   con el promedio histórico de cada publicación: detecta lo que "vendió en
   pandemia" y hoy no se mueve.
3. **¿Oportunidad o monopolio?** Cuánto se lleva el líder, el top 3 y cuántos
   vendedores venden de verdad.
4. **Techo de demanda:** unidades por mes del nicho y cuánto vende hoy alguien que
   entró en los últimos 90 días ("arrancó hace 45 días y ya vende 150").
5. **Tendencia, estacional o evergreen.**
6. **¿Cierran los números?** Precio de mercado contra tu costo, con la comisión real
   de ML y tus impuestos del cerebro.

## Flujo

### 1. Si el vendedor no tiene ideas: generar candidatas (máx. 5)
- `ml_tendencias` (del sitio o de una categoría) → lo que la gente está buscando.
- `ml_descubrir_ganadores categoria=…` → el ranking oficial de más vendidos.
- Lo que el vendedor ya sabe hacer o conseguir (proveedor, fábrica, importación).
Elegí 3 a 5 keywords concretas ("organizador de cocina", no "cocina").

### 2. Ranking de oportunidades
`ml_nichos busquedas=["…","…","…"]` → tabla con puntaje 0-100 y señal por nicho:
🟢 oportunidad · 🟡 entrar diferenciado · 🔴 descartar. Mostrala tal cual y explicá en
una línea por qué ganó el primero.

### 3. Detalle del mejor (o del que elija el vendedor)
Pedile el **costo por unidad** (nunca lo inventes) y corré
`ml_nichos busqueda="…" costo=…` (y `costo_envio` si paga el envío). Resumí las 6
respuestas en este orden: veredicto → rotación → ¿se vende hoy? → competencia →
techo y cuánto vende un nuevo → tipo → números.

### 4. Cómo leer las señales
- **🟢 Entrar:** repartido + nuevos que ya venden + se vende hoy + números que cierran
  aun con precio competitivo.
- **🟡 Entrar diferenciado:** hay demanda pero está peleado, o el margen solo cierra al
  precio de mercado → combo, FULL, mejor ficha (skill imagenes-ml) y video, no pelear
  por precio.
- **🔴 Descartar:** monopolio (sobre todo de tienda oficial), "vendió en el pasado",
  nicho en baja o números que no cierran.
- **Estacional:** sirve, pero se entra 6-8 semanas antes del pico con stock medido
  (cruzar con la skill agenda-comercial-ml).

### 5. Antes de comprar mercadería
- Confirmá la tendencia con historial: `ml_vigilar busqueda="…"` y en 1-2 semanas
  `ml_historial_competencia`.
- Calculá el precio con publicidad incluida (skill calculadora-ml).
- Guardá el costo y la decisión en el cerebro (`ml_cerebro`), por SKU si ya lo tiene.

### 6. Si decide entrar
copiar-publicaciones-ml (crear) → imagenes-ml (set de 4) → video-publicaciones-ml →
mejorar-publicaciones-ml (el mejorador) → publicidad-ml.

## Emma lo hace sola cada semana
🧭 Emma, la exploradora de nichos del equipo (`ml_trabajadores`), corre este análisis
una vez por semana sobre tus nichos candidatos (`trabajador=Emma ref="…"`), tus
búsquedas seguidas o, sin ninguno, las tendencias del sitio. Avisa cuando un nicho pasa
a 🟢 o deja de serlo, y el ranking aparece en el tablero del día ("Nichos con
oportunidad"). Si el vendedor viene de una alerta de Emma, arrancá por el paso 3.

## Reglas
- Solo datos de la API. Las ventas de terceros que informa ML pueden venir
  redondeadas: hablar de "estimado" y de "piso" (la muestra no es todo el mercado).
- Si la herramienta avisa que ML informa ventas de pocas publicaciones, decilo y no
  saques conclusiones fuertes.
- Nunca inventar el costo ni el margen: sin costo, la pregunta 6 queda abierta.
- Máximo 5 nichos por ranking (cuida el límite de la API); para más, en tandas.
