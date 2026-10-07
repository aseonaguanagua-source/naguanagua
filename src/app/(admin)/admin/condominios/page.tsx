'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2, Search, RefreshCw, AlertTriangle, CheckCircle2, Wallet, CalendarClock,
  Layers, ChevronLeft, ChevronRight, UserSearch, X, Download,
} from 'lucide-react';
import { SelectorModulo } from '@/components/condominios/SelectorModulo';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MODALIDAD: Record<string, { label: string; cls: string }> = {
  CENTRALIZADO:    { label: 'Centralizado',      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  MIXTO_COMERCIAL: { label: 'Mixto comercial',   cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  INDIVIDUAL:      { label: 'Pago individual',   cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  TARIFA_FIJA:     { label: 'Tarifa fija',       cls: 'bg-violet-50 text-violet-800 border-violet-200' },
};
const POR_PAGINA = 50;

export default function CondominiosPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [tipo, setTipo] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [orden, setOrden] = useState<'nombre' | 'deuda' | 'meses' | 'unidades'>('deuda');
  const [pagina, setPagina] = useState(0);

  // Búsqueda por dueño de unidad
  const [dueno, setDueno] = useState('');
  const [duenoRes, setDuenoRes] = useState<any[] | null>(null);
  const [buscandoDueno, setBuscandoDueno] = useState(false);

  const cargar = async () => {
    setCargando(true); setError('');
    try {
      const r = await fetch('/api/admin/condominios', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar');
      setDatos(d);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  // La búsqueda principal también encuentra unidades (hijos) por código, propietario o cédula
  const [unidadesQ, setUnidadesQ] = useState<any[]>([]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setUnidadesQ([]); return; }
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/condominios?buscar=${encodeURIComponent(t)}`, { cache: 'no-store' });
        const j = await r.json();
        setUnidadesQ(j.unidades || []);
      } catch { setUnidadesQ([]); }
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  const buscarDueno = async () => {
    if (dueno.replace(/\D/g, '').length < 4) return;
    setBuscandoDueno(true);
    try {
      const r = await fetch(`/api/admin/condominios?dueno=${encodeURIComponent(dueno)}`);
      const d = await r.json();
      setDuenoRes(d.unidades || []);
    } finally { setBuscandoDueno(false); }
  };

  const filas = useMemo(() => {
    if (!datos?.filas) return [];
    const t = q.trim().toUpperCase();
    const tn = t.replace(/[^0-9A-Z]/g, '');
    let out = datos.filas.filter((f: any) =>
      (!t || f.nombre.toUpperCase().includes(t) || f.codigo.includes(t) || String(f.identidad || '').replace(/[^0-9A-Z]/gi, '').toUpperCase().includes(tn)) &&
      (!modalidad || f.modalidad === modalidad) && (!tipo || f.tipo === tipo) && (!soloDeuda || f.deudaBs > 0.01));
    out = [...out].sort((a: any, b: any) =>
      orden === 'nombre' ? a.nombre.localeCompare(b.nombre) : orden === 'deuda' ? b.deudaBs - a.deudaBs : orden === 'meses' ? b.meses - a.meses : b.cant_declarada - a.cant_declarada);
    return out;
  }, [datos, q, modalidad, tipo, soloDeuda, orden]);
  useEffect(() => { setPagina(0); }, [q, modalidad, tipo, soloDeuda, orden]);

  const totalFiltro = useMemo(() => filas.reduce((a: number, f: any) => a + f.deudaBs, 0), [filas]);
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const visibles = filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const p = datos?.panel;

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(filas.map((f: any) => ({
      Código: f.codigo, Condominio: f.nombre, RIF: f.identidad, Tipo: f.tipo, Modalidad: MODALIDAD[f.modalidad]?.label || f.modalidad,
      'Unidades declaradas': f.cant_declarada, 'Unidades registradas': f.unidades, 'Mensualidad Bs': f.mensualBs, Meses: f.meses, 'Deuda Bs': f.deudaBs,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Condominios');
    XLSX.writeFile(wb, `Condominios_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* ══ ENCABEZADO ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <SelectorModulo activo="condominios" />
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-emerald-600" /> Condominios
          </h1>
          <p className="text-xs text-slate-500 max-w-3xl">
            Cobro por <b>unidades declaradas × tarifa del condominio</b>, con la tasa BCV vigente{datos?.tasa ? <> (<b>Bs {fmtBs(datos.tasa)}</b>)</> : null}.
            Todos los montos salen del mismo cálculo que usarán Caja, el estado de cuenta y el portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportar} disabled={!filas.length} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
          <button onClick={cargar} disabled={cargando} className="p-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer" title="Recargar">
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" /> {error}</div>}

      {/* ══ PANEL ══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: 'Condominios', valor: p ? p.condominios.toLocaleString('es-VE') : '—', sub: p ? `${p.unidades.toLocaleString('es-VE')} unidades registradas` : '', cls: 'from-slate-800 to-slate-900' },
          { icon: CalendarClock, label: 'Facturación mensual', valor: p ? `Bs ${fmtBs(p.mensualBs)}` : '—', sub: 'Aseo de todos los condominios', cls: 'from-emerald-600 to-teal-700' },
          { icon: Wallet, label: 'Deuda total', valor: p ? `Bs ${fmtBs(p.deudaBs)}` : '—', sub: p ? `${p.conDeuda} con deuda` : '', cls: 'from-rose-600 to-red-700' },
          { icon: CheckCircle2, label: 'Al día', valor: p ? p.alDia.toLocaleString('es-VE') : '—', sub: p ? `${Math.round((p.alDia / Math.max(1, p.condominios)) * 100)}% de los condominios` : '', cls: 'from-sky-600 to-indigo-700' },
        ].map((c, i) => (
          <div key={i} className={`rounded-2xl p-4 text-white shadow-md bg-gradient-to-br ${c.cls}`}>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/80"><c.icon className="w-4 h-4" /> {c.label}</div>
            <div className="text-xl md:text-2xl font-black mt-1 tabular-nums">{cargando && !p ? <span className="opacity-60">Cargando…</span> : c.valor}</div>
            <div className="text-[11px] text-white/75 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {p && (p.alertas.sinUnidades > 0 || p.alertas.deudaMas12Meses > 0 || p.alertas.masRegistradasQueDeclaradas > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {p.alertas.deudaMas12Meses > 0 && <span className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-800 font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {p.alertas.deudaMas12Meses} con más de 12 meses de deuda</span>}
          {p.alertas.sinUnidades > 0 && <span className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> {p.alertas.sinUnidades} sin unidades registradas</span>}
          {p.alertas.masRegistradasQueDeclaradas > 0 && <span className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 font-bold">{p.alertas.masRegistradasQueDeclaradas} con más unidades registradas que declaradas</span>}
          {Object.entries(p.porModalidad).map(([k, v]: any) => (
            <span key={k} className={`px-3 py-1.5 rounded-lg border font-bold ${MODALIDAD[k]?.cls || ''}`}>{MODALIDAD[k]?.label || k}: {v}</span>
          ))}
        </div>
      )}

      {/* ══ BÚSQUEDA ══ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input id="buscar-condominio" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar condominio, o unidad por código, propietario o cédula…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <select id="filtro-modalidad" value={modalidad} onChange={e => setModalidad(e.target.value)} className="py-2.5 px-3 rounded-xl border border-slate-300 text-sm bg-white">
            <option value="">Todas las modalidades</option>
            {Object.entries(MODALIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select id="filtro-tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="py-2.5 px-3 rounded-xl border border-slate-300 text-sm bg-white">
            <option value="">Residencial y comercial</option>
            <option value="RESIDENCIAL">Residencial</option>
            <option value="COMERCIAL">Comercial</option>
            <option value="MIXTO">Mixto</option>
          </select>
          <select id="orden" value={orden} onChange={e => setOrden(e.target.value as any)} className="py-2.5 px-3 rounded-xl border border-slate-300 text-sm bg-white">
            <option value="deuda">Mayor deuda</option>
            <option value="meses">Más meses</option>
            <option value="unidades">Más unidades</option>
            <option value="nombre">Nombre</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={soloDeuda} onChange={e => setSoloDeuda(e.target.checked)} className="w-4 h-4 accent-emerald-600" /> Solo con deuda
          </label>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <label htmlFor="buscar-dueno" className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Buscar dueño de una unidad</label>
          <div className="flex gap-2 mt-1">
            <input id="buscar-dueno" value={dueno} onChange={e => setDueno(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarDueno()} placeholder="Cédula o RIF (ej. V-12345678)"
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button onClick={buscarDueno} disabled={buscandoDueno} className="px-3 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              {buscandoDueno ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserSearch className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {unidadesQ.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-emerald-200">
          <div className="font-extrabold text-slate-800 text-sm mb-2">Unidades que coinciden con “{q.trim()}”: {unidadesQ.length}{unidadesQ.length >= 25 ? '+' : ''}</div>
          <div className="flex flex-wrap gap-2">
            {unidadesQ.map((u: any) => (
              <button key={u.id} id={`unidad-${u.inmueble || u.id}`} onClick={() => router.push(`/admin/condominios/ficha?codigo=${u.condominios.codigo}&unidad=${encodeURIComponent(u.inmueble || u.numero || '')}`)}
                className="text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors cursor-pointer">
                <div className="font-mono text-xs font-bold text-slate-800">{u.inmueble || '—'}{u.numero ? ` · ${u.numero}` : ''}</div>
                <div className="text-[11px] text-slate-600">{u.propietario || 'Sin propietario'}{u.identidad ? ` · ${u.identidad}` : ''}</div>
                <div className="text-[11px] text-emerald-700 font-bold">{u.condominios.nombre}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {duenoRes && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <div className="font-extrabold text-slate-800 text-sm">Unidades de {dueno}: {duenoRes.length}</div>
            <button onClick={() => setDuenoRes(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          {duenoRes.length === 0 ? <div className="text-sm text-slate-500">No tiene unidades en ningún condominio.</div> : (
            <div className="flex flex-wrap gap-2">
              {duenoRes.map((u: any) => (
                <button key={u.id} onClick={() => router.push(`/admin/condominios/ficha?codigo=${u.condominios.codigo}&unidad=${u.inmueble}`)}
                  className="text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors cursor-pointer">
                  <div className="font-mono text-xs font-bold text-slate-800">{u.inmueble}{u.numero ? ` · ${u.numero}` : ''}</div>
                  <div className="text-[11px] text-slate-500">{u.condominios.nombre}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ LISTA ══ */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 text-xs text-slate-600">
          <span><b className="text-slate-900">{filas.length.toLocaleString('es-VE')}</b> condominios · deuda del filtro <b className="text-red-700">Bs {fmtBs(totalFiltro)}</b></span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPagina(x => Math.max(0, x - 1))} disabled={pagina === 0} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
            <span>Página {pagina + 1} de {paginas}</span>
            <button onClick={() => setPagina(x => Math.min(paginas - 1, x + 1))} disabled={pagina >= paginas - 1} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-2.5 px-4">Condominio</th>
                <th className="text-left py-2.5 px-3">Modalidad</th>
                <th className="text-center py-2.5 px-3">Unidades</th>
                <th className="text-right py-2.5 px-3">Mensualidad</th>
                <th className="text-center py-2.5 px-3">Meses</th>
                <th className="text-right py-2.5 px-4">Deuda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando && !datos ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500"><RefreshCw className="w-5 h-5 animate-spin inline mr-2" /> Calculando condominios…</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">No hay condominios con ese filtro.</td></tr>
              ) : visibles.map((f: any) => (
                <tr key={f.codigo} onClick={() => router.push(`/admin/condominios/ficha?codigo=${f.codigo}`)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{f.nombre}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{f.codigo} · {f.identidad} · {f.tipo === 'RESIDENCIAL' ? 'Residencial' : f.tipo === 'COMERCIAL' ? 'Comercial' : 'Mixto'}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${MODALIDAD[f.modalidad]?.cls || ''}`}>{MODALIDAD[f.modalidad]?.label || f.modalidad}</span>
                    {f.cobro_tarifa_por_unidad && <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 border-slate-200 text-slate-600">Tarifa por local</span>}
                  </td>
                  <td className="py-3 px-3 text-center tabular-nums">
                    <b>{f.cant_declarada}</b> <span className="text-slate-400">decl.</span>
                    <div className={`text-[11px] ${f.unidades === 0 ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>{f.unidades} registradas</div>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">Bs {fmtBs(f.mensualBs)}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${f.meses === 0 ? 'bg-emerald-100 text-emerald-800' : f.meses > 12 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{f.meses}</span>
                  </td>
                  <td className={`py-3 px-4 text-right font-black tabular-nums ${f.deudaBs > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>{f.deudaBs > 0.01 ? `Bs ${fmtBs(f.deudaBs)}` : 'Al día'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
