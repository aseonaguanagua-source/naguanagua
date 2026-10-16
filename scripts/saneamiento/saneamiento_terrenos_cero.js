/**
 * SANEAMIENTO: Terrenos con tarifa CERO (0).
 *
 * Diagnóstico:
 * 1. La Ordenanza Municipal de Naguanagua (Tabla "B", Actividad 1696: "TERRENOS, CONSTRUCCIONES
 *    E INMUEBLES A ESTRENAR") estipula factores [0, 0, 0].
 *    Los terrenos no generan desechos domiciliarios regulares y su tarifa mensual es estrictamente CERO (0).
 * 2. En la BD Supabase, 1,525 inmuebles con actividad TERRENO tenían mmv_mes guardado como 0.8 o 1.98.
 * 3. En SIGYR, 1,535 de 1,536 propiedades de terreno tenían cached_total_debt_ucd = 0.00000000.
 *    Solo URB031789 tenía deuda histórica previa (13.100679 UCD).
 *    En Supabase, 22 inmuebles tenían deuda_mmv/multa_bs ficticia calculada a partir de los 0.8 / 1.98 MMV.
 * 4. En condominio_unidades, 169 unidades filiales con actividad TERRENO tenían tarifa_mmv > 0.
 *
 * Acciones:
 * 1. Respaldo completo en scripts/saneamiento/backup_terrenos_<timestamp>.json
 * 2. Actualizar mmv_mes = 0 en los 1,525 inmuebles.
 * 3. Limpiar deuda_mmv = 0, meses_deuda = 0, multa_bs = 0 en los inmuebles que no tenían deuda en SIGYR.
 * 4. Actualizar tarifa_mmv = 0 en las 169 unidades de condominio_unidades.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const sb = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function main() {
  console.log('🚀 Iniciando saneamiento de TERRENOS a tarifa CERO (0)...');

  // 1. Obtener todos los inmuebles con TERRENO
  let allInmuebles = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('inmuebles')
      .select('*')
      .ilike('actividad_principal', '%terreno%')
      .range(from, from + 999);
    if (error) throw new Error('Error al consultar inmuebles: ' + error.message);
    allInmuebles.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`📦 Encontrados ${allInmuebles.length} inmuebles con actividad TERRENO.`);

  // 2. Obtener todas las unidades de condominios con TERRENO
  const { data: allUnidades, error: errUnidades } = await sb
    .from('condominio_unidades')
    .select('*')
    .ilike('actividad', '%terreno%');
  if (errUnidades) throw new Error('Error al consultar condominio_unidades: ' + errUnidades.message);
  console.log(`📦 Encontradas ${allUnidades.length} unidades de condominios con actividad TERRENO.`);

  // 3. Crear Respaldo Completo
  const backup = {
    timestamp: new Date().toISOString(),
    total_inmuebles: allInmuebles.length,
    total_unidades: allUnidades.length,
    inmuebles: allInmuebles,
    condominio_unidades: allUnidades
  };
  const backupPath = path.join(__dirname, `backup_terrenos_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`💾 Respaldo guardado exitosamente en: ${backupPath}`);

  // 4. Actualizar Inmuebles
  console.log('🔄 Actualizando inmuebles a tarifa CERO (0)...');
  let updatedInmCount = 0;
  const batchSize = 100;

  for (let i = 0; i < allInmuebles.length; i += batchSize) {
    const batch = allInmuebles.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (inm) => {
      const isUrb031789 = inm.inmueble === 'URB031789';
      const updateData = {
        mmv_mes: 0
      };

      // Si no es URB031789 (el único que tenía deuda real en SIGYR), limpiamos la deuda falsa generada por mmv erróneo
      if (!isUrb031789) {
        if (Number(inm.deuda_mmv) > 0 || Number(inm.meses_deuda) > 0 || Number(inm.multa_bs) > 0) {
          updateData.deuda_mmv = 0;
          updateData.meses_deuda = 0;
          updateData.multa_bs = 0;
        }
      }

      const { error: updErr } = await sb
        .from('inmuebles')
        .update(updateData)
        .eq('id', inm.id);

      if (updErr) {
        console.error(`Error actualizando inmueble ${inm.inmueble}:`, updErr.message);
      } else {
        updatedInmCount++;
      }
    }));
    process.stdout.write(`  Procesados ${Math.min(i + batchSize, allInmuebles.length)} / ${allInmuebles.length} inmuebles...\r`);
  }
  console.log(`\n✅ Inmuebles actualizados: ${updatedInmCount} / ${allInmuebles.length}`);

  // 5. Actualizar Unidades de Condominios
  console.log('🔄 Actualizando unidades de condominios a tarifa CERO (0)...');
  let updatedUniCount = 0;
  for (const u of allUnidades) {
    const { error: updErr } = await sb
      .from('condominio_unidades')
      .update({ tarifa_mmv: 0 })
      .eq('id', u.id);

    if (updErr) {
      console.error(`Error actualizando unidad ${u.id}:`, updErr.message);
    } else {
      updatedUniCount++;
    }
  }
  console.log(`✅ Unidades de condominio actualizadas: ${updatedUniCount} / ${allUnidades.length}`);

  // 6. Verificación posterior
  console.log('🔍 Ejecutando verificación post-saneamiento...');
  const { count: nonZeroInm } = await sb
    .from('inmuebles')
    .select('*', { count: 'exact', head: true })
    .ilike('actividad_principal', '%terreno%')
    .gt('mmv_mes', 0);

  const { count: nonZeroUni } = await sb
    .from('condominio_unidades')
    .select('*', { count: 'exact', head: true })
    .ilike('actividad', '%terreno%')
    .gt('tarifa_mmv', 0);

  console.log(`✨ Inmuebles con mmv_mes > 0 restantes: ${nonZeroInm}`);
  console.log(`✨ Unidades con tarifa_mmv > 0 restantes: ${nonZeroUni}`);

  console.log('🎉 Saneamiento de TERRENOS completado con éxito.');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
