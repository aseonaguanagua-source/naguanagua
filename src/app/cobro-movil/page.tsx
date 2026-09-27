'use client';
import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, ChevronLeft, ArrowRight, Landmark, MapPin, User2, Building2, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

type Step = 'search' | 'account' | 'pay' | 'success';
type PayMethod = 'Punto de Venta' | 'Bancamiga';

interface Recibo { referencia: string; emision: string; estado: string; monto: string; identidad?: string; }
interface Inmueble {
  id: string;
  inmueble: string;
  cant_inmuebles?: string | number;
  mmv_mes?: string | number;
  deuda_mmv?: string | number;
  deuda_congelada_bs?: string | number;
  multa_bs?: string | number;
  meses_deuda?: string | number;
  clasificacion?: string;
  direccion?: string;
  actividad_principal?: string;
  agente_retencion?: boolean;
}
interface Contribuyente { Contribuyente: string; Identidad: string; Direccion?: string; Clasificacion?: string; Actividad?: string; EsAgente?: boolean; }

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getFAR = (actividad: string) => {
  const act = (actividad || '').toLowerCase();
  if (act.includes('quinta (a)')) return 0.020366;
  if (act.includes('apartamento (a)')) return 0.023723;
  if (act.includes('quinta (b)')) return 0.016298;
  if (act.includes('apartamento (b)')) return 0.018985;
  if (act.includes('casa (c)')) return 0.014;
  if (act.includes('apartamento (c)')) return 0.028839;
  if (act.includes('casa (d)')) return 0.02673;
  return 0.02673; // default
};

// Fórmula oficial Ordenanza (UCD = tcmmv):
//   Residencial: TR = F.O. × 57 × UCD × FAR
//   Comercial:   TC = F.O. × 57 × UCD × FAC (mmv_mes ya contiene FO × FAC)
const calcMontoMes = (inm: Inmueble, tcmmv: number): number => {
  const mmv = parseFloat(String(inm.mmv_mes || 0));
  const cant = parseFloat(String(inm.cant_inmuebles || 1));
  if (mmv <= 0 || tcmmv <= 0) return 0;
  const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
  
  if (esRes) {
    const far = getFAR(inm.actividad_principal || '');
    return parseFloat((cant * mmv * 57 * far * tcmmv).toFixed(2));
  } else {
    // Para comercial, mmv_mes en BD equivale a (F.O. * FAC). Solo multiplicamos por 57 * UCD
    return parseFloat((cant * mmv * 57 * tcmmv).toFixed(2));
  }
};

export default function KioskPage() {
  const [tcmmv, setTcmmv] = useState<number>(0);
  useEffect(() => {
    fetch('/api/bcv').then(r => r.json()).then(d => { if (d?.tcmmv) setTcmmv(d.tcmmv); }).catch(() => {});
  }, []);

  const [step, setStep] = useState<Step>('search');
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [foundUser, setFoundUser] = useState<Contribuyente | null>(null);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [userInms, setUserInms] = useState<Inmueble[]>([]);
  const [monthsToPay, setMonthsToPay] = useState<number>(1);
  const [totalSel, setTotalSel] = useState(0);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<PayMethod>('Punto de Venta');
  const [referencia, setReferencia] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [payError, setPayError] = useState('');
  const [showBancamigaSim, setShowBancamigaSim] = useState(false);

  const isResidencialGlobal = foundUser?.Clasificacion?.toLowerCase().includes('residencial') ?? true;
  const esAgenteGlobal = foundUser?.EsAgente ?? false;
  // IVA total (16% sobre la deuda)
  const ivaTotalCalculado = isResidencialGlobal ? 0 : (totalSel * 0.16);
  // Retención: si es agente, retiene 75% del IVA (no lo paga al municipio, lo declara por planilla)
  const ivaRetenidoCalculado = esAgenteGlobal ? ivaTotalCalculado * 0.75 : 0;
  // Lo que realmente paga = base + 25% del IVA (o 100% si no es agente)
  const ivaCalculado = ivaTotalCalculado - ivaRetenidoCalculado;
  const pagoTotalCalculado = totalSel + ivaCalculado;

  const getReciboMonto = (r: Recibo): number => {
    if (r.estado === 'Abonado') return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    if (!tcmmv || tcmmv <= 0) return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const inm = userInms.find((i: any) => i.inmueble === inmId);
      if (inm) {
        const meses = Math.max(1, parseInt(String(inm.meses_deuda || 1)));
        const d = parseFloat(String(inm.deuda_mmv || 0));
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        let ucdTotal = 0;
        if (d > 0) {
          if (esRes) ucdTotal = d * getFAR(inm.actividad_principal || '');
          else ucdTotal = d;
        }
        const congelada = parseFloat(String(inm.deuda_congelada_bs || 0));
        const multa = parseFloat(String(inm.multa_bs || 0));
        
        return parseFloat((((ucdTotal * tcmmv) + congelada + multa) / meses).toFixed(2));
      }
      return 0;
    } else if (r.referencia?.startsWith('RECIB-') || r.referencia === 'RECIB-DEUDA') {
      let totalMonto = 0, totalCongelada = 0, totalMulta = 0;
      userInms.forEach(i => { 
        const deuda = parseFloat(String(i.deuda_mmv || 0));
        totalCongelada += parseFloat(String(i.deuda_congelada_bs || 0));
        totalMulta += parseFloat(String(i.multa_bs || 0));
        if (deuda > 0) {
          const esRes = (i.clasificacion || '').toLowerCase().includes('residencial');
          if (esRes) {
            totalMonto += deuda * getFAR(i.actividad_principal || '') * tcmmv;
          } else {
            totalMonto += deuda * tcmmv;
          }
        }
      });
      if (totalMonto > 0 || totalCongelada > 0 || totalMulta > 0) {
        return parseFloat((totalMonto + totalCongelada + totalMulta).toFixed(2));
      }
    }
    if (r.referencia?.startsWith('CM-')) {
      let tInms = userInms.filter(i => i.inmueble && r.referencia.includes(i.inmueble));
      if (tInms.length === 0) tInms = userInms;
      const t = tInms.reduce((s, i) => s + calcMontoMes(i, tcmmv), 0);
      if (t > 0) return parseFloat(t.toFixed(2));
    }
    return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
  };

  useEffect(() => {
    if (recibos.length > 0) {
      const refs = recibos.slice(0, monthsToPay).map(r => r.referencia);
      setSelectedRefs(refs);
      const t = refs.reduce((s, ref) => { const f = recibos.find(r => r.referencia === ref); return s + (f ? getReciboMonto(f) : 0); }, 0);
      setTotalSel(parseFloat(t.toFixed(2)));
    }
  }, [monthsToPay, recibos, userInms, tcmmv]);

  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true); setSearchError('');
    const idLimpio = docNumber.replace(/-/g, '').toUpperCase();
    const fullDoc = docType + idLimpio;
    const fullDocDash = docType + '-' + idLimpio;

    const { data: inmsDB } = await supabase.from('inmuebles')
      .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion')
      .or(`identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`);

    if (!inmsDB || inmsDB.length === 0) { setSearchError('No encontrado. Verifique su Cédula o RIF.'); setIsSearching(false); return; }

    const p = inmsDB[0];
    let nombreCont = p.contribuyente;
    
    // Si no tiene contribuyente en el inmueble, intentar buscar en facturas
    if (!nombreCont) {
      const { data: fNombre } = await supabase.from('facturas')
        .select('contribuyente').eq('identidad', p.identidad)
        .not('contribuyente', 'is', null).limit(1);
      if (fNombre && fNombre.length > 0 && fNombre[0].contribuyente) {
        nombreCont = fNombre[0].contribuyente;
      }
    }

    // Si aún no tiene nombre, buscar en la tabla oficial de contribuyentes
    if (!nombreCont) {
      const { data: cNombre } = await supabase.from('contribuyentes')
        .select('nombre')
        .or(`identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`)
        .not('nombre', 'is', null)
        .limit(1);
      if (cNombre && cNombre.length > 0 && cNombre[0].nombre) {
        nombreCont = cNombre[0].nombre;
      }
    }

    const user: Contribuyente = {
      Identidad: p.identidad,
      Contribuyente: nombreCont || 'Cont. No Registrado',
      Direccion: p.direccion || '',
      Clasificacion: p.clasificacion || 'Residencial',
      Actividad: p.actividad_principal || '',
      EsAgente: (inmsDB as any[]).some(i => i.agente_retencion === true),
    };
    setFoundUser(user);

    let inmsFinal = [...inmsDB];
    const isCondoByFlag = inmsDB.some((i: any) => i.condominio === 'SI' || i.condominio === 'Si' || i.condominio === 'si');
    const isCondoByName = (user.Contribuyente || '').toLowerCase().includes('condominio') || (user.Actividad || '').toLowerCase().includes('condominio');
    const codCont = p.identidad;
    if (isCondoByFlag || isCondoByName) {
      const { data: hijosByPattern } = await supabase
        .from('inmuebles')
        .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion')
        .ilike('clasificacion', `%HIJO_DE:${codCont}%`);
      if (hijosByPattern && hijosByPattern.length > 0) {
        // En naguanagua vieja, usualmente la clasificacion de los hijos tenia HIJO_DE:Cod_Padre
        inmsFinal = [...inmsFinal, ...hijosByPattern];
      } else {
        // También intentar por el inmueble padre (usualmente condominios principales son hijos de SU PROPIO INMUEBLE)
        const padrePrincipal = inmsDB.find((i: any) => i.condominio === 'SI' || i.condominio === 'Si');
        if (padrePrincipal) {
          const { data: hijosById } = await supabase
            .from('inmuebles')
            .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion,condominio,multa_bs,meses_deuda')
            .ilike('clasificacion', `%HIJO_DE:${padrePrincipal.inmueble}%`);
          if (hijosById && hijosById.length > 0) {
            // merge sin duplicados
            const ids = new Set(inmsFinal.map(x => x.id));
            hijosById.forEach(h => {
              if (!ids.has(h.id)) inmsFinal.push(h);
            });
          }
        }
      }
    }
    setUserInms(inmsFinal as Inmueble[]);

    const totalDeudaMMV = inmsFinal.reduce((s: number, i: any) => s + parseFloat(i.deuda_mmv || 0), 0);
    const totalCongelada = inmsDB.reduce((s: number, i: any) => s + parseFloat(i.deuda_congelada_bs || 0), 0);

    const identidadClean = (p.identidad || '').replace(/-/g, '').toUpperCase();
    const { data: allUserFacturas } = await supabase
      .from('facturas').select('referencia, emision, estado, monto, identidad')
      .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
      .or(`identidad.eq.${p.identidad},identidad.eq.${fullDoc},identidad.eq.${identidadClean}`)
      .order('emision', { ascending: true });

    let fallbackFacturas: Recibo[] = [];
    if ((allUserFacturas || []).length === 0 && user.Contribuyente) {
      const { data: fByName } = await supabase.from('facturas')
        .select('referencia, emision, estado, monto, identidad').in('estado', ['Pendiente', 'Por Verificar'])
        .eq('contribuyente', user.Contribuyente).order('emision', { ascending: true });
      if (fByName && fByName.length > 0) fallbackFacturas = fByName as Recibo[];
    }

    const combined = [...(allUserFacturas || []), ...fallbackFacturas] as Recibo[];
    if (combined.length === 0 && (totalDeudaMMV > 0 || totalCongelada > 0)) {
      combined.push({ referencia: 'RECIB-DEUDA', emision: new Date().toISOString(), estado: 'Pendiente', monto: '0' } as Recibo);
    }
    combined.sort((a, b) => {
      const aC = a.referencia?.startsWith('CM-'), bC = b.referencia?.startsWith('CM-');
      if (!aC && bC) return -1; if (aC && !bC) return 1;
      return (a.emision || '').localeCompare(b.emision || '');
    });
    setRecibos(combined);
    setMonthsToPay(combined.length > 0 ? 1 : 0);
    setStep('account');
    setIsSearching(false);
  };

  const processPayment = async (ref: string, method: PayMethod) => {
    setIsProcessing(true); setPayError('');
    try {
      await supabase.from('pagos_reportados').insert({
        identidad: foundUser?.Identidad, monto: pagoTotalCalculado,
        banco: method === 'Bancamiga' ? 'Bancamiga' : 'Punto de Venta',
        referencia: ref || `POS-${Date.now()}`, tipo: method, estado: 'Aprobado',
        detalles: JSON.stringify({ recibos: selectedRefs, origen: 'kiosco' })
      });
      let dinero = totalSel;
      for (const r of selectedRefs) {
        if (r === 'RECIB-DEUDA') { for (const inm of userInms) { await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0 }).eq('id', inm.id); } break; }
        const fac = recibos.find(x => x.referencia === r); if (!fac) continue;
        const mFac = getReciboMonto(fac);
        if (dinero >= mFac) { await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', r); dinero -= mFac; }
        else if (dinero > 0) { await supabase.from('facturas').update({ monto: (mFac - dinero).toFixed(2), estado: 'Abonado' }).eq('referencia', r); dinero = 0; }
      }
      logAudit('Cobro por Kiosco', { identidad: foundUser?.Identidad, contribuyente: foundUser?.Contribuyente, monto: pagoTotalCalculado, metodo: method }, 'COBRO');
      setShowBancamigaSim(false); setStep('success');
    } catch (err: any) { setPayError(err.message || 'Error al procesar el pago.'); }
    setIsProcessing(false);
  };

  const handlePayPos = () => {
    if (!referencia.trim()) { setPayError('Debe ingresar el Nro de Referencia del comprobante del Punto de Venta.'); return; }
    processPayment(referencia, 'Punto de Venta');
  };

  const reset = () => {
    setStep('search'); setDocNumber(''); setRecibos([]); setFoundUser(null);
    setUserInms([]); setSelectedRefs([]); setReferencia(''); setMonthsToPay(1);
    setPayMethod('Punto de Venta'); setPayError(''); setShowBancamigaSim(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white font-sans select-none" style={{ WebkitTapHighlightColor: 'transparent' }}>

      {step === 'search' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full">
            <div className="text-center mb-10">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-5">
                <Building2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h1 className="text-4xl font-black mb-2">Autogestión de Cobro</h1>
              <p className="text-slate-400 text-lg">Consulte y cancele su deuda de Aseo Urbano</p>
            </div>
            <div className="bg-slate-800/80 backdrop-blur rounded-3xl p-8 shadow-2xl border border-slate-700/50">
              <label className="block text-slate-400 text-sm font-bold uppercase tracking-widest mb-3">Cédula o RIF del Contribuyente</label>
              <div className="flex gap-3 mb-6">
                <select value={docType} onChange={e => setDocType(e.target.value)} className="bg-slate-700 text-white rounded-2xl px-4 py-5 text-2xl font-black focus:outline-none focus:ring-2 ring-emerald-500 border border-slate-600">
                  {['V','J','E','G','P'].map(t => <option key={t}>{t}</option>)}
                </select>
                <input type="tel" value={docNumber} onChange={e => setDocNumber(e.target.value.replace(/\D/g,''))}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Ej: 12345678"
                  className="flex-1 bg-slate-700 text-white rounded-2xl px-5 py-5 text-2xl font-bold focus:outline-none focus:ring-2 ring-emerald-500 text-center border border-slate-600 placeholder-slate-500"
                  autoComplete="off" />
              </div>
              {searchError && (
                <div className="mb-5 flex items-center gap-3 text-red-400 bg-red-400/10 rounded-2xl px-5 py-4 border border-red-400/20">
                  <AlertCircle className="w-6 h-6 shrink-0" /><span className="font-bold">{searchError}</span>
                </div>
              )}
              <button onClick={handleSearch} disabled={isSearching || !docNumber.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black py-6 rounded-2xl text-2xl active:scale-95 transition-all flex items-center justify-center gap-3">
                {isSearching ? <><div className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin" />Buscando...</> : 'Consultar Deuda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'account' && foundUser && (
        <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full">
          <button onClick={reset} className="flex items-center gap-2 text-slate-400 font-bold mb-6 hover:text-white w-fit transition-colors">
            <ChevronLeft className="w-6 h-6" />Volver
          </button>
          <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <User2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">{foundUser.Identidad}</div>
                <div className="text-white text-2xl font-black leading-tight mb-2">{foundUser.Contribuyente}</div>
                {foundUser.Clasificacion && (
                  <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${foundUser.Clasificacion.toLowerCase().includes('residencial') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {foundUser.Clasificacion}
                  </span>
                )}
                {foundUser.Actividad && foundUser.Actividad !== 'No aplica' && (
                  <span className="ml-2 inline-block text-xs font-bold px-3 py-1 rounded-full bg-slate-700 text-slate-300">{foundUser.Actividad}</span>
                )}
              </div>
            </div>
            {foundUser.Direccion && (
              <div className="flex items-start gap-2 mt-4 pt-4 border-t border-slate-700 text-slate-400 text-sm">
                <MapPin className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" /><span>{foundUser.Direccion}</span>
              </div>
            )}
          </div>

          {recibos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <CheckCircle2 className="w-28 h-28 text-emerald-500 mb-6 drop-shadow-lg" />
              <h2 className="text-4xl font-black text-white mb-3">¡Estás al día!</h2>
              <p className="text-slate-400 text-xl">No tienes deuda pendiente por pagar.</p>
              <button onClick={reset} className="mt-10 bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-10 rounded-2xl text-lg transition-all">Nueva Consulta</button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="bg-gradient-to-r from-red-900/40 to-orange-900/30 rounded-3xl p-6 border border-red-500/30 text-center">
                <div className="text-red-300 font-bold uppercase text-sm tracking-widest mb-2">
                  Deuda Total — {recibos.length} {recibos.length === 1 ? 'período' : 'períodos'}
                </div>
                <div className="text-5xl font-black text-white">Bs. {fmtBs(recibos.reduce((s,r) => s + getReciboMonto(r), 0))}</div>
              </div>

              {/* DESGLOSE POR INMUEBLE */}
              <div className="space-y-3">
                {Object.entries(
                  recibos.reduce((acc: any, r: any) => {
                    let inmId = 'Facturación General';
                    let tipo = '';
                    let act = '';
                    if (r.referencia?.startsWith('RECIB-HIST-')) {
                      const parts = r.referencia.split('-');
                      if (parts.length > 2) {
                        const match = userInms.find((i: any) => i.inmueble === parts[2]);
                        if (match) { inmId = match.inmueble; tipo = match.clasificacion || ''; act = match.actividad_principal || ''; }
                        else inmId = parts[2];
                      }
                    } else if (r.referencia?.startsWith('CM-')) {
                      const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
                      if (match) { inmId = match.inmueble; tipo = match.clasificacion || ''; act = match.actividad_principal || ''; }
                      else inmId = 'Acumulados';
                    } else {
                      if (userInms.length === 1) { inmId = userInms[0].inmueble; tipo = userInms[0].clasificacion || ''; act = userInms[0].actividad_principal || ''; }
                    }
                    const key = `${inmId}|${tipo}|${act}`;
                    if (!acc[key]) acc[key] = { items: [], id: inmId, tipo, act };
                    acc[key].items.push(r);
                    return acc;
                  }, {})
                ).map(([key, group]: [string, any]) => (
                  <div key={key} className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                    <div className="bg-slate-700/50 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                      <div>
                        <span className="text-emerald-400 font-bold text-sm">{group.id}</span>
                        {group.tipo && <div className="text-xs text-slate-400 mt-0.5">{group.tipo} {group.act && `• ${group.act}`}</div>}
                      </div>
                      <span className="bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1 rounded-full">{group.items.length} meses</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {group.items.map((r: any) => (
                        <div key={r.referencia} className="flex justify-between items-center text-sm">
                          <div>
                            <div className="text-slate-300 font-medium">{r.referencia}</div>
                            <div className="text-slate-500 text-xs mt-0.5">
                              {(() => {
                                const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
                                if (!r.emision) return 'Sin fecha';
                                const p = r.emision.split('-');
                                return p.length >= 2 ? `${M[parseInt(p[1])-1] || p[1]} ${p[0]}` : r.emision;
                              })()}
                            </div>
                          </div>
                          <div className="text-white font-bold">Bs. {fmtBs(getReciboMonto(r))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* RESUMEN DE PAGO */}
              <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">
                <h4 className="font-bold mb-4 text-slate-300 uppercase tracking-widest text-xs">Detalle a Pagar</h4>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-400">Total Deuda ({monthsToPay} {monthsToPay === 1 ? 'mes' : 'meses'})</span>
                  <span className="text-white font-bold text-lg">Bs. {fmtBs(totalSel)}</span>
                </div>
                {!isResidencialGlobal && (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-400">IVA (16%) Total</span>
                      <span className="text-white font-bold">Bs. {fmtBs(ivaTotalCalculado)}</span>
                    </div>
                    {esAgenteGlobal && (
                      <>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-amber-400 text-sm">↳ IVA Retenido (75%) — sube planilla</span>
                          <span className="text-amber-400 font-bold">- Bs. {fmtBs(ivaRetenidoCalculado)}</span>
                        </div>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-slate-400">IVA a Pagar (25%)</span>
                          <span className="text-white font-bold text-lg">Bs. {fmtBs(ivaCalculado)}</span>
                        </div>
                      </>
                    )}
                    {!esAgenteGlobal && (
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-slate-400">IVA (16%)</span>
                        <span className="text-white font-bold text-lg">Bs. {fmtBs(ivaCalculado)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between items-center pt-4 border-t border-slate-700/50">
                  <span className="text-emerald-400 font-black text-xl">Pago Total</span>
                  <span className="text-emerald-400 font-black text-2xl">Bs. {fmtBs(pagoTotalCalculado)}</span>
                </div>
              </div>

              <div>
                <h3 className="font-black text-xl mb-4 text-white">¿Cuántos meses deseas cancelar hoy?</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(Math.min(recibos.length, 6))].map((_, i) => (
                    <button key={i} onClick={() => setMonthsToPay(i+1)}
                      className={`py-5 rounded-2xl font-black text-xl border-2 transition-all active:scale-95 ${monthsToPay===i+1 ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-emerald-500/50'}`}>
                      {i+1} {i===0 ? 'Mes' : 'Meses'}
                    </button>
                  ))}
                  {recibos.length > 6 && (
                    <button onClick={() => setMonthsToPay(recibos.length)}
                      className={`py-5 rounded-2xl font-black text-xl border-2 transition-all col-span-3 active:scale-95 ${monthsToPay===recibos.length ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                      Cancelar Todo ({recibos.length} Meses)
                    </button>
                  )}
                </div>
              </div>
              {/* AVISO AGENTE DE RETENCIÓN */}
              {foundUser?.EsAgente && (
                <div className="flex items-start gap-4 bg-amber-400/20 border-2 border-amber-400 rounded-2xl px-5 py-4">
                  <TriangleAlert className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-amber-300 font-black text-lg leading-tight mb-1">
                      Usted es Agente de Retención
                    </div>
                    <div className="text-amber-200 text-sm leading-relaxed">
                      Recuerde que como Agente de Retención debe <strong>cargar su planilla de retención de IVA</strong> a través del portal web en <em>Soy Contribuyente → Retenciones IVA</em>, indicando el monto retenido correspondiente al <strong>75% del IVA</strong> de esta factura.
                    </div>
                  </div>
                </div>
              )}
              <button onClick={() => setStep('pay')}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-6 rounded-2xl text-2xl mt-2 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20">
                Pagar Bs. {fmtBs(pagoTotalCalculado)} <ArrowRight className="w-7 h-7" />
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'pay' && foundUser && (
        <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full">
          <button onClick={() => setStep('account')} className="flex items-center gap-2 text-slate-400 font-bold mb-6 hover:text-white w-fit transition-colors">
            <ChevronLeft className="w-6 h-6" />Volver
          </button>
          <h2 className="text-3xl font-black text-white mb-1">Método de Pago</h2>
          <p className="text-slate-400 mb-7">
            <strong className="text-white">{foundUser.Contribuyente}</strong> — cancelar{' '}
            <strong className="text-emerald-400 text-xl">Bs. {fmtBs(pagoTotalCalculado)}</strong>{' '}
            ({monthsToPay} {monthsToPay===1?'mes':'meses'})
          </p>
          <div className="grid grid-cols-2 gap-4 mb-7">
            <button onClick={() => setPayMethod('Punto de Venta')}
              className={`flex flex-col items-center gap-4 py-8 rounded-3xl border-2 font-bold transition-all active:scale-95 ${payMethod==='Punto de Venta' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <CreditCard className="w-12 h-12" /><span className="text-xl">Punto de Venta</span>
            </button>
            <button onClick={() => setPayMethod('Bancamiga')}
              className={`flex flex-col items-center gap-4 py-8 rounded-3xl border-2 font-bold transition-all active:scale-95 ${payMethod==='Bancamiga' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <Landmark className="w-12 h-12" /><span className="text-xl">Bancamiga</span>
            </button>
          </div>
          {payMethod === 'Punto de Venta' && (
            <div className="bg-slate-800 rounded-3xl p-7 border border-slate-700">
              <h3 className="text-xl font-black mb-4 text-white text-center">Instrucciones</h3>
              <ol className="list-decimal list-inside text-slate-300 space-y-3 mb-6 text-lg">
                <li>Presente su tarjeta de débito en el Punto de Venta.</li>
                <li>Cancele el monto exacto: <strong className="text-emerald-400">Bs. {fmtBs(pagoTotalCalculado)}</strong>.</li>
                <li>Una vez aprobado, ingrese el Nro. de Referencia del voucher:</li>
              </ol>
              <input type="tel" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Nro. Referencia del Voucher"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-5 py-5 text-2xl text-center text-white font-bold focus:border-emerald-500 outline-none mb-4 tracking-widest" />
              {payError && <p className="text-red-400 text-center font-bold mb-4">{payError}</p>}
              
              {foundUser?.EsAgente && (
                <div className="mb-4 bg-amber-400/10 border border-amber-400/50 rounded-xl p-3 flex gap-3 items-center">
                  <TriangleAlert className="w-6 h-6 text-amber-400 shrink-0" />
                  <p className="text-amber-200 text-sm leading-tight">
                    <strong>Aviso:</strong> Usted es agente de retención. Recuerde de cargar su planilla de retención de IVA (75%) después de pagar.
                  </p>
                </div>
              )}

              <button onClick={handlePayPos} disabled={isProcessing}
                className="w-full bg-emerald-500 text-white font-black py-6 rounded-2xl text-2xl active:scale-95 disabled:bg-slate-700 disabled:text-slate-500">
                {isProcessing ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          )}
          {payMethod === 'Bancamiga' && (
            <div className="bg-slate-800 rounded-3xl p-7 border border-slate-700 text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Landmark className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-black mb-3">Pago con Bancamiga</h3>
              <p className="text-slate-400 mb-6 text-lg">Será dirigido a la pasarela de pagos seguros de Bancamiga para completar el pago con su tarjeta de débito.</p>
              <button onClick={() => setShowBancamigaSim(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-6 rounded-2xl text-2xl active:scale-95 transition-all">
                Ir a Pagar → Bancamiga
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'success' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.12) 0%, transparent 70%)' }}>
          <CheckCircle2 className="w-32 h-32 text-emerald-500 mb-6 drop-shadow-lg" />
          <h1 className="text-5xl font-black text-white mb-3 text-center">¡Pago Exitoso!</h1>
          <p className="text-xl text-emerald-200 text-center mb-8">Su pago ha sido registrado correctamente.</p>
          <div className="bg-slate-800/80 backdrop-blur rounded-3xl p-8 border border-emerald-500/20 w-full max-w-md mb-8">
            <div className="text-center mb-5 pb-5 border-b border-slate-700">
              <div className="text-slate-400 text-sm font-bold uppercase">Contribuyente</div>
              <div className="text-white text-xl font-black mt-1">{foundUser?.Contribuyente}</div>
              <div className="text-emerald-400 text-sm">{foundUser?.Identidad}</div>
            </div>
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
              <span className="text-slate-400 text-lg">Monto Pagado</span>
              <span className="text-white text-2xl font-black">Bs. {fmtBs(pagoTotalCalculado)}</span>
            </div>
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
              <span className="text-slate-400 text-lg">Períodos Saldados</span>
              <span className="text-white text-xl font-bold">{monthsToPay}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-lg">Método</span>
              <span className="text-white text-xl font-bold">{payMethod}</span>
            </div>
          </div>
          <button onClick={reset} className="bg-white text-emerald-900 font-black py-5 px-14 rounded-full text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl">
            Finalizar y Salir
          </button>
        </div>
      )}

      {showBancamigaSim && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-md overflow-hidden">
            <div className="bg-blue-600 p-6 text-center text-white">
              <h2 className="text-2xl font-black tracking-wide">BANCAMIGA</h2>
              <p className="text-blue-200 text-sm">Pasarela de Pago Seguro</p>
            </div>
            <div className="p-8">
              <div className="bg-blue-50 rounded-2xl p-5 text-center mb-6 border border-blue-100">
                <div className="text-sm text-slate-500 font-bold uppercase">Monto a Cobrar</div>
                <div className="text-4xl font-black text-slate-800 mt-1">Bs. {fmtBs(pagoTotalCalculado)}</div>
                <div className="text-slate-500 text-sm mt-1">{foundUser?.Contribuyente}</div>
              </div>
              <p className="text-center text-slate-400 text-sm mb-6">Esta pantalla simula la pasarela oficial de Bancamiga. La integración real requiere credenciales del banco.</p>
              <button onClick={() => processPayment(`BCA-${Math.floor(Math.random()*1000000)}`, 'Bancamiga')} disabled={isProcessing}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xl mb-3 active:scale-95 disabled:bg-slate-300">
                {isProcessing ? 'Procesando...' : 'Simular Pago Exitoso'}
              </button>
              <button onClick={() => setShowBancamigaSim(false)} disabled={isProcessing}
                className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl active:scale-95">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
