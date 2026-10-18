---
name: mi-pagina-ml
description: Mantener "Mi página" de MercadoLibre (la página de tu tienda/marca) actualizada con el evento del momento — banner de la campaña o fecha en la que participás y tus productos destacados — y volverla a la normalidad cuando termina. Usar cuando pidan "actualizá Mi página", "poné el banner del CyberMonday", "sacá el banner", o cuando Clara avise que arrancó o terminó un evento.
---

# Mi página al día

## Requisito
`ml_agenda` del conector de MercadoLibre de Algoritmo Digital (v1.19.0+). Para
aplicar los cambios: el navegador del vendedor (Claude in Chrome o el navegador
integrado) con la sesión de MercadoLibre iniciada.

## Importante
Mi página **no tiene API pública**: se edita en el panel de MercadoLibre. Esta skill
prepara el kit con datos reales y lo aplica en el navegador del vendedor, mostrando
cada cambio antes de guardar. Nunca guardar sin su OK.

## Flujo
1. `ml_agenda accion=pagina` → el kit: evento activo (campaña en la que participa o
   fecha que decidió), texto del banner (el % OFF sale de sus publicaciones
   inscriptas: nunca inventar descuentos), productos a destacar en orden y qué va
   arriba. Si no hay evento: sus más vendidos de 30 días.
2. Mostrar el kit y preguntar: "¿Lo aplico así en Mi página?".
3. Con OK, en el navegador: entrar a su cuenta de MercadoLibre y buscar "Mi página"
   en el menú (según la cuenta aparece en la sección de marketing o de su marca).
   Si la cuenta no tiene Mi página habilitada, avisar y frenar.
4. Aplicar en este orden, con captura antes de guardar cada bloque:
   - Banner principal: el texto del kit. Si hay que subir imagen, usar la medida
     que pide el editor; ofrecer generarla con la skill `imagenes-ml` (estilo de la
     marca, texto grande para celular).
   - Sección/carrusel de destacados: las publicaciones del kit, en ese orden.
   - El evento arriba; las categorías de siempre debajo.
5. Guardar solo después del OK final y verificar la página publicada (abrirla
   como comprador).
6. **Cuando termina el evento** (Clara avisa 🏁): sacar el banner y volver a los
   destacados de siempre (sus más vendidos).

## Reglas
- Nada de datos de contacto, links externos ni promesas que la publicación no
  cumple (envío gratis, cuotas) en el banner.
- El % OFF del banner tiene que coincidir con los precios reales inscriptos.
- Si el navegador pide iniciar sesión o un código, pedirle al vendedor que lo haga él.
