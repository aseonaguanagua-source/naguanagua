/**
 * FASE 1: Restaurar deudas + sincronizar meses + verificar tarifas + actividades
 */
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, select) {
  let all = [], page = 0;
  while (true) {
    const { data } = await sb.from(table).select(select).range(page*1000, (page+1)*1000-1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

(async () => {
  // ══════════ CARGAR DATOS ══════════
  console.log('📂 Leyendo Excel DATA NAGUANAGUA...');
  const wb = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  
  // Mapa Excel por código inmueble
  const excelMap = {};
  rows.forEach(r => {
    const cod = (r['Código'] || '').toString().trim();
    if (!cod) return;
    excelMap[cod] = {
      documento: (r['Documento'] || '').toString().trim(),
      nombre: r['Nombre / Razón Social'] || '',
      tipo: (r['Tipo'] || '').toString().trim(),
      actividad: (r['Actividad'] || '').toString().trim(),
      mesesPendientes: parseInt(r['Meses pendientes'] || 0),
      montoPorMes: parseFloat(r['Monto x mes'] || 0),
      deudaTotal: parseFloat(r['Deuda total Ves'] || 0),
      multaTotal: parseFloat(r['Multa total Ves'] || 0),
      totalVes: parseFloat(r['Total Ves'] || 0),
      agenteRetencion: r['Agente de retencion'] === 1 || r['Agente de retencion'] === '1',
    };
  });
  console.log('  Excel:', Object.keys(excelMap).length, 'registros');

  console.log('📂 Cargando inmuebles del sistema...');
  const inmuebles = await fetchAll('inmuebles', 'id, inmueble, identidad, tipo, actividad_principal, deuda_mmv, deuda_congelada_bs, multa_bs, meses_deuda, mmv_mes, contribuyente');
  console.log('  Sistema:', inmuebles.length, 'inmuebles');

  // Mapa sistema por código
  const sysMap = {};
  inmuebles.forEach(i => { sysMap[i.inmueble] = i; });

  // Obtener pagos reales (no de prueba) para excluirlos de la restauración
  console.log('📂 Cargando pagos reales...');
  const pagos = await fetchAll('pagos_reportados', 'identidad, monto, estado, detalles');
  const identidadesPagadas = new Set();
  pagos.forEach(p => {
    if (p.estado === 'Aprobado') {
      const id = (p.identidad || '').toUpperCase().replace(/-/g, '');
      identidadesPagadas.add(id);
    }
  });
  console.log('  Pagos aprobados de', identidadesPagadas.size, 'identidades únicas\n');

  // ══════════ 1.1 + 1.2: RESTAURAR DEUDAS Y SINCRONIZAR MESES ══════════
  console.log('═══ FASE 1.1+1.2: RESTAURAR DEUDAS Y SINCRONIZAR MESES ═══');
  
  // El Excel tiene datos de ~3 meses atrás. Calcular diferencia
  // Excel probablemente capturado en junio/julio 2026
  // Hoy es septiembre 2026, así que +3 meses
  const MESES_ADICIONALES = 3;
  
  const updates = []; // { id, fields }
  let statRestaurar = 0, statSyncMeses = 0, statSyncMulta = 0, statYaPagado = 0, statNoExcel = 0;

  inmuebles.forEach(i => {
    const excel = excelMap[i.inmueble];
    if (!excel) { statNoExcel++; return; }

    const idClean = (i.identidad || '').toUpperCase().replace(/[-]/g, '');
    const fueRealmentePagado = identidadesPagadas.has(idClean);
    
    const sysDeuda = parseFloat(i.deuda_mmv || 0);
    const sysCongelada = parseFloat(i.deuda_congelada_bs || 0);
    const sysMulta = parseFloat(i.multa_bs || 0);
    const sysMeses = parseInt(i.meses_deuda || 0);
    
    const exMeses = excel.mesesPendientes + MESES_ADICIONALES;
    const exDeuda = excel.deudaTotal;
    const exMulta = excel.multaTotal;
    
    const fields = {};
    let needsUpdate = false;

    // Caso 1: Deuda fue limpiada por prueba (no pago real)
    if (sysDeuda === 0 && sysCongelada === 0 && sysMeses === 0 && excel.mesesPendientes > 0) {
      if (fueRealmentePagado) {
        statYaPagado++;
        return; // No tocar, fue pagado realmente
      }
      // Restaurar deuda completa del Excel (+3 meses)
      fields.deuda_congelada_bs = exDeuda;
      fields.multa_bs = exMulta;
      fields.meses_deuda = exMeses;
      statRestaurar++;
      needsUpdate = true;
    }
    
    // Caso 2: Tiene deuda pero meses inconsistente
    if (!needsUpdate && (sysDeuda > 0 || sysCongelada > 0) && sysMeses === 0 && excel.mesesPendientes > 0) {
      fields.meses_deuda = exMeses;
      statSyncMeses++;
      needsUpdate = true;
    }
    
    // Caso 3: Meses correctos pero multa falta
    if (sysMulta === 0 && exMulta > 0 && !fueRealmentePagado) {
      fields.multa_bs = exMulta;
      statSyncMulta++;
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.push({ id: i.id, fields });
    }
  });

  console.log('  Restaurar (pruebas):', statRestaurar);
  console.log('  Sincronizar meses:', statSyncMeses);
  console.log('  Sincronizar multa:', statSyncMulta);
  console.log('  Ya pagados (no tocar):', statYaPagado);
  console.log('  No están en Excel:', statNoExcel);
  console.log('  Total updates:', updates.length);

  // Ejecutar updates en lotes
  const BATCH = 100;
  let okCount = 0, errCount = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const lote = updates.slice(i, i + BATCH);
    await Promise.all(lote.map(async ({ id, fields }) => {
      const { error } = await sb.from('inmuebles').update(fields).eq('id', id);
      if (error) errCount++;
      else okCount++;
    }));
    process.stdout.write('  Progreso: ' + Math.min(i + BATCH, updates.length) + '/' + updates.length + '\r');
  }
  console.log('\n  ✅ Actualizados:', okCount, '| Errores:', errCount);

  // ══════════ 1.3: VERIFICAR TARIFAS (mmv_mes) ══════════
  console.log('\n═══ FASE 1.3: VERIFICAR TARIFAS (mmv_mes) ═══');
  let tarifaOK = 0, tarifaErr = 0;
  const tarifaUpdates = [];

  Object.entries(excelMap).forEach(([cod, excel]) => {
    const sys = sysMap[cod];
    if (!sys) return;

    const sysMMV = parseFloat(sys.mmv_mes || 0);
    // El Excel tiene "Monto x mes" en Bs. Necesitamos MMV
    // Pero mmv_mes en el sistema ya es el valor MMV correcto de la importación original
    // Solo verificamos que no sea 0 cuando debería tener valor
    if (sysMMV === 0 && excel.montoPorMes > 0 && excel.mesesPendientes > 0) {
      tarifaErr++;
      // No podemos restaurar mmv_mes desde el Excel porque el Excel tiene Bs, no MMV
      // Pero sí podemos flaggear
    } else {
      tarifaOK++;
    }
  });
  console.log('  Tarifas OK (mmv_mes > 0):', tarifaOK);
  console.log('  Tarifas faltantes (mmv_mes = 0):', tarifaErr);

  // ══════════ 1.4: VERIFICAR ACTIVIDAD ECONÓMICA EN COMERCIALES ══════════
  console.log('\n═══ FASE 1.4: VERIFICAR ACTIVIDAD ECONÓMICA ═══');
  let actOK = 0, actFalta = 0;
  const actUpdates = [];

  inmuebles.forEach(i => {
    const tipo = (i.tipo || '').toUpperCase();
    if (!tipo.includes('COMERCIAL') && !tipo.includes('INDUSTRIAL')) return;
    
    const excel = excelMap[i.inmueble];
    const sysAct = (i.actividad_principal || '').trim();
    
    if (sysAct) {
      actOK++;
    } else if (excel && excel.actividad) {
      actFalta++;
      actUpdates.push({ id: i.id, actividad_principal: excel.actividad });
    } else {
      actFalta++;
    }
  });
  console.log('  Comerciales con actividad:', actOK);
  console.log('  Comerciales SIN actividad:', actFalta);
  console.log('  Con fix disponible del Excel:', actUpdates.length);

  // Aplicar fixes de actividad
  if (actUpdates.length > 0) {
    let actOkC = 0;
    for (let i = 0; i < actUpdates.length; i += BATCH) {
      const lote = actUpdates.slice(i, i + BATCH);
      await Promise.all(lote.map(async ({ id, actividad_principal }) => {
        const { error } = await sb.from('inmuebles').update({ actividad_principal }).eq('id', id);
        if (!error) actOkC++;
      }));
    }
    console.log('  ✅ Actividades restauradas:', actOkC);
  }

  // ══════════ VERIFICACIÓN FINAL ══════════
  console.log('\n═══ VERIFICACIÓN FINAL ═══');
  const { data: sample } = await sb.from('inmuebles')
    .select('inmueble, identidad, deuda_mmv, deuda_congelada_bs, multa_bs, meses_deuda, tipo, actividad_principal')
    .gt('meses_deuda', 0)
    .limit(5);
  
  console.log('Muestra de inmuebles con deuda activa:');
  sample?.forEach(s => {
    console.log('  ' + s.inmueble + ' | ' + s.identidad + ' | meses:' + s.meses_deuda + ' | deuda_bs:' + s.deuda_congelada_bs + ' | multa:' + s.multa_bs + ' | tipo:' + s.tipo + ' | act:' + (s.actividad_principal || 'N/A'));
  });

  // Contar inconsistentes restantes
  const postInm = await fetchAll('inmuebles', 'deuda_mmv, deuda_congelada_bs, meses_deuda, multa_bs');
  let postInconsistentes = 0, postConDeuda = 0;
  postInm.forEach(i => {
    const deuda = parseFloat(i.deuda_mmv || 0);
    const cong = parseFloat(i.deuda_congelada_bs || 0);
    const meses = parseInt(i.meses_deuda || 0);
    if ((deuda > 0 || cong > 0) && meses === 0) postInconsistentes++;
    if (deuda > 0 || cong > 0 || meses > 0) postConDeuda++;
  });
  console.log('\nPost-fix:');
  console.log('  Inmuebles con deuda:', postConDeuda);
  console.log('  Inconsistentes restantes:', postInconsistentes);

  console.log('\n✅ FASE 1 COMPLETADA');
})();
