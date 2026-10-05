#!/usr/bin/env node
// src/stdio.js — entrada para Claude Desktop / Claude Code (transporte stdio).
// Con el argumento "instalar" corre el instalador automático en vez del servidor.

if (process.argv[2] === 'instalar') {
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
