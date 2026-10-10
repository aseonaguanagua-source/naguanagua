const fs = require('fs');
const text = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
const lines = text.split('\n');

let depth = 1; // 1 because of { at 3318
for (let i = 3318; i <= 4664; i++) {
  const line = lines[i];
  
  // crude string literal removal
  const cleanLine = line.replace(/`[^`]*`/g, '').replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '').replace(/\/\/.*$/g, '');
  
  for (let c of cleanLine) {
     if (c === '{') depth++;
     if (c === '}') depth--;
  }
  if (depth === 0) {
    console.log(`Curly closed early at line ${i+1}`);
    console.log(lines.slice(i-2, i+3).join('\n'));
    break;
  }
}
