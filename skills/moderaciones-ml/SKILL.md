---
name: moderaciones-ml
description: Moderaciones de MercadoLibre con Sole — publicaciones que ML pausó, puso en revisión o penalizó (infracciones, datos a corregir, portada de baja calidad), el motivo y cómo corregirlas para reactivarlas. Usar cuando pidan "me pausaron una publicación", "¿por qué está en revisión?", "infracción", o cuando Sole avise.
---

# Moderaciones — corregir y reactivar

## Requisito
`ml_trabajadores` y `ml_publicacion` del conector (v1.21.0+).

## Flujo
1. `ml_trabajadores accion=resultados trabajador=Sole` → publicaciones moderadas con
   estado y motivo en castellano.
2. Por motivo:
   - **Foto de portada de baja calidad**: portada con fondo blanco, producto centrado
     y nítido, sin textos ni logos. Con `imagenes-ml` se arma el resto del set; la
     portada la sube el vendedor.
   - **Esperando que corrijas datos**: completar lo que pide la ficha (marca, modelo,
     atributos obligatorios) en el panel de MercadoLibre.
   - **En revisión**: esperar (suele resolverse en 24-48 h); no duplicar la publicación.
   - **Producto prohibido / infracción**: leer la notificación de ML en el panel; si
     es un error, apelar desde ahí. No volver a publicar lo mismo (agrava la sanción).
3. Cuando se resuelve, Sole avisa ✅.

## Reglas
- Nunca recomendar publicar de nuevo para "esquivar" una moderación.
