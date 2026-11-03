import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { cajaActiva, prepararCobro, registrarCobro, SolicitudCobro } from '@/lib/condominios/cobro';
import { getIdentidadVariantsExact, parseLocalFloat } from '@/lib/formatters';

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
      incluirMultas: b.incluirMultas !== undefined ? !!b.incluirMultas : true,
      omitirMultaSeptiembre: !!b.omitirMultaSeptiembre,
      tasaOverride: b.tasaOverride ? Number(b.tasaOverride) : undefined,
      fechaOverride: b.fechaOverride ? String(b.fechaOverride) : undefined,
    };
    if (!sol.codigo && !['estado', 'interruptor'].includes(b.accion)) return NextResponse.json({ error: 'Falta el código del condominio' }, { status: 400 });
    const activa = await cajaActiva();

    if (b.accion === 'estado') return NextResponse.json({ cajaActiva: activa });

    if (b.accion !== 'cobrar' && b.accion !== 'interruptor') {
      const { _datos, ...cobro } = await prepararCobro(sol);
      
      // Extraer saldo a favor consolidando según el modo (CONDOMINIO vs CONTRIBUYENTE individual)
      let saldoFavorDisp = 0;
      const esModoContribuyente = cobro.modo === 'CONTRIBUYENTE';
      const currId = esModoContribuyente
        ? (cobro.facturas[0]?.identidad || sol.identidad || cobro.lineas[0]?.identidad)
        : cobro.condo?.identidad;
      const condoCod = cobro.condo?.codigo;
      const codigosUnidadesCobro = Array.from(
        new Set((cobro.lineas || []).map((l: any) => String(l.inmueble || '').trim().toUpperCase()).filter(Boolean))
      );
      const idVars = currId ? getIdentidadVariantsExact(currId) : [];

      // 1. Saldo registrado en tabla condominios (SOLO aplica cuando se cobra a nombre del CONDOMINIO matriz)
      let abonoCondo = 0;
      if (!esModoContribuyente && condoCod) {
        const { data: cRow } = await sb.from('condominios').select('abono_bs').eq('codigo', condoCod).maybeSingle();
        abonoCondo = parseFloat(cRow?.abono_bs) || 0;
      }

      // 2. Saldo en tabla inmuebles (si es CONTRIBUYENTE: solo sus unidades/RIF; si es CONDOMINIO: del condominio matriz)
      let saldoInm = 0;
      if (esModoContribuyente) {
        const orsInm: string[] = [];
        if (idVars.length > 0) orsInm.push(...idVars.map(v => `identidad.eq.${v}`));
        if (codigosUnidadesCobro.length > 0) orsInm.push(...codigosUnidadesCobro.map(c => `inmueble.eq.${c}`));
        if (orsInm.length > 0) {
          const { data: inmSF } = await sb.from('inmuebles').select('saldo_favor_bs, inmueble, condominio_padre_id').or(orsInm.join(','));
          // Excluir la fila del condominio padre por si compartiera RIF
          saldoInm = (inmSF || [])
            .filter((x: any) => String(x.inmueble || '').toUpperCase() !== String(condoCod || '').toUpperCase())
            .reduce((acc: number, x: any) => acc + (parseFloat(x.saldo_favor_bs) || 0), 0);
        }
      } else {
        let queryInm = sb.from('inmuebles').select('saldo_favor_bs, inmueble');
        if (idVars.length > 0 && condoCod) {
          queryInm = queryInm.or(`${idVars.map(v => `identidad.eq.${v}`).join(',')},inmueble.eq.${condoCod}`);
        } else if (idVars.length > 0) {
          queryInm = queryInm.or(idVars.map(v => `identidad.eq.${v}`).join(','));
        } else if (condoCod) {
          queryInm = queryInm.eq('inmueble', condoCod);
        }
        const { data: inmSF } = await queryInm;
        saldoInm = (inmSF || []).reduce((acc: number, x: any) => acc + (parseFloat(x.saldo_favor_bs) || 0), 0);
      }

      // 3. Saldo en tabla documentos (Notas de Crédito VIGENTES)
      let saldoDocs = 0;
      try {
        let qDocs = sb.from('documentos').select('*').eq('tipo', 'Nota de Credito').eq('estado', 'Vigente');
        const orsDocs: string[] = [];
        if (idVars.length > 0) orsDocs.push(...idVars.map(v => `identidad.eq.${v}`));
        if (esModoContribuyente) {
          if (codigosUnidadesCobro.length > 0) orsDocs.push(...codigosUnidadesCobro.map(c => `identidad.eq.${c}`));
        } else if (condoCod) {
          orsDocs.push(`identidad.eq.${condoCod}`);
        }
        if (orsDocs.length > 0) {
          const { data: docsData } = await qDocs.or(orsDocs.join(','));
          saldoDocs = (docsData || []).reduce((acc: number, n: any) => {
            let det: any = {};
            try { det = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {}); } catch(e){}
            const m = parseLocalFloat(det.monto_bs ?? det.monto ?? 0);
            return acc + (isNaN(m) ? 0 : m);
          }, 0);
        }
      } catch (e) {
        console.warn('Error calculando saldo de notas de crédito en documentos:', e);
      }

      // Saldo disponible consolidado (ignorando residuos de redondeo menores a Bs. 1,00)
      saldoFavorDisp = Math.max(abonoCondo, saldoInm, saldoDocs);
      saldoFavorDisp = saldoFavorDisp >= 1.00 ? Math.round(saldoFavorDisp * 100) / 100 : 0;

      // Mantener sincronizada la tabla condominios SOLO cuando se está en modo CONDOMINIO
      if (!esModoContribuyente && condoCod && saldoFavorDisp >= 1.00 && Math.abs(abonoCondo - saldoFavorDisp) > 0.05) {
        try {
          await sb.from('condominios').update({ abono_bs: saldoFavorDisp }).eq('codigo', condoCod);
        } catch (eSync) {
          console.warn('Error sincronizando condominios.abono_bs:', eSync);
        }
      }

      // Convenios de pago activos formalizados
      let conveniosList: any[] = [];
      try {
        const { data: convs } = await sb.from('convenios_pago').select('*, convenios_cuotas(*)').eq('estado', 'Al Día');
        conveniosList = convs || [];
      } catch (err) {
        console.warn('Error fetching convenios in condominios/cobrar:', err);
      }

      return NextResponse.json({ ...cobro, cajaActiva: activa, saldoFavorActivo: saldoFavorDisp, convenios: conveniosList });
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
