import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const VALID_PASSWORDS = ['Sehile18-', '1756762'];

function isAuthorized(pass?: string): boolean {
  if (!pass) return false;
  return VALID_PASSWORDS.includes(pass.trim());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, pass, query, id, data, targetState } = body;

    if (!isAuthorized(pass)) {
      return NextResponse.json({ error: 'Contraseña de Modo Dios no autorizada' }, { status: 401 });
    }

    // 1. OBTENER / CAMBIAR MODO MANTENIMIENTO GLOBAL
    if (action === 'get_maintenance') {
      const { data: row } = await supabaseAdmin
        .from('system_config')
        .select('value')
        .eq('key', 'PORTAL_EN_MANTENIMIENTO')
        .maybeSingle();

      const isMantenimiento = row ? row.value === 'true' : true;
      return NextResponse.json({ success: true, mantenimiento: isMantenimiento });
    }

    if (action === 'toggle_maintenance') {
      let newState = targetState;
      if (newState === undefined) {
        const { data: cur } = await supabaseAdmin
          .from('system_config')
          .select('value')
          .eq('key', 'PORTAL_EN_MANTENIMIENTO')
          .maybeSingle();
        newState = !(cur && cur.value === 'true');
      }

      const strVal = newState ? 'true' : 'false';

      // Actualizar system_config
      const { error: err1 } = await supabaseAdmin
        .from('system_config')
        .upsert(
          { key: 'PORTAL_EN_MANTENIMIENTO', value: strVal, description: 'Aviso de mantenimiento en Portal Soy Contribuyente' },
          { onConflict: 'key' }
        );

      if (err1) {
        console.error('Error updating system_config:', err1);
        throw err1;
      }

      // También sincronizar en sistema_config si existe
      try {
        await supabaseAdmin
          .from('sistema_config')
          .upsert({ id: 'portal_en_mantenimiento', valor: strVal }, { onConflict: 'id' });
      } catch (_) {}

      console.log(`[MODO DIOS] Interruptor de Mantenimiento actualizado globalmente a: ${strVal}`);
      return NextResponse.json({ success: true, mantenimiento: !!newState });
    }

    // 2. LISTA DE CONDOMINIOS PARA ASIGNACIÓN / DESVINCULACIÓN
    if (action === 'condos_list') {
      const { data: condos, error: errCondos } = await supabaseAdmin
        .from('condominios')
        .select('id, codigo, nombre, identidad, tipo')
        .order('nombre');

      if (errCondos) throw errCondos;
      return NextResponse.json({ success: true, condominios: condos || [] });
    }

    // 3. BUSCADOR INTEGRAL DE INMUEBLES / CONTRIBUYENTES
    if (action === 'search') {
      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        return NextResponse.json({ success: true, results: [] });
      }

      const q = query.trim();
      const isCode = /^(?:URB|AURI)\d+/i.test(q);

      let dbQuery = supabaseAdmin
        .from('inmuebles')
        .select('*');

      if (isCode) {
        dbQuery = dbQuery.ilike('inmueble', `%${q}%`);
      } else {
        const cleanDigits = q.replace(/\D/g, '');
        let filterParts = [
          `identidad.ilike.%${q}%`,
          `contribuyente.ilike.%${q}%`,
          `inmueble.ilike.%${q}%`,
          `cod_cont.ilike.%${q}%`
        ];
        if (cleanDigits.length >= 4) {
          filterParts.push(`identidad.ilike.%${cleanDigits}%`);
        }
        dbQuery = dbQuery.or(filterParts.join(','));
      }

      const { data: results, error: errSearch } = await dbQuery.limit(50);
      if (errSearch) throw errSearch;

      return NextResponse.json({ success: true, results: results || [] });
    }

    // 4. ACTUALIZACIÓN TOTAL "MODO DIOS" (INMUEBLE / CONTRIBUYENTE)
    if (action === 'update') {
      if (!id) {
        return NextResponse.json({ error: 'ID de inmueble obligatorio' }, { status: 400 });
      }

      // Limpiar y estructurar campos válidos
      const payload: Record<string, any> = {};

      const allowedFields = [
        'identidad', 'contribuyente', 'cod_cont', 'estado',
        'meses_deuda', 'deuda_mmv', 'deuda_congelada_bs', 'multa_bs', 'saldo_favor_bs',
        'mmv_mes', 'cant_inmuebles', 'clasificacion', 'tipo', 'actividad_principal',
        'es_condominio', 'condominio_padre_id', 'padre_id', 'agente_retencion',
        'clave_portal', 'correo_electronico', 'telefono', 'direccion', 'notas'
      ];

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          if (['meses_deuda', 'cant_inmuebles'].includes(field)) {
            payload[field] = parseInt(String(data[field] || 0)) || 0;
          } else if (['deuda_mmv', 'deuda_congelada_bs', 'multa_bs', 'saldo_favor_bs', 'mmv_mes'].includes(field)) {
            payload[field] = parseFloat(String(data[field] || 0)) || 0;
          } else if (['es_condominio', 'agente_retencion'].includes(field)) {
            payload[field] = !!data[field];
          } else if (['condominio_padre_id', 'padre_id'].includes(field)) {
            payload[field] = data[field] ? String(data[field]).trim() : null;
          } else {
            payload[field] = data[field] === null ? null : String(data[field]).trim();
          }
        }
      }

      console.log(`[MODO DIOS] Actualizando inmueble ${id}:`, payload);

      const { data: updatedRow, error: errUpdate } = await supabaseAdmin
        .from('inmuebles')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (errUpdate) throw errUpdate;

      // Si se modificó identidad o contribuyente, sincronizar también en tabla 'contribuyentes' si existe
      if (payload.identidad || payload.contribuyente || payload.correo_electronico || payload.telefono) {
        try {
          const idParaSinc = payload.identidad || updatedRow.identidad;
          if (idParaSinc) {
            await supabaseAdmin.from('contribuyentes').upsert({
              identidad: idParaSinc,
              nombre: payload.contribuyente || updatedRow.contribuyente,
              email: payload.correo_electronico || updatedRow.correo_electronico,
              telefono: payload.telefono || updatedRow.telefono,
              direccion: payload.direccion || updatedRow.direccion
            }, { onConflict: 'identidad' });
          }
        } catch (e: any) {
          console.warn('[MODO DIOS] Sincronización en tabla contribuyentes omitida:', e.message);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Inmueble actualizado exitosamente con permisos absolutos.',
        updated: updatedRow
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (error: any) {
    console.error('[MODO DIOS ERROR]:', error);
    return NextResponse.json({ error: error.message || 'Error en servidor' }, { status: 500 });
  }
}
