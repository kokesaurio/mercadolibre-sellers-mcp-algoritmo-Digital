// src/vigilancia.js — seguimiento de competidores y tendencias, 100% local.
// Guarda una lista de objetivos y un snapshot por objetivo; en cada corrida
// compara contra el snapshot anterior y reporta SOLO lo que cambió.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = () => process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const ARCHIVO = () => path.join(DIR(), 'vigilancia.json');

export function leerVigilancia() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO(), 'utf8')); } catch { return { objetivos: [], snapshots: {} }; }
}
export function guardarVigilancia(d) {
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  const tmp = ARCHIVO() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ARCHIVO());
}

export const claveDe = (o) => `${o.tipo}:${o.ref}${o.sitio ? ':' + o.sitio : ''}`;

export function agregarObjetivo({ tipo, ref, nota, sitio }) {
  const d = leerVigilancia();
  const nuevo = { tipo, ref: String(ref).trim(), nota, sitio, agregado: new Date().toISOString().slice(0, 10) };
  if (d.objetivos.some((o) => claveDe(o) === claveDe(nuevo))) return { ya: true, objetivo: nuevo };
  d.objetivos.push(nuevo);
  guardarVigilancia(d);
  return { ya: false, objetivo: nuevo };
}

export function quitarObjetivo(ref) {
  const d = leerVigilancia();
  const antes = d.objetivos.length;
  d.objetivos = d.objetivos.filter((o) => o.ref !== String(ref).trim() && claveDe(o) !== String(ref).trim());
  for (const k of Object.keys(d.snapshots)) if (k.includes(':' + ref)) delete d.snapshots[k];
  guardarVigilancia(d);
  return antes - d.objetivos.length;
}

const pct = (nuevo, viejo) => viejo ? Math.abs((nuevo - viejo) / viejo * 100).toFixed(1) : '—';
const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

// ───────── snapshots por tipo (reciben el cliente autenticado) ─────────
export async function tomarSnapshot(c, o, sitio) {
  if (o.tipo === 'vendedor') {
    const q = /^\d+$/.test(o.ref) ? { seller_id: o.ref } : { nickname: o.ref };
    const r = await c.get(`/sites/${sitio}/search`, { ...q, limit: 50, sort: 'relevance' });
    const items = {};
    for (const x of (r.results || []).slice(0, 50)) items[x.id] = { precio: x.price, titulo: x.title };
    return { total: r.paging?.total ?? Object.keys(items).length, items };
  }
  if (o.tipo === 'publicacion') {
    const b = await c.get(`/items/${o.ref}`);
    return { precio: b.price, vendidos: b.sold_quantity ?? 0, estado: b.status, stock: b.available_quantity, titulo: b.title };
  }
  if (o.tipo === 'busqueda') {
    const r = await c.get(`/sites/${sitio}/search`, { q: o.ref, limit: 10 });
    const top = (r.results || []).map((x) => ({ id: x.id, precio: x.price, vendedor: x.seller?.nickname ?? String(x.seller?.id ?? '') }));
    return { top };
  }
  if (o.tipo === 'tendencias') {
    const r = await c.get(`/trends/${sitio}${o.ref && o.ref !== sitio ? '/' + o.ref : ''}`);
    return { keywords: (Array.isArray(r) ? r : []).slice(0, 20).map((t) => t.keyword) };
  }
  throw new Error('Tipo de objetivo desconocido: ' + o.tipo);
}

// ───────── diff por tipo: devuelve lista de cambios en texto ─────────
export function compararSnapshots(o, viejo, nuevo) {
  const cambios = [];
  if (o.tipo === 'vendedor') {
    const nuevos = Object.keys(nuevo.items).filter((id) => !viejo.items[id]);
    const bajas = Object.keys(viejo.items).filter((id) => !nuevo.items[id]);
    if (nuevos.length) cambios.push(`publicó ${nuevos.length} nueva(s): ` + nuevos.slice(0, 3).map((id) => `${nuevo.items[id].titulo} (${dinero(nuevo.items[id].precio)})`).join(' · '));
    if (bajas.length) cambios.push(`dio de baja/pausó ${bajas.length} publicación(es)`);
    for (const id of Object.keys(nuevo.items)) {
      const v = viejo.items[id], n = nuevo.items[id];
      if (v && v.precio !== n.precio) cambios.push(`${n.titulo}: ${dinero(v.precio)} → ${dinero(n.precio)} (${n.precio > v.precio ? '↑' : '↓'} ${pct(n.precio, v.precio)}%)`);
    }
  } else if (o.tipo === 'publicacion') {
    if (viejo.precio !== nuevo.precio) cambios.push(`precio: ${dinero(viejo.precio)} → ${dinero(nuevo.precio)} (${nuevo.precio > viejo.precio ? '↑' : '↓'} ${pct(nuevo.precio, viejo.precio)}%)`);
    const delta = (nuevo.vendidos ?? 0) - (viejo.vendidos ?? 0);
    if (delta > 0) cambios.push(`vendió ~${delta} unidad(es) desde el último control`);
    if (viejo.estado !== nuevo.estado) cambios.push(`estado: ${viejo.estado} → ${nuevo.estado}`);
  } else if (o.tipo === 'busqueda') {
    const [lv, ln] = [viejo.top?.[0], nuevo.top?.[0]];
    if (lv && ln && (lv.id !== ln.id || lv.vendedor !== ln.vendedor)) cambios.push(`nuevo líder de la búsqueda: ${ln.vendedor} a ${dinero(ln.precio)} (antes ${lv.vendedor})`);
    else if (lv && ln && lv.precio !== ln.precio) cambios.push(`el líder (${ln.vendedor}) movió el precio: ${dinero(lv.precio)} → ${dinero(ln.precio)}`);
    const idsViejos = new Set((viejo.top || []).map((x) => x.id));
    const entrantes = (nuevo.top || []).filter((x) => !idsViejos.has(x.id));
    if (entrantes.length) cambios.push(`entraron ${entrantes.length} publicación(es) nueva(s) al top 10`);
  } else if (o.tipo === 'tendencias') {
    const [kv, kn] = [viejo.keywords || [], nuevo.keywords || []];
    const entraron = kn.filter((k) => !kv.includes(k));
    const salieron = kv.filter((k) => !kn.includes(k));
    if (entraron.length) cambios.push(`entraron al top: ${entraron.slice(0, 5).map((k) => `"${k}"`).join(', ')}`);
    if (salieron.length) cambios.push(`salieron del top: ${salieron.slice(0, 5).map((k) => `"${k}"`).join(', ')}`);
    for (const k of kn.slice(0, 10)) {
      const [pv, pn] = [kv.indexOf(k), kn.indexOf(k)];
      if (pv > -1 && pv - pn >= 5) cambios.push(`"${k}" subió del puesto ${pv + 1} al ${pn + 1}`);
    }
  }
  return cambios;
}
