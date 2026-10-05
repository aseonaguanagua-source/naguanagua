'use client';
import { Power, RefreshCw, Zap, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { logAudit } from '@/lib/audit';
import { performLogout } from '@/lib/logout';
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

  const [workerName, setWorkerName] = useState('Usuario Oficial');
  const [workerRole, setWorkerRole] = useState('Personal Municipal');

  useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('admin_user_data');
        if (raw) {
          const u = JSON.parse(raw);
          setWorkerName(u.nombre || u.usuario || 'Usuario Oficial');
          setWorkerRole(u.rol ? `${u.rol}${u.letra ? ` (Caja ${u.letra})` : ''}` : 'Funcionario');
        } else {
          const u = localStorage.getItem('adminUser');
          if (u) {
            setWorkerName(u);
            setWorkerRole(u === 'dzara' ? 'Administrador' : 'Funcionario');
          }
        }
      } catch {}
    }
  });

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
          <div className="font-bold text-[#c8e64c] text-xs">{workerName}</div>
          <div className="text-[11px] text-slate-400">{workerRole}</div>
        </div>
        <button 
          onClick={async () => {
            await performLogout('/admin');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/70 border border-red-800/40 rounded-lg transition-colors cursor-pointer"
          title="Cerrar sesión y solicitar credenciales"
        >
          <LogOut className="w-3.5 h-3.5 text-red-400" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </header>
  );
}
