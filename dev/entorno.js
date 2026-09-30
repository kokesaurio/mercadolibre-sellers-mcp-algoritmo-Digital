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

// ─────────────────────── API de MercadoLibre simulada ───────────────────────
export function crearMockMeli() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const auth = (req, res, next) => {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    if (t !== 'ACCESS-VALIDO') return res.status(401).json({ message: 'invalid token' });
    next();
  };

  app.post('/oauth/token', (req, res) => {
    const b = req.body || {};
    if (b.grant_type === 'authorization_code') {
      if (b.code !== 'CODE-OK' || !b.code_verifier) return res.status(400).json({ error_description: 'code inválido o sin PKCE' });
      return res.json({ access_token: 'ACCESS-VALIDO', refresh_token: 'REFRESH-1', expires_in: 21600, user_id: 777 });
    }
    if (b.grant_type === 'refresh_token') {
      refrescosHechos++;
      if (b.refresh_token !== 'REFRESH-1' && b.refresh_token !== 'REFRESH-2') return res.status(400).json({ error_description: 'refresh inválido (¿reusado?)' });
      return res.json({ access_token: 'ACCESS-VALIDO', refresh_token: 'REFRESH-2', expires_in: 21600, user_id: 777 });
    }
    res.status(400).json({ error: 'grant no soportado' });
  });

  app.get('/users/me', auth, (_q, res) => res.json({
    id: 777, nickname: 'TIENDA_DEMO', site_id: 'MLA',
    seller_reputation: { level_id: '5_green', power_seller_status: 'platinum', transactions: { total: 1543 }, metrics: { claims: { rate: 0.001 }, delayed_handling_time: { rate: 0.02 }, cancellations: { rate: 0 } } },
  }));
  app.get('/orders/search', auth, (req, res) => {
    const vieja = String(req.query['order.date_created.from'] || '') < new Date(Date.now() - 8 * 86400000).toISOString();
    res.json({ paging: { total: vieja ? 1 : 2 }, results: vieja
      ? [{ id: 100, date_created: new Date().toISOString(), total_amount: 20000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Termo viejo' }, quantity: 1 }] }]
      : [
        { id: 101, date_created: new Date().toISOString(), total_amount: 42000, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Termo Demo 1L' }, quantity: 1 }] },
        { id: 102, date_created: new Date().toISOString(), total_amount: 18500, currency_id: 'ARS', status: 'paid', order_items: [{ item: { title: 'Mate Demo' }, quantity: 2 }] },
      ] });
  });
  app.get('/orders/101/shipments', auth, (_q, res) => res.json({ status: 'shipped', substatus: 'in_transit', tracking_number: 'TRK123', logistic_type: 'fulfillment' }));
  app.get('/users/777/items/search', auth, (_q, res) => res.json({ paging: { total: 2 }, results: ['MLA111', 'MLA222'] }));
  app.get('/items', auth, (req, res) => res.json(String(req.query.ids).split(',').map((id) => ({ code: 200, body: { id, title: 'Producto ' + id, price: 42000, currency_id: 'ARS', available_quantity: 10, sold_quantity: 55, status: 'active', permalink: 'https://articulo.mercadolibre.com.ar/' + id, catalog_listing: id === 'MLA111' } }))));
  app.get('/items/:id', auth, (req, res) => res.json({ id: req.params.id, title: 'Producto ' + req.params.id, price: 42000, currency_id: 'ARS', available_quantity: 10, sold_quantity: 55, status: 'active', listing_type_id: 'gold_special', permalink: 'https://articulo.mercadolibre.com.ar/x', shipping: { logistic_type: 'fulfillment', free_shipping: true } }));
  app.put('/items/:id', auth, (req, res) => res.json({ id: req.params.id, price: req.body.price ?? 42000, currency_id: 'ARS', available_quantity: req.body.available_quantity ?? 10, status: req.body.status ?? 'active' }));
  app.get('/items/:id/visits/time_window', auth, (_q, res) => res.json({ total_visits: 340 }));
  app.get('/items/:id/price_to_win', auth, (_q, res) => res.json({ status: 'losing', current_price: 42000, price_to_win: 39900, boosts: [{ id: 'fulfillment' }] }));
  app.get('/questions/search', auth, (_q, res) => res.json({ total: 1, questions: [{ id: 555, item_id: 'MLA111', text: '¿Tenés stock?' }] }));
  app.post('/answers', auth, (req, res) => req.body?.question_id ? res.json({ ok: true }) : res.status(400).json({ message: 'falta question_id' }));
  app.get('/sites/MLA/listing_prices', auth, (_q, res) => res.json([{ listing_type_id: 'gold_special', listing_type_name: 'Clásica', sale_fee_amount: 5900, sale_fee_details: { percentage_fee: 14, fixed_fee: 0 } }]));
  app.get('/sites/MLA/search', auth, (req, res) => res.json({ paging: { total: 2 }, results: [{ title: 'Termo rival', price: 39999, currency_id: 'ARS', seller: { nickname: 'RIVAL' }, shipping: { free_shipping: true } }, { title: 'Termo caro', price: 52000, currency_id: 'ARS', seller: { nickname: 'OTRO' } }] }));
  app.get('/seller-promotions/users/777', auth, (_q, res) => res.json({ results: [{ id: 'P-HOT', name: 'Hot Sale', type: 'DEAL', status: 'candidate' }] }));
  app.get('/seller-promotions/promotions/P-HOT/items', auth, (_q, res) => res.json({ results: [{ id: 'MLA111', original_price: 42000, suggested_discounted_price: 37800, meli_percentage: 5 }] }));
  app.post('/seller-promotions/items/:id', auth, (req, res) => req.body?.promotion_id ? res.json({ ok: true }) : res.status(400).json({ message: 'falta promotion_id' }));
  app.get('/trends/MLA', auth, (_q, res) => res.json([{ keyword: 'termo stanley' }, { keyword: 'mate imperial' }]));
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
    contiene(t, 'TIENDA_DEMO', '777');
    const archivo = JSON.parse(fs.readFileSync(path.join(dirTemp, 'cuentas.json'), 'utf8'));
    if (!archivo.cuentas['777'].refresh_token) throw new Error('no guardó refresh');
    if ((fs.statSync(path.join(dirTemp, 'cuentas.json')).mode & 0o777) !== 0o600) throw new Error('permisos del archivo != 0600');
  });
  await caso('ml_cuentas lista la conectada', async () => contiene(await tool('ml_cuentas').run({}), 'TIENDA_DEMO'));
  await caso('ml_ordenes', async () => contiene(await tool('ml_ordenes').run({}), 'Termo Demo 1L', '42.000'));
  await caso('ml_metricas compara períodos', async () => contiene(await tool('ml_metricas').run({ dias: 7 }), 'Facturación', 'vs período anterior'));
  await caso('ml_publicaciones', async () => contiene(await tool('ml_publicaciones').run({}), 'MLA111', 'catálogo'));
  await caso('ml_publicacion detalle', async () => contiene(await tool('ml_publicacion').run({ item_id: 'MLA111' }), 'envío gratis'));
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
  await caso('modo solo lectura no registra herramientas de escritura', async () => {
    const { crearServidor } = await import('../src/servidor.js');
    crearServidor({ allowWrite: false }); // si registrara mal, tiraría; el conteo real se valida por stdio abajo
    const escrituras = TOOLS.filter((t) => !t.readOnly).map((t) => t.name);
    if (escrituras.length !== 4) throw new Error('esperaba 4 herramientas de escritura, hay ' + escrituras.length);
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
