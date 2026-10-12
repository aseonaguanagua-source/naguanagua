'use client';
// Modo Dios → "Orden del menú": el administrador define el orden de las opciones del menú lateral.
// Se guarda para TODOS los usuarios (system_config.MENU_ORDEN) y queda en auditoría (se puede deshacer).
import { useEffect, useState } from 'react';
import { MENUS, ordenarMenu, type MenuKey, type MenuOrden } from '@/lib/menuItems';

const PASS = '1756762';

export default function OrdenMenu({ aviso }: { aviso: (t: 'ok' | 'err', m: string) => void }) {
  const [menu, setMenu] = useState<MenuKey>('aseo');
  const [orden, setOrden] = useState<MenuOrden>({});
  const [lista, setLista] = useState<string[]>([]);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch('/api/menu-orden').then(r => r.json()).then(j => setOrden(j.orden || {})).catch(() => {});
  }, []);
  useEffect(() => {
    setLista(ordenarMenu(MENUS[menu].items, orden[menu]).map(i => i.href));
  }, [menu, orden]);

  const item = (href: string) => MENUS[menu].items.find(i => i.href === href);
  const mover = (i: number, j: number) => {
    if (j < 0 || j >= lista.length || i === j) return;
    const n = [...lista]; const [x] = n.splice(i, 1); n.splice(j, 0, x); setLista(n);
  };

  const guardar = async (nuevo: MenuOrden) => {
    setGuardando(true);
    try {
      const r = await fetch('/api/menu-orden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: PASS, orden: nuevo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al guardar');
      setOrden(j.orden); localStorage.setItem('menu_orden', JSON.stringify(j.orden));
      aviso('ok', 'Orden del menú guardado para todos los usuarios. Recargue la página para verlo.');
    } catch (e: any) { aviso('err', e.message); } finally { setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(MENUS) as MenuKey[]).map(k => (
          <button key={k} onClick={() => setMenu(k)}
            className={`px-3 py-1.5 rounded text-sm border ${menu === k ? 'bg-amber-500 text-white border-amber-500' : 'hover:bg-slate-50'}`}>
            {MENUS[k].titulo}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Arrastre las opciones o use ▲ ▼ para cambiar el orden. El cambio aplica para todos los usuarios (cada uno sigue viendo solo lo que su permiso le permite).</p>
      <ol className="border rounded divide-y">
        {lista.map((href, i) => {
          const it = item(href); if (!it) return null; const Icon = it.icon;
          return (
            <li key={href} draggable
              onDragStart={() => setArrastrando(i)}
              onDragOver={e => { e.preventDefault(); if (arrastrando !== null && arrastrando !== i) { mover(arrastrando, i); setArrastrando(i); } }}
              onDragEnd={() => setArrastrando(null)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm bg-white cursor-move ${arrastrando === i ? 'bg-amber-50' : ''}`}>
              <span className="w-6 text-right text-slate-400 font-mono text-xs">{i + 1}</span>
              <span className="text-slate-400">⠿</span>
              {Icon && <Icon className="w-4 h-4 text-slate-500" />}
              <span className="flex-1">{it.name}</span>
              <span className="text-[10px] text-slate-400 font-mono hidden md:inline">{href}</span>
              <button className="px-1.5 rounded hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, 0)} title="Al inicio">⤒</button>
              <button className="px-1.5 rounded hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, i - 1)}>▲</button>
              <button className="px-1.5 rounded hover:bg-slate-100 disabled:opacity-30" disabled={i === lista.length - 1} onClick={() => mover(i, i + 1)}>▼</button>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <button disabled={guardando} onClick={() => guardar({ ...orden, [menu]: lista })}
          className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold disabled:opacity-50">💾 Guardar orden</button>
        <button disabled={guardando} onClick={() => { if (confirm('¿Volver al orden original de este menú?')) { const n = { ...orden }; delete n[menu]; guardar(n); } }}
          className="px-4 py-2 rounded border">↺ Orden original</button>
      </div>
    </div>
  );
}
