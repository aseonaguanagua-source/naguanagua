const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix 1: Replace the insert + deuda cleanup + TFHKA block
const oldBlock = `const { data: pagoInsertado } = await supabase.from('pagos_reportados').insert({
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: paymentMethod,
          referencia: reqRef ? referencia : referenciaDebito,
          tipo: paymentMethod,
          estado: 'Aprobado',
          detalles: JSON.stringify({
            recibos: selectedRecibos,
            cuotas: selectedCuotas,
            servicios: selectedServicios,
            tala_poda: selectedTalaPoda,
            cajero: cajero_id,
            es_abono: esAbonoDebito,
            monto_abonado: esAbonoDebito ? montoReal : undefined,
            tasa_bcv: currentBcvRate,
            deuda_total_sistema: foundUser.DeudaTotal,
            fecha_transaccion: fechaTransaccion,`;

const newBlock = `const pagoId = crypto.randomUUID();
        const { error: insertErr } = await supabase.from('pagos_reportados').insert({
          id: pagoId,
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: paymentMethod,
          referencia: reqRef ? referencia : referenciaDebito,
          tipo: paymentMethod,
          estado: 'Aprobado',
          detalles: JSON.stringify({
            recibos: selectedRecibos,
            cuotas: selectedCuotas,
            servicios: selectedServicios,
            tala_poda: selectedTalaPoda,
            cajero: cajero_id,
            es_abono: esAbonoDebito,
            monto_abonado: esAbonoDebito ? montoReal : undefined,
            tasa_bcv: currentBcvRate,
            deuda_total_sistema: foundUser.DeudaTotal,
            fecha_transaccion: fechaTransaccion,`;

content = content.replace(oldBlock, newBlock);

// Fix 2: Replace .select('id').single() with error handling
content = content.replace(
  /\}\)\.select\('id'\)\.single\(\);/,
  `});
        if (insertErr) {
          console.error('Error insertando pago:', insertErr);
          throw new Error('No se pudo registrar el pago: ' + insertErr.message);
        }`
);

// Fix 3: Replace weak deuda cleanup with robust version
content = content.replace(
  /\/\/ ── LIMPIAR DEUDA MMV SI SE PAGÓ EL DUMMY DEBT ──\s*if \(selectedRecibos\.includes\('RECIB-DEUDA'\) && !esAbonoDebito\) \{\s*await supabase\.from\('inmuebles'\)\.update\(\{ deuda_mmv: 0 \}\)\.eq\('identidad', foundUser\.Identidad\);\s*\}/,
  `// ── LIMPIAR DEUDA MMV SI SE PAGÓ EL DUMMY DEBT ──
        if (selectedRecibos.includes('RECIB-DEUDA') && !esAbonoDebito) {
          const userInmsClean = inmuebles.filter((i: any) =>
            (i.identidad || '').replace(/-/g,'').toUpperCase() === 
            (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
          );
          for (const inm of userInmsClean) {
            await supabase.from('inmuebles').update({ deuda_mmv: 0 }).eq('id', inm.id);
          }
        }`
);

// Fix 4: Replace pagoInsertado?.id with pagoId in TFHKA block
content = content.replace(
  /if \(pagoInsertado\?\.id\) \{/,
  'if (pagoId) {'
);
content = content.replace(
  /pagoId: pagoInsertado\.id,/,
  'pagoId: pagoId,'
);

fs.writeFileSync(path, content, 'utf8');
console.log("✅ Fase 1+2 applied to caja/page.tsx");
