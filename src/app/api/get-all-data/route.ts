import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Columnas necesarias para el frontend
const INMUEBLE_COLS = 'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,correo_electronico,telefono,es_condominio,condominio_padre_id,padre_id,created_at';

const STEP = 1000; // Supabase max rows per request

async function fetchAllParallel(table: string, cols: string): Promise<any[]> {
  // Primer paso: obtener el count total
  const { count, error: countErr } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (countErr || !count || count === 0) return [];

  // Lanzar TODOS los batches en paralelo (máx ~55 para inmuebles)
  const numBatches = Math.ceil(count / STEP);
  const batchPromises = Array.from({ length: numBatches }, (_, i) => {
    const from = i * STEP;
    return supabaseAdmin
      .from(table)
      .select(cols)
      .range(from, from + STEP - 1);
  });

  const results = await Promise.all(batchPromises);
  
  let all: any[] = [];
  for (const { data, error } of results) {
    if (error) {
      console.error(`Error fetching ${table} batch:`, error);
      continue;
    }
    if (data) all = all.concat(data);
  }
  return all;
}

// ─ Fix A-1: Autenticación por token secreto ─────────────────────────────────
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

function verifyToken(request: Request): boolean {
  if (!INTERNAL_API_SECRET) return false; // Si no está configurado, denegar todo
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token === INTERNAL_API_SECRET;
}

export async function GET(request: Request) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    // Fetch inmuebles y contribuyentes en paralelo, y dentro cada uno usa batches paralelos
    const [allInmuebles, allContribuyentes] = await Promise.all([
      fetchAllParallel('inmuebles', INMUEBLE_COLS),
      fetchAllParallel('contribuyentes', '*'),
    ]);

    // Map contribuyentes for fast lookup
    const contribMap = new Map();
    allContribuyentes.forEach(c => contribMap.set(c.identidad, c));

    // Merge
    const mergedInmuebles = allInmuebles.filter(i => !!i.id).map(inm => ({
      ...inm,
      contribuyentes: contribMap.get(inm.identidad) || null
    }));

    // Condominios
    const condominios = allInmuebles
      .filter(i => i.es_condominio === true)
      .map(inm => ({
        id: inm.id,
        codigo: inm.inmueble,
        identidad: inm.identidad,
        nombre: 'Condominio ' + inm.inmueble,
        direccion: inm.direccion || '',
        unidades: parseInt(inm.cant_inmuebles || '0'),
        representante: contribMap.get(inm.identidad)?.nombre || 'N/A',
        estado: inm.estado || 'Activo',
        created_at: inm.created_at
      }));

    return NextResponse.json({
      condominios,
      inmuebles: mergedInmuebles,
      total: mergedInmuebles.length
    });
  } catch (error: any) {
    console.error('get-all-data error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
