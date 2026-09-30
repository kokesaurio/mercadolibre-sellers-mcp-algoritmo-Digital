---
name: reporte-ventas-ml
description: Genera el reporte de ventas de MercadoLibre (día, semana o mes) con el conector MCP de Algoritmo Digital. Usar SIEMPRE que el usuario pregunte cómo viene el día, cómo van las ventas, cuánto facturó, cuánta plata le va a entrar, pida un resumen o reporte de la tienda, o quiera comparar períodos — cualquier pregunta sobre el estado del negocio en MercadoLibre dispara esta skill.
---

# Reporte de ventas de MercadoLibre

Resumen ejecutivo del negocio con datos reales, no una lista cruda de números.

## Requisito

Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.

## Flujo

1. **Arrancar con `ml_panel`**: la foto de hoy consolidando todas las tiendas
   (ventas, facturación, comparación contra ayer a la misma hora). Si el
   usuario nombra una tienda, pasar `cuenta`.
2. **Según el período pedido**, profundizar:
   - Día → `ml_panel` alcanza; sumar `ml_alertas` para lo urgente.
   - Semana/mes → `ml_metricas` (evolución y comparación de períodos) y
     `ml_rentabilidad` (margen, no solo facturación).
   - Plata → `ml_caja` (cuánto y cuándo libera MercadoPago) y
     `ml_facturacion`.
3. **Revisar `ml_alertas` siempre**: sin stock, reclamos abiertos, preguntas
   viejas. Lo urgente va primero en el reporte aunque no lo hayan pedido.
## Formato del reporte

Estructura fija, corta, apta para leer en el celular:

**📊 [Período] — [tienda o "todas las tiendas"]**
1. La línea clave: facturación y unidades, con la comparación (↑↓ % vs
   período anterior).
2. Qué explica el número: los 2-3 productos o hechos que movieron la aguja.
3. ⚠️ Urgente (solo si hay): stock, reclamos, preguntas sin responder.
4. Una acción concreta sugerida para hoy.

Números siempre en pesos argentinos con separador de miles. Porcentajes con
un decimal. Si un dato no está disponible, decilo; nunca lo estimes en
silencio.

## Qué no hacer

- No volcar tablas gigantes: el valor es la síntesis con criterio.
- No mezclar facturación con margen como si fueran lo mismo: si hablás de
  ganancia, usá `ml_rentabilidad`.
- No inventar comparaciones que las herramientas no devuelven.