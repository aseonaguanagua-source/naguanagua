const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Patch 1: getReciboMonto
const target1 = `    // IMPORTANTE: usar freshInmuebles (frescos de Supabase) en vez de inmuebles del contexto React
    const sourceInms = freshInmuebles.length > 0 ? freshInmuebles : inmuebles;
    const userInms = sourceInms.filter((i: any) =>
      (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
    );`;

const replace1 = `    // IMPORTANTE: usar freshInmuebles (frescos de Supabase) en vez de inmuebles del contexto React
    const sourceInms = freshInmuebles.length > 0 ? freshInmuebles : inmuebles;
    const userInms = sourceInms.filter((i: any) => {
      const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
      if ((i.identidad || '').replace(/-/g,'').toUpperCase() === fid) return true;
      if (freshInmuebles.length > 0) return true; // Si hay freshInmuebles, ya vienen filtrados con los hijos incluidos
      return false;
    });`;

// Patch 2: The render block filter
const target2 = `                        const userInms = (inmuebles || []).filter((i: any) => {
                          if (!foundUser) return false;
                          const id = (i.identidad || '').replace(/-/g,'').toUpperCase();
                          const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
                          return id === fid;
                        });`;

const replace2 = `                        const userInms = (freshInmuebles.length > 0 ? freshInmuebles : (inmuebles || [])).filter((i: any) => {
                          if (!foundUser) return false;
                          const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
                          if ((i.identidad || '').replace(/-/g,'').toUpperCase() === fid) return true;
                          if (freshInmuebles.length > 0) return true;
                          return false;
                        });`;

if (content.includes(target1)) {
  content = content.replace(target1, replace1);
  console.log("Target 1 patched");
}
if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  console.log("Target 2 patched");
}
fs.writeFileSync(file, content);
