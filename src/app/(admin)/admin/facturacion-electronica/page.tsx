'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Send, CheckCircle, AlertTriangle, ExternalLink, 
  RefreshCw, Receipt, Search, Mail, Filter, Eye, ShieldCheck, 
  Sliders, ArrowUpRight, Check, X, Building, CheckCircle2,
  AlertCircle, Key, Layers, ArrowRight, ShieldAlert, Sparkles,
  Info, Printer, Download, Trash2,
  CheckSquare, Edit3, Upload,
} from 'lucide-react';
import { ReciboImprimible } from '@/components/ReciboImprimible';
import { DemoFacturaModal } from '@/components/facturacion/DemoFacturaModal';
import { resolverConceptoPeriodoPago } from '@/lib/facturaPeriodoHelper';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function getMesActual() {
  const d = new Date();
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Fecha de hoy (YYYY-MM-DD) en hora de Venezuela */
function hoyCaracas() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SUBTIPO_LABEL: Record<string, { label: string; cls: string }> = {
  factura_comercial:      { label: 'FACTURA · Comercial',      cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  recibo_residencial:     { label: 'RECIBO · Residencial',     cls: 'bg-violet-100 text-violet-800 border-violet-300' },
  factura_multa_comercial: { label: 'FACTURA · Multa comercial', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
};

export default function FacturacionElectronicaPage() {
  const [pagosList, setPagosList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'todos' | 'pendientes' | 'emitidas' | 'retenciones' | 'anuladas'>('pendientes');
  const [moduloFiltro, setModuloFiltro] = useState<string>('Todos');

  // Modal de Revisión de Comprobante de Retención
  const [modalRetencion, setModalRetencion] = useState<any | null>(null);
  const [motivoRechazoRet, setMotivoRechazoRet] = useState<string>('');
  const [modoRechazo, setModoRechazo] = useState<boolean>(false);
  const [procesandoRet, setProcesandoRet] = useState<boolean>(false);

  // Estados para montar planilla por el operador
  const [modoSubirPlanilla, setModoSubirPlanilla] = useState<boolean>(false);
  const [archivoPlanilla, setArchivoPlanilla] = useState<File | null>(null);
  const [numComprobanteOp, setNumComprobanteOp] = useState<string>('');
  const [fechaComprobanteOp, setFechaComprobanteOp] = useState<string>(hoyCaracas());

  const abrirModalRetencion = (pago: any) => {
    setModalRetencion(pago);
    setModoRechazo(false);
    setMotivoRechazoRet('');
    setModoSubirPlanilla(false);
    setArchivoPlanilla(null);
    setNumComprobanteOp(pago.retencionNumeroPlanilla || pago.detalles?.numero_planilla || '');
    setFechaComprobanteOp(pago.retencionFechaPlanilla || hoyCaracas());
  };

  const handleRevisarRetencion = async (accion: 'aprobar' | 'rechazar', sinPlanilla = false) => {
    if (!modalRetencion) return;
    if (accion === 'rechazar' && !motivoRechazoRet.trim()) {
      alert('Por favor ingrese el motivo del rechazo para notificar al contribuyente.');
      return;
    }
    if (accion === 'aprobar' && sinPlanilla) {
      const ok = confirm(`¿Aprobar esta factura con retención SIN comprobante y enviar la factura fiscal inmediatamente al contribuyente (${modalRetencion.contribuyente})?`);
      if (!ok) return;
    }
    setProcesandoRet(true);
    try {
      const res = await fetch('/api/admin/retenciones/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: modalRetencion.pagoId || modalRetencion.id,
          retencionId: modalRetencion.retencionId,
          accion,
          sinPlanilla,
          motivo: motivoRechazoRet,
          usuario: adminUser?.usuario || 'Operador',
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d.error || 'Error al procesar la revisión');
      }
      if (accion === 'aprobar') {
        alert(`¡Comprobante de retención APROBADO exitosamente!${d.facturaEnviada ? '\n\nLa factura electrónica oficial completa ha sido enviada al correo del contribuyente.' : '\n\n' + (d.error || '')}`);
      } else {
        alert('Comprobante rechazado. Se ha notificado al contribuyente para que suba la corrección.');
      }
      setModalRetencion(null);
      setMotivoRechazoRet('');
      setModoRechazo(false);
      setModoSubirPlanilla(false);
      loadPagos();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcesandoRet(false);
    }
  };

  const handleGuardarPlanillaOperador = async (aprobarDirecto = false) => {
    if (!modalRetencion) return;
    if (!numComprobanteOp.trim() && !archivoPlanilla) {
      alert('Por favor ingrese al menos el número del comprobante o adjunte el archivo.');
      return;
    }
    setProcesandoRet(true);
    try {
      let uploadedUrl = modalRetencion.retencionPlanillaUrl || '';
      if (archivoPlanilla) {
        const ext = archivoPlanilla.name.split('.').pop() || 'pdf';
        const up = new FormData();
        up.append('file', archivoPlanilla);
        up.append('bucket', 'documentos');
        up.append('path', `retenciones/${modalRetencion.identidad.replace(/[^a-zA-Z0-9-]/g, '')}/OPERADOR_FAC-${modalRetencion.numeroDocumento || modalRetencion.id?.slice(0, 8)}_${Date.now()}.${ext}`);
        const r1 = await fetch('/api/upload', { method: 'POST', body: up });
        const j1 = await r1.json();
        if (!r1.ok || !j1.success) throw new Error('Error al subir el archivo: ' + (j1.error || 'Desconocido'));
        uploadedUrl = j1.publicUrl || '';
      }

      const res = await fetch('/api/admin/retenciones/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: modalRetencion.pagoId || modalRetencion.id,
          retencionId: modalRetencion.retencionId,
          accion: aprobarDirecto ? 'guardar_y_aprobar' : 'subir_planilla',
          planillaUrl: uploadedUrl,
          numeroComprobante: numComprobanteOp.trim(),
          fechaComprobante: fechaComprobanteOp || null,
          usuario: adminUser?.usuario || 'Operador',
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Error al guardar la planilla');
      
      if (aprobarDirecto) {
        alert(`¡Planilla guardada y factura APROBADA exitosamente!${d.facturaEnviada ? '\n\nLa factura electrónica oficial ha sido enviada al correo del contribuyente.' : '\n\n' + (d.error || '')}`);
        setModalRetencion(null);
      } else {
        alert('Comprobante de retención montado con éxito. Ahora se encuentra listo para revisión.');
        setModoSubirPlanilla(false);
      }
      loadPagos();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcesandoRet(false);
    }
  };

  // Día y tipo de documento (Facturas comerciales vs Recibos por correo)
  const [fecha, setFecha] = useState<string>(hoyCaracas());
  const [docTab, setDocTab] = useState<'factura' | 'recibo'>('factura');

  // Vista previa de recibo
  const [previewPagoId, setPreviewPagoId] = useState<string | null>(null);
  // Recibo de Caja (el mismo que se entrega al cobrar por débito) para descargar/reimprimir
  const [reciboCaja, setReciboCaja] = useState<{ pago: any; recibos: any[]; original: boolean } | null>(null);
  const [reciboCajaCargando, setReciboCajaCargando] = useState<string | null>(null);
  const abrirReciboCaja = async (pago: any) => {
    setReciboCajaCargando(pago.id);
    try {
      const r = await fetch(`/api/admin/recibos-caja?pagoId=${pago.id}`);
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo obtener el recibo');
      setReciboCaja({ pago, recibos: d.recibos || [], original: !!d.original });
    } catch (e: any) {
      alert('Error obteniendo el recibo: ' + e.message);
    } finally {
      setReciboCajaCargando(null);
    }
  };
  const descargarReciboCaja = () => {
    if (!reciboCaja) return;
    // El navegador ofrece "Guardar como PDF"; el nombre sugerido sale del título del documento
    const tituloPrevio = document.title;
    document.title = `Recibo_${reciboCaja.pago.identidad}_${String(reciboCaja.pago.referencia || reciboCaja.pago.id).replace(/[^A-Za-z0-9-]/g, '')}`;
    window.print();
    setTimeout(() => { document.title = tituloPrevio; }, 1000);
  };

  // ── Eliminar pago y devolver la deuda (solo administrador) ──
  const [adminUser, setAdminUser] = useState<any>(null);
  useEffect(() => { try { setAdminUser(JSON.parse(localStorage.getItem('admin_user_data') || 'null')); } catch {} }, []);
  const esAdmin = adminUser?.rol === 'Administrador' || adminUser?.usuario === 'dzara';
  const usr = String(adminUser?.usuario || '').toLowerCase();
  const cleanUsr = usr.includes('(') ? usr.split('(')[1].replace(')','').trim() : usr;
  const puedeAnular = esAdmin || cleanUsr === 'isamar' || cleanUsr === 'raquel';
  const puedeEditar = puedeAnular;

  const [eliminar, setEliminar] = useState<null | { pago: any; preview?: any; error?: string; cargando: boolean; motivo: string; hecho?: boolean }>(null);
  const pedirEliminar = async (pago: any) => {
    setEliminar({ pago, cargando: true, motivo: '' });
    try {
      const r = await fetch('/api/admin/factura-digital/eliminar-pago', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId: pago.id, usuario: adminUser?.usuario, confirmar: false }),
      });
      const d = await r.json();
      setEliminar({ pago, cargando: false, motivo: '', ...(r.ok ? { preview: d } : { error: d.error || 'No se pudo preparar la eliminación' }) });
    } catch (e: any) {
      setEliminar({ pago, cargando: false, motivo: '', error: e.message });
    }
  };
  const confirmarEliminar = async () => {
    if (!eliminar) return;
    setEliminar({ ...eliminar, cargando: true });
    try {
      const r = await fetch('/api/admin/factura-digital/eliminar-pago', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId: eliminar.pago.id, usuario: adminUser?.usuario, motivo: eliminar.motivo, confirmar: true }),
      });
      const d = await r.json();
      if (!r.ok) { setEliminar({ ...eliminar, cargando: false, error: d.error || 'No se pudo eliminar' }); return; }
      setEliminar({ ...eliminar, cargando: false, hecho: true, preview: d });
      loadPagos();
    } catch (e: any) {
      setEliminar({ ...eliminar, cargando: false, error: e.message });
    }
  };

  const [anularEstado, setAnularEstado] = useState<null | { pago: any; cargando: boolean; error?: string; hecho?: boolean; notaCreditoUrl?: string }>(null);
  const confirmarAnulacion = async () => {
    if (!anularEstado) return;
    if (!confirm('¿Está seguro que desea anular esta factura electrónica y generar una Nota de Crédito en The Factory HKA? Esto no se puede deshacer.')) return;
    setAnularEstado({ ...anularEstado, cargando: true });
    try {
      const pago = anularEstado.pago;
      let uActual = adminUser?.usuario || '';
      if (!uActual) {
        try { const u = JSON.parse(localStorage.getItem('admin_user_data') || 'null'); uActual = u?.usuario || 'Administrador'; } catch {}
      }
      const r = await fetch('/api/admin/factura-digital/anular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: pago.id,
          usuario: uActual || 'Administrador',
          contribuyente: pago.contribuyente,
          identidad: pago.identidad,
          numeroFactura: pago.numeroDocumento || pago.numeroControl,
          recibos: pago.recibos || [],
          montoTotal: pago.monto || pago.montoTotal,
          montos: pago.detalles?.montos || {},
          formasPago: pago.detalles?.formasPago || []
        }),
      });
      const d = await r.json();
      if (!r.ok || d.skipped) { 
        const errStr = d.error || d.message || 'No se pudo anular la factura';
        if (errStr.toLowerCase().includes('anulad') || confirm(`The Factory HKA reportó:\n"${errStr}"\n\n¿Desea marcar esta factura como anulada en el sistema (NC Manual) para que quede anulada como el Sambil y habilitar la reemisión limpia?`)) {
          const rf = await fetch('/api/admin/factura-digital/anular', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pagoId: pago.id,
              usuario: uActual || 'Administrador',
              forzarMarcadoAnulada: true
            }),
          });
          const df = await rf.json();
          if (df.success) {
            alert('Factura marcada como anulada en el sistema exitosamente (NC-MANUAL).');
          } else {
            alert(df.error || 'Error al forzar anulación');
          }
          setAnularEstado(null);
          loadPagos();
          return;
        }
        setAnularEstado({ ...anularEstado, cargando: false, error: errStr }); 
        return; 
      }
      setAnularEstado({ ...anularEstado, cargando: false, hecho: true, notaCreditoUrl: d.url });
      alert(d.yaAnuladaEnTfhka ? 'La factura ya estaba anulada en The Factory HKA y fue sincronizada en el sistema.' : 'Factura anulada correctamente (Nota de Crédito generada en The Factory HKA).');
      loadPagos();
    } catch (e: any) {
      setAnularEstado({ ...anularEstado, cargando: false, error: e.message });
    }
  };

  // Lote del día (revisión + envío)
  const [loteModal, setLoteModal] = useState<null | 'factura' | 'recibo'>(null);
  const [loteSeleccion, setLoteSeleccion] = useState<Set<string>>(new Set());
  // Selección en la tabla principal (para emitir/enviar solo las marcadas)
  const [selTabla, setSelTabla] = useState<Set<string>>(new Set());
  const [loteRunning, setLoteRunning] = useState(false);
  const [loteProgreso, setLoteProgreso] = useState<{ total: number; hechos: number; ok: number; fallidos: number } | null>(null);
  const [loteResultados, setLoteResultados] = useState<any[]>([]);

  // Configuración y Estado de The Factory HKA
  const [tfhkaConfig, setTfhkaConfig] = useState<any>(null);
  const [isCheckingTfhka, setIsCheckingTfhka] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Modal de Verificación y Auditoría Previa
  const [selectedPagoForVerify, setSelectedPagoForVerify] = useState<any | null>(null);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Modal de Demo y Vista Previa de Factura Electrónica (Borrador Fiscal)
  const [selectedPagoForDemo, setSelectedPagoForDemo] = useState<any | null>(null);

  // Modal de Ajuste y Emisión Manual Individual
  const [selectedPagoForEmit, setSelectedPagoForEmit] = useState<any | null>(null);
  const [ajusteMontoServicio, setAjusteMontoServicio] = useState<string>('');
  const [ajusteMontoMulta, setAjusteMontoMulta] = useState<string>('0');
  // Total editado a mano en la verificación (con IVA) y motivo del ajuste
  const [totalEditado, setTotalEditado] = useState<string>('');
  const [motivoAjuste, setMotivoAjuste] = useState<string>('');
  const [totalForzado, setTotalForzado] = useState<number | null>(null);
  // Total de referencia (el real de la factura según la verificación; si no hubo verificación, lo cobrado)
  const [totalReferencia, setTotalReferencia] = useState<number>(0);
  const [ajusteConcepto, setAjusteConcepto] = useState<string>('');
  const [isEmitting, setIsEmitting] = useState(false);
  const [enviarCorreoAlEmitir, setEnviarCorreoAlEmitir] = useState(true);
  const [correoDestinoEmision, setCorreoDestinoEmision] = useState('');

  // Campos editables del pago dentro de la emisión individual
  const [emitContribuyente, setEmitContribuyente] = useState('');
  const [emitIdentidad, setEmitIdentidad] = useState('');
  const [emitReferencia, setEmitReferencia] = useState('');
  const [emitModulo, setEmitModulo] = useState('caja');
  const [emitEsRetencion, setEmitEsRetencion] = useState(false);

  // Modal de Edición de Datos Fiscales del Pago (monto, retención, nombre, cédula/RIF, referencia, caja)
  const [pagoAEditar, setPagoAEditar] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    contribuyente: '',
    identidad: '',
    monto: '',
    referencia: '',
    fecha: '',
    concepto: '',
    esRetencion: false,
    modulo: 'caja',
    marcarAnulada: false
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Modal de Emisión Masiva / Lote
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ total: number; procesados: number; emitidos: number; fallidos: number } | null>(null);
  const [batchResults, setBatchResults] = useState<any[]>([]);

  // Modal de Reenvío de Correo
  const [selectedPagoForEmail, setSelectedPagoForEmail] = useState<any | null>(null);
  const [customEmailDestino, setCustomEmailDestino] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);

  // Cargar configuración de The Factory HKA
  const loadConfig = useCallback(async () => {
    setIsCheckingTfhka(true);
    try {
      const res = await fetch('/api/admin/factura-digital/config');
      const data = await res.json();
      if (data.success) {
        setTfhkaConfig(data);
      }
    } catch (e: any) {
      console.warn('No se pudo cargar la configuración de The Factory HKA:', e);
    } finally {
      setIsCheckingTfhka(false);
    }
  }, []);

  // Carga de pagos desde la API
  const loadPagos = useCallback(async () => {
    setIsLoading(true);
    try {
      // Se cargan todos los pagos del día; las pestañas filtran en el cliente
      const res = await fetch(`/api/admin/factura-digital/listar?filter=todos&fecha=${fecha}&q=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      if (data.success) {
        const items = data.items || [];
        setPagosList(items);

        if (typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search);
          const demoTarget = sp.get('demo') || sp.get('demoId') || sp.get('pagoId');
          if (demoTarget) {
            const found = items.find((p: any) => 
              p.id === demoTarget || 
              p.referencia === demoTarget || 
              (p.identidad && p.identidad.toLowerCase().includes(demoTarget.toLowerCase())) ||
              (p.contribuyente && p.contribuyente.toLowerCase().includes(demoTarget.toLowerCase()))
            );
            if (found) {
              setSelectedPagoForDemo(found);
            }
          }
        }
      }
    } catch (e: any) {
      console.error('Error cargando pagos para facturación digital:', e);
    } finally {
      setIsLoading(false);
    }
  }, [fecha, searchTerm]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadPagos();
  }, [loadPagos]);
  // Al cambiar de día o de tipo, se limpia la selección de la tabla
  useEffect(() => { setSelTabla(new Set()); }, [fecha, docTab]);

  // Filtro por módulo (Contribuyentes / Condominios)
  const pasaModulo = (p: any) => moduloFiltro === 'Todos' ? true
    : moduloFiltro === 'Contribuyentes' ? !p.condominio
    : moduloFiltro === 'Condominios' ? !!p.condominio
    : moduloFiltro === 'Condominios residenciales' ? p.condominio?.residencial === true
    : p.condominio?.residencial === false;
  // Separación del día: facturas (todo lo comercial: servicio y multas) y recibos (solo residenciales)
  const facturasDia = pagosList.filter(p => p.documento === 'factura' && pasaModulo(p));
  const recibosDia = pagosList.filter(p => p.documento === 'recibo' && pasaModulo(p));
  const retencionesDia = pagosList.filter(p => p.conRetencion && pasaModulo(p));
  const retencionesPorRevisarCount = retencionesDia.filter(p => p.retencionEstado === 'planilla_recibida').length;
  
  const anuladasDia = (docTab === 'factura' ? facturasDia : recibosDia).filter(p => p.facturaAnulada || p.notaCredito || p.estado === 'Anulado');
  const totalAnuladas = anuladasDia.length;

  const delTipo = filterTab === 'retenciones' 
    ? retencionesDia 
    : filterTab === 'anuladas'
    ? anuladasDia
    : (docTab === 'factura' ? facturasDia : recibosDia);

  const visibles = filterTab === 'retenciones'
    ? retencionesDia
    : filterTab === 'anuladas'
    ? anuladasDia
    : delTipo.filter(p => {
        const esAnulada = p.facturaAnulada || p.notaCredito || p.estado === 'Anulado';
        if (filterTab === 'pendientes') return !p.procesado && !esAnulada;
        if (filterTab === 'emitidas') return p.procesado && !esAnulada;
        return true;
      });

  const totalPendientes = (docTab === 'factura' ? facturasDia : recibosDia).filter(p => !p.procesado && !p.facturaAnulada && p.estado !== 'Anulado').length;
  const totalEmitidas = (docTab === 'factura' ? facturasDia : recibosDia).filter(p => p.procesado && !p.facturaAnulada && p.estado !== 'Anulado').length;
  const resumen = (lista: any[]) => ({
    total: lista.length,
    pendientes: lista.filter(p => !p.procesado).length,
    procesados: lista.filter(p => p.procesado).length,
    monto: lista.reduce((s, p) => s + (p.monto || 0), 0),
  });
  const resFact = resumen(facturasDia);
  const resRec = resumen(recibosDia);

  // Abrir revisión de lote del día (todas las pendientes seleccionadas por defecto)
  const abrirLote = (tipo: 'factura' | 'recibo') => {
    const pend = (tipo === 'factura' ? facturasDia : recibosDia).filter(p => !p.procesado);
    setLoteSeleccion(new Set(pend.map(p => p.id)));
    setLoteProgreso(null);
    setLoteResultados([]);
    setLoteModal(tipo);
  };

  // Ejecutar lote: facturas una a una (documento fiscal secuencial) y recibos en bloques de 10
  const ejecutarLote = async () => {
    if (!loteModal) return;
    const items = pagosList.filter(p => loteSeleccion.has(p.id) && p.documento === loteModal && !p.procesado);
    if (items.length === 0) return;
    if (loteModal === 'factura' && !confirm(`Se emitirán ${items.length} facturas fiscales reales ante The Factory HKA (SENIAT). ¿Continuar?`)) return;
    setLoteRunning(true);
    const res: any[] = [];
    let ok = 0, fallidos = 0;
    setLoteProgreso({ total: items.length, hechos: 0, ok: 0, fallidos: 0 });
    try {
      if (loteModal === 'factura') {
        for (const p of items) {
          try {
            const r = await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: p.id, recibos: p.recibos, contribuyente: p.contribuyente,
                identidad: p.identidad, montoTotal: p.monto, enviarCorreo: true
              })
            });
            const d = await r.json();
            if (d.success && !d.skipped) { ok++; res.push({ ...p, resultado: 'EMITIDA', detalle: d.numeroControl || '' }); }
            else if (d.success && d.skipped) { fallidos++; res.push({ ...p, resultado: 'OMITIDA', detalle: d.message }); }
            else { fallidos++; res.push({ ...p, resultado: 'ERROR', detalle: d.error || 'Error de emisión' }); }
          } catch (e: any) { fallidos++; res.push({ ...p, resultado: 'ERROR', detalle: e.message }); }
          setLoteProgreso({ total: items.length, hechos: res.length, ok, fallidos });
        }
      } else {
        for (let i = 0; i < items.length; i += 10) {
          const bloque = items.slice(i, i + 10);
          try {
            const r = await fetch('/api/admin/recibos-digitales/enviar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pagoIds: bloque.map(p => p.id) })
            });
            const d = await r.json();
            bloque.forEach(p => {
              const it = (d.items || []).find((x: any) => x.pagoId === p.id);
              if (it?.ok) { ok++; res.push({ ...p, resultado: 'ENVIADO', detalle: it.correo ? `a ${it.correo}` : 'solo copia de archivo (sin correo)' }); }
              else { fallidos++; res.push({ ...p, resultado: 'ERROR', detalle: it?.omitido || it?.error || d.error || 'No enviado' }); }
            });
          } catch (e: any) {
            bloque.forEach(p => { fallidos++; res.push({ ...p, resultado: 'ERROR', detalle: e.message }); });
          }
          setLoteProgreso({ total: items.length, hechos: res.length, ok, fallidos });
        }
      }
    } finally {
      setLoteResultados(res);
      setLoteRunning(false);
      loadPagos();
    }
  };

  // Enviar / reenviar un recibo individual
  const enviarReciboIndividual = async (pago: any) => {
    if (!confirm(`¿Enviar el recibo de ${pago.contribuyente} (${pago.identidad}) por Bs ${fmtBs(pago.monto)}?`)) return;
    try {
      const r = await fetch('/api/admin/recibos-digitales/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoIds: [pago.id] })
      });
      const d = await r.json();
      const it = d.items?.[0];
      alert(it?.ok ? `Recibo enviado ${it.correo ? 'a ' + it.correo : '(solo copia de archivo: el contribuyente no tiene correo)'}` : `No se pudo enviar: ${it?.omitido || it?.error || d.error}`);
      loadPagos();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  // 1. Abrir Modal de Verificación y Auditoría Previa
  const handleVerifyPago = async (pago: any) => {
    setSelectedPagoForVerify(pago);
    setIsVerifying(true);
    setVerificationResult(null);
    setTotalEditado('');
    setMotivoAjuste('');

    try {
      const res = await fetch('/api/admin/factura-digital/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: pago.pagoId || pago.id,
          identidad: pago.identidad,
          contribuyente: pago.contribuyente,
          monto: pago.monto,
          recibos: pago.recibos
        })
      });

      const data = await res.json();
      setVerificationResult(data);
    } catch (e: any) {
      setVerificationResult({
        ok: false,
        errores: ['Error al contactar con el verificador: ' + e.message]
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // 2. Abrir Modal de Emisión Manual
  const handleOpenEmitModal = (pago: any, totalOverride?: number, totalRef?: number) => {
    setSelectedPagoForEmit(pago);
    setEmitContribuyente(pago.contribuyente || pago.detalles?.contribuyente || '');
    setEmitIdentidad(pago.identidad || '');
    setEmitReferencia(pago.referencia && pago.referencia !== 'N/A' ? pago.referencia : '');
    setEmitModulo(pago.modulo || (pago.condominio ? 'condominios' : 'caja'));
    const esRet = !!(pago.esRetencion || pago.conRetencion || pago.detalles?.es_retencion || pago.detalles?.agente_retencion || (parseFloat(String(pago.montoRetencion || pago.detalles?.monto_retencion_iva || pago.detalles?.retencion_iva || 0)) > 0));
    setEmitEsRetencion(esRet);
    let montoRet = parseFloat(String(pago.montoRetencion || pago.detalles?.monto_retencion_iva || pago.detalles?.retencion_iva || 0)) || 0;
    
    // Obtener suma de recibos si existe desglose en detalles
    const montosMap = pago.detalles?.montos;
    let sumRecibos = 0;
    if (montosMap && typeof montosMap === 'object') {
      sumRecibos = Object.values(montosMap).reduce((acc: number, val: any) => acc + (parseFloat(String(val)) || 0), 0);
    }

    const montoFacturaDet = parseFloat(String(pago.detalles?.monto_factura || 0)) || sumRecibos || 0;
    let saldoFavor = parseFloat(String(pago.detalles?.saldo_a_favor_nuevo || pago.detalles?.monto_sobrante || pago.detalles?.saldo_favor || pago.detalles?.saldo_favor_generado || 0)) || 0;
    
    // Si el saldo a favor coincide con la retención, era la retención y no un saldo a favor / nota de crédito
    if (esRet && Math.abs(saldoFavor - montoRet) < 0.05) {
      saldoFavor = 0;
    }

    // Si pagaron por encima, el monto de la factura NO debe incluir el saldo a favor / sobrante
    const netoTransferido = (() => {
      if (Array.isArray(pago.detalles?.pagos_agregados) && pago.detalles.pagos_agregados.length > 0) {
        return pago.detalles.pagos_agregados
          .filter((p: any) => !String(p?.metodo || p?.tipo || '').toLowerCase().includes('saldo a favor') && !String(p?.metodo || p?.tipo || '').toLowerCase().includes('nota de credito'))
          .reduce((s: number, p: any) => s + (parseFloat(String(p?.monto || 0)) || 0), 0);
      }
      return parseFloat(String(pago.montoPagado || pago.monto || 0)) || 0;
    })();
    const montoPagoNeto = Math.max(0, netoTransferido - saldoFavor);
    let ref = totalRef && totalRef > 0 ? totalRef : 0;
    if (!ref) {
      if (pago.detalles?.monto_factura && parseFloat(String(pago.detalles.monto_factura)) > 0) {
        ref = parseFloat(String(pago.detalles.monto_factura));
      } else if (esRet) {
        const totalSel = parseFloat(String(pago.detalles?.total_seleccionado || 0));
        const deudaSis = parseFloat(String(pago.detalles?.deuda_total_sistema || 0));
        const montoNetoDet = parseFloat(String(pago.detalles?.monto_neto_factura || montoFacturaDet || 0));
        if (totalSel > 0) {
          ref = totalSel;
        } else if (deudaSis > 0) {
          ref = deudaSis;
        } else if (montoNetoDet > 0 && montoRet > 0) {
          ref = montoNetoDet + montoRet;
        } else if (montoRet > 0) {
          ref = montoPagoNeto + montoRet;
        } else if (montoPagoNeto > 0) {
          ref = Math.round((montoPagoNeto * (1.16 / 1.04)) * 100) / 100;
        }
      } else if (montoFacturaDet > 0) {
        ref = montoFacturaDet;
      } else if (netoTransferido > 0) {
        ref = Math.max(0, netoTransferido - saldoFavor);
      }
    }
    ref = Math.round(ref * 100) / 100;
    setTotalReferencia(ref);
    const montoTotal = totalOverride && totalOverride > 0 ? totalOverride : ref;
    let exentoRecibo = 0;
    if (pago.detalles?.recibo_caja) {
      try {
        const rc = typeof pago.detalles.recibo_caja === 'string' ? JSON.parse(pago.detalles.recibo_caja) : pago.detalles.recibo_caja;
        if (Array.isArray(rc)) {
          exentoRecibo = rc.reduce((acc: number, r: any) => acc + (parseFloat(String(r.exento || 0)) || 0), 0);
        }
      } catch (_) {}
    }
    if (exentoRecibo === 0) {
      exentoRecibo = parseFloat(String(pago.detalles?.multa_bs || pago.detalles?.montos?.multa || 0)) || 0;
    }
    const montoGravado = Math.max(0, montoTotal - exentoRecibo);
    const baseEstimada = (montoGravado / 1.16).toFixed(2);
    setAjusteMontoServicio(baseEstimada);
    setAjusteMontoMulta(exentoRecibo > 0 ? exentoRecibo.toFixed(2) : '0.00');
    if (!totalOverride) setMotivoAjuste('');
    setTotalForzado(totalOverride && totalOverride > 0 ? totalOverride : null);

    const conceptoPeriodo = resolverConceptoPeriodoPago(pago);
    setAjusteConcepto(conceptoPeriodo);
    setCorreoDestinoEmision(pago.correo || tfhkaConfig?.config?.fallbackEmail || 'facturacion.naguanagua@gmail.com');
    setEnviarCorreoAlEmitir(true);
  };

  // Abrir Modal de Edición Directa de Datos Fiscales
  const handleOpenEditModal = (pago: any) => {
    setPagoAEditar(pago);
    const fOrig = (pago.detalles?.fecha_transaccion || pago.created_at || pago.fecha || '').slice(0, 10);
    const conceptoOrig = pago.detalles?.concepto || pago.detalles?.mes_aseo || pago.detalles?.detalle || '';
    setEditForm({
      contribuyente: pago.contribuyente || pago.detalles?.contribuyente || '',
      identidad: pago.identidad || '',
      monto: String(pago.monto || ''),
      referencia: pago.referencia && pago.referencia !== 'N/A' ? pago.referencia : '',
      fecha: fOrig || hoyCaracas(),
      concepto: conceptoOrig,
      esRetencion: !!(pago.esRetencion || pago.conRetencion || pago.detalles?.es_retencion || pago.detalles?.agente_retencion),
      modulo: pago.modulo || (pago.condominio ? 'condominios' : 'caja'),
      marcarAnulada: false
    });
  };

  // Guardar Edición Directa de Datos Fiscales
  const handleGuardarEdicion = async () => {
    if (!pagoAEditar) return;
    if (!editForm.identidad.trim()) {
      alert('Debe ingresar la cédula o RIF.');
      return;
    }
    if (!editForm.contribuyente.trim()) {
      alert('Debe ingresar el nombre o razón social.');
      return;
    }
    const mNum = parseFloat(editForm.monto);
    if (isNaN(mNum) || mNum <= 0) {
      alert('Debe ingresar un monto válido mayor a 0.');
      return;
    }

    setGuardandoEdicion(true);
    try {
      let usuarioActual = adminUser?.usuario || '';
      if (!usuarioActual) {
        try {
          const u = JSON.parse(localStorage.getItem('admin_user_data') || 'null');
          usuarioActual = u ? u.usuario : '';
        } catch {}
      }
      const res = await fetch('/api/admin/factura-digital/editar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: pagoAEditar.pagoId || pagoAEditar.id,
          identidad: editForm.identidad.trim().toUpperCase(),
          contribuyente: editForm.contribuyente.trim(),
          monto: mNum,
          referencia: editForm.referencia.trim(),
          esRetencion: editForm.esRetencion,
          modulo: editForm.modulo,
          fecha: editForm.fecha,
          concepto: editForm.concepto,
          marcarAnulada: editForm.marcarAnulada,
          usuario: usuarioActual || 'Administrador'
        })
      });

      const data = await res.json();
      if (!res.ok || (!data.success && !data.ok)) {
        throw new Error(data.error || 'No se pudo guardar la edición del pago');
      }

      alert('¡Datos fiscales del pago actualizados exitosamente!');
      setPagoAEditar(null);
      loadPagos();
    } catch (e: any) {
      alert('Error al guardar cambios: ' + e.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // 3. Ejecutar Emisión Manual Individual
  const handleConfirmarEmision = async () => {
    if (!selectedPagoForEmit) return;
    setIsEmitting(true);
    try {
      const base = parseFloat(ajusteMontoServicio) || 0;
      const multa = parseFloat(ajusteMontoMulta) || 0;
      const iva = parseFloat((base * 0.16).toFixed(2));
      let total = parseFloat((base + multa + iva).toFixed(2));
      // Total escrito en la verificación: si no se tocaron base/multa, se usa EXACTO (sin desvío por redondeo)
      if ((totalForzado || totalReferencia) && multa === 0 && !totalForzado && Math.abs(base - parseFloat((totalReferencia / 1.16).toFixed(2))) < 0.005) total = totalReferencia;
      if (totalForzado && multa === 0 && Math.abs(base - parseFloat((totalForzado / 1.16).toFixed(2))) < 0.005) total = totalForzado;
      // Si el total difiere de lo cobrado, la factura se emite con ESTE total (requiere motivo)
      const editado = Math.abs(total - (totalReferencia || parseFloat(selectedPagoForEmit.monto) || 0)) > 0.02; // 0,02: redondeo base×1,16
      if (editado && motivoAjuste.trim().length < 5) {
        alert('El total de la factura es distinto a lo cobrado en Caja. Escriba el motivo del ajuste.');
        setIsEmitting(false);
        return;
      }
      let usuarioActual = '';
      try { const u = JSON.parse(localStorage.getItem('admin_user_data') || 'null'); usuarioActual = u ? `${u.nombre || u.usuario} (${u.usuario})` : ''; } catch {}

      const res = await fetch('/api/admin/factura-digital/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: selectedPagoForEmit.pagoId || selectedPagoForEmit.id,
          recibos: selectedPagoForEmit.recibos && selectedPagoForEmit.recibos.length > 0 
            ? selectedPagoForEmit.recibos 
            : [`REC-${(selectedPagoForEmit.pagoId || '').slice(0, 6)}`],
          montos: { servicio: base, multa, total },
          montoTotal: total,
          montoServicio: base,
          montoMulta: multa,
          concepto: ajusteConcepto,
          contribuyente: emitContribuyente.trim(),
          identidad: emitIdentidad.trim().toUpperCase(),
          referencia: emitReferencia.trim(),
          modulo: emitModulo,
          esRetencion: emitEsRetencion,
          fecha: selectedPagoForEmit.fechaPago || selectedPagoForEmit.created_at || new Date().toISOString(),
          formasPago: [{
            descripcion: selectedPagoForEmit.tipo || 'Transferencia',
            fecha: selectedPagoForEmit.fechaPago || selectedPagoForEmit.created_at || new Date().toISOString(),
            forma: '05',
            monto: total
          }],
          enviarCorreo: enviarCorreoAlEmitir,
          correoDestino: correoDestinoEmision,
          ...(editado ? { totalManual: total, motivoAjuste: motivoAjuste.trim(), usuario: usuarioActual } : {})
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.skipped) {
          alert(`Aviso: ${data.message || 'Exento de factura fiscal comercial'}`);
        } else if (data.yaEmitida) {
          alert(`Aviso: Este pago ya tenía asignada la Factura Fiscal Digital N° Control: ${data.numeroControl}.\n\nNo se generó una factura nueva en The Factory HKA.`);
        } else {
          alert(`¡Factura Digital emitida exitosamente!\nNúmero de Control: ${data.numeroControl || 'Generado'}\nSe envió copia al cliente y al archivo fiscal interno.`);
        }
        setSelectedPagoForEmit(null);
        if (selectedPagoForVerify) setSelectedPagoForVerify(null);
        loadPagos();
      } else {
        alert('Error al emitir factura: ' + (data.error || 'Respuesta no válida de The Factory HKA'));
      }
    } catch (e: any) {
      alert('Error en conexión con el servicio de facturación: ' + e.message);
    } finally {
      setIsEmitting(false);
    }
  };

  // 4. Ejecutar Emisión Masiva / Lote
  const handleIniciarEmisionLote = async () => {
    setIsBatchRunning(true);
    setBatchResults([]);
    try {
      const res = await fetch('/api/admin/factura-digital/emitir-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soloComerciales: true })
      });

      const data = await res.json();
      if (data.success) {
        setBatchProgress({
          total: data.total || 0,
          procesados: data.procesados || 0,
          emitidos: data.emitidos || 0,
          fallidos: data.fallidos || 0
        });
        setBatchResults(data.items || []);
        loadPagos();
      } else {
        alert('Error al procesar emisión por lote: ' + (data.error || 'Error desconocido'));
      }
    } catch (e: any) {
      alert('Fallo de conexión al emitir lote: ' + e.message);
    } finally {
      setIsBatchRunning(false);
    }
  };

  // 5. Reenviar Correo de Factura Emitida
  const handleReenviarCorreo = async () => {
    if (!selectedPagoForEmail) return;
    setIsSendingEmail(true);
    setEmailSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/factura-digital/reenviar-correo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagoId: selectedPagoForEmail.pagoId || selectedPagoForEmail.id,
          correoDestino: customEmailDestino,
          facturaUrl: selectedPagoForEmail.facturaUrl,
          numeroControl: selectedPagoForEmail.numeroControl || 'N/A',
          contribuyente: selectedPagoForEmail.contribuyente,
          identidad: selectedPagoForEmail.identidad,
          monto: selectedPagoForEmail.monto,
          fecha: selectedPagoForEmail.created_at
        })
      });

      const data = await res.json();
      if (data.success && data.correoEnviado) {
        setEmailSuccessMsg(`Factura enviada exitosamente a ${customEmailDestino} y copia de archivo`);
        setTimeout(() => {
          setSelectedPagoForEmail(null);
          setEmailSuccessMsg(null);
        }, 2200);
      } else {
        alert(data.mensaje || 'Aviso: No se pudo entregar el correo.');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const backupEmail = tfhkaConfig?.config?.backupEmail || 'facturacion.naguanagua@gmail.com';
  const fallbackEmail = tfhkaConfig?.config?.fallbackEmail || 'facturacion.naguanagua@gmail.com';
  const isTfhkaOk = tfhkaConfig?.connectionStatus?.ok;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ══ HEADER PRINCIPAL ══ */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                Facturación Fiscal Digital (The Factory HKA / SENIAT)
              </h1>
              {isTfhkaOk ? (
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full border border-emerald-300 flex items-center gap-1.5 shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  The Factory HKA Conectado
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full border border-amber-300 flex items-center gap-1.5 shadow-xs">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Listo para Credenciales
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              Emisión oficial de facturas fiscales electrónicas autorizadas por el SENIAT. Incluye verificación previa de datos, auditoría antes del envío, emisión masiva por lote y <strong>copia automática de archivo fiscal sin costo adicional</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
              <span className="bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-indigo-500" />
                Copia Interna Fiscal: <strong className="text-slate-700">{backupEmail}</strong> (Sin costo TFHKA)
              </span>
              <span className="bg-amber-50 text-amber-900 px-2.5 py-1 rounded-md border border-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Correo Comodín Asignado: <strong className="text-amber-800">{fallbackEmail}</strong> (Exige actualización)
              </span>
            </div>
          </div>

          {/* BOTONES DE ACCIÓN PRINCIPALES */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Botón Verificar Facturación */}
            <button
              onClick={() => {
                if (pagosList.length > 0) {
                  handleVerifyPago(pagosList[0]);
                } else {
                  alert('No hay facturas cargadas para verificar.');
                }
              }}
              className="px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              title="Auditar y validar los datos fiscales antes de enviar al SENIAT"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>Verificar Facturación</span>
            </button>

            {/* Botón Revisar y enviar el lote del día (del tipo seleccionado) */}
            <button
              id="btn-lote-dia"
              onClick={() => abrirLote(docTab)}
              disabled={totalPendientes === 0}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={docTab === 'factura' ? 'Revisar y emitir las facturas comerciales pendientes del día' : 'Revisar y enviar por correo los recibos pendientes del día'}
            >
              <Layers className="w-4 h-4 text-[#c8e64c]" />
              <span>{docTab === 'factura' ? `Emitir facturas del día (${totalPendientes})` : `Enviar recibos del día (${totalPendientes})`}</span>
            </button>

            {/* Emitir / enviar solo las seleccionadas en la tabla */}
            {(() => {
              const n = delTipo.filter((p: any) => !p.procesado && selTabla.has(p.id)).length;
              return n > 0 ? (
                <button id="btn-emitir-seleccionadas" onClick={() => {
                  setLoteSeleccion(new Set(delTipo.filter((p: any) => !p.procesado && selTabla.has(p.id)).map((p: any) => p.id)));
                  setLoteProgreso(null); setLoteResultados([]); setLoteModal(docTab);
                }} className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-extrabold text-xs flex items-center gap-2 shadow-md cursor-pointer">
                  <CheckSquare className="w-4 h-4" /> {docTab === 'factura' ? `Emitir seleccionadas (${n})` : `Enviar seleccionados (${n})`}
                </button>
              ) : null;
            })()}

            {/* Botón Credenciales The Factory */}
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Configuración de credenciales de The Factory HKA"
            >
              <Key className="w-3.5 h-3.5 text-slate-500" />
              <span>Credenciales</span>
            </button>

            {/* Botón Sincronizar */}
            <button
              onClick={loadPagos}
              disabled={isLoading}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              title="Recargar pagos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ══ DÍA Y SEPARACIÓN FACTURAS / RECIBOS ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_1fr] gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-center gap-2 min-w-[220px]">
          <label htmlFor="fecha-lote" className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Día de cobro</label>
          <input
            id="fecha-lote"
            type="date"
            value={fecha}
            max={hoyCaracas()}
            onChange={e => e.target.value && setFecha(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => { const d = new Date(`${fecha}T12:00:00-04:00`); d.setDate(d.getDate() - 1); setFecha(d.toISOString().slice(0, 10)); }}
              className="flex-1 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer"
            >← Anterior</button>
            <button
              onClick={() => setFecha(hoyCaracas())}
              className="flex-1 text-[11px] font-bold px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer"
            >Hoy</button>
          </div>
        </div>

        {/* Tarjeta FACTURAS */}
        <button
          id="tab-facturas"
          onClick={() => setDocTab('factura')}
          className={`text-left rounded-2xl p-4 border-2 transition-all cursor-pointer ${docTab === 'factura' ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-slate-200 hover:border-blue-300'}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="font-black text-slate-800 text-sm">FACTURAS FISCALES</span>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">The Factory HKA</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Comerciales: servicio de aseo (con IVA) y multas (exentas), incluso locales de condominio que solo pagan multa</p>
          <div className="flex items-end justify-between mt-3">
            <div className="text-xs text-slate-600 space-x-3">
              <span><strong className="text-amber-700 text-base">{resFact.pendientes}</strong> pendientes</span>
              <span><strong className="text-emerald-700 text-base">{resFact.procesados}</strong> emitidas</span>
            </div>
            <span className="font-mono font-black text-slate-900">Bs {fmtBs(resFact.monto)}</span>
          </div>
        </button>

        {/* Tarjeta RECIBOS */}
        <button
          id="tab-recibos"
          onClick={() => setDocTab('recibo')}
          className={`text-left rounded-2xl p-4 border-2 transition-all cursor-pointer ${docTab === 'recibo' ? 'bg-violet-50 border-violet-500 shadow-md' : 'bg-white border-slate-200 hover:border-violet-300'}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-violet-600" />
              <span className="font-black text-slate-800 text-sm">RECIBOS POR CORREO</span>
            </div>
            <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">No fiscal</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Solo residenciales (servicio y multas)</p>
          <div className="flex items-end justify-between mt-3">
            <div className="text-xs text-slate-600 space-x-3">
              <span><strong className="text-amber-700 text-base">{resRec.pendientes}</strong> pendientes</span>
              <span><strong className="text-emerald-700 text-base">{resRec.procesados}</strong> enviados</span>
            </div>
            <span className="font-mono font-black text-slate-900">Bs {fmtBs(resRec.monto)}</span>
          </div>
        </button>
      </div>

      {/* ══ BARRA DE FILTROS Y BÚSQUEDA ══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/70">
          {/* Pestañas de Estado */}
          <div className="flex bg-slate-200/80 p-1 rounded-xl">
            <button
              onClick={() => setFilterTab('pendientes')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTab === 'pendientes' 
                  ? 'bg-white text-slate-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendientes ({totalPendientes})
            </button>
            <button
              onClick={() => setFilterTab('emitidas')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTab === 'emitidas' 
                  ? 'bg-white text-emerald-800 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {docTab === 'factura' ? `Emitidas SENIAT (${totalEmitidas})` : `Enviados por correo (${totalEmitidas})`}
            </button>
            <button
              onClick={() => setFilterTab('anuladas')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'anuladas' 
                  ? 'bg-rose-600 text-white shadow-xs' 
                  : 'text-rose-800 hover:text-rose-950 hover:bg-rose-100/60'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span>Anuladas (NC)</span>
              {totalAnuladas > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] font-black rounded-full shadow-xs ${filterTab === 'anuladas' ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-800'}`}>
                  {totalAnuladas}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterTab('retenciones')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'retenciones' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'text-amber-800 hover:text-amber-950 hover:bg-amber-100/60'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Retenciones por revisar</span>
              {retencionesPorRevisarCount > 0 && (
                <span className="px-1.5 py-0.2 bg-white text-amber-700 text-[10px] font-black rounded-full shadow-xs animate-pulse">
                  {retencionesPorRevisarCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterTab('todos')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTab === 'todos' 
                  ? 'bg-white text-slate-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {docTab === 'factura' ? `Todas las facturas (${facturasDia.length})` : `Todos los recibos (${recibosDia.length})`}
            </button>
          </div>

          {/* Módulo */}
          <select id="filtro-modulo-facturacion" value={moduloFiltro} onChange={e => setModuloFiltro(e.target.value)}
            className="px-3 py-2 border border-emerald-300 bg-emerald-50/50 rounded-xl text-xs font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {['Todos', 'Contribuyentes', 'Condominios', 'Condominios residenciales', 'Condominios comerciales'].map(x => <option key={x}>{x === 'Todos' ? 'Módulo: Todos' : x}</option>)}
          </select>

          {/* Buscador */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por Cédula, RIF, Nombre o Nro Control..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>
        </div>

        {/* ══ TABLA DE FACTURAS / PAGOS ══ */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/80 text-[11px] uppercase font-black text-slate-600 border-b border-slate-200 tracking-wider">
              <tr>
                <th className="py-3.5 pl-4 w-8">
                  {(() => {
                    const pend = visibles.filter((p: any) => !p.procesado);
                    const todos = pend.length > 0 && pend.every((p: any) => selTabla.has(p.id));
                    return (
                      <input id="seleccionar-todas" type="checkbox" title="Seleccionar todas las pendientes" checked={todos} disabled={pend.length === 0}
                        onChange={() => setSelTabla(todos ? new Set() : new Set(pend.map((p: any) => p.id)))} className="w-4 h-4 cursor-pointer accent-emerald-600" />
                    );
                  })()}
                </th>
                <th className="py-3.5 px-4">C.I. / R.I.F.</th>
                <th className="py-3.5 px-4">Contribuyente / Razón Social</th>
                <th className="py-3.5 px-4">Documento</th>
                <th className="py-3.5 px-4">Correo Destino</th>
                <th className="py-3.5 px-4">Monto Pagado</th>
                <th className="py-3.5 px-4">Fecha Pago</th>
                <th className="py-3.5 px-4">{docTab === 'factura' ? 'Estado Fiscal' : 'Estado Envío'}</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-14 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    Cargando listado de facturas y pagos...
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-14 text-slate-400">
                    No hay {docTab === 'factura' ? 'facturas' : 'recibos'} con los filtros seleccionados para el {fecha.split('-').reverse().join('/')}.
                  </td>
                </tr>
              ) : (
                visibles.map((pago: any) => {
                  const sub = SUBTIPO_LABEL[pago.subtipo] || SUBTIPO_LABEL.recibo_residencial;
                  return (
                    <tr key={pago.id} className={`hover:bg-slate-50/80 transition-colors ${selTabla.has(pago.id) ? 'bg-emerald-50/60' : ''}`}>
                      <td className="py-3.5 pl-4">
                        {!pago.procesado && (
                          <input type="checkbox" checked={selTabla.has(pago.id)} onChange={() => { const s = new Set(selTabla); if (s.has(pago.id)) s.delete(pago.id); else s.add(pago.id); setSelTabla(s); }}
                            className="w-4 h-4 cursor-pointer accent-emerald-600" />
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {pago.identidad}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800 text-[13px] block">{pago.contribuyente}</span>
                        {pago.referencia && (
                          <span className="text-[10px] text-slate-400 font-mono">Ref: {pago.referencia}</span>
                        )}
                        {(pago.detalles?.concepto || pago.detalles?.mes_aseo || pago.detalles?.detalle) && (
                          <span className="block text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 mt-0.5 max-w-[280px] truncate" title={pago.detalles?.concepto || pago.detalles?.mes_aseo || pago.detalles?.detalle}>
                            📝 {pago.detalles?.concepto || pago.detalles?.mes_aseo || pago.detalles?.detalle}
                          </span>
                        )}
                        {pago.inmuebles?.length > 0 && (
                          <span className="block text-[10px] text-slate-400 font-mono">{pago.inmuebles.slice(0, 6).join(', ')}{pago.inmuebles.length > 6 ? ` +${pago.inmuebles.length - 6}` : ''}</span>
                        )}
                        {pago.condominio && (
                          <span className="flex flex-wrap gap-1 mt-1">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-600 text-white" title={pago.condominio.codigo || ''}>CONDOMINIO · {pago.condominio.nombre}</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${pago.condominio.facturaA === 'CONTRIBUYENTE' ? 'bg-sky-50 text-sky-800 border-sky-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'}`}>
                              Factura a: {pago.condominio.facturaA === 'CONTRIBUYENTE' ? 'el contribuyente' : 'el condominio'}
                            </span>
                            {pago.condominio.grupo && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-600 text-white">Parte {pago.condominio.grupo.parte} de {pago.condominio.grupo.partes} · pago total Bs {fmtBs(pago.condominio.grupo.montoTotal)}</span>}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded border ${sub.cls}`}>{sub.label}</span>
                        {pago.mixto && (
                          <span className="block mt-1 text-[10px] font-bold text-slate-500" title="Incluye inmuebles residenciales; la factura solo toma la porción comercial">+ residencial (mixto)</span>
                        )}
                        <span className="block mt-0.5 text-[10px] text-slate-400">
                          {pago.mesesServicio > 0 ? `${pago.mesesServicio} mes(es)` : ''}{pago.mesesServicio > 0 && pago.tieneMulta ? ' + ' : ''}{pago.tieneMulta ? 'multa' : ''}
                        </span>
                        {pago.conRetencion && (() => {
                          const est: string | null = pago.retencionEstado;
                          const m: Record<string, [string, string]> = {
                            esperando_planilla: ['Retención: esperando comprobante', 'bg-amber-100 text-amber-800 border-amber-300'],
                            planilla_recibida: ['Retención: comprobante por revisar', 'bg-blue-100 text-blue-800 border-blue-300'],
                            rechazada: ['Retención: comprobante rechazado', 'bg-red-100 text-red-800 border-red-300'],
                            aprobada: ['Retención aprobada · factura enviada', 'bg-emerald-100 text-emerald-800 border-emerald-300'],
                          };
                          const [txt, cls] = est ? m[est] || [est, 'bg-slate-100 text-slate-700 border-slate-300'] : ['Agente de retención (la factura no se envía al emitir)', 'bg-violet-100 text-violet-800 border-violet-300'];
                          return (
                            <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded border ${cls}`} title={pago.retencionDatosEnviados ? `Datos de la factura enviados: ${new Date(pago.retencionDatosEnviados).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}` : 'Datos de la factura aún no enviados'}>
                              {txt}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3.5 px-4">
                        {pago.esCorreoComodin ? (
                          <div className="space-y-0.5">
                            <span className="text-[11px] font-mono text-slate-500 block">{pago.correo}</span>
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              Comodín (Requiere Actualización)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px]">
                            <Mail className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{pago.correo}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-sm">
                        <div className="font-black text-slate-900">
                          Bs {pago.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {pago.conRetencion && (
                          <div className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            Retención IVA (75%): Bs {fmtBs(pago.montoRetencion || pago.detalles?.monto_retencion_iva || 0)}
                          </div>
                        )}
                        {pago.montoPagado !== undefined && Math.abs(pago.montoPagado - pago.monto) > 0.05 && (
                          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                            Transferido: Bs {fmtBs(pago.montoPagado)}
                          </div>
                        )}
                        {(() => {
                          const sFavor = parseFloat(String(pago.saldoAFavor || pago.detalles?.saldo_a_favor_nuevo || pago.detalles?.monto_sobrante || pago.detalles?.saldo_favor || pago.detalles?.saldo_favor_generado || 0)) || 0;
                          const mRet = parseFloat(String(pago.montoRetencion || pago.detalles?.monto_retencion_iva || 0)) || 0;
                          if (sFavor <= 0 || (pago.conRetencion && Math.abs(sFavor - mRet) < 0.05)) return null;
                          return (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              + Bs {fmtBs(sFavor)} en N/Crédito
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(pago.created_at).toLocaleDateString('es-VE')}
                      </td>
                      <td className="py-3.5 px-4">
                        {pago.documento === 'recibo' ? (
                          pago.reciboEnviado ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Enviado
                              </span>
                              {pago.reciboEnviadoFecha && (
                                <span className="block font-mono text-[10px] text-slate-500">
                                  {new Date(pago.reciboEnviadoFecha).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                Pendiente envío
                              </span>
                              {pago.reciboError && <span className="block text-[10px] text-red-600 max-w-[180px]">{pago.reciboError}</span>}
                            </div>
                          )
                        ) : (pago.facturaEmitida || pago.facturaAnulada) ? (
                          <div className="space-y-1">
                            {pago.facturaAnulada ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                <X className="w-3.5 h-3.5 text-rose-600" />
                                Anulada (NC)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Emitida SENIAT
                              </span>
                            )}
                            {pago.numeroControl && (
                              <span className="block font-mono text-[10px] text-slate-500">
                                Ctrl: {pago.numeroControl}
                              </span>
                            )}
                            {pago.notaCreditoControl && (
                              <span className="block font-mono text-[10px] text-rose-600 font-bold">
                                NC: {pago.notaCreditoControl}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Pendiente Emisión
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => abrirReciboCaja(pago)}
                            disabled={reciboCajaCargando === pago.id}
                            className="text-[11px] bg-white hover:bg-emerald-50 text-emerald-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
                            title="Ver y descargar el recibo entregado en Caja"
                          >
                            {reciboCajaCargando === pago.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            <span>Recibo Caja</span>
                          </button>
                          {esAdmin && !pago.facturaEmitida && (
                            <button
                              onClick={() => pedirEliminar(pago)}
                              className="text-[11px] bg-white hover:bg-red-50 text-red-700 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-red-300 transition-colors cursor-pointer"
                              title="Eliminar este pago y devolverle la deuda al contribuyente (solo administrador)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          )}
                          {esAdmin && pago.facturaAnulada && (
                            <button
                              onClick={() => pedirEliminar(pago)}
                              className="text-[11px] bg-white hover:bg-red-50 text-red-700 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-red-300 transition-colors cursor-pointer"
                              title="Eliminar pago (ya la factura fue anulada)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(pago)}
                            className="text-[11px] bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-slate-300 hover:border-amber-300 transition-colors cursor-pointer"
                            title="Editar monto, si es de retención, nombre, cédula o RIF, referencia o caja"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                            <span>Editar</span>
                          </button>
                          {pago.documento === 'recibo' ? (
                            <>
                              <button
                                onClick={() => setPreviewPagoId(pago.id)}
                                className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-slate-200 transition-colors cursor-pointer"
                                title="Ver el recibo tal como lo recibirá el contribuyente"
                              >
                                <Eye className="w-3.5 h-3.5 text-violet-600" />
                                <span>Ver</span>
                              </button>
                              <button
                                onClick={() => enviarReciboIndividual(pago)}
                                className="text-[11px] bg-violet-600 hover:bg-violet-700 text-white font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                title="Enviar recibo por correo"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span>{pago.reciboEnviado ? 'Reenviar' : 'Enviar'}</span>
                              </button>
                            </>
                          ) : pago.facturaEmitida ? (
                            <>
                              {pago.facturaUrl && (
                                <a
                                  href={pago.facturaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-slate-200 transition-colors"
                                  title="Ver factura oficial en formato PDF del SENIAT"
                                >
                                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                                  <span>{pago.facturaAnulada ? 'Factura' : 'PDF'}</span>
                                </a>
                              )}
                              {pago.notaCreditoUrl && (
                                <a
                                  href={pago.notaCreditoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-rose-300 transition-colors"
                                  title="Ver Nota de Crédito oficial en formato PDF del SENIAT"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-rose-600" />
                                  <span>PDF N/C</span>
                                </a>
                              )}
                              {!pago.facturaAnulada && (
                                (pago.conRetencion && pago.retencionEstado !== 'aprobada') ? (
                                  <button
                                    onClick={() => abrirModalRetencion(pago)}
                                    className={`text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border shadow-xs transition-colors cursor-pointer ${
                                      pago.retencionPlanillaUrl || pago.retencionEstado === 'planilla_recibida'
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 animate-pulse'
                                        : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                    }`}
                                    title="Revisar comprobante de retención montado por el contribuyente"
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    <span>{pago.retencionPlanillaUrl || pago.retencionEstado === 'planilla_recibida' ? 'Revisar Retención' : 'Esperando Planilla'}</span>
                                  </button>
                                ) : (
                                  <>
                                    {pago.conRetencion && (
                                      <button
                                        onClick={() => abrirModalRetencion(pago)}
                                        className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-emerald-300 transition-colors cursor-pointer"
                                        title="Ver comprobante de retención aprobado"
                                      >
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Retención Aprobada</span>
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setSelectedPagoForEmail(pago);
                                        setCustomEmailDestino(pago.correo || fallbackEmail);
                                      }}
                                      className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-emerald-300 transition-colors cursor-pointer"
                                      title="Reenviar copia de la factura por correo electrónico"
                                    >
                                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Reenviar</span>
                                    </button>
                                  </>
                                )
                              )}
                              {/* Botón Demo / Vista Previa Formato Factory HKA */}
                              <button
                                onClick={() => setSelectedPagoForDemo(pago)}
                                className="text-[11px] bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-sky-300 transition-colors cursor-pointer"
                                title="Ver Demo y Plantilla Oficial The Factory HKA"
                              >
                                <Eye className="w-3.5 h-3.5 text-sky-600" />
                                <span>Demo Factory</span>
                              </button>
                              {/* Botón Reemitir disponible para facturas emitidas o anuladas */}
                              <button
                                onClick={() => handleOpenEmitModal(pago)}
                                className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                title="Reemitir Factura Digital corregida a The Factory HKA"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#c8e64c]" />
                                <span>Reemitir</span>
                              </button>
                              {!pago.facturaAnulada && (
                                <button
                                  onClick={async () => { 
                                    if (!confirm('¿Está seguro que desea anular esta factura electrónica y generar una Nota de Crédito en The Factory HKA? Esto no se puede deshacer.')) return;
                                    setAnularEstado({ pago, cargando: true });
                                    try {
                                      let uActual = adminUser?.usuario || '';
                                      if (!uActual) {
                                        try { const u = JSON.parse(localStorage.getItem('admin_user_data') || 'null'); uActual = u?.usuario || 'Administrador'; } catch {}
                                      }
                                      const r = await fetch('/api/admin/factura-digital/anular', {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          pagoId: pago.id,
                                          usuario: uActual || 'Administrador',
                                          contribuyente: pago.contribuyente,
                                          identidad: pago.identidad,
                                          numeroFactura: pago.numeroDocumento || pago.numeroControl,
                                          recibos: pago.recibos || [],
                                          montoTotal: pago.monto || pago.montoTotal,
                                          montos: pago.detalles?.montos || {},
                                          formasPago: pago.detalles?.formasPago || []
                                        }),
                                      });
                                      const d = await r.json();
                                      if (!r.ok || d.skipped) { 
                                        const errStr = d.error || d.message || 'No se pudo anular la factura';
                                        if (errStr.toLowerCase().includes('anulad') || confirm(`The Factory HKA reportó:\n"${errStr}"\n\n¿Desea marcar esta factura como anulada en el sistema (NC Manual) para que quede anulada como el Sambil y habilitar la reemisión limpia?`)) {
                                          const rf = await fetch('/api/admin/factura-digital/anular', {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              pagoId: pago.id,
                                              usuario: uActual || 'Administrador',
                                              forzarMarcadoAnulada: true
                                            }),
                                          });
                                          const df = await rf.json();
                                          if (df.success) {
                                            alert('Factura marcada como anulada en el sistema exitosamente (NC-MANUAL).');
                                          } else {
                                            alert(df.error || 'Error al forzar anulación');
                                          }
                                          setAnularEstado(null);
                                          loadPagos();
                                          return;
                                        }
                                        alert(errStr); 
                                        setAnularEstado(null); 
                                        return; 
                                      }
                                      alert(d.yaAnuladaEnTfhka ? 'La factura ya estaba anulada en The Factory HKA y fue sincronizada en el sistema.' : 'Factura anulada correctamente (Nota de Crédito generada en The Factory HKA).');
                                      setAnularEstado(null);
                                      loadPagos();
                                    } catch (e: any) {
                                      alert(e.message);
                                      setAnularEstado(null);
                                    }
                                  }}
                                  disabled={anularEstado?.pago?.id === pago.id && anularEstado?.cargando}
                                  className="text-[11px] bg-white hover:bg-rose-50 text-rose-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-rose-300 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Anular Factura Digital"
                                >
                                  {anularEstado?.pago?.id === pago.id && anularEstado?.cargando ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" /> : <X className="w-3.5 h-3.5 text-rose-600" />}
                                  <span>{anularEstado?.pago?.id === pago.id && anularEstado?.cargando ? 'Anulando...' : 'Anular'}</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {/* Botón Demo / Vista Previa de Factura */}
                              <button
                                onClick={() => setSelectedPagoForDemo(pago)}
                                className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-emerald-300 transition-colors cursor-pointer"
                                title="Ver Demo / Vista Previa de la Factura Electrónica antes de emitir"
                              >
                                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Demo Factura</span>
                              </button>

                              {/* Botón Verificar Factura antes de enviarla */}
                              <button
                                onClick={() => handleVerifyPago(pago)}
                                className="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-indigo-200 transition-colors cursor-pointer"
                                title="Verificar y auditar los datos fiscales antes de emitir"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Verificar</span>
                              </button>

                              {/* Botón Emitir o Badge Por Conciliar */}
                              {pago.estado !== 'Aprobado' ? (
                                <span 
                                  className="text-[11px] bg-amber-50 text-amber-800 font-bold px-2.5 py-1.5 rounded-lg border border-amber-300 flex items-center gap-1 select-none"
                                  title={`Pago no conciliado (estado: ${pago.estado || 'Por Verificar'}). Debe ser aprobado en Conciliación Bancaria antes de emitir la factura fiscal.`}
                                >
                                  ⏳ Por Conciliar
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleOpenEmitModal(pago)}
                                  className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                  title="Emitir Factura Digital a The Factory HKA"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#c8e64c]" />
                                  <span>Emitir</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ MODAL DE VERIFICACIÓN / AUDITORÍA PREVIA ══ */}
      {selectedPagoForVerify && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-[#c8e64c]" />
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Verificación Previa de Facturación Fiscal</h3>
                  <p className="text-[11px] text-slate-300">Auditoría de cumplimiento técnico antes de la transmisión a The Factory HKA</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPagoForVerify(null)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {isVerifying ? (
                <div className="py-12 text-center text-slate-500 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
                  <p className="font-semibold text-sm">Auditando documento fiscal con el motor de The Factory HKA...</p>
                </div>
              ) : verificationResult ? (
                <>
                  {/* Banner de Estado */}
                  {verificationResult.ok ? (
                    <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-extrabold text-sm text-emerald-900">Documento Verificado con Éxito</h4>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Todos los parámetros fiscales cumplen con la normativa del SENIAT y la especificación técnica de The Factory HKA.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-extrabold text-sm text-red-900">Se encontraron observaciones</h4>
                        <ul className="text-xs text-red-700 mt-1 list-disc pl-4 space-y-0.5">
                          {verificationResult.errores?.map((err: string, i: number) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Advertencia de correo comodín si aplica */}
                  {verificationResult.comprador?.usaCorreoComodin && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-black">Asignación de Correo Comodín:</strong>
                        <span>
                          El contribuyente no posee un correo electrónico personal en el censo. Se usará temporalmente el correo comodín de contingencia (<strong>{verificationResult.comprador.correo}</strong>). El sistema continuará solicitando la actualización de su correo real.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Resumen Fiscal */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 font-bold block uppercase text-[10px]">Razón Social</span>
                        <strong className="text-slate-800 text-sm">{verificationResult.contribuyente}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block uppercase text-[10px]">Identificación Fiscal</span>
                        <strong className="text-slate-800 text-sm font-mono">{verificationResult.identidad}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block uppercase text-[10px]">Dirección Fiscal</span>
                        <span className="text-slate-700">{verificationResult.comprador?.direccion}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block uppercase text-[10px]">Destino de Copia Interna Fiscal</span>
                        <span className="text-indigo-700 font-bold font-mono text-[11px]">{backupEmail} (Sin costo TFHKA)</span>
                      </div>
                    </div>

                    {(() => {
                      const original = verificationResult.totales?.montoTotal || 0;
                      const t = totalEditado !== '' ? (parseFloat(totalEditado) || 0) : original;
                      const base = parseFloat((t / 1.16).toFixed(2));
                      const iva = parseFloat((t - base).toFixed(2));
                      const editado = totalEditado !== '' && Math.abs(t - original) > 0.01;
                      return (
                        <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-600">
                            <span>Base Imponible Gravada (16% IVA):</span>
                            <strong className="font-mono">Bs {base.toFixed(2)}</strong>
                          </div>
                          <div className="flex justify-between text-blue-700">
                            <span>Impuesto al Valor Agregado (IVA):</span>
                            <strong className="font-mono">Bs {iva.toFixed(2)}</strong>
                          </div>
                          <div className="flex justify-between items-center text-slate-900 text-sm font-black border-t border-slate-200 pt-1.5 gap-3">
                            <label htmlFor="total-factura-editable">Total Documento Fiscal:</label>
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-700 text-base">Bs</span>
                              <input
                                id="total-factura-editable"
                                type="number"
                                step="0.01"
                                min="0"
                                value={totalEditado !== '' ? totalEditado : original.toFixed(2)}
                                onChange={e => setTotalEditado(e.target.value)}
                                className={`w-40 text-right font-mono text-base font-black rounded-lg px-2 py-1 border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${editado ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-emerald-700'}`}
                                title="Puede corregir el total; la base y el IVA se recalculan"
                              />
                            </div>
                          </div>
                          {editado ? (
                            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-1.5">
                              <div className="text-[11px] text-amber-900">
                                Cobrado en Caja: <b className="font-mono">Bs {original.toFixed(2)}</b> → la factura saldrá por <b className="font-mono">Bs {t.toFixed(2)}</b>
                                {' '}(<b>{t > original ? '+' : ''}{(t - original).toFixed(2)}</b>).
                                <button type="button" onClick={() => setTotalEditado('')} className="ml-2 underline font-bold cursor-pointer">Restablecer</button>
                              </div>
                              <input
                                id="motivo-ajuste-total"
                                value={motivoAjuste}
                                onChange={e => setMotivoAjuste(e.target.value)}
                                placeholder="Motivo del ajuste (obligatorio)"
                                className="w-full rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 italic pt-1">
                              &laquo;{verificationResult.totales?.montoEnLetras}&raquo;
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Estado de Conexión The Factory */}
                  <div className="text-xs bg-slate-100 rounded-lg p-3 text-slate-600 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-700 block">Conexión The Factory HKA:</span>
                      <span className="text-[11px] font-mono text-slate-500">{verificationResult.conexionTheFactory?.url}</span>
                    </div>
                    {verificationResult.conexionTheFactory?.ok ? (
                      <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                        <Check className="w-4 h-4" /> Conectado
                      </span>
                    ) : (
                      <span className="text-amber-700 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> Pendiente
                      </span>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedPagoForVerify(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    const t = totalEditado !== '' ? parseFloat(totalEditado) || 0 : 0;
                    const original = verificationResult?.totales?.montoTotal || 0;
                    const demoPago = {
                      ...selectedPagoForVerify,
                      ...(t > 0 && Math.abs(t - original) > 0.01 ? { totalManual: t, monto: t } : {})
                    };
                    setSelectedPagoForDemo(demoPago);
                  }}
                  className="px-3.5 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ver Formato / Demo</span>
                </button>
              </div>
              {verificationResult?.ok && (
                <button
                  onClick={() => {
                    const t = totalEditado !== '' ? parseFloat(totalEditado) || 0 : 0;
                    const original = verificationResult.totales?.montoTotal || 0;
                    if (t > 0 && Math.abs(t - original) > 0.01 && motivoAjuste.trim().length < 5) {
                      alert('Escriba el motivo del ajuste del total.');
                      return;
                    }
                    handleOpenEmitModal(selectedPagoForVerify, t > 0 && Math.abs(t - original) > 0.01 ? t : undefined, original);
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Proceder a Emitir Factura</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE EMISIÓN MASIVA / LOTE ══ */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-6 h-6 text-[#c8e64c]" />
                <div>
                  <h3 className="font-black text-base leading-tight">Emisión Masiva de Facturación Fiscal</h3>
                  <p className="text-[11px] text-emerald-200">Transmitir todas las facturas comerciales pendientes a The Factory HKA</p>
                </div>
              </div>
              <button 
                onClick={() => setShowBatchModal(false)} 
                disabled={isBatchRunning}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!batchProgress ? (
                <>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2 text-slate-700">
                    <p className="text-sm font-black text-slate-800">
                      ¿Deseas emitir las <strong>{totalPendientes}</strong> facturas comerciales pendientes?
                    </p>
                    <p>
                      El proceso realizará las siguientes acciones de forma automática para cada registro:
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600">
                      <li>Generación del documento fiscal ante The Factory HKA (SENIAT).</li>
                      <li>Asignación de número de control y enlace de consulta oficial.</li>
                      <li>Envío de factura al correo del contribuyente (o al comodín municipal si no tiene).</li>
                      <li><strong>Envío de copia de archivo fiscal a {backupEmail}</strong> (sin gastar facturas adicionales).</li>
                    </ul>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowBatchModal(false)}
                      disabled={isBatchRunning}
                      className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleIniciarEmisionLote}
                      disabled={isBatchRunning}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <Layers className="w-4 h-4 text-[#c8e64c]" />
                      <span>Iniciar Emisión en Lote</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Resumen de resultados */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Procesados</span>
                      <strong className="text-lg text-slate-800 font-mono">{batchProgress.procesados}</strong>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                      <span className="text-[10px] text-emerald-700 font-bold uppercase block">Emitidos OK</span>
                      <strong className="text-lg text-emerald-800 font-mono">{batchProgress.emitidos}</strong>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                      <span className="text-[10px] text-amber-700 font-bold uppercase block">Fallidos/Omitidos</span>
                      <strong className="text-lg text-amber-800 font-mono">{batchProgress.fallidos}</strong>
                    </div>
                  </div>

                  {isBatchRunning ? (
                    <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                      <p className="font-bold text-slate-700">Procesando emisión con The Factory HKA...</p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl p-3.5 text-xs text-center font-bold">
                      🎉 Lote procesado con éxito. Se enviaron las copias internas correspondientes.
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        setShowBatchModal(false);
                        setBatchProgress(null);
                      }}
                      className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Aceptar y Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE AJUSTE Y EMISIÓN MANUAL INDIVIDUAL ══ */}
      {selectedPagoForEmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#c8e64c]" />
                <h3 className="font-bold text-base">Emisión de Factura Fiscal Digital</h3>
              </div>
              <button onClick={() => setSelectedPagoForEmit(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Datos Fiscales del Contribuyente y Caja</span>
                  <span className="text-[10px] text-slate-400 font-medium">Modificables antes de emitir</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Nombre / Razón Social</label>
                    <input
                      type="text"
                      value={emitContribuyente}
                      onChange={e => setEmitContribuyente(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">R.I.F. / Cédula</label>
                    <input
                      type="text"
                      value={emitIdentidad}
                      onChange={e => setEmitIdentidad(e.target.value.toUpperCase())}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 bg-white uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Nro. Referencia</label>
                    <input
                      type="text"
                      value={emitReferencia}
                      onChange={e => setEmitReferencia(e.target.value)}
                      placeholder="Referencia bancaria"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Caja / Módulo</label>
                    <select
                      value={emitModulo}
                      onChange={e => setEmitModulo(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="caja">Caja General (Contribuyentes)</option>
                      <option value="condominios">Caja Condominios</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 bg-amber-50/70 border border-amber-200 p-2.5 rounded-lg hover:bg-amber-100/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={emitEsRetencion}
                      onChange={e => setEmitEsRetencion(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span>¿Es Pago con Retención de IVA (75%)? (Agente de Retención)</span>
                  </label>
                </div>

                {(() => {
                  const sFavor = parseFloat(String(selectedPagoForEmit.detalles?.saldo_a_favor_nuevo || selectedPagoForEmit.detalles?.monto_sobrante || selectedPagoForEmit.detalles?.saldo_favor || selectedPagoForEmit.detalles?.saldo_favor_generado || 0)) || 0;
                  const mRet = parseFloat(String(selectedPagoForEmit.montoRetencion || selectedPagoForEmit.detalles?.monto_retencion_iva || 0)) || 0;
                  if (sFavor <= 0 || (emitEsRetencion && Math.abs(sFavor - mRet) < 0.05)) return null;
                  return (
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>Pago con Excedente acreditado a Nota de Crédito</span>
                      </div>
                      {(() => {
                        const totalCanceladoReal = (() => {
                          if (Array.isArray(selectedPagoForEmit.detalles?.pagos_agregados) && selectedPagoForEmit.detalles.pagos_agregados.length > 0) {
                            return selectedPagoForEmit.detalles.pagos_agregados.reduce((s: number, p: any) => s + (parseFloat(String(p?.monto || 0)) || 0), 0);
                          }
                          return parseFloat(String(selectedPagoForEmit.monto || 0)) || 0;
                        })();
                        return (
                          <p className="text-[11px] text-blue-800 leading-snug">
                            El contribuyente canceló <strong>Bs. {fmtBs(totalCanceladoReal)}</strong>. De ese monto, <strong>Bs. {fmtBs(sFavor)}</strong> están por encima del servicio facturado y se registraron en su <strong>Nota de Crédito / Saldo a Favor</strong>. La Factura Electrónica se emite estrictamente por el servicio real: <strong>Bs. {fmtBs(totalReferencia)}</strong>.
                          </p>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>

              {/* CAMPOS DE AJUSTE */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Concepto Facturable</label>
                  <input
                    type="text"
                    value={ajusteConcepto}
                    onChange={e => setAjusteConcepto(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Base Servicio Gravada (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ajusteMontoServicio}
                      onChange={e => setAjusteMontoServicio(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Multa Exenta (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ajusteMontoMulta}
                      onChange={e => setAjusteMontoMulta(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* DESGLOSE FISCAL */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Gravada (Servicio):</span>
                    <span className="font-mono">Bs {(parseFloat(ajusteMontoServicio) || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-blue-700">
                    <span>IVA (16% sobre servicio):</span>
                    <span className="font-mono">Bs {((parseFloat(ajusteMontoServicio) || 0) * 0.16).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-black border-t border-emerald-200 pt-1 text-sm">
                    <span>Total Factura Fiscal:</span>
                    <span className="font-mono text-emerald-800">
                      Bs {(
                        (parseFloat(ajusteMontoServicio) || 0) * 1.16 +
                        (parseFloat(ajusteMontoMulta) || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                  {emitEsRetencion && (
                    <div className="pt-1.5 border-t border-emerald-200/80 space-y-1 text-xs">
                      <div className="flex justify-between text-amber-900 font-semibold">
                        <span>(-) Retención 75% IVA (SENIAT):</span>
                        <span className="font-mono">- Bs {(((parseFloat(ajusteMontoServicio) || 0) * 0.16) * 0.75).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-950 font-black">
                        <span>Monto Cancelado por el Cliente (Neto):</span>
                        <span className="font-mono text-emerald-900">
                          Bs {(
                            ((parseFloat(ajusteMontoServicio) || 0) * 1.16 + (parseFloat(ajusteMontoMulta) || 0)) -
                            (((parseFloat(ajusteMontoServicio) || 0) * 0.16) * 0.75)
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {Math.abs(((parseFloat(ajusteMontoServicio) || 0) * 1.16 + (parseFloat(ajusteMontoMulta) || 0)) - (totalReferencia || parseFloat(selectedPagoForEmit.monto) || 0)) > 0.02 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-1.5">
                    <div className="text-[11px] text-amber-900 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>El total es distinto al de la factura calculada (Bs {(totalReferencia || parseFloat(selectedPagoForEmit.monto) || 0).toFixed(2)}). La factura se emitirá y enviará con el <b>monto nuevo</b> y quedará registrado en la Auditoría.</span>
                    </div>
                    <input
                      id="motivo-ajuste-emision"
                      value={motivoAjuste}
                      onChange={e => setMotivoAjuste(e.target.value)}
                      placeholder="Motivo del ajuste (obligatorio)"
                      className="w-full rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                )}

                {/* CORREO DE ENVÍO */}
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enviarCorreoAlEmitir}
                        onChange={e => setEnviarCorreoAlEmitir(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      Enviar factura por correo electrónico
                    </label>
                  </div>
                  {enviarCorreoAlEmitir && (
                    <div className="space-y-1.5">
                      <input
                        type="email"
                        value={correoDestinoEmision}
                        onChange={e => setCorreoDestinoEmision(e.target.value)}
                        placeholder="ejemplo@correo.com"
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono bg-white"
                      />
                      <p className="text-[10px] text-slate-500">
                        📁 Se enviará una copia automática al correo de archivo fiscal: <strong>{backupEmail}</strong> (Sin costo The Factory).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedPagoForEmit(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const base = parseFloat(ajusteMontoServicio) || 0;
                    const multa = parseFloat(ajusteMontoMulta) || 0;
                    const iva = parseFloat((base * 0.16).toFixed(2));
                    let total = parseFloat((base + multa + iva).toFixed(2));
                    if ((totalForzado || totalReferencia) && multa === 0 && !totalForzado && Math.abs(base - parseFloat((totalReferencia / 1.16).toFixed(2))) < 0.005) total = totalReferencia;
                    if (totalForzado && multa === 0 && Math.abs(base - parseFloat((totalForzado / 1.16).toFixed(2))) < 0.005) total = totalForzado;

                    const demoPago = {
                      ...selectedPagoForEmit,
                      contribuyente: emitContribuyente.trim(),
                      identidad: emitIdentidad.trim().toUpperCase(),
                      referencia: emitReferencia.trim(),
                      monto: total,
                      totalManual: total,
                      conRetencion: emitEsRetencion,
                      esRetencion: emitEsRetencion,
                      detalles: {
                        ...(selectedPagoForEmit.detalles || {}),
                        contribuyente: emitContribuyente.trim(),
                        identidad: emitIdentidad.trim().toUpperCase(),
                        referencia: emitReferencia.trim(),
                        concepto: ajusteConcepto,
                        es_retencion: emitEsRetencion,
                        agente_retencion: emitEsRetencion,
                        conRetencion: emitEsRetencion,
                        monto_factura: total,
                        multa_bs: multa
                      }
                    };
                    setSelectedPagoForDemo(demoPago);
                  }}
                  className="px-3.5 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Vista Previa con Cambios</span>
                </button>
              </div>
              <button
                onClick={handleConfirmarEmision}
                disabled={isEmitting}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
              >
                <Send className={`w-3.5 h-3.5 ${isEmitting ? 'animate-spin' : ''}`} />
                <span>{isEmitting ? 'Transmitiendo a TFHKA...' : 'Confirmar y Emitir Factura'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE EDICIÓN DE DATOS FISCALES DEL PAGO ══ */}
      {pagoAEditar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-5 h-5 text-[#c8e64c]" />
                <div>
                  <h3 className="font-bold text-base leading-tight">Editar Datos Fiscales del Pago</h3>
                  <p className="text-[11px] text-slate-300">Modificar monto, retención, contribuyente, RIF, referencia o caja</p>
                </div>
              </div>
              <button 
                onClick={() => setPagoAEditar(null)}
                disabled={guardandoEdicion}
                className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Información de contexto */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">ID de Pago</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">{pagoAEditar.id}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Fecha Original</span>
                  <span className="text-slate-700 font-medium text-xs">
                    {pagoAEditar.created_at ? new Date(pagoAEditar.created_at).toLocaleDateString('es-VE') : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Formulario */}
              <div className="space-y-3">
                {/* 1. Nombre / Razón Social */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre / Razón Social del Contribuyente <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.contribuyente}
                    onChange={e => setEditForm(prev => ({ ...prev, contribuyente: e.target.value }))}
                    placeholder="Ej: INVERSIONES EJEMPLO C.A. / JUAN PÉREZ"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>

                {/* 2. Cédula o RIF & Monto */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cédula o R.I.F. <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.identidad}
                      onChange={e => setEditForm(prev => ({ ...prev, identidad: e.target.value.toUpperCase() }))}
                      placeholder="Ej: J-12345678-9 / V-12345678"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 bg-white uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Monto Pagado (Bs) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.monto}
                      onChange={e => setEditForm(prev => ({ ...prev, monto: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>

                {/* 3. Referencia Bancaria, Fecha & Selección de Caja */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nro. de Referencia
                    </label>
                    <input
                      type="text"
                      value={editForm.referencia}
                      onChange={e => setEditForm(prev => ({ ...prev, referencia: e.target.value }))}
                      placeholder="Ej: 123456"
                      className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Fecha Operación <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editForm.fecha}
                      max={hoyCaracas()}
                      onChange={e => setEditForm(prev => ({ ...prev, fecha: e.target.value }))}
                      className="w-full border border-slate-300 rounded-xl px-2 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Caja / Módulo <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editForm.modulo}
                      onChange={e => setEditForm(prev => ({ ...prev, modulo: e.target.value }))}
                      className="w-full border border-slate-300 rounded-xl px-2 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="caja">Caja General</option>
                      <option value="condominios">Condominios</option>
                    </select>
                  </div>
                </div>

                {/* Detalle / Concepto de Facturación */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Detalle / Concepto de lo que se está pagando
                  </label>
                  <input
                    type="text"
                    value={editForm.concepto}
                    onChange={e => setEditForm(prev => ({ ...prev, concepto: e.target.value }))}
                    placeholder="Ej: Servicio de Aseo Urbano Comercial - Septiembre 2026"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Puedes editar la descripción o período del servicio que saldrá en la factura electrónica.
                  </span>
                </div>

                {/* 4. Retención de IVA (75%) */}
                <div className="pt-1">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50/70 hover:bg-amber-100/60 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.esRetencion}
                      onChange={e => setEditForm(prev => ({ ...prev, esRetencion: e.target.checked }))}
                      className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-amber-950 block">¿Es Pago con Retención de IVA (75%)?</span>
                      <span className="text-[11px] text-amber-800 leading-snug block mt-0.5">
                        Indica si el contribuyente retuvo el 75% del IVA como contribuyente especial. La factura se emitirá con la retención y retendrá el envío automático de correo hasta cargar el comprobante.
                      </span>
                    </div>
                  </label>
                </div>

                {/* 5. Marcar como anulada si ya fue emitida */}
                {pagoAEditar.facturaEmitida && !pagoAEditar.facturaAnulada && (
                  <div className="pt-1">
                    <label className="flex items-start gap-3 p-3 rounded-xl border border-rose-300 bg-rose-50/70 hover:bg-rose-100/60 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.marcarAnulada}
                        onChange={e => setEditForm(prev => ({ ...prev, marcarAnulada: e.target.checked }))}
                        className="mt-0.5 rounded border-rose-400 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-rose-950 block">Marcar factura anterior como ANULADA en el sistema</span>
                        <span className="text-[11px] text-rose-800 leading-snug block mt-0.5">
                          Activa esta casilla si la factura ya fue anulada previamente en el portal de The Factory HKA y deseas que el sistema la registre como anulada para reemitirla limpiamente.
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPagoAEditar(null)}
                disabled={guardandoEdicion}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarEdicion}
                disabled={guardandoEdicion}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {guardandoEdicion ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE CONFIGURACIÓN Y CREDENCIALES THE FACTORY ══ */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-[#c8e64c]" />
                <h3 className="font-bold text-base">Credenciales The Factory HKA (SENIAT)</h3>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Servidor The Factory:</span>
                  <span className="font-mono text-slate-800 font-bold">{tfhkaConfig?.config?.baseUrl}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Usuario Registrado:</span>
                  <span className="font-mono text-slate-800 font-bold">{tfhkaConfig?.config?.user}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Estado de Conexión:</span>
                  <span className={`font-bold ${isTfhkaOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {tfhkaConfig?.connectionStatus?.message || 'Verificando...'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Copia Fiscal Interna:</span>
                  <span className="font-mono text-indigo-700 font-bold">{backupEmail}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Correo Comodín:</span>
                  <span className="font-mono text-amber-700 font-bold">{fallbackEmail}</span>
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl text-emerald-900 space-y-1">
                <strong className="block font-black text-sm">¿Cómo configurar credenciales de producción?</strong>
                <p className="text-[11px] leading-relaxed">
                  Solo debes proporcionar el <strong>Usuario</strong> y <strong>Contraseña</strong> provistos por The Factory HKA y la URL de emisión oficial. El sistema ya cuenta con la infraestructura lista para operar de inmediato.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE REENVÍO DE CORREO ══ */}
      {selectedPagoForEmail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Reenviar Factura por Correo</h3>
              </div>
              <button onClick={() => setSelectedPagoForEmail(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {emailSuccessMsg ? (
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-4 rounded-xl text-center text-xs font-bold">
                  {emailSuccessMsg}
                </div>
              ) : (
                <>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p>Reenviar la factura fiscal digital a una dirección de correo alternativa:</p>
                    <p className="font-bold text-slate-800">
                      {selectedPagoForEmail.contribuyente} ({selectedPagoForEmail.identidad})
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico Destino</label>
                    <input
                      type="email"
                      value={customEmailDestino}
                      onChange={e => setCustomEmailDestino(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Se enviará una copia interna automática al archivo fiscal: <strong>{backupEmail}</strong> (Sin consumir créditos de The Factory).
                  </p>
                </>
              )}
            </div>

            {!emailSuccessMsg && (
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={() => setSelectedPagoForEmail(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReenviarCorreo}
                  disabled={isSendingEmail || !customEmailDestino}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
                  <span>{isSendingEmail ? 'Enviando...' : 'Reenviar Factura'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL DE REVISIÓN Y ENVÍO DEL LOTE DEL DÍA ══ */}
      {loteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className={`px-6 py-4 text-white flex items-center justify-between ${loteModal === 'factura' ? 'bg-gradient-to-r from-blue-900 to-slate-900' : 'bg-gradient-to-r from-violet-900 to-slate-900'}`}>
              <div className="flex items-center gap-2.5">
                {loteModal === 'factura' ? <FileText className="w-6 h-6 text-[#c8e64c]" /> : <Receipt className="w-6 h-6 text-[#c8e64c]" />}
                <div>
                  <h3 className="font-black text-base leading-tight">
                    {loteModal === 'factura' ? 'Facturas fiscales' : 'Recibos por correo'} del {fecha.split('-').reverse().join('/')}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {loteModal === 'factura'
                      ? 'Revise cada factura antes de emitir. Cada emisión es un documento fiscal real (The Factory HKA / SENIAT).'
                      : 'Revise cada recibo antes de enviar. Se envía al contribuyente y copia a facturacion.comercial@globalgreenca.com.'}
                  </p>
                </div>
              </div>
              <button onClick={() => !loteRunning && setLoteModal(null)} disabled={loteRunning} className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer disabled:opacity-30">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loteResultados.length > 0 ? (
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-600 sticky top-0">
                    <tr><th className="py-2 px-4">Contribuyente</th><th className="py-2 px-4">Monto</th><th className="py-2 px-4">Resultado</th><th className="py-2 px-4">Detalle</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loteResultados.map((r: any) => (
                      <tr key={r.id}>
                        <td className="py-2 px-4"><strong className="text-slate-800">{r.contribuyente}</strong><span className="block font-mono text-[10px]">{r.identidad}</span></td>
                        <td className="py-2 px-4 font-mono">Bs {fmtBs(r.monto)}</td>
                        <td className="py-2 px-4">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded ${r.resultado === 'EMITIDA' || r.resultado === 'ENVIADO' ? 'bg-emerald-100 text-emerald-800' : r.resultado === 'OMITIDA' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{r.resultado}</span>
                        </td>
                        <td className="py-2 px-4 text-[11px]">{r.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-[10px] uppercase font-black text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2 px-4 w-8">
                        {(() => {
                          const pend = pagosList.filter(p => p.documento === loteModal && !p.procesado);
                          const todos = pend.length > 0 && pend.every(p => loteSeleccion.has(p.id));
                          return (
                            <input
                              type="checkbox"
                              checked={todos}
                              disabled={loteRunning}
                              onChange={() => setLoteSeleccion(todos ? new Set() : new Set(pend.map(p => p.id)))}
                              className="w-4 h-4 cursor-pointer"
                            />
                          );
                        })()}
                      </th>
                      <th className="py-2 px-4">Contribuyente</th>
                      <th className="py-2 px-4">Tipo</th>
                      <th className="py-2 px-4">Correo</th>
                      <th className="py-2 px-4 text-right">Monto</th>
                      <th className="py-2 px-4 text-right">Revisar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagosList.filter(p => p.documento === loteModal && !p.procesado).map((p: any) => {
                      const sub = SUBTIPO_LABEL[p.subtipo] || SUBTIPO_LABEL.recibo_residencial;
                      return (
                        <tr key={p.id} className={loteSeleccion.has(p.id) ? '' : 'opacity-50'}>
                          <td className="py-2 px-4">
                            <input
                              type="checkbox"
                              checked={loteSeleccion.has(p.id)}
                              disabled={loteRunning}
                              onChange={() => {
                                const s = new Set(loteSeleccion);
                                if (s.has(p.id)) s.delete(p.id); else s.add(p.id);
                                setLoteSeleccion(s);
                              }}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-4">
                            <strong className="text-slate-800">{p.contribuyente}</strong>
                            <span className="block font-mono text-[10px]">{p.identidad} · {p.inmuebles?.join(', ')}</span>
                          </td>
                          <td className="py-2 px-4"><span className={`text-[10px] font-black px-2 py-0.5 rounded border ${sub.cls}`}>{sub.label}</span></td>
                          <td className="py-2 px-4 font-mono text-[10px]">
                            {p.esCorreoComodin ? <span className="text-amber-700 font-bold">Sin correo (solo copia archivo)</span> : p.correo}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-slate-900">Bs {fmtBs(p.monto)}</td>
                          <td className="py-2 px-4 text-right">
                            <button
                              onClick={() => (loteModal === 'factura' ? handleVerifyPago(p) : setPreviewPagoId(p.id))}
                              disabled={loteRunning}
                              className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 border border-slate-200 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                {loteProgreso ? (
                  <span>
                    {loteRunning && <RefreshCw className="w-3.5 h-3.5 animate-spin inline mr-1" />}
                    Procesados <strong>{loteProgreso.hechos}/{loteProgreso.total}</strong> · OK <strong className="text-emerald-700">{loteProgreso.ok}</strong> · Fallidos <strong className="text-red-700">{loteProgreso.fallidos}</strong>
                  </span>
                ) : (
                  <span>
                    Seleccionados <strong>{loteSeleccion.size}</strong> · Total <strong className="font-mono">Bs {fmtBs(pagosList.filter(p => loteSeleccion.has(p.id)).reduce((s, p) => s + (p.monto || 0), 0))}</strong>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLoteModal(null)}
                  disabled={loteRunning}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
                >
                  {loteResultados.length > 0 ? 'Cerrar' : 'Cancelar'}
                </button>
                {loteResultados.length === 0 && (
                  <button
                    id="btn-confirmar-lote"
                    onClick={ejecutarLote}
                    disabled={loteRunning || loteSeleccion.size === 0}
                    className={`px-5 py-2.5 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 ${loteModal === 'factura' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-violet-600 hover:bg-violet-700'}`}
                  >
                    <Send className={`w-3.5 h-3.5 ${loteRunning ? 'animate-spin' : ''}`} />
                    <span>
                      {loteRunning ? 'Procesando...' : loteModal === 'factura' ? `Emitir ${loteSeleccion.size} facturas` : `Enviar ${loteSeleccion.size} recibos`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ RECIBO DE CAJA (descarga / reimpresión) ══ */}
      {reciboCaja && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-start justify-center overflow-y-auto py-6 px-2 print:bg-white print:items-start print:py-0">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full print:shadow-none print:rounded-none">
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl print:hidden">
              <div>
                <span className="text-slate-800 font-bold text-base block">Recibo de Caja — {reciboCaja.pago.contribuyente}</span>
                <span className={`text-[11px] font-semibold ${reciboCaja.original ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {reciboCaja.original
                    ? 'Recibo original entregado en Caja'
                    : 'Reconstruido con los datos del pago (cobro anterior a que Caja guardara el recibo)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={descargarReciboCaja}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                  title='En la ventana de impresión elija "Guardar como PDF" para descargarlo'
                >
                  <Printer className="w-4 h-4" /> Descargar PDF / Imprimir
                </button>
                <button
                  onClick={() => setReciboCaja(null)}
                  className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <X className="w-4 h-4" /> Cerrar
                </button>
              </div>
            </div>
            <p className="px-6 pt-3 text-[11px] text-slate-500 print:hidden">
              Para descargar: pulse <b>Descargar PDF / Imprimir</b> y en <b>Destino</b> elija <b>&quot;Guardar como PDF&quot;</b>.
            </p>
            <div className="p-4">
              {reciboCaja.recibos.map((rd: any, idx: number) => (
                <div key={idx} className={idx > 0 ? 'mt-6 pt-6 border-t border-slate-200' : ''}>
                  {reciboCaja.recibos.length > 1 && (
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2 print:hidden">Recibo {idx + 1} de {reciboCaja.recibos.length} — {rd.codContribuyente}</div>
                  )}
                  <ReciboImprimible data={rd} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ VISTA PREVIA DEL RECIBO ══ */}
      {previewPagoId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col h-[90vh]">
            <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-violet-300" />
                <h3 className="font-bold text-sm">Vista previa del recibo (así lo recibirá el contribuyente)</h3>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/admin/recibos-digitales/pdf?pagoId=${previewPagoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                >
                  Ver PDF adjunto
                </a>
                <button onClick={() => setPreviewPagoId(null)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              title="Vista previa del recibo"
              src={`/api/admin/recibos-digitales/preview?pagoId=${previewPagoId}`}
              className="flex-1 w-full border-0 bg-slate-50"
            />
          </div>
        </div>
      )}

      {/* ══ MODAL ELIMINAR PAGO ══ */}
      {eliminar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between bg-red-700 px-5 py-3 text-white">
              <div className="flex items-center gap-2 font-extrabold"><Trash2 className="w-5 h-5" /> Eliminar pago y devolver la deuda</div>
              <button onClick={() => !eliminar.cargando && setEliminar(null)} className="text-white/80 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-sm">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Contribuyente:</span> <b>{eliminar.pago.contribuyente || eliminar.pago.nombre || ''} {eliminar.pago.identidad}</b></div>
                <div><span className="text-slate-500">Monto:</span> <b>Bs {fmtBs(eliminar.pago.monto)}</b></div>
                <div><span className="text-slate-500">Fecha:</span> {new Date(eliminar.pago.created_at || eliminar.pago.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}</div>
                <div><span className="text-slate-500">Referencia:</span> {eliminar.pago.referencia || '—'}</div>
              </div>

              {eliminar.cargando && !eliminar.preview && !eliminar.error && (
                <div className="flex items-center gap-2 text-slate-600"><RefreshCw className="w-4 h-4 animate-spin" /> Calculando la deuda que se devuelve…</div>
              )}

              {eliminar.error && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800 whitespace-pre-line flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {eliminar.error}</div>
              )}

              {eliminar.hecho ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 flex gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div>Pago eliminado. La deuda se restableció en {eliminar.preview?.cambios?.length || 0} inmueble(s) y quedó registrado en la Auditoría con el respaldo completo.</div>
                </div>
              ) : eliminar.preview && (
                <>
                  {eliminar.preview.estimado && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 flex gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      Este pago es anterior a la foto automática de la deuda: lo que se devuelve se <b>calculó con los meses y multas cobrados</b>. Revíselo antes de confirmar.
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-slate-800 mb-1">Deuda que se devuelve</div>
                    {eliminar.preview.cambios?.length ? (
                      <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr><th className="py-1.5 px-2 text-left">Inmueble</th><th className="py-1.5 px-2">Meses</th><th className="py-1.5 px-2">Multa Bs</th><th className="py-1.5 px-2">Saldo a favor Bs</th></tr>
                        </thead>
                        <tbody>
                          {eliminar.preview.cambios.map((c: any) => (
                            <tr key={c.id} className="border-t border-slate-100">
                              <td className="py-1.5 px-2 font-mono font-bold">{c.inmueble}</td>
                              <td className="py-1.5 px-2 text-center">{c.antes.meses_deuda} → <b className="text-red-700">{c.despues.meses_deuda}</b></td>
                              <td className="py-1.5 px-2 text-center">{fmtBs(c.antes.multa_bs + c.antes.deuda_congelada_bs)} → <b className="text-red-700">{fmtBs(c.despues.multa_bs + c.despues.deuda_congelada_bs)}</b></td>
                              <td className="py-1.5 px-2 text-center">{fmtBs(c.antes.saldo_favor_bs)} → <b>{fmtBs(c.despues.saldo_favor_bs)}</b></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-slate-500 text-xs">No hay deuda que devolver (el pago no descontó meses ni multas). Solo se borrará el pago.</div>
                    )}
                    {eliminar.preview.facturasReabrir?.length > 0 && (
                      <div className="text-xs text-slate-600 mt-2">Facturas internas que vuelven a Pendiente: {eliminar.preview.facturasReabrir.join(', ')}</div>
                    )}
                  </div>
                  <div>
                    <label className="font-bold text-slate-800" htmlFor="motivo-eliminar">Motivo (obligatorio)</label>
                    <textarea
                      id="motivo-eliminar"
                      value={eliminar.motivo}
                      onChange={e => setEliminar({ ...eliminar, motivo: e.target.value })}
                      rows={2}
                      placeholder="Ej.: pago duplicado, referencia bancaria inexistente, cobro de prueba…"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
              <button onClick={() => setEliminar(null)} disabled={eliminar.cargando} className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold text-sm cursor-pointer disabled:opacity-50">
                {eliminar.hecho ? 'Cerrar' : 'Cancelar'}
              </button>
              {!eliminar.hecho && eliminar.preview && (
                <button
                  id="btn-confirmar-eliminar-pago"
                  onClick={confirmarEliminar}
                  disabled={eliminar.cargando || eliminar.motivo.trim().length < 5}
                  className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-extrabold text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {eliminar.cargando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Eliminar pago y devolver deuda
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE REVISIÓN DE COMPROBANTE DE RETENCIÓN DE IVA ══ */}
      {modalRetencion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Cabecera */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-sm">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">Revisión de Comprobante de Retención IVA</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Agente de Retención (75% IVA) · IAMEC Naguanagua</p>
                </div>
              </div>
              <button
                onClick={() => setModalRetencion(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Resumen del Contribuyente y Factura */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Contribuyente</span>
                  <span className="font-extrabold text-slate-800 text-sm block mt-0.5">{modalRetencion.contribuyente}</span>
                  <span className="font-mono text-slate-500 font-bold">{modalRetencion.identidad}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Factura Emitida</span>
                  <span className="font-extrabold text-blue-800 text-sm block mt-0.5">
                    {modalRetencion.numeroDocumento ? `Factura N° ${modalRetencion.numeroDocumento}` : 'Por Emitir'}
                  </span>
                  <span className="font-mono text-slate-500">Ctrl: {modalRetencion.numeroControl || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Monto Total Factura</span>
                  <span className="font-mono font-black text-slate-900 text-sm">Bs {fmtBs(modalRetencion.monto)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-700 uppercase block">Monto Retención IVA (75%)</span>
                  <span className="font-mono font-black text-amber-700 text-sm">
                    Bs {fmtBs(modalRetencion.retencionMontoPlanilla || modalRetencion.montoRetencion || 0)}
                  </span>
                </div>
              </div>

              {/* Datos de la Planilla reportada */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                    <FileText className="w-4 h-4 text-amber-600" />
                    Comprobante de Retención de IVA
                  </h4>
                  <span className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${
                    modalRetencion.retencionEstado === 'aprobada'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : modalRetencion.retencionEstado === 'rechazada'
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : modalRetencion.retencionPlanillaUrl || modalRetencion.retencionEstado === 'planilla_recibida'
                      ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}>
                    {modalRetencion.retencionEstado === 'aprobada'
                      ? 'Aprobado · Factura Enviada'
                      : modalRetencion.retencionEstado === 'rechazada'
                      ? 'Rechazado'
                      : modalRetencion.retencionPlanillaUrl || modalRetencion.retencionEstado === 'planilla_recibida'
                      ? 'Por Revisar (Planilla subida)'
                      : 'Esperando Planilla del Contribuyente'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">N° de Comprobante / Planilla:</span>
                    <span className="font-mono font-black text-slate-800 text-sm">
                      {modalRetencion.retencionNumeroPlanilla || modalRetencion.detalles?.numero_planilla || 'No registrado aún'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Fecha del Comprobante:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {modalRetencion.retencionFechaPlanilla || '—'}
                    </span>
                  </div>
                </div>

                {/* Archivo adjunto */}
                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-700">Archivo de Comprobante:</span>
                  <div className="flex items-center gap-2">
                    {modalRetencion.retencionPlanillaUrl ? (
                      <a
                        href={modalRetencion.retencionPlanillaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-xs transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Ver / Descargar Comprobante</span>
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-slate-400 italic">No ha adjuntado archivo aún</span>
                    )}

                    {modalRetencion.retencionEstado !== 'aprobada' && !modoSubirPlanilla && (
                      <button
                        type="button"
                        onClick={() => setModoSubirPlanilla(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-amber-700" />
                        <span>{modalRetencion.retencionPlanillaUrl ? 'Modificar Planilla' : 'Montar Planilla'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {modalRetencion.retencionMotivoRechazo && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                    <strong>Motivo de rechazo previo:</strong> {modalRetencion.retencionMotivoRechazo}
                  </div>
                )}
              </div>

              {/* Si no tiene planilla y no está en modo subir planilla */}
              {!modalRetencion.retencionPlanillaUrl && !modoSubirPlanilla && modalRetencion.retencionEstado !== 'aprobada' && (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Opciones del Operador:</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Puede <strong>aprobar la retención sin planilla</strong> para enviar la factura electrónica al correo del cliente inmediatamente, o hacer clic en <strong>Montar Planilla</strong> si el cliente entregó el comprobante en físico o por correo.
                  </p>
                </div>
              )}

              {/* Formulario para que el Operador monte la planilla */}
              {modoSubirPlanilla && (
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                    <h5 className="font-black text-xs text-amber-950 flex items-center gap-1.5 uppercase">
                      <Upload className="w-4 h-4 text-amber-700" />
                      Montar Comprobante de Retención (Operador)
                    </h5>
                    <button
                      type="button"
                      onClick={() => setModoSubirPlanilla(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        N° de Comprobante / Planilla
                      </label>
                      <input
                        type="text"
                        value={numComprobanteOp}
                        onChange={e => setNumComprobanteOp(e.target.value)}
                        placeholder="Ej.: 20261000000123"
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Fecha del Comprobante
                      </label>
                      <input
                        type="date"
                        value={fechaComprobanteOp}
                        onChange={e => setFechaComprobanteOp(e.target.value)}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Adjuntar Archivo de Comprobante (PDF o Imagen)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={e => setArchivoPlanilla(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-600 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer bg-white border border-amber-300 rounded-lg p-1"
                    />
                    {archivoPlanilla && (
                      <p className="text-[10px] text-emerald-700 font-bold mt-1">
                        ✓ Archivo seleccionado: {archivoPlanilla.name} ({Math.round(archivoPlanilla.size / 1024)} KB)
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200">
                    <button
                      type="button"
                      onClick={() => setModoSubirPlanilla(false)}
                      disabled={procesandoRet}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-amber-100 rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGuardarPlanillaOperador(false)}
                      disabled={procesandoRet}
                      className="px-3.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 border border-amber-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      {procesandoRet ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      <span>Solo Guardar Planilla</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGuardarPlanillaOperador(true)}
                      disabled={procesandoRet}
                      className="px-3.5 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      {procesandoRet ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      <span>Guardar y Aprobar (Enviar Factura)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Si está en modo rechazo */}
              {modoRechazo && (
                <div className="p-3.5 rounded-xl border border-red-300 bg-red-50/70 space-y-2">
                  <label className="block text-xs font-black text-red-900" htmlFor="motivo-rechazo-ret">
                    Indique el motivo del rechazo (será enviado por correo al contribuyente):
                  </label>
                  <textarea
                    id="motivo-rechazo-ret"
                    value={motivoRechazoRet}
                    onChange={e => setMotivoRechazoRet(e.target.value)}
                    rows={2}
                    placeholder="Ej.: El monto retenido no coincide con el 75% del IVA, el número de control es incorrecto, etc."
                    className="w-full text-xs p-2.5 rounded-lg border border-red-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setModoRechazo(false)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleRevisarRetencion('rechazar')}
                      disabled={procesandoRet || !motivoRechazoRet.trim()}
                      className="px-3 py-1.5 text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      {procesandoRet ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      Confirmar Rechazo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pie de acciones */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => setModalRetencion(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Cerrar
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {modalRetencion.retencionEstado !== 'aprobada' && !modoRechazo && !modoSubirPlanilla && (
                  <>
                    <button
                      onClick={() => setModoRechazo(true)}
                      disabled={procesandoRet}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Rechazar</span>
                    </button>

                    {/* Opción 1: Aprobar SIN planilla y enviar factura */}
                    <button
                      onClick={() => handleRevisarRetencion('aprobar', true)}
                      disabled={procesandoRet}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      title="Aprobar de oficio sin esperar comprobante y enviar la factura oficial al correo del contribuyente"
                    >
                      <Send className="w-3.5 h-3.5 text-blue-600" />
                      <span>Aprobar sin Planilla</span>
                    </button>

                    {/* Opción 2: Aprobar normal y enviar factura */}
                    <button
                      onClick={() => handleRevisarRetencion('aprobar', false)}
                      disabled={procesandoRet}
                      className="px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      title="Aprobar el comprobante de retención y enviar la factura fiscal oficial"
                    >
                      {procesandoRet ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-white" />}
                      <span>Aprobar y Enviar Factura</span>
                    </button>
                  </>
                )}

                {modalRetencion.retencionEstado === 'aprobada' && (
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Retención aprobada y factura enviada por correo</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DEMO Y VISTA PREVIA DE FACTURA FISCAL ELECTRÓNICA ══ */}
      {selectedPagoForDemo && (
        <DemoFacturaModal
          isOpen={!!selectedPagoForDemo}
          onClose={() => setSelectedPagoForDemo(null)}
          pago={selectedPagoForDemo}
          onProcederEmitir={handleOpenEmitModal}
        />
      )}
    </div>
  );
}
