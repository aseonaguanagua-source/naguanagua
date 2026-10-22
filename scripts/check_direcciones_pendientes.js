const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectPendientes() {
  const { data: pagos, error } = await supabase
    .from('pagos_reportados')
    .select('*')
    .eq('estado', 'Aprobado')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('Error fetching pagos:', error);
    return;
  }

  const pendientes = [];
  for (const p of (pagos || [])) {
    let d = {};
    try { d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch(e){}
    const fd = d.factura_digital;
    const esEmitida = Boolean(fd?.emitida || fd?.numero_documento || fd?.url);
    const esAnulada = Boolean(p.estado === 'Anulado' || fd?.anulada || fd?.nota_credito);
    if (d?.es_pago_adicional === true || Boolean(d?.pago_principal_id)) continue;
    if (p.tipo === 'Retencion de IVA') continue;

    // abonos parciales sin completar no salen
    if (d?.es_abono === true || d?.abono === true || p.tipo === 'Abono' || d?.pago_parcial === true || (d?.monto_pendiente !== undefined && parseFloat(String(d.monto_pendiente)) > 0.05)) {
      continue;
    }

    if (!esEmitida && !esAnulada) {
      pendientes.push({ pago: p, det: d });
    }
  }

  console.log('Total facturas pendientes por emitir:', pendientes.length);

  for (let i = 0; i < pendientes.length; i++) {
    const { pago, det } = pendientes[i];
    const rawCod = 
      det.condominio?.lineas?.[0]?.inmueble ||
      det.lineas?.[0]?.inmueble ||
      det.condominio_hijos_pagados?.[0]?.inmueble ||
      det.inmueble ||
      (det.codigo_inmueble && !String(det.codigo_inmueble).startsWith('CONDO-') ? det.codigo_inmueble : '') ||
      (det.cod_inmueble && !String(det.cod_inmueble).startsWith('CONDO-') ? det.cod_inmueble : '') ||
      (det.condominio?.codigo ? det.condominio.codigo : '') ||
      (det.recibos && det.recibos[0]) || '';

    let inmCod = String(rawCod || '');
    if (inmCod.startsWith('RECIB-HIST-')) inmCod = inmCod.replace('RECIB-HIST-', '').split('-')[0];
    if (inmCod.startsWith('CONDO-')) inmCod = inmCod.split('-')[1] || '';
    if (inmCod.startsWith('MULTA-')) inmCod = inmCod.replace('MULTA-', '').split('-')[0];

    // Buscar en BD inmuebles
    let inm = null;
    if (inmCod) {
      const { data } = await supabase.from('inmuebles').select('inmueble, direccion, identidad, contribuyente, condominio_padre_id').eq('inmueble', inmCod).maybeSingle();
      inm = data;
    }

    // Buscar en condominio_unidades si aplica
    let condoUnidad = null;
    if (inmCod) {
      const { data } = await supabase.from('condominio_unidades').select('inmueble_id, numero, direccion, propietario, cedula, condominio_id').eq('inmueble_id', inmCod).maybeSingle();
      condoUnidad = data;
    }

    // Si no encontro por inmCod, buscar por cedula
    let inmsPorCedula = [];
    if (pago.identidad) {
      const { data } = await supabase.from('inmuebles').select('inmueble, direccion, identidad, contribuyente, condominio_padre_id').eq('identidad', pago.identidad).limit(5);
      inmsPorCedula = data || [];
    }

    console.log(`\n======================================================================`);
    console.log(`[#${i+1}] PAGO ID: ${pago.id.slice(0,8)} | Ref: ${pago.referencia} | Fecha: ${pago.created_at.slice(0,10)}`);
    console.log(`Contribuyente: ${det.contribuyente || pago.identidad} (RIF: ${pago.identidad})`);
    console.log(`Monto Pago: Bs. ${pago.monto}`);
    console.log(`Recibos:`, det.recibos);
    console.log(`Condominio en Det:`, det.condominio?.codigo, det.condominio?.nombre);
    console.log(`Lineas/Hijos en Det:`, (det.condominio?.lineas || det.condominio_hijos_pagados || []).map(h => ({ inm: h.inmueble, num: h.numero })));
    console.log(`RawCod detectado: '${rawCod}' => InmCod resuelto: '${inmCod}'`);
    console.log(`Dirección en detalles del pago: '${det.direccion || ''}'`);
    console.log(`Dirección en recibo_caja: '${det.recibo_caja?.[0]?.domicilioFiscal || ''}'`);
    console.log(`Dirección en tabla 'inmuebles' para ${inmCod}: '${inm?.direccion || 'NO REGISTRADO'}' (padre: ${inm?.condominio_padre_id || 'ninguno'})`);
    console.log(`Dirección en tabla 'condominio_unidades' para ${inmCod}: '${condoUnidad?.direccion || 'NO REGISTRADO'}' (unidad: ${condoUnidad?.numero || 'N/A'}, condo_id: ${condoUnidad?.condominio_id || 'N/A'})`);
    if (inmsPorCedula.length > 0 && (!inm || inm.inmueble !== inmsPorCedula[0].inmueble)) {
      console.log(`Inmuebles por RIF ${pago.identidad}:`, inmsPorCedula.map(x => `${x.inmueble} -> ${x.direccion}`));
    }
  }
}

inspectPendientes();
