const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkNotas() {
  const { data: notas } = await sb
    .from('documentos')
    .select('*')
    .eq('tipo', 'Nota de Credito')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log('Últimas 30 Notas de Crédito:');
  for (const n of (notas || [])) {
    let d = n.detalles;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (e) {}
    }
    console.log(JSON.stringify({
      id: n.id,
      fecha: n.created_at?.slice(0, 10),
      identidad: n.identidad,
      contribuyente: n.contribuyente,
      monto: d?.monto,
      origen: d?.origen_referencia
    }));
  }
}

checkNotas().catch(console.error);
