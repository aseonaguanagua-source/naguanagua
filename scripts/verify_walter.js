const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: i1 } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado').ilike('inmueble', '%URB001833%');
    console.log("Inmuebles URB001833:", i1);

    const { data: c1 } = await supabase.from('contribuyentes').select('id, identidad, nombre').eq('identidad', i1[0].identidad);
    console.log("Contribuyente assigned:", c1);
}
run();
