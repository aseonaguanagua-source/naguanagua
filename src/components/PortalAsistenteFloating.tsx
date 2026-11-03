'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export default function PortalAsistenteFloating() {
  const pathname = usePathname();
  if (pathname?.startsWith('/portal/asistente')) return null;

  return (
    <Link
      href="/portal/asistente"
      title="Hablar con Global — Asistente Virtual con IA"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-[#0d2a1e] via-emerald-800 to-emerald-600 text-white shadow-xl border border-lime-400/50 hover:scale-105 active:scale-95 transition-all group"
    >
      <span className="w-7 h-7 rounded-full bg-lime-400 text-slate-950 flex items-center justify-center shadow-sm">
        <Sparkles className="w-4 h-4" />
      </span>
      <div className="flex flex-col leading-tight pr-1">
        <span className="text-[10px] font-extrabold text-lime-300 uppercase tracking-wider">
          Global · Asistente IA
        </span>
        <span className="text-xs font-black text-white">
          ¿Te oriento con tu cuenta?
        </span>
      </div>
    </Link>
  );
}
