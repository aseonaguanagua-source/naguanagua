'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Award, Printer, CheckCircle, Search, Download, AlertCircle } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { generarSolvenciaPDF, reimprimirSolvenciaPDF } from '@/lib/pdfGenerator';

export default function CertificadosPage() {
  const { certificados, contribuyentes, recibos, inmuebles, addCertificado } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const [selectedInmueble, setSelectedInmueble] = useState('');

  const handleSearch = () => {
    setSearchError('');
    setSearchResult(null);
    setSelectedInmueble('');
    
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    
    const query = searchQuery.trim().toLowerCase();
    const cleanQuery = query.replace(/[^a-z0-9]/g, ''); // Remove dashes, spaces, etc.
    
    const found = contribuyentes.find(c => {
      const identClean = (c.Identidad || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return identClean === cleanQuery || 
             identClean.includes(cleanQuery) ||
             (c.Contribuyente || '').toLowerCase().includes(query);
    });
    
    if (found) {
      // Calcular deuda
      const deudas = (recibos || [])
        .filter((f: any) => f.identidad === found.Identidad)
        .filter((f: any) => f.estado === 'Pendiente');
      
      const totalBs = deudas.reduce((acc: number, f: any) => acc + parseFloat(f.monto || '0'), 0);
      
      // Buscar inmuebles
      const misInmuebles = (inmuebles || []).filter((i: any) => i.identidad === found.Identidad);
      const isCondominio = (found.CantidadInmuebles && parseInt(found.CantidadInmuebles) > 1) || 
                           (found.Contribuyente && found.Contribuyente.toUpperCase().includes('CONDOMINIO'));

      setSearchResult({
        ...found,
        hasDebt: totalBs > 0,
        debtAmount: totalBs.toFixed(2),
        isCondominio,
        misInmuebles
      });
    } else {
      setSearchError('No se encontró ningún contribuyente con esa identificación o RIF.');
    }
    
    setIsSearching(false);
  };

  const handleDownload = async () => {
    if (!searchResult) return;
    await generarSolvenciaPDF(searchResult, selectedInmueble || 'general', addCertificado);
  };

  const columns = [
    { key: 'codigo', header: 'Código Certificado' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'tipo', header: 'Tipo de Certificado' },
    { key: 'emision', header: 'Emisión', render: (row: any) => new Date(row.emision).toLocaleDateString() },
    { key: 'vencimiento', header: 'Vencimiento', render: (row: any) => new Date(row.vencimiento).toLocaleDateString() },
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 w-fit ${
        row.estado === 'Vigente' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}>
        {row.estado === 'Vigente' && <CheckCircle size={12} />}
        {row.estado}
      </span>
    ) },
    { key: 'acciones', header: 'Acciones', render: (row: any) => (
      <button 
        onClick={() => reimprimirSolvenciaPDF(row)}
        className="text-slate-600 hover:text-blue-600 p-2 rounded transition-colors"
        title="Descargar PDF"
      >
        <Download size={18} />
      </button>
    )}
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Certificados y Solvencias Emitidas
          </h1>
        </div>
      </div>
      
      {/* Search Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-md font-bold text-slate-700 mb-4">Emisión de Certificados</h2>
        
        <div className="flex items-end gap-4 max-w-2xl mb-6">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Buscar Contribuyente (RIF / Cédula)</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Ej. J-123456789"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
          <button 
            onClick={handleSearch}
            className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded font-medium transition-colors"
          >
            Buscar
          </button>
        </div>
        
        {searchError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{searchError}</p>
          </div>
        )}
        
        {searchResult && (
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Razón Social</span>
                <p className="text-sm font-semibold text-slate-800">{searchResult.Contribuyente}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Identificación</span>
                <p className="text-sm font-medium text-slate-700">{searchResult.Identidad}</p>
              </div>
            </div>
            
            {searchResult.hasDebt ? (
              <div className="bg-red-50 p-4 rounded-lg border border-red-100 text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-700 font-bold mb-1">Posee deuda activa (Bs. {searchResult.debtAmount})</p>
                <p className="text-red-600 text-sm">No es posible generar una solvencia hasta que se cancelen las deudas pendientes.</p>
              </div>
            ) : (
              <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-100 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-emerald-700 font-bold mb-4 text-lg">Contribuyente Solvente</p>
                
                <div className="max-w-md mx-auto">
                  {searchResult.isCondominio && (
                    <div className="mb-4 text-left">
                      <label className="text-xs font-bold text-emerald-800 block mb-2">Seleccione el Inmueble (Condominio):</label>
                      <select 
                        className="w-full text-sm p-2 border border-emerald-200 rounded text-slate-700 bg-white"
                        value={selectedInmueble}
                        onChange={(e) => setSelectedInmueble(e.target.value)}
                      >
                        <option value="">-- Condominio General --</option>
                        {searchResult.misInmuebles?.map((inm: any, idx: number) => (
                          <option key={idx} value={inm.inmueble || `Local ${idx+1}`}>
                            {inm.inmueble || `Local ${idx+1}`} - {inm.actividad_principal || 'Residencial'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <button 
                    onClick={handleDownload}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded shadow font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Generar y Descargar Solvencia
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
        <DataTable data={certificados} columns={columns} itemsPerPage={10} />
      </div>
    </div>
  );
}
