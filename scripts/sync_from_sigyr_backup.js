/**
 * Sincronización Maestra desde backup_sigyr oficial (RDS Snapshot Octubre 2026) hacia Supabase
 * - Corrige condominios, hijos y nietos (100% jerarquía limpia)
 * - Corrige cálculos de deudas, meses adeudados, multas y saldos a favor
 * - Limpia nombres de actividad_principal (eliminando etiquetas heurísticas viejas [HIJO_DE:...])
 * - Deduplica códigos de inmuebles repetidos en origen (conservando el más reciente)
 * - Preserva campos manuales existentes (notas, UUIDs id) y garantiza integridad referencial
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Cargar variables de entorno
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan credenciales de Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

const JSON_PATH = '/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/master_inmuebles_clean.json';

const BATCH_SIZE = 500;
const STEP_FETCH = 1000;

async function run() {
  console.log('========================================================');
  console.log('🔄 INICIANDO SINCRONIZACIÓN MAESTRA DESDE SIGYR (OCT 2026)');
  console.log('========================================================\n');

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`❌ No se encontró el archivo maestro: ${JSON_PATH}`);
    process.exit(1);
  }

  console.log('1. Cargando y deduplicando archivo maestro JSON generado por DuckDB...');
  const rawData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  
  // Deduplicar por 'inmueble' para evitar colisiones dentro de los batches
  const uniqueMap = new Map();
  for (const item of rawData) {
    uniqueMap.set(item.inmueble, item);
  }
  const masterData = Array.from(uniqueMap.values());
  console.log(`   -> ${rawData.length.toLocaleString()} registros brutos -> ${masterData.length.toLocaleString()} inmuebles únicos.\n`);

  console.log('2. Descargando datos existentes de Supabase para preservar notas e IDs...');
  const existingMap = new Map();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, notas, mmv_mes')
      .range(from, from + STEP_FETCH - 1);

    if (error) {
      console.error('Error al consultar inmuebles en Supabase:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.inmueble) {
        existingMap.set(row.inmueble, row);
      }
    }
    from += STEP_FETCH;
    process.stdout.write(`\r   Descargados ${existingMap.size.toLocaleString()} registros de Supabase...`);
  }
  console.log(`\n   -> Total en Supabase: ${existingMap.size.toLocaleString()} registros indexados.\n`);

  console.log('3. Preparando payloads de actualización combinados...');
  const toUpsert = [];
  let condoCount = 0;
  let hijosCount = 0;
  let conDeudaCount = 0;
  let saldoFavorCount = 0;

  for (const item of masterData) {
    const existing = existingMap.get(item.inmueble);

    if (item.es_condominio) condoCount++;
    if (item.condominio_padre_id) hijosCount++;
    if (item.deuda_congelada_bs > 0 || item.meses_deuda > 0) conDeudaCount++;
    if (item.saldo_favor_bs > 0) saldoFavorCount++;

    const payload = {
      inmueble: item.inmueble,
      identidad: existing ? existing.identidad : item.identidad,
      id: existing ? existing.id : crypto.randomUUID(),
      contribuyente: item.contribuyente,
      tipo: item.tipo,
      clasificacion: item.clasificacion,
      actividad_principal: item.actividad_principal || 'N/A',
      direccion: item.direccion || '',
      cant_inmuebles: item.cant_inmuebles,
      es_condominio: item.es_condominio,
      condominio_padre_id: item.condominio_padre_id,
      meses_deuda: item.meses_deuda,
      deuda_mmv: item.deuda_mmv,
      deuda_congelada_bs: item.deuda_congelada_bs,
      multa_bs: item.multa_bs,
      saldo_favor_bs: item.saldo_favor_bs,
      correo_electronico: item.correo_electronico || '',
      telefono: item.telefono || '',
      estado: 'Activo'
    };

    if (existing && existing.notas) {
      payload.notas = existing.notas;
    }

    if (existing && existing.mmv_mes && existing.mmv_mes > 0) {
      payload.mmv_mes = existing.mmv_mes;
    } else {
      payload.mmv_mes = item.tipo === 'RESIDENCIAL' ? 0.021588 : (item.deuda_mmv > 0 && item.meses_deuda > 0 ? Number((item.deuda_mmv / item.meses_deuda).toFixed(4)) : 0.021588);
    }

    toUpsert.push(payload);
  }

  console.log(`   -> ${toUpsert.length.toLocaleString()} inmuebles listos para sincronizar.`);
  console.log(`      * Condominios / Complejos: ${condoCount.toLocaleString()}`);
  console.log(`      * Inmuebles Hijos / Subordinados: ${hijosCount.toLocaleString()}`);
  console.log(`      * Con deuda real: ${conDeudaCount.toLocaleString()}`);
  console.log(`      * Con saldo a favor activo: ${saldoFavorCount.toLocaleString()}\n`);

  console.log('4. Aplicando actualizaciones en lotes (batch upsert de 500)...');
  const startTime = Date.now();
  const totalBatches = Math.ceil(toUpsert.length / BATCH_SIZE);
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const chunk = toUpsert.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const { error } = await supabase
        .from('inmuebles')
        .upsert(chunk, { onConflict: 'inmueble' });

      if (error) {
        console.error(`\n❌ Error en lote ${batchNum}:`, error.message);
        errors++;
      } else {
        processed += chunk.length;
      }
    } catch (e) {
      console.error(`\n❌ Excepción en lote ${batchNum}:`, e.message);
      errors++;
    }

    const percent = ((processed / toUpsert.length) * 100).toFixed(1);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r   [Lote ${batchNum}/${totalBatches}] Sincronizados: ${processed.toLocaleString()}/${toUpsert.length.toLocaleString()} (${percent}%) - ${elapsedSec}s`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n========================================================`);
  console.log('✅ SINCRONIZACIÓN FINALIZADA');
  console.log('========================================================');
  console.log(`- Registros procesados con éxito: ${processed.toLocaleString()}`);
  console.log(`- Lotes con error: ${errors}`);
  console.log(`- Tiempo total de ejecución: ${totalTime} segundos`);
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('Error fatal durante la sincronización:', err);
  process.exit(1);
});
