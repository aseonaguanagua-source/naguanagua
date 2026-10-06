'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Send, CheckCircle, AlertTriangle, ExternalLink, 
  RefreshCw, Receipt, Search, Mail, Filter, Eye, ShieldCheck, 
  Sliders, ArrowUpRight, Check, X, Building, CheckCircle2,
  AlertCircle, Key, Layers, ArrowRight, ShieldAlert, Sparkles,
  Info
} from 'lucide-react';

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
  recibo_multa_comercial: { label: 'RECIBO · Multa comercial', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
};

export default function FacturacionElectronicaPage() {
  const [pagosList, setPagosList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'todos' | 'pendientes' | 'emitidas'>('pendientes');

  // Día y tipo de documento (Facturas comerciales vs Recibos por correo)
  const [fecha, setFecha] = useState<string>(hoyCaracas());
  const [docTab, setDocTab] = useState<'factura' | 'recibo'>('factura');

  // Vista previa de recibo
  const [previewPagoId, setPreviewPagoId] = useState<string | null>(null);

  // Lote del día (revisión + envío)
  const [loteModal, setLoteModal] = useState<null | 'factura' | 'recibo'>(null);
  const [loteSeleccion, setLoteSeleccion] = useState<Set<string>>(new Set());
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

  // Modal de Ajuste y Emisión Manual Individual
  const [selectedPagoForEmit, setSelectedPagoForEmit] = useState<any | null>(null);
  const [ajusteMontoServicio, setAjusteMontoServicio] = useState<string>('');
  const [ajusteMontoMulta, setAjusteMontoMulta] = useState<string>('0');
  const [ajusteConcepto, setAjusteConcepto] = useState<string>('');
  const [isEmitting, setIsEmitting] = useState(false);
  const [enviarCorreoAlEmitir, setEnviarCorreoAlEmitir] = useState(true);
  const [correoDestinoEmision, setCorreoDestinoEmision] = useState('');

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
        setPagosList(data.items || []);
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

  // Separación del día: facturas (comerciales) y recibos (residenciales / comerciales solo multa)
  const facturasDia = pagosList.filter(p => p.documento === 'factura');
  const recibosDia = pagosList.filter(p => p.documento === 'recibo');
  const delTipo = docTab === 'factura' ? facturasDia : recibosDia;
  const visibles = delTipo.filter(p =>
    filterTab === 'pendientes' ? !p.procesado : filterTab === 'emitidas' ? p.procesado : true
  );
  const totalPendientes = delTipo.filter(p => !p.procesado).length;
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
  const handleOpenEmitModal = (pago: any) => {
    setSelectedPagoForEmit(pago);
    const montoTotal = pago.monto || 0;
    const baseEstimada = (montoTotal / 1.16).toFixed(2);
    setAjusteMontoServicio(baseEstimada);
    setAjusteMontoMulta('0.00');
    setAjusteConcepto(`Servicio de Aseo Urbano Comercial - ${getMesActual()}`);
    setCorreoDestinoEmision(pago.correo || tfhkaConfig?.config?.fallbackEmail || 'facturacion.naguanagua@gmail.com');
    setEnviarCorreoAlEmitir(true);
  };

  // 3. Ejecutar Emisión Manual Individual
  const handleConfirmarEmision = async () => {
    if (!selectedPagoForEmit) return;
    setIsEmitting(true);
    try {
      const base = parseFloat(ajusteMontoServicio) || 0;
      const multa = parseFloat(ajusteMontoMulta) || 0;
      const iva = parseFloat((base * 0.16).toFixed(2));
      const total = base + multa + iva;

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
          contribuyente: selectedPagoForEmit.contribuyente,
          identidad: selectedPagoForEmit.identidad,
          formasPago: [{
            descripcion: selectedPagoForEmit.tipo || 'Transferencia',
            fecha: new Date().toISOString(),
            forma: '05',
            monto: total
          }],
          enviarCorreo: enviarCorreoAlEmitir,
          correoDestino: correoDestinoEmision
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.skipped) {
          alert(`Aviso: ${data.message || 'Exento de factura fiscal comercial'}`);
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
          <p className="text-[11px] text-slate-500 mt-1">Comerciales (servicio de aseo con IVA)</p>
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
          <p className="text-[11px] text-slate-500 mt-1">Residenciales y comerciales que solo pagaron multa</p>
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
              {docTab === 'factura' ? 'Emitidas SENIAT' : 'Enviados por correo'}
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
                  <td colSpan={8} className="text-center py-14 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    Cargando listado de facturas y pagos...
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-slate-400">
                    No hay {docTab === 'factura' ? 'facturas' : 'recibos'} con los filtros seleccionados para el {fecha.split('-').reverse().join('/')}.
                  </td>
                </tr>
              ) : (
                visibles.map((pago: any) => {
                  const sub = SUBTIPO_LABEL[pago.subtipo] || SUBTIPO_LABEL.recibo_residencial;
                  return (
                    <tr key={pago.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {pago.identidad}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800 text-[13px] block">{pago.contribuyente}</span>
                        {pago.referencia && (
                          <span className="text-[10px] text-slate-400 font-mono">Ref: {pago.referencia}</span>
                        )}
                        {pago.inmuebles?.length > 0 && (
                          <span className="block text-[10px] text-slate-400 font-mono">{pago.inmuebles.join(', ')}</span>
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
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900 text-sm">
                        Bs {pago.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        ) : pago.facturaEmitida ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Emitida SENIAT
                            </span>
                            {pago.numeroControl && (
                              <span className="block font-mono text-[10px] text-slate-500">
                                Ctrl: {pago.numeroControl}
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
                                  <span>PDF</span>
                                </a>
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
                          ) : (
                            <>
                              {/* Botón Verificar Factura antes de enviarla */}
                              <button
                                onClick={() => handleVerifyPago(pago)}
                                className="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-indigo-200 transition-colors cursor-pointer"
                                title="Verificar y auditar los datos fiscales antes de emitir"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Verificar</span>
                              </button>

                              {/* Botón Emitir */}
                              <button
                                onClick={() => handleOpenEmitModal(pago)}
                                className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                title="Emitir Factura Digital a The Factory HKA"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#c8e64c]" />
                                <span>Emitir</span>
                              </button>
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

                    <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Base Imponible Gravada (16% IVA):</span>
                        <strong className="font-mono">Bs {verificationResult.totales?.baseImponible?.toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between text-blue-700">
                        <span>Impuesto al Valor Agregado (IVA):</span>
                        <strong className="font-mono">Bs {verificationResult.totales?.iva?.toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between text-slate-900 text-sm font-black border-t border-slate-200 pt-1.5">
                        <span>Total Documento Fiscal:</span>
                        <strong className="font-mono text-emerald-700 text-base">
                          Bs {verificationResult.totales?.montoTotal?.toFixed(2)}
                        </strong>
                      </div>
                      <p className="text-[11px] text-slate-500 italic pt-1">
                        &laquo;{verificationResult.totales?.montoEnLetras}&raquo;
                      </p>
                    </div>
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
              <button
                onClick={() => setSelectedPagoForVerify(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cerrar
              </button>
              {verificationResult?.ok && (
                <button
                  onClick={() => {
                    handleOpenEmitModal(selectedPagoForVerify);
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
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Contribuyente</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedPagoForEmit.contribuyente}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">R.I.F. / Cédula</span>
                  <span className="font-bold text-slate-900 text-sm font-mono">{selectedPagoForEmit.identidad}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Monto Total Pagado</span>
                  <span className="font-bold text-emerald-700 font-mono text-sm">
                    Bs {selectedPagoForEmit.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Forma de Pago</span>
                  <span className="font-semibold text-slate-700">{selectedPagoForEmit.tipo}</span>
                </div>
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
                </div>

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
              <button
                onClick={() => setSelectedPagoForEmit(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
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

      {/* ══ VISTA PREVIA DEL RECIBO ══ */}
      {previewPagoId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col h-[90vh]">
            <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-violet-300" />
                <h3 className="font-bold text-sm">Vista previa del recibo (así lo recibirá el contribuyente)</h3>
              </div>
              <button onClick={() => setPreviewPagoId(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe
              title="Vista previa del recibo"
              src={`/api/admin/recibos-digitales/preview?pagoId=${previewPagoId}`}
              className="flex-1 w-full border-0 bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
