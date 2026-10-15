require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function all(table, cols, filter) {
  let out = [], from = 0;
  while (true) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const norm = s => String(s || '').replace(/[^0-9]/g, '');
const CONDO_RX = /CONDOMINIO|RESIDENCI|CONJUNTO|EDIF|TORRE|JUNTA|ASOCIACION CIVIL|URBANIZACION|VILLAS?\b|PARQUE|CENTRO COMERCIAL|C\.?\s?C\.?\b|TOWN ?HOUSE|QUINTAS/i;

(async () => {
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,tipo,actividad_principal,es_condominio,padre_id,condominio_padre_id,cant_inmuebles');
  console.log('total inmuebles', inms.length);
  const byCode = new Map(inms.map(i => [i.inmueble, i]));
  const byId = new Map(inms.map(i => [i.id, i]));
  const kids = new Map();
  for (const i of inms) {
    for (const p of [i.padre_id, i.condominio_padre_id]) {
      if (!p) continue;
      const parent = byCode.get(p) || byId.get(p);
      if (!parent) continue;
      if (!kids.has(parent.inmueble)) kids.set(parent.inmueble, new Map());
      kids.get(parent.inmueble).set(i.inmueble, i);
    }
  }
  const sample = inms.find(i => i.padre_id || i.condominio_padre_id);
  console.log('sample child', JSON.stringify(sample));

  const condos = inms.filter(i => i.es_condominio === true);
  const rows = condos.map(p => {
    const ch = [...(kids.get(p.inmueble) || new Map()).values()].filter(c => c.estado !== 'Eliminado');
    const pid = norm(p.identidad);
    const sameOwner = ch.filter(c => norm(c.identidad) === pid).length;
    const diffOwners = new Set(ch.filter(c => norm(c.identidad) !== pid).map(c => norm(c.identidad))).size;
    const nameCondo = CONDO_RX.test(p.contribuyente || '');
    let verdict;
    if (ch.length === 0) verdict = nameCondo ? 'CONDO_SIN_HIJOS' : 'SOSPECHOSO_SIN_HIJOS';
    else if (diffOwners === 0) verdict = nameCondo ? 'REVISAR_NOMBRE_CONDO_MISMO_DUENO' : 'COMERCIO_MULTI_ACTIVIDAD';
    else verdict = 'CONDO_REAL';
    return { inmueble: p.inmueble, contribuyente: p.contribuyente, identidad: p.identidad, estado: p.estado, tipo: p.tipo, hijos: ch.length, mismo_dueno: sameOwner, otros_duenos: diffOwners, verdict };
  });
  const count = {};
  rows.forEach(r => count[r.verdict] = (count[r.verdict] || 0) + 1);
  console.log(count);
  fs.writeFileSync('condo_audit.json', JSON.stringify(rows, null, 2));
  for (const v of ['COMERCIO_MULTI_ACTIVIDAD', 'SOSPECHOSO_SIN_HIJOS', 'REVISAR_NOMBRE_CONDO_MISMO_DUENO']) {
    console.log('\n##', v);
    rows.filter(r => r.verdict === v).slice(0, 40).forEach(r => console.log(`${r.inmueble} | ${r.contribuyente} | ${r.identidad} | ${r.estado} | hijos=${r.hijos}`));
  }
})();
