'use client';

import React, { useState } from 'react';
import { FileText, Send, CheckCircle, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

export default function FacturacionElectronicaPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [successLink, setSuccessLink] = useState<string | null>(
    "https://democonsulta.thefactoryhka.com.ve/?doc=GhQVet4Fbe+vAHltz47VsoKrQ1NOzTmiOLp4jVe5oz4U01Z9FA/OdGcGnU9nU1co"
  );
  
  const handleLoteMassivo = async () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      alert("Simulación: Lote enviado exitosamente");
    }, 2000);
  };

  const handleTestInvoice = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/admin/factura-digital/test', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.url) {
        setSuccessLink(data.url);
      } else {
        alert("Error generando prueba: " + (data.error || "URL no devuelta"));
      }
    } catch (e: any) {
      alert("Error de conexión: " + e.message);
    } finally {
      setIsTesting(false);
    }
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
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <a 
                    href={successLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-4 py-2 rounded-lg"
                  >
                    Abrir enlace externo de la Factura <ExternalLink className="w-4 h-4" />
                  </a>
                  <button 
                    onClick={handleTestInvoice}
                    disabled={isTesting}
                    className="inline-flex items-center gap-2 text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                    Generar Prueba Actualizada
                  </button>
                </div>
                
                {/* Intentamos incrustarlo para que se vea en el sistema. Nota: democonsulta a veces deniega iframe */}
                <div className="w-full h-80 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 relative group">
                  <iframe 
                    src={successLink} 
                    className="w-full h-full"
                    title="Previsualización de Factura"
                  />
                  <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <p className="text-white text-sm px-6 text-center">Si The Factory HKA bloquea la previsualización directa (descarga forzada), usa el botón superior para abrirla en una pestaña nueva.</p>
                  </div>
                </div>
              </div>
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
