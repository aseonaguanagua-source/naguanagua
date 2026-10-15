import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function norm(str) {
  return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/[^A-Z]/g, '');
}

async function main() {
    console.log("Fetching all contribuyentes...");
    let contribuyentes = new Map();
    let from = 0;
    while(true) {
        const { data } = await supabase.from('contribuyentes').select('identidad, nombre, estado').range(from, from + 999);
        if (!data || data.length === 0) break;
        data.forEach(d => contribuyentes.set(d.identidad, d));
        from += 1000;
    }

    console.log("Fetching all inmuebles...");
    let inmuebles = [];
    from = 0;
    while(true) {
        const { data } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado').range(from, from + 999);
        if (!data || data.length === 0) break;
        inmuebles = inmuebles.concat(data);
        from += 1000;
    }

    let mismatches = [];
    for (let inm of inmuebles) {
        const c = contribuyentes.get(inm.identidad);
        if (!c) continue;

        const nameInm = norm(inm.contribuyente);
        const nameC = norm(c.nombre);

        // If names are completely different and have length > 5
        if (nameInm && nameC && nameInm.length > 5 && nameC.length > 5) {
            if (!nameInm.includes(nameC) && !nameC.includes(nameInm)) {
                // Check if they share at least 50% of the words
                const wordsInm = inm.contribuyente.toUpperCase().replace(/[^A-Z\s]/g, '').split(' ').filter(w => w.length > 2);
                const wordsC = c.nombre.toUpperCase().replace(/[^A-Z\s]/g, '').split(' ').filter(w => w.length > 2);
                
                let matches = 0;
                for (let w of wordsInm) {
                    if (wordsC.includes(w)) matches++;
                }
                
                // if less than 1 match, it's a huge mismatch
                if (matches === 0 && wordsInm.length > 0 && wordsC.length > 0) {
                    mismatches.push({
                        inmueble: inm.inmueble,
                        identidad: inm.identidad,
                        nombre_en_inmueble: inm.contribuyente,
                        nombre_en_contribuyente: c.nombre,
                        estado_inmueble: inm.estado,
                        estado_contribuyente: c.estado
                    });
                }
            }
        }
    }

    console.log(`Found ${mismatches.length} gross mismatches.`);
    console.log(mismatches.slice(0, 20));
    
    import('fs').then(fs => fs.writeFileSync('huge_mismatches.json', JSON.stringify(mismatches, null, 2)));
}
main();
