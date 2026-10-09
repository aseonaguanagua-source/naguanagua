/**
 * COBRO DE CONDOMINIOS (servidor). Un solo lugar que:
 *  1) arma el cobro con el motor (nunca confía en montos enviados por la pantalla);
 *  2) si la Caja de Condominios está ACTIVA y se confirma, registra el pago y baja la deuda EN EL MÓDULO
 *     (no toca Contribuyentes: los datos no se cruzan).
 *
 * Modos (los escoge el cajero al seleccionar el condominio):
 *  - CONDOMINIO: paga el condominio completo → UNA factura al condominio.
 *      · Residencial centralizado: aseo + multas del condominio.
 *      · Por actividad (comercial/mixto/individual): aseo + IVA de todas las unidades; las multas NO
 *        (las paga cada contribuyente): las de los meses pagados quedan pendientes en su unidad.
 *  - CONTRIBUYENTE: se escogen locales/unidades (o la cédula del dueño) → UNA factura POR DUEÑO.
 *      Incluye su aseo y sus multas. Si un mismo pago bancario cubre a varios dueños, se registra una
 *      fila por dueño con la misma referencia y el mismo `grupo_pago`.
 * Mientras el interruptor `condominios_caja_activa` esté apagado, todo es SIMULACIÓN.
 */
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import * as M from './motor';
import { calcularEstado, cargarCondominio, tasaVigente, EstadoCuenta, RenglonEstado } from './servicio';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function cajaActiva(): Promise<boolean> {
  const { data } = await sb.from('sistema_config').select('valor').eq('id', 'condominios_caja_activa').maybeSingle();
  return String(data?.valor ?? '').toLowerCase() === 'true';
}

export type ModoCobro = 'CONDOMINIO' | 'CONTRIBUYENTE';

export interface SolicitudCobro {
  codigo: string;
  modo?: ModoCobro;
  /** Renglones a pagar en modo CONTRIBUYENTE (claves del estado de cuenta). */
  claves?: string[];
  /** Cédula/RIF del dueño: toma todas sus unidades en este condominio (modo CONTRIBUYENTE). */
  identidad?: string | null;
  /** Meses a pagar por renglón, empezando por el más viejo. Vacío = todos. */
  meses?: number | null;
  /** Solo multas (modo CONTRIBUYENTE) */
  soloMultas?: boolean;
  tasaOverride?: number;
  fechaOverride?: string;
}

export interface LineaCobro {
  clave: string;
  inmueble: string | null;
  numero: string | null;
  propietario: string | null;
  identidad: string | null;
  actividad: string | null;
  residencial: boolean;
  meses: number;
  mesesDeuda: number;
  periodos: string[];
  baseBs: number;
  /** multa de mora de los meses pagados */
  multaBs: number;
  /** multas pendientes de meses ya pagados + multas manuales */
  multasAparteBs: number;
  multasManualesIds: string[];
  ivaBs: number;
  retencionBs: number;
  totalBs: number;
  /** Multa de mora de estos meses que queda pendiente para el contribuyente (modo CONDOMINIO por actividad) */
  multaMesesQueQuedan: number;
}

export interface Factura { identidad: string; nombre: string; lineas: string[]; totalBs: number }

export interface Cobro {
  condo: any;
  estado: EstadoCuenta;
  modo: ModoCobro;
  puedePagarCondominio: boolean;
  lineas: LineaCobro[];
  facturas: Factura[];
  totales: { baseBs: number; multaBs: number; ivaBs: number; retencionBs: number; totalBs: number; meses: number };
  avisos: string[];
}

const n = (s: any) => M.normId(s);

/** Arma el cobro (no escribe nada). */
export async function prepararCobro(sol: SolicitudCobro): Promise<Cobro & { _datos: any }> {
  const datos = await cargarCondominio(sol.codigo);
  if (!datos) throw new Error('Condominio no encontrado');
  const tasa = sol.tasaOverride && sol.tasaOverride > 0 ? sol.tasaOverride : await tasaVigente();
  if (!(tasa > 0)) throw new Error('No hay tasa BCV vigente configurada.');
  const fecha = sol.fechaOverride ? new Date(sol.fechaOverride) : new Date();
  const estado = calcularEstado(datos.condo, datos.unidades, tasa, fecha, datos.multas);
  const porAct = estado.porActividad;
  const avisos: string[] = [];
  const modo: ModoCobro = sol.modo === 'CONTRIBUYENTE' || sol.identidad || (sol.claves || []).length ? (sol.modo || 'CONTRIBUYENTE') : (sol.modo || 'CONDOMINIO');

  const conDeuda = estado.renglones.filter(r => r.totalBs > 0.01);
  let elegidas: RenglonEstado[];
  if (modo === 'CONDOMINIO') elegidas = conDeuda;
  else {
    const pedidas = new Set((sol.claves || []).filter(Boolean));
    const ced = sol.identidad ? n(sol.identidad) : '';
    elegidas = conDeuda.filter(r => pedidas.has(r.clave) || (ced && n(r.identidad) === ced));
    if (!porAct && elegidas.some(r => r.deuda.meses > 0)) avisos.push('Residencial centralizado: al pagar una unidad por separado, se descuenta solo esa unidad.');
  }

  const lineas: LineaCobro[] = elegidas.map(r => {
    const nMeses = sol.soloMultas ? 0 : Math.min(r.deuda.meses, sol.meses && sol.meses > 0 ? Math.floor(sol.meses) : r.deuda.meses);
    const meses = r.deuda.porMes.slice(0, nMeses);
    const s = (k: 'baseBs' | 'multaBs' | 'ivaBs' | 'retencionBs') => r2(meses.reduce((a, m) => a + m[k], 0));
    // ¿Las multas van en este cobro?
    const condoPorActividad = modo === 'CONDOMINIO' && porAct;
    const multaMora = condoPorActividad ? 0 : s('multaBs');
    const multaMesesQueQuedan = condoPorActividad ? meses.filter(m => m.multaBs > 0).length : 0;
    const incluirAparte = !condoPorActividad && (modo === 'CONTRIBUYENTE' || !porAct);
    const aparte = incluirAparte ? r2((nMeses === r.deuda.meses || sol.soloMultas ? r.multaExtraBs : 0) + r.multasManualesBs) : 0;
    const base = s('baseBs'), iva = s('ivaBs'), ret = s('retencionBs');
    return {
      clave: r.clave, inmueble: r.inmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad, actividad: r.actividad, residencial: r.residencial,
      meses: nMeses, mesesDeuda: r.deuda.meses, periodos: r.periodos.slice(0, nMeses),
      baseBs: base, multaBs: multaMora, multasAparteBs: aparte, multasManualesIds: incluirAparte ? r.multasManuales.map(m => m.id) : [],
      ivaBs: iva, retencionBs: ret, totalBs: r2(base + multaMora + iva - ret + aparte), multaMesesQueQuedan,
    };
  }).filter(l => l.totalBs > 0.01);

  if (modo === 'CONDOMINIO' && porAct && conDeuda.some(r => r.deuda.multaBs + r.multaExtraBs + r.multasManualesBs > 0))
    avisos.push('Las multas no van en el pago del condominio: las paga cada contribuyente (búsquelo por su cédula).');

  // Facturas: CONDOMINIO → una al condominio. CONTRIBUYENTE → una por dueño.
  const facturas: Factura[] = [];
  if (modo === 'CONDOMINIO') facturas.push({ identidad: datos.condo.identidad, nombre: datos.condo.nombre, lineas: lineas.map(l => l.clave), totalBs: r2(lineas.reduce((a, l) => a + l.totalBs, 0)) });
  else {
    const g = new Map<string, Factura>();
    for (const l of lineas) {
      const k = n(l.identidad) || `SIN-${l.clave}`;
      if (!g.has(k)) g.set(k, { identidad: l.identidad || datos.condo.identidad, nombre: l.propietario || datos.condo.nombre, lineas: [], totalBs: 0 });
      const f = g.get(k)!; f.lineas.push(l.clave); f.totalBs = r2(f.totalBs + l.totalBs);
    }
    facturas.push(...g.values());
  }

  const t = (k: keyof LineaCobro) => r2(lineas.reduce((a, l) => a + (Number(l[k]) || 0), 0));
  return {
    condo: datos.condo, estado, modo, puedePagarCondominio: true, lineas, facturas, avisos, _datos: datos,
    totales: { baseBs: t('baseBs'), multaBs: r2(t('multaBs') + t('multasAparteBs')), ivaBs: t('ivaBs'), retencionBs: t('retencionBs'), totalBs: t('totalBs'), meses: Math.max(0, ...lineas.map(l => l.meses)) },
  };
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
  pagosAgregados?: any[];
}

const formaPagoCodigo = (m: string) => m === 'Debito' ? '03' : ['Credito', 'TMD', 'TVD'].includes(m) ? '02' : m === 'Efectivo' ? '01' : '05';

/** Registra el cobro (solo con la Caja de Condominios activa). Baja la deuda solo en el módulo. */
export async function registrarCobro(sol: SolicitudCobro, pago: DatosPago) {
  const cobro = await prepararCobro(sol);
  if (!cobro.lineas.length) throw new Error('No hay deuda para cobrar con esa selección.');
  if (Math.abs(r2(pago.montoRecibido) - cobro.totales.totalBs) > 0.05) throw new Error(`El monto cambió (ahora Bs ${cobro.totales.totalBs.toFixed(2)}). Vuelva a calcular antes de cobrar.`);
  const ref = String(pago.referencia || '').trim();
  if (pago.metodo !== 'Efectivo') {
    if (ref.length < 4) throw new Error('Escriba la referencia del pago.');
    const { data: rep } = await sb.from('pagos_reportados').select('id,identidad,monto').eq('referencia', ref).neq('estado', 'Rechazado').limit(1);
    if (rep?.length) throw new Error(`La referencia ${ref} ya fue usada en otro pago (${rep[0].identidad}, Bs ${rep[0].monto}).`);
  }

  const c = cobro.condo, tasa = cobro.estado.tasa, hoy = new Date();
  const datos = cobro._datos;
  const porId = new Map<string, any>(datos.unidades.map((u: any) => [u.id, u]));
  const lineaPor = new Map(cobro.lineas.map(l => [l.clave, l]));
  const grupo = cobro.facturas.length > 1 ? pago.pagoId : null;
  const refFinal = ref || `EFECTIVO-${Date.now()}`;

  // 1) Un pago por factura (el primero usa el id de la pantalla: si se envía dos veces, falla y no cobra doble)
  const pagos: { id: string; reciboRef: string; factura: Factura }[] = [];
  for (let i = 0; i < cobro.facturas.length; i++) {
    const f = cobro.facturas[i];
    const id = i === 0 ? pago.pagoId : crypto.randomUUID();
    const reciboRef = `CONDO-${c.codigo}-${Date.now().toString().slice(-6)}${cobro.facturas.length > 1 ? `-${i + 1}` : ''}`;
    const ls = f.lineas.map(k => lineaPor.get(k)!).filter(Boolean);
    const ret = r2(ls.reduce((a, l) => a + l.retencionBs, 0));
    let formasPago = [{ descripcion: pago.metodo, fecha: new Date().toISOString(), forma: formaPagoCodigo(pago.metodo), banco: pago.banco || undefined, referencia: ref || undefined, monto: f.totalBs }];
    if (pago.pagosAgregados && pago.pagosAgregados.length > 0) {
      // Si el cobro tiene múltiples facturas y múltiples pagos agregados, se prorratea. 
      // Por simplicidad, guardamos los métodos en los detalles. 
      formasPago = pago.pagosAgregados.map(pa => ({
        descripcion: pa.metodo, fecha: pa.fecha ? new Date(pa.fecha + 'T12:00:00Z').toISOString() : new Date().toISOString(), forma: formaPagoCodigo(pa.metodo), banco: pa.banco || undefined, referencia: pa.referencia || undefined, monto: pa.monto
      }));
    }

    const detalles = {
      modulo: 'condominios', modo: cobro.modo, cajero: pago.cajero, tasa_bcv: tasa, es_condominio: true, isCondominio: true,
      condominio: { codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, modalidad: c.modalidad, tipo: c.tipo,
        lineas: ls.map(l => ({ inmueble: l.inmueble, numero: l.numero, actividad: l.actividad, residencial: l.residencial, meses: l.meses, periodos: l.periodos, aseoBs: l.baseBs, ivaBs: l.ivaBs, multaBs: r2(l.multaBs + l.multasAparteBs), retencionBs: l.retencionBs, totalBs: l.totalBs })) },
      ...(grupo ? { grupo_pago: { id: grupo, referencia: refFinal, monto_total: cobro.totales.totalBs, partes: cobro.facturas.length, parte: i + 1 } } : {}),
      recibos: [reciboRef], montos: { [reciboRef]: f.totalBs }, montoTotal: f.totalBs,
      monto_retencion_iva: ret, contribuyente: f.nombre, identidad: f.identidad,
      factura_digital: { emitida: false, pendiente: true, preparada_at: new Date().toISOString() },
      formasPago,
      pagos_agregados: pago.pagosAgregados
    };
    const esTransferencia = pago.metodo.toLowerCase().includes('transferencia') || pago.metodo.toLowerCase().includes('pago móvil') || (pago.pagosAgregados && pago.pagosAgregados.some((pa: any) => pa.metodo.toLowerCase().includes('transferencia') || pa.metodo.toLowerCase().includes('pago móvil')));
    const fila: any = { id, identidad: f.identidad, monto: f.totalBs, banco: pago.banco || pago.metodo, referencia: refFinal, tipo: pago.metodo, estado: esTransferencia ? 'Por Verificar' : 'Aprobado', modulo: 'condominios', detalles };
    if (grupo) fila.grupo_pago = grupo;
    const { error } = await sb.from('pagos_reportados').insert(fila);
    if (error) {
      if (i === 0) throw new Error(error.message.includes('duplicate') ? 'Este pago ya fue registrado.' : 'No se pudo registrar el pago: ' + error.message);
      throw new Error(`Se registró parte del pago pero falló la parte ${i + 1}: ${error.message}. Avise al administrador (pago ${pago.pagoId}).`);
    }
    pagos.push({ id, reciboRef, factura: f });
  }
  const pagoDe = (clave: string) => pagos.find(p => p.factura.lineas.includes(clave))?.id || pago.pagoId;

  // 2) Bajar la deuda en el módulo
  const antes: any[] = [];
  for (const l of cobro.lineas) {
    const u = porId.get(l.clave);
    if (u) {
      const upd: any = {};
      if (l.meses > 0) upd.aseo_pendiente_desde = M.avanzarPendiente(u.aseo_pendiente_desde, l.meses, hoy);
      if (l.multaMesesQueQuedan > 0) upd.multa_meses = (Number(u.multa_meses) || 0) + l.multaMesesQueQuedan;
      else if (l.multasAparteBs > 0 && (l.meses === l.mesesDeuda || sol.soloMultas)) upd.multa_meses = 0;
      if (Object.keys(upd).length) { antes.push({ unidad: u.id, inmueble: u.inmueble, aseo_pendiente_desde: u.aseo_pendiente_desde, multa_meses: u.multa_meses }); await sb.from('condominio_unidades').update(upd).eq('id', u.id); }
    } else if (l.clave === M.SIN_REGISTRAR || l.clave === '__CONDOMINIO__') {
      const upd: any = {};
      if (l.meses > 0) upd.aseo_pendiente_desde = M.avanzarPendiente(c.aseo_pendiente_desde, l.meses, hoy);
      if (l.multasAparteBs > 0) upd.multa_meses = 0;
      if (Object.keys(upd).length) { antes.push({ condominio: c.id, aseo_pendiente_desde: c.aseo_pendiente_desde, multa_meses: c.multa_meses }); await sb.from('condominios').update(upd).eq('id', c.id); }
    }
    if (l.multasManualesIds.length) await sb.from('condominio_multas').update({ estado: 'Pagada', pago_id: pagoDe(l.clave) }).in('id', l.multasManualesIds).eq('estado', 'Pendiente');
  }
  // Residencial centralizado pagado completo: el condominio también avanza
  if (cobro.modo === 'CONDOMINIO' && !cobro.estado.porActividad && !cobro.lineas.some(l => l.clave === M.SIN_REGISTRAR)) {
    const nMeses = cobro.totales.meses;
    if (nMeses > 0 && c.aseo_pendiente_desde) await sb.from('condominios').update({ aseo_pendiente_desde: M.avanzarPendiente(c.aseo_pendiente_desde, nMeses, hoy), multa_meses: 0 }).eq('id', c.id);
  }

  // 3) Libro del condominio
  const movs = cobro.lineas.map(l => ({
    condominio_id: c.id, unidad_id: porId.has(l.clave) ? l.clave : null, tipo: 'PAGO', periodo: l.periodos[0] ? `${l.periodos[0]}-01` : null,
    concepto: `${cobro.modo === 'CONDOMINIO' ? 'Pago del condominio' : 'Pago del contribuyente'}${l.inmueble ? ` · ${l.inmueble}` : ''}: ${l.meses ? `${l.meses} mes(es) ${l.periodos.join(', ')}` : ''}${l.multasAparteBs > 0 ? ' + multas' : ''}`,
    monto_bs: -l.totalBs, tasa_bcv: tasa, pago_id: pagoDe(l.clave), usuario: pago.usuario,
  }));
  for (let i = 0; i < movs.length; i += 300) await sb.from('condominio_movimientos').insert(movs.slice(i, i + 300));

  await sb.from('auditoria').insert({
    accion: 'Cobro en Caja de Condominios', usuario: pago.usuario, modulo: '/admin/condominios/caja',
    detalles: { pagos: pagos.map(p => ({ id: p.id, identidad: p.factura.identidad, monto: p.factura.totalBs })), codigo: c.codigo, condominio: c.nombre, modo: cobro.modo,
      monto: cobro.totales.totalBs, metodo: pago.metodo, referencia: ref, lineas: cobro.lineas.length, deuda_previa: antes, _categoria: 'CONDOMINIOS', criticidad: 'ALTA' },
  });
  return { pagoId: pago.pagoId, pagos: pagos.map(p => ({ id: p.id, reciboRef: p.reciboRef, identidad: p.factura.identidad, nombre: p.factura.nombre, monto: p.factura.totalBs })), monto: cobro.totales.totalBs, cobro };
}
