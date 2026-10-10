const fs = require('fs');
const text = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
const lines = text.split('\n');

let depth = 1; 
for (let i = 3319; i <= 4663; i++) {
  const line = lines[i];
  const opens = (line.match(/<div/g) || []).length;
  const closes = (line.match(/<\/div/g) || []).length;
  depth += opens;
  depth -= closes;
  if (depth <= 0) {
    console.log(`Grid div closed early at line ${i+1}`);
    console.log(`Line content: ${line.trim()}`);
    console.log(`Current depth: ${depth}`);
    break;
  }
}
