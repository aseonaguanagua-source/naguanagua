const fs = require('fs');
let path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace('actividadesIndustriales: [] as any[]', 'actividadesIndustriales: [] as any[],\n  serviciosEspeciales: [] as any[],\n  inspeccionesTecnicas: [] as any[],\n  vistoBueno: [] as any[],\n  serviciosExtraordinarios: [] as any[]');

fs.writeFileSync(path, c, 'utf8');
