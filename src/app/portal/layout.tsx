import { ReactNode } from 'react';
import { AppProvider } from '@/store/AppContext';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Soy Contribuyente - Global REC',
  description: 'Portal Móvil de Autogestión',
  manifest: '/manifest.json',
  icons: {
    icon: '/logos/logo_global_rec.png',
    apple: '/logos/logo_global_rec.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import PWAInstallPrompt from '@/components/PWAInstallPrompt';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-50 flex">
        <main className="flex-1">
          {children}
          <PWAInstallPrompt />
        </main>
      </div>
    </AppProvider>
  );
}
