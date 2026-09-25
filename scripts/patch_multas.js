const fs = require('fs');

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Patch handleOpenRecibo for the single fallback (row click when not pending)
  // Actually the logic we need to patch is mostly the `todasFacturas.map` part
  
  const targetMap = `conceptos = todasFacturas.map((f: any) => {`;
  const replacementMap = `conceptos = todasFacturas.flatMap((f: any) => {`;
  
  if (content.includes(targetMap)) {
    content = content.replace(targetMap, replacementMap);
  }

  const targetCalc = `                let mmv = 0;
                matchedInmuebles.forEach((inm: any) => {
                  mmv += parseFloat(inm.cant_inmuebles || 1) * parseFloat(inm.mmv_mes || 0);
                });
                if (mmv > 0) mF = parseFloat((mmv * tcmmv).toFixed(2));`;

  const replacementCalc = `                let mmv = 0;
                let multaMMV = 0;
                const isOverdue = f.vencimiento && new Date(f.vencimiento) < new Date();
                matchedInmuebles.forEach((inm: any) => {
                  const base = parseFloat(inm.cant_inmuebles || 1) * parseFloat(inm.mmv_mes || 0);
                  mmv += base;
                  if (isOverdue) {
                     const tipo = (inm.tipo || '').toLowerCase();
                     if (tipo.includes('comercial')) multaMMV += base * 0.12;
                     else multaMMV += base * 0.10;
                  }
                });
                if (mmv > 0) mF = parseFloat((mmv * tcmmv).toFixed(2));
                if (multaMMV > 0) multaAmount = parseFloat((multaMMV * tcmmv).toFixed(2));`;

  if (content.includes(targetCalc)) {
    content = content.replace(targetCalc, replacementCalc);
  }

  const targetVars = `            let mF = parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
            let descripcionBase = \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${getMesTxt(f.emision)}\`;`;

  const replacementVars = `            let mF = parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
            let descripcionBase = \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${getMesTxt(f.emision)}\`;
            let multaAmount = 0;`;

  if (content.includes(targetVars)) {
    content = content.replace(targetVars, replacementVars);
  }

  const targetReturn = `            return {
              descripcion: descripcionBase,
              precioUnit: mF,
              total: mF
            };`;

  const replacementReturn = `            const conceptsArr = [{
              descripcion: descripcionBase,
              precioUnit: mF,
              total: mF
            }];
            if (multaAmount > 0) {
              conceptsArr.push({
                descripcion: \`Recargo por Morosidad (Multa) - Mes: \${getMesTxt(f.emision)}\`,
                precioUnit: multaAmount,
                total: multaAmount
              });
            }
            return conceptsArr;`;

  if (content.includes(targetReturn)) {
    content = content.replace(targetReturn, replacementReturn);
  }

  // Also patch the portal dashboard
  fs.writeFileSync(filePath, content, 'utf-8');
}

patchFile('./src/app/(admin)/admin/estado-cuenta/page.tsx');
try {
  patchFile('./src/app/portal/(dashboard)/estado-cuenta/page.tsx');
} catch(e) {}

console.log('Patched');
