'use client';
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  if (!isInstallable) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white border border-sky-200 shadow-2xl rounded-2xl p-4 flex items-center justify-between gap-4 z-50 animate-in slide-in-from-bottom-5 fade-in">
      <div className="flex flex-col">
        <span className="text-sm font-bold text-slate-800">Instalar App</span>
        <span className="text-xs font-medium text-slate-500">Acceso rápido desde tu celular</span>
      </div>
      <button 
        onClick={handleInstallClick}
        className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-colors"
      >
        <Download className="w-4 h-4" />
        Instalar
      </button>
    </div>
  );
}
