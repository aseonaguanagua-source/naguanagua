'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2, Search, RefreshCw, AlertTriangle, Wallet, CheckCircle2, X, Printer, ShieldAlert, Power,
  Receipt, Layers, ArrowLeft, FlaskConical, Users, UserSearch, FileText, Calendar,
} from 'lucide-react';
import { SelectorModulo } from '@/components/condominios/SelectorModulo';
import { getCajeroId } from '@/lib/cajaHelpers';
import { LISTA_BANCOS } from '@/lib/bancos';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { acreditarSaldoFavor } from '@/lib/saldoFavor';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = String(p).split('-'); return `${MESES[parseInt(m) - 1]} ${y}`; };
const rango = (ps: string[]) => !ps?.length ? '' : ps.length === 1 ? fmtPeriodo(ps[0]) : `${fmtPeriodo(ps[0])} – ${fmtPeriodo(ps[ps.length - 1])}`;
const METODOS = [
  ['Transferencia', 'Transferencia'], ['Debito', 'Tarjeta de débito'], ['Credito', 'Tarjeta de crédito'],
  ['TMD', 'Punto TMD (Master)'], ['TVD', 'Punto TVD (Visa)'], ['Deposito', 'Depósito'], ['Saldo a Favor', 'Saldo a Favor']
] as const;
const MODALIDAD: Record<string, string> = {
  CENTRALIZADO: 'Centralizado: el condominio paga todo', MIXTO_COMERCIAL: 'Mixto comercial',
  INDIVIDUAL: 'Pago individual: cada unidad paga lo suyo', TARIFA_FIJA: 'Tarifa fija',
};

function usuario() { try { return JSON.parse(localStorage.getItem('admin_user_data') || '{}'); } catch { return {}; } }

function Caja() {
  const sp = useSearchParams();
  const router = useRouter();
  const [activa, setActiva] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ condominios: any[]; unidades: any[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [codigo, setCodigo] = useState(sp.get('codigo') || '');
  const [cobro, setCobro] = useState<any>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState('');
  const [claves, setClaves] = useState<string[]>(sp.get('unidad') ? [sp.get('unidad') as string] : []);
  const [meses, setMeses] = useState<number | ''>('');
  const [filtroU, setFiltroU] = useState('');
  const [estadoBase, setEstadoBase] = useState<any>(null);
  // modo de pago: lo escoge el cajero
  const [modo, setModo] = useState<'CONDOMINIO' | 'CONTRIBUYENTE'>(sp.get('cedula') || sp.get('unidad') ? 'CONTRIBUYENTE' : 'CONDOMINIO');
  const [identidad, setIdentidad] = useState(sp.get('cedula') || '');
  const [soloMultas, setSoloMultas] = useState(false);
  const [tasaOverrideStr, setTasaOverrideStr] = useState('');
  const [fechaOverrideStr, setFechaOverrideStr] = useState(new Date().toISOString().slice(0, 10));
  // pago
  const [metodo, setMetodo] = useState('Transferencia');
  const [banco, setBanco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [recibo, setRecibo] = useState<any>(null);
  const pagoId = useRef<string>('');
  // multipago
  const [pagosAgregados, setPagosAgregados] = useState<any[]>([]);
  const [metodoAct, setMetodoAct] = useState('Transferencia');
  const [bancoAct, setBancoAct] = useState('Banco de Venezuela');
  const [bancoDestinoAct, setBancoDestinoAct] = useState('BANCAMIGA - 0172 - 0717');
  const [referenciaAct, setReferenciaAct] = useState('');
  const [montoAct, setMontoAct] = useState('');
  const [comprobanteAct, setComprobanteAct] = useState<File | null>(null);
  const [fechaAct, setFechaAct] = useState(new Date().toISOString().slice(0, 10));
  // interruptor
  const [modalInt, setModalInt] = useState(false);
  const [motivoInt, setMotivoInt] = useState('');

  const sumaPagos = useMemo(() => pagosAgregados.reduce((a, p) => a + p.monto, 0), [pagosAgregados]);
  
  // Saldo a Favor & Notas Crédito
  const [activeTab, setActiveTab] = useState<'Pagos' | 'NotasCredito'>('Pagos');
  const [saldoFavorActivo, setSaldoFavorActivo] = useState(0);
  const [useSaldoFavor, setUseSaldoFavor] = useState(true);
  const [isNotaModalOpen, setIsNotaModalOpen] = useState(false);
  const [notaManualMonto, setNotaManualMonto] = useState('');
  const [notaManualRef, setNotaManualRef] = useState('');
  const [notasCredito, setNotasCredito] = useState<any[]>([]);
  const [isLoadingNotas, setIsLoadingNotas] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Computado de deuda tras aplicar Saldo a Favor
  const totalConImpuestos = cobro?.totales?.totalBs || 0;
  const descuentoSaldoFavor = (metodoAct !== 'Saldo a Favor' && useSaldoFavor) 
    ? Math.min(totalConImpuestos, saldoFavorActivo) 
    : 0;
  const totalNetoAbonable = Math.max(0, totalConImpuestos - descuentoSaldoFavor);
  
  const faltaPagar = useMemo(() => Math.max(0, Math.round((totalNetoAbonable - sumaPagos) * 100) / 100), [totalNetoAbonable, sumaPagos]);

  // Se resetean los pagos si cambia la deuda
  useEffect(() => { setPagosAgregados([]); }, [cobro?.totales?.totalBs, descuentoSaldoFavor]);

  useEffect(() => {
    if (activeTab === 'NotasCredito') fetchNotasCredito();
  }, [activeTab]);

  const fetchNotasCredito = async () => {
    setIsLoadingNotas(true);
    const { data } = await supabase.from('documentos').select('*').eq('tipo', 'Nota de Credito').order('created_at', { ascending: false });
    if (data) setNotasCredito(data);
    setIsLoadingNotas(false);
  };


  useEffect(() => {
    const u = usuario(); setAdmin(u.rol === 'Administrador' || u.usuario === 'dzara');
    fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({ accion: 'estado' }) }).then(r => r.json()).then(j => setActiva(!!j.cajaActiva)).catch(() => setActiva(false));
  }, []);

  // Búsqueda
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setRes(null); return; }
    const h = setTimeout(async () => {
      setBuscando(true);
      try { const r = await fetch(`/api/admin/condominios?buscar=${encodeURIComponent(t)}`); setRes(await r.json()); } finally { setBuscando(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  /** unidad + todos=false → solo ese local; todos=true → todos los locales de ese dueño */
  const elegir = (cod: string, unidad?: any, todos = false) => {
    setCodigo(cod); setRes(null); setQ(''); setClaves([]); setMeses(''); setRecibo(null); setSoloMultas(false);
    if (unidad && todos && unidad.identidad) {
      setModo('CONTRIBUYENTE'); setIdentidad(String(unidad.identidad).toUpperCase());
      router.replace(`/admin/condominios/caja?codigo=${cod}&cedula=${encodeURIComponent(unidad.identidad)}`);
    } else if (unidad) {
      setModo('CONTRIBUYENTE'); setIdentidad(''); setClaves([unidad.id]);
      router.replace(`/admin/condominios/caja?codigo=${cod}&unidad=${unidad.id}`);
    } else {
      setModo('CONDOMINIO'); setIdentidad('');
      router.replace(`/admin/condominios/caja?codigo=${cod}`);
    }
  };
  const cambiarModo = (m: 'CONDOMINIO' | 'CONTRIBUYENTE') => { setModo(m); setClaves([]); setSoloMultas(false); if (m === 'CONDOMINIO') setIdentidad(''); };

  // Calcular (cada vez que cambia la selección)
  useEffect(() => {
    if (!codigo) return;
    const h = setTimeout(async () => {
      setCalculando(true); setError('');
      try {
        let tasaParsed = parseFloat(tasaOverrideStr.replace(/\./g, '').replace(',', '.'));
        if (isNaN(tasaParsed)) tasaParsed = 0;
        const r = await fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({
          accion: 'calcular', codigo, modo, claves, identidad: modo === 'CONTRIBUYENTE' ? identidad.trim() || null : null, meses: meses || null, soloMultas,
          tasaOverride: tasaParsed > 0 ? tasaParsed : undefined,
          fechaOverride: fechaOverrideStr || undefined,
        }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'No se pudo calcular');
        setCobro(j); setActiva(!!j.cajaActiva);
        pagoId.current = crypto.randomUUID();
        
        // Fetch Saldo Favor
        let currId = j.modo === 'CONTRIBUYENTE' ? j.facturas[0]?.identidad : j.condo.identidad;
        if (currId) {
          const { data } = await supabase.from('inmuebles').select('saldo_favor_bs').eq('identidad', currId);
          const totalSF = (data || []).reduce((acc: number, x: any) => acc + (parseFloat(x.saldo_favor_bs) || 0), 0);
          setSaldoFavorActivo(totalSF);
        } else {
          setSaldoFavorActivo(0);
        }
      } catch (e: any) { setError(e.message); setCobro(null); setSaldoFavorActivo(0); } finally { setCalculando(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [codigo, modo, claves, identidad, meses, soloMultas, tasaOverrideStr, fechaOverrideStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cobro?.condo;
  const base = cobro?.estado;
  const porContrib = modo === 'CONTRIBUYENTE';
  const conDeuda = useMemo(() => (base?.renglones || []).filter((r: any) => r.totalBs > 0.01), [base]);
  const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const visiblesU = useMemo(() => {
    const t = filtroU.trim().toUpperCase();
    return conDeuda.filter((r: any) => !t || [r.inmueble, r.numero, r.propietario, r.identidad, r.actividad].some((x: any) => String(x || '').toUpperCase().includes(t)));
  }, [conDeuda, filtroU]);
  const enCobro = useMemo(() => new Set((cobro?.lineas || []).map((l: any) => l.clave)), [cobro]);
  const mapLineas = useMemo(() => new Map<string, any>((cobro?.lineas || []).map((l: any) => [l.clave, l])), [cobro]);
  const multasDe = (r: any) => (r.deuda?.multaBs || 0) + (r.multaExtraBs || 0) + (r.multasManualesBs || 0);
  const mesesMax = base?.totales?.mesesMax || 0;
  const toggle = (k: string) => setClaves(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k]);
  const sinSeleccion = porContrib && !claves.length && !identidad.trim();

  const agregarPago = () => {
    let v = montoAct;
    if (v.includes(',') && v.includes('.')) {
      if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
      else v = v.replace(/,/g, '');
    } else if (v.includes(',')) {
      v = v.replace(',', '.');
    }
    let montoParsed = parseFloat(v);
    if (!montoParsed || montoParsed <= 0) return alert('Monto inválido.');
    if (['Transferencia', 'Deposito'].includes(metodoAct)) {
      if (!bancoAct) return alert('Seleccione banco.');
      if (referenciaAct.trim().length < 4) return alert('La referencia debe tener al menos 4 caracteres.');
      if (metodoAct === 'Transferencia' && !comprobanteAct) return alert('Es obligatorio adjuntar el comprobante para Transferencia.');
    }
    if (montoParsed > faltaPagar + 0.05) return alert('El monto supera la deuda restante.');
    setPagosAgregados([...pagosAgregados, { metodo: metodoAct, banco: bancoAct, bancoDestino: bancoDestinoAct, referencia: referenciaAct, monto: montoParsed, comprobante: comprobanteAct, fecha: fechaAct }]);
    setMetodoAct('Transferencia'); setBancoAct('Banco de Venezuela'); setBancoDestinoAct('BANCAMIGA - 0172 - 0717'); setReferenciaAct(''); setMontoAct(''); setComprobanteAct(null); setFechaAct(new Date().toISOString().slice(0, 10));
  };

  const quitarPago = (idx: number) => {
    setPagosAgregados(pagosAgregados.filter((_, i) => i !== idx));
  };

  const cobrar = async () => {
    if (!cobro?.lineas?.length) return;
    if (Math.abs(faltaPagar) > 0.05) { alert('Aún falta por pagar Bs ' + fmtBs(faltaPagar)); return; }
    
    const nf = cobro.facturas?.length || 1;
    if (!confirm(`¿Registrar el cobro de Bs ${fmtBs(cobro.totales.totalBs)}?\n\nSe emitirán ${nf} factura(s):\n${(cobro.facturas || []).map((f: any) => `• ${f.nombre} (${f.identidad}): Bs ${fmtBs(f.totalBs)}`).join('\n')}`)) return;
    
    setCobrando(true);
    try {
      // Subir comprobantes
      const pagosSubidos = [];
      for (const p of pagosAgregados) {
        let url = '';
        if (p.comprobante) {
          const ext = p.comprobante.name.split('.').pop() || 'jpg';
          const uId = usuario().usuario || 'caja';
          const fileName = `condominios/${codigo}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
          const fd = new FormData();
          fd.append('file', p.comprobante);
          fd.append('bucket', 'comprobantes');
          fd.append('path', fileName);
          const rUp = await fetch('/api/upload', { method: 'POST', body: fd });
          const jUp = await rUp.json();
          if (rUp.ok && jUp.publicUrl) url = jUp.publicUrl;
        }
        pagosSubidos.push({ ...p, comprobante_url: url, comprobante_nombre: p.comprobante?.name });
      }

      let tasaParsed = parseFloat(tasaOverrideStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(tasaParsed)) tasaParsed = 0;

      const u = usuario();
      
      const realPagosSubidos = [];
      if (descuentoSaldoFavor > 0) {
         realPagosSubidos.push({
            metodo: 'Saldo a Favor',
            monto: descuentoSaldoFavor,
            referencia: 'Desc. Saldo Favor',
         });
      }
      realPagosSubidos.push(...pagosSubidos);
      
      const r = await fetch('/api/admin/condominios/cobrar', {
        method: 'POST', body: JSON.stringify({
          accion: 'cobrar', codigo, modo, claves, identidad: porContrib ? identidad.trim() || null : null, meses: meses || null, soloMultas, usuario: u.usuario,
          tasaOverride: tasaParsed > 0 ? tasaParsed : undefined, fechaOverride: fechaOverrideStr || undefined,
          pago: { 
            pagoId: pagoId.current, 
            metodo: realPagosSubidos[0]?.metodo || 'MÚLTIPLE', 
            banco: realPagosSubidos[0]?.banco || '', 
            referencia: realPagosSubidos[0]?.referencia || '', 
            montoRecibido: cobro.totales.totalBs, 
            cajero: getCajeroId(),
            bancoDestino: realPagosSubidos[0]?.bancoDestino || '',
            pagosAgregados: realPagosSubidos
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo cobrar');
      
      // Actualizar Saldo Favor en UI post-cobro
      if (descuentoSaldoFavor > 0 || realPagosSubidos.some(p => p.metodo === 'Saldo a Favor')) {
        setSaldoFavorActivo(Math.max(0, saldoFavorActivo - descuentoSaldoFavor - realPagosSubidos.filter(p=>p.metodo==='Saldo a Favor').reduce((a,b)=>a+b.monto,0)));
      }

      setRecibo({ ...j, partes: j.pagos, metodo: 'MÚLTIPLE', banco: '', referencia: '', fecha: new Date(), prueba: false });
      setReferencia(''); setClaves([]); setMeses(''); setSoloMultas(false); setPagosAgregados([]);
    } catch (e: any) { alert(e.message); } finally { setCobrando(false); }
  };

  const verReciboPrueba = () => setRecibo({
    cobro, monto: cobro.totales.totalBs, metodo, banco, referencia, fecha: new Date(), prueba: true,
    partes: (cobro.facturas || []).map((f: any, i: number) => ({ reciboRef: `PRUEBA-${i + 1}`, identidad: f.identidad, nombre: f.nombre, monto: f.totalBs })),
  });

  const cambiarInterruptor = async () => {
    const r = await fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({ accion: 'interruptor', activar: !activa, motivo: motivoInt, usuario: usuario().usuario }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    setActiva(!!j.cajaActiva); setModalInt(false); setMotivoInt('');
  };

  const handleCrearNotaManual = async () => {
    if (!notaManualMonto || parseFloat(notaManualMonto) <= 0) return alert('Ingrese un monto válido');
    if (!notaManualRef || notaManualRef.trim().length !== 8) return alert('La referencia debe tener exactamente 8 caracteres.');
    if (!cobro) return;

    let targetId = cobro.modo === 'CONTRIBUYENTE' ? cobro.facturas[0]?.identidad : cobro.condo.identidad;
    let targetName = cobro.modo === 'CONTRIBUYENTE' ? cobro.facturas[0]?.nombre : cobro.condo.nombre;

    if (!targetId) return alert('No hay un identificador válido para acreditar el saldo.');

    try {
      await supabase.from('documentos').insert([{
        identidad: targetId,
        contribuyente: targetName,
        tipo: 'Nota de Credito',
        estado: 'Vigente',
        detalles: JSON.stringify({
          monto: formatBs(notaManualMonto),
          origen_referencia: `Manual: ${notaManualRef}`,
          fecha_emision: new Date().toISOString()
        })
      }]);
      const montoNota = parseFloat(notaManualMonto);
      const result = await acreditarSaldoFavor(targetId, montoNota);
      if (!result.ok) console.error('Error acreditando saldo en nota manual:', result.error);
      
      setSaldoFavorActivo(prev => prev + montoNota);
      setSuccessMsg('Nota de crédito manual generada exitosamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      setIsNotaModalOpen(false);
      setNotaManualMonto('');
      setNotaManualRef('');
      if (activeTab === 'NotasCredito') fetchNotasCredito();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* ══ ENCABEZADO ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-2">
          <SelectorModulo activo="caja" />
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Wallet className="w-7 h-7 text-emerald-600" /> Caja de Condominios</h1>
          <p className="text-xs text-slate-500">Busque el condominio (nombre, código o RIF) o el dueño de una unidad. El monto lo calcula el sistema con la tarifa y la tasa Euro vigentes.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            {activa === null ? null : activa ? (
              <span className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> ACTIVA: registra pagos reales</span>
            ) : (
              <span className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-black flex items-center gap-2"><FlaskConical className="w-4 h-4" /> MODO PRUEBA: solo calcula, no registra</span>
            )}
            
            <div className="flex bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200">
              <button onClick={() => setActiveTab('Pagos')} className={`px-4 py-1.5 text-xs font-bold rounded transition ${activeTab === 'Pagos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}>Pagos</button>
              <button onClick={() => setActiveTab('NotasCredito')} className={`px-4 py-1.5 text-xs font-bold rounded transition ${activeTab === 'NotasCredito' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}>Notas de Crédito</button>
            </div>
            
            {admin && activa !== null && (
              <button id="btn-interruptor-caja-condominios" onClick={() => setModalInt(true)} className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                <Power className="w-4 h-4" /> {activa ? 'Pasar a prueba' : 'Activar'}
              </button>
            )}
          </div>
          <div className="bg-[#f0fdf4] border border-[#86efac] rounded-xl p-3 flex flex-col gap-2 shadow-sm min-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#166534] font-bold text-sm">Tasa Euro Aplicada:</span>
              <input type="text" value={tasaOverrideStr} onChange={e => {
                let v = e.target.value.replace(/[^0-9,.]/g, '');
                setTasaOverrideStr(v);
              }} onBlur={e => {
                 let v = e.target.value;
                 if (v.includes(',') && v.includes('.')) {
                   if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
                   else v = v.replace(/,/g, '');
                 } else if (v.includes(',')) {
                   v = v.replace(',', '.');
                 }
                 let p = parseFloat(v);
                 if(!isNaN(p) && p > 0) setTasaOverrideStr(p.toFixed(2).replace('.', ','));
                 else setTasaOverrideStr('');
              }} placeholder="Automática" className="bg-white border border-[#86efac] rounded-lg px-2 py-1.5 text-right font-bold text-[#166534] text-sm w-24 outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#86efac]/50">
              <div className="flex items-center gap-1.5 text-[#166534]">
                <Calendar className="w-4 h-4" />
                <input type="date" value={fechaOverrideStr} onChange={e => setFechaOverrideStr(e.target.value)} className="bg-transparent border-none text-xs font-bold text-[#166534] outline-none cursor-pointer" />
              </div>
              <button onClick={() => {
                if (!codigo) return;
                // Force re-calculation by toggling a dummy state or relying on the useEffect dependency
                setCobro(null); setEstadoBase(null);
              }} className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors">
                Fijar Día
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ BUSCADOR ══ */}
      <div className="relative print:hidden">
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input id="buscar-caja-condominio" value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="Nombre, código (URB…), RIF del condominio, o cédula / nombre del dueño de una unidad…"
          className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-300 bg-white text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        {buscando && <RefreshCw className="w-4 h-4 animate-spin text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />}
        {res && (
          <div className="absolute z-30 mt-2 w-full bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[60vh] overflow-y-auto">
            {res.condominios.length === 0 && res.unidades.length === 0 && <div className="p-4 text-sm text-slate-500">Sin resultados.</div>}
            {res.condominios.length > 0 && <div className="px-4 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Condominios</div>}
            {res.condominios.map((x: any) => (
              <button key={x.codigo} onClick={() => elegir(x.codigo)} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3 cursor-pointer">
                <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div><div className="font-bold text-slate-900 text-sm">{x.nombre}</div><div className="text-[11px] text-slate-500 font-mono">{x.codigo} · {x.identidad} · {x.cant_declarada} unidades</div></div>
              </button>
            ))}
            {res.unidades.length > 0 && <div className="px-4 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Unidades</div>}
            {res.unidades.map((u: any) => (
              <div key={u.id} className="w-full px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3">
                <button onClick={() => elegir(u.condominios.codigo, u)} className="flex-1 text-left flex items-center gap-3 cursor-pointer" title="Cobrar solo este local">
                  <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                  <div><div className="font-bold text-slate-900 text-sm"><span className="font-mono">{u.inmueble}{u.numero ? ` · ${u.numero}` : ''}</span> — {u.propietario || 'Sin propietario'} <span className="font-mono text-xs text-slate-500">{u.identidad}</span></div>
                    <div className="text-[11px] text-slate-500">en {u.condominios.nombre} · <b className="text-sky-700">cobrar solo este local</b></div></div>
                </button>
                {u.identidad && (
                  <button onClick={() => elegir(u.condominios.codigo, u, true)} className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-800 cursor-pointer">
                    Todos los locales de {u.identidad}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800 text-sm flex gap-2 print:hidden"><AlertTriangle className="w-4 h-4 mt-0.5" /> {error}</div>}
      {!codigo && !error && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center text-slate-400 print:hidden">
          <Building2 className="w-10 h-10 mx-auto mb-2" /> Busque un condominio para cobrar.
        </div>
      )}
      {codigo && !cobro && calculando && <div className="py-16 text-center text-slate-500 print:hidden"><RefreshCw className="w-6 h-6 animate-spin inline mr-2" /> Calculando…</div>}

      {c && cobro && activeTab === 'NotasCredito' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Control de Saldos a Favor (Notas de Crédito)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-600 uppercase bg-slate-50 border-b">
                <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cédula / RIF</th><th className="px-4 py-3">Contribuyente</th><th className="px-4 py-3 text-right">Monto (Bs)</th><th className="px-4 py-3 text-center">Ref. Origen</th><th className="px-4 py-3 text-center">Estado</th></tr>
              </thead>
              <tbody>
                {isLoadingNotas ? <tr><td colSpan={6} className="text-center py-4 text-slate-500">Cargando...</td></tr> :
                notasCredito.map(n => {
                  let details: any = {};
                  try { details = JSON.parse(n.detalles); } catch(e){}
                  return (
                    <tr key={n.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3">{new Date(n.created_at).toLocaleDateString()}</td><td className="px-4 py-3 font-medium">{n.identidad}</td><td className="px-4 py-3">{n.contribuyente}</td><td className="px-4 py-3 text-right font-bold text-emerald-600">Bs. {details.monto}</td><td className="px-4 py-3 text-center">{details.origen_referencia}</td><td className="px-4 py-3 text-center"><span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-semibold">{n.estado}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c && cobro && activeTab === 'Pagos' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 print:hidden">
          {/* ══ IZQUIERDA: condominio y selección ══ */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono text-slate-500">{c.codigo} · {c.identidad}</div>
                <div className="text-xl font-black text-slate-900">{c.nombre}</div>
                <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">{MODALIDAD[c.modalidad] || c.modalidad}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">{c.cant_declarada} unidades declaradas</span>
                  {c.agente_retencion && <span className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800">Agente de retención</span>}
                </div>
                {successMsg && <div className="mt-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block">{successMsg}</div>}
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase text-slate-500">Deuda total</div>
                <div className={`text-2xl font-black tabular-nums ${base?.totales?.totalBs > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>{base?.totales?.totalBs > 0.01 ? `Bs ${formatBs(base.totales.totalBs)}` : 'Al día'}</div>
                <Link href={`/admin/condominios/ficha?codigo=${c.codigo}`} className="text-xs font-bold text-emerald-700 hover:underline block mb-2">Ver ficha y estado de cuenta →</Link>
                <button onClick={() => setIsNotaModalOpen(true)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-300 transition-colors">
                  + Agregar Saldo a Favor Manual
                </button>
              </div>
            </div>

            {/* ══ MODO DE PAGO ══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button id="modo-condominio-completo" onClick={() => cambiarModo('CONDOMINIO')}
                className={`text-left rounded-2xl border-2 p-4 cursor-pointer transition ${!porContrib ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="font-black text-slate-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" /> Paga el condominio completo</div>
                <div className="text-xs text-slate-600 mt-1">Una sola factura digital <b>al condominio</b> ({c.identidad}).{cobro.estado?.porActividad ? ' Las multas no van: las paga cada contribuyente.' : ''}</div>
              </button>
              <button id="modo-por-contribuyente" onClick={() => cambiarModo('CONTRIBUYENTE')}
                className={`text-left rounded-2xl border-2 p-4 cursor-pointer transition ${porContrib ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="font-black text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-sky-600" /> Paga por contribuyente / local</div>
                <div className="text-xs text-slate-600 mt-1">Una factura digital <b>a cada dueño</b>. Incluye sus multas.</div>
              </button>
            </div>

            {cobro.avisos?.map((a: string, i: number) => <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs font-bold">{a}</div>)}

            {conDeuda.length === 0 ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center text-emerald-800 font-bold"><CheckCircle2 className="w-8 h-8 mx-auto mb-2" /> Este condominio está al día.</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                  <div className="font-extrabold text-slate-800 text-sm">
                    {porContrib ? 'Escriba la cédula del contribuyente o escoja sus locales' : 'Todo lo que debe el condominio'}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600">Meses a pagar</label>
                    <select id="meses-a-pagar" value={meses} disabled={soloMultas} onChange={e => setMeses(e.target.value ? Number(e.target.value) : '')} className="py-1.5 px-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50">
                      <option value="">Todos (ponerse al día)</option>
                      {Array.from({ length: mesesMax }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'mes (el más viejo)' : 'meses más viejos'}</option>)}
                    </select>
                  </div>
                </div>
                {porContrib && (
                  <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-sky-50/50">
                    <div className="relative">
                      <UserSearch className="w-4 h-4 text-sky-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input id="cedula-contribuyente-condominio" value={identidad} onChange={e => { setIdentidad(e.target.value.toUpperCase()); setClaves([]); }} placeholder="Cédula / RIF del contribuyente"
                        className="pl-8 pr-3 py-1.5 rounded-lg border border-sky-300 text-sm w-60 font-mono bg-white" />
                    </div>
                    <input value={filtroU} onChange={e => setFiltroU(e.target.value)} placeholder="Filtrar local, dueño o actividad…" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-56" />
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input id="solo-multas-condominio" type="checkbox" checked={soloMultas} onChange={e => setSoloMultas(e.target.checked)} className="w-4 h-4 accent-red-600" /> Solo multas
                    </label>
                    {(claves.length > 0 || identidad) && <button onClick={() => { setClaves([]); setIdentidad(''); }} className="text-xs font-bold text-slate-500 hover:underline cursor-pointer">Limpiar</button>}
                  </div>
                )}
                <div className="max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0">
                      <tr>{porContrib && <th className="w-10"></th>}<th className="text-left py-2 px-3">Local / unidad</th><th className="text-center px-2">Meses</th><th className="text-left px-2">Desde</th><th className="text-right px-2">Multas</th><th className="text-right px-4">Deuda</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visiblesU.slice(0, 400).map((r: any) => {
                        const va = enCobro.has(r.clave);
                        const lc = mapLineas.get(r.clave) as any;
                        const mismoDueno = identidad && normId(r.identidad) === normId(identidad);
                        const dMeses = lc ? lc.meses : r.deuda.meses;
                        const dMultas = lc ? (lc.multaBs + lc.multasAparteBs) : multasDe(r);
                        const dTotal = lc ? lc.totalBs : r.totalBs;
                        return (
                          <tr key={r.clave} onClick={() => porContrib && toggle(r.clave)} className={`${porContrib ? 'cursor-pointer hover:bg-sky-50/60' : ''} ${va && porContrib ? 'bg-sky-50' : ''}`}>
                            {porContrib && <td className="pl-4"><input type="checkbox" readOnly checked={claves.includes(r.clave) || !!mismoDueno} className="w-4 h-4 accent-sky-600" /></td>}
                            <td className={`py-2 px-3 ${porContrib && !va ? 'opacity-50' : ''}`}>
                              <div className="font-bold text-slate-900 font-mono text-xs">{r.inmueble || (r.clave === '__SIN_REGISTRAR__' ? 'Declaradas sin registrar' : 'Condominio')}{r.numero ? ` · ${r.numero}` : ''}</div>
                              <div className="text-[11px] text-slate-500">{r.propietario || ''}{r.identidad ? ` · ${r.identidad}` : ''}</div>
                              {r.actividad && <div className="text-[10px] text-violet-700 font-bold truncate max-w-[340px]">{r.actividad}</div>}
                              {r.multasManuales?.map((m: any) => <div key={m.id} className="text-[10px] text-red-700">• Multa: {m.concepto} (Bs {fmtBs(m.montoBs)})</div>)}
                            </td>
                            <td className="text-center px-2">{dMeses > 0 ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-black">{dMeses}</span> : '—'}</td>
                            <td className="px-2 text-xs text-slate-600">{lc && lc.periodos[0] ? fmtPeriodo(lc.periodos[0]) : (r.periodos[0] ? fmtPeriodo(r.periodos[0]) : '—')}</td>
                            <td className="px-2 text-right text-xs tabular-nums text-red-600">{dMultas > 0 ? fmtBs(dMultas) : '—'}</td>
                            <td className="px-4 text-right font-bold tabular-nums text-red-700">Bs {fmtBs(dTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {visiblesU.length > 400 && <div className="px-4 py-2 text-xs text-slate-500">Mostrando 400 de {visiblesU.length}. Use el filtro.</div>}
                </div>
              </div>
            )}
          </div>

          {/* ══ DERECHA: resumen y pago ══ */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-2"><Receipt className="w-4 h-4" /> A cobrar</div>
                {calculando && <RefreshCw className="w-4 h-4 animate-spin text-white/60" />}
              </div>
              <div className="text-4xl font-black tabular-nums">Bs {formatBs(totalConImpuestos)}</div>
              
              {saldoFavorActivo > 0 && (
                <div className="bg-emerald-500/20 border border-emerald-400/50 p-2 rounded-lg flex justify-between items-center mt-2">
                  <div className="flex flex-col">
                    <span className="text-emerald-300 font-bold text-[10px] uppercase tracking-wider">Saldo a Favor Disp.</span>
                    <span className="text-emerald-100 font-mono font-bold text-sm">Bs. {formatBs(saldoFavorActivo)}</span>
                  </div>
                  <label className="text-[10px] flex items-center gap-1 text-emerald-200 cursor-pointer font-bold bg-emerald-900/40 px-2 py-1 rounded">
                    <input type="checkbox" checked={useSaldoFavor} onChange={e => setUseSaldoFavor(e.target.checked)} className="accent-emerald-500" />
                    Aplicar Abono
                  </label>
                </div>
              )}
              {descuentoSaldoFavor > 0 && (
                <div className="flex justify-between items-center text-emerald-300 font-medium text-sm pt-2">
                  <span>Saldo a Favor Aplicado:</span>
                  <span className="font-mono font-bold">- Bs. {formatBs(descuentoSaldoFavor)}</span>
                </div>
              )}
              {descuentoSaldoFavor > 0 && (
                <div className="flex justify-between items-center text-white font-black text-xl pt-2 border-t border-white/20 mt-2">
                  <span>NETO A PAGAR:</span>
                  <span className="font-mono">Bs. {formatBs(totalNetoAbonable)}</span>
                </div>
              )}
              
              <div className="text-xs text-white/70">{cobro.lineas.length} renglón(es) · hasta {cobro.totales.meses} mes(es) · tasa Euro Bs {formatBs(cobro.estado.tasa)}</div>
              <div className="text-xs space-y-1 border-t border-white/10 pt-3">
                <div className="flex justify-between"><span className="text-white/70">Aseo</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.baseBs)}</b></div>
                <div className="flex justify-between"><span className="text-white/70">Multas</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.multaBs)}</b></div>
                {cobro.totales.ivaBs > 0 && <div className="flex justify-between"><span className="text-white/70">IVA 16%</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.ivaBs)}</b></div>}
                {cobro.totales.retencionBs > 0 && <div className="flex justify-between text-violet-300"><span>Retención IVA (75%)</span><b className="tabular-nums">− Bs {fmtBs(cobro.totales.retencionBs)}</b></div>}
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Método de pago (Abonos)</div>
                {pagosAgregados.map((p, i) => (
                  <div key={i} className="flex justify-between items-center bg-white/5 rounded-lg px-2.5 py-1.5 text-xs border border-white/10">
                    <div>
                      <div className="font-bold">{p.metodo} {p.banco ? `- ${p.banco}` : ''}</div>
                      {p.bancoDestino && ['Transferencia', 'Deposito'].includes(p.metodo) && <div className="text-[10px] text-sky-200">A: {p.bancoDestino}</div>}
                      <div className="text-white/60 font-mono">Ref: {p.referencia || 'N/A'} · {p.fecha?.split('-').reverse().join('/') || ''} {p.comprobante ? '📎' : ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-bold tabular-nums text-emerald-400">Bs {fmtBs(p.monto)}</div>
                      <button onClick={() => quitarPago(i)} className="text-red-400 hover:text-red-300 cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                
                {faltaPagar > 0.05 && (
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2 mt-2">
                    <div className="flex gap-2">
                      <select value={metodoAct} onChange={e => setMetodoAct(e.target.value)} className="flex-1 rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white">
                        {METODOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    <div className="flex bg-slate-800 rounded-lg p-1">
                      <input type="text" placeholder="Monto Bs" value={montoAct} onChange={e => {
                        let v = e.target.value.replace(/[^0-9,.]/g, ''); // permitir coma y punto
                        setMontoAct(v);
                      }} onBlur={e => {
                         let v = e.target.value;
                         if (v.includes(',') && v.includes('.')) {
                           if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
                           else v = v.replace(/,/g, '');
                         } else if (v.includes(',')) {
                           v = v.replace(',', '.');
                         }
                         let p = parseFloat(v);
                         if(!isNaN(p)) setMontoAct(p.toFixed(2).replace('.', ','));
                      }} className="w-full bg-transparent outline-none text-right font-mono text-white placeholder:text-white/40 text-xs px-2" />
                      <button onClick={() => {
                        let rest = faltaPagar;
                        if (rest > 0) setMontoAct(rest.toFixed(2).replace('.', ','));
                      }} className="px-2 border-l border-white/10 text-xs font-bold text-sky-400 hover:text-sky-300">TODO</button>
                    </div>
                    </div>
                    <>
                      {['Transferencia', 'Deposito'].includes(metodoAct) && (
                        <div className="mb-2">
                          <span className="text-[10px] font-semibold text-white/60 mb-0.5 block">Cuenta Bancaria Receptora (Alcaldía / IAMEC)</span>
                          <select value={bancoDestinoAct} onChange={e => setBancoDestinoAct(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-sky-400/50 px-2 py-1.5 text-xs outline-none text-white font-semibold">
                            <option value="BANCAMIGA - 0172 - 0717">Bancamiga (0172) - 01720110711101340717 (IAMEC BANCAMIGA)</option>
                            <option value="BANESCO - 0134 - 8636">Banesco (0134) - 01341089590001008636 (IAMEC)</option>
                            <option value="BANCO DE VENEZUELA - 0102">Banco de Venezuela (0102)</option>
                            <option value="BANCO MERCANTIL - 0105">Banco Mercantil (0105)</option>
                            <option value="BANCO PROVINCIAL - 0108">Banco Provincial (0108)</option>
                          </select>
                        </div>
                      )}
                      <select value={bancoAct} onChange={e => setBancoAct(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white">
                        <option value="">Seleccione banco</option>
                        {LISTA_BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Referencia / Comprobante" value={referenciaAct} onChange={e => setReferenciaAct(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none font-mono text-white placeholder:text-white/40" />
                        <input type="date" value={fechaAct} onChange={e => setFechaAct(e.target.value)} className="w-32 rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white [color-scheme:dark]" />
                      </div>
                      <label className="block w-full text-center py-1.5 border border-dashed border-white/30 rounded-lg text-xs text-white/70 hover:bg-white/10 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap px-2">
                        {comprobanteAct ? comprobanteAct.name : (metodoAct === 'Transferencia' ? 'Subir comprobante (Obligatorio)' : 'Subir comprobante')}
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => setComprobanteAct(e.target.files?.[0] || null)} />
                      </label>
                    </>
                    <button onClick={agregarPago} className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"><Layers className="w-3 h-3" /> Añadir Abono</button>
                  </div>
                )}
              </div>

              {/* Facturas digitales que se van a emitir */}
              {cobro.facturas?.length > 0 && (
                <div className="border-t border-white/10 pt-3 space-y-1.5">
                  <div className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-2"><FileText className="w-4 h-4" /> Factura(s) digital(es): {cobro.facturas.length}</div>
                  {cobro.facturas.slice(0, 8).map((f: any, i: number) => (
                    <div key={i} className="flex justify-between gap-2 text-xs bg-white/5 rounded-lg px-2.5 py-1.5">
                      <div className="min-w-0"><div className="font-bold truncate">{f.nombre}</div><div className="font-mono text-white/60">{f.identidad} · {f.lineas.length} renglón(es)</div></div>
                      <b className="tabular-nums shrink-0">Bs {fmtBs(f.totalBs)}</b>
                    </div>
                  ))}
                  {cobro.facturas.length > 8 && <div className="text-[11px] text-white/60">… y {cobro.facturas.length - 8} más.</div>}
                </div>
              )}
              {sinSeleccion && <div className="rounded-xl bg-sky-400/15 border border-sky-300/40 text-sky-100 text-xs p-2.5">Escriba la cédula del contribuyente o marque sus locales.</div>}

              {activa ? (
                <button id="btn-cobrar-condominio" onClick={cobrar} disabled={cobrando || calculando || !cobro.lineas.length || faltaPagar > 0.05}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  {cobrando ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} {faltaPagar > 0.05 ? `Falta Bs ${fmtBs(faltaPagar)}` : `Registrar Cobro`}
                </button>
              ) : (
                <>
                  <div className="rounded-xl bg-amber-400/15 border border-amber-300/40 text-amber-200 text-xs p-2.5 flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0" /> Modo prueba: puede revisar el cálculo y el recibo, pero no se registra ningún pago.</div>
                  <button id="btn-recibo-prueba" onClick={verReciboPrueba} disabled={!cobro.lineas.length} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    <Printer className="w-4 h-4" /> Ver recibo de prueba
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ RECIBO ══ */}
      {recibo && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto print:shadow-none print:max-h-none print:rounded-none">
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 print:hidden">
              <div className="font-extrabold flex items-center gap-2">{recibo.prueba ? <FlaskConical className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />} {recibo.prueba ? 'Recibo de prueba' : 'Pago registrado'}</div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Printer className="w-4 h-4" /> Imprimir</button>
                <button onClick={() => setRecibo(null)} className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 text-sm space-y-6" id="recibo-condominio">
              {(recibo.partes?.length ? recibo.partes : [{ reciboRef: recibo.reciboRef, identidad: recibo.cobro.condo.identidad, nombre: recibo.cobro.condo.nombre, monto: recibo.monto }]).map((p: any, i: number) => {
                const f = recibo.cobro.facturas?.[i];
                const ls = f ? recibo.cobro.lineas.filter((l: any) => f.lineas.includes(l.clave)) : recibo.cobro.lineas;
                const tt = (k: string) => ls.reduce((a: number, l: any) => a + (Number(l[k]) || 0), 0);
                const n = recibo.partes?.length || 1;
                return (
                  <div key={i} className={`space-y-3 ${i > 0 ? 'pt-6 border-t-2 border-dashed border-slate-300 print:break-before-page' : ''}`}>
                    {recibo.prueba && <div className="text-center font-black text-amber-700 border-2 border-amber-400 rounded-lg py-1">PRUEBA — NO ES UN PAGO REGISTRADO</div>}
                    <div className="flex justify-between items-start">
                      <div><div className="font-black text-lg">Alcaldía de Naguanagua · Aseo Urbano</div><div className="text-xs text-slate-500">Recibo de pago · {recibo.cobro.condo.nombre}{n > 1 ? ` · parte ${i + 1} de ${n}` : ''}</div></div>
                      <div className="text-right text-xs"><div className="font-mono font-bold">{p.reciboRef}</div><div>{recibo.fecha.toLocaleString('es-VE')}</div></div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Factura a nombre de</div>
                      <div className="font-bold text-sm">{p.nombre}</div>
                      <div className="font-mono">{p.identidad}{recibo.cobro.modo === 'CONTRIBUYENTE' ? ` · en ${recibo.cobro.condo.codigo}` : ` · ${recibo.cobro.condo.codigo}`}</div>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="border-b border-slate-300"><tr><th className="text-left py-1">Local / unidad</th><th className="text-left">Períodos</th><th className="text-center">Meses</th><th className="text-right">Monto Bs</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {ls.slice(0, 300).map((l: any) => (
                          <tr key={l.clave}><td className="py-1 font-mono">{l.inmueble || 'Condominio'}{l.numero ? ` · ${l.numero}` : ''}{l.actividad ? <div className="font-sans text-[10px] text-slate-500">{l.actividad}</div> : null}</td><td>{rango(l.periodos)}{l.multasAparteBs > 0 ? <div className="text-[10px] text-red-700">+ multas Bs {fmtBs(l.multasAparteBs)}</div> : null}</td><td className="text-center">{l.meses}</td><td className="text-right tabular-nums">{fmtBs(l.totalBs)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {ls.length > 300 && <div className="text-[11px] text-slate-500">… y {ls.length - 300} unidades más.</div>}
                    <div className="ml-auto max-w-xs text-xs space-y-0.5">
                      <div className="flex justify-between"><span>Aseo</span><span className="tabular-nums">{fmtBs(tt('baseBs'))}</span></div>
                      <div className="flex justify-between"><span>Multas</span><span className="tabular-nums">{fmtBs(tt('multaBs') + tt('multasAparteBs'))}</span></div>
                      {tt('ivaBs') > 0 && <div className="flex justify-between"><span>IVA 16%</span><span className="tabular-nums">{fmtBs(tt('ivaBs'))}</span></div>}
                      {tt('retencionBs') > 0 && <div className="flex justify-between"><span>Retención IVA</span><span className="tabular-nums">− {fmtBs(tt('retencionBs'))}</span></div>}
                      <div className="flex justify-between font-black text-base border-t border-slate-300 pt-1"><span>Total</span><span className="tabular-nums">Bs {fmtBs(p.monto)}</span></div>
                    </div>
                  </div>
                );
              })}
              {(recibo.partes?.length || 0) > 1 && <div className="rounded-lg bg-sky-50 border border-sky-200 p-2.5 text-xs text-sky-900">Un solo pago de <b>Bs {fmtBs(recibo.monto)}</b> repartido en {recibo.partes.length} facturas (una por dueño).</div>}
              <div className="text-xs text-slate-600">Forma de pago: <b>{recibo.metodo}</b>{recibo.banco ? ` · ${recibo.banco}` : ''}{recibo.referencia ? ` · Ref. ${recibo.referencia}` : ''} · Tasa Euro Bs {fmtBs(recibo.cobro.estado.tasa)}</div>
              {!recibo.prueba && <div className="text-[11px] text-slate-500">Las facturas digitales quedan listas en Facturación Electrónica.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══ INTERRUPTOR ══ */}
      {isNotaModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
              <h3 className="font-bold text-slate-800">Generar Nota de Crédito Manual</h3>
              <button onClick={() => setIsNotaModalOpen(false)} className="text-slate-500 hover:text-slate-700 font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monto (Bs)</label>
                <input type="number" step="0.01" value={notaManualMonto} onChange={e => setNotaManualMonto(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ej. 1000.00" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Referencia Origen (8 caracteres)</label>
                <input type="text" maxLength={8} value={notaManualRef} onChange={e => setNotaManualRef(e.target.value.slice(0, 8))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ej. 12345678" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end gap-3">
              <button onClick={() => setIsNotaModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded">Cancelar</button>
              <button onClick={handleCrearNotaManual} className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm">Generar Nota</button>
            </div>
          </div>
        </div>
      )}

      {modalInt && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="font-black text-lg flex items-center gap-2"><Power className="w-5 h-5" /> {activa ? 'Pasar la Caja de Condominios a modo prueba' : 'Activar la Caja de Condominios'}</div>
            {!activa && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">Al activarla, los cobros quedan <b>registrados de verdad</b>: bajan la deuda en Condominios y van a Facturación Electrónica.</div>}
            <input value={motivoInt} onChange={e => setMotivoInt(e.target.value)} placeholder="Motivo (queda en Auditoría)" className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalInt(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Cancelar</button>
              <button onClick={cambiarInterruptor} className={`px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer ${activa ? 'bg-amber-600' : 'bg-emerald-600'}`}>{activa ? 'Pasar a prueba' : 'Activar'}</button>
            </div>
          </div>
        </div>
      )}
      <Link href="/admin/condominios" className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-900 print:hidden"><ArrowLeft className="w-4 h-4" /> Lista de condominios</Link>
    </div>
  );
}

export default function CajaCondominiosPage() {
  return <Suspense fallback={<div className="p-6 text-slate-500">Cargando…</div>}><Caja /></Suspense>;
}
