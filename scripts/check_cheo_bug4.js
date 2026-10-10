import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== CHECKING INMUEBLES FOR V-181681256 ===");
    const { data: i1 } = await supabase.from('inmuebles').select('*').eq('identidad', 'V-181681256');
    console.log(i1);
}
main();
