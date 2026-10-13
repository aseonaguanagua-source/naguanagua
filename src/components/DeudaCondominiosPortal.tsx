'use client';
import { useEffect, useState } from 'react';
import { Building2, Info } from 'lucide-react';

const bs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Deuda del contribuyente en CONDOMINIOS (Soy Contribuyente). SOLO INFORMATIVA:
 * se muestra para que el contribuyente la conozca, pero NO se puede pagar aquí
 * (se paga en la Caja de Condominios / a través de su condominio).
 */
export default function DeudaCondominiosPortal({ identidad }: { identidad: string }) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    if (!identidad) return;
    fetch(`/api/portal/deuda-condominios?identidad=${encodeURIComponent(identidad)}`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setData(j?.condominios || [])).catch(() => setData([]));
  }, [identidad]);
  if (!data.length) return null;
  const total = data.reduce((t, c) => t + (Number(c.totalBs) || 0), 0);
  return (
    <div id="deuda-condominios-portal" className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Building2 className="w-5 h-5 text-indigo-700 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="font-bold text-indigo-900 text-sm">Deuda en condominios (solo informativa)</h3>
          <p className="text-xs text-indigo-800 flex items-center gap-1 mt-0.5">
            <Info className="w-3.5 h-3.5" /> Esta deuda se paga por la Caja de Condominios o a través de su condominio. No se puede pagar desde aquí.
          </p>
        </div>
        <span className="font-black text-indigo-900 text-sm whitespace-nowrap">Bs. {bs(total)}</span>
      </div>
      {data.map((c: any) => (
        <div key={c.codigo} className="bg-white rounded-lg border border-indigo-100 overflow-hidden">
          <div className="px-3 py-2 bg-indigo-100/60 text-xs font-bold text-indigo-900 flex justify-between">
            <span>{c.nombre} ({c.codigo})</span><span>Bs. {bs(c.totalBs)}</span>
          </div>
          <table className="w-full text-xs">
            <thead className="text-slate-500"><tr>
              <th className="text-left px-3 py-1">Local / Unidad</th><th className="text-left px-3 py-1">Actividad</th>
              <th className="text-center px-3 py-1">Meses</th><th className="text-right px-3 py-1">Total Bs.</th>
            </tr></thead>
            <tbody>
              {c.lineas.map((l: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1">{l.numero ? `Local ${l.numero}` : ''} {l.inmueble ? `(${l.inmueble})` : ''}</td>
                  <td className="px-3 py-1">{l.actividad || '—'}</td>
                  <td className="px-3 py-1 text-center">{l.meses}</td>
                  <td className="px-3 py-1 text-right font-semibold">{bs(l.totalBs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
