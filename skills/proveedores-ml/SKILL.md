---
name: proveedores-ml
description: Proveedores con Fede — vincular cada producto que revendés con su proveedor (su publicación en MercadoLibre o la página del producto en su tienda), vigilar precio y stock, y ajustar tu precio, costo o pausar cuando el proveedor cambia. Usar cuando pidan "vigilá a mi proveedor", "el proveedor subió los precios", "¿tiene stock el mayorista?", o cuando Fede avise.
---

# Proveedores — tu precio y tu stock atados al de ellos

## Requisito
`ml_trabajadores`, `ml_cerebro`, `ml_actualizar_publicacion` del conector (v1.21.0+).

## Vincular (una vez por producto)
`ml_trabajadores accion=asignar trabajador=Fede ref=<TU publicación MLA…> fuente=<proveedor> recargo=<%>`
- `fuente`: la publicación del proveedor en MercadoLibre (MLA…) o la **URL https del
  producto en su tienda** (funciona con tiendas que publican datos de producto:
  Tiendanube, WooCommerce, Shopify y la mayoría de las webs modernas).
- `recargo`: el % que le sumás al precio del proveedor (para sugerirte el precio).
- Si la web no publica el precio, Fede lo avisa: usar la publicación de ML del
  proveedor si la tiene.

## Cuando Fede avisa
- **Cambió el precio**: mostrar precio nuevo, precio sugerido con el recargo y el
  margen real con `calculadora-ml`. Ofrecer: actualizar el costo en el cerebro
  (`ml_cerebro`) y el precio en ML (`ml_actualizar_publicacion`) — **con OK**.
- **Proveedor sin stock**: proponer pausar o bajar el stock de tu publicación antes de
  vender lo que no tenés (cancelar una venta daña la reputación). Con OK.
- **Repuso stock**: proponer reactivar.

## Seguridad
Fede solo lee páginas públicas https (nunca direcciones de red internas) y no guarda
contraseñas de ningún proveedor.
