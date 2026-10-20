// src/mejorador.js — el mejorador de publicaciones.
//
// Chequea una publicación contra la receta que convierte:
//   1. Fotos con las MEDIDAS dibujadas (se muestran las fotos a Claude para que las mire).
//   2. Video (video clásico o clips publicados).
//   3. Descripción en este orden: RESUMEN de todo el producto en los 5 primeros renglones →
//      MEDIDAS → CARACTERÍSTICAS PRINCIPALES → QUÉ VIENE EN LA CAJA → PREGUNTAS FRECUENTES.
//   4. Preguntas de los últimos 90 días auditadas y resumidas en un FAQ de 20 (con TUS respuestas).
// Escribe en la tienda solo con OK explícito, y antes guarda un respaldo de la descripción.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { agrupar, INICIO as FAQ_INICIO, FIN as FAQ_FIN, leerBloque, MAX_DESCRIPCION, TEMAS } from './faq.js';

const DIA = 86400000;
export const FAQ_MAXIMO = 20;
export const DIAS_PREGUNTAS = 90;
const sinAcentos = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ───────────────────────────── La descripción ─────────────────────────────
export const TITULOS = { medidas: 'MEDIDAS', caracteristicas: 'CARACTERÍSTICAS PRINCIPALES', incluye: 'QUÉ VIENE EN LA CAJA' };
const SECCION = {
  medidas: /^(medidas|dimensiones|tamano|tamaño)\b/,
  caracteristicas: /^(caracteristicas|especificaciones|ficha tecnica|detalles tecnicos|datos tecnicos)\b/,
  incluye: /^(que (viene|incluye|trae)|incluye|contenido|en la caja|viene con|el paquete (incluye|trae)|la caja (incluye|trae))\b/,
  faq: /^preguntas frecuentes\b/,
};
// Saca viñetas y emojis del comienzo para reconocer el título de una sección
const limpiarInicio = (l) => sinAcentos(l).replace(/^[^\p{L}\p{N}]+/u, '').trim();
// Un título de sección: en mayúsculas, con dos puntos ("Medidas: 27 cm") o corto y sin punto final.
// Así "Viene con tapón cebador." dentro del resumen no se confunde con la sección.
const seccionDe = (linea) => {
  if (linea.length > 70) return null;
  const l = limpiarInicio(linea);
  const k = Object.keys(SECCION).find((x) => SECCION[x].test(l));
  if (!k) return null;
  const letras = linea.replace(/[^\p{L}]/gu, '');
  const mayus = letras.length > 3 && letras === letras.toUpperCase();
  const conDosPuntos = /^[^:]{0,40}:/.test(linea);
  const corto = !/[.!?]$/.test(linea) && l.split(/\s+/).length <= 6;
  return mayus || conDosPuntos || corto ? k : null;
};
const SALUDO = /^(hola|bienvenid|buen(os|as)|gracias por|estimad|querid)/;
const CON_UNIDAD = /\d\s*(cm|mm|mts?|m|metros?|kg|kilos?|g|gr|gramos|l|lts?|litros?|ml|cc|"|pulgadas?|”)\b/i;
const VACIAS = new Set('para con sin de del la el los las un una por que y o en x'.split(' '));
const palabras = (x) => sinAcentos(x).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w));

/**
 * Revisa la estructura de la descripción.
 * @returns {{ chequeos: {id, ok, texto}[], secciones: object, resumen: string[], ok: boolean }}
 */
export function revisarDescripcion(texto, titulo = '') {
  const lineas = String(texto || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const pos = {};
  lineas.forEach((l, i) => { const s = seccionDe(l); if (s && pos[s] == null) pos[s] = i; });
  const primera = Math.min(...Object.values(pos), lineas.length);
  const resumen = lineas.slice(0, primera);
  const ch = [];
  const add = (id, ok, txt) => ch.push({ id, ok, texto: txt });

  // 1. Resumen en los 5 primeros renglones
  if (!lineas.length) add('resumen', false, 'la descripción está vacía');
  else if (SALUDO.test(sinAcentos(lineas[0]))) add('resumen', false, `arranca con un saludo («${lineas[0].slice(0, 50)}»): los primeros 5 renglones tienen que ser el resumen del producto, que es lo único que se ve sin tocar "ver más"`);
  else if (resumen.length < 3) add('resumen', false, `el resumen tiene ${resumen.length} renglón(es): escribí 3 a 5 renglones arriba de todo que cuenten qué es, para qué sirve, lo que lo diferencia, la medida clave y qué trae`);
  else if (resumen.length > 5) add('resumen', false, `antes de la primera sección hay ${resumen.length} renglones: lo importante tiene que entrar en los primeros 5 (el resto va a las secciones)`);
  else {
    const t = new Set(palabras(titulo)), hay = palabras(resumen.join(' ')).filter((w) => t.has(w));
    add('resumen', !t.size || hay.length > 0, t.size && !hay.length ? 'los primeros renglones no nombran el producto: el resumen tiene que decir qué es (con las palabras del título)' : `resumen en ${resumen.length} renglones ✔`);
  }
  // 2-4. Secciones
  const tramo = (s) => { const i = pos[s]; if (i == null) return []; const fin = Math.min(...Object.values(pos).filter((j) => j > i), lineas.length); return lineas.slice(i, fin); };
  if (pos.medidas == null) add('medidas', false, 'falta la sección MEDIDAS (alto, ancho, largo/diámetro, peso, capacidad)');
  else add('medidas', CON_UNIDAD.test(tramo('medidas').join(' ')), CON_UNIDAD.test(tramo('medidas').join(' ')) ? 'sección medidas con números ✔' : 'la sección MEDIDAS no tiene números con unidad (ej: "27 cm", "480 g", "1 L")');
  if (pos.caracteristicas == null) add('caracteristicas', false, 'falta la sección CARACTERÍSTICAS PRINCIPALES (material, marca/modelo, uso, lo técnico)');
  else add('caracteristicas', tramo('caracteristicas').length >= 3, tramo('caracteristicas').length >= 3 ? 'sección características ✔' : 'la sección CARACTERÍSTICAS tiene menos de 2 puntos');
  if (pos.incluye == null) add('incluye', false, 'falta la sección QUÉ VIENE EN LA CAJA (todo lo que recibe el comprador)');
  else add('incluye', tramo('incluye').length >= 2, tramo('incluye').length >= 2 ? 'sección qué viene en la caja ✔' : 'la sección QUÉ VIENE EN LA CAJA está vacía');
  // 5. Orden
  const ORDEN = ['medidas', 'caracteristicas', 'incluye', 'faq'].filter((k) => pos[k] != null);
  const enOrden = ORDEN.every((k, i) => i === 0 || pos[ORDEN[i - 1]] < pos[k]);
  add('orden', enOrden && ORDEN.length >= 3, !enOrden ? `el orden no es el que convierte: ${ORDEN.sort((a, b) => pos[a] - pos[b]).map((k) => TITULOS[k] || 'PREGUNTAS FRECUENTES').join(' → ')}` : ORDEN.length >= 3 ? 'orden resumen → medidas → características → qué viene ✔' : 'faltan secciones para el orden resumen → medidas → características → qué viene → preguntas');
  return { chequeos: ch, secciones: pos, resumen, ok: ch.every((x) => x.ok) };
}

// ───────────────────────────── Ficha técnica ─────────────────────────────
const ES_MEDIDA = /(HEIGHT|WIDTH|LENGTH|DEPTH|DIAMETER|WEIGHT|CAPACITY|VOLUME|SIZE|THICKNESS)/;
const IGNORAR = /^(SELLER_SKU|GTIN|EAN|UPC|ITEM_CONDITION|MPN|IS_|HAS_|PACKAGE_|SHIPMENT_|PRODUCT_DATA_SOURCE|EXCLUSIVE_CHANNEL|LINE)/;
/** Medidas, características e "incluye" que ya tiene la ficha de ML (material para la descripción). */
export function material(b, sabido = {}) {
  const attrs = (b.attributes || []).filter((a) => a.value_name && String(a.value_name).trim());
  const medidas = attrs.filter((a) => ES_MEDIDA.test(a.id) && !/^PACKAGE_/.test(a.id)).map((a) => `${a.name || a.id}: ${a.value_name}`);
  if (sabido.medidas) medidas.unshift(`(del cerebro) ${sabido.medidas}`);
  const caracteristicas = attrs.filter((a) => !ES_MEDIDA.test(a.id) && !IGNORAR.test(a.id) && !/^(INCLUDES|ACCESSORIES)/.test(a.id)).slice(0, 14).map((a) => `${a.name || a.id}: ${a.value_name}`);
  const incluye = [...attrs.filter((a) => /^(INCLUDES|ACCESSORIES_INCLUDED|KIT_COMPONENTS|UNITS_PER_PACK)/.test(a.id)).map((a) => `${a.name || a.id}: ${a.value_name}`), ...(sabido.incluye ? [`(del cerebro) ${sabido.incluye}`] : [])];
  return { medidas, caracteristicas, incluye };
}

// ───────────────────────────── Video ─────────────────────────────
/** Clips de una publicación (dos rutas posibles de la API; null si la cuenta no tiene la API). */
export async function traerClips(c, id) {
  for (const ruta of [`/marketplace/items/${id}/clips`, `/items/${id}/clips`]) {
    try { return await c.get(ruta); } catch (e) {
      if (e.status === 404 && /no clips/i.test(String(e.message))) return { clips: [] };
      if (![400, 403, 404].includes(e.status)) throw e;
    }
  }
  return null;
}
export async function estadoVideo(c, b) {
  const r = await traerClips(c, b.id).catch(() => null);
  const estados = (r?.clips || []).flatMap((cl) => (cl.metadata || []).map((m) => m.moderation_status));
  const publicados = estados.filter((s) => s === 'PUBLISHED').length, revision = estados.filter((s) => s === 'UNDER_REVIEW').length;
  return { video: !!b.video_id, clips: publicados, revision, ok: !!b.video_id || publicados > 0, apiClips: r != null };
}

// ───────────────────────────── Preguntas de 90 días → FAQ de 20 ─────────────────────────────
/** Todas las preguntas (respondidas y no) de los últimos `dias` días, de la más nueva a la más vieja. */
export async function preguntasRecientes(c, itemId, { dias = DIAS_PREGUNTAS, maximo = 1000, ahora = Date.now() } = {}) {
  const desde = ahora - dias * DIA, todas = [];
  for (let offset = 0; offset < maximo; offset += 50) {
    const r = await c.get('/questions/search', { item: itemId, limit: 50, offset, sort_fields: 'date_created', sort_types: 'DESC', api_version: 4 });
    const lote = r.questions || [];
    let viejas = false;
    for (const q of lote) { const t = Date.parse(q.date_created || '') || 0; if (t >= desde) todas.push(q); else viejas = true; }
    if (viejas || lote.length < 50 || offset + 50 >= (r.total ?? Infinity)) break;
  }
  return todas;
}

/** Audita las preguntas: totales, temas más preguntados y las 20 preguntas frecuentes (con tus respuestas). */
export function auditarPreguntas(preguntas, { maximo = FAQ_MAXIMO } = {}) {
  const respondidas = preguntas.filter((q) => q.answer?.text);
  const grupos = agrupar(preguntas);
  const porTema = {};
  for (const q of preguntas) {
    const t = ' ' + sinAcentos(q.text).replace(/[^a-z0-9 ]/g, ' ') + ' ';
    const tm = TEMAS.find((x) => x.palabras.some((p) => t.includes(' ' + p + ' ') || (p.length > 5 && t.includes(p))));
    const k = tm?.id || 'otros'; porTema[k] = (porTema[k] || 0) + 1;
  }
  return { total: preguntas.length, respondidas: respondidas.length, sinResponder: preguntas.length - respondidas.length,
    temas: Object.entries(porTema).sort((a, b) => b[1] - a[1]), faq: grupos.slice(0, maximo), descartadas: respondidas.length - grupos.reduce((s, g) => s + g.veces, 0) };
}

export function bloqueFAQ(faq) {
  if (!faq.length) return '';
  return [FAQ_INICIO, '', ...faq.flatMap((g) => [g.pregunta, g.respuesta, '']), FAQ_FIN].join('\n');
}

// ───────────────────────────── Armar la descripción nueva ─────────────────────────────
const CONTACTO = /(\b\d[\d\s\-.]{6,}\d\b|@|https?:|www\.|\.com\b|whats|wsp|wpp|instagram|facebook|telefono|teléfono|celular|mail|correo)/i;
function limpiarLineas(nombre, xs, { min = 0, max = 30, largo = 300, numero = false } = {}) {
  const lista = (Array.isArray(xs) ? xs : String(xs ?? '').split('\n')).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (lista.length < min) throw new Error(`${nombre}: hacen falta al menos ${min} renglón(es)`);
  if (lista.length > max) throw new Error(`${nombre}: máximo ${max} renglones`);
  for (const l of lista) {
    if (l.length > largo) throw new Error(`${nombre}: un renglón pasa los ${largo} caracteres («${l.slice(0, 40)}…»)`);
    if (/[<>]/.test(l)) throw new Error(`${nombre}: MercadoLibre no acepta HTML en la descripción («${l.slice(0, 40)}»)`);
    if (CONTACTO.test(l)) throw new Error(`${nombre}: tiene datos de contacto o links («${l.slice(0, 40)}»): MercadoLibre lo penaliza`);
  }
  if (numero && lista.length && !lista.some((l) => CON_UNIDAD.test(l))) throw new Error(`${nombre}: tiene que tener al menos una medida con número y unidad (ej: "Alto: 27 cm")`);
  return lista;
}
const vineta = (l) => (/^[-•·*✔✅▪■]/.test(l) ? l : '- ' + l);

/**
 * Descripción en el orden que convierte. Si no se pasa una sección se conserva la que ya había.
 * @returns {string}
 */
export function armarMejorada(actual, { resumen, medidas, caracteristicas, incluye, extra, faq = [] }) {
  const R = limpiarLineas('resumen', resumen, { min: 3, max: 5, largo: 220 });
  const M = limpiarLineas('medidas', medidas, { min: 1, numero: true });
  const C = limpiarLineas('características', caracteristicas, { min: 2 });
  const I = limpiarLineas('qué viene en la caja', incluye, { min: 1 });
  const E = extra ? limpiarLineas('extra', extra, { max: 80, largo: 600 }) : [];
  const partes = [R.join('\n'), [TITULOS.medidas, ...M.map(vineta)].join('\n'), [TITULOS.caracteristicas, ...C.map(vineta)].join('\n'), [TITULOS.incluye, ...I.map(vineta)].join('\n')];
  if (E.length) partes.push(E.join('\n'));
  // FAQ: las 20 de los últimos 90 días; si había preguntas en el bloque viejo que no salieron, entran hasta completar 20
  const pares = faq.map((g) => ({ pregunta: g.pregunta, respuesta: g.respuesta }));
  for (const p of leerBloque(actual)) if (pares.length < FAQ_MAXIMO && !pares.some((x) => x.pregunta === p.pregunta)) pares.push(p);
  const bloque = bloqueFAQ(pares.slice(0, FAQ_MAXIMO));
  if (bloque) partes.push(bloque);
  const nueva = partes.join('\n\n');
  if (nueva.length > MAX_DESCRIPCION) throw new Error(`la descripción quedaría en ${nueva.length} caracteres (máximo de MercadoLibre: ${MAX_DESCRIPCION})`);
  return nueva;
}

/** Respaldo local de la descripción anterior (privado), antes de pisarla. */
export function respaldar(itemId, texto) {
  const dir = path.join(process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp'), 'respaldos');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const archivo = path.join(dir, `descripcion-${String(itemId).replace(/[^A-Z0-9]/gi, '')}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  fs.writeFileSync(archivo, String(texto ?? ''), { mode: 0o600 });
  return archivo;
}

// ───────────────────────────── Fotos (para que Claude las mire) ─────────────────────────────
const tipoPorBytes = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null);
/** Solo fotos del CDN de MercadoLibre por https (en las pruebas, el host del simulador). */
export function urlFotoValida(u) {
  let url; try { url = new URL(u); } catch { return null; }
  if (url.username || url.password) return null;
  const prueba = (process.env.MELI_FOTOS_HOST_PRUEBA || '').trim();
  if (prueba && url.host === prueba) return url;
  if (url.protocol !== 'https:') return null;
  return url.hostname === 'mlstatic.com' || url.hostname.endsWith('.mlstatic.com') ? url : null;
}
async function bajarFoto(u, { tope = 1_500_000, ms = 10000 } = {}) {
  const url = urlFotoValida(u); if (!url) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: 'error', signal: ctl.signal });
    if (!r.ok) return null;
    const partes = []; let n = 0;
    for await (const ch of r.body) { n += ch.length; if (n > tope) return null; partes.push(ch); }
    const buf = Buffer.concat(partes), tipo = tipoPorBytes(buf);
    return tipo ? { type: 'image', data: buf.toString('base64'), mimeType: tipo } : null;
  } catch { return null; } finally { clearTimeout(t); }
}
/** Hasta `max` fotos de la publicación, en el orden en que se ven. */
export async function fotosDe(b, { max = 10, total = 8_000_000 } = {}) {
  const out = []; let usado = 0;
  for (const p of (b.pictures || []).slice(0, max)) {
    const f = await bajarFoto(p.secure_url || p.url);
    if (!f) { out.push(null); continue; }
    usado += f.data.length; if (usado > total) break;
    out.push(f);
  }
  return out;
}
