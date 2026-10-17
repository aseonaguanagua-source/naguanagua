'use client';
// Soy Contribuyente → Servicios Especiales y Extraordinarios.
// Tarifas OFICIALES de la Ordenanza (las mismas que usa el funcionario en Servicios Especiales):
//   Especial      TSE  = F.O.Es (UCD por unidad y nivel) × N° de viajes × 1
//   Extraordinario TSEX = C.E.V (UCD)                   × N° de viajes × factor de llenado
//   Monto en Bs = Total UCD × Tasa Euro BCV del día
import { Truck, Send, CheckCircle2, Clock, RefreshCw, FileDown, CalendarDays, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { TARIFAS_ESPECIAL, TARIFAS_EXTRAORDINARIO, calcularServicio, generarPlanillaServicio } from '@/lib/planillaServicio';

type Cat = 'especial' | 'extraordinario';
const fmt = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ServiciosExtraordinariosPage() {
  const [cat, setCat] = useState<Cat>('especial');
  const [vehiculo, setVehiculo] = useState('');
  const [nivel, setNivel] = useState<'BAJA' | 'MEDIA' | 'ALTA' | ''>('');
  const [nve, setNve] = useState('1');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nombreEvento, setNombreEvento] = useState('');
  const [fechaEvento, setFechaEvento] = useState('');
  const [horario, setHorario] = useState('');
  const [aforo, setAforo] = useState('');
  const [lugar, setLugar] = useState('');
  const [detalles, setDetalles] = useState('');
  const [tasa, setTasa] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [servicios, setServicios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  const doc = typeof window !== 'undefined' ? (localStorage.getItem('portal_doc') || '') : '';
  const nombre = typeof window !== 'undefined' ? (localStorage.getItem('portal_user') || '') : '';

  const cargar = async () => {
    const d = localStorage.getItem('portal_doc') || '';
    if (!d) { setCargando(false); return; }
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/servicios-especiales?identidad=${encodeURIComponent(d)}`);
      const j = await r.json();
      setServicios(Array.isArray(j) ? j.filter((s: any) => s.tipo === 'especial' || s.tipo === 'extraordinario') : []);
    } catch { setServicios([]); }
    setCargando(false);
  };

  useEffect(() => {
    fetch('/api/bcv').then(r => r.json()).then(d => { if (d?.tcmmv > 0) setTasa(d.tcmmv); }).catch(() => {});
    cargar();
  }, []);

  const viajes = Math.max(1, parseInt(nve || '1') || 1);
  const cambiarCat = (c: Cat) => { setCat(c); setVehiculo(''); setMsg(null); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc) { setMsg({ ok: false, t: 'Inicie sesión de nuevo para solicitar el servicio.' }); return; }
    if (!vehiculo) { setMsg({ ok: false, t: 'Seleccione el tipo de unidad.' }); return; }
    if (!lugar.trim()) { setMsg({ ok: false, t: cat === 'especial' ? 'Indique el lugar del evento.' : 'Indique la dirección del servicio.' }); return; }
    setEnviando(true); setMsg(null);
    try {
      const tLabel = cat === 'especial'
        ? (TARIFAS_ESPECIAL.find(x => x.vehiculo === vehiculo)?.label || vehiculo)
        : (TARIFAS_EXTRAORDINARIO.find(x => x.vehiculo === vehiculo)?.label || vehiculo);

      const r = await fetch('/api/admin/servicios-especiales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: cat, identidad: doc, contribuyente: nombre,
          descripcion: `${cat === 'especial' ? 'Servicio Especial' : 'Servicio Extraordinario'} — ${tLabel} × ${viajes} viaje(s) (Pendiente de Asignación)`,
          monto: 0, fecha: new Date().toISOString().split('T')[0],
          notas: `${detalles}${contacto ? ` [CONTACTO:${contacto}]` : ''}`.trim(),
          estado: 'Pendiente', referencia: `SRV-${cat === 'especial' ? 'ESP' : 'EXT'}-${Date.now()}`, origen: 'contribuyente',
          categoria: cat === 'especial' ? 'ESPECIAL' : 'EXTRAORDINARIO', vehiculo,
          nve: viajes, tasa_euro: tasa > 0 ? tasa : null,
          nombre_evento: cat === 'especial' ? (nombreEvento || null) : null, fecha_evento: fechaEvento || null,
          hora_evento: horario || null, direccion_evento: lugar || null, aforo: aforo ? parseInt(aforo) : null, telefono: telefono || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo registrar la solicitud');
      setMsg({ ok: true, t: 'Solicitud registrada con éxito. El administrador del IAMEC evaluará el requerimiento, asignará el nivel de servicio y le generará la cotización.' });
      setVehiculo(''); setNve('1'); setDetalles(''); setLugar(''); setNombreEvento(''); setFechaEvento(''); setHorario(''); setAforo('');
      cargar();
    } catch (err: any) { setMsg({ ok: false, t: err.message }); }
    setEnviando(false);
  };

  const planilla = (s: any) => {
    const c: Cat = s.tipo === 'extraordinario' ? 'extraordinario' : 'especial';
    const t: any = TARIFAS_ESPECIAL.find(x => x.vehiculo === s.vehiculo) || TARIFAS_EXTRAORDINARIO.find(x => x.vehiculo === s.vehiculo);
    const v = s.valor_ucd != null ? Number(s.valor_ucd) : null;
    generarPlanillaServicio({
      categoria: c, fechaEmision: s.fecha || s.created_at, referencia: s.referencia, nombre: s.contribuyente, identidad: s.identidad,
      contacto: String(s.notas || '').match(/\[CONTACTO:([^\]]*)\]/)?.[1] || '', telefono: s.telefono || '',
      nombreEvento: s.nombre_evento || '', fechaEvento: s.fecha_evento || '', lugar: s.direccion_evento || '', horario: s.hora_evento || '',
      aforo: s.aforo ?? '', direccion: s.direccion_evento || '', vehiculoLabel: t?.label || s.descripcion, nivel: s.nivel || '',
      valorUcd: v, nve: v != null ? Number(s.nve ?? 1) : null, factor: v != null ? Number(s.factor ?? 1) : null,
      tasaEuro: s.tasa_euro != null ? Number(s.tasa_euro) : null,
    });
  };

  const color = (e: string) => e === 'Pagado' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : e === 'Aprobado' ? 'bg-blue-100 text-blue-700 border-blue-200'
    : e === 'Rechazado' || e === 'Anulado' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200';
  const inp = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white';
  const lbl = 'block text-xs font-bold text-slate-600 mb-1';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow"><Truck className="w-6 h-6" /></div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Servicios Especiales y Extraordinarios</h1>
          <p className="text-slate-500 text-sm">Tarifas oficiales de la Ordenanza · Tasa Euro BCV del día: {tasa > 0 ? `Bs. ${fmt(tasa)}` : 'cargando…'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {([['especial', 'Servicio Especial', 'Eventos: limpieza y recolección antes, durante y después'], ['extraordinario', 'Servicio Extraordinario', 'Recolección de desechos fuera de la ruta (escombros, poda, etc.)']] as const).map(([k, t, d]) => (
          <button key={k} type="button" onClick={() => cambiarCat(k)}
            className={`text-left rounded-2xl border p-4 transition-all ${cat === k ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-emerald-300'}`}>
            <p className="font-black text-slate-800 text-sm">{t}</p><p className="text-xs text-slate-500 mt-0.5">{d}</p>
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
        {cat === 'especial' ? (
          <>
            <div>
              <label className={lbl}>Tipo de unidad *</label>
              <select value={vehiculo} onChange={e => setVehiculo(e.target.value)} className={inp} required>
                <option value="">Seleccione…</option>
                {TARIFAS_ESPECIAL.map(t => <option key={t.vehiculo} value={t.vehiculo}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={lbl}>Nombre del evento</label><input value={nombreEvento} onChange={e => setNombreEvento(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Fecha del evento</label><input type="date" value={fechaEvento} onChange={e => setFechaEvento(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Horario</label><input value={horario} onChange={e => setHorario(e.target.value)} placeholder="Ej: 8:00 am a 6:00 pm" className={inp} /></div>
              <div><label className={lbl}>Aforo estimado (personas)</label><input type="number" min="0" value={aforo} onChange={e => setAforo(e.target.value)} className={inp} /></div>
            </div>
          </>
        ) : (
          <div>
            <label className={lbl}>Tipo de unidad *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TARIFAS_EXTRAORDINARIO.map(t => (
                <button key={t.vehiculo} type="button" onClick={() => setVehiculo(t.vehiculo)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-all ${vehiculo === t.vehiculo ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300 hover:border-emerald-400'}`}>
                  <span className="block text-sm font-bold">{t.label}</span>
                  <span className="block text-[11px] opacity-80">{t.capacidad} m³ (desechos fuera de ruta)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className={lbl}>N° estimado de viajes *</label><input type="number" min="1" value={nve} onChange={e => setNve(e.target.value)} className={inp} required /></div>
          <div><label className={lbl}>Persona de contacto *</label><input value={contacto} onChange={e => setContacto(e.target.value)} className={inp} required /></div>
          <div><label className={lbl}>Teléfono de contacto *</label><input value={telefono} onChange={e => setTelefono(e.target.value)} className={inp} required /></div>
        </div>
        <div><label className={lbl}>{cat === 'especial' ? 'Lugar del evento *' : 'Dirección del servicio *'}</label><input value={lugar} onChange={e => setLugar(e.target.value)} className={inp} required /></div>
        <div><label className={lbl}>Detalles adicionales</label><textarea value={detalles} onChange={e => setDetalles(e.target.value)} rows={2} placeholder="Describa el requerimiento, tipo de residuos, accesos, etc." className={inp} /></div>

        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-800 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <span>ℹ️ Información de Asignación y Cotización:</span>
          </p>
          <p>
            Al enviar su solicitud, los inspectores y administradores del IAMEC evaluarán los requerimientos técnicos y le asignarán el nivel de servicio y cotización oficial. Una vez evaluado, podrá ver el monto y pagarlo desde el portal o en taquilla.
          </p>
        </div>

        {msg && (
          <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium border ${msg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}{msg.t}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={enviando || !vehiculo} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition-all shadow-sm">
            <Send className="w-4 h-4" /> {enviando ? 'Enviando…' : 'Solicitar servicio'}
          </button>
          <button type="button" onClick={() => generarPlanillaServicio({ categoria: cat })} className="inline-flex items-center gap-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl">
            <FileDown className="w-4 h-4" /> Planilla en blanco
          </button>
        </div>
      </form>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Mis solicitudes</h2>
          <button onClick={cargar} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-600"><RefreshCw className="w-3.5 h-3.5" /> Actualizar</button>
        </div>
        {cargando ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">Cargando…</div>
          : servicios.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">No tiene solicitudes de servicios.</div>
          : servicios.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${color(s.estado)}`}><Clock className="w-3 h-3" /> {s.estado}</span>
                <p className="font-bold text-slate-800 text-sm mt-1 truncate">{s.descripcion}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {s.fecha} · {s.referencia}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-slate-800">Bs. {fmt(Number(s.monto))}</p>
                <button onClick={() => planilla(s)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"><FileDown className="w-3.5 h-3.5" /> Planilla</button>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
