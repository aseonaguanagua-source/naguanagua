const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target2 = `                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const multa = baseUnMes * (esRes ? 0.10 : 0.12);
                    const totalUnMes = baseUnMes + iva + multa;
                                      return (totalUnMes * meses).toFixed(2);`;

const replace2 = `                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const multaMes = baseUnMes * (esRes ? 0.10 : 0.12);
                      const mesesConMulta = Math.max(0, meses - 1);
                                      return (( (baseUnMes + iva) * meses ) + (multaMes * mesesConMulta)).toFixed(2);`;

if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  fs.writeFileSync(file, content);
  console.log('Target 2 patched!');
} else {
  console.log('Target 2 not found');
}
