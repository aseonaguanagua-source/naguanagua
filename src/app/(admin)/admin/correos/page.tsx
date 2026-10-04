'use client';
import React, { useState } from 'react';
import { Tabs } from '@/components/Tabs';
import { Mail, Settings, Users, Send, CheckCircle, Loader2, ShieldCheck, AlertCircle, Eye } from 'lucide-react';

export default function CorreosPage() {
  const [asunto, setAsunto] = useState('Comunicado Oficial - Renovación de Plataforma Digital IAMEC Naguanagua');
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [estatusFiltro, setEstatusFiltro] = useState('Todos');
  
  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [totalContacts, setTotalContacts] = useState(35763);

  // Enviar correo de prueba a davidzara66@gmail.com
  const handleSendTest = async () => {
    setIsSendingTest(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Correo de prueba despachado exitosamente a davidzara66@gmail.com.`
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en envío de prueba: ${data.error || 'Fallo desconocido'}`
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error de conexión: ' + e.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Lanzar campaña masiva por lotes
  const handleSendMassive = async () => {
    if (!confirm('¿Desea iniciar el envío masivo? En Modo de Pruebas todos los correos se enviarán de forma segura.')) {
      return;
    }

    setIsSending(true);
    setProgress(10);
    setStatusMessage(null);

    try {
      const progressTimer = setInterval(() => {
        setProgress(p => (p < 90 ? p + 15 : p));
      }, 800);

      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: false })
      });

      clearInterval(progressTimer);
      setProgress(100);

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Campaña completada: ${data.enviados} correos procesados exitosamente.`
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en la campaña masiva: ${data.error}`
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
          <Settings className="w-4 h-4 text-emerald-600" /> Plantillas Institucionales Oficiales
        </h3>
        <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500">
          <option>Comunicado Oficial - Renovación Tecnológica e Instructivo Portal (Predeterminado)</option>
          <option>Aviso de Cobro Mensual / Estado de Cuenta</option>
          <option>Citación y Notificación Administrativa de Deuda</option>
        </select>
        <p className="text-xs text-slate-500 mt-2">
          La plantilla incluye automáticamente los membretes oficiales de la Alcaldía de Naguanagua e IAMEC, colores institucionales y botones de acceso al portal.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-600" /> Datos de Remitente
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Remitente Oficial</label>
            <input 
              type="text" 
              defaultValue="IAMEC Naguanagua &bull; Alcaldía de Naguanagua" 
              readOnly
              className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none font-medium" 
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Remitente</label>
            <input 
              type="email" 
              defaultValue="iamec.naguanagua@globalgreenca.com" 
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
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500" 
          />
        </div>
      </div>
    </div>
  );

  const destinatariosTabContent = (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h4 className="font-bold text-slate-800">Destinatarios Calificados</h4>
          <p className="text-xs text-slate-500">Contribuyentes con correo electrónico registrado en la base de datos municipal.</p>
        </div>
        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
          35.763 Contribuyentes
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-slate-400 font-semibold block">Individual / Residencial</span>
          <span className="font-bold text-slate-800 text-sm">~ 31.400 correos</span>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-slate-400 font-semibold block">Comercial / Industrial</span>
          <span className="font-bold text-slate-800 text-sm">~ 3.800 correos</span>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-slate-400 font-semibold block">Condominios</span>
          <span className="font-bold text-slate-800 text-sm">~ 560 administraciones</span>
        </div>
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">Sistema de Envío Masivo de Correos</h1>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Modo Prueba Activo: davidzara66@gmail.com
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            Difusión masiva controlada de comunicados oficiales, estados de cuenta mensuales y citaciones a los contribuyentes.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 shadow-sm ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Left - Filters */}
        <div className="w-full lg:w-1/4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 text-left">Padrón Destinatario</h3>
            <div className="text-3xl font-extrabold text-emerald-600">35.763</div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold mt-1">Contribuyentes Registrados</div>
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
                <option>Todos (Solventes y Morosos)</option>
                <option>Solo Morosos (Con deuda &gt; 1 mes)</option>
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
                {/* Botón de prueba previa */}
                <button 
                  onClick={handleSendTest}
                  disabled={isSendingTest || isSending}
                  className="w-full bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 py-2.5 px-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSendingTest ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando prueba...</>
                  ) : (
                    <><Eye className="w-4 h-4" /> Probar en davidzara66@gmail.com</>
                  )}
                </button>
                
                {/* Botón de campaña masiva */}
                <button 
                  onClick={handleSendMassive}
                  disabled={isSending || isSendingTest}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Procesando Lotes...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Iniciar Envío Masivo</>
                  )}
                </button>

                {isSending && (
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Procesando...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <strong>Protección activa:</strong> El sistema procesa los envíos en bloques concurrentes de 10 en 10 con retardos de 500ms para garantizar alta entregabilidad.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
