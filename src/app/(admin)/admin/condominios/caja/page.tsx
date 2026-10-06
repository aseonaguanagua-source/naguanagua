'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2, Search, RefreshCw, AlertTriangle, Wallet, CheckCircle2, X, Printer, ShieldAlert, Power,
  Receipt, Layers, ArrowLeft, FlaskConical,
} from 'lucide-react';
import { SelectorModulo } from '@/components/condominios/SelectorModulo';
import { getCajeroId } from '@/lib/cajaHelpers';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = String(p).split('-'); return `${MESES[parseInt(m) - 1]} ${y}`; };
const rango = (ps: string[]) => !ps?.length ? '' : ps.length === 1 ? fmtPeriodo(ps[0]) : `${fmtPeriodo(ps[0])} – ${fmtPeriodo(ps[ps.length - 1])}`;
const METODOS = [
  ['Transferencia', 'Transferencia'], ['Pago Movil', 'Pago Móvil'], ['Debito', 'Tarjeta de débito'], ['Credito', 'Tarjeta de crédito'],
  ['TMD', 'Punto TMD (Master)'], ['TVD', 'Punto TVD (Visa)'], ['Efectivo', 'Efectivo'],
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
  const [claves, setClaves] = useState<string[]>([]);
  const [meses, setMeses] = useState<number | ''>('');
  const [filtroU, setFiltroU] = useState('');
  const [estadoBase, setEstadoBase] = useState<any>(null);
  // pago
  const [metodo, setMetodo] = useState('Transferencia');
  const [banco, setBanco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [pagador, setPagador] = useState<'condominio' | 'unidad'>('condominio');
  const [cobrando, setCobrando] = useState(false);
  const [recibo, setRecibo] = useState<any>(null);
  const pagoId = useRef<string>('');
  // interruptor
  const [modalInt, setModalInt] = useState(false);
  const [motivoInt, setMotivoInt] = useState('');

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

  const elegir = (cod: string, unidadId?: string) => {
    setCodigo(cod); setRes(null); setQ(''); setClaves(unidadId ? [unidadId] : []); setMeses(''); setEstadoBase(null); setRecibo(null);
    router.replace(`/admin/condominios/caja?codigo=${cod}`);
  };

  // Calcular (cada vez que cambia la selección)
  useEffect(() => {
    if (!codigo) return;
    const h = setTimeout(async () => {
      setCalculando(true); setError('');
      try {
        const r = await fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({ accion: 'calcular', codigo, claves, meses: meses || null }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'No se pudo calcular');
        setCobro(j); setActiva(!!j.cajaActiva);
        if (!estadoBase) setEstadoBase(j.estado);
        pagoId.current = crypto.randomUUID();
      } catch (e: any) { setError(e.message); setCobro(null); } finally { setCalculando(false); }
    }, 250);
    return () => clearTimeout(h);
  }, [codigo, claves, meses]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cobro?.condo;
  const base = estadoBase || cobro?.estado;
  const conDeuda = useMemo(() => (base?.renglones || []).filter((r: any) => r.totalBs > 0.01), [base]);
  const visiblesU = useMemo(() => {
    const t = filtroU.trim().toUpperCase();
    return conDeuda.filter((r: any) => !t || [r.inmueble, r.numero, r.propietario, r.identidad].some((x: any) => String(x || '').toUpperCase().includes(t)));
  }, [conDeuda, filtroU]);
  const mesesMax = base?.totales?.mesesMax || 0;
  const unaUnidad = cobro?.lineas?.length === 1 && cobro.puedeElegirUnidades ? cobro.lineas[0] : null;
  const toggle = (k: string) => setClaves(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k]);

  const cobrar = async () => {
    if (!cobro?.lineas?.length) return;
    if (metodo !== 'Efectivo' && referencia.trim().length < 4) { alert('Escriba la referencia del pago.'); return; }
    if (!confirm(`¿Registrar el cobro de Bs ${fmtBs(cobro.totales.totalBs)} a ${c.nombre}?`)) return;
    setCobrando(true);
    try {
      const u = usuario();
      const r = await fetch('/api/admin/condominios/cobrar', {
        method: 'POST', body: JSON.stringify({
          accion: 'cobrar', codigo, claves, meses: meses || null, usuario: u.usuario,
          pago: {
            pagoId: pagoId.current, metodo, banco, referencia, montoRecibido: cobro.totales.totalBs, cajero: getCajeroId(),
            ...(pagador === 'unidad' && unaUnidad ? { identidadPagador: unaUnidad.identidad, nombrePagador: unaUnidad.propietario } : {}),
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo cobrar');
      setRecibo({ ...j, metodo, banco, referencia, fecha: new Date(), prueba: false });
      setReferencia(''); setClaves([]); setMeses(''); setEstadoBase(null);
    } catch (e: any) { alert(e.message); } finally { setCobrando(false); }
  };

  const verReciboPrueba = () => setRecibo({ cobro, monto: cobro.totales.totalBs, reciboRef: 'PRUEBA (no registrado)', metodo, banco, referencia, fecha: new Date(), prueba: true });

  const cambiarInterruptor = async () => {
    const r = await fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({ accion: 'interruptor', activar: !activa, motivo: motivoInt, usuario: usuario().usuario }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    setActiva(!!j.cajaActiva); setModalInt(false); setMotivoInt('');
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* ══ ENCABEZADO ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-2">
          <SelectorModulo activo="caja" />
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Wallet className="w-7 h-7 text-emerald-600" /> Caja de Condominios</h1>
          <p className="text-xs text-slate-500">Busque el condominio (nombre, código o RIF) o el dueño de una unidad. El monto lo calcula el sistema con la tarifa y la tasa BCV vigentes.</p>
        </div>
        <div className="flex items-center gap-2">
          {activa === null ? null : activa ? (
            <span className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> ACTIVA: registra pagos reales</span>
          ) : (
            <span className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-black flex items-center gap-2"><FlaskConical className="w-4 h-4" /> MODO PRUEBA: solo calcula, no registra</span>
          )}
          {admin && activa !== null && (
            <button id="btn-interruptor-caja-condominios" onClick={() => setModalInt(true)} className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
              <Power className="w-4 h-4" /> {activa ? 'Pasar a prueba' : 'Activar'}
            </button>
          )}
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
              <button key={u.id} onClick={() => elegir(u.condominios.codigo, u.id)} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3 cursor-pointer">
                <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                <div><div className="font-bold text-slate-900 text-sm">{u.propietario || 'Sin propietario'} <span className="font-mono text-xs text-slate-500">{u.identidad}</span></div>
                  <div className="text-[11px] text-slate-500"><span className="font-mono">{u.inmueble}{u.numero ? ` · ${u.numero}` : ''}</span> en {u.condominios.nombre}</div></div>
              </button>
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

      {c && cobro && (
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
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase text-slate-500">Deuda total</div>
                <div className={`text-2xl font-black tabular-nums ${base?.totales?.totalBs > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>{base?.totales?.totalBs > 0.01 ? `Bs ${fmtBs(base.totales.totalBs)}` : 'Al día'}</div>
                <Link href={`/admin/condominios/ficha?codigo=${c.codigo}`} className="text-xs font-bold text-emerald-700 hover:underline">Ver ficha y estado de cuenta →</Link>
              </div>
            </div>

            {cobro.avisos?.map((a: string, i: number) => <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs font-bold">{a}</div>)}

            {conDeuda.length === 0 ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center text-emerald-800 font-bold"><CheckCircle2 className="w-8 h-8 mx-auto mb-2" /> Este condominio está al día.</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                  <div className="font-extrabold text-slate-800 text-sm">
                    {cobro.puedeElegirUnidades ? 'Escoja las unidades que paga' : 'El condominio paga completo'}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600">Meses a pagar</label>
                    <select id="meses-a-pagar" value={meses} onChange={e => setMeses(e.target.value ? Number(e.target.value) : '')} className="py-1.5 px-2 rounded-lg border border-slate-300 text-sm bg-white">
                      <option value="">Todos (ponerse al día)</option>
                      {Array.from({ length: mesesMax }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'mes (el más viejo)' : 'meses más viejos'}</option>)}
                    </select>
                  </div>
                </div>
                {cobro.puedeElegirUnidades && (
                  <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/60">
                    <input value={filtroU} onChange={e => setFiltroU(e.target.value)} placeholder="Filtrar unidad, dueño o cédula…" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-64" />
                    <button onClick={() => setClaves([])} className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer">Todas las unidades ({conDeuda.length})</button>
                    {claves.length > 0 && <span className="text-xs text-slate-600"><b>{claves.length}</b> escogida(s)</span>}
                  </div>
                )}
                <div className="max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0">
                      <tr>{cobro.puedeElegirUnidades && <th className="w-10"></th>}<th className="text-left py-2 px-3">Unidad</th><th className="text-center px-2">Meses</th><th className="text-left px-2">Desde</th><th className="text-right px-4">Deuda</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visiblesU.slice(0, 400).map((r: any) => {
                        const sel = claves.length === 0 || claves.includes(r.clave);
                        return (
                          <tr key={r.clave} onClick={() => cobro.puedeElegirUnidades && toggle(r.clave)} className={`${cobro.puedeElegirUnidades ? 'cursor-pointer hover:bg-emerald-50/50' : ''} ${claves.includes(r.clave) ? 'bg-emerald-50' : ''}`}>
                            {cobro.puedeElegirUnidades && <td className="pl-4"><input type="checkbox" readOnly checked={claves.includes(r.clave)} className="w-4 h-4 accent-emerald-600" /></td>}
                            <td className={`py-2 px-3 ${!sel ? 'opacity-40' : ''}`}>
                              <div className="font-bold text-slate-900 font-mono text-xs">{r.inmueble || (r.clave === '__SIN_REGISTRAR__' ? 'Declaradas sin registrar' : 'Condominio')}{r.numero ? ` · ${r.numero}` : ''}</div>
                              <div className="text-[11px] text-slate-500">{r.propietario || ''}{r.identidad ? ` · ${r.identidad}` : ''}</div>
                            </td>
                            <td className="text-center px-2"><span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-black">{r.deuda.meses}</span></td>
                            <td className="px-2 text-xs text-slate-600">{r.periodos[0] ? fmtPeriodo(r.periodos[0]) : '—'}</td>
                            <td className="px-4 text-right font-bold tabular-nums text-red-700">Bs {fmtBs(r.totalBs)}</td>
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
              <div className="text-4xl font-black tabular-nums">Bs {fmtBs(cobro.totales.totalBs)}</div>
              <div className="text-xs text-white/70">{cobro.lineas.length} renglón(es) · hasta {cobro.totales.meses} mes(es) · tasa BCV Bs {fmtBs(cobro.estado.tasa)}</div>
              <div className="text-xs space-y-1 border-t border-white/10 pt-3">
                <div className="flex justify-between"><span className="text-white/70">Aseo</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.baseBs)}</b></div>
                <div className="flex justify-between"><span className="text-white/70">Multas</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.multaBs)}</b></div>
                {cobro.totales.ivaBs > 0 && <div className="flex justify-between"><span className="text-white/70">IVA 16%</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.ivaBs)}</b></div>}
                {cobro.totales.retencionBs > 0 && <div className="flex justify-between text-violet-300"><span>Retención IVA (75%)</span><b className="tabular-nums">− Bs {fmtBs(cobro.totales.retencionBs)}</b></div>}
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <select id="metodo-pago-condominio" value={metodo} onChange={e => setMetodo(e.target.value)} className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm">
                  {METODOS.map(([k, v]) => <option key={k} value={k} className="text-slate-900">{v}</option>)}
                </select>
                {metodo !== 'Efectivo' && (
                  <>
                    <input id="banco-pago-condominio" value={banco} onChange={e => setBanco(e.target.value)} placeholder="Banco" className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm placeholder:text-white/40" />
                    <input id="referencia-pago-condominio" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Referencia (obligatoria)" className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm placeholder:text-white/40" />
                  </>
                )}
                {unaUnidad && (
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setPagador('condominio')} className={`flex-1 rounded-lg px-2 py-1.5 font-bold border cursor-pointer ${pagador === 'condominio' ? 'bg-white text-slate-900' : 'border-white/20 text-white/70'}`}>Factura al condominio</button>
                    <button onClick={() => setPagador('unidad')} className={`flex-1 rounded-lg px-2 py-1.5 font-bold border cursor-pointer ${pagador === 'unidad' ? 'bg-white text-slate-900' : 'border-white/20 text-white/70'}`}>Factura al dueño</button>
                  </div>
                )}
              </div>

              {activa ? (
                <button id="btn-cobrar-condominio" onClick={cobrar} disabled={cobrando || calculando || !cobro.lineas.length}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  {cobrando ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Cobrar Bs {fmtBs(cobro.totales.totalBs)}
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
            <div className="p-6 text-sm space-y-4" id="recibo-condominio">
              {recibo.prueba && <div className="text-center font-black text-amber-700 border-2 border-amber-400 rounded-lg py-1">PRUEBA — NO ES UN PAGO REGISTRADO</div>}
              <div className="flex justify-between items-start">
                <div><div className="font-black text-lg">Alcaldía de Naguanagua · Aseo Urbano</div><div className="text-xs text-slate-500">Recibo de pago de condominio</div></div>
                <div className="text-right text-xs"><div className="font-mono font-bold">{recibo.reciboRef}</div><div>{recibo.fecha.toLocaleString('es-VE')}</div></div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                <div className="font-bold text-sm">{recibo.cobro.condo.nombre}</div>
                <div className="font-mono">{recibo.cobro.condo.codigo} · {recibo.cobro.condo.identidad}</div>
              </div>
              <table className="w-full text-xs">
                <thead className="border-b border-slate-300"><tr><th className="text-left py-1">Unidad</th><th className="text-left">Períodos</th><th className="text-center">Meses</th><th className="text-right">Monto Bs</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {recibo.cobro.lineas.slice(0, 300).map((l: any) => (
                    <tr key={l.clave}><td className="py-1 font-mono">{l.inmueble || 'Condominio'}{l.numero ? ` · ${l.numero}` : ''}</td><td>{rango(l.periodos)}</td><td className="text-center">{l.meses}</td><td className="text-right tabular-nums">{fmtBs(l.totalBs)}</td></tr>
                  ))}
                </tbody>
              </table>
              {recibo.cobro.lineas.length > 300 && <div className="text-[11px] text-slate-500">… y {recibo.cobro.lineas.length - 300} unidades más.</div>}
              <div className="ml-auto max-w-xs text-xs space-y-0.5">
                <div className="flex justify-between"><span>Aseo</span><span className="tabular-nums">{fmtBs(recibo.cobro.totales.baseBs)}</span></div>
                <div className="flex justify-between"><span>Multas</span><span className="tabular-nums">{fmtBs(recibo.cobro.totales.multaBs)}</span></div>
                {recibo.cobro.totales.ivaBs > 0 && <div className="flex justify-between"><span>IVA 16%</span><span className="tabular-nums">{fmtBs(recibo.cobro.totales.ivaBs)}</span></div>}
                {recibo.cobro.totales.retencionBs > 0 && <div className="flex justify-between"><span>Retención IVA</span><span className="tabular-nums">− {fmtBs(recibo.cobro.totales.retencionBs)}</span></div>}
                <div className="flex justify-between font-black text-base border-t border-slate-300 pt-1"><span>Total</span><span className="tabular-nums">Bs {fmtBs(recibo.monto)}</span></div>
              </div>
              <div className="text-xs text-slate-600">Forma de pago: <b>{recibo.metodo}</b>{recibo.banco ? ` · ${recibo.banco}` : ''}{recibo.referencia ? ` · Ref. ${recibo.referencia}` : ''} · Tasa BCV Bs {fmtBs(recibo.cobro.estado.tasa)}</div>
              {!recibo.prueba && <div className="text-[11px] text-slate-500">La factura electrónica queda lista en Facturación Electrónica.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══ INTERRUPTOR ══ */}
      {modalInt && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="font-black text-lg flex items-center gap-2"><Power className="w-5 h-5" /> {activa ? 'Pasar la Caja de Condominios a modo prueba' : 'Activar la Caja de Condominios'}</div>
            {!activa && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">Al activarla, los cobros quedan <b>registrados de verdad</b>: bajan la deuda en Condominios y en Contribuyentes, y van a Facturación Electrónica.</div>}
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
