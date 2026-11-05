import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { acreditarSaldoFavor } from '@/lib/saldoFavor';
import { parseLocalFloat } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { identidad, contribuyente, monto, motivo, referencia, codigoCondominio, codigoInmueble, ambito, modalidadOrigen, usuario } = body;

    if (!identidad) {
      return NextResponse.json({ error: 'Falta la cédula / RIF o código de identidad.' }, { status: 400 });
    }

    const montoNum = Math.round(parseLocalFloat(monto) * 100) / 100;
    if (isNaN(montoNum) || montoNum <= 0) {
      return NextResponse.json({ error: 'El monto de la nota de crédito debe ser mayor a 0.' }, { status: 400 });
    }

    const refFinal = (referencia || '').trim() || `NC-${Date.now().toString().slice(-6)}`;
    const targetId = String(identidad).trim().toUpperCase();
    const rawCondoCode = codigoCondominio ? String(codigoCondominio).trim().toUpperCase().split(/\s+/)[0] : undefined;
    const rawInmCode = codigoInmueble ? String(codigoInmueble).trim().toUpperCase().split(/\s+/)[0] : rawCondoCode;

    // Verificar si el código realmente corresponde a un condominio registrado en `condominios`
    let isRealCondo = false;
    if (rawCondoCode) {
      const { data: condoMatch } = await supabase
        .from('condominios')
        .select('id, codigo')
        .eq('codigo', rawCondoCode)
        .neq('estado', 'Eliminado')
        .limit(1)
        .maybeSingle();
      if (condoMatch) isRealCondo = true;
    }

    const condoCode = isRealCondo ? rawCondoCode : undefined;
    const inmCode = rawInmCode;
    const ambitoFinal = ambito
      ? (ambito === 'CONDOMINIO' && !isRealCondo && !modalidadOrigen ? 'CONTRIBUYENTE' : ambito)
      : (inmCode && condoCode && inmCode !== condoCode ? 'LOCAL' : (isRealCondo ? 'CONDOMINIO' : 'CONTRIBUYENTE'));

    // 1. Insertar el documento oficial
    const { data: doc, error: errDoc } = await supabase
      .from('documentos')
      .insert([{
        identidad: targetId,
        contribuyente: contribuyente || 'Contribuyente',
        tipo: 'Nota de Credito',
        estado: 'Vigente',
        detalles: JSON.stringify({
          monto: montoNum.toFixed(2),
          monto_bs: montoNum,
          ambito: ambitoFinal,
          modalidad_origen: modalidadOrigen || undefined,
          codigo_inmueble: inmCode,
          codigo_condominio: condoCode,
          origen_referencia: refFinal,
          motivo: motivo || 'Nota de crédito / saldo a favor registrado administrativamente',
          creado_por: usuario || 'Admin',
          fecha_emision: new Date().toISOString()
        })
      }])
      .select()
      .single();

    if (errDoc) {
      return NextResponse.json({ error: `Error creando documento: ${errDoc.message}` }, { status: 500 });
    }

    // 2. Acreditar saldo a favor en el inmueble específico (local hijo) o en el condominio matriz
    const resAcreditar = await acreditarSaldoFavor(targetId, montoNum, inmCode || condoCode, supabase);
    if (!resAcreditar.ok) {
      console.warn('Aviso acreditando saldo a favor:', resAcreditar.error);
    }

    // 3. Auditoría
    try {
      await supabase.from('auditoria').insert({
        accion: 'Nota de Crédito Creada',
        usuario: usuario || 'Admin',
        modulo: condoCode ? 'Condominios' : 'Contribuyentes',
        detalles: {
          documento_id: doc?.id,
          identidad: targetId,
          contribuyente,
          monto_bs: montoNum,
          referencia: refFinal,
          motivo: motivo || 'Creación administrativa',
          codigo_condominio: condoCode,
          nuevo_saldo: resAcreditar.nuevoSaldo
        }
      });
    } catch (e) {
      console.warn('Error registrando auditoría:', e);
    }

    return NextResponse.json({
      ok: true,
      documento: doc,
      nuevoSaldo: resAcreditar.nuevoSaldo,
      mensaje: `Nota de crédito de Bs. ${montoNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} generada con éxito.`
    });
  } catch (err: any) {
    console.error('Error en crear-nota-credito:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
