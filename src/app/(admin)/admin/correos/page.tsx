'use client';
import React, { useState, useEffect } from 'react';
import { Tabs } from '@/components/Tabs';
import { Mail, Settings, Users, Send, CheckCircle, Loader2, ShieldCheck, AlertCircle, Eye, FileText, Paperclip } from 'lucide-react';

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

  useEffect(() => {
    fetch('/api/admin/envio-comunicado')
      .then(r => r.json())
      .then(d => {
        if (d?.ok && d.resumen) {
          setResumen(d.resumen);
        }
      })
      .catch(() => {});
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
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: data.mensaje || `Correo de prueba con Estado de Cuenta PDF adjunto despachado a ${testEmailDestino || 'facturacion.comercial@globalgreenca.com'}.`,
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
    if (
      !confirm(
        `¿Desea iniciar el envío masivo a ${destinatariosSeleccionados.toLocaleString('es-VE')} contribuyentes (${tipoFiltro} · ${estatusFiltro})${
          adjuntarPdf ? ' con su Estado de Cuenta PDF adjunto' : ''
        }?`
      )
    ) {
      return;
    }

    setIsSending(true);
    setProgress(10);
    setStatusMessage(null);

    try {
      const progressTimer = setInterval(() => {
        setProgress(p => (p < 90 ? p + 10 : p));
      }, 900);

      const res = await fetch('/api/admin/envio-comunicado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: false,
          plantilla,
          asunto,
          tipoFiltro,
          estatusFiltro,
          adjuntarPdf,
        }),
      });

      clearInterval(progressTimer);
      setProgress(100);

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Campaña completada: ${data.enviados} Estados de Cuenta enviados exitosamente.`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Error en la campaña masiva: ${data.error}`,
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Error en la conexión del servidor: ' + e.message });
    } finally {
      setIsSending(false);
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

  const tabs = [
    { id: 'configurar', label: 'Configuración y Plantilla', icon: <Settings className="w-4 h-4" />, content: configTabContent },
    { id: 'destinatarios', label: 'Segmentos y Destinatarios', icon: <Users className="w-4 h-4" />, content: destinatariosTabContent },
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
              Usuarios a Enviar ({estatusFiltro.includes('Morosos') ? 'Con Deuda + PDF' : estatusFiltro})
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
                      <span>Procesando...</span>
                      <span>{progress}%</span>
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
    </div>
  );
}
