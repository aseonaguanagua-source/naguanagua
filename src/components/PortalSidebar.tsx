'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, Building2, FileText, CreditCard, History,
  Award, CalendarDays, MessageSquareWarning, Wrench,
  ShieldCheck, SearchCheck, User as UserIcon, LogOut, Menu, X, TreePine
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PortalSidebarProps {
  isOpen?: boolean;
  setIsOpen?: (val: boolean) => void;
}

const menuSections = [
  {
    title: 'CONTRIBUYENTE',
    items: [
      { name: 'Inicio', icon: Home, href: '/portal/dashboard' },
    ]
  },
  {
    title: 'INMUEBLES',
    items: [
      { name: 'Mis Inmuebles', icon: Building2, href: '/portal/inmuebles' },
    ]
  },
  {
    title: 'PAGOS',
    items: [
      { name: 'Estado de Cuenta', icon: FileText, href: '/portal/estado-cuenta' },
      { name: 'Pagar', icon: CreditCard, href: '/portal/pagos' },
      { name: 'Historial Documentos', icon: History, href: '/portal/documentos' },
      { name: 'Historial Certificados', icon: Award, href: '/portal/solvencia' },
    ]
  },
  {
    title: 'SERVICIOS',
    items: [
      { name: 'Horarios de Rutas', icon: CalendarDays, href: '/portal/rutas' },
      { name: 'Reclamos', icon: MessageSquareWarning, href: '/portal/denuncias' },
      { name: 'Servicios Ext.', icon: Wrench, href: '/portal/servicios-extraordinarios' },
      { name: 'Permiso Tala/Poda', icon: TreePine, href: '/portal/tala-y-poda' },
      { name: 'Visto Bueno', icon: ShieldCheck, href: '/portal/visto-bueno' },
      { name: 'Inspección', icon: SearchCheck, href: '/portal/inspeccion' },
    ]
  }
];

// Bottom nav items (most used, for mobile)
const bottomNavItems = [
  { name: 'Inicio', icon: Home, href: '/portal/dashboard' },
  { name: 'Inmuebles', icon: Building2, href: '/portal/inmuebles' },
  { name: 'Estado', icon: FileText, href: '/portal/estado-cuenta' },
  { name: 'Pagar', icon: CreditCard, href: '/portal/pagos' },
  { name: 'Más', icon: Menu, href: '#menu' },
];

export default function PortalSidebar({ isOpen = false, setIsOpen }: PortalSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<string>('Contribuyente');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    const portalUser = localStorage.getItem('portal_user');
    if (portalUser) setUser(portalUser);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('portal_user');
    localStorage.removeItem('portal_doc');
    localStorage.removeItem('portal_codigo');
    localStorage.removeItem('portal_setup_mode');
    router.push('/portal');
  };

  const SidebarContent = () => (
    <>
      {/* Profile */}
      <div className="flex flex-col items-center pt-8 pb-6 border-b border-slate-700/50">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-green-800 mb-3 flex items-center justify-center shadow-lg">
          <UserIcon className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-white font-semibold text-xs uppercase tracking-wider px-4 text-center leading-snug">
          {user}
        </h3>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {menuSections.map((section, idx) => (
          <div key={idx} className="mb-5">
            <h4 className="px-5 text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">
              {section.title}
            </h4>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={() => { setIsOpen && setIsOpen(false); setShowMobileMenu(false); }}
                      className={`flex items-center px-5 py-2.5 text-sm transition-all relative ${
                        isActive
                          ? 'text-white bg-green-900/60'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-400 rounded-r-md" />}
                      <item.icon className={`w-4 h-4 mr-3 flex-shrink-0 ${isActive ? 'text-[#c8e64c]' : 'text-slate-500'}`} />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-5 border-t border-slate-700/50 space-y-4">
        <button
          onClick={handleLogout}
          className="flex items-center text-sm text-slate-400 hover:text-red-400 transition-colors w-full gap-3"
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </button>
        <div className="flex items-center gap-2 opacity-70 pt-2">
          
          <span className="text-white font-bold tracking-wider text-xs">
            <span className="text-[#c8e64c]">GLOBAL</span> REC
          </span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR ──────────────────────────────────── */}
      <div className="sidebar-scroll w-60 bg-[#0f172a] h-screen text-slate-300 flex-col fixed left-0 top-0 overflow-y-auto z-50 hidden md:flex">
        <SidebarContent />
      </div>

      {/* ── MOBILE: overlay sidebar (drawer) ─────────────────── */}
      {(isOpen || showMobileMenu) && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => { setIsOpen && setIsOpen(false); setShowMobileMenu(false); }}
        />
      )}
      <div className={`fixed left-0 top-0 bottom-0 w-72 bg-[#0f172a] text-slate-300 flex flex-col z-50 transition-transform duration-300 md:hidden ${
        (isOpen || showMobileMenu) ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="text-white font-bold text-sm"><span className="text-[#c8e64c]">GLOBAL</span> REC</span>
          <button onClick={() => { setIsOpen && setIsOpen(false); setShowMobileMenu(false); }}>
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col">
          <SidebarContent />
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ─────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-slate-700 z-40 md:hidden flex">
        {bottomNavItems.map((item) => {
          const isActive = pathname === item.href;
          const isMas = item.href === '#menu';
          return (
            <button
              key={item.name}
              onClick={() => {
                if (isMas) { setShowMobileMenu(true); return; }
                router.push(item.href);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-[#c8e64c]' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </button>
          );
        })}
      </nav>

      <style jsx global>{`
        .sidebar-scroll::-webkit-scrollbar { width: 6px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: #0f172a; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </>
  );
}
