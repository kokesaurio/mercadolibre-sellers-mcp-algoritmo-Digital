#!/usr/bin/env node
// src/stdio.js — entrada para Claude Desktop / Claude Code (transporte stdio).
// Con el argumento "instalar" corre el instalador automático en vez del servidor.

if (process.argv[2] === 'actualizar') {
  const { rmSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
  const cache = join(process.env.npm_config_cache || join(homedir(), '.npm'), '_npx');
  if (existsSync(cache)) rmSync(cache, { recursive: true, force: true });
  console.log('✅ Caché limpiada. Reiniciá Claude Desktop: al arrancar baja la última versión del conector automáticamente.');
} else if (process.argv[2] === 'instalar') {
  const { mainInstalador } = await import('./instalar.js');
  await mainInstalador();
} else {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { crearServidor } = await import('./servidor.js');
  const allowWrite = process.env.ML_SOLO_LECTURA !== '1';
  const server = crearServidor({ allowWrite });
  await server.connect(new StdioServerTransport());
  console.error(`[meli-sellers-mcp] listo (${allowWrite ? 'lectura y escritura' : 'solo lectura'})`);
}
