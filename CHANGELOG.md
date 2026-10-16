# Changelog

## 1.15.0
- **📊 Resultados del equipo** (`ml_trabajadores accion=resultados`): una tabla por trabajador con todo lo que sabe — Vera: precio de cada rival vs el tuyo y 🔴/🟡/🟢 · Tomás: ventas desde que vigilamos, **ritmo u./día y facturación estimada/mes del rival** · Martina: líder, mediana del top 10 y tu puesto · Bruno: vendedores vistos y rivales nuevos de la semana · Sofía: top 10 de tendencias. Con "Lo importante" arriba.
- **📁 Google Drive** (`accion=drive`), sin apps de Google Cloud: **planilla en vivo** vía Apps Script ([docs/drive/planilla-equipo.gs](docs/drive/planilla-equipo.gs)) con pestaña Alertas + una por trabajador, protegida por clave secreta; y/o **carpeta de Drive para escritorio** (detectada sola) con Alertas.csv, un CSV por trabajador y resumen. Cada control del equipo actualiza Drive solo.
- 🔒 Anti inyección de fórmulas: ningún texto de un rival se guarda como fórmula en la planilla ni en los CSV.
- Suite: 78 pruebas (incluye la redirección 302 real de Apps Script).

## 1.14.0
- **👷 Equipo de trabajadores 24/7** (`ml_trabajadores`): 5 trabajadores con nombre que vigilan solos y constantemente — 🕵️ **Vera** (precios; avisa si un rival queda más barato que tu publicación), 📦 **Tomás** (ventas estimadas del rival, ritmo/día y $/mes, quiebres de stock y pausas), 🏆 **Martina** (líder del top 50 y tu puesto en cada keyword), 🎯 **Bruno** (rivales nuevos en tus búsquedas) y 📈 **Sofía** (tendencias).
- Cada trabajador tiene **skills a cargo** y cada alerta recomienda cuál correr (ej: Vera → calculadora-ml, Tomás → publicidad-ml, Martina → mejorar-publicaciones-ml, Bruno → competencia-ml, Sofía → descubrir-ganadores-ml).
- Tareas con `mi_item`, `umbral` y frecuencia propia (mínimo 10 min); sin tareas propias vigilan tus seguidos de `ml_vigilar`. Bandeja de alertas con informe por trabajador.
- Corren solos mientras Claude está abierto, o **24/7 como servicio de la PC** (`npx ... trabajadores instalar`, sin admin: Windows/macOS/Linux). Candado con latido: nunca corren dos veces.
- 🔒 **Refresh de sesión con candado entre procesos**: Claude y el servicio nunca renuevan el token a la vez (el refresh de ML es de un solo uso — sin esto se revocaba la cuenta).
- Webhook opcional `ML_TRABAJADORES_WEBHOOK` (solo https) para mandar alertas al CRM/WhatsApp.
- Skill `trabajadores-ml` (19ª). Suite: 68 pruebas.

## 1.13.1
- 🧠 Todas las skills ofrecen guardar lo aprendido en el cerebro: cada una con su dato (setup → impuestos del negocio, preguntas → medidas/incluye del producto, imágenes → medidas e incluye, UGC → el avatar de referencia, vigilancia → reglas propias, competencia/publicidad → costos para validar margen, ganadores → decisiones).

## 1.13.0
- **🧠 El cerebro del conector**: base de datos local (`cerebro.json`, cero instalación) con la memoria del negocio — costos, impuestos, envío, medidas, qué incluye y notas, por producto o del negocio entero con herencia.
- `ml_cerebro` (guardar/ver/olvidar) y `ml_rentabilidad` que **usa y alimenta la memoria sola**: lo enseñado no se vuelve a preguntar, lo nuevo se aprende, siempre avisando qué dato guardado se usó.
- Skill `cerebro-ml` (18ª) + mock de órdenes con filtrado real por fecha (pruebas estables cualquier día del mes).

## 1.12.0
- **`ml_publicidad`**: métricas de Product Ads en vivo — inversión, impresiones, clics, CTR, CPC, ACOS y ventas por ads, por publicación o por campaña.
- **`ml_rentabilidad`**: la calculadora de rentabilidad real — precio − comisión real de ML − publicidad por unidad (ads en vivo) − impuestos − envío − costo = ganancia neta, margen con semáforo y ACOS máximo; pide costo e impuestos (nunca los inventa) y calcula el precio de equilibrio si da pérdida.
- Skill `calculadora-ml` (17ª): el flujo conversacional de la calculadora.

## 1.11.0
- **Clips por API**: `ml_clips` (mapa de video de la tienda + estado de moderación por clip con motivos traducidos y cómo corregir), `ml_subir_clip` (subida multipart validando formato/duración/peso antes de gastar la subida) y `ml_borrar_clip`.
- Skill `clips-ml` (16ª): el flujo completo de Clips — mapear cuáles sirven, producir los que faltan y subirlos cumpliendo los requisitos de ML (vertical, 10-61 s, ≤280 MB, moderación 24-48 hs).

## 1.10.0
- **Base de datos de competencia**: cada control de vigilancia guarda un punto histórico (precio, ventas, líder) y `ml_historial_competencia` muestra la evolución con mínimos, máximos y variación.
- **`ml_descubrir_ganadores`**: artículos ganadores por categoría (ranking oficial de más vendidos + tendencias) o por keyword (competencia, precios, dominancia, señal de oportunidad 🟢🟡⚪).
- Skill `descubrir-ganadores-ml` (15ª): el flujo completo "¿qué conviene vender?" validado por margen.

## 1.9.1
- Pedido de ⭐ en los 3 momentos de oro (instalación, primera conexión, versión al día), con apertura opcional de GitHub desde el instalador.

## 1.9.0
- Auditoría detecta publicaciones **sin video**.
- Skills `setup-ml` (puesta en marcha guiada) y `ugc-ml` (UGC con avatar siempre, castellano latino).
- Guía de uso completa de las 14 skills.

## 1.8.0
- Skill `video-publicaciones-ml`: videos del producto con HyperFrames desde datos y fotos reales.

## 1.7.x
- Visualizador interactivo de publicaciones + skill propia: tarjetas con foto y semáforo, selección de cuáles mejorar.

## 1.6.0
- Set fijo de 4 imágenes con la foto real: plantilla `beneficio.svg`, generador `generar.py`, fotos expuestas en `ml_publicacion`.

## 1.5.x
- Kit de imágenes de venta: plantillas SVG 1200×1200 + skill `imagenes-ml` con el método de 7 pasos y reglas de ML.

## 1.4.0
- `ml_panel_ventas`: hoy/mes, top productos, envíos y provincias + skill.

## 1.3.0
- Rivales 🥊 y productos seguidos 📦 + `ml_auditar_publicaciones` (semáforo con mejoras).

## 1.2.0
- Vigilancia de competencia y tendencias (`ml_vigilar` + `ml_novedades_competencia`) + skill.

## 1.1.0
- `ml_version`, aviso automático de actualizaciones y comando `actualizar`.

## 1.0.0
- Conector inicial: herramientas directas a la API de ML, OAuth con PKCE sin servidor, multicuenta, instalador, 5 skills, guía ilustrada y suite E2E.
