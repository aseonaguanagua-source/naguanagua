const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('=== REMEDIACIÓN DE PAGOS APROBADOS Y DEUDA RESIDUAL / PADRES N/A ===');

  // 1. Obtener todos los pagos aprobados
  let allPagos = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('pagos_reportados')
      .select('id, referencia, identidad, estado, detalles, created_at')
      .eq('estado', 'Aprobado')
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    allPagos.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total pagos aprobados encontrados: ${allPagos.length}`);

  // 2. Extraer todos los recibos y meses pagados por inmueble
  // paidMonthsByInm: Map<inmCode, countOfPaidMonths>
  const paidMonthsByInm = new Map();
  const allPaidReceiptRefs = new Set();
  const rifsWithApprovedPayments = new Set();

  allPagos.forEach((p) => {
    if (p.identidad) rifsWithApprovedPayments.add(p.identidad);
    const d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles;
    const recs = d?.recibos || [];
    recs.forEach((r) => {
      if (typeof r === 'string') {
        allPaidReceiptRefs.add(r);
        if (r.startsWith('RECIB-HIST-')) {
          const parts = r.split('-');
          const inmCode = parts[2];
          if (inmCode) {
            paidMonthsByInm.set(inmCode, (paidMonthsByInm.get(inmCode) || 0) + 1);
          }
        }
      }
    });
  });

  console.log(`Inmuebles con recibos históricos pagados: ${paidMonthsByInm.size}`);

  // 3. Revisar y descontar deuda de los inmuebles pagados
  const inmCodes = Array.from(paidMonthsByInm.keys());
  let inmsActualizados = 0;
  const padresToCheck = new Set();

  for (let i = 0; i < inmCodes.length; i += 50) {
    const chunk = inmCodes.slice(i, i + 50);
    const { data: dbInms } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, padre_id, meses_deuda, deuda_mmv, mmv_mes')
      .in('inmueble', chunk);

    for (const inm of dbInms || []) {
      const mesesActuales = Math.max(0, parseInt(inm.meses_deuda || 0));
      const mesesPagados = paidMonthsByInm.get(inm.inmueble) || 0;

      if (inm.padre_id) padresToCheck.add(inm.padre_id);

      if (mesesActuales > 0 && mesesPagados > 0) {
        const nuevosMeses = Math.max(0, mesesActuales - mesesPagados);
        const mmv = parseFloat(inm.mmv_mes || 0);
        const nuevaDeudaMmv = nuevosMeses === 0 ? 0 : parseFloat((nuevosMeses * mmv).toFixed(6));

        console.log(`-> Actualizando ${inm.inmueble} (${inm.contribuyente}): ${mesesActuales} meses -> ${nuevosMeses} meses`);

        const { error: updErr } = await supabase
          .from('inmuebles')
          .update({
            meses_deuda: nuevosMeses,
            deuda_mmv: nuevaDeudaMmv,
            ...(nuevosMeses === 0 ? { deuda_congelada_bs: 0, multa_bs: 0 } : {})
          })
          .eq('id', inm.id);

        if (updErr) {
          console.error(`Error actualizando ${inm.inmueble}:`, updErr.message);
        } else {
          inmsActualizados++;
        }
      }
    }
  }

  console.log(`Inmuebles actualizados con éxito: ${inmsActualizados}`);

  // 4. Sincronizar todos los Padres N/A
  console.log(`Sincronizando ${padresToCheck.size} contenedores padres N/A...`);
  let padresActualizados = 0;

  for (const pCode of padresToCheck) {
    const { data: padre } = await supabase
      .from('inmuebles')
      .select('id, inmueble, contribuyente, meses_deuda, deuda_mmv, cant_inmuebles')
      .eq('inmueble', pCode)
      .maybeSingle();

    if (!padre) continue;

    // Buscar todos los hijos de este padre
    const { data: hijos } = await supabase
      .from('inmuebles')
      .select('id, inmueble, meses_deuda, deuda_mmv, mmv_mes, estado')
      .eq('padre_id', pCode)
      .neq('estado', 'Eliminado');

    if (!hijos || hijos.length === 0) continue;

    const maxMesesHijos = Math.max(0, ...hijos.map((h) => parseInt(h.meses_deuda || 0)));
    const sumaDeudaMmvHijos = Math.round(hijos.reduce((sum, h) => sum + parseFloat(h.deuda_mmv || 0), 0) * 10000) / 10000;

    const padreMesesActual = parseInt(padre.meses_deuda || 0);

    if (padreMesesActual !== maxMesesHijos) {
      console.log(`-> Sincronizando Padre N/A ${padre.inmueble} (${padre.contribuyente}): ${padreMesesActual} meses -> ${maxMesesHijos} meses`);
      const { error: pErr } = await supabase
        .from('inmuebles')
        .update({
          meses_deuda: maxMesesHijos,
          deuda_mmv: sumaDeudaMmvHijos,
          ...(maxMesesHijos === 0 ? { deuda_congelada_bs: 0, multa_bs: 0 } : {})
        })
        .eq('id', padre.id);

      if (pErr) console.error(`Error actualizando padre ${padre.inmueble}:`, pErr.message);
      else padresActualizados++;
    }
  }

  console.log(`Padres N/A actualizados: ${padresActualizados}`);

  // 5. Caso específico FERRE TALIA C.A. (J-401327575)
  console.log('Verificando y asegurando caso FERRE TALIA C.A....');
  await supabase
    .from('inmuebles')
    .update({ meses_deuda: 0, deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0 })
    .in('inmueble', ['URB007364', 'URB033952', 'URB033953', 'URB033069']);

  // Actualizar facturas pendientes asociadas a Pagado
  const { data: ftFacs } = await supabase
    .from('facturas')
    .update({ estado: 'Pagado', fecha_pago: '2026-10-14' })
    .in('referencia', ['WEB-013965', 'WEB-013966'])
    .select();
  console.log('Facturas de FERRE TALIA marcadas como Pagadas:', ftFacs?.length);

  // 6. Marcar cualquier factura en facturas cuya referencia esté en allPaidReceiptRefs
  const paidRefsArray = Array.from(allPaidReceiptRefs);
  for (let i = 0; i < paidRefsArray.length; i += 100) {
    const chunk = paidRefsArray.slice(i, i + 100);
    await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', chunk);
  }

  console.log('=== REMEDIACIÓN COMPLETADA EXITOSAMENTE ===');
}

main().catch(console.error);
