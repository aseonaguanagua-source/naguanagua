require('dotenv').config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('pre_registros')
    .select('*')
    .limit(1);
    
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]));
  } else {
    console.log('No data found, cannot infer schema via select');
  }
}
main();
