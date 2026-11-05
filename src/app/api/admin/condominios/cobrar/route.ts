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
      modalidad: ['completo', 'abono_locales', 'individual', 'multas_separadas'].includes(b.modalidad) ? b.modalidad : undefined,
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
      
      // Extraer saldo a favor consolidando únicamente Notas de Crédito VIGENTES autoritativas en `documentos`
      // diferenciando estrictamente CONDOMINIO (Pago Completo / Abono por Locales) vs LOCAL (Individual / Multas)
      let saldoFavorDisp = 0;
      const esModoContribuyente = cobro.modo === 'CONTRIBUYENTE' || !!sol.soloMultas;
      const currId = esModoContribuyente
        ? (cobro.facturas[0]?.identidad || sol.identidad || cobro.lineas[0]?.identidad)
        : cobro.condo?.identidad;
      const condoCod = String(cobro.condo?.codigo || '').trim().toUpperCase();
      const condoRifClean = String(cobro.condo?.identidad || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const codigosUnidadesCobro = Array.from(
        new Set((cobro.lineas || []).map((l: any) => String(l.inmueble || '').trim().toUpperCase()).filter(Boolean))
      );
      const idVars = currId ? getIdentidadVariantsExact(currId) : [];

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

            const docAmbito = String(det.ambito || '').trim().toUpperCase();
            const docInm = String(det.codigo_inmueble || '').trim().toUpperCase();
            const docCondo = String(det.codigo_condominio || '').trim().toUpperCase();
            const docIdentClean = String(n.identidad || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

            if (esModoContribuyente) {
              // En modo Dueño Individual o Multas Separadas: NUNCA usar notas de crédito del Condominio matriz
              if (docAmbito === 'CONDOMINIO' || (docInm && docInm === condoCod)) {
                return acc;
              }
              if (docIdentClean === condoRifClean && (!docInm || !codigosUnidadesCobro.includes(docInm))) {
                return acc;
              }
              if (docInm && !codigosUnidadesCobro.includes(docInm)) {
                return acc;
              }
            } else {
              // En modo CONDOMINIO (Pago Completo o Abono por Locales): NUNCA mezclar notas de locales individuales
              if (docAmbito === 'LOCAL') {
                return acc;
              }
              if (docInm && docInm !== condoCod) {
                return acc;
              }
              if (docCondo && condoCod && docCondo !== condoCod) {
                return acc;
              }
            }

            const m = parseLocalFloat(det.monto_bs ?? det.monto ?? 0);
            return acc + (isNaN(m) ? 0 : m);
          }, 0);
        }
      } catch (e) {
        console.warn('Error calculando saldo de notas de crédito en documentos:', e);
      }

      saldoFavorDisp = saldoDocs >= 1.00 ? Math.round(saldoDocs * 100) / 100 : 0;

      // Convenios de pago activos formalizados
      let conveniosList: any[] = [];
      try {
        const condoIdVars = cobro.condo?.identidad ? getIdentidadVariantsExact(cobro.condo.identidad) : [];
        const convIdentVars = Array.from(new Set([...idVars, ...condoIdVars, ...(condoCod ? [condoCod] : [])].filter(Boolean)));
        let qConvs = sb.from('convenios_pago').select('*, convenios_cuotas(*)').eq('estado', 'Al Día');
        if (convIdentVars.length > 0) {
          qConvs = qConvs.in('identidad', convIdentVars);
        } else {
          qConvs = qConvs.limit(200);
        }
        const { data: convs } = await qConvs;
        conveniosList = convs || [];
      } catch (err) {
        console.warn('Error fetching convenios in condominios/cobrar:', err);
      }

      return NextResponse.json({ ...cobro, cajaActiva: activa, saldoFavorActivo: saldoFavorDisp, convenios: conveniosList });
    }

    const u = String(b.usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol, estado, permisos').ilike('usuario', u).limit(1).maybeSingle();
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
    const cobroCalc = await prepararCobro(sol);
    const sfUsado = Array.isArray(p.pagosAgregados)
      ? p.pagosAgregados.filter((x: any) => x?.metodo === 'Saldo a Favor').reduce((a: number, x: any) => a + (Number(x?.monto) || 0), 0)
      : (p.metodo === 'Saldo a Favor' ? (Number(p.montoRecibido) || 0) : 0);
    // Monto pagado por medios reales (excluyendo Saldo a Favor para no duplicar la nota consumida)
    const montoRealesAgregados = Array.isArray(p.pagosAgregados) && p.pagosAgregados.length > 0
      ? p.pagosAgregados.filter((x: any) => x?.metodo !== 'Saldo a Favor').reduce((a: number, x: any) => a + (Number(x?.monto) || 0), 0)
      : (p.metodo !== 'Saldo a Favor' ? (Number(p.montoRecibido) || 0) : 0);
    const totalDeudaNeta = Math.max(0, Math.round(((Number(cobroCalc.totales.totalBs) || 0) - sfUsado) * 100) / 100);
    const excedenteCalc = montoRealesAgregados > totalDeudaNeta + 0.99
      ? Math.round((montoRealesAgregados - totalDeudaNeta) * 100) / 100
      : 0;
    const excedenteFinal = Number(p.saldoFavorGenerado) >= 1.00
      ? Math.round(Number(p.saldoFavorGenerado) * 100) / 100
      : excedenteCalc;
    const recibidoTotal = Math.round((montoRealesAgregados + sfUsado) * 100) / 100;

    const r = await registrarCobro(sol, {
      pagoId: String(p.pagoId || ''), metodo: String(p.metodo || ''), banco: p.banco, bancoDestino: p.bancoDestino, referencia: p.referencia,
      montoRecibido: recibidoTotal, cajero: String(p.cajero || trab.usuario), usuario: `${trab.nombre || trab.usuario} (${trab.usuario})`,
      pagosAgregados: p.pagosAgregados,
      saldoFavorGenerado: excedenteFinal >= 1.00 ? excedenteFinal : 0,
    });
    const { _datos, ...cobro } = r.cobro as any;
    return NextResponse.json({ ...r, cobro });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
