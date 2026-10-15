const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default || require('jspdf-autotable');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('======================================================================');
  printBanner('AUDITORÍA INTEGRAL: BD VIEJA (SIGYR) vs BD ACTUAL (SUPABASE)');
  console.log('======================================================================\n');

  // 1. Cargar dump de SIGYR
  const sigyrDumpPath = '/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json';
  console.log('1. Cargando datos maestros de SIGYR...');
  const sigyrRows = JSON.parse(fs.readFileSync(sigyrDumpPath, 'utf8'));
  const sigyrMap = new Map();
  for (const r of sigyrRows) {
    const code = String(r.urbaser_code || '').trim().toUpperCase();
    if (code) sigyrMap.set(code, r);
  }
  console.log(`   -> ${sigyrMap.size.toLocaleString()} propiedades mapeadas en SIGYR.\n`);

  // 2. Descargar datos actuales de Supabase
  console.log('2. Descargando datos actuales de Supabase (inmuebles, pagos protegidos)...');
  const allInmuebles = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, estado, padre_id, condominio_padre_id, es_condominio, mmv_mes, meses_deuda, notas')
      .range(from, from + 999);
    if (error) throw error;
    allInmuebles.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`   -> ${allInmuebles.length.toLocaleString()} inmuebles descargados de Supabase.`);

  // Pagos protegidos en nuevo sistema
  const pagosSet = new Set();
  const { data: pagosReportados } = await supabase.from('pagos_reportados').select('identidad, detalles, referencia');
  for (const p of pagosReportados || []) {
    if (p.identidad) pagosSet.add(String(p.identidad).replace(/\D/g, ''));
    const det = String(p.detalles || '');
    const matches = det.match(/(?:URB|AURI)\d{6}/gi);
    if (matches) matches.forEach(m => pagosSet.add(m.toUpperCase()));
  }
  console.log(`   -> ${pagosSet.size.toLocaleString()} identidades/códigos con pagos protegidos en el nuevo sistema.\n`);

  // 3. Ejecutar Auditoría
  console.log('3. Analizando discrepancias según los 3 problemas requeridos...');

  const formatDoc = (doc, typeId) => {
    const digits = String(doc || '').replace(/\D/g, '');
    if (!digits) return '';
    const t = String(typeId || '1');
    const p = t === '1' ? 'V' : (t === '2' ? 'J' : (t === '3' ? 'E' : (t === '4' ? 'G' : 'V')));
    return `${p}-${digits}`;
  };

  const problema1_desactivados = [];
  const problema2_cedulas_codigos = [];
  const problema3_na_actividades = [];

  for (const inm of allInmuebles) {
    const code = String(inm.inmueble || '').trim().toUpperCase();
    const curEstado = inm.estado;
    const curIdent = String(inm.identidad || '').trim().toUpperCase();
    const curAct = String(inm.actividad_principal || '').trim().toUpperCase();
    const curPadre = inm.padre_id || inm.condominio_padre_id;
    const s = sigyrMap.get(code);

    // --- PROBLEMA 1: Usuarios Desactivados ---
    if (s) {
      const isDeletedInSigyr = s.prop_deleted_at !== null || s.user_deleted_at !== null || ['deleted', 'inactive', 'rejected'].includes(String(s.registration_status || '').toLowerCase());
      if (isDeletedInSigyr && curEstado === 'Activo') {
        const idDigits = curIdent.replace(/\D/g, '');
        const hasPayment = pagosSet.has(code) || pagosSet.has(idDigits);
        problema1_desactivados.push({
          id: inm.id,
          inmueble: code,
          contribuyente: inm.contribuyente,
          identidad: curIdent,
          valor_actual: curEstado,
          valor_correcto: 'Inactivo / Eliminado en SIGYR',
          tiene_pagos: hasPayment,
          accion_propuesta: hasPayment ? 'REVISIÓN MANUAL (Tiene pagos en nuevo sistema)' : 'Archivar / Desactivar (SET estado = \'Eliminado\')'
        });
      }
    }

    // --- PROBLEMA 2: Mezcla de Cédulas y Códigos ---
    // Caso A: Cédula contiene un código de inmueble (URB o AURI)
    if (/^(URB|AURI)\d{4,8}/.test(curIdent)) {
      const sigDoc = s ? formatDoc(s.document, s.document_type_id) : 'No especificado en SIGYR';
      problema2_cedulas_codigos.push({
        id: inm.id,
        inmueble: code,
        tipo_error: 'Código de Inmueble en campo Cédula/RIF',
        valor_actual: curIdent,
        valor_correcto: sigDoc,
        contribuyente: inm.contribuyente,
        accion_propuesta: `Restaurar Cédula/RIF a '${sigDoc}'`
      });
    }
    // Caso B: El código de inmueble es una cédula/RIF
    else if (/^[VEJG]-?\d{5,10}/.test(code)) {
      problema2_cedulas_codigos.push({
        id: inm.id,
        inmueble: code,
        tipo_error: 'Cédula/RIF en campo de Código de Inmueble',
        valor_actual: code,
        valor_correcto: 'Requiere código URB único',
        contribuyente: inm.contribuyente,
        accion_propuesta: 'Reasignar código URB correlativo y preservar identidad'
      });
    }

    // --- PROBLEMA 3: Registros N/A y Pérdida de Actividades / Padres ---
    if (curAct === 'N/A' || curAct === '' || curAct === 'NULL' || curAct === 'NONE') {
      const sigAct = s?.act_name ? String(s.act_name).trim() : null;
      const sigPadre = s?.parent_urbaser_code ? String(s.parent_urbaser_code).trim().toUpperCase() : null;

      if (sigAct && sigAct.toUpperCase() !== 'N/A') {
        problema3_na_actividades.push({
          id: inm.id,
          inmueble: code,
          tipo_error: 'Pérdida de Actividad Económica (Quedó en N/A)',
          valor_actual: 'N/A',
          valor_correcto: sigAct,
          act_code: s.act_code,
          padre_actual: curPadre || 'Sin padre',
          padre_sigyr: sigPadre || 'Sin padre',
          accion_propuesta: `Restaurar actividad '${sigAct}'` + (sigPadre && !curPadre ? ` y vincular a padre '${sigPadre}'` : '')
        });
      } else if (sigPadre && !curPadre) {
        problema3_na_actividades.push({
          id: inm.id,
          inmueble: code,
          tipo_error: 'Unidad Hija separada de su Condominio/Matriz Padre',
          valor_actual: 'Sin padre asignado',
          valor_correcto: `Padre en SIGYR: ${sigPadre}`,
          act_code: s?.act_code,
          padre_actual: 'Sin padre',
          padre_sigyr: sigPadre,
          accion_propuesta: `Vincular a padre_id = '${sigPadre}'`
        });
      }
    }
  }

  const p1_archivar = problema1_desactivados.filter(p => p.accion_propuesta.startsWith('Archivar'));
  const p1_revisar = problema1_desactivados.filter(p => p.accion_propuesta.startsWith('REVISIÓN'));

  console.log('Resultados del Diagnóstico:');
  console.log(`   1. Usuarios / Inmuebles Desactivados: ${problema1_desactivados.length} (${p1_archivar.length} para archivar, ${p1_revisar.length} para revisión)`);
  console.log(`   2. Mezcla de Cédulas y Códigos: ${problema2_cedulas_codigos.length}`);
  console.log(`   3. Registros N/A con Actividad o Padre Perdido: ${problema3_na_actividades.length}\n`);

  // 4. GENERAR DOCUMENTO PDF DE PRE-CAMBIOS
  console.log('4. Generando Documento PDF de Pre-Cambios...');
  const pdfPath = '/Users/davidzara/Documents/naguanagua_zero/Reporte_Auditoria_Pre_Cambios_SIGYR.pdf';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const W = 279.4;

  let y = 14;
  const newHeader = (titulo) => {
    doc.addPage();
    doc.setFillColor(15, 23, 42);
    doc.rect(10, 10, W - 20, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(titulo, 14, 17.5);
    y = 26;
  };

  // PORTADA / RESUMEN EJECUTIVO
  doc.setFillColor(15, 23, 42);
  doc.rect(10, 10, W - 20, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('REPORTE OFICIAL DE AUDITORÍA DE DATOS Y PRE-CAMBIOS', W / 2, 20, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Comparativo BD Vieja SIGYR (Oct 2026) vs BD Actual (Supabase) · Fecha: ${new Date().toLocaleString('es-VE')}`, W / 2, 28, { align: 'center' });

  y = 40;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('I. RESUMEN EJECUTIVO DE HALLAZGOS', 12, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['PROBLEMA AUDITADO', 'REGISTROS AFECTADOS', 'DETALLE TÉCNICO', 'POLÍTICA DE MITIGACIÓN']],
    body: [
      ['1. Usuarios / Inmuebles Desactivados', `${problema1_desactivados.length} casos`, `${p1_archivar.length} dados de baja sin pagos / ${p1_revisar.length} con pagos en nuevo sistema`, 'Archivado lógico (estado="Eliminado"). Protección estricta si existen cobros.'],
      ['2. Mezcla de Cédulas y Códigos', `${problema2_cedulas_codigos.length} casos`, 'Cruce de prefijos URB/AURI en Cédula o RIF en campo Inmueble', 'Restauración del RIF/Cédula original desde la tabla de usuarios de SIGYR.'],
      ['3. Registros N/A y Pérdida de Actividades/Padres', `${problema3_na_actividades.length} casos`, 'Actividades que quedaron en N/A o locales separados de su matriz', 'Recuperación de la actividad económica oficial y re-vinculación a padre_id.']
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 }
  });

  y = doc.lastAutoTable.finalY + 8;

  // TABLA PROBLEMA 2: MEZCLA DE CÉDULAS Y CÓDIGOS
  newHeader('II. TABLA COMPARATIVA: MEZCLA Y CRUCE DE CÉDULAS Y CÓDIGOS');
  autoTable(doc, {
    startY: y,
    head: [['#', 'Inmueble / ID', 'Tipo de Inconsistencia', 'Valor Actual (BD Nueva)', 'Valor Correcto (SIGYR)', 'Contribuyente', 'Acción Propuesta']],
    body: problema2_cedulas_codigos.slice(0, 150).map((p, idx) => [
      idx + 1,
      p.inmueble,
      p.tipo_error,
      p.valor_actual,
      p.valor_correcto,
      String(p.contribuyente || '').slice(0, 32),
      p.accion_propuesta
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 }
  });

  // TABLA PROBLEMA 3: REGISTROS N/A RECUPERADOS
  newHeader('III. MAPEO CORREGIDO: REGISTROS N/A CON ACTIVIDAD O PADRE RECUPERADO');
  autoTable(doc, {
    startY: y,
    head: [['#', 'Inmueble', 'Inconsistencia', 'Valor Actual', 'Actividad Correcta (SIGYR)', 'Padre SIGYR', 'Acción Propuesta']],
    body: problema3_na_actividades.slice(0, 150).map((p, idx) => [
      idx + 1,
      p.inmueble,
      p.tipo_error,
      p.valor_actual,
      p.valor_correcto,
      p.padre_sigyr || 'Ninguno',
      p.accion_propuesta
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [3, 105, 161], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 }
  });

  // TABLA PROBLEMA 1: USUARIOS DESACTIVADOS A ARCHIVAR
  newHeader('IV. USUARIOS / INMUEBLES DESACTIVADOS EN SIGYR (CANDIDATOS A ARCHIVAR)');
  autoTable(doc, {
    startY: y,
    head: [['#', 'Inmueble', 'Cédula / RIF', 'Contribuyente', 'Estatus Actual', 'Estatus SIGYR', 'Acción Propuesta']],
    body: p1_archivar.slice(0, 150).map((p, idx) => [
      idx + 1,
      p.inmueble,
      p.identidad,
      String(p.contribuyente || '').slice(0, 36),
      p.valor_actual,
      p.valor_correcto,
      p.accion_propuesta
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 }
  });

  doc.save(pdfPath);
  console.log(`   -> PDF oficial de auditoría generado en: ${pdfPath}`);

  // 5. GENERAR SCRIPT SQL DE LIMPIEZA SEGURA EN TRANSACCIÓN
  console.log('5. Generando Script SQL de Limpieza Segura con Transacciones...');
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/scripts_limpieza_segura_transaccion.sql';
  let sql = `-- ======================================================================\n`;
  sql += `-- SCRIPT DE LIMPIEZA Y SANEAMIENTO SEGURO DE DATOS\n`;
  sql += `-- Generado automáticamente tras auditoría SIGYR vs Supabase\n`;
  sql += `-- Fecha: ${new Date().toISOString()}\n`;
  sql += `-- NOTA DE SEGURIDAD: Envuelto en transacción. Requiere revisión previa del PDF.\n`;
  sql += `-- ======================================================================\n\n`;
  sql += `BEGIN TRANSACTION;\n\n`;

  sql += `-- ----------------------------------------------------------------------\n`;
  sql += `-- 1. CORRECCIÓN DE CÉDULAS Y RIFs CRUZADOS CON CÓDIGOS DE INMUEBLE\n`;
  sql += `-- ----------------------------------------------------------------------\n`;
  for (const p of problema2_cedulas_codigos) {
    if (p.valor_correcto && p.valor_correcto !== 'No especificado en SIGYR' && p.valor_correcto.includes('-')) {
      sql += `UPDATE inmuebles SET identidad = '${p.valor_correcto}' WHERE id = '${p.id}' AND identidad = '${p.valor_actual}';\n`;
    }
  }

  sql += `\n-- ----------------------------------------------------------------------\n`;
  sql += `-- 2. RESTAURACIÓN DE ACTIVIDADES ECONÓMICAS Y PADRES PARA REGISTROS N/A\n`;
  sql += `-- ----------------------------------------------------------------------\n`;
  for (const p of problema3_na_actividades) {
    const actEscaped = p.valor_correcto.replace(/'/g, "''");
    let setClause = `actividad_principal = '${actEscaped}'`;
    if (p.padre_sigyr && p.padre_sigyr !== 'Sin padre') {
      setClause += `, padre_id = '${p.padre_sigyr}'`;
    }
    sql += `UPDATE inmuebles SET ${setClause} WHERE id = '${p.id}' AND actividad_principal = 'N/A';\n`;
  }

  sql += `\n-- ----------------------------------------------------------------------\n`;
  sql += `-- 3. ARCHIVADO LÓGICO DE INMUEBLES DESACTIVADOS / ELIMINADOS EN SIGYR\n`;
  sql += `-- (Excluye estrictamente aquellos con pagos registrados en el nuevo sistema)\n`;
  sql += `-- ----------------------------------------------------------------------\n`;
  for (const p of p1_archivar) {
    sql += `UPDATE inmuebles SET estado = 'Eliminado' WHERE id = '${p.id}' AND estado = 'Activo';\n`;
  }

  sql += `\n-- ======================================================================\n`;
  sql += `-- VERIFICACIÓN FINAL Y CIERRE DE TRANSACCIÓN\n`;
  sql += `-- Para aplicar los cambios: mantener 'COMMIT;'\n`;
  sql += `-- Para cancelar los cambios: cambiar por 'ROLLBACK;'\n`;
  sql += `-- ======================================================================\n`;
  sql += `COMMIT;\n`;

  fs.writeFileSync(sqlPath, sql, 'utf8');
  console.log(`   -> Script SQL seguro generado en: ${sqlPath}\n`);

  console.log('✅ AUDITORÍA COMPLETADA CON ÉXITO.');
}

function printBanner(text) {
  console.log(`  ${text}`);
}

run().catch(console.error);
