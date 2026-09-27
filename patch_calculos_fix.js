const fs = require('fs');
let c = fs.readFileSync('src/lib/calculos.ts', 'utf8');

c = c.replace(/const ucdTotal = fo \* 57 \* tasaBCV;\n  const baseCalculada = esRes \? ucdTotal \* far : ucdTotal \* 0\.1280;/, `  // Residencial: F.O. * 57 * TasaBCV * FAR
  // Comercial:   F.O. * TasaBCV * 0.1280 (1 UCD = 1 EURO = TasaBCV)
  let baseCalculada = 0;
  if (esRes) {
    baseCalculada = fo * 57 * tasaBCV * far;
  } else {
    baseCalculada = fo * tasaBCV * 0.1280;
  }`);

fs.writeFileSync('src/lib/calculos.ts', c);
