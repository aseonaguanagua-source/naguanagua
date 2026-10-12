'use client';
import { useState, useEffect } from 'react';
import { Home, Search, FileText, FlaskConical, Wrench, UserPlus, Users, FileSpreadsheet, History, Award, Clock, Building2, AlertTriangle, Handshake, LayoutDashboard, Mail, User, PieChart, Truck, Inbox, Calculator, Briefcase, Landmark, BookOpen, Car, Map, Bus, TreePine, ShieldAlert, DollarSign, Wallet, FileCheck, Package, ShoppingCart, Target, BarChart3, ClipboardCheck, Smartphone, LogOut, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { performLogout } from '@/lib/logout';
import { ROUTE_PERMISSIONS_MAP } from '@/lib/permissionsMap';
import { MENU_ASEO, MENU_RECAUDACION, MENU_ADMINISTRACION, ordenarMenu, type MenuOrden } from '@/lib/menuItems';

export default function Sidebar() {
  const pathname = usePathname();
  const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/audit');
  const [user, setUser] = useState<any>(null);
  const [devMode, setDevMode] = useState(false);
  const [menuOrden, setMenuOrden] = useState<MenuOrden>({});

  // Orden del menú definido en Modo Dios (cache local para que no "salte" al cargar)
  useEffect(() => {
    try { const c = localStorage.getItem('menu_orden'); if (c) setMenuOrden(JSON.parse(c)); } catch {}
    fetch('/api/menu-orden').then(r => r.ok ? r.json() : null).then(j => {
      if (j?.orden) { setMenuOrden(j.orden); try { localStorage.setItem('menu_orden', JSON.stringify(j.orden)); } catch {} }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (localStorage.getItem('dev_mode_active') === '1') {
      setDevMode(true);
    }
    try {
      const raw = localStorage.getItem('admin_user_data');
      if (raw) {
        setUser(JSON.parse(raw));
      }
    } catch {}
  }, [pathname]);

  if (!isAdminPath) {
    return null;
  }

  const handleLogoDoubleClick = () => {
    if (devMode) {
      if (confirm('¿Desactivar Modo Desarrollador?')) {
        localStorage.removeItem('dev_mode_active');
        setDevMode(false);
        window.location.reload();
      }
    } else {
      const pw = prompt('Ingrese contraseña de desarrollador:');
      if (pw === '1756762') {
        localStorage.setItem('dev_mode_active', '1');
        setDevMode(true);
        alert('Modo Desarrollador Activado');
        window.location.reload();
      } else if (pw !== null) {
        alert('Contraseña incorrecta');
      }
    }
  };

  const isSuperAdmin = user?.rol === 'Administrador' || user?.usuario === 'dzara';
  const isRecaudacion = pathname.startsWith('/admin/recaudacion');
  const isAdministracion = pathname.startsWith('/admin/administracion');

  const menuAseo = ordenarMenu(MENU_ASEO, menuOrden.aseo);
  const menuRecaudacion = ordenarMenu(MENU_RECAUDACION, menuOrden.recaudacion);
  const menuAdministracion = ordenarMenu(MENU_ADMINISTRACION, menuOrden.administracion);

  let activeMenu = menuAseo;
  let title = 'Aseo Urbano';
  
  if (isRecaudacion) {
    activeMenu = menuRecaudacion;
    title = 'Hacienda Municipal';
  } else if (isAdministracion) {
    activeMenu = menuAdministracion;
    title = 'Administración Interna';
  }

  // Filtrar el menú por los permisos reales del trabajador
  const filteredMenu = activeMenu.filter((item) => {
    if (isSuperAdmin) return true;
    // Administrativo y módulos de Administración Interna son exclusivos del Administrador
    if (item.href === '/admin/administrativo' || item.href.startsWith('/admin/administracion')) {
      return false;
    }

    // Conciliación Bancaria NUNCA debe salir para personal de caja / taquilla
    const isCajaWorker = user?.rol?.toLowerCase().includes('taquilla') || 
                         user?.rol?.toLowerCase().includes('caja') || 
                         user?.rol?.toLowerCase().includes('cajero') ||
                         user?.usuario?.toLowerCase().includes('cajero');
    if (item.href === '/admin/caja/conciliacion' && isCajaWorker) {
      return false;
    }
    if (item.href === '/admin') return true;
    const requiredList = ROUTE_PERMISSIONS_MAP[item.href];
    if (!requiredList || requiredList.length === 0) return false;
    if (!user?.permisos) return false;
    return requiredList.some((p) => user.permisos[p]);
  });

  return (
    <aside className="w-64 bg-[#111827] h-screen text-slate-300 flex flex-col fixed left-0 top-0 z-50">
      <div 
        className="flex items-center justify-center border-b border-white/10 bg-[#111827] px-4 py-4 cursor-pointer relative"
        onDoubleClick={handleLogoDoubleClick}
        title="Doble clic para opciones de desarrollo"
      >
        <img
          src="/logos/logo_global_rec.png"
          alt="Global Rec"
          className="w-40 max-w-full h-auto object-contain"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
        {devMode && (
          <div className="absolute top-1 right-1 bg-fuchsia-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
            DEV
          </div>
        )}
      </div>

      {/* Información del funcionario activo */}
      {user && (
        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-white/10 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white truncate leading-tight flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              {user.nombre || user.usuario}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {user.rol || 'Operador'} {user.letra ? `• Caja ${user.letra}` : ''}
            </p>
          </div>
          {user.letra && (
            <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {user.letra}
            </span>
          )}
        </div>
      )}

      <div className="p-3 bg-[#111827] border-b border-white/10 text-xs text-[#c8e64c] text-center uppercase tracking-wider font-semibold">
        {title}
      </div>
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll">
        <ul className="space-y-1">
          {filteredMenu.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2 hover:bg-white/5 hover:text-[#c8e64c] transition-colors ${pathname === item.href ? 'bg-white/10 text-[#c8e64c] border-l-4 border-[#c8e64c]' : ''}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            </li>
          ))}
          {devMode && (
            <div className="flex flex-col space-y-2">
              <li>
                <Link
                  href="/admin/dev"
                  className={`flex items-center gap-3 px-4 py-2 hover:bg-white/5 hover:text-fuchsia-400 transition-colors ${pathname === '/admin/dev' ? 'bg-fuchsia-900/20 text-fuchsia-400 border-l-4 border-fuchsia-500' : ''}`}
                >
                  <Terminal className="w-5 h-5 text-fuchsia-500" />
                  <span className="text-sm font-medium text-fuchsia-400">Modo Dios (Dev)</span>
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  onClick={() => alert('hola soy prueba a ver si funciona')}
                  className={`flex items-center gap-3 px-4 py-2 hover:bg-white/5 hover:text-fuchsia-400 transition-colors ${pathname === '/admin/dev' ? 'bg-fuchsia-900/20 text-fuchsia-400 border-l-4 border-fuchsia-500' : ''}`}
                >
                  <Sparkles className="w-5 h-5 text-fuchsia-500" />
                  <span className="text-sm font-medium text-fuchsia-400">Prueba Rápida</span>
                </Link>
              </li>
            </div>
          )}
        </ul>
      </nav>

      <div className="p-4 bg-[#111827] border-t border-white/10 shrink-0 space-y-2">
        <button
          onClick={async () => {
            await performLogout('/admin');
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/70 border border-red-800/40 text-xs font-bold text-red-300 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-red-400" />
          <span>Cerrar Sesión</span>
        </button>
        <Link href="/" className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
          <Home className="w-4 h-4" /> Volver al Inicio
        </Link>
      </div>

      <style jsx global>{`
        .sidebar-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .sidebar-scroll::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 10px;
          border: 2px solid #0f172a;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </aside>
  );
}

