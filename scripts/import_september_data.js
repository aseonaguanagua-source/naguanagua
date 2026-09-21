import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MOROSOS_FILE = 'C:/Users/david/Downloads/Reporte_Inmuebles_inmuebles_morosos_2026-09-04_161228.xlsx';
const CONVENIOS_FILE = 'C:/Users/david/Downloads/Reporte_Inmuebles_convenios_vigentes_2026-09-04_161358.xlsx';

async function importData() {
  console.log('=== INICIANDO IMPORTACION DE DATA (FASE 3) ===');

  const { data: dbInmuebles } = await supabase.from('inmuebles').select('identidad');
  const { data: dbFacturas } = await supabase.from('facturas').select('identidad, monto, referencia').eq('estado', 'Pendiente');
  
  const existingInmuebles = new Set((dbInmuebles || []).map(i => i.identidad));
  const existingDebt = new Map();
  for (const f of (dbFacturas || [])) {
    const ident = f.identidad;
    const amount = parseFloat((f.monto || '0').toString().replace(/[^\d.]/g, ''));
    if (!existingDebt.has(ident)) existingDebt.set(ident, 0);
    existingDebt.set(ident, existingDebt.get(ident) + amount);
  }

  // MOROSOS
  const wbMorosos = xlsx.readFile(MOROSOS_FILE);
  const sheetMorosos = wbMorosos.Sheets[wbMorosos.SheetNames[0]];
  let dataMorosos = xlsx.utils.sheet_to_json(sheetMorosos, { range: 6 });
  
  let usersAdded = 0;
  let facturasAdjusted = 0;
  console.log('Se encontraron ' + dataMorosos.length + ' registros en Morosos.');

  for (const row of dataMorosos) {
    if (!row.Identidad) continue;
    const identidad = row.Identidad.toString().trim();
    const codigo = (row.Codigo || '').toString().trim();
    const contribuyente = row.Contribuyente || 'Desconocido';
    const direccion = row.Direccion || '';
    const sector = row.Sector || '';
    const telefono = (row.Telefono || '').toString().trim();
    const actividad = row.Actividad || '';
    const cantInm = parseInt(row['Cant Inmuebles']) || 1;
    const saldo = parseFloat(row.Saldo) || 0;

    if (!existingInmuebles.has(identidad)) {
      await supabase.from('inmuebles').insert({
        cod_cont: codigo, identidad: identidad, contribuyente: contribuyente,
        direccion: direccion, sector: sector, telefono: telefono,
        actividad_principal: actividad, cant_inmuebles: cantInm,
        clasificacion: 'A', estado: 'Activo'
      });
      existingInmuebles.add(identidad);
      usersAdded++;
    }

    if (saldo > 0) {
      const currentDebt = existingDebt.get(identidad) || 0;
      if (Math.abs(currentDebt - saldo) > 0.01) {
        const toDelete = (dbFacturas || []).filter(f => f.identidad === identidad);
        for (const f of toDelete) {
          await supabase.from('facturas').delete().eq('referencia', f.referencia);
        }
        
        const ref = 'FAC-CON-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random()*1000);
        await supabase.from('facturas').insert({
          referencia: ref, identidad: identidad, contribuyente: contribuyente,
          monto: saldo.toFixed(2) + ' Bs', emision: '2026-09-04', vencimiento: '2026-10-04',
          estado: 'Pendiente', nota: 'Deuda Consolidada Importada'
        });
        facturasAdjusted++;
      }
    }
  }

  // CONVENIOS
  const wbConvenios = xlsx.readFile(CONVENIOS_FILE);
  const sheetConvenios = wbConvenios.Sheets[wbConvenios.SheetNames[0]];
  let dataConvenios = xlsx.utils.sheet_to_json(sheetConvenios, { range: 6 });

  let conveniosAdded = 0;
  console.log('Se encontraron ' + dataConvenios.length + ' registros en Convenios.');

  for (const row of dataConvenios) {
    if (!row.Identidad) continue;
    const identidad = row.Identidad.toString().trim();
    const contribuyente = row.Contribuyente || '';
    const deudaActual = parseFloat(row['Deuda Actual']) || 0;
    
    const { data: convActivos } = await supabase.from('convenios').select('numero').eq('identidad', identidad).eq('estado', 'Activo');
    
    if (!convActivos || convActivos.length === 0) {
      const num = 'CONV-IMP-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random()*100);
      await supabase.from('convenios').insert({
        numero: num, identidad: identidad, contribuyente: contribuyente,
        monto_total: deudaActual.toFixed(2) + ' Bs', cuotas: 'N/A',
        inicio: '2026-09-04', estado: 'Activo'
      });
      conveniosAdded++;
    }
  }

  console.log('=== IMPORTACION COMPLETADA ===');
  console.log('Usuarios nuevos añadidos: ' + usersAdded);
  console.log('Recibos consolidadas ajustadas: ' + facturasAdjusted);
  console.log('Convenios activos importados: ' + conveniosAdded);
}
importData();
