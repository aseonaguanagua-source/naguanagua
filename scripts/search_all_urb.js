import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== SEARCHING FACTURAS FOR URB007034 ===");
    const { data: f1 } = await supabase.from('facturas').select('id, identidad, contribuyente, inmueble, estado').eq('inmueble', 'URB007034');
    console.log("Facturas:", f1);

    console.log("=== SEARCHING FACTURAS POR REFERENCIA URB007034 ===");
    const { data: f2 } = await supabase.from('facturas').select('id, identidad, contribuyente, inmueble, estado, referencia').ilike('referencia', '%URB007034%');
    console.log("Facturas Ref:", f2);

    console.log("=== SEARCHING PAGOS PARA URB007034 ===");
    const { data: p1 } = await supabase.from('pagos_reportados').select('id, identidad, contribuyente, cod_inmueble').eq('cod_inmueble', 'URB007034');
    console.log("Pagos:", p1);
}
main();
