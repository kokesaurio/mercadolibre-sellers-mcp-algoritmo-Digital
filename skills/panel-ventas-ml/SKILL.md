---
name: panel-ventas-ml
description: Panel de ventas de MercadoLibre — facturación de HOY y del MES, productos más vendidos, reparto por método de envío (FULL/Flex/Colecta) y en qué provincias se concentran las ventas. Usar cuando pidan "¿cómo venimos hoy?", "panel de ventas", "facturación del mes", "qué se está vendiendo" o "dónde vendemos más".
---

# Panel de ventas

## Requisito
Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.

## Flujo
1. Correr `ml_panel_ventas` (con `cuenta` si hay varias tiendas; si piden el
   total del negocio con varias tiendas, correrlo por cuenta y sumar los
   totales aclarando el desglose).
2. Entregar el panel TAL CUAL lo devuelve la herramienta (ya viene formateado:
   hoy, mes, top productos, envíos, provincias) y abajo agregar máximo 2
   lecturas accionables, por ejemplo:
   - un producto concentra >50% de la venta → riesgo de depender de un solo
     ítem: proponer empujar al segundo (publicidad/mejoras).
   - mucho Flex o Colecta y poco FULL → evaluar mandar los más vendidos a
     FULL (posiciona mejor); mucha venta lejos (interior) con Flex → revisar
     costos/tiempos de envío.
   - el día viene flojo contra el ritmo del mes (hoy < mes/días transcurridos)
     → decirlo con el número.
3. Ofrecer profundizar: `ml_metricas` para comparar contra el período
   anterior, `ml_auditar_publicaciones` si un producto top tiene problemas, o
   la skill vigilancia-ml si el bajón coincide con un movimiento de la
   competencia.

## Reglas
- Nunca inventar números: todo sale de la herramienta.
- Si no hay ventas en el día, decirlo directo y pasar al dato del mes.
- Formato apto celular: el panel ya es compacto, no agregar tablas enormes.
