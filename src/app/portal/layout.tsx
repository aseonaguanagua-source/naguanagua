import { ReactNode } from 'react';
import { AppProvider } from '@/store/AppContext';

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
