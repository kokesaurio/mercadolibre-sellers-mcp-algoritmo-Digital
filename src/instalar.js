// src/instalar.js — instalador automático: configura el conector en Claude Desktop.
//   npx -y github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital instalar
// Pregunta el App ID y el Secret (o los toma de --app-id / --secret), ubica el
// archivo de configuración según el sistema operativo, hace backup y agrega el
// conector sin tocar los demás que ya existan.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';

const REPO = 'github:kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital';
const REDIRECT = 'https://kokesaurio.github.io/mercadolibre-sellers-mcp-algoritmo-Digital/conectar.html';

export function rutaConfig() {
  if (process.env.CLAUDE_CONFIG_DIR) return path.join(process.env.CLAUDE_CONFIG_DIR, 'claude_desktop_config.json');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function flag(nombre) {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? process.argv[i + 1] : undefined;
}

export async function instalar({ appId, appSecret, soloLectura = false } = {}) {
  const archivo = rutaConfig();
  fs.mkdirSync(path.dirname(archivo), { recursive: true });

  let config = {};
  if (fs.existsSync(archivo)) {
    const crudo = fs.readFileSync(archivo, 'utf8').trim();
    if (crudo) {
      try { config = JSON.parse(crudo); }
      catch { throw new Error(`El archivo ${archivo} tiene un JSON inválido: arreglalo o borralo y volvé a correr el instalador.`); }
    }
    const backup = archivo + '.backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    fs.copyFileSync(archivo, backup);
    console.log('• Backup del config anterior: ' + backup);
  }

  config.mcpServers = config.mcpServers || {};
  config.mcpServers.mercadolibre = {
    command: 'npx',
    args: ['-y', REPO],
    env: {
      ML_APP_ID: String(appId),
      ML_APP_SECRET: String(appSecret),
      ...(soloLectura ? { ML_SOLO_LECTURA: '1' } : {}),
    },
  };
  fs.writeFileSync(archivo, JSON.stringify(config, null, 2));
  return archivo;
}

export async function mainInstalador() {
  console.log('── Instalador del conector de MercadoLibre para Claude ── Algoritmo Digital ──\n');
  let appId = flag('--app-id');
  let appSecret = flag('--secret');

  if ((!appId || !appSecret) && !process.stdin.isTTY) {
    console.error('Faltan credenciales. Uso: npx -y ' + REPO + ' instalar --app-id TU_APP_ID --secret TU_SECRET');
    process.exit(1);
  }
  if (!appId || !appSecret) {
    console.log('Necesitás una aplicación gratis de MercadoLibre (2 minutos):');
    console.log('  1. Entrá a https://developers.mercadolibre.com.ar → Mis aplicaciones → Crear');
    console.log('  2. URI de redirect (exacta): ' + REDIRECT);
    console.log('  3. Scopes: read, write y offline_access\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    appId = appId || (await rl.question('Pegá tu App ID: ')).trim();
    appSecret = appSecret || (await rl.question('Pegá tu Secret Key: ')).trim();
    rl.close();
  }
  if (!appId || !appSecret) { console.error('Sin App ID o Secret no se puede instalar.'); process.exit(1); }

  const archivo = await instalar({ appId, appSecret, soloLectura: process.argv.includes('--solo-lectura') });
  console.log('\n✅ Conector instalado en: ' + archivo);
  console.log('\nÚltimos 2 pasos:');
  console.log('  1. Reiniciá Claude Desktop (cerralo del todo y volvé a abrirlo).');
  console.log('  2. En un chat nuevo decile: "conectá mi cuenta de MercadoLibre".');
  console.log('\nGuía completa: https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital');
  console.log('\n⭐ Este conector es gratis y lo mantiene Algoritmo Digital.');
  console.log('   Tu estrella en GitHub hace que más vendedores lo encuentren.');
  if (process.stdin.isTTY) {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const r = (await rl2.question('   ¿Abrir GitHub ahora para dejarla? (s/n): ')).trim().toLowerCase();
    rl2.close();
    if (r === 's' || r === 'si' || r === 'sí' || r === 'y') {
      const { exec } = await import('node:child_process');
      const url = 'https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital';
      const cmd = process.platform === 'win32' ? 'start "" "' + url + '"' : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
      exec(cmd, () => {});
      console.log('   ¡Gracias! Se abre GitHub: botón ⭐ Star arriba a la derecha.');
    }
  } else {
    console.log('   https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital');
  }
}
