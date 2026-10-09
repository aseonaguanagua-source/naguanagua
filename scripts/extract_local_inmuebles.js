require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Iniciando extracción de números de local para la tabla inmuebles...');
  
  let allInmuebles = [];
  let from = 0;
  let to = 999;
  
  while (true) {
    let { data: inmuebles, error } = await supabase
      .from('inmuebles')
      .select('id, direccion')
      .not('direccion', 'is', null)
      .is('numero_local', null)
      .range(from, to);

    if (error) {
      console.error('Error fetching inmuebles:', error);
      break;
    }
    
    if (inmuebles.length === 0) break;
    
    allInmuebles = allInmuebles.concat(inmuebles);
    from += 1000;
    to += 1000;
  }

  console.log(`Analizando ${allInmuebles.length} inmuebles restantes sin numero_local...`);
  
  const updates = [];
  
  for (const i of allInmuebles) {
    if (!i.direccion) continue;
    
    const matches = [
      i.direccion.match(/(?:LOCAL|APTO|OFICINA|MODULO|PUESTO|VIVIENDA|CASA|NRO)\.?\s*([A-Z0-9-]{1,10})/i),
      i.direccion.match(/(?:LOCAL|PUESTO|OFICINA|APTO|CASA)\s+([A-Z0-9-]{1,8})/i),
      i.direccion.match(/NRO\.?\s*([A-Z0-9-]{1,8})/i)
    ];

    let num = null;
    for (const match of matches) {
      if (match && match[1] && match[1].length > 0 && match[1] !== '.') {
        num = match[1].trim();
        break;
      }
    }
    
    if (!num || num === '.' || num === '-') {
        const regexWords = i.direccion.split(/\s+/);
        for (let j = 0; j < regexWords.length; j++) {
            if (['CASA', 'LOCAL', 'OFICINA', 'APTO'].includes(regexWords[j]) && regexWords[j+1]) {
                if (regexWords[j+1] !== 'NRO.' && regexWords[j+1] !== 'NRO') {
                    num = regexWords[j+1].replace(/[^A-Z0-9-]/gi, '');
                    if (num) break;
                }
            }
        }
    }

    if (num && num.length > 0 && num !== '.') {
      updates.push({
        id: i.id,
        numero_local: num.toUpperCase()
      });
    }
  }

  console.log(`Se encontraron ${updates.length} números para actualizar.`);

  let success = 0;
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const { error: updError } = await supabase.from('inmuebles').upsert(chunk);
    if (updError) {
      console.error('Error updating chunk:', updError);
    } else {
      success += chunk.length;
      process.stdout.write(`\rActualizados: ${success}/${updates.length}`);
    }
  }
  
  console.log('\n¡Proceso completado!');
}

main().catch(console.error);
