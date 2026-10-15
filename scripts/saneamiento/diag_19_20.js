// Diagnóstico #19/#20 (solo lectura)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const F = 'id,inmueble,identidad,contribuyente,estado,actividad_principal,tipo,clasificacion,mmv_mes,cant_inmuebles,meses_deuda,deuda_mmv,saldo_favor_bs,padre_id,condominio_padre_id,es_condominio,agente_retencion,numero_local';
const fmt = i => `${i.inmueble} | ${i.identidad} | ${i.contribuyente} | ${i.estado} | ${i.actividad_principal} | tipo=${i.tipo} clas=${i.clasificacion} mmv=${i.mmv_mes} cant=${i.cant_inmuebles} meses=${i.meses_deuda} deuda=${i.deuda_mmv} saldo=${i.saldo_favor_bs} padre=${i.padre_id} condo=${i.condominio_padre_id} esCondo=${i.es_condominio} ret=${i.agente_retencion}`;
async function cod(c) {
  const { data, error } = await sb.from('inmuebles').select(F).ilike('inmueble', c);
  if (error) return console.log(c, error.message);
  for (const i of data) {
    console.log('  ' + fmt(i));
    const { data: h } = await sb.from('inmuebles').select(F).eq('padre_id', i.inmueble);
    (h || []).forEach(x => console.log('     hijo ' + fmt(x)));
    const { data: u } = await sb.from('condominio_unidades').select('id,condominio_id,inmueble,actividad,tarifa_mmv,es_grupo,estado,padre_unidad_id').eq('inmueble', i.inmueble);
    (u || []).forEach(x => console.log('     unidad ' + JSON.stringify(x)));
  }
  if (!data.length) console.log('  (no existe) ' + c);
}
async function nom(n) {
  const { data } = await sb.from('inmuebles').select(F).ilike('contribuyente', `%${n}%`).neq('estado', 'Eliminado').limit(40);
  console.log(`  [${n}] ${data?.length}`); (data || []).forEach(i => console.log('  ' + fmt(i)));
}
async function id(x) {
  const { data } = await sb.from('inmuebles').select(F).ilike('identidad', `%${x}%`).limit(30);
  (data || []).forEach(i => console.log('  ' + fmt(i)));
  const { data: c } = await sb.from('contribuyentes').select('identidad,nombre').ilike('identidad', `%${x}%`);
  console.log('  contribuyentes:', JSON.stringify(c));
}
(async () => {
  const a = process.argv.slice(2);
  for (const x of a) {
    console.log('\n### ' + x);
    if (/^(URB|AURI)/i.test(x)) await cod(x); else if (/^\d+$|^[VEJG]-/.test(x)) await id(x.replace(/^[VEJG]-/, '')); else await nom(x);
  }
})();
