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
    const condoCod = codigoCondominio ? String(codigoCondominio).trim().toUpperCase() : null;
    const targetId = identidad ? String(identidad).trim().toUpperCase() : null;

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
    if (condoCod) {
      const { data: condoRow } = await supabase
        .from('condominios')
        .select('id, abono_bs')
        .eq('codigo', condoCod)
        .maybeSingle();

      if (condoRow) {
        saldoPrevio += parseFloat(condoRow.abono_bs || '0') || 0;
        await supabase.from('condominios').update({ abono_bs: montoNum }).eq('id', condoRow.id);
      }
    }

    // 3. Si se ajustó a 0 (eliminación total explícita) y NO se indicó preservar las notas existentes:
    const noAnularNotas = body.noAnularNotas === true;
    if (montoNum === 0 && !noAnularNotas && body.anularDocumentos === true) {
      // Buscar notas de crédito vigentes para este condominio/identidad y marcarlas o eliminarlas
      const docQuery = supabase.from('documentos')
        .update({ estado: 'Anulado' })
        .eq('tipo', 'Nota de Credito')
        .eq('estado', 'Vigente');
      
      if (idVars.length > 0 && condoCod) {
        await docQuery.or(`${idVars.map(v => `identidad.eq.${v}`).join(',')},identidad.eq.${condoCod}`);
      } else if (condoCod) {
        await docQuery.eq('identidad', condoCod);
      } else if (idVars.length > 0) {
        await docQuery.in('identidad', idVars);
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
