'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/store/AppContext';
import { Calculator, Building, Home, Coins, Search, Filter } from 'lucide-react';

export default function TarifasPage() {
  const { ordenanzasConfig: ordenanzaData } = useAppContext();
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvDate, setBcvDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Todas');
  const tabs = ['Todas', 'Residencial', 'Comercial/Institucional', 'Industrial', 'Permisos / Serv. Especiales', 'Calculadora de Trámites'];

  // Estados de la calculadora
  const [calcTipo, setCalcTipo] = useState('Servicios Extraordinarios');
  const [calcCamion, setCalcCamion] = useState('350');
  const [calcDistancia, setCalcDistancia] = useState('Menor a 20 kms');
  const [calcTcmmv, setCalcTcmmv] = useState<number | ''>('');

  useEffect(() => {
    const fetchBcv = async () => {
      try {
        const res = await fetch('/api/bcv');
        const data = await res.json();
        setBcvRate(data.tcmmv);
        setBcvDate(new Date(data.timestamp).toLocaleString());
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBcv();
  }, []);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Cargando tasas y ordenanza...</div>;
  }

  const rate = bcvRate || 1;
  const searchTerm = searchQuery.toLowerCase();

  const filteredResidenciales = ordenanzaData.tiposResidenciales.filter(
    (tipo) => tipo.label.toLowerCase().includes(searchTerm)
  );

  const filteredComerciales = ordenanzaData.actividadesComerciales.filter(
    (act) => act.label.toLowerCase().includes(searchTerm)
  );

  const filteredIndustriales = ordenanzaData.actividadesIndustriales.filter(
    (act) => act.label.toLowerCase().includes(searchTerm)
  );

  // Lógica de Calculadora
  const calcularMontoExtraordinario = () => {
    if (calcDistancia === 'Menor a 20 kms') {
      if (calcCamion === '350') return 30;
      if (calcCamion === '600') return 50;
      if (calcCamion === '750') return 70;
    } else {
      if (calcCamion === '350') return 40;
      if (calcCamion === '600') return 60;
      if (calcCamion === '750') return 80;
    }
    return 0;
  };

  const factorCalculadora = calcTipo === 'Servicios Extraordinarios' 
    ? calcularMontoExtraordinario() 
    : (calcTipo === 'Reclamos / Sugerencias' ? 0 : Number(calcTcmmv) || 0);

  const montoCalculadoBs = (factorCalculadora * rate).toFixed(2);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Tarifas según Ordenanza
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar tarifa o actividad..."
              className="pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 w-64 shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded border border-blue-200 text-sm font-medium">
            Tasa Oficial BCV: <span className="font-bold">{rate.toFixed(2)} Bs</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Filter className="w-4 h-4 text-slate-400 mr-2" />
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Tarifas Residenciales */}
        {(activeTab === 'Todas' || activeTab === 'Residencial') && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Home className="w-4 h-4 text-slate-600" />
            <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Tarifas Residenciales</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">Clasificador</th>
                  <th className="px-4 py-3 font-semibold text-center w-32">Factor (TCMMV)</th>
                  <th className="px-4 py-3 font-semibold text-right w-40">Monto Mensual (Bs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredResidenciales.length > 0 ? (
                  filteredResidenciales.map((tipo, idx) => {
                    const monto = (tipo.factor * rate).toFixed(2);
                    return (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{tipo.label}</td>
                        <td className="px-4 py-3 text-center">{tipo.factor.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50/30">Bs. {monto}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">No se encontraron clasificaciones residenciales</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Tarifas Comerciales */}
        {(activeTab === 'Todas' || activeTab === 'Comercial/Institucional') && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Building className="w-4 h-4 text-slate-600" />
            <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Tarifas Comerciales / Institucionales</h2>
          </div>
          <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            Los cálculos muestran el monto final en Bolívares (Factor TCMMV × Tasa BCV) para cada nivel de metraje.
          </div>
          <div className="overflow-x-auto h-[600px] relative">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase border-r border-slate-200 bg-slate-100">Actividad Económica</th>
                  {ordenanzaData.nivelesMetraje.map((nivel, idx) => (
                    <th key={idx} className="px-4 py-3 font-bold text-center border-r border-slate-200 bg-slate-100 w-32">
                      <div className="text-[10px] text-slate-500 font-normal uppercase mb-1">Nivel {idx + 1}</div>
                      {nivel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredComerciales.length > 0 ? (
                  filteredComerciales.map((actividad, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700 border-r border-slate-100 bg-white sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {actividad.label}
                      </td>
                      {actividad.factores.map((factor, fIdx) => {
                        const monto = (factor * rate).toFixed(2);
                        return (
                          <td key={fIdx} className="px-4 py-2 text-center border-r border-slate-100 group relative cursor-default">
                            <div className="text-[10px] text-slate-400 mb-0.5">{factor.toFixed(2)} TCMMV</div>
                            <div className="font-bold text-green-700">Bs. {monto}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={ordenanzaData.nivelesMetraje.length + 1} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron actividades comerciales
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Tarifas Industriales */}
        {(activeTab === 'Todas' || activeTab === 'Industrial') && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in duration-200 mt-6">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Building className="w-4 h-4 text-slate-600" />
            <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Tarifas Industriales</h2>
          </div>
          <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            Los cálculos muestran el monto final en Bolívares (Factor TCMMV × Tasa BCV) para cada nivel de metraje.
          </div>
          <div className="overflow-x-auto h-[600px] relative">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase border-r border-slate-200 bg-slate-100">Actividad Económica</th>
                  {ordenanzaData.nivelesMetraje.map((nivel, idx) => (
                    <th key={idx} className="px-4 py-3 font-bold text-center border-r border-slate-200 bg-slate-100 w-32">
                      <div className="text-[10px] text-slate-500 font-normal uppercase mb-1">Nivel {idx + 1}</div>
                      {nivel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredIndustriales.length > 0 ? (
                  filteredIndustriales.map((actividad, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700 border-r border-slate-100 bg-white sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {actividad.label}
                      </td>
                      {actividad.factores.map((factor, fIdx) => {
                        const monto = (factor * rate).toFixed(2);
                        return (
                          <td key={fIdx} className="px-4 py-2 text-center border-r border-slate-100 group relative cursor-default">
                            <div className="text-[10px] text-slate-400 mb-0.5">{factor.toFixed(2)} TCMMV</div>
                            <div className="font-bold text-green-700">Bs. {monto}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={ordenanzaData.nivelesMetraje.length + 1} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron actividades industriales
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Permisos / Servicios Especiales */}
        {(activeTab === 'Permisos / Serv. Especiales') && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-200">
          {/* Servicios Especiales */}
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-600" />
              <h2 className="font-bold text-emerald-800 uppercase text-sm tracking-wide">Servicios Especiales y Permisos Ambientales</h2>
              <span className="ml-auto text-xs text-emerald-600 font-medium">Art. 43-50 Ordenanza de Aseo</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-emerald-50 border-b border-emerald-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cód.</th>
                    <th className="px-4 py-3 font-semibold">Servicio / Permiso</th>
                    <th className="px-4 py-3 font-semibold text-center">Unidad</th>
                    <th className="px-4 py-3 font-semibold text-center">Factor (TCMMV)</th>
                    <th className="px-4 py-3 font-semibold text-right">Tarifa Base (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordenanzaData.serviciosEspeciales.map((s: any, idx: number) => (
                    <tr key={idx} className={`hover:bg-emerald-50/40 transition-colors ${s.tcmvBase === 0 ? 'italic text-slate-400' : ''}`}>
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{s.codigo}</span></td>
                      <td className="px-4 py-3 font-medium text-slate-700">{s.label}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">{s.unidad}</td>
                      <td className="px-4 py-3 text-center">{s.tcmvBase > 0 ? s.tcmvBase : 'Libre'}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{s.tcmvBase > 0 ? 'Bs. ' + (s.tcmvBase * rate).toFixed(2) : 'A convenir'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inspecciones Técnicas */}
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <h2 className="font-bold text-blue-800 uppercase text-sm tracking-wide">Inspecciones Técnicas Ambientales</h2>
              <span className="ml-auto text-xs text-blue-600 font-medium">Tabla 5 — Ordenanza</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-blue-50 border-b border-blue-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cód.</th>
                    <th className="px-4 py-3 font-semibold">Tipo de Inspección</th>
                    <th className="px-4 py-3 font-semibold text-center">Factor (TCMMV)</th>
                    <th className="px-4 py-3 font-semibold text-right">Tarifa (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordenanzaData.inspeccionesTecnicas.map((s: any, idx: number) => (
                    <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{s.codigo}</span></td>
                      <td className="px-4 py-3 font-medium text-slate-700">{s.label}</td>
                      <td className="px-4 py-3 text-center">{s.tcmv}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700">Bs. {(s.tcmv * rate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visto Bueno Ambiental */}
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-600" />
              <h2 className="font-bold text-indigo-800 uppercase text-sm tracking-wide">Visto Bueno Ambiental</h2>
              <span className="ml-auto text-xs text-indigo-600 font-medium">Tabla 6 — Tarifa por m² del Inmueble</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-indigo-50 border-b border-indigo-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cód.</th>
                    <th className="px-4 py-3 font-semibold">Tipo de Visto Bueno</th>
                    <th className="px-4 py-3 font-semibold text-center">TCMMV / m²</th>
                    <th className="px-4 py-3 font-semibold text-center">Ej: 100 m²</th>
                    <th className="px-4 py-3 font-semibold text-center">Ej: 200 m²</th>
                    <th className="px-4 py-3 font-semibold text-center">Ej: 500 m²</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordenanzaData.vistoBueno.map((s: any, idx: number) => (
                    <tr key={idx} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{s.codigo}</span></td>
                      <td className="px-4 py-3 font-medium text-slate-700">{s.label}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{s.tcmvPorM2}</td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-700">Bs. {(s.tcmvPorM2 * 100 * rate).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-700">Bs. {(s.tcmvPorM2 * 200 * rate).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center font-bold text-indigo-700">Bs. {(s.tcmvPorM2 * 500 * rate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-indigo-50/50 border-t border-indigo-100 text-[10px] text-indigo-500">
              * La tarifa final se calcula multiplicando: TCMMV/m² × Superficie del inmueble (m²) × Tasa BCV del día
            </div>
          </div>

          {/* Servicios Extraordinarios */}
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex items-center gap-2">
              <Building className="w-4 h-4 text-orange-600" />
              <h2 className="font-bold text-orange-800 uppercase text-sm tracking-wide">Servicios Extraordinarios (Recolección Especial)</h2>
              <span className="ml-auto text-xs text-orange-600 font-medium">Tabla 3 — Camiones</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-orange-50 border-b border-orange-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tipo de Camión</th>
                    <th className="px-4 py-3 font-semibold text-center">Distancia</th>
                    <th className="px-4 py-3 font-semibold text-center">Factor (TCMMV)</th>
                    <th className="px-4 py-3 font-semibold text-right">Tarifa (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordenanzaData.serviciosExtraordinarios.map((s: any, idx: number) => (
                    <tr key={idx} className="hover:bg-orange-50/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{s.label.split('(')[0].trim()}</td>
                      <td className="px-4 py-3 text-center text-xs">{s.distancia === 'menor' ? '< 20 Km' : '> 20 Km'}</td>
                      <td className="px-4 py-3 text-center">{s.tcmv}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-700">Bs. {(s.tcmv * rate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {/* Calculadora de Trámites */}
        {(activeTab === 'Calculadora de Trámites') && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in duration-200 p-6">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
            <Calculator className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800 text-lg">Calculadora de Trámites y Servicios</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Trámite / Solicitud</label>
                <select 
                  className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={calcTipo}
                  onChange={(e) => setCalcTipo(e.target.value)}
                >
                  <option value="Servicios Extraordinarios">Servicios Extraordinarios (Camión)</option>
                  <option value="Visto Bueno Ambiental">Visto Bueno Ambiental</option>
                  <option value="Inspección">Inspección</option>
                  <option value="Reclamos / Sugerencias">Reclamos / Sugerencias</option>
                </select>
              </div>

              {calcTipo === 'Servicios Extraordinarios' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Camión</label>
                    <select 
                      className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={calcCamion}
                      onChange={(e) => setCalcCamion(e.target.value)}
                    >
                      <option value="350">Camión 350</option>
                      <option value="600">Camión 600</option>
                      <option value="750">Camión 750</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Distancia del Viaje</label>
                    <select 
                      className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={calcDistancia}
                      onChange={(e) => setCalcDistancia(e.target.value)}
                    >
                      <option value="Menor a 20 kms">Menor a 20 kms</option>
                      <option value="Mayor a 20 kms">Mayor a 20 kms</option>
                    </select>
                  </div>
                </>
              ) : calcTipo !== 'Reclamos / Sugerencias' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto de la Tasa (En TCMMV)</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="Ej. 10"
                    className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={calcTcmmv}
                    onChange={(e) => setCalcTcmmv(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <p className="text-xs text-slate-500 mt-1">Ingrese el valor en unidades tributarias municipales (TCMMV) según indique la ordenanza correspondiente.</p>
                </div>
              ) : (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-md text-sm border border-emerald-100">
                  Los reclamos y sugerencias son trámites gratuitos.
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-center items-center text-center">
              <span className="text-slate-500 font-medium mb-2 uppercase tracking-wide text-xs">Total Calculado</span>
              <div className="text-4xl font-bold text-slate-800 mb-2">Bs. {montoCalculadoBs}</div>
              <div className="text-sm text-slate-500">
                Basado en {factorCalculadora} TCMMV x {rate.toFixed(2)} Bs (Tasa BCV)
              </div>
              {calcTipo === 'Servicios Extraordinarios' && (
                <div className="mt-4 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                  Según Tabla 3 (Anexo Ordenanza de Aseo)
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
