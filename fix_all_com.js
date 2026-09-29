const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

// We need to properly import ordenanzaData. 
// Since it's a TS file with `export const ordenanzaData: OrdenanzaType`, let's just strip typescript syntax manually and cleanly.
let code = fs.readFileSync('src/data/ordenanza.ts', 'utf8');

// Regex replace TS types
code = code.replace(/export const ordenanzaData: OrdenanzaType =/g, 'const ordenanzaData =');
// Remove "as any[]" which caused the error
code = code.replace(/as any\[\]/g, '');
code = code.replace(/export interface .*{[\s\S]*?}/g, '');
code += '\nmodule.exports = { ordenanzaData };';

fs.writeFileSync('ordenanza_js2.js', code);

const { ordenanzaData } = require('./ordenanza_js2.js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const allActs = [...ordenanzaData.actividadesComerciales, ...(ordenanzaData.actividadesIndustriales || [])];
  console.log(`Loaded ${allActs.length} commercial activities to check.`);
  let totalUpdated = 0;

  for (const t of allActs) {
    if (!t.factores) continue; // Skip if no factor
    
    // We will look for 3 variants: (BAJA), (MEDIA), (ALTA) based on the array
    if (Array.isArray(t.factores)) {
      const variants = [
        { suffix: '(BAJA)', val: t.factores[0] },
        { suffix: '(MEDIA)', val: t.factores[1] },
        { suffix: '(ALTA)', val: t.factores[2] },
        { suffix: '', val: t.factores[0] } // Default if no suffix
      ];
      
      for (const v of variants) {
        if (v.val === undefined || v.val === null) continue;
        const searchName = v.suffix ? `${t.label} ${v.suffix}` : t.label;
        
        const { data: updated, error } = await supabase
          .from('inmuebles')
          .update({ mmv_mes: v.val })
          .ilike('actividad_principal', searchName)
          .neq('mmv_mes', v.val)
          .select('id');
          
        if (updated && updated.length > 0) {
          console.log(`Updated "${searchName}" to ${v.val}:`, updated.length);
          totalUpdated += updated.length;
        }
      }
    } else if (typeof t.factores === 'number') {
      const { data: updated, error } = await supabase
        .from('inmuebles')
        .update({ mmv_mes: t.factores })
        .ilike('actividad_principal', t.label)
        .neq('mmv_mes', t.factores)
        .select('id');
        
      if (updated && updated.length > 0) {
        console.log(`Updated EXACT MATCH "${t.label}" to ${t.factores}:`, updated.length);
        totalUpdated += updated.length;
      }
    }
  }
  
  console.log(`FINISHED. Total commercial updated: ${totalUpdated}`);
}
check();
