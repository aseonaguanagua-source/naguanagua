const fs = require('fs');
let content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/api/cron/billing/route.ts', 'utf8');

content = content.replace(/contribuyente:\s*inm\.contribuyente,/g, '');

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/api/cron/billing/route.ts', content);
