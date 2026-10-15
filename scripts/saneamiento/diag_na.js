// Diagnóstico de contenedores N/A: ¿tienen hijos? ¿tienen tarifa/deuda propia? (solo lectura)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function all(q) {
  const out = []; let from = 0;
  for (;;) { const { data, error } = await q().range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const inms = await all(() => sb.from('inmuebles').select('inmueble,identidad,actividad_principal,estado,meses_deuda,mmv_mes,deuda_mmv,multa_bs,cant_inmuebles,padre_id,condominio_padre_id,es_condominio').neq('estado', 'Eliminado').order('inmueble'));
  const hijosDe = {};
  for (const i of inms) for (const p of [i.padre_id, i.condominio_padre_id]) if (p) (hijosDe[p] ||= []).push(i);
  const na = inms.filter(i => String(i.actividad_principal || '').trim().toUpperCase() === 'N/A' && i.estado === 'Activo');
  const r = { totalNA: na.length, conHijos: 0, sinHijos: 0, sinHijos_conMeses: 0, sinHijos_conMMV: 0, conHijos_conMeses: 0, conHijos_conMMV: 0, conHijos_cant0: 0, esCondo: 0 };
  const ejemplosSinHijos = [];
  for (const i of na) {
    const h = (hijosDe[i.inmueble] || []).filter(x => x.estado !== 'Eliminado');
    if (i.es_condominio) r.esCondo++;
    if (h.length) {
      r.conHijos++;
      if ((+i.meses_deuda || 0) > 0) r.conHijos_conMeses++;
      if ((+i.mmv_mes || 0) > 0) r.conHijos_conMMV++;
      if (!(+i.cant_inmuebles > 0)) r.conHijos_cant0++;
    } else {
      r.sinHijos++;
      if ((+i.meses_deuda || 0) > 0) r.sinHijos_conMeses++;
      if ((+i.mmv_mes || 0) > 0) r.sinHijos_conMMV++;
      if (ejemplosSinHijos.length < 15) ejemplosSinHijos.push(`${i.inmueble} ${i.identidad} meses=${i.meses_deuda} mmv=${i.mmv_mes} cant=${i.cant_inmuebles}`);
    }
  }
  console.log(r); console.log(ejemplosSinHijos.join('\n'));
  // hijos con dueño distinto al N/A
  let hijosOtroDueno = 0;
  const sp = s => String(s || '').replace(/^[VEJPG]-?/i, '').replace(/^0+/, '');
  for (const i of na) for (const h of (hijosDe[i.inmueble] || [])) if (sp(h.identidad) !== sp(i.identidad)) hijosOtroDueno++;
  console.log('hijos de N/A con otro dueño:', hijosOtroDueno);
})();
