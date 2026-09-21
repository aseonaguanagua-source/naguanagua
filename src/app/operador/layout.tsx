'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, User, MapPin } from 'lucide-react';
import { AppProvider } from '@/store/AppContext';

export default function OperadorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [operador, setOperador] = useState<string | null>(null);

  const isLoginPage = pathname === '/operador/login';

  useEffect(() => {
    if (isLoginPage) return;
    
    // Check if operator is logged in
    const storedOp = localStorage.getItem('operador_censo_auth');
    if (!storedOp) {
      router.replace('/operador/login');
    } else {
      setOperador(storedOp);
    }
  }, [router, pathname]);

  const handleLogout = () => {
    localStorage.removeItem('operador_censo_auth');
    router.replace('/');
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!operador) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Cargando...</div>;

  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-100 flex flex-col max-w-md mx-auto shadow-2xl relative">
        {/* Mobile Top Header */}
      <header className="bg-orange-600 text-white p-4 shadow-md sticky top-0 z-50 rounded-b-xl flex justify-between items-center">
        <div>
          <h1 className="text-lg font-black tracking-tight leading-none">CENSO MÓVIL</h1>
          <p className="text-[10px] text-orange-200 uppercase font-bold tracking-widest flex items-center gap-1 mt-0.5">
            <User size={10} /> {operador}
          </p>
        </div>
        <button 
          onClick={handleLogout}
          className="bg-orange-700/50 hover:bg-orange-700 p-2 rounded-full transition-colors"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Mobile Bottom Navigation (Optional but good for mobile feel) */}
      <nav className="bg-white border-t border-slate-200 fixed bottom-0 w-full max-w-md flex justify-around p-3 z-50">
        <button onClick={() => router.push('/operador')} className="flex flex-col items-center text-slate-500 hover:text-orange-600">
          <User size={20} />
          <span className="text-[10px] font-bold mt-1">Inicio</span>
        </button>
        <button onClick={() => router.push('/operador/censo')} className="flex flex-col items-center text-orange-600">
          <div className="bg-orange-100 p-2 rounded-full -mt-6 shadow-md border-2 border-white">
            <MapPin size={24} />
          </div>
          <span className="text-[10px] font-bold mt-1 text-orange-600">Censar</span>
        </button>
      </nav>
    </div>
    </AppProvider>
  );
}
