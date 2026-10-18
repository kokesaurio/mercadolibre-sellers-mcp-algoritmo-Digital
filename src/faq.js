// src/faq.js — convierte las preguntas que te hacen los compradores en una sección
// "PREGUNTAS FRECUENTES" de la descripción: menos preguntas repetidas, más conversión.
//
// · Agrupa preguntas parecidas (por tema y por palabras), cuenta cuántas veces se repiten.
// · Usa TU respuesta real (nunca inventa): la limpia de saludos y firmas.
// · Descarta lo que cambia con el tiempo (stock, precio, cuotas, envío/plazos) y cualquier
//   respuesta con datos de contacto (teléfono, mail, links, redes): ML lo penaliza.
// · Detecta qué ya está cubierto en la descripción para no repetirlo.
// · Inserta o REEMPLAZA un bloque marcado, así se puede actualizar cada quincena sin duplicar.

export const INICIO = 'PREGUNTAS FRECUENTES';
export const FIN = '(Fin de preguntas frecuentes)';
export const MAX_DESCRIPCION = 50000;
const MAX_RESPUESTA = 400;

const sinAcentos = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VACIAS = new Set('el la los las un una unos unas de del al a y o u que en con sin por para es son se le lo me mi tu su sus te tiene tienen trae viene hay tenes tenés esta este esto estos esa ese eso como cual cuales cuanto cuanta cuantos hola buenas buen dia dias tarde noches gracias consulta pregunta queria quería saber si no mas más muy ya tambien también pero porque usted ustedes vos producto articulo artículo publicacion publicación'.split(' ').map(sinAcentos));

// Temas: agrupan aunque estén escritas distinto, y sirven para ver si la descripción ya lo cubre
export const TEMAS = [
  { id: 'medidas', palabras: ['medida', 'medidas', 'tamano', 'alto', 'ancho', 'largo', 'diametro', 'dimension', 'cm', 'mide', 'miden'] },
  { id: 'capacidad', palabras: ['capacidad', 'litro', 'litros', 'ml', 'cc', 'entra', 'cabe'] },
  { id: 'material', palabras: ['material', 'acero', 'plastico', 'vidrio', 'madera', 'aluminio', 'tela', 'hecho'] },
  { id: 'garantia', palabras: ['garantia'] },
  { id: 'incluye', palabras: ['incluye', 'viene con', 'trae', 'contenido', 'caja', 'accesorio', 'accesorios'] },
  { id: 'compatibilidad', palabras: ['compatible', 'compatibilidad', 'sirve para', 'funciona con', 'anda con'] },
  { id: 'uso', palabras: ['lavavajilla', 'lavavajillas', 'microondas', 'heladera', 'freezer', 'horno', 'lavar', 'limpiar', 'uso'] },
  { id: 'termico', palabras: ['mantiene', 'conserva', 'horas', 'caliente', 'frio', 'temperatura', 'termico'] },
  { id: 'peso', palabras: ['peso', 'pesa', 'kilo', 'kilos', 'gramos', 'kg'] },
  { id: 'color', palabras: ['color', 'colores'] },
  { id: 'origen', palabras: ['original', 'origen', 'importado', 'nacional', 'marca'] },
  { id: 'factura', palabras: ['factura', 'facturan', 'iva'] },
  { id: 'voltaje', palabras: ['voltaje', 'volt', '220', '110', 'enchufe', 'bateria', 'pilas', 'carga'] },
];
// Cambian con el tiempo o las resuelve MercadoLibre: no van a la descripción
const TEMPORALES = /\b(stock|disponib|queda|quedan|hay\s+\d|precio|descuento|oferta|promo|cuota|cuotas|tarjeta|envio|envios|envian|mandan|llega|llegaria|demora|tarda|retiro|retirar|direccion|local|horario|reserv|mayor|mayorista|por cantidad)/;
const CONTACTO = /(\b\d[\d\s\-.]{6,}\d\b|@|https?:|www\.|\.com\b|whats|wsp|wpp|instagram|facebook|\big\b|telefono|celular|llam[aá]|mail|correo)/i;

const tokens = (x) => sinAcentos(x).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w));
const temaDe = (texto) => { const t = ' ' + sinAcentos(texto).replace(/[^a-z0-9 ]/g, ' ') + ' '; return TEMAS.find((tm) => tm.palabras.some((p) => t.includes(' ' + p + ' ') || (p.length > 5 && t.includes(p))))?.id || null; };
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1); };

/** Limpia la respuesta del vendedor: saca saludos/firmas, recorta, y la descarta si tiene datos de contacto. */
export function limpiarRespuesta(texto) {
  let r = String(texto || '').trim();
  if (!r || CONTACTO.test(r)) return null;
  // saludos encadenados ("Hola, buen día! ¿qué tal?") se sacan todos
  for (let antes = ''; antes !== r; ) { antes = r; r = r.replace(/^[¡!\s]*(hola+|buen(os|as)?\s*(d[ií]as?|tardes?|noches?)|buenas|qu[eé] tal|c[oó]mo (est[aá]s|va|andas))[\s,!.?¿¡]*/i, ''); }
  r = r
       .replace(/[\s,.!]*(saludos?|slds|muchas gracias|gracias por (tu|su) (consulta|pregunta|compra)|quedamos (a (tu|su|la) )?disposici[oó]n|te esperamos|cualquier (duda|consulta)[^.]*|que tengas[^.]*|abrazo)[\s\S]*$/i, '')
       .replace(/\s+/g, ' ').trim();
  if (r.length < 3) return null;
  if (r.length > MAX_RESPUESTA) r = r.slice(0, MAX_RESPUESTA).replace(/\s+\S*$/, '') + '…';
  r = r.charAt(0).toUpperCase() + r.slice(1);
  return /[.!?…]$/.test(r) ? r : r + '.';
}

function limpiarPregunta(texto) {
  let q = String(texto || '').replace(/\s+/g, ' ').trim()
    .replace(/^(hola+|buen(os|as)?\s*(d[ií]as?|tardes?|noches?)|buenas)[\s,!.¡]*/i, '')
    .replace(/[\s,]*(gracias|saludos)[\s.!]*$/i, '').trim();
  if (!q) return null;
  q = q.replace(/^¿?/, '¿').replace(/\?*$/, '?');
  return q.charAt(0) === '¿' ? '¿' + q.charAt(1).toUpperCase() + q.slice(2) : q;
}

/** ¿La descripción ya responde este grupo? */
export function cubierto(grupo, descripcion) {
  const d = ' ' + sinAcentos(descripcion).replace(/[^a-z0-9ñ ]/g, ' ') + ' ';
  if (grupo.tema) {
    const tm = TEMAS.find((x) => x.id === grupo.tema);
    if (tm.palabras.some((p) => d.includes(' ' + p + ' ') || (p.length > 5 && d.includes(p)))) return true;
  }
  const tk = grupo.claves;
  if (!tk.length) return false;
  return tk.filter((w) => d.includes(' ' + w + ' ')).length / tk.length >= 0.6;
}

/**
 * Agrupa preguntas respondidas.
 * @param {{text, answer?:{text, date_created}, date_created}[]} preguntas
 * @returns {{tema, pregunta, respuesta, veces, claves, ultima}[]} de la más repetida a la menos
 */
export function agrupar(preguntas) {
  const grupos = [];
  for (const q of preguntas) {
    const texto = q.text || '';
    if (!q.answer?.text || TEMPORALES.test(sinAcentos(texto))) continue;
    const respuesta = limpiarRespuesta(q.answer.text);
    const pregunta = limpiarPregunta(texto);
    if (!respuesta || !pregunta) continue;
    const tema = temaDe(texto), tk = tokens(texto);
    const fecha = Date.parse(q.answer.date_created || q.date_created || '') || 0;
    let g = grupos.find((x) => (tema && x.tema === tema) || (!tema && !x.tema && jaccard(x.claves, tk) >= 0.5));
    if (!g) { g = { tema, pregunta, respuesta, veces: 0, claves: tk, ultima: 0 }; grupos.push(g); }
    g.veces++;
    // la pregunta más corta y clara representa al grupo; la respuesta más reciente es la vigente
    if (pregunta.length < g.pregunta.length && pregunta.length >= 12) g.pregunta = pregunta;
    if (fecha >= g.ultima) { g.ultima = fecha; g.respuesta = respuesta; }
  }
  return grupos.sort((a, b) => b.veces - a.veces || b.ultima - a.ultima);
}

/** Las preguntas frecuentes que FALTAN en la descripción (mínimo `minVeces` repeticiones). */
export function faltantes(preguntas, descripcion, { minVeces = 2, maximo = 8 } = {}) {
  // se compara contra la descripción COMPLETA (bloque incluido): lo ya sumado cuenta como cubierto
  return agrupar(preguntas).filter((g) => g.veces >= minVeces && !cubierto(g, descripcion || '')).slice(0, maximo);
}

/** Pares pregunta/respuesta que ya están en el bloque de la descripción. */
export function leerBloque(descripcion) {
  const d = String(descripcion || '');
  const i = d.indexOf(INICIO);
  if (i === -1) return [];
  const j = d.indexOf(FIN, i);
  const lineas = d.slice(i + INICIO.length, j === -1 ? undefined : j).split('\n').map((x) => x.trim()).filter(Boolean);
  const pares = [];
  for (let k = 0; k < lineas.length; k++) {
    if (lineas[k].startsWith('¿') && lineas[k + 1] && !lineas[k + 1].startsWith('¿')) { pares.push({ pregunta: lineas[k], respuesta: lineas[k + 1] }); k++; }
  }
  return pares;
}

export function quitarBloque(descripcion) {
  const d = String(descripcion || '');
  const i = d.indexOf(INICIO);
  if (i === -1) return d;
  const j = d.indexOf(FIN, i);
  return (d.slice(0, i) + (j === -1 ? '' : d.slice(j + FIN.length))).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Arma la descripción nueva: la original + UN bloque de preguntas frecuentes.
 * Respeta lo que ya estaba en el bloque (si hay respuesta más nueva para esa pregunta, la actualiza)
 * y suma las nuevas al final. Nunca duplica.
 */
export function armarDescripcion(descripcion, nuevas, { todas = [] } = {}) {
  const base = quitarBloque(descripcion);
  const pares = leerBloque(descripcion).map((p) => {
    const fresca = todas.find((g) => g.pregunta === p.pregunta);
    return fresca ? { pregunta: p.pregunta, respuesta: fresca.respuesta } : p;
  });
  for (const g of nuevas) if (!pares.some((p) => p.pregunta === g.pregunta)) pares.push({ pregunta: g.pregunta, respuesta: g.respuesta });
  if (!pares.length) return base;
  const bloque = [INICIO, '', ...pares.flatMap((g) => [g.pregunta, g.respuesta, '']), FIN].join('\n');
  const nueva = (base ? base + '\n\n' : '') + bloque;
  if (nueva.length > MAX_DESCRIPCION) throw new Error(`la descripción quedaría en ${nueva.length} caracteres (máximo de ML: ${MAX_DESCRIPCION}); usá menos preguntas`);
  return nueva;
}

/** Trae las preguntas RESPONDIDAS de una publicación (hasta `maximo`). */
export async function preguntasRespondidas(c, itemId, { maximo = 200 } = {}) {
  const todas = [];
  for (let offset = 0; offset < maximo; offset += 50) {
    const r = await c.get('/questions/search', { item: itemId, status: 'ANSWERED', limit: 50, offset, sort_fields: 'date_created', sort_types: 'DESC', api_version: 4 });
    const lote = r.questions || [];
    todas.push(...lote);
    if (lote.length < 50 || todas.length >= (r.total ?? Infinity)) break;
  }
  return todas;
}
