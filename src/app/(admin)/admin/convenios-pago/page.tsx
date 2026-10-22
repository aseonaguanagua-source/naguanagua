'use client';
import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/DataTable';
import { Handshake, FileEdit, Plus, X, Search, Upload, Ban } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export default function ConveniosPagoPage() {
  const { convenios, inmuebles, recibos, tcmmv, refreshData, refreshUserData } = useAppContext();
  const [dbConveniosList, setDbConveniosList] = useState<any[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewCuotasModal, setViewCuotasModal] = useState<{isOpen: boolean, convenio: any}>({isOpen: false, convenio: null});
  const [searchDoc, setSearchDoc] = useState('');
  const [foundUser, setFoundUser] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleDesactivarConvenio = async (conv: any) => {
    if (!conv) return;
    const confirmacion = confirm(
      `¿Está seguro de DESACTIVAR / ANULAR el convenio ${conv.numero}?\n\nContribuyente: ${conv.contribuyente || conv.identidad}\nDeuda: Bs. ${conv.monto_total}\n\nAl desactivarlo, las cuotas pendientes quedarán canceladas y la deuda congelada del contribuyente volverá a su estado normal.`
    );
    if (!confirmacion) return;

    try {
      const res = await fetch(`/api/admin/convenios?id=${encodeURIComponent(conv.id || '')}&numero=${encodeURIComponent(conv.numero || '')}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert('Error al desactivar el convenio: ' + (data.error || 'Error en servidor'));
        return;
      }
      alert(data.message || 'Convenio desactivado exitosamente.');
      setViewCuotasModal({ isOpen: false, convenio: null });
      await fetchFreshConvenios();
      if (typeof refreshData === 'function') await refreshData();
    } catch (e: any) {
      alert('Error al desactivar convenio: ' + e.message);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFoundUser(null);
    setSearchDoc('');
    setListaCuotas([]);
    setCuotas(1);
    setDocumento(null);
    setIsProcessing(false);
  };

  const handleOpenModal = () => {
    setFoundUser(null);
    setSearchDoc('');
    setListaCuotas([]);
    setCuotas(1);
    setDocumento(null);
    setIsProcessing(false);
    setIsModalOpen(true);
  };

  const fetchFreshConvenios = async () => {
    setLoadingConv(true);
    try {
      const res = await fetch('/api/admin/convenios');
      const j = await res.json();
      if (j.ok && Array.isArray(j.data)) {
        const formatted = j.data.map((c: any) => {
          const inmMatch = (inmuebles || []).find((i: any) => {
            const cIdClean = String(c.identidad || '').replace(/\D/g, '');
            const iIdClean = String(i.identidad || i.Identidad || '').replace(/\D/g, '');
            return cIdClean && iIdClean && cIdClean === iIdClean;
          });
          return {
            ...c,
            contribuyente: inmMatch?.contribuyente || inmMatch?.Contribuyente || c.identidad,
            monto_total: typeof c.monto_total === 'number' ? `${c.monto_total.toFixed(2)} Bs` : (c.monto_total || '0.00 Bs'),
            inicio: c.convenios_cuotas?.[0]?.fecha || (c.created_at ? c.created_at.slice(0, 10) : ''),
            detalle_cuotas: JSON.stringify(c.convenios_cuotas || [])
          };
        });
        setDbConveniosList(formatted);
      }
    } catch (e) {
      console.warn('Error cargando convenios_pago frescos:', e);
    } finally {
      setLoadingConv(false);
    }
  };

  useEffect(() => {
    fetchFreshConvenios();
  }, [inmuebles]);
  
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
      <div className="flex items-center gap-2">
        <button 
          onClick={() => setViewCuotasModal({isOpen: true, convenio: row})}
          className="text-slate-600 hover:text-slate-900 text-xs flex items-center gap-1 cursor-pointer font-semibold"
        >
          <FileEdit size={14} /> Cuotas
        </button>
        {row.documento_url && (
          <a href={row.documento_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
            <Handshake size={14} /> PDF
          </a>
        )}
        {row.estado !== 'Anulado' && (
          <button
            onClick={() => handleDesactivarConvenio(row)}
            title="Desactivar / Anular Convenio"
            className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 cursor-pointer ml-1"
          >
            <Ban size={13} /> Anular
          </button>
        )}
      </div>
    ) }
  ];

  const handleSearch = async () => {
    const raw = (searchDoc || '').trim();
    if (!raw) return;

    setIsSearching(true);
    setFoundUser(null);

    try {
      // 1. Normalizar término de búsqueda
      const cleanSearchDoc = raw.replace(/[\s-]/g, '').toUpperCase();
      const soloNum = cleanSearchDoc.replace(/\D/g, '');
      const prefix = cleanSearchDoc.match(/^[VEJPG]/)?.[0] || 'V';
      const idFmt = (soloNum && soloNum.length >= 4) ? `${prefix}-${soloNum}` : '';

      // 2. Buscar en Supabase para obtener datos frescos y completos
      const ors: string[] = [
        `identidad.ilike.%${cleanSearchDoc}%`,
        `inmueble.ilike.%${raw.toUpperCase()}%`,
      ];
      if (idFmt) ors.push(`identidad.eq.${idFmt}`);
      if (soloNum && soloNum.length >= 4) ors.push(`identidad.ilike.%${soloNum}%`);

      let userInmuebles: any[] = [];
      const { data: dbInms } = await supabase
        .from('inmuebles')
        .select('*')
        .or(ors.join(','));

      if (dbInms && dbInms.length > 0) {
        userInmuebles = dbInms;
      } else if (Array.isArray(inmuebles) && inmuebles.length > 0) {
        userInmuebles = inmuebles.filter((i: any) => {
          const iId = String(i.identidad || '').replace(/[\s-]/g, '').toUpperCase();
          const iCod = String(i.inmueble || i.cod_inmueble || i.cod_cont || '').toUpperCase();
          return iId === cleanSearchDoc || (soloNum && iId.includes(soloNum)) || iCod === raw.toUpperCase();
        });
      }

      // Buscar facturas pendientes asociadas
      const { data: dbFacturas } = await supabase
        .from('facturas')
        .select('*')
        .eq('estado', 'Pendiente')
        .or(ors.join(','));

      let userFacturas = dbFacturas || [];
      if (!userFacturas.length && Array.isArray(recibos)) {
        userFacturas = recibos.filter(f => {
          const idCleanFactura = (f.identidad || '').replace(/[\s-]/g, '').toUpperCase();
          const belongsToUser = idCleanFactura === cleanSearchDoc || (userInmuebles.length > 0 && f.contribuyente === userInmuebles[0].contribuyente);
          return belongsToUser && f.estado === 'Pendiente';
        });
      }

      // Obtener tasa efectiva si tcmmv está en 0
      let tasaEfectiva = tcmmv;
      if (!tasaEfectiva || tasaEfectiva <= 0) {
        const { data: cfg } = await supabase
          .from('sistema_config')
          .select('id, valor')
          .in('id', ['tasa_bcv_manual', 'tasa_bcv_semanal', 'tasa_bcv_diaria']);
        const v = (id: string) => parseFloat(String(cfg?.find((c: any) => c.id === id)?.valor || 0)) || 0;
        tasaEfectiva = v('tasa_bcv_manual') || v('tasa_bcv_semanal') || v('tasa_bcv_diaria') || 993.18;
      }

      if (userInmuebles.length > 0 || userFacturas.length > 0) {
        const identidad = userInmuebles.length > 0 ? userInmuebles[0].identidad : userFacturas[0].identidad;
        const contribuyente = userInmuebles.length > 0 ? userInmuebles[0].contribuyente : userFacturas[0].contribuyente;

        // Calcular deuda MMV (directa o por meses_deuda * mmv_mes)
        const totalMMV = userInmuebles.reduce((acc, curr) => {
          const mmvDirecto = parseFloat(curr.deuda_mmv) || parseFloat(curr.DeudaMMV) || 0;
          if (mmvDirecto > 0) return acc + mmvDirecto;
          const meses = parseInt(curr.meses_deuda || '0') || 0;
          const mmvMes = parseFloat(curr.mmv_mes || '0') || 0;
          return acc + (meses * mmvMes);
        }, 0);

        const totalCongelada = userInmuebles.reduce((acc, curr) => acc + (parseFloat(curr.deuda_congelada_bs) || parseFloat(curr.DeudaCongelada) || 0), 0);
        const totalFacturasBs = userFacturas.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
        const montoACongelarNum = (totalMMV * tasaEfectiva) + totalCongelada + totalFacturasBs;

        const { data: convActivo } = await supabase
          .from('convenios_pago')
          .select('id, numero, monto_total, cuotas, estado')
          .eq('identidad', identidad)
          .limit(1);

        let convExistenteId: string | null = null;
        let convExistenteNumero: string | null = null;

        if (convActivo && convActivo.length > 0) {
          const renegociar = confirm(
            `El contribuyente ${contribuyente} (${identidad}) ya tiene un Convenio de Pago registrado (${convActivo[0].numero}) por Bs. ${convActivo[0].monto_total} (${convActivo[0].cuotas} cuotas, Estado: ${convActivo[0].estado}).\n\n¿Desea renegociar o actualizar este convenio con nuevos montos o cuotas?`
          );
          if (!renegociar) {
            setFoundUser(null);
            return;
          }
          convExistenteId = convActivo[0].id;
          convExistenteNumero = convActivo[0].numero;
        } else if (montoACongelarNum <= 0.01) {
          alert(`El contribuyente ${contribuyente} (${identidad}) no presenta deuda pendiente que refinanciar.`);
          setFoundUser(null);
          return;
        }

        const montoBase = montoACongelarNum > 0 ? montoACongelarNum : (convActivo?.[0]?.monto_total || 0);

        setFoundUser({
          identidad,
          contribuyente,
          inmuebles: userInmuebles,
          recibos: userFacturas,
          totalMMV: Math.round(totalMMV * 100) / 100,
          totalCongelada,
          totalFacturasBs,
          tasaEfectiva,
          montoACongelar: Number(montoBase).toFixed(2),
          convExistenteId,
          convExistenteNumero
        });
      } else {
        setFoundUser(null);
        alert('Contribuyente no encontrado. Verifique la cédula, RIF o código de inmueble.');
      }
    } catch (err: any) {
      console.error('Error buscando contribuyente para convenio:', err);
      alert('Error en la búsqueda: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSearching(false);
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
        const fileExt = documento.name.split('.').pop() || 'pdf';
        const fileName = `convenio_${foundUser.identidad}_${Date.now()}.${fileExt}`;
        const uploadData = new FormData();
        uploadData.append('file', documento);
        uploadData.append('bucket', 'convenios');
        uploadData.append('path', fileName);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: uploadData,
        });
        const resData = await res.json();
        if (!res.ok || !resData.success) {
          console.error('Error subiendo documento:', resData.error);
          alert('Hubo un error subiendo el documento adjunto: ' + (resData.error || 'Error desconocido'));
        } else {
          docUrl = resData.publicUrl;
        }
      }

      // 1. Preparar datos de inmuebles a congelar
      const tasaAplicada = foundUser.tasaEfectiva || tcmmv || 993.18;
      const inmueblesUpdates = [];
      for (const inm of foundUser.inmuebles) {
        const mmv = parseFloat(inm.DeudaMMV || inm.deuda_mmv || '0') || ((parseInt(inm.meses_deuda || '0') || 0) * (parseFloat(inm.mmv_mes || '0') || 0));
        if (mmv > 0) {
          const bsToFreeze = mmv * tasaAplicada;
          const currentFrozen = parseFloat(inm.deuda_congelada_bs || inm.DeudaCongelada || '0');
          inmueblesUpdates.push({
            id: inm.id,
            deuda_congelada_bs: currentFrozen + bsToFreeze
          });
        }
      }

      const facturasReferencias = (foundUser.recibos || []).map((f: any) => f.referencia).filter(Boolean);
      const nroConvenio = foundUser.convExistenteNumero || `CONV-${Date.now().toString().slice(-6)}`;
      const convId = foundUser.convExistenteId || crypto.randomUUID();

      // 2. Llamada a API del servidor (bypassa RLS con supabaseAdmin)
      const resConv = await fetch('/api/admin/convenios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          convId,
          nroConvenio,
          identidad: foundUser.identidad,
          contribuyente: foundUser.contribuyente,
          montoTotal: totalFijado,
          cuotas,
          docUrl,
          listaCuotas,
          inmueblesUpdates,
          facturasReferencias,
          tasaAplicada
        })
      });

      const resJson = await resConv.json();
      if (!resConv.ok || !resJson.ok) {
        alert('No se pudo registrar el convenio (' + (resJson.error || 'Error en servidor') + '). La deuda NO fue modificada.');
        setIsProcessing(false);
        return;
      }

      alert('Convenio creado exitosamente. La deuda ha sido congelada.');
      handleCloseModal();
      // Refrescar datos sin recargar toda la pagina
      await fetchFreshConvenios();
      if (typeof refreshData === 'function') await refreshData();
      if (typeof refreshUserData === 'function' && foundUser?.identidad) await refreshUserData(foundUser.identidad);
      
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
          onClick={handleOpenModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Plus size={16} /> Crear Convenio
        </button>
      </div>

      <DataTable data={dbConveniosList.length > 0 ? dbConveniosList : convenios} columns={columns} itemsPerPage={10} />

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
              <h3 className="font-semibold text-slate-800 uppercase text-sm flex items-center gap-2">
                <Handshake size={16} /> Nuevo Convenio de Pago
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                    placeholder="V-12345678, 12345678 o AURI001"
                    className="flex-1 border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button 
                    type="button"
                    onClick={handleSearch} 
                    disabled={isSearching}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold cursor-pointer disabled:opacity-50 flex items-center justify-center min-w-[44px] transition-colors"
                    title="Buscar contribuyente"
                  >
                    <Search size={16} className={isSearching ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {foundUser && (
                <div className="bg-blue-50 p-4 rounded-md border border-blue-100 text-sm space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-200/60">
                    <span className="font-bold text-xs uppercase tracking-wide text-blue-900">Contribuyente Seleccionado</span>
                    <button 
                      type="button"
                      onClick={() => { setFoundUser(null); setSearchDoc(''); setListaCuotas([]); }}
                      className="text-xs text-blue-700 hover:text-blue-900 font-semibold underline cursor-pointer"
                    >
                      Cambiar contribuyente
                    </button>
                  </div>
                  <p><span className="font-semibold text-slate-800">Contribuyente:</span> {foundUser.contribuyente}</p>
                  <p><span className="font-semibold text-slate-800">Cédula / RIF:</span> {foundUser.identidad}</p>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold">Inmueble(s):</span> {foundUser.inmuebles.map((i: any) => i.inmueble).filter(Boolean).join(', ') || 'N/A'}
                  </p>
                  <div className="pt-2 mt-2 border-t border-blue-200/50">
                    <p className="text-xs text-slate-500 mb-1">Tasa BCV (UCD) Aplicada: <span className="font-semibold text-slate-700">Bs. {Number(foundUser.tasaEfectiva || tcmmv).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                    <p className="flex justify-between items-center text-red-600 font-medium">
                      <span>Deuda Fluctuante a Congelar (UCD):</span>
                      <span>{foundUser.totalMMV} UCD</span>
                    </p>
                    {foundUser.totalFacturasBs > 0 && (
                      <p className="flex justify-between items-center text-slate-600 font-medium mt-1">
                        <span>Deuda por Facturas / Recibos:</span>
                        <span>Bs. {Number(foundUser.totalFacturasBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    )}
                    <div className="flex justify-between items-center text-emerald-700 font-bold text-base mt-1 pt-1 border-t border-blue-200/50">
                      <span>Monto Final de la Deuda a Congelar (Bs):</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={foundUser.montoACongelar}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFoundUser((prev: any) => ({ ...prev, montoACongelar: val }));
                          }}
                          className="w-36 border border-emerald-400 bg-white rounded px-2 py-1 text-right text-emerald-800 font-bold text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const sum = listaCuotas.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
                            if (sum > 0) setFoundUser((prev: any) => ({ ...prev, montoACongelar: sum.toFixed(2) }));
                          }}
                          className="text-[11px] text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
                          title="Igualar a la suma de las cuotas"
                        >
                          Auto-sumar
                        </button>
                      </div>
                    </div>
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
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
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
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-between items-center">
              {viewCuotasModal.convenio?.estado !== 'Anulado' ? (
                <button
                  type="button"
                  onClick={() => handleDesactivarConvenio(viewCuotasModal.convenio)}
                  className="px-4 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Ban size={14} /> Desactivar Convenio
                </button>
              ) : (
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded border border-red-200">
                  Convenio Anulado
                </span>
              )}
              <button 
                onClick={() => setViewCuotasModal({isOpen: false, convenio: null})}
                className="px-6 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded shadow-sm cursor-pointer"
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
