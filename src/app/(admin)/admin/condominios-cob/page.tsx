'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Building2, Settings, DollarSign, Handshake, Calculator, Download, Edit2, X, Save, Receipt } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { UnidadesModal } from '@/components/UnidadesModal';
import { DebtAdjustmentModal } from '@/components/DebtAdjustmentModal';
import Link from 'next/link';

// Genera el siguiente codigo C-XXXXXX o CH-XXXXXX unico en el sistema
async function generarCodigoCondominio(tipo: 'padre' | 'hijo'): Promise<string> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const prefijo = tipo === 'padre' ? 'C' : 'CH';
    // Buscar todos los codigos existentes con ese prefijo
    const { data } = await supabase.from('condominios').select('codigo');
    const existentes = (data || [])
      .map((r: any) => r.codigo || '')
      .filter((c: string) => c.startsWith(prefijo + '-'));
    // Extraer numeros
    const nums = existentes
      .map((c: string) => parseInt(c.replace(prefijo + '-', ''), 10))
      .filter((n: number) => !isNaN(n));
    const maximo = nums.length > 0 ? Math.max(...nums) : 0;
    const siguiente = maximo + 1;
    return prefijo + '-' + String(siguiente).padStart(6, '0');
  } catch {
    return tipo === 'padre' ? 'C-000001' : 'CH-000001';
  }
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
      const hasDebt = Math.random() > 0.5;
      const debtAmount = hasDebt ? (Math.random() * 5000).toFixed(2) : '0.00';
      const hasAgreement = Math.random() > 0.7;

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
                const pendingFacturas = (recibos || []).filter((f: any) => {
                  const contrib = (f.contribuyente || '').toLowerCase().trim();
                  return contrib === row.identidad.toLowerCase().trim() || contrib === row.nombre.toLowerCase().trim();
                });
                if (pendingFacturas.length === 0) {
                  alert('Este condominio no tiene recibos registradas.');
                  return;
                }
                const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                const data = pendingFacturas.map((f: any) => ({
                  "Referencia": f.referencia,
                  "Condominio": row.nombre,
                  "RIF": row.identidad,
                  "Emisión": f.emision,
                  "Vencimiento": f.vencimiento,
                  "Monto (Bs)": parseFloat(f.monto || '0').toFixed(2),
                  "Estado": f.estado
                }));
                await exportToExcelWithLogos(data, `EstadoCuenta_${row.identidad}.xlsx`, "Estado_de_Cuenta");
              } catch (e) {
                alert("Error exportando Estado de Cuenta a Excel");
              }
            }}
            className="bg-orange-50 text-orange-600 hover:bg-orange-100 p-1.5 rounded transition-colors"
            title="Exportar Estado de Cuenta a Excel"
          >
            <Receipt className="w-4 h-4" />
          </button>
          <button 
            onClick={async () => {
              try {
                const { supabase } = await import('@/lib/supabase');
                const { data: unidades, error } = await supabase.from('unidades_condominio').select('*').eq('condominio_id', row.id);
                if (error) throw error;
                if (!unidades || unidades.length === 0) {
                  alert('Este condominio no tiene unidades registradas.');
                  return;
                }
                const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                const data = unidades.map((u: any) => ({
                  "Condominio": row.nombre,
                  "RIF Condominio": row.identidad,
                  "Unidad/Local": u.numero_unidad,
                  "Propietario": u.propietario || 'No asignado',
                  "Ocupación": u.ocupacion || 'Ocupada',
                  "Estado": u.estado || 'Solvente'
                }));
                await exportToExcelWithLogos(data, `Unidades_${row.identidad}.xlsx`, "Unidades");
              } catch (e) {
                alert("Error exportando a Excel");
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
                const { supabase } = await import('@/lib/supabase');
                const { data: unidades, error } = await supabase.from('unidades_condominio').select('*');
                if (error) throw error;
          
                const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                
                const data = (unidades || []).map((u: any) => {
                  const parent = condominios.find(c => c.id === u.condominio_id);
                  return {
                    "Condominio": parent?.nombre || 'Desconocido',
                    "RIF Condominio": parent?.identidad || 'N/A',
                    "Unidad/Local": u.numero_unidad,
                    "Propietario": u.propietario || 'No asignado',
                    "Ocupación": u.ocupacion || 'Ocupada',
                    "Estado": u.estado || 'Solvente'
                  };
                });
                
                data.sort((a: any, b: any) => a.Condominio.localeCompare(b.Condominio) || a["Unidad/Local"].localeCompare(b["Unidad/Local"]));
          
                await exportToExcelWithLogos(data, `Unidades_Condominios_${new Date().toISOString().split('T')[0]}.xlsx`, "Unidades");
              } catch(e) {
                alert("Error exportando a Excel");
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
                    placeholder="Auto-generado (ej: C-000001)"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const cod = await generarCodigoCondominio('padre');
                      setEditingCondominio({...editingCondominio, codigo: cod});
                    }}
                    className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 whitespace-nowrap"
                  >
                    Generar
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Formato C-000001. Use el botón para asignar un código único.</span>
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
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Nombre del Condominio</label>
                <input 
                  type="text" 
                  value={editingCondominio.nombre}
                  onChange={(e) => setEditingCondominio({...editingCondominio, nombre: e.target.value})}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Representante Legal</label>
                <input 
                  type="text" 
                  value={editingCondominio.representante}
                  onChange={(e) => setEditingCondominio({...editingCondominio, representante: e.target.value})}
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
                    const { error } = await supabase.from('condominios').update({
                      nombre: editingCondominio.nombre,
                      identidad: editingCondominio.identidad,
                      representante: editingCondominio.representante,
                      direccion: editingCondominio.direccion,
                      codigo: editingCondominio.codigo || null
                    }).eq('id', editingCondominio.id);
                    
                    if (error) throw error;
                    
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
