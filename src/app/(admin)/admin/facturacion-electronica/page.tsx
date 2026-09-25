'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Send, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';

export default function FacturacionElectronicaPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [successLink, setSuccessLink] = useState<string | null>(
    // Hardcoded success link from our test so the user can see it right away
    "https://democonsulta.thefactoryhka.com.ve/?doc=GhQVet4Fbe+vAHltz47VsoKrQ1NOzTmiOLp4jVe5oz4U01Z9FA/OdGcGnU9nU1co"
  );
  
  const handleLoteMassivo = async () => {
    setIsProcessing(true);
    // TODO: Fetch all pagos_reportados con estado 'Aprobado' que no tengan factura_emitida = true
    // TODO: Map a la estructura requerida del API
    // TODO: Emitir y guardar URL en DB
    setTimeout(() => {
      setIsProcessing(false);
      alert("Simulación: Lote enviado exitosamente");
    }, 2000);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Facturación Electrónica (The Factory HKA)</h1>
          <p className="text-slate-500 mt-1">Gestión y emisión masiva de facturas fiscales digitales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        
        {/* Lote Masivo Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-6 flex-1">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Envío Masivo por Lote</h3>
            <p className="text-slate-600 text-sm">
              Inicia el proceso para emitir facturas digitales de todos los pagos que han sido <strong>aprobados</strong> y aún no se han enviado a la imprenta digital.
            </p>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100">
            <button 
              onClick={handleLoteMassivo}
              disabled={isProcessing}
              className="w-full bg-[#111827] hover:bg-slate-800 text-[#c8e64c] font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#c8e64c] border-t-transparent rounded-full animate-spin"></div>
                  Procesando Lote...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Emitir Facturas Fiscales Lote
                </>
              )}
            </button>
          </div>
        </div>

        {/* Demo Result Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-6 flex-1">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Demo de Factura Generada</h3>
            <p className="text-slate-600 text-sm mb-4">
              Aquí puedes visualizar la factura de prueba generada contra el entorno de <strong>Demo de The Factory HKA</strong> que fue exitosa.
            </p>
            {successLink && (
              <a 
                href={successLink} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-4 py-2 rounded-lg"
              >
                Ver PDF de la Factura <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <div className="p-4 bg-yellow-50 border-t border-yellow-100 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-700">
              Esta es una visualización de prueba. Para poder ver números de control oficiales, la cuenta de pruebas de Naguanagua en el portal de TFHKA debe tener asignado un rango de numeración.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
