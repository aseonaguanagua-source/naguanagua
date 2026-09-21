'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Key, ShieldCheck, ArrowLeft, Loader2, Lock, Eye, EyeOff } from 'lucide-react';

function ResetContrasenaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [clave, setClave] = useState('');
  const [confirmClave, setConfirmClave] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Enlace inválido o expirado. Por favor, solicite un nuevo enlace de recuperación.');
    }
  }, [token]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (clave !== confirmClave) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (clave.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`/api/contribuyente/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clave })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Error al restablecer la contraseña.');
      }
      setIsLoading(false);
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
        </div>

        <div className="p-8">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold text-slate-800">Restablecer Contraseña</h2>
            {!success && !error && <p className="text-sm text-slate-500 mt-1">Ingrese su nueva contraseña.</p>}
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium">
              {error}
            </div>
          )}

          {success ? (
            <div className="text-center">
              <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium">
                ¡Su contraseña ha sido restablecida con éxito! Ya puede iniciar sesión con su nueva contraseña.
              </div>
              <Link href="/portal" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                Ir a Iniciar Sesión
              </Link>
            </div>
          ) : (
            token && !error && (
              <form onSubmit={handleReset} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      placeholder="********"
                      className="w-full border-2 border-slate-200 rounded-lg pl-10 pr-10 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-green-500" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                    Confirmar Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Key className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required
                      value={confirmClave}
                      onChange={(e) => setConfirmClave(e.target.value)}
                      placeholder="********"
                      className="w-full border-2 border-slate-200 rounded-lg pl-10 pr-10 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-green-500" 
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
                      <Key className="w-5 h-5" /> Guardar Contraseña
                    </>
                  )}
                </button>
              </form>
            )
          )}

          {!success && (
            <div className="mt-6 text-center">
              <Link href="/portal" className="text-sm text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Volver al Inicio de Sesión
              </Link>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            Acceso seguro y encriptado
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetContrasena() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>}>
      <ResetContrasenaContent />
    </Suspense>
  );
}
