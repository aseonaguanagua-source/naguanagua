'use client';
import React, { useState, useEffect } from 'react';
import { Lock, User, AlertCircle , Eye, EyeOff} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';


export default function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth_andministrador');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  // AUTO LOGOUT LOGIC (5 MINUTES)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logAudit('Logout (Inactividad 7m)', {}, 'SESION');
        localStorage.removeItem('admin_auth_andministrador');
        localStorage.removeItem('admin_user_data');
        localStorage.removeItem('adminUser');
        localStorage.removeItem('adminLetra');
        localStorage.removeItem('adminToken');
        setIsAuthenticated(false);
        window.location.href = '/admin'; // Force full reload to login screen
      }, 420000); // 7 minutes
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer(); // Start the timer

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError('');

    // Fix C-1: Master password hardcodeado ELIMINADO del bundle público.
    // Para acceso de superadmin: crear un registro en la tabla 'trabajadores' con
    // usuario='dzara', clave (hasheada con bcrypt), rol='SuperAdmin', estado='Activo'.
    // El login ahora pasa SIEMPRE por Supabase, nunca por comparación en cliente.

    try {
      const { data, error: dbError } = await supabase
        .from('trabajadores')
        .select('*')
        .eq('usuario', username.trim())
        .eq('estado', 'Activo')
        .single();

      if (dbError || !data) {
        setError('Usuario no encontrado o inactivo');
        setIsAuthenticating(false);
        return;
      }

      if (data.clave === password) {
        localStorage.setItem('admin_auth_andministrador', 'true');
        localStorage.setItem('admin_user_data', JSON.stringify(data));
        localStorage.setItem('adminUser', data.usuario);
        setIsAuthenticated(true);
        logAudit('Login Exitoso', { usuario: data.usuario, rol: data.rol }, 'SESION');
      } else {
        setError('Contraseña incorrecta');
        logAudit('Intento de Login Fallido', { usuario: username, error: 'Contrasena incorrecta' }, 'SESION');
      }
    } catch (err) {
      console.error(err);
      setError('Error al conectar con la base de datos');
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Cargando...</div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-slate-100 overflow-hidden">
            {/* Header branding */}
            <div className="pt-10 pb-6 px-8 text-center">
              <div className="flex justify-center mb-3">
                <img src="/logos/global_rec.jpg" alt="Global Rec" className="h-16 w-auto object-contain" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Global Rec</h1>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase mt-0.5">Collection System</p>
              <p className="text-sm font-bold text-slate-700 mt-3 uppercase tracking-widest">Administración</p>
            </div>
            <div className="px-8 pb-8">
              <p className="text-sm text-slate-500 text-center mb-6 leading-snug">Ingresa tus credenciales para acceder de forma segura.</p>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Usuario</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:border-slate-400 outline-none transition-all font-medium text-slate-700"
                  placeholder="Ingrese usuario"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:border-slate-400 outline-none transition-all font-medium text-slate-700"
                  placeholder="Ingrese contraseña"
                  required
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

            {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}

            <button 
              type="submit" 
              disabled={isAuthenticating}
              className="w-full bg-[#c8e64c] hover:bg-[#b8d93c] text-slate-900 text-white font-bold py-3 rounded-lg shadow-md shadow-blue-500/30 transition-all mt-4 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAuthenticating ? <AlertCircle className="w-5 h-5 animate-spin" /> : null}
              {isAuthenticating ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


