require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const missingCodes = [
  'URB024783', 'URB028116', 'URB028483', 'URB029160', 'URB033554', 'URB034480', 'URB033244', 'URB034684', 'URB003322',
  'URB000326', 'URB034963'
];

async function run() {
  const { data: inmuebles } = await supabase.from('inmuebles').select('*').in('inmueble', missingCodes);
  
  for (const inm of inmuebles) {
    console.log(`Migrating ${inm.inmueble}...`);
    const tipo = inm.tipo === 'RESIDENCIAL' ? 'RESIDENCIAL' : 'COMERCIAL';
    const modalidad = tipo === 'RESIDENCIAL' ? 'CENTRALIZADO' : 'MIXTO_COMERCIAL';
    
    const cData = {
      codigo: inm.inmueble,
      identidad: inm.identidad,
      nombre: inm.propietario,
      tipo,
      modalidad,
      cant_declarada: inm.cant_inmuebles || 1,
      actividad: inm.actividad_principal,
      tarifa_mmv: inm.mmv_mes || null,
      agente_retencion: !!inm.agente_retencion,
      telefono: inm.telefono,
      correo: inm.correo_electronico,
      direccion: inm.direccion,
      estado: inm.estado,
      notas: `Agregado desde la jerarquía de SIGYR (${new Date().toLocaleDateString('es-VE')}).`,
      migrado_desde: {
        fecha: new Date().toISOString(),
        mmv_mes: inm.mmv_mes,
        inmueble: inm.inmueble,
        meses_deuda: inm.meses_deuda,
        estado_padre: inm.estado,
        cant_inmuebles: inm.cant_inmuebles
      },
      permite_pago_por_unidad: true,
      permite_abonos: true,
      cobro_tarifa_por_unidad: tipo !== 'RESIDENCIAL',
      aseo_pendiente_desde: '2026-09-01',
      multa_meses: inm.multa_meses || 0,
      abono_bs: inm.abono_bs || 0,
      origen: 'SIGYR_NUEVO',
      multa_exonerada_hasta: '2026-09-01',
    };
    
    const { data: condo, error } = await supabase.from('condominios').insert(cData).select().single();
    if (error) {
      console.error(error);
      continue;
    }
    
    // Find children
    const { data: hijos } = await supabase.from('inmuebles').select('*').eq('padre_inmueble', inm.inmueble);
    console.log(`Found ${hijos.length} hijos for ${inm.inmueble}`);
    
    if (hijos.length > 0) {
      const uData = hijos.map(h => ({
        condominio_id: condo.id,
        inmueble: h.inmueble,
        identidad: h.identidad,
        propietario: h.propietario,
        actividad: h.actividad_principal,
        tarifa_mmv: h.mmv_mes,
        estado: h.estado === 'Activo' ? 'Activa' : (h.estado === 'Desocupado' ? 'Desocupada' : 'Eliminada'),
        aseo_pendiente_desde: '2026-09-01',
        multa_meses: h.multa_meses || 0,
        abono_bs: h.abono_bs || 0,
        agente_retencion: !!h.agente_retencion,
        multa_exonerada_hasta: '2026-09-01',
        es_grupo: false
      }));
      await supabase.from('condominio_unidades').insert(uData);
    }
  }
}
run();
