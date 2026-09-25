const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function check() {
  const { data, error } = await supabase.from('inmuebles').select('*').or('identidad.eq.VURB016119,identidad.eq.URB016119,inmueble.ilike.URB016119').limit(1).maybeSingle();
  console.log("Fallback search for URB016119 result:", !!data);
  if (data) {
    console.log("Actividad:", data.actividad_principal || data.actividad);
  } else {
    console.log("Error:", error);
  }
}
check();
