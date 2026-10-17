'use client';
import { useState, useEffect, useMemo } from 'react';
import { FileText, Download, ExternalLink, Search, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';
import { formatBs } from '@/lib/formatCurrency';
import Link from 'next/link';

interface FacturaFiscal {
  id: string;
  pagoId: string;
  numeroFactura: string;
  numeroControl: string;
  fechaEmision: string;
  montoTotal: number;
  baseImponible: number;
  ivaMonto: number;
  urlPdf?: string | null;
  esAgenteRetencion: boolean;
  retencionEstado?: 'esperando_planilla' | 'planilla_recibida' | 'aprobada' | 'rechazada' | 'sin_retencion';
  retencionId?: string;
  puedeVerFactura: boolean;
  bloqueoMotivo?: string;
}

export default function FacturacionPortalPage() {
  const [facturas, setFacturas] = useState<FacturaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [portalDoc, setPortalDoc] = useState('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || localStorage.getItem('portal_codigo') || '';
    setPortalDoc(doc);
    if (!doc) {
      setLoading(false);
      return;
    }

    const cargarFacturas = async () => {
      setLoading(true);
      try {
        const variants = /^[VEJPG][-_\s]?\d+$/i.test(doc.trim()) 
          ? getIdentidadVariantsExact(doc) 
          : getIdentidadVariants(doc);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        // 1. Obtener pagos con factura digital
        const { data: pagos } = await supabase
          .from('pagos_reportados')
          .select('id, identidad, monto, banco, detalles, created_at')
          .or(orFilter)
          .order('created_at', { ascending: false });

        // 2. Obtener retenciones_iva para corroborar aprobaciones
        const { data: retenciones } = await supabase
          .from('retenciones_iva')
          .select('id, estado, codigo_retencion, factura_control, numero_planilla')
          .or(orFilter);

        const retMap = new Map<string, string>();
        (retenciones || []).forEach(r => {
          if (r.codigo_retencion) retMap.set(r.codigo_retencion.trim(), r.estado);
          if (r.factura_control) retMap.set(r.factura_control.trim(), r.estado);
        });

        const lista: FacturaFiscal[] = [];

        (pagos || []).forEach(p => {
          let det: any = {};
          try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch {}

          const fd = det.factura_digital;
          // Solo facturas que ya hayan sido emitidas
          if (!fd || fd.emitida !== true) return;

          const numDoc = fd.numero_documento || fd.raw_response?.resultado?.numeroDocumento || '0';
          const numCtrl = fd.numero_control || fd.raw_response?.resultado?.numeroControl || 'N/A';
          const fechaEmi = fd.fecha_emision ? fd.fecha_emision.split('T')[0] : (det.fecha_transaccion || p.created_at?.split('T')[0] || 'N/A');

          const r = fd.retencion || {};
          const montoRet = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || r.retenido || 0)) || 0;
          const esAgente = !!(det.agente_retencion || det.es_retencion || montoRet > 0 || r.estado);

          let retEstado: FacturaFiscal['retencionEstado'] = 'sin_retencion';
          let puedeVer = true;
          let motivoBloqueo = '';

          if (esAgente) {
            // Verificar estado en fd.retencion o en retenciones_iva
            let st = r.estado;
            if (!st || st === 'esperando_planilla') {
              const matchedEstado = retMap.get(`FAC-${numDoc}`) || (numCtrl !== 'N/A' ? retMap.get(numCtrl) : undefined);
              if (matchedEstado === 'Aprobado') st = 'aprobada';
              else if (matchedEstado === 'Rechazado') st = 'rechazada';
              else if (matchedEstado === 'Pendiente') st = 'planilla_recibida';
            }

            retEstado = st || 'esperando_planilla';

            // REGLA FUNDAMENTAL: Si son agentes de retención, la factura solo sale después de su aprobación de planilla
            if (retEstado !== 'aprobada' && det.retencion_aprobada !== true) {
              puedeVer = false;
              if (retEstado === 'esperando_planilla') {
                motivoBloqueo = 'Debe cargar su comprobante de retención del 75% en la sección Retención.';
              } else if (retEstado === 'planilla_recibida') {
                motivoBloqueo = 'Su comprobante de retención está en revisión por Hacienda Municipal.';
              } else if (retEstado === 'rechazada') {
                motivoBloqueo = 'Su comprobante fue rechazado. Debe corregirlo en la sección Retención.';
              }
            }
          }

          const total = parseFloat(String(r.total || det.montoTotal || det.monto_factura || p.monto || 0)) || 0;
          const base = parseFloat(String(r.base || (total ? total / 1.16 : 0))) || 0;
          const iva = parseFloat(String(r.iva || (total - base))) || 0;

          lista.push({
            id: `fac_${p.id}`,
            pagoId: p.id,
            numeroFactura: String(numDoc).padStart(8, '0'),
            numeroControl: numCtrl,
            fechaEmision: fechaEmi,
            montoTotal: total,
            baseImponible: base,
            ivaMonto: iva,
            urlPdf: fd.url || null,
            esAgenteRetencion: esAgente,
            retencionEstado: retEstado,
            retencionId: r.retencion_id,
            puedeVerFactura: puedeVer,
            bloqueoMotivo: motivoBloqueo
          });
        });

        // Ordenar por fecha o número descendente
        lista.sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));
        setFacturas(lista);
      } catch (err) {
        console.error('Error cargando facturas:', err);
      } finally {
        setLoading(false);
      }
    };

    cargarFacturas();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return facturas;
    const q = searchTerm.toLowerCase();
    return facturas.filter(f => 
      f.numeroFactura.toLowerCase().includes(q) ||
      f.numeroControl.toLowerCase().includes(q) ||
      f.fechaEmision.includes(q)
    );
  }, [facturas, searchTerm]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Facturación Fiscal Emitida
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consulte y descargue sus facturas electrónicas oficiales emitidas por el IAMEC.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por N° factura o control..." 
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 uppercase text-xs tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            Facturas Electrónicas ({filtered.length})
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
                <th className="px-5 py-3 font-bold">N° Factura</th>
                <th className="px-5 py-3 font-bold">N° Control</th>
                <th className="px-5 py-3 font-bold text-center">Fecha Emisión</th>
                <th className="px-5 py-3 font-bold text-right">Total Factura (Bs.)</th>
                <th className="px-5 py-3 font-bold text-center">Condición Fiscal</th>
                <th className="px-5 py-3 font-bold text-center">Documento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                    Cargando facturas oficiales emitidas...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium text-slate-600">No se encontraron facturas fiscales emitidas para este RIF.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Las facturas emitidas por la administración tributaria aparecerán reflejadas aquí automáticamente.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((fac) => (
                  <tr key={fac.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-black text-slate-800">
                      {fac.numeroFactura}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600 font-medium">
                      {fac.numeroControl}
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate-600 font-medium">
                      {fac.fechaEmision}
                    </td>
                    <td className="px-5 py-3.5 text-right font-black text-slate-800">
                      Bs. {formatBs(fac.montoTotal)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {fac.esAgenteRetencion ? (
                        fac.puedeVerFactura ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Retención Aprobada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200" title={fac.bloqueoMotivo}>
                            <Clock className="w-3 h-3" />
                            {fac.retencionEstado === 'planilla_recibida' ? 'Planilla en Revisión' : 'Planilla Pendiente'}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Emitida
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {fac.puedeVerFactura && fac.urlPdf ? (
                        <a 
                          href={fac.urlPdf} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors shadow-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Descargar Factura
                        </a>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 cursor-not-allowed">
                            <Lock className="w-3 h-3 text-slate-400" /> Bloqueada
                          </span>
                          <Link 
                            href="/portal/retenciones" 
                            className="text-[10px] text-emerald-600 hover:underline mt-1 font-bold"
                          >
                            Ir a Retención →
                          </Link>
                        </div>
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
