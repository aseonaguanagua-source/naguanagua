'use client';
import React, { useState, useMemo } from 'react';
import { X, ShieldAlert, AlertCircle, CheckCircle2, Lock, FileText, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, isResidencialInm } from '@/lib/calculos';
import { useAppContext } from '@/store/AppContext';

interface Props {
  row: any;
  inmuebles: any[];
  tcmmv: number;
  recibos: any[];
  onClose: () => void;
  onSuccess?: () => void;
}

interface MonthItem {
  key: string; // YYYY-MM
  label: string; // e.g. "AGOSTO 2026"
  baseBs: number;
  multaBs: number;
  isOverdue: boolean;
}

export function EliminarMultaModal({ row, inmuebles, tcmmv, recibos, onClose, onSuccess }: Props) {
  const { refreshData } = useAppContext();
  const rawId = (row?.Identidad || row?.identidad || '').replace(/-/g, '').toUpperCase();
  
  // Inmuebles del contribuyente
  const userInms = useMemo(() => {
    return inmuebles.filter((i: any) =>
      (i.identidad || '').replace(/-/g, '').toUpperCase() === rawId
    );
  }, [inmuebles, rawId]);

  const [selectedInmCode, setSelectedInmCode] = useState<string>(
    userInms.length > 0 ? userInms[0].inmueble : ''
  );

  const activeInm = useMemo(() => {
    return userInms.find((i: any) => i.inmueble === selectedInmCode) || userInms[0] || null;
  }, [userInms, selectedInmCode]);

  // Lista de meses que adeuda el inmueble activo
  const mesesAdeudados = useMemo<MonthItem[]>(() => {
    if (!activeInm) return [];
    const totalMeses = Math.max(0, parseInt(String(activeInm.meses_deuda || '0'), 10));
    const esRes = isResidencialInm(activeInm);
    const baseUnMes = calcularMensualidad(activeInm, tcmmv > 0 ? tcmmv : 1);
    const multaPorcentaje = esRes ? 0.10 : 0.12;
    const baseMultaMes = parseFloat((baseUnMes * multaPorcentaje).toFixed(2));

    const now = new Date();
    const items: MonthItem[] = [];

    // Ver si ya tiene meses exonerados en notas
    const notasStr = (activeInm.notas || '').toUpperCase();
    const yaExoneradoTodo = notasStr.includes('EXONERADO') || notasStr.includes('SIN MULTA');

    for (let i = 1; i <= Math.max(1, totalMeses); i++) {
      // De más antiguo a más reciente
      const targetDate = new Date(now.getFullYear(), now.getMonth() - totalMeses + i - 1, 1);
      const year = targetDate.getFullYear();
      const monthNum = targetDate.getMonth(); // 0-11
      const monthStr = String(monthNum + 1).padStart(2, '0');
      const key = `${year}-${monthStr}`;

      const monthName = targetDate.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }).toUpperCase();
      
      // Regla: el último mes no lleva multa (monthsDiff <= 1)
      const monthsDiff = (now.getFullYear() - year) * 12 + (now.getMonth() - monthNum);
      const isOverdue = monthsDiff > 1;

      const yaExoneradoEsteMes = yaExoneradoTodo || notasStr.includes(`[EXONERADO:${key}]`);
      const multaBs = (!isOverdue || yaExoneradoEsteMes) ? 0 : baseMultaMes;

      items.push({
        key,
        label: monthName,
        baseBs: baseUnMes,
        multaBs,
        isOverdue
      });
    }

    return items;
  }, [activeInm, tcmmv]);

  // Meses seleccionados para eliminar multa
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [clave, setClave] = useState('');
  const [nota, setNota] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Inicializar selección con los meses que tienen multa
  React.useEffect(() => {
    const conMulta = mesesAdeudados.filter(m => m.multaBs > 0).map(m => m.key);
    setSelectedMonths(conMulta);
  }, [mesesAdeudados]);

  const toggleMonth = (key: string) => {
    setSelectedMonths(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => {
    setSelectedMonths(mesesAdeudados.filter(m => m.multaBs > 0).map(m => m.key));
  };

  const deselectAll = () => {
    setSelectedMonths([]);
  };

  const totalMultaAEliminar = useMemo(() => {
    return mesesAdeudados
      .filter(m => selectedMonths.includes(m.key))
      .reduce((sum, m) => sum + m.multaBs, 0);
  }, [mesesAdeudados, selectedMonths]);

  const handleConfirm = async () => {
    setErrorMsg('');

    // Validar clave dzara
    if (clave.trim().toLowerCase() !== 'dzara') {
      setErrorMsg('Clave de autorización incorrecta. Solo personal autorizado (dzara) puede ejecutar esta acción.');
      return;
    }

    // Validar nota obligatoria
    if (!nota.trim() || nota.trim().length < 8) {
      setErrorMsg('Es OBLIGATORIO ingresar una nota de justificación detallada (mínimo 8 caracteres).');
      return;
    }

    if (selectedMonths.length === 0) {
      setErrorMsg('Debe seleccionar al menos un mes para eliminar la multa.');
      return;
    }

    if (!activeInm) {
      setErrorMsg('No se encontró el inmueble a modificar.');
      return;
    }

    setIsProcessing(true);
    try {
      const fechaHoy = new Date().toLocaleDateString('es-VE');
      const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      
      const todosLosMesesConMulta = mesesAdeudados.filter(m => m.multaBs > 0);
      const exoneroTodos = selectedMonths.length >= todosLosMesesConMulta.length;

      let nuevaNota = (activeInm.notas || '').trim();
      const registroExoneracion = `[${fechaHoy} ${hora}] EXONERACIÓN DE MULTAS: Se eliminaron las multas de ${selectedMonths.length} mes(es) (${selectedMonths.join(', ')}). Motivo: ${nota.trim()} (Autorizado por: dzara)`;

      if (nuevaNota) {
        nuevaNota += `\n---\n${registroExoneracion}`;
      } else {
        nuevaNota = registroExoneracion;
      }

      // Si se exoneraron todos los meses, marcar Caso especial: Exonerado de multas
      if (exoneroTodos) {
        if (!nuevaNota.includes('Caso especial: Exonerado de multas')) {
          nuevaNota = `Caso especial: Exonerado de multas\n${nuevaNota}`;
        }
      }

      // Guardar también tags de meses exonerados
      const tagsMeses = selectedMonths.map(k => `[EXONERADO:${k}]`).join(' ');
      nuevaNota += `\n${tagsMeses}`;

      // 1. Actualizar inmueble en Supabase
      const { error: errInm } = await supabase
        .from('inmuebles')
        .update({
          multa_bs: 0,
          notas: nuevaNota
        })
        .eq('id', activeInm.id);

      if (errInm) throw errInm;

      // 2. Si hay notas en contribuyentes, registrar también
      if (row.id) {
        const obsActual = (row.Observaciones || row.observaciones || '').trim();
        const obsNueva = obsActual ? `${obsActual}\n---\n${registroExoneracion}` : registroExoneracion;
        await supabase
          .from('contribuyentes')
          .update({ observaciones: obsNueva })
          .eq('id', row.id);
      }

      // 3. Registrar en Auditoría Municipal
      await logAudit(
        'Exoneración de Multas por Mes',
        {
          contribuyente: row.Contribuyente || row.contribuyente || row.nombre,
          identidad: row.Identidad || row.identidad,
          inmueble: activeInm.inmueble,
          meses_exonerados: selectedMonths,
          total_multa_eliminada_bs: totalMultaAEliminar,
          motivo: nota.trim(),
          autorizado_por: 'dzara'
        },
        'DEUDA',
        'ALTA'
      );

      alert(`✅ Multas eliminadas exitosamente para ${selectedMonths.length} mes(es) en el inmueble ${activeInm.inmueble}.\n\nTotal exonerado: Bs. ${totalMultaAEliminar.toFixed(2)}`);
      
      if (onSuccess) onSuccess();
      await refreshData();
      onClose();
    } catch (err: any) {
      console.error('Error al eliminar multas:', err);
      setErrorMsg('Error al registrar la exoneración: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Eliminar / Exonerar Multas</h2>
              <p className="text-xs text-slate-400">Seleccione los meses a exonerar (Requiere clave autorizada)</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {/* Info Contribuyente */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Contribuyente:</span>
              <span className="font-bold text-slate-800 text-right">{row.Contribuyente || row.contribuyente || row.nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">R.I.F / C.I:</span>
              <span className="font-mono font-bold text-slate-800">{row.Identidad || row.identidad}</span>
            </div>
          </div>

          {/* Selector de Inmueble (si tiene varios) */}
          {userInms.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Inmueble / Unidad
              </label>
              <select
                value={selectedInmCode}
                onChange={(e) => setSelectedInmCode(e.target.value)}
                className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
              >
                {userInms.map((inm: any) => (
                  <option key={inm.id || inm.inmueble} value={inm.inmueble}>
                    {inm.inmueble} - {inm.actividad_principal || 'Residencial'} ({inm.meses_deuda || 0} meses)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selector de Meses */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                Meses Adeudados ({mesesAdeudados.length})
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Seleccionar Todos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <Square className="w-3.5 h-3.5" /> Ninguno
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
              {mesesAdeudados.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Este inmueble no registra meses de mora en el padrón.
                </div>
              ) : (
                mesesAdeudados.map((m) => {
                  const isChecked = selectedMonths.includes(m.key);
                  const tieneMulta = m.multaBs > 0;

                  return (
                    <label
                      key={m.key}
                      className={`flex items-center justify-between p-2.5 text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                        isChecked ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMonth(m.key)}
                          className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                        />
                        <div>
                          <span className="font-bold text-slate-800 block">{m.label}</span>
                          <span className="text-[10px] text-slate-400">Base: Bs. {m.baseBs.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        {tieneMulta ? (
                          <span className="font-bold text-rose-600 font-mono">
                            Multa: Bs. {m.multaBs.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            Sin multa (al día)
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Resumen Total Exoneración */}
          <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-rose-900 block">Total Multas a Exonerar:</span>
              <span className="text-[11px] text-rose-700">{selectedMonths.length} mes(es) seleccionados</span>
            </div>
            <span className="text-xl font-black text-rose-600 font-mono">
              Bs. {totalMultaAEliminar.toFixed(2)}
            </span>
          </div>

          {/* Clave dzara obligatoria */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Clave de Autorización Administrador <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                placeholder="Ingrese clave autorizada (dzara)"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 font-mono"
                required
              />
            </div>
          </div>

          {/* Justificación obligatoria */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Motivo o Justificación de la Exoneración <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <textarea
                rows={2}
                placeholder="Ej. Aprobado por Resolución Municipal Nro. X / Acuerdo de pago único sin recargos..."
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                required
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <p>{errorMsg}</p>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Confirmar Exoneración'
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
