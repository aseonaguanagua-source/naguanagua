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
      
      // Extraer saldo a favor consolidando únicamente Notas de Crédito VIGENTES autoritativas en `documentos`
      let saldoFavorDisp = 0;
      const esModoContribuyente = cobro.modo === 'CONTRIBUYENTE';
      const currId = esModoContribuyente
        ? (cobro.facturas[0]?.identidad || sol.identidad || cobro.lineas[0]?.identidad)
        : cobro.condo?.identidad;
      const condoCod = String(cobro.condo?.codigo || '').trim().toUpperCase();
      const condoRifClean = String(cobro.condo?.identidad || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const codigosUnidadesCobro = Array.from(
        new Set((cobro.lineas || []).map((l: any) => String(l.inmueble || '').trim().toUpperCase()).filter(Boolean))
      );
      const idVars = currId ? getIdentidadVariantsExact(currId) : [];

      // Saldo en tabla documentos (Notas de Crédito VIGENTES creadas explícitamente)
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
            const orig = String(det.origen_referencia || '').trim();
            // Ignorar notas automáticas fantasma por excedente
            if (orig.startsWith('Excedente Caja de Condominios') || orig.startsWith('Excedente conciliado')) return acc;

            const docInm = String(det.codigo_inmueble || '').trim().toUpperCase();
            const docCondo = String(det.codigo_condominio || '').trim().toUpperCase();
            const docIdentClean = String(n.identidad || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

            if (esModoContribuyente) {
              // En modo contribuyente individual, si el documento tiene el RIF genérico del condominio matriz,
              // solo aplica si apunta explícitamente al código de la unidad hija seleccionada.
              if (docIdentClean === condoRifClean && (!docInm || !codigosUnidadesCobro.includes(docInm))) {
                return acc;
              }
              if (docInm && docInm !== condoCod && !codigosUnidadesCobro.includes(docInm)) {
                return acc;
              }
            } else {
              // En modo CONDOMINIO, no mezclar notas que pertenezcan a un local hijo específico distinto a la matriz
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
    const montoAgregados = Array.isArray(p.pagosAgregados) && p.pagosAgregados.length > 0
      ? p.pagosAgregados.reduce((a: number, x: any) => a + (Number(x?.monto) || 0), 0)
      : 0;
    const recibido = montoAgregados > 0 ? montoAgregados : (Number(p.montoRecibido) || 0);
    const r = await registrarCobro(sol, {
      pagoId: String(p.pagoId || ''), metodo: String(p.metodo || ''), banco: p.banco, bancoDestino: p.bancoDestino, referencia: p.referencia,
      montoRecibido: recibido, cajero: String(p.cajero || trab.usuario), usuario: `${trab.nombre || trab.usuario} (${trab.usuario})`,
      pagosAgregados: p.pagosAgregados,
      saldoFavorGenerado: 0,
    });
    const { _datos, ...cobro } = r.cobro as any;
    return NextResponse.json({ ...r, cobro });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
