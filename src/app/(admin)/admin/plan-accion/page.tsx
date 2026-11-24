'use client';

import { useState, useEffect, useMemo } from 'react';
import { Map, User, Search, Printer, CheckSquare, PhoneCall, MessageCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';
import { logAudit } from '@/lib/audit';
import { exportToExcelWithLogos } from '@/lib/excelExport';

export default function PlanAccionPage() {
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [morosos, setMorosos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTrabajador, setSelectedTrabajador] = useState('');
  const [minMeses, setMinMeses] = useState(2);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [asignacionesHoy, setAsignacionesHoy] = useState<Record<string, string>>({});
  const [gestionesCallCenter, setGestionesCallCenter] = useState<Record<string, { estado: string; nota: string; fecha: string; operador: string }>>({});
  const [modalGestion, setModalGestion] = useState<{ open: boolean; contribuyente: any | null; resultado: string; observacion: string }>({
    open: false,
    contribuyente: null,
    resultado: 'Contactado - Compromiso de Pago',
    observacion: ''
  });
  const [savingGestion, setSavingGestion] = useState(false);

  const [selectedContribuyentes, setSelectedContribuyentes] = useState<Set<string>>(new Set());

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data: trabData } = await supabase.from('trabajadores').select('*').eq('estado', 'Activo');
      setTrabajadores(trabData || []);

      // Cargar morosos reales desde inmuebles con meses_deuda >= 1
      let allInmMorosos: any[] = [];
      let from = 0;
      while (true) {
        const { data: chunk } = await supabase
          .from('inmuebles')
          .select('identidad, inmueble, contribuyente, direccion, telefono, correo_electronico, actividad_principal, clasificacion, meses_deuda, mmv_mes, multa_bs, deuda_mmv, estado')
          .neq('estado', 'Eliminado')
          .gt('meses_deuda', 0)
          .order('meses_deuda', { ascending: false })
          .range(from, from + 999);
        if (!chunk || chunk.length === 0) break;
        allInmMorosos.push(...chunk);
        from += 1000;
        if (chunk.length < 1000 || allInmMorosos.length >= 4000) break;
      }

      const grouped: Record<string, { mesesMax: number; cantInm: number; contribuyente: string; rawId: string; direccion: string; telefono: string; correo: string; tipo: string }> = {};
      for (const inm of allInmMorosos) {
        const id = (inm.identidad || inm.inmueble || '').replace(/-/g, '').toUpperCase();
        if (!id) continue;
        const m = parseInt(String(inm.meses_deuda || 0), 10) || 0;
        const act = String(inm.actividad_principal || inm.clasificacion || '').toLowerCase();
        const tipo = act.includes('industrial') || act.includes('fabrica')
          ? 'Industrial'
          : (act.includes('residencial') || act.includes('vivienda') || act.includes('casa') || act.includes('apartamento') ? 'Residencial' : 'Comercial');
        if (!grouped[id]) {
          grouped[id] = {
            mesesMax: m,
            cantInm: 1,
            contribuyente: inm.contribuyente || 'N/D',
            rawId: inm.identidad || inm.inmueble || '',
            direccion: inm.direccion || 'Naguanagua',
            telefono: inm.telefono || '',
            correo: inm.correo_electronico || '',
            tipo,
          };
        } else {
          grouped[id].cantInm += 1;
          if (m > grouped[id].mesesMax) grouped[id].mesesMax = m;
          if (!grouped[id].telefono && inm.telefono) grouped[id].telefono = inm.telefono;
          if (!grouped[id].correo && inm.correo_electronico) grouped[id].correo = inm.correo_electronico;
        }
      }

      const morososArray = Object.entries(grouped).map(([id, info]) => ({
        identidad: info.rawId || id,
        identidadNorm: id,
        contribuyente: info.contribuyente,
        mesesAdeudados: info.mesesMax,
        cantInmuebles: info.cantInm,
        direccion: info.direccion,
        telefono: info.telefono,
        correo: info.correo,
        tipo: info.tipo,
      }));

      morososArray.sort((a, b) => b.mesesAdeudados - a.mesesAdeudados);
      setMorosos(morososArray);

      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
      const [auditsAsig, auditsCall] = await Promise.all([
        fetch(`/api/admin/auditoria?accion=${encodeURIComponent('Asignacion Plan de Accion')}&desde=${hoy}`, { cache: 'no-store' })
          .then(r => r.json()).then(j => j?.data || []).catch(() => []),
        fetch(`/api/admin/auditoria?accion=${encodeURIComponent('Gestion Call Center Cobranza')}`, { cache: 'no-store' })
          .then(r => r.json()).then(j => j?.data || []).catch(() => []),
      ]);

      const asigMap: Record<string, string> = {};
      for (const a of (auditsAsig || [])) {
        try {
          const det = typeof a.detalles === 'string' ? JSON.parse(a.detalles) : a.detalles;
          if (det?.identidad && det?.trabajador) asigMap[det.identidad] = det.trabajador;
        } catch {}
      }
      setAsignacionesHoy(asigMap);

      const callMap: Record<string, { estado: string; nota: string; fecha: string; operador: string }> = {};
      for (const a of (auditsCall || [])) {
        try {
          const det = typeof a.detalles === 'string' ? JSON.parse(a.detalles) : (a.detalles || {});
          const k = String(det?.identidad || a.entidad_id || '').replace(/-/g, '').toUpperCase();
          if (k && !callMap[k]) {
            callMap[k] = {
              estado: det?.resultado || 'Contactado',
              nota: det?.observacion || a.descripcion || '',
              fecha: (a.created_at || '').slice(0, 16).replace('T', ' '),
              operador: a.usuario || 'Call Center IAMEC',
            };
          }
        } catch {}
      }
      setGestionesCallCenter(callMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const registrarGestionCallCenter = async () => {
    if (!modalGestion.contribuyente) return;
    setSavingGestion(true);
    try {
      const c = modalGestion.contribuyente;
      const op = (typeof window !== 'undefined' && localStorage.getItem('adminUser')) || 'Call Center IAMEC';
      await logAudit(
        'Gestion Call Center Cobranza',
        {
          identidad: c.identidad,
          contribuyente: c.contribuyente,
          telefono: c.telefono,
          mesesAdeudados: c.mesesAdeudados,
          resultado: modalGestion.resultado,
          observacion: modalGestion.observacion,
          descripcion: `Gestión Call Center a ${c.contribuyente} (${c.identidad}): ${modalGestion.resultado}. ${modalGestion.observacion}`,
        },
        'CONTRIBUYENTE',
        'BAJA'
      );
      const k = String(c.identidadNorm || c.identidad || '').replace(/-/g, '').toUpperCase();
      setGestionesCallCenter(prev => ({
        ...prev,
        [k]: {
          estado: modalGestion.resultado,
          nota: modalGestion.observacion,
          fecha: new Date().toLocaleString('es-VE'),
          operador: op,
        }
      }));
      setModalGestion({ open: false, contribuyente: null, resultado: 'Contactado - Compromiso de Pago', observacion: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingGestion(false);
    }
  };

  const filteredMorosos = useMemo(() => {
    return morosos.filter(m => {
      if (m.mesesAdeudados < minMeses) return false;
      if (tipoFiltro !== 'Todos' && m.tipo !== tipoFiltro) return false;
      if (searchTerm && !m.contribuyente.toLowerCase().includes(searchTerm.toLowerCase()) && !m.identidad.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [morosos, minMeses, searchTerm, tipoFiltro]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedContribuyentes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContribuyentes(next);
  };

  const selectAll = () => {
    if (selectedContribuyentes.size === filteredMorosos.length) {
      setSelectedContribuyentes(new Set());
    } else {
      setSelectedContribuyentes(new Set(filteredMorosos.map(m => m.identidad)));
    }
  };

  const exportarBitacoraCallCenter = () => {
    const rows = filteredMorosos.slice(0, 1000).map(m => {
      const g = gestionesCallCenter[m.identidadNorm];
      return {
        'Identidad / RIF': m.identidad,
        'Contribuyente': m.contribuyente,
        'Sector': m.tipo,
        'Meses Adeudados': m.mesesAdeudados,
        'Teléfono': m.telefono || 'No registrado',
        'Correo': m.correo || 'No registrado',
        'Estatus Call Center': g?.estado || 'En Cola de Gestión',
        'Observación / Compromiso': g?.nota || '--',
        'Último Contacto': g?.fecha || '--',
      };
    });
    exportToExcelWithLogos(rows, `Bitacora_CallCenter_Cobranza_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Call Center');
  };

  const generarPDF = () => {
    if (!selectedTrabajador) {
      alert('Por favor selecciona un trabajador o gestor de cobranza para el plan de acción.');
      return;
    }
    if (selectedContribuyentes.size === 0) {
      alert('Por favor selecciona al menos un contribuyente.');
      return;
    }

    const trabajador = trabajadores.find(t => t.id === selectedTrabajador);
    const nombreTrabajador = trabajador ? trabajador.nombre : 'Gestor de Cobranza';
    const fecha = new Date().toLocaleDateString('es-VE');

    const doc = new jsPDF('landscape');
    const pageW = doc.internal.pageSize.width;

    if (logos.alcaldia) doc.addImage(logos.alcaldia, 'PNG', 14, 10, 25, 25);
    if (logos.iamec) doc.addImage(logos.iamec, 'PNG', pageW - 39, 10, 25, 25);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PLAN DE ACCIÓN Y GESTIÓN DE COBRANZA / CALL CENTER', pageW / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gestor / Fiscal Asignado: ${nombreTrabajador}`, pageW / 2, 27, { align: 'center' });
    doc.text(`Fecha: ${fecha}   |   Contribuyentes Asignados: ${selectedContribuyentes.size}`, pageW / 2, 33, { align: 'center' });

    const rowsToPrint = morosos.filter(m => selectedContribuyentes.has(m.identidad));

    const tableData = rowsToPrint.map((m, idx) => [
      idx + 1,
      m.contribuyente + '\n(' + m.identidad + ')',
      m.telefono || 'S/T',
      m.mesesAdeudados,
      m.direccion,
      gestionesCallCenter[m.identidadNorm]?.estado || '',
      gestionesCallCenter[m.identidadNorm]?.nota || ''
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['N°', 'CONTRIBUYENTE', 'TELÉFONO', 'MESES MORA', 'DIRECCIÓN', 'ESTATUS GESTIÓN', 'FIRMA / COMPROMISO DE PAGO']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: 'center' },
    });

    doc.save(`Plan_Accion_Cobranza_${nombreTrabajador.replace(/\s+/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Map className="w-6 h-6 text-indigo-500" />
            Plan de Acción: Cobranza de Campo y Call Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión integral de recuperación de cartera, registro de llamadas de Call Center, avisos por WhatsApp y asignación de rutas de cobro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarBitacoraCallCenter}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm text-xs font-bold transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Bitácora Call Center (Excel)
          </button>
          <button
            onClick={generarPDF}
            disabled={selectedContribuyentes.size === 0 || !selectedTrabajador}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-sm text-xs font-bold transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Imprimir Plan de Cobranza (PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fiscal / Operador Call Center</label>
          <select
            value={selectedTrabajador}
            onChange={(e) => setSelectedTrabajador(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">-- Seleccionar Operador / Fiscal --</option>
            {trabajadores.map(t => (
              <option key={t.id} value={t.id}>{t.nombre} ({t.rol})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Mínimo Meses Adeudados</label>
          <input
            type="number"
            min="1"
            value={minMeses}
            onChange={(e) => setMinMeses(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sector</label>
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="Todos">🏠 Todos los Sectores</option>
            <option value="Comercial">Comercial</option>
            <option value="Residencial">Residencial</option>
            <option value="Industrial">Industrial</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Buscar Contribuyente</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Nombre o RIF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <User className="w-4 h-4 text-slate-500" />
            Cartera de Cobranza ({filteredMorosos.length.toLocaleString('es-VE')} contribuyentes · {selectedContribuyentes.size} seleccionados)
          </div>
          <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer">
            <CheckSquare className="w-3.5 h-3.5" /> {selectedContribuyentes.size === filteredMorosos.length && filteredMorosos.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
          </button>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500">Cargando cartera de cobranza...</div>
          ) : filteredMorosos.length === 0 ? (
            <div className="p-10 text-center text-slate-500">No se encontraron contribuyentes morosos con estos filtros.</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-white sticky top-0 border-b border-slate-200 text-xs uppercase text-slate-500 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">Sel.</th>
                  <th className="px-4 py-3">Contribuyente</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-center">Meses Mora</th>
                  <th className="px-4 py-3">Estatus Call Center</th>
                  <th className="px-4 py-3 text-right">Acciones de Cobranza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMorosos.slice(0, 300).map((m) => {
                  const gest = gestionesCallCenter[m.identidadNorm];
                  const cleanPhone = String(m.telefono || '').replace(/\D/g, '');
                  const waPhone = cleanPhone.startsWith('0') ? `58${cleanPhone.slice(1)}` : (cleanPhone.startsWith('58') ? cleanPhone : `58${cleanPhone}`);
                  return (
                    <tr
                      key={m.identidad}
                      className={`hover:bg-slate-50 transition-colors ${selectedContribuyentes.has(m.identidad) ? 'bg-indigo-50/30' : ''}`}
                    >
                      <td className="px-4 py-3 text-center" onClick={() => toggleSelect(m.identidad)}>
                        <input
                          type="checkbox"
                          checked={selectedContribuyentes.has(m.identidad)}
                          onChange={() => {}}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3" onClick={() => toggleSelect(m.identidad)}>
                        <div className="font-bold text-slate-800">{m.contribuyente}</div>
                        <div className="text-xs text-slate-500 font-mono">{m.identidad} · {m.tipo}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[260px]" title={m.direccion}>{m.direccion}</div>
                        {asignacionesHoy[m.identidad] && <div className="text-xs text-amber-600 font-bold mt-1">⚠️ Asignado hoy a: {asignacionesHoy[m.identidad]}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold text-slate-700">{m.telefono || 'Sin teléfono'}</div>
                        <div className="text-slate-400 truncate max-w-[180px]">{m.correo || 'Sin correo'}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          {m.mesesAdeudados} mes(es)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {gest ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              <CheckCircle2 className="w-3 h-3" /> {gest.estado}
                            </span>
                            {gest.nota && <p className="text-[11px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={gest.nota}>{gest.nota}</p>}
                            <span className="text-[10px] text-slate-400 block">{gest.fecha}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Pendiente de llamada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setModalGestion({ open: true, contribuyente: m, resultado: 'Contactado - Compromiso de Pago', observacion: '' })}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <PhoneCall className="w-3.5 h-3.5" /> Registrar Llamada
                          </button>
                          {cleanPhone.length >= 10 && (
                            <a
                              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Estimado contribuyente ${m.contribuyente} (${m.identidad}), le saludamos del Call Center de Cobranza del IAMEC Naguanagua. Le recordamos que registra ${m.mesesAdeudados} mes(es) pendientes del servicio de Aseo Urbano. Puede consultar y reportar su pago en nuestro portal Soy Contribuyente.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Aviso WhatsApp
                            </a>
                          )}
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

      {modalGestion.open && modalGestion.contribuyente && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-indigo-600" />
              Registrar Gestión de Call Center
            </h3>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-800">{modalGestion.contribuyente.contribuyente}</div>
              <div className="text-slate-500">RIF/C.I.: <b>{modalGestion.contribuyente.identidad}</b> · Tel: <b>{modalGestion.contribuyente.telefono || 'N/D'}</b></div>
              <div className="text-red-600 font-bold">Mora registrada: {modalGestion.contribuyente.mesesAdeudados} mes(es)</div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Resultado de la Llamada / Contacto</label>
              <select
                value={modalGestion.resultado}
                onChange={e => setModalGestion(prev => ({ ...prev, resultado: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                <option value="Contactado - Compromiso de Pago">Contactado - Compromiso de Pago</option>
                <option value="Aviso Digital Enviado (Correo / WhatsApp)">Aviso Digital Enviado (Correo / WhatsApp)</option>
                <option value="Solicitó Convenio de Pago">Solicitó Convenio de Pago</option>
                <option value="Ya Pagó - En Conciliación">Ya Pagó - En Conciliación</option>
                <option value="No Contesta / Buzón">No Contesta / Buzón</option>
                <option value="Número Errado / Actualizar Datos">Número Errado / Actualizar Datos</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Observaciones / Fecha de Compromiso</label>
              <textarea
                rows={3}
                value={modalGestion.observacion}
                onChange={e => setModalGestion(prev => ({ ...prev, observacion: e.target.value }))}
                placeholder="Detalle el acuerdo o respuesta del contribuyente..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalGestion({ open: false, contribuyente: null, resultado: 'Contactado - Compromiso de Pago', observacion: '' })}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingGestion}
                onClick={registrarGestionCallCenter}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {savingGestion ? 'Guardando...' : 'Guardar en Bitácora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
