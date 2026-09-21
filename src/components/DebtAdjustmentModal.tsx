import React, { useState, useEffect } from 'react';
import { Calculator, X, AlertCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useAppContext } from '@/store/AppContext';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  const handleConfirmAdjustDebt = async () => {
    if (!calculoDetalle || !row) return;
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

      // Update state
      const facturasRestantes = recibos.filter((f: any) => !(f.contribuyente === rowContribuyente && f.estado === 'Pendiente'));
      setFacturas([newFactura, ...facturasRestantes]);

      if (addAuditLog) {
        await addAuditLog('AJUSTAR_DEUDA', `Deuda ajustada a ${debtMonths} meses (${montoBs} Bs) para el contribuyente ${rowContribuyente}`);
      }

      alert('Deuda ajustada y recibo generada exitosamente.');
      onClose();
    } catch (e: any) {
      console.error(e);
      alert('Error al ajustar la deuda: ' + e.message);
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
        
        <div className="p-6 space-y-6">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
            <p className="text-sm"><span className="font-semibold text-slate-700">Contribuyente/Condominio:</span> {row.Contribuyente || row.contribuyente || row.nombre} ({row.Identidad || row.identidad})</p>
            <p className="text-sm"><span className="font-semibold text-slate-700">Clasificación:</span> {calculoDetalle.leyenda || 'Varias unidades'}</p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center bg-blue-50 p-3 rounded border border-blue-100">
              <span className="text-sm font-semibold text-blue-800">Tarifa Mensual (MMV):</span>
              <span className="font-bold text-blue-900 text-lg">{calculoDetalle.factor.toFixed(2)}</span>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Meses a adeudar (Morosidad Ajustada)</label>
              <input 
                type="number" 
                min="0"
                value={debtMonths} 
                onChange={(e) => setDebtMonths(Number(e.target.value))}
                className="w-full border-2 border-slate-200 rounded-lg px-4 py-2 font-semibold text-slate-700 focus:border-orange-500 outline-none"
              />
            </div>

            <div className="flex justify-between items-center bg-orange-50 p-4 rounded-lg border border-orange-200 shadow-inner">
              <span className="font-bold text-orange-800">Nueva Deuda Total:</span>
              <div className="text-right">
                <span className="block font-black text-orange-600 text-2xl">{(calculoDetalle.factor * debtMonths).toFixed(2)} MMV</span>
                <span className="block text-xs font-semibold text-orange-700 mt-1">≈ Bs. {(calculoDetalle.factor * debtMonths * dynamicTcmmv).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-amber-50 p-3 rounded border border-amber-200">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed font-medium">
              Al confirmar, se eliminarán **todos los recibos pendientes** actuales de este usuario y se generará un **único recibo nuevo** con el monto total ajustado.
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button 
              onClick={onClose}
              className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleConfirmAdjustDebt}
              disabled={isProcessing}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 flex justify-center"
            >
              {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirmar Ajuste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
