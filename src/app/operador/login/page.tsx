'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Lock, Building2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function OperadorLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const userUpper = usuario.trim().toUpperCase();

    // Mantener bypass para CATASTRO e HACIENDA temporalmente si es necesario
    if (userUpper === 'CATASTRO' || userUpper === 'HACIENDA') {
      if (clave !== '1042700') {
        setError('Clave incorrecta para este usuario especial');
        return;
      }
      localStorage.setItem('operador_censo_auth', userUpper);
      router.push('/operador');
      return;
    }

    if (usuario.trim().length === 0 || clave.length === 0) {
      setError('Credenciales incompletas');
      return;
    }

    setIsAuthenticating(true);
    setError('');

    try {
      const { data, error: dbError } = await supabase
        .from('trabajadores')
        .select('*')
        .eq('usuario', usuario.trim())
        .eq('estado', 'Activo')
        .single();

      if (dbError || !data) {
        setError('Usuario no encontrado o inactivo');
        setIsAuthenticating(false);
        return;
      }

      if (data.clave === clave) {
        localStorage.setItem('operador_censo_auth', usuario.trim());
        localStorage.setItem('operador_user_data', JSON.stringify(data));
        router.push('/operador');
      } else {
        setError('Contraseña incorrecta');
      }
    } catch (err) {
      console.error(err);
      setError('Error al conectar con la base de datos');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10  pointer-events-none"></div>
      
      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="pt-8 pb-6 px-6 text-center border-b border-slate-100">
            <div className="flex justify-center mb-2">
              <img src="/logos/global_rec.jpg" alt="Global Rec" className="h-14 w-auto object-contain" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Global Rec</h1>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mt-0.5">Collection System</p>
            <p className="text-xs font-bold text-slate-600 mt-2 uppercase tracking-widest">Módulo Operador</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center border border-red-200 font-semibold">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Usuario Asignado</label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                  <input 
                    type="text" 
                    required
                    value={usuario}
                    onChange={e => setUsuario(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:border-slate-400 focus:bg-white transition-all font-medium text-slate-700" 
                    placeholder="Ej. jperez"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Contraseña</label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    value={clave}
                    onChange={e => setClave(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-10 py-2.5 text-sm outline-none focus:border-slate-400 focus:bg-white transition-all font-medium text-slate-700" 
                    placeholder="********"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      setShowPassword(!showPassword);
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isAuthenticating}
              className="w-full bg-[#c8e64c] hover:bg-[#b8d93c] text-slate-900 font-bold py-3.5 px-4 rounded-xl text-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isAuthenticating ? <AlertCircle className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              {isAuthenticating ? 'Verificando...' : 'Iniciar Jornada'}
            </button>
          </form>
        </div>
        
        <p className="text-center text-slate-500 text-xs mt-6 font-medium">
          Sistema Exclusivo de Empadronamiento de Calle
        </p>
      </div>
    </div>
  );
}
