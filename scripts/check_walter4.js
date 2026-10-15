import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: c1 } = await supabase.from('contribuyentes').select('id, identidad, nombre, estado').in('identidad', ['J-404895930', 'V-84584244', 'J-845842445']);
    console.log("Contribuyentes:", c1);

    const { data: i1 } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado').in('identidad', ['J-404895930', 'V-84584244', 'J-845842445']);
    console.log("Inmuebles:", i1);
}
main();
