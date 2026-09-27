require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('*')
    .eq('identidad', '402346379');
  
  if (error) console.error(error);
  else console.log(data);
}
main();
