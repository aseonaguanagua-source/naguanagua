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
import { actividadConNivel, resolverFOComercial, isExoneradoTotalMultas, isMesExoneradoMulta, getFAR } from '@/lib/calculos';
import { getTasaBCV } from '@/services/bcv';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const CONFIG_ID_TASAS_CONGELADAS = 'condominios_tasas_congeladas';

export interface TasaCongeladaInfo {
  activa: boolean;
  tasa: number;
  desde: string;            // YYYY-MM-DD (inicio del período inclusive)
  hasta: string;            // YYYY-MM-DD (fin del período inclusive)
  fechaReferencia?: string; // YYYY-MM-DD (fecha de la tasa BCV tomada, opcional)
  motivo?: string;
  actualizadoPor?: string;
  actualizadoAt?: string;
}

/** Fecha actual en zona horaria America/Caracas en formato YYYY-MM-DD. */
export function hoyCaracasYMD(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Formatea YYYY-MM-DD a DD/MM/YYYY. */
export function fmtFechaDMY(ymd?: string | null): string {
  const s = String(ymd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Devuelve la tasa congelada si y solo si está activa y la fecha actual (Caracas)
 * se encuentra dentro del período [desde, hasta] inclusive.
 * Una vez superada la fecha `hasta`, devuelve `null` y el condominio vuelve automáticamente a tasa diaria.
 */
export function resolverTasaCongelada(
  info: TasaCongeladaInfo | null | undefined,
  hoyYMD = hoyCaracasYMD()
): TasaCongeladaInfo | null {
  if (!info || !info.activa) return null;
  const tasa = r2(Number(info.tasa) || 0);
  const desde = String(info.desde || '').trim().slice(0, 10);
  const hasta = String(info.hasta || '').trim().slice(0, 10);
  if (tasa <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null;
  if (hoyYMD >= desde && hoyYMD <= hasta) {
    return {
      ...info,
      activa: true,
      tasa,
      desde,
      hasta,
    };
  }
  return null;
}

export function estadoVigenciaTasaCongelada(
  info: TasaCongeladaInfo | null | undefined,
  hoyYMD = hoyCaracasYMD()
): 'ACTIVA' | 'PROGRAMADA' | 'VENCIDA' | 'INACTIVA' {
  if (!info || !info.activa || !(Number(info.tasa) > 0) || !info.desde || !info.hasta) return 'INACTIVA';
  const desde = String(info.desde).slice(0, 10);
  const hasta = String(info.hasta).slice(0, 10);
  if (hoyYMD < desde) return 'PROGRAMADA';
  if (hoyYMD > hasta) return 'VENCIDA';
  return 'ACTIVA';
}

let _cacheTasasCongeladas: { ts: number; map: Record<string, TasaCongeladaInfo> } | null = null;

export function invalidarCacheTasasCongeladas() {
  _cacheTasasCongeladas = null;
}

export async function obtenerMapaTasasCongeladas(forzar = false): Promise<Record<string, TasaCongeladaInfo>> {
  const now = Date.now();
  if (!forzar && _cacheTasasCongeladas && now - _cacheTasasCongeladas.ts < 3000) {
    return _cacheTasasCongeladas.map;
  }
  try {
    const { data } = await sb
      .from('sistema_config')
      .select('valor')
      .eq('id', CONFIG_ID_TASAS_CONGELADAS)
      .maybeSingle();
    let map: Record<string, TasaCongeladaInfo> = {};
    if (data?.valor) {
      const parsed = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === 'object') {
            map[String(k).trim().toUpperCase()] = v as TasaCongeladaInfo;
          }
        }
      }
    }
    _cacheTasasCongeladas = { ts: now, map };
    return map;
  } catch {
    return {};
  }
}

export async function guardarTasaCongeladaCondominio(params: {
  codigo: string;
  accion: 'congelar' | 'descongelar';
  tasa?: number;
  desde?: string;
  hasta?: string;
  fechaReferencia?: string;
  motivo?: string;
  usuario?: string;
}): Promise<{ config: TasaCongeladaInfo | null; activa: TasaCongeladaInfo | null }> {
  const cod = String(params.codigo || '').trim().toUpperCase();
  if (!cod) throw new Error('Código de condominio requerido');

  const mapa = await obtenerMapaTasasCongeladas(true);
  const usuario = String(params.usuario || 'Admin').trim();
  const ahoraIso = new Date().toISOString();

  if (params.accion === 'descongelar') {
    delete mapa[cod];
  } else {
    const tasa = r2(Number(params.tasa) || 0);
    const desde = String(params.desde || '').trim().slice(0, 10);
    const hasta = String(params.hasta || '').trim().slice(0, 10);
    if (!(tasa > 0)) throw new Error('Debe indicar una tasa válida mayor a 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new Error('Debe indicar fechas válidas (Desde y Hasta) en formato YYYY-MM-DD.');
    }
    if (desde > hasta) {
      throw new Error('La fecha de inicio (Desde) no puede ser mayor que la fecha fin (Hasta).');
    }
    mapa[cod] = {
      activa: true,
      tasa,
      desde,
      hasta,
      fechaReferencia: params.fechaReferencia ? String(params.fechaReferencia).slice(0, 10) : undefined,
      motivo: params.motivo ? String(params.motivo).trim() : undefined,
      actualizadoPor: usuario,
      actualizadoAt: ahoraIso,
    };
  }

  const { error } = await sb.from('sistema_config').upsert(
    {
      id: CONFIG_ID_TASAS_CONGELADAS,
      valor: JSON.stringify(mapa),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);
  invalidarCacheTasasCongeladas();

  const nuevaCfg = mapa[cod] || null;
  const activa = resolverTasaCongelada(nuevaCfg);

  try {
    await sb.from('auditoria').insert({
      usuario,
      accion: params.accion === 'descongelar' ? 'Descongelar Tasa de Condominio' : 'Congelar Tasa de Condominio',
      modulo: 'Condominios',
      detalles: params.accion === 'descongelar'
        ? `Condominio ${cod}: se desactivó la tasa congelada y volvió a tasa diaria BCV. ${params.motivo ? `Motivo: ${params.motivo}` : ''}`
        : `Condominio ${cod}: tasa congelada en Bs. ${nuevaCfg?.tasa} por el período del ${fmtFechaDMY(nuevaCfg?.desde)} al ${fmtFechaDMY(nuevaCfg?.hasta)}. ${params.motivo ? `Motivo: ${params.motivo}` : ''}`,
    });
  } catch { }

  return { config: nuevaCfg, activa };
}

export async function tasaVigente(): Promise<number> {
  try {
    const bcv = await getTasaBCV(false);
    if (bcv?.success && Number(bcv.tcmmv) > 10) {
      return r2(Number(bcv.tcmmv));
    }
  } catch (_) { }
  const { data } = await sb.from('sistema_config').select('id, valor').in('id', ['tasa_bcv_manual', 'tasa_bcv_diaria', 'tasa_bcv_semanal']);
  const v = (id: string) => parseFloat(String(data?.find((c: any) => c.id === id)?.valor || 0)) || 0;
  return r2(v('tasa_bcv_manual') || v('tasa_bcv_diaria') || v('tasa_bcv_semanal'));
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
  let nuevoDesde = condo.aseo_pendiente_desde;
  if (p && p.estado !== 'Eliminado') {
    const mesesP = Number(p.meses) || 0;
    const mesesCondo = M.mesesPendientes(condo.aseo_pendiente_desde, hoy);
    if (mesesP > 0) {
      nuevoDesde = M.pendienteDesdeParaMeses(mesesP, hoy);
    } else if (mesesCondo > 0) {
      nuevoDesde = condo.aseo_pendiente_desde;
    } else {
      nuevoDesde = null;
    }
  }
  const c = { ...condo, aseo_pendiente_desde: nuevoDesde };
  const propias = unidadesPropias(c);
  const us = unidades.map(u => {
    if (!propias) return { ...u, aseo_pendiente_desde: c.aseo_pendiente_desde };
    const m = u.inmueble ? meses.get(String(u.inmueble).toUpperCase()) : undefined;
    if (m && Number(m.meses) > 0) {
      return { ...u, aseo_pendiente_desde: M.pendienteDesdeParaMeses(m.meses, hoy) };
    }
    return u;
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
  es_grupo: grupos
    ? (grupos.has(u.id) || (!!u.es_grupo && u.estado !== 'Desocupada' && M.esSinActividad(u.actividad)))
    : (!!u.es_grupo && u.estado !== 'Desocupada'),
});

/**
 * Ids de las unidades que tienen otras colgando (locales contenedor N/A / torres).
 * Regla N/A: un contenedor con actividades adentro NO cobra nada propio; cobran sus actividades.
 * Se detecta por `padre_unidad_id` y también por `padre_inmueble` (inmuebles.padre_id), porque muchas
 * actividades migradas no tienen `padre_unidad_id` y el N/A terminaba cobrando doble.
 */
export const idsGrupo = (unidades: any[]) => {
  return new Set(unidades.filter(u => u.estado !== 'Eliminada' && u.padre_unidad_id).map(u => u.padre_unidad_id as string));
};

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
  padreInmueble?: string | null;
  padreNumero?: string | null;
  residencial: boolean;
  mensualBs: number;
  pendienteDesde: string | null;
  periodos: string[];
  deuda: M.DeudaPeriodos;
  multaMeses: number;
  /** Multas de meses ya pagados por el condominio (las debe el contribuyente) */
  multaExtraBs: number;
  /** Multas agregadas a mano */
  multasManuales: MultaManual[];
  multasManualesBs: number;
  totalBs: number;
  saldoFavorBs?: number;
  agenteRetencion?: boolean;
}

export interface EstadoCuenta {
  tasa: number;
  tasaCongelada?: TasaCongeladaInfo | null;
  mensual: M.CargoMensual;
  renglones: RenglonEstado[];
  totales: { baseBs: number; multaBs: number; ivaBs: number; retencionBs: number; totalBs: number; mesesMax: number; unidadesConDeuda: number };
  quienPaga: { aseo: 'CONDOMINIO' | 'UNIDAD'; multa: 'CONDOMINIO' | 'UNIDAD' };
  porActividad: boolean;
}

/** Monto en Bs de una multa manual. */
export const montoMulta = (m: any, tasa: number) => {
  const t = r2(Number(tasa) || 0);
  return m.monto_bs != null ? r2(Number(m.monto_bs)) : r2((Number(m.monto_mmv) || 0) * 57 * t);
};

/** Estado de cuenta de un condominio con la tarifa vigente. */
export function calcularEstado(condoRow: any, unidadesRows: any[], tasaRaw: number, hoy = new Date(), multasRows: any[] = [], omitirMultaSeptiembre = false): EstadoCuenta {
  const tasa = r2(Number(tasaRaw) || 0);
  const c = aMotorCondo(condoRow);
  const grupos = idsGrupo(unidadesRows);
  const unidades = unidadesRows.map(u => aMotorUnidad(u, grupos));
  const porId = new Map(unidadesRows.map((u: any) => [u.id, u]));
  const porInmUpper = new Map<string, any>();
  unidadesRows.forEach((u: any) => { if (u.inmueble) porInmUpper.set(String(u.inmueble).toUpperCase(), u); });
  const motorPorId = new Map(unidades.map(u => [u.id, u]));
  const reparto = M.cargosPorUnidad(c, unidades, tasa);
  const multasPend = multasRows.filter(m => m.estado === 'Pendiente');

  const renglones: RenglonEstado[] = reparto.map(r => {
    const u: any = porId.get(r.clave);
    const padre: any = u?.padre_unidad_id ? porId.get(u.padre_unidad_id) : null;
    const mu = motorPorId.get(r.clave);
    const res = M.unidadResidencial(c, mu || null);
    const tMulta = res ? M.TASA_MULTA_RES : M.TASA_MULTA_COM;
    // Unidad registrada: usa siempre sus propios meses y multas. Solo los contenedores puros sin tarifa propia heredan del condominio.
    const esGrupoOuNA = Boolean(mu?.es_grupo || (String(u?.actividad || '').trim().toUpperCase() === 'N/A' && !(Number(u?.tarifa_mmv) > 0)));
    const desde = (u && !esGrupoOuNA)
      ? (u.aseo_pendiente_desde !== undefined ? u.aseo_pendiente_desde : (padre ? padre.aseo_pendiente_desde : condoRow.aseo_pendiente_desde))
      : condoRow.aseo_pendiente_desde;
    const meses = r.montoBs > 0 ? M.mesesPendientes(desde, hoy) : 0;
    const mesesRealesHoy = r.montoBs > 0 ? M.mesesPendientes(desde, new Date()) : 0;
    const mesesMoraRealesHoy = Math.max(0, mesesRealesHoy - 1);
    const multaMesesRaw = Number((u && !esGrupoOuNA) ? (u.multa_meses !== undefined && u.multa_meses !== null ? u.multa_meses : (padre?.multa_meses ?? condoRow.multa_meses)) : condoRow.multa_meses) || 0;
    const notasInmCheck = String((u && !esGrupoOuNA) ? (u.notas_inmueble || padre?.notas_inmueble || '') : (condoRow.notas_inmueble || condoRow.notas || ''));
    const exoneradoTotalInm = isExoneradoTotalMultas(notasInmCheck);
    // Multas exoneradas o ya pagadas poco a poco por el contribuyente:
    // Se respetan tanto `multa_exonerada_hasta` como `multa_meses` y las notas de `inmuebles` para sincronización total con Contribuyentes.
    const hastaRaw = String(((u && !esGrupoOuNA) ? (u.multa_exonerada_hasta || padre?.multa_exonerada_hasta) : condoRow.multa_exonerada_hasta) || '').slice(0, 7);
    const hasta = exoneradoTotalInm ? '2099-12' : hastaRaw;
    const exoneradosPorHasta = hasta ? M.periodosPendientes(r.montoBs > 0 ? desde : null, hoy).filter(p => p <= hasta).length : 0;
    const tieneMultaMesesExplicito = (u && !esGrupoOuNA)
      ? ((u.multa_meses !== null && u.multa_meses !== undefined) || (padre && padre.multa_meses !== null && padre.multa_meses !== undefined))
      : (condoRow.multa_meses !== null && condoRow.multa_meses !== undefined);
    const exoneradosPorPagosParciales = tieneMultaMesesExplicito ? Math.max(0, mesesMoraRealesHoy - multaMesesRaw) : 0;
    const exonerados = exoneradoTotalInm ? meses : Math.max(exoneradosPorHasta, exoneradosPorPagosParciales);
    // Se respeta la condición de Agente de Retención tanto de la unidad individual (o su local padre) como del condominio matriz
    const esAgente = Boolean((u && u.agente_retencion) || (padre && padre.agente_retencion) || c.agente_retencion);
    const periodos = M.periodosPendientes(r.montoBs > 0 ? desde : null, hoy);
    let basesPorMes: number[] | number = r.montoBs;
    let multasPorMes: (boolean | number)[] | undefined = undefined;

    if (periodos.length > 0 && (u?.periodos_custom || u?.desocupada_desde)) {
      const tDesoc = M.tarifaDesocupadaBs(tasa);
      const mmvActiva = Number(u.tarifa_activa_mmv || u.tarifa_mmv) || 3.77;
      const farActiva = res ? getFAR(u.actividad || u.clasificacion || condoRow?.actividad) : 0.128;
      const tActiva = r2(mmvActiva * 57 * tasa * farActiva);

      const bases: number[] = [];
      const multas: (boolean | number)[] = [];

      periodos.forEach((p, idx) => {
        const exoMesInm = isMesExoneradoMulta(notasInmCheck, p);
        const custom = u?.periodos_custom?.[p];
        if (custom) {
          // Custom activity / rate / level
          let mmv = custom.tarifa_mmv;
          if (mmv === null || mmv === undefined) {
            if (custom.actividad) {
              const nomConNivel = actividadConNivel(custom.actividad, custom.nivel ?? 1);
              mmv = resolverFOComercial(nomConNivel) ?? mmvActiva;
            } else {
              mmv = mmvActiva;
            }
          }
          const mmvNum = Number(mmv);
          const farCustom = res ? getFAR(custom.actividad || u.actividad || u.clasificacion || condoRow?.actividad) : 0.128;
          const base = r2((isNaN(mmvNum) ? mmvActiva : mmvNum) * 57 * tasa * farCustom);
          bases.push(base);

          // Multa
          if (idx < exonerados || (hasta && p <= hasta) || exoMesInm || (omitirMultaSeptiembre && p === '2026-09')) {
            multas.push(false);
          } else if (custom.lleva_multa === false || custom.exonerar_multa === true) {
            multas.push(false);
          } else if (typeof custom.multa_bs === 'number') {
            multas.push(custom.multa_bs);
          } else if (idx === periodos.length - 1) {
            multas.push(false);
          } else {
            multas.push(true);
          }
        } else if (u?.desocupada_desde) {
          const esDesoc = p >= u.desocupada_desde && (!u.desocupada_hasta || p <= u.desocupada_hasta);
          bases.push(esDesoc ? tDesoc : tActiva);
          if (idx < exonerados || (hasta && p <= hasta) || exoMesInm || (omitirMultaSeptiembre && p === '2026-09')) {
            multas.push(false);
          } else if (idx === periodos.length - 1) {
            multas.push(false);
          } else {
            multas.push(true);
          }
        } else {
          bases.push(r.montoBs);
          if (idx < exonerados || (hasta && p <= hasta) || exoMesInm || (omitirMultaSeptiembre && p === '2026-09')) {
            multas.push(false);
          } else if (idx === periodos.length - 1) {
            multas.push(false);
          } else {
            multas.push(true);
          }
        }
      });
      basesPorMes = bases;
      multasPorMes = multas;
    } else if (periodos.length > 0 && (omitirMultaSeptiembre || notasInmCheck.includes('[EXONERADO:'))) {
      multasPorMes = periodos.map((p, idx) => {
        if (idx < exonerados || (hasta && p <= hasta) || isMesExoneradoMulta(notasInmCheck, p) || (omitirMultaSeptiembre && p === '2026-09') || idx === periodos.length - 1) return false;
        return true;
      });
    }

    const deuda = M.deudaPorMeses(meses, basesPorMes, res, esAgente, exonerados, multasPorMes, tasa);
    const mesesMultaEnAseo = (r.montoBs > 0 && deuda.meses > 0) ? (deuda.porMes || []).filter(m => m.multaBs > 0).length : 0;
    const mesesMoraCubiertosPorAseo = Math.max(0, meses - 1);

    const baseParaMultaExtra = Array.isArray(basesPorMes) ? (basesPorMes[basesPorMes.length - 1] || r.montoBs) : r.montoBs;
    const manuales = multasPend
      .filter(m => (u ? m.unidad_id === u.id : !m.unidad_id) && !(omitirMultaSeptiembre && String(m.periodo || '').slice(0, 7) === '2026-09'))
      .map(m => ({ id: m.id, concepto: m.concepto, montoBs: montoMulta(m, tasa), periodo: m.periodo, creada_por: m.creada_por, created_at: m.created_at }));
    const multasManualesBs = r2(manuales.reduce((a, m) => a + m.montoBs, 0));

    // Si la unidad es un grupo contenedor (mu?.es_grupo), no genera multas automáticas directas: cobran sus actividades
    // multaExtraBs solo cobra meses de multa remanentes (previos al aseo pendiente) no cubiertos por el aseo dinámico ni por multas manuales específicas
    let mesesMultaRemanente = (!mu?.es_grupo && u) ? Math.max(0, multaMesesRaw - Math.max(mesesMoraCubiertosPorAseo, mesesMoraRealesHoy) - manuales.length) : 0;
    if (mesesMultaRemanente > 0) {
      const periodosManualesSet = new Set(manuales.map(m => String(m.periodo || '').slice(0, 7)).filter(Boolean));
      const prevPeriodos = M.periodosMultasPrevias(desde, mesesMultaRemanente, hoy).filter(p => {
        if (exoneradoTotalInm) return false;
        if (hasta && p <= hasta) return false;
        if (isMesExoneradoMulta(notasInmCheck, p)) return false;
        if (omitirMultaSeptiembre && p === '2026-09') return false;
        if (periodosManualesSet.has(p)) return false;
        return true;
      });
      mesesMultaRemanente = prevPeriodos.length;
    }
    const multaMeses = mesesMultaEnAseo + mesesMultaRemanente + manuales.length;
    const multaExtraBs = (!mu?.es_grupo && u) ? r2(r2(baseParaMultaExtra * tMulta) * mesesMultaRemanente) : 0;
    const idCondoNorm = M.normId(condoRow.identidad);
    const idChildNorm = M.normId(u?.identidad);
    const idPadreNorm = M.normId(padre?.identidad);
    const usarDatosPadre = Boolean(padre && (!idChildNorm || idChildNorm === idCondoNorm) && idPadreNorm && idPadreNorm !== idCondoNorm);
    const propEfectivo = usarDatosPadre
      ? (padre.propietario || u?.propietario)
      : (u?.propietario ?? (padre?.propietario || (r.clave === M.SIN_REGISTRAR ? `${r.cantidad} unidad(es) declaradas sin registrar` : condoRow.nombre)));
    const identEfectiva = usarDatosPadre
      ? (padre.identidad || u?.identidad)
      : (u?.identidad ?? (padre?.identidad || (r.clave === M.SIN_REGISTRAR ? null : condoRow.identidad)));
    const numEfectivo = u?.numero || padre?.numero || null;
    return {
      clave: r.clave, inmueble: u?.inmueble ?? null, numero: numEfectivo,
      propietario: propEfectivo,
      identidad: identEfectiva, actividad: u?.actividad ?? null,
      estado: u?.estado ?? 'Declarada', cantidad: r.cantidad, esGrupo: !!mu?.es_grupo, padreId: u?.padre_unidad_id ?? (padre?.id || null),
      padreInmueble: padre?.inmueble ?? u?.padre_inmueble ?? null, padreNumero: padre?.numero ?? null,
      residencial: res,
      mensualBs: r.montoBs, pendienteDesde: desde || null, periodos: M.periodosPendientes(r.montoBs > 0 ? desde : null, hoy),
      deuda, multaMeses, multaExtraBs, multasManuales: manuales, multasManualesBs, totalBs: r2(deuda.totalBs + multaExtraBs + multasManualesBs),
      saldoFavorBs: Number(u?.saldo_favor_bs || padre?.saldo_favor_bs) >= 1.00 ? r2(Number(u?.saldo_favor_bs || padre?.saldo_favor_bs)) : 0,
      agenteRetencion: esAgente,
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
      deuda: M.deudaPorMeses(0, 0, true), multaMeses: 0, multaExtraBs: 0, multasManuales: manuales, multasManualesBs: tot, totalBs: tot,
    });
  }

  const s = (f: (x: RenglonEstado) => number) => r2(renglones.reduce((a, x) => a + f(x), 0));
  const esPorAct = M.porActividad(c);
  let totBaseBs = s(x => x.deuda.baseBs);
  let totMultaBs = s(x => x.deuda.multaBs + x.multaExtraBs + x.multasManualesBs);
  let totIvaBs = s(x => x.deuda.ivaBs);
  let totRetBs = s(x => x.deuda.retencionBs);
  let totTotalBs = s(x => x.totalBs);

  if (esPorAct && tasa > 0 && renglones.filter(x => x.totalBs > 0.01).length > 1) {
    const conv = (bs: number) => r2(bs / tasa);
    const grupos = new Map<string, RenglonEstado[]>();
    for (const r of renglones) {
      if (r.esGrupo && renglones.some(h => h.padreId === r.clave)) continue;
      const gKey = r.padreId || r.clave;
      const arr = grupos.get(gKey) || [];
      arr.push(r);
      grupos.set(gKey, arr);
    }
    let sumBaseEur = 0;
    let sumMultaEur = 0;
    let sumIvaEur = 0;
    for (const items of grupos.values()) {
      const cBase = r2(items.reduce((acc, h) => r2(acc + conv(Number(h.deuda?.baseBs) || 0)), 0));
      const cMulta = r2(items.reduce((acc, h) => r2(acc + conv((Number(h.deuda?.multaBs) || 0) + (Number(h.multaExtraBs) || 0))) + conv(Number(h.multasManualesBs) || 0), 0));
      const esParHomogeneo = items.length === 2 && !items[0].residencial && Math.abs((Number(items[0].deuda?.baseBs) || 0) - (Number(items[1].deuda?.baseBs) || 0)) < 0.01;
      const cIva = esParHomogeneo
        ? r2(cBase * 0.16)
        : r2(items.reduce((acc, h) => r2(acc + conv(Number(h.deuda?.ivaBs) || 0)), 0));
      sumBaseEur = r2(sumBaseEur + cBase);
      sumMultaEur = r2(sumMultaEur + cMulta);
      sumIvaEur = r2(sumIvaEur + cIva);
    }
    const sumBrutoEur = r2(sumBaseEur + sumMultaEur + sumIvaEur);
    const cRetEur = totRetBs > 0 ? conv(totRetBs) : 0;
    const sumNetoEur = r2(sumBrutoEur - cRetEur);
    totBaseBs = r2(sumBaseEur * tasa);
    totMultaBs = r2(sumMultaEur * tasa);
    totIvaBs = r2(sumIvaEur * tasa);
    totRetBs = r2(cRetEur * tasa);
    totTotalBs = r2(sumNetoEur * tasa);
  }

  return {
    tasa,
    tasaCongelada: condoRow?.tasa_congelada_activa || null,
    mensual: M.cargoMensual(c, unidades, tasa),
    renglones,
    totales: {
      baseBs: totBaseBs, multaBs: totMultaBs, ivaBs: totIvaBs,
      retencionBs: totRetBs, totalBs: totTotalBs,
      mesesMax: Math.max(0, ...renglones.map(x => x.deuda.meses)),
      unidadesConDeuda: renglones.filter(x => x.totalBs > 0.01).reduce((a, x) => a + Math.max(1, x.cantidad), 0),
    },
    quienPaga: { aseo: M.aseoLoPagaLaUnidad(c) ? 'UNIDAD' : 'CONDOMINIO', multa: M.multaLaPagaLaUnidad(c) ? 'UNIDAD' : 'CONDOMINIO' },
    porActividad: esPorAct,
  };
}

export async function cargarCondominio(codigo: string) {
  let { data: condo, error } = await sb.from('condominios').select('*').eq('codigo', codigo.toUpperCase()).neq('estado', 'Eliminado').limit(1).maybeSingle();
  if (error) throw new Error(error.message);

  if (!condo) {
    // 1. Buscar si el código ingresado corresponde a una unidad hija registrada en condominio_unidades
    const { data: unidad } = await sb.from('condominio_unidades')
      .select('condominio_id')
      .ilike('inmueble', codigo.trim())
      .neq('estado', 'Eliminada')
      .limit(1)
      .maybeSingle();

    if (unidad?.condominio_id) {
      const { data: condoByUnidad } = await sb.from('condominios').select('*').eq('id', unidad.condominio_id).neq('estado', 'Eliminado').maybeSingle();
      condo = condoByUnidad;
    }
  }

  if (!condo) {
    // 2. Buscar si en inmuebles tiene condominio_padre_id
    const { data: inmHijo } = await sb.from('inmuebles')
      .select('condominio_padre_id')
      .ilike('inmueble', codigo.trim())
      .neq('estado', 'Eliminado')
      .limit(1)
      .maybeSingle();

    if (inmHijo?.condominio_padre_id) {
      const { data: condoByPadre } = await sb.from('condominios').select('*').eq('codigo', inmHijo.condominio_padre_id.toUpperCase()).neq('estado', 'Eliminado').limit(1).maybeSingle();
      condo = condoByPadre;
    }
  }

  if (!condo) return null;

  // Resolver tasa congelada por período (si existe y está vigente hoy en Caracas)
  const mapaTasasCongeladas = await obtenerMapaTasasCongeladas();
  const tcConfig = mapaTasasCongeladas[String(condo.codigo || '').trim().toUpperCase()] || null;
  const tcActiva = resolverTasaCongelada(tcConfig);
  condo.tasa_congelada_config = tcConfig;
  condo.tasa_congelada_activa = tcActiva;
  condo.tasa_congelada_estado = estadoVigenciaTasaCongelada(tcConfig);

  const { data: inm } = await sb.from('inmuebles').select('agente_retencion, telefono, correo_electronico, notas, clave_portal').eq('inmueble', condo.codigo).limit(1).maybeSingle();
  if (inm) {
    condo.clave_portal = inm.clave_portal || '';
    condo.agente_retencion = Boolean(condo.agente_retencion || inm.agente_retencion);
    condo.telefono = condo.telefono || inm.telefono || '';
    condo.correo = condo.correo || inm.correo_electronico || '';
    if (!condo.notas && inm.notas) {
      condo.notas = inm.notas;
    } else if (condo.notas && inm.notas && condo.notas.trim() !== inm.notas.trim() && !condo.notas.includes(inm.notas.trim())) {
      condo.notas = `${condo.notas}\n---\n${inm.notas}`;
    }
  }

  const rawUnidades = await todas((a, b) => sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id).neq('estado', 'Eliminada').order('inmueble').range(a, b));

  // Fetch agente_retencion manually since there's no FK relation
  const codigosUnidades = rawUnidades.map((u: any) => String(u.inmueble || '').trim().toUpperCase()).filter(Boolean);
  const agentes = new Map<string, any>();
  if (codigosUnidades.length > 0) {
    for (let i = 0; i < codigosUnidades.length; i += 300) {
      const { data: inm } = await sb.from('inmuebles').select('inmueble, identidad, contribuyente, actividad_principal, numero_local, agente_retencion, meses_deuda, multa_bs, saldo_favor_bs, telefono, correo_electronico, direccion, notas, padre_id').in('inmueble', codigosUnidades.slice(i, i + 300));
      (inm || []).forEach(r => {
        if (r.inmueble) agentes.set(String(r.inmueble).trim().toUpperCase(), r);
      });
    }
  }
  const esUnidadesPropias = unidadesPropias(condo);
  const unidadesASincronizarBD: { id: string; aseo_pendiente_desde: string | null; multa_meses: number }[] = [];

  const unidades = rawUnidades.map((u: any) => {
    const inf = agentes.get(String(u.inmueble || '').trim().toUpperCase()) || {};
    let extras = [];
    let desocupada_desde = null;
    let desocupada_hasta = null;
    let tarifa_activa_mmv = null;
    let tarifa_desocupada_mmv = null;
    let actividad_activa = null;
    let periodos_custom: Record<string, any> | null = null;
    try {
      if (inf.notas) {
        const j = typeof inf.notas === 'string' ? JSON.parse(inf.notas) : inf.notas;
        if (j.actividades_extra) extras = j.actividades_extra;
        if (j.desocupada_desde) desocupada_desde = j.desocupada_desde;
        if (j.desocupada_hasta) desocupada_hasta = j.desocupada_hasta;
        if (j.tarifa_activa_mmv) tarifa_activa_mmv = j.tarifa_activa_mmv;
        if (j.tarifa_desocupada_mmv) tarifa_desocupada_mmv = j.tarifa_desocupada_mmv;
        if (j.actividad_activa) actividad_activa = j.actividad_activa;
        if (j.periodos_custom) periodos_custom = j.periodos_custom;
      }
    } catch (e) { }
    const rawSF = parseFloat(inf.saldo_favor_bs || '0') || 0;
    const multaBsInm = parseFloat(inf.multa_bs || '0') || 0;

    // La fuente autoritativa de deuda en condominios es condominio_unidades.aseo_pendiente_desde.
    // Nunca borrar aseo_pendiente_desde automáticamente por valores rezagados de meses_deuda=0 en inmuebles.
    const aseoDesdeEfectivo = u.aseo_pendiente_desde;
    let multaMesesEfectivo = Number(u.multa_meses || 0);
    if (esUnidadesPropias && inf.meses_deuda !== undefined && inf.meses_deuda !== null) {
      const mInm = Math.max(0, parseInt(String(inf.meses_deuda), 10) || 0);
      const mUnid = M.mesesPendientes(u.aseo_pendiente_desde);
      if (multaMesesEfectivo > 0 && mUnid <= 1 && mInm <= 1 && multaBsInm <= 0.01) {
        multaMesesEfectivo = 0;
        unidadesASincronizarBD.push({
          id: u.id,
          aseo_pendiente_desde: aseoDesdeEfectivo,
          multa_meses: 0,
        });
      }
    }

    return {
      ...u,
      aseo_pendiente_desde: aseoDesdeEfectivo,
      multa_meses: multaMesesEfectivo,
      identidad: u.identidad || inf.identidad || null,
      propietario: u.propietario || inf.contribuyente || null,
      actividad: u.actividad || inf.actividad_principal || null,
      numero: u.numero || inf.numero_local || null,
      padre_inmueble: inf.padre_id || null,
      agente_retencion: !!inf.agente_retencion,
      multa_bs: multaBsInm,
      saldo_favor_bs: rawSF >= 1.00 ? r2(rawSF) : 0,
      telefono: inf.telefono || '',
      correo: inf.correo_electronico || '',
      direccion: inf.direccion || '',
      notas_inmueble: inf.notas || '',
      actividades_extra: extras,
      desocupada_desde,
      desocupada_hasta,
      tarifa_activa_mmv,
      tarifa_desocupada_mmv,
      actividad_activa,
      periodos_custom
    };
  });

  // Consolidar saldo a favor y sincronizar fecha pendiente en unidades padre contenedor (N/A / es_grupo)
  const unidadMapById = new Map<string, any>(unidades.map((u: any) => [u.id, u]));
  const hijosPorPadre = new Map<string, any[]>();
  unidades.forEach((u: any) => {
    if (u.padre_unidad_id && unidadMapById.has(u.padre_unidad_id)) {
      if (!hijosPorPadre.has(u.padre_unidad_id)) hijosPorPadre.set(u.padre_unidad_id, []);
      hijosPorPadre.get(u.padre_unidad_id)!.push(u);
    }
  });
  hijosPorPadre.forEach((hijos, padreId) => {
    const padre = unidadMapById.get(padreId);
    if (!padre) return;
    const esContenedorNA = Boolean(padre.es_grupo || String(padre.actividad || '').trim().toUpperCase() === 'N/A');
    if (esContenedorNA && hijos.length > 0) {
      // 1. La Nota de Crédito siempre le queda al principal (padre N/A)
      let sfTotalGrupo = Number(padre.saldo_favor_bs || 0);
      hijos.forEach(h => {
        if (Number(h.saldo_favor_bs || 0) > 0) {
          sfTotalGrupo = r2(sfTotalGrupo + Number(h.saldo_favor_bs));
          h.saldo_favor_bs = 0;
        }
      });
      padre.saldo_favor_bs = sfTotalGrupo >= 1.00 ? r2(sfTotalGrupo) : 0;

      // 2. Sincronizar aseo_pendiente_desde y multa_meses del padre N/A con sus hijos activos
      const desdesHijos = hijos.map(h => h.aseo_pendiente_desde).filter(Boolean).sort();
      const targetDesdePadre = desdesHijos.length > 0 ? desdesHijos[0] : null;
      const maxMultaHijos = Math.max(0, ...hijos.map(h => Number(h.multa_meses) || 0));
      if (padre.aseo_pendiente_desde !== targetDesdePadre || Number(padre.multa_meses || 0) !== maxMultaHijos) {
        padre.aseo_pendiente_desde = targetDesdePadre;
        padre.multa_meses = maxMultaHijos;
        unidadesASincronizarBD.push({
          id: padre.id,
          aseo_pendiente_desde: targetDesdePadre,
          multa_meses: maxMultaHijos,
        });
      }
    }
  });

  // Si una unidad tenía es_grupo=true (antiguo contenedor N/A) pero ya no tiene actividades hijas activas
  // y ahora está Desocupada o tiene actividad propia, quitarle es_grupo para que cobre su tarifa propia.
  const idsQuitarEsGrupo: string[] = [];
  unidades.forEach((u: any) => {
    if (u.es_grupo && !hijosPorPadre.has(u.id) && (u.estado === 'Desocupada' || !M.esSinActividad(u.actividad))) {
      u.es_grupo = false;
      idsQuitarEsGrupo.push(u.id);
    }
  });
  if (idsQuitarEsGrupo.length > 0) {
    sb.from('condominio_unidades').update({ es_grupo: false }).in('id', idsQuitarEsGrupo).then(() => {});
  }

  if (unidadesASincronizarBD.length > 0) {
    Promise.all(
      unidadesASincronizarBD.map(uSync =>
        sb.from('condominio_unidades').update({
          aseo_pendiente_desde: uSync.aseo_pendiente_desde,
          multa_meses: uSync.multa_meses,
        }).eq('id', uSync.id)
      )
    ).catch(() => { });
  }

  const { data: movimientos } = await sb.from('condominio_movimientos').select('*').eq('condominio_id', condo.id).order('created_at', { ascending: false }).limit(1000);
  const { data: multas } = await sb.from('condominio_multas').select('*').eq('condominio_id', condo.id).order('created_at', { ascending: false });

  // Cargar historial de pagos reportados asociados a este condominio
  const pagoIds = [...new Set((movimientos || []).map((m: any) => m.pago_id).filter(Boolean))];
  const pagosMap = new Map<string, any>();
  const COLS_PAGOS = 'id, identidad, monto, referencia, tipo, banco, estado, created_at, detalles';
  if (pagoIds.length > 0) {
    for (let i = 0; i < pagoIds.length; i += 200) {
      const { data: pagosPorId } = await sb.from('pagos_reportados').select(COLS_PAGOS).in('id', pagoIds.slice(i, i + 200));
      (pagosPorId || []).forEach(p => pagosMap.set(p.id, p));
    }
  }
  if (condo.identidad) {
    const { data: pagosPorRif } = await sb.from('pagos_reportados').select(COLS_PAGOS).eq('identidad', condo.identidad).order('created_at', { ascending: false }).limit(50);
    (pagosPorRif || []).forEach(p => { if (!pagosMap.has(p.id)) pagosMap.set(p.id, p); });
  }
  const { data: pagosPorCod } = await sb.from('pagos_reportados').select(COLS_PAGOS).filter('detalles->condominio->>codigo', 'eq', condo.codigo).limit(50);
  (pagosPorCod || []).forEach(p => { if (!pagosMap.has(p.id)) pagosMap.set(p.id, p); });

  // También buscar pagos registrados en Caja General / Conciliación a nombre de los propietarios de las unidades
  // que hayan incluido algún código de inmueble perteneciente a este condominio
  const rifsUnidades = [...new Set(unidades.map((u: any) => String(u.identidad || '').trim()).filter(r => r.length >= 6 && r !== condo.identidad))];
  const codigosSet = new Set(codigosUnidades);
  if (rifsUnidades.length > 0 && codigosSet.size > 0) {
    for (let i = 0; i < rifsUnidades.length; i += 100) {
      const { data: pagosUnids } = await sb.from('pagos_reportados')
        .select(COLS_PAGOS)
        .in('identidad', rifsUnidades.slice(i, i + 100))
        .order('created_at', { ascending: false })
        .limit(100);
      (pagosUnids || []).forEach(p => {
        if (pagosMap.has(p.id)) return;
        const det = (p.detalles && typeof p.detalles === 'object') ? (p.detalles as any) : {};
        const { deuda_previa, ...detSinPrevia } = det;
        const codDirecto = String(det.cod_inmueble || det.codigo_inmueble || '').trim().toUpperCase();
        const recibosArr: string[] = Array.isArray(det.recibos) ? det.recibos.map((r: any) => String(r || '').toUpperCase()) : [];
        if (codDirecto && codDirecto !== condo.codigo && !codigosSet.has(codDirecto)) {
          const tieneReciboDeUnidad = recibosArr.some(r => Array.from(codigosSet).some(c => r.includes(c)));
          if (!tieneReciboDeUnidad) return;
        }
        const detStr = JSON.stringify(detSinPrevia || {}).toUpperCase();
        for (const codU of codigosSet) {
          if (detStr.includes(codU)) {
            pagosMap.set(p.id, p);
            break;
          }
        }
      });
    }
  }

  const pagos = Array.from(pagosMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { condo, unidades, movimientos: movimientos || [], multas: multas || [], pagos };
}

/** Resumen de todos los condominios (lista + panel). */
export async function resumenGeneral() {
  const [tasa, mapaTasasCongeladas] = await Promise.all([
    tasaVigente(),
    obtenerMapaTasasCongeladas(),
  ]);
  const hoyYMD = hoyCaracasYMD();
  const condos = await todas((a, b) => sb.from('condominios').select('*').neq('estado', 'Eliminado').order('nombre').range(a, b));
  const unidades = await todas((a, b) => sb.from('condominio_unidades')
    .select('*').neq('estado', 'Eliminada').order('id').range(a, b));
  const { data: multas } = await sb.from('condominio_multas').select('id,condominio_id,unidad_id,monto_bs,monto_mmv,estado,concepto,periodo,creada_por,created_at').eq('estado', 'Pendiente');
  const porCondo = new Map<string, any[]>();
  unidades.forEach(u => { if (!porCondo.has(u.condominio_id)) porCondo.set(u.condominio_id, []); porCondo.get(u.condominio_id)!.push(u); });
  const multasPor = new Map<string, any[]>();
  (multas || []).forEach(m => { if (!multasPor.has(m.condominio_id)) multasPor.set(m.condominio_id, []); multasPor.get(m.condominio_id)!.push(m); });

  // Paginado: antes solo leía los primeros 1000 inmuebles (límite de Supabase)
  const inmueblesGlobal = await todas((a, b) => sb.from('inmuebles').select('identidad, agente_retencion, inmueble, meses_deuda, multa_bs, padre_id, notas').order('id').range(a, b));
  const agentes = new Map<string, boolean>();
  const infoInmuebles = new Map<string, any>();
  (inmueblesGlobal || []).forEach((c: any) => {
    if (c.identidad && c.agente_retencion) agentes.set(c.identidad, true);
    if (c.inmueble) infoInmuebles.set(String(c.inmueble).trim().toUpperCase(), c);
  });

  const condosMap = new Map<string, any>(condos.map((c: any) => [c.id, c]));
  unidades.forEach(u => {
    const inf = infoInmuebles.get(String(u.inmueble || '').trim().toUpperCase()) || {};
    u.agente_retencion = !!inf.agente_retencion;
    u.multa_bs = parseFloat(inf.multa_bs || '0');
    u.padre_inmueble = inf.padre_id || null;
    u.notas_inmueble = inf.notas || '';
    const cPadre = condosMap.get(u.condominio_id);
    if (cPadre && unidadesPropias(cPadre) && inf.meses_deuda !== undefined && inf.meses_deuda !== null) {
      const mInm = Math.max(0, parseInt(String(inf.meses_deuda), 10) || 0);
      const mUnid = M.mesesPendientes(u.aseo_pendiente_desde);
      if (Number(u.multa_meses || 0) > 0 && mUnid <= 1 && mInm <= 1 && u.multa_bs <= 0.01) {
        u.multa_meses = 0;
      }
    }
  });

  const filas = condos.map(c => {
    const us = porCondo.get(c.id) || [];
    const codUpper = String(c.codigo || '').trim().toUpperCase();
    const infCondo = infoInmuebles.get(codUpper);
    c.notas_inmueble = infCondo?.notas || '';
    c.agente_retencion = Boolean(c.agente_retencion || infCondo?.agente_retencion);
    const tcCfg = mapaTasasCongeladas[codUpper] || null;
    const tcActiva = resolverTasaCongelada(tcCfg, hoyYMD);
    c.tasa_congelada_config = tcCfg;
    c.tasa_congelada_activa = tcActiva;
    const tasaEfectiva = tcActiva && tcActiva.tasa > 0 ? tcActiva.tasa : tasa;
    const e = calcularEstado(c, us, tasaEfectiva, new Date(), multasPor.get(c.id) || []);
    return {
      codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, tipo: c.tipo, modalidad: c.modalidad, estado: c.estado,
      cant_declarada: c.cant_declarada, unidades: us.length, mensualBs: e.mensual.condominioBs,
      meses: e.totales.mesesMax, deudaBs: e.totales.totalBs, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad, porActividad: e.porActividad,
      permite_pago_por_unidad: !!c.permite_pago_por_unidad, permite_abonos: c.permite_abonos !== false, origen: c.origen || 'MIGRACION',
      tasaAplicada: tasaEfectiva,
      tasaCongelada: tcActiva,
      tasaCongeladaConfig: tcCfg,
      tasaCongeladaEstado: estadoVigenciaTasaCongelada(tcCfg, hoyYMD),
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
  const { data: us } = await sb.from('condominio_unidades')
    .select('*, condominios!inner(codigo,nombre,modalidad,tipo,estado)')
    .neq('estado', 'Eliminada')
    .neq('condominios.estado', 'Eliminado')
    .ilike('identidad', `%${n}%`)
    .limit(300);
  return (us || []).filter((u: any) => u.estado !== 'Eliminada' && (u.condominios?.estado !== 'Eliminado') && M.normId(u.identidad) === n);
}

/**
 * Toma la foto de la deuda desde `inmuebles` y la guarda en el módulo (al migrar y el día de la separación).
 * Devuelve el detalle de lo que cambiaría; solo escribe con `aplicar`.
 */
export async function refrescarDesdeInmuebles(aplicar = false) {
  const condos = await todas((a, b) => sb.from('condominios').select('*').neq('estado', 'Eliminado').order('id').range(a, b));
  const unidades = await todas((a, b) => sb.from('condominio_unidades').select('id,condominio_id,inmueble,aseo_pendiente_desde').neq('estado', 'Eliminada').order('id').range(a, b));
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
