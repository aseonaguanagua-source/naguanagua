const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function extractNumero(direccion) {
  if (!direccion) return null;
  const matchApto = direccion.match(/APTO NRO\.?\s*(\S+)/i);
  if (matchApto) return matchApto[1].replace(/[,.]$/, '');
  
  const matchLocal = direccion.match(/LOCAL COMERCIAL NRO\.?\s*(\S+)/i);
  if (matchLocal) return matchLocal[1].replace(/[,.]$/, '');
  
  const matchTH = direccion.match(/TOWN HOUSE NRO\.?\s*(\S+)/i);
  if (matchTH) return matchTH[1].replace(/[,.]$/, '');

  const matchLocalP = direccion.match(/Local:\s*(\S+)/i);
  if (matchLocalP) return matchLocalP[1].replace(/[,.]$/, '');

  return null;
}

async function fixNumeros() {
  let allUnidades = [];
  let from = 0;
  while (true) {
    const { data: unidades, error } = await supabase.from('condominio_unidades').select('id, inmueble, numero').or('numero.is.null,numero.eq.').range(from, from + 999);
    if (error) { console.error(error); return; }
    if (!unidades || unidades.length === 0) break;
    allUnidades.push(...unidades);
    from += 1000;
  }
  
  console.log(`Found ${allUnidades.length} unidades with missing numero.`);
  let fixed = 0;
  
  const inmueblesCodigos = allUnidades.map(u => u.inmueble).filter(Boolean);
  const chunk = 300;
  const inmsMap = {};
  for(let i = 0; i < inmueblesCodigos.length; i += chunk) {
    const { data: inms } = await supabase.from('inmuebles').select('inmueble, direccion').in('inmueble', inmueblesCodigos.slice(i, i + chunk));
    if (inms) inms.forEach(d => inmsMap[d.inmueble] = d.direccion);
  }
  
  for (const u of allUnidades) {
    if (!u.inmueble) continue;
    const dir = inmsMap[u.inmueble];
    if (dir) {
      const num = extractNumero(dir);
      if (num && num.toUpperCase() !== 'SN' && num !== '.') {
        await supabase.from('condominio_unidades').update({ numero: num }).eq('id', u.id);
        fixed++;
      }
    }
  }
  console.log(`Fixed ${fixed} unidades.`);
}
fixNumeros();
