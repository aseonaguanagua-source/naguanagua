/**
 * Reset deuda_congelada_bs a 0 en Supabase para evitar duplicación de deuda
 * ya que deuda_mmv contiene el valor real dinámico en MMV / UCD.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const s = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- Iniciando reseteo de deuda_congelada_bs a 0 ---');
  const { count } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).gt('deuda_congelada_bs', 0);
  console.log(`Registros restantes con deuda_congelada_bs > 0: ${count}`);

  if (!count || count === 0) {
    console.log('✅ No hay registros que actualizar.');
    return;
  }

  let totalUpdated = 0;
  const BATCH_SIZE = 100;
  const CONCURRENCY = 10;

  while (true) {
    // Traer N * BATCH_SIZE registros
    const { data: rows, error: fError } = await s
      .from('inmuebles')
      .select('id')
      .gt('deuda_congelada_bs', 0)
      .limit(BATCH_SIZE * CONCURRENCY);

    if (fError) {
      console.error('Error al consultar:', fError);
      break;
    }
    if (!rows || rows.length === 0) break;

    // Dividir en grupos de BATCH_SIZE
    const chunks = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      chunks.push(rows.slice(i, i + BATCH_SIZE).map(r => r.id));
    }

    // Ejecutar en paralelo
    const results = await Promise.all(
      chunks.map(chunkIds =>
        s.from('inmuebles').update({ deuda_congelada_bs: 0 }).in('id', chunkIds)
      )
    );

    let hasError = false;
    for (const res of results) {
      if (res.error) {
        console.error('Error en lote:', res.error);
        hasError = true;
      }
    }
    if (hasError) break;

    totalUpdated += rows.length;
    console.log(`Progreso: ${totalUpdated} / ${count} (${Math.round((totalUpdated / count) * 100)}%)`);

    if (rows.length < BATCH_SIZE * CONCURRENCY) break;
  }

  // Verificación final
  const { count: finalCount } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).gt('deuda_congelada_bs', 0);
  console.log(`\n✅ Reseteo completado. Restantes con deuda_congelada_bs > 0: ${finalCount}`);
}

run();
