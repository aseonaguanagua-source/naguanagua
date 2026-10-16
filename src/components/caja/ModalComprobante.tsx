'use client';
import { useState, useEffect } from 'react';
import { X, Download, Eye, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ModalComprobanteProps {
  pago: any;
  onClose: () => void;
}

function parseDetalles(d: any) {
  if (!d) return {};
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { return {}; }
  }
  return d;
}

function isImg(url: string) {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const clean = url.split('?')[0].toLowerCase();
  return clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.png') || clean.endsWith('.webp') || clean.endsWith('.gif');
}

export function ModalComprobante({ pago, onClose }: ModalComprobanteProps) {
  const det = parseDetalles(pago?.detalles);
  const [archivos, setArchivos] = useState<{ name: string; url: string; tipo?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const urls: { name: string; url: string; tipo?: string }[] = [];

      // 1. Comprobante de pago directo
      if (det.comprobante_url) {
        urls.push({ name: det.comprobante_nombre || 'Comprobante de Pago', url: det.comprobante_url, tipo: 'Pago' });
      }
      if (urls.length === 0 && det.comprobante_b64) {
        urls.push({ name: det.comprobante_nombre || 'Comprobante de Pago', url: det.comprobante_b64, tipo: 'Pago' });
      }

      // 2. Comprobante de retención de IVA
      if (det.comprobante_retencion_url) {
        urls.push({ name: det.comprobante_retencion_nombre || 'Comprobante de Retención IVA', url: det.comprobante_retencion_url, tipo: 'Retención' });
      }
      if (det.comprobante_retencion_b64) {
        urls.push({ name: det.comprobante_retencion_nombre || 'Comprobante de Retención IVA', url: det.comprobante_retencion_b64, tipo: 'Retención' });
      }

      // 3. Pagos agregados (Caja de Condominios y pagos múltiples)
      if (Array.isArray(det.pagos_agregados)) {
        for (const pa of det.pagos_agregados) {
          if (pa?.comprobante_url && !urls.some(u => u.url === pa.comprobante_url)) {
            urls.push({ name: pa.comprobante_nombre || pa.referencia || 'Comprobante Condominio', url: pa.comprobante_url, tipo: 'Pago' });
          }
          if (pa?.comprobante_b64 && !urls.some(u => u.url === pa.comprobante_b64)) {
            urls.push({ name: pa.comprobante_nombre || 'Comprobante Condominio', url: pa.comprobante_b64, tipo: 'Pago' });
          }
        }
      }

      // 4. Formas de pago
      if (Array.isArray(det.formasPago)) {
        for (const fp of det.formasPago) {
          if (fp?.comprobante_url && !urls.some(u => u.url === fp.comprobante_url)) {
            urls.push({ name: fp.comprobante_nombre || fp.referencia || 'Comprobante Pago', url: fp.comprobante_url, tipo: 'Pago' });
          }
        }
      }

      // 5. Hermanos del grupo de pago
      if (urls.length === 0 && (pago?.grupo_pago || det.grupo_pago)) {
        try {
          const gId = pago?.grupo_pago || (typeof det.grupo_pago === 'string' ? det.grupo_pago : det.grupo_pago?.id);
          if (gId) {
            const { data: hermanos } = await supabase
              .from('pagos_reportados')
              .select('detalles')
              .eq('grupo_pago', gId);
            for (const h of hermanos || []) {
              const hDet = parseDetalles(h.detalles);
              if (hDet.comprobante_url && !urls.some(u => u.url === hDet.comprobante_url)) {
                urls.push({ name: hDet.comprobante_nombre || 'Comprobante Grupo', url: hDet.comprobante_url, tipo: 'Pago' });
              }
            }
          }
        } catch {}
      }

      setArchivos(urls);
      setLoading(false);
    })();
  }, [pago, det]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Comprobante de Pago y Retención</h2>
              <p className="text-xs text-slate-400">
                Ref: {pago?.referencia || 'Sin referencia'} • {pago?.identidad || ''} - {pago?.contribuyente || det.contribuyente || ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info resumen */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block font-medium">Monto del Pago:</span>
            <span className="font-bold text-slate-900 text-sm">
              Bs. {parseFloat(String(pago?.monto || '0').replace(/[^0-9.]/g, '')).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium">Método / Banco:</span>
            <span className="font-bold text-slate-900 truncate block">
              {pago?.banco || pago?.tipo || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium">Estado del Pago:</span>
            <span className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
              pago?.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-800' :
              pago?.estado === 'Por Verificar' ? 'bg-amber-100 text-amber-800' :
              'bg-slate-200 text-slate-800'
            }`}>
              {pago?.estado || 'Registrado'}
            </span>
          </div>
        </div>

        {/* Visor de comprobantes */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="text-center py-12 text-slate-400 font-medium">
              Cargando comprobantes adjuntos...
            </div>
          ) : archivos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl p-6 text-slate-500">
              <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No se encontró ningún archivo adjunto</p>
              <p className="text-xs text-slate-400 mt-1">Este pago fue registrado sin comprobante digital adjunto o por punto de venta presencial.</p>
            </div>
          ) : (
            archivos.map((arch, idx) => (
              <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold rounded text-[10px] uppercase">
                      {arch.tipo || 'Archivo'}
                    </span>
                    <span className="font-semibold text-slate-800 truncate max-w-[280px]">
                      {arch.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={arch.url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold text-xs"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </a>
                    <a
                      href={arch.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" /> Abrir en grande
                    </a>
                  </div>
                </div>

                {isImg(arch.url) ? (
                  <div className="bg-slate-900/95 flex items-center justify-center p-3 min-h-[220px]">
                    <img
                      src={arch.url}
                      alt={arch.name}
                      className="max-h-[460px] max-w-full object-contain rounded shadow"
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700 mb-1">{arch.name}</p>
                    <p className="text-xs text-slate-400 mb-4">Documento en formato PDF o no previsualizable directamente.</p>
                    <a
                      href={arch.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm"
                    >
                      <Eye className="w-4 h-4" /> Visualizar Documento PDF
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pie */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
