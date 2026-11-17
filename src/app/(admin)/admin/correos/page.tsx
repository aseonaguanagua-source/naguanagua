'use client';
import React, { useState, useEffect } from 'react';
import { Tabs } from '@/components/Tabs';
import { Mail, Settings, Users, Send, CheckCircle, Loader2, ShieldCheck, AlertCircle, Eye, FileText, Paperclip } from 'lucide-react';

interface ResumenPadron {
  totalContribuyentesConCorreo: number;
  correosUnicosTotal: number;
  totalConDeuda: number;
  correosUnicosConDeuda: number;
  comercialesConDeuda: number;
  residencialesConDeuda: number;
  condominiosConDeuda: number;
  totalSolventes: number;
  comercialesTotal: number;
  residencialesTotal: number;
  condominiosTotal: number;
}

export default function CorreosPage() {
  const [plantilla, setPlantilla] = useState('estado_cuenta_masivo');
  const [asunto, setAsunto] = useState('ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO');
  const [tipoFiltro, setTipoFiltro] = useState('Todos los Sectores');
  const [estatusFiltro, setEstatusFiltro] = useState('Solo Morosos (Con deuda > 1 mes)');
  const [adjuntarPdf, setAdjuntarPdf] = useState(true);

  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [resumen, setResumen] = useState<ResumenPadron>({
    totalContribuyentesConCorreo: 17221,
    correosUnicosTotal: 16123,
    totalConDeuda: 11382,
    correosUnicosConDeuda: 10768,
    comercialesConDeuda: 3035,
    residencialesConDeuda: 8165,
    condominiosConDeuda: 182,
    totalSolventes: 5839,
    comercialesTotal: 3940,
    residencialesTotal: 12960,
    condominiosTotal: 321,
  });

  useEffect(() => {
    fetch('/api/admin/envio-comunicado')
      .then(r => r.json())
      .then(d => {
        if (d?.ok && d.resumen) {
          setResumen(d.resumen);
        }
      })
      .catch(() => {});
  }, []);

  const destinatariosSeleccionados = (() => {
    const soloDeuda = estatusFiltro.includes('Morosos');
    const soloSolventes = estatusFiltro === 'Solo Solventes';
    if (tipoFiltro === 'Solo Comercial e Industrial') {
      if (soloDeuda) return resumen.comercialesConDeuda;
      if (soloSolventes) return Math.max(0, resumen.comercialesTotal - resumen.comercialesConDeuda);
      return resumen.comercialesTotal;
    }
    if (tipoFiltro === 'Solo Residencial') {
      if (soloDeuda) return resumen.residencialesConDeuda;
      if (soloSolventes) return Math.max(0, resumen.residencialesTotal - resumen.residencialesConDeuda);
      return resumen.residencialesTotal;
    }
    if (tipoFiltro === 'Solo Condominios') {
      if (soloDeuda) return resumen.condominiosConDeuda;
      if (soloSolventes) return Math.max(0, resumen.condominiosTotal - resumen.condominiosConDeuda);
      return resumen.condominiosTotal;
    }
    if (soloDeuda) return resumen.totalConDeuda;
    if (soloSolventes) return resumen.totalSolventes;
    return resumen.totalContribuyentesConCorreo;
  })();

  const handleSendTest = async () => {
    setIsSendingTest(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: true,
          plantilla,
          asunto,
          tipoFiltro,
          estatusFiltro,
          adjuntarPdf,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Correo de prueba con Estado de Cuenta PDF adjunto despachado a facturacion.comercial@globalgreenca.com.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en envío de prueba: ${data.error || 'Fallo desconocido'}`,
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error de conexión: ' + e.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendMassive = async () => {
    if (
      !confirm(
        `¿Desea iniciar el envío masivo a ${destinatariosSeleccionados.toLocaleString('es-VE')} contribuyentes (${tipoFiltro} · ${estatusFiltro})${
          adjuntarPdf ? ' con su Estado de Cuenta PDF adjunto' : ''
        }?`
      )
    ) {
      return;
    }

    setIsSending(true);
    setProgress(10);
    setStatusMessage(null);

    try {
      const progressTimer = setInterval(() => {
        setProgress(p => (p < 90 ? p + 10 : p));
      }, 900);

      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: false,
          plantilla,
          asunto,
          tipoFiltro,
          estatusFiltro,
          adjuntarPdf,
        }),
      });

      clearInterval(progressTimer);
      setProgress(100);

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Campaña completada: ${data.enviados} Estados de Cuenta enviados exitosamente.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en la campaña masiva: ${data.error}`,
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error en la conexión del servidor: ' + e.message });
    } finally {
      setIsSending(false);
    }
  };

  const configTabContent = (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-600" /> Plantilla Oficial Configurada
        </h3>
        <select
          value={plantilla}
          onChange={e => setPlantilla(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="estado_cuenta_masivo">
            ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) — Con Estado de Cuenta PDF Adjunto (Predeterminado)
          </option>
          <option value="comunicado_oficial">
            Comunicado Oficial - Renovación Tecnológica e Instructivo Portal
          </option>
        </select>

        <div className="mt-3 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
          <label className="flex items-center gap-2.5 text-xs font-bold text-emerald-900 cursor-pointer">
            <input
              type="checkbox"
              checked={adjuntarPdf}
              onChange={e => setAdjuntarPdf(e.target.checked)}
              className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <Paperclip className="w-4 h-4 text-emerald-700" />
            Adjuntar automáticamente el Estado de Cuenta en PDF (Estado_de_Cuenta_IAMEC_RIF.pdf) si el usuario tiene deuda
          </label>
          <span className="text-[11px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">
            ACTIVO
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-600" /> Datos de Remitente y Asunto
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Remitente Oficial</label>
            <input
              type="text"
              defaultValue="IAMEC Naguanagua • Alcaldía de Naguanagua"
              readOnly
              className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Remitente</label>
            <input
              type="email"
              defaultValue="facturacion@globalgreenrec.com"
              readOnly
              className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Asunto de la Campaña *</label>
          <input
            type="text"
            value={asunto}
            onChange={e => setAsunto(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* VISTA PREVIA DEL CONTENIDO DEL DOCX */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" /> Vista Previa del Correo Configurado
          </h3>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            Logos Oficiales: Alcaldía + Gestión + IAMEC
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 space-y-2.5 leading-relaxed">
          <div className="text-center font-extrabold text-emerald-900 text-sm uppercase">
            ESTADO DE CUENTA ASEO NAGUANAGUA — FAVOR LEER TEXTO COMPLETO
          </div>
          <p>
            Nos dirigimos a Ud., en la oportunidad de remitir <strong>estado de cuenta contentivo de su deuda (total o parcial)</strong> de la tasa de Aseo Urbano del Municipio Naguanagua. Por favor tenga en consideración las siguientes pautas:
          </p>
          <div className="bg-white border border-emerald-200 rounded p-3 space-y-1.5">
            <div className="font-bold text-emerald-900">• Los datos para realizar el pago son los siguientes:</div>
            <div>
              <strong>- BANCO: BANESCO</strong> | <strong>N° CUENTA:</strong> <span className="font-mono">0134-1089-59-0001008636</span> | <strong>CORRIENTE</strong> | <strong>TITULAR:</strong> INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) | <strong>RIF:</strong> G-20008614-9
            </div>
            <div>
              <strong>- BANCO: BANCAMIGA</strong> | <strong>N° CUENTA:</strong> <span className="font-mono">0172-0110-71-1101340717</span> | <strong>CORRIENTE</strong> | <strong>TITULAR:</strong> INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) | <strong>RIF:</strong> G-20008614-9
            </div>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Los pagos deben hacerse por <strong>MES O MESES COMPLETOS</strong>.</li>
            <li>La factura es emitida por el <strong>Instituto Autónomo Municipal De Ecosocialismo Naguanagua (IAMEC) RIF G-20008614-9</strong>.</li>
            <li>El comprobante de pago por transferencia, favor remitirlo a través del presente correo, indicando: usuario aseo urbano, razón social o nombre, RIF o CI, correo electrónico, número de teléfono y período pagado.</li>
            <li><strong>Contribuyentes Especiales:</strong> Retención 75% (exentos de I.S.L.R.). Número de factura diferente al número de control. Pago máximo el <strong>día 28 del mes</strong> (otros bancos) o <strong>día 30 del mes</strong> (Banesco a Banesco / Bancamiga a Bancamiga).</li>
          </ul>
          <div className="pt-1 border-t border-slate-200 text-[11px] font-semibold text-slate-600">
            Whatsapp Comercial: 0424-4282365 – Correo: aseoresnaguanagua@globalgreenca.com<br />
            WhatsApp Residencial: 0424-4282364 – Correo: aseocomnaguanagua@globalgreenca.com
          </div>
        </div>
      </div>
    </div>
  );

  const destinatariosTabContent = (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h4 className="font-bold text-slate-800">Contribuyentes con Deuda y Correo Válido</h4>
          <p className="text-xs text-slate-500">
            Usuarios activos con deuda pendiente y correo electrónico real registrado a quienes se les adjuntará su Estado de Cuenta en PDF.
          </p>
        </div>
        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
          {resumen.totalConDeuda.toLocaleString('es-VE')} Contribuyentes ({resumen.correosUnicosConDeuda.toLocaleString('es-VE')} correos únicos)
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-slate-500 font-semibold block">Residencial (Con Deuda + Correo)</span>
          <span className="font-extrabold text-slate-800 text-base">
            {resumen.residencialesConDeuda.toLocaleString('es-VE')} usuarios
          </span>
        </div>
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-slate-500 font-semibold block">Comercial e Industrial (Con Deuda + Correo)</span>
          <span className="font-extrabold text-slate-800 text-base">
            {resumen.comercialesConDeuda.toLocaleString('es-VE')} usuarios
          </span>
        </div>
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-slate-500 font-semibold block">Condominios (Con Deuda + Correo)</span>
          <span className="font-extrabold text-slate-800 text-base">
            {resumen.condominiosConDeuda.toLocaleString('es-VE')} condominios
          </span>
        </div>
      </div>
      <div className="pt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100">
        <span>Total general con correo válido (incluyendo solventes):</span>
        <strong>
          {resumen.totalContribuyentesConCorreo.toLocaleString('es-VE')} contribuyentes ({resumen.correosUnicosTotal.toLocaleString('es-VE')} correos únicos)
        </strong>
      </div>
    </div>
  );

  const tabs = [
    { id: 'configurar', label: 'Configuración y Plantilla', icon: <Settings className="w-4 h-4" />, content: configTabContent },
    { id: 'destinatarios', label: 'Segmentos y Destinatarios', icon: <Users className="w-4 h-4" />, content: destinatariosTabContent },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-800">Sistema de Envío Masivo de Estados de Cuenta</h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Listo para Emitir (PDF Adjunto Automático)
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            Envío masivo del comunicado oficial de cobranza con el Estado de Cuenta en PDF adjunto para cada contribuyente con deuda.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 shadow-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          )}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Left - Filters */}
        <div className="w-full lg:w-1/4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 text-left">
              Destinatarios Seleccionados
            </h3>
            <div className="text-3xl font-extrabold text-emerald-600">
              {destinatariosSeleccionados.toLocaleString('es-VE')}
            </div>
            <div className="text-[11px] text-slate-500 uppercase font-semibold mt-1">
              Usuarios a Enviar ({estatusFiltro.includes('Morosos') ? 'Con Deuda + PDF' : estatusFiltro})
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Segmentación</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Inmueble</label>
              <select
                value={tipoFiltro}
                onChange={e => setTipoFiltro(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm outline-none bg-white"
              >
                <option>Todos los Sectores</option>
                <option>Solo Comercial e Industrial</option>
                <option>Solo Residencial</option>
                <option>Solo Condominios</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estatus Tributario</label>
              <select
                value={estatusFiltro}
                onChange={e => setEstatusFiltro(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm outline-none bg-white"
              >
                <option>Solo Morosos (Con deuda &gt; 1 mes)</option>
                <option>Todos (Solventes y Morosos)</option>
                <option>Solo Solventes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Main Content - Tabs & Settings */}
        <div className="w-full lg:w-3/4 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <Tabs tabs={tabs} />
          </div>

          {/* Right sidebar - Settings for Sending */}
          <div className="w-full md:w-72 shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Acciones de Despacho</h3>

              <div className="pt-2 space-y-3">
                <button
                  onClick={handleSendTest}
                  disabled={isSendingTest || isSending}
                  className="w-full bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 py-2.5 px-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enviando prueba...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" /> Enviar Prueba con PDF
                    </>
                  )}
                </button>

                <button
                  onClick={handleSendMassive}
                  disabled={isSending || isSendingTest}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Procesando Lotes...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Iniciar Envío Masivo ({destinatariosSeleccionados.toLocaleString('es-VE')})
                    </>
                  )}
                </button>

                {isSending && (
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Procesando...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <strong>PDF Adjunto Automático:</strong> A cada contribuyente con deuda se le genera y adjunta en vivo su <code>Estado_de_Cuenta_IAMEC_RIF.pdf</code> con el desglose en Bs. y las cuentas oficiales de IAMEC.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
