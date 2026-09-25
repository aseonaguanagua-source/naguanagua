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
  const id = 'J-TEST-10MESES';
  const nombre = 'EMPRESA 10 MESES C.A.';

  // 1. Create user
  await supabase.from('contribuyentes').upsert({
    identidad: id,
    nombre: nombre,
    email: 'test10@comercial.com'
  }, { onConflict: 'identidad' });

  // 2. Create property
  await supabase.from('inmuebles').upsert({
    id: 'f87a3b4c-test-0000-0000-10meses123',
    identidad: id,
    inmueble: 'URB-COM-10M',
    tipo: 'COMERCIAL',
    clasificacion: 'Comercial',
    actividad_principal: 'VENTAS',
    deuda_mmv: 500, // 50 mmv * 10 meses
    estado: 'Activo'
  }, { onConflict: 'id' });

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

  const { error } = await supabase.from('facturas').insert(facturas);

  if (error) console.error("Error creating facturas:", error);
  else console.log(`Usuario creado exitosamente con 10 meses de deuda: ${id} (${nombre}). Ve a Caja y búscalo.`);
})();
