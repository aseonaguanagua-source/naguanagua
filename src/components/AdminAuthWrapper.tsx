'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { logAudit } from '@/lib/audit';

/**
 * AdminAuthWrapper — optimizado para velocidad de navegación
 *
 * PROBLEMA ANTERIOR:
 *   - fetch('/api/admin/session') bloqueaba el render en CADA navegación
 *   - Mostraba spinner mientras esperaba respuesta del servidor
 *
 * SOLUCIÓN:
 *   1. Cache en memoria (moduleSessionCache): si la sesión ya fue verificada
 *      en esta pestaña, no volver a fetchear — render instantáneo.
 *   2. Verificación optimista desde localStorage: si adminUser existe,
 *      mostrar el contenido inmediatamente mientras se verifica en background.
 *   3. Revalidación silenciosa: verifica la cookie en background sin spinner.
 *   4. Expiración de cache: re-verifica si han pasado más de 5 minutos.
 */

// Cache de sesión a nivel de módulo — persiste entre navegaciones sin perder estado
let moduleSessionCache: {
  valid: boolean;
  usuario?: string;
  nombre?: string;
  rol?: string;
  letra?: string;
  ts: number; // timestamp de la última verificación
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos antes de re-verificar

export default function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  // Estado optimista: si hay cache válida o adminUser en localStorage, arrancar autenticado
  const getInitialAuth = () => {
    if (typeof window === 'undefined') return false;
    if (moduleSessionCache?.valid && Date.now() - moduleSessionCache.ts < CACHE_TTL) return true;
    // Optimistic: si hay adminUser en localStorage, asumir válido mientras verificamos
    return !!localStorage.getItem('adminUser');
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(getInitialAuth);
  const [loading, setLoading] = useState<boolean>(() => {
    // Solo mostrar spinner si no hay cache ni adminUser (primera carga limpia)
    if (typeof window === 'undefined') return true;
    if (moduleSessionCache?.valid) return false;
    return !localStorage.getItem('adminUser');
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Verificar sesión via cookie httpOnly (Fix A-3)
  useEffect(() => {
    // Si la cache es reciente, no re-verificar
    if (moduleSessionCache?.valid && Date.now() - moduleSessionCache.ts < CACHE_TTL) {
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }

    // Verificación en background — no bloquea el render si ya hay adminUser
    const hasOptimisticAuth = typeof window !== 'undefined' && !!localStorage.getItem('adminUser');

    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          // Actualizar cache en memoria
          moduleSessionCache = {
            valid: true,
            usuario: data.usuario,
            nombre: data.nombre,
            rol: data.rol,
            letra: data.letra || '',
            ts: Date.now(),
          };
          // Actualizar localStorage con datos frescos
          if (typeof window !== 'undefined') {
            localStorage.setItem('adminUser', data.usuario);
            localStorage.setItem('adminLetra', data.letra || '');
            localStorage.setItem('admin_user_data', JSON.stringify({
              nombre: data.nombre,
              rol: data.rol,
              usuario: data.usuario,
            }));
          }
          setIsAuthenticated(true);
        } else {
          // Cookie inválida o expirada — limpiar todo
          moduleSessionCache = null;
          if (typeof window !== 'undefined') {
            ['admin_auth_andministrador', 'admin_user_data', 'adminUser', 'adminLetra', 'adminToken'].forEach(k =>
              localStorage.removeItem(k)
            );
          }
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        // Error de red: si hay optimistic auth, mantener; si no, desautenticar
        if (!hasOptimisticAuth) setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, []); // Solo al montar, la cache evita re-fetch en cada navegación

  // Auto-logout por inactividad (7 minutos)
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => handleLogout('Inactividad 7m'), 420_000);
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [isAuthenticated]);

  const handleLogout = useCallback(async (reason = 'Manual') => {
    logAudit(`Logout (${reason})`, {}, 'SESION');
    moduleSessionCache = null; // Limpiar cache de memoria
    if (typeof window !== 'undefined') {
      ['admin_auth_andministrador', 'admin_user_data', 'adminUser', 'adminLetra', 'adminToken'].forEach(k =>
        localStorage.removeItem(k)
      );
    }
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    setIsAuthenticated(false);
    window.location.href = '/admin';
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error de autenticación');
        logAudit('Intento de Login Fallido', { usuario: username, error: data.error }, 'SESION');
        return;
      }

      // Guardar en cache y localStorage
      moduleSessionCache = {
        valid: true,
        usuario: data.usuario,
        nombre: data.nombre,
        rol: data.rol,
        letra: data.letra || '',
        ts: Date.now(),
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('adminUser', data.usuario);
        localStorage.setItem('adminLetra', data.letra || '');
        localStorage.setItem('admin_user_data', JSON.stringify({
          nombre: data.nombre,
          rol: data.rol,
          usuario: data.usuario,
        }));
      }
      setIsAuthenticated(true);
      logAudit('Login Exitoso', { usuario: data.usuario, rol: data.rol }, 'SESION');

    } catch (err) {
      console.error(err);
      setError('Error al conectar con el servidor');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Spinner solo en primera carga sin sesión previa
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-slate-100 overflow-hidden">
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
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:border-slate-400 outline-none transition-all font-medium text-slate-700"
                      placeholder="Ingrese contraseña"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
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
                  className="w-full bg-[#c8e64c] hover:bg-[#b8d93c] text-slate-900 font-bold py-3 rounded-lg shadow-md transition-all mt-4 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
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
