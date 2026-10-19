const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^[\"']|[\"']$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const condoFiles = [
  { code: 'URB015662', name: 'CC DIAGNOSTICO DEL NORTE', file: 'CC DIAGNOSTICO DEL NORTE_URB015662.xls', headerRow: 6 },
  { code: 'URB015715', name: 'CC DINASTIA', file: 'CC DINASTIA_URB015715.xls', headerRow: 6 },
  { code: 'URB004525', name: 'CC MANGO SHOPPING', file: 'CC MANGO SHOPPING_URB004525 (5).xls', headerRow: 6 },
  { code: 'URB003522', name: 'CC PASEO LA GRANJA', file: 'CC PASEO LA GRANJA _URB003522.xls', headerRow: 6 },
  { code: 'URB005770', name: 'CC TORRE CRISTAL', file: 'CC TORRE CRISTAL_URB005770.xls', headerRow: 6 },
  { code: 'URB010343', name: 'CENTRO INT. EVENTOS MULTIPLES', file: 'CENTRO INTERNACIONAL DE EVENTOS MULTIPLES_URB010343.xls', headerRow: 6 },
  { code: 'URB018119', name: 'CONCEPTO LA GRANJA', file: 'CONCEPTO LA GRANJA _URB018119.xls', headerRow: 6 },
  { code: 'URB016822', name: 'FREEMARKET', file: 'FREEMARKET- URB016822.xls', headerRow: 9 },
  { code: 'URB008934', name: 'MULTISERVICIO DR. AUTO', file: 'MULTISERVICIO DR. AUTO MAÑONGO C.A_URB008934 (2).xls', headerRow: 6 },
  { code: 'URB032022', name: 'CONSORCIO SAN ROQUE', file: 'SAN ROQUE/URB032022 - CONSORCIO SAN ROQUE.xls', headerRow: 6 },
  { code: 'URB018483', name: 'WORLD TRADE CENTER', file: 'WORLD TRADE CENTER_URB018483.xls', headerRow: 6 },
];

function calcTargetDate(mesesPend) {
  // Emisión Octubre 2026
  // Si mesesPend === 0 -> 2026-10-01 (al día)
  // Si mesesPend === 1 -> 2026-09-01 (debe septiembre)
  // Si mesesPend === n -> fecha retrocedida n meses desde octubre
  let year = 2026;
  let month = 10 - mesesPend;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function dateToMonths(dateStr) {
  if (!dateStr) return 999;
  const [y, m] = dateStr.split('-').map(Number);
  return (2026 - y) * 12 + (10 - m);
}

async function runSync() {
  console.log('=== INICIANDO SINCRONIZACIÓN DE EDO ABONOS (RESPETANDO PAGOS) ===\n');

  const baseDir = path.join(__dirname, '../data/edo_abonos/EDO ABONOS');
  const { data: dbCondos } = await supabase.from('condominios').select('*');
  const condoMap = new Map();
  dbCondos.forEach(c => condoMap.set(c.codigo, c));

  let totalUpdatedUnidades = 0;
  let totalPreservedPayments = 0;
  let totalAlreadyExact = 0;

  const updateLog = [];

  for (const item of condoFiles) {
    const dbCondo = condoMap.get(item.code);
    if (!dbCondo) continue;

    console.log(`\nProcesando: ${item.code} - ${item.name}...`);

    // 1. Leer Excel
    const fullPath = path.join(baseDir, item.file);
    const wb = xlsx.readFile(fullPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const dataRows = rows.slice(item.headerRow + 1).filter(r => r && r[0] && String(r[0]).trim().startsWith('URB'));

    // 2. Obtener movimientos en nuestro sistema para este condominio
    const { data: movs } = await supabase
      .from('condominio_movimientos')
      .select('unidad_id, periodo, tipo, created_at')
      .eq('condominio_id', dbCondo.id);

    const movsByUnidadId = new Set();
    (movs || []).forEach(m => {
      if (m.unidad_id) movsByUnidadId.add(m.unidad_id);
    });

    // 3. Obtener unidades en BD
    const { data: unidades } = await supabase
      .from('condominio_unidades')
      .select('*')
      .eq('condominio_id', dbCondo.id);

    const uMap = new Map();
    (unidades || []).forEach(u => uMap.set(u.inmueble, u));

    for (const r of dataRows) {
      const code = String(r[0]).trim();
      const mesesPend = parseInt(String(r[6] ?? '0').trim(), 10) || 0;
      const targetDesde = calcTargetDate(mesesPend);

      const dbU = uMap.get(code);
      if (!dbU) continue;

      const currentDesde = dbU.aseo_pendiente_desde;
      const currentMeses = dateToMonths(currentDesde);
      const hasSystemPayment = movsByUnidadId.has(dbU.id);

      // REGLA DE ORO: Si en nuestro sistema ya está más solvente (meses de deuda menores o fecha más reciente),
      // o si tiene pagos en nuestro sistema que ya avanzaron su fecha, PRESERVAR!
      if (currentDesde && currentDesde >= targetDesde) {
        if (hasSystemPayment) {
          totalPreservedPayments++;
          // console.log(`  [PRESERVADO PAGO] ${code}: BD=${currentDesde} >= Excel=${targetDesde}`);
        } else if (currentDesde === targetDesde) {
          totalAlreadyExact++;
        } else {
          totalPreservedPayments++;
        }
        continue;
      }

      // Si el Excel tiene fecha MÁS RECIENTE (menos deuda) debido a abonos históricos no guardados en el sistema anterior:
      // Actualizar a la fecha de abonos
      const updData = {
        aseo_pendiente_desde: targetDesde,
        updated_at: new Date().toISOString()
      };
      if (mesesPend === 0) {
        updData.multa_meses = 0;
      }

      const { error: errU } = await supabase
        .from('condominio_unidades')
        .update(updData)
        .eq('id', dbU.id);

      if (!errU) {
        totalUpdatedUnidades++;
        updateLog.push({
          code,
          condo: item.code,
          antes_desde: currentDesde,
          nuevo_desde: targetDesde,
          mesesPend,
          teniaPagoSistema: hasSystemPayment
        });

        // Sincronizar también en tabla inmuebles si existe
        await supabase
          .from('inmuebles')
          .update({
            meses_deuda: mesesPend,
            multa_bs: mesesPend === 0 ? 0 : undefined
          })
          .eq('inmueble', code);
      }
    }
  }

  console.log('\n=============================================================');
  console.log(`TOTAL UNIDADES ACTUALIZADAS CON ABONOS REALES: ${totalUpdatedUnidades}`);
  console.log(`PAGOS/ESTADOS PRESERVADOS DE NUESTRO SISTEMA: ${totalPreservedPayments}`);
  console.log(`UNIDADES QUE YA COINCIDÍAN EXACTAMENTE: ${totalAlreadyExact}`);
  console.log('=============================================================');

  fs.writeFileSync('scripts/log_sync_edo_abonos.json', JSON.stringify(updateLog, null, 2));
  console.log('Log detallado guardado en scripts/log_sync_edo_abonos.json');
}

runSync();
