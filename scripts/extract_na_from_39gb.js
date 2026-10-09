const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/sigyr_prod_20260826.sql';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

async function processDump() {
  const { data: naUsers, error } = await sb.from('inmuebles')
    .select('identidad, contribuyente, inmueble, actividad_principal')
    .or("actividad_principal.eq.N/A,actividad_principal.eq.")
    .or("tipo.ilike.%COMERCIAL%")
    .neq('estado', 'Eliminado');
    
  if (error) { console.log('Error fetching NA users:', error); return; }
  console.log(`Found ${naUsers.length} active commercial units with N/A activity in NEW DB.`);

  const targetIds = new Set(naUsers.map(u => {
    let doc = u.identidad || '';
    if (doc.startsWith('V') || doc.startsWith('J') || doc.startsWith('E') || doc.startsWith('G')) {
      doc = doc.replace(/[-]/g, '').substring(1);
    }
    return doc;
  }));

  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentTable = null;
  let users = {}; // id -> document
  let properties = {}; // user_id -> economic_activity_id
  let economicActivities = {}; // id -> name
  let countUsers = 0, countProps = 0, countActs = 0;

  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.([^\s]+)/);
      if (match) {
        currentTable = match[1];
        if (currentTable === 'users' || currentTable === 'properties' || currentTable === 'economic_activities') {
          console.log('Reading table:', currentTable);
        }
      }
      continue;
    }

    if (line === '\\.') {
      currentTable = null;
      continue;
    }

    if (currentTable === 'users') {
      const cols = line.split('\t');
      if (cols.length > 9) {
        const id = cols[0];
        let doc = cols[9] || '';
        if (doc.startsWith('V') || doc.startsWith('J') || doc.startsWith('E') || doc.startsWith('G')) {
          doc = doc.replace(/[-]/g, '').substring(1);
        }
        if (targetIds.has(doc)) {
          users[id] = doc;
          countUsers++;
        }
      }
    } else if (currentTable === 'properties') {
      const cols = line.split('\t');
      if (cols.length > 4) {
        const userId = cols[1];
        const actId = cols[4];
        if (actId !== '\\N' && actId !== '0') {
           if (!properties[userId]) properties[userId] = [];
           properties[userId].push(actId);
           countProps++;
        }
      }
    } else if (currentTable === 'economic_activities') {
      const cols = line.split('\t');
      if (cols.length > 1) {
        const id = cols[0];
        const name = cols[1];
        economicActivities[id] = name;
        countActs++;
      }
    }
  }

  console.log(`Finished. Users: ${countUsers}, Props: ${countProps}, Acts: ${countActs}`);
  
  const results = [];
  for (const u of naUsers) {
    let doc = u.identidad || '';
    if (doc.startsWith('V') || doc.startsWith('J') || doc.startsWith('E') || doc.startsWith('G')) {
      doc = doc.replace(/[-]/g, '').substring(1);
    }
    
    const userIds = Object.keys(users).filter(k => users[k] === doc);
    let acts = [];
    for (const uid of userIds) {
      if (properties[uid]) {
         for (const actId of properties[uid]) {
           acts.push(economicActivities[actId] || actId);
         }
      }
    }
    const oldAct = acts.length > 0 ? acts.join(' | ') : 'NOT FOUND IN 39GB DUMP';
    results.push({ ...u, old_activity: oldAct });
  }

  fs.writeFileSync('scripts/na_commercial_mapped_39gb.json', JSON.stringify(results, null, 2));
  const found = results.filter(r => !r.old_activity.includes('NOT FOUND')).length;
  console.log(`Matched ${found} activities out of ${results.length}.`);
}

processDump().catch(console.error);
