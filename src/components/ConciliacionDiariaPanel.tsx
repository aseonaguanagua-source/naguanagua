'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard,
  BarChart3,
  Save,
  Download,
  RefreshCw,
  CheckCircle2,
  CheckCheck,
  RotateCcw,
  Calendar,
  Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/store/AppContext';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';
import { aplicarMontoReporte } from '@/app/(admin)/admin/reportes/montoReporte';
import { generarConciliacionTransferencias } from '@/app/(admin)/admin/reportes/generators/ReportesCaja';
import { generarMontoDiarioRecaudado } from '@/app/(admin)/admin/reportes/generators/MontoDiarioRecaudado';

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const CAJAS_OFICIALES_SISTEMA: { caja: string; cajero: string; alias: string[] }[] = [
  { caja: 'CAJA A', cajero: 'ARIANNY', alias: ['arianny', 'a-arianny', 'arianny seijas', 'caja a'] },
  { caja: 'CAJA B', cajero: 'MAIRA', alias: ['maira', 'b-maira', 'maira castellano', 'caja b'] },
  { caja: 'CAJA C', cajero: 'DANIELA', alias: ['daniela', 'c-daniela', 'daniela gonzalez', 'caja c'] },
  { caja: 'CAJA D', cajero: 'OTTO', alias: ['otto', 'd-otto', 'otto schram', 'caja d'] },
  { caja: 'CAJA E', cajero: 'LUIS', alias: ['luis', 'e-luis', 'luis vivas', 'caja e'] },
  { caja: 'CAJA F', cajero: 'OMAR', alias: ['omar', 'f-omar', 'omar lopez', 'caja f'] },
  { caja: 'CAJA H', cajero: 'MARIANNY', alias: ['marianny', 'h-marianny', 'marianny orta', 'caja h'] },
  { caja: 'CAJA J', cajero: 'NANY', alias: ['nany', 'j-nany', 'nany lovera', 'caja j'] },
  { caja: 'CAJA K', cajero: 'JOHANA', alias: ['johana', 'k-johana', 'johana peña', 'johana pena', 'caja k'] },
  { caja: 'CAJA M', cajero: 'VALENTINA', alias: ['valentina', 'm-valentina', 'valentina castellanos', 'caja m'] },
  { caja: 'CAJA N', cajero: 'PATRICIA', alias: ['patricia', 'n-patricia', 'patricia povis', 'caja n'] },
  { caja: 'CAJA O', cajero: 'CARLIETH', alias: ['carlieth', 'o-carlieth', 'carlieth palencia', 'caja o'] },
  { caja: 'CAJA P', cajero: 'MARIANGEL', alias: ['mariangel', 'p-mariangel', 'mariangel adarmes', 'caja p'] },
  { caja: 'CAJA R', cajero: 'DAMARY', alias: ['damary', 'damaris', 'r-damary', 'r-damaris', 'damary viña', 'damary vina', 'caja r'] },
];

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const fmtBs = (n: number | null | undefined) => {
  const val = Number(n) || 0;
  return val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const dmy = (iso: string) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : iso;
};

const fechaVE = (d: any) => {
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};

function parseDet(p: any): any {
  if (!p?.detalles) return {};
  if (typeof p.detalles === 'object') return p.detalles;
  try { return JSON.parse(p.detalles); } catch { return {}; }
}

const esAnulado = (p: any) => {
  if (['Anulado', 'Reversado', 'Condonado', 'Rechazado', 'Por Verificar', 'Pendiente'].includes(String(p.estado || ''))) return true;
  const det = parseDet(p);
  const caj = String(det?.cajero || det?.analista || '').trim();
  if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return true;
  if (String(p.estado || '') !== 'Aprobado') return true;
  return false;
};

function isSaldoPago(p: any) {
  const t = String(p.tipo || '').toUpperCase().trim();
  const det = parseDet(p);
  if (t && !t.includes('SALDO') && !t.includes('NOTA DE CREDITO') && !t.includes('NOTA DE CRÉDITO')) {
    return false;
  }
  const paList = Array.isArray(det.pagos_agregados) ? det.pagos_agregados : [];
  if (paList.some((x: any) => x?.metodo && !String(x.metodo).toUpperCase().includes('SALDO'))) {
    return false;
  }
  const detTipo = String(det.tipo || '').toUpperCase();
  return t.includes('SALDO') || t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO') ||
         detTipo.includes('SALDO') || detTipo.includes('NOTA DE CREDITO') || detTipo.includes('NOTA DE CRÉDITO') ||
         Boolean(det.es_saldo_a_favor || det.es_nota_credito);
}

const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));
const esSaldoFavor = (p: any) => /saldo a favor|nota de cr[eé]dito/i.test(String(p.tipo || '')) || isSaldoPago(p);
const esDebito = (p: any) => !esSaldoFavor(p) && /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta/i.test(String(p.tipo || '').trim());

function parseMontoNumero(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).trim();
  if (s.includes(',') && s.includes('.')) {
    return Number(s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) || 0;
  }
  if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
  return Number(s) || 0;
}

function obtenerMontoTransfCuadre(p: any, det?: any): number {
  const d = det || parseDet(p);
  const mBase = parseMontoNumero(p?.monto);
  const mConc = parseMontoNumero(d?.monto_conciliado);
  const esMultiple = Boolean(
    d?.es_pago_adicional ||
    d?.abono_completado ||
    (Array.isArray(d?.pagos_agregados) && d.pagos_agregados.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1) ||
    (Array.isArray(d?.formasPago) && d.formasPago.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1)
  );
  if (esMultiple && mBase > 0 && mConc > mBase + 1) {
    return mBase;
  }
  if (mConc > 0 && (!Array.isArray(d?.pagos_agregados) || !d.pagos_agregados.some((x: any) => /saldo\s*a\s*favor/i.test(String(x?.referencia || x?.metodo || ''))))) {
    return mConc;
  }
  return mBase || mConc;
}

const parseFechaCaracas = (raw: any): Date | null => {
  if (!raw) return null;
  const str = String(raw).trim();
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const ymd = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    const d = new Date(`${ymd}T12:00:00-04:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?(Z|\+00:00)?)?$/i.test(str)) {
    const d = new Date(`${str.slice(0, 10)}T12:00:00-04:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const obtenerFechaEfectivaCuadre = (p: any, det: any, pagoPorId: Map<string, any>): Date => {
  const corrList = Array.isArray(det.correcciones_reporte) ? det.correcciones_reporte : [];
  const lastCorr = corrList.length > 0 ? corrList[corrList.length - 1] : null;
  const corrTieneFecha = Boolean(
    lastCorr?.fecha_nueva &&
    String(lastCorr.fecha_anterior || '').slice(0, 10) !== String(lastCorr.fecha_nueva).slice(0, 10)
  );
  if (corrTieneFecha && lastCorr?.fecha_nueva) {
    const dCorr = parseFechaCaracas(lastCorr.fecha_nueva);
    if (dCorr) return dCorr;
  }
  if (!esDebito(p)) {
    const fd = det.factura_digital || {};
    const pagoPadre = det.pago_principal_id ? pagoPorId.get(String(det.pago_principal_id)) : null;
    const detPadre = pagoPadre ? parseDet(pagoPadre) : null;
    const fdPadre = detPadre?.factura_digital || {};
    const rc0 = Array.isArray(det.recibo_caja) ? det.recibo_caja[0] : det.recibo_caja;
    const rcPadre0 = Array.isArray(detPadre?.recibo_caja) ? detPadre.recibo_caja[0] : detPadre?.recibo_caja;

    const candidatos = [
      det.fecha_emision_override,
      (fd.emitida || fd.numero_documento || fd.numero_control) ? fd.fecha_emision : '',
      detPadre?.fecha_emision_override,
      (fdPadre?.emitida || fdPadre?.numero_documento || fdPadre?.numero_control) ? fdPadre.fecha_emision : '',
      rc0?.fechaEmision,
      rcPadre0?.fechaEmision,
      det.fecha_transaccion,
      rc0?.fechaIngresoCaja,
      rcPadre0?.fechaIngresoCaja,
      det.fecha_ingreso_caja,
    ];
    for (const c of candidatos) {
      const dCand = parseFechaCaracas(c);
      if (dCand) return dCand;
    }
    const createdStr = String(p.created_at || '');
    if (createdStr.includes('T16:00:00') && det.recibo_caja_at) {
      const dReal = new Date(det.recibo_caja_at);
      if (!isNaN(dReal.getTime())) return dReal;
    }
  }
  return new Date(p.created_at);
};

const formatDiaCaracas = (d: Date, fallbackCreatedAt?: any): string => {
  try {
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
    }
  } catch {}
  return fechaVE(fallbackCreatedAt);
};

function cajaDe(det: any) {
  const raw = String(det?.cajero || det?.analista || det?.recibo_caja?.[0]?.caja || det?.usuario || '').trim();
  if (/dzara/i.test(raw)) return { caja: 'CAJA DZ', cajero: 'DZARA' };
  const rawLow = raw.toLowerCase();
  for (const c of CAJAS_OFICIALES_SISTEMA) {
    if (c.alias.includes(rawLow)) {
      return { caja: c.caja, cajero: c.cajero };
    }
  }
  const m = raw.match(/^([A-Za-z]{1,2})-(.+)$/);
  if (m) {
    const cajaKey = `CAJA ${m[1].toUpperCase()}`;
    const oficial = CAJAS_OFICIALES_SISTEMA.find(c => c.caja === cajaKey);
    return { caja: cajaKey, cajero: oficial ? oficial.cajero : m[2].toUpperCase() };
  }
  return { caja: raw ? raw.toUpperCase() : 'SIN CAJA', cajero: raw.toUpperCase() };
}

export interface CierrePosEntry {
  cierrePunto?: number | null;
  nroLote?: string;
  comisionPunto?: number | null;
  diferencia?: number | null;
  updatedAt?: string;
}

export interface ConsolidadoDiarioEntry {
  euro?: number | null;
  ucd?: number | null;
  puntoBs?: number | null;
  transfBs?: number | null;
  banescoBs?: number | null;
  bancamigaBs?: number | null;
  updatedAt?: string;
}

export default function ConciliacionDiariaPanel({
  mode,
}: {
  mode: 'puntos_venta' | 'consolidado_diario';
}) {
  const { contribuyentes, tcmmv } = useAppContext();

  const todayISO = useMemo(() => {
    const now = new Date();
    return new Date(now.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  }, []);
  const firstOfMonthISO = useMemo(() => `${todayISO.slice(0, 7)}-01`, [todayISO]);

  const [fechaInicio, setFechaInicio] = useState(firstOfMonthISO);
  const [fechaFin, setFechaFin] = useState(todayISO);
  const [filtroCaja, setFiltroCaja] = useState('TODAS');
  const [soloConMovimientos, setSoloConMovimientos] = useState(false);

  const [rawPagos, setRawPagos] = useState<any[]>([]);
  const [mapaCajas, setMapaCajas] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Datos guardados en sistema_config
  const [cierresPos, setCierresPos] = useState<Record<string, CierrePosEntry>>({});
  const [consolidadoOverrides, setConsolidadoOverrides] = useState<Record<string, ConsolidadoDiarioEntry>>({});

  // Borradores locales de edición en inputs (texto)
  const [posInputs, setPosInputs] = useState<Record<string, { cierre: string; lote: string; comision: string; diferencia: string }>>({});
  const [consInputs, setConsInputs] = useState<Record<string, { euro: string; ucd: string; puntoBs: string; transfBs: string; banescoBs: string; bancamigaBs: string }>>({});

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Cajas del sistema
      const mapa = new Map<string, string>();
      CAJAS_OFICIALES_SISTEMA.forEach(c => mapa.set(c.caja, c.cajero));
      const { data: trabs } = await supabase.from('trabajadores').select('usuario, nombre, estado, letra');
      (trabs || []).forEach((t: any) => {
        const est = String(t?.estado || 'Activo').trim().toLowerCase();
        if (['suspendido', 'eliminado', 'inactivo'].includes(est)) return;
        const letra = String(t?.letra || '').trim().toUpperCase();
        if (!letra || ['DZ', 'Z', 'X', 'Q'].includes(letra)) return;
        const cajaKey = `CAJA ${letra}`;
        if (!mapa.has(cajaKey)) {
          const nom = String(t?.nombre || t?.usuario || '').trim().split(/\s+/)[0].toUpperCase();
          mapa.set(cajaKey, nom || letra);
        }
      });
      setMapaCajas(mapa);

      // 2. Cargar configuraciones guardadas en sistema_config
      const { data: cfgRows } = await supabase
        .from('sistema_config')
        .select('id, valor')
        .in('id', ['conciliacion_puntos_venta_diaria', 'monto_diario_recaudado_diario']);

      let loadedPos: Record<string, CierrePosEntry> = {};
      let loadedCons: Record<string, ConsolidadoDiarioEntry> = {};
      (cfgRows || []).forEach((r: any) => {
        try {
          const parsed = typeof r.valor === 'string' ? JSON.parse(r.valor) : (r.valor || {});
          if (r.id === 'conciliacion_puntos_venta_diaria') loadedPos = parsed || {};
          if (r.id === 'monto_diario_recaudado_diario') loadedCons = parsed || {};
        } catch {}
      });
      setCierresPos(loadedPos);
      setConsolidadoOverrides(loadedCons);

      // 3. Cargar todos los pagos reportados frescos
      const fresh: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('pagos_reportados')
          .select('*')
          .not('estado', 'in', '(Reversado,Condonado)')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        fresh.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setRawPagos(fresh.map((p: any) => aplicarMontoReporte(p)));
    } catch (e) {
      console.error('Error cargando datos de conciliación diaria:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CÁLCULO PESTAÑA 1: CIERRE DE PUNTOS DE VENTA POR CAJA Y FECHA
  // ═══════════════════════════════════════════════════════════════════════════
  const bloquesCajasPos = useMemo(() => {
    const fIni = String(fechaInicio || '').slice(0, 10);
    const fFin = String(fechaFin || '').slice(0, 10);

    const pto = new Map<string, Map<string, { monto: number; usuarios: number; lotes: Set<string> }>>();
    mapaCajas.forEach((_cajero, cajaKey) => {
      pto.set(cajaKey, new Map());
    });

    rawPagos.forEach((p: any) => {
      if (esAnulado(p) || !esDebito(p) || esRetencion(p) || esSaldoFavor(p)) return;
      const det = parseDet(p);
      const dia = fechaVE(p.created_at);
      if (!dia || (fIni && dia < fIni) || (fFin && dia > fFin)) return;
      const { caja } = cajaDe(det);
      if (!pto.has(caja)) pto.set(caja, new Map());
      const m = pto.get(caja)!;
      if (!m.has(dia)) m.set(dia, { monto: 0, usuarios: 0, lotes: new Set() });
      const x = m.get(dia)!;
      x.monto = r2(x.monto + (Number(p.monto) || 0));
      x.usuarios += 1;
      if (det?.lote) x.lotes.add(String(det.lote).trim());
    });

    const list: {
      caja: string;
      cajero: string;
      labelHeader: string;
      dias: {
        key: string;
        dia: string;
        montoSistema: number;
        personas: number;
        loteSugerido: string;
      }[];
      totalSistemaCaja: number;
      totalPersonasCaja: number;
    }[] = [];

    [...pto.keys()].sort().forEach((caja) => {
      if (filtroCaja !== 'TODAS' && caja !== filtroCaja) return;
      const cajero = mapaCajas.get(caja) || '';
      const labelHeader = cajero ? `${caja} (${cajero})` : caja;
      const m = pto.get(caja)!;
      if (soloConMovimientos && m.size === 0) return;

      const diasArr = [...m.keys()].sort().map((dia) => {
        const x = m.get(dia)!;
        return {
          key: `${caja}|${dia}`,
          dia,
          montoSistema: r2(x.monto),
          personas: x.usuarios,
          loteSugerido: x.lotes.size > 0 ? Array.from(x.lotes).join('-') : '',
        };
      });

      const totalSistemaCaja = r2(diasArr.reduce((s, d) => s + d.montoSistema, 0));
      const totalPersonasCaja = diasArr.reduce((s, d) => s + d.personas, 0);

      list.push({
        caja,
        cajero,
        labelHeader,
        dias: diasArr,
        totalSistemaCaja,
        totalPersonasCaja,
      });
    });

    return list;
  }, [rawPagos, mapaCajas, fechaInicio, fechaFin, filtroCaja, soloConMovimientos]);

  // Inicializar inputs de POS cuando cambian los bloques o cierresPos guardados
  useEffect(() => {
    const next: Record<string, { cierre: string; lote: string; comision: string; diferencia: string }> = {};
    bloquesCajasPos.forEach((b) => {
      b.dias.forEach((d) => {
        const saved = cierresPos[d.key];
        const hasCierre = saved?.cierrePunto !== undefined && saved?.cierrePunto !== null;
        const cierreNum = hasCierre ? r2(Number(saved!.cierrePunto)) : null;
        const comNum = saved?.comisionPunto !== undefined && saved?.comisionPunto !== null
          ? r2(Number(saved.comisionPunto))
          : (cierreNum !== null ? r2(d.montoSistema - cierreNum) : null);
        const difNum = saved?.diferencia !== undefined && saved?.diferencia !== null
          ? r2(Number(saved.diferencia))
          : (cierreNum !== null && comNum !== null ? r2(Math.abs((cierreNum + comNum) - d.montoSistema)) : null);

        next[d.key] = {
          cierre: cierreNum !== null ? String(cierreNum) : '',
          lote: saved?.nroLote !== undefined ? String(saved.nroLote) : d.loteSugerido,
          comision: comNum !== null ? String(comNum) : '',
          diferencia: difNum !== null ? String(difNum) : '',
        };
      });
    });
    setPosInputs(next);
  }, [bloquesCajasPos, cierresPos]);

  const handlePosInputChange = (
    key: string,
    field: 'cierre' | 'lote' | 'comision' | 'diferencia',
    val: string,
    montoSistema: number
  ) => {
    setPosInputs((prev) => {
      const cur = prev[key] || { cierre: '', lote: '', comision: '', diferencia: '' };
      const updated = { ...cur, [field]: val };

      if (field === 'cierre') {
        const cleanVal = val.trim();
        if (cleanVal === '') {
          updated.comision = '';
          updated.diferencia = '';
        } else {
          const cNum = parseMontoNumero(cleanVal);
          const comCalc = r2(montoSistema - cNum);
          updated.comision = String(comCalc);
          updated.diferencia = String(r2(Math.abs((cNum + comCalc) - montoSistema)));
        }
      } else if (field === 'comision' && updated.cierre.trim() !== '') {
        const cNum = parseMontoNumero(updated.cierre);
        const comNum = parseMontoNumero(val);
        updated.diferencia = String(r2(Math.abs((cNum + comNum) - montoSistema)));
      }
      return { ...prev, [key]: updated };
    });
  };

  const igualarCierreAlSistema = (key: string, montoSistema: number) => {
    setPosInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { lote: '' }),
        cierre: String(r2(montoSistema)),
        comision: '0',
        diferencia: '0',
      },
    }));
  };

  const igualarTodosCierresAlSistema = () => {
    setPosInputs((prev) => {
      const next = { ...prev };
      bloquesCajasPos.forEach((b) => {
        b.dias.forEach((d) => {
          const cur = next[d.key] || { cierre: '', lote: d.loteSugerido, comision: '', diferencia: '' };
          if (!cur.cierre || cur.cierre.trim() === '') {
            next[d.key] = {
              ...cur,
              cierre: String(r2(d.montoSistema)),
              comision: '0',
              diferencia: '0',
            };
          }
        });
      });
      return next;
    });
  };

  const guardarCierresPos = async () => {
    setSaving(true);
    setSaveSuccessMsg('');
    try {
      const merged: Record<string, CierrePosEntry> = { ...cierresPos };
      const nowIso = new Date().toISOString();

      Object.entries(posInputs).forEach(([key, vals]) => {
        const hasCierre = vals.cierre.trim() !== '';
        const hasLote = vals.lote.trim() !== '';
        const hasCom = vals.comision.trim() !== '';
        const hasDif = vals.diferencia.trim() !== '';

        if (!hasCierre && !hasLote && !hasCom && !hasDif) {
          delete merged[key];
        } else {
          merged[key] = {
            cierrePunto: hasCierre ? r2(parseMontoNumero(vals.cierre)) : null,
            nroLote: vals.lote.trim(),
            comisionPunto: hasCom ? r2(parseMontoNumero(vals.comision)) : null,
            diferencia: hasDif ? r2(parseMontoNumero(vals.diferencia)) : null,
            updatedAt: nowIso,
          };
        }
      });

      const { error } = await supabase
        .from('sistema_config')
        .upsert({ id: 'conciliacion_puntos_venta_diaria', valor: JSON.stringify(merged) }, { onConflict: 'id' });
      if (error) throw error;

      setCierresPos(merged);
      setSaveSuccessMsg('¡Cierres de Punto de Venta guardados exitosamente en el sistema!');
      setTimeout(() => setSaveSuccessMsg(''), 4500);
    } catch (e: any) {
      alert('Error al guardar cierres de punto de venta: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CÁLCULO PESTAÑA 2: CONSOLIDADO DIARIO (MONTO DIARIO RECAUDADO)
  // ═══════════════════════════════════════════════════════════════════════════
  const filasConsolidadoDiario = useMemo(() => {
    const dFromStr = String(fechaInicio || '').slice(0, 10);
    const dToStr = String(fechaFin || '').slice(0, 10);

    const pagoPorId = new Map<string, any>();
    rawPagos.forEach((p) => {
      if (p?.id) pagoPorId.set(String(p.id), p);
    });

    interface DiaCalc {
      fecha: string;
      puntoBs: number;
      transfBs: number;
      banescoBs: number;
      bancamigaBs: number;
      tasasPosDia: number[];
      tasasTodasDia: number[];
    }

    const agrupado = new Map<string, DiaCalc>();
    const ensureDia = (fDia: string): DiaCalc => {
      if (!agrupado.has(fDia)) {
        agrupado.set(fDia, {
          fecha: fDia,
          puntoBs: 0,
          transfBs: 0,
          banescoBs: 0,
          bancamigaBs: 0,
          tasasPosDia: [],
          tasasTodasDia: [],
        });
      }
      return agrupado.get(fDia)!;
    };

    rawPagos.forEach((p: any) => {
      if (esAnulado(p) || esRetencion(p) || esSaldoFavor(p)) return;
      const det = parseDet(p);
      const diaCreacion = fechaVE(p.created_at);
      const rate = Number(
        det.tasa_bcv || det.tasaBcv || det.tcmmv || det.tasa || det.tasa_bcv_conciliacion || det.tasa_bcv_original || 0
      ) || 0;

      if (esDebito(p)) {
        if (!diaCreacion || (dFromStr && diaCreacion < dFromStr) || (dToStr && diaCreacion > dToStr)) return;
        const montoBs = Number(p.monto) || 0;
        if (montoBs <= 0) return;
        const diaObj = ensureDia(diaCreacion);
        diaObj.puntoBs += montoBs;
        if (rate > 10) {
          diaObj.tasasPosDia.push(r2(rate));
          diaObj.tasasTodasDia.push(r2(rate));
        }
        const bClass = clasificarBancoDestino(p);
        if (bClass === 'Bancamiga') diaObj.bancamigaBs += montoBs;
        else diaObj.banescoBs += montoBs;
      }
    });

    const pagosConMontoReporte = rawPagos.map((p: any) => aplicarMontoReporte(p));
    pagosConMontoReporte.forEach((p: any) => {
      if (esAnulado(p) || esRetencion(p) || esSaldoFavor(p) || esDebito(p)) return;
      const det = parseDet(p);
      const dEf = obtenerFechaEfectivaCuadre(p, det, pagoPorId);
      const fDia = formatDiaCaracas(dEf, p.created_at);
      if (!fDia || (dFromStr && fDia < dFromStr) || (dToStr && fDia > dToStr)) return;

      const tUpper = String(p.tipo || '').toUpperCase().trim();
      const isDeposito = tUpper.includes('DEPOSITO') || tUpper.includes('DEPÓSITO');
      const montoBs = isDeposito ? (parseFloat(p.monto) || 0) : obtenerMontoTransfCuadre(p, det);
      if (montoBs <= 0) return;

      const diaObj = ensureDia(fDia);
      diaObj.transfBs += montoBs;

      const rate = Number(
        det.tasa_bcv_conciliacion || det.tasa_bcv || det.tasaBcv || det.tcmmv || det.tasa || det.tasa_bcv_original || 0
      ) || 0;
      if (rate > 10) diaObj.tasasTodasDia.push(r2(rate));

      const bClass = clasificarBancoDestino(p);
      if (bClass === 'Bancamiga') diaObj.bancamigaBs += montoBs;
      else diaObj.banescoBs += montoBs;
    });

    Object.keys(consolidadoOverrides).forEach((dKey) => {
      if ((!dFromStr || dKey >= dFromStr) && (!dToStr || dKey <= dToStr)) {
        ensureDia(dKey);
      }
    });

    const obtenerModaTasa = (tasas: number[], fallback: number): number => {
      if (!tasas.length) return fallback;
      const counts = new Map<number, number>();
      let bestRate = tasas[0];
      let bestCount = 0;
      for (const t of tasas) {
        const k = r2(t);
        const c = (counts.get(k) || 0) + 1;
        counts.set(k, c);
        if (c > bestCount) {
          bestCount = c;
          bestRate = k;
        }
      }
      return bestRate;
    };

    const diasOrd = Array.from(agrupado.keys())
      .filter((d) => {
        const obj = agrupado.get(d)!;
        const ov = consolidadoOverrides[d];
        return r2(obj.puntoBs) > 0 || r2(obj.transfBs) > 0 || Boolean(ov);
      })
      .sort();

    let ultimaTasa = r2(tcmmv || 1007.4);

    return diasOrd.map((dia) => {
      const dData = agrupado.get(dia)!;
      const autoTasa = dData.tasasPosDia.length
        ? obtenerModaTasa(dData.tasasPosDia, ultimaTasa)
        : (dData.tasasTodasDia.length ? obtenerModaTasa(dData.tasasTodasDia, ultimaTasa) : ultimaTasa);
      ultimaTasa = autoTasa;

      const [y, mm, dd] = dia.split('-');
      const fechaCorto = `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${String(y).slice(-2)}`;
      const mesNom = MESES[(parseInt(mm, 10) || 1) - 1] || 'MES';

      return {
        dia,
        fechaCorto,
        mesNom,
        autoEuro: r2(autoTasa),
        autoUcd: r2(autoTasa),
        autoPuntoBs: r2(dData.puntoBs),
        autoTransfBs: r2(dData.transfBs),
        autoBanescoBs: 0,
        autoBancamigaBs: 0,
      };
    });
  }, [rawPagos, fechaInicio, fechaFin, tcmmv, consolidadoOverrides]);

  useEffect(() => {
    const next: Record<string, { euro: string; ucd: string; puntoBs: string; transfBs: string; banescoBs: string; bancamigaBs: string }> = {};
    filasConsolidadoDiario.forEach((f) => {
      const ov = consolidadoOverrides[f.dia];
      const hasBanOv = ov?.banescoBs !== undefined && ov?.banescoBs !== null && String(ov.banescoBs).trim() !== '';
      const hasBgaOv = ov?.bancamigaBs !== undefined && ov?.bancamigaBs !== null && String(ov.bancamigaBs).trim() !== '';
      next[f.dia] = {
        euro: String(ov?.euro !== undefined && ov?.euro !== null ? r2(Number(ov.euro)) : f.autoEuro),
        ucd: String(ov?.ucd !== undefined && ov?.ucd !== null ? r2(Number(ov.ucd)) : f.autoUcd),
        puntoBs: String(f.autoPuntoBs),
        transfBs: String(f.autoTransfBs),
        banescoBs: hasBanOv ? String(r2(Number(ov!.banescoBs))) : '',
        bancamigaBs: hasBgaOv ? String(r2(Number(ov!.bancamigaBs))) : '',
      };
    });
    setConsInputs(next);
  }, [filasConsolidadoDiario, consolidadoOverrides]);

  const handleConsInputChange = (
    dia: string,
    field: 'euro' | 'ucd' | 'puntoBs' | 'transfBs' | 'banescoBs' | 'bancamigaBs',
    val: string
  ) => {
    setConsInputs((prev) => {
      const cur = prev[dia] || { euro: '', ucd: '', puntoBs: '', transfBs: '', banescoBs: '', bancamigaBs: '' };
      const updated = { ...cur, [field]: val };
      if (field === 'euro') {
        updated.ucd = val;
      }
      return { ...prev, [dia]: updated };
    });
  };

  const restaurarDiaAutomatico = (f: typeof filasConsolidadoDiario[number]) => {
    setConsInputs((prev) => ({
      ...prev,
      [f.dia]: {
        euro: String(f.autoEuro),
        ucd: String(f.autoUcd),
        puntoBs: String(f.autoPuntoBs),
        transfBs: String(f.autoTransfBs),
        banescoBs: '',
        bancamigaBs: '',
      },
    }));
  };

  const guardarConsolidadoDiario = async () => {
    setSaving(true);
    setSaveSuccessMsg('');
    try {
      const merged: Record<string, ConsolidadoDiarioEntry> = { ...consolidadoOverrides };
      const nowIso = new Date().toISOString();

      filasConsolidadoDiario.forEach((f) => {
        const inp = consInputs[f.dia];
        if (!inp) return;
        const euroVal = r2(parseMontoNumero(inp.euro) || f.autoEuro);
        const ucdVal = r2(parseMontoNumero(inp.ucd) || euroVal);
        const hasBanInput = String(inp.banescoBs ?? '').trim() !== '';
        const hasBgaInput = String(inp.bancamigaBs ?? '').trim() !== '';
        const banescoVal = hasBanInput ? r2(parseMontoNumero(inp.banescoBs)) : null;
        const bancamigaVal = hasBgaInput ? r2(parseMontoNumero(inp.bancamigaBs)) : null;

        const isSameAsAuto =
          Math.abs(euroVal - f.autoEuro) < 0.01 &&
          Math.abs(ucdVal - f.autoUcd) < 0.01 &&
          banescoVal === null &&
          bancamigaVal === null;

        if (isSameAsAuto) {
          delete merged[f.dia];
        } else {
          merged[f.dia] = {
            euro: euroVal,
            ucd: ucdVal,
            banescoBs: banescoVal,
            bancamigaBs: bancamigaVal,
            updatedAt: nowIso,
          };
        }
      });

      const { error } = await supabase
        .from('sistema_config')
        .upsert({ id: 'monto_diario_recaudado_diario', valor: JSON.stringify(merged) }, { onConflict: 'id' });
      if (error) throw error;

      setConsolidadoOverrides(merged);
      setSaveSuccessMsg('¡Consolidado Diario (Tasas y Estados de Cuenta) guardado exitosamente!');
      setTimeout(() => setSaveSuccessMsg(''), 4500);
    } catch (e: any) {
      alert('Error al guardar Consolidado Diario: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  // Totales en vivo de la Pestaña 2 (Consolidado Diario)
  const totalesConsolidado = useMemo(() => {
    let sumPuntoBs = 0, sumPuntoEur = 0;
    let sumTransfBs = 0, sumTransfEur = 0;
    let sumBanescoBs = 0, sumBanescoEur = 0;
    let sumBancamigaBs = 0, sumBancamigaEur = 0;

    filasConsolidadoDiario.forEach((f) => {
      const inp = consInputs[f.dia];
      const tasa = r2(parseMontoNumero(inp?.euro ?? f.autoEuro)) || f.autoEuro || 1;
      const pBs = r2(parseMontoNumero(inp?.puntoBs ?? f.autoPuntoBs));
      const tBs = r2(parseMontoNumero(inp?.transfBs ?? f.autoTransfBs));
      const banBs = r2(parseMontoNumero(inp?.banescoBs ?? f.autoBanescoBs));
      const bgaBs = r2(parseMontoNumero(inp?.bancamigaBs ?? f.autoBancamigaBs));

      const pEur = tasa > 0 ? r2(pBs / tasa) : 0;
      const tEur = tasa > 0 ? r2(tBs / tasa) : 0;
      const banEur = tasa > 0 ? r2(banBs / tasa) : 0;
      const bgaEur = tasa > 0 ? r2(bgaBs / tasa) : 0;

      sumPuntoBs = r2(sumPuntoBs + pBs);
      sumPuntoEur = r2(sumPuntoEur + pEur);
      sumTransfBs = r2(sumTransfBs + tBs);
      sumTransfEur = r2(sumTransfEur + tEur);
      sumBanescoBs = r2(sumBanescoBs + banBs);
      sumBanescoEur = r2(sumBanescoEur + banEur);
      sumBancamigaBs = r2(sumBancamigaBs + bgaBs);
      sumBancamigaEur = r2(sumBancamigaEur + bgaEur);
    });

    return {
      sumPuntoBs,
      sumPuntoEur,
      sumTransfBs,
      sumTransfEur,
      sumBanescoBs,
      sumBanescoEur,
      sumBancamigaBs,
      sumBancamigaEur,
      totalConciliadoBs: r2(sumPuntoBs + sumTransfBs),
      totalConciliadoEur: r2(sumPuntoEur + sumTransfEur),
      totalCuentaGeneralBs: r2(sumBanescoBs + sumBancamigaBs),
      totalCuentaGeneralEur: r2(sumBanescoEur + sumBancamigaEur),
    };
  }, [filasConsolidadoDiario, consInputs]);

  // Exportar Excel desde la pestaña activa (guarda primero para que el Excel refleje lo que está en pantalla)
  const handleDescargarExcelPos = async () => {
    setExporting(true);
    try {
      await guardarCierresPos();
      await generarConciliacionTransferencias(rawPagos, contribuyentes || [], fechaInicio, fechaFin);
    } finally {
      setExporting(false);
    }
  };

  const handleDescargarExcelConsolidado = async () => {
    setExporting(true);
    try {
      await guardarConsolidadoDiario();
      await generarMontoDiarioRecaudado({
        pagos: rawPagos,
        fechaInicio,
        fechaFin,
        tcmmvActual: tcmmv || 1007.4,
      });
    } finally {
      setExporting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PESTAÑA 1: CIERRE DE PUNTOS DE VENTA (POR CAJA)
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'puntos_venta') {
    const granTotalSistema = r2(bloquesCajasPos.reduce((s, b) => s + b.totalSistemaCaja, 0));
    const granTotalPersonas = bloquesCajasPos.reduce((s, b) => s + b.totalPersonasCaja, 0);

    return (
      <div className="space-y-4">
        {/* Barra de controles */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Filtrar Caja</label>
              <select
                value={filtroCaja}
                onChange={(e) => setFiltroCaja(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="TODAS">Todas las Cajas</option>
                {[...mapaCajas.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cKey, cNom]) => (
                  <option key={cKey} value={cKey}>
                    {cKey} ({cNom})
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pb-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soloConMovimientos}
                onChange={(e) => setSoloConMovimientos(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Ocultar cajas en Bs. 0,00
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={cargarTodo}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={igualarTodosCierresAlSistema}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
              title="Rellena automáticamente los cierres vacíos con el Total Emitido por el Sistema"
            >
              <CheckCheck size={14} />
              Autocompletar Cierres Vacíos
            </button>
            <button
              type="button"
              onClick={guardarCierresPos}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar Cierres en Sistema'}
            </button>
            <button
              type="button"
              onClick={handleDescargarExcelPos}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              {exporting ? 'Generando Excel...' : 'Guardar y Descargar Excel'}
            </button>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Encabezado tipo planilla IAMEC */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#1F4E78] text-white px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide">
                CONCILIACIÓN DE PUNTOS DE VENTA (DÉBITO / CRÉDITO)
              </h2>
              <p className="text-[11px] text-sky-200">
                RIF: G-20008614-9 · Período: {dmy(fechaInicio)} al {dmy(fechaFin)} · Ingrese el Cierre de Punto y Nro de Lote diarios
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-sky-200 font-bold">Total General Sistema</div>
              <div className="text-base font-black text-white">Bs. {fmtBs(granTotalSistema)} ({granTotalPersonas} pers.)</div>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <RefreshCw size={20} className="animate-spin" /> Cargando operaciones de puntos de venta...
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {bloquesCajasPos.map((bloque) => {
                // Calcular subtotales en vivo de esta caja según los inputs actuales
                let sumCierreCaja = 0;
                let sumComisionCaja = 0;
                let sumDifCaja = 0;
                let tieneAlgunCierre = false;

                bloque.dias.forEach((d) => {
                  const inp = posInputs[d.key];
                  if (inp && inp.cierre.trim() !== '') {
                    tieneAlgunCierre = true;
                    sumCierreCaja = r2(sumCierreCaja + parseMontoNumero(inp.cierre));
                    sumComisionCaja = r2(sumComisionCaja + parseMontoNumero(inp.comision));
                    sumDifCaja = r2(sumDifCaja + parseMontoNumero(inp.diferencia));
                  }
                });

                return (
                  <div key={bloque.caja} className="border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#1F4E78] text-white">
                            <th className="px-3 py-2 text-left font-bold uppercase w-48 border-r border-slate-600">
                              {bloque.labelHeader}
                            </th>
                            <th className="px-3 py-2 text-center font-bold uppercase w-32 border-r border-slate-600">
                              FECHA
                            </th>
                            <th className="px-3 py-2 text-right font-bold uppercase w-48 border-r border-slate-600">
                              TOTAL EMITIDO POR EL SISTEMA
                            </th>
                            <th className="px-3 py-2 text-right font-bold uppercase w-48 border-r border-slate-600">
                              CIERRE DE PUNTO
                            </th>
                            <th className="px-3 py-2 text-center font-bold uppercase w-36 border-r border-slate-600">
                              NRO DE LOTE
                            </th>
                            <th className="px-3 py-2 text-right font-bold uppercase w-40 border-r border-slate-600">
                              COMISIÓN DEL PUNTO
                            </th>
                            <th className="px-3 py-2 text-right font-bold uppercase w-36 border-r border-slate-600">
                              DIFERENCIA
                            </th>
                            <th className="px-3 py-2 text-center font-bold uppercase w-24">
                              PERSONAS
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bloque.dias.length === 0 ? (
                            <tr className="border-b border-slate-200 text-slate-400">
                              <td className="px-3 py-2 border-r border-slate-200"></td>
                              <td className="px-3 py-2 text-center border-r border-slate-200">
                                {dmy(fechaInicio)} al {dmy(fechaFin)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono border-r border-slate-200">0,00</td>
                              <td className="px-3 py-2 border-r border-slate-200"></td>
                              <td className="px-3 py-2 border-r border-slate-200"></td>
                              <td className="px-3 py-2 border-r border-slate-200"></td>
                              <td className="px-3 py-2 border-r border-slate-200"></td>
                              <td className="px-3 py-2 text-center">0</td>
                            </tr>
                          ) : (
                            bloque.dias.map((d) => {
                              const inp = posInputs[d.key] || { cierre: '', lote: d.loteSugerido, comision: '', diferencia: '' };
                              const isSaved = Boolean(cierresPos[d.key]?.updatedAt);

                              return (
                                <tr key={d.key} className="border-b border-slate-200 hover:bg-sky-50/40">
                                  <td className="px-3 py-1.5 border-r border-slate-200">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-slate-400 font-semibold">{bloque.caja}</span>
                                      {isSaved && (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                          ✓ Guardado
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-1.5 text-center font-mono font-semibold text-slate-700 border-r border-slate-200">
                                    {dmy(d.dia)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800 border-r border-slate-200">
                                    <div className="flex items-center justify-end gap-2">
                                      <span>{fmtBs(d.montoSistema)}</span>
                                      <button
                                        type="button"
                                        onClick={() => igualarCierreAlSistema(d.key, d.montoSistema)}
                                        title="Pasar este monto a Cierre de Punto"
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-sans font-bold cursor-pointer"
                                      >
                                        → Igualar
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-2 py-1 border-r border-slate-200 bg-amber-50/30">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={inp.cierre}
                                      onChange={(e) => handlePosInputChange(d.key, 'cierre', e.target.value, d.montoSistema)}
                                      placeholder="Ej: 234939.24"
                                      className="w-full text-right font-mono text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1 border-r border-slate-200 bg-amber-50/30">
                                    <input
                                      type="text"
                                      value={inp.lote}
                                      onChange={(e) => handlePosInputChange(d.key, 'lote', e.target.value, d.montoSistema)}
                                      placeholder="Ej: 32-33"
                                      className="w-full text-center font-mono text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1 border-r border-slate-200">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={inp.comision}
                                      onChange={(e) => handlePosInputChange(d.key, 'comision', e.target.value, d.montoSistema)}
                                      placeholder="0,00"
                                      className="w-full text-right font-mono text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1 border-r border-slate-200">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={inp.diferencia}
                                      onChange={(e) => handlePosInputChange(d.key, 'diferencia', e.target.value, d.montoSistema)}
                                      placeholder="0,00"
                                      className="w-full text-right font-mono text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 text-center font-bold text-slate-700">
                                    {d.personas}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                          {/* Fila TOTAL CAJA */}
                          <tr className="bg-slate-200/80 font-bold text-slate-900">
                            <td className="px-3 py-2 border-r border-slate-300 uppercase">
                              TOTAL {bloque.caja}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-300"></td>
                            <td className="px-3 py-2 text-right font-mono border-r border-slate-300">
                              {fmtBs(bloque.totalSistemaCaja)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono border-r border-slate-300 text-blue-900">
                              {tieneAlgunCierre ? fmtBs(sumCierreCaja) : ''}
                            </td>
                            <td className="px-3 py-2 border-r border-slate-300"></td>
                            <td className="px-3 py-2 text-right font-mono border-r border-slate-300">
                              {tieneAlgunCierre ? fmtBs(sumComisionCaja) : ''}
                            </td>
                            <td className="px-3 py-2 text-right font-mono border-r border-slate-300">
                              {tieneAlgunCierre ? fmtBs(sumDifCaja) : ''}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {bloque.totalPersonasCaja}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERIZADO PESTAÑA 2: CONSOLIDADO DIARIO (MONTO DIARIO RECAUDADO)
  // ═══════════════════════════════════════════════════════════════════════════
  const primerMesLabel = filasConsolidadoDiario[0]?.mesNom || 'NOVIEMBRE';
  const anioLabel = (fechaInicio || todayISO).slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Barra de controles */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs text-slate-500 pb-1">
            Tasa BCV Vigente hoy: <b className="text-slate-800">Bs. {fmtBs(tcmmv || 1007.4)}</b>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={cargarTodo}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar del Sistema
          </button>
          <button
            type="button"
            onClick={guardarConsolidadoDiario}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar Consolidado Diario'}
          </button>
          <button
            type="button"
            onClick={handleDescargarExcelConsolidado}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download size={14} />
            {exporting ? 'Generando Excel...' : 'Guardar y Descargar Reporte Consolidado (Excel)'}
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Planilla idéntica al Excel MONTO DIARIO RECAUDADO */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-3 text-center">
          <div className="text-[11px] font-bold tracking-wider text-slate-300 uppercase">
            INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC) · RIF: G-20008614-9
          </div>
          <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-sky-300 mt-0.5">
            REPORTE CONSOLIDADO DE RECAUDACIÓN DIARIA (PUNTO DE VENTA Y TRANSFERENCIAS)
          </h2>
          <div className="text-xs font-bold text-white mt-0.5">
            MONTO DIARIO RECAUDADO · Período: {dmy(fechaInicio)} al {dmy(fechaFin)}
          </div>
        </div>

        <div className="bg-[#1F75FE] text-white text-center font-black text-xs py-1.5 border-b border-slate-300 uppercase tracking-widest">
          AÑO {anioLabel}
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw size={20} className="animate-spin" /> Calculando recaudación diaria por punto, transferencias y bancos...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-[#DCE6F1] text-slate-900 font-black text-center border-b border-slate-400">
                  <th className="px-2 py-2.5 border-r border-slate-400 w-24">MES</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-20">SEMANA / FECHA</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-28">EURO (Tasa BCV)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-28">UCD (Bs.)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-36">RECAUDADO POR PUNTO Bs.</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-32">CONCILIADO POR PUNTO EN €</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-36">CONCILIADO POR TRANSFERENCIA Y/O DEPÓSITOS (Bs)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-32">CONCILIADO POR TRANSFERENCIA Y/O DEPÓSITOS (€)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-36">RECAUDADO EN EL ESTADO DE CUENTA BANESCO (Bs)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-32">RECAUDADO EN EL ESTADO DE CUENTA BANESCO (€)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-36">RECAUDADO EN EL ESTADO DE CUENTA BANCAMIGA (Bs)</th>
                  <th className="px-2 py-2.5 border-r border-slate-400 w-32">RECAUDADO EN EL ESTADO DE CUENTA BANCAMIGA (€)</th>
                  <th className="px-2 py-2.5 w-14">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filasConsolidadoDiario.map((f, idx) => {
                  const inp = consInputs[f.dia] || {
                    euro: String(f.autoEuro),
                    ucd: String(f.autoUcd),
                    puntoBs: String(f.autoPuntoBs),
                    transfBs: String(f.autoTransfBs),
                    banescoBs: '',
                    bancamigaBs: '',
                  };

                  const tasa = r2(parseMontoNumero(inp.euro)) || f.autoEuro || 1;
                  const pBs = r2(parseMontoNumero(inp.puntoBs));
                  const tBs = r2(parseMontoNumero(inp.transfBs));
                  const banBs = r2(parseMontoNumero(inp.banescoBs));
                  const bgaBs = r2(parseMontoNumero(inp.bancamigaBs));

                  const pEur = tasa > 0 ? r2(pBs / tasa) : 0;
                  const tEur = tasa > 0 ? r2(tBs / tasa) : 0;
                  const banEur = tasa > 0 ? r2(banBs / tasa) : 0;
                  const bgaEur = tasa > 0 ? r2(bgaBs / tasa) : 0;

                  const hasOverride = Boolean(consolidadoOverrides[f.dia]);

                  return (
                    <tr key={f.dia} className="border-b border-slate-300 hover:bg-sky-50/40">
                      {idx === 0 && (
                        <td
                          rowSpan={filasConsolidadoDiario.length}
                          className="bg-[#DCE6F1] text-slate-900 font-black text-center align-middle border-r border-slate-400 px-2 text-xs tracking-wider"
                        >
                          {primerMesLabel}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-center font-mono font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <span>{f.fechaCorto}</span>
                          {hasOverride && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Editado y guardado por analista" />
                          )}
                        </div>
                      </td>
                      {/* Tasa EURO editable */}
                      <td className="px-1.5 py-1 border-r border-slate-300 bg-amber-50/20">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.euro}
                          onChange={(e) => handleConsInputChange(f.dia, 'euro', e.target.value)}
                          className="w-full text-right font-mono text-[11px] font-bold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      {/* Tasa UCD editable */}
                      <td className="px-1.5 py-1 border-r border-slate-300 bg-amber-50/20">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.ucd}
                          onChange={(e) => handleConsInputChange(f.dia, 'ucd', e.target.value)}
                          className="w-full text-right font-mono text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      {/* Punto Bs editable */}
                      <td className="px-1.5 py-1 border-r border-slate-300">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.puntoBs}
                          onChange={(e) => handleConsInputChange(f.dia, 'puntoBs', e.target.value)}
                          className="w-full text-right font-mono text-[11px] font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      {/* Punto EUR calculado */}
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-900 bg-blue-50/30 border-r border-slate-300 whitespace-nowrap">
                        {pEur > 0 ? `EUR ${fmtBs(pEur)}` : '-'}
                      </td>
                      {/* Transferencias Bs editable */}
                      <td className="px-1.5 py-1 border-r border-slate-300">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.transfBs}
                          onChange={(e) => handleConsInputChange(f.dia, 'transfBs', e.target.value)}
                          className="w-full text-right font-mono text-[11px] font-bold text-slate-900 bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      {/* Transferencias EUR calculado */}
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-900 bg-blue-50/30 border-r border-slate-300 whitespace-nowrap">
                        {tEur > 0 ? `EUR ${fmtBs(tEur)}` : '-'}
                      </td>
                      {/* Estado de Cuenta Banesco Bs editable */}
                      <td className="px-1.5 py-1 border-r border-slate-300 bg-amber-50/30">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.banescoBs}
                          placeholder="0,00"
                          onChange={(e) => handleConsInputChange(f.dia, 'banescoBs', e.target.value)}
                          className="w-full text-right font-mono text-[11px] font-bold text-emerald-950 bg-white border border-amber-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      {/* Estado de Cuenta Banesco EUR calculado */}
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-purple-900 bg-purple-50/30 border-r border-slate-300 whitespace-nowrap">
                        {banEur > 0 ? `EUR ${fmtBs(banEur)}` : '-'}
                      </td>
                      {/* Estado de Cuenta Bancamiga Bs editable */}
                      <td className="px-1.5 py-1 border-r border-slate-300 bg-amber-50/30">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={inp.bancamigaBs}
                          placeholder="0,00"
                          onChange={(e) => handleConsInputChange(f.dia, 'bancamigaBs', e.target.value)}
                          className="w-full text-right font-mono text-[11px] font-bold text-sky-950 bg-white border border-amber-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      {/* Estado de Cuenta Bancamiga EUR calculado */}
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-purple-900 bg-purple-50/30 border-r border-slate-300 whitespace-nowrap">
                        {bgaEur > 0 ? `EUR ${fmtBs(bgaEur)}` : '-'}
                      </td>
                      <td className="px-1.5 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => restaurarDiaAutomatico(f)}
                          title="Restaurar valores calculados por el sistema para este día"
                          className="p-1 text-slate-400 hover:text-blue-700 rounded hover:bg-slate-100 cursor-pointer"
                        >
                          <RotateCcw size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* FILA TOTAL */}
                <tr className="border-t-2 border-slate-500 font-black text-xs">
                  <td colSpan={4} className="px-3 py-2.5 text-center bg-slate-100 border-r border-slate-400">
                    TOTAL
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#E2EFDA] border-r border-slate-400 whitespace-nowrap">
                    Bs. {fmtBs(totalesConsolidado.sumPuntoBs)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#D9E1F2] border-r border-slate-400 whitespace-nowrap">
                    EUR {fmtBs(totalesConsolidado.sumPuntoEur)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#E2EFDA] border-r border-slate-400 whitespace-nowrap">
                    Bs. {fmtBs(totalesConsolidado.sumTransfBs)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#D9E1F2] border-r border-slate-400 whitespace-nowrap">
                    EUR {fmtBs(totalesConsolidado.sumTransfEur)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#FFF2CC] border-r border-slate-400 whitespace-nowrap">
                    Bs. {fmtBs(totalesConsolidado.sumBanescoBs)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#E4DFEC] border-r border-slate-400 whitespace-nowrap">
                    EUR {fmtBs(totalesConsolidado.sumBanescoEur)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#FFF2CC] border-r border-slate-400 whitespace-nowrap">
                    Bs. {fmtBs(totalesConsolidado.sumBancamigaBs)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono bg-[#E4DFEC] border-r border-slate-400 whitespace-nowrap">
                    EUR {fmtBs(totalesConsolidado.sumBancamigaEur)}
                  </td>
                  <td className="bg-slate-100"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* CUADRO RESUMEN INFERIOR (IDÉNTICO A LA IMAGEN 2) */}
        <div className="p-5 bg-slate-50 border-t border-slate-300 flex flex-col lg:flex-row items-start justify-between gap-6">
          <div className="w-full max-w-xl border border-slate-400 rounded overflow-hidden shadow-2xs">
            <table className="w-full text-xs border-collapse font-bold">
              <tbody>
                <tr className="bg-[#E2EFDA] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL CONCILIADO EN BOLIVARES (Bs.)</td>
                  <td className="px-4 py-2 text-right font-mono w-48">Bs. {fmtBs(totalesConsolidado.totalConciliadoBs)}</td>
                </tr>
                <tr className="bg-[#D9E1F2] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL CONCILIADO EN EURO (€)</td>
                  <td className="px-4 py-2 text-right font-mono">EUR {fmtBs(totalesConsolidado.totalConciliadoEur)}</td>
                </tr>
                <tr className="bg-[#FFF2CC] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL RECAUDADO EN CUENTA BANESCO EN BOLIVARES (Bs.)</td>
                  <td className="px-4 py-2 text-right font-mono">Bs. {fmtBs(totalesConsolidado.sumBanescoBs)}</td>
                </tr>
                <tr className="bg-[#E4DFEC] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL RECAUDADO EN CUENTA BANESCO EN EURO (€)</td>
                  <td className="px-4 py-2 text-right font-mono">EUR {fmtBs(totalesConsolidado.sumBanescoEur)}</td>
                </tr>
                <tr className="bg-[#FFF2CC] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL RECAUDADO EN CUENTA BANCAMIGA EN BOLIVARES (Bs.)</td>
                  <td className="px-4 py-2 text-right font-mono">Bs. {fmtBs(totalesConsolidado.sumBancamigaBs)}</td>
                </tr>
                <tr className="bg-[#E4DFEC] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL RECAUDADO EN CUENTA BANCAMIGA EN EURO (€)</td>
                  <td className="px-4 py-2 text-right font-mono">EUR {fmtBs(totalesConsolidado.sumBancamigaEur)}</td>
                </tr>
                <tr className="bg-[#FFF2CC] border-b border-slate-400">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL RECAUDADO EN CUENTA GENERAL EN BOLIVARES (Bs.)</td>
                  <td className="px-4 py-2 text-right font-mono">Bs. {fmtBs(totalesConsolidado.totalCuentaGeneralBs)}</td>
                </tr>
                <tr className="bg-[#E4DFEC]">
                  <td className="px-3 py-2 text-right border-r border-slate-400">TOTAL RECAUDADO EN CUENTA GENERAL EN EURO (€)</td>
                  <td className="px-4 py-2 text-right font-mono">EUR {fmtBs(totalesConsolidado.totalCuentaGeneralEur)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex-1 bg-[#D9E1F2] border border-slate-400 rounded-lg p-4 text-xs text-slate-900 font-bold leading-relaxed self-stretch flex items-center">
            NOTA IMPORTANTE: Las conciliaciones bancarias correspondientes a transferencias electrónicas se efectúan conforme a la recepción de los estados de cuenta emitidos por el IAMEC; en consecuencia, los saldos registrados están sujetos a variaciones diarias.
          </div>
        </div>
      </div>
    </div>
  );
}
