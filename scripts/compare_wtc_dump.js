require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const dump = fs.readFileSync('sql/2026-10-07_inmuebles_licencia_nrolocal.sql', 'utf8');
  
  // Get all children of WTC from our DB
  const { data: dbChildren } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado, mmv_mes').eq('condominio_padre_id', 'URB018483');
  
  const rifs = dbChildren.map(c => c.identidad).filter(Boolean);
  
  // Find these RIFs in the dump `users` table
  const userLines = dump.split('\n').filter(l => l.startsWith('INSERT INTO `users`'));
  const dumpUsers = {};
  
  userLines.forEach(line => {
    const match = line.match(/\((.*?)\)/g);
    if (match) {
      match.forEach(m => {
        const parts = m.substring(1, m.length - 1).split(',');
        const rif = parts[10] ? parts[10].replace(/'/g, '').trim() : null;
        const status = parts[14] ? parts[14].trim() : null;
        if (rif) dumpUsers[rif] = status;
      });
    }
  });
  
  let mismatches = 0;
  let activeInDump = 0;
  let inactiveInDump = 0;
  
  dbChildren.forEach(c => {
    const dumpStatus = dumpUsers[c.identidad];
    const dumpIsActive = dumpStatus === '1';
    const dbIsActive = c.estado === 'Activo';
    
    if (dumpStatus === '1') activeInDump++;
    else if (dumpStatus === '0') inactiveInDump++;
    
    if (dumpIsActive !== dbIsActive) {
      console.log(`Mismatch: ${c.inmueble} (${c.identidad}) - DB: ${c.estado}, Dump: ${dumpStatus}`);
      mismatches++;
    }
  });
  
  console.log('--- Resumen ---');
  console.log(`Hijos en DB: ${dbChildren.length}`);
  console.log(`Hijos activos en Dump: ${activeInDump}`);
  console.log(`Hijos inactivos en Dump: ${inactiveInDump}`);
  console.log(`Mismatches (DB vs Dump): ${mismatches}`);
  
  // Sum mmv_mes for active in Dump
  let sumActiveDump = 0;
  dbChildren.forEach(c => {
    if (dumpUsers[c.identidad] === '1') sumActiveDump += (c.mmv_mes || 0);
  });
  console.log(`Suma mmv_mes de hijos que estaban ACTIVOS en Dump: ${sumActiveDump}`);
  
}
run();
