// src/auditoria.js — la auditoría de UNA publicación propia, compartida por
// ml_auditar_publicaciones (a pedido) y por Lucía, la auditora del equipo (cada 15 días).
//
// Dos familias de chequeos:
//   · calidad: título, fotos, descripción, envío, stock, estado, tipo, video, catálogo
//   · ¿está ACTUALIZADA?: días sin tocar, precio congelado (con la base de datos),
//     precio fuera de mercado, fotos de baja resolución, marca/modelo y garantía cargados

import { faltantes, preguntasRespondidas, quitarBloque } from './faq.js';
import { revisarDescripcion } from './mejorador.js';

const DIAS = 86400000;
export const SIN_TOCAR_DIAS = 60;       // publicación sin ningún cambio hace más de esto → desactualizada
export const PRECIO_CONGELADO_DIAS = 45; // precio idéntico en todas las auditorías de este período
const dinero = (n) => '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const mediana = (xs) => { const a = xs.filter((n) => n > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

// Lado más chico de la foto más grande que ML tiene ("1200x1200" → 1200)
function resolucion(p) {
  const m = String(p?.max_size || p?.size || '').match(/(\d+)x(\d+)/);
  return m ? Math.min(Number(m[1]), Number(m[2])) : null;
}

/** Busca el precio mediano del mercado para el título (sin contar mis propias publicaciones). */
export async function precioMercado(c, sitio, titulo, miSellerId) {
  const q = String(titulo || '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  if (!q) return null;
  const r = await c.get(`/sites/${sitio}/search`, { q, limit: 20 });
  const ajenos = (r.results || []).filter((x) => String(x.seller?.id ?? '') !== String(miSellerId));
  const med = mediana(ajenos.map((x) => x.price));
  return med ? { mediana: med, muestras: ajenos.length } : null;
}

/**
 * Audita una publicación ya traída de /items/{id}.
 * @param {object} o
 * @param {object} o.b              el item de ML
 * @param {string|null} o.desc      descripción (plain_text)
 * @param {object|null} o.ptw       price_to_win (si es de catálogo)
 * @param {object|null} o.mercado   { mediana, muestras } de precioMercado
 * @param {number|null} o.precioSinCambiosDesde  timestamp desde el que el precio está igual (base de datos)
 * @returns {{ semaforo, problemas: {codigo, texto, grupo}[], precio, ultimaEdicion, diasSinTocar }}
 */
export function evaluar({ b, desc, ptw = null, mercado = null, precioSinCambiosDesde = null, faq = null, ahora = Date.now() }) {
  const P = [];
  const add = (codigo, grupo, texto) => P.push({ codigo, grupo, texto });
  const titulo = b.title || '';
  // ── calidad ──
  if (titulo.length < 40) add('titulo_corto', 'calidad', `título corto (${titulo.length}/60): sumale marca, modelo y atributo clave`);
  if (/env[ií]o gratis|oferta|promo|!!|aprovech/i.test(titulo)) add('titulo_relleno', 'calidad', 'título con relleno prohibido (oferta/envío gratis): ML lo ignora y penaliza — dejá solo producto+marca+modelo+atributos');
  if ((b.pictures?.length ?? 0) < 3) add('pocas_fotos', 'calidad', `solo ${b.pictures?.length ?? 0} foto(s): subí a 6+ (fondo blanco la primera, uso real después)`);
  if (!desc || desc.trim().length < 200) add('sin_descripcion', 'calidad', 'descripción vacía o muy corta: agregá qué incluye, medidas, compatibilidades y preguntas frecuentes');
  if (desc && desc.trim().length >= 200) {
    const fallas = revisarDescripcion(quitarBloque(desc), titulo).chequeos.filter((x) => !x.ok);
    const NOMBRE = { resumen: 'resumen en los 5 primeros renglones', medidas: 'medidas', caracteristicas: 'características principales', incluye: 'qué viene en la caja', orden: 'orden' };
    if (fallas.length) add('descripcion_estructura', 'calidad', `descripción sin la estructura que convierte (falla: ${fallas.map((x) => NOMBRE[x.id]).join(', ')}): resumen arriba, después medidas, características y qué viene — arreglala con el mejorador (ml_mejorar_publicacion)`);
  }
  if (!b.shipping?.free_shipping) add('sin_envio_gratis', 'calidad', 'sin envío gratis: las publicaciones con envío gratis posicionan y convierten mejor (evaluá absorberlo en el precio)');
  if ((b.available_quantity ?? 0) === 0) add('sin_stock', 'calidad', 'SIN STOCK: repone o pausá — sin stock pierde posicionamiento');
  else if ((b.available_quantity ?? 0) < 3) add('stock_critico', 'calidad', `stock crítico (${b.available_quantity}): si se corta, la publicación pierde posicionamiento histórico`);
  if (b.status && b.status !== 'active') add('no_activa', 'calidad', `está ${b.status}: no vende hasta reactivarla`);
  if (b.listing_type_id === 'free' || b.listing_type_id === 'bronze') add('tipo_bajo', 'calidad', `tipo ${b.listing_type_id}: casi sin exposición — pasala a Clásica o Premium`);
  if (!b.video_id) add('sin_video', 'calidad', 'sin video: las publicaciones con video convierten más — generá uno con la skill video-publicaciones-ml o ugc-ml');
  if (ptw?.status && ptw.status !== 'winning') add('pierde_catalogo', 'calidad', `perdiendo el catálogo: ganás con ${ptw.price_to_win != null ? dinero(ptw.price_to_win) : 'mejor precio/envío'} (validar margen antes)`);

  // ── ¿está actualizada? ──
  const editada = Date.parse(b.last_updated || b.date_created || '') || null;
  const diasSinTocar = editada ? Math.floor((ahora - editada) / DIAS) : null;
  if (diasSinTocar != null && diasSinTocar >= SIN_TOCAR_DIAS) add('sin_actualizar', 'actualizada', `sin actualizar hace ${diasSinTocar} días: ML premia las publicaciones vivas — revisá precio, stock, fotos y preguntas frecuentes en la descripción`);
  if (precioSinCambiosDesde && ahora - precioSinCambiosDesde >= PRECIO_CONGELADO_DIAS * DIAS) add('precio_congelado', 'actualizada', `precio sin cambios hace ${Math.floor((ahora - precioSinCambiosDesde) / DIAS)} días (${dinero(b.price)}): confirmá que siga cubriendo tus costos actuales con la calculadora-ml`);
  if (mercado?.mediana && b.price && mercado.muestras >= 3) {
    const dif = ((b.price - mercado.mediana) / mercado.mediana) * 100;
    if (dif > 15) add('precio_alto', 'actualizada', `precio ${dif.toFixed(0)}% arriba del mercado (mediana ${dinero(mercado.mediana)} en ${mercado.muestras} publicaciones): revisá si tu diferencial lo justifica`);
    else if (dif < -25) add('precio_bajo', 'actualizada', `precio ${Math.abs(dif).toFixed(0)}% abajo del mercado (mediana ${dinero(mercado.mediana)}): ¿estás dejando plata en la mesa? validalo con la calculadora-ml`);
  }
  if (faq?.length) {
    const ej = faq.slice(0, 2).map((g) => `«${g.pregunta}» (${g.veces} veces)`).join(', ');
    add('faq_faltante', 'actualizada', `${faq.length} pregunta(s) que te hacen seguido no están en la descripción: ${ej}${faq.length > 2 ? '…' : ''} — sumalas como preguntas frecuentes con TUS respuestas (ml_faq_descripcion) y vas a recibir menos preguntas repetidas`);
  }
  const res = (b.pictures || []).map(resolucion).filter((n) => n != null);
  const chicas = res.filter((n) => n < 800).length;
  if (chicas) add('fotos_baja_resolucion', 'actualizada', `${chicas} foto(s) de baja resolución (menos de 800 px): ML no les activa el zoom — rehacelas en 1200×1200 (skill imagenes-ml)`);
  const atributo = (id) => (b.attributes || []).find((a) => a.id === id && a.value_name && !/^(gen[eé]rica?|sin marca|otro|otros|n\/?a)$/i.test(a.value_name.trim()));
  const faltan = ['BRAND', 'MODEL'].filter((id) => !atributo(id)).map((id) => (id === 'BRAND' ? 'marca' : 'modelo'));
  if (faltan.length) add('faltan_atributos', 'actualizada', `falta cargar ${faltan.join(' y ')} en la ficha técnica: sin eso la publicación no aparece en los filtros de búsqueda`);
  if (!(b.sale_terms || []).some((t) => t.id === 'WARRANTY_TYPE' || t.id === 'WARRANTY_TIME')) add('sin_garantia', 'actualizada', 'sin garantía declarada: cargala (aunque sea "garantía del vendedor 30 días") — da confianza y la pide la ficha');

  // Lo más grave primero: es lo que se muestra como "principal problema"
  const PRIORIDAD = ['sin_stock', 'no_activa', 'pierde_catalogo', 'titulo_relleno', 'sin_actualizar', 'precio_alto', 'precio_bajo', 'precio_congelado', 'stock_critico', 'pocas_fotos', 'fotos_baja_resolucion', 'faltan_atributos', 'sin_descripcion', 'descripcion_estructura', 'faq_faltante', 'titulo_corto', 'tipo_bajo', 'sin_envio_gratis', 'sin_garantia', 'sin_video'];
  P.sort((x, y) => PRIORIDAD.indexOf(x.codigo) - PRIORIDAD.indexOf(y.codigo));
  const graves = P.filter((p) => ['sin_stock', 'no_activa', 'pierde_catalogo', 'titulo_relleno'].includes(p.codigo)).length;
  const semaforo = P.length === 0 ? '🟢' : graves || P.length >= 4 ? '🔴' : '🟡';
  return { semaforo, problemas: P, precio: b.price ?? null, ultimaEdicion: editada, diasSinTocar };
}

/** Trae lo necesario de ML y audita una publicación. */
export async function auditarItem(c, itemId, { sitio = 'MLA', sellerId, precioSinCambiosDesde = null, conMercado = true, conPreguntas = true, b: yaTraido } = {}) {
  const b = yaTraido || (await c.get(`/items/${itemId}`));
  let desc = null; try { desc = (await c.get(`/items/${itemId}/description`)).plain_text; } catch {}
  let ptw = null;
  if (b.catalog_listing) { try { ptw = await c.get(`/items/${itemId}/price_to_win`, { version: 'v2' }); } catch {} }
  let mercado = null;
  if (conMercado) { try { mercado = await precioMercado(c, sitio, b.title, sellerId); } catch {} }
  let faq = null;
  if (conPreguntas) { try { faq = faltantes(await preguntasRespondidas(c, itemId, { maximo: 100 }), desc || ''); } catch {} }
  return { id: itemId, titulo: b.title || itemId, faq, ...evaluar({ b, desc, ptw, mercado, precioSinCambiosDesde, faq }) };
}

/** Todos los item_id de un estado (paginado, hasta `maximo`). */
export async function idsDeTienda(c, sellerId, { estado = 'active', maximo = 300 } = {}) {
  const ids = [];
  for (let offset = 0; offset < maximo; offset += 50) {
    const r = await c.get(`/users/${sellerId}/items/search`, { status: estado, limit: 50, offset });
    const lote = r.results || [];
    ids.push(...lote);
    if (lote.length < 50 || ids.length >= (r.paging?.total ?? Infinity)) break;
  }
  return [...new Set(ids)].slice(0, maximo);
}
