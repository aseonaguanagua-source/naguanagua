/**
 * Servicio de condominios (servidor). Lee las tablas del módulo y calcula TODO con el motor único.
 * Ninguna pantalla calcula montos por su cuenta: todas llaman a estas funciones.
 */
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import * as M from './motor';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function tasaVigente(): Promise<number> {
  const { data } = await sb.from('sistema_config').select('id, valor').in('id', ['tasa_bcv_manual', 'tasa_bcv_semanal']);
  const v = (id: string) => parseFloat(String(data?.find((c: any) => c.id === id)?.valor || 0)) || 0;
  return v('tasa_bcv_manual') || v('tasa_bcv_semanal');
}

/** Lee todas las filas de una consulta paginando de 1000 en 1000. */
async function todas<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** ¿Cada unidad lleva su propia deuda? (INDIVIDUAL o tarifa propia por local) */
export const unidadesPropias = (c: any) => c.modalidad === 'INDIVIDUAL' || !!c.cobro_tarifa_por_unidad;

/** Meses de deuda actuales en `inmuebles` (fuente común con Contribuyentes, Caja y portal). */
export async function mesesInmuebles(codigos?: string[]): Promise<Map<string, { meses: number; estado: string; id: string }>> {
  const out = new Map<string, { meses: number; estado: string; id: string }>();
  const add = (rows: any[]) => rows.forEach(r => out.set(String(r.inmueble || '').toUpperCase(), { meses: Math.max(0, parseInt(String(r.meses_deuda ?? 0)) || 0), estado: r.estado, id: r.id }));
  if (codigos) {
    const cods = [...new Set(codigos.filter(Boolean).map(c => c.toUpperCase()))];
    for (let i = 0; i < cods.length; i += 300) {
      const { data, error } = await sb.from('inmuebles').select('id,inmueble,meses_deuda,estado').in('inmueble', cods.slice(i, i + 300));
      if (error) throw new Error(error.message);
      add(data || []);
    }
    return out;
  }
  const { count } = await sb.from('inmuebles').select('id', { count: 'exact', head: true });
  const paginas = Math.ceil((count || 0) / 1000);
  for (let p = 0; p < paginas; p += 8) {
    const lotes = await Promise.all(Array.from({ length: Math.min(8, paginas - p) }, (_, k) =>
      sb.from('inmuebles').select('id,inmueble,meses_deuda,estado').order('id').range((p + k) * 1000, (p + k) * 1000 + 999)));
    for (const l of lotes) { if (l.error) throw new Error(l.error.message); add(l.data || []); }
  }
  return out;
}

/**
 * Mientras los condominios sigan también en Contribuyentes/Caja, la deuda del módulo se toma EN VIVO de
 * `inmuebles.meses_deuda` para que todas las pantallas muestren lo mismo:
 *  - condominio: meses del inmueble padre (si existe y no está eliminado);
 *  - unidad con deuda propia: meses de su inmueble; si no tiene inmueble (huérfano de SIGYR), lo guardado;
 *  - unidad de un condominio centralizado: sigue al condominio.
 */
export function sincronizar(condo: any, unidades: any[], meses: Map<string, { meses: number; estado: string }>, hoy = new Date()) {
  const p = meses.get(String(condo.codigo).toUpperCase());
  const c = p && p.estado !== 'Eliminado' ? { ...condo, aseo_pendiente_desde: M.pendienteDesdeParaMeses(p.meses, hoy) } : condo;
  const propias = unidadesPropias(c);
  const us = unidades.map(u => {
    if (!propias) return { ...u, aseo_pendiente_desde: c.aseo_pendiente_desde };
    const m = u.inmueble ? meses.get(String(u.inmueble).toUpperCase()) : undefined;
    return m ? { ...u, aseo_pendiente_desde: M.pendienteDesdeParaMeses(m.meses, hoy) } : u;
  });
  return { condo: c, unidades: us };
}

export const aMotorCondo = (c: any): M.Condominio => ({
  codigo: c.codigo, tipo: c.tipo, modalidad: c.modalidad, cant_declarada: c.cant_declarada,
  actividad: c.actividad, tarifa_mmv: c.tarifa_mmv != null ? Number(c.tarifa_mmv) : null,
  tarifa_fija_bs: c.tarifa_fija_bs != null ? Number(c.tarifa_fija_bs) : null,
  agente_retencion: !!c.agente_retencion, permite_pago_por_unidad: !!c.permite_pago_por_unidad,
  permite_abonos: c.permite_abonos !== false, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad,
});
export const aMotorUnidad = (u: any): M.Unidad => ({
  id: u.id, inmueble: u.inmueble, identidad: u.identidad, actividad: u.actividad,
  tarifa_mmv: u.tarifa_mmv != null ? Number(u.tarifa_mmv) : null, estado: u.estado,
});

export interface RenglonEstado {
  clave: string;
  inmueble: string | null;
  numero: string | null;
  propietario: string | null;
  identidad: string | null;
  estado: string;
  cantidad: number;
  mensualBs: number;
  pendienteDesde: string | null;
  periodos: string[];
  deuda: M.DeudaPeriodos;
  /** Multas que quedaron pendientes aunque el aseo ya se pagó */
  multaExtraBs: number;
  totalBs: number;
}

export interface EstadoCuenta {
  tasa: number;
  mensual: M.CargoMensual;
  renglones: RenglonEstado[];
  totales: { baseBs: number; multaBs: number; ivaBs: number; retencionBs: number; totalBs: number; mesesMax: number; unidadesConDeuda: number };
  quienPaga: { aseo: 'CONDOMINIO' | 'UNIDAD'; multa: 'CONDOMINIO' | 'UNIDAD' };
}

/** Estado de cuenta de un condominio con la tarifa vigente. */
export function calcularEstado(condoRow: any, unidadesRows: any[], tasa: number, hoy = new Date()): EstadoCuenta {
  const c = aMotorCondo(condoRow);
  const unidades = unidadesRows.map(aMotorUnidad);
  const porId = new Map(unidadesRows.map((u: any) => [u.id, u]));
  const res = M.esResidencial(c);
  const reparto = M.cargosPorUnidad(c, unidades, tasa);
  const tMulta = res ? M.TASA_MULTA_RES : M.TASA_MULTA_COM;

  const renglones: RenglonEstado[] = reparto.map(r => {
    const u: any = porId.get(r.clave);
    // Unidad registrada: sus propios meses. Grupo sin registrar / tarifa fija: los meses del condominio.
    const desde = u ? u.aseo_pendiente_desde : condoRow.aseo_pendiente_desde;
    const meses = M.mesesPendientes(desde, hoy);
    const deuda = M.deudaPorMeses(meses, r.montoBs, res, c.agente_retencion);
    const multaMeses = Number(u ? u.multa_meses : condoRow.multa_meses) || 0;
    const multaExtraBs = r2(r.montoBs * tMulta * multaMeses);
    return {
      clave: r.clave, inmueble: u?.inmueble ?? null, numero: u?.numero ?? null,
      propietario: u?.propietario ?? (r.clave === M.SIN_REGISTRAR ? `${r.cantidad} unidad(es) declaradas sin registrar` : null),
      identidad: u?.identidad ?? null, estado: u?.estado ?? 'Declarada', cantidad: r.cantidad,
      mensualBs: r.montoBs, pendienteDesde: desde || null, periodos: M.periodosPendientes(desde, hoy),
      deuda, multaExtraBs, totalBs: r2(deuda.totalBs + multaExtraBs),
    };
  });

  const s = (f: (x: RenglonEstado) => number) => r2(renglones.reduce((a, x) => a + f(x), 0));
  return {
    tasa,
    mensual: M.cargoMensual(c, unidades, tasa),
    renglones,
    totales: {
      baseBs: s(x => x.deuda.baseBs), multaBs: s(x => x.deuda.multaBs + x.multaExtraBs), ivaBs: s(x => x.deuda.ivaBs),
      retencionBs: s(x => x.deuda.retencionBs), totalBs: s(x => x.totalBs),
      mesesMax: Math.max(0, ...renglones.map(x => x.deuda.meses)),
      unidadesConDeuda: renglones.filter(x => x.totalBs > 0).reduce((a, x) => a + x.cantidad, 0),
    },
    quienPaga: { aseo: M.aseoLoPagaLaUnidad(c) ? 'UNIDAD' : 'CONDOMINIO', multa: M.multaLaPagaLaUnidad(c) ? 'UNIDAD' : 'CONDOMINIO' },
  };
}

export async function cargarCondominio(codigo: string) {
  const { data: condo, error } = await sb.from('condominios').select('*').eq('codigo', codigo.toUpperCase()).maybeSingle();
  if (error) throw new Error(error.message);
  if (!condo) return null;
  const unidades = await todas((a, b) => sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id).order('inmueble').range(a, b));
  const { data: movimientos } = await sb.from('condominio_movimientos').select('*').eq('condominio_id', condo.id).order('created_at', { ascending: false }).limit(200);
  const meses = await mesesInmuebles([condo.codigo, ...unidades.map((u: any) => u.inmueble)]);
  const s = sincronizar(condo, unidades, meses);
  return { condo: s.condo, unidades: s.unidades, movimientos: movimientos || [] };
}

/** Resumen de todos los condominios (lista + panel). */
export async function resumenGeneral() {
  const tasa = await tasaVigente();
  const condos = await todas((a, b) => sb.from('condominios').select('*').order('nombre').range(a, b));
  const unidades = await todas((a, b) => sb.from('condominio_unidades')
    .select('id,condominio_id,inmueble,identidad,actividad,tarifa_mmv,estado,aseo_pendiente_desde,multa_meses').order('id').range(a, b));
  const meses = await mesesInmuebles();
  const porCondo = new Map<string, any[]>();
  unidades.forEach(u => { if (!porCondo.has(u.condominio_id)) porCondo.set(u.condominio_id, []); porCondo.get(u.condominio_id)!.push(u); });

  const filas = condos.map(c0 => {
    const s = sincronizar(c0, porCondo.get(c0.id) || [], meses);
    const c = s.condo, us = s.unidades;
    const e = calcularEstado(c, us, tasa);
    return {
      codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, tipo: c.tipo, modalidad: c.modalidad, estado: c.estado,
      cant_declarada: c.cant_declarada, unidades: us.length, mensualBs: e.mensual.condominioBs,
      meses: e.totales.mesesMax, deudaBs: e.totales.totalBs, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad,
      permite_pago_por_unidad: !!c.permite_pago_por_unidad, permite_abonos: c.permite_abonos !== false, origen: c.origen || 'MIGRACION',
    };
  });
  const tot = (f: (x: any) => number) => r2(filas.reduce((a, x) => a + f(x), 0));
  return {
    tasa, filas,
    panel: {
      condominios: filas.length, unidades: unidades.length,
      mensualBs: tot(x => x.mensualBs), deudaBs: tot(x => x.deudaBs),
      alDia: filas.filter(x => x.deudaBs <= 0.01).length, conDeuda: filas.filter(x => x.deudaBs > 0.01).length,
      porModalidad: filas.reduce((a: any, x) => { a[x.modalidad] = (a[x.modalidad] || 0) + 1; return a; }, {}),
      porTipo: filas.reduce((a: any, x) => { a[x.tipo] = (a[x.tipo] || 0) + 1; return a; }, {}),
      alertas: {
        sinUnidades: filas.filter(x => x.unidades === 0).length,
        masRegistradasQueDeclaradas: filas.filter(x => x.unidades > x.cant_declarada).length,
        deudaMas12Meses: filas.filter(x => x.meses > 12).length,
      },
    },
  };
}

/** Unidades cuyo dueño tiene esta cédula/RIF (búsqueda del dueño). */
export async function buscarPorDueno(identidad: string) {
  const n = M.normId(identidad);
  if (n.length < 4) return [];
  const { data: us } = await sb.from('condominio_unidades').select('*, condominios!inner(codigo,nombre,modalidad)').ilike('identidad', `%${n}%`).limit(200);
  return (us || []).filter((u: any) => M.normId(u.identidad) === n);
}
