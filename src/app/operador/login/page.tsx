'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const PUESTOS_OPERADOR = [
  { puesto: 'Operador de Censo / Catastro', usuario: 'censo', defaultClave: 'censo123', redirect: '/operador' },
  { puesto: 'Cobro Móvil / Campo', usuario: 'cobromovil', defaultClave: 'movil123', redirect: '/cobro-movil' },
  { puesto: 'Catastro Especial', usuario: 'CATASTRO', defaultClave: '1042700', redirect: '/operador' },
  { puesto: 'Hacienda Especial', usuario: 'HACIENDA', defaultClave: '1042700', redirect: '/operador' },
  { puesto: 'Taquilla / Cajero', usuario: 'cajero', defaultClave: 'cajero123', redirect: '/admin/caja' },
  { puesto: 'Administrador', usuario: 'dzara', defaultClave: 'dzara', redirect: '/admin' },
];

export default function OperadorLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [targetModulo, setTargetModulo] = useState<string | null>(null);

  useEffect(() => {
    // Detectar si venimos por un módulo específico (ej. cobromovil o censo)
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const modulo = params.get('modulo') || params.get('puesto');
        if (modulo) {
          setTargetModulo(modulo);
          if (modulo === 'censo' || modulo === 'operador') {
            setUsuario('censo');
          } else if (modulo === 'cobromovil' || modulo === 'cobro-movil') {
            setUsuario('cobromovil');
          }
        }
      } catch {}
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = usuario.trim();

    if (!u || !clave) {
      setError('Por favor ingrese su usuario y contraseña');
      return;
    }

    setIsAuthenticating(true);
    setError('');

    const userUpper = u.toUpperCase();

    // Bypass especial para CATASTRO e HACIENDA
    if (userUpper === 'CATASTRO' || userUpper === 'HACIENDA') {
      if (clave !== '1042700') {
        setError('Contraseña incorrecta para este usuario especial');
        setIsAuthenticating(false);
        return;
      }
      localStorage.setItem('operador_censo_auth', userUpper);
      localStorage.setItem('adminUser', userUpper);
      router.push('/operador');
      return;
    }

    try {
      // 1. Verificar presets del sistema
      const matchPreset = PUESTOS_OPERADOR.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === clave) {
        localStorage.setItem('operador_censo_auth', matchPreset.usuario);
        localStorage.setItem('adminUser', matchPreset.usuario);
        localStorage.setItem('operador_user_data', JSON.stringify({ 
          usuario: matchPreset.usuario, 
          rol: matchPreset.puesto 
        }));

        if (targetModulo === 'cobromovil' || matchPreset.usuario === 'cobromovil') {
          router.push('/cobro-movil');
        } else {
          router.push(matchPreset.redirect || '/operador');
        }
        return;
      }

      // 2. Verificar trabajadores registrados en base de datos Supabase
      const { data, error: dbError } = await supabase
        .from('trabajadores')
        .select('id, nombre, usuario, clave, rol, estado')
        .eq('usuario', u)
        .eq('estado', 'Activo')
        .single();

      if (dbError || !data) {
        setError('Usuario no encontrado o inactivo');
        setIsAuthenticating(false);
        return;
      }

      // Soporte dual: bcrypt o texto plano
      const isHashed = data.clave?.startsWith('$2b$') || data.clave?.startsWith('$2a$');
      let passwordValid = false;
      if (isHashed) {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: clave }),
        });
        passwordValid = res.ok;
      } else {
        passwordValid = data.clave === clave;
      }

      if (passwordValid) {
        localStorage.setItem('operador_censo_auth', data.usuario);
        localStorage.setItem('adminUser', data.usuario);
        localStorage.setItem('operador_user_data', JSON.stringify(data));

        if (targetModulo === 'cobromovil' || data.rol === 'Cobro Móvil') {
          router.push('/cobro-movil');
        } else {
          router.push('/operador');
        }
      } else {
        setError('Contraseña incorrecta');
      }
    } catch (err) {
      console.error(err);
      setError('Error al conectar con el servidor de autenticación');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white rounded-[28px] shadow-2xl p-7 sm:p-8 text-slate-800">
          {/* Encabezado con logos oficiales */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="/logos/alcaldia.png" alt="Alcaldía de Naguanagua" className="h-10 w-auto object-contain" />
            <div className="w-[1px] h-6 bg-slate-200" />
            <img src="/logos/IAMEC.png" alt="IAMEC" className="h-9 w-auto object-contain" />
          </div>

          <h1 className="text-xl font-black text-slate-900 tracking-tight text-center">Acceso de Operador</h1>
          <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase text-center mt-0.5">
            {targetModulo === 'cobromovil' ? 'MÓDULO DE COBRO MÓVIL' : 'JORNADAS Y EMPADRONAMIENTO'}
          </p>

          <div className="border-t border-slate-100 my-5" />

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs text-center border border-red-200 font-semibold flex items-center justify-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5 text-left">
                USUARIO
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ingrese su usuario"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5 text-left">
                CONTRASEÑA
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all tracking-wider"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-none cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-[#c8e844] hover:bg-[#b8d937] text-slate-900 font-extrabold py-3.5 px-4 rounded-xl text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer border-none mt-2"
            >
              {isAuthenticating ? (
                <AlertCircle className="w-5 h-5 animate-spin text-slate-900" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-slate-900 stroke-[2.5]" />
              )}
              <span>{isAuthenticating ? 'Verificando...' : 'Ingresar'}</span>
            </button>
          </form>

          <div className="text-center pt-4 mt-4 border-t border-slate-100">
            <a href="/" className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
              ← Volver al Portal de la Alcaldía
            </a>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6 font-medium">
          Sistema de Recaudación y Empadronamiento Municipal
        </p>
      </div>
    </div>
  );
}
