'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, Building2, FileText, CreditCard, History,
  Award, CalendarDays, MessageSquareWarning, Wrench,
  ShieldCheck, SearchCheck, User as UserIcon, LogOut, Menu, X, TreePine, Receipt, Sparkles
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { isResidencialInm } from '@/lib/calculos';

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
    title: 'FISCAL Y FACTURACIÓN',
    items: [
      { name: 'Facturación', icon: FileText, href: '/portal/facturacion' },
      { name: 'Retención', icon: Receipt, href: '/portal/retenciones' },
    ]
  },
  {
    title: 'SERVICIOS',
    items: [
      { name: 'Horarios de Rutas', icon: CalendarDays, href: '/portal/rutas' },
      { name: 'Servicios', icon: Wrench, href: '/portal/servicios-extraordinarios' },
      { name: 'Permiso Tala/Poda', icon: TreePine, href: '/portal/tala-y-poda' },
      { name: 'Visto Bueno', icon: ShieldCheck, href: '/portal/visto-bueno' },
      { name: 'Inspección', icon: SearchCheck, href: '/portal/inspeccion' },
    ]
  },
  {
    title: 'ATENCIÓN CIUDADANA',
    items: [
      { name: 'Denuncias y Reclamos', icon: MessageSquareWarning, href: '/portal/denuncias?seccion=reclamos' },
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
  const [categoriaUso, setCategoriaUso] = useState<'RESIDENCIAL' | 'COMERCIAL' | 'MIXTO'>('RESIDENCIAL');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isAgente, setIsAgente] = useState(false);

  useEffect(() => {
    // Asegurar compatibilidad en vivo con cualquier versión del APK instalado:
    // 1. Mantener "Denuncias y Reclamos" siempre visible bajo ATENCIÓN CIUDADANA
    // 2. Actualizar el modal de "Servicios" para incluir Servicio Especial y sacar Denuncias de ese modal
    const syncApkSidebarAndModal = () => {
      const apkStyle = document.getElementById('gl-apk-mobile-styles');
      if (apkStyle && apkStyle.textContent && apkStyle.textContent.includes('/portal/denuncias')) {
        apkStyle.textContent = apkStyle.textContent
          .replace(/nav ul li:has\(> a\[href="\/portal\/denuncias"\]\),?/g, '')
          .replace(/nav a\[href="\/portal\/denuncias"\]\s*\{/g, 'nav a[href="/portal/__never__"] {');
      }

      document.querySelectorAll('nav a[href*="/portal/denuncias"]').forEach((el) => {
        const a = el as HTMLElement;
        a.style.display = 'flex';
        if (a.parentElement) {
          a.parentElement.style.display = 'list-item';
        }
      });

      const modalSheet = document.getElementById('gl-services-modal-sheet');
      if (modalSheet && !modalSheet.getAttribute('data-synced-v2')) {
        modalSheet.setAttribute('data-synced-v2', '1');
        const denCard = modalSheet.querySelector('[data-service-href="/portal/denuncias"]');
        if (denCard && denCard.parentElement) {
          denCard.parentElement.removeChild(denCard);
        }
        if (!modalSheet.querySelector('[data-service-href*="tipo=especial"]')) {
          const firstCard = modalSheet.querySelector('[data-service-href]');
          if (firstCard && firstCard.parentElement) {
            const espCard = document.createElement('div');
            espCard.className = 'gl-service-option-card';
            espCard.setAttribute('data-service-href', '/portal/servicios-extraordinarios?tipo=especial');
            espCard.innerHTML =
              '<div class="gl-service-option-icon" style="background:#f5f3ff;color:#7c3aed;">🎪</div>' +
              '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13.5px;font-weight:800;color:#0f172a;">Servicio Especial (Eventos y Otros)</div>' +
              '<div style="font-size:11.5px;color:#64748b;margin-top:2px;line-height:1.3;">Eventos, conciertos, ferias, operativos especiales y otras solicitudes</div>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:900;color:#10b981;">›</div>';
            firstCard.parentElement.insertBefore(espCard, firstCard);
          }
        }
      }
    };

    syncApkSidebarAndModal();
    const timer = setInterval(syncApkSidebarAndModal, 300);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const portalUser = localStorage.getItem('portal_user');
    if (portalUser) setUser(portalUser);
    const doc = localStorage.getItem('portal_doc') || localStorage.getItem('portal_codigo') || '';
    if (doc) {
      if (doc.startsWith('J') || doc.startsWith('G')) {
        setCategoriaUso('COMERCIAL');
      }
      const docClean = doc.replace(/-/g,'');
      supabase.from('contribuyentes').select('nombre')
        .or(`identidad.eq.${doc},identidad.eq.${docClean}`)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.nombre) {
            setUser(data.nombre);
            localStorage.setItem('portal_user', data.nombre);
          }
        });

      supabase.from('inmuebles').select('agente_retencion, tipo, clasificacion, actividad_principal, estado')
        .or(`identidad.eq.${doc},identidad.eq.${docClean}`)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const activos = data.filter((i: any) => {
              const est = (i.estado || 'Activo').trim().toLowerCase();
              return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
            });
            if (activos.some((i: any) => i.agente_retencion)) setIsAgente(true);
            let hasRes = false;
            let hasCom = false;
            activos.forEach((i: any) => {
              if (isResidencialInm(i)) hasRes = true;
              else hasCom = true;
            });
            if (hasRes && hasCom) setCategoriaUso('MIXTO');
            else if (hasCom) setCategoriaUso('COMERCIAL');
            else if (hasRes) setCategoriaUso('RESIDENCIAL');
          }
        });
    }
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
      {/* Brand IAMEC */}
      <div className="px-5 pt-6 pb-4 border-b border-slate-800 hidden md:flex items-center justify-center">
        <img
          src="/logos/IAMEC.png"
          alt="IAMEC"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* Profile + Categorización Residencial / Comercial */}
      <div className="flex flex-col items-center pt-5 pb-5 border-b border-slate-700/50">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-600 to-green-800 mb-2 flex items-center justify-center shadow-lg">
          <UserIcon className="w-7 h-7 text-white" />
        </div>
        <div className="flex flex-col items-center px-3 text-center">
          <h3 className="text-white font-semibold text-xs uppercase tracking-wider leading-snug">
            {user}
          </h3>
          <span className={`mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide ${
            categoriaUso === 'COMERCIAL'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
              : categoriaUso === 'MIXTO'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
          }`}>
            {categoriaUso === 'COMERCIAL'
              ? '🏪 COMERCIAL'
              : categoriaUso === 'MIXTO'
              ? '🏠 RES. / 🏪 COM.'
              : '🏠 RESIDENCIAL'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {menuSections.map((section, idx) => {
          const visibleItems = section.items.filter((item: any) => !item.agenteOnly || isAgente);
          if (visibleItems.length === 0) return null;
          return (
          <div key={idx} className="mb-5">
            <h4 className="px-5 text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">
              {section.title}
            </h4>
            <ul className="space-y-0.5">
              {visibleItems.map((item) => {
                const baseHref = item.href.split('?')[0];
                const isActive = pathname === baseHref && (!item.href.includes('tipo=especial'));
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
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700/50 space-y-3">
        <button
          onClick={handleLogout}
          className="flex items-center text-sm text-slate-400 hover:text-red-400 transition-colors w-full gap-3"
        >
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </button>

        <div className="pt-3 border-t border-slate-800/80 flex flex-col items-center justify-center text-center">
          <img
            src="/logos/logo_global_rec.png"
            alt="Global Rec"
            className="h-8 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity"
          />
          <span className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase mt-1">
            Global Rec · Collection System
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
          <div className="flex items-center">
            <img src="/logos/IAMEC.png" alt="IAMEC" className="h-8 w-auto object-contain" />
          </div>
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
