# Guía de uso — las 30 skills del conector

Skills listas para Claude que convierten el [conector de MercadoLibre de
Algoritmo Digital](../README.md) en flujos de trabajo completos. **Cómo
instalarlas**: descargá la carpeta de la skill (o el repo con Code → Download
ZIP) y subila en Claude: **Configuración → Capacidades → Skills → Cargar
skill**. Claude las usa solo cuando corresponde.

> ¿Primera vez? Decile a Claude **"setup"** y la skill de puesta en marcha te
> configura todo: cuenta, vigilancia y tu primera foto del negocio.

> 🧠 **Todas las skills guardan lo que aprenden**: cuando en el trabajo aparece
> un dato durable del negocio o de un producto (costo, impuestos, medidas, qué
> incluye, un avatar elegido, una regla tuya), la skill te ofrece guardarlo en
> el [cerebro del conector](cerebro-ml/) — se guarda UNA vez, en tu máquina, y
> ninguna herramienta te lo vuelve a preguntar.

## Cómo usar cada una

### 🚀 [setup-ml](setup-ml/) — puesta en marcha
**Pedilo así:** "setup" · "configurame todo" · "ayudame a arrancar"
**Qué hace:** verifica el conector, conecta tu(s) cuenta(s), fija la predeterminada, arma la vigilancia inicial y te da tu primera foto del negocio con las 3 acciones más urgentes.
**Ojo:** necesitás tu App ID y Secret ya configurados (guía ilustrada del README).

### 📊 [panel-ventas-ml](panel-ventas-ml/) — el tablero del día
**Pedilo así:** "¿cómo venimos hoy?" · "panel de ventas" · "facturación del mes"
**Qué entrega:** facturación de hoy y del mes, top productos, envíos (FULL/Flex/Colecta) y en qué provincias se concentra la venta, con máximo 2 lecturas accionables.

### 📈 [reporte-ventas-ml](reporte-ventas-ml/) — el resumen de 4 líneas
**Pedilo así:** "reporte de ventas" · "resumen de la semana"
**Qué entrega:** facturación, unidades y alertas en formato fijo apto celular. Ideal para mandar por WhatsApp al dueño.

### 💬 [responder-preguntas-ml](responder-preguntas-ml/) — despacho de preguntas
**Pedilo así:** "respondamos las preguntas" · "¿qué preguntas tengo?"
**Qué hace:** junta las pendientes, propone TODAS las respuestas juntas para que apruebes de una, y publica solo lo confirmado. Nunca incluye datos de contacto (ML lo penaliza).


### ❓ [faq-descripcion-ml](faq-descripcion-ml/) — las preguntas van a la descripción
**Pedilo así:** "sumá las preguntas a la descripción" · "me preguntan siempre lo mismo" · "aplicá las preguntas frecuentes que marcó Lucía"
**Qué hace:** junta las preguntas que te hacen en cada publicación, agrupa las repetidas aunque estén escritas distinto y las agrega al final de la descripción como "PREGUNTAS FRECUENTES" con TUS respuestas reales. Descarta stock, precio, cuotas, envíos y cualquier respuesta con datos de contacto; no repite lo que la descripción ya explica; y la próxima vez actualiza el bloque sin duplicar.
**Ojo:** primero te muestra cómo queda; escribe en la publicación solo con tu OK. Lucía revisa esto sola cada 15 días.

### 🗓️ [agenda-comercial-ml](agenda-comercial-ml/) — ¿participás?
**Pedilo así:** "¿qué fechas vienen?" · "¿en qué promos de MercadoLibre puedo entrar?" · "¿me conviene el CyberMonday?"
**Qué hace:** junta el cronograma de campañas que ML te ofrece (con cierre de inscripción y cuántas publicaciones tuyas pueden entrar) y las fechas cruciales del año. Por cada una te pregunta si querés participar; si decís que sí, arma la lista de publicaciones validando el margen de cada una y las inscribe de a una con tu OK.
**Ojo:** Clara (del equipo) te lo pregunta sola todos los días hasta que decidas; un "no" se respeta. Hot Sale y CyberMonday figuran como estimadas hasta que las confirmes.

### 🏬 [mi-pagina-ml](mi-pagina-ml/) — Mi página al día
**Pedilo así:** "actualizá Mi página" · "poné el banner del Hot Sale" · "sacá el banner"
**Qué hace:** arma el kit con datos reales (texto del banner con el % OFF de tus publicaciones inscriptas, destacados en orden) y lo aplica en tu navegador, mostrándote cada cambio antes de guardar. Cuando termina el evento, vuelve todo a la normalidad.
**Ojo:** Mi página no tiene API pública: se edita en el panel de ML desde tu navegador, con tu sesión.

### 🎩 [jefe-de-equipo-ml](jefe-de-equipo-ml/) — le das un objetivo, él reparte el trabajo
**Pedilo así:** "quiero vender más este mes" · "¿por qué gano poco?" · "preparame para el CyberMonday" · "¿por dónde arranco?"
**Qué hace:** elige qué trabajadores tienen que ver con tu objetivo, los pone a trabajar ya, junta lo que encontraron y te da el plan en orden (urgentes primero), cada paso con su responsable y la skill que lo resuelve. Ejecuta de a un paso con tu OK.

### 🚚 [logistica-ml](logistica-ml/) — despachar a tiempo
**Pedilo así:** "¿qué tengo que despachar?" · "envíos demorados" · "me devolvieron un paquete"
**Qué hace:** la lista del día por tipo de envío con el horario límite (FULL lo despacha ML), demorados con mensaje al comprador, devoluciones y cuidado de la tasa de despachos con demora.

### 🧾 [contabilidad-ml](contabilidad-ml/) — cuánto queda de verdad
**Pedilo así:** "¿cuánto gané este mes?" · "cierre del mes" · "números para el contador"
**Qué hace:** facturación − comisiones reales de ML − publicidad − impuestos − mercadería − envíos = neto y margen, contra el mes anterior. Si faltan costos, te pide los de los productos que más vendiste y los guarda.
**Ojo:** es un resultado de gestión para decidir; no reemplaza la contabilidad formal.

### 📦 [stock-ml](stock-ml/) — reponer antes del quiebre
**Pedilo así:** "¿qué tengo que reponer?" · "¿cuánto stock me queda?"
**Qué hace:** días de stock de cada producto según lo que vendés por día, qué pedir y cuánto, y qué hacer con el stock parado.

### 🛡️ [reclamos-ml](reclamos-ml/) — reclamos a tiempo
**Pedilo así:** "¿tengo reclamos?" · "me hicieron un reclamo" · "mediación"
**Qué hace:** los reclamos ordenados por vencimiento, la respuesta propuesta lista para mandar desde MercadoLibre, y cómo evitar que se repitan.

### ⭐ [reputacion-ml](reputacion-ml/) — tu color, explicado
**Pedilo así:** "¿cómo está mi reputación?" · "me pusieron una mala opinión"
**Qué hace:** qué métrica empuja tu color para abajo y quién del equipo la ataca; qué hacer con cada opinión negativa.

### 🚫 [moderaciones-ml](moderaciones-ml/) — reactivar lo que ML pausó
**Pedilo así:** "me pausaron una publicación" · "¿por qué está en revisión?"
**Qué hace:** el motivo en castellano y cómo corregirlo, sin "esquivar" la moderación.

### 🔄 [proveedores-ml](proveedores-ml/) — tu precio atado al del proveedor
**Pedilo así:** "vigilá a mi proveedor" · "el proveedor subió los precios"
**Qué hace:** vinculás cada producto con su proveedor (su publicación de ML o la página de su tienda) y te avisa cambios de precio con el precio sugerido según tu recargo, y cuándo pausar porque se quedó sin stock.
### 🔍 [mejorar-publicaciones-ml](mejorar-publicaciones-ml/) — auditoría y mejoras
**Pedilo así:** "auditá mis publicaciones" · "¿qué publicaciones tengo que mejorar?"
**Qué hace:** semáforo 🔴🟡🟢 de cada publicación (título, fotos, descripción, envío, stock, video, catálogo) con la acción concreta, las peores primero. Aplica precio/stock/estado con tu confirmación por ítem; fotos y descripción te marca que van por el panel.

### 🗂️ [visualizador-publicaciones-ml](visualizador-publicaciones-ml/) — elegí cuáles mejorar
**Pedilo así:** "armame el visualizador" · "mostrame mis publicaciones con fotos"
**Qué entrega:** tablero interactivo con foto, precio, stock y semáforo por publicación: tocás las que querés mejorar y el botón te arma el pedido listo para pegarle a Claude.

### 📋 [copiar-publicaciones-ml](copiar-publicaciones-ml/) — duplicar publicaciones
**Pedilo así:** "copiá esta publicación a la otra tienda" · "creá una igual a esta"
**Qué hace:** clona entre tus cuentas (todo tal cual) o crea una nueva tomando otra de referencia — con la regla legal: lo ajeno se redacta de cero, nunca se clona.

### 🤖 [revisar-publicaciones-aldi](revisar-publicaciones-aldi/) — segunda opinión con Aldi 2.0
**Pedilo así:** "pasá esta publicación por Aldi" · "auditame con el GPT"
**Qué hace:** arma el paquete de revisión para [Aldi 2.0](https://chatgpt.com/g/g-698f16e0eebc819182455494732d40a0-aldi-2-0-mercado-libre-algoritmo-digital) (el GPT revisor de Algoritmo Digital en ChatGPT), vos traés el veredicto y Claude aplica solo lo que confirmes, validando el margen antes de tocar precios.

### 🖼️ [imagenes-ml](imagenes-ml/) — el set de imágenes de venta
**Pedilo así:** "armame las imágenes de MLA..." · "infografía de medidas"
**Qué entrega:** el set fijo de 4 (beneficio, características, medidas con cotas, qué incluye) en 1200×1200 con las fotos reales de la publicación incrustadas, siguiendo el método de 7 pasos y las reglas de imágenes de ML. Te las muestra antes de cerrar.
**Ojo:** las medidas y el contenido salen de vos — lo que no esté confirmado, se pregunta.

### 🎬 [video-publicaciones-ml](video-publicaciones-ml/) — video del producto
**Pedilo así:** "hacé un video para Reels de MLA..." · "clip para la publicación"
**Qué hace:** guion por escenas calcado del orden de fotos y producción con HyperFrames usando fotos reales + placas del set. Dentro de ML va sin precio ni contacto; en Reels/ads con precio y CTA. Guion y música se confirman antes de renderizar.

### 🎞️ [clips-ml](clips-ml/) — los videos cortos de ML
**Pedilo así:** "¿qué clips tengo?" · "¿qué publicaciones están sin video?" · "subí este clip a MLA..."
**Qué hace:** mapa de Clips de toda la tienda (publicado ✅ / en revisión ⏳ / rechazado ❌ con el motivo y cómo corregirlo), produce los que faltan con las skills de video y los sube por API validando formato, duración y peso. Moderación de ML: 24-48 hs.

### 🧑‍🎤 [ugc-ml](ugc-ml/) — UGC limpio con avatar
**Pedilo así:** "hacé un UGC de este producto" · "video con avatar"
**Qué hace:** video vertical estilo usuario real pero prolijo, con AVATAR de IA siempre (el mismo en todos tus videos) y castellano latino neutro. Prueba social solo con números reales del conector.

### 🏆 [descubrir-ganadores-ml](descubrir-ganadores-ml/) — qué conviene vender
**Pedilo así:** "¿qué conviene vender?" · "buscá productos ganadores" · "¿este producto tiene mercado?"
**Qué hace:** ranking oficial de más vendidos por categoría + tendencias + análisis de mercado por keyword (competencia, precios, quién domina) con señal de oportunidad 🟢🟡⚪ — y valida el margen con tus costos antes de recomendar entrar.

### 👷 [trabajadores-ml](trabajadores-ml/) — el equipo que vigila 24/7
**Pedilo así:** "dale una tarea a Vera" · "Martina, ¿en qué puesto estoy para 'termo 1 litro'?" · "¿qué encontró el equipo?"
**Qué hace:** 18 trabajadores con nombre que vigilan solos y constantemente — 🕵️ Vera (precios y quién queda más barato que vos), 📦 Tomás (ventas del rival y quiebres de stock), 🏆 Martina (líder y tu puesto en búsquedas), 🎯 Bruno (rivales nuevos), 🩺 Lucía (cada 15 días audita todas tus publicaciones: cuáles quedaron desactualizadas y qué empeoró), 🗓️ Clara (agenda comercial: cronograma de ML y fechas cruciales, siempre preguntando si participás), 💰 Ramiro (rentabilidad), 📣 Ana (anuncios), 🚚 Leo (logística), 🧾 Carmen (contabilidad), 📦 Nico (stock), 💬 Paula (atención), 🛡️ Iván (reclamos), ⭐ Valen (reputación), 🏷️ Gabi (catálogo), 🚫 Sole (moderaciones), 🔄 Fede (proveedores) y 📈 Sofía (tendencias). Cada alerta viene con la skill del trabajador que la resuelve.
**Historial y base:** "historial de MLA..." · "¿cómo evolucionó el precio de este rival?" · "estado de la base" — todo queda en SQLite que viene con Node (cero instalación, ideal Windows), 400 días.
**Resultados y Drive:** "mostrame los resultados del equipo" (precio rival vs el tuyo, ritmo de ventas y $/mes del rival, tu puesto, rivales nuevos, tendencias) · "conectá el equipo a Drive" (planilla de Google en vivo con una pestaña por trabajador, o carpeta de Drive).
**Ojo:** trabajan solos mientras Claude está abierto; para 24/7 corré una vez `npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital trabajadores instalar`.

### 🥊 [vigilancia-ml](vigilancia-ml/) — seguimiento de competencia y trends
**Pedilo así:** "vigilá a [rival]" · "¿qué cambió en la competencia?" · "mis rivales"
**Qué hace:** lista de rivales, productos seguidos, búsquedas y tendencias; el control semanal reporta SOLO lo que cambió (precios, publicaciones nuevas, ventas estimadas del rival, keywords en alza) y lo traduce en máximo 3 acciones. Cada control suma un punto a la **base de datos de competencia**: pedí "historial de [rival/producto]" para ver la evolución de precios en el tiempo.

### ⚔️ [competencia-ml](competencia-ml/) — foto del momento
**Pedilo así:** "¿cómo estoy contra la competencia?" · "¿gano el catálogo?"
**Qué hace:** semáforo de precios contra el mercado, buy box del catálogo y recomendaciones validadas por margen (nunca sugiere un precio que te deje en negativo).

### 🧠 [cerebro-ml](cerebro-ml/) — la memoria del negocio
**Pedilo así:** "acordate que el costo del termo es $20.000" · "mis impuestos son 12%" · "¿qué sabés de MLA...?"
**Qué hace:** guarda en tu máquina los datos del negocio (costos, impuestos, envío, medidas, qué incluye, notas) una sola vez — y las demás herramientas los usan solas: la calculadora deja de preguntarte lo que ya le enseñaste, y lo nuevo lo aprende automáticamente.
**Ojo:** memoria transparente — siempre te avisa qué dato guardado está usando, para que puedas corregirlo.

### 💰 [calculadora-ml](calculadora-ml/) — cuánto ganás de verdad
**Pedilo así:** "¿cuánto gano con este producto?" · "calculame la rentabilidad de MLA..." · "¿me conviene este precio?"
**Qué hace:** te pregunta precio (o lo trae de la publicación), costo e impuestos SOLO la primera vez (después los recuerda el 🧠 cerebro) — y suma sola la comisión real de ML y la publicidad que estás gastando EN VIVO. Entrega el desglose peso por peso, la ganancia neta con semáforo, el margen y el ACOS máximo que aguanta el producto.
**Ojo:** costo e impuestos los ponés vos — nunca los inventa.

### 📣 [publicidad-ml](publicidad-ml/) — ads y promociones
**Pedilo así:** "revisemos la publicidad" · "¿qué promociones me ofrece ML?"
**Qué hace:** Product Ads con la regla ACOS vs margen (métricas en vivo con ml_publicidad), y promociones separando tu aporte del de MercadoLibre, con aceptación por ítem confirmada.

## Rutina sugerida

- **Todos los días (5 min):** panel-ventas-ml + responder-preguntas-ml.
- **Siempre (solos):** el equipo de trabajadores-ml vigila 24/7; vos leés el informe y despachás las 🔴.
- **Semanal:** vigilancia-ml → visualizador-publicaciones-ml para elegir qué mejorar → mejorar-publicaciones-ml → publicidad-ml.
- **Al publicar algo nuevo:** copiar-publicaciones-ml → imagenes-ml → video-publicaciones-ml o ugc-ml → revisar-publicaciones-aldi antes de meterle tráfico.

📲 ¿Dudas usando las skills? [Sumate al grupo de WhatsApp de vendedores](https://chat.whatsapp.com/JIVta9yFA7n4wRZ51p42iO).

¿Querés skills a medida para tu operación?
[WhatsApp de Algoritmo Digital](https://wa.me/5491177166060?text=Hola!%20Vengo%20de%20las%20skills%20del%20conector%20MCP%20(GitHub)...)
