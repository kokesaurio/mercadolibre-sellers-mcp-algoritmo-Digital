// El cerebro del conector: base de datos local de conocimiento del negocio.
// Vive en ~/.meli-sellers-mcp/cerebro.json — cero instalación, nada sale de la máquina.
// Guarda lo que el vendedor le enseña a Claude (costos, impuestos, medidas, notas)
// y las herramientas lo usan solo: la calculadora deja de preguntar lo que ya sabe.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const ARCHIVO = path.join(DIR, 'cerebro.json');

export function leerCerebro() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); }
  catch { return { negocio: { notas: [] }, productos: {} }; }
}

export function guardarCerebro(d) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = ARCHIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ARCHIVO); // escritura atómica, como cuentas.json
}

// Datos de un producto con herencia del negocio (ej: impuestos default)
export function saberDe(itemId) {
  const d = leerCerebro();
  const p = d.productos[itemId] || {};
  return {
    ...p,
    impuestos_pct: p.impuestos_pct ?? d.negocio.impuestos_pct,
    costo_envio: p.costo_envio ?? d.negocio.costo_envio,
  };
}

// Aprender sin pisar: solo escribe los campos que vienen con valor
export function aprender(itemId, datos) {
  const d = leerCerebro();
  if (itemId) {
    const p = (d.productos[itemId] = d.productos[itemId] || {});
    for (const [k, v] of Object.entries(datos)) {
      if (v === undefined || v === null) continue;
      if (k === 'nota') { (p.notas = p.notas || []).push({ t: Date.now(), texto: String(v) }); }
      else p[k] = v;
    }
    p.actualizado = Date.now();
  } else {
    for (const [k, v] of Object.entries(datos)) {
      if (v === undefined || v === null) continue;
      if (k === 'nota') { (d.negocio.notas = d.negocio.notas || []).push({ t: Date.now(), texto: String(v) }); }
      else d.negocio[k] = v;
    }
  }
  guardarCerebro(d);
  return d;
}

export function olvidar(itemId) {
  const d = leerCerebro();
  if (!d.productos[itemId]) return false;
  delete d.productos[itemId];
  guardarCerebro(d);
  return true;
}
