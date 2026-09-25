const fs = require('fs');
const readline = require('readline');

async function check() {
  const userMap = new Set();
  const uStream = fs.createReadStream('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/users.ndjson', { encoding: 'utf8' });
  const uRl = readline.createInterface({ input: uStream });
  for await (const line of uRl) {
    if (!line) continue;
    userMap.add(JSON.parse(line).id);
  }
  
  const pStream = fs.createReadStream('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/properties.ndjson', { encoding: 'utf8' });
  const pRl = readline.createInterface({ input: pStream });
  
  let missing = 0;
  for await (const line of pRl) {
    if (!line) continue;
    const prop = JSON.parse(line);
    if (prop.property_id === '21000') {
       if (!userMap.has(prop.user_id)) {
          console.log('Missing user for child:', prop.urbaser_code);
          missing++;
       }
    }
  }
  console.log('Total missing users for Sambil children:', missing);
}
check();
