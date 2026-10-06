'use client';

import Link from 'next/link';
import { Building2, User, Wallet } from 'lucide-react';

/** Selector de módulo: Contribuyentes | Condominios | Caja de Condominios */
export function SelectorModulo({ activo }: { activo: 'contribuyentes' | 'condominios' | 'caja' }) {
  const base = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold transition-all';
  const cls = (k: string, color = 'text-slate-900') => `${base} ${activo === k ? `bg-white ${color} shadow-sm` : 'text-slate-500 hover:text-slate-800'}`;
  return (
    <div className="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200" role="tablist" aria-label="Módulo">
      <Link href="/admin/contribuyentes" role="tab" aria-selected={activo === 'contribuyentes'} className={cls('contribuyentes')}>
        <User className="w-4 h-4" /> Contribuyentes
      </Link>
      <Link href="/admin/condominios" role="tab" aria-selected={activo === 'condominios'} className={cls('condominios', 'text-emerald-800')}>
        <Building2 className="w-4 h-4" /> Condominios
      </Link>
      <Link href="/admin/condominios/caja" role="tab" aria-selected={activo === 'caja'} className={cls('caja', 'text-emerald-800')}>
        <Wallet className="w-4 h-4" /> Caja Condominios
      </Link>
    </div>
  );
}
