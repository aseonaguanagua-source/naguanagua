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
  return { condo, unidades, movimientos: movimientos || [] };
}

/** Resumen de todos los condominios (lista + panel). */
export async function resumenGeneral() {
  const tasa = await tasaVigente();
  const condos = await todas((a, b) => sb.from('condominios').select('*').order('nombre').range(a, b));
  const unidades = await todas((a, b) => sb.from('condominio_unidades')
    .select('id,condominio_id,inmueble,identidad,actividad,tarifa_mmv,estado,aseo_pendiente_desde,multa_meses').range(a, b));
  const porCondo = new Map<string, any[]>();
  unidades.forEach(u => { if (!porCondo.has(u.condominio_id)) porCondo.set(u.condominio_id, []); porCondo.get(u.condominio_id)!.push(u); });

  const filas = condos.map(c => {
    const us = porCondo.get(c.id) || [];
    const e = calcularEstado(c, us, tasa);
    return {
      codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, tipo: c.tipo, modalidad: c.modalidad, estado: c.estado,
      cant_declarada: c.cant_declarada, unidades: us.length, mensualBs: e.mensual.condominioBs,
      meses: e.totales.mesesMax, deudaBs: e.totales.totalBs, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad,
      permite_pago_por_unidad: !!c.permite_pago_por_unidad, permite_abonos: c.permite_abonos !== false,
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
