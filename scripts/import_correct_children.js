require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const codes = ['URB024783', 'URB028116', 'URB028483', 'URB029160', 'URB033554', 'URB034480', 'URB033244', 'URB034684', 'URB003322', 'URB000326', 'URB034963'];
  const { data: condominios } = await supabase.from('condominios').select('id, codigo, identidad').in('codigo', codes);
  
  for (const c of condominios) {
    const { data: inmuebles } = await supabase.from('inmuebles').select('*, contribuyentes(nombre)').eq('padre_id', c.codigo);
    console.log(c.codigo, 'has', inmuebles.length, 'correct units by padre_id');
    
    if (inmuebles.length > 0) {
      const uData = inmuebles.map(h => ({
        condominio_id: c.id,
        inmueble: h.inmueble,
        identidad: h.identidad || c.identidad,
        propietario: h.propietario || (h.contribuyentes ? h.contribuyentes.nombre : '') || '',
        actividad: h.actividad_principal,
        tarifa_mmv: h.mmv_mes || 0,
        estado: h.estado === 'Activo' ? 'Activa' : (h.estado === 'Desocupado' ? 'Desocupada' : 'Eliminada'),
        aseo_pendiente_desde: '2026-09-01',
        multa_meses: h.multa_meses || 0,
        abono_bs: h.abono_bs || 0,
        multa_exonerada_hasta: '2026-09-01',
        es_grupo: false
      }));
      
      // Delete the mistakenly imported ones (the ones we imported by RIF)
      await supabase.from('condominio_unidades').delete().eq('condominio_id', c.id);
      
      // Insert correct ones
      const { error } = await supabase.from('condominio_unidades').insert(uData);
      if (error) console.error('Error inserting', c.codigo, error.message);
    } else {
      // Still need to delete the mistakenly imported ones by RIF
      await supabase.from('condominio_unidades').delete().eq('condominio_id', c.id);
    }
  }
  
  console.log('Done!');
}
run();
