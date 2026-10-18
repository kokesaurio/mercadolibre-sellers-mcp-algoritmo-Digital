---
name: trabajadores-ml
description: El equipo de 7 trabajadores que vigilan MercadoLibre solos y constantemente — Vera (precios), Tomás (ventas de rivales y quiebres de stock), Martina (ranking en búsquedas), Bruno (rivales nuevos), Lucía (audita todas tus publicaciones cada 15 días), Clara (agenda comercial: cronograma de ML y fechas cruciales) y Sofía (tendencias). Darles tareas, ver qué encontraron y despachar cada alerta a la skill que maneja ese trabajador. Usar cuando pidan "poné a vigilar", "resultados del equipo", "mandalo a Drive", "conectá la planilla", "historial de", "cómo evolucionó", "estado de la base", "backup", "dale una tarea a Vera", "¿qué encontraron los trabajadores?", "informe del equipo", "auditá mis publicaciones cada 15 días", "¿qué fechas vienen?", "cronograma de MercadoLibre", "¿qué publicaciones están desactualizadas?", "vigilá 24/7" o nombren a cualquiera del equipo.
---

# Equipo de trabajadores 24/7

## Requisito
Herramienta `ml_trabajadores` del conector de MercadoLibre de Algoritmo Digital
(v1.14.0 o superior). Si no está, indicá actualizar (`ml_version`) y frená.

## El equipo y sus skills a cargo

| Trabajador | Vigila | Cada | Skills que maneja |
| --- | --- | --- | --- |
| 🕵️ **Vera** · Centinela de precios | precio de publicaciones y vendedores rivales; si le das `mi_item`, avisa cuando un rival queda más barato que vos | 30 min | `vigilancia-ml`, `calculadora-ml`, `cerebro-ml` |
| 📦 **Tomás** · Contador de ventas | ventas estimadas del rival (ritmo/día y $/mes), sin stock, pausas | 60 min | `panel-ventas-ml`, `reporte-ventas-ml`, `responder-preguntas-ml` |
| 🏆 **Martina** · Vigía de búsquedas | top 50 de tus keywords: líder, precio líder y TU puesto (`mi_item`) | 60 min | `imagenes-ml`, `publicidad-ml` |
| 🎯 **Bruno** · Cazador de rivales nuevos | vendedores que aparecen por primera vez en tus búsquedas | 3 h | `competencia-ml`, `revisar-publicaciones-aldi` |
| 🩺 **Lucía** · Auditora de publicaciones | TODAS tus publicaciones activas: preguntas que te repiten y no están en la descripción, desactualizadas (60+ días sin tocar), precio congelado (45+ días) o fuera de mercado, sin stock, fotos pocas o chicas, sin marca/modelo, sin garantía, sin video, catálogo perdido | 15 días | `mejorar-publicaciones-ml`, `visualizador-publicaciones-ml`, `copiar-publicaciones-ml`, `faq-descripcion-ml` |
| 🗓️ **Clara** · Agenda comercial | cronograma de promociones de ML (invitaciones, cierre de inscripción, arranque y fin) y fechas cruciales del año; **siempre pregunta si participás** hasta que decidas | 1 día | `agenda-comercial-ml`, `mi-pagina-ml` |
| 📈 **Sofía** · Radar de tendencias | keywords que entran, salen o suben en tendencias | 12 h | `descubrir-ganadores-ml`, `video-publicaciones-ml`, `clips-ml`, `ugc-ml` |

Si un trabajador no tiene tareas propias, vigila solo tus seguidos de
`ml_vigilar` de su tipo (rivales 🥊, productos 📦, búsquedas, tendencias).

## Lucía — la auditoría quincenal (no hay que asignarle nada)
- Sin tareas propias audita **cada tienda conectada**, sola, cada 15 días. Si la PC
  estuvo apagada el día 15, audita apenas el equipo vuelve a correr.
- Cada auditoría deja: un resumen (🔴/🟡/🟢, cuántas sin actualizar y, desde la
  segunda, cuántas mejoraron/empeoraron), una alerta por cada publicación que pasó a
  🔴 con su problema principal y la skill para arreglarlo, y la lista de las que
  quedaron desactualizadas.
- Chequea si está **actualizada**: 60+ días sin ningún cambio, precio igual hace 45+
  días (con la base de datos), precio >15% arriba o >25% abajo de la mediana del
  mercado, fotos de menos de 800 px, falta marca/modelo, sin garantía; y la calidad
  de siempre (título, fotos, descripción, envío, stock, video, catálogo).
- **Preguntas → descripción:** en cada publicación junta las preguntas respondidas,
  agrupa las que se repiten (2+ veces) y marca las que la descripción no responde.
  Avisa con ❓ y la skill `faq-descripcion-ml`: `ml_faq_descripcion todas=true`
  muestra la propuesta de TODAS las marcadas y con `aplicar=true` (después del OK)
  las agrega como "PREGUNTAS FRECUENTES" con las respuestas reales del vendedor.
- `accion=correr trabajador=Lucía` audita YA (puede tardar unos minutos si tenés
  cientos de publicaciones). `accion=correr` sin nombre no la dispara.
- `accion=resultados trabajador=Lucía` → tabla de todas, las peores primero.
  `accion=historial trabajador=Lucía` → la evolución quincena a quincena.
- Otra frecuencia: `accion=frecuencia trabajador=Lucía dias=7`. Una sola tienda:
  `accion=asignar trabajador=Lucía cuenta=USER_ID`.
- Despacho: proponer arreglar las 🔴 de a 3-5 por quincena con
  `mejorar-publicaciones-ml` (o `visualizador-publicaciones-ml` para que elija),
  fotos con `imagenes-ml`, precios con `calculadora-ml` antes de tocar nada.

## Clara — la agenda comercial (no hay que asignarle nada)
- Todos los días, por cada tienda conectada: campañas que ML te ofrece y fechas
  cruciales de los próximos 45 días.
- **Pregunta SIEMPRE si querés participar**: al llegar cada invitación, a 3 y 1 día
  del cierre de inscripción, y a 30/14/7/1 días de cada fecha — hasta que decidas.
  Un NO se respeta: no vuelve a preguntar por esa.
- Con SÍ: si no inscribiste publicaciones a 2 días del cierre, te avisa; cuando
  arranca el evento, pide actualizar Mi página (`mi-pagina-ml`); cuando termina,
  sacar el banner.
- Despacho: ante cada ❓ preguntar al vendedor y guardar con `ml_agenda
  accion=decidir`; seguir la skill `agenda-comercial-ml` (margen antes de inscribir).

## Armar el equipo (una vez, 5 minutos)
1. `ml_trabajadores accion=equipo` → mostrar quién está y qué vigila.
2. Pedir lo mínimo y asignar (se puede nombrar por nombre o puesto):
   - Vera: 2-5 publicaciones rivales directas **con `mi_item`** (tu publicación
     equivalente) y `umbral=2` para no avisar por centavos.
   - Tomás: las mismas publicaciones rivales (ve sus ventas y quiebres).
   - Martina: 2-3 keywords donde se juega tu venta **con `mi_item`**.
   - Bruno: esas mismas keywords.
   - Sofía: tu categoría principal (o vacío = todo el sitio).
3. `ml_trabajadores accion=correr` → primera pasada = foto de base (no avisa nada).
4. Explicar cómo siguen trabajando:
   - Mientras Claude está abierto, se despiertan solos cada minuto y cada uno
     controla según su frecuencia.
   - **24/7 con la PC prendida** (recomendado): en la terminal
     `npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital trabajadores instalar`
     — arrancan solos al iniciar sesión, sin admin. Para sacarlo: `... trabajadores desinstalar`.

## El informe (la rutina)
1. `ml_trabajadores accion=informe` → alertas sin leer, por trabajador, urgentes 🔴 primero.
2. Cada alerta trae `👉 skill X`: es la skill de ESE trabajador para resolverla.
   Proponer al vendedor las 3 acciones de más plata y, con su OK, correr esa skill:
   - 🔴 Vera "más barato que tu ..." → `calculadora-ml` con el precio del rival:
     solo sugerir igualar si el margen sigue positivo.
   - 🔴 Tomás "SIN STOCK" → ventana de 24-72 h: `publicidad-ml` para empujar la
     tuya y tener `responder-preguntas-ml` al día.
   - 🔴 Lucía "está en rojo / pasó a urgente" → la skill que trae la alerta (arreglos con `mejorar-publicaciones-ml`).
   - 🔴 Martina "bajaste / saliste del top" → `mejorar-publicaciones-ml`
     (y `visualizador-publicaciones-ml` para compararte con el líder).
   - 🔴 Bruno "rival nuevo" → `competencia-ml`; si conviene seguirlo, `ml_vigilar`
     tipo=vendedor y asignárselo a Vera.
   - Sofía "entraron al top" → `descubrir-ganadores-ml` para validar si conviene venderlo.
3. Las alertas leídas quedan en el historial (`todas=true`).

## Resultados (todo lo que saben, no solo alertas)
`ml_trabajadores accion=resultados` (o `trabajador=Vera` para uno solo) → una
tabla por trabajador con los datos de su último control:
- **Vera:** precio de cada rival vs el tuyo, diferencia % y 🔴/🟡/🟢.
- **Tomás:** ventas desde que lo vigilamos, **ritmo u./día** y **facturación
  estimada por mes** de cada rival, stock y estado.
- **Martina:** líder, precio líder, mediana del top 10 y **tu puesto** por keyword.
- **Bruno:** cuántos vendedores distintos vio y los rivales nuevos de la semana.
- **Sofía:** el top 10 de tendencias de cada sitio/categoría.
Arrancar siempre por "Lo importante" (una línea por trabajador) y cerrar con
máximo 3 acciones, cada una con la skill del trabajador que la resuelve.

## La base de datos del equipo (historial)
Todo lo que miden y avisan queda en **SQLite que viene con Node** (archivo
`equipo.db`, cero instalación — ideal Windows). 400 días de historial.
- `ml_trabajadores accion=historial ref=MLA123` (o `trabajador=Martina`, `dias=90`)
  → día por día: precio rival vs el tuyo (Vera), vendió ese día y ritmo/$ por mes
  (Tomás), tu puesto y líderes (Martina), vendedores en el top (Bruno), top 3 de
  tendencias (Sofía), con mínimo, máximo y variación del período.
- Usalo para decisiones con datos: "¿este rival baja siempre los viernes?",
  "¿desde cuándo perdí puestos?", "¿cuánto vende de verdad por mes?".
- `accion=base` → dónde está, cuánto ocupa, cuántas mediciones; `backup=true` hace
  una copia consistente aunque el equipo esté trabajando.
- Si dice "no activa": el Node es viejo. En Windows: `winget install
  OpenJS.NodeJS.LTS` y reabrir Claude. No hay que instalar ninguna base aparte.
  Mientras tanto el equipo funciona igual, sin historial.

## Google Drive (resultados afuera de Claude, solos)
`ml_trabajadores accion=drive` muestra el estado y los pasos. Dos caminos
(se pueden usar juntos):
- **Planilla de Google en vivo (recomendada, 24/7):** el vendedor crea una
  planilla, pega `docs/drive/planilla-equipo.gs` en Extensiones → Apps Script con
  la CLAVE que le da la herramienta, implementa como App web y te pasa la URL
  `/exec` → `accion=drive url=...`. Resultado: pestaña "Alertas", pestaña
  "Historial" (60 días de la base) + una pestaña por trabajador que se reescribe en cada control.
- **Carpeta de Drive para escritorio:** `accion=drive carpeta=auto` (o la ruta,
  ej. `G:\Mi unidad`) → carpeta "MercadoLibre - Equipo de trabajadores" con
  Alertas.csv, Historial.csv, un CSV por trabajador y "Resumen del equipo.md".
- Probar: `accion=drive probar=true` · Desconectar: `accion=drive quitar=todo`.
- Si en esta conversación de Claude está el conector de Google Drive, también
  podés guardar ahí el informe o los resultados como documento cuando el
  vendedor lo pida.
- Seguridad: la CLAVE es secreta (no pegarla en lugares públicos); ningún texto
  de un rival se guarda como fórmula en la planilla.

## Ajustes
- `frecuencia` (mínimo 10 min, para cuidar el límite de la API de ML).
- `pausar` / `activar` a uno o a `todos` (ej: pausar a Sofía fuera de temporada).
- `quitar` una tarea. Las que vienen de tus seguidos se quitan con `ml_vigilar`.
- Webhook opcional para mandar cada alerta al CRM/WhatsApp: variable
  `ML_TRABAJADORES_WEBHOOK` (solo https) en el config del conector.

## 🧠 Guardar lo aprendido
Cuando el vendedor fije una regla frente a una alerta ("a Vera: nunca igualar
por debajo de $X", "ese rival no me importa"), ofrecer guardarla con
`ml_cerebro` como nota del producto, y ajustar `umbral` o quitar la tarea.

## Reglas
- Nunca cambiar precios por una alerta sin confirmación explícita y sin pasar
  por `calculadora-ml`.
- Las ventas de rivales son estimadas (MercadoLibre redondea lo público): decirlo.
- Todo vive en la computadora del vendedor; solo se leen datos públicos de ML
  y los de su propia cuenta.
