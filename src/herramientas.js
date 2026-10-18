// src/herramientas.js — Herramientas MCP para vendedores, contra la API oficial de ML.
import { z } from 'zod';
import { MeliClient, MeliError, listarCuentas, urlDeAutorizacion, canjearCode, borrarCuenta, fijarPredeterminada } from './meli.js';
import { VERSION, chequearActualizacion } from './version.js';
import { leerCerebro, saberDe, aprender, olvidar } from './cerebro.js';
import { armarResultados, resultadosEnMarkdown, conectarDrive, desconectarDrive, configDrive, claveDrive, exportarADrive, detectarCarpetaDrive, CARPETA_NOMBRE } from './resultados.js';
import { auditarItem } from './auditoria.js';
import { faltantes, agrupar, preguntasRespondidas, armarDescripcion, INICIO as FAQ_INICIO } from './faq.js';
import { estadoDB, leerMediciones, precioSinCambiosDesde, backupDB, RETENCION_DIAS, NODE_MINIMO } from './db.js';
import { EQUIPO, IDS, etiqueta, resumenAlertas, resolverTrabajador, leerEquipo, asignarTarea, quitarTarea, tareasDe, actualizarEquipo, correrCiclo, leerBandeja, quienCorre, INTERVALO_MINIMO } from './trabajadores.js';
import { leerVigilancia, agregarObjetivo, quitarObjetivo, claveDe, tomarSnapshot, compararSnapshots, guardarVigilancia, registrarHistorial, leerHistorial } from './vigilancia.js';

const money = (n, moneda = '$') => n == null ? '—' : `${moneda} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const cadaCuanto = (min) => min >= 1440 && min % 1440 === 0 ? `cada ${min / 1440} día${min === 1440 ? '' : 's'}` : min >= 60 && min % 60 === 0 ? `cada ${min / 60} h` : `cada ${min} min`;
const sinAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const cliente = (args) => new MeliClient({ userId: args?.cuenta });
const cuentaParam = { cuenta: z.string().optional().describe('user_id de la cuenta de ML si hay varias conectadas (ver ml_cuentas)') };

async function sellerId(c) { return (await c.get('/users/me')).id; }

export const TOOLS = [
  // ───────────────────────────── Conexión ─────────────────────────────
  {
    name: 'ml_conectar', title: 'Conectar cuenta de MercadoLibre', readOnly: true,
    description: 'Vincula una cuenta de MercadoLibre. Sin argumentos devuelve la URL para autorizar en el navegador; con `code` (el código que muestra la página al autorizar) completa la conexión. Requiere ML_APP_ID y ML_APP_SECRET configurados.',
    schema: { code: z.string().optional().describe('Código que devolvió MercadoLibre al autorizar'), sitio: z.string().optional().describe('País: MLA (Argentina, default), MLB, MLM, MLC, MCO, etc.') },
    async run(args) {
      const appId = process.env.ML_APP_ID, appSecret = process.env.ML_APP_SECRET;
      if (!appId || !appSecret) return 'Faltan ML_APP_ID y ML_APP_SECRET en la configuración. Creá tu aplicación gratis en developers.mercadolibre.com.ar (guía en el README) y agregá esas dos variables.';
      if (!args.code) {
        const redirectUri = process.env.ML_REDIRECT_URI || 'https://kokesaurio.github.io/mercadolibre-sellers-mcp-algoritmo-Digital/conectar.html';
        const url = urlDeAutorizacion({ appId, sitio: args.sitio || process.env.ML_SITE || 'MLA', redirectUri });
        return `Abrí este link, inicia sesión con tu cuenta de MercadoLibre y autorizá:\n\n${url}\n\nAl terminar vas a ver un código: pasámelo y completo la conexión (ml_conectar con code).\n\nImportante: la redirect URI de tu app en el DevCenter tiene que incluir exactamente:\n${redirectUri}`;
      }
      const r = await canjearCode({ appId, appSecret, code: args.code });
      return `✅ Cuenta conectada: **${r.nickname}** (${r.sitio}, user_id ${r.user_id}). Ya podés pedirme ventas, publicaciones, preguntas y más.\n\n⭐ Este conector es gratis: si te sirve, dejanos una estrella en GitHub — hace que más vendedores lo encuentren: https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital`;
    },
  },
  {
    name: 'ml_cuentas', title: 'Cuentas conectadas', readOnly: true,
    description: 'Lista las cuentas de MercadoLibre conectadas (soporta varias tiendas). Con `predeterminada` fija cuál usar cuando no se indica cuenta.',
    schema: { predeterminada: z.string().optional().describe('user_id de la cuenta a fijar como predeterminada') },
    async run(args) {
      let aviso = '';
      if (args.predeterminada) aviso = `✅ **${fijarPredeterminada(args.predeterminada)}** quedó como cuenta predeterminada.\n\n`;
      const cs = listarCuentas();
      if (!cs.length) return 'No hay cuentas conectadas todavía. Usá ml_conectar para vincular la primera.';
      return aviso + '## Cuentas conectadas\n' + cs.map((c) => `- **${c.nickname}** (${c.sitio}) — user_id ${c.user_id}${c.predeterminada ? ' · ⭐ predeterminada' : ''}`).join('\n') + '\n\nPara conectar otra tienda: ml_conectar de nuevo.';
    },
  },
  {
    name: 'ml_desconectar', title: 'Desconectar cuenta', readOnly: false,
    description: 'Elimina los tokens guardados de una cuenta (deja de estar conectada en esta computadora).',
    schema: { cuenta: z.string().describe('user_id de la cuenta a desconectar') },
    async run(args) { return borrarCuenta(args.cuenta) ? `Cuenta ${args.cuenta} desconectada y tokens borrados.` : `La cuenta ${args.cuenta} no estaba conectada.`; },
  },

  {
    name: 'ml_version', title: 'Versión del conector', readOnly: true,
    description: 'Muestra la versión instalada del conector, chequea si hay una actualización publicada y explica cómo actualizar.',
    schema: {},
    async run() {
      const e = await chequearActualizacion({ forzar: true });
      if (!e.remota) return `Conector de MercadoLibre de Algoritmo Digital — versión instalada: **v${VERSION}**. No pude consultar si hay una versión nueva (sin conexión a GitHub): reintentá más tarde.`;
      if (!e.hayNueva) return `Conector de MercadoLibre de Algoritmo Digital — versión instalada: **v${VERSION}** ✅ (es la última publicada).\n⭐ ¿Te está sirviendo? Una estrella en GitHub nos ayuda un montón: https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital`;
      return [`Conector de MercadoLibre de Algoritmo Digital`,
        `- Instalada: v${VERSION} · **Última publicada: v${e.remota}** 📦`,
        `- Para actualizar: cerrá Claude, corré en la terminal \`npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital actualizar\` y volvé a abrir Claude.`,
        `- Novedades: https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital/commits/main`].join('\n');
    },
  },
  // ──────────────────────── Ventas y métricas ────────────────────────
  {
    name: 'ml_ordenes', title: 'Órdenes de venta', readOnly: true,
    description: 'Lista las ventas (órdenes) del vendedor, de la más reciente a la más vieja. Filtrable por fecha y estado.',
    schema: { ...cuentaParam, dias: z.number().optional().describe('Últimos N días (default 7)'), estado: z.string().optional().describe('paid, cancelled, etc.'), limite: z.number().optional() },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      const desde = new Date(Date.now() - (args.dias ?? 7) * 86400000).toISOString();
      const r = await c.get('/orders/search', { seller: id, 'order.date_created.from': desde, 'order.status': args.estado, sort: 'date_desc', limit: args.limite ?? 20 });
      const os = r.results || [];
      if (!os.length) return `Sin órdenes en los últimos ${args.dias ?? 7} días.`;
      const filas = os.map((o) => {
        const it = o.order_items?.[0] || {};
        return `- **${o.id}** · ${new Date(o.date_created).toLocaleDateString('es-AR')} · ${it.item?.title ?? ''} x${it.quantity ?? 1} · ${money(o.total_amount, o.currency_id)} · ${o.status}`;
      });
      return `## Órdenes (${r.paging?.total ?? os.length} en total, mostrando ${os.length})\n` + filas.join('\n');
    },
  },
  {
    name: 'ml_panel_ventas', title: 'Panel de ventas', readOnly: true,
    description: 'El tablero del vendedor en una llamada: facturación de HOY y del MES, productos más vendidos del mes, reparto por método de envío (FULL/Flex/Colecta...) y dónde se concentran las ventas por provincia. Ideal para "¿cómo venimos hoy?" o el panel del mes.',
    schema: { ...cuentaParam },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
      const mes0 = new Date(hoy0.getFullYear(), hoy0.getMonth(), 1);
      // Una sola pasada: traigo las órdenes pagas del mes y filtro "hoy" en memoria
      const ordenes = [];
      let offset = 0;
      for (let p = 0; p < 8; p++) {
        const r = await c.get('/orders/search', { seller: id, 'order.status': 'paid', 'order.date_created.from': mes0.toISOString(), sort: 'date_desc', limit: 50, offset });
        ordenes.push(...(r.results || []));
        offset += 50;
        if (offset >= Math.min(r.paging?.total ?? 0, 400)) break;
      }
      const resumen = (lista) => {
        let total = 0, unidades = 0;
        for (const o of lista) { total += o.total_amount ?? 0; for (const it of o.order_items || []) unidades += it.quantity ?? 0; }
        return { total, unidades, cant: lista.length };
      };
      const deHoy = ordenes.filter((o) => new Date(o.date_created) >= hoy0);
      const [h, m] = [resumen(deHoy), resumen(ordenes)];
      // Top productos del mes
      const porProducto = {};
      for (const o of ordenes) for (const it of o.order_items || []) {
        const k = it.item?.title ?? it.item?.id ?? '¿?';
        porProducto[k] = porProducto[k] || { u: 0, plata: 0 };
        porProducto[k].u += it.quantity ?? 0;
        porProducto[k].plata += (it.unit_price ?? 0) * (it.quantity ?? 0) || 0;
      }
      const top = Object.entries(porProducto).sort((a, b) => b[1].u - a[1].u).slice(0, 5);
      // Envíos y geografía: muestra de hasta 30 órdenes del mes
      const NOMBRE_ENVIO = { fulfillment: 'FULL', self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Punto de despacho', xd_drop_off: 'Colecta', custom: 'A convenir', not_specified: 'Sin dato' };
      const envios = {}, provincias = {};
      const muestra = ordenes.slice(0, 30);
      for (const o of muestra) {
        try {
          const s = await c.get(`/orders/${o.id}/shipments`);
          const tipo = NOMBRE_ENVIO[s.logistic_type] ?? s.logistic_type ?? 'Sin dato';
          envios[tipo] = (envios[tipo] ?? 0) + 1;
          const prov = s.receiver_address?.state?.name;
          if (prov) provincias[prov] = (provincias[prov] ?? 0) + 1;
        } catch {}
      }
      const pctLinea = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, v]) => `${k} ${Math.round(v / Math.max(1, Object.values(obj).reduce((a, b) => a + b, 0)) * 100)}% (${v})`).join(' · ');
      const nombreMes = mes0.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      return [`# Panel de ventas — ${nombreMes}`,
        `📅 **Hoy:** ${money(h.total)} · ${h.cant} venta(s) · ${h.unidades} unidad(es)`,
        `🗓️ **Mes:** ${money(m.total)} · ${m.cant} venta(s) · ${m.unidades} unidad(es) · ticket prom. ${money(m.cant ? m.total / m.cant : 0)}`,
        top.length ? `\n🏆 **Más vendidos del mes**\n` + top.map(([t, v], i) => `${i + 1}. ${t} — ${v.u} u.${v.plata ? ` (${money(v.plata)})` : ''}`).join('\n') : '',
        Object.keys(envios).length ? `\n🚚 **Métodos de envío** (muestra de ${muestra.length}): ${pctLinea(envios, 5)}` : '',
        Object.keys(provincias).length ? `📍 **Dónde se concentran las ventas**: ${pctLinea(provincias, 5)}` : '',
      ].filter(Boolean).join('\n');
    },
  },
  {
    name: 'ml_metricas', title: 'Métricas de ventas', readOnly: true,
    description: 'Facturación, unidades y ticket promedio de un período, comparado contra el período anterior. Ideal para "¿cómo vienen las ventas?". Con cuenta="todas" consolida todas las tiendas conectadas.',
    schema: { ...cuentaParam, dias: z.number().optional().describe('Tamaño del período en días (default 7)') },
    async run(args) {
      const dias = args.dias ?? 7;
      if (args.cuenta === 'todas') {
        const cs = listarCuentas();
        if (cs.length < 2) return 'Hay una sola cuenta conectada: pedí las métricas sin cuenta="todas".';
        const partes = await Promise.all(cs.map(async (cta) => ({ nombre: cta.nickname, texto: await this.run({ dias, cuenta: String(cta.user_id) }) })));
        const total = partes.reduce((acc, p) => acc + (Number((p.texto.match(/Facturación:\*\* \$ ([\d.,]+)/)?.[1] || '0').replace(/\./g, '').replace(',', '.'))), 0);
        return `# Consolidado de ${cs.length} tiendas — últimos ${dias} días\n**Facturación total: ${money(total)}**\n\n` + partes.map((p) => `### ${p.nombre}\n${p.texto}`).join('\n\n');
      }
      const c = cliente(args); const id = await sellerId(c);
      const traer = async (desde, hasta) => {
        let total = 0, unidades = 0, cant = 0, offset = 0;
        for (let p = 0; p < 20; p++) {
          const r = await c.get('/orders/search', { seller: id, 'order.status': 'paid', 'order.date_created.from': desde.toISOString(), 'order.date_created.to': hasta.toISOString(), limit: 50, offset });
          for (const o of r.results || []) { total += o.total_amount ?? 0; cant++; for (const it of o.order_items || []) unidades += it.quantity ?? 0; }
          offset += 50;
          if (offset >= Math.min(r.paging?.total ?? 0, 1000)) break;
        }
        return { total, unidades, cant };
      };
      const ahora = new Date();
      const actual = await traer(new Date(ahora - dias * 86400000), ahora);
      const previo = await traer(new Date(ahora - 2 * dias * 86400000), new Date(ahora - dias * 86400000));
      const delta = (a, b) => b ? ` (${a >= b ? '↑' : '↓'} ${Math.abs(((a - b) / b) * 100).toFixed(1)}% vs período anterior)` : '';
      return [`## Últimos ${dias} días`,
        `- **Facturación:** ${money(actual.total)}${delta(actual.total, previo.total)}`,
        `- **Ventas:** ${actual.cant} órdenes · ${actual.unidades} unidades${delta(actual.cant, previo.cant)}`,
        `- **Ticket promedio:** ${money(actual.cant ? actual.total / actual.cant : 0)}`].join('\n');
    },
  },
  {
    name: 'ml_envios', title: 'Envío de una orden', readOnly: true,
    description: 'Estado del envío de una orden: tracking, estado y fechas.',
    schema: { ...cuentaParam, orden_id: z.string().describe('ID de la orden') },
    async run(args) {
      const c = cliente(args);
      const s = await c.get(`/orders/${args.orden_id}/shipments`);
      return `## Envío de la orden ${args.orden_id}\n- **Estado:** ${s.status ?? '—'} (${s.substatus ?? 'sin detalle'})\n- **Tracking:** ${s.tracking_number ?? '—'} (${s.tracking_method ?? ''})\n- **Modo:** ${s.logistic_type ?? s.mode ?? '—'}`;
    },
  },

  // ──────────────────────────── Publicaciones ────────────────────────────
  {
    name: 'ml_publicaciones', title: 'Mis publicaciones', readOnly: true,
    description: 'Lista las publicaciones del vendedor con precio, stock y estado.',
    schema: { ...cuentaParam, estado: z.string().optional().describe('active, paused, closed'), limite: z.number().optional() },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      const busqueda = await c.get(`/users/${id}/items/search`, { status: args.estado, limit: args.limite ?? 20 });
      const ids = busqueda.results || [];
      if (!ids.length) return 'No hay publicaciones con ese filtro.';
      const detalle = await c.get('/items', { ids: ids.join(','), attributes: 'id,title,price,currency_id,available_quantity,sold_quantity,status,permalink,catalog_listing' });
      const filas = (Array.isArray(detalle) ? detalle : []).map((d) => d.body).filter(Boolean)
        .map((b) => `- **${b.id}** · ${b.title} · ${money(b.price, b.currency_id)} · stock ${b.available_quantity} · vendidos ${b.sold_quantity} · ${b.status}${b.catalog_listing ? ' · catálogo' : ''}`);
      return `## Publicaciones (${busqueda.paging?.total ?? ids.length} en total)\n` + filas.join('\n');
    },
  },
  {
    name: 'ml_publicacion', title: 'Detalle de una publicación', readOnly: true,
    description: 'Detalle completo de una publicación: precio, stock, ventas, tipo, garantía, envío, link.',
    schema: { ...cuentaParam, item_id: z.string().describe('ID del ítem, ej: MLA123456789') },
    async run(args) {
      const c = cliente(args);
      const b = await c.get(`/items/${args.item_id}`);
      return [`## ${b.title}`,
        `- **Precio:** ${money(b.price, b.currency_id)} · **Stock:** ${b.available_quantity} · **Vendidos:** ${b.sold_quantity}`,
        `- **Estado:** ${b.status} · **Tipo:** ${b.listing_type_id}${b.catalog_listing ? ' · catálogo' : ''}`,
        `- **Envío:** ${b.shipping?.logistic_type ?? '—'}${b.shipping?.free_shipping ? ' · envío gratis' : ''}`,
        `- **Video:** ${b.video_id ? '✅ tiene' : '❌ sin video'}`,
        `- **Fotos:** ${(b.pictures || []).length}${b.pictures?.length ? ' — ' + b.pictures.slice(0, 4).map((p) => p.secure_url || p.url).join(' · ') : ''}`,
        `- **Link:** ${b.permalink}`].join('\n');
    },
  },
  {
    name: 'ml_visitas', title: 'Visitas de publicaciones', readOnly: true,
    description: 'Visitas de una publicación en una ventana de días, para medir tráfico y conversión.',
    schema: { ...cuentaParam, item_id: z.string(), dias: z.number().optional().describe('default 30') },
    async run(args) {
      const c = cliente(args);
      const r = await c.get(`/items/${args.item_id}/visits/time_window`, { last: args.dias ?? 30, unit: 'day' });
      return `**${args.item_id}**: ${r.total_visits ?? 0} visitas en los últimos ${args.dias ?? 30} días.`;
    },
  },
  {
    name: 'ml_actualizar_publicacion', title: 'Actualizar publicación', readOnly: false,
    description: 'MODIFICA una publicación real: precio, stock o estado (pausar/activar). Usar solo con confirmación explícita del usuario.',
    schema: { ...cuentaParam, item_id: z.string(), precio: z.number().optional(), stock: z.number().optional(), estado: z.enum(['active', 'paused']).optional() },
    async run(args) {
      const c = cliente(args);
      const cambios = {};
      if (args.precio != null) cambios.price = args.precio;
      if (args.stock != null) cambios.available_quantity = args.stock;
      if (args.estado) cambios.status = args.estado;
      if (!Object.keys(cambios).length) return 'No indicaste ningún cambio (precio, stock o estado).';
      const b = await c.put(`/items/${args.item_id}`, cambios);
      return `✅ **${args.item_id}** actualizado: precio ${money(b.price, b.currency_id)}, stock ${b.available_quantity}, estado ${b.status}.`;
    },
  },

  {
    name: 'ml_crear_publicacion', title: 'Crear publicación', readOnly: false,
    description: 'CREA una publicación real en la tienda. Con `copiar_de` clona una publicación existente (título, categoría, atributos, fotos, descripción) y permite pisar título/precio/stock — ideal para duplicar entre tus propias cuentas. Usar solo con confirmación explícita del usuario.',
    schema: { ...cuentaParam,
      copiar_de: z.string().optional().describe('item_id a clonar (ej MLA123...). Solo copiar fotos/textos si son propios'),
      titulo: z.string().optional().describe('Título (≤60 caracteres). Obligatorio si no hay copiar_de'),
      precio: z.number().optional(), stock: z.number().optional(),
      categoria: z.string().optional().describe('ID de categoría ML (obligatorio sin copiar_de)'),
      descripcion: z.string().optional(), condicion: z.enum(['new', 'used']).optional(),
      tipo: z.string().optional().describe('listing_type_id, ej gold_special (Clásica)'),
      imagenes: z.array(z.string()).optional().describe('URLs de fotos propias') },
    async run(args) {
      const c = cliente(args);
      let base = {}, descripcionOrigen = null;
      if (args.copiar_de) {
        const o = await c.get(`/items/${args.copiar_de}`);
        try { descripcionOrigen = (await c.get(`/items/${args.copiar_de}/description`)).plain_text; } catch {}
        base = {
          title: o.title, category_id: o.category_id, price: o.price, currency_id: o.currency_id,
          available_quantity: o.available_quantity, condition: o.condition, listing_type_id: o.listing_type_id,
          pictures: (o.pictures || []).map((p) => ({ source: p.secure_url || p.url })),
          attributes: (o.attributes || []).filter((a) => a.value_name != null).map((a) => ({ id: a.id, value_name: a.value_name })),
          ...(o.sale_terms?.length ? { sale_terms: o.sale_terms } : {}),
        };
      }
      const cuerpo = {
        ...base,
        ...(args.titulo ? { title: args.titulo } : {}),
        ...(args.precio != null ? { price: args.precio } : {}),
        ...(args.stock != null ? { available_quantity: args.stock } : {}),
        ...(args.categoria ? { category_id: args.categoria } : {}),
        ...(args.condicion ? { condition: args.condicion } : {}),
        ...(args.tipo ? { listing_type_id: args.tipo } : {}),
        ...(args.imagenes?.length ? { pictures: args.imagenes.map((u) => ({ source: u })) } : {}),
      };
      if (!cuerpo.title || !cuerpo.category_id) return 'Falta título o categoría: pasá titulo y categoria, o usá copiar_de con una publicación existente.';
      if (cuerpo.currency_id == null) cuerpo.currency_id = 'ARS';
      if (cuerpo.condition == null) cuerpo.condition = 'new';
      if (cuerpo.listing_type_id == null) cuerpo.listing_type_id = 'gold_special';
      if (cuerpo.available_quantity == null) cuerpo.available_quantity = 1;
      const nuevo = await c.post('/items', cuerpo);
      const texto = args.descripcion ?? descripcionOrigen;
      if (texto) { try { await c.post(`/items/${nuevo.id}/description`, { plain_text: texto }); } catch {} }
      return `✅ Publicación creada: **${nuevo.id}** — ${nuevo.title ?? cuerpo.title} a ${money(nuevo.price ?? cuerpo.price, cuerpo.currency_id)}\n${nuevo.permalink ?? ''}\nQueda en estado ${nuevo.status ?? 'active'}: revisala en tu panel de MercadoLibre.`;
    },
  },
  // ───────────────────────────── Preguntas ─────────────────────────────
  {
    name: 'ml_preguntas', title: 'Preguntas de compradores', readOnly: true,
    description: 'Preguntas de compradores; por defecto las pendientes de respuesta.',
    schema: { ...cuentaParam, estado: z.string().optional().describe('UNANSWERED (default) o ANSWERED'), limite: z.number().optional() },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      const r = await c.get('/questions/search', { seller_id: id, status: args.estado ?? 'UNANSWERED', limit: args.limite ?? 15, sort_fields: 'date_created', sort_types: 'DESC', api_version: 4 });
      const qs = r.questions || [];
      if (!qs.length) return '🎉 No hay preguntas pendientes.';
      const filas = await Promise.all(qs.map(async (q) => {
        let titulo = q.item_id;
        try { titulo = (await c.get(`/items/${q.item_id}`, {})).title; } catch {}
        return `- **[${q.id}]** en "${titulo}": "${q.text}"`;
      }));
      return `## Preguntas ${args.estado === 'ANSWERED' ? 'respondidas' : 'pendientes'} (${r.total ?? qs.length})\n` + filas.join('\n');
    },
  },
  {
    name: 'ml_responder_pregunta', title: 'Responder pregunta', readOnly: false,
    description: 'PUBLICA una respuesta real y visible a una pregunta de comprador. Irreversible: usar solo con el texto confirmado por el usuario.',
    schema: { ...cuentaParam, pregunta_id: z.string(), texto: z.string().describe('Respuesta a publicar (sin datos de contacto: ML lo penaliza)') },
    async run(args) {
      const c = cliente(args);
      await c.post('/answers', { question_id: Number(args.pregunta_id), text: args.texto });
      return `✅ Respuesta publicada a la pregunta ${args.pregunta_id}.`;
    },
  },

  // ───────────────── Precios, competencia y comisiones ─────────────────
  {
    name: 'ml_comisiones', title: 'Comisiones y costos de venta', readOnly: true,
    description: 'Cuánto cobra MercadoLibre por vender a un precio dado (comisión por tipo de publicación), para calcular márgenes.',
    schema: { ...cuentaParam, precio: z.number(), categoria: z.string().optional().describe('ID de categoría, ej MLA1055'), sitio: z.string().optional() },
    async run(args) {
      const c = cliente(args);
      const sitio = args.sitio || (await c.get('/users/me')).site_id || 'MLA';
      const r = await c.get(`/sites/${sitio}/listing_prices`, { price: args.precio, category_id: args.categoria });
      const filas = (Array.isArray(r) ? r : []).map((t) => `- **${t.listing_type_name ?? t.listing_type_id}**: comisión ${money(t.sale_fee_amount)} (${t.sale_fee_details?.percentage_fee ?? '—'}% + fijo ${money(t.sale_fee_details?.fixed_fee ?? 0)})`);
      return `## Costo de vender a ${money(args.precio)} en ${sitio}\n` + (filas.join('\n') || 'Sin datos para ese precio.');
    },
  },
  {
    name: 'ml_precio_catalogo', title: 'Precio para ganar el catálogo', readOnly: true,
    description: 'Para publicaciones de catálogo: si estás ganando la buy box y qué precio necesitás para ganarla.',
    schema: { ...cuentaParam, item_id: z.string() },
    async run(args) {
      const c = cliente(args);
      const r = await c.get(`/items/${args.item_id}/price_to_win`, { version: 'v2' });
      const estado = r.status === 'winning' ? '🏆 GANANDO el catálogo' : `❌ Perdiendo (${r.status ?? 'sin datos'})`;
      return [`## ${args.item_id} — catálogo`, `- ${estado}`,
        `- **Tu precio:** ${money(r.current_price)} · **Precio para ganar:** ${money(r.price_to_win)}`,
        r.boosts?.length ? `- Factores además del precio: ${r.boosts.map((b) => b.id).join(', ')}` : ''].filter(Boolean).join('\n');
    },
  },
  {
    name: 'ml_buscar', title: 'Buscar en MercadoLibre', readOnly: true,
    description: 'Busca publicaciones públicas en MercadoLibre (para espiar competencia y precios de mercado).',
    schema: { ...cuentaParam, consulta: z.string().describe('Qué buscar, ej "termo acero 1 litro"'), limite: z.number().optional(), sitio: z.string().optional() },
    async run(args) {
      const c = cliente(args);
      const sitio = args.sitio || (await c.get('/users/me')).site_id || 'MLA';
      const r = await c.get(`/sites/${sitio}/search`, { q: args.consulta, limit: args.limite ?? 10 });
      const filas = (r.results || []).map((x) => `- ${x.title} · ${money(x.price, x.currency_id)} · vendedor ${x.seller?.nickname ?? x.seller?.id ?? '—'}${x.shipping?.free_shipping ? ' · envío gratis' : ''}`);
      return `## "${args.consulta}" en ${sitio} (${r.paging?.total ?? 0} resultados)\n` + (filas.join('\n') || 'Sin resultados.');
    },
  },
  {
    name: 'ml_reputacion', title: 'Reputación del vendedor', readOnly: true,
    description: 'Color de reputación, ventas y tasas de reclamos, demoras y cancelaciones.',
    schema: { ...cuentaParam },
    async run(args) {
      const c = cliente(args);
      const me = await c.get('/users/me');
      const rep = me.seller_reputation || {}; const m = rep.metrics || {};
      return [`## Reputación de ${me.nickname}`,
        `- **Nivel:** ${rep.level_id ?? '—'} ${rep.power_seller_status ? `· MercadoLíder: ${rep.power_seller_status}` : ''}`,
        `- **Ventas históricas:** ${rep.transactions?.total ?? '—'}`,
        `- **Reclamos:** ${((m.claims?.rate ?? 0) * 100).toFixed(2)}% · **Demoras:** ${((m.delayed_handling_time?.rate ?? 0) * 100).toFixed(2)}% · **Cancelaciones:** ${((m.cancellations?.rate ?? 0) * 100).toFixed(2)}%`].join('\n');
    },
  },

  // ───────────────────────────── Promociones ─────────────────────────────
  {
    name: 'ml_promociones', title: 'Promociones ofrecidas', readOnly: true,
    description: 'Campañas y promociones que MercadoLibre le ofrece al vendedor; con promocion_id y tipo, lista las publicaciones elegibles con su descuento.',
    schema: { ...cuentaParam, promocion_id: z.string().optional(), tipo: z.string().optional().describe('DEAL, DOD, MARKETPLACE_CAMPAIGN, etc. (viene en la lista)') },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      if (!args.promocion_id) {
        const r = await c.get(`/seller-promotions/users/${id}`, { app_version: 'v2' });
        const ps = r.results || [];
        if (!ps.length) return 'MercadoLibre no está ofreciendo promociones ahora.';
        return '## Promociones disponibles\n' + ps.map((p) => `- **${p.id}** · ${p.name ?? p.type} · tipo ${p.type} · ${p.status ?? ''}`).join('\n');
      }
      const r = await c.get(`/seller-promotions/promotions/${args.promocion_id}/items`, { promotion_type: args.tipo, app_version: 'v2' });
      const its = r.results || [];
      if (!its.length) return 'Esa promoción no tiene publicaciones elegibles.';
      const filas = its.map((i) => {
        const final = i.suggested_discounted_price ?? i.min_discounted_price ?? i.price;
        return `- **${i.id ?? i.item_id}** · ${money(i.original_price ?? i.price)} → ${money(final)} · pone ML: ${i.meli_percentage ?? 0}%`;
      });
      return `## Publicaciones elegibles (${its.length})\n` + filas.join('\n');
    },
  },
  {
    name: 'ml_aceptar_promocion', title: 'Aceptar promoción', readOnly: false,
    description: 'ACTIVA una publicación dentro de una promoción de MercadoLibre, al precio indicado. Visible para compradores: usar solo con confirmación explícita por ítem.',
    schema: { ...cuentaParam, item_id: z.string(), promocion_id: z.string(), tipo: z.string().describe('Tipo de la promoción (DEAL, DOD, etc.)'), precio_final: z.number().optional().describe('deal_price; si falta, ML usa el sugerido') },
    async run(args) {
      const c = cliente(args);
      const cuerpo = { promotion_id: args.promocion_id, promotion_type: args.tipo };
      if (args.precio_final != null) cuerpo.deal_price = args.precio_final;
      await c.post(`/seller-promotions/items/${args.item_id}`, cuerpo, { app_version: 'v2' });
      return `✅ ${args.item_id} aceptado en la promoción ${args.promocion_id}${args.precio_final != null ? ` a ${money(args.precio_final)}` : ''}.`;
    },
  },

  {
    name: 'ml_auditar_publicaciones', title: 'Auditar mis publicaciones', readOnly: true,
    description: 'Lista las publicaciones del vendedor con un semáforo de calidad y cómo mejorar cada una: título corto o con relleno, pocas fotos, sin descripción, sin envío gratis, stock crítico, catálogo perdido, publicación pausada — y si está ACTUALIZADA: días sin tocar, precio congelado, precio fuera de mercado, fotos de baja resolución, marca/modelo y garantía. (Lucía, la auditora del equipo de trabajadores, lo hace sola cada 15 días.) Devuelve las peores primero con la acción concreta. Ideal para "¿qué publicaciones tengo que mejorar?".',
    schema: { ...cuentaParam, limite: z.number().optional().describe('Cuántas auditar (default 10)'), estado: z.string().optional().describe('default active') },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      const busqueda = await c.get(`/users/${id}/items/search`, { status: args.estado ?? 'active', limit: args.limite ?? 10 });
      const ids = busqueda.results || [];
      if (!ids.length) return 'No hay publicaciones para auditar con ese filtro.';
      const sitio = (await c.get('/users/me')).site_id || 'MLA';
      const auditorias = [];
      for (const itemId of ids) {
        let desde = null; try { desde = precioSinCambiosDesde(itemId); } catch {}
        const a = await auditarItem(c, itemId, { sitio, sellerId: id, precioSinCambiosDesde: desde });
        auditorias.push({ ...a, problemas: a.problemas.map((p) => p.texto) });
      }
      auditorias.sort((a, b) => b.problemas.length - a.problemas.length);
      const filas = auditorias.map((a) => `### ${a.semaforo} ${a.id} — ${a.titulo}\n` + (a.problemas.length ? a.problemas.map((p) => '- ' + p).join('\n') : '- Sin problemas detectados en el checklist básico'));
      const rojas = auditorias.filter((a) => a.semaforo === '🔴').length, amarillas = auditorias.filter((a) => a.semaforo === '🟡').length;
      return `# Auditoría de publicaciones (${auditorias.length})\n**${rojas} 🔴 urgentes · ${amarillas} 🟡 mejorables · ${auditorias.length - rojas - amarillas} 🟢 OK**\n\n` + filas.join('\n\n') + '\n\n¿Aplico alguna mejora? Decime cuál y la hago con tu confirmación (precio/stock/estado por acá; títulos solo si la publicación no tiene ventas; fotos y descripción van por tu panel).';
    },
  },
  {
    name: 'ml_faq_descripcion', title: 'Preguntas frecuentes en la descripción', readOnly: false,
    description: 'Contempla las preguntas que te hacen los compradores en una publicación y las agrega a su descripción como "PREGUNTAS FRECUENTES", con TUS respuestas reales (nunca inventa). Agrupa las parecidas, prioriza las que más se repiten, descarta lo que cambia con el tiempo (stock, precio, cuotas, envíos) y toda respuesta con datos de contacto, y no repite lo que la descripción ya cubre. El bloque queda marcado: se puede actualizar cada quincena sin duplicar. Sin aplicar=true solo MUESTRA la propuesta; con aplicar=true modifica la descripción real (pedir confirmación antes). Con todas=true toma las publicaciones que Lucía marcó en su última auditoría.',
    schema: { ...cuentaParam,
      item_id: z.string().optional().describe('La publicación (MLA...)'),
      todas: z.boolean().optional().describe('Todas las publicaciones que Lucía marcó con preguntas repetidas faltantes en su última auditoría'),
      aplicar: z.boolean().optional().describe('true = escribir la descripción nueva en MercadoLibre (solo con confirmación explícita del vendedor)'),
      min_veces: z.number().optional().describe('Mínimo de veces que se repitió una pregunta para entrar (default 2; 1 = todas las respondidas)'),
      maximo: z.number().optional().describe('Máximo de preguntas en el bloque (default 8)'),
    },
    async run(args) {
      const minVeces = Math.max(1, Math.round(args.min_veces ?? 2)), maximo = Math.min(Math.max(1, Math.round(args.maximo ?? 8)), 15);
      let objetivos = [];
      if (args.item_id) {
        if (!/^[A-Z]{3}\d+$/i.test(args.item_id.trim())) return 'item_id inválido: tiene que ser como MLA123456789.';
        objetivos = [{ id: args.item_id.trim().toUpperCase(), cuenta: args.cuenta }];
      } else if (args.todas) {
        const d = leerEquipo();
        for (const [k, sn] of Object.entries(d.snapshots)) {
          if (!k.startsWith('auditor|')) continue;
          const cuentaTarea = (k.match(/@(\d+)$/) || [])[1];
          if (args.cuenta && cuentaTarea && cuentaTarea !== String(args.cuenta)) continue;
          for (const [id, x] of Object.entries(sn.datos.items || {})) if (x.codigos.includes('faq_faltante')) objetivos.push({ id, cuenta: cuentaTarea || args.cuenta });
        }
        objetivos = objetivos.filter((o, i, a) => a.findIndex((z) => z.id === o.id) === i).slice(0, 20);
        if (!objetivos.length) return 'Lucía no marcó publicaciones con preguntas repetidas faltantes en su última auditoría (o todavía no auditó: ml_trabajadores accion=correr trabajador=Lucía).';
      } else return 'Indicá item_id, o todas=true para las que marcó Lucía.';

      const salida = [];
      let aplicadas = 0;
      for (const o of objetivos) {
        const c = cliente({ cuenta: o.cuenta });
        let actual = '';
        try { actual = (await c.get(`/items/${o.id}/description`)).plain_text || ''; } catch {}
        const preguntas = await preguntasRespondidas(c, o.id, { maximo: 200 });
        const nuevas = faltantes(preguntas, actual, { minVeces, maximo });
        if (!nuevas.length) {
          salida.push(`### ${o.id}\n- ${preguntas.length ? `Revisé ${preguntas.length} pregunta(s) respondidas: ninguna se repite ${minVeces}+ veces sin estar ya cubierta en la descripción ✅` : 'Todavía no tiene preguntas respondidas.'}`);
          continue;
        }
        const nueva = armarDescripcion(actual, nuevas, { todas: agrupar(preguntas) });
        const total = (nueva.slice(nueva.indexOf(FAQ_INICIO)).match(/^¿/gm) || []).length;
        const lista = nuevas.map((g) => `- **${g.pregunta}** (${g.veces} ${g.veces === 1 ? 'vez' : 'veces'}) → ${g.respuesta}`).join('\n');
        if (!args.aplicar) {
          salida.push(`### ${o.id} — ${nuevas.length} pregunta(s) para sumar\n${lista}\n\n<details><summary>Así quedaría el bloque al final de la descripción</summary>\n\n\`\`\`\n${nueva.slice(nueva.indexOf(FAQ_INICIO))}\n\`\`\`\n</details>`);
          continue;
        }
        await c.put(`/items/${o.id}/description?api_version=2`, { plain_text: nueva });
        aplicadas++;
        salida.push(`### ✅ ${o.id} — descripción actualizada: ${nuevas.length} pregunta(s) nueva(s), ${total} en total en el bloque\n${lista}`);
      }
      const pie = args.aplicar
        ? `\n\n${aplicadas} descripción(es) actualizada(s). La próxima auditoría de Lucía ya no las marca, y si aparecen preguntas nuevas el bloque se actualiza sin duplicar.`
        : `\n\nEs una propuesta: no toqué nada. Las respuestas son las tuyas (limpias de saludos y firmas); descarté stock, precio, cuotas, envíos y cualquier dato de contacto. ¿Las aplico? (ml_faq_descripcion ${args.todas ? 'todas=true' : 'item_id=' + objetivos[0].id} aplicar=true)`;
      return `# Preguntas frecuentes → descripción\n\n` + salida.join('\n\n') + pie;
    },
  },
  // ─────────────────────────────── Cerebro ───────────────────────────────
  {
    name: 'ml_cerebro', title: 'El cerebro del conector (memoria del negocio)', readOnly: true,
    description: 'La base de datos local del negocio: guarda lo que el vendedor le enseña (costo de cada producto, % de impuestos, costo de envío, medidas, qué incluye, notas) y las demás herramientas lo usan solas — la calculadora de rentabilidad deja de preguntar lo que ya sabe. Todo queda en un archivo local de la máquina del vendedor, nunca sale de ahí. Acciones: guardar, ver, olvidar. Para datos del negocio entero (ej impuestos de todas las ventas), guardar sin item_id.',
    schema: {
      accion: z.enum(['guardar', 'ver', 'olvidar']).describe('guardar conocimiento, ver lo que sabe, u olvidar un producto'),
      item_id: z.string().optional().describe('Producto (MLA...) o SKU. Sin item_id, el dato es del negocio entero'),
      costo: z.number().min(0).optional().describe('Costo del producto'),
      impuestos_pct: z.number().min(0).max(60).optional().describe('% de impuestos sobre la venta'),
      costo_envio: z.number().min(0).optional().describe('Costo de envío por unidad a cargo del vendedor'),
      medidas: z.string().optional().describe('Medidas reales, ej "27 cm alto, 8,5 cm diámetro, 480 g"'),
      incluye: z.string().optional().describe('Qué incluye el paquete, separado por comas'),
      nota: z.string().optional().describe('Cualquier cosa que el vendedor quiera que Claude recuerde de este producto o del negocio'),
    },
    async run(args) {
      const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      if (args.accion === 'guardar') {
        const { accion, item_id, ...datos } = args;
        if (!Object.values(datos).some((v) => v !== undefined)) return 'Decime qué guardar: costo, impuestos_pct, costo_envio, medidas, incluye o una nota.';
        aprender(item_id || null, datos);
        const campos = Object.entries(datos).filter(([, v]) => v !== undefined).map(([k]) => k).join(', ');
        return `🧠 Guardado en el cerebro${item_id ? ` de **${item_id}**` : ' del **negocio** (vale para todos los productos que no tengan el dato propio)'}: ${campos}. Queda en tu máquina y las herramientas lo usan solas (la calculadora ya no te lo vuelve a preguntar).`;
      }
      if (args.accion === 'olvidar') {
        if (!args.item_id) return 'Indicá el item_id del producto a olvidar.';
        return olvidar(args.item_id) ? `🧠 Olvidado todo lo guardado de ${args.item_id}.` : `No había nada guardado de ${args.item_id}.`;
      }
      const d = leerCerebro();
      if (args.item_id) {
        const p = saberDe(args.item_id);
        const lineas = [];
        if (p.costo != null) lineas.push(`- Costo: ${dinero(p.costo)}`);
        if (p.impuestos_pct != null) lineas.push(`- Impuestos: ${p.impuestos_pct}%${d.productos[args.item_id]?.impuestos_pct == null ? ' (heredado del negocio)' : ''}`);
        if (p.costo_envio != null) lineas.push(`- Envío por unidad: ${dinero(p.costo_envio)}`);
        if (p.medidas) lineas.push(`- Medidas: ${p.medidas}`);
        if (p.incluye) lineas.push(`- Incluye: ${p.incluye}`);
        for (const n of p.notas || []) lineas.push(`- 📝 ${n.texto}`);
        return lineas.length ? `# 🧠 Lo que sé de ${args.item_id}\n` + lineas.join('\n') : `Todavía no sé nada de ${args.item_id}. Enseñame con ml_cerebro guardar (costo, impuestos, medidas, notas).`;
      }
      const prods = Object.keys(d.productos);
      const neg = [];
      if (d.negocio.impuestos_pct != null) neg.push(`- Impuestos del negocio: ${d.negocio.impuestos_pct}%`);
      if (d.negocio.costo_envio != null) neg.push(`- Envío por unidad (default): ${dinero(d.negocio.costo_envio)}`);
      for (const n of d.negocio.notas || []) neg.push(`- 📝 ${n.texto}`);
      return `# 🧠 El cerebro del conector\n\n## Negocio\n` + (neg.length ? neg.join('\n') : '- (nada guardado todavía)') +
        `\n\n## Productos con datos (${prods.length})\n` + (prods.length ? prods.map((id) => {
          const p = d.productos[id];
          return `- **${id}**: ${[p.costo != null ? 'costo ' + dinero(p.costo) : '', p.medidas ? 'medidas ✔' : '', p.incluye ? 'incluye ✔' : '', (p.notas?.length || 0) ? p.notas.length + ' nota(s)' : ''].filter(Boolean).join(' · ') || 'solo creado'}`;
        }).join('\n') : '- (ninguno)') +
        `\n\nTodo esto vive en tu máquina (cerebro.json) y nunca sale de ahí.`;
    },
  },
  // ───────────────────────── Publicidad y rentabilidad ─────────────────────────
  {
    name: 'ml_publicidad', title: 'Métricas de Product Ads en vivo', readOnly: true,
    description: 'Métricas de Product Ads al momento de la consulta: con item_id, el detalle del anuncio de esa publicación (inversión, impresiones, clics, CTR, CPC, ACOS, unidades y facturación por ads); sin item_id, las campañas del anunciante con su estado, presupuesto y resultados. Parámetro dias para el período (1 = hoy, default 30).',
    schema: { ...cuentaParam, item_id: z.string().optional(), dias: z.number().int().min(1).max(90).optional().describe('Período hacia atrás en días (1 = hoy). Default 30') },
    async run(args) {
      const c = cliente(args);
      const dias = args.dias ?? 30;
      const hasta = new Date(), desde = new Date(Date.now() - (dias - 1) * 86400000);
      const f = (d) => d.toISOString().slice(0, 10);
      const dinero = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      const qy = { date_from: f(desde), date_to: f(hasta), metrics: 'clicks,prints,cost,acos,cpc,units_quantity,total_amount' };
      if (args.item_id) {
        let r = null;
        for (const ruta of [`/advertising/product_ads/ads/${args.item_id}`, `/advertising/product_ads/items/${args.item_id}`]) {
          try { r = await c.get(ruta, qy); break; } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
        }
        if (!r) return `**${args.item_id}** no tiene métricas de Product Ads (no está en ninguna campaña, o la cuenta no tiene Product Ads habilitado). Se gestiona desde el panel de Publicidad de MercadoLibre.`;
        const m = r.metrics || r;
        const ctr = m.prints ? (m.clicks / m.prints * 100).toFixed(2) : '0';
        const cpc = m.cpc ?? (m.clicks ? m.cost / m.clicks : 0);
        return `# 📣 Product Ads de ${args.item_id} — últimos ${dias} día(s) (en vivo)\n` +
          `- **Inversión:** ${dinero(m.cost)}\n- **Impresiones:** ${Number(m.prints || 0).toLocaleString('es-AR')} · **Clics:** ${Number(m.clicks || 0).toLocaleString('es-AR')} (CTR ${ctr}%)\n` +
          `- **CPC:** ${dinero(cpc)}\n- **Ventas por ads:** ${m.units_quantity ?? 0} unidad(es) · ${dinero(m.total_amount)}\n` +
          `- **ACOS:** ${m.acos != null ? m.acos + '%' : 's/d'} (lo que te come la publicidad de cada venta)\n\n` +
          `¿El ACOS aguanta? Validalo contra tu margen real con ml_rentabilidad: ahí entra este gasto en el desglose del producto.`;
      }
      let campañas = null;
      try {
        const adv = await c.get('/advertising/advertisers', { product_id: 'PADS' });
        const a = adv.advertisers?.[0];
        campañas = await c.get('/advertising/product_ads/campaigns', a ? { advertiser_id: a.advertiser_id, ...qy } : qy);
      } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
      const lista = campañas?.results || campañas?.campaigns;
      if (!lista?.length) return 'La cuenta no tiene campañas de Product Ads visibles por API (o Product Ads no está habilitado). Se activa desde el panel de Publicidad de MercadoLibre.';
      const filas = lista.map((k) => {
        const m = k.metrics || {};
        return `| ${k.name || k.id} | ${k.status || '—'} | ${dinero(k.budget)} | ${dinero(m.cost)} | ${m.acos != null ? m.acos + '%' : '—'} | ${m.units_quantity ?? '—'} |`;
      });
      const total = lista.reduce((s, k) => s + Number(k.metrics?.cost || 0), 0);
      return `# 📣 Campañas de Product Ads — últimos ${dias} día(s) (en vivo)\n\n| Campaña | Estado | Presupuesto/día | Invertido | ACOS | Unidades |\n| --- | --- | --- | --- | --- | --- |\n` + filas.join('\n') +
        `\n\n**Inversión total del período:** ${dinero(total)}. Para ver una publicación puntual: ml_publicidad item_id=MLA... · Para saber si el ACOS cierra: ml_rentabilidad.`;
    },
  },
  {
    name: 'ml_rentabilidad', title: 'Calculadora de rentabilidad real', readOnly: true,
    description: 'El desglose real peso por peso de un producto: precio de venta MENOS comisión de MercadoLibre (tarifa real del tipo de publicación) MENOS publicidad por unidad (gasto de Product Ads en vivo del período) MENOS impuestos MENOS costo de envío MENOS costo del producto = ganancia neta y margen. Pide lo que falta (costo e impuestos NUNCA se inventan) y dice hasta qué ACOS aguanta el producto.',
    schema: { ...cuentaParam,
      item_id: z.string().optional().describe('Si se indica, trae precio, tipo de publicación y gasto de ads reales'),
      precio: z.number().positive().optional().describe('Precio de venta; si hay item_id se toma el de la publicación'),
      costo: z.number().min(0).optional().describe('Costo del producto (lo que te sale a vos) — SIEMPRE preguntarlo al usuario'),
      impuestos_pct: z.number().min(0).max(60).optional().describe('% de impuestos sobre el precio (IIBB, monotributo/IVA según su situación) — SIEMPRE preguntarlo'),
      costo_envio: z.number().min(0).optional().describe('Lo que paga el vendedor de envío por unidad (si ofrece envío gratis). Default 0'),
      dias_ads: z.number().int().min(1).max(90).optional().describe('Período para promediar la publicidad (default 30)') },
    async run(args) {
      const c = cliente(args);
      const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      let precio = args.precio, tipo = 'gold_special', titulo = null;
      if (args.item_id) {
        const b = await c.get(`/items/${args.item_id}`);
        precio = precio ?? b.price; tipo = b.listing_type_id || tipo; titulo = b.title;
      }
      // 🧠 El cerebro completa lo que el usuario no pasó, y aprende lo que sí pasó
      const sabido = args.item_id ? saberDe(args.item_id) : saberDe('__negocio__');
      const memoria = [];
      let costoFinal = args.costo, impuestosFinal = args.impuestos_pct, envioFinal = args.costo_envio;
      if (costoFinal == null && sabido.costo != null) { costoFinal = sabido.costo; memoria.push(`costo ${'$ ' + Number(sabido.costo).toLocaleString('es-AR')} guardado`); }
      if (impuestosFinal == null && sabido.impuestos_pct != null) { impuestosFinal = sabido.impuestos_pct; memoria.push(`impuestos ${sabido.impuestos_pct}% guardados`); }
      if (envioFinal == null && sabido.costo_envio != null) { envioFinal = sabido.costo_envio; memoria.push(`envío ${'$ ' + Number(sabido.costo_envio).toLocaleString('es-AR')} guardado`); }
      const faltan = [];
      if (!precio) faltan.push('el **precio de venta** (o pasame el item_id y lo traigo)');
      if (costoFinal == null) faltan.push('el **costo del producto** (lo que te sale a vos, con IVA si corresponde)');
      if (impuestosFinal == null) faltan.push('el **% de impuestos** sobre la venta (IIBB + monotributo o IVA según tu situación — si no lo sabés, tu contador lo tiene en 1 minuto)');
      if (faltan.length) return 'Para calcular la rentabilidad real me falta:\n- ' + faltan.join('\n- ') + '\n\nCon esos datos te doy el desglose peso por peso (y los guardo en el cerebro para no volver a preguntarlos).';
      // Aprender lo que vino nuevo
      const aprendido = {};
      if (args.costo != null && args.costo !== sabido.costo) aprendido.costo = args.costo;
      if (args.impuestos_pct != null && args.impuestos_pct !== sabido.impuestos_pct) aprendido.impuestos_pct = args.impuestos_pct;
      if (args.costo_envio != null && args.costo_envio !== sabido.costo_envio) aprendido.costo_envio = args.costo_envio;
      if (Object.keys(aprendido).length) aprender(args.item_id || null, aprendido);
      const sitio = (await c.get('/users/me')).site_id || 'MLA';
      let pct = 14, fijo = 0;
      try {
        const lp = await c.get(`/sites/${sitio}/listing_prices`, { price: precio });
        const fila = (Array.isArray(lp) ? lp : []).find((x) => x.listing_type_id === tipo) || (Array.isArray(lp) ? lp[0] : null);
        if (fila?.sale_fee_details) { pct = fila.sale_fee_details.percentage_fee ?? pct; fijo = fila.sale_fee_details.fixed_fee ?? 0; }
        else if (fila?.sale_fee_amount != null) { pct = null; fijo = fila.sale_fee_amount; }
      } catch {}
      const comision = pct != null ? precio * pct / 100 + fijo : fijo;
      // Publicidad por unidad: gasto de ads del período / unidades vendidas por ads
      let adsPorUnidad = 0, notaAds = 'sin campañas activas (o sin item_id): $ 0';
      if (args.item_id) {
        for (const ruta of [`/advertising/product_ads/ads/${args.item_id}`, `/advertising/product_ads/items/${args.item_id}`]) {
          try {
            const dias = args.dias_ads ?? 30;
            const r = await c.get(ruta, { date_from: new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10), metrics: 'cost,units_quantity' });
            const m = r.metrics || r;
            if (m.units_quantity > 0) { adsPorUnidad = m.cost / m.units_quantity; notaAds = `${dinero(m.cost)} en ${dias} días / ${m.units_quantity} ventas por ads`; }
            else if (m.cost > 0) { adsPorUnidad = m.cost; notaAds = `⚠️ ${dinero(m.cost)} gastados SIN ventas por ads en ${dias} días`; }
            break;
          } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
        }
      }
      const envio = envioFinal ?? 0;
      const impuestos = precio * impuestosFinal / 100;
      const ganancia = precio - comision - adsPorUnidad - envio - impuestos - costoFinal;
      const margen = (ganancia / precio * 100);
      const semaforo = ganancia <= 0 ? '🔴 PÉRDIDA' : margen < 10 ? '🟡 margen finito' : '🟢 margen sano';
      const acosMax = ((ganancia + adsPorUnidad) / precio * 100);
      return `# 💰 Rentabilidad real${titulo ? ': ' + titulo : ''}${args.item_id ? ' (' + args.item_id + ')' : ''}\n\n` +
        `| Concepto | Monto |\n| --- | --- |\n` +
        `| Precio de venta | ${dinero(precio)} |\n` +
        `| − Comisión MercadoLibre (${pct != null ? pct + '%' + (fijo ? ' + ' + dinero(fijo) : '') : 'tarifa'}) | −${dinero(comision)} |\n` +
        `| − Publicidad por unidad (${notaAds}) | −${dinero(adsPorUnidad)} |\n` +
        `| − Envío a cargo del vendedor | −${dinero(envio)} |\n` +
        `| − Impuestos (${impuestosFinal}% del precio) | −${dinero(impuestos)} |\n` +
        `| − Costo del producto | −${dinero(costoFinal)} |\n` +
        `| **= Ganancia neta por unidad** | **${dinero(ganancia)}** |\n\n` +
        `**Margen: ${margen.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%** ${semaforo}\n` +
        (memoria.length ? `🧠 Usando del cerebro: ${memoria.join(' · ')} (actualizalos con ml_cerebro).\n` : (Object.keys(aprendido).length ? '🧠 Datos nuevos guardados en el cerebro: no te los vuelvo a preguntar.\n' : '')) + `**ACOS máximo que aguanta este producto: ${Math.max(0, acosMax).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%** — arriba de eso, la publicidad se come toda la ganancia.` +
        (ganancia <= 0 ? `\n\n⚠️ Así como está, PERDÉS plata en cada venta. Precio de equilibrio (ganancia 0): ${dinero((costoFinal + envio + adsPorUnidad + (pct != null ? fijo : comision)) / (1 - ((pct ?? 0) + impuestosFinal) / 100))} — validá también contra ml_precio_catalogo antes de subirlo.` : '');
    },
  },
  // ─────────────────────────────── Clips ───────────────────────────────
  {
    name: 'ml_clips', title: 'Clips de las publicaciones', readOnly: true,
    description: 'Consulta los Clips (videos verticales cortos) de tus publicaciones por la API y dice cuáles sirven: con item_id muestra cada clip y su estado de moderación (publicado ✅, en revisión ⏳ 24-48 hs, rechazado ❌ con el motivo y cómo corregirlo); sin item_id recorre tus publicaciones activas y arma el mapa de video de la tienda (clips + video clásico) con cuáles priorizar.',
    schema: { ...cuentaParam, item_id: z.string().optional().describe('Una publicación puntual; sin indicarlo, mapa de toda la tienda (hasta 10)') },
    async run(args) {
      const c = cliente(args);
      const ESTADO = {
        PUBLISHED: '✅ publicado (sirve: ya se muestra en tu publicación y en el feed de clips)',
        UNDER_REVIEW: '⏳ en revisión (la moderación tarda 24-48 hs)',
        REJECTED: '❌ rechazado',
        TRANSCODING_REJECTED: '⚠️ rechazo técnico al procesar el video',
        PAUSED: '⏸️ pausado',
      };
      const RAZON = {
        DUPLICATED_VIDEO: 'ese video ya se subió antes — grabá/exportá una versión distinta, no resubas el mismo archivo',
        VIDEO_PROCESSING_ERROR: 'no se pudo procesar el archivo — reexportalo como MP4 (video H.264, audio AAC) y volvé a subir',
      };
      const traerClips = async (id) => {
        for (const ruta of [`/marketplace/items/${id}/clips`, `/items/${id}/clips`]) {
          try { return await c.get(ruta); } catch (e) {
            if (e.status === 404 && /no clips/i.test(String(e.message))) return { clips: [] }; // existe pero sin clips
            if (![400, 403, 404].includes(e.status)) throw e;
          }
        }
        return null;
      };
      if (args.item_id) {
        const r = await traerClips(args.item_id);
        if (!r || !r.clips?.length) return `**${args.item_id}** no tiene clips cargados (o tu cuenta todavía no tiene la API de clips habilitada — hoy MercadoLibre la documenta para Global Selling; en ese caso se gestionan desde el panel del vendedor). Para crear uno: skill video-publicaciones-ml o ugc-ml, y subirlo con ml_subir_clip.`;
        const filas = r.clips.map((cl) => {
          const porSitio = (cl.metadata || []).map((md) => {
            let linea = `  - ${md.site_id}: ${ESTADO[md.moderation_status] || md.moderation_status}`;
            for (const [cod, txt] of Object.entries(md.moderation_reasons || {})) linea += `\n    · motivo: ${RAZON[cod] || txt}`;
            return linea;
          });
          return `- clip \`${String(cl.clip_uuid).slice(0, 8)}…\`\n` + porSitio.join('\n');
        });
        const estados = r.clips.flatMap((cl) => (cl.metadata || []).map((md) => md.moderation_status));
        const sirven = estados.filter((s) => s === 'PUBLISHED').length;
        return `# Clips de ${args.item_id} (${r.clips.length})\n\n` + filas.join('\n') +
          `\n\n**Veredicto:** ${sirven} sirviendo ahora mismo · ${estados.filter((s) => s === 'UNDER_REVIEW').length} en revisión · ${estados.filter((s) => s === 'REJECTED' || s === 'TRANSCODING_REJECTED').length} para corregir. Los rechazados se borran con ml_borrar_clip y se vuelve a subir la versión corregida.`;
      }
      const id = await sellerId(c);
      const lista = await c.get(`/users/${id}/items/search`, { status: 'active', limit: 10 });
      const ids = (lista.results || []).slice(0, 10);
      if (!ids.length) return 'No hay publicaciones activas para revisar.';
      const multi = await c.get('/items', { ids: ids.join(',') });
      const filas = [];
      let sinNada = [];
      for (const mres of multi) {
        if (mres.code !== 200) continue;
        const b = mres.body;
        const r = await traerClips(b.id);
        const estados = r?.clips?.flatMap((cl) => (cl.metadata || []).map((md) => md.moderation_status)) || [];
        const clipsTxt = !r ? '—' : estados.length ? [
          estados.filter((s) => s === 'PUBLISHED').length ? `✅ ${estados.filter((s) => s === 'PUBLISHED').length}` : '',
          estados.filter((s) => s === 'UNDER_REVIEW').length ? `⏳ ${estados.filter((s) => s === 'UNDER_REVIEW').length}` : '',
          estados.filter((s) => s === 'REJECTED' || s === 'TRANSCODING_REJECTED').length ? `❌ ${estados.filter((s) => s === 'REJECTED' || s === 'TRANSCODING_REJECTED').length}` : '',
        ].filter(Boolean).join(' ') : 'sin clips';
        if (!estados.some((s) => s === 'PUBLISHED') && !b.video_id) sinNada.push(b.id);
        filas.push(`| ${b.id} | ${String(b.title).slice(0, 38)} | ${b.video_id ? '✅' : '❌'} | ${clipsTxt} |`);
      }
      return `# Mapa de video de la tienda (${filas.length} publicaciones activas)\n\n| Publicación | Título | Video clásico | Clips |\n| --- | --- | --- | --- |\n` + filas.join('\n') +
        (sinNada.length ? `\n\n**Prioridad:** ${sinNada.join(', ')} no tienen NINGÚN video — las publicaciones con video convierten más. Producilos con video-publicaciones-ml o ugc-ml y subilos con ml_subir_clip.` : '\n\n✅ Todas tienen al menos un video sirviendo.');
    },
  },
  {
    name: 'ml_subir_clip', title: 'Subir un clip', readOnly: false,
    description: 'Sube un Clip (video vertical corto) a una publicación por la API. Requisitos de MercadoLibre: MP4/MOV/MPEG/AVI, vertical, 10 a 61 segundos, mínimo 360x640, máximo 280 MB, publicación activa. La moderación tarda 24-48 hs (verificar después con ml_clips).',
    schema: { ...cuentaParam, item_id: z.string(), archivo: z.string().describe('Ruta local del video (ej /ruta/MLA123-clip.mp4)') },
    async run(args) {
      const fs = await import('node:fs');
      if (!fs.existsSync(args.archivo)) return `No encuentro el archivo "${args.archivo}". Pasame la ruta completa del video.`;
      const ext = args.archivo.toLowerCase().split('.').pop();
      if (!['mp4', 'mov', 'mpeg', 'avi'].includes(ext)) return `MercadoLibre solo acepta MP4, MOV, MPEG o AVI (recibí .${ext}). Exportá el video como MP4 (H.264 + AAC) y volvé a intentar.`;
      const stat = fs.statSync(args.archivo);
      if (stat.size > 280 * 1024 * 1024) return `El archivo pesa ${(stat.size / 1048576).toFixed(0)} MB y el máximo es 280 MB: comprimilo (MP4 H.264) y volvé a intentar.`;
      const c = cliente(args);
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(args.archivo)], { type: 'video/' + (ext === 'mp4' ? 'mp4' : ext) }), args.archivo.split(/[\\/]/).pop());
      let r, ultimoError;
      for (const ruta of [`/marketplace/items/${args.item_id}/clips/upload`, `/items/${args.item_id}/clips/upload`]) {
        try { r = await c.postMultipart(ruta, form); break; } catch (e) { ultimoError = e; if (![400, 403, 404].includes(e.status)) throw e; }
      }
      if (!r) {
        const msj = String(ultimoError?.message || '');
        if (/duration is shorter/i.test(msj)) return '❌ MercadoLibre lo rechazó: el video dura menos de 10 segundos.';
        if (/duration is longer|exceed 61/i.test(msj)) return '❌ MercadoLibre lo rechazó: el video supera los 61 segundos — recortalo.';
        if (/resolution|360x640|calidad del video/i.test(msj)) return '❌ MercadoLibre lo rechazó: resolución menor a 360x640 — reescalalo (ideal 1080x1920 vertical).';
        if (/extension|type not allowed/i.test(msj)) return '❌ MercadoLibre rechazó el formato: exportá como MP4 (H.264 + AAC).';
        return `❌ No se pudo subir: ${msj || 'tu cuenta puede no tener la API de clips habilitada todavía (MercadoLibre la documenta para Global Selling); en ese caso subilo desde el panel del vendedor'}.`;
      }
      return `✅ Clip subido a **${args.item_id}** (id ${r.clip_uuid || 's/d'}). Entró a moderación: tarda **24-48 hs** en aprobarse y publicarse — verificalo después con ml_clips. Ojo: MercadoLibre modera hasta 1.000 clips por día en total, si subís muchos hacelo en tandas.`;
    },
  },
  {
    name: 'ml_borrar_clip', title: 'Borrar un clip', readOnly: false,
    description: 'Borra un clip de una publicación (por ejemplo uno rechazado, para subir la versión corregida). Funciona en cualquier estado de moderación.',
    schema: { ...cuentaParam, item_id: z.string(), clip_uuid: z.string().describe('El id del clip (sale de ml_clips)') },
    async run(args) {
      const c = cliente(args);
      let r, ultimoError;
      for (const ruta of [`/marketplace/items/${args.item_id}/clips/${args.clip_uuid}`, `/items/${args.item_id}/clips/${args.clip_uuid}`]) {
        try { r = await c.del(ruta); break; } catch (e) { ultimoError = e; if (![400, 403, 404].includes(e.status)) throw e; }
      }
      if (!r) return `❌ No se pudo borrar: ${ultimoError?.message || 'clip o publicación no encontrados'}.`;
      const filas = (Array.isArray(r) ? r : [r]).map((x) => `- ${x.site_id || args.item_id}: ${x.status === 'DELETED' ? '✅ borrado' : x.status}`);
      return `# Borrado de clip ${String(args.clip_uuid).slice(0, 8)}…\n` + filas.join('\n') + '\n\nSi era un rechazado, ya podés subir la versión corregida con ml_subir_clip.';
    },
  },
  // ───────────────────── Vigilancia de competencia ─────────────────────
  {
    name: 'ml_vigilar', title: 'Lista de seguimiento', readOnly: true,
    description: 'Administra la lista de seguimiento de competencia y tendencias (se guarda local). Tipos: vendedor (nickname o id de un competidor), publicacion (item_id ajeno o propio), busqueda (keyword para vigilar su top 10) y tendencias (sitio o categoría). Acciones: listar, agregar, quitar.',
    schema: { ...cuentaParam,
      accion: z.enum(['listar', 'agregar', 'quitar']).describe('Qué hacer'),
      tipo: z.enum(['vendedor', 'publicacion', 'busqueda', 'tendencias']).optional(),
      ref: z.string().optional().describe('Nickname/id del vendedor, item_id, keyword, o categoría para tendencias'),
      nota: z.string().optional().describe('Recordatorio de por qué se vigila') },
    async run(args) {
      if (args.accion === 'listar') {
        const d = leerVigilancia();
        if (!d.objetivos.length) return 'La lista de seguimiento está vacía. Agregá competidores con ml_vigilar accion=agregar (ej: tipo=vendedor ref=NICK_RIVAL).';
        const titulos = { vendedor: '🥊 Rivales', publicacion: '📦 Productos que seguimos', busqueda: '🔍 Búsquedas vigiladas', tendencias: '📈 Tendencias' };
        const resumen = (o) => {
          const s = d.snapshots[claveDe(o)];
          if (!s) return '';
          const fecha = new Date(s.t).toLocaleDateString('es-AR');
          if (o.tipo === 'vendedor') return ` · ${Object.keys(s.datos.items || {}).length} publicaciones registradas (control: ${fecha})`;
          if (o.tipo === 'publicacion') return ` · último control: $ ${Number(s.datos.precio).toLocaleString('es-AR')} · ${s.datos.vendidos} vendidos (${fecha})`;
          if (o.tipo === 'busqueda') return s.datos.top?.[0] ? ` · líder: ${s.datos.top[0].vendedor} a $ ${Number(s.datos.top[0].precio).toLocaleString('es-AR')} (${fecha})` : '';
          return ` · top registrado (${fecha})`;
        };
        const grupos = [];
        for (const tipo of ['vendedor', 'publicacion', 'busqueda', 'tendencias']) {
          const del = d.objetivos.filter((o) => o.tipo === tipo);
          if (del.length) grupos.push(`### ${titulos[tipo]} (${del.length})\n` + del.map((o) => `- **${o.ref}**${o.nota ? ' — ' + o.nota : ''}${resumen(o)}`).join('\n'));
        }
        return '# Lista de seguimiento\n\n' + grupos.join('\n\n') + '\n\nCorré ml_novedades_competencia para ver qué cambió.';
      }
      if (args.accion === 'quitar') {
        if (!args.ref) return 'Indicá ref (lo que aparece en la lista) para quitar.';
        const n = quitarObjetivo(args.ref);
        return n ? `Quitado del seguimiento (${n}).` : `No encontré "${args.ref}" en la lista.`;
      }
      if (!args.tipo || (!args.ref && args.tipo !== 'tendencias')) return 'Para agregar indicá tipo y ref (en tendencias, ref puede ser una categoría o quedar vacío para el sitio entero).';
      const c = cliente(args);
      const sitio = (await c.get('/users/me')).site_id || 'MLA';
      const o = { tipo: args.tipo, ref: args.ref || sitio, nota: args.nota, sitio };
      const r = agregarObjetivo(o);
      if (r.ya) return 'Ya estaba en la lista de seguimiento.';
      try {
        const d = leerVigilancia();
        const datos0 = await tomarSnapshot(c, r.objetivo, sitio);
        d.snapshots[claveDe(r.objetivo)] = { t: Date.now(), datos: datos0 };
        registrarHistorial(d, claveDe(r.objetivo), r.objetivo, datos0);
        guardarVigilancia(d);
      } catch {}
      return `✅ Agregado al seguimiento: ${o.tipo} **${o.ref}**. Primer registro guardado — corré ml_novedades_competencia en unos días y te digo exactamente qué cambió.`;
    },
  },
  {
    name: 'ml_novedades_competencia', title: 'Novedades de competencia y tendencias', readOnly: true,
    description: 'Recorre toda la lista de seguimiento y reporta SOLO lo que cambió desde la última corrida: precios que subieron/bajaron, publicaciones nuevas o dadas de baja, ventas estimadas de competidores, cambios de líder en búsquedas y keywords que entraron/salieron de tendencias. Ideal como rutina semanal.',
    schema: { ...cuentaParam },
    async run(args) {
      const c = cliente(args);
      const sitio = (await c.get('/users/me')).site_id || 'MLA';
      const d = leerVigilancia();
      if (!d.objetivos.length) return 'La lista de seguimiento está vacía: agregá objetivos con ml_vigilar.';
      const secciones = []; let sinCambios = 0, primeros = 0;
      for (const o of d.objetivos) {
        const clave = claveDe(o);
        let nuevo;
        try { nuevo = { t: Date.now(), datos: await tomarSnapshot(c, o, o.sitio || sitio) }; }
        catch (e) { secciones.push(`### ${o.tipo}: ${o.ref}\n- ⚠️ no se pudo consultar (${e.message})`); continue; }
        const viejo = d.snapshots[clave];
        if (!viejo) { primeros++; d.snapshots[clave] = nuevo; registrarHistorial(d, clave, o, nuevo.datos); continue; }
        const cambios = compararSnapshots(o, viejo.datos, nuevo.datos);
        const dias = Math.max(1, Math.round((nuevo.t - viejo.t) / 86400000));
        if (cambios.length) secciones.push(`### ${o.tipo}: ${o.ref}${o.nota ? ' (' + o.nota + ')' : ''} — últimos ${dias} día(s)\n` + cambios.map((x) => '- ' + x).join('\n'));
        else sinCambios++;
        d.snapshots[clave] = nuevo;
        registrarHistorial(d, clave, o, nuevo.datos);
      }
      guardarVigilancia(d);
      const pie = [];
      if (sinCambios) pie.push(`${sinCambios} objetivo(s) sin cambios`);
      if (primeros) pie.push(`${primeros} con primer registro recién guardado`);
      if (!secciones.length) return `Sin novedades en la competencia. ${pie.join(' · ')}.`;
      return '# Novedades de competencia y tendencias\n\n' + secciones.join('\n\n') + (pie.length ? `\n\n_${pie.join(' · ')}._` : '');
    },
  },
  // ───────────────────── El equipo de trabajadores 24/7 ─────────────────────
  {
    name: 'ml_trabajadores', title: 'Equipo de trabajadores (vigilancia constante)', readOnly: true,
    description: 'El equipo de 6 trabajadores que vigilan solos y constantemente: 🕵️ Vera (precios), 📦 Tomás (ventas de rivales y quiebres de stock), 🏆 Martina (ranking en búsquedas y tu puesto), 🎯 Bruno (rivales nuevos), 🩺 Lucía (audita TODAS tus publicaciones cada 15 días: desactualizadas, precio congelado o fuera de mercado, fotos, stock, ficha) y 📈 Sofía (tendencias). Cada uno tiene sus skills a cargo y cada alerta recomienda qué skill correr. Guardan todo en una base de datos SQLite local (equipo.db, viene con Node: cero instalación, ideal Windows) y envían sus resultados a Google Drive (planilla en vivo o carpeta de Drive). Acciones: equipo (estado de todos), asignar (darle una tarea), quitar, pausar, activar, frecuencia (minutos), correr (que trabajen ya), informe (alertas nuevas), resultados (tablas con todo lo que sabe cada uno), historial (evolución día por día de un rival/keyword), base (la base de datos: estado y backup), drive (conectar Google Drive). Se puede nombrar al trabajador por su nombre (Vera) o puesto (precios). Si un trabajador no tiene tareas propias vigila tus seguidos de ml_vigilar de su tipo.',
    schema: { ...cuentaParam,
      accion: z.enum(['equipo', 'asignar', 'quitar', 'pausar', 'activar', 'frecuencia', 'correr', 'informe', 'resultados', 'historial', 'base', 'drive']).describe('Qué hacer. historial = evolución día por día de un objetivo (precio, ventas por día, puesto, líder) desde la base de datos. base = estado de la base de datos del equipo y backup. resultados = las tablas con lo que sabe cada trabajador (precio rival vs el tuyo, ritmo de ventas, tu puesto, rivales nuevos, top de tendencias). drive = conectar/ver/probar el envío a Google Drive'),
      trabajador: z.string().optional().describe('Vera/precios, Tomás/ventas, Martina/ranking, Bruno/rivales, Lucía/auditor, Sofía/tendencias, o "todos"'),
      tipo: z.enum(['vendedor', 'publicacion', 'busqueda', 'tendencias']).optional().describe('Se deduce solo según el trabajador; Vera acepta vendedor o publicacion'),
      ref: z.string().optional().describe('item_id rival, nickname/id del vendedor, palabra clave, o categoría (tendencias)'),
      mi_item: z.string().optional().describe('Tu item_id para comparar: Vera avisa si un rival queda más barato, Martina te dice tu puesto en la búsqueda'),
      umbral: z.number().optional().describe('Vera: % mínimo de cambio de precio para avisar · Martina: puestos mínimos de cambio · Tomás: unidades mínimas'),
      minutos: z.number().optional().describe(`Frecuencia de control en minutos (mínimo ${INTERVALO_MINIMO})`),
      nota: z.string().optional(),
      todas: z.boolean().optional().describe('informe: incluir también las alertas ya leídas'),
      url: z.string().optional().describe('drive: URL de la app web de Apps Script de tu planilla (https://script.google.com/macros/s/.../exec)'),
      carpeta: z.string().optional().describe('drive: carpeta de Google Drive para escritorio en esta PC (ej: G:\\Mi unidad) o "auto" para detectarla'),
      dias: z.number().optional().describe('historial: cuántos días hacia atrás (default 30, máx 400) · frecuencia: cada cuántos días (ej: Lucía dias=15)'),
      backup: z.boolean().optional().describe('base: hacer una copia de seguridad de la base ahora'),
      probar: z.boolean().optional().describe('drive: enviar ahora los resultados para probar'),
      quitar: z.enum(['todo', 'script', 'carpeta']).optional().describe('drive: desconectar el envío'),
    },
    async run(args) {
      const quien = args.trabajador && sinAcento(args.trabajador) !== 'todos' ? resolverTrabajador(args.trabajador) : null;
      if (args.trabajador && sinAcento(args.trabajador) !== 'todos' && !quien) return `No conozco a "${args.trabajador}". El equipo: ${IDS.map(etiqueta).join(' · ')}.`;
      const objetivo = quien ? [quien] : IDS;
      const hora = (t) => t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      const icono = { alta: '🔴', media: '🟡', baja: '🟢' };
      const linea = (a) => `- ${icono[a.nivel] || '•'} ${a.texto}${a.skill ? ` → 👉 skill **${a.skill}**` : ''} _(${hora(a.t)})_`;
      const agrupar = (alertas) => {
        const orden = { alta: 0, media: 1, baja: 2 };
        return IDS.filter((id) => alertas.some((a) => a.trabajador === id)).map((id) =>
          `### ${etiqueta(id)}\n` + alertas.filter((a) => a.trabajador === id).sort((x, y) => (orden[x.nivel] - orden[y.nivel]) || (y.t - x.t)).slice(0, 25).map(linea).join('\n')).join('\n\n');
      };

      if (args.accion === 'equipo') {
        const d = leerEquipo(); const corre = quienCorre();
        const modo = !corre ? '⚪ Nadie los está corriendo ahora. Se despiertan solos mientras Claude esté abierto; para 24/7 corré en la terminal `npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital trabajadores instalar`.'
          : corre.modo === 'servicio' ? `🟢 Trabajando 24/7 como servicio de la PC (desde ${hora(corre.desde)}).`
          : '🟢 Trabajando mientras Claude está abierto (para 24/7: `npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital trabajadores instalar`).';
        const bloques = objetivo.map((id) => {
          const w = d.trabajadores[id], e = EQUIPO[id];
          const tareas = tareasDe(d, id), propias = tareas.filter((t) => !t.deLista), heredadas = tareas.length - propias.length;
          const sinLeer = resumenAlertas(id, d).sinLeer;
          const prox = w.activo && w.ultimo ? w.ultimo + w.intervalo * 60000 : null;
          return [`### ${etiqueta(id)} — ${w.activo ? '🟢 activo' : '⏸️ en pausa'} · ${cadaCuanto(w.intervalo)}`,
            `_${e.oficio}_`,
            `- **Tareas:** ${propias.length ? propias.map((t) => `${t.ref}${t.mi_item ? ` (vs tu ${t.mi_item})` : ''}${t.umbral != null ? ` [umbral ${t.umbral}]` : ''}`).join(' · ') : 'ninguna propia'}${heredadas ? ` + ${heredadas} de tus seguidos` : ''}${!tareas.length ? ' — 💤 sin nada que vigilar: asignale algo' : ''}`,
            `- **Último control:** ${hora(w.ultimo)}${prox ? ` · próximo ≈ ${hora(Math.max(prox, Date.now()))}` : ''}${w.ultimoError ? ` · ⚠️ ${w.ultimoError}` : ''}`,
            `- **Alertas sin leer:** ${sinLeer}`,
            `- **Skills a cargo:** ${e.skills.map((x) => `\`${x.skill}\` (${x.para})`).join(' · ')}`].join('\n');
        });
        const dv = d.drive || {};
        const lineaDrive = dv.script || dv.carpeta
          ? `📁 Google Drive: ${[dv.script ? 'planilla en vivo' : '', dv.carpeta ? 'carpeta ' + dv.carpeta : ''].filter(Boolean).join(' + ')} · último envío ${hora(dv.ultimo)}${dv.ultimoError ? ' · ⚠️ ' + dv.ultimoError : ''}`
          : '📁 Google Drive: sin conectar (ml_trabajadores accion=drive)';
        const eb = estadoDB();
        const lineaBase = eb.activa ? `🗄️ Base de datos: ${eb.mediciones.n.toLocaleString('es-AR')} mediciones y ${eb.alertas.n.toLocaleString('es-AR')} alertas guardadas (accion=base)` : `🗄️ Base de datos: no activa — ${eb.motivo} (accion=base)`;
        return `# Equipo de trabajadores\n${modo}\n${lineaBase}\n${lineaDrive}\n\n` + bloques.join('\n\n') + '\n\nDales tareas con ml_trabajadores accion=asignar (ej: trabajador=Vera ref=MLA123 mi_item=TU_ITEM umbral=3) y leé lo que encontraron con accion=informe.';
      }

      if (args.accion === 'asignar') {
        if (!quien) return 'Decime a quién: Vera (precios), Tomás (ventas), Martina (ranking), Bruno (rivales), Lucía (auditoría de tus publicaciones) o Sofía (tendencias).';
        let sitio;
        if (EQUIPO[quien].tipos.includes('tendencias') && !args.ref) sitio = (await cliente(args).get('/users/me')).site_id || 'MLA';
        const r = asignarTarea(quien, { tipo: args.tipo, ref: args.ref, mi_item: args.mi_item, umbral: args.umbral, nota: args.nota, cuenta: args.cuenta, sitio });
        const w = leerEquipo().trabajadores[quien];
        const skills = EQUIPO[quien].skills.map((x) => '`' + x.skill + '`').join(', ');
        return `✅ ${etiqueta(quien)} ${r.actualizada ? 'actualizó' : 'tomó'} la tarea: ${r.tarea.tipo} **${r.tarea.ref}**${r.tarea.mi_item ? ` comparando con tu ${r.tarea.mi_item}` : ''}${r.tarea.umbral != null ? ` (umbral ${r.tarea.umbral})` : ''}.\nControla ${cadaCuanto(w.intervalo)}${w.activo ? '' : ' (⚠️ está en pausa: activalo)'}; el primer control guarda la foto de base y desde ahí avisa solo lo que cambia. Cuando encuentre algo te va a recomendar una de sus skills: ${skills}.`;
      }

      if (args.accion === 'quitar') {
        if (!quien || !args.ref) return 'Indicá trabajador y ref de la tarea a quitar (ver accion=equipo).';
        const n = quitarTarea(quien, args.ref);
        return n ? `${etiqueta(quien)} dejó la tarea "${args.ref}".` : `${EQUIPO[quien].nombre} no tenía la tarea "${args.ref}" (si viene de tus seguidos, quitala con ml_vigilar).`;
      }

      if (args.accion === 'pausar' || args.accion === 'activar') {
        actualizarEquipo((d) => { for (const id of objetivo) d.trabajadores[id].activo = args.accion === 'activar'; });
        return `${args.accion === 'activar' ? '▶️ Activados' : '⏸️ En pausa'}: ${objetivo.map(etiqueta).join(', ')}.`;
      }

      if (args.accion === 'frecuencia') {
        if (!args.minutos && !args.dias) return 'Indicá minutos o dias (ej: Lucía dias=15).';
        const pedido = args.dias ? args.dias * 1440 : args.minutos;
        const m = Math.max(INTERVALO_MINIMO, Math.round(pedido));
        actualizarEquipo((d) => { for (const id of objetivo) d.trabajadores[id].intervalo = m; });
        return `⏱️ ${objetivo.map(etiqueta).join(', ')} ahora controla(n) ${cadaCuanto(m)}${m !== Math.round(pedido) ? ` (mínimo ${INTERVALO_MINIMO} para cuidar el límite de la API de MercadoLibre)` : ''}.`;
      }

      if (args.accion === 'correr') {
        // Lucía audita TODA la tienda (puede tardar minutos): corre a pedido solo si la nombrás
        const solo = quien ? objetivo : objetivo.filter((id) => id !== 'auditor');
        const r = await correrCiclo({ solo, forzar: true });
        const pie = [`Trabajaron: ${r.corridos.length ? r.corridos.map((id) => EQUIPO[id].nombre).join(', ') : 'nadie (sin tareas)'}`];
        if (r.primeros) pie.push(`${r.primeros} tarea(s) con foto de base recién guardada (avisan desde el próximo control)`);
        if (r.errores.length) pie.push('⚠️ ' + r.errores.join(' · '));
        if (r.drive) pie.push(r.drive.errores?.length ? '📁 Drive ⚠️ ' + r.drive.errores.join(' · ') : r.drive.error ? '📁 Drive ⚠️ ' + r.drive.error : '📁 resultados enviados a Google Drive');
        if (!quien) pie.push('Lucía audita sola cada 15 días (para auditar ya: trabajador=Lucía)');
        if (r.alertas.length) leerBandeja({ marcar: true }); // ya las viste acá
        return (r.alertas.length ? '# Lo que encontraron recién\n\n' + agrupar(r.alertas) : '# Sin novedades en este control') + `\n\n_${pie.join(' · ')}._`;
      }

      if (args.accion === 'resultados') {
        const res = armarResultados();
        const destacados = IDS.filter((id) => (!quien || id === quien) && res[id].destacado).map((id) => `- ${EQUIPO[id].emoji} **${EQUIPO[id].nombre}:** ${res[id].destacado}`);
        const dv = configDrive();
        return `# Resultados del equipo\n\n${destacados.length ? '## Lo importante\n' + destacados.join('\n') + '\n\n' : ''}` + resultadosEnMarkdown(res, quien || undefined) +
          `\n\n${dv.script || dv.carpeta ? '📁 Estas mismas tablas están en tu Google Drive (se actualizan en cada control).' : '📁 ¿Las querés en Google Drive, actualizadas solas? ml_trabajadores accion=drive.'}`;
      }

      if (args.accion === 'base') {
        const e = estadoDB();
        if (!e.activa) return [`# Base de datos del equipo — ⚪ no activa`,
          `Motivo: ${e.motivo}.`,
          `El equipo sigue funcionando igual (con el archivo de siempre), pero sin historial.`,
          `**Cómo activarla en Windows (1 comando, 2 minutos):** abrí PowerShell y corré \`winget install OpenJS.NodeJS.LTS\`, cerrá y volvé a abrir Claude. No hay que instalar ninguna base de datos aparte: SQLite viene adentro de Node ${NODE_MINIMO}+.`].join('\n');
        let extra = '';
        if (args.backup) extra = `\n\n✅ Backup hecho: \`${backupDB()}\` (copia completa y consistente, aunque el equipo esté trabajando).`;
        const f = (t) => t ? new Date(t).toLocaleDateString('es-AR') : '—';
        const mb = (e.bytes / 1048576).toFixed(2);
        return [`# Base de datos del equipo — 🟢 activa`,
          `- **Archivo:** \`${e.ruta}\` (${mb} MB · SQLite ${e.sqlite}, viene con Node: nada que instalar)`,
          `- **Mediciones:** ${e.mediciones.n.toLocaleString('es-AR')} de ${e.objetivos} objetivo(s) · desde ${f(e.mediciones.desde)} hasta ${f(e.mediciones.hasta)}`,
          `- **Alertas guardadas:** ${e.alertas.n.toLocaleString('es-AR')} · **Controles registrados:** ${e.controles.n.toLocaleString('es-AR')}`,
          `- **Se guarda:** ${RETENCION_DIAS} días de historial (lo más viejo se limpia solo, una vez por día)`,
          `- **Ver la base por dentro (opcional, Windows):** \`winget install -e --id DBBrowserForSQLite.DBBrowserForSQLite\` y abrí el archivo de arriba. Tablas: alertas, mediciones, controles.`,
          `- **Backup:** ml_trabajadores accion=base backup=true (o copiá el archivo con Claude cerrado).`].join('\n') + extra;
      }

      if (args.accion === 'historial') {
        const e = estadoDB();
        if (!e.activa) return `El historial necesita la base de datos del equipo (${e.motivo}). Mirá ml_trabajadores accion=base para activarla en 2 minutos.`;
        if (!args.ref && !quien) return 'Decime qué objetivo (ref: item_id, vendedor o keyword) o de qué trabajador querés el historial.';
        const dias = Math.min(Math.max(1, Math.round(args.dias ?? 30)), RETENCION_DIAS);
        const ms = leerMediciones({ ref: args.ref?.trim(), trabajador: quien || undefined, dias });
        if (!ms.length) return `Sin mediciones de ${args.ref ? '"' + args.ref + '"' : etiqueta(quien)} en los últimos ${dias} días. ¿Está asignado a algún trabajador? (accion=equipo)`;
        const din = (n) => n == null ? '—' : '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
        const dia = (t) => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        const bloques = [];
        const grupos = {};
        for (const m of ms) (grupos[m.trabajador + '|' + m.ref] ||= []).push(m);
        for (const [k, lista] of Object.entries(grupos)) {
          const [id, ref] = k.split('|');
          // un punto por día (el último del día), y el primero de todos para tener la base
          const porDia = new Map();
          for (const m of lista) porDia.set(new Date(m.t).toDateString(), m);
          const pts = [...porDia.values()];
          const primero = lista[0], ultimo = lista[lista.length - 1];
          let cab, fila, resumen = '';
          if (id === 'precios') {
            cab = ['Día', 'Precio rival', 'Tu precio', 'Situación'];
            fila = (m) => [dia(m.t), din(m.precio), din(m.mi_precio), m.mi_precio == null ? '—' : m.precio < m.mi_precio ? '🔴 más barato' : '🟢 vos más barato'];
            const ps = lista.map((m) => m.precio).filter((n) => n > 0);
            if (ps.length) resumen = `Mínimo ${din(Math.min(...ps))} · máximo ${din(Math.max(...ps))} · hoy ${din(ultimo.precio)}${primero.precio ? ` (${ultimo.precio >= primero.precio ? '↑' : '↓'} ${Math.abs(((ultimo.precio - primero.precio) / primero.precio) * 100).toFixed(1)}% en el período)` : ''}`;
          } else if (id === 'ventas') {
            cab = ['Día', 'Precio', 'Vendidos (acum.)', 'Vendió ese día', 'Stock', 'Estado'];
            let ant = primero.vendidos;
            fila = (m) => { const v = m.vendidos != null && ant != null ? Math.max(0, m.vendidos - ant) : null; ant = m.vendidos ?? ant; return [dia(m.t), din(m.precio), m.vendidos ?? '—', v ?? '—', m.stock ?? '—', m.stock === 0 ? 'SIN STOCK' : m.estado ?? '—']; };
            const total = (ultimo.vendidos ?? 0) - (primero.vendidos ?? 0);
            const d = (ultimo.t - primero.t) / 86400000;
            resumen = `Vendió ~${Math.max(0, total)} u. en ${d < 1 ? Math.round(d * 24) + ' h' : d.toFixed(1) + ' días'}${d >= 0.04 ? ` → ≈ ${(total / d).toFixed(1)} u./día, ≈ ${din((total / d) * 30 * (ultimo.precio || 0))}/mes` : ''}`;
          } else if (id === 'ranking') {
            cab = ['Día', 'Tu puesto', 'Líder', 'Precio líder'];
            fila = (m) => [dia(m.t), m.puesto ?? 'fuera del top', m.lider ?? '—', din(m.precio_lider)];
            const ps = lista.map((m) => m.puesto).filter((n) => n != null);
            const lideres = new Set(lista.map((m) => m.lider).filter(Boolean));
            resumen = `${ps.length ? `Tu mejor puesto: ${Math.min(...ps)}º · peor: ${Math.max(...ps)}º · hoy: ${ultimo.puesto ?? 'fuera del top'}` : 'Sin puesto propio (pasale mi_item a Martina)'} · ${lideres.size} líder(es) distinto(s) en el período`;
          } else if (id === 'auditor') {
            cab = ['Auditoría', 'Publicaciones', '🔴', '🟡', '🟢', 'Sin actualizar 60+ días'];
            fila = (m) => [dia(m.t), m.extra?.total ?? '—', m.extra?.rojas ?? '—', m.extra?.amarillas ?? '—', m.extra?.verdes ?? '—', m.extra?.sinActualizar ?? '—'];
            if (lista.length > 1) { const a = lista[0].extra || {}, z = ultimo.extra || {}; resumen = `De ${a.rojas ?? '?'} 🔴 a ${z.rojas ?? '?'} 🔴 y de ${a.verdes ?? '?'} 🟢 a ${z.verdes ?? '?'} 🟢 en el período`; }
          } else if (id === 'rivales') {
            cab = ['Día', 'Vendedores distintos en el top'];
            fila = (m) => [dia(m.t), m.extra?.vendedores ?? '—'];
          } else {
            cab = ['Día', 'Top 3 de tendencias'];
            fila = (m) => [dia(m.t), (m.extra?.top || []).slice(0, 3).map((x) => `"${x}"`).join(', ')];
          }
          const filas = pts.slice(-31).map(fila);
          bloques.push(`### ${EQUIPO[id].emoji} ${EQUIPO[id].nombre} · ${ref}\n${resumen ? `**${resumen}**\n` : ''}\n| ${cab.join(' | ')} |\n| ${cab.map(() => '---').join(' | ')} |\n` + filas.map((f) => `| ${f.map((v) => String(v).replace(/\|/g, '/')).join(' | ')} |`).join('\n'));
        }
        return `# Historial — últimos ${dias} días (${ms.length} mediciones en la base)\n\n` + bloques.join('\n\n');
      }

      if (args.accion === 'drive') {
        const GS = 'https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital/blob/main/docs/drive/planilla-equipo.gs';
        if (args.quitar) return desconectarDrive(args.quitar) ? `Listo: dejé de enviar a Drive (${args.quitar}). Tus archivos y planilla quedan como están.` : 'Drive no estaba conectado.';
        if (args.url || args.carpeta) {
          const cfg = conectarDrive({ url: args.url, carpeta: args.carpeta });
          const r = await exportarADrive([]);
          const ok = r && !r.errores.length;
          return [`${ok ? '✅' : '⚠️'} Google Drive ${ok ? 'conectado' : 'configurado, pero la prueba falló'}:`,
            cfg.script ? `- 📊 Planilla en vivo: ${r?.script ? 'recibió los resultados ✅' : 'sin respuesta'}` : '',
            cfg.carpeta ? `- 📁 Carpeta: ${cfg.carpeta} ${r?.carpeta ? '✅ (Alertas.csv, una tabla por trabajador y "Resumen del equipo.md")' : ''}` : '',
            r?.errores.length ? '- ⚠️ ' + r.errores.join(' · ') : '',
            ok ? 'Desde ahora cada control del equipo actualiza Drive solo: las alertas se suman al historial y cada trabajador tiene su pestaña/archivo al día.' : 'Revisá el paso que falló y volvé a correr accion=drive con probar=true.'].filter(Boolean).join('\n');
        }
        if (args.probar) {
          const r = await exportarADrive([]);
          if (!r) return 'Drive no está conectado todavía: corré ml_trabajadores accion=drive para ver cómo.';
          return r.errores.length ? '⚠️ ' + r.errores.join(' · ') : `✅ Resultados enviados a Drive${r.script ? ' (planilla)' : ''}${r.carpeta ? ' (carpeta)' : ''}.`;
        }
        const clave = claveDrive(); const dv = configDrive(); const det = detectarCarpetaDrive();
        return [`# Conectar el equipo a Google Drive`,
          dv.script || dv.carpeta ? `Estado: ${dv.script ? '📊 planilla conectada' : ''}${dv.script && dv.carpeta ? ' + ' : ''}${dv.carpeta ? '📁 carpeta ' + dv.carpeta : ''} · último envío ${hora(dv.ultimo)}${dv.ultimoError ? ' · ⚠️ ' + dv.ultimoError : ''}\n` : 'Estado: sin conectar.\n',
          `## Opción A — Planilla de Google en vivo (recomendada, funciona 24/7)`,
          `Una pestaña "Alertas" con todo el historial + una pestaña por trabajador (Vera, Tomás, Martina, Bruno, Sofía) con sus resultados al día. Sin crear apps en Google Cloud.`,
          `1. Creá una planilla nueva: sheets.new`,
          `2. Extensiones → Apps Script → pegá el código de: ${GS}`,
          `3. En la línea \`const CLAVE = 'PEGAR_LA_CLAVE';\` poné tu clave: \`${clave}\` (no la compartas: es lo que impide que otro escriba en tu planilla)`,
          `4. Implementar → Nueva implementación → App web · Ejecutar como: Yo · Acceso: Cualquier usuario → Autorizar`,
          `5. Pasame la URL que termina en /exec y la conecto (accion=drive url=...).`,
          ``,
          `## Opción B — Carpeta de Google Drive para escritorio`,
          det ? `Encontré tu Drive en **${det}**: decime "usá la carpeta" (accion=drive carpeta=auto) y creo "${CARPETA_NOMBRE}" con un CSV por trabajador + Alertas.csv + resumen.` : `Si tenés Google Drive para escritorio instalado, pasame la ruta (ej: G:\\Mi unidad) o carpeta=auto. Se crea "${CARPETA_NOMBRE}" con un CSV por trabajador, Alertas.csv y un resumen.`,
          ``, `Podés usar las dos a la vez.`].join('\n');
      }

      // informe
      const alertas = leerBandeja({ todas: !!args.todas, trabajador: quien || undefined });
      if (!alertas.length) {
        const d = leerEquipo();
        const ultimo = Math.max(0, ...objetivo.map((id) => d.trabajadores[id].ultimo || 0));
        return `Sin alertas nuevas${quien ? ' de ' + etiqueta(quien) : ''}. Último control: ${hora(ultimo || null)}. (Con todas=true ves las alertas ya leídas; con accion=historial la evolución día por día.)`;
      }
      const altas = alertas.filter((a) => a.nivel === 'alta').length;
      return `# Informe del equipo — ${alertas.length} alerta(s)${altas ? `, ${altas} 🔴 urgente(s)` : ''}\n\n` + agrupar(alertas) + '\n\nCada 👉 es la skill que maneja ese trabajador para resolverlo: pedímela y la corro.';
    },
  },
  {
    name: 'ml_historial_competencia', title: 'Historial de competencia', readOnly: true,
    description: 'La base de datos de competencia: evolución en el tiempo de un objetivo vigilado — precio y ventas de una publicación rival, líder y precio líder de una búsqueda, o cantidad de publicaciones y precio mediana de un vendedor. Se alimenta sola con cada control de ml_novedades_competencia.',
    schema: { ref: z.string().describe('El objetivo tal como figura en la lista de seguimiento (item_id, nickname o keyword)') },
    async run(args) {
      const r = leerHistorial(args.ref);
      if (!r) return `"${args.ref}" no está en la lista de seguimiento. Agregalo con ml_vigilar y el historial se arma solo con cada control.`;
      if (!r.puntos.length) return `**${r.objetivo.ref}** está vigilado pero todavía sin historial: corré ml_novedades_competencia para registrar el primer punto.`;
      const f = (t) => new Date(t).toLocaleDateString('es-AR');
      const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      let filas, resumen = '';
      if (r.objetivo.tipo === 'publicacion') {
        filas = r.puntos.map((p, i) => {
          const ant = r.puntos[i - 1];
          const delta = ant && ant.precio ? ` (${p.precio >= ant.precio ? '+' : '−'}${Math.abs((p.precio - ant.precio) / ant.precio * 100).toFixed(1)}%)` : '';
          return `| ${f(p.t)} | ${dinero(p.precio)}${delta} | ${p.vendidos ?? '—'} |`;
        });
        filas.unshift('| Fecha | Precio | Vendidos |', '| --- | --- | --- |');
        const precios = r.puntos.map((p) => p.precio);
        const primero = r.puntos[0], ultimo = r.puntos[r.puntos.length - 1];
        const total = primero.precio ? ((ultimo.precio - primero.precio) / primero.precio * 100).toFixed(1) : '0';
        resumen = `\n**Resumen:** ${dinero(Math.min(...precios))} mínimo · ${dinero(Math.max(...precios))} máximo · ${total > 0 ? '+' : ''}${total}% desde el primer registro` +
          (ultimo.vendidos != null && primero.vendidos != null ? ` · ~${Math.max(0, ultimo.vendidos - primero.vendidos)} ventas en el período` : '');
      } else if (r.objetivo.tipo === 'busqueda') {
        filas = ['| Fecha | Líder | Precio líder |', '| --- | --- | --- |', ...r.puntos.map((p) => `| ${f(p.t)} | ${p.lider} | ${dinero(p.precioLider)} |`)];
      } else {
        filas = ['| Fecha | Publicaciones | Precio mediana |', '| --- | --- | --- |', ...r.puntos.map((p) => `| ${f(p.t)} | ${p.publicaciones} | ${p.precioMediana ? dinero(p.precioMediana) : '—'} |`)];
      }
      return `# Historial: ${r.objetivo.tipo} ${r.objetivo.ref}\n(${r.puntos.length} registro(s) — se suma uno con cada control)\n\n` + filas.join('\n') + resumen;
    },
  },
  {
    name: 'ml_descubrir_ganadores', title: 'Descubrir artículos ganadores', readOnly: true,
    description: 'Encuentra artículos ganadores dentro de lo que permite la API: por CATEGORÍA usa el ranking oficial de más vendidos (highlights) + las tendencias de esa categoría; por BÚSQUEDA analiza el mercado de una keyword (competencia, precios, envío gratis, vendedores que dominan y ventas visibles). Indicar categoria (id tipo MLA1234) o busqueda (keyword).',
    schema: { ...cuentaParam, categoria: z.string().optional().describe('ID de categoría, ej MLA1055'), busqueda: z.string().optional().describe('Keyword a analizar, ej "termo 1 litro"'), sitio: z.string().optional() },
    async run(args) {
      const c = cliente(args);
      const sitio = args.sitio || (await c.get('/users/me')).site_id || 'MLA';
      const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      if (args.categoria) {
        const hl = await c.get(`/highlights/${sitio}/category/${args.categoria}`);
        const ids = (hl.content || []).filter((x) => x.type === 'ITEM').slice(0, 20);
        let detalles = {};
        if (ids.length) {
          const multi = await c.get('/items', { ids: ids.map((x) => x.id).join(',') });
          for (const m of multi) if (m.code === 200) detalles[m.body.id] = m.body;
        }
        const filas = ids.map((x) => {
          const b = detalles[x.id] || {};
          return `${x.position}. **${b.title || x.id}** — ${b.price ? dinero(b.price) : 's/d'}${b.sold_quantity ? ` · ${b.sold_quantity} vendidos` : ''}${b.catalog_listing ? ' · 🏷️ catálogo' : ''}`;
        });
        let trends = [];
        try { const t = await c.get(`/trends/${sitio}/${args.categoria}`); trends = (Array.isArray(t) ? t : []).slice(0, 8).map((x) => x.keyword); } catch {}
        return `# 🏆 Artículos ganadores — categoría ${args.categoria}\n\n## Ranking oficial de más vendidos (highlights de MercadoLibre)\n` + (filas.length ? filas.join('\n') : 'Esta categoría no publica ranking de más vendidos.') +
          (trends.length ? `\n\n## 📈 Qué está buscando la gente en la categoría\n` + trends.map((k, i) => `${i + 1}. ${k}`).join('\n') : '') +
          `\n\n**Cómo leerlo:** un producto que está en el ranking Y coincide con una tendencia es demanda validada. Antes de entrar: ml_buscar para medir la competencia de esa keyword y ml_comisiones para validar el margen.`;
      }
      if (args.busqueda) {
        const r = await c.get(`/sites/${sitio}/search`, { q: args.busqueda, limit: 20 });
        const items = r.results || [];
        if (!items.length) return `Sin resultados para "${args.busqueda}".`;
        const total = r.paging?.total ?? items.length;
        const precios = items.map((x) => x.price).filter((n) => n > 0).sort((a, b) => a - b);
        const mediana = precios[Math.floor(precios.length / 2)];
        const gratis = items.filter((x) => x.shipping?.free_shipping).length;
        const porVendedor = {};
        for (const x of items) { const v = x.seller?.nickname || String(x.seller?.id || '?'); porVendedor[v] = (porVendedor[v] || 0) + 1; }
        const dominan = Object.entries(porVendedor).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
        let enTendencias = false;
        try { const t = await c.get(`/trends/${sitio}`); enTendencias = (Array.isArray(t) ? t : []).some((x) => x.keyword.toLowerCase().includes(args.busqueda.toLowerCase()) || args.busqueda.toLowerCase().includes(x.keyword.toLowerCase())); } catch {}
        const top = items.slice(0, 5).map((x, i) => `${i + 1}. **${x.title}** — ${dinero(x.price)} · ${x.seller?.nickname || '—'}${x.sold_quantity ? ` · ${x.sold_quantity} vendidos` : ''}${x.shipping?.free_shipping ? ' · 🚚 gratis' : ''}`);
        return `# 🔎 Análisis de mercado: "${args.busqueda}"\n\n- **Competencia:** ${total.toLocaleString('es-AR')} publicaciones compitiendo\n- **Precios (top 20):** ${dinero(precios[0])} a ${dinero(precios[precios.length - 1])} · mediana ${dinero(mediana)}\n- **Envío gratis:** ${gratis}/${items.length} del top lo ofrecen${gratis / items.length > 0.6 ? ' (casi obligatorio para competir)' : ''}\n- **En tendencias del sitio:** ${enTendencias ? '✅ SÍ — demanda validada' : 'no aparece hoy'}\n` +
          (dominan.length ? `- **Vendedores que dominan el top:** ${dominan.map(([v, n]) => `${v} (${n})`).join(', ')}\n` : '- **Top repartido:** ningún vendedor domina — más fácil entrar\n') +
          `\n## Top 5 del momento\n` + top.join('\n') +
          `\n\n**Señal de oportunidad:** ${enTendencias && !dominan.length ? '🟢 ALTA — demanda validada y top repartido' : enTendencias ? '🟡 MEDIA — hay demanda pero el top tiene dueños' : '⚪ a validar — medí la demanda con ml_tendencias de la categoría'}. Validá margen con ml_comisiones antes de entrar, y sumá la búsqueda a la vigilancia (ml_vigilar) para ver su evolución.`;
      }
      return 'Indicá categoria (ej MLA1055) para el ranking de más vendidos, o busqueda (keyword) para el análisis de mercado.';
    },
  },
  // ───────────────────────────── Tendencias ─────────────────────────────
  {
    name: 'ml_tendencias', title: 'Tendencias de búsqueda', readOnly: true,
    description: 'Las búsquedas más populares del sitio o de una categoría: qué está queriendo comprar la gente.',
    schema: { ...cuentaParam, categoria: z.string().optional(), sitio: z.string().optional() },
    async run(args) {
      const c = cliente(args);
      const sitio = args.sitio || (await c.get('/users/me')).site_id || 'MLA';
      const r = await c.get(`/trends/${sitio}${args.categoria ? '/' + args.categoria : ''}`);
      const ts = (Array.isArray(r) ? r : []).slice(0, 20);
      return `## Tendencias en ${sitio}${args.categoria ? ' · ' + args.categoria : ''}\n` + ts.map((t, i) => `${i + 1}. ${t.keyword}`).join('\n');
    },
  },
];

export { MeliError };
