const fs = require('fs');
const glob = require('glob');
const path = require('path');

const NEW_BANKS = [
  '0105 - Banco Mercantil',
  '0102 - Banco De Venezuela',
  '0104 - Venezolano De Crédito',
  '0108 - Banco Provincial',
  '0114 - Banco Del Caribe',
  '0115 - Banco Exterior',
  '0128 - Banco Caroni',
  '0134 - Banesco',
  '0137 - Banco Sofitasa',
  '0138 - Banco Plaza',
  '0146 - Banco De La Gente Emprendedora',
  '0151 - Bfc Banco Fondo Comun',
  '0156 - 100% Banco',
  '0157 - Del Sur',
  '0163 - Banco Del Tesoro',
  '0166 - Banco Agricola De Venezuela',
  '0168 - Bancrecer',
  '0169 - R4, Banco Microfinanciero',
  '0171 - Banco Activo',
  '0174 - Banplus',
  '0191 - Banco Nacional Crédito',
  '0172 - Bancamiga',
  '0175 - Banco Digital De Los Trabajadores',
  '0177 - Banco De La FANB',
  '0178 - N58 Banco Digital'
];

const NEW_METODOS = [
  'Transferencia',
  'Depósito',
  'Punto de Venta',
  'Biopago',
  'Pago Móvil',
  'Botón de Pago',
  'TMD (Crédito de Master)',
  'TVD (Crédito de Visa)'
];

const BANK_ARRAY_STR = JSON.stringify(NEW_BANKS);
const METODOS_ARRAY_STR = JSON.stringify(NEW_METODOS);

// Replace Euro -> UCD
function patchEuro(filePath) {
  let c = fs.readFileSync(filePath, 'utf-8');
  if(c.includes('Euro') || c.includes('€')) {
    // Only target specific UI texts to avoid breaking api/variables
    c = c.replace(/Euro:/g, 'UCD:');
    c = c.replace(/TCMMV \(Euro\):/g, 'TCMMV (UCD):');
    c = c.replace(/MMV \(Euro\)/g, 'MMV (UCD)');
    // If we're in estado-cuenta/page.tsx, append the UCD definition.
    if(filePath.includes('estado-cuenta') && !c.includes('Unidad de Cuenta Dinámica')) {
      const target = `<div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500">`;
      const replacement = `
            <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-500 italic text-justify">
              <strong>UCD:</strong> Unidad de Cuenta Dinámica, entendiéndose como, el tipo de cambio de la moneda de mayor valor establecido por el Banco Central de Venezuela, calculado al momento del pago de la tasa de servicio, de acuerdo a lo publicado en las paginas oficiales. A efectos de cálculo, 1 UCD equivale al valor del Euro (€).
            </div>
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500">`;
      c = c.replace(target, replacement);
    }
    fs.writeFileSync(filePath, c, 'utf-8');
  }
}

// Replace Banks array in specific files
function patchBanksAndMethods(filePath) {
  let c = fs.readFileSync(filePath, 'utf-8');
  
  // Replace banks
  const bankRegex = /const bancos = \[.*?\];/s;
  if(bankRegex.test(c)) {
    c = c.replace(bankRegex, `const bancos = ${BANK_ARRAY_STR};`);
  } else if (c.includes('Banco de Venezuela') && c.includes('Banesco')) {
     // A bit hacky, just try to match the array definition
     const regex2 = /\['Banco de Venezuela',\s*'Banco Mercantil'.*?\]/s;
     if(regex2.test(c)) {
       c = c.replace(regex2, BANK_ARRAY_STR);
     }
  }

  // Replace methods
  const methodsRegex = /const metodosPago = \[.*?\];/s;
  if(methodsRegex.test(c)) {
    c = c.replace(methodsRegex, `const metodosPago = ${METODOS_ARRAY_STR};`);
  }

  fs.writeFileSync(filePath, c, 'utf-8');
}


glob.sync('src/**/*.tsx').forEach(f => {
  patchEuro(f);
  patchBanksAndMethods(f);
});

console.log('Patch complete.');
