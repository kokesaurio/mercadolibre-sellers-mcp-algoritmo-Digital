---
name: copiar-publicaciones-ml
description: Copiar o clonar publicaciones de MercadoLibre — duplicar entre las cuentas propias del vendedor (multicuenta) o crear una publicación nueva tomando otra como referencia. Usar cuando pidan "copiá esta publicación", "duplicala en la otra tienda", "creá una igual a esta" o "subí este producto como el de la competencia".
---

# Copiar publicaciones de MercadoLibre

## Requisito
Herramientas `ml_*` de un conector de MercadoLibre de Algoritmo Digital (este
repo o el premium con CRM). Si no están, indicá instalarlo según el README y frená.

## Los dos casos (regla legal primero)
1. **Entre cuentas propias** (ej. de la tienda A a la tienda B del mismo
   vendedor): se clona TODO tal cual con `ml_crear_publicacion` +
   `copiar_de`, eligiendo la cuenta destino con `cuenta`.
2. **Tomando de referencia una publicación ajena** (competencia): NUNCA
   clonar. Fotos, textos y marca ajenos infringen derechos y MercadoLibre
   suspende por eso. Usá la ajena solo para leer categoría, atributos y
   precio de mercado; el título y la descripción se REDACTAN nuevos, y las
   fotos las aporta el usuario (pedíselas). Si la publicación es de catálogo
   con marca registrada, adverti que solo puede publicar si revende esa marca
   con producto original.

## Flujo
1. Identificar origen y destino: `ml_cuentas` para ver las tiendas; si el
   usuario no aclaró a qué cuenta va, preguntá (nunca adivines destino).
2. Leer el origen con `ml_publicacion` y mostrarlo resumido.
3. Proponer el borrador ANTES de crear: título (≤60, Producto + Marca +
   Modelo + atributo clave, sin adjetivos vacíos), precio (si es entre
   cuentas, mismo precio salvo pedido contrario; si es referencia,
   validá margen con `ml_comisiones`), stock inicial.
4. Confirmación explícita del usuario con el borrador a la vista.
5. Crear con `ml_crear_publicacion` (caso 1: `copiar_de` + overrides;
   caso 2: campos nuevos + `imagenes` del usuario). Devolver el link.
6. Ofrecer el siguiente paso: revisarla con la skill
   `revisar-publicaciones-aldi` antes de meterle tráfico.

## Reglas
- Escrituras SIEMPRE con confirmación previa por ítem; nunca en lote sin
  listar cada una.
- Copias masivas: máximo 5 por tanda, mostrando el resultado de cada una.
- Si `ML_SOLO_LECTURA=1` está activo, explicá que la creación está
  desactivada por configuración.
