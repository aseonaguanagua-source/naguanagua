'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SyncBCVButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/bcv?sync=true');
      if (res.ok) {
        alert('Tasa BCV sincronizada y guardada exitosamente para toda la semana.');
        router.refresh(); // Refresh page to show new rate
      } else {
        alert('Ocurrió un error sincronizando la tasa.');
      }
    } catch (e) {
      alert('Error de red al sincronizar la tasa.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md text-white transition-colors ${
        isSyncing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'Sincronizando...' : 'Sincronizar Tasa Semanal'}
    </button>
  );
}
