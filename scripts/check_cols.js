const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCols() {
  const { data, error } = await sb.rpc('get_columns', { table_name: 'condominio_unidades' });
  if (error) {
    // try selecting 1 row
    const res = await sb.from('condominio_unidades').select('*').limit(1);
    console.log(Object.keys(res.data[0] || {}));
  } else {
    console.log(data);
  }
}
checkCols();
