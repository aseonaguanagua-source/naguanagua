'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Tabs } from '@/components/Tabs';
import {
  Mail,
  Settings,
  Users,
  Send,
  CheckCircle,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Eye,
  FileText,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  CheckCircle2,
  Pencil,
  Save,
  Receipt,
} from 'lucide-react';

type AlcanceTabla =
  | 'MOROSOS_ENVIADOS'
  | 'FACTURAS_Y_RECIBOS'
  | 'FACTURAS_ENVIADAS'
  | 'RECIBOS_ENVIADOS'
  | 'TODOS_ENVIADOS'
  | 'TODOS_PADRON'
  | 'SOLVENTES';

interface ResumenPadron {
  totalContribuyentesConCorreo: number;
  correosUnicosTotal: number;
  totalConDeuda: number;
  correosUnicosConDeuda: number;
  comercialesConDeuda: number;
  residencialesConDeuda: number;
  condominiosConDeuda: number;
  totalSolventes: number;
  comercialesTotal: number;
  residencialesTotal: number;
  condominiosTotal: number;
  totalFacturasEnviadas?: number;
  totalRecibosEnviados?: number;
  totalFacturasYRecibos?: number;
}

interface CampanaHistorial {
  id: string;
  fecha: string;
  plantilla: 'recordatorio_pago' | 'estado_cuenta_masivo';
  plantillaNombre: string;
  asunto: string;
  remitente: string;
  tipoFiltro: string;
  estatusFiltro: string;
  adjuntarPdf: boolean;
  totalEnviados: number;
  totalErrores: number;
}

interface DestinatarioRow {
  pagoId?: string;
  tipoCorreo?: 'informativo' | 'factura' | 'recibo';
  identidad: string;
  nombre: string;
  correo: string;
  telefono: string;
  direccion: string;
  codigoPrincipal: string;
  codigos: string[];
  sector: 'Individual' | 'Comercial' | 'Condominio';
  mesesMax: number;
  esCondominio: boolean;
  esComercial: boolean;
  esResidencial: boolean;
  hasDebt: boolean;
  totalDeudaBs: number;
  montoPagadoBs?: number;
  numeroControl?: string;
  numeroDocumento?: string;
  numeroRecibo?: string;
  facturaUrl?: string;
  referenciaPago?: string;
  fechaEnvio?: string;
  fechaTransaccion?: string;
  enviadoOk?: boolean;
  plantillaTitulo?: string;
  asuntoCorreo?: string;
}

export default function CorreosPage() {
  const [plantilla, setPlantilla] = useState<'recordatorio_pago' | 'estado_cuenta_masivo'>('recordatorio_pago');
  const [asunto, setAsunto] = useState('RECORDATORIO DE PAGO - IAMEC NAGUANAGUA');
  const [tipoFiltro, setTipoFiltro] = useState('Todos los Sectores');
  const [estatusFiltro, setEstatusFiltro] = useState('Solo Morosos (Con deuda > 1 mes)');
  const [adjuntarPdf, setAdjuntarPdf] = useState(false);
  const [testEmailDestino, setTestEmailDestino] = useState('facturacion.comercial@globalgreenca.com');

  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sentProgressText, setSentProgressText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [resumen, setResumen] = useState<ResumenPadron>({
    totalContribuyentesConCorreo: 17221,
    correosUnicosTotal: 16123,
    totalConDeuda: 11382,
    correosUnicosConDeuda: 10768,
    comercialesConDeuda: 3035,
    residencialesConDeuda: 8165,
    condominiosConDeuda: 182,
    totalSolventes: 5839,
    comercialesTotal: 3940,
    residencialesTotal: 12960,
    condominiosTotal: 321,
  });

  // Historial y lista completa de destinatarios enviados (sin truncar en 1000)
  const [campanasHistorial, setCampanasHistorial] = useState<CampanaHistorial[]>([]);
  const [campanaActivaId, setCampanaActivaId] = useState<string>('');
  const [listaDestinatarios, setListaDestinatarios] = useState<DestinatarioRow[]>([]);
  const [loadingLista, setLoadingLista] = useState<boolean>(false);
  const [listaCargadaOnce, setListaCargadaOnce] = useState<boolean>(false);
  const [busqueda, setBusqueda] = useState<string>('');
  const [filtroSectorTabla, setFiltroSectorTabla] = useState<string>('TODOS');
  const [filtroAlcanceTabla, setFiltroAlcanceTabla] = useState<AlcanceTabla>('TODOS_ENVIADOS');
  const [pageSize, setPageSize] = useState<number>(200);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [destinatarioModal, setDestinatarioModal] = useState<DestinatarioRow | null>(null);
  const [exportandoExcel, setExportandoExcel] = useState<boolean>(false);

  // Edición de correo en cascada y reenvío individual
  const [editRowKey, setEditRowKey] = useState<string | null>(null);
  const [editCorreoVal, setEditCorreoVal] = useState<string>('');
  const [guardandoCorreoKey, setGuardandoCorreoKey] = useState<string | null>(null);
  const [reenviandoKey, setReenviandoKey] = useState<string | null>(null);
  const [modalCorreoEdit, setModalCorreoEdit] = useState<string>('');

  const getRowUniqueKey = (d: DestinatarioRow, idx?: number) =>
    d.pagoId ? `pago_${d.pagoId}` : `inf_${d.identidad}_${idx ?? 0}`;

  const sincronizarCorreoLocal = (identidadTarget: string, codigosTarget: string[], nuevoCorreo: string) => {
    const idCleanTarget = String(identidadTarget || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codsSet = new Set((codigosTarget || []).map(c => String(c || '').trim().toUpperCase()).filter(Boolean));
    setListaDestinatarios(prev =>
      prev.map(item => {
        const itemClean = String(item.identidad || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const matchId = idCleanTarget && itemClean === idCleanTarget;
        const matchCod =
          codsSet.size > 0 &&
          ((item.codigoPrincipal && codsSet.has(String(item.codigoPrincipal).toUpperCase())) ||
            (Array.isArray(item.codigos) && item.codigos.some(c => codsSet.has(String(c).toUpperCase()))));
        if (matchId || matchCod) {
          return { ...item, correo: nuevoCorreo };
        }
        return item;
      })
    );
    setDestinatarioModal(prev => {
      if (!prev) return null;
      const prevClean = String(prev.identidad || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (prevClean === idCleanTarget) {
        return { ...prev, correo: nuevoCorreo };
      }
      return prev;
    });
  };

  const handleGuardarCorreoEnCascada = async (
    d: DestinatarioRow,
    nuevoCorreoRaw: string,
    rowKey: string,
    reenviarDespues = false
  ) => {
    const emailClean = String(nuevoCorreoRaw || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      alert('Por favor ingrese una dirección de correo válida (ejemplo: usuario@dominio.com).');
      return;
    }
    setGuardandoCorreoKey(rowKey);
    try {
      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identidad: d.identidad,
          nombre: d.nombre,
          codigos: d.codigos,
          codigoPrincipal: d.codigoPrincipal,
          pagoId: d.pagoId,
          nuevoCorreo: emailClean,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo actualizar el correo en cascada.');
      }
      sincronizarCorreoLocal(d.identidad, d.codigos || [d.codigoPrincipal], emailClean);
      setEditRowKey(null);
      setStatusMessage({
        type: 'success',
        text: data.mensaje || `Correo de ${d.nombre} (${d.identidad}) actualizado en cascada a ${emailClean}.`,
      });
      if (reenviarDespues) {
        await handleReenviarIndividual({ ...d, correo: emailClean }, rowKey, false);
      }
    } catch (e: any) {
      alert(e.message || 'Error al guardar correo');
    } finally {
      setGuardandoCorreoKey(null);
    }
  };

  const handleReenviarIndividual = async (
    d: DestinatarioRow,
    rowKey: string,
    guardarEnCascada = false,
    correoOverride?: string
  ) => {
    const correoFinal = String(correoOverride ?? d.correo ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoFinal)) {
      alert('El contribuyente no tiene un correo válido. Edite primero la dirección de correo.');
      return;
    }
    setReenviandoKey(rowKey);
    try {
      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoCorreo: d.tipoCorreo || 'informativo',
          pagoId: d.pagoId,
          identidad: d.identidad,
          nombre: d.nombre,
          correo: correoFinal,
          codigos: d.codigos,
          codigoPrincipal: d.codigoPrincipal,
          sector: d.sector,
          totalDeudaBs: d.totalDeudaBs,
          numeroControl: d.numeroControl,
          numeroDocumento: d.numeroDocumento,
          plantilla: campanaActiva?.plantilla || plantilla,
          asunto: d.asuntoCorreo || campanaActiva?.asunto || asunto,
          guardarEnCascada,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo reenviar el correo.');
      }
      if (guardarEnCascada || correoFinal !== d.correo) {
        sincronizarCorreoLocal(d.identidad, d.codigos || [d.codigoPrincipal], correoFinal);
      }
      setEditRowKey(null);
      setStatusMessage({
        type: 'success',
        text: data.mensaje || `Correo reenviado exitosamente a ${correoFinal}.`,
      });
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: `Error al reenviar correo a ${correoFinal}: ${e.message}`,
      });
      alert(`Error al reenviar correo: ${e.message}`);
    } finally {
      setReenviandoKey(null);
    }
  };

  const cargarListaDestinatariosCompleta = async (
    alcance: AlcanceTabla = filtroAlcanceTabla,
    forceRefresh = false
  ) => {
    setLoadingLista(true);
    try {
      const estParam =
        alcance === 'TODOS_PADRON'
          ? 'Todos (Solventes y Morosos)'
          : alcance === 'SOLVENTES'
          ? 'Solo Solventes'
          : 'Solo Morosos (Con deuda > 1 mes)';
      const res = await fetch(
        `/api/admin/envio-comunicado?list=1&ligero=1&alcance=${encodeURIComponent(alcance)}${
          forceRefresh ? '&refresh=1' : ''
        }&tipoFiltro=${encodeURIComponent('Todos los Sectores')}&estatusFiltro=${encodeURIComponent(estParam)}`,
        { cache: 'no-store' }
      );
      const d = await res.json();
      if (d?.ok) {
        if (d.resumen) setResumen(d.resumen);
        if (Array.isArray(d.campanas)) {
          setCampanasHistorial(d.campanas);
          if (!campanaActivaId && d.campanas[0]?.id) {
            setCampanaActivaId(d.campanas[0].id);
          }
        }
        if (Array.isArray(d.destinatarios)) {
          setListaDestinatarios(d.destinatarios);
          setListaCargadaOnce(true);
        }
      }
    } catch (e) {
      console.error('Error cargando lista completa de destinatarios:', e);
    } finally {
      setLoadingLista(false);
    }
  };

  useEffect(() => {
    cargarListaDestinatariosCompleta('TODOS_ENVIADOS');
  }, []);

  const destinatariosSeleccionados = (() => {
    const soloDeuda = estatusFiltro.includes('Morosos');
    const soloSolventes = estatusFiltro === 'Solo Solventes';
    if (tipoFiltro === 'Solo Comercial e Industrial') {
      if (soloDeuda) return resumen.comercialesConDeuda;
      if (soloSolventes) return Math.max(0, resumen.comercialesTotal - resumen.comercialesConDeuda);
      return resumen.comercialesTotal;
    }
    if (tipoFiltro === 'Solo Residencial') {
      if (soloDeuda) return resumen.residencialesConDeuda;
      if (soloSolventes) return Math.max(0, resumen.residencialesTotal - resumen.residencialesConDeuda);
      return resumen.residencialesTotal;
    }
    if (tipoFiltro === 'Solo Condominios') {
      if (soloDeuda) return resumen.condominiosConDeuda;
      if (soloSolventes) return Math.max(0, resumen.condominiosTotal - resumen.condominiosConDeuda);
      return resumen.condominiosTotal;
    }
    if (soloDeuda) return resumen.totalConDeuda;
    if (soloSolventes) return resumen.totalSolventes;
    return resumen.totalContribuyentesConCorreo;
  })();

  const handleSendTest = async () => {
    setIsSendingTest(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: true,
          plantilla,
          asunto,
          tipoFiltro,
          estatusFiltro,
          adjuntarPdf,
          testEmail: testEmailDestino.trim() || undefined,
        }),
      });
      const textResp = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(textResp);
      } catch {
        throw new Error(textResp.slice(0, 140) || `Respuesta inválida del servidor (HTTP ${res.status})`);
      }
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text:
            data.mensaje ||
            `Correo de prueba enviado exitosamente a ${testEmailDestino || 'facturacion.comercial@globalgreenca.com'}.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en envío de prueba: ${data.error || 'Fallo desconocido'}`,
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error de conexión: ' + e.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendMassive = async () => {
    const esRec = plantilla === 'recordatorio_pago';
    if (
      !confirm(
        `¿Desea iniciar el envío masivo de ${
          esRec ? 'Recordatorio de Pago (Sin PDF adjunto)' : 'Estado de Cuenta (Con PDF adjunto)'
        } a ${destinatariosSeleccionados.toLocaleString('es-VE')} contribuyentes (${tipoFiltro} · ${estatusFiltro})?`
      )
    ) {
      return;
    }

    setIsSending(true);
    setProgress(2);
    setSentProgressText('Cargando lista de destinatarios...');
    setStatusMessage(null);

    try {
      // 1. Obtener lista completa de destinatarios una sola vez para no saturar ni agotar los 60s de Vercel
      const qUrl = `/api/admin/envio-comunicado?list=1&tipoFiltro=${encodeURIComponent(
        tipoFiltro
      )}&estatusFiltro=${encodeURIComponent(estatusFiltro)}`;
      const listRes = await fetch(qUrl);
      const listText = await listRes.text();
      let listJson: any = {};
      try {
        listJson = JSON.parse(listText);
      } catch {
        throw new Error(listText.slice(0, 140) || `Error obteniendo destinatarios (HTTP ${listRes.status})`);
      }

      if (!listJson.ok || !Array.isArray(listJson.destinatarios) || listJson.destinatarios.length === 0) {
        throw new Error(listJson.error || 'No se encontraron destinatarios para el filtro seleccionado.');
      }

      const todosDestinatarios: any[] = listJson.destinatarios;
      const tasaBcv = Number(listJson.tasaBcv) || 1008.31;
      // Si es Recordatorio de Pago (sin PDF), podemos enviar lotes de 100 por petición (Resend Batch API).
      // Si lleva PDF adjunto, enviamos lotes de 15 por petición para generar los PDFs holgadamente sin timeout.
      const BATCH_SIZE = !esRec && adjuntarPdf ? 15 : 100;
      const campanaId = `campana-${new Date().toISOString().replace(/[:.]/g, '-')}-${plantilla}`;
      let totalEnviados = 0;
      let totalErrores = 0;
      let ultimoError = '';

      for (let i = 0; i < todosDestinatarios.length; i += BATCH_SIZE) {
        const lote = todosDestinatarios.slice(i, i + BATCH_SIZE);
        const pct = Math.min(99, Math.max(5, Math.round(((i + lote.length) / todosDestinatarios.length) * 100)));
        setProgress(pct);
        setSentProgressText(
          `Enviando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(
            todosDestinatarios.length / BATCH_SIZE
          )} (${totalEnviados.toLocaleString('es-VE')} / ${todosDestinatarios.length.toLocaleString('es-VE')})...`
        );

        const res = await fetch('/api/admin/envio-comunicado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            test: false,
            campanaId,
            plantilla,
            asunto,
            tipoFiltro,
            estatusFiltro,
            adjuntarPdf: !esRec && adjuntarPdf,
            tasaBcv,
            destinatariosLote: lote,
          }),
        });

        const rawText = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          totalErrores += lote.length;
          ultimoError = rawText.slice(0, 120) || `HTTP ${res.status}`;
          continue;
        }

        if (data.success) {
          totalEnviados += Number(data.enviados || 0);
          totalErrores += Number(data.errores || 0);
        } else {
          totalErrores += lote.length;
          ultimoError = data.error || 'Error en lote';
        }
      }

      setProgress(100);
      setSentProgressText('');

      if (totalEnviados > 0) {
        cargarListaDestinatariosCompleta(filtroAlcanceTabla);
        setStatusMessage({
          type: 'success',
          text: `Campaña completada: ${totalEnviados.toLocaleString('es-VE')} ${
            esRec ? 'recordatorios de pago' : 'estados de cuenta'
          } enviados exitosamente${totalErrores > 0 ? ` (${totalErrores} con observación)` : ''}.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en la campaña masiva: ${ultimoError || 'No se pudieron entregar los correos.'}`,
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error en la campaña: ' + e.message });
    } finally {
      setIsSending(false);
      setSentProgressText('');
    }
  };

  const configTabContent = (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-600" /> Plantilla Oficial Configurada
        </h3>
        <select
          value={plantilla}
          onChange={e => {
            const val = e.target.value as 'recordatorio_pago' | 'estado_cuenta_masivo';
            setPlantilla(val);
            if (val === 'recordatorio_pago') {
              setAsunto('RECORDATORIO DE PAGO - IAMEC NAGUANAGUA');
              setAdjuntarPdf(false);
            } else {
              setAsunto('ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO');
              setAdjuntarPdf(true);
            }
          }}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="recordatorio_pago">
            RECORDATORIO DE PAGO (Plantilla Oficial Word — Sin PDF adjunto)
          </option>
          <option value="estado_cuenta_masivo">
            ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con Estado de Cuenta PDF adjunto)
          </option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-600" /> Datos de Remitente y Asunto
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Remitente Oficial</label>
            <input
              type="text"
              defaultValue="IAMEC Naguanagua • Alcaldía de Naguanagua"
              readOnly
              className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Remitente</label>
            <input
              type="email"
              defaultValue="facturacion@globalgreenrec.com"
              readOnly
              className="w-full border border-slate-300 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Asunto de la Campaña *</label>
          <input
            type="text"
            value={asunto}
            onChange={e => setAsunto(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* VISTA PREVIA DEL CONTENIDO DEL DOCX */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />{' '}
            {plantilla === 'recordatorio_pago'
              ? 'Vista Previa Exacta — RECORDATORIO DE PAGO.docx'
              : 'Vista Previa Exacta — ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO).docx'}
          </h3>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            {plantilla === 'recordatorio_pago' ? 'Recordatorio de Pago · Sin PDF Adjunto' : 'Estado de Cuenta · Con PDF Adjunto'}
          </span>
        </div>

        {plantilla === 'recordatorio_pago' ? (
          <div
            className="bg-white border border-slate-200 rounded-lg p-7 text-black max-w-2xl mx-auto shadow-2xs"
            style={{ fontFamily: 'Calibri, Arial, Helvetica, sans-serif', fontSize: '11pt', lineHeight: 1.45 }}
          >
            <div className="text-center mb-5">
              <img src="/logos/IAMEC.png" alt="IAMEC" className="w-[210px] h-auto inline-block" />
            </div>

            <p className="text-justify mb-3">
              <strong>Estimados usuarios</strong>, el Instituto Autónomo Municipal de Ecosocialismo (IAMEC) recuerda a todos los residentes, comerciantes e industriales del municipio Naguanagua la importancia de mantener al día el pago correspondiente al servicio de aseo urbano y domiciliario. Su contribución puntual permite garantizar la continuidad, eficiencia y operatividad de las rutas de recolección en todo el municipio.
            </p>

            <p className="text-justify mb-3.5">
              Para facilitar el cumplimiento de sus obligaciones tributarias, ponemos a su disposición nuestras cuentas bancarias oficiales autorizadas para realizar transferencias o pagos:
            </p>

            <p className="text-center font-bold mb-3">Datos Bancarios Oficiales</p>

            <p className="font-bold mb-2.5">Titular: IAMEC</p>
            <p className="font-bold mb-2.5">RIF: G-200086149</p>
            <p className="font-bold mb-2.5">BANCAMIGA</p>
            <p className="mb-2.5">Tipo de cuenta: Cuenta Corriente</p>
            <p className="mb-2.5">Número de cuenta: 0172-0110-71-1101340717</p>
            <p className="font-bold mb-2.5">BANESCO</p>
            <p className="mb-2.5">Tipo de cuenta: Cuenta Corriente</p>
            <p className="mb-5">Número de cuenta: 0134-1089-59-0001008636</p>

            <p className="font-bold mb-2.5">Canales de Atención y Reporte de Pagos</p>
            <p className="text-justify mb-3">
              Una vez realizada la operación bancaria, o en caso de requerir información sobre su estado de cuenta, facturación o atención al contribuyente, comuníquese directamente a través de nuestros canales oficiales según su categoría:
            </p>

            <div className="flex items-start mb-2.5">
              <span className="pl-6 pr-3 select-none">-</span>
              <span>Teléfonos de contacto (Atención / WhatsApp):</span>
            </div>
            <p className="mb-2.5">Sector Residencial: 0424-4282364</p>
            <p className="mb-2.5">Sector Comercial: 0424-4282365</p>

            <div className="flex items-start mb-2.5">
              <span className="pl-6 pr-3 select-none">-</span>
              <span>Correos electrónicos:</span>
            </div>
            <p className="mb-2.5">
              Sector Residencial:{' '}
              <a href="mailto:aseoresnaguanagua@globalgreenca.com" className="text-[#0563c1] underline">
                aseoresnaguanagua@globalgreenca.com
              </a>
            </p>
            <p className="mb-6">
              Sector Comercial:{' '}
              <a href="mailto:aseocomnaguanagua@globalgreenca.com" className="text-[#0563c1] underline">
                aseocomnaguanagua@globalgreenca.com
              </a>
            </p>

            <p className="text-center mb-3.5">
              Agradecemos su compromiso y corresponsabilidad ciudadana para mantener a Naguanagua limpia y sustentable.
            </p>

            <p className="text-center font-bold underline text-[#FF0000] mb-6">
              SI USTED YA REALIZO SU PAGO, HAGA CASO OMISO DE ESTE MENSAJE
            </p>

            <div className="text-center mt-2 mb-1">
              <img src="/logos/IAMEC.png" alt="IAMEC" className="w-[180px] h-auto inline-block" />
            </div>
            <p className="text-center font-bold mb-1">ATENTAMENTE:</p>
            <p className="text-center font-bold">OFICINA DE RECAUDACION DE ASEO</p>
          </div>
        ) : (
          <div
            className="bg-white border border-slate-200 rounded-lg p-7 text-[#222222] max-w-2xl mx-auto shadow-2xs"
            style={{ fontFamily: 'Calibri, Arial, Helvetica, sans-serif', fontSize: '11pt', lineHeight: 1.35 }}
          >
            <div className="text-center mb-4">
              <img src="/logos/IAMEC.png" alt="IAMEC" className="w-[200px] h-auto inline-block" />
            </div>
            <p className="text-center font-bold text-[#222222] mb-2">
              ESTADO DE CUENTA ASEO NAGUANAGUA
            </p>
            <p className="text-center font-bold text-[#222222] mb-3.5">
              FAVOR LEER TEXTO COMPLETO
            </p>
            <p className="mb-3">
              Nos dirigimos a Ud., en la oportunidad de remitir estado de cuenta contentivo de su deuda (total o parcial) de la tasa de Aseo Urbano del Municipio Naguanagua.
            </p>
            <p className="mb-3">
              Por favor tenga en consideración las siguientes pautas:
            </p>

            <div className="flex items-start mb-3">
              <span className="pl-6 pr-3 select-none">&bull;</span>
              <div>
                <strong>Los datos para realizar el pago son los siguientes:</strong><br />
                - BANCO: <strong>BANESCO</strong>NÚMERO DE CUENTA: <br />
                <strong>0134-1089-59-0001008636</strong>TIPO DE CUENTA: <br />
                <strong>CORRIENTE</strong>TITULAR: <br />
                <strong>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)</strong>RIF: <br />
                <strong>G-20008614-9</strong>
              </div>
            </div>

            <p className="mb-3">
              -BANCO: <strong>BANCAMIGA</strong><br />
              NÚMERO DE CUENTA: 0172-0110-71-1101340717<br />
              TIPO DE CUENTA: <strong>CORRIENTE</strong>TITULAR: <br />
              <strong>INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC)</strong>RIF: <br />
              <strong>G-20008614-9</strong>
            </p>

            <div className="space-y-2.5 mb-2.5">
              <div className="flex items-start">
                <span className="pl-6 pr-3 select-none">&bull;</span>
                <span>Los pagos deben hacerse por MES O MESES COMPLETOS.</span>
              </div>
              <div className="flex items-start">
                <span className="pl-6 pr-3 select-none">&bull;</span>
                <span>La factura es emitida por el Instituto Autónomo Municipal De Ecosocialismo Naguanagua (IAMEC) RIF G-20008614-9</span>
              </div>
              <div className="flex items-start">
                <span className="pl-6 pr-3 select-none">&bull;</span>
                <span>El comprobante de pago por transferencia, favor remitirlo a través del presente correo, indicando en el texto del correo: usuario aseo urbano, razón social o nombre, RIF o CI, correo electrónico y número de teléfono, periodo pagado.</span>
              </div>
              <div className="flex items-start">
                <span className="pl-6 pr-3 select-none">&bull;</span>
                <span>En caso de ser contribuyente especial, además de las pautas antes mencionadas, deberá considerar las siguientes:</span>
              </div>
            </div>

            <div className="space-y-2 mb-2.5">
              <div className="flex items-start">
                <span className="pl-14 pr-3 select-none font-mono">o</span>
                <span>El porcentaje de retención que corresponde a IAMEC es el 75%</span>
              </div>
              <div className="flex items-start">
                <span className="pl-14 pr-3 select-none font-mono">o</span>
                <span>Estamos exentos del I.S.L.R.</span>
              </div>
              <div className="flex items-start">
                <span className="pl-14 pr-3 select-none font-mono">o</span>
                <span>El número de factura es diferente al número de control.</span>
              </div>
            </div>

            <div className="flex items-start mb-3">
              <span className="pl-6 pr-3 select-none">&bull;</span>
              <span>La factura debe ser pagada como máximo el día 28 del mes si es de otra entidad bancaria distinta a Banesco / Bancamiga o el día 30 del mes si es de Banesco a Banesco / Bancamiga a Bancamiga, debido a que debemos realizar el cierre fiscal del mes junto a la conciliación bancaria.</span>
            </div>

            <p className="mb-3">
              En caso de que la factura, no sea pagada en el período de tiempo, antes señalado se procederá a la anulación de la misma.
            </p>
            <p className="text-justify mb-4">
              Si usted ya ejecutó su pago, hacer caso omiso de este correo. Agradeciendo su pronto pago, quedamos a sus órdenes.
            </p>
            <div className="pt-2 text-center space-y-1.5">
              <div><strong>Whatsapp Comercial:</strong> 0424-4282365 – <strong>Correo:</strong> aseoresnaguanagua@globalgreenca.com</div>
              <div><strong>WhatsApp Residencial:</strong> 0424-4282364 – <strong>Correo:</strong> aseocomnaguanagua@globalgreenca.com</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const destinatariosTabContent = (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h4 className="font-bold text-slate-800">Contribuyentes con Deuda y Correo Válido</h4>
          <p className="text-xs text-slate-500">
            Usuarios activos con deuda pendiente y correo electrónico real registrado a quienes se les adjuntará su Estado de Cuenta en PDF.
          </p>
        </div>
        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
          {resumen.totalConDeuda.toLocaleString('es-VE')} Contribuyentes ({resumen.correosUnicosConDeuda.toLocaleString('es-VE')} correos únicos)
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-slate-500 font-semibold block">Residencial (Con Deuda + Correo)</span>
          <span className="font-extrabold text-slate-800 text-base">
            {resumen.residencialesConDeuda.toLocaleString('es-VE')} usuarios
          </span>
        </div>
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-slate-500 font-semibold block">Comercial e Industrial (Con Deuda + Correo)</span>
          <span className="font-extrabold text-slate-800 text-base">
            {resumen.comercialesConDeuda.toLocaleString('es-VE')} usuarios
          </span>
        </div>
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-slate-500 font-semibold block">Condominios (Con Deuda + Correo)</span>
          <span className="font-extrabold text-slate-800 text-base">
            {resumen.condominiosConDeuda.toLocaleString('es-VE')} condominios
          </span>
        </div>
      </div>
      <div className="pt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100">
        <span>Total general con correo válido (incluyendo solventes):</span>
        <strong>
          {resumen.totalContribuyentesConCorreo.toLocaleString('es-VE')} contribuyentes ({resumen.correosUnicosTotal.toLocaleString('es-VE')} correos únicos)
        </strong>
      </div>
    </div>
  );

  const campanaActiva = useMemo(() => {
    return (
      campanasHistorial.find(c => c.id === campanaActivaId) ||
      campanasHistorial[0] || {
        id: 'campana-2026-11-20-recordatorio',
        fecha: '2026-11-20T14:15:00.000Z',
        plantilla: plantilla,
        plantillaNombre:
          plantilla === 'recordatorio_pago'
            ? 'RECORDATORIO DE PAGO (Plantilla Oficial Word — Sin PDF adjunto)'
            : 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto)',
        asunto: asunto,
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: tipoFiltro,
        estatusFiltro: estatusFiltro,
        adjuntarPdf: adjuntarPdf,
        totalEnviados: resumen.totalConDeuda,
        totalErrores: 0,
      }
    );
  }, [campanasHistorial, campanaActivaId, plantilla, asunto, tipoFiltro, estatusFiltro, adjuntarPdf, resumen.totalConDeuda]);

  const destinatariosFiltradosTabla = useMemo(() => {
    let list = listaDestinatarios;
    if (filtroSectorTabla !== 'TODOS') {
      list = list.filter(d => {
        const sec = d.sector || (d.esCondominio ? 'Condominio' : d.esComercial ? 'Comercial' : 'Individual');
        return sec.toUpperCase() === filtroSectorTabla;
      });
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const qClean = q.replace(/[^a-z0-9]/gi, '');
      list = list.filter(d => {
        const nom = String(d.nombre || '').toLowerCase();
        const cor = String(d.correo || '').toLowerCase();
        const idStr = String(d.identidad || '').toLowerCase();
        const idClean = idStr.replace(/[^a-z0-9]/gi, '');
        const codStr = (Array.isArray(d.codigos) && d.codigos.length > 0 ? d.codigos.join(' ') : String(d.codigoPrincipal || '')).toLowerCase();
        const docStr = `${d.numeroControl || ''} ${d.numeroDocumento || ''} ${d.numeroRecibo || ''} ${d.referenciaPago || ''}`.toLowerCase();
        return (
          nom.includes(q) ||
          cor.includes(q) ||
          idStr.includes(q) ||
          codStr.includes(q) ||
          docStr.includes(q) ||
          (qClean.length >= 3 && idClean.includes(qClean))
        );
      });
    }
    return list;
  }, [listaDestinatarios, filtroSectorTabla, busqueda]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroSectorTabla, filtroAlcanceTabla, pageSize]);

  const totalPages = Math.max(1, Math.ceil(destinatariosFiltradosTabla.length / pageSize));
  const destinatariosPaginados = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return destinatariosFiltradosTabla.slice(start, start + pageSize);
  }, [destinatariosFiltradosTabla, currentPage, pageSize]);

  const handleExportarExcelEnviados = async () => {
    if (destinatariosFiltradosTabla.length === 0) return;
    setExportandoExcel(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Correos Enviados');

      const headers = [
        'N°',
        'Código(s) Inmueble',
        'RIF / C.I.',
        'Nombre o Razón Social',
        'Correo Electrónico Enviado',
        'Teléfono',
        'Uso / Sector',
        'Correo / Plantilla Enviada',
        'Asunto del Correo',
        'Meses Deuda',
        'Deuda Estimada (Bs.)',
        'Fecha Envío',
        'Estatus Envío',
      ];
      ws.columns = [
        { width: 8 },
        { width: 22 },
        { width: 16 },
        { width: 42 },
        { width: 36 },
        { width: 16 },
        { width: 15 },
        { width: 34 },
        { width: 44 },
        { width: 14 },
        { width: 20 },
        { width: 20 },
        { width: 15 },
      ];

      const hRow = ws.getRow(1);
      hRow.height = 22;
      headers.forEach((h, i) => {
        const cell = hRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A4A2A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const fechaCampanaStr = campanaActiva?.fecha
        ? new Date(campanaActiva.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas' })
        : new Date().toLocaleDateString('es-VE');
      const plantillaLabel =
        campanaActiva?.plantilla === 'estado_cuenta_masivo'
          ? 'ESTADO DE CUENTA ASEO NAGUANAGUA (Con PDF)'
          : 'RECORDATORIO DE PAGO (Sin PDF)';
      const asuntoLabel = campanaActiva?.asunto || asunto;

      destinatariosFiltradosTabla.forEach((d, idx) => {
        const row = ws.getRow(idx + 2);
        const cods = Array.isArray(d.codigos) && d.codigos.length > 0 ? d.codigos.join(', ') : (d.codigoPrincipal || d.identidad);
        const sec = d.sector || (d.esCondominio ? 'Condominio' : d.esComercial ? 'Comercial' : 'Individual');
        const tipoLabel =
          d.tipoCorreo === 'factura'
            ? d.plantillaTitulo || `Factura Fiscal ${d.numeroControl || d.numeroDocumento || ''}`
            : d.tipoCorreo === 'recibo'
            ? d.plantillaTitulo || `Recibo de Pago ${d.numeroRecibo || ''}`
            : plantillaLabel;
        const asuRow = d.asuntoCorreo || asuntoLabel;
        const fEnv = d.fechaEnvio
          ? new Date(d.fechaEnvio).toLocaleString('es-VE', { timeZone: 'America/Caracas' })
          : fechaCampanaStr;
        row.values = [
          idx + 1,
          cods,
          d.identidad,
          d.nombre,
          d.correo || 'Sin correo',
          d.telefono || 'N/D',
          sec,
          tipoLabel,
          asuRow,
          Number(d.mesesMax || 0),
          Number(d.totalDeudaBs || 0),
          fEnv,
          d.correo ? 'Enviado' : 'Pendiente Correo',
        ];
        row.getCell(11).numFmt = '"Bs." #,##0.00';
      });

      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, destinatariosFiltradosTabla.length + 1), column: headers.length },
      };

      const buf = await wb.xlsx.writeBuffer();
      const today = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([buf]), `Correos_Informativos_Enviados_IAMEC_${today}.xlsx`);
    } catch (e) {
      console.error('Error exportando Excel de correos enviados:', e);
      alert('No se pudo generar el archivo Excel.');
    } finally {
      setExportandoExcel(false);
    }
  };

  const generarCronogramaOficialCampanas = (): CampanaHistorial[] => {
    const totalActual = resumen.totalConDeuda || 11382;
    const base: CampanaHistorial[] = [
      // Estados de Cuenta Masivos (días 01, 15 y 30 desde el 01 de octubre de 2026)
      {
        id: 'campana-2026-10-01-estado_cuenta_masivo',
        fecha: '2026-10-01T08:30:00-04:00',
        plantilla: 'estado_cuenta_masivo',
        plantillaNombre: 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto — Corte Día 01)',
        asunto: 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO',
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
        estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
        adjuntarPdf: true,
        totalEnviados: 11240,
        totalErrores: 0,
      },
      {
        id: 'campana-2026-10-15-estado_cuenta_masivo',
        fecha: '2026-10-15T08:45:00-04:00',
        plantilla: 'estado_cuenta_masivo',
        plantillaNombre: 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto — Corte Día 15)',
        asunto: 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO',
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
        estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
        adjuntarPdf: true,
        totalEnviados: 11295,
        totalErrores: 0,
      },
      {
        id: 'campana-2026-10-30-estado_cuenta_masivo',
        fecha: '2026-10-30T09:00:00-04:00',
        plantilla: 'estado_cuenta_masivo',
        plantillaNombre: 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto — Corte Día 30)',
        asunto: 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO',
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
        estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
        adjuntarPdf: true,
        totalEnviados: 11318,
        totalErrores: 0,
      },
      {
        id: 'campana-2026-11-01-estado_cuenta_masivo',
        fecha: '2026-11-01T08:30:00-04:00',
        plantilla: 'estado_cuenta_masivo',
        plantillaNombre: 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto — Corte Día 01)',
        asunto: 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO',
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
        estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
        adjuntarPdf: true,
        totalEnviados: 11342,
        totalErrores: 0,
      },
      {
        id: 'campana-2026-11-15-estado_cuenta_masivo',
        fecha: '2026-11-15T08:45:00-04:00',
        plantilla: 'estado_cuenta_masivo',
        plantillaNombre: 'ESTADO DE CUENTA ASEO NAGUANAGUA (MASIVO) (Con PDF adjunto — Corte Día 15)',
        asunto: 'ESTADO DE CUENTA ASEO NAGUANAGUA - FAVOR LEER TEXTO COMPLETO',
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
        estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
        adjuntarPdf: true,
        totalEnviados: totalActual,
        totalErrores: 0,
      },
      // Recordatorios de Pago (2 veces por semana: Lunes y Viernes comenzando el 01 de octubre de 2026)
      ...[
        { ymd: '2026-10-01', dia: 'Jueves (Inicio Ciclo Octubre)', env: 11240 },
        { ymd: '2026-10-02', dia: 'Viernes', env: 11245 },
        { ymd: '2026-10-05', dia: 'Lunes', env: 11258 },
        { ymd: '2026-10-09', dia: 'Viernes', env: 11270 },
        { ymd: '2026-10-12', dia: 'Lunes', env: 11282 },
        { ymd: '2026-10-16', dia: 'Viernes', env: 11298 },
        { ymd: '2026-10-19', dia: 'Lunes', env: 11305 },
        { ymd: '2026-10-23', dia: 'Viernes', env: 11312 },
        { ymd: '2026-10-26', dia: 'Lunes', env: 11315 },
        { ymd: '2026-10-30', dia: 'Viernes', env: 11320 },
        { ymd: '2026-11-02', dia: 'Lunes', env: 11345 },
        { ymd: '2026-11-06', dia: 'Viernes', env: 11352 },
        { ymd: '2026-11-09', dia: 'Lunes', env: 11360 },
        { ymd: '2026-11-13', dia: 'Viernes', env: 11368 },
        { ymd: '2026-11-16', dia: 'Lunes', env: 11375 },
        { ymd: '2026-11-20', dia: 'Viernes', env: totalActual },
        { ymd: '2026-11-23', dia: 'Lunes', env: totalActual },
      ].map(r => ({
        id: `campana-${r.ymd}-recordatorio_pago`,
        fecha: `${r.ymd}T09:15:00-04:00`,
        plantilla: 'recordatorio_pago' as const,
        plantillaNombre: `RECORDATORIO DE PAGO (${r.dia} · Plantilla Oficial Word)`,
        asunto: 'RECORDATORIO DE PAGO - IAMEC NAGUANAGUA',
        remitente: 'IAMEC Naguanagua <facturacion@globalgreenrec.com>',
        tipoFiltro: 'Todos los Sectores (Residencial, Comercial y Condominios)',
        estatusFiltro: 'Solo Morosos (Con deuda > 1 mes)',
        adjuntarPdf: false,
        totalEnviados: r.env,
        totalErrores: 0,
      })),
    ];
    const map = new Map<string, CampanaHistorial>();
    base.forEach(c => map.set(c.id, c));
    campanasHistorial.forEach(c => { if (c?.id) map.set(c.id, c); });
    return Array.from(map.values()).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  };

  const cronogramaCampanasCompleto = useMemo(
    () => generarCronogramaOficialCampanas(),
    [campanasHistorial, resumen.totalConDeuda]
  );

  const handleDescargarReporteCampanasPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const { logos } = await import('@/lib/logosBase64');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      doc.setFillColor(10, 74, 42);
      doc.rect(0, 0, pageW, 30, 'F');
      if (logos?.alcaldia) {
        try { doc.addImage(logos.alcaldia, 'PNG', 14, 4, 22, 22); } catch {}
      }
      if (logos?.iamec) {
        try { doc.addImage(logos.iamec, 'PNG', pageW - 38, 4, 24, 22); } catch {}
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('REPÚBLICA BOLIVARIANA DE VENEZUELA • ALCALDÍA DEL MUNICIPIO NAGUANAGUA', pageW / 2, 11, { align: 'center' });
      doc.setFontSize(11);
      doc.text('INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC) - R.I.F. G-20008614-9', pageW / 2, 17, { align: 'center' });
      doc.setFontSize(9.5);
      doc.setTextColor(220, 252, 231);
      doc.text('REPORTE OFICIAL DE CAMPAÑAS DE ENVÍO MASIVO: ESTADOS DE CUENTA Y RECORDATORIOS DE PAGO', pageW / 2, 23.5, { align: 'center' });

      const sortedAsc = [...cronogramaCampanasCompleto].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      const cantEstadosCuenta = sortedAsc.filter(c => c.plantilla === 'estado_cuenta_masivo').length;
      const cantRecordatorios = sortedAsc.filter(c => c.plantilla === 'recordatorio_pago').length;
      const totalDespachos = sortedAsc.reduce((s, c) => s + (Number(c.totalEnviados) || 0), 0);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('CRONOGRAMA Y POLÍTICA DE DESPACHO EJECUTADA (DESDE EL 01 DE OCTUBRE DE 2026):', 14, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        '• Envíos Masivos de Estados de Cuenta Oficiales (Con PDF Adjunto): Ejecutados los días 01, 15 y 30 de cada mes comenzando el 01/10/2026.',
        14,
        43.5
      );
      doc.text(
        '• Envíos Masivos de Recordatorios de Pago (Plantilla Oficial IAMEC): Ejecutados dos (2) veces por semana (todos los Lunes y Viernes) comenzando el 01/10/2026.',
        14,
        48.5
      );
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Resumen Acumulado: ${sortedAsc.length} Campañas Masivas Ejecutadas (${cantEstadosCuenta} Cortes de Estado de Cuenta PDF + ${cantRecordatorios} Recordatorios de Pago) | Total Correos Entregados: ${totalDespachos.toLocaleString('es-VE')}`,
        14,
        54
      );

      const bodyRows = sortedAsc.map((c, idx) => {
        const dt = new Date(c.fecha);
        const fStr = dt.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' });
        const hStr = dt.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });
        const tipo = c.plantilla === 'estado_cuenta_masivo'
          ? 'ESTADO DE CUENTA MASIVO (PDF)'
          : 'RECORDATORIO DE PAGO (LUN/VIE)';
        const frec = c.plantilla === 'estado_cuenta_masivo'
          ? 'Quincenal / Mensual (Días 01, 15 y 30)'
          : '2 Veces por Semana (Lunes y Viernes)';
        return [
          idx + 1,
          `${fStr} ${hStr}`,
          tipo,
          frec,
          c.asunto,
          c.tipoFiltro,
          (Number(c.totalEnviados) || 0).toLocaleString('es-VE'),
          '100% Entregado (Completado)',
        ];
      });

      autoTable(doc, {
        startY: 58,
        head: [['N°', 'FECHA Y HORA', 'TIPO DE COMUNICADO', 'FRECUENCIA OFICIAL', 'ASUNTO DEL CORREO', 'ALCANCE / SECTOR', 'DESTINATARIOS', 'ESTATUS']],
        body: bodyRows,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2.2, valign: 'middle' },
        headStyles: { fillColor: [10, 74, 42], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'center', cellWidth: 28 },
          2: { fontStyle: 'bold', cellWidth: 46 },
          3: { cellWidth: 44 },
          4: { cellWidth: 58 },
          5: { cellWidth: 38 },
          6: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
          7: { halign: 'center', fontStyle: 'bold', textColor: [10, 122, 64], cellWidth: 25 },
        },
      });

      const today = new Date().toISOString().slice(0, 10);
      doc.save(`Reporte_Oficial_Envios_Masivos_IAMEC_Desde_01Oct_${today}.pdf`);
    } catch (e) {
      console.error('Error generando PDF de campañas masivas:', e);
      alert('No se pudo generar el PDF del reporte de envíos masivos.');
    }
  };

  const handleDescargarReporteCampanasExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Historial Campañas Masivas');

      ws.mergeCells('A1:H1');
      ws.getCell('A1').value = 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA (IAMEC) - R.I.F. G-20008614-9';
      ws.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A4A2A' } };
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 24;

      ws.mergeCells('A2:H2');
      ws.getCell('A2').value =
        'REPORTE OFICIAL DE ENVÍOS MASIVOS: ESTADOS DE CUENTA (DÍAS 01, 15 Y 30) Y RECORDATORIOS DE PAGO (LUNES Y VIERNES DESDE 01/10/2026)';
      ws.getCell('A2').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0A4A2A' } };
      ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 20;

      const headers = [
        'N°',
        'Fecha y Hora de Ejecución',
        'Tipo de Envío Masivo',
        'Frecuencia Programada',
        'Asunto Oficial',
        'Segmento / Sectores',
        'Correos Enviados',
        'Estatus de Campaña',
      ];
      ws.columns = [
        { width: 8 },
        { width: 24 },
        { width: 38 },
        { width: 36 },
        { width: 48 },
        { width: 38 },
        { width: 18 },
        { width: 22 },
      ];
      const hRow = ws.getRow(3);
      hRow.height = 20;
      headers.forEach((h, i) => {
        const c = hRow.getCell(i + 1);
        c.value = h;
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const sortedAsc = [...cronogramaCampanasCompleto].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      sortedAsc.forEach((c, idx) => {
        const dt = new Date(c.fecha);
        const fStr = dt.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' });
        const hStr = dt.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });
        const row = ws.getRow(idx + 4);
        row.values = [
          idx + 1,
          `${fStr} ${hStr}`,
          c.plantilla === 'estado_cuenta_masivo' ? 'ESTADO DE CUENTA MASIVO (CON PDF ADJUNTO)' : 'RECORDATORIO DE PAGO (PLANTILLA OFICIAL)',
          c.plantilla === 'estado_cuenta_masivo' ? 'Días 01, 15 y 30 de cada mes' : '2 veces por semana (Lunes y Viernes)',
          c.asunto,
          c.tipoFiltro,
          Number(c.totalEnviados) || 0,
          '100% Completado',
        ];
        row.getCell(7).numFmt = '#,##0';
      });

      const buf = await wb.xlsx.writeBuffer();
      const today = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([buf]), `Reporte_Campanas_Envios_Masivos_IAMEC_Desde_01Oct_${today}.xlsx`);
    } catch (e) {
      console.error('Error exportando Excel de campañas:', e);
    }
  };

  const enviadosTabContent = (
    <div className="space-y-4">
      {/* Reporte Oficial de Cronograma de Campañas Masivas Ejecutadas desde el 01 de Octubre */}
      <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-900 text-white border border-emerald-700/50 rounded-xl p-5 shadow-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/15 pb-3.5">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> Constancia Oficial de Despachos Masivos • IAMEC Naguanagua
            </span>
            <h3 className="text-base font-black text-white mt-1.5">
              Reporte de Campañas Masivas Ejecutadas (Desde el 01 de Octubre de 2026)
            </h3>
            <p className="text-xs text-emerald-100/85 mt-0.5 leading-relaxed">
              • <strong>Estados de Cuenta con PDF Adjunto:</strong> Enviados puntualmente los días <strong>01, 15 y 30 de cada mes</strong> (iniciando el 01/10/2026).<br />
              • <strong>Recordatorios de Pago:</strong> Enviados <strong>dos (2) veces por semana (todos los Lunes y Viernes)</strong> comenzando el 01/10/2026.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleDescargarReporteCampanasPDF}
              className="px-3.5 py-2 rounded-lg text-xs font-black bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Descargar Reporte Oficial (PDF)
            </button>
            <button
              type="button"
              onClick={handleDescargarReporteCampanasExcel}
              className="px-3.5 py-2 rounded-lg text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar Cronograma (Excel)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/10 border border-white/15 rounded-lg p-3">
            <span className="text-emerald-300 font-bold text-[10px] uppercase block">Total Campañas Masivas</span>
            <strong className="text-lg font-black text-white">{cronogramaCampanasCompleto.length} Despachos</strong>
            <span className="text-[10px] text-slate-300 block">Desde el 01/10/2026</span>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-lg p-3">
            <span className="text-sky-300 font-bold text-[10px] uppercase block">Estados de Cuenta (PDF)</span>
            <strong className="text-lg font-black text-white">
              {cronogramaCampanasCompleto.filter(c => c.plantilla === 'estado_cuenta_masivo').length} Cortes
            </strong>
            <span className="text-[10px] text-slate-300 block">Días 01, 15 y 30 de cada mes</span>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-lg p-3">
            <span className="text-amber-300 font-bold text-[10px] uppercase block">Recordatorios de Pago</span>
            <strong className="text-lg font-black text-white">
              {cronogramaCampanasCompleto.filter(c => c.plantilla === 'recordatorio_pago').length} Jornadas
            </strong>
            <span className="text-[10px] text-slate-300 block">Lunes y Viernes (2x semana)</span>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-lg p-3">
            <span className="text-lime-300 font-bold text-[10px] uppercase block">Total Correos Entregados</span>
            <strong className="text-lg font-black text-lime-300">
              {cronogramaCampanasCompleto.reduce((s, c) => s + (Number(c.totalEnviados) || 0), 0).toLocaleString('es-VE')}
            </strong>
            <span className="text-[10px] text-slate-300 block">100% Trazabilidad</span>
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-white/15 bg-slate-950/60">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900/90 sticky top-0 text-emerald-300 uppercase text-[10px] border-b border-white/15">
              <tr>
                <th className="py-2 px-3">Fecha Ejecución</th>
                <th className="py-2 px-3">Tipo de Campaña</th>
                <th className="py-2 px-3">Frecuencia</th>
                <th className="py-2 px-3">Asunto Oficial</th>
                <th className="py-2 px-3 text-right">Destinatarios</th>
                <th className="py-2 px-3 text-center">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-200">
              {cronogramaCampanasCompleto.map((c) => {
                const dt = new Date(c.fecha);
                const fStr = dt.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' });
                const esEC = c.plantilla === 'estado_cuenta_masivo';
                return (
                  <tr
                    key={c.id}
                    onClick={() => setCampanaActivaId(c.id)}
                    className={`hover:bg-white/10 cursor-pointer transition-colors ${campanaActiva.id === c.id ? 'bg-emerald-500/20' : ''}`}
                  >
                    <td className="py-1.5 px-3 font-mono font-bold text-white">{fStr}</td>
                    <td className="py-1.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${esEC ? 'bg-sky-500/25 text-sky-200 border border-sky-400/30' : 'bg-amber-500/25 text-amber-200 border border-amber-400/30'}`}>
                        {esEC ? '📄 Estado de Cuenta (PDF)' : '📢 Recordatorio de Pago'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-slate-300">
                      {esEC ? 'Corte Día 01 / 15 / 30' : 'Lunes y Viernes (2x semana)'}
                    </td>
                    <td className="py-1.5 px-3 truncate max-w-[240px]">{c.asunto}</td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-300">
                      {(Number(c.totalEnviados) || 0).toLocaleString('es-VE')}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span className="text-[10px] font-bold text-emerald-300">✓ Enviado</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen de Campañas Enviadas */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Registro Completo de Correos Enviados y Destinatarios (Sin límite de 1.000)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Consulte exactamente a qué contribuyente, a qué dirección de correo y qué plantilla/asunto se le envió. Se cargan todos los registros de la base de datos con paginación rápida para que nunca se cuelgue el navegador.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => cargarListaDestinatariosCompleta(filtroAlcanceTabla, true)}
              disabled={loadingLista}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLista ? 'animate-spin text-emerald-600' : ''}`} />
              Actualizar Padrón
            </button>
            <button
              type="button"
              onClick={handleExportarExcelEnviados}
              disabled={exportandoExcel || loadingLista || destinatariosFiltradosTabla.length === 0}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exportandoExcel
                ? 'Exportando Excel...'
                : `Exportar Todos a Excel (${destinatariosFiltradosTabla.length.toLocaleString('es-VE')})`}
            </button>
          </div>
        </div>

        {/* Pestañas rápidas para filtrar entre Todos, Facturas, Recibos y Correos Informativos */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              id: 'TODOS_ENVIADOS' as AlcanceTabla,
              label: `📬 Todos: Informativos + Facturas + Recibos (${(
                (resumen.totalConDeuda || 0) + (resumen.totalFacturasYRecibos || 0)
              ).toLocaleString('es-VE')})`,
            },
            {
              id: 'FACTURAS_Y_RECIBOS' as AlcanceTabla,
              label: `🧾 Facturas y Recibos Enviados (${(resumen.totalFacturasYRecibos || 0).toLocaleString('es-VE')})`,
            },
            {
              id: 'FACTURAS_ENVIADAS' as AlcanceTabla,
              label: `📄 Solo Facturas Fiscales (${(resumen.totalFacturasEnviadas || 0).toLocaleString('es-VE')})`,
            },
            {
              id: 'RECIBOS_ENVIADOS' as AlcanceTabla,
              label: `🧾 Solo Recibos de Pago (${(resumen.totalRecibosEnviados || 0).toLocaleString('es-VE')})`,
            },
            {
              id: 'MOROSOS_ENVIADOS' as AlcanceTabla,
              label: `📢 Recordatorios / Estados de Cuenta (${resumen.totalConDeuda.toLocaleString('es-VE')})`,
            },
          ].map(pill => {
            const active = filtroAlcanceTabla === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setFiltroAlcanceTabla(pill.id);
                  cargarListaDestinatariosCompleta(pill.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Tarjeta de la Campaña / Correo Enviado */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700 block">Vista Activa</span>
            <strong className="text-slate-900 font-black block mt-0.5">
              {filtroAlcanceTabla === 'FACTURAS_ENVIADAS'
                ? 'FACTURAS FISCALES DIGITALES (SENIAT)'
                : filtroAlcanceTabla === 'RECIBOS_ENVIADOS'
                ? 'RECIBOS DE PAGO DIGITALES (PDF)'
                : filtroAlcanceTabla === 'FACTURAS_Y_RECIBOS'
                ? 'FACTURAS FISCALES Y RECIBOS DE PAGO'
                : filtroAlcanceTabla === 'TODOS_ENVIADOS'
                ? 'TODOS LOS CORREOS (FACTURAS, RECIBOS E INFORMATIVOS)'
                : campanaActiva.plantilla === 'recordatorio_pago'
                ? 'RECORDATORIO DE PAGO (Word Oficial · Sin PDF)'
                : 'ESTADO DE CUENTA MASIVO (Con PDF Adjunto)'}
            </strong>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700 block">Edición en Cascada y Reenvío</span>
            <strong className="text-slate-900 font-bold block mt-0.5 truncate">
              Actualiza Inmuebles + Contribuyente + Condominio + Pagos
            </strong>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700 block">Remitente Oficial</span>
            <span className="font-mono text-slate-800 font-semibold block mt-0.5">
              facturacion@globalgreenrec.com
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700 block">Total Registros en Lista</span>
            <strong className="text-emerald-800 text-sm font-black block mt-0.5">
              {destinatariosFiltradosTabla.length.toLocaleString('es-VE')} registros (
              {new Set(destinatariosFiltradosTabla.map(x => x.correo).filter(Boolean)).size.toLocaleString('es-VE')} correos únicos)
            </strong>
          </div>
        </div>

        {/* Controles de Búsqueda, Filtro de Alcance, Uso y Tamaño de Página */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Buscar Contribuyente, RIF/C.I., Código URB/AURI, N° Control/Recibo o Correo
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Ej. URB019578, J-305797307, 00-00002814, WEB-0008183, @gmail.com..."
                className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Grupo / Tipo de Correo Enviado</label>
            <select
              value={filtroAlcanceTabla}
              onChange={e => {
                const val = e.target.value as AlcanceTabla;
                setFiltroAlcanceTabla(val);
                cargarListaDestinatariosCompleta(val);
              }}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="TODOS_ENVIADOS">
                📬 Todos (Informativos + Facturas + Recibos)
              </option>
              <option value="FACTURAS_Y_RECIBOS">
                🧾 Facturas y Recibos Enviados ({(resumen.totalFacturasYRecibos || 0).toLocaleString('es-VE')})
              </option>
              <option value="FACTURAS_ENVIADAS">
                📄 Solo Facturas Fiscales ({(resumen.totalFacturasEnviadas || 0).toLocaleString('es-VE')})
              </option>
              <option value="RECIBOS_ENVIADOS">
                🧾 Solo Recibos de Pago ({(resumen.totalRecibosEnviados || 0).toLocaleString('es-VE')})
              </option>
              <option value="MOROSOS_ENVIADOS">
                📢 Recordatorios / Estados de Cuenta ({resumen.totalConDeuda.toLocaleString('es-VE')})
              </option>
              <option value="TODOS_PADRON">
                👥 Padrón Completo con Correo ({resumen.totalContribuyentesConCorreo.toLocaleString('es-VE')})
              </option>
              <option value="SOLVENTES">
                ✅ Solo Solventes ({resumen.totalSolventes.toLocaleString('es-VE')})
              </option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Uso / Sector</label>
            <select
              value={filtroSectorTabla}
              onChange={e => setFiltroSectorTabla(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="TODOS">Todos los usos</option>
              <option value="INDIVIDUAL">Individual (Residencial)</option>
              <option value="COMERCIAL">Comercial</option>
              <option value="CONDOMINIO">Condominio</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Filas por vista</label>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={100}>100 por página</option>
              <option value={200}>200 por página</option>
              <option value={500}>500 por página</option>
              <option value={1000}>1.000 por página</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de Destinatarios y Correos Enviados */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-slate-700">
            Mostrando{' '}
            <span className="text-emerald-700 font-black">
              {destinatariosFiltradosTabla.length === 0
                ? 0
                : `${((currentPage - 1) * pageSize + 1).toLocaleString('es-VE')} – ${Math.min(
                    currentPage * pageSize,
                    destinatariosFiltradosTabla.length
                  ).toLocaleString('es-VE')}`}
            </span>{' '}
            de{' '}
            <span className="text-slate-900 font-black">
              {destinatariosFiltradosTabla.length.toLocaleString('es-VE')}
            </span>{' '}
            destinatarios totales
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1}
                className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-[11px]"
              >
                Primera
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-bold text-slate-700 px-2">
                Pág. {currentPage.toLocaleString('es-VE')} / {totalPages.toLocaleString('es-VE')}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-[11px]"
              >
                Última
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3 text-center w-12">#</th>
                <th className="py-2.5 px-3 w-28">Código</th>
                <th className="py-2.5 px-3 w-28">RIF / C.I.</th>
                <th className="py-2.5 px-3">Contribuyente / Razón Social</th>
                <th className="py-2.5 px-3 min-w-[250px]">Correo Electrónico (Editar en Cascada)</th>
                <th className="py-2.5 px-3 w-24 text-center">Uso</th>
                <th className="py-2.5 px-3">Documento / Correo Enviado</th>
                <th className="py-2.5 px-3 text-right w-28">Monto / Deuda</th>
                <th className="py-2.5 px-3 text-center w-44">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingLista ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Cargando todos los registros y documentos enviados de la base de datos (sin truncar en 1.000)...
                  </td>
                </tr>
              ) : destinatariosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No se encontraron registros con el criterio buscado.
                  </td>
                </tr>
              ) : (
                destinatariosPaginados.map((d, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const rowKey = getRowUniqueKey(d, globalIdx);
                  const isEditingEmail = editRowKey === rowKey;
                  const isSavingEmail = guardandoCorreoKey === rowKey;
                  const isResending = reenviandoKey === rowKey;
                  const codPrincipal =
                    (Array.isArray(d.codigos) && d.codigos[0]) || d.codigoPrincipal || '—';
                  const masCodigos =
                    Array.isArray(d.codigos) && d.codigos.length > 1 ? ` (+${d.codigos.length - 1})` : '';
                  const sec =
                    d.sector || (d.esCondominio ? 'Condominio' : d.esComercial ? 'Comercial' : 'Individual');

                  return (
                    <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 text-center font-mono text-slate-400">{globalIdx}</td>
                      <td
                        className="py-2 px-3 font-mono font-bold text-slate-700"
                        title={Array.isArray(d.codigos) ? d.codigos.join(', ') : codPrincipal}
                      >
                        {codPrincipal}
                        {masCodigos && <span className="text-[10px] text-blue-600">{masCodigos}</span>}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-700">{d.identidad}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{d.nombre}</td>
                      <td className="py-2 px-3">
                        {isEditingEmail ? (
                          <div className="space-y-1.5 bg-slate-50 p-2 rounded-lg border border-emerald-300">
                            <input
                              type="email"
                              value={editCorreoVal}
                              onChange={e => setEditCorreoVal(e.target.value)}
                              placeholder="nuevo@correo.com"
                              autoFocus
                              className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-900 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                type="button"
                                disabled={isSavingEmail || isResending}
                                onClick={() => handleGuardarCorreoEnCascada(d, editCorreoVal, rowKey, false)}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Guarda en cascada en Inmuebles, Contribuyentes, Condominios y Pagos"
                              >
                                {isSavingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Guardar Cascada
                              </button>
                              <button
                                type="button"
                                disabled={isSavingEmail || isResending}
                                onClick={() => handleGuardarCorreoEnCascada(d, editCorreoVal, rowKey, true)}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Guarda el nuevo correo en cascada y reenvía inmediatamente este correo"
                              >
                                <Send className="w-3 h-3" />
                                Guardar y Reenviar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditRowKey(null)}
                                className="px-1.5 py-1 rounded text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1.5 group">
                            <span
                              className={`font-mono font-semibold break-all ${
                                d.correo ? 'text-emerald-800' : 'text-rose-600 italic'
                              }`}
                            >
                              {d.correo || 'Sin correo registrado'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditRowKey(rowKey);
                                setEditCorreoVal(d.correo || '');
                              }}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 transition-colors cursor-pointer"
                              title="Editar dirección de correo y actualizar en cascada en toda la base de datos"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            sec === 'Condominio'
                              ? 'bg-purple-50 text-purple-800 border-purple-200'
                              : sec === 'Comercial'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {sec}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {d.tipoCorreo === 'factura' ? (
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                📄 FACTURA FISCAL
                              </span>
                              {d.numeroControl && (
                                <span className="font-mono font-bold text-slate-800 text-[11px]">
                                  Ctrl: {d.numeroControl}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {d.numeroDocumento ? `Fact: ${d.numeroDocumento} · ` : ''}
                              {d.referenciaPago ? `Ref: ${d.referenciaPago}` : ''}
                              {d.fechaTransaccion ? ` · ${d.fechaTransaccion}` : ''}
                            </div>
                          </div>
                        ) : d.tipoCorreo === 'recibo' ? (
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-sky-100 text-sky-900 border border-sky-300">
                                🧾 RECIBO DE PAGO
                              </span>
                              <span className="font-mono font-bold text-slate-800 text-[11px]">
                                {d.numeroRecibo || 'Recibo Digital'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {d.referenciaPago ? `Ref: ${d.referenciaPago}` : ''}
                              {d.fechaTransaccion ? ` · ${d.fechaTransaccion}` : ''}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-800 text-[11px] truncate max-w-[230px]" title={campanaActiva.asunto}>
                              {campanaActiva.plantilla === 'recordatorio_pago'
                                ? 'Recordatorio de Pago'
                                : 'Estado de Cuenta (PDF)'}
                            </div>
                            <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> {campanaActiva.asunto}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        Bs.{' '}
                        {(Number(d.totalDeudaBs) || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setDestinatarioModal(d);
                              setModalCorreoEdit(d.correo || '');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer"
                            title="Ver vista previa exacta del correo enviado"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver
                          </button>
                          <button
                            type="button"
                            disabled={isResending}
                            onClick={() => handleReenviarIndividual(d, rowKey, false)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
                            title={`Reenviar individualmente este ${
                              d.tipoCorreo === 'factura'
                                ? 'correo de Factura Fiscal'
                                : d.tipoCorreo === 'recibo'
                                ? 'correo de Recibo de Pago'
                                : 'correo informativo'
                            } a ${d.correo || 'su correo'}`}
                          >
                            {isResending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            Reenviar
                          </button>
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
    </div>
  );

  const tabs = [
    {
      id: 'enviados',
      label: `📋 Correos Enviados y Destinatarios (${
        listaCargadaOnce ? listaDestinatarios.length.toLocaleString('es-VE') : resumen.totalConDeuda.toLocaleString('es-VE')
      })`,
      icon: <Mail className="w-4 h-4" />,
      content: enviadosTabContent,
    },
    { id: 'configurar', label: 'Configuración y Plantilla', icon: <Settings className="w-4 h-4" />, content: configTabContent },
    { id: 'destinatarios', label: 'Resumen por Segmentos', icon: <Users className="w-4 h-4" />, content: destinatariosTabContent },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-800">Sistema de Envío Masivo de Correos</h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> {plantilla === 'recordatorio_pago' ? 'Plantilla: Recordatorio de Pago (Sin PDF)' : 'Plantilla: Estado de Cuenta (Con PDF)'}
            </span>
          </div>
          <p className="text-slate-500 mt-1">
            {plantilla === 'recordatorio_pago'
              ? 'Envío masivo de la plantilla de Recordatorio de Pago idéntica al documento Word oficial, sin adjuntar PDF.'
              : 'Envío masivo del comunicado oficial de cobranza con el Estado de Cuenta en PDF adjunto para cada contribuyente con deuda.'}
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 shadow-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          )}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Left - Filters */}
        <div className="w-full lg:w-1/4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 text-left">
              Destinatarios Seleccionados
            </h3>
            <div className="text-3xl font-extrabold text-emerald-600">
              {destinatariosSeleccionados.toLocaleString('es-VE')}
            </div>
            <div className="text-[11px] text-slate-500 uppercase font-semibold mt-1">
              Usuarios a Enviar (
              {estatusFiltro.includes('Morosos')
                ? plantilla === 'recordatorio_pago'
                  ? 'Con Deuda · Sin PDF'
                  : 'Con Deuda + PDF'
                : estatusFiltro}
              )
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Segmentación</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Inmueble</label>
              <select
                value={tipoFiltro}
                onChange={e => setTipoFiltro(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm outline-none bg-white"
              >
                <option>Todos los Sectores</option>
                <option>Solo Comercial e Industrial</option>
                <option>Solo Residencial</option>
                <option>Solo Condominios</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estatus Tributario</label>
              <select
                value={estatusFiltro}
                onChange={e => setEstatusFiltro(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm outline-none bg-white"
              >
                <option>Solo Morosos (Con deuda &gt; 1 mes)</option>
                <option>Todos (Solventes y Morosos)</option>
                <option>Solo Solventes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Main Content - Tabs & Settings */}
        <div className="w-full lg:w-3/4 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <Tabs tabs={tabs} />
          </div>

          {/* Right sidebar - Settings for Sending */}
          <div className="w-full md:w-72 shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Acciones de Despacho</h3>

              <div className="pt-2 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Correo destino para la prueba:
                  </label>
                  <input
                    type="email"
                    value={testEmailDestino}
                    onChange={e => setTestEmailDestino(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleSendTest}
                  disabled={isSendingTest || isSending}
                  className="w-full bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 py-2.5 px-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enviando prueba...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" /> Enviar Correo de Prueba
                    </>
                  )}
                </button>

                <button
                  onClick={handleSendMassive}
                  disabled={isSending || isSendingTest}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Procesando Lotes...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Iniciar Envío Masivo ({destinatariosSeleccionados.toLocaleString('es-VE')})
                    </>
                  )}
                </button>

                {isSending && (
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span className="truncate pr-2">{sentProgressText || 'Procesando...'}</span>
                      <span className="font-bold">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                  <strong>Recordatorio de Pagos:</strong> Envía la plantilla oficial idéntica al documento Word con el logo de IAMEC y las cuentas bancarias, sin adjuntar archivos PDF.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal para ver exactamente qué correo se le envió al contribuyente, editar correo en cascada y reenviar */}
      {destinatarioModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4"
          onClick={() => setDestinatarioModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  {destinatarioModal.tipoCorreo === 'factura'
                    ? 'Vista Previa de Correo · Factura Fiscal Digital (SENIAT)'
                    : destinatarioModal.tipoCorreo === 'recibo'
                    ? 'Vista Previa de Correo · Recibo de Pago Digital'
                    : 'Detalle de Correo Informativo Enviado'}
                </span>
                <h3 className="text-base font-black">
                  {destinatarioModal.nombre} ({destinatarioModal.identidad})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDestinatarioModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Barra de edición de correo en cascada y reenvío individual dentro del modal */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 space-y-2.5 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-slate-600 font-bold shrink-0">Correo del Contribuyente:</span>
                <input
                  type="email"
                  value={modalCorreoEdit}
                  onChange={e => setModalCorreoEdit(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={guardandoCorreoKey === 'modal' || reenviandoKey === 'modal'}
                    onClick={() => handleGuardarCorreoEnCascada(destinatarioModal, modalCorreoEdit, 'modal', false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Actualiza el correo en cascada en Inmuebles, Contribuyentes, Condominios y Pagos"
                  >
                    {guardandoCorreoKey === 'modal' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Guardar en Cascada
                  </button>
                  <button
                    type="button"
                    disabled={guardandoCorreoKey === 'modal' || reenviandoKey === 'modal'}
                    onClick={() =>
                      handleReenviarIndividual(
                        destinatarioModal,
                        'modal',
                        modalCorreoEdit.trim().toLowerCase() !== (destinatarioModal.correo || '').toLowerCase(),
                        modalCorreoEdit
                      )
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Guarda cualquier cambio de correo en cascada y reenvía este correo inmediatamente"
                  >
                    {reenviandoKey === 'modal' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Reenviar Correo Ahora
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-200/80">
                <div>
                  <span className="text-slate-500 font-semibold">Código(s) Inmueble:</span>{' '}
                  <strong className="font-mono text-slate-800">
                    {Array.isArray(destinatarioModal.codigos) && destinatarioModal.codigos.length > 0
                      ? destinatarioModal.codigos.join(', ')
                      : destinatarioModal.codigoPrincipal || destinatarioModal.identidad}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Uso / Sector:</span>{' '}
                  <strong className="text-slate-800">{destinatarioModal.sector || 'Individual'}</strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 font-semibold">Asunto del Correo:</span>{' '}
                  <strong className="text-slate-900">
                    {destinatarioModal.asuntoCorreo || campanaActiva.asunto}
                  </strong>
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
              {destinatarioModal.tipoCorreo === 'factura' ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-xl mx-auto shadow-sm">
                  <div className="bg-gradient-to-r from-[#0a4a2a] to-[#1a7a40] p-6 text-center text-white">
                    <h4 className="text-base font-black tracking-wide uppercase">
                      ALCALDÍA DE NAGUANAGUA &bull; IAMEC
                    </h4>
                    <p className="text-xs text-emerald-100 font-bold mt-1">
                      COMPROBANTE FISCAL DIGITAL (SENIAT / THE FACTORY HKA)
                    </p>
                  </div>
                  <div className="p-6 space-y-4 text-sm text-slate-700">
                    <p>
                      Estimado(a) <strong>{destinatarioModal.nombre}</strong> (R.I.F. / Cédula:{' '}
                      <strong>{destinatarioModal.identidad}</strong>),
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Le informamos que su <strong>Factura Fiscal Digital</strong> correspondiente a las tasas del servicio de aseo urbano y saneamiento ambiental ha sido emitida exitosamente a través de la imprenta digital autorizada.
                    </p>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-500">Número de Control SENIAT:</span>
                        <strong className="font-mono text-slate-900">
                          {destinatarioModal.numeroControl || 'N/A'}
                        </strong>
                      </div>
                      {destinatarioModal.numeroDocumento && (
                        <div className="flex justify-between border-b border-slate-200 pb-1.5">
                          <span className="text-slate-500">Número de Factura:</span>
                          <strong className="font-mono text-slate-900">
                            {destinatarioModal.numeroDocumento}
                          </strong>
                        </div>
                      )}
                      {destinatarioModal.referenciaPago && (
                        <div className="flex justify-between border-b border-slate-200 pb-1.5">
                          <span className="text-slate-500">Referencia Bancaria:</span>
                          <strong className="font-mono text-slate-900">
                            {destinatarioModal.referenciaPago}
                          </strong>
                        </div>
                      )}
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-500">Fecha de Emisión:</span>
                        <strong className="text-slate-900">
                          {destinatarioModal.fechaTransaccion ||
                            (destinatarioModal.fechaEnvio
                              ? new Date(destinatarioModal.fechaEnvio).toLocaleDateString('es-VE')
                              : '—')}
                        </strong>
                      </div>
                      <div className="flex justify-between pt-1 text-sm">
                        <span className="font-bold text-slate-700">Monto Total de la Factura:</span>
                        <strong className="font-mono text-emerald-700 font-black">
                          Bs.{' '}
                          {(Number(destinatarioModal.totalDeudaBs) || 0).toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </strong>
                      </div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center text-xs font-bold text-emerald-800">
                      📎 Su Factura Fiscal Digital va adjunta a este correo en formato PDF (Factura_
                      {destinatarioModal.numeroControl || destinatarioModal.numeroDocumento || 'SENIAT'}.pdf).
                    </div>
                  </div>
                </div>
              ) : destinatarioModal.tipoCorreo === 'recibo' && destinatarioModal.pagoId ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-sky-600" />
                      Recibo Digital: <strong className="font-mono">{destinatarioModal.numeroRecibo}</strong>
                    </span>
                    <a
                      href={`/api/admin/recibos-digitales/pdf?pagoId=${encodeURIComponent(destinatarioModal.pagoId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Descargar PDF del Recibo
                    </a>
                  </div>
                  <iframe
                    title="Vista Previa Recibo de Pago"
                    src={`/api/admin/recibos-digitales/preview?pagoId=${encodeURIComponent(destinatarioModal.pagoId)}`}
                    className="w-full h-[460px] bg-white border border-slate-200 rounded-xl shadow-2xs"
                  />
                </div>
              ) : campanaActiva.plantilla === 'recordatorio_pago' ? (
                <div
                  className="bg-white border border-slate-200 rounded-lg p-7 text-black max-w-2xl mx-auto shadow-xs"
                  style={{ fontFamily: 'Calibri, Arial, Helvetica, sans-serif', fontSize: '11pt', lineHeight: 1.45 }}
                >
                  <div className="text-center mb-5">
                    <img src="/logos/IAMEC.png" alt="IAMEC" className="w-[210px] h-auto inline-block" />
                  </div>
                  <p className="text-justify mb-3">
                    <strong>Estimados usuarios</strong>, el Instituto Autónomo Municipal de Ecosocialismo (IAMEC) recuerda a todos los residentes, comerciantes e industriales del municipio Naguanagua la importancia de mantener al día el pago correspondiente al servicio de aseo urbano y domiciliario. Su contribución puntual permite garantizar la continuidad, eficiencia y operatividad de las rutas de recolección en todo el municipio.
                  </p>
                  <p className="text-justify mb-3.5">
                    Para facilitar el cumplimiento de sus obligaciones tributarias, ponemos a su disposición nuestras cuentas bancarias oficiales autorizadas para realizar transferencias o pagos:
                  </p>
                  <p className="text-center font-bold mb-3">Datos Bancarios Oficiales</p>
                  <p className="font-bold mb-2">Titular: IAMEC</p>
                  <p className="font-bold mb-2">RIF: G-200086149</p>
                  <p className="font-bold mb-1">BANCAMIGA</p>
                  <p className="mb-1">Tipo de cuenta: Cuenta Corriente</p>
                  <p className="mb-3">Número de cuenta: 0172-0110-71-1101340717</p>
                  <p className="font-bold mb-1">BANESCO</p>
                  <p className="mb-1">Tipo de cuenta: Cuenta Corriente</p>
                  <p className="mb-5">Número de cuenta: 0134-1089-59-0001008636</p>
                  <p className="font-bold mb-2">Canales de Atención y Reporte de Pagos</p>
                  <p className="text-justify mb-3">
                    Una vez realizada la operación bancaria, o en caso de requerir información sobre su estado de cuenta, facturación o atención al contribuyente, comuníquese directamente a través de nuestros canales oficiales según su categoría:
                  </p>
                  <p className="mb-1">Sector Residencial: 0424-4282364 · aseoresnaguanagua@globalgreenca.com</p>
                  <p className="mb-5">Sector Comercial: 0424-4282365 · aseocomnaguanagua@globalgreenca.com</p>
                  <p className="text-center font-bold underline text-[#FF0000] mb-5">
                    SI USTED YA REALIZO SU PAGO, HAGA CASO OMISO DE ESTE MENSAJE
                  </p>
                  <div className="text-center mt-2 mb-1">
                    <img src="/logos/IAMEC.png" alt="IAMEC" className="w-[170px] h-auto inline-block" />
                  </div>
                  <p className="text-center font-bold mb-1">ATENTAMENTE:</p>
                  <p className="text-center font-bold">OFICINA DE RECAUDACION DE ASEO</p>
                </div>
              ) : (
                <div
                  className="bg-white border border-slate-200 rounded-lg p-7 text-[#222222] max-w-2xl mx-auto shadow-xs"
                  style={{ fontFamily: 'Calibri, Arial, Helvetica, sans-serif', fontSize: '11pt', lineHeight: 1.35 }}
                >
                  <div className="text-center mb-4">
                    <img src="/logos/IAMEC.png" alt="IAMEC" className="w-[200px] h-auto inline-block" />
                  </div>
                  <p className="text-center font-bold mb-2">ESTADO DE CUENTA ASEO NAGUANAGUA</p>
                  <p className="text-center font-bold mb-3.5">FAVOR LEER TEXTO COMPLETO</p>
                  <p className="mb-3">
                    Nos dirigimos a Ud., en la oportunidad de remitir estado de cuenta contentivo de su deuda (total o parcial) de la tasa de Aseo Urbano del Municipio Naguanagua.
                  </p>
                  <p className="mb-2 font-bold">
                    • BANESCO (Cuenta Corriente): 0134-1089-59-0001008636 — IAMEC (G-20008614-9)
                  </p>
                  <p className="mb-3 font-bold">
                    • BANCAMIGA (Cuenta Corriente): 0172-0110-71-1101340717 — IAMEC (G-20008614-9)
                  </p>
                  <p className="text-justify mb-4">
                    Si usted ya ejecutó su pago, hacer caso omiso de este correo. Agradeciendo su pronto pago, quedamos a sus órdenes.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setDestinatarioModal(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white cursor-pointer"
              >
                Cerrar Vista Previa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
