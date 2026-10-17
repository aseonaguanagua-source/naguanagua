const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('================================================================');
  console.log('🌱 AJUSTE DE TARIFA CERO (0) PARA TERRENOS Y SERVICIOS EXTRAORDINARIOS');
  console.log('================================================================');

  let allInms = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('inmuebles')
      .select('id, inmueble, actividad_principal, mmv_mes, deuda_mmv, meses_deuda, deuda_congelada_bs, multa_bs, estado')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allInms.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const toFix = [];
  for (const i of allInms) {
    const act = (i.actividad_principal || '').toUpperCase();
    const isTarget = act.includes('TERRENO') || act.includes('EXTRAORDINARIO');
    if (!isTarget) continue;

    const mmv = parseFloat(String(i.mmv_mes || 0)) || 0;
    const deuda = parseFloat(String(i.deuda_mmv || 0)) || 0;
    const meses = parseInt(String(i.meses_deuda || 0)) || 0;
    const multa = parseFloat(String(i.multa_bs || 0)) || 0;
    const cong = parseFloat(String(i.deuda_congelada_bs || 0)) || 0;

    if (mmv > 0 || deuda > 0 || meses > 0 || multa > 0 || cong > 0) {
      toFix.push({
        id: i.id,
        inmueble: i.inmueble,
        actividad: i.actividad_principal,
        mmv_mes_antes: mmv,
        deuda_mmv_antes: deuda,
        meses_deuda_antes: meses,
        multa_bs_antes: multa,
        deuda_congelada_bs_antes: cong
      });
    }
  }

  console.log(`📋 Total registros a ajustar a tarifa 0: ${toFix.length}`);

  // Backup
  const backupPath = path.join(__dirname, `backup_terrenos_extraordinarios_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(toFix, null, 2));
  console.log(`💾 Respaldo guardado en: ${backupPath}`);

  // Aplicar actualización en lotes
  const BATCH_SIZE = 100;
  let updated = 0;
  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async item => {
        const { error } = await supabase.from('inmuebles').update({
          mmv_mes: 0,
          deuda_mmv: 0,
          meses_deuda: 0,
          multa_bs: 0,
          deuda_congelada_bs: 0
        }).eq('id', item.id);
        if (!error) updated++;
        else console.error(`Error actualizando ${item.inmueble}:`, error.message);
      })
    );
  }

  console.log('================================================================');
  console.log(`✅ Ajuste completado: ${updated} registros actualizados con tarifa 0.`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
