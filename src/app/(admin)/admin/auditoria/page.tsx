'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Search,
  Filter,
  X,
  User,
  Calendar,
  Copy,
  Check,
  Eye,
  Printer,
  DollarSign,
  Activity,
  Layers,
  FileSpreadsheet,
  Users,
  ChevronLeft,
  ChevronRight,
  Building2
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export type AuditCriticality = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

const CATEGORIAS = [
  'TODAS',
  'COBRO',
  'CONDOMINIOS',
  'CONCILIACION',
  'FACTURACION',
  'NOTA_CREDITO',
  'TRANSFERENCIA',
  'DEUDA',
  'TASA',
  'CONTRIBUYENTE',
  'INMUEBLE',
  'CAJA',
  'CONVENIO',
  'SESION',
  'SEGURIDAD',
  'REPORTE',
  'CONFIGURACION',
  'RECIBO',
  'SISTEMA'
];

const CRITICIDADES: ('TODAS' | AuditCriticality)[] = ['TODAS', 'CRITICA', 'ALTA', 'MEDIA', 'BAJA'];

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  COBRO:         { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CONDOMINIOS:   { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  CAJA:          { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  DEUDA:         { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' },
  CONTRIBUYENTE: { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  INMUEBLE:      { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  TASA:          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  FACTURACION:   { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  NOTA_CREDITO:  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
  CONCILIACION:  { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  CONVENIO:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  SESION:        { bg: 'bg-slate-100',  text: 'text-slate-700',   border: 'border-slate-300' },
  SEGURIDAD:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  REPORTE:       { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200' },
  CONFIGURACION: { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  TRANSFERENCIA: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  RECIBO:        { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  SISTEMA:       { bg: 'bg-gray-100',   text: 'text-gray-700',    border: 'border-gray-300' },
};

const CRIT_STYLES: Record<AuditCriticality, { bg: string; text: string; border: string; badge: string; icon: any }> = {
  CRITICA: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-300',
    badge: 'bg-red-600 text-white font-black shadow-sm',
    icon: ShieldAlert
  },
  ALTA: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    badge: 'bg-amber-500 text-white font-bold shadow-sm',
    icon: AlertTriangle
  },
  MEDIA: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800 font-medium',
    icon: AlertCircle
  },
  BAJA: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    icon: Info
  },
};

const parseDetalles = (raw: any): any => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { texto: raw };
    }
  }
  return raw;
};

/**
 * Convierte tanto números estándar (26504.94) como formato venezolano ("26.504,94") a número JS
 */
const parseMontoNum = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val * 100) / 100 : 0;
  const s = String(val).trim();
  if (!s) return 0;
  // Si tiene coma decimal estilo venezolano "26.504,94"
  if (s.includes(',') && s.includes('.')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  if (s.includes(',') && !s.includes('.')) {
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const getCategoria = (log: any): string => {
  if (log.categoria && log.categoria !== 'SISTEMA') return log.categoria;
  const det = parseDetalles(log.detalles);
  if (det._categoria && det._categoria !== 'SISTEMA') return det._categoria;
  return log.categoria || det._categoria || 'SISTEMA';
};

const getModulo = (log: any): string => {
  if (log.modulo) return log.modulo;
  const det = parseDetalles(log.detalles);
  return det._modulo || '';
};

const getCriticidad = (log: any): AuditCriticality => {
  const det = parseDetalles(log.detalles);
  if (det.criticidad && ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(det.criticidad)) {
    return det.criticidad;
  }
  const cat = getCategoria(log);
  const accion = (log.accion || '').toLowerCase();
  if (
    accion.includes('anula') ||
    accion.includes('ajuste') ||
    accion.includes('elimin') ||
    accion.includes('tasa') ||
    accion.includes('crédito') ||
    accion.includes('credito') ||
    accion.includes('exoner')
  ) {
    return 'CRITICA';
  }
  if (cat === 'COBRO' || cat === 'CONCILIACION' || cat === 'DEUDA' || cat === 'CONDOMINIOS' || cat === 'NOTA_CREDITO') {
    return 'ALTA';
  }
  if (cat === 'SESION' || accion.includes('consulta')) {
    return 'BAJA';
  }
  return 'MEDIA';
};

const formatDateVE = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString('es-VE');
  }
};

const formatTimeVE = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString('es-VE');
  }
};

/**
 * Extrae todos los campos estructurados de cualquier registro de auditoría,
 * sin importar desde qué módulo fue emitido.
 */
const extractAuditFields = (log: any) => {
  const det = parseDetalles(log.detalles);
  const cat = getCategoria(log);
  const crit = getCriticidad(log);
  const modulo = (getModulo(log) || '').replace('/admin/', '').replace(/^\//, '') || 'general';
  const accion = String(log.accion || '');

  // 1. Identidad / RIF
  let identidad = String(
    det.identidad ||
    det.rif ||
    det.cedula ||
    det.identidad_nueva ||
    ''
  ).trim();
  if (!identidad && det.texto) {
    const mId = String(det.texto).match(/([VEJGPN]-\d+|\b[VEJGPN]\d{6,10}\b)/i);
    if (mId) identidad = mId[1].toUpperCase();
  }

  // 2. Contribuyente / Razón Social
  let contribuyente = String(
    det.contribuyente ||
    det.condominio ||
    det.razon_social ||
    det.nombre ||
    ''
  ).trim();
  if (!contribuyente && det.texto) {
    const mName = String(det.texto).match(/contribuyente:\s*([^(]+)/i);
    if (mName) contribuyente = mName[1].trim();
  }

  // 3. Código Inmueble / Condominio
  let codigoInmueble = String(
    det.codigo_inmueble ||
    det.codigo_catastral ||
    det.inmueble ||
    det.codigo ||
    det.codigo_condominio ||
    det.codigoCondominio ||
    ''
  ).trim();
  if (!codigoInmueble && Array.isArray(det.inmuebles) && det.inmuebles.length > 0) {
    codigoInmueble = det.inmuebles.join(', ');
  }
  if (!codigoInmueble) {
    const refsArr = Array.isArray(det.recibos_afectados)
      ? det.recibos_afectados
      : Array.isArray(det.referencias)
      ? det.referencias
      : Array.isArray(det.referencias_facturas)
      ? det.referencias_facturas
      : [];
    for (const r of refsArr) {
      const m = String(r || '').match(/((?:URB|AURI|COM|IND|RES|CON|TEMP|SRV)[A-Z0-9-]+)/i);
      if (m) {
        codigoInmueble = m[1].toUpperCase();
        break;
      }
    }
  }

  // 4. Monto en Bs.
  const montoBs =
    parseMontoNum(det.monto_bs) ||
    parseMontoNum(det.monto_conciliado) ||
    parseMontoNum(det.monto) ||
    parseMontoNum(det.monto_cobrado) ||
    parseMontoNum(det.monto_nuevo) ||
    parseMontoNum(det.nuevo_saldo) ||
    parseMontoNum(det.monto_retenido) ||
    parseMontoNum(det.total_multa_eliminada_bs) ||
    parseMontoNum(det.total_estimado_bs) ||
    parseMontoNum(det.deuda_total_bs) ||
    0;

  // 5. Método de pago
  const metodoPago = String(
    det.metodo ||
    det.forma_pago ||
    (Array.isArray(det.pagos) && det.pagos[0]?.metodo ? det.pagos[0].metodo : '') ||
    (cat === 'TRANSFERENCIA' ? 'Transferencia' : '') ||
    (cat === 'CONCILIACION' ? 'Transferencia / Conciliación' : '') ||
    ''
  ).trim();

  // 6. Banco Emisor / Receptor
  const bancoParts = [
    det.banco,
    det.banco_emisor ? `Orig: ${det.banco_emisor}` : '',
    det.banco_receptor ? `Dest: ${det.banco_receptor}` : '',
  ].filter(Boolean);
  const banco = bancoParts.join(' → ');

  // 7. Referencia / Factura / Comprobante
  const referencia = String(
    det.referencia_pago ||
    det.referencia_bancaria ||
    det.referencia ||
    det.referencia_nueva ||
    det.factura ||
    det.numero_factura ||
    det.numero_control ||
    det.comprobante ||
    det.numero_nota_credito ||
    (Array.isArray(det.pagos) && det.pagos[0]?.referencia ? det.pagos[0].referencia : '') ||
    ''
  ).trim();

  // 8. Tasa BCV
  const tasaBcv = parseMontoNum(det.tasa_bcv || det.tasa_aplicada || det.nueva_tasa);

  // 9. Períodos / Unidades / Meses afectados
  let periodosUnidades = '';
  if (det.periodo) {
    periodosUnidades = String(det.periodo);
  } else if (Array.isArray(det.meses_exonerados) && det.meses_exonerados.length > 0) {
    periodosUnidades = `${det.meses_exonerados.length} meses exonerados (${det.meses_exonerados.slice(0, 4).join(', ')}${det.meses_exonerados.length > 4 ? '...' : ''})`;
  } else if (det.lineas) {
    periodosUnidades = `${det.lineas} locales/unidades (${det.modo || 'CONDOMINIO'})`;
  } else if (det.numero) {
    periodosUnidades = `Local(es): ${det.numero}`;
  } else if (Array.isArray(det.recibos_afectados) && det.recibos_afectados.length > 0) {
    periodosUnidades = det.recibos_afectados.slice(0, 3).join(', ');
  } else if (Array.isArray(det.referencias) && det.referencias.length > 0) {
    periodosUnidades = det.referencias.slice(0, 3).join(', ');
  }

  // 10. Resumen legible de lo que hizo el usuario
  const resumenParts: string[] = [];
  if (det.motivo) resumenParts.push(`Motivo: ${det.motivo}`);
  if (det.justificacion) resumenParts.push(`Justificación: ${det.justificacion}`);
  if (det.observaciones) resumenParts.push(`Obs: ${det.observaciones}`);
  if (det.nota) resumenParts.push(`Nota: ${det.nota}`);
  if (det.texto) resumenParts.push(String(det.texto));
  if (det.autorizado_por) resumenParts.push(`Autorizado por: ${det.autorizado_por}`);
  if (det.meses_nuevos !== undefined) resumenParts.push(`Meses deuda ajustados a: ${det.meses_nuevos}`);
  if (det.correo) resumenParts.push(`Enviado a: ${det.correo}`);
  if (det.estatus) resumenParts.push(`Estatus: ${det.estatus}`);
  if (det.identidad_anterior && det.identidad_nueva) {
    resumenParts.push(`Cambio RIF: ${det.identidad_anterior} → ${det.identidad_nueva}`);
  }
  if (det.monto_anterior !== undefined && det.monto_nuevo !== undefined) {
    resumenParts.push(`Monto: Bs. ${det.monto_anterior} → Bs. ${det.monto_nuevo}`);
  }
  if (resumenParts.length === 0) {
    if (contribuyente || identidad) {
      resumenParts.push(`${accion} — ${contribuyente || identidad}${codigoInmueble ? ` (${codigoInmueble})` : ''}`);
    } else {
      resumenParts.push(accion);
    }
  }

  return {
    fechaStr: formatDateVE(log.created_at),
    horaStr: formatTimeVE(log.created_at),
    operador: log.usuario || 'Desconocido',
    operadorOriginal: log.usuario_original || log.usuario || '',
    operadorNombre: log.usuario_nombre || log.usuario || 'Desconocido',
    operadorLogin: log.usuario_login || '',
    operadorLetra: log.usuario_letra || det._usuario_letra || '',
    operadorRol: log.usuario_rol || det._usuario_rol || 'Operador',
    criticidad: crit,
    categoria: cat,
    modulo,
    accion,
    identidad,
    contribuyente,
    codigoInmueble,
    montoBs,
    metodoPago,
    banco,
    referencia,
    tasaBcv,
    periodosUnidades,
    resumen: resumenParts.join(' | '),
    det,
  };
};

const getTodayVE = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [totalEnBd, setTotalEnBd] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [filterCat, setFilterCat] = useState('TODAS');
  const [filterCrit, setFilterCrit] = useState<'TODAS' | AuditCriticality>('TODAS');
  const [filterUser, setFilterUser] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month'>('all');
  const [incluirConsultas, setIncluirConsultas] = useState(false);
  const [activeTab, setActiveTab] = useState<'bitacora' | 'usuarios'>('bitacora');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(150);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [modoDios, setModoDios] = useState(false);

  // Manejo de presets de fechas
  const applyDatePreset = (preset: 'all' | 'today' | 'yesterday' | '7days' | 'month') => {
    setDatePreset(preset);
    const todayStr = getTodayVE();
    const today = new Date(todayStr + 'T12:00:00');

    if (preset === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
    } else if (preset === 'today') {
      setFilterDateFrom(todayStr);
      setFilterDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setFilterDateFrom(yStr);
      setFilterDateTo(yStr);
    } else if (preset === '7days') {
      const past7 = new Date(today);
      past7.setDate(past7.getDate() - 6);
      setFilterDateFrom(past7.toISOString().split('T')[0]);
      setFilterDateTo(todayStr);
    } else if (preset === 'month') {
      const startOfMonth = todayStr.substring(0, 8) + '01';
      setFilterDateFrom(startOfMonth);
      setFilterDateTo(todayStr);
    }
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDateFrom) params.set('desde', filterDateFrom);
      if (filterDateTo) params.set('hasta', filterDateTo);
      if (filterCat !== 'TODAS') params.set('categoria', filterCat);
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (modoDios) params.set('modo_dios', '1');
      if (incluirConsultas) params.set('incluir_consultas', '1');

      const res = await fetch(`/api/admin/auditoria?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Error fetching auditoria logs:', json?.error || res.status);
      }
      setLogs(json?.data || []);
      setTotalEnBd(json?.total_en_bd || (json?.data || []).length);
      setCurrentPage(1);
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterCat, debouncedSearch, modoDios, incluirConsultas]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Lista única de operadores / usuarios (ya normalizados desde el backend)
  const usuarios = useMemo(() => {
    const list = logs.map(l => l.usuario).filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [logs]);

  // Filtrado reactivo en el cliente
  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterCat !== 'TODAS') {
        if (getCategoria(l) !== filterCat) return false;
      }
      if (filterCrit !== 'TODAS') {
        if (getCriticidad(l) !== filterCrit) return false;
      }
      if (filterUser && l.usuario !== filterUser && l.usuario_original !== filterUser) {
        return false;
      }
      if (search.trim()) {
        const s = search.toLowerCase().trim();
        const userMatch = (l.usuario || '').toLowerCase().includes(s) || (l.usuario_original || '').toLowerCase().includes(s);
        const actionMatch = (l.accion || '').toLowerCase().includes(s);
        const modMatch = (getModulo(l) || '').toLowerCase().includes(s);
        const detStr = JSON.stringify(l.detalles || {}).toLowerCase();
        const detMatch = detStr.includes(s);

        if (!userMatch && !actionMatch && !modMatch && !detMatch) {
          return false;
        }
      }
      return true;
    });
  }, [logs, filterCat, filterCrit, filterUser, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterCat, filterCrit, filterUser, search]);

  // Rango de fechas real en los registros filtrados
  const dateRangeLoaded = useMemo(() => {
    if (filtered.length === 0) return null;
    const newest = filtered[0]?.created_at;
    const oldest = filtered[filtered.length - 1]?.created_at;
    const uniqueDays = new Set(filtered.map(l => formatDateVE(l.created_at))).size;
    return {
      desde: oldest ? formatDateVE(oldest) : '',
      hasta: newest ? formatDateVE(newest) : '',
      dias: uniqueDays,
    };
  }, [filtered]);

  // Resumen estructurado por cada trabajador / usuario
  const resumenPorUsuario = useMemo(() => {
    const map = new Map<
      string,
      {
        operador: string;
        nombre: string;
        login: string;
        letra: string;
        rol: string;
        diasSet: Set<string>;
        primeraFecha: string;
        ultimaFecha: string;
        totalEventos: number;
        cobrosCajaCount: number;
        cobrosCajaBs: number;
        cobrosCondoCount: number;
        cobrosCondoBs: number;
        transferenciasCount: number;
        transferenciasBs: number;
        conciliadosAprobCount: number;
        conciliadosAprobBs: number;
        conciliadosRechCount: number;
        facturacionRetCount: number;
        notasCreditoCount: number;
        notasCreditoBs: number;
        ajustesDeudaMultasCount: number;
        ajustesDeudaMultasBs: number;
        modifCondominiosCount: number;
        contribCatastroCount: number;
        tasasBcvCount: number;
        sesionesCount: number;
        consultasCajaCount: number;
        criticasCount: number;
      }
    >();

    for (const l of filtered) {
      const f = extractAuditFields(l);
      const key = f.operador;
      if (!map.has(key)) {
        map.set(key, {
          operador: f.operador,
          nombre: f.operadorNombre,
          login: f.operadorLogin,
          letra: f.operadorLetra,
          rol: f.operadorRol,
          diasSet: new Set(),
          primeraFecha: l.created_at,
          ultimaFecha: l.created_at,
          totalEventos: 0,
          cobrosCajaCount: 0,
          cobrosCajaBs: 0,
          cobrosCondoCount: 0,
          cobrosCondoBs: 0,
          transferenciasCount: 0,
          transferenciasBs: 0,
          conciliadosAprobCount: 0,
          conciliadosAprobBs: 0,
          conciliadosRechCount: 0,
          facturacionRetCount: 0,
          notasCreditoCount: 0,
          notasCreditoBs: 0,
          ajustesDeudaMultasCount: 0,
          ajustesDeudaMultasBs: 0,
          modifCondominiosCount: 0,
          contribCatastroCount: 0,
          tasasBcvCount: 0,
          sesionesCount: 0,
          consultasCajaCount: 0,
          criticasCount: 0,
        });
      }

      const u = map.get(key)!;
      u.totalEventos++;
      u.diasSet.add(f.fechaStr);
      if (l.created_at < u.primeraFecha) u.primeraFecha = l.created_at;
      if (l.created_at > u.ultimaFecha) u.ultimaFecha = l.created_at;

      if (f.criticidad === 'CRITICA') u.criticasCount++;

      const accLower = f.accion.toLowerCase();
      if (accLower.includes('consulta de contribuyente en caja')) {
        u.consultasCajaCount++;
      } else if (accLower.includes('cobro en caja de condominios')) {
        u.cobrosCondoCount++;
        u.cobrosCondoBs = Math.round((u.cobrosCondoBs + f.montoBs) * 100) / 100;
      } else if (f.categoria === 'COBRO') {
        u.cobrosCajaCount++;
        u.cobrosCajaBs = Math.round((u.cobrosCajaBs + f.montoBs) * 100) / 100;
      } else if (f.categoria === 'TRANSFERENCIA') {
        u.transferenciasCount++;
        u.transferenciasBs = Math.round((u.transferenciasBs + f.montoBs) * 100) / 100;
      } else if (f.categoria === 'CONCILIACION') {
        if (accLower.includes('rechazad')) {
          u.conciliadosRechCount++;
        } else {
          u.conciliadosAprobCount++;
          u.conciliadosAprobBs = Math.round((u.conciliadosAprobBs + f.montoBs) * 100) / 100;
        }
      } else if (f.categoria === 'NOTA_CREDITO') {
        u.notasCreditoCount++;
        u.notasCreditoBs = Math.round((u.notasCreditoBs + f.montoBs) * 100) / 100;
      } else if (f.categoria === 'FACTURACION') {
        u.facturacionRetCount++;
      } else if (f.categoria === 'DEUDA') {
        u.ajustesDeudaMultasCount++;
        u.ajustesDeudaMultasBs = Math.round((u.ajustesDeudaMultasBs + f.montoBs) * 100) / 100;
      } else if (f.categoria === 'CONDOMINIOS') {
        u.modifCondominiosCount++;
      } else if (f.categoria === 'CONTRIBUYENTE' || f.categoria === 'INMUEBLE') {
        u.contribCatastroCount++;
      } else if (f.categoria === 'TASA') {
        u.tasasBcvCount++;
      } else if (f.categoria === 'SESION') {
        u.sesionesCount++;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalEventos - a.totalEventos);
  }, [filtered]);

  // Métricas KPI Forenses
  const stats = useMemo(() => {
    let cobrosCount = 0;
    let criticasCount = 0;
    let contribCount = 0;
    let totalMontoBs = 0;

    filtered.forEach(l => {
      const f = extractAuditFields(l);

      if (f.categoria === 'COBRO' || f.categoria === 'CONCILIACION' || f.categoria === 'TRANSFERENCIA') {
        cobrosCount++;
        if (!f.accion.toLowerCase().includes('rechazad')) {
          totalMontoBs += f.montoBs;
        }
      }
      if (f.criticidad === 'CRITICA') {
        criticasCount++;
      }
      if (f.categoria === 'CONTRIBUYENTE' || f.categoria === 'INMUEBLE' || f.categoria === 'DEUDA' || f.categoria === 'CONDOMINIOS') {
        contribCount++;
      }
    });

    return {
      total: filtered.length,
      cobrosCount,
      criticasCount,
      contribCount,
      totalMontoBs: Math.round(totalMontoBs * 100) / 100,
      operadoresActivos: resumenPorUsuario.length,
    };
  }, [filtered, resumenPorUsuario]);

  // Paginación de la tabla principal para máxima fluidez
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Exportar Excel Estructurado Completo (Multi-Hoja con ExcelJS)
  const exportarExcel = async (onlyUser?: string) => {
    setExportingExcel(true);
    try {
      const targetLogs = onlyUser ? filtered.filter(l => l.usuario === onlyUser) : filtered;
      const targetExtracted = targetLogs.map(l => ({ raw: l, ...extractAuditFields(l) }));
      const targetUsers = onlyUser
        ? resumenPorUsuario.filter(u => u.operador === onlyUser)
        : resumenPorUsuario;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'IAMEC Naguanagua - Centro de Auditoría Forense';
      wb.created = new Date();

      const headerFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Slate 800
      };
      const subHeaderFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' }, // Slate 700
      };
      const totalFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };

      const rangoTexto = dateRangeLoaded
        ? `Período Auditado: ${dateRangeLoaded.desde} al ${dateRangeLoaded.hasta} (${dateRangeLoaded.dias} días con actividad)`
        : 'Período Auditado: Todo el Histórico';

      // =========================================================================
      // HOJA 1: RESUMEN EJECUTIVO POR USUARIO / TRABAJADOR
      // =========================================================================
      const wsResumen = wb.addWorksheet('1. Resumen por Usuario', {
        views: [{ state: 'frozen', ySplit: 4 }],
      });

      wsResumen.mergeCells('A1:W1');
      const titleCell1 = wsResumen.getCell('A1');
      titleCell1.value = 'IAMEC NAGUANAGUA — REPORTE EJECUTIVO DE AUDITORÍA Y PRODUCTIVIDAD POR USUARIO';
      titleCell1.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      titleCell1.fill = headerFill;
      titleCell1.alignment = { vertical: 'middle', horizontal: 'left' };
      wsResumen.getRow(1).height = 26;

      wsResumen.mergeCells('A2:W2');
      const subCell1 = wsResumen.getCell('A2');
      subCell1.value = `${rangoTexto}  |  Total Eventos Auditados: ${targetExtracted.length.toLocaleString('es-VE')}  |  Generado: ${new Date().toLocaleString('es-VE')}`;
      subCell1.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
      wsResumen.getRow(2).height = 18;

      const resumenHeaders = [
        'N°',
        'Trabajador / Operador',
        'Usuario Login',
        'Caja',
        'Rol',
        'Días Activos',
        'Primera Actividad',
        'Última Actividad',
        'Total Acciones',
        'Cobros Caja (Cant)',
        'Cobros Caja (Bs.)',
        'Cobros Condominios (Cant)',
        'Cobros Condominios (Bs.)',
        'Transferencias Reg. (Cant)',
        'Transferencias Reg. (Bs.)',
        'Conciliaciones Aprob. (Cant)',
        'Conciliaciones Aprob. (Bs.)',
        'Conciliaciones Rech. (Cant)',
        'Facturas / Retenciones',
        'Notas de Crédito (Cant)',
        'Notas de Crédito (Bs.)',
        'Ajustes Deuda / Multas',
        'Condominios / Catastro / Tasas',
      ];

      const hdrRow1 = wsResumen.getRow(4);
      resumenHeaders.forEach((h, idx) => {
        const c = hdrRow1.getCell(idx + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.fill = subHeaderFill;
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        c.border = thinBorder;
      });
      hdrRow1.height = 28;

      let sumTotalEventos = 0;
      let sumCobrosCajaCount = 0;
      let sumCobrosCajaBs = 0;
      let sumCobrosCondoCount = 0;
      let sumCobrosCondoBs = 0;
      let sumTransfCount = 0;
      let sumTransfBs = 0;
      let sumConcilAprobCount = 0;
      let sumConcilAprobBs = 0;
      let sumConcilRechCount = 0;
      let sumFactRetCount = 0;
      let sumNcCount = 0;
      let sumNcBs = 0;
      let sumDeudaCount = 0;
      let sumOtrosCount = 0;

      targetUsers.forEach((u, idx) => {
        const r = wsResumen.getRow(5 + idx);
        const otros = u.modifCondominiosCount + u.contribCatastroCount + u.tasasBcvCount;

        sumTotalEventos += u.totalEventos;
        sumCobrosCajaCount += u.cobrosCajaCount;
        sumCobrosCajaBs += u.cobrosCajaBs;
        sumCobrosCondoCount += u.cobrosCondoCount;
        sumCobrosCondoBs += u.cobrosCondoBs;
        sumTransfCount += u.transferenciasCount;
        sumTransfBs += u.transferenciasBs;
        sumConcilAprobCount += u.conciliadosAprobCount;
        sumConcilAprobBs += u.conciliadosAprobBs;
        sumConcilRechCount += u.conciliadosRechCount;
        sumFactRetCount += u.facturacionRetCount;
        sumNcCount += u.notasCreditoCount;
        sumNcBs += u.notasCreditoBs;
        sumDeudaCount += u.ajustesDeudaMultasCount;
        sumOtrosCount += otros;

        const vals = [
          idx + 1,
          u.operador,
          u.login || '-',
          u.letra || '-',
          u.rol,
          u.diasSet.size,
          `${formatDateVE(u.primeraFecha)} ${formatTimeVE(u.primeraFecha)}`,
          `${formatDateVE(u.ultimaFecha)} ${formatTimeVE(u.ultimaFecha)}`,
          u.totalEventos,
          u.cobrosCajaCount,
          u.cobrosCajaBs,
          u.cobrosCondoCount,
          u.cobrosCondoBs,
          u.transferenciasCount,
          u.transferenciasBs,
          u.conciliadosAprobCount,
          u.conciliadosAprobBs,
          u.conciliadosRechCount,
          u.facturacionRetCount,
          u.notasCreditoCount,
          u.notasCreditoBs,
          u.ajustesDeudaMultasCount,
          otros,
        ];

        vals.forEach((v, cIdx) => {
          const cell = r.getCell(cIdx + 1);
          cell.value = v as any;
          cell.border = thinBorder;
          cell.font = { size: 10, bold: cIdx === 1 || cIdx === 8 };
          if ([10, 12, 14, 16, 20].includes(cIdx)) {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          } else if ([0, 3, 5, 8, 9, 11, 13, 15, 17, 18, 19, 21, 22].includes(cIdx)) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          }
        });
        r.height = 20;
      });

      // Fila de Totales en Resumen
      const totRow = wsResumen.getRow(5 + targetUsers.length);
      const totVals = [
        '',
        'TOTALES GENERALES',
        '',
        '',
        '',
        '',
        '',
        '',
        sumTotalEventos,
        sumCobrosCajaCount,
        Math.round(sumCobrosCajaBs * 100) / 100,
        sumCobrosCondoCount,
        Math.round(sumCobrosCondoBs * 100) / 100,
        sumTransfCount,
        Math.round(sumTransfBs * 100) / 100,
        sumConcilAprobCount,
        Math.round(sumConcilAprobBs * 100) / 100,
        sumConcilRechCount,
        sumFactRetCount,
        sumNcCount,
        Math.round(sumNcBs * 100) / 100,
        sumDeudaCount,
        sumOtrosCount,
      ];
      totVals.forEach((v, cIdx) => {
        const cell = totRow.getCell(cIdx + 1);
        cell.value = v as any;
        cell.font = { bold: true, size: 10 };
        cell.fill = totalFill;
        cell.border = thinBorder;
        if ([10, 12, 14, 16, 20].includes(cIdx)) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (cIdx >= 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      totRow.height = 22;

      const resumenWidths = [6, 30, 16, 8, 18, 12, 20, 20, 14, 14, 18, 16, 18, 16, 18, 16, 18, 16, 16, 16, 18, 16, 18];
      resumenWidths.forEach((w, idx) => {
        wsResumen.getColumn(idx + 1).width = w;
      });

      // =========================================================================
      // FUNCIÓN AUXILIAR PARA POBLAR UNA HOJA DE BITÁCORA DETALLADA
      // =========================================================================
      const poblarHojaBitacora = (ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, items: typeof targetExtracted) => {
        ws.mergeCells('A1:S1');
        const tCell = ws.getCell('A1');
        tCell.value = titulo;
        tCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        tCell.fill = headerFill;
        tCell.alignment = { vertical: 'middle', horizontal: 'left' };
        ws.getRow(1).height = 24;

        ws.mergeCells('A2:S2');
        const sCell = ws.getCell('A2');
        sCell.value = subtitulo;
        sCell.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
        ws.getRow(2).height = 18;

        const cols = [
          { header: 'N°', width: 7 },
          { header: 'Fecha (VE)', width: 13 },
          { header: 'Hora (VE)', width: 13 },
          { header: 'Trabajador / Operador', width: 28 },
          { header: 'Caja', width: 7 },
          { header: 'Rol', width: 16 },
          { header: 'Criticidad', width: 12 },
          { header: 'Categoría', width: 16 },
          { header: 'Módulo', width: 20 },
          { header: 'Acción Ejecutada', width: 36 },
          { header: 'RIF / Cédula', width: 16 },
          { header: 'Contribuyente / Razón Social', width: 34 },
          { header: 'Código Inmueble / Condominio', width: 22 },
          { header: 'Monto (Bs.)', width: 18 },
          { header: 'Método Pago', width: 18 },
          { header: 'Banco Emisor / Receptor', width: 28 },
          { header: 'Referencia / Factura / Control', width: 22 },
          { header: 'Tasa BCV', width: 13 },
          { header: 'Período / Detalle y Resumen de la Acción', width: 55 },
        ];

        const hRow = ws.getRow(4);
        cols.forEach((col, idx) => {
          ws.getColumn(idx + 1).width = col.width;
          const cell = hRow.getCell(idx + 1);
          cell.value = col.header;
          cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
          cell.fill = subHeaderFill;
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = thinBorder;
        });
        hRow.height = 25;

        items.forEach((it, idx) => {
          const row = ws.getRow(5 + idx);
          const detalleUnido = [it.periodosUnidades, it.resumen].filter(Boolean).join(' — ');
          const rowVals = [
            idx + 1,
            it.fechaStr,
            it.horaStr,
            it.operador,
            it.operadorLetra || '-',
            it.operadorRol,
            it.criticidad,
            it.categoria,
            it.modulo,
            it.accion,
            it.identidad || '-',
            it.contribuyente || '-',
            it.codigoInmueble || '-',
            it.montoBs > 0 ? it.montoBs : '',
            it.metodoPago || '-',
            it.banco || '-',
            it.referencia || '-',
            it.tasaBcv > 0 ? it.tasaBcv : '',
            detalleUnido,
          ];

          rowVals.forEach((val, cIdx) => {
            const c = row.getCell(cIdx + 1);
            c.value = val as any;
            c.border = thinBorder;
            c.font = { size: 9.5, bold: cIdx === 3 || cIdx === 9 };
            if (cIdx === 13 || cIdx === 17) {
              if (typeof val === 'number') c.numFmt = '#,##0.00';
              c.alignment = { horizontal: 'right', vertical: 'middle' };
            } else if ([0, 1, 2, 4, 6, 7, 10, 12, 16].includes(cIdx)) {
              c.alignment = { horizontal: 'center', vertical: 'middle' };
            } else {
              c.alignment = { horizontal: 'left', vertical: 'middle' };
            }
          });
          row.height = 19;
        });
      };

      // =========================================================================
      // HOJA 2: BITÁCORA GENERAL COMPLETA (CRONOLÓGICA)
      // =========================================================================
      const wsBitacora = wb.addWorksheet('2. Bitácora General Completa', {
        views: [{ state: 'frozen', ySplit: 4 }],
      });
      poblarHojaBitacora(
        wsBitacora,
        'IAMEC NAGUANAGUA — BITÁCORA FORENSE DETALLADA DE OPERACIONES',
        `${rangoTexto}  |  Total Registros: ${targetExtracted.length.toLocaleString('es-VE')}`,
        targetExtracted
      );

      // =========================================================================
      // HOJAS INDIVIDUALES POR CADA TRABAJADOR MUNICIPAL (TOP 25 OPERADORES)
      // =========================================================================
      const usedSheetNames = new Set<string>(['1. Resumen por Usuario', '2. Bitácora General Completa']);
      const operadoresParaHojas = targetUsers
        .filter(u => !u.operador.startsWith('PORTAL (') && u.totalEventos > 0)
        .slice(0, 25);

      operadoresParaHojas.forEach(u => {
        let baseName = u.operador.replace(/[\\/*?:[\]]/g, '').trim().substring(0, 28);
        if (!baseName) baseName = 'Operador';
        let finalSheetName = baseName;
        let counter = 2;
        while (usedSheetNames.has(finalSheetName)) {
          finalSheetName = `${baseName.substring(0, 25)}_${counter++}`;
        }
        usedSheetNames.add(finalSheetName);

        const userItems = targetExtracted.filter(it => it.operador === u.operador);
        const wsUser = wb.addWorksheet(finalSheetName, {
          views: [{ state: 'frozen', ySplit: 4 }],
        });

        const subResumenUser = `Rol: ${u.rol} | Días Activos: ${u.diasSet.size} | Total Acciones: ${u.totalEventos} | Cobros Caja: ${u.cobrosCajaCount} (Bs. ${u.cobrosCajaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}) | Cobros Condominios: ${u.cobrosCondoCount} (Bs. ${u.cobrosCondoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}) | Conciliaciones Aprob.: ${u.conciliadosAprobCount} (Bs. ${u.conciliadosAprobBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}) | Ajustes Deuda/Multas: ${u.ajustesDeudaMultasCount}`;

        poblarHojaBitacora(
          wsUser,
          `REPORTE INDIVIDUAL DE AUDITORÍA — ${u.operador}`,
          subResumenUser,
          userItems
        );
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const suffixUser = onlyUser ? `_${onlyUser.replace(/[^A-Z0-9]/gi, '_')}` : '';
      saveAs(blob, `Auditoria_Estructurada_Naguanagua${suffixUser}_${getTodayVE()}.xlsx`);
    } catch (err) {
      console.error('Error exportando Excel de auditoría:', err);
      alert('Ocurrió un error al generar el archivo Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleCopyJson = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const clearAllFilters = () => {
    setFilterCat('TODAS');
    setFilterCrit('TODAS');
    setFilterUser('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setDatePreset('all');
    setSearch('');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto print:p-0 print:m-0">
      {/* Encabezado Superior */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                Centro de Auditoría y Trazabilidad Integral
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 tracking-normal border border-indigo-200">
                  Histórico Completo
                </span>
              </h1>
              <p className="text-slate-500 text-xs md:text-sm mt-0.5">
                Supervisión forense de todas las operaciones por trabajador, cobros, conciliaciones, facturación, notas de crédito, tasas, deudas y catastro.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <button
            onClick={() => setIncluirConsultas(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer ${
              incluirConsultas
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Activar para incluir las simples búsquedas de lectura en el buscador de Caja"
          >
            <Search size={14} />
            {incluirConsultas ? 'Búsquedas de Caja: Incluidas' : 'Incluir Búsquedas de Caja'}
          </button>
          <button
            onClick={() => setModoDios(m => !m)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer ${
              modoDios
                ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-700 shadow-fuchsia-200'
                : 'bg-white border border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50'
            }`}
            title="Ver auditoría exclusiva de cambios en Modo Dios"
          >
            ⚡ {modoDios ? 'Modo Dios (Activo)' : 'Ver Modo Dios'}
          </button>
          <button
            onClick={() => window.print()}
            title="Imprimir reporte formal"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Printer size={15} /> Imprimir / PDF
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-indigo-600' : ''} />
            Actualizar
          </button>
          <button
            onClick={() => exportarExcel()}
            disabled={exportingExcel || loading || filtered.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md shadow-emerald-100 transition-all cursor-pointer"
          >
            <FileSpreadsheet size={15} />
            {exportingExcel ? 'Generando Excel...' : 'Exportar Excel Estructurado (Por Usuario)'}
          </button>
        </div>
      </div>

      {/* KPI Cards Forenses */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Eventos */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Eventos</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.total.toLocaleString('es-VE')}</span>
            <span className="text-[11px] text-slate-400">operaciones</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {dateRangeLoaded ? (
              <span>
                <span className="font-bold text-indigo-600">{dateRangeLoaded.dias} días</span> ({dateRangeLoaded.desde} → {dateRangeLoaded.hasta})
              </span>
            ) : (
              <span>Sin eventos en el filtro</span>
            )}
          </div>
        </div>

        {/* Cobros y Movimientos de Caja / Conciliación */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cobros & Conciliación</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700">{stats.cobrosCount.toLocaleString('es-VE')}</span>
            <span className="text-[11px] text-emerald-600 font-medium">operaciones</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-bold truncate mt-1">
            Bs. {stats.totalMontoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Acciones Críticas */}
        <div
          onClick={() => setFilterCrit(filterCrit === 'CRITICA' ? 'TODAS' : 'CRITICA')}
          className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
            filterCrit === 'CRITICA'
              ? 'bg-red-50 border-red-400 ring-2 ring-red-200'
              : 'bg-white border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Acciones Críticas</span>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-red-600">{stats.criticasCount.toLocaleString('es-VE')}</span>
            <span className="text-[11px] text-red-500 font-bold">sensibles</span>
          </div>
          <div className="text-[11px] text-red-600/80 mt-1">
            Tasas, ajustes, exoneraciones y créditos
          </div>
        </div>

        {/* Modificaciones Catastro / Deudas / Condominios */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">Catastro, Deudas & Condominios</span>
            <Layers className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.contribCount.toLocaleString('es-VE')}</span>
            <span className="text-[11px] text-sky-600 font-medium">cambios</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Censo, inmuebles, condominios y multas
          </div>
        </div>

        {/* Operadores Detectados */}
        <div
          onClick={() => setActiveTab(activeTab === 'usuarios' ? 'bitacora' : 'usuarios')}
          className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
            activeTab === 'usuarios'
              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
              : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Personal Auditado</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-700">{stats.operadoresActivos}</span>
            <span className="text-[11px] text-indigo-600 font-bold">ver desglose por usuario →</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate" title={usuarios.join(', ')}>
            {usuarios.slice(0, 3).join(', ')}{usuarios.length > 3 ? ` +${usuarios.length - 3}` : ''}
          </div>
        </div>
      </div>

      {/* Pestañas de Vista: Bitácora Detallada vs Resumen por Usuario */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('bitacora')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'bitacora'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Activity size={15} />
            Bitácora Detallada de Eventos ({filtered.length.toLocaleString('es-VE')})
          </button>
          <button
            onClick={() => setActiveTab('usuarios')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'usuarios'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Users size={15} />
            Resumen Estructurado por Trabajador ({resumenPorUsuario.length})
          </button>
        </div>

        {filterUser && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-800 px-3 py-1.5 rounded-lg text-xs font-bold">
            <span>Filtrando trabajador: {filterUser}</span>
            <button
              onClick={() => exportarExcel(filterUser)}
              className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px] hover:bg-emerald-700"
            >
              Descargar Excel de {filterUser}
            </button>
            <button onClick={() => setFilterUser('')} className="text-indigo-500 hover:text-indigo-800">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Barra de Filtros Multifactorial */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Búsqueda de texto */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar operador, acción, cédula, RIF, ref bancaria, inmueble..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Selector de Operador (Unificado) */}
          <div className="md:col-span-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                <option value="">Todos los trabajadores / operadores ({usuarios.length})</option>
                {usuarios.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Categoría */}
          <div className="md:col-span-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                {CATEGORIAS.map(c => (
                  <option key={c} value={c}>
                    Categoría: {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Criticidad */}
          <div className="md:col-span-2">
            <select
              value={filterCrit}
              onChange={e => setFilterCrit(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              {CRITICIDADES.map(cr => (
                <option key={cr} value={cr}>
                  {cr === 'TODAS' ? 'Criticidad: Todas' : `Nivel: ${cr}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 2: Presets de Fechas y Rango Específico */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Rango:</span>
            {[
              { id: 'all', label: 'Todo el Histórico Completo' },
              { id: 'today', label: 'Hoy' },
              { id: 'yesterday', label: 'Ayer' },
              { id: '7days', label: 'Últimos 7 días' },
              { id: 'month', label: 'Este Mes' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyDatePreset(p.id as any)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => {
                  setFilterDateFrom(e.target.value);
                  setDatePreset('all');
                }}
                className="bg-transparent text-xs text-slate-700 focus:outline-none"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => {
                  setFilterDateTo(e.target.value);
                  setDatePreset('all');
                }}
                className="bg-transparent text-xs text-slate-700 focus:outline-none"
              />
            </div>

            {(filterCat !== 'TODAS' ||
              filterCrit !== 'TODAS' ||
              filterUser ||
              filterDateFrom ||
              filterDateTo ||
              search) && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-slate-400 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <X size={14} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Resumen de conteo y paginación */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100 font-medium">
          <div>
            Auditando <span className="font-black text-slate-800">{filtered.length.toLocaleString('es-VE')}</span> registros
            (de <span className="font-semibold text-slate-600">{logs.length.toLocaleString('es-VE')}</span> cargados /{' '}
            <span className="font-semibold text-slate-600">{totalEnBd.toLocaleString('es-VE')}</span> en BD)
            {dateRangeLoaded && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold">
                Cobertura: {dateRangeLoaded.desde} al {dateRangeLoaded.hasta} ({dateRangeLoaded.dias} días)
              </span>
            )}
          </div>

          {activeTab === 'bitacora' && filtered.length > pageSize && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">
                Página <b>{currentPage}</b> de <b>{totalPages}</b>
              </span>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50"
              >
                <option value={100}>100 / pág</option>
                <option value={150}>150 / pág</option>
                <option value={300}>300 / pág</option>
                <option value={500}>500 / pág</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* CONTENIDO SEGÚN PESTAÑA ACTIVA */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center text-slate-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
          <p className="text-sm font-medium">Cargando el histórico completo de auditoría de todos los días...</p>
        </div>
      ) : activeTab === 'usuarios' ? (
        /* PESTAÑA 2: RESUMEN ESTRUCTURADO POR CADA TRABAJADOR */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-800">
                Matriz de Actividad y Operaciones por Trabajador Municipal
              </h2>
              <p className="text-xs text-slate-500">
                Haz clic en cualquier trabajador para filtrar toda su bitácora o descargar su Excel individual estructurado.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" style={{ minWidth: '1250px' }}>
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-3 py-3">Trabajador / Operador</th>
                  <th className="px-3 py-3 text-center">Días Activos</th>
                  <th className="px-3 py-3 text-center">Total Acciones</th>
                  <th className="px-3 py-3 text-right">Cobros Caja Regular</th>
                  <th className="px-3 py-3 text-right">Cobros Condominios</th>
                  <th className="px-3 py-3 text-right">Conciliaciones Aprob.</th>
                  <th className="px-3 py-3 text-center">Concil. Rech.</th>
                  <th className="px-3 py-3 text-center">Facturación / Ret.</th>
                  <th className="px-3 py-3 text-right">Notas de Crédito</th>
                  <th className="px-3 py-3 text-center">Deudas / Multas</th>
                  <th className="px-3 py-3 text-center">Condo / Catastro / Tasas</th>
                  <th className="px-3 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumenPorUsuario.map(u => (
                  <tr key={u.operador} className="hover:bg-indigo-50/40 transition-colors">
                    <td className="px-3 py-3">
                      <div className="font-black text-slate-800">{u.operador}</div>
                      <div className="text-[10px] text-slate-400">
                        {u.rol} {u.letra ? `• Caja ${u.letra}` : ''} • {formatDateVE(u.primeraFecha)} al {formatDateVE(u.ultimaFecha)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-indigo-700">{u.diasSet.size}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 font-black text-slate-800">
                        {u.totalEventos.toLocaleString('es-VE')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-emerald-700">{u.cobrosCajaCount} cobros</div>
                      {u.cobrosCajaBs > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Bs. {u.cobrosCajaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-teal-700">{u.cobrosCondoCount} cobros</div>
                      {u.cobrosCondoBs > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Bs. {u.cobrosCondoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-cyan-700">{u.conciliadosAprobCount} aprob.</div>
                      {u.conciliadosAprobBs > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Bs. {u.conciliadosAprobBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-rose-600">
                      {u.conciliadosRechCount || '-'}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-violet-700">
                      {u.facturacionRetCount || '-'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-bold text-fuchsia-700">{u.notasCreditoCount || '-'}</div>
                      {u.notasCreditoBs > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Bs. {u.notasCreditoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="font-bold text-rose-700">{u.ajustesDeudaMultasCount || '-'}</div>
                      {u.ajustesDeudaMultasBs > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Bs. {u.ajustesDeudaMultasBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-700">
                      {u.modifCondominiosCount + u.contribCatastroCount + u.tasasBcvCount || '-'}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap space-x-1.5">
                      <button
                        onClick={() => {
                          setFilterUser(u.operador);
                          setActiveTab('bitacora');
                        }}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        Ver Bitácora
                      </button>
                      <button
                        onClick={() => exportarExcel(u.operador)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        Excel Usuario
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center text-slate-400 space-y-2">
          <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
          <p className="text-base font-semibold text-slate-700">No se encontraron registros de auditoría</p>
          <p className="text-xs text-slate-400">Prueba ajustando los filtros de fecha, usuario o categoría.</p>
        </div>
      ) : (
        /* PESTAÑA 1: TABLA PRINCIPAL DE AUDITORÍA */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" style={{ minWidth: '1150px' }}>
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Fecha y Hora (VE)</th>
                  <th className="px-4 py-3.5">Trabajador / Operador</th>
                  <th className="px-4 py-3.5">Nivel</th>
                  <th className="px-4 py-3.5">Categoría</th>
                  <th className="px-4 py-3.5">Acción Ejecutada</th>
                  <th className="px-4 py-3.5">Módulo</th>
                  <th className="px-4 py-3.5">Sujeto / Inmueble / Monto / Detalle</th>
                  <th className="px-4 py-3.5 text-right">Trazabilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLogs.map((l, i) => {
                  const f = extractAuditFields(l);
                  const catStyle = CAT_COLORS[f.categoria] || CAT_COLORS.SISTEMA;
                  const critStyle = CRIT_STYLES[f.criticidad] || CRIT_STYLES.MEDIA;
                  const CritIcon = critStyle.icon;

                  return (
                    <tr
                      key={l.id || i}
                      className="hover:bg-indigo-50/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedLog(l)}
                    >
                      {/* Fecha y Hora */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800 text-[11px]">{f.fechaStr}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{f.horaStr}</div>
                      </td>

                      {/* Operador / Trabajador */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                            {(f.operadorLetra || f.operador.substring(0, 2)).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 text-xs block leading-tight">
                              {f.operador}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {f.operadorRol}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Nivel de Criticidad */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${critStyle.badge}`}
                        >
                          <CritIcon size={11} />
                          {f.criticidad}
                        </span>
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                        >
                          {f.categoria}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="px-4 py-3 font-semibold text-slate-800 max-w-[260px] leading-snug">
                        {f.accion}
                        {f.periodosUnidades && (
                          <div className="text-[10px] font-normal text-indigo-600 mt-0.5 line-clamp-1">
                            {f.periodosUnidades}
                          </div>
                        )}
                      </td>

                      {/* Módulo */}
                      <td className="px-4 py-3 text-slate-500 text-[11px] font-mono whitespace-nowrap">
                        {f.modulo}
                      </td>

                      {/* Entidad / Sujeto */}
                      <td className="px-4 py-3 max-w-[340px]">
                        <div className="flex flex-wrap gap-1 items-center">
                          {f.identidad && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[10px] font-bold">
                              {f.identidad}
                            </span>
                          )}
                          {f.codigoInmueble && (
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-mono text-[10px] font-bold">
                              {f.codigoInmueble}
                            </span>
                          )}
                          {f.contribuyente && (
                            <span className="text-[10px] font-semibold text-slate-700 truncate max-w-[220px]">
                              {f.contribuyente}
                            </span>
                          )}
                          {f.montoBs > 0 && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-black">
                              Bs. {f.montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {f.metodoPago && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">
                              {f.metodoPago}
                            </span>
                          )}
                          {f.referencia && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded font-mono text-[9px]">
                              Ref: {f.referencia}
                            </span>
                          )}
                          {f.tasaBcv > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-mono text-[10px] font-bold">
                              Tasa: {f.tasaBcv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Botón Ver Trazabilidad */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedLog(l);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-600 text-slate-600 hover:text-white border border-slate-200 hover:border-indigo-600 rounded-md text-[11px] font-bold transition-all shadow-xs cursor-pointer"
                        >
                          <Eye size={12} /> Inspeccionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Forense de Inspección de Trazabilidad */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                    Inspección Forense de Registro
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        CRIT_STYLES[getCriticidad(selectedLog)]?.badge || 'bg-slate-200'
                      }`}
                    >
                      {getCriticidad(selectedLog)}
                    </span>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    ID: {selectedLog.id || 'N/A'} • {formatDateVE(selectedLog.created_at)} {formatTimeVE(selectedLog.created_at)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Tarjeta de Metadatos Principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Operador Unificado</span>
                  <span className="font-bold text-indigo-700 text-sm">{selectedLog.usuario || 'Desconocido'}</span>
                  {selectedLog.usuario_original && selectedLog.usuario_original !== selectedLog.usuario && (
                    <span className="block text-[10px] text-slate-400">Orig: {selectedLog.usuario_original}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Categoría</span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black ${
                      CAT_COLORS[getCategoria(selectedLog)]?.bg || 'bg-slate-100'
                    } ${CAT_COLORS[getCategoria(selectedLog)]?.text || 'text-slate-800'}`}
                  >
                    {getCategoria(selectedLog)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Módulo</span>
                  <span className="font-mono text-slate-700 font-semibold truncate block">
                    {getModulo(selectedLog) || 'General'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Zona Horaria</span>
                  <span className="font-semibold text-slate-600">América/Caracas</span>
                </div>
              </div>

              {/* Acción Principal */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Acción Registrada
                </span>
                <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 text-sm">
                  {selectedLog.accion}
                </div>
              </div>

              {/* Desglose Estructurado de Detalles */}
              {(() => {
                const det = parseDetalles(selectedLog.detalles);
                const keys = Object.keys(det).filter(k => !k.startsWith('_') && k !== 'criticidad' && det[k] !== undefined);
                if (keys.length === 0) return null;

                return (
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Campos Estructurados del Evento
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                      {keys.map(k => (
                        <div key={k} className="p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                            {k.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold text-slate-800 text-xs break-all">
                            {typeof det[k] === 'object' ? JSON.stringify(det[k]) : String(det[k])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Payload JSON Crudo para Peritaje Forense */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Payload Completo Inmutable (JSON)
                  </span>
                  <button
                    onClick={() => handleCopyJson(parseDetalles(selectedLog.detalles))}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    {copiedJson ? (
                      <>
                        <Check size={12} className="text-emerald-600" /> Copiado al portapapeles
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copiar JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed border border-slate-800">
                  {JSON.stringify(parseDetalles(selectedLog.detalles), null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Firma criptográfica de sesión auditada automáticamente
              </span>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all"
              >
                Cerrar Inspección
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
