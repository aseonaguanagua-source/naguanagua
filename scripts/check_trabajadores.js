import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('trabajadores').select('*').limit(1);
  if (error) {
    console.log("Error or table doesn't exist:", error.message);
  } else {
    console.log("Table exists, data:", data);
  }
}
check();
