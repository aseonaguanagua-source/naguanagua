'use client';
import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/DataTable';
import { Handshake, FileEdit, Plus, X, Search, Upload } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';

export default function ConveniosPagoPage() {
  const { convenios, inmuebles, recibos, tcmmv } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewCuotasModal, setViewCuotasModal] = useState<{isOpen: boolean, convenio: any}>({isOpen: false, convenio: null});
  const [searchDoc, setSearchDoc] = useState('');
  const [foundUser, setFoundUser] = useState<any>(null);
  
  const [cuotas, setCuotas] = useState(1);
  const [frecuencia, setFrecuencia] = useState('Mensual');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
  const [mantenerDia, setMantenerDia] = useState(true);
  const [documento, setDocumento] = useState<File | null>(null);
  const [listaCuotas, setListaCuotas] = useState<any[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);

  // Generar cuotas por defecto cuando cambian los parámetros
  useEffect(() => {
    if (!foundUser) {
      setListaCuotas([]);
      return;
    }
    
    const totalBs = parseFloat(foundUser.montoACongelar);
    if (isNaN(totalBs) || totalBs <= 0) return;
    
    const montoPorCuota = (totalBs / cuotas).toFixed(2);
    const nuevasCuotas: any[] = [];
    const [yearStr, monthStr, dayStr] = fechaInicio.split('-');
    const baseYear = parseInt(yearStr);
    const baseMonth = parseInt(monthStr) - 1; // 0-indexed
    const baseDay = parseInt(dayStr);
    
    for (let i = 0; i < cuotas; i++) {
      let currentDate = new Date(baseYear, baseMonth, baseDay);
      let calcMonth = baseMonth;

      if (frecuencia === 'Quincenal') {
        currentDate = new Date(baseYear, baseMonth, baseDay + (i * 15));
      } else {
        if (frecuencia === 'Mensual') {
          calcMonth = baseMonth + i;
        } else if (frecuencia === 'Bimestral') {
          calcMonth = baseMonth + (i * 2);
        }

        if (mantenerDia) {
          currentDate = new Date(baseYear, calcMonth, baseDay);
          // Prevenir salto de mes (ej. 31 feb -> 2 o 3 mar). Ajustar al último día del mes objetivo.
          if (currentDate.getMonth() !== calcMonth % 12) {
            currentDate = new Date(baseYear, calcMonth + 1, 0); 
          }
        } else {
          currentDate = new Date(baseYear, baseMonth, baseDay);
          if (frecuencia === 'Mensual') currentDate.setMonth(currentDate.getMonth() + i);
          else if (frecuencia === 'Bimestral') currentDate.setMonth(currentDate.getMonth() + (i * 2));
        }
      }

      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      
      nuevasCuotas.push({
        id: i,
        fecha: `${y}-${m}-${d}`,
        monto: montoPorCuota,
        estado: 'Pendiente'
      });
    }
    setListaCuotas(nuevasCuotas);
  }, [cuotas, frecuencia, fechaInicio, foundUser, mantenerDia]);

  const columns = [
    { key: 'numero', header: 'Nro. Convenio' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'monto_total', header: 'Deuda Refinanciada' },
    { key: 'cuotas', header: 'Cuotas Acordadas' },
    { key: 'inicio', header: 'Fecha de Inicio' },
    { key: 'estado', header: 'Estado del Acuerdo', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${
        row.estado === 'Al Día' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}>{row.estado}</span>
    ) },
    { key: 'actions', header: 'Gestión', render: (row: any) => (
      <div className="flex gap-2">
        <button 
          onClick={() => setViewCuotasModal({isOpen: true, convenio: row})}
          className="text-slate-600 hover:text-slate-900 text-xs flex items-center gap-1"
        >
          <FileEdit size={14} /> Cuotas
        </button>
        {row.documento_url && (
          <a href={row.documento_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
            <Handshake size={14} /> PDF
          </a>
        )}
      </div>
    ) }
  ];

  const handleSearch = () => {
    const userInmuebles = inmuebles.filter(i => i.identidad === searchDoc || i.cod_cont === searchDoc);
    
    // Also find pending recibos
    const cleanSearchDoc = searchDoc.replace(/-/g, '').toUpperCase();
    const userFacturas = (recibos || []).filter(f => {
      const idCleanFactura = (f.identidad || '').replace(/-/g, '').toUpperCase();
      const belongsToUser = idCleanFactura === cleanSearchDoc || (userInmuebles.length > 0 && f.contribuyente === userInmuebles[0].contribuyente);
      return belongsToUser && f.estado === 'Pendiente';
    });

    if (userInmuebles.length > 0 || userFacturas.length > 0) {
      const identidad = userInmuebles.length > 0 ? userInmuebles[0].identidad : userFacturas[0].identidad;
      const contribuyente = userInmuebles.length > 0 ? userInmuebles[0].contribuyente : userFacturas[0].contribuyente;
      
      const totalMMV = userInmuebles.reduce((acc, curr) => acc + (parseFloat(curr.deuda_mmv) || parseFloat(curr.DeudaMMV) || 0), 0);
      const totalCongelada = userInmuebles.reduce((acc, curr) => acc + (parseFloat(curr.deuda_congelada_bs) || parseFloat(curr.DeudaCongelada) || 0), 0);
      const totalFacturasBs = userFacturas.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);

      setFoundUser({
        identidad,
        contribuyente,
        inmuebles: userInmuebles,
        recibos: userFacturas,
        totalMMV,
        totalCongelada,
        totalFacturasBs,
        montoACongelar: ((totalMMV * tcmmv) + totalCongelada + totalFacturasBs).toFixed(2)
      });
    } else {
      setFoundUser(null);
      alert('Contribuyente no encontrado o no tiene deuda pendiente.');
    }
  };

  const handleCuotaChange = (index: number, field: string, value: string) => {
    const newCuotas = [...listaCuotas];
    newCuotas[index][field] = value;
    setListaCuotas(newCuotas);
  };

  const handleCrearConvenio = async () => {
    if (!foundUser) return;
    
    // Validate that sum of quotas matches total debt
    const sumaCuotas = listaCuotas.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
    const totalFijado = parseFloat(foundUser.montoACongelar);
    
    if (Math.abs(sumaCuotas - totalFijado) > 1.0) {
      if (!confirm(`La suma de las cuotas (${sumaCuotas.toFixed(2)}) no coincide exactamente con la deuda a congelar (${totalFijado.toFixed(2)}). ¿Deseas continuar de todos modos?`)) {
        return;
      }
    }

    setIsProcessing(true);
    
    try {
      if (totalFijado <= 0) {
        alert('El contribuyente no tiene deuda fluctuante que congelar.');
        setIsProcessing(false);
        return;
      }

      let docUrl = null;
      if (documento) {
        const fileExt = documento.name.split('.').pop();
        const fileName = `convenio_${foundUser.identidad}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('convenios')
          .upload(fileName, documento);
          
        if (uploadError) {
          console.error('Error subiendo documento:', uploadError);
          alert('Hubo un error subiendo el documento adjunto. Asegúrate que el bucket "convenios" exista y sea público.');
        } else {
          const { data } = supabase.storage.from('convenios').getPublicUrl(fileName);
          docUrl = data.publicUrl;
        }
      }

      // Actualizar inmuebles
      for (const inm of foundUser.inmuebles) {
        const mmv = inm.DeudaMMV || inm.deuda_mmv || 0;
        if (mmv > 0) {
          const bsToFreeze = mmv * tcmmv;
          const currentFrozen = parseFloat(inm.deuda_congelada_bs || inm.DeudaCongelada || '0');
          await supabase
            .from('inmuebles')
            .update({ 
              deuda_mmv: 0, 
              deuda_congelada_bs: currentFrozen + bsToFreeze 
            })
            .eq('id', inm.id);
        }
      }

      // Actualizar recibos incluidas
      if (foundUser.recibos && foundUser.recibos.length > 0) {
        const referencias = foundUser.recibos.map((f: any) => f.referencia);
        await supabase
          .from('facturas')
          .update({ estado: 'Refinanciado' })
          .in('referencia', referencias);
      }

      // Crear registro en convenios
      const nroConvenio = `CONV-${Date.now().toString().slice(-6)}`;
      await supabase.from('convenios').insert({
        numero: nroConvenio,
        contribuyente: foundUser.contribuyente,
        identidad: foundUser.identidad,
        monto_total: `${totalFijado.toFixed(2)} Bs`,
        cuotas: cuotas,
        frecuencia: frecuencia,
        inicio: fechaInicio,
        estado: 'Al Día',
        documento_url: docUrl,
        detalle_cuotas: JSON.stringify(listaCuotas)
      });

      // Crear registro de auditoría
      await supabase.from('audit').insert({
        action: 'Creación de Convenio (Congelamiento)',
        details: `Convenio ${nroConvenio} para ${foundUser.identidad}. Monto Congelado: ${totalFijado.toFixed(2)} Bs a Tasa: ${tcmmv}`,
        user_email: 'Admin',
        module: 'Convenios'
      });

      alert('Convenio creado exitosamente. La deuda ha sido congelada.');
      setIsModalOpen(false);
      window.location.reload();
      
    } catch (error) {
      console.error(error);
      alert('Error al crear el convenio');
    }
    setIsProcessing(false);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6 relative">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Convenios de Pago (Refinanciamiento)
          </h1>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> Crear Convenio
        </button>
      </div>

      <DataTable data={convenios} columns={columns} itemsPerPage={10} />

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
              <h3 className="font-semibold text-slate-800 uppercase text-sm flex items-center gap-2">
                <Handshake size={16} /> Nuevo Convenio de Pago
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Buscador */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Buscar Contribuyente (Cédula/RIF o Código)
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={searchDoc}
                    onChange={(e) => setSearchDoc(e.target.value)}
                    placeholder="V-12345678 o C-001"
                    className="flex-1 border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={handleSearch} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded border border-slate-200">
                    <Search size={16} />
                  </button>
                </div>
              </div>

              {foundUser && (
                <div className="bg-blue-50 p-4 rounded-md border border-blue-100 text-sm space-y-2">
                  <p><span className="font-semibold">Contribuyente:</span> {foundUser.contribuyente}</p>
                  <p><span className="font-semibold">Identidad:</span> {foundUser.identidad}</p>
                  <div className="pt-2 mt-2 border-t border-blue-200/50">
                    <p className="text-xs text-slate-500 mb-1">Tasa BCV (TCMMV) Actual: <span className="font-semibold text-slate-700">{tcmmv} Bs</span></p>
                    <p className="flex justify-between items-center text-red-600 font-medium">
                      <span>Deuda Fluctuante a Congelar (MMV):</span>
                      <span>{foundUser.totalMMV} MMV</span>
                    </p>
                    <p className="flex justify-between items-center text-slate-600 font-medium mt-1">
                      <span>Deuda por Recibos (Recibos):</span>
                      <span>{foundUser.totalFacturasBs?.toFixed(2)} Bs</span>
                    </p>
                    <p className="flex justify-between items-center text-emerald-700 font-bold text-lg mt-1 pt-1 border-t border-blue-200/50">
                      <span>Monto Final de la Deuda (Bs):</span>
                      <span>{foundUser.montoACongelar} Bs</span>
                    </p>
                  </div>
                </div>
              )}

              {foundUser && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Número de Cuotas</label>
                      <select value={cuotas} onChange={(e) => setCuotas(parseInt(e.target.value))} className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                        {[1,2,3,4,5,6,12].map(n => <option key={n} value={n}>{n} {n===1?'cuota':'cuotas'}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Frecuencia (Tiempo)</label>
                      <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                        <option value="Quincenal">Quincenal</option>
                        <option value="Mensual">Mensual</option>
                        <option value="Bimestral">Bimestral</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de Inicio de Pago</label>
                    <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"/>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input type="checkbox" checked={mantenerDia} onChange={(e) => setMantenerDia(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-xs text-slate-600">Mantener el mismo día para las cuotas siguientes</span>
                    </label>
                  </div>
                  
                  {/* Carga de documento */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Documento de Respaldo Firmado (Opcional)</label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                        <Upload size={16} /> Subir Archivo
                        <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setDocumento(e.target.files[0]);
                          }
                        }} />
                      </label>
                      <span className="text-sm text-slate-500 truncate max-w-[200px]">
                        {documento ? documento.name : 'Ningún archivo seleccionado'}
                      </span>
                    </div>
                  </div>

                  {/* Tabla de cuotas editable */}
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-800 mb-3">Programación de Cuotas a Pagar</h4>
                    <div className="bg-slate-50 border border-slate-200 rounded overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 text-xs">
                          <tr>
                            <th className="px-4 py-2 w-16 text-center">Nro</th>
                            <th className="px-4 py-2">Fecha de Pago</th>
                            <th className="px-4 py-2 text-right">Monto (Bs)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {listaCuotas.map((c, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2 text-center font-medium text-slate-500">{i + 1}</td>
                              <td className="px-4 py-2">
                                <input 
                                  type="date" 
                                  value={c.fecha}
                                  onChange={(e) => handleCuotaChange(i, 'fecha', e.target.value)}
                                  className="w-full border-none bg-transparent focus:ring-1 focus:ring-blue-500 px-1 py-1 rounded"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1 justify-end">
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={c.monto}
                                    onChange={(e) => handleCuotaChange(i, 'monto', e.target.value)}
                                    className="w-32 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded text-right font-medium text-slate-800"
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-100 border-t border-slate-300 font-medium">
                          <tr>
                            <td colSpan={2} className="px-4 py-2 text-right text-slate-700">Suma Total de Cuotas:</td>
                            <td className={`px-4 py-2 text-right font-bold ${
                              Math.abs(listaCuotas.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0) - parseFloat(foundUser.montoACongelar)) > 1
                              ? 'text-red-600' : 'text-emerald-700'
                            }`}>
                              {listaCuotas.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0).toFixed(2)} Bs
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 z-10">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCrearConvenio}
                disabled={!foundUser || isProcessing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isProcessing ? 'Procesando...' : 'Guardar y Congelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewCuotasModal.isOpen && viewCuotasModal.convenio && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Detalles del Convenio</h3>
                <p className="text-sm text-slate-500 mt-1">{viewCuotasModal.convenio.numero}</p>
              </div>
              <button 
                onClick={() => setViewCuotasModal({isOpen: false, convenio: null})}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-slate-500 mb-1">Contribuyente</span>
                  <span className="font-semibold text-slate-800">{viewCuotasModal.convenio.contribuyente}</span>
                </div>
                <div>
                  <span className="block text-slate-500 mb-1">Total Refinanciado</span>
                  <span className="font-semibold text-slate-800">{viewCuotasModal.convenio.monto_total}</span>
                </div>
              </div>

              <h4 className="text-sm font-semibold text-slate-800 mb-3">Cronograma de Cuotas</h4>
              
              {(!viewCuotasModal.convenio.detalle_cuotas || viewCuotasModal.convenio.detalle_cuotas === '[]') ? (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center text-orange-700">
                  <p className="font-medium">Convenio Histórico Consolidado</p>
                  <p className="text-sm mt-2 opacity-80">Este acuerdo proviene de la base de datos histórica. No posee un desglose de cuotas detallado en el sistema.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 text-xs">
                      <tr>
                        <th className="px-4 py-3 font-semibold">N° Cuota</th>
                        <th className="px-4 py-3 font-semibold">Fecha Vencimiento</th>
                        <th className="px-4 py-3 font-semibold">Monto (Bs)</th>
                        <th className="px-4 py-3 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(JSON.parse(viewCuotasModal.convenio.detalle_cuotas || '[]')).map((c: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-600">{i + 1}</td>
                          <td className="px-4 py-3 text-slate-600">{c.fecha}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{c.monto} Bs</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              c.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' :
                              c.estado === 'Vencido' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {c.estado || 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end">
              <button 
                onClick={() => setViewCuotasModal({isOpen: false, convenio: null})}
                className="px-6 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded shadow-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
