// src/postventa.js — datos para los 7 trabajadores de stock, atención, reclamos, reputación,
// catálogo, moderaciones y proveedores. Todo con la API oficial de MercadoLibre, salvo los
// proveedores con tienda propia, que se leen de la ficha pública de su web (schema.org).

import dns from 'node:dns/promises';
import net from 'node:net';
import { ordenesPagas, ventasPorItem } from './negocio.js';

const DIA = 86400000;

// ───────────────────────────── Stock ─────────────────────────────
/** Días de stock de cada publicación activa según lo vendido en 30 días. */
export async function stockDias(c, sellerId, { maximo = 100 } = {}) {
  const vendidos = new Map(ventasPorItem(await ordenesPagas(c, sellerId, Date.now() - 30 * DIA)).filter((x) => x.id).map((x) => [x.id, x.u]));
  const ids = [];
  for (let offset = 0; offset < maximo; offset += 50) {
    const r = await c.get(`/users/${sellerId}/items/search`, { status: 'active', limit: 50, offset });
    ids.push(...(r.results || []));
    if ((r.results || []).length < 50) break;
  }
  for (const id of vendidos.keys()) if (!ids.includes(id)) ids.push(id); // también las que se pausaron sin stock
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    let det = [];
    try { det = await c.get('/items', { ids: lote.join(','), attributes: 'id,title,available_quantity,status,shipping,price' }); } catch { continue; }
    for (const d of Array.isArray(det) ? det : []) {
      const b = d.body; if (!b?.id) continue;
      const u30 = vendidos.get(b.id) || 0, porDia = u30 / 30;
      const stock = b.available_quantity ?? 0;
      out[b.id] = { titulo: b.title, stock, estado: b.status, full: b.shipping?.logistic_type === 'fulfillment', u30, porDia: Math.round(porDia * 100) / 100,
        dias: porDia > 0 ? Math.floor(stock / porDia) : null, precio: b.price };
    }
  }
  return out;
}

// ───────────────────────────── Atención ─────────────────────────────
export async function preguntasPendientes(c, sellerId) {
  const r = await c.get('/questions/search', { seller_id: sellerId, status: 'UNANSWERED', limit: 50, sort_fields: 'date_created', sort_types: 'ASC', api_version: 4 });
  return (r.questions || []).map((q) => ({ id: String(q.id), item: q.item_id, texto: q.text, t: Date.parse(q.date_created || '') || null }));
}

/** Mensajes de postventa sin leer (por pack/orden). null si la cuenta no tiene acceso a mensajería. */
export async function mensajesSinLeer(c) {
  try {
    const r = await c.get('/messages/unread', { role: 'seller', tag: 'post_sale' });
    return (r.results || []).map((x) => ({ pack: String(x.resource || '').split('/').pop(), cantidad: x.count ?? 1 }));
  } catch (e) { if ([400, 403, 404].includes(e.status)) return null; throw e; }
}

// ───────────────────────────── Reclamos ─────────────────────────────
const TIPO_RECLAMO = { mediations: 'Reclamo', cancel_purchase: 'Cancelación del comprador', return: 'Devolución', cancel_sale: 'Cancelación de venta' };
export async function reclamosAbiertos(c) {
  const r = await c.get('/post-purchase/v1/claims/search', { status: 'opened', sort: 'date_created:desc', limit: 50 });
  const out = {};
  for (const k of r.data || r.results || []) {
    const yo = (k.players || []).find((p) => p.role === 'respondent');
    const acciones = (yo?.available_actions || []).filter((a) => a.due_date);
    const vence = acciones.length ? Math.min(...acciones.map((a) => Date.parse(a.due_date))) : null;
    out[String(k.id)] = { tipo: TIPO_RECLAMO[k.type] || k.type, etapa: k.stage, motivo: k.reason_id, recurso: String(k.resource_id ?? ''), t: Date.parse(k.date_created || '') || null,
      vence, accion: acciones[0]?.action ?? null, mediacion: k.stage === 'dispute' };
  }
  return out;
}

// ───────────────────────────── Reputación ─────────────────────────────
export const COLOR = { '5_green': '🟢 verde', '4_light_green': '🟢 verde claro', '3_yellow': '🟡 amarillo', '2_orange': '🟠 naranja', '1_red': '🔴 rojo' };
export function reputacionDe(me) {
  const r = me.seller_reputation || {}, m = r.metrics || {};
  const pct = (x) => (x?.rate != null ? Math.round(x.rate * 1000) / 10 : null);
  return { nivel: r.level_id ?? null, lider: r.power_seller_status ?? null, ventas: r.transactions?.total ?? null,
    reclamos: pct(m.claims), demoras: pct(m.delayed_handling_time), cancelaciones: pct(m.cancellations) };
}
export async function opinionesDe(c, itemId) {
  const r = await c.get(`/reviews/item/${itemId}`);
  return { promedio: r.rating_average ?? null, total: r.paging?.total ?? (r.reviews || []).length,
    recientes: (r.reviews || []).slice(0, 20).map((x) => ({ id: String(x.id), rate: x.rate, titulo: x.title || '', texto: (x.content || '').slice(0, 280), t: Date.parse(x.date_created || '') || null })) };
}

// ───────────────────────────── Catálogo ─────────────────────────────
export async function estadoCatalogo(c, sellerId, { maximo = 30 } = {}) {
  const r = await c.get(`/users/${sellerId}/items/search`, { status: 'active', limit: 50 });
  const ids = r.results || [];
  const out = {};
  for (let i = 0; i < ids.length && Object.keys(out).length < maximo; i += 20) {
    let det = []; try { det = await c.get('/items', { ids: ids.slice(i, i + 20).join(','), attributes: 'id,title,catalog_listing,price' }); } catch { continue; }
    for (const d of Array.isArray(det) ? det : []) {
      const b = d.body; if (!b?.catalog_listing) continue;
      try {
        const p = await c.get(`/items/${b.id}/price_to_win`, { version: 'v2' });
        out[b.id] = { titulo: b.title, estado: p.status ?? null, precio: p.current_price ?? b.price, ganador: p.price_to_win ?? null, mejoras: (p.boosts || []).map((x) => x.id || x).slice(0, 4) };
      } catch {}
    }
  }
  return out;
}
export const ESTADO_CATALOGO = { winning: '🟢 ganando', sharing_first_place: '🟡 compartiendo el primer lugar', competing: '🔴 perdiendo', listed: '⚪ listada sin competir' };

// ───────────────────────────── Moderaciones ─────────────────────────────
const SUB = {
  forbidden: 'producto prohibido o con infracción', under_review: 'en revisión por MercadoLibre', waiting_for_patch: 'esperando que corrijas datos',
  held: 'retenida por MercadoLibre', poor_quality_thumbnail: 'foto de portada de baja calidad', moderation_penalty: 'penalizada por moderación',
  suspended: 'suspendida', picture_downloading_pending: 'fotos todavía procesando', out_of_stock: 'sin stock',
};
export const traducirSub = (s) => SUB[s] || String(s).replace(/_/g, ' ');
export async function moderadas(c, sellerId) {
  const out = {};
  for (const estado of ['under_review', 'paused', 'inactive']) {
    let ids = [];
    try { ids = (await c.get(`/users/${sellerId}/items/search`, { status: estado, limit: 50 })).results || []; } catch { continue; }
    for (let i = 0; i < ids.length; i += 20) {
      let det = []; try { det = await c.get('/items', { ids: ids.slice(i, i + 20).join(','), attributes: 'id,title,status,sub_status,tags' }); } catch { continue; }
      for (const d of Array.isArray(det) ? det : []) {
        const b = d.body; if (!b?.id) continue;
        const motivos = [...(b.sub_status || []), ...(b.tags || []).filter((t) => ['poor_quality_thumbnail', 'moderation_penalty'].includes(t))].filter((m) => m !== 'out_of_stock');
        if (b.status === 'under_review' || motivos.length) out[b.id] = { titulo: b.title, estado: b.status, motivos };
      }
    }
  }
  // Activas con la portada marcada de baja calidad (ML les baja exposición)
  try {
    const act = (await c.get(`/users/${sellerId}/items/search`, { status: 'active', tags: 'poor_quality_thumbnail', limit: 50 })).results || [];
    for (const id of act) if (!out[id]) out[id] = { titulo: id, estado: 'active', motivos: ['poor_quality_thumbnail'] };
  } catch {}
  return out;
}

// ───────────────────────────── Proveedores ─────────────────────────────
function ipPrivada(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') && ipPrivada(x.slice(7));
}

/** Valida que la URL del proveedor sea pública y https (sin acceso a la red interna). */
export async function validarURLProveedor(url) {
  let u; try { u = new URL(String(url).trim()); } catch { throw new Error('URL inválida.'); }
  const local = process.env.ML_PROVEEDOR_PERMITIR_LOCAL === '1' && u.protocol === 'http:' && u.hostname === 'localhost'; // solo pruebas
  if (!local) {
    if (u.protocol !== 'https:') throw new Error('La URL del proveedor tiene que ser https.');
    if (u.username || u.password) throw new Error('La URL no puede llevar usuario/contraseña.');
    const host = u.hostname.replace(/^\[|\]$/g, ''); // IPv6 viene entre corchetes
    const ips = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
    if (!ips.length) throw new Error(`No encuentro el sitio ${u.hostname}.`);
    if (ips.some((x) => ipPrivada(x.address))) throw new Error('Esa URL apunta a una red privada: no se permite.');
  }
  return u;
}

const decodificar = (s) => String(s).replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, '&');
const aNumero = (x) => { if (x == null) return null; const n = Number(String(x).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

/** Precio y disponibilidad desde la ficha pública: JSON-LD de schema.org (Tiendanube, WooCommerce, Shopify…) o metas de precio. */
export function leerFichaProducto(html) {
  let titulo = null, precio = null, stock = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(decodificar(m[1]).trim()); } catch { continue; }
    const nodos = [].concat(j['@graph'] || j).flat();
    for (const n of nodos) {
      const tipos = [].concat(n?.['@type'] || []);
      if (!tipos.includes('Product')) continue;
      titulo = titulo || n.name || null;
      const ofertas = [].concat(n.offers || []).flatMap((o) => (o['@type'] === 'AggregateOffer' ? [{ price: o.lowPrice ?? o.price, availability: o.availability }] : [o]));
      for (const o of ofertas) {
        const p = aNumero(o.price ?? o.priceSpecification?.price);
        if (p && precio == null) precio = p;
        if (o.availability && stock == null) stock = !/OutOfStock|SoldOut|Discontinued/i.test(o.availability);
      }
    }
  }
  if (precio == null) {
    const meta = html.match(/<meta[^>]+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["']/i);
    if (meta) precio = aNumero(meta[1]);
  }
  if (stock == null) { const av = html.match(/(?:product:availability|availability)["'][^>]*content=["']([^"']+)/i); if (av) stock = !/out ?of ?stock|oos|agotado/i.test(av[1]); }
  if (!titulo) titulo = (html.match(/<title>([^<]{1,140})<\/title>/i) || [])[1]?.trim() || null;
  return { titulo, precio, stock };
}

/** Lee el precio/stock del proveedor: un item de MercadoLibre (MLA…) o la URL de su tienda. */
export async function precioProveedor(c, fuente) {
  const f = String(fuente).trim();
  if (/^[A-Z]{3}\d+$/i.test(f)) {
    const b = await c.get(`/items/${f.toUpperCase()}`);
    return { titulo: b.title, precio: b.price ?? null, stock: (b.available_quantity ?? 0) > 0 && b.status === 'active', origen: 'MercadoLibre' };
  }
  const u = await validarURLProveedor(f);
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (meli-sellers-mcp; vigilancia de proveedor)', Accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (r.status >= 300 && r.status < 400) { // seguir 1 redirección, validándola también
    const destino = new URL(r.headers.get('location'), u);
    await validarURLProveedor(destino.href);
    return precioProveedor(c, destino.href);
  }
  if (!r.ok) throw new Error(`la web del proveedor respondió ${r.status}`);
  const lector = r.body.getReader(); let html = '', bytes = 0;
  for (;;) { const { done, value } = await lector.read(); if (done) break; bytes += value.length; html += Buffer.from(value).toString('utf8'); if (bytes > 3_000_000) { lector.cancel().catch(() => {}); break; } }
  const ficha = leerFichaProducto(html);
  if (ficha.precio == null) throw new Error('no encontré el precio en la ficha del proveedor (la página no publica datos de producto)');
  return { ...ficha, origen: u.hostname };
}
