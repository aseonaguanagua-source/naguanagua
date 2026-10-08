const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function alterTable() {
  const query = `
    ALTER TABLE public.condominio_unidades 
    ADD COLUMN IF NOT EXISTS telefono TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS actividades_extra JSONB DEFAULT '[]'::jsonb;
  `;
  const { data, error } = await sb.rpc('exec_sql', { sql: query });
  if (error) {
    console.error("Please run this in Supabase SQL Editor:", query);
  } else {
    console.log("Success");
  }
}
alterTable();
