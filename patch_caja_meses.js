const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `const hasDeuda = misInmuebles.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0);`;
const rep1 = `const hasDeuda = misInmuebles.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);`;

const target2 = `if (deudaMMV > 0 || congelada > 0 || multa > 0) {`;
const rep2 = `if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {`;

content = content.replace(target1, rep1).replace(target2, rep2);
fs.writeFileSync(file, content);
console.log('Patched caja/page.tsx successfully!');
