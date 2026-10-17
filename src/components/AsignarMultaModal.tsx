'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, ShieldAlert, AlertCircle, CheckCircle2, Lock, Calendar, DollarSign, Building } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, isResidencialInm, isTerrenoInm } from '@/lib/calculos';
import { formatBs, formatLocalNumberInput, parseLocalFloat, getIdentidadVariantsExact } from '@/lib/formatters';
import { useAppContext } from '@/store/AppContext';

interface AsignarMultaModalProps {
  row: any;
  inmuebles: any[];
  tcmmv: number;
  onClose: () => void;
  onSuccess?: () => void;
}

const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function fmtPeriodoLabel(key: string): string {
  if (!key) return '';
  const [y, m] = key.split('-');
  const idx = parseInt(m, 10) - 1;
  return idx >= 0 && idx < 12 ? `${MESES_NOMBRES[idx]} ${y}` : key;
}

// Genera lista de meses descendentes (desde el mes facturable actual hacia atrás 36 meses)
function generarListaMeses(): { key: string; label: string }[] {
  const lista: { key: string; label: string }[] = [];
  const now = new Date();
  // Empezar desde el mes en curso
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < 36; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MESES_NOMBRES[m]} ${y}`;
    lista.push({ key, label });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return lista;
}

export function AsignarMultaModal({ row, inmuebles, tcmmv, onClose, onSuccess }: AsignarMultaModalProps) {
  const { refreshData, refreshUserData } = useAppContext();
  const rawId = (row?.Identidad || row?.identidad || '').replace(/-/g, '').toUpperCase();
  const nombreContribuyente = row?.Contribuyente || row?.contribuyente || row?.nombre || 'Contribuyente';

  // Inmuebles pertenecientes al contribuyente
  const [inmsBD, setInmsBD] = useState<any[] | null>(null);
  const identProp = row?.Identidad || row?.identidad || '';

  useEffect(() => {
    if (!identProp) { setInmsBD([]); return; }
    supabase.from('inmuebles').select('*').in('identidad', getIdentidadVariantsExact(identProp))
      .then(({ data }) => setInmsBD((data || []).filter((i: any) => i.estado !== 'Eliminado')));
  }, [identProp]);

  const userInms = useMemo(() => {
    if (inmsBD && inmsBD.length > 0) return inmsBD;
    if (!inmuebles || inmuebles.length === 0) return [];
    const directos = inmuebles.filter((i: any) =>
      (i.identidad || '').replace(/-/g, '').toUpperCase() === rawId && i.estado !== 'Eliminado'
    );
    if (directos.length > 0) return directos;
    if (row?.inmueble) {
      const byCode = inmuebles.filter((i: any) => i.inmueble === row.inmueble);
      if (byCode.length > 0) return byCode;
    }
    return [];
  }, [inmsBD, inmuebles, rawId, row]);

  const [selectedInmCode, setSelectedInmCode] = useState<string>(
    userInms.length > 0 ? userInms[0].inmueble : (row?.inmueble || '')
  );

  useEffect(() => {
    if (userInms.length > 0 && !selectedInmCode) {
      setSelectedInmCode(userInms[0].inmueble);
    }
  }, [userInms, selectedInmCode]);

  const activeInm = useMemo(() => {
    return userInms.find((i: any) => i.inmueble === selectedInmCode) || userInms[0] || null;
  }, [userInms, selectedInmCode]);

  // Lista de meses predefinidos
  const opcionesMeses = useMemo(() => generarListaMeses(), []);

  // Período seleccionado (por defecto el mes anterior al corriente)
  const defaultPeriodo = opcionesMeses[1]?.key || opcionesMeses[0]?.key || '2026-09';
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string>(defaultPeriodo);
  const [usarMesCustom, setUsarMesCustom] = useState(false);
  const [periodoCustom, setPeriodoCustom] = useState('');

  const periodoFinal = usarMesCustom ? periodoCustom : periodoSeleccionado;
  const periodoTexto = fmtPeriodoLabel(periodoFinal);

  // Estimación de 1 mes de multa
  const esRes = activeInm ? isResidencialInm(activeInm) : false;
  const tasaMora = esRes ? 0.10 : 0.12;
  const mensualidadEstimadaBs = useMemo(() => {
    if (!activeInm) return 0;
    return calcularMensualidad(activeInm, tcmmv > 0 ? tcmmv : 1);
  }, [activeInm, tcmmv]);

  const multaEstimada1MesBs = useMemo(() => {
    return Math.round(mensualidadEstimadaBs * tasaMora * 100) / 100;
  }, [mensualidadEstimadaBs, tasaMora]);

  // Formulario
  const [montoBsStr, setMontoBsStr] = useState<string>('');
  const [concepto, setConcepto] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [clave, setClave] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Auto-ajustar concepto y sugerencia al cambiar de mes o inmueble
  useEffect(() => {
    if (periodoTexto) {
      setConcepto(`Multa por mora ${periodoTexto}`);
    }
  }, [periodoTexto]);

  useEffect(() => {
    if (multaEstimada1MesBs > 0 && !montoBsStr) {
      setMontoBsStr(multaEstimada1MesBs.toFixed(2).replace('.', ','));
    }
  }, [multaEstimada1MesBs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAplicarMultaEstimada = () => {
    if (multaEstimada1MesBs > 0) {
      setMontoBsStr(multaEstimada1MesBs.toFixed(2).replace('.', ','));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Validar clave
    const claveLimpia = clave.trim().toLowerCase();
    if (claveLimpia !== 'dzara' && claveLimpia !== 'admin') {
      setErrorMsg('Clave de autorización incorrecta. Solo administradores autorizados pueden asignar multas.');
      return;
    }

    if (!periodoFinal) {
      setErrorMsg('Debe seleccionar el mes al que corresponde la multa.');
      return;
    }

    const montoNum = parseLocalFloat(montoBsStr);
    if (!montoNum || montoNum <= 0) {
      setErrorMsg('Debe ingresar un monto válido en Bolívares.');
      return;
    }

    if (!motivo.trim() || motivo.trim().length < 5) {
      setErrorMsg('El motivo o justificación de la multa es obligatorio (mínimo 5 caracteres).');
      return;
    }

    if (!activeInm) {
      setErrorMsg('No se encontró el inmueble seleccionado.');
      return;
    }

    setIsProcessing(true);
    try {
      const fechaHoy = new Date().toLocaleDateString('es-VE');
      const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      const conceptoFinal = concepto.trim() || `Multa por mora ${periodoTexto}`;

      // 1. Obtener datos frescos del inmueble
      const { data: freshInm, error: errFetch } = await supabase
        .from('inmuebles')
        .select('id, inmueble, multa_bs, notas, condominio_padre_id, padre_id')
        .eq('id', activeInm.id)
        .single();

      if (errFetch || !freshInm) {
        throw new Error('No se pudo verificar el inmueble en la base de datos.');
      }

      const multaActual = parseFloat(String(freshInm.multa_bs || 0)) || 0;
      const nuevaMultaTotal = Math.round((multaActual + montoNum) * 100) / 100;

      const notaPrev = (freshInm.notas || '').trim();
      const registroMulta = `[${fechaHoy} ${hora}] ASIGNACIÓN DE MULTA: Período ${periodoTexto} (${periodoFinal}) - Monto Bs. ${montoNum.toFixed(2)} - Concepto: "${conceptoFinal}". Motivo: ${motivo.trim()} (Autorizado por: ${claveLimpia})`;
      const nuevaNota = notaPrev ? `${notaPrev}\n---\n${registroMulta}` : registroMulta;

      // 2. Actualizar tabla inmuebles
      const { error: errUpdateInm } = await supabase
        .from('inmuebles')
        .update({
          multa_bs: nuevaMultaTotal,
          notas: nuevaNota
        })
        .eq('id', freshInm.id);

      if (errUpdateInm) throw errUpdateInm;

      // 3. Si pertenece a un condominio, registrar también en condominio_multas
      const condoCodigo = freshInm.condominio_padre_id || (freshInm.padre_id?.startsWith('CONDO-') ? freshInm.padre_id : null);
      if (condoCodigo) {
        try {
          const { data: condoData } = await supabase
            .from('condominios')
            .select('id, codigo, nombre')
            .eq('codigo', condoCodigo)
            .maybeSingle();

          if (condoData) {
            const { data: unidadData } = await supabase
              .from('condominio_unidades')
              .select('id')
              .eq('condominio_id', condoData.id)
              .eq('inmueble', freshInm.inmueble)
              .maybeSingle();

            await supabase.from('condominio_multas').insert({
              condominio_id: condoData.id,
              unidad_id: unidadData?.id || null,
              identidad: identProp,
              concepto: conceptoFinal.toUpperCase(),
              monto_bs: montoNum,
              periodo: periodoFinal,
              estado: 'Pendiente',
              creada_por: claveLimpia
            });
          }
        } catch (errCondo) {
          console.warn('No se pudo sincronizar en condominio_multas:', errCondo);
        }
      }

      // 4. Registrar en Auditoría
      await logAudit('Asignación de multa a contribuyente', {
        identidad: identProp,
        contribuyente: nombreContribuyente,
        inmueble: freshInm.inmueble,
        periodo: periodoFinal,
        periodo_texto: periodoTexto,
        monto_bs: montoNum,
        multa_previa_bs: multaActual,
        nueva_multa_bs: nuevaMultaTotal,
        concepto: conceptoFinal,
        motivo: motivo.trim(),
        autorizado_por: claveLimpia
      }, 'DEUDA', 'ALTA');

      alert(`✅ Multa de Bs. ${formatBs(montoNum)} asignada exitosamente para el período ${periodoTexto}.\n\nInmueble: ${freshInm.inmueble}\nNueva multa acumulada: Bs. ${formatBs(nuevaMultaTotal)}.`);

      if (refreshUserData && identProp) {
        await refreshUserData(identProp);
      }
      await refreshData(true);

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al asignar la multa: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="px-6 py-4 bg-gradient-to-r from-red-600 to-rose-700 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-base tracking-tight leading-tight">Asignar Multa a Período</h2>
              <p className="text-xs text-red-100 font-medium">
                {nombreContribuyente} · {identProp}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Inmueble Selector (si tiene más de 1) */}
          {userInms.length > 1 && (
            <div>
              <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                Seleccionar Inmueble
              </label>
              <select
                value={selectedInmCode}
                onChange={e => setSelectedInmCode(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50 focus:bg-white focus:border-red-500 focus:outline-none"
              >
                {userInms.map(i => (
                  <option key={i.id || i.inmueble} value={i.inmueble}>
                    {i.inmueble} — {i.actividad_principal || i.clasificacion || 'Inmueble'} (Multa actual: Bs. {formatBs(i.multa_bs || 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selección de Mes / Período */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-red-600" />
                Período / Mes de la Multa
              </label>
              <button
                type="button"
                onClick={() => setUsarMesCustom(!usarMesCustom)}
                className="text-[11px] text-red-700 font-bold hover:underline"
              >
                {usarMesCustom ? '← Seleccionar de lista' : 'Otro mes / fecha manual'}
              </button>
            </div>

            {!usarMesCustom ? (
              <select
                value={periodoSeleccionado}
                onChange={e => setPeriodoSeleccionado(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:border-red-500 focus:outline-none"
              >
                {opcionesMeses.map(m => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.key})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="month"
                value={periodoCustom}
                onChange={e => setPeriodoCustom(e.target.value)}
                placeholder="YYYY-MM (ej: 2026-03)"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:border-red-500 focus:outline-none"
              />
            )}

            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>Período seleccionado: <b className="text-slate-800">{periodoTexto || 'No definido'}</b></span>
              <span className="text-[10px] text-slate-400 font-mono">[{periodoFinal}]</span>
            </div>
          </div>

          {/* Monto de la Multa en Bs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                Monto de la Multa (Bs.)
              </label>
              {multaEstimada1MesBs > 0 && (
                <button
                  type="button"
                  onClick={handleAplicarMultaEstimada}
                  className="text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  title="Usar 1 mensualidad de mora (10% res / 12% com)"
                >
                  Sugerir 1 mes: Bs. {formatBs(multaEstimada1MesBs)}
                </button>
              )}
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={montoBsStr}
              onChange={e => setMontoBsStr(formatLocalNumberInput(e.target.value))}
              placeholder="Ej: 1.500,00"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-black text-red-700 bg-white focus:border-red-500 focus:outline-none"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Tarifa mensual base: Bs. {formatBs(mensualidadEstimadaBs)} · Mora aplicable: {esRes ? '10%' : '12%'}
            </p>
          </div>

          {/* Concepto */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Concepto de la Multa</label>
            <input
              type="text"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              placeholder="Ej: Multa por mora Marzo 2026"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-white focus:border-red-500 focus:outline-none"
              required
            />
          </div>

          {/* Motivo Obligatorio */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Motivo o Justificación Obligatoria <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Escriba la justificación legal u operativa (se guardará en el expediente y auditoría)..."
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 bg-white focus:border-red-500 focus:outline-none resize-none"
              required
            />
          </div>

          {/* Clave de Autorización */}
          <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl space-y-1.5">
            <label className="font-bold text-red-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-red-600" />
              Clave de Autorización (dzara)
            </label>
            <input
              type="password"
              value={clave}
              onChange={e => setClave(e.target.value)}
              placeholder="Ingrese clave de administrador"
              className="w-full border border-red-200 bg-white rounded-lg px-3 py-1.5 text-xs font-mono focus:border-red-500 focus:outline-none"
              required
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isProcessing ? 'Guardando...' : 'Asignar Multa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
