const xlsx = require('xlsx');

function run() {
  const wb = xlsx.readFile('/Users/davidzara/Downloads/Record de deudas - 20260924180506.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const headers = data[0];
  console.log("Headers:", headers);
  
  const wtcRows = data.filter(r => {
    return r.some(cell => String(cell).includes('URB018483') || String(cell).includes('312070412'));
  });
  
  if (wtcRows.length > 0) {
    console.log("WTC found in Excel!");
    wtcRows.forEach(r => console.log(r));
  } else {
    console.log("WTC not found in Excel.");
  }
}
run();
