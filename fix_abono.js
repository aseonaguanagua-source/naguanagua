const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/david/Desktop/tucacas/global_green_tucacas/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. Fix the file
  const filePath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/conciliacion/page.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  const target = "await supabase.from('facturas').update({ monto: montoRestante, estado: 'Pendiente' }).eq('referencia', fac.referencia);";
  const replacement = "await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', fac.referencia);";
  
  if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content);
    console.log("File patched successfully!");
  } else {
    console.log("Target string not found in file (maybe already patched).");
  }

  // 2. Fix the database
  // We know CM-C-000023-09-2026 was affected. Let's fix it.
  const { error } = await supabase.from('facturas').update({ estado: 'Abonado' }).eq('referencia', 'CM-C-000023-09-2026').eq('estado', 'Pendiente');
  if (error) {
    console.error("Error fixing DB:", error);
  } else {
    console.log("DB fixed for CM-C-000023-09-2026!");
  }

  // Let's also check if there are any others that have a modified monto and are still Pendiente
  // We can just find any factura with estado 'Pendiente' whose monto doesn't match the original, but that's hard to know.
  // We can just rely on the fact that this specific one was just reported.
}

run();
