'use client';
import { useState, useEffect } from 'react';
import { Wrench, Search, Plus, Trash2, CheckCircle2, AlertCircle, FlaskConical, ClipboardCheck, ShieldCheck, X, RefreshCw, BookOpen, FileSpreadsheet, TreePine } from 'lucide-react';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { useAppContext } from '@/store/AppContext';
import { TARIFAS_ESPECIAL, TARIFAS_EXTRAORDINARIO, CONCEPTOS_IAMEC, generarPlanillaServicio } from '@/lib/planillaServicio';
import { FileDown } from 'lucide-react';

type TipoServicio = 'especial' | 'extraordinario' | 'inspeccion' | 'visto_bueno' | 'tala_poda';

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
  visto_bueno: { label: 'Visto Bueno Ambiental', color: 'bg-green-100 text-green-800 border-green-200', icon: ShieldCheck, accent: 'green' },
  tala_poda: { label: 'Permisos (Tala/Poda)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: TreePine, accent: 'emerald' }
};

export default function ServiciosEspecialesPage() {
  const { contribuyentes, tcmmv: contextTcmmv } = useAppContext();
  const [tab, setTab] = useState<TipoServicio>('especial');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{type: 'ok'|'error', text: string}|null>(null);

  // BCV rate
  const [tcmmv, setTcmmv] = useState(contextTcmmv || 0);
  useEffect(() => {
    if (contextTcmmv && contextTcmmv > 0) {
      setTcmmv(contextTcmmv);
    }
  }, [contextTcmmv]);

  useEffect(() => {
    fetch('/api/bcv')
      .then(r => r.json())
      .then(d => { 
        if (d?.tcmmv && d.tcmmv > 0) setTcmmv(d.tcmmv); 
      })
      .catch(() => {});
  }, []);

  const [sinRegistro, setSinRegistro] = useState(false);

  // Formulario
  const [form, setForm] = useState({
    tipo: 'especial' as TipoServicio,
    identidad: '',
    identidadPrefijo: 'V',
    identidadNumero: '',
    contribuyenteNombre: '',
    correo: '',
    direccion: '',
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    notas: '',
    camion: '',
    distancia: '',
    area: '',
    tipoVistoBueno: '',
    tipoInspeccion: '',
    codigoServicio: '',
    tipoPermiso: '',
    alturaArbol: '',
    unidadesArboreas: '1',
    habilitadoVB: false,
    // Planilla Servicio Especial / Extraordinario
    vehiculo: '',
    nivel: '',
    nve: '1',
    contacto: '',
    telefono: '',
    nombreEvento: '',
    fechaEvento: '',
    lugar: '',
    horario: '',
    aforo: '',
    incluyePermiso: true
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
  // Cálculo de la planilla: Especial TSE = F.O.Es × NVE × 1 ; Extraordinario TSEX = C.E.V × NVE × F.llenado
  const calcPlanilla = () => {
    const nve = Math.max(1, parseFloat(form.nve || '1') || 1);
    if (form.tipo === 'especial' && form.vehiculo && form.nivel) {
      const t = TARIFAS_ESPECIAL.find(x => x.vehiculo === form.vehiculo);
      const ucd = t ? (t as any)[form.nivel] as number : 0;
      if (t && ucd) return { vehiculoLabel: t.label, nivel: form.nivel, valorUcd: ucd, nve, factor: 1 };
    }
    if (form.tipo === 'extraordinario' && form.vehiculo) {
      const t = TARIFAS_EXTRAORDINARIO.find(x => x.vehiculo === form.vehiculo);
      if (t) return { vehiculoLabel: t.label, nivel: t.nivel, valorUcd: t.ucd, nve, factor: t.factor };
    }
    return null;
  };

  const getTarifaSugerida = () => {
    const p = calcPlanilla();
    if (p) {
      const total = p.valorUcd * p.nve * p.factor;
      return { tcmv: total, label: `${form.tipo === 'especial' ? 'Servicio Especial' : 'Servicio Extraordinario'} — ${p.vehiculoLabel} (${p.nivel}) × ${p.nve} viaje(s)` };
    }
    const C = CONCEPTOS_IAMEC;
    if (form.tipo === 'inspeccion' && parseFloat(form.area || '0') > 0) {
      const m2 = parseFloat(form.area);
      return { tcmv: Math.round(C.inspeccionUcdPorM2 * m2 * 10000) / 10000, label: `Inspección técnica — ${m2} m² × ${C.inspeccionUcdPorM2} UCD` };
    }
    if (form.tipo === 'visto_bueno' && (form.tipoVistoBueno === 'VISTO_BUENO' || form.tipoVistoBueno === 'VARIABLE')) {
      const t = C.vistoBueno[form.tipoVistoBueno as 'VISTO_BUENO' | 'VARIABLE'];
      const ucd = (form.incluyePermiso ? t.fo : 0) + (form.habilitadoVB ? C.vistoBueno.multaImpago : 0);
      if (ucd > 0) return { tcmv: ucd, label: `${form.incluyePermiso ? t.label : ''}${form.incluyePermiso && form.habilitadoVB ? ' + ' : ''}${form.habilitadoVB ? `Multa por impago (${t.label})` : ''}` };
    }
    if (form.tipo === 'tala_poda' && (form.tipoPermiso === 'PODA' || form.tipoPermiso === 'TALA')) {
      const t = form.tipoPermiso === 'PODA' ? C.poda : C.tala;
      const tramo = form.alturaArbol as '5' | '20' | 'MAS20' | '';
      const multa = tramo ? t.multas[tramo] : 0;
      const ucd = (form.incluyePermiso ? t.permiso : 0) + multa;
      const nombre = form.tipoPermiso === 'PODA' ? 'Poda' : 'Tala';
      if (ucd > 0) return { tcmv: ucd, label: `${form.incluyePermiso ? `Permiso de ${nombre}` : ''}${form.incluyePermiso && multa ? ' + ' : ''}${multa ? `Multa por ${nombre} sin autorización (${C.tramosMulta[tramo as '5']})` : ''}` };
    }
    return null;
  };

  const tarifaSugerida = getTarifaSugerida();
  const montoSugeridoBs = tarifaSugerida && tcmmv > 0 ? tarifaSugerida.tcmv * tcmmv : null;

  // Auto-calcular monto automáticamente al seleccionar opciones
  useEffect(() => {
    const tarifa = getTarifaSugerida();
    if (tarifa && tcmmv > 0) {
      const bs = tarifa.tcmv * tcmmv;
      setForm(prev => ({
        ...prev,
        monto: bs.toFixed(2),
        descripcion: (!prev.descripcion.trim() || /^(Camión|Servicio|Tala|Poda|Permiso|Multa|Inspección|Visto|Variable)/.test(prev.descripcion))
          ? tarifa.label
          : prev.descripcion
      }));
    }
  }, [
    form.tipo,
    form.camion,
    form.distancia,
    form.codigoServicio,
    form.tipoInspeccion,
    form.tipoVistoBueno,
    form.area,
    form.habilitadoVB,
    form.tipoPermiso,
    form.alturaArbol,
    form.unidadesArboreas,
    form.vehiculo,
    form.nivel,
    form.nve,
    form.incluyePermiso,
    tcmmv
  ]);

  // Búsqueda por nombre, cédula/RIF o CÓDIGO de inmueble (URB…, COM…, etc.)
  const [inmuebleSel, setInmuebleSel] = useState('');
  const qContrib = searchContrib.trim().toLowerCase();
  const qNorm = qContrib.replace(/[^a-z0-9]/g, '');
  const filteredContrib = qContrib.length > 1 ? contribuyentes.map((c: any) => {
    const codigos = String(c.CodCont || '').split(/\s+/).filter(Boolean);
    const cod = codigos.find((k: string) => k.toLowerCase().includes(qContrib));
    const ok = cod || (c.Contribuyente || '').toLowerCase().includes(qContrib)
      || (qNorm.length > 1 && (c.Identidad || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(qNorm));
    return ok ? { ...c, _codigo: cod || '', _codigos: codigos } : null;
  }).filter(Boolean).slice(0, 8) : [];

  const selectContrib = (c: any) => {
    setForm(prev => ({ ...prev, identidad: c.Identidad || '', contribuyenteNombre: c.Contribuyente || '' }));
    setInmuebleSel(c._codigo || (c._codigos?.length === 1 ? c._codigos[0] : ''));
    setSearchContrib(c.Contribuyente || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalIdentidad = sinRegistro
      ? (form.identidadNumero ? `${form.identidadPrefijo}-${form.identidadNumero.trim()}` : (form.identidad || ''))
      : form.identidad;

    if (!sinRegistro && !finalIdentidad) {
      setMsg({ type: 'error', text: 'Seleccione un contribuyente o active el modo "Registrar sin usuario en sistema".' });
      return;
    }
    if (sinRegistro && !form.contribuyenteNombre.trim()) {
      setMsg({ type: 'error', text: 'Ingrese el nombre o razón social del solicitante.' });
      return;
    }
    if (!form.descripcion) { setMsg({ type: 'error', text: 'Ingrese una descripción.' }); return; }
    if (!form.monto || isNaN(Number(form.monto))) { setMsg({ type: 'error', text: 'Ingrese un monto válido.' }); return; }

    setIsSubmitting(true);
    setMsg(null);

    // Generar código único para la planilla y búsqueda en caja
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    const codigoUnico = sinRegistro
      ? `SRV-${yearSuffix}-${randomSeq}`
      : `SRV-${form.tipo.toUpperCase().slice(0,3)}-${Date.now().toString().slice(-6)}`;

    try {
      const res = await fetch('/api/admin/servicios-especiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          identidad: finalIdentidad || codigoUnico,
          contribuyente: form.contribuyenteNombre,
          descripcion: form.descripcion,
          monto: parseFloat(form.monto),
          fecha: form.fecha,
          notas: `${form.notas || ''}${sinRegistro ? ' [SIN_REGISTRO_PREVIO]' : ''}`.trim(),
          estado: 'Pendiente',
          referencia: codigoUnico,
          origen: sinRegistro ? 'funcionario_sin_registro' : 'funcionario',
          telefono: form.telefono || null,
          correo: form.correo || null,
          direccion_evento: form.lugar || form.direccion || null,
          ...(inmuebleSel ? { inmueble: inmuebleSel } : {}),
          ...(() => {
            const p = calcPlanilla();
            if (!p || (form.tipo !== 'especial' && form.tipo !== 'extraordinario')) return {};
            return {
              categoria: form.tipo === 'especial' ? 'ESPECIAL' : 'EXTRAORDINARIO',
              vehiculo: form.vehiculo, nivel: p.nivel, valor_ucd: p.valorUcd, nve: p.nve, factor: p.factor,
              tasa_euro: tcmmv || null,
              nombre_evento: form.nombreEvento || null, fecha_evento: form.fechaEvento || null,
              hora_evento: form.horario || null, direccion_evento: form.lugar || form.direccion || null,
              aforo: form.aforo ? parseInt(form.aforo) : null, telefono: form.telefono || null,
              correo: form.correo || null,
              notas: `${form.notas || ''}${form.contacto ? ` [CONTACTO:${form.contacto}]` : ''}`.trim(),
            };
          })()
        })
      });

      if (res.ok) {
        setMsg({
          type: 'ok',
          text: `Servicio registrado con éxito. CÓDIGO ÚNICO DE COBRO EN CAJA: ${codigoUnico}. Se generó la planilla oficial.`
        });

        // Descargar la planilla automáticamente con el código único generado
        if (form.tipo === 'especial' || form.tipo === 'extraordinario') {
          const p = calcPlanilla();
          descargarPlanilla(form.tipo, {
            vehiculo: form.vehiculo,
            referencia: codigoUnico,
            contribuyente: form.contribuyenteNombre,
            identidad: finalIdentidad || codigoUnico,
            contacto: form.contacto || form.contribuyenteNombre,
            telefono: form.telefono,
            nombre_evento: form.nombreEvento,
            fecha_evento: form.fechaEvento,
            direccion_evento: form.lugar || form.direccion,
            hora_evento: form.horario,
            aforo: form.aforo,
            valor_ucd: p?.valorUcd,
            nve: p?.nve,
            factor: p?.factor,
            tasa_euro: tcmmv,
          });
        }

        setShowModal(false);
        setSinRegistro(false);
        setForm({
          tipo: 'especial',
          identidad: '',
          identidadPrefijo: 'V',
          identidadNumero: '',
          contribuyenteNombre: '',
          correo: '',
          direccion: '',
          descripcion: '',
          monto: '',
          fecha: new Date().toISOString().split('T')[0],
          notas: '',
          camion: '',
          distancia: '',
          area: '',
          tipoVistoBueno: '',
          tipoInspeccion: '',
          codigoServicio: '',
          tipoPermiso: '',
          alturaArbol: '',
          unidadesArboreas: '1',
          habilitadoVB: false,
          vehiculo: '',
          nivel: '',
          nve: '1',
          contacto: '',
          telefono: '',
          nombreEvento: '',
          fechaEvento: '',
          lugar: '',
          horario: '',
          aforo: '',
          incluyePermiso: true
        });
        setSearchContrib(''); setInmuebleSel('');
        loadServicios();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: 'error', text: d.error || 'Error al guardar.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de conexión con el servidor.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id?: any) => {
    if (!id || !confirm('¿Eliminar este registro?')) return;
    await fetch(`/api/admin/servicios-especiales?id=${id}`, { method: 'DELETE' });
    loadServicios();
  };

  /** Descarga la planilla oficial (llena con el registro, o en blanco si no se pasa registro). */
  const descargarPlanilla = (categoria: 'especial' | 'extraordinario', s?: any) => {
    if (!s) { generarPlanillaServicio({ categoria }); return; }
    const tEsp = TARIFAS_ESPECIAL.find(x => x.vehiculo === s.vehiculo);
    const tExt = TARIFAS_EXTRAORDINARIO.find(x => x.vehiculo === s.vehiculo);
    const valorUcd = s.valor_ucd != null ? Number(s.valor_ucd) : null;
    const tasa = s.tasa_euro != null ? Number(s.tasa_euro) : null;
    const contacto = String(s.notas || '').match(/\[CONTACTO:([^\]]*)\]/)?.[1] || '';
    generarPlanillaServicio({
      categoria,
      fechaEmision: s.fecha || s.created_at,
      referencia: s.referencia,
      nombre: s.contribuyente,
      identidad: s.identidad,
      contacto,
      telefono: s.telefono || '',
      nombreEvento: s.nombre_evento || (categoria === 'especial' ? s.descripcion : ''),
      fechaEvento: s.fecha_evento || '',
      lugar: s.direccion_evento || '',
      horario: s.hora_evento || '',
      aforo: s.aforo ?? '',
      direccion: s.direccion_evento || '',
      vehiculoLabel: tEsp?.label || tExt?.label || s.descripcion,
      nivel: s.nivel || '',
      valorUcd,
      nve: valorUcd != null ? Number(s.nve ?? 1) : null,
      factor: valorUcd != null ? Number(s.factor ?? 1) : null,
      tasaEuro: tasa,
    });
  };

  const serviciosFiltrados = servicios.filter(s =>
    s.tipo === tab && (
      search === '' ||
      s.contribuyente.toLowerCase().includes(search.toLowerCase()) ||
      s.identidad.toLowerCase().includes(search.toLowerCase()) ||
      s.descripcion.toLowerCase().includes(search.toLowerCase())
    )
  );

  const iconMap: Record<TipoServicio, any> = { especial: Wrench, extraordinario: FlaskConical, inspeccion: ClipboardCheck, visto_bueno: ShieldCheck, tala_poda: TreePine };

  const exportarServicios = () => {
    if (serviciosFiltrados.length === 0) return alert('No hay registros para exportar.');
    const data = serviciosFiltrados.map(s => ({
      'Referencia': s.referencia || '---',
      'Tipo': TIPO_INFO[s.tipo].label,
      'Contribuyente': s.contribuyente,
      'Identidad': s.identidad,
      'Descripcion': s.descripcion,
      'Fecha': s.fecha,
      'Monto (Bs)': Number(s.monto || 0).toFixed(2),
      'Estado': s.estado,
    }));
    exportToExcelWithLogos(data, `Servicios_${tab}_${new Date().toISOString().split('T')[0]}.xlsx`, TIPO_INFO[tab].label);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-purple-600" />
            Servicios Especiales / Extraordinarios / Inspecciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">Solo servicios oficiales de la Ordenanza / IAMEC; monto = UCD × Tasa Euro BCV. Se sincronizan automáticamente al portal del ciudadano.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadServicios} className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          {(tab === 'especial' || tab === 'extraordinario') && (
            <button
              onClick={() => descargarPlanilla(tab as 'especial' | 'extraordinario')}
              className="flex items-center gap-1 px-3 py-2 border border-emerald-300 rounded text-sm text-emerald-700 hover:bg-emerald-50"
              title="Descargar la planilla oficial en blanco para llenar a mano"
            >
              <FileDown className="w-4 h-4" /> Planilla en blanco
            </button>
          )}
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
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {(s.tipo === 'especial' || s.tipo === 'extraordinario') && (
                          <button onClick={() => descargarPlanilla(s.tipo as 'especial' | 'extraordinario', s)} className="text-emerald-600 hover:text-emerald-800 p-1 rounded" title="Descargar planilla">
                            <FileDown className="w-4 h-4" />
                          </button>
                        )}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <h3 className="font-bold text-slate-800">Nuevo Servicio / Inspección</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tipo de Servicio *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {(Object.keys(TIPO_INFO) as TipoServicio[]).map(t => {
                    const info = TIPO_INFO[t];
                    const Icon = info.icon;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setForm(prev => ({ ...prev, tipo: t, camion: '', distancia: '', vehiculo: '', nivel: '', tipoPermiso: '', alturaArbol: '', tipoVistoBueno: '', area: '' }));
                          setMsg(null);
                        }}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                          form.tipo === t ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-center leading-tight text-[11px]">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selector de Modo: Contribuyente Registrado vs No Registrado */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    {sinRegistro ? '👤 Solicitante No Registrado (Genera Código Único)' : 'Contribuyente Registrado *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSinRegistro(!sinRegistro);
                      if (!sinRegistro) {
                        setSearchContrib('');
                        setInmuebleSel('');
                      }
                    }}
                    className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all ${
                      sinRegistro
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {sinRegistro ? '✓ Modo: Sin Usuario Activo' : '+ Registrar Sin Usuario en Sistema'}
                  </button>
                </div>

                {!sinRegistro ? (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar por código (URB…), nombre o RIF..."
                        value={searchContrib}
                        onChange={e => { setSearchContrib(e.target.value); setForm(prev => ({ ...prev, identidad: '', contribuyenteNombre: '' })); }}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 bg-white"
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
                            <p className="text-xs text-slate-500">{c.Identidad}{c._codigo ? <> · <b className="text-purple-700">{c._codigo}</b></> : c._codigos?.length ? ` · ${c._codigos.slice(0, 3).join(', ')}${c._codigos.length > 3 ? '…' : ''}` : ''}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {form.identidad && (
                      <div className="mt-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="font-semibold">{form.contribuyenteNombre}</span>
                        <span className="text-purple-500">({form.identidad}){inmuebleSel ? ` · ${inmuebleSel}` : ''}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p>
                        <b>Código Único en Planilla:</b> Se generará un código único impreso para que el cliente pague directamente en taquilla de Caja sin requerir usuario en el sistema.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nombre Completo o Razón Social *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Inversiones Los Samanes C.A. o Pedro Pérez"
                        value={form.contribuyenteNombre}
                        onChange={e => setForm(prev => ({ ...prev, contribuyenteNombre: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Tipo Doc.</label>
                        <select
                          value={form.identidadPrefijo}
                          onChange={e => setForm(prev => ({ ...prev, identidadPrefijo: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                        >
                          <option value="V">V (Venezolano)</option>
                          <option value="J">J (Jurídico / RIF)</option>
                          <option value="E">E (Extranjero)</option>
                          <option value="G">G (Gubernamental)</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Cédula / RIF</label>
                        <input
                          type="text"
                          placeholder="Número de cédula o RIF"
                          value={form.identidadNumero}
                          onChange={e => setForm(prev => ({ ...prev, identidadNumero: e.target.value.replace(/[^0-9]/g, '') }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Teléfono / Celular</label>
                        <input
                          type="text"
                          placeholder="0414-1234567"
                          value={form.telefono}
                          onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Correo Electrónico</label>
                        <input
                          type="email"
                          placeholder="cliente@correo.com"
                          value={form.correo}
                          onChange={e => setForm(prev => ({ ...prev, correo: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Dirección / Ubicación del Solicitante</label>
                      <input
                        type="text"
                        placeholder="Dirección fiscal o residencia"
                        value={form.direccion}
                        onChange={e => setForm(prev => ({ ...prev, direccion: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Servicio Especial / Extraordinario — campos de la planilla oficial */}
              {(form.tipo === 'especial' || form.tipo === 'extraordinario') && (() => {
                const inp = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white";
                const lbl = "block text-xs font-bold text-slate-600 uppercase mb-1";
                const esp = form.tipo === 'especial';
                const p = calcPlanilla();
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className={esp ? '' : 'col-span-2'}>
                        <label className={lbl}>{esp ? 'Capacidad y tipo de unidad' : 'C.E.V (Volteo)'}</label>
                        <select value={form.vehiculo} onChange={e => setForm(prev => ({ ...prev, vehiculo: e.target.value }))} className={inp}>
                          <option value="">Seleccione...</option>
                          {(esp ? TARIFAS_ESPECIAL : TARIFAS_EXTRAORDINARIO).map(t => (
                            <option key={t.vehiculo} value={t.vehiculo}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      {esp && (
                        <div>
                          <label className={lbl}>Nivel (F.O.Es)</label>
                          <select value={form.nivel} onChange={e => setForm(prev => ({ ...prev, nivel: e.target.value }))} className={inp}>
                            <option value="">Seleccione...</option>
                            {(['BAJA', 'MEDIA', 'ALTA'] as const).map(n => {
                              const t = TARIFAS_ESPECIAL.find(x => x.vehiculo === form.vehiculo);
                              return <option key={n} value={n}>{n}{t ? ` — ${t[n]} UCD` : ''}</option>;
                            })}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={lbl}>NVE (N° de viajes)</label>
                        <input type="number" min="1" value={form.nve} onChange={e => setForm(prev => ({ ...prev, nve: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>{esp ? 'FAEs' : 'F. llenado'}</label>
                        <input disabled value={p ? String(p.factor).replace('.', ',') : (esp ? '1' : '—')} className={`${inp} bg-slate-100`} />
                      </div>
                    </div>
                    {p && (
                      <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-800">
                        {esp ? 'TSE' : 'TSEX'} = {p.valorUcd} × {p.nve} × {String(p.factor).replace('.', ',')} = <b>{(p.valorUcd * p.nve * p.factor).toLocaleString('es-VE')} UCD</b>
                        {tcmmv > 0 && <> · × Tasa Euro {tcmmv.toLocaleString('es-VE', { minimumFractionDigits: 2 })} = <b>Bs. {(p.valorUcd * p.nve * p.factor * tcmmv).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Persona de contacto</label>
                        <input value={form.contacto} onChange={e => setForm(prev => ({ ...prev, contacto: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Teléfono</label>
                        <input value={form.telefono} onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value }))} className={inp} />
                      </div>
                      {esp && (
                        <div className="col-span-2">
                          <label className={lbl}>Nombre del evento</label>
                          <input value={form.nombreEvento} onChange={e => setForm(prev => ({ ...prev, nombreEvento: e.target.value }))} className={inp} />
                        </div>
                      )}
                      <div className="col-span-2">
                        <label className={lbl}>{esp ? 'Lugar' : 'Dirección'}</label>
                        <input value={form.lugar} onChange={e => setForm(prev => ({ ...prev, lugar: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Fecha del servicio</label>
                        <input type="date" value={form.fechaEvento} onChange={e => setForm(prev => ({ ...prev, fechaEvento: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Horario</label>
                        <input placeholder="Ej: 8:00 am a 4:00 pm" value={form.horario} onChange={e => setForm(prev => ({ ...prev, horario: e.target.value }))} className={inp} />
                      </div>
                      {esp && (
                        <div>
                          <label className={lbl}>Aforo</label>
                          <input type="number" min="0" value={form.aforo} onChange={e => setForm(prev => ({ ...prev, aforo: e.target.value }))} className={inp} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Inspección, Visto Bueno / Variable Ambiental, Poda / Tala — SOLO conceptos oficiales del IAMEC */}
              {(form.tipo === 'inspeccion' || form.tipo === 'visto_bueno' || form.tipo === 'tala_poda') && (() => {
                const inp = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white";
                const lbl = "block text-xs font-bold text-slate-600 uppercase mb-1";
                const C = CONCEPTOS_IAMEC;
                if (form.tipo === 'inspeccion') return (
                  <div>
                    <label className={lbl}>Cantidad de m² del inmueble ({C.inspeccionUcdPorM2} UCD por m²)</label>
                    <input type="number" min="0" placeholder="Metros cuadrados" value={form.area}
                      onChange={e => setForm(prev => ({ ...prev, area: e.target.value }))} className={inp} />
                  </div>
                );
                if (form.tipo === 'visto_bueno') return (
                  <div className="space-y-3">
                    <div>
                      <label className={lbl}>Trámite</label>
                      <select value={form.tipoVistoBueno} onChange={e => setForm(prev => ({ ...prev, tipoVistoBueno: e.target.value }))} className={inp}>
                        <option value="">Seleccione...</option>
                        <option value="VISTO_BUENO">Visto Bueno Ambiental ({C.vistoBueno.VISTO_BUENO.fo} UCD)</option>
                        <option value="VARIABLE">Variable Ambiental ({C.vistoBueno.VARIABLE.fo} UCD)</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.incluyePermiso} onChange={e => setForm(prev => ({ ...prev, incluyePermiso: e.target.checked }))} className="w-4 h-4 accent-purple-600" />
                      Cobrar el trámite
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.habilitadoVB} onChange={e => setForm(prev => ({ ...prev, habilitadoVB: e.target.checked }))} className="w-4 h-4 accent-purple-600" />
                      Multa por impago (+{C.vistoBueno.multaImpago} UCD)
                    </label>
                  </div>
                );
                const t = form.tipoPermiso === 'TALA' ? C.tala : C.poda;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>Permiso</label>
                        <select value={form.tipoPermiso} onChange={e => setForm(prev => ({ ...prev, tipoPermiso: e.target.value }))} className={inp}>
                          <option value="">Seleccione...</option>
                          <option value="PODA">Poda ({C.poda.permiso} UCD)</option>
                          <option value="TALA">Tala ({C.tala.permiso} UCD)</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Multa sin autorización</label>
                        <select value={form.alturaArbol} onChange={e => setForm(prev => ({ ...prev, alturaArbol: e.target.value }))} className={inp} disabled={!form.tipoPermiso}>
                          <option value="">Sin multa</option>
                          {(['5', '20', 'MAS20'] as const).map(k => (
                            <option key={k} value={k}>{C.tramosMulta[k]} ({t.multas[k]} UCD)</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.incluyePermiso} onChange={e => setForm(prev => ({ ...prev, incluyePermiso: e.target.checked }))} className="w-4 h-4 accent-purple-600" />
                      Cobrar el permiso
                    </label>
                  </div>
                );
              })()}

              {/* Tarifa sugerida desde Ordenanza */}
              {tarifaSugerida && tcmmv > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between shadow-2xs">
                  <div>
                    <p className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Tarifa oficial calculada
                    </p>
                    <p className="text-xs text-emerald-700 mt-0.5 font-medium">{tarifaSugerida.label} — {tarifaSugerida.tcmv.toLocaleString('es-VE')} UCD × Tasa Euro Bs. {tcmmv.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    <p className="text-base font-black text-emerald-950 mt-0.5">Bs. {(montoSugeridoBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                  </div>
                  <button type="button"
                    onClick={() => setForm(prev => ({ ...prev, monto: (montoSugeridoBs || 0).toFixed(2) }))}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs"
                    title="Restablecer al monto oficial de la ordenanza">
                    Reaplicar
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
