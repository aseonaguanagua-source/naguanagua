const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function syncExcel() {
  const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
  const sheetName = workbook.SheetNames[2]; // Hoja 3 (Detalle por Unidad)
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  // Tasa used in Excel:
  const TASA = 55927.2599;

  let count = 0;
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 12 || !row[0].startsWith('URB')) continue;

    const codigo = row[0];
    const contribuyente = row[1];
    const direccion = row[2];
    const identidad = row[3];
    const actividad = row[4];
    const montoMensual = row[5];
    const mesesPend = row[6];
    const deudaAseo = row[7];
    const iva = row[8];
    const mesesMultas = row[9];
    const multas = row[10];
    const deudaTotal = row[11];

    let mmvMes = 0;
    let deudaMmv = deudaAseo / TASA;

    if (mesesPend === 1) {
      mmvMes = deudaAseo / TASA;
    } else if (mesesPend === 0) {
       // If 0 debt, Deuda Aseo is 0. But Monto Mensual might not be 0.
       // Wait, in this Excel, Monto Mensual is Deuda Aseo + IVA. If Deuda Aseo is 0, Monto Mensual is 0.
       // For these, we might not be able to deduce the exact mmv_mes.
       // Let's assume mmvMes is what we already have, or try to deduce from Monto Mensual.
       if (montoMensual > 0) {
           // We shouldn't hit this based on the formulas, but just in case.
           mmvMes = (montoMensual / 1.16) / TASA; 
       }
    } else {
       mmvMes = (deudaAseo / mesesPend) / TASA;
    }

    const updateObj = {
      contribuyente: contribuyente,
      identidad: identidad,
      actividad_principal: actividad,
      meses_deuda: mesesPend,
      deuda_mmv: deudaMmv,
      multa_bs: multas
    };

    if (mmvMes > 0) {
      updateObj.mmv_mes = mmvMes;
    }

    const { error } = await sb.from('inmuebles').update(updateObj).eq('inmueble', codigo);
    if (error) {
       console.error(`Error updating ${codigo}:`, error);
    } else {
       console.log(`Updated ${codigo}: mmv_mes=${mmvMes.toFixed(5)}, deuda_mmv=${deudaMmv.toFixed(5)}`);
       count++;
    }
  }
  console.log(`Successfully synced ${count} units from Excel.`);
}

syncExcel();
