'use client';
import React, { useState, useMemo } from 'react';
import { X, ShieldAlert, AlertCircle, CheckCircle2, Lock, FileText, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, isResidencialInm, isExoneradoTotalMultas, isMesExoneradoMulta } from '@/lib/calculos';
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
  yaExoneradoPreviamente: boolean;
}

export function EliminarMultaModal({ row, inmuebles, tcmmv, recibos, onClose, onSuccess }: Props) {
  const { refreshData, refreshUserData } = useAppContext();
  const rawId = (row?.Identidad || row?.identidad || '').replace(/-/g, '').toUpperCase();
  
  // Inmuebles del contribuyente (propagando meses_deuda desde contenedores N/A hacia actividades hijas)
  const userInms = useMemo(() => {
    const rawList = inmuebles.filter((i: any) =>
      (i.identidad || '').replace(/-/g, '').toUpperCase() === rawId
    );
    const naParents = rawList.filter((i: any) => String(i.actividad_principal || '').trim().toUpperCase() === 'N/A');
    const maxParentMonths = Math.max(0, ...naParents.map((p: any) => parseInt(String(p.meses_deuda || '0'), 10)));
    const nonNa = rawList.filter((i: any) => String(i.actividad_principal || '').trim().toUpperCase() !== 'N/A');
    const baseList = nonNa.length > 0 ? nonNa : rawList;
    return baseList.map((i: any) => {
      const m = parseInt(String(i.meses_deuda || '0'), 10);
      if (m <= 0 && maxParentMonths > 0) {
        return { ...i, meses_deuda: maxParentMonths };
      }
      return i;
    });
  }, [inmuebles, rawId]);

  const rowSpecificInm = useMemo(() => {
    const direct = row?.inmueble || row?.codigo_inmueble || row?.cod_inmueble;
    if (direct) return String(direct).trim();
    const rawCod = String(row?.cod_cont || row?.CodCont || '').trim();
    const tokens = rawCod.split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && tokens[0] !== 'Pendiente' && tokens[0] !== 'N/A' && tokens[0].toUpperCase() !== rawId) {
      return tokens[0];
    }
    return '';
  }, [row, rawId]);

  const [selectedInmCode, setSelectedInmCode] = useState<string>(
    rowSpecificInm || (userInms.length > 1 ? '__TODOS__' : (userInms.length > 0 ? userInms[0].inmueble : ''))
  );

  const isTodosSelected = selectedInmCode === '__TODOS__' && userInms.length > 1;

  const activeInm = useMemo(() => {
    if (isTodosSelected) return userInms[0] || null;
    return userInms.find((i: any) => i.inmueble === selectedInmCode) || userInms[0] || null;
  }, [userInms, selectedInmCode, isTodosSelected]);

  // Lista de meses que adeuda el inmueble activo (o suma consolidada de todos los inmuebles si __TODOS__)
  const mesesAdeudados = useMemo<MonthItem[]>(() => {
    if (!activeInm) return [];
    const targetInms = isTodosSelected ? userInms : [activeInm];
    const maxMeses = Math.max(0, ...targetInms.map((inm: any) => parseInt(String(inm.meses_deuda || '0'), 10)));

    const now = new Date();
    const items: MonthItem[] = [];

    for (let i = 1; i <= Math.max(1, maxMeses); i++) {
      // De más antiguo a más reciente
      const targetDate = new Date(now.getFullYear(), now.getMonth() - maxMeses + i - 1, 1);
      const year = targetDate.getFullYear();
      const monthNum = targetDate.getMonth(); // 0-11
      const monthStr = String(monthNum + 1).padStart(2, '0');
      const key = `${year}-${monthStr}`;

      const monthName = targetDate.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }).toUpperCase();
      
      // Regla: el último mes no lleva multa (monthsDiff <= 1)
      const monthsDiff = (now.getFullYear() - year) * 12 + (now.getMonth() - monthNum);
      const isOverdue = monthsDiff > 1;

      let sumBaseBs = 0;
      let sumMultaBs = 0;
      let allExonerados = true;

      for (const inm of targetInms) {
        const inmMeses = Math.max(0, parseInt(String(inm.meses_deuda || '0'), 10));
        // Verificar si este inmueble debe este mes específico
        const debeEsteMes = monthsDiff < inmMeses;
        if (!debeEsteMes && inmMeses > 0) continue;
        const esRes = isResidencialInm(inm);
        const baseUnMes = calcularMensualidad(inm, tcmmv > 0 ? tcmmv : 1);
        const multaPorcentaje = esRes ? 0.10 : 0.12;
        const baseMultaMes = parseFloat((baseUnMes * multaPorcentaje).toFixed(2));
        const yaExoneradoTodo = isExoneradoTotalMultas(inm.notas);
        const yaExoneradoEsteMes = yaExoneradoTodo || isMesExoneradoMulta(inm.notas, key);
        if (!yaExoneradoEsteMes) allExonerados = false;
        sumBaseBs += baseUnMes;
        let multaEsteMes = (!isOverdue || yaExoneradoEsteMes) ? 0 : baseMultaMes;
        if (multaEsteMes === 0 && !yaExoneradoEsteMes && i === 1) {
          const multaGuardada = parseFloat(String(inm.multa_bs || '0')) || 0;
          if (multaGuardada > 0) {
            multaEsteMes = multaGuardada;
          }
        }
        sumMultaBs += multaEsteMes;
      }

      items.push({
        key,
        label: monthName,
        baseBs: parseFloat(sumBaseBs.toFixed(2)),
        multaBs: parseFloat(sumMultaBs.toFixed(2)),
        isOverdue: isOverdue || sumMultaBs > 0,
        yaExoneradoPreviamente: isOverdue && allExonerados
      });
    }

    return items;
  }, [activeInm, userInms, isTodosSelected, tcmmv]);

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
    const claveLimpia = clave.trim().toLowerCase();
    if (claveLimpia !== 'dzara' && claveLimpia !== 'dzara18') {
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
      const rawAllInms = inmuebles.filter((i: any) =>
        (i.identidad || '').replace(/-/g, '').toUpperCase() === rawId
      );
      const naParents = rawAllInms.filter((i: any) => String(i.actividad_principal || '').trim().toUpperCase() === 'N/A');
      const targetInms = isTodosSelected
        ? [...userInms, ...naParents.filter((p: any) => !userInms.some((u: any) => u.id === p.id))]
        : [activeInm, ...naParents.filter((p: any) => p.inmueble === activeInm.condominio_padre_id || p.inmueble === activeInm.padre_id)];
      const registroExoneracion = `[${fechaHoy} ${hora}] EXONERACIÓN DE MULTAS: Se eliminaron las multas de ${selectedMonths.length} mes(es) (${selectedMonths.join(', ')}). Motivo: ${nota.trim()} (Autorizado por: dzara)`;

      const now = new Date();
      for (const inm of targetInms) {
        let nuevaNota = (inm.notas || '').trim();
        const tagsNuevos = selectedMonths.map(k => `[EXONERADO:${k}]`);

        if (nuevaNota.startsWith('{') && nuevaNota.endsWith('}')) {
          try {
            const parsed = JSON.parse(nuevaNota);
            if (exoneroTodos) {
              parsed.exonerado_multas = 'Caso especial: Exonerado de multas';
            }
            parsed.ultima_exoneracion = `${registroExoneracion} ${tagsNuevos.join(' ')}`;
            if (!parsed.periodos_custom || typeof parsed.periodos_custom !== 'object') {
              parsed.periodos_custom = {};
            }
            for (const k of selectedMonths) {
              parsed.periodos_custom[k] = {
                ...(parsed.periodos_custom[k] || {}),
                lleva_multa: false,
                exonerar_multa: true
              };
            }
            nuevaNota = JSON.stringify(parsed);
          } catch {
            nuevaNota = `${ exoneroTodos ? 'Caso especial: Exonerado de multas\n' : '' }${nuevaNota}\n---\n${registroExoneracion}\n${tagsNuevos.join(' ')}`;
          }
        } else {
          if (nuevaNota) {
            nuevaNota += `\n---\n${registroExoneracion}`;
          } else {
            nuevaNota = registroExoneracion;
          }

          if (exoneroTodos) {
            if (!nuevaNota.includes('Caso especial: Exonerado de multas')) {
              nuevaNota = `Caso especial: Exonerado de multas\n${nuevaNota}`;
            }
          }

          const tagsExistentes = nuevaNota.match(/\[EXONERADO:\d{4}-\d{2}\]/g) || [];
          const tagsFaltantes = tagsNuevos.filter(t => !tagsExistentes.includes(t));
          if (tagsFaltantes.length > 0) {
            nuevaNota += `\n${tagsFaltantes.join(' ')}`;
          }
        }

        // Calcular multa remanente para este inmueble específico
        const inmMeses = Math.max(0, parseInt(String(inm.meses_deuda || '0'), 10));
        const esRes = isResidencialInm(inm);
        const tasaUcd = tcmmv > 0 ? tcmmv : 1;
        const baseUnMes = calcularMensualidad(inm, tasaUcd);
        const multaPorcentaje = esRes ? 0.10 : 0.12;
        const baseMultaMes = parseFloat((baseUnMes * multaPorcentaje).toFixed(2));
        const yaExoneradoTodo = isExoneradoTotalMultas(nuevaNota) || exoneroTodos;

        let nuevosMeses = 0;
        if (!yaExoneradoTodo && inmMeses > 1) {
          for (let i = 1; i <= inmMeses; i++) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() - inmMeses + i - 1, 1);
            const year = targetDate.getFullYear();
            const monthNum = targetDate.getMonth();
            const key = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
            const monthsDiff = (now.getFullYear() - year) * 12 + (now.getMonth() - monthNum);
            const isOverdue = monthsDiff > 1;
            if (isOverdue && !selectedMonths.includes(key) && !isMesExoneradoMulta(nuevaNota, key)) {
              nuevosMeses++;
            }
          }
        }

        let nuevaMultaBsInm = 0;
        if (nuevosMeses === 0 || inmMeses === 0) {
          nuevaMultaBsInm = 0;
        } else if (inmMeses > 0) {
          const unitMultaBs = baseMultaMes > 0 ? baseMultaMes : parseFloat((100 * tasaUcd).toFixed(2));
          nuevaMultaBsInm = parseFloat((nuevosMeses * unitMultaBs).toFixed(2));
        }

        const { error: errInm } = await supabase
          .from('inmuebles')
          .update({
            multa_bs: parseFloat(nuevaMultaBsInm.toFixed(2)),
            notas: nuevaNota
          })
          .eq('id', inm.id);

        if (errInm) throw errInm;

        // Sincronizar con módulo de Condominios (condominios, condominio_unidades, condominio_multas)
        try {
          const nuevosMesesMulta = (yaExoneradoTodo || nuevaMultaBsInm <= 0)
            ? 0
            : Math.max(0, Math.round(nuevaMultaBsInm / (baseMultaMes || 1)));
          const sortedSel = [...selectedMonths].sort();
          const lastSelKey = sortedSel[sortedSel.length - 1];
          const exoneradaHasta = (yaExoneradoTodo || nuevosMesesMulta === 0)
            ? '2099-12-31'
            : (lastSelKey ? `${lastSelKey}-01` : null);

          if (inm.inmueble) {
            if (nuevosMesesMulta === 0) {
              fetch('/api/admin/condominios/quitar-multas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo: inm.inmueble, usuario: 'administrador', motivo: nota.trim() })
              }).catch(() => {});
            }
            // Si el código es un condominio matriz
            const { data: cMatriz } = await supabase
              .from('condominios')
              .select('id, codigo')
              .eq('codigo', inm.inmueble)
              .maybeSingle();

            if (cMatriz) {
              await supabase
                .from('condominios')
                .update({ multa_meses: nuevosMesesMulta, multa_exonerada_hasta: exoneradaHasta })
                .eq('id', cMatriz.id);
              await supabase
                .from('condominio_unidades')
                .update({ multa_meses: nuevosMesesMulta, multa_exonerada_hasta: exoneradaHasta })
                .eq('condominio_id', cMatriz.id);
              if (nuevosMesesMulta === 0) {
                await supabase
                  .from('condominio_multas')
                  .update({ estado: 'Anulada' })
                  .eq('condominio_id', cMatriz.id)
                  .eq('estado', 'Pendiente');
              }
            }

            // Si el código es una unidad dentro de condominio_unidades
            const { data: uRows } = await supabase
              .from('condominio_unidades')
              .select('id, condominio_id')
              .eq('inmueble', inm.inmueble);

            if (uRows && uRows.length > 0) {
              const uIds = uRows.map((u: any) => u.id);
              await supabase
                .from('condominio_unidades')
                .update({ multa_meses: nuevosMesesMulta, multa_exonerada_hasta: exoneradaHasta })
                .in('id', uIds);
              if (nuevosMesesMulta === 0) {
                await supabase
                  .from('condominio_multas')
                  .update({ estado: 'Anulada' })
                  .in('unidad_id', uIds)
                  .eq('estado', 'Pendiente');
              } else if (selectedMonths.length > 0) {
                const periodosDates = selectedMonths.map(k => `${k}-01`);
                await supabase
                  .from('condominio_multas')
                  .update({ estado: 'Anulada' })
                  .in('unidad_id', uIds)
                  .in('periodo', periodosDates)
                  .eq('estado', 'Pendiente');
              }
            }
          }
        } catch (syncErr) {
          console.warn('Advertencia sincronizando exoneración con condominios:', syncErr);
        }

        // Sincronizar con pagos_reportados pendientes de facturación electrónica para que la multa eliminada no vuelva a salir
        try {
          const codInmUpper = String(inm.inmueble || '').trim().toUpperCase();
          const identInm = String(inm.identidad || row?.Identidad || row?.identidad || '').trim().toUpperCase();
          if (identInm || codInmUpper) {
            const orFilters: string[] = [];
            if (identInm) orFilters.push(`identidad.eq.${identInm}`);
            if (codInmUpper) {
              orFilters.push(`detalles->>codigo_inmueble.eq.${codInmUpper}`);
              orFilters.push(`detalles->>cod_inmueble.eq.${codInmUpper}`);
            }
            const { data: pagosRel } = await supabase
              .from('pagos_reportados')
              .select('id, detalles')
              .or(orFilters.join(','))
              .order('created_at', { ascending: false })
              .limit(30);

            const multaRem = parseFloat(nuevaMultaBsInm.toFixed(2));
            for (const pr of (pagosRel || [])) {
              let detP: any = pr.detalles || {};
              if (typeof detP === 'string') {
                try { detP = JSON.parse(detP); } catch { detP = {}; }
              }
              const yaEmitida = Boolean(detP?.factura_digital?.emitida || detP?.factura_digital?.numero_control);
              if (yaEmitida && !detP?.factura_digital?.anulada) continue;

              const recibosArr: string[] = Array.isArray(detP.recibos) ? detP.recibos.map(String) : [];
              const afectaInm = !codInmUpper ||
                String(detP.codigo_inmueble || '').toUpperCase() === codInmUpper ||
                String(detP.cod_inmueble || '').toUpperCase() === codInmUpper ||
                recibosArr.some(r => r.toUpperCase().includes(codInmUpper)) ||
                (Array.isArray(detP.deuda_previa) && detP.deuda_previa.some((dp: any) => String(dp?.inmueble || '').toUpperCase() === codInmUpper)) ||
                (Array.isArray(detP.condominio?.lineas) && detP.condominio.lineas.some((l: any) => String(l?.inmueble || '').toUpperCase() === codInmUpper));

              if (!afectaInm) continue;

              const nuevosDet = { ...detP };
              if (multaRem <= 0) {
                nuevosDet.sin_multas = true;
                nuevosDet.llevaMulta = false;
                nuevosDet.incluir_multas = false;
                nuevosDet.multa_bs = 0;
                nuevosDet.montoMulta = 0;
                nuevosDet.monto_multa = 0;
                if (Array.isArray(nuevosDet.recibos)) {
                  nuevosDet.recibos = nuevosDet.recibos.filter((r: any) => {
                    const s = String(r).toUpperCase();
                    if (!s.startsWith('MULTA-')) return true;
                    return codInmUpper ? !s.includes(codInmUpper) : false;
                  });
                }
                if (nuevosDet.montos && typeof nuevosDet.montos === 'object') {
                  for (const k of Object.keys(nuevosDet.montos)) {
                    const ku = k.toUpperCase();
                    if (ku === 'MULTA' || (ku.startsWith('MULTA-') && (!codInmUpper || ku.includes(codInmUpper)))) {
                      delete nuevosDet.montos[k];
                    }
                  }
                }
              } else {
                nuevosDet.multa_bs = multaRem;
                nuevosDet.montoMulta = multaRem;
              }

              if (Array.isArray(nuevosDet.deuda_previa)) {
                nuevosDet.deuda_previa = nuevosDet.deuda_previa.map((dp: any) => {
                  if (!dp) return dp;
                  if (!codInmUpper || String(dp.inmueble || '').toUpperCase() === codInmUpper) {
                    return { ...dp, multa_bs: multaRem };
                  }
                  return dp;
                });
              }
              if (Array.isArray(nuevosDet.condominio?.lineas)) {
                nuevosDet.condominio = {
                  ...nuevosDet.condominio,
                  lineas: nuevosDet.condominio.lineas.map((l: any) => {
                    if (!l) return l;
                    if (!codInmUpper || String(l.inmueble || '').toUpperCase() === codInmUpper) {
                      return { ...l, multaBs: multaRem };
                    }
                    return l;
                  })
                };
              }
              if (multaRem <= 0 && Array.isArray(nuevosDet.recibo_caja)) {
                nuevosDet.recibo_caja = nuevosDet.recibo_caja.map((rc: any) => {
                  if (!rc) return rc;
                  return {
                    ...rc,
                    exento: 0,
                    conceptos: Array.isArray(rc.conceptos)
                      ? rc.conceptos.filter((c: any) => !/multa|mora|sanci[oó]n/i.test(String(c?.descripcion || c?.concepto || '')))
                      : rc.conceptos
                  };
                });
              }

              await supabase.from('pagos_reportados').update({ detalles: nuevosDet }).eq('id', pr.id);
            }
          }
        } catch (syncPagosErr) {
          console.warn('Advertencia sincronizando exoneración con pagos_reportados:', syncPagosErr);
        }
      }

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
      const codigosExonerados = targetInms.map((i: any) => i.inmueble).join(', ');
      await logAudit(
        'Exoneración de Multas por Mes',
        {
          contribuyente: row.Contribuyente || row.contribuyente || row.nombre,
          identidad: row.Identidad || row.identidad,
          inmueble: codigosExonerados,
          meses_exonerados: selectedMonths,
          total_multa_eliminada_bs: totalMultaAEliminar,
          motivo: nota.trim(),
          autorizado_por: 'dzara'
        },
        'DEUDA',
        'ALTA'
      );

      // 4. Refrescar datos en memoria y caché de inmediato
      const rawIdentidad = row.Identidad || row.identidad;
      if (rawIdentidad) {
        await refreshUserData(rawIdentidad);
      }
      await refreshData(true);

      alert(`✅ Multas eliminadas exitosamente para ${selectedMonths.length} mes(es) en ${targetInms.length > 1 ? `TODOS los inmuebles (${codigosExonerados})` : `el inmueble ${activeInm.inmueble}`}.\n\nTotal exonerado: Bs. ${totalMultaAEliminar.toFixed(2)}`);
      
      if (onSuccess) await onSuccess();
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
                <option value="__TODOS__">
                  🏢 TODAS LAS UNIDADES / ACTIVIDADES ({userInms.length} inmuebles - Exoneración Masiva)
                </option>
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
                        ) : m.yaExoneradoPreviamente ? (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Exonerado previamente
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
