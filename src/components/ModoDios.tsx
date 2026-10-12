'use client';
// MODO DIOS: con el modo desarrollador activo permite editar CUALQUIER dato del sistema.
// · Alt + clic sobre cualquier código (URB…), cédula o RIF de la pantalla → abre su ficha editable.
// · Pestaña "Tablas": todas las tablas de la base de datos, edición celda por celda (doble clic).
// · Cada campo tiene su ayuda. Todo cambio se guarda en la BD, queda en auditoría y se puede deshacer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AYUDA_TABLAS, ayudaCampo } from '@/lib/dios/ayudas';
import OrdenMenu from '@/components/dios/OrdenMenu';

const PASS = '1756762';
type Col = { name: string; type: string; format: string; pk: boolean; required: boolean; description?: string; enum?: string[] };
type Ficha = { table: string; id: any; row: any; cols: Col[]; pk: string; nuevo?: boolean };

async function api(action: string, extra: any = {}) {
  const r = await fetch('/api/admin/dios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, pass: PASS, ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.preview) throw new Error(j.error || `Error ${r.status}`);
  return j;
}
const RX_COD = /\b(?:URB|COM|AURI|IND|INS|ASE|CON)[A-Z]?\d{4,8}\b/i;
const RX_ID = /\b[VJEGP]-?\d{5,10}(?:-?\d)?\b/i;
const toStr = (v: any) => v == null ? '' : typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v);
function parseVal(c: Col, s: string): any {
  if (s === '' && !c.required) return null;
  if (c.type === 'boolean') return s === 'true';
  if (c.type === 'integer') return s === '' ? null : parseInt(s, 10);
  if (c.type === 'number') return s === '' ? null : Number(s.replace(',', '.'));
  if (c.format.startsWith('json')) return s === '' ? null : JSON.parse(s);
  return s;
}

export default function ModoDios() {
  const [activo, setActivo] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState<'buscar' | 'tablas' | 'historial' | 'menu'>('buscar');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [schema, setSchema] = useState<Record<string, Col[]>>({});
  // búsqueda
  const [q, setQ] = useState(''); const [res, setRes] = useState<any[]>([]); const [buscando, setBuscando] = useState(false);
  // ficha
  const [ficha, setFicha] = useState<Ficha | null>(null); const [edit, setEdit] = useState<Record<string, string>>({});
  const [filtroCampo, setFiltroCampo] = useState('');
  // tablas
  const [tabla, setTabla] = useState('inmuebles'); const [tq, setTq] = useState(''); const [page, setPage] = useState(0);
  const [grid, setGrid] = useState<{ rows: any[]; count: number; pk: string; cols: Col[] } | null>(null);
  const [celda, setCelda] = useState<{ r: number; c: string; v: string } | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => { setActivo(localStorage.getItem('dev_mode_active') === '1'); }, []);
  const aviso = (t: 'ok' | 'err', m: string) => { setMsg({ t, m }); setTimeout(() => setMsg(null), 6000); };

  const cargarSchema = useCallback(async () => {
    if (Object.keys(schema).length) return schema;
    const j = await api('schema'); setSchema(j.tables); return j.tables;
  }, [schema]);

  const buscar = useCallback(async (texto: string) => {
    setQ(texto); if (texto.trim().length < 2) { setRes([]); return; }
    setBuscando(true);
    try { const j = await api('buscarGlobal', { q: texto }); setRes(j.results); } catch (e: any) { aviso('err', e.message); } finally { setBuscando(false); }
  }, []);

  const abrirFicha = useCallback(async (table: string, id: any) => {
    try { const j = await api('leer', { table, id }); setFicha({ table, id, row: j.row, cols: j.cols, pk: j.pk }); setEdit({}); setTab('buscar'); setAbierto(true); }
    catch (e: any) { aviso('err', e.message); }
  }, []);

  // Alt + clic en cualquier parte de la pantalla
  useEffect(() => {
    if (!activo) return;
    const down = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltHeld(true); if (e.key === 'Escape') setCelda(null); };
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltHeld(false); };
    const click = (e: MouseEvent) => {
      if (!e.altKey) return;
      const el = e.target as HTMLElement; if (el.closest('#modo-dios-panel')) return;
      e.preventDefault(); e.stopPropagation();
      const sel = window.getSelection()?.toString().trim();
      let txt = sel || ''; let n: HTMLElement | null = el;
      for (let i = 0; !txt && n && i < 4; i++, n = n.parentElement) { const t = n.innerText || ''; if (RX_COD.test(t) || RX_ID.test(t)) txt = t; }
      const token = (txt.match(RX_COD) || txt.match(RX_ID) || [])[0] || sel || (el.innerText || '').trim().slice(0, 60);
      setAbierto(true); setTab('buscar'); setFicha(null); buscar(token);
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('click', click, true);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('click', click, true); };
  }, [activo, buscar]);

  // ── Ficha: guardar
  const cambios = useMemo(() => {
    if (!ficha) return {} as Record<string, any>;
    const out: Record<string, any> = {};
    for (const [k, s] of Object.entries(edit)) {
      const c = ficha.cols.find(x => x.name === k)!; if (!c) continue;
      if (s !== toStr(ficha.row?.[k])) out[k] = s;
    }
    return out;
  }, [edit, ficha]);

  const guardarFicha = async () => {
    if (!ficha) return;
    try {
      const datos: any = {};
      for (const [k, s] of Object.entries(cambios)) datos[k] = parseVal(ficha.cols.find(c => c.name === k)!, s as string);
      if (ficha.nuevo) {
        if (!confirm(`¿Crear un registro nuevo en ${ficha.table}?`)) return;
        const j = await api('crear', { table: ficha.table, fila: datos });
        setFicha({ ...ficha, nuevo: false, row: j.row, id: j.row?.[ficha.pk] }); setEdit({}); aviso('ok', 'Registro creado y guardado en la base de datos.'); return;
      }
      const lista = Object.entries(datos).map(([k, v]) => `• ${k}: "${toStr(ficha.row?.[k])}" → "${toStr(v)}"`).join('\n');
      if (!confirm(`Se guardarán estos cambios en la base de datos:\n\n${lista}\n\n¿Confirmar?`)) return;
      const j = await api('guardar', { table: ficha.table, id: ficha.id, cambios: datos });
      setFicha({ ...ficha, row: j.row }); setEdit({});
      aviso('ok', `Guardado (auditoría #${j.auditoria ?? '—'}). Recargue la página para verlo en pantalla.`);
    } catch (e: any) { aviso('err', e.message); }
  };
  const eliminarFicha = async () => {
    if (!ficha || ficha.nuevo) return;
    if (prompt(`Escriba ELIMINAR para borrar definitivamente este registro de ${ficha.table}.\n(Queda respaldado en auditoría y se puede deshacer.)`) !== 'ELIMINAR') return;
    try { await api('eliminar', { table: ficha.table, id: ficha.id }); setFicha(null); aviso('ok', 'Registro eliminado (respaldado en auditoría).'); } catch (e: any) { aviso('err', e.message); }
  };
  const cascada = async (tipo: 'codigo' | 'identidad', viejo: string) => {
    const nuevo = prompt(tipo === 'codigo' ? `Nuevo CÓDIGO para ${viejo}:` : `Nueva CÉDULA/RIF para ${viejo} (ej. V-12345678):`, viejo);
    if (!nuevo || nuevo.trim() === viejo) return;
    try {
      const p = await api('cascada', { tipo, viejo, nuevo });
      if (p.error) { aviso('err', p.error); return; }
      const lista = (p.objetivos || []).map((o: any) => `• ${o.table}.${o.col}: ${o.n} registro(s)`).join('\n') || '(no aparece en ninguna tabla)';
      if (!confirm(`Se cambiará "${viejo}" → "${nuevo.toUpperCase()}" en:\n\n${lista}\n\n¿Confirmar?`)) return;
      const j = await api('cascada', { tipo, viejo, nuevo, confirmar: true });
      const errs = j.hechos.filter((h: any) => h.error);
      aviso(errs.length ? 'err' : 'ok', errs.length ? `Con errores: ${errs.map((h: any) => `${h.table}: ${h.error}`).join('; ')}` : `Cambiado en ${j.hechos.length} tabla(s). Auditoría #${j.auditoria}.`);
      if (ficha) abrirFicha(ficha.table, ficha.id);
    } catch (e: any) { aviso('err', e.message); }
  };
  const nuevaFila = async (t: string) => {
    const s = await cargarSchema(); const cols: Col[] = s[t] || [];
    setFicha({ table: t, id: null, row: {}, cols, pk: cols.find(c => c.pk)?.name || 'id', nuevo: true }); setEdit({}); setTab('buscar');
  };

  // ── Tablas
  const cargarGrid = useCallback(async (t = tabla, p = page, texto = tq) => {
    try { const j = await api('listar', { table: t, page: p, q: texto, size: 50 }); setGrid(j); } catch (e: any) { aviso('err', e.message); setGrid(null); }
  }, [tabla, page, tq]);
  useEffect(() => { if (abierto && tab === 'tablas') { cargarSchema(); cargarGrid(); } }, [abierto, tab, tabla, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardarCelda = async () => {
    if (!celda || !grid) return;
    const row = grid.rows[celda.r]; const c = grid.cols.find(x => x.name === celda.c)!;
    if (celda.v === toStr(row[celda.c])) { setCelda(null); return; }
    try {
      const v = parseVal(c, celda.v);
      await api('guardar', { table: tabla, id: row[grid.pk], cambios: { [celda.c]: v } });
      const rows = [...grid.rows]; rows[celda.r] = { ...row, [celda.c]: v }; setGrid({ ...grid, rows }); setCelda(null);
      aviso('ok', `${tabla}.${celda.c} guardado.`);
    } catch (e: any) { aviso('err', e.message); }
  };
  useEffect(() => { if (abierto && tab === 'historial') api('historial').then(j => setHist(j.rows || [])).catch(e => aviso('err', e.message)); }, [abierto, tab]);

  if (!activo) return null;

  const input = (c: Col, val: string, on: (s: string) => void, compacto = false) => {
    const cls = `w-full border rounded px-2 ${compacto ? 'py-0.5 text-xs' : 'py-1.5 text-sm'} focus:outline-none focus:ring-2 focus:ring-amber-400`;
    if (c.type === 'boolean') return <select className={cls} value={val} onChange={e => on(e.target.value)}><option value="">(vacío)</option><option value="true">Sí</option><option value="false">No</option></select>;
    if (c.enum) return <select className={cls} value={val} onChange={e => on(e.target.value)}><option value="">(vacío)</option>{c.enum.map(x => <option key={x}>{x}</option>)}</select>;
    if (c.format.startsWith('json') || val.length > 80) return <textarea className={`${cls} font-mono`} rows={compacto ? 2 : Math.min(10, Math.max(2, val.split('\n').length))} value={val} onChange={e => on(e.target.value)} />;
    const type = c.format === 'date' ? 'date' : c.type === 'number' || c.type === 'integer' ? 'text' : 'text';
    return <input className={cls} type={type} value={val} onChange={e => on(e.target.value)} onKeyDown={e => { if (compacto && e.key === 'Enter') guardarCelda(); }} autoFocus={compacto} />;
  };

  return (
    <>
      {altHeld && <style>{`main *:hover{outline:2px dashed #f59e0b !important;cursor:help !important}`}</style>}
      <button onClick={() => setAbierto(a => !a)} title="Modo Dios: Alt + clic sobre cualquier código o cédula para editarlo"
        className="fixed bottom-4 left-4 z-[9998] bg-gradient-to-r from-amber-500 to-red-600 text-white font-bold px-4 py-2 rounded-full shadow-2xl hover:scale-105 transition">
        ⚡ MODO DIOS
      </button>
      {msg && <div className={`fixed top-4 right-4 z-[10000] max-w-md px-4 py-3 rounded-lg shadow-xl text-sm text-white whitespace-pre-line ${msg.t === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`}>{msg.m}</div>}
      {abierto && (
        <div id="modo-dios-panel" className="fixed top-0 right-0 h-screen w-[min(900px,95vw)] z-[9999] bg-white shadow-2xl border-l-4 border-amber-500 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <span className="text-lg font-bold">⚡ Modo Dios</span>
            <span className="text-xs text-amber-300 ml-2">Alt + clic en cualquier código/cédula de la pantalla para editarlo</span>
            <button className="ml-auto px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-sm" onClick={() => window.location.reload()}>↻ Recargar página</button>
            <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" onClick={() => setAbierto(false)}>✕</button>
          </div>
          <div className="flex border-b text-sm">
            {([['buscar', '🔎 Buscar y editar'], ['tablas', '🗂 Todas las tablas'], ['menu', '☰ Orden del menú'], ['historial', '🕘 Historial / deshacer']] as const).map(([k, l]) =>
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 ${tab === k ? 'border-b-2 border-amber-500 font-semibold text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'buscar' && !ficha && (
              <div>
                <input autoFocus className="w-full border-2 border-amber-300 rounded-lg px-3 py-2" placeholder="Código, cédula/RIF o nombre (contribuyentes, condominios, locales)…" value={q} onChange={e => buscar(e.target.value)} />
                <p className="text-xs text-slate-500 mt-1">💡 Ayuda: también puede mantener <b>Alt</b> y hacer clic sobre cualquier dato en la pantalla. Para otras tablas (pagos, facturas, usuarios…) use “Todas las tablas”.</p>
                {buscando && <p className="text-sm mt-3 text-slate-500">Buscando…</p>}
                <div className="mt-3 divide-y border rounded">
                  {res.map((r, i) => (
                    <button key={i} onClick={() => abrirFicha(r.table, r.id)} className="w-full text-left px-3 py-2 hover:bg-amber-50">
                      <div className="font-medium text-sm">{r.titulo}</div><div className="text-xs text-slate-500">{r.sub}</div>
                    </button>))}
                  {!buscando && q.length >= 2 && !res.length && <p className="p-3 text-sm text-slate-500">Sin resultados.</p>}
                </div>
              </div>
            )}
            {tab === 'buscar' && ficha && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <button className="text-sm text-slate-600 hover:underline" onClick={() => setFicha(null)}>← Volver</button>
                  <h3 className="font-bold">{ficha.nuevo ? 'Nuevo registro' : 'Editando'} · <span className="text-amber-700">{ficha.table}</span></h3>
                </div>
                {AYUDA_TABLAS[ficha.table] && <p className="text-xs bg-amber-50 border border-amber-200 rounded p-2 mb-3">💡 {AYUDA_TABLAS[ficha.table]}</p>}
                {!ficha.nuevo && (ficha.table === 'inmuebles' || ficha.table === 'condominios' || ficha.table === 'condominio_unidades') && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button onClick={() => cascada('codigo', ficha.row?.inmueble || ficha.row?.codigo)} className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">✎ Cambiar código en todo el sistema</button>
                    {ficha.row?.identidad && <button onClick={() => cascada('identidad', ficha.row.identidad)} className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">✎ Cambiar cédula/RIF en todo el sistema</button>}
                  </div>)}
                <input className="w-full border rounded px-2 py-1 text-sm mb-3" placeholder="Filtrar campos…" value={filtroCampo} onChange={e => setFiltroCampo(e.target.value)} />
                <div className="space-y-3">
                  {ficha.cols.filter(c => !filtroCampo || c.name.includes(filtroCampo.toLowerCase())).map(c => {
                    const val = edit[c.name] ?? toStr(ficha.row?.[c.name]);
                    const mod = c.name in cambios;
                    return (
                      <div key={c.name} className={`rounded p-2 ${mod ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
                        <label className="flex items-baseline gap-2 text-xs font-semibold text-slate-700">
                          {c.name}{c.pk && <span className="text-[10px] bg-slate-200 px-1 rounded">clave</span>}{c.required && <span className="text-red-500">*</span>}
                          <span className="font-normal text-slate-400">{c.format || c.type}</span>
                        </label>
                        {c.pk && !ficha.nuevo ? <div className="text-sm font-mono text-slate-500 py-1">{val}</div> : input(c, val, s => setEdit(e => ({ ...e, [c.name]: s })))}
                        <p className="text-[11px] text-slate-500 mt-0.5">💡 {c.description || ayudaCampo(ficha.table, c.name, c.type, c.format)}</p>
                      </div>);
                  })}
                </div>
                <div className="sticky bottom-0 bg-white pt-3 mt-3 border-t flex gap-2">
                  <button disabled={!Object.keys(cambios).length} onClick={guardarFicha} className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold disabled:opacity-40">💾 Guardar {Object.keys(cambios).length ? `(${Object.keys(cambios).length})` : ''}</button>
                  <button disabled={!Object.keys(cambios).length} onClick={() => setEdit({})} className="px-4 py-2 rounded border disabled:opacity-40">Descartar</button>
                  {!ficha.nuevo && <button onClick={eliminarFicha} className="ml-auto px-4 py-2 rounded bg-red-600 text-white">🗑 Eliminar</button>}
                </div>
              </div>
            )}
            {tab === 'tablas' && (
              <div>
                <div className="flex flex-wrap gap-2 mb-2">
                  <select className="border rounded px-2 py-1 text-sm" value={tabla} onChange={e => { setTabla(e.target.value); setPage(0); setTq(''); }}>
                    {Object.keys(schema).sort().map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="Buscar en la tabla (Enter)…" value={tq} onChange={e => setTq(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); cargarGrid(tabla, 0, tq); } }} />
                  <button className="px-3 py-1 text-sm rounded bg-emerald-600 text-white" onClick={() => nuevaFila(tabla)}>＋ Nueva fila</button>
                </div>
                <p className="text-xs text-slate-500 mb-2">💡 {AYUDA_TABLAS[tabla] || `Tabla ${tabla}.`} Doble clic en una celda para editarla · Enter guarda · Esc cancela · ✎ abre la ficha completa con ayudas.</p>
                {grid && (
                  <>
                    <div className="overflow-auto border rounded max-h-[70vh]">
                      <table className="text-xs min-w-full">
                        <thead className="bg-slate-100 sticky top-0"><tr><th className="px-1"></th>{grid.cols.map(c => <th key={c.name} title={ayudaCampo(tabla, c.name, c.type, c.format)} className="px-2 py-1 text-left whitespace-nowrap">{c.name}</th>)}</tr></thead>
                        <tbody>
                          {grid.rows.map((row, ri) => (
                            <tr key={ri} className="border-t hover:bg-amber-50/40">
                              <td className="px-1"><button title="Abrir ficha" onClick={() => abrirFicha(tabla, row[grid.pk])}>✎</button></td>
                              {grid.cols.map(c => (
                                <td key={c.name} className="px-2 py-0.5 max-w-[240px] align-top" onDoubleClick={() => !c.pk && setCelda({ r: ri, c: c.name, v: toStr(row[c.name]) })}>
                                  {celda && celda.r === ri && celda.c === c.name
                                    ? <div className="min-w-[160px]">{input(c, celda.v, s => setCelda({ ...celda, v: s }), true)}<div className="flex gap-1 mt-0.5"><button className="text-emerald-700" onClick={guardarCelda}>✔ Guardar</button><button className="text-slate-500" onClick={() => setCelda(null)}>✕</button></div></div>
                                    : <span className="block truncate" title={toStr(row[c.name])}>{toStr(row[c.name])}</span>}
                                </td>))}
                            </tr>))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm">
                      <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">←</button>
                      <span>Página {page + 1} de {Math.max(1, Math.ceil((grid.count || 0) / 50))} · {grid.count} registros</span>
                      <button disabled={(page + 1) * 50 >= (grid.count || 0)} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">→</button>
                    </div>
                  </>)}
              </div>
            )}
            {tab === 'menu' && <OrdenMenu aviso={aviso} />}
            {tab === 'historial' && (
              <div className="divide-y border rounded text-sm">
                {hist.map(h => (
                  <div key={h.id} className="p-2 flex gap-2 items-start">
                    <div className="flex-1">
                      <div className="font-medium">{h.accion.replace('MODO DIOS: ', '')}</div>
                      <div className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString('es-VE')} · {h.usuario}</div>
                      {h.detalles?.despues && <pre className="text-[11px] bg-slate-50 p-1 mt-1 overflow-x-auto max-h-24">{JSON.stringify({ antes: h.detalles.antes, despues: h.detalles.despues })}</pre>}
                    </div>
                    {!h.detalles?.deshace && <button className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50" onClick={async () => {
                      if (!confirm('¿Deshacer este cambio (volver al valor anterior)?')) return;
                      try { await api('deshacer', { auditoriaId: h.id }); aviso('ok', 'Cambio deshecho.'); const j = await api('historial'); setHist(j.rows || []); } catch (e: any) { aviso('err', e.message); }
                    }}>↶ Deshacer</button>}
                  </div>))}
                {!hist.length && <p className="p-3 text-slate-500">Sin cambios registrados todavía.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
