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
  // Find a commercial user
  const { data: userProps } = await supabase
    .from('inmuebles_aseo')
    .select('identidad, inmueble, tipo, clasificacion')
    .or('tipo.ilike.%comercial%,clasificacion.ilike.%comercial%')
    .limit(1);

  if (userProps && userProps.length > 0) {
    const id = userProps[0].identidad;
    const { data: userData } = await supabase.from('usuarios_portal').select('nombre, contribuyente').eq('identidad', id).single();
    
    // Create a fake pending invoice
    const ref = 'TEST-COMERCIAL-' + Math.floor(Math.random()*1000);
    const { error } = await supabase.from('facturas').insert({
      identidad: id,
      inmueble: userProps[0].inmueble,
      mes_facturacion: '2026-09',
      referencia: ref,
      monto_bs: 500.50,
      monto_usd: 12.50,
      estado: 'Pendiente',
      fecha_emision: new Date().toISOString(),
      fecha_vencimiento: new Date(Date.now() + 86400000*30).toISOString(),
      tasa_bcv: 40.04
    });

    if (error) console.error(error);
    else console.log(`Deuda creada exitosamente para el comercial: ${id} (${userData?.contribuyente || userData?.nombre}). Ref: ${ref} por 500.50 Bs.`);
  } else {
    console.log("No se encontraron comerciales.");
  }
})();
