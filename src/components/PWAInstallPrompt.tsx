'use client';
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);
    
    if (isStandaloneMode) return; // Don't do anything if already installed

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
    }

    // Detect iOS (Safari doesn't support beforeinstallprompt)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);
    
    if (isIosDevice) {
      // For iOS, we just show our manual prompt
      setShowIosPrompt(true);
    } else {
      // For Android/Chrome
      const handleBeforeInstallPrompt = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setIsInstallable(true);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
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

  if (isStandalone) return null;
  if (!isInstallable && !showIosPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white border border-sky-200 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 z-50 animate-in slide-in-from-bottom-5 fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-800">Instalar App</span>
          <span className="text-xs font-medium text-slate-500">Acceso rápido desde tu celular</span>
        </div>
        {isIos ? (
          <button onClick={() => setShowIosPrompt(false)} className="text-xs text-slate-400 underline">Cerrar</button>
        ) : (
          <button 
            onClick={handleInstallClick}
            className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Instalar
          </button>
        )}
      </div>
      {isIos && (
        <div className="text-xs bg-slate-50 border border-slate-100 p-2 rounded-lg text-slate-600 leading-relaxed">
          Para instalar en tu iPhone, toca el ícono de compartir (<span className="text-sky-500 font-bold inline-block mx-1">↑</span>) en el menú de Safari y luego selecciona <b>"Agregar a inicio"</b>.
        </div>
      )}
    </div>
  );
}
