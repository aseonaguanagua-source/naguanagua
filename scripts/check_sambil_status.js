const fs = require('fs');
const readline = require('readline');
async function check() {
  const map = new Map();
  const fileStream = fs.createReadStream('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/properties.ndjson', { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
  let approved = 0;
  let other = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const prop = JSON.parse(line);
    if (prop.property_id === '21000') {
      if (prop.registration_status === 'approved') approved++;
      else other++;
    }
  }
  console.log(`Approved: ${approved}`);
  console.log(`Other: ${other}`);
}
check();
