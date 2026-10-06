'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Building2, UserPlus, Trash2, X, AlertTriangle, CheckCircle2, Home, Store, Link2 } from 'lucide-react';

const usuarioActual = () => {
  try { return JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || localStorage.getItem('adminUser') || ''; } catch { return ''; }
};
const POR_PAGINA = 50;

/**
 * Pestaña "Huérfanos": inmuebles que existen en SIGYR (foto 06/10/2026) y no en el sistema nuevo.
 * Desde aquí se agregan a un condominio, se registran como contribuyente o se descartan.
 */
export default function HuerfanosPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [sinTabla, setSinTabla] = useState(false);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('Pendiente');
  const [tipo, setTipo] = useState('');
  const [pagina, setPagina] = useState(0);
  const [msg, setMsg] = useState('');

  const [modal, setModal] = useState<null | { modo: 'asignar' | 'registrar' | 'descartar'; h: any }>(null);

  const cargar = async () => {
    setCargando(true); setError('');
    try {
      const p = new URLSearchParams({ estado, tipo, q });
      const r = await fetch(`/api/admin/huerfanos?${p}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setSinTabla(!!j.sinTabla); throw new Error(j.error || 'No se pudo cargar'); }
      setSinTabla(false); setRows(j.huerfanos || []); setPendientes(j.pendientes || 0); setPagina(0);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [estado, tipo]);
  useEffect(() => { const t = setTimeout(cargar, 400); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);

  const visibles = rows.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const paginas = Math.max(1, Math.ceil(rows.length / POR_PAGINA));
  const totales = useMemo(() => ({
    meses: rows.reduce((s, r) => s + (r.meses_deuda || 0), 0),
    hijos: rows.filter(r => r.padre_sugerido).length,
  }), [rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <b>Inmuebles huérfanos:</b> existen en SIGYR (foto del 06/10/2026) pero no en este sistema, casi siempre porque SIGYR no tenía la cédula del dueño.
          Agréguelos a su condominio, regístrelos como contribuyente con datos completos o descártelos. Cada acción queda en la Auditoría.
        </div>
      </div>

      {sinTabla && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Falta crear la tabla en Supabase. Ejecute el archivo <b>sql/2026-10-06_huerfanos.sql</b> en el editor SQL de Supabase y recargue.
        </div>
      )}
      {error && !sinTabla && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {msg && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">Pendientes</div>
          <div className="text-2xl font-black tabular-nums">{pendientes.toLocaleString('es-VE')}</div>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">En esta vista</div>
          <div className="text-2xl font-black tabular-nums text-slate-800">{rows.length.toLocaleString('es-VE')}</div>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">De un condominio</div>
          <div className="text-2xl font-black tabular-nums text-slate-800">{totales.hijos.toLocaleString('es-VE')}</div>
        </div>
        <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Meses de deuda (SIGYR)</div>
          <div className="text-2xl font-black tabular-nums text-red-700">{totales.meses.toLocaleString('es-VE')}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input id="buscar-huerfano" value={q} onChange={e => setQ(e.target.value)} placeholder="Código, nombre, cédula, condominio…"
            className="pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">
          <option value="">Todos</option>
          <option value="hijos">De un condominio</option>
          <option value="sueltos">Sin condominio</option>
        </select>
        <select value={estado} onChange={e => setEstado(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">
          {['Pendiente', 'Asignado a condominio', 'Registrado como contribuyente', 'Descartado', 'Todos'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={cargar} className="p-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 cursor-pointer" title="Recargar">
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left py-2.5 px-4">Inmueble</th>
              <th className="text-left py-2.5 px-3">Dueño (SIGYR)</th>
              <th className="text-left py-2.5 px-3">Actividad</th>
              <th className="text-left py-2.5 px-3">Condominio sugerido</th>
              <th className="text-center py-2.5 px-3">Meses</th>
              <th className="text-left py-2.5 px-3">Estado</th>
              <th className="text-right py-2.5 px-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">{cargando ? 'Cargando…' : 'Sin registros.'}</td></tr>
            ) : visibles.map(h => (
              <tr key={h.id} className="hover:bg-amber-50/40">
                <td className="py-2.5 px-4">
                  <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                    {/RESID/i.test(h.tipo || '') ? <Home className="w-3.5 h-3.5 text-sky-600" /> : <Store className="w-3.5 h-3.5 text-violet-600" />}{h.inmueble}
                  </div>
                  {h.numero && <div className="text-[11px] text-slate-500">N° {h.numero}</div>}
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-slate-800">{h.nombre || '—'}</div>
                  <div className="text-[11px] text-slate-500">{h.identidad || <span className="text-red-600 font-bold">Sin cédula</span>}{h.telefono ? ` · ${h.telefono}` : ''}</div>
                  {h.direccion && <div className="text-[11px] text-slate-400 max-w-xs truncate" title={h.direccion}>{h.direccion}</div>}
                </td>
                <td className="py-2.5 px-3 text-xs text-slate-600">{h.actividad || '—'}</td>
                <td className="py-2.5 px-3 text-xs">{h.padre_sugerido ? <span className="font-mono font-bold text-emerald-700">{h.padre_sugerido}</span> : <span className="text-slate-400">—</span>}</td>
                <td className="py-2.5 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-black ${h.meses_deuda > 12 ? 'bg-red-100 text-red-800' : h.meses_deuda > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{h.meses_deuda}</span></td>
                <td className="py-2.5 px-3 text-xs">
                  <div className="font-bold text-slate-700">{h.estado}</div>
                  {h.resuelto_por && <div className="text-[10px] text-slate-400">{h.resuelto_por}</div>}
                </td>
                <td className="py-2.5 px-4">
                  {h.estado === 'Pendiente' ? (
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setModal({ modo: 'asignar', h })} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer" title="Agregar a un condominio">
                        <Building2 className="w-3.5 h-3.5" /> Condominio
                      </button>
                      <button onClick={() => setModal({ modo: 'registrar', h })} className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer" title="Editar y registrar como contribuyente">
                        <UserPlus className="w-3.5 h-3.5" /> Contribuyente
                      </button>
                      <button onClick={() => setModal({ modo: 'descartar', h })} className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-slate-500 hover:text-red-600 cursor-pointer" title="Descartar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : <div className="text-right text-[11px] text-slate-400">{h.resolucion?.condominio || h.resolucion?.identidad || h.resolucion?.motivo || ''}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {paginas > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <button onClick={() => setPagina(x => Math.max(0, x - 1))} disabled={pagina === 0} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer">Anterior</button>
            <span>Página {pagina + 1} de {paginas}</span>
            <button onClick={() => setPagina(x => Math.min(paginas - 1, x + 1))} disabled={pagina >= paginas - 1} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer">Siguiente</button>
          </div>
        )}
      </div>

      {modal && <ModalAccion modo={modal.modo} h={modal.h} onClose={() => setModal(null)} onDone={(m: string) => { setModal(null); setMsg(m); cargar(); setTimeout(() => setMsg(''), 6000); }} />}
    </div>
  );
}

function ModalAccion({ modo, h, onClose, onDone }: { modo: 'asignar' | 'registrar' | 'descartar'; h: any; onClose: () => void; onDone: (m: string) => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Asignar
  const [qc, setQc] = useState(h.padre_sugerido || '');
  const [condos, setCondos] = useState<any[]>([]);
  const [condo, setCondo] = useState<any>(null);
  // Registrar
  const [datos, setDatos] = useState({
    identidad: h.identidad || '', nombre: h.nombre || '', tipo: /RESID/i.test(h.tipo || '') ? 'RESIDENCIAL' : 'COMERCIAL',
    actividad: h.actividad || '', direccion: h.direccion || '', correo: /@test\.com$/i.test(h.correo || '') ? '' : (h.correo || ''),
    telefono: h.telefono && h.telefono !== '0' ? h.telefono : '', meses_deuda: h.meses_deuda,
  });
  const [actividades, setActividades] = useState<Record<string, any>>({});
  // Descartar
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (modo !== 'asignar') return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/huerfanos?condominios=${encodeURIComponent(qc)}`); const j = await r.json();
      setCondos(j.condominios || []);
      if (!condo && h.padre_sugerido) { const s = (j.condominios || []).find((c: any) => c.codigo === h.padre_sugerido); if (s) setCondo(s); }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [qc, modo]);
  useEffect(() => {
    if (modo !== 'registrar') return;
    fetch('/api/admin/huerfanos?actividades=1').then(r => r.json()).then(j => setActividades(j.actividades || {}));
  }, [modo]);
  const listaAct = useMemo(() => Object.entries(actividades).filter(([, v]: any) => v.mmv_mes).sort((a: any, b: any) => b[1].usos - a[1].usos).map(([k]) => k), [actividades]);
  const tarifaSel = actividades[String(datos.actividad || '').toUpperCase().trim()];

  const enviar = async (payload: any, ok: string) => {
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/admin/huerfanos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: h.id, usuario: usuarioActual(), ...payload }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar');
      onDone(ok);
    } catch (e: any) { setError(e.message); setGuardando(false); }
  };

  const titulo = modo === 'asignar' ? 'Agregar a un condominio' : modo === 'registrar' ? 'Registrar como contribuyente' : 'Descartar inmueble';
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        <div className={`px-6 py-4 text-white flex items-center justify-between bg-gradient-to-r ${modo === 'asignar' ? 'from-emerald-700 to-teal-800' : modo === 'registrar' ? 'from-sky-700 to-indigo-800' : 'from-rose-700 to-red-800'}`}>
          <div className="font-extrabold">{titulo} · <span className="font-mono">{h.inmueble}</span></div>
          <button onClick={onClose} className="text-white/70 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-sm">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 grid grid-cols-2 gap-1">
            <div><b>Dueño SIGYR:</b> {h.nombre || '—'}</div><div><b>Cédula:</b> {h.identidad || 'Sin cédula'}</div>
            <div><b>Actividad:</b> {h.actividad || '—'}</div><div><b>Meses de deuda:</b> {h.meses_deuda}</div>
            <div className="col-span-2"><b>Dirección:</b> {h.direccion || '—'}</div>
          </div>

          {modo === 'asignar' && (
            <>
              <label className="block text-xs font-bold text-slate-700" htmlFor="buscar-condominio">Buscar condominio (código, nombre o RIF)</label>
              <input id="buscar-condominio" value={qc} onChange={e => setQc(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2" placeholder="Ej.: URB019615 o RESIDENCIAS…" />
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {condos.length === 0 ? <div className="p-3 text-xs text-slate-500">Sin resultados.</div> : condos.map(c => (
                  <button key={c.id} onClick={() => setCondo(c)} className={`w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 cursor-pointer ${condo?.id === c.id ? 'bg-emerald-100' : ''}`}>
                    <div className="font-bold text-slate-800">{c.nombre} {c.codigo === h.padre_sugerido && <span className="ml-1 px-1.5 rounded bg-emerald-600 text-white text-[10px]">Sugerido por SIGYR</span>}</div>
                    <div className="text-slate-500 font-mono">{c.codigo} · {c.identidad} · {c.modalidad}{c.cobro_tarifa_por_unidad ? ' · tarifa por local' : ''} · {c.cant_declarada} unidades</div>
                  </button>
                ))}
              </div>
              {condo && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex gap-2">
                  <Link2 className="w-4 h-4 shrink-0" />
                  <div>Se agregará como unidad de <b>{condo.nombre}</b>. {condo.modalidad === 'INDIVIDUAL' || condo.cobro_tarifa_por_unidad
                    ? <>Este condominio cobra por unidad: la unidad conserva su deuda de SIGYR (<b>{h.meses_deuda} meses</b>).</>
                    : <>La deuda la paga el condominio: la unidad queda con la misma fecha pendiente del condominio.</>}</div>
                </div>
              )}
            </>
          )}

          {modo === 'registrar' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-xs font-bold text-slate-700">Cédula / RIF *</span>
                <input value={datos.identidad} onChange={e => setDatos({ ...datos, identidad: e.target.value.toUpperCase() })} placeholder="V-12345678" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 font-mono" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Nombre / razón social *</span>
                <input value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value.toUpperCase() })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Tipo</span>
                <select value={datos.tipo} onChange={e => setDatos({ ...datos, tipo: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2">
                  <option value="RESIDENCIAL">Residencial</option><option value="COMERCIAL">Comercial</option>
                </select></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Actividad * (tarifa vigente del sistema)</span>
                <input list="lista-actividades-huerfano" value={datos.actividad} onChange={e => setDatos({ ...datos, actividad: e.target.value.toUpperCase() })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" />
                <datalist id="lista-actividades-huerfano">{listaAct.map(a => <option key={a} value={a} />)}</datalist>
                <span className={`text-[11px] ${tarifaSel?.mmv_mes ? 'text-emerald-700' : 'text-red-600'}`}>{tarifaSel?.mmv_mes ? `Tarifa: ${tarifaSel.mmv_mes} (usada en ${tarifaSel.usos} inmuebles)` : 'Seleccione una actividad de la lista'}</span></label>
              <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-700">Dirección</span>
                <input value={datos.direccion} onChange={e => setDatos({ ...datos, direccion: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Correo</span>
                <input value={datos.correo} onChange={e => setDatos({ ...datos, correo: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Teléfono</span>
                <input value={datos.telefono} onChange={e => setDatos({ ...datos, telefono: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-700">Meses de deuda</span>
                <input type="number" min={0} value={datos.meses_deuda} onChange={e => setDatos({ ...datos, meses_deuda: parseInt(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" />
                <span className="text-[11px] text-slate-500">SIGYR: {h.meses_deuda} meses</span></label>
            </div>
          )}

          {modo === 'descartar' && (
            <label className="block"><span className="text-xs font-bold text-red-700">Motivo (obligatorio)</span>
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: inmueble demolido / duplicado de URB…" className="mt-1 w-full border border-red-200 rounded-xl px-3 py-2" /></label>
          )}

          {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800">{error}</div>}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancelar</button>
          {modo === 'asignar' && <button disabled={!condo || guardando} onClick={() => enviar({ accion: 'asignar', condominio: condo.codigo }, `${h.inmueble} agregado a ${condo.nombre}.`)} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50 cursor-pointer">{guardando ? 'Guardando…' : 'Agregar al condominio'}</button>}
          {modo === 'registrar' && <button disabled={guardando || !tarifaSel?.mmv_mes} onClick={() => enviar({ accion: 'registrar', datos }, `${h.inmueble} registrado a nombre de ${datos.nombre}.`)} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50 cursor-pointer">{guardando ? 'Guardando…' : 'Registrar contribuyente'}</button>}
          {modo === 'descartar' && <button disabled={guardando || motivo.trim().length < 5} onClick={() => enviar({ accion: 'descartar', motivo }, `${h.inmueble} descartado.`)} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold disabled:opacity-50 cursor-pointer">{guardando ? 'Guardando…' : 'Descartar'}</button>}
        </div>
      </div>
    </div>
  );
}
