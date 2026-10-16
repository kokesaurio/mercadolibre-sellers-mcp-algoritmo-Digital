/**
 * Planilla del Equipo de trabajadores — Conector MercadoLibre de Algoritmo Digital
 * https://github.com/kokesaurio/mercadolibre-sellers-mcp-algoritmo-Digital
 *
 * Recibe lo que encuentran Vera, Tomás, Martina, Bruno y Sofía y lo guarda en ESTA planilla:
 *   - pestaña "Alertas": historial de todas las alertas (se agrega abajo)
 *   - una pestaña por trabajador con sus resultados al día (se reescribe en cada control)
 *
 * Cómo instalarlo (una sola vez, 3 minutos):
 *   1. Creá una planilla nueva en Google Drive (sheets.new).
 *   2. Extensiones → Apps Script → borrá lo que haya y pegá TODO este archivo.
 *   3. Reemplazá PEGAR_LA_CLAVE por la clave que te da Claude (ml_trabajadores accion=drive).
 *   4. Implementar → Nueva implementación → tipo "App web"
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario → Implementar → Autorizar.
 *   5. Copiá la URL que termina en /exec y pasásela a Claude.
 *
 * La CLAVE es lo que impide que otra persona escriba en tu planilla: no la compartas.
 */
const CLAVE = 'PEGAR_LA_CLAVE';

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return salida_({ ok: false, error: 'json' }); }
  if (!CLAVE || CLAVE === 'PEGAR_LA_CLAVE' || d.clave !== CLAVE) return salida_({ ok: false, error: 'clave' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const alertas = Array.isArray(d.alertas) ? d.alertas : [];
    const cab = d.cabeceraAlertas || ['Fecha', 'Trabajador', 'Nivel', 'Objetivo', 'Alerta', 'Skill sugerida'];
    const ha = hoja_(ss, 'Alertas');
    if (ha.getLastRow() === 0) { ha.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold'); ha.setFrozenRows(1); }
    if (alertas.length) {
      const filas = alertas.map(function (f) { return normalizar_(f, cab.length); });
      ha.getRange(ha.getLastRow() + 1, 1, filas.length, cab.length).setValues(filas);
      // las urgentes en rojo suave
      filas.forEach(function (f, i) { if (String(f[2]).indexOf('urgente') > -1) ha.getRange(ha.getLastRow() - filas.length + 1 + i, 1, 1, cab.length).setBackground('#fde2e1'); });
    }

    const resultados = d.resultados || {};
    Object.keys(resultados).forEach(function (nombre) {
      const filas = resultados[nombre];
      if (!filas || !filas.length) return;
      const ancho = filas[0].length;
      const h = hoja_(ss, String(nombre).slice(0, 90));
      h.clearContents();
      h.getRange(1, 1, filas.length, ancho).setValues(filas.map(function (f) { return normalizar_(f, ancho); }));
      h.getRange(1, 1, 1, ancho).setFontWeight('bold');
      h.setFrozenRows(1);
      h.getRange(filas.length + 2, 1).setValue('Actualizado: ' + (d.generado || new Date()));
    });
    return salida_({ ok: true, alertas: alertas.length, hojas: Object.keys(resultados).length });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return salida_({ ok: true, mensaje: 'Planilla del equipo de trabajadores conectada' }); }

function hoja_(ss, nombre) { return ss.getSheetByName(nombre) || ss.insertSheet(nombre); }

// Todo valor de texto que empiece con = + - @ se guarda como texto (nunca como fórmula)
function normalizar_(fila, ancho) {
  const f = (fila || []).slice(0, ancho);
  while (f.length < ancho) f.push('');
  return f.map(function (v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : (v === null ? '' : v); });
}

function salida_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
