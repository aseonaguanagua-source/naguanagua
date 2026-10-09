const fs = require('fs');
const path = require('path');
const prefix = '/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch/';

const files = fs.readdirSync(prefix);
for (const f of files) {
  if (f.endsWith('.json')) {
    try {
      const content = fs.readFileSync(path.join(prefix, f), 'utf8');
      if (content.includes('URB016119') || content.includes('SAMBIL') || content.includes('sambil')) {
        console.log("MATCH FOUND IN:", f);
      }
    } catch (e) {
      console.log("Error reading", f);
    }
  }
}
