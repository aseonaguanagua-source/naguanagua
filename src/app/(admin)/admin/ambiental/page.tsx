'use client';
import React, { useState } from 'react';
import { Leaf, Plus, FileText, CheckCircle, Search } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { formatBs } from '@/lib/formatCurrency';

export default function AmbientalPage() {
  const { tcmmv } = useAppContext();
  const [activeTab, setActiveTab] = useState<'vistobueno' | 'variable'>('vistobueno');
  
  // Constantes de la ordenanza (Art 81 y 85)
  const UCD_VISTO_BUENO = 15;
  const UCD_VARIABLE = 15;

  const montoVistoBueno = tcmmv ? tcmmv * UCD_VISTO_BUENO : 0;
  const montoVariable = tcmmv ? tcmmv * UCD_VARIABLE : 0;

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Leaf className="text-green-600" /> 
            Módulo Ambiental
          </h1>
          <p className="text-slate-500">Gestión de Visto Bueno y Variable Ambiental (I.S.M.A)</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm text-sm">
          <span className="text-slate-500 mr-2">Valor UCD actual:</span>
          <strong className="text-slate-800 font-mono">Bs. {formatBs(tcmmv || 0)}</strong>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('vistobueno')}
            className={`flex-1 py-4 text-center font-medium transition-colors ${
              activeTab === 'vistobueno' ? 'bg-green-50 text-green-700 border-b-2 border-green-600' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Visto Bueno Ambiental (Art. 81)
          </button>
          <button
            onClick={() => setActiveTab('variable')}
            className={`flex-1 py-4 text-center font-medium transition-colors ${
              activeTab === 'variable' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Variable Ambiental (Art. 85)
          </button>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="relative w-96">
              <input 
                type="text" 
                placeholder="Buscar contribuyente por RIF o Nombre..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            </div>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" /> Nueva Planilla
            </button>
          </div>

          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200 flex flex-col items-center justify-center text-center">
            <FileText className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">
              Liquidación de {activeTab === 'vistobueno' ? 'Visto Bueno' : 'Variable'} Ambiental
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-4">
              De acuerdo a la Ordenanza, la tasa a pagar es equivalente a 
              <strong> {activeTab === 'vistobueno' ? UCD_VISTO_BUENO : UCD_VARIABLE} UCD </strong>
              (Bs. {formatBs(activeTab === 'vistobueno' ? montoVistoBueno : montoVariable)}).
            </p>
            <p className="text-sm text-slate-400">
              *Las multas ascienden a 30 UCD en caso de incumplimiento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
