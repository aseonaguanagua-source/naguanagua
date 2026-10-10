const fs = require('fs');
const text = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
const lines = text.split('\n');

let depth = 1; 
for (let i = 3318; i <= 4664; i++) {
  const line = lines[i];
  // ignore parens in string literals or comments to be more accurate?
  // No, just a simple count first
  for (let c of line) {
     if (c === '(') depth++;
     if (c === ')') depth--;
  }
  if (depth === 0) {
    console.log(`Paren closed at line ${i+1}`);
    console.log(lines.slice(i-2, i+3).join('\n'));
    break;
  }
}
