const fs = require('fs');
const text = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
const lines = text.split('\n');

let depth = 1; // start with 1 because of the { we opened
for (let i = 3318; i <= 4664; i++) {
  const line = lines[i];
  for (let c of line) {
     if (c === '{') depth++;
     if (c === '}') depth--;
  }
  if (depth === 0) {
    console.log(`Expression closed at line ${i+1}`);
    console.log(lines.slice(i-2, i+3).join('\n'));
    break;
  }
}
