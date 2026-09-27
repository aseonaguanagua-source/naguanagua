const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `    // IMPORTANTE: usar freshInmuebles (frescos de Supabase) en vez de inmuebles del contexto React
    const sourceInms = freshInmuebles.length > 0 ? freshInmuebles : inmuebles;
    const userInms = sourceInms.filter((i: any) => {`;

const replacement1 = `    // IMPORTANTE: usar freshInmuebles y condominioHijos
    const sourceInms = freshInmuebles.length > 0 ? [...freshInmuebles, ...condominioHijos] : inmuebles;
    const userInms = sourceInms.filter((i: any) => {`;

const target2 = `                        const userInms = (freshInmuebles.length > 0 ? freshInmuebles : (inmuebles || [])).filter((i: any) => {`;

const replacement2 = `                        const userInms = (freshInmuebles.length > 0 ? [...freshInmuebles, ...condominioHijos] : (inmuebles || [])).filter((i: any) => {`;

if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    console.log("Success 1");
} else {
    console.log("Target 1 not found");
}

if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    console.log("Success 2");
} else {
    console.log("Target 2 not found");
}

fs.writeFileSync(file, content);
