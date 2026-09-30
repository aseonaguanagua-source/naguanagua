'use client';

import React, { useState } from 'react';
import { FileText, Send, CheckCircle, AlertTriangle, ExternalLink, RefreshCw, Receipt } from 'lucide-react';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function getMesActual() {
  const d = new Date();
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function FacturacionElectronicaPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTesting, setIsTesting]       = useState(false);
  const [successLink, setSuccessLink]   = useState<string | null>(null);
  const [resumen, setResumen]           = useState<any>(null);

  // Campos del formulario de prueba
  const [montoServicio, setMontoServicio] = useState('850.00');
  const [montoMulta,    setMontoMulta]    = useState('120.00');
  const [mes,           setMes]           = useState(getMesActual());

  const handleLoteMassivo = async () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      alert('Simulación: Lote enviado exitosamente');
    }, 2000);
  };

  const handleTestInvoice = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/admin/factura-digital/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montoServicio: parseFloat(montoServicio) || 850,
          montoMulta:    parseFloat(montoMulta)    || 0,
          mes,
        }),
      });
      const data = await res.json();
      if (data.success && data.url) {
        setSuccessLink(data.url);
        setResumen(data.resumen || null);
      } else {
        alert('Error generando prueba: ' + (data.error || 'URL no devuelta'));
      }
    } catch (e: any) {
      alert('Error de conexión: ' + e.message);
    } finally {
      setIsTesting(false);
    }
  };

  const monto  = parseFloat(montoServicio) || 0;
  const multa  = parseFloat(montoMulta)    || 0;
  const iva    = parseFloat((monto * 0.16).toFixed(2));
  const total  = monto + multa + iva;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Facturación Electrónica (The Factory HKA)</h1>
          <p className="text-slate-500 mt-1">Gestión y emisión masiva de facturas fiscales digitales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">

        {/* Lote Masivo */}
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
                  <div className="w-4 h-4 border-2 border-[#c8e64c] border-t-transparent rounded-full animate-spin" />
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

        {/* Demo de Factura */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-6 flex-1">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Demo de Factura Generada</h3>
            <p className="text-slate-600 text-sm mb-4">
              Genera una factura de prueba contra el entorno <strong>Demo de The Factory HKA</strong>.
              El correo de notificación se envía a <span className="font-mono text-xs bg-slate-100 px-1 rounded">aseonaguanagua@globalgreenca.com</span>.
            </p>

            {/* Formulario de parámetros */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Monto Servicio (Bs)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoServicio}
                  onChange={e => setMontoServicio(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Multa (Bs, sin IVA)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoMulta}
                  onChange={e => setMontoMulta(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Mes Pagado</label>
                <input
                  type="text"
                  value={mes}
                  onChange={e => setMes(e.target.value)}
                  placeholder="Ej: Octubre 2026"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            </div>

            {/* Desglose en tiempo real */}
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-1 mb-4">
              <div className="flex justify-between"><span>Servicio Aseo:</span><span className="font-mono">Bs {monto.toFixed(2)}</span></div>
              <div className="flex justify-between text-blue-600"><span>IVA 16%:</span><span className="font-mono">Bs {iva.toFixed(2)}</span></div>
              {multa > 0 && (
                <div className="flex justify-between text-orange-600"><span>Multa (exenta):</span><span className="font-mono">Bs {multa.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1 mt-1">
                <span>Total a Pagar:</span><span className="font-mono">Bs {total.toFixed(2)}</span>
              </div>
            </div>

            {successLink ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={successLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-4 py-2 rounded-lg text-sm"
                  >
                    Abrir Factura <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={handleTestInvoice}
                    disabled={isTesting}
                    className="inline-flex items-center gap-2 text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                    Nueva Prueba
                  </button>
                </div>

                {/* Resumen de la factura emitida */}
                {resumen && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-green-800 flex items-center gap-1"><Receipt className="w-3 h-3" /> Factura emitida exitosamente</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-green-700 mt-1">
                      <span>Contribuyente:</span><span className="font-medium">{resumen.contribuyente}</span>
                      <span>Mes:</span><span className="font-medium">{resumen.mes}</span>
                      <span>Servicio:</span><span className="font-mono">{resumen.servicio}</span>
                      <span>IVA 16%:</span><span className="font-mono">{resumen.iva16}</span>
                      {multa > 0 && <><span>Multa:</span><span className="font-mono">{resumen.multa}</span></>}
                      <span className="font-bold">Total:</span><span className="font-mono font-bold">{resumen.totalAPagar}</span>
                    </div>
                    <p className="text-green-600 italic mt-1">{resumen.montoEnLetras}</p>
                  </div>
                )}

                <div className="w-full h-72 border border-slate-200 rounded-lg overflow-hidden bg-slate-900 relative group">
                  <iframe
                    src={successLink}
                    className="w-full h-full"
                    title="Previsualización de Factura"
                  />
                  <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <p className="text-white text-sm px-6 text-center">Si The Factory HKA bloquea la previsualización directa, usa el botón superior para abrirla en una pestaña nueva.</p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleTestInvoice}
                disabled={isTesting}
                className="inline-flex items-center gap-2 bg-[#111827] hover:bg-slate-800 text-[#c8e64c] font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                {isTesting ? 'Generando factura...' : 'Generar Prueba con TFHKA'}
              </button>
            )}
          </div>
          <div className="p-4 bg-yellow-50 border-t border-yellow-100 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-700">
              Esta es una visualización de prueba. Para ver números de control oficiales, la cuenta de Naguanagua en el portal TFHKA debe tener asignado un rango de numeración.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

