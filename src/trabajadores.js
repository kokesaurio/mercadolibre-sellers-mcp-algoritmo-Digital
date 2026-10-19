// src/trabajadores.js — el equipo de 18 trabajadores que vigilan solos, 24/7.
//
// Cada trabajador tiene un oficio fijo, una frecuencia y una lista de tareas
// (lo que le asignás con ml_trabajadores). Si no le asignás nada, vigila
// automáticamente tus seguidos de ml_vigilar que sean de su tipo.
//
// Corren de dos formas (nunca las dos a la vez, gracias a un candado con latido):
//   1. Mientras Claude está abierto: el propio conector los despierta cada minuto.
//   2. 24/7 con la PC prendida: `npx -y github:... trabajadores` (o `trabajadores
//      instalar` para que arranquen solos al iniciar sesión).
// Lo que encuentran (alertas + cada medición) va a la base SQLite equipo.db (ver db.js),
// que se consulta con ml_trabajadores informe / resultados / historial / base.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MeliClient, listarCuentas } from './meli.js';
import { auditarItem, idsDeTienda } from './auditoria.js';
import { fechasComerciales, cronogramaML, estadoDecision, diasHasta, tipoLegible } from './agenda.js';
import { saberDe } from './cerebro.js';
import { stockDias, preguntasPendientes, mensajesSinLeer, reclamosAbiertos, reputacionDe, opinionesDe, estadoCatalogo, ESTADO_CATALOGO, moderadas, traducirSub, precioProveedor, COLOR } from './postventa.js';
import { rentabilidadDe, comisionML, adsDeItem, ordenesPagas, ventasPorItem, campanias, enviosRecientes, resumenContable, inicioDeMes, nombreMes, ventasDiarias, adsDelDia, diaLocal } from './negocio.js';
import { leerVigilancia, claveDe, tomarSnapshot, compararSnapshots } from './vigilancia.js';
import * as base from './db.js';

const DIR = () => process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const ARCHIVO = () => path.join(DIR(), 'trabajadores.json');
const CANDADO = () => path.join(DIR(), 'trabajadores.lock');

export const INTERVALO_MINIMO = 10;          // minutos: cuidar el límite de la API de ML
const MAX_BANDEJA = 300;
const LATIDO_VIGENTE = 3 * 60 * 1000;        // un corredor sin latido por 3 min se considera muerto

// ───────────────────────────── El equipo ─────────────────────────────
export const EQUIPO = {
  precios: {
    alias: 'vera', emoji: '🕵️', nombre: 'Vera', puesto: 'Centinela de precios', intervalo: 30, tipos: ['publicacion', 'vendedor'],
    oficio: 'Vigila los precios de publicaciones y vendedores rivales. Avisa cada suba/baja (con umbral opcional) y, si le pasás tu publicación (mi_item), te avisa apenas un rival queda más barato que vos.',
    skills: [
      { skill: 'vigilancia-ml', para: 'armar y mantener la lista de rivales y productos seguidos' },
    ],
  },
  ventas: {
    alias: 'tomas', emoji: '📦', nombre: 'Tomás', puesto: 'Contador de ventas', intervalo: 60, tipos: ['publicacion'],
    oficio: 'Cuenta las ventas estimadas de publicaciones rivales (unidades y ritmo por día), y avisa cuando un rival se queda sin stock, pausa o reactiva: esas son tus ventanas de oportunidad.',
    skills: [
      { skill: 'panel-ventas-ml', para: 'comparar el ritmo del rival con tus ventas de hoy y del mes' },
    ],
  },
  ranking: {
    alias: 'martina', emoji: '🏆', nombre: 'Martina', puesto: 'Vigía de búsquedas', intervalo: 60, tipos: ['busqueda'],
    oficio: 'Mira el top 50 de tus palabras clave: avisa cambios de líder y de precio líder, y si le pasás tu publicación (mi_item) te dice en qué puesto estás y cuándo subís, bajás o salís del top.',
    skills: [
      { skill: 'imagenes-ml', para: 'rehacer las fotos 2-10 cuando el problema es la presentación' },
    ],
  },
  rivales: {
    alias: 'bruno', emoji: '🎯', nombre: 'Bruno', puesto: 'Cazador de rivales nuevos', intervalo: 180, tipos: ['busqueda'],
    oficio: 'Detecta vendedores que aparecen por primera vez en tus búsquedas (con qué producto y a qué precio) para que los sumes a la vigilancia antes de que te saquen ventas.',
    skills: [
      { skill: 'revisar-publicaciones-aldi', para: 'revisar la publicación del rival y la tuya con Aldi para ver quién está mejor armada' },
    ],
  },
  auditor: {
    alias: 'lucia', emoji: '🩺', nombre: 'Lucía', puesto: 'Auditora de publicaciones', intervalo: 15 * 24 * 60, tipos: ['propias'],
    oficio: 'Cada 15 días audita TODAS tus publicaciones activas y te dice cuáles quedaron desactualizadas: preguntas repetidas que no están en la descripción, días sin tocar, precio congelado o fuera de mercado, sin stock, fotos de baja resolución o pocas, sin video, sin marca/modelo o garantía, catálogo perdido. Compara contra la auditoría anterior: qué empeoró y qué quedó al día.',
    skills: [
      { skill: 'mejorar-publicaciones-ml', para: 'aplicar los arreglos de la auditoría, las peores primero' },
      { skill: 'visualizador-publicaciones-ml', para: 'elegir en un tablero cuáles mejorar esta quincena' },
      { skill: 'copiar-publicaciones-ml', para: 'rehacer una publicación vieja como nueva sin perder lo que funciona' },
      { skill: 'faq-descripcion-ml', para: 'sumar a la descripción las preguntas que te repiten, con tus respuestas reales' },
    ],
  },
  agenda: {
    alias: 'clara', emoji: '🗓️', nombre: 'Clara', puesto: 'Agenda comercial', intervalo: 24 * 60, tipos: ['agenda'],
    oficio: 'Todos los días mira el cronograma de promociones de MercadoLibre y las fechas cruciales del año (Hot Sale, CyberMonday, Black Friday, Día de la Madre, Navidad…). Por cada campaña o fecha te pregunta SIEMPRE si querés participar y te recuerda antes de que cierre la inscripción, hasta que decidas. Nunca se inscribe sola. Cuando arranca un evento en el que participás, te arma la actualización de Mi página.',
    skills: [
      { skill: 'agenda-comercial-ml', para: 'decidir si participás en cada campaña o fecha y armar la participación validada por margen' },
      { skill: 'mi-pagina-ml', para: 'mantener Mi página al día: banner del evento y productos destacados' },
    ],
  },
  rentabilidad: {
    alias: 'ramiro', emoji: '💰', nombre: 'Ramiro', puesto: 'Analista de rentabilidad', intervalo: 24 * 60, tipos: ['tienda'],
    oficio: 'Todos los días calcula la ganancia neta real de cada producto que vendiste (precio − comisión real de ML − publicidad por unidad − impuestos − envío − costo) con los costos de tu cerebro. Avisa cuando un producto te hace perder plata, cuando el margen cae, y qué productos vendidos no tienen costo cargado (nunca inventa un costo).',
    skills: [
      { skill: 'calculadora-ml', para: 'el desglose peso por peso de un producto y el precio de equilibrio' },
      { skill: 'cerebro-ml', para: 'cargar costos e impuestos una sola vez para que todo el equipo los use' },
    ],
  },
  anuncios: {
    alias: 'ana', emoji: '📣', nombre: 'Ana', puesto: 'Gestora de anuncios', intervalo: 24 * 60, tipos: ['tienda'],
    oficio: 'Todos los días revisa tus campañas de Product Ads: gasto, ventas por ads y ACOS. Avisa cuando una campaña gasta sin vender, cuando el ACOS se dispara o cambia de estado, y —cruzando con Ramiro— cuando el ACOS de un producto supera lo que su margen aguanta.',
    skills: [
      { skill: 'publicidad-ml', para: 'ajustar campañas y promociones con la regla ACOS vs margen' },
    ],
  },
  logistica: {
    alias: 'leo', emoji: '🚚', nombre: 'Leo', puesto: 'Coordinador de logística', intervalo: 120, tipos: ['tienda'],
    oficio: 'Cada 2 horas mira los envíos de tus ventas de los últimos 7 días: qué tenés que despachar (y hasta cuándo), envíos demorados, no entregados o devueltos, y si sube tu tasa de despachos con demora — lo que más castiga la reputación.',
    skills: [
      { skill: 'logistica-ml', para: 'despachar a tiempo, resolver demoras y devoluciones, y cuidar la reputación' },
    ],
  },
  contabilidad: {
    alias: 'carmen', emoji: '🧾', nombre: 'Carmen', puesto: 'Contadora', intervalo: 24 * 60, tipos: ['tienda'],
    oficio: 'Todos los días ordena tus números del mes: facturación, comisiones de ML, publicidad, impuestos, costo de mercadería y resultado neto, comparado con el mes anterior. El día 1 te da el cierre del mes. Si faltan costos o impuestos cargados, te dice que el neto es parcial.',
    skills: [
      { skill: 'contabilidad-ml', para: 'el resultado del mes y el cierre mensual para vos o tu contador' },
      { skill: 'reporte-ventas-ml', para: 'el resumen de 4 líneas para mandar por WhatsApp' },
    ],
  },
  stock: {
    alias: 'nico', emoji: '📦', nombre: 'Nico', puesto: 'Encargado de stock', intervalo: 6 * 60, tipos: ['tienda'],
    oficio: 'Cada 6 horas cruza cuánto vendés por día con tu stock y te dice cuántos días te quedan de cada producto, antes del quiebre (sin stock perdés el posicionamiento ganado). También avisa lo que se quedó sin stock mientras vendía y lo que tiene stock parado.',
    skills: [{ skill: 'stock-ml', para: 'reponer a tiempo: qué pedir, cuánto y qué hacer mientras llega' }],
  },
  atencion: {
    alias: 'paula', emoji: '💬', nombre: 'Paula', puesto: 'Atención al comprador', intervalo: 30, tipos: ['tienda'],
    oficio: 'Cada 30 minutos mira las preguntas sin responder (con el tiempo que llevan: MercadoLibre premia responder rápido) y los mensajes de postventa sin leer. Avisa las nuevas y las que se están demorando.',
    skills: [{ skill: 'responder-preguntas-ml', para: 'responder todas juntas con tu OK, sin datos de contacto' }],
  },
  reclamos: {
    alias: 'ivan', emoji: '🛡️', nombre: 'Iván', puesto: 'Reclamos y mediaciones', intervalo: 60, tipos: ['tienda'],
    oficio: 'Cada hora revisa tus reclamos abiertos: los nuevos, el plazo que tenés para responder cada uno, los que pasan a mediación con MercadoLibre y los que se cierran. Un reclamo sin respuesta a tiempo es lo que más daña la reputación.',
    skills: [{ skill: 'reclamos-ml', para: 'responder bien y a tiempo, y cuidar la reputación' }],
  },
  reputacion: {
    alias: 'valen', emoji: '⭐', nombre: 'Valen', puesto: 'Reputación y opiniones', intervalo: 24 * 60, tipos: ['tienda'],
    oficio: 'Todos los días mira tu color de reputación, MercadoLíder y las métricas que la mueven (reclamos, demoras, cancelaciones), y las opiniones de tus productos más vendidos: avisa cada opinión negativa nueva y si baja el promedio.',
    skills: [{ skill: 'reputacion-ml', para: 'entender qué mueve tu color y qué hacer con cada opinión negativa' }],
  },
  catalogo: {
    alias: 'gabi', emoji: '🏷️', nombre: 'Gabi', puesto: 'Catálogo', intervalo: 6 * 60, tipos: ['tienda'],
    oficio: 'Cada 6 horas revisa tus publicaciones de catálogo: avisa en el momento en que perdés el primer lugar (buy box), con qué precio lo recuperás y si a ese precio todavía ganás plata (con tus costos del cerebro).',
    skills: [{ skill: 'competencia-ml', para: 'decidir si conviene recuperar el catálogo, validado por margen' }],
  },
  moderaciones: {
    alias: 'sole', emoji: '🚫', nombre: 'Sole', puesto: 'Moderaciones', intervalo: 6 * 60, tipos: ['tienda'],
    oficio: 'Cada 6 horas busca publicaciones que MercadoLibre pausó, puso en revisión o penalizó (infracciones, datos a corregir, portada de baja calidad), con el motivo y cómo corregirlo. Avisa también cuando se resuelven.',
    skills: [{ skill: 'moderaciones-ml', para: 'corregir cada moderación y reactivar la publicación' }],
  },
  proveedores: {
    alias: 'fede', emoji: '🔄', nombre: 'Fede', puesto: 'Proveedores', intervalo: 6 * 60, tipos: ['proveedor'],
    oficio: 'Cada 6 horas vigila el precio y el stock de tus proveedores (una publicación suya en MercadoLibre o la página del producto en su tienda) para cada producto que revendés: avisa cuando cambian el precio (y a cuánto tendrías que vender con tu recargo) o se quedan sin stock (para que pauses antes de vender lo que no tenés).',
    skills: [{ skill: 'proveedores-ml', para: 'ajustar precio y costo, o pausar, cuando el proveedor cambia' }],
  },
  tendencias: {
    alias: 'sofia', emoji: '📈', nombre: 'Sofía', puesto: 'Radar de tendencias', intervalo: 720, tipos: ['tendencias'],
    oficio: 'Sigue las búsquedas en tendencia del sitio o de tus categorías: qué keywords entran, salen o suben fuerte, para anticiparte a la demanda.',
    skills: [
      { skill: 'descubrir-ganadores-ml', para: 'validar si una keyword en tendencia es un producto que conviene vender' },
      { skill: 'video-publicaciones-ml', para: 'video para la publicación que sube con la tendencia' },
      { skill: 'clips-ml', para: 'subir Clips mientras la búsqueda está caliente' },
      { skill: 'ugc-ml', para: 'UGC con avatar para pauta del producto en tendencia' },
    ],
  },
};
export const IDS = Object.keys(EQUIPO);
// Trabajadores que trabajan sobre TU tienda (sin tareas: una por cada cuenta conectada) y avisan desde el primer control
export const DE_TIENDA = { auditor: 'propias', agenda: 'agenda', rentabilidad: 'tienda', anuncios: 'tienda', logistica: 'tienda', contabilidad: 'tienda', stock: 'tienda', atencion: 'tienda', reclamos: 'tienda', reputacion: 'tienda', catalogo: 'tienda', moderaciones: 'tienda' };
export const etiqueta = (id) => `${EQUIPO[id].emoji} ${EQUIPO[id].nombre} (${EQUIPO[id].puesto})`;

// Acepta el puesto (precios), el nombre (Vera / vera / Sofía) o "todos"
const sinAcentos = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function resolverTrabajador(x) {
  const k = sinAcentos(x);
  if (EQUIPO[k]) return k;
  return IDS.find((id) => EQUIPO[id].alias === k || sinAcentos(EQUIPO[id].nombre) === k || sinAcentos(EQUIPO[id].puesto) === k) || null;
}

// ───────────────────────────── Estado local ─────────────────────────────
function estadoVacio() {
  const trabajadores = {};
  for (const id of IDS) trabajadores[id] = { activo: true, intervalo: EQUIPO[id].intervalo, tareas: [], ultimo: null, ultimoError: null };
  return { trabajadores, snapshots: {}, vistos: {}, bandeja: [] };
}

export function leerEquipo() {
  let d;
  try { d = JSON.parse(fs.readFileSync(ARCHIVO(), 'utf8')); } catch { d = estadoVacio(); }
  const base = estadoVacio();
  d.trabajadores = d.trabajadores || {};
  for (const id of IDS) d.trabajadores[id] = { ...base.trabajadores[id], ...d.trabajadores[id] };
  d.snapshots = d.snapshots || {}; d.vistos = d.vistos || {}; d.bandeja = d.bandeja || [];
  return d;
}

function guardarEquipo(d) {
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  const tmp = ARCHIVO() + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ARCHIVO());
}

// Lee-modifica-escribe sincrónico: entre la lectura y la escritura no corre nada más
// del proceso, así la config que cambia una herramienta nunca se pisa con un ciclo.
export function actualizarEquipo(fn) {
  const d = leerEquipo();
  const r = fn(d);
  guardarEquipo(d);
  return r;
}

// ───────────────────────────── El jefe (nombre a elección del vendedor) ─────────────────────────────
export const JEFE_POR_DEFECTO = { nombre: 'El jefe', emoji: '🎩' };
const EMOJI_OK = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️)+$/u;

export function jefe(d = leerEquipo()) {
  const j = d.jefe || {};
  return { nombre: typeof j.nombre === 'string' && j.nombre ? j.nombre : JEFE_POR_DEFECTO.nombre,
    emoji: typeof j.emoji === 'string' && j.emoji ? j.emoji : JEFE_POR_DEFECTO.emoji, propio: !!j.nombre };
}

// Valida y guarda. nombre vacío o "sin nombre" vuelve al de fábrica. Devuelve { ok, jefe } o { error }.
export function nombrarJefe(nombre, emoji) {
  const n = String(nombre ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const reset = !n || /^(sin nombre|ninguno|por defecto|el jefe)$/i.test(n);
  if (!reset) {
    if (n.length > 30) return { error: 'El nombre puede tener hasta 30 letras.' };
    if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'\-]*$/u.test(n)) return { error: 'Usá solo letras, números, espacios, punto, apóstrofo o guion (ej: "Roberto", "Don Ramón", "Jefa Ana").' };
    const choca = resolverTrabajador(n);
    if (choca) return { error: `"${n}" ya es ${etiqueta(choca)}: elegí otro nombre para no confundirlos.` };
  }
  let e = emoji == null ? undefined : String(emoji).trim();
  if (e) { if (e.length > 16 || !EMOJI_OK.test(e)) return { error: 'El emoji tiene que ser un solo emoji (ej: 🎩, 👑, 🦁).' }; }
  return actualizarEquipo((d) => {
    const antes = d.jefe || {};
    d.jefe = reset ? (e ? { emoji: e } : {}) : { nombre: n, emoji: e || antes.emoji };
    if (!d.jefe.emoji) delete d.jefe.emoji;
    return { ok: true, jefe: jefe(d) };
  });
}

// ───────────────────────────── Tareas ─────────────────────────────
export function tipoPorDefecto(trabajador, ref) {
  if (DE_TIENDA[trabajador]) return DE_TIENDA[trabajador];
  if (trabajador === 'proveedores') return 'proveedor';
  if (trabajador === 'precios') return /^[A-Z]{3}\d+$/i.test(String(ref || '').trim()) ? 'publicacion' : 'vendedor';
  return EQUIPO[trabajador].tipos[0];
}
export const claveTarea = (t) => claveDe(t) + (t.cuenta ? '@' + t.cuenta : '');

export function asignarTarea(quien, { tipo, ref, mi_item, umbral, nota, cuenta, sitio, fuente, recargo }) {
  const trabajador = resolverTrabajador(quien);
  if (!trabajador) throw new Error(`No existe "${quien}" en el equipo: ${IDS.map(etiqueta).join(', ')}.`);
  tipo = tipo || tipoPorDefecto(trabajador, ref);
  if (!EQUIPO[trabajador].tipos.includes(tipo)) throw new Error(`${EQUIPO[trabajador].nombre} (${EQUIPO[trabajador].puesto}) no trabaja con "${tipo}": acepta ${EQUIPO[trabajador].tipos.join(' o ')}.`);
  const limpio = String(ref ?? '').trim();
  if (!limpio && !['tendencias', 'propias', 'agenda', 'tienda'].includes(tipo)) throw new Error('Falta ref: el item_id, vendedor o palabra clave a vigilar.');
  if (limpio.length > 120) throw new Error('ref demasiado largo (máx. 120 caracteres).');
  if (mi_item && !/^[A-Z]{3}\d+$/i.test(String(mi_item).trim())) throw new Error('mi_item tiene que ser un item_id de MercadoLibre (ej: MLA123456789).');
  if (tipo === 'proveedor') {
    if (!/^[A-Z]{3}\d+$/i.test(limpio)) throw new Error('Para Fede, ref es TU publicación (ej: MLA123456789).');
    const f = String(fuente ?? '').trim();
    if (!/^[A-Z]{3}\d+$/i.test(f) && !/^https?:\/\/[^\s]{4,500}$/i.test(f)) throw new Error('Falta fuente: la publicación del proveedor en MercadoLibre (MLA…) o la URL https del producto en su tienda.');
    if (recargo != null && !(Number(recargo) >= 0 && Number(recargo) <= 1000)) throw new Error('recargo es el % que le sumás al costo del proveedor (0 a 1000).');
  }
  const tarea = {
    tipo, ref: (tipo === 'proveedor' ? limpio.toUpperCase() : limpio) || (['propias', 'agenda', 'tienda'].includes(tipo) ? (cuenta ? 'tienda ' + cuenta : 'mi tienda') : sitio || 'MLA'), sitio, nota,
    ...(mi_item ? { mi_item: String(mi_item).trim().toUpperCase() } : {}),
    ...(umbral != null ? { umbral: Math.max(0, Number(umbral) || 0) } : {}),
    ...(cuenta ? { cuenta: String(cuenta) } : {}),
    ...(tipo === 'proveedor' ? { fuente: /^[A-Z]{3}\d+$/i.test(String(fuente).trim()) ? String(fuente).trim().toUpperCase() : String(fuente).trim(), ...(recargo != null ? { recargo: Number(recargo) } : {}) } : {}),
    agregada: new Date().toISOString().slice(0, 10),
  };
  return actualizarEquipo((d) => {
    const lista = d.trabajadores[trabajador].tareas;
    const i = lista.findIndex((t) => claveTarea(t) === claveTarea(tarea));
    if (i > -1) { lista[i] = { ...lista[i], ...tarea }; return { trabajador, tarea, actualizada: true }; }
    lista.push(tarea);
    return { trabajador, tarea, actualizada: false };
  });
}

export function quitarTarea(quien, ref) {
  const trabajador = resolverTrabajador(quien);
  return actualizarEquipo((d) => {
    const w = d.trabajadores[trabajador];
    if (!w) return 0;
    const antes = w.tareas.length;
    const sale = w.tareas.filter((t) => t.ref === String(ref).trim() || claveTarea(t) === String(ref).trim());
    w.tareas = w.tareas.filter((t) => !sale.includes(t));
    for (const t of sale) delete d.snapshots[trabajador + '|' + claveTarea(t)];
    return antes - w.tareas.length;
  });
}

// Tareas efectivas = las asignadas + tus seguidos de ml_vigilar del tipo que maneja
export function tareasDe(d, trabajador) {
  const propias = d.trabajadores[trabajador].tareas;
  if (DE_TIENDA[trabajador]) {
    if (propias.length) return propias;
    // Sin tareas propias: trabaja sobre cada tienda conectada
    let cs = []; try { cs = listarCuentas(); } catch {}
    return cs.map((c) => ({ tipo: DE_TIENDA[trabajador], ref: 'tienda ' + c.nickname, cuenta: String(c.user_id), deLista: true }));
  }
  const claves = new Set(propias.map(claveTarea));
  const deLista = (leerVigilancia().objetivos || [])
    .filter((o) => EQUIPO[trabajador].tipos.includes(o.tipo) && !claves.has(claveDe(o)))
    .map((o) => ({ ...o, deLista: true }));
  return [...propias, ...deLista];
}

// ───────────────────────────── Agenda: decisiones y fechas del vendedor ─────────────────────────────
export function decidir(clave, participar, nota) {
  const k = String(clave).trim();
  if (!/^(promo:[\w-]{2,60}|fecha:[a-z_]{2,40}:\d{4}|fecha:propia:[\w-]{1,40})$/.test(k)) throw new Error(`No reconozco "${clave}". Usá el id que aparece en la agenda (ej: promo:P-HOT o fecha:cybermonday:2026).`);
  return actualizarEquipo((d) => {
    d.agenda = d.agenda || {}; d.agenda.decisiones = d.agenda.decisiones || {};
    d.agenda.decisiones[k] = { participar: !!participar, t: Date.now(), ...(nota ? { nota: String(nota).slice(0, 200) } : {}) };
    return d.agenda.decisiones[k];
  });
}
export function confirmarFecha(clave, fecha) {
  if (!/^[a-z_]{2,40}:\d{4}$/.test(clave)) throw new Error('Clave de fecha inválida (ej: cybermonday:2026).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw new Error('Fecha inválida: usá AAAA-MM-DD.');
  return actualizarEquipo((d) => { d.agenda = d.agenda || {}; d.agenda.confirmadas = { ...(d.agenda.confirmadas || {}), [clave]: fecha }; return true; });
}
export function agregarFechaPropia({ nombre, fecha, consejo }) {
  if (!nombre || String(nombre).length > 60) throw new Error('Poné un nombre corto para la fecha (máx. 60).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) throw new Error('Fecha inválida: usá AAAA-MM-DD.');
  const id = String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'fecha';
  return actualizarEquipo((d) => {
    d.agenda = d.agenda || {}; d.agenda.propias = (d.agenda.propias || []).filter((p) => p.id !== id);
    d.agenda.propias.push({ id, nombre: String(nombre), fecha, ...(consejo ? { consejo: String(consejo).slice(0, 140) } : {}) });
    return id;
  });
}

// ───────────────────────────── Oficios ─────────────────────────────
const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const pct = (n, v) => (v ? ((n - v) / v) * 100 : 0);
const flecha = (n, v) => `${n > v ? '↑' : '↓'} ${Math.abs(pct(n, v)).toFixed(1)}%`;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function precioMio(c, item) { return (await c.get(`/items/${item}`)).price; }

async function buscarTop(c, sitio, q, n = 50) {
  const r = await c.get(`/sites/${sitio}/search`, { q, limit: n });
  return (r.results || []).map((x, i) => ({ pos: i + 1, id: x.id, precio: x.price, titulo: x.title, vendedor: x.seller?.nickname ?? String(x.seller?.id ?? '?') }));
}

// Cada oficio: foto(c, tarea, sitio) → datos ; cambios(tarea, viejo, nuevo) → [{texto, nivel}]
const OFICIOS = {
  precios: {
    async foto(c, t, sitio) {
      const datos = await tomarSnapshot(c, t, sitio);
      if (t.mi_item) { try { datos.mio = await precioMio(c, t.mi_item); } catch {} }
      return datos;
    },
    cambios(t, v, n) {
      const umbral = t.umbral ?? 0, out = [];
      const pasa = (nv, vv) => vv && nv !== vv && Math.abs(pct(nv, vv)) >= umbral;
      if (t.tipo === 'publicacion') {
        if (pasa(n.precio, v.precio)) out.push({ nivel: n.precio < v.precio ? 'alta' : 'media', texto: `${n.titulo || t.ref}: ${dinero(v.precio)} → ${dinero(n.precio)} (${flecha(n.precio, v.precio)})` });
        if (v.estado !== n.estado) out.push({ nivel: 'media', texto: `${n.titulo || t.ref}: estado ${v.estado} → ${n.estado}` });
        if (n.mio != null && n.precio < n.mio && !(v.mio != null && v.precio < v.mio)) out.push({ nivel: 'alta', skill: 'calculadora-ml', texto: `⚠️ ${t.ref} quedó MÁS BARATO que tu ${t.mi_item}: ${dinero(n.precio)} vs tu ${dinero(n.mio)} (diferencia ${dinero(n.mio - n.precio)})` });
        if (n.mio != null && n.precio >= n.mio && v.mio != null && v.precio < v.mio) out.push({ nivel: 'baja', texto: `✅ Volviste a ser más barato que ${t.ref} (${dinero(n.mio)} vs ${dinero(n.precio)})` });
      } else {
        for (const id of Object.keys(n.items || {})) {
          const a = v.items?.[id], b = n.items[id];
          if (a && pasa(b.precio, a.precio)) out.push({ nivel: b.precio < a.precio ? 'alta' : 'media', texto: `${t.ref} · ${b.titulo}: ${dinero(a.precio)} → ${dinero(b.precio)} (${flecha(b.precio, a.precio)})` });
        }
        const nuevos = Object.keys(n.items || {}).filter((id) => !v.items?.[id]);
        if (nuevos.length) out.push({ nivel: 'media', texto: `${t.ref} publicó ${nuevos.length} nueva(s): ` + nuevos.slice(0, 3).map((id) => `${n.items[id].titulo} (${dinero(n.items[id].precio)})`).join(' · ') });
        if (n.mio != null) {
          const masBaratos = Object.values(n.items || {}).filter((x) => x.precio < n.mio).length;
          const antes = v.mio != null ? Object.values(v.items || {}).filter((x) => x.precio < v.mio).length : 0;
          if (masBaratos > antes) out.push({ nivel: 'alta', skill: 'calculadora-ml', texto: `⚠️ ${t.ref} ahora tiene ${masBaratos} publicación(es) más baratas que tu ${t.mi_item} (${dinero(n.mio)})` });
        }
      }
      return out;
    },
  },
  ventas: {
    async foto(c, t) {
      const b = await c.get(`/items/${t.ref}`);
      return { vendidos: b.sold_quantity ?? 0, stock: b.available_quantity ?? null, estado: b.status, titulo: b.title, precio: b.price };
    },
    cambios(t, v, n, horas) {
      const out = [], nombre = n.titulo || t.ref;
      const delta = (n.vendidos ?? 0) - (v.vendidos ?? 0);
      if (delta > 0) {
        const porDia = horas >= 1 ? (delta / horas) * 24 : null;
        out.push({ nivel: delta >= (t.umbral || 1) ? 'media' : 'baja', texto: `${nombre} vendió ~${delta} u. en ${horas < 48 ? Math.round(horas) + ' h' : Math.round(horas / 24) + ' días'}${porDia ? ` (ritmo ≈ ${porDia.toFixed(1)}/día, ≈ ${dinero(porDia * 30 * (n.precio || 0))}/mes)` : ''}` });
      }
      if (v.stock > 0 && n.stock === 0) out.push({ nivel: 'alta', skill: 'publicidad-ml', texto: `🟢 OPORTUNIDAD: ${nombre} se quedó SIN STOCK — es el momento de empujar tu publicación` });
      if (v.stock === 0 && n.stock > 0) out.push({ nivel: 'media', texto: `${nombre} repuso stock (${n.stock} u.)` });
      if (v.estado !== n.estado) out.push({ nivel: n.estado === 'active' ? 'media' : 'alta', texto: n.estado === 'active' ? `${nombre} se reactivó` : `🟢 OPORTUNIDAD: ${nombre} pasó a ${n.estado} (dejó de vender)` });
      return out;
    },
  },
  ranking: {
    async foto(c, t, sitio) {
      const top = await buscarTop(c, sitio, t.ref);
      const mio = t.mi_item ? (top.find((x) => x.id === t.mi_item)?.pos ?? null) : undefined;
      return { top: top.map(({ id, precio, vendedor }) => ({ id, precio, vendedor })), mio };
    },
    cambios(t, v, n) {
      const out = [], [lv, ln] = [v.top?.[0], n.top?.[0]];
      if (lv && ln && lv.id !== ln.id) out.push({ nivel: 'alta', skill: 'visualizador-publicaciones-ml', texto: `"${t.ref}": nuevo líder ${ln.vendedor} a ${dinero(ln.precio)} (antes ${lv.vendedor} a ${dinero(lv.precio)})` });
      else if (lv && ln && lv.precio !== ln.precio) out.push({ nivel: 'media', texto: `"${t.ref}": el líder ${ln.vendedor} movió el precio ${dinero(lv.precio)} → ${dinero(ln.precio)} (${flecha(ln.precio, lv.precio)})` });
      if (t.mi_item && n.mio !== undefined) {
        const [a, b] = [v.mio ?? null, n.mio ?? null];
        if (a == null && b != null) out.push({ nivel: 'baja', texto: `✅ Tu ${t.mi_item} entró al top de "${t.ref}" en el puesto ${b}` });
        else if (a != null && b == null) out.push({ nivel: 'alta', skill: 'mejorar-publicaciones-ml', texto: `⚠️ Tu ${t.mi_item} SALIÓ del top 50 de "${t.ref}" (estaba ${a}º)` });
        else if (a != null && b != null && Math.abs(a - b) >= Math.max(1, t.umbral ?? 3)) out.push({ nivel: b > a ? 'alta' : 'baja', ...(b > a ? { skill: 'mejorar-publicaciones-ml' } : {}), texto: `${b < a ? '✅ Subiste' : '⚠️ Bajaste'} en "${t.ref}": puesto ${a} → ${b}` });
      }
      return out;
    },
  },
  rivales: {
    async foto(c, t, sitio) {
      const top = await buscarTop(c, sitio, t.ref);
      const vendedores = {};
      for (const x of top) if (!vendedores[x.vendedor]) vendedores[x.vendedor] = { pos: x.pos, precio: x.precio, titulo: x.titulo };
      return { vendedores };
    },
    cambios() { return []; }, // el cazador trabaja con su memoria de "vistos" (ver correrTarea)
  },
  auditor: {
    async foto(c, t, sitio) {
      const me = await c.get('/users/me');
      const ids = await idsDeTienda(c, me.id, { maximo: Number(process.env.ML_AUDITOR_MAX || 300) });
      const items = {}, lista = [];
      for (const id of ids) {
        let desde = null; try { desde = base.precioSinCambiosDesde(id); } catch {}
        try {
          const a = await auditarItem(c, id, { sitio, sellerId: me.id, precioSinCambiosDesde: desde });
          const fila = { titulo: a.titulo, semaforo: a.semaforo, codigos: a.problemas.map((p) => p.codigo), textos: a.problemas.map((p) => p.texto), precio: a.precio, diasSinTocar: a.diasSinTocar };
          items[id] = fila; lista.push({ id, ...fila });
        } catch {}
        await pausa(Number(process.env.ML_TRABAJADORES_PAUSA_MS ?? 400) / 4);
      }
      try { base.guardarAuditoria(Date.now(), t.cuenta, lista); } catch {}
      const cuenta = (e) => lista.filter((x) => x.semaforo === e).length;
      return { items, total: lista.length, rojas: cuenta('🔴'), amarillas: cuenta('🟡'), verdes: cuenta('🟢'), sinActualizar: lista.filter((x) => x.codigos.includes('sin_actualizar')).length, conFaq: lista.filter((x) => x.codigos.includes('faq_faltante')).length };
    },
    cambios(t, v, n) {
      const out = [], rango = { '🟢': 0, '🟡': 1, '🔴': 2 };
      // la skill sale del problema principal (los códigos ya vienen ordenados por gravedad)
      const skillDe = ([k]) => ['fotos_baja_resolucion', 'pocas_fotos'].includes(k) ? 'imagenes-ml'
        : k === 'sin_video' ? 'video-publicaciones-ml'
        : k?.startsWith('precio_') ? 'calculadora-ml'
        : k === 'pierde_catalogo' ? 'competencia-ml'
        : k === 'faq_faltante' ? 'faq-descripcion-ml' : 'mejorar-publicaciones-ml';
      let mejoraron = 0, empeoraron = 0;
      const urgentes = [], alDia = [], desactualizadas = [];
      for (const [id, x] of Object.entries(n.items)) {
        const a = v?.items?.[id];
        if (a && rango[x.semaforo] < rango[a.semaforo]) { mejoraron++; if (x.semaforo === '🟢') alDia.push(`${id} «${x.titulo}»`); }
        if (a && rango[x.semaforo] > rango[a.semaforo]) empeoraron++;
        if (x.semaforo === '🔴' && (!a || a.semaforo !== '🔴')) urgentes.push([id, x]);
        if (x.codigos.includes('sin_actualizar') && !(a?.codigos || []).includes('sin_actualizar')) desactualizadas.push(id);
      }
      out.push({ nivel: n.rojas ? 'alta' : 'baja', skill: 'mejorar-publicaciones-ml',
        texto: `🩺 Auditoría quincenal de ${t.ref}: ${n.total} publicaciones — ${n.rojas} 🔴 · ${n.amarillas} 🟡 · ${n.verdes} 🟢${n.sinActualizar ? ` · ${n.sinActualizar} sin actualizar hace 60+ días` : ''}${n.conFaq ? ` · ${n.conFaq} con preguntas repetidas que faltan en la descripción` : ''}${v ? ` · desde la anterior: ${mejoraron} mejoraron, ${empeoraron} empeoraron` : ' (primera auditoría: queda como base para comparar en 15 días)'}` });
      for (const [id, x] of urgentes.sort((a, b) => b[1].codigos.length - a[1].codigos.length).slice(0, 8)) {
        out.push({ nivel: 'alta', skill: skillDe(x.codigos), texto: `${id} «${x.titulo}»${v?.items?.[id] ? ' pasó a urgente' : ' está en rojo'}: ${x.textos[0]}${x.textos.length > 1 ? ` (+${x.textos.length - 1} problema(s) más)` : ''}` });
      }
      if (v && desactualizadas.length) out.push({ nivel: 'media', skill: 'mejorar-publicaciones-ml', texto: `${desactualizadas.length} publicación(es) quedaron desactualizadas (60+ días sin tocar): ${desactualizadas.slice(0, 6).join(', ')}${desactualizadas.length > 6 ? '…' : ''}` });
      const conFaq = Object.entries(n.items).filter(([id, x]) => x.codigos.includes('faq_faltante') && !(v?.items?.[id]?.codigos || []).includes('faq_faltante'));
      if (conFaq.length) out.push({ nivel: 'media', skill: 'faq-descripcion-ml', texto: `❓ ${conFaq.length} publicación(es) reciben preguntas repetidas que no están en su descripción: ${conFaq.slice(0, 6).map(([id]) => id).join(', ')}${conFaq.length > 6 ? '…' : ''} — te armo las preguntas frecuentes con tus respuestas (ml_faq_descripcion)` });
      if (alDia.length) out.push({ nivel: 'baja', texto: `✅ Quedaron al día: ${alDia.slice(0, 5).join(' · ')}${alDia.length > 5 ? '…' : ''}` });
      return out;
    },
  },
  agenda: {
    async foto(c, t, sitio) {
      const me = await c.get('/users/me');
      const ag = leerEquipo().agenda || {};
      let promos = {};
      try { promos = await cronogramaML(c, me.id); } catch (e) { if (e.status === 401) throw e; }
      const fechas = fechasComerciales(sitio, { dias: 45, confirmadas: ag.confirmadas || {}, propias: ag.propias || [] })
        .map((f) => ({ ...f, inicio: f.inicio.getTime(), fin: f.fin.getTime() }));
      const pendientes = Object.values(promos).filter((p) => estadoDecision(ag, 'promo:' + p.id, p) === 'pendiente').length
        + fechas.filter((f) => estadoDecision(ag, 'fecha:' + f.clave) === 'pendiente').length;
      return { promos, fechas, sitio, pendientes, avisos: {} };
    },
    cambios(t, v, n) {
      const ag = leerEquipo().agenda || {};
      const ahora = Date.now(), out = [];
      const avisos = { ...(v?.avisos || {}) };
      const unaVez = (k) => (avisos[k] ? false : (avisos[k] = ahora, true));
      const f = (ts) => new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const cuando = (d) => (d <= 0 ? 'HOY' : d === 1 ? 'mañana' : `en ${d} días`);
      const pregunta = (ref) => `¿Querés participar? Decime sí o no (ml_agenda accion=decidir ref=${ref})`;
      // ── el cronograma de MercadoLibre ──
      for (const p of Object.values(n.promos || {})) {
        const clave = 'promo:' + p.id, est = estadoDecision(ag, clave, p);
        if (est === 'no') continue;
        const dc = p.cierre ? diasHasta(p.cierre, ahora) : null;
        const fechasP = `${p.inicio ? ' del ' + f(p.inicio) : ''}${p.fin ? ' al ' + f(p.fin) : ''}`;
        const extra = `${p.cierre ? ` · inscripción hasta el ${f(p.cierre)} (${cuando(dc)})` : ''}${p.candidatas != null ? ` · ${p.candidatas} publicación(es) tuyas pueden entrar` : ''}`;
        if (est === 'pendiente') {
          if (unaVez(clave + ':nueva')) out.push({ nivel: dc != null && dc <= 3 ? 'alta' : 'media', skill: 'agenda-comercial-ml', texto: `🗓️ MercadoLibre te invitó a «${p.nombre}» (${tipoLegible(p.tipo)})${fechasP}${extra}. ${pregunta(p.id)} — si es sí, te armo cuáles conviene validadas por margen.` });
          else if (dc != null && dc >= 0 && dc <= 3 && unaVez(clave + ':cierre' + (dc <= 1 ? 1 : 3))) out.push({ nivel: 'alta', skill: 'agenda-comercial-ml', texto: `⏰ Cierra la inscripción a «${p.nombre}» ${cuando(dc)} y todavía no decidiste. ${pregunta(p.id)}` });
        } else {
          if (!p.participando && dc != null && dc >= 0 && dc <= 2 && unaVez(clave + ':sinitems')) out.push({ nivel: 'alta', skill: 'agenda-comercial-ml', texto: `Dijiste que sí a «${p.nombre}» pero todavía no inscribiste publicaciones y cierra ${cuando(dc)}. ¿Te armo la lista validada por margen?` });
          if (p.participando && p.inicio && p.inicio <= ahora && (!p.fin || p.fin >= ahora) && unaVez(clave + ':arranco')) out.push({ nivel: 'media', skill: 'mi-pagina-ml', texto: `🚀 Arrancó «${p.nombre}» con ${p.participando} publicación(es) tuyas${p.descuentoMax ? ` (hasta ${p.descuentoMax}% OFF)` : ''}: actualizá Mi página — banner del evento y esas publicaciones destacadas.` });
          if (p.fin && p.fin < ahora && avisos[clave + ':arranco'] && unaVez(clave + ':termino')) out.push({ nivel: 'baja', skill: 'mi-pagina-ml', texto: `🏁 Terminó «${p.nombre}»: sacá el banner de Mi página y volvé a tus destacados de siempre.` });
        }
      }
      for (const [id] of Object.entries(v?.promos || {})) {
        const k = 'promo:' + id;
        if (!n.promos?.[id] && avisos[k + ':arranco'] && unaVez(k + ':termino')) out.push({ nivel: 'baja', skill: 'mi-pagina-ml', texto: `🏁 Terminó «${v.promos[id].nombre}»: sacá el banner de Mi página y volvé a tus destacados de siempre.` });
      }
      // ── las fechas cruciales ──
      for (const fe of n.fechas || []) {
        const clave = 'fecha:' + fe.clave, est = estadoDecision(ag, clave);
        if (est === 'no') continue;
        const d = diasHasta(fe.inicio, ahora);
        const umbral = d <= 0 ? 0 : d <= 1 ? 1 : d <= 7 ? 7 : d <= 14 ? 14 : d <= 30 ? 30 : null;
        if (umbral == null || !unaVez(`${clave}:${umbral}`)) continue;
        const cuandoF = d <= 0 ? `hoy es ${fe.nombre}${fe.fin > fe.inicio ? ` (sigue hasta el ${f(fe.fin)})` : ''}` : `faltan ${d} días para ${fe.nombre} (${f(fe.inicio)}${fe.estimada ? ', fecha estimada: confirmala' : ''})`;
        if (est === 'pendiente') out.push({ nivel: umbral <= 7 ? 'alta' : 'media', skill: 'agenda-comercial-ml', texto: `📅 ${cuandoF.charAt(0).toUpperCase() + cuandoF.slice(1)} — ${fe.consejo}. ${pregunta(fe.clave)} — con promo propia, stock y Mi página.` });
        else if (umbral <= 1) out.push({ nivel: 'alta', skill: 'mi-pagina-ml', texto: `📅 ${cuandoF.charAt(0).toUpperCase() + cuandoF.slice(1)} y participás: ¿Mi página ya tiene el banner y tus productos del evento destacados?` });
        else out.push({ nivel: 'media', skill: 'agenda-comercial-ml', texto: `📅 ${cuandoF.charAt(0).toUpperCase() + cuandoF.slice(1)} y participás: revisá stock de lo que vas a empujar, precio validado por margen y publicidad.` });
      }
      n.avisos = avisos;
      return out;
    },
  },
  rentabilidad: {
    async foto(c, t, sitio) {
      const me = await c.get('/users/me');
      const vendidos = ventasPorItem(await ordenesPagas(c, me.id, Date.now() - 30 * 86400000)).filter((x) => x.id).slice(0, Number(process.env.ML_RENTABILIDAD_MAX || 40));
      const negocio = saberDe('__negocio__');
      const items = {}, cache = new Map();
      for (const x of vendidos) {
        let b; try { b = await c.get(`/items/${x.id}`); } catch { continue; }
        const sabido = saberDe(x.id);
        const base = { titulo: b.title || x.titulo, precio: b.price, u: x.u };
        if (sabido.costo == null) { items[x.id] = { ...base, sinCosto: true }; continue; }
        const fee = await comisionML(c, sitio, b.price, b.listing_type_id || 'gold_special', cache);
        let adsU = 0; try { const a = await adsDeItem(c, x.id, 30); if (a) adsU = a.units > 0 ? a.cost / a.units : a.cost / Math.max(x.u, 1); } catch {}
        const r = rentabilidadDe({ precio: b.price, pct: fee.pct, fijo: fee.fijo, costo: sabido.costo, impuestos_pct: sabido.impuestos_pct ?? 0, envio: sabido.costo_envio ?? 0, adsPorUnidad: adsU });
        items[x.id] = { ...base, margen: Math.round(r.margen * 10) / 10, ganancia: Math.round(r.ganancia), semaforo: r.semaforo, acosMax: Math.round(r.acosMax * 10) / 10, adsU: Math.round(adsU), gananciaMes: Math.round(r.ganancia * x.u) };
      }
      const conCosto = Object.values(items).filter((x) => !x.sinCosto);
      return { items, sinCosto: Object.values(items).filter((x) => x.sinCosto).length, faltaImpuestos: negocio.impuestos_pct == null, gananciaTotal: conCosto.reduce((s, x) => s + x.gananciaMes, 0), avisos: {} };
    },
    cambios(t, v, n) {
      const out = [], avisos = { ...(v?.avisos || {}) };
      const semana = Math.floor(Date.now() / (7 * 86400000));
      const unaVez = (k) => (avisos[k] ? false : (avisos[k] = Date.now(), true));
      const din = (x) => '$ ' + Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      for (const [id, x] of Object.entries(n.items)) {
        if (x.sinCosto) continue;
        const a = v?.items?.[id];
        if (x.semaforo === '🔴' && a?.semaforo !== '🔴') out.push({ nivel: 'alta', skill: 'calculadora-ml', texto: `💸 ${id} «${x.titulo}» te hace PERDER ${din(-x.ganancia)} por unidad (margen ${x.margen}%) y vendiste ${x.u} en 30 días${x.adsU ? ` — la publicidad se lleva ${din(x.adsU)} por unidad` : ''}` });
        else if (a && !a.sinCosto && a.margen - x.margen >= 5) out.push({ nivel: 'media', skill: 'calculadora-ml', texto: `📉 El margen de ${id} «${x.titulo}» bajó de ${a.margen}% a ${x.margen}% (${a.precio !== x.precio ? `precio ${din(a.precio)} → ${din(x.precio)}` : 'por comisión o publicidad'})` });
      }
      if (n.sinCosto && unaVez('sincosto:' + semana + ':' + n.sinCosto)) {
        const ej = Object.entries(n.items).filter(([, x]) => x.sinCosto).slice(0, 4).map(([id, x]) => `${id} «${x.titulo}»`).join(', ');
        out.push({ nivel: 'media', skill: 'cerebro-ml', texto: `🧠 ${n.sinCosto} producto(s) que vendiste no tienen costo cargado, así que no puedo decirte si ganás plata con ellos: ${ej}${n.sinCosto > 4 ? '…' : ''}. Cargalos con ml_cerebro (una sola vez).` });
      }
      if (n.faltaImpuestos && unaVez('impuestos:' + semana)) out.push({ nivel: 'media', skill: 'cerebro-ml', texto: '🧠 No tengo cargado tu % de impuestos sobre las ventas: estoy calculando márgenes SIN impuestos (te dan más altos de lo real). Pasámelo y lo guardo con ml_cerebro.' });
      if (!v && Object.keys(n.items).length) {
        const rojos = Object.values(n.items).filter((x) => x.semaforo === '🔴').length;
        out.push({ nivel: rojos ? 'alta' : 'baja', skill: 'calculadora-ml', texto: `💰 Rentabilidad de lo que vendiste en 30 días: ${Object.keys(n.items).length - n.sinCosto} producto(s) calculados${rojos ? `, ${rojos} con PÉRDIDA` : ''} · ganancia neta estimada ${din(n.gananciaTotal)}${n.sinCosto ? ` (sin contar ${n.sinCosto} sin costo cargado)` : ''}` });
      }
      n.avisos = avisos;
      return out;
    },
  },
  anuncios: {
    async foto(c, t) {
      const ks = await campanias(c, 7);
      if (!ks) return { sinAds: true, campanias: {}, items: {} };
      // Publicidad día por día: lo ya guardado + hoy y ayer de nuevo (cambian) + hasta 10 días que falten por control
      const previo = leerEquipo().snapshots['anuncios|' + claveTarea(t)]?.datos?.diario || {};
      const diario = {}, hoy = Date.now();
      const dias30 = Array.from({ length: 30 }, (_, i) => diaLocal(hoy - i * 86400000));
      for (const d of dias30) if (previo[d]) diario[d] = previo[d];
      let pedidos = 0;
      for (const [i, d] of dias30.entries()) {
        if (diario[d] && i > 1) continue;
        if (i > 1 && pedidos >= 10) continue;
        try { const x = await adsDelDia(c, d); if (x) { diario[d] = x; pedidos++; } } catch {}
      }
      // Cruce con Ramiro: el ACOS que aguanta cada producto según su margen
      const items = {};
      const ram = Object.entries(leerEquipo().snapshots).filter(([k]) => k.startsWith('rentabilidad|')).flatMap(([, s]) => Object.entries(s.datos.items || {}));
      for (const [id, x] of ram.filter(([, x]) => !x.sinCosto && x.acosMax != null).slice(0, 15)) {
        try { const a = await adsDeItem(c, id, 7); if (a && a.cost > 0) items[id] = { titulo: x.titulo, acos: a.acos, acosMax: x.acosMax, cost: a.cost, units: a.units }; } catch {}
      }
      const campa = Object.fromEntries(ks.map((k) => [k.id, k]));
      return { campanias: campa, items, gasto: ks.reduce((s, k) => s + k.cost, 0), ventas: ks.reduce((s, k) => s + k.ventas, 0), diario };
    },
    cambios(t, v, n) {
      const out = [], din = (x) => '$ ' + Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      if (n.sinAds) { if (!v) out.push({ nivel: 'baja', skill: 'publicidad-ml', texto: '📣 La cuenta no tiene Product Ads activo (o no es visible por API): no hay campañas para vigilar.' }); return out; }
      for (const [id, k] of Object.entries(n.campanias)) {
        const a = v?.campanias?.[id];
        if (k.cost > 0 && k.units === 0 && !(a && a.cost > 0 && a.units === 0)) out.push({ nivel: 'alta', skill: 'publicidad-ml', texto: `🔥 La campaña «${k.nombre}» gastó ${din(k.cost)} en 7 días SIN ventas por ads: revisá qué publicaciones tiene o pausala` });
        if (a?.acos != null && k.acos != null && k.acos >= a.acos * 1.3 && k.acos - a.acos >= 5) out.push({ nivel: 'media', skill: 'publicidad-ml', texto: `📈 El ACOS de «${k.nombre}» subió de ${a.acos}% a ${k.acos}% (cada venta por ads te cuesta más)` });
        if (a && a.estado !== k.estado) out.push({ nivel: 'media', skill: 'publicidad-ml', texto: `La campaña «${k.nombre}» pasó de ${a.estado} a ${k.estado}` });
      }
      for (const [id, x] of Object.entries(n.items)) {
        const a = v?.items?.[id];
        if (x.acos != null && x.acos > x.acosMax && !(a && a.acos > a.acosMax)) out.push({ nivel: 'alta', skill: 'publicidad-ml', texto: `🚫 El anuncio de ${id} «${x.titulo}» tiene ACOS ${x.acos}% y tu margen aguanta hasta ${x.acosMax}%: perdés plata en cada venta por publicidad — bajá la puja/presupuesto o sacalo de la campaña` });
      }
      if (!v) out.push({ nivel: 'baja', skill: 'publicidad-ml', texto: `📣 Publicidad de los últimos 7 días: invertiste ${din(n.gasto)} y vendiste ${din(n.ventas)} por ads${n.ventas ? ` (ACOS total ${(n.gasto / n.ventas * 100).toFixed(1)}%)` : ''} en ${Object.keys(n.campanias).length} campaña(s)` });
      return out;
    },
  },
  logistica: {
    async foto(c) {
      const me = await c.get('/users/me');
      const envios = Object.fromEntries((await enviosRecientes(c, me.id, 7)).map((e) => [e.orden, e]));
      const lista = Object.values(envios);
      return { envios, porDespachar: lista.filter((e) => e.porDespachar).length, demorados: lista.filter((e) => e.demorado).length, problemas: lista.filter((e) => e.problema).length,
        demoraRate: me.seller_reputation?.metrics?.delayed_handling_time?.rate ?? null };
    },
    cambios(t, v, n) {
      const out = [], h = (ts) => new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const nuevos = Object.values(n.envios).filter((e) => e.porDespachar && !v?.envios?.[e.orden]?.porDespachar);
      if (nuevos.length) {
        const urgente = nuevos.some((e) => e.limiteDespacho && e.limiteDespacho - Date.now() < 24 * 3600000);
        out.push({ nivel: urgente ? 'alta' : 'media', skill: 'logistica-ml', texto: `📦 ${nuevos.length} venta(s) para despachar: ${nuevos.slice(0, 5).map((e) => `#${e.orden} ${e.titulo} (${e.tipo}${e.limiteDespacho ? `, despachá antes del ${h(e.limiteDespacho)}` : ''})`).join(' · ')}${nuevos.length > 5 ? '…' : ''}` });
      }
      for (const e of Object.values(n.envios)) {
        const a = v?.envios?.[e.orden];
        if (e.demorado && !a?.demorado) out.push({ nivel: 'alta', skill: 'logistica-ml', texto: `🚨 Envío demorado: orden #${e.orden} «${e.titulo}» (${e.tipo}, ${e.estado}${e.subestado ? '/' + e.subestado : ''}${e.provincia ? ', a ' + e.provincia : ''}) — escribile al comprador antes de que reclame` });
        if (e.problema && a?.problema !== e.problema) out.push({ nivel: 'alta', skill: 'logistica-ml', texto: `↩️ Orden #${e.orden} «${e.titulo}»: ${e.problema === 'returned' ? 'el envío volvió (devolución)' : e.problema === 'not_delivered' ? 'no se pudo entregar' : 'envío cancelado'} — revisalo hoy` });
      }
      if (v?.demoraRate != null && n.demoraRate != null && n.demoraRate - v.demoraRate >= 0.02) out.push({ nivel: 'alta', skill: 'logistica-ml', texto: `⚠️ Tu tasa de despachos con demora subió de ${(v.demoraRate * 100).toFixed(1)}% a ${(n.demoraRate * 100).toFixed(1)}%: es lo que más castiga la reputación — despachá en el día` });
      return out;
    },
  },
  contabilidad: {
    async foto(c) {
      const me = await c.get('/users/me');
      const ahora = Date.now(), m0 = inicioDeMes(ahora), m1 = inicioDeMes(ahora, -1);
      const mes = await resumenContable(c, me.id, m0, ahora);
      const comparado = await resumenContable(c, me.id, m1, m1 + (ahora - m0), { conAds: false });
      const dia = new Date(ahora).getDate();
      const cierre = dia <= 3 ? { ...(await resumenContable(c, me.id, m1, m0)), mes: new Date(m1).toISOString().slice(0, 7), nombre: nombreMes(m1) } : null;
      const diario = ventasDiarias(await ordenesPagas(c, me.id, ahora - 30 * 86400000, ahora, { maximo: 2000 }), 30, ahora);
      return { mes: { ...mes, nombre: nombreMes(m0) }, comparado, cierre, diario, avisos: {} };
    },
    cambios(t, v, n) {
      const out = [], avisos = { ...(v?.avisos || {}) };
      const unaVez = (k) => (avisos[k] ? false : (avisos[k] = Date.now(), true));
      const din = (x) => '$ ' + Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      const linea = (r) => `facturaste ${din(r.bruto)} (${r.ordenes} ventas) − comisiones ML ${din(r.comisiones)}${r.ads != null ? ` − publicidad ${din(r.ads)}` : ''}${r.impuestos != null ? ` − impuestos ${din(r.impuestos)}` : ''} − mercadería ${din(r.costoMercaderia)}${r.envios ? ` − envíos ${din(r.envios)}` : ''} = **neto ≈ ${din(r.neto)}** (${r.margen.toFixed(1)}%)${r.parcial ? ` ⚠️ parcial: ${Math.round((1 - r.cobertura) * 100)}% de las unidades sin costo cargado${r.impuestosPct == null ? ' y sin impuestos cargados' : ''}` : ''}`;
      if (n.cierre && unaVez('cierre:' + n.cierre.mes)) out.push({ nivel: 'alta', skill: 'contabilidad-ml', texto: `🧾 Cierre de ${n.cierre.nombre}: ${linea(n.cierre)}` });
      const mesKey = new Date().toISOString().slice(0, 7);
      const tocaResumen = unaVez('resumen:' + mesKey + ':' + Math.floor(new Date().getDate() / 7)); // uno por semana (y el primero)
      if (tocaResumen) {
        const vs = n.comparado.bruto ? ` · vs mismo período del mes anterior: ${n.mes.bruto >= n.comparado.bruto ? '↑' : '↓'} ${Math.abs((n.mes.bruto - n.comparado.bruto) / n.comparado.bruto * 100).toFixed(1)}% de facturación` : '';
        out.push({ nivel: 'baja', skill: 'contabilidad-ml', texto: `🧾 ${n.mes.nombre} hasta hoy: ${linea(n.mes)}${vs}` });
      }
      if (n.mes.bruto > 0 && n.mes.neto < 0 && !n.mes.parcial && unaVez('negativo:' + mesKey)) out.push({ nivel: 'alta', skill: 'contabilidad-ml', texto: `🔴 Vas PERDIENDO plata este mes (neto ${din(n.mes.neto)}): Ramiro te muestra qué productos lo causan — pedile "resultados de Ramiro"` });
      n.avisos = avisos;
      return out;
    },
  },
  stock: {
    async foto(c) { const me = await c.get('/users/me'); return { items: await stockDias(c, me.id), avisos: {} }; },
    cambios(t, v, n) {
      const out = [], avisos = { ...(v?.avisos || {}) }, din = (x) => '$ ' + Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      const unaVez = (k) => (avisos[k] ? false : (avisos[k] = Date.now(), true));
      const pocos = [], criticos = [];
      for (const [id, x] of Object.entries(n.items)) {
        if (x.stock === 0 && x.u30 > 0) { if (unaVez(id + ':cero')) out.push({ nivel: 'alta', skill: 'stock-ml', texto: `🛑 ${id} «${x.titulo}» está SIN STOCK y vendías ${x.porDia}/día: perdés ~${din(x.porDia * (x.precio || 0))} por día y el posicionamiento — reponé o activá el stock` }); continue; }
        if (x.dias != null && x.dias <= 3) { if (unaVez(id + ':3')) criticos.push(`${id} «${x.titulo}» (${x.stock} u. ≈ ${x.dias} día(s))`); }
        else if (x.dias != null && x.dias <= 7) { if (unaVez(id + ':7')) pocos.push(`${id} «${x.titulo}» (${x.stock} u. ≈ ${x.dias} días)`); }
        if (x.dias == null || x.dias > 10) for (const k of [':cero', ':3', ':7']) delete avisos[id + k]; // repuso: vuelve a avisar la próxima vez
      }
      if (criticos.length) out.push({ nivel: 'alta', skill: 'stock-ml', texto: `⏳ Se te corta el stock en 3 días o menos: ${criticos.slice(0, 6).join(' · ')}${criticos.length > 6 ? '…' : ''}` });
      if (pocos.length) out.push({ nivel: 'media', skill: 'stock-ml', texto: `📦 Stock para una semana o menos: ${pocos.slice(0, 6).join(' · ')}${pocos.length > 6 ? '…' : ''} — es momento de pedir` });
      const parado = Object.values(n.items).filter((x) => x.u30 === 0 && x.stock >= 20);
      const semana = Math.floor(Date.now() / (7 * 86400000));
      if (parado.length && unaVez('parado:' + semana)) out.push({ nivel: 'baja', skill: 'stock-ml', texto: `🧊 ${parado.length} publicación(es) con stock parado (20+ unidades y sin ventas en 30 días): ${parado.slice(0, 4).map((x) => x.titulo).join(', ')}${parado.length > 4 ? '…' : ''}` });
      n.avisos = avisos;
      return out;
    },
  },
  atencion: {
    async foto(c) { const me = await c.get('/users/me'); return { preguntas: Object.fromEntries((await preguntasPendientes(c, me.id)).map((q) => [q.id, q])), mensajes: await mensajesSinLeer(c), avisos: {} }; },
    cambios(t, v, n) {
      const out = [], avisos = { ...(v?.avisos || {}) }, ahora = Date.now();
      const unaVez = (k) => (avisos[k] ? false : (avisos[k] = ahora, true));
      const nuevas = Object.values(n.preguntas).filter((q) => !v?.preguntas?.[q.id]);
      if (nuevas.length) out.push({ nivel: 'media', skill: 'responder-preguntas-ml', texto: `💬 ${nuevas.length} pregunta(s) sin responder: ${nuevas.slice(0, 4).map((q) => `«${q.texto}» (${q.item})`).join(' · ')}${nuevas.length > 4 ? '…' : ''}` });
      const viejas = Object.values(n.preguntas).filter((q) => q.t && ahora - q.t > 2 * 3600000 && unaVez(q.id + ':2h'));
      if (viejas.length) out.push({ nivel: 'alta', skill: 'responder-preguntas-ml', texto: `⏰ ${viejas.length} pregunta(s) llevan más de 2 horas sin respuesta (cada hora baja la chance de venta): ${viejas.slice(0, 3).map((q) => `«${q.texto}»`).join(' · ')}` });
      const tm = (n.mensajes || []).reduce((s, x) => s + x.cantidad, 0), tv = (v?.mensajes || []).reduce((s, x) => s + x.cantidad, 0);
      if (n.mensajes && tm > tv) out.push({ nivel: tm >= 3 ? 'alta' : 'media', skill: 'responder-preguntas-ml', texto: `📨 ${tm} mensaje(s) de compradores sin leer en ${n.mensajes.length} venta(s): respondelos desde Mensajes de MercadoLibre` });
      for (const k of Object.keys(avisos)) if (!n.preguntas[k.split(':')[0]]) delete avisos[k]; // las respondidas salen de la memoria
      n.avisos = avisos;
      return out;
    },
  },
  reclamos: {
    async foto(c) { return { reclamos: await reclamosAbiertos(c), avisos: {} }; },
    cambios(t, v, n) {
      const out = [], avisos = { ...(v?.avisos || {}) }, ahora = Date.now();
      const unaVez = (k) => (avisos[k] ? false : (avisos[k] = ahora, true));
      const h = (ts) => { const x = Math.round((ts - ahora) / 3600000); return x <= 0 ? 'YA VENCIÓ' : x < 48 ? `en ${x} h` : `en ${Math.round(x / 24)} días`; };
      for (const [id, k] of Object.entries(n.reclamos)) {
        const a = v?.reclamos?.[id];
        if (!a) out.push({ nivel: 'alta', skill: 'reclamos-ml', texto: `🛡️ Reclamo nuevo #${id}: ${k.tipo}${k.motivo ? ` (motivo ${k.motivo})` : ''} sobre ${k.recurso}${k.vence ? ` — tenés que responder ${h(k.vence)}` : ''}` });
        else if (k.mediacion && !a.mediacion) out.push({ nivel: 'alta', skill: 'reclamos-ml', texto: `⚖️ El reclamo #${id} pasó a MEDIACIÓN con MercadoLibre${k.vence ? ` — próxima acción ${h(k.vence)}` : ''}` });
        if (k.vence && k.vence - ahora < 24 * 3600000 && unaVez(id + ':24h:' + k.vence)) out.push({ nivel: 'alta', skill: 'reclamos-ml', texto: `⏰ El plazo del reclamo #${id} vence ${h(k.vence)}${k.accion ? ` (acción: ${k.accion})` : ''} — si no respondés, MercadoLibre decide y afecta tu reputación` });
      }
      for (const id of Object.keys(v?.reclamos || {})) if (!n.reclamos[id]) out.push({ nivel: 'baja', skill: 'reclamos-ml', texto: `✅ Se cerró el reclamo #${id}` });
      n.avisos = avisos;
      return out;
    },
  },
  reputacion: {
    async foto(c) {
      const me = await c.get('/users/me');
      const top = ventasPorItem(await ordenesPagas(c, me.id, Date.now() - 30 * 86400000)).filter((x) => x.id).slice(0, 10);
      const opiniones = {};
      for (const x of top) { try { opiniones[x.id] = { titulo: x.titulo, ...(await opinionesDe(c, x.id)) }; } catch {} }
      return { rep: reputacionDe(me), opiniones };
    },
    cambios(t, v, n) {
      const out = [], r = n.rep, a = v?.rep;
      const NIVEL = ['1_red', '2_orange', '3_yellow', '4_light_green', '5_green'];
      if (a && a.nivel !== r.nivel) { const sube = NIVEL.indexOf(r.nivel) > NIVEL.indexOf(a.nivel); out.push({ nivel: sube ? 'baja' : 'alta', skill: 'reputacion-ml', texto: `${sube ? '🎉 Subiste' : '⚠️ Bajaste'} de reputación: ${COLOR[a.nivel] || a.nivel} → ${COLOR[r.nivel] || r.nivel}` }); }
      if (a && a.lider !== r.lider) out.push({ nivel: r.lider ? 'baja' : 'alta', skill: 'reputacion-ml', texto: `MercadoLíder: ${a.lider || 'no'} → ${r.lider || 'perdiste la medalla'}` });
      for (const [k, nombre] of [['reclamos', 'reclamos'], ['demoras', 'despachos con demora'], ['cancelaciones', 'cancelaciones']]) {
        if (a?.[k] != null && r[k] != null && r[k] - a[k] >= 0.5) out.push({ nivel: 'media', skill: 'reputacion-ml', texto: `📉 Subió tu tasa de ${nombre}: ${a[k]}% → ${r[k]}% (es lo que mueve tu color)` });
      }
      let negativas30 = 0;
      for (const [id, o] of Object.entries(n.opiniones)) {
        const vistos = new Set((v?.opiniones?.[id]?.recientes || []).map((x) => x.id));
        negativas30 += o.recientes.filter((x) => x.rate <= 2 && x.t && Date.now() - x.t < 30 * 86400000).length;
        if (!v) continue;
        for (const x of o.recientes.filter((x) => !vistos.has(x.id) && x.rate <= 2)) out.push({ nivel: 'alta', skill: 'reputacion-ml', texto: `⭐ Opinión de ${x.rate} estrella(s) en ${id} «${o.titulo}»: «${x.titulo ? x.titulo + ' — ' : ''}${x.texto}»` });
        const p0 = v?.opiniones?.[id]?.promedio;
        if (p0 != null && o.promedio != null && p0 - o.promedio >= 0.2) out.push({ nivel: 'media', skill: 'reputacion-ml', texto: `El promedio de opiniones de ${id} «${o.titulo}» bajó de ${p0} a ${o.promedio}` });
      }
      if (!v) out.push({ nivel: negativas30 ? 'media' : 'baja', skill: 'reputacion-ml', texto: `⭐ Tu reputación: ${COLOR[r.nivel] || r.nivel || 's/d'}${r.lider ? ` · MercadoLíder ${r.lider}` : ''} · reclamos ${r.reclamos ?? '—'}% · demoras ${r.demoras ?? '—'}% · cancelaciones ${r.cancelaciones ?? '—'}%${negativas30 ? ` · ${negativas30} opinión(es) negativa(s) en 30 días en tus más vendidos` : ''}` });
      return out;
    },
  },
  catalogo: {
    async foto(c) {
      const me = await c.get('/users/me');
      const items = await estadoCatalogo(c, me.id);
      for (const [id, x] of Object.entries(items)) { // ¿a precio ganador todavía ganás? (comisión aproximada 14%)
        const s = saberDe(id);
        if (x.ganador && s.costo != null) { const r = rentabilidadDe({ precio: x.ganador, costo: s.costo, impuestos_pct: s.impuestos_pct ?? 0, envio: s.costo_envio ?? 0 }); x.margenGanador = Math.round(r.margen * 10) / 10; x.gananciaGanador = Math.round(r.ganancia); }
      }
      return { items };
    },
    cambios(t, v, n) {
      const out = [], din = (x) => '$ ' + Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      const gana = (e) => e === 'winning' || e === 'sharing_first_place';
      for (const [id, x] of Object.entries(n.items)) {
        const a = v?.items?.[id];
        const margen = x.margenGanador != null ? (x.gananciaGanador > 0 ? ` — a ese precio ganarías ${din(x.gananciaGanador)} por unidad (margen ${x.margenGanador}% aprox.)` : ` — ⚠️ a ese precio PERDÉS ${din(-x.gananciaGanador)} por unidad: no conviene`) : ' (cargá tu costo con ml_cerebro y te digo si conviene)';
        if (x.estado === 'competing' && (!a || gana(a.estado))) out.push({ nivel: 'alta', skill: 'competencia-ml', texto: `🏷️ ${a ? 'Perdiste' : 'Estás perdiendo'} el catálogo de ${id} «${x.titulo}»: tu precio ${din(x.precio)}${x.ganador ? `, ganás con ${din(x.ganador)}` : ''}${x.mejoras.length ? ` o mejorando: ${x.mejoras.join(', ')}` : ''}${x.ganador ? margen : ''}` });
        if (a && a.estado === 'competing' && gana(x.estado)) out.push({ nivel: 'baja', skill: 'competencia-ml', texto: `✅ Recuperaste el catálogo de ${id} «${x.titulo}» (${ESTADO_CATALOGO[x.estado]})` });
      }
      return out;
    },
  },
  moderaciones: {
    async foto(c) { const me = await c.get('/users/me'); return { items: await moderadas(c, me.id) }; },
    cambios(t, v, n) {
      const out = [];
      for (const [id, x] of Object.entries(n.items)) {
        const a = v?.items?.[id];
        const nuevos = x.motivos.filter((m) => !(a?.motivos || []).includes(m));
        if (!a || nuevos.length) out.push({ nivel: x.motivos.includes('poor_quality_thumbnail') && x.estado === 'active' ? 'media' : 'alta', skill: 'moderaciones-ml', texto: `🚫 ${id} «${x.titulo}» ${x.estado === 'active' ? 'tiene una marca de MercadoLibre' : `está ${x.estado === 'under_review' ? 'en revisión' : x.estado}`}: ${(nuevos.length ? nuevos : x.motivos).map(traducirSub).join(', ') || 'revisión de MercadoLibre'}` });
      }
      for (const [id, a] of Object.entries(v?.items || {})) if (!n.items[id]) out.push({ nivel: 'baja', skill: 'moderaciones-ml', texto: `✅ Se resolvió la moderación de ${id} «${a.titulo}»` });
      return out;
    },
  },
  proveedores: {
    async foto(c, t) {
      const prov = await precioProveedor(c, t.fuente);
      let mio = null; try { const b = await c.get(`/items/${t.ref}`); mio = { titulo: b.title, precio: b.price, stock: b.available_quantity ?? 0, estado: b.status }; } catch {}
      return { prov, mio };
    },
    cambios(t, v, n) {
      const out = [], din = (x) => '$ ' + Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 });
      const p = n.prov, a = v?.prov, nombre = n.mio?.titulo || p.titulo || t.ref;
      const sugerido = t.recargo != null && p.precio ? Math.round(p.precio * (1 + t.recargo / 100)) : null;
      const sug = sugerido ? ` — con tu recargo de ${t.recargo}% tendrías que vender a ${din(sugerido)}${n.mio?.precio ? ` (hoy ${din(n.mio.precio)})` : ''}` : '';
      if (a && a.precio && p.precio && a.precio !== p.precio) out.push({ nivel: Math.abs(p.precio - a.precio) / a.precio >= 0.05 ? 'alta' : 'media', skill: 'proveedores-ml', texto: `🔄 El proveedor de ${t.ref} «${nombre}» cambió el precio: ${din(a.precio)} → ${din(p.precio)} (${p.precio > a.precio ? '↑' : '↓'} ${(Math.abs(p.precio - a.precio) / a.precio * 100).toFixed(1)}%)${sug}` });
      else if (!v && sugerido && n.mio?.precio && Math.abs(n.mio.precio - sugerido) / sugerido > 0.03) out.push({ nivel: 'media', skill: 'proveedores-ml', texto: `🔄 ${t.ref} «${nombre}»: el proveedor está a ${din(p.precio)}${sug}` });
      if (p.stock === false && (!a || a.stock !== false) && n.mio?.estado === 'active' && n.mio.stock > 0) out.push({ nivel: 'alta', skill: 'proveedores-ml', texto: `🛑 El proveedor se quedó SIN STOCK de «${nombre}» y tu publicación ${t.ref} sigue activa con ${n.mio.stock} u.: pausala o bajá el stock antes de vender lo que no tenés` });
      if (a?.stock === false && p.stock === true) out.push({ nivel: 'media', skill: 'proveedores-ml', texto: `✅ El proveedor repuso stock de «${nombre}» (${t.ref}): podés reactivar` });
      return out;
    },
  },
  tendencias: {
    async foto(c, t, sitio) { return tomarSnapshot(c, { ...t, tipo: 'tendencias' }, sitio); },
    cambios(t, v, n) { return compararSnapshots({ tipo: 'tendencias' }, v, n).map((texto) => ({ nivel: 'media', ...(texto.startsWith('entraron') || texto.includes('subió') ? { skill: 'descubrir-ganadores-ml' } : {}), texto: `${t.ref}: ${texto}` })); },
  },
};

// Con varias tiendas conectadas, cada aviso de "tu tienda" dice de cuál es
const deCual = (t) => { try { return listarCuentas().length > 1 ? `[${t.ref}] ` : ''; } catch { return ''; } };

// ───────────────────────────── Ejecución ─────────────────────────────
async function correrTarea(trabajador, t, d, c, sitio) {
  const clave = trabajador + '|' + claveTarea(t);
  const nuevo = { t: Date.now(), datos: await OFICIOS[trabajador].foto(c, t, t.sitio || sitio) };
  const viejo = d.snapshots[clave];
  let alertas = [];
  if (trabajador === 'rivales') {
    const vistos = new Set(d.vistos[clave] || []);
    const primera = !d.vistos[clave];
    for (const [nick, x] of Object.entries(nuevo.datos.vendedores)) {
      if (!primera && !vistos.has(nick)) alertas.push({ nivel: 'alta', skill: 'competencia-ml', texto: `🎯 Rival nuevo en "${t.ref}": **${nick}** entró en el puesto ${x.pos} con "${x.titulo}" a ${dinero(x.precio)} — sumalo con ml_vigilar tipo=vendedor ref=${nick}` });
      vistos.add(nick);
    }
    d.vistos[clave] = [...vistos].slice(-500);
  } else if (DE_TIENDA[trabajador] || trabajador === 'proveedores') {
    const pre = !DE_TIENDA[trabajador] || trabajador === 'auditor' || trabajador === 'agenda' ? '' : deCual(t); // Lucía y Clara ya nombran la tienda
    alertas = OFICIOS[trabajador].cambios(t, viejo?.datos ?? null, nuevo.datos).map((a) => (pre ? { ...a, texto: pre + a.texto } : a));
  } else if (viejo) {
    alertas = OFICIOS[trabajador].cambios(t, viejo.datos, nuevo.datos, (nuevo.t - viejo.t) / 3600000);
  }
  // Tomás guarda desde cuándo vigila cada publicación para calcular el ritmo real de ventas
  if (trabajador === 'ventas') nuevo.datos.base = viejo?.datos?.base || (viejo ? { t: viejo.t, vendidos: viejo.datos.vendidos } : { t: nuevo.t, vendidos: nuevo.datos.vendidos });
  d.snapshots[clave] = nuevo;
  return { primera: !viejo && !DE_TIENDA[trabajador] && trabajador !== 'proveedores', alertas, medicion: { t: nuevo.t, trabajador, tarea: t, datos: nuevo.datos } };
}

const sitioCache = new Map();
async function sitioDe(c, cuenta) {
  const k = cuenta || '_';
  if (!sitioCache.has(k)) sitioCache.set(k, (await c.get('/users/me')).site_id || 'MLA');
  return sitioCache.get(k);
}

/**
 * Corre un ciclo del equipo.
 * @param {object} o
 * @param {string[]} [o.solo]      ids de trabajadores a correr (default: todos)
 * @param {boolean}  [o.forzar]    ignora la frecuencia (correr ahora)
 * @param {(a:object)=>void} [o.alAvisar] callback por cada alerta (consola, webhook)
 * @returns {Promise<{corridos:string[], alertas:object[], errores:string[], primeros:number}>}
 */
export async function correrCiclo({ solo, forzar = false, alAvisar, modo = 'manual' } = {}) {
  const ahora = Date.now();
  const d = leerEquipo(); // copia de trabajo: snapshots y vistos se escriben al final
  const ids = (solo?.length ? solo : IDS).filter((id) => EQUIPO[id]);
  const res = { corridos: [], alertas: [], errores: [], primeros: 0 };
  const hechos = {}, mediciones = [], controles = [];
  for (const id of ids) {
    const w = d.trabajadores[id];
    if (!forzar && (!w.activo || (w.ultimo && ahora - w.ultimo < w.intervalo * 60000))) continue;
    const tareas = tareasDe(d, id);
    if (!tareas.length) { hechos[id] = { ultimo: ahora, ultimoError: null }; continue; }
    let error = null;
    for (const t of tareas) {
      try {
        const c = new MeliClient({ userId: t.cuenta });
        const r = await correrTarea(id, t, d, c, await sitioDe(c, t.cuenta));
        if (r.primera) res.primeros++;
        mediciones.push(r.medicion);
        for (const a of r.alertas) {
          const alerta = { t: Date.now(), trabajador: id, ref: t.ref, nivel: a.nivel, texto: a.texto, ...(a.skill ? { skill: a.skill } : {}), leida: false };
          res.alertas.push(alerta);
          try { alAvisar?.(alerta); } catch {}
        }
      } catch (e) {
        error = `${t.ref}: ${e.message}`;
        res.errores.push(`${etiqueta(id)} — ${error}`);
      }
      await pausa(Number(process.env.ML_TRABAJADORES_PAUSA_MS ?? 400)); // amable con la API
    }
    hechos[id] = { ultimo: ahora, ultimoError: error };
    controles.push({ t: ahora, trabajador: id, tareas: tareas.length, alertas: res.alertas.filter((a) => a.trabajador === id).length, error, modo });
    res.corridos.push(id);
  }
  // 1) La base de datos: alertas + historial de mediciones + registro de controles
  let enBase = false;
  try {
    if (base.db()) {
      migrarSiHaceFalta();
      base.guardarAlertas(res.alertas); base.registrarMediciones(mediciones); base.registrarControles(controles);
      enBase = true;
    }
  } catch (e) { res.errores.push('Base de datos: ' + e.message + ' (las alertas quedaron en el archivo de respaldo)'); }
  // 2) Guardar fusionando sobre el estado ACTUAL (la config pudo cambiar mientras corríamos)
  actualizarEquipo((fresco) => {
    for (const [k, v] of Object.entries(d.snapshots)) fresco.snapshots[k] = v;
    for (const [k, v] of Object.entries(d.vistos)) fresco.vistos[k] = v;
    for (const [id, h] of Object.entries(hechos)) Object.assign(fresco.trabajadores[id], h);
    if (!enBase) fresco.bandeja.push(...res.alertas); // respaldo si este Node no trae SQLite
    if (fresco.bandeja.length > MAX_BANDEJA) fresco.bandeja.splice(0, fresco.bandeja.length - MAX_BANDEJA);
  });
  // El tablero se mantiene al día solo (si el vendedor ya lo abrió alguna vez)
  try { const tb = await import('./tablero.js'); if (fs.existsSync(tb.RUTA_TABLERO())) await tb.generarTablero(); } catch {}
  // Resultados a Google Drive (si está configurado). Best-effort: nunca frena al equipo.
  if (res.corridos.length || res.alertas.length) {
    try { const { exportarADrive } = await import('./resultados.js'); res.drive = await exportarADrive(res.alertas); }
    catch (e) { res.drive = { error: e.message }; }
  }
  return res;
}

// Las alertas que estaban en el JSON (versiones ≤ 1.15) pasan a la base una sola vez
export function migrarSiHaceFalta() {
  if (!base.db()) return 0;
  const d = leerEquipo();
  if (!d.bandeja.length) return 0;
  const n = base.migrarBandeja(d.bandeja);
  actualizarEquipo((f) => { f.bandeja = []; });
  return n;
}

/** Conteo de alertas de un trabajador (desde la base o, sin SQLite, desde el JSON). */
export function resumenAlertas(id, d = leerEquipo()) {
  try { if (base.db()) { migrarSiHaceFalta(); return base.contarAlertas(id); } } catch {}
  const ahora = Date.now(), al = d.bandeja.filter((a) => a.trabajador === id);
  return { sinLeer: al.filter((a) => !a.leida).length, h24: al.filter((a) => ahora - a.t < 86400000).length, d7: al.filter((a) => ahora - a.t < 7 * 86400000).length, urgentes7: al.filter((a) => a.nivel === 'alta' && ahora - a.t < 7 * 86400000).length };
}

/** Alertas de los últimos días (sin marcarlas leídas), para resultados e informes. */
export function alertasRecientes({ trabajador, ref, dias = 7 } = {}) {
  try { if (base.db()) { migrarSiHaceFalta(); return base.leerAlertas({ todas: true, marcar: false, trabajador, ref, dias }); } } catch {}
  const corte = Date.now() - dias * 86400000;
  return leerEquipo().bandeja.filter((a) => a.t >= corte && (!trabajador || a.trabajador === trabajador) && (!ref || a.ref === ref));
}

export function leerBandeja({ todas = false, marcar = true, trabajador } = {}) {
  try { if (base.db()) { migrarSiHaceFalta(); return base.leerAlertas({ todas, marcar, trabajador }); } } catch {}
  return actualizarEquipo((d) => {
    const sel = d.bandeja.filter((a) => (todas || !a.leida) && (!trabajador || a.trabajador === trabajador));
    if (marcar) for (const a of sel) a.leida = true;
    return sel.map((a) => ({ ...a }));
  });
}

// ─────────────────────── Candado: un solo corredor a la vez ───────────────────────
export function quienCorre() {
  try {
    const l = JSON.parse(fs.readFileSync(CANDADO(), 'utf8'));
    if (Date.now() - l.latido < LATIDO_VIGENTE) return l;
  } catch {}
  return null;
}

export function tomarCandado(modo) {
  const actual = quienCorre();
  // El servicio 24/7 tiene prioridad: releva al conector; el conector nunca releva al servicio
  if (actual && actual.pid !== process.pid && !(modo === 'servicio' && actual.modo === 'conector')) return false;
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CANDADO(), JSON.stringify({ pid: process.pid, modo, latido: Date.now(), desde: actual?.desde || Date.now() }), { mode: 0o600 });
  return true;
}

export function soltarCandado() {
  const l = quienCorre();
  if (l && l.pid === process.pid) { try { fs.unlinkSync(CANDADO()); } catch {} }
}

// Webhook opcional (CRM, n8n, WhatsApp): solo https, o http a localhost
export function avisoWebhook() {
  const url = process.env.ML_TRABAJADORES_WEBHOOK;
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return (alerta) => {
    fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origen: 'meli-sellers-mcp', ...alerta, trabajador_nombre: EQUIPO[alerta.trabajador]?.nombre, puesto: EQUIPO[alerta.trabajador]?.puesto }), signal: AbortSignal.timeout(10000) }).catch(() => {});
  };
}

/**
 * Bucle permanente. Corre un ciclo por minuto (cada trabajador respeta su frecuencia).
 * Si otro proceso ya tiene el candado, espera sin trabajar (no duplica llamadas ni refresh).
 * Devuelve una función para detenerlo.
 */
export function arrancarBucle({ modo = 'conector', alAvisar, cadaMs = 60000, alEmpezar = true } = {}) {
  let corriendo = false, detenido = false;
  const tic = async () => {
    if (corriendo || detenido) return;
    if (!tomarCandado(modo)) return;
    corriendo = true;
    try { await correrCiclo({ alAvisar, modo }); } catch {} finally { corriendo = false; if (!detenido) tomarCandado(modo); }
  };
  const latido = setInterval(() => { if (!detenido && quienCorre()?.pid === process.pid) tomarCandado(modo); }, 60000);
  const timer = setInterval(tic, cadaMs);
  latido.unref?.(); if (modo === 'conector') timer.unref?.();
  if (alEmpezar) setTimeout(tic, modo === 'conector' ? 20000 : 0).unref?.();
  return () => { detenido = true; clearInterval(timer); clearInterval(latido); soltarCandado(); };
}
