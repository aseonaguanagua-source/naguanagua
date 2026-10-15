const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function listDetail() {
  const { data: condoTable } = await sb.from('condominios').select('codigo');
  const condoSet = new Set((condoTable || []).map(c => (c.codigo || '').toUpperCase()));

  let allInms = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, es_condominio, clasificacion, cant_inmuebles, estado, tipo, direccion')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allInms = allInms.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const activeMissing = allInms.filter(i => {
    if (i.estado !== 'Activo') return false;
    const isCondo = i.es_condominio === true || i.clasificacion === 'Condominio';
    return isCondo && !condoSet.has((i.inmueble || '').toUpperCase());
  });

  console.log(`Total encontrados: ${activeMissing.length}`);
  const report = activeMissing.map(x => ({
    code: x.inmueble,
    identidad: x.identidad,
    name: x.contribuyente,
    unidades: x.cant_inmuebles,
    tipo: x.tipo,
    clasif: x.clasificacion,
    es_condominio: x.es_condominio
  }));

  console.log(JSON.stringify(report, null, 2));
}

listDetail().catch(console.error);
