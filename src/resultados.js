// src/resultados.js — lo que el equipo SABE (no solo lo que avisa) y su envío a Google Drive.
//
// armarResultados(): una tabla por trabajador armada con los datos reales de su último
//   control (precio del rival vs el tuyo, ritmo de ventas, tu puesto por keyword, rivales
//   detectados, top de tendencias). La usa ml_trabajadores accion=resultados y Drive.
//
// Dos caminos a Drive, sin crear apps en Google Cloud:
//   1. Planilla de Google (recomendado, en vivo 24/7): un Apps Script pegado en una planilla
//      recibe cada lote con una clave secreta → pestaña "Alertas" + una pestaña por trabajador.
//   2. Carpeta de Google Drive para escritorio: CSV + resumen en una carpeta que Drive sincroniza.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EQUIPO, IDS, leerEquipo, tareasDe, claveTarea, actualizarEquipo, resumenAlertas, alertasRecientes } from './trabajadores.js';
import { leerMediciones, primeraMedicion } from './db.js';

export const CARPETA_NOMBRE = 'MercadoLibre - Equipo de trabajadores';
const dinero = (n) => (n == null ? '—' : '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }));
const fecha = (t) => (t ? new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const r1 = (n) => Math.round(n * 10) / 10;
const mediana = (xs) => { const a = xs.filter((n) => n > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

// ───────────────────────────── Resultados por trabajador ─────────────────────────────
export function armarResultados(d = leerEquipo()) {
  const ahora = Date.now();
  const out = {};
  for (const id of IDS) {
    const tareas = tareasDe(d, id);
    const snap = (t) => d.snapshots[id + '|' + claveTarea(t)];
    const alertas = alertasRecientes({ trabajador: id, dias: 7 });
    const conteo = resumenAlertas(id, d);
    let cabecera = [], filas = [], destacado = '';

    if (id === 'precios') {
      cabecera = ['Objetivo', 'Tipo', 'Título / vendedor', 'Precio rival', 'Tu precio', 'Diferencia %', 'Situación', 'Último control'];
      let debajo = 0;
      for (const t of tareas) {
        const s = snap(t); if (!s) { filas.push([t.ref, t.tipo, '(esperando primer control)', '', '', '', '', '']); continue; }
        const x = s.datos;
        const precio = t.tipo === 'publicacion' ? x.precio : Math.min(...Object.values(x.items || {}).map((i) => i.precio).filter((n) => n > 0));
        const nombre = t.tipo === 'publicacion' ? (x.titulo || t.ref) : `${t.ref} (${Object.keys(x.items || {}).length} publicaciones, mínimo)`;
        const dif = x.mio ? r1(((precio - x.mio) / x.mio) * 100) : null;
        const situacion = x.mio == null ? 'sin comparar (falta mi_item)' : precio < x.mio ? '🔴 más barato que vos' : precio === x.mio ? '🟡 mismo precio' : '🟢 vos sos más barato';
        if (x.mio != null && precio < x.mio) debajo++;
        filas.push([t.ref, t.tipo, nombre, Number.isFinite(precio) ? precio : null, x.mio ?? null, dif, situacion, fecha(s.t)]);
      }
      destacado = debajo ? `${debajo} rival(es) hoy están más baratos que vos → calculadora-ml` : filas.length ? 'Ningún rival vigilado está por debajo de tu precio' : '';
    }

    if (id === 'ventas') {
      cabecera = ['Publicación', 'Título', 'Precio', 'Vendidos (público)', 'Vendidos desde que vigilamos', 'Días vigilado', 'Ritmo u./día', 'Facturación est./mes', 'Stock', 'Estado', 'Último control'];
      let mejor = null;
      for (const t of tareas) {
        const s = snap(t); if (!s) { filas.push([t.ref, '(esperando primer control)', '', '', '', '', '', '', '', '', '']); continue; }
        const x = s.datos;
        let base = x.base || { t: s.t, vendidos: x.vendidos };
        try { const p0 = primeraMedicion('ventas', t.ref); if (p0 && p0.t < base.t) base = p0; } catch {} // la base recuerda desde el primer día
        const dias = Math.max((s.t - base.t) / 86400000, 0);
        const vend = Math.max(0, (x.vendidos ?? 0) - (base.vendidos ?? 0));
        const ritmo = dias >= 0.04 ? r1(vend / dias) : null; // ≥ 1 h de datos
        const mes = ritmo != null && x.precio ? Math.round(ritmo * 30 * x.precio) : null;
        if (ritmo != null && (!mejor || ritmo > mejor.ritmo)) mejor = { ref: t.ref, titulo: x.titulo, ritmo };
        filas.push([t.ref, x.titulo || '', x.precio ?? null, x.vendidos ?? null, vend, r1(dias), ritmo, mes, x.stock ?? null, x.stock === 0 ? 'SIN STOCK 🟢 oportunidad' : x.estado, fecha(s.t)]);
      }
      destacado = mejor ? `El rival que más vende: ${mejor.titulo || mejor.ref} (≈ ${mejor.ritmo} u./día)` : filas.length ? 'Juntando datos: el ritmo aparece después de 1 h de vigilancia' : '';
    }

    if (id === 'ranking') {
      cabecera = ['Keyword', 'Líder', 'Precio líder', 'Precio mediana top 10', 'Tu publicación', 'Tu puesto', 'Último control'];
      const puestos = [];
      for (const t of tareas) {
        const s = snap(t); if (!s) { filas.push([t.ref, '(esperando primer control)', '', '', '', '', '']); continue; }
        const x = s.datos, l = x.top?.[0];
        const puesto = t.mi_item ? (x.mio ?? 'fuera del top 50') : '';
        if (typeof x.mio === 'number') puestos.push(`${t.ref}: ${x.mio}º`);
        filas.push([t.ref, l?.vendedor ?? '—', l?.precio ?? null, mediana((x.top || []).slice(0, 10).map((i) => i.precio)), t.mi_item || '(sin mi_item)', puesto, fecha(s.t)]);
      }
      destacado = puestos.length ? 'Tus puestos: ' + puestos.join(' · ') : filas.length ? 'Pasale mi_item a Martina para ver tu puesto' : '';
    }

    if (id === 'rivales') {
      cabecera = ['Keyword', 'Vendedores distintos vistos', 'Rivales nuevos (7 días)', 'Últimos rivales nuevos', 'Último control'];
      let total = 0;
      for (const t of tareas) {
        const s = snap(t); const vistos = d.vistos[id + '|' + claveTarea(t)] || [];
        const nuevos = alertas.filter((a) => a.ref === t.ref && ahora - a.t < 7 * 86400000);
        total += nuevos.length;
        const nombres = nuevos.slice(-3).map((a) => (a.texto.match(/\*\*(.+?)\*\*/) || [])[1]).filter(Boolean).join(', ');
        filas.push([t.ref, vistos.length, nuevos.length, nombres || '—', fecha(s?.t)]);
      }
      destacado = total ? `${total} rival(es) nuevo(s) esta semana → competencia-ml` : filas.length ? 'Sin rivales nuevos esta semana' : '';
    }

    if (id === 'tendencias') {
      cabecera = ['Sitio / categoría', 'Puesto', 'Keyword', 'Último control'];
      for (const t of tareas) {
        const s = snap(t); if (!s) { filas.push([t.ref, '', '(esperando primer control)', '']); continue; }
        (s.datos.keywords || []).slice(0, 10).forEach((k, i) => filas.push([t.ref, i + 1, k, fecha(s.t)]));
      }
      destacado = filas.length && filas[0][2] && !String(filas[0][2]).startsWith('(') ? `Lo más buscado: "${filas[0][2]}"` : '';
    }

    out[id] = { hoja: `${EQUIPO[id].nombre} - ${EQUIPO[id].puesto}`, cabecera, filas, conteo, destacado, ultimo: d.trabajadores[id].ultimo };
  }
  return out;
}

export function resultadosEnMarkdown(res, solo) {
  const celda = (v, i, cab) => v == null || v === '' ? '—' : typeof v === 'number' && /precio|facturaci/i.test(cab[i]) ? dinero(v) : String(v).replace(/\|/g, '/');
  return (solo ? [solo] : IDS).map((id) => {
    const r = res[id], e = EQUIPO[id];
    const tabla = r.filas.length
      ? `| ${r.cabecera.join(' | ')} |\n| ${r.cabecera.map(() => '---').join(' | ')} |\n` + r.filas.slice(0, 30).map((f) => `| ${f.map((v, i) => celda(v, i, r.cabecera)).join(' | ')} |`).join('\n')
      : '_Sin tareas todavía: asignale algo o sumá seguidos con ml_vigilar._';
    return `### ${e.emoji} ${e.nombre} — ${e.puesto}\n` +
      `Alertas: **${r.conteo.h24}** en 24 h · **${r.conteo.d7}** en 7 días (${r.conteo.urgentes7} 🔴) · último control ${fecha(r.ultimo)}\n` +
      (r.destacado ? `**→ ${r.destacado}**\n` : '') + '\n' + tabla;
  }).join('\n\n');
}

// ───────────────────────────── Configuración de Drive ─────────────────────────────
export function validarScript(url) {
  let u; try { u = new URL(String(url).trim()); } catch { return null; }
  const esGoogle = u.protocol === 'https:' && u.hostname === 'script.google.com' && /^\/macros\/s\/[\w-]{10,}\/exec$/.test(u.pathname);
  const esPrueba = process.env.ML_DRIVE_PERMITIR_LOCAL === '1' && u.protocol === 'http:' && u.hostname === 'localhost'; // solo suite de pruebas
  return esGoogle || esPrueba ? u.origin + u.pathname : null;
}

export function detectarCarpetaDrive() {
  const cand = [];
  if (process.platform === 'win32') {
    for (const l of 'GHIJKLMNOPQRSTUVWXYZDEF') for (const n of ['Mi unidad', 'My Drive']) cand.push(`${l}:\\${n}`);
  } else {
    const cs = path.join(os.homedir(), 'Library', 'CloudStorage');
    try { for (const f of fs.readdirSync(cs)) if (f.startsWith('GoogleDrive')) for (const n of ['Mi unidad', 'My Drive']) cand.push(path.join(cs, f, n)); } catch {}
    for (const n of ['Mi unidad', 'My Drive']) cand.push(path.join(os.homedir(), 'Google Drive', n));
    cand.push(path.join(os.homedir(), 'Google Drive'));
  }
  return cand.find((c) => { try { return fs.statSync(c).isDirectory(); } catch { return false; } }) || null;
}

export function configDrive() { return leerEquipo().drive || {}; }

export function claveDrive() {
  return actualizarEquipo((d) => {
    d.drive = d.drive || {};
    if (!d.drive.clave) d.drive.clave = crypto.randomBytes(18).toString('base64url');
    return d.drive.clave;
  });
}

export function conectarDrive({ url, carpeta }) {
  const cambios = {};
  if (url) {
    const ok = validarScript(url);
    if (!ok) throw new Error('Esa URL no es de una app web de Apps Script. Tiene que ser como https://script.google.com/macros/s/XXXX/exec (Implementar → Nueva implementación → App web).');
    cambios.script = ok;
  }
  if (carpeta) {
    const destino = carpeta === 'auto' ? detectarCarpetaDrive() : carpeta;
    if (!destino) throw new Error('No encontré la carpeta de Google Drive para escritorio en esta PC. Instalá Drive para escritorio, o pasá la ruta exacta (ej: G:\\Mi unidad).');
    if (!path.isAbsolute(destino)) throw new Error('La carpeta tiene que ser una ruta completa (ej: G:\\Mi unidad).');
    let st; try { st = fs.statSync(destino); } catch { throw new Error(`No existe la carpeta ${destino}.`); }
    if (!st.isDirectory()) throw new Error(`${destino} no es una carpeta.`);
    cambios.carpeta = path.join(destino, CARPETA_NOMBRE);
    fs.mkdirSync(cambios.carpeta, { recursive: true });
  }
  claveDrive();
  return actualizarEquipo((d) => { Object.assign(d.drive, cambios, { ultimoError: null }); return { ...d.drive }; });
}

export function desconectarDrive(que = 'todo') {
  return actualizarEquipo((d) => {
    if (!d.drive) return false;
    if (que === 'todo' || que === 'script') delete d.drive.script;
    if (que === 'todo' || que === 'carpeta') delete d.drive.carpeta;
    return true;
  });
}

// ───────────────────────────── Envío ─────────────────────────────
// Un título de rival como "=IMPORTXML(...)" no debe ejecutarse en tu planilla
const segura = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v ?? '');
const filaAlerta = (a) => [fecha(a.t), `${EQUIPO[a.trabajador]?.emoji ?? ''} ${EQUIPO[a.trabajador]?.nombre ?? a.trabajador}`, a.nivel === 'alta' ? '🔴 urgente' : a.nivel === 'media' ? '🟡 media' : '🟢 baja', a.ref, a.texto.replace(/\*\*/g, ''), a.skill || ''].map(segura);
export const CABECERA_ALERTAS = ['Fecha', 'Trabajador', 'Nivel', 'Objetivo', 'Alerta', 'Skill sugerida'];
export const CABECERA_HISTORIAL = ['Fecha', 'Trabajador', 'Objetivo', 'Precio', 'Tu precio', 'Vendidos (acum.)', 'Stock', 'Estado', 'Tu puesto', 'Líder', 'Precio líder'];

// El historial de la base de datos (si está activa) como filas para la planilla y el CSV
export function filasHistorial(dias = 60, limite = 3000) {
  let ms; try { ms = leerMediciones({ dias, limite: 20000 }); } catch { ms = null; }
  if (!ms) return null;
  return ms.slice(-limite).map((m) => [fecha(m.t), EQUIPO[m.trabajador]?.nombre ?? m.trabajador, m.ref, m.precio, m.mi_precio, m.vendidos, m.stock, m.estado, m.puesto, m.lider, m.precio_lider].map((v) => (v == null ? '' : v)));
}

function csv(filas) {
  const esc = (v) => { const x = String(segura(v)); return /[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return filas.map((f) => f.map(esc).join(',')).join('\r\n') + '\r\n';
}
function escribirAtomico(archivo, contenido) {
  const tmp = archivo + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, contenido); fs.renameSync(tmp, archivo);
}

async function enviarScript(cfg, alertas, res) {
  const resultados = {};
  for (const id of IDS) {
    const r = res[id];
    const ancho = r.cabecera.length;
    resultados[r.hoja] = [r.cabecera, ...r.filas.map((f) => f.slice(0, ancho).map(segura))].map((f) => [...f, ...Array(Math.max(0, ancho - f.length)).fill('')]);
  }
  const hist = filasHistorial(60, 3000);
  if (hist) resultados['Historial'] = [CABECERA_HISTORIAL, ...hist.map((f) => f.map(segura))];
  const cuerpo = { clave: cfg.clave, origen: 'meli-sellers-mcp', generado: fecha(Date.now()), cabeceraAlertas: CABECERA_ALERTAS, alertas: alertas.map(filaAlerta), resultados };
  const r = await fetch(cfg.script, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error === 'clave' ? 'la planilla rechazó la clave (¿pegaste la CLAVE correcta en el script?)' : `la planilla respondió ${r.status}${j?.error ? ' (' + j.error + ')' : ''}`);
}

function escribirCarpeta(cfg, alertas, res) {
  fs.mkdirSync(cfg.carpeta, { recursive: true });
  const hist = path.join(cfg.carpeta, 'Alertas.csv');
  if (!fs.existsSync(hist)) fs.writeFileSync(hist, '\ufeff' + csv([CABECERA_ALERTAS]));
  if (alertas.length) fs.appendFileSync(hist, csv(alertas.map(filaAlerta)));
  for (const id of IDS) escribirAtomico(path.join(cfg.carpeta, `${res[id].hoja}.csv`), '\ufeff' + csv([res[id].cabecera, ...res[id].filas]));
  const historial = filasHistorial(90, 20000);
  if (historial) escribirAtomico(path.join(cfg.carpeta, 'Historial.csv'), '\ufeff' + csv([CABECERA_HISTORIAL, ...historial]));
  escribirAtomico(path.join(cfg.carpeta, 'Resumen del equipo.md'), `# Equipo de trabajadores — MercadoLibre\n_Actualizado: ${fecha(Date.now())}_\n\n` + resultadosEnMarkdown(res) + '\n');
}

export async function exportarADrive(alertas = []) {
  const d = leerEquipo(); const cfg = d.drive || {};
  if (!cfg.script && !cfg.carpeta) return null;
  const res = armarResultados(d);
  const hecho = { script: null, carpeta: null, errores: [] };
  if (cfg.script) { try { await enviarScript(cfg, alertas, res); hecho.script = true; } catch (e) { hecho.errores.push('Planilla: ' + e.message); } }
  if (cfg.carpeta) { try { escribirCarpeta(cfg, alertas, res); hecho.carpeta = true; } catch (e) { hecho.errores.push('Carpeta: ' + e.message); } }
  actualizarEquipo((f) => { f.drive = f.drive || {}; f.drive.ultimo = Date.now(); f.drive.ultimoError = hecho.errores.join(' · ') || null; });
  return hecho;
}
