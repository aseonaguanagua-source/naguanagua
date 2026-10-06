'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Building2, Settings, DollarSign, Handshake, Calculator, Download, Edit2, X, Save, Receipt } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { UnidadesModal } from '@/components/UnidadesModal';
import { DebtAdjustmentModal } from '@/components/DebtAdjustmentModal';
import Link from 'next/link';

const normId = (s: any) => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// Hijos de un condominio = inmuebles con condominio_padre_id = codigo del padre (excluye eliminados)
async function fetchHijos(codigoPadre?: string) {
  const { supabase } = await import('@/lib/supabase');
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('inmuebles')
      .select('inmueble,identidad,contribuyente,direccion,telefono,correo_electronico,tipo,actividad_principal,estado,meses_deuda,deuda_mmv,multa_bs,condominio_padre_id')
      .not('condominio_padre_id', 'is', null)
      .neq('estado', 'Eliminado')
      .order('inmueble', { ascending: true })
      .range(from, from + 999);
    if (codigoPadre) q = q.eq('condominio_padre_id', codigoPadre);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function hijoToExcelRow(u: any, padre?: any) {
  const conDeuda = (parseInt(u.meses_deuda || '0') > 0 || parseFloat(u.deuda_mmv || '0') > 0 || parseFloat(u.multa_bs || '0') > 0);
  return {
    "Condominio": padre?.nombre || u.condominio_padre_id || 'Desconocido',
    "RIF Condominio": padre?.identidad || 'N/A',
    "Código Unidad": u.inmueble || '',
    "Dirección / Local": u.direccion || '',
    "Propietario": u.contribuyente || 'No asignado',
    "RIF / Cédula": u.identidad || '',
    "Teléfono": u.telefono || '',
    "Correo": u.correo_electronico || '',
    "Tipo": u.tipo || '',
    "Actividad": u.actividad_principal || '',
    "Meses Deuda": parseInt(u.meses_deuda || '0') || 0,
    "Multa (Bs)": Number(parseFloat(u.multa_bs || '0').toFixed(2)),
    "Estado Registro": u.estado || 'Activo',
    "Estado": conDeuda ? 'Con Deuda' : 'Solvente'
  };
}

export default function CondominiosCOBPage() {
  const { condominios, inmuebles, tcmmv, recibos, setFacturas, addAuditLog } = useAppContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCondominio, setSelectedCondominio] = useState<{ id: number, nombre: string, identidad: string, codigo?: string } | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCondominio, setEditingCondominio] = useState<any>(null);

  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [selectedDebtRow, setSelectedDebtRow] = useState<any>(null);

  const handleOpenModal = (row: any) => {
    setSelectedCondominio({ id: row.id, nombre: row.nombre, identidad: row.identidad, codigo: row.codigo || '' });
    setModalOpen(true);
  };

  const columns = [
    { key: 'codigo', header: 'Código' },
    { key: 'identidad', header: 'RIF / Cédula' },
    { key: 'nombre', header: 'Nombre del Condominio' },
    { key: 'direccion', header: 'Dirección' },
    { key: 'unidades', header: 'Unidades / Locales', render: (row: any) => (
      <span className="font-semibold text-slate-700">{row.unidades}</span>
    ) },
    { key: 'representante', header: 'Representante' },
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${
        row.estado === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
      }`}>{row.estado}</span>
    ) },
    { key: 'actions', header: 'Gestión / Estatus', render: (row: any) => {
      // Deuda real: buscar recibos pendientes del condominio
      const pendFacturas = (recibos || []).filter((f: any) =>
        normId(f.identidad) === normId(row.identidad) &&
        ['Pendiente','Abonado','Por Verificar'].includes(f.estado)
      );
      const hasDebt = pendFacturas.length > 0;
      const debtAmount = pendFacturas.reduce((s: number, f: any) => s + (parseFloat(String(f.monto ?? '0')) || 0), 0).toFixed(2);
      const hasAgreement = false; // convenios se muestran en la tabla de convenios

      return (
        <div className="flex gap-2 items-center">
          <button 
            onClick={() => {
              setEditingCondominio({...row});
              setEditModalOpen(true);
            }}
            className="bg-blue-50 text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors"
            title="Editar Condominio"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenModal(row)}
            className="bg-slate-100 text-slate-600 hover:bg-slate-200 p-1.5 rounded transition-colors"
            title="Administrar Unidades"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={async () => {
              try {
                const hijos = await fetchHijos(row.codigo);
                const pendientesPorRif = (rif: string) => (recibos || []).filter((f: any) =>
                  normId(f.identidad) === normId(rif) && ['Pendiente', 'Abonado', 'Por Verificar'].includes(f.estado)
                );
                const unidadesGlobal = [
                  { ...((inmuebles || []).find((i: any) => i.inmueble === row.codigo) || {}), inmueble: row.codigo, identidad: row.identidad, contribuyente: row.contribuyente || row.nombre, direccion: row.direccion, _padre: true },
                  ...hijos
                ];
                const rifsContados = new Set<string>();
                let totalRecibos = 0, totalMulta = 0;
                const data: any[] = unidadesGlobal.map((u: any) => {
                  const rifKey = normId(u.identidad);
                  let recibosPend: any[] = [];
                  if (rifKey && !rifsContados.has(rifKey)) {
                    rifsContados.add(rifKey);
                    recibosPend = pendientesPorRif(u.identidad);
                  }
                  const montoRecibos = recibosPend.reduce((s: number, f: any) => s + (parseFloat(String(f.monto ?? '0')) || 0), 0);
                  const multa = parseFloat(u.multa_bs || '0') || 0;
                  totalRecibos += montoRecibos;
                  totalMulta += multa;
                  return {
                    "Tipo": u._padre ? 'CONDOMINIO (PADRE)' : 'UNIDAD',
                    "Código": u.inmueble || '',
                    "Dirección / Local": u.direccion || '',
                    "Propietario": u.contribuyente || '',
                    "RIF / Cédula": u.identidad || '',
                    "Meses Deuda": parseInt(u.meses_deuda || '0') || 0,
                    "Recibos Pendientes": recibosPend.length,
                    "Monto Recibos Pendientes (Bs)": Number(montoRecibos.toFixed(2)),
                    "Multa (Bs)": Number(multa.toFixed(2)),
                    "Total (Bs)": Number((montoRecibos + multa).toFixed(2)),
                    "Estado": (montoRecibos + multa) > 0 || (parseInt(u.meses_deuda || '0') || 0) > 0 ? 'Con Deuda' : 'Solvente'
                  };
                });
                data.push({
                  "Tipo": 'TOTAL GLOBAL', "Código": '', "Dirección / Local": '', "Propietario": `${hijos.length} unidades`, "RIF / Cédula": '',
                  "Meses Deuda": '', "Recibos Pendientes": '',
                  "Monto Recibos Pendientes (Bs)": Number(totalRecibos.toFixed(2)),
                  "Multa (Bs)": Number(totalMulta.toFixed(2)),
                  "Total (Bs)": Number((totalRecibos + totalMulta).toFixed(2)),
                  "Estado": ''
                });
                const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                await exportToExcelWithLogos(data, `EstadoCuentaGlobal_${row.codigo || row.identidad}.xlsx`, `Estado de Cuenta Global - ${row.contribuyente || row.nombre}`.slice(0, 31).replace(/[\\/*?:\[\]]/g, ''));
              } catch (e: any) {
                console.error(e);
                alert("Error exportando Estado de Cuenta a Excel: " + (e?.message || e));
              }
            }}
            className="bg-orange-50 text-orange-600 hover:bg-orange-100 p-1.5 rounded transition-colors"
            title="Estado de Cuenta Global del Condominio (padre + todas las unidades) a Excel"
          >
            <Receipt className="w-4 h-4" />
          </button>
          <button 
            onClick={async () => {
              try {
                const unidades = await fetchHijos(row.codigo);
                if (unidades.length === 0) {
                  alert('Este condominio no tiene unidades registradas.');
                  return;
                }
                const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                const data = unidades.map((u: any) => hijoToExcelRow(u, row));
                await exportToExcelWithLogos(data, `Unidades_${row.codigo || row.identidad}.xlsx`, "Unidades");
              } catch (e: any) {
                console.error(e);
                alert("Error exportando a Excel: " + (e?.message || e));
              }
            }}
            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-1.5 rounded transition-colors"
            title="Exportar Unidades (Hijos) a Excel"
          >
            <Download className="w-4 h-4" />
          </button>
          <button 
            onClick={() => { setSelectedDebtRow(row); setDebtModalOpen(true); }}
            className={`${hasDebt ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} p-1.5 rounded transition-colors`}
            title="Ajustar Deuda"
          >
            <Calculator className="w-4 h-4" />
          </button>
          <button 
            className={`${hasAgreement ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-slate-50 text-slate-400 cursor-default'} p-1.5 rounded transition-colors`}
            title={hasAgreement ? 'Tiene convenio activo' : 'Sin convenios'}
          >
            <Handshake className="w-4 h-4" />
          </button>
        </div>
      );
    } }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Gestión de Condominios COB
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={async () => {
              try {
                const unidades = await fetchHijos();
                const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                const padres = new Map((condominios || []).map((c: any) => [c.codigo, c]));
                const data = unidades.map((u: any) => hijoToExcelRow(u, padres.get(u.condominio_padre_id)));
                data.sort((a: any, b: any) => String(a.Condominio).localeCompare(String(b.Condominio)) || String(a["Código Unidad"]).localeCompare(String(b["Código Unidad"])));
                await exportToExcelWithLogos(data, `Unidades_Condominios_${new Date().toISOString().split('T')[0]}.xlsx`, "Unidades");
              } catch(e: any) {
                console.error(e);
                alert("Error exportando a Excel: " + (e?.message || e));
              }
            }}
            className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" /> Exportar Unidades a Excel
          </button>
        </div>
      </div>

      <div className="flex bg-slate-100 p-2 rounded text-sm text-slate-700 font-medium mb-4 w-fit">
        <Link href="/admin/inmuebles" className="px-4 py-1 text-slate-500 hover:text-slate-800 transition-colors">
          INMUEBLES
        </Link>
        <div className="px-4 py-1 bg-white shadow-sm rounded border border-slate-200 cursor-default">
          CONDOMINIOS Y COMERCIOS
        </div>
      </div>
      <DataTable data={condominios} columns={columns} itemsPerPage={10} />
      
      {modalOpen && selectedCondominio && (
        <UnidadesModal 
          condominioId={selectedCondominio.id}
          condominioCodigoPadre={selectedCondominio.codigo || ''} 
          condominioNombre={selectedCondominio.nombre} 
          condominioIdentidad={selectedCondominio.identidad}
          onClose={() => setModalOpen(false)} 
        />
      )}

      {debtModalOpen && selectedDebtRow && (
        <DebtAdjustmentModal
          row={selectedDebtRow}
          inmuebles={inmuebles}
          tcmmv={tcmmv}
          recibos={recibos}
          setFacturas={setFacturas}
          addAuditLog={addAuditLog}
          onClose={() => setDebtModalOpen(false)}
        />
      )}
      {editModalOpen && editingCondominio && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                Editar Condominio
              </h2>
              <button 
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Código del Condominio</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={editingCondominio.codigo || ''}
                    readOnly
                    className="w-full border border-slate-200 bg-slate-50 rounded px-3 py-2 text-sm font-mono font-bold text-slate-600 cursor-not-allowed"
                    placeholder="Código de inmueble"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Código de inmueble del condominio padre (no editable).</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">RIF / Cédula</label>
                <input 
                  type="text" 
                  value={editingCondominio.identidad}
                  onChange={(e) => setEditingCondominio({...editingCondominio, identidad: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Nombre / Razón Social del Condominio</label>
                <input 
                  type="text" 
                  value={editingCondominio.contribuyente ?? ''}
                  onChange={(e) => setEditingCondominio({...editingCondominio, contribuyente: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Dirección</label>
                <textarea 
                  value={editingCondominio.direccion}
                  onChange={(e) => setEditingCondominio({...editingCondominio, direccion: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  try {
                    const { supabase } = await import('@/lib/supabase');
                    const identidad = String(editingCondominio.identidad || '').trim().toUpperCase();
                    if (!identidad) throw new Error('El RIF es obligatorio.');
                    // FK inmuebles.identidad -> contribuyentes.identidad
                    await supabase.from('contribuyentes').upsert([{
                      identidad,
                      nombre: editingCondominio.contribuyente || 'Condominio'
                    }], { onConflict: 'identidad', ignoreDuplicates: true });
                    const { data, error } = await supabase.from('inmuebles').update({
                      contribuyente: editingCondominio.contribuyente,
                      identidad,
                      direccion: editingCondominio.direccion
                    }).eq('id', editingCondominio.id).select('id');
                    
                    if (error) throw error;
                    if (!data || data.length === 0) throw new Error('No se actualizó ningún registro.');
                    await addAuditLog('EDITAR_CONDOMINIO', JSON.stringify({ codigo: editingCondominio.codigo, identidad, nombre: editingCondominio.contribuyente }));
                    
                    alert('Condominio actualizado correctamente (Refresca la página para ver los cambios).');
                    setEditModalOpen(false);
                  } catch (e: any) {
                    alert('Error al actualizar condominio: ' + e.message);
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
