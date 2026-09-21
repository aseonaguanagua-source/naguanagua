const fs = require('fs');

const filePath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the TypeScript error: add explicit type annotation to locales
content = content.replace(
  '    let locales = [];\n',
  '    let locales: { id: string; numeracion: string; uso: string; estatus: string; actividad: string; nivel: string }[] = [];\n'
);

fs.writeFileSync(filePath, content);
console.log('✅ TypeScript error fixed in contribuyentes/page.tsx');
