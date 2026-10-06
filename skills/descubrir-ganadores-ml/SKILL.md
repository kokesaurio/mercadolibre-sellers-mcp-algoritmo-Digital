---
name: descubrir-ganadores-ml
description: Descubrir artículos ganadores en MercadoLibre con datos reales de la API — ranking oficial de más vendidos por categoría (highlights), tendencias de búsqueda y análisis de mercado por keyword (competencia, precios, dominancia de vendedores). Usar cuando pregunten "qué conviene vender", "qué está funcionando", "buscá productos ganadores", "¿este producto tiene mercado?" o antes de importar/fabricar/publicar algo nuevo.
---

# Descubrir artículos ganadores

## Qué responde
"¿Qué conviene vender?" con datos de la API, no con humo: qué se vende (ranking
oficial), qué se busca (tendencias) y qué tan peleado está (análisis de la
keyword). La decisión final siempre se valida por margen.

## Flujo

### 1. Arrancar por la demanda
- Con una categoría en mente: `ml_descubrir_ganadores categoria=MLA...` →
  ranking oficial de más vendidos (highlights de MercadoLibre) + qué busca la
  gente en esa categoría. Si el usuario no sabe el ID de la categoría, sacarlo
  de una publicación propia (`ml_publicacion`) o de `ml_buscar`.
- Sin categoría: `ml_tendencias` del sitio para ver qué está pidiendo la gente
  y elegir 2-3 keywords candidatas.

### 2. Medir el mercado de cada candidata
`ml_descubrir_ganadores busqueda="keyword"` → competencia (cuántos publican),
rango y mediana de precios, % con envío gratis, si está en tendencias
(demanda validada) y si el top tiene dueños o está repartido. La señal:
- 🟢 ALTA: en tendencias + top repartido → ventana para entrar.
- 🟡 MEDIA: hay demanda pero 1-2 vendedores dominan → entrar diferenciado
  (mejor ficha, FULL, set/combo), no de frente.
- ⚪ A validar: no está en tendencias hoy → mirar la categoría y estacionalidad.

### 3. Validar el negocio antes de entusiasmarse
- `ml_comisiones` al precio mediana → ¿queda margen con tu costo? Pedir el
  costo al usuario; nunca inventarlo.
- `ml_precio_catalogo` si es producto de catálogo → qué precio gana la buy box.
- Regla: demanda sin margen no es un ganador, es una trampa.

### 4. Dejarlo vigilado
Las candidatas que pasan el filtro van a la base: `ml_vigilar` (busqueda y/o el
líder como vendedor) → cada control de `ml_novedades_competencia` suma un punto
al historial, y `ml_historial_competencia` muestra la evolución (precios,
líder, ventas del rival) para confirmar la tendencia antes de invertir.

### 5. Si decide entrar
Encadenar: copiar-publicaciones-ml (crear la publicación) → imagenes-ml (set
de 4) → video/ugc → publicidad-ml con regla ACOS vs margen.

## Reglas
- Solo datos que la API devuelve: si un dato no está (ej. ventas exactas de
  terceros), se dice "estimado" o no se dice — nunca se inventa.
- Presentar máximo 3-5 candidatas por tanda, rankeadas, con su señal y su
  "por qué".
- Recordar estacionalidad: un ganador de diciembre puede ser un muerto de
  marzo — el historial de vigilancia es el antídoto.
