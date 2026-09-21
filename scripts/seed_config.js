import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { ordenanzaData } = await import('../src/data/ordenanza.ts');
  
  // Create table first if not exists
  const { error: err } = await supabase.rpc('execute_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS sistema_config (
        id TEXT PRIMARY KEY,
        valor JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  });
  
  if (err && err.code !== 'PGRST202') { // ignore function not found if we don't have RPC
     console.log("RPC failed or doesn't exist, we assume table might exist or we'll get an error on upsert.");
  }

  console.log("Upserting ordenanzaData into sistema_config...");
  const { error } = await supabase
    .from('sistema_config')
    .upsert({ id: 'tarifas_ordenanza', valor: ordenanzaData }, { onConflict: 'id' });
    
  if (error) {
    console.error("Error upserting data:", error);
  } else {
    console.log("Successfully seeded ordenanzaData!");
  }
}

run().catch(console.error);
