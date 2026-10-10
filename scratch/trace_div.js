const fs = require('fs');
const text = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
const lines = text.split('\n');

let depth = 0;
for (let i = 2817; i < 4668; i++) {
  const line = lines[i];
  if (line.includes('<div') && !line.includes('</div>')) {
    depth += (line.match(/<div/g) || []).length;
  }
  if (line.includes('</div') && !line.includes('<div')) {
    depth -= (line.match(/<\/div/g) || []).length;
  }
  if (line.includes('<div') && line.includes('</div>')) {
     const opened = (line.match(/<div/g) || []).length;
     const closed = (line.match(/<\/div/g) || []).length;
     depth += (opened - closed);
  }
  
  if (i >= 4660) {
    console.log(`${i+1}: [depth=${depth}] ${line.trim()}`);
  }
}
