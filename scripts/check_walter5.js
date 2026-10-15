import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: c1 } = await supabase.from('contribuyentes').select('*').ilike('nombre', '%WALTER AMANCA%');
    console.log("Contribuyentes WALTER AMANCA:", c1);

    const { data: c2 } = await supabase.from('contribuyentes').select('*').ilike('nombre', '%JRR CARYE%');
    console.log("Contribuyentes JRR CARYE:", c2);
}
main();
