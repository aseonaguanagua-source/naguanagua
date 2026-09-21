import React from 'react';
import { calcularDeudaSaneada, DeudaMensual } from '@/lib/aseo';
import { Calculator, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SaneamientoPage() {
  // Simulación de Tasa TCMMV (esto en la vida real vendría del API del BCV)
  const tcmmvActual = 875.22; 

  // Simulación de deudas de un comercio tipo "Supermercados y Bodegones" Nivel II
  // (Tarifa = 70 TCMMV mensuales)
  const tarifaComercioTCMMV = 70;

  const deudasSimuladas: DeudaMensual[] = [
    // Año 2023 (Decreto 005 - Condonación 100%)
    { anio: 2023, mes: 10, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 15, intereses_TCMMV: 5 },
    { anio: 2023, mes: 11, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 15, intereses_TCMMV: 5 },
    { anio: 2023, mes: 12, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 15, intereses_TCMMV: 5 },
    
    // Año 2024 (Decreto 006 - Condonación 100% multas/intereses y Decreto 007 - 50% desc. capital)
    { anio: 2024, mes: 1, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 10, intereses_TCMMV: 2 },
    { anio: 2024, mes: 2, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 10, intereses_TCMMV: 2 },
    { anio: 2024, mes: 3, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 10, intereses_TCMMV: 2 },
    
    // Año 2025 (Decreto 006 - Condonación 100% multas/intereses y Decreto 007 - 50% desc. capital)
    { anio: 2025, mes: 1, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 10, intereses_TCMMV: 2 },
    { anio: 2025, mes: 2, capitalFacturado_TCMMV: tarifaComercioTCMMV, multas_TCMMV: 10, intereses_TCMMV: 2 },
  ];

  const resultado = calcularDeudaSaneada('comercial', deudasSimuladas, tcmmvActual, false);

  const formatBs = (val: number) => `Bs. ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <Calculator className="w-6 h-6 text-slate-700" />
        <h1 className="text-2xl font-semibold text-slate-800 uppercase tracking-wide">
          Plan de Saneamiento y Regularización
        </h1>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex gap-3 items-start">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-blue-900 mb-1">Beneficios Fiscales Aplicados (Gacetas 19, 23 y 31)</h3>
          <ul className="list-disc ml-5 text-sm text-blue-800 space-y-1">
            <li>Condonación del 100% del Capital, Multas e Intereses para periodos hasta el 31/12/2023.</li>
            <li>Condonación del 100% de Multas e Intereses de los años 2024, 2025 y enero 2026.</li>
            <li>Descuento del 50% sobre el Capital Principal facturado entre 01/01/2024 y 31/01/2026.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Deuda Original</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-slate-600">
              <span>Capital Original:</span>
              <span className="font-medium">{formatBs(resultado.capitalOriginal)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Multas Originales:</span>
              <span className="font-medium">{formatBs(resultado.multasOriginales)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Intereses Originales:</span>
              <span className="font-medium">{formatBs(resultado.interesesOriginales)}</span>
            </div>
            
            <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold text-slate-800">Total Original:</span>
              <span className="font-bold text-red-600 text-xl">{formatBs(resultado.totalOriginal)}</span>
            </div>
          </div>
        </div>

        <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-bl-lg">
            SANEADA
          </div>
          <h2 className="text-lg font-semibold text-green-900 mb-4 border-b border-green-200 pb-2">
            Deuda Actualizada (Plan de Saneamiento)
          </h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-green-800">
              <span>Capital a Pagar:</span>
              <span className="font-medium">{formatBs(resultado.capitalSaneado)}</span>
            </div>
            <div className="flex justify-between items-center text-green-800">
              <span>Multas:</span>
              <span className="font-medium line-through opacity-70 text-sm mr-2">{formatBs(resultado.multasOriginales)}</span>
              <span className="font-medium">{formatBs(resultado.multasSaneadas)}</span>
            </div>
            <div className="flex justify-between items-center text-green-800">
              <span>Intereses:</span>
              <span className="font-medium line-through opacity-70 text-sm mr-2">{formatBs(resultado.interesesOriginales)}</span>
              <span className="font-medium">{formatBs(resultado.interesesSaneados)}</span>
            </div>
            
            <div className="pt-3 mt-3 border-t border-green-200 flex justify-between items-center">
              <span className="font-semibold text-green-900">Total a Pagar:</span>
              <span className="font-bold text-green-700 text-2xl">{formatBs(resultado.totalSaneado)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Opciones de Pago</h2>
        <p className="text-sm text-slate-600 mb-4">
          Puede suscribir un convenio de pago de hasta doce (12) cuotas mensuales. Para acogerse a los beneficios, el convenio debe suscribirse antes de las fechas límite establecidas en la Gaceta.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
            <CheckCircle2 className="w-5 h-5" />
            Pago de Contado
          </button>
          <button className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
            Suscribir Convenio (6 meses)
          </button>
          <button className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
            Suscribir Convenio (12 meses)
          </button>
        </div>
      </div>
    </div>
  );
}
