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
    /** Modalidad explícita: 'completo' | 'abono_locales' (para Condominio) o 'individual' | 'multas_separadas' (para Local) */
    modalidad?: 'completo' | 'abono_locales' | 'individual' | 'multas_separadas';
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
    /** Si es true, omite la multa correspondiente al período 2026-09 (Septiembre 2026) */
    omitirMultaSeptiembre?: boolean;
    tasaOverride?: number;
    fechaOverride?: string;
}

export interface LineaCobro {
    clave: string;
    inmueble: string | null;
    padreId?: string | null;
    padreInmueble?: string | null;
    numero: string | null;
    propietario: string | null;
    identidad: string | null;
    actividad: string | null;
    residencial: boolean;
    agenteRetencion?: boolean;
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
    const rawTasa = sol.tasaOverride && sol.tasaOverride > 0 ? sol.tasaOverride : await tasaVigente();
    const tasa = r2(Number(rawTasa) || 0);
    if (!(tasa > 0)) throw new Error('No hay tasa BCV vigente configurada.');
    const fecha = sol.fechaOverride
        ? new Date(sol.fechaOverride.includes('T') ? sol.fechaOverride : `${sol.fechaOverride}T12:00:00-04:00`)
        : new Date();
    const estado = calcularEstado(datos.condo, datos.unidades, tasa, fecha, datos.multas, !!sol.omitirMultaSeptiembre);
    const porAct = estado.porActividad;
    const avisos: string[] = [];
    const modo: ModoCobro = (sol.soloMultas || sol.modalidad === 'multas_separadas' || sol.modalidad === 'individual')
        ? 'CONTRIBUYENTE'
        : ((sol.modalidad === 'completo' || sol.modalidad === 'abono_locales')
            ? 'CONDOMINIO'
            : (sol.modo ? sol.modo : (sol.identidad ? 'CONTRIBUYENTE' : 'CONDOMINIO')));

    const conDeuda = estado.renglones.filter(r => r.totalBs > 0.01);
    const pedidas = new Set((sol.claves || []).filter(Boolean));
    const coincidePedida = (r: RenglonEstado) =>
        pedidas.has(r.clave) ||
        Boolean(r.padreId && pedidas.has(r.padreId)) ||
        Boolean(r.inmueble && pedidas.has(r.inmueble)) ||
        Boolean(r.padreInmueble && pedidas.has(r.padreInmueble));
    let elegidas: RenglonEstado[];
    if (modo === 'CONDOMINIO') {
        if (pedidas.size > 0) {
            elegidas = conDeuda.filter(coincidePedida);
            if (elegidas.length < conDeuda.length) {
                avisos.push(`Abono por locales al condominio: Cobrando ${elegidas.length} de ${conDeuda.length} unidades seleccionadas a nombre del condominio.`);
            }
        } else {
            elegidas = conDeuda;
        }
    } else {
        const ced = sol.identidad ? n(sol.identidad) : '';
        elegidas = conDeuda.filter(r => coincidePedida(r) || (ced && n(r.identidad) === ced));
        if (!porAct && elegidas.some(r => r.deuda.meses > 0)) avisos.push('Residencial centralizado: al pagar una unidad por separado, se descuenta solo esa unidad.');
    }

    const lineas: LineaCobro[] = elegidas.map(r => {
        if (sol.soloMultas) {
            // Lista estructurada de todas las multas disponibles para esta unidad
            const tMulta = r.residencial ? M.TASA_MULTA_RES : M.TASA_MULTA_COM;
            const mesesMultaEnAseo = (r.deuda?.porMes || []).filter(m => m.multaBs > 0).length;
            const mesesRemanentes = Math.max(0, (r.multaMeses || 0) - mesesMultaEnAseo);
            const cuotaMultaBs = (mesesRemanentes > 0 && r.multaExtraBs > 0)
                ? r2(r.multaExtraBs / mesesRemanentes)
                : r2(r.mensualBs * tMulta);

            const itemsMulta: { tipo: 'PREVIA' | 'DEUDA' | 'MANUAL'; periodo: string; montoBs: number; id?: string }[] = [];

            // 1) Multas acumuladas de meses anteriores cuyo aseo ya fue pagado (remanentes no cubiertos por meses de deuda de aseo)
            if (mesesRemanentes > 0) {
                const prevPeriodos = M.periodosMultasPrevias(r.pendienteDesde, mesesRemanentes, fecha);
                for (const p of prevPeriodos) {
                    if (sol.omitirMultaSeptiembre && p === '2026-09') continue;
                    itemsMulta.push({ tipo: 'PREVIA', periodo: p, montoBs: cuotaMultaBs });
                }
            }

            // 2) Multas de mora de los meses de deuda actuales (todos los meses excepto el último)
            for (const m of r.deuda.porMes) {
                if (m.multaBs > 0) {
                    const per = r.periodos[m.n - 1] || `Mes ${m.n}`;
                    if (sol.omitirMultaSeptiembre && per === '2026-09') continue;
                    itemsMulta.push({ tipo: 'DEUDA', periodo: per, montoBs: m.multaBs });
                }
            }

            // 3) Multas manuales
            for (const man of r.multasManuales) {
                itemsMulta.push({ tipo: 'MANUAL', periodo: man.periodo || 'Multa Fija', montoBs: man.montoBs, id: man.id });
            }

            // ¿Cuántas multas se van a pagar?
            const mEsp = sol.mesesPorUnidad?.[r.clave]
                ?? (r.padreId ? sol.mesesPorUnidad?.[r.padreId] : undefined)
                ?? (r.padreInmueble ? sol.mesesPorUnidad?.[r.padreInmueble] : undefined);
            const nMultasMax = itemsMulta.length;
            const nMultas = (typeof mEsp === 'number' && mEsp > 0)
                ? Math.min(nMultasMax, Math.floor(mEsp))
                : (sol.meses && sol.meses > 0 ? Math.min(nMultasMax, Math.floor(sol.meses)) : nMultasMax);
            const multasAPagar = itemsMulta.slice(0, nMultas);
            const multasBs = r2(multasAPagar.reduce((sum, item) => sum + item.montoBs, 0));
            const multasManualesIds = multasAPagar.filter(item => item.id).map(item => item.id!);
            const periodosMultas = multasAPagar.map(item => item.periodo);

            return {
                clave: r.clave, inmueble: r.inmueble, padreId: r.padreId, padreInmueble: r.padreInmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad, actividad: r.actividad, residencial: r.residencial, agenteRetencion: r.agenteRetencion,
                meses: nMultas, mesesDeuda: itemsMulta.length, periodos: periodosMultas,
                baseBs: 0, multaBs: 0, multasAparteBs: multasBs, multasManualesIds,
                ivaBs: 0, retencionBs: 0, totalBs: multasBs, multaMesesQueQuedan: 0,
                _multasDetalle: multasAPagar,
            };
        }

        const mEsp = sol.mesesPorUnidad?.[r.clave]
            ?? (r.padreId ? sol.mesesPorUnidad?.[r.padreId] : undefined)
            ?? (r.padreInmueble ? sol.mesesPorUnidad?.[r.padreInmueble] : undefined);
        const nMesesMax = r.deuda.meses;
        const nMeses = (typeof mEsp === 'number' && mEsp > 0)
            ? Math.min(nMesesMax, Math.floor(mEsp))
            : (sol.meses && sol.meses > 0 ? Math.min(nMesesMax, Math.floor(sol.meses)) : nMesesMax);
        const meses = r.deuda.porMes.slice(0, nMeses);
        const s = (k: 'baseBs' | 'multaBs' | 'ivaBs' | 'retencionBs') => r2(meses.reduce((a, m) => a + m[k], 0));
        // ¿Las multas van en este cobro? Incluidas por defecto salvo que se desmarque incluirMultas
        const permitirMultas = sol.soloMultas || sol.incluirMultas !== false;
        const multaMora = !permitirMultas ? 0 : s('multaBs');
        const multaMesesQueQuedan = !permitirMultas ? r.multaMeses : 0;
        const incluirAparte = permitirMultas;
        const aparte = incluirAparte ? r2((nMeses === r.deuda.meses ? r.multaExtraBs : 0) + r.multasManualesBs) : 0;
        const base = s('baseBs'), iva = s('ivaBs');
        const ret = modo === 'CONDOMINIO'
            ? (datos.condo.agente_retencion ? (r.agenteRetencion ? s('retencionBs') : r2(iva * 0.75)) : 0)
            : s('retencionBs');
        return {
            clave: r.clave, inmueble: r.inmueble, padreId: r.padreId, padreInmueble: r.padreInmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad, actividad: r.actividad, residencial: r.residencial,
            agenteRetencion: modo === 'CONDOMINIO' ? Boolean(datos.condo.agente_retencion) : r.agenteRetencion,
            meses: nMeses, mesesDeuda: r.deuda.meses, periodos: r.periodos.slice(0, nMeses),
            baseBs: base, multaBs: multaMora, multasAparteBs: aparte, multasManualesIds: incluirAparte ? r.multasManuales.map(m => m.id) : [],
            ivaBs: iva, retencionBs: ret, totalBs: r2(base + multaMora + iva - ret + aparte), multaMesesQueQuedan,
        };
    }).filter(l => l.totalBs > 0.01);

    if (modo === 'CONDOMINIO' && porAct && !sol.incluirMultas && conDeuda.some(r => r.deuda.multaBs + r.multaExtraBs + r.multasManualesBs > 0))
        avisos.push('Las multas están desactivadas por defecto en el pago del condominio; marque "Cobrar Aseo + Multas" si el condominio desea pagarlas.');

    // Facturas: CONDOMINIO → una al condominio. CONTRIBUYENTE → una por dueño.
    const facturas: Factura[] = [];
    const t = (k: keyof LineaCobro) => r2(lineas.reduce((a, l) => a + (Number(l[k]) || 0), 0));
    let totBaseBs = t('baseBs');
    let totMultaBs = r2(t('multaBs') + t('multasAparteBs'));
    let totIvaBs = t('ivaBs');
    let totRetBs = t('retencionBs');
    let totTotalBs = t('totalBs');

    if (modo === 'CONDOMINIO') {
        if (porAct && tasa > 0 && lineas.length > 1) {
            const conv = (bs: number) => r2(bs / tasa);
            const grupos = new Map<string, LineaCobro[]>();
            for (const l of lineas) {
                const gKey = l.padreId || l.clave;
                const arr = grupos.get(gKey) || [];
                arr.push(l);
                grupos.set(gKey, arr);
            }
            let sumBaseEur = 0;
            let sumMultaEur = 0;
            let sumIvaEur = 0;
            for (const items of grupos.values()) {
                const cBase = r2(items.reduce((acc, h) => r2(acc + conv(Number(h.baseBs) || 0)), 0));
                const cMulta = r2(items.reduce((acc, h) => r2(acc + conv((Number(h.multaBs) || 0) + (Number(h.multasAparteBs) || 0))), 0));
                const cIva = items.length > 1 && !items[0].residencial
                    ? r2(cBase * 0.16)
                    : r2(items.reduce((acc, h) => r2(acc + conv(Number(h.ivaBs) || 0)), 0));
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

        const totalBs = totTotalBs;
        let baseBs = totBaseBs;
        const multaBs = totMultaBs;
        let ivaBs = totIvaBs;
        let retencionBs = totRetBs;
        let totalBrutoBs = r2(baseBs + multaBs + ivaBs);
        // Asegurar cuadre exacto SENIAT/TFHKA cuando es factura global de condominio comercial con retención 75%
        if (!porAct && multaBs === 0 && ivaBs > 0 && retencionBs > 0) {
            const baseIdeal = Math.round((totalBs / 1.04) * 100);
            for (let delta = 0; delta <= 50; delta++) {
                for (const sign of delta === 0 ? [1] : [-1, 1]) {
                    const bTry = (baseIdeal + sign * delta) / 100;
                    const iTry = r2(bTry * 0.16);
                    const rTry = r2(iTry * 0.75);
                    const totTry = r2(bTry + iTry);
                    if (r2(totTry - rTry) === totalBs) {
                        baseBs = bTry;
                        ivaBs = iTry;
                        retencionBs = rTry;
                        totalBrutoBs = totTry;
                        delta = 999;
                        break;
                    }
                }
            }
        }
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

    return {
        condo: datos.condo, estado, modo, puedePagarCondominio: true, lineas, facturas, avisos, _datos: datos,
        totales: { baseBs: totBaseBs, multaBs: totMultaBs, ivaBs: totIvaBs, retencionBs: totRetBs, totalBs: totTotalBs, meses: Math.max(0, ...lineas.map(l => l.meses)) },
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

    // Ignorar diferencias de redondeo menores a Bs. 1,00 para no generar notas de crédito de céntimos
    // En condominios multi-unidad (modo CONDOMINIO), absorber también pequeñas diferencias de redondeo Euro/Bs (<= 2.50 Bs)
    const tolSinNota = cobro.modo === 'CONDOMINIO' && cobro.lineas.length > 10 ? 2.50 : 1.00;
    if (pago.saldoFavorGenerado && pago.saldoFavorGenerado < tolSinNota) {
        pago.saldoFavorGenerado = 0;
    }
    // Si no se definió saldo a favor generado pero lo recibido supera la deuda por encima de la tolerancia, asignar el excedente
    if (!pago.saldoFavorGenerado && montoRecibidoTotal >= totalDeudaCobro + tolSinNota) {
        pago.saldoFavorGenerado = r2(montoRecibidoTotal - totalDeudaCobro);
    }

    const montoAplicadoADeuda = r2(montoRecibidoTotal - (pago.saldoFavorGenerado || 0));

    // Si el monto destinado a cancelar la deuda es menor al total requerido (tolerancia de redondeo)
    const tolFaltante = cobro.modo === 'CONDOMINIO' && cobro.lineas.length > 10 ? 2.50 : 0.50;
    if (montoAplicadoADeuda < totalDeudaCobro - tolFaltante) {
        throw new Error(`El monto cambió (ahora Bs ${totalDeudaCobro.toFixed(2)}). Vuelva a calcular antes de cobrar.`);
    }
    // Si en pago global de condominio la transferencia tiene diferencia de céntimos dentro de la tolerancia sin saldo a favor, alinear la factura al monto exacto transferido
    if (cobro.modo === 'CONDOMINIO' && cobro.facturas.length === 1 && !pago.saldoFavorGenerado && montoRecibidoTotal > 0 && Math.abs(montoRecibidoTotal - totalDeudaCobro) > 0 && Math.abs(montoRecibidoTotal - totalDeudaCobro) < tolSinNota) {
        const f0 = cobro.facturas[0];
        f0.totalBs = montoRecibidoTotal;
        cobro.totales.totalBs = montoRecibidoTotal;
        if ((f0.multaBs || 0) === 0 && (f0.ivaBs || 0) > 0 && (f0.retencionBs || 0) > 0) {
            const baseIdeal = Math.round((montoRecibidoTotal / 1.04) * 100);
            for (let delta = 0; delta <= 50; delta++) {
                for (const sign of delta === 0 ? [1] : [-1, 1]) {
                    const bTry = (baseIdeal + sign * delta) / 100;
                    const iTry = r2(bTry * 0.16);
                    const rTry = r2(iTry * 0.75);
                    const totTry = r2(bTry + iTry);
                    if (r2(totTry - rTry) === montoRecibidoTotal) {
                        f0.baseBs = bTry;
                        f0.ivaBs = iTry;
                        f0.retencionBs = rTry;
                        f0.totalBrutoBs = totTry;
                        delta = 999;
                        break;
                    }
                }
            }
        }
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

    // Validación estricta anti-duplicidad: bloquear si algún período de aseo a cobrar ya está facturado/pagado para esa unidad
    if (!sol.soloMultas) {
        const { data: movsExistentes } = await sb
            .from('condominio_movimientos')
            .select('unidad_id, periodo, concepto, pago_id')
            .eq('condominio_id', c.id)
            .eq('tipo', 'PAGO');
        if (movsExistentes && movsExistentes.length > 0) {
            const pagoIdsCheck = [...new Set(movsExistentes.map((m: any) => m.pago_id).filter(Boolean))];
            const pagosRechazadosSet = new Set<string>();
            if (pagoIdsCheck.length > 0) {
                for (let i = 0; i < pagoIdsCheck.length; i += 200) {
                    const { data: pCheck } = await sb
                        .from('pagos_reportados')
                        .select('id, estado, referencia, detalles')
                        .in('id', pagoIdsCheck.slice(i, i + 200));
                    (pCheck || []).forEach((pr: any) => {
                        const est = String(pr.estado || '');
                        const det = pr.detalles || {};
                        if (
                            ['Rechazado', 'Anulado', 'Reversado'].includes(est) ||
                            String(pr.referencia || '').startsWith('RECH-') ||
                            det?.factura_digital?.anulada === true ||
                            det?.factura_digital?.rechazada === true ||
                            det?.nota_credito_digital?.emitida === true
                        ) {
                            pagosRechazadosSet.add(pr.id);
                        }
                    });
                }
            }
            for (const l of cobro.lineas) {
                if (!l.periodos || l.periodos.length === 0 || !porId.has(l.clave)) continue;
                const u = porId.get(l.clave);
                const codU = String(u?.inmueble || l.inmueble || '').toUpperCase();
                for (const m of movsExistentes) {
                    if (m.pago_id && pagosRechazadosSet.has(m.pago_id)) continue;
                    const conceptUpper = String(m.concepto || '').toUpperCase();
                    if (conceptUpper.includes('MULTA') && !conceptUpper.includes('ASEO')) continue;
                    const esMismaUnidad = m.unidad_id === l.clave || (codU && conceptUpper.includes(codU));
                    if (!esMismaUnidad) continue;
                    const persMov = new Set<string>();
                    if (m.periodo) persMov.add(String(m.periodo).slice(0, 7));
                    const matches = conceptUpper.match(/202\d-(?:0[1-9]|1[0-2])/g) || [];
                    matches.forEach(pm => persMov.add(pm));
                    for (const perCobrar of l.periodos) {
                        if (persMov.has(perCobrar)) {
                            throw new Error(`⛔ BLOQUEADO: La unidad ${codU || u?.numero || l.clave} ya tiene facturado/pagado el período ${fmtPeriodo(perCobrar)} en el sistema. Recargue el estado de cuenta.`);
                        }
                    }
                }
            }
        }
    }

    // Foto de deuda previa para permitir reversión / rechazo seguro (incluyendo estado real en tabla inmuebles y padres N/A)
    const codigosInmFoto = Array.from(
        new Set(
            [
                c.codigo,
                ...cobro.lineas.flatMap(l => {
                    const u = porId.get(l.clave);
                    const p = u?.padre_unidad_id ? porId.get(u.padre_unidad_id) : null;
                    return [u?.inmueble, u?.padre_inmueble, p?.inmueble];
                }).filter(Boolean),
            ].filter(Boolean)
        )
    );
    const inmsFotoMap = new Map<string, any>();
    if (codigosInmFoto.length > 0) {
        const { data: inmsRows } = await sb
            .from('inmuebles')
            .select('id, inmueble, direccion, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs')
            .in('inmueble', codigosInmFoto);
        (inmsRows || []).forEach((ir: any) => {
            if (ir.inmueble) inmsFotoMap.set(String(ir.inmueble).toUpperCase(), ir);
        });
    }

    const antes: any[] = [];
    const padresFotoAgregados = new Set<string>();
    for (const l of cobro.lineas) {
        const u = porId.get(l.clave);
        if (u) {
            const inmSnap = u.inmueble ? inmsFotoMap.get(String(u.inmueble).toUpperCase()) : null;
            antes.push({
                unidad: u.id,
                inmueble: u.inmueble,
                aseo_pendiente_desde: u.aseo_pendiente_desde,
                multa_meses: u.multa_meses,
                multa_exonerada_hasta: u.multa_exonerada_hasta,
                ...(inmSnap
                    ? {
                        id: inmSnap.id,
                        meses_deuda: inmSnap.meses_deuda ?? 0,
                        deuda_mmv: inmSnap.deuda_mmv ?? 0,
                        multa_bs: inmSnap.multa_bs ?? 0,
                        deuda_congelada_bs: inmSnap.deuda_congelada_bs ?? 0,
                        saldo_favor_bs: inmSnap.saldo_favor_bs ?? 0,
                    }
                    : {}),
            });
            const p = u.padre_unidad_id ? porId.get(u.padre_unidad_id) : null;
            if (p && !padresFotoAgregados.has(p.id)) {
                padresFotoAgregados.add(p.id);
                const pSnap = p.inmueble ? inmsFotoMap.get(String(p.inmueble).toUpperCase()) : null;
                antes.push({
                    unidad: p.id,
                    inmueble: p.inmueble,
                    aseo_pendiente_desde: p.aseo_pendiente_desde,
                    multa_meses: p.multa_meses,
                    multa_exonerada_hasta: p.multa_exonerada_hasta,
                    ...(pSnap
                        ? {
                            id: pSnap.id,
                            meses_deuda: pSnap.meses_deuda ?? 0,
                            deuda_mmv: pSnap.deuda_mmv ?? 0,
                            multa_bs: pSnap.multa_bs ?? 0,
                            deuda_congelada_bs: pSnap.deuda_congelada_bs ?? 0,
                            saldo_favor_bs: pSnap.saldo_favor_bs ?? 0,
                        }
                        : {}),
                });
            }
        } else if (l.clave === M.SIN_REGISTRAR || l.clave === '__CONDOMINIO__') {
            const inmSnap = c.codigo ? inmsFotoMap.get(String(c.codigo).toUpperCase()) : null;
            antes.push({
                condominio: c.id,
                codigo: c.codigo,
                aseo_pendiente_desde: c.aseo_pendiente_desde,
                multa_meses: c.multa_meses,
                ...(inmSnap
                    ? {
                        id: inmSnap.id,
                        inmueble: inmSnap.inmueble,
                        meses_deuda: inmSnap.meses_deuda ?? 0,
                        deuda_mmv: inmSnap.deuda_mmv ?? 0,
                        multa_bs: inmSnap.multa_bs ?? 0,
                        deuda_congelada_bs: inmSnap.deuda_congelada_bs ?? 0,
                        saldo_favor_bs: inmSnap.saldo_favor_bs ?? 0,
                    }
                    : {}),
            });
        }
    }

    // 1) Un pago por factura
    const pagos: { id: string; reciboRef: string; factura: Factura }[] = [];
    const hoyStr = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
    const paRealConFecha = (pago.pagosAgregados || []).find((pa: any) => (pa?.fechaTransaccion || pa?.fecha) && pa?.metodo !== 'Saldo a Favor');
    const fechaPagoReal = paRealConFecha?.fechaTransaccion || paRealConFecha?.fecha;
    const fechaTransaccion = String(
        (sol.fechaOverride && sol.fechaOverride !== hoyStr && (!fechaPagoReal || fechaPagoReal === hoyStr))
            ? sol.fechaOverride
            : (fechaPagoReal || sol.fechaOverride || hoyStr)
    ).slice(0, 10);
    const esTransferencia = (pago.metodo || '').toLowerCase().includes('transferencia') || (pago.metodo || '').toLowerCase().includes('pago móvil') || Boolean(pago.pagosAgregados && pago.pagosAgregados.some((pa: any) => (pa.metodo || '').toLowerCase().includes('transferencia') || (pa.metodo || '').toLowerCase().includes('pago móvil')));

    // Si la referencia ingresada ya existía en un pago previo rechazado, anulado o reversado, liberarla
    if (refFinal && !refFinal.startsWith('EFECTIVO-')) {
        await sb
            .from('pagos_reportados')
            .update({ referencia: `RECH-${refFinal}-${Date.now().toString().slice(-4)}` })
            .eq('referencia', refFinal)
            .in('estado', ['Rechazado', 'Anulado', 'Reversado']);

        if (!esMetodoSinRefUnica) {
            const { data: refActiva } = await sb
                .from('pagos_reportados')
                .select('id, referencia, estado, monto, identidad')
                .eq('referencia', refFinal)
                .not('estado', 'in', '(Rechazado,Anulado,Reversado)')
                .limit(1);

            if (refActiva && refActiva.length > 0) {
                throw new Error(`El número de referencia ${refFinal} ya fue registrado previamente (${refActiva[0].identidad}, Bs ${refActiva[0].monto}).`);
            }
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
        const ls = f.lineas.map(k => lineaPor.get(k)!).filter(Boolean);
        const uPrim = ls[0] ? porId.get(ls[0].clave) : null;
        const pPrim = uPrim?.padre_unidad_id ? porId.get(uPrim.padre_unidad_id) : null;
        const codPrincipalUnidad = (pPrim && (pPrim.es_grupo || String(pPrim.actividad || '').trim().toUpperCase() === 'N/A'))
            ? (pPrim.inmueble || uPrim?.padre_inmueble || ls[0]?.inmueble)
            : (uPrim?.padre_inmueble || ls[0]?.inmueble);
        const esIndividualUnidad = cobro.modo === 'CONTRIBUYENTE' || (cobro.modo !== 'CONDOMINIO' && (c.modalidad === 'INDIVIDUAL' || (ls.length > 0 && ls[0]?.inmueble && ls[0]?.inmueble !== c.codigo)));
        const codInmuebleFila = esIndividualUnidad ? (codPrincipalUnidad || c.codigo) : c.codigo;
        const reciboRef = `CONDO-${codInmuebleFila}-${Date.now().toString().slice(-6)}${cobro.facturas.length > 1 ? `-${i + 1}` : ''}`;
        const ret = r2(ls.reduce((a, l) => a + l.retencionBs, 0));
        let formasPago = [{ descripcion: pago.metodo, fecha: new Date((fechaTransaccion || hoyStr) + 'T12:00:00Z').toISOString(), forma: formaPagoCodigo(pago.metodo), banco: pago.banco || undefined, bancoDestino: pago.bancoDestino || undefined, referencia: ref || undefined, monto: f.totalBs }];
        if (pago.pagosAgregados && pago.pagosAgregados.length > 0) {
            formasPago = pago.pagosAgregados.map(pa => {
                const fPa = pa.fechaTransaccion || pa.fecha;
                const fEf = (sol.fechaOverride && sol.fechaOverride !== hoyStr && (!fPa || fPa === hoyStr))
                    ? sol.fechaOverride
                    : (fPa || fechaTransaccion || hoyStr);
                return {
                    descripcion: pa.metodo, fecha: new Date(String(fEf).slice(0, 10) + 'T12:00:00Z').toISOString(), forma: formaPagoCodigo(pa.metodo), banco: pa.banco || undefined, bancoDestino: pa.bancoDestino || undefined, referencia: pa.referencia || undefined, monto: pa.monto
                };
            });
        }

        const periodosDesc = ls.flatMap(l => l.periodos);
        const periodoTexto = rango(periodosDesc) || 'Aseo Urbano';
        let fBase = f.baseBs !== undefined ? f.baseBs : r2(ls.reduce((a, l) => a + l.baseBs, 0));
        const fMulta = f.multaBs !== undefined ? f.multaBs : r2(ls.reduce((a, l) => a + l.multaBs + l.multasAparteBs, 0));
        let fIva = f.ivaBs !== undefined ? f.ivaBs : r2(ls.reduce((a, l) => a + l.ivaBs, 0));
        const fRet = f.retencionBs !== undefined ? f.retencionBs : ret;
        let fSubtotal = r2(fBase + fMulta);
        const fTotalBruto = f.totalBrutoBs !== undefined ? f.totalBrutoBs : r2(fSubtotal + fIva);

        if (fMulta === 0 && fIva > 0 && fTotalBruto > 0 && fRet === 0) {
            const baseRec = r2(fTotalBruto / 1.16);
            const ivaRec = r2(fTotalBruto - baseRec);
            if (Math.abs(ivaRec - r2(baseRec * 0.16)) <= 0.01 && Math.abs(baseRec - fBase) <= 1.0) {
                fBase = baseRec;
                fIva = ivaRec;
                fSubtotal = fBase;
            }
        }

        const conceptos = [];
        if (fBase > 0) {
            conceptos.push({
                descripcion: `Servicio de Aseo Urbano (Período: ${periodoTexto}) · ${codInmuebleFila}`,
                precioUnit: fBase,
                total: fBase,
            });
        }
        if (fMulta > 0) {
            conceptos.push({
                descripcion: `Multa por Mora - Aseo Urbano (Período: ${periodoTexto}) · ${codInmuebleFila}`,
                precioUnit: fMulta,
                total: fMulta,
            });
        }
        if (conceptos.length === 0) {
            conceptos.push({
                descripcion: `Servicio de Aseo Urbano (Período: ${periodoTexto}) · ${codInmuebleFila}`,
                precioUnit: f.totalBs,
                total: f.totalBs,
            });
        }

        const fechaRegistro = new Date();
        const pagosReales = (pago.pagosAgregados || []).filter((pa: any) => pa && pa.metodo !== 'Saldo a Favor');
        const pagosSF = (pago.pagosAgregados || []).filter((pa: any) => pa && pa.metodo === 'Saldo a Favor');
        const montoSFUsado = r2(pagosSF.reduce((acc: number, pa: any) => acc + (Number(pa.monto) || 0), 0));
        const primerReal = pagosReales[0] || (pago.pagosAgregados && pago.pagosAgregados[0]);

        if (primerReal && refFinal.toLowerCase().includes('saldo favor') && primerReal.referencia && !primerReal.referencia.toLowerCase().includes('saldo favor')) {
            refFinal = primerReal.referencia;
        }
        const metodoFila = (primerReal && pago.metodo === 'Saldo a Favor') ? primerReal.metodo : pago.metodo;
        const bancoFila = (primerReal && (!pago.banco || pago.banco === 'Saldo a Favor')) ? (primerReal.banco || primerReal.metodo) : (pago.banco || pago.metodo);

        const pagoAgregadoCoincidente = pagosReales.find((pa: any) => pa.referencia === refFinal) || primerReal;
        const excedenteFila = (i === 0 && (pago.saldoFavorGenerado || 0) >= 5.00) ? r2(pago.saldoFavorGenerado || 0) : 0;
        const montoReportadoReal = cobro.facturas.length > 1
            ? r2(f.totalBs + excedenteFila)
            : ((pagoAgregadoCoincidente && Number(pagoAgregadoCoincidente.monto) > 0)
                ? r2(Number(pagoAgregadoCoincidente.monto))
                : r2(pago.montoRecibido ? pago.montoRecibido : f.totalBs));

        const esMultiPago = cobro.facturas.length > 1 || pagosReales.length > 1;
        const grupoId = grupo || (esMultiPago ? (pago.pagoId || id) : null);

        const dirBaseRecibo = esIndividualUnidad
            ? (inmsFotoMap.get(String(codInmuebleFila || '').toUpperCase())?.direccion || uPrim?.direccion || pPrim?.direccion || c.direccion)
            : c.direccion;
        const domicilioFiscalRecibo = sanitizarDireccionFiscal(dirBaseRecibo, {
            unidadNumero: (cobro.modo === 'CONDOMINIO' && !sol.soloMultas) ? null : (ls[0]?.numero || null),
            nombreCondo: c.nombre,
            parentDir: c.direccion,
        });

        const reciboCajaItem = {
            reciboNo: refFinal.slice(-7).padStart(7, '0'),
            controlWeb: `WEB-${refFinal.slice(-7).padStart(7, '0')}`,
            fechaEmision: fechaTransaccion || new Date().toISOString().slice(0, 10),
            fechaTransaccion: fechaTransaccion,
            fechaIngresoCaja: new Date().toISOString().slice(0, 10),
            codContribuyente: f.identidad,
            razonSocial: f.nombre,
            domicilioFiscal: domicilioFiscalRecibo,
            rifCi: f.identidad,
            caja: pago.cajero || 'Caja',
            periodo: periodoTexto,
            conceptos,
            subTotal: fSubtotal,
            exento: fIva > 0 ? fMulta : fSubtotal,
            baseImponible: fIva > 0 ? fBase : 0,
            iva: fIva,
            retencion: fRet,
            total: fTotalBruto,
            montoNeto: f.totalBs,
            montoCancelado: f.totalBs,
            formaPago: formaPagoCodigo(metodoFila) === '03' ? 'TRANSFERENCIA' : metodoFila.toUpperCase(),
            banco: (pago.pagosAgregados && pago.pagosAgregados.length > 1)
                ? pago.pagosAgregados.map((pa: any) => pa.banco || pa.metodo).filter(Boolean).join(' / ')
                : (bancoFila || 'Banco'),
            referencia: (pago.pagosAgregados && pago.pagosAgregados.length > 1)
                ? pago.pagosAgregados.map((pa: any) => pa.referencia).filter(Boolean).join(' / ')
                : refFinal,
            tasaBcv: tasa,
            historialPagos: (pago.pagosAgregados && pago.pagosAgregados.length > 1)
                ? pago.pagosAgregados.map((pa: any, pidx: number) => ({
                    fecha: pa.fecha || fechaTransaccion,
                    formaPago: pa.metodo || 'Transferencia',
                    banco: pa.banco || 'Banco',
                    referencia: pa.referencia || `Ref-${pidx + 1}`,
                    monto: Number(pa.monto) || 0,
                }))
                : undefined,
        };

        const modalidadCobroActiva = sol.modalidad || (sol.soloMultas ? 'multas_separadas' : (cobro.modo === 'CONDOMINIO' ? 'completo' : 'individual'));
        const modoEfectivo: ModoCobro = (sol.soloMultas || modalidadCobroActiva === 'individual' || modalidadCobroActiva === 'multas_separadas')
            ? 'CONTRIBUYENTE'
            : 'CONDOMINIO';
        const detalles = {
            modulo: 'condominios', modo: modoEfectivo, modalidad_cobro: modalidadCobroActiva, cajero: pago.cajero, tasa_bcv: tasa, es_condominio: true, isCondominio: true,
            soloMultas: !!sol.soloMultas,
            solo_multas: !!sol.soloMultas,
            condominio: {
                codigo: c.codigo, nombre: c.nombre, identidad: c.identidad, modalidad: c.modalidad, modalidad_cobro: modalidadCobroActiva, tipo: c.tipo,
                solo_multas: !!sol.soloMultas,
                lineas: ls.map(l => ({ unidad_id: porId.get(l.clave)?.id || undefined, inmueble: l.inmueble, numero: l.numero, propietario: l.propietario, identidad: l.identidad, actividad: l.actividad, residencial: l.residencial, meses: l.meses, periodos: l.periodos, aseoBs: l.baseBs, ivaBs: l.ivaBs, multaBs: r2(l.multaBs + l.multasAparteBs), retencionBs: l.retencionBs, totalBs: l.totalBs, totalBrutoBs: r2(l.baseBs + l.multaBs + l.multasAparteBs + l.ivaBs), _multasDetalle: l._multasDetalle || undefined }))
            },
            ...(grupo ? { grupo_pago: { id: grupo, referencia: refFinal, monto_total: cobro.totales.totalBs, partes: cobro.facturas.length, parte: i + 1 } } : {}),
            solo_aseo: !sol.incluirMultas && !sol.soloMultas,
            sin_multas: !sol.incluirMultas && !sol.soloMultas,
            incluir_multas: !!sol.incluirMultas,
            omitir_multa_septiembre: !!sol.omitirMultaSeptiembre,
            recibos: [reciboRef],
            montos: { [reciboRef]: fTotalBruto },
            montoTotal: fTotalBruto,
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
            contribuyente_nombre: f.nombre,
            identidad: f.identidad,
            cod_inmueble: codInmuebleFila,
            codigo_inmueble: codInmuebleFila,
            correo: c.correo || undefined,
            telefono: c.telefono || undefined,
            ...(!esTransferencia ? {
                factura_digital: { emitida: false, pendiente: true, preparada_at: new Date().toISOString() },
            } : {}),
            formasPago,
            pagos_agregados: pago.pagosAgregados,
            ...(montoSFUsado > 0 ? {
                saldo_usado: montoSFUsado,
                saldo_favor_usado: montoSFUsado,
                descuento_saldo_favor: montoSFUsado,
            } : {}),
            banco_destino: (pagoAgregadoCoincidente || primerReal)?.bancoDestino || pago.bancoDestino || (pago.pagosAgregados || []).find((p: any) => p.bancoDestino)?.bancoDestino || undefined,
            comprobante_url: (pagoAgregadoCoincidente || primerReal)?.comprobante_url || (pago.pagosAgregados || []).find((p: any) => p.comprobante_url)?.comprobante_url || undefined,
            comprobante_nombre: (pagoAgregadoCoincidente || primerReal)?.comprobante_nombre || (pago.pagosAgregados || []).find((p: any) => p.comprobante_nombre)?.comprobante_nombre || undefined,
            fecha_transaccion: fechaTransaccion,
            fecha_banco: fechaTransaccion,
            fecha_ingreso_caja: new Date().toISOString().slice(0, 10),
            periodos_pagados: periodoTexto,
            recibo_caja: [reciboCajaItem],
            deuda_previa: antes,
            deuda_condo_aplicada: true,
            ...(i === 0 && (pago.saldoFavorGenerado || 0) >= 5.00 ? { saldo_favor: r2(pago.saldoFavorGenerado || 0), saldo_favor_acreditado: true } : {}),
        };

        const refFila = i > 0 ? `${refFinal}-${i + 1}` : refFinal;
        const fila: any = {
            id,
            identidad: f.identidad,
            monto: montoReportadoReal,
            banco: bancoFila,
            referencia: refFila,
            tipo: metodoFila,
            estado: esTransferencia ? 'Por Verificar' : 'Aprobado',
            modulo: 'condominios',
            detalles,
            created_at: fechaRegistro.toISOString()
        };
        if (grupoId) fila.grupo_pago = grupoId;

        let { error } = await sb.from('pagos_reportados').insert(fila);
        if (error && (error.code === '23505' || error.message.includes('duplicate'))) {
            if (error.message.includes('referencia_key') || error.message.includes('referencia')) {
                if (esMetodoSinRefUnica || i > 0) {
                    fila.referencia = `${refFila}-${Date.now().toString().slice(-4)}`;
                    const reintento = await sb.from('pagos_reportados').insert(fila);
                    error = reintento.error;
                } else {
                    throw new Error(`El número de referencia ${refFinal} ya fue registrado previamente.`);
                }
            } else {
                id = crypto.randomUUID();
                fila.id = id;
                const reintento = await sb.from('pagos_reportados').insert(fila);
                error = reintento.error;
            }
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
                        saldo_favor: 0,
                        saldo_favor_generado: 0,
                        saldo_usado: 0,
                        saldo_favor_usado: 0,
                        descuento_saldo_favor: 0,
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
                    saldo_favor: 0,
                    saldo_favor_generado: 0,
                    saldo_usado: 0,
                    saldo_favor_usado: 0,
                    descuento_saldo_favor: 0,
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

    const esModoCondominio = cobro.modo === 'CONDOMINIO' && !sol.soloMultas;
    const idUnidades = Array.from(new Set(cobro.lineas.map(l => porId.get(l.clave)?.identidad).filter(Boolean)));
    const unidadSel = !esModoCondominio && cobro.lineas.length === 1 ? porId.get(cobro.lineas[0].clave) : null;

    const pagadorIdentidad = esModoCondominio
        ? (c.identidad || c.codigo)
        : (cobro.facturas[0]?.identidad
            || (unidadSel && unidadSel.identidad)
            || (idUnidades.length === 1 ? idUnidades[0] : null)
            || (sol.identidad ? String(sol.identidad).trim() : null)
            || c.identidad);

    const pagadorNombre = esModoCondominio
        ? c.nombre
        : (cobro.facturas[0]?.nombre
            || (unidadSel && (unidadSel.propietario || unidadSel.nombre))
            || (idUnidades.length === 1 && porId.get(cobro.lineas[0].clave)?.propietario)
            || c.nombre);

    const codigoInmuebleHijo = !esModoCondominio
        ? (
            (unidadSel && (unidadSel.padre_inmueble || (unidadSel.padre_unidad_id ? porId.get(unidadSel.padre_unidad_id)?.inmueble : null) || unidadSel.inmueble))
            || cobro.lineas[0]?.padreInmueble
            || cobro.lineas[0]?.inmueble
            || undefined
          )
        : undefined;
    const codigoTargetSF = esModoCondominio ? c?.codigo : codigoInmuebleHijo;
    const ambitoNC = esModoCondominio ? 'CONDOMINIO' : 'LOCAL';
    const modalidadOrigenNC = sol.modalidad || (esModoCondominio
        ? (sol.claves && sol.claves.length > 0 ? 'abono_locales' : 'completo')
        : (sol.soloMultas ? 'multas_separadas' : 'individual'));

    if (montoSaldoFavor > 0 && pagadorIdentidad) {
        const resSF = await descontarSaldoFavor(pagadorIdentidad, montoSaldoFavor, codigoTargetSF, sb);
        if (!resSF.ok) throw new Error('Error al descontar Saldo a Favor: ' + resSF.error);
    }

    if (pago.saldoFavorGenerado && pago.saldoFavorGenerado >= 5.00 && pagadorIdentidad) {
        const mGen = Math.round(pago.saldoFavorGenerado * 100) / 100;
        const resAc = await acreditarSaldoFavor(pagadorIdentidad, mGen, codigoTargetSF, sb);
        if (!resAc.ok) throw new Error('Error al acreditar Saldo a Favor: ' + resAc.error);

        // Registrar Nota de Crédito automática por excedente diferenciando CONDOMINIO vs LOCAL
        await sb.from('documentos').insert([{
            identidad: pagadorIdentidad,
            contribuyente: pagadorNombre || pagadorIdentidad,
            tipo: 'Nota de Credito',
            estado: 'Vigente',
            detalles: JSON.stringify({
                monto: mGen.toFixed(2),
                monto_bs: mGen,
                ambito: ambitoNC,
                modalidad_origen: modalidadOrigenNC,
                codigo_inmueble: esModoCondominio ? c?.codigo : codigoInmuebleHijo,
                codigo_condominio: c?.codigo || undefined,
                origen_referencia: esModoCondominio
                    ? `Excedente Caja de Condominios (${modalidadOrigenNC === 'abono_locales' ? 'Abono por Locales' : 'Pago Completo'}) ${c.codigo}. Ref: ${ref}`
                    : `Excedente Caja de Condominios Local ${codigoInmuebleHijo || ''} (${modalidadOrigenNC === 'multas_separadas' ? 'Multas' : 'Individual'}). Ref: ${ref}`,
                motivo: esModoCondominio
                    ? `Nota de crédito automática por excedente de pago del condominio (${modalidadOrigenNC === 'abono_locales' ? 'Abono por Locales' : 'Pago Completo'})`
                    : `Nota de crédito automática por excedente de pago del local ${codigoInmuebleHijo || ''}`,
                fecha_emision: hoy.toISOString(),
                cajero: pago.cajero,
                pago_id: pagos[0]?.id
            })
        }]);
    }

    // 2) Bajar la deuda en el módulo y sincronizar tabla inmuebles
    for (const l of cobro.lineas) {
        const u = porId.get(l.clave);
        if (u) {
            const upd: any = {};
            if (l.meses > 0 && !sol.soloMultas) upd.aseo_pendiente_desde = M.avanzarPendiente(u.aseo_pendiente_desde || c.aseo_pendiente_desde, l.meses, hoy);
            if (sol.soloMultas) {
                const multasDet = l._multasDetalle || [];
                const deudaPagada = multasDet.filter((m: any) => m.tipo === 'DEUDA');
                const nPagados = multasDet.filter((m: any) => m.tipo === 'PREVIA' || m.tipo === 'DEUDA').length;
                if (l.meses >= l.mesesDeuda && !sol.fechaOverride) {
                    upd.multa_meses = 0;
                } else if (nPagados > 0) {
                    upd.multa_meses = Math.max(0, (Number(u.multa_meses) || 0) - nPagados);
                }
                if (deudaPagada.length > 0) {
                    const ultimoPer = deudaPagada[deudaPagada.length - 1].periodo;
                    upd.multa_exonerada_hasta = `${ultimoPer}-01`;
                }
            } else {
                const permitirMultas = sol.incluirMultas === true;
                const desdeActual = u.aseo_pendiente_desde || c.aseo_pendiente_desde;
                const mesesRealesHoy = desdeActual ? M.mesesPendientes(desdeActual, hoy) : l.mesesDeuda;
                const liquidaHastaHoy = l.meses >= mesesRealesHoy;
                const multasPagadasEnAseo = permitirMultas
                    ? (cobro.estado.renglones.find(r => r.clave === l.clave)?.deuda?.porMes || []).slice(0, l.meses).filter(m => m.multaBs > 0).length
                    : 0;
                if (permitirMultas && liquidaHastaHoy) {
                    upd.multa_meses = 0;
                } else if (permitirMultas && !liquidaHastaHoy && l.meses >= l.mesesDeuda) {
                    upd.multa_meses = Math.max(0, (Number(u.multa_meses) || 0) - multasPagadasEnAseo - (sol.omitirMultaSeptiembre && l.periodos.includes('2026-09') ? 1 : 0));
                } else if (sol.omitirMultaSeptiembre && l.periodos.includes('2026-09') && l.multaMesesQueQuedan === 0 && liquidaHastaHoy) {
                    upd.multa_meses = 0;
                } else if (!permitirMultas && l.multaMesesQueQuedan > 0) {
                    upd.multa_meses = l.multaMesesQueQuedan;
                }
            }
            if (Object.keys(upd).length) {
                await sb.from('condominio_unidades').update(upd).eq('id', u.id);
            }
            // Sincronizar en inmuebles para evitar bloqueos de solvencia
            if (u.inmueble && l.meses > 0 && !sol.soloMultas) {
                const { data: curInm } = await sb.from('inmuebles').select('meses_deuda, deuda_mmv, multa_bs').ilike('inmueble', u.inmueble).limit(1).maybeSingle();
                const desdeActual = u.aseo_pendiente_desde || c.aseo_pendiente_desde;
                const mesesRealesHoy = desdeActual ? M.mesesPendientes(desdeActual, hoy) : l.mesesDeuda;
                const nMesesRest = l.meses >= mesesRealesHoy ? 0 : Math.max(0, (parseInt(curInm?.meses_deuda || 0) || 0) - l.meses);
                const permitirMultasInm = sol.incluirMultas === true;
                const updInmLocal: any = {
                    meses_deuda: nMesesRest,
                    deuda_mmv: nMesesRest === 0 ? 0 : (curInm?.deuda_mmv || 0),
                    deuda_congelada_bs: nMesesRest === 0 ? 0 : undefined,
                };
                if (permitirMultasInm && nMesesRest <= 1) {
                    updInmLocal.multa_bs = 0;
                } else if (l.multaMesesQueQuedan > 0) {
                    updInmLocal.multa_bs = Math.max(parseFloat(curInm?.multa_bs || '0') || 0, r2(l.multaBs + l.multasAparteBs));
                } else if (sol.omitirMultaSeptiembre && l.periodos.includes('2026-09') && l.multaMesesQueQuedan === 0 && nMesesRest <= 1) {
                    updInmLocal.multa_bs = 0;
                }
                await sb.from('inmuebles').update(updInmLocal).ilike('inmueble', u.inmueble);
            }
        } else if (l.clave === M.SIN_REGISTRAR || l.clave === '__CONDOMINIO__') {
            const upd: any = {};
            const mesesRealesCondoHoy = c.aseo_pendiente_desde ? M.mesesPendientes(c.aseo_pendiente_desde, hoy) : l.mesesDeuda;
            const liquidaCondoHoy = l.meses >= mesesRealesCondoHoy;
            if (l.meses > 0 && !sol.soloMultas) upd.aseo_pendiente_desde = M.avanzarPendiente(c.aseo_pendiente_desde, l.meses, hoy);
            if (sol.soloMultas) {
                if (l.meses >= l.mesesDeuda && !sol.fechaOverride) upd.multa_meses = 0;
                else upd.multa_meses = Math.max(0, (Number(c.multa_meses) || 0) - l.meses);
            } else {
                const permitirMultas = sol.incluirMultas === true;
                const multasPagadasCondo = permitirMultas
                    ? (cobro.estado.renglones.find(r => r.clave === l.clave)?.deuda?.porMes || []).slice(0, l.meses).filter(m => m.multaBs > 0).length
                    : 0;
                if (permitirMultas && liquidaCondoHoy) upd.multa_meses = 0;
                else if (permitirMultas && !liquidaCondoHoy && l.meses >= l.mesesDeuda) upd.multa_meses = Math.max(0, (Number(c.multa_meses) || 0) - multasPagadasCondo - (sol.omitirMultaSeptiembre && l.periodos.includes('2026-09') ? 1 : 0));
                else if (sol.omitirMultaSeptiembre && l.periodos.includes('2026-09') && l.multaMesesQueQuedan === 0 && liquidaCondoHoy) upd.multa_meses = 0;
                else if (!permitirMultas && l.multaMesesQueQuedan > 0) upd.multa_meses = l.multaMesesQueQuedan;
            }
            if (Object.keys(upd).length) { await sb.from('condominios').update(upd).eq('id', c.id); }
            // Sincronizar condominio en inmuebles
            if (c.codigo && l.meses > 0 && !sol.soloMultas) {
                const { data: curInm } = await sb.from('inmuebles').select('meses_deuda, deuda_mmv, multa_bs').eq('inmueble', c.codigo).limit(1).maybeSingle();
                if (curInm) {
                    const nMesesRest = Math.max(0, (parseInt(curInm.meses_deuda || 0) || 0) - l.meses);
                    const updCondoInm: any = {
                        meses_deuda: nMesesRest,
                        deuda_mmv: nMesesRest === 0 ? 0 : curInm.deuda_mmv,
                    };
                    if (sol.incluirMultas && (l.clave === '__CONDOMINIO__' || l.clave === M.SIN_REGISTRAR) && nMesesRest <= 1) {
                        updCondoInm.multa_bs = 0;
                    }
                    await sb.from('inmuebles').update(updCondoInm).eq('inmueble', c.codigo);
                }
            }
        }
        if (l.multasManualesIds.length) await sb.from('condominio_multas').update({ estado: 'Pagada', pago_id: pagoDe(l.clave) }).in('id', l.multasManualesIds).eq('estado', 'Pendiente');
    }

    // Sincronizar padres N/A cuyos hijos hayan sido pagados en este cobro
    const padresAfectadosIds = Array.from(new Set(
        cobro.lineas.map(l => porId.get(l.clave)?.padre_unidad_id).filter(Boolean)
    ));
    for (const pId of padresAfectadosIds) {
        const padreU = porId.get(pId);
        if (!padreU) continue;
        const { data: hijosDb } = await sb
            .from('condominio_unidades')
            .select('id, aseo_pendiente_desde, multa_meses, estado')
            .eq('padre_unidad_id', pId)
            .neq('estado', 'Eliminada');
        const hijosAct = (hijosDb || []).filter((h: any) => h.estado === 'Activa');
        if (hijosAct.length > 0) {
            const fechas = hijosAct.map((h: any) => h.aseo_pendiente_desde).filter(Boolean).sort();
            const minDesde = fechas[0] || padreU.aseo_pendiente_desde || c.aseo_pendiente_desde;
            const maxMultas = Math.max(0, ...hijosAct.map((h: any) => Number(h.multa_meses || 0)));
            await sb.from('condominio_unidades').update({
                aseo_pendiente_desde: minDesde,
                multa_meses: maxMultas,
            }).eq('id', pId);
            if (padreU.inmueble) {
                const mesesRealesPadre = minDesde ? M.mesesPendientes(minDesde, hoy) : 0;
                const updPadreInm: any = {
                    meses_deuda: mesesRealesPadre,
                    deuda_mmv: mesesRealesPadre === 0 ? 0 : undefined,
                    multa_bs: maxMultas === 0 ? 0 : undefined,
                };
                await sb.from('inmuebles').update(updPadreInm).ilike('inmueble', padreU.inmueble);
            }
        }
    }
    // Condominio pagado completo (sin unidades sueltas omitidas): el condominio también avanza
    const todasLasUnidadesConDeudaIncluidas = cobro.estado.renglones.filter(r => r.totalBs > 0.01).length <= cobro.lineas.length;
    if (cobro.modo === 'CONDOMINIO' && (!cobro.estado.porActividad || todasLasUnidadesConDeudaIncluidas) && !cobro.lineas.some(l => l.clave === M.SIN_REGISTRAR) && !sol.soloMultas) {
        const nMeses = cobro.totales.meses;
        const safeCod = String(c.codigo || '').replace(/[,()]/g, '').trim();
        const nuevoDesdeCondoGlobal = nMeses > 0 && c.aseo_pendiente_desde ? M.avanzarPendiente(c.aseo_pendiente_desde, nMeses, hoy) : null;
        const mesesRestantesCondoHoy = nuevoDesdeCondoGlobal ? M.mesesPendientes(nuevoDesdeCondoGlobal, hoy) : 0;
        const multasRestantesCondoHoy = Math.max(0, mesesRestantesCondoHoy - 1);
        if (nMeses > 0 && c.aseo_pendiente_desde) {
            await sb.from('condominios').update({ aseo_pendiente_desde: nuevoDesdeCondoGlobal, multa_meses: multasRestantesCondoHoy }).eq('id', c.id);
            if (!cobro.estado.porActividad) {
                await sb.from('condominio_unidades').update({ aseo_pendiente_desde: nuevoDesdeCondoGlobal, multa_meses: multasRestantesCondoHoy }).eq('condominio_id', c.id).neq('estado', 'Eliminada');
            }
        }
        if (!cobro.estado.porActividad && safeCod) await sb.from('inmuebles').update({ meses_deuda: mesesRestantesCondoHoy, deuda_mmv: mesesRestantesCondoHoy === 0 ? 0 : undefined, multa_bs: multasRestantesCondoHoy === 0 ? 0 : undefined }).or(`inmueble.eq.${safeCod},condominio_padre_id.eq.${safeCod},padre_id.eq.${safeCod}`);
    }

    // Sincronizar unidades contenedor / es_grupo / N/A con la fecha pendiente del condominio matriz
    if (cobro.modo === 'CONDOMINIO' && !sol.soloMultas) {
        const { data: condoActualizado } = await sb.from('condominios').select('aseo_pendiente_desde').eq('id', c.id).maybeSingle();
        const nuevoDesdeCondo = condoActualizado?.aseo_pendiente_desde ?? c.aseo_pendiente_desde;
        if (nuevoDesdeCondo) {
            await sb.from('condominio_unidades')
                .update({ aseo_pendiente_desde: nuevoDesdeCondo })
                .eq('condominio_id', c.id)
                .or('es_grupo.eq.true,actividad.eq.N/A,actividad.is.null');
        }
    }

    // 3) Libro del condominio
    const movs = cobro.lineas.map(l => ({
        condominio_id: c.id, unidad_id: porId.has(l.clave) ? l.clave : null, tipo: 'PAGO', periodo: l.periodos[0] ? `${l.periodos[0]}-01` : null,
        concepto: sol.soloMultas
            ? `Pago de multas${l.inmueble ? ` · ${l.inmueble}` : ''}: ${l.meses} mes(es) de multas (${l.periodos.join(', ')})`
            : `Pago de Aseo Urbano (${cobro.modo === 'CONDOMINIO' ? 'Condominio' : 'Contribuyente'})${l.inmueble ? ` · ${l.inmueble}` : ''}: ${l.meses ? `${l.meses} mes(es) (${l.periodos.join(', ')})` : ''}${l.multasAparteBs > 0 ? ' + multas' : ''}`,
        monto_bs: -l.totalBs, tasa_bcv: tasa, pago_id: pagoDe(l.clave), usuario: pago.usuario,
    }));
    for (let i = 0; i < movs.length; i += 300) await sb.from('condominio_movimientos').insert(movs.slice(i, i + 300));

    await sb.from('auditoria').insert({
        accion: 'Cobro en Caja de Condominios', usuario: pago.usuario, modulo: '/admin/condominios/caja',
        detalles: {
            pagos: pagos.map(p => ({ id: p.id, identidad: p.factura.identidad, monto: p.factura.totalBs })), codigo: c.codigo, condominio: c.nombre, modo: cobro.modo,
            monto: cobro.totales.totalBs, metodo: pago.metodo, referencia: ref, lineas: cobro.lineas.length, deuda_previa: antes, _categoria: 'CONDOMINIOS', criticidad: 'ALTA'
        },
    });
    return {
        pagoId: pago.pagoId,
        pagos: pagos.map(p => ({ id: p.id, reciboRef: p.reciboRef, identidad: p.factura.identidad, nombre: p.factura.nombre, monto: p.factura.totalBs })),
        monto: cobro.totales.totalBs,
        montoRecibido: pago.montoRecibido || (cobro.totales.totalBs + (pago.saldoFavorGenerado || 0)),
        saldoFavorGenerado: pago.saldoFavorGenerado || 0,
        estado: esTransferencia ? 'Por Verificar' : 'Aprobado',
        esTransferencia,
        cobro
    };
}
