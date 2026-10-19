---
name: contabilidad-ml
description: Los números del negocio en MercadoLibre con Carmen — resultado del mes (facturación, comisiones reales de ML, publicidad, impuestos, costo de mercadería, envíos, neto y margen), comparado con el mes anterior, y el cierre mensual para el vendedor o su contador. Usar cuando pidan "¿cuánto gané este mes?", "cierre del mes", "números para el contador", "¿me queda plata?", o cuando Carmen avise.
---

# Contabilidad — cuánto queda de verdad

## Requisito
`ml_numeros`, `ml_cerebro` y `ml_rentabilidad` del conector de MercadoLibre de
Algoritmo Digital (v1.20.0+).

## Flujo
1. `ml_numeros` (mes actual hasta hoy) o `mes=anterior` / `mes=AAAA-MM` para un cierre.
2. Presentar primero el **neto y el margen**, después la cascada (facturación →
   comisiones → publicidad → impuestos → mercadería → envíos), y la comparación con
   el mes anterior.
3. **Si dice "parcial"**: es porque faltan costos de productos vendidos o el % de
   impuestos. Pedir los datos que faltan (empezando por los productos que más se
   vendieron) y guardarlos con `ml_cerebro` — una sola vez; después el neto es exacto
   y Ramiro calcula la rentabilidad de cada producto.
4. Si el neto es negativo o el margen bajo: pasar a Ramiro (`ml_trabajadores
   accion=resultados trabajador=Ramiro`) para ver qué productos lo causan, y a
   `calculadora-ml` para el precio de equilibrio.
5. **Cierre para el contador**: el día 1 Carmen manda el cierre del mes anterior.
   Si el vendedor lo pide, ofrecer el documento o la planilla (o Drive, si el equipo
   está conectado: `ml_trabajadores accion=drive`).

## Reglas
- Es un resultado de gestión para decidir, NO reemplaza la contabilidad formal ni
  las declaraciones de impuestos: decirlo al entregar un cierre.
- Nunca inventar costos ni impuestos: si faltan, el número va marcado como parcial.
