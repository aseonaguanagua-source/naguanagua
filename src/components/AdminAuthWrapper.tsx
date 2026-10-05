'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, Lock, User, AlertCircle, ArrowRight, ShieldAlert, LogOut, CheckCircle2, Eye, EyeOff, ShieldCheck, ChevronDown } from 'lucide-react';
import { logAudit } from '@/lib/audit';
import { supabase } from '@/lib/supabase';
import { performLogout } from '@/lib/logout';

export const PUESTOS_PLANTILLA = [
  { puesto: 'Administrador', usuario: 'dzara', defaultClave: 'dzara', rol: 'Administrador' },
  { puesto: 'Taquilla / Cajero Principal', usuario: 'cajero', defaultClave: 'cajero123', rol: 'Taquilla / Operador' },
  { puesto: 'Supervisor de Operaciones', usuario: 'supervisor', defaultClave: 'supervisor123', rol: 'Supervisor' },
  { puesto: 'Operador de Censo / Catastro', usuario: 'censo', defaultClave: 'censo123', rol: 'Operador de Censo' },
  { puesto: 'Auditor Fiscal y Tributario', usuario: 'auditor', defaultClave: 'auditor123', rol: 'Auditor' },
  { puesto: 'Atención al Contribuyente', usuario: 'taquilla', defaultClave: 'taquilla123', rol: 'Taquilla / Operador' },
  { puesto: 'Cobro Móvil / Campo', usuario: 'cobromovil', defaultClave: 'movil123', rol: 'Taquilla / Operador' },
];

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
  const [selectedPuesto, setSelectedPuesto] = useState('dzara');
  const [usernameInput, setUsernameInput] = useState('dzara');
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
          .select('id, nombre, usuario, rol, letra, estado')
          .eq('estado', 'Activo');
        if (data && data.length > 0) setTrabajadoresDb(data);
      } catch {}
    };
    fetchTrabajadores();
  }, []);

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
      const u = (selectedPuesto === 'manual' ? usernameInput : selectedPuesto).trim();
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
      const u = (selectedPuesto === 'manual' ? usernameInput : selectedPuesto).trim();
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Fondo decorativo */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          <div className="bg-white rounded-[28px] shadow-2xl p-7 sm:p-8 w-full text-slate-800">
            {/* Encabezado logos */}
            <div className="flex items-center justify-center gap-4 mb-3">
              <img src="/logos/logo_global_rec.png" alt="Global Rec" className="h-10 w-auto object-contain" />
              <div className="h-8 w-[1px] bg-slate-200" />
              <img src="/logos/global_green.png" alt="Global Green" className="h-9 w-auto object-contain" />
            </div>

            {/* Títulos corporativos */}
            <h2 className="text-2xl font-black text-slate-900 tracking-tight text-center">Global Rec</h2>
            <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase text-center mt-0.5">COLLECTION SYSTEM</p>
            <p className="text-xs font-black text-slate-700 uppercase tracking-[0.2em] text-center mt-2.5">MÓDULO OPERADOR</p>

            <div className="border-t border-slate-100 my-5" />

            {/* Formulario de Login */}
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs text-center border border-red-200 font-semibold flex items-center justify-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5 text-left">
                  USUARIO ASIGNADO
                </label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                  <select
                    value={selectedPuesto}
                    onChange={(e) => {
                      setSelectedPuesto(e.target.value);
                      if (e.target.value !== 'manual') {
                        setUsernameInput(e.target.value);
                      } else {
                        setUsernameInput('');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all appearance-none cursor-pointer"
                  >
                    <optgroup label="── Puestos de la Plantilla ──">
                      {PUESTOS_PLANTILLA.map((p) => (
                        <option key={p.usuario} value={p.usuario}>
                          {p.puesto}
                        </option>
                      ))}
                    </optgroup>
                    {trabajadoresDb.length > 0 && (
                      <optgroup label="── Trabajadores Registrados ──">
                        {trabajadoresDb.map((t) => (
                          <option key={t.usuario} value={t.usuario}>
                            {t.nombre} - {t.rol}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="manual">➕ Otro / Ingresar usuario manual</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-3 text-slate-400 pointer-events-none" />
                </div>

                {selectedPuesto === 'manual' && (
                  <div className="relative mt-2">
                    <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Ej. jperez"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5 text-left">
                  CONTRASEÑA
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="********"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-slate-400 focus:bg-white transition-all tracking-wider"
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
                disabled={loginLoading}
                className="w-full bg-[#c8e844] hover:bg-[#b8d937] text-slate-900 font-extrabold py-3.5 px-4 rounded-xl text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer border-none mt-2"
              >
                {loginLoading ? (
                  <AlertCircle className="w-5 h-5 animate-spin text-slate-900" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-slate-900 stroke-[2.5]" />
                )}
                <span>{loginLoading ? 'Verificando...' : 'Iniciar Jornada'}</span>
              </button>
            </form>

            <div className="text-center pt-4 mt-4 border-t border-slate-100">
              <a href="/" className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                ← Volver al Portal de la Alcaldía
              </a>
            </div>
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

