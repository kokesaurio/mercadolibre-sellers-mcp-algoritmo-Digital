# Guía de uso — las 14 skills del conector

Skills listas para Claude que convierten el [conector de MercadoLibre de
Algoritmo Digital](../README.md) en flujos de trabajo completos. **Cómo
instalarlas**: descargá la carpeta de la skill (o el repo con Code → Download
ZIP) y subila en Claude: **Configuración → Capacidades → Skills → Cargar
skill**. Claude las usa solo cuando corresponde.

> ¿Primera vez? Decile a Claude **"setup"** y la skill de puesta en marcha te
> configura todo: cuenta, vigilancia y tu primera foto del negocio.

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

### 🧑‍🎤 [ugc-ml](ugc-ml/) — UGC limpio con avatar
**Pedilo así:** "hacé un UGC de este producto" · "video con avatar"
**Qué hace:** video vertical estilo usuario real pero prolijo, con AVATAR de IA siempre (el mismo en todos tus videos) y castellano latino neutro. Prueba social solo con números reales del conector.

### 🥊 [vigilancia-ml](vigilancia-ml/) — seguimiento de competencia y trends
**Pedilo así:** "vigilá a [rival]" · "¿qué cambió en la competencia?" · "mis rivales"
**Qué hace:** lista de rivales, productos seguidos, búsquedas y tendencias; el control semanal reporta SOLO lo que cambió (precios, publicaciones nuevas, ventas estimadas del rival, keywords en alza) y lo traduce en máximo 3 acciones.

### ⚔️ [competencia-ml](competencia-ml/) — foto del momento
**Pedilo así:** "¿cómo estoy contra la competencia?" · "¿gano el catálogo?"
**Qué hace:** semáforo de precios contra el mercado, buy box del catálogo y recomendaciones validadas por margen (nunca sugiere un precio que te deje en negativo).

### 📣 [publicidad-ml](publicidad-ml/) — ads y promociones
**Pedilo así:** "revisemos la publicidad" · "¿qué promociones me ofrece ML?"
**Qué hace:** Product Ads con la regla ACOS vs margen, y promociones separando tu aporte del de MercadoLibre, con aceptación por ítem confirmada.

## Rutina sugerida

- **Todos los días (5 min):** panel-ventas-ml + responder-preguntas-ml.
- **Semanal:** vigilancia-ml → visualizador-publicaciones-ml para elegir qué mejorar → mejorar-publicaciones-ml → publicidad-ml.
- **Al publicar algo nuevo:** copiar-publicaciones-ml → imagenes-ml → video-publicaciones-ml o ugc-ml → revisar-publicaciones-aldi antes de meterle tráfico.

¿Querés skills a medida para tu operación?
[WhatsApp de Algoritmo Digital](https://wa.me/5491177166060?text=Hola!%20Vengo%20de%20las%20skills%20del%20conector%20MCP%20(GitHub)...)
