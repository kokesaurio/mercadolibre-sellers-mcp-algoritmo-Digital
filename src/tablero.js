// src/tablero.js — el "parte diario": junta lo que saben los 18 trabajadores en un solo tablero
// visual (panel/tablero.html) que se abre en el navegador, sin servidor y sin internet.
// Lo que funciona, lo que necesita atención, los números, el equipo, lo que viene,
// la evolución de 30 días y la bitácora de alertas.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { EQUIPO, IDS, leerEquipo, tareasDe, claveTarea, alertasRecientes, resumenAlertas, quienCorre, jefe } from './trabajadores.js';
import { armarResultados } from './resultados.js';
import { estadoDecision } from './agenda.js';
import { COLOR } from './postventa.js';
import { listarCuentas, MeliClient } from './meli.js';
import { ordenesPagas, adsDelDia, diaLocal } from './negocio.js';

const DIR = () => process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
export const RUTA_TABLERO = () => path.join(DIR(), 'tablero.html');
const PLANTILLA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'panel', 'tablero.html');
const MARCA = '/*__DATOS_DEL_TABLERO__*/null';

const din = (n) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '−$\u00a0' : '$\u00a0') + Math.abs(v).toLocaleString('es-AR'); }; // $ y número nunca se separan
const cadaCuanto = (min) => (min >= 1440 && min % 1440 === 0 ? `cada ${min / 1440} día${min === 1440 ? '' : 's'}` : min >= 60 && min % 60 === 0 ? `cada ${min / 60} h` : `cada ${min} min`);

function fotos(d, id) {
  return tareasDe(d, id).map((t) => d.snapshots[id + '|' + claveTarea(t)]).filter(Boolean).map((s) => s.datos);
}

// Serie de un dato guardado en la base: un punto por día (el último del día)
async function serie(trabajador, clave, dias = 30) {
  try {
    const { leerMediciones } = await import('./db.js');
    const ms = leerMediciones({ trabajador, dias }) || [];
    const porDia = new Map();
    for (const m of ms) { const v = m.extra?.[clave]; if (typeof v === 'number') porDia.set(new Date(m.t).toISOString().slice(0, 10), v); }
    return [...porDia].map(([d, v]) => ({ d, v }));
  } catch { return []; }
}

export async function armarTablero() {
  const d = leerEquipo();
  const res = armarResultados(d);
  const ahora = Date.now();
  const funciona = [], atencion = [], numeros = [];
  const agrega = (lista, id, texto, extra = {}) => lista.push({ quien: id, nombre: EQUIPO[id].nombre, emoji: EQUIPO[id].emoji, texto, ...extra });

  // ── Carmen: el mes ──
  const conta = fotos(d, 'contabilidad')[0];
  if (conta?.mes) {
    const m = conta.mes, a = conta.comparado;
    numeros.push({ titulo: `Facturación de ${m.nombre.split(' ')[0]}`, valor: din(m.bruto), detalle: a?.bruto ? `${m.bruto >= a.bruto ? '↑' : '↓'} ${Math.abs((m.bruto - a.bruto) / a.bruto * 100).toFixed(0)}% contra el mismo período del mes pasado` : `${m.ordenes} ventas`, tono: a?.bruto && m.bruto < a.bruto ? 'ambar' : 'neutro' });
    numeros.push({ titulo: 'Te queda limpio', valor: din(m.neto), detalle: m.parcial ? 'parcial: faltan costos o impuestos' : `margen ${m.margen.toFixed(1)}%`, tono: m.neto < 0 ? 'rojo' : m.parcial ? 'ambar' : 'verde' });
    if (a?.bruto && m.bruto > a.bruto) agrega(funciona, 'contabilidad', `Facturás ${((m.bruto - a.bruto) / a.bruto * 100).toFixed(0)}% más que el mes pasado a esta altura`);
    if (m.neto < 0 && !m.parcial) agrega(atencion, 'contabilidad', `Este mes vas perdiendo plata (${din(m.neto)})`, { nivel: 'alta', skill: 'contabilidad-ml' });
  }
  // ── Ramiro: márgenes ──
  const items = fotos(d, 'rentabilidad').flatMap((x) => Object.entries(x.items || {}));
  const conMargen = items.filter(([, x]) => !x.sinCosto);
  if (conMargen.length) {
    const total = conMargen.reduce((s, [, x]) => s + (x.gananciaMes || 0), 0);
    numeros.push({ titulo: 'Ganancia de 30 días', valor: din(total), detalle: `${conMargen.length} producto(s) con costo cargado`, tono: total < 0 ? 'rojo' : 'neutro' });
    for (const [id, x] of [...conMargen].filter(([, x]) => x.semaforo === '🟢').sort((p, q) => q[1].margen - p[1].margen).slice(0, 2)) agrega(funciona, 'rentabilidad', `${x.titulo} deja ${x.margen}% de margen (${din(x.ganancia)} por unidad)`, { item: id });
    for (const [id, x] of conMargen.filter(([, x]) => x.semaforo === '🔴').slice(0, 3)) agrega(atencion, 'rentabilidad', `${x.titulo} te hace perder ${din(-x.ganancia)} por unidad`, { nivel: 'alta', skill: 'calculadora-ml', item: id });
  }
  const sinCosto = items.filter(([, x]) => x.sinCosto).length;
  if (sinCosto) agrega(atencion, 'rentabilidad', `${sinCosto} producto(s) vendidos sin costo cargado: los números no son exactos`, { nivel: 'baja', skill: 'cerebro-ml' });
  // ── Ana: publicidad ──
  const ads = fotos(d, 'anuncios').filter((x) => !x.sinAds);
  if (ads.length) {
    const gasto = ads.reduce((s, x) => s + (x.gasto || 0), 0), ventas = ads.reduce((s, x) => s + (x.ventas || 0), 0);
    numeros.push({ titulo: 'Publicidad, 7 días', valor: din(gasto), detalle: ventas ? `vendió ${din(ventas)}, ACOS ${(gasto / ventas * 100).toFixed(1)}%` : 'sin ventas por ads', tono: gasto && !ventas ? 'rojo' : 'neutro' });
    for (const x of ads) for (const k of Object.values(x.campanias || {})) {
      if (k.cost > 0 && k.units === 0) agrega(atencion, 'anuncios', `La campaña «${k.nombre}» gastó ${din(k.cost)} sin vender`, { nivel: 'alta', skill: 'publicidad-ml' });
      else if (k.units > 0 && k.acos != null && k.acos <= 15) agrega(funciona, 'anuncios', `La campaña «${k.nombre}» vende con ACOS ${k.acos}%`);
    }
    for (const x of ads) for (const [id, it] of Object.entries(x.items || {})) if (it.acos > it.acosMax) agrega(atencion, 'anuncios', `El anuncio de ${it.titulo} cuesta más de lo que aguanta su margen`, { nivel: 'alta', skill: 'publicidad-ml', item: id });
  }
  // ── Valen: reputación ──
  const rep = fotos(d, 'reputacion')[0];
  if (rep?.rep) {
    const r = rep.rep;
    numeros.push({ titulo: 'Reputación', valor: (COLOR[r.nivel] || r.nivel || 's/d').replace(/^\S+\s/, ''), detalle: r.lider ? `MercadoLíder ${r.lider}` : `reclamos ${r.reclamos ?? '—'}%`, tono: /green/.test(r.nivel || '') ? 'verde' : /yellow|orange/.test(r.nivel || '') ? 'ambar' : /red/.test(r.nivel || '') ? 'rojo' : 'neutro' });
    if (/5_green/.test(r.nivel || '')) agrega(funciona, 'reputacion', `Reputación verde${r.lider ? ` y MercadoLíder ${r.lider}` : ''}`);
    for (const [id, o] of Object.entries(rep.opiniones || {})) {
      if (o.promedio >= 4.7 && o.total >= 5) agrega(funciona, 'reputacion', `${o.titulo}: ${o.promedio} estrellas en ${o.total} opiniones`, { item: id });
      const malas = (o.recientes || []).filter((x) => x.rate <= 2 && ahora - x.t < 7 * 86400000).length;
      if (malas) agrega(atencion, 'reputacion', `${malas} opinión(es) negativa(s) esta semana en ${o.titulo}`, { nivel: 'media', skill: 'reputacion-ml', item: id });
    }
  }
  // ── Pendientes de la operación ──
  const preg = fotos(d, 'atencion').reduce((s, x) => s + Object.keys(x.preguntas || {}).length, 0);
  const msj = fotos(d, 'atencion').reduce((s, x) => s + (x.mensajes || []).reduce((a, m) => a + m.cantidad, 0), 0);
  const recl = fotos(d, 'reclamos').flatMap((x) => Object.entries(x.reclamos || {}));
  numeros.push({ titulo: 'Para responder', valor: String(preg + msj + recl.length), detalle: `${preg} pregunta(s), ${msj} mensaje(s), ${recl.length} reclamo(s)`, tono: recl.length ? 'rojo' : preg + msj ? 'ambar' : 'verde' });
  if (preg) agrega(atencion, 'atencion', `${preg} pregunta(s) esperando respuesta`, { nivel: preg >= 5 ? 'alta' : 'media', skill: 'responder-preguntas-ml' });
  if (msj) agrega(atencion, 'atencion', `${msj} mensaje(s) de compradores sin leer`, { nivel: 'media', skill: 'responder-preguntas-ml' });
  if (!preg && !msj && fotos(d, 'atencion').length) agrega(funciona, 'atencion', 'Preguntas y mensajes al día');
  for (const [rid, k] of recl) agrega(atencion, 'reclamos', `Reclamo #${rid} (${k.tipo})${k.vence ? `: vence ${Math.round((k.vence - ahora) / 3600000) <= 0 ? 'ya' : `en ${Math.round((k.vence - ahora) / 3600000)} h`}` : ''}`, { nivel: 'alta', skill: 'reclamos-ml' });
  // ── Leo ──
  for (const x of fotos(d, 'logistica')) {
    if (x.porDespachar) agrega(atencion, 'logistica', `${x.porDespachar} venta(s) para despachar`, { nivel: 'media', skill: 'logistica-ml' });
    if (x.demorados) agrega(atencion, 'logistica', `${x.demorados} envío(s) demorado(s)`, { nivel: 'alta', skill: 'logistica-ml' });
  }
  // ── Nico, Fede ──
  for (const [id, x] of fotos(d, 'stock').flatMap((f) => Object.entries(f.items || {}))) {
    if (x.stock === 0 && x.u30 > 0) agrega(atencion, 'stock', `${x.titulo} está sin stock y se vendía`, { nivel: 'alta', skill: 'stock-ml', item: id });
    else if (x.dias != null && x.dias <= 7) agrega(atencion, 'stock', `${x.titulo}: stock para ${x.dias} día(s)`, { nivel: x.dias <= 3 ? 'alta' : 'media', skill: 'stock-ml', item: id });
  }
  for (const t of tareasDe(d, 'proveedores')) { const s = d.snapshots['proveedores|' + claveTarea(t)]; if (s?.datos?.prov?.stock === false) agrega(atencion, 'proveedores', `Tu proveedor de ${s.datos.mio?.titulo || t.ref} no tiene stock`, { nivel: 'alta', skill: 'proveedores-ml', item: t.ref }); }
  // ── Gabi, Sole, Lucía, Martina, Sofía, Clara ──
  for (const [id, x] of fotos(d, 'catalogo').flatMap((f) => Object.entries(f.items || {}))) {
    if (x.estado === 'competing') agrega(atencion, 'catalogo', `Perdés el catálogo de ${x.titulo}${x.ganador ? `: se gana con ${din(x.ganador)}` : ''}`, { nivel: 'alta', skill: 'competencia-ml', item: id });
    if (x.estado === 'winning') agrega(funciona, 'catalogo', `Ganás el catálogo de ${x.titulo}`, { item: id });
  }
  for (const [id, x] of fotos(d, 'moderaciones').flatMap((f) => Object.entries(f.items || {}))) agrega(atencion, 'moderaciones', `${x.titulo}: moderada por MercadoLibre`, { nivel: x.estado === 'active' ? 'media' : 'alta', skill: 'moderaciones-ml', item: id });
  const aud = fotos(d, 'auditor')[0];
  if (aud) { if (aud.rojas) agrega(atencion, 'auditor', `${aud.rojas} publicación(es) en rojo en la última auditoría`, { nivel: 'media', skill: 'mejorar-publicaciones-ml' }); if (aud.verdes) agrega(funciona, 'auditor', `${aud.verdes} publicación(es) al día en la auditoría`); }
  for (const t of tareasDe(d, 'ranking')) { const s = d.snapshots['ranking|' + claveTarea(t)]; if (typeof s?.datos?.mio === 'number' && s.datos.mio <= 3) agrega(funciona, 'ranking', `Estás ${s.datos.mio}º en «${t.ref}»`); }
  const tend = fotos(d, 'tendencias')[0]?.keywords?.[0];
  if (tend) agrega(funciona, 'tendencias', `Lo más buscado ahora: «${tend}»`);
  const ag = d.agenda || {};
  const viene = [];
  for (const x of fotos(d, 'agenda')) {
    for (const p of Object.values(x.promos || {})) {
      const est = estadoDecision(ag, 'promo:' + p.id, p);
      viene.push({ t: p.inicio || p.cierre || ahora, nombre: p.nombre, tipo: 'Campaña de MercadoLibre', cierre: p.cierre || null, decision: est, ref: p.id });
      if (est === 'pendiente' && p.cierre && p.cierre - ahora < 3 * 86400000) agrega(atencion, 'agenda', `Decidí si entrás a «${p.nombre}»: la inscripción cierra pronto`, { nivel: 'alta', skill: 'agenda-comercial-ml' });
    }
    for (const fe of x.fechas || []) viene.push({ t: fe.inicio, nombre: fe.nombre, tipo: fe.estimada ? 'Fecha comercial (estimada)' : 'Fecha comercial', cierre: null, decision: estadoDecision(ag, 'fecha:' + fe.clave), ref: fe.clave });
  }
  const unicos = new Map(); for (const v of viene.sort((p, q) => p.t - q.t)) if (!unicos.has(v.ref)) unicos.set(v.ref, v);

  // ── El equipo ──
  const corre = quienCorre();
  const equipo = IDS.map((id) => {
    const w = d.trabajadores[id], r = res[id];
    return { id, emoji: EQUIPO[id].emoji, nombre: EQUIPO[id].nombre, puesto: EQUIPO[id].puesto, oficio: EQUIPO[id].oficio, activo: w.activo, cada: cadaCuanto(w.intervalo),
      ultimo: w.ultimo, error: w.ultimoError, sinLeer: resumenAlertas(id, d).sinLeer, destacado: r?.destacado || '', skills: EQUIPO[id].skills.map((s) => s.skill),
      tabla: { cabecera: r?.cabecera || [], filas: (r?.filas || []).slice(0, 60) } };
  });
  const orden = { alta: 0, media: 1, baja: 2 };
  // Con varias tiendas, lo mismo puede aparecer dos veces: queda una sola línea por texto
  const unicos2 = (lista) => { const vistos = new Set(); return lista.filter((x) => { const k = x.quien + '|' + x.texto; if (vistos.has(k)) return false; vistos.add(k); return true; }); };
  const fun = unicos2(funciona), ate = unicos2(atencion);
  ate.sort((p, q) => orden[p.nivel] - orden[q.nivel]);
  const cuentas = (() => { try { return listarCuentas().map((c) => c.nickname); } catch { return []; } })();

  // ── La frase del día ──
  const urg = ate.filter((x) => x.nivel === 'alta');
  const mes = conta?.mes;
  let frase = !mes ? 'Tu equipo está armando el primer parte del día.'
    : mes.parcial ? `En ${mes.nombre.split(' ')[0]} facturaste ${din(mes.bruto)}.`
    : mes.neto < 0 ? `En ${mes.nombre.split(' ')[0]} facturaste ${din(mes.bruto)}, pero vas perdiendo ${din(-mes.neto)}.`
    : `En ${mes.nombre.split(' ')[0]} facturaste ${din(mes.bruto)} y te quedan ${din(mes.neto)} limpios.`;
  const primera = urg.find((x) => x.quien !== 'contabilidad') || urg[0]; // la pérdida del mes ya está dicha
  frase += urg.length ? ` Hoy hay ${urg.length === 1 ? 'una cosa urgente' : `${urg.length} cosas urgentes`}: ${primera.texto.charAt(0).toLowerCase() + primera.texto.slice(1)}${urg.length > 1 ? ', entre otras' : ''}.` : ate.length ? ` Nada urgente: ${ate.length} cosa${ate.length === 1 ? '' : 's'} para mirar con calma.` : ' Nada pendiente: todo funciona.';

  // ── Día por día: ventas (Carmen) y publicidad (Ana), sumando todas las tiendas ──
  const ventasDia = new Map();
  for (const x of fotos(d, 'contabilidad')) for (const v of x.diario || []) {
    const a = ventasDia.get(v.d) || { d: v.d, bruto: 0, ordenes: 0, unidades: 0 };
    a.bruto += v.bruto; a.ordenes += v.ordenes; a.unidades += v.unidades; ventasDia.set(v.d, a);
  }
  const adsDia = new Map();
  for (const x of fotos(d, 'anuncios')) for (const v of Object.values(x.diario || {})) {
    const a = adsDia.get(v.d) || { d: v.d, cost: 0, ventas: 0, units: 0 };
    a.cost += v.cost; a.ventas += v.ventas; a.units += v.units; adsDia.set(v.d, a);
  }
  const ordenar = (m) => [...m.values()].sort((p, q) => p.d.localeCompare(q.d)).slice(-30);
  const hoyKey = (() => { const x = new Date(ahora); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; })();
  // Hoy, en vivo (2 consultas por tienda); si no hay conexión queda lo último que guardó el equipo
  let enVivo = false;
  try {
    const cs = listarCuentas();
    if (cs.length) {
      const inicio = new Date(ahora); inicio.setHours(0, 0, 0, 0);
      const v = { d: hoyKey, bruto: 0, ordenes: 0, unidades: 0 }, a = { d: hoyKey, cost: 0, ventas: 0, units: 0 };
      let hayAds = false;
      for (const cta of cs) {
        const c = new MeliClient({ userId: String(cta.user_id) });
        for (const o of await ordenesPagas(c, cta.user_id, inicio.getTime(), ahora, { maximo: 1000 })) {
          v.bruto += o.total_amount ?? 0; v.ordenes++; for (const it of o.order_items || []) v.unidades += it.quantity ?? 0;
        }
        const x = await adsDelDia(c, diaLocal(ahora)).catch(() => null);
        if (x) { hayAds = true; a.cost += x.cost; a.ventas += x.ventas; a.units += x.units; }
      }
      ventasDia.set(hoyKey, v); if (hayAds) adsDia.set(hoyKey, a);
      enVivo = true;
    }
  } catch {}
  const vHoy = ventasDia.get(hoyKey), aHoy = adsDia.get(hoyKey);
  const hoy = { dia: hoyKey, ventas: vHoy ? vHoy.bruto : null, ordenes: vHoy?.ordenes ?? null, unidades: vHoy?.unidades ?? null,
    ads: aHoy ? aHoy.cost : null, ventasAds: aHoy ? aHoy.ventas : null, acos: aHoy && aHoy.ventas ? Math.round((aHoy.cost / aHoy.ventas) * 1000) / 10 : null, enVivo };

  return {
    generado: ahora, tiendas: cuentas, jefe: (({ nombre, emoji, propio }) => ({ nombre, emoji, propio }))(jefe(d)), hoy, ventasDia: ordenar(ventasDia), adsDia: ordenar(adsDia), frase, funciona: fun.slice(0, 10), atencion: ate.slice(0, 14), numeros, equipo,
    viene: [...unicos.values()].slice(0, 8), corriendo: corre ? corre.modo : null,
    series: {
      facturacion: await serie('contabilidad', 'facturacionMes'), neto: await serie('contabilidad', 'netoMes'),
      ganancia: await serie('rentabilidad', 'ganancia30d'), publicidad: await serie('anuncios', 'gasto7d'),
      preguntas: await serie('atencion', 'preguntas'), sinStock: await serie('stock', 'sinStock'),
    },
    alertas: alertasRecientes({ dias: 7 }).slice(-250).reverse().map((a) => ({ t: a.t, quien: a.trabajador, nivel: a.nivel, texto: String(a.texto).replace(/\*\*/g, ''), skill: a.skill || null })),
  };
}

/** Escribe el tablero con los datos adentro (escapados: ningún texto de un rival puede romper la página). */
export async function generarTablero(destino = RUTA_TABLERO()) {
  const datos = await armarTablero();
  const plantilla = fs.readFileSync(PLANTILLA, 'utf8');
  if (!plantilla.includes(MARCA)) throw new Error('La plantilla del tablero no tiene la marca de datos.');
  const json = JSON.stringify(datos).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 });
  const tmp = destino + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, plantilla.replace(MARCA, json), { mode: 0o600 });
  fs.renameSync(tmp, destino);
  return { ruta: destino, datos };
}

/** Abre el tablero en el navegador predeterminado (sin pasar por una shell). */
export function abrirEnNavegador(ruta) {
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [ruta]] : process.platform === 'darwin' ? ['open', [ruta]] : ['xdg-open', [ruta]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); return true; } catch { return false; }
}
