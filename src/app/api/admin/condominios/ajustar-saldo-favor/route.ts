import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariantsExact, parseLocalFloat } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/condominios/ajustar-saldo-favor
 * Permite ajustar manualmente el saldo a favor de un condominio o inmueble (incluso ponerlo en 0 para eliminarlo).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { codigoCondominio, identidad, nuevoMonto, motivo, usuario } = body;

    const montoNum = Math.max(0, Math.round(parseLocalFloat(nuevoMonto) * 100) / 100);
    const condoCod = codigoCondominio ? String(codigoCondominio).replace(/[,()]/g, '').trim().toUpperCase() : null;
    const targetId = identidad ? String(identidad).replace(/[,()]/g, '').trim().toUpperCase() : null;

    if (!condoCod && !targetId) {
      return NextResponse.json({ error: 'Se requiere el código del condominio o la cédula/RIF.' }, { status: 400 });
    }

    // 1. Obtener saldo previo
    let saldoPrevio = 0;
    const idVars = targetId ? getIdentidadVariantsExact(targetId) : [];

    let qInm = supabase.from('inmuebles').select('id, inmueble, identidad, saldo_favor_bs, contribuyente');
    if (idVars.length > 0 && condoCod) {
      qInm = qInm.or(`${idVars.map(v => `identidad.eq.${v}`).join(',')},inmueble.eq.${condoCod}`);
    } else if (idVars.length > 0) {
      qInm = qInm.or(idVars.map(v => `identidad.eq.${v}`).join(','));
    } else if (condoCod) {
      qInm = qInm.eq('inmueble', condoCod);
    }

    const { data: inms, error: errInm } = await qInm;
    if (errInm) {
      return NextResponse.json({ error: `Error consultando inmuebles: ${errInm.message}` }, { status: 500 });
    }

    if (inms && inms.length > 0) {
      saldoPrevio = inms.reduce((acc, i) => acc + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
      
      // Actualizar el inmueble principal del condominio con el nuevo monto, y los demás en 0
      const principal = inms.find(i => i.inmueble === condoCod) || inms[0];
      await supabase.from('inmuebles').update({ saldo_favor_bs: montoNum }).eq('id', principal.id);
      
      for (const other of inms) {
        if (other.id !== principal.id && (parseFloat(other.saldo_favor_bs || '0') || 0) > 0) {
          await supabase.from('inmuebles').update({ saldo_favor_bs: 0 }).eq('id', other.id);
        }
      }
    }

    // 2. Si es condominio, actualizar también abono_bs en tabla condominios
    let condoRow: any = null;
    if (condoCod) {
      const { data: cRow } = await supabase
        .from('condominios')
        .select('id, codigo, nombre, identidad, abono_bs')
        .eq('codigo', condoCod)
        .limit(1)
        .maybeSingle();

      if (cRow) {
        condoRow = cRow;
        saldoPrevio = Math.max(saldoPrevio, parseFloat(cRow.abono_bs || '0') || 0);
        await supabase.from('condominios').update({ abono_bs: montoNum }).eq('id', cRow.id);
      }
    }

    // 3. Sincronizar la tabla `documentos` (tipo: 'Nota de Credito') para este codigo_inmueble / identidad
    const noAnularNotas = body.noAnularNotas === true;
    if (!noAnularNotas) {
      const orsDocs: string[] = [];
      if (idVars.length > 0) orsDocs.push(...idVars.map(v => `identidad.eq.${v}`));
      if (condoCod) orsDocs.push(`identidad.eq.${condoCod}`);

      let vigentesScope: any[] = [];
      if (orsDocs.length > 0) {
        const { data: docsData } = await supabase
          .from('documentos')
          .select('id, identidad, contribuyente, estado, detalles, created_at')
          .eq('tipo', 'Nota de Credito')
          .eq('estado', 'Vigente')
          .or(orsDocs.join(','))
          .order('created_at', { ascending: true });

        vigentesScope = (docsData || []).filter((doc: any) => {
          let det: any = {};
          try { det = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {}); } catch {}
          const docInm = String(det.codigo_inmueble || '').trim().toUpperCase();
          const docCondo = String(det.codigo_condominio || '').trim().toUpperCase();
          const docAmbito = String(det.ambito || '').trim().toUpperCase();
          if (condoCod) {
            if (condoRow) {
              if (docAmbito === 'LOCAL') return false;
              if (docInm && docInm !== condoCod) return false;
              if (docCondo && docCondo !== condoCod) return false;
              return true;
            } else {
              if (docAmbito === 'CONDOMINIO') return false;
              if (docInm) return docInm === condoCod;
              return String(doc.identidad || '').trim().toUpperCase() === condoCod;
            }
          }
          return true;
        });
      }

      if (montoNum === 0) {
        for (const doc of vigentesScope) {
          let det: any = {};
          try { det = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {}); } catch {}
          await supabase
            .from('documentos')
            .update({
              estado: 'Anulado',
              detalles: {
                ...det,
                anulado_manual: true,
                fecha_anulacion: new Date().toISOString(),
                motivo_anulacion: motivo || 'Ajuste manual de Saldo a Favor a Bs. 0',
                usuario_anulacion: usuario || 'Admin',
              },
            })
            .eq('id', doc.id);
        }
      } else {
        const sumaVigente = Math.round(
          vigentesScope.reduce((acc: number, doc: any) => {
            let det: any = {};
            try { det = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {}); } catch {}
            const m = parseLocalFloat(det.monto_bs ?? det.monto ?? 0);
            return acc + (isNaN(m) ? 0 : m);
          }, 0) * 100
        ) / 100;

        if (sumaVigente > montoNum + 0.009) {
          // Desactivar o ajustar notas previas hasta que sumen exactamente montoNum
          let restante = montoNum;
          for (const doc of vigentesScope) {
            let det: any = {};
            try { det = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {}); } catch {}
            const m = Math.max(0, parseLocalFloat(det.monto_bs ?? det.monto ?? 0) || 0);
            if (restante <= 0.009) {
              await supabase
                .from('documentos')
                .update({
                  estado: 'Anulado',
                  detalles: {
                    ...det,
                    monto: 0,
                    monto_bs: 0,
                    ajustado_manual: true,
                    fecha_ajuste: new Date().toISOString(),
                    motivo_ajuste: motivo || 'Ajuste manual de Saldo a Favor',
                  },
                })
                .eq('id', doc.id);
            } else if (m <= restante + 0.009) {
              restante = Math.round((restante - m) * 100) / 100;
            } else {
              const nuevoMontoDoc = Math.round(restante * 100) / 100;
              restante = 0;
              await supabase
                .from('documentos')
                .update({
                  detalles: {
                    ...det,
                    monto: nuevoMontoDoc,
                    monto_bs: nuevoMontoDoc,
                    codigo_inmueble: det.codigo_inmueble || condoCod || undefined,
                    ajustado_manual: true,
                    fecha_ajuste: new Date().toISOString(),
                    motivo_ajuste: motivo || 'Ajuste manual de Saldo a Favor',
                  },
                })
                .eq('id', doc.id);
            }
          }
        } else if (montoNum > sumaVigente + 0.009) {
          // Crear una Nota de Crédito por la diferencia si el nuevo monto es mayor
          const diff = Math.round((montoNum - sumaVigente) * 100) / 100;
          const principalInm = (inms || []).find((i: any) => i.inmueble === condoCod) || (inms || [])[0];
          const identidadDoc = targetId || condoRow?.identidad || principalInm?.identidad || condoCod;
          const contribuyenteDoc = condoRow?.nombre || principalInm?.contribuyente || condoCod || targetId || 'CONTRIBUYENTE';
          const codigoInmDoc = condoCod || principalInm?.inmueble || undefined;
          const hoyIso = new Date().toISOString().split('T')[0];
          const vencIso = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];

          await supabase.from('documentos').insert({
            tipo: 'Nota de Credito',
            identidad: identidadDoc,
            contribuyente: contribuyenteDoc,
            fecha_emision: hoyIso,
            fecha_vencimiento: vencIso,
            estado: 'Vigente',
            detalles: {
              numero_nota: `NC-AJ-${Date.now().toString().slice(-6)}`,
              monto: diff,
              monto_bs: diff,
              monto_original_bs: diff,
              codigo_inmueble: codigoInmDoc,
              codigo_condominio: condoRow ? condoCod : undefined,
              ambito: condoRow ? 'CONDOMINIO' : (codigoInmDoc ? 'LOCAL' : undefined),
              concepto: motivo || 'Ajuste manual de Saldo a Favor',
              origen: 'Ajuste Manual Admin',
              CreadoPor: usuario || 'Admin',
            },
          });
        }
      }
    }

    // 4. Registrar en Auditoría
    await supabase.from('auditoria').insert({
      accion: montoNum === 0 ? 'Eliminar Saldo a Favor Manual' : 'Ajustar Saldo a Favor Manual',
      usuario: usuario || 'Admin',
      modulo: 'Caja de Condominios',
      detalles: {
        codigoCondominio: condoCod,
        identidad: targetId,
        saldo_previo: saldoPrevio,
        nuevo_saldo: montoNum,
        motivo: motivo || 'Ajuste manual solicitado desde Caja de Condominios'
      }
    });

    return NextResponse.json({
      ok: true,
      nuevoSaldo: montoNum,
      mensaje: montoNum === 0 
        ? 'Saldo a favor eliminado correctamente (ajustado a Bs. 0).'
        : `Saldo a favor ajustado a Bs. ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} correctamente.`
    });
  } catch (err: any) {
    console.error('Error en ajustar-saldo-favor:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
