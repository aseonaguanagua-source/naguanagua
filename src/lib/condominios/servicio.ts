/**
 * Servicio de condominios (servidor). Lee las tablas del módulo y calcula TODO con el motor único.
 * Ninguna pantalla calcula montos por su cuenta: todas llaman a estas funciones.
 *
 * El módulo lleva SU PROPIA CUENTA (independiente de Contribuyentes): la deuda de cada unidad es
 * `aseo_pendiente_desde` + `multa_meses` + multas manuales. La foto inicial se toma de `inmuebles`
 * con `refrescarDesdeInmuebles()` (al migrar y el día de la separación).
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
export async function todas<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** ¿Cada unidad lleva su propia deuda? (se cobra por actividad / pago individual) */
export const unidadesPropias = (c: any) => M.porActividad(aMotorCondo(c));

/** Meses de deuda actuales en `inmuebles` (solo para tomar la foto inicial). */
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
 * Foto de la deuda tomada de `inmuebles`:
 *  - condominio: meses del inmueble padre (si existe y no está eliminado);
 *  - unidad con deuda propia (por actividad): meses de su inmueble; sin inmueble (huérfano), lo guardado;
 *  - unidad de un residencial centralizado: sigue al condominio.
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
export const aMotorUnidad = (u: any, grupos?: Set<string>): M.Unidad => ({
  id: u.id, inmueble: u.inmueble, identidad: u.identidad, actividad: u.actividad,
  tarifa_mmv: u.tarifa_mmv != null ? Number(u.tarifa_mmv) : null, estado: u.estado,
  es_grupo: !!u.es_grupo || !!grupos?.has(u.id),
});

/** Ids de las unidades que tienen otras colgando (locales contenedor / torres). */
export const idsGrupo = (unidades: any[]) => new Set(unidades.filter(u => u.padre_unidad_id).map(u => u.padre_unidad_id as string));

export interface MultaManual { id: string; concepto: string; montoBs: number; periodo: string | null; creada_por: string | null; created_at: string }

export interface RenglonEstado {
  clave: string;
  inmueble: string | null;
  numero: string | null;
  propietario: string | null;
  identidad: string | null;
  actividad: string | null;
  estado: string;
  cantidad: number;
  /** Local contenedor: no cobra por sí mismo (cobran sus actividades) */
  esGrupo: boolean;
  padreId: string | null;
  residencial: boolean;
  mensualBs: number;
  pendienteDesde: string | null;
  periodos: string[];
  deuda: M.DeudaPeriodos;
  /** Multas de meses ya pagados por el condominio (las debe el contribuyente) */
  multaExtraBs: number;
  /** Multas agregadas a mano */
  multasManuales: MultaManual[];
  multasManualesBs: number;
  totalBs: number;
}

export interface EstadoCuenta {
  tasa: number;
  mensual: M.CargoMensual;
  renglones: RenglonEstado[];
  totales: { baseBs: number; multaBs: number; ivaBs: number; retencionBs: number; totalBs: number; mesesMax: number; unidadesConDeuda: number };
  quienPaga: { aseo: 'CONDOMINIO' | 'UNIDAD'; multa: 'CONDOMINIO' | 'UNIDAD' };
  porActividad: boolean;
}

/** Monto en Bs de una multa manual. */
export const montoMulta = (m: any, tasa: number) => r2(m.monto_bs != null ? Number(m.monto_bs) : (Number(m.monto_mmv) || 0) * 57 * tasa);

/** Estado de cuenta de un condominio con la tarifa vigente. */
export function calcularEstado(condoRow: any, unidadesRows: any[], tasa: number, hoy = new Date(), multasRows: any[] = []): EstadoCuenta {
  const c = aMotorCondo(condoRow);
  const grupos = idsGrupo(unidadesRows);
  const unidades = unidadesRows.map(u => aMotorUnidad(u, grupos));
  const porId = new Map(unidadesRows.map((u: any) => [u.id, u]));
  const motorPorId = new Map(unidades.map(u => [u.id, u]));
  const reparto = M.cargosPorUnidad(c, unidades, tasa);
  const multasPend = multasRows.filter(m => m.estado === 'Pendiente');

  const renglones: RenglonEstado[] = reparto.map(r => {
    const u: any = porId.get(r.clave);
    const mu = motorPorId.get(r.clave);
    const res = M.unidadResidencial(c, mu || null);
    const tMulta = res ? M.TASA_MULTA_RES : M.TASA_MULTA_COM;
    // Unidad registrada: sus propios meses. Grupo sin registrar / tarifa fija: los meses del condominio.
    const desde = u ? u.aseo_pendiente_desde : condoRow.aseo_pendiente_desde;
    const meses = r.montoBs > 0 ? M.mesesPendientes(desde, hoy) : 0;
    // Multas exoneradas ("quitar todas las multas"): los meses hasta esa fecha no llevan multa
    const hasta = String((u ? u.multa_exonerada_hasta : condoRow.multa_exonerada_hasta) || '').slice(0, 7);
    const exonerados = hasta ? M.periodosPendientes(r.montoBs > 0 ? desde : null, hoy).filter(p => p <= hasta).length : 0;
    // En INDIVIDUAL, cada unidad paga lo suyo, así que se usa su retención. En las demás, el condominio factura el Aseo.
    const esAgente = c.modalidad === 'INDIVIDUAL' ? (u ? !!u.agente_retencion : false) : !!c.agente_retencion;
    const deuda = M.deudaPorMeses(meses, r.montoBs, res, esAgente, exonerados);
    const multaMeses = Number(u ? u.multa_meses : condoRow.multa_meses) || 0;
    const multaExtraBs = r2((r.montoBs * tMulta * multaMeses) + (Number(u?.multa_bs) || 0));
    const manuales = multasPend.filter(m => (u ? m.unidad_id === u.id : !m.unidad_id))
      .map(m => ({ id: m.id, concepto: m.concepto, montoBs: montoMulta(m, tasa), periodo: m.periodo, creada_por: m.creada_por, created_at: m.created_at }));
    const multasManualesBs = r2(manuales.reduce((a, m) => a + m.montoBs, 0));
    return {
      clave: r.clave, inmueble: u?.inmueble ?? null, numero: u?.numero ?? null,
      propietario: u?.propietario ?? (r.clave === M.SIN_REGISTRAR ? `${r.cantidad} unidad(es) declaradas sin registrar` : condoRow.nombre),
      identidad: u?.identidad ?? (r.clave === M.SIN_REGISTRAR ? null : condoRow.identidad), actividad: u?.actividad ?? null,
      estado: u?.estado ?? 'Declarada', cantidad: r.cantidad, esGrupo: !!mu?.es_grupo, padreId: u?.padre_unidad_id ?? null, residencial: res,
      mensualBs: r.montoBs, pendienteDesde: desde || null, periodos: M.periodosPendientes(r.montoBs > 0 ? desde : null, hoy),
      deuda, multaExtraBs, multasManuales: manuales, multasManualesBs, totalBs: r2(deuda.totalBs + multaExtraBs + multasManualesBs),
    };
  });
  // Multas manuales del condominio (sin unidad) cuando no hay renglón de condominio
  const sueltas = multasPend.filter(m => !m.unidad_id);
  if (sueltas.length && !renglones.some(r => !porId.has(r.clave))) {
    const manuales = sueltas.map(m => ({ id: m.id, concepto: m.concepto, montoBs: montoMulta(m, tasa), periodo: m.periodo, creada_por: m.creada_por, created_at: m.created_at }));
    const tot = r2(manuales.reduce((a, m) => a + m.montoBs, 0));
    renglones.push({
      clave: '__CONDOMINIO__', inmueble: condoRow.codigo, numero: null, propietario: condoRow.nombre, identidad: condoRow.identidad, actividad: null,
      estado: 'Condominio', cantidad: 0, esGrupo: false, padreId: null, residencial: M.esResidencial(c), mensualBs: 0, pendienteDesde: null, periodos: [],
      deuda: M.deudaPorMeses(0, 0, true), multaExtraBs: 0, multasManuales: manuales, multasManualesBs: tot, totalBs: tot,
    });
  }

  const s = (f: (x: RenglonEstado) => number) => r2(renglones.reduce((a, x) => a + f(x), 0));
  return {
    tasa,
    mensual: M.cargoMensual(c, unidades, tasa),
    renglones,
    totales: {
      baseBs: s(x => x.deuda.baseBs), multaBs: s(x => x.deuda.multaBs + x.multaExtraBs + x.multasManualesBs), ivaBs: s(x => x.deuda.ivaBs),
      retencionBs: s(x => x.deuda.retencionBs), totalBs: s(x => x.totalBs),
      mesesMax: Math.max(0, ...renglones.map(x => x.deuda.meses)),
      unidadesConDeuda: renglones.filter(x => x.totalBs > 0.01).reduce((a, x) => a + Math.max(1, x.cantidad), 0),
    },
    quienPaga: { aseo: M.aseoLoPagaLaUnidad(c) ? 'UNIDAD' : 'CONDOMINIO', multa: M.multaLaPagaLaUnidad(c) ? 'UNIDAD' : 'CONDOMINIO' },
    porActividad: M.porActividad(c),
  };
}

export async function cargarCondominio(codigo: string) {
  const { data: condo, error } = await sb.from('condominios').select('*').eq('codigo', codigo.toUpperCase()).maybeSingle();
  if (error) throw new Error(error.message);
  if (!condo) return null;

  if (condo.identidad) {
    const { data: inm } = await sb.from('inmuebles').select('agente_retencion').eq('identidad', condo.identidad).maybeSingle();
    condo.agente_retencion = !!inm?.agente_retencion;
  }

  const rawUnidades = await todas((a, b) => sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id).order('inmueble').range(a, b));
  
  // Fetch agente_retencion manually since there's no FK relation
  const codigosUnidades = rawUnidades.map((u: any) => u.inmueble).filter(Boolean);
  const agentes = new Map<string, any>();
  if (codigosUnidades.length > 0) {
    for (let i = 0; i < codigosUnidades.length; i += 300) {
      const { data: inm } = await sb.from('inmuebles').select('inmueble, agente_retencion, multa_bs, telefono, correo_electronico, notas').in('inmueble', codigosUnidades.slice(i, i + 300));
      (inm || []).forEach(r => agentes.set(r.inmueble, r));
    }
  }
  const unidades = rawUnidades.map((u: any) => {
    const inf = agentes.get(u.inmueble) || {};
    let extras = [];
    try {
      if (inf.notas) {
        const j = JSON.parse(inf.notas);
        if (j.actividades_extra) extras = j.actividades_extra;
      }
    } catch (e) {}
    return { ...u, agente_retencion: !!inf.agente_retencion, multa_bs: parseFloat(inf.multa_bs || '0'), telefono: inf.telefono || '', correo: inf.correo_electronico || '', actividades_extra: extras };
  });
  
  const { data: movimientos } = await sb.from('condominio_movimientos').select('*').eq('condominio_id', condo.id).order('created_at', { ascending: false }).limit(300);
  const { data: multas } = await sb.from('condominio_multas').select('*').eq('condominio_id', condo.id).order('created_at', { ascending: false });
  return { condo, unidades, movimientos: movimientos || [], multas: multas || [] };
}

/** Resumen de todos los condominios (lista + panel). */
export async function resumenGeneral() {
  const tasa = await tasaVigente();
  const condos = await todas((a, b) => sb.from('condominios').select('*').order('nombre').range(a, b));
  const unidades = await todas((a, b) => sb.from('condominio_unidades')
    .select('*').order('id').range(a, b));
  const { data: multas } = await sb.from('condominio_multas').select('id,condominio_id,unidad_id,monto_bs,monto_mmv,estado,concepto,periodo,creada_por,created_at').eq('estado', 'Pendiente');
  const porCondo = new Map<string, any[]>();
  unidades.forEach(u => { if (!porCondo.has(u.condominio_id)) porCondo.set(u.condominio_id, []); porCondo.get(u.condominio_id)!.push(u); });
  const multasPor = new Map<string, any[]>();
  (multas || []).forEach(m => { if (!multasPor.has(m.condominio_id)) multasPor.set(m.condominio_id, []); multasPor.get(m.condominio_id)!.push(m); });

  const { data: inmueblesGlobal } = await sb.from('inmuebles').select('identidad, agente_retencion, inmueble, multa_bs');
  const agentes = new Map<string, boolean>();
  const infoInmuebles = new Map<string, any>();
  (inmueblesGlobal || []).forEach(c => {
    if (c.identidad && c.agente_retencion) agentes.set(c.identidad, true);
    if (c.inmueble) infoInmuebles.set(c.inmueble, c);
  });

  unidades.forEach(u => {
    const inf = infoInmuebles.get(u.inmueble) || {};
    u.agente_retencion = !!inf.agente_retencion;
    u.multa_bs = parseFloat(inf.multa_bs || '0');
  });

  const filas = condos.map(c => {
    const us = porCondo.get(c.id) || [];
    c.agente_retencion = agentes.get(c.identidad) || false;
    const e = calcularEstado(c, us, tasa, new Date(), multasPor.get(c.id) || []);
    return {
      codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, tipo: c.tipo, modalidad: c.modalidad, estado: c.estado,
      cant_declarada: c.cant_declarada, unidades: us.length, mensualBs: e.mensual.condominioBs,
      meses: e.totales.mesesMax, deudaBs: e.totales.totalBs, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad, porActividad: e.porActividad,
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

/** Unidades cuyo dueño tiene esta cédula/RIF (búsqueda del dueño). Solo las que están DENTRO de un condominio. */
export async function buscarPorDueno(identidad: string) {
  const n = M.normId(identidad);
  if (n.length < 4) return [];
  const { data: us } = await sb.from('condominio_unidades').select('*, condominios!inner(codigo,nombre,modalidad,tipo)').ilike('identidad', `%${n}%`).limit(300);
  return (us || []).filter((u: any) => M.normId(u.identidad) === n);
}

/**
 * Toma la foto de la deuda desde `inmuebles` y la guarda en el módulo (al migrar y el día de la separación).
 * Devuelve el detalle de lo que cambiaría; solo escribe con `aplicar`.
 */
export async function refrescarDesdeInmuebles(aplicar = false) {
  const condos = await todas((a, b) => sb.from('condominios').select('*').order('id').range(a, b));
  const unidades = await todas((a, b) => sb.from('condominio_unidades').select('id,condominio_id,inmueble,aseo_pendiente_desde').order('id').range(a, b));
  const meses = await mesesInmuebles();
  const por = new Map<string, any[]>(); unidades.forEach(u => { if (!por.has(u.condominio_id)) por.set(u.condominio_id, []); por.get(u.condominio_id)!.push(u); });
  const cambiosC: any[] = [], cambiosU: any[] = [];
  for (const c of condos) {
    const s = sincronizar(c, por.get(c.id) || [], meses);
    if ((s.condo.aseo_pendiente_desde || null) !== (c.aseo_pendiente_desde || null)) cambiosC.push({ id: c.id, codigo: c.codigo, antes: c.aseo_pendiente_desde, despues: s.condo.aseo_pendiente_desde || null });
    s.unidades.forEach((u: any, i: number) => { const a = (por.get(c.id) || [])[i]; if ((u.aseo_pendiente_desde || null) !== (a.aseo_pendiente_desde || null)) cambiosU.push({ id: u.id, inmueble: u.inmueble, antes: a.aseo_pendiente_desde, despues: u.aseo_pendiente_desde || null }); });
  }
  if (aplicar) {
    for (const x of cambiosC) await sb.from('condominios').update({ aseo_pendiente_desde: x.despues }).eq('id', x.id);
    const grupos = new Map<string, string[]>(); cambiosU.forEach(x => { const k = String(x.despues); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(x.id); });
    for (const [k, ids] of grupos) for (let i = 0; i < ids.length; i += 300) await sb.from('condominio_unidades').update({ aseo_pendiente_desde: k === 'null' ? null : k }).in('id', ids.slice(i, i + 300));
  }
  return { condominios: cambiosC, unidades: cambiosU };
}
