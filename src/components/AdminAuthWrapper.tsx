'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { logAudit } from '@/lib/audit';

/**
 * AdminAuthWrapper — Fix A-3 (localStorage → httpOnly cookie)
 *
 * ANTES: Auth basada en localStorage.setItem('admin_auth_andministrador', 'true')
 *        → Cualquier XSS podía autenticarse sin contraseña.
 *        → Contraseña maestra 'dzara' hardcodeada en el bundle público.
 *
 * AHORA:
 *   - Login  → POST /api/admin/login   (cookie httpOnly emitida por servidor)
 *   - Verify → GET  /api/admin/session (verifica cookie, sin exponer token al cliente)
 *   - Logout → POST /api/admin/logout  (borra cookie desde servidor)
 *
 * La cookie httpOnly es INACCESIBLE desde JavaScript del cliente.
 * El único vector de bypass sería un XSS + CSRF combinado, que SameSite=Lax mitiga.
 *
 * Retrocompatibilidad: adminUser sigue en localStorage SOLO para mostrar nombre
 * en la UI (no para tomar decisiones de autorización).
 */

export default function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Verificar sesión via cookie httpOnly al montar (Fix A-3)
  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          // Almacenar solo datos de UI (no sensibles) en localStorage
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
        }
      })
      .catch(() => {}) // Sin cookie válida → mostrar login
      .finally(() => setLoading(false));
  }, []);

  // Auto-logout por inactividad (7 minutos)
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout('Inactividad 7m');
      }, 420_000);
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
    // Borrar datos de UI
    if (typeof window !== 'undefined') {
      ['admin_auth_andministrador', 'admin_user_data', 'adminUser', 'adminLetra', 'adminToken'].forEach(k =>
        localStorage.removeItem(k)
      );
    }
    // Invalidar cookie httpOnly desde el servidor
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

      // Guardar solo datos de UI (no sensibles)
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
