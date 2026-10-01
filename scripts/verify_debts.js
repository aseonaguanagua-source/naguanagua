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
  // 1. Leer Excel fuente de deudas
  console.log('Leyendo Excel...');
  const wb = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log('Excel: ' + rows.length + ' registros');

  // Mapa Excel: Código → datos
  const excelMap = {};
  rows.forEach(r => {
    const cod = (r['Código'] || '').toString().trim();
    if (cod) {
      excelMap[cod] = {
        documento: (r['Documento'] || '').toString().trim(),
        nombre: r['Nombre / Razón Social'] || '',
        tipo: r['Tipo'] || '',
        mesesPendientes: parseInt(r['Meses pendientes'] || 0),
        montoPorMes: parseFloat(r['Monto x mes'] || 0),
        deudaTotal: parseFloat(r['Deuda total Ves'] || 0),
        multaTotal: parseFloat(r['Multa total Ves'] || 0),
        totalVes: parseFloat(r['Total Ves'] || 0),
      };
    }
  });

  // 2. Cargar inmuebles del sistema
  console.log('Cargando inmuebles del sistema...');
  const inmuebles = await fetchAll('inmuebles', 'inmueble, identidad, tipo, deuda_mmv, deuda_congelada_bs, multa_bs, meses_deuda, mmv_mes, contribuyente, saldo_favor_bs');
  console.log('Sistema: ' + inmuebles.length + ' inmuebles');

  // 3. Estadísticas generales
  let totalConDeuda = 0, totalSinDeuda = 0;
  let totalDeudaMMV = 0, totalDeudaCongelada = 0, totalMulta = 0;
  let deudaCero = 0, mesesCero = 0, multaCero = 0;
  let conSaldoFavor = 0, totalSaldoFavor = 0;
  
  const porTipo = { COMERCIAL: { con: 0, sin: 0, deuda: 0 }, RESIDENCIAL: { con: 0, sin: 0, deuda: 0 }, OTRO: { con: 0, sin: 0, deuda: 0 } };

  inmuebles.forEach(i => {
    const deuda = parseFloat(i.deuda_mmv || 0);
    const congelada = parseFloat(i.deuda_congelada_bs || 0);
    const multa = parseFloat(i.multa_bs || 0);
    const meses = parseInt(i.meses_deuda || 0);
    const saldo = parseFloat(i.saldo_favor_bs || 0);
    const tieneDeuda = deuda > 0 || congelada > 0 || meses > 0;
    
    if (tieneDeuda) totalConDeuda++; else totalSinDeuda++;
    totalDeudaMMV += deuda;
    totalDeudaCongelada += congelada;
    totalMulta += multa;
    if (deuda === 0 && congelada === 0) deudaCero++;
    if (meses === 0) mesesCero++;
    if (multa === 0) multaCero++;
    if (saldo > 0) { conSaldoFavor++; totalSaldoFavor += saldo; }
    
    const tipo = (i.tipo || '').toUpperCase();
    const cat = tipo.includes('COMERCIAL') ? 'COMERCIAL' : tipo.includes('RESIDENCIAL') ? 'RESIDENCIAL' : 'OTRO';
    if (tieneDeuda) { porTipo[cat].con++; porTipo[cat].deuda += congelada; }
    else porTipo[cat].sin++;
  });

  console.log('\n========== RESUMEN DE DEUDAS ==========');
  console.log('Total inmuebles:', inmuebles.length);
  console.log('Con deuda:', totalConDeuda, '(' + (totalConDeuda/inmuebles.length*100).toFixed(1) + '%)');
  console.log('Sin deuda:', totalSinDeuda, '(' + (totalSinDeuda/inmuebles.length*100).toFixed(1) + '%)');
  console.log('\nDeuda MMV total:', totalDeudaMMV.toFixed(2));
  console.log('Deuda congelada Bs total:', totalDeudaCongelada.toFixed(2));
  console.log('Multa Bs total:', totalMulta.toFixed(2));
  console.log('\nCon deuda_mmv=0:', deudaCero);
  console.log('Con meses_deuda=0:', mesesCero);
  console.log('Con multa_bs=0:', multaCero);
  console.log('\nCon saldo a favor:', conSaldoFavor, '(Bs. ' + totalSaldoFavor.toFixed(2) + ')');
  
  console.log('\n--- POR TIPO ---');
  Object.entries(porTipo).forEach(([t, v]) => {
    console.log('  ' + t + ': ' + v.con + ' con deuda, ' + v.sin + ' sin deuda, Bs.' + v.deuda.toFixed(2) + ' congelada');
  });

  // 4. Comparar deudas del Excel vs Sistema
  console.log('\n========== COMPARACIÓN EXCEL vs SISTEMA ==========');
  let coinciden = 0, noCoinciden = 0, soloExcel = 0, soloSistema = 0;
  const discrepancias = [];
  
  // Mapa sistema por código inmueble
  const sysMap = {};
  inmuebles.forEach(i => { sysMap[i.inmueble] = i; });

  Object.entries(excelMap).forEach(([cod, excel]) => {
    const sys = sysMap[cod];
    if (!sys) { soloExcel++; return; }
    
    const sysDeuda = parseFloat(sys.deuda_congelada_bs || 0);
    const sysMulta = parseFloat(sys.multa_bs || 0);
    const sysMeses = parseInt(sys.meses_deuda || 0);
    
    // Comparar meses (principal indicador)
    if (excel.mesesPendientes === sysMeses) {
      coinciden++;
    } else {
      noCoinciden++;
      if (discrepancias.length < 20) {
        discrepancias.push({
          cod, doc: excel.documento, nombre: (excel.nombre||'').substring(0, 35),
          exMeses: excel.mesesPendientes, sysMeses,
          exDeuda: excel.deudaTotal.toFixed(0), sysDeuda: sysDeuda.toFixed(0),
          exMulta: excel.multaTotal.toFixed(0), sysMulta: sysMulta.toFixed(0),
        });
      }
    }
  });

  // Inmuebles en sistema pero no en Excel (con deuda)
  inmuebles.forEach(i => {
    if (!excelMap[i.inmueble] && (parseFloat(i.deuda_mmv||0) > 0 || parseInt(i.meses_deuda||0) > 0)) {
      soloSistema++;
    }
  });

  console.log('Meses coinciden:', coinciden);
  console.log('Meses NO coinciden:', noCoinciden);
  console.log('Solo en Excel:', soloExcel);
  console.log('Con deuda solo en sistema:', soloSistema);
  
  if (discrepancias.length > 0) {
    console.log('\n--- PRIMERAS 20 DISCREPANCIAS DE MESES ---');
    console.log('Código      | Documento       | Excel→Sistema meses | Excel→Sistema deuda Bs');
    discrepancias.forEach(d => {
      console.log('  ' + d.cod + ' | ' + d.doc + ' | ' + d.exMeses + '→' + d.sysMeses + ' meses | ' + d.exDeuda + '→' + d.sysDeuda + ' Bs');
    });
  }

  // 5. Pagos que limpiaron deuda (meses=0 en sistema pero Excel>0)
  let pagados = 0;
  Object.entries(excelMap).forEach(([cod, excel]) => {
    const sys = sysMap[cod];
    if (sys && excel.mesesPendientes > 0 && parseInt(sys.meses_deuda || 0) === 0 && parseFloat(sys.deuda_mmv || 0) === 0) {
      pagados++;
    }
  });
  console.log('\nInmuebles con deuda en Excel pero ya pagados (meses=0, deuda=0 en sistema):', pagados);

  // 6. Inmuebles con inconsistencias (deuda>0 pero meses=0, o viceversa)
  let inconsistentes = 0;
  inmuebles.forEach(i => {
    const deuda = parseFloat(i.deuda_mmv || 0);
    const meses = parseInt(i.meses_deuda || 0);
    if ((deuda > 0 && meses === 0) || (deuda === 0 && meses > 0)) inconsistentes++;
  });
  console.log('Inmuebles inconsistentes (deuda vs meses):', inconsistentes);
})();
