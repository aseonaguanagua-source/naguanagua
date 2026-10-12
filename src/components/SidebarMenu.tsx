'use client';
// Lista del menú lateral: modo normal (enlaces + menús desplegables) y modo "Ordenar" (arrastrar, ocultar, agrupar).
// · Arrastrar al borde superior/inferior de una opción → la coloca antes/después.
// · Soltar EN EL CENTRO de otra opción → crea un menú desplegable (pide el nombre). Sobre un desplegable → la mete dentro.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { descMenu } from '@/lib/menuManual';
import { claveEntrada, construirEntradas, type Entrada, type MenuItem, type MenuKey, type MenuOrden } from '@/lib/menuItems';

type Zona = 'antes' | 'medio' | 'despues';
type Origen = { key: string; grupo?: string };
const nuevoId = () => Math.random().toString(36).slice(2, 9);

export default function SidebarMenu(props: {
  items: MenuItem[]; menuKey: MenuKey; orden: MenuOrden; devMode: boolean; pathname: string;
  permitido: (it: MenuItem) => boolean;
  editando: boolean; onCerrarEdicion: () => void; onGuardado: (o: MenuOrden) => void;
}) {
  const { items, menuKey, orden, devMode, pathname, permitido, editando } = props;
  const porHref = new Map(items.map(i => [i.href, i] as [string, MenuItem]));
  const ocultos = new Set(orden.ocultos || []);
  const nombreDe = (it: MenuItem, nombres = orden.nombres) => nombres?.[it.href] || it.name;
  const descDe = (it: MenuItem, descs = orden.descs) => descs?.[it.href] || descMenu(it.href);

  // ── estado de edición ──
  const [lista, setLista] = useState<Entrada[]>([]);
  const [editOcultos, setEditOcultos] = useState<string[]>([]);
  const [editNombres, setEditNombres] = useState<Record<string, string>>({});
  const [editDescs, setEditDescs] = useState<Record<string, string>>({});
  const [origen, setOrigen] = useState<Origen | null>(null);
  const [sobre, setSobre] = useState<{ key: string; grupo?: string; zona: Zona } | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (editando) { setLista(construirEntradas(items, orden, menuKey)); setEditOcultos(orden.ocultos || []); setEditNombres({ ...(orden.nombres || {}) }); setEditDescs({ ...(orden.descs || {}) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, menuKey]);

  // ── desplegables abiertos (se recuerda en el navegador) ──
  const [abiertos, setAbiertos] = useState<string[]>([]);
  useEffect(() => { try { setAbiertos(JSON.parse(localStorage.getItem('menu_grupos_abiertos') || '[]')); } catch {} }, []);
  const alternarAbierto = (id: string) => setAbiertos(a => {
    const n = a.includes(id) ? a.filter(x => x !== id) : [...a, id];
    try { localStorage.setItem('menu_grupos_abiertos', JSON.stringify(n)); } catch {}
    return n;
  });

  const zonaDe = (e: React.DragEvent, permiteMedio: boolean): Zona => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (!permiteMedio) return y < 0.5 ? 'antes' : 'despues';
    return y < 0.28 ? 'antes' : y > 0.72 ? 'despues' : 'medio';
  };

  /** Mueve el origen hacia el destino. destino.grupo = soltar sobre una opción que está dentro de un desplegable. */
  const soltar = (destKey: string, zona: Zona, destGrupo?: string) => {
    const src = origen; setOrigen(null); setSobre(null);
    if (!src || src.key === destKey) return;
    const esGrupoSrc = src.key.startsWith('g:');
    let n: Entrada[] = lista.map(e => (e.tipo === 'grupo' ? { ...e, items: [...e.items] } : { ...e }));
    // sacar el origen
    let srcEntrada: Entrada | undefined;
    if (src.grupo) {
      const g = n.find(e => e.tipo === 'grupo' && e.id === src.grupo) as Extract<Entrada, { tipo: 'grupo' }> | undefined;
      if (!g) return; g.items = g.items.filter(h => h !== src.key); srcEntrada = { tipo: 'item', href: src.key };
    } else {
      const i = n.findIndex(e => claveEntrada(e) === src.key); if (i < 0) return;
      srcEntrada = n[i]; n.splice(i, 1);
    }
    if (destGrupo) {
      // dentro de un desplegable (no se permiten desplegables dentro de desplegables)
      if (esGrupoSrc) return;
      const g = n.find(e => e.tipo === 'grupo' && e.id === destGrupo) as Extract<Entrada, { tipo: 'grupo' }> | undefined;
      if (!g) return;
      const j = g.items.indexOf(destKey);
      g.items.splice(j < 0 ? g.items.length : (zona === 'antes' ? j : j + 1), 0, src.key);
    } else {
      const ti = n.findIndex(e => claveEntrada(e) === destKey);
      const dest = n[ti];
      if (zona === 'medio' && !esGrupoSrc && dest) {
        if (dest.tipo === 'grupo') dest.items.push(src.key);
        else {
          const nombre = prompt('Nombre del menú desplegable:', '')?.trim();
          if (!nombre) return; // cancelado: no se cambia nada
          n[ti] = { tipo: 'grupo', id: nuevoId(), nombre, items: [dest.href, src.key] };
          setAbiertos(a => [...a, (n[ti] as any).id]);
        }
      } else {
        n.splice(ti < 0 ? n.length : (zona === 'antes' ? ti : ti + 1), 0, srcEntrada!);
      }
    }
    n = n.filter(e => e.tipo === 'item' || e.items.length > 0);
    setLista(n);
  };

  const moverTop = (i: number, d: number) => setLista(l => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; const [x] = n.splice(i, 1); n.splice(j, 0, x); return n; });
  const moverHijo = (gid: string, i: number, d: number) => setLista(l => l.map(e => {
    if (e.tipo !== 'grupo' || e.id !== gid) return e; const j = i + d; if (j < 0 || j >= e.items.length) return e;
    const it = [...e.items]; const [x] = it.splice(i, 1); it.splice(j, 0, x); return { ...e, items: it };
  }));
  const sacarDeGrupo = (gid: string, href: string) => setLista(l => {
    const gi = l.findIndex(e => e.tipo === 'grupo' && e.id === gid); if (gi < 0) return l;
    const n = l.map(e => (e.tipo === 'grupo' && e.id === gid ? { ...e, items: e.items.filter(h => h !== href) } : e));
    n.splice(gi + 1, 0, { tipo: 'item', href });
    return n.filter(e => e.tipo === 'item' || e.items.length > 0);
  });
  const renombrar = (gid: string) => setLista(l => l.map(e => {
    if (e.tipo !== 'grupo' || e.id !== gid) return e;
    const nombre = prompt('Nuevo nombre del menú desplegable:', e.nombre)?.trim();
    return nombre ? { ...e, nombre } : e;
  }));
  const disolver = (gid: string) => setLista(l => {
    const gi = l.findIndex(e => e.tipo === 'grupo' && e.id === gid); if (gi < 0) return l;
    const g = l[gi] as Extract<Entrada, { tipo: 'grupo' }>;
    const n = [...l]; n.splice(gi, 1, ...g.items.map(h => ({ tipo: 'item' as const, href: h }))); return n;
  });
  const renombrarItem = (it: MenuItem) => {
    const n = prompt(`Nombre de la opción (original: "${it.name}"). Déjelo vacío para volver al original:`, nombreDe(it, editNombres));
    if (n === null) return;
    const d = prompt('Descripción breve (se muestra al dejar el cursor encima). Vacío = descripción original:', descDe(it, editDescs));
    setEditNombres(o => { const r = { ...o }; if (n.trim() && n.trim() !== it.name) r[it.href] = n.trim(); else delete r[it.href]; return r; });
    if (d !== null) setEditDescs(o => { const r = { ...o }; if (d.trim() && d.trim() !== descMenu(it.href)) r[it.href] = d.trim(); else delete r[it.href]; return r; });
  };
  const alternarOculto = (href: string) => setEditOcultos(o => (o.includes(href) ? o.filter(h => h !== href) : [...o, href]));

  const guardar = async (restablecer = false) => {
    setGuardando(true);
    try {
      const nuevo: MenuOrden = { ...orden };
      const otrosGrupos = (orden.grupos || []).filter(g => g.menu !== menuKey);
      const deEsteMenu = new Set(items.map(i => i.href));
      if (restablecer) {
        delete nuevo[menuKey]; nuevo.grupos = otrosGrupos;
        nuevo.ocultos = (orden.ocultos || []).filter(h => !deEsteMenu.has(h));
        nuevo.nombres = Object.fromEntries(Object.entries(orden.nombres || {}).filter(([h]) => !deEsteMenu.has(h)));
        nuevo.descs = Object.fromEntries(Object.entries(orden.descs || {}).filter(([h]) => !deEsteMenu.has(h)));
      } else {
        nuevo.nombres = editNombres; nuevo.descs = editDescs;
        nuevo[menuKey] = lista.map(claveEntrada);
        nuevo.grupos = [...otrosGrupos, ...lista.filter(e => e.tipo === 'grupo').map(e => ({ id: (e as any).id, nombre: (e as any).nombre, menu: menuKey, items: (e as any).items }))];
        nuevo.ocultos = [...(orden.ocultos || []).filter(h => !deEsteMenu.has(h)), ...editOcultos.filter(h => deEsteMenu.has(h))];
      }
      let usuario = 'dev';
      try { usuario = JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || 'dev'; } catch {}
      const r = await fetch('/api/menu-orden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: '1756762', usuario, orden: nuevo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar');
      localStorage.setItem('menu_orden', JSON.stringify(j.orden));
      props.onGuardado(j.orden); props.onCerrarEdicion();
    } catch (e: any) { alert(e.message); } finally { setGuardando(false); }
  };

  // ───────────────────────── MODO ORDENAR ─────────────────────────
  if (editando) {
    const marca = (key: string, grupo?: string) => (sobre && sobre.key === key && sobre.grupo === grupo
      ? sobre.zona === 'medio' ? 'ring-2 ring-fuchsia-400 bg-fuchsia-800/40' : sobre.zona === 'antes' ? 'border-t-2 border-fuchsia-400' : 'border-b-2 border-fuchsia-400'
      : '');
    const filaItem = (href: string, opts: { i: number; total: number; grupo?: string }) => {
      const it = porHref.get(href); if (!it) return null; const Icon = it.icon;
      const oculto = editOcultos.includes(href);
      return (
        <li key={href} draggable
          onDragStart={e => { e.stopPropagation(); setOrigen({ key: href, grupo: opts.grupo }); }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSobre({ key: href, grupo: opts.grupo, zona: zonaDe(e, !opts.grupo) }); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); soltar(href, zonaDe(e, !opts.grupo), opts.grupo); }}
          onDragEnd={() => { setOrigen(null); setSobre(null); }}
          className={`flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded cursor-move select-none hover:bg-white/5 ${opts.grupo ? 'ml-5' : ''} ${oculto ? 'opacity-40 grayscale' : ''} ${marca(href, opts.grupo)}`}>
          <span className="text-slate-500 text-xs">⠿</span>
          <Icon className="w-4 h-4 shrink-0" />
          <span title={descDe(it, editDescs)} className={`text-xs font-medium flex-1 truncate ${oculto ? 'line-through' : ''} ${editNombres[href] ? 'italic text-[#c8e64c]' : ''}`}>{nombreDe(it, editNombres)}</span>
          <button onClick={() => renombrarItem(it)} title="Cambiar nombre y descripción" className="px-0.5 text-xs">✎</button>
          <button onClick={() => alternarOculto(href)} title={oculto ? 'Mostrar en el menú' : 'Ocultar del menú'} className="px-0.5 text-xs">{oculto ? '🚫' : '👁'}</button>
          {opts.grupo && <button onClick={() => sacarDeGrupo(opts.grupo!, href)} title="Sacar del menú desplegable" className="px-0.5 text-xs hover:text-[#c8e64c]">⇱</button>}
          <button onClick={() => (opts.grupo ? moverHijo(opts.grupo, opts.i, -1) : moverTop(opts.i, -1))} disabled={opts.i === 0} className="px-0.5 text-xs hover:text-[#c8e64c] disabled:opacity-20">▲</button>
          <button onClick={() => (opts.grupo ? moverHijo(opts.grupo, opts.i, 1) : moverTop(opts.i, 1))} disabled={opts.i === opts.total - 1} className="px-0.5 text-xs hover:text-[#c8e64c] disabled:opacity-20">▼</button>
        </li>
      );
    };
    return (
      <>
        <li className="px-3 pb-2 text-[10.5px] text-fuchsia-200 leading-snug">
          Arrastre al borde de otra opción para ordenar. <b>Suéltela en el centro de otra</b> para crear un <b>menú desplegable</b> (le pedirá el nombre). ✎ renombra. 👁 oculta.
          <div className="flex gap-1.5 mt-2">
            <button disabled={guardando} onClick={() => guardar()} className="flex-1 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50">{guardando ? 'Guardando…' : '💾 Guardar'}</button>
            <button disabled={guardando} onClick={props.onCerrarEdicion} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">Cancelar</button>
            <button disabled={guardando} onClick={() => { if (confirm('¿Volver al orden original de este menú (sin desplegables ni ocultos)?')) guardar(true); }} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" title="Orden original">↺</button>
          </div>
        </li>
        {lista.map((e, i) => e.tipo === 'item' ? filaItem(e.href, { i, total: lista.length }) : (
          <li key={e.id}>
            <div draggable
              onDragStart={ev => { ev.stopPropagation(); setOrigen({ key: `g:${e.id}` }); }}
              onDragOver={ev => { ev.preventDefault(); ev.stopPropagation(); setSobre({ key: `g:${e.id}`, zona: zonaDe(ev, true) }); }}
              onDrop={ev => { ev.preventDefault(); ev.stopPropagation(); soltar(`g:${e.id}`, zonaDe(ev, true)); }}
              onDragEnd={() => { setOrigen(null); setSobre(null); }}
              className={`flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded cursor-move select-none bg-white/5 hover:bg-white/10 ${marca(`g:${e.id}`)}`}>
              <span className="text-slate-500 text-xs">⠿</span>
              <FolderOpen className="w-4 h-4 shrink-0 text-[#c8e64c]" />
              <span className="text-xs font-bold flex-1 truncate text-[#c8e64c]">{e.nombre}</span>
              <button onClick={() => renombrar(e.id)} title="Cambiar nombre" className="px-0.5 text-xs">✎</button>
              <button onClick={() => { if (confirm(`¿Deshacer el menú desplegable "${e.nombre}"? Sus opciones quedan sueltas.`)) disolver(e.id); }} title="Deshacer desplegable" className="px-0.5 text-xs">✕</button>
              <button onClick={() => moverTop(i, -1)} disabled={i === 0} className="px-0.5 text-xs hover:text-[#c8e64c] disabled:opacity-20">▲</button>
              <button onClick={() => moverTop(i, 1)} disabled={i === lista.length - 1} className="px-0.5 text-xs hover:text-[#c8e64c] disabled:opacity-20">▼</button>
            </div>
            <ul className="space-y-0.5 mt-0.5">{e.items.map((h, k) => filaItem(h, { i: k, total: e.items.length, grupo: e.id }))}</ul>
          </li>
        ))}
      </>
    );
  }

  // ───────────────────────── MODO NORMAL ─────────────────────────
  const visible = (it: MenuItem) => permitido(it) && (devMode || !ocultos.has(it.href));
  const enlace = (it: MenuItem, sub = false) => {
    const Icon = it.icon;
    if (ocultos.has(it.href)) return (
      <li key={it.href} title={`Oculto para los usuarios (solo visible en modo DEV). ${descDe(it)}`}>
        <span className={`flex items-center gap-3 ${sub ? 'pl-9 pr-4' : 'px-4'} py-2 text-slate-600 cursor-not-allowed select-none opacity-60`}>
          <Icon className="w-5 h-5" /><span className="text-sm font-medium line-through">{nombreDe(it)}</span>
        </span>
      </li>
    );
    return (
      <li key={it.href}>
        <Link href={it.href} title={descDe(it)}
          className={`flex items-center gap-3 ${sub ? 'pl-9 pr-4' : 'px-4'} py-2 hover:bg-white/5 hover:text-[#c8e64c] transition-colors ${pathname === it.href ? 'bg-white/10 text-[#c8e64c] border-l-4 border-[#c8e64c]' : ''}`}>
          <Icon className={sub ? 'w-4 h-4' : 'w-5 h-5'} /><span className="text-sm font-medium">{nombreDe(it)}</span>
        </Link>
      </li>
    );
  };
  return (
    <>
      {construirEntradas(items, orden, menuKey).map(e => {
        if (e.tipo === 'item') { const it = porHref.get(e.href); return it && visible(it) ? enlace(it) : null; }
        const hijos = e.items.map(h => porHref.get(h)).filter((x): x is MenuItem => !!x && visible(x));
        if (!hijos.length) return null;
        const activo = hijos.some(h => h.href === pathname);
        const abierto = activo || abiertos.includes(e.id);
        return (
          <li key={e.id}>
            <button onClick={() => alternarAbierto(e.id)} title={`Menú: ${hijos.map(h => nombreDe(h)).join(', ')}`}
              className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 hover:text-[#c8e64c] transition-colors ${activo ? 'text-[#c8e64c]' : ''}`}>
              <FolderOpen className="w-5 h-5" />
              <span className="text-sm font-semibold flex-1 text-left">{e.nombre}</span>
              {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {abierto && <ul className="space-y-0.5">{hijos.map(h => enlace(h, true))}</ul>}
          </li>
        );
      })}
    </>
  );
}
