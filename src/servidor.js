// src/servidor.js — arma el McpServer y registra las herramientas.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOLS, MeliError } from './herramientas.js';

export const INSTRUCCIONES = [
  'MCP de MercadoLibre para vendedores, de Algoritmo Digital (algoritmodigital.com.ar).',
  'Conexión directa a la API oficial de MercadoLibre con la cuenta del vendedor.',
  'Si no hay cuenta conectada, guiá al usuario con ml_conectar.',
  'Las herramientas de escritura (responder preguntas, actualizar publicaciones, aceptar promociones) modifican la tienda real: usalas solo con confirmación explícita del usuario, mostrando antes el cambio exacto.',
].join(' ');

export function crearServidor({ allowWrite = true } = {}) {
  const server = new McpServer(
    { name: 'meli-sellers-mcp', version: '1.0.0' },
    { instructions: INSTRUCCIONES }
  );
  for (const tool of TOOLS) {
    if (!tool.readOnly && !allowWrite) continue;
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.schema, annotations: { readOnlyHint: tool.readOnly } },
      async (args) => {
        try {
          const texto = await tool.run(args || {});
          return { content: [{ type: 'text', text: texto }] };
        } catch (e) {
          const msg = e instanceof MeliError
            ? (e.status === 401 ? 'Sesión de MercadoLibre vencida o cuenta no conectada. Usá ml_conectar.' : `MercadoLibre (${e.status}): ${e.message}`)
            : `Error: ${e.message}`;
          return { content: [{ type: 'text', text: msg }], isError: true };
        }
      }
    );
  }
  return server;
}
