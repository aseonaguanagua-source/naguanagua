const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkDiscrepancies() {
  console.log('=== AUDITORIA DE DISCREPANCIAS RIF VS CODIGO ===');
  
  // 1. Cargar todas las facturas pendientes
  let allFacs = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('facturas').select('*').in('estado', ['Pendiente', 'Por Verificar']).range(from, from + 999);
    if (!data || data.length === 0) break;
    allFacs.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log('Total facturas pendientes en sistema:', allFacs.length);

  // 2. Cargar todos los inmuebles
  let allInms = [];
  from = 0;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, padre_id, meses_deuda, deuda_mmv, saldo_favor_bs, estado').range(from, from + 999);
    if (!data || data.length === 0) break;
    allInms.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log('Total inmuebles en sistema:', allInms.length);

  const inmsByRif = new Map();
  allInms.forEach(i => {
    if (i.estado === 'Eliminado') return;
    const clean = (i.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').trim().toUpperCase();
    if (!clean) return;
    if (!inmsByRif.has(clean)) inmsByRif.set(clean, []);
    inmsByRif.get(clean).push(i);
  });

  const rifsWithPendingFacs = new Map();
  allFacs.forEach(f => {
    const clean = (f.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').trim().toUpperCase();
    if (!clean) return;
    if (!rifsWithPendingFacs.has(clean)) rifsWithPendingFacs.set(clean, []);
    rifsWithPendingFacs.get(clean).push(f);
  });

  console.log('RIFs con facturas pendientes:', rifsWithPendingFacs.size);

  let multiInmWithDiscrepancy = [];
  for (const [rif, facs] of rifsWithPendingFacs.entries()) {
    const inms = inmsByRif.get(rif) || [];
    if (inms.length > 1) {
      const hasDebt = inms.some(i => parseInt(i.meses_deuda || 0) > 0 || parseFloat(i.deuda_mmv || 0) > 0);
      const hasZeroDebt = inms.some(i => parseInt(i.meses_deuda || 0) === 0 && parseFloat(i.deuda_mmv || 0) === 0 && (i.actividad_principal || '').trim().toUpperCase() !== 'N/A');
      if (hasDebt && hasZeroDebt) {
        multiInmWithDiscrepancy.push({
          rif,
          nombre: inms[0].contribuyente,
          inmuebles: inms.map(i => ({ cod: i.inmueble, act: i.actividad_principal, meses: i.meses_deuda, saldo: i.saldo_favor_bs, padre: i.padre_id })),
          facturas: facs.map(f => ({ ref: f.referencia, monto: f.monto }))
        });
      }
    }
  }

  console.log('Contribuyentes con múltiples inmuebles donde UNO tiene deuda y OTRO tiene meses=0:', multiInmWithDiscrepancy.length);
  multiInmWithDiscrepancy.slice(0, 20).forEach(c => {
    console.log('--- RIF:', c.rif, '-', c.nombre);
    console.log('    Inmuebles:', JSON.stringify(c.inmuebles));
    console.log('    Facturas:', JSON.stringify(c.facturas));
  });
}
checkDiscrepancies();
