'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Send,
  Bot,
  User as UserIcon,
  CreditCard,
  FileText,
  Truck,
  Building2,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Landmark,
  Receipt,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/store/AppContext';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { isResidencialInm, isTerrenoInm, calcularMensualidad, cleanClasificacionActividad } from '@/lib/calculos';
import { calcularDeudaInmueble, porMesConRetencion, esUltimoMesHist } from '@/lib/deudaMensual';
import { construirRecibosContribuyente, desgloseReciboCM } from '@/lib/recibosContribuyente';
import { RUTAS_NAGUANAGUA } from '@/data/rutasNaguanagua';

interface AccionSugerida {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  acciones?: AccionSugerida[];
  createdAt: string;
}

const fmtBs = (n: number) =>
  'Bs. ' +
  (Number(n) || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function renderFormattedText(text: string) {
  const lines = String(text || '').split('\n');
  return lines.map((line, idx) => {
    if (line.trim() === '---') {
      return <hr key={idx} className="my-2.5 border-slate-200" />;
    }
    if (line.startsWith('### ')) {
      return (
        <h4 key={idx} className="font-extrabold text-slate-900 text-xs sm:text-sm mt-2.5 mb-1">
          {line.replace('### ', '')}
        </h4>
      );
    }

    // Parse **bold** and `code`
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <p key={idx} className={`${line.trim() === '' ? 'h-2' : 'leading-relaxed mb-1'}`}>
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-extrabold text-slate-900">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={pIdx}
                className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-xs font-bold"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        })}
      </p>
    );
  });
}

const PREGUNTAS_RAPIDAS = [
  { label: '💰 ¿Cuánto debo actualmente?', query: '¿Cuánto debo actualmente y cuál es mi estado de cuenta?' },
  { label: '⚠️ ¿Tengo multas o recargos?', query: '¿Tengo multas o recargos por mora en mi cuenta?' },
  { label: '🏦 Cuentas y formas de pago', query: '¿Cuáles son las cuentas bancarias y formas de pago?' },
  { label: '🚛 ¿Cuándo pasa el aseo por mi ruta?', query: '¿Qué días pasa el camión de aseo por mi sector?' },
  { label: '🏢 Ver mis inmuebles y códigos', query: 'Muéstrame mis inmuebles registrados y sus códigos' },
  { label: '🎁 ¿Tengo saldo a favor?', query: '¿Tengo saldo a favor o notas de crédito disponibles?' },
  { label: '🧾 Mis últimos pagos y facturas', query: 'Muéstrame mis últimos pagos y facturas electrónicas' },
  { label: '🏅 Solvencia, Tala y Reclamos', query: '¿Cómo descargo mi solvencia o solicito permiso de tala y poda?' },
];

export default function AsistenteVirtualPage() {
  const { tcmmv: contextTcmmv } = useAppContext();
  const [tasaBcv, setTasaBcv] = useState<number>(contextTcmmv || 0);
  const [loadingContext, setLoadingContext] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputMsg, setInputMsg] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [contextoCuenta, setContextoCuenta] = useState<any>({
    nombre: 'Contribuyente',
    doc: '',
    categoria: 'RESIDENCIAL',
    direccion: '',
    tasaBcv: 0,
    deudaTotalBs: 0,
    totalBaseBs: 0,
    totalMultaBs: 0,
    totalIvaBs: 0,
    totalRetencionBs: 0,
    saldoFavorBs: 0,
    recibosPendientesCount: 0,
    esAgenteRetencion: false,
    inmuebles: [],
    pagosRecientes: [],
    pagosPorVerificar: [],
    notasCredito: [],
  });

  useEffect(() => {
    fetch('/api/bcv')
      .then((r) => r.json())
      .then((d) => {
        if (d?.tcmmv > 0) setTasaBcv(d.tcmmv);
      })
      .catch(() => {
        if (contextTcmmv > 0) setTasaBcv(contextTcmmv);
      });
  }, [contextTcmmv]);

  useEffect(() => {
    const cargarDatosContribuyente = async () => {
      setLoadingContext(true);
      try {
        const fullDoc = localStorage.getItem('portal_doc') || localStorage.getItem('portal_codigo') || '';
        const storedName = localStorage.getItem('portal_user') || 'Contribuyente';
        if (!fullDoc) {
          setLoadingContext(false);
          return;
        }

        let currentRate = tasaBcv;
        if (!currentRate || currentRate <= 0) {
          try {
            const bRes = await fetch('/api/bcv').then((r) => r.json());
            if (bRes?.tcmmv > 0) {
              currentRate = bRes.tcmmv;
              setTasaBcv(currentRate);
            }
          } catch {}
        }
        if (!currentRate || currentRate <= 0) currentRate = 1;

        const variants = getIdentidadVariantsExact(fullDoc);
        const orFilter = variants.map((v) => `identidad.eq.${v}`).join(',');

        const [
          { data: contribData },
          { data: inmsDB },
          { data: condoUnits },
          { data: facturasDB },
          { data: pagosDB },
          { data: docsNC },
        ] = await Promise.all([
          supabase.from('contribuyentes').select('nombre, email, telefono, direccion').or(orFilter).limit(1).maybeSingle(),
          supabase.from('inmuebles').select('*').or(orFilter),
          supabase.from('condominio_unidades').select('inmueble, propietario, direccion').or(orFilter),
          supabase.from('facturas').select('*').or(orFilter).order('emision', { ascending: true }),
          supabase
            .from('pagos_reportados')
            .select('id, referencia, monto, estado, tipo, created_at, detalles')
            .or(orFilter)
            .order('created_at', { ascending: false })
            .limit(15),
          supabase
            .from('documentos')
            .select('id, tipo, estado, detalles')
            .or(orFilter)
            .ilike('tipo', '%nota%')
            .ilike('estado', 'vigente'),
        ]);

        let allInms = [...(inmsDB || [])];
        if (condoUnits && condoUnits.length > 0) {
          const condoCodes = condoUnits.map((u: any) => u.inmueble).filter(Boolean);
          const missingCodes = condoCodes.filter((c: string) => !allInms.some((i: any) => i.inmueble === c));
          if (missingCodes.length > 0) {
            const { data: extraInms } = await supabase.from('inmuebles').select('*').in('inmueble', missingCodes);
            if (extraInms) allInms.push(...extraInms);
          }
        }

        const parentCodes = allInms.map((i: any) => i.inmueble).filter(Boolean);
        if (parentCodes.length > 0) {
          const { data: childInms } = await supabase.from('inmuebles').select('*').in('padre_id', parentCodes);
          if (childInms && childInms.length > 0) {
            const missingChildren = childInms.filter((c: any) => !allInms.some((i: any) => i.inmueble === c.inmueble));
            allInms.push(...missingChildren);
          }
        }

        allInms = allInms.filter((i: any) => {
          const est = String(i.estado || 'Activo').trim().toLowerCase();
          return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado' && !isTerrenoInm(i);
        });

        // Deduplicar por código de inmueble
        const seenCodes = new Set<string>();
        const distinctInms = allInms.filter((i: any) => {
          if (!i.inmueble || seenCodes.has(i.inmueble)) return false;
          seenCodes.add(i.inmueble);
          return true;
        });

        const nombreReal =
          contribData?.nombre ||
          distinctInms.find((i: any) => i.contribuyente)?.contribuyente ||
          condoUnits?.[0]?.propietario ||
          storedName;

        const direccionReal =
          distinctInms.find((i: any) => i.direccion)?.direccion ||
          contribData?.direccion ||
          condoUnits?.[0]?.direccion ||
          '';

        // Construir recibos pendientes con la misma lógica oficial de Estado de Cuenta y Caja
        const rc = construirRecibosContribuyente({
          inmuebles: distinctInms,
          facturas: facturasDB || [],
          identidad: fullDoc,
        });

        const recibosPend = rc.recibos || [];
        const pagosVerif = (pagosDB || []).filter((p: any) => p.estado === 'Por Verificar');

        let totalBaseBs = 0;
        let totalMultaBs = 0;
        let totalIvaBs = 0;
        let totalRetencionBs = 0;
        let deudaTotalBs = 0;

        const deudaPorInmMap = new Map<string, { deudaBs: number; multaBs: number; meses: number }>();

        for (const r of recibosPend) {
          let baseMes = 0;
          let multaMes = 0;
          let ivaMes = 0;
          let retMes = 0;
          let totMes = 0;
          let codInm = r.inmueble || '';

          if (r.referencia?.startsWith('RECIB-HIST-')) {
            const parts = r.referencia.split('-');
            codInm = parts[2] || codInm;
            const inm = distinctInms.find((i: any) => i.inmueble === codInm);
            if (inm) {
              const histRefs = recibosPend.filter((x: any) => x.referencia?.startsWith(`RECIB-HIST-${codInm}-M`));
              const meses = histRefs.map((x: any) => ({
                emision: x.emision || new Date().toISOString(),
                esUltimo: esUltimoMesHist(x.referencia, inm, histRefs.length),
              }));
              const d = calcularDeudaInmueble(inm, currentRate, meses);
              const idx = histRefs.findIndex((x: any) => x.referencia === r.referencia);
              const pm = porMesConRetencion(d)[idx];
              if (pm) {
                baseMes = pm.base;
                multaMes = pm.multa;
                ivaMes = pm.iva;
                retMes = pm.retencion;
                totMes = pm.total;
              }
            }
          } else if (r.referencia?.startsWith('CM-')) {
            const d = desgloseReciboCM(r, distinctInms, currentRate);
            baseMes = d.base;
            multaMes = d.multa;
            ivaMes = d.iva;
            retMes = Math.round(d.ivaRetenible * 0.75 * 100) / 100;
            totMes = d.total;
          } else {
            totMes = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
            if (String(r.referencia || '').startsWith('MULTA-')) {
              multaMes = totMes;
            } else {
              baseMes = totMes;
            }
          }

          totalBaseBs += baseMes;
          totalMultaBs += multaMes;
          totalIvaBs += ivaMes;
          totalRetencionBs += retMes;
          deudaTotalBs += totMes;

          if (codInm) {
            const prev = deudaPorInmMap.get(codInm) || { deudaBs: 0, multaBs: 0, meses: 0 };
            prev.deudaBs += totMes;
            prev.multaBs += multaMes;
            if (!String(r.referencia || '').startsWith('MULTA-')) prev.meses += 1;
            deudaPorInmMap.set(codInm, prev);
          }
        }

        // Saldo a favor total
        const saldoInms = distinctInms.reduce((s: number, i: any) => s + (parseFloat(i.saldo_favor_bs) || 0), 0);
        const notasVigentes = (docsNC || []).map((d: any) => {
          const det = typeof d.detalles === 'string' ? JSON.parse(d.detalles || '{}') : d.detalles || {};
          return { id: d.id, monto: parseFloat(det.monto || '0') || 0, ref: det.origen_referencia || '' };
        });
        const saldoNC = notasVigentes.reduce((s: number, n: any) => s + n.monto, 0);
        const saldoFavorBs = Math.max(saldoInms, saldoNC);

        let hasRes = false;
        let hasCom = false;
        let esAgente = false;

        const inmueblesResumen = distinctInms
          .filter((i: any) => !rc.naCodes.includes(i.inmueble))
          .map((i: any) => {
            const esRes = isResidencialInm(i);
            if (esRes) hasRes = true;
            else hasCom = true;
            if (i.agente_retencion) esAgente = true;

            const infoDeuda = deudaPorInmMap.get(i.inmueble) || {
              deudaBs: 0,
              multaBs: parseFloat(i.multa_bs || '0') || 0,
              meses: parseInt(i.meses_deuda || '0') || 0,
            };

            const mensBs = calcularMensualidad(i, currentRate);
            return {
              codigo: i.inmueble,
              tipo: esRes ? 'Residencial' : 'Comercial',
              actividad: cleanClasificacionActividad(i.actividad_principal || i.clasificacion || ''),
              mmvMes: parseFloat(i.mmv_mes || '0') || 0,
              mensualidadBs: mensBs,
              mesesDeuda: infoDeuda.meses,
              deudaBs: Math.round(infoDeuda.deudaBs * 100) / 100,
              multaBs: Math.round(infoDeuda.multaBs * 100) / 100,
              direccion: i.direccion || '',
            };
          });

        const categoria = hasRes && hasCom ? 'MIXTO' : hasCom ? 'COMERCIAL' : 'RESIDENCIAL';

        const pagosRecientes = (pagosDB || [])
          .filter((p: any) => !['Anulado', 'Rechazado', 'Reversado'].includes(p.estado))
          .slice(0, 6)
          .map((p: any) => {
            let det: any = {};
            try {
              det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles || {};
            } catch {}
            return {
              referencia: p.referencia || 'S/R',
              monto: parseFloat(p.monto || '0') || 0,
              estado: p.estado || 'Aprobado',
              tipo: p.tipo || 'Transferencia',
              fecha: p.created_at ? new Date(p.created_at).toLocaleDateString('es-VE') : '',
              facturaFiscal: det?.factura_digital?.numero_factura || det?.factura_digital?.numero_documento || '',
            };
          });

        const nuevoCtx = {
          nombre: nombreReal,
          doc: fullDoc,
          categoria,
          direccion: direccionReal,
          tasaBcv: currentRate,
          deudaTotalBs: Math.round(deudaTotalBs * 100) / 100,
          totalBaseBs: Math.round(totalBaseBs * 100) / 100,
          totalMultaBs: Math.round(totalMultaBs * 100) / 100,
          totalIvaBs: Math.round(totalIvaBs * 100) / 100,
          totalRetencionBs: Math.round(totalRetencionBs * 100) / 100,
          saldoFavorBs: Math.round(saldoFavorBs * 100) / 100,
          recibosPendientesCount: recibosPend.length,
          esAgenteRetencion: esAgente,
          inmuebles: inmueblesResumen,
          pagosRecientes,
          pagosPorVerificar: pagosVerif,
          notasCredito: notasVigentes,
        };

        setContextoCuenta(nuevoCtx);

        // Generar saludo inicial personalizado con el nombre del contribuyente
        const netoAPagar = Math.max(0, nuevoCtx.deudaTotalBs - nuevoCtx.totalRetencionBs - nuevoCtx.saldoFavorBs);
        const saludoTexto =
          `¡Hola, **${nombreReal}**! 👋 Bienvenido(a) a tu **Asistente Inteligente del IAMEC**.\n\n` +
          `Estoy conectado en tiempo real con tu cuenta (**${fullDoc}** · **${categoria}**):\n` +
          `• 💰 **Saldo Neto Pendiente:** ${
            netoAPagar > 0.01 ? `**${fmtBs(netoAPagar)}** (${recibosPend.length} período/s)` : '✅ **Bs. 0,00 (Solvente)**'
          }\n` +
          `• ⚠️ **Multas / Mora:** ${
            nuevoCtx.totalMultaBs > 0.01 ? `**${fmtBs(nuevoCtx.totalMultaBs)}**` : '**Bs. 0,00** (Sin multas)'
          }\n` +
          `• 🏢 **Inmuebles Activos:** **${inmueblesResumen.length}** (${
            inmueblesResumen.map((x: any) => x.codigo).slice(0, 4).join(', ') || 'Ninguno'
          })\n` +
          (nuevoCtx.saldoFavorBs > 0.01 ? `• 🎁 **Saldo a Favor:** **${fmtBs(nuevoCtx.saldoFavorBs)}**\n` : '') +
          `\n¿En qué te puedo ayudar hoy? Selecciona una consulta rápida abajo o escríbeme tu pregunta:`;

        setMessages([
          {
            id: 'welcome-msg',
            role: 'assistant',
            content: saludoTexto,
            acciones: [
              { label: '💳 Ir a Pagar', href: '/portal/pagos', variant: 'primary' },
              { label: '📄 Estado de Cuenta', href: '/portal/estado-cuenta', variant: 'secondary' },
              { label: '🚛 Rutas y Horarios', href: '/portal/rutas', variant: 'secondary' },
            ],
            createdAt: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } catch (err) {
        console.error('Error cargando contexto del asistente:', err);
      }
      setLoadingContext(false);
    };

    cargarDatosContribuyente();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const enviarPregunta = async (texto?: string) => {
    const pregunta = (texto ?? inputMsg).trim();
    if (!pregunta || isSending) return;

    const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: pregunta,
      createdAt: hora,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!texto) setInputMsg('');
    setIsSending(true);

    try {
      const res = await fetch('/api/contribuyente/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: pregunta,
          contextoCuenta,
        }),
      });
      const data = await res.json();
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content:
          data?.respuesta ||
          'Puedo ayudarte con tus deudas, multas, cuentas bancarias, rutas de recolección e inmuebles.',
        acciones: data?.acciones || [],
        createdAt: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Ocurrió un error de conexión al consultar tu información. Por favor intenta de nuevo.',
          createdAt: hora,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const netoAPagar = Math.max(
    0,
    contextoCuenta.deudaTotalBs - contextoCuenta.totalRetencionBs - contextoCuenta.saldoFavorBs
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Cabecera Institucional con Resumen en Vivo */}
      <div className="bg-gradient-to-r from-[#0d2a1e] via-[#123828] to-[#0f172a] rounded-2xl p-5 text-white shadow-lg border border-emerald-500/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <Sparkles className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-lime-400/20 text-lime-300 border border-lime-400/30">
                  🤖 Asistente Virtual IA · En Línea 24/7
                </span>
                <span className="text-[11px] font-bold text-emerald-200/80">
                  {contextoCuenta.doc} · {contextoCuenta.categoria}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight mt-1">
                Hola, {contextoCuenta.nombre}
              </h1>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                Consulta al instante tus deudas, multas, formas de pago, rutas de recolección, solvencias e inmuebles.
              </p>
            </div>
          </div>

          {/* Tarjetas Resumen Rápido */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 min-w-[260px]">
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-emerald-200/80">Por Pagar</div>
              <div className="text-xs sm:text-sm font-black text-white truncate">
                {loadingContext ? '...' : fmtBs(netoAPagar)}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-amber-200/90">Multas</div>
              <div className="text-xs sm:text-sm font-black text-amber-300 truncate">
                {loadingContext ? '...' : fmtBs(contextoCuenta.totalMultaBs)}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-sky-200/90">Inmuebles</div>
              <div className="text-xs sm:text-sm font-black text-sky-300">
                {loadingContext ? '...' : `${contextoCuenta.inmuebles.length} activo(s)`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de Preguntas Frecuentes / Chips Rápidos */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
          Consultas Rápidas en 1 Clic:
        </div>
        <div className="flex flex-wrap gap-2">
          {PREGUNTAS_RAPIDAS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              disabled={loadingContext || isSending}
              onClick={() => enviarPregunta(item.query)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ventana Principal de Conversación */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[520px] sm:h-[560px] overflow-hidden">
        {/* Área de Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60">
          {loadingContext ? (
            <div className="flex items-center justify-center h-full text-slate-500 gap-2 text-sm font-semibold">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              Sincronizando datos de tu cuenta en tiempo real...
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                    m.role === 'assistant'
                      ? 'bg-gradient-to-br from-emerald-600 to-[#0d2a1e] text-lime-300'
                      : 'bg-slate-800 text-white'
                  }`}
                >
                  {m.role === 'assistant' ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-xs sm:text-sm shadow-sm ${
                    m.role === 'assistant'
                      ? 'bg-white border border-slate-200 text-slate-700'
                      : 'bg-emerald-700 text-white font-medium'
                  }`}
                >
                  <div className={m.role === 'user' ? 'text-white' : 'text-slate-700'}>
                    {m.role === 'assistant' ? renderFormattedText(m.content) : m.content}
                  </div>

                  {m.acciones && m.acciones.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-2">
                      {m.acciones.map((acc, i) => (
                        <Link
                          key={i}
                          href={acc.href}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                            acc.variant === 'primary'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                          }`}
                        >
                          {acc.label}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ))}
                    </div>
                  )}

                  <div
                    className={`text-[10px] mt-1.5 text-right ${
                      m.role === 'assistant' ? 'text-slate-400' : 'text-emerald-200'
                    }`}
                  >
                    {m.createdAt}
                  </div>
                </div>
              </div>
            ))
          )}

          {isSending && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold pl-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-700 text-lime-300 flex items-center justify-center">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <span>El Asistente IAMEC está analizando tu consulta...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Barra de Escritura */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviarPregunta();
          }}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder="Escribe tu pregunta (ej: ¿Cuánto debo?, ¿Cuándo pasa el aseo?, ¿Cuentas bancarias?)..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 focus:border-emerald-500 focus:bg-white text-xs sm:text-sm text-slate-800 outline-none transition-all"
          />
          <button
            type="submit"
            disabled={!inputMsg.trim() || isSending || loadingContext}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );
}
