import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: f1, error: e1 } = await supabase.from('facturas').select('*').eq('inmueble', 'URB007034');
    console.log("Facturas:", f1, e1);

    const { data: f2, error: e2 } = await supabase.from('facturas').select('*').ilike('referencia', '%URB007034%');
    console.log("Facturas Ref:", f2, e2);
}
main();
