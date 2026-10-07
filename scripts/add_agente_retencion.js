const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addColumn() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE condominio_unidades ADD COLUMN IF NOT EXISTS agente_retencion BOOLEAN NOT NULL DEFAULT false;'
  });
  if (error) {
    console.error("RPC failed, trying query directly...", error);
    // Maybe RPC doesn't exist. We can't easily alter table without psql or RPC.
    // Let's create an RPC or execute SQL via postgres driver if needed.
  } else {
    console.log("Column added successfully.");
  }
}
addColumn();
