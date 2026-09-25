const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL = '';
let SUPABASE_KEY = '';
try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
  if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} catch(e) {}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  // 1. Remove test payments
  const { error: delErr } = await supabase
    .from('pagos_reportados')
    .delete()
    .eq('identidad', 'JTEST10MESES');
  console.log("1. Deleted test payments:", delErr || 'OK');
  
  // 2. Restore deuda for test
  const { error: updErr } = await supabase
    .from('inmuebles')
    .update({ deuda_mmv: 500 })
    .eq('identidad', 'JTEST10MESES');
  console.log("2. Restored deuda_mmv=500:", updErr || 'OK');

  // 3. Verify
  const { data } = await supabase.from('inmuebles').select('deuda_mmv').eq('identidad', 'JTEST10MESES');
  console.log("3. Current deuda_mmv:", data?.[0]?.deuda_mmv);
  
  const { data: pagos } = await supabase.from('pagos_reportados').select('id').eq('identidad', 'JTEST10MESES');
  console.log("4. Remaining test payments:", pagos?.length || 0);
})();
