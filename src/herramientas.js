// src/herramientas.js — Herramientas MCP para vendedores, contra la API oficial de ML.
import { z } from 'zod';
import { MeliClient, MeliError, listarCuentas, urlDeAutorizacion, canjearCode, borrarCuenta } from './meli.js';

const money = (n, moneda = '$') => n == null ? '—' : `${moneda} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
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
        const redirectUri = process.env.ML_REDIRECT_URI || 'https://kokesaurio.github.io/meli-sellers-mcp/conectar.html';
        const url = urlDeAutorizacion({ appId, sitio: args.sitio || process.env.ML_SITE || 'MLA', redirectUri });
        return `Abrí este link, inicia sesión con tu cuenta de MercadoLibre y autorizá:\n\n${url}\n\nAl terminar vas a ver un código: pasámelo y completo la conexión (ml_conectar con code).\n\nImportante: la redirect URI de tu app en el DevCenter tiene que incluir exactamente:\n${redirectUri}`;
      }
      const r = await canjearCode({ appId, appSecret, code: args.code });
      return `✅ Cuenta conectada: **${r.nickname}** (${r.sitio}, user_id ${r.user_id}). Ya podés pedirme ventas, publicaciones, preguntas y más.`;
    },
  },
  {
    name: 'ml_cuentas', title: 'Cuentas conectadas', readOnly: true,
    description: 'Lista las cuentas de MercadoLibre conectadas en esta computadora.',
    schema: {},
    async run() {
      const cs = listarCuentas();
      if (!cs.length) return 'No hay cuentas conectadas todavía. Usá ml_conectar para vincular la primera.';
      return '## Cuentas conectadas\n' + cs.map((c) => `- **${c.nickname}** (${c.sitio}) — user_id ${c.user_id}`).join('\n');
    },
  },
  {
    name: 'ml_desconectar', title: 'Desconectar cuenta', readOnly: false,
    description: 'Elimina los tokens guardados de una cuenta (deja de estar conectada en esta computadora).',
    schema: { cuenta: z.string().describe('user_id de la cuenta a desconectar') },
    async run(args) { return borrarCuenta(args.cuenta) ? `Cuenta ${args.cuenta} desconectada y tokens borrados.` : `La cuenta ${args.cuenta} no estaba conectada.`; },
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
    name: 'ml_metricas', title: 'Métricas de ventas', readOnly: true,
    description: 'Facturación, unidades y ticket promedio de un período, comparado contra el período anterior. Ideal para "¿cómo vienen las ventas?".',
    schema: { ...cuentaParam, dias: z.number().optional().describe('Tamaño del período en días (default 7)') },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c); const dias = args.dias ?? 7;
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
