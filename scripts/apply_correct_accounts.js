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
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
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

  // Update Banesco values
  content = content.replace(/01340415144151031715/g, '01341089590001008636');
  content = content.replace(/0134 0415 14 4151031715/g, '0134 1089 59 0001008636');
  content = content.replace(/G-200076739/g, 'G-200086149'); // Banesco RIF
  
  // Replace "Instituto Autónomo Municipal de Ecosocialismo (IAMEC)" with "IAMEC BANESCO" where it's the titular for Banesco
  content = content.replace(/titular: 'Instituto Autónomo Municipal de Ecosocialismo \(IAMEC\)'/g, "titular: 'IAMEC BANESCO'");
  
  // Also in PDF and Emails where it says Beneficiario: IAMEC
  content = content.replace(/Beneficiario: IAMEC            \|/g, 'Beneficiario: IAMEC BANESCO    |');
  content = content.replace(/Titular: IAMEC            \|/g, 'Titular: IAMEC BANESCO    |');

  // Also in options dropdown
  content = content.replace(/Banesco \(0134\) - 01340415144151031715 \(IAMEC\)/g, 'Banesco (0134) - 01341089590001008636 (IAMEC BANESCO)');
  content = content.replace(/BANESCO - 0134 - 1715/g, 'BANESCO - 0134 - 8636');
  
  // In email text
  content = content.replace(/INST SOC MUN PARA EL AMBIENTE \(IAMEC\)/g, 'IAMEC BANESCO');

  if (original !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
