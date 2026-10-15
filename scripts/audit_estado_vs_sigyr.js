require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PFX = { '1': 'V', '2': 'E', '3': 'J', '4': 'G' };
const digits = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

(async () => {
  const old = JSON.parse(fs.readFileSync('sigyr_estado_por_codigo.json', 'utf8'));
  // Por código: preferir registro no eliminado
  const byCode = new Map();
  for (const r of old) {
    const prev = byCode.get(r.urbaser_code);
    if (!prev || (prev.old_estado === 'Eliminado' && r.old_estado !== 'Eliminado')) byCode.set(r.urbaser_code, r);
  }
  let inms = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('inmuebles').select('id,inmueble,identidad,contribuyente,estado,meses_deuda,es_condominio,condominio_padre_id').range(from, from + 999);
    if (error) throw error;
    inms = inms.concat(data); if (data.length < 1000) break; from += 1000;
  }
  const cats = {};
  const list = [];
  for (const i of inms) {
    const o = byCode.get(String(i.inmueble || '').trim().toUpperCase());
    if (!o) { cats['no_en_sigyr'] = (cats['no_en_sigyr'] || 0) + 1; continue; }
    const k = `${o.old_estado}->${i.estado}`;
    cats[k] = (cats[k] || 0) + 1;
    const oldDoc = `${PFX[String(parseInt(o.document_type_id))] || '?'}-${o.document}`;
    const docMismatch = digits(o.document) !== digits(i.identidad);
    if (o.old_estado !== i.estado || docMismatch) list.push({ id: i.id, inmueble: i.inmueble, db_estado: i.estado, old_estado: o.old_estado, db_ident: i.identidad, old_ident: oldDoc, db_nombre: i.contribuyente, old_nombre: `${o.name} ${o.lastname}`.trim(), docMismatch, meses: i.meses_deuda });
  }
  console.log(cats);
  console.log('Documento distinto:', list.filter(x => x.docMismatch).length);
  fs.writeFileSync('estado_vs_sigyr.json', JSON.stringify(list, null, 2));
  console.log('\nEj. Activo en SIGYR -> Inactivo en DB:');
  list.filter(x => x.old_estado === 'Activo' && x.db_estado === 'Inactivo').slice(0, 15).forEach(x => console.log(x.inmueble, x.db_ident, x.db_nombre, 'meses', x.meses));
  console.log('\nEj. Inactivo en SIGYR -> Activo en DB:');
  list.filter(x => x.old_estado === 'Inactivo' && x.db_estado === 'Activo').slice(0, 15).forEach(x => console.log(x.inmueble, x.db_ident, x.db_nombre, 'meses', x.meses));
  console.log('\nEj. documento distinto:');
  list.filter(x => x.docMismatch).slice(0, 15).forEach(x => console.log(x.inmueble, '| DB', x.db_ident, x.db_nombre, '| SIGYR', x.old_ident, x.old_nombre));
})();
