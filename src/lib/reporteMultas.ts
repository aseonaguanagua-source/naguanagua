// Cálculo del reporte de MULTAS por mes (dentro de condominio / contribuyentes). Ver /api/admin/reporte-multas.
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { tasaVigente, calcularEstado } from '@/lib/condominios/servicio';
import { calcularDeudaInmueble, mesesHistoricos, tieneMoraMes, codigosContenedoresNA, r2 } from '@/lib/deudaMensual';
import { isResidencialInm } from '@/lib/calculos';

const ym = (iso: string) => String(iso).slice(0, 7);

/** Lee una tabla completa en páginas de 1000, varias a la vez (mucho más rápido que secuencial). */
async function todasParalelo(tabla: string, cols: string, orden = 'id'): Promise<any[]> {
  const { count } = await sb.from(tabla).select('*', { count: 'exact', head: true });
  const paginas = Math.ceil((count || 0) / 1000);
  const out: any[] = [];
  for (let i = 0; i < paginas; i += 20) {
    const lote = await Promise.all(Array.from({ length: Math.min(20, paginas - i) }, (_, k) =>
      sb.from(tabla).select(cols).order(orden).range((i + k) * 1000, (i + k) * 1000 + 999).then(r => {
        if (r.error) throw new Error(r.error.message); return r.data || [];
      })));
    lote.forEach(l => out.push(...l));
  }
  return out;
}

export async function generarReporteMultas() {
    const hoy = new Date();
    const colsInm = 'inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, cant_inmuebles, mmv_mes, meses_deuda, notas, multa_bs, deuda_congelada_bs, estado, condominio_padre_id, padre_id, es_condominio, agente_retencion';
    const [tasa, condos, unidades, multasR, todosInm] = await Promise.all([
      tasaVigente(),
      todasParalelo('condominios', '*', 'codigo'),
      todasParalelo('condominio_unidades', '*'),
      sb.from('condominio_multas').select('*').eq('estado', 'Pendiente'),
      todasParalelo('inmuebles', colsInm),
    ]);
    const multas = multasR.data || [];
    const infoInm = new Map<string, any>();
    todosInm.forEach((r: any) => r.inmueble && infoInm.set(r.inmueble, r));

    const porCondo = new Map<string, any[]>();
    unidades.forEach((u: any) => {
      const inf = infoInm.get(u.inmueble) || {};
      u.agente_retencion = !!inf.agente_retencion; u.multa_bs = parseFloat(inf.multa_bs || '0');
      if (!porCondo.has(u.condominio_id)) porCondo.set(u.condominio_id, []);
      porCondo.get(u.condominio_id)!.push(u);
    });
    const multasPor = new Map<string, any[]>();
    (multas || []).forEach((m: any) => { if (!multasPor.has(m.condominio_id)) multasPor.set(m.condominio_id, []); multasPor.get(m.condominio_id)!.push(m); });

    const enCondominio: any[] = [];
    const codigosModulo = new Set<string>();
    for (const c of condos as any[]) {
      codigosModulo.add(c.codigo);
      const us = porCondo.get(c.id) || [];
      us.forEach((u: any) => u.inmueble && codigosModulo.add(u.inmueble));
      c.agente_retencion = !!infoInm.get(c.codigo)?.agente_retencion;
      const e = calcularEstado(c, us, tasa, hoy, multasPor.get(c.id) || []);
      for (const r of e.renglones) {
        // Meses con multa = los mismos que cobra el motor: todos menos el más reciente y menos los exonerados
        const conMulta = r.deuda.porMes.map((m, i) => (m.multaBs > 0 ? r.periodos[i] : null)).filter(Boolean) as string[];
        const multaBs = r2(r.deuda.multaBs + r.multaExtraBs + r.multasManualesBs);
        if (multaBs <= 0.009 && !conMulta.length) continue;
        enCondominio.push({
          condominio: c.codigo, condominioNombre: c.nombre, modalidad: c.modalidad,
          pagaMulta: e.quienPaga.multa,
          inmueble: r.inmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad, actividad: r.actividad,
          mesesMulta: conMulta,
          mesesMultaSinFecha: r.multaMeses, // multas que quedaron de pagos parciales anteriores (sin mes específico)
          multasManuales: r.multasManuales.map(m => ({ concepto: m.concepto, periodo: m.periodo, montoBs: m.montoBs })),
          multaMesesBs: r.deuda.multaBs, multaExtraBs: r.multaExtraBs, multasManualesBs: r.multasManualesBs,
          multaTotalBs: multaBs,
        });
      }
    }

    // ── 2) CONTRIBUYENTES (fuera del módulo de condominios) ──────────────────
    const vivosTodos = todosInm.filter((i: any) => i.estado !== 'Eliminado');
    const vivos = vivosTodos.filter((i: any) => !codigosModulo.has(i.inmueble) && i.es_condominio !== true
      && ((parseInt(String(i.meses_deuda || 0)) || 0) > 1 || (parseFloat(i.multa_bs || 0) || 0) > 0 || (parseFloat(i.deuda_congelada_bs || 0) || 0) > 0));
    // Contenedores N/A con hijos: no se cobran (cobran sus actividades)
    const na = new Set(codigosContenedoresNA(vivosTodos));

    const contribuyentes: any[] = [];
    for (const inm of vivos as any[]) {
      if (na.has(inm.inmueble)) continue;
      const meses = (parseInt(String(inm.meses_deuda || 0)) || 0) > 0 ? mesesHistoricos(inm, hoy) : [];
      const d = calcularDeudaInmueble(inm, tasa, meses.map(m => ({ emision: m.emision, esUltimo: m.esUltimo })), hoy);
      const conMulta = meses.filter(m => tieneMoraMes(inm, m.emision, m.esUltimo, hoy)).map(m => ym(m.emision));
      const fijaBs = r2((parseFloat(inm.multa_bs || 0) || 0) + (parseFloat(inm.deuda_congelada_bs || 0) || 0));
      const multaTotal = r2(d.multa + fijaBs);
      if (multaTotal <= 0.009) continue;
      contribuyentes.push({
        inmueble: inm.inmueble, contribuyente: inm.contribuyente, identidad: inm.identidad,
        actividad: inm.actividad_principal, residencial: isResidencialInm(inm),
        mesesDeuda: meses.length, mesesMulta: conMulta,
        multaMesesBs: d.multa, multaFijaBs: fijaBs, multaTotalBs: multaTotal,
      });
    }

    const tot = (arr: any[]) => r2(arr.reduce((s, x) => s + x.multaTotalBs, 0));
    return {
      tasa, generado: hoy.toISOString(),
      enCondominio, contribuyentes,
      resumen: {
        enCondominio: { registros: enCondominio.length, totalBs: tot(enCondominio) },
        contribuyentes: { registros: contribuyentes.length, totalBs: tot(contribuyentes) },
      },
    };
}
