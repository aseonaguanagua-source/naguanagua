const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const multa = baseUnMes * (esRes ? 0.10 : 0.12);
                    const totalUnMes = baseUnMes + iva + multa;
                      return sum + (totalUnMes * meses);`;

const replace1 = `                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const multaMes = baseUnMes * (esRes ? 0.10 : 0.12);
                      const mesesConMulta = Math.max(0, meses - 1);
                      return sum + ( (baseUnMes + iva) * meses ) + (multaMes * mesesConMulta);`;

const target2 = `                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const multa = baseUnMes * (esRes ? 0.10 : 0.12);
                    const totalUnMes = baseUnMes + iva + multa;
                      return sum + (totalUnMes * cantMeses);`;

const replace2 = `                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const multaMes = baseUnMes * (esRes ? 0.10 : 0.12);
                      const mesesConMulta = Math.max(0, cantMeses - 1);
                      return sum + ( (baseUnMes + iva) * cantMeses ) + (multaMes * mesesConMulta);`;

let changed = false;
if (content.includes(target1)) {
  content = content.replace(target1, replace1);
  changed = true;
} else { console.log('Target 1 not found'); }

if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  changed = true;
} else { console.log('Target 2 not found'); }

if(changed) fs.writeFileSync(file, content);
console.log('Done script');
