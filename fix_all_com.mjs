import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { ordenanzaData } from './ordenanza_es.mjs';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const allActs = [...ordenanzaData.actividadesComerciales, ...(ordenanzaData.actividadesIndustriales || [])];
  console.log(`Loaded ${allActs.length} commercial activities to check.`);
  let totalUpdated = 0;

  for (const t of allActs) {
    if (!t.factores) continue;
    
    if (Array.isArray(t.factores)) {
      const variants = [
        { suffix: '(BAJA)', val: t.factores[0] },
        { suffix: '(MEDIA)', val: t.factores[1] },
        { suffix: '(ALTA)', val: t.factores[2] },
        { suffix: '', val: t.factores[0] } 
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
