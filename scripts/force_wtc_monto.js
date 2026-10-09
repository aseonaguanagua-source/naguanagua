require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await supabase.from('facturas').update({ monto: 6572557.39 }).eq('referencia', 'L-004285');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Monto del WTC actualizado a Bs. 6.572.557,39.");
  }
}
run();
