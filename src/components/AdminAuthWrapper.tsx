'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Lock, User, AlertCircle, ArrowRight, ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';
import { logAudit } from '@/lib/audit';

// Mapeo de rutas a las claves de permisos del sistema de Naguanagua
export const ROUTE_PERMISSIONS_MAP: Record<string, string> = {
  '/admin/tarifas': 'ver_tarifas',
  '/admin/censo': 'ver_censo',
  '/admin/contribuyentes': 'ver_contribuyentes',
  '/admin/condominios-cob': 'ver_condominios',
  '/admin/pre-registros': 'ver_pre_registros',
  '/admin/jornadas': 'planificar_jornadas',
  '/admin/ambiental': 'gestionar_visto_bueno',
  '/admin/herramientas': 'ver_reportes',
  '/admin/calculo': 'usar_calculadora_deuda',
  '/admin/caja': 'ver_caja',
  '/admin/caja/conciliacion': 'ver_conciliacion',
  '/admin/facturacion-electronica': 'emitir_recibos',
  '/admin/estado-cuenta': 'ver_estado_cuenta',
  '/admin/convenios-pago': 'ver_convenios',
  '/admin/certificados': 'ver_certificados',
  '/admin/buzon': 'ver_buzon',
  '/admin/denuncias': 'ver_denuncias',
  '/admin/rutas': 'ver_rutas',
  '/admin/servicios-especiales': 'ver_servicios_especiales',
  '/admin/reportes': 'ver_reportes',
  '/admin/correos': 'ver_correos',
  '/admin/trabajadores': 'gestionar_usuarios',
  '/admin/auditoria': 'ver_auditoria',
  '/cobro-movil': 'ver_caja',
};

export default function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [user, setUser] = useState<any>(null);

  // Estados del formulario de login
  const [usernameInput, setUsernameInput] = useState('dzara');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Verificar sesión existente en el cliente
  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('admin_user_data');
      const simpleUser = localStorage.getItem('adminUser');
      const isAuth = localStorage.getItem('admin_auth_andministrador');

      if ((rawUser || simpleUser) && isAuth === 'true') {
        let parsed = null;
        if (rawUser) {
          try { parsed = JSON.parse(rawUser); } catch {}
        }
        if (!parsed && simpleUser) {
          parsed = {
            usuario: simpleUser,
            nombre: simpleUser,
            rol: simpleUser.toLowerCase().includes('admin') || simpleUser === 'dzara' ? 'Administrador' : 'Operador',
            letra: localStorage.getItem('adminLetra') || ''
          };
        }
        setUser(parsed);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const u = usernameInput.trim();
      const p = passwordInput;

      // Soporte directo para credenciales maestras de administrador
      if (u.toLowerCase() === 'dzara' && p === 'dzara') {
        const adminData = {
          usuario: 'dzara',
          nombre: 'David Zara',
          rol: 'Administrador',
          letra: 'DZ',
          permisos: {} // Administrador tiene bypass total
        };

        localStorage.setItem('admin_user_data', JSON.stringify(adminData));
        localStorage.setItem('adminUser', 'dzara');
        localStorage.setItem('adminLetra', 'DZ');
        localStorage.setItem('admin_auth_andministrador', 'true');

        await logAudit('Inicio de Sesión Administrador (dzara)', { usuario: 'dzara' }, 'SESION', 'BAJA');

        setUser(adminData);
        setIsAuthenticated(true);
        setLoginLoading(false);
        return;
      }

      // Consulta a la API de autenticación de trabajadores
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setLoginError(data.error || 'Credenciales inválidas. Verifique su usuario y contraseña.');
        setLoginLoading(false);
        return;
      }

      const workerData = {
        usuario: data.usuario,
        nombre: data.nombre || data.usuario,
        rol: data.rol || 'Operador',
        letra: data.letra || '',
        permisos: data.permisos || {}
      };

      localStorage.setItem('admin_user_data', JSON.stringify(workerData));
      localStorage.setItem('adminUser', data.usuario);
      localStorage.setItem('adminLetra', data.letra || '');
      localStorage.setItem('admin_auth_andministrador', 'true');

      await logAudit(`Inicio de Sesión: ${workerData.nombre}`, { usuario: data.usuario, rol: data.rol }, 'SESION', 'BAJA');

      setUser(workerData);
      setIsAuthenticated(true);
    } catch (err: any) {
      console.error('Error de login:', err);
      setLoginError('Error de conexión al servidor de autenticación.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await logAudit(`Cierre de Sesión: ${user?.usuario || 'Desconocido'}`, {}, 'SESION', 'BAJA');
    ['admin_auth_andministrador', 'admin_user_data', 'adminUser', 'adminLetra', 'adminToken'].forEach(k =>
      localStorage.removeItem(k)
    );
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
    setPasswordInput('');
  }, [user]);

  // Si está verificando estado inicial
  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-400">Verificando credenciales de funcionario...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANTALLA DE BLOQUEO / ACCESO A FUNCIONARIOS (LOGIN OBLIGATORIO)
  // ══════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Glow de fondo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 space-y-6 relative z-10">
          {/* Logo y Encabezado */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-500/30">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Acceso de Funcionarios
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Alcaldía de Naguanagua • Sistema Integral Municipal
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-[11px] text-amber-800 font-semibold mt-1">
              <Lock size={12} className="text-amber-600" />
              Módulo Administrativo Protegido
            </div>
          </div>

          {/* Formulario de Login */}
          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-500" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Usuario de Funcionario
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  required
                  type="text"
                  autoComplete="username"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  placeholder="Ej: dzara"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {loginLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verificando credenciales...
                </>
              ) : (
                <>
                  Ingresar al Sistema <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Tarjeta de ayuda rápida para el Administrador */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Credenciales de Administrador Temporal
            </span>
            <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold text-indigo-700">
              <span>Usuario: <b className="bg-indigo-100 px-1.5 py-0.5 rounded">dzara</b></span>
              <span>•</span>
              <span>Clave: <b className="bg-indigo-100 px-1.5 py-0.5 rounded">dzara</b></span>
            </div>
            <p className="text-[10px] text-slate-400">
              Use este usuario para acceder a todas las aplicaciones y configurar el personal.
            </p>
          </div>

          <div className="text-center pt-2 border-t border-slate-100">
            <a href="/" className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
              ← Volver al Portal de la Alcaldía
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTROL GRANULAR DE ACCESO POR RUTA SEGÚN LOS PERMISOS DEL TRABAJADOR
  // ══════════════════════════════════════════════════════════════════════════
  const isSuperAdmin = user?.rol === 'Administrador' || user?.usuario === 'dzara';

  // Si no es superadministrador, verificar permiso de la ruta
  if (!isSuperAdmin) {
    const requiredPermission = Object.entries(ROUTE_PERMISSIONS_MAP).find(([route]) =>
      pathname.startsWith(route)
    )?.[1];

    if (requiredPermission && user?.permisos && !user.permisos[requiredPermission]) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-white rounded-2xl border border-amber-200 shadow-xl space-y-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <ShieldAlert size={36} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Acceso Restringido a este Módulo
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Su cuenta de trabajador (<b className="text-indigo-600">{user?.usuario}</b> - {user?.rol}) no tiene
              habilitado el permiso requerido (<b className="font-mono text-amber-700">{requiredPermission}</b>) para
              utilizar esta aplicación municipal.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-medium">
            Si requiere acceso a este módulo para sus labores, solicite al administrador ({user?.letra ? `Caja ${user.letra}` : 'Personal'}) que actualice su matriz de permisos en <b>Gestión de Trabajadores</b>.
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
            >
              Volver al Inicio
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <LogOut size={14} /> Cambiar de Usuario
            </button>
          </div>
        </div>
      );
    }
  }

  // Usuario autenticado y autorizado para esta aplicación
  return <>{children}</>;
}

