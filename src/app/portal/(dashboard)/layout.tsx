'use client';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PortalSidebar from '@/components/PortalSidebar';
import PortalHeader from '@/components/PortalHeader';
import { PORTAL_EN_MANTENIMIENTO } from '@/lib/portalConfig';

export default function PortalDashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const isDev = localStorage.getItem('dev_mode_active') === '1';
    setDevMode(isDev);
    
    if (PORTAL_EN_MANTENIMIENTO && !isDev) {
      ['portal_user', 'portal_doc', 'portal_codigo'].forEach(k => localStorage.removeItem(k));
      router.replace('/portal');
      return;
    }
    const portalUser = localStorage.getItem('portal_user');
    if (!portalUser) {
      router.push('/portal');
    }
  }, [router]);

  if (!isClient || (PORTAL_EN_MANTENIMIENTO && !devMode)) return null; // Evitar hidratación incorrecta

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex">
      {/* Sidebar Fijo a la Izquierda — solo desktop */}
      <PortalSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col md:ml-60 w-full min-w-0">
        {/* Cabecera Superior Fija */}
        <PortalHeader onMenuClick={() => setIsSidebarOpen(true)} />

        {/* Área de trabajo — padding-bottom extra en mobile por bottom nav */}
        <main className="flex-1 p-3 md:p-6 pb-20 md:pb-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
