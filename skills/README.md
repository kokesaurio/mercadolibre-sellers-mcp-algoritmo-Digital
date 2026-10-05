# Skills de Claude para vendedores de MercadoLibre

12 skills listas para usar con el [conector MCP de MercadoLibre de Algoritmo
Digital](../README.md). Cada skill le enseña a Claude un flujo de trabajo
completo de vendedor: qué herramientas usar, en qué orden, con qué reglas de
seguridad y formato.

## Cómo instalarlas en Claude

1. Descargá la carpeta de la skill (o el repo entero con **Code → Download ZIP**).
2. En Claude: **Configuración → Capacidades → Skills → Cargar skill** y subí la
   carpeta (o un .zip de la carpeta con el `SKILL.md` adentro).
3. Listo: Claude la usa sola cuando la conversación lo amerita. Pedíselo
   directo, por ejemplo *"hacé el reporte de ventas"*.

Requisito: el conector instalado y la cuenta conectada (guía en el
[README principal](../README.md)).

## Las 12 skills

| Skill | Pedíselo así | Qué hace |
| --- | --- | --- |
| [panel-ventas-ml](panel-ventas-ml/) | "¿cómo venimos hoy?" | Facturación de hoy y del mes, top productos, envíos FULL/Flex/Colecta y provincias donde se concentra la venta |
| [reporte-ventas-ml](reporte-ventas-ml/) | "¿cómo vienen las ventas?" | Reporte diario de facturación, unidades y alertas en 4 líneas, apto celular |
| [responder-preguntas-ml](responder-preguntas-ml/) | "respondamos las preguntas" | Junta las pendientes, propone todas las respuestas para aprobar de una, publica solo lo confirmado; nunca datos de contacto |
| [mejorar-publicaciones-ml](mejorar-publicaciones-ml/) | "auditá mis publicaciones" | Semáforo 🔴🟡🟢 de tus publicaciones (título, fotos, descripción, envío, stock, catálogo) y aplica mejoras con confirmación por ítem |
| [visualizador-publicaciones-ml](visualizador-publicaciones-ml/) | "armame el visualizador" | Tablero interactivo con foto y semáforo de cada publicación: marcás cuáles mejorar y genera el pedido para Claude |
| [imagenes-ml](imagenes-ml/) | "armame las imágenes de la publicación" | Infografías 1200×1200 de medidas, beneficios y qué incluye, desde plantillas con las reglas de ML incorporadas |
| [copiar-publicaciones-ml](copiar-publicaciones-ml/) | "copiá esta publicación a la otra tienda" | Duplica publicaciones entre tus cuentas o crea nuevas desde una referencia — con la regla legal: lo ajeno se redacta, no se clona |
| [revisar-publicaciones-aldi](revisar-publicaciones-aldi/) | "pasá esta publicación por Aldi" | Auditoría externa con [Aldi 2.0](https://chatgpt.com/g/g-698f16e0eebc819182455494732d40a0-aldi-2-0-mercado-libre-algoritmo-digital), el GPT revisor de Algoritmo Digital: arma el paquete, procesa el veredicto y aplica lo confirmado |
| [vigilancia-ml](vigilancia-ml/) | "¿qué cambió en la competencia?" | Lista de rivales 🥊 y productos seguidos 📦 + control periódico: precios movidos, publicaciones nuevas, ventas estimadas del rival, trends en alza |
| [video-publicaciones-ml](video-publicaciones-ml/) | "hacé un video de esta publicación" | Video del producto con HyperFrames (Reels, ads o clip de la publicación) desde los datos y fotos reales, con guion por escenas y reglas de ML |
| [competencia-ml](competencia-ml/) | "¿cómo estoy contra la competencia?" | Foto del momento: semáforo de precios, buy box del catálogo y recomendaciones validadas por margen |
| [publicidad-ml](publicidad-ml/) | "revisemos la publicidad" | Product Ads con regla ACOS vs margen, y promociones separando tu aporte del de MercadoLibre |

## Cómo se combinan (rutina sugerida)

- **Todos los días**: panel-ventas-ml o reporte-ventas-ml + responder-preguntas-ml (5 minutos).
- **Semanal**: vigilancia-ml + visualizador-publicaciones-ml para elegir qué mejorar (novedades de rivales y trends) → mejorar-publicaciones-ml sobre lo que el mercado movió → publicidad-ml.
- **Al publicar algo nuevo**: copiar-publicaciones-ml → imagenes-ml → video-publicaciones-ml → revisar-publicaciones-aldi antes de meterle tráfico.

¿Querés que armemos skills a medida para tu operación? Escribinos:
[WhatsApp de Algoritmo Digital](https://wa.me/5491177166060?text=Hola!%20Vengo%20de%20las%20skills%20del%20conector%20MCP%20(GitHub)...)
