import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { obtenerHistorialPagosMultasYPeriodos } from '@/lib/multasPagadas';

export const dynamic = 'force-dynamic';

const SUPERUSUARIOS_ADMIN = new Set(['dzara', 'isamar', 'raquel', 'nell', 'admin', 'administrador']);

async function adminActivo(usuario: string) {
  let u = String(usuario || '').trim().toLowerCase();
  if (u.includes('(')) u = u.split('(')[1].replace(')', '').trim();
  u = u.replace(/^[a-z]-/i, '').trim();
  if (!u) return { usuario: 'administrador', nombre: 'Administrador', rol: 'Administrador', estado: 'Activo' };
  const { data: t } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).limit(1).maybeSingle();
  if (!t) {
    if (SUPERUSUARIOS_ADMIN.has(u)) return { usuario: u, nombre: u, rol: 'Administrador', estado: 'Activo' };
    return null;
  }
  if (t.estado && String(t.estado).trim().toLowerCase() !== 'activo') return null;
  if (!(t.rol === 'Administrador' || t.rol === 'Personalizado' || SUPERUSUARIOS_ADMIN.has(u))) return null;
  return t;
}

/**
 * POST  { codigo, unidad_id?, concepto, monto_bs?, monto_mmv?, usuario, motivo, reemplazar_acumulados? } → agrega una multa manual
 * PATCH { id, usuario, motivo }                                                 → anula una multa pendiente
 */
export async function POST(req: Request) {
  try {
    const { codigo, unidad_id, concepto, monto_bs, monto_mmv, usuario, motivo, periodo, reemplazar_acumulados } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede agregar multas.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo.' }, { status: 400 });
    if (String(concepto || '').trim().length < 3) return NextResponse.json({ error: 'Escriba el concepto de la multa.' }, { status: 400 });
    const bs = Number(monto_bs) || 0, mmv = Number(monto_mmv) || 0;
    if (bs <= 0 && mmv <= 0) return NextResponse.json({ error: 'Indique el monto (Bs o MMV).' }, { status: 400 });
    const { data: c } = await sb.from('condominios').select('id, codigo, nombre, identidad, multa_meses').eq('codigo', String(codigo || '').toUpperCase()).limit(1).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });
    let identidad = c.identidad;
    let unidadInm: string | null = null;
    let uRowActual: any = null;
    if (unidad_id) {
      const { data: u } = await sb.from('condominio_unidades').select('id, identidad, condominio_id, inmueble, multa_meses').eq('id', unidad_id).maybeSingle();
      if (!u || u.condominio_id !== c.id) return NextResponse.json({ error: 'La unidad no pertenece a este condominio.' }, { status: 400 });
      uRowActual = u;
      identidad = u.identidad;
      unidadInm = u.inmueble || null;
    }

    let periodoDate: string | null = null;
    let periodoYm: string | null = null;
    if (periodo && String(periodo).trim()) {
      const pStr = String(periodo).trim();
      const matchYm = pStr.match(/^(\d{4})-(0[1-9]|1[0-2])/);
      if (matchYm) {
        periodoYm = `${matchYm[1]}-${matchYm[2]}`;
        periodoDate = `${periodoYm}-01`;
      } else {
        periodoDate = pStr;
      }
    }

    // Verificar si el período ya tiene una multa cancelada o si fue cancelado junto con el mes
    if (periodoYm) {
      const historial = await obtenerHistorialPagosMultasYPeriodos({
        inmueble: unidadInm || c.codigo,
        unidad_id: unidad_id || null,
        condominio_id: c.id,
        codigo_condominio: c.codigo,
        identidad,
      });

      const pagoExistente = historial.porPeriodo[periodoYm];
      if (pagoExistente) {
        return NextResponse.json(
          {
            error: `No se puede cargar la multa para el período ${periodoYm}: ya figura como "${pagoExistente.etiqueta}" (Ref: ${pagoExistente.referencia}).`,
            pago_existente: pagoExistente,
          },
          { status: 409 }
        );
      }
    }

    if (unidad_id && uRowActual) {
      if (reemplazar_acumulados) {
        // Anular multas manuales anteriores de esta unidad y fijar solo el(los) período(s) nuevo(s)
        await sb.from('condominio_multas')
          .update({ estado: 'Anulada', anulada_por: t.usuario, motivo_anulacion: `Reemplazada por multa específica: ${String(motivo).trim()}` })
          .eq('unidad_id', unidad_id)
          .eq('estado', 'Pendiente');
        await sb.from('condominio_unidades').update({
          multa_meses: 0,
          multa_exonerada_hasta: '2099-12-31'
        }).eq('id', unidad_id);
        await sb.from('condominio_unidades').update({
          multa_meses: 0,
          multa_exonerada_hasta: '2099-12-31'
        }).eq('padre_unidad_id', unidad_id).neq('estado', 'Eliminada');
      } else {
        // Anular si ya había una multa manual pendiente del mismo período para no duplicarla
        if (periodoDate) {
          await sb.from('condominio_multas')
            .update({ estado: 'Anulada', anulada_por: t.usuario, motivo_anulacion: 'Actualizada por nueva asignación del mismo período' })
            .eq('unidad_id', unidad_id)
            .eq('periodo', periodoDate)
            .eq('estado', 'Pendiente');
        }
      }
    } else if (!unidad_id) {
      await sb.from('condominios').update({
        multa_meses: Math.max(1, Number(c.multa_meses || 0) + 1),
        multa_exonerada_hasta: null
      }).eq('id', c.id);
    }

    const fila = {
      condominio_id: c.id, unidad_id: unidad_id || null, identidad, concepto: String(concepto).trim().toUpperCase(),
      monto_bs: bs > 0 ? bs : null, monto_mmv: bs > 0 ? null : mmv, periodo: periodoDate, estado: 'Pendiente', creada_por: t.usuario,
    };
    const { data: m, error } = await sb.from('condominio_multas').insert(fila).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sincronizar también en tabla inmuebles (para que se vea en Contribuyentes)
    const targetCodigoInm = unidadInm || c.codigo;
    if (targetCodigoInm && bs > 0) {
      const { data: inmRow } = await sb.from('inmuebles').select('id, multa_bs, notas').eq('inmueble', targetCodigoInm).limit(1).maybeSingle();
      if (inmRow) {
        let sumPendientes = bs;
        if (unidad_id) {
          const { data: pendRows } = await sb.from('condominio_multas').select('monto_bs').eq('unidad_id', unidad_id).eq('estado', 'Pendiente');
          if (pendRows && pendRows.length > 0) {
            sumPendientes = Math.round(pendRows.reduce((acc, r) => acc + (Number(r.monto_bs) || 0), 0) * 100) / 100;
          }
        }
        const nuevaMultaBs = reemplazar_acumulados
          ? sumPendientes
          : Math.round((Math.max(sumPendientes, (Number(inmRow.multa_bs) || 0) + bs)) * 100) / 100;
        let nuevaNota = String(inmRow.notas || '').trim();
        if (nuevaNota.startsWith('{') && nuevaNota.endsWith('}')) {
          try {
            const parsed = JSON.parse(nuevaNota);
            delete parsed.exonerado_multas;
            nuevaNota = Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : '';
          } catch {}
        } else {
          nuevaNota = nuevaNota.replace(/Caso especial:\s*Exonerado de multas\n?/gi, '').trim();
        }
        await sb.from('inmuebles').update({
          multa_bs: nuevaMultaBs,
          notas: nuevaNota || null
        }).eq('id', inmRow.id);
      }
    }
    await sb.from('auditoria').insert({
      accion: 'Multa agregada en condominio', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: { _categoria: 'CONDOMINIOS', criticidad: 'ALTA', codigo: c.codigo, condominio: c.nombre, motivo: String(motivo).trim(), multa: m },
    });
    return NextResponse.json({ ok: true, multa: m });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, usuario, motivo } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede anular multas.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo de la anulación.' }, { status: 400 });
    const { data, error } = await sb.from('condominio_multas')
      .update({ estado: 'Anulada', anulada_por: t.usuario, motivo_anulacion: String(motivo).trim() })
      .eq('id', id).eq('estado', 'Pendiente').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: 'La multa no existe o ya no está pendiente.' }, { status: 409 });
    // Sincronizar en inmuebles al anular multa desde Condominios
    try {
      const multaAnulada = data[0];
      let targetInmCode: string | null = null;
      if (multaAnulada.unidad_id) {
        const { data: u } = await sb.from('condominio_unidades').select('inmueble, multa_meses').eq('id', multaAnulada.unidad_id).maybeSingle();
        if (u?.inmueble) targetInmCode = u.inmueble;
        if (u) {
          const nextMeses = Math.max(0, Number(u.multa_meses || 0) - 1);
          await sb.from('condominio_unidades').update({
            multa_meses: nextMeses,
            ...(nextMeses === 0 ? { multa_exonerada_hasta: '2099-12-31' } : {})
          }).eq('id', multaAnulada.unidad_id);
        }
      } else if (multaAnulada.condominio_id) {
        const { data: c } = await sb.from('condominios').select('codigo, multa_meses').eq('id', multaAnulada.condominio_id).maybeSingle();
        if (c?.codigo) targetInmCode = c.codigo;
      }
      if (targetInmCode && Number(multaAnulada.monto_bs) > 0) {
        const { data: inmRow } = await sb.from('inmuebles').select('id, multa_bs, notas').eq('inmueble', targetInmCode).limit(1).maybeSingle();
        if (inmRow) {
          const nextMultaBs = Math.max(0, Math.round(((Number(inmRow.multa_bs) || 0) - (Number(multaAnulada.monto_bs) || 0)) * 100) / 100);
          let notaStr = String(inmRow.notas || '').trim();
          if (nextMultaBs === 0 && !notaStr.startsWith('{') && !notaStr.includes('Caso especial: Exonerado de multas')) {
            notaStr = notaStr ? `Caso especial: Exonerado de multas\n${notaStr}` : 'Caso especial: Exonerado de multas';
          }
          await sb.from('inmuebles').update({ multa_bs: nextMultaBs, notas: notaStr || null }).eq('id', inmRow.id);
        }
      }
    } catch (syncErr) {
      console.warn('Advertencia sincronizando anulación de multa con inmuebles:', syncErr);
    }
    await sb.from('auditoria').insert({
      accion: 'Multa anulada en condominio', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: { _categoria: 'CONDOMINIOS', criticidad: 'ALTA', motivo: String(motivo).trim(), multa: data[0] },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
