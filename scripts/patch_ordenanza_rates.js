const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const ordDataStr = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts', 'utf8');
const ordJsonStr = ordDataStr.replace('export const ordenanzaData = ', '').replace(/;\s*$/, '');
let ord;
try {
  ord = eval('(' + ordJsonStr + ')');
} catch (e) {}
const activities = ord.actividadesComerciales;

function matchActivity(rawName) {
   if (!rawName) return 1.0; // default 1 UCD
   let name = rawName.toUpperCase();
   let genIndex = -1; // 0: baja, 1: media, 2: alta
   if (name.includes('(BAJA)')) { genIndex = 0; name = name.replace('(BAJA)', '').trim(); }
   else if (name.includes('(MEDIA)')) { genIndex = 1; name = name.replace('(MEDIA)', '').trim(); }
   else if (name.includes('(ALTA)')) { genIndex = 2; name = name.replace('(ALTA)', '').trim(); }
   
   if (name.includes('DESOCUPADO')) return 0.3147;
   
   const tokens = name.replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(t => t.length > 2);
   let bestMatch = null;
   let maxScore = 0;
   
   for (const a of activities) {
      let score = 0;
      const aTokens = a.label.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(' ');
      for (const t of tokens) {
         if (aTokens.includes(t)) score++;
      }
      if (score > maxScore) {
         maxScore = score;
         bestMatch = a;
      }
   }
   
   if (bestMatch && maxScore >= Math.min(2, tokens.length)) {
      if (genIndex === -1) genIndex = 0;
      return bestMatch.factores[genIndex] || 1.0;
   }
   return 1.0;
}

async function patch() {
  console.log('Fetching all COMERCIAL properties...');
  let offset = 0;
  let hasMore = true;
  let updatedCount = 0;
  
  while (hasMore) {
    const { data: inms, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, actividad_principal, cant_inmuebles')
      .in('tipo', ['COMERCIAL', 'INDUSTRIAL', 'INSTITUCIONAL'])
      .range(offset, offset + 5000);
      
    if (error) {
      console.error(error);
      break;
    }
    
    if (inms.length === 0) {
      hasMore = false;
      break;
    }
    
    const updates = [];
    for (const inm of inms) {
       // Only process those with 0 deuda_mmv, or all of them? The user said they are all in 0. We should process all of them to be correct!
       
       // extract the raw name without [HIJO_DE:...]
       let rawName = inm.actividad_principal || '';
       if (rawName.includes('] ')) {
          rawName = rawName.split('] ').pop();
       }
       if (rawName.includes('[CONDOMINIO]')) {
          rawName = rawName.replace('[CONDOMINIO]', '').trim();
       }
       
       let ucdFactor = matchActivity(rawName);
       if (!ucdFactor || ucdFactor === 0) ucdFactor = 1.0; // Fail-safe
       
       let cant = parseFloat(inm.cant_inmuebles) || 1;
       const newDeudaMmv = ucdFactor * cant * 57 * 2; // 2 months
       
       updates.push({
          id: inm.id,
          inmueble: inm.inmueble,
          mmv_mes: ucdFactor,
          deuda_mmv: newDeudaMmv
       });
    }
    
    if (updates.length > 0) {
      // Chunk updates
      for (let i = 0; i < updates.length; i += 500) {
         const chunk = updates.slice(i, i + 500);
         const { error: upErr } = await supabase.from('inmuebles').upsert(chunk, { onConflict: 'id' });
         if (upErr) console.error('Upsert error:', upErr);
         else updatedCount += chunk.length;
      }
    }
    
    offset += inms.length;
    console.log(`Processed ${offset} records...`);
  }
  
  console.log(`Successfully mapped and updated ${updatedCount} properties with Ordenanza rates!`);
}
patch();
