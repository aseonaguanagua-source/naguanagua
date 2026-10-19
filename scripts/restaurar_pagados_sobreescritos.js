const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function cleanRif(r) {
  if (!r) return '';
  return r.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function restorePaidTaxpayers() {
  console.log('====================================================');
  console.log('RESTAURACIÓN DE CONTRIBUYENTES PAGADOS SOBREESCRITOS');
  console.log('====================================================');

  const backupFile = path.join(__dirname, 'backup_meses_deuda_antes_de_sync_1792263060282.json');
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const backupMap = new Map();
  backup.forEach(b => backupMap.set(b.inmueble, b));
  console.log(`Backup cargado con ${backup.length} registros.`);

  // 1. Descargar TODOS los pagos aprobados con paginación completa
  let allPagos = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('pagos_reportados')
      .select('identidad, detalles, estado')
      .eq('estado', 'Aprobado')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allPagos.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Total pagos aprobados en el sistema: ${allPagos.length}`);

  const paidCleanRifs = new Set();
  const paidInmCodes = new Set();
  allPagos.forEach(p => {
    const c = cleanRif(p.identidad);
    if (c) paidCleanRifs.add(c);
    const det = JSON.stringify(p.detalles || '');
    const matches = det.match(/(URB|AURI)\d+/gi) || [];
    matches.forEach(m => paidInmCodes.add(m.toUpperCase()));
  });

  // 2. Encontrar todos los inmuebles del backup que pertenecen a contribuyentes pagados
  const backupCodes = backup.map(b => b.inmueble);
  let toRestore = [];
  const chunkSize = 500;
  for (let i = 0; i < backupCodes.length; i += chunkSize) {
    const chunk = backupCodes.slice(i, i + chunkSize);
    const { data: inms, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, meses_deuda, deuda_mmv')
      .in('inmueble', chunk);

    if (error) {
      console.error('Error fetching chunk:', error);
      continue;
    }

    (inms || []).forEach(inm => {
      const c = cleanRif(inm.identidad);
      if (paidCleanRifs.has(c) || paidInmCodes.has(inm.inmueble)) {
        const b = backupMap.get(inm.inmueble);
        if (b && b.meses_deuda === 0 && inm.meses_deuda > 0) {
          toRestore.push({
            id: inm.id,
            inmueble: inm.inmueble,
            identidad: inm.identidad,
            contribuyente: inm.contribuyente,
            meses_deuda: 0,
            deuda_mmv: 0
          });
        }
      }
    });
  }

  console.log(`\nInmuebles a restaurar a 0 meses de deuda: ${toRestore.length}`);

  // 3. Ejecutar la restauración en lotes
  const BATCH_SIZE = 100;
  for (let i = 0; i < toRestore.length; i += BATCH_SIZE) {
    const batch = toRestore.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(item =>
        supabase
          .from('inmuebles')
          .update({
            meses_deuda: item.meses_deuda,
            deuda_mmv: item.deuda_mmv
          })
          .eq('id', item.id)
      )
    );
    console.log(`Restaurados ${Math.min(i + BATCH_SIZE, toRestore.length)} / ${toRestore.length}`);
  }

  // 4. Tratamiento específico para CENTRO TERMAL LAS TRINCHERAS C A
  console.log('\n--- Tratamiento específico para CENTRO TERMAL LAS TRINCHERAS C A ---');
  const termalRif = 'J-075232879';
  const { data: termalInms } = await supabase
    .from('inmuebles')
    .select('id, inmueble, identidad, notas, estado')
    .or(`identidad.eq.${termalRif},padre_id.eq.URB033271,inmueble.eq.URB033271`);

  for (const t of (termalInms || [])) {
    const noteAppend = `\n[17/10/2026] RECONCILIACIÓN PAGO: Confirmado pago del periodo correspondiente Ref 40001238 (Bs. 1.249.965,90) + Retención IVA (Bs. 124.724,55). Inmueble 100% solvente (0 meses de deuda). Saldo a favor disponible: Bs. 169.019,86.`;
    const newNotes = t.notas ? `${t.notas}${noteAppend}` : noteAppend.trim();

    await supabase
      .from('inmuebles')
      .update({
        meses_deuda: 0,
        deuda_mmv: 0,
        multa_bs: 0,
        notas: newNotes
      })
      .eq('id', t.id);

    console.log(`✅ Centro Termal: ${t.inmueble} puesto en meses_deuda: 0, deuda_mmv: 0, multa_bs: 0`);
  }

  console.log('\n🎉 ¡Restauración completada con éxito!');
}

restorePaidTaxpayers().catch(console.error);
