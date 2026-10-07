const fs = require('fs');

const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
const resp = JSON.parse(fs.readFileSync(path, 'utf8'));

// The user mentioned I deleted 17 units.
// In `cruce_aplicado_detalle.json`, there are units deleted or updated.
const det = JSON.parse(fs.readFileSync('/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch/cruce_aplicado_detalle.json', 'utf8'));
// We want to find which units belong to Sambil
// Let's get Sambil's ID in condominios
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await sb.from('condominios').select('id, nombre').eq('codigo', 'URB016119').single();
  const condoId = condo.id;
  console.log("Condo ID:", condoId);
  
  // Did `corregir_eliminados.js` delete them?
  // Let's check ALL deleted units in audit from "Cruce SIGYR: corrección eliminados/desactivados"
  const { data: audit } = await sb.from('auditoria').select('*').eq('accion', 'Cruce SIGYR: corrección eliminados/desactivados').limit(1);
  if (audit.length) {
    const quitadas = audit[0].detalles.unidades_quitadas; // array of 9 units
    console.log("Quitadas (9 units):", quitadas);
  }
}
run();
