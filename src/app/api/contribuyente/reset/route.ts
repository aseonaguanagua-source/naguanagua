import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_PRIVATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || (() => { throw new Error('JWT_PRIVATE_SECRET no configurado'); })();

export async function POST(request: Request) {
  try {
    const { token, clave } = await request.json();
    
    if (!token || !clave) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    const cleanClave = String(clave).trim();
    if (cleanClave.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    let payload: { identidad: string; purpose?: string };
    try {
      payload = jwt.verify(token, JWT_SECRET) as { identidad: string; purpose?: string };
    } catch (err) {
      return NextResponse.json({ error: 'Enlace inválido o expirado' }, { status: 401 });
    }

    if (!payload?.identidad || (payload.purpose && payload.purpose !== 'portal_password_reset')) {
      return NextResponse.json({ error: 'Token de recuperación no válido' }, { status: 401 });
    }

    const { identidad } = payload;
    const variantes = getIdentidadVariantsExact(identidad);
    const idFilter = variantes.length > 0 ? variantes : [identidad];

    // Actualizar clave en todas las variantes de formato (con y sin guion) del mismo prefijo
    const [{ error: errInm }, { error: errCon }] = await Promise.all([
      supabase
        .from('inmuebles')
        .update({ clave_portal: cleanClave })
        .in('identidad', idFilter),
      supabase
        .from('contribuyentes')
        .update({ clave_portal: cleanClave })
        .in('identidad', idFilter),
    ]);

    if (errInm && errCon) {
      console.error("Supabase Error en reset:", errInm, errCon);
      return NextResponse.json({ error: 'Error al actualizar base de datos' }, { status: 500 });
    }

    return NextResponse.json({ status: 'success' });
  } catch (err) {
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
