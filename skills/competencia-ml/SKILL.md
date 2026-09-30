---
name: competencia-ml
description: Analiza la competencia en MercadoLibre con el conector MCP de Algoritmo Digital. Usar SIEMPRE que el usuario pregunte cómo está frente a la competencia, si está caro o barato, quién le baja los precios, quién gana el catálogo, qué está pasando en el mercado o quiera monitorear a otros vendedores — cualquier pregunta de precios comparados o competidores en MercadoLibre dispara esta skill.
---

# Análisis de competencia en MercadoLibre

Radiografía de posición competitiva con datos, terminando en decisiones de
precio concretas, no en observaciones genéricas.

## Requisito

Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.

## Flujo

1. **`ml_competitividad`** — posición de precio de cada publicación frente a
   su competencia directa. Es el corazón del análisis.
2. **`ml_competidores`** — los vendedores monitoreados: reputación, ventas
   estimadas, precio promedio. Si el usuario quiere seguir a uno nuevo,
   indicá que se agrega desde el panel del CRM.
3. **`ml_cambios_precio`** — quién movió precios últimamente y hacia dónde;
   detecta guerras de precio antes de que duelan.
4. **`ml_catalogo`** — en qué publicaciones de catálogo se está ganando o
   perdiendo la buy box y por cuánto.
5. **`ml_mercado`** — tendencia general de la categoría si el usuario
   pregunta por el mercado y no solo por sus ítems.
## Formato del análisis

**🥊 Posición competitiva — [tienda]**
1. Semáforo general: en cuántas publicaciones se está caro / competitivo /
   barato.
2. Los 3-5 casos que importan: ítems donde se pierde catálogo o ventas por
   precio, con el número exacto (nuestro precio vs el del competidor, y la
   diferencia).
3. Movimientos recientes de competidores que cambian el juego.
4. Recomendación por ítem: subir, bajar, sostener — **siempre validada
   contra `ml_rentabilidad` o `ml_simular_precios`**: nunca recomendar un
   precio que dé margen negativo, y decirlo explícitamente cuando igualar a
   la competencia no cierra con los costos.

## Aplicar cambios de precio

Si el usuario decide cambiar precios, usá `ml_actualizar_publicacion` de a
un ítem, mostrando antes → después y esperando confirmación explícita de
cada cambio. Después verificá con `ml_publicaciones`.

## Qué no hacer

- No recomendar "bajar para competir" sin mirar el margen: ese consejo
  gratis es el que funde vendedores.
- No presentar estimaciones de ventas de competidores como datos exactos:
  son estimaciones y hay que decirlo.
- No cambiar ningún precio sin confirmación explícita por ítem.