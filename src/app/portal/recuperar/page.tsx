'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Mail, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';

export default function RecuperarContrasena() {
  const router = useRouter();
  const [docType, setDocType] = useState('J');
  const [docNum, setDocNum] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (docNum.length < 6) {
      setError('Por favor ingrese un número de documento válido.');
      setIsLoading(false);
      return;
    }

    try {
      const fullDoc = `${docType}${docNum}`;
      const res = await fetch(`/api/contribuyente/recuperar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identidad: fullDoc })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess('Si su documento está registrado y tiene un correo asociado, le enviaremos un enlace de recuperación. Por favor revise su bandeja de entrada (y la carpeta de spam).');
        setIsLoading(false);
      } else {
        setError(data.error || 'Error al procesar la solicitud.');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Error de conexión.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-[#0f172a] p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 "></div>
          <div className="relative z-10 flex justify-center mb-4">
            <div className="bg-white/10 p-4 rounded-full backdrop-blur-sm">
              <Building2 className="w-10 h-10 text-green-400" />
            </div>
          </div>
          <h1 className="relative z-10 text-2xl font-bold text-white tracking-wider">
            <span className="text-green-500">GLOBAL</span> REC
          </h1>
          <p className="relative z-10 text-slate-400 mt-2 text-sm uppercase tracking-widest font-semibold">
            Portal del Contribuyente
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold text-slate-800">Recuperar Contraseña</h2>
            <p className="text-sm text-slate-500 mt-1">Ingrese su documento de identidad. Le enviaremos las instrucciones al correo registrado.</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm text-center font-medium">
              {success}
            </div>
          )}

          {!success && (
            <form onSubmit={handleRecuperar} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                  Documento de Identidad (RIF / Cédula)
                </label>
                <div className="flex gap-3">
                  <select 
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-1/4 border-2 border-slate-200 rounded-lg px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-green-500 bg-slate-50 appearance-none text-center"
                  >
                    <option value="J">J</option>
                    <option value="V">V</option>
                    <option value="G">G</option>
                    <option value="E">E</option>
                    <option value="P">P</option>
                  </select>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej: 123456789"
                    value={docNum}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setDocNum(val);
                      e.target.value = val;
                    }}
                    className="w-3/4 border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-green-500" 
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Mail className="w-5 h-5" /> Enviar Correo de Recuperación
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link href="/portal" className="text-sm text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Volver al Inicio de Sesión
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            Acceso seguro y encriptado
          </div>
        </div>
      </div>
    </div>
  );
}
