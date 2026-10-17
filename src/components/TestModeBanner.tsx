'use client';
import { useState, useEffect } from 'react';
import { FlaskConical, ShieldAlert, X } from 'lucide-react';

export default function TestModeBanner() {
  const [isTestMode, setIsTestMode] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname.toLowerCase();
      const isProdDomain = h === 'naguanagua.globalgreenrec.com';
      const isVercelOrLocal = h.includes('vercel.app') || h.includes('localhost') || h.includes('127.0.0.1');
      if (isVercelOrLocal && !isProdDomain) {
        setIsTestMode(true);
      }
    }
  }, []);

  if (!isTestMode || isDismissed) return null;

  return (
    <div className="w-full bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2 text-xs shadow-md z-50 flex items-center justify-between border-b border-amber-500">
      <div className="flex items-center gap-2 max-w-5xl mx-auto flex-1 font-medium">
        <div className="flex items-center gap-1.5 bg-black/25 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[11px] animate-pulse">
          <FlaskConical className="w-3.5 h-3.5 text-amber-300" />
          <span>Modo de Prueba</span>
        </div>
        <span className="hidden sm:inline text-amber-100">|</span>
        <span className="text-amber-50 font-semibold">
          Entorno de Pruebas en Vercel activo.
        </span>
        <span className="hidden md:inline text-amber-200">
          (Facturación Electrónica en modo <b>DEMO / Sandbox</b>: sin efectos fiscales reales).
        </span>
      </div>
      <button
        onClick={() => setIsDismissed(true)}
        className="text-white/80 hover:text-white p-1 rounded hover:bg-black/20 transition-colors ml-2"
        title="Ocultar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
