const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, select) {
  let all = [], page = 0;
  while (true) {
    const { data } = await sb.from(table).select(select).range(page*1000, (page+1)*1000-1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

(async () => {
  // 1. Leer Excel
  const wb = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/Libro de Ventas - Desde 01-09-2026 hasta 30-09-2026.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const data = rows.slice(4).filter(r => r[1] && r[1].toString().trim()); // skip headers + empty

  // Construir mapa del Excel: RIF → { nombre, facturas, totalVentas, totalBase, totalIVA }
  const excelMap = {};
  data.forEach(r => {
    const rif = (r[1] || '').toString().trim().toUpperCase();
    if (!rif || rif === 'TOTALES:') return;
    if (!excelMap[rif]) excelMap[rif] = { nombre: r[2], facturas: 0, totalVentas: 0, totalBase: 0, totalIVA: 0, totalExento: 0 };
    excelMap[rif].facturas++;
    excelMap[rif].totalVentas += parseFloat(r[7] || 0);
    excelMap[rif].totalExento += parseFloat(r[8] || 0);
    excelMap[rif].totalBase += parseFloat(r[9] || 0);
    excelMap[rif].totalIVA += parseFloat(r[11] || 0);
  });

  const excelRifs = Object.keys(excelMap);
  console.log('=== LIBRO DE VENTAS (Excel) ===');
  console.log('Contribuyentes únicos:', excelRifs.length);
  console.log('Total facturas:', data.length);

  // 2. Cargar inmuebles del sistema
  console.log('\nCargando inmuebles del sistema...');
  const inmuebles = await fetchAll('inmuebles', 'identidad, inmueble, contribuyente, tipo, actividad_principal, mmv_mes');
  
  // Mapa sistema: RIF → inmuebles
  const sysMap = {};
  inmuebles.forEach(i => {
    const id = (i.identidad || '').trim().toUpperCase();
    if (!sysMap[id]) sysMap[id] = [];
    sysMap[id].push(i);
  });

  // 3. Comparar: RIFs del Excel que NO están en el sistema
  const noEnSistema = [];
  const enSistema = [];
  const letraIncorrecta = [];

  excelRifs.forEach(rif => {
    if (sysMap[rif]) {
      enSistema.push(rif);
    } else {
      // Intentar buscar sin letra o con otra letra
      const naked = rif.replace(/^[VJGEP]-/, '');
      const found = Object.keys(sysMap).find(k => k.replace(/^[VJGEP]-/, '') === naked);
      if (found) {
        letraIncorrecta.push({ excel: rif, sistema: found, nombre: excelMap[rif].nombre });
      } else {
        noEnSistema.push({ rif, nombre: excelMap[rif].nombre, facturas: excelMap[rif].facturas });
      }
    }
  });

  console.log('\n=== COMPARACIÓN ===');
  console.log('Coinciden exactamente:', enSistema.length, '/', excelRifs.length);
  console.log('Letra diferente (V↔J):', letraIncorrecta.length);
  console.log('NO están en el sistema:', noEnSistema.length);

  if (letraIncorrecta.length > 0) {
    console.log('\n--- LETRA INCORRECTA (Excel vs Sistema) ---');
    letraIncorrecta.slice(0, 20).forEach(l => console.log('  Excel:', l.excel, '→ Sistema:', l.sistema, '|', l.nombre));
    if (letraIncorrecta.length > 20) console.log('  ... y', letraIncorrecta.length - 20, 'más');
  }

  if (noEnSistema.length > 0) {
    console.log('\n--- NO ESTÁN EN SISTEMA (primeros 20) ---');
    noEnSistema.sort((a,b) => b.facturas - a.facturas).slice(0, 20).forEach(n => 
      console.log('  ' + n.rif + ' | ' + n.nombre + ' | ' + n.facturas + ' facturas')
    );
  }

  // 4. RIFs del sistema que NO están en el Excel (solo comerciales con actividad)
  const sysComerciales = Object.entries(sysMap).filter(([id, inms]) => 
    inms.some(i => (i.tipo || '').toUpperCase().includes('COMERCIAL') || (i.tipo || '').toUpperCase().includes('INDUSTRIAL'))
  );
  
  const noEnExcel = sysComerciales.filter(([id]) => {
    const naked = id.replace(/^[VJGEP]-/, '');
    return !excelRifs.some(r => r === id || r.replace(/^[VJGEP]-/, '') === naked);
  });

  console.log('\n--- COMERCIALES EN SISTEMA PERO NO EN EXCEL ---');
  console.log('Total:', noEnExcel.length);
  noEnExcel.slice(0, 15).forEach(([id, inms]) => {
    const nombre = inms.find(i => i.contribuyente)?.contribuyente || 'Sin nombre';
    console.log('  ' + id + ' | ' + nombre + ' | ' + inms.length + ' inmuebles');
  });

  // 5. Verificar tipos: Excel tiene V- pero sistema dice J- (empresas)
  console.log('\n--- POSIBLES RIF MAL ASIGNADOS (Excel=J pero Sistema=V) ---');
  letraIncorrecta.filter(l => l.excel.startsWith('J-') && l.sistema.startsWith('V-')).forEach(l => 
    console.log('  ' + l.excel + ' (Excel) vs ' + l.sistema + ' (Sistema) | ' + l.nombre)
  );

  // 6. Resumen de actividades del Excel vs Sistema
  console.log('\n--- RESUMEN TIPO EN SISTEMA ---');
  let comercialMatch = 0, residencialMatch = 0, sinTipo = 0;
  enSistema.forEach(rif => {
    const inms = sysMap[rif];
    const esCom = inms?.some(i => (i.tipo||'').toUpperCase().includes('COMERCIAL'));
    const esRes = inms?.some(i => (i.tipo||'').toUpperCase().includes('RESIDENCIAL'));
    if (esCom) comercialMatch++;
    else if (esRes) residencialMatch++;
    else sinTipo++;
  });
  console.log('Comerciales:', comercialMatch);
  console.log('Residenciales:', residencialMatch);
  console.log('Sin tipo:', sinTipo);
})();
