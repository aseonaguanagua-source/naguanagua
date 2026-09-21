require('dotenv').config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('inmuebles')
    .select('id, contribuyente, identidad, created_at')
    .gte('created_at', today.toISOString());

  if (error) {
    console.error('Error fetching inmuebles:', error);
    return;
  }

  console.log(`Found ${data.length} records added today:`);
  console.log(data);
}

main();
