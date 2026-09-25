const fs = require('fs');
let content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', 'utf8');

content = content.replace(
  /if \(combined\.length === 0 && userInmuebles && userInmuebles\.length > 0\)/g,
  `const misInmuebles = inmuebles.filter((i: any) => (i.identidad || '').replace(/-/g,'').toUpperCase() === (user.Identidad || '').replace(/-/g,'').toUpperCase());
      if (combined.length === 0 && misInmuebles && misInmuebles.length > 0)`
);

content = content.replace(
  /userInmuebles\.some/g,
  `misInmuebles.some`
);

content = content.replace(
  /userInmuebles\.forEach/g,
  `misInmuebles.forEach`
);

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', content);
console.log("Dummy corregido.");
