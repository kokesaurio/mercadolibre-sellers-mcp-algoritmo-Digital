// El cerebro del conector: base de datos local de conocimiento del negocio.
// Vive en ~/.meli-sellers-mcp/cerebro.json — cero instalación, nada sale de la máquina.
// Guarda lo que el vendedor le enseña a Claude (costos, impuestos, medidas, notas)
// y las herramientas lo usan solo: la calculadora deja de preguntar lo que ya sabe.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const ARCHIVO = path.join(DIR, 'cerebro.json');

export function leerCerebro() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); }
  catch { return { negocio: { notas: [] }, productos: {}, skus: {} }; }
}

// ───────────── SKU: el mismo producto en varias publicaciones comparte el costo ─────────────
// La clave es el SKU normalizado (mayúsculas, sin espacios de más). Nunca "__proto__" y compañía.
export function normalizarSku(x) {
  const k = String(x ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!k || k.length > 60 || /[\u0000-\u001f]/.test(k) || ['__PROTO__', 'CONSTRUCTOR', 'PROTOTYPE'].includes(k)) return null;
  return k;
}
const deSku = (d, k) => (k && d.skus && Object.prototype.hasOwnProperty.call(d.skus, k) ? d.skus[k] : null);

/** SKU de una publicación (atributo SELLER_SKU o seller_custom_field; con variantes, solo si todas comparten uno). */
export function skuDeItem(b) {
  if (!b) return null;
  const deAttrs = (as) => (as || []).find((a) => a.id === 'SELLER_SKU')?.value_name;
  const propio = normalizarSku(deAttrs(b.attributes) || b.seller_custom_field);
  if (propio) return propio;
  const vs = [...new Set((b.variations || []).map((v) => normalizarSku(deAttrs(v.attributes) || v.seller_custom_field)))];
  return vs.length === 1 && vs[0] ? vs[0] : null;
}
/** SKU de un renglón de orden. */
export const skuDeOrden = (it) => normalizarSku(it?.item?.seller_sku || it?.item?.seller_custom_field);

/** Anota a qué SKU pertenece una publicación. Si la publicación ya tenía costo y el SKU no, el SKU lo hereda. */
export function vincularSku(itemId, sku) {
  const k = normalizarSku(sku);
  if (!itemId || !k) return null;
  const d = leerCerebro();
  d.productos = d.productos || {}; d.skus = d.skus || {};
  const p = d.productos[itemId];
  const s = deSku(d, k);
  const cambia = p?.sku !== k || (p?.costo != null && s?.costo == null);
  if (!cambia && (p || s)) return k;
  if (!p && !s) return k; // nada que recordar todavía: no ensuciamos el cerebro
  const q = (d.productos[itemId] = d.productos[itemId] || {});
  q.sku = k;
  if (q.costo != null && s?.costo == null) d.skus[k] = { costo: q.costo, de: itemId, actualizado: Date.now() };
  guardarCerebro(d);
  return k;
}

export function guardarCerebro(d) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = ARCHIVO + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ARCHIVO); // escritura atómica, como cuentas.json
}

// Datos de un producto con herencia: el costo sale del SKU (compartido por todas sus publicaciones)
// y si no, del producto; impuestos y envío, del negocio si el producto no tiene propios.
export function saberDe(itemId, sku) {
  const d = leerCerebro();
  const p = (itemId && Object.prototype.hasOwnProperty.call(d.productos || {}, itemId) ? d.productos[itemId] : null) || {};
  const k = normalizarSku(sku) || p.sku || null;
  const s = deSku(d, k);
  const r = { ...p, impuestos_pct: p.impuestos_pct ?? d.negocio?.impuestos_pct, costo_envio: p.costo_envio ?? d.negocio?.costo_envio };
  if (k) r.sku = k;
  if (s?.costo != null) { r.costo = s.costo; if (p.costo == null || s.de !== itemId) r.costoDelSku = { sku: k, de: s.de }; }
  return r;
}

/** Costo guardado para un SKU (o null). */
export function costoDeSku(sku) { const s = deSku(leerCerebro(), normalizarSku(sku)); return s?.costo ?? null; }

// Aprender sin pisar: solo escribe los campos que vienen con valor.
// Si la publicación tiene SKU, el costo se guarda en el SKU: vale para todas sus publicaciones.
export function aprender(itemId, datos, { sku } = {}) {
  const d = leerCerebro();
  d.productos = d.productos || {}; d.skus = d.skus || {};
  if (itemId) {
    const p = (d.productos[itemId] = d.productos[itemId] || {});
    const k = normalizarSku(sku) || p.sku || null;
    if (k) p.sku = k;
    for (const [kk, v] of Object.entries(datos)) {
      if (v === undefined || v === null) continue;
      if (kk === 'nota') { (p.notas = p.notas || []).push({ t: Date.now(), texto: String(v) }); }
      else if (kk === 'costo' && k) { d.skus[k] = { costo: v, de: itemId, actualizado: Date.now() }; delete p.costo; }
      else p[kk] = v;
    }
    p.actualizado = Date.now();
  } else {
    for (const [k, v] of Object.entries(datos)) {
      if (v === undefined || v === null) continue;
      if (k === 'nota') { (d.negocio.notas = d.negocio.notas || []).push({ t: Date.now(), texto: String(v) }); }
      else d.negocio[k] = v;
    }
  }
  guardarCerebro(d);
  return d;
}

export function olvidar(itemId) {
  const d = leerCerebro();
  const k = normalizarSku(itemId);
  const hayP = Object.prototype.hasOwnProperty.call(d.productos || {}, itemId), hayS = !!deSku(d, k);
  if (!hayP && !hayS) return false;
  if (hayP) delete d.productos[itemId];
  if (hayS) delete d.skus[k];
  guardarCerebro(d);
  return true;
}

/** Publicaciones del cerebro que comparten un SKU. */
export function publicacionesDeSku(sku) {
  const k = normalizarSku(sku), d = leerCerebro();
  return Object.entries(d.productos || {}).filter(([id, p]) => p.sku === k && id !== k).map(([id]) => id);
}
