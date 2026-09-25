const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function patch() {
  console.log('Fetching all children to find parents...');
  
  // We need to fetch all in batches because there are 28,000 children
  let parentIds = new Set();
  let hasMore = true;
  let offset = 0;
  
  while (hasMore) {
    const { data: children, error } = await supabase
      .from('inmuebles')
      .select('actividad_principal')
      .like('actividad_principal', '%[HIJO_DE:%')
      .range(offset, offset + 5000);
      
    if (error) {
      console.error(error);
      break;
    }
    
    if (children.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const child of children) {
       const match = child.actividad_principal.match(/\[HIJO_DE:(.+?)\]/);
       if (match && match[1]) {
          parentIds.add(match[1]);
       }
    }
    
    offset += children.length + 1;
    console.log(`Fetched up to ${offset} children...`);
  }
  
  const parentsArr = Array.from(parentIds);
  console.log(`Found ${parentsArr.length} unique parent identifiers.`);
  
  console.log('Fetching those parents and updating them to have [CONDOMINIO]...');
  let updatedCount = 0;
  
  // We process in batches of 50
  for (let i = 0; i < parentsArr.length; i += 50) {
     const chunk = parentsArr.slice(i, i + 50);
     const { data: parentRows, error } = await supabase
       .from('inmuebles')
       .select('id, inmueble, actividad_principal')
       .in('inmueble', chunk);
       
     if (error || !parentRows) continue;
     
     const updates = [];
     for (const p of parentRows) {
        if (!p.actividad_principal || !p.actividad_principal.includes('[CONDOMINIO]')) {
           updates.push({
              id: p.id,
              inmueble: p.inmueble,
              actividad_principal: `[CONDOMINIO] ${p.actividad_principal || ''}`
           });
        }
     }
     
     if (updates.length > 0) {
        const { error: upErr } = await supabase.from('inmuebles').upsert(updates, { onConflict: 'id' });
        if (!upErr) updatedCount += updates.length;
     }
  }
  
  console.log(`Successfully updated ${updatedCount} parents with [CONDOMINIO] flag.`);
}

patch();
