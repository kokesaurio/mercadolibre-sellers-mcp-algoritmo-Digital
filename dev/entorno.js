// dev/entorno.js — MercadoLibre simulado + suite de pruebas.
//   npm run dev  → levanta la API de ML simulada en :9990 para probar a mano
//   npm test     → corre la suite completa contra el simulado y sale != 0 si algo falla
// Diseñado para desarrollar el repo entero dentro del entorno de Claude, sin cuenta real.

import express from 'express';
import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PUERTO = Number(process.env.MOCK_PORT || 9990);
let refrescosHechos = 0;
let demoraRefresh = 0;
const planilla = { recibidos: [], respuestas: [], clave: null }; // Apps Script simulado
const descripciones = {}; const descripcionesPut = [];
const envios = {
  101: { status: 'shipped', substatus: 'in_transit', tracking_number: 'TRK123', logistic_type: 'fulfillment', receiver_address: { state: { name: 'Buenos Aires' } } },
  102: { status: 'ready_to_ship', substatus: 'ready_to_print', logistic_type: 'self_service', receiver_address: { state: { name: 'Capital Federal' } }, shipping_option: { estimated_handling_limit: { date: new Date(Date.now() + 5 * 3600000).toISOString() } } },
  100: { status: 'delivered', logistic_type: 'cross_docking', receiver_address: { state: { name: 'Santa Fe' } } },
  103: { status: 'delivered', logistic_type: 'cross_docking', receiver_address: { state: { name: 'Córdoba' } } },
};
let campaniasML = [{ id: 'C1', name: 'Campaña general', status: 'active', budget: 5000, metrics: { cost: 30000, acos: 15, units_quantity: 25, total_amount: 200000 } }];
let demoraRate = 0.02;
const itemsPorEstado = { active: ['MLA111', 'MLA222'], under_review: [], paused: [], inactive: [] };
let activos888 = null; const porSkuDeTienda = {}; // multicuenta: publicaciones de la segunda tienda y búsqueda por SKU
let portadaPobre = [];
let ptwMLA111 = { status: 'competing', current_price: 42000, price_to_win: 39900, boosts: [{ id: 'fulfillment' }] };
let preguntasPend = [{ id: 555, item_id: 'MLA111', text: '¿Tenés stock?', date_created: new Date(Date.now() - 10 * 60000).toISOString() }];
let mensajesPend = [];
let reclamosML = [];
const opinionesML = { MLA111: { rating_average: 4.6, paging: { total: 12 }, reviews: [{ id: 1, rate: 5, title: 'Excelente', content: 'Mantiene el calor todo el día', date_created: new Date(Date.now() - 5 * 86400000).toISOString() }] } };
const paginasProveedor = { termo: { precio: '25000', disponible: 'https://schema.org/InStock' } };
const enDias = (d) => new Date(Date.now() + d * 86400000).toISOString();
const promosML = [{ id: 'P-HOT', name: 'Hot Sale', type: 'DEAL', status: 'candidate', start_date: enDias(10), finish_date: enDias(13), deadline_date: enDias(8) }];
const promoItems = { 'P-HOT': [{ id: 'MLA111', original_price: 42000, suggested_discounted_price: 37800, meli_percentage: 5, status: 'candidate' }] };
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
const preguntasPorItem = {
  MLA111: [
    { id: 1, text: 'Hola! ¿Qué medidas tiene?', status: 'ANSWERED', date_created: hace(40), answer: { text: 'Hola! Mide 27 cm de alto y 8,5 cm de diámetro. Saludos!', date_created: hace(40) } },
    { id: 2, text: 'cuanto mide de alto??', status: 'ANSWERED', date_created: hace(10), answer: { text: 'Hola, buen día! Mide 27 cm de alto y 8,5 cm de diámetro. Gracias por tu consulta, quedamos a disposición', date_created: hace(10) } },
    { id: 3, text: '¿Es apto lavavajillas?', status: 'ANSWERED', date_created: hace(30), answer: { text: 'Sí, es apto lavavajillas.', date_created: hace(30) } },
    { id: 4, text: 'Se puede lavar en lavavajillas?', status: 'ANSWERED', date_created: hace(5), answer: { text: 'buenas! sí, se puede lavar en lavavajillas sin problema', date_created: hace(5) } },
    { id: 5, text: '¿Tenés stock?', status: 'ANSWERED', date_created: hace(3), answer: { text: 'Sí, hay stock disponible.', date_created: hace(3) } },
    { id: 6, text: '¿Hacen envíos a Córdoba?', status: 'ANSWERED', date_created: hace(4), answer: { text: 'Sí, enviamos a todo el país.', date_created: hace(4) } },
    { id: 7, text: '¿Viene con caja?', status: 'ANSWERED', date_created: hace(6), answer: { text: 'Escribime al 11 5555-5555 y te cuento', date_created: hace(6) } },
    { id: 8, text: '¿Viene en caja original?', status: 'ANSWERED', date_created: hace(7), answer: { text: 'Pasame tu whatsapp y te mando fotos', date_created: hace(7) } },
    { id: 9, text: '¿Tiene garantía?', status: 'ANSWERED', date_created: hace(8), answer: { text: 'Sí, 6 meses de garantía del vendedor.', date_created: hace(8) } },
    { id: 10, text: '¿Cuánto mide?', status: 'UNANSWERED', date_created: hace(1) },
  ],
}; // ms: simula un refresh lento para forzar carreras entre procesos
let ultimoItemCreado = null;
let versionRemota = '9.9.9';
let itemMLA111 = { catalog_listing: true, category_id: 'MLA1055', price: 42000, currency_id: 'ARS', available_quantity: 10, sold_quantity: 55, status: 'active', condition: 'new', listing_type_id: 'gold_special', permalink: 'https://articulo.mercadolibre.com.ar/x', pictures: [{ secure_url: 'https://http2.mlstatic.com/f1.jpg' }], attributes: [{ id: 'BRAND', value_name: 'Genérica' }], shipping: { logistic_type: 'fulfillment', free_shipping: true } };
let mercado = {
  rival: [{ id: 'R1', title: 'Termo rival 1L', price: 39999, seller: { nickname: 'RIVAL' } }],
  busqueda: [{ id: 'B1', title: 'Termo lider', price: 35000, seller: { nickname: 'LIDER' } }, { id: 'B2', title: 'Termo 2', price: 37000, seller: { nickname: 'OTRO' } }],
  tendencias: [{ keyword: 'termo stanley' }, { keyword: 'mate imperial' }],
};

// ─────────────────────── API de MercadoLibre simulada ───────────────────────
export function crearMockMeli() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const auth = (req, res, next) => {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    if (t !== 'ACCESS-VALIDO' && t !== 'ACCESS-888') return res.status(401).json({ message: 'invalid token' });
    req.usuario = t === 'ACCESS-888' ? 888 : 777;
    next();
  };

  // Apps Script simulado: POST → 302 → GET con la respuesta (igual que script.google.com)
  app.post('/macros/s/:id/exec', express.text({ type: '*/*' }), (req, res) => {
    let b = null; try { b = JSON.parse(req.body); } catch {}
    planilla.recibidos.push(b);
    planilla.respuestas.push(b && planilla.clave && b.clave === planilla.clave ? { ok: true } : { ok: false, error: 'clave' });
    res.redirect(302, '/macros/echo/' + (planilla.respuestas.length - 1));
  });
  app.get('/macros/echo/:n', (req, res) => res.json(planilla.respuestas[Number(req.params.n)]));
  app.get('/messages/unread', auth, (_q, res) => res.json({ results: mensajesPend }));
  app.get('/post-purchase/v1/claims/search', auth, (_q, res) => res.json({ paging: { total: reclamosML.length }, data: reclamosML }));
  app.get('/reviews/item/:id', auth, (req, res) => res.json(opinionesML[req.params.id] || { rating_average: null, paging: { total: 0 }, reviews: [] }));
  app.get('/proveedor/:p', (req, res) => { const p = paginasProveedor[req.params.p]; if (!p) return res.status(404).send('no'); res.send(`<html><head><title>Termo proveedor</title><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Termo acero 1L mayorista', offers: { '@type': 'Offer', price: p.precio, priceCurrency: 'ARS', availability: p.disponible } })}</script></head><body>.</body></html>`); });
  app.get('/proveedor-sin-datos', (_q, res) => res.send('<html><title>x</title><body>sin datos</body></html>'));
  app.get('/pkg-remoto', (_q, res) => res.json({ name: 'x', version: versionRemota }));
  app.post('/oauth/token', async (req, res) => {
    const b = req.body || {};
    if (b.grant_type === 'authorization_code') {
      if (!b.code_verifier) return res.status(400).json({ error_description: 'sin PKCE' });
      if (b.code === 'CODE-OK') return res.json({ access_token: 'ACCESS-VALIDO', refresh_token: 'REFRESH-1', expires_in: 21600, user_id: 777 });
      if (b.code === 'CODE-OK2') return res.json({ access_token: 'ACCESS-888', refresh_token: 'R2-1', expires_in: 21600, user_id: 888 });
      return res.status(400).json({ error_description: 'code inválido' });
    }
    if (b.grant_type === 'refresh_token') {
      refrescosHechos++;
      if (demoraRefresh) await esperar(demoraRefresh);
      if (b.refresh_token !== 'REFRESH-1' && b.refresh_token !== 'REFRESH-2') return res.status(400).json({ error_description: 'refresh inválido (¿reusado?)' });
      return res.json({ access_token: 'ACCESS-VALIDO', refresh_token: 'REFRESH-2', expires_in: 21600, user_id: 777 });
    }
    res.status(400).json({ error: 'grant no soportado' });
  });

  app.get('/users/me', auth, (req, res) => res.json({
    id: req.usuario, nickname: req.usuario === 888 ? 'TIENDA_DOS' : 'TIENDA_DEMO', site_id: 'MLA',
    seller_reputation: { level_id: '5_green', power_seller_status: 'platinum', transactions: { total: 1543 }, metrics: { claims: { rate: 0.001 }, delayed_handling_time: { rate: demoraRate }, cancellations: { rate: 0 } } },
  }));
  app.get('/orders/search', auth, (req, res) => {
    const desde = String(req.query['order.date_created.from'] || '1970-01-01');
    const hasta = String(req.query['order.date_created.to'] || '9999-12-31');
    const todas = [
      { id: 101, date_created: new Date(Date.now() - 60000).toISOString(), total_amount: 42000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { id: 'MLA111', title: 'Termo Demo 1L' }, quantity: 1, unit_price: 42000, sale_fee: 5880 }] },
      { id: 102, date_created: new Date(Date.now() - 60000).toISOString(), total_amount: 18500, currency_id: 'ARS', status: 'paid', order_items: [{ item: { id: 'MLA222', title: 'Mate Demo' }, quantity: 2, unit_price: 9250, sale_fee: 1295 }] },
      { id: 103, date_created: new Date(Date.now() - 86400000).toISOString(), total_amount: 20000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { id: 'MLA111', title: 'Termo Demo 1L' }, quantity: 1, unit_price: 20000, sale_fee: 2800 }] },
      { id: 100, date_created: new Date(Date.now() - 10 * 86400000).toISOString(), total_amount: 20000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { id: 'MLA333', title: 'Termo viejo' }, quantity: 1, unit_price: 20000, sale_fee: 2800 }] },
    ];
    const resultados = todas.filter((o) => o.date_created >= desde && o.date_created <= hasta);
    return res.json({ paging: { total: resultados.length }, results: resultados });
  });
  app.get('/orders/:id/shipments', auth, (req, res) => envios[req.params.id] ? res.json(envios[req.params.id]) : res.status(404).json({ message: 'shipment not found' }));
  app.get('/users/:uid/items/search', auth, (req, res) => {
    if (req.query.tags === 'poor_quality_thumbnail') return res.json({ paging: { total: portadaPobre.length }, results: portadaPobre });
    if (String(req.params.uid) !== String(req.usuario)) return res.status(403).json({ message: 'forbidden: no es tu cuenta' });
    if (req.query.seller_sku) { const r = (porSkuDeTienda[req.usuario] || {})[String(req.query.seller_sku)] || []; return res.json({ paging: { total: r.length }, results: r }); }
    const r = (req.usuario === 888 && activos888) || itemsPorEstado[req.query.status || 'active'] || [];
    res.json({ paging: { total: r.length }, results: r });
  });
  app.get('/items', auth, (req, res) => res.json(String(req.query.ids).split(',').map((id) => ({ code: 200, body: { id, title: 'Producto ' + id, price: 42000, currency_id: 'ARS', available_quantity: 10, sold_quantity: 55, status: 'active', permalink: 'https://articulo.mercadolibre.com.ar/' + id, catalog_listing: id === 'MLA111', ...(mercado.items?.[id] || {}) } }))));
  app.get('/items/:id', auth, (req, res) => res.json({ ...itemMLA111, id: req.params.id, title: 'Producto ' + req.params.id, ...(mercado.items?.[req.params.id] || {}) }));
  app.get('/items/:id/description', auth, (req, res) => res.json({ plain_text: descripciones[req.params.id] ?? 'Descripción original del producto.' }));
  app.put('/items/:id/description', auth, (req, res) => {
    if (typeof req.body?.plain_text !== 'string') return res.status(400).json({ message: 'falta plain_text' });
    if (req.body.plain_text.length > 50000) return res.status(400).json({ message: 'descripción demasiado larga' });
    descripciones[req.params.id] = req.body.plain_text; descripcionesPut.push({ id: req.params.id, query: req.query, texto: req.body.plain_text });
    res.json({ plain_text: req.body.plain_text });
  });
  app.post('/items', auth, (req, res) => {
    ultimoItemCreado = req.body;
    if (!req.body?.title || !req.body?.category_id) return res.status(400).json({ message: 'faltan campos' });
    res.json({ id: 'MLA999', title: req.body.title, price: req.body.price, permalink: 'https://articulo.mercadolibre.com.ar/MLA999', status: 'active' });
  });
  app.post('/items/:id/description', auth, (req, res) => res.json({ ok: true }));
  app.put('/items/:id', auth, (req, res) => res.json({ id: req.params.id, price: req.body.price ?? 42000, currency_id: 'ARS', available_quantity: req.body.available_quantity ?? 10, status: req.body.status ?? 'active' }));
  app.get('/items/:id/visits/time_window', auth, (req, res) => { const d = mercado.visitasDia?.[req.params.id]; return res.json(d ? { total_visits: d.reduce((s, x) => s + x.total, 0), results: d } : { total_visits: 340 }); });
  app.get('/visits/items', auth, (req, res) => res.json(Object.fromEntries(String(req.query.ids).split(',').filter((id) => mercado.visitasTotal?.[id] != null).map((id) => [id, mercado.visitasTotal[id]]))));
  app.get('/categories/:id', auth, (req, res) => res.json({ id: req.params.id, name: req.params.id === 'MLA5000' ? 'Organización de cocina' : 'Categoría' }));
  app.get('/items/:id/price_to_win', auth, (_q, res) => res.json(ptwMLA111));
  app.get('/questions/search', auth, (req, res) => {
    if (req.query.item) {
      const todas = (preguntasPorItem[req.query.item] || []).filter((q) => !req.query.status || q.status === req.query.status);
      const off = Number(req.query.offset || 0), lim = Number(req.query.limit || 50);
      return res.json({ total: todas.length, questions: todas.slice(off, off + lim) });
    }
    res.json({ total: preguntasPend.length, questions: preguntasPend });
  });
  app.post('/answers', auth, (req, res) => req.body?.question_id ? res.json({ ok: true }) : res.status(400).json({ message: 'falta question_id' }));
  app.get('/sites/MLA/listing_prices', auth, (_q, res) => res.json([{ listing_type_id: 'gold_special', listing_type_name: 'Clásica', sale_fee_amount: 5900, sale_fee_details: { percentage_fee: 14, fixed_fee: 0 } }]));
  app.get('/sites/MLA/search', auth, (req, res) => {
    if (req.query.nickname || req.query.seller_id) return res.json({ paging: { total: mercado.rival.length }, results: mercado.rival });
    if (req.query.q === 'termo 1 litro') return res.json({ paging: { total: mercado.busqueda.length }, results: mercado.busqueda });
    const nicho = mercado.nichos?.[req.query.q || 'cat:' + req.query.category];
    if (nicho) { const off = Number(req.query.offset || 0), lim = Number(req.query.limit || 50); return res.json({ paging: { total: nicho.length * 40 }, results: nicho.slice(off, off + lim) }); }
    return res.json({ paging: { total: 2 }, results: [{ title: 'Termo rival', price: 39999, currency_id: 'ARS', seller: { nickname: 'RIVAL' }, shipping: { free_shipping: true } }, { title: 'Termo caro', price: 52000, currency_id: 'ARS', seller: { nickname: 'OTRO' } }] });
  });
  app.get('/seller-promotions/users/777', auth, (_q, res) => res.json({ results: promosML }));
  app.get('/seller-promotions/promotions/:id/items', auth, (req, res) => { const r = promoItems[req.params.id] || []; res.json({ results: r, paging: { total: r.length } }); });
  app.post('/seller-promotions/items/:id', auth, (req, res) => req.body?.promotion_id ? res.json({ ok: true }) : res.status(400).json({ message: 'falta promotion_id' }));
  app.get('/trends/MLA', auth, (_q, res) => res.json(mercado.tendencias));
  app.get('/advertising/advertisers', auth, (_q, res) => res.json({ advertisers: [{ advertiser_id: 'ADV1', site_id: 'MLA' }] }));
  app.get('/advertising/product_ads/campaigns', auth, (req, res) => {
    // Un solo día: la inversión depende del día del mes (para probar el gráfico día por día)
    if (req.query.date_from && req.query.date_from === req.query.date_to) {
      const dia = Number(String(req.query.date_from).slice(8, 10));
      return res.json({ results: campaniasML.map((k) => ({ ...k, metrics: { cost: 1000 * dia, acos: 10, units_quantity: 2, total_amount: 10000 * dia } })) });
    }
    res.json({ results: campaniasML });
  });
  app.get('/advertising/product_ads/ads/:id', auth, (req, res) => {
    if (req.params.id !== 'MLA111') return res.status(404).json({ message: 'ad not found' });
    res.json({ metrics: { clicks: 120, prints: 8000, cost: 15000, acos: 12.5, cpc: 125, units_quantity: 10, total_amount: 420000 } });
  });
  app.get('/marketplace/items/:id/clips', auth, (req, res) => {
    if (req.params.id !== 'MLA111') return res.status(404).json({ message: 'No clips found for itemId: ' + req.params.id });
    res.json({ parent_item_id: req.params.id, clips: [
      { clip_uuid: 'clip-publicado-001', metadata: [{ site_id: 'MLA', moderation_status: 'PUBLISHED' }] },
      { clip_uuid: 'clip-revision-002', metadata: [{ site_id: 'MLA', moderation_status: 'UNDER_REVIEW' }] },
      { clip_uuid: 'clip-rechazo-003', metadata: [{ site_id: 'MLA', moderation_status: 'REJECTED', moderation_reasons: { DUPLICATED_VIDEO: 'This video had already been uploaded before.' } }] },
    ] });
  });
  // Fotos del "CDN" (sin auth, como mlstatic): una JPEG chiquita y algo que no es imagen
  app.get('/fotos/:n', (req, res) => req.params.n === 'no-imagen' ? res.type('text/html').send('<html>hola</html>') : res.type('image/jpeg').send(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')));
  app.post('/marketplace/items/:id/clips/upload', auth, (_q, res) => res.json({ status: 'accepted', clip_uuid: 'clip-nuevo-999' }));
  app.delete('/marketplace/items/:id/clips/:uuid', auth, (_q, res) => res.json([{ status: 'DELETED', site_id: 'MLA' }]));
  app.get('/trends/MLA/:cat', auth, (_q, res) => res.json([{ keyword: 'termo acero 1 litro' }, { keyword: 'termo con cebador' }]));
  app.get('/highlights/MLA/category/:cat', auth, (_q, res) => res.json({ content: [{ id: 'MLA111', position: 1, type: 'ITEM' }, { id: 'MLA777', position: 2, type: 'ITEM' }] }));
  return app;
}

// ─────────────────────────────── Pruebas ───────────────────────────────
async function pruebas() {
  // Entorno aislado: config temporal + API apuntando al mock
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'meli-test-'));
  process.env.MELI_CONFIG_DIR = dirTemp;
  process.env.MELI_API_BASE = `http://localhost:${PUERTO}`;
  process.env.MELI_FOTOS_HOST_PRUEBA = `localhost:${PUERTO}`;
  process.env.ML_APP_ID = 'APP-TEST';
  process.env.ML_APP_SECRET = 'SECRET-TEST';
  process.env.ML_REDIRECT_URI = 'https://ejemplo.test/conectar.html';
  process.env.ML_UPDATE_URL = `http://localhost:${PUERTO}/pkg-remoto`;
  process.env.ML_TRABAJADORES_PAUSA_MS = '0';

  const { TOOLS } = await import('../src/herramientas.js');
  const meli = await import('../src/meli.js');
  const tool = (n) => TOOLS.find((t) => t.name === n);
  const resultados = [];
  const caso = async (nombre, fn) => {
    try { await fn(); resultados.push([nombre, true]); }
    catch (e) { resultados.push([nombre, false, e.message]); }
  };
  const contiene = (texto, ...partes) => { for (const p of partes) if (!String(texto).includes(p)) throw new Error(`falta "${p}" en: ${String(texto).slice(0, 120)}`); };

  await caso('ml_conectar sin code devuelve URL con PKCE', async () => {
    const t = await tool('ml_conectar').run({});
    contiene(t, 'auth.mercadolibre.com.ar/authorization', 'code_challenge', 'ejemplo.test');
  });
  await caso('ml_conectar con code canjea y guarda la cuenta', async () => {
    const t = await tool('ml_conectar').run({ code: 'CODE-OK' });
    contiene(t, 'TIENDA_DEMO', '777', 'estrella', 'github.com/kokesaurio');
    const archivo = JSON.parse(fs.readFileSync(path.join(dirTemp, 'cuentas.json'), 'utf8'));
    if (!archivo.cuentas['777'].refresh_token) throw new Error('no guardó refresh');
    if ((fs.statSync(path.join(dirTemp, 'cuentas.json')).mode & 0o777) !== 0o600) throw new Error('permisos del archivo != 0600');
  });
  await caso('ml_cuentas lista la conectada', async () => contiene(await tool('ml_cuentas').run({}), 'TIENDA_DEMO'));
  await caso('ml_ordenes', async () => contiene(await tool('ml_ordenes').run({}), 'Termo Demo 1L', '42.000'));
  await caso('ml_metricas compara períodos', async () => contiene(await tool('ml_metricas').run({ dias: 7 }), 'Facturación', 'vs período anterior'));
  await caso('ml_panel_ventas: hoy, mes, top productos, envíos y provincias', async () => {
    const t = await tool('ml_panel_ventas').run({});
    contiene(t, 'Hoy', '60.500', 'Mes', 'Termo Demo 1L — 2 u.', 'FULL', 'Flex', 'Colecta', 'Buenos Aires', 'Córdoba');
  });
  await caso('ml_publicaciones', async () => contiene(await tool('ml_publicaciones').run({}), 'MLA111', 'catálogo'));
  await caso('ml_publicacion detalle con fotos de la publicación', async () => contiene(await tool('ml_publicacion').run({ item_id: 'MLA111' }), 'envío gratis', 'sin video', 'Fotos:** 1', 'mlstatic.com/f1.jpg'));
  await caso('ml_visitas', async () => contiene(await tool('ml_visitas').run({ item_id: 'MLA111' }), '340'));
  await caso('ml_preguntas pendientes', async () => contiene(await tool('ml_preguntas').run({}), '¿Tenés stock?', '555'));
  await caso('ml_responder_pregunta (escritura)', async () => contiene(await tool('ml_responder_pregunta').run({ pregunta_id: '555', texto: 'Sí, tenemos stock.' }), '✅'));
  await caso('ml_actualizar_publicacion (escritura)', async () => contiene(await tool('ml_actualizar_publicacion').run({ item_id: 'MLA111', precio: 39900 }), '39.900'));
  await caso('ml_comisiones', async () => contiene(await tool('ml_comisiones').run({ precio: 42000 }), 'Clásica', '14'));
  await caso('ml_precio_catalogo', async () => contiene(await tool('ml_precio_catalogo').run({ item_id: 'MLA111' }), 'Perdiendo', '39.900'));
  await caso('ml_buscar competencia', async () => contiene(await tool('ml_buscar').run({ consulta: 'termo' }), 'RIVAL'));
  await caso('ml_reputacion', async () => contiene(await tool('ml_reputacion').run({}), 'platinum', '1543'));
  await caso('ml_promociones lista y detalle', async () => {
    contiene(await tool('ml_promociones').run({}), 'P-HOT', 'Hot Sale');
    contiene(await tool('ml_promociones').run({ promocion_id: 'P-HOT', tipo: 'DEAL' }), 'MLA111', '37.800');
  });
  await caso('ml_aceptar_promocion (escritura)', async () => contiene(await tool('ml_aceptar_promocion').run({ item_id: 'MLA111', promocion_id: 'P-HOT', tipo: 'DEAL', precio_final: 37800 }), '✅'));
  await caso('ml_tendencias', async () => contiene(await tool('ml_tendencias').run({}), 'termo stanley'));
  await caso('refresh de token: single-flight (un solo refresh para llamadas concurrentes)', async () => {
    // Vencer el token a mano
    const archivo = path.join(dirTemp, 'cuentas.json');
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    d.cuentas['777'].vence = 0; fs.writeFileSync(archivo, JSON.stringify(d));
    refrescosHechos = 0;
    await Promise.all([tool('ml_reputacion').run({}), tool('ml_visitas').run({ item_id: 'MLA111' }), tool('ml_tendencias').run({})]);
    if (refrescosHechos !== 1) throw new Error(`hubo ${refrescosHechos} refresh, esperaba 1 (el refresh de ML es de un solo uso)`);
    const d2 = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (d2.cuentas['777'].refresh_token !== 'REFRESH-2') throw new Error('no rotó el refresh token');
  });
  await caso('ml_crear_publicacion clona con copiar_de y pisa precio (escritura)', async () => {
    const t = await tool('ml_crear_publicacion').run({ copiar_de: 'MLA111', precio: 45000, titulo: 'Producto MLA111 copia', sin_costo: true });
    contiene(t, 'Publicada sin costo cargado');
    contiene(t, 'MLA999', '45.000');
    if (!ultimoItemCreado.pictures || ultimoItemCreado.category_id == null) throw new Error('no clonó fotos/categoría del origen');
    if (ultimoItemCreado.price !== 45000) throw new Error('no aplicó el precio nuevo');
  });
  await caso('multicuenta: conectar una segunda tienda', async () => {
    await tool('ml_conectar').run({});                       // nueva URL (nuevo pendiente PKCE)
    contiene(await tool('ml_conectar').run({ code: 'CODE-OK2' }), 'TIENDA_DOS', '888');
  });
  await caso('multicuenta: ml_cuentas lista las dos y marca la predeterminada', async () => {
    contiene(await tool('ml_cuentas').run({}), 'TIENDA_DEMO', 'TIENDA_DOS', '⭐');
  });
  await caso('multicuenta: cuenta explícita opera en la tienda correcta', async () => {
    contiene(await tool('ml_reputacion').run({ cuenta: '888' }), 'TIENDA_DOS');
    contiene(await tool('ml_reputacion').run({}), 'TIENDA_DEMO'); // sin cuenta -> la predeterminada (777)
  });
  await caso('multicuenta: cambiar la predeterminada con ml_cuentas', async () => {
    contiene(await tool('ml_cuentas').run({ predeterminada: '888' }), 'TIENDA_DOS', '✅');
    contiene(await tool('ml_reputacion').run({}), 'TIENDA_DOS');
    await tool('ml_cuentas').run({ predeterminada: '777' }); // volver
  });
  await caso('multicuenta: sin predeterminada y con 2 cuentas, pide elegir (no adivina)', async () => {
    const archivo = path.join(dirTemp, 'cuentas.json');
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const pred = d.predeterminada; delete d.predeterminada;
    fs.writeFileSync(archivo, JSON.stringify(d));
    const t = await tool('ml_reputacion').run({}).catch((e) => e.message);
    contiene(t, '2 cuentas', 'predeterminada');
    d.predeterminada = pred; fs.writeFileSync(archivo, JSON.stringify(d));
  });
  await caso('multicuenta: ml_metricas cuenta="todas" consolida las tiendas', async () => {
    const t = await tool('ml_metricas').run({ cuenta: 'todas', dias: 7 });
    contiene(t, 'Consolidado de 2 tiendas', '161.000', 'TIENDA_DEMO', 'TIENDA_DOS');
  });
  await caso('modo solo lectura no registra herramientas de escritura', async () => {
    const { crearServidor } = await import('../src/servidor.js');
    crearServidor({ allowWrite: false }); // si registrara mal, tiraría; el conteo real se valida por stdio abajo
    const escrituras = TOOLS.filter((t) => !t.readOnly).map((t) => t.name);
    if (escrituras.length !== 9) throw new Error('esperaba 9 herramientas de escritura, hay ' + escrituras.length);
    if (!escrituras.includes('ml_faq_descripcion')) throw new Error('ml_faq_descripcion tiene que ser de escritura');
  });
  await caso('ml_vigilar agrega competidores y tendencias con primer registro', async () => {
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'vendedor', ref: 'RIVAL', nota: 'mi competidor directo' }), 'Agregado', 'RIVAL');
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'publicacion', ref: 'MLA111' }), 'Agregado');
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'busqueda', ref: 'termo 1 litro' }), 'Agregado');
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'tendencias' }), 'Agregado');
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'vendedor', ref: 'RIVAL' }), 'Ya estaba');
    contiene(await tool('ml_vigilar').run({ accion: 'listar' }), 'RIVAL', 'termo 1 litro', 'mi competidor directo');
  });
  await caso('ml_vigilar listar agrupa rivales y productos seguidos con su último dato', async () => {
    const t = await tool('ml_vigilar').run({ accion: 'listar' });
    contiene(t, 'Rivales', 'Productos que seguimos', 'Búsquedas vigiladas', 'Tendencias', 'publicaciones registradas', 'vendidos');
  });
  await caso('ml_auditar_publicaciones: semáforo y mejoras concretas, peores primero', async () => {
    const t = await tool('ml_auditar_publicaciones').run({});
    contiene(t, 'Auditoría de publicaciones', '🔴', 'título corto', 'foto', 'sin video', 'perdiendo el catálogo', 'urgentes');
    if (t.indexOf('MLA111') > t.indexOf('Sin problemas') && t.includes('Sin problemas')) throw new Error('no ordenó las peores primero');
  });
  await caso('ml_novedades_competencia: sin cambios no inventa nada', async () => {
    contiene(await tool('ml_novedades_competencia').run({}), 'Sin novedades');
  });
  await caso('ml_novedades_competencia detecta precios, publicaciones nuevas, ventas, líder y tendencias', async () => {
    mercado.rival = [
      { id: 'R1', title: 'Termo rival 1L', price: 35999, seller: { nickname: 'RIVAL' } },
      { id: 'R2', title: 'Termo rival 2L NUEVO', price: 49999, seller: { nickname: 'RIVAL' } },
    ];
    mercado.busqueda = [{ id: 'B9', title: 'Termo nuevo lider', price: 33000, seller: { nickname: 'USURPADOR' } }, ...mercado.busqueda];
    mercado.tendencias = [{ keyword: 'termo milan' }, { keyword: 'termo stanley' }];
    itemMLA111.sold_quantity = 58; itemMLA111.price = 39900;
    const t = await tool('ml_novedades_competencia').run({});
    contiene(t, '↓ 10.0%', 'publicó 1 nueva', 'Termo rival 2L NUEVO');     // vendedor
    contiene(t, 'vendió ~3', '39.900');                                      // publicación (ventas estimadas + precio)
    contiene(t, 'nuevo líder', 'USURPADOR');                                 // búsqueda
    contiene(t, 'entraron al top', 'termo milan', 'salieron del top', 'mate imperial'); // tendencias
  });
  await caso('ml_cerebro guarda, hereda del negocio y muestra lo que sabe', async () => {
    contiene(await tool('ml_cerebro').run({ accion: 'guardar', impuestos_pct: 10, nota: 'Monotributo + IIBB CABA' }), 'Guardado', 'negocio');
    contiene(await tool('ml_cerebro').run({ accion: 'guardar', item_id: 'MLA111', costo: 20000, medidas: '27 cm alto, 8,5 cm diámetro' }), 'MLA111', 'costo');
    const t = await tool('ml_cerebro').run({ accion: 'ver', item_id: 'MLA111' });
    contiene(t, '20.000', '10%', 'heredado del negocio', '27 cm');
    contiene(await tool('ml_cerebro').run({ accion: 'ver' }), 'Monotributo', 'MLA111', 'medidas ✔');
  });
  await caso('ml_rentabilidad usa el cerebro sin volver a preguntar', async () => {
    itemMLA111.price = 42000;
    const t = await tool('ml_rentabilidad').run({ item_id: 'MLA111' });
    contiene(t, 'Usando del cerebro', '20.000', '10.420', '24,8');
  });
  await caso('ml_rentabilidad aprende datos nuevos hacia el cerebro', async () => {
    contiene(await tool('ml_rentabilidad').run({ item_id: 'MLA999X' , precio: 10000, costo: 4000, impuestos_pct: 10 }), 'guardados en el cerebro');
    contiene(await tool('ml_cerebro').run({ accion: 'ver', item_id: 'MLA999X' }), '4.000');
    contiene(await tool('ml_cerebro').run({ accion: 'olvidar', item_id: 'MLA999X' }), 'Olvidado');
  });
  await caso('costo por SKU: la publicación nueva con el mismo SKU usa ese costo; sin costo, pregunta antes de publicar', async () => {
    const CP = tool('ml_crear_publicacion'), CER = tool('ml_cerebro'), REN = tool('ml_rentabilidad');
    const cer = await import('../src/cerebro.js');
    mercado.items = { ...(mercado.items || {}),
      MLA444: { attributes: [{ id: 'SELLER_SKU', value_name: 'ter-1l' }], category_id: 'MLA1', pictures: [] },
      MLA555: { attributes: [], variations: [{ attributes: [{ id: 'SELLER_SKU', value_name: 'TER-1L ' }] }, { seller_custom_field: 'ter-1l' }] },
      MLA556: { attributes: [], variations: [{ seller_custom_field: 'A' }, { seller_custom_field: 'B' }] } };
    // Sin costo para el SKU: NO publica, pregunta
    ultimoItemCreado = null;
    const q = await CP.run({ titulo: 'Termo 1L negro', categoria: 'MLA1', precio: 30000, sku: 'TER-1L' });
    contiene(q, '¿cuánto te cuesta este producto?', 'SKU **TER-1L**', 'todas las publicaciones con ese SKU');
    if (ultimoItemCreado) throw new Error('publicó sin tener el costo');
    contiene(await CP.run({ titulo: 'Termo sin sku', categoria: 'MLA1', precio: 1000 }), '¿cuánto te cuesta', 'no tiene SKU');
    // Con costo: publica, carga el SKU en la publicación y lo guarda en el SKU
    const a = await CP.run({ titulo: 'Termo 1L negro', categoria: 'MLA1', precio: 30000, sku: 'TER-1L', costo: 8000 });
    contiene(a, '✅ Publicación creada', 'Costo $ 8.000 guardado en el SKU **TER-1L**');
    if (!ultimoItemCreado.attributes?.some((x) => x.id === 'SELLER_SKU' && x.value_name === 'TER-1L')) throw new Error('no cargó el SKU en la publicación');
    // Mismo SKU (otra forma de escribirlo): usa el costo solo, sin preguntar
    contiene(await CP.run({ titulo: 'Termo 1L rojo', categoria: 'MLA1', precio: 31000, sku: ' ter-1l ' }), '✅ Publicación creada', 'Costo $ 8.000 tomado del SKU **TER-1L**');
    // Copiando una publicación que tiene ese SKU, también
    contiene(await CP.run({ copiar_de: 'MLA444', titulo: 'Termo 1L copia' }), 'tomado del SKU **TER-1L**');
    // Otro SKU sin costo: pregunta
    contiene(await CP.run({ titulo: 'Mate', categoria: 'MLA1', precio: 9000, sku: 'MATE-9' }), '¿cuánto te cuesta', 'MATE-9');
    // SKU peligrosos o inválidos
    for (const malo of ['__proto__', 'x\u0007y', 'z'.repeat(61)]) contiene(await CP.run({ titulo: 'x', categoria: 'MLA1', sku: malo, sin_costo: true }), 'SKU no es válido');
    if (({}).costo !== undefined || Object.prototype.costo !== undefined) throw new Error('contaminó el prototipo');
    // La calculadora de otra publicación con el mismo SKU (en variantes) usa ese costo
    itemMLA111.price = 42000;
    contiene(await REN.run({ item_id: 'MLA555' }), 'costo $ 8.000 del SKU TER-1L');
    // Variantes con SKUs distintos: no adivina
    contiene(await REN.run({ item_id: 'MLA556' }), 'Para calcular la rentabilidad real me falta', 'costo del producto');
    // Cambiar el costo en una publicación lo cambia para todas las del SKU
    contiene(await CER.run({ accion: 'guardar', item_id: 'MLA444', costo: 9000 }), 'SKU TER-1L', 'todas las publicaciones con ese SKU');
    contiene(await REN.run({ item_id: 'MLA555' }), 'costo $ 9.000 del SKU TER-1L', 'cargado en MLA444');
    contiene(await CER.run({ accion: 'ver', item_id: 'MLA555' }), 'SKU: TER-1L', 'Costo: $ 9.000 (del SKU TER-1L, cargado en MLA444)');
    // Guardar directo por SKU y ver la lista
    contiene(await CER.run({ accion: 'guardar', item_id: 'mate-9', costo: 3500 }), 'SKU MATE-9');
    contiene(await CP.run({ titulo: 'Mate', categoria: 'MLA1', precio: 9000, sku: 'MATE-9' }), 'tomado del SKU **MATE-9**');
    contiene(await CER.run({ accion: 'ver' }), 'Costos por SKU', '**TER-1L**: costo $ 9.000', '**MATE-9**: costo $ 3.500');
    // Contabilidad: las ventas traen el SKU de la orden y toman el costo del SKU aunque la publicación sea nueva
    const ng = await import('../src/negocio.js');
    const [v] = ng.ventasPorItem([{ order_items: [{ item: { id: 'MLA777', title: 'Termo nuevo', seller_sku: 'Ter-1L' }, quantity: 2, unit_price: 30000 }] }]);
    if (v.sku !== 'TER-1L') throw new Error('la venta no trajo el SKU: ' + v.sku);
    const sb = cer.saberDe('MLA777', v.sku);
    if (sb.costo !== 9000 || sb.costoDelSku?.sku !== 'TER-1L') throw new Error('no tomó el costo del SKU para la venta: ' + JSON.stringify(sb));
    // Una publicación que ya tenía costo le pasa el costo a su SKU la primera vez que se lo ve
    cer.vincularSku('MLA111', 'TERMO-A');
    if (cer.costoDeSku('TERMO-A') !== 20000) throw new Error('el SKU no heredó el costo que ya tenía la publicación');
    // Olvidar un SKU
    contiene(await CER.run({ accion: 'olvidar', item_id: 'MATE-9' }), 'Olvidado');
    if (cer.costoDeSku('MATE-9') != null) throw new Error('no olvidó el SKU');
  });
  await caso('ml_publicidad en vivo: detalle del anuncio y campañas', async () => {
    const t = await tool('ml_publicidad').run({ item_id: 'MLA111', dias: 30 });
    contiene(t, 'Product Ads', '15.000', 'ACOS', '12.5%', 'en vivo');
    contiene(await tool('ml_publicidad').run({}), 'Campaña general', '30.000', '15%');
  });
  await caso('ml_rentabilidad pide lo que falta sin inventar', async () => {
    contiene(await tool('ml_rentabilidad').run({ item_id: 'MLA222' }), 'me falta', 'costo del producto');
  });
  await caso('ml_rentabilidad: desglose completo con comisión real, ads en vivo e impuestos', async () => {
    itemMLA111.price = 42000;
    const t = await tool('ml_rentabilidad').run({ item_id: 'MLA111', costo: 20000, impuestos_pct: 10 });
    // 42000 − 5880 (14%) − 1500 (15000/10 ventas ads) − 0 envío − 4200 (10%) − 20000 = 10420 · margen 24,8%
    contiene(t, '5.880', '1.500', '4.200', '10.420', '24,8', 'ACOS máximo');
  });
  await caso('ml_clips de un ítem muestra estados, motivos y veredicto', async () => {
    const t = await tool('ml_clips').run({ item_id: 'MLA111' });
    contiene(t, '✅ publicado', '⏳ en revisión', '❌ rechazado', 'ya se subió antes', 'Veredicto', '1 sirviendo');
  });
  await caso('ml_clips sin item arma el mapa de video de la tienda', async () => {
    const t = await tool('ml_clips').run({});
    contiene(t, 'Mapa de video', 'MLA111', 'MLA222', 'sin clips');
  });
  await caso('ml_subir_clip valida local y sube con moderación informada', async () => {
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/clip-prueba.txt', 'x');
    contiene(await tool('ml_subir_clip').run({ item_id: 'MLA111', archivo: '/tmp/clip-prueba.txt' }), 'MP4');
    fs.writeFileSync('/tmp/clip-prueba.mp4', Buffer.alloc(2048));
    const t = await tool('ml_subir_clip').run({ item_id: 'MLA111', archivo: '/tmp/clip-prueba.mp4' });
    contiene(t, 'Clip subido', 'clip-nuevo-999', '24-48', 'ml_clips');
    contiene(await tool('ml_borrar_clip').run({ item_id: 'MLA111', clip_uuid: 'clip-rechazo-003' }), 'borrado');
  });
  await caso('ml_descubrir_ganadores por categoría usa el ranking oficial + tendencias', async () => {
    const t = await tool('ml_descubrir_ganadores').run({ categoria: 'MLA1055' });
    contiene(t, 'ganadores', 'más vendidos', 'MLA111', 'termo acero 1 litro', 'demanda validada');
  });
  await caso('ml_descubrir_ganadores por búsqueda analiza competencia, precios y dominancia', async () => {
    const t = await tool('ml_descubrir_ganadores').run({ busqueda: 'termo 1 litro' });
    contiene(t, 'Análisis de mercado', 'Competencia', 'mediana', 'Señal de oportunidad');
  });
  await caso('ml_historial_competencia arma la base de datos con cada control', async () => {
    itemMLA111.price = 42000; itemMLA111.sold_quantity = 55;
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'publicacion', ref: 'MLA333' }), 'Agregado');
    itemMLA111.price = 36500; itemMLA111.sold_quantity = 61;
    await tool('ml_novedades_competencia').run({});
    const t = await tool('ml_historial_competencia').run({ ref: 'MLA333' });
    contiene(t, 'Historial', 'MLA333', '42.000', '36.500', '%', 'Resumen');
    itemMLA111.price = 42000; itemMLA111.sold_quantity = 55;
  });
  await caso('ml_vigilar quitar limpia objetivo y snapshot', async () => {
    contiene(await tool('ml_vigilar').run({ accion: 'quitar', ref: 'RIVAL' }), 'Quitado');
    const lista = await tool('ml_vigilar').run({ accion: 'listar' });
    if (lista.includes('RIVAL')) throw new Error('sigue en la lista');
  });
  await caso('ml_version detecta que hay una versión nueva', async () => {
    const t = await tool('ml_version').run({});
    contiene(t, '9.9.9', 'actualizar');
  });
  await caso('ml_version al día cuando la remota no es mayor', async () => {
    versionRemota = '0.0.1';
    contiene(await tool('ml_version').run({}), 'es la última publicada');
    versionRemota = '9.9.9';
  });
  await caso('aviso automático de actualización en la primera respuesta (1 sola vez)', async () => {
    fs.rmSync(path.join(dirTemp, 'version-check.json'), { force: true });
    const hijo = spawn(process.execPath, ['src/stdio.js'], { env: { ...process.env } });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    const enviar = (m) => hijo.stdin.write(JSON.stringify(m) + '\n');
    enviar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    enviar({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await esperar(900); // dejar terminar el chequeo de versión en background
    enviar({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ml_tendencias', arguments: {} } });
    for (let i = 0; i < 40 && !salida.includes('"id":2'); i++) await esperar(200);
    enviar({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ml_tendencias', arguments: {} } });
    for (let i = 0; i < 40 && !salida.includes('"id":3'); i++) await esperar(200);
    hijo.kill();
    const texto = (id) => JSON.parse(salida.split('\n').find((l) => l.includes('"id":' + id)) || '{}').result?.content?.[0]?.text || '';
    contiene(texto(2), '📦', '9.9.9');
    if (texto(3).includes('📦')) throw new Error('avisó dos veces en la misma sesión');
  });
  await caso('comando actualizar limpia la caché de npx', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npmcache-'));
    fs.mkdirSync(path.join(cacheDir, '_npx', 'abc'), { recursive: true });
    const hijo = spawn(process.execPath, ['src/stdio.js', 'actualizar'], { env: { ...process.env, npm_config_cache: cacheDir } });
    let fin = '';
    hijo.stdout.on('data', (d) => { fin += d; });
    await new Promise((res) => hijo.on('exit', res));
    if (fs.existsSync(path.join(cacheDir, '_npx'))) throw new Error('no borró la caché _npx');
    contiene(fin, 'Reiniciá Claude');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
  // ───────────── Equipo de trabajadores 24/7 ─────────────
  const tr = await import('../src/trabajadores.js');
  const T = tool('ml_trabajadores');
  await caso('trabajadores: equipo con 19 nombres, puestos y skills a cargo', async () => {
    const t = await T.run({ accion: 'equipo' });
    contiene(t, 'Vera', 'Tomás', 'Martina', 'Bruno', 'Lucía', 'Clara', 'Ramiro', 'Ana', 'Leo', 'Carmen', 'Nico', 'Paula', 'Iván', 'Valen', 'Gabi', 'Sole', 'Fede', 'Sofía', 'cada 30 min', 'Analista de rentabilidad', 'Gestora de anuncios', 'Coordinador de logística', 'Contadora', 'cada 2 h', 'Auditora de publicaciones', 'Agenda comercial', 'cada 15 días', 'cada 1 día', 'Centinela de precios', 'Cazador de rivales', 'calculadora-ml', 'competencia-ml', 'descubrir-ganadores-ml', 'mejorar-publicaciones-ml', 'panel-ventas-ml');
    if (tr.IDS.length !== 19) throw new Error('el equipo no tiene 19');
    const todas = tr.IDS.flatMap((id) => tr.EQUIPO[id].skills.map((x) => x.skill));
    if (new Set(todas).size !== todas.length) throw new Error('una skill está asignada a dos trabajadores');
    for (const sk of todas) if (!fs.existsSync(path.join('skills', sk, 'SKILL.md'))) throw new Error('skill inexistente: ' + sk);
  });
  await caso('trabajadores: asignar por nombre (con y sin acento) o puesto, tipo deducido', async () => {
    mercado.items = { MLA500: { price: 45000, sold_quantity: 10, available_quantity: 5, status: 'active', title: 'Termo rival A' }, MLA600: { price: 30000, sold_quantity: 100, available_quantity: 3, status: 'active', title: 'Termo rival B' } };
    mercado.busqueda = [{ id: 'MLA901', title: 'Termo líder', price: 35000, seller: { nickname: 'LIDER' } }, { id: 'MLA111', title: 'Mi termo', price: 42000, seller: { nickname: 'TIENDA_DEMO' } }];
    contiene(await T.run({ accion: 'asignar', trabajador: 'Vera', ref: 'MLA500', mi_item: 'MLA111' }), 'Vera', 'publicacion', 'MLA500', 'MLA111', 'vigilancia-ml');
    contiene(await T.run({ accion: 'asignar', trabajador: 'tomas', ref: 'MLA600' }), 'Tomás');
    contiene(await T.run({ accion: 'asignar', trabajador: 'ranking', ref: 'termo 1 litro', mi_item: 'MLA111', umbral: 1 }), 'Martina', 'busqueda');
    contiene(await T.run({ accion: 'asignar', trabajador: 'Bruno', ref: 'termo 1 litro' }), 'Bruno');
    contiene(await T.run({ accion: 'asignar', trabajador: 'Sofía' }), 'Sofía', 'tendencias');
    contiene(await T.run({ accion: 'asignar', trabajador: 'Vera', ref: 'MLA500', mi_item: 'MLA111' }), 'actualizó');
  });
  await caso('trabajadores: rechaza tareas que no son de su oficio y nombres desconocidos', async () => {
    let msg = '';
    try { await T.run({ accion: 'asignar', trabajador: 'Bruno', tipo: 'publicacion', ref: 'MLA1' }); } catch (e) { msg = e.message; }
    contiene(msg, 'no trabaja con');
    contiene(await T.run({ accion: 'asignar', trabajador: 'Pepe', ref: 'x' }), 'No conozco');
    try { await T.run({ accion: 'asignar', trabajador: 'Vera', ref: 'MLA1', mi_item: 'javascript:alert(1)' }); msg = ''; } catch (e) { msg = e.message; }
    contiene(msg, 'mi_item');
  });
  await caso('trabajadores: primer control guarda la base y no inventa alertas (Clara sí pregunta de entrada)', async () => {
    const t = await T.run({ accion: 'correr' });
    contiene(t, 'foto de base');
    for (const p of ['Centinela de precios', 'Contador de ventas', 'Vigía de búsquedas', 'Cazador de rivales', 'Radar de tendencias']) if (t.includes(p)) throw new Error('avisó en el primer control: ' + p);
  });
  await caso('trabajadores: detectan precio por debajo tuyo, quiebre de stock, líder, puesto, rival nuevo y tendencias (con skill sugerida)', async () => {
    mercado.items.MLA500 = { ...mercado.items.MLA500, price: 39000 };
    mercado.items.MLA600 = { ...mercado.items.MLA600, sold_quantity: 106, available_quantity: 0 };
    mercado.busqueda = [{ id: 'MLA902', title: 'Termo usurpador', price: 31000, seller: { nickname: 'USURPADOR' } }, ...mercado.busqueda];
    mercado.tendencias = [{ keyword: 'termo de vidrio' }, ...mercado.tendencias];
    const t = await T.run({ accion: 'correr' });
    contiene(t, 'Vera', 'MÁS BARATO', 'calculadora-ml', 'Tomás', 'vendió ~6', 'SIN STOCK', 'publicidad-ml', 'Martina', 'nuevo líder', 'USURPADOR', 'Bajaste', 'puesto 2 → 3', 'mejorar-publicaciones-ml', 'Bruno', 'Rival nuevo', 'competencia-ml', 'Sofía', 'termo de vidrio', 'descubrir-ganadores-ml');
    if (t.includes('LIDER**')) throw new Error('Bruno avisó como nuevo a un vendedor ya visto');
  });
  await caso('trabajadores: sin cambios → sin alertas repetidas', async () => contiene(await T.run({ accion: 'correr' }), 'Sin novedades'));
  await caso('trabajadores: informe vacío tras verlas, historial con todas=true y por trabajador', async () => {
    contiene(await T.run({ accion: 'informe' }), 'Sin alertas nuevas');
    contiene(await T.run({ accion: 'informe', todas: true }), 'urgente', 'SIN STOCK');
    const soloBruno = await T.run({ accion: 'informe', todas: true, trabajador: 'Bruno' });
    contiene(soloBruno, 'USURPADOR');
    if (soloBruno.includes('SIN STOCK')) throw new Error('el informe de Bruno trae alertas de Tomás');
  });
  await caso('trabajadores: frecuencia con mínimo, pausa respeta el ciclo automático, activar', async () => {
    contiene(await T.run({ accion: 'frecuencia', trabajador: 'Vera', minutos: 1 }), 'cada 10 min', 'mínimo');
    contiene(await T.run({ accion: 'pausar', trabajador: 'todos' }), 'En pausa');
    const r = await tr.correrCiclo({});
    if (r.corridos.length) throw new Error('corrió estando en pausa: ' + r.corridos);
    contiene(await T.run({ accion: 'activar' }), 'Activados');
    contiene(await T.run({ accion: 'equipo', trabajador: 'Vera' }), 'activo', 'cada 10 min', 'MLA500');
  });
  await caso('trabajadores: sin tareas propias vigilan tus seguidos de ml_vigilar', async () => {
    contiene(await tool('ml_vigilar').run({ accion: 'agregar', tipo: 'publicacion', ref: 'MLA700' }), 'Agregado');
    const d = tr.leerEquipo();
    if (!tr.tareasDe(d, 'ventas').some((t) => t.ref === 'MLA700' && t.deLista)) throw new Error('Tomás no heredó el seguido');
    contiene(await T.run({ accion: 'quitar', trabajador: 'Tomás', ref: 'MLA600' }), 'dejó la tarea');
  });
  await caso('trabajadores: candado — un solo corredor; el servicio 24/7 releva al conector', async () => {
    const lock = path.join(dirTemp, 'trabajadores.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: 999999, modo: 'conector', latido: Date.now() }));
    if (tr.tomarCandado('conector')) throw new Error('dos conectores a la vez');
    if (!tr.tomarCandado('servicio')) throw new Error('el servicio no relevó al conector');
    fs.writeFileSync(lock, JSON.stringify({ pid: 999999, modo: 'servicio', latido: Date.now() }));
    if (tr.tomarCandado('conector')) throw new Error('el conector le sacó el lugar al servicio');
    fs.writeFileSync(lock, JSON.stringify({ pid: 999999, modo: 'servicio', latido: Date.now() - 10 * 60000 }));
    if (!tr.tomarCandado('conector')) throw new Error('no tomó un candado muerto');
    tr.soltarCandado();
    if (fs.existsSync(lock)) throw new Error('no soltó el candado');
  });
  await caso('trabajadores: webhook solo https (o localhost)', async () => {
    process.env.ML_TRABAJADORES_WEBHOOK = 'http://evil.example.com/x';
    if (tr.avisoWebhook()) throw new Error('aceptó http externo');
    process.env.ML_TRABAJADORES_WEBHOOK = 'https://crm.example.com/hook';
    if (!tr.avisoWebhook()) throw new Error('rechazó https');
    delete process.env.ML_TRABAJADORES_WEBHOOK;
  });
  await caso('refresh entre PROCESOS (Claude + trabajadores): un solo refresh, sin revocar la cuenta', async () => {
    const archivo = path.join(dirTemp, 'cuentas.json');
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    d.cuentas['777'].vence = 0; d.cuentas['777'].refresh_token = 'REFRESH-2'; fs.writeFileSync(archivo, JSON.stringify(d));
    refrescosHechos = 0; demoraRefresh = 1500;
    const codigo = `const m = await import(${JSON.stringify(new URL('../src/meli.js', import.meta.url).href)}); await new m.MeliClient({ userId: '777' }).get('/users/me'); console.log('ok');`;
    const hijos = [0, 1].map(() => new Promise((res, rej) => {
      const h = spawn(process.execPath, ['--input-type=module', '-e', codigo], { env: { ...process.env } });
      let out = '', err = ''; h.stdout.on('data', (x) => { out += x; }); h.stderr.on('data', (x) => { err += x; });
      h.on('exit', (code) => code === 0 && out.includes('ok') ? res() : rej(new Error('hijo falló: ' + err.slice(0, 200))));
    }));
    await Promise.all([...hijos, esperar(300).then(() => new meli.MeliClient({ userId: '777' }).get('/users/me'))]);
    demoraRefresh = 0;
    if (refrescosHechos !== 1) throw new Error(`hubo ${refrescosHechos} refresh entre 3 procesos, esperaba 1`);
  });
  await caso('trabajadores 24/7: el servicio arranca, toma el candado, trabaja y lo suelta al detenerse', async () => {
    const lock = path.join(dirTemp, 'trabajadores.lock');
    try { fs.unlinkSync(lock); } catch {}
    const h = spawn(process.execPath, ['src/stdio.js', 'trabajadores'], { env: { ...process.env } });
    let out = ''; h.stdout.on('data', (x) => { out += x; }); h.stderr.on('data', (x) => { out += x; });
    for (let i = 0; i < 40 && !fs.existsSync(lock); i++) await esperar(100);
    const l = JSON.parse(fs.readFileSync(lock, 'utf8'));
    if (l.modo !== 'servicio') throw new Error('el candado no es del servicio');
    for (let i = 0; i < 40 && !/Vera|Sin|Equipo en marcha/.test(out); i++) await esperar(100);
    h.kill('SIGTERM');
    await new Promise((r) => h.on('exit', r));
    contiene(out, 'Equipo en marcha', 'Vera', 'Sofía', 'detenido');
    if (fs.existsSync(lock)) throw new Error('quedó el candado tomado tras detener');
  });
  await caso('trabajadores por CLI: estado', async () => {
    const h = spawn(process.execPath, ['src/stdio.js', 'trabajadores', 'estado'], { env: { ...process.env } });
    let out = ''; h.stdout.on('data', (x) => { out += x; });
    await new Promise((r) => h.on('exit', r));
    contiene(out, 'Vera', 'Sofía', 'cada 10 min');
  });

  // ───────────── Resultados del equipo + Google Drive ─────────────
  const rs = await import('../src/resultados.js');
  await caso('resultados: tablas reales por trabajador (precio vs el tuyo, tu puesto, rivales, tendencias)', async () => {
    await T.run({ accion: 'correr' });
    const t = await T.run({ accion: 'resultados' });
    contiene(t, 'Lo importante', 'Vera', 'más barato que vos', '39.000', '42.000', 'Martina', 'Tus puestos', 'termo 1 litro: 3º', 'Bruno', 'USURPADOR', 'Sofía', 'termo de vidrio');
    const soloVera = await T.run({ accion: 'resultados', trabajador: 'Vera' });
    if (soloVera.includes('Radar de tendencias')) throw new Error('resultados de Vera trae a Sofía');
  });
  await caso('resultados: Tomás calcula el ritmo real de ventas y la facturación estimada del rival', async () => {
    mercado.items.MLA650 = { price: 10000, sold_quantity: 200, available_quantity: 8, status: 'active', title: 'Mate rival' };
    await T.run({ accion: 'asignar', trabajador: 'Tomás', ref: 'MLA650' });
    await tr.correrCiclo({ solo: ['ventas'], forzar: true });
    tr.actualizarEquipo((d) => { const k = Object.keys(d.snapshots).find((x) => x.startsWith('ventas|') && x.includes('MLA650')); d.snapshots[k].t -= 2 * 86400000; d.snapshots[k].datos.base.t -= 2 * 86400000; });
    mercado.items.MLA650.sold_quantity = 210;
    await tr.correrCiclo({ solo: ['ventas'], forzar: true });
    const r = rs.armarResultados().ventas;
    const fila = r.filas.find((f) => f[0] === 'MLA650');
    if (!fila || fila[4] !== 10 || fila[6] !== 5 || fila[7] !== 1500000) throw new Error('ritmo mal calculado: ' + JSON.stringify(fila));
    contiene(await T.run({ accion: 'resultados', trabajador: 'Tomás' }), 'Mate rival', '≈ 5 u./día', '$ 1.500.000');
  });
  await caso('drive: instrucciones con clave secreta propia y detección de carpeta', async () => {
    const t = await T.run({ accion: 'drive' });
    contiene(t, 'Planilla de Google en vivo', 'planilla-equipo.gs', 'Carpeta de Google Drive', 'sin conectar');
    const clave = rs.configDrive().clave;
    if (!clave || clave.length < 20 || !t.includes(clave)) throw new Error('no generó/mostró la clave');
    contiene(await T.run({ accion: 'drive' }), clave); // estable: no cambia en cada llamada
  });
  await caso('drive: rechaza URLs que no son de Apps Script', async () => {
    for (const u of ['https://evil.com/macros/s/ABCDEFGHIJK/exec', 'http://script.google.com/macros/s/ABCDEFGHIJK/exec', 'https://script.google.com/a/b']) {
      let msg = ''; try { await T.run({ accion: 'drive', url: u }); } catch (e) { msg = e.message; }
      contiene(msg, 'Apps Script');
    }
    if (!rs.validarScript('https://script.google.com/macros/s/AKfycbx_123-abcDEF/exec?x=1')) throw new Error('rechazó una URL válida');
  });
  const urlPlanilla = `http://localhost:${PUERTO}/macros/s/SCRIPT-PRUEBA-123/exec`;
  await caso('drive: con clave equivocada la planilla rechaza y se informa claro', async () => {
    process.env.ML_DRIVE_PERMITIR_LOCAL = '1';
    planilla.clave = 'otra-clave';
    contiene(await T.run({ accion: 'drive', url: urlPlanilla }), 'la prueba falló', 'rechazó la clave');
  });
  await caso('drive: planilla en vivo recibe una pestaña por trabajador (via redirección 302 como Google)', async () => {
    planilla.clave = rs.configDrive().clave; planilla.recibidos.length = 0;
    contiene(await T.run({ accion: 'drive', probar: true }), 'enviados a Drive', 'planilla');
    const b = planilla.recibidos.at(-1);
    for (const h of ['Vera - Centinela de precios', 'Tomás - Contador de ventas', 'Martina - Vigía de búsquedas', 'Bruno - Cazador de rivales nuevos', 'Sofía - Radar de tendencias']) if (!b.resultados[h]) throw new Error('falta la pestaña ' + h);
    const vera = b.resultados['Vera - Centinela de precios'];
    if (vera[0][0] !== 'Objetivo' || !vera.some((f) => f[0] === 'MLA500')) throw new Error('pestaña de Vera vacía');
    if (vera.some((f) => f.length !== vera[0].length)) throw new Error('filas de distinto ancho (Sheets las rechaza)');
  });
  const dirDrive = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
  await caso('drive: carpeta de Drive para escritorio con CSV por trabajador, Alertas.csv y resumen', async () => {
    contiene(await T.run({ accion: 'drive', carpeta: dirDrive }), 'conectado', 'Alertas.csv');
    const c = path.join(dirDrive, rs.CARPETA_NOMBRE);
    for (const f of ['Alertas.csv', 'Vera - Centinela de precios.csv', 'Sofía - Radar de tendencias.csv', 'Resumen del equipo.md']) if (!fs.existsSync(path.join(c, f))) throw new Error('falta ' + f);
    contiene(fs.readFileSync(path.join(c, 'Resumen del equipo.md'), 'utf8'), 'Vera', 'más barato que vos');
    contiene(await T.run({ accion: 'equipo' }), 'planilla en vivo', rs.CARPETA_NOMBRE);
  });
  await caso('drive: cada control manda las alertas nuevas a la planilla y a la carpeta', async () => {
    planilla.recibidos.length = 0;
    mercado.items.MLA500 = { ...mercado.items.MLA500, price: 37000 };
    contiene(await T.run({ accion: 'correr', trabajador: 'Vera' }), 'resultados enviados a Google Drive');
    const b = planilla.recibidos.at(-1);
    if (!b.alertas.some((f) => String(f[4]).includes('39.000') && String(f[1]).includes('Vera') && f[5] === '')) throw new Error('la planilla no recibió la alerta de precio: ' + JSON.stringify(b.alertas));
    contiene(fs.readFileSync(path.join(dirDrive, rs.CARPETA_NOMBRE, 'Alertas.csv'), 'utf8'), '37.000', 'Vera');
  });
  await caso('drive: un título de rival con fórmula NUNCA se ejecuta en tu planilla (anti inyección)', async () => {
    mercado.items.MLA500 = { ...mercado.items.MLA500, title: '=IMPORTXML("http://evil.test";"//a")', price: 36000 };
    planilla.recibidos.length = 0;
    await T.run({ accion: 'correr', trabajador: 'Vera' });
    const celdas = JSON.stringify(planilla.recibidos.at(-1));
    if (/"=IMPORTXML/.test(celdas)) throw new Error('mandó una fórmula ejecutable a la planilla');
    const archivo = fs.readFileSync(path.join(dirDrive, rs.CARPETA_NOMBRE, 'Vera - Centinela de precios.csv'), 'utf8');
    if (/(^|,)"?=IMPORTXML/m.test(archivo)) throw new Error('el CSV tiene una fórmula ejecutable');
    contiene(archivo, "'=IMPORTXML");
  });
  await caso('drive: desconectar', async () => {
    contiene(await T.run({ accion: 'drive', quitar: 'todo' }), 'dejé de enviar');
    if (await rs.exportarADrive([])) throw new Error('siguió enviando');
    delete process.env.ML_DRIVE_PERMITIR_LOCAL;
    fs.rmSync(dirDrive, { recursive: true, force: true });
  });

  // ───────────── Lucía: auditoría quincenal de TUS publicaciones ─────────────
  const au = await import('../src/auditoria.js');
  await caso('Lucía: chequeos de "¿está actualizada?" (sin tocar, precio congelado, mercado, fotos, ficha, garantía)', async () => {
    const ahora = Date.now();
    const vieja = { title: 'Termo acero inoxidable 1 litro Marca X modelo Pro', price: 50000, status: 'active', available_quantity: 10, listing_type_id: 'gold_special', video_id: 'v1', shipping: { free_shipping: true },
      pictures: [{ max_size: '500x500' }, { max_size: '1200x1200' }, { max_size: '1200x1200' }], attributes: [{ id: 'BRAND', value_name: 'Genérica' }], last_updated: new Date(ahora - 90 * 86400000).toISOString() };
    const r = au.evaluar({ b: vieja, desc: 'x'.repeat(300), mercado: { mediana: 40000, muestras: 12 }, precioSinCambiosDesde: ahora - 50 * 86400000, ahora });
    const cod = r.problemas.map((p) => p.codigo);
    for (const k of ['sin_actualizar', 'precio_congelado', 'precio_alto', 'fotos_baja_resolucion', 'faltan_atributos', 'sin_garantia']) if (!cod.includes(k)) throw new Error('faltó detectar ' + k + ': ' + cod);
    contiene(r.problemas.map((p) => p.texto).join(' '), 'hace 90 días', 'hace 50 días', '25% arriba del mercado', 'marca y modelo');
    const al = au.evaluar({ b: { ...vieja, last_updated: new Date(ahora).toISOString(), pictures: [{ max_size: '1200x1200' }, { max_size: '1200x1200' }, { max_size: '1200x1200' }], attributes: [{ id: 'BRAND', value_name: 'Marca X' }, { id: 'MODEL', value_name: 'Pro' }], sale_terms: [{ id: 'WARRANTY_TYPE', value_name: 'Garantía del vendedor' }] }, desc: `${vieja.title || 'Producto'} de primera calidad.\nIdeal para todos los días.\nMide 27 cm y trae su caja.\n\nMEDIDAS\n- Alto: 27 cm\n\nCARACTERÍSTICAS PRINCIPALES\n- Material: acero\n- Color: negro\n\nQUÉ VIENE EN LA CAJA\n- 1 unidad\n` + 'x'.repeat(200), mercado: { mediana: 49000, muestras: 12 }, ahora });
    if (al.semaforo !== '🟢' || al.problemas.length) throw new Error('una publicación al día no quedó 🟢: ' + al.problemas.map((p) => p.codigo));
    if (!au.evaluar({ b: { ...vieja, price: 20000 }, desc: 'x'.repeat(300), mercado: { mediana: 40000, muestras: 12 }, ahora }).problemas.some((p) => p.codigo === 'precio_bajo')) throw new Error('no detectó precio muy bajo');
    if (au.evaluar({ b: vieja, desc: 'x'.repeat(300), mercado: { mediana: 20000, muestras: 2 }, ahora }).problemas.some((p) => p.codigo === 'precio_alto')) throw new Error('comparó contra el mercado con solo 2 muestras');
  });
  await caso('Lucía: correr el equipo sin nombrarla NO dispara la auditoría completa', async () => {
    contiene(await T.run({ accion: 'correr' }), 'Lucía audita sola cada 15 días');
  });
  await caso('Lucía: primera auditoría de cada tienda conectada, con las urgentes y la skill a usar', async () => {
    mercado.items.MLA222 = { last_updated: new Date(Date.now() - 95 * 86400000).toISOString(), pictures: [{ max_size: '400x400' }], available_quantity: 0 };
    tr.leerBandeja({ marcar: true });
    const t = await T.run({ accion: 'correr', trabajador: 'Lucía' });
    contiene(t, 'Lucía', 'Auditoría quincenal de tienda TIENDA_DEMO', 'Auditoría quincenal de tienda TIENDA_DOS', '2 publicaciones', 'primera auditoría', 'MLA222 «Producto MLA222» está en rojo: SIN STOCK', 'mejorar-publicaciones-ml', 'sin actualizar hace 60+ días');
    if (t.includes('🔴 🔴')) throw new Error('emoji duplicado');
    if (t.includes('avisan desde el próximo control')) throw new Error('dice que Lucía avisa recién la próxima');
    const res = await T.run({ accion: 'resultados', trabajador: 'Lucía' });
    contiene(res, 'Auditora de publicaciones', 'MLA222', 'MLA111', '🔴', 'próxima auditoría', 'SIN STOCK', 'Días sin tocar', '| 95 |');
    if (res.indexOf('MLA222') > res.indexOf('MLA111')) throw new Error('la tabla no pone las peores primero');
  });
  await caso('Lucía: la segunda auditoría compara con la anterior (qué mejoró, qué empeoró, precio congelado)', async () => {
    // MLA222 se pone al día; a MLA111 le fijamos 50 días con el mismo precio en la base
    mercado.items.MLA222 = { last_updated: new Date().toISOString(), pictures: [{ max_size: '1200x1200' }, { max_size: '1200x1200' }, { max_size: '1200x1200' }], available_quantity: 30, video_id: 'v9', attributes: [{ id: 'BRAND', value_name: 'Marca X' }, { id: 'MODEL', value_name: 'Pro' }], sale_terms: [{ id: 'WARRANTY_TIME', value_name: '30 días' }], catalog_listing: false };
    (await import('../src/db.js')).db().prepare("UPDATE auditorias SET t = t - ? WHERE item_id = 'MLA111'").run(50 * 86400000);
    const t = await T.run({ accion: 'correr', trabajador: 'Lucía' });
    contiene(t, 'desde la anterior', 'mejoraron');
    if (/mejoraron 0 mejoraron|0 mejoraron/.test(t) && !/[1-9] mejoraron/.test(t)) throw new Error('no detectó que MLA222 mejoró: ' + t.slice(0, 300));
    const aud = await tool('ml_auditar_publicaciones').run({});
    contiene(aud, 'precio sin cambios hace 50 días');
    const h = await T.run({ accion: 'historial', trabajador: 'Lucía' });
    contiene(h, 'Auditoría', '🔴', 'Sin actualizar 60+ días');
  });
  await caso('Lucía: frecuencia en días y tarea para una sola tienda', async () => {
    contiene(await T.run({ accion: 'frecuencia', trabajador: 'Lucía', dias: 7 }), 'cada 7 días');
    contiene(await T.run({ accion: 'frecuencia', trabajador: 'Lucía', dias: 15 }), 'cada 15 días');
    contiene(await T.run({ accion: 'asignar', trabajador: 'Lucía', cuenta: '888' }), 'Lucía', 'propias', 'tienda 888');
    const d = tr.leerEquipo();
    const ts = tr.tareasDe(d, 'auditor');
    if (ts.length !== 1 || ts[0].cuenta !== '888') throw new Error('con tarea propia debería auditar solo esa tienda: ' + JSON.stringify(ts));
    contiene(await T.run({ accion: 'quitar', trabajador: 'Lucía', ref: 'tienda 888' }), 'dejó la tarea');
  });

  // ───────────── Preguntas de compradores → preguntas frecuentes en la descripción ─────────────
  const fq = await import('../src/faq.js');
  const FAQ = tool('ml_faq_descripcion');
  await caso('faq: limpia saludos y firmas, descarta datos de contacto, stock, precio y envíos', async () => {
    if (fq.limpiarRespuesta('Hola, buen día! Mide 27 cm. Gracias por tu consulta, quedamos a disposición') !== 'Mide 27 cm.') throw new Error('no limpió: ' + fq.limpiarRespuesta('Hola, buen día! Mide 27 cm. Gracias por tu consulta, quedamos a disposición'));
    for (const r of ['Escribime al 11 5555-5555', 'mandame un mail a x@y.com', 'mirá www.mitienda.com', 'pasame tu whatsapp', 'seguinos en instagram']) if (fq.limpiarRespuesta(r) !== null) throw new Error('dejó pasar contacto: ' + r);
    const g = fq.agrupar(preguntasPorItem.MLA111);
    const temas = g.map((x) => x.tema);
    if (!temas.includes('medidas') || !temas.includes('uso')) throw new Error('no agrupó por tema: ' + temas);
    if (g.find((x) => x.tema === 'medidas').veces !== 2 || g.find((x) => x.tema === 'uso').veces !== 2) throw new Error('no contó las repetidas escritas distinto');
    if (g.some((x) => /stock|env[ií]o|caja/i.test(x.pregunta))) throw new Error('incluyó stock/envío/contacto: ' + g.map((x) => x.pregunta));
    if (g.some((x) => /Hola|Saludos|consulta/i.test(x.respuesta))) throw new Error('dejó saludos en la respuesta');
  });
  await caso('faq: lo que la descripción ya cubre no se repite', async () => {
    const pre = preguntasPorItem.MLA111;
    if (fq.faltantes(pre, 'Termo de acero. Medidas: 27 cm de alto.').some((g) => g.tema === 'medidas')) throw new Error('repitió medidas ya cubiertas');
    if (!fq.faltantes(pre, 'Termo de acero.').some((g) => g.tema === 'medidas')) throw new Error('no detectó medidas faltantes');
  });
  await caso('faq: la propuesta usa TUS respuestas y no toca nada sin aplicar', async () => {
    descripcionesPut.length = 0;
    const t = await FAQ.run({ item_id: 'MLA111' });
    contiene(t, '2 pregunta(s) para sumar', 'medidas', '27 cm de alto', 'lavavajillas', '2 veces', 'PREGUNTAS FRECUENTES', 'no toqué nada', 'aplicar=true');
    if (t.includes('5555') || /stock disponible|todo el país/.test(t)) throw new Error('la propuesta trae contacto/stock/envío');
    if (descripcionesPut.length) throw new Error('escribió sin aplicar=true');
  });
  await caso('faq: Lucía las detecta en la auditoría y lo avisa con su skill', async () => {
    const t = await T.run({ accion: 'correr', trabajador: 'Lucía' });
    contiene(t, 'con preguntas repetidas que faltan en la descripción');
    const al = tr.alertasRecientes({ trabajador: 'auditor' });
    if (!al.some((a) => a.skill === 'faq-descripcion-ml' && a.texto.includes('MLA111') && a.texto.includes('no están en su descripción'))) throw new Error('Lucía no avisó con la skill de preguntas frecuentes');
    const sn = Object.entries(tr.leerEquipo().snapshots).find(([k]) => k.startsWith('auditor|'))[1];
    if (!sn.datos.items.MLA111.codigos.includes('faq_faltante')) throw new Error('la auditoría no marcó faq_faltante en MLA111');
    contiene(await tool('ml_auditar_publicaciones').run({}), 'no están en la descripción', 'ml_faq_descripcion');
    contiene(await T.run({ accion: 'equipo', trabajador: 'Lucía' }), 'faq-descripcion-ml');
  });
  await caso('faq: aplicar todas las que marcó Lucía escribe el bloque en la descripción real', async () => {
    descripcionesPut.length = 0;
    const t = await FAQ.run({ todas: true, aplicar: true });
    contiene(t, '✅ MLA111', 'descripción actualizada', '2 pregunta(s) nueva(s)');
    const put = descripcionesPut.find((x) => x.id === 'MLA111');
    if (!put) throw new Error('no escribió en ML');
    if (put.query.api_version !== '2') throw new Error('no usó api_version=2');
    contiene(put.texto, 'Descripción original del producto.', 'PREGUNTAS FRECUENTES', '27 cm de alto', 'lavavajillas', '(Fin de preguntas frecuentes)');
    if (/Hola|Saludos|5555|whatsapp|stock/i.test(put.texto)) throw new Error('el bloque tiene saludos/contacto/stock');
  });
  await caso('faq: después de aplicar, Lucía ya no la marca y re-aplicar no duplica', async () => {
    await T.run({ accion: 'correr', trabajador: 'Lucía' });
    const r = await T.run({ accion: 'resultados', trabajador: 'Lucía' });
    const filaMLA111 = r.split('\n').find((l) => l.startsWith('| MLA111'));
    if (/no están en la descripción/.test(filaMLA111 || '')) throw new Error('Lucía la sigue marcando');
    descripcionesPut.length = 0;
    contiene(await FAQ.run({ item_id: 'MLA111', aplicar: true }), 'ya cubierta');
    if (descripcionesPut.length) throw new Error('reescribió sin nada nuevo');
  });
  await caso('faq: una pregunta nueva se suma al bloque existente, sin perder las anteriores ni duplicarlo', async () => {
    preguntasPorItem.MLA111.push({ id: 11, text: '¿Cuánto tiempo de garantía tiene?', status: 'ANSWERED', date_created: hace(1), answer: { text: 'Hola! 6 meses de garantía del vendedor. Saludos', date_created: hace(1) } });
    contiene(await FAQ.run({ item_id: 'MLA111', aplicar: true }), '1 pregunta(s) nueva(s), 3 en total');
    const d = descripcionesPut.at(-1).texto;
    if (d.split('PREGUNTAS FRECUENTES').length !== 2) throw new Error('duplicó el bloque');
    contiene(d, '27 cm de alto', 'lavavajillas', '6 meses de garantía');
    if (fq.armarDescripcion(d, fq.faltantes(preguntasPorItem.MLA111, d)) !== d) throw new Error('armar de nuevo cambió la descripción (no es idempotente)');
  });
  await caso('faq: valida item_id y respeta el límite de 50.000 caracteres de ML', async () => {
    contiene(await FAQ.run({ item_id: 'x;DROP' }), 'item_id inválido');
    let msg = ''; try { fq.armarDescripcion('x'.repeat(49990), [{ pregunta: '¿Medidas?', respuesta: 'Mide 27 cm.' }]); } catch (e) { msg = e.message; }
    contiene(msg, '50000');
  });

  // ───────────── Clara: agenda comercial y cronograma de MercadoLibre ─────────────
  const ag = await import('../src/agenda.js');
  const AG = tool('ml_agenda');
  const alertasClara = () => tr.alertasRecientes({ trabajador: 'agenda' }).map((a) => a.texto + ' [' + (a.skill || '') + ']').join('\n');
  await caso('Clara: el calendario comercial se calcula solo cada año y por país', async () => {
    const enAnio = (sitio, y, id) => ag.fechasComerciales(sitio, { desde: new Date(y, 0, 1).getTime(), dias: 366 }).find((x) => x.id === id);
    const es = (f, txt) => { if (f.inicio.toDateString() !== txt) throw new Error(`${f.clave}: ${f.inicio.toDateString()} ≠ ${txt}`); };
    es(enAnio('MLA', 2026, 'dia_madre'), 'Sun Oct 18 2026'); es(enAnio('MLA', 2027, 'dia_padre'), 'Sun Jun 20 2027');
    es(enAnio('MLA', 2026, 'black_friday'), 'Fri Nov 27 2026'); es(enAnio('MLA', 2027, 'pascuas'), 'Sun Mar 28 2027');
    es(enAnio('MLM', 2027, 'dia_madres'), 'Mon May 10 2027'); es(enAnio('MLB', 2027, 'dia_maes'), 'Sun May 09 2027');
    if (!enAnio('MLA', 2027, 'hot_sale').estimada || !enAnio('MLA', 2026, 'cybermonday').estimada) throw new Error('Hot Sale/CyberMonday tienen que figurar como estimadas');
    if (enAnio('MLA', 2026, 'navidad').estimada) throw new Error('Navidad no es estimada');
  });
  await caso('Clara: en su primer control ya pregunta por la invitación de ML y por la fecha que viene', async () => {
    const al = alertasClara();
    contiene(al, 'MercadoLibre te invitó a «Hot Sale»', 'inscripción hasta el', '1 publicación(es) tuyas pueden entrar', '¿Querés participar?', 'ref=P-HOT', '[agenda-comercial-ml]');
    const prox = ag.fechasComerciales('MLA', { dias: 30 })[0];
    if (prox) contiene(al, prox.nombre);
  });
  await caso('Clara: no repite el aviso si nada cambió', async () => {
    const r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (r.alertas.length) throw new Error('repitió: ' + r.alertas.map((a) => a.texto).join(' | '));
  });
  await caso('Clara: calendario con lo que viene, ❓ pendientes, estimadas y refs para decidir', async () => {
    const t = await AG.run({ accion: 'calendario', dias: 120 });
    contiene(t, 'Agenda comercial', 'esperan tu decisión', '«Hot Sale»', 'inscripción hasta el', '❓ falta que decidas', 'ref=P-HOT', 'Black Friday', 'ref=black_friday:');
    if (ag.fechasComerciales('MLA', { dias: 120 }).some((f) => f.estimada)) contiene(t, 'fecha estimada');
  });
  await caso('Clara: recuerda el cierre de inscripción mientras no decidas, y calla con un NO', async () => {
    promosML.push({ id: 'P-CYBER', name: 'CyberMonday MercadoLibre', type: 'MARKETPLACE_CAMPAIGN', status: 'candidate', start_date: enDias(12), finish_date: enDias(14), deadline_date: enDias(9) });
    promoItems['P-CYBER'] = [{ id: 'MLA111', original_price: 42000, price: 37800, status: 'candidate' }, { id: 'MLA222', original_price: 30000, price: 27000, status: 'candidate' }];
    let r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (!r.alertas.some((a) => a.texto.includes('te invitó a «CyberMonday MercadoLibre»') && a.texto.includes('2 publicación(es)'))) throw new Error('no avisó la invitación nueva');
    promosML.at(-1).deadline_date = enDias(1); // pasan los días: cierra mañana
    r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (!r.alertas.some((a) => a.nivel === 'alta' && a.texto.includes('⏰ Cierra la inscripción a «CyberMonday MercadoLibre» mañana') && a.texto.includes('¿Querés participar?'))) throw new Error('no recordó el cierre: ' + r.alertas.map((a) => a.texto));
    // otra campaña: le decís que NO apenas llega → ningún recordatorio de cierre después
    promosML.push({ id: 'P-NO', name: 'Liquidación de invierno', type: 'DEAL', status: 'candidate', start_date: enDias(12), finish_date: enDias(14), deadline_date: enDias(9) });
    r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (!r.alertas.some((a) => a.texto.includes('«Liquidación de invierno»'))) throw new Error('no avisó la invitación P-NO');
    contiene(await AG.run({ accion: 'decidir', ref: 'P-NO', participar: false, nota: 'no me da el margen' }), 'no participás', 'no te vuelve a preguntar');
    for (const dias of [3, 1, 0.1]) { // pasan los días hasta el cierre
      promosML.at(-1).deadline_date = enDias(dias);
      r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
      if (r.alertas.some((a) => a.texto.includes('Liquidación de invierno'))) throw new Error(`siguió preguntando después del NO (a ${dias} días del cierre)`);
    }
    contiene(await AG.run({ accion: 'calendario' }), '🚫 no participás → ref=P-NO');
  });
  await caso('Clara: con SÍ te guía a inscribir validando margen, y avisa si no inscribiste nada antes del cierre', async () => {
    const t = await AG.run({ accion: 'decidir', ref: 'P-HOT', participar: true });
    contiene(t, 'participás en P-HOT', 'ml_promociones promocion_id=P-HOT', 'calculadora', 'ml_aceptar_promocion', 'solo con tu OK');
    promosML[0].deadline_date = enDias(2);
    const r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (!r.alertas.some((a) => a.texto.includes('Dijiste que sí a «Hot Sale» pero todavía no inscribiste publicaciones'))) throw new Error('no avisó que faltan inscribir publicaciones');
  });
  await caso('Clara: cuando arranca un evento en el que participás, pide actualizar Mi página; cuando termina, sacar el banner', async () => {
    promosML[0].start_date = enDias(-0.5); promosML[0].finish_date = enDias(2); promosML[0].status = 'started';
    promoItems['P-HOT'] = [{ id: 'MLA111', original_price: 42000, price: 37800, status: 'started' }];
    let r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    const arr = r.alertas.find((a) => a.texto.includes('🚀 Arrancó «Hot Sale»'));
    if (!arr || arr.skill !== 'mi-pagina-ml' || !arr.texto.includes('hasta 10% OFF') || !arr.texto.includes('Mi página')) throw new Error('no avisó el arranque bien: ' + JSON.stringify(arr));
    const kit = await AG.run({ accion: 'pagina' });
    contiene(kit, 'Kit para actualizar Mi página — Hot Sale', '"HOT SALE · HASTA 10% OFF"', 'MLA111', '$ 42.000 → $ 37.800', 'no tiene API pública', 'mi-pagina-ml');
    promosML.splice(0, 1); // la campaña terminó y ya no aparece
    r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (!r.alertas.some((a) => a.texto.includes('🏁 Terminó «Hot Sale»') && a.skill === 'mi-pagina-ml')) throw new Error('no avisó que terminó');
    contiene(await AG.run({ accion: 'pagina' }), 'sin evento tuyo activo', 'más vendidos');
  });
  await caso('Clara: fechas propias y fechas estimadas confirmadas', async () => {
    const en10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    contiene(await AG.run({ accion: 'fecha', nombre: 'Aniversario de la tienda', fecha: en10 }), 'Fecha propia agregada', 'ref=propia:aniversario-de-la-tienda');
    const r = await tr.correrCiclo({ solo: ['agenda'], forzar: true });
    if (!r.alertas.some((a) => a.texto.includes('Aniversario de la tienda') && a.texto.includes('¿Querés participar?'))) throw new Error('no preguntó por la fecha propia');
    const anio = new Date().getFullYear() + 1;
    contiene(await AG.run({ accion: 'fecha', ref: `hot_sale:${anio}`, fecha: `${anio}-05-17` }), 'confirmada');
    const hs = ag.fechasComerciales('MLA', { dias: 400, confirmadas: tr.leerEquipo().agenda.confirmadas }).find((f) => f.clave === `hot_sale:${anio}`);
    if (!hs || hs.estimada || hs.inicio.getDate() !== 17) throw new Error('no usó la fecha confirmada');
    contiene(await AG.run({ accion: 'decidir', ref: 'propia:aniversario-de-la-tienda', participar: true }), 'participás');
  });
  await caso('Clara: valida refs y fechas (nada raro entra al archivo)', async () => {
    for (const ref of ["x'; DROP TABLE", '../../etc', 'promo:' + 'a'.repeat(100)]) { let m = ''; try { await AG.run({ accion: 'decidir', ref, participar: true }); } catch (e) { m = e.message; } contiene(m, 'No reconozco'); }
    let m = ''; try { await AG.run({ accion: 'fecha', nombre: 'X', fecha: '18/10/2026' }); } catch (e) { m = e.message; } contiene(m, 'AAAA-MM-DD');
  });
  await caso('Clara: resultados, equipo e historial', async () => {
    contiene(await T.run({ accion: 'resultados', trabajador: 'Clara' }), 'Agenda comercial', 'Campaña de MercadoLibre', 'Fecha comercial', 'Tu decisión', 'decisión(es) pendiente(s)');
    contiene(await T.run({ accion: 'equipo', trabajador: 'Clara' }), 'cada 1 día', 'agenda-comercial-ml', 'mi-pagina-ml');
    contiene(await T.run({ accion: 'historial', trabajador: 'Clara' }), 'Campañas de ML', 'Decisiones pendientes');
  });

  // ───────────── Ramiro, Ana, Leo, Carmen y el jefe ─────────────
  const CER = tool('ml_cerebro');
  const hist = (id) => tr.alertasRecientes({ trabajador: id }).map((a) => a.texto + ' [' + (a.skill || '') + ']').join('\n');
  const deTrab = (id, r) => r.alertas.filter((a) => a.trabajador === id).map((a) => a.texto + ' [' + (a.skill || '') + ']').join('\n');
  await caso('Ramiro: sin costos cargados no inventa — pide cargarlos', async () => {
    await tr.correrCiclo({ solo: ['rentabilidad'], forzar: true });
    const t = hist('rentabilidad'); // ya avisó en su primer control (y no repite en la semana)
    contiene(t, 'no tienen costo cargado', 'MLA222', 'MLA333', 'ml_cerebro', '[cerebro-ml]', '[tienda TIENDA_DEMO]');
  });
  await caso('Ramiro: con costos calcula margen real (comisión + ads + impuestos) y avisa la PÉRDIDA', async () => {
    await CER.run({ accion: 'guardar', item_id: 'MLA111', costo: 40000 });
    await CER.run({ accion: 'guardar', item_id: 'MLA222', costo: 9000 });
    await CER.run({ accion: 'guardar', item_id: 'MLA333', costo: 15000 });
    await CER.run({ accion: 'guardar', impuestos_pct: 10 });
    const r = await tr.correrCiclo({ solo: ['rentabilidad'], forzar: true });
    contiene(deTrab('rentabilidad', r), '💸 MLA111', 'te hace PERDER', 'la publicidad se lleva', '[calculadora-ml]');
    const res = await T.run({ accion: 'resultados', trabajador: 'Ramiro' });
    contiene(res, 'Analista de rentabilidad', 'MLA111', '🔴', 'Ganancia por unidad', 'con PÉRDIDA');
    // 42000 − 14% (5880) − ads 15000/10 (1500) − 10% imp (4200) − costo 40000 = −9580
    contiene(res, '$ -9.580');
  });
  await caso('Ana: resumen de la semana, campaña que gasta sin vender y ACOS arriba de lo que aguanta el margen (cruce con Ramiro)', async () => {
    await CER.run({ accion: 'guardar', item_id: 'MLA111', costo: 30000 });
    await tr.correrCiclo({ solo: ['rentabilidad'], forzar: true }); // margen chico: aguanta poco ACOS
    let r = await tr.correrCiclo({ solo: ['anuncios'], forzar: true });
    contiene(deTrab('anuncios', r), 'ACOS 12.5%', 'tu margen aguanta hasta', '[publicidad-ml]');
    contiene(hist('anuncios'), 'invertiste $ 30.000'); // el resumen sale en su primer control
    campaniasML = [{ ...campaniasML[0], metrics: { cost: 30000, acos: null, units_quantity: 0, total_amount: 0 } }];
    r = await tr.correrCiclo({ solo: ['anuncios'], forzar: true });
    contiene(deTrab('anuncios', r), '🔥 La campaña «Campaña general» gastó $ 30.000 en 7 días SIN ventas');
    r = await tr.correrCiclo({ solo: ['anuncios'], forzar: true });
    if (deTrab('anuncios', r).includes('SIN ventas')) throw new Error('repitió el aviso');
  });
  await caso('Leo: lo que hay que despachar (Flex con horario), demorados, devueltos y la tasa de demora', async () => {
    let r = await tr.correrCiclo({ solo: ['logistica'], forzar: true });
    const h = hist('logistica'); // lo pendiente lo avisó en su primer control
    contiene(h, '📦 1 venta(s) para despachar', '#102 Mate Demo', 'Flex', 'despachá antes del', '[logistica-ml]');
    if (/despachar: #101/.test(h)) throw new Error('pidió despachar una venta FULL (la despacha ML)');
    envios[101] = { ...envios[101], substatus: 'delayed' };
    envios[103] = { ...envios[103], status: 'not_delivered' }; // (la orden 100 tiene 10 días: fuera de la ventana de 7 de Leo)
    demoraRate = 0.06;
    r = await tr.correrCiclo({ solo: ['logistica'], forzar: true });
    const t = deTrab('logistica', r);
    contiene(t, '🚨 Envío demorado: orden #101', 'no se pudo entregar', 'subió de 2.0% a 6.0%');
    if (t.includes('para despachar')) throw new Error('repitió el despacho ya avisado');
    const d = await tool('ml_despachos').run({});
    contiene(d, 'Despachos', 'Devueltos / no entregados', 'Demorados', 'Para despachar (1)', '#102', 'FULL', 'Flex', '6.0%');
  });
  await caso('Carmen: números del mes con comisiones reales y aviso de parcial; ml_numeros completo', async () => {
    const NUM = tool('ml_numeros');
    contiene(await NUM.run({ mes: 'xx' }), 'mes inválido');
    const t = await NUM.run({});
    contiene(t, 'Números de', 'Facturación', 'Comisiones de MercadoLibre', 'Impuestos (10%)', 'Costo de mercadería', 'Resultado neto', 'no reemplaza la contabilidad formal');
    contiene(await NUM.run({ mes: 'anterior' }), 'Números de');
    const r = await tr.correrCiclo({ solo: ['contabilidad'], forzar: true });
    const r2 = await tr.correrCiclo({ solo: ['contabilidad'], forzar: true });
    if (deTrab('contabilidad', r2).includes('hasta hoy')) throw new Error('repitió el resumen del mes');
    contiene(await T.run({ accion: 'resultados', trabajador: 'Carmen' }), 'Contadora', 'Facturación', '− Comisiones de MercadoLibre', '= Resultado neto', 'Mes anterior');
    void r;
  });
  await caso('Jefe: reparte el objetivo entre los trabajadores que corresponden y arma el plan en orden', async () => {
    const J = tool('ml_jefe');
    const t = await J.run({ objetivo: 'quiero ganar más plata por cada venta' });
    contiene(t, 'Jefe de equipo', 'ganar más por venta', 'Ramiro', 'Carmen', 'Ana', 'El plan, en orden', '1. ', 'calculadora-ml', '✋ con tu OK', 'dale');
    for (const n of ['Vera', 'Leo', 'Lucía', 'Sofía']) if (t.includes(`${n} (`)) throw new Error(`metió a ${n} en un objetivo de margen`);
    const rep = await J.run({ objetivo: 'mejorar la reputación y los envíos', sin_correr: true });
    contiene(rep, 'Leo', 'logistica-ml', 'sin correrlo ahora');
    const todo = await J.run({ objetivo: 'xyz' , sin_correr: true });
    contiene(todo, 'todo el equipo');
    if (todo.includes('Lucía (')) throw new Error('el jefe disparó la auditoría completa sin que el objetivo lo pida');
    const pubs = await J.run({ objetivo: 'mis publicaciones están desactualizadas', sin_correr: true });
    contiene(pubs, 'Lucía', 'mejorar-publicaciones-ml');
    contiene(await J.run({ objetivo: 'x' }), 'Decime el objetivo');
  });
  await caso('Jefe con nombre: el vendedor lo nombra, se valida y aparece en el plan, la lista del equipo y el tablero', async () => {
    const J = tool('ml_jefe'), T = tool('ml_trabajadores');
    contiene(await T.run({ accion: 'equipo' }), 'Jefe de equipo: **El jefe**', 'el jefe se llama');
    contiene(await J.run({ nombre: '  Don   Ramón ' }), 'ahora es **🎩 Don Ramón**', 'Don Ramón, ¿cómo vendo más');
    for (const [malo, motivo] of [['Vera', 'ya es'], ['sofia', 'ya es'], ['<img src=x onerror=alert(1)>', 'Usá solo letras'], ['x'.repeat(31), 'hasta 30'], ['Ana; DROP TABLE', 'Usá solo letras']]) {
      const r = await J.run({ nombre: malo });
      contiene(r, 'No le cambié el nombre', motivo);
    }
    contiene(await J.run({ emoji: '<b>' }), 'un solo emoji');
    if (tr.jefe().nombre !== 'Don Ramón') throw new Error('un nombre rechazado pisó el anterior');
    contiene(await J.run({ emoji: '👑' }), '👑 Don Ramón');
    const plan = await J.run({ objetivo: 'mejorar la reputación', sin_correr: true });
    contiene(plan, '# 👑 Don Ramón, jefe de equipo — objetivo');
    contiene(await T.run({ accion: 'equipo' }), '👑 Jefe de equipo: **Don Ramón**');
    const { datos } = await (await import('../src/tablero.js')).generarTablero();
    if (datos.jefe?.nombre !== 'Don Ramón' || datos.jefe.emoji !== '👑' || !datos.jefe.propio) throw new Error('el tablero no trae al jefe con su nombre: ' + JSON.stringify(datos.jefe));
    const plan2 = await J.run({ nombre: 'Jefa Ana María', objetivo: 'vender más', sin_correr: true });
    contiene(plan2, 'ahora es **👑 Jefa Ana María**', 'Jefa Ana María, jefe de equipo — objetivo');
    contiene(await J.run({ nombre: '' }), 'volvió a llamarse **🎩 El jefe**');
    contiene(await J.run({ objetivo: 'vender más', sin_correr: true }), '# 🎩 Jefe de equipo — objetivo');
  });

  await caso('mejorador: fotos para mirar, video, resumen en 5 renglones, medidas, características, qué viene y FAQ de 20 con 90 días de preguntas', async () => {
    const mj = await import('../src/mejorador.js');
    const hace = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const B = `http://localhost:${PUERTO}/fotos/`;
    mercado.items = { ...(mercado.items || {}), MLA700: { title: 'Termo Acero Inoxidable 1 Litro Negro', video_id: null,
      pictures: [{ secure_url: B + '1.jpg' }, { secure_url: B + 'no-imagen' }, { secure_url: 'https://evil.example.com/x.jpg' }, { secure_url: 'http://169.254.169.254/latest/meta-data' }],
      attributes: [{ id: 'HEIGHT', name: 'Altura', value_name: '27 cm' }, { id: 'WEIGHT', name: 'Peso', value_name: '480 g' }, { id: 'MATERIAL', name: 'Material', value_name: 'Acero inoxidable' }, { id: 'BRAND', name: 'Marca', value_name: 'Lumi' }, { id: 'SELLER_SKU', value_name: 'TER-1L' }] } };
    descripciones.MLA700 = 'Hola! Bienvenidos a nuestra tienda, gracias por visitarnos.\nTermo de acero de muy buena calidad que mantiene el agua caliente todo el día.\nEnvío en el día.';
    const qs = [];
    for (let i = 0; i < 24; i++) qs.push({ id: i, status: 'ANSWERED', date_created: hace(1 + i * 3), text: `¿Es apto para zona${i}a zona${i}b zona${i}c?`, answer: { text: `Hola! Sí, es apto para zona${i}a. Saludos`, date_created: hace(1 + i * 3) } });
    qs.push({ id: 90, status: 'ANSWERED', date_created: hace(100), text: '¿Viejisima pregunta muyvieja totalmentevieja?', answer: { text: 'Respuesta vieja.', date_created: hace(100) } });
    qs.push({ id: 91, status: 'UNANSWERED', date_created: hace(2), text: '¿Cuánto mide de alto?' });
    qs.push({ id: 92, status: 'ANSWERED', date_created: hace(3), text: '¿Tenés stock?', answer: { text: 'Sí, hay stock.', date_created: hace(3) } });
    qs.push({ id: 93, status: 'ANSWERED', date_created: hace(4), text: '¿Hacen precio por mayor raro?', answer: { text: 'Escribime al 11 5555 5555', date_created: hace(4) } });
    qs.sort((a, b) => Date.parse(b.date_created) - Date.parse(a.date_created));
    preguntasPorItem.MLA700 = qs;
    // URLs de fotos: solo el CDN de ML por https
    for (const [u, ok] of [['https://http2.mlstatic.com/D_NQ_x-O.jpg', true], ['https://mlstatic.com.evil.com/x.jpg', false], ['https://user:pw@http2.mlstatic.com/x.jpg', false], ['http://http2.mlstatic.com/x.jpg', false], ['file:///etc/passwd', false], ['javascript:alert(1)', false]])
      if (!!mj.urlFotoValida(u) !== ok) throw new Error('urlFotoValida(' + u + ') debería ser ' + ok);
    // Títulos de sección: "Medidas: 27 cm" cuenta; "Viene con tapón." dentro del resumen no
    const rd = mj.revisarDescripcion('Termo de acero 1 litro.\nViene con tapón cebador.\nIdeal para el mate.\nMedidas: 27 cm de alto\nCaracterísticas\n- Acero\n- Negro\n📦 Qué viene en la caja\n- 1 termo', 'Termo acero');
    if (rd.resumen.length !== 3 || rd.secciones.medidas !== 3 || rd.secciones.incluye !== 7 || !rd.ok) throw new Error('reconoció mal las secciones: ' + JSON.stringify(rd));
    // Revisión
    const r = await tool('ml_mejorar_publicacion').run({ item_id: 'mla700' });
    if (typeof r !== 'object' || !Array.isArray(r.imagenes)) throw new Error('no devolvió fotos para mirar');
    if (r.imagenes.length !== 1 || r.imagenes[0].mimeType !== 'image/jpeg') throw new Error('trajo fotos que no tenía que traer: ' + r.imagenes.length);
    contiene(r.texto, 'Medidas en las fotos', 'te muestro 1 de 4 foto(s)', 'Altura: 27 cm', '🎬 **Video:** ❌', 'arranca con un saludo', 'falta la sección MEDIDAS', 'falta la sección CARACTERÍSTICAS', 'falta la sección QUÉ VIENE EN LA CAJA',
      'Preguntas de los últimos 90 días:** 27', '**1 sin responder**', 'FAQ de 20 pregunta(s)', 'FAQ propuesto (20 preguntas', '20. **', 'Material: Acero inoxidable', 'ml_aplicar_mejora item_id=MLA700', 'skill imagenes-ml');
    if (r.texto.includes('Viejisima') || r.texto.includes('5555') || r.texto.includes('¿Tenés stock?')) throw new Error('metió en el FAQ algo viejo, con contacto o de stock');
    contiene((await tool('ml_mejorar_publicacion').run({ item_id: 'MLA111', fotos: false })).texto, '🎬 **Video:** ✅');
    contiene(await tool('ml_mejorar_publicacion').run({ item_id: '../etc' }), 'item_id inválido');
    // Aplicar: validaciones
    const AP = tool('ml_aplicar_mejora');
    const base = { item_id: 'MLA700', resumen: ['Termo de acero inoxidable de 1 litro, negro.', 'Mantiene el mate caliente todo el día.', 'Mide 27 cm de alto y pesa 480 g.', 'Viene con tapón cebador.'], medidas: ['Alto: 27 cm', 'Peso: 480 g'], caracteristicas: ['Material: acero inoxidable', 'Marca: Lumi', 'Doble pared'], incluye: ['1 termo', '1 tapón cebador'] };
    for (const [cambio, motivo] of [[{ resumen: ['Uno', 'Dos'] }, 'al menos 3'], [{ resumen: ['1', '2', '3', '4', '5', '6'] }, 'máximo 5'], [{ medidas: ['Bastante alto'] }, 'medida con número'], [{ caracteristicas: ['Escribinos por WhatsApp', 'Doble pared'] }, 'datos de contacto'], [{ incluye: ['<b>termo</b>'] }, 'HTML'], [{ caracteristicas: ['visitá www.mitienda.com', 'x'] }, 'datos de contacto']]) {
      contiene(await AP.run({ ...base, ...cambio }), 'No la armé', motivo);
    }
    const putsAntes = descripcionesPut.length;
    const prev = await AP.run(base);
    contiene(prev, 'Así quedaría', 'MEDIDAS\n- Alto: 27 cm', 'CARACTERÍSTICAS PRINCIPALES\n- Material: acero inoxidable', 'QUÉ VIENE EN LA CAJA\n- 1 termo', 'PREGUNTAS FRECUENTES', '✅ resumen', '✅ orden', '20 preguntas frecuentes', 'No toqué nada');
    if (descripcionesPut.length !== putsAntes) throw new Error('escribió sin confirmar');
    const vieja = descripciones.MLA700;
    const ok = await AP.run({ ...base, confirmar: true });
    contiene(ok, 'Descripción mejorada en 1 publicación(es)', '20 preguntas frecuentes', 'respaldo en');
    const nueva = descripciones.MLA700, ls = nueva.split('\n');
    if (ls[0] !== base.resumen[0] || ls.slice(0, 5).some((l) => /^(MEDIDAS|CARACTER)/.test(l))) throw new Error('los 5 primeros renglones no son el resumen');
    const i = (t) => nueva.indexOf(t);
    if (!(i('MEDIDAS') < i('CARACTERÍSTICAS PRINCIPALES') && i('CARACTERÍSTICAS PRINCIPALES') < i('QUÉ VIENE EN LA CAJA') && i('QUÉ VIENE EN LA CAJA') < i('PREGUNTAS FRECUENTES'))) throw new Error('orden equivocado');
    if ((nueva.match(/^¿/gm) || []).length !== 20) throw new Error('el FAQ no tiene 20 preguntas');
    if (!mj.revisarDescripcion(nueva.split('PREGUNTAS FRECUENTES')[0], 'Termo Acero Inoxidable 1 Litro Negro').ok) throw new Error('la descripción nueva no pasa su propio chequeo');
    const resp = /`([^`]+respaldos[^`]+)`/.exec(ok)[1];
    if (fs.readFileSync(resp, 'utf8') !== vieja) throw new Error('el respaldo no es la descripción anterior');
    if (process.platform !== 'win32' && (fs.statSync(resp).mode & 0o077)) throw new Error('el respaldo no es privado');
    // Aplicarla otra vez no duplica el FAQ
    await AP.run({ ...base, confirmar: true });
    if ((descripciones.MLA700.match(/PREGUNTAS FRECUENTES/g) || []).length !== 1 || (descripciones.MLA700.match(/^¿/gm) || []).length !== 20) throw new Error('duplicó el FAQ al aplicar dos veces');
    // Lucía marca las descripciones sin la estructura
    const au = await import('../src/auditoria.js');
    const ev = au.evaluar({ b: { title: 'Termo Acero 1 Litro', pictures: [], attributes: [] }, desc: vieja + '\n' + 'Texto largo. '.repeat(20) });
    if (!ev.problemas.some((p) => p.codigo === 'descripcion_estructura' && p.texto.includes('ml_mejorar_publicacion'))) throw new Error('Lucía no marcó la descripción desordenada');
  });

  await caso('mejorador multicuenta: encuentra la tienda de cada publicación, aplica al mismo SKU en todas tus tiendas y barre todas', async () => {
    const hace = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const sku = [{ id: 'SELLER_SKU', value_name: 'TER-1L' }];
    mercado.items = { ...(mercado.items || {}),
      MLA710: { seller_id: 777, title: 'Termo Acero 1 Litro Negro', attributes: sku, pictures: [] },
      MLA711: { seller_id: 777, title: 'Otro producto', attributes: [{ id: 'SELLER_SKU', value_name: 'TER-1L-PACK' }], pictures: [] },
      MLA810: { seller_id: 888, title: 'Termo Acero 1 Litro Negro (tienda dos)', attributes: sku, pictures: [], video_id: 'v1' },
      MLA811: { seller_id: 888, title: 'Mate de la tienda dos', attributes: [], pictures: [] },
      MLA999999: { seller_id: 123456, title: 'Termo de un rival', attributes: sku, pictures: [] } };
    porSkuDeTienda[777] = { 'TER-1L': ['MLA710', 'MLA711'] }; porSkuDeTienda[888] = { 'TER-1L': ['MLA810'] };
    descripciones.MLA810 = 'Descripción vieja de la tienda dos.';
    preguntasPorItem.MLA810 = [{ id: 1, status: 'ANSWERED', date_created: hace(2), text: '¿Es apto para camping montaña?', answer: { text: 'Sí, ideal para camping.', date_created: hace(2) } }];
    // Revisión de una publicación de la SEGUNDA tienda sin decir la cuenta
    const r = await tool('ml_mejorar_publicacion').run({ item_id: 'MLA810', fotos: false });
    contiene(r.texto, '🏪 Tienda **TIENDA_DOS**', 'SKU TER-1L', 'El mismo producto en tus otras publicaciones', 'MLA710 en **TIENDA_DEMO**', 'mismo_sku=true', '🎬 **Video:** ✅');
    if (r.texto.includes('MLA711')) throw new Error('mezcló un SKU parecido pero distinto');
    // Publicación ajena: se puede mirar, no aplicar
    contiene((await tool('ml_mejorar_publicacion').run({ item_id: 'MLA999999', fotos: false })).texto, 'no es de tus tiendas conectadas');
    const AP = tool('ml_aplicar_mejora');
    const base = { resumen: ['Termo de acero de 1 litro.', 'Mantiene el agua caliente 24 horas.', 'Mide 27 cm de alto.'], medidas: ['Alto: 27 cm'], caracteristicas: ['Acero inoxidable', 'Doble pared'], incluye: ['1 termo'] };
    contiene(await AP.run({ ...base, item_id: 'MLA999999', confirmar: true }), 'no es de ninguna de tus tiendas');
    contiene(await AP.run({ ...base, item_id: 'MLA811', mismo_sku: true }), 'no tiene SKU');
    // Vista previa con mismo SKU: muestra las dos tiendas y no escribe
    const puts = descripcionesPut.length;
    const prev = await AP.run({ ...base, item_id: 'MLA710', mismo_sku: true });
    contiene(prev, 'MLA710 (TIENDA_DEMO)', 'También se aplicaría en 1 publicación(es) con el SKU TER-1L', 'MLA810 (TIENDA_DOS)', 'con 1 preguntas frecuentes de SUS compradores', 'mismo_sku=true confirmar=true');
    if (descripcionesPut.length !== puts) throw new Error('escribió sin confirmar');
    const ok = await AP.run({ ...base, item_id: 'MLA710', mismo_sku: true, confirmar: true });
    contiene(ok, 'mejorada en 2 publicación(es)', '**MLA710 (TIENDA_DEMO)**', '**MLA810 (TIENDA_DOS)**');
    const escritas = descripcionesPut.slice(puts).map((x) => x.id).sort();
    if (escritas.join() !== 'MLA710,MLA810') throw new Error('escribió en: ' + escritas);
    if (!descripciones.MLA810.includes('¿Es apto para camping montaña?') || descripciones.MLA710.includes('camping')) throw new Error('el FAQ no es el de las preguntas de cada publicación');
    if (!descripciones.MLA810.startsWith('Termo de acero de 1 litro.')) throw new Error('no aplicó la estructura en la otra tienda');
    // Barrido de todas las tiendas
    const antes = itemsPorEstado.active; itemsPorEstado.active = ['MLA700', 'MLA710']; activos888 = ['MLA810', 'MLA811'];
    try {
      const bar = await tool('ml_mejorar_publicacion').run({});
      contiene(bar, 'barrido de 2 tienda(s)', '🏪 TIENDA_DEMO — 2 publicación(es)', '🏪 TIENDA_DOS — 2 publicación(es)', '| Publicación | Resumen (5 renglones)', 'MLA811', 'El mismo producto en varias tiendas', '**TER-1L**: ', 'MLA810 (TIENDA_DOS)', 'medidas en las fotos');
      const solo = await tool('ml_mejorar_publicacion').run({ cuenta: '888' });
      contiene(solo, 'barrido de 1 tienda(s)', 'TIENDA_DOS'); if (solo.includes('TIENDA_DEMO —')) throw new Error('barrió una tienda que no se pidió');
      contiene(await tool('ml_mejorar_publicacion').run({ cuenta: '555' }), 'no está conectada');
    } finally { itemsPorEstado.active = antes; activos888 = null; }
  });

  await caso('nichos: rotación, ¿se vende hoy?, oportunidad vs monopolio, techo, tipo, números y ranking — con la API oficial', async () => {
    const D = 86400000, ahora = Date.now();
    const dias = (n) => new Date(ahora - n * D).toISOString();
    const curva = (porDia) => Array.from({ length: 150 }, (_, i) => ({ date: new Date(ahora - (149 - i) * D - 3600000).toISOString(), total: porDia(149 - i) }));
    mercado.nichos = {}; mercado.visitasDia = {}; mercado.visitasTotal = {};
    mercado.items = mercado.items || {};
    const alta = (q, id, { vendedor, precio, vendidos, edad, oficial, visitas, total }) => {
      (mercado.nichos[q] = mercado.nichos[q] || []).push({ id, title: `${q} ${id}`, price: precio, seller: { id: vendedor, nickname: 'V' + vendedor }, shipping: { free_shipping: true, logistic_type: 'fulfillment' }, ...(oficial ? { official_store_id: 9 } : {}) });
      mercado.items[id] = { start_time: dias(edad), sold_quantity: vendidos, price: precio };
      if (visitas) mercado.visitasDia[id] = curva(visitas);
      if (total != null) mercado.visitasTotal[id] = total;
    };
    // A: organizador de cocina — repartido entre 8 vendedores, 2 nuevos que ya venden, visitas parejas
    for (let v = 1; v <= 8; v++) for (let k = 0; k < 2; k++) alta('organizador de cocina', `MLA5${v}${k}`, { vendedor: 100 + v, precio: 9000 + v * 300, vendidos: 600 + v * 40, edad: 300, visitas: () => 100, total: 30000 });
    alta('organizador de cocina', 'MLA5901', { vendedor: 201, precio: 9500, vendidos: 150, edad: 45, visitas: () => 120, total: 5400 });
    alta('organizador de cocina', 'MLA5902', { vendedor: 202, precio: 9900, vendidos: 60, edad: 70, visitas: () => 80, total: 5600 });
    // B: cargador — un vendedor se lleva casi todo, visitas cayendo, publicaciones viejas que vendieron en el pasado
    alta('cargador celular', 'MLA6001', { vendedor: 300, oficial: true, precio: 15000, vendidos: 50000, edad: 1100, visitas: (d) => (d < 30 ? 60 : 200), total: 900000 });
    alta('cargador celular', 'MLA6002', { vendedor: 300, precio: 15500, vendidos: 30000, edad: 1000, visitas: (d) => (d < 30 ? 50 : 180), total: 700000 });
    alta('cargador celular', 'MLA6003', { vendedor: 300, precio: 14000, vendidos: 20000, edad: 900, visitas: (d) => (d < 30 ? 40 : 150), total: 600000 });
    alta('cargador celular', 'MLA6004', { vendedor: 301, precio: 16000, vendidos: 200, edad: 400, visitas: () => 5, total: 2000 });
    // C: ventilador de pie — estacional
    for (let v = 1; v <= 4; v++) alta('ventilador de pie', `MLA70${v}`, { vendedor: 400 + v, precio: 60000, vendidos: 300, edad: 365, visitas: () => 50, total: 20000 });
    const N = tool('ml_nichos');
    // Detalle de un nicho con costo
    const t = await N.run({ busqueda: 'organizador de cocina', costo: 3000 });
    contiene(t, 'Nicho: «organizador de cocina» — 🟢 oportunidad', 'de 720 en total', '1. ¿Cuánto rota?', 'Rotación / mes', '✅ se vende hoy', '2. ¿Se vende hoy o vendió en el pasado?', 'la demanda es actual',
      '3. ¿Oportunidad o monopolio?', '🟢 repartido', '4. Techo de demanda', 'unidades por mes', 'arrancó hace **45 días** y vende ≈ **100 u./mes**', '5. Tendencia, estacional o evergreen', '♾️ evergreen', '6. ¿Cierran los números?', 'Comisión ML', '✅ Cierra', 'envío gratis 100%');
    // Monopolio, en baja, con publicaciones que vendieron en el pasado
    const m = await N.run({ busqueda: 'cargador celular' });
    contiene(m, '🔴 monopolio', 'V300 (tienda oficial)', '📉 en baja', 'vendieron en el pasado', 'Nadie que haya entrado en los últimos 90 días', 'Decime tu costo');
    if (!/🔴 descartar|🟡 entrar diferenciado/.test(m)) throw new Error('un monopolio en baja no puede salir como oportunidad');
    contiene(await N.run({ busqueda: 'ventilador de pie' }), '🗓️ estacional', 'diciembre', '🟡 peleado'); // 4 vendedores parejos: no es monopolio
    const nj = await import('../src/nichos.js');
    const it = () => [{ id: 'X', vendidos: 100, inicio: ahora - 400 * D, vendedor: { id: '1' }, precio: 10 }];
    if (nj.analizarNicho(it(), { pulso: { medidos: 1, tramos: [100, 400, 380, 120, 90], porItem: {} }, palabra: 'cosa' }).tipo !== 'estacional') throw new Error('una curva que sube y baja no salió estacional');
    if (nj.analizarNicho(it(), { pulso: { medidos: 1, tramos: [100, 100, 110, 120, 200], porItem: {} }, palabra: 'cosa' }).tipo !== 'tendencia') throw new Error('una curva que sube fuerte no salió tendencia');
    // Ranking de varios
    const r = await N.run({ busquedas: ['cargador celular', 'organizador de cocina', 'ventilador de pie'] });
    contiene(r, 'Ranking de oportunidades — 3 nichos', '| 1 | organizador de cocina |', 'arrancó hace 45 días');
    if (r.indexOf('| 1 | organizador de cocina') > r.indexOf('cargador celular |')) throw new Error('el ranking no ordenó por puntaje');
    // Por categoría y validaciones
    mercado.nichos['cat:MLA5000'] = mercado.nichos['organizador de cocina'];
    contiene(await N.run({ categoria: 'mla5000' }), 'Nicho: «Organización de cocina»');
    contiene(await N.run({}), 'Decime qué nicho analizar');
    contiene(await N.run({ categoria: '../x' }), 'categoria inválida');
    contiene(await N.run({ busqueda: 'x', sitio: 'MLA/../../users' }), 'sitio inválido');
    // Sin ventas informadas: no inventa la rotación
    alta('sin datos', 'MLA8001', { vendedor: 1, precio: 100, vendidos: 0, edad: 10 }); mercado.items.MLA8001 = {};
    contiene(await N.run({ busqueda: 'sin datos' }), 'no informa ventas');
  });

  await caso('Emma: cada semana analiza tus nichos, avisa cuando uno es o pasa a 🟢, y llega a los resultados, al jefe y al tablero', async () => {
    const e = tr.EQUIPO.nichos;
    if (e.nombre !== 'Emma' || e.intervalo !== 7 * 24 * 60 || !e.skills.some((x) => x.skill === 'nichos-ml')) throw new Error('Emma mal definida');
    let msg = ''; try { tr.asignarTarea('Emma', { ref: '<script>' }); } catch (x) { msg = x.message; }
    if (!msg.includes('búsqueda del nicho')) throw new Error('aceptó una ref inválida: ' + msg);
    const a = tr.asignarTarea('emma', { ref: 'organizador de cocina' });
    if (a.tarea.tipo !== 'nicho') throw new Error('tipo por defecto: ' + a.tarea.tipo);
    tr.asignarTarea('Emma', { ref: 'cargador celular' });
    const r1 = await tr.correrCiclo({ solo: ['nichos'], forzar: true });
    const txt = r1.alertas.map((x) => x.texto).join('\n');
    contiene(txt, '🧭 «organizador de cocina» es 🟢 oportunidad', 'sin dueño', 'ya vende ≈ 100 u./mes', 'ml_nichos busqueda="organizador de cocina"');
    if (txt.includes('«cargador celular» es 🟢')) throw new Error('marcó como oportunidad un monopolio');
    if (r1.alertas.some((x) => x.skill !== 'nichos-ml')) throw new Error('alerta sin la skill nichos-ml');
    const r2 = await tr.correrCiclo({ solo: ['nichos'], forzar: true });
    if (r2.alertas.some((x) => x.texto.includes('organizador de cocina'))) throw new Error('repitió el aviso sin cambios');
    // Si el nicho se monopoliza, avisa que dejó de ser oportunidad
    const antes = mercado.nichos['organizador de cocina'];
    mercado.nichos['organizador de cocina'] = antes.map((x) => ({ ...x, seller: { id: 999, nickname: 'GIGANTE' } }));
    const r3 = await tr.correrCiclo({ solo: ['nichos'], forzar: true });
    contiene(r3.alertas.map((x) => x.texto).join('\n'), '«organizador de cocina» dejó de ser oportunidad');
    mercado.nichos['organizador de cocina'] = antes;
    await tr.correrCiclo({ solo: ['nichos'], forzar: true });
    // Resultados, jefe y tablero
    const res = (await import('../src/resultados.js')).armarResultados();
    contiene(res.nichos.destacado, 'Mejor nicho: «organizador de cocina»');
    if (res.nichos.filas[0][0] !== 'organizador de cocina') throw new Error('la tabla no ordena por puntaje');
    contiene(await tool('ml_jefe').run({ objetivo: '¿qué producto conviene vender? buscame un nicho', sin_correr: true }), 'Emma', 'nichos-ml');
    if ((await tool('ml_jefe').run({ objetivo: 'xyz', sin_correr: true })).includes('Emma (')) throw new Error('el jefe metió a Emma sin que el objetivo lo pida');
    const { datos } = await (await import('../src/tablero.js')).generarTablero();
    if (datos.nichos?.[0]?.nombre !== 'organizador de cocina' || !datos.funciona.some((x) => x.texto.includes('Nicho con oportunidad'))) throw new Error('el tablero no trae el ranking de nichos');
    // Sin tareas propias ni búsquedas seguidas: explora las tendencias del sitio
    const tend = mercado.tendencias; mercado.tendencias = [{ keyword: 'organizador de cocina' }, { keyword: 'cargador celular' }];
    try {
      const f = await tr.OFICIOS.nichos.foto(new (await import('../src/meli.js')).MeliClient({}), { tipo: 'nicho', ref: 'tendencias del sitio', radar: true }, 'MLA');
      if (!f.radar || Object.keys(f.nichos).join() !== 'organizador de cocina,cargador celular') throw new Error('el radar no tomó las tendencias: ' + Object.keys(f.nichos));
      contiene(tr.OFICIOS.nichos.cambios({ ref: 'tendencias del sitio', radar: true }, null, f).map((x) => x.texto).join(' '), '(en tendencia)');
    } finally { mercado.tendencias = tend; }
    tr.quitarTarea('Emma', 'organizador de cocina'); tr.quitarTarea('Emma', 'cargador celular');
  });

  // ───────────── Nico, Paula, Iván, Valen, Gabi, Sole y Fede ─────────────
  const pv = await import('../src/postventa.js');
  await caso('Nico: días de stock por producto, se corta esta semana y sin stock vendiendo', async () => {
    mercado.items.MLA111 = { ...(mercado.items.MLA111 || {}), available_quantity: 1 };   // vende 2 en 30 días → 15 días… y con 1 u.
    mercado.items.MLA222 = { ...(mercado.items.MLA222 || {}), available_quantity: 0 };   // vendía y se quedó sin stock
    tr.actualizarEquipo((d) => { for (const k of Object.keys(d.snapshots)) if (k.startsWith('stock|')) delete d.snapshots[k]; });
    const r = await tr.correrCiclo({ solo: ['stock'], forzar: true });
    const t = deTrab('stock', r);
    contiene(t, '🛑 MLA222', 'SIN STOCK', 'perdés', '[stock-ml]');
    contiene(await T.run({ accion: 'resultados', trabajador: 'Nico' }), 'Encargado de stock', 'Días de stock', '🛑 SIN STOCK', 'sin stock vendiendo');
    const r2 = await tr.correrCiclo({ solo: ['stock'], forzar: true });
    if (deTrab('stock', r2).includes('MLA222')) throw new Error('repitió el aviso de sin stock');
  });
  await caso('Paula: preguntas sin responder (y las que pasan 2 h) y mensajes sin leer', async () => {
    preguntasPend = [...preguntasPend, { id: 556, item_id: 'MLA222', text: '¿Viene con caja?', date_created: new Date(Date.now() - 3 * 3600000).toISOString() }];
    mensajesPend = [{ resource: '/packs/2000001', count: 2 }];
    const r = await tr.correrCiclo({ solo: ['atencion'], forzar: true });
    const t = deTrab('atencion', r);
    contiene(t, '«¿Viene con caja?»', 'más de 2 horas', '2 mensaje(s) de compradores sin leer', '[responder-preguntas-ml]');
    preguntasPend = preguntasPend.filter((q) => q.id !== 556); // la respondió
    const r2 = await tr.correrCiclo({ solo: ['atencion'], forzar: true });
    if (deTrab('atencion', r2)) throw new Error('avisó de nuevo sin novedades: ' + deTrab('atencion', r2));
    contiene(await T.run({ accion: 'resultados', trabajador: 'Paula' }), 'Atención al comprador', '¿Tenés stock?', '📨 Mensaje');
  });
  await caso('Iván: reclamo nuevo con plazo, vencimiento en 24 h, mediación y cierre', async () => {
    reclamosML = [{ id: 7001, resource_id: 101, type: 'mediations', stage: 'claim', status: 'opened', reason_id: 'PNR', date_created: new Date().toISOString(), players: [{ role: 'complainant' }, { role: 'respondent', available_actions: [{ action: 'send_message_to_complainant', due_date: new Date(Date.now() + 3 * 86400000).toISOString(), mandatory: true }] }] }];
    let r = await tr.correrCiclo({ solo: ['reclamos'], forzar: true });
    contiene(deTrab('reclamos', r), 'Reclamo nuevo #7001', 'tenés que responder en 3 días', '[reclamos-ml]');
    reclamosML[0] = { ...reclamosML[0], stage: 'dispute', players: [{ role: 'respondent', available_actions: [{ action: 'send_message_to_mediator', due_date: new Date(Date.now() + 10 * 3600000).toISOString() }] }] };
    r = await tr.correrCiclo({ solo: ['reclamos'], forzar: true });
    contiene(deTrab('reclamos', r), 'pasó a MEDIACIÓN', '⏰ El plazo del reclamo #7001 vence en 10 h', 'afecta tu reputación');
    reclamosML = [];
    r = await tr.correrCiclo({ solo: ['reclamos'], forzar: true });
    contiene(deTrab('reclamos', r), '✅ Se cerró el reclamo #7001');
  });
  await caso('Valen: reputación, métricas que suben y opinión negativa nueva', async () => {
    let r = await tr.correrCiclo({ solo: ['reputacion'], forzar: true });
    contiene(tr.alertasRecientes({ trabajador: 'reputacion' }).map((a) => a.texto).join('\n'), 'Tu reputación', 'verde', 'MercadoLíder platinum');
    opinionesML.MLA111 = { rating_average: 4.2, paging: { total: 13 }, reviews: [{ id: 2, rate: 1, title: 'Malísimo', content: 'No mantiene el calor', date_created: new Date().toISOString() }, ...opinionesML.MLA111.reviews] };
    demoraRate = 0.12;
    r = await tr.correrCiclo({ solo: ['reputacion'], forzar: true });
    contiene(deTrab('reputacion', r), 'Opinión de 1 estrella(s) en MLA111', 'No mantiene el calor', 'bajó de 4.6 a 4.2', 'Subió tu tasa de despachos con demora', '[reputacion-ml]');
  });
  await caso('Gabi: catálogo perdido con precio ganador y si conviene por margen; recuperado', async () => {
    ptwMLA111 = { status: 'winning', current_price: 42000, price_to_win: 42000, boosts: [] };
    await tr.correrCiclo({ solo: ['catalogo'], forzar: true });
    ptwMLA111 = { status: 'competing', current_price: 42000, price_to_win: 39900, boosts: [{ id: 'fulfillment' }] };
    let r = await tr.correrCiclo({ solo: ['catalogo'], forzar: true });
    contiene(deTrab('catalogo', r), '🏷️ Perdiste el catálogo de MLA111', 'ganás con $ 39.900', 'fulfillment', 'por unidad', '[competencia-ml]');
    ptwMLA111 = { status: 'winning', current_price: 39900, price_to_win: 39900, boosts: [] };
    r = await tr.correrCiclo({ solo: ['catalogo'], forzar: true });
    contiene(deTrab('catalogo', r), '✅ Recuperaste el catálogo de MLA111');
  });
  await caso('Sole: publicaciones moderadas con el motivo en castellano, y cuando se resuelven', async () => {
    itemsPorEstado.under_review = ['MLA444']; mercado.items.MLA444 = { status: 'under_review', sub_status: ['waiting_for_patch'], title: 'Mate imperial' };
    portadaPobre = ['MLA222'];
    let r = await tr.correrCiclo({ solo: ['moderaciones'], forzar: true });
    contiene(deTrab('moderaciones', r), '🚫 MLA444', 'en revisión', 'esperando que corrijas datos', 'MLA222', 'foto de portada de baja calidad', '[moderaciones-ml]');
    itemsPorEstado.under_review = []; portadaPobre = [];
    r = await tr.correrCiclo({ solo: ['moderaciones'], forzar: true });
    contiene(deTrab('moderaciones', r), '✅ Se resolvió la moderación de MLA444');
  });
  await caso('Fede: proveedor por publicación de ML y por web (schema.org); precio, recargo y sin stock', async () => {
    process.env.ML_PROVEEDOR_PERMITIR_LOCAL = '1';
    mercado.items.MLA900 = { price: 20000, available_quantity: 50, status: 'active', title: 'Termo mayorista (proveedor)' };
    mercado.items.MLA111 = { ...(mercado.items.MLA111 || {}), price: 42000, available_quantity: 8 };
    contiene(await T.run({ accion: 'asignar', trabajador: 'Fede', ref: 'MLA111', fuente: 'MLA900', recargo: 80 }), 'Fede', 'proveedor MLA900', 'recargo 80%');
    contiene(await T.run({ accion: 'asignar', trabajador: 'Fede', ref: 'MLA222', fuente: `http://localhost:${PUERTO}/proveedor/termo` }), 'Fede');
    let r = await tr.correrCiclo({ solo: ['proveedores'], forzar: true });
    contiene(deTrab('proveedores', r), 'el proveedor está a $ 20.000', 'tendrías que vender a $ 36.000');
    mercado.items.MLA900 = { ...mercado.items.MLA900, price: 23000 };
    paginasProveedor.termo = { precio: '27.500,00', disponible: 'https://schema.org/OutOfStock' };
    mercado.items.MLA222 = { ...(mercado.items.MLA222 || {}), available_quantity: 5, status: 'active' };
    r = await tr.correrCiclo({ solo: ['proveedores'], forzar: true });
    const t = deTrab('proveedores', r);
    contiene(t, 'cambió el precio: $ 20.000 → $ 23.000 (↑ 15.0%)', 'tendrías que vender a $ 41.400', '$ 25.000 → $ 27.500', '🛑 El proveedor se quedó SIN STOCK', 'MLA222', '[proveedores-ml]');
    contiene(await T.run({ accion: 'resultados', trabajador: 'Fede' }), 'Proveedores', 'Precio sugerido', '🛑 agotado', 'localhost');
    let m = ''; try { await T.run({ accion: 'asignar', trabajador: 'Fede', ref: 'MLA111', fuente: 'ftp://x' }); } catch (e) { m = e.message; } contiene(m, 'Falta fuente');
    m = ''; try { await T.run({ accion: 'asignar', trabajador: 'Fede', ref: 'termo', fuente: 'MLA900' }); } catch (e) { m = e.message; } contiene(m, 'TU publicación');
    delete process.env.ML_PROVEEDOR_PERMITIR_LOCAL;
  });
  await caso('Fede: seguridad — solo https público (sin red interna, sin credenciales en la URL)', async () => {
    for (const [u, esperado] of [['http://tienda.com/x', 'https'], ['https://127.0.0.1/x', 'red privada'], ['https://192.168.0.10/x', 'red privada'], ['https://10.1.2.3/x', 'red privada'], ['https://[::1]/x', 'red privada'], ['https://usr:clave@tienda.com/x', 'usuario/contraseña'], [`http://localhost:${PUERTO}/proveedor/termo`, 'https']]) {
      let m = ''; try { await pv.validarURLProveedor(u); } catch (e) { m = e.message; }
      if (!m.includes(esperado)) throw new Error(`${u} → "${m}" (esperaba "${esperado}")`);
    }
    const f = pv.leerFichaProducto(`<meta property="product:price:amount" content="1.234,50"><title>X</title>`);
    if (f.precio !== 1234.5) throw new Error('no leyó el precio de la meta: ' + f.precio);
    process.env.ML_PROVEEDOR_PERMITIR_LOCAL = '1';
    let m = ''; try { await pv.precioProveedor(null, `http://localhost:${PUERTO}/proveedor-sin-datos`); } catch (e) { m = e.message; }
    delete process.env.ML_PROVEEDOR_PERMITIR_LOCAL;
    contiene(m, 'no encontré el precio');
  });
  await caso('Jefe: con 19 trabajadores, reparte reputación, stock y proveedores a quien corresponde', async () => {
    const J = tool('ml_jefe');
    contiene(await J.run({ objetivo: 'cuidar la reputación', sin_correr: true }), 'Iván', 'Valen', 'reclamos-ml');
    contiene(await J.run({ objetivo: 'no quedarme sin stock', sin_correr: true }), 'Nico', 'Fede', 'stock-ml');
    const todo = await J.run({ objetivo: 'xyz', sin_correr: true });
    if (todo.includes('Fede (')) throw new Error('el jefe metió a Fede sin que el objetivo lo pida');
  });

  // ───────────── Base de datos del equipo (SQLite que viene con Node) ─────────────
  const bd = await import('../src/db.js');
  const correrHijo = (codigo, envExtra = {}) => new Promise((res, rej) => {
    const h = spawn(process.execPath, ['--input-type=module', '-e', codigo], { env: { ...process.env, ...envExtra }, cwd: process.cwd() });
    let out = '', err = ''; h.stdout.on('data', (x) => { out += x; }); h.stderr.on('data', (x) => { err += x; });
    h.on('exit', (code) => code === 0 ? res({ out, err }) : rej(new Error('hijo falló: ' + err.slice(0, 300))));
  });
  const src = (f) => JSON.stringify(new URL('../src/' + f, import.meta.url).href);
  await caso('base: se crea sola (equipo.db, modo WAL, 3 tablas) y guarda alertas y mediciones', async () => {
    const e = bd.estadoDB();
    if (!e.activa) throw new Error('no activa: ' + e.motivo);
    if (!fs.existsSync(path.join(dirTemp, 'equipo.db'))) throw new Error('no creó equipo.db');
    if (bd.db().prepare('PRAGMA journal_mode').get().journal_mode !== 'wal') throw new Error('no está en WAL (Claude + servicio a la vez)');
    if (e.mediciones.n < 10 || e.alertas.n < 5 || e.controles.n < 3) throw new Error('guardó poco: ' + JSON.stringify(e));
    if (tr.leerEquipo().bandeja.length) throw new Error('las alertas siguen en el JSON en vez de la base');
    contiene(await T.run({ accion: 'base' }), 'activa', 'equipo.db', 'Mediciones', 'nada que instalar', 'DBBrowserForSQLite');
    contiene(await T.run({ accion: 'equipo' }), '🗄️ Base de datos', 'mediciones');
  });
  await caso('base: historial día por día de Vera (mín/máx/variación) y de Tomás (ventas y $/mes)', async () => {
    const v = await T.run({ accion: 'historial', ref: 'MLA500' });
    contiene(v, 'Historial', 'Vera · MLA500', 'Mínimo $ 36.000', 'máximo $ 45.000', '↓', 'Precio rival', 'Tu precio');
    // simular 2 días reales: la primera medición de MLA650 pasa a hace 48 h
    const db0 = bd.db(); const p0 = db0.prepare("SELECT MIN(id) AS id FROM mediciones WHERE ref = 'MLA650' AND trabajador = 'ventas'").get().id;
    db0.prepare('UPDATE mediciones SET t = t - ? WHERE id = ?').run(2 * 86400000, p0);
    const t = await T.run({ accion: 'historial', ref: 'MLA650', trabajador: 'Tomás' });
    contiene(t, 'Tomás · MLA650', 'Vendió ~10 u. en 2.0 días', '≈ 5.0 u./día', '/mes', 'Vendió ese día');
    if (!/≈ \$ 1\.(49\d|50\d)\.\d{3}\/mes/.test(t)) throw new Error('facturación mensual fuera de rango: ' + t.slice(0, 200));
    contiene(await T.run({ accion: 'historial', trabajador: 'Martina' }), 'Tu mejor puesto', 'líder(es) distinto(s)');
    contiene(await T.run({ accion: 'historial', trabajador: 'Sofía' }), 'Top 3 de tendencias', 'termo de vidrio');
  });
  await caso('base: inyección SQL en ref no hace nada (consultas preparadas)', async () => {
    contiene(await T.run({ accion: 'historial', ref: "x' OR '1'='1" }), 'Sin mediciones');
    contiene(await T.run({ accion: 'historial', ref: "MLA500'; DROP TABLE mediciones; --" }), 'Sin mediciones');
    if (!bd.estadoDB().mediciones.n) throw new Error('se borró la tabla');
  });
  await caso('base: Claude y el servicio 24/7 escriben y leen a la vez sin "database is locked"', async () => {
    tr.leerBandeja({ marcar: true }); // dejar todo leído
    const codigo = `const b = await import(${src('db.js')});
      for (let i = 0; i < 400; i++) b.guardarAlertas([{ t: Date.now(), trabajador: 'precios', ref: 'CONC', nivel: 'media', texto: 'alerta concurrente ' + i }, { t: Date.now(), trabajador: 'ventas', ref: 'CONC', nivel: 'baja', texto: 'otra ' + i }]);
      console.log('ok');`;
    let terminados = 0;
    const todos = Promise.all([correrHijo(codigo), correrHijo(codigo), correrHijo(codigo)].map((p) => p.finally(() => { terminados++; })));
    todos.catch(() => {}); // el error se reporta abajo, no como rechazo suelto
    let leidas = 0;
    while (terminados < 3) { leidas += tr.leerBandeja({ marcar: true }).filter((a) => a.ref === 'CONC').length; await esperar(1); }
    await todos;
    for (let lote; (lote = tr.leerBandeja({ marcar: true }).filter((a) => a.ref === 'CONC').length); ) leidas += lote;
    if (leidas !== 2400) throw new Error(`se leyeron ${leidas} de 2400 alertas concurrentes (perdidas o duplicadas)`);
  });
  await caso('base: el informe trae TODAS las alertas sin leer aunque se junten miles', async () => {
    const muchas = Array.from({ length: 1200 }, (_, i) => ({ t: Date.now(), trabajador: 'ventas', ref: 'MUCHAS', nivel: 'baja', texto: 'acumulada ' + i }));
    bd.guardarAlertas(muchas);
    const n = tr.leerBandeja({ marcar: true }).filter((a) => a.ref === 'MUCHAS').length;
    if (n !== 1200) throw new Error(`trajo ${n} de 1200`);
    if (tr.leerBandeja({ marcar: true }).some((a) => a.ref === 'MUCHAS')) throw new Error('quedaron sin marcar');
  });
  await caso('base: migra sola las alertas del JSON de la versión anterior (una sola vez)', async () => {
    const dirM = fs.mkdtempSync(path.join(os.tmpdir(), 'meli-mig-'));
    fs.writeFileSync(path.join(dirM, 'trabajadores.json'), JSON.stringify({ bandeja: [
      { t: Date.now() - 3600000, trabajador: 'precios', ref: 'MLA1', nivel: 'alta', texto: 'vieja alerta 1', leida: false },
      { t: Date.now() - 1800000, trabajador: 'ventas', ref: 'MLA2', nivel: 'media', texto: 'vieja alerta 2', leida: true } ] }));
    const { out } = await correrHijo(`const t = await import(${src('trabajadores.js')});
      const a = t.leerBandeja({ marcar: true }); const b = t.leerBandeja({ marcar: true }); const todas = t.leerBandeja({ todas: true, marcar: false });
      console.log(JSON.stringify({ a: a.length, b: b.length, todas: todas.length, json: t.leerEquipo().bandeja.length }));`, { MELI_CONFIG_DIR: dirM });
    const r = JSON.parse(out.trim().split('\n').pop());
    fs.rmSync(dirM, { recursive: true, force: true });
    if (r.a !== 1 || r.b !== 0 || r.todas !== 2 || r.json !== 0) throw new Error('migración incorrecta: ' + JSON.stringify(r));
  });
  await caso('base: con un Node sin SQLite el equipo sigue andando y explica cómo activarla en Windows', async () => {
    const dirS = fs.mkdtempSync(path.join(os.tmpdir(), 'meli-sin-'));
    const { out } = await correrHijo(`const { TOOLS } = await import(${src('herramientas.js')}); const t = await import(${src('trabajadores.js')});
      const T = TOOLS.find((x) => x.name === 'ml_trabajadores');
      t.actualizarEquipo((d) => { d.bandeja.push({ t: Date.now(), trabajador: 'precios', ref: 'X', nivel: 'alta', texto: 'alerta sin base', leida: false }); });
      console.log(JSON.stringify({ base: await T.run({ accion: 'base' }), hist: await T.run({ accion: 'historial', ref: 'X' }), informe: await T.run({ accion: 'informe' }), conteo: t.resumenAlertas('precios') }));`, { MELI_CONFIG_DIR: dirS, ML_SIN_SQLITE: '1' });
    const r = JSON.parse(out.trim().split('\n').pop());
    fs.rmSync(dirS, { recursive: true, force: true });
    contiene(r.base, 'no activa', 'winget install OpenJS.NodeJS.LTS', 'No hay que instalar ninguna base');
    contiene(r.hist, 'necesita la base');
    contiene(r.informe, 'alerta sin base');
    if (r.conteo.sinLeer !== 0 || r.conteo.h24 !== 1) throw new Error('conteo JSON mal: ' + JSON.stringify(r.conteo));
  });
  await caso('base: backup consistente con la base en uso', async () => {
    const t = await T.run({ accion: 'base', backup: true });
    contiene(t, 'Backup hecho', 'equipo-backup-');
    const archivo = t.match(/`([^`]*equipo-backup-[^`]*)`/)[1];
    const { DatabaseSync } = (await import('node:module')).createRequire(import.meta.url)('node:sqlite');
    const copia = new DatabaseSync(archivo, { readOnly: true });
    const n = copia.prepare('SELECT COUNT(*) AS n FROM mediciones').get().n; copia.close();
    if (n !== bd.estadoDB().mediciones.n) throw new Error('el backup no tiene todas las mediciones');
  });
  await caso('base: el historial también va a Drive (pestaña Historial y Historial.csv)', async () => {
    process.env.ML_DRIVE_PERMITIR_LOCAL = '1';
    const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'drive2-'));
    planilla.recibidos.length = 0;
    await T.run({ accion: 'drive', url: urlPlanilla, carpeta: dirD });
    const h = planilla.recibidos.at(-1).resultados['Historial'];
    if (!h || h[0][0] !== 'Fecha' || !h.some((f) => f[2] === 'MLA500')) throw new Error('la planilla no recibió el historial');
    contiene(fs.readFileSync(path.join(dirD, rs.CARPETA_NOMBRE, 'Historial.csv'), 'utf8'), 'Fecha,Trabajador', 'MLA500', 'Vera');
    await T.run({ accion: 'drive', quitar: 'todo' });
    fs.rmSync(dirD, { recursive: true, force: true }); delete process.env.ML_DRIVE_PERMITIR_LOCAL;
  });
  await caso('base: sin avisos "experimental" ensuciando la consola del servicio', async () => {
    const h = spawn(process.execPath, ['src/stdio.js', 'trabajadores', 'estado'], { env: { ...process.env } });
    let out = '', err = ''; h.stdout.on('data', (x) => { out += x; }); h.stderr.on('data', (x) => { err += x; });
    await new Promise((r) => h.on('exit', r));
    contiene(out, '🗄️ Base de datos', 'equipo.db');
    if (/ExperimentalWarning/.test(err)) throw new Error('imprimió ExperimentalWarning');
  });

  // ───────────── El tablero del día ─────────────
  await caso('tablero: se arma con lo de los 19 trabajadores, archivo privado y se regenera solo', async () => {
    mercado.items.MLA500 = { ...(mercado.items.MLA500 || {}), title: '</script><img src=x onerror=alert(1)>Termo trucho' };
    await tr.correrCiclo({ solo: ['precios'], forzar: true });
    const t = await tool('ml_tablero').run({});
    contiene(t, 'Tablero del día listo', 'file://', 'tablero.html', 'funcionando', 'para atender', 'tutorial');
    const ruta = path.join(dirTemp, 'tablero.html');
    if ((fs.statSync(ruta).mode & 0o777) !== 0o600) throw new Error('el tablero no es privado (0600)');
    const html = fs.readFileSync(ruta, 'utf8');
    if (html.includes('</script><img')) throw new Error('un texto de un rival puede romper la página (XSS)');
    const m = html.match(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/);
    const datos = JSON.parse(m[1]);
    if (datos.equipo.length !== 19) throw new Error('faltan trabajadores en el tablero');
    if (!datos.frase || !datos.numeros.length) throw new Error('sin frase o números');
    if (!JSON.stringify(datos).includes('<img src=x')) throw new Error('perdió el texto (tenía que quedar como texto, escapado)');
    if (!datos.atencion.some((x) => x.quien === 'stock') || !datos.funciona.length) throw new Error('no armó funciona/atención');
    if (process.env.TABLERO_COPIA) fs.copyFileSync(ruta, process.env.TABLERO_COPIA);
    const antes = fs.statSync(ruta).mtimeMs;
    await esperar(20);
    await tr.correrCiclo({ solo: ['atencion'], forzar: true });
    if (fs.statSync(ruta).mtimeMs === antes) throw new Error('no se regeneró después del control');
  });
  await caso('tablero: ventas y publicidad día por día y el total de hoy en vivo', async () => {
    await tr.correrCiclo({ solo: ['contabilidad', 'anuncios'], forzar: true });
    const { datos } = await (await import('../src/tablero.js')).generarTablero();
    if (datos.ventasDia.length !== 30) throw new Error('ventasDia tiene ' + datos.ventasDia.length + ' días');
    // hoy: órdenes 101 (42.000) y 102 (18.500) en cada una de las 2 tiendas conectadas
    if (datos.hoy.ventas !== 121000 || datos.hoy.ordenes !== 4 || !datos.hoy.enVivo) throw new Error('total de hoy mal: ' + JSON.stringify(datos.hoy));
    const ayer = datos.ventasDia.at(-2);
    if (ayer.bruto !== 40000 || ayer.ordenes !== 2) throw new Error('ayer mal: ' + JSON.stringify(ayer));
    const dia = new Date().getDate();
    if (datos.hoy.ads !== 2000 * dia || datos.hoy.acos !== 10) throw new Error('publicidad de hoy mal: ' + JSON.stringify(datos.hoy));
    if (datos.adsDia.length < 2) throw new Error('falta la publicidad por día');
    const sn = Object.entries(tr.leerEquipo().snapshots).find(([k]) => k.startsWith('anuncios|'))[1];
    if (Object.keys(sn.datos.diario).length < 2) throw new Error('Ana no guardó la publicidad por día');
  });
  await caso('tablero: la plantilla sola abre en modo demo y la página no usa innerHTML', async () => {
    const plantilla = fs.readFileSync('panel/tablero.html', 'utf8');
    contiene(plantilla, '/*__DATOS_DEL_TABLERO__*/null', 'datos de ejemplo', 'Ver tutorial', 'prefers-reduced-motion');
    if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(plantilla)) throw new Error('la página arma HTML con texto (riesgo XSS)');
  });

  await caso('instalador: crea el config de Claude desde cero', async () => {
    const dirCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cfg-'));
    process.env.CLAUDE_CONFIG_DIR = dirCfg;
    const { instalar, rutaConfig } = await import('../src/instalar.js');
    await instalar({ appId: 'APP-X', appSecret: 'SEC-X' });
    const cfg = JSON.parse(fs.readFileSync(rutaConfig(), 'utf8'));
    const m = cfg.mcpServers.mercadolibre;
    if (m.env.ML_APP_ID !== 'APP-X' || m.command !== 'npx' || !m.args[1].includes('mercadolibre-sellers-mcp')) throw new Error('config mal escrito');
    fs.rmSync(dirCfg, { recursive: true, force: true }); delete process.env.CLAUDE_CONFIG_DIR;
  });
  await caso('instalador: respeta otros conectores existentes y hace backup', async () => {
    const dirCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cfg-'));
    process.env.CLAUDE_CONFIG_DIR = dirCfg;
    const { instalar, rutaConfig } = await import('../src/instalar.js');
    fs.writeFileSync(rutaConfig(), JSON.stringify({ mcpServers: { otro: { command: 'x' } }, tema: 'oscuro' }));
    await instalar({ appId: 'APP-Y', appSecret: 'SEC-Y', soloLectura: true });
    const cfg = JSON.parse(fs.readFileSync(rutaConfig(), 'utf8'));
    if (!cfg.mcpServers.otro || cfg.tema !== 'oscuro') throw new Error('pisó la config existente');
    if (cfg.mcpServers.mercadolibre.env.ML_SOLO_LECTURA !== '1') throw new Error('no aplicó solo-lectura');
    if (!fs.readdirSync(dirCfg).some((f) => f.includes('.backup-'))) throw new Error('no hizo backup');
    fs.rmSync(dirCfg, { recursive: true, force: true }); delete process.env.CLAUDE_CONFIG_DIR;
  });
  await caso('instalador por CLI: npx ... instalar con flags', async () => {
    const dirCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cfg-'));
    const hijo = spawn(process.execPath, ['src/stdio.js', 'instalar', '--app-id', 'APP-CLI', '--secret', 'SEC-CLI'], { env: { ...process.env, CLAUDE_CONFIG_DIR: dirCfg }, stdio: ['ignore', 'pipe', 'pipe'] });
    let fin = '';
    hijo.stdout.on('data', (d) => { fin += d; });
    await new Promise((res) => hijo.on('exit', res));
    const cfg = JSON.parse(fs.readFileSync(path.join(dirCfg, 'claude_desktop_config.json'), 'utf8'));
    if (cfg.mcpServers.mercadolibre.env.ML_APP_ID !== 'APP-CLI') throw new Error('CLI no escribió el config');
    if (!fin.includes('Conector instalado')) throw new Error('no mostró confirmación');
    fs.rmSync(dirCfg, { recursive: true, force: true });
  });
  await caso('modo stdio: initialize + tools/list', async () => {
    const hijo = spawn(process.execPath, ['src/stdio.js'], { env: { ...process.env } });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
    hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    hijo.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    for (let i = 0; i < 40 && !salida.includes('"id":2'); i++) await esperar(250);
    hijo.kill();
    const linea = salida.split('\n').find((l) => l.includes('"id":2'));
    const total = linea ? JSON.parse(linea).result.tools.length : 0;
    if (total !== TOOLS.length) throw new Error(`tools/list devolvió ${total}, esperaba ${TOOLS.length}`);
  });

  try { (await import('../src/db.js')).cerrarDB(); } catch {}
  fs.rmSync(dirTemp, { recursive: true, force: true });
  return resultados;
}

// ─────────────────────────────── main ───────────────────────────────
const modo = process.argv[2] || 'dev';
const mock = crearMockMeli().listen(PUERTO, () => { if (modo === 'dev') console.log(`[dev] MercadoLibre simulado en http://localhost:${PUERTO}`); });

if (modo === 'test') {
  const resultados = await pruebas();
  mock.close();
  let fallas = 0;
  for (const [nombre, ok, err] of resultados) {
    console.log((ok ? '  ✅ ' : '  ❌ ') + nombre + (ok ? '' : ' — ' + err));
    if (!ok) fallas++;
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : `\nTodo OK (${resultados.length} pruebas)`);
  process.exit(fallas ? 1 : 0);
} else {
  console.log('[dev] Para usar el conector contra el simulado: MELI_API_BASE=http://localhost:' + PUERTO + ' y conectá con code CODE-OK');
}
