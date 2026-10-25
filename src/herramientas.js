// src/herramientas.js — Herramientas MCP para vendedores, contra la API oficial de ML.
import { z } from 'zod';
import { MeliClient, MeliError, listarCuentas, urlDeAutorizacion, canjearCode, borrarCuenta, fijarPredeterminada } from './meli.js';
import { VERSION, chequearActualizacion } from './version.js';
import { leerCerebro, saberDe, aprender, olvidar, normalizarSku, skuDeItem, vincularSku, costoDeSku, publicacionesDeSku } from './cerebro.js';
import { armarResultados, resultadosEnMarkdown, conectarDrive, desconectarDrive, configDrive, claveDrive, exportarADrive, detectarCarpetaDrive, CARPETA_NOMBRE } from './resultados.js';
import { auditarItem } from './auditoria.js';
import { muestraDeMercado, pulsoDeVisitas, analizarNicho, senal } from './nichos.js';
import { revisarDescripcion, material, estadoVideo, traerClips as traerClipsML, preguntasRecientes, auditarPreguntas, armarMejorada, respaldar, fotosDe, FAQ_MAXIMO, DIAS_PREGUNTAS } from './mejorador.js';
import { generarTablero, abrirEnNavegador } from './tablero.js';
import { pathToFileURL } from 'node:url';
import { resumenContable, enviosRecientes, inicioDeMes, nombreMes, comisionML, rentabilidadDe } from './negocio.js';
import { fechasComerciales, cronogramaML, estadoDecision, diasHasta, tipoLegible, ICONO_DECISION } from './agenda.js';
import { faltantes, agrupar, preguntasRespondidas, armarDescripcion, quitarBloque as quitarBloqueFAQ, INICIO as FAQ_INICIO } from './faq.js';
import { estadoDB, leerMediciones, precioSinCambiosDesde, backupDB, RETENCION_DIAS, NODE_MINIMO } from './db.js';
import { decidir, confirmarFecha, agregarFechaPropia, jefe, nombrarJefe } from './trabajadores.js';
import { EQUIPO, IDS, etiqueta, resumenAlertas, resolverTrabajador, leerEquipo, asignarTarea, quitarTarea, tareasDe, actualizarEquipo, correrCiclo, leerBandeja, quienCorre, INTERVALO_MINIMO } from './trabajadores.js';
import { leerVigilancia, agregarObjetivo, quitarObjetivo, claveDe, tomarSnapshot, compararSnapshots, guardarVigilancia, registrarHistorial, leerHistorial } from './vigilancia.js';

const money = (n, moneda = '$') => n == null ? '—' : `${moneda} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const cadaCuanto = (min) => min >= 1440 && min % 1440 === 0 ? `cada ${min / 1440} día${min === 1440 ? '' : 's'}` : min >= 60 && min % 60 === 0 ? `cada ${min / 60} h` : `cada ${min} min`;
const sinAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const cliente = (args) => new MeliClient({ userId: args?.cuenta });
const cuentaParam = { cuenta: z.string().optional().describe('user_id de la cuenta de ML si hay varias conectadas (ver ml_cuentas)') };

async function sellerId(c) { return (await c.get('/users/me')).id; }

// ── Multicuenta: ¿de cuál de tus tiendas es esta publicación? Así no hace falta decir la cuenta ──
const nombreTienda = (t) => (t ? t.nickname || String(t.user_id) : 'tu tienda');
async function tiendaDelItem(args, id) {
  const cuentas = listarCuentas();
  const b = await cliente(args).get(`/items/${id}`);
  const duena = b.seller_id != null ? cuentas.find((x) => String(x.user_id) === String(b.seller_id)) : null;
  if (duena) return { c: cliente({ cuenta: String(duena.user_id) }), b, tienda: duena, propia: true };
  if (b.seller_id != null) return { c: cliente(args), b, tienda: null, propia: false };
  // ML no informó el vendedor: queda la tienda indicada (o la predeterminada)
  const t = cuentas.find((x) => String(x.user_id) === String(args.cuenta)) || cuentas.find((x) => x.predeterminada) || cuentas[0] || null;
  return { c: cliente(args), b, tienda: t, propia: true };
}
/** Las otras publicaciones con este SKU en TODAS tus tiendas conectadas. */
async function mismoSkuEnTiendas(sku, exceptoId) {
  const out = [];
  for (const t of listarCuentas()) {
    const c = cliente({ cuenta: String(t.user_id) });
    let ids = [];
    try { ids = (await c.get(`/users/${t.user_id}/items/search`, { seller_sku: sku, limit: 50 })).results || []; } catch { continue; }
    for (const id of ids) {
      if (id === exceptoId || out.some((x) => x.id === id)) continue;
      let b; try { b = await c.get(`/items/${id}`); } catch { continue; }
      if (skuDeItem(b) !== sku) continue; // la búsqueda de ML es amplia: confirmamos el SKU exacto
      if (b.seller_id != null && String(b.seller_id) !== String(t.user_id)) continue;
      out.push({ id, c, b, tienda: t });
    }
  }
  return out;
}
/** Barrido del mejorador: todas las tiendas (o la indicada), sin fotos, de la que más le falta a la que menos. */
async function barridoMejorador(args) {
  const todas = listarCuentas();
  if (!todas.length) return 'No hay tiendas conectadas: usá ml_conectar.';
  const tiendas = args.cuenta ? todas.filter((t) => String(t.user_id) === String(args.cuenta)) : todas;
  if (!tiendas.length) return `La cuenta ${args.cuenta} no está conectada (ml_cuentas).`;
  const maximo = Math.min(Math.max(1, Math.round(args.maximo ?? 15)), 50);
  const ok = (x) => (x ? '✅' : '❌');
  const porSku = new Map(), bloques = [];
  for (const t of tiendas) {
    const c = cliente({ cuenta: String(t.user_id) });
    let ids = [];
    try { ids = (await c.get(`/users/${t.user_id}/items/search`, { status: 'active', limit: maximo })).results || []; } catch (e) { bloques.push(`## 🏪 ${nombreTienda(t)}\n⚠️ No pude leer sus publicaciones: ${e.message}`); continue; }
    ids = ids.slice(0, maximo);
    const filas = [];
    for (let k = 0; k < ids.length; k += 20) {
      let lote = []; try { lote = await c.get('/items', { ids: ids.slice(k, k + 20).join(',') }); } catch {}
      for (const r of Array.isArray(lote) ? lote : []) {
        const b = r?.body; if (!b?.id) continue;
        let desc = ''; try { desc = (await c.get(`/items/${b.id}/description`)).plain_text || ''; } catch {}
        const rev = revisarDescripcion(quitarBloqueFAQ(desc), b.title);
        const ch = Object.fromEntries(rev.chequeos.map((x) => [x.id, x.ok]));
        const pq = await preguntasRecientes(c, b.id, { maximo: 50 }).catch(() => []);
        const sinResp = pq.filter((q) => !q.answer?.text).length;
        const faltas = rev.chequeos.filter((x) => !x.ok).length + (b.video_id ? 0 : 1);
        const sku = skuDeItem(b);
        if (sku) { const g = porSku.get(sku) || []; g.push({ id: b.id, tienda: t }); porSku.set(sku, g); }
        filas.push({ faltas, fila: `| ${b.id} ${String(b.title || '').slice(0, 40)} | ${ok(ch.resumen)} | ${ok(ch.medidas)} | ${ok(ch.caracteristicas)} | ${ok(ch.incluye)} | ${ok(!!b.video_id)} | ${pq.length >= 50 ? '50+' : pq.length}${sinResp ? ` (${sinResp} sin responder)` : ''} | ${faltas} |` });
      }
    }
    filas.sort((a, b) => b.faltas - a.faltas);
    bloques.push([`## 🏪 ${nombreTienda(t)} — ${filas.length} publicación(es) activa(s) revisada(s)`,
      filas.length ? '| Publicación | Resumen (5 renglones) | Medidas | Características | Qué viene | Video | Preguntas 90 días | A arreglar |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' + filas.map((x) => x.fila).join('\n') : '_Sin publicaciones activas._',
      filas.length ? `${filas.filter((x) => x.faltas === 0).length} de ${filas.length} con la receta completa.` : ''].filter(Boolean).join('\n'));
  }
  const repetidos = [...porSku.entries()].filter(([, g]) => new Set(g.map((x) => x.tienda.user_id)).size > 1);
  return [`# 🛠️ Mejorador — barrido de ${tiendas.length} tienda(s)`, '', ...bloques,
    ...(repetidos.length ? ['', '## 🔁 El mismo producto en varias tiendas (por SKU)', ...repetidos.map(([sku, g]) => `- **${sku}**: ${g.map((x) => `${x.id} (${nombreTienda(x.tienda)})`).join(' · ')} → mejorá una y aplicala a todas con \`ml_aplicar_mejora item_id=${g[0].id} mismo_sku=true\``)] : []),
    '', 'El video acá cuenta solo el video clásico; los clips y las **medidas en las fotos** se revisan de a una: `ml_mejorar_publicacion item_id=…` (empezá por las de más ❌).'].join('\n');
}

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
    description: 'CREA una publicación real en la tienda. Con `copiar_de` clona una publicación existente (título, categoría, atributos, fotos, descripción) y permite pisar título/precio/stock — ideal para duplicar entre tus propias cuentas. Usar solo con confirmación explícita del usuario. COSTO POR SKU: si la publicación tiene SKU (parámetro sku, o el que trae copiar_de) y ese SKU ya tiene costo en el cerebro, la nueva publicación usa ese costo sola. Si no hay costo para ese SKU, la herramienta NO publica y pide el costo: preguntárselo al vendedor y volver a llamar con costo=… (o sin_costo=true si no lo quiere cargar).',
    schema: { ...cuentaParam,
      copiar_de: z.string().optional().describe('item_id a clonar (ej MLA123...). Solo copiar fotos/textos si son propios'),
      titulo: z.string().optional().describe('Título (≤60 caracteres). Obligatorio si no hay copiar_de'),
      precio: z.number().optional(), stock: z.number().optional(),
      categoria: z.string().optional().describe('ID de categoría ML (obligatorio sin copiar_de)'),
      descripcion: z.string().optional(), condicion: z.enum(['new', 'used']).optional(),
      tipo: z.string().optional().describe('listing_type_id, ej gold_special (Clásica)'),
      imagenes: z.array(z.string()).optional().describe('URLs de fotos propias'),
      sku: z.string().max(60).optional().describe('SKU del producto (se carga en la publicación). Las publicaciones con el mismo SKU comparten el costo'),
      costo: z.number().min(0).optional().describe('Costo del producto (lo que te sale a vos). Solo si el SKU no tiene costo guardado o el vendedor lo quiere cambiar'),
      sin_costo: z.boolean().optional().describe('true = publicar sin cargar costo (el vendedor no lo quiere dar ahora)') },
    async run(args) {
      const c = cliente(args);
      let base = {}, descripcionOrigen = null, o = null;
      if (args.sku != null && !normalizarSku(args.sku)) return 'Ese SKU no es válido (hasta 60 caracteres, sin caracteres de control).';
      if (args.copiar_de) {
        o = await c.get(`/items/${args.copiar_de}`);
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
      if (args.sku != null) cuerpo.attributes = [...(cuerpo.attributes || []).filter((a) => a.id !== 'SELLER_SKU'), { id: 'SELLER_SKU', value_name: args.sku.replace(/\s+/g, ' ').trim() }];
      // 💰 Costo por SKU: el mismo producto en otra publicación ya nos dice cuánto cuesta
      const sku = normalizarSku(args.sku) || skuDeItem(o);
      const costoSku = sku ? costoDeSku(sku) : null;
      if (args.costo == null && costoSku == null && !args.sin_costo) {
        return `✋ Antes de publicar: **¿cuánto te cuesta este producto?** (lo que te sale a vos, con IVA si corresponde)\n\n${sku ? `El SKU **${sku}** todavía no tiene costo cargado. Lo guardo en el SKU y lo van a usar todas las publicaciones con ese SKU, así no te lo vuelvo a preguntar.` : 'La publicación no tiene SKU: pasame también el SKU si querés que el costo se comparta con otras publicaciones del mismo producto.'}\n\nDecime el costo y la publico (o decime "publicala sin costo").`;
      }
      if (cuerpo.currency_id == null) cuerpo.currency_id = 'ARS';
      if (cuerpo.condition == null) cuerpo.condition = 'new';
      if (cuerpo.listing_type_id == null) cuerpo.listing_type_id = 'gold_special';
      if (cuerpo.available_quantity == null) cuerpo.available_quantity = 1;
      const nuevo = await c.post('/items', cuerpo);
      const texto = args.descripcion ?? descripcionOrigen;
      if (texto) { try { await c.post(`/items/${nuevo.id}/description`, { plain_text: texto }); } catch {} }
      let lineaCosto = '';
      if (nuevo.id) {
        if (args.costo != null) {
          aprender(nuevo.id, { costo: args.costo }, { sku });
          lineaCosto = sku ? (costoSku != null && costoSku !== args.costo ? `💰 Costo del SKU **${sku}** actualizado de ${money(costoSku)} a ${money(args.costo)}: vale para todas sus publicaciones.` : `💰 Costo ${money(args.costo)} guardado en el SKU **${sku}**: vale para todas sus publicaciones.`) : `💰 Costo ${money(args.costo)} guardado para esta publicación.`;
        } else if (costoSku != null) {
          vincularSku(nuevo.id, sku);
          const de = leerCerebro().skus?.[sku]?.de;
          lineaCosto = `💰 Costo ${money(costoSku)} tomado del SKU **${sku}**${de && de !== sku ? ` (el mismo producto que ${de})` : ''}: ya cuenta para la rentabilidad y los números.`;
        } else lineaCosto = '⚠️ Publicada sin costo cargado: los números de este producto van a salir parciales hasta que me lo digas.';
      }
      return `✅ Publicación creada: **${nuevo.id}** — ${nuevo.title ?? cuerpo.title} a ${money(nuevo.price ?? cuerpo.price, cuerpo.currency_id)}\n${nuevo.permalink ?? ''}\nQueda en estado ${nuevo.status ?? 'active'}: revisala en tu panel de MercadoLibre.${lineaCosto ? '\n' + lineaCosto : ''}`;
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
    name: 'ml_mejorar_publicacion', title: 'Mejorador de publicaciones (revisión)', readOnly: true,
    description: 'El mejorador de publicaciones, MULTICUENTA: con item_id revisa UNA publicación de cualquiera de tus tiendas conectadas (encuentra sola de qué tienda es, no hace falta decir la cuenta) contra la receta que convierte y devuelve el checklist con lo que falta. (1) FOTOS CON MEDIDAS: te muestra las fotos para que las mires — revisá cada imagen y decí si alguna tiene las medidas dibujadas (cotas con cm/mm/L/kg); si ninguna, es un ❌ (se arregla con la skill imagenes-ml). (2) VIDEO: video clásico o clips publicados. (3) DESCRIPCIÓN en este orden: los 5 primeros renglones con el RESUMEN de todo el producto, después MEDIDAS, CARACTERÍSTICAS PRINCIPALES y QUÉ VIENE EN LA CAJA. (4) PREGUNTAS DE LOS ÚLTIMOS 90 DÍAS: las audita (cuántas, cuántas sin responder, de qué temas preguntan) y las resume en un FAQ de 20 preguntas con las respuestas reales del vendedor. Avisa si el mismo producto (mismo SKU) está en tus otras tiendas. SIN item_id hace un BARRIDO de todas tus tiendas (o de la indicada en cuenta): las publicaciones activas de cada una, de la que más le falta a la que menos, y agrupa el mismo producto entre tiendas. No modifica nada: para aplicar, ml_aplicar_mejora con el OK del vendedor.',
    schema: { ...cuentaParam, item_id: z.string().optional().describe('La publicación (MLA...). Sin item_id: barrido de todas tus tiendas'),
      fotos: z.boolean().optional().describe('false = no traer las fotos (más rápido)'),
      maximo: z.number().optional().describe('Barrido: publicaciones activas por tienda (default 15, máx 50)') },
    async run(args) {
      if (!args.item_id) return await barridoMejorador(args);
      const id = String(args.item_id || '').trim().toUpperCase();
      if (!/^M[A-Z]{2}\d+$/.test(id)) return 'item_id inválido: tiene que ser como MLA123456789.';
      const { c, b, tienda, propia } = await tiendaDelItem(args, id);
      let desc = ''; try { desc = (await c.get(`/items/${id}/description`)).plain_text || ''; } catch {}
      const sku = skuDeItem(b), sabido = saberDe(id, sku);
      const [video, preguntas, imagenes, gemelas] = await Promise.all([
        estadoVideo(c, b), preguntasRecientes(c, id).catch(() => []), args.fotos === false ? [] : fotosDe(b), sku && propia ? mismoSkuEnTiendas(sku, id).catch(() => []) : []]);
      const rev = revisarDescripcion(quitarBloqueFAQ(desc), b.title);
      const aud = auditarPreguntas(preguntas);
      const mat = material(b, sabido);
      const ok = (x) => (x ? '✅' : '❌');
      const nFotos = (b.pictures || []).length, vistas = imagenes.filter(Boolean).length;
      const medidasEsperadas = mat.medidas.length ? ` Medidas que deberían verse: ${mat.medidas.slice(0, 4).join(' · ')}.` : '';
      const ch = Object.fromEntries(rev.chequeos.map((x) => [x.id, x]));
      const lineas = [
        `# 🛠️ Mejorador — ${id} «${b.title}»`,
        propia ? `🏪 Tienda **${nombreTienda(tienda)}**${sku ? ` · SKU ${sku}` : ''}` : '⚠️ Esta publicación **no es de tus tiendas conectadas**: te muestro la revisión, pero no se puede aplicar.', '',
        '## Checklist',
        `- 📏 **Medidas en las fotos:** 👀 ${vistas ? `te muestro ${vistas} de ${nFotos} foto(s) abajo, en orden (foto 1 = portada). **Claude: mirá cada una y decí si alguna tiene las medidas dibujadas (cotas con números y unidad).** Si ninguna, es ❌ y se arma con la skill imagenes-ml (foto de medidas).` : nFotos ? 'no pude traer las fotos: abrí la publicación y fijate si alguna tiene las medidas dibujadas.' : '❌ la publicación no tiene fotos.'}${medidasEsperadas}`,
        `- 🎬 **Video:** ${ok(video.ok)} ${video.video ? 'tiene video' : ''}${video.video && video.clips ? ' y ' : ''}${video.clips ? `${video.clips} clip(s) publicado(s)` : ''}${!video.ok ? (video.revision ? `${video.revision} clip(s) en revisión (24-48 hs)` : 'sin video ni clips: hacé uno con la skill video-publicaciones-ml o ugc-ml') : ''}`,
        `- 📝 **Resumen en los 5 primeros renglones:** ${ok(ch.resumen.ok)} ${ch.resumen.texto}`,
        `- 📐 **Medidas:** ${ok(ch.medidas.ok)} ${ch.medidas.texto}`,
        `- ⭐ **Características principales:** ${ok(ch.caracteristicas.ok)} ${ch.caracteristicas.texto}`,
        `- 📦 **Qué viene en la caja:** ${ok(ch.incluye.ok)} ${ch.incluye.texto}`,
        `- ↕️ **Orden:** ${ok(ch.orden.ok)} ${ch.orden.texto}`,
        `- ❓ **Preguntas de los últimos ${DIAS_PREGUNTAS} días:** ${aud.total} (${aud.respondidas} respondidas${aud.sinResponder ? `, **${aud.sinResponder} sin responder**` : ''}) → FAQ de ${aud.faq.length} pregunta(s)${aud.faq.length < FAQ_MAXIMO ? ` (con tus respuestas de ${DIAS_PREGUNTAS} días no alcanzan para ${FAQ_MAXIMO}: no invento preguntas)` : ''}`,
      ];
      if (gemelas.length) lineas.push('', `## 🔁 El mismo producto en tus otras publicaciones (SKU ${sku})`, ...gemelas.map((g) => `- ${g.id} en **${nombreTienda(g.tienda)}**`), `Mejorala una vez y aplicala a todas con \`ml_aplicar_mejora item_id=${id} mismo_sku=true\`: cada una se queda con el FAQ de SUS preguntas.`);
      if (aud.temas.length) lineas.push('', `## De qué te preguntan (${DIAS_PREGUNTAS} días)`, aud.temas.slice(0, 8).map(([t, n]) => `${t} ${n}`).join(' · ') + (aud.temas.find(([t]) => t === 'medidas') && !ch.medidas.ok ? '\n⚠️ Te preguntan las medidas y la descripción no las tiene: es lo primero para arreglar.' : ''));
      lineas.push('', '## Material para la descripción nueva (de tu ficha técnica y el cerebro)',
        `**Medidas:** ${mat.medidas.length ? mat.medidas.join(' · ') : '_no están en la ficha ni en el cerebro: pedíselas al vendedor_'}`,
        `**Características:** ${mat.caracteristicas.length ? mat.caracteristicas.join(' · ') : '_sacalas de la descripción actual o pedíselas al vendedor_'}`,
        `**Qué viene en la caja:** ${mat.incluye.length ? mat.incluye.join(' · ') : '_no está cargado: pedíselo al vendedor_'}`,
        '', '<details><summary>Descripción actual</summary>', '', '```', desc.slice(0, 6000) || '(vacía)', '```', '</details>');
      if (aud.faq.length) lineas.push('', `## FAQ propuesto (${aud.faq.length} preguntas, tus respuestas reales)`, ...aud.faq.map((g, i) => `${i + 1}. **${g.pregunta}** (${g.veces} ${g.veces === 1 ? 'vez' : 'veces'}) → ${g.respuesta}`), '_Descarté stock, precio, cuotas, envíos y cualquier respuesta con datos de contacto._');
      lineas.push('', '## Siguiente paso',
        'Con este material, Claude arma la descripción nueva: **resumen en 3 a 5 renglones** (qué es, para qué sirve, lo que lo diferencia, la medida clave y qué trae), **medidas**, **características principales** y **qué viene en la caja** — usando solo datos reales (ficha, cerebro, descripción actual o lo que diga el vendedor). Mostrala al vendedor y, con su OK, `ml_aplicar_mejora item_id=' + id + (gemelas.length ? ' (y mismo_sku=true para todas sus tiendas)' : '') + '` (el FAQ de ' + DIAS_PREGUNTAS + ' días se agrega solo al final). Si las fotos no tienen medidas: skill imagenes-ml. Si falta video: skill video-publicaciones-ml.');
      return { texto: lineas.join('\n'), imagenes: imagenes.filter(Boolean) };
    },
  },
  {
    name: 'ml_aplicar_mejora', title: 'Mejorador de publicaciones (aplicar)', readOnly: false,
    description: 'MODIFICA la descripción real de una publicación (de cualquiera de tus tiendas: encuentra sola de cuál es) con la estructura que convierte: el RESUMEN en los 5 primeros renglones (3 a 5 renglones), después MEDIDAS, CARACTERÍSTICAS PRINCIPALES, QUÉ VIENE EN LA CAJA, lo extra que haya que conservar, y al final las PREGUNTAS FRECUENTES: las 20 de los últimos 90 días con las respuestas reales del vendedor (se calculan solas). Con mismo_sku=true la aplica también a TODAS las publicaciones con el mismo SKU en todas tus tiendas conectadas, cada una con el FAQ de SUS propias preguntas. Los textos los escribe Claude con datos reales (ml_mejorar_publicacion trae el material): nunca inventar medidas ni características. Sin confirmar=true solo muestra cómo quedaría; con confirmar=true la escribe (solo con OK explícito del vendedor) y guarda antes un respaldo de cada descripción anterior. Valida: sin HTML, sin datos de contacto ni links, medidas con número y unidad.',
    schema: { ...cuentaParam, item_id: z.string().describe('La publicación (MLA...)'),
      resumen: z.array(z.string()).describe('3 a 5 renglones: el resumen de todo el producto'),
      medidas: z.array(z.string()).describe('Renglones de medidas (ej "Alto: 27 cm")'),
      caracteristicas: z.array(z.string()).describe('Características principales, un renglón cada una'),
      incluye: z.array(z.string()).describe('Qué viene en la caja, un renglón por cosa'),
      extra: z.array(z.string()).optional().describe('Texto de la descripción actual que haya que conservar (garantía, uso, cuidados)'),
      faq: z.boolean().optional().describe('false = no agregar las preguntas frecuentes'),
      mismo_sku: z.boolean().optional().describe('true = aplicarla también a las publicaciones con el mismo SKU en todas tus tiendas'),
      confirmar: z.boolean().optional().describe('true = escribirla en MercadoLibre (solo con OK explícito del vendedor)') },
    async run(args) {
      const id = String(args.item_id || '').trim().toUpperCase();
      if (!/^M[A-Z]{2}\d+$/.test(id)) return 'item_id inválido: tiene que ser como MLA123456789.';
      const base = await tiendaDelItem(args, id);
      if (!base.propia) return `No la toqué: ${id} no es de ninguna de tus tiendas conectadas (ml_cuentas).`;
      const sku = skuDeItem(base.b);
      if (args.mismo_sku && !sku) return `${id} no tiene SKU cargado, así que no puedo encontrar el mismo producto en tus otras tiendas. Cargale el SKU en MercadoLibre, o aplicala sin mismo_sku.`;
      const destinos = [{ id, c: base.c, b: base.b, tienda: base.tienda }, ...(args.mismo_sku ? await mismoSkuEnTiendas(sku, id) : [])];
      const textos = { resumen: args.resumen, medidas: args.medidas, caracteristicas: args.caracteristicas, incluye: args.incluye, extra: args.extra };
      try { armarMejorada('', { ...textos, faq: [] }); } catch (e) { return `No la armé: ${e.message}. Corregilo y volvé a intentar.`; }
      // Cada publicación con SU descripción actual y el FAQ de SUS preguntas
      for (const d of destinos) {
        d.actual = ''; try { d.actual = (await d.c.get(`/items/${d.id}/description`)).plain_text || ''; } catch {}
        const aud = args.faq === false ? { faq: [] } : auditarPreguntas(await preguntasRecientes(d.c, d.id).catch(() => []));
        try { d.nueva = armarMejorada(args.faq === false ? '' : d.actual, { ...textos, faq: aud.faq }); } catch (e) { d.error = e.message; }
        d.nFaq = d.nueva ? (d.nueva.match(/^¿/gm) || []).length : 0;
      }
      const [p0] = destinos;
      if (p0.error) return `No la armé: ${p0.error}. Corregilo y volvé a intentar.`;
      const rev = revisarDescripcion(quitarBloqueFAQ(p0.nueva), p0.b.title);
      const quien = (d) => `${d.id} (${nombreTienda(d.tienda)})`;
      if (!args.confirmar) {
        return [`# 🛠️ Así quedaría la descripción de ${quien(p0)}`, '', '```', p0.nueva, '```', '',
          `Estructura: ${rev.chequeos.map((x) => `${x.ok ? '✅' : '❌'} ${x.id}`).join(' · ')} · ❓ ${p0.nFaq} preguntas frecuentes · ${p0.nueva.length.toLocaleString('es-AR')} caracteres.`,
          ...(destinos.length > 1 ? ['', `## 🔁 También se aplicaría en ${destinos.length - 1} publicación(es) con el SKU ${sku}`, ...destinos.slice(1).map((d) => `- ${quien(d)}: ${d.error ? '⚠️ ' + d.error : `misma estructura, con ${d.nFaq} preguntas frecuentes de SUS compradores`}`)] : args.mismo_sku ? ['', `No encontré otras publicaciones con el SKU ${sku} en tus tiendas: se aplica solo a esta.`] : []),
          '', `No toqué nada. ¿La aplico? (ml_aplicar_mejora … ${args.mismo_sku ? 'mismo_sku=true ' : ''}confirmar=true). Antes de escribir guardo un respaldo de cada descripción actual.`].join('\n');
      }
      const hechas = [], fallidas = [];
      for (const d of destinos) {
        if (d.error) { fallidas.push(`${quien(d)}: ${d.error}`); continue; }
        try { d.respaldo = respaldar(d.id, d.actual); await d.c.put(`/items/${d.id}/description?api_version=2`, { plain_text: d.nueva }); hechas.push(d); }
        catch (e) { fallidas.push(`${quien(d)}: ${e.message}`); }
      }
      return [`# ✅ Descripción mejorada en ${hechas.length} publicación(es)`, '',
        `- Estructura: ${rev.chequeos.map((x) => `${x.ok ? '✅' : '❌'} ${x.id}`).join(' · ')}`,
        ...hechas.map((d) => `- **${quien(d)}** · ❓ ${d.nFaq} preguntas frecuentes de los últimos ${DIAS_PREGUNTAS} días · 💾 respaldo en \`${d.respaldo}\``),
        ...(fallidas.length ? ['', '⚠️ No se pudo en:', ...fallidas.map((x) => '- ' + x)] : []),
        '', 'Lucía las vuelve a revisar en su próxima auditoría. Si las fotos no tienen medidas o falta video, eso se arregla aparte (skills imagenes-ml y video-publicaciones-ml).'].join('\n');
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
  {
    name: 'ml_agenda', title: 'Agenda comercial y cronograma de MercadoLibre', readOnly: true,
    description: 'La agenda de Clara (del equipo de trabajadores): las fechas cruciales del año (Hot Sale, CyberMonday, Black Friday, Día de la Madre/Padre/Infancias, Navidad…) y el cronograma de campañas y promociones que MercadoLibre te ofrece, con cierre de inscripción, candidatas y si ya participás. Por cada una pregunta SIEMPRE si querés participar y guarda tu decisión (no se inscribe sola: inscribir es con ml_aceptar_promocion y tu OK). Acciones: calendario (lo que viene), decidir (sí/no a una campaña o fecha), fecha (confirmar una fecha estimada o agregar una propia), pagina (el kit para actualizar Mi página: banner y productos a destacar del evento).',
    schema: { ...cuentaParam,
      accion: z.enum(['calendario', 'decidir', 'fecha', 'pagina']).describe('Qué hacer'),
      ref: z.string().optional().describe('decidir: el id que muestra el calendario (ej: P-HOT, cybermonday:2026, propia:aniversario) · fecha: la clave de la fecha estimada a confirmar (ej: cybermonday:2026)'),
      participar: z.boolean().optional().describe('decidir: true = sí participo, false = no participo'),
      nota: z.string().optional().describe('decidir: por qué (ej: "solo con los termos")'),
      nombre: z.string().optional().describe('fecha: nombre de una fecha propia (ej: "Aniversario de la tienda")'),
      fecha: z.string().optional().describe('fecha: AAAA-MM-DD'),
      dias: z.number().optional().describe('calendario: cuántos días hacia adelante (default 60, máx 365)'),
    },
    async run(args) {
      const f = (ts) => new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const cuando = (d) => (d < 0 ? 'en curso' : d === 0 ? 'HOY' : d === 1 ? 'mañana' : `en ${d} días`);
      const ag = () => leerEquipo().agenda || {};

      if (args.accion === 'decidir') {
        if (!args.ref || args.participar == null) return 'Decime ref (el id del calendario) y participar=true o false.';
        let r = args.ref.trim();
        if (!/^(promo|fecha):/.test(r)) r = /^[a-z_]+:\d{4}$/.test(r) || r.startsWith('propia:') ? 'fecha:' + r : 'promo:' + r;
        decidir(r, args.participar, args.nota);
        const que = r.replace(/^(promo|fecha):/, '');
        if (!args.participar) return `🚫 Anotado: no participás en ${que}. Clara no te vuelve a preguntar por esta.`;
        if (r.startsWith('promo:')) return `✅ Anotado: participás en ${que}. Próximo paso: te muestro tus publicaciones candidatas con su descuento (ml_promociones promocion_id=${que}), validamos el margen de cada una con la calculadora y las inscribo de a una con ml_aceptar_promocion **solo con tu OK**. Cuando arranque, Clara te avisa para actualizar Mi página.`;
        return `✅ Anotado: participás en ${que}. Clara te recuerda a 7 días (stock, precio validado por margen y publicidad) y el día anterior (Mi página con el banner y los productos destacados). Si querés una promo propia para esa fecha, te armo la propuesta.`;
      }

      if (args.accion === 'fecha') {
        if (!args.fecha) return 'Pasame la fecha en formato AAAA-MM-DD.';
        if (args.ref) { const k = args.ref.trim().replace(/^fecha:/, ''); confirmarFecha(k, args.fecha); return `✅ ${k} confirmada para el ${args.fecha}: Clara usa esa fecha en lugar de la estimada.`; }
        if (!args.nombre) return 'Para una fecha propia pasame nombre y fecha (o ref para confirmar una estimada).';
        const id = agregarFechaPropia({ nombre: args.nombre, fecha: args.fecha });
        return `✅ Fecha propia agregada: **${args.nombre}** (${args.fecha}). Clara te va a preguntar si querés participar a 30, 14, 7 y 1 día (ref=propia:${id}).`;
      }

      const c = cliente(args);
      const me = await c.get('/users/me');
      const sitio = me.site_id || 'MLA';
      const a = ag();
      const promos = Object.values(await cronogramaML(c, me.id));

      if (args.accion === 'pagina') {
        const ahora = Date.now();
        const activas = promos.filter((p) => p.participando > 0 && (!p.fin || p.fin >= ahora) && (!p.inicio || p.inicio - ahora <= 7 * 86400000))
          .sort((x, y) => (x.inicio || 0) - (y.inicio || 0));
        const fechas = fechasComerciales(sitio, { dias: 7, confirmadas: a.confirmadas || {}, propias: a.propias || [] })
          .filter((fe) => estadoDecision(a, 'fecha:' + fe.clave) === 'si');
        let evento = null, destacados = [];
        if (activas.length) {
          const p = activas[0];
          evento = { nombre: p.nombre, desde: p.inicio, hasta: p.fin, descuento: p.descuentoMax, origen: 'campaña de MercadoLibre' };
          try {
            const it = await c.get(`/seller-promotions/promotions/${p.id}/items`, { promotion_type: p.tipo, app_version: 'v2', limit: 50 });
            destacados = (it.results || []).filter((i) => ['started', 'pending', 'active'].includes(i.status)).map((i) => ({ id: i.id ?? i.item_id, precio: i.price ?? i.deal_price, antes: i.original_price }));
          } catch {}
        } else if (fechas.length) {
          const fe = fechas[0];
          evento = { nombre: fe.nombre, desde: fe.inicio.getTime(), hasta: fe.fin.getTime(), origen: 'fecha comercial' };
        }
        if (!destacados.length) { // sin promo: los más vendidos de los últimos 30 días
          try {
            const r = await c.get('/orders/search', { seller: me.id, 'order.date_created.from': new Date(ahora - 30 * 86400000).toISOString(), 'order.status': 'paid', limit: 50, sort: 'date_desc' });
            const conteo = new Map();
            for (const o of r.results || []) for (const it of o.order_items || []) { const k = it.item?.id || it.item?.title; if (k) conteo.set(k, { id: it.item?.id, titulo: it.item?.title, u: (conteo.get(k)?.u || 0) + (it.quantity || 1) }); }
            destacados = [...conteo.values()].sort((x, y) => y.u - x.u).slice(0, 6);
          } catch {}
        }
        const lista = destacados.slice(0, 8).map((x, i) => `${i + 1}. ${x.titulo || x.id}${x.id && x.titulo ? ` (${x.id})` : ''}${x.precio && x.antes ? ` — ${money(x.antes)} → ${money(x.precio)}` : x.u ? ` — ${x.u} vendidas en 30 días` : ''}`).join('\n');
        if (!evento) return `# Mi página — sin evento tuyo activo ni en los próximos 7 días\nDejala con tus más vendidos arriba:\n${lista || '(sin ventas en 30 días para ordenar)'}\n\nCuando participes en una campaña o fecha, Clara te avisa el día que arranca para cambiar el banner. Para aplicarlo en Mi página pedile a Claude "actualizá Mi página" (skill mi-pagina-ml: lo hace en tu Chrome, con tu OK).`;
        const banner = `${evento.nombre.toUpperCase()}${evento.descuento ? ` · HASTA ${evento.descuento}% OFF` : ''}`;
        return [`# Kit para actualizar Mi página — ${evento.nombre}`,
          `_${evento.origen}${evento.desde ? ` · ${f(evento.desde)}` : ''}${evento.hasta && evento.hasta !== evento.desde ? ` al ${f(evento.hasta)}` : ''}_`,
          ``, `**1. Banner principal:** "${banner}"`, `   Subtítulo sugerido: "Tus favoritos para ${evento.nombre}"${evento.descuento ? ' (el % sale de tus publicaciones inscriptas: no lo cambies sin cambiar los precios)' : ''}. Para celular, texto grande y corto.`,
          ``, `**2. Productos destacados (en este orden):**`, lista || '(no encontré publicaciones para destacar: inscribí alguna en la campaña o vendé primero)',
          ``, `**3. Arriba de todo:** la sección del evento; después tus categorías de siempre.`,
          `**4. Cuando termine:** Clara te avisa para sacar el banner y volver a tus destacados.`,
          ``, `Mi página se edita en el panel de MercadoLibre (no tiene API pública): pedile a Claude "actualizá Mi página con este kit" y lo hace en tu Chrome con la skill mi-pagina-ml, mostrándote cada cambio antes de guardar.`].join('\n');
      }

      // calendario
      const dias = Math.min(Math.max(1, Math.round(args.dias ?? 60)), 365);
      const fechas = fechasComerciales(sitio, { dias, confirmadas: a.confirmadas || {}, propias: a.propias || [] });
      const filas = [
        ...promos.map((p) => ({ t: p.inicio || p.cierre || Date.now(), linea: `- **${p.inicio ? f(p.inicio) : 'ya disponible'}** · 🗓️ «${p.nombre}» — ${tipoLegible(p.tipo)}${p.fin ? ` hasta el ${f(p.fin)}` : ''}${p.cierre ? ` · inscripción hasta el ${f(p.cierre)} (${cuando(diasHasta(p.cierre))})` : ''}${p.candidatas != null ? ` · ${p.candidatas} candidata(s)` : ''}${p.participando ? ` · ${p.participando} tuyas adentro` : ''} · ${ICONO_DECISION[estadoDecision(a, 'promo:' + p.id, p)]} → ref=${p.id}`, est: estadoDecision(a, 'promo:' + p.id, p) })),
        ...fechas.map((fe) => ({ t: fe.inicio.getTime(), linea: `- **${f(fe.inicio)}** · 📅 ${fe.nombre}${fe.origen === 'propia' ? ' (fecha propia)' : ''}${fe.estimada ? ' (fecha estimada — confirmala con accion=fecha)' : ''} · ${cuando(diasHasta(fe.inicio))} · ${fe.consejo} · ${ICONO_DECISION[estadoDecision(a, 'fecha:' + fe.clave)]} → ref=${fe.clave}`, est: estadoDecision(a, 'fecha:' + fe.clave) })),
      ].sort((x, y) => x.t - y.t);
      const pend = filas.filter((x) => x.est === 'pendiente').length;
      return `# Agenda comercial — próximos ${dias} días\n${pend ? `**${pend} ❓ esperan tu decisión: ¿participás?** Respondé por cada una (ml_agenda accion=decidir ref=… participar=true/false). Clara te va a seguir preguntando hasta que decidas.` : 'Todo decidido ✅'}\n\n` + (filas.map((x) => x.linea).join('\n') || 'Sin campañas de MercadoLibre ni fechas comerciales en este período.');
    },
  },
  {
    name: 'ml_numeros', title: 'Números del mes (contabilidad)', readOnly: true,
    description: 'Los números de Carmen, la contadora del equipo: resultado de un mes — facturación, cantidad de ventas, comisiones reales de MercadoLibre, publicidad, impuestos (% guardado en el cerebro), costo de mercadería (costos del cerebro) y envíos a cargo → resultado neto y margen, comparado con el mes anterior. Si faltan costos o impuestos lo marca como parcial y dice qué falta (nunca inventa). mes: "actual" (default, hasta hoy), "anterior" o AAAA-MM.',
    schema: { ...cuentaParam, mes: z.string().optional().describe('"actual", "anterior" o AAAA-MM') },
    async run(args) {
      const c = cliente(args); const id = await sellerId(c);
      const ahora = Date.now();
      let desde, hasta;
      if (!args.mes || args.mes === 'actual') { desde = inicioDeMes(ahora); hasta = ahora; }
      else if (args.mes === 'anterior') { desde = inicioDeMes(ahora, -1); hasta = inicioDeMes(ahora); }
      else if (/^\d{4}-\d{2}$/.test(args.mes)) { const [y, m] = args.mes.split('-').map(Number); desde = new Date(y, m - 1, 1).getTime(); hasta = Math.min(new Date(y, m, 1).getTime(), ahora); if (desde > ahora) return 'Ese mes todavía no empezó.'; }
      else return 'mes inválido: usá "actual", "anterior" o AAAA-MM.';
      const r = await resumenContable(c, id, desde, hasta);
      const largo = hasta - desde, prev = await resumenContable(c, id, inicioDeMes(desde, -1), inicioDeMes(desde, -1) + largo, { conAds: false });
      const d = (n) => (n == null ? '_sin cargar_' : money(Math.round(n)));
      const vs = (a, b) => (b ? ` (${a >= b ? '↑' : '↓'} ${Math.abs(((a - b) / b) * 100).toFixed(1)}%)` : '');
      return [`# 🧾 Números de ${nombreMes(desde)}${hasta === ahora ? ' (hasta hoy)' : ''}`, '',
        '| Concepto | Monto |', '| --- | --- |',
        `| Facturación (${r.ordenes} ventas · ${r.unidades} u.) | ${d(r.bruto)}${vs(r.bruto, prev.bruto)} |`,
        `| − Comisiones de MercadoLibre${r.comisionEstimada ? ' (algunas estimadas en 14%)' : ''} | −${d(r.comisiones)} |`,
        `| − Publicidad (Product Ads) | ${r.ads == null ? '_sin Product Ads_' : '−' + d(r.ads)} |`,
        `| − Impuestos${r.impuestosPct != null ? ` (${r.impuestosPct}%)` : ''} | ${r.impuestos == null ? '_sin cargar_' : '−' + d(r.impuestos)} |`,
        `| − Costo de mercadería | −${d(r.costoMercaderia)} |`,
        `| − Envíos a cargo | −${d(r.envios)} |`,
        `| **= Resultado neto** | **${d(r.neto)}** (${r.margen.toFixed(1)}%) |`, '',
        r.parcial ? `⚠️ **Resultado parcial.** ${r.cobertura < 1 ? `${Math.round((1 - r.cobertura) * 100)}% de las unidades vendidas no tienen costo cargado (${r.sinCosto.slice(0, 5).join(', ')}${r.sinCosto.length > 5 ? '…' : ''}). ` : ''}${r.impuestosPct == null ? 'Falta tu % de impuestos. ' : ''}Cargalos una vez con ml_cerebro y el neto queda exacto.` : '✅ Todos los costos e impuestos cargados: el neto es completo.',
        r.top.length ? `\n**Lo que más vendiste:** ${r.top.map((x) => `${x.titulo} (${x.u} u.)`).join(' · ')}` : '',
        '\n_Es un resultado de gestión para decidir, no reemplaza la contabilidad formal: pasáselo a tu contador._'].join('\n');
    },
  },
  {
    name: 'ml_despachos', title: 'Despachos y envíos (logística)', readOnly: true,
    description: 'La lista de Leo, el coordinador de logística del equipo: envíos de las ventas de los últimos días — qué tenés que despachar y hasta cuándo (FULL lo despacha MercadoLibre), envíos demorados, no entregados o devueltos, por tipo de envío (FULL/Flex/Colecta) y destino, más tu tasa de despachos con demora de la reputación.',
    schema: { ...cuentaParam, dias: z.number().optional().describe('Días hacia atrás (default 7, máx 30)') },
    async run(args) {
      const c = cliente(args); const me = await c.get('/users/me');
      const dias = Math.min(Math.max(1, Math.round(args.dias ?? 7)), 30);
      const es = await enviosRecientes(c, me.id, dias);
      if (!es.length) return `Sin ventas con envío en los últimos ${dias} días.`;
      const h = (ts) => new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const linea = (e) => `- #${e.orden} · ${e.titulo} · ${e.tipo} · ${e.estado}${e.subestado ? '/' + e.subestado : ''}${e.limiteDespacho ? ` · despachar antes del ${h(e.limiteDespacho)}` : ''}${e.provincia ? ` · a ${e.provincia}` : ''}`;
      const grupo = (titulo, lista) => (lista.length ? `## ${titulo} (${lista.length})\n` + lista.map(linea).join('\n') : '');
      const tipos = {}; for (const e of es) tipos[e.tipo] = (tipos[e.tipo] || 0) + 1;
      const rate = me.seller_reputation?.metrics?.delayed_handling_time?.rate;
      return [`# 🚚 Despachos — últimos ${dias} días (${es.length} envíos)`,
        grupo('↩️ Devueltos / no entregados', es.filter((e) => e.problema)),
        grupo('🚨 Demorados', es.filter((e) => e.demorado && !e.problema)),
        grupo('📦 Para despachar', es.filter((e) => e.porDespachar && !e.demorado).sort((a, b) => (a.limiteDespacho || 9e15) - (b.limiteDespacho || 9e15))),
        `**Por tipo de envío:** ${Object.entries(tipos).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
        rate != null ? `**Despachos con demora (reputación):** ${(rate * 100).toFixed(1)}%` : ''].filter(Boolean).join('\n\n');
    },
  },
  {
    name: 'ml_jefe', title: 'Jefe de equipo (le das un objetivo y reparte el trabajo)', readOnly: true,
    description: 'El jefe del equipo de trabajadores: le das un OBJETIVO en una frase ("vender más este mes", "¿por qué gano poco?", "preparame para el CyberMonday", "mejorar la reputación") y él elige qué trabajadores tienen que ver, los pone a trabajar ahora mismo, junta lo que encontraron y devuelve el plan en orden: cada paso con el trabajador responsable, lo que encontró y la skill para hacerlo. Lo que modifica la tienda queda marcado para hacerlo con tu OK. Sin objetivo claro, trabaja con todo el equipo. El vendedor le puede poner NOMBRE (y emoji) al jefe: cuando diga "el jefe se llama Roberto", "ponele Don Ramón al jefe" o similar, llamar con nombre="…" (sin objetivo); nombre="" lo vuelve a "El jefe". Después, si el vendedor le habla al jefe por su nombre ("Roberto, ¿cómo vendo más?"), es un objetivo para esta herramienta.',
    schema: { ...cuentaParam, objetivo: z.string().optional().describe('El objetivo en tus palabras'), sin_correr: z.boolean().optional().describe('true = armar el plan con lo último que sabe el equipo, sin hacerlo trabajar ahora'),
      nombre: z.string().optional().describe('Ponerle nombre al jefe (hasta 30 letras). "" = volver a "El jefe"'), emoji: z.string().optional().describe('Emoji del jefe (ej: 🎩, 👑, 🦁)') },
    async run(args) {
      let nombrado = '';
      if (args.nombre != null || args.emoji != null) {
        const r = nombrarJefe(args.nombre ?? jefe().nombre, args.emoji);
        if (r.error) return `No le cambié el nombre: ${r.error}`;
        const j = r.jefe;
        const listo = j.propio ? `Listo: tu jefe de equipo ahora es **${j.emoji} ${j.nombre}**. Así aparece en los planes, en la lista del equipo y en el tablero del día.` : `Listo: el jefe volvió a llamarse **${j.emoji} ${j.nombre}**.`;
        nombrado = `_${listo}_\n\n`;
        if (!args.objetivo) return `${listo}\n\nPara hablarle, decile por ejemplo "${j.propio ? j.nombre + ', ' : ''}¿cómo vendo más este mes?".`;
      }
      const J = jefe();
      const obj = sinAcento(args.objetivo || '');
      if (obj.length < 3) return 'Decime el objetivo en una frase (ej: "vender más este mes", "¿por qué gano poco?", "preparame para el CyberMonday").';
      const REGLAS = [
        [/precio|barat|caro|competen|rival|competidor/, ['precios', 'rivales', 'ranking'], 'competencia'],
        [/vender mas|mas ventas|ventas|facturar|crecer|escalar|vendo poco|no vendo/, ['ventas', 'ranking', 'anuncios', 'agenda', 'tendencias', 'stock', 'catalogo', 'atencion'], 'vender más'],
        [/margen|ganancia|ganar|gano|rentab|plata|pierdo|perd|cost/, ['rentabilidad', 'contabilidad', 'anuncios'], 'ganar más por venta'],
        [/publicidad|\bads\b|anuncio|acos|product ads|pauta/, ['anuncios', 'rentabilidad'], 'publicidad'],
        [/envi|despach|logistic|demora|full|flex/, ['logistica'], 'logística'],
        [/reputacion|reclamo|mediacion|color|termometro|opinion|calificacion|estrella/, ['reclamos', 'reputacion', 'logistica', 'atencion'], 'reputación'],
        [/stock|reponer|reposicion|quiebre|inventario|me quedo sin/, ['stock', 'proveedores'], 'stock'],
        [/pregunta|mensaje|atencion|comprador|responder/, ['atencion'], 'atención'],
        [/catalogo|buy ?box|primer lugar/, ['catalogo', 'rentabilidad'], 'catálogo'],
        [/pausad|moderad|infraccion|bloquead|dada de baja|penaliz/, ['moderaciones'], 'moderaciones'],
        [/proveedor|mayorista|reventa|revendo/, ['proveedores', 'stock', 'rentabilidad'], 'proveedores'],
        [/numero|contab|cierre|impuesto|balance|resultado|mes pasado|este mes/, ['contabilidad', 'rentabilidad'], 'números'],
        [/publicacion|foto|descripcion|auditor|desactualiz|posicion|ranking|puesto|aparecer|titulo|pregunta/, ['auditor', 'ranking'], 'publicaciones'],
        [/promo|hot ?sale|cyber|black|fecha|navidad|reyes|dia de la madre|dia del padre|evento|cronograma|mi pagina/, ['agenda', 'rentabilidad', 'anuncios'], 'fechas y promociones'],
        [/tendencia|que vender|nuevo producto|oportunidad|nicho|ganador|que producto/, ['tendencias', 'nichos', 'rivales'], 'oportunidades'],
      ];
      const elegidos = new Set(), temas = [];
      for (const [re, ids, tema] of REGLAS) if (re.test(obj)) { ids.forEach((i) => elegidos.add(i)); temas.push(tema); }
      const todos = !elegidos.size;
      const equipo = todos ? IDS.filter((i) => i !== 'auditor' && i !== 'proveedores' && i !== 'nichos') : IDS.filter((i) => elegidos.has(i)); // Lucía y Fede: solo si el objetivo los nombra // Lucía (auditoría completa) solo si el objetivo es de publicaciones
      let corrida = null;
      if (!args.sin_correr) corrida = await correrCiclo({ solo: equipo, forzar: true });
      const res = armarResultados();
      const ORDEN = ['reclamos', 'moderaciones', 'logistica', 'atencion', 'stock', 'proveedores', 'rentabilidad', 'catalogo', 'anuncios', 'reputacion', 'agenda', 'auditor', 'precios', 'ranking', 'ventas', 'rivales', 'nichos', 'tendencias', 'contabilidad'];
      const ACCION = {
        logistica: ['despachar lo pendiente y resolver demoras/devoluciones', 'logistica-ml', true],
        rentabilidad: ['corregir precio, costo o publicidad de los productos que dejan poco o pierden', 'calculadora-ml', true],
        anuncios: ['bajar o pausar lo que gasta sin vender y empujar lo que tiene margen', 'publicidad-ml', true],
        agenda: ['decidir si participás en lo que viene y preparar stock, precio y Mi página', 'agenda-comercial-ml', true],
        auditor: ['arreglar las publicaciones en rojo, las peores primero', 'mejorar-publicaciones-ml', true],
        precios: ['revisar dónde un rival quedó más barato y si conviene responder (validando margen)', 'calculadora-ml', true],
        ranking: ['mejorar las publicaciones que perdieron puesto en tus búsquedas', 'imagenes-ml', true],
        ventas: ['aprovechar los rivales sin stock y comparar su ritmo con el tuyo', 'panel-ventas-ml', false],
        rivales: ['analizar a los rivales nuevos y sumarlos a la vigilancia', 'competencia-ml', false],
        tendencias: ['validar las búsquedas en alza como productos para vender', 'descubrir-ganadores-ml', false],
        nichos: ['ver el detalle del mejor nicho con tu costo y decidir si entrar', 'nichos-ml', false],
        contabilidad: ['cerrar los números del mes y completar costos/impuestos que falten', 'contabilidad-ml', false],
        reclamos: ['responder cada reclamo antes de su plazo', 'reclamos-ml', true],
        moderaciones: ['corregir las publicaciones moderadas y reactivarlas', 'moderaciones-ml', true],
        atencion: ['responder las preguntas y mensajes pendientes', 'responder-preguntas-ml', true],
        stock: ['reponer lo que se corta en menos de una semana', 'stock-ml', false],
        proveedores: ['ajustar precio/costo o pausar según tu proveedor', 'proveedores-ml', true],
        catalogo: ['recuperar el catálogo donde convenga por margen', 'competencia-ml', true],
        reputacion: ['atender las opiniones negativas y lo que mueve tu color', 'reputacion-ml', false],
      };
      const pasos = [];
      for (const id of ORDEN.filter((i) => equipo.includes(i))) {
        const r = res[id], e = EQUIPO[id];
        const nuevas = (corrida?.alertas || []).filter((a) => a.trabajador === id);
        const urgentes = nuevas.filter((a) => a.nivel === 'alta');
        const sinNada = !r?.filas?.length && !nuevas.length;
        const [accion, skill, escribe] = ACCION[id];
        pasos.push({ id, peso: urgentes.length ? 0 : nuevas.length ? 1 : sinNada ? 3 : 2,
          texto: `**${e.emoji} ${e.nombre} (${e.puesto})** — ${r?.destacado || (sinNada ? 'sin datos todavía (necesita tareas, costos o historial)' : 'sin novedades')}` +
            (urgentes.length ? `\n   🔴 ${urgentes.slice(0, 3).map((a) => a.texto.replace(/\*\*/g, '')).join('\n   🔴 ')}` : '') +
            `\n   → **Siguiente paso:** ${accion} · skill \`${skill}\`${escribe ? ' · ✋ con tu OK antes de tocar la tienda' : ''}` });
      }
      pasos.sort((a, b) => a.peso - b.peso);
      if (corrida?.alertas?.length) leerBandeja({ marcar: true });
      return nombrado + [`# ${J.emoji} ${J.propio ? `${J.nombre}, jefe de equipo` : 'Jefe de equipo'} — objetivo: «${args.objetivo.trim()}»`,
        todos ? `No reconocí un tema puntual: trabajó **todo el equipo** (${equipo.length}).` : `Lo repartí entre **${equipo.length} trabajador(es)** según el objetivo (${temas.join(', ')}).`,
        corrida ? `Trabajaron ahora: ${corrida.corridos.map((i) => EQUIPO[i].nombre).join(', ') || 'nadie (sin tareas)'}${corrida.errores.length ? ` · ⚠️ ${corrida.errores.join(' · ')}` : ''}.` : 'Plan armado con lo último que sabía el equipo (sin correrlo ahora).',
        '', '## El plan, en orden', ...pasos.map((p, i) => `${i + 1}. ${p.texto}`),
        '', 'Decime "dale" y arranco por el paso 1 (con la skill indicada), o elegí el número del paso.'].join('\n');
    },
  },
  {
    name: 'ml_tablero', title: 'Tablero del día (parte diario visual)', readOnly: true,
    description: 'Arma el tablero visual del día con todo lo que saben los 19 trabajadores (incluido el ranking de nichos de Emma): la frase del día, lo que está funcionando, lo que necesita atención (urgente primero, con la skill para resolverlo), tus números (facturación, neto, ganancia, publicidad, reputación, pendientes), la planilla del equipo (tocás un trabajador y ves su tabla), lo que viene, la evolución de 30 días y la bitácora. Es una página local (sin servidor, funciona sin internet) con tutorial guiado; después se actualiza sola con cada control del equipo. Con abrir=true la abre en el navegador.',
    schema: { abrir: z.boolean().optional().describe('true = abrirla en el navegador de esta computadora') },
    async run(args) {
      const { ruta, datos } = await generarTablero();
      const abierto = args.abrir ? abrirEnNavegador(ruta) : false;
      const urg = datos.atencion.filter((x) => x.nivel === 'alta').length;
      return [`# 📋 Tablero del día listo`, '', `> ${datos.frase}`, '',
        `- ✅ **${datos.funciona.length}** cosa(s) funcionando · ⚠️ **${datos.atencion.length}** para atender (${urg} urgente(s)) · 👷 ${datos.equipo.filter((w) => w.activo).length} de ${datos.equipo.length} trabajando`,
        `- Archivo: \`${ruta}\``, `- Abrilo en el navegador: ${pathToFileURL(ruta).href}`,
        abierto ? '- Ya lo abrí en tu navegador.' : '- Pedime "abrí el tablero" y lo abro en tu navegador.',
        '', 'Se actualiza solo con cada control del equipo y la página se recarga cada 5 minutos. La primera vez arranca con un tutorial guiado (después está en el botón "Ver tutorial").'].join('\n');
    },
  },
  // ─────────────────────────────── Cerebro ───────────────────────────────
  {
    name: 'ml_cerebro', title: 'El cerebro del conector (memoria del negocio)', readOnly: true,
    description: 'La base de datos local del negocio: guarda lo que el vendedor le enseña (costo de cada producto, % de impuestos, costo de envío, medidas, qué incluye, notas) y las demás herramientas lo usan solas — la calculadora de rentabilidad deja de preguntar lo que ya sabe. EL COSTO VA POR SKU: si la publicación tiene SKU, el costo queda guardado en el SKU y lo usan todas las publicaciones con ese mismo SKU (también las nuevas). Se puede guardar directo por SKU (item_id="TER-1L"). Todo queda en un archivo local de la máquina del vendedor, nunca sale de ahí. Acciones: guardar, ver, olvidar. Para datos del negocio entero (ej impuestos de todas las ventas), guardar sin item_id.',
    schema: { ...cuentaParam,
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
        delete datos.cuenta;
        // ¿Es una publicación (MLA123…) o un SKU? A la publicación le buscamos su SKU para compartir el costo.
        const esItem = item_id && /^M[A-Z]{2}\d+$/i.test(item_id.trim());
        let sku = null;
        if (item_id && !esItem) { sku = normalizarSku(item_id); if (!sku) return 'Ese SKU no es válido (hasta 60 caracteres, sin caracteres de control).'; }
        if (esItem) { try { sku = skuDeItem(await cliente(args).get(`/items/${item_id.trim()}`)); } catch { sku = leerCerebro().productos?.[item_id]?.sku || null; } }
        const id = esItem ? item_id.trim().toUpperCase() : sku;
        aprender(id || null, datos, { sku });
        const campos = Object.entries(datos).filter(([, v]) => v !== undefined).map(([k]) => k).join(', ');
        const otras = sku && datos.costo != null ? publicacionesDeSku(sku).filter((x) => x !== id) : [];
        const lineaSku = sku && datos.costo != null ? `\n\n🏷️ El costo quedó en el **SKU ${sku}**: lo usan todas las publicaciones con ese SKU${otras.length ? ` (ya van ${otras.length + (esItem ? 1 : 0)}: ${[...(esItem ? [id] : []), ...otras].slice(0, 6).join(', ')})` : ''} y las que crees con ese SKU.` : esItem && datos.costo != null ? '\n\nEsta publicación no tiene SKU: el costo vale solo para ella. Si le cargás un SKU en MercadoLibre, el costo se comparte con las demás publicaciones del mismo producto.' : '';
        return `🧠 Guardado en el cerebro${id ? ` de **${esItem ? id : 'SKU ' + sku}**` : ' del **negocio** (vale para todos los productos que no tengan el dato propio)'}: ${campos}. Queda en tu máquina y las herramientas lo usan solas (la calculadora ya no te lo vuelve a preguntar).${lineaSku}`;
      }
      if (args.accion === 'olvidar') {
        if (!args.item_id) return 'Indicá el item_id del producto a olvidar.';
        return olvidar(args.item_id) ? `🧠 Olvidado todo lo guardado de ${args.item_id}.` : `No había nada guardado de ${args.item_id}.`;
      }
      const d = leerCerebro();
      if (args.item_id) {
        const pr = Object.prototype.hasOwnProperty.call(d.productos || {}, args.item_id) ? d.productos[args.item_id] : null;
        const esSku = !/^M[A-Z]{2}\d+$/i.test(args.item_id.trim()) && !(pr && pr.sku !== normalizarSku(args.item_id));
        const p = esSku ? saberDe(null, args.item_id) : saberDe(args.item_id);
        const lineas = [];
        if (p.sku && !esSku) lineas.push(`- SKU: ${p.sku}`);
        if (p.costo != null) lineas.push(`- Costo: ${dinero(p.costo)}${p.costoDelSku ? ` (del SKU ${p.costoDelSku.sku}${p.costoDelSku.de && p.costoDelSku.de !== args.item_id && p.costoDelSku.de !== p.costoDelSku.sku ? `, cargado en ${p.costoDelSku.de}` : ''})` : ''}`);
        if (esSku && p.sku) { const pubs = publicacionesDeSku(p.sku); if (pubs.length) lineas.push(`- Publicaciones con este SKU: ${pubs.join(', ')}`); }
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
          if (p.sku === id) return null; // los SKU se listan aparte
          const cs = p.sku ? costoDeSku(p.sku) : null;
          return `- **${id}**: ${[p.sku ? `SKU ${p.sku}` : '', p.costo != null ? 'costo ' + dinero(p.costo) : cs != null ? `costo ${dinero(cs)} (del SKU)` : '', p.medidas ? 'medidas ✔' : '', p.incluye ? 'incluye ✔' : '', (p.notas?.length || 0) ? p.notas.length + ' nota(s)' : ''].filter(Boolean).join(' · ') || 'solo creado'}`;
        }).filter(Boolean).join('\n') : '- (ninguno)') +
        (Object.keys(d.skus || {}).length ? `\n\n## Costos por SKU (${Object.keys(d.skus).length})\n` + Object.entries(d.skus).map(([k, x]) => { const n = publicacionesDeSku(k).length; return `- **${k}**: costo ${dinero(x.costo)}${n ? ` · ${n} publicación(es)` : ''}`; }).join('\n') : '') +
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
      let precio = args.precio, tipo = 'gold_special', titulo = null, sku = null;
      if (args.item_id) {
        const b = await c.get(`/items/${args.item_id}`);
        precio = precio ?? b.price; tipo = b.listing_type_id || tipo; titulo = b.title;
        sku = skuDeItem(b); if (sku) vincularSku(args.item_id, sku);
      }
      // 🧠 El cerebro completa lo que el usuario no pasó, y aprende lo que sí pasó (el costo, por SKU)
      const sabido = args.item_id ? saberDe(args.item_id, sku) : saberDe('__negocio__');
      const memoria = [];
      let costoFinal = args.costo, impuestosFinal = args.impuestos_pct, envioFinal = args.costo_envio;
      if (costoFinal == null && sabido.costo != null) { costoFinal = sabido.costo; memoria.push(`costo ${'$ ' + Number(sabido.costo).toLocaleString('es-AR')} ${sabido.costoDelSku ? `del SKU ${sabido.costoDelSku.sku}${sabido.costoDelSku.de && sabido.costoDelSku.de !== args.item_id && sabido.costoDelSku.de !== sabido.costoDelSku.sku ? ` (cargado en ${sabido.costoDelSku.de})` : ''}` : 'guardado'}`); }
      if (impuestosFinal == null && sabido.impuestos_pct != null) { impuestosFinal = sabido.impuestos_pct; memoria.push(`impuestos ${sabido.impuestos_pct}% guardados`); }
      if (envioFinal == null && sabido.costo_envio != null) { envioFinal = sabido.costo_envio; memoria.push(`envío ${'$ ' + Number(sabido.costo_envio).toLocaleString('es-AR')} guardado`); }
      const faltan = [];
      if (!precio) faltan.push('el **precio de venta** (o pasame el item_id y lo traigo)');
      if (costoFinal == null) faltan.push(`el **costo del producto** (lo que te sale a vos, con IVA si corresponde)${sku ? ` — lo guardo en el SKU ${sku} y vale para todas sus publicaciones` : ''}`);
      if (impuestosFinal == null) faltan.push('el **% de impuestos** sobre la venta (IIBB + monotributo o IVA según tu situación — si no lo sabés, tu contador lo tiene en 1 minuto)');
      if (faltan.length) return 'Para calcular la rentabilidad real me falta:\n- ' + faltan.join('\n- ') + '\n\nCon esos datos te doy el desglose peso por peso (y los guardo en el cerebro para no volver a preguntarlos).';
      // Aprender lo que vino nuevo
      const aprendido = {};
      if (args.costo != null && args.costo !== sabido.costo) aprendido.costo = args.costo;
      if (args.impuestos_pct != null && args.impuestos_pct !== sabido.impuestos_pct) aprendido.impuestos_pct = args.impuestos_pct;
      if (args.costo_envio != null && args.costo_envio !== sabido.costo_envio) aprendido.costo_envio = args.costo_envio;
      if (Object.keys(aprendido).length) aprender(args.item_id || null, aprendido, { sku });
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
      const traerClips = (id) => traerClipsML(c, id); // existe pero sin clips → { clips: [] }; sin API → null
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
    description: 'El equipo de 19 trabajadores que vigilan solos y constantemente (más 💰 Ramiro rentabilidad, 📣 Ana anuncios, 🚚 Leo logística, 🧾 Carmen contabilidad, 📦 Nico días de stock antes del quiebre, 💬 Paula preguntas y mensajes sin responder, 🛡️ Iván reclamos y plazos, ⭐ Valen reputación y opiniones, 🏷️ Gabi catálogo/buy box, 🚫 Sole moderaciones, 🔄 Fede precio y stock de tus proveedores — a Fede se le asigna ref=TU publicación y fuente=publicación o URL del proveedor): 🕵️ Vera (precios), 📦 Tomás (ventas de rivales y quiebres de stock), 🏆 Martina (ranking en búsquedas y tu puesto), 🎯 Bruno (rivales nuevos), 🩺 Lucía (audita TODAS tus publicaciones cada 15 días: desactualizadas, precio congelado o fuera de mercado, fotos, stock, ficha), 🗓️ Clara (agenda comercial: fechas cruciales y cronograma de promociones de ML — siempre pregunta si querés participar; Mi página al día) 📈 Sofía (tendencias) y 🧭 Emma (cada semana analiza tus nichos candidatos con la API oficial y arma el ranking de oportunidades: a Emma se le asigna ref=la búsqueda del nicho; sin tareas toma tus búsquedas seguidas o las tendencias del sitio). Cada uno tiene sus skills a cargo y cada alerta recomienda qué skill correr. Guardan todo en una base de datos SQLite local (equipo.db, viene con Node: cero instalación, ideal Windows) y envían sus resultados a Google Drive (planilla en vivo o carpeta de Drive). Acciones: equipo (estado de todos), asignar (darle una tarea), quitar, pausar, activar, frecuencia (minutos), correr (que trabajen ya), informe (alertas nuevas), resultados (tablas con todo lo que sabe cada uno), historial (evolución día por día de un rival/keyword), base (la base de datos: estado y backup), drive (conectar Google Drive). Se puede nombrar al trabajador por su nombre (Vera) o puesto (precios). Si un trabajador no tiene tareas propias vigila tus seguidos de ml_vigilar de su tipo.',
    schema: { ...cuentaParam,
      accion: z.enum(['equipo', 'asignar', 'quitar', 'pausar', 'activar', 'frecuencia', 'correr', 'informe', 'resultados', 'historial', 'base', 'drive']).describe('Qué hacer. historial = evolución día por día de un objetivo (precio, ventas por día, puesto, líder) desde la base de datos. base = estado de la base de datos del equipo y backup. resultados = las tablas con lo que sabe cada trabajador (precio rival vs el tuyo, ritmo de ventas, tu puesto, rivales nuevos, top de tendencias). drive = conectar/ver/probar el envío a Google Drive'),
      trabajador: z.string().optional().describe('Nombre (Vera, Tomás, Martina, Bruno, Lucía, Clara, Ramiro, Ana, Leo, Carmen, Nico, Paula, Iván, Valen, Gabi, Sole, Fede, Sofía) o puesto, o "todos"'),
      tipo: z.enum(['vendedor', 'publicacion', 'busqueda', 'tendencias']).optional().describe('Se deduce solo según el trabajador; Vera acepta vendedor o publicacion'),
      ref: z.string().optional().describe('item_id rival, nickname/id del vendedor, palabra clave, o categoría (tendencias)'),
      fuente: z.string().optional().describe('Fede (proveedores): la publicación del proveedor en MercadoLibre (MLA…) o la URL https del producto en su tienda; ref = TU publicación'),
      recargo: z.number().optional().describe('Fede: % que le sumás al precio del proveedor para vender (para sugerirte el precio)'),
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
        const J = jefe(d);
        const lineaJefe = `${J.emoji} Jefe de equipo: **${J.nombre}**${J.propio ? '' : ' — ponele nombre: decí "el jefe se llama …"'} (ml_jefe)`;
        return `# Equipo de trabajadores\n${lineaJefe}\n${modo}\n${lineaBase}\n${lineaDrive}\n\n` + bloques.join('\n\n') + '\n\nDales tareas con ml_trabajadores accion=asignar (ej: trabajador=Vera ref=MLA123 mi_item=TU_ITEM umbral=3) y leé lo que encontraron con accion=informe.';
      }

      if (args.accion === 'asignar') {
        if (!quien) return `Decime a quién: ${IDS.map(etiqueta).join(' · ')}.`;
        let sitio;
        if (EQUIPO[quien].tipos.includes('tendencias') && !args.ref) sitio = (await cliente(args).get('/users/me')).site_id || 'MLA';
        const r = asignarTarea(quien, { tipo: args.tipo, ref: args.ref, mi_item: args.mi_item, umbral: args.umbral, nota: args.nota, cuenta: args.cuenta, sitio, fuente: args.fuente, recargo: args.recargo });
        const w = leerEquipo().trabajadores[quien];
        const skills = EQUIPO[quien].skills.map((x) => '`' + x.skill + '`').join(', ');
        return `✅ ${etiqueta(quien)} ${r.actualizada ? 'actualizó' : 'tomó'} la tarea: ${r.tarea.tipo} **${r.tarea.ref}**${r.tarea.mi_item ? ` comparando con tu ${r.tarea.mi_item}` : ''}${r.tarea.fuente ? ` contra el proveedor ${r.tarea.fuente}${r.tarea.recargo != null ? ` (recargo ${r.tarea.recargo}%)` : ''}` : ''}${r.tarea.umbral != null ? ` (umbral ${r.tarea.umbral})` : ''}.\nControla ${cadaCuanto(w.intervalo)}${w.activo ? '' : ' (⚠️ está en pausa: activalo)'}; el primer control guarda la foto de base y desde ahí avisa solo lo que cambia. Cuando encuentre algo te va a recomendar una de sus skills: ${skills}.`;
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
          } else if (id === 'agenda') {
            cab = ['Día', 'Campañas de ML', 'Fechas próximas', 'Decisiones pendientes'];
            fila = (m) => [dia(m.t), m.extra?.campanias ?? '—', m.extra?.fechas ?? '—', m.extra?.pendientes ?? '—'];
          } else if (id === 'rivales') {
            cab = ['Día', 'Vendedores distintos en el top'];
            fila = (m) => [dia(m.t), m.extra?.vendedores ?? '—'];
          } else if (['rentabilidad', 'anuncios', 'logistica', 'contabilidad', 'stock', 'atencion', 'reclamos', 'reputacion', 'catalogo', 'moderaciones', 'proveedores'].includes(id)) {
            const NOMBRES = { conStock: 'Productos', criticos: 'Se cortan en ≤3 días', semana: 'Se cortan en ≤7 días', sinStock: 'Sin stock vendiendo', preguntas: 'Preguntas sin responder', mensajes: 'Mensajes sin leer', abiertos: 'Reclamos abiertos', enMediacion: 'En mediación', nivel: 'Color', reclamosPct: '% reclamos', demorasPct: '% demoras', cancelacionesPct: '% cancelaciones', perdiendo: 'Catálogo perdido', ganando: 'Catálogo ganado', moderadas: 'Moderadas', precioProveedor: 'Precio proveedor', stockProveedor: 'Stock proveedor', calculados: 'Productos calculados', conPerdida: 'Con pérdida', sinCosto: 'Sin costo cargado', ganancia30d: 'Ganancia 30 días', nichos: 'Nichos analizados', oportunidades: 'Nichos 🟢', mejorPuntaje: 'Mejor puntaje', campanias: 'Campañas', gasto7d: 'Invertido 7 días', ventasAds7d: 'Ventas por ads 7 días', porDespachar: 'Por despachar', demorados: 'Demorados', problemas: 'Devueltos/no entregados', demoraPct: '% despachos con demora', facturacionMes: 'Facturación del mes', netoMes: 'Neto del mes', margenMes: 'Margen %' };
            const claves = Object.keys(ultimo.extra || {});
            const plata = /ganancia|gasto|ventasAds|facturacion|neto|precioProveedor/i;
            cab = ['Día', ...claves.map((k) => NOMBRES[k] || k)];
            fila = (m) => [dia(m.t), ...claves.map((k) => (m.extra?.[k] == null ? '—' : plata.test(k) ? din(m.extra[k]) : m.extra[k]))];
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
    name: 'ml_nichos', title: 'Descubrir nichos (API oficial)', readOnly: true,
    description: 'Descubre y valida NICHOS con la API oficial de MercadoLibre (sin Nubimetrics ni planillas). Con UNA búsqueda (o una categoría) da el análisis completo: (1) ordena las publicaciones de mayor a menor ROTACIÓN (unidades por mes = vendidos ÷ antigüedad); (2) si el producto SE VENDE HOY o vendió en el pasado (visitas de los últimos 5 meses contra su promedio histórico); (3) si hay OPORTUNIDAD o MONOPOLIO (cuota del líder, top 3 y HHI entre vendedores); (4) el TECHO DE DEMANDA (unidades por mes del nicho) y cuánto vende hoy alguien que entró en los últimos 90 días; (5) si es TENDENCIA, ESTACIONAL o EVERGREEN; (6) con costo, si los NÚMEROS CIERRAN al precio de mercado (comisión real de ML e impuestos del cerebro). Con VARIAS búsquedas (hasta 5) arma el RANKING DE OPORTUNIDADES con puntaje 0-100. Las ventas de terceros que informa ML pueden ser aproximadas: los resultados son estimaciones sobre una muestra, nunca inventa datos.',
    schema: { ...cuentaParam,
      busqueda: z.string().optional().describe('Una keyword, ej "organizador de cocina"'),
      busquedas: z.array(z.string()).optional().describe('Varias keywords (hasta 5) para el ranking de oportunidades'),
      categoria: z.string().optional().describe('ID de categoría (ej MLA1574) en vez de keyword'),
      costo: z.number().min(0).optional().describe('Tu costo por unidad (solo con una búsqueda): para ver si los números cierran'),
      costo_envio: z.number().min(0).optional().describe('Envío por unidad a tu cargo (default 0)'),
      muestra: z.number().optional().describe('Publicaciones a analizar por nicho (default 100 con una, 60 con varias; máx 300)'),
      sitio: z.string().optional() },
    async run(args) {
      const c = cliente(args);
      const sitio = (args.sitio || (await c.get('/users/me')).site_id || 'MLA').toUpperCase();
      if (!/^M[A-Z]{2}$/.test(sitio)) return 'sitio inválido (ej MLA, MLM, MLB).';
      const din = (n) => (n == null ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR'));
      const u = (n) => (n == null ? '—' : n >= 10 ? Math.round(n).toLocaleString('es-AR') : n.toFixed(1).replace('.', ','));
      const edad = (d) => (d == null ? '—' : d < 60 ? `${d} días` : d < 730 ? `${Math.round(d / 30)} meses` : `${(d / 365).toFixed(1).replace('.', ',')} años`);
      const lista = [...new Set([...(args.busquedas || []), ...(args.busqueda ? [args.busqueda] : [])].map((x) => String(x).replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 2 && x.length <= 80))].slice(0, 5);
      if (args.categoria && !/^M[A-Z]{2}\d+$/i.test(args.categoria)) return 'categoria inválida: tiene que ser como MLA1574.';
      if (!lista.length && !args.categoria) return 'Decime qué nicho analizar: una búsqueda (busqueda="organizador de cocina"), varias para el ranking (busquedas=[…]) o una categoría (categoria=MLA1574).';
      let tendencias = [];
      try { tendencias = (await c.get(`/trends/${sitio}`)).map((t) => sinAcento(t.keyword)); } catch {}
      if (args.categoria) { try { tendencias.push(...(await c.get(`/trends/${sitio}/${args.categoria.toUpperCase()}`)).map((t) => sinAcento(t.keyword))); } catch {} }
      const enTend = (q) => { const k = sinAcento(q); return tendencias.some((t) => t && (t.includes(k) || k.includes(t))); };
      const objetivos = args.categoria ? [{ categoria: args.categoria.toUpperCase() }] : lista.map((q) => ({ q }));
      const muestra = Math.min(Math.max(20, Math.round(args.muestra ?? (objetivos.length > 1 ? 60 : 100))), 300);
      const analisis = [];
      for (const o of objetivos) {
        let nombre = o.q;
        if (o.categoria) { try { nombre = (await c.get(`/categories/${o.categoria}`)).name || o.categoria; } catch { nombre = o.categoria; } }
        const m = await muestraDeMercado(c, sitio, { ...o, muestra });
        const conRot = m.items.filter((x) => x.vendidos != null && x.inicio).sort((a, b) => b.vendidos / (Date.now() - b.inicio) - a.vendidos / (Date.now() - a.inicio));
        const pulso = await pulsoDeVisitas(c, conRot.slice(0, objetivos.length > 1 ? 5 : 8).map((x) => x.id));
        analisis.push({ nombre, o, a: analizarNicho(m.items, { enTendencias: enTend(nombre), pulso, palabra: nombre, total: m.total }) });
      }
      // ¿Cierran los números? (con una sola búsqueda y costo)
      let numeros = null;
      if (args.costo != null && analisis.length === 1 && analisis[0].a.precios.mediana) {
        const neg = saberDe('__negocio__'), cache = new Map(), a = analisis[0].a;
        const calc = async (precio) => { const f = await comisionML(c, sitio, precio, 'gold_special', cache); return { precio, ...rentabilidadDe({ precio, pct: f.pct, fijo: f.fijo, costo: args.costo, impuestos_pct: neg.impuestos_pct ?? 0, envio: args.costo_envio ?? 0 }) }; };
        numeros = { p25: await calc(a.precios.p25), med: await calc(a.precios.mediana), impuestos: neg.impuestos_pct };
        a.puntaje = Math.max(0, Math.min(100, a.puntaje + (numeros.p25.margen >= 20 ? 10 : numeros.p25.margen >= 10 ? 5 : numeros.med.ganancia <= 0 ? -25 : 0)));
      }
      const COMP = { repartido: '🟢 repartido: no hay dueño, hay lugar', peleado: '🟡 peleado: pocos se llevan casi todo', monopolio: '🔴 monopolio: uno se lleva la mayoría' };
      const TIPO = { tendencia: '📈 tendencia (está creciendo)', estacional: '🗓️ estacional', evergreen: '♾️ evergreen (se vende todo el año)', 'en baja': '📉 en baja' };

      if (analisis.length > 1) {
        analisis.sort((x, y) => y.a.puntaje - x.a.puntaje);
        return [`# 🧭 Ranking de oportunidades — ${analisis.length} nichos`, `_Muestra de ${muestra} publicaciones por nicho, con la API oficial de MercadoLibre. Rotación = unidades por mes estimadas._`, '',
          '| # | Nicho | Puntaje | Señal | Demanda visible / mes | Vendedores con ventas | Líder | Nuevos que ya venden (90 días) | Tipo |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          ...analisis.map(({ nombre, a }, i) => `| ${i + 1} | ${nombre} | **${a.puntaje}** | ${senal(a)} | ${u(a.demandaMes)} u. | ${a.conVentas} | ${Math.round(a.top1)}% | ${a.nuevos.length}${a.rotNuevo != null ? ` (≈ ${u(a.rotNuevo)} u./mes)` : ''} | ${TIPO[a.tipo]} |`),
          '', ...analisis.map(({ nombre, a }, i) => `**${i + 1}. ${nombre}** — ${COMP[a.competencia]}; ${a.nuevos.length ? `el mejor que entró hace poco arrancó hace ${a.nuevos[0].dias} días y ya vende ≈ ${u(a.nuevos[0].rotacion)} u./mes` : 'ninguno de los que entraron en 90 días vende todavía'}; precio mediano ${din(a.precios.mediana)}.${a.cobertura < 0.5 ? ' ⚠️ ML informa ventas de pocas publicaciones de este nicho: tomalo con pinzas.' : ''}`),
          '', `Siguiente paso: pedime el detalle del mejor (ml_nichos busqueda="${analisis[0].nombre}" costo=TU_COSTO) para ver el top por rotación, el techo de demanda y si los números cierran.`].join('\n');
      }

      const { nombre, a } = analisis[0];
      if (!a.muestra) return `No encontré publicaciones para «${nombre}».`;
      const tabla = a.ranking.slice(0, 10).map((x, i) => `| ${i + 1} | ${x.titulo.slice(0, 48)} | ${x.vendedor.nick}${x.tiendaOficial ? ' 🏬' : ''} | ${din(x.precio)} | ${x.vendidos} | ${edad(x.dias)} | **${u(x.rotacion)}** | ${x.vigencia == null ? '—' : x.vigencia >= 0.7 ? '✅ se vende hoy' : x.vigencia >= 0.35 ? '🟡 bajando' : '🔴 vendió en el pasado'} |`);
      const cv = a.curva;
      const lineas = [`# 🧭 Nicho: «${nombre}» — ${senal(a)} (${a.puntaje}/100)`,
        `_Muestra: ${a.muestra} publicaciones más relevantes${a.total ? ` de ${a.total.toLocaleString('es-AR')} en total` : ''}, con la API oficial de MercadoLibre. Rotación = unidades por mes estimadas (vendidos ÷ antigüedad)._`, '',
        `## 1. ¿Cuánto rota? Las ${Math.min(10, a.ranking.length)} que más venden por mes`,
        a.ranking.length ? ['| # | Publicación | Vendedor | Precio | Vendidos | Antigüedad | Rotación / mes | ¿Hoy? |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...tabla].join('\n') : '_MercadoLibre no informa ventas de las publicaciones de este nicho: no puedo calcular la rotación (el resto del análisis usa presencia y visitas)._',
        '', '## 2. ¿Se vende hoy o vendió en el pasado?',
        cv ? `Visitas de las ${cv.medidos} que más rotan, por mes (del más viejo al último): ${cv.tramos.map((x) => x.toLocaleString('es-AR')).join(' → ')}${cv.cambio != null ? ` · el último mes ${cv.cambio >= 0 ? 'sube' : 'baja'} ${Math.abs(Math.round(cv.cambio))}% contra el promedio de los 4 anteriores` : ''}.` : '_ML no devolvió el detalle de visitas por día para estas publicaciones._',
        a.historicas.length ? `🔴 ${a.historicas.length} publicación(es) con muchas ventas viejas pero pocas visitas hoy (vendieron en el pasado, no cuentan como demanda actual): ${a.historicas.slice(0, 3).map((x) => x.id).join(', ')}.` : cv ? '✅ Las que más venden siguen recibiendo visitas: la demanda es actual.' : '',
        '', '## 3. ¿Oportunidad o monopolio?',
        `${COMP[a.competencia]}. Líder: **${a.vendedores[0]?.nick}${a.vendedores[0]?.oficial ? ' (tienda oficial)' : ''}** con ${Math.round(a.top1)}% · top 3: ${Math.round(a.top3)}% · ${a.conVentas} vendedor(es) con ventas · índice de concentración ${a.hhi.toLocaleString('es-AR')} (más de 2.500 = concentrado).`,
        '', '## 4. Techo de demanda',
        `≈ **${u(a.demandaMes)} unidades por mes** entre las ${a.ranking.length} publicaciones con ventas de la muestra (es un piso: el mercado completo es más grande).`,
        a.nuevos.length ? `🚀 ${a.nuevos.length} publicación(es) entraron en los últimos 90 días y ya venden. La mejor arrancó hace **${a.nuevos[0].dias} días** y vende ≈ **${u(a.nuevos[0].rotacion)} u./mes** (${a.nuevos[0].vendedor.nick}). Un nuevo hoy vende ≈ ${u(a.rotNuevo)} u./mes (mediana de los que entraron).` : `Nadie que haya entrado en los últimos 90 días está vendiendo todavía: entrar es más difícil.${a.paraUnNuevo ? ` Un objetivo realista para arrancar: ≈ ${u(a.paraUnNuevo)} u./mes.` : ''}`,
        '', '## 5. Tendencia, estacional o evergreen',
        `${TIPO[a.tipo]}${a.estacion ? ` — pica en ${a.estacion.meses.map((m) => nombreMes(new Date(2026, m - 1, 1).getTime()).split(' ')[0]).join(', ')}: entrá 6-8 semanas antes con stock` : a.tipo === 'tendencia' ? ' — aparece en las tendencias de búsqueda o sus visitas crecen' : a.tipo === 'en baja' ? ' — las visitas vienen cayendo fuerte: cuidado' : ' — demanda pareja: el más seguro para arrancar'}.`,
        '', '## 6. ¿Cierran los números?',
        numeros ? ['| Precio | Comisión ML | Impuestos | Ganancia por unidad | Margen |', '| --- | --- | --- | --- | --- |',
          ...[['competitivo (25% más barato)', numeros.p25], ['de mercado (mediana)', numeros.med]].map(([t, r]) => `| ${t}: ${din(r.precio)} | −${din(r.comision)} | −${din(r.impuestos)} | ${r.semaforo} ${din(r.ganancia)} | ${r.margen.toFixed(1).replace('.', ',')}% |`),
          `Con tu costo de ${din(args.costo)}${args.costo_envio ? ` + envío ${din(args.costo_envio)}` : ''}${numeros.impuestos == null ? ' (sin impuestos: cargá tu % con ml_cerebro)' : ` e impuestos de ${numeros.impuestos}%`}. ${numeros.p25.margen >= 20 ? '✅ Cierra aun peleando por precio.' : numeros.med.ganancia > 0 ? '🟡 Cierra al precio de mercado, pero no da para pelear por precio: diferenciate (combo, FULL, mejor ficha).' : '🔴 No cierra: con este costo perdés plata al precio de mercado.'} Sin publicidad: sumala con la calculadora-ml.`].join('\n')
          : `Decime tu costo por unidad y te digo si cierra al precio de mercado (precio competitivo ${din(a.precios.p25)} · mediana ${din(a.precios.mediana)}). Nunca invento el costo.`,
        '', `**Mercado:** precios ${din(a.precios.min)} a ${din(a.precios.max)} (mediana ${din(a.precios.mediana)}) · envío gratis ${a.envioGratisPct}% · FULL ${a.fullPct}%${a.envioGratisPct >= 60 ? ' → el envío gratis es casi obligatorio' : ''}.`,
        a.cobertura < 0.5 ? `⚠️ ML informa ventas de solo ${Math.round(a.cobertura * 100)}% de las publicaciones de la muestra: tomá los números como orientativos.` : '',
        '_Las ventas de terceros que informa MercadoLibre pueden venir redondeadas: todo es una estimación sobre la muestra._',
        '', 'Siguiente paso: si es 🟢 o 🟡, sumalo a la vigilancia (ml_vigilar busqueda) para confirmar la tendencia con el historial, y compará varios con ml_nichos busquedas=[…].'];
      return lineas.filter((x) => x !== '').join('\n').replace(/\n## /g, '\n\n## ');
    },
  },
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
