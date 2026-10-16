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
const planilla = { recibidos: [], respuestas: [], clave: null }; // Apps Script simulado // ms: simula un refresh lento para forzar carreras entre procesos
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
    seller_reputation: { level_id: '5_green', power_seller_status: 'platinum', transactions: { total: 1543 }, metrics: { claims: { rate: 0.001 }, delayed_handling_time: { rate: 0.02 }, cancellations: { rate: 0 } } },
  }));
  app.get('/orders/search', auth, (req, res) => {
    const desde = String(req.query['order.date_created.from'] || '1970-01-01');
    const hasta = String(req.query['order.date_created.to'] || '9999-12-31');
    const todas = [
      { id: 101, date_created: new Date(Date.now() - 60000).toISOString(), total_amount: 42000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Termo Demo 1L' }, quantity: 1, unit_price: 42000 }] },
      { id: 102, date_created: new Date(Date.now() - 60000).toISOString(), total_amount: 18500, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Mate Demo' }, quantity: 2, unit_price: 9250 }] },
      { id: 103, date_created: new Date(Date.now() - 86400000).toISOString(), total_amount: 20000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Termo Demo 1L' }, quantity: 1, unit_price: 20000 }] },
      { id: 100, date_created: new Date(Date.now() - 10 * 86400000).toISOString(), total_amount: 20000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Termo viejo' }, quantity: 1, unit_price: 20000 }] },
    ];
    const resultados = todas.filter((o) => o.date_created >= desde && o.date_created <= hasta);
    return res.json({ paging: { total: resultados.length }, results: resultados });
  });
  app.get('/orders/101/shipments', auth, (_q, res) => res.json({ status: 'shipped', substatus: 'in_transit', tracking_number: 'TRK123', logistic_type: 'fulfillment', receiver_address: { state: { name: 'Buenos Aires' } } }));
  app.get('/orders/102/shipments', auth, (_q, res) => res.json({ status: 'ready_to_ship', logistic_type: 'self_service', receiver_address: { state: { name: 'Capital Federal' } } }));
  app.get('/orders/100/shipments', auth, (_q, res) => res.json({ status: 'delivered', logistic_type: 'cross_docking', receiver_address: { state: { name: 'Santa Fe' } } }));
  app.get('/orders/103/shipments', auth, (_q, res) => res.json({ status: 'delivered', logistic_type: 'cross_docking', receiver_address: { state: { name: 'Córdoba' } } }));
  app.get('/users/:uid/items/search', auth, (_q, res) => res.json({ paging: { total: 2 }, results: ['MLA111', 'MLA222'] }));
  app.get('/items', auth, (req, res) => res.json(String(req.query.ids).split(',').map((id) => ({ code: 200, body: { id, title: 'Producto ' + id, price: 42000, currency_id: 'ARS', available_quantity: 10, sold_quantity: 55, status: 'active', permalink: 'https://articulo.mercadolibre.com.ar/' + id, catalog_listing: id === 'MLA111' } }))));
  app.get('/items/:id', auth, (req, res) => res.json({ ...itemMLA111, id: req.params.id, title: 'Producto ' + req.params.id, ...(mercado.items?.[req.params.id] || {}) }));
  app.get('/items/:id/description', auth, (_q, res) => res.json({ plain_text: 'Descripción original del producto.' }));
  app.post('/items', auth, (req, res) => {
    ultimoItemCreado = req.body;
    if (!req.body?.title || !req.body?.category_id) return res.status(400).json({ message: 'faltan campos' });
    res.json({ id: 'MLA999', title: req.body.title, price: req.body.price, permalink: 'https://articulo.mercadolibre.com.ar/MLA999', status: 'active' });
  });
  app.post('/items/:id/description', auth, (req, res) => res.json({ ok: true }));
  app.put('/items/:id', auth, (req, res) => res.json({ id: req.params.id, price: req.body.price ?? 42000, currency_id: 'ARS', available_quantity: req.body.available_quantity ?? 10, status: req.body.status ?? 'active' }));
  app.get('/items/:id/visits/time_window', auth, (_q, res) => res.json({ total_visits: 340 }));
  app.get('/items/:id/price_to_win', auth, (_q, res) => res.json({ status: 'losing', current_price: 42000, price_to_win: 39900, boosts: [{ id: 'fulfillment' }] }));
  app.get('/questions/search', auth, (_q, res) => res.json({ total: 1, questions: [{ id: 555, item_id: 'MLA111', text: '¿Tenés stock?' }] }));
  app.post('/answers', auth, (req, res) => req.body?.question_id ? res.json({ ok: true }) : res.status(400).json({ message: 'falta question_id' }));
  app.get('/sites/MLA/listing_prices', auth, (_q, res) => res.json([{ listing_type_id: 'gold_special', listing_type_name: 'Clásica', sale_fee_amount: 5900, sale_fee_details: { percentage_fee: 14, fixed_fee: 0 } }]));
  app.get('/sites/MLA/search', auth, (req, res) => {
    if (req.query.nickname || req.query.seller_id) return res.json({ paging: { total: mercado.rival.length }, results: mercado.rival });
    if (req.query.q === 'termo 1 litro') return res.json({ paging: { total: mercado.busqueda.length }, results: mercado.busqueda });
    return res.json({ paging: { total: 2 }, results: [{ title: 'Termo rival', price: 39999, currency_id: 'ARS', seller: { nickname: 'RIVAL' }, shipping: { free_shipping: true } }, { title: 'Termo caro', price: 52000, currency_id: 'ARS', seller: { nickname: 'OTRO' } }] });
  });
  app.get('/seller-promotions/users/777', auth, (_q, res) => res.json({ results: [{ id: 'P-HOT', name: 'Hot Sale', type: 'DEAL', status: 'candidate' }] }));
  app.get('/seller-promotions/promotions/P-HOT/items', auth, (_q, res) => res.json({ results: [{ id: 'MLA111', original_price: 42000, suggested_discounted_price: 37800, meli_percentage: 5 }] }));
  app.post('/seller-promotions/items/:id', auth, (req, res) => req.body?.promotion_id ? res.json({ ok: true }) : res.status(400).json({ message: 'falta promotion_id' }));
  app.get('/trends/MLA', auth, (_q, res) => res.json(mercado.tendencias));
  app.get('/advertising/advertisers', auth, (_q, res) => res.json({ advertisers: [{ advertiser_id: 'ADV1', site_id: 'MLA' }] }));
  app.get('/advertising/product_ads/campaigns', auth, (_q, res) => res.json({ results: [{ id: 'C1', name: 'Campaña general', status: 'active', budget: 5000, metrics: { cost: 30000, acos: 15, units_quantity: 25 } }] }));
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
    const t = await tool('ml_crear_publicacion').run({ copiar_de: 'MLA111', precio: 45000, titulo: 'Producto MLA111 copia' });
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
    if (escrituras.length !== 7) throw new Error('esperaba 7 herramientas de escritura, hay ' + escrituras.length);
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
  await caso('trabajadores: equipo con 5 nombres, puestos y skills a cargo', async () => {
    const t = await T.run({ accion: 'equipo' });
    contiene(t, 'Vera', 'Tomás', 'Martina', 'Bruno', 'Sofía', 'Centinela de precios', 'Cazador de rivales', 'calculadora-ml', 'competencia-ml', 'descubrir-ganadores-ml', 'mejorar-publicaciones-ml', 'panel-ventas-ml');
    if (tr.IDS.length !== 5) throw new Error('el equipo no tiene 5');
    const todas = tr.IDS.flatMap((id) => tr.EQUIPO[id].skills.map((x) => x.skill));
    if (new Set(todas).size !== todas.length) throw new Error('una skill está asignada a dos trabajadores');
    for (const sk of todas) if (!fs.existsSync(path.join('skills', sk, 'SKILL.md'))) throw new Error('skill inexistente: ' + sk);
  });
  await caso('trabajadores: asignar por nombre (con y sin acento) o puesto, tipo deducido', async () => {
    mercado.items = { MLA500: { price: 45000, sold_quantity: 10, available_quantity: 5, status: 'active', title: 'Termo rival A' }, MLA600: { price: 30000, sold_quantity: 100, available_quantity: 3, status: 'active', title: 'Termo rival B' } };
    mercado.busqueda = [{ id: 'MLA901', title: 'Termo líder', price: 35000, seller: { nickname: 'LIDER' } }, { id: 'MLA111', title: 'Mi termo', price: 42000, seller: { nickname: 'TIENDA_DEMO' } }];
    contiene(await T.run({ accion: 'asignar', trabajador: 'Vera', ref: 'MLA500', mi_item: 'MLA111' }), 'Vera', 'publicacion', 'MLA500', 'MLA111', 'calculadora-ml');
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
  await caso('trabajadores: primer control guarda la base y no inventa alertas', async () => {
    const t = await T.run({ accion: 'correr' });
    contiene(t, 'Sin novedades', 'foto de base');
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
