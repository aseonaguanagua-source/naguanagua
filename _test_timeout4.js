const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('insert_audit_log');
  const { error } = await supabase.from('audit_logs').insert([{
    action_type: 'TEST',
    user_id: null,
    user_email: 'test@test.com',
    details: {texto: 'TEST TIMEOUT'},
    category: 'SISTEMA',
    criticality: 'BAJA'
  }]);
  console.timeEnd('insert_audit_log');
  if (error) console.error(error);
}
test();
