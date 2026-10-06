# Changelog

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
