// src/version.js — versión instalada + chequeo de actualizaciones contra GitHub.
// Best-effort y silencioso: nunca rompe ni demora una respuesta. El resultado
// se cachea 24 h en el directorio de configuración.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
export const VERSION = pkg.version;

export const URL_REMOTA = process.env.ML_UPDATE_URL
  || 'https://raw.githubusercontent.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital/main/package.json';

const DIR = () => process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const CACHE = () => path.join(DIR(), 'version-check.json');

const aNum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
export function esMasNueva(remota, local = VERSION) {
  const [a, b] = [aNum(remota), aNum(local)];
  for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) > (b[i] ?? 0)) return true; if ((a[i] ?? 0) < (b[i] ?? 0)) return false; }
  return false;
}

export async function chequearActualizacion({ forzar = false } = {}) {
  try {
    if (!forzar) {
      const c = JSON.parse(fs.readFileSync(CACHE(), 'utf8'));
      if (Date.now() - c.cuando < 24 * 3600 * 1000) return c;
    }
  } catch {}
  try {
    const r = await fetch(URL_REMOTA + (URL_REMOTA.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(String(r.status));
    const remota = (await r.json()).version;
    const estado = { cuando: Date.now(), local: VERSION, remota, hayNueva: esMasNueva(remota) };
    try { fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 }); fs.writeFileSync(CACHE(), JSON.stringify(estado)); } catch {}
    return estado;
  } catch {
    return { cuando: Date.now(), local: VERSION, remota: null, hayNueva: false };
  }
}

export const AVISO_ACTUALIZAR = (remota) =>
  `\n\n---\n📦 Hay una versión nueva del conector (v${remota}, tenés la v${VERSION}). ` +
  'Para actualizar: cerrá Claude, corré en la terminal ' +
  '`npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital actualizar` y volvé a abrir Claude. ' +
  'Novedades: https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital/commits/main';
