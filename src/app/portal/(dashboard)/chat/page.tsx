'use client';
import { MessageCircle, Mail, Phone, MapPin, Clock, ExternalLink } from 'lucide-react';

export default function ChatPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-xs">
              <MessageCircle className="w-8 h-8 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-xl font-black">Centro de Atención al Contribuyente</h1>
              <p className="text-xs text-emerald-200 mt-1">
                Instituto Autónomo Municipal de Ecosocialismo (IAMEC)
              </p>
            </div>
          </div>
        </div>

        {/* Canales Oficiales */}
        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-600 leading-relaxed">
            Estimado contribuyente: Ponemos a su disposición los canales oficiales directos de atención ciudadana y asesoría tributaria para la resolución de trámites, estados de cuenta, solvencias y servicios especiales.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* WhatsApp Recaudación */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">Atención WhatsApp Directa</span>
                <h3 className="font-bold text-slate-800 text-sm mt-1">Taquilla y Recaudación</h3>
                <p className="text-xs text-slate-500 mt-1">Asesoría inmediata sobre pagos, verificación de referencias y solvencias.</p>
              </div>
              <a 
                href="https://wa.me/584120400000" 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-lg transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Escribir por WhatsApp
              </a>
            </div>

            {/* Correo Electrónico Institucional */}
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider">Despacho Fiscal</span>
                <h3 className="font-bold text-slate-800 text-sm mt-1">Facturación y Retenciones</h3>
                <p className="text-xs text-slate-500 mt-1">Envío de comprobantes de retención IVA 75% y certificados SENIAT.</p>
              </div>
              <a 
                href="mailto:facturacion.naguanagua@gmail.com" 
                className="mt-4 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4" /> Enviar Correo
              </a>
            </div>
          </div>

          {/* Horario y Sede Presencial */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" /> Sede de Atención Presencial
            </h4>
            <p className="text-xs text-slate-600">
              Avenida Libertador, frente a la Plaza Bolívar, Centro Comercial o Edificio Sede IAMEC, Naguanagua, Estado Carabobo.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Lunes a Viernes de 8:00 AM a 4:00 PM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
