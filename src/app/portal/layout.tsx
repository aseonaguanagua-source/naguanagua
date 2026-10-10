import { ReactNode } from 'react';
import { AppProvider } from '@/store/AppContext';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Soy Contribuyente - Global REC',
  description: 'Portal Móvil de Autogestión',
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-50 flex">
        <main className="flex-1">
          {children}
        </main>
      </div>
    </AppProvider>
  );
}
