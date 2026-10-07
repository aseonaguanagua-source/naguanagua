import { supabaseAdmin as sb } from './src/lib/supabaseAdmin.ts';

async function check() {
  const { data: condo } = await sb.from('condominios').select('*').ilike('nombre', '%MAÑONGO%').limit(1).maybeSingle();
  console.log('Condominio:', condo);

  const { data: inm } = await sb.from('inmuebles').select('inmueble, contribuyente, agente_retencion').eq('identidad', condo?.identidad).limit(1).maybeSingle();
  console.log('Inmueble del condominio RIF:', inm);
}
check().catch(console.error);
