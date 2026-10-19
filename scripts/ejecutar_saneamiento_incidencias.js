const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function ejecutarSaneamiento() {
  console.log('=== INICIANDO SANEAMIENTO DE INCIDENCIAS COMERCIALES ===\n');

  // 1. Cargar todos los inmuebles
  let allInms = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Error cargando inmuebles:', error);
      return;
    }
    if (!data || data.length === 0) break;
    allInms = allInms.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log('Total inmuebles cargados en memoria:', allInms.length);

  const inmsByCode = new Map();
  allInms.forEach(i => inmsByCode.set(i.inmueble, i));

  const backupData = {
    timestamp: new Date().toISOString(),
    inmuebles_modificados: []
  };

  function registrarBackup(inmOriginal, motivo) {
    backupData.inmuebles_modificados.push({
      motivo,
      datos_anteriores: { ...inmOriginal }
    });
  }

  // -------------------------------------------------------------------------
  // FASE 1: SANEAMIENTO DE RIFs EN HIJOS COMERCIALES
  // (Hijos activos bajo padre comercial N/A con RIFs provisionales, dummy o desalineados)
  // -------------------------------------------------------------------------
  console.log('\n--- FASE 1: Alineando RIFs de actividades hijas comerciales ---');
  let rifsAlineados = 0;

  for (const hijo of allInms) {
    // REGLA DE SEGURIDAD: Solo inmuebles ACTIFS (nunca Eliminados ni Inactivos)
    const estadoHijo = (hijo.estado || 'Activo').trim().toLowerCase();
    if (estadoHijo === 'eliminado' || estadoHijo === 'inactivo' || estadoHijo === 'desactivado') {
      continue;
    }

    if (!hijo.padre_id || !inmsByCode.has(hijo.padre_id)) continue;
    const padre = inmsByCode.get(hijo.padre_id);

    // REGLA DE SEGURIDAD: Excluir condominios residenciales
    if (padre.es_condominio || hijo.es_condominio || padre.condominio_padre_id || hijo.condominio_padre_id) {
      continue;
    }

    const actPadre = (padre.actividad_principal || '').trim().toUpperCase();
    const esPadreComercial = actPadre === 'N/A' || actPadre.includes('LOCAL') || parseInt(padre.cant_inmuebles || '0') > 1;
    if (!esPadreComercial) continue;

    const rHijo = (hijo.identidad || '').trim().toUpperCase();
    const rPadre = (padre.identidad || '').trim().toUpperCase();

    // Si el padre no tiene RIF válido (ej. J-0 o vacío), omitir
    if (!rPadre || rPadre === 'J-0' || rPadre === 'V-0') continue;

    const esDummy = rHijo.includes('PROV') || rHijo.includes('00000') || rHijo === 'V-0' || rHijo === 'V-00' || rHijo.includes('J-0000') || rHijo.includes('75252705');
    
    // O si el nombre del contribuyente es prácticamente idéntico al padre
    const nPadre = (padre.contribuyente || '').toUpperCase().trim();
    const nHijo = (hijo.contribuyente || '').toUpperCase().trim();
    const mismoNombre = nPadre === nHijo && nPadre.length > 3;

    // O si el RIF del hijo tiene error evidente de tipeo
    const pClean = rPadre.replace(/^[VEJPG]-?/i, '');
    const hClean = rHijo.replace(/^[VEJPG]-?/i, '');
    let diffChars = 0;
    if (pClean.length === hClean.length) {
      for (let i = 0; i < pClean.length; i++) {
        if (pClean[i] !== hClean[i]) diffChars++;
      }
    }
    const esErrorTipeo = diffChars === 1 && pClean.length >= 8;

    if (esDummy || mismoNombre || esErrorTipeo) {
      registrarBackup(hijo, `FASE 1: RIF alineado al del padre ${padre.inmueble} (${rHijo} -> ${rPadre})`);
      
      const { error: updErr } = await supabase
        .from('inmuebles')
        .update({
          identidad: padre.identidad,
          contribuyente: padre.contribuyente
        })
        .eq('id', hijo.id);

      if (updErr) {
        console.error(`Error actualizando hijo ${hijo.inmueble}:`, updErr);
      } else {
        rifsAlineados++;
        console.log(`[RIF ALINEADO] ${hijo.inmueble} (${hijo.actividad_principal}): ${rHijo} -> ${padre.identidad} (${padre.contribuyente})`);
        hijo.identidad = padre.identidad;
        hijo.contribuyente = padre.contribuyente;
      }
    }
  }
  console.log(`Fase 1 completada. RIFs alineados: ${rifsAlineados}`);

  // -------------------------------------------------------------------------
  // FASE 2: SINCRONIZACIÓN DE AGENTE DE RETENCIÓN ENTRE PADRE E HIJOS
  // (Si el padre o la empresa es agente de retención, todos sus locales/hijos deben tener agente_retencion: true)
  // -------------------------------------------------------------------------
  console.log('\n--- FASE 2: Sincronizando condición de Agente de Retención ---');
  let retencionesSincronizadas = 0;

  for (const padre of allInms) {
    if (padre.es_condominio || padre.condominio_padre_id) continue;
    const actPadre = (padre.actividad_principal || '').trim().toUpperCase();
    if (actPadre !== 'N/A' && parseInt(padre.cant_inmuebles || '0') <= 1) continue;

    const hijosActivos = allInms.filter(h => h.padre_id === padre.inmueble && (h.estado || 'Activo').toLowerCase() === 'activo');
    if (hijosActivos.length === 0) continue;

    // Si el padre o algún hijo es agente, todos deben ser agentes
    const algunAgente = Boolean(padre.agente_retencion) || hijosActivos.some(h => Boolean(h.agente_retencion));

    if (algunAgente) {
      // 1. Asegurar padre
      if (!padre.agente_retencion) {
        registrarBackup(padre, `FASE 2: Padre marcado como agente_retencion = true por hijos`);
        await supabase.from('inmuebles').update({ agente_retencion: true }).eq('id', padre.id);
        padre.agente_retencion = true;
        retencionesSincronizadas++;
        console.log(`[PADRE AGENTE] ${padre.inmueble} (${padre.contribuyente})`);
      }

      // 2. Asegurar hijos
      for (const h of hijosActivos) {
        if (!h.agente_retencion) {
          registrarBackup(h, `FASE 2: Hijo marcado como agente_retencion = true`);
          await supabase.from('inmuebles').update({ agente_retencion: true }).eq('id', h.id);
          h.agente_retencion = true;
          retencionesSincronizadas++;
          console.log(`[HIJO AGENTE] ${h.inmueble} (${h.actividad_principal}) bajo padre ${padre.inmueble}`);
        }
      }
    }
  }
  console.log(`Fase 2 completada. Registros actualizados a Agente de Retención: ${retencionesSincronizadas}`);

  // -------------------------------------------------------------------------
  // FASE 3: RECALCULAR MMV_MES Y CANT_INMUEBLES EN CONTENEDORES N/A
  // (Asegurar que cant_inmuebles y mmv_mes sea exactamente la suma de sus actividades activas)
  // -------------------------------------------------------------------------
  console.log('\n--- FASE 3: Recalculando MMV_MES y CANT_INMUEBLES en Contenedores Comerciales ---');
  let padresActualizados = 0;

  for (const padre of allInms) {
    if (padre.es_condominio || padre.condominio_padre_id) continue;
    const actPadre = (padre.actividad_principal || '').trim().toUpperCase();
    if (actPadre !== 'N/A' && parseInt(padre.cant_inmuebles || '0') <= 1) continue;

    const hijosActivos = allInms.filter(h => h.padre_id === padre.inmueble && (h.estado || 'Activo').toLowerCase() === 'activo');
    if (hijosActivos.length === 0) continue;

    const cantReal = hijosActivos.length;
    const mmvReal = Math.round(hijosActivos.reduce((s, h) => s + parseFloat(h.mmv_mes || '0'), 0) * 100) / 100;
    const mmvPadreActual = Math.round(parseFloat(padre.mmv_mes || '0') * 100) / 100;
    const cantPadreActual = parseInt(padre.cant_inmuebles || '0');

    if (cantReal !== cantPadreActual || Math.abs(mmvReal - mmvPadreActual) > 0.05) {
      registrarBackup(padre, `FASE 3: MMV/Cant ajustado (cant: ${cantPadreActual}->${cantReal}, mmv: ${mmvPadreActual}->${mmvReal})`);
      
      const updatePayload = {
        cant_inmuebles: cantReal,
        mmv_mes: mmvReal
      };

      const { error: pErr } = await supabase
        .from('inmuebles')
        .update(updatePayload)
        .eq('id', padre.id);

      if (pErr) {
        console.error(`Error actualizando padre ${padre.inmueble}:`, pErr);
      } else {
        padresActualizados++;
        console.log(`[PADRE AJUSTADO] ${padre.inmueble} (${padre.contribuyente}): Cant ${cantPadreActual} -> ${cantReal}, MMV ${mmvPadreActual} -> ${mmvReal}`);
        padre.cant_inmuebles = cantReal;
        padre.mmv_mes = mmvReal;
      }
    }
  }
  console.log(`Fase 3 completada. Contenedores padre actualizados: ${padresActualizados}`);

  // -------------------------------------------------------------------------
  // GUARDAR BACKUP COMPLETO
  // -------------------------------------------------------------------------
  const backupPath = `scripts/backup_saneamiento_incidencias_${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log(`\n=== SANEAMIENTO COMPLETADO CON ÉXITO ===`);
  console.log(`Total registros respaldados y modificados: ${backupData.inmuebles_modificados.length}`);
  console.log(`Archivo de respaldo guardado en: ${backupPath}`);
}

ejecutarSaneamiento();
