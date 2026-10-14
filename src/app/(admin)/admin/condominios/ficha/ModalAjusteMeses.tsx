'use client';

import React, { useState, useMemo } from 'react';
import { X, Calendar, Sliders, Check, Ban, Sparkles, AlertCircle, Save } from 'lucide-react';
import { ordenanzaData } from '@/data/ordenanza';
import { actividadConNivel, nivelActividad, quitarNivelActividad, resolverFOComercial } from '@/lib/calculos';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NIVELES = ['Baja', 'Media', 'Alta'];
const COMERCIALES: string[] = ordenanzaData.actividadesComerciales.map((a: any) => a.label);

function fmtPeriodo(p: string) {
  if (!p) return '';
  const [y, m] = p.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const n = parseInt(m, 10);
  return `${meses[(n - 1) % 12]} ${y}`;
}

export default function ModalAjusteMeses({
  condo,
  unidad,
  renglon,
  tasa,
  usuario,
  onClose,
  onSaved,
}: {
  condo: any;
  unidad: any;
  renglon: any;
  tasa: number;
  usuario: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const periodos: string[] = renglon?.periodos || [];
  const esRes = !!renglon?.residencial;
  const factor = esRes ? 0.04 : 0.128;
  const tMulta = esRes ? 0.10 : 0.12;

  // Estado inicial por cada periodo
  const [mesesConfig, setMesesConfig] = useState<Record<string, {
    actividad: string;
    nivel: number;
    tarifa_mmv: number;
    lleva_multa: boolean;
  }>>(() => {
    const init: Record<string, any> = {};
    const existing = unidad?.periodos_custom || {};

    periodos.forEach((p, idx) => {
      if (existing[p]) {
        init[p] = {
          actividad: existing[p].actividad || unidad.actividad || 'COMERCIAL',
          nivel: existing[p].nivel ?? 1,
          tarifa_mmv: existing[p].tarifa_mmv ?? 3.77,
          lleva_multa: existing[p].lleva_multa !== false,
        };
      } else {
        // Por defecto según unidad o si estuvo desocupado
        let act = unidad.actividad || 'COMERCIAL';
        let nivel = nivelActividad(act);
        let mmv = unidad.tarifa_mmv ?? 3.77;

        if (unidad.desocupada_desde && p >= unidad.desocupada_desde && (!unidad.desocupada_hasta || p <= unidad.desocupada_hasta)) {
          act = 'INMUEBLES DESOCUPADOS';
          nivel = 1;
          mmv = Number(unidad.tarifa_desocupada_mmv) || 1.98;
        } else if (unidad.tarifa_activa_mmv) {
          act = unidad.actividad_activa || act;
          nivel = nivelActividad(act);
          mmv = Number(unidad.tarifa_activa_mmv) || 3.77;
        }

        const esUltimo = idx === periodos.length - 1;
        const exoneradaCondo = unidad.multa_exonerada_hasta && p <= String(unidad.multa_exonerada_hasta).slice(0, 7);
        const llevaMulta = !esUltimo && !exoneradaCondo;

        init[p] = {
          actividad: act,
          nivel,
          tarifa_mmv: Number(mmv) || 1.98,
          lleva_multa: llevaMulta,
        };
      }
    });
    return init;
  });

  // Rango para cambios por lote
  const [rangoDesde, setRangoDesde] = useState(periodos[0] || '');
  const [rangoHasta, setRangoHasta] = useState(periodos[periodos.length - 1] || '');
  const [rangoAct, setRangoAct] = useState(COMERCIALES[0] || 'LUNCHERIAS');
  const [rangoNivel, setRangoNivel] = useState(1);
  const [rangoTarifa, setRangoTarifa] = useState('3.77');
  const [rangoMulta, setRangoMulta] = useState(true);

  const [motivo, setMotivo] = useState('Ajuste de actividades económicas y multas por mes');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Actualizar tarifa sugerida del rango cuando cambia actividad o nivel del rango
  const handleRangoActChange = (nuevaAct: string, nuevoNivel: number) => {
    setRangoAct(nuevaAct);
    setRangoNivel(nuevoNivel);
    const nom = actividadConNivel(nuevaAct.trim().toUpperCase(), nuevoNivel);
    const fo = resolverFOComercial(nom);
    if (fo != null) setRangoTarifa(String(fo));
  };

  // Aplicar cambios al rango de meses
  const aplicarRango = () => {
    if (!rangoDesde || !rangoHasta) return;
    const nuevo = { ...mesesConfig };
    periodos.forEach(p => {
      if (p >= rangoDesde && p <= rangoHasta) {
        nuevo[p] = {
          actividad: rangoAct,
          nivel: rangoNivel,
          tarifa_mmv: parseFloat(rangoTarifa) || 1.98,
          lleva_multa: rangoMulta,
        };
      }
    });
    setMesesConfig(nuevo);
  };

  // Quitar multas a todos
  const toggleTodasMultas = (activar: boolean) => {
    const nuevo = { ...mesesConfig };
    periodos.forEach((p, idx) => {
      // El último mes corriente nunca lleva multa
      const esUltimo = idx === periodos.length - 1;
      nuevo[p] = {
        ...nuevo[p],
        lleva_multa: activar && !esUltimo,
      };
    });
    setMesesConfig(nuevo);
  };

  // Cálculo en tiempo real de totales
  const calculoTotales = useMemo(() => {
    let totBase = 0;
    let totMulta = 0;
    let totIva = 0;

    periodos.forEach((p, idx) => {
      const cfg = mesesConfig[p];
      if (!cfg) return;
      const base = Math.round((Number(cfg.tarifa_mmv || 0) * 57 * tasa * factor + Number.EPSILON) * 100) / 100;
      const esUltimo = idx === periodos.length - 1;
      const multa = cfg.lleva_multa && !esUltimo ? Math.round((base * tMulta + Number.EPSILON) * 100) / 100 : 0;
      const iva = esRes ? 0 : Math.round((base * 0.16 + Number.EPSILON) * 100) / 100;

      totBase += base;
      totMulta += multa;
      totIva += iva;
    });

    return {
      totBase,
      totMulta,
      totIva,
      granTotal: totBase + totMulta + totIva,
    };
  }, [mesesConfig, periodos, tasa, factor, tMulta, esRes]);

  const guardar = async () => {
    setError('');
    if (motivo.trim().length < 5) {
      setError('Indique el motivo del cambio (mínimo 5 caracteres).');
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios/unidades/periodos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: condo.codigo,
          inmueble: unidad.inmueble,
          unidad_id: unidad.id,
          periodos_custom: mesesConfig,
          usuario: usuario || 'Administrador',
          motivo,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar la configuración mensual');
      alert('¡Configuración de actividades y multas por mes guardada exitosamente!');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Ajuste Mensual de Deuda: <span className="font-mono text-emerald-700">{unidad.inmueble || unidad.numero}</span>
              </h2>
              <p className="text-xs text-slate-500">
                {unidad.propietario || 'Sin propietario'} · {periodos.length} meses pendientes · Tasa: Bs {fmtBs(tasa)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Bloque de Acciones Rápidas por Rango */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                  Aplicar cambios por rango de meses (Lote)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleTodasMultas(false)}
                  className="px-2.5 py-1 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" /> Quitar multas a todos
                </button>
                <button
                  type="button"
                  onClick={() => toggleTodasMultas(true)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Activar multas
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Desde</label>
                <select
                  value={rangoDesde}
                  onChange={e => setRangoDesde(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white font-mono"
                >
                  {periodos.map(p => <option key={p} value={p}>{p} ({fmtPeriodo(p)})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Hasta</label>
                <select
                  value={rangoHasta}
                  onChange={e => setRangoHasta(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white font-mono"
                >
                  {periodos.map(p => <option key={p} value={p}>{p} ({fmtPeriodo(p)})</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Actividad</label>
                <input
                  list="lista-actividades-rango"
                  value={rangoAct}
                  onChange={e => handleRangoActChange(e.target.value, rangoNivel)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white"
                  placeholder="Actividad comercial..."
                />
                <datalist id="lista-actividades-rango">
                  <option value="INMUEBLES DESOCUPADOS" />
                  {COMERCIALES.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nivel</label>
                <select
                  value={rangoNivel}
                  onChange={e => handleRangoActChange(rangoAct, Number(e.target.value))}
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white"
                >
                  {NIVELES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Tarifa (MMV)</label>
                <input
                  type="number"
                  step="0.01"
                  value={rangoTarifa}
                  onChange={e => setRangoTarifa(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={rangoMulta}
                  onChange={e => setRangoMulta(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                Aplicar recargo de multa ({esRes ? '10%' : '12%'}) a este rango
              </label>
              <button
                type="button"
                onClick={aplicarRango}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" /> Aplicar al Rango
              </button>
            </div>
          </div>

          {/* Tabla de Meses Interactiva */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Mes / Período</th>
                    <th className="py-2.5 px-3">Actividad Económica</th>
                    <th className="py-2.5 px-2 text-center w-24">Nivel</th>
                    <th className="py-2.5 px-2 text-right w-24">Tarifa MMV</th>
                    <th className="py-2.5 px-3 text-center w-36">¿Multa?</th>
                    <th className="py-2.5 px-3 text-right">Base Aseo</th>
                    <th className="py-2.5 px-3 text-right">Total Mes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {periodos.map((p, idx) => {
                    const cfg = mesesConfig[p] || { actividad: '', nivel: 1, tarifa_mmv: 1.98, lleva_multa: false };
                    const esUltimo = idx === periodos.length - 1;
                    const baseBs = Math.round((Number(cfg.tarifa_mmv || 0) * 57 * tasa * factor + Number.EPSILON) * 100) / 100;
                    const multaBs = cfg.lleva_multa && !esUltimo ? Math.round((baseBs * tMulta + Number.EPSILON) * 100) / 100 : 0;
                    const ivaBs = esRes ? 0 : Math.round((baseBs * 0.16 + Number.EPSILON) * 100) / 100;
                    const totalMes = baseBs + multaBs + ivaBs;

                    return (
                      <tr key={p} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {p} <span className="text-[10px] font-normal text-slate-500">({fmtPeriodo(p)})</span>
                          {esUltimo && <span className="ml-1 text-[9px] bg-sky-100 text-sky-800 font-black px-1.5 py-0.5 rounded">Corriente</span>}
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            list="lista-actividades-rango"
                            value={cfg.actividad}
                            onChange={e => {
                              const act = e.target.value;
                              const nom = actividadConNivel(act.trim().toUpperCase(), cfg.nivel);
                              const fo = resolverFOComercial(nom);
                              setMesesConfig({
                                ...mesesConfig,
                                [p]: {
                                  ...cfg,
                                  actividad: act,
                                  tarifa_mmv: fo ?? cfg.tarifa_mmv,
                                },
                              });
                            }}
                            className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white hover:border-slate-300 focus:border-emerald-500"
                            placeholder="Actividad..."
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <select
                            value={cfg.nivel}
                            onChange={e => {
                              const niv = Number(e.target.value);
                              const nom = actividadConNivel(cfg.actividad.trim().toUpperCase(), niv);
                              const fo = resolverFOComercial(nom);
                              setMesesConfig({
                                ...mesesConfig,
                                [p]: {
                                  ...cfg,
                                  nivel: niv,
                                  tarifa_mmv: fo ?? cfg.tarifa_mmv,
                                },
                              });
                            }}
                            className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white w-full"
                          >
                            {NIVELES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={cfg.tarifa_mmv}
                            onChange={e => {
                              setMesesConfig({
                                ...mesesConfig,
                                [p]: {
                                  ...cfg,
                                  tarifa_mmv: parseFloat(e.target.value) || 0,
                                },
                              });
                            }}
                            className="text-xs border border-slate-200 rounded px-2 py-1 text-right font-bold w-full"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          {esUltimo ? (
                            <span className="text-[10px] text-slate-400 font-bold">Sin multa (mes actual)</span>
                          ) : (
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cfg.lleva_multa}
                                onChange={e => {
                                  setMesesConfig({
                                    ...mesesConfig,
                                    [p]: {
                                      ...cfg,
                                      lleva_multa: e.target.checked,
                                    },
                                  });
                                }}
                                className="w-3.5 h-3.5 accent-amber-600 rounded"
                              />
                              <span className={`text-[11px] font-bold ${cfg.lleva_multa ? 'text-amber-800' : 'text-slate-400 line-through'}`}>
                                {cfg.lleva_multa ? `Bs ${fmtBs(multaBs)}` : 'Exonerada'}
                              </span>
                            </label>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 tabular-nums">
                          Bs {fmtBs(baseBs)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          Bs {fmtBs(totalMes)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen de Totales y Motivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo del ajuste (queda en la Auditoría) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Cambio de actividad según inspección tributaria..."
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white"
              />
              {error && <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-right space-y-1">
              <div className="text-xs text-slate-500 flex justify-between">
                <span>Base Imponible Aseo:</span>
                <span className="font-mono font-bold text-slate-700">Bs {fmtBs(calculoTotales.totBase)}</span>
              </div>
              <div className="text-xs text-slate-500 flex justify-between">
                <span>Total Multas:</span>
                <span className="font-mono font-bold text-amber-800">Bs {fmtBs(calculoTotales.totMulta)}</span>
              </div>
              {!esRes && (
                <div className="text-xs text-slate-500 flex justify-between">
                  <span>Total IVA (16%):</span>
                  <span className="font-mono font-bold text-blue-700">Bs {fmtBs(calculoTotales.totIva)}</span>
                </div>
              )}
              <div className="text-sm font-black text-slate-900 flex justify-between pt-1 border-t border-slate-200">
                <span>Nuevo Total a Pagar:</span>
                <span className="text-emerald-700 font-mono text-base">Bs {fmtBs(calculoTotales.granTotal)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Pie de Acciones */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-sm"
          >
            <Save className="w-4 h-4" />
            {guardando ? 'Guardando cambios...' : 'Guardar Ajustes Mensuales'}
          </button>
        </div>

      </div>
    </div>
  );
}
