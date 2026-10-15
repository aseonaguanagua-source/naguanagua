const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runAudit() {
  console.log('1. Cargando catálogo de Agentes de Retención en DB...');
  
  // A. Obtener todas las identidades y códigos que tienen agente_retencion = true en inmuebles
  const { data: inmsAgentes, error: errInm } = await supabase
    .from('inmuebles')
    .select('identidad, inmueble, contribuyente, tipo, clasificacion, agente_retencion')
    .eq('agente_retencion', true);

  if (errInm) console.error('Error cargando inmuebles:', errInm);

  const rifsAgentes = new Set();
  const codigosAgentes = new Set();
  const nombresMap = new Map();

  for (const inm of inmsAgentes || []) {
    if (inm.identidad) {
      const cleanId = String(inm.identidad).trim().toUpperCase();
      rifsAgentes.add(cleanId);
      rifsAgentes.add(cleanId.replace(/-/g, ''));
      if (inm.contribuyente && !nombresMap.has(cleanId)) {
        nombresMap.set(cleanId, inm.contribuyente);
      }
    }
    if (inm.inmueble) codigosAgentes.add(String(inm.inmueble).trim().toUpperCase());
  }

  // B. Obtener condominios con agente_retencion = true
  const { data: condosAgentes } = await supabase
    .from('condominios')
    .select('identidad, codigo, nombre, agente_retencion')
    .eq('agente_retencion', true);

  for (const c of condosAgentes || []) {
    if (c.identidad) {
      const cleanId = String(c.identidad).trim().toUpperCase();
      rifsAgentes.add(cleanId);
      rifsAgentes.add(cleanId.replace(/-/g, ''));
      if (c.nombre && !nombresMap.has(cleanId)) nombresMap.set(cleanId, c.nombre);
    }
    if (c.codigo) codigosAgentes.add(String(c.codigo).trim().toUpperCase());
  }

  console.log(`- RIFs únicos identificados como Agentes de Retención: ${rifsAgentes.size / 2}`);
  console.log(`- Códigos de Inmuebles como Agentes: ${codigosAgentes.size}`);

  // C. Cargar TODOS los pagos reportados históricos
  console.log('2. Analizando pagos reportados históricos...');
  const { data: todosPagos, error: errPagos } = await supabase
    .from('pagos_reportados')
    .select('*')
    .order('created_at', { ascending: true });

  if (errPagos) {
    console.error('Error cargando pagos:', errPagos);
    return;
  }

  // Identificar comprobantes de retención emitidos
  const pagosRetencion = (todosPagos || []).filter(p => 
    p.tipo === 'Retencion de IVA' || 
    String(p.referencia || '').toUpperCase().startsWith('RET-')
  );

  const vinculosRetencion = new Set();
  for (const r of pagosRetencion) {
    let det = r.detalles;
    if (typeof det === 'string') {
      try { det = JSON.parse(det); } catch(e) {}
    }
    if (det?.pago_vinculado) vinculosRetencion.add(det.pago_vinculado);
    if (r.identidad) {
      // Registrar clave identidad + fecha corta para matchear retenciones manuales
      const fechaCorta = String(r.created_at || '').slice(0, 10);
      vinculosRetencion.add(`${String(r.identidad).trim().toUpperCase()}_${fechaCorta}`);
    }
  }

  const sinDeduccion = [];
  const conDeduccion = [];

  for (const p of todosPagos || []) {
    // Descartar si el pago en sí es una fila de comprobante de retención
    if (p.tipo === 'Retencion de IVA' || String(p.referencia || '').toUpperCase().startsWith('RET-')) {
      continue;
    }
    // Descartar pagos rechazados
    if (p.estado === 'Rechazado') continue;

    let det = p.detalles;
    if (typeof det === 'string') {
      try { det = JSON.parse(det); } catch(e) {}
    }

    const cleanId = String(p.identidad || '').trim().toUpperCase();
    const idSinGuion = cleanId.replace(/-/g, '');
    const fechaCorta = String(p.created_at || '').slice(0, 10);

    // Verificar si el pago pertenece a un Agente de Retención
    const esAgentePorRIF = rifsAgentes.has(cleanId) || rifsAgentes.has(idSinGuion);
    const esAgentePorDetalle = det?.es_agente_retencion === true || det?.agente_retencion === true;
    
    // Verificar si alguno de los recibos o inmuebles pagados es agente
    let esAgentePorInmueble = false;
    const recibos = det?.recibos || [];
    for (const r of recibos) {
      for (const cod of codigosAgentes) {
        if (String(r).toUpperCase().includes(cod)) {
          esAgentePorInmueble = true;
          break;
        }
      }
      if (esAgentePorInmueble) break;
    }

    const esAgente = esAgentePorRIF || esAgentePorDetalle || esAgentePorInmueble;
    if (!esAgente) {
      // No es agente de retención, continuar
      continue;
    }

    // Descartar si es estrictamente residencial (no aplica retención de IVA)
    const tipoInm = String(det?.tipo || det?.clasificacion || '').toUpperCase();
    if (tipoInm.includes('RESIDENCIAL') && !tipoInm.includes('COMERCIAL')) {
      continue;
    }

    // Verificar si este pago tuvo deducción de retención
    const retEnDetalle = parseFloat(String(det?.monto_retencion_iva || det?.retencion_iva || 0));
    const tieneRetVinculada = vinculosRetencion.has(p.id) || vinculosRetencion.has(`${cleanId}_${fechaCorta}`);

    const montoCobrado = parseFloat(String(p.monto || 0));

    if (retEnDetalle > 0 || tieneRetVinculada) {
      conDeduccion.push({
        pago_id: p.id,
        referencia: p.referencia,
        identidad: cleanId,
        contribuyente: det?.contribuyente || nombresMap.get(cleanId) || 'N/A',
        monto_cobrado: montoCobrado,
        retencion_aplicada: retEnDetalle,
        fecha: fechaCorta
      });
    } else {
      // NO TUVO DEDUCCIÓN: Se le cobró el monto bruto sin retener el 75% del IVA
      // Estimación del IVA y Retención no deducida:
      // Si el monto cobrado era Base + 16% IVA:
      // Base = Monto / 1.16
      // IVA = Monto - Base
      // Retención 75% = IVA * 0.75
      const baseAprox = montoCobrado / 1.16;
      const ivaAprox = montoCobrado - baseAprox;
      const retencionNoDeducida = ivaAprox * 0.75;

      sinDeduccion.push({
        pago_id: p.id,
        fecha: fechaCorta,
        referencia: p.referencia,
        identidad: cleanId,
        contribuyente: det?.contribuyente || det?.condominio?.nombre || nombresMap.get(cleanId) || 'CONTRIBUYENTE',
        monto_cobrado_bs: montoCobrado,
        retencion_no_deducida_aprox_bs: Math.round(retencionNoDeducida * 100) / 100,
        cajero: det?.cajero || det?.analista || 'Caja / Web',
        metodo: p.tipo || 'Transferencia',
        modulo: det?.modulo || (det?.isCondominio ? 'Condominios' : 'Caja Principal')
      });
    }
  }

  // Ordenar por fecha descendente
  sinDeduccion.sort((a, b) => (b.fecha > a.fecha ? 1 : -1));

  // Guardar resultado detallado en JSON
  const outJson = '/Users/davidzara/Documents/naguanagua_zero/auditoria_agentes_sin_deduccion.json';
  fs.writeFileSync(outJson, JSON.stringify({
    total_pagos_agentes_sin_deduccion: sinDeduccion.length,
    total_pagos_agentes_con_deduccion: conDeduccion.length,
    monto_total_cobrado_sin_deduccion_bs: Math.round(sinDeduccion.reduce((acc, x) => acc + x.monto_cobrado_bs, 0) * 100) / 100,
    monto_total_retenciones_no_deducidas_bs: Math.round(sinDeduccion.reduce((acc, x) => acc + x.retencion_no_deducida_aprox_bs, 0) * 100) / 100,
    detalle_pagos_sin_deduccion: sinDeduccion
  }, null, 2), 'utf8');

  // Guardar en CSV para abrir en Excel
  const outCsv = '/Users/davidzara/Documents/naguanagua_zero/auditoria_agentes_sin_deduccion.csv';
  const csvRows = [
    ['Fecha', 'Referencia', 'RIF', 'Contribuyente', 'Monto Cobrado (Bs.)', 'Retención IVA 75% No Deducida (Bs.)', 'Cajero', 'Método', 'Módulo'].join(';')
  ];
  for (const s of sinDeduccion) {
    csvRows.push([
      s.fecha,
      `="${s.referencia}"`,
      s.identidad,
      `"${(s.contribuyente || '').replace(/"/g, '""')}"`,
      s.monto_cobrado_bs.toFixed(2).replace('.', ','),
      s.retencion_no_deducida_aprox_bs.toFixed(2).replace('.', ','),
      s.cajero,
      s.metodo,
      s.modulo
    ].join(';'));
  }
  fs.writeFileSync(outCsv, csvRows.join('\n'), 'utf8');

  console.log('\n=== RESULTADO AUDITORÍA HISTÓRICA ===');
  console.log(`Total pagos de Agentes de Retención SIN deducción: ${sinDeduccion.length}`);
  console.log(`Total pagos de Agentes de Retención CON deducción: ${conDeduccion.length}`);
  console.log(`Monto total cobrado sin deducción: Bs. ${sinDeduccion.reduce((acc, x) => acc + x.monto_cobrado_bs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
  console.log(`Retenciones de IVA (75%) no deducidas acumuladas: Bs. ${sinDeduccion.reduce((acc, x) => acc + x.retencion_no_deducida_aprox_bs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
  console.log(`Archivos generados:`);
  console.log(`  - ${outJson}`);
  console.log(`  - ${outCsv}`);
}

runAudit();
