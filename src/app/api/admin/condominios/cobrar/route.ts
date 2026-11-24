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
      incluirMultas: typeof b.incluirMultas === 'boolean' ? b.incluirMultas : undefined,
      omitirMultaSeptiembre: !!b.omitirMultaSeptiembre,
      retencionPorcentajeOverride: typeof b.retencionPorcentajeOverride === 'number' ? Number(b.retencionPorcentajeOverride) : undefined,
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
      const normCed = (s: any) => String(s || '').toUpperCase().trim().replace(/^[VEJPG]-?/, '').replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
      const unidadesTarget = (cobro.lineas && cobro.lineas.length > 0)
        ? cobro.lineas
        : (esModoContribuyente
            ? (cobro.estado?.renglones || []).filter((r: any) => {
                if (sol.claves && sol.claves.length > 0) {
                  return sol.claves.includes(r.clave) || (r.padreId && sol.claves.includes(r.padreId)) || (r.inmueble && sol.claves.includes(r.inmueble));
                }
                if (sol.identidad) {
                  return normCed(r.identidad) === normCed(sol.identidad);
                }
                return false;
              })
            : []);
      const currId = esModoContribuyente
        ? (cobro.facturas[0]?.identidad || sol.identidad || unidadesTarget[0]?.identidad)
        : cobro.condo?.identidad;
      const condoCod = String(cobro.condo?.codigo || '').trim().toUpperCase();
      const condoRifClean = String(cobro.condo?.identidad || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const codigosUnidadesCobro = Array.from(
        new Set(
          unidadesTarget
            .flatMap((l: any) => [l.inmueble, l.padreInmueble])
            .map((x: any) => String(x || '').trim().toUpperCase())
            .filter(Boolean)
        )
      );
      const idVars = currId ? getIdentidadVariantsExact(currId) : [];

      let saldoDocs = 0;
      try {
        const { data: docsData } = await sb
          .from('documentos')
          .select('*')
          .eq('tipo', 'Nota de Credito')
          .eq('estado', 'Vigente');

        const currIdClean = String(currId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const idVarsSet = new Set(idVars.map(v => String(v || '').trim().toUpperCase()));

        saldoDocs = (docsData || []).reduce((acc: number, n: any) => {
          let det: any = {};
          try { det = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {}); } catch(e){}

          const docAmbito = String(det.ambito || '').trim().toUpperCase();
          const docInm = String(det.codigo_inmueble || det.cod_inmueble || '').trim().toUpperCase();
          const docCondo = String(det.codigo_condominio || '').trim().toUpperCase();
          const docIdentUpper = String(n.identidad || '').trim().toUpperCase();
          const docIdentClean = docIdentUpper.replace(/[^A-Z0-9]/gi, '').toUpperCase();

          const matchesIdent = (currIdClean && docIdentClean === currIdClean) || idVarsSet.has(docIdentUpper);
          const matchesUnitCode = codigosUnidadesCobro.length > 0 && (
            (docInm && codigosUnidadesCobro.includes(docInm)) ||
            codigosUnidadesCobro.includes(docIdentUpper)
          );
          const matchesCondoCode = condoCod && (docCondo === condoCod || docInm === condoCod || docIdentUpper === condoCod);

          if (esModoContribuyente) {
            if (!matchesIdent && !matchesUnitCode) return acc;
            // En modo Dueño Individual o Multas Separadas: NUNCA usar notas de crédito del Condominio matriz
            // ni notas de crédito de otros inmuebles fuera del condominio que compartan el mismo RIF
            if (docAmbito === 'CONDOMINIO' || (docInm && docInm === condoCod)) {
              return acc;
            }
            if (docIdentClean === condoRifClean && (!docInm || !codigosUnidadesCobro.includes(docInm))) {
              return acc;
            }
            if (docInm && codigosUnidadesCobro.length > 0 && !codigosUnidadesCobro.includes(docInm)) {
              return acc;
            }
            if (!docInm && codigosUnidadesCobro.length > 0 && !codigosUnidadesCobro.includes(docIdentUpper) && (!docCondo || docCondo !== condoCod)) {
              return acc;
            }
          } else {
            if (!matchesIdent && !matchesCondoCode) return acc;
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
      } catch (e) {
        console.warn('Error calculando saldo de notas de crédito en documentos:', e);
      }

      saldoFavorDisp = saldoDocs >= 1.00 ? Math.round(saldoDocs * 100) / 100 : 0;

      // Convenios de pago activos formalizados (del condominio o de cualquiera de sus unidades)
      let conveniosList: any[] = [];
      try {
        const { data: allActiveConvs } = await sb
          .from('convenios_pago')
          .select('*, convenios_cuotas(*)')
          .in('estado', ['Al Día', 'Activo']);

        const renglones = cobro.estado?.renglones || [];
        const unitIdDigitsSet = new Set<string>();
        const unitInmDigitsSet = new Set<string>();
        if (cobro.condo?.identidad) {
          const d = String(cobro.condo.identidad).replace(/\D/g, '');
          if (d.length >= 4) unitIdDigitsSet.add(d);
        }
        if (sol.identidad) {
          const d = String(sol.identidad).replace(/\D/g, '');
          if (d.length >= 4) unitIdDigitsSet.add(d);
        }
        renglones.forEach((r: any) => {
          const dId = String(r.identidad || '').replace(/\D/g, '');
          if (dId.length >= 4) unitIdDigitsSet.add(dId);
          const dInm = String(r.inmueble || '').replace(/\D/g, '');
          if (dInm.length >= 3) unitInmDigitsSet.add(dInm);
          const dPadre = String(r.padreInmueble || '').replace(/\D/g, '');
          if (dPadre.length >= 3) unitInmDigitsSet.add(dPadre);
        });

        conveniosList = (allActiveConvs || []).filter((cv: any) => {
          const cvIdDigits = String(cv.identidad || '').replace(/\D/g, '');
          const cvNumDigits = String(cv.numero || '').replace(/\D/g, '');
          if (cvIdDigits.length >= 4 && unitIdDigitsSet.has(cvIdDigits)) return true;
          if (cvNumDigits.length >= 3 && unitInmDigitsSet.has(cvNumDigits)) return true;
          return false;
        });
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
      comprobanteRetencion: p.comprobanteRetencion ? String(p.comprobanteRetencion).trim() : undefined,
      fechaComprobanteRetencion: p.fechaComprobanteRetencion ? String(p.fechaComprobanteRetencion).trim() : undefined,
      comprobanteRetencionUrl: p.comprobanteRetencionUrl ? String(p.comprobanteRetencionUrl).trim() : undefined,
      comprobanteRetencionNombre: p.comprobanteRetencionNombre ? String(p.comprobanteRetencionNombre).trim() : undefined,
      porcentajeRetencionIva: typeof p.porcentajeRetencionIva === 'number' ? p.porcentajeRetencionIva : undefined,
    });
    const { _datos, ...cobro } = r.cobro as any;
    return NextResponse.json({ ...r, cobro });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
