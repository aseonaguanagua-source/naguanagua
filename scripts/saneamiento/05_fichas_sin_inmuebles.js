// FASE 1C — Fichas de contribuyente sin ningún inmueble (dueños anteriores / fichas vacías)
// Se borran SOLO si no tienen facturas, pagos, certificados, retenciones, convenios, documentos ni servicios.
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
async function all(t, cols) {
  let out = [], from = 0;
  while (true) { const { data, error } = await sb.from(t).select(cols).range(from, from + 999); if (error) throw new Error(t + error.message); out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const contribs = await all('contribuyentes', '*');
  const usadas = new Set();
  for (const t of ['inmuebles', 'condominio_unidades', 'condominios', 'huerfanos']) (await all(t, 'identidad')).forEach(r => usadas.add(r.identidad));
  const conHistorial = new Set();
  for (const t of ['facturas', 'pagos_reportados', 'certificados', 'retenciones_iva', 'documentos', 'servicios_especiales', 'convenios_pago']) (await all(t, 'identidad')).forEach(r => conHistorial.add(r.identidad));
  const sinInm = contribs.filter(c => !usadas.has(c.identidad));
  const borrar = sinInm.filter(c => !conHistorial.has(c.identidad));
  const conservar = sinInm.filter(c => conHistorial.has(c.identidad));
  console.log('Sin inmuebles:', sinInm.length, '| sin historial (se borran):', borrar.length, '| con historial (se conservan):', conservar.length);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(borrar.map(c => ({ identidad: c.identidad, nombre: c.nombre, telefono: c.telefono, email: c.email, creado: c.created_at }))), 'Borradas (vacias)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conservar.map(c => ({ identidad: c.identidad, nombre: c.nombre, creado: c.created_at }))), 'Conservadas (con historial)');
  XLSX.writeFile(wb, `../Saneamiento_Fase1C_${APPLY ? 'APLICADA' : 'SIMULACION'}.xlsx`);
  if (!APPLY) return;
  fs.writeFileSync(`../respaldos/fase1c_borradas_${Date.now()}.json`, JSON.stringify(borrar));
  const ids = borrar.map(c => c.id);
  for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from('contribuyentes').delete().in('id', ids.slice(i, i + 200)); if (error) console.log(error.message); }
  console.log('Borradas:', ids.length);
})();
