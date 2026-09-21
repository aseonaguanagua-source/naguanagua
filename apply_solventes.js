const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  // ── Leer Excel ──────────────────────────────────────────────────────────────
  const wb = xlsx.readFile('Reporte  inmuebles inscritos.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json(ws, { defval: '' });
  const data = raw.slice(2).filter(r => r['__EMPTY_1']);

  function parseMonth(s) {
    if (!s) return 0;
    const parts = String(s).trim().replace(/\s/g, '').split('-');
    if (parts.length !== 2) return 0;
    return parseInt(parts[1]) * 100 + parseInt(parts[0]);
  }

  const CURRENT = 2026 * 100 + 9; // Septiembre 2026

  // Solo los que son solventes al mes actual (>=09-2026)
  const solventes = data.filter(r => parseMonth(r['__EMPTY_15']) >= CURRENT);
  console.log('Solventes a procesar:', solventes.length);

  let updatedFacts = 0, updatedInms = 0, skipped = 0, errors = 0;

  for (const row of solventes) {
    const identidad = String(row['__EMPTY_1'] || '').trim();
    const contribuyente = String(row['__EMPTY_2'] || '').trim();
    const mesSolvente = String(row['__EMPTY_15'] || '').trim();

    if (!identidad) { skipped++; continue; }

    try {
      // 1. Marcar TODAS sus facturas de Septiembre como Pagado
      const { data: facts, error: fetchErr } = await sb.from('facturas')
        .select('id, referencia, estado, monto')
        .eq('identidad', identidad)
        .like('emision', '2026-09-%')
        .in('estado', ['Pendiente', 'Por Verificar', 'Abonado']);

      if (fetchErr) { console.log('❌ Error fetch facts', identidad, fetchErr.message); errors++; continue; }

      if (facts && facts.length > 0) {
        const { error: updErr } = await sb.from('facturas')
          .update({ estado: 'Pagado' })
          .eq('identidad', identidad)
          .like('emision', '2026-09-%')
          .in('estado', ['Pendiente', 'Por Verificar', 'Abonado']);

        if (updErr) { console.log('❌ Error update facts', identidad, updErr.message); errors++; }
        else {
          updatedFacts += facts.length;
          console.log('✅ Facts pagadas:', identidad, '|', contribuyente.substring(0,30), '| Facturas:', facts.length, '| Solvente:', mesSolvente);
        }
      }

      // 2. Resetear deuda_mmv a 0 en los inmuebles de este contribuyente
      const { error: inmErr } = await sb.from('inmuebles')
        .update({ deuda_mmv: 0 })
        .eq('identidad', identidad)
        .gt('deuda_mmv', 0);

      if (!inmErr) updatedInms++;
      else console.log('⚠ Error reset deuda_mmv', identidad, inmErr.message);

    } catch (e) {
      console.log('❌ Excepcion', identidad, e.message);
      errors++;
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('✅ RESUMEN APLICACION DE SOLVENTES:');
  console.log('  Solventes del Excel:   ', solventes.length);
  console.log('  Facturas marcadas Pagado:', updatedFacts);
  console.log('  Inmuebles deuda resetada:', updatedInms);
  console.log('  Omitidos (sin ID):     ', skipped);
  console.log('  Errores:               ', errors);
  console.log('══════════════════════════════════════════════');
}

main().catch(console.error);
