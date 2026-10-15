require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const d of ['075259912', '84584244', '15496661', '507840433']) {
    const c = await sb.from('contribuyentes').select('*').ilike('identidad', `%${d}%`);
    console.log(`\n=== contribuyentes ~${d}`, c.error?.message || '');
    (c.data || []).forEach(r => console.log(JSON.stringify({ id: r.id, identidad: r.identidad, nombre: r.nombre, estado: r.estado, clasificacion: r.clasificacion, es_condominio: r.es_condominio, condominio_padre_id: r.condominio_padre_id, codigo: r.codigo || r.cod_cont })));
    const i = await sb.from('inmuebles').select('*').ilike('identidad', `%${d}%`).neq('estado', 'Eliminado');
    (i.data || []).forEach(r => console.log('  INM', JSON.stringify({ inm: r.inmueble, estado: r.estado, es_condominio: r.es_condominio, condominio_padre_id: r.condominio_padre_id, cant: r.cant_inmuebles, act: r.actividad_principal })));
  }
})();
