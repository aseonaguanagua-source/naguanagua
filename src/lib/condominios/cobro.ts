/**
 * COBRO DE CONDOMINIOS (servidor). Un solo lugar que:
 *  1) arma el cobro con el motor (nunca confía en montos enviados por la pantalla);
 *  2) si la Caja de Condominios está ACTIVA y se confirma, registra el pago y baja la deuda
 *     en el módulo Y en `inmuebles` (para que Contribuyentes, Caja, portal y solvencias vean lo mismo).
 * Mientras el interruptor `condominios_caja_activa` esté apagado, todo es SIMULACIÓN (no escribe nada).
 */
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import * as M from './motor';
import { calcularEstado, cargarCondominio, tasaVigente, unidadesPropias, EstadoCuenta } from './servicio';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function cajaActiva(): Promise<boolean> {
  const { data } = await sb.from('sistema_config').select('valor').eq('id', 'condominios_caja_activa').maybeSingle();
  return String(data?.valor ?? '').toLowerCase() === 'true';
}

export interface SolicitudCobro {
  codigo: string;
  /** Renglones a pagar (claves del estado de cuenta). Vacío = todo lo que tenga deuda. */
  claves?: string[];
  /** Meses a pagar por renglón, empezando por el más viejo. Vacío = todos. */
  meses?: number | null;
}

export interface LineaCobro {
  clave: string;
  inmueble: string | null;
  numero: string | null;
  propietario: string | null;
  identidad: string | null;
  meses: number;
  mesesDeuda: number;
  periodos: string[];
  baseBs: number;
  multaBs: number;
  ivaBs: number;
  retencionBs: number;
  totalBs: number;
}

export interface Cobro {
  condo: any;
  estado: EstadoCuenta;
  puedeElegirUnidades: boolean;
  lineas: LineaCobro[];
  totales: { baseBs: number; multaBs: number; ivaBs: number; retencionBs: number; totalBs: number; meses: number };
  avisos: string[];
}

/** Arma el cobro (no escribe nada). */
export async function prepararCobro(sol: SolicitudCobro): Promise<Cobro & { _datos: any }> {
  const datos = await cargarCondominio(sol.codigo);
  if (!datos) throw new Error('Condominio no encontrado');
  const tasa = await tasaVigente();
  if (!(tasa > 0)) throw new Error('No hay tasa BCV vigente configurada.');
  const estado = calcularEstado(datos.condo, datos.unidades, tasa);
  const propias = unidadesPropias(datos.condo);
  const avisos: string[] = [];
  if (!propias && datos.condo.permite_pago_por_unidad) avisos.push('Este condominio paga como un todo (centralizado): por ahora se cobra completo.');

  const conDeuda = estado.renglones.filter(r => r.totalBs > 0.01);
  const pedidas = new Set((sol.claves || []).filter(Boolean));
  const elegidas = propias && pedidas.size ? conDeuda.filter(r => pedidas.has(r.clave)) : conDeuda;

  const lineas: LineaCobro[] = elegidas.map(r => {
    const n = Math.min(r.deuda.meses, sol.meses && sol.meses > 0 ? Math.floor(sol.meses) : r.deuda.meses);
    const meses = r.deuda.porMes.slice(0, n);
    const s = (k: 'baseBs' | 'multaBs' | 'ivaBs' | 'retencionBs' | 'totalBs') => r2(meses.reduce((a, m) => a + m[k], 0));
    const extra = n === r.deuda.meses ? r.multaExtraBs : 0; // multas viejas: solo al ponerse al día
    return {
      clave: r.clave, inmueble: r.inmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad,
      meses: n, mesesDeuda: r.deuda.meses, periodos: r.periodos.slice(0, n),
      baseBs: s('baseBs'), multaBs: r2(s('multaBs') + extra), ivaBs: s('ivaBs'), retencionBs: s('retencionBs'), totalBs: r2(s('totalBs') + extra),
    };
  }).filter(l => l.totalBs > 0.01);

  const t = (k: keyof LineaCobro) => r2(lineas.reduce((a, l) => a + (Number(l[k]) || 0), 0));
  return {
    condo: datos.condo, estado, puedeElegirUnidades: propias, lineas, avisos, _datos: datos,
    totales: { baseBs: t('baseBs'), multaBs: t('multaBs'), ivaBs: t('ivaBs'), retencionBs: t('retencionBs'), totalBs: t('totalBs'), meses: Math.max(0, ...lineas.map(l => l.meses)) },
  };
}

/** Baja `n` meses de un inmueble con el mismo criterio que la Caja (proporcional en deuda_mmv y multa_bs). */
async function bajarMesesInmueble(codigo: string, n: number) {
  const { data: inm } = await sb.from('inmuebles').select('id,inmueble,estado,meses_deuda,deuda_mmv,multa_bs,deuda_congelada_bs').eq('inmueble', codigo).maybeSingle();
  if (!inm || inm.estado === 'Eliminado') return null;
  const antes = Math.max(0, parseInt(String(inm.meses_deuda ?? 0)) || 0);
  if (antes <= 0 || n <= 0) return { inmueble: codigo, antes, despues: antes };
  const despues = Math.max(0, antes - n);
  const d = parseFloat(String(inm.deuda_mmv || 0)), m = parseFloat(String(inm.multa_bs || 0));
  const upd = despues === 0
    ? { meses_deuda: 0, deuda_mmv: 0, multa_bs: 0, deuda_congelada_bs: 0 }
    : { meses_deuda: despues, deuda_mmv: parseFloat(((d * despues) / antes).toFixed(6)), multa_bs: parseFloat(((m * despues) / antes).toFixed(2)) };
  const { error } = await sb.from('inmuebles').update(upd).eq('id', inm.id);
  if (error) throw new Error(`No se pudo actualizar ${codigo}: ${error.message}`);
  return { inmueble: codigo, antes, despues, previo: inm };
}

export interface DatosPago {
  pagoId: string;
  metodo: string;
  banco?: string;
  referencia?: string;
  /** Monto que el cajero dice haber recibido; debe coincidir con el calculado */
  montoRecibido: number;
  cajero: string;
  usuario: string;
  /** Quién paga (para la factura). Por defecto el condominio. */
  identidadPagador?: string;
  nombrePagador?: string;
}

/** Registra el cobro. Solo con la Caja de Condominios activa. */
export async function registrarCobro(sol: SolicitudCobro, pago: DatosPago) {
  const cobro = await prepararCobro(sol);
  if (!cobro.lineas.length) throw new Error('No hay deuda para cobrar con esa selección.');
  if (Math.abs(r2(pago.montoRecibido) - cobro.totales.totalBs) > 0.05) {
    throw new Error(`El monto cambió (ahora Bs ${cobro.totales.totalBs.toFixed(2)}). Vuelva a calcular antes de cobrar.`);
  }
  const ref = String(pago.referencia || '').trim();
  if (pago.metodo !== 'Efectivo') {
    if (ref.length < 4) throw new Error('Escriba la referencia del pago.');
    const { data: rep } = await sb.from('pagos_reportados').select('id,identidad,monto,estado,created_at').eq('referencia', ref).neq('estado', 'Rechazado').limit(1);
    if (rep?.length) throw new Error(`La referencia ${ref} ya fue usada en otro pago (${rep[0].identidad}, Bs ${rep[0].monto}).`);
  }

  const c = cobro.condo;
  const tasa = cobro.estado.tasa;
  const identidad = pago.identidadPagador || c.identidad;
  const reciboRef = `CONDO-${c.codigo}-${Date.now().toString().slice(-6)}`;
  const monto = cobro.totales.totalBs;
  const formaPago = pago.metodo === 'Debito' ? '03' : ['Credito', 'TMD', 'TVD'].includes(pago.metodo) ? '02' : pago.metodo === 'Efectivo' ? '01' : '05';
  const detalles = {
    modulo: 'condominios', cajero: pago.cajero, tasa_bcv: tasa, es_condominio: true, isCondominio: true,
    condominio: { codigo: c.codigo, nombre: c.nombre, modalidad: c.modalidad, lineas: cobro.lineas.map(l => ({ inmueble: l.inmueble, clave: l.clave, meses: l.meses, periodos: l.periodos, totalBs: l.totalBs })) },
    recibos: [reciboRef], montos: { [reciboRef]: monto }, montoTotal: monto,
    monto_retencion_iva: cobro.totales.retencionBs, contribuyente: pago.nombrePagador || c.nombre, identidad,
    factura_digital: { emitida: false, pendiente: true, preparada_at: new Date().toISOString() },
    formasPago: [{ descripcion: pago.metodo, fecha: new Date().toISOString(), forma: formaPago, banco: pago.banco || undefined, referencia: ref || undefined, monto }],
  };

  // 1) Pago (el id lo genera la pantalla: si se envía dos veces, la segunda falla y no se cobra doble)
  const { error: ePago } = await sb.from('pagos_reportados').insert({
    id: pago.pagoId, identidad, monto, banco: pago.banco || pago.metodo, referencia: ref || `EFECTIVO-${Date.now()}`,
    tipo: pago.metodo, estado: 'Aprobado', modulo: 'condominios', detalles,
  });
  if (ePago) throw new Error(ePago.message.includes('duplicate') ? 'Este pago ya fue registrado.' : 'No se pudo registrar el pago: ' + ePago.message);

  // 2) Bajar la deuda en `inmuebles` y en el módulo
  const cambios: any[] = [];
  const hoy = new Date();
  const datos = cobro._datos;
  const porId = new Map<string, any>(datos.unidades.map((u: any) => [u.id, u]));
  if (unidadesPropias(c)) {
    for (const l of cobro.lineas) {
      const u = porId.get(l.clave);
      if (!u) continue;
      if (u.inmueble) cambios.push(await bajarMesesInmueble(u.inmueble, l.meses));
      await sb.from('condominio_unidades').update({ aseo_pendiente_desde: M.avanzarPendiente(u.aseo_pendiente_desde, l.meses, hoy), ...(l.meses === l.mesesDeuda ? { multa_meses: 0 } : {}) }).eq('id', u.id);
    }
  } else {
    const n = cobro.totales.meses;
    cambios.push(await bajarMesesInmueble(c.codigo, n));
    for (const u of datos.unidades) if (u.inmueble) cambios.push(await bajarMesesInmueble(u.inmueble, n));
    const nuevo = M.avanzarPendiente(c.aseo_pendiente_desde, n, hoy);
    await sb.from('condominios').update({ aseo_pendiente_desde: nuevo, ...(cobro.lineas.every(l => l.meses === l.mesesDeuda) ? { multa_meses: 0 } : {}) }).eq('id', c.id);
    const ids = datos.unidades.map((u: any) => u.id);
    for (let i = 0; i < ids.length; i += 300) await sb.from('condominio_unidades').update({ aseo_pendiente_desde: nuevo }).in('id', ids.slice(i, i + 300));
  }

  // 3) Libro del condominio
  const movs = cobro.lineas.map(l => ({
    condominio_id: c.id, unidad_id: porId.has(l.clave) ? l.clave : null, tipo: 'PAGO', periodo: l.periodos[0] ? `${l.periodos[0]}-01` : null,
    concepto: `Pago ${l.meses} mes(es)${l.inmueble ? ` · ${l.inmueble}` : ''}: ${l.periodos.join(', ')}`,
    monto_bs: -l.totalBs, tasa_bcv: tasa, pago_id: pago.pagoId, usuario: pago.usuario,
  }));
  for (let i = 0; i < movs.length; i += 300) await sb.from('condominio_movimientos').insert(movs.slice(i, i + 300));

  await sb.from('auditoria').insert({
    accion: 'Cobro en Caja de Condominios', usuario: pago.usuario, modulo: '/admin/condominios/caja',
    detalles: { pago_id: pago.pagoId, codigo: c.codigo, condominio: c.nombre, monto, metodo: pago.metodo, referencia: ref, lineas: cobro.lineas.length,
      deuda_previa: cambios.filter(Boolean).map((x: any) => ({ inmueble: x.inmueble, antes: x.antes, despues: x.despues, previo: x.previo })), _categoria: 'CONDOMINIOS', criticidad: 'ALTA' },
  });
  return { pagoId: pago.pagoId, reciboRef, monto, cobro, cambios: cambios.filter(Boolean).map((x: any) => ({ inmueble: x.inmueble, antes: x.antes, despues: x.despues })) };
}
