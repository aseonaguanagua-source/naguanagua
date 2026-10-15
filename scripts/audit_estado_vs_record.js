require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const wb = XLSX.readFile('/Users/davidzara/Documents/naguanagua_zero/documentos/Record de deudas - 20261004174131.xlsx');
  const d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const rec = new Map(d.filter(r => r['Código']).map(r => [String(r['Código']).trim().toUpperCase(), r]));
  let inms = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('inmuebles').select('id,inmueble,identidad,contribuyente,estado,meses_deuda,es_condominio').range(from, from + 999);
    if (error) throw error;
    inms = inms.concat(data); if (data.length < 1000) break; from += 1000;
  }
  const stat = { enRecord: rec.size, enDB: inms.length, recordInactivo: 0, recordEliminado: 0, recordActivo: 0, noEnRecordActivo: 0, recordNoEnDB: 0 };
  const inactivos = [];
  const dbCodes = new Set();
  for (const i of inms) {
    const c = String(i.inmueble || '').trim().toUpperCase(); dbCodes.add(c);
    const r = rec.get(c);
    if (r) {
      if (i.estado === 'Activo') stat.recordActivo++;
      else if (i.estado === 'Eliminado') stat.recordEliminado++;
      else { stat.recordInactivo++; inactivos.push({ inmueble: c, estado: i.estado, identidad: i.identidad, nombre: i.contribuyente, recDoc: r.Documento, recNombre: r['Nombre / Razón Social'], recMeses: r['Meses pendientes'], dbMeses: i.meses_deuda }); }
    } else if (i.estado === 'Activo') stat.noEnRecordActivo++;
  }
  for (const c of rec.keys()) if (!dbCodes.has(c)) stat.recordNoEnDB++;
  console.log(stat);
  const conMeses = inactivos.filter(x => Number(x.recMeses) > 0).length;
  console.log('Inactivos en DB que están en Record:', inactivos.length, ' (con meses pendientes en record:', conMeses, ')');
  inactivos.slice(0, 25).forEach(x => console.log(JSON.stringify(x)));
  fs.writeFileSync('record_inactivos.json', JSON.stringify(inactivos, null, 2));
})();
