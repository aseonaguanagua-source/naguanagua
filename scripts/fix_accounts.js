const fs = require('fs');
const path = require('path');

const dir = './src';

function walk(directory) {
  let results = [];
  const list = fs.readdirSync(directory);
  list.forEach((file) => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const files = walk(dir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Restore Bancamiga correctly
  content = content.replace(/00000000000000000000/g, (match, offset, string) => {
    // If we can determine the context, or just replace all 20 zeros with Bancamiga first, but let's be careful.
    return '01720110711101340717'; // wait, both Banesco and Bancamiga were replaced with 20 zeros. 
  });
  
  // Actually, I can't blindly replace 20 zeros because Banesco was ALSO 20 zeros!
  // I need to use the surrounding text to replace.
});
