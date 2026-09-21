require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function findDuplicates() {
  console.log("Fetching all facturas...");
  let allFacturas = [];
  let from = 0;
  let step = 999;
  let fetchMore = true;

  while (fetchMore) {
    const { data: chunk, error } = await supabase.from('facturas').select('*').eq('estado', 'Pendiente').range(from, from + step);
    if (error) {
      console.error(error);
      return;
    }
    if (chunk && chunk.length > 0) {
      allFacturas = [...allFacturas, ...chunk];
      from += step + 1;
    } else {
      fetchMore = false;
    }
  }

  console.log(`Fetched ${allFacturas.length} facturas pendientes.`);

  // Group by identidad + year-month of emision
  const groups = {};
  for (const f of allFacturas) {
    if (!f.identidad || !f.emision) continue;
    const date = new Date(f.emision);
    const ym = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const key = `${f.identidad}_${ym}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }

  const toDelete = [];
  const toKeep = [];

  for (const key in groups) {
    const group = groups[key];
    if (group.length > 1) {
      // Sort by created_at DESC (newest first)
      group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Keep the newest, delete the rest
      const keep = group[0];
      toKeep.push(keep);
      
      for (let i = 1; i < group.length; i++) {
        toDelete.push(group[i]);
      }
    }
  }

  console.log(`Found ${toDelete.length} duplicate facturas that should be deleted.`);
  if (toDelete.length > 0) {
    console.log("Examples of duplicates to delete:");
    toDelete.slice(0, 5).forEach(d => {
      console.log(`- ID: ${d.id}, Ref: ${d.referencia}, Monto: ${d.monto}, Identidad: ${d.identidad}`);
    });
  }
}

findDuplicates();
