// FASE 1A — Unificar fichas duplicadas (mismo número de cédula/RIF, mismo nombre)
// Uso: node scripts/saneamiento/01_unificar_duplicados.js            (simulación + Excel)
//      node scripts/saneamiento/01_unificar_duplicados.js --apply    (aplica)
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const TABLAS = ['inmuebles', 'condominio_unidades', 'huerfanos', 'certificados', 'facturas', 'condominios', 'pagos_reportados', 'retenciones_iva', 'documentos', 'servicios_especiales', 'convenios_pago'];
const PFX = { '1': 'V', '2': 'E', '3': 'J', '4': 'G' };
const VALIDA = /^[VEJGP]-\d{4,10}$/;
const num = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
const tokens = s => new Set(String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !['DEL', 'LAS', 'LOS', 'C.A', 'SUCESION'].includes(t)));
function similar(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return false;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  return inter / Math.min(A.size, B.size) >= 0.5;
}
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
  const sigyr = JSON.parse(fs.readFileSync('sigyr_estado_por_codigo.json', 'utf8'));
  const sigyrIdents = new Set(sigyr.map(r => `${PFX[String(parseInt(r.document_type_id))] || '?'}-${num(r.document)}`));
  const contribs = await all('contribuyentes', '*');
  const inms = await all('inmuebles', 'id,inmueble,identidad,estado');
  const inmBy = new Map();
  inms.forEach(i => { if (!inmBy.has(i.identidad)) inmBy.set(i.identidad, []); inmBy.get(i.identidad).push(i); });

  const groups = new Map();
  for (const c of contribs) {
    if (!VALIDA.test(c.identidad || '')) continue; // fichas con identidad provisional (00-URB..., AURI...) son personas distintas
    const n = num(c.identidad); if (n.length < 5) continue;
    if (!groups.has(n)) groups.set(n, []); groups.get(n).push(c);
  }
  const merges = [], revisar = [];
  for (const [n, g] of groups) {
    if (g.length < 2) continue;
    const score = c => {
      const ii = inmBy.get(c.identidad) || [];
      const enSigyr = sigyrIdents.has(`${c.identidad[0]}-${n}`) ? 1 : 0;
      return [enSigyr, ii.filter(x => x.estado === 'Activo').length, ii.length, c.identidad === `${c.identidad[0]}-${n}` ? 1 : 0, c.identidad[0] === 'V' ? 1 : 0];
    };
    const sorted = [...g].sort((a, b) => { const A = score(a), B = score(b); for (let k = 0; k < A.length; k++) if (A[k] !== B[k]) return B[k] - A[k]; return 0; });
    const canon = sorted[0];
    for (const d of sorted.slice(1)) {
      const row = { numero: n, oficial: canon.identidad, nombre_oficial: canon.nombre, duplicada: d.identidad, nombre_duplicada: d.nombre, inm_oficial: (inmBy.get(canon.identidad) || []).length, inm_duplicada: (inmBy.get(d.identidad) || []).length };
      if (similar(canon.nombre, d.nombre)) merges.push({ ...row, _canon: canon, _dup: d });
      else revisar.push({ ...row, motivo: 'Mismo número pero nombre distinto — revisar manualmente' });
    }
  }
  console.log('Grupos con mismo número:', [...groups.values()].filter(g => g.length > 1).length);
  console.log('Fusiones automáticas (mismo nombre):', merges.length, '| A revisar (nombre distinto):', revisar.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(merges.map(({ _canon, _dup, ...r }) => r)), 'Fusionadas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(revisar), 'Revisar manualmente');
  const out = `../Saneamiento_Fase1A_${APPLY ? 'APLICADA' : 'SIMULACION'}.xlsx`;
  XLSX.writeFile(wb, out); console.log('Excel:', out);
  if (!APPLY) return;

  let ok = 0;
  for (const m of merges) {
    const from = m._dup.identidad, to = m._canon.identidad;
    for (const t of TABLAS) {
      const { error } = await sb.from(t).update({ identidad: to }).eq('identidad', from);
      if (error && !/column/i.test(error.message)) console.log('  err', t, from, error.message);
    }
    // completar datos de contacto faltantes de la ficha oficial
    const patch = {};
    for (const k of ['email', 'telefono', 'direccion', 'observaciones', 'clave_portal', 'password']) {
      const cv = m._canon[k], dv = m._dup[k];
      const vacio = v => !v || ['N/A', '0000000', 'Restaurado desde Excel'].includes(String(v).trim());
      if (vacio(cv) && !vacio(dv)) patch[k] = dv;
    }
    if (Object.keys(patch).length) await sb.from('contribuyentes').update(patch).eq('id', m._canon.id);
    const { error: e2 } = await sb.from('contribuyentes').delete().eq('id', m._dup.id);
    if (e2) console.log('  err borrar', from, e2.message); else ok++;
  }
  console.log('Fusionadas:', ok);
})();
