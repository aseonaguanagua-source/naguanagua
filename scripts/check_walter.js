import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: i1 } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado, created_at, notas').ilike('inmueble', '%URB001833%');
    console.log("Inmuebles URB001833:", i1);

    const { data: c1 } = await supabase.from('contribuyentes').select('id, identidad, nombre, estado').eq('identidad', 'J-404895930');
    console.log("Contribuyente J-404895930:", c1);
}
main();
