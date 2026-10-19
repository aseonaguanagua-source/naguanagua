const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function scanIncidences() {
  console.log('--- Iniciando auditoría profunda de contenedores, hijos y retenciones ---');
  
  // Traer todos los inmuebles que no están eliminados
  let allInms = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, cant_inmuebles, mmv_mes, deuda_mmv, meses_deuda, multa_bs, estado, padre_id, agente_retencion, es_condominio, condominio_padre_id, direccion')
      .neq('estado', 'Eliminado')
      .range(from, from + pageSize - 1);
    
    if (error) {
      console.error('Error fetching inmuebles:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allInms = allInms.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log('Total inmuebles no eliminados cargados:', allInms.length);

  const inmsByCode = new Map();
  allInms.forEach(i => inmsByCode.set(i.inmueble, i));

  // -----------------------------------------------------------------------------------
  // Incidencia Tipo 1: Hijos con padre_id cuyo RIF (identidad) es DIFERENTE al del padre
  // (Caso idéntico al de URB015454 Redvital)
  // -----------------------------------------------------------------------------------
  const rifsDesalineados = [];
  allInms.forEach(hijo => {
    if (hijo.padre_id && inmsByCode.has(hijo.padre_id)) {
      const padre = inmsByCode.get(hijo.padre_id);
      if (!padre.es_condominio && !hijo.es_condominio) {
        const rHijo = (hijo.identidad || '').replace(/^[VEJPG]-?/i, '').trim();
        const rPadre = (padre.identidad || '').replace(/^[VEJPG]-?/i, '').trim();
        if (rHijo && rPadre && rHijo !== rPadre) {
          rifsDesalineados.push({
            hijo: hijo.inmueble,
            hijo_rif: hijo.identidad,
            hijo_contribuyente: hijo.contribuyente,
            hijo_actividad: hijo.actividad_principal,
            hijo_estado: hijo.estado,
            padre: padre.inmueble,
            padre_rif: padre.identidad,
            padre_contribuyente: padre.contribuyente,
            padre_actividad: padre.actividad_principal
          });
        }
      }
    }
  });

  // -----------------------------------------------------------------------------------
  // Incidencia Tipo 2: Contenedores N/A o cant_inmuebles > 1 cuya cantidad de hijos o mmv_mes
  // no coincide con la suma de los hijos
  // -----------------------------------------------------------------------------------
  const padresDescuadrados = [];
  const padresNA = allInms.filter(i => {
    const act = (i.actividad_principal || '').trim().toUpperCase();
    return (act === 'N/A' || (parseInt(i.cant_inmuebles || '0') > 1)) && !i.es_condominio && !i.condominio_padre_id;
  });

  padresNA.forEach(padre => {
    const hijos = allInms.filter(h => h.padre_id === padre.inmueble && (h.estado || 'Activo').toLowerCase() === 'activo');
    const cantHijos = hijos.length;
    const sumMmv = Math.round(hijos.reduce((s, h) => s + parseFloat(h.mmv_mes || '0'), 0) * 100) / 100;
    const padreMmv = Math.round(parseFloat(padre.mmv_mes || '0') * 100) / 100;
    const padreCant = parseInt(padre.cant_inmuebles || '0');

    if (cantHijos > 0 && (cantHijos !== padreCant || Math.abs(sumMmv - padreMmv) > 0.05)) {
      padresDescuadrados.push({
        padre: padre.inmueble,
        contribuyente: padre.contribuyente,
        rif: padre.identidad,
        padre_cant: padreCant,
        hijos_reales: cantHijos,
        padre_mmv: padreMmv,
        sum_hijos_mmv: sumMmv,
        diferencia_mmv: Math.round((sumMmv - padreMmv) * 100) / 100
      });
    }
  });

  // -----------------------------------------------------------------------------------
  // Incidencia Tipo 3: Hijos de contenedores N/A con meses_deuda desfasados entre hermanos
  // (Caso idéntico al de El Bodegón de la Arepa URB007431)
  // -----------------------------------------------------------------------------------
  const mesesDesfasados = [];
  padresNA.forEach(padre => {
    const hijos = allInms.filter(h => h.padre_id === padre.inmueble && (h.estado || 'Activo').toLowerCase() === 'activo');
    if (hijos.length > 1) {
      const mesesSet = new Set(hijos.map(h => parseInt(h.meses_deuda || '0')));
      if (mesesSet.size > 1) {
        mesesDesfasados.push({
          padre: padre.inmueble,
          contribuyente: padre.contribuyente,
          padre_meses: padre.meses_deuda,
          hijos_con_meses: hijos.map(h => `${h.inmueble} (${h.actividad_principal}): ${h.meses_deuda}m`).join(' | ')
        });
      }
    }
  });

  // -----------------------------------------------------------------------------------
  // Incidencia Tipo 4: Inmuebles comerciales con agente_retencion no sincronizado entre padre e hijos
  // -----------------------------------------------------------------------------------
  const retencionesDesincronizadas = [];
  padresNA.forEach(padre => {
    const hijos = allInms.filter(h => h.padre_id === padre.inmueble && (h.estado || 'Activo').toLowerCase() === 'activo');
    if (hijos.length > 0) {
      const pAgente = Boolean(padre.agente_retencion);
      const algunoDiferente = hijos.some(h => Boolean(h.agente_retencion) !== pAgente);
      if (algunoDiferente) {
        retencionesDesincronizadas.push({
          padre: padre.inmueble,
          contribuyente: padre.contribuyente,
          padre_agente: pAgente,
          hijos_agentes: hijos.map(h => `${h.inmueble}: ${Boolean(h.agente_retencion)}`).join(', ')
        });
      }
    }
  });

  // -----------------------------------------------------------------------------------
  // Incidencia Tipo 5: Inmuebles hijos sueltos en SIGYR que existen en Supabase pero tienen padre_id = null
  // -----------------------------------------------------------------------------------
  let sigyrAudit = [];
  try {
    sigyrAudit = JSON.parse(fs.readFileSync('scripts/saneamiento/diag_familias_sigyr.json', 'utf8'));
  } catch (e) {}

  const hijosHuerfanos = [];
  if (sigyrAudit.length > 0) {
    sigyrAudit.forEach(item => {
      const hijoCode = item.hijo;
      const padreCode = item.padre;
      const supaHijo = inmsByCode.get(hijoCode);
      const supaPadre = inmsByCode.get(padreCode);

      if (supaHijo && supaPadre) {
        if (!supaHijo.padre_id && (supaHijo.estado || 'Activo').toLowerCase() === 'activo') {
          hijosHuerfanos.push({
            hijo: hijoCode,
            hijo_actividad: supaHijo.actividad_principal,
            hijo_rif: supaHijo.identidad,
            padre_esperado: padreCode,
            padre_actividad: supaPadre.actividad_principal,
            padre_rif: supaPadre.identidad
          });
        }
      }
    });
  }

  const resultado = {
    total_inmuebles_auditados: allInms.length,
    incidencia_1_rifs_desalineados: rifsDesalineados,
    incidencia_2_padres_descuadrados_mmv_o_cant: padresDescuadrados,
    incidencia_3_meses_desfasados_entre_actividades: mesesDesfasados,
    incidencia_4_retenciones_desincronizadas: retencionesDesincronizadas,
    incidencia_5_hijos_sin_padre_id_en_supabase: hijosHuerfanos
  };

  fs.writeFileSync('scripts/reporte_incidencias_detectadas.json', JSON.stringify(resultado, null, 2));

  console.log('\n======================================================');
  console.log('RESUMEN DE AUDITORÍA:');
  console.log('1. Hijos con RIF desalineado del padre:', rifsDesalineados.length);
  console.log('2. Contenedores con MMV o cantidad descuadrada:', padresDescuadrados.length);
  console.log('3. Contenedores con actividades en diferentes meses de deuda:', mesesDesfasados.length);
  console.log('4. Contenedores con bandera de agente de retención desincronizada:', retencionesDesincronizadas.length);
  console.log('5. Hijos de SIGYR activos en Supabase con padre_id = null:', hijosHuerfanos.length);
  console.log('======================================================\n');
}

scanIncidences();
