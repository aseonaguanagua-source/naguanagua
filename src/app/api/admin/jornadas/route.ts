import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const CONFIG_KEY = 'jornadas_campo_censo_v1';

export interface InformeJornada {
  id: string;
  nombre: string;
  url: string;
  path?: string;
  fecha_subida: string;
  subido_por?: string;
}

export interface JornadaCampo {
  id: string;
  fecha: string;
  sector: string;
  equipo: string;
  status: 'Planificada' | 'En Proceso' | 'Completada' | 'Cancelada';
  comerciosA_Visitar: number;
  comercios_Visitados: number;
  observaciones?: string;
  informes?: InformeJornada[];
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_JORNADAS: JornadaCampo[] = [
  {
    id: 'jornada-seed-1',
    fecha: '2026-09-08',
    sector: 'Casco Central',
    equipo: 'Equipo A',
    status: 'Planificada',
    comerciosA_Visitar: 45,
    comercios_Visitados: 0,
    observaciones: '',
    informes: [],
    created_at: '2026-09-08T12:00:00.000Z',
  },
  {
    id: 'jornada-seed-2',
    fecha: '2026-09-10',
    sector: 'Carretera Nacional',
    equipo: 'Equipo B',
    status: 'Planificada',
    comerciosA_Visitar: 30,
    comercios_Visitados: 0,
    observaciones: '',
    informes: [],
    created_at: '2026-09-10T12:00:00.000Z',
  },
];

async function leerJornadas(): Promise<JornadaCampo[]> {
  const { data, error } = await supabaseAdmin
    .from('sistema_config')
    .select('valor')
    .eq('id', CONFIG_KEY)
    .maybeSingle();

  if (error || !data || data.valor == null) {
    // Inicializar por primera vez en la base de datos
    await supabaseAdmin
      .from('sistema_config')
      .upsert({ id: CONFIG_KEY, valor: JSON.stringify(DEFAULT_JORNADAS) }, { onConflict: 'id' });
    return DEFAULT_JORNADAS;
  }

  try {
    const parsed = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
    return Array.isArray(parsed) ? parsed : DEFAULT_JORNADAS;
  } catch {
    return DEFAULT_JORNADAS;
  }
}

async function guardarJornadas(lista: JornadaCampo[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sistema_config')
    .upsert({ id: CONFIG_KEY, valor: JSON.stringify(lista) }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function GET() {
  try {
    const jornadas = await leerJornadas();
    return NextResponse.json({ ok: true, jornadas });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Error al cargar jornadas' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fecha,
      sector,
      equipo,
      status = 'Planificada',
      comerciosA_Visitar = 0,
      comercios_Visitados = 0,
      observaciones = '',
      informes = [],
    } = body;

    if (!fecha || !sector || !equipo) {
      return NextResponse.json(
        { ok: false, error: 'Complete fecha, sector y equipo asignado.' },
        { status: 400 }
      );
    }

    const actuales = await leerJornadas();
    const nueva: JornadaCampo = {
      id: `JRN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: String(fecha).trim(),
      sector: String(sector).trim(),
      equipo: String(equipo).trim(),
      status: status || 'Planificada',
      comerciosA_Visitar: Math.max(0, Number(comerciosA_Visitar) || 0),
      comercios_Visitados: Math.max(0, Number(comercios_Visitados) || 0),
      observaciones: String(observaciones || '').trim(),
      informes: Array.isArray(informes) ? informes : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const nuevas = [nueva, ...actuales];
    await guardarJornadas(nuevas);

    return NextResponse.json({ ok: true, jornada: nueva, jornadas: nuevas });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Error al guardar jornada' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, cambios, nuevoInforme, eliminarInformeId } = body;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID de jornada requerido.' }, { status: 400 });
    }

    const actuales = await leerJornadas();
    const idx = actuales.findIndex((j) => String(j.id) === String(id));
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Jornada no encontrada.' }, { status: 404 });
    }

    const actual = { ...actuales[idx] };
    const informesActuales = Array.isArray(actual.informes) ? [...actual.informes] : [];

    if (cambios && typeof cambios === 'object') {
      if (cambios.fecha !== undefined) actual.fecha = String(cambios.fecha).trim();
      if (cambios.sector !== undefined) actual.sector = String(cambios.sector).trim();
      if (cambios.equipo !== undefined) actual.equipo = String(cambios.equipo).trim();
      if (cambios.status !== undefined) actual.status = cambios.status;
      if (cambios.comerciosA_Visitar !== undefined) {
        actual.comerciosA_Visitar = Math.max(0, Number(cambios.comerciosA_Visitar) || 0);
      }
      if (cambios.comercios_Visitados !== undefined) {
        actual.comercios_Visitados = Math.max(0, Number(cambios.comercios_Visitados) || 0);
      }
      if (cambios.observaciones !== undefined) {
        actual.observaciones = String(cambios.observaciones || '').trim();
      }
      if (Array.isArray(cambios.informes)) {
        actual.informes = cambios.informes;
      }
    }

    if (nuevoInforme && nuevoInforme.url) {
      informesActuales.push({
        id: nuevoInforme.id || `INF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: nuevoInforme.nombre || 'Informe de Jornada.pdf',
        url: nuevoInforme.url,
        path: nuevoInforme.path || undefined,
        fecha_subida: nuevoInforme.fecha_subida || new Date().toISOString(),
        subido_por: nuevoInforme.subido_por || 'Operador',
      });
      actual.informes = informesActuales;
    }

    if (eliminarInformeId) {
      actual.informes = informesActuales.filter((inf) => String(inf.id) !== String(eliminarInformeId));
    }

    actual.updated_at = new Date().toISOString();
    actuales[idx] = actual;
    await guardarJornadas(actuales);

    return NextResponse.json({ ok: true, jornada: actual, jornadas: actuales });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Error al actualizar jornada' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID requerido para eliminar.' }, { status: 400 });
    }

    const actuales = await leerJornadas();
    const nuevas = actuales.filter((j) => String(j.id) !== String(id));
    await guardarJornadas(nuevas);

    return NextResponse.json({ ok: true, jornadas: nuevas });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Error al eliminar jornada' },
      { status: 500 }
    );
  }
}
