const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// The previous script already applied changes to lines after fecha_transaccion
// but missed the "const { data: pagoInsertado }" declaration on line 824.
// Fix: replace that specific line
content = content.replace(
  `const { data: pagoInsertado } = await supabase.from('pagos_reportados').insert({`,
  `const pagoId = crypto.randomUUID();\n        const { error: insertErr } = await supabase.from('pagos_reportados').insert({\n          id: pagoId,`
);

// Also fix any remaining "pagoInsertado" references
content = content.replace(
  /if \(pagoInsertado\?\.id\)/g,
  'if (pagoId)'
);
content = content.replace(
  /pagoId: pagoInsertado\.id/g,
  'pagoId: pagoId'
);

// Remove duplicate "identidad:" line that would result from the insert
// The original code had "identidad: foundUser.Identidad," right after the insert line
// Now we have "id: pagoId," followed by "identidad: foundUser.Identidad," which is correct

fs.writeFileSync(path, content, 'utf8');
console.log("✅ Fixed pagoId declaration and insertErr");
