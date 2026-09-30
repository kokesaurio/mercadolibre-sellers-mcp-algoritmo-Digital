#!/usr/bin/env node
// src/stdio.js — entrada para Claude Desktop / Claude Code (transporte stdio).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { crearServidor } from './servidor.js';

const allowWrite = process.env.ML_SOLO_LECTURA !== '1';
const server = crearServidor({ allowWrite });
await server.connect(new StdioServerTransport());
console.error(`[meli-sellers-mcp] listo (${allowWrite ? 'lectura y escritura' : 'solo lectura'})`);
