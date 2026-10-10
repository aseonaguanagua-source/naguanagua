import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== CHECKING ALL INMUEBLES FOR V-181681256 ===");
    const { data: i1, error: e1 } = await supabase.from('inmuebles').select('*').eq('id_contribuyente', 'V-181681256');
    console.log("V-181681256 inmuebles:", i1);
    
    console.log("=== CHECKING ALL INMUEBLES FOR J-507840433 ===");
    const { data: i2, error: e2 } = await supabase.from('inmuebles').select('*').eq('id_contribuyente', 'J-507840433');
    console.log("J-507840433 inmuebles:", i2);

    console.log("=== CHECKING INMUEBLE EXACT MATCH URB007034 ===");
    const { data: i3, error: e3 } = await supabase.from('inmuebles').select('*').eq('codigo', 'URB007034');
    console.log("URB007034 inmueble by codigo:", i3, e3);
}
main();
