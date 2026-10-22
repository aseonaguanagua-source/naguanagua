const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

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

// Load Record de deudas
let recordMap = new Map();
try {
  const wb = xlsx.readFile(path.join(__dirname, 'Record de deudas - 20260924180506 (1).xlsx'));
  const sheet = wb.Sheets['Record de deudas'];
  const rows = xlsx.utils.sheet_to_json(sheet);
  rows.forEach(r => {
    if (r['Código']) recordMap.set(String(r['Código']).trim().toUpperCase(), r);
  });
  console.log(`Cargados ${recordMap.size} registros de Record de deudas (Sistema Anterior)`);
} catch (e) {
  console.warn('No se pudo cargar Record de deudas:', e.message);
}

// Import sanitizarDireccionFiscal logic
function sanitizarDireccionFiscal(raw, opts = {}) {
  let s = String(raw || '').trim();
  const esVaciaOInvalida = !s || /^[0\s.-]+$/i.test(s) || s.toUpperCase() === 'N/A';
  if (esVaciaOInvalida) {
    if (opts.parentDir && typeof opts.parentDir === 'string' && opts.parentDir.trim().length > 3) {
      s = opts.parentDir.trim();
    } else if (opts.nombreCondo && typeof opts.nombreCondo === 'string') {
      s = `${opts.nombreCondo}, NAGUANAGUA, EDO. CARABOBO`;
    } else {
      return 'NAGUANAGUA, EDO. CARABOBO';
    }
  }

  const match = s.match(/\b(URB|AV|AVENIDA|CALLE|CARRERA|SECTOR|CARRETERA|ZONA|AUTOPISTA|PARCELAMIENTO|CONJ|EDIF|C\.C|CENTRO|RESD|RESIDENCIAS?|CASA|LOCAL|QUINTA|GALPON)\b/i);
  if (match && match.index !== undefined && match.index > 0) {
    s = s.slice(match.index);
  } else {
    s = s.replace(/^[0-9\s.-]+(\bS\/N\b\s*)?/i, '');
  }

  s = s.replace(/\b(NRO|APTO|LOCAL|OFICINA)\.?\s*\./gi, '');
  s = s.replace(/\s+/g, ' ').trim();

  const uNum = (opts.unidadNumero || '').trim();
  if (uNum) {
    const cleanUNum = uNum.replace(/^(LOCAL|APTO|NRO\.?|OFICINA)\s*/i, '');
    const regexUnit = new RegExp(`\\b(LOCAL|APTO|OFICINA|NRO\\.?)\\s*${cleanUNum.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (!regexUnit.test(s)) {
      if (/C\.C\.|CENTRO COMERCIAL|CONJ\.|EDIF\./i.test(s)) {
        s = s.replace(/(C\.C\.[^,]+|CENTRO COMERCIAL[^,]+|CONJ\.[^,]+|EDIF\.[^,]+)/i, `$1 LOCAL ${cleanUNum}`);
      } else {
        s = `LOCAL ${cleanUNum}, ${s}`;
      }
    }
  }

  if (!/NAGUANAGUA/i.test(s)) s += ', NAGUANAGUA';
  if (!/CARABOBO/i.test(s)) s += ', EDO. CARABOBO';

  s = s.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  s = s.replace(/^,\s*|,\s*$/g, '');

  if (s.length > 100) {
    s = s
      .replace(/CENTRO COMERCIAL/gi, 'C.C.')
      .replace(/CONJUNTO RESIDENCIAL/gi, 'CONJ. RESD.')
      .replace(/URBANIZACION/gi, 'URB.')
      .replace(/AVENIDA/gi, 'AV.')
      .replace(/ESTADO CARABOBO/gi, 'EDO. CARABOBO');
  }

  return s.slice(0, 100).trim();
}

async function auditarTodas() {
  const { data: pagos, error } = await supabase
    .from('pagos_reportados')
    .select('*')
    .eq('estado', 'Aprobado')
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) {
    console.error('Error:', error);
    return;
  }

  const pendientes = [];
  for (const p of pagos) {
    let d = {};
    try { d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch(e){}
    const fd = d.factura_digital;
    const esEmitida = Boolean(fd?.emitida || fd?.numero_documento || fd?.url);
    const esAnulada = Boolean(p.estado === 'Anulado' || fd?.anulada || fd?.nota_credito);
    if (d?.es_pago_adicional === true || Boolean(d?.pago_principal_id)) continue;
    if (p.tipo === 'Retencion de IVA') continue;

    if (d?.es_abono === true || d?.abono === true || p.tipo === 'Abono' || d?.pago_parcial === true || (d?.monto_pendiente !== undefined && parseFloat(String(d.monto_pendiente)) > 0.05)) {
      continue;
    }

    if (!esEmitida && !esAnulada) {
      pendientes.push({ pago: p, det: d });
    }
  }

  console.log(`Analizando ${pendientes.length} facturas pendientes por emitir...`);

  // Extraer todos los códigos de inmuebles involucrados
  const todosCodigos = new Set();
  pendientes.forEach(({ det }) => {
    (det.recibos || []).forEach(r => {
      const m = r.match(/^(?:RECIB-HIST-|CONDO-|MULTA-)?([A-Z0-9]+)/);
      if (m && m[1]) todosCodigos.add(m[1]);
    });
    (det.condominio?.lineas || []).forEach(l => { if (l.inmueble) todosCodigos.add(l.inmueble); });
    (det.condominio_hijos_pagados || []).forEach(l => { if (l.inmueble) todosCodigos.add(l.inmueble); });
    if (det.inmueble) todosCodigos.add(det.inmueble);
    if (det.codigo_inmueble) todosCodigos.add(det.codigo_inmueble);
    if (det.condominio?.codigo) todosCodigos.add(det.condominio.codigo);
  });

  const arrCodigos = Array.from(todosCodigos);
  console.log(`Buscando ${arrCodigos.length} inmuebles en BD...`);
  const inmueblesMap = new Map();
  for (let i = 0; i < arrCodigos.length; i += 200) {
    const chunk = arrCodigos.slice(i, i + 200);
    const { data: inms } = await supabase.from('inmuebles').select('*').in('inmueble', chunk);
    (inms || []).forEach(inm => inmueblesMap.set(inm.inmueble, inm));
  }

  const unidadesMap = new Map();
  for (let i = 0; i < arrCodigos.length; i += 200) {
    const chunk = arrCodigos.slice(i, i + 200);
    const { data: unis } = await supabase.from('condominio_unidades').select('*').in('inmueble_id', chunk);
    (unis || []).forEach(u => unidadesMap.set(u.inmueble_id, u));
  }

  const discrepancias = [];

  for (let i = 0; i < pendientes.length; i++) {
    const { pago, det } = pendientes[i];
    const esCondo = det.isCondominio || det.es_condominio || det.modulo === 'condominios' || det.condominio;
    const modo = det.modo || (esCondo ? 'CONDOMINIO' : 'INDIVIDUAL');
    const esPagoHijo = modo === 'CONTRIBUYENTE' && esCondo;

    const lineas = det.condominio?.lineas || det.condominio_hijos_pagados || [];
    const linea0 = lineas[0] || {};

    const rawCod = 
      (esPagoHijo && linea0.inmueble) ||
      (esPagoHijo && det.cod_inmueble && !String(det.cod_inmueble).startsWith('CONDO-') ? det.cod_inmueble : '') ||
      (det.condominio?.codigo) ||
      linea0.inmueble ||
      det.inmueble ||
      (det.recibos && det.recibos[0]) || '';

    let inmCod = String(rawCod || '');
    if (inmCod.startsWith('RECIB-HIST-')) inmCod = inmCod.replace('RECIB-HIST-', '').split('-')[0];
    if (inmCod.startsWith('CONDO-')) inmCod = inmCod.split('-')[1] || '';
    if (inmCod.startsWith('MULTA-')) inmCod = inmCod.replace('MULTA-', '').split('-')[0];

    const inmBd = inmueblesMap.get(inmCod);
    const uniBd = unidadesMap.get(inmCod);
    const recOld = recordMap.get(inmCod);

    // Dirección original del sistema anterior
    const dirSistemaAnterior = recOld?.['Dir. fiscal'] || null;

    // Dirección actual en BD
    const dirInmBd = inmBd?.direccion || null;
    const dirUniBd = uniBd?.direccion || null;

    // Dirección sanitizada calculada por el sistema actualmente
    const dirSanitizadaActual = sanitizarDireccionFiscal(
      dirInmBd || det.direccion || det.recibo_caja?.[0]?.domicilioFiscal,
      {
        unidadNumero: linea0.numero,
        nombreCondo: det.condominio?.nombre,
        parentDir: det.condominio?.direccion
      }
    );

    // Analizar anomalías
    const problemas = [];
    if (!dirSanitizadaActual || dirSanitizadaActual === 'NAGUANAGUA, EDO. CARABOBO' || dirSanitizadaActual.startsWith(', NAGUANAGUA')) {
      problemas.push('DIRECCIÓN VACÍA O GENÉRICA');
    }
    if (dirSanitizadaActual.endsWith('EDO. CA') || dirSanitizadaActual.endsWith('EDO.') || dirSanitizadaActual.endsWith('CARABOB')) {
      problemas.push('TRUNCADA AL FINAL (EDO. CA)');
    }
    if (linea0.numero && dirSanitizadaActual.includes(linea0.numero)) {
      // chequear si el numero está duplicado
      const matches = dirSanitizadaActual.match(new RegExp(linea0.numero.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi')) || [];
      if (matches.length > 1) {
        problemas.push(`NÚMERO DE LOCAL DUPLICADO (${linea0.numero})`);
      }
    }
    if (esPagoHijo && !dirSanitizadaActual.includes(linea0.numero || '---') && linea0.numero) {
      problemas.push(`NO CONTIENE EL LOCAL DEL HIJO (${linea0.numero})`);
    }
    if (dirInmBd && dirSistemaAnterior && dirInmBd.trim() === '0 0' && dirSistemaAnterior.trim() !== '0 0') {
      problemas.push(`TIENE '0 0' EN BD PERO EN SISTEMA ANTERIOR TIENE: "${dirSistemaAnterior}"`);
    }

    if (problemas.length > 0 || esPagoHijo || dirSistemaAnterior) {
      discrepancias.push({
        num: i + 1,
        pagoId: pago.id.slice(0, 8),
        ref: pago.referencia,
        fecha: pago.created_at.slice(0, 10),
        monto: pago.monto,
        rif: pago.identidad,
        contribuyente: det.contribuyente || inmBd?.contribuyente || pago.identidad,
        modo,
        esPagoHijo,
        inmCod,
        localHijo: linea0.numero || null,
        dirInmBd,
        dirSistemaAnterior,
        dirSanitizadaActual,
        problemas
      });
    }
  }

  console.log(`\n======================================================================`);
  console.log(`TOTAL CASOS REVISADOS CON HIJOS / DISCREPANCIAS: ${discrepancias.length}`);
  console.log(`======================================================================\n`);

  discrepancias.forEach(d => {
    console.log(`[#${d.num}] Pago ${d.pagoId} | Ref: ${d.ref} | Monto: Bs. ${d.monto} | Modo: ${d.modo}`);
    console.log(`  Contribuyente: ${d.contribuyente} (${d.rif}) | Inm: ${d.inmCod} ${d.localHijo ? `(Local: ${d.localHijo})` : ''}`);
    console.log(`  Dir Sistema Anterior: ${d.dirSistemaAnterior || 'NO REGISTRADA EN EXCEL'}`);
    console.log(`  Dir en Inmuebles BD:  ${d.dirInmBd || 'NO REGISTRADA EN BD'}`);
    console.log(`  Dir Sanitizada:       ${d.dirSanitizadaActual}`);
    if (d.problemas.length > 0) {
      console.log(`  ⚠️  PROBLEMAS: ${d.problemas.join(' | ')}`);
    }
    console.log('----------------------------------------------------------------------');
  });

  fs.writeFileSync('scripts/reporte_auditoria_direcciones.json', JSON.stringify(discrepancias, null, 2));
  console.log('Reporte guardado en scripts/reporte_auditoria_direcciones.json');
}

auditarTodas();
