---
name: vigilancia-ml
description: Seguimiento continuo de competidores y tendencias de MercadoLibre — armar la lista de vigilancia (vendedores rivales, publicaciones, búsquedas clave y trends) y correr el control periódico que reporta solo lo que cambió. Usar cuando pidan "vigilá a este competidor", "seguí esta publicación", "¿qué cambió en la competencia?", "novedades del mercado" o "qué se está buscando ahora".
---

# Vigilancia de competidores y tendencias

## Requisito
Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.

## Qué vigila (los 4 tipos)
- **vendedor**: un competidor por nickname o id — detecta publicaciones nuevas,
  bajas y cada cambio de precio con el %.
- **publicacion**: un ítem puntual (ajeno o propio) — detecta cambios de precio,
  estado y las **ventas estimadas** entre controles (delta de sold_quantity).
- **busqueda**: una keyword — detecta cambios de líder del top 10, precio del
  líder y entradas nuevas.
- **tendencias**: el sitio o una categoría — detecta keywords que entraron,
  salieron o escalaron en el top 20 de búsquedas.

## Flujo de armado (una vez)
1. Preguntar quiénes son los 2-4 competidores directos y las 2-3 búsquedas
   donde se juega su venta (si no sabe, proponé con `ml_buscar` sobre sus
   productos principales).
2. Cargar cada uno con `ml_vigilar accion=agregar` (tipo + ref + `nota` con el
   porqué). Sumar `tendencias` de su categoría siempre.
3. Confirmar la lista con `ml_vigilar accion=listar`.

## Flujo del control periódico (la rutina)
1. Correr `ml_novedades_competencia`: devuelve SOLO lo que cambió.
2. Interpretar cada novedad en términos de acción, no de dato:
   - rival bajó precio → ver si nos saca el catálogo (`ml_precio_catalogo`) y
     validar margen con `ml_comisiones` antes de sugerir seguirlo.
   - rival publicó nuevo → ¿producto que nosotros no tenemos? proponer
     evaluarlo (y si es nuestro proveedor común, revisar costos).
   - publicación vigilada vendió ~N → estimar su ritmo diario y compararlo
     con el nuestro (`ml_visitas` + ventas propias).
   - keyword nueva en tendencias → ¿tenemos publicación atacándola? Si no,
     proponer crearla (skill copiar-publicaciones-ml) o ajustar títulos.
3. Cerrar con máximo 3 acciones concretas priorizadas por plata.
4. Las primeras corridas pueden decir "primer registro": explicar que la
   próxima ya compara.

## Reglas
- Nunca recomendar igualar un precio que dé margen negativo: mostrar el
  cálculo con `ml_comisiones`.
- Los datos son públicos de MercadoLibre; la lista vive solo en la
  computadora del usuario.
- Sugerir cadencia semanal (o diaria en fechas calientes tipo Hot Sale).
