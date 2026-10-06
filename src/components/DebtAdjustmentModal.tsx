'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, X, AlertCircle, Calendar, CheckSquare, Square, Building, Check, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/store/AppContext';
import { calcularMensualidad, isResidencialInm } from '@/lib/calculos';
import { logAudit } from '@/lib/audit';

interface MonthItem {
  key: string;        // '2024-01'
  label: string;      // 'ENERO 2024'
  shortLabel: string; // 'ENE 2024'
  monthName: string;  // 'Enero'
  year: number;       // 2024
  monthIndex: number; // 0-11
}

// Genera la lista de todos los meses facturables desde el inicio de la Ordenanza (Diciembre 2019)
// hasta el mes facturable actual (mes calendario anterior, ej: Septiembre 2026 en Octubre 2026)
function getAvailableDebtMonths(): MonthItem[] {
  const months: MonthItem[] = [];
  const start = new Date(2019, 11, 1); // Diciembre 2019
  const now = new Date();
  // El último mes facturable es el mes anterior al mes en curso
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const full = cur.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }).toUpperCase();
    const shortM = cur.toLocaleDateString('es-VE', { month: 'short', year: 'numeric' }).toUpperCase();
    const monthName = cur.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase().replace('.', '');
    months.push({
      key,
      label: full,
      shortLabel: shortM,
      monthName,
      year: y,
      monthIndex: m
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

export function DebtAdjustmentModal({ row, inmuebles, tcmmv, recibos, setFacturas, onClose, addAuditLog }: any) {
  const { refreshData } = useAppContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [dynamicTcmmv, setDynamicTcmmv] = useState<number>(tcmmv || 1);
  const [clave, setClave] = useState('');
  const [nota, setNota] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Modo de selección de meses: 'range' (Desde/Hasta) o 'grid' (Cuadrícula interactiva)
  const [selectionMode, setSelectionMode] = useState<'range' | 'grid'>('range');

  // Meses disponibles desde Diciembre 2019 hasta el último mes facturable
  const allMonths = useMemo(() => getAvailableDebtMonths(), []);

  // Normalizar datos del contribuyente/inmuebles
  const rowIdentidad = (row?.Identidad || row?.identidad || '').replace(/-/g, '').toUpperCase();
  const rowContribuyente = row?.Contribuyente || row?.contribuyente || row?.nombre || 'Contribuyente';

  // Inmuebles pertenecientes al contribuyente
  const misInmuebles = useMemo(() => {
    if (!inmuebles || inmuebles.length === 0) return [];
    const directos = inmuebles.filter((i: any) =>
      (i.identidad || '').replace(/-/g, '').toUpperCase() === rowIdentidad
    );
    if (directos.length > 0) return directos;

    if (row?.inmueble) {
      const byCode = inmuebles.filter((i: any) => i.inmueble === row.inmueble);
      if (byCode.length > 0) return byCode;
    }
    return [];
  }, [inmuebles, rowIdentidad, row]);

  // Selección de inmueble objetivo ('ALL' para todos, o código de inmueble específico)
  const [targetInmCode, setTargetInmCode] = useState<string>('ALL');

  // Inmueble representativo para calcular la tarifa mensual
  const activeInm = useMemo(() => {
    if (targetInmCode !== 'ALL') {
      return misInmuebles.find((i: any) => i.inmueble === targetInmCode) || misInmuebles[0];
    }
    return misInmuebles[0] || null;
  }, [misInmuebles, targetInmCode]);

  // Inicializar meses seleccionados con la deuda actual del inmueble o contribuyente
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [rangeStartKey, setRangeStartKey] = useState<string>(allMonths[0]?.key || '2019-12');
  const [rangeEndKey, setRangeEndKey] = useState<string>(allMonths[allMonths.length - 1]?.key || '2026-09');

  useEffect(() => {
    // Obtener tasa BCV actualizada
    fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.tcmmv) setDynamicTcmmv(data.tcmmv);
      })
      .catch(console.error);

    // Calcular meses de deuda que ya tiene registrados
    const currentMonthsCount = Math.max(
      0,
      parseInt(String(activeInm?.meses_deuda || row?.meses_deuda || row?.MesesDeuda || 0), 10)
    );

    if (currentMonthsCount > 0 && allMonths.length > 0) {
      // Tomar los últimos N meses disponibles
      const preselected = allMonths.slice(-currentMonthsCount).map(m => m.key);
      setSelectedMonths(preselected);
      if (preselected.length > 0) {
        setRangeStartKey(preselected[0]);
        setRangeEndKey(preselected[preselected.length - 1]);
      }
    } else if (allMonths.length > 0) {
      // Por defecto seleccionar el último año (últimos 12 meses)
      const last12 = allMonths.slice(-12).map(m => m.key);
      setSelectedMonths(last12);
      setRangeStartKey(last12[0]);
      setRangeEndKey(last12[last12.length - 1]);
    }
  }, [activeInm, row, allMonths]);

  // Manejador del rango Desde - Hasta
  const applyRangeSelection = (startK: string, endK: string) => {
    const startIdx = allMonths.findIndex(m => m.key === startK);
    const endIdx = allMonths.findIndex(m => m.key === endK);
    if (startIdx === -1 || endIdx === -1) return;

    const fromIdx = Math.min(startIdx, endIdx);
    const toIdx = Math.max(startIdx, endIdx);
    const rangeKeys = allMonths.slice(fromIdx, toIdx + 1).map(m => m.key);
    setSelectedMonths(rangeKeys);
  };

  const handleStartChange = (newStart: string) => {
    setRangeStartKey(newStart);
    applyRangeSelection(newStart, rangeEndKey);
  };

  const handleEndChange = (newEnd: string) => {
    setRangeEndKey(newEnd);
    applyRangeSelection(rangeStartKey, newEnd);
  };

  // Presets de selección rápida
  const selectPreset = (count: number) => {
    if (count <= 0) {
      setSelectedMonths([]);
      return;
    }
    const chosen = allMonths.slice(-count).map(m => m.key);
    setSelectedMonths(chosen);
    if (chosen.length > 0) {
      setRangeStartKey(chosen[0]);
      setRangeEndKey(chosen[chosen.length - 1]);
    }
  };

  // Toggle de un mes individual en la cuadrícula
  const toggleMonth = (key: string) => {
    setSelectedMonths(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Toggle año completo
  const toggleYear = (year: number) => {
    const yearKeys = allMonths.filter(m => m.year === year).map(m => m.key);
    const allSelected = yearKeys.every(k => selectedMonths.includes(k));
    if (allSelected) {
      setSelectedMonths(prev => prev.filter(k => !yearKeys.includes(k)));
    } else {
      setSelectedMonths(prev => Array.from(new Set([...prev, ...yearKeys])));
    }
  };

  // Agrupación de meses por año para la cuadrícula
  const monthsByYear = useMemo(() => {
    const groups: { [year: number]: MonthItem[] } = {};
    allMonths.forEach(m => {
      if (!groups[m.year]) groups[m.year] = [];
      groups[m.year].push(m);
    });
    // Años descendentes (2026, 2025, 2024...)
    return Object.entries(groups)
      .map(([yr, mList]) => ({ year: parseInt(yr), months: mList }))
      .sort((a, b) => b.year - a.year);
  }, [allMonths]);

  // Cálculos financieros en tiempo real
  const financialSummary = useMemo(() => {
    const count = selectedMonths.length;
    if (!activeInm || count === 0) {
      return {
        tarifaMensual: 0,
        baseTotal: 0,
        multaTotal: 0,
        totalGeneral: 0,
        periodoTexto: 'Sin meses seleccionados (Solvente)'
      };
    }

    const esRes = isResidencialInm(activeInm);
    const bMes = calcularMensualidad(activeInm, dynamicTcmmv);
    const tasaMora = esRes ? 0.10 : 0.12;

    // Regla: si hay más de 1 mes, el último no lleva multa
    const mesesConMora = Math.max(0, count - 1);

    const baseTotal = Math.round((bMes * count) * 100) / 100;
    const multaTotal = Math.round(((bMes * tasaMora) * mesesConMora) * 100) / 100;
    const ivaTotal = esRes ? 0 : Math.round(((bMes * 0.16) * count) * 100) / 100;
    const totalGeneral = baseTotal + multaTotal + ivaTotal;

    // Determinar etiqueta del período
    const sortedKeys = [...selectedMonths].sort();
    const firstM = allMonths.find(m => m.key === sortedKeys[0]);
    const lastM = allMonths.find(m => m.key === sortedKeys[sortedKeys.length - 1]);
    const periodoTexto = (firstM && lastM)
      ? `${firstM.label} a ${lastM.label} (${count} meses)`
      : `${count} meses`;

    return {
      tarifaMensual: Math.round(bMes * 100) / 100,
      baseTotal,
      multaTotal,
      totalGeneral,
      periodoTexto
    };
  }, [selectedMonths, activeInm, dynamicTcmmv, allMonths]);

  // Guardar deuda ajustada
  const handleSaveDebt = async () => {
    setErrorMsg('');

    // Validación de clave autorizada
    const claveLimpia = clave.trim().toLowerCase();
    if (claveLimpia !== 'dzara' && claveLimpia !== 'admin') {
      setErrorMsg('Clave de autorización incorrecta. Ingrese "dzara" o clave de administrador.');
      return;
    }

    if (!nota.trim() || nota.trim().length < 5) {
      setErrorMsg('Por favor ingrese un motivo o justificación obligatoria para este ajuste.');
      return;
    }

    setIsProcessing(true);
    try {
      const selectedCount = selectedMonths.length;
      const targetInms = targetInmCode === 'ALL'
        ? misInmuebles
        : misInmuebles.filter((i: any) => i.inmueble === targetInmCode);

      if (targetInms.length === 0 && row?.id) {
        // En caso de que se haya pasado un inmueble individual directamente como row
        targetInms.push(row);
      }

      if (targetInms.length === 0) {
        throw new Error('No se encontraron inmuebles asociados para actualizar.');
      }

      const fechaHoy = new Date().toLocaleDateString('es-VE');
      const registroNota = `[${fechaHoy}] AJUSTE DE DEUDA: Asignados ${selectedCount} meses (${financialSummary.periodoTexto}). Total estimado: Bs. ${financialSummary.totalGeneral.toFixed(2)}. Motivo: ${nota.trim()} (Autorizado por: ${claveLimpia})`;

      // Respaldo de los valores anteriores (para auditoría y posible reverso)
      const valoresPrevios = targetInms.map((i: any) => ({
        inmueble: i.inmueble, meses_deuda: i.meses_deuda, deuda_mmv: i.deuda_mmv,
        multa_bs: i.multa_bs, deuda_congelada_bs: i.deuda_congelada_bs,
      }));

      for (const inm of targetInms) {
        const mmvMes = parseFloat(inm.mmv_mes || '0');
        const nuevaDeudaMmv = parseFloat((selectedCount * mmvMes).toFixed(5));

        const notaPrev = (inm.notas || '').trim();
        const nuevaNota = notaPrev ? `${notaPrev}\n---\n${registroNota}` : registroNota;

        const updateData: any = {
          meses_deuda: selectedCount,
          deuda_mmv: nuevaDeudaMmv,
          notas: nuevaNota
        };

        if (selectedCount === 0) {
          updateData.multa_bs = 0;
          updateData.deuda_congelada_bs = 0;
        }

        const { error: errInm } = await supabase
          .from('inmuebles')
          .update(updateData)
          .eq('id', inm.id);

        if (errInm) throw errInm;

        // Si pertenece a un condominio padre, sincronizar padre
        if (inm.condominio_padre_id) {
          const { data: hermanos } = await supabase
            .from('inmuebles')
            .select('deuda_mmv, meses_deuda')
            .eq('condominio_padre_id', inm.condominio_padre_id);

          if (hermanos) {
            const totalHermanosMmv = hermanos.reduce((sum, h) => sum + parseFloat(h.deuda_mmv || '0'), 0);
            const maxMesesHermanos = hermanos.reduce((max, h) => Math.max(max, parseInt(h.meses_deuda || '0')), 0);
            await supabase
              .from('inmuebles')
              .update({
                deuda_mmv: parseFloat(totalHermanosMmv.toFixed(5)),
                meses_deuda: maxMesesHermanos
              })
              .eq('inmueble', inm.condominio_padre_id);
          }
        }
      }

      // Limpieza de facturas pendientes: SOLO del contribuyente (por cédula) y, si se ajustó un inmueble,
      // solo las de ese inmueble (nunca por nombre, que puede repetirse entre contribuyentes).
      if (rowIdentidad) {
        try {
          let q = supabase.from('facturas').delete().eq('identidad', rowIdentidad).eq('estado', 'Pendiente');
          if (targetInmCode !== 'ALL' && targetInms.length === 1 && targetInms[0]?.inmueble) {
            q = q.like('referencia', `%${targetInms[0].inmueble}%`);
          }
          const { error: errDel } = await q;
          if (errDel) console.warn('Limpieza de facturas pendientes omitida:', errDel.message);
        } catch (fErr) {
          console.warn('Limpieza de facturas pendientes omitida o no requerida:', fErr);
        }
      }

      // Registro de Auditoría (con valores anteriores y nuevos)
      await logAudit('Ajuste de deuda (meses)', {
        identidad: rowIdentidad,
        contribuyente: rowContribuyente,
        inmuebles: targetInms.map((i: any) => i.inmueble),
        meses_nuevos: selectedCount,
        periodo: financialSummary.periodoTexto,
        total_estimado_bs: financialSummary.totalGeneral,
        valores_previos: valoresPrevios,
        motivo: nota.trim(),
        autorizado_por: claveLimpia,
      }, 'DEUDA', 'CRITICA');
      if (addAuditLog) {
        await addAuditLog(
          'AJUSTAR_DEUDA_MESES',
          `Deuda ajustada a ${selectedCount} meses para ${rowContribuyente}. Motivo: ${nota.trim()}`
        );
      }

      await refreshData(true);
      alert(`✅ Deuda actualizada exitosamente a ${selectedCount} meses.\n\nPeríodo: ${financialSummary.periodoTexto}.\nLos cambios ya se reflejan en Caja y Estado de Cuenta.`);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al guardar la deuda: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 my-auto flex flex-col max-h-[94vh]">
        {/* Cabecera */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 sm:p-5 flex items-center justify-between text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/20 rounded-xl border border-orange-500/30 text-orange-400">
              <Calculator className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg tracking-tight">Seleccionar Meses de Deuda</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {rowContribuyente} <span className="text-slate-400">({rowIdentidad || 'Sin Documento'})</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con Scroll */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Selector de Inmueble si tiene varios */}
          {misInmuebles.length > 1 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-3.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>Aplicar Deuda a:</span>
              </label>
              <select
                value={targetInmCode}
                onChange={e => setTargetInmCode(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:border-orange-500 outline-none"
              >
                <option value="ALL">✓ Todos los Inmuebles ({misInmuebles.length} registros)</option>
                {misInmuebles.map((inm: any) => (
                  <option key={inm.id} value={inm.inmueble}>
                    {inm.inmueble} — {inm.actividad_principal || inm.tipo || 'Inmueble'} ({inm.meses_deuda || 0} meses actuales)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Botones de Selección Rápida */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                Selección Rápida de Períodos
              </span>
              <span className="text-xs font-black text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
                {selectedMonths.length} meses seleccionados
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => selectPreset(allMonths.length)}
                className="text-[11px] font-bold bg-orange-100 hover:bg-orange-200 text-orange-900 px-2.5 py-2 rounded-lg transition-colors border border-orange-200 text-center"
              >
                Toda la Ordenanza ({allMonths.length} m)
              </button>
              <button
                type="button"
                onClick={() => selectPreset(24)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-2 rounded-lg transition-colors border border-slate-200 text-center"
              >
                Últimos 24 meses (2 años)
              </button>
              <button
                type="button"
                onClick={() => selectPreset(12)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-2 rounded-lg transition-colors border border-slate-200 text-center"
              >
                Últimos 12 meses (1 año)
              </button>
              <button
                type="button"
                onClick={() => selectPreset(6)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-2 rounded-lg transition-colors border border-slate-200 text-center"
              >
                Últimos 6 meses
              </button>
              <button
                type="button"
                onClick={() => selectPreset(3)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-2 rounded-lg transition-colors border border-slate-200 text-center"
              >
                Últimos 3 meses
              </button>
              <button
                type="button"
                onClick={() => selectPreset(1)}
                className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-2 rounded-lg transition-colors border border-slate-200 text-center"
              >
                Último mes (1 mes)
              </button>
              <button
                type="button"
                onClick={() => selectPreset(0)}
                className="text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2.5 py-2 rounded-lg transition-colors border border-emerald-200 col-span-2 text-center"
              >
                ✕ Solvente / 0 Meses
              </button>
            </div>
          </div>

          {/* Pestañas de Modo de Selección */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-100 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectionMode('range')}
                className={`flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5 transition-colors ${
                  selectionMode === 'range'
                    ? 'bg-white text-orange-600 border-b-2 border-orange-500 shadow-2xs font-black'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Por Rango (Desde / Hasta)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('grid')}
                className={`flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5 transition-colors ${
                  selectionMode === 'grid'
                    ? 'bg-white text-orange-600 border-b-2 border-orange-500 shadow-2xs font-black'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Meses Específicos (Cuadrícula)</span>
              </button>
            </div>

            <div className="p-4 bg-white">
              {/* MODO 1: Selector Por Rango */}
              {selectionMode === 'range' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                        Desde:
                      </label>
                      <select
                        value={rangeStartKey}
                        onChange={e => handleStartChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:border-orange-500 outline-none"
                      >
                        {allMonths.map(m => (
                          <option key={`start-${m.key}`} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                        Hasta:
                      </label>
                      <select
                        value={rangeEndKey}
                        onChange={e => handleEndChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:border-orange-500 outline-none"
                      >
                        {allMonths.map(m => (
                          <option key={`end-${m.key}`} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-orange-50/70 border border-orange-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-orange-900">Período calculado:</span>
                    <span className="font-black text-orange-700">{financialSummary.periodoTexto}</span>
                  </div>
                </div>
              )}

              {/* MODO 2: Cuadrícula de Meses Interactiva */}
              {selectionMode === 'grid' && (
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {monthsByYear.map(({ year, months }) => {
                    const allSelectedThisYear = months.every(m => selectedMonths.includes(m.key));
                    const someSelectedThisYear = months.some(m => selectedMonths.includes(m.key));

                    return (
                      <div key={year} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-black text-slate-800 text-xs">Año {year}</span>
                          <button
                            type="button"
                            onClick={() => toggleYear(year)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                              allSelectedThisYear
                                ? 'bg-orange-600 text-white'
                                : someSelectedThisYear
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {allSelectedThisYear ? '✓ Año Completo' : 'Marcar Todo'}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                          {months.map(m => {
                            const isChecked = selectedMonths.includes(m.key);
                            return (
                              <button
                                key={m.key}
                                type="button"
                                onClick={() => toggleMonth(m.key)}
                                className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                  isChecked
                                    ? 'bg-orange-500 text-white border-orange-600 shadow-2xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300 hover:bg-orange-50/30'
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                <span>{m.monthName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tarjeta de Resumen Financiero en Vivo */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200 shadow-inner space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-600">Tarifa Mensual Ordenanza:</span>
              <span className="font-bold text-slate-900">Bs. {financialSummary.tarifaMensual.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-600">Base Imponible ({selectedMonths.length} meses):</span>
              <span className="font-bold text-slate-900">Bs. {financialSummary.baseTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-600">Recargos por Mora Estimados (10% / 12%):</span>
              <span className="font-bold text-rose-600">Bs. {financialSummary.multaTotal.toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-orange-200/80 flex justify-between items-center">
              <span className="text-xs font-black text-orange-950 uppercase tracking-wide">
                Total Deuda a Registrar:
              </span>
              <span className="text-xl font-black text-orange-600">
                Bs. {financialSummary.totalGeneral.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Clave de Autorización y Justificación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Clave de Autorización <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                placeholder="Ingrese dzara o admin"
                value={clave}
                onChange={e => setClave(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-orange-500 font-mono bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Motivo / Justificación <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej: Actualización censo / asignación período fiscal"
                value={nota}
                onChange={e => setNota(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-orange-500 bg-white"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <p className="font-semibold">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Pie Fijo con Botones */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold py-2.5 rounded-xl text-xs sm:text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveDebt}
            disabled={isProcessing}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-black py-2.5 rounded-xl text-xs sm:text-sm transition-colors shadow-md shadow-orange-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Aplicar {selectedMonths.length} Meses de Deuda</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
