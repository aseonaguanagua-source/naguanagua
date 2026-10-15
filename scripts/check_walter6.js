import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: i1 } = await supabase.from('inmuebles').select('*').in('identidad', ['J-404895930', 'V-84584244', 'J-845842445', 'V-8458424']).eq('estado', 'Activo');
    console.log("Active Inmuebles:", i1);

    const { data: i2 } = await supabase.from('inmuebles').select('*').ilike('contribuyente', '%WALTER AMANCA%').eq('estado', 'Activo');
    console.log("Active Inmuebles with name Walter:", i2);

    const { data: i3 } = await supabase.from('inmuebles').select('*').ilike('contribuyente', '%JRR CARYE%').eq('estado', 'Activo');
    console.log("Active Inmuebles with name JRR:", i3);
}
main();
