'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Building2, RefreshCw, AlertTriangle, Wallet, CalendarClock, Layers, Settings, Search,
  ChevronDown, ChevronRight, Save, X, History, Users, Download, Building, Wallet as WalletIcon, Plus, Pencil, FileText, Ban, Trash2, StickyNote, Award, Sliders, CreditCard, Receipt, ExternalLink, Handshake, LogOut
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import EditorUnidad from './EditorUnidad';
import ModalAjusteMeses from './ModalAjusteMeses';
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
  const [tab, setTab] = useState<'deuda' | 'unidades' | 'movimientos' | 'pagos'>('deuda');
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
  const [modalNotas, setModalNotas] = useState(false);
  const [notaCondominio, setNotaCondominio] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [ajusteMesesTarget, setAjusteMesesTarget] = useState<{ unidad: any; renglon: any } | null>(null);
  const [conveniosUnidades, setConveniosUnidades] = useState<Record<string, any>>({});
  const [descargandoExcel, setDescargandoExcel] = useState(false);

  const handleGuardarNota = async () => {
    if (!c?.codigo) return;
    setGuardandoNota(true);
    try {
      const nuevaNota = notaCondominio.trim() || null;
      const res = await fetch('/api/admin/condominios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: c.codigo,
          cambios: { notas: nuevaNota },
          motivo: 'Nota actualizada desde Ficha de Condominio',
          usuario: usuarioActual() || 'Operador',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la nota');
      setModalNotas(false);
      await cargar();
    } catch (e: any) {
      alert('Error al guardar nota: ' + e.message);
    } finally {
      setGuardandoNota(false);
    }
  };

  const cargar = async () => {
    setCargando(true); setError('');
    try {
      const r = await fetch(`/api/admin/condominios?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo cargar');
      setD(j);

      // Cargar convenios activos para detectar unidades con convenio
      try {
        const { data: convs } = await supabase
          .from('convenios_pago')
          .select('id, numero, identidad, monto_total, cuotas, estado')
          .neq('estado', 'Anulado');
        const cMap: Record<string, any> = {};
        (convs || []).forEach(cv => {
          if (cv.identidad) {
            const clean = cv.identidad.replace(/[\s-]/g, '').toUpperCase();
            cMap[clean] = cv;
            const soloNum = clean.replace(/\D/g, '');
            if (soloNum) cMap[soloNum] = cv;
          }
        });
        setConveniosUnidades(cMap);
      } catch (_) {}
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
    const us: any[] = (d?.unidades || []).filter((u: any) => u.estado !== 'Eliminada' && u.estado !== 'Inactiva');
    const hijos = new Map<string, any[]>();
    
    // Relacionar hijos con sus padres explícitos
    us.forEach(u => { 
      if (u.padre_unidad_id) { 
        if (!hijos.has(u.padre_unidad_id)) hijos.set(u.padre_unidad_id, []); 
        hijos.get(u.padre_unidad_id)!.push(u); 
      } 
    });
    
    const ids = new Set(us.map(u => u.id));
    const byRif = new Map<string, any[]>();
    
    // Helper para detectar RIF genérico/placeholder (evitar agrupar locales diferentes con 00000000 o N/A)
    const esRifGenerico = (idStr: string) => {
      const clean = String(idStr || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const digitsOnly = clean.replace(/^[VEJPG]/, '');
      if (!clean || clean === 'NA' || clean === 'UNDEFINED' || clean === 'NULL') return true;
      if (/^0+$/.test(digitsOnly) || /^0+$/.test(clean)) return true;
      return false;
    };

    // Agrupar unidades sin padre que comparten el mismo RIF real (ej: varias actividades de un mismo contribuyente en Sambil)
    us.forEach(u => {
      if (!u.padre_unidad_id || !ids.has(u.padre_unidad_id)) {
        if (u.identidad && u.identidad.trim() !== '' && !esRifGenerico(u.identidad)) {
          if (!byRif.has(u.identidad)) byRif.set(u.identidad, []);
          byRif.get(u.identidad)!.push(u);
        }
      }
    });

    const raiz: any[] = [];
    us.forEach(u => {
      if (!u.padre_unidad_id || !ids.has(u.padre_unidad_id)) {
        if (u.identidad && byRif.has(u.identidad) && byRif.get(u.identidad)!.length > 1) {
          const group = byRif.get(u.identidad)!;
          if (group[0].id === u.id) {
            const virtualId = `virtual-${u.identidad}`;
            const isN_A = u.inmueble ? false : true; // Si quisieramos marcar si es N/A oficial
            hijos.set(virtualId, group);
            raiz.push({
              id: virtualId,
              inmueble: group.find(g => g.padre_id)?.padre_id || group[0].inmueble || 'N/A', // Intentamos usar el codigo padre
              numero: [...new Set(group.map((g: any) => String(g.numero || '').trim()).filter((x: string) => x && !/^N\/?A$/i.test(x)))].join(', ') || '—',
              propietario: u.propietario,
              identidad: u.identidad,
              actividad: 'Múltiples Actividades (Agrupadas)',
              estado: 'Activa',
              aseo_pendiente_desde: u.aseo_pendiente_desde
            });
          }
        } else {
          raiz.push(u);
        }
      }
    });

    raiz.sort((a, b) => Number(!!(hijos.get(b.id)?.length)) - Number(!!(hijos.get(a.id)?.length)) || String(a.inmueble).localeCompare(String(b.inmueble)));
    return { raiz, hijos, torres: raiz.filter(u => hijos.get(u.id)?.length).length };
  }, [d]);

  const abrirEdicion = () => {
    setForm({
      modalidad: c.modalidad, cant_declarada: c.cant_declarada, tarifa_mmv: c.tarifa_mmv ?? '', actividad: c.actividad || '',
      agente_retencion: !!c.agente_retencion, permite_pago_por_unidad: !!c.permite_pago_por_unidad,
      permite_abonos: c.permite_abonos !== false, cobro_tarifa_por_unidad: !!c.cobro_tarifa_por_unidad,
      correo: c.correo || '', telefono: c.telefono || '', notas: c.notas || '',
      direccion: c.direccion || '',
      tipo: c.tipo, nombre: c.nombre || '', identidad: c.identidad || '',
      clave_portal: c.clave_portal || '',
      meses: e?.totales?.meses ?? mesesPendientes(c.aseo_pendiente_desde), multa_meses: c.multa_meses || 0,
    });
    setMotivo(''); setEditando(true);
  };
  const quitarMultasCondo = async () => {
    if (motivo.trim().length < 5) { alert('Escriba el motivo del cambio.'); return; }
    if (!confirm(`¿Quitar TODAS las multas de ${c.nombre} y de sus ${d.unidades.length} unidades? Queda en la Auditoría.`)) return;
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios/quitar-multas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: c.codigo, usuario: usuarioActual(), motivo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudieron quitar');
      alert(`Listo: multas quitadas a ${j.unidades} unidad(es)${j.multasAnuladas ? ` y ${j.multasAnuladas} multa(s) fija(s) anuladas` : ''}.`);
      setEditando(false); await cargar();
    } catch (err: any) { alert(err.message); } finally { setGuardando(false); }
  };
  const guardar = async () => {
    const cambios: any = {};
    Object.keys(form).forEach(k => {
      const antes = k === 'meses' ? (e?.totales?.meses ?? mesesPendientes(c.aseo_pendiente_desde)) : (c[k] ?? (typeof form[k] === 'boolean' ? false : ''));
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

  const desocuparUnidad = async (u: any) => {
    const mot = prompt(`Escriba el motivo para marcar "${u.inmueble || u.numero}" como Desocupada (obligatorio):`);
    if (!mot || mot.trim().length < 5) return;
    setCargando(true);
    try {
      const r = await fetch('/api/admin/condominios/unidades', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, cambios: { estado: 'Desocupada' }, usuario: usuarioActual(), motivo: mot })
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Error');
      await cargar();
    } catch (err: any) { alert(err.message); setCargando(false); }
  };

  const eliminarUnidad = async (u: any) => {
    const mot = prompt(`Escriba el motivo para Eliminar "${u.inmueble || u.numero}" de la lista (obligatorio):`);
    if (!mot || mot.trim().length < 5) return;
    setCargando(true);
    try {
      const r = await fetch('/api/admin/condominios/unidades', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, cambios: { estado: 'Eliminada' }, usuario: usuarioActual(), motivo: mot })
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Error');
      await cargar();
    } catch (err: any) { alert(err.message); setCargando(false); }
  };

  const desvincularUnidad = async (u: any) => {
    const cod = u.inmueble || u.numero;
    if (!confirm(`¿Desea sacar la unidad "${cod}" del código padre y dejarla como unidad directa e independiente dentro del condominio "${c?.codigo}"?`)) return;
    const mot = prompt(`Escriba el motivo para sacar "${cod}" del código padre (obligatorio, mín. 5 letras):`, 'Independizar unidad dentro del mismo condominio');
    if (!mot || mot.trim().length < 5) return alert('Debe ingresar un motivo válido de al menos 5 caracteres.');
    setCargando(true);
    try {
      const r = await fetch('/api/admin/condominios/unidades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, cambios: { padre_unidad_id: null }, usuario: usuarioActual(), motivo: mot.trim() })
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Error al desvincular unidad');
      alert(`✅ La unidad "${cod}" ha sido desvinculada exitosamente y ahora es directa e independiente dentro del condominio.`);
      await cargar();
    } catch (err: any) { alert(err.message); } finally { setCargando(false); }
  };

  const exportar = async (moneda: 'BS' | 'EUR' = 'BS') => {
    // Generate PDF state of account
    const { generarPdfEstadoCuentaCondominio } = await import('@/lib/condominios/pdfCondominio');
    const cajero = usuarioActual() || 'Administrador';
    generarPdfEstadoCuentaCondominio(c, e, cajero, true, moneda);
  };

  const exportarUnidad = async (r: any, ev: any, moneda: 'BS' | 'EUR' = 'BS') => {
    ev.stopPropagation();
    const { generarPdfEstadoCuentaUnidad } = await import('@/lib/condominios/pdfCondominio');
    const cajero = usuarioActual() || 'Administrador';
    await generarPdfEstadoCuentaUnidad(c, r, e.tasa, cajero, undefined, moneda);
  };

  /** Renglón del estado de cuenta de una unidad */
  const renglonDe = (id: string) => e?.renglones?.find((x: any) => x.clave === id);
  /** Meses con multa: toma los meses con recargo en mora (o multaMeses si es remanente) sin duplicar */
  const mesesMultaDe = (r: any) => {
    const enAseo = (r?.deuda?.porMes || []).filter((m: any) => m.multaBs > 0).length;
    return Math.max(enAseo, Number(r?.multaMeses) || 0);
  };

  /** Estado de cuenta individual desde la pestaña Unidades */
  const exportarUnidadTree = async (u: any, ev: any, moneda: 'BS' | 'EUR' = 'BS') => {
    ev.stopPropagation();
    const r = renglonDe(u.id);
    if (!r) { alert('Esta unidad no tiene renglones de deuda calculados.'); return; }
    const { generarPdfEstadoCuentaUnidad } = await import('@/lib/condominios/pdfCondominio');
    const cajero = usuarioActual() || 'Administrador';
    await generarPdfEstadoCuentaUnidad(c, r, e.tasa, cajero, undefined, moneda);
  };

  const exportarMultas = async () => {
    const { generarPdfMultasCondominio } = await import('@/lib/condominios/pdfCondominio');
    const cajero = usuarioActual() || 'Administrador';
    generarPdfMultasCondominio(c, e, cajero);
  };

  const [eliminandoCondo, setEliminandoCondo] = useState(false);

  const handleEliminarCondominioCompleto = async () => {
    if (!c?.codigo) return;
    const numUnidades = (d?.unidades || []).length;
    const conf = window.prompt(
      `🚨 ALERTA CRÍTICA: ¿Está seguro de que desea ELIMINAR el condominio "${c.nombre}" (${c.codigo}) de una sola vez junto con todas sus ${numUnidades} unidades asociadas?\n\nEsta acción:\n1. Eliminará el condominio de la base de datos.\n2. Eliminará todas sus ${numUnidades} unidades en el módulo de condominios.\n3. Dará de baja (estado Eliminado) la matriz y todas las unidades en la tabla de inmuebles con deuda en 0.\n4. Eliminará sus multas y movimientos de condominio.\n\nPara confirmar, escriba exactamente: ELIMINAR`
    );
    if (!conf || conf.trim().toUpperCase() !== 'ELIMINAR') {
      if (conf !== null) alert('Operación cancelada. No se escribió la palabra de confirmación.');
      return;
    }

    const motivo = window.prompt('Indique el motivo de la eliminación (mínimo 5 caracteres):', 'Condominio dado de baja por administración');
    if (!motivo || motivo.trim().length < 5) {
      alert('Debe indicar un motivo válido para la auditoría.');
      return;
    }

    setEliminandoCondo(true);
    try {
      const res = await fetch('/api/admin/condominios', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: c.codigo,
          usuario: usuarioActual() || 'Administrador',
          motivo: motivo.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar condominio');

      alert(data.mensaje || 'Condominio y todas sus unidades fueron eliminados exitosamente.');
      window.location.href = '/admin/condominios';
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setEliminandoCondo(false);
    }
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
          {/* ══ ENCABEZADO Y BARRA DE ACCIONES ══ */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
            {/* Fila Principal: Datos del Condominio y Acciones Clave */}
            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="text-xs font-mono font-bold text-slate-500 tracking-wide">{c.codigo} · {c.identidad}</div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
                  <Building2 className="w-8 h-8 text-emerald-600 shrink-0" />
                  <span>{c.nombre}</span>
                </h1>
                
                {/* Badges de Información */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 shadow-2xs">
                    {c.tipo === 'RESIDENCIAL' ? 'Residencial' : c.tipo === 'COMERCIAL' ? 'Comercial' : 'Mixto'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-2xs">
                    {MODALIDAD[c.modalidad] || c.modalidad}
                  </span>
                  {c.agente_retencion && (
                    <span className="px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 shadow-2xs">
                      Agente de retención (75% IVA)
                    </span>
                  )}
                  {c.cobro_tarifa_por_unidad && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 shadow-2xs">
                      Cada local paga según su actividad
                    </span>
                  )}
                  {c.permite_pago_por_unidad && (
                    <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 shadow-2xs">
                      Puede pagar por unidad
                    </span>
                  )}
                  {c.permite_abonos !== false && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 shadow-2xs">
                      Acepta abonos
                    </span>
                  )}
                </div>

                {/* Detalles secundarios */}
                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600 pt-1">
                  {c.actividad && (
                    <div>Actividad: <b className="text-slate-800">{c.actividad}</b>{c.tarifa_mmv ? <> · Tarifa {Number(c.tarifa_mmv)} MMV por unidad</> : null}</div>
                  )}
                  {(c.correo || c.telefono) && (
                    <div className="text-slate-500">{c.correo} {c.telefono ? `· ${c.telefono}` : ''}</div>
                  )}
                  <span className="inline-flex items-center gap-1 font-mono text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                    🔑 Clave Web: {c.clave_portal ? <b>{c.clave_portal}</b> : <span className="text-amber-700 font-sans font-normal">Sin clave asignada</span>}
                  </span>
                </div>
              </div>

              {/* Botones de Acción Primaria */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start">
                <Link 
                  id="btn-cobrar-desde-ficha" 
                  href={`/admin/condominios/caja?codigo=${c.codigo}`} 
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-sm transition-all hover:scale-[1.02]"
                >
                  <WalletIcon className="w-4 h-4" /> Cobrar en Caja
                </Link>
                {admin && (
                  <button 
                    id="btn-agregar-unidad" 
                    onClick={() => setEditorU(null)} 
                    className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Plus className="w-4 h-4" /> Agregar unidad
                  </button>
                )}
                {admin && (
                  <button 
                    id="btn-editar-condominio" 
                    onClick={abrirEdicion} 
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Settings className="w-4 h-4" /> Opciones
                  </button>
                )}
                <button 
                  onClick={cargar} 
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors shadow-2xs" 
                  title="Recargar datos"
                >
                  <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Notas del Condominio si existen */}
            {c.notas && (
              <div className="p-3.5 bg-amber-50/90 border border-amber-300/80 rounded-xl text-amber-950 flex flex-col sm:flex-row items-start justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <StickyNote className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block mb-0.5">Notas del Condominio</span>
                    <p className="text-xs font-semibold whitespace-pre-wrap text-slate-800 leading-relaxed">{c.notas}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setNotaCondominio(c.notas || ''); setModalNotas(true); }}
                  className="px-3 py-1 text-xs font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg shrink-0 cursor-pointer shadow-2xs transition-colors self-end sm:self-center"
                >
                  ✏️ Editar Nota
                </button>
              </div>
            )}

            {/* Barra de Herramientas Secundaria (Documentos, Reportes y Operaciones) */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  id="btn-notas-condominio"
                  onClick={() => { setNotaCondominio(c.notas || ''); setModalNotas(true); }}
                  className={`px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs ${
                    c.notas 
                      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900' 
                      : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <StickyNote className="w-3.5 h-3.5 text-amber-600" /> {c.notas ? 'Editar Notas' : 'Agregar Notas'}
                </button>
                <Link 
                  id="btn-notas-desde-ficha" 
                  href={`/admin/condominios/caja?codigo=${c.codigo}&tab=notas`} 
                  className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <CreditCard className="w-3.5 h-3.5" /> Notas de Crédito
                </Link>
                <div className="inline-flex rounded-xl shadow-2xs border border-sky-300 overflow-hidden">
                  <button 
                    id="btn-estado-cuenta-condominio" 
                    onClick={() => exportar('BS')} 
                    title="Descargar Estado de Cuenta Consolidado en Bolívares" 
                    className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors border-r border-sky-200"
                  >
                    <FileText className="w-3.5 h-3.5" /> Estado de Cuenta (Bs)
                  </button>
                  <button 
                    id="btn-estado-cuenta-condominio-eur" 
                    onClick={() => exportar('EUR')} 
                    title="Descargar Estado de Cuenta Consolidado en Euros (€)" 
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>💶</span> Estado de Cuenta (€)
                  </button>
                </div>
                <button
                  id="btn-solvencia-condominio"
                  onClick={async () => {
                    const { emitirSolvenciaCondominio } = await import('@/lib/condominios/pdfSolvenciaCondominio');
                    await emitirSolvenciaCondominio(c, e.totales.totalBs);
                  }}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs ${
                    e.totales.totalBs <= 0.01
                      ? 'border border-emerald-400 bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                  title={e.totales.totalBs <= 0.01 ? "Descargar Certificado de Solvencia Municipal" : `Condominio con deuda pendiente (Bs ${fmtBs(e.totales.totalBs)})`}
                >
                  <Award className="w-3.5 h-3.5" /> Solvencia
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button 
                  disabled={descargandoExcel}
                  onClick={async () => {
                    setDescargandoExcel(true);
                    try {
                      const { exportarExcelEstadoCuenta } = await import('@/lib/condominios/excelCondominio');
                      await exportarExcelEstadoCuenta(c, e, usuarioActual() || 'Administrador');
                    } catch (err: any) {
                      console.error('Error al descargar Excel:', err);
                      alert('Error al descargar Excel: ' + (err?.message || 'Error desconocido'));
                    } finally {
                      setDescargandoExcel(false);
                    }
                  }} 
                  className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" /> {descargandoExcel ? 'Descargando...' : 'Excel'}
                </button>
                {admin && (
                  <button 
                    id="btn-excel-ucd-condominio" 
                    disabled={descargandoExcel}
                    onClick={async () => {
                      setDescargandoExcel(true);
                      try {
                        const { exportarExcelEstadoCuenta } = await import('@/lib/condominios/excelCondominio');
                        await exportarExcelEstadoCuenta(c, e, usuarioActual() || 'Administrador', 'UCD');
                      } catch (err: any) {
                        console.error('Error al descargar Excel UCD:', err);
                        alert('Error al descargar Excel UCD: ' + (err?.message || 'Error desconocido'));
                      } finally {
                        setDescargandoExcel(false);
                      }
                    }} 
                    className="px-3.5 py-2 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-50" 
                    title="Estado de cuenta expresado en UCD (Euro × 57) — sólo administradores"
                  >
                    <FileText className="w-3.5 h-3.5" /> {descargandoExcel ? 'Descargando...' : 'Excel UCD'}
                  </button>
                )}
                <button 
                  onClick={exportarMultas} 
                  className="px-3.5 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5" /> Multas
                </button>
                {admin && (
                  <button
                    id="btn-eliminar-condominio-completo"
                    onClick={handleEliminarCondominioCompleto}
                    disabled={eliminandoCondo}
                    className="px-3.5 py-2 rounded-xl border border-rose-300 bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                    title="Eliminar este condominio y todas sus unidades asociadas de una sola vez"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-700" />
                    <span>{eliminandoCondo ? 'Eliminando...' : 'Eliminar'}</span>
                  </button>
                )}
              </div>
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
                {([['deuda', 'Estado de cuenta', Wallet], ['unidades', `Unidades (${d.unidades.length})`, Layers], ['movimientos', `Movimientos (${d.movimientos.length})`, History], ['pagos', `Historial de Pagos (${(d.pagos || []).length})`, Receipt]] as const).map(([k, label, Icon]) => (
                  <button key={k} onClick={() => setTab(k as any)}
                    className={`px-4 py-2.5 text-sm font-extrabold border-b-2 -mb-px flex items-center gap-2 cursor-pointer ${tab === k ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
              {tab !== 'movimientos' && tab !== 'pagos' && (
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
                        <th className="text-center py-2.5 px-3">Meses Aseo</th>
                        <th className="text-center py-2.5 px-3">Meses Multa</th>
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
                        const u = unidadDe(r.clave);
                        const uIdClean = (u?.identidad || r?.identidad || '').replace(/[\s-]/g, '').toUpperCase();
                        const uNum = uIdClean.replace(/\D/g, '');
                        const convUnidad = conveniosUnidades[uIdClean] || (uNum ? conveniosUnidades[uNum] : null);
                        return (
                          <React.Fragment key={r.clave}>
                            <tr onClick={() => setAbierto(open ? null : r.clave)} className={`cursor-pointer hover:bg-emerald-50/40 ${sinReg ? 'bg-amber-50/50' : ''} ${unidadFoco && r.inmueble === unidadFoco ? 'bg-emerald-50' : ''}`}>
                              <td className="pl-3 text-slate-400">{r.deuda.meses > 0 ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}</td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900 flex items-center gap-2">
                                  {sinReg ? (
                                    <span className="text-amber-800">Unidades declaradas sin registrar</span>
                                  ) : (
                                    <span className="font-mono">{r.inmueble}{r.numero ? ` · ${r.numero}` : ''}</span>
                                  )}
                                  {convUnidad && (
                                    <Link
                                      href="/admin/convenios-pago"
                                      onClick={ev => ev.stopPropagation()}
                                      title={`Convenio ${convUnidad.numero}: Bs. ${convUnidad.monto_total} (${convUnidad.cuotas} cuotas) - Estado: ${convUnidad.estado}`}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors shadow-2xs"
                                    >
                                      <Handshake className="w-3 h-3 text-amber-600" /> {convUnidad.numero}
                                    </Link>
                                  )}
                                  <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                                    {admin && u && (
                                      <button title="Editar unidad" onClick={() => setEditorU(u)} className="p-1.5 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer border border-transparent hover:border-emerald-200 bg-white shadow-sm"><Pencil className="w-3.5 h-3.5" /></button>
                                    )}
                                    {admin && u && u.estado !== 'Desocupada' && (
                                      <button title="Marcar como desocupada" onClick={() => desocuparUnidad(u)} className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 cursor-pointer border border-transparent hover:border-amber-200 bg-white shadow-sm"><Ban className="w-3.5 h-3.5" /></button>
                                    )}
                                    {admin && u && (
                                      <button title="Eliminar de la lista" onClick={() => eliminarUnidad(u)} className="p-1.5 rounded-md text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer border border-transparent hover:border-red-200 bg-white shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                                    )}
                                    {u && (
                                      <div className="inline-flex rounded-md shadow-2xs border border-sky-200 overflow-hidden">
                                        <button onClick={(ev) => exportarUnidad(r, ev, 'BS')} title="Descargar Estado de Cuenta individual en Bolívares" className="px-1.5 py-0.5 text-sky-700 bg-sky-50 hover:bg-sky-100 cursor-pointer text-[10px] font-bold flex items-center gap-0.5 border-r border-sky-200"><FileText className="w-3 h-3" /> E/C</button>
                                        <button onClick={(ev) => exportarUnidad(r, ev, 'EUR')} title="Descargar Estado de Cuenta individual en Euros (€)" className="px-1.5 py-0.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 cursor-pointer text-[10px] font-extrabold flex items-center gap-0.5">€</button>
                                      </div>
                                    )}
                                    {convUnidad && (
                                      <Link
                                        href="/admin/convenios-pago"
                                        onClick={ev => ev.stopPropagation()}
                                        title={`Ver cuotas de ${convUnidad.numero}`}
                                        className="px-2 py-0.5 rounded-md text-amber-800 bg-amber-50 hover:bg-amber-100 cursor-pointer border border-amber-200 text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                                      >
                                        <Handshake className="w-3 h-3 text-amber-600" /> Convenio
                                      </Link>
                                    )}
                                    {unidadDe(r.clave) && (
                                      <button
                                        onClick={async (ev) => {
                                          ev.stopPropagation();
                                          const u = unidadDe(r.clave);
                                          const { emitirSolvenciaUnidad } = await import('@/lib/condominios/pdfSolvenciaCondominio');
                                          await emitirSolvenciaUnidad(c, u, r.totalBs);
                                        }}
                                        title={r.totalBs <= 0.01 ? "Descargar Certificado de Solvencia Municipal de esta unidad" : `Unidad con deuda pendiente (Bs ${fmtBs(r.totalBs)})`}
                                        className={`px-2 py-0.5 rounded-md cursor-pointer border shadow-2xs transition-colors text-[11px] font-bold flex items-center gap-1 ${
                                          r.totalBs <= 0.01
                                            ? 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 border-emerald-300 bg-emerald-50'
                                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-slate-200 bg-white'
                                        }`}
                                      >
                                        <Award className="w-3 h-3" /> Solvencia
                                      </button>
                                    )}
                                    {admin && unidadDe(r.clave) && (
                                      <button
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          setAjusteMesesTarget({ unidad: unidadDe(r.clave), renglon: r });
                                        }}
                                        title="Ajustar actividades económicas, niveles y multas por mes"
                                        className="px-2 py-0.5 rounded-md text-purple-700 bg-purple-50 hover:bg-purple-100 cursor-pointer border border-purple-200 text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                                      >
                                        <Sliders className="w-3 h-3" /> Meses
                                      </button>
                                    )}
                                  </div>
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
                              <td className="py-2.5 px-3 text-center">{(() => { const mm = mesesMultaDe(r); return <span className={`px-2 py-0.5 rounded-full text-xs font-black ${mm === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{mm}</span>; })()}</td>
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
                                  {admin && unidadDe(r.clave) && (
                                    <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5">
                                      <span className="text-[11px] text-slate-500">¿Desea cambiar la actividad económica, nivel de generación o estado de multa para meses específicos?</span>
                                      <button
                                        type="button"
                                        onClick={() => setAjusteMesesTarget({ unidad: unidadDe(r.clave), renglon: r })}
                                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                                      >
                                        <Sliders className="w-3.5 h-3.5" /> Ajustar actividades, niveles y multas por mes
                                      </button>
                                    </div>
                                  )}
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
                      <td className="py-2 px-3 text-center">{(() => { const rr = renglonDe(u.id); const mm = rr ? mesesMultaDe(rr) : (Number(u.multa_meses) || 0); return <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${mm === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{mm}</span>; })()}</td>
                      <td className="py-2 px-2 text-right" onClick={ev => ev.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {(renglonDe(u.id) || (arbol.hijos.get(u.id) || []).length > 0) && (
                            <div className="inline-flex rounded-md shadow-2xs border border-sky-200 overflow-hidden">
                              <button title="Descargar Estado de Cuenta individual en Bolívares" onClick={(ev) => exportarUnidadTree(u, ev, 'BS')} className="px-1.5 py-0.5 text-sky-700 bg-sky-50 hover:bg-sky-100 cursor-pointer text-[10px] font-bold flex items-center gap-0.5 border-r border-sky-200"><FileText className="w-3 h-3" /> E/C</button>
                              <button title="Descargar Estado de Cuenta individual en Euros (€)" onClick={(ev) => exportarUnidadTree(u, ev, 'EUR')} className="px-1.5 py-0.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 cursor-pointer text-[10px] font-extrabold flex items-center gap-0.5">€</button>
                            </div>
                          )}
                          <button
                            title={(() => {
                              const rr = renglonDe(u.id);
                              const deuda = rr ? rr.totalBs : (u.aseo_pendiente_desde ? 100 : 0);
                              return deuda <= 0.01 ? "Descargar Solvencia Municipal de esta unidad" : `Unidad con deuda pendiente (Bs ${fmtBs(deuda)})`;
                            })()}
                            onClick={async (ev) => {
                              ev.stopPropagation();
                              const rr = renglonDe(u.id);
                              const deuda = rr ? rr.totalBs : (u.aseo_pendiente_desde ? 100 : 0);
                              const { emitirSolvenciaUnidad } = await import('@/lib/condominios/pdfSolvenciaCondominio');
                              await emitirSolvenciaUnidad(c, u, deuda);
                            }}
                            className={`px-2 py-0.5 rounded-md cursor-pointer border shadow-2xs transition-colors text-[11px] font-bold flex items-center gap-1 ${
                              (() => {
                                const rr = renglonDe(u.id);
                                const deuda = rr ? rr.totalBs : (u.aseo_pendiente_desde ? 100 : 0);
                                return deuda <= 0.01 ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-100 bg-emerald-50' : 'border-slate-200 text-slate-400 hover:bg-slate-50 bg-white';
                              })()
                            }`}
                          >
                            <Award className="w-3 h-3" /> Solvencia
                          </button>
                        </div>
                      </td>
                      {admin && <td className="py-2 pr-4 text-right">
                        <div className="flex justify-end gap-1" onClick={ev => ev.stopPropagation()}>
                          {u.padre_unidad_id && (
                            <button
                              onClick={() => desvincularUnidad(u)}
                              title="Sacar del código padre y dejar como unidad directa en el condominio"
                              className="p-1.5 rounded-lg border border-amber-200 text-amber-700 hover:text-amber-900 hover:border-amber-300 hover:bg-amber-50 cursor-pointer bg-white shadow-sm"
                            >
                              <LogOut className="w-3.5 h-3.5 text-amber-600" />
                            </button>
                          )}
                          <button id={`editar-${u.inmueble || u.id}`} onClick={() => setEditorU(u)} title="Editar" className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer bg-white shadow-sm"><Pencil className="w-3.5 h-3.5" /></button>
                          {u.estado !== 'Desocupada' && <button onClick={() => desocuparUnidad(u)} title="Marcar desocupada" className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-800 hover:border-amber-300 hover:bg-amber-50 cursor-pointer bg-white shadow-sm"><Ban className="w-3.5 h-3.5" /></button>}
                          <button onClick={() => eliminarUnidad(u)} title="Eliminar" className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-red-800 hover:border-red-300 hover:bg-red-50 cursor-pointer bg-white shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
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
                        <th className="text-left py-2.5 px-3">Cédula/RIF</th><th className="text-left py-2.5 px-3">Actividad</th><th className="text-left py-2.5 px-3">Estado</th><th className="text-left py-2.5 px-4">Pendiente desde</th><th className="text-center py-2.5 px-3">Meses multa</th><th className="py-2.5 px-2 text-right">Documentos</th>
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

            {tab === 'pagos' && (
              <div className="p-4">
                {(!d.pagos || d.pagos.length === 0) ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No se han registrado pagos para este condominio. Los pagos procesados en Caja o confirmados en Conciliación aparecerán aquí.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="text-left py-2.5 px-3">Fecha</th>
                          <th className="text-left py-2.5 px-3">Referencia</th>
                          <th className="text-left py-2.5 px-3">Método / Banco</th>
                          <th className="text-left py-2.5 px-3">Contribuyente</th>
                          <th className="text-right py-2.5 px-3">Monto (Bs)</th>
                          <th className="text-center py-2.5 px-3">Estado</th>
                          <th className="text-left py-2.5 px-3">Cajero / Operador</th>
                          <th className="text-center py-2.5 px-3">Comprobante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {d.pagos.map((p: any) => {
                          const det = p.detalles || {};
                          const cajero = det.cajero || det.usuario || p.usuario || '—';
                          const fechaFmt = p.created_at ? new Date(p.created_at).toLocaleString('es-VE') : '—';
                          const comprobante = p.comprobante_url || det.comprobante_url;
                          const esAprobado = p.estado === 'Aprobado' || p.estado === 'Conciliado';
                          const esPendiente = p.estado === 'Por Verificar' || p.estado === 'Pendiente';
                          const esRechazado = p.estado === 'Rechazado' || p.estado === 'Anulado' || p.estado === 'Reversado';
                          
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{fechaFmt}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-xs text-slate-800">{p.referencia || '—'}</td>
                              <td className="py-2.5 px-3 text-xs text-slate-700">
                                <span className="font-semibold">{p.tipo || 'Pago'}</span>
                                {p.banco && <span className="text-slate-500 block text-[11px]">{p.banco}</span>}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-slate-700">
                                <span className="font-medium block">{det.contribuyente || c?.nombre || '—'}</span>
                                <span className="text-[11px] font-mono text-slate-500">{p.identidad || det.identidad || '—'}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-black text-emerald-700 text-xs">
                                Bs {fmtBs(p.monto)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  esAprobado ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                  esPendiente ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                  esRechazado ? 'bg-red-100 text-red-800 border border-red-300' :
                                  'bg-slate-100 text-slate-700 border border-slate-300'
                                }`}>
                                  {p.estado}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-xs text-slate-600">{cajero}</td>
                              <td className="py-2.5 px-3 text-center">
                                {comprobante ? (
                                  <a href={comprobante} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold underline">
                                    <ExternalLink className="w-3 h-3" /> Ver
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-700">Dirección fiscal</span>
                  <input value={form.direccion || ''} onChange={ev => setForm({ ...form, direccion: ev.target.value })} placeholder="Dirección fiscal oficial del condominio" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2" /></label>
                <label className="block sm:col-span-2"><span className="text-xs font-bold text-emerald-800">Clave de acceso web (Portal del Contribuyente)</span>
                  <input value={form.clave_portal || ''} onChange={ev => setForm({ ...form, clave_portal: ev.target.value })} placeholder="Asignar o cambiar clave para ingresar por la web" className="mt-1 w-full border border-emerald-300 bg-emerald-50/30 rounded-xl px-3 py-2 font-mono text-sm" /></label>
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between gap-2">
              <button id="btn-quitar-multas-condominio" onClick={quitarMultasCondo} disabled={guardando} className="px-4 py-2 border border-red-300 bg-white text-red-700 hover:bg-red-50 rounded-xl text-xs font-extrabold cursor-pointer disabled:opacity-50">Quitar todas las multas del condominio</button>
              <div className="flex gap-2">
              <button onClick={() => setEditando(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancelar</button>
              <button id="btn-guardar-condominio" onClick={guardar} disabled={guardando} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-50">
                {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL EDITAR / AGREGAR NOTAS DEL CONDOMINIO ══ */}
      {modalNotas && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-amber-200 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <StickyNote className="w-5 h-5 text-amber-100" />
                <div>
                  <h3 className="font-black text-base text-white tracking-wide">Notas del Condominio</h3>
                  <p className="text-[11px] text-amber-100">{c?.nombre} ({c?.codigo})</p>
                </div>
              </div>
              <button 
                onClick={() => setModalNotas(false)} 
                className="text-white/80 hover:text-white font-bold text-xl p-1 cursor-pointer leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 font-medium">
                Estas notas quedan guardadas para el condominio y se muestran en la Ficha y en Caja:
              </p>
              <textarea 
                rows={5}
                value={notaCondominio}
                onChange={e => setNotaCondominio(e.target.value)}
                placeholder="Escriba aquí observaciones del condominio, acuerdos, teléfonos de contacto, historial..."
                className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
              />
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5">
              <button 
                type="button"
                onClick={() => setModalNotas(false)} 
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleGuardarNota} 
                disabled={guardandoNota}
                className="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl shadow-sm cursor-pointer"
              >
                {guardandoNota ? 'Guardando…' : 'Guardar Nota'}
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

      {ajusteMesesTarget && c && (
        <ModalAjusteMeses
          condo={c}
          unidad={ajusteMesesTarget.unidad}
          renglon={ajusteMesesTarget.renglon}
          tasa={e?.tasa || 1}
          usuario={usuarioActual()}
          onClose={() => setAjusteMesesTarget(null)}
          onSaved={async () => {
            setAjusteMesesTarget(null);
            await cargar();
          }}
        />
      )}
    </div>
  );
}

export default function FichaCondominioPage() {
  return <Suspense fallback={<div className="p-6 text-slate-500">Cargando…</div>}><Ficha /></Suspense>;
}
