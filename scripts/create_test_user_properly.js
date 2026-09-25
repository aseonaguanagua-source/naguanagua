const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

(async () => {
  const id = 'JTEST10MESES';
  const nombre = 'EMPRESA 10 MESES C.A.';

  // 1. Create user
  const { error: e1 } = await supabase.from('contribuyentes').upsert({
    identidad: id,
    nombre: nombre,
    email: 'test10@comercial.com'
  }, { onConflict: 'identidad' });
  if (e1) console.error("Error contribuyentes:", e1);

  // 2. Create property
  const { error: e2 } = await supabase.from('inmuebles').insert({
    identidad: id,
    inmueble: 'URB-COM-10M',
    actividad_principal: 'VENTAS',
    deuda_mmv: 500, // 50 mmv * 10 meses
    estado: 'Activo'
  });
  if (e2) console.error("Error inmuebles:", e2);

  // 3. Create 10 invoices (one for each of the last 10 months)
  const facturas = [];
  const currentDate = new Date();
  
  for (let i = 9; i >= 0; i--) {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - i);
    
    facturas.push({
      referencia: `RECIB-${Math.floor(Math.random() * 1000000)}-${i}`,
      contribuyente: nombre,
      identidad: id,
      monto: (50 * 42.00).toFixed(2), // Assume rate is 42
      emision: d.toISOString().split('T')[0],
      vencimiento: new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      estado: 'Pendiente'
    });
  }

  const { error: e3 } = await supabase.from('facturas').insert(facturas);
  if (e3) console.error("Error facturas:", e3);

  if (!e1 && !e2 && !e3) console.log("¡Todo creado correctamente!");
})();
