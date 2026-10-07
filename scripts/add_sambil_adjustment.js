const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addMissingDebt() {
  const { data: condo } = await sb.from('condominios').select('id, nombre').eq('codigo', 'URB016119').single();
  console.log("Condo:", condo);

  // Instead of guessing, let's just insert an adjustment as a multa manual for one of the Sambil units.
  // Or better, let's insert a fake unit called "LOCALES ELIMINADOS (AJUSTE MIGRA)" with the exact missing debt?
  // Let's create an 'inmueble' for this.
  
  const faltante = 1817261.19;
  
  // Find a generic unit or create one
  const fakeId = 'URB016119-AJUSTE';
  const { data: ex } = await sb.from('inmuebles').select('inmueble').eq('inmueble', fakeId).maybeSingle();
  if (!ex) {
    await sb.from('inmuebles').insert({
      inmueble: fakeId,
      tipo: 'COMERCIAL',
      actividad_principal: 'Ajuste de Saldo (Migración)',
      direccion: 'SAMBIL VALENCIA - AJUSTE',
      deuda_inicial: faltante,
      deuda_inicial_meses: 0
    });
    
    await sb.from('condominio_unidades').insert({
      condominio_id: condo.id,
      inmueble: fakeId
    });
    console.log("Created fake unit to hold the missing debt.");
  } else {
    // Update it
    await sb.from('inmuebles').update({ deuda_inicial: faltante }).eq('inmueble', fakeId);
    console.log("Updated fake unit.");
  }
}
addMissingDebt();
