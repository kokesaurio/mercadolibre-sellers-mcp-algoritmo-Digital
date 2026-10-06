// src/meli.js — Cliente directo de la API de MercadoLibre, sin servidor propio.
// Tokens guardados en un archivo local (0600), refresh automático serializado
// (el refresh_token de ML es de un solo uso: dos refresh a la vez revocan la cuenta).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const API = process.env.MELI_API_BASE || 'https://api.mercadolibre.com';

// Dominio de autorización por país
export const AUTH_POR_SITIO = {
  MLA: 'https://auth.mercadolibre.com.ar', MLB: 'https://auth.mercadolivre.com.br',
  MLM: 'https://auth.mercadolibre.com.mx', MLC: 'https://auth.mercadolibre.cl',
  MCO: 'https://auth.mercadolibre.com.co', MLU: 'https://auth.mercadolibre.com.uy',
  MPE: 'https://auth.mercadolibre.com.pe', MLV: 'https://auth.mercadolibre.com.ve',
  MEC: 'https://auth.mercadolibre.com.ec', MBO: 'https://auth.mercadolibre.com.bo',
  MPY: 'https://auth.mercadolibre.com.py', MCR: 'https://auth.mercadolibre.co.cr',
  MPA: 'https://auth.mercadolibre.com.pa', MRD: 'https://auth.mercadolibre.com.do',
  MGT: 'https://auth.mercadolibre.com.gt', MHN: 'https://auth.mercadolibre.com.hn',
  MSV: 'https://auth.mercadolibre.com.sv', MNI: 'https://auth.mercadolibre.com.ni',
};

const DIR = process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const ARCHIVO = path.join(DIR, 'cuentas.json');

export class MeliError extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

// ───────────────────────── Almacén local de cuentas ─────────────────────────
function leerCuentas() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch { return { cuentas: {} }; }
}
function guardarCuentas(datos) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = ARCHIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ARCHIVO); // escritura atómica: nunca deja el archivo por la mitad
}

export function listarCuentas() {
  const d = leerCuentas();
  return Object.values(d.cuentas).map((c) => ({ user_id: c.user_id, nickname: c.nickname, sitio: c.sitio, predeterminada: String(c.user_id) === d.predeterminada }));
}

export function fijarPredeterminada(userId) {
  const d = leerCuentas();
  if (!d.cuentas[String(userId)]) throw new MeliError(404, `La cuenta ${userId} no está conectada.`);
  d.predeterminada = String(userId);
  guardarCuentas(d);
  return d.cuentas[String(userId)].nickname;
}

// ─────────────────────────────── OAuth (PKCE) ───────────────────────────────
const b64url = (b) => b.toString('base64url');

export function urlDeAutorizacion({ appId, sitio = 'MLA', redirectUri }) {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const base = AUTH_POR_SITIO[sitio];
  if (!base) throw new MeliError(400, `Sitio desconocido: ${sitio}. Usá MLA, MLB, MLM, etc.`);
  const u = new URL(base + '/authorization');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  // Guardamos el verifier pendiente para el canje
  const d = leerCuentas();
  d.pendiente = { verifier, redirectUri, sitio, creado: Date.now() };
  guardarCuentas(d);
  return u.toString();
}

async function pedirToken(cuerpo) {
  const r = await fetch(API + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(cuerpo),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new MeliError(r.status, j.message || j.error_description || j.error || ('MercadoLibre respondió ' + r.status));
  return j;
}

export async function canjearCode({ appId, appSecret, code }) {
  const d = leerCuentas();
  const p = d.pendiente;
  if (!p) throw new MeliError(400, 'No hay una conexión iniciada: usá primero ml_conectar sin code para obtener la URL.');
  if (Date.now() - p.creado > 30 * 60 * 1000) throw new MeliError(400, 'La conexión venció (30 min). Arrancá de nuevo con ml_conectar.');
  const t = await pedirToken({
    grant_type: 'authorization_code', client_id: appId, client_secret: appSecret,
    code: code.trim(), redirect_uri: p.redirectUri, code_verifier: p.verifier,
  });
  // Perfil para mostrar quién se conectó
  const me = await (await fetch(API + '/users/me', { headers: { Authorization: 'Bearer ' + t.access_token } })).json();
  d.cuentas[String(t.user_id)] = {
    user_id: t.user_id, nickname: me.nickname || String(t.user_id), sitio: me.site_id || p.sitio,
    access_token: t.access_token, refresh_token: t.refresh_token,
    vence: Date.now() + (t.expires_in ?? 21600) * 1000,
  };
  if (!d.predeterminada) d.predeterminada = String(t.user_id);
  delete d.pendiente;
  guardarCuentas(d);
  return { user_id: t.user_id, nickname: me.nickname, sitio: me.site_id || p.sitio };
}

export function borrarCuenta(userId) {
  const d = leerCuentas();
  const habia = !!d.cuentas[String(userId)];
  delete d.cuentas[String(userId)];
  if (d.predeterminada === String(userId)) delete d.predeterminada;
  guardarCuentas(d);
  return habia;
}

// ─────────────────────────── Cliente autenticado ───────────────────────────
const refrescos = new Map(); // user_id -> Promise (single-flight: un refresh a la vez)

export class MeliClient {
  constructor({ appId, appSecret, userId } = {}) {
    this.appId = appId ?? process.env.ML_APP_ID;
    this.appSecret = appSecret ?? process.env.ML_APP_SECRET;
    this.userId = userId ? String(userId) : null;
  }

  cuenta() {
    const d = leerCuentas();
    const ids = Object.keys(d.cuentas);
    if (!ids.length) throw new MeliError(401, 'Ninguna cuenta conectada. Usá ml_conectar para vincular tu cuenta de MercadoLibre.');
    if (this.userId) {
      if (!d.cuentas[this.userId]) throw new MeliError(404, `La cuenta ${this.userId} no está conectada. Cuentas: ${ids.join(', ')}.`);
      return d.cuentas[this.userId];
    }
    if (d.predeterminada && d.cuentas[d.predeterminada]) return d.cuentas[d.predeterminada];
    if (ids.length === 1) return d.cuentas[ids[0]];
    throw new MeliError(400, `Hay ${ids.length} cuentas conectadas: indicá cuál con el parámetro cuenta, o fijá una predeterminada con ml_cuentas. Cuentas: ${ids.join(', ')}.`);
  }

  async token() {
    const c = this.cuenta();
    if (Date.now() < c.vence - 5 * 60 * 1000) return c.access_token;
    const clave = String(c.user_id);
    if (!refrescos.has(clave)) {
      refrescos.set(clave, (async () => {
        try {
          const t = await pedirToken({
            grant_type: 'refresh_token', client_id: this.appId, client_secret: this.appSecret,
            refresh_token: c.refresh_token,
          });
          const d = leerCuentas();
          Object.assign(d.cuentas[clave], {
            access_token: t.access_token,
            refresh_token: t.refresh_token || c.refresh_token,
            vence: Date.now() + (t.expires_in ?? 21600) * 1000,
          });
          guardarCuentas(d);
          return t.access_token;
        } finally { refrescos.delete(clave); }
      })());
    }
    return refrescos.get(clave);
  }

  async pedir(metodo, ruta, { query, body } = {}) {
    const u = new URL(API + ruta);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    const hacer = async (tk) => fetch(u, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    let r = await hacer(await this.token());
    if (r.status === 401) { // token vencido antes de tiempo: refrescar una vez y reintentar
      const d = leerCuentas(); const c = this.cuenta();
      d.cuentas[String(c.user_id)].vence = 0; guardarCuentas(d);
      r = await hacer(await this.token());
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new MeliError(r.status, j.message || j.error || ('MercadoLibre respondió ' + r.status + ' en ' + ruta));
    return j;
  }

  get(ruta, query) { return this.pedir('GET', ruta, { query }); }
  post(ruta, body, query) { return this.pedir('POST', ruta, { body, query }); }
  put(ruta, body) { return this.pedir('PUT', ruta, { body }); }
  del(ruta) { return this.pedir('DELETE', ruta, {}); }

  // Subida multipart (clips): fetch arma el boundary solo, sin Content-Type manual
  async postMultipart(ruta, form) {
    const hacer = async (tk) => fetch(API + ruta, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    let r = await hacer(await this.token());
    if (r.status === 401) {
      const d = leerCuentas(); const c = this.cuenta();
      d.cuentas[String(c.user_id)].vence = 0; guardarCuentas(d);
      r = await hacer(await this.token());
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new MeliError(r.status, j.message || j.error || ('MercadoLibre respondió ' + r.status + ' en ' + ruta));
    return j;
  }
}
