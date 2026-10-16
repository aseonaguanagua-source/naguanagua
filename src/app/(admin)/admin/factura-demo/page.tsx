'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Eye, ShieldCheck, Printer, CheckCircle2, Search } from 'lucide-react';
import { DemoFacturaModal } from '@/components/facturacion/DemoFacturaModal';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';

export default function FacturaDemoPage() {
  const [loading, setLoading] = useState(true);
  const [pago, setPago] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('J-075232879');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPago = async (term: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1) Si es UUID directo
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term.trim());
      
      let query = supabase.from('pagos_reportados').select('*');
      if (isUuid) {
        query = query.eq('id', term.trim());
      } else {
        query = query.or(`identidad.ilike.%${term.trim()}%,referencia.ilike.%${term.trim()}%`).order('created_at', { ascending: false }).limit(1);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const item = data[0];
        // Parse detalles si vienen como string
        if (typeof item.detalles === 'string') {
          try { item.detalles = JSON.parse(item.detalles); } catch {}
        }
        setPago(item);
      } else {
        setErrorMsg(`No se encontró ningún pago con el criterio "${term}".`);
      }
    } catch (e: any) {
      console.error('Error al cargar pago demo:', e);
      setErrorMsg(e.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Si viene parámetro en URL
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const idParam = sp.get('id') || sp.get('rif') || sp.get('pagoId');
      if (idParam) {
        setSearchTerm(idParam);
        fetchPago(idParam);
        return;
      }
    }
    // Por defecto cargar Centro Termal
    fetchPago('2d191cf2-f725-4d86-ad10-5bee6c743912');
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      {/* Barra superior de navegación */}
      <div className="bg-[#0d2a4a] text-white px-4 py-3 sm:px-6 shadow-md border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/facturacion-electronica"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Facturación</span>
          </Link>
          <div className="border-l border-slate-600 pl-3">
            <h1 className="text-sm sm:text-base font-extrabold flex items-center gap-2 text-white">
              <ShieldCheck className="w-5 h-5 text-[#c8e64c]" />
              Visor Demo Factura Digital — The Factory HKA
            </h1>
            <p className="text-[11px] text-slate-300">
              Previsualización idéntica a la emitida por la imprenta autorizada SENIAT
            </p>
          </div>
        </div>

        {/* Buscador de otros pagos */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchPago(searchTerm); }}
              placeholder="Buscar RIF, Ref o ID..."
              className="bg-slate-800 text-white text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:border-[#c8e64c] w-48 sm:w-64"
            />
          </div>
          <button
            onClick={() => fetchPago(searchTerm)}
            disabled={loading}
            className="px-3 py-1.5 bg-[#c8e64c] hover:bg-[#b5d33d] text-slate-950 font-black text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Cargar'}
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-5xl mx-auto mt-6 px-4">
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-xs border border-slate-200">
            <RefreshCw className="w-8 h-8 animate-spin text-[#0d2a4a] mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Cargando datos y generando borrador fiscal The Factory HKA...</p>
          </div>
        ) : errorMsg ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800 text-sm">
            <p className="font-bold">Error:</p>
            <p>{errorMsg}</p>
          </div>
        ) : pago ? (
          <div>
            {/* Banner de datos cargados */}
            <div className="bg-white rounded-xl p-4 mb-4 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                  Pago ID: {pago.id.slice(0, 8)}...
                </span>
                <h2 className="text-sm sm:text-base font-extrabold text-[#0d2a4a] mt-1">
                  {pago.detalles?.contribuyente || pago.identidad}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  RIF: <span className="font-bold text-slate-700">{pago.identidad}</span> | Ref: <span className="font-bold text-slate-700">{pago.referencia}</span> | Monto Conciliado: <span className="font-bold text-emerald-700">{formatBs(pago.monto)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-[#c8e64c]" />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            </div>

            {/* Modal siempre abierto en este visor */}
            <DemoFacturaModal
              isOpen={true}
              onClose={() => {}}
              pago={pago}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
