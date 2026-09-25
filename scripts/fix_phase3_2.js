const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add refreshData to destructured context
content = content.replace(
  /const \{ inmuebles, convenios, contribuyentes, documentos, tcmmv \} = useAppContext\(\);/,
  'const { inmuebles, convenios, contribuyentes, documentos, tcmmv, refreshData } = useAppContext();'
);

// Find the setTimeout after payment and add refreshData call
content = content.replace(
  /setTimeout\(async \(\) => \{(\r?\n)\s*setSuccessMsg\(''\);/,
  `setTimeout(async () => {$1        setSuccessMsg('');$1        await refreshData();`
);

fs.writeFileSync(path, content, 'utf8');
console.log("✅ Fase 3.2 applied to caja/page.tsx");
