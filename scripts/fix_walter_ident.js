require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await sb.from('inmuebles').update({
    identidad: 'E-84584244',
    contribuyente: 'WALTER AMACA ARQQUE'
  }).ilike('identidad', '%84584244%');
  
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Walter's identity updated successfully to E-84584244!");
  }
}
run();
