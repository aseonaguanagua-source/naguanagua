import fs from 'fs';
import path from 'path';

const file = 'src/app/(admin)/admin/ambiental/page.tsx';

const content = `'use client';
import React, { useState } from 'react';
import { Leaf, Plus, FileText, CheckCircle, Search, Printer, AlertTriangle } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { formatBs } from '@/lib/formatCurrency';
import { ordenanzaData } from '@/data/ordenanza';
import { generarPlanillaAmbiental } from '@/lib/pdfGeneratorAmbiental';

export default function AmbientalPage() {
  const { tcmmv, contribuyentes, inmuebles } = useAppContext();
  const [activeTab, setActiveTab] = useState<'servicios' | 'inspecciones' | 'vistobueno'>('servicios');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Formulario
  const [selectedItemCodigo, setSelectedItemCodigo] = useState('');
  const [cantidad, setCantidad] = useState('1');

  // Buscar contribuyentes
  const filteredUsers = searchQuery.length > 2 
    ? contribuyentes.filter(c => 
        (c.Identidad || c.identidad || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.Contribuyente || c.nombre || '').toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSelectUser = (user: any) => {
    setSelectedUser(user);
    setSearchQuery('');
  };

  const currentItems = 
    activeTab === 'servicios' ? ordenanzaData.serviciosEspeciales :
    activeTab === 'inspecciones' ? ordenanzaData.inspeccionesTecnicas :
    ordenanzaData.vistoBueno;

  const selectedItem = currentItems.find((i: any) => i.codigo === selectedItemCodigo);

  // Calcular total
  let totalTcmmv = 0;
  if (selectedItem) {
    const qty = parseFloat(cantidad) || 0;
    if (activeTab === 'servicios') {
      totalTcmmv = (selectedItem as any).tcmvBase * qty;
    } else if (activeTab === 'inspecciones') {
      totalTcmmv = (selectedItem as any).tcmv * qty;
    } else if (activeTab === 'vistobueno') {
      totalTcmmv = (selectedItem as any).tcmvPorM2 * qty;
    }
  }
  const totalBs = tcmmv ? totalTcmmv * tcmmv : 0;

  const handleGenerarPlanilla = () => {
    if (!selectedUser || !selectedItem) return alert('Seleccione contribuyente y trámite.');
    generarPlanillaAmbiental({
      contribuyente: selectedUser,
      tramite: selectedItem,
      cantidad: parseFloat(cantidad) || 1,
      totalTcmmv,
      totalBs,
      tcmmv,
      tipo: activeTab
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Leaf className="text-green-600" /> 
            Módulo Ambiental (I.S.M.A)
          </h1>
          <p className="text-slate-500 text-sm">Emisión de planillas para Servicios Especiales, Inspecciones y Visto Bueno</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm text-sm">
          <span className="text-slate-500 mr-2">Valor UCD actual:</span>
          <strong className="text-slate-800 font-mono text-lg text-emerald-700">Bs. {formatBs(tcmmv || 0)}</strong>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('servicios'); setSelectedItemCodigo(''); setCantidad('1'); }}
            className={\`flex-1 py-3 px-4 text-center font-bold text-sm whitespace-nowrap transition-colors \${
              activeTab === 'servicios' ? 'bg-green-50 text-green-700 border-b-2 border-green-600' : 'text-slate-500 hover:bg-slate-50'
            }\`}
          >
            Servicios Especiales (Art. 51)
          </button>
          <button
            onClick={() => { setActiveTab('inspecciones'); setSelectedItemCodigo(''); setCantidad('1'); }}
            className={\`flex-1 py-3 px-4 text-center font-bold text-sm whitespace-nowrap transition-colors \${
              activeTab === 'inspecciones' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'
            }\`}
          >
            Inspecciones Técnicas
          </button>
          <button
            onClick={() => { setActiveTab('vistobueno'); setSelectedItemCodigo(''); setCantidad('1'); }}
            className={\`flex-1 py-3 px-4 text-center font-bold text-sm whitespace-nowrap transition-colors \${
              activeTab === 'vistobueno' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600' : 'text-slate-500 hover:bg-slate-50'
            }\`}
          >
            Visto Bueno Ambiental
          </button>
        </div>

        <div className="p-6">
          {/* Selector de Contribuyente */}
          <div className="mb-6 relative">
            <label className="block text-sm font-bold text-slate-700 mb-2">1. Seleccionar Contribuyente</label>
            {!selectedUser ? (
              <div className="relative">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por RIF o Nombre..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
                <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                
                {filteredUsers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-lg rounded-lg z-10 overflow-hidden">
                    {filteredUsers.map((u: any) => (
                      <button 
                        key={u.id} 
                        onClick={() => handleSelectUser(u)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex justify-between items-center"
                      >
                        <span className="font-semibold text-sm">{u.Contribuyente || u.nombre}</span>
                        <span className="text-xs text-slate-500 font-mono">{u.Identidad || u.identidad}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-800">{selectedUser.Contribuyente || selectedUser.nombre}</div>
                  <div className="text-xs text-slate-500 font-mono">{selectedUser.Identidad || selectedUser.identidad}</div>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="text-xs text-red-600 hover:text-red-800 bg-red-50 px-2 py-1 rounded border border-red-200"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Selector de Trámite */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">2. Seleccionar Trámite</label>
              <select 
                value={selectedItemCodigo}
                onChange={(e) => setSelectedItemCodigo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none mb-4"
              >
                <option value="">-- Seleccione un trámite --</option>
                {currentItems.map((item: any) => (
                  <option key={item.codigo} value={item.codigo}>
                    {item.codigo} - {item.label}
                  </option>
                ))}
              </select>

              {selectedItem && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    3. Cantidad {
                      activeTab === 'servicios' ? \`(Unidad: \${(selectedItem as any).unidad})\` : 
                      activeTab === 'vistobueno' ? '(Metros Cuadrados)' : ''
                    }
                  </label>
                  <input 
                    type="number" 
                    min="0.1" 
                    step="0.1"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              )}
            </div>

            {/* Resumen de Cálculo */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-700 mb-3 border-b border-slate-200 pb-2">Resumen de Liquidación</h3>
                {!selectedItem ? (
                  <p className="text-sm text-slate-500 italic text-center py-4">Seleccione un trámite para ver el cálculo.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tarifa Base:</span>
                      <span className="font-mono font-medium">
                        {activeTab === 'servicios' ? (selectedItem as any).tcmvBase : 
                         activeTab === 'inspecciones' ? (selectedItem as any).tcmv : 
                         (selectedItem as any).tcmvPorM2} UCD
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Cantidad:</span>
                      <span className="font-mono font-medium">{cantidad}</span>
                    </div>
                    <div className="border-t border-slate-200 my-2 pt-2 flex justify-between font-bold">
                      <span className="text-slate-800">Total UCD:</span>
                      <span className="font-mono text-emerald-700">{totalTcmmv.toFixed(2)} UCD</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase">Monto a Pagar</span>
                  <span className="text-2xl font-black text-slate-800 font-mono">Bs. {formatBs(totalBs)}</span>
                </div>
                <button 
                  onClick={handleGenerarPlanilla}
                  disabled={!selectedUser || !selectedItem || totalBs <= 0}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <Printer size={18} />
                  Generar Planilla Oficial
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(file, content);
console.log('Done rewriting ambiental page');
