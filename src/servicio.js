// src/servicio.js — los trabajadores como servicio de la PC (24/7, sin Claude abierto).
//   npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital trabajadores            → corre en primer plano
//   npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital trabajadores instalar   → arranca solo al iniciar sesión
//   ... trabajadores desinstalar | estado
// Sin permisos de administrador: carpeta Inicio (Windows), LaunchAgent (macOS), systemd --user (Linux).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { rutaConfig } from './instalar.js';

const REPO = 'github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital';
const DIR = () => process.env.MELI_CONFIG_DIR || path.join(os.homedir(), '.meli-sellers-mcp');
const LOG = () => path.join(DIR(), 'trabajadores.log');
const ETIQUETA = 'ar.algoritmodigital.meli-trabajadores';

// El servicio necesita App ID / Secret para renovar la sesión: los toma del config de Claude
// (donde los dejó el instalador) para no guardar el secreto en un segundo lugar.
export function cargarCredenciales() {
  if (process.env.ML_APP_ID && process.env.ML_APP_SECRET) return true;
  try {
    const env = JSON.parse(fs.readFileSync(rutaConfig(), 'utf8')).mcpServers?.mercadolibre?.env || {};
    for (const k of ['ML_APP_ID', 'ML_APP_SECRET', 'ML_TRABAJADORES_WEBHOOK']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  } catch {}
  return !!(process.env.ML_APP_ID && process.env.ML_APP_SECRET);
}

function rutas() {
  if (process.platform === 'win32') {
    const inicio = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    return { tipo: 'windows', lanzador: path.join(DIR(), 'trabajadores.cmd'), auto: path.join(inicio, 'MercadoLibre-Trabajadores.vbs') };
  }
  if (process.platform === 'darwin') return { tipo: 'macos', auto: path.join(os.homedir(), 'Library', 'LaunchAgents', ETIQUETA + '.plist') };
  return { tipo: 'linux', auto: path.join(os.homedir(), '.config', 'systemd', 'user', 'meli-trabajadores.service') };
}

export function instalarServicio() {
  fs.mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  const r = rutas();
  fs.mkdirSync(path.dirname(r.auto), { recursive: true });
  if (r.tipo === 'windows') {
    fs.writeFileSync(r.lanzador, `@echo off\r\nnpx -y ${REPO} trabajadores >> "${LOG()}" 2>&1\r\n`);
    fs.writeFileSync(r.auto, `CreateObject("Wscript.Shell").Run """${r.lanzador}""", 0, False\r\n`);
    spawn('wscript.exe', [r.auto], { detached: true, stdio: 'ignore' }).unref();
  } else if (r.tipo === 'macos') {
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.writeFileSync(r.auto, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${ETIQUETA}</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>-lc</string><string>npx -y ${REPO} trabajadores</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>${esc(LOG())}</string>
  <key>StandardErrorPath</key><string>${esc(LOG())}</string>
</dict></plist>
`);
    spawnSync('launchctl', ['unload', r.auto], { stdio: 'ignore' });
    spawnSync('launchctl', ['load', '-w', r.auto], { stdio: 'ignore' });
  } else {
    fs.writeFileSync(r.auto, `[Unit]
Description=Trabajadores de MercadoLibre (Algoritmo Digital)
After=network-online.target

[Service]
ExecStart=/bin/sh -lc 'npx -y ${REPO} trabajadores'
Restart=always
RestartSec=60
StandardOutput=append:${LOG()}
StandardError=append:${LOG()}

[Install]
WantedBy=default.target
`);
    const ok = spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' }).status === 0
      && spawnSync('systemctl', ['--user', 'enable', '--now', 'meli-trabajadores.service'], { stdio: 'ignore' }).status === 0;
    if (!ok) return { ...r, aviso: 'No pude activar systemd --user: arrancalo a mano con `npx -y ' + REPO + ' trabajadores`.' };
  }
  return r;
}

export function desinstalarServicio() {
  const r = rutas();
  if (r.tipo === 'macos') spawnSync('launchctl', ['unload', '-w', r.auto], { stdio: 'ignore' });
  if (r.tipo === 'linux') spawnSync('systemctl', ['--user', 'disable', '--now', 'meli-trabajadores.service'], { stdio: 'ignore' });
  let habia = false;
  for (const f of [r.auto, r.lanzador].filter(Boolean)) if (fs.existsSync(f)) { fs.rmSync(f); habia = true; }
  return habia;
}

export async function mainTrabajadores(sub) {
  const t = await import('./trabajadores.js');
  const hora = () => new Date().toLocaleString('es-AR');
  if (sub === 'instalar') {
    if (!cargarCredenciales()) console.log('⚠️ No encontré ML_APP_ID / ML_APP_SECRET en el config de Claude: corré primero el instalador del conector.');
    const r = instalarServicio();
    console.log(`✅ Trabajadores instalados como servicio (${r.tipo}): arrancan solos al iniciar sesión y vigilan 24/7 mientras la PC esté prendida.`);
    console.log(`• Registro: ${LOG()}`);
    if (r.aviso) console.log('⚠️ ' + r.aviso);
    console.log('• Para sacarlos: npx -y ' + REPO + ' trabajadores desinstalar');
    return;
  }
  if (sub === 'desinstalar') {
    console.log(desinstalarServicio() ? '✅ Servicio de trabajadores desinstalado.' : 'No estaba instalado.');
    return;
  }
  if (sub === 'estado') {
    const c = t.quienCorre(); const d = t.leerEquipo();
    console.log(c ? `🟢 Corriendo (${c.modo}, pid ${c.pid})` : '⚪ Nadie los está corriendo ahora.');
    for (const id of t.IDS) console.log(`  ${t.etiqueta(id)} — ${d.trabajadores[id].activo ? 'activo' : 'pausa'} · cada ${d.trabajadores[id].intervalo} min · último ${d.trabajadores[id].ultimo ? new Date(d.trabajadores[id].ultimo).toLocaleString('es-AR') : '—'}`);
    return;
  }
  // Primer plano: el bucle permanente
  if (!cargarCredenciales()) { console.error('Faltan ML_APP_ID y ML_APP_SECRET (corré el instalador del conector).'); process.exit(1); }
  process.title = 'meli-trabajadores';
  const webhook = t.avisoWebhook();
  const alAvisar = (a) => { console.log(`[${hora()}] ${t.EQUIPO[a.trabajador].emoji} ${t.EQUIPO[a.trabajador].nombre}: ${a.texto}${a.skill ? '  → skill ' + a.skill : ''}`); webhook?.(a); };
  console.log(`[${hora()}] 👷 Equipo en marcha: ${t.IDS.map(t.etiqueta).join(' · ')}. Ctrl+C para detener.`);
  const parar = t.arrancarBucle({ modo: 'servicio', alAvisar });
  const salir = () => { parar(); console.log(`[${hora()}] Equipo detenido.`); process.exit(0); };
  process.on('SIGINT', salir); process.on('SIGTERM', salir);
}
