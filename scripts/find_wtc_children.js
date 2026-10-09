const xlsx = require('xlsx');

function run() {
  const file = '/Users/davidzara/Downloads/DATA NAGUANAGUA.xlsx';
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Condominio WTC is URB018483
  let count = 0;
  let totalMonto = 0;
  let wtcChildren = [];
  
  data.forEach((r, i) => {
    if (i === 0) return; // header
    const id = String(r[1] || '');
    const ident = String(r[2] || '');
    const nom = String(r[3] || '');
    const dir = String(r[4] || '');
    
    // Check if direction contains WORLD TRADE CENTER, W.T.C, etc
    if (dir.toUpperCase().includes('WORLD TRADE CENTER') || dir.toUpperCase().includes('W.T.C') || dir.toUpperCase().includes('WTC')) {
      if (id !== 'URB018483' && !nom.includes('HOTEL HESPERIA')) {
        count++;
        totalMonto += parseFloat(r[11]) || 0;
        wtcChildren.push({ id, nom, monto: parseFloat(r[11]) || 0 });
      }
    }
  });
  
  console.log(`Found ${count} possible WTC children.`);
  console.log(`Suma de Monto mensual: ${totalMonto.toFixed(2)}`);
  
  wtcChildren.sort((a,b) => b.monto - a.monto);
  console.log("Top 10:");
  wtcChildren.slice(0, 10).forEach(c => console.log(c));
}
run();
