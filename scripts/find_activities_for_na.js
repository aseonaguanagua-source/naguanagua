const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: naUsers, error } = await sb.from('inmuebles')
    .select('identidad, contribuyente, inmueble, actividad_principal')
    .or("actividad_principal.eq.N/A,actividad_principal.eq.")
    .or("tipo.ilike.%COMERCIAL%")
    .neq('estado', 'Eliminado');

  if (error) { console.log('Error:', error); return; }
  console.log(`Found ${naUsers.length} active commercial units with N/A activity in NEW DB.`);

  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const propertiesMatches = sql.match(/INSERT INTO public."properties" \(([^)]+)\)\s+VALUES\s*([\s\S]*?);/i);
  const properties = {}; // inmueble (urbCode) -> actId
  if (propertiesMatches) {
    const valsString = propertiesMatches[2];
    const regex = /\((.*?)\)/g;
    let m;
    while ((m = regex.exec(valsString)) !== null) {
      const vals = m[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
      const actId = vals[4];
      let urbCode = vals[10];
      if (urbCode) urbCode = urbCode.replace(/'/g, '');
      if (urbCode) properties[urbCode] = actId;
    }
  }

  const acts = {};
  const actCsv = fs.readFileSync('scripts/economic_activities.csv', 'utf8').split('\n');
  for (const line of actCsv) {
    const parts = line.split('\t');
    if (parts.length > 2) {
      acts[parts[0]] = parts[1];
    }
  }

  const results = [];
  for (const u of naUsers) {
    const actId = properties[u.inmueble];
    if (actId && actId !== 'NULL' && actId !== '0') {
      const actName = acts[actId] || actId;
      results.push({ ...u, old_activity: actName });
    } else {
      results.push({ ...u, old_activity: 'NOT IN OLD DB / NO ACTIVITY' });
    }
  }

  const found = results.filter(r => !r.old_activity.includes('NOT IN OLD DB'));
  console.log(`Matched ${found.length} activities out of ${results.length}.`);
  fs.writeFileSync('scripts/na_commercial_mapped.json', JSON.stringify(found, null, 2));
}
run();
