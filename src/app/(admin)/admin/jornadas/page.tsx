'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Target,
  FileDown,
  Plus,
  MapPin,
  CheckCircle,
  Upload,
  FileText,
  Eye,
  Trash2,
  Edit3,
  X,
  Loader2,
  Download,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InformeJornada {
  id: string;
  nombre: string;
  url: string;
  path?: string;
  fecha_subida: string;
  subido_por?: string;
}

interface JornadaCampo {
  id: string;
  fecha: string;
  sector: string;
  equipo: string;
  status: 'Planificada' | 'En Proceso' | 'Completada' | 'Cancelada';
  comerciosA_Visitar: number;
  comercios_Visitados: number;
  observaciones?: string;
  informes?: InformeJornada[];
}

export default function JornadasPage() {
  const [jornadas, setJornadas] = useState<JornadaCampo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Modal de Crear / Editar Jornada
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formJornada, setFormJornada] = useState({
    fecha: '',
    sector: '',
    equipo: '',
    status: 'Planificada' as JornadaCampo['status'],
    comerciosA_Visitar: 0,
    comercios_Visitados: 0,
    observaciones: '',
  });
  const [modalFiles, setModalFiles] = useState<File[]>([]);

  // Modal de Gestión y Vista Previa de Informes PDF
  const [jornadaInformesActiva, setJornadaInformesActiva] = useState<JornadaCampo | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; nombre: string } | null>(null);

  const fileInputRowRef = useRef<HTMLInputElement | null>(null);
  const [targetRowIdForUpload, setTargetRowIdForUpload] = useState<string | null>(null);

  const cargarJornadas = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/jornadas', { cache: 'no-store' });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.jornadas)) {
        setJornadas(data.jornadas);
      }
    } catch (e) {
      console.error('Error cargando jornadas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarJornadas();
  }, []);

  const subirArchivoPDF = async (file: File): Promise<InformeJornada> => {
    let publicUrl = '';
    let storagePath = '';

    // 1. Intentar subida directa con URL firmada a Supabase Storage (soporta PDFs grandes sin límite serverless)
    try {
      const signRes = await fetch(
        `/api/upload?bucket=documentos&folder=jornadas_informes&name=${encodeURIComponent(file.name)}`
      );
      const signData = await signRes.json();
      if (signRes.ok && signData?.success && signData.path && signData.token) {
        const { error: upErr } = await supabase.storage
          .from('documentos')
          .uploadToSignedUrl(signData.path, signData.token, file, {
            contentType: file.type || 'application/pdf',
          });
        if (!upErr && signData.publicUrl) {
          publicUrl = signData.publicUrl;
          storagePath = signData.path;
        }
      }
    } catch (_) {}

    // 2. Fallback a POST /api/upload si la subida firmada no estuvo disponible
    if (!publicUrl) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', 'documentos');
      fd.append('folder', 'jornadas_informes');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'No se pudo subir el archivo PDF');
      }
      publicUrl = data.publicUrl || data.url || data.fileUrl;
      storagePath = data.path || '';
    }

    let activeUser = 'Operador';
    if (typeof window !== 'undefined') {
      try {
        const uData = JSON.parse(localStorage.getItem('admin_user_data') || '{}');
        activeUser = uData.nombre || uData.usuario || localStorage.getItem('adminUser') || 'Operador';
      } catch {}
    }

    return {
      id: `INF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nombre: file.name,
      url: publicUrl,
      path: storagePath,
      fecha_subida: new Date().toISOString(),
      subido_por: activeUser,
    };
  };

  const abrirModalNueva = () => {
    setEditingId(null);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    setFormJornada({
      fecha: hoy,
      sector: '',
      equipo: '',
      status: 'Planificada',
      comerciosA_Visitar: 0,
      comercios_Visitados: 0,
      observaciones: '',
    });
    setModalFiles([]);
    setIsModalOpen(true);
  };

  const abrirModalEditar = (j: JornadaCampo) => {
    setEditingId(j.id);
    setFormJornada({
      fecha: j.fecha || '',
      sector: j.sector || '',
      equipo: j.equipo || '',
      status: j.status || 'Planificada',
      comerciosA_Visitar: Number(j.comerciosA_Visitar) || 0,
      comercios_Visitados: Number(j.comercios_Visitados) || 0,
      observaciones: j.observaciones || '',
    });
    setModalFiles([]);
    setIsModalOpen(true);
  };

  const guardarJornada = async () => {
    if (!formJornada.fecha || !formJornada.sector.trim() || !formJornada.equipo.trim()) {
      alert('Completa Fecha, Sector y Equipo Asignado.');
      return;
    }

    setSaving(true);
    try {
      const informesSubidos: InformeJornada[] = [];
      for (const f of modalFiles) {
        const inf = await subirArchivoPDF(f);
        informesSubidos.push(inf);
      }

      if (editingId) {
        const jornadaActual = jornadas.find((x) => x.id === editingId);
        const informesPrevios = Array.isArray(jornadaActual?.informes) ? jornadaActual!.informes! : [];
        const res = await fetch('/api/admin/jornadas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            cambios: {
              ...formJornada,
              informes: [...informesPrevios, ...informesSubidos],
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Error al actualizar jornada');
        setJornadas(data.jornadas);
      } else {
        const res = await fetch('/api/admin/jornadas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formJornada,
            informes: informesSubidos,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Error al crear jornada');
        setJornadas(data.jornadas);
      }

      setIsModalOpen(false);
      setModalFiles([]);
    } catch (err: any) {
      alert(err.message || 'Error guardando la jornada');
    } finally {
      setSaving(false);
    }
  };

  const eliminarJornada = async (j: JornadaCampo) => {
    if (!confirm(`¿Está seguro de eliminar la jornada del sector "${j.sector}" (${j.fecha})?`)) return;
    try {
      const res = await fetch(`/api/admin/jornadas?id=${encodeURIComponent(j.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo eliminar');
      setJornadas(data.jornadas);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
    }
  };

  const dispararSubidaInformeEnFila = (jornadaId: string) => {
    setTargetRowIdForUpload(jornadaId);
    if (fileInputRowRef.current) {
      fileInputRowRef.current.value = '';
      fileInputRowRef.current.click();
    }
  };

  const handleSubirInformeDirecto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !targetRowIdForUpload) return;

    const jId = targetRowIdForUpload;
    setUploadingId(jId);
    try {
      let listaActualizada = jornadas;
      let jornadaAct: JornadaCampo | null = null;
      for (const file of Array.from(files)) {
        const inf = await subirArchivoPDF(file);
        const res = await fetch('/api/admin/jornadas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: jId,
            nuevoInforme: inf,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Error al adjuntar informe');
        listaActualizada = data.jornadas;
        jornadaAct = data.jornada;
      }
      setJornadas(listaActualizada);
      if (jornadaInformesActiva && jornadaInformesActiva.id === jId && jornadaAct) {
        setJornadaInformesActiva(jornadaAct);
      }
    } catch (err: any) {
      alert(err.message || 'Error subiendo informe PDF');
    } finally {
      setUploadingId(null);
      setTargetRowIdForUpload(null);
    }
  };

  const eliminarInformePDF = async (jornadaId: string, informeId: string, nombre: string) => {
    if (!confirm(`¿Eliminar el informe PDF "${nombre}"?`)) return;
    try {
      const res = await fetch('/api/admin/jornadas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: jornadaId,
          eliminarInformeId: informeId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'No se pudo eliminar el informe');
      setJornadas(data.jornadas);
      if (jornadaInformesActiva && jornadaInformesActiva.id === jornadaId) {
        setJornadaInformesActiva(data.jornada);
      }
      if (pdfPreview) setPdfPreview(null);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar el informe');
    }
  };

  const exportarReportePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('IAMEC - REPORTE DE OPERATIVIDAD DE JORNADAS DE CAMPO (CENSO)', 14, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Fecha de emisión: ${new Date().toLocaleDateString('es-VE')} | Total Jornadas: ${jornadas.length} | Comercios Objetivo: ${jornadas.reduce(
        (a, b) => a + (Number(b.comerciosA_Visitar) || 0),
        0
      )} | Censos Completados: ${jornadas.reduce((a, b) => a + (Number(b.comercios_Visitados) || 0), 0)}`,
      14,
      23
    );

    autoTable(doc, {
      startY: 28,
      head: [['Fecha', 'Sector / Zona', 'Equipo Asignado', 'Meta Comercios', 'Censos Completados', 'Estatus', 'Informes PDF', 'Observaciones']],
      body: jornadas.map((j) => [
        j.fecha,
        j.sector,
        j.equipo,
        String(j.comerciosA_Visitar || 0),
        String(j.comercios_Visitados || 0),
        j.status,
        `${(j.informes || []).length} archivo(s)`,
        j.observaciones || '—',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [234, 88, 12] },
    });

    doc.save(`Reporte_Jornadas_Censo_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getStatusBadge = (st: JornadaCampo['status']) => {
    switch (st) {
      case 'Completada':
        return 'bg-emerald-100 text-emerald-700';
      case 'En Proceso':
        return 'bg-blue-100 text-blue-700';
      case 'Cancelada':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-orange-100 text-orange-700';
    }
  };

  const totalObjetivo = jornadas.reduce((a, b) => a + (Number(b.comerciosA_Visitar) || 0), 0);
  const totalCompletados = jornadas.reduce((a, b) => a + (Number(b.comercios_Visitados) || 0), 0);
  const totalInformes = jornadas.reduce((a, b) => a + ((b.informes || []).length || 0), 0);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-6 relative">
      {/* Input oculto para subir PDF desde cualquier fila o desde el modal de informes */}
      <input
        ref={fileInputRowRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={handleSubirInformeDirecto}
      />

      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-orange-600" />
          <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">
            Jornadas de Campo (Censo)
          </h1>
        </div>
        <button
          onClick={abrirModalNueva}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow"
        >
          <Plus size={16} /> Planificar Jornada
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="bg-blue-100 p-4 rounded-full">
            <Target className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Comercios Objetivo (Mes)</p>
            <p className="text-2xl font-black text-slate-800">{totalObjetivo}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="bg-emerald-100 p-4 rounded-full">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Censos Completados</p>
            <p className="text-2xl font-black text-slate-800">{totalCompletados}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Reporte de Operatividad</p>
            <p className="text-xs text-slate-400 mt-1">
              Exporta el rendimiento por sector ({totalInformes} informe{totalInformes === 1 ? '' : 's'} PDF adjunto{totalInformes === 1 ? '' : 's'}).
            </p>
          </div>
          <button
            onClick={exportarReportePDF}
            title="Descargar Reporte de Operatividad en PDF"
            className="bg-slate-100 hover:bg-slate-200 p-3 rounded-full text-slate-700 transition-colors"
          >
            <FileDown className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Cronograma de Jornadas</h2>
          <span className="text-xs text-slate-500 font-medium">
            {jornadas.length} jornada{jornadas.length === 1 ? '' : 's'} registrada{jornadas.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
              Cargando cronograma de jornadas...
            </div>
          ) : jornadas.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              No hay jornadas registradas. Haz clic en <b>+ Planificar Jornada</b> para agregar una.
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Sector</th>
                  <th className="px-6 py-3">Equipo Asignado</th>
                  <th className="px-6 py-3">Meta / Visitados</th>
                  <th className="px-6 py-3">Estatus</th>
                  <th className="px-6 py-3">Informes (PDF)</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {jornadas.map((j) => {
                  const infs = Array.isArray(j.informes) ? j.informes : [];
                  const isUploadingThis = uploadingId === j.id;
                  return (
                    <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold whitespace-nowrap">{j.fecha}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 font-medium text-slate-800">
                          <MapPin size={14} className="text-slate-400 shrink-0" /> {j.sector}
                        </div>
                        {j.observaciones && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{j.observaciones}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">{j.equipo}</td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800">{j.comerciosA_Visitar}</span>
                        <span className="text-xs text-slate-400 ml-1">
                          ({j.comercios_Visitados || 0} completados)
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`${getStatusBadge(j.status)} px-2.5 py-1 rounded text-xs font-bold`}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => dispararSubidaInformeEnFila(j.id)}
                            disabled={isUploadingThis}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors disabled:opacity-50"
                            title="Subir Informe en PDF"
                          >
                            {isUploadingThis ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Upload size={13} />
                            )}
                            {isUploadingThis ? 'Subiendo...' : 'Subir PDF'}
                          </button>

                          {infs.length > 0 && (
                            <button
                              onClick={() => {
                                setJornadaInformesActiva(j);
                                setPdfPreview({ url: infs[0].url, nombre: infs[0].nombre });
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                              title="Ver informes PDF cargados"
                            >
                              <Eye size={13} />
                              Ver PDF ({infs.length})
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => abrirModalEditar(j)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar Jornada"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => eliminarJornada(j)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar Jornada"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Crear / Editar Jornada */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">
                {editingId ? 'Editar Jornada de Campo' : 'Planificar Nueva Jornada'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-slate-700">Fecha</label>
                  <input
                    type="date"
                    value={formJornada.fecha}
                    onChange={(e) => setFormJornada({ ...formJornada, fecha: e.target.value })}
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-slate-700">Estatus</label>
                  <select
                    value={formJornada.status}
                    onChange={(e) =>
                      setFormJornada({
                        ...formJornada,
                        status: e.target.value as JornadaCampo['status'],
                      })
                    }
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white"
                  >
                    <option value="Planificada">Planificada</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Completada">Completada</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1 text-slate-700">Sector / Zona</label>
                <input
                  type="text"
                  value={formJornada.sector}
                  onChange={(e) => setFormJornada({ ...formJornada, sector: e.target.value })}
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                  placeholder="Ej. Casco Central / Av. Universidad"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1 text-slate-700">
                  Equipo / Operadores
                </label>
                <input
                  type="text"
                  value={formJornada.equipo}
                  onChange={(e) => setFormJornada({ ...formJornada, equipo: e.target.value })}
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                  placeholder="Ej. Equipo 1 (Maria, Juan)"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-slate-700">
                    Meta (Comercios a Visitar)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formJornada.comerciosA_Visitar}
                    onChange={(e) =>
                      setFormJornada({
                        ...formJornada,
                        comerciosA_Visitar: Number(e.target.value),
                      })
                    }
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-slate-700">
                    Censos Completados
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formJornada.comercios_Visitados}
                    onChange={(e) =>
                      setFormJornada({
                        ...formJornada,
                        comercios_Visitados: Number(e.target.value),
                      })
                    }
                    className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1 text-slate-700">
                  Observaciones (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={formJornada.observaciones}
                  onChange={(e) =>
                    setFormJornada({ ...formJornada, observaciones: e.target.value })
                  }
                  className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                  placeholder="Notas o novedades de la jornada..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1 text-slate-700">
                  Adjuntar Informes en PDF (Opcional)
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-orange-500 rounded-xl p-4 cursor-pointer bg-slate-50 hover:bg-orange-50/40 transition-colors">
                  <Upload className="w-6 h-6 text-orange-600 mb-1" />
                  <span className="text-xs font-semibold text-slate-700">
                    Haz clic para seleccionar uno o varios PDF de informes
                  </span>
                  <span className="text-[11px] text-slate-400">Formato PDF (hasta 25 MB)</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setModalFiles(Array.from(e.target.files));
                      }
                    }}
                  />
                </label>
                {modalFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {modalFiles.map((f, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between text-xs bg-orange-50 text-orange-800 px-3 py-1.5 rounded-lg border border-orange-200"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <FileText size={13} /> {f.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setModalFiles(modalFiles.filter((_, i) => i !== idx))}
                          className="text-red-600 hover:text-red-800 ml-2 font-bold"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarJornada}
                  disabled={saving}
                  className="px-5 py-2 text-white bg-orange-600 hover:bg-orange-700 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {saving ? 'Guardando...' : 'Guardar Jornada'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visor y Gestor de Informes PDF de la Jornada */}
      {jornadaInformesActiva && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Cabecera */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-400" />
                  Informes de Jornada — {jornadaInformesActiva.sector} ({jornadaInformesActiva.fecha})
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Equipo: {jornadaInformesActiva.equipo} · {(jornadaInformesActiva.informes || []).length} informe(s) cargado(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => dispararSubidaInformeEnFila(jornadaInformesActiva.id)}
                  disabled={uploadingId === jornadaInformesActiva.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors disabled:opacity-50"
                >
                  {uploadingId === jornadaInformesActiva.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  + Subir otro PDF
                </button>
                <button
                  onClick={() => {
                    setJornadaInformesActiva(null);
                    setPdfPreview(null);
                  }}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Cuerpo dividido: Lista lateral de PDFs + Visor integrado */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden">
              {/* Lista de informes */}
              <div className="border-r border-slate-200 bg-slate-50 p-4 overflow-y-auto space-y-2.5">
                <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">
                  Archivos PDF Adjuntos
                </p>
                {(jornadaInformesActiva.informes || []).length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No hay informes PDF en esta jornada.
                  </div>
                ) : (
                  (jornadaInformesActiva.informes || []).map((inf) => {
                    const isSelected = pdfPreview?.url === inf.url;
                    return (
                      <div
                        key={inf.id}
                        onClick={() => setPdfPreview({ url: inf.url, nombre: inf.nombre })}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-orange-50 border-orange-400 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <FileText
                              size={16}
                              className={`shrink-0 mt-0.5 ${
                                isSelected ? 'text-orange-600' : 'text-slate-500'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate" title={inf.nombre}>
                                {inf.nombre}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {inf.fecha_subida
                                  ? new Date(inf.fecha_subida).toLocaleString('es-VE')
                                  : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              eliminarInformePDF(jornadaInformesActiva.id, inf.id, inf.nombre);
                            }}
                            className="text-slate-400 hover:text-red-600 p-1"
                            title="Eliminar este PDF"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100 text-[11px] font-semibold">
                          <span className="text-blue-600 flex items-center gap-1">
                            <Eye size={12} /> Ver aquí
                          </span>
                          <a
                            href={inf.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-600 hover:text-slate-900 flex items-center gap-1"
                          >
                            <ExternalLink size={12} /> Abrir pestaña
                          </a>
                          <a
                            href={inf.url}
                            download={inf.nombre}
                            onClick={(e) => e.stopPropagation()}
                            className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1 ml-auto"
                          >
                            <Download size={12} /> Descargar
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Visor PDF embebido */}
              <div className="md:col-span-2 bg-slate-100 flex flex-col h-full overflow-hidden">
                {pdfPreview ? (
                  <>
                    <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 truncate">
                        Vista previa: {pdfPreview.nombre}
                      </span>
                      <div className="flex items-center gap-2">
                        <a
                          href={pdfPreview.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                        >
                          <ExternalLink size={12} /> Pantalla completa
                        </a>
                        <a
                          href={pdfPreview.url}
                          download={pdfPreview.nombre}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          <Download size={12} /> Descargar PDF
                        </a>
                      </div>
                    </div>
                    <iframe
                      src={pdfPreview.url}
                      title={pdfPreview.nombre}
                      className="w-full flex-1 border-0 bg-white"
                    />
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                    <FileText className="w-12 h-12 mb-2 text-slate-300" />
                    <p className="text-sm font-semibold">Selecciona un informe PDF de la lista para visualizarlo</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
