'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Lock, User, AlertCircle, ArrowRight, ShieldAlert, LogOut, CheckCircle2, Eye, EyeOff, ShieldCheck, ChevronDown } from 'lucide-react';
import { logAudit } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import { performLogout } from '@/lib/logout';

export const PUESTOS_PLANTILLA = [
  { puesto: 'Administrador', usuario: 'dzara', defaultClave: 'dzara', rol: 'Administrador' },
  { puesto: 'Cajero', usuario: 'cajero', defaultClave: 'cajero123', rol: 'Taquilla / Operador' },
  { puesto: 'Supervisor de Operaciones', usuario: 'supervisor', defaultClave: 'supervisor123', rol: 'Supervisor' },
  { puesto: 'Operador de Censo / Catastro', usuario: 'censo', defaultClave: 'censo123', rol: 'Operador de Censo' },
  { puesto: 'Auditor Fiscal y Tributario', usuario: 'auditor', defaultClave: 'auditor123', rol: 'Auditor' },
  { puesto: 'Atención al Contribuyente', usuario: 'taquilla', defaultClave: 'taquilla123', rol: 'Taquilla / Operador' },
  { puesto: 'Cobro Móvil / Campo', usuario: 'cobromovil', defaultClave: 'movil123', rol: 'Taquilla / Operador' },
];

export { ROUTE_PERMISSIONS_MAP } from '@/lib/permissionsMap';
import { ROUTE_PERMISSIONS_MAP } from '@/lib/permissionsMap';

export default function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [user, setUser] = useState<any>(null);

  // Estados del formulario de login
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [trabajadoresDb, setTrabajadoresDb] = useState<any[]>([]);

  useEffect(() => {
    const fetchTrabajadores = async () => {
      try {
        const { data } = await supabase
          .from('trabajadores')
          .select('id, nombre, usuario, rol, letra, estado, permisos')
          .eq('estado', 'Activo');
        if (data && data.length > 0) setTrabajadoresDb(data);
      } catch {}
    };
    fetchTrabajadores();

    // Preseleccionar el usuario si viene por parámetro de URL
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const puestoParam = params.get('puesto');
        if (puestoParam) {
          setUsernameInput(puestoParam);
        }
      } catch {}
    }
  }, []);

  // Verificar sesión existente en el cliente y rehidratar permisos desde BD
  useEffect(() => {
    const verifyAndRehydrate = async () => {
      try {
        const rawUser = localStorage.getItem('admin_user_data');
        const simpleUser = localStorage.getItem('adminUser');
        const isAuth = localStorage.getItem('admin_auth_andministrador');

        if ((rawUser || simpleUser) && isAuth === 'true') {
          let parsed: any = null;
          if (rawUser) {
            try { parsed = JSON.parse(rawUser); } catch {}
          }
          if (!parsed && simpleUser) {
            parsed = {
              usuario: simpleUser,
              nombre: simpleUser,
              rol: simpleUser.toLowerCase().includes('admin') || simpleUser === 'dzara' ? 'Administrador' : 'Operador',
              letra: localStorage.getItem('adminLetra') || '',
              permisos: {}
            };
          }

          // Si el usuario no es superadmin y sus permisos están vacíos en local, buscarlos en Supabase
          if (parsed && parsed.rol !== 'Administrador' && parsed.usuario !== 'dzara') {
            if (!parsed.permisos || Object.keys(parsed.permisos).length === 0) {
              try {
                const { data: dbWorker } = await supabase
                  .from('trabajadores')
                  .select('permisos, rol, letra, nombre')
                  .eq('usuario', parsed.usuario)
                  .maybeSingle();

                if (dbWorker && dbWorker.permisos && Object.keys(dbWorker.permisos).length > 0) {
                  parsed.permisos = dbWorker.permisos;
                  parsed.rol = dbWorker.rol || parsed.rol;
                  parsed.letra = dbWorker.letra || parsed.letra;
                  localStorage.setItem('admin_user_data', JSON.stringify(parsed));
                }
              } catch {}
            }
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
    };

    verifyAndRehydrate();
  }, []);

  const isSuperAdmin = user?.rol === 'Administrador' || user?.usuario === 'dzara';

  // Si es cajero o tiene permiso de caja y entra en /admin raíz, redirigir automáticamente a /admin/caja
  useEffect(() => {
    if (isAuthenticated && !isSuperAdmin && pathname === '/admin') {
      const isCajaWorker = user?.permisos?.['ver_caja'] || user?.rol?.toLowerCase().includes('taquilla') || user?.rol?.toLowerCase().includes('caja');
      if (isCajaWorker) {
        router.replace('/admin/caja');
      }
    }
  }, [isAuthenticated, isSuperAdmin, pathname, user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const u = usernameInput.trim();
      const p = passwordInput;

      if (!u || !p) {
        setLoginError('Por favor complete su usuario y contraseña');
        setLoginLoading(false);
        return;
      }

      // Soporte directo para credenciales maestras de administrador
      if ((u.toLowerCase() === 'dzara' || u.toLowerCase() === 'administrador' || u.toLowerCase() === 'admin') && p === 'dzara') {
        const adminData = {
          usuario: 'dzara',
          nombre: 'Administrador',
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

      if (res.ok && data.ok) {
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

        if (data.rol === 'Operador de Censo' || data.usuario === 'censo') {
          localStorage.setItem('operador_censo_auth', data.usuario);
        }

        await logAudit(`Inicio de Sesión: ${workerData.nombre}`, { usuario: data.usuario, rol: data.rol }, 'SESION', 'BAJA');

        setUser(workerData);
        setIsAuthenticated(true);
        setLoginLoading(false);
        return;
      }

      // Fallback con presets locales
      const matchPreset = PUESTOS_PLANTILLA.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === p) {
        const workerData = {
          usuario: matchPreset.usuario,
          nombre: matchPreset.puesto,
          rol: matchPreset.rol,
          letra: matchPreset.usuario === 'cajero' ? 'A' : matchPreset.usuario.charAt(0).toUpperCase(),
          permisos: {}
        };
        localStorage.setItem('admin_user_data', JSON.stringify(workerData));
        localStorage.setItem('adminUser', workerData.usuario);
        localStorage.setItem('adminLetra', workerData.letra);
        localStorage.setItem('admin_auth_andministrador', 'true');
        setUser(workerData);
        setIsAuthenticated(true);
        setLoginLoading(false);
        return;
      }

      setLoginError(data?.error || 'Credenciales inválidas. Verifique su usuario y contraseña.');
      setLoginLoading(false);
    } catch (err: any) {
      console.error('Error de login:', err);
      const u = usernameInput.trim();
      const matchPreset = PUESTOS_PLANTILLA.find(x => x.usuario.toLowerCase() === u.toLowerCase());
      if (matchPreset && matchPreset.defaultClave === passwordInput) {
        const workerData = {
          usuario: matchPreset.usuario,
          nombre: matchPreset.puesto,
          rol: matchPreset.rol,
          letra: matchPreset.usuario === 'cajero' ? 'A' : 'T',
          permisos: {}
        };
        localStorage.setItem('admin_user_data', JSON.stringify(workerData));
        localStorage.setItem('adminUser', workerData.usuario);
        localStorage.setItem('adminLetra', workerData.letra);
        localStorage.setItem('admin_auth_andministrador', 'true');
        setUser(workerData);
        setIsAuthenticated(true);
        setLoginLoading(false);
        return;
      }
      setLoginError('Error de conexión al servidor de autenticación.');
      setLoginLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    await performLogout('/admin');
  }, []);

  const isCaja = pathname.includes('/caja') || usernameInput.toLowerCase() === 'cajero';
  const isCobro = pathname.includes('/cobro-movil') || usernameInput.toLowerCase() === 'cobromovil';
  const isCenso = pathname.includes('/censo') || usernameInput.toLowerCase() === 'censo';
  let moduloTitle = 'Modulo Administrador';
  if (isCaja) moduloTitle = 'Modulo Caja';
  else if (isCobro) moduloTitle = 'Modulo Cobro Móvil';
  else if (isCenso) moduloTitle = 'Modulo Operador de Censo';

  // Si está verificando estado inicial
  if (isChecking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #06120e 0%, #0d2a1e 50%, #081810 100%)',
        fontFamily: 'Poppins, sans-serif', padding: '24px'
      }}>
        <div style={{
          width: 44, height: 44, border: '4px solid #B8CD29',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: 'rgba(200,230,200,.6)', fontSize: 13, marginTop: 16 }}>Verificando credenciales de funcionario...</p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANTALLA DE BLOQUEO / ACCESO A FUNCIONARIOS (LOGIN OBLIGATORIO)
  // ══════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #06120e 0%, #0d2a1e 50%, #081810 100%)',
        fontFamily: 'Poppins, sans-serif', padding: '24px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a5c2e, #2d8c4e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 0 24px rgba(93,177,48,.4)'
          }}>
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#B8CD29" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h1 style={{ color: '#B8CD29', fontSize: 22, fontWeight: 800, margin: 0 }}>{moduloTitle}</h1>
          <p style={{ color: 'rgba(200,230,200,.6)', fontSize: 13, margin: '4px 0 0' }}>IAMEC Naguanagua - Municipio Naguanagua</p>
        </div>

        <form onSubmit={handleLogin} style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(184,205,41,.2)', borderRadius: 20,
          padding: '32px 28px', width: '100%', maxWidth: 360,
          boxShadow: '0 20px 60px rgba(0,0,0,.5)', boxSizing: 'border-box'
        }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ color: 'rgba(200,230,200,.8)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              USUARIO
            </label>
            <input
              type="text"
              required
              autoFocus
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Ingresa tu usuario"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(184,205,41,.25)',
                color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ color: 'rgba(200,230,200,.8)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              CONTRASENA
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••"
                style={{
                  width: '100%', padding: '12px 42px 12px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(184,205,41,.25)',
                  color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: 'rgba(200,230,200,.5)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {loginError && (
            <div style={{
              background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
              color: '#fca5a5', fontSize: 13, textAlign: 'center'
            }}>
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              background: loginLoading ? 'rgba(184,205,41,.4)' : 'linear-gradient(135deg, #B8CD29, #8fa81e)',
              border: 'none', color: '#06120e', fontWeight: 800, fontSize: 15,
              cursor: loginLoading ? 'not-allowed' : 'pointer', letterSpacing: 0.5
            }}
          >
            {loginLoading ? 'Ingresando...' : 'Ingresar'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <a href="/" style={{ color: 'rgba(200,230,200,.5)', fontSize: 12, textDecoration: 'none' }}>
              ← Volver al Inicio
            </a>
          </div>
        </form>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTROL GRANULAR DE ACCESO POR RUTA SEGÚN LOS PERMISOS DEL TRABAJADOR
  // ══════════════════════════════════════════════════════════════════════════

  // Si no es superadministrador, verificar permiso de la ruta
  if (!isSuperAdmin) {
    const requiredPermissionEntry = Object.entries(ROUTE_PERMISSIONS_MAP).find(([route]) =>
      pathname.startsWith(route)
    );

    if (requiredPermissionEntry) {
      const [matchedRoute, requiredList] = requiredPermissionEntry;
      const hasPerm = requiredList.some(p => user?.permisos && user.permisos[p]);

      if (!hasPerm) {
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
                habilitado el permiso requerido (<b className="font-mono text-amber-700">{requiredList.join(' o ')}</b>) para
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
}

  // Usuario autenticado y autorizado para esta aplicación
  return <>{children}</>;
}

