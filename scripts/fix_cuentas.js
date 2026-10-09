const fs = require('fs');
const path = './src/lib/cuentasBancarias.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace IAMEC references
code = code.replace(/IAMEC BANCAMIGA/g, 'CUENTA RECAUDADORA BANCAMIGA');
code = code.replace(/Instituto Autónomo Municipal de Ecosocialismo \(IAMEC\)/g, 'CUENTA RECAUDADORA BANESCO');
code = code.replace(/01720110711101340717/g, '0172----------------');
code = code.replace(/01340415144151031715/g, '0134----------------');
code = code.replace(/G-200086149/g, 'G-000000000');
code = code.replace(/G-200076739/g, 'G-000000000');

fs.writeFileSync(path, code);
