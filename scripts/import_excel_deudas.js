require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const wb = xlsx.readFile('C:/Users/david/Downloads/Reporte_Inmuebles_inmuebles_morosos_2026-09-09_083939.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { range: 1 }); // Start at row 2

  console.log(`Leídas ${data.length} filas del Excel.`);

  for (const row of data) {
    if (!row.Identidad || !row.Contribuyente) continue;

    const isCondominio = row.Actividad && row.Actividad.toLowerCase().includes('condominio');
    
    // 1. Asegurar que existe el contribuyente / condominio
    if (isCondominio) {
      const { data: existing } = await supabase.from('condominios').select('id').eq('identidad', row.Identidad);
      if (!existing || existing.length === 0) {
        console.log(`Insertando condominio faltante: ${row.Contribuyente}`);
        await supabase.from('condominios').insert([{
          codigo: row.Codigo || `C-${Date.now().toString().slice(-6)}`,
          nombre: row.Contribuyente,
          identidad: row.Identidad,
          direccion: row.Direccion,
          unidades: row['Cant Inmuebles'] || 1,
          representante: 'No asignado',
          estado: 'Activo'
        }]);
      }
    }

    // 2. Procesar Deudas (Meses)
    const saldo = parseFloat(row.Saldo) || 0;
    const meses = parseInt(row.Meses) || 0;

    if (saldo > 0 && meses > 0) {
      // Verificar si ya hay recibos para no duplicar (usando un prefijo en la referencia)
      const { data: facturasExistentes } = await supabase.from('facturas')
        .select('id')
        .eq('identidad', row.Identidad)
        .like('referencia', 'CM-%');

      if (facturasExistentes && facturasExistentes.length > 0) {
        console.log(`El contribuyente ${row.Identidad} ya tiene recibos generadas. Saltando.`);
        continue;
      }

      const montoPorMes = saldo / meses;
      const nuevasFacturas = [];
      const fechaActual = new Date();

      for (let i = 0; i < meses; i++) {
        // Retroceder 'i' meses
        const dateEmi = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - i, 1);
        const dateVenc = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - i + 1, 0);

        nuevasFacturas.push({
          referencia: `CM-${row.Identidad}-${dateEmi.getFullYear()}${(dateEmi.getMonth() + 1).toString().padStart(2, '0')}`,
          contribuyente: row.Contribuyente,
          identidad: row.Identidad,
          monto: `${montoPorMes.toFixed(2)} Bs`,
          emision: dateEmi.toISOString().split('T')[0],
          vencimiento: dateVenc.toISOString().split('T')[0],
          estado: 'Pendiente'
        });
      }

      const { error } = await supabase.from('facturas').insert(nuevasFacturas);
      if (error) {
        console.error(`Error insertando recibos para ${row.Identidad}:`, error);
      } else {
        console.log(`Insertadas ${meses} recibos para ${row.Contribuyente}`);
      }
    }
  }
  console.log('Proceso de migración finalizado.');
}

run().catch(console.error);
