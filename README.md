# MCP de MercadoLibre para vendedores — conectá tu tienda a Claude sin servidor

**Palabras clave:** MCP MercadoLibre · MercadoLibre Claude · conectar MercadoLibre a Claude · API MercadoLibre IA · Model Context Protocol MercadoLibre · vendedores MercadoLibre · automatizar MercadoLibre con IA

Conectá tu cuenta de MercadoLibre a Claude y preguntale en lenguaje natural:
*"¿cómo vienen las ventas?"*, *"¿qué preguntas tengo sin responder?"*, *"¿estoy
ganando el catálogo?"*, *"¿qué promociones me está ofreciendo MercadoLibre?"*.

**16 herramientas · multicuenta (varias tiendas, con consolidado) · sin servidor propio · tokens guardados solo en tu computadora
· hecho por [Algoritmo Digital](https://algoritmodigital.com.ar), consultora
especializada en MercadoLibre.**

```text
Claude ──MCP──► este conector ──OAuth 2.0 + PKCE──► API oficial de MercadoLibre
```

## Por qué este y no otro

| | Este conector | Alternativas típicas |
| --- | --- | --- |
| Onboarding | **Guiado desde cero**: `ml_conectar` te da el link, autorizás y pegás el código. Listo. | Asumen que ya tenés los tokens de ML (conseguirlos es la parte difícil) o exigen una base Supabase |
| Infraestructura | **Ninguna**: tokens en un archivo local (0600), refresh automático serializado | Backend propio, Supabase o VPS |
| Idioma | Castellano, pensado para vendedores | Inglés técnico, pensado para developers |
| Seguridad | PKCE, escrituras opcionales (`ML_SOLO_LECTURA=1` las desactiva), sin telemetría | Varía |
| Pruebas | Suite E2E de 21 casos contra un MercadoLibre simulado (`npm test`) | Rara vez |
| Skills | 5 skills de Claude incluidas (reportes, preguntas, competencia, publicidad, optimización) | No |

¿Tenés varias tiendas, querés rentabilidad real con tus costos, caja de
MercadoPago y vigilancia de competidores gestionada? Eso es nuestro
[conector premium con CRM](https://github.com/kokesaurio/mercadolibre-algoritmodigital)
— este conector directo es gratis y para cualquier vendedor.

## Instalación (5 minutos, sin VPS)

### 1. Creá tu aplicación gratis en MercadoLibre

1. Entrá a [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar) → **Mis aplicaciones** → **Crear aplicación**.
2. Nombre: el que quieras (ej. "Mi conector Claude").
3. En **Redirect URI** pegá exactamente: `https://kokesaurio.github.io/mercadolibre-sellers-mcp-algoritmo-Digital/conectar.html`
4. En **Scopes** marcá `read`, `write` y `offline_access` (offline_access es el que permite que la conexión no se corte cada 6 horas).
5. Guardá y anotá el **App ID** y el **Secret Key**.

### 2. Agregalo a Claude

**Claude Desktop** — en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital"],
      "env": {
        "ML_APP_ID": "TU_APP_ID",
        "ML_APP_SECRET": "TU_SECRET_KEY"
      }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add mercadolibre \
  -e ML_APP_ID=TU_APP_ID -e ML_APP_SECRET=TU_SECRET_KEY \
  -- npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital
```

### 3. Conectá tu cuenta

Reiniciá Claude y decile: **"conectá mi cuenta de MercadoLibre"**. Te va a dar un
link → autorizás con tu usuario de ML → la página te muestra un código → se lo
pegás a Claude. Una sola vez: después el conector renueva la sesión solo.

## Herramientas (16)

| Herramienta | Qué hace |
| --- | --- |
| ml_conectar / ml_cuentas / ml_desconectar | Vincular varias tiendas, elegir la predeterminada (⭐) y desconectar |
| ml_ordenes | Ventas con filtros de fecha y estado |
| ml_metricas | Facturación, unidades y ticket vs período anterior; con `cuenta="todas"` consolida todas tus tiendas |
| ml_envios | Estado y tracking del envío de una orden |
| ml_publicaciones / ml_publicacion | Tus publicaciones y su detalle |
| ml_visitas | Tráfico de una publicación |
| ml_actualizar_publicacion ✏️ | Cambiar precio, stock o pausar/activar |
| ml_preguntas / ml_responder_pregunta ✏️ | Ver y responder preguntas de compradores |
| ml_comisiones | Cuánto cobra ML por vender a un precio dado |
| ml_precio_catalogo | Si ganás la buy box del catálogo y qué precio la gana |
| ml_buscar | Espiar competencia y precios de mercado |
| ml_reputacion | Color, reclamos, demoras y cancelaciones |
| ml_promociones / ml_aceptar_promocion ✏️ | Promociones ofrecidas y aceptación por ítem |
| ml_tendencias | Qué está buscando la gente en ML |

✏️ = escribe en tu tienda real. Claude siempre pide confirmación antes, y con
`ML_SOLO_LECTURA=1` esas herramientas directamente no existen.

## Skills incluidas

En [`skills/`](skills/) hay 5 skills para Claude (Configuración → Capacidades →
Skills) que convierten estas herramientas en flujos de trabajo: reporte de
ventas, despacho de preguntas, análisis de competencia, publicidad/promociones y
optimización de publicaciones.

## Varias tiendas

Corré `ml_conectar` una vez por cada cuenta. Todas las herramientas aceptan
`cuenta` (el user_id) para elegir tienda; sin indicarla se usa la
**predeterminada** (⭐, se cambia con `ml_cuentas`), y si hay varias sin
predeterminada el conector pide elegir en vez de adivinar — nunca opera en la
tienda equivocada. *"¿Cómo vienen las ventas de todas las tiendas?"* usa el
consolidado.

## Seguridad

- OAuth 2.0 **con PKCE**; los tokens viven en `~/.meli-sellers-mcp/cuentas.json` con permisos 0600, en tu máquina y en ningún otro lado.
- El refresh token de ML es de un solo uso: el conector serializa los refresh (single-flight) para que dos llamadas concurrentes no revoquen tu cuenta.
- La página del código de autorización es estática (GitHub Pages) y no envía nada a ningún servidor.
- Cero telemetría, cero base de datos externa.

## Desarrollo en el entorno de Claude

```bash
npm install
npm test      # 21 pruebas E2E contra un MercadoLibre simulado
npm run dev   # levanta el simulado en :9990 (conectar con code CODE-OK)
```

Regla para contribuir (humano o IA): todo cambio deja `npm test` en verde, y
cada funcionalidad nueva suma su caso a `dev/entorno.js`.

## ¿Querés más?

Algoritmo Digital hace [consultoría, gestión de cuentas y desarrollo a medida
sobre MercadoLibre](https://algoritmodigital.com.ar) hace más de 15 años.
Escribinos: [WhatsApp](https://wa.me/5491177166060?text=Hola!%20Vengo%20del%20conector%20MCP%20de%20MercadoLibre%20(GitHub)...)

## Licencia

MIT — Algoritmo Digital.
