require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function show(label, q) {
  const { data, error } = await q;
  console.log(`\n=== ${label}`, error ? error.message : '');
  (data || []).forEach(r => console.log(JSON.stringify(r)));
}

(async () => {
  const cols = 'id,inmueble,identidad,contribuyente,estado,actividad_principal,meses_deuda,saldo_favor_bs,agente_retencion,condominio_padre';
  const colsSafe = 'id,inmueble,identidad,contribuyente,estado,actividad_principal,meses_deuda,saldo_favor_bs,agente_retencion';
  for (const code of ['URB001833', 'URB033288']) {
    let r = await sb.from('inmuebles').select(cols).ilike('inmueble', `%${code}%`);
    if (r.error) r = await sb.from('inmuebles').select(colsSafe).ilike('inmueble', `%${code}%`);
    console.log(`\n=== inmuebles ${code}`, r.error ? r.error.message : '');
    (r.data || []).forEach(x => console.log(JSON.stringify(x)));
    const ids = [...new Set((r.data || []).map(x => x.identidad))];
    for (const id of ids) {
      const digits = String(id || '').replace(/\D/g, '');
      await show(`users_aseo ident ~ ${digits}`, sb.from('users_aseo').select('Identidad,Contribuyente,Estado,CodCont').ilike('Identidad', `%${digits}%`));
      await show(`inmuebles ident ~ ${digits}`, sb.from('inmuebles').select(colsSafe).ilike('identidad', `%${digits}%`));
    }
  }
  await show('users_aseo 84584244', sb.from('users_aseo').select('Identidad,Contribuyente,Estado,CodCont').ilike('Identidad', '%84584244%'));
  await show('users_aseo 15496661', sb.from('users_aseo').select('Identidad,Contribuyente,Estado,CodCont').ilike('Identidad', '%15496661%'));
  await show('users_aseo 507840433 (Cheo)', sb.from('users_aseo').select('Identidad,Contribuyente,Estado,CodCont').ilike('Identidad', '%507840433%'));
})();
