// FASE 1B — Restaurar fichas dañadas ("Restaurado desde Excel", N/A, 0000000) con datos de SIGYR
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const vacio = v => !v || ['N/A', '0000000', 'RESTAURADO DESDE EXCEL', ''].includes(String(v).trim().toUpperCase());
const key = id => { const m = String(id || '').match(/^([VEJGP])-0*(\d+)$/); return m ? `${m[1]}-${m[2]}` : null; };
(async () => {
  const sig = JSON.parse(fs.readFileSync('sigyr_contactos.json', 'utf8'));
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('contribuyentes').select('id,identidad,nombre,email,telefono,direccion').range(from, from + 999);
    if (error) throw error; rows = rows.concat(data); if (data.length < 1000) break; from += 1000;
  }
  const cambios = [];
  for (const c of rows) {
    if (!(vacio(c.email) || vacio(c.telefono) || vacio(c.direccion))) continue;
    const s = sig[key(c.identidad)]; if (!s) continue;
    const patch = {};
    if (vacio(c.email) && s.email) patch.email = s.email;
    if (vacio(c.telefono) && s.telefono) patch.telefono = s.telefono;
    if (vacio(c.direccion) && s.direccion) patch.direccion = s.direccion;
    if (Object.keys(patch).length) cambios.push({ id: c.id, identidad: c.identidad, nombre: c.nombre, antes_email: c.email, antes_tel: c.telefono, antes_dir: c.direccion, ...patch });
  }
  console.log('Fichas a completar con datos de SIGYR:', cambios.length);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cambios), 'Datos restaurados');
  XLSX.writeFile(wb, `../Saneamiento_Fase1B_${APPLY ? 'APLICADA' : 'SIMULACION'}.xlsx`);
  if (!APPLY) return;
  let ok = 0;
  for (const c of cambios) {
    const patch = {}; ['email', 'telefono', 'direccion'].forEach(k => { if (c[k]) patch[k] = c[k]; });
    const { error } = await sb.from('contribuyentes').update(patch).eq('id', c.id);
    if (!error) ok++;
  }
  console.log('Restauradas:', ok);
})();
