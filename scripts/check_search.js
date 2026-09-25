const fs = require('fs');
const content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');
console.log(content.includes('supabase.from(\'inmuebles\')'));
