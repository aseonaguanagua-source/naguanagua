'use client';

import React, { useEffect, useState } from 'react';
import { Snowflake, Calendar, Lock, Eye, EyeOff, RefreshCw, X, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { obtenerTasaEuroFecha, fechaDMY, valorUCD } from '@/lib/tasaHistorica';

interface ModalCongelarTasaProps {
  condominio: {
    codigo: string;
    nombre: string;
    identidad?: string;
    tasa_congelada_config?: any;
    tasa_congelada_activa?: any;
    tasaCongelada?: any;
    tasaCongeladaConfig?: any;
  };
  tasaActualSistema?: number;
  usuario?: string;
  onClose: () => void;
  onSaved: (res: any) => void;
}

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hoyCaracas(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function sumarDiasYMD(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + dias, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function finDeMesYMD(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m || 1, 0, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export default function ModalCongelarTasaCondominio({
  condominio,
  tasaActualSistema,
  usuario,
  onClose,
  onSaved,
}: ModalCongelarTasaProps) {
  const hoy = hoyCaracas();
  const cfgInicial = condominio.tasa_congelada_config || condominio.tasaCongeladaConfig || condominio.tasa_congelada_activa || condominio.tasaCongelada || null;

  const [tasaStr, setTasaStr] = useState<string>(
    cfgInicial?.tasa ? String(cfgInicial.tasa).replace('.', ',') : (tasaActualSistema ? String(tasaActualSistema).replace('.', ',') : '')
  );
  const [fechaRefBcv, setFechaRefBcv] = useState<string>(cfgInicial?.fechaReferencia || '');
  const [infoRefBcv, setInfoRefBcv] = useState<string>('');
  const [cargandoBcv, setCargandoBcv] = useState(false);

  const [desde, setDesde] = useState<string>(cfgInicial?.desde || hoy);
  const [hasta, setHasta] = useState<string>(cfgInicial?.hasta || sumarDiasYMD(hoy, 7));
  const [motivo, setMotivo] = useState<string>(cfgInicial?.motivo || '');
  const [clave, setClave] = useState<string>('');
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>('');
  const [cfgActual, setCfgActual] = useState<any>(cfgInicial);
  const [activaActual, setActivaActual] = useState<any>(condominio.tasa_congelada_activa || condominio.tasaCongelada || null);

  useEffect(() => {
    fetch(`/api/admin/condominios/congelar-tasa?codigo=${encodeURIComponent(condominio.codigo)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (j?.config) {
          setCfgActual(j.config);
          setActivaActual(j.activa || null);
          setTasaStr(String(j.config.tasa || '').replace('.', ','));
          if (j.config.desde) setDesde(j.config.desde);
          if (j.config.hasta) setHasta(j.config.hasta);
          if (j.config.fechaReferencia) setFechaRefBcv(j.config.fechaReferencia);
          if (j.config.motivo) setMotivo(j.config.motivo);
        }
      })
      .catch(() => {});
  }, [condominio.codigo]);

  const cargarTasaDeFecha = async (fecha: string) => {
    setFechaRefBcv(fecha);
    if (!fecha) return;
    if (fecha > hoy) {
      setError('No se puede consultar una tasa BCV de una fecha futura.');
      return;
    }
    setError('');
    setCargandoBcv(true);
    try {
      const { euro, fechaValor } = await obtenerTasaEuroFecha(fecha);
      setTasaStr(String(euro).replace('.', ','));
      setInfoRefBcv(`Tasa oficial BCV Euro del ${fechaDMY(fecha)}: Bs. ${fmtBs(euro)}${fechaValor !== fecha ? ` (fecha valor ${fechaDMY(fechaValor)})` : ''}`);
    } catch (e: any) {
      setError(e?.message || 'No se pudo obtener la tasa BCV de esa fecha. Puede escribir el monto manualmente.');
    } finally {
      setCargandoBcv(false);
    }
  };

  const tasaNum = parseFloat(String(tasaStr || '').replace(/\./g, '').replace(',', '.')) || parseFloat(String(tasaStr || '').replace(',', '.')) || 0;

  const guardar = async (accion: 'congelar' | 'descongelar') => {
    setError('');
    if (!clave.trim()) {
      setError('Debe ingresar la clave de autorización para continuar.');
      return;
    }
    if (clave.trim() !== 'dzara18') {
      setError('Clave de autorización incorrecta.');
      return;
    }
    if (accion === 'congelar') {
      if (!(tasaNum > 0)) {
        setError('Indique una tasa en Bs/€ válida mayor a 0.');
        return;
      }
      if (!desde || !hasta) {
        setError('Seleccione las fechas Desde y Hasta del período de congelación.');
        return;
      }
      if (desde > hasta) {
        setError('La fecha Desde no puede ser posterior a la fecha Hasta.');
        return;
      }
    }

    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios/congelar-tasa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: condominio.codigo,
          clave: clave.trim(),
          accion,
          tasa: tasaNum,
          desde,
          hasta,
          fechaReferencia: fechaRefBcv || undefined,
          motivo: motivo.trim() || undefined,
          usuario: usuario || 'Admin',
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setError(j.error || 'Error guardando la configuración de tasa congelada.');
        return;
      }
      onSaved(j);
    } catch (e: any) {
      setError(e?.message || 'Error de conexión al guardar la tasa congelada.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-sky-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-800 via-sky-700 to-cyan-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/15 border border-white/20">
              <Snowflake className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-wide">Congelar Tasa por Período</h3>
              <p className="text-xs text-sky-100 font-medium">
                {condominio.nombre} · <span className="font-mono font-bold">{condominio.codigo}</span>
                {condominio.identidad ? ` · ${condominio.identidad}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
          {/* Estado actual si ya tiene tasa congelada */}
          {cfgActual && cfgActual.activa && (
            <div className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
              activaActual
                ? 'bg-sky-50 border-sky-300 text-sky-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}>
              <div className="space-y-0.5 text-xs">
                <div className="font-black flex items-center gap-1.5">
                  <Snowflake className="w-4 h-4 text-sky-600 shrink-0" />
                  {activaActual
                    ? `TASA CONGELADA ACTIVA: Bs. ${fmtBs(cfgActual.tasa)} / €`
                    : `TASA CONGELADA CONFIGURADA (${hoy > cfgActual.hasta ? 'PERÍODO VENCIDO — HOY USA TASA DIARIA' : 'PROGRAMADA'}): Bs. ${fmtBs(cfgActual.tasa)} / €`}
                </div>
                <div className="text-slate-700 font-medium">
                  Período: <b>{fechaDMY(cfgActual.desde)}</b> al <b>{fechaDMY(cfgActual.hasta)}</b>
                  {cfgActual.fechaReferencia ? ` · Tasa tomada del ${fechaDMY(cfgActual.fechaReferencia)}` : ''}
                </div>
                {cfgActual.motivo && (
                  <div className="text-[11px] text-slate-600 italic">Motivo: {cfgActual.motivo}</div>
                )}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                activaActual ? 'bg-sky-200 text-sky-900' : 'bg-amber-200 text-amber-900'
              }`}>
                {activaActual ? 'Activa hoy' : (hoy > cfgActual.hasta ? 'Finalizada' : 'Programada')}
              </span>
            </div>
          )}

          {/* Explicación */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 leading-relaxed">
            Congela la tasa de este condominio (y sus locales/unidades) durante el rango de fechas indicado.
            Se reflejará automáticamente en <b>Estados de Cuenta (PDF y Excel)</b>, <b>Caja de Condominios</b>, <b>Soy Contribuyente</b> y <b>Cobro Móvil</b> sin afectar a los demás condominios.
            Al vencer la fecha <b>Hasta</b>, regresará automáticamente a la tasa BCV diaria.
          </div>

          {/* Paso 1: Elegir tasa (por fecha histórica o manual) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-sky-50/50 border border-sky-200/80 rounded-xl p-3.5">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                1. Cargar tasa BCV de una fecha (opcional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  max={hoy}
                  value={fechaRefBcv}
                  onChange={e => cargarTasaDeFecha(e.target.value)}
                  className="w-full border border-slate-300 bg-white rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 outline-none"
                />
                {cargandoBcv && <RefreshCw className="w-4 h-4 text-sky-600 animate-spin shrink-0" />}
              </div>
              <span className="block text-[10px] text-slate-500 mt-1">
                Ej.: seleccione 04/11/2026 para traer la tasa BCV de ese día.
              </span>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Tasa a congelar (Bs / Euro €) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tasaStr}
                onChange={e => setTasaStr(e.target.value)}
                placeholder="Ej. 999,77"
                className="w-full border-2 border-sky-400 bg-white rounded-xl px-3 py-2 text-sm font-mono font-black text-sky-950 focus:ring-2 focus:ring-sky-500 outline-none"
              />
              {tasaNum > 0 && (
                <span className="block text-[10px] font-bold text-sky-800 mt-1">
                  UCD equivalente (×57): Bs. {fmtBs(valorUCD(tasaNum))}
                </span>
              )}
            </div>

            {infoRefBcv && (
              <div className="sm:col-span-2 text-[11px] font-bold text-sky-800 bg-sky-100/80 border border-sky-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                {infoRefBcv}
              </div>
            )}
          </div>

          {/* Paso 2: Período de vigencia (Desde - Hasta) */}
          <div className="space-y-2.5 bg-white border border-slate-200 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-sky-700" />
                2. Período de vigencia de la tasa congelada
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  ['Hoy', 0],
                  ['+3 días', 3],
                  ['+7 días', 7],
                  ['+15 días', 15],
                ].map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const base = desde || hoy;
                      setHasta(sumarDiasYMD(base, Number(days)));
                    }}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-900 border border-slate-200 text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setHasta(finDeMesYMD(desde || hoy))}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-900 border border-slate-200 text-[10px] font-bold cursor-pointer transition-colors"
                >
                  Fin de mes
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Desde (fecha inicio) *</span>
                <input
                  type="date"
                  value={desde}
                  onChange={e => setDesde(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Hasta (fecha fin inclusive) *</span>
                <input
                  type="date"
                  min={desde}
                  value={hasta}
                  onChange={e => setHasta(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </label>
            </div>

            {desde && hasta && desde <= hasta && tasaNum > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] text-emerald-950 font-medium">
                Leyenda en Estados de Cuenta y Caja:{' '}
                <b className="font-extrabold">
                  “TASA CONGELADA POR EL PERÍODO DEL {fechaDMY(desde)} AL {fechaDMY(hasta)} (Bs. {fmtBs(tasaNum)} / €)”
                </b>
                . A partir del <b>{fechaDMY(sumarDiasYMD(hasta, 1))}</b> cambiará automáticamente a tasa diaria.
              </div>
            )}
          </div>

          {/* Motivo opcional */}
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Observación / Motivo (opcional)</span>
            <input
              type="text"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej. Pago con orden emitida según estado de cuenta enviado a la junta..."
              className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </label>

          {/* Clave de autorización */}
          <div className="bg-amber-50/70 border-2 border-amber-300 rounded-xl p-3.5">
            <label className="block text-xs font-black text-amber-950 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-700" />
              Clave de autorización para congelar / descongelar tasa *
            </label>
            <div className="relative">
              <input
                type={verClave ? 'text' : 'password'}
                value={clave}
                onChange={e => setClave(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardar('congelar'); }}
                placeholder="Ingrese la clave autorizada…"
                autoComplete="off"
                className="w-full border border-amber-400 bg-white rounded-xl pl-3 pr-10 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setVerClave(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {verClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            {cfgActual && cfgActual.activa && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardar('descongelar')}
                className="px-3.5 py-2 rounded-xl border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Descongelar (Volver a Tasa Diaria)
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar('congelar')}
              className="px-5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Snowflake className="w-4 h-4" />}
              Congelar Tasa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
