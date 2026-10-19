import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { cajaActiva, prepararCobro, registrarCobro, SolicitudCobro } from '@/lib/condominios/cobro';
import { getIdentidadVariantsExact } from '@/lib/formatters';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/condominios/cobrar
 *  { accion: 'calcular', codigo, modo?, claves?, identidad?, meses?, soloMultas? }  → arma el cobro (no escribe)
 *  { accion: 'cobrar',   ...lo mismo, pago: {...}, usuario }                        → registra (solo con la Caja activa)
 *  modo: 'CONDOMINIO' (una factura al condominio) | 'CONTRIBUYENTE' (una factura por dueño)
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const sol: SolicitudCobro = {
      codigo: String(b.codigo || '').toUpperCase(),
      modo: b.modo === 'CONTRIBUYENTE' ? 'CONTRIBUYENTE' : b.modo === 'CONDOMINIO' ? 'CONDOMINIO' : undefined,
      claves: Array.isArray(b.claves) ? b.claves : [],
      identidad: b.identidad ? String(b.identidad).trim().toUpperCase() : null,
      meses: b.meses ? Number(b.meses) : null,
      mesesPorUnidad: (b.mesesPorUnidad && typeof b.mesesPorUnidad === 'object') ? b.mesesPorUnidad : undefined,
      soloMultas: !!b.soloMultas,
      incluirMultas: !!b.incluirMultas,
      tasaOverride: b.tasaOverride ? Number(b.tasaOverride) : undefined,
      fechaOverride: b.fechaOverride ? String(b.fechaOverride) : undefined,
    };
    if (!sol.codigo && !['estado', 'interruptor'].includes(b.accion)) return NextResponse.json({ error: 'Falta el código del condominio' }, { status: 400 });
    const activa = await cajaActiva();

    if (b.accion === 'estado') return NextResponse.json({ cajaActiva: activa });

    if (b.accion !== 'cobrar' && b.accion !== 'interruptor') {
      const { _datos, ...cobro } = await prepararCobro(sol);
      
      // Extraer saldo a favor con admin
      let saldoFavorDisp = 0;
      let currId = cobro.modo === 'CONTRIBUYENTE' ? cobro.facturas[0]?.identidad : cobro.condo?.identidad;
      const condoCod = cobro.condo?.codigo;

      if (cobro.modo === 'CONDOMINIO' && condoCod) {
        // En modo condominio: el saldo a favor es el abono_bs registrado en condominios
        const { data: cRow } = await sb.from('condominios').select('abono_bs').eq('codigo', condoCod).maybeSingle();
        const abonoCondo = parseFloat(cRow?.abono_bs) || 0;
        if (abonoCondo > 0) {
          saldoFavorDisp = abonoCondo;
        } else {
          // Fallback a inmuebles por código matriz si no estaba en condominios
          const { data: inmSF } = await sb.from('inmuebles').select('saldo_favor_bs').eq('inmueble', condoCod).maybeSingle();
          saldoFavorDisp = parseFloat(inmSF?.saldo_favor_bs) || 0;
        }
      } else if (currId || condoCod) {
        // Modo contribuyente/local individual: saldo del inmueble o contribuyente
        const idVars = currId ? getIdentidadVariantsExact(currId) : [];
        let query = sb.from('inmuebles').select('saldo_favor_bs');
        if (idVars.length > 0 && condoCod) {
          query = query.or(`${idVars.map(v => `identidad.eq.${v}`).join(',')},inmueble.eq.${condoCod}`);
        } else if (idVars.length > 0) {
          query = query.or(idVars.map(v => `identidad.eq.${v}`).join(','));
        } else if (condoCod) {
          query = query.eq('inmueble', condoCod);
        }
        const { data: inmSF } = await query;
        saldoFavorDisp = (inmSF || []).reduce((acc: number, x: any) => acc + (parseFloat(x.saldo_favor_bs) || 0), 0);
      }
      
      saldoFavorDisp = Math.round(saldoFavorDisp * 100) / 100;
      return NextResponse.json({ ...cobro, cajaActiva: activa, saldoFavorActivo: saldoFavorDisp });
    }

    const u = String(b.usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol, estado, permisos').ilike('usuario', u).maybeSingle();
    const admin = trab && (trab.rol === 'Administrador' || u === 'dzara');
    const permisos = (trab?.permisos || {}) as Record<string, boolean>;
    if (!trab || (!admin && !(permisos.ver_caja || permisos.gestionar_pagos))) return NextResponse.json({ error: 'No tiene permiso para cobrar.' }, { status: 403 });

    if (b.accion === 'interruptor') {
      if (!admin) return NextResponse.json({ error: 'Solo el administrador puede activar la Caja de Condominios.' }, { status: 403 });
      if (String(b.motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo.' }, { status: 400 });
      const valor = b.activar ? 'true' : 'false';
      const { error } = await sb.from('sistema_config').upsert({ id: 'condominios_caja_activa', valor });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await sb.from('auditoria').insert({ accion: b.activar ? 'Caja de Condominios ACTIVADA' : 'Caja de Condominios en modo prueba', usuario: `${trab.nombre || trab.usuario} (${trab.usuario})`,
        modulo: '/admin/condominios/caja', detalles: { motivo: String(b.motivo).trim(), _categoria: 'CONDOMINIOS', criticidad: 'ALTA' } });
      return NextResponse.json({ cajaActiva: !!b.activar });
    }
    if (!activa) return NextResponse.json({ error: 'La Caja de Condominios está en MODO PRUEBA: solo calcula, no registra pagos. El administrador la activa en la fecha aprobada.' }, { status: 409 });

    const p = b.pago || {};
    // Excedente (nota de crédito): lo recibido de más sobre el total. Se calcula en el servidor.
    const montoAgregados = Array.isArray(p.pagosAgregados) && p.pagosAgregados.length > 0
      ? p.pagosAgregados.reduce((a: number, x: any) => a + (Number(x?.monto) || 0), 0)
      : 0;
    const recibido = montoAgregados > 0 ? montoAgregados : (Number(p.montoRecibido) || 0);
    const previo = await prepararCobro(sol);
    const excedente = Math.max(0, Math.round((recibido - previo.totales.totalBs) * 100) / 100);
    const r = await registrarCobro(sol, {
      pagoId: String(p.pagoId || ''), metodo: String(p.metodo || ''), banco: p.banco, bancoDestino: p.bancoDestino, referencia: p.referencia,
      montoRecibido: recibido, cajero: String(p.cajero || trab.usuario), usuario: `${trab.nombre || trab.usuario} (${trab.usuario})`,
      pagosAgregados: p.pagosAgregados,
      saldoFavorGenerado: excedente > 0.05 ? excedente : (Number(p.saldoFavorGenerado) || 0),
    });
    const { _datos, ...cobro } = r.cobro as any;
    return NextResponse.json({ ...r, cobro });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
