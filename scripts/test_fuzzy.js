const fs = require('fs');

const ordDataStr = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts', 'utf8');
const ordJsonStr = ordDataStr.replace('export const ordenanzaData = ', '').replace(/;\s*$/, '');
let ord;
try {
  ord = eval('(' + ordJsonStr + ')');
} catch (e) {}

const activities = ord.actividadesComerciales;

function matchActivity(rawName) {
   let name = rawName.toUpperCase();
   let genIndex = -1; // 0: baja, 1: media, 2: alta
   if (name.includes('(BAJA)')) { genIndex = 0; name = name.replace('(BAJA)', '').trim(); }
   else if (name.includes('(MEDIA)')) { genIndex = 1; name = name.replace('(MEDIA)', '').trim(); }
   else if (name.includes('(ALTA)')) { genIndex = 2; name = name.replace('(ALTA)', '').trim(); }
   
   if (name.includes('DESOCUPADO')) return 0.3147;
   
   const tokens = name.replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(t => t.length > 2);
   let bestMatch = null;
   let maxScore = 0;
   
   for (const a of activities) {
      let score = 0;
      const aTokens = a.label.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(' ');
      for (const t of tokens) {
         if (aTokens.includes(t)) score++;
      }
      if (score > maxScore) {
         maxScore = score;
         bestMatch = a;
      }
   }
   
   if (bestMatch && maxScore >= Math.min(2, tokens.length)) {
      if (genIndex === -1) genIndex = 0;
      return { match: bestMatch.label, factor: bestMatch.factores[genIndex] };
   }
   return null;
}

console.log('VENTA AMB. ALIMENTOS Y BEBIDAS (MEDIA) ->', matchActivity('VENTA AMB. ALIMENTOS Y BEBIDAS (MEDIA)'));
console.log('ABASTOS (ALTA) ->', matchActivity('ABASTOS (ALTA)'));
console.log('PELUQUERIAS ->', matchActivity('PELUQUERIAS'));

