'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, CreditCard, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ArrowRight, Landmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

type Step = 'search' | 'account' | 'pay' | 'success';
type PayMethod = 'Punto de Venta' | 'Bancamiga';

interface Recibo { referencia: string; emision: string; estado: string; monto: string; identidad?: string; }
interface Inmueble { inmueble: string; cant_inmuebles?: string | number; mmv_mes?: string | number; }
interface Contribuyente { Contribuyente: string; Identidad: string; }

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function KioskPage() {
  const [tcmmv, setTcmmv] = useState<number>(0);
  
  useEffect(() => {
    // Fetch BCV
    fetch('/api/bcv').then(r => r.json()).then(d => {
      if (d && d.tcmmv) setTcmmv(d.tcmmv);
    }).catch(e => console.error(e));
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

  // Simulated bancamiga state
  const [showBancamigaSim, setShowBancamigaSim] = useState(false);

  const getReciboMonto = (r: Recibo): number => {
    if (r.estado === 'Abonado') return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    if (!tcmmv || tcmmv <= 0) return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    if (r.referencia?.startsWith('CM-')) {
      const matched = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
      if (matched) {
        const cant = parseFloat(String(matched.cant_inmuebles || 1));
        const mmv = parseFloat(String(matched.mmv_mes || 0));
        if (mmv > 0) return parseFloat((cant * mmv * tcmmv).toFixed(2));
      }
      return userInms.reduce((s, i) => {
        const cant = parseFloat(String(i.cant_inmuebles || 1));
        const mmv = parseFloat(String(i.mmv_mes || 0));
        return s + (mmv > 0 ? cant * mmv * tcmmv : 0);
      }, 0);
    }
    return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
  };

  useEffect(() => {
    if (recibos.length > 0) {
      const refs = recibos.slice(0, monthsToPay).map(r => r.referencia);
      setSelectedRefs(refs);
      const t = refs.reduce((s, ref) => {
        const f = recibos.find(r => r.referencia === ref);
        return s + (f ? getReciboMonto(f) : 0);
      }, 0);
      setTotalSel(parseFloat(t.toFixed(2)));
    }
  }, [monthsToPay, recibos, userInms, tcmmv]);

  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true); setSearchError('');

    const idLimpio = docNumber.replace(/-/g, '').toUpperCase();
    const fullDoc = docType + idLimpio;           
    const fullDocDash = docType + '-' + idLimpio; 

    const { data } = await supabase.from('inmuebles').select('*')
      .or(`identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`)
      .limit(1).maybeSingle();
    
    let user: Contribuyente | null = null;
    if (data) {
      user = {
        Identidad: data.identidad,
        Contribuyente: data.contribuyente
      };
    }

    if (!user) { setSearchError('No encontrado. Verifique su documento.'); setIsSearching(false); return; }

    const { data: inmsDB } = await supabase.from('inmuebles').select('*')
      .or(`identidad.eq.${user.Identidad},identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`);
    setFoundUser(user);
    setUserInms((inmsDB || []) as Inmueble[]);

    const identidadClean = (user.Identidad || '').replace(/-/g, '').toUpperCase();
    const { data: allUserFacturas } = await supabase
      .from('facturas')
      .select('referencia, emision, estado, monto, identidad')
      .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
      .or(`identidad.eq.${user.Identidad},identidad.eq.${fullDoc},identidad.eq.${identidadClean}`)
      .order('emision', { ascending: true });

    let fallbackFacturas: Recibo[] = [];
    if ((allUserFacturas || []).length === 0 && user.Contribuyente) {
      const { data: fByName } = await supabase
        .from('facturas')
        .select('referencia, emision, estado, monto, identidad')
        .in('estado', ['Pendiente', 'Por Verificar'])
        .eq('contribuyente', user.Contribuyente)
        .order('emision', { ascending: true });
      if (fByName && fByName.length > 0) fallbackFacturas = fByName as Recibo[];
    }

    const combined = [...(allUserFacturas || []), ...fallbackFacturas] as Recibo[];
    combined.sort((a, b) => {
      const aIsCM = a.referencia?.startsWith('CM-');
      const bIsCM = b.referencia?.startsWith('CM-');
      if (!aIsCM && bIsCM) return -1;
      if (aIsCM && !bIsCM) return 1;
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
        identidad: foundUser?.Identidad, 
        monto: totalSel, 
        banco: method === 'Bancamiga' ? 'Bancamiga' : 'Punto de Venta', 
        referencia: ref || `POS-${Date.now()}`,
        tipo: method, 
        estado: 'Aprobado',
        detalles: JSON.stringify({ recibos: selectedRefs, origen: 'kiosco' })
      });

      let dinero = totalSel;
      for (const r of selectedRefs) {
        const fac = recibos.find(x => x.referencia === r); if (!fac) continue;
        const mFac = getReciboMonto(fac);
        if (dinero >= mFac) { await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', r); dinero -= mFac; }
        else if (dinero > 0) { await supabase.from('facturas').update({ monto: (mFac - dinero).toFixed(2), estado: 'Abonado' }).eq('referencia', r); dinero = 0; }
      }

      logAudit('Cobro por Kiosco', {
        identidad: foundUser?.Identidad,
        monto: totalSel,
        metodo: method,
        meses: selectedRefs.length
      }, 'COBRO');

      setShowBancamigaSim(false);
      setStep('success');
    } catch (err: any) {
      setPayError(err.message);
    }
    setIsProcessing(false);
  };

  const handlePayPos = () => {
    if (!referencia.trim()) {
      setPayError('Debe ingresar el Nro de Referencia del comprobante del Punto de Venta.');
      return;
    }
    processPayment(referencia, 'Punto de Venta');
  };

  const reset = () => {
    setStep('search'); setDocNumber(''); setRecibos([]); setFoundUser(null);
    setSelectedRefs([]); setReferencia(''); setMonthsToPay(1);
    setPayMethod('Punto de Venta'); setPayError(''); setShowBancamigaSim(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-white font-sans select-none" style={{ WebkitTapHighlightColor: 'transparent' }}>
      
      {step === 'search' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-md w-full bg-slate-800 rounded-3xl p-10 shadow-2xl border border-slate-700/50 text-center">
            <h1 className="text-3xl font-black mb-2">Autogestión</h1>
            <p className="text-slate-400 mb-8">Ingrese su documento de identidad para consultar y pagar su deuda.</p>
            
            <div className="flex gap-3 mb-6">
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="bg-slate-700 text-white rounded-2xl px-4 py-5 text-xl font-bold focus:outline-none focus:ring-2 ring-emerald-500">
                {['V','J','E','G','P'].map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="tel" value={docNumber} onChange={e => setDocNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="Número de Cédula/RIF" className="flex-1 bg-slate-700 text-white rounded-2xl px-5 py-5 text-xl font-bold focus:outline-none focus:ring-2 ring-emerald-500 text-center" autoComplete="off" />
            </div>

            {searchError && (
              <div className="mb-6 flex items-center justify-center gap-2 text-red-400 bg-red-400/10 rounded-xl px-4 py-3">
                <AlertCircle className="w-5 h-5 shrink-0" />{searchError}
              </div>
            )}

            <button onClick={handleSearch} disabled={isSearching || !docNumber.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black py-5 rounded-2xl text-xl active:scale-95 transition-all flex items-center justify-center gap-3">
              {isSearching ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" /> : 'Consultar Deuda'}
            </button>
          </div>
        </div>
      )}

      {step === 'account' && foundUser && (
        <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full">
          <button onClick={reset} className="flex items-center gap-2 text-slate-400 font-bold mb-6 hover:text-white w-fit">
            <ChevronLeft className="w-6 h-6" /> Volver
          </button>

          <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 mb-6">
            <div className="text-emerald-400 text-sm font-bold uppercase tracking-widest mb-1">{foundUser.Identidad}</div>
            <div className="text-white text-2xl font-black">{foundUser.Contribuyente}</div>
          </div>

          {recibos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-24 h-24 text-emerald-500 mb-6" />
              <h2 className="text-3xl font-black text-white mb-2">¡Estás al día!</h2>
              <p className="text-slate-400 text-lg">No tienes deuda pendiente por pagar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 text-center">
                <div className="text-slate-400 font-bold uppercase mb-2">Deuda Total ({recibos.length} meses)</div>
                <div className="text-4xl font-black text-white">Bs. {fmtBs(recibos.reduce((s, r) => s + getReciboMonto(r), 0))}</div>
              </div>

              <div>
                <h3 className="font-bold text-lg mb-4">¿Cuántos meses deseas pagar hoy?</h3>
                <div className="grid grid-cols-3 gap-4">
                  {[...Array(Math.min(recibos.length, 6))].map((_, i) => (
                    <button key={i} onClick={() => setMonthsToPay(i + 1)}
                      className={`py-4 rounded-2xl font-black text-xl border-2 transition-all ${monthsToPay === i + 1 ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                      {i + 1} {i === 0 ? 'Mes' : 'Meses'}
                    </button>
                  ))}
                  {recibos.length > 6 && (
                    <button onClick={() => setMonthsToPay(recibos.length)}
                      className={`py-4 rounded-2xl font-black text-xl border-2 transition-all col-span-3 ${monthsToPay === recibos.length ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                      Pagar Todo ({recibos.length} Meses)
                    </button>
                  )}
                </div>
              </div>

              <button onClick={() => setStep('pay')}
                className="w-full bg-emerald-500 text-white font-black py-5 rounded-2xl text-xl mt-4 active:scale-95 flex items-center justify-center gap-3">
                Pagar Bs. {fmtBs(totalSel)} <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'pay' && foundUser && (
        <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full">
           <button onClick={() => setStep('account')} className="flex items-center gap-2 text-slate-400 font-bold mb-6 hover:text-white w-fit">
            <ChevronLeft className="w-6 h-6" /> Volver
          </button>

          <h2 className="text-3xl font-black text-white mb-2">Método de Pago</h2>
          <p className="text-slate-400 mb-8">Vas a pagar <strong className="text-emerald-400">Bs. {fmtBs(totalSel)}</strong> por {monthsToPay} mes(es).</p>

          <div className="grid grid-cols-2 gap-4 mb-8">
             <button onClick={() => setPayMethod('Punto de Venta')}
                className={`flex flex-col items-center gap-4 py-8 rounded-3xl border-2 font-bold transition-all ${payMethod === 'Punto de Venta' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                <CreditCard className="w-12 h-12" />
                <span className="text-xl">Punto de Venta</span>
              </button>
              <button onClick={() => setPayMethod('Bancamiga')}
                className={`flex flex-col items-center gap-4 py-8 rounded-3xl border-2 font-bold transition-all ${payMethod === 'Bancamiga' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                <Landmark className="w-12 h-12" />
                <span className="text-xl">Bancamiga</span>
              </button>
          </div>

          {payMethod === 'Punto de Venta' && (
            <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-xl font-bold mb-4 text-center">Instrucciones</h3>
              <ol className="list-decimal list-inside text-slate-300 space-y-3 mb-6 text-lg">
                <li>Pase su tarjeta por el Punto de Venta.</li>
                <li>Cobre el monto exacto: <strong>Bs. {fmtBs(totalSel)}</strong>.</li>
                <li>Una vez aprobado, ingrese el número de recibo (referencia) abajo:</li>
              </ol>
              <input type="tel" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Nro. Referencia del Voucher" 
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-5 py-4 text-xl text-center text-white font-bold focus:border-emerald-500 outline-none mb-4" />
              {payError && <p className="text-red-400 text-center font-bold mb-4">{payError}</p>}
              <button onClick={handlePayPos} disabled={isProcessing} className="w-full bg-emerald-500 text-white font-black py-5 rounded-2xl text-xl active:scale-95">
                {isProcessing ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          )}

          {payMethod === 'Bancamiga' && (
            <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 text-center animate-in fade-in slide-in-from-bottom-4">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Landmark className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Pago en Línea Bancamiga</h3>
              <p className="text-slate-400 mb-6">Será redirigido a la pasarela de pagos segura de Bancamiga para completar su transacción con tarjeta de débito o crédito.</p>
              <button onClick={() => setShowBancamigaSim(true)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl text-xl active:scale-95">
                Ir a Pagar
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUCCESS SCREEN */}
      {step === 'success' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-emerald-900/40">
           <CheckCircle2 className="w-32 h-32 text-emerald-500 mb-6 drop-shadow-lg" />
           <h1 className="text-5xl font-black text-white mb-4 text-center">¡Pago Exitoso!</h1>
           <p className="text-2xl text-emerald-100 text-center mb-10">Su pago ha sido registrado correctamente.</p>
           
           <div className="bg-slate-900/60 rounded-3xl p-8 border border-emerald-500/30 w-full max-w-md backdrop-blur-md mb-10">
             <div className="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-4">
               <span className="text-slate-400 text-lg">Monto Pagado</span>
               <span className="text-white text-2xl font-black">Bs. {fmtBs(totalSel)}</span>
             </div>
             <div className="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-4">
               <span className="text-slate-400 text-lg">Meses Saldados</span>
               <span className="text-white text-xl font-bold">{monthsToPay}</span>
             </div>
             <div className="flex justify-between items-center">
               <span className="text-slate-400 text-lg">Método</span>
               <span className="text-white text-xl font-bold">{payMethod}</span>
             </div>
           </div>

           <button onClick={reset} className="bg-white text-emerald-900 font-black py-5 px-12 rounded-full text-xl hover:scale-105 active:scale-95 transition-all shadow-xl">
             Finalizar y Salir
           </button>
        </div>
      )}

      {/* BANCAMIGA SIMULATOR MODAL */}
      {showBancamigaSim && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-blue-600 p-6 text-center text-white">
              <h2 className="text-2xl font-black">BANCAMIGA</h2>
              <p className="text-blue-200">Pasarela de Pagos</p>
            </div>
            <div className="p-8">
              <p className="text-center text-slate-500 font-bold mb-6">Esta es una simulación del API. El botón de pago real requiere credenciales del banco.</p>
              <div className="bg-slate-100 rounded-2xl p-4 text-center mb-6">
                <div className="text-sm text-slate-500">Monto a Cobrar</div>
                <div className="text-3xl font-black text-slate-800">Bs. {fmtBs(totalSel)}</div>
              </div>
              <button onClick={() => processPayment(`BCA-${Math.floor(Math.random()*100000)}`, 'Bancamiga')} disabled={isProcessing} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xl mb-4 active:scale-95">
                {isProcessing ? 'Procesando...' : 'Simular Pago Exitoso'}
              </button>
              <button onClick={() => setShowBancamigaSim(false)} disabled={isProcessing} className="w-full bg-slate-200 text-slate-600 font-bold py-4 rounded-2xl active:scale-95">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
