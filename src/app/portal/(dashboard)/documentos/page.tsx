'use client';
import { useState, useEffect, useMemo } from 'react';
import { History, Download, Eye, FileText, Search, CheckCircle2, Building2, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';
import { formatBs } from '@/lib/formatCurrency';

interface DocumentoItem {
  id: string;
  tipo: 'factura' | 'pago';
  referencia: string;
  fecha: string;
  monto: number;
  concepto: string;
  estado: string;
  banco?: string;
  comprobanteUrl?: string;
  reciboDigital?: any;
}

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [portalDoc, setPortalDoc] = useState('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || '';
    setPortalDoc(doc);
    if (!doc) {
      setLoading(false);
      return;
    }

    const cargarHistorial = async () => {
      setLoading(true);
      try {
        const variants = /^[VEJPG][-_\s]?\d+$/i.test(doc.trim()) 
          ? getIdentidadVariantsExact(doc) 
          : getIdentidadVariants(doc);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        // 1. Facturas Pagadas
        const { data: facturas } = await supabase
          .from('facturas')
          .select('*')
          .or(orFilter)
          .in('estado', ['Pagada', 'Pagado'])
          .order('emision', { ascending: false });

        // 2. Pagos Reportados Aprobados
        const { data: pagos } = await supabase
          .from('pagos_reportados')
          .select('id, referencia, monto, banco, estado, detalles, created_at')
          .or(orFilter)
          .eq('estado', 'Aprobado')
          .order('created_at', { ascending: false });

        const items: DocumentoItem[] = [];

        (facturas || []).forEach(f => {
          items.push({
            id: `fac_${f.id}`,
            tipo: 'factura',
            referencia: f.referencia || `FAC-${f.id}`,
            fecha: f.fecha_pago || f.emision || f.created_at?.split('T')[0] || 'N/A',
            monto: parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0,
            concepto: f.contribuyente ? `Factura Servicio Aseo - ${f.contribuyente}` : 'Factura Fiscal de Aseo Urbano',
            estado: 'Pagado'
          });
        });

        (pagos || []).forEach(p => {
          let det: any = {};
          try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch {}
          
          const reciboNum = det.recibo_digital?.numero || det.factura_digital?.numero_factura || p.referencia;
          const fechaTx = det.fecha_transaccion || p.created_at?.split('T')[0] || 'N/A';

          items.push({
            id: `pago_${p.id}`,
            tipo: 'pago',
            referencia: reciboNum,
            fecha: fechaTx,
            monto: parseFloat(String(p.monto || '0').replace(/[^\d.]/g, '')) || 0,
            concepto: `Recibo de Pago Aprobado • ${p.banco || 'Transferencia'}`,
            estado: 'Aprobado',
            banco: p.banco,
            comprobanteUrl: det.comprobante_url || undefined,
            reciboDigital: det.recibo_digital || undefined
          });
        });

        // Ordenar por fecha descendente
        items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        setDocumentos(items);
      } catch (err) {
        console.error('Error cargando documentos:', err);
      } finally {
        setLoading(false);
      }
    };

    cargarHistorial();
  }, []);

  const filteredDocs = useMemo(() => {
    if (!searchTerm.trim()) return documentos;
    const q = searchTerm.toLowerCase();
    return documentos.filter(d => 
      d.referencia.toLowerCase().includes(q) ||
      d.concepto.toLowerCase().includes(q) ||
      (d.banco && d.banco.toLowerCase().includes(q))
    );
  }, [documentos, searchTerm]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            Historial de Recibos y Documentos Pagados
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consulte y descargue sus comprobantes y pagos validados oficialmente por el municipio.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nro. recibo o referencia..." 
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 uppercase text-xs tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            Documentos Confirmados ({filteredDocs.length})
          </h2>
          {portalDoc && (
            <span className="text-xs font-mono font-bold text-slate-500">
              RIF: {portalDoc}
            </span>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                <th className="px-5 py-3 font-bold">Nro. Recibo / Referencia</th>
                <th className="px-5 py-3 font-bold text-center">Fecha Pago</th>
                <th className="px-5 py-3 font-bold">Concepto / Detalle</th>
                <th className="px-5 py-3 font-bold text-right">Monto (Bs.)</th>
                <th className="px-5 py-3 font-bold text-center">Estado</th>
                <th className="px-5 py-3 font-bold text-center">Comprobante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    Cargando historial de documentos oficiales...
                  </td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-600">No se encontraron documentos o recibos pagados para este RIF.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Los pagos confirmados y conciliados aparecerán reflejados aquí automáticamente.</p>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-800">
                      {doc.referencia}
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate-600 font-medium">
                      {doc.fecha}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 font-medium">
                      {doc.concepto}
                    </td>
                    <td className="px-5 py-3.5 text-right font-black text-emerald-700">
                      Bs. {formatBs(doc.monto)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        {doc.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {doc.comprobanteUrl ? (
                        <a 
                          href={doc.comprobanteUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Ver Soporte
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400">Validado en Caja</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
