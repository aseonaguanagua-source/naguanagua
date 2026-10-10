const fs = require('fs');
const text = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
const lines = text.split('\n');

let depth = 0;
let started = false;

for (let i = 3317; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('<div')) {
    depth += (line.match(/<div/g) || []).length;
    started = true;
  }
  if (line.includes('</div')) {
    depth -= (line.match(/<\/div/g) || []).length;
  }
  
  if (started && depth === 0) {
    console.log(`Matching </div> is at line ${i + 1}`);
    console.log(lines.slice(i - 2, i + 3).join('\n'));
    break;
  }
}
