const fs = require('fs');
const readline = require('readline');
const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/sigyr_prod_20260826.sql';
const targetsPath = 'scripts/na_commercial_mapped.json';
const naUsers = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));

// We want to find the children of the properties that belong to the targeted taxpayers.
// To do this simply, we will first extract ALL properties and users.
async function extract() {
  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let currentTable = null;
  let users = {}; // doc -> id
  let properties = {}; // id -> { user_id, act_id, parent_id, urb_code }
  let economicActivities = {}; // id -> name

  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.([^\s]+)/);
      if (match) currentTable = match[1];
      continue;
    }
    if (line === '\\.') { currentTable = null; continue; }

    if (currentTable === 'users') {
      const cols = line.split('\t');
      if (cols.length > 9) {
        const id = cols[0];
        let doc = cols[9] || '';
        if (doc.startsWith('V') || doc.startsWith('J') || doc.startsWith('E') || doc.startsWith('G')) {
          doc = doc.replace(/[-]/g, '').substring(1);
        }
        users[doc] = id;
      }
    } else if (currentTable === 'properties') {
      // 0: id, 1: user_id, 4: economic_activity_id, 10: urbaser_code, 22: property_id (parent)
      const cols = line.split('\t');
      if (cols.length >= 23) {
        const id = cols[0];
        const userId = cols[1];
        const actId = cols[4];
        const urbCode = cols[10];
        const parentId = cols[22];
        properties[id] = { userId, actId, parentId, urbCode };
      }
    } else if (currentTable === 'economic_activities') {
      const cols = line.split('\t');
      if (cols.length > 1) economicActivities[cols[0]] = cols[1];
    }
  }

  // Now let's analyze the 522 targets
  let parentsFound = 0;
  let childrenFound = 0;
  for (const u of naUsers) {
    let doc = u.identidad || '';
    if (doc.startsWith('V') || doc.startsWith('J') || doc.startsWith('E') || doc.startsWith('G')) doc = doc.replace(/[-]/g, '').substring(1);
    
    const userId = users[doc];
    if (userId) {
       // Find their properties
       const userProps = Object.keys(properties).filter(k => properties[k].userId === userId);
       // Check if any of these properties are parents (other properties point to them)
       let isParent = false;
       for (const pid of userProps) {
         const children = Object.keys(properties).filter(k => properties[k].parentId === pid);
         if (children.length > 0) {
            isParent = true;
            childrenFound += children.length;
            // Let's print the first one we find
            if (parentsFound === 0) {
               console.log(`\nExample Parent: ${u.contribuyente} (${doc})`);
               console.log(`Parent Prop ID: ${pid} - urbCode: ${properties[pid].urbCode} - actId: ${properties[pid].actId}`);
               console.log(`Children:`);
               for (const cid of children) {
                  console.log(`  Child ID: ${cid} - actId: ${properties[cid].actId} (${economicActivities[properties[cid].actId]})`);
               }
            }
         }
       }
       if (isParent) parentsFound++;
    }
  }

  console.log(`\nFound ${parentsFound} users acting as PARENTS, with a total of ${childrenFound} children.`);
}

extract().catch(console.error);
