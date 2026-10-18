// src/trabajadores.js — el equipo de 6 trabajadores que vigilan solos, 24/7.
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
      { skill: 'calculadora-ml', para: 'antes de igualar un precio: ver si con ese precio todavía ganás plata' },
      { skill: 'cerebro-ml', para: 'guardar tus costos e impuestos para que la calculadora no pregunte' },
    ],
  },
  ventas: {
    alias: 'tomas', emoji: '📦', nombre: 'Tomás', puesto: 'Contador de ventas', intervalo: 60, tipos: ['publicacion'],
    oficio: 'Cuenta las ventas estimadas de publicaciones rivales (unidades y ritmo por día), y avisa cuando un rival se queda sin stock, pausa o reactiva: esas son tus ventanas de oportunidad.',
    skills: [
      { skill: 'panel-ventas-ml', para: 'comparar el ritmo del rival con tus ventas de hoy y del mes' },
      { skill: 'reporte-ventas-ml', para: 'el resumen de 4 líneas para mandar por WhatsApp' },
      { skill: 'responder-preguntas-ml', para: 'cuando un rival se queda sin stock, contestar rápido las preguntas que te llegan' },
    ],
  },
  ranking: {
    alias: 'martina', emoji: '🏆', nombre: 'Martina', puesto: 'Vigía de búsquedas', intervalo: 60, tipos: ['busqueda'],
    oficio: 'Mira el top 50 de tus palabras clave: avisa cambios de líder y de precio líder, y si le pasás tu publicación (mi_item) te dice en qué puesto estás y cuándo subís, bajás o salís del top.',
    skills: [
      { skill: 'imagenes-ml', para: 'rehacer las fotos 2-10 cuando el problema es la presentación' },
      { skill: 'publicidad-ml', para: 'empujar con Product Ads una keyword donde perdiste puestos' },
    ],
  },
  rivales: {
    alias: 'bruno', emoji: '🎯', nombre: 'Bruno', puesto: 'Cazador de rivales nuevos', intervalo: 180, tipos: ['busqueda'],
    oficio: 'Detecta vendedores que aparecen por primera vez en tus búsquedas (con qué producto y a qué precio) para que los sumes a la vigilancia antes de que te saquen ventas.',
    skills: [
      { skill: 'competencia-ml', para: 'radiografía del rival nuevo: precios, envío, reputación y cómo responder' },
      { skill: 'revisar-publicaciones-aldi', para: 'revisar la publicación del rival y la tuya con Aldi para ver quién está mejor armada' },
    ],
  },
  auditor: {
    alias: 'lucia', emoji: '🩺', nombre: 'Lucía', puesto: 'Auditora de publicaciones', intervalo: 15 * 24 * 60, tipos: ['propias'],
    oficio: 'Cada 15 días audita TODAS tus publicaciones activas y te dice cuáles quedaron desactualizadas: días sin tocar, precio congelado o fuera de mercado, sin stock, fotos de baja resolución o pocas, sin video, sin marca/modelo o garantía, catálogo perdido. Compara contra la auditoría anterior: qué empeoró y qué quedó al día.',
    skills: [
      { skill: 'mejorar-publicaciones-ml', para: 'aplicar los arreglos de la auditoría, las peores primero' },
      { skill: 'visualizador-publicaciones-ml', para: 'elegir en un tablero cuáles mejorar esta quincena' },
      { skill: 'copiar-publicaciones-ml', para: 'rehacer una publicación vieja como nueva sin perder lo que funciona' },
    ],
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

// ───────────────────────────── Tareas ─────────────────────────────
export function tipoPorDefecto(trabajador, ref) {
  if (trabajador === 'auditor') return 'propias';
  if (trabajador === 'precios') return /^[A-Z]{3}\d+$/i.test(String(ref || '').trim()) ? 'publicacion' : 'vendedor';
  return EQUIPO[trabajador].tipos[0];
}
export const claveTarea = (t) => claveDe(t) + (t.cuenta ? '@' + t.cuenta : '');

export function asignarTarea(quien, { tipo, ref, mi_item, umbral, nota, cuenta, sitio }) {
  const trabajador = resolverTrabajador(quien);
  if (!trabajador) throw new Error(`No existe "${quien}" en el equipo: ${IDS.map(etiqueta).join(', ')}.`);
  tipo = tipo || tipoPorDefecto(trabajador, ref);
  if (!EQUIPO[trabajador].tipos.includes(tipo)) throw new Error(`${EQUIPO[trabajador].nombre} (${EQUIPO[trabajador].puesto}) no trabaja con "${tipo}": acepta ${EQUIPO[trabajador].tipos.join(' o ')}.`);
  const limpio = String(ref ?? '').trim();
  if (!limpio && tipo !== 'tendencias' && tipo !== 'propias') throw new Error('Falta ref: el item_id, vendedor o palabra clave a vigilar.');
  if (limpio.length > 120) throw new Error('ref demasiado largo (máx. 120 caracteres).');
  if (mi_item && !/^[A-Z]{3}\d+$/i.test(String(mi_item).trim())) throw new Error('mi_item tiene que ser un item_id de MercadoLibre (ej: MLA123456789).');
  const tarea = {
    tipo, ref: limpio || (tipo === 'propias' ? (cuenta ? 'tienda ' + cuenta : 'mi tienda') : sitio || 'MLA'), sitio, nota,
    ...(mi_item ? { mi_item: String(mi_item).trim().toUpperCase() } : {}),
    ...(umbral != null ? { umbral: Math.max(0, Number(umbral) || 0) } : {}),
    ...(cuenta ? { cuenta: String(cuenta) } : {}),
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
  if (trabajador === 'auditor') {
    if (propias.length) return propias;
    // Sin tareas propias: audita cada tienda conectada
    let cs = []; try { cs = listarCuentas(); } catch {}
    return cs.map((c) => ({ tipo: 'propias', ref: 'tienda ' + c.nickname, cuenta: String(c.user_id), deLista: true }));
  }
  const claves = new Set(propias.map(claveTarea));
  const deLista = (leerVigilancia().objetivos || [])
    .filter((o) => EQUIPO[trabajador].tipos.includes(o.tipo) && !claves.has(claveDe(o)))
    .map((o) => ({ ...o, deLista: true }));
  return [...propias, ...deLista];
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
      return { items, total: lista.length, rojas: cuenta('🔴'), amarillas: cuenta('🟡'), verdes: cuenta('🟢'), sinActualizar: lista.filter((x) => x.codigos.includes('sin_actualizar')).length };
    },
    cambios(t, v, n) {
      const out = [], rango = { '🟢': 0, '🟡': 1, '🔴': 2 };
      // la skill sale del problema principal (los códigos ya vienen ordenados por gravedad)
      const skillDe = ([k]) => ['fotos_baja_resolucion', 'pocas_fotos'].includes(k) ? 'imagenes-ml'
        : k === 'sin_video' ? 'video-publicaciones-ml'
        : k?.startsWith('precio_') ? 'calculadora-ml'
        : k === 'pierde_catalogo' ? 'competencia-ml' : 'mejorar-publicaciones-ml';
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
        texto: `🩺 Auditoría quincenal de ${t.ref}: ${n.total} publicaciones — ${n.rojas} 🔴 · ${n.amarillas} 🟡 · ${n.verdes} 🟢${n.sinActualizar ? ` · ${n.sinActualizar} sin actualizar hace 60+ días` : ''}${v ? ` · desde la anterior: ${mejoraron} mejoraron, ${empeoraron} empeoraron` : ' (primera auditoría: queda como base para comparar en 15 días)'}` });
      for (const [id, x] of urgentes.sort((a, b) => b[1].codigos.length - a[1].codigos.length).slice(0, 8)) {
        out.push({ nivel: 'alta', skill: skillDe(x.codigos), texto: `${id} «${x.titulo}»${v?.items?.[id] ? ' pasó a urgente' : ' está en rojo'}: ${x.textos[0]}${x.textos.length > 1 ? ` (+${x.textos.length - 1} problema(s) más)` : ''}` });
      }
      if (v && desactualizadas.length) out.push({ nivel: 'media', skill: 'mejorar-publicaciones-ml', texto: `${desactualizadas.length} publicación(es) quedaron desactualizadas (60+ días sin tocar): ${desactualizadas.slice(0, 6).join(', ')}${desactualizadas.length > 6 ? '…' : ''}` });
      if (alDia.length) out.push({ nivel: 'baja', texto: `✅ Quedaron al día: ${alDia.slice(0, 5).join(' · ')}${alDia.length > 5 ? '…' : ''}` });
      return out;
    },
  },
  tendencias: {
    async foto(c, t, sitio) { return tomarSnapshot(c, { ...t, tipo: 'tendencias' }, sitio); },
    cambios(t, v, n) { return compararSnapshots({ tipo: 'tendencias' }, v, n).map((texto) => ({ nivel: 'media', ...(texto.startsWith('entraron') || texto.includes('subió') ? { skill: 'descubrir-ganadores-ml' } : {}), texto: `${t.ref}: ${texto}` })); },
  },
};

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
  } else if (trabajador === 'auditor') {
    alertas = OFICIOS.auditor.cambios(t, viejo?.datos ?? null, nuevo.datos);
  } else if (viejo) {
    alertas = OFICIOS[trabajador].cambios(t, viejo.datos, nuevo.datos, (nuevo.t - viejo.t) / 3600000);
  }
  // Tomás guarda desde cuándo vigila cada publicación para calcular el ritmo real de ventas
  if (trabajador === 'ventas') nuevo.datos.base = viejo?.datos?.base || (viejo ? { t: viejo.t, vendidos: viejo.datos.vendidos } : { t: nuevo.t, vendidos: nuevo.datos.vendidos });
  d.snapshots[clave] = nuevo;
  return { primera: !viejo && trabajador !== 'auditor', alertas, medicion: { t: nuevo.t, trabajador, tarea: t, datos: nuevo.datos } };
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
