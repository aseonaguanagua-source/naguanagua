import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const TABLAS_RIF: { tabla: string; col: string }[] = [
  { tabla: 'inmuebles', col: 'identidad' },
  { tabla: 'condominios', col: 'identidad' },
  { tabla: 'condominio_unidades', col: 'identidad' },
  { tabla: 'facturas', col: 'identidad' },
  { tabla: 'pagos_reportados', col: 'identidad' },
  { tabla: 'convenios_pago', col: 'identidad' },
  { tabla: 'servicios_especiales', col: 'identidad' },
  { tabla: 'documentos', col: 'identidad' },
  { tabla: 'retenciones_iva', col: 'identidad' },
  { tabla: 'hacienda_multas', col: 'identidad_infractor' },
];

const TABLAS_CODIGO: { tabla: string; col: string }[] = [
  { tabla: 'inmuebles', col: 'inmueble' },
  { tabla: 'inmuebles', col: 'condominio_padre_id' },
  { tabla: 'inmuebles', col: 'padre_id' },
  { tabla: 'condominios', col: 'codigo' },
  { tabla: 'condominio_unidades', col: 'inmueble' },
  { tabla: 'retenciones_iva', col: 'codigo_inmueble' },
  { tabla: 'servicios_especiales', col: 'inmueble' },
];

const TABLAS_NOMBRE: { tabla: string; col: string }[] = [
  { tabla: 'inmuebles', col: 'contribuyente' },
  { tabla: 'condominios', col: 'nombre' },
  { tabla: 'condominio_unidades', col: 'propietario' },
  { tabla: 'facturas', col: 'contribuyente' },
  { tabla: 'servicios_especiales', col: 'contribuyente' },
  { tabla: 'documentos', col: 'contribuyente' },
  { tabla: 'retenciones_iva', col: 'contribuyente' },
];

const normalizarRif = (s: string) => {
  const t = String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([VEJGP])-?0*(\d{5,10})$/);
  return m ? `${m[1]}-${m[2]}` : '';
};

/**
 * GET /api/admin/depuracion-rif
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const filtro = String(searchParams.get('filtro') || 'todos').toLowerCase();
    const listCondosOnly = searchParams.get('condominios') === 'true';
    const checkCodigo = searchParams.get('check_codigo');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '80', 10), 10), 200);

    // 1. Verificación en tiempo real si un código nuevo ya está en uso
    if (checkCodigo) {
      const codeClean = checkCodigo.trim().toUpperCase();
      const [{ data: inmMatches }, { data: condoMatches }] = await Promise.all([
        sb.from('inmuebles').select('id, inmueble, contribuyente, identidad, es_condominio, condominio_padre_id, direccion, estado').ilike('inmueble', codeClean),
        sb.from('condominios').select('id, codigo, nombre, identidad, direccion, estado').ilike('codigo', codeClean)
      ]);

      const enUso = (inmMatches && inmMatches.length > 0) || (condoMatches && condoMatches.length > 0);
      return NextResponse.json({
        ok: true,
        en_uso: Boolean(enUso),
        codigo: codeClean,
        coincidencias_inmuebles: inmMatches || [],
        coincidencias_condominios: condoMatches || []
      });
    }

    // 2. Si solicitan catálogo de condominios
    if (listCondosOnly) {
      const [{ data: cList }, { data: inmCondos }] = await Promise.all([
        sb.from('condominios').select('id, codigo, nombre').order('nombre', { ascending: true }),
        sb.from('inmuebles').select('id, inmueble, contribuyente').eq('es_condominio', true).order('contribuyente', { ascending: true })
      ]);

      const mapCondos = new Map<string, { codigo: string; nombre: string; id?: string }>();
      (cList || []).forEach((c: any) => {
        if (c.codigo) mapCondos.set(c.codigo.toUpperCase(), { codigo: c.codigo.toUpperCase(), nombre: c.nombre || c.codigo, id: c.id });
      });
      (inmCondos || []).forEach((ic: any) => {
        const code = String(ic.inmueble || '').toUpperCase();
        if (code && !mapCondos.has(code)) {
          mapCondos.set(code, { codigo: code, nombre: ic.contribuyente || code });
        }
      });

      const condominios = Array.from(mapCondos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
      return NextResponse.json({ ok: true, condominios });
    }

    // 3. Consulta de registros
    let query = sb
      .from('inmuebles')
      .select('id, identidad, inmueble, contribuyente, telefono, correo_electronico, direccion, actividad_principal, clasificacion, estado, condominio_padre_id, padre_id, es_condominio, mmv_mes, deuda_mmv')
      .neq('estado', 'Eliminado');

    if (q) {
      const rawDigits = q.replace(/\D/g, '');
      const orFilters = [
        `inmueble.ilike.%${q}%`,
        `contribuyente.ilike.%${q}%`,
        `identidad.ilike.%${q}%`,
        `condominio_padre_id.ilike.%${q}%`
      ];
      if (rawDigits.length >= 3) {
        orFilters.push(`identidad.ilike.%${rawDigits}%`);
      }
      query = query.or(orFilters.join(','));
    } else {
      query = query.or('identidad.ilike.%0000%,identidad.ilike.000%,identidad.ilike.%URB%,identidad.ilike.%AURI%');
    }

    if (filtro === 'sin_condominio') {
      query = query.is('condominio_padre_id', null).eq('es_condominio', false);
    } else if (filtro === 'con_condominio') {
      query = query.not('condominio_padre_id', 'is', null);
    } else if (filtro === 'solo_condominios') {
      query = query.eq('es_condominio', true);
    }

    const { data: rows, error } = await query
      .order('inmueble', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const parentCodes = Array.from(new Set((rows || []).map((r: any) => r.condominio_padre_id).filter(Boolean)));
    const condoNamesMap = new Map<string, string>();

    if (parentCodes.length > 0) {
      const [{ data: cData }, { data: inmParentData }] = await Promise.all([
        sb.from('condominios').select('codigo, nombre').in('codigo', parentCodes),
        sb.from('inmuebles').select('inmueble, contribuyente').in('inmueble', parentCodes)
      ]);
      (cData || []).forEach((c: any) => {
        if (c.codigo) condoNamesMap.set(c.codigo.toUpperCase(), c.nombre);
      });
      (inmParentData || []).forEach((ip: any) => {
        if (ip.inmueble && !condoNamesMap.has(ip.inmueble.toUpperCase())) {
          condoNamesMap.set(ip.inmueble.toUpperCase(), ip.contribuyente);
        }
      });
    }

    const items = (rows || []).map((r: any) => {
      const parentCode = r.condominio_padre_id ? String(r.condominio_padre_id).toUpperCase() : null;
      return {
        ...r,
        condominio_padre_nombre: parentCode ? (condoNamesMap.get(parentCode) || parentCode) : null
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    console.error('Error GET depuracion-rif:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Error consultando registros' }, { status: 500 });
  }
}

/**
 * POST /api/admin/depuracion-rif
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      inmueble_id,
      inmueble_codigo,
      codigo_nuevo,          // Nuevo código si se modifica (ej. URB012345)
      identidad_actual,
      identidad_nueva,       // Nuevo RIF / Cédula si se modifica
      contribuyente,         // Nuevo nombre / razón social si se modifica
      telefono,
      correo,
      direccion,
      condominio_codigo,     // Código del condominio padre a asignar (o null/vacio para desvincular)
      transferir_a_codigo,   // Si el código ya existe y se desea transferir todo a ese código existente
      usuario = 'Administrador',
      motivo = 'Actualización integral en Módulo Depuración RIF'
    } = body;

    const inmobCode = String(inmueble_codigo || '').trim().toUpperCase();
    if (!inmobCode) {
      return NextResponse.json({ ok: false, error: 'Código de inmueble actual requerido' }, { status: 400 });
    }

    // 1. Obtener inmueble actual
    let qInm = sb.from('inmuebles').select('*');
    if (inmueble_id) {
      qInm = qInm.eq('id', inmueble_id);
    } else {
      qInm = qInm.ilike('inmueble', inmobCode);
    }
    const { data: inmActual, error: errInm } = await qInm.maybeSingle();
    if (errInm || !inmActual) {
      return NextResponse.json({ ok: false, error: `Inmueble ${inmobCode} no encontrado` }, { status: 404 });
    }

    const oldIdentidad = inmActual.identidad || identidad_actual || '';
    const newIdNormalizada = identidad_nueva ? normalizarRif(identidad_nueva) : '';

    if (identidad_nueva && !newIdNormalizada) {
      return NextResponse.json({
        ok: false,
        error: 'El formato del nuevo RIF/Cédula es inválido. Debe ser ej. V-12345678, J-123456789 o G-123456789.'
      }, { status: 400 });
    }

    const updatesInm: Record<string, any> = {};
    const auditCascade: Record<string, any> = {};

    // 2. MODIFICACIÓN O TRANSFERENCIA DE CÓDIGO (EN CASCADA)
    const targetCode = (codigo_nuevo || transferir_a_codigo ? String(codigo_nuevo || transferir_a_codigo).trim().toUpperCase() : '');
    let codigoModificado = false;

    if (targetCode && targetCode !== inmobCode) {
      // Si NO viene explícitamente transferir_a_codigo, validar si ya existe
      if (!transferir_a_codigo) {
        const [{ data: inmDupe }, { data: condoDupe }] = await Promise.all([
          sb.from('inmuebles').select('id, inmueble, contribuyente, identidad, es_condominio, condominio_padre_id, direccion, estado').ilike('inmueble', targetCode),
          sb.from('condominios').select('id, codigo, nombre, identidad, direccion, estado').ilike('codigo', targetCode)
        ]);

        const conflictInm = (inmDupe || []).find((x: any) => x.id !== inmActual.id);
        const conflictCondo = (condoDupe || [])[0];

        if (conflictInm || conflictCondo) {
          return NextResponse.json({
            ok: false,
            codigo_en_uso: true,
            codigo_solicitado: targetCode,
            error: `Por favor código en uso, cambien provisionalmente un número o seleccione transferir al existente.`,
            conflicto: {
              tipo: conflictCondo ? 'condominio' : (conflictInm?.es_condominio ? 'condominio' : 'inmueble'),
              codigo: targetCode,
              nombre: conflictCondo?.nombre || conflictInm?.contribuyente,
              identidad: conflictCondo?.identidad || conflictInm?.identidad,
              direccion: conflictCondo?.direccion || conflictInm?.direccion,
              estado: conflictCondo?.estado || conflictInm?.estado,
              inmueble_id: conflictInm?.id,
              condominio_id: conflictCondo?.id
            }
          }, { status: 409 });
        }
      }

      // Proceder con migración en cascada de inmobCode -> targetCode
      const tablasCodigoAfectadas: Record<string, number> = {};
      for (const { tabla, col } of TABLAS_CODIGO) {
        try {
          const { data, error } = await sb
            .from(tabla)
            .update({ [col]: targetCode })
            .ilike(col, inmobCode)
            .select(col);
          if (!error && data) {
            tablasCodigoAfectadas[`${tabla}.${col}`] = data.length;
          }
        } catch (_) {}
      }

      updatesInm.inmueble = targetCode;
      auditCascade.codigo = {
        anterior: inmobCode,
        nuevo: targetCode,
        tablas: tablasCodigoAfectadas,
        es_transferencia: Boolean(transferir_a_codigo)
      };
      codigoModificado = true;
    }

    // 3. MODIFICACIÓN DE RIF / CÉDULA (EN CASCADA)
    let rifMigrado = false;
    if (newIdNormalizada && newIdNormalizada !== oldIdentidad) {
      // 3a. Asegurar registro en contribuyentes
      const { data: existeContrib } = await sb.from('contribuyentes').select('identidad, nombre').eq('identidad', newIdNormalizada).maybeSingle();
      if (!existeContrib) {
        const { data: viejoContrib } = await sb.from('contribuyentes').select('*').eq('identidad', oldIdentidad).maybeSingle();
        const baseData = viejoContrib || {
          nombre: contribuyente || inmActual.contribuyente || 'Contribuyente Actualizado',
          telefono: telefono || inmActual.telefono || null,
          email: correo || inmActual.correo_electronico || null,
          direccion: direccion || inmActual.direccion || null,
          clasificacion: inmActual.clasificacion || 'Individual',
          estado: 'Activo'
        };
        const { id: _omit, created_at: _c, identidad: _i, ...resto } = baseData as any;
        await sb.from('contribuyentes').insert([{ ...resto, identidad: newIdNormalizada }]);
      }

      // 3b. Cascada en tablas con identidad
      const { count: otrosInmuebles } = await sb
        .from('inmuebles')
        .select('id', { count: 'exact', head: true })
        .eq('identidad', oldIdentidad)
        .neq('inmueble', inmobCode);

      const esProvisionalExclusivo = (otrosInmuebles || 0) === 0 || oldIdentidad.toUpperCase().includes(inmobCode);
      const tablasRifAfectadas: Record<string, number> = {};

      if (esProvisionalExclusivo) {
        for (const { tabla, col } of TABLAS_RIF) {
          try {
            const { data, error } = await sb.from(tabla).update({ [col]: newIdNormalizada }).eq(col, oldIdentidad).select(col);
            if (!error && data) {
              tablasRifAfectadas[tabla] = data.length;
            }
          } catch (_) {}
        }
        try {
          await sb.from('contribuyentes').delete().eq('identidad', oldIdentidad);
        } catch (_) {}
      } else {
        const currentCode = updatesInm.inmueble || inmobCode;
        updatesInm.identidad = newIdNormalizada;
        try {
          await sb.from('facturas').update({ identidad: newIdNormalizada }).eq('inmueble', currentCode);
          tablasRifAfectadas['facturas_inmueble'] = 1;
        } catch (_) {}
        // Si es un contenedor padre (N/A), propagar también el cambio de RIF a sus actividades hijas directas
        try {
          const { data: hijosUpdated } = await sb
            .from('inmuebles')
            .update({ identidad: newIdNormalizada })
            .eq('padre_id', currentCode)
            .eq('identidad', oldIdentidad)
            .select('inmueble');
          if (hijosUpdated && hijosUpdated.length > 0) {
            tablasRifAfectadas['inmuebles_hijos'] = hijosUpdated.length;
          }
        } catch (_) {}
      }

      updatesInm.identidad = newIdNormalizada;
      auditCascade.rif = {
        anterior: oldIdentidad,
        nuevo: newIdNormalizada,
        tablas: tablasRifAfectadas
      };
      rifMigrado = true;
    }

    // 4. MODIFICACIÓN DE NOMBRE / RAZÓN SOCIAL (EN CASCADA)
    const nuevoNombre = contribuyente ? contribuyente.trim().toUpperCase() : '';
    if (nuevoNombre && nuevoNombre !== String(inmActual.contribuyente || '').toUpperCase()) {
      const tablasNombreAfectadas: Record<string, number> = {};
      const currentId = updatesInm.identidad || oldIdentidad;

      // Actualizar tabla contribuyentes si corresponde a este RIF
      try {
        await sb.from('contribuyentes').update({ nombre: nuevoNombre }).eq('identidad', currentId);
        tablasNombreAfectadas['contribuyentes'] = 1;
      } catch (_) {}

      // Actualizar en cascada en las tablas relacionadas para este RIF / inmueble
      for (const { tabla, col } of TABLAS_NOMBRE) {
        try {
          const { data, error } = await sb.from(tabla).update({ [col]: nuevoNombre }).eq('identidad', currentId).select(col);
          if (!error && data) {
            tablasNombreAfectadas[tabla] = data.length;
          }
        } catch (_) {}
      }

      updatesInm.contribuyente = nuevoNombre;
      // Propagar nombre también a actividades hijas del contenedor padre si existe
      try {
        const currentCode = updatesInm.inmueble || inmobCode;
        await sb.from('inmuebles').update({ contribuyente: nuevoNombre }).eq('padre_id', currentCode);
      } catch (_) {}
      auditCascade.nombre = {
        anterior: inmActual.contribuyente,
        nuevo: nuevoNombre,
        tablas: tablasNombreAfectadas
      };
    }

    // 5. Contactos específicos de este inmueble
    if (telefono !== undefined) updatesInm.telefono = telefono ? String(telefono).trim() : null;
    if (correo !== undefined) updatesInm.correo_electronico = correo ? String(correo).trim() : null;
    if (direccion !== undefined) updatesInm.direccion = direccion ? String(direccion).trim() : null;

    // 6. ASIGNACIÓN O DESVINCULACIÓN DE CONDOMINIO MATRIZ
    let condoAsignado: any = null;
    let condoDesvinculado = false;
    const finalInmobCode = updatesInm.inmueble || inmobCode;

    if (condominio_codigo !== undefined) {
      const codCondo = condominio_codigo ? String(condominio_codigo).trim().toUpperCase() : null;

      if (codCondo) {
        let condoRef: any = null;
        const { data: cRow } = await sb.from('condominios').select('id, codigo, nombre, cant_declarada').eq('codigo', codCondo).maybeSingle();
        if (cRow) {
          condoRef = cRow;
        } else {
          const { data: iCondoRow } = await sb.from('inmuebles').select('id, inmueble, contribuyente').eq('inmueble', codCondo).eq('es_condominio', true).maybeSingle();
          if (iCondoRow) {
            condoRef = { id: iCondoRow.id, codigo: iCondoRow.inmueble, nombre: iCondoRow.contribuyente };
          }
        }

        if (!condoRef) {
          return NextResponse.json({ ok: false, error: `No se encontró el condominio matriz con código ${codCondo}` }, { status: 404 });
        }

        updatesInm.condominio_padre_id = condoRef.codigo;
        updatesInm.padre_id = null;
        updatesInm.es_condominio = false;

        if (cRow?.id) {
          const { data: unidadExistente } = await sb.from('condominio_unidades').select('id').eq('inmueble', finalInmobCode).maybeSingle();
          if (unidadExistente) {
            await sb.from('condominio_unidades').update({
              condominio_id: cRow.id,
              estado: 'Activa'
            }).eq('id', unidadExistente.id);
          } else {
            await sb.from('condominio_unidades').insert({
              condominio_id: cRow.id,
              inmueble: finalInmobCode,
              numero: finalInmobCode,
              identidad: updatesInm.identidad || oldIdentidad,
              propietario: updatesInm.contribuyente || inmActual.contribuyente || null,
              actividad: inmActual.actividad_principal || null,
              tarifa_mmv: inmActual.mmv_mes || null,
              estado: 'Activa',
              creada_en_modulo: true,
              multa_meses: 0
            });
          }
        }

        condoAsignado = condoRef;
      } else {
        updatesInm.condominio_padre_id = null;
        condoDesvinculado = true;
      }
    }

    // 7. Aplicar actualización final en tabla inmuebles
    if (Object.keys(updatesInm).length > 0) {
      const { error: errUpd } = await sb.from('inmuebles').update(updatesInm).eq('id', inmActual.id);
      if (errUpd) throw errUpd;
    }

    // 8. Auditoría completa
    await sb.from('auditoria').insert({
      usuario,
      accion: 'Modificación Integral en Cascada / Asignación Condominio',
      categoria: 'INMUEBLES',
      modulo: '/admin/depuracion-rif',
      detalles: {
        inmueble_origen: inmobCode,
        inmueble_final: finalInmobCode,
        codigo_modificado: codigoModificado,
        rif_migrado: rifMigrado,
        condominio_asignado: condoAsignado,
        condo_desvinculado: condoDesvinculado,
        cascada: auditCascade,
        motivo
      }
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Inmueble ${inmobCode} actualizado satisfactoriamente en cascada.`,
      inmueble: {
        ...inmActual,
        ...updatesInm,
        condominio_padre_nombre: condoAsignado?.nombre || null
      }
    });

  } catch (err: any) {
    console.error('Error POST depuracion-rif:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Error procesando solicitud' }, { status: 500 });
  }
}
