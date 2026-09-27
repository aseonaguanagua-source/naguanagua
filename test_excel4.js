const fs = require('fs');
const xlsx = require('xlsx');

const file = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Record de deudas - 20260924180506.xlsx';
const wb = xlsx.readFile(file);
const ws = wb.Sheets['Record de deudas'];
const data = xlsx.utils.sheet_to_json(ws, { raw: false, header: 1 });

let row = data.find(r => r.join(' ').includes('19109082'));
console.log('Row 19109082:', row);
