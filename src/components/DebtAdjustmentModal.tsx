'use client';
import React, { useState, useEffect } from 'react';
import { Calculator, X, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/store/AppContext';


export function DebtAdjustmentModal({ row, inmuebles, tcmmv, recibos, setFacturas, onClose, addAuditLog }: any) {
  const { ordenanzasConfig: ordenanzaData } = useAppContext();
  const [debtMonths, setDebtMonths] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [calculoDetalle, setCalculoDetalle] = useState<any>(null);
  const [dynamicTcmmv, setDynamicTcmmv] = useState<number>(tcmmv || 1);
  
  useEffect(() => {
    // Fetch fresh rate just in case AppContext has a stale one
    fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.tcmmv) setDynamicTcmmv(data.tcmmv);
      })
      .catch(console.error);
      
    const calcView = async () => {
      try {
        let factorTotal = 0;
        let leyenda = '';
        const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...ordenanzaData.actividadesIndustriales];

        const misInmuebles = inmuebles.filter((i: any) => i.identidad === row.Identidad || i.identidad === row.identidad);

        if (misInmuebles.length > 0) {
          const isCondominio = misInmuebles.some((i: any) => (parseInt(i.cant_inmuebles) || 1) > 1);
          leyenda = isCondominio ? 'Condominio / Complejo Residencial' : misInmuebles.map((i: any) => i.actividad_principal || 'Residencial').join(', ');
          
          misInmuebles.forEach((inm: any) => {
            const localFactor = parseFloat(inm.mmv_mes) || 0;
            const cant = parseInt(inm.cant_inmuebles) || 1;
            factorTotal += (localFactor * cant);
          });
        }
        
        if (factorTotal === 0) {
          const rowClasificacion = row.Clasificacion || row.tipo || 'Residencial';
          const rowTipoResidencia = row.TipoResidencia || row.Actividad || row.actividad || '';
          const rowActividadComercial = row.ActividadComercial || row.Actividad || row.actividad || '';
          const rowNivelMetraje = row.NivelMetraje || row.codigo || '';

          if (rowClasificacion === 'Residencial') {
            const tipo = ordenanzaData.tiposResidenciales.find(t => t.label === rowTipoResidencia);
            if (tipo) {
              factorTotal = tipo.factor;
              leyenda = `Clasificador de Tasa Residencial: ${tipo.label}`;
            }
          } else {
            const act = todasLasActividades.find(a => a.label === rowActividadComercial);
            const nivelIndex = Math.max(0, ordenanzaData.nivelesMetraje.indexOf(rowNivelMetraje));
            if (act) {
              factorTotal = act.factores[nivelIndex];
              leyenda = `Tasa Com/Ind: ${act.label} (Nivel: ${rowNivelMetraje || '1 (0-50m2)'})`;
            }
          }
        }

        setCalculoDetalle({
          factor: factorTotal,
          leyenda
        });
      } catch (error) {
        console.error(error);
      }
    };
    if (row) calcView();
  }, [row, inmuebles]);

  const [clave, setClave] = useState('');
  const [nota, setNota] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleConfirmAdjustDebt = async () => {
    if (!calculoDetalle || !row) return;
    setErrorMsg('');

    if (clave.trim().toLowerCase() !== 'dzara') {
      setErrorMsg('Clave de autorización incorrecta. Solo personal autorizado (dzara) puede ejecutar este ajuste.');
      return;
    }

    if (!nota.trim() || nota.trim().length < 8) {
      setErrorMsg('Es OBLIGATORIO ingresar una justificación detallada del ajuste de deuda.');
      return;
    }

    setIsProcessing(true);
    try {
      const rowIdentidad = row.Identidad || row.identidad;
      const rowContribuyente = row.Contribuyente || row.contribuyente || row.nombre;

      // Delete all existing pending invoices
      const facturasPendientes = recibos.filter((f: any) => f.contribuyente === rowContribuyente && f.estado === 'Pendiente');
      for (const fp of facturasPendientes) {
        await supabase.from('facturas').delete().eq('id', fp.id);
      }

      // Generate a single new invoice for the adjusted debt
      const deudaMMV = (calculoDetalle.factor * debtMonths);
      const montoBs = (deudaMMV * dynamicTcmmv).toFixed(2);
      
      const facturaData = {
        referencia: `RECIB-${Math.floor(Math.random() * 1000000)}`,
        contribuyente: rowContribuyente,
        monto: montoBs,
        emision: new Date().toISOString().split('T')[0],
        vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        estado: 'Pendiente'
      };

      const { data: newFactura, error: err2 } = await supabase.from('facturas').insert([facturaData]).select().single();
      if (err2) throw err2;

      // Actualizar notas en inmuebles
      const fechaHoy = new Date().toLocaleDateString('es-VE');
      const registroAjuste = `[${fechaHoy}] AJUSTE DE DEUDA: Ajustado a ${debtMonths} meses (${deudaMMV.toFixed(2)} UCD ≈ Bs. ${montoBs}). Motivo: ${nota.trim()} (Autorizado por: dzara)`;

      const misInmuebles = inmuebles.filter((i: any) => i.identidad === rowIdentidad);
      for (const inm of misInmuebles) {
        const notaPrev = (inm.notas || '').trim();
        const nuevaNota = notaPrev ? `${notaPrev}\n---\n${registroAjuste}` : registroAjuste;
        await supabase.from('inmuebles').update({
          deuda_mmv: deudaMMV,
          meses_deuda: debtMonths,
          notas: nuevaNota
        }).eq('id', inm.id);
      }

      // Update state
      const facturasRestantes = recibos.filter((f: any) => !(f.contribuyente === rowContribuyente && f.estado === 'Pendiente'));
      setFacturas([newFactura, ...facturasRestantes]);

      if (addAuditLog) {
        await addAuditLog('AJUSTAR_DEUDA', `Deuda ajustada a ${debtMonths} meses (${montoBs} Bs) para ${rowContribuyente}. Motivo: ${nota.trim()}`);
      }

      alert('✅ Deuda ajustada y recibo generado exitosamente.');
      onClose();
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Error al ajustar la deuda: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!row || !calculoDetalle) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className="bg-slate-800 p-4 flex items-center justify-between">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Calculator className="w-5 h-5 text-orange-400" />
            Ajustar Deuda
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-1.5 text-xs">
            <p><span className="font-semibold text-slate-500">Contribuyente/Condominio:</span> <span className="font-bold text-slate-800">{row.Contribuyente || row.contribuyente || row.nombre} ({row.Identidad || row.identidad})</span></p>
            <p><span className="font-semibold text-slate-500">Clasificación:</span> {calculoDetalle.leyenda || 'Varias unidades'}</p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
              <span className="text-xs font-semibold text-blue-800">Tarifa Mensual (UCD):</span>
              <span className="font-bold text-blue-900 text-base">{calculoDetalle.factor.toFixed(2)}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Meses a adeudar (Morosidad Ajustada)</label>
              <input 
                type="number" 
                min="0"
                value={debtMonths} 
                onChange={(e) => setDebtMonths(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 focus:border-orange-500 outline-none"
              />
            </div>

            <div className="flex justify-between items-center bg-orange-50 p-3.5 rounded-lg border border-orange-200 shadow-inner">
              <span className="font-bold text-orange-800 text-xs uppercase tracking-wide">Nueva Deuda Total:</span>
              <div className="text-right">
                <span className="block font-black text-orange-600 text-xl">{(calculoDetalle.factor * debtMonths).toFixed(2)} UCD</span>
                <span className="block text-xs font-semibold text-orange-700 mt-0.5">≈ Bs. {(calculoDetalle.factor * debtMonths * dynamicTcmmv).toFixed(2)}</span>
              </div>
            </div>

            {/* Clave dzara */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Clave de Autorización <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                placeholder="Ingrese clave de autorización (dzara)"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-orange-500 font-mono"
                required
              />
            </div>

            {/* Justificación obligatoria */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Motivo / Justificación del Ajuste <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Ingrese justificación obligatoria del ajuste de deuda..."
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-orange-500"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <p>{errorMsg}</p>
            </div>
          )}

          <div className="flex items-start gap-2 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-[11px] text-amber-700">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p>
              Al confirmar, se eliminarán los recibos pendientes actuales de este contribuyente y se emitirá un recibo único por el nuevo saldo.
            </p>
          </div>

          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="button"
              onClick={handleConfirmAdjustDebt}
              disabled={isProcessing}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-70 flex justify-center items-center"
            >
              {isProcessing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirmar Ajuste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
