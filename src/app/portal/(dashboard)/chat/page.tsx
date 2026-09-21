'use client';
import { Send, User, MessageCircle } from 'lucide-react';
import { useState } from 'react';

export default function ChatPage() {
  const [message, setMessage] = useState('');
  
  return (
    <div className="h-[calc(100vh-10rem)] bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-4">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center relative">
          <MessageCircle className="w-5 h-5 text-blue-600" />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        </div>
        <div>
          <h2 className="font-semibold text-slate-700 text-sm">Soporte en línea GLOBAL REC</h2>
          <p className="text-xs text-green-600 font-medium">Agentes disponibles</p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50 space-y-6">
        <div className="flex gap-4">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-1">
            <MessageCircle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="bg-white p-4 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm max-w-[80%]">
            <p className="text-sm text-slate-700">¡Hola! Bienvenido al sistema de soporte de Global Rec. ¿En qué podemos ayudarte el día de hoy?</p>
            <span className="text-[10px] text-slate-400 block mt-2">10:00 AM</span>
          </div>
        </div>
        
        <div className="flex gap-4 flex-row-reverse">
          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center shrink-0 mt-1">
            <User className="w-4 h-4 text-slate-600" />
          </div>
          <div className="bg-blue-600 p-4 rounded-2xl rounded-tr-sm shadow-sm max-w-[80%] text-white">
            <p className="text-sm">Hola, tengo una consulta sobre mi recibo de pago de este mes.</p>
            <span className="text-[10px] text-blue-200 block mt-2 text-right">10:05 AM</span>
          </div>
        </div>
      </div>

      {/* Chat Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <form 
          onSubmit={(e) => { e.preventDefault(); setMessage(''); }}
          className="flex items-center gap-2"
        >
          <input 
            type="text" 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje aquí..." 
            className="flex-1 px-4 py-3 text-sm border border-slate-300 rounded-full focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50"
          />
          <button 
            type="submit"
            disabled={!message.trim()}
            className="w-12 h-12 bg-[#ff5722] text-white rounded-full flex items-center justify-center hover:bg-[#f4511e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>
    </div>
  );
}
