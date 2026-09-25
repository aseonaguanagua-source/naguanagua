/**
 * FASE M7: Reemplazar logos de Silva con logos genéricos de Naguanagua
 */
const fs = require('fs');
const { execSync } = require('child_process');

const BASE = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src';

// Reemplazo de logos en código
const logoReplacements = [
  // En comunicados por email
  ['/logos/alcaldia.jpg', '/logos/global_rec.jpg'],
  ['/logos/isma.jpg', '/logos/basura_cero.jpg'],
  
  // En componentes de UI
  ['/images/logo_alcaldia.png', '/logos/global_rec.jpg'],
  ['/images/logo_isma.png', '/logos/basura_cero.jpg'],
  
  // Alt texts
  ['Alcaldia Municipio Naguanagua', 'Global Rec - Naguanagua'],
  ['Logo Alcaldia', 'Logo Global Rec'],
  ['Logo Instituto de Aseo', 'Logo ISMA Naguanagua'],
  ['Instituto de Aseo', 'ISMA Naguanagua'],
];

const files = execSync(`find ${BASE} -type f \\( -name "*.tsx" -o -name "*.ts" \\)`, { encoding: 'utf8' })
  .split('\n').filter(f => f.trim());

let totalChanges = 0;
const changedFiles = [];

for (const filePath of files) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
  
  let modified = content;
  let fileChanges = 0;
  
  for (const [from, to] of logoReplacements) {
    const count = (modified.split(from).length - 1);
    if (count > 0) {
      modified = modified.split(from).join(to);
      fileChanges += count;
    }
  }
  
  if (fileChanges > 0) {
    fs.writeFileSync(filePath, modified, 'utf8');
    totalChanges += fileChanges;
    changedFiles.push(`  ✅ ${filePath.replace(BASE + '/', '')} (${fileChanges} cambios)`);
  }
}

console.log('🎨 FASE M7: Logos actualizados\n');
changedFiles.forEach(f => console.log(f));
console.log(`\nTotal: ${totalChanges} reemplazos en ${changedFiles.length} archivos`);
