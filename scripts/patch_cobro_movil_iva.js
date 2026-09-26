const fs = require('fs');
let code = fs.readFileSync('src/app/cobro-movil/page.tsx', 'utf8');

// Insert calculations
if (!code.includes('const ivaCalculado')) {
  code = code.replace(
    /const getReciboMonto =/g,
    `const isResidencialGlobal = foundUser?.Clasificacion?.toLowerCase().includes('residencial') ?? true;
  const ivaCalculado = isResidencialGlobal ? 0 : (totalSel * 0.16);
  const pagoTotalCalculado = totalSel + ivaCalculado;

  const getReciboMonto =`
  );
}

// Replace in account screen IVA line
code = code.replace(
  /<span className="text-white font-bold text-lg">Bs\. 0,00<\/span>/g,
  '<span className="text-white font-bold text-lg">Bs. {fmtBs(ivaCalculado)}</span>'
);

// Replace pago total
code = code.replace(
  /<span className="text-emerald-400 font-black text-2xl">Bs\. \{fmtBs\(totalSel\)\}<\/span>/g,
  '<span className="text-emerald-400 font-black text-2xl">Bs. {fmtBs(pagoTotalCalculado)}</span>'
);

// Pagar button
code = code.replace(
  /Pagar Bs\. \{fmtBs\(totalSel\)\} <ArrowRight/g,
  'Pagar Bs. {fmtBs(pagoTotalCalculado)} <ArrowRight'
);

// Method text
code = code.replace(
  /<strong className="text-emerald-400 text-xl">Bs\. \{fmtBs\(totalSel\)\}<\/strong>/g,
  '<strong className="text-emerald-400 text-xl">Bs. {fmtBs(pagoTotalCalculado)}</strong>'
);

// POS instruction
code = code.replace(
  /monto exacto: <strong className="text-emerald-400">Bs\. \{fmtBs\(totalSel\)\}<\/strong>/g,
  'monto exacto: <strong className="text-emerald-400">Bs. {fmtBs(pagoTotalCalculado)}</strong>'
);

// Bancamiga simulator
code = code.replace(
  /Bs\. \{fmtBs\(totalSel\)\}<\/div>\s+<div className="text-slate-500 text-sm mt-1">\{foundUser\?\.Contribuyente\}/g,
  'Bs. {fmtBs(pagoTotalCalculado)}</div>\n                <div className="text-slate-500 text-sm mt-1">{foundUser?.Contribuyente}'
);

// processPayment insert
code = code.replace(
  /identidad: foundUser\?\.Identidad, monto: totalSel,/g,
  'identidad: foundUser?.Identidad, monto: pagoTotalCalculado,'
);

// logAudit
code = code.replace(
  /monto: totalSel, metodo: method/g,
  'monto: pagoTotalCalculado, metodo: method'
);

// success screen
code = code.replace(
  /Monto Pagado<\/span>\s+<span className="text-white text-2xl font-black">Bs\. \{fmtBs\(totalSel\)\}<\/span>/g,
  'Monto Pagado</span>\n              <span className="text-white text-2xl font-black">Bs. {fmtBs(pagoTotalCalculado)}</span>'
);

fs.writeFileSync('src/app/cobro-movil/page.tsx', code);
console.log('Patched IVA successfully!');
