const xlsx = require('xlsx');

function run() {
  const file = '/Users/davidzara/Downloads/DATA NAGUANAGUA.xlsx';
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  let sambils = [];
  data.forEach((r, i) => {
    if (i === 0) return;
    const nom = String(r[3] || '').toUpperCase();
    if (nom.includes('SAMBIL') && !nom.includes('FOT ESTUDIO')) {
      sambils.push({ id: r[1], nom, monto: r[11] });
    }
  });
  
  console.log(sambils);
}
run();
