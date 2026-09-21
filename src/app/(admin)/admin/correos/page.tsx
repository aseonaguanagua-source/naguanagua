'use client';
import React, { useState } from 'react';
import { Tabs } from '@/components/Tabs';
import { Mail, Settings, Users, Send, CheckCircle, Loader2 } from 'lucide-react';

export default function CorreosPage() {
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState(`<div style="font-family: Arial, sans-serif; color: #333;">\n  <h3>Estimado(a) {{nombre}},</h3>\n  <p>Le escribimos para notificarle sobre el estado actual de su servicio.</p>\n  <p>Su saldo a la fecha es de: <strong>{{saldo}}</strong></p>\n  <p>Si tiene alguna duda, por favor contáctenos.</p>\n  <br>\n  <p><small>Para dejar de recibir estos correos, haga clic <a href="{{unsubscribe_link}}">aquí</a>.</small></p>\n</div>`);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const totalContacts = 630;

  const handleSend = () => {
    if (!asunto.trim()) {
      alert("Por favor, ingrese un asunto para la campaña.");
      return;
    }
    
    setIsSending(true);
    setProgress(0);
    setShowSuccess(false);

    // Simulate sending process
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setIsSending(false);
          setShowSuccess(true);
          return 100;
        }
        return p + 10;
      });
    }, 300);
  };

  const configTabContent = (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide flex items-center gap-2">
          <Settings className="w-4 h-4" /> Plantillas
        </h3>
        <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500">
          <option>-- Seleccionar plantilla --</option>
          <option>Aviso de Cobro (Predeterminado)</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded p-4 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Mail className="w-4 h-4" /> Redactar
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre Remitente</label>
            <input type="text" defaultValue="SiRID - SILVA" autoComplete="off" className="w-full border border-slate-300 bg-slate-50 rounded px-3 py-2 text-sm text-slate-700 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email Remitente</label>
            <input type="email" defaultValue="aseodesilva@sirid.net" autoComplete="off" className="w-full border border-slate-300 bg-slate-50 rounded px-3 py-2 text-sm text-slate-700 outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Asunto *</label>
          <input 
            type="text" 
            placeholder="Ej: Estado de cuenta actual" 
            value={asunto}
            autoComplete="off"
            onChange={e => setAsunto(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Contenido HTML *</label>
          <textarea 
            rows={10} 
            value={contenido}
            onChange={e => setContenido(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 font-mono"
          />
          <p className="text-xs text-slate-500 mt-2">
            Variables: <span className="text-red-400 bg-red-50 px-1 rounded">{'{{nombre}}'}</span> <span className="text-red-400 bg-red-50 px-1 rounded">{'{{saldo}}'}</span> <span className="text-red-400 bg-red-50 px-1 rounded">{'{{actividad}}'}</span>
          </p>
        </div>
      </div>
    </div>
  );

  const destinatariosTabContent = (
    <div className="bg-white border border-slate-200 rounded p-4 text-center text-slate-500 py-12 shadow-sm">
      630 destinatarios coinciden con los filtros actuales listos para recibir la campaña.
    </div>
  );

  const tabs = [
    { id: 'configurar', label: 'Configurar', icon: <Settings className="w-4 h-4" />, content: configTabContent },
    { id: 'destinatarios', label: 'Destinatarios', icon: <Users className="w-4 h-4" />, content: destinatariosTabContent },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <Send className="w-5 h-5 text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
          Sistema de Envío Masivo
        </h1>
      </div>

      {showSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded relative flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span className="block sm:inline font-medium">¡Campaña enviada con éxito!</span>
          </div>
          <span className="text-sm text-emerald-600">Se procesaron {totalContacts} correos.</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Left - Filters */}
        <div className="w-full lg:w-1/4 space-y-4">
          <div className="bg-white border border-slate-200 rounded p-4 text-center shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 text-left">Resumen</h3>
            <div className="text-3xl font-bold text-green-500">{totalContacts}</div>
            <div className="text-[10px] text-slate-400 uppercase">Contactos Filtrados</div>
          </div>

          <div className="bg-white border border-slate-200 rounded p-4 space-y-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 text-left">Filtros</h3>
            
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tipo de Inmueble</label>
              <select className="w-full border border-slate-300 rounded px-2 py-1 text-sm outline-none">
                <option>Todos</option>
                <option>Residencial</option>
                <option>Comercial</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Estatus</label>
              <select className="w-full border border-slate-300 rounded px-2 py-1 text-sm outline-none">
                <option>Todos</option>
                <option>Solvente</option>
                <option>Moroso</option>
              </select>
            </div>

            <button className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded text-sm font-medium transition-colors shadow-sm">
              Filtrar Contactos
            </button>
          </div>
        </div>

        {/* Main Content - Tabs & Settings */}
        <div className="w-full lg:w-3/4 flex gap-6">
          <div className="flex-1">
            <Tabs tabs={tabs} />
          </div>
          
          {/* Right sidebar - Settings for Sending */}
          <div className="w-64 shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded p-4 space-y-4 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Acciones</h3>
              
              <div className="pt-2 space-y-3">
                <button 
                  disabled={isSending}
                  className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  Vista Previa
                </button>
                
                <button 
                  onClick={handleSend}
                  disabled={isSending}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Lanzar Campaña</>
                  )}
                </button>

                {isSending && (
                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Enviando...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
