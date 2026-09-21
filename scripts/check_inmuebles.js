import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('inmuebles').select('*').limit(1);
  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Data keys:", data.length > 0 ? Object.keys(data[0]) : "No data");
  }
}
check();
