// src/negocio.js — los números del negocio que usan Ramiro (rentabilidad), Ana (anuncios),
// Leo (logística) y Carmen (contabilidad). Todo con datos reales de la API de MercadoLibre +
// los costos e impuestos que el vendedor guardó en el cerebro. Lo que no se sabe, no se inventa:
// se informa como "sin costo cargado" y el resultado se marca como parcial.

import { saberDe } from './cerebro.js';

const DIA = 86400000;
const iso = (d) => new Date(d).toISOString();
const fechaCorta = (d) => new Date(d).toISOString().slice(0, 10);

// ───────────────────────────── Rentabilidad (cálculo puro) ─────────────────────────────
/** Ganancia neta por unidad. pct = comisión % de ML (null si la tarifa es fija), fijo = cargo fijo. */
export function rentabilidadDe({ precio, pct = 14, fijo = 0, costo, impuestos_pct = 0, envio = 0, adsPorUnidad = 0 }) {
  const comision = pct != null ? (precio * pct) / 100 + fijo : fijo;
  const impuestos = (precio * impuestos_pct) / 100;
  const ganancia = precio - comision - adsPorUnidad - envio - impuestos - costo;
  const margen = precio ? (ganancia / precio) * 100 : 0;
  const acosMax = precio ? ((ganancia + adsPorUnidad) / precio) * 100 : 0;
  const semaforo = ganancia <= 0 ? '🔴' : margen < 10 ? '🟡' : '🟢';
  return { comision, impuestos, ganancia, margen, acosMax, semaforo };
}

/** Comisión real de ML para un precio y tipo de publicación (con caché por llamada). */
export async function comisionML(c, sitio, precio, tipo = 'gold_special', cache = new Map()) {
  const k = `${sitio}|${tipo}|${Math.round(precio / 1000)}`;
  if (cache.has(k)) return cache.get(k);
  let r = { pct: 14, fijo: 0, real: false };
  try {
    const lp = await c.get(`/sites/${sitio}/listing_prices`, { price: precio });
    const fila = (Array.isArray(lp) ? lp : []).find((x) => x.listing_type_id === tipo) || (Array.isArray(lp) ? lp[0] : null);
    if (fila?.sale_fee_details) r = { pct: fila.sale_fee_details.percentage_fee ?? 14, fijo: fila.sale_fee_details.fixed_fee ?? 0, real: true };
    else if (fila?.sale_fee_amount != null) r = { pct: null, fijo: fila.sale_fee_amount, real: true };
  } catch {}
  cache.set(k, r);
  return r;
}

/** Gasto y ventas de Product Ads de una publicación en los últimos `dias`. null si no tiene anuncio. */
export async function adsDeItem(c, itemId, dias = 30) {
  const q = { date_from: fechaCorta(Date.now() - (dias - 1) * DIA), date_to: fechaCorta(Date.now()), metrics: 'cost,units_quantity,acos,clicks,prints,total_amount' };
  for (const ruta of [`/advertising/product_ads/ads/${itemId}`, `/advertising/product_ads/items/${itemId}`]) {
    try { const r = await c.get(ruta, q); const m = r.metrics || r; return { cost: Number(m.cost || 0), units: Number(m.units_quantity || 0), acos: m.acos ?? null }; }
    catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
  }
  return null;
}

// ───────────────────────────── Ventas ─────────────────────────────
/** Órdenes pagas entre dos fechas (paginado, hasta `maximo`). */
export async function ordenesPagas(c, sellerId, desde, hasta = Date.now(), { maximo = 500 } = {}) {
  const out = [];
  for (let offset = 0; offset < maximo; offset += 50) {
    const r = await c.get('/orders/search', { seller: sellerId, 'order.status': 'paid', 'order.date_created.from': iso(desde), 'order.date_created.to': iso(hasta), sort: 'date_desc', limit: 50, offset });
    const lote = r.results || [];
    out.push(...lote);
    if (lote.length < 50 || out.length >= (r.paging?.total ?? Infinity)) break;
  }
  return out;
}

/** Agrupa las órdenes por publicación: unidades, facturación y comisión que cobró ML. */
export function ventasPorItem(ordenes) {
  const m = new Map();
  for (const o of ordenes) for (const it of o.order_items || []) {
    const id = it.item?.id || it.item?.title || '¿?';
    const x = m.get(id) || { id: it.item?.id || null, titulo: it.item?.title || id, u: 0, plata: 0, comision: 0, comisionReal: true };
    const q = it.quantity ?? 1;
    x.u += q; x.plata += (it.unit_price ?? 0) * q;
    if (it.sale_fee != null) x.comision += it.sale_fee * q; else x.comisionReal = false;
    m.set(id, x);
  }
  return [...m.values()].sort((a, b) => b.u - a.u);
}

/** Día local (YYYY-MM-DD) de un instante: las ventas de las 23 h de Buenos Aires son de ese día, no del siguiente. */
export const diaLocal = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Ventas por día de los últimos `dias` días (los días sin ventas van en cero). */
export function ventasDiarias(ordenes, dias = 30, ahora = Date.now()) {
  const m = new Map();
  for (let i = dias - 1; i >= 0; i--) m.set(diaLocal(ahora - i * DIA), { d: diaLocal(ahora - i * DIA), bruto: 0, ordenes: 0, unidades: 0 });
  for (const o of ordenes) {
    const x = m.get(diaLocal(Date.parse(o.date_created)));
    if (!x) continue;
    x.bruto += o.total_amount ?? 0; x.ordenes++;
    for (const it of o.order_items || []) x.unidades += it.quantity ?? 0;
  }
  return [...m.values()];
}

// ───────────────────────────── Publicidad ─────────────────────────────
/** Campañas de Product Ads con métricas del período. null si la cuenta no tiene Product Ads. */
export async function campanias(c, dias = 7, { desde, hasta } = {}) {
  const qy = { date_from: desde || fechaCorta(Date.now() - (dias - 1) * DIA), date_to: hasta || fechaCorta(Date.now()), metrics: 'clicks,prints,cost,acos,cpc,units_quantity,total_amount' };
  try {
    const adv = await c.get('/advertising/advertisers', { product_id: 'PADS' });
    const a = adv.advertisers?.[0];
    const r = await c.get('/advertising/product_ads/campaigns', a ? { advertiser_id: a.advertiser_id, ...qy } : qy);
    return (r.results || r.campaigns || []).map((k) => ({
      id: String(k.id), nombre: k.name || String(k.id), estado: k.status || null, presupuesto: k.budget ?? null,
      cost: Number(k.metrics?.cost || 0), acos: k.metrics?.acos ?? null, units: Number(k.metrics?.units_quantity || 0), ventas: Number(k.metrics?.total_amount || 0),
      clics: Number(k.metrics?.clicks || 0), impresiones: Number(k.metrics?.prints || 0),
    }));
  } catch (e) { if ([400, 403, 404].includes(e.status)) return null; throw e; }
}

/** Publicidad de UN día (todas las campañas sumadas). null si la cuenta no tiene Product Ads. */
export async function adsDelDia(c, dia) {
  const ks = await campanias(c, 1, { desde: dia, hasta: dia });
  if (!ks) return null;
  return { d: dia, cost: Math.round(ks.reduce((s, k) => s + k.cost, 0)), ventas: Math.round(ks.reduce((s, k) => s + k.ventas, 0)), units: ks.reduce((s, k) => s + k.units, 0) };
}

// ───────────────────────────── Logística ─────────────────────────────
export const NOMBRE_ENVIO = { fulfillment: 'FULL', self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Punto de despacho', xd_drop_off: 'Colecta', custom: 'A convenir', not_specified: 'Sin dato' };
const SUB_DEMORA = /delay|late|retrasad|demor/i;

/** Estado de los envíos de las órdenes de los últimos `dias`. */
export async function enviosRecientes(c, sellerId, dias = 7, { maximo = 60 } = {}) {
  const ordenes = await ordenesPagas(c, sellerId, Date.now() - dias * DIA, Date.now(), { maximo });
  const out = [];
  for (const o of ordenes) {
    let s = null;
    try { s = await c.get(`/orders/${o.id}/shipments`); } catch { continue; }
    const tipo = NOMBRE_ENVIO[s.logistic_type] ?? s.logistic_type ?? 'Sin dato';
    const entrega = Date.parse(s.shipping_option?.estimated_delivery_time?.date || s.estimated_delivery_time?.date || '') || null;
    const limiteDespacho = Date.parse(s.shipping_option?.estimated_handling_limit?.date || s.estimated_handling_limit?.date || '') || null;
    const pendiente = ['ready_to_ship', 'handling', 'pending'].includes(s.status);
    out.push({
      orden: String(o.id), fecha: Date.parse(o.date_created) || null, estado: s.status ?? null, subestado: s.substatus ?? null, tipo,
      titulo: o.order_items?.[0]?.item?.title ?? '', provincia: s.receiver_address?.state?.name ?? null, entrega, limiteDespacho,
      porDespachar: pendiente && tipo !== 'FULL', // FULL lo despacha MercadoLibre
      demorado: SUB_DEMORA.test(s.substatus || '') || (s.status === 'shipped' && entrega != null && entrega < Date.now() - DIA)
        || (pendiente && limiteDespacho != null && limiteDespacho < Date.now()),
      problema: ['not_delivered', 'returned', 'cancelled'].includes(s.status) ? s.status : null,
    });
  }
  return out;
}

// ───────────────────────────── Contabilidad ─────────────────────────────
/**
 * Resultado de un período: facturación − comisiones de ML − publicidad − impuestos − costo de
 * mercadería (solo de lo que tiene costo cargado en el cerebro) − envíos a cargo (si están cargados).
 */
export async function resumenContable(c, sellerId, desde, hasta = Date.now(), { conAds = true } = {}) {
  const ordenes = await ordenesPagas(c, sellerId, desde, hasta, { maximo: 1000 });
  const items = ventasPorItem(ordenes);
  const negocio = saberDe('__negocio__');
  let bruto = 0, unidades = 0, comisiones = 0, costoMercaderia = 0, envios = 0, uSinCosto = 0, comisionEstimada = false;
  const sinCosto = [];
  for (const x of items) {
    bruto += x.plata; unidades += x.u;
    if (x.comisionReal && x.comision) comisiones += x.comision; else { comisiones += x.plata * 0.14; comisionEstimada = true; }
    const sabido = x.id ? saberDe(x.id) : negocio;
    if (sabido.costo != null) costoMercaderia += sabido.costo * x.u; else { uSinCosto += x.u; sinCosto.push(x.titulo); }
    if (sabido.costo_envio != null) envios += sabido.costo_envio * x.u;
  }
  const impuestosPct = negocio.impuestos_pct ?? null;
  const impuestos = impuestosPct != null ? (bruto * impuestosPct) / 100 : null;
  let ads = null;
  if (conAds) {
    const dias = Math.max(1, Math.round((hasta - desde) / DIA));
    const ks = await campanias(c, dias).catch(() => null);
    if (ks) ads = ks.reduce((s, k) => s + k.cost, 0);
  }
  const neto = bruto - comisiones - (ads ?? 0) - (impuestos ?? 0) - costoMercaderia - envios;
  const cobertura = unidades ? (unidades - uSinCosto) / unidades : 1;
  return {
    desde, hasta, ordenes: ordenes.length, unidades, bruto, comisiones, comisionEstimada, ads, impuestos, impuestosPct, costoMercaderia, envios, neto,
    margen: bruto ? (neto / bruto) * 100 : 0, cobertura, sinCosto: [...new Set(sinCosto)].slice(0, 10), parcial: cobertura < 1 || impuestosPct == null,
    top: items.slice(0, 5).map((x) => ({ titulo: x.titulo, u: x.u, plata: x.plata })),
  };
}

export const inicioDeMes = (t = Date.now(), corrimiento = 0) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + corrimiento, 1).getTime(); };
export const nombreMes = (t) => new Date(t).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
