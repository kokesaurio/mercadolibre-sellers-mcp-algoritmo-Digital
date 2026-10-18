// src/agenda.js — la agenda comercial: fechas cruciales + el cronograma de promociones de
// MercadoLibre + tus decisiones (¿participás o no?). La usa Clara, del equipo de trabajadores.
//
// Regla de oro: NUNCA se inscribe nada sola. Por cada campaña o fecha pregunta "¿querés
// participar?" y vuelve a preguntar en cada recordatorio hasta que decidas.

const DIA = 86400000;

// ───────────────────────────── Calendario comercial ─────────────────────────────
const fechaLocal = (a, m, d) => new Date(a, m, d, 12, 0, 0); // mediodía: sin saltos por huso
function enesimoDia(a, mes, diaSemana, n) { // n-ésimo domingo/lunes/... del mes
  const p = new Date(a, mes, 1, 12);
  return fechaLocal(a, mes, 1 + ((diaSemana - p.getDay() + 7) % 7) + (n - 1) * 7);
}
function pascua(a) { // algoritmo anónimo gregoriano
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25);
  const h = (19 * b + c - Math.floor(c / 4) - Math.floor((c - g + 1) / 3) + 15) % 30, i = Math.floor(d / 4), k = d % 4;
  const l = (32 + 2 * f + 2 * i - h - k) % 7, m = Math.floor((b + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1, dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fechaLocal(a, mes, dia);
}
const blackFriday = (a) => new Date(enesimoDia(a, 10, 4, 4).getTime() + DIA);
const DOM = 0, LUN = 1, VIE = 5;

const COMUNES = {
  navidad: { nombre: 'Navidad', regla: (a) => fechaLocal(a, 11, 25), consejo: 'regalos: kits, packs y envío que llegue antes del 24' },
  reyes: { nombre: 'Reyes', regla: (a) => fechaLocal(a, 0, 6), consejo: 'juguetes y regalos chicos' },
  san_valentin: { nombre: 'San Valentín', regla: (a) => fechaLocal(a, 1, 14), consejo: 'regalos de pareja y combos' },
  black_friday: { nombre: 'Black Friday', regla: blackFriday, dias: 4, consejo: 'descuentos fuertes; muchos compradores comparan precio' },
};
export const CALENDARIOS = {
  MLA: {
    ...COMUNES,
    vuelta_cole: { nombre: 'Vuelta a clases', regla: (a) => fechaLocal(a, 1, 20), estimada: true, temporada: true, consejo: 'útiles, mochilas, termos y viandas' },
    dia_mujer: { nombre: 'Día de la Mujer', regla: (a) => fechaLocal(a, 2, 8), consejo: 'regalos y bienestar' },
    pascuas: { nombre: 'Pascuas', regla: pascua, consejo: 'chocolates, decoración y juguetes' },
    hot_sale: { nombre: 'Hot Sale', regla: (a) => enesimoDia(a, 4, LUN, 2), dias: 3, estimada: true, consejo: 'el evento grande del primer semestre: stock, precio y publicidad listos 1 semana antes' },
    dia_padre: { nombre: 'Día del Padre', regla: (a) => enesimoDia(a, 5, DOM, 3), consejo: 'tecnología, herramientas, mate y asado' },
    dia_amigo: { nombre: 'Día del Amigo', regla: (a) => fechaLocal(a, 6, 20), consejo: 'regalos chicos y combos para compartir' },
    dia_infancias: { nombre: 'Día de las Infancias', regla: (a) => enesimoDia(a, 7, DOM, 3), consejo: 'juguetes y juegos: la fecha más fuerte del rubro' },
    dia_madre: { nombre: 'Día de la Madre', regla: (a) => enesimoDia(a, 9, DOM, 3), consejo: 'una de las fechas de más venta del año' },
    cybermonday: { nombre: 'CyberMonday', regla: (a) => enesimoDia(a, 10, LUN, 1), dias: 3, estimada: true, consejo: 'el evento grande del segundo semestre: stock, precio y publicidad listos 1 semana antes' },
  },
  MLM: {
    ...COMUNES,
    dia_nino: { nombre: 'Día del Niño', regla: (a) => fechaLocal(a, 3, 30), consejo: 'juguetes y juegos' },
    dia_madres: { nombre: 'Día de las Madres', regla: (a) => fechaLocal(a, 4, 10), consejo: 'la fecha de más venta del semestre' },
    dia_padre: { nombre: 'Día del Padre', regla: (a) => enesimoDia(a, 5, DOM, 3), consejo: 'tecnología y herramientas' },
    buen_fin: { nombre: 'El Buen Fin', regla: (a) => new Date(enesimoDia(a, 10, LUN, 3).getTime() - 3 * DIA), dias: 4, estimada: true, consejo: 'el evento grande del año en México' },
  },
  MLB: {
    ...COMUNES,
    dia_maes: { nombre: 'Dia das Mães', regla: (a) => enesimoDia(a, 4, DOM, 2), consejo: 'a segunda maior data do varejo' },
    namorados: { nombre: 'Dia dos Namorados', regla: (a) => fechaLocal(a, 5, 12), consejo: 'presentes para casais' },
    dia_pais: { nombre: 'Dia dos Pais', regla: (a) => enesimoDia(a, 7, DOM, 2), consejo: 'tecnologia e ferramentas' },
    criancas: { nombre: 'Dia das Crianças', regla: (a) => fechaLocal(a, 9, 12), consejo: 'brinquedos e jogos' },
  },
  OTROS: {
    ...COMUNES,
    dia_madre: { nombre: 'Día de la Madre', regla: (a) => enesimoDia(a, 4, DOM, 2), consejo: 'una de las fechas de más venta del año' },
    dia_padre: { nombre: 'Día del Padre', regla: (a) => enesimoDia(a, 5, DOM, 3), consejo: 'tecnología, herramientas y regalos' },
  },
};
const calendarioDe = (sitio) => CALENDARIOS[sitio] || CALENDARIOS.OTROS;

/**
 * Fechas comerciales entre hoy y hoy+dias. `confirmadas` = { 'hot_sale:2027': '2027-05-10' }
 * (fechas que el vendedor corrigió) y `propias` = [{ id, nombre, fecha:'YYYY-MM-DD', consejo }].
 */
export function fechasComerciales(sitio = 'MLA', { desde = Date.now(), dias = 60, confirmadas = {}, propias = [] } = {}) {
  const hoy = new Date(desde); hoy.setHours(0, 0, 0, 0);
  const hasta = hoy.getTime() + dias * DIA;
  const out = [];
  for (const anio of [hoy.getFullYear(), hoy.getFullYear() + 1]) {
    for (const [id, f] of Object.entries(calendarioDe(sitio))) {
      const clave = `${id}:${anio}`;
      const conf = confirmadas[clave];
      const inicio = conf ? new Date(conf + 'T12:00:00') : f.regla(anio);
      const fin = new Date(inicio.getTime() + ((f.dias || 1) - 1) * DIA);
      if (fin.getTime() < hoy.getTime() || inicio.getTime() > hasta) continue;
      out.push({ clave, id, nombre: f.nombre, inicio, fin, estimada: !!f.estimada && !conf, temporada: !!f.temporada, consejo: f.consejo, origen: 'calendario' });
    }
  }
  for (const p of propias) {
    const inicio = new Date(p.fecha + 'T12:00:00');
    if (inicio.getTime() < hoy.getTime() || inicio.getTime() > hasta) continue;
    out.push({ clave: `propia:${p.id}`, id: p.id, nombre: p.nombre, inicio, fin: inicio, estimada: false, consejo: p.consejo || 'fecha propia de tu negocio', origen: 'propia' });
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

export const diasHasta = (fecha, desde = Date.now()) => {
  const h = new Date(desde); h.setHours(0, 0, 0, 0);
  const f = new Date(fecha); f.setHours(0, 0, 0, 0);
  return Math.round((f - h) / DIA);
};

// ───────────────────────────── Cronograma de MercadoLibre ─────────────────────────────
const TIPOS = {
  DEAL: 'Campaña de MercadoLibre', MARKETPLACE_CAMPAIGN: 'Campaña de MercadoLibre (con aporte de ML)', DOD: 'Oferta del día', LIGHTNING: 'Oferta relámpago',
  PRICE_DISCOUNT: 'Descuento por ítem', VOLUME: 'Descuento por volumen', SELLER_CAMPAIGN: 'Campaña propia', SMART: 'Campaña automática (co-fondeada)',
  PRICE_MATCHING: 'Precio competitivo', PRE_NEGOTIATED: 'Descuento pre-acordado', SELLER_COUPON_CAMPAIGN: 'Cupón propio', UNHEALTHY_STOCK: 'Liquidación de stock FULL',
};
export const tipoLegible = (t) => TIPOS[t] || t || 'Promoción';
const fecha = (x) => (x ? Date.parse(x) || null : null);

/** Las campañas que ML le ofrece al vendedor, con sus candidatas y si ya participa. */
export async function cronogramaML(c, sellerId, { maximo = 15 } = {}) {
  const r = await c.get(`/seller-promotions/users/${sellerId}`, { app_version: 'v2' });
  const promos = {};
  for (const p of (r.results || []).filter((x) => x.status !== 'finished').slice(0, maximo)) {
    let candidatas = null, participando = 0, descuentoMax = null;
    try {
      const it = await c.get(`/seller-promotions/promotions/${p.id}/items`, { promotion_type: p.type, app_version: 'v2', limit: 50 });
      const items = it.results || [];
      candidatas = it.paging?.total ?? items.length;
      const dentro = items.filter((i) => ['started', 'pending', 'active'].includes(i.status));
      participando = dentro.length;
      for (const i of dentro) {
        const o = i.original_price, f = i.price ?? i.deal_price;
        if (o && f && o > f) descuentoMax = Math.max(descuentoMax ?? 0, Math.round((1 - f / o) * 100));
      }
    } catch {}
    promos[p.id] = {
      id: p.id, nombre: p.name || tipoLegible(p.type), tipo: p.type, estado: p.status,
      inicio: fecha(p.start_date), fin: fecha(p.finish_date), cierre: fecha(p.deadline_date),
      candidatas, participando, descuentoMax,
    };
  }
  return promos;
}

// ───────────────────────────── Decisiones del vendedor ─────────────────────────────
export function decisionDe(agenda, clave) { return agenda?.decisiones?.[clave] || null; }
export function estadoDecision(agenda, clave, promo) {
  const d = decisionDe(agenda, clave);
  if (d) return d.participar ? 'si' : 'no';
  if (promo?.participando > 0) return 'si'; // ya inscribió publicaciones: decidió que sí
  return 'pendiente';
}
export const ICONO_DECISION = { si: '✅ participás', no: '🚫 no participás', pendiente: '❓ falta que decidas' };
