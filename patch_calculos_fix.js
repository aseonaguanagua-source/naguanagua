const fs = require('fs');
let c = fs.readFileSync('src/lib/calculos.ts', 'utf8');

c = c.replace(/  let baseCalculada = 0;\n  if \(esRes\) \{\n    baseCalculada = fo \* 57 \* tasaBCV \* far;\n  \} else \{\n    baseCalculada = fo \* tasaBCV \* 0\.1280;\n  \}/, `  // Residencial: F.O. * 57 * TasaBCV * FAR
  // Comercial:   F.O. * 57 * TasaBCV * 0.1280
  let baseCalculada = 0;
  if (esRes) {
    baseCalculada = fo * 57 * tasaBCV * far;
  } else {
    baseCalculada = fo * 57 * tasaBCV * 0.1280;
  }`);

fs.writeFileSync('src/lib/calculos.ts', c);
