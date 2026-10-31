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

  if (countErr) {
    throw new Error(`Error obteniendo conteo de ${table}: ${countErr.message}`);
  }
  if (!count || count === 0) return [];

  const numBatches = Math.ceil(count / STEP);
  const CONCURRENCY = 10;
  let all: any[] = [];

  for (let start = 0; start < numBatches; start += CONCURRENCY) {
    const end = Math.min(start + CONCURRENCY, numBatches);
    const chunkPromises = [];

    for (let i = start; i < end; i++) {
      const from = i * STEP;
      chunkPromises.push(
        (async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const { data, error } = await supabaseAdmin
              .from(table)
              .select(cols)
              .range(from, from + STEP - 1);
            if (!error) return data || [];
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            else throw new Error(`Fallo al descargar lote ${i} de ${table}: ${error.message}`);
          }
          return [];
        })()
      );
    }

    const chunkResults = await Promise.all(chunkPromises);
    for (const rows of chunkResults) {
      all = all.concat(rows);
    }
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
