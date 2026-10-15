require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const digits = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
async function all(t, cols) {
  let out = [], from = 0;
  while (true) {
    const { data, error } = await sb.from(t).select(cols).range(from, from + 999);
    if (error) throw new Error(t + ': ' + error.message);
    out = out.concat(data); if (data.length < 1000) break; from += 1000;
  }
  return out;
}
(async () => {
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,meses_deuda,condominio_padre_id,es_condominio,created_at');
  const contribs = await all('contribuyentes', 'id,identidad,nombre,created_at');
  console.log('inmuebles', inms.length, 'contribuyentes', contribs.length);

  // 1. Códigos repetidos en inmuebles
  const byCode = new Map();
  inms.forEach(i => { const c = String(i.inmueble || '').trim().toUpperCase(); if (!byCode.has(c)) byCode.set(c, []); byCode.get(c).push(i); });
  const dupCodes = [...byCode.entries()].filter(([, v]) => v.length > 1);
  const combos = {};
  dupCodes.forEach(([, v]) => { const k = v.map(x => x.estado).sort().join('+') + (new Set(v.map(x => digits(x.identidad))).size > 1 ? ' (dueños distintos)' : ' (mismo dueño)'); combos[k] = (combos[k] || 0) + 1; });
  console.log('\n1) Códigos repetidos en inmuebles:', dupCodes.length);
  Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log('  ', n, k));
  const multiActivos = dupCodes.filter(([, v]) => v.filter(x => x.estado === 'Activo').length > 1).length;
  console.log('   códigos con MÁS DE UN registro Activo:', multiActivos);

  // 2. Contribuyentes duplicados (mismo número, distinto prefijo o repetidos)
  const byDig = new Map();
  contribs.forEach(c => { const d = digits(c.identidad); if (d.length < 5) return; if (!byDig.has(d)) byDig.set(d, []); byDig.get(d).push(c); });
  const dupContrib = [...byDig.values()].filter(v => v.length > 1);
  console.log('\n2) Grupos de contribuyentes con el mismo número de cédula/RIF:', dupContrib.length, '(registros:', dupContrib.reduce((a, v) => a + v.length, 0), ')');

  // 3. Identidades en inmuebles sin contribuyente, y contribuyentes sin inmuebles
  const contribIds = new Set(contribs.map(c => c.identidad));
  const inmIds = new Set(inms.map(i => i.identidad));
  const inmSinContrib = [...inmIds].filter(x => x && !contribIds.has(x)).length;
  const contribSinInm = contribs.filter(c => !inmIds.has(c.identidad)).length;
  console.log('\n3) Identidades en inmuebles sin ficha de contribuyente:', inmSinContrib, '| Contribuyentes sin ningún inmueble:', contribSinInm);

  // 4. Identidades con formato raro (placeholders)
  const raras = inms.filter(i => !/^[VEJGP]-\d{5,10}$/.test(String(i.identidad || ''))).length;
  console.log('4) Inmuebles con cédula/RIF en formato no válido:', raras);

  fs.writeFileSync('diag_codigos_repetidos.json', JSON.stringify(dupCodes.map(([c, v]) => ({ codigo: c, registros: v })), null, 2));
  fs.writeFileSync('diag_contrib_duplicados.json', JSON.stringify(dupContrib, null, 2));
  console.log('\nEjemplos códigos repetidos con dueños distintos:');
  dupCodes.filter(([, v]) => new Set(v.map(x => digits(x.identidad))).size > 1).slice(0, 8).forEach(([c, v]) => console.log(' ', c, v.map(x => `${x.identidad} ${x.contribuyente?.slice(0, 25)} [${x.estado}]`).join(' || ')));
})();
