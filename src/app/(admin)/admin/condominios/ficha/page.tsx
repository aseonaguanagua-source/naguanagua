'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Building2, RefreshCw, AlertTriangle, Wallet, CalendarClock, Layers, Settings, Search,
  ChevronDown, ChevronRight, Save, X, History, Users, Download, Building, Wallet as WalletIcon, Plus, Pencil,
} from 'lucide-react';
import EditorUnidad from './EditorUnidad';
import { mesesPendientes } from '@/lib/condominios/motor';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = p.split('-'); return `${MESES[parseInt(m) - 1]} ${y}`; };
const MODALIDAD: Record<string, string> = {
  CENTRALIZADO: 'Centralizado: el condominio paga todo',
  MIXTO_COMERCIAL: 'Mixto comercial: el condominio paga el aseo; cada local su multa',
  INDIVIDUAL: 'Pago individual: cada unidad paga su aseo y su multa',
  TARIFA_FIJA: 'Tarifa fija acordada',
};
const POR_PAGINA = 100;

function esAdmin() {
  try { const u = JSON.parse(localStorage.getItem('admin_user_data') || '{}'); return u.rol === 'Administrador' || u.usuario === 'dzara'; } catch { return false; }
}
function usuarioActual() {
  try { return JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || ''; } catch { return ''; }
}

function Ficha() {
  const sp = useSearchParams();
  const codigo = sp.get('codigo') || '';
  const unidadFoco = sp.get('unidad') || '';
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'deuda' | 'unidades' | 'movimientos'>('deuda');
  const [q, setQ] = useState(unidadFoco);
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [torresAbiertas, setTorresAbiertas] = useState<Set<string>>(new Set());

  // Edición de opciones
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<any>({});
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Editor de unidad: undefined = cerrado, null = unidad nueva, objeto = editar
  const [editorU, setEditorU] = useState<any | null | undefined>(undefined);

  const cargar = async () => {
    setCargando(true); setError('');
    try {
      const r = await fetch(`/api/admin/condominios?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar');
      setD(j);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  };
  useEffect(() => { setAdmin(esAdmin()); if (codigo) cargar(); }, [codigo]);
  useEffect(() => { setPagina(0); }, [q, soloDeuda]);

  const c = d?.condo;
  const e = d?.estado;
  const unidadDe = (clave: string) => (d?.unidades || []).find((u: any) => u.id === clave) || null;
  // Al llegar desde la búsqueda con ?unidad=…, se abre su editor una sola vez (administrador)
  const [focoAbierto, setFocoAbierto] = useState(false);
  useEffect(() => {
    if (focoAbierto || !admin || !unidadFoco || !d?.unidades) return;
    const u = d.unidades.find((x: any) => x.inmueble === unidadFoco || x.numero === unidadFoco);
    if (u) { setEditorU(u); setFocoAbierto(true); }
  }, [d, admin, unidadFoco, focoAbierto]);

  const renglones = useMemo(() => {
    if (!e) return [];
    const t = q.trim().toUpperCase();
    return e.renglones.filter((r: any) =>
      (!soloDeuda || r.totalBs > 0.01) &&
      (!t || [r.inmueble, r.numero, r.propietario, r.identidad].some((x: any) => String(x || '').toUpperCase().includes(t))));
  }, [e, q, soloDeuda]);
  const paginas = Math.max(1, Math.ceil(renglones.length / POR_PAGINA));
  const visibles = renglones.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // Árbol torre → unidad
  const arbol = useMemo(() => {
    const us: any[] = d?.unidades || [];
    const hijos = new Map<string, any[]>();
    us.forEach(u => { if (u.padre_unidad_id) { if (!hijos.has(u.padre_unidad_id)) hijos.set(u.padre_unidad_id, []); hijos.get(u.padre_unidad_id)!.push(u); } });
    const ids = new Set(us.map(u => u.id));
    const raiz = us.filter(u => !u.padre_unidad_id || !ids.has(u.padre_unidad_id))
      .sort((a, b) => Number(!!(hijos.get(b.id)?.length)) - Number(!!(hijos.get(a.id)?.length)) || String(a.inmueble).localeCompare(String(b.inmueble)));
    return { raiz, hijos, torres: us.filter(u => hijos.get(u.id)?.length).length };
  }, [d]);

  const abrirEdicion = () => {
    setForm({
      modalidad: c.modalidad, cant_declarada: c.cant_declarada, tarifa_mmv: c.tarifa_mmv ?? '', actividad: c.actividad || '',
      agente_retencion: !!c.agente_retencion, permite_pago_por_unidad: !!c.permite_pago_por_unidad,
      permite_abonos: c.permite_abonos !== false, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad,
      correo: c.correo || '', telefono: c.telefono || '', notas: c.notas || '',
      tipo: c.tipo, nombre: c.nombre || '', identidad: c.identidad || '',
      meses: mesesPendientes(c.aseo_pendiente_desde), multa_meses: c.multa_meses || 0,
    });
    setMotivo(''); setEditando(true);
  };
  const guardar = async () => {
    const cambios: any = {};
    Object.keys(form).forEach(k => {
      const antes = k === 'meses' ? mesesPendientes(c.aseo_pendiente_desde) : (c[k] ?? (typeof form[k] === 'boolean' ? false : ''));
      if (String(form[k]) !== String(antes)) cambios[k] = form[k];
    });
    if (!Object.keys(cambios).length) { setEditando(false); return; }
    if (motivo.trim().length < 5) { alert('Escriba el motivo del cambio.'); return; }
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: c.codigo, cambios, motivo, usuario: usuarioActual() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar');
      setEditando(false); await cargar();
    } catch (err: any) { alert(err.message); } finally { setGuardando(false); }
  };

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(e.renglones.map((r: any) => ({
      Unidad: r.inmueble || (r.clave === '__SIN_REGISTRAR__' ? 'SIN REGISTRAR' : ''), Número: r.numero || '', Propietario: r.propietario || '',
      'Cédula/RIF': r.identidad || '', Estado: r.estado, Cantidad: r.cantidad, 'Mensualidad Bs': r.mensualBs, Meses: r.deuda.meses,
      'Aseo Bs': r.deuda.baseBs, 'Multa Bs': r.deuda.multaBs + r.multaExtraBs, 'IVA Bs': r.deuda.ivaBs, 'Retención Bs': r.deuda.retencionBs, 'Total Bs': r.totalBs,
      Períodos: r.periodos.map(fmtPeriodo).join(', '),
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Estado de cuenta');
    XLSX.writeFile(wb, `Estado_cuenta_${c.codigo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!codigo) return <div className="p-6">Falta el código del condominio.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      <Link href="/admin/condominios" className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-900">
        <ArrowLeft className="w-4 h-4" /> Volver a Condominios
      </Link>

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" /> {error}</div>}
      {cargando && !d && <div className="py-20 text-center text-slate-500"><RefreshCw className="w-6 h-6 animate-spin inline mr-2" /> Cargando condominio…</div>}

      {c && e && (
        <>
          {/* ══ ENCABEZADO ══ */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono text-slate-500">{c.codigo} · {c.identidad}</div>
              <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Building2 className="w-7 h-7 text-emerald-600" /> {c.nombre}</h1>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">{c.tipo === 'RESIDENCIAL' ? 'Residencial' : c.tipo === 'COMERCIAL' ? 'Comercial' : 'Mixto'}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">{MODALIDAD[c.modalidad] || c.modalidad}</span>
                {c.agente_retencion && <span className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800">Agente de retención (75% IVA)</span>}
                {c.cobro_tarifa_por_unidad && <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">Cada local paga según su actividad</span>}
                {c.permite_pago_por_unidad && <span className="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-800">Puede pagar por unidad</span>}
                {c.permite_abonos !== false && <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">Acepta abonos</span>}
              </div>
              {c.actividad && <div className="text-xs text-slate-500">Actividad: <b className="text-slate-700">{c.actividad}</b>{c.tarifa_mmv ? <> · Tarifa {Number(c.tarifa_mmv)} MMV por unidad</> : null}</div>}
              {(c.correo || c.telefono) && <div className="text-xs text-slate-500">{c.correo} {c.telefono ? `· ${c.telefono}` : ''}</div>}
              {c.notas && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-block">{c.notas}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {admin && (
                <button id="btn-agregar-unidad" onClick={() => setEditorU(null)} className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-2 cursor-pointer">
                  <Plus className="w-4 h-4" /> Agregar unidad
                </button>
              )}
              {admin && (
                <button id="btn-editar-condominio" onClick={abrirEdicion} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" /> Opciones
                </button>
              )}
              <Link id="btn-cobrar-desde-ficha" href={`/admin/condominios/caja?codigo=${c.codigo}`} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2">
                <WalletIcon className="w-4 h-4" /> Cobrar
              </Link>
              <button onClick={exportar} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 cursor-pointer">
                <Download className="w-4 h-4" /> Estado de cuenta
              </button>
              <button onClick={cargar} className="p-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer" title="Recargar">
                <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ══ TARJETAS ══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl p-4 text-white shadow-md bg-gradient-to-br from-emerald-600 to-teal-700">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/80 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Mensualidad</div>
              <div className="text-2xl font-black mt-1 tabular-nums">Bs {fmtBs(e.mensual.condominioBs)}</div>
              <div className="text-[11px] text-white/80 mt-0.5">{e.mensual.detalle}</div>
            </div>
            <div className="rounded-2xl p-4 text-white shadow-md bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/80 flex items-center gap-2"><Users className="w-4 h-4" /> Unidades</div>
              <div className="text-2xl font-black mt-1 tabular-nums">{c.cant_declarada} <span className="text-sm font-bold text-white/70">declaradas</span></div>
              <div className="text-[11px] text-white/80 mt-0.5">{d.unidades.length} registradas · {e.mensual.unidadesDesocupadas} desocupadas</div>
            </div>
            <div className={`rounded-2xl p-4 text-white shadow-md bg-gradient-to-br ${e.totales.totalBs > 0.01 ? 'from-rose-600 to-red-700' : 'from-sky-600 to-indigo-700'}`}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/80 flex items-center gap-2"><Wallet className="w-4 h-4" /> Deuda total</div>
              <div className="text-2xl font-black mt-1 tabular-nums">{e.totales.totalBs > 0.01 ? `Bs ${fmtBs(e.totales.totalBs)}` : 'Al día'}</div>
              <div className="text-[11px] text-white/80 mt-0.5">Hasta {e.totales.mesesMax} mes(es) · {e.totales.unidadesConDeuda} unidad(es) con deuda</div>
            </div>
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm text-xs space-y-1">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Desglose de la deuda</div>
              <div className="flex justify-between"><span>Aseo</span><b className="tabular-nums">Bs {fmtBs(e.totales.baseBs)}</b></div>
              <div className="flex justify-between"><span>Multas {e.quienPaga.multa === 'UNIDAD' ? '(las paga cada unidad)' : ''}</span><b className="tabular-nums">Bs {fmtBs(e.totales.multaBs)}</b></div>
              {e.totales.ivaBs > 0 && <div className="flex justify-between text-blue-700"><span>IVA 16%</span><b className="tabular-nums">Bs {fmtBs(e.totales.ivaBs)}</b></div>}
              {e.totales.retencionBs > 0 && <div className="flex justify-between text-violet-700"><span>Retención IVA</span><b className="tabular-nums">− Bs {fmtBs(e.totales.retencionBs)}</b></div>}
              <div className="text-[10px] text-slate-400 pt-1">Tasa BCV: Bs {fmtBs(e.tasa)}</div>
            </div>
          </div>

          {/* ══ PESTAÑAS ══ */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 border-b border-slate-100">
              <div className="flex gap-1">
                {([['deuda', 'Estado de cuenta', Wallet], ['unidades', `Unidades (${d.unidades.length})`, Layers], ['movimientos', `Movimientos (${d.movimientos.length})`, History]] as const).map(([k, label, Icon]) => (
                  <button key={k} onClick={() => setTab(k as any)}
                    className={`px-4 py-2.5 text-sm font-extrabold border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${tab === k ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
              {tab !== 'movimientos' && (
                <div className="flex items-center gap-3 pb-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input id="buscar-unidad" value={q} onChange={ev => setQ(ev.target.value)} placeholder="Unidad, propietario o cédula…"
                      className="pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  {tab === 'deuda' && (
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer select-none">
                      <input type="checkbox" checked={soloDeuda} onChange={ev => setSoloDeuda(ev.target.checked)} className="w-4 h-4 accent-emerald-600" /> Solo con deuda
                    </label>
                  )}
                </div>
              )}
            </div>

            {tab === 'deuda' && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="w-8"></th>
                        <th className="text-left py-2.5 px-3">Unidad / propietario</th>
                        <th className="text-right py-2.5 px-3">Mensualidad</th>
                        <th className="text-center py-2.5 px-3">Meses</th>
                        <th className="text-right py-2.5 px-3">Aseo</th>
                        <th className="text-right py-2.5 px-3">Multa</th>
                        {e.totales.ivaBs > 0 && <th className="text-right py-2.5 px-3">IVA</th>}
                        <th className="text-right py-2.5 px-4">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibles.length === 0 ? (
                        <tr><td colSpan={8} className="py-10 text-center text-slate-500">Sin resultados.</td></tr>
                      ) : visibles.map((r: any) => {
                        const sinReg = r.clave === '__SIN_REGISTRAR__';
                        const open = abierto === r.clave;
                        return (
                          <React.Fragment key={r.clave}>
                            <tr onClick={() => setAbierto(open ? null : r.clave)} className={`cursor-pointer hover:bg-emerald-50/40 ${sinReg ? 'bg-amber-50/50' : ''} ${unidadFoco && r.inmueble === unidadFoco ? 'bg-emerald-50' : ''}`}>
                              <td className="pl-3 text-slate-400">{r.deuda.meses > 0 ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}</td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900 flex items-center gap-2">{sinReg ? <span className="text-amber-800">Unidades declaradas sin registrar</span> : <span className="font-mono">{r.inmueble}{r.numero ? ` · ${r.numero}` : ''}</span>}
                                  {admin && unidadDe(r.clave) && (
                                    <button title="Editar unidad" onClick={ev => { ev.stopPropagation(); setEditorU(unidadDe(r.clave)); }} className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                                  )}
                                  {unidadDe(r.clave) && r.totalBs > 0.01 && (
                                    <Link href={`/admin/condominios/caja?codigo=${c.codigo}&unidad=${r.clave}`} onClick={ev => ev.stopPropagation()} title="Cobrar solo este local"
                                      className="px-2 py-0.5 rounded-md border border-sky-200 bg-sky-50 text-sky-800 text-[10px] font-extrabold hover:bg-sky-100 inline-flex items-center gap-1"><WalletIcon className="w-3 h-3" /> Cobrar</Link>
                                  )}</div>
                                <div className="text-[11px] text-slate-500">
                                  {sinReg ? `${r.cantidad} unidad(es) — regístrelas para cobrarlas por separado` : `${r.propietario || 'Sin propietario'}${r.identidad ? ` · ${r.identidad}` : ''}`}
                                  {r.estado === 'Desocupada' && <span className="ml-1 px-1.5 rounded bg-slate-200 text-slate-700 font-bold">Desocupada</span>}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">Bs {fmtBs(r.mensualBs)}</td>
                              <td className="py-2.5 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-black ${r.deuda.meses === 0 ? 'bg-emerald-100 text-emerald-800' : r.deuda.meses > 12 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{r.deuda.meses}</span></td>
                              <td className="py-2.5 px-3 text-right tabular-nums">{fmtBs(r.deuda.baseBs)}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums">{fmtBs(r.deuda.multaBs + r.multaExtraBs + (r.multasManualesBs || 0))}</td>
                              {e.totales.ivaBs > 0 && <td className="py-2.5 px-3 text-right tabular-nums text-blue-700">{fmtBs(r.deuda.ivaBs)}</td>}
                              <td className={`py-2.5 px-4 text-right font-black tabular-nums ${r.totalBs > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>{r.totalBs > 0.01 ? `Bs ${fmtBs(r.totalBs)}` : 'Al día'}</td>
                            </tr>
                            {open && (r.deuda.meses > 0 || (r.multasManuales || []).length > 0) && (
                              <tr className="bg-slate-50/70">
                                <td></td>
                                <td colSpan={7} className="py-3 px-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                                    {r.deuda.porMes.map((m: any, i: number) => (
                                      <div key={i} className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-[11px]">
                                        <div className="font-black text-slate-800">{fmtPeriodo(r.periodos[i] || '')}</div>
                                        <div className="text-slate-500">Aseo {fmtBs(m.baseBs)}{m.multaBs > 0 ? ` + multa ${fmtBs(m.multaBs)}` : ''}{m.ivaBs > 0 ? ` + IVA ${fmtBs(m.ivaBs)}` : ''}</div>
                                        <div className="font-bold text-slate-900">Bs {fmtBs(m.totalBs)}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {r.multaExtraBs > 0 && <div className="text-[11px] text-amber-800 mt-2">Incluye Bs {fmtBs(r.multaExtraBs)} de multas pendientes de meses ya pagados.</div>}
                                  {(r.multasManuales || []).map((m: any) => <div key={m.id} className="text-[11px] text-amber-800 mt-1">Multa: {m.concepto} — Bs {fmtBs(m.montoBs)}</div>)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {paginas > 1 && (
                  <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
                    <button onClick={() => setPagina(x => Math.max(0, x - 1))} disabled={pagina === 0} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer">Anterior</button>
                    <span>Página {pagina + 1} de {paginas} · {renglones.length} renglones</span>
                    <button onClick={() => setPagina(x => Math.min(paginas - 1, x + 1))} disabled={pagina >= paginas - 1} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer">Siguiente</button>
                  </div>
                )}
              </>
            )}

            {tab === 'unidades' && (() => {
              const t = q.trim().toUpperCase();
              const coincide = (u: any) => !t || [u.inmueble, u.numero, u.propietario, u.identidad, u.actividad].some((x: any) => String(x || '').toUpperCase().includes(t));
              const enRama = (u: any, prof = 0): boolean => coincide(u) || (prof < 6 && (arbol.hijos.get(u.id) || []).some(h => enRama(h, prof + 1)));
              const fila = (u: any, nivel: number): React.ReactNode => {
                const hs = arbol.hijos.get(u.id) || [];
                const abierta = torresAbiertas.has(u.id) || !!t;
                const visiblesH = hs.filter(h => enRama(h));
                if (!coincide(u) && visiblesH.length === 0) return null;
                return (
                  <React.Fragment key={u.id}>
                    <tr onClick={() => hs.length && setTorresAbiertas(s => { const n = new Set(s); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })}
                      className={`${hs.length ? 'cursor-pointer bg-slate-50/80 hover:bg-emerald-50/50' : ''} ${unidadFoco && u.inmueble === unidadFoco ? 'bg-emerald-50' : ''}`}>
                      <td className="py-2 px-4 font-mono font-bold" style={{ paddingLeft: 16 + nivel * 22 }}>
                        <span className="inline-flex items-center gap-1.5">
                          {hs.length ? (abierta ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />) : nivel > 0 ? <span className="text-slate-300">└</span> : null}
                          {hs.length ? <Building className="w-3.5 h-3.5 text-emerald-600" /> : null}
                          {u.inmueble || '—'}
                          {hs.length ? <span className="ml-1 px-1.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black">{hs.length} unidades</span> : null}
                        </span>
                      </td>
                      <td className="py-2 px-3">{u.numero || '—'}</td>
                      <td className="py-2 px-3">{u.propietario || '—'}</td>
                      <td className="py-2 px-3 font-mono text-xs">{u.identidad || '—'}</td>
                      <td className="py-2 px-3 text-xs text-slate-600">{u.actividad || '—'}</td>
                      <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${u.estado === 'Activa' ? 'bg-emerald-100 text-emerald-800' : u.estado === 'Desocupada' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-700'}`}>{u.estado}</span></td>
                      <td className="py-2 px-4 text-xs">{u.aseo_pendiente_desde ? fmtPeriodo(String(u.aseo_pendiente_desde).slice(0, 7)) : <span className="text-emerald-700 font-bold">Al día</span>}</td>
                      {admin && <td className="py-2 pr-4 text-right">
                        <button id={`editar-${u.inmueble || u.id}`} onClick={ev => { ev.stopPropagation(); setEditorU(u); }} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 inline-flex items-center gap-1 cursor-pointer"><Pencil className="w-3.5 h-3.5" /> Editar</button>
                      </td>}
                    </tr>
                    {hs.length > 0 && abierta && (t ? visiblesH : hs).map((h: any) => fila(h, nivel + 1))}
                  </React.Fragment>
                );
              };
              return (
                <div className="overflow-x-auto">
                  {arbol.torres > 0 && <div className="px-4 py-2 text-xs text-slate-600 border-b border-slate-100 bg-emerald-50/40"><b>{arbol.torres}</b> torre(s) / sub-grupo(s). Haga clic en una torre para ver sus unidades.</div>}
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="text-left py-2.5 px-4">Código</th><th className="text-left py-2.5 px-3">Número</th><th className="text-left py-2.5 px-3">Propietario</th>
                        <th className="text-left py-2.5 px-3">Cédula/RIF</th><th className="text-left py-2.5 px-3">Actividad</th><th className="text-left py-2.5 px-3">Estado</th><th className="text-left py-2.5 px-4">Pendiente desde</th>
                        {admin && <th></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => { const rs = arbol.raiz.filter(u => enRama(u)); return rs.length ? rs.slice(0, 600).map((u: any) => fila(u, 0)) : <tr><td colSpan={8} className="py-10 text-center text-slate-500">Ninguna unidad coincide con “{q}”.</td></tr>; })()}
                    </tbody>
                  </table>
                  {arbol.raiz.filter(u => enRama(u)).length > 600 && <div className="px-4 py-2 text-xs text-slate-500">Mostrando 600 de {arbol.raiz.filter(u => enRama(u)).length}. Use el buscador para encontrar una unidad.</div>}
                </div>
              );
            })()}

            {tab === 'movimientos' && (
              <div className="p-4">
                {d.movimientos.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-sm">Todavía no hay movimientos. Los pagos y abonos del módulo de condominios aparecerán aquí.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="text-left py-2">Fecha</th><th className="text-left">Tipo</th><th className="text-left">Concepto</th><th className="text-right">Monto</th><th className="text-left pl-4">Usuario</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.movimientos.map((m: any) => (
                        <tr key={m.id}><td className="py-2 text-xs">{new Date(m.created_at).toLocaleString('es-VE')}</td><td className="font-bold text-xs">{m.tipo}</td><td className="text-xs">{m.concepto}</td>
                          <td className={`text-right tabular-nums font-bold ${m.monto_bs < 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtBs(m.monto_bs)}</td><td className="pl-4 text-xs">{m.usuario}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ MODAL OPCIONES (solo administrador) ══ */}
      {editando && c && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
              <div className="font-extrabold flex items-center gap-2"><Settings className="w-5 h-5" /> Opciones de {c.nombre}</div>
              <button onClick={() => setEditando(false)} className="text-white/70 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block"><span className="text-xs font-bold text-slate-700">Nombre del condominio</span>
                  <input value={form.nombre} onChange={ev => setForm({ ...form, nombre: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">RIF</span>
                  <input value={form.identidad} onChange={ev => setForm({ ...form, identidad: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 font-mono" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">Clasificación</span>
                  <select value={form.tipo} onChange={ev => setForm({ ...form, tipo: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2">
                    <option value="RESIDENCIAL">Residencial</option><option value="COMERCIAL">Comercial</option><option value="MIXTO">Mixto (residencial y comercial)</option>
                  </select></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-xs font-bold text-slate-700">Meses pendientes</span>
                    <input id="condo-meses" type="number" min={0} value={form.meses} onChange={ev => setForm({ ...form, meses: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                  <label className="block"><span className="text-xs font-bold text-slate-700">Meses con multa</span>
                    <input type="number" min={0} value={form.multa_meses} onChange={ev => setForm({ ...form, multa_meses: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block"><span className="text-xs font-bold text-slate-700">Modalidad de cobro</span>
                  <select value={form.modalidad} onChange={ev => setForm({ ...form, modalidad: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2">
                    {Object.entries(MODALIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">Unidades declaradas</span>
                  <input type="number" min={1} value={form.cant_declarada} onChange={ev => setForm({ ...form, cant_declarada: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">Tarifa por unidad (MMV)</span>
                  <input type="number" step="0.01" value={form.tarifa_mmv} onChange={ev => setForm({ ...form, tarifa_mmv: ev.target.value })} placeholder="Según la actividad" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">Actividad</span>
                  <input value={form.actividad} onChange={ev => setForm({ ...form, actividad: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">Correo</span>
                  <input value={form.correo} onChange={ev => setForm({ ...form, correo: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                <label className="block"><span className="text-xs font-bold text-slate-700">Teléfono</span>
                  <input value={form.telefono} onChange={ev => setForm({ ...form, telefono: ev.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ['permite_pago_por_unidad', 'Puede cancelar sus inmuebles por separado'],
                  ['permite_abonos', 'Acepta abonos (pagos parciales)'],
                  ['cobro_tarifa_por_unidad', 'Cada local paga según su propia actividad (como HMR)'],
                  ['agente_retencion', 'Agente de retención (75% del IVA)'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={!!form[k]} onChange={ev => setForm({ ...form, [k]: ev.target.checked })} className="w-4 h-4 accent-emerald-600" />
                    <span className="text-xs font-bold text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
              <label className="block"><span className="text-xs font-bold text-slate-700">Notas</span>
                <textarea value={form.notas} onChange={ev => setForm({ ...form, notas: ev.target.value })} rows={2} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
              <label className="block"><span className="text-xs font-bold text-red-700">Motivo del cambio (obligatorio)</span>
                <input id="motivo-cambio-condominio" value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Queda registrado en la Auditoría" className="mt-1 w-full border border-red-200 rounded-xl px-3 py-2" /></label>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setEditando(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancelar</button>
              <button id="btn-guardar-condominio" onClick={guardar} disabled={guardando} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-50">
                {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
      {editorU !== undefined && c && (
        <EditorUnidad
          condo={c} unidad={editorU} unidades={d.unidades} multas={d.multas || []} usuario={usuarioActual()} porActividad={!!e?.porActividad}
          renglon={editorU ? e?.renglones.find((r: any) => r.clave === editorU.id) || null : null}
          onClose={() => setEditorU(undefined)}
          onSaved={async (cerrar: boolean) => { await cargar(); if (cerrar) setEditorU(undefined); }}
        />
      )}
    </div>
  );
}

export default function FichaCondominioPage() {
  return <Suspense fallback={<div className="p-6 text-slate-500">Cargando…</div>}><Ficha /></Suspense>;
}
