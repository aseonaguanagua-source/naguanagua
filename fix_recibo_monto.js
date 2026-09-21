const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/estado-cuenta/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// Find and replace the montoNumerico line inside handleOpenRecibo
// Line 331: let montoNumerico = parseFloat(String(row.monto || '0').replace(/[^\d.]/g, '')) || 0;
// We need to add dynamic calculation after it, using inmuebles from context and tcmmv state

const oldLine = `    let montoNumerico = parseFloat(String(row.monto || '0').replace(/[^\\d.]/g, '')) || 0;`;
const newLines = `    let montoNumerico = parseFloat(String(row.monto || '0').replace(/[^\\d.]/g, '')) || 0;

    // Calcular monto dinámico igual que Caja (CM- y RECIB-) usando tcmmv actual
    if (tcmmv && tcmmv > 0 && row.referencia) {
      // Obtener identidad de la factura
      const rowId = (row.identidad || '').replace(/-/g, '').toUpperCase();
      const userInmsForCalc = (inmuebles as any[]).filter((i: any) =>
        (i.identidad || '').replace(/-/g, '').toUpperCase() === rowId
      );
      if (userInmsForCalc.length > 0) {
        if (row.referencia.startsWith('CM-')) {
          // CM- = 1 mes: cant_inmuebles × mmv_mes × tcmmv
          let monthlyMMV = 0;
          userInmsForCalc.forEach((inm: any) => {
            const cant = parseFloat(inm.cant_inmuebles || 1);
            const mmv  = parseFloat(inm.mmv_mes || 0);
            if (mmv > 0) monthlyMMV += cant * mmv;
          });
          if (monthlyMMV > 0) montoNumerico = parseFloat((monthlyMMV * tcmmv).toFixed(2));
        } else if (row.referencia.startsWith('RECIB-')) {
          // RECIB- = deuda acumulada: deuda_mmv × tcmmv
          let totalDeudaMMV = 0;
          userInmsForCalc.forEach((inm: any) => {
            totalDeudaMMV += parseFloat(inm.deuda_mmv || 0);
          });
          if (totalDeudaMMV > 0) montoNumerico = parseFloat((totalDeudaMMV * tcmmv).toFixed(2));
        }
      }
    }`;

if (!c.includes(oldLine)) {
  console.log('❌ Target line not found exactly. Trying partial match...');
  const partial = `let montoNumerico = parseFloat(String(row.monto || '0')`;
  const idx = c.indexOf(partial);
  if (idx === -1) { console.log('❌ Cannot find montoNumerico line'); process.exit(1); }
  const lineEnd = c.indexOf('\n', idx);
  const oldFull = c.substring(idx - 4, lineEnd); // include leading spaces
  console.log('Found:', JSON.stringify(oldFull));
  process.exit(1);
}

c = c.replace(oldLine, newLines);
fs.writeFileSync(path, c);
console.log('✅ handleOpenRecibo now uses dynamic tcmmv calculation (same as Caja)');
