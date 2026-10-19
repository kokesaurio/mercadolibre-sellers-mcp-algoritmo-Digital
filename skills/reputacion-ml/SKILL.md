---
name: reputacion-ml
description: Reputación y opiniones en MercadoLibre con Valen — color de reputación, MercadoLíder, las tres métricas que lo mueven (reclamos, demoras, cancelaciones) y las opiniones de tus productos más vendidos, con qué hacer ante cada opinión negativa. Usar cuando pidan "¿cómo está mi reputación?", "me pusieron una mala opinión", "¿por qué bajé de color?", o cuando Valen avise.
---

# Reputación — qué la mueve y cómo cuidarla

## Requisito
`ml_trabajadores` y `ml_reputacion` del conector (v1.21.0+).

## Flujo
1. `ml_trabajadores accion=resultados trabajador=Valen` → color, MercadoLíder, % de
   reclamos, despachos con demora y cancelaciones, y opiniones de los más vendidos.
2. Explicar qué métrica está empujando para abajo y quién del equipo la ataca:
   reclamos → Iván (`reclamos-ml`), demoras → Leo (`logistica-ml`), cancelaciones →
   Nico/Fede (vender sin stock real es la causa más común: `stock-ml`, `proveedores-ml`).
3. **Opinión negativa**: leerla, separar si es del producto (calidad, medidas, "no es
   lo que esperaba") o del servicio (envío, atención). Del producto → corregir la
   publicación para que la expectativa sea real (`mejorar-publicaciones-ml`,
   `faq-descripcion-ml`, `imagenes-ml`). Del servicio → el trabajador que corresponda.
4. Cerrar con 1-3 acciones concretas.

## Reglas
- No ofrecer nada a cambio de cambiar una opinión ni contactar al comprador fuera de ML.
