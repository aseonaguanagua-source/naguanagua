/**
 * POST /api/admin/hash-passwords
 * 
 * Script de migración ONE-TIME: hashea las contraseñas en texto plano
 * de la tabla `trabajadores` usando bcrypt.
 * 
 * SEGURIDAD: Este endpoint requiere INTERNAL_API_SECRET y solo funciona
 * desde el servidor (no es accesible públicamente sin el token).
 * 
 * USO:
 *   curl -X POST https://tudominio.vercel.app/api/admin/hash-passwords \
 *     -H "Authorization: Bearer <INTERNAL_API_SECRET>"
 * 
 * IDEMPOTENTE: Salta registros que ya tienen hash bcrypt ($2b$ o $2a$).
 * Puede ejecutarse múltiples veces sin efecto negativo.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import bcrypt from 'bcryptjs';

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export async function POST(request: Request) {
  // Verificar token de autorización
  if (!INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET no configurado' }, { status: 500 });
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token !== INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Obtener todos los trabajadores activos
    const { data: trabajadores, error } = await supabaseAdmin
      .from('trabajadores')
      .select('id, usuario, clave')
      .eq('estado', 'Activo');

    if (error || !trabajadores) {
      return NextResponse.json({ error: 'Error al leer trabajadores: ' + error?.message }, { status: 500 });
    }

    const results = { migrated: 0, skipped: 0, errors: 0 };

    for (const t of trabajadores) {
      // Saltar los que ya tienen hash bcrypt
      if (t.clave?.startsWith('$2b$') || t.clave?.startsWith('$2a$')) {
        results.skipped++;
        continue;
      }

      if (!t.clave) {
        results.skipped++;
        continue;
      }

      try {
        const hashed = await bcrypt.hash(t.clave, 12);
        const { error: updateError } = await supabaseAdmin
          .from('trabajadores')
          .update({ clave: hashed })
          .eq('id', t.id);

        if (updateError) {
          console.error(`Error migrando ${t.usuario}:`, updateError);
          results.errors++;
        } else {
          console.log(`✅ Migrado: ${t.usuario}`);
          results.migrated++;
        }
      } catch (e) {
        console.error(`Error hasheando ${t.usuario}:`, e);
        results.errors++;
      }
    }

    return NextResponse.json({
      ok: true,
      total: trabajadores.length,
      ...results,
      message: `Migración completa: ${results.migrated} hasheados, ${results.skipped} ya tenían hash, ${results.errors} errores`,
    });

  } catch (e: any) {
    console.error('[hash-passwords]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
