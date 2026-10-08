const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const xlsx = require('xlsx');

async function insertMissingUnits() {
  const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
  const sheetName = workbook.SheetNames[2]; 
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const missingIds = new Set([
    'URB035215', 'URB016271',
    'URB016308', 'URB016315',
    'URB035222', 'URB016148',
    'URB033586', 'URB016175',
    'URB016126', 'URB016288',
    'URB016314', 'URB016272',
    'URB016326'
  ]);

  const { data: condo } = await sb.from('condominios').select('id, codigo').eq('codigo', 'URB016119').single();
  const TASA = 55927.2599;

  let inserted = 0;
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (row && row.length >= 12 && typeof row[0] === 'string' && missingIds.has(row[0])) {
      const codigo = row[0];
      const contribuyente = row[1] || 'DESCONOCIDO';
      const direccion = row[2] || 'S/D';
      
      let identidad = row[3] || 'J-295063008'; // Default to Sambil RIF if missing/invalid
      if (identidad === 'V-0') identidad = 'J-295063008';
      
      // Ensure contribuyente exists
      const { data: cData } = await sb.from('contribuyentes').select('identidad').eq('identidad', identidad).single();
      if (!cData) {
        await sb.from('contribuyentes').insert({ identidad, nombre: contribuyente });
      }

      const actividad = row[4] || 'N/A';
      const mesesPend = parseInt(row[6]) || 1;
      const deudaAseo = parseFloat(row[7]) || 0;
      const multas = parseFloat(row[10]) || 0;

      const mmvMes = (mesesPend > 0) ? (deudaAseo / mesesPend) / TASA : (deudaAseo / TASA);
      const deudaMmv = deudaAseo / TASA;

      // Update or insert
      const { error: err1 } = await sb.from('inmuebles').upsert({
        inmueble: codigo,
        contribuyente: contribuyente,
        identidad: identidad,
        actividad_principal: actividad,
        meses_deuda: mesesPend,
        deuda_mmv: deudaMmv,
        mmv_mes: mmvMes > 0 ? mmvMes : 1.98,
        multa_bs: multas,
        direccion: direccion,
        tipo: 'COMERCIAL'
      }, { onConflict: 'inmueble' });

      if (err1) {
        console.error(`Error upserting ${codigo}:`, err1);
        continue;
      }

      // We don't use numero_unidad
      const { error: err2 } = await sb.from('condominio_unidades').insert({
        condominio_id: condo.id,
        inmueble: codigo
      });

      if (err2 && err2.code !== '23505') { // Ignore unique constraint violation
        console.error(`Error linking ${codigo}:`, err2);
      } else {
        console.log(`Linked ${codigo}`);
        inserted++;
      }
    }
  }
  console.log(`Successfully inserted & linked ${inserted} missing units.`);
}
insertMissingUnits();
