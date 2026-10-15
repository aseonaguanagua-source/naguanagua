import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: c1 } = await supabase.from('contribuyentes').select('*').ilike('identidad', '%404895930%');
    console.log("Contribuyente J-404895930 variants:", c1);

    const { data: c2 } = await supabase.from('contribuyentes').select('*').ilike('nombre', '%WALTER AMANCA%');
    console.log("Contribuyente WALTER AMANCA:", c2);

    const { data: c3 } = await supabase.from('contribuyentes').select('*').ilike('nombre', '%CORPORACION JRR%');
    console.log("Contribuyente CORPORACION JRR:", c3);
}
main();
