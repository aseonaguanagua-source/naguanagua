const xlsx = require('xlsx');
const path = require('path');

try {
  const filePath = path.join('/Users/davidzara/Documents/naguanagua_zero', 'DATA NAGUANAGUA.xlsx');
  const workbook = xlsx.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(firstSheet);
  
  // Find unique values for "Uso", "Tipo"
  const usos = new Set();
  const tipos = new Set();
  let hijos = 0;
  let nietos = 0;
  let condominios = 0;
  let sampleCondominio = null;
  let sampleHijo = null;
  
  data.forEach(r => {
    usos.add(r['Uso']);
    tipos.add(r['Tipo']);
    if(r['Uso'] === 'Hijo') { hijos++; sampleHijo = sampleHijo || r; }
    if(r['Uso'] === 'Nieto') nietos++;
    if(r['Uso'] === 'Condominio' || r['Tipo'] === 'Condominio') { condominios++; sampleCondominio = sampleCondominio || r; }
  });
  
  console.log("Usos únicos:", Array.from(usos));
  console.log("Tipos únicos:", Array.from(tipos));
  console.log("Condominios:", condominios);
  console.log("Hijos:", hijos);
  console.log("Nietos:", nietos);
  
  console.log("\nSample Condominio:", sampleCondominio);
  console.log("\nSample Hijo:", sampleHijo);
  
} catch (e) {
  console.error("Error reading excel:", e);
}
