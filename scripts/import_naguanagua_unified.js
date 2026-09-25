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

async function runUnifiedMigrationV2() {
  console.log("Iniciando migración unificada V2 (Por RIF)...");

  const dir = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua';
  const rootDir = '/Users/davidzara/Documents/naguanagua_zero';
  
  // Wipe tables
  console.log("Limpiando base de datos...");
  await supabase.from('facturas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('inmuebles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('contribuyentes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const contribMap = new Map(); // Key: RIF

  // 1. Read Contribuyentes - 20260921214151.xlsx (Has Correo, Tipo = Raiz/Hijo)
  console.log("Leyendo Contribuyentes - 20260921214151.xlsx...");
  try {
    const wb2 = xlsx.readFile(path.join(dir, 'Contribuyentes - 20260921214151.xlsx'));
    const data2 = xlsx.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);
    for (const row of data2) {
      if(!row['Nombre y Apellido']) continue;
      const codigo = (row['Código'] || '').toString().trim();
      const rif = (row['C.I. / RIF'] || codigo).toString().trim();
      if (!rif) continue;
      
      let tipo = row['Tipo'] === 'Raíz' ? 'Condominio' : 'Residencial'; // Default
      let isHijo = row['Tipo'] === 'Hijo';
      
      contribMap.set(rif, {
        identidad: rif,
        nombre: row['Nombre y Apellido'].toString().trim(),
        direccion: '',
        telefono: (row['Teléfono'] || '').toString(),
        email: (row['Correo'] || '').toString(),
        actividad_principal: isHijo ? '[HIJO]' : '',
        tipo: tipo,
        deuda: parseFloat(row['Deuda'] || 0),
        codigo: codigo, // will be used as inmueble code
        codigo_padre: isHijo ? codigo : '' // If hijo, it shares the parent's code
      });
    }
  } catch(e) { console.error("Error leyendo Contribuyentes", e.message); }

  // 2. Read DATA NAGUANAGUA.xlsx (Has Direccion, Actividad)
  console.log("Leyendo DATA NAGUANAGUA.xlsx para enriquecer data...");
  try {
    const wb1 = xlsx.readFile(path.join(rootDir, 'DATA NAGUANAGUA.xlsx'));
    const data1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
    for (const row of data1) {
      if(!row['Nombre / Razón Social']) continue;
      const codigo = (row['Código'] || '').toString().trim();
      const rif = (row['Documento'] || codigo).toString().trim();
      if (!rif) continue;
      
      if (contribMap.has(rif)) {
        const existing = contribMap.get(rif);
        existing.direccion = (row['Dir. fiscal'] || existing.direccion).toString();
        existing.actividad_principal = existing.actividad_principal.includes('[HIJO]') ? 
            `[HIJO] ${(row['Actividad'] || '')}` : (row['Actividad'] || '').toString();
        existing.tipo = (row['Uso'] === 'Condominio' || row['Tipo'] === 'Condominio') ? 'Condominio' : (row['Tipo'] || existing.tipo);
        if(!existing.deuda) existing.deuda = parseFloat(row['Deuda total Ves'] || 0);
      } else {
        contribMap.set(rif, {
          identidad: rif,
          nombre: row['Nombre / Razón Social'].toString().trim(),
          direccion: (row['Dir. fiscal'] || '').toString(),
          telefono: (row['Telefono'] || '').toString(),
          email: '',
          actividad_principal: (row['Actividad'] || '').toString(),
          tipo: (row['Uso'] === 'Condominio' || row['Tipo'] === 'Condominio') ? 'Condominio' : (row['Tipo'] || 'Comercial'),
          deuda: parseFloat(row['Deuda total Ves'] || 0),
          codigo: codigo,
          codigo_padre: ''
        });
      }
    }
  } catch(e) { console.error("Error leyendo DATA NAGUANAGUA", e.message); }

  console.log(`Total únicos a insertar: ${contribMap.size}`);

  const toInsertContribs = Array.from(contribMap.values()).map(c => ({
    identidad: c.identidad,
    nombre: c.nombre,
    email: c.email,
    telefono: c.telefono,
    direccion: c.direccion
  }));

  console.log(`Insertando ${toInsertContribs.length} contribuyentes...`);
  const chunkSize = 1000;
  for (let i = 0; i < toInsertContribs.length; i += chunkSize) {
    const chunk = toInsertContribs.slice(i, i + chunkSize);
    const { error } = await supabase.from('contribuyentes').upsert(chunk, { onConflict: 'identidad' });
    if(error) { console.error("Error insertando contribuyentes:", error.message); break; }
    process.stdout.write(`.` );
  }
  console.log("\nContribuyentes listos.");

  // For Inmuebles, we need unique "inmueble" code. 
  // If a child has the same "codigo" as the parent (e.g. URB020056), we must make it unique (e.g. URB020056-V11814405)
  const toInsertInmuebles = Array.from(contribMap.values()).map(c => {
    let inmuebleCode = c.codigo || c.identidad;
    if (c.codigo_padre) {
      inmuebleCode = `${c.codigo_padre}-${c.identidad}`;
      c.actividad_principal = `[HIJO_DE:${c.codigo_padre}] ${c.actividad_principal}`;
    }

    // Calcula MMV Mes base
    let mmv_mes = 0;
    // Si la ordenanza indica: F.O. * 57 * factor
    // Asumiremos F.O. = 1 de manera generalizada por ahora (o lo que venga de la BD).
    // Esto se calculará dinámicamente en el frontend/backend luego.

    return {
      inmueble: inmuebleCode, 
      identidad: c.identidad,
      tipo: c.tipo,
      actividad_principal: c.actividad_principal,
      direccion: c.direccion,
      estado: 'Activo',
      cant_inmuebles: 1,
      mmv_mes: 0, 
      saldo_favor_bs: 0,
      deuda_mmv: c.deuda > 0 ? c.deuda : 0
    };
  });

  console.log(`Insertando ${toInsertInmuebles.length} inmuebles...`);
  for (let i = 0; i < toInsertInmuebles.length; i += chunkSize) {
    const chunk = toInsertInmuebles.slice(i, i + chunkSize);
    const { error } = await supabase.from('inmuebles').upsert(chunk, { onConflict: 'inmueble' });
    if(error) { console.error("Error insertando inmuebles:", error.message); break; }
    process.stdout.write(`.` );
  }
  console.log("\nInmuebles listos.");
  
  console.log("¡Migración unificada V2 completada con éxito!");
}

runUnifiedMigrationV2();
