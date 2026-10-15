// Verificación post-saneamiento + Excel de casos que requieren decisión humana
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const num = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
async function all(t, cols) {
  let out = [], from = 0;
  while (true) { const { data, error } = await sb.from(t).select(cols).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const contribs = await all('contribuyentes', 'identidad,nombre');
  const inms = await all('inmuebles', 'inmueble,identidad,contribuyente,estado,meses_deuda,es_condominio');
  // 1. duplicados restantes
  const g = new Map(); contribs.filter(c => /^[VEJGP]-\d+$/.test(c.identidad)).forEach(c => { const n = num(c.identidad); if (!g.has(n)) g.set(n, []); g.get(n).push(c); });
  const dups = [...g.values()].filter(v => v.length > 1);
  console.log('Contribuyentes:', contribs.length, '| grupos con mismo número restantes:', dups.length);
  // 2. casos conocidos
  for (const [label, f] of [['Walter 84584244', i => num(i.identidad) === '84584244'], ['Luxor', i => num(i.identidad) === '75259912'], ['Cheo', i => num(i.identidad) === '507840433'], ['15496661', i => num(i.identidad) === '15496661']]) {
    console.log(`\n${label}:`); inms.filter(f).forEach(i => console.log(`  ${i.inmueble} ${i.identidad} ${i.estado} meses=${i.meses_deuda}${i.es_condominio ? ' [CONDO]' : ''}`));
  }
  const est = {}; inms.forEach(i => est[i.estado] = (est[i.estado] || 0) + 1); console.log('\nEstados inmuebles:', est);

  // Excel de revisión manual
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dups.map(v => ({ numero: num(v[0].identidad), fichas: v.map(c => `${c.identidad} ${c.nombre}`).join('  ||  ') }))), 'Mismo numero, otra persona');
  const idDist = JSON.parse(fs.readFileSync('identidad_distinta_sigyr.json', 'utf8'));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(idDist.map(x => ({ codigo: x.inmueble, estado: x.db_estado, identidad_aqui: x.db_ident, nombre_aqui: x.db_nombre, identidad_sigyr: x.old_ident, nombre_sigyr: x.old_nombre }))), 'Dueño distinto a SIGYR');
  const f2 = XLSX.readFile('../Saneamiento_Fase2_APLICADA.xlsx');
  ['revisar_no_facturado_en_sigyr', 'otro_dueno', 'hijo_condominio'].forEach(s => { if (f2.Sheets[s]) XLSX.utils.book_append_sheet(wb, f2.Sheets[s], ('Elim. ' + s).slice(0, 31)); });
  const f3 = XLSX.readFile('../Saneamiento_Fase3A_APLICADA.xlsx');
  XLSX.utils.book_append_sheet(wb, f3.Sheets['Omitidos (revisar)'], 'Pagos con ajuste manual');
  XLSX.writeFile(wb, '../Saneamiento_REVISAR_MANUALMENTE.xlsx');
  console.log('Excel de revisión: Saneamiento_REVISAR_MANUALMENTE.xlsx');
})();
