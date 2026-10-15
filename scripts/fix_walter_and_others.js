const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Leyendo Excel...");
    const workbook = XLSX.readFile('/Users/davidzara/Documents/naguanagua_zero/documentos/Record de deudas - 20261004174131.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const excelMap = new Map();
    for (const r of data) {
        if (!r['Código']) continue;
        const cod = r['Código'].toString().trim().toUpperCase();
        excelMap.set(cod, {
            documento: r['Documento'] ? r['Documento'].toString().trim().toUpperCase() : '',
            nombre: r['Nombre / Razón Social'] ? r['Nombre / Razón Social'].toString().trim().toUpperCase() : ''
        });
    }
    
    console.log("Fetching inmuebles from Supabase...");
    let inmuebles = [];
    let from = 0;
    while(true) {
        const { data: chunk, error } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente').range(from, from + 999);
        if (error || !chunk.length) break;
        inmuebles = inmuebles.concat(chunk);
        from += 1000;
    }

    let toFix = [];
    for (const inm of inmuebles) {
        const cod = (inm.inmueble || '').trim().toUpperCase();
        const exc = excelMap.get(cod);
        if (!exc || !exc.documento) continue;

        const docExc = exc.documento;
        const docSup = (inm.identidad || '').trim().toUpperCase();
        
        // Only get numbers to check for huge differences
        const numExc = docExc.replace(/[^0-9]/g, '');
        const numSup = docSup.replace(/[^0-9]/g, '');

        // If the numeric part of the identity is entirely different, AND the excel identity isn't empty/null
        if (numExc !== numSup && numExc.length > 4 && numSup.length > 4) {
             // Let's make sure it's not a subset (like 012345 vs 12345)
             if (!numExc.includes(numSup) && !numSup.includes(numExc)) {
                 toFix.push({
                     id: inm.id,
                     inmueble: cod,
                     supIdentidad: docSup,
                     supNombre: inm.contribuyente,
                     excIdentidad: docExc,
                     excNombre: exc.nombre
                 });
             }
        }
    }

    console.log(`Found ${toFix.length} properties assigned to totally wrong IDs compared to Excel!`);
    console.log(toFix.filter(t => t.inmueble.includes('URB001833') || t.inmueble.includes('URB005955')));

    // Ensure we create contribuyentes for all of them
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
