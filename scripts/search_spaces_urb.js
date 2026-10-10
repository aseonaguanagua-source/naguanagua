import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: i1 } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente').ilike('inmueble', '%URB007034%');
    console.log("All matching URB007034:", i1);
}
main();
