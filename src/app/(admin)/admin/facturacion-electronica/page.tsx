'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Send, CheckCircle, AlertTriangle, ExternalLink, 
  RefreshCw, Receipt, Search, Mail, Filter, Eye, ShieldCheck, 
  Sliders, ArrowUpRight, Check, X, Building
} from 'lucide-react';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function getMesActual() {
  const d = new Date();
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function FacturacionElectronicaPage() {
  const [pagosList, setPagosList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'todos' | 'pendientes' | 'emitidas'>('pendientes');

  // Modal de Ajuste y Emisión Manual
  const [selectedPagoForEmit, setSelectedPagoForEmit] = useState<any | null>(null);
  const [ajusteMontoServicio, setAjusteMontoServicio] = useState<string>('');
  const [ajusteMontoMulta, setAjusteMontoMulta] = useState<string>('0');
  const [ajusteConcepto, setAjusteConcepto] = useState<string>('');
  const [isEmitting, setIsEmitting] = useState(false);
  const [enviarCorreoAlEmitir, setEnviarCorreoAlEmitir] = useState(true);
  const [correoDestinoEmision, setCorreoDestinoEmision] = useState('davidzara66@gmail.com');

  // Modal de Reenvío de Correo
  const [selectedPagoForEmail, setSelectedPagoForEmail] = useState<any | null>(null);
  const [customEmailDestino, setCustomEmailDestino] = useState('davidzara66@gmail.com');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);

  // Panel de Prueba Rápida con TFHKA
  const [showDemoTester, setShowDemoTester] = useState(false);
  const [montoServicioDemo, setMontoServicioDemo] = useState('850.00');
  const [montoMultaDemo, setMontoMultaDemo] = useState('120.00');
  const [mesDemo, setMesDemo] = useState(getMesActual());
  const [isTesting, setIsTesting] = useState(false);
  const [demoSuccessLink, setDemoSuccessLink] = useState<string | null>(null);
  const [demoResumen, setDemoResumen] = useState<any>(null);

  // Carga de pagos desde la API
  const loadPagos = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/factura-digital/listar?filter=${filterTab}&q=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (data.success) {
        setPagosList(data.items || []);
      }
    } catch (e: any) {
      console.error('Error cargando pagos para facturación digital:', e);
    } finally {
      setIsLoading(false);
    }
  }, [filterTab, searchTerm]);

  useEffect(() => {
    loadPagos();
  }, [loadPagos]);

  // Abrir modal de revisión y emisión manual
  const handleOpenEmitModal = (pago: any) => {
    setSelectedPagoForEmit(pago);
    const montoTotal = pago.monto || 0;
    // Si tiene multa deducible o monto base estimado (monto / 1.16 si incluye IVA)
    const baseEstimada = (montoTotal / 1.16).toFixed(2);
    setAjusteMontoServicio(baseEstimada);
    setAjusteMontoMulta('0.00');
    setAjusteConcepto(`Servicio de Aseo Urbano Comercial - ${getMesActual()}`);
    setCorreoDestinoEmision('davidzara66@gmail.com');
    setEnviarCorreoAlEmitir(true);
  };

  // Ejecutar emisión manual
  const handleConfirmarEmision = async () => {
    if (!selectedPagoForEmit) return;
    setIsEmitting(true);
    try {
      const base = parseFloat(ajusteMontoServicio) || 0;
      const multa = parseFloat(ajusteMontoMulta) || 0;
      const iva = parseFloat((base * 0.16).toFixed(2));
      const total = base + multa + iva;

      const res = await fetch('/api/admin/factura-digital/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: selectedPagoForEmit.pagoId,
          recibos: selectedPagoForEmit.recibos && selectedPagoForEmit.recibos.length > 0 ? selectedPagoForEmit.recibos : [`REC-${selectedPagoForEmit.pagoId.slice(0, 6)}`],
          montos: { servicio: base, multa: multa, total: total },
          montoTotal: total,
          montoServicio: base,
          montoMulta: multa,
          concepto: ajusteConcepto,
          contribuyente: selectedPagoForEmit.contribuyente,
          identidad: selectedPagoForEmit.identidad,
          formasPago: [{
            descripcion: selectedPagoForEmit.tipo || 'Transferencia',
            fecha: new Date().toISOString(),
            forma: '05',
            monto: total
          }],
          enviarCorreo: enviarCorreoAlEmitir,
          correoDestino: correoDestinoEmision
        })
      });

      const data = await res.json();
      if (data.success && (data.url || data.skipped)) {
        if (data.skipped) {
          alert(`Aviso: ${data.message || 'Exento de factura fiscal'}`);
          setSelectedPagoForEmit(null);
          return;
        }
        alert(`¡Factura Digital emitida exitosamente!\nNúmero de Control generado.`);
        
        // Si se seleccionó enviar correo, disparar reenvío inmediato
        if (enviarCorreoAlEmitir && correoDestinoEmision) {
          await fetch('/api/admin/factura-digital/reenviar-correo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pagoId: selectedPagoForEmit.pagoId,
              correoDestino: correoDestinoEmision,
              facturaUrl: data.url,
              numeroControl: 'DOC-' + Date.now().toString().slice(-6),
              contribuyente: selectedPagoForEmit.contribuyente,
              identidad: selectedPagoForEmit.identidad,
              monto: total,
              fecha: new Date().toISOString()
            })
          });
        }

        setSelectedPagoForEmit(null);
        loadPagos();
      } else {
        alert('Error al emitir factura: ' + (data.error || 'Respuesta no válida de TFHKA'));
      }
    } catch (e: any) {
      alert('Error en conexión con el servicio de facturación: ' + e.message);
    } finally {
      setIsEmitting(false);
    }
  };

  // Reenviar correo de factura emitida
  const handleReenviarCorreo = async () => {
    if (!selectedPagoForEmail) return;
    setIsSendingEmail(true);
    setEmailSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/factura-digital/reenviar-correo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: selectedPagoForEmail.pagoId,
          correoDestino: customEmailDestino,
          facturaUrl: selectedPagoForEmail.facturaUrl,
          numeroControl: selectedPagoForEmail.numeroControl || 'N/A',
          contribuyente: selectedPagoForEmail.contribuyente,
          identidad: selectedPagoForEmail.identidad,
          monto: selectedPagoForEmail.monto,
          fecha: selectedPagoForEmail.created_at
        })
      });

      const data = await res.json();
      if (data.success && data.correoEnviado) {
        setEmailSuccessMsg(`Factura enviada exitosamente a ${customEmailDestino}`);
        setTimeout(() => {
          setSelectedPagoForEmail(null);
          setEmailSuccessMsg(null);
        }, 2000);
      } else {
        alert(data.mensaje || 'Aviso: No se pudo entregar el correo.');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Test directo libre de demo
  const handleTestInvoice = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/admin/factura-digital/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montoServicio: parseFloat(montoServicioDemo) || 850,
          montoMulta: parseFloat(montoMultaDemo) || 0,
          mes: mesDemo,
        }),
      });
      const data = await res.json();
      if (data.success && data.url) {
        setDemoSuccessLink(data.url);
        setDemoResumen(data.resumen || null);
      } else {
        alert('Error generando prueba: ' + (data.error || 'URL no devuelta'));
      }
    } catch (e: any) {
      alert('Error de conexión: ' + e.message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Facturación Electrónica (The Factory HKA / SENIAT)</h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> TFHKA Conectado
            </span>
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-300">
              Modo Pruebas: davidzara66@gmail.com
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            Control de emisión manual de facturas fiscales digitales. Revisa y ajusta los montos antes de enviar a la imprenta digital.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDemoTester(!showDemoTester)}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Sliders className="w-4 h-4" />
            {showDemoTester ? 'Ocultar Simulador Demo' : 'Generador Libre Demo'}
          </button>
          <button
            onClick={loadPagos}
            disabled={isLoading}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Sincronizar Pagos
          </button>
        </div>
      </div>

      {/* PANEL DE SIMULACIÓN DEMO (COLAPSABLE) */}
      {showDemoTester && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
              <Receipt className="w-5 h-5 text-emerald-600" />
              Simulador Directo contra Entorno Demo TFHKA
            </h3>
            <span className="text-xs text-slate-400">Ambiente de certificación</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Monto Base Servicio (Bs)</label>
              <input
                type="number"
                value={montoServicioDemo}
                onChange={e => setMontoServicioDemo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Monto Multa Exenta (Bs)</label>
              <input
                type="number"
                value={montoMultaDemo}
                onChange={e => setMontoMultaDemo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mes a Facturar</label>
              <input
                type="text"
                value={mesDemo}
                onChange={e => setMesDemo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex justify-between items-center pt-2">
            <p className="text-xs text-slate-500">
              Total Calculado: <strong>Bs {((parseFloat(montoServicioDemo) || 0) * 1.16 + (parseFloat(montoMultaDemo) || 0)).toFixed(2)}</strong> (incluye 16% IVA)
            </p>
            <button
              onClick={handleTestInvoice}
              disabled={isTesting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? 'Generando en TFHKA...' : 'Emitir Factura de Prueba'}
            </button>
          </div>

          {demoSuccessLink && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between mt-4">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Factura de prueba generada con éxito</p>
                <p className="text-xs text-emerald-700">{demoResumen?.montoEnLetras}</p>
              </div>
              <a
                href={demoSuccessLink}
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-700 text-white px-4 py-2 rounded text-xs font-bold flex items-center gap-1 hover:bg-emerald-800"
              >
                Abrir en TFHKA <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* BARRA DE BÚSQUEDA Y PESTAÑAS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50">
          {/* Pestañas */}
          <div className="flex bg-slate-200 p-1 rounded-lg">
            <button
              onClick={() => setFilterTab('pendientes')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                filterTab === 'pendientes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Pendientes por Emitir
            </button>
            <button
              onClick={() => setFilterTab('emitidas')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                filterTab === 'emitidas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Facturas Emitidas
            </button>
            <button
              onClick={() => setFilterTab('todos')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                filterTab === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Todos los Pagos
            </button>
          </div>

          {/* Buscador */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por Cédula, RIF, Nombre o Recibo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* TABLA DE RESULTADOS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-100 text-xs uppercase font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">C.I. / R.I.F.</th>
                <th className="py-3 px-4">Razón Social / Nombre</th>
                <th className="py-3 px-4">Monto Pagado (Bs)</th>
                <th className="py-3 px-4">Tipo / Ref</th>
                <th className="py-3 px-4">Fecha Pago</th>
                <th className="py-3 px-4">Estatus Factura</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    Cargando listado de pagos...
                  </td>
                </tr>
              ) : pagosList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No se encontraron pagos en esta categoría.
                  </td>
                </tr>
              ) : (
                pagosList.map((pago: any) => {
                  return (
                    <tr key={pago.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {pago.identidad}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {pago.contribuyente}
                        {pago.correo && (
                          <span className="block text-xs text-slate-400 font-normal">{pago.correo}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        Bs {pago.monto.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-semibold text-slate-700">{pago.tipo}</span>
                        <span className="block text-slate-400 font-mono">Ref: {pago.referencia}</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(pago.created_at).toLocaleDateString('es-VE')}
                      </td>
                      <td className="py-3 px-4">
                        {pago.facturaEmitida ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle className="w-3.5 h-3.5" /> Emitida
                            {pago.numeroControl && <span className="font-mono ml-1">({pago.numeroControl})</span>}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5" /> Pendiente Emisión
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {pago.facturaEmitida ? (
                            <>
                              {pago.facturaUrl && (
                                <a
                                  href={pago.facturaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded flex items-center gap-1 border border-slate-200"
                                >
                                  <Eye className="w-3.5 h-3.5 text-blue-600" /> Ver Factura
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedPagoForEmail(pago);
                                  setCustomEmailDestino('davidzara66@gmail.com');
                                }}
                                className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded flex items-center gap-1 border border-emerald-300"
                              >
                                <Mail className="w-3.5 h-3.5 text-emerald-600" /> Reenviar Correo
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleOpenEmitModal(pago)}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#c8e64c]" /> Revisar y Emitir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE AJUSTE Y EMISIÓN MANUAL */}
      {selectedPagoForEmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#c8e64c]" />
                <h3 className="font-bold text-base">Revisión y Ajuste Previo a Emisión Fiscal</h3>
              </div>
              <button onClick={() => setSelectedPagoForEmit(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block">Contribuyente</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedPagoForEmit.contribuyente}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">R.I.F. / Cédula</span>
                  <span className="font-bold text-slate-800 text-sm font-mono">{selectedPagoForEmit.identidad}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">Monto Pagado Original</span>
                  <span className="font-bold text-emerald-700 font-mono text-sm">
                    Bs {selectedPagoForEmit.monto.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">Forma de Pago</span>
                  <span className="font-semibold text-slate-700">{selectedPagoForEmit.tipo}</span>
                </div>
              </div>

              {/* CAMPOS DE AJUSTE */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Concepto Facturable</label>
                  <input
                    type="text"
                    value={ajusteConcepto}
                    onChange={e => setAjusteConcepto(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Monto Base Servicio (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ajusteMontoServicio}
                      onChange={e => setAjusteMontoServicio(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Multa Exenta (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ajusteMontoMulta}
                      onChange={e => setAjusteMontoMulta(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* DESGLOSE FISCAL RESULTANTE */}
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Gravada (Servicio):</span>
                    <span className="font-mono">Bs {(parseFloat(ajusteMontoServicio) || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-blue-700">
                    <span>IVA (16% sobre servicio):</span>
                    <span className="font-mono">Bs {((parseFloat(ajusteMontoServicio) || 0) * 0.16).toFixed(2)}</span>
                  </div>
                  {(parseFloat(ajusteMontoMulta) || 0) > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Multa Exenta de IVA:</span>
                      <span className="font-mono">Bs {(parseFloat(ajusteMontoMulta) || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-900 font-bold border-t border-emerald-200 pt-1 text-sm">
                    <span>Total Factura Fiscal:</span>
                    <span className="font-mono text-emerald-800">
                      Bs {(
                        (parseFloat(ajusteMontoServicio) || 0) * 1.16 +
                        (parseFloat(ajusteMontoMulta) || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* OPCIÓN DE ENVÍO DE CORREO */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enviarCorreoAlEmitir}
                        onChange={e => setEnviarCorreoAlEmitir(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      Enviar notificación por correo al emitir
                    </label>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">Prueba</span>
                  </div>
                  {enviarCorreoAlEmitir && (
                    <div>
                      <input
                        type="email"
                        value={correoDestinoEmision}
                        onChange={e => setCorreoDestinoEmision(e.target.value)}
                        placeholder="davidzara66@gmail.com"
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setSelectedPagoForEmit(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-200 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarEmision}
                disabled={isEmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isEmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Emitiendo a TFHKA...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Emitir Factura Digital
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REENVÍO DE CORREO */}
      {selectedPagoForEmail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-base">Reenviar Factura por Correo</h3>
              </div>
              <button onClick={() => setSelectedPagoForEmail(null)} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1">
                <p><strong>Contribuyente:</strong> {selectedPagoForEmail.contribuyente}</p>
                <p><strong>Nro. Control:</strong> <span className="font-mono text-emerald-700 font-bold">{selectedPagoForEmail.numeroControl}</span></p>
                <p><strong>Monto:</strong> <span className="font-mono font-bold">Bs {selectedPagoForEmail.monto.toFixed(2)}</span></p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico Destino</label>
                <input
                  type="email"
                  value={customEmailDestino}
                  onChange={e => setCustomEmailDestino(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Por defecto configurado en modo prueba a <strong>davidzara66@gmail.com</strong>
                </span>
              </div>

              {emailSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold p-3 rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  {emailSuccessMsg}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setSelectedPagoForEmail(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-200 font-medium"
              >
                Cerrar
              </button>
              <button
                onClick={handleReenviarCorreo}
                disabled={isSendingEmail}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isSendingEmail ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Enviar Factura
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
