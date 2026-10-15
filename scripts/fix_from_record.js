const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const toFix = JSON.parse(fs.readFileSync('wrong_identities_from_excel.json', 'utf8'));

    // Insert contribuyentes first!
    let usersToInsert = [];
    const insertedIds = new Set();
    for (const f of toFix) {
        if (!insertedIds.has(f.excIdentidad)) {
            insertedIds.add(f.excIdentidad);
            usersToInsert.push({
                identidad: f.excIdentidad,
                nombre: f.excNombre,
                email: 'N/A',
                telefono: '0000000',
                direccion: 'Restaurado desde Excel'
            });
        }
    }
    
    console.log(`Upserting ${usersToInsert.length} contribuyentes...`);
    const { error: errU } = await supabase.from('contribuyentes').upsert(usersToInsert, { onConflict: 'identidad' });
    if (errU) console.error("Error upserting contribuyentes:", errU);
    else console.log("Contribuyentes upserted successfully.");

    // Fix them in Supabase
    let count = 0;
    for (const f of toFix) {
        const { error } = await supabase.from('inmuebles').update({
            identidad: f.excIdentidad,
            contribuyente: f.excNombre
        }).eq('id', f.id);
        if (error) {
            console.error(`Error fixing ${f.inmueble}:`, error);
        } else {
            count++;
        }
    }
    console.log(`Successfully fixed ${count} properties.`);
}

run();
