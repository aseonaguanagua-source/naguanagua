const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixSambil() {
  const sambilCondoId = '7567ec01-6d34-4341-bc5b-5a69c64cba93';

  const { data: allInmuebles, error: err1 } = await sb.from('inmuebles')
    .select('*')
    .ilike('direccion', '%SAMBIL%')
    .neq('inmueble', 'URB016119');
    
  if (err1) {
    console.error("Error fetching inmuebles:", err1);
    return;
  }
    
  console.log(`Found ${allInmuebles.length} potential units in inmuebles.`);

  const { data: currentUnits, error: err2 } = await sb.from('condominio_unidades')
    .select('inmueble')
    .eq('condominio_id', sambilCondoId);
    
  const currentIds = currentUnits.map(u => u.inmueble);
  console.log(`Currently attached: ${currentIds.length}`);

  const missing = allInmuebles.filter(i => !currentIds.includes(i.inmueble) && (i.direccion.includes('SAMBIL') || i.condominio_padre_id === 'URB016119'));
  console.log(`Missing from condominio_unidades: ${missing.length}`);

  if (missing.length > 0) {
    console.log("Sample missing:", missing.slice(0, 3).map(m => m.inmueble));
    
    const toInsert = missing.map(m => {
      return {
        condominio_id: sambilCondoId,
        inmueble: m.inmueble,
        identidad: m.identidad,
        propietario: m.contribuyente || m.nombre || 'DESCONOCIDO',
        actividad: m.actividad_principal || 'N/A',
        tarifa_mmv: m.mmv_mes || 1.98,
        estado: 'Activa',
        aseo_pendiente_desde: '2026-08-01',
        multa_meses: 0,
        abono_bs: 0
      };
    });

    const { error } = await sb.from('condominio_unidades').insert(toInsert);
    if (error) {
      console.log("Error inserting:", error);
    } else {
      console.log("Successfully attached missing units to Sambil!");
    }
    
    await sb.from('condominios').update({ cant_declarada: currentIds.length + toInsert.length }).eq('id', sambilCondoId);
    console.log("Updated Sambil cant_declarada");
  }
}
fixSambil();
