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
  const facturas = [{
      referencia: `TEST-DEBUG-${Date.now()}`,
      contribuyente: 'EMPRESA 10 MESES C.A.',
      identidad: 'JTEST10MESES',
      monto: '2100.00',
      emision: `2026-09-01`,
      vencimiento: `2026-09-28`,
      estado: 'Pendiente'
  }];
  const { data, error } = await supabase.from('facturas').insert(facturas).select();
  console.log("Error:", error);
  console.log("Returned Data:", data);
})();
