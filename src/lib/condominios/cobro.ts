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
import { descontarSaldoFavor, acreditarSaldoFavor } from '@/lib/saldoFavor';
import { sanitizarDireccionFiscal } from '@/lib/formatters';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = String(p).split('-'); return `${MESES[parseInt(m) - 1]} ${y}`; };
const rango = (ps: string[]) => !ps?.length ? '' : ps.length === 1 ? fmtPeriodo(ps[0]) : `${fmtPeriodo(ps[0])} – ${fmtPeriodo(ps[ps.length - 1])}`;

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
  /** Meses independientes a pagar por unidad (clave -> cantidad de meses). */
  mesesPorUnidad?: Record<string, number>;
  /** Solo multas (modo CONTRIBUYENTE) */
  soloMultas?: boolean;
  /** Si es false o no está marcado, no se agrega multa al cobro de aseo */
  incluirMultas?: boolean;
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
  _multasDetalle?: any[];
}

export interface Factura {
  identidad: string;
  nombre: string;
  lineas: string[];
  totalBs: number;
  totalBrutoBs?: number;
  baseBs?: number;
  multaBs?: number;
  ivaBs?: number;
  retencionBs?: number;
}

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
  const modo: ModoCobro = sol.modo ? sol.modo : (sol.identidad ? 'CONTRIBUYENTE' : 'CONDOMINIO');

  const conDeuda = estado.renglones.filter(r => r.totalBs > 0.01);
  const pedidas = new Set((sol.claves || []).filter(Boolean));
  let elegidas: RenglonEstado[];
  if (modo === 'CONDOMINIO') {
    if (pedidas.size > 0) {
      elegidas = conDeuda.filter(r => pedidas.has(r.clave));
      if (elegidas.length < conDeuda.length) {
        avisos.push(`Abono por locales al condominio: Cobrando ${elegidas.length} de ${conDeuda.length} unidades seleccionadas a nombre del condominio.`);
      }
    } else {
      elegidas = conDeuda;
    }
  } else {
    const ced = sol.identidad ? n(sol.identidad) : '';
    elegidas = conDeuda.filter(r => pedidas.has(r.clave) || (ced && n(r.identidad) === ced));
    if (!porAct && elegidas.some(r => r.deuda.meses > 0)) avisos.push('Residencial centralizado: al pagar una unidad por separado, se descuenta solo esa unidad.');
  }

  const lineas: LineaCobro[] = elegidas.map(r => {
    if (sol.soloMultas) {
      // Lista estructurada de todas las multas disponibles para esta unidad
      const tMulta = r.residencial ? M.TASA_MULTA_RES : M.TASA_MULTA_COM;
      const cuotaMultaBs = r2(r.mensualBs * tMulta);
      
      const itemsMulta: { tipo: 'PREVIA' | 'DEUDA' | 'MANUAL'; periodo: string; montoBs: number; id?: string }[] = [];
      
      // 1) Multas acumuladas de meses anteriores cuyo aseo ya fue pagado
      const prevPeriodos = M.periodosMultasPrevias(r.pendienteDesde, r.multaMeses, fecha);
      for (const p of prevPeriodos) {
        itemsMulta.push({ tipo: 'PREVIA', periodo: p, montoBs: cuotaMultaBs });
      }
      
      // 2) Multas de mora de los meses de deuda actuales (todos los meses excepto el último)
      for (const m of r.deuda.porMes) {
        if (m.multaBs > 0) {
          const per = r.periodos[m.n - 1] || `Mes ${m.n}`;
          itemsMulta.push({ tipo: 'DEUDA', periodo: per, montoBs: m.multaBs });
        }
      }
      
      // 3) Multas manuales
      for (const man of r.multasManuales) {
        itemsMulta.push({ tipo: 'MANUAL', periodo: man.periodo || 'Multa Fija', montoBs: man.montoBs, id: man.id });
      }
      
      // ¿Cuántas multas se van a pagar?
      const mEsp = sol.mesesPorUnidad?.[r.clave];
      const nMultasMax = itemsMulta.length;
      const nMultas = (typeof mEsp === 'number' && mEsp > 0)
        ? Math.min(nMultasMax, Math.floor(mEsp))
        : (sol.meses && sol.meses > 0 ? Math.min(nMultasMax, Math.floor(sol.meses)) : nMultasMax);
      const multasAPagar = itemsMulta.slice(0, nMultas);
      const multasBs = r2(multasAPagar.reduce((sum, item) => sum + item.montoBs, 0));
      const multasManualesIds = multasAPagar.filter(item => item.id).map(item => item.id!);
      const periodosMultas = multasAPagar.map(item => item.periodo);
      
      return {
        clave: r.clave, inmueble: r.inmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad, actividad: r.actividad, residencial: r.residencial,
        meses: nMultas, mesesDeuda: itemsMulta.length, periodos: periodosMultas,
        baseBs: 0, multaBs: 0, multasAparteBs: multasBs, multasManualesIds,
        ivaBs: 0, retencionBs: 0, totalBs: multasBs, multaMesesQueQuedan: 0,
        _multasDetalle: multasAPagar,
      };
    }

    const mEsp = sol.mesesPorUnidad?.[r.clave];
    const nMesesMax = r.deuda.meses;
    const nMeses = (typeof mEsp === 'number' && mEsp > 0)
      ? Math.min(nMesesMax, Math.floor(mEsp))
      : (sol.meses && sol.meses > 0 ? Math.min(nMesesMax, Math.floor(sol.meses)) : nMesesMax);
    const meses = r.deuda.porMes.slice(0, nMeses);
    const s = (k: 'baseBs' | 'multaBs' | 'ivaBs' | 'retencionBs') => r2(meses.reduce((a, m) => a + m[k], 0));
    // ¿Las multas van en este cobro? Solo si el usuario lo tilda (o en soloMultas)
    const condoPorActividad = modo === 'CONDOMINIO' && porAct;
    const permitirMultas = sol.soloMultas || sol.incluirMultas === true;
    const multaMora = (condoPorActividad || !permitirMultas) ? 0 : s('multaBs');
    const multaMesesQueQuedan = condoPorActividad ? meses.filter(m => m.multaBs > 0).length : 0;
    const incluirAparte = permitirMultas && !condoPorActividad && (modo === 'CONTRIBUYENTE' || !porAct);
    const aparte = incluirAparte ? r2((nMeses === r.deuda.meses ? r.multaExtraBs : 0) + r.multasManualesBs) : 0;
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
  if (modo === 'CONDOMINIO') {
    const totalBs = r2(lineas.reduce((a, l) => a + l.totalBs, 0));
    const baseBs = r2(lineas.reduce((a, l) => a + l.baseBs, 0));
    const multaBs = r2(lineas.reduce((a, l) => a + l.multaBs + l.multasAparteBs, 0));
    const ivaBs = r2(lineas.reduce((a, l) => a + l.ivaBs, 0));
    const retencionBs = r2(lineas.reduce((a, l) => a + l.retencionBs, 0));
    const totalBrutoBs = r2(baseBs + multaBs + ivaBs);
    facturas.push({
      identidad: datos.condo.identidad,
      nombre: datos.condo.nombre,
      lineas: lineas.map(l => l.clave),
      totalBs,
      totalBrutoBs,
      baseBs,
      multaBs,
      ivaBs,
      retencionBs,
    });
  } else {
    const g = new Map<string, Factura>();
    for (const l of lineas) {
      const k = n(l.identidad) || `SIN-${l.clave}`;
      if (!g.has(k)) {
        g.set(k, {
          identidad: l.identidad || datos.condo.identidad,
          nombre: l.propietario || datos.condo.nombre,
          lineas: [],
          totalBs: 0,
          totalBrutoBs: 0,
          baseBs: 0,
          multaBs: 0,
          ivaBs: 0,
          retencionBs: 0,
        });
      }
      const f = g.get(k)!;
      f.lineas.push(l.clave);
      f.totalBs = r2(f.totalBs + l.totalBs);
      f.baseBs = r2((f.baseBs || 0) + l.baseBs);
      f.multaBs = r2((f.multaBs || 0) + l.multaBs + l.multasAparteBs);
      f.ivaBs = r2((f.ivaBs || 0) + l.ivaBs);
      f.retencionBs = r2((f.retencionBs || 0) + l.retencionBs);
      f.totalBrutoBs = r2((f.totalBrutoBs || 0) + l.baseBs + l.multaBs + l.multasAparteBs + l.ivaBs);
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
  bancoDestino?: string;
  referencia?: string;
  /** Monto que el cajero dice haber recibido; debe coincidir con el calculado */
  montoRecibido: number;
  cajero: string;
  usuario: string;
  pagosAgregados?: any[];
  saldoFavorGenerado?: number;
}

const formaPagoCodigo = (m: string) => m === 'Debito' ? '03' : ['Credito', 'TMD', 'TVD'].includes(m) ? '02' : m === 'Efectivo' ? '01' : '05';

/** Registra el cobro (solo con la Caja de Condominios activa). Baja la deuda solo en el módulo. */
export async function registrarCobro(sol: SolicitudCobro, pago: DatosPago) {
  const cobro = await prepararCobro(sol);
  if (!cobro.lineas.length) throw new Error('No hay deuda para cobrar con esa selección.');
  
  const montoRecibidoTotal = r2(Number(pago.montoRecibido) || 0);
  const totalDeudaCobro = cobro.totales.totalBs;
  
  // Si no se definió saldo a favor generado pero lo recibido es superior a la deuda, asignar el excedente
  if (!pago.saldoFavorGenerado && montoRecibidoTotal > totalDeudaCobro + 0.05) {
    pago.saldoFavorGenerado = r2(montoRecibidoTotal - totalDeudaCobro);
  }
  
  const montoAplicadoADeuda = r2(montoRecibidoTotal - (pago.saldoFavorGenerado || 0));
  
  // Si el monto destinado a cancelar la deuda es menor al total requerido (tolerancia de 0.10 Bs por redondeo)
  if (montoAplicadoADeuda < totalDeudaCobro - 0.10) {
    throw new Error(`El monto cambió (ahora Bs ${totalDeudaCobro.toFixed(2)}). Vuelva a calcular antes de cobrar.`);
  }

  const ref = String(pago.referencia || '').trim();
  const esMetodoSinRefUnica = pago.metodo === 'Efectivo' || pago.metodo === 'Saldo a Favor' || ref.toLowerCase().includes('saldo favor') || ref.toLowerCase().includes('efectivo');
  if (!esMetodoSinRefUnica) {
    if (ref.length < 4) throw new Error('Escriba la referencia del pago.');
    const { data: rep } = await sb.from('pagos_reportados').select('id,identidad,monto').eq('referencia', ref).not('estado', 'in', '(Rechazado,Anulado,Reversado)').limit(1);
    if (rep?.length) throw new Error(`La referencia ${ref} ya fue usada en otro pago (${rep[0].identidad}, Bs ${rep[0].monto}).`);
    // Asegurar que si existe un registro previo rechazado con esta referencia, esté liberado
    await sb.from('pagos_reportados').update({ referencia: `RECH-${ref}-${Date.now().toString().slice(-4)}` }).eq('referencia', ref).in('estado', ['Rechazado', 'Anulado', 'Reversado']);
  }

  const c = cobro.condo, tasa = cobro.estado.tasa, hoy = new Date();
  const datos = cobro._datos;
  const porId = new Map<string, any>(datos.unidades.map((u: any) => [u.id, u]));
  const lineaPor = new Map(cobro.lineas.map(l => [l.clave, l]));
  const grupo = cobro.facturas.length > 1 ? pago.pagoId : null;
  let refFinal = ref || `EFECTIVO-${Date.now()}`;

  // Foto de deuda previa para permitir reversión / rechazo seguro
  const antes: any[] = [];
  for (const l of cobro.lineas) {
    const u = porId.get(l.clave);
    if (u) {
      antes.push({ unidad: u.id, inmueble: u.inmueble, aseo_pendiente_desde: u.aseo_pendiente_desde, multa_meses: u.multa_meses, multa_exonerada_hasta: u.multa_exonerada_hasta });
    } else if (l.clave === M.SIN_REGISTRAR || l.clave === '__CONDOMINIO__') {
      antes.push({ condominio: c.id, codigo: c.codigo, aseo_pendiente_desde: c.aseo_pendiente_desde, multa_meses: c.multa_meses });
    }
  }

  // 1) Un pago por factura
  const pagos: { id: string; reciboRef: string; factura: Factura }[] = [];
  const fechaPagoReal = (pago.pagosAgregados || []).find((pa: any) => pa?.fecha && pa?.metodo !== 'Saldo a Favor')?.fecha;
  const fechaTransaccion = String(fechaPagoReal || sol.fechaOverride || new Date(Date.now() - 4 * 3600 * 1000).toISOString()).slice(0, 10);

  // Si la referencia ingresada ya existía en un pago previo rechazado, anulado o reversado, liberarla
  if (refFinal && !refFinal.startsWith('EFECTIVO-')) {
    try {
      await sb
        .from('pagos_reportados')
        .update({ referencia: `RECH-${refFinal}-${Date.now().toString().slice(-4)}` })
        .eq('referencia', refFinal)
        .in('estado', ['Rechazado', 'Anulado', 'Reversado']);

      const { data: refActiva } = await sb
        .from('pagos_reportados')
        .select('id, referencia, estado, monto, identidad')
        .eq('referencia', refFinal)
        .limit(1);

      if (refActiva && refActiva.length > 0) {
        refFinal = `${refFinal}-${c.codigo || 'CONDO'}`;
      }
    } catch (e) {
      console.warn('Error verificando duplicidad de referencia:', e);
    }
  }

  for (let i = 0; i < cobro.facturas.length; i++) {
    const f = cobro.facturas[i];
    let id = (pago.pagoId && i === 0) ? pago.pagoId : crypto.randomUUID();
    // Si el ID ya existe en la BD por un intento previo, usar uno nuevo
    if (i === 0 && id) {
      const { data: idExistente } = await sb.from('pagos_reportados').select('id').eq('id', id).maybeSingle();
      if (idExistente) {
        id = crypto.randomUUID();
      }
    }
    const reciboRef = `CONDO-${c.codigo}-${Date.now().toString().slice(-6)}${cobro.facturas.length > 1 ? `-${i + 1}` : ''}`;
    const ls = f.lineas.map(k => lineaPor.get(k)!).filter(Boolean);
    const ret = r2(ls.reduce((a, l) => a + l.retencionBs, 0));
    let formasPago = [{ descripcion: pago.metodo, fecha: new Date().toISOString(), forma: formaPagoCodigo(pago.metodo), banco: pago.banco || undefined, bancoDestino: pago.bancoDestino || undefined, referencia: ref || undefined, monto: f.totalBs }];
    if (pago.pagosAgregados && pago.pagosAgregados.length > 0) {
      formasPago = pago.pagosAgregados.map(pa => ({
        descripcion: pa.metodo, fecha: pa.fecha ? new Date(pa.fecha + 'T12:00:00Z').toISOString() : new Date().toISOString(), forma: formaPagoCodigo(pa.metodo), banco: pa.banco || undefined, bancoDestino: pa.bancoDestino || undefined, referencia: pa.referencia || undefined, monto: pa.monto
      }));
    }

    const periodosDesc = ls.flatMap(l => l.periodos);
    const periodoTexto = rango(periodosDesc) || 'Aseo Urbano';
    let fBase = f.baseBs !== undefined ? f.baseBs : r2(ls.reduce((a, l) => a + l.baseBs, 0));
    const fMulta = f.multaBs !== undefined ? f.multaBs : r2(ls.reduce((a, l) => a + l.multaBs + l.multasAparteBs, 0));
    let fIva = f.ivaBs !== undefined ? f.ivaBs : r2(ls.reduce((a, l) => a + l.ivaBs, 0));
    const fRet = f.retencionBs !== undefined ? f.retencionBs : ret;
    let fSubtotal = r2(fBase + fMulta);
    const fTotalBruto = f.totalBrutoBs !== undefined ? f.totalBrutoBs : r2(fSubtotal + fIva);

    if (fMulta === 0 && fIva > 0 && fTotalBruto > 0) {
      const baseRec = r2(fTotalBruto / 1.16);
      const ivaRec = r2(fTotalBruto - baseRec);
      if (Math.abs(ivaRec - r2(baseRec * 0.16)) <= 0.01 && Math.abs(baseRec - fBase) <= 1.0) {
        fBase = baseRec;
        fIva = ivaRec;
        fSubtotal = fBase;
      }
    }

    const conceptos = [];
    if (fSubtotal > 0) {
      conceptos.push({
        descripcion: `Servicio de Aseo Urbano (Período: ${periodoTexto}) · ${c.codigo}`,
        precioUnit: fSubtotal,
        total: fSubtotal,
      });
    } else {
      conceptos.push({
        descripcion: `Servicio de Aseo Urbano (Período: ${periodoTexto}) · ${c.codigo}`,
        precioUnit: f.totalBs,
        total: f.totalBs,
      });
    }

    const reciboCajaItem = {
      reciboNo: refFinal.slice(-7).padStart(7, '0'),
      controlWeb: `WEB-${refFinal.slice(-7).padStart(7, '0')}`,
      fechaEmision: new Date().toISOString().slice(0, 10),
      fechaTransaccion: fechaTransaccion,
      fechaIngresoCaja: new Date().toISOString().slice(0, 10),
      codContribuyente: f.identidad,
      razonSocial: f.nombre,
      domicilioFiscal: sanitizarDireccionFiscal(c.direccion, {
        unidadNumero: ls[0]?.numero || null,
        nombreCondo: c.nombre,
      }),
      rifCi: f.identidad,
      caja: pago.cajero || 'Caja',
      periodo: periodoTexto,
      conceptos,
      subTotal: fSubtotal,
      exento: fIva > 0 ? 0 : fSubtotal,
      baseImponible: fIva > 0 ? fSubtotal : 0,
      iva: fIva,
      retencion: fRet,
      total: fTotalBruto,
      montoNeto: f.totalBs,
      montoCancelado: f.totalBs,
      formaPago: formaPagoCodigo(pago.metodo) === '03' ? 'TRANSFERENCIA' : pago.metodo.toUpperCase(),
      banco: (pago.pagosAgregados && pago.pagosAgregados.length > 1)
        ? pago.pagosAgregados.map((pa: any) => pa.banco || pa.metodo).filter(Boolean).join(' / ')
        : (pago.banco || 'Banco'),
      referencia: (pago.pagosAgregados && pago.pagosAgregados.length > 1)
        ? pago.pagosAgregados.map((pa: any) => pa.referencia).filter(Boolean).join(' / ')
        : refFinal,
      tasaBcv: tasa,
    };

    const detalles = {
      modulo: 'condominios', modo: cobro.modo, cajero: pago.cajero, tasa_bcv: tasa, es_condominio: true, isCondominio: true,
      condominio: { codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, modalidad: c.modalidad, tipo: c.tipo,
        lineas: ls.map(l => ({ inmueble: l.inmueble, numero: l.numero, actividad: l.actividad, residencial: l.residencial, meses: l.meses, periodos: l.periodos, aseoBs: l.baseBs, ivaBs: l.ivaBs, multaBs: r2(l.multaBs + l.multasAparteBs), retencionBs: l.retencionBs, totalBs: l.totalBs, totalBrutoBs: r2(l.baseBs + l.multaBs + l.multasAparteBs + l.ivaBs) })) },
      ...(grupo ? { grupo_pago: { id: grupo, referencia: refFinal, monto_total: cobro.totales.totalBs, partes: cobro.facturas.length, parte: i + 1 } } : {}),
      recibos: [reciboRef],
      montos: { [reciboRef]: f.totalBs },
      montoTotal: f.totalBs,
      monto_factura: fTotalBruto,
      monto_neto_factura: f.totalBs,
      total_seleccionado: fTotalBruto,
      base_imponible: fSubtotal,
      iva_monto: fIva,
      monto_retencion_iva: fRet,
      es_retencion: fRet > 0,
      conRetencion: fRet > 0,
      agente_retencion: fRet > 0,
      contribuyente: f.nombre,
      identidad: f.identidad,
      cod_inmueble: c.codigo,
      codigo_inmueble: c.codigo,
      correo: c.correo || undefined,
      telefono: c.telefono || undefined,
      factura_digital: { emitida: false, pendiente: true, preparada_at: new Date().toISOString() },
      formasPago,
      pagos_agregados: pago.pagosAgregados,
      banco_destino: pago.bancoDestino || (pago.pagosAgregados?.[0]?.bancoDestino) || undefined,
      comprobante_url: (pago.pagosAgregados || []).find((p: any) => p.comprobante_url)?.comprobante_url || undefined,
      comprobante_nombre: (pago.pagosAgregados || []).find((p: any) => p.comprobante_nombre)?.comprobante_nombre || undefined,
      fecha_transaccion: fechaTransaccion,
      fecha_banco: fechaTransaccion,
      fecha_ingreso_caja: new Date().toISOString().slice(0, 10),
      periodos_pagados: periodoTexto,
      recibo_caja: [reciboCajaItem],
      deuda_previa: antes,
      ...(i === 0 && (pago.saldoFavorGenerado || 0) > 0.01 ? { saldo_favor: r2(pago.saldoFavorGenerado || 0), saldo_favor_acreditado: true } : {}),
    };
    const esTransferencia = pago.metodo.toLowerCase().includes('transferencia') || pago.metodo.toLowerCase().includes('pago móvil') || (pago.pagosAgregados && pago.pagosAgregados.some((pa: any) => pa.metodo.toLowerCase().includes('transferencia') || pa.metodo.toLowerCase().includes('pago móvil')));
    const fechaRegistro = new Date();
    const pagosReales = (pago.pagosAgregados || []).filter((pa: any) => pa && pa.metodo !== 'Saldo a Favor');
    const primerReal = pagosReales[0] || (pago.pagosAgregados && pago.pagosAgregados[0]);

    if (primerReal && refFinal.toLowerCase().includes('saldo favor') && primerReal.referencia && !primerReal.referencia.toLowerCase().includes('saldo favor')) {
      refFinal = primerReal.referencia;
    }
    const metodoFila = (primerReal && pago.metodo === 'Saldo a Favor') ? primerReal.metodo : pago.metodo;
    const bancoFila = (primerReal && (!pago.banco || pago.banco === 'Saldo a Favor')) ? (primerReal.banco || primerReal.metodo) : (pago.banco || pago.metodo);

    const pagoAgregadoCoincidente = pagosReales.find((pa: any) => pa.referencia === refFinal) || primerReal;
    const montoReportadoReal = (pagoAgregadoCoincidente && Number(pagoAgregadoCoincidente.monto) > 0)
      ? Number(pagoAgregadoCoincidente.monto)
      : (pago.montoRecibido && cobro.facturas.length === 1 ? pago.montoRecibido : f.totalBs);

    const esMultiPago = cobro.facturas.length > 1 || pagosReales.length > 1;
    const grupoId = grupo || (esMultiPago ? (pago.pagoId || id) : null);

    const fila: any = { 
      id, 
      identidad: f.identidad, 
      monto: montoReportadoReal, 
      banco: bancoFila, 
      referencia: refFinal, 
      tipo: metodoFila, 
      estado: esTransferencia ? 'Por Verificar' : 'Aprobado', 
      modulo: 'condominios', 
      detalles, 
      created_at: fechaRegistro.toISOString() 
    };
    if (grupoId) fila.grupo_pago = grupoId;
    
    let { error } = await sb.from('pagos_reportados').insert(fila);
    if (error && error.message.includes('duplicate')) {
      // Reintentar resolviendo colisión de clave primaria o referencia
      if (error.message.includes('referencia_key') || error.message.includes('referencia')) {
        fila.referencia = `${refFinal}-${Date.now().toString().slice(-4)}`;
      } else {
        id = crypto.randomUUID();
        fila.id = id;
      }
      const reintento = await sb.from('pagos_reportados').insert(fila);
      error = reintento.error;
    }

    if (error) {
      if (i === 0) throw new Error('No se pudo registrar el pago: ' + error.message);
      throw new Error(`Se registró parte del pago pero falló la parte ${i + 1}: ${error.message}. Avise al administrador (pago ${pago.pagoId}).`);
    }

    // Si hay pagos adicionales (múltiples transferencias en la misma factura de condominio), insertarlos en pagos_reportados
    if (cobro.facturas.length === 1 && pagosReales.length > 1) {
      for (let pIdx = 1; pIdx < pagosReales.length; pIdx++) {
        const paExtra = pagosReales[pIdx];
        const extraId = crypto.randomUUID();
        const esTransExtra = paExtra.metodo.toLowerCase().includes('transferencia') || paExtra.metodo.toLowerCase().includes('pago móvil');
        await sb.from('pagos_reportados').insert({
          id: extraId,
          identidad: f.identidad,
          monto: Number(paExtra.monto) || 0,
          banco: paExtra.banco || pago.banco || paExtra.metodo,
          referencia: paExtra.referencia || `EXT-${pIdx}-${Date.now().toString().slice(-4)}`,
          tipo: paExtra.metodo,
          estado: esTransExtra ? 'Por Verificar' : 'Aprobado',
          modulo: 'condominios',
          grupo_pago: grupoId || fila.id,
          created_at: fechaRegistro.toISOString(),
          detalles: {
            ...detalles,
            referencia: paExtra.referencia,
            banco: paExtra.banco,
            tipo: paExtra.metodo,
            montoTotal: Number(paExtra.monto) || 0,
            montos: { [reciboRef]: Number(paExtra.monto) || 0 },
            banco_destino: paExtra.bancoDestino || pago.bancoDestino,
            comprobante_url: paExtra.comprobante_url,
            comprobante_nombre: paExtra.comprobante_nombre,
            pago_principal_id: fila.id,
            es_pago_adicional: true,
            factura_digital: { emitida: false, pendiente: false, es_pago_adicional: true }
          }
        });
      }
    }

    // Si hubo retención de IVA, registrar fila correspondiente de Retención
    if (ret > 0) {
      await sb.from('pagos_reportados').insert({
        id: crypto.randomUUID(),
        identidad: f.identidad,
        monto: ret,
        banco: 'N/A',
        referencia: `RET-${c.codigo || 'CONDO'}-${Date.now().toString().slice(-6)}`,
        tipo: 'Retencion de IVA',
        estado: 'Aprobado',
        modulo: 'condominios',
        grupo_pago: grupo || id,
        created_at: fechaRegistro.toISOString(),
        detalles: {
          ...detalles,
          cajero: pago.cajero,
          es_retencion: true,
          pago_vinculado: id,
          nota: 'Comprobante de retención de IVA 75% deducido en Caja.',
          factura_digital: { emitida: false, pendiente: false, es_retencion: true }
        }
      });
    }

    pagos.push({ id, reciboRef, factura: f });
  }
  const pagoDe = (clave: string) => pagos.find(p => p.factura.lineas.includes(clave))?.id || pago.pagoId;

  // 1.5) Descontar o Acreditar Saldo a Favor
  let montoSaldoFavor = 0;
  if (pago.pagosAgregados && pago.pagosAgregados.length > 0) {
    for (const pa of pago.pagosAgregados) {
      if (pa.metodo === 'Saldo a Favor') montoSaldoFavor += (Number(pa.monto) || 0);
    }
  } else if (pago.metodo === 'Saldo a Favor') {
    montoSaldoFavor = Number(pago.montoRecibido) || 0;
  }

  const idUnidades = Array.from(new Set(cobro.lineas.map(l => porId.get(l.clave)?.identidad).filter(Boolean)));
  const unidadSel = cobro.lineas.length === 1 ? porId.get(cobro.lineas[0].clave) : null;
  const pagadorIdentidad = (cobro.modo === 'CONTRIBUYENTE' && cobro.facturas[0]?.identidad)
    || (unidadSel && unidadSel.identidad)
    || (idUnidades.length === 1 ? idUnidades[0] : null)
    || (sol.identidad ? String(sol.identidad).trim() : null)
    || c.identidad;
  
  const pagadorNombre = (cobro.modo === 'CONTRIBUYENTE' && cobro.facturas[0]?.nombre)
    || (unidadSel && (unidadSel.propietario || unidadSel.nombre))
    || (idUnidades.length === 1 && porId.get(cobro.lineas[0].clave)?.propietario)
    || c.nombre;

  if (montoSaldoFavor > 0 && pagadorIdentidad) {
    const resSF = await descontarSaldoFavor(pagadorIdentidad, montoSaldoFavor);
    if (!resSF.ok) throw new Error('Error al descontar Saldo a Favor: ' + resSF.error);
  }

  if (pago.saldoFavorGenerado && pago.saldoFavorGenerado > 0 && pagadorIdentidad) {
    const resAcreditar = await acreditarSaldoFavor(pagadorIdentidad, r2(pago.saldoFavorGenerado));
    if (!resAcreditar.ok) throw new Error('Error al acreditar Saldo a Favor generado por exceso: ' + resAcreditar.error);
    // Nota de crédito visible en Caja / Conciliación
    await sb.from('documentos').insert([{
      identidad: pagadorIdentidad,
      contribuyente: pagadorNombre,
      tipo: 'Nota de Credito',
      estado: 'Vigente',
      detalles: JSON.stringify({ monto: r2(pago.saldoFavorGenerado).toFixed(2), origen_referencia: `Excedente Caja de Condominios ${c.codigo}. Referencia: ${refFinal}`, fecha_emision: new Date().toISOString(), analista: pago.usuario }),
    }]);
    
    // Dejar rastro en auditoría
    await sb.from('auditoria').insert({
      accion: 'Saldo a Favor Generado Automáticamente', usuario: pago.usuario, modulo: '/admin/condominios/caja',
      detalles: { identidad: pagadorIdentidad, monto: pago.saldoFavorGenerado, referencia: refFinal, _categoria: 'CONDOMINIOS', criticidad: 'MEDIA' },
    });
  }

  // 2) Bajar la deuda en el módulo y sincronizar tabla inmuebles
  for (const l of cobro.lineas) {
    const u = porId.get(l.clave);
    if (u) {
      const upd: any = {};
      if (l.meses > 0 && !sol.soloMultas) upd.aseo_pendiente_desde = M.avanzarPendiente(u.aseo_pendiente_desde || c.aseo_pendiente_desde, l.meses, hoy);
      if (l.multaMesesQueQuedan > 0) upd.multa_meses = (Number(u.multa_meses) || 0) + l.multaMesesQueQuedan;
      else if (sol.soloMultas) {
        const multasDet = l._multasDetalle || [];
        const nPrevias = multasDet.filter((m: any) => m.tipo === 'PREVIA').length;
        const deudaPagada = multasDet.filter((m: any) => m.tipo === 'DEUDA');
        if (nPrevias > 0) {
          upd.multa_meses = Math.max(0, (Number(u.multa_meses) || 0) - nPrevias);
        } else if (l.meses === l.mesesDeuda) {
          upd.multa_meses = 0;
        }
        if (deudaPagada.length > 0) {
          const ultimoPer = deudaPagada[deudaPagada.length - 1].periodo;
          upd.multa_exonerada_hasta = `${ultimoPer}-01`;
        }
      } else if (l.multasAparteBs > 0 && l.meses === l.mesesDeuda) {
        upd.multa_meses = 0;
      }
      if (Object.keys(upd).length) {
        antes.push({ unidad: u.id, inmueble: u.inmueble, aseo_pendiente_desde: u.aseo_pendiente_desde, multa_meses: u.multa_meses, multa_exonerada_hasta: u.multa_exonerada_hasta });
        await sb.from('condominio_unidades').update(upd).eq('id', u.id);
      }
      // Sincronizar en inmuebles para evitar bloqueos de solvencia
      if (u.inmueble && l.meses > 0 && !sol.soloMultas) {
        const { data: curInm } = await sb.from('inmuebles').select('meses_deuda, deuda_mmv').ilike('inmueble', u.inmueble).maybeSingle();
        const nMesesRest = l.meses >= l.mesesDeuda ? 0 : Math.max(0, (parseInt(curInm?.meses_deuda || 0) || 0) - l.meses);
        await sb.from('inmuebles').update({
          meses_deuda: nMesesRest,
          deuda_mmv: nMesesRest === 0 ? 0 : (curInm?.deuda_mmv || 0),
          deuda_congelada_bs: nMesesRest === 0 ? 0 : undefined,
          multa_bs: 0
        }).ilike('inmueble', u.inmueble);
      }
    } else if (l.clave === M.SIN_REGISTRAR || l.clave === '__CONDOMINIO__') {
      const upd: any = {};
      if (l.meses > 0 && !sol.soloMultas) upd.aseo_pendiente_desde = M.avanzarPendiente(c.aseo_pendiente_desde, l.meses, hoy);
      if (l.multasAparteBs > 0) upd.multa_meses = 0;
      if (Object.keys(upd).length) { antes.push({ condominio: c.id, aseo_pendiente_desde: c.aseo_pendiente_desde, multa_meses: c.multa_meses }); await sb.from('condominios').update(upd).eq('id', c.id); }
      // Sincronizar condominio en inmuebles
      if (c.codigo && l.meses > 0 && !sol.soloMultas) {
        const { data: curInm } = await sb.from('inmuebles').select('meses_deuda, deuda_mmv').eq('inmueble', c.codigo).maybeSingle();
        if (curInm) {
          const nMesesRest = Math.max(0, (parseInt(curInm.meses_deuda || 0) || 0) - l.meses);
          await sb.from('inmuebles').update({
            meses_deuda: nMesesRest,
            deuda_mmv: nMesesRest === 0 ? 0 : curInm.deuda_mmv,
            multa_bs: 0
          }).eq('inmueble', c.codigo);
        }
      }
    }
    if (l.multasManualesIds.length) await sb.from('condominio_multas').update({ estado: 'Pagada', pago_id: pagoDe(l.clave) }).in('id', l.multasManualesIds).eq('estado', 'Pendiente');
  }
  // Residencial centralizado pagado completo: el condominio también avanza
  if (cobro.modo === 'CONDOMINIO' && !cobro.estado.porActividad && !cobro.lineas.some(l => l.clave === M.SIN_REGISTRAR) && !sol.soloMultas) {
    const nMeses = cobro.totales.meses;
    if (nMeses > 0 && c.aseo_pendiente_desde) await sb.from('condominios').update({ aseo_pendiente_desde: M.avanzarPendiente(c.aseo_pendiente_desde, nMeses, hoy), multa_meses: 0 }).eq('id', c.id);
    await sb.from('inmuebles').update({ meses_deuda: 0, deuda_mmv: 0, multa_bs: 0 }).or(`inmueble.eq.${c.codigo},condominio_padre_id.eq.${c.codigo},padre_id.eq.${c.codigo}`);
  }

  // 3) Libro del condominio
  const movs = cobro.lineas.map(l => ({
    condominio_id: c.id, unidad_id: porId.has(l.clave) ? l.clave : null, tipo: 'PAGO', periodo: l.periodos[0] ? `${l.periodos[0]}-01` : null,
    concepto: sol.soloMultas
      ? `Pago de multas${l.inmueble ? ` · ${l.inmueble}` : ''}: ${l.meses} mes(es) de multas (${l.periodos.join(', ')})`
      : `${cobro.modo === 'CONDOMINIO' ? 'Pago del condominio' : 'Pago del contribuyente'}${l.inmueble ? ` · ${l.inmueble}` : ''}: ${l.meses ? `${l.meses} mes(es) ${l.periodos.join(', ')}` : ''}${l.multasAparteBs > 0 ? ' + multas' : ''}`,
    monto_bs: -l.totalBs, tasa_bcv: tasa, pago_id: pagoDe(l.clave), usuario: pago.usuario,
  }));
  for (let i = 0; i < movs.length; i += 300) await sb.from('condominio_movimientos').insert(movs.slice(i, i + 300));

  await sb.from('auditoria').insert({
    accion: 'Cobro en Caja de Condominios', usuario: pago.usuario, modulo: '/admin/condominios/caja',
    detalles: { pagos: pagos.map(p => ({ id: p.id, identidad: p.factura.identidad, monto: p.factura.totalBs })), codigo: c.codigo, condominio: c.nombre, modo: cobro.modo,
      monto: cobro.totales.totalBs, metodo: pago.metodo, referencia: ref, lineas: cobro.lineas.length, deuda_previa: antes, _categoria: 'CONDOMINIOS', criticidad: 'ALTA' },
  });
  return { 
    pagoId: pago.pagoId, 
    pagos: pagos.map(p => ({ id: p.id, reciboRef: p.reciboRef, identidad: p.factura.identidad, nombre: p.factura.nombre, monto: p.factura.totalBs })), 
    monto: cobro.totales.totalBs, 
    montoRecibido: pago.montoRecibido || (cobro.totales.totalBs + (pago.saldoFavorGenerado || 0)),
    saldoFavorGenerado: pago.saldoFavorGenerado || 0,
    cobro 
  };
}
