/**
 * SANEAMIENTO: Corregir cant_inmuebles y deuda_mmv en inmuebles no-condominios.
 *
 * Diagnóstico:
 * 1. 61 inmuebles activos no-condominios tenían cant_inmuebles > 1 erróneamente.
 * 2. En URB008118 (REPUESTOS Y ACCESORIOS CELIS GOMEZ C.A.), cant_inmuebles era 2 y deuda_mmv
 *    tenía 6.12 en lugar de 0.83844 UCD (deuda SIGYR). Esto duplicaba la tarifa en Caja y Detalles.
 * 3. En otros 26 inmuebles, deuda_mmv fue multiplicada por cant_inmuebles durante migración.
 *
 * Acciones:
 * 1. Crea backup completo en scripts/saneamiento/backup_61_non_condos.json
 * 2. Actualiza cant_inmuebles = 1 para todos los inmuebles no-condominio.
 * 3. Corrige deuda_mmv al valor real de SIGYR UCD.
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
  console.log('🚀 Iniciando saneamiento de cant_inmuebles y deuda_mmv...');

  // 1. Cargar el plan calculado contra SIGYR
  const planPath = '/tmp/saneamiento_61_plan.json';
  if (!fs.existsSync(planPath)) {
    throw new Error('No se encontró el archivo de plan ' + planPath);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  // 2. Extraer códigos
  const codes = plan.map(p => p.inmueble);

  // 3. Obtener estado actual de Supabase para Backup
  const { data: currentRows, error: fetchErr } = await sb
    .from('inmuebles')
    .select('*')
    .in('inmueble', codes);

  if (fetchErr) {
    throw new Error('Error al consultar inmuebles actuales: ' + fetchErr.message);
  }

  const backupDir = path.join(__dirname);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `backup_61_non_condos_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(currentRows, null, 2));
  console.log(`✅ Backup guardado en: ${backupFile} (${currentRows.length} registros)`);

  // 4. Ejecutar actualizaciones
  let updatedCount = 0;
  for (const p of plan) {
    const c = p.inmueble;
    const supaOld = p.supa_deuda_mmv_old;
    const sigUcd = p.sig_ucd;

    let newDeuda = supaOld;
    if (supaOld === 0) {
      newDeuda = 0.0;
    } else if (Math.abs(supaOld - sigUcd) < 0.001) {
      newDeuda = supaOld;
    } else {
      newDeuda = sigUcd;
    }

    const { error: updErr } = await sb
      .from('inmuebles')
      .update({
        cant_inmuebles: 1,
        deuda_mmv: newDeuda
      })
      .eq('inmueble', c);

    if (updErr) {
      console.error(`❌ Error actualizando ${c}:`, updErr.message);
    } else {
      updatedCount++;
      if (c === 'URB008118' || Math.abs(supaOld - newDeuda) > 0.0001) {
        console.log(`  [UPDATED] ${c}: cant_inmuebles 1, deuda_mmv ${supaOld} -> ${newDeuda}`);
      }
    }
  }

  console.log(`\n🎉 Saneamiento completado: ${updatedCount}/${plan.length} inmuebles actualizados con éxito.`);

  // 5. Verificar URB008118
  const { data: verifyRow } = await sb
    .from('inmuebles')
    .select('inmueble, cant_inmuebles, mmv_mes, deuda_mmv, meses_deuda, contribuyente')
    .eq('inmueble', 'URB008118')
    .single();

  console.log('\n🔍 Verificación post-update URB008118:', verifyRow);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
