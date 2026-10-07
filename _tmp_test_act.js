const { supabase } = require('./src/lib/supabase');

async function test() {
  console.log("Checking user...");
  const { data } = await supabase.from('inmuebles').select('*').limit(1);
  console.log("Found:", data[0].inmueble, data[0].actividad_principal);
}
test().catch(console.error);
