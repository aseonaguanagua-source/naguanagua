import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/** Tablas que guardan la cédula/RIF del contribuyente. */
const TABLAS_HIJAS: { tabla: string; col: string }[] = [
  { tabla: 'inmuebles', col: 'identidad' },
  { tabla: 'facturas', col: 'identidad' },
  { tabla: 'pagos_reportados', col: 'identidad' },
  { tabla: 'convenios_pago', col: 'identidad' },
  { tabla: 'servicios_especiales', col: 'identidad' },
  { tabla: 'documentos', col: 'identidad' },
  { tabla: 'retenciones_iva', col: 'identidad' },
  { tabla: 'hacienda_multas', col: 'identidad_infractor' },
];

const normalizar = (s: string) => {
  const t = String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([VEJGP])-?0*(\d{5,10})$/);
  return m ? `${m[1]}-${m[2]}` : '';
};

/**
 * Cambia la cédula/RIF de un contribuyente en TODO el sistema.
 * Orden seguro: 1) crear contribuyente con la nueva identidad, 2) mover tablas hijas,
 * 3) borrar el registro viejo (inmuebles tiene ON DELETE CASCADE: por eso se mueven antes).
 */
export async function POST(request: Request) {
  try {
    const { actual, nueva, usuario } = await request.json().catch(() => ({}));
    const idActual = String(actual || '').trim();
    const idNueva = normalizar(nueva);
    if (!idActual) return NextResponse.json({ error: 'Falta la identidad actual.' }, { status: 400 });
    if (!idNueva) return NextResponse.json({ error: 'Identidad nueva inválida. Formato: V-12345678, E-…, J-…, G-…' }, { status: 400 });
    if (idNueva === idActual) return NextResponse.json({ error: 'La identidad nueva es igual a la actual.' }, { status: 400 });

    const { data: viejoRow, error: eV } = await supabase.from('contribuyentes').select('*').eq('identidad', idActual).maybeSingle();
    if (eV) throw eV;
    let viejo: any = viejoRow;
    if (!viejo) {
      // Datos importados: el contribuyente puede existir solo en inmuebles
      const { data: inm } = await supabase.from('inmuebles').select('contribuyente, telefono, correo_electronico, direccion').eq('identidad', idActual).limit(1).maybeSingle();
      if (!inm) return NextResponse.json({ error: `No existe el contribuyente ${idActual}.` }, { status: 404 });
      viejo = { nombre: inm.contribuyente, telefono: inm.telefono, email: inm.correo_electronico, direccion: inm.direccion };
    }

    const { data: existe } = await supabase.from('contribuyentes').select('identidad, nombre').eq('identidad', idNueva).maybeSingle();

    // 1. Nuevo registro de contribuyente (solo si no existe)
    if (!existe) {
      const { id: _omit, created_at: _c, identidad: _i, ...resto } = viejo as any;
      const { error: eIns } = await supabase.from('contribuyentes').insert([{ ...resto, identidad: idNueva }]);
      if (eIns) throw new Error('No se pudo crear el registro con la nueva identidad: ' + eIns.message);
    }

    // 2. Mover todas las tablas hijas
    const movidos: Record<string, number> = {};
    for (const { tabla, col } of TABLAS_HIJAS) {
      const { data, error } = await supabase.from(tabla).update({ [col]: idNueva }).eq(col, idActual).select(col);
      if (error) {
        // Si la tabla no existe en esta BD, seguir; cualquier otro error detiene el proceso
        if (/does not exist|schema cache/i.test(error.message)) continue;
        throw new Error(`Error moviendo ${tabla}: ${error.message}. Se movió parcialmente; NO se borró el registro anterior.`);
      }
      movidos[tabla] = data?.length || 0;
    }

    // 3. Borrar el registro viejo (ya no tiene hijos)
    const { count: quedan } = await supabase.from('inmuebles').select('id', { count: 'exact', head: true }).eq('identidad', idActual);
    if ((quedan || 0) === 0) {
      const { error: eDel } = await supabase.from('contribuyentes').delete().eq('identidad', idActual);
      if (eDel) throw new Error('Se movieron los datos pero no se pudo borrar el registro anterior: ' + eDel.message);
    }

    await supabase.from('auditoria').insert({
      usuario: usuario || 'Administrador',
      accion: 'Cambio de Cédula/RIF de Contribuyente',
      categoria: 'CONTRIBUYENTE',
      modulo: '/admin/contribuyentes',
      detalles: { identidad_anterior: idActual, identidad_nueva: idNueva, contribuyente: viejo.nombre, registros_movidos: movidos, criticidad: 'CRITICA' },
    });

    return NextResponse.json({ success: true, identidad: idNueva, movidos });
  } catch (e: any) {
    console.error('cambiar-identidad', e);
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 });
  }
}
