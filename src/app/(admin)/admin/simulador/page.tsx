'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, Search, Sliders, RotateCcw, Printer, 
  ShieldCheck, Percent, Calendar, DollarSign, 
  ArrowRight, Tag, HelpCircle, User, MapPin, Layers, RefreshCw
} from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs, getIdentidadVariants } from '@/lib/formatCurrency';
import { calcularMensualidad, isResidencialInm } from '@/lib/calculos';

export default function SimuladorPage() {
  const { tcmmv } = useAppContext();

  // Search state
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [userInmueblesList, setUserInmueblesList] = useState<any[]>([]);

  // Simulation parameters
  const [simMesesDeuda, setSimMesesDeuda] = useState<number>(0);
  const [exonerarMultas, setExonerarMultas] = useState<boolean>(false);
  const [descuentoMultaPct, setDescuentoMultaPct] = useState<number>(0); // 0 - 100%
  const [descuentoBasePct, setDescuentoBasePct] = useState<number>(0); // 0 - 100%
  const [descuentoMontoFijoBs, setDescuentoMontoFijoBs] = useState<number>(0);
  const [deudaAdicionalBs, setDeudaAdicionalBs] = useState<number>(0);
  const [simCuotas, setSimCuotas] = useState<number>(1);
  const [customBcv, setCustomBcv] = useState<number>(tcmmv || 57);

  // Sync initial BCV
  useEffect(() => {
    if (tcmmv && tcmmv > 0) {
      setCustomBcv(tcmmv);
    }
  }, [tcmmv]);

  // Execute Search
  const handleSearch = async (overrideQuery?: string) => {
    const rawSearch = (overrideQuery ?? docNumber).trim();
    if (!rawSearch) return;

    setSearching(true);
    try {
      const isCodeFormat = /^[A-Z]{3,4}\d{4,8}$/i.test(rawSearch);
      let matchedUser: any = null;
      let inmsFound: any[] = [];

      // 1. Search directly by property code
      if (isCodeFormat) {
        const { data: inmDirect } = await supabase
          .from('inmuebles')
          .select('*')
          .ilike('inmueble', rawSearch)
          .limit(1)
          .maybeSingle();

        if (inmDirect) {
          matchedUser = {
            Identidad: inmDirect.identidad,
            Contribuyente: inmDirect.contribuyente || 'Contribuyente',
            inmueble: inmDirect.inmueble,
            direccion: inmDirect.direccion,
            tipo: inmDirect.tipo,
            clasificacion: inmDirect.clasificacion,
            actividad_principal: inmDirect.actividad_principal,
            deuda_mmv: inmDirect.deuda_mmv,
            meses_deuda: inmDirect.meses_deuda,
            multa_bs: inmDirect.multa_bs,
            saldo_favor_bs: inmDirect.saldo_favor_bs,
            cant_inmuebles: inmDirect.cant_inmuebles
          };
          inmsFound = [inmDirect];
        }
      }

      // 2. Search by identity (Cédula / RIF)
      if (!matchedUser) {
        const fullId = /^[VEJPG]-/i.test(rawSearch) ? rawSearch : `${docType}-${rawSearch.replace(/\D/g, '')}`;
        const variants = getIdentidadVariants(fullId, docType);
        
        const { data: contrib } = await supabase
          .from('contribuyentes')
          .select('*')
          .or(variants.map(v => `identidad.eq.${v}`).join(','))
          .limit(1)
          .maybeSingle();

        const { data: dbInms } = await supabase
          .from('inmuebles')
          .select('*')
          .or(variants.map(v => `identidad.eq.${v}`).join(','))
          .neq('estado', 'Eliminado');

        inmsFound = dbInms || [];

        if (contrib || inmsFound.length > 0) {
          matchedUser = {
            Identidad: contrib?.identidad || inmsFound[0]?.identidad || fullId,
            Contribuyente: contrib?.nombre || inmsFound[0]?.contribuyente || 'Contribuyente',
            inmueble: inmsFound[0]?.inmueble,
            direccion: inmsFound[0]?.direccion,
            tipo: inmsFound[0]?.tipo || 'RESIDENCIAL',
            clasificacion: inmsFound[0]?.clasificacion,
            actividad_principal: inmsFound[0]?.actividad_principal,
            deuda_mmv: inmsFound[0]?.deuda_mmv,
            meses_deuda: inmsFound[0]?.meses_deuda,
            multa_bs: inmsFound[0]?.multa_bs,
            saldo_favor_bs: inmsFound[0]?.saldo_favor_bs,
            cant_inmuebles: inmsFound[0]?.cant_inmuebles
          };
        }
      }

      // 3. Search by name keywords fallback
      if (!matchedUser && rawSearch.length >= 3 && !/^\d+$/.test(rawSearch)) {
        const { data: byName } = await supabase
          .from('inmuebles')
          .select('*')
          .ilike('contribuyente', `%${rawSearch}%`)
          .limit(5);

        if (byName && byName.length > 0) {
          matchedUser = {
            Identidad: byName[0].identidad,
            Contribuyente: byName[0].contribuyente,
            inmueble: byName[0].inmueble,
            direccion: byName[0].direccion,
            tipo: byName[0].tipo,
            clasificacion: byName[0].clasificacion,
            actividad_principal: byName[0].actividad_principal,
            deuda_mmv: byName[0].deuda_mmv,
            meses_deuda: byName[0].meses_deuda,
            multa_bs: byName[0].multa_bs,
            saldo_favor_bs: byName[0].saldo_favor_bs,
            cant_inmuebles: byName[0].cant_inmuebles
          };
          inmsFound = byName;
        }
      }

      if (matchedUser) {
        setFoundUser(matchedUser);
        setUserInmueblesList(inmsFound);

        // Calculate total real months of debt across associated properties
        const maxMonths = inmsFound.reduce((max, i) => Math.max(max, parseInt(i.meses_deuda || '0')), 0);
        const initialMonths = maxMonths > 0 ? maxMonths : (parseInt(matchedUser.meses_deuda || '0') || 0);

        // Reset simulation controls to baseline
        setSimMesesDeuda(initialMonths);
        setExonerarMultas(false);
        setDescuentoMultaPct(0);
        setDescuentoBasePct(0);
        setDescuentoMontoFijoBs(0);
        setDeudaAdicionalBs(0);
        setSimCuotas(1);
      } else {
        alert('No se encontró ningún contribuyente o inmueble con los datos ingresados.');
      }
    } catch (err) {
      console.error('Error buscando contribuyente en simulador:', err);
    } finally {
      setSearching(false);
    }
  };

  // Baseline (Real DB) calculations
  const baseline = useMemo(() => {
    if (!foundUser || userInmueblesList.length === 0) {
      return {
        baseMensual: 0,
        ivaMensual: 0,
        mesesReales: 0,
        baseTotalReal: 0,
        ivaTotalReal: 0,
        multaTotalReal: 0,
        totalReal: 0,
        esRes: true
      };
    }

    const currentTasa = customBcv > 0 ? customBcv : (tcmmv || 57);
    let totalBaseMes = 0;
    let totalIvaMes = 0;
    let maxMeses = 0;
    let allRes = true;

    userInmueblesList.forEach((inm) => {
      const esRes = isResidencialInm(inm);
      if (!esRes) allRes = false;
      const bMes = calcularMensualidad(inm, currentTasa);
      const ivaMes = esRes ? 0 : bMes * 0.16;
      totalBaseMes += bMes;
      totalIvaMes += ivaMes;
      const m = parseInt(inm.meses_deuda || '0');
      if (m > maxMeses) maxMeses = m;
    });

    const meses = Math.max(0, maxMeses);
    const baseTotalReal = totalBaseMes * meses;
    const ivaTotalReal = totalIvaMes * meses;

    // Multa oficial en BD: 10% (res) / 12% (com) sobre meses vencidos (mes actual sin multa)
    const mesesConMulta = Math.max(0, meses - 1);
    const pctMulta = allRes ? 0.10 : 0.12;
    const multaTotalReal = totalBaseMes * pctMulta * mesesConMulta;

    const totalReal = baseTotalReal + ivaTotalReal + multaTotalReal;

    return {
      baseMensual: totalBaseMes,
      ivaMensual: totalIvaMes,
      mesesReales: meses,
      baseTotalReal,
      ivaTotalReal,
      multaTotalReal,
      totalReal,
      esRes: allRes
    };
  }, [foundUser, userInmueblesList, customBcv, tcmmv]);

  // Simulation calculations
  const simulation = useMemo(() => {
    if (!foundUser) {
      return {
        mesesSimulados: 0,
        baseSimulada: 0,
        ivaSimulado: 0,
        multaSimulada: 0,
        descuentoAplicado: 0,
        totalSimulado: 0,
        ahorroTotal: 0,
        ahorroPct: 0,
        montoPorCuota: 0
      };
    }

    const meses = Math.max(0, simMesesDeuda);
    const baseBruta = baseline.baseMensual * meses;
    
    // Descuento en Base
    const descuentoBase = baseBruta * (Math.min(100, Math.max(0, descuentoBasePct)) / 100);
    const baseConDescuento = Math.max(0, baseBruta - descuentoBase - descuentoMontoFijoBs);
    
    // IVA (0% si es residencial)
    const ivaSimulado = baseline.esRes ? 0 : baseConDescuento * 0.16;

    // Multa Simulada
    let multaSimulada = 0;
    if (!exonerarMultas && meses > 1) {
      const mesesConMulta = meses - 1;
      const pctMulta = baseline.esRes ? 0.10 : 0.12;
      const multaBruta = baseline.baseMensual * pctMulta * mesesConMulta;
      const descMulta = multaBruta * (Math.min(100, Math.max(0, descuentoMultaPct)) / 100);
      multaSimulada = Math.max(0, multaBruta - descMulta);
    }

    // Total Simulado
    const totalSimulado = Math.max(0, baseConDescuento + ivaSimulado + multaSimulada + deudaAdicionalBs);
    const ahorroTotal = Math.max(0, baseline.totalReal - totalSimulado);
    const ahorroPct = baseline.totalReal > 0 ? (ahorroTotal / baseline.totalReal) * 100 : 0;
    const cuotasVal = Math.max(1, simCuotas);
    const montoPorCuota = totalSimulado / cuotasVal;

    return {
      mesesSimulados: meses,
      baseSimulada: baseConDescuento,
      ivaSimulado,
      multaSimulada,
      descuentoAplicado: descuentoBase + descuentoMontoFijoBs + (baseline.multaTotalReal - multaSimulada),
      totalSimulado,
      ahorroTotal,
      ahorroPct,
      montoPorCuota
    };
  }, [foundUser, baseline, simMesesDeuda, exonerarMultas, descuentoMultaPct, descuentoBasePct, descuentoMontoFijoBs, deudaAdicionalBs, simCuotas]);

  // Reset to original values
  const handleResetToBaseline = () => {
    setSimMesesDeuda(baseline.mesesReales);
    setExonerarMultas(false);
    setDescuentoMultaPct(0);
    setDescuentoBasePct(0);
    setDescuentoMontoFijoBs(0);
    setDeudaAdicionalBs(0);
    setSimCuotas(1);
  };

  // Print simulation voucher
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Modo Sandbox Seguro
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold px-2 py-0.5 rounded-full">
                0 Escrituras en Base de Datos
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5 text-white">
              <Sparkles className="w-7 h-7 text-amber-400" />
              Simulador de Deuda y Descuentos
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Herramienta administrativa para proyectar convenios, probar exoneraciones de multas, aplicar porcentajes de descuento y ajustar meses de deuda para atención al contribuyente sin alterar los registros reales.
            </p>
          </div>

          {foundUser && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetToBaseline}
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors border border-white/10 cursor-pointer"
                title="Restablecer valores originales"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restablecer
              </button>
              <button
                onClick={handlePrint}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Proforma
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-3 items-center"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="V">V - Venezolano</option>
              <option value="J">J - Jurídico</option>
              <option value="E">E - Extranjero</option>
              <option value="G">G - Gubernamental</option>
            </select>
          </div>

          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="Buscar por Cédula, RIF, Nombre o Código de Inmueble (Ej: AURI001425, V-4837678)..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={searching || !docNumber.trim()}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-xs shrink-0 cursor-pointer"
          >
            {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar Contribuyente
          </button>
        </form>

        {/* Quick hint */}
        <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span>Ejemplo rápido: escribe <strong>AURI001425</strong> o <strong>URB014903</strong> para cargar contribuyentes reales y simular escenarios.</span>
        </div>
      </div>

      {/* Main Workspace */}
      {foundUser ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Contribuyente Info + Simulation Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Contribuyente Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Contribuyente Seleccionado
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1.5 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    {foundUser.Contribuyente}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                    <span className="font-mono font-bold text-slate-700">{foundUser.Identidad}</span>
                    <span>•</span>
                    <span className="font-mono text-indigo-600 font-semibold">{foundUser.inmueble || 'General'}</span>
                    <span>•</span>
                    <span className="capitalize">{foundUser.actividad_principal || foundUser.tipo}</span>
                  </div>
                  {foundUser.direccion && (
                    <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{foundUser.direccion}</span>
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400 font-semibold block">Tarifa Base Mensual</span>
                  <span className="text-base font-extrabold text-slate-800">
                    Bs. {formatBs(baseline.baseMensual)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block">
                    {baseline.esRes ? 'Exento 0% IVA' : '+ 16% IVA'}
                  </span>
                </div>
              </div>

              {/* Inmuebles asociados tag list */}
              {userInmueblesList.length > 1 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-500">Inmuebles ({userInmueblesList.length}):</span>
                  {userInmueblesList.map(inm => (
                    <span key={inm.id || inm.inmueble} className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                      {inm.inmueble} ({inm.meses_deuda || 0}m)
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* SIMULATION CONTROLS CARD */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-extrabold text-slate-900 text-base">Parámetros de Simulación</h3>
                </div>
                <button
                  type="button"
                  onClick={handleResetToBaseline}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Revertir a Original
                </button>
              </div>

              {/* 1. AJUSTAR MESES DE DEUDA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    Meses de Deuda Simulados
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Original en BD: <strong>{baseline.mesesReales} meses</strong></span>
                    <span className="bg-indigo-100 text-indigo-800 font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg border border-indigo-200">
                      {simMesesDeuda} meses
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max={Math.max(120, baseline.mesesReales + 12)}
                  value={simMesesDeuda}
                  onChange={(e) => setSimMesesDeuda(parseInt(e.target.value) || 0)}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />

                {/* Quick Presets for Months */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setSimMesesDeuda(0)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      simMesesDeuda === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ✨ Quitar toda la deuda (0 meses)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimMesesDeuda(1)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      simMesesDeuda === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    1 mes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimMesesDeuda(6)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      simMesesDeuda === 6 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    6 meses
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimMesesDeuda(12)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      simMesesDeuda === 12 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    12 meses (1 año)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimMesesDeuda(baseline.mesesReales)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      simMesesDeuda === baseline.mesesReales ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Restablecer ({baseline.mesesReales} meses)
                  </button>
                </div>
              </div>

              {/* 2. EXONERAR / DESCUENTO EN MULTAS */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-amber-500" />
                      Tratamiento de Multas por Mora
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Multa original estimada: <strong>Bs. {formatBs(baseline.multaTotalReal)}</strong>
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={exonerarMultas}
                      onChange={(e) => setExonerarMultas(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-xs font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      Exonerar 100% Multas
                    </span>
                  </label>
                </div>

                {!exonerarMultas && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <div className="flex justify-between text-xs font-semibold text-slate-600">
                      <span>Descuento parcial en multas:</span>
                      <span className="font-mono text-indigo-700 font-bold">{descuentoMultaPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={descuentoMultaPct}
                      onChange={(e) => setDescuentoMultaPct(parseInt(e.target.value) || 0)}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex gap-1.5 pt-1">
                      {[0, 25, 50, 75].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDescuentoMultaPct(pct)}
                          className={`text-[11px] px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                            descuentoMultaPct === pct ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-600'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. DESCUENTOS EN TARIFA BASE DE ASEO */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-emerald-600" />
                    Descuento en Tarifa de Aseo
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {descuentoBasePct}% off
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={descuentoBasePct}
                  onChange={(e) => setDescuentoBasePct(parseInt(e.target.value) || 0)}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[0, 10, 20, 30, 50, 70].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDescuentoBasePct(pct)}
                      className={`text-[11px] px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                        descuentoBasePct === pct ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-600'
                      }`}
                    >
                      {pct === 50 ? '50% (3ra Edad)' : `${pct}%`}
                    </button>
                  ))}
                </div>

                {/* Descuento Monto Fijo en Bs */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    O rebaja de monto fijo directo (Bs):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Bs.</span>
                    <input
                      type="number"
                      min="0"
                      value={descuentoMontoFijoBs || ''}
                      onChange={(e) => setDescuentoMontoFijoBs(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* 4. ASIGNAR DEUDA ADICIONAL / OTROS CONCEPTOS */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  Asignar Deuda Adicional / Ajuste Manual (Bs)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Bs.</span>
                  <input
                    type="number"
                    min="0"
                    value={deudaAdicionalBs || ''}
                    onChange={(e) => setDeudaAdicionalBs(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Permite simular agregados como gastos administrativos, saldos congelados pasados o convenios complementarios.
                </p>
              </div>

              {/* 5. FINANCIAMIENTO EN CUOTAS */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Simular Plan de Convenio en Cuotas
                  </label>
                  <span className="text-xs font-bold text-indigo-700 font-mono">
                    {simCuotas} {simCuotas === 1 ? 'pago de contado' : 'cuotas mensuales'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[1, 3, 6, 12].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSimCuotas(c)}
                      className={`text-xs py-1.5 rounded-lg font-bold transition-all border cursor-pointer ${
                        simCuotas === c
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {c === 1 ? 'Contado' : `${c} Cuotas`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: COMPARISON CARD & SIMULATION SUMMARY (5 cols) */}
          <div className="lg:col-span-5 space-y-6 sticky top-6">
            {/* COMPARISON CARD: ANTES VS DESPUÉS */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 to-indigo-900 p-4 text-white">
                <span className="text-[10px] font-mono tracking-widest text-indigo-300 font-bold uppercase block">
                  Resumen Comparativo
                </span>
                <h3 className="text-base font-extrabold flex items-center justify-between mt-0.5">
                  <span>Antes vs Después</span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    {simulation.ahorroPct > 0 ? `-${simulation.ahorroPct.toFixed(1)}% Ahorro` : 'Sin Variación'}
                  </span>
                </h3>
              </div>

              <div className="p-5 space-y-4">
                {/* 1. Real State in DB */}
                <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-800">
                    <span>ESTADO REAL EN BASE DE DATOS</span>
                    <span className="font-mono">{baseline.mesesReales} meses</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Base Aseo:</span>
                    <span className="font-mono">Bs. {formatBs(baseline.baseTotalReal)}</span>
                  </div>
                  {!baseline.esRes && (
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>IVA (16%):</span>
                      <span className="font-mono">Bs. {formatBs(baseline.ivaTotalReal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Multa por Mora:</span>
                    <span className="font-mono text-rose-700 font-bold">Bs. {formatBs(baseline.multaTotalReal)}</span>
                  </div>
                  <div className="pt-1.5 border-t border-rose-200 flex items-center justify-between text-xs font-extrabold text-slate-800">
                    <span>Total Real a Cobrar:</span>
                    <span className="text-sm font-mono text-rose-900">Bs. {formatBs(baseline.totalReal)}</span>
                  </div>
                </div>

                {/* Arrow down */}
                <div className="flex justify-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-xs">
                    <ArrowRight className="w-4 h-4 rotate-90" />
                  </div>
                </div>

                {/* 2. Simulated State */}
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                    <span>ESTADO SIMULADO PROPUESTO</span>
                    <span className="font-mono bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded text-[11px]">
                      {simulation.mesesSimulados} meses
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Base con Descuento:</span>
                    <span className="font-mono">Bs. {formatBs(simulation.baseSimulada)}</span>
                  </div>
                  {!baseline.esRes && (
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>IVA (16%):</span>
                      <span className="font-mono">Bs. {formatBs(simulation.ivaSimulado)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Multa Simulada:</span>
                    <span className={`font-mono font-bold ${simulation.multaSimulada === 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                      {simulation.multaSimulada === 0 ? '0,00 (Exonerada)' : `Bs. ${formatBs(simulation.multaSimulada)}`}
                    </span>
                  </div>
                  {deudaAdicionalBs > 0 && (
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Deuda Adicional Asignada:</span>
                      <span className="font-mono">Bs. {formatBs(deudaAdicionalBs)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-emerald-300 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">TOTAL SIMULADO:</span>
                    <span className="text-xl font-extrabold font-mono text-emerald-700">
                      Bs. {formatBs(simulation.totalSimulado)}
                    </span>
                  </div>
                </div>

                {/* 3. SAVINGS CARD */}
                {simulation.ahorroTotal > 0 && (
                  <div className="p-3.5 bg-gradient-to-r from-amber-50 to-emerald-50 rounded-xl border border-emerald-300 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-emerald-800 uppercase block">Ahorro para el Contribuyente:</span>
                      <span className="text-lg font-extrabold font-mono text-emerald-700">
                        Bs. {formatBs(simulation.ahorroTotal)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 font-bold block">Descuento Global</span>
                      <span className="text-base font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded-lg border border-emerald-200 shadow-xs">
                        {simulation.ahorroPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* 4. INSTALLMENT BREAKDOWN IF CUOTAS > 1 */}
                {simCuotas > 1 && (
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-indigo-900">Plan de {simCuotas} Cuotas Mensuales:</span>
                      <span className="text-sm font-extrabold font-mono text-indigo-700">
                        Bs. {formatBs(simulation.montoPorCuota)} / mes
                      </span>
                    </div>
                    <p className="text-[10px] text-indigo-600">
                      Cuotas uniformes calculadas a la tasa BCV referencial actual (Bs. {formatBs(customBcv)}).
                    </p>
                  </div>
                )}

                {/* PRINT ACTION */}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Proforma de Simulación
                </button>

                <p className="text-[10px] text-center text-slate-400">
                  🔒 Toda la información visualizada es una proyección temporal no vinculante. No se modifican los saldos de la base de datos municipal.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Inicie buscando un contribuyente o inmueble</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
            Ingrese la cédula, RIF o código de catastro (ej: AURI001425) para cargar sus deudas reales y comenzar a simular rebajas, exoneraciones de multas y convenios de pago.
          </p>
        </div>
      )}

      {/* PRINT-ONLY TEMPLATE */}
      <div className="hidden print:block fixed inset-0 bg-white p-8 z-50 text-slate-900">
        <div className="border-b-2 border-slate-800 pb-4 mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wider text-slate-900">
              ALCALDÍA BOLIVARIANA DE NAGUANAGUA
            </h1>
            <h2 className="text-sm font-bold text-slate-700">
              INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC)
            </h2>
            <p className="text-xs text-slate-500">Dirección de Recaudación y Liquidación de Tasas de Aseo Urbano</p>
          </div>
          <div className="text-right">
            <span className="border border-slate-400 font-mono text-xs px-2.5 py-1 rounded font-bold uppercase block">
              PROFORMA DE SIMULACIÓN
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">
              Fecha: {new Date().toLocaleDateString('es-VE')} {new Date().toLocaleTimeString('es-VE')}
            </span>
          </div>
        </div>

        {foundUser && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded border border-slate-200">
              <div>
                <p><strong>Contribuyente:</strong> {foundUser.Contribuyente}</p>
                <p><strong>Cédula / RIF:</strong> {foundUser.Identidad}</p>
                <p><strong>Inmueble:</strong> {foundUser.inmueble || 'General'}</p>
              </div>
              <div>
                <p><strong>Clasificación:</strong> {foundUser.tipo} • {foundUser.actividad_principal}</p>
                <p><strong>Tasa BCV Referencial:</strong> Bs. {formatBs(customBcv)}</p>
                <p><strong>Dirección:</strong> {foundUser.direccion || 'Naguanagua, Edo. Carabobo'}</p>
              </div>
            </div>

            <table className="w-full text-xs border border-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 text-left">Concepto</th>
                  <th className="p-2 text-right">Estado Real (BD)</th>
                  <th className="p-2 text-right">Simulación Propuesta</th>
                  <th className="p-2 text-right">Ahorro Estimado</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="p-2 font-medium">Meses de Servicio Adeudados</td>
                  <td className="p-2 text-right font-mono">{baseline.mesesReales} meses</td>
                  <td className="p-2 text-right font-mono font-bold">{simulation.mesesSimulados} meses</td>
                  <td className="p-2 text-right font-mono text-emerald-700">
                    {Math.max(0, baseline.mesesReales - simulation.mesesSimulados)} meses menos
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-2 font-medium">Tarifa Base Aseo Urbano</td>
                  <td className="p-2 text-right font-mono">Bs. {formatBs(baseline.baseTotalReal)}</td>
                  <td className="p-2 text-right font-mono font-bold">Bs. {formatBs(simulation.baseSimulada)}</td>
                  <td className="p-2 text-right font-mono text-emerald-700">
                    Bs. {formatBs(Math.max(0, baseline.baseTotalReal - simulation.baseSimulada))}
                  </td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="p-2 font-medium">Multas e Intereses de Mora</td>
                  <td className="p-2 text-right font-mono">Bs. {formatBs(baseline.multaTotalReal)}</td>
                  <td className="p-2 text-right font-mono font-bold">
                    {simulation.multaSimulada === 0 ? '0,00 (Exonerada)' : `Bs. ${formatBs(simulation.multaSimulada)}`}
                  </td>
                  <td className="p-2 text-right font-mono text-emerald-700">
                    Bs. {formatBs(Math.max(0, baseline.multaTotalReal - simulation.multaSimulada))}
                  </td>
                </tr>
                {deudaAdicionalBs > 0 && (
                  <tr className="border-b border-slate-200">
                    <td className="p-2 font-medium">Ajustes / Deuda Adicional</td>
                    <td className="p-2 text-right font-mono">Bs. 0,00</td>
                    <td className="p-2 text-right font-mono font-bold">Bs. {formatBs(deudaAdicionalBs)}</td>
                    <td className="p-2 text-right font-mono">-</td>
                  </tr>
                )}
                <tr className="bg-slate-100 font-extrabold text-sm">
                  <td className="p-2">TOTAL A CANCELAR</td>
                  <td className="p-2 text-right font-mono">Bs. {formatBs(baseline.totalReal)}</td>
                  <td className="p-2 text-right font-mono text-emerald-800">Bs. {formatBs(simulation.totalSimulado)}</td>
                  <td className="p-2 text-right font-mono text-emerald-800">
                    Bs. {formatBs(simulation.ahorroTotal)} ({simulation.ahorroPct.toFixed(1)}%)
                  </td>
                </tr>
              </tbody>
            </table>

            {simCuotas > 1 && (
              <div className="p-3 border border-slate-300 rounded bg-slate-50">
                <p className="font-bold">PROPUESTA DE FINANCIAMIENTO EN CUOTAS:</p>
                <p>Plan de <strong>{simCuotas} cuotas mensuales</strong> de <strong>Bs. {formatBs(simulation.montoPorCuota)}</strong> cada una.</p>
              </div>
            )}

            <div className="pt-6 border-t border-slate-300 text-[10px] text-slate-500 space-y-1">
              <p><strong>AVISO IMPORTANTE:</strong> Este documento es una proforma estrictamente referencial y simulada emitida por la Dirección de Recaudación de Naguanagua para el estudio de facilidades y convenios de pago. No constituye comprobante de solvencia ni recibo definitivo de pago.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
