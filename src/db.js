// src/db.js — la base de datos del equipo de trabajadores: SQLite que YA VIENE con Node.js.
//
// Cero instalación (ideal Windows): no hay servidor, ni compilador, ni paquetes nativos.
// Es un solo archivo, equipo.db, en la carpeta del conector (%USERPROFILE%\.meli-sellers-mcp).
// Se abre con cualquier visor de SQLite (ej: DB Browser for SQLite) y se copia como backup.
//
// Requiere Node 22.5 o superior (el Node LTS actual lo trae). Con un Node más viejo el
// equipo sigue andando con el archivo JSON de siempre: nada se rompe, solo no hay historial.
//
// Claude y el servicio 24/7 pueden usarla a la vez: modo WAL + busy_timeout.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const DIR = () => process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
export const RUTA_DB = () => path.join(DIR(), 'equipo.db');
export const RETENCION_DIAS = 400;
export const NODE_MINIMO = '22.5.0';

let conexion = null, rutaAbierta = null, motivo = null;

function cargarSqlite() {
  if (process.env.ML_SIN_SQLITE === '1') { motivo = 'desactivada (ML_SIN_SQLITE=1)'; return null; }
  // node:sqlite avisa "experimental" por consola en Node 22: lo silenciamos solo para este import
  const original = process.emitWarning;
  process.emitWarning = function (w, ...resto) {
    if (String(w?.message ?? w).includes('SQLite')) return;
    return original.call(process, w, ...resto);
  };
  try { return createRequire(import.meta.url)('node:sqlite').DatabaseSync; }
  catch { motivo = `tu Node.js (${process.version}) no trae SQLite: actualizá a Node ${NODE_MINIMO} o superior`; return null; }
  finally { process.emitWarning = original; }
}

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL, trabajador TEXT NOT NULL, ref TEXT, nivel TEXT, texto TEXT NOT NULL,
  skill TEXT, leida INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alertas_t ON alertas(t);
CREATE INDEX IF NOT EXISTS alertas_trab ON alertas(trabajador, leida);

CREATE TABLE IF NOT EXISTS mediciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL, trabajador TEXT NOT NULL, ref TEXT NOT NULL, tipo TEXT,
  precio REAL, mi_precio REAL, vendidos INTEGER, stock INTEGER, estado TEXT,
  puesto INTEGER, lider TEXT, precio_lider REAL, extra TEXT
);
CREATE INDEX IF NOT EXISTS mediciones_ref ON mediciones(ref, t);
CREATE INDEX IF NOT EXISTS mediciones_trab ON mediciones(trabajador, t);

CREATE TABLE IF NOT EXISTS controles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL, trabajador TEXT NOT NULL, tareas INTEGER, alertas INTEGER, error TEXT, modo TEXT
);
CREATE INDEX IF NOT EXISTS controles_t ON controles(trabajador, t);

CREATE TABLE IF NOT EXISTS auditorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL, item_id TEXT NOT NULL, cuenta TEXT, titulo TEXT, semaforo TEXT,
  problemas INTEGER, codigos TEXT, precio REAL, dias_sin_tocar INTEGER
);
CREATE INDEX IF NOT EXISTS auditorias_item ON auditorias(item_id, t);
CREATE INDEX IF NOT EXISTS auditorias_t ON auditorias(t);

CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT);
`;

/** Devuelve la conexión (o null si este Node no trae SQLite). Una por proceso y por carpeta. */
export function db() {
  const ruta = RUTA_DB();
  if (conexion && rutaAbierta === ruta) return conexion;
  if (conexion) { try { conexion.close(); } catch {} conexion = null; }
  const DatabaseSync = cargarSqlite();
  if (!DatabaseSync) return null;
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  const nueva = !fs.existsSync(ruta);
  const c = new DatabaseSync(ruta);
  c.exec('PRAGMA busy_timeout = 8000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  c.exec(ESQUEMA);
  if (nueva) { try { fs.chmodSync(ruta, 0o600); } catch {} }
  conexion = c; rutaAbierta = ruta; motivo = null;
  limpiarViejo();
  return c;
}

export function motivoSinDB() { return motivo; }
export function cerrarDB() { if (conexion) { try { conexion.close(); } catch {} } conexion = null; rutaAbierta = null; }

// Transacción simple (node:sqlite no trae helper): todo o nada
function enTransaccion(c, fn) {
  c.exec('BEGIN IMMEDIATE');
  try { const r = fn(); c.exec('COMMIT'); return r; } catch (e) { try { c.exec('ROLLBACK'); } catch {} throw e; }
}

// ───────────────────────────── Alertas ─────────────────────────────
export function guardarAlertas(alertas) {
  const c = db(); if (!c || !alertas.length) return false;
  const ins = c.prepare('INSERT INTO alertas (t, trabajador, ref, nivel, texto, skill, leida) VALUES (?, ?, ?, ?, ?, ?, ?)');
  enTransaccion(c, () => { for (const a of alertas) ins.run(a.t, a.trabajador, a.ref ?? null, a.nivel ?? null, a.texto, a.skill ?? null, a.leida ? 1 : 0); });
  return true;
}

const aAlerta = (r) => ({ id: r.id, t: r.t, trabajador: r.trabajador, ref: r.ref, nivel: r.nivel, texto: r.texto, ...(r.skill ? { skill: r.skill } : {}), leida: !!r.leida });

export function leerAlertas({ todas = false, marcar = true, trabajador, ref, dias, limite } = {}) {
  limite = limite ?? (todas ? 500 : 5000); // las sin leer van TODAS (hasta 5000): ninguna queda pendiente
  const c = db(); if (!c) return null;
  const donde = [], args = [];
  if (!todas) donde.push('leida = 0');
  if (trabajador) { donde.push('trabajador = ?'); args.push(trabajador); }
  if (ref) { donde.push('ref = ?'); args.push(ref); }
  if (dias) { donde.push('t >= ?'); args.push(Date.now() - dias * 86400000); }
  const sql = `SELECT * FROM alertas ${donde.length ? 'WHERE ' + donde.join(' AND ') : ''} ORDER BY t DESC, id DESC LIMIT ?`;
  const filas = c.prepare(sql).all(...args, Math.min(Math.max(1, limite | 0), 5000)).map(aAlerta);
  if (marcar && filas.some((a) => !a.leida)) {
    const up = c.prepare('UPDATE alertas SET leida = 1 WHERE id = ?');
    enTransaccion(c, () => { for (const a of filas) if (!a.leida) up.run(a.id); });
  }
  return filas.reverse(); // de la más vieja a la más nueva, como la bandeja JSON
}

export function contarAlertas(trabajador) {
  const c = db(); if (!c) return null;
  const ahora = Date.now();
  const r = c.prepare(`SELECT
      SUM(CASE WHEN leida = 0 THEN 1 ELSE 0 END) AS sinLeer,
      SUM(CASE WHEN t >= ? THEN 1 ELSE 0 END) AS h24,
      SUM(CASE WHEN t >= ? THEN 1 ELSE 0 END) AS d7,
      SUM(CASE WHEN t >= ? AND nivel = 'alta' THEN 1 ELSE 0 END) AS urgentes7
    FROM alertas WHERE trabajador = ?`).get(ahora - 86400000, ahora - 7 * 86400000, ahora - 7 * 86400000, trabajador);
  return { sinLeer: r.sinLeer || 0, h24: r.h24 || 0, d7: r.d7 || 0, urgentes7: r.urgentes7 || 0 };
}

// ───────────────────────────── Mediciones (el historial) ─────────────────────────────
const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const mediana = (xs) => { const a = xs.filter((n) => n > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

// Traduce la "foto" de cada oficio a columnas consultables
export function filaDeMedicion(trabajador, tarea, datos) {
  const f = { precio: null, mi_precio: null, vendidos: null, stock: null, estado: null, puesto: null, lider: null, precio_lider: null, extra: null };
  if (trabajador === 'precios') {
    if (tarea.tipo === 'publicacion') Object.assign(f, { precio: num(datos.precio), estado: datos.estado ?? null, vendidos: num(datos.vendidos), stock: num(datos.stock) });
    else {
      const ps = Object.values(datos.items || {}).map((x) => x.precio).filter((n) => n > 0);
      Object.assign(f, { precio: ps.length ? Math.min(...ps) : null, extra: JSON.stringify({ publicaciones: datos.total ?? ps.length, mediana: mediana(ps) }) });
    }
    f.mi_precio = num(datos.mio);
  } else if (trabajador === 'ventas') {
    Object.assign(f, { precio: num(datos.precio), vendidos: num(datos.vendidos), stock: num(datos.stock), estado: datos.estado ?? null });
  } else if (trabajador === 'ranking') {
    const l = datos.top?.[0];
    Object.assign(f, { puesto: num(datos.mio), lider: l?.vendedor ?? null, precio_lider: num(l?.precio), extra: JSON.stringify({ mediana10: mediana((datos.top || []).slice(0, 10).map((x) => x.precio)) }) });
  } else if (trabajador === 'rivales') {
    f.extra = JSON.stringify({ vendedores: Object.keys(datos.vendedores || {}).length });
  } else if (trabajador === 'auditor') {
    f.extra = JSON.stringify({ total: datos.total, rojas: datos.rojas, amarillas: datos.amarillas, verdes: datos.verdes, sinActualizar: datos.sinActualizar });
  } else if (trabajador === 'tendencias') {
    const ks = (datos.keywords || []).slice(0, 10);
    Object.assign(f, { lider: ks[0] ?? null, extra: JSON.stringify({ top: ks }) });
  }
  return f;
}

export function registrarMediciones(lista) {
  const c = db(); if (!c || !lista.length) return false;
  const ins = c.prepare(`INSERT INTO mediciones (t, trabajador, ref, tipo, precio, mi_precio, vendidos, stock, estado, puesto, lider, precio_lider, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  enTransaccion(c, () => {
    for (const m of lista) {
      const f = filaDeMedicion(m.trabajador, m.tarea, m.datos);
      ins.run(m.t, m.trabajador, m.tarea.ref, m.tarea.tipo ?? null, f.precio, f.mi_precio, f.vendidos, f.stock, f.estado, f.puesto, f.lider, f.precio_lider, f.extra);
    }
  });
  return true;
}

export function registrarControles(lista) {
  const c = db(); if (!c || !lista.length) return false;
  const ins = c.prepare('INSERT INTO controles (t, trabajador, tareas, alertas, error, modo) VALUES (?, ?, ?, ?, ?, ?)');
  enTransaccion(c, () => { for (const x of lista) ins.run(x.t, x.trabajador, x.tareas ?? 0, x.alertas ?? 0, x.error ?? null, x.modo ?? null); });
  return true;
}

/** Mediciones de un objetivo (o de un trabajador entero) en los últimos N días, de la más vieja a la más nueva. */
export function leerMediciones({ ref, trabajador, dias = 30, limite = 5000 } = {}) {
  const c = db(); if (!c) return null;
  const donde = ['t >= ?'], args = [Date.now() - dias * 86400000];
  if (ref) { donde.push('ref = ?'); args.push(ref); }
  if (trabajador) { donde.push('trabajador = ?'); args.push(trabajador); }
  return c.prepare(`SELECT * FROM mediciones WHERE ${donde.join(' AND ')} ORDER BY t ASC, id ASC LIMIT ?`).all(...args, Math.min(Math.max(1, limite | 0), 20000))
    .map((r) => ({ ...r, extra: r.extra ? JSON.parse(r.extra) : null }));
}

/** Primera medición conocida de un objetivo para un trabajador (sirve para el ritmo de ventas). */
export function primeraMedicion(trabajador, ref) {
  const c = db(); if (!c) return null;
  return c.prepare('SELECT t, vendidos FROM mediciones WHERE trabajador = ? AND ref = ? AND vendidos IS NOT NULL ORDER BY t ASC LIMIT 1').get(trabajador, ref) || null;
}

// ───────────────────────────── Auditorías de publicaciones propias ─────────────────────────────
export function guardarAuditoria(t, cuenta, items) {
  const c = db(); if (!c || !items.length) return false;
  const ins = c.prepare('INSERT INTO auditorias (t, item_id, cuenta, titulo, semaforo, problemas, codigos, precio, dias_sin_tocar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  enTransaccion(c, () => { for (const a of items) ins.run(t, a.id, cuenta ?? null, a.titulo ?? null, a.semaforo, a.codigos.length, a.codigos.join(','), a.precio ?? null, a.diasSinTocar ?? null); });
  return true;
}

/** Desde cuándo el precio de una publicación propia está igual (según las auditorías guardadas). */
export function precioSinCambiosDesde(itemId) {
  const c = db(); if (!c) return null;
  const ult = c.prepare('SELECT precio FROM auditorias WHERE item_id = ? AND precio IS NOT NULL ORDER BY t DESC, id DESC LIMIT 1').get(itemId);
  if (!ult) return null;
  const distinto = c.prepare('SELECT MAX(t) AS t FROM auditorias WHERE item_id = ? AND precio IS NOT NULL AND precio != ?').get(itemId, ult.precio).t;
  return c.prepare('SELECT MIN(t) AS t FROM auditorias WHERE item_id = ? AND precio = ? AND t > ?').get(itemId, ult.precio, distinto ?? 0).t ?? null;
}

/** Resumen de cada auditoría (una fila por fecha) de los últimos N días. */
export function resumenAuditorias(dias = 400) {
  const c = db(); if (!c) return null;
  return c.prepare(`SELECT t, COUNT(*) AS total,
      SUM(CASE WHEN semaforo = '🔴' THEN 1 ELSE 0 END) AS rojas,
      SUM(CASE WHEN semaforo = '🟡' THEN 1 ELSE 0 END) AS amarillas,
      SUM(CASE WHEN semaforo = '🟢' THEN 1 ELSE 0 END) AS verdes,
      SUM(CASE WHEN ',' || codigos || ',' LIKE '%,sin_actualizar,%' THEN 1 ELSE 0 END) AS sin_actualizar
    FROM auditorias WHERE t >= ? GROUP BY t ORDER BY t ASC`).all(Date.now() - dias * 86400000);
}

// ───────────────────────────── Mantenimiento ─────────────────────────────
function limpiarViejo() {
  const c = conexion; if (!c) return;
  try {
    const ult = Number(c.prepare("SELECT valor FROM meta WHERE clave = 'limpieza'").get()?.valor || 0);
    if (Date.now() - ult < 86400000) return; // una vez por día alcanza
    const corte = Date.now() - RETENCION_DIAS * 86400000;
    enTransaccion(c, () => {
      c.prepare('DELETE FROM mediciones WHERE t < ?').run(corte);
      c.prepare('DELETE FROM controles WHERE t < ?').run(corte);
      c.prepare('DELETE FROM auditorias WHERE t < ?').run(corte);
      c.prepare('DELETE FROM alertas WHERE t < ? AND leida = 1').run(corte);
      c.prepare("INSERT INTO meta (clave, valor) VALUES ('limpieza', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(String(Date.now()));
    });
  } catch {}
}

/** Pasa las alertas que estaban en el JSON (versiones anteriores) a la base, una sola vez. */
export function migrarBandeja(bandeja) {
  const c = db(); if (!c || !bandeja?.length) return 0;
  const ya = c.prepare("SELECT valor FROM meta WHERE clave = 'migrada_bandeja'").get();
  if (ya) return 0;
  enTransaccion(c, () => {
    const ins = c.prepare('INSERT INTO alertas (t, trabajador, ref, nivel, texto, skill, leida) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const a of bandeja) ins.run(a.t, a.trabajador, a.ref ?? null, a.nivel ?? null, a.texto, a.skill ?? null, a.leida ? 1 : 0);
    c.prepare("INSERT INTO meta (clave, valor) VALUES ('migrada_bandeja', ?)").run(String(bandeja.length));
  });
  return bandeja.length;
}

export function estadoDB() {
  const c = db();
  if (!c) return { activa: false, motivo: motivoSinDB(), ruta: RUTA_DB() };
  const cuenta = (tabla) => c.prepare(`SELECT COUNT(*) AS n, MIN(t) AS desde, MAX(t) AS hasta FROM ${tabla}`).get();
  let bytes = 0;
  for (const f of [RUTA_DB(), RUTA_DB() + '-wal']) { try { bytes += fs.statSync(f).size; } catch {} }
  const objetivos = c.prepare('SELECT COUNT(DISTINCT ref) AS n FROM mediciones').get().n;
  return { activa: true, ruta: RUTA_DB(), bytes, alertas: cuenta('alertas'), mediciones: cuenta('mediciones'), controles: cuenta('controles'), objetivos, sqlite: c.prepare('SELECT sqlite_version() AS v').get().v };
}

/** Copia consistente de la base (aunque esté en uso). Devuelve la ruta del backup. */
export function backupDB(destino) {
  const c = db(); if (!c) throw new Error('La base de datos no está activa: ' + motivoSinDB());
  const archivo = destino || path.join(DIR(), `equipo-backup-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(archivo)) fs.rmSync(archivo);
  c.prepare('VACUUM INTO ?').run(archivo);
  return archivo;
}
