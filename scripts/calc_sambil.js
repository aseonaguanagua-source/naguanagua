const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const fetch = require('node-fetch');
  const r = await fetch('http://localhost:3000/api/admin/condominios/cobrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'calcular', codigo: 'URB016119', modo: 'CONDOMINIO', usuario: 'dzara' })
  });
  const data = await r.json();
  console.log("Totales:", data.totales);
}
check();
