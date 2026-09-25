const fs = require('fs');

const ordDataStr = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts', 'utf8');
const ordJsonStr = ordDataStr.replace('export const ordenanzaData = ', '').replace(/;\s*$/, '');
let ord;
try {
  ord = eval('(' + ordJsonStr + ')');
} catch (e) {
  console.log('Eval error:', e);
}

const activities = ord.actividadesComerciales;

function matchActivity(rawName) {
   let name = rawName.toUpperCase();
   let genIndex = -1; // 0: baja, 1: media, 2: alta
   if (name.includes('(BAJA)')) { genIndex = 0; name = name.replace('(BAJA)', '').trim(); }
   else if (name.includes('(MEDIA)')) { genIndex = 1; name = name.replace('(MEDIA)', '').trim(); }
   else if (name.includes('(ALTA)')) { genIndex = 2; name = name.replace('(ALTA)', '').trim(); }
   
   if (name.includes('DESOCUPADO')) return 0.3147;
   
   // Exact match?
   let match = activities.find(a => a.label.toUpperCase() === name);
   if (!match) {
      // Try substring match?
      match = activities.find(a => a.label.toUpperCase().includes(name) || name.includes(a.label.toUpperCase()));
   }
   
   if (match) {
      if (genIndex === -1) genIndex = 0; // default to baja if missing?
      return match.factores[genIndex];
   }
   
   return null;
}

// Test with some from the dump
console.log('VENTA AMB. ALIMENTOS Y BEBIDAS (MEDIA) ->', matchActivity('VENTA AMB. ALIMENTOS Y BEBIDAS (MEDIA)'));
console.log('INMUEBLES Y LOCALES DESOCUPADOS ->', matchActivity('INMUEBLES Y LOCALES DESOCUPADOS'));

