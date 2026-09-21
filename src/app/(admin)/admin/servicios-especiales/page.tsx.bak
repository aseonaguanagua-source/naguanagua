'use client';
import { useState, useEffect } from 'react';
import { Wrench, Search, Plus, Trash2, CheckCircle2, AlertCircle, FlaskConical, ClipboardCheck, ShieldCheck, X, RefreshCw, BookOpen } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { ordenanzaData } from '@/data/ordenanza';

type TipoServicio = 'especial' | 'extraordinario' | 'inspeccion' | 'visto_bueno';

type Servicio = {
  id?: number;
  tipo: TipoServicio;
  contribuyente: string;
  identidad: string;
  descripcion: string;
  monto: number;
  estado: string;
  fecha: string;
  creado_por?: string;
  referencia?: string;
};

const TIPO_INFO = {
  especial: { label: 'Servicio Especial', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Wrench, accent: 'purple' },
  extraordinario: { label: 'Servicio Extraordinario', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: FlaskConical, accent: 'orange' },
  inspeccion: { label: 'Inspección', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: ClipboardCheck, accent: 'blue' },
  visto_bueno: { label: 'Visto Bueno Ambiental', color: 'bg-green-100 text-green-800 border-green-200', icon: ShieldCheck, accent: 'green' }
};

export default function ServiciosEspecialesPage() {
  const { contribuyentes } = useAppContext();
  const [tab, setTab] = useState<TipoServicio>('especial');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{type: 'ok'|'error', text: string}|null>(null);

  // BCV rate
  const [tcmmv, setTcmmv] = useState(0);
  useEffect(() => {
    fetch('/api/bcv').then(r => r.json()).then(d => { if (d?.tcmmv) setTcmmv(d.tcmmv); }).catch(() => {});
  }, []);

  // Formulario
  const [form, setForm] = useState({
    tipo: 'especial' as TipoServicio,
    identidad: '',
    contribuyenteNombre: '',
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    notas: '',
    camion: '',
    distancia: '',
    area: '',
    tipoVistoBueno: '',
    tipoInspeccion: '',
    codigoServicio: ''
  });
  const [searchContrib, setSearchContrib] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadServicios = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/servicios-especiales');
      if (res.ok) {
        const data = await res.json();
        setServicios(data);
      }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => { loadServicios(); }, []);

  // Calculo tarifas desde ordenanza
  const getTarifaSugerida = () => {
    if (form.tipo === 'extraordinario' && form.camion && form.distancia) {
      const t = (ordenanzaData as any).serviciosExtraordinarios?.find(
        (s: any) => s.camion === form.camion && s.distancia === form.distancia
      );
      if (t) return { tcmv: t.tcmv, label: t.label };
    }
    if (form.tipo === 'especial' && form.codigoServicio) {
      const t = (ordenanzaData as any).serviciosEspeciales?.find((s: any) => s.codigo === form.codigoServicio);
      if (t && t.tcmvBase > 0) return { tcmv: t.tcmvBase, label: t.label };
    }
    if (form.tipo === 'inspeccion' && form.tipoInspeccion) {
      const t = (ordenanzaData as any).inspeccionesTecnicas?.find((s: any) => s.codigo === form.tipoInspeccion);
      if (t) return { tcmv: t.tcmv, label: t.label };
    }
    if (form.tipo === 'visto_bueno' && form.tipoVistoBueno && form.area) {
      const t = (ordenanzaData as any).vistoBueno?.find((s: any) => s.codigo === form.tipoVistoBueno);
      if (t) return { tcmv: t.tcmvPorM2 * parseFloat(form.area || '0'), label: `${t.label} — ${form.area} m²` };
    }
    return null;
  };
  const tarifaSugerida = getTarifaSugerida();
  const montoSugeridoBs = tarifaSugerida && tcmmv > 0 ? tarifaSugerida.tcmv * tcmmv : null;

  const filteredContrib = contribuyentes.filter((c: any) =>
    searchContrib.length > 1 && (
      (c.Contribuyente || '').toLowerCase().includes(searchContrib.toLowerCase()) ||
      (c.Identidad || '').toLowerCase().includes(searchContrib.toLowerCase())
    )
  ).slice(0, 8);

  const selectContrib = (c: any) => {
    setForm(prev => ({ ...prev, identidad: c.Identidad || '', contribuyenteNombre: c.Contribuyente || '' }));
    setSearchContrib(c.Contribuyente || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.identidad) { setMsg({ type: 'error', text: 'Seleccione un contribuyente.' }); return; }
    if (!form.descripcion) { setMsg({ type: 'error', text: 'Ingrese una descripción.' }); return; }
    if (!form.monto || isNaN(Number(form.monto))) { setMsg({ type: 'error', text: 'Ingrese un monto válido.' }); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/servicios-especiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          identidad: form.identidad,
          contribuyente: form.contribuyenteNombre,
          descripcion: form.descripcion,
          monto: parseFloat(form.monto),
          fecha: form.fecha,
          notas: form.notas,
          estado: 'Pendiente',
          referencia: `SRV-${form.tipo.toUpperCase().slice(0,3)}-${Date.now()}`
        })
      });

      if (res.ok) {
        setMsg({ type: 'ok', text: 'Servicio registrado y notificado al contribuyente.' });
        setShowModal(false);
        setForm({ tipo: 'especial', identidad: '', contribuyenteNombre: '', descripcion: '', monto: '', fecha: new Date().toISOString().split('T')[0], notas: '', camion: '', distancia: '', area: '', tipoVistoBueno: '', tipoInspeccion: '', codigoServicio: '' });
        setSearchContrib('');
        loadServicios();
      } else {
        const d = await res.json();
        setMsg({ type: 'error', text: d.error || 'Error al guardar.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id || !confirm('¿Eliminar este registro?')) return;
    await fetch(`/api/admin/servicios-especiales?id=${id}`, { method: 'DELETE' });
    loadServicios();
  };

  const serviciosFiltrados = servicios.filter(s =>
    s.tipo === tab && (
      search === '' ||
      s.contribuyente.toLowerCase().includes(search.toLowerCase()) ||
      s.identidad.toLowerCase().includes(search.toLowerCase()) ||
      s.descripcion.toLowerCase().includes(search.toLowerCase())
    )
  );

  const iconMap: Record<TipoServicio, any> = { especial: Wrench, extraordinario: FlaskConical, inspeccion: ClipboardCheck, visto_bueno: ShieldCheck };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-purple-600" />
            Servicios Especiales / Extraordinarios / Inspecciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">Asigne servicios a contribuyentes con tarifas manuales. Se sincronizan automáticamente al portal del ciudadano.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadServicios} className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button
            onClick={() => { setShowModal(true); setForm(prev => ({ ...prev, tipo: tab })); setMsg(null); }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo Servicio
          </button>
        </div>
      </div>

      {/* Alert */}
      {msg && (
        <div className={`px-4 py-3 rounded flex items-center gap-2 text-sm ${msg.type === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          {(Object.keys(TIPO_INFO) as TipoServicio[]).map(t => {
            const info = TIPO_INFO[t];
            const Icon = info.icon;
            const count = servicios.filter(s => s.tipo === t).length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-purple-600 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
              >
                <Icon className="w-4 h-4" />
                {info.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === t ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + Table */}
        <div className="p-4">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por contribuyente, RIF..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-500"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Cargando...</div>
          ) : serviciosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No hay registros. Haga clic en "Nuevo Servicio" para agregar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Referencia</th>
                    <th className="px-4 py-3">Contribuyente</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Monto (Bs)</th>
                    <th className="px-4 py-3">Origen</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center w-12">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {serviciosFiltrados.map((s, i) => (
                    <tr key={s.id || i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 group">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.referencia || '-'}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{s.contribuyente}</p>
                        <p className="text-xs text-slate-400">{s.identidad}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{s.descripcion}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{s.fecha}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">
                        Bs. {Number(s.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${(s as any).origen === 'contribuyente' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {(s as any).origen === 'contribuyente' ? '⬆ Contribuyente' : '⬇ Funcionario'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          s.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' :
                          s.estado === 'En Revisión' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {s.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all p-1 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Nuevo Servicio / Inspección</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tipo de Servicio *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TIPO_INFO) as TipoServicio[]).map(t => {
                    const info = TIPO_INFO[t];
                    const Icon = info.icon;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, tipo: t }))}
                        className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-semibold transition-all ${
                          form.tipo === t ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-center leading-tight">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Buscar Contribuyente */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Contribuyente *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o RIF..."
                    value={searchContrib}
                    onChange={e => { setSearchContrib(e.target.value); setForm(prev => ({ ...prev, identidad: '', contribuyenteNombre: '' })); }}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500"
                  />
                </div>
                {filteredContrib.length > 0 && !form.identidad && (
                  <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
                    {filteredContrib.map((c: any, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectContrib(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm border-b border-slate-50 last:border-0"
                      >
                        <p className="font-semibold text-slate-800">{c.Contribuyente}</p>
                        <p className="text-xs text-slate-500">{c.Identidad}</p>
                      </button>
                    ))}
                  </div>
                )}
                {form.identidad && (
                  <div className="mt-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="font-semibold">{form.contribuyenteNombre}</span>
                    <span className="text-purple-500">({form.identidad})</span>
                  </div>
                )}
              </div>

              {/* Campos específicos por tipo desde la Ordenanza */}
              {form.tipo === 'extraordinario' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tipo de Camión</label>
                    <select value={form.camion} onChange={e => setForm(prev => ({ ...prev, camion: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white">
                      <option value="">Seleccione...</option>
                      <option value="350">Camión 350</option>
                      <option value="600">Camión 600</option>
                      <option value="750">Camión 750 / Volteo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Distancia</label>
                    <select value={form.distancia} onChange={e => setForm(prev => ({ ...prev, distancia: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white">
                      <option value="">Seleccione...</option>
                      <option value="menor">Menor a 20 Km</option>
                      <option value="mayor">Mayor a 20 Km</option>
                    </select>
                  </div>
                </div>
              )}

              {form.tipo === 'especial' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tipo de Servicio (Ordenanza Tabla 4)</label>
                  <select value={form.codigoServicio} onChange={e => {
                    const t = (ordenanzaData as any).serviciosEspeciales?.find((s: any) => s.codigo === e.target.value);
                    setForm(prev => ({ ...prev, codigoServicio: e.target.value, descripcion: t ? t.label : prev.descripcion }));
                  }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white">
                    <option value="">Seleccione o escriba descripción libre...</option>
                    {((ordenanzaData as any).serviciosEspeciales || []).map((s: any) => (
                      <option key={s.codigo} value={s.codigo}>{s.codigo} — {s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.tipo === 'inspeccion' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tipo de Inspección (Ordenanza Tabla 5)</label>
                  <select value={form.tipoInspeccion} onChange={e => {
                    const t = (ordenanzaData as any).inspeccionesTecnicas?.find((s: any) => s.codigo === e.target.value);
                    setForm(prev => ({ ...prev, tipoInspeccion: e.target.value, descripcion: t ? t.label : prev.descripcion }));
                  }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white">
                    <option value="">Seleccione tipo de inspección...</option>
                    {((ordenanzaData as any).inspeccionesTecnicas || []).map((s: any) => (
                      <option key={s.codigo} value={s.codigo}>{s.codigo} — {s.label} ({s.tcmv} TCMV)</option>
                    ))}
                  </select>
                </div>
              )}

              {form.tipo === 'visto_bueno' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tipo Visto Bueno (Tabla 6)</label>
                    <select value={form.tipoVistoBueno} onChange={e => {
                      const t = (ordenanzaData as any).vistoBueno?.find((s: any) => s.codigo === e.target.value);
                      setForm(prev => ({ ...prev, tipoVistoBueno: e.target.value, descripcion: t ? t.label : prev.descripcion }));
                    }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white">
                      <option value="">Seleccione tipo...</option>
                      {((ordenanzaData as any).vistoBueno || []).map((s: any) => (
                        <option key={s.codigo} value={s.codigo}>{s.codigo} — {s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Área (m²)</label>
                    <input type="number" min="0" placeholder="Metros cuadrados" value={form.area}
                      onChange={e => setForm(prev => ({ ...prev, area: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
                  </div>
                </div>
              )}

              {/* Tarifa sugerida desde Ordenanza */}
              {tarifaSugerida && tcmmv > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-800 uppercase flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> Tarifa según Ordenanza
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">{tarifaSugerida.label} — {tarifaSugerida.tcmv} TCMV</p>
                    <p className="text-sm font-black text-amber-900">Bs. {(montoSugeridoBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                  </div>
                  <button type="button"
                    onClick={() => setForm(prev => ({ ...prev, monto: (montoSugeridoBs || 0).toFixed(2) }))}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors">
                    Aplicar
                  </button>
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Descripción del Servicio *</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Recolección especial de escombros en Av. Principal..."
                  value={form.descripcion}
                  onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
                  required
                />
              </div>

              {/* Monto y Fecha */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tarifa / Monto (Bs) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-semibold">Bs.</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.monto}
                      onChange={e => setForm(prev => ({ ...prev, monto: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 font-mono"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Puede ajustar el monto manualmente.</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Fecha del Servicio</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(prev => ({ ...prev, fecha: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Observaciones</label>
                <input
                  type="text"
                  placeholder="Notas adicionales (opcional)"
                  value={form.notas}
                  onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
                />
              </div>

              {msg && (
                <div className={`px-3 py-2 rounded text-xs flex items-center gap-1 ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {msg.text}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? 'Guardando...' : <><Plus className="w-4 h-4" /> Registrar Servicio</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
