const XLSX = require('xlsx');

async function run() {
    const workbook = XLSX.readFile('/Users/davidzara/Documents/naguanagua_zero/documentos/Record de deudas - 20261004174131.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const walters = data.filter(r => JSON.stringify(r).includes('URB001833') || JSON.stringify(r).includes('URB005955'));
    console.log(walters.slice(0, 5));
}
run();
