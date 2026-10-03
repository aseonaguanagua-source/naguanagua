'use client';
import { Power, RefreshCw, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { logAudit } from '@/lib/audit';
import { useAppContext } from '@/store/AppContext';
import { useState } from 'react';

export default function Header() {
  const router = useRouter();
  const { isLoading, cacheStatus, clearLocalCache } = useAppContext();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await clearLocalCache();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header className="h-16 bg-[#1e293b] sticky top-0 left-0 right-0 flex items-center justify-between px-6 z-40 border-b border-slate-700 shadow-md">
      <div className="flex items-center gap-6">
        <div className="text-slate-400 text-sm font-medium">Panel Administrativo</div>
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1 text-xs">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-300 font-medium flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Caché Instantáneo
          </span>
          <button
            onClick={handleSync}
            disabled={isSyncing || isLoading}
            className="ml-1 p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
            title="Forzar actualización completa desde el servidor"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="text-right">
          <div className="font-medium text-[#c8e64c]">Usuario Oficial</div>
          <div className="text-xs text-slate-300">Última Conexión: Hoy</div>
        </div>
        <button 
          onClick={() => {
            logAudit('Logout (Cierre Manual)', {}, 'SESION');
            // Eliminar TODOS los tokens - siempre pedirá contraseña al volver
            localStorage.removeItem('admin_auth_andministrador');
            localStorage.removeItem('admin_user_data');
            localStorage.removeItem('adminUser');
            localStorage.removeItem('adminLetra');
            localStorage.removeItem('adminToken');
            // Redirigir al login admin
            window.location.href = '/admin';
          }}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
          title="Cerrar sesión"
        >
          <Power className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
