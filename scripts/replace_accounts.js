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

  content = content.replace(/01720110711101340717/g, '00000000000000000000');
  content = content.replace(/01340415144151031715/g, '00000000000000000000');
  content = content.replace(/01341089590001008636/g, '00000000000000000000'); // the one in screenshot
  
  content = content.replace(/IAMEC BANCAMIGA/g, 'BANCAMIGA ALCALDÍA');
  content = content.replace(/IAMEC BANESCO/g, 'BANESCO ALCALDÍA');
  
  content = content.replace(/G-200086149/g, 'G-000000000');
  content = content.replace(/G-200076739/g, 'G-000000000');

  // We should also replace the literal IAMEC in some texts? 
  // User just complained about "numero de cuenta".
  
  if (original !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
