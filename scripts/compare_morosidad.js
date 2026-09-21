const fs = require('fs');
const pdf = require('pdf-parse');
require('dotenv').config({path: '../.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function parsePDF(filePath) {
    let dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const lines = data.text.split('\n');
    
    const records = [];
    // Regex explanation:
    // ^([A-Z]\d+) : Matches V1234567, J1234567, E1234567 at the start
    // .*? (I-\d+) : Matches the Inmueble code I-000123
    // .*? ([\d\.]+,[\d]{2})$ : Matches the Deuda at the end (e.g. 143.118,40)
    
    // Some identities have a dash like J-12345678-9, let's just match the first token
    // Actually the OCR format is:
    // J507332764- 0259 Sport Drink, C.A. I-000397 Comercial 07-2026 Bar-restaurant SN El Cañito 143.118,40
    // J402321538- Bay Crab Group, C.A. I-000392 Comercial ... 572.473,60
    // E80112228 -Arsenia Rodriguez Camacho ... 4.472,44
    
    const regex = /^([A-Z]\d+(?:-\d+)?)\s*[-\s]+(.*?)\s+(I-\d+)\s+.*?\s+([\d\.]+,[\d]{2})$/;

    for (let line of lines) {
        // Some lines might not start with the identity but have it. 
        // Let's do a more robust regex that just looks for identity, I- code, and amount at the end.
        const match = line.match(/^([A-Z]\d+)[-\s]+(.*?)\s+(I-\d+)\s+.*?\s+([\d\.]+,[\d]{2})$/);
        if (match) {
            records.push({
                identidad: match[1],
                nombre: match[2].trim(),
                inmueble: match[3],
                deuda_bs: parseFloat(match[4].replace(/\./g, '').replace(',', '.'))
            });
        } else {
            // fallback regex if it starts with space or similar
            const tokens = line.trim().split(/\s+/);
            if (tokens.length > 5) {
                const idMatch = tokens[0].match(/^([A-Z]\d+)-?/);
                if (idMatch) {
                    const inmMatch = line.match(/(I-\d+)/);
                    const debtMatch = line.match(/([\d\.]+,[\d]{2})$/);
                    if (inmMatch && debtMatch) {
                        records.push({
                            identidad: idMatch[1],
                            nombre: line.substring(tokens[0].length, line.indexOf(inmMatch[1])).replace(/^-\s*/, '').trim(),
                            inmueble: inmMatch[1],
                            deuda_bs: parseFloat(debtMatch[1].replace(/\./g, '').replace(',', '.'))
                        });
                    }
                }
            }
        }
    }
    return records;
}

async function run() {
    console.log("Parseando PDFs...");
    const morosidad = await parsePDF('C:\\Users\\david\\Desktop\\tucacasdoc\\morosidad.pdf');
    const morosidadCond = await parsePDF('C:\\Users\\david\\Desktop\\tucacasdoc\\morosidad condominio.pdf');
    
    const allRecords = [...morosidad, ...morosidadCond];
    console.log(`Se encontraron ${allRecords.length} registros en los PDFs.`);

    console.log("Descargando datos de Supabase...");
    const { data: inmuebles, error } = await supabase.from('inmuebles').select('*');
    if (error) {
        console.error("Error fetching inmuebles:", error);
        return;
    }

    // Fetch tcmmv (from bcv) - we can just use 1 for now if we just compare
    // But actually, we don't need to calculate if we just want to know if they exist.
    // The user wants "si conciden con los que estan registrados y que usuarios no estan registrados"
    // Since we don't have a live BCV endpoint in the script, we can query recibos?
    // Wait, the debt in the old system might not match the new system exactly because of the exchange rate date.
    // Let's just compare what we can.

    let report = `# Informe de Morosidad\n\n`;
    report += `Total de registros en los PDFs: ${allRecords.length}\n`;
    report += `Total de inmuebles en el nuevo sistema: ${inmuebles.length}\n\n`;

    const noRegistrados = [];
    const registrados = [];

    // format identities in DB to match PDF (remove hyphens)
    const dbIdentities = inmuebles.map(i => {
        let clean = i.identidad ? i.identidad.replace(/-/g, '') : '';
        // If the DB has V-12345678, clean is V12345678
        return { ...i, clean_id: clean };
    });

    for (const rec of allRecords) {
        // PDF has V12345678 or J123456789
        const cleanRecId = rec.identidad.replace(/-/g, '');
        
        const matchedDb = dbIdentities.filter(db => db.clean_id === cleanRecId || db.clean_id.includes(cleanRecId) || cleanRecId.includes(db.clean_id));
        
        if (matchedDb.length === 0) {
            noRegistrados.push(rec);
        } else {
            registrados.push({
                pdf: rec,
                db: matchedDb
            });
        }
    }

    report += `## Usuarios No Registrados (${noRegistrados.length})\n`;
    report += `Los siguientes contribuyentes aparecen en el PDF pero NO están en el sistema actual:\n\n`;
    noRegistrados.slice(0, 50).forEach(r => {
        report += `- **${r.identidad}**: ${r.nombre} (Deuda: ${r.deuda_bs} Bs)\n`;
    });
    if (noRegistrados.length > 50) report += `- ... y ${noRegistrados.length - 50} más.\n`;

    report += `\n## Comparación de Deudas (Registrados: ${registrados.length})\n`;
    report += `Debido a la fluctuación de la tasa BCV, las deudas en Bs pueden variar. Aquí hay una muestra de coincidencias:\n\n`;
    
    let exactMatches = 0;
    let mismatchCount = 0;

    for (let i = 0; i < registrados.length; i++) {
        const item = registrados[i];
        // Calculate DB debt. We don't have current BCV rate here, so we will just show the DB raw mmv
        const dbInm = item.db[0];
        if (i < 20) {
            report += `- **${item.pdf.identidad}** (${item.pdf.nombre}):\n`;
            report += `  - PDF: ${item.pdf.deuda_bs} Bs\n`;
            report += `  - DB (Deuda MMV): ${dbInm.deuda_mmv} | DB (Deuda Congelada Bs): ${dbInm.deuda_congelada_bs}\n`;
        }
        // we can't do exact match easily without BCV. 
    }
    
    fs.writeFileSync('morosidad_analysis.md', report);
    console.log("Análisis completado. Guardado en morosidad_analysis.md");
}

run();
