'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  Search,
  Mail,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Award,
  RefreshCw,
  Send,
  FileText,
  Lock,
  ArrowLeft,
  X,
  CheckSquare,
} from 'lucide-react';
import { generarSolvenciaPDF } from '@/lib/pdfGenerator';

const fmtBs = (n: number) =>
  (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LiberacionRetencionesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedQ, setDebouncedQ] = useState<string>('');
  const [filtro, setFiltro] = useState<'todos' | 'esperando_planilla' | 'pendientes_emision' | 'liberados'>('todos');
  const [adminUser, setAdminUser] = useState<any>(null);

  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [solvenciaId, setSolvenciaId] = useState<string | null>(null);
  const [modalEnvio, setModalEnvio] = useState<{ item: any; correo: string; emitirPrimero: boolean } | null>(null);
  const [enviandoModal, setEnviandoModal] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  useEffect(() => {
    try {
      setAdminUser(JSON.parse(localStorage.getItem('admin_user_data') || 'null'));
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const cargarCasos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (filtro) params.set('filtro', filtro);
      const res = await fetch(`/api/admin/retenciones/liberar?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.items || []);
      } else {
        setFeedbackMsg({ tipo: 'err', texto: data.error || 'No se pudieron cargar los registros.' });
      }
    } catch (e: any) {
      setFeedbackMsg({ tipo: 'err', texto: e.message || 'Error de conexión.' });
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, filtro]);

  useEffect(() => {
    cargarCasos();
  }, [cargarCasos]);

  const handleToggleCheckLiberar = async (item: any, nuevoValor: boolean) => {
    setProcesandoId(item.pagoId);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/admin/retenciones/liberar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'toggle_check',
          pagoId: item.pagoId,
          liberar: nuevoValor,
          usuario: adminUser?.usuario || adminUser?.nombre || 'Administrador',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo actualizar el check de liberación.');
      }
      setItems(prev =>
        prev.map(it =>
          it.pagoId === item.pagoId
            ? {
                ...it,
                liberadoSinPlanilla: nuevoValor,
                solvenciaEmitidaLiberacion: nuevoValor ? it.solvenciaEmitidaLiberacion : false,
                liberadoAt: data.liberadoAt,
                liberadoPor: data.liberadoPor,
                retencionEstado: nuevoValor ? 'liberada_sin_planilla' : 'esperando_planilla',
              }
            : it
        )
      );
      setFeedbackMsg({
        tipo: 'ok',
        texto: nuevoValor
          ? `✅ Liberada sin planilla la factura/planilla de ${item.contribuyente} (${item.identidad}) en Soy Contribuyente sin alterar el cierre. Para habilitar también su Solvencia en el portal sin planilla, pulse el botón "Emitir Solvencia".`
          : `Check de liberación desactivado para ${item.contribuyente}. En Soy Contribuyente vuelve a regirse por las reglas regulares.`,
      });
    } catch (e: any) {
      setFeedbackMsg({ tipo: 'err', texto: e.message });
    } finally {
      setProcesandoId(null);
    }
  };

  const handleToggleExAgentePadron = async (item: any, dejarComoAgente: boolean) => {
    setProcesandoId(`padron_${item.pagoId}`);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/admin/retenciones/liberar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'toggle_padron_agente',
          identidad: item.identidad,
          codigosInmueble: item.codigosInmueble,
          esAgente: dejarComoAgente,
          usuario: adminUser?.usuario || adminUser?.nombre || 'Administrador',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo actualizar la condición en el padrón.');
      }
      setItems(prev =>
        prev.map(it =>
          it.identidad === item.identidad
            ? { ...it, esAgenteEnPadron: dejarComoAgente }
            : it
        )
      );
      setFeedbackMsg({
        tipo: 'ok',
        texto: dejarComoAgente
          ? `Contribuyente ${item.contribuyente} marcado como Agente de Retención en el padrón.`
          : `✅ Contribuyente ${item.contribuyente} desmarcado como Agente de Retención para cobros futuros (sin modificar cierres anteriores).`,
      });
    } catch (e: any) {
      setFeedbackMsg({ tipo: 'err', texto: e.message });
    } finally {
      setProcesandoId(null);
    }
  };

  const handleConfirmarEnvioSinPlanilla = async () => {
    if (!modalEnvio) return;
    const { item, correo, emitirPrimero } = modalEnvio;
    setEnviandoModal(true);
    setFeedbackMsg(null);
    try {
      const usuarioAct = adminUser?.usuario || adminUser?.nombre || 'Administrador';
      if (emitirPrimero) {
        // Primero activamos el check de liberación sin planilla y luego emitimos + enviamos la factura en TFHKA
        await fetch('/api/admin/retenciones/liberar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'toggle_check',
            pagoId: item.pagoId,
            liberar: true,
            usuario: usuarioAct,
          }),
        });

        const resEmit = await fetch('/api/admin/factura-digital/emitir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pagoId: item.pagoId,
            identidad: item.identidad,
            contribuyente: item.contribuyente,
            recibos: item.recibos || [],
            montos: item.montos || {},
            montoTotal: item.montoFactura || item.montoPagado,
            correoDestino: correo.trim() || undefined,
            enviarCorreo: true,
            liberarSinPlanilla: true,
            usuario: usuarioAct,
          }),
        });
        const dataEmit = await resEmit.json();
        if (!resEmit.ok || dataEmit.error) {
          throw new Error(dataEmit.error || 'Error al emitir la factura electrónica.');
        }

        setFeedbackMsg({
          tipo: 'ok',
          texto: `✅ Factura N° ${dataEmit.numeroDocumento || ''} (Control ${dataEmit.numeroControl || ''}) emitida y enviada exitosamente a ${correo.trim() || dataEmit.correoUtilizado || 'archivo fiscal'} sin requerir planilla de retención.`,
        });
        setModalEnvio(null);
        await cargarCasos();
      } else {
        const res = await fetch('/api/admin/retenciones/liberar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'enviar_factura_sin_planilla',
            pagoId: item.pagoId,
            correoDestino: correo.trim() || undefined,
            usuario: usuarioAct,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Error al enviar la factura.');
        }

        setItems(prev =>
          prev.map(it =>
            it.pagoId === item.pagoId
              ? {
                  ...it,
                  liberadoSinPlanilla: true,
                  retencionEstado: 'liberada_sin_planilla',
                  correo: data.correo || it.correo,
                  ultimoEnvioCorreoAt: data.ultimoEnvioCorreoAt,
                }
              : it
          )
        );
        setFeedbackMsg({
          tipo: 'ok',
          texto: data.clienteEnviado
            ? `✅ Factura N° ${item.numeroFactura || ''} enviada directamente a ${data.correo} y liberada en el portal del contribuyente sin planilla de retención.`
            : `✅ Factura liberada sin planilla. ${data.error || 'Copia enviada al archivo interno.'}`,
        });
        setModalEnvio(null);
      }
    } catch (e: any) {
      setFeedbackMsg({ tipo: 'err', texto: e.message });
    } finally {
      setEnviandoModal(false);
    }
  };

  const handleEmitirSolvencia = async (item: any) => {
    const codInm = item.codigosInmueble?.[0] || '';
    setSolvenciaId(item.pagoId);
    setFeedbackMsg(null);
    try {
      // 1. Registrar en servidor que la Solvencia fue emitida desde este módulo (habilita descarga en Soy Contribuyente)
      const resLib = await fetch('/api/admin/retenciones/liberar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'emitir_solvencia_liberada',
          pagoId: item.pagoId,
          usuario: adminUser?.usuario || adminUser?.nombre || 'Administrador',
        }),
      });
      const dataLib = await resLib.json();
      if (!resLib.ok || !dataLib.success) {
        throw new Error(dataLib.error || 'No se pudo habilitar la solvencia.');
      }

      setItems(prev =>
        prev.map(it =>
          it.pagoId === item.pagoId
            ? {
                ...it,
                liberadoSinPlanilla: true,
                solvenciaEmitidaLiberacion: true,
                retencionEstado: 'liberada_sin_planilla',
              }
            : it
        )
      );

      // 2. Generar directamente el Certificado de Solvencia PDF autorizado desde este módulo
      await generarSolvenciaPDF(
        {
          Identidad: item.identidad,
          Contribuyente: item.contribuyente,
          Telefono: item.telefono || '+58 412-9030238',
          Direccion: item.direccionFiscal || 'Municipio Naguanagua',
          CodCont: codInm || item.identidad,
        },
        codInm || 'general'
      );
      setFeedbackMsg({
        tipo: 'ok',
        texto: `✅ Certificado de Solvencia emitido para ${item.contribuyente} (${codInm || item.identidad}) y habilitado para descarga en Soy Contribuyente junto con su planilla/factura.`,
      });
    } catch (e: any) {
      setFeedbackMsg({ tipo: 'err', texto: 'Error al generar Solvencia: ' + (e.message || 'Error') });
    } finally {
      setSolvenciaId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-[1450px] mx-auto space-y-5">
      {/* Cabecera */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <FileCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">
              Liberación de Facturas y Solvencias sin Planilla de Retención
            </h1>
          </div>
          <p className="text-xs text-slate-600 max-w-4xl leading-relaxed">
            Módulo especial para contribuyentes que <strong>dejaron de ser Agentes de Retención</strong> o cuyas facturas pertenecen a{' '}
            <strong>cierres de meses pasados</strong>. Active el check para liberar la emisión/entrega de su factura y su Certificado de Solvencia{' '}
            <strong>sin exigir carga de planilla de retención y sin anular ni modificar el Libro de Ventas del cierre anterior</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Link
            href="/admin/facturacion-electronica"
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Ir a Facturación Electrónica
          </Link>
          <button
            onClick={cargarCasos}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Aviso de Protección de Cierre */}
      <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-indigo-950">
        <Lock className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
        <div>
          <strong className="font-extrabold">Protección de Cierres Contables y Libro de Ventas:</strong> Al marcar el check de liberación o enviar la factura desde este módulo, el sistema{' '}
          <strong>NO anula la factura en The Factory HKA ni altera fechas, montos, retenciones ni totales del cierre del mes pasado</strong>. Únicamente libera el documento PDF para el contribuyente y habilita su Solvencia Municipal.
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
            feedbackMsg.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <span>{feedbackMsg.texto}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Buscador y Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar contribuyente por RIF / Cédula, Código (URB...), Razón Social, N° de Factura o Referencia..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 flex-wrap">
          {[
            { id: 'todos', label: 'Todos los Casos' },
            { id: 'esperando_planilla', label: 'Retenidas (Sin Planilla)' },
            { id: 'pendientes_emision', label: 'Pendientes de Emisión' },
            { id: 'liberados', label: '✓ Liberadas sin Planilla' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFiltro(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filtro === tab.id
                  ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-bold">
          <span>Mostrando {items.length} operación(es)</span>
          <span>Marque el check para liberar factura y solvencia sin planilla</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
            <span>Cargando operaciones y verificando padrón fiscal...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm space-y-2">
            <FileCheck className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700">No se encontraron operaciones con este filtro.</p>
            <p className="text-xs text-slate-500">
              Escriba el RIF, código URB o nombre del contribuyente en el buscador superior para localizar cualquier pago o factura.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 text-slate-600 uppercase text-[10px] font-black border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Contribuyente / Inmueble</th>
                  <th className="py-3 px-3">Condición en Padrón (Futuro)</th>
                  <th className="py-3 px-3">Pago / Factura / Cierre</th>
                  <th className="py-3 px-3 text-right">Montos (Bs)</th>
                  <th className="py-3 px-4 text-center bg-emerald-50/60 border-x border-emerald-100">
                    Check: Liberar sin Planilla
                  </th>
                  <th className="py-3 px-4 text-right">Acciones (Factura y Solvencia)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => {
                  const isBusy = procesandoId === item.pagoId;
                  const isBusyPadron = procesandoId === `padron_${item.pagoId}`;
                  const isBusySolv = solvenciaId === item.pagoId;

                  return (
                    <tr
                      key={item.pagoId}
                      className={`transition-colors ${
                        item.liberadoSinPlanilla ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* 1. Contribuyente */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-extrabold text-slate-900 text-xs">{item.contribuyente}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                            {item.identidad}
                          </span>
                          {item.codigosInmueble?.map((cod: string) => (
                            <span
                              key={cod}
                              className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]"
                            >
                              {cod}
                            </span>
                          ))}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-mono">{item.correo || 'Sin correo registrado'}</span>
                        </div>
                      </td>

                      {/* 2. Condición en Padrón para futuros cobros */}
                      <td className="py-3.5 px-3 align-top">
                        <label
                          className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors select-none ${
                            !item.esAgenteEnPadron
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : 'bg-violet-50 text-violet-900 border-violet-300'
                          }`}
                          title="Si el contribuyente dejó de ser Agente de Retención, desmárquelo aquí para que en futuros cobros de Caja no se le aplique retención (no modifica cierres pasados)."
                        >
                          <input
                            type="checkbox"
                            checked={!item.esAgenteEnPadron}
                            disabled={isBusyPadron}
                            onChange={e => handleToggleExAgentePadron(item, !e.target.checked)}
                            className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
                          />
                          <span>
                            {!item.esAgenteEnPadron
                              ? '✓ Ya es Ex-Agente (No retiene)'
                              : 'Dejó de ser Agente (Quitar marca)'}
                          </span>
                        </label>
                        <span className="block text-[10px] text-slate-400 mt-1">
                          {item.esAgenteEnPadron
                            ? 'Actualmente figura como Agente en padrón'
                            : 'No aplica retención en cobros nuevos'}
                        </span>
                      </td>

                      {/* 3. Pago / Factura / Cierre */}
                      <td className="py-3.5 px-3 align-top space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.facturaEmitida ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Factura Emitida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <AlertTriangle className="w-3 h-3" />
                              Pendiente Emisión
                            </span>
                          )}
                          {item.liberadoSinPlanilla || item.retencionEstado === 'aprobada' || item.retencionEstado === 'liberada_sin_planilla' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                              ✓ Sin Retención Pendiente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              ⏳ Retención Pendiente
                            </span>
                          )}
                          {item.esCierrePasado && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-900 border border-indigo-300"
                              title="Pertenece a un cierre mensual anterior. No se anula ni modifica en el Libro de Ventas."
                            >
                              <Lock className="w-2.5 h-2.5" />
                              Cierre Pasado Protegido
                            </span>
                          )}
                        </div>
                        {item.numeroFactura && (
                          <div className="font-mono text-[11px] font-bold text-slate-800">
                            Doc: {item.numeroFactura} {item.numeroControl ? `· Ctrl: ${item.numeroControl}` : ''}
                          </div>
                        )}
                        <div className="font-mono text-[11px] text-slate-500">
                          Ref: {item.referencia} ({item.tipoPago}) · Fecha: {item.fechaEmision || item.fechaPago}
                        </div>
                        {item.ultimoEnvioCorreoAt && (
                          <div className="text-[10px] font-bold text-emerald-700">
                            ✓ Factura enviada: {new Date(item.ultimoEnvioCorreoAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
                          </div>
                        )}
                      </td>

                      {/* 4. Montos */}
                      <td className="py-3.5 px-3 align-top text-right font-mono">
                        <div className="font-black text-slate-900 text-xs">
                          Total Fac: Bs {fmtBs(item.montoFactura)}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Pagado: Bs {fmtBs(item.montoPagado)}
                        </div>
                        {item.montoRetencion > 0 && (
                          <div className="text-[10px] font-bold text-amber-800">
                            Ret. 75%: Bs {fmtBs(item.montoRetencion)}
                          </div>
                        )}
                      </td>

                      {/* 5. Check Principal: Liberar sin Planilla */}
                      <td className="py-3.5 px-4 align-top text-center bg-emerald-50/30 border-x border-emerald-100/80">
                        <label
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-extrabold text-xs cursor-pointer transition-all select-none shadow-2xs ${
                            item.liberadoSinPlanilla
                              ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                              : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!item.liberadoSinPlanilla}
                            disabled={isBusy}
                            onChange={e => handleToggleCheckLiberar(item, e.target.checked)}
                            className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                          />
                          <span>
                            {item.liberadoSinPlanilla ? '✓ Liberada sin Planilla' : 'Liberar sin Planilla'}
                          </span>
                        </label>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {item.liberadoSinPlanilla
                            ? 'Factura y Solvencia habilitadas'
                            : 'Exige planilla para entregar factura'}
                        </div>
                      </td>

                      {/* 6. Botones de Acción */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {item.facturaEmitida ? (
                            <>
                              <button
                                onClick={() =>
                                  setModalEnvio({
                                    item,
                                    correo: item.correo || '',
                                    emitirPrimero: false,
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                                title="Liberar y enviar la factura fiscal por correo sin necesidad de montar planilla de retención"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Enviar Factura sin Planilla</span>
                              </button>
                              {item.facturaUrl && (
                                <a
                                  href={item.facturaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                                  title="Abrir PDF de la factura emitida"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Ver PDF</span>
                                </a>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() =>
                                setModalEnvio({
                                  item,
                                  correo: item.correo || '',
                                  emitirPrimero: true,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                              title="Liberar, emitir la factura en The Factory HKA y enviarla por correo inmediatamente sin planilla de retención"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#c8e64c]" />
                              <span>Emitir y Enviar sin Planilla</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleEmitirSolvencia(item)}
                            disabled={isBusySolv}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 border transition-colors cursor-pointer disabled:opacity-50 ${
                              item.solvenciaEmitidaLiberacion
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-400'
                                : item.esSolventeDeuda
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                            }`}
                            title={
                              item.solvenciaEmitidaLiberacion
                                ? 'Solvencia emitida desde acá y habilitada en Soy Contribuyente (clic para descargar de nuevo)'
                                : item.esSolventeDeuda
                                ? 'Emitir Certificado de Solvencia desde acá para habilitar su descarga en Soy Contribuyente (si no se emite desde acá, aplica la regla regular)'
                                : `El inmueble registra ${item.mesesDeudaMax} mes(es) de deuda pendiente`
                            }
                          >
                            {isBusySolv ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Award className={`w-3.5 h-3.5 ${item.solvenciaEmitidaLiberacion ? 'text-emerald-700' : 'text-amber-600'}`} />
                            )}
                            <span>{item.solvenciaEmitidaLiberacion ? '✓ Solvencia Emitida' : 'Emitir Solvencia'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Confirmación / Envío de Factura sin Planilla */}
      {modalEnvio && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-[#c8e64c]" />
                <h3 className="font-extrabold text-sm">
                  {modalEnvio.emitirPrimero
                    ? 'Emitir y Enviar Factura sin Planilla'
                    : 'Enviar Factura sin Planilla de Retención'}
                </h3>
              </div>
              <button
                onClick={() => setModalEnvio(null)}
                disabled={enviandoModal}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="font-black text-slate-900 text-sm">{modalEnvio.item.contribuyente}</div>
                <div className="font-mono text-slate-600">
                  RIF: <strong>{modalEnvio.item.identidad}</strong>
                  {modalEnvio.item.codigosInmueble?.length > 0 && ` · Inmueble: ${modalEnvio.item.codigosInmueble.join(', ')}`}
                </div>
                {modalEnvio.item.numeroFactura && (
                  <div className="font-mono font-bold text-emerald-800">
                    Factura N° {modalEnvio.item.numeroFactura} · Control: {modalEnvio.item.numeroControl || 'N/A'}
                  </div>
                )}
                <div className="font-mono text-slate-700">
                  Monto Factura: <strong>Bs {fmtBs(modalEnvio.item.montoFactura)}</strong>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[11px] text-indigo-950 flex items-start gap-2">
                <Lock className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                <span>
                  Esta acción marcará automáticamente el check de <strong>Liberada sin Planilla</strong>, desbloqueará la factura en el portal del contribuyente y enviará el PDF oficial por correo,{' '}
                  <strong>sin modificar el Libro de Ventas ni el cierre contable</strong>.
                </span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Correo Electrónico del Contribuyente (puede editarlo o agregarlo):
                </label>
                <input
                  type="email"
                  value={modalEnvio.correo}
                  onChange={e => setModalEnvio({ ...modalEnvio, correo: e.target.value })}
                  placeholder="ejemplo@correo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalEnvio(null)}
                  disabled={enviandoModal}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarEnvioSinPlanilla}
                  disabled={enviandoModal}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {enviandoModal ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {modalEnvio.emitirPrimero ? 'Liberar, Emitir y Enviar Factura' : 'Liberar y Enviar Factura Ahora'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
