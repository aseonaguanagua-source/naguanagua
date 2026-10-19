'use client';
// Editor de textos en MODO DESARROLLADOR.
// · Aplica en toda la app los textos editados (se reemplaza el texto exacto en la página donde se editó, o en todas).
// · Con DEV activo aparece el botón flotante "✏️ Editar textos": al activarlo, haga clic en cualquier texto
//   (títulos, etiquetas, direcciones, teléfonos, botones…) para cambiarlo. Se guarda para todos los usuarios.
// Nota: los datos que vienen de la base (montos, nombres de contribuyentes) se editan en sus módulos, no aquí.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Textos = Record<string, Record<string, string>>;
const ORIG = '__textoOriginal';

function aplicar(raiz: Node, mapa: Record<string, string>) {
  if (!Object.keys(mapa).length) return;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const t = n as Text & { [ORIG]?: string };
    const p = t.parentElement; if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName) || p.isContentEditable) continue;
    const actual = t.nodeValue || ''; const limpio = actual.trim(); if (!limpio) continue;
    const base = t[ORIG] ?? limpio;
    const nuevo = mapa[base];
    if (nuevo !== undefined && limpio !== nuevo.trim()) { t[ORIG] = base; t.nodeValue = actual.replace(limpio, nuevo); }
  }
  // atributos visibles: placeholder y title
  (raiz as Element).querySelectorAll?.('[placeholder],[title]').forEach(el => {
    for (const a of ['placeholder', 'title']) {
      const v = el.getAttribute(a); if (!v) continue;
      const k = `@${a}:${v}`; const o = (el as any)[`__o_${a}`] ?? v;
      const nuevo = mapa[`@${a}:${o}`];
      if (nuevo !== undefined && v !== nuevo) { (el as any)[`__o_${a}`] = o; el.setAttribute(a, nuevo); }
      void k;
    }
  });
}

export default function TextosEditables() {
  const pathname = usePathname() || '/';
  const [dev, setDev] = useState(false);
  const [activo, setActivo] = useState(false);
  const [textos, setTextos] = useState<Textos>({});
  const textosRef = useRef<Textos>({});
  textosRef.current = textos;

  useEffect(() => { setDev(localStorage.getItem('dev_mode_active') === '1'); }, [pathname]);
  useEffect(() => {
    try { const c = localStorage.getItem('textos_editados'); if (c) setTextos(JSON.parse(c)); } catch {}
    fetch('/api/textos-editables').then(r => (r.ok ? r.json() : null)).then(j => {
      if (j?.textos) { setTextos(j.textos); try { localStorage.setItem('textos_editados', JSON.stringify(j.textos)); } catch {} }
    }).catch(() => {});
  }, []);

  // Aplicar y mantener aplicados (la app re-renderiza y carga datos dinámicamente)
  useEffect(() => {
    const mapa = () => ({ ...(textosRef.current['*'] || {}), ...(textosRef.current[pathname] || {}) });
    aplicar(document.body, mapa());
    let pend = false;
    const obs = new MutationObserver(() => {
      if (pend) return; pend = true;
      requestAnimationFrame(() => { pend = false; obs.disconnect(); aplicar(document.body, mapa()); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [textos, pathname]);

  // Modo edición: clic en un texto → editar
  useEffect(() => {
    if (!activo) return;
    const marcar = (e: MouseEvent) => {
      const el = e.target as HTMLElement; if (el.closest('[data-editor-textos]')) return;
      el.style.outline = '2px dashed #d946ef'; el.style.cursor = 'text';
    };
    const desmarcar = (e: MouseEvent) => { const el = e.target as HTMLElement; el.style.outline = ''; el.style.cursor = ''; };
    const clic = async (e: MouseEvent) => {
      const el = e.target as HTMLElement; if (el.closest('[data-editor-textos]')) return;
      e.preventDefault(); e.stopPropagation();
      // texto propio del elemento (nodo de texto con contenido); si no tiene, revisar placeholder
      const nodo = Array.from(el.childNodes).find(c => c.nodeType === 3 && (c.nodeValue || '').trim()) as (Text & { [ORIG]?: string }) | undefined;
      let original = '', actual = '';
      if (nodo) { actual = (nodo.nodeValue || '').trim(); original = nodo[ORIG] ?? actual; }
      else if (el.getAttribute('placeholder')) { const v = el.getAttribute('placeholder')!; original = `@placeholder:${(el as any).__o_placeholder ?? v}`; actual = v; }
      else { alert('Este elemento no tiene texto propio. Haga clic directamente sobre las letras.'); return; }
      const nuevo = prompt(`Editar texto${original.startsWith('@') ? ' (marcador del campo)' : ''}:\n(Deje vacío para restaurar el original)`, actual);
      if (nuevo === null) return;
      const global = confirm('¿Aplicar este cambio en TODAS las páginas donde aparezca este mismo texto?\n\nAceptar = todas las páginas · Cancelar = solo esta página');
      let usuario = 'dev'; try { usuario = JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || 'dev'; } catch {}
      const r = await fetch('/api/textos-editables', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: '1756762', usuario, ruta: global ? '*' : pathname, original, nuevo: nuevo.trim() ? nuevo : null }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || 'No se pudo guardar'); return; }
      if (!nuevo.trim() && nodo) { nodo.nodeValue = (nodo.nodeValue || '').replace(actual, original); delete nodo[ORIG]; }
      if (!nuevo.trim() && original.startsWith('@placeholder:')) el.setAttribute('placeholder', original.slice(13));
      setTextos(j.textos); try { localStorage.setItem('textos_editados', JSON.stringify(j.textos)); } catch {}
    };
    document.addEventListener('mouseover', marcar, true);
    document.addEventListener('mouseout', desmarcar, true);
    document.addEventListener('click', clic, true);
    return () => {
      document.removeEventListener('mouseover', marcar, true);
      document.removeEventListener('mouseout', desmarcar, true);
      document.removeEventListener('click', clic, true);
    };
  }, [activo, pathname]);

  const [mostrarBoton, setMostrarBoton] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      setMostrarBoton(p.get('editar_textos') === '1');
    }
  }, [pathname]);

  if (!dev || !mostrarBoton) return null;
  const nPagina = Object.keys(textos[pathname] || {}).length, nGlobal = Object.keys(textos['*'] || {}).length;
  return (
    <div data-editor-textos className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-1.5 print:hidden">
      {activo && (
        <div className="max-w-xs text-[11px] bg-fuchsia-950 text-fuchsia-100 border border-fuchsia-600 rounded-lg px-3 py-2 shadow-xl">
          Haga clic en cualquier texto para cambiarlo (vacío = restaurar). Los enlaces y botones no se activan mientras edita.
          <div className="mt-1 text-fuchsia-300">Editados: {nPagina} en esta página · {nGlobal} en todas</div>
        </div>
      )}
      <button onClick={() => setActivo(a => !a)}
        className={`px-3 py-2 rounded-full text-xs font-bold shadow-xl border ${activo ? 'bg-fuchsia-600 text-white border-fuchsia-400' : 'bg-slate-900 text-fuchsia-300 border-fuchsia-700 hover:bg-slate-800'}`}>
        {activo ? '✔ Terminar edición' : '✏️ Editar textos'}
      </button>
    </div>
  );
}
