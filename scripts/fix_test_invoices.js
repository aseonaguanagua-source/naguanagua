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
  
  // Delete old receipts so they don't duplicate
  await supabase.from('facturas').delete().eq('identidad', id);

  const facturas = [];
  const currentDate = new Date();
  
  for (let i = 9; i >= 0; i--) {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - i);
    
    // Format Month as MM
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const referencia = `CM-${yyyy}-${mm}`; // Official Naguanagua Aseo format
    
    facturas.push({
      referencia: referencia,
      contribuyente: 'EMPRESA 10 MESES C.A.',
      identidad: id,
      monto: '2100.00', // 50 MMV * Tasa
      emision: `${yyyy}-${mm}-01`,
      vencimiento: `${yyyy}-${mm}-28`,
      estado: 'Pendiente'
    });
  }

  const { error } = await supabase.from('facturas').insert(facturas);
  
  // also set deuda_mmv back to 0 just in case the dummy debt triggers
  await supabase.from('inmuebles').update({ deuda_mmv: 0 }).eq('identidad', id);

  if (error) console.error("Error inserting facturas:", error);
  else console.log("Facturas desglosadas por mes (CM-YYYY-MM) generadas exitosamente.");
})();
