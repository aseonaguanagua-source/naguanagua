const fs = require('fs');

const layoutPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/cobro-movil/layout.tsx';

const layoutContent = `'use client';
import { useState, useEffect } from 'react';
import { AppProvider } from '@/store/AppContext';
import { Smartphone, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STORAGE_KEY = 'cobro_movil_auth';

export default function CobroMovilLayout({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [nombreCobrador, setNombreCobrador] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Session valid for 8 hours
        if (parsed.ts && Date.now() - parsed.ts < 8 * 60 * 60 * 1000) {
          setNombreCobrador(parsed.nombre || '');
          setIsAuth(true);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch(e) {}
    setLoading(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLogging(true);
    setError('');

    // Master admin bypass
    if (usuario.toLowerCase() === 'dzara' && (clave === 'dzara' || clave === 'andministrador')) {
      const session = { nombre: 'Administrador', rol: 'Administrador', ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      localStorage.setItem('adminUser', 'dzara');
      setNombreCobrador('Administrador');
      setIsAuth(true);
      setIsLogging(false);
      return;
    }

    try {
      const { data, error: dbErr } = await supabase
        .from('trabajadores')
        .select('*')
        .eq('usuario', usuario.trim())
        .eq('estado', 'Activo')
        .single();

      if (dbErr || !data) {
        setError('Usuario no encontrado o inactivo.');
        setIsLogging(false);
        return;
      }

      if (data.clave !== clave) {
        setError('Contraseña incorrecta.');
        setIsLogging(false);
        return;
      }

      const session = { nombre: data.nombre || data.usuario, rol: data.rol, ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      localStorage.setItem('adminUser', data.usuario);
      setNombreCobrador(data.nombre || data.usuario);
      setIsAuth(true);

      // Also set admin auth so AppContext works
      localStorage.setItem('admin_auth_andministrador', 'true');
      localStorage.setItem('admin_user_data', JSON.stringify(data));
    } catch(err) {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setIsLogging(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo / Branding */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-10 h-10 text-emerald-400" />
            </div>
            <h1 className="text-white text-2xl font-bold">Cobro Móvil</h1>
            <p className="text-slate-400 text-sm mt-1">Global Rec · Aseo Urbano</p>
          </div>

          {/* Form */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <p className="text-slate-400 text-sm text-center mb-5">
              Ingresa tus credenciales de trabajador para continuar
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {/* Usuario */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase block mb-1.5">Usuario</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={usuario}
                    onChange={e => setUsuario(e.target.value)}
                    placeholder="Tu usuario"
                    required
                    className="w-full bg-slate-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div>
                <label className="text-slate-400 text-xs font-semibold uppercase block mb-1.5">Contraseña</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={clave}
                    onChange={e => setClave(e.target.value)}
                    placeholder="Tu contraseña"
                    required
                    className="w-full bg-slate-700 text-white rounded-xl pl-10 pr-11 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLogging}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl text-sm transition-all active:scale-95 mt-1"
              >
                {isLogging ? 'Verificando...' : 'Entrar'}
              </button>
            </form>
          </div>

          <p className="text-slate-600 text-xs text-center mt-4">
            ← <a href="/" className="underline hover:text-slate-400">Volver al inicio</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Mini header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-bold text-sm">Cobro Móvil</span>
            {nombreCobrador && <span className="text-slate-400 text-xs">· {nombreCobrador}</span>}
          </div>
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setIsAuth(false);
              setUsuario('');
              setClave('');
            }}
            className="text-slate-500 hover:text-red-400 text-xs transition-colors"
          >
            Salir
          </button>
        </div>
        <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
          {children}
        </div>
      </div>
    </AppProvider>
  );
}
`;

fs.writeFileSync(layoutPath, layoutContent);
console.log('✅ cobro-movil/layout.tsx updated with standalone login');
