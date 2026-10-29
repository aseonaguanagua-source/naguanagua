'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCheck, RefreshCw, Filter, Landmark, Eye, Download, X,
  Pencil, Mail, Building2, Receipt
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/store/AppContext';
import { logAudit } from '@/lib/audit';
import AdminRetenciones from '@/components/AdminRetenciones';
import { LISTA_BANCOS } from '@/lib/bancos';
import { calcularMensualidad, isResidencialInm, cleanClasificacionActividad } from '@/lib/calculos';
import { desglosarPago } from '@/lib/desglosePago';
import { FILTROS_MODULO, FiltroModulo, OR_CONDOMINIOS, infoCondominioPago, pasaFiltroModulo, rifsCondominios, useCondominiosLigero } from '@/lib/condominios/pagosCondominio';
import { actualizarPago } from '@/lib/actualizarPago';
import { acreditarSaldoFavor, descontarSaldoFavor } from '@/lib/saldoFavor';
import { parseLocalFloat, formatLocalNumberInput, formatBs, getIdentidadVariantsExact } from '@/lib/formatters';

/** Fecha (YYYY-MM-DD) de la transacción tal como se registró en Caja / Caja de Condominios. */
const fechaTransaccionDe = (det: any): string => {
  const f = det?.fecha_transaccion
    || (det?.pagos_agregados || []).find((p: any) => p?.fecha && p?.metodo !== 'Saldo a Favor')?.fecha
    || (det?.formasPago || []).find((p: any) => p?.fecha && p?.descripcion !== 'Saldo a Favor')?.fecha;
  return f ? String(f).slice(0, 10) : '';
};

type Pago = {
  id: string;
  identidad: string;
  cod_inmueble?: string;
  contribuyente?: string;
  referencia?: string;
  created_at?: string;
  fecha_transaccion?: string;
  tipo?: string;
  banco?: string;
  banco_destino?: string;
  estado?: string;
  monto?: string | number;
  detalles?: any;
  correo?: string;
  telefono?: string;
  grupo_pago?: any;
};

type Filtros = {
  desde: string;
  hasta: string;
  estatus: string;
  bancoDestino: string;
  formaPago: string;
  referencia: string;
  monto: string;
  modulo: FiltroModulo;
};

const BANCOS_DESTINO = [
  'Todos',
  'BANCAMIGA - 0172 - 0717',
  'BANESCO - 0134 - 8636',
  'BANCO DE VENEZUELA - 0102',
  'BANCO MERCANTIL - 0105',
  'BANCO PROVINCIAL - 0108',
];

const FORMAS_PAGO = ['Todos', 'Transferencia', 'Punto de Venta', 'Debito', 'TMD (Master)', 'TVD (Visa)', 'Efectivo'];
const ESTATUS_LIST = ['Todos', 'Pendiente', 'Por Verificar', 'Aprobado', 'Rechazado'];
const ESTATUS_CONCILIAR = ['Aprobado', 'Rechazado', 'Con Diferencia'];

function fmt(val: string | number | undefined) {
  return formatBs(val);
}

function fmtFecha(iso: string | undefined) {
  if (!iso) return '---';
  try {
    return new Date(iso).toLocaleDateString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

function parseDetalles(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

// ─── EXTRACTOR UNIVERSAL DE COMPROBANTES ────────────────
export function extraerArchivosComprobante(pago: any): { name: string; url: string; tipo: 'Pago' | 'Retención' | 'Condominio' }[] {
  if (!pago) return [];
  const det = parseDetalles(pago.detalles);
  const urls: { name: string; url: string; tipo: 'Pago' | 'Retención' | 'Condominio' }[] = [];

  const add = (name: string, url: any, tipo: 'Pago' | 'Retención' | 'Condominio') => {
    if (!url || typeof url !== 'string' || !url.trim()) return;
    const cleanUrl = url.trim();
    if (!urls.some(u => u.url === cleanUrl)) {
      urls.push({ name: name || 'comprobante', url: cleanUrl, tipo });
    }
  };

  // 1. Directos en detalles del registro específico
  if (det.comprobante_url) add(det.comprobante_nombre || 'Comprobante de Pago', det.comprobante_url, 'Pago');
  if (det.comprobante_b64) add(det.comprobante_nombre || 'Comprobante de Pago (Base64)', det.comprobante_b64, 'Pago');
  if (det.soporte_url) add('Soporte de Pago', det.soporte_url, 'Pago');
  if (det.comprobante && typeof det.comprobante === 'string') add('Comprobante', det.comprobante, 'Pago');

  // 2. Retenciones de IVA (Comprobante SENIAT)
  if (det.comprobante_retencion_url) add(det.comprobante_retencion_nombre || 'Comprobante Retención IVA (SENIAT)', det.comprobante_retencion_url, 'Retención');
  if (det.comprobante_retencion_b64) add(det.comprobante_retencion_nombre || 'Comprobante Retención IVA (SENIAT)', det.comprobante_retencion_b64, 'Retención');
  if (det.planilla_url) add(det.comprobante_nombre || 'Planilla de Retención (SENIAT)', det.planilla_url, 'Retención');

  // 3. Raíz del objeto pago
  if (pago.comprobante_url) add('Comprobante de Pago', pago.comprobante_url, 'Pago');
  if (pago.comprobante_b64) add('Comprobante de Pago', pago.comprobante_b64, 'Pago');

  // 4. Pagos agregados (Caja de Condominios y pagos múltiples):
  // Si ya tenemos el comprobante propio específico de esta fila, NO agregamos los comprobantes de otros pagos.
  // Si no tenemos ninguno aún, buscamos EXCLUSIVAMENTE el pago agregado que coincida con la referencia o monto de esta conciliación.
  if (urls.length === 0 && Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 0) {
    const refPago = String(pago.referencia || det.referencia || '').trim().toLowerCase();
    const montoPago = Number(pago.monto || det.montoTotal || 0);

    const paExacto = det.pagos_agregados.find((pa: any) => {
      const paRef = String(pa?.referencia || '').trim().toLowerCase();
      if (refPago && paRef && (paRef === refPago || refPago.includes(paRef) || paRef.includes(refPago))) return true;
      if (montoPago > 0 && Math.abs(Number(pa?.monto) - montoPago) < 0.01) return true;
      return false;
    });

    if (paExacto) {
      if (paExacto.comprobante_url) add(paExacto.comprobante_nombre || paExacto.referencia || 'Comprobante Condominio', paExacto.comprobante_url, 'Condominio');
      if (paExacto.comprobante_b64) add(paExacto.comprobante_nombre || 'Comprobante Condominio (Base64)', paExacto.comprobante_b64, 'Condominio');
    } else if (det.pagos_agregados.length === 1) {
      const paUnico = det.pagos_agregados[0];
      if (paUnico?.comprobante_url) add(paUnico.comprobante_nombre || paUnico.referencia || 'Comprobante Condominio', paUnico.comprobante_url, 'Condominio');
      if (paUnico?.comprobante_b64) add(paUnico.comprobante_nombre || 'Comprobante Condominio (Base64)', paUnico.comprobante_b64, 'Condominio');
    }
  }

  // 5. Formas de pago (solo si aún no hay comprobante y coincide la referencia)
  if (urls.length === 0 && Array.isArray(det.formasPago)) {
    const refPago = String(pago.referencia || det.referencia || '').trim().toLowerCase();
    for (const fp of det.formasPago) {
      const fpRef = String(fp?.referencia || '').trim().toLowerCase();
      const coincide = !refPago || !fpRef || fpRef === refPago || refPago.includes(fpRef) || fpRef.includes(refPago);
      if (coincide) {
        if (fp?.comprobante_url) add(fp.comprobante_nombre || fp.referencia || 'Comprobante Forma Pago', fp.comprobante_url, 'Pago');
        if (fp?.comprobante_b64) add(fp.comprobante_nombre || 'Comprobante Forma Pago (Base64)', fp.comprobante_b64, 'Pago');
      }
    }
  }

  return urls;
}

// ─── MODAL COMPROBANTE ──────────────────────────────────
function ModalComprobante({ pago, onClose }: { pago: Pago; onClose: () => void }) {
  const det = parseDetalles(pago.detalles);
  const [archivos, setArchivos] = useState<{ name: string; url: string; tipo: 'Pago' | 'Retención' | 'Condominio' }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const urls = extraerArchivosComprobante(pago);

      // Si pertenece a un grupo de pago (hermanos con comprobante) y no hallamos en el propio registro
      if (urls.length === 0 && (pago.grupo_pago || det.grupo_pago)) {
        try {
          const gId = pago.grupo_pago || (typeof det.grupo_pago === 'string' ? det.grupo_pago : det.grupo_pago?.id);
          if (gId) {
            const { data: hermanos } = await supabase
              .from('pagos_reportados')
              .select('detalles')
              .eq('grupo_pago', gId);
            for (const h of hermanos || []) {
              const hUrls = extraerArchivosComprobante(h);
              hUrls.forEach(u => {
                if (!urls.some(existing => existing.url === u.url)) urls.push(u);
              });
            }
          }
        } catch { /* ignorar */ }
      }

      // Si es una retención vinculada a un pago principal, traer el comprobante del pago vinculado
      if (urls.length === 0 && det.pago_vinculado) {
        try {
          const { data: vPago } = await supabase
            .from('pagos_reportados')
            .select('detalles')
            .eq('id', det.pago_vinculado)
            .maybeSingle();
          if (vPago) {
            const vUrls = extraerArchivosComprobante(vPago);
            vUrls.forEach(u => {
              if (!urls.some(existing => existing.url === u.url)) urls.push(u);
            });
          }
        } catch { /* ignorar */ }
      }

      // Fallback opcional a storage si aún no se halló nada
      if (urls.length === 0) {
        try {
          const { data: files } = await supabase.storage
            .from('documentos').list('comprobantes', { limit: 10 });
          if (files && files.length > 0) {
            for (const f of files) {
              const { data: sd } = await supabase.storage.from('documentos')
                .createSignedUrl('comprobantes/' + f.name, 3600);
              if (sd?.signedUrl) urls.push({ name: f.name, url: sd.signedUrl, tipo: 'Pago' });
            }
          }
        } catch { /* sin storage */ }
      }

      setArchivos(urls);
      setLoading(false);
    })();
  }, [pago]);

  const label = (det.cod_inmueble || pago.cod_inmueble || '') + '-' + (pago.contribuyente || pago.identidad || '');

  const isImg = (url: string) => url.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(url);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Detalles de la Conciliaci�n</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Monto Reportado</p>
                {(det.pago_principal_id || det.es_pago_adicional || pago.grupo_pago || (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1)) && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${det.es_pago_adicional ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-indigo-100 text-indigo-700'}`}>
                    {det.es_pago_adicional ? 'Diferencia' : (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1 ? 'Anticipo' : 'Transferencia')}
                  </span>
                )}
              </div>
              <p className="text-lg font-black text-slate-800">
                Bs. {parseFloat(String(pago.monto || '0').replace(/[^0-9.]/g, '')).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-1">Ref: {pago.referencia || 'N/A'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Tasa Utilizada</p>
              <p className="text-lg font-black text-slate-800">
                {det.tasa_bcv ? 'Bs. ' + Number(det.tasa_bcv).toFixed(2) : '---'}
              </p>
              {det.total_seleccionado && Number(det.total_seleccionado) !== Number(pago.monto) && (
                <p className="text-[11px] text-slate-500 mt-1">Deuda total: Bs. {parseFloat(String(det.total_seleccionado)).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
              )}
            </div>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase mb-3">Archivos Adjuntos ({label})</h3>
          {loading ? (
            <div className="text-center py-8 text-slate-400">Cargando comprobantes...</div>
          ) : archivos.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              <p className="mt-2">No hay comprobante adjunto para este pago.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {archivos.map((arch, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 truncate max-w-[280px]">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${arch.tipo === 'Retención' ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                        {arch.tipo}
                      </span>
                      <span className="text-xs font-mono font-semibold text-slate-700 truncate" title={arch.name}>{arch.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <a href={arch.url} download target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-semibold">
                        <Download size={14} /> Descargar
                      </a>
                      <a href={arch.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs font-semibold">
                        <Eye size={14} /> Nueva pesta�a
                      </a>
                    </div>
                  </div>
                  {isImg(arch.url) ? (
                    <div className="bg-slate-900 flex items-center justify-center p-4 min-h-[200px]">
                      <img src={arch.url} alt="Comprobante" className="max-w-full max-h-[500px] object-contain rounded shadow-lg" />
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500">
                      <p className="text-sm mb-3">Archivo PDF u otro formato.</p>
                      <a href={arch.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700">
                        <Eye size={14} /> Ver documento
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end px-6 py-3 border-t border-slate-200 shrink-0">
          <button onClick={onClose} className="px-5 py-2 border border-red-400 text-red-600 hover:bg-red-50 rounded font-semibold text-sm flex items-center gap-2">
            <X size={14} /> Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ESTADO DE CUENTA ──────────────────────────────
function ModalEstadoCuenta({ pago, onClose }: { pago: Pago; onClose: () => void }) {
  const [recibos, setFacturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inmueble, setInmueble] = useState<any>(null);
  const det = parseDetalles(pago.detalles);
  const mesesNombre = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const idLimpio = (pago.identidad || '').replace(/-/g, '').trim();
        const idConGuion = idLimpio.length > 1 ? idLimpio.charAt(0) + '-' + idLimpio.slice(1) : idLimpio;
        const { data: inms } = await supabase
          .from('inmuebles')
          .select('*')
          .or(`identidad.eq.${pago.identidad},identidad.eq.${idLimpio},identidad.eq.${idConGuion}`);

        if (inms && inms.length > 0) {
          // Calcular totales
          // DEUDA TOTAL CALCULADA DE RECIBOS EN LUGAR DE INMUEBLES
          let deudaTotal = 0;
          try {
            const { data: facs } = await supabase
              .from('facturas')
              .select('monto')
              .or(`identidad.eq.${pago.identidad},identidad.eq.${idLimpio}`)
              .in('estado', ['Pendiente', 'Por Verificar']);
            if (facs) {
              deudaTotal = facs.reduce((a, f) => a + (parseFloat(String(f.monto || '0').replace(/[^0-9.]/g,'')) || 0), 0);
            }
          } catch(e) {}
          const saldoFavor = inms.reduce((a: number, i: any) => a + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
          const esCondo = det.modulo === 'condominios' || (pago as any).modulo === 'condominios' || !!det.es_condominio || !!det.condominio;
          const unidadCod = det.condominio?.lineas?.[0]?.inmueble || det.inmueble || det.cod_inmueble || det.codigo_inmueble;
          const codInmDet = unidadCod || det.condominio?.codigo || det.codigo_condominio || pago.cod_inmueble;
          const inmPrincipal = codInmDet
            ? (inms.find((i: any) => i.inmueble === codInmDet || i.cod_cont === codInmDet || i.cod_cont === codInmDet.replace(/-/g,'')) || inms[0])
            : inms[0];
          setInmueble({ ...inmPrincipal, _deudaTotal: deudaTotal, _saldoFavor: saldoFavor, _todos: inms });
        }
        const { data: facs } = await supabase.from('facturas').select('*')
          .or(`identidad.eq.${pago.identidad},identidad.eq.${idLimpio}`)
          .order('emision', { ascending: true });
        setFacturas(facs || []);
      } catch(e) { console.error(e); }
      setLoading(false);
    })();
  }, [pago.identidad]);

  const pendientes = recibos.filter(f => f.estado === 'Pendiente');
  const pagadas = recibos.filter(f => f.estado === 'Pagado');
  const totalDoc = (det.monto_neto_factura && Number(det.monto_neto_factura) > 0)
    ? Number(det.monto_neto_factura)
    : (det.total_seleccionado && Number(det.total_seleccionado) > 0)
      ? Number(det.total_seleccionado)
      : parseLocalFloat(pago.monto);
  const totalPendiente = pendientes.reduce((a, f) => a + (parseFloat(String(f.monto||'0').replace(/[^0-9.]/g,''))||0), 0);
  const totalPagado = pagadas.reduce((a, f) => a + (parseFloat(String(f.monto||'0').replace(/[^0-9.]/g,''))||0), 0);

  // Desglose real del pago (misma fórmula de Caja): base, multa, IVA completo, IVA retenido y total a cancelar
  const desglose = (() => {
    try {
      const todos: any[] = inmueble?._todos || [];
      if (todos.length === 0) return null;
      const map = new Map<string, any>(todos.map((i: any) => [String(i.inmueble), i]));
      const d = desglosarPago(pago, map);
      return d.lineas.length > 0 ? d : null;
    } catch { return null; }
  })();
  const dBase = desglose ? desglose.lineas.reduce((s, l) => s + l.base, 0) : 0;
  const dMulta = desglose ? desglose.lineas.reduce((s, l) => s + l.multa, 0) : 0;
  const dIva = desglose ? desglose.lineas.reduce((s, l) => s + l.iva, 0) : 0;
  const dRet = desglose ? desglose.lineas.reduce((s, l) => s + l.retencion, 0) : 0;
  const dExento = desglose ? desglose.lineas.filter(l => l.esResidencial || l.tipo !== 'mes').reduce((s, l) => s + l.base, 0) : totalDoc;
  const dImponible = desglose ? desglose.lineas.filter(l => !l.esResidencial && l.tipo === 'mes').reduce((s, l) => s + l.base, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex items-center justify-between rounded-t-xl">
          <div>
            <h1 className="text-xl font-bold text-slate-800">ESTADO DE CUENTA</h1>
            <p className="text-xs text-slate-500">Generado por: {det.analista || 'Administrador'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-600">Nro.: {String(pago.id || '').slice(-5).padStart(5, '0')}</p>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-1"><X size={18} /></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {loading ? <div className="text-center py-12 text-slate-400">Cargando estado de cuenta...</div> : (
            <>
              {/* DATOS COMPLETOS DEL CONTRIBUYENTE */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-800 px-4 py-2">
                  <p className="text-xs font-bold text-white uppercase tracking-wide">Datos del Contribuyente</p>
                </div>
                <div className="grid grid-cols-2 gap-0 text-sm">
                  <div className="border-b border-r border-slate-100 px-3 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">RIF / Cédula</span>
                    <span className="font-semibold text-slate-800">{pago.identidad || '---'}</span>
                  </div>
                  <div className="border-b border-slate-100 px-3 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Código Inmueble</span>
                    <span className="font-semibold text-slate-800">{inmueble?.cod_cont || det.cod_inmueble || pago.cod_inmueble || '---'}</span>
                  </div>
                  <div className="border-b border-r border-slate-100 px-3 py-2 col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Nombre / Razón Social</span>
                    <span className="font-bold text-slate-900 text-base">{inmueble?.contribuyente || pago.contribuyente || '---'}</span>
                  </div>
                  <div className="border-b border-r border-slate-100 px-3 py-2 col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Actividad / Inmueble</span>
                    <span className="text-slate-700">{cleanClasificacionActividad(inmueble?.actividad_principal || inmueble?.clasificacion || '') || 'Servicio de Aseo Urbano'}</span>
                  </div>
                  <div className="border-b border-r border-slate-100 px-3 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Tel�fono</span>
                    <span className="text-slate-700">{inmueble?.telefono || '---'}</span>
                  </div>
                  <div className="border-b border-slate-100 px-3 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Correo Electr�nico</span>
                    <span className="text-slate-700 text-xs">{inmueble?.correo_electronico || inmueble?.correo || '---'}</span>
                  </div>
                  <div className="border-b border-slate-100 px-3 py-2 col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Direcci�n del Inmueble</span>
                    <span className="text-slate-700">{inmueble?.direccion || 'Naguanagua Municipio Naguanagua, Falc�n'}</span>
                  </div>
                  <div className="border-r border-slate-100 px-3 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Estado</span>
                    <span className={`font-bold ${inmueble?.estado === 'Activo' ? 'text-green-700' : 'text-red-600'}`}>{inmueble?.estado || 'Activo'}</span>
                  </div>
                  <div className="px-3 py-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">�rea (Mt�)</span>
                    <span className="text-slate-700">{inmueble?.area_m2 ? inmueble.area_m2 + ' Mt�' : '---'}</span>
                  </div>
                </div>
                {/* Resumen financiero total del contribuyente */}
                <div className="grid grid-cols-3 gap-0 border-t border-slate-200">
                  <div className="bg-red-50 px-3 py-2 text-center border-r border-slate-200">
                    <p className="text-[9px] font-bold text-red-500 uppercase">Deuda Total en Sistema</p>
                    <p className="text-sm font-black text-red-700">Bs. {fmt(inmueble?._deudaTotal || 0)}</p>
                  </div>
                  <div className="bg-green-50 px-3 py-2 text-center border-r border-slate-200">
                    <p className="text-[9px] font-bold text-green-500 uppercase">Saldo a Favor</p>
                    <p className="text-sm font-black text-green-700">Bs. {fmt(inmueble?._saldoFavor || 0)}</p>
                  </div>
                  <div className="bg-blue-50 px-3 py-2 text-center">
                    <p className="text-[9px] font-bold text-blue-500 uppercase">Inmuebles Registrados</p>
                    <p className="text-sm font-black text-blue-700">{inmueble?._todos?.length || 1}</p>
                  </div>
                </div>
              </div>
              <div>
                <div className="bg-slate-200 px-3 py-1.5 font-bold text-sm text-slate-700 text-center uppercase mb-2 rounded">Estado de Cuenta Resumido</div>
                <div className="space-y-1 text-sm px-2">
                  <div className="flex justify-between">
                    <span className="text-blue-600 font-semibold">Periodos Calculados ({pendientes.length}):</span>
                    <span className="font-bold">{pendientes.map(f => { const p = (f.emision||'').split('-'); return p.length>=2 ? mesesNombre[parseInt(p[1])-1]+'-'+p[0] : f.emision; }).join(', ') || '---'}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-blue-600">Monto del Pago Reportado Bs.:</span><span className="font-bold">{fmt(totalDoc)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Total Recibos Pendientes:</span><span className="text-red-600 font-semibold">{fmt(totalPendiente)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Total Recibos Pagadas:</span><span className="text-green-600 font-semibold">{fmt(totalPagado)}</span></div>
                  <div className="flex justify-between"><span className="text-blue-600">Total Exento Bs.:</span><span>{fmt(dExento)}</span></div>
                  <div className="flex justify-between"><span>Base Imponible Bs.:</span><span>{fmt(dImponible)}</span></div>
                  {dMulta > 0 && <div className="flex justify-between"><span>Multas Bs.:</span><span>{fmt(dMulta)}</span></div>}
                  <div className="flex justify-between"><span>IVA completo (16.00%) Bs.:</span><span>{fmt(dIva)}</span></div>
                  {dRet > 0 && (
                    <>
                      <div className="flex justify-between text-amber-700"><span>IVA Retenido 75% (Agente de Retención) Bs.:</span><span className="font-semibold">- {fmt(dRet)}</span></div>
                      <div className="flex justify-between"><span>IVA a Cancelar (25%) Bs.:</span><span>{fmt(dIva - dRet)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Total estado de cuenta Bs.:</span><span className="font-bold">{fmt(desglose ? dBase + dMulta + dIva : totalDoc)}</span></div>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 flex justify-between items-center">
                <span className="text-lg font-bold text-slate-800 uppercase">{dRet > 0 ? 'Total a Cancelar (con retención de IVA)' : 'Total a Pagar'}</span>
                <span className="text-xl font-bold text-slate-900">Bs. {fmt(totalDoc)}</span>
              </div>
              <div>
                <div className="bg-slate-200 px-3 py-1.5 font-bold text-sm text-slate-700 text-center uppercase mb-2 rounded">Estado de Cuenta Detallado</div>
                <table className="w-full text-xs border border-slate-200 rounded">
                  <thead className="bg-slate-100">
                    <tr>{['Periodo','Inmueble','Recoleccion','Multa','IVA 16%','IVA Retenido','A Cancelar'].map(h=><th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {desglose ? desglose.lineas.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2">{l.periodo}</td>
                        <td className="px-3 py-2 font-mono">{l.codigo}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.base)}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.multa)}</td>
                        <td className="px-3 py-2 text-right">{fmt(l.iva)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{l.retencion > 0 ? `- ${fmt(l.retencion)}` : '0,00'}</td>
                        <td className="px-3 py-2 text-right font-bold">{fmt(l.total)}</td>
                      </tr>
                    )) : pendientes.length > 0 ? pendientes.map((f,i) => {
                      const m = parseFloat(String(f.monto||'0').replace(/[^0-9.]/g,''));
                      return (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2">{f.emision||'---'}</td>
                          <td className="px-3 py-2">{cleanClasificacionActividad(inmueble?.actividad_principal || '') || 'Servicio de Aseo Urbano'}</td>
                          <td className="px-3 py-2 text-right">{fmt(m)}</td>
                          <td className="px-3 py-2 text-right">0,00</td><td className="px-3 py-2 text-right">0,00</td>
                          <td className="px-3 py-2 text-right">0,00</td><td className="px-3 py-2 text-right font-bold">{fmt(m)}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">Sin recibos pendientes</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-slate-700">
                  <p className="font-bold text-blue-900 mb-1 uppercase text-[11px]">Cuenta Oficial Bancamiga</p>
                  <p><span className="font-semibold">Banco:</span> Bancamiga (0172)</p>
                  <p><span className="font-semibold">Tipo:</span> Cuenta Corriente</p>
                  <p><span className="font-semibold">Cta:</span> <span className="font-mono font-bold text-slate-900">01720110711101340717</span></p>
                  <p className="mt-1">Titular: <strong>IAMEC BANCAMIGA</strong></p>
                  <p className="text-[11px] text-slate-500">R.I.F.: <strong>G-200086149</strong></p>
                </div>
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-slate-700">
                  <p className="font-bold text-emerald-900 mb-1 uppercase text-[11px]">Cuenta Oficial Banesco</p>
                  <p><span className="font-semibold">Banco:</span> Banesco (0134)</p>
                  <p><span className="font-semibold">Tipo:</span> Cuenta Corriente</p>
                  <p><span className="font-semibold">Cta:</span> <span className="font-mono font-bold text-slate-900">01341089590001008636</span></p>
                  <p className="mt-1">Titular: <strong>INST. SOC. MUN. PARA EL AMBIENTE</strong></p>
                  <p className="text-[11px] text-slate-500">R.I.F.: <strong>G-200086149</strong></p>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 pb-4">
          <button onClick={() => window.print()} className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded font-semibold text-sm">Imprimir</button>
          <button onClick={onClose} className="px-5 py-2 border border-red-400 text-red-600 hover:bg-red-50 rounded font-semibold text-sm flex items-center gap-2"><X size={14}/> Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL CONCILIACION ──────────────────────────────────
function ModalConciliacion({ pago, onClose, onSuccess }: { pago: Pago; onClose: () => void; onSuccess: () => void }) {
  const det = parseDetalles(pago.detalles);
  const desglose = (() => {
    try { return typeof det.desglose === 'string' ? JSON.parse(det.desglose) : det.desglose; } catch { return null; }
  })();
  const dRet = desglose ? desglose.lineas.reduce((s: any, l: any) => s + (l.retencion || 0), 0) : 0;

  // Información del contribuyente cargada desde Supabase (solo lectura)
  const [contribInfo, setContribInfo] = useState<any>(null);
  const [loadingContrib, setLoadingContrib] = useState(true);

  // Normalizar monto reportado (quitar formato venezolano)
  const montoReportadoNum = typeof pago.monto === 'number'
    ? pago.monto
    : parseLocalFloat(pago.monto);

  const [estatus, setEstatus] = useState<string>(
    ['Aprobado','Rechazado','Con Diferencia'].includes(pago.estado || '')
      ? (pago.estado || 'Aprobado')
      : 'Aprobado'
  );
  // Monto conciliado: auto-fill segun estatus
  const [montoConciliado, setMontoConciliado] = useState<string>(
    String(det.monto_conciliado || montoReportadoNum.toFixed(2))
  );
  const [bancoEmisor, setBancoEmisor] = useState(pago.banco || '');
  const [bancoReceptor, setBancoReceptor] = useState(pago.banco_destino || det.banco_destino || det.banco_receptor || '');
  const [referenciaOrigen, setReferenciaOrigen] = useState(pago.referencia || '');
  const [correoResponsable, setCorreoResponsable] = useState(det.correo || '');
  const [telefonoResponsable, setTelefonoResponsable] = useState(det.telefono || '');
  const hoyCaracasStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const [fechaTransaccion, setFechaTransaccion] = useState(fechaTransaccionDe(det) || hoyCaracasStr);
  const [fechaBanco, setFechaBanco] = useState(det.fecha_banco || fechaTransaccionDe(det) || hoyCaracasStr);
  const [enviarCorreo, setEnviarCorreo] = useState(true);
  const [observaciones, setObservaciones] = useState(det.observaciones || '');
  const [cajeroOperador, setCajeroOperador] = useState(det.cajero || det.caja || det.usuario || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showComp, setShowComp] = useState(false);
  const [showEdo, setShowEdo] = useState(false);
  // Tasa personalizada para recalculo exclusivo de esta conciliacion
  const tasaOriginal = det.tasa_bcv ? Number(det.tasa_bcv) : 0;
  const [tasaCustom, setTasaCustom] = useState<string>(tasaOriginal ? tasaOriginal.toFixed(2) : '');
  const [facturasParaConciliar, setFacturasParaConciliar] = useState<any[]>([]);
  const [pagosVinculados, setPagosVinculados] = useState<any[]>([]);
  const [cargandoVinculados, setCargandoVinculados] = useState(false);
  const [conciliarTodoElGrupo, setConciliarTodoElGrupo] = useState(true);

  const bancosVenezuela = LISTA_BANCOS;

  // Cargar pagos vinculados / transferencias adicionales del mismo grupo o factura
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setCargandoVinculados(true);
        const mainId = det.pago_principal_id || (pago.grupo_pago && typeof pago.grupo_pago === 'string' && pago.grupo_pago !== pago.id ? pago.grupo_pago : pago.id);
        const orParts = [
          `id.eq.${mainId}`,
          `grupo_pago.eq.${mainId}`,
          `detalles->>pago_principal_id.eq.${mainId}`
        ];
        if (pago.grupo_pago && typeof pago.grupo_pago === 'string') {
          orParts.push(`grupo_pago.eq.${pago.grupo_pago}`);
        }
        const { data } = await supabase
          .from('pagos_reportados')
          .select('*')
          .or(orParts.join(','));
        
        if (!cancel && data && data.length > 1) {
          setPagosVinculados(data);
        } else if (!cancel) {
          setPagosVinculados([]);
        }
      } catch (e) {
        console.error('Error fetching pagos vinculados:', e);
      } finally {
        if (!cancel) setCargandoVinculados(false);
      }
    })();
    return () => { cancel = true; };
  }, [pago.id, det.pago_principal_id, pago.grupo_pago]);

  // Cargar TODA la info del contribuyente desde inmuebles
  useEffect(() => {
    (async () => {
      setLoadingContrib(true);
      try {
        const esCondo = det.modulo === 'condominios' || (pago as any).modulo === 'condominios' || !!det.es_condominio || !!det.condominio;
        const condoCod = det.condominio?.codigo || det.codigo_condominio || det.codigo_inmueble || det.cod_inmueble || pago.cod_inmueble;

        // Detectar si el pago corresponde a un local/unidad individual dentro del condominio o contribuyente
        const recibosCodesModal: string[] = [];
        if (Array.isArray(det.recibos)) {
          for (const r of det.recibos) {
            const m = String(r).match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+)/i);
            if (m && m[1]) {
              const c = m[1].toUpperCase().split('-')[0];
              if (c && !recibosCodesModal.includes(c)) recibosCodesModal.push(c);
            }
          }
        }

        const unidadCod = det.condominio?.lineas?.[0]?.inmueble 
          || (recibosCodesModal.length > 0 ? recibosCodesModal[0] : null)
          || (det.inmueble && det.inmueble !== condoCod ? det.inmueble : null)
          || (det.cod_inmueble && det.cod_inmueble !== condoCod ? det.cod_inmueble : null)
          || (det.codigo_inmueble && det.codigo_inmueble !== condoCod ? det.codigo_inmueble : null)
          || pago.cod_inmueble;

        const lineasCondo = Array.isArray(det.condominio?.lineas) ? det.condominio.lineas : [];
        const tieneMultiplesLineas = lineasCondo.length > 1;
        const esModoCondo = (det.modo === 'CONDOMINIO') || (!det.modo && (det.isCondominio === true || det.es_condominio === true) && !unidadCod);

        const idPagoLimpio = (pago.identidad || '').replace(/-/g, '').trim().toUpperCase();
        const idCondoLimpio = (det.condominio?.identidad || '').replace(/-/g, '').trim().toUpperCase();

        const esPagoUnidadIndividual = det.modo === 'CONTRIBUYENTE' ||
          String(det.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
          (det.modo !== 'CONDOMINIO' && !tieneMultiplesLineas && !!unidadCod && unidadCod !== condoCod) || 
          (!!idCondoLimpio && !!idPagoLimpio && idPagoLimpio !== idCondoLimpio);

        if (esCondo && condoCod && !esPagoUnidadIndividual) {
          let { data: condoRecord } = await supabase
            .from('condominios')
            .select('*')
            .eq('codigo', condoCod)
            .maybeSingle();

          // Si no está en la tabla `condominios`, buscar en `inmuebles` donde se gestionan los condominios
          if (!condoRecord) {
            const { data: condoInm } = await supabase
              .from('inmuebles')
              .select('*')
              .eq('inmueble', condoCod)
              .maybeSingle();
            if (condoInm) {
              condoRecord = {
                nombre: condoInm.contribuyente,
                codigo: condoInm.inmueble,
                identidad: condoInm.identidad,
                direccion: condoInm.direccion,
                telefono: condoInm.telefono,
                correo: condoInm.correo_electronico,
                tipo: condoInm.tipo || 'Comercial',
                estado: condoInm.estado || 'Activo',
                cant_declarada: condoInm.cant_inmuebles || 1,
              };
            }
          }

          const { data: inmsCondo } = await supabase
            .from('inmuebles')
            .select('saldo_favor_bs')
            .or(`inmueble.eq.${condoCod},identidad.eq.${condoRecord?.identidad || pago.identidad}`);

          const saldoFavorTotal = (inmsCondo || []).reduce((acc: number, i: any) => acc + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);

          if (condoRecord) {
            setContribInfo({
              contribuyente: condoRecord.nombre,
              inmueble: condoRecord.codigo,
              cod_cont: condoRecord.codigo,
              identidad: condoRecord.identidad,
              direccion: condoRecord.direccion,
              telefono: condoRecord.telefono,
              correo_electronico: condoRecord.correo,
              actividad_principal: `Condominio ${condoRecord.tipo || 'Comercial'}`,
              estado: condoRecord.estado || 'Activo',
              _deudaTotal: 0,
              _saldoFavor: saldoFavorTotal,
              _totalInmuebles: condoRecord.cant_declarada || 1,
              _esCondominio: true,
            });
            if (condoRecord.correo) setCorreoResponsable(condoRecord.correo);
            if (condoRecord.telefono) setTelefonoResponsable(condoRecord.telefono);
            setLoadingContrib(false);
            return;
          }
        }

        const idLimpio = (pago.identidad || '').replace(/-/g, '').trim();
        const idConGuion = idLimpio.length > 1 ? idLimpio.charAt(0) + '-' + idLimpio.slice(1) : idLimpio;
        const detCod = unidadCod || (det.inmueble !== condoCod ? det.inmueble : null) || (det.cod_inmueble !== condoCod ? det.cod_inmueble : null) || (det.codigo_inmueble !== condoCod ? det.codigo_inmueble : null) || pago.cod_inmueble;

        let orFilter = `identidad.eq.${pago.identidad},identidad.eq.${idLimpio},identidad.eq.${idConGuion}`;
        if (detCod) orFilter += `,inmueble.eq.${detCod}`;

        const { data: inms } = await supabase
          .from('inmuebles')
          .select('*')
          .or(orFilter);

        // Buscar el inmueble que coincide con el cod_inmueble del pago si existe
        let inm = null;
        if (inms && inms.length > 0) {
          if (detCod) {
            inm = inms.find((i: any) => i.inmueble === detCod || i.cod_cont === detCod || i.cod_cont === detCod.replace(/-/g,'')) || inms[0];
          } else {
            inm = inms[0];
          }
        }

        if (inm) {
          // Calcular deuda total de todos sus inmuebles
          // Sumar las recibos pendientes
          let deudaTotal = 0;
          try {
            const { data: facs } = await supabase
              .from('facturas')
              .select('monto')
              .or(`identidad.eq.${pago.identidad},identidad.eq.${idLimpio}`)
              .in('estado', ['Pendiente', 'Por Verificar']);
            if (facs) {
              deudaTotal = facs.reduce((a, f) => a + (parseFloat(String(f.monto || '0').replace(/[^0-9.]/g,'')) || 0), 0);
            }
          } catch(e) {}
          const saldoFavor = (inms || []).reduce((acc: number, i: any) => {
            return acc + (parseFloat(i.saldo_favor_bs || '0') || 0);
          }, 0);
          setContribInfo({
            ...inm,
            _deudaTotal: deudaTotal,
            _saldoFavor: saldoFavor,
            _totalInmuebles: (inms || []).length,
            _todosInmuebles: inms || [],
          });
          if (!correoResponsable && (inm.correo_electronico || inm.correo)) {
            setCorreoResponsable(inm.correo_electronico || inm.correo);
          }
          if (!telefonoResponsable && inm.telefono) setTelefonoResponsable(inm.telefono);
        } else {
          // Fallback: buscar recibo por identidad para obtener nombre
          const { data: fac } = await supabase
            .from('facturas')
            .select('contribuyente, identidad')
            .eq('identidad', pago.identidad)
            .limit(1)
            .maybeSingle();
          if (fac) {
            setContribInfo({ contribuyente: fac.contribuyente, identidad: fac.identidad, _fallback: true });
          } else if (det.contribuyente || det.recibo_caja?.[0]?.razonSocial) {
            setContribInfo({
              contribuyente: det.contribuyente || det.recibo_caja?.[0]?.razonSocial,
              inmueble: detCod || pago.cod_inmueble,
              identidad: pago.identidad,
              _fallback: true
            });
          }
        }
      } catch(e) { console.error('[Conciliacion] Error cargando contribuyente:', e); }
      setLoadingContrib(false);
    })();
  }, [pago.id, pago.identidad, det.condominio?.codigo]);

  // Cargar recibos de los recibos seleccionados para recalculo con nueva tasa
  const recibosParaCalc: string[] = det.recibos || [];
  useEffect(() => {
    if (recibosParaCalc.length === 0) return;
    (async () => {
      const { data: facs } = await supabase.from('facturas')
        .select('referencia, monto, emision, mmv_mes, cant_inmuebles')
        .in('referencia', recibosParaCalc);
      setFacturasParaConciliar(facs || []);
    })();
  }, []);

  // Recalcular deuda cuando cambia la tasa
  const tasaNum = parseFloat(tasaCustom) || 0;
  const tasaCambio = tasaOriginal > 0 && tasaNum > 0 ? tasaNum / tasaOriginal : 1;
  const deudaRecalculada = facturasParaConciliar.length > 0 && tasaNum > 0 && tasaOriginal > 0
    ? facturasParaConciliar.reduce((sum, f) => {
        const montoOriginal = parseFloat(f.monto || '0');
        return sum + parseFloat((montoOriginal * tasaCambio).toFixed(2));
      }, 0)
    : 0;
  const hayRecalculo = tasaNum > 0 && tasaOriginal > 0 && Math.abs(tasaNum - tasaOriginal) > 0.01;

  // Auto-fill monto conciliado cuando cambia estatus
  const handleEstatusChange = (val: string) => {
    setEstatus(val);
    if (val === 'Aprobado') {
      // Auto-llenar con el monto reportado
      setMontoConciliado(montoReportadoNum.toFixed(2));
    } else if (val === 'Rechazado') {
      setMontoConciliado('0.00');
    }
    // 'Con Diferencia' → el usuario ingresa manualmente el monto de diferencia
  };

  const recibos: string[] = det.recibos || [];
  const periodos = det.periodos || (recibos.length > 0 ? recibos.join(' | ') : '---');
  // Vars usadas tanto en handleConciliar como en el render
  const montoConciliadoNum = parseLocalFloat(montoConciliado);

  const montoRetencionDoc = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || dRet || 0)) || 0;
  const tieneRetencion = Boolean(det.es_retencion || det.agente_retencion || det.es_agente_retencion || montoRetencionDoc > 0);

  // Total Documento (monto bruto de la deuda/factura seleccionada en Caja)
  const totalDocumentoCalc = (() => {
    if (det.monto_factura && Number(det.monto_factura) > 0) return Number(det.monto_factura);
    if (det.total_seleccionado && Number(det.total_seleccionado) > 0) return Number(det.total_seleccionado);
    if (tieneRetencion && montoRetencionDoc > 0) return Math.round((montoReportadoNum + montoRetencionDoc) * 100) / 100;
    return montoReportadoNum;
  })();

  // IVA Total de la operación
  const ivaTotalDoc = (() => {
    if (det.recibo_caja?.[0]?.iva !== undefined && Number(det.recibo_caja[0].iva) > 0) return Number(det.recibo_caja[0].iva);
    if (det.iva_total && Number(det.iva_total) > 0) return Number(det.iva_total);
    if (montoRetencionDoc > 0) return Math.round((montoRetencionDoc / 0.75) * 100) / 100;
    return 0;
  })();

  // Total a Pagar / Cobrado en Caja: exactamente igual a lo cobrado en Caja
  const totalAPagarCalc = (() => {
    if (det.es_abono) return montoReportadoNum;
    if (det.monto_neto_factura && Number(det.monto_neto_factura) > 0) return Number(det.monto_neto_factura);
    if (det.total_seleccionado && Number(det.total_seleccionado) > 0) {
      return Math.max(0, Math.round((Number(det.total_seleccionado) - montoRetencionDoc) * 100) / 100);
    }
    return montoReportadoNum;
  })();

  const deudaTotalContrib = (() => {
    const dContrib = contribInfo?._deudaTotal ? parseLocalFloat(contribInfo._deudaTotal) : 0;
    if (dContrib > 0) return dContrib;
    if (det.deuda_total_sistema) return parseLocalFloat(det.deuda_total_sistema);
    return totalAPagarCalc;
  })();

  const handleConciliar = async () => {
    setIsProcessing(true);
    try {
      const tasaParaGuardar = parseFloat(tasaCustom) || tasaOriginal;
            const cajeroStr = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || 'Administrador';
      const letraStr = (typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null);
      const current_analista = letraStr && cajeroStr !== 'Administrador' ? `${letraStr}-${cajeroStr}` : cajeroStr;

      const updatedDet = {
        analista: det.analista || current_analista,
        ...det,
        correo: correoResponsable,
        telefono: telefonoResponsable,
        fecha_transaccion: fechaTransaccion,
        fecha_banco: fechaBanco,
        monto_conciliado: montoConciliado,
        observaciones,
        enviar_correo: enviarCorreo,
        cod_inmueble: det.cod_inmueble || pago.cod_inmueble || contribInfo?.codigo,
        cajero: cajeroOperador.trim() || det.cajero || undefined,
        caja: cajeroOperador.trim() || det.caja || undefined,
        banco_destino: bancoReceptor,
        tasa_bcv: tasaParaGuardar,
        tasa_bcv_conciliacion: tasaParaGuardar,
        tasa_bcv_original: tasaOriginal || undefined,
      };

      if (estatus === 'Rechazado') {
        // Rechazado: eliminar cualquier preparación o cola de factura digital
        delete (updatedDet as any).factura_digital;
        (updatedDet as any).factura_digital = {
          emitida: false,
          pendiente: false,
          rechazada: true,
          rechazada_at: new Date().toISOString()
        };
        // Limpiar saldo a favor en el detalle del pago rechazado
        (updatedDet as any).saldo_favor = 0;
        (updatedDet as any).saldo_favor_bs = 0;
        (updatedDet as any).monto_saldo_favor = 0;
        (updatedDet as any).saldo_favor_acreditado = false;
        (updatedDet as any).referencia_original = pago.referencia;
      }

      // Si la tasa cambió, actualizar montos de las recibos seleccionadas
      if (estatus === 'Aprobado' && hayRecalculo && facturasParaConciliar.length > 0) {
        const tasaCambioFinal = tasaParaGuardar / (tasaOriginal || tasaParaGuardar);
        for (const fac of facturasParaConciliar) {
          const montoOriginal = parseFloat(fac.monto || '0');
          const nuevoMonto = parseFloat((montoOriginal * tasaCambioFinal).toFixed(2));
          await supabase.from('facturas').update({ monto: nuevoMonto }).eq('referencia', fac.referencia);
        }
      }

      // Snapshot de deuda previa al aprobar para poder restaurar si el operador se equivoca y luego rechaza
      if (estatus === 'Aprobado' && (!updatedDet.deuda_previa || (Array.isArray(updatedDet.deuda_previa) && updatedDet.deuda_previa.length === 0))) {
        try {
          const propCodesSnap = new Set<string>();
          recibos.forEach((r: string) => {
            const m = r.match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+)/i);
            if (m && m[1]) propCodesSnap.add(m[1].toUpperCase());
            const mDir = r.match(/(URB\d+|AURI\d+)/i);
            if (mDir && mDir[1]) propCodesSnap.add(mDir[1].toUpperCase());
          });
          const idVarsSnap = getIdentidadVariantsExact(pago.identidad);
          const orConditionsSnap = [
            ...idVarsSnap.map(v => `identidad.eq.${v}`),
            ...Array.from(propCodesSnap).map(c => `inmueble.eq.${c}`)
          ];
          const { data: inmsFoto } = await supabase.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs').or(orConditionsSnap.join(','));
          if (inmsFoto && inmsFoto.length > 0) {
            updatedDet.deuda_previa = inmsFoto;
          }
        } catch(e) {}
      }

      const refFinal = (referenciaOrigen || '').trim() || pago.referencia;
      if (refFinal) {
        updatedDet.referencia = refFinal;
        updatedDet.referencia_origen = refFinal;
        if (pago.referencia && pago.referencia !== refFinal && !updatedDet.referencia_original) {
          updatedDet.referencia_original = pago.referencia;
        }
      }
      if (bancoReceptor) {
        updatedDet.banco_destino = bancoReceptor;
        updatedDet.banco_receptor = bancoReceptor;
      }
      if (fechaTransaccion) {
        updatedDet.fecha_transaccion = fechaTransaccion;
      }
      if (fechaBanco) {
        updatedDet.fecha_banco = fechaBanco;
      }

      // Si el pago ya estaba aprobado y se confirma en Aprobado, es una edición de datos / corrección de referencia
      if (pago.estado === 'Aprobado' && estatus === 'Aprobado') {
        const payloadEdicion: any = {
          banco: bancoEmisor,
          referencia: refFinal,
          ...(montoConciliadoNum > 0 ? { monto: montoConciliadoNum } : {}),
          detalles: updatedDet
        };
        await actualizarPago(pago.id, payloadEdicion);
        alert('¡Datos y referencia del pago actualizados exitosamente!');
        onClose();
        return;
      }

      updatedDet.fecha_conciliado = new Date().toISOString();
      const payloadAct: any = {
        estado: estatus,
        banco: bancoEmisor,
        tipo: pago.tipo,
        referencia: refFinal,
        ...(montoConciliadoNum > 0 ? { monto: montoConciliadoNum } : {}),
        detalles: updatedDet
      };
      if (estatus === 'Rechazado' && pago.referencia && !pago.referencia.startsWith('RECH-')) {
        payloadAct.referencia = `RECH-${pago.referencia}-${pago.id.slice(0, 6)}`;
      }
      await actualizarPago(pago.id, payloadAct, { soloSiEstado: pago.estado || 'Por Verificar' });

      // Si conciliarTodoElGrupo está activo y hay pagos vinculados, actualizar también los demás pagos del grupo
      if (conciliarTodoElGrupo && pagosVinculados.length > 1) {
        const otrosPagos = pagosVinculados.filter((p: any) => p.id !== pago.id && p.estado !== estatus);
        for (const op of otrosPagos) {
          const opDet = parseDetalles(op.detalles);
          const opUpdatedDet = {
            ...opDet,
            analista: updatedDet.analista,
            fecha_conciliado: new Date().toISOString(),
            observaciones: observaciones ? `${opDet.observaciones || ''} [Conciliado en grupo con ${pago.referencia || pago.id}] ${observaciones}`.trim() : opDet.observaciones,
            tasa_bcv: tasaParaGuardar,
            tasa_bcv_conciliacion: tasaParaGuardar,
          };
          if (estatus === 'Rechazado') {
            delete (opUpdatedDet as any).factura_digital;
            (opUpdatedDet as any).factura_digital = { emitida: false, pendiente: false, rechazada: true, rechazada_at: new Date().toISOString() };
          }
          const opPayload: any = {
            estado: estatus,
            detalles: opUpdatedDet
          };
          if (estatus === 'Rechazado' && op.referencia && !op.referencia.startsWith('RECH-')) {
            opPayload.referencia = `RECH-${op.referencia}-${op.id.slice(0, 6)}`;
          }
          await actualizarPago(op.id, opPayload);
        }
      }

      // Auditoría: Registro de conciliación de pago
      await logAudit(
        `Pago ${estatus} en Conciliación Bancaria`,
        {
          pago_id: pago.id,
          estatus,
          identidad: pago.identidad,
          contribuyente: contribInfo?.nombre || pago.contribuyente,
          monto_conciliado: montoConciliado,
          referencia_bancaria: pago.referencia,
          banco_emisor: bancoEmisor,
          banco_receptor: bancoReceptor,
          recibos_afectados: recibos,
          tasa_aplicada: tasaParaGuardar,
          observaciones
        },
        'CONCILIACION',
        estatus === 'Aprobado' ? 'ALTA' : 'CRITICA'
      );

      // Aprobado: marcar recibos como Pagado o aplicar abono proporcional
      // Rechazado: devolver los recibos a Pendiente para que puedan pagarse en Caja
      if (estatus === 'Rechazado') {
        if (recibos.length > 0) {
          await supabase.from('facturas').update({ estado: 'Pendiente' }).in('referencia', recibos);
          if (det.cuotas && det.cuotas.length > 0) {
             await supabase.from('convenios_cuotas').update({ estado: 'Pendiente' }).in('id', det.cuotas.map((c: any) => typeof c === 'object' ? c.id : c));
          }
          if (det.servicios && det.servicios.length > 0) {
             await supabase.from('servicios_especiales').update({ estado: 'Pendiente' }).in('referencia', det.servicios.map((s: any) => typeof s === 'string' ? s : s.referencia));
          }
        }

        // Rechazar o anular comprobante de retención de IVA vinculado al pago rechazado
        await supabase.from('pagos_reportados').update({ estado: 'Rechazado' }).filter('detalles->>pago_vinculado', 'eq', pago.id);

        // Restaurar estado de deuda si el pago se rechaza
        // PREFERENCIA 1: Si Caja o Condominios guardó la foto exacta de deuda_previa al registrar el pago, restaurar exactamente esa foto
        let prevLista: any[] = Array.isArray(det.deuda_previa) && det.deuda_previa.length > 0 ? det.deuda_previa : [];
        const esCondoPago = det.es_condominio || det.isCondominio || det.modulo === 'condominios' || (pago as any).modulo === 'condominios';

        // Si no tiene deuda_previa en detalles pero es de condominios, intentar recuperarla de auditoría
        if (prevLista.length === 0 && esCondoPago) {
          try {
            const codCondo = det.condominio?.codigo || pago.identidad;
            const { data: auditRec } = await supabase
              .from('auditoria')
              .select('detalles')
              .filter('detalles->>codigo', 'eq', codCondo)
              .order('created_at', { ascending: false })
              .limit(5);
            const foundAudit = (auditRec || []).find((a: any) => Array.isArray(a.detalles?.deuda_previa) && a.detalles?.deuda_previa.length > 0);
            if (foundAudit) prevLista = foundAudit.detalles.deuda_previa;
          } catch (e) {
            console.warn('No se pudo recuperar deuda_previa de auditoría para condominio:', e);
          }
        }

        if (prevLista.length > 0) {
          for (const prev of prevLista) {
            // Restaurar unidad de condominio
            if (prev.unidad) {
              await supabase.from('condominio_unidades').update({
                aseo_pendiente_desde: prev.aseo_pendiente_desde,
                multa_meses: prev.multa_meses || 0,
                multa_exonerada_hasta: prev.multa_exonerada_hasta || null,
              }).eq('id', prev.unidad);
            }
            // Restaurar condominio padre
            if (prev.condominio) {
              await supabase.from('condominios').update({
                aseo_pendiente_desde: prev.aseo_pendiente_desde,
                multa_meses: prev.multa_meses || 0,
              }).eq('id', prev.condominio);
            }
            // Restaurar inmueble
            if (prev.id || prev.inmueble) {
              const q = supabase.from('inmuebles').update({
                meses_deuda: Math.max(0, parseInt(String(prev.meses_deuda || (prev.aseo_pendiente_desde ? 1 : 0)))),
                deuda_mmv: parseFloat(String(prev.deuda_mmv || 0)),
                multa_bs: parseFloat(String(prev.multa_bs || 0)),
                deuda_congelada_bs: parseFloat(String(prev.deuda_congelada_bs || 0)),
                saldo_favor_bs: parseFloat(String(prev.saldo_favor_bs || 0)),
              });
              if (prev.id) await q.eq('id', prev.id);
              else await q.eq('inmueble', prev.inmueble);
            }
          }
        } else {
          // Fallback: solo restaurar meses si el pago estuvo previamente Aprobado o si vino de Caja con deuda descontada
          const pagoEstabaAprobado = pago.estado === 'Aprobado' || pago.estado === 'Con Diferencia' || det.fecha_conciliado || det.recibo_caja;
          if (pagoEstabaAprobado) {
            const propCodesRech = new Set<string>();
            recibos.forEach((r: string) => {
              const m = r.match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+)/i);
              if (m && m[1]) propCodesRech.add(m[1].toUpperCase());
              const mDir = r.match(/(URB\d+|AURI\d+)/i);
              if (mDir && mDir[1]) propCodesRech.add(mDir[1].toUpperCase());
            });
            if (det.cod_inmueble) propCodesRech.add(String(det.cod_inmueble).toUpperCase());
            if (det.inmueble) propCodesRech.add(String(det.inmueble).toUpperCase());
            if (pago.cod_inmueble) propCodesRech.add(String(pago.cod_inmueble).toUpperCase());

            const idVarsRech = getIdentidadVariantsExact(pago.identidad);
            const orCondsRech = [
              ...idVarsRech.map(v => `identidad.eq.${v}`),
              ...Array.from(propCodesRech).map(c => `inmueble.eq.${c}`)
            ];

            const { data: inmListRech } = await supabase.from('inmuebles').select('*').or(orCondsRech.join(','));
            if (inmListRech && inmListRech.length > 0) {
              for (const inm of inmListRech) {
                const mesesThisInm = recibos.filter((r: string) => r.toUpperCase().includes(String(inm.inmueble || '').toUpperCase())).length || 1;
                const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
                const nuevoMeses = numMesesInm + mesesThisInm;
                const mmv = parseFloat(String(inm.mmv_mes || 0)) || (parseFloat(String(inm.deuda_mmv || 0)) / (numMesesInm || 1)) || 0;
                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: parseFloat((mmv * nuevoMeses).toFixed(6)),
                }).eq('id', inm.id);
              }
            }
          }
        }

        // Limpiar movimientos de condominio vinculados al pago rechazado
        if (esCondoPago) {
          const idsCondo = [pago.id, det.pago_principal_id, det.pago_vinculado].filter(Boolean);
          if (idsCondo.length > 0) {
            await supabase.from('condominio_movimientos').delete().in('pago_id', idsCondo);
          }
        }

        // Revertir saldo a favor si el pago tenía o había generado saldo a favor
        const excedenteCaja = parseFloat(String(det.saldo_favor || det.saldo_favor_bs || det.monto_saldo_favor || 0)) || 0;
        const diferenciaMonto = pago.estado === 'Con Diferencia' ? (parseFloat(String(det.monto_conciliado || pago.monto || 0)) || 0) : 0;
        const saldoRevertir = excedenteCaja > 0 ? excedenteCaja : diferenciaMonto;

        if (saldoRevertir > 0 || det.saldo_favor_acreditado || pago.estado === 'Con Diferencia' || pago.estado === 'Aprobado') {
          const montoFinal = saldoRevertir > 0 ? saldoRevertir : (parseFloat(String(pago.monto || 0)) || 0);
          if (montoFinal > 0.009) {
            await descontarSaldoFavor(pago.identidad, montoFinal, det.codigo_condominio || det.condominio?.codigo);
          }
          // Anular o eliminar Notas de Crédito emitidas en documentos para este pago
          try {
            const ident = String(pago.identidad || '').trim().toUpperCase();
            const refsToCheck = new Set<string>();
            if (pago.id) refsToCheck.add(String(pago.id));
            if (pago.referencia) refsToCheck.add(String(pago.referencia).trim());
            if (det.referencia) refsToCheck.add(String(det.referencia).trim());
            if (det.referencia_original) refsToCheck.add(String(det.referencia_original).trim());
            if (Array.isArray(det.formasPago)) {
              det.formasPago.forEach((fp: any) => fp?.referencia && refsToCheck.add(String(fp.referencia).trim()));
            }
            if (Array.isArray(det.pagos_agregados)) {
              det.pagos_agregados.forEach((pa: any) => pa?.referencia && refsToCheck.add(String(pa.referencia).trim()));
            }

            if (ident) {
              const { data: docsNC } = await supabase
                .from('documentos')
                .select('*')
                .eq('tipo', 'Nota de Credito')
                .eq('identidad', ident);

              const matchingDocs = (docsNC || []).filter((d: any) => {
                const raw = typeof d.detalles === 'string' ? d.detalles : JSON.stringify(d.detalles || {});
                return [...refsToCheck].some(r => r.length >= 4 && raw.includes(r));
              });

              if (matchingDocs.length > 0) {
                await supabase.from('documentos').delete().in('id', matchingDocs.map((d: any) => d.id));
              }
            }
          } catch (e) {
            console.error('Error anulando nota de credito por rechazo:', e);
          }
        }
      }

      // Servicios especiales / extraordinarios incluidos en el pago: al aprobar quedan Pagados o con abono
      const allSrvRefs = [
        ...(det.servicios || []).map((s: any) => typeof s === 'string' ? s : s.referencia),
        ...(det.tala_poda || []).map((s: any) => typeof s === 'string' ? s : s.referencia)
      ].filter(Boolean);

      if (estatus === 'Aprobado' && allSrvRefs.length > 0) {
        const { data: srvRows } = await supabase.from('servicios_especiales').select('*').in('referencia', allSrvRefs);
        const srvTotalMonto = (srvRows || []).reduce((acc: number, s: any) => acc + (parseFloat(s.monto) || 0), 0);
        const esAbonoSrv = !!det.es_abono || (montoConciliadoNum > 0 && srvTotalMonto > 0 && montoConciliadoNum < srvTotalMonto - 1.00);

        if (esAbonoSrv && montoConciliadoNum > 0) {
          let dineroDisponibleSrv = montoConciliadoNum;
          for (const srv of (srvRows || [])) {
            const mSrv = parseFloat(srv.monto || '0');
            if (dineroDisponibleSrv >= mSrv - 1.00) {
              dineroDisponibleSrv = Math.max(0, dineroDisponibleSrv - mSrv);
              await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).eq('referencia', srv.referencia);
            } else if (dineroDisponibleSrv > 1.00) {
              const montoRestante = parseFloat((mSrv - dineroDisponibleSrv).toFixed(2));
              const fechaVE = new Intl.DateTimeFormat('es-VE', { dateStyle: 'short' }).format(new Date());
              const notaAbono = `${srv.notas || ''} [ABONO: Bs. ${dineroDisponibleSrv.toFixed(2)} conciliado el ${fechaVE}. Restante: Bs. ${montoRestante}]`;
              await supabase.from('servicios_especiales').update({ monto: montoRestante, estado: 'Pendiente', notas: notaAbono }).eq('referencia', srv.referencia);
              dineroDisponibleSrv = 0;
            }
          }
        } else {
          await fetch('/api/admin/servicios-especiales', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referencias: allSrvRefs, estado: 'Pagado' }) });
        }
      }

      if (estatus === 'Aprobado' && recibos.length > 0) {
        const { data: facs } = await supabase.from('facturas').select('*').in('referencia', recibos);
        if (facs && facs.length > 0) {
          // Calcular deuda total de los recibos seleccionados
          const deudaTotal = facs.reduce((s, f) => s + parseFloat(f.monto || '0'), 0);
          const esAbonoParcial = det.es_abono || (montoConciliadoNum > 0 && montoConciliadoNum < deudaTotal - 1.00);

          if (esAbonoParcial && montoConciliadoNum > 0) {
            // Distribuir el monto entre recibos (mas antiguas primero)
            facs.sort((a, b) => new Date(a.emision || a.created_at || 0).getTime() - new Date(b.emision || b.created_at || 0).getTime());
            let dineroDisponible = montoConciliadoNum;

            for (const fac of facs) {
              const montoFac = parseFloat(fac.monto || '0');
              if (dineroDisponible >= montoFac - 1.00) {
                // Cubre la recibo completa
                dineroDisponible = Math.max(0, dineroDisponible - montoFac);
                await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', fac.referencia);
              } else if (dineroDisponible > 1.00) {
                // Abono parcial: actualizar monto restante
                const montoRestante = parseFloat((montoFac - dineroDisponible).toFixed(2));
                await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', fac.referencia);
                dineroDisponible = 0;
              } else {
                // Sin dinero: dejar pendiente
                await supabase.from('facturas').update({ estado: 'Pendiente' }).eq('referencia', fac.referencia);
              }
            }

            // Si sobro saldo despues de pagar todo, registrar como saldo a favor (nota de crédito)
            if (dineroDisponible > 0.01) {
              const rSF = await acreditarSaldoFavor(pago.identidad, Math.round(dineroDisponible * 100) / 100);
              if (!rSF.ok) throw new Error('No se pudo guardar la nota de crédito: ' + rSF.error);
            }
          } else {
            // Pago completo: marcar todas como Pagado
            await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', recibos);
          }
        }
        
        // ── LIMPIAR O REDUCIR DEUDA DEL INMUEBLE (RECIB-HIST-*, dummy-hist-*, MULTA-*, RECIB-DEUDA o Facturas) ──
        const histRefsConcil = recibos.filter((r: string) => r.startsWith('RECIB-HIST-') || r.startsWith('dummy-hist-'));
        const multaRefsConcil = recibos.filter((r: string) => r.startsWith('MULTA-') || r.startsWith('multa-'));
        const retencionIvaPago = parseFloat(String(det.monto_retencion_iva || det.retencion_monto || det.retencion || 0)) || 0;
        const saldoUsadoPago = parseFloat(String(det.saldo_usado || det.descuentoSaldoFavor || 0)) || 0;
        const dineroTotalCubierto = montoConciliadoNum + retencionIvaPago + saldoUsadoPago;
        const esAbonoParcialConcil = !!det.es_abono || (montoConciliadoNum > 0 && det.total_seleccionado && dineroTotalCubierto < parseFloat(det.total_seleccionado) - 1.00);

        // Recolectar códigos de inmuebles de referencias, detalles y del propio pago
        const propertyCodesFromRefs = new Set<string>();
        recibos.forEach((r: string) => {
          const mHist = r.match(/(?:RECIB-HIST|dummy-hist)-([A-Z0-9_-]+?)(?:-M?\d+)?$/i);
          if (mHist && mHist[1]) propertyCodesFromRefs.add(mHist[1].toUpperCase());
          const mMulta = r.match(/MULTA-([A-Z0-9_-]+?)(?:-M?\d+)?$/i);
          if (mMulta && mMulta[1]) propertyCodesFromRefs.add(mMulta[1].toUpperCase());
        });
        if (det.cod_inmueble) propertyCodesFromRefs.add(String(det.cod_inmueble).toUpperCase());
        if (det.inmueble) propertyCodesFromRefs.add(String(det.inmueble).toUpperCase());
        if (pago.cod_inmueble) propertyCodesFromRefs.add(String(pago.cod_inmueble).toUpperCase());
        if (Array.isArray(det.inmuebles)) {
          det.inmuebles.forEach((ic: any) => {
            if (typeof ic === 'string') propertyCodesFromRefs.add(ic.toUpperCase());
            else if (ic?.inmueble) propertyCodesFromRefs.add(String(ic.inmueble).toUpperCase());
          });
        }
        if (facs && facs.length > 0) {
          facs.forEach((f: any) => {
            if (f.inmueble) propertyCodesFromRefs.add(String(f.inmueble).toUpperCase());
          });
        }

        const idVariants = getIdentidadVariantsExact(pago.identidad);
        const orFilterInms = [
          ...idVariants.map(v => `identidad.eq.${v}`),
          ...Array.from(propertyCodesFromRefs).map(c => `inmueble.eq.${c}`)
        ];

        if (recibos.includes('RECIB-DEUDA') || histRefsConcil.length > 0 || multaRefsConcil.length > 0 || (facs && facs.length > 0)) {
          const { data: inmList2 } = await supabase
            .from('inmuebles')
            .select('*')
            .or(orFilterInms.join(','));

          if (inmList2 && inmList2.length > 0) {
            let dineroConcil = montoConciliadoNum;
            
            const inmsToProcess = inmList2.filter(inm => {
              const inmCod = String(inm.inmueble || inm.codigo || '').toUpperCase();
              const histRefsThisInm = histRefsConcil.filter((r: string) => r.toUpperCase().includes(`-${inmCod}-`));
              const multaRefsThisInm = multaRefsConcil.filter((r: string) => r.toUpperCase().includes(`MULTA-${inmCod}`));
              const facsThisInm = (facs || []).filter((f: any) => (f.inmueble && String(f.inmueble).toUpperCase() === inmCod));
              return histRefsThisInm.length > 0 || multaRefsThisInm.length > 0 || facsThisInm.length > 0 || recibos.includes('RECIB-DEUDA') || propertyCodesFromRefs.has(inmCod);
            });

            const listFinal = inmsToProcess.length > 0 ? inmsToProcess : inmList2;

            for (let idx = 0; idx < listFinal.length; idx++) {
              const inm = listFinal[idx];
              const isLastInm = idx === listFinal.length - 1;
              const inmCod = String(inm.inmueble || inm.codigo || '').toUpperCase();

              const histRefsThisInm = histRefsConcil.filter((r: string) => r.toUpperCase().includes(`-${inmCod}-`));
              const multaRefsThisInm = multaRefsConcil.filter((r: string) => r.toUpperCase().includes(`MULTA-${inmCod}`));
              const facsThisInm = (facs || []).filter((f: any) => (f.inmueble && String(f.inmueble).toUpperCase() === inmCod));
              const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0))) || (parseFloat(String(inm.deuda_mmv || 0)) > 0 ? 1 : 0);

              // Multas específicas liquidadas
              if (multaRefsThisInm.length > 0 && !esAbonoParcialConcil) {
                await supabase.from('inmuebles').update({ multa_bs: 0, deuda_congelada_bs: 0 }).eq('id', inm.id);
              }

              if (recibos.includes('RECIB-DEUDA') && !esAbonoParcialConcil) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', inm.id);
              } else if (!esAbonoParcialConcil && (histRefsThisInm.length > 0 || facsThisInm.length > 0)) {
                const mesesPagados = histRefsThisInm.length > 0 ? histRefsThisInm.length : facsThisInm.length;
                const nuevoMeses = Math.max(0, numMesesInm - mesesPagados);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
              } else if (esAbonoParcialConcil && numMesesInm > 0 && dineroConcil > 0) {
                const bMes = calcularMensualidad(inm, tasaParaGuardar || 981.18);
                const esRes = isResidencialInm(inm);
                const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
                // Agente de retención: el contribuyente paga el IVA menos el 75% retenido (igual que Caja)
                const retMes = !esRes && inm.agente_retencion === true ? Math.round((ivaMes * 0.75) * 100) / 100 : 0;
                const tasaMora = esRes ? 0.10 : 0.12;
                
                const sAct = parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
                let dineroLocal = dineroConcil + sAct;

                let cubiertos = 0;
                const maxM = histRefsThisInm.length > 0 ? histRefsThisInm.length : numMesesInm;
                
                for (let m = 1; m <= maxM; m++) {
                  const isUltimo = (m >= numMesesInm);
                  const multaMes = isUltimo ? 0 : Math.round((bMes * tasaMora) * 100) / 100;
                  const costoMes = Math.round((bMes + ivaMes - retMes) * 100) / 100 + multaMes;
                  if (dineroLocal >= costoMes - 0.05) {
                    dineroLocal = Math.max(0, dineroLocal - costoMes);
                    cubiertos++;
                  } else {
                    break;
                  }
                }
                
                const nuevoMeses = Math.max(0, numMesesInm - cubiertos);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                
                let nuevoSaldo = 0;
                if (dineroLocal > dineroConcil) {
                  nuevoSaldo = dineroLocal - dineroConcil;
                } else {
                  dineroConcil = dineroLocal;
                  nuevoSaldo = 0;
                }

                if (isLastInm && dineroConcil > 0.01) {
                  nuevoSaldo += dineroConcil;
                  dineroConcil = 0;
                }

                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  saldo_favor_bs: parseFloat(nuevoSaldo.toFixed(2)),
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
                if (nuevoSaldo - sAct > 0.01) {
                  await supabase.from('documentos').insert([{
                    identidad: pago.identidad,
                    contribuyente: contribInfo?.contribuyente || contribInfo?.Contribuyente || pago.contribuyente || '',
                    tipo: 'Nota de Credito',
                    estado: 'Vigente',
                    detalles: JSON.stringify({
                      monto: (nuevoSaldo - sAct).toFixed(2),
                      origen_referencia: `Excedente conciliado. Referencia: ${pago.referencia || pago.id}`,
                      fecha_emision: new Date().toISOString(),
                      analista: updatedDet.analista,
                    })
                  }]);
                }
              }
            }

            // Sincronizar contenedores padre N/A (ej: URB007364, URB033658) y sus hijos
            const parentCodesToSync = new Set<string>();
            inmList2.forEach((i: any) => {
              if (i.condominio_padre_id) parentCodesToSync.add(i.condominio_padre_id);
              if (i.padre_id) parentCodesToSync.add(i.padre_id);
              if ((i.actividad_principal || '').trim().toUpperCase() === 'N/A' && i.inmueble) {
                parentCodesToSync.add(i.inmueble);
              }
            });

            for (const pCode of Array.from(parentCodesToSync)) {
              const { data: parentInm } = await supabase.from('inmuebles').select('id, inmueble, meses_deuda').eq('inmueble', pCode).maybeSingle();
              if (parentInm) {
                const parentMonths = parseInt(String(parentInm.meses_deuda || 0));
                // Si el padre N/A quedó en 0 meses de deuda, todos sus hijos unificados quedan automáticamente en 0
                if (parentMonths === 0 || recibos.includes('RECIB-DEUDA')) {
                  await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 })
                    .or(`condominio_padre_id.eq.${pCode},padre_id.eq.${pCode}`);
                  await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 })
                    .eq('id', parentInm.id);
                } else {
                  // Si el padre tiene deuda, verificar el estado de los hijos
                  const { data: currentChildren } = await supabase
                    .from('inmuebles')
                    .select('meses_deuda, deuda_mmv')
                    .or(`condominio_padre_id.eq.${pCode},padre_id.eq.${pCode}`)
                    .neq('estado', 'Eliminado');
                  const maxChildMonths = Math.max(0, ...(currentChildren || []).map((c: any) => parseInt(String(c.meses_deuda || 0))));
                  const sumDeudaMmv = Math.round((currentChildren || []).reduce((s: number, c: any) => s + parseFloat(String(c.deuda_mmv || 0)), 0) * 10000) / 10000;
                  if (maxChildMonths === 0) {
                    await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', parentInm.id);
                  } else {
                    await supabase.from('inmuebles').update({ meses_deuda: maxChildMonths, deuda_mmv: sumDeudaMmv }).eq('id', parentInm.id);
                  }
                }
              }
            }

            // Si el contribuyente ya no tiene meses pendientes en ningún inmueble, marcar cualquier factura pendiente como Pagado
            if (recibos.some((r: string) => r.startsWith('RECIB-HIST-') || r.startsWith('dummy-hist-') || r === 'RECIB-DEUDA')) {
              const { data: allUserInms } = await supabase
                .from('inmuebles')
                .select('meses_deuda, deuda_mmv')
                .or(idVariants.map(v => `identidad.eq.${v}`).join(','))
                .neq('estado', 'Eliminado');
              const hasRemainingDebt = (allUserInms || []).some((i: any) => parseInt(String(i.meses_deuda || 0)) > 0 || parseFloat(String(i.deuda_mmv || 0)) > 0.01);
              if (!hasRemainingDebt) {
                await supabase.from('facturas')
                  .update({ estado: 'Pagado', fecha_pago: new Date().toISOString().split('T')[0] })
                  .or(idVariants.map(v => `identidad.eq.${v}`).join(','))
                  .in('estado', ['Pendiente', 'Por Verificar']);
              }
            }
          }
        }

        // ── SINCRONIZAR DEUDA PARA PAGOS DE CONDOMINIO ──
        if (det.modulo === 'condominios' || (pago as any).modulo === 'condominios') {
          const condoData = det.condominio || {};
          const lineasCondo: any[] = Array.isArray(condoData.lineas) ? condoData.lineas : [];
          for (const lc of lineasCondo) {
            if (lc.inmueble) {
              await supabase.from('inmuebles').update({
                meses_deuda: 0,
                deuda_mmv: 0,
                deuda_congelada_bs: 0,
                multa_bs: 0
              }).ilike('inmueble', lc.inmueble);
              await supabase.from('condominio_unidades').update({
                aseo_pendiente_desde: null,
                multa_meses: 0
              }).ilike('inmueble', lc.inmueble);
            }
          }
        }

        // Excedente de una transacción (transferido por encima de la deuda liquidada):
        // Se calcula comparando el monto conciliado real con la deuda liquidada
        const excedenteCalculado = (montoConciliadoNum > totalAPagarCalc + 0.05)
          ? Math.round((montoConciliadoNum - totalAPagarCalc) * 100) / 100
          : 0;
        const excedenteCaja = Math.max(
          parseFloat(String(det.saldo_favor || det.saldo_a_favor_nuevo || det.monto_sobrante || 0)) || 0,
          excedenteCalculado
        );
        if (excedenteCaja > 0.01 && !det.saldo_favor_acreditado) {
          updatedDet.saldo_favor = excedenteCaja;
          updatedDet.saldo_a_favor_nuevo = excedenteCaja;
          updatedDet.monto_sobrante = excedenteCaja;
          const condoCod = (updatedDet.modulo === 'condominios' || det.modulo === 'condominios')
            ? (det.condominio?.codigo || det.codigo_condominio || updatedDet?.condominio?.codigo)
            : undefined;
          const rSF = await acreditarSaldoFavor(pago.identidad, Math.round(excedenteCaja * 100) / 100, condoCod);
          if (!rSF.ok) throw new Error('No se pudo acreditar la nota de crédito: ' + rSF.error);
          try {
            const refClean = String(pago.referencia || '').trim();
            const { data: existingDocs } = await supabase
              .from('documentos')
              .select('id, detalles')
              .eq('identidad', pago.identidad)
              .ilike('tipo', '%nota%')
              .ilike('estado', 'vigente');

            const yaExiste = (existingDocs || []).find((d: any) => {
              const detStr = typeof d.detalles === 'string' ? d.detalles : JSON.stringify(d.detalles || {});
              return refClean && detStr.includes(refClean);
            });

            if (yaExiste) {
              await supabase.from('documentos').update({
                detalles: JSON.stringify({
                  monto: (Math.round(excedenteCaja * 100) / 100).toFixed(2),
                  origen_referencia: `Excedente conciliado. Ref: ${pago.referencia}`,
                  fecha_emision: new Date().toISOString(),
                  analista: updatedDet.analista || 'Administrador'
                })
              }).eq('id', yaExiste.id);
            } else {
              const esPagoUnidadNC = 
                updatedDet.modo === 'CONTRIBUYENTE' || 
                det.modo === 'CONTRIBUYENTE' ||
                String(updatedDet.condominio?.modalidad || det.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
                (det.condominio?.lineas?.length === 1 && det.condominio?.lineas?.[0]?.inmueble && det.condominio?.lineas?.[0]?.inmueble !== (det.condominio?.codigo || det.codigo_condominio));
              await supabase.from('documentos').insert([{
                identidad: pago.identidad,
                contribuyente: ((updatedDet.modulo === 'condominios' || det.modulo === 'condominios') && !esPagoUnidadNC)
                  ? (det.condominio?.nombre || det.contribuyente || pago.identidad)
                  : (contribInfo?.contribuyente || contribInfo?.nombre || det.contribuyente || pago.contribuyente || pago.identidad),
                tipo: 'Nota de Credito',
                estado: 'Vigente',
                detalles: JSON.stringify({
                  monto: (Math.round(excedenteCaja * 100) / 100).toFixed(2),
                  origen_referencia: `Excedente conciliado. Ref: ${pago.referencia}`,
                  fecha_emision: new Date().toISOString(),
                  analista: updatedDet.analista || 'Administrador'
                }),
              }]);
            }
          } catch(e) { console.error('Error insertando nota de credito en documentos:', e); }
          updatedDet.saldo_favor_acreditado = true;
          await actualizarPago(pago.id, { detalles: { ...updatedDet, saldo_favor_acreditado: true } });
        }
        
        // ── FACTURACIÓN DIGITAL THE FACTORY HKA (EN COLA PARA REVISIÓN / EMISIÓN MANUAL) ──
        try {
          const { data: curPago } = await supabase.from('pagos_reportados').select('detalles').eq('id', pago.id).single();
          let curDet = curPago?.detalles || {};
          if (typeof curDet === 'string') {
            try { curDet = JSON.parse(curDet); } catch(e) { curDet = {}; }
          }
          curDet.factura_digital = curDet.factura_digital || {
            emitida: false,
            pendiente: true,
            preparada_at: new Date().toISOString()
          };
          curDet.recibos = recibos;
          // Pagos de la Caja de Condominios o con saldo a favor: NO alterar montos originales de la factura
          const esCondo = curDet.modulo === 'condominios' || det.modulo === 'condominios';
          const esPagoUnidadFac = 
            curDet.modo === 'CONTRIBUYENTE' || 
            det.modo === 'CONTRIBUYENTE' ||
            String(curDet.condominio?.modalidad || det.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
            (curDet.condominio?.lineas?.length === 1 && curDet.condominio?.lineas?.[0]?.inmueble && curDet.condominio?.lineas?.[0]?.inmueble !== (curDet.condominio?.codigo || det.condominio?.codigo));

          if (!esCondo && excedenteCaja <= 0.01) {
            curDet.montos = { total: montoConciliadoNum };
            curDet.montoTotal = montoConciliadoNum;
          }
          if (esCondo && !esPagoUnidadFac) {
            curDet.contribuyente = curDet.condominio?.nombre || det.condominio?.nombre || curDet.contribuyente || det.contribuyente || pago.identidad;
          } else {
            curDet.contribuyente = curDet.contribuyente || det.contribuyente || det.recibo_caja?.[0]?.razonSocial || contribInfo?.contribuyente || contribInfo?.Contribuyente || contribInfo?.nombre || pago.contribuyente || pago.identidad;
          }
          curDet.identidad = pago.identidad;
          const fechaFacturaFinal = fechaBanco || fechaTransaccion;
          if (!esCondo || !Array.isArray(curDet.formasPago) || curDet.formasPago.length === 0) {
            curDet.formasPago = [{
              descripcion: pago.tipo || 'Transferencia',
              fecha:       fechaFacturaFinal ? new Date(`${fechaFacturaFinal}T12:00:00-04:00`).toISOString() : new Date().toISOString(),
              forma:       '03',   // 03 = Transferencia bancaria
              monto:       montoConciliadoNum
            }];
          }
          await actualizarPago(pago.id, { detalles: curDet });
        } catch(e) {
          console.error('Error guardando datos para factura digital conciliada:', e);
        }

      }
      // Con Diferencia: agregar monto de diferencia como saldo a favor
      if (estatus === 'Con Diferencia' && montoConciliadoNum > 0) {
        // Buscar inmueble del contribuyente para actualizar saldo_favor_bs
        const { data: inmList } = await supabase
          .from('inmuebles')
          .select('id, saldo_favor_bs')
          .eq('identidad', pago.identidad);
        if (inmList && inmList.length > 0) {
          const inm = inmList[0];
          const saldoActual = parseFloat(inm.saldo_favor_bs || '0') || 0;
          const nuevoSaldo = saldoActual + montoConciliadoNum;
          await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoSaldo }).eq('id', inm.id);
          // Registrar en documentos como Nota de Credito
          await supabase.from('documentos').insert([{
            identidad: pago.identidad,
            contribuyente: pago.contribuyente || contribInfo?.Contribuyente || contribInfo?.nombre || '',
            tipo: 'Nota de Credito',
            estado: 'Vigente',
            detalles: JSON.stringify({
              monto: montoConciliadoNum.toFixed(2),
              origen_referencia: `Conciliaci�n con diferencia. Referencia: ${pago.referencia || pago.id}`,
              fecha_emision: new Date().toISOString(),
              analista: updatedDet.analista,
            })
          }]);
        }
        // Marcar recibos como Pagado tambi�n (el pago se concilia aunque con diferencia)
        if (recibos.length > 0) {
          await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', recibos);
        }
      }

      alert('Conciliacion guardada exitosamente.');
      onSuccess();
    } catch (e: any) { alert('Error al conciliar: ' + e.message); }
    setIsProcessing(false);
  };

  const ic = "w-full border border-slate-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
  const icRO = "w-full border border-slate-200 rounded px-3 py-1.5 text-sm bg-slate-50 text-slate-700 cursor-not-allowed font-medium";
  const lc = "block text-xs font-semibold text-blue-600 mb-1";

  // Campos reales en la tabla inmuebles: contribuyente (min), cod_cont, direccion, clasificacion, etc.
  const esCondoModal = det.modulo === 'condominios' || (pago as any).modulo === 'condominios' || !!det.es_condominio || !!det.condominio;
  const condoCodModal = det.condominio?.codigo || det.codigo_condominio;
  const unidadCodModal = det.condominio?.lineas?.[0]?.inmueble 
    || det.deuda_previa?.[0]?.inmueble
    || (det.inmueble && det.inmueble !== condoCodModal ? det.inmueble : null)
    || (det.cod_inmueble && det.cod_inmueble !== condoCodModal ? det.cod_inmueble : null)
    || (det.codigo_inmueble && det.codigo_inmueble !== condoCodModal ? det.codigo_inmueble : null);

  const idPagoLimpioModal = (pago.identidad || '').replace(/-/g, '').trim().toUpperCase();
  const idCondoLimpioModal = (det.condominio?.identidad || '').replace(/-/g, '').trim().toUpperCase();

  const lineasCondoModal = Array.isArray(det.condominio?.lineas) ? det.condominio.lineas : [];
  const tieneMultiplesLineasModal = lineasCondoModal.length > 1;
  const esModoCondoModal = (det.modo === 'CONDOMINIO') || (!det.modo && (det.isCondominio === true || det.es_condominio === true) && !unidadCodModal);

  const esPagoUnidadIndividualModal = det.modo === 'CONTRIBUYENTE' ||
    String(det.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
    (det.modo !== 'CONDOMINIO' && !tieneMultiplesLineasModal && !!unidadCodModal && unidadCodModal !== condoCodModal) ||
    (!!idCondoLimpioModal && !!idPagoLimpioModal && idPagoLimpioModal !== idCondoLimpioModal);

  const esCondoGlobal = esCondoModal && !esPagoUnidadIndividualModal;

  const nombreContrib = esCondoGlobal
    ? (det.condominio?.nombre || contribInfo?.contribuyente || det.contribuyente || '---')
    : (contribInfo?.contribuyente || contribInfo?.Contribuyente || det.contribuyente || det.recibo_caja?.[0]?.razonSocial || pago.contribuyente || '---');

  const codInmueble = esCondoGlobal
    ? (det.condominio?.codigo || contribInfo?.inmueble || det.cod_inmueble || '---')
    : (contribInfo?.inmueble || contribInfo?.cod_cont || unidadCodModal || det.cod_inmueble || det.codigo_inmueble || det.inmueble || pago.cod_inmueble || '---');

  const direccion = contribInfo?.direccion || contribInfo?.Direccion || det.recibo_caja?.[0]?.domicilioFiscal || '---';
  const clasificacion = contribInfo?.clasificacion || contribInfo?.Clasificacion || '---';
  const identidad = esCondoGlobal
    ? (det.condominio?.identidad || contribInfo?.identidad || pago.identidad || '---')
    : (contribInfo?.identidad || pago.identidad || det.identidad || det.recibo_caja?.[0]?.rifCi || '---');

  const telefono = contribInfo?.telefono || det.telefono || '---';
  const correo = contribInfo?.correo_electronico || contribInfo?.correo || det.correo || '---';

  const actividadPrincipal = esCondoGlobal
    ? `Condominio ${det.condominio?.tipo || 'Comercial'}`
    : (cleanClasificacionActividad(contribInfo?.actividad_principal || contribInfo?.Actividad || det.condominio?.lineas?.[0]?.actividad || det.actividad || '') || 'Servicio de Aseo Urbano');
  const saldoFavor = (contribInfo?._saldoFavor || 0).toFixed(2);
  const deudaTotal = (contribInfo?._deudaTotal || 0).toFixed(2);
  const totalInmuebles = contribInfo?._totalInmuebles || 1;
  const estadoCont = contribInfo?.estado || 'Activo';

  const estatusColor: Record<string,string> = {
    Aprobado: 'bg-green-100 border-green-400',
    Rechazado: 'bg-red-100 border-red-400',
    'Con Diferencia': 'bg-amber-100 border-amber-400',
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-4" onClick={e => e.stopPropagation()}>
          <div className="text-center py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-wider">Conciliacion de Pagos</h2>
          </div>
          <div className="p-6 space-y-4">

            {/* MULTI-TRANSFERENCIAS VINCULADAS */}
            {pagosVinculados.length > 1 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 text-white rounded text-xs font-black">🔗</span>
                    <div>
                      <h4 className="font-bold text-xs text-indigo-900 uppercase tracking-wide">
                        Operación con Múltiples Transferencias ({pagosVinculados.length} pagos vinculados)
                      </h4>
                      <p className="text-[11px] text-indigo-700">
                        Este pago forma parte de una liquidación dividida en varias transferencias bancarias.
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-500 uppercase">Total Combinado</div>
                    <div className="text-sm font-black text-indigo-900">
                      Bs. {formatBs(pagosVinculados.reduce((s, p) => s + (parseFloat(String(p.monto || '0')) || 0), 0))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 mb-3">
                  {pagosVinculados.map((pv: any, pidx: number) => {
                    const isCurrent = pv.id === pago.id;
                    const pvMonto = parseFloat(String(pv.monto || '0')) || 0;
                    return (
                      <div
                        key={pv.id || pidx}
                        className={`flex items-center justify-between text-xs p-2 rounded-lg border transition-all ${
                          isCurrent
                            ? 'bg-indigo-100/90 border-indigo-300 font-bold shadow-xs'
                            : 'bg-white border-indigo-100 hover:bg-indigo-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-900 font-mono font-bold">
                            #{pidx + 1}
                          </span>
                          <span className="font-mono text-slate-800">{pv.referencia || 'Sin Referencia'}</span>
                          <span className="text-slate-500 text-[11px]">({pv.banco || pv.tipo || 'Transferencia'})</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                              Pago en Pantalla
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              pv.estado === 'Aprobado'
                                ? 'bg-green-100 text-green-700'
                                : pv.estado === 'Rechazado'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {pv.estado || 'Por Verificar'}
                          </span>
                          <span className="font-bold font-mono text-slate-900">
                            Bs. {formatBs(pvMonto)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <label className="flex items-center gap-2 cursor-pointer bg-white/80 p-2 rounded-lg border border-indigo-200 hover:bg-white transition-colors">
                  <input
                    type="checkbox"
                    checked={conciliarTodoElGrupo}
                    onChange={(e) => setConciliarTodoElGrupo(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-xs text-indigo-900 font-bold">
                    Conciliar simultáneamente todas las transferencias vinculadas de este grupo
                  </span>
                </label>
              </div>
            )}

            {/* INFO CONTRIBUYENTE � Solo lectura - TODOS los datos */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-2">
                  <Building2 size={14}/> Informaci�n del Contribuyente
                  {loadingContrib && <span className="text-[10px] text-blue-400 font-normal animate-pulse">(cargando...)</span>}
                </p>
                <div className="flex gap-2 text-[10px]">
                  <span className={`px-2 py-0.5 rounded-full font-bold ${estadoCont === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{estadoCont}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">{totalInmuebles} inmueble{totalInmuebles !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lc}>RIF / C�dula</label>
                  <input value={identidad} readOnly className={icRO}/>
                </div>
                <div>
                  <label className={lc}>Nombre / Raz�n Social</label>
                  <input value={nombreContrib} readOnly className={icRO}/>
                </div>
                <div>
                  <label className={lc}>C�digo Inmueble</label>
                  <input value={codInmueble} readOnly className={icRO}/>
                </div>
                <div className="col-span-2">
                  <label className={lc}>Actividad / Inmueble</label>
                  <input value={actividadPrincipal} readOnly className={icRO}/>
                </div>
                <div>
                  <label className={lc}>Estado</label>
                  <input value={estadoCont} readOnly className={`${icRO} ${estadoCont === 'Activo' ? 'text-green-700' : 'text-red-700'} font-bold`}/>
                </div>
                <div className="col-span-2">
                  <label className={lc}>Direcci�n</label>
                  <input value={direccion} readOnly className={icRO}/>
                </div>
                <div>
                  <label className={lc}>Tel�fono</label>
                  <input value={telefono} readOnly className={icRO}/>
                </div>
                <div className="col-span-2">
                  <label className={lc}>Correo Electr�nico</label>
                  <input value={correo} readOnly className={icRO}/>
                </div>
              </div>
              {/* Resumen financiero */}
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-blue-200">
                <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                  <p className="text-[10px] text-red-500 font-bold uppercase">Deuda Total en Sistema</p>
                  <p className="text-sm font-black text-red-700">Bs. {fmt(parseFloat(deudaTotal))}</p>
                  {hayRecalculo && deudaRecalculada > 0 && (
                    <p className="text-[10px] font-bold text-amber-700 mt-0.5 border-t border-red-200 pt-0.5">
                      ? Con tasa {tasaNum.toFixed(2)}: Bs. {fmt(deudaRecalculada)}
                    </p>
                  )}
                </div>
                <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
                  <p className="text-[10px] text-green-500 font-bold uppercase">Saldo a Favor</p>
                  <p className="text-sm font-black text-green-700">Bs. {fmt(parseFloat(saldoFavor))}</p>
                </div>
              </div>
            </div>

            {/* DATOS DEL PAGO */}
            <div className="grid grid-cols-4 gap-4">
              <div><label className={lc}>Forma de Pago</label>
                <input value={pago.tipo || '---'} readOnly className={icRO}/>
              </div>
              <div><label className={lc}>Cajero / Operador</label>
                <input value={cajeroOperador} onChange={e=>setCajeroOperador(e.target.value)} placeholder="Ej: O-carlieth" className={ic}/>
              </div>
              <div><label className={lc}>Banco Emisor</label>
                <select value={bancoEmisor} onChange={e=>setBancoEmisor(e.target.value)} className={ic}>
                  <option value="">-- Seleccionar --</option>
                  {bancosVenezuela.map(b=><option key={b}>{b}</option>)}
                </select>
              </div>
              <div><label className={lc}>Referencia Origen</label>
                <input value={referenciaOrigen} onChange={e=>setReferenciaOrigen(e.target.value)} className={ic}/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={lc}>Banco Receptor</label>
                <select value={bancoReceptor} onChange={e=>setBancoReceptor(e.target.value)} className={ic}>
                  <option value="">-- Seleccionar Banco Receptor --</option>
                  {BANCOS_DESTINO.filter(b=>b!=='Todos').map(b=><option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div><label className={lc}>Fecha Transacci�n</label>
                <input type="date" value={fechaTransaccion} onChange={e=>setFechaTransaccion(e.target.value)} className={ic}/>
              </div>
              <div><label className={lc}>Fecha en Banco</label>
                <input type="date" value={fechaBanco} onChange={e=>setFechaBanco(e.target.value)} className={ic}/>
              </div>
            </div>

            {/* VISTA PREVIA COMPROBANTE ADJUNTO (DIRECTA EN CONCILIACIÓN) */}
            {(() => {
              const compArchivos = extraerArchivosComprobante(pago);
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Eye size={14} className="text-blue-600"/> Comprobante(s) Adjunto(s) ({compArchivos.length})
                    </span>
                    {compArchivos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowComp(true)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 cursor-pointer"
                      >
                        Ver en pantalla completa
                      </button>
                    )}
                  </div>
                  {compArchivos.length === 0 ? (
                    <div className="text-center py-2 text-slate-400 text-xs italic">
                      No hay comprobante digital adjunto para este pago.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {compArchivos.map((arch, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded text-xs shadow-2xs">
                          <div className="flex items-center gap-2 truncate max-w-[70%]">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${arch.tipo === "Retención" ? "bg-purple-100 text-purple-800 border border-purple-200" : "bg-blue-100 text-blue-800 border border-blue-200"}`}>
                              {arch.tipo}
                            </span>
                            <span className="truncate font-mono text-[11px] text-slate-700 font-semibold" title={arch.name}>{arch.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setShowComp(true)}
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[11px] font-bold flex items-center gap-1 border border-blue-200 cursor-pointer"
                            >
                              <Eye size={12}/> Ver
                            </button>
                            <a
                              href={arch.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold border border-slate-200"
                            >
                              Abrir
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CONCILIACI�N */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={lc}>Monto Reportado</label>
                <input value={fmt(montoReportadoNum)} readOnly className={icRO + ' font-bold text-slate-800'}/>
              </div>
              <div>
                <label className={lc}>
                  Tasa BCV (editable)
                  {hayRecalculo && <span className="ml-1 text-amber-600 font-bold text-[10px]">? RECALCULANDO</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Bs.</span>
                  <input
                    value={tasaCustom}
                    onChange={e => setTasaCustom(e.target.value)}
                    className={ic + ' pl-7 ' + (hayRecalculo ? 'border-amber-400 bg-amber-50 font-bold text-amber-800' : '')}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={tasaOriginal ? tasaOriginal.toFixed(2) : 'Ingrese tasa...'}
                  />
                </div>
                {tasaOriginal > 0 && <p className="text-[10px] text-slate-400 mt-0.5">Original: Bs. {tasaOriginal.toFixed(2)}</p>}
              </div>
              <div>
                <label className={lc}>Estatus de Conciliaci�n</label>
                <select
                  value={estatus}
                  onChange={e => handleEstatusChange(e.target.value)}
                  className={`${ic} font-semibold ${estatus === 'Aprobado' ? 'text-green-700 bg-green-50 border-green-400' : estatus === 'Rechazado' ? 'text-red-700 bg-red-50 border-red-400' : 'text-amber-700 bg-amber-50 border-amber-400'}`}
                >
                  {ESTATUS_CONCILIAR.map(s=><option key={s}>{s}</option>)}
                </select>
                {estatus === 'Con Diferencia' && (
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">
                    ⚠️ El monto ingresado se agregar� como saldo a favor del contribuyente.
                  </p>
                )}
              </div>
              <div>
                <label className={lc}>
                  {estatus === 'Con Diferencia' ? 'Monto de Diferencia (→ Saldo a Favor)' : 'Monto Conciliado'}
                </label>
                <input
                  value={montoConciliado}
                  onChange={e => setMontoConciliado(formatLocalNumberInput(e.target.value))}
                  onBlur={e => {
                    const p = parseLocalFloat(e.target.value);
                    if (p > 0) setMontoConciliado(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                  }}
                  className={`${ic} ${estatus === 'Aprobado' ? 'font-bold text-green-800' : ''} ${estatus === 'Con Diferencia' ? 'border-amber-400 bg-amber-50' : ''}`}
                  type="text"
                  inputMode="decimal"
                />
                {estatus === 'Aprobado' && montoConciliadoNum > totalAPagarCalc + 0.05 && (
                  <p className="text-[11px] text-emerald-600 mt-1 font-bold">
                    ✓ Excedente de Bs. {fmt(montoConciliadoNum - totalAPagarCalc)} se acreditará como Saldo a Favor con Nota de Crédito.
                  </p>
                )}
              </div>
            </div>

            {/* RESPONSABLE */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lc}>Correo Responsable</label>
                <div className="flex gap-1">
                  <input value={correoResponsable} onChange={e=>setCorreoResponsable(e.target.value)} className={ic}/>
                  <span className="text-blue-500 px-1 flex items-center"><Mail size={16}/></span>
                </div>
              </div>
              <div>
                <label className={lc}>Tel�fono Responsable</label>
                <input value={telefonoResponsable} onChange={e=>setTelefonoResponsable(e.target.value)} className={ic}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-2">Notificar al Usuario?</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={enviarCorreo} onChange={e=>setEnviarCorreo(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                  <span className="text-sm font-medium text-slate-700">Enviar Correo</span>
                </label>
              </div>
              <div>
                <textarea value={observaciones} onChange={e=>setObservaciones(e.target.value)} rows={3}
                  placeholder="Observaciones (se copian al correo del usuario)"
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
              </div>
            </div>

            {/* RESUMEN */}
            <div className={`border rounded-lg p-4 ${estatusColor[estatus] || 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Periodo(s)</span>
                <span className="font-mono text-slate-700 text-xs">{periodos}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-600 font-semibold">Total Documento</span>
                <span className="text-blue-600 font-bold">{fmt(totalDocumentoCalc)}</span>
              </div>
              {tieneRetencion ? (
                <>
                  <div className="flex justify-between text-xs text-slate-500 ml-4">
                    <span>IVA Total (16%)</span>
                    <span>{fmt(ivaTotalDoc)}</span>
                  </div>
                  <div className="flex justify-between text-sm ml-4">
                    <span className="text-amber-600 font-semibold">Retención IVA (75%)</span>
                    <span className="text-amber-600 font-bold">- {fmt(montoRetencionDoc)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 font-semibold">Total Retenciones</span>
                  <span className="text-green-600 font-bold">0,00</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t pt-1 mt-1">
                <span className="font-bold text-slate-800">Total a Pagar</span>
                <span className="font-bold text-slate-800">{fmt(totalAPagarCalc)}</span>
              </div>
              {estatus === 'Aprobado' && montoConciliadoNum > totalAPagarCalc + 0.05 && (
                <div className="flex justify-between text-sm border-t pt-1 mt-1 text-emerald-700 font-bold bg-emerald-50/70 p-2 rounded">
                  <span>Saldo a Favor Generado (Nota de Crédito)</span>
                  <span>+ {fmt(montoConciliadoNum - totalAPagarCalc)}</span>
                </div>
              )}
              {/* Diferencia pendiente cuando monto conciliado < deuda total */}
              {estatus === 'Aprobado' && montoConciliadoNum > 0 && montoReportadoNum < deudaTotalContrib - 0.05 && (
                <div className="border-t pt-2 mt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700 font-bold">⚠️ Deuda Restante (Pendiente de Pago)</span>
                    <span className="text-amber-700 font-bold">- {fmt(deudaTotalContrib - montoReportadoNum)}</span>
                  </div>
                  {det.nota_cambio_tasa && (
                    <p className="text-xs text-amber-700 mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ⚠️ Ajuste por cambio de tasa BCV: {det.nota_cambio_tasa}. Tasa aplicada: {det.tasa_bcv_aplicada || det.tasa_bcv} Bs/$.
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">El contribuyente tiene recibos adicionales o inmuebles pendientes no incluidos en este pago.</p>
                </div>
              )}
              {estatus === 'Con Diferencia' && parseLocalFloat(montoConciliado) > 0 && (
                <div className="flex justify-between text-sm border-t pt-1 mt-1 text-amber-700 font-bold">
                  <span>Saldo a Favor a Acreditar</span>
                  <span>+ {fmt(parseLocalFloat(montoConciliado))}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center px-6 pb-5">
            <div className="flex gap-2">
              <button onClick={()=>setShowComp(true)} className="px-4 py-2 border border-red-500 text-red-600 hover:bg-red-50 rounded font-semibold text-sm">Ver Comprobante</button>
              <button onClick={()=>setShowEdo(true)} className="px-4 py-2 border border-red-500 text-red-600 hover:bg-red-50 rounded font-semibold text-sm">Ver Estado de Cuenta</button>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 border border-slate-400 text-slate-600 hover:bg-slate-50 rounded font-semibold text-sm flex items-center gap-1"><X size={14}/> Cerrar</button>
              <button onClick={handleConciliar} disabled={isProcessing} className="px-5 py-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 rounded font-bold text-sm flex items-center gap-2">
                {isProcessing ? <RefreshCw size={14} className="animate-spin"/> : <CheckCheck size={14}/>} {pago.estado === 'Aprobado' ? 'Guardar Cambios / Referencia' : 'Conciliar'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showComp && <ModalComprobante pago={pago} onClose={()=>setShowComp(false)}/>}
      {showEdo && <ModalEstadoCuenta pago={pago} onClose={()=>setShowEdo(false)}/>}
    </>
  );
}

// ─── PAGINA PRINCIPAL ────────────────────────────────────
export default function ConciliacionPage() {
  const { inmuebles } = useAppContext();
  const [activeTab, setActiveTab] = useState<'pagos' | 'retenciones'>('pagos');
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(false);
  const condos = useCondominiosLigero();

  // Mapa de nombres O(1) para evitar recorrer 50.000 inmuebles en cada fila
  const nombresPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of inmuebles || []) {
      const k = (i.identidad || '').replace(/-/g, '').toUpperCase();
      if (k && !m.has(k) && (i.contribuyente || i.nombre)) {
        m.set(k, i.contribuyente || i.nombre);
      }
    }
    return m;
  }, [inmuebles]);

  // Mapa de inmuebles por código O(1) para resolver código principal padre (ej: N/A) vs desgloses
  const inmueblesPorCodigo = useMemo(() => {
    const m = new Map<string, any>();
    for (const i of inmuebles || []) {
      if (i.inmueble) {
        m.set(String(i.inmueble).toUpperCase(), i);
      }
    }
    return m;
  }, [inmuebles]);

  const [filtros, setFiltros] = useState<Filtros>({
    desde: (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
    })(),
    hasta: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()),
    estatus: 'Todos', bancoDestino: 'Todos', formaPago: 'Todos', referencia: '', monto: '', modulo: 'Todos',
  });
  const [busquedaInput, setBusquedaInput] = useState('');
  const reqIdRef = useRef(0);
  const [pagoSel, setPagoSel] = useState<Pago | null>(null);
  const [mode, setMode] = useState<'conciliar'|'comprobante'|'edoCuenta'|null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFiltros(f => (f.referencia === busquedaInput ? f : { ...f, referencia: busquedaInput }));
    }, 350);
    return () => clearTimeout(timer);
  }, [busquedaInput]);

  const fetchPagos = useCallback(async () => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const tieneTermino = Boolean(filtros.referencia && filtros.referencia.trim());
      const soloVerificacion = filtros.estatus === 'Por Verificar';
      const armar = () => {
        let q = supabase.from('pagos_reportados').select('*').neq('tipo', 'Retencion de IVA').order('created_at', { ascending: false }).limit(500);
        // Si hay búsqueda por término o se busca 'Por Verificar', no limitar por fecha
        if (!tieneTermino && !soloVerificacion && filtros.desde) q = q.gte('created_at', filtros.desde + 'T04:00:00.000Z');
        if (!tieneTermino && !soloVerificacion && filtros.hasta) { const d = new Date(filtros.hasta + 'T04:00:00Z'); d.setDate(d.getDate()+1); q = q.lte('created_at', d.toISOString()); }
        if (!tieneTermino && filtros.estatus !== 'Todos') q = q.eq('estado', filtros.estatus);
        if (filtros.formaPago !== 'Todos') q = q.eq('tipo', filtros.formaPago);
        if (tieneTermino) {
          const term = filtros.referencia.trim();
          const rifsMatching = Array.from(condos.values())
            .filter((c: any) => (c.nombre || '').toLowerCase().includes(term.toLowerCase()) || 
                                (c.codigo || '').toLowerCase().includes(term.toLowerCase()) || 
                                (c.identidad || '').toLowerCase().includes(term.toLowerCase()))
            .map((c: any) => c.identidad)
            .filter(Boolean);
          const inmsMatching = (inmuebles || [])
            .filter((i: any) => (i.inmueble || '').toLowerCase().includes(term.toLowerCase()) || 
                                (i.cod_cont || '').toLowerCase().includes(term.toLowerCase()))
            .map((i: any) => i.identidad)
            .filter(Boolean);
          const allMatchingIds = Array.from(new Set([...rifsMatching, ...inmsMatching]));

          const orParts = [
            `referencia.ilike.%${term}%`,
            `identidad.ilike.%${term}%`,
            `detalles->condominio->>nombre.ilike.%${term}%`,
            `detalles->condominio->>codigo.ilike.%${term}%`,
            `detalles->>condominio_nombre.ilike.%${term}%`,
            `detalles->>contribuyente.ilike.%${term}%`,
            `detalles->>contribuyente_nombre.ilike.%${term}%`,
            `detalles->>codigo_inmueble.ilike.%${term}%`,
            `detalles->>cod_inmueble.ilike.%${term}%`,
            `detalles->>inmueble.ilike.%${term}%`
          ];
          if (allMatchingIds.length > 0) {
            orParts.push(`identidad.in.(${allMatchingIds.slice(0, 50).join(',')})`);
          }
          q = q.or(orParts.join(','));
        }
        if (filtros.monto) q = q.eq('monto', filtros.monto);
        return q;
      };
      let result: any[] = [];
      if (tieneTermino) {
        // Con término de búsqueda específica, se ejecuta una consulta ultrarrápida indexada
        let q = armar();
        if (filtros.modulo === 'Contribuyentes') q = q.neq('modulo', 'condominios');
        const { data } = await q;
        result = data || [];
      } else if (filtros.modulo.startsWith('Condominios')) {
        // Pagos generales de condominios: del módulo / marcados, y por RIF del condominio (en lotes)
        const lotes = [armar().or(OR_CONDOMINIOS)];
        const rifs = rifsCondominios(condos);
        for (let i = 0; i < rifs.length; i += 150) lotes.push(armar().in('identidad', rifs.slice(i, i + 150)));
        const res = await Promise.all(lotes);
        const porId = new Map<string, any>();
        res.forEach(r => (r.data || []).forEach((p: any) => porId.set(p.id, p)));
        result = [...porId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 500);
      } else {
        let q = armar();
        if (filtros.modulo === 'Contribuyentes') q = q.neq('modulo', 'condominios');
        const { data } = await q;
        result = data || [];
      }
      // Filtrar estrictamente: solo pagos bancarios activos/conciliables
      // (sin anulados ni comprobantes puros de retención de IVA, que se gestionan en su propio módulo)
      result = result.filter((p: any) => {
        const estNorm = String(p.estado || '').trim().toLowerCase();
        if (estNorm === 'anulado' || estNorm.startsWith('anulad')) return false;
        if (p.tipo === 'Retencion de IVA') return false;
        if (String(p.referencia || '').startsWith('RET-')) return false;
        const det = parseDetalles(p.detalles);
        if (det.anulado || det.factura_digital?.anulada || det.factura_anulada) return false;
        if (det.pago_vinculado && p.banco === 'N/A') return false;
        return pasaFiltroModulo(p, filtros.modulo, condos);
      });

      if (filtros.referencia && filtros.referencia.trim()) {
        const t = filtros.referencia.trim().toLowerCase();
        result = result.filter((p: any) => {
          const ref = (p.referencia || '').toLowerCase();
          const iden = (p.identidad || '').toLowerCase();
          const det = parseDetalles(p.detalles);
          const condo = infoCondominioPago(p, condos);
          const condoNom = (condo?.nombre || det.condominio?.nombre || det.condominio_nombre || '').toLowerCase();
          const condoCod = (condo?.codigo || det.condominio?.codigo || det.codigo_inmueble || det.cod_inmueble || det.inmueble || '').toLowerCase();
          const cont = (det.contribuyente || det.contribuyente_nombre || p.contribuyente || '').toLowerCase();
          const recibosStr = Array.isArray(det.recibos) ? det.recibos.join(' ').toLowerCase() : '';
          return ref.includes(t) || iden.includes(t) || condoNom.includes(t) || condoCod.includes(t) || cont.includes(t) || recibosStr.includes(t);
        });
      }
      if (filtros.bancoDestino !== 'Todos') {
        result = result.filter((p: any) => {
          const det = parseDetalles(p.detalles);
          return (p.banco_destino || det.banco_destino || '').includes(filtros.bancoDestino.split(' - ')[0]);
        });
      }
      if (currentReqId !== reqIdRef.current) return;
      setPagos(result);
    } catch(e) {
      if (currentReqId !== reqIdRef.current) return;
      console.error(e);
    }
    if (currentReqId === reqIdRef.current) setLoading(false);
  }, [filtros, condos, inmuebles]);

  useEffect(() => { fetchPagos(); }, [fetchPagos]);

  const abrir = (pago: Pago, m: 'conciliar'|'comprobante'|'edoCuenta') => { setPagoSel(pago); setMode(m); };
  const cerrar = () => { setPagoSel(null); setMode(null); };
  const onSuccess = () => { cerrar(); fetchPagos(); };

  const estatusCls = (e: string) => {
    if (e === 'Aprobado') return 'text-green-600 font-bold';
    if (e === 'Por Verificar' || e === 'Pendiente') return 'text-yellow-600 font-bold';
    if (e === 'Rechazado') return 'text-red-600 font-bold';
    return 'text-slate-600';
  };

  const filas: React.ReactNode[] = [];
  let totalCondo = 0, cantCondo = 0;
  pagos.forEach((pago, idx) => {
    const det = parseDetalles(pago.detalles);
    const condo = infoCondominioPago(pago, condos);
    const cajeroStr = det.cajero || det.caja || det.usuario || '';
    const cajeroInfo = cajeroStr ? ' Cajero => ' + cajeroStr : '';
    const docInfo = 'id pago => ' + pago.id + ' Documento Nro. => ' + (det.doc_nro || '') + cajeroInfo + ' Responsable => ' + (det.responsable || '') + ' Analista => ' + (det.analista || '');
    const esPendiente = pago.estado === 'Por Verificar' || pago.estado === 'Pendiente';
    const esAprobado = pago.estado === 'Aprobado';
    const m = parseFloat(String(pago.monto||'0').replace(/[^0-9.]/g,''));
    if (condo) { totalCondo += m || 0; cantCondo++; }
    const mismoGrupoQueAnterior = condo?.grupo && idx > 0 && infoCondominioPago(pagos[idx - 1], condos)?.grupo?.id === condo.grupo.id;
    filas.push(
      <tr key={'doc'+idx} className={`${condo ? 'bg-emerald-50' : 'bg-slate-100'} border-t ${mismoGrupoQueAnterior ? 'border-dashed border-sky-300' : 'border-slate-200'}`}>
        <td colSpan={10} className="px-3 py-1 text-xs text-slate-600 font-mono truncate">
          {condo && (
            <span className="inline-flex items-center gap-1.5 mr-2 font-sans align-middle flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">CONDOMINIO{condo.residencial === true ? ' · RESIDENCIAL' : condo.residencial === false ? ' · COMERCIAL' : ''}</span>
              <span className="text-[11px] font-bold text-emerald-900">{condo.nombre}{condo.codigo ? ` (${condo.codigo})` : ''}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${condo.facturaA === 'CONTRIBUYENTE' ? 'bg-sky-100 text-sky-800 border border-sky-300' : 'bg-white text-emerald-800 border border-emerald-300'}`}>
                Factura a: {condo.facturaA === 'CONTRIBUYENTE' ? 'el contribuyente' : 'el condominio'}
              </span>
              {condo.grupo && <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[10px] font-black">Pago repartido · parte {condo.grupo.parte} de {condo.grupo.partes} · total Bs {fmt(condo.grupo.montoTotal)}</span>}
              {(det.pago_principal_id || det.es_pago_adicional || pago.grupo_pago || (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1)) && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black">
                  🔗 MULTI-TRANSFERENCIA {det.es_pago_adicional ? '· DIFERENCIA' : (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1 ? '· ANTICIPO' : '')}
                </span>
              )}
            </span>
          )}
          {!condo && (det.pago_principal_id || det.es_pago_adicional || pago.grupo_pago || (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1)) && (
            <span className="inline-flex items-center gap-1.5 mr-2 font-sans align-middle">
              <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black">
                🔗 MULTI-TRANSFERENCIA {det.es_pago_adicional ? '· DIFERENCIA' : (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1 ? '· ANTICIPO' : '')}
              </span>
              {det.es_pago_adicional && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 text-[10px] font-bold">Transferencia Adicional</span>
              )}
            </span>
          )}
          {docInfo}
        </td>
      </tr>,
      <tr key={'d'+idx} className="hover:bg-blue-50/30 transition-colors border-b border-slate-100">
        <td className="px-3 py-2 text-xs font-mono text-slate-700">
          {(() => {
            const esCondo = Boolean(condo || det.modulo === 'condominios' || det.es_condominio || det.condominio);
            const condoNom = det.condominio?.nombre || condo?.nombre;
            const condoCod = det.condominio?.codigo || condo?.codigo;
            const condoRif = det.condominio?.identidad || (condo as any)?.identidad;
            const unidadCod = det.condominio?.lineas?.[0]?.inmueble 
              || det.deuda_previa?.[0]?.inmueble
              || (det.inmueble && det.inmueble !== condoCod ? det.inmueble : null)
              || (det.cod_inmueble && det.cod_inmueble !== condoCod ? det.cod_inmueble : null)
              || (det.codigo_inmueble && det.codigo_inmueble !== condoCod ? det.codigo_inmueble : null);

            const idPagoLimpio = (pago.identidad || '').replace(/-/g, '').trim().toUpperCase();
            const idCondoLimpio = (condoRif || '').replace(/-/g, '').trim().toUpperCase();

            const lineasCondo = Array.isArray(det.condominio?.lineas) ? det.condominio.lineas : [];
            const tieneMultiplesLineas = lineasCondo.length > 1;

            const esPagoUnidadIndividual = 
              det.modo === 'CONTRIBUYENTE' ||
              String(det.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
              (det.modo !== 'CONDOMINIO' && !tieneMultiplesLineas && !!unidadCod && unidadCod !== condoCod) ||
              (!!idCondoLimpio && !!idPagoLimpio && idPagoLimpio !== idCondoLimpio);

            const idKey = (pago.identidad || '').replace(/-/g, '').toUpperCase();
            const nombreNormal = pago.contribuyente || det.contribuyente || det.recibo_caja?.[0]?.razonSocial || nombresPorId.get(idKey) || '---';

            if (esCondo && !esPagoUnidadIndividual) {
              return (
                <div>
                  <div className="font-bold font-sans text-[11px] truncate max-w-[170px]" title={condoNom || nombreNormal}>{condoNom || nombreNormal}</div>
                  <div className="text-[10px] text-slate-500">{condoRif || pago.identidad}</div>
                </div>
              );
            }

            // Pago individual / por local
            const subLocal = det.condominio?.lineas?.[0]?.numero ? `Local ${det.condominio.lineas[0].numero}` : (unidadCod || null);
            const subCondo = condoNom ? (subLocal ? `${condoNom} · ${subLocal}` : condoNom) : null;
            return (
              <div>
                <div className="font-bold font-sans text-[11px] truncate max-w-[170px]" title={nombreNormal}>{nombreNormal}</div>
                {subCondo && <div className="text-[10px] text-slate-600 truncate max-w-[170px]" title={subCondo}>{subCondo}</div>}
                <div className="text-[10px] text-slate-500">{pago.identidad || det.identidad}</div>
              </div>
            );
          })()}
        </td>
        <td className="px-3 py-2 text-xs text-slate-600">
          {(() => {
            const esCondo = Boolean(condo || det.modulo === 'condominios' || det.es_condominio || det.condominio);
            const condoCod = det.condominio?.codigo || condo?.codigo;
            const unidadCod = det.condominio?.lineas?.[0]?.inmueble 
              || (det.inmueble && det.inmueble !== condoCod ? det.inmueble : null)
              || (det.cod_inmueble && det.cod_inmueble !== condoCod ? det.cod_inmueble : null)
              || (det.codigo_inmueble && det.codigo_inmueble !== condoCod ? det.codigo_inmueble : null)
              || pago.cod_inmueble;

            const idPagoLimpio = (pago.identidad || '').replace(/-/g, '').trim().toUpperCase();
            const idCondoLimpio = ((det.condominio?.identidad || (condo as any)?.identidad) || '').replace(/-/g, '').trim().toUpperCase();
            const lineasCondo = Array.isArray(det.condominio?.lineas) ? det.condominio.lineas : [];
            const tieneMultiplesLineas = lineasCondo.length > 1;

            const esPagoUnidadIndividual = 
              det.modo === 'CONTRIBUYENTE' ||
              String(det.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
              (det.modo !== 'CONDOMINIO' && !tieneMultiplesLineas && !!unidadCod && unidadCod !== condoCod) ||
              (!!idCondoLimpio && !!idPagoLimpio && idPagoLimpio !== idCondoLimpio);

            if (esCondo && !esPagoUnidadIndividual && condoCod) {
              const lineasCod = condo?.lineas?.length ? condo.lineas.slice(0, 3).map(l => l.inmueble || l.numero).filter(Boolean).join(', ') + (condo.lineas.length > 3 ? ` +${condo.lineas.length - 3}` : '') : null;
              return (
                <div>
                  <div className="font-bold text-[11px] text-slate-800">{condoCod}</div>
                  {lineasCod && <div className="text-[10px] text-slate-500">{lineasCod}</div>}
                </div>
              );
            }

            // Pago individual / por unidad o local
            // Extraer primero los inmuebles asociados directamente a los recibos pagados
            const recibosCodigos: string[] = [];
            if (Array.isArray(det.recibos)) {
              for (const r of det.recibos) {
                const m = String(r).match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+)/i);
                if (m && m[1]) {
                  const c = m[1].toUpperCase().split('-')[0];
                  if (c && !recibosCodigos.includes(c)) recibosCodigos.push(c);
                }
              }
            }

            // Mapear cada código al código principal (si pertenece a un local unificado con padre N/A)
            const codigosPrincipales = new Set<string>();
            const codigosATratar = recibosCodigos.length > 0
              ? recibosCodigos
              : (det.cod_inmueble || det.codigo_inmueble || det.inmueble || pago.cod_inmueble ? [det.cod_inmueble || det.codigo_inmueble || det.inmueble || pago.cod_inmueble] : []);

            for (const cod of codigosATratar) {
              const inmObj = inmueblesPorCodigo.get(String(cod).toUpperCase());
              if (inmObj?.padre_id) {
                codigosPrincipales.add(String(inmObj.padre_id).toUpperCase());
              } else if (cod) {
                codigosPrincipales.add(String(cod).toUpperCase());
              }
            }

            const codigosFinales = Array.from(codigosPrincipales);
            const codMostrar = codigosFinales.length > 0 ? codigosFinales.join(', ') : (unidadCod || '---');

            return (
              <div>
                <div className="font-bold text-[11px] text-slate-800">{codMostrar}</div>
                {condoCod && condoCod !== codMostrar && (
                  <div className="text-[10px] text-slate-500">{condoCod}</div>
                )}
              </div>
            );
          })()}
        </td>
        <td className="px-3 py-2 text-xs font-mono text-slate-600">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-800">{pago.referencia || '---'}</span>
            {(det.pago_principal_id || det.es_pago_adicional || pago.grupo_pago || (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1)) && (
              <span className={`px-1 py-0.2 rounded font-sans text-[9px] font-bold ${det.es_pago_adicional ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-indigo-100 text-indigo-700'}`} title="Parte de un pago con múltiples transferencias">
                {det.es_pago_adicional ? 'Diferencia' : (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1 ? 'Anticipo' : '🔗 Multi')}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtFecha(pago.created_at)}</td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fechaTransaccionDe(det) || '---'}</td>
        <td className="px-3 py-2 text-xs text-slate-600">
          {pago.tipo === 'Retencion de IVA' ? (
            <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded border border-purple-200 inline-block">
              Retención IVA
            </span>
          ) : (
            pago.tipo || '---'
          )}
        </td>
        <td className="px-3 py-2 text-xs text-slate-600">{pago.banco || det.banco || '---'}</td>
        <td className="px-3 py-2 text-xs text-slate-600">{pago.banco_destino || det.banco_destino || det.banco_receptor || '---'}</td>
        <td className={'px-3 py-2 text-xs '+estatusCls(pago.estado||'')}>{pago.estado || '---'}</td>
        <td className="px-3 py-2 text-sm font-bold text-right text-slate-800">
          {(() => {
            const compArchivos = extraerArchivosComprobante(pago);
            const hasComp = compArchivos.length > 0;
            return (
              <div className="flex items-center justify-end gap-2">
                <span>{fmt(m)}</span>
                {hasComp && (
                  <button
                    type="button"
                    onClick={() => abrir(pago, 'comprobante')}
                    title={`Ver comprobante (${compArchivos.length} archivo${compArchivos.length > 1 ? 's' : ''})`}
                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-300 px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Eye size={13}/>
                    <span>Ver</span>
                  </button>
                )}
                {esPendiente && (
                  <button onClick={() => abrir(pago, 'conciliar')} title="Conciliar pago" className="text-slate-500 hover:text-blue-700 transition-colors cursor-pointer">
                    <Landmark size={18}/>
                  </button>
                )}
                {esAprobado && (
                  <button onClick={() => abrir(pago, 'conciliar')} title="Editar" className="text-green-600 hover:text-green-800 transition-colors cursor-pointer">
                    <Pencil size={16}/>
                  </button>
                )}
              </div>
            );
          })()}
        </td>
      </tr>
    );
  });

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto p-4">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <CheckCheck className="w-7 h-7 text-slate-700"/>
        <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">Conciliacion</h1>
      </div>

      {/* TABS */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        <button onClick={() => setActiveTab('pagos')}
          className={`px-5 py-2.5 text-sm font-bold transition-all border-b-2 -mb-px ${
            activeTab === 'pagos' ? 'border-cyan-500 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <span className="flex items-center gap-2"><Landmark size={15}/> Pagos Reportados</span>
        </button>
        <button onClick={() => setActiveTab('retenciones')}
          className={`px-5 py-2.5 text-sm font-bold transition-all border-b-2 -mb-px ${
            activeTab === 'retenciones' ? 'border-purple-500 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <span className="flex items-center gap-2"><Receipt size={15}/> Retenciones IVA</span>
        </button>
      </div>

      {activeTab === 'retenciones' && <AdminRetenciones />}
      {activeTab === 'pagos' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl">
              <span className="font-bold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2"><Filter size={15}/> Seleccione los Filtros</span>
              <button onClick={fetchPagos} disabled={loading} className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50">
                <Filter size={14}/> {loading ? 'Cargando...' : 'Aplicar Filtros'}
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Rango de Fechas</label>
                <div className="flex gap-1">
                  <input type="date" value={filtros.desde} onChange={e=>setFiltros(f=>({...f,desde:e.target.value}))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"/>
                  <input type="date" value={filtros.hasta} onChange={e=>setFiltros(f=>({...f,hasta:e.target.value}))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"/>
                </div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Estatus</label><select value={filtros.estatus} onChange={e=>setFiltros(f=>({...f,estatus:e.target.value}))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400">{ESTATUS_LIST.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Banco Destino</label><select value={filtros.bancoDestino} onChange={e=>setFiltros(f=>({...f,bancoDestino:e.target.value}))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400">{BANCOS_DESTINO.map(b=><option key={b}>{b}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Forma de pago</label><select value={filtros.formaPago} onChange={e=>setFiltros(f=>({...f,formaPago:e.target.value}))} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400">{FORMAS_PAGO.map(fp=><option key={fp}>{fp}</option>)}</select></div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Código / Ref / RIF / Nombre</label>
                <div className="relative">
                  <input
                    value={busquedaInput}
                    onChange={e => setBusquedaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setFiltros(f => ({ ...f, referencia: busquedaInput }));
                      }
                    }}
                    placeholder="Ej: URB016491, 16816427..."
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs pr-6 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                  {busquedaInput && (
                    <button
                      type="button"
                      onClick={() => { setBusquedaInput(''); setFiltros(f => ({ ...f, referencia: '' })); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-200"
                      title="Limpiar búsqueda"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Monto</label><input value={filtros.monto} onChange={e=>setFiltros(f=>({...f,monto:e.target.value}))} placeholder="Monto exacto" type="number" className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400" /></div>
              <div><label className="block text-xs font-semibold text-emerald-700 mb-1">Módulo</label><select id="filtro-modulo-conciliacion" value={filtros.modulo} onChange={e=>setFiltros(f=>({...f,modulo:e.target.value as FiltroModulo}))} className="w-full border border-emerald-300 bg-emerald-50/40 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-400">{FILTROS_MODULO.map(x=><option key={x}>{x}</option>)}</select></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400"><RefreshCw size={24} className="animate-spin mr-3"/> Cargando pagos...</div>
            ) : pagos.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><Building2 size={40} className="mx-auto mb-3 opacity-30"/><p>No se encontraron pagos. Aplique filtros y haga clic en &quot;Aplicar Filtros&quot;.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      {['Contribuyente','Inmueble','Referencia','Reportado','Transaccion','Tipo','Banco Orig','Banco Dest','Estatus'].map(h => (
                        <th key={h} className="px-3 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wide">{h}</th>
                      ))}
                      <th className="px-3 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wide text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>{filas}</tbody>
                </table>
              </div>
            )}
            {!loading && pagos.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400 bg-slate-50 flex flex-wrap justify-between gap-2">
                <span>{pagos.length} registro(s) encontrados</span>
                {cantCondo > 0 && <span className="text-emerald-700 font-bold">{cantCondo} de condominios · Bs {fmt(totalCondo)}</span>}
              </div>
            )}
          </div>
          {pagoSel && mode === 'conciliar' && <ModalConciliacion pago={pagoSel} onClose={cerrar} onSuccess={onSuccess}/>}
          {pagoSel && mode === 'comprobante' && <ModalComprobante pago={pagoSel} onClose={cerrar}/>}
          {pagoSel && mode === 'edoCuenta' && <ModalEstadoCuenta pago={pagoSel} onClose={cerrar}/>}
        </div>
      )}
    </div>
  );
}








