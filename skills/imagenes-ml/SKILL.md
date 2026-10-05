---
name: imagenes-ml
description: Generar el set completo de imágenes de venta para publicaciones de MercadoLibre con el método de Algoritmo Digital — desde la foto 2 (la portada la hace el vendedor), orden de publicación definido, solo datos confirmados, formato cuadrado, y las reglas de imágenes de ML. Usar cuando pidan "armame las imágenes de la publicación", "fotos para MercadoLibre", "infografía de medidas" o mejorar las imágenes de un producto.
---

# Imágenes de venta para MercadoLibre — método Algoritmo Digital

## El método (seguir SIEMPRE estos 7 pasos, en orden)

### 1. Reviso el producto y sus referencias
Las fotos que pasa el vendedor MANDAN: respetar forma, color, proporciones,
botones y accesorios exactos. Las referencias de Amazon, Alibaba o MercadoLibre
sirven solo para ideas de presentación, y únicamente si corresponden al MISMO
modelo. Si hay conector `ml_*`, traer título y atributos con `ml_publicacion`.

### 2. Separo los datos confirmados
Revisar medidas, funciones, materiales y contenido. Lo que falte se le marca al
vendedor y se pregunta. NUNCA inventar autonomía, potencia, compatibilidad ni
accesorios: dato no confirmado = dato que no va en la imagen.

### 3. Defino cuántas imágenes necesita
**El set fijo de 4 se hace SIEMPRE**: beneficio principal (foto 2),
características (foto 4), medidas (foto 5) y qué incluye (foto 6) — las 4
plantillas del repo. Por encima de eso, la cantidad depende del producto y del
pedido: no son siempre nueve, cada imagen extra tiene que explicar algo
distinto — nada de rellenar con fotos repetidas.

### 4. Organizo el orden de publicación
La portada (foto 1) la hace el vendedor: el trabajo arranca SIEMPRE en la
foto 2. Orden base (si el vendedor pasa un orden específico, se sigue ese):

| Foto | Qué comunica |
| --- | --- |
| 2 | Beneficio principal |
| 3 | Producto en uso |
| 4 | Características o diferencial |
| 5 | Medidas y compatibilidad |
| 6 | Qué incluye |
| 7 | Segundo beneficio o funcionamiento |
| 8 | Detalles importantes |
| 9–10 | Otro uso o cierre, solo cuando aporte |

### 5. Diseño cada pieza por separado — con las FOTOS DE LA PUBLICACIÓN
Formato cuadrado (1200×1200), producto protagonista y composiciones variadas.
Las fotos reales se toman de la propia publicación: `ml_publicacion` devuelve
las URLs (campo **Fotos**) — descargar la mejor (producto entero, fondo limpio)
y usarla en las plantillas. El set fijo de 4 se genera con el generador del
repo, una línea por imagen:

```bash
python3 plantillas/generar.py --plantilla beneficio       --datos datos.json --foto foto-publicacion.png --salida foto-2-beneficio.png
python3 plantillas/generar.py --plantilla caracteristicas --datos datos.json --foto foto-publicacion.png --salida foto-4-caracteristicas.png
python3 plantillas/generar.py --plantilla medidas         --datos datos.json --foto foto-publicacion.png --salida foto-5-medidas.png
python3 plantillas/generar.py --plantilla incluye         --datos datos.json --salida foto-6-incluye.png
```

El generador incrusta la foto en el lugar correcto de cada plantilla y avisa si
queda algún campo sin dato.

### 6. Genero, VISUALIZO y reviso
Si el entorno tiene generación de imágenes, usarla con las fotos del vendedor
como referencia para las piezas de uso real; el set fijo de 4 sale del
generador. SIEMPRE mostrarle al usuario las imágenes generadas (visualizarlas
en la conversación) antes de dar por cerrado el set, para que apruebe los
cambios. ANTES de entregar, revisar
una por una: ortografía, cantidades, parecido con el modelo real, conexiones y
coherencia entre lo que dice el texto y lo que muestra la imagen. Corregir lo
detectado y volver a revisar.

### 7. Entrego agrupadas y numeradas
Primero todas las de un producto en su orden (foto-2, foto-3, …); después las
del siguiente. Separadas, sin portada y sin mezclar productos.

## Reglas de MercadoLibre (se chequean en el paso 6)
- PROHIBIDO siempre: teléfonos, mails, redes, links, QR o cualquier dato de contacto.
- Nada de "OFERTA", "el mejor precio", "envío gratis" ni precios: penaliza.
- Texto grande y de alto contraste: legible en la miniatura del celular.
- La portada del vendedor debe ser fondo blanco puro, solo el producto, sin
  texto ni logos — si no cumple, marcárselo como lo primero a arreglar.
- En publicaciones de catálogo las fotos las define MercadoLibre: esto aplica a
  publicaciones propias.
- No usar fotos ni textos de publicaciones ajenas (infracción + suspensión).
