require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Fijando números de local...');
  
  let all = [];
  for (let from = 0; ; from += 1000) {
    let { data, error } = await supabase.from('inmuebles').select('id, inmueble, direccion').not('direccion', 'is', null).range(from, from + 999);
    if (!data || data.length === 0) break;
    all = all.concat(data);
  }

  const updates = [];
  const cuUpdates = [];
  
  for (const i of all) {
    if (!i.direccion) continue;
    
    // Mejor regex para LOCALES NRO. L1 - L2 etc...
    let num = null;
    const match1 = i.direccion.match(/(?:LOCALES|LOCAL|OFICINA|APTO|CASA|MODULO|PUESTO)\s*(?:NRO\.?|N°|#)?\s*([A-Z0-9-\s]+?)(?:\s+(?:SECTOR|AV\.|CALLE|PLANTA|PISO|C\.C|CONJ)|$)/i);
    if (match1 && match1[1] && match1[1].length > 0) {
        num = match1[1].trim();
    } else {
        const match2 = i.direccion.match(/NRO\.?\s*([A-Z0-9-\s]+?)(?:\s+(?:SECTOR|AV\.|CALLE|PLANTA|PISO|C\.C|CONJ)|$)/i);
        if (match2 && match2[1]) {
            num = match2[1].trim();
        }
    }
    
    if (num && num.length > 20) {
        // If it extracted too much, take just the first part
        num = num.split(' ')[0];
    }

    if (num && num !== '.' && num !== 'ES' && num.length > 0) {
      updates.push({ id: i.id, numero_local: num.toUpperCase().trim() });
      cuUpdates.push({ inmueble: i.inmueble, num: num.toUpperCase().trim() });
    }
  }

  console.log(`Encontrados ${updates.length} números.`);
  let success = 0;
  for (let i = 0; i < cuUpdates.length; i += 100) {
    const chunk = cuUpdates.slice(i, i + 100);
    // Since we need to update condominio_unidades too, we'll do it one by one for cu
    await Promise.all(chunk.map(c => supabase.from('condominio_unidades').update({ numero: c.num }).eq('inmueble', c.inmueble)));
    success += chunk.length;
    process.stdout.write(`\rActualizados: ${success}/${cuUpdates.length}`);
  }
  console.log('\nTerminado');
}

main().catch(console.error);
