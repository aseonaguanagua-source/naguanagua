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
  // Find a J- user
  const { data: users } = await supabase
    .from('usuarios_portal')
    .select('identidad, contribuyente, nombre')
    .like('identidad', 'J-%')
    .limit(1);

  if (users && users.length > 0) {
    const id = users[0].identidad;
    
    // Get their property
    const { data: props } = await supabase.from('inmuebles_aseo').select('inmueble').eq('identidad', id).limit(1);
    const inmueble = props && props.length > 0 ? props[0].inmueble : 'TEST-INMUEBLE-01';

    // Create a fake pending invoice
    const ref = 'TEST-COMERCIAL-' + Math.floor(Math.random()*1000);
    const { error } = await supabase.from('facturas').insert({
      identidad: id,
      inmueble: inmueble,
      mes_facturacion: '2026-09',
      referencia: ref,
      monto_bs: 1200.50,
      monto_usd: 30.00,
      estado: 'Pendiente',
      fecha_emision: new Date().toISOString(),
      fecha_vencimiento: new Date(Date.now() + 86400000*30).toISOString(),
      tasa_bcv: 40.01
    });

    if (error) console.error(error);
    else console.log(`Deuda creada exitosamente para el comercial: ${id} (${users[0].contribuyente || users[0].nombre}). Ref: ${ref} por 1200.50 Bs.`);
  } else {
    console.log("No se encontraron usuarios J-.");
  }
})();
