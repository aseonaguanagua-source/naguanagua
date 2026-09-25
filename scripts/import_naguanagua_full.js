const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigration() {
  console.log("Iniciando migración corregida...");

  const dir = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua';
  const fileCondominios = path.join(dir, 'Reporte_Condominios_y_Hijos.xlsx');
  const fileContribuyentes = path.join(dir, 'Reporte_Contribuyentes.xlsx');

  // Load Condominios
  const wbCond = xlsx.readFile(fileCondominios);
  const dataCond = xlsx.utils.sheet_to_json(wbCond.Sheets[wbCond.SheetNames[0]], { header: 1 });
  
  let condominios = [];
  for(let i=1; i<dataCond.length; i++) {
     const row = dataCond[i];
     if(!row || row.length === 0) continue;
     let tipo = row[0];
     let codigo = row[1];
     let nombre = row[2];
     let rif = row[3];
     let direccion = row[4];
     
     if(codigo === '' && typeof nombre === 'string' && nombre.includes('(')) {
       codigo = nombre; 
       rif = row[3]; 
       nombre = row[4]; 
       direccion = ''; 
     }
     if(!nombre) continue;

     condominios.push({
       identidad: (rif || codigo || `C-${i}`).toString().trim(),
       nombre: nombre.toString().trim(),
       email: (row[7] || '').toString(),
       telefono: (row[6] || '').toString(),
       direccion: (direccion || '').toString(),
       _codigo_padre: (row[8] || '').toString(),
       _tipo: tipo
     });
  }

  // Load Contribuyentes
  const wbCont = xlsx.readFile(fileContribuyentes);
  // Read array of arrays to handle headers explicitly
  const dataContRaw = xlsx.utils.sheet_to_json(wbCont.Sheets[wbCont.SheetNames[0]], { header: 1 });
  
  let contribuyentes = [];
  for(let i=1; i<dataContRaw.length; i++) {
     let row = dataContRaw[i];
     if (!row || row.length < 3) continue;
     // ID: 0, Código: 1, Nombre: 2, RIF: 3, Dir: 4, Act: 5, Tel: 6, Correo: 7, Hijo: 8, Padre: 9
     let nombre = row[2];
     if (!nombre) continue;
     
     contribuyentes.push({
       identidad: (row[3] || row[1] || `U-${row[0]}`).toString().trim(),
       nombre: nombre.toString().trim(),
       email: (row[7] || '').toString(),
       telefono: (row[6] || '').toString(),
       direccion: (row[4] || '').toString(),
       _codigo_padre: (row[9] || '').toString(),
       _actividad: (row[5] || '').toString()
     });
  }

  const allContribs = [...condominios, ...contribuyentes];
  console.log(`Leidos ${condominios.length} condominios y ${contribuyentes.length} contribuyentes.`);

  const uniqueContribsMap = new Map();
  for(let c of allContribs) {
    if(!uniqueContribsMap.has(c.identidad)) {
      uniqueContribsMap.set(c.identidad, c);
    }
  }

  const toInsertContribs = Array.from(uniqueContribsMap.values()).map(c => ({
    identidad: c.identidad,
    nombre: c.nombre,
    email: c.email,
    telefono: c.telefono,
    direccion: c.direccion
  }));

  console.log(`Insertando ${toInsertContribs.length} contribuyentes únicos...`);
  const chunkSize = 1000;
  for (let i = 0; i < toInsertContribs.length; i += chunkSize) {
    const chunk = toInsertContribs.slice(i, i + chunkSize);
    const { error } = await supabase.from('contribuyentes').upsert(chunk, { onConflict: 'identidad' });
    if(error) { console.error("Error insertando contribuyentes:", error.message); break; }
    process.stdout.write(`.` );
  }
  console.log("\nContribuyentes listos.");

  const toInsertInmuebles = Array.from(uniqueContribsMap.values()).map((c, idx) => {
    let tipo = c._codigo_padre ? 'Residencial' : 'Comercial';
    if(c._tipo === 'CONDOMINIO') tipo = 'Condominio';
    
    let act = c._actividad || '';
    if (c._codigo_padre) {
      act = `[HIJO_DE:${c._codigo_padre}] ${act}`;
    }

    return {
      inmueble: c.identidad + '-' + idx, // Ensure unique inmueble if identically mapped
      identidad: c.identidad,
      tipo: tipo,
      actividad_principal: act,
      direccion: c.direccion,
      estado: 'Activo',
      cant_inmuebles: 1,
      mmv_mes: 0,
      saldo_favor_bs: 0,
      deuda_mmv: 0
    };
  });

  console.log(`Insertando ${toInsertInmuebles.length} inmuebles únicos...`);
  for (let i = 0; i < toInsertInmuebles.length; i += chunkSize) {
    const chunk = toInsertInmuebles.slice(i, i + chunkSize);
    const { error } = await supabase.from('inmuebles').upsert(chunk, { onConflict: 'inmueble' });
    if(error) { console.error("Error insertando inmuebles:", error.message); break; }
    process.stdout.write(`.` );
  }
  console.log("\nInmuebles listos.");
  
  console.log("¡Migración completada con éxito!");
}

runMigration();
