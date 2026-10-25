// src/nichos.js — descubrir nichos con la API OFICIAL de MercadoLibre (sin planillas de terceros).
//
// Para una búsqueda o una categoría toma una muestra de publicaciones y responde:
//   · rotación: cuánto vende por mes cada publicación (vendidos ÷ antigüedad), de mayor a menor
//   · ¿se vende HOY o vendió en el pasado?: visitas recientes contra su promedio histórico
//   · ¿oportunidad o monopolio?: cómo se reparten las ventas entre vendedores (líder, top 3, HHI)
//   · techo de demanda: unidades por mes del nicho y cuánto vende hoy alguien que recién entra
//   · tendencia, estacional o evergreen: tendencias de búsqueda + curva de visitas de 5 meses
//   · ¿cierran los números?: precio de mercado contra TU costo (comisión real de ML, impuestos)
// Todo sale de la API; lo que ML no informa (ventas exactas de terceros) se dice "estimado" o no se dice.

const DIA = 86400000, MES = 30 * DIA;
const sinAcentos = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mediana = (xs) => { const a = xs.filter((n) => Number.isFinite(n)).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const percentil = (xs, p) => { const a = xs.filter((n) => Number.isFinite(n)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : null; };

// Fechas que mueven la demanda (Argentina y la región): meses en los que pica
export const ESTACIONES = [
  { meses: [11, 12], palabras: ['navidad', 'navideno', 'arbolito', 'pesebre', 'papa noel', 'guirnalda'] },
  { meses: [12, 1, 2], palabras: ['pileta', 'piscina', 'inflable', 'ventilador', 'protector solar', 'malla', 'sombrilla', 'reposera', 'aire acondicionado', 'conservadora', 'repelente'] },
  { meses: [5, 6, 7, 8], palabras: ['estufa', 'caloventor', 'calefactor', 'frazada', 'acolchado', 'campera', 'bufanda', 'guantes', 'bolsa de agua caliente', 'panel calefactor', 'termica'] },
  { meses: [2, 3], palabras: ['mochila', 'utiles', 'cartuchera', 'guardapolvo', 'escolar', 'lapicera', 'cuaderno'] },
  { meses: [6], palabras: ['dia del padre'] }, { meses: [10], palabras: ['dia de la madre', 'halloween', 'disfraz'] },
  { meses: [8], palabras: ['dia del nino', 'dia de las infancias'] }, { meses: [2], palabras: ['san valentin', 'enamorados'] },
];
export function estacionDe(texto) {
  const t = ' ' + sinAcentos(texto) + ' ';
  return ESTACIONES.find((e) => e.palabras.some((p) => t.includes(' ' + p) || t.includes(p + ' '))) || null;
}

// ───────────────────────────── Datos (API oficial) ─────────────────────────────
/** Muestra de publicaciones de una búsqueda o categoría, con antigüedad, vendidos, vendedor y visitas totales. */
export async function muestraDeMercado(c, sitio, { q, categoria, muestra = 100 } = {}) {
  const tope = Math.min(Math.max(20, Math.round(muestra)), 300);
  const vistos = new Map(); let total = 0;
  for (let offset = 0; offset < tope; offset += 50) {
    const r = await c.get(`/sites/${sitio}/search`, { ...(q ? { q } : {}), ...(categoria ? { category: categoria } : {}), limit: Math.min(50, tope - offset), offset });
    total = r.paging?.total ?? total;
    const lote = r.results || [];
    for (const x of lote) if (x?.id && !vistos.has(x.id)) vistos.set(x.id, x);
    if (lote.length < 50) break;
  }
  const ids = [...vistos.keys()];
  // Detalle (antigüedad y vendidos) de a 20, como permite el multiget
  const det = {};
  for (let i = 0; i < ids.length; i += 20) {
    try {
      const m = await c.get('/items', { ids: ids.slice(i, i + 20).join(','), attributes: 'id,date_created,start_time,sold_quantity,seller_id,price,official_store_id,catalog_product_id,listing_type_id' });
      for (const r of Array.isArray(m) ? m : []) if (r?.code === 200 && r.body?.id) det[r.body.id] = r.body;
    } catch {}
  }
  // Visitas totales de a 50
  const visitas = {};
  for (let i = 0; i < ids.length; i += 50) {
    try { Object.assign(visitas, await c.get('/visits/items', { ids: ids.slice(i, i + 50).join(',') })); } catch {}
  }
  const items = ids.map((id) => {
    const s = vistos.get(id), d = det[id] || {};
    const inicio = Date.parse(d.start_time || d.date_created || s.start_time || '') || null;
    const vendidos = d.sold_quantity ?? s.sold_quantity;
    return { id, titulo: s.title || id, precio: s.price ?? d.price ?? null, vendidos: Number.isFinite(vendidos) ? vendidos : null, inicio,
      vendedor: { id: String(s.seller?.id ?? d.seller_id ?? '?'), nick: s.seller?.nickname || String(s.seller?.id ?? d.seller_id ?? '?') },
      envioGratis: !!s.shipping?.free_shipping, full: s.shipping?.logistic_type === 'fulfillment', catalogo: !!(s.catalog_product_id || d.catalog_product_id),
      tiendaOficial: !!(s.official_store_id || d.official_store_id), visitasTotal: Number.isFinite(visitas[id]) ? visitas[id] : null };
  });
  return { total, items };
}

/** Curva de visitas de las publicaciones que más rotan: 5 tramos de 30 días (del más viejo al más nuevo). */
export async function pulsoDeVisitas(c, ids, { dias = 150, ahora = Date.now() } = {}) {
  const tramos = [0, 0, 0, 0, 0], porItem = {};
  for (const id of ids) {
    let r; try { r = await c.get(`/items/${id}/visits/time_window`, { last: dias, unit: 'day' }); } catch { continue; }
    const filas = Array.isArray(r?.results) ? r.results : [];
    if (!filas.length) continue;
    const t = [0, 0, 0, 0, 0];
    for (const f of filas) {
      const k = Math.floor((ahora - Date.parse(f.date)) / MES);
      if (k >= 0 && k < 5) t[4 - k] += f.total || 0;
    }
    porItem[id] = t; t.forEach((v, i) => { tramos[i] += v; });
  }
  return { tramos, porItem, medidos: Object.keys(porItem).length };
}

// ───────────────────────────── Análisis (puro, testeable) ─────────────────────────────
/**
 * @param {object[]} items  de muestraDeMercado
 * @param {object}   o      { ahora, enTendencias, pulso, palabra, total }
 */
export function analizarNicho(items, { ahora = Date.now(), enTendencias = false, pulso = null, palabra = '', total = null } = {}) {
  const conDatos = items.filter((x) => x.vendidos != null && x.inicio);
  const cobertura = items.length ? conDatos.length / items.length : 0;
  for (const x of items) {
    x.dias = x.inicio ? Math.max(1, Math.round((ahora - x.inicio) / DIA)) : null;
    x.rotacion = x.vendidos != null && x.dias ? (x.vendidos / Math.max(x.dias, 15)) * 30 : null; // unidades/mes (mínimo 15 días para no inflar las recién nacidas)
  }
  const ranking = [...items].filter((x) => x.rotacion != null).sort((a, b) => b.rotacion - a.rotacion);
  const demandaMes = ranking.reduce((s, x) => s + x.rotacion, 0);

  // ¿Oportunidad o monopolio? Cuota de ventas por vendedor (si ML no informa ventas, por presencia en el top)
  const cuota = new Map();
  for (const x of items) cuota.set(x.vendedor.id, { nick: x.vendedor.nick, v: (cuota.get(x.vendedor.id)?.v || 0) + (demandaMes > 0 ? (x.rotacion || 0) : 1), oficial: x.tiendaOficial || cuota.get(x.vendedor.id)?.oficial });
  const base = [...cuota.values()].reduce((s, x) => s + x.v, 0) || 1;
  const vendedores = [...cuota.values()].map((x) => ({ ...x, pct: (x.v / base) * 100 })).sort((a, b) => b.pct - a.pct);
  const conVentas = vendedores.filter((x) => x.v > 0);
  const hhi = Math.round(vendedores.reduce((s, x) => s + x.pct * x.pct, 0));
  const top1 = vendedores[0]?.pct ?? 0, top3 = vendedores.slice(0, 3).reduce((s, x) => s + x.pct, 0);
  // Con pocos vendedores el índice HHI sube aunque estén parejos: para monopolio, además, el líder tiene que pesar
  const competencia = top1 >= 50 || (hhi >= 2500 && top1 >= 35) ? 'monopolio' : top1 >= 30 || top3 >= 70 ? 'peleado' : 'repartido';

  // Los que entraron hace poco y ya venden: la prueba de que hay lugar
  const nuevos = ranking.filter((x) => x.dias <= 90 && x.vendidos > 0);
  const rotNuevo = mediana(nuevos.map((x) => x.rotacion));
  const paraUnNuevo = rotNuevo ?? (conVentas.length ? demandaMes / (conVentas.length + 1) * 0.5 : null);

  // ¿Se vende hoy? Curva de visitas de los que más rotan
  let curva = null;
  if (pulso?.medidos) {
    const t = pulso.tramos, previos = (t[0] + t[1] + t[2] + t[3]) / 4;
    const cambio = previos ? ((t[4] - previos) / previos) * 100 : null;
    const max = Math.max(...t), min = Math.min(...t);
    curva = { tramos: t, cambio, variacion: min ? max / min : (max ? Infinity : 1), medidos: pulso.medidos };
  }
  // Vigencia por publicación: visitas del último mes contra su promedio mensual histórico
  const vigencia = (x) => {
    const t = pulso?.porItem?.[x.id];
    if (!t || !x.visitasTotal || !x.dias) return null;
    const promedio = x.visitasTotal / Math.max(1, x.dias / 30);
    return promedio ? t[4] / promedio : null;
  };
  for (const x of ranking.slice(0, 15)) x.vigencia = vigencia(x);
  const historicas = ranking.filter((x) => x.vigencia != null && x.vigencia < 0.35 && x.dias > 540);

  // Tendencia, estacional o evergreen
  const est = estacionDe(palabra);
  let tipo;
  // Estacional: por la palabra, o una curva que sube y baja (pico en el medio). Una caída sostenida es "en baja", no estación.
  const picoAlMedio = curva && curva.variacion >= 2.5 && [1, 2, 3].includes(curva.tramos.indexOf(Math.max(...curva.tramos)));
  if (est || picoAlMedio) tipo = 'estacional';
  else if (enTendencias || (curva?.cambio != null && curva.cambio >= 30)) tipo = 'tendencia';
  else if (curva?.cambio != null && curva.cambio <= -35) tipo = 'en baja';
  else tipo = 'evergreen';

  // Puntaje 0-100 (sin el margen, que entra aparte si hay costo)
  const pDemanda = Math.min(30, demandaMes > 0 ? (Math.log10(demandaMes + 1) / 4) * 30 : 0);
  const pReparto = competencia === 'repartido' ? 30 : competencia === 'peleado' ? 15 : 3;
  const pNuevos = Math.min(15, nuevos.length * 5);
  const pMomento = tipo === 'tendencia' ? 15 : tipo === 'evergreen' ? 10 : tipo === 'estacional' ? 7 : 0;
  const puntaje = Math.round(pDemanda + pReparto + pNuevos + pMomento - (historicas.length >= 3 ? 10 : 0));
  return { total, muestra: items.length, cobertura, ranking, demandaMes, vendedores, conVentas: conVentas.length, hhi, top1, top3, competencia, nuevos, rotNuevo, paraUnNuevo, curva, historicas, tipo, estacion: est, puntaje: Math.max(0, Math.min(100, puntaje)),
    precios: { min: percentil(items.map((x) => x.precio), 0), p25: percentil(items.map((x) => x.precio), 0.25), mediana: mediana(items.map((x) => x.precio)), max: percentil(items.map((x) => x.precio), 1) },
    envioGratisPct: items.length ? Math.round((items.filter((x) => x.envioGratis).length / items.length) * 100) : 0,
    fullPct: items.length ? Math.round((items.filter((x) => x.full).length / items.length) * 100) : 0 };
}

export function senal(a) {
  if (a.puntaje >= 65) return '🟢 oportunidad';
  if (a.puntaje >= 40) return '🟡 entrar diferenciado';
  return '🔴 descartar';
}
