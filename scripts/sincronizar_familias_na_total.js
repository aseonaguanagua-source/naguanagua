const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes('--apply');

async function all(table, select) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function main() {
  console.log(`=== SINCRONIZACIÓN TOTAL DE FAMILIAS N/A CON SUS ACTIVIDADES === [MODO: ${APPLY ? 'APLICAR' : 'SIMULACIÓN'}]`);
  
  // 1. Caso Banesco específico: Vincular actividades WTC (12-A a 12-D) a URB033683
  console.log('1. Verificando caso Banesco (URB033683 y URB033684)...');
  const banescoOffices = ['URB018533', 'URB018534', 'URB018535', 'URB018536'];
  
  if (APPLY) {
    // Actualizar padre_id de las 4 oficinas a URB033683
    const { error: errHijos } = await sb
      .from('inmuebles')
      .update({ padre_id: 'URB033683' })
      .in('inmueble', banescoOffices);
    if (errHijos) console.error('Error actualizando oficinas Banesco:', errHijos);
    else console.log('✓ Oficinas de Banesco vinculadas a URB033683 con éxito.');

    // Desactivar URB033684 para que URB033683 sea el N/A único
    await sb.from('inmuebles').update({ estado: 'Inactivo', padre_id: 'URB033683' }).eq('inmueble', 'URB033684');
  }

  // 2. Cargar todos los inmuebles
  console.log('2. Cargando padrón total de inmuebles...');
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,actividad_principal,padre_id,cant_inmuebles,mmv_mes,meses_deuda,deuda_mmv,deuda_congelada_bs,multa_bs,direccion');
  console.log(`Total inmuebles en base de datos: ${inms.length}`);

  const byCode = new Map();
  inms.forEach(i => byCode.set(i.inmueble, i));

  // Mapa de hijos por padre_id
  const childrenMap = new Map();
  inms.forEach(i => {
    // Si estamos en simulación y es una oficina de Banesco, asignar a URB033683
    const pId = (!APPLY && banescoOffices.includes(i.inmueble)) ? 'URB033683' : i.padre_id;
    if (pId && i.estado !== 'Eliminado') {
      const list = childrenMap.get(pId) || [];
      list.push(i);
      childrenMap.set(pId, list);
    }
  });

  const updates = [];
  const backup = [];

  for (const [padreCod, children] of childrenMap.entries()) {
    const padre = byCode.get(padreCod);
    if (!padre) continue;

    const act = (padre.actividad_principal || '').trim().toUpperCase();
    const isNA = act === 'N/A' || act.startsWith('PADRE') || padre.cant_inmuebles > 0;
    if (!isNA && children.length <= 1) continue;

    // Sumatoria de mmv_mes de las actividades hijas
    const sumMMV = Math.round(children.reduce((acc, c) => acc + (parseFloat(c.mmv_mes) || 0), 0) * 100) / 100;
    
    // Meses de deuda: Máximo de las actividades hijas
    const maxMeses = children.reduce((acc, c) => {
      const m = parseInt(c.meses_deuda || 0);
      const d = parseFloat(c.deuda_mmv || 0);
      return Math.max(acc, m > 0 ? m : (d > 0 ? 1 : 0));
    }, 0);

    // Sumatoria de deuda_mmv
    const sumDeudaMMV = Math.round(children.reduce((acc, c) => acc + (parseFloat(c.deuda_mmv) || 0), 0) * 10000) / 10000;
    // Sumatoria de deuda_congelada_bs
    const sumCongelada = Math.round(children.reduce((acc, c) => acc + (parseFloat(c.deuda_congelada_bs) || 0), 0) * 100) / 100;
    // Sumatoria de multa_bs
    const sumMulta = Math.round(children.reduce((acc, c) => acc + (parseFloat(c.multa_bs) || 0), 0) * 100) / 100;

    const currentMMV = parseFloat(padre.mmv_mes || 0);
    const currentMeses = parseInt(padre.meses_deuda || 0);
    const currentDeudaMMV = parseFloat(padre.deuda_mmv || 0);

    const diff = Math.abs(currentMMV - sumMMV) > 0.05 ||
                 currentMeses !== maxMeses ||
                 Math.abs(currentDeudaMMV - sumDeudaMMV) > 0.01 ||
                 padre.estado !== 'Activo' ||
                 (padre.cant_inmuebles || 0) !== children.length;

    if (diff) {
      backup.push(padre);
      updates.push({
        id: padre.id,
        inmueble: padre.inmueble,
        contribuyente: padre.contribuyente,
        actividad: padre.actividad_principal,
        hijosCount: children.length,
        datosActualizar: {
          mmv_mes: sumMMV,
          meses_deuda: maxMeses,
          deuda_mmv: sumDeudaMMV,
          deuda_congelada_bs: sumCongelada,
          multa_bs: sumMulta,
          cant_inmuebles: children.length,
          estado: 'Activo'
        }
      });
    }
  }

  console.log(`\n3. Total de contenedores N/A que requieren sincronización: ${updates.length}`);
  
  if (updates.length > 0) {
    console.log('Muestra de actualizaciones:');
    updates.slice(0, 5).forEach(u => {
      console.log(`- ${u.inmueble} (${u.contribuyente}): ${u.hijosCount} actividades | MMV: ${u.datosActualizar.mmv_mes} | Meses: ${u.datosActualizar.meses_deuda} | Deuda MMV: ${u.datosActualizar.deuda_mmv}`);
    });
  }

  if (!APPLY) {
    console.log('\n[!] Modo SIMULACIÓN finalizado. Para aplicar en producción ejecuta con --apply');
    return;
  }

  // Guardar respaldo JSON
  const stamp = Date.now();
  const backupFile = path.join(__dirname, `backup_sincronizacion_na_${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\n✓ Respaldo creado en: ${backupFile}`);

  console.log('\n4. Aplicando actualizaciones en Supabase en lotes...');
  let ok = 0, err = 0;
  for (let i = 0; i < updates.length; i += 20) {
    const chunk = updates.slice(i, i + 20);
    await Promise.all(chunk.map(async u => {
      const { error } = await sb
        .from('inmuebles')
        .update(u.datosActualizar)
        .eq('id', u.id);
      if (error) {
        err++;
        console.error(`Error actualizando ${u.inmueble}:`, error.message);
      } else {
        ok++;
      }
    }));
    process.stdout.write(`\rProcesados: ${Math.min(i + 20, updates.length)} / ${updates.length}...`);
  }
  console.log(`\n\n✓ Sincronización completada: ${ok} actualizados, ${err} errores.`);
}

main().catch(console.error);
