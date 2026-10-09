const fs = require('fs');
const content = fs.readFileSync('scripts/motor_condominios.js', 'utf8');
console.log(content.substring(0, 1000));
