import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables de entorno");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const preRegistros = Array.from({ length: 15 }).map((_, i) => ({
  codigo: `PR-${Math.floor(Math.random() * 10000)}`,
  identidad: `J-${312097920 + i}`,
  contribuyente: `EMPRESA DE PRUEBA ${i + 1} C.A.`,
  registro: `2024-0${(i % 9) + 1}-15`,
  tipo: 'Local Comercial',
  actividad: 'Venta al por menor',
  registrado: 'WEB',
  fiscalizado: i % 2
}));

const recibos = Array.from({ length: 10 }).map((_, i) => ({
  referencia: `FAC-00${i + 1}`,
  identidad: `J-${312097920 + i}`,
  contribuyente: `EMPRESA DE PRUEBA ${i + 1} C.A.`,
  monto: `${(Math.random() * 1000).toFixed(2)} USD`,
  emision: `2024-01-0${(i % 9) + 1}`,
  vencimiento: `2024-02-0${(i % 9) + 1}`,
  estado: i % 3 === 0 ? 'Pagado' : 'Pendiente'
}));

const documentos = Array.from({ length: 5 }).map((_, i) => ({
  documento: `Planilla_Liquidacion_00${i + 1}.pdf`,
  identidad: `J-${312097920 + i}`,
  tipo: 'Liquidación',
  fecha: `2024-02-0${i + 1}`,
  contribuyente: `EMPRESA DE PRUEBA ${i + 1} C.A.`,
  estado: 'Procesado'
}));

const certificados = Array.from({ length: 5 }).map((_, i) => ({
  codigo: `CERT-2024-${i + 1}`,
  identidad: `J-${312097920 + i}`,
  tipo: 'Solvencia Comercial',
  contribuyente: `EMPRESA DE PRUEBA ${i + 1} C.A.`,
  emision: `2024-01-10`,
  vencimiento: `2024-12-31`,
  estado: 'Vigente'
}));

const reclamos = Array.from({ length: 3 }).map((_, i) => ({
  ticket: `TK-100${i}`,
  identidad: `J-${312097920 + i}`,
  fecha: `2024-02-1${i}`,
  contribuyente: `EMPRESA DE PRUEBA ${i + 1} C.A.`,
  tipo: 'Falla en Recolección',
  sector: 'Centro',
  estado: i === 0 ? 'Resuelto' : 'En Proceso'
}));

const convenios = Array.from({ length: 2 }).map((_, i) => ({
  numero: `CONV-00${i + 1}`,
  identidad: `J-${312097920 + i}`,
  contribuyente: `EMPRESA DE PRUEBA ${i + 1} C.A.`,
  monto_total: '500.00 USD',
  cuotas: '5',
  inicio: '2024-03-01',
  estado: 'Activo'
}));

const condominios = Array.from({ length: 4 }).map((_, i) => ({
  codigo: `COND-0${i + 1}`,
  identidad: `J-${312097920 + i}`,
  nombre: `Edificio Residencial ${i + 1}`,
  direccion: `Av. Principal Sector ${i + 1}`,
  unidades: 20 + i * 10,
  representante: `Juan Pérez ${i}`,
  estado: 'Al día'
}));

async function seed() {
  console.log("Iniciando inyección de datos de prueba...");

  await supabase.from('pre_registros').insert(preRegistros);
  console.log("Pre-Registros insertados");
  
  await supabase.from('facturas').insert(recibos);
  console.log("Recibos insertadas");
  
  await supabase.from('documentos').insert(documentos);
  console.log("Documentos insertados");
  
  await supabase.from('certificados').insert(certificados);
  console.log("Certificados insertados");
  
  await supabase.from('reclamos').insert(reclamos);
  console.log("Reclamos insertados");
  
  await supabase.from('convenios').insert(convenios);
  console.log("Convenios insertados");
  
  await supabase.from('condominios').insert(condominios);
  console.log("Condominios insertados");

  console.log("¡Inyección finalizada con éxito!");
}

seed().catch(console.error);
