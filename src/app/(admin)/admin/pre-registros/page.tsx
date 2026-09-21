'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { useAppContext } from '@/store/AppContext';
import { List, Check, X, CheckCircle, Calculator, AlertCircle, FileSpreadsheet, Clock } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { exportToExcelWithLogos } from '@/lib/excelExport';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function PreRegistrosPage() {
  const { inmuebles, recibos, preRegistros, aprobarPreRegistro, addContribuyente, ordenanzasConfig: ordenanzaData, setPreRegistros, setInmuebles, setFacturas, addAuditLog, tcmmv } = useAppContext();
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Web' | 'Censo'>('Web');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [rowToApprove, setRowToApprove] = useState<any>(null);
  const [meses, setMeses] = useState(1);
  const [calculatedFactor, setCalculatedFactor] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchWeb, setSearchWeb] = useState('');

  const handleExportCensos = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase
        .from('pre_registros')
        .select('*')
        .ilike('origen', 'Censo - %')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No hay censos para exportar.');
        setIsExporting(false);
        return;
      }

      const excelData: any[] = [];
      data.forEach((item: any) => {
        let parentPatente = '';
        let parentCatastro = '';
        let notasStr = item.nota || '';

        const patenteMatch = notasStr.match(/Patente:\s*([^|]+)/);
        if (patenteMatch) {
          parentPatente = patenteMatch[1].trim();
          notasStr = notasStr.replace(patenteMatch[0], '').trim();
        }

        const catastroMatch = notasStr.match(/Catastro:\s*([^|]+)/);
        if (catastroMatch) {
          parentCatastro = catastroMatch[1].trim();
          notasStr = notasStr.replace(catastroMatch[0], '').trim();
        }

        notasStr = notasStr.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s*\|\s*\|\s*/g, ' | ').trim();

        if (item.is_condominio && item.locales && item.locales.length > 0) {
          item.locales.forEach((local: any) => {
            excelData.push({
              'Fecha de Registro': new Date(item.created_at).toLocaleString(),
              'Operador': item.origen?.replace('Censo - ', '') || '',
              'Identificación (Cédula/RIF)': local.documentoIdentidad || item.identidad,
              'Nombre / Razón Social': local.nombreContribuyente || item.contribuyente,
              'Teléfono / Registro': item.registro,
              'Pertenece a Condominio': `Sí - ${item.contribuyente}`,
              'Inmueble / Identificador': local.numeracion || 'N/A',
              'Clasificación': local.uso === 'Residencial' ? 'Residencial' : 'Comercial/Industrial',
              'Actividad / Tipo Residencia': local.uso === 'Residencial' ? local.tipoResidencia : local.actividad || 'Sin especificar',
              'Código / Metraje': local.uso === 'Residencial' ? local.tipoResidencia : local.nivel,
              'Estatus Inmueble': local.estatus || 'N/A',
              'Fecha de Inicio de Actividad': item.fecha_inicio,
              'Domicilio Fiscal': item.domicilio_fiscal,
              'Dirección Exacta (Mapa)': item.direccion_exacta,
              'Coordenadas (Lat, Lng)': item.coordenadas ? `${item.coordenadas.lat}, ${item.coordenadas.lng}` : '',
              'Ficha Catastral': local.catastro || parentCatastro || '',
              'Número de Patente': local.patente || parentPatente || '',
              'Notas': notasStr
            });
          });
        } else {
          excelData.push({
            'Fecha de Registro': new Date(item.created_at).toLocaleString(),
            'Operador': item.origen?.replace('Censo - ', '') || '',
            'Identificación (Cédula/RIF)': item.identidad,
            'Nombre / Razón Social': item.contribuyente,
            'Teléfono / Registro': item.registro,
            'Pertenece a Condominio': 'No',
            'Inmueble / Identificador': 'Principal',
            'Clasificación': item.tipo,
            'Actividad / Tipo Residencia': item.actividad,
            'Código / Metraje': item.codigo,
            'Estatus Inmueble': 'Principal',
            'Fecha de Inicio de Actividad': item.fecha_inicio,
            'Domicilio Fiscal': item.domicilio_fiscal,
            'Dirección Exacta (Mapa)': item.direccion_exacta,
            'Coordenadas (Lat, Lng)': item.coordenadas ? `${item.coordenadas.lat}, ${item.coordenadas.lng}` : '',
            'Ficha Catastral': parentCatastro,
            'Número de Patente': parentPatente,
            'Notas': notasStr
          });
        }
      });

      const ws = exportToExcelWithLogos(excelData, `Censo_General_Unificado_${new Date().toISOString().split('T')[0]}.xlsx`, 'Todos los Censos');
    } catch (err) {
      console.error(err);
      alert('Hubo un error al exportar los datos.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWeb = () => {
    const webRegs = preRegistros.filter((r: any) => !r.origen?.startsWith('Censo'));
    const dataToExport = webRegs.map((item: any) => ({
      'Fecha Registro': new Date(item.created_at).toLocaleString('es-VE'),
      'Identidad': item.identidad,
      'Nombre / Razón Social': item.contribuyente,
      'Clasificación': item.tipo,
      'Actividad': item.actividad,
      'Metraje / Código': item.codigo || 'N/A',
      'Teléfono': item.registro || 'N/A',
      'Domicilio Fiscal': item.domicilio_fiscal || '',
      'Dirección Exacta': item.direccion_exacta || '',
      'Notas': item.nota || ''
    }));
    if (dataToExport.length === 0) return alert('No hay pre-registros web para exportar.');
    exportToExcelWithLogos(dataToExport, `PreRegistros_Web_${new Date().toISOString().split('T')[0]}.xlsx`, 'Pre-Registros Web');
  };
 
  const calculateFactor = (row: any) => {
    let factor = 0;
    if (row.tipo === 'Residencial') {
       const t = ordenanzaData.tiposResidenciales.find(x => x.label === row.actividad);
       if (t) factor = t.factor;
    } else if (row.tipo === 'Industrial') {
       const t = ordenanzaData.actividadesIndustriales.find(x => x.label === row.actividad);
       if (t) {
          const nivelIdx = ordenanzaData.nivelesMetraje.indexOf(row.codigo);
          if(nivelIdx >= 0 && t.factores.length > nivelIdx) factor = t.factores[nivelIdx];
       }
    } else {
       const t = ordenanzaData.actividadesComerciales.find(x => x.label === row.actividad);
       if (t) {
          const nivelIdx = ordenanzaData.nivelesMetraje.indexOf(row.codigo);
          if(nivelIdx >= 0 && t.factores.length > nivelIdx) factor = t.factores[nivelIdx];
       }
    }
    return factor;
  };

  // Extrae el primer numero de un string como "101 - 200 m²" → 101
  const parseAreaNumeric = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const match = String(val).match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    return parseFloat(match[1].replace(',', '.'));
  };

  const handleApproveClick = (row: any) => {
    setRowToApprove(row);
    setCalculatedFactor(calculateFactor(row));
    
    let defaultMeses = 1;
    if (row.origen === 'Censo' && row.fecha_inicio) {
      const start = new Date(row.fecha_inicio);
      const now = new Date();
      let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
      if (now.getDate() < start.getDate()) {
        months--; // Aún no ha pasado el mismo día del mes actual
      }
      if (months < 0) months = 0;
      defaultMeses = months;
    }
    
    setMeses(defaultMeses);
    setIsModalOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!rowToApprove) return;
    setIsProcessing(true);
    try {
      const deudaMMV = calculatedFactor * meses;
      const codCont = `N-${Math.floor(Math.random() * 100000)}`;

      // 1. Insert into inmuebles (one or multiple)
      const baseInmuebleData = {
        identidad: rowToApprove.identidad,
        contribuyente: rowToApprove.contribuyente,
        telefono: rowToApprove.registro || '',
        correo_electronico: '',
        // Combinar dirección y dirección exacta igual que AppContext
        direccion: rowToApprove.direccion_exacta
          ? `${rowToApprove.domicilio_fiscal || rowToApprove.direccion || ''} | Exacta: ${rowToApprove.direccion_exacta}`
          : (rowToApprove.domicilio_fiscal || rowToApprove.direccion || ''),
        cod_cont: `N-${Math.floor(Math.random() * 100000)}`,
        clasificacion: rowToApprove.tipo,
        actividad_principal: rowToApprove.actividad,
        inmueble: 'Principal',
        deuda_mmv: deudaMMV,
        deuda_congelada_bs: 0,
        cant_inmuebles: rowToApprove.cantidad_inmuebles || 0
      };

      let recordsToInsert = [];
      let mainInmueble = null;

      if (rowToApprove.is_condominio && rowToApprove.locales?.length > 0) {
        recordsToInsert = rowToApprove.locales.map((local: any) => ({
          ...baseInmuebleData,
          inmueble: local.numeracion,
          actividad_principal: local.uso === 'Comercial' ? local.actividad : local.uso,
          tipo: local.uso === 'Residencial' ? local.tipoResidencia : 'Inmueble',
          area: local.uso === 'Comercial' ? parseAreaNumeric(local.nivel) : null,
          mmv_mes: 0 // Will be recalculated in general or mapped later if needed
        }));
      } else {
        recordsToInsert = [{
          ...baseInmuebleData,
          tipo: rowToApprove.tipo === 'Residencial' ? rowToApprove.codigo : 'Inmueble',
          // codigo puede ser "101 - 200 m²" para comercial, extraer numero
          area: rowToApprove.tipo !== 'Residencial' ? parseAreaNumeric(rowToApprove.codigo) : null
        }];
      }

      const { data: newInmuebles, error: err1 } = await supabase.from('inmuebles').insert(recordsToInsert).select();
      if (err1) throw err1;
      
      mainInmueble = newInmuebles?.[0];

      // 2. Generate Recibo if debt > 0
      if (deudaMMV > 0) {
        const facturaData = {
          referencia: `RECIB-${Math.floor(Math.random() * 1000000)}`,
          identidad: rowToApprove.identidad,
          contribuyente: rowToApprove.contribuyente,
          monto: (deudaMMV * (tcmmv || 1)).toFixed(2), // We store in Bs for the recibo
          emision: new Date().toISOString().split('T')[0],
          vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          estado: 'Pendiente'
        };
        const { data: newFactura, error: err2 } = await supabase.from('facturas').insert([facturaData]).select().single();
        if (err2) throw err2;
        if (newFactura) setFacturas([newFactura, ...recibos]);
      }

      // 3. Delete from pre_registros
      const { error: err3 } = await supabase.from('pre_registros').delete().eq('id', rowToApprove.id);
      if (err3) throw err3;

      // Update state
      if (newInmuebles) {
        setInmuebles([...newInmuebles, ...inmuebles]);
      }
      setPreRegistros(preRegistros.filter((r: any) => r.id !== rowToApprove.id));
      await addAuditLog('APROBAR_PREREGISTRO', `Aprobado con deuda inicial de ${deudaMMV} MMV para ${rowToApprove.identidad}`);

      setShowSuccess(`Contribuyente ${rowToApprove.contribuyente} aprobado y deuda inicial asignada.`);
      setTimeout(() => setShowSuccess(null), 4000);
      setIsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      alert('Error al aprobar: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (row: any) => {
    if (confirm('¿Está seguro de rechazar y eliminar esta solicitud?')) {
      await supabase.from('pre_registros').delete().eq('id', row.id);
      setPreRegistros(preRegistros.filter((r: any) => r.id !== row.id));
      setShowSuccess(`El pre-registro ha sido rechazado.`);
      setTimeout(() => setShowSuccess(null), 3000);
    }
  };

  const columns = [
    { key: 'id', header: 'Ítem' },
    { key: 'identidad', header: 'Identidad' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'tipo', header: 'Clasificación' },
    { key: 'actividad', header: 'Actividad P.' },
    { key: 'codigo', header: 'Metraje' },
    ...(activeTab === 'Web' ? [{
      key: 'documentos',
      header: 'Docs',
      render: (row: any) => {
        const docs = [
          { key: 'rif_doc', label: 'RIF' },
          { key: 'cedula_doc', label: 'CI' },
          { key: 'patente_doc', label: 'Pat.' }
        ].filter(d => row[d.key]);
        return docs.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {docs.map(d => (
              <a key={d.key} href={row[d.key]} target="_blank" rel="noopener noreferrer"
                className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded border border-blue-200 hover:bg-blue-200 transition-colors"
                title={`Ver ${d.label}`}
              >
                {d.label}
              </a>
            ))}
          </div>
        ) : <span className="text-[10px] text-slate-400">Sin docs</span>;
      }
    }] : []),
    ...(activeTab === 'Censo' ? [
      { key: 'fecha_inicio', header: 'Fecha Inicio Actividad' },
      { key: 'operador', header: 'Operador', render: (row: any) => {
          if (row.origen?.startsWith('Censo - ')) {
            return <span className="px-2 py-1 bg-orange-100 text-orange-800 font-bold text-xs rounded">{row.origen.replace('Censo - ', '')}</span>;
          }
          return <span className="px-2 py-1 bg-slate-100 text-slate-600 font-bold text-xs rounded">Admin</span>;
      }}
    ] : []),
    {
      key: 'acciones',
      header: 'Acciones',
      render: (row: any) => (
        <div className="flex gap-2">
          <button onClick={() => {
            setRowToApprove(row);
            setIsDetailsModalOpen(true);
          }} className="bg-blue-50 text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors" title="Ver Detalles">
            <FileSpreadsheet className="w-4 h-4" />
          </button>
          <button onClick={() => handleApproveClick(row)} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-1.5 rounded transition-colors" title="Aprobar y Asignar Deuda">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => handleReject(row)} className="bg-red-50 text-red-600 hover:bg-red-100 p-1.5 rounded transition-colors" title="Rechazar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6 relative">
      {/* Header */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <List className="w-5 h-5 text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
          Listados Generales
        </h1>
      </div>

      {showSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative flex items-center gap-2 shadow-sm" role="alert">
          <CheckCircle className="w-5 h-5" />
          <span className="block sm:inline">{showSuccess}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="flex bg-slate-100 p-2 rounded text-sm text-slate-700 font-medium">
          <button
            onClick={() => setActiveTab('Web')}
            className={`px-4 py-2 rounded flex items-center gap-2 transition-colors ${activeTab === 'Web' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'hover:bg-slate-200'}`}
          >
            <Check className={`w-4 h-4 ${activeTab === 'Web' ? 'text-green-500' : ''}`} />
            Pre-registros WEB ({preRegistros.filter((r: any) => !r.origen?.startsWith('Censo')).length})
          </button>
          <button
            onClick={() => setActiveTab('Censo')}
            className={`px-4 py-2 rounded flex items-center gap-2 transition-colors ${activeTab === 'Censo' ? 'bg-white shadow-sm border border-slate-200 text-slate-800' : 'hover:bg-slate-200'}`}
          >
            <Check className={`w-4 h-4 ${activeTab === 'Censo' ? 'text-green-500' : ''}`} />
            Censo Trabajadores ({preRegistros.filter((r: any) => r.origen?.startsWith('Censo')).length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre, identidad..."
            value={searchWeb}
            onChange={e => setSearchWeb(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-64"
          />
          {activeTab === 'Web' && (
            <button
              onClick={handleExportWeb}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow transition-colors text-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Web
            </button>
          )}
          {activeTab === 'Censo' && (
            <button 
              onClick={handleExportCensos}
              disabled={isExporting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow transition-colors disabled:opacity-50 text-sm"
            >
              {isExporting ? <Clock className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <span>Exportar Censos</span>
            </button>
          )}
        </div>
      </div>

      <DataTable 
        data={preRegistros
          .filter((r: any) => activeTab === 'Censo' ? (r.origen && r.origen.startsWith('Censo')) : (!r.origen || !r.origen.startsWith('Censo')))
          .filter((r: any) => {
            if (!searchWeb.trim()) return true;
            const q = searchWeb.toLowerCase();
            return (
              (r.identidad || '').toLowerCase().includes(q) ||
              (r.contribuyente || '').toLowerCase().includes(q) ||
              (r.actividad || '').toLowerCase().includes(q) ||
              (r.tipo || '').toLowerCase().includes(q)
            );
          })
        } 
        columns={columns} 
        itemsPerPage={10} 
      />

      {/* MODAL DE APROBACION Y DEUDA */}
      {isModalOpen && rowToApprove && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="bg-slate-800 p-4 flex items-center justify-between">
              <h2 className="text-white font-bold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                Aprobar y Calcular Deuda Inicial
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
                <p className="text-sm"><span className="font-semibold text-slate-700">Contribuyente:</span> {rowToApprove.contribuyente} ({rowToApprove.identidad})</p>
                <p className="text-sm"><span className="font-semibold text-slate-700">Clasificación:</span> {rowToApprove.tipo}</p>
                <p className="text-sm"><span className="font-semibold text-slate-700">Actividad:</span> {rowToApprove.actividad}</p>
                <p className="text-sm"><span className="font-semibold text-slate-700">Nivel/Metraje:</span> {rowToApprove.codigo}</p>
                {rowToApprove.origen?.startsWith('Censo') && rowToApprove.fecha_inicio && (
                  <p className="text-sm text-orange-700 bg-orange-100 p-1.5 rounded inline-block"><span className="font-semibold">Inicio Actividad:</span> {rowToApprove.fecha_inicio}</p>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center bg-blue-50 p-3 rounded border border-blue-100">
                  <span className="text-sm font-semibold text-blue-800">Tarifa Mensual (MMV):</span>
                  <span className="font-bold text-blue-900 text-lg">{calculatedFactor.toFixed(2)}</span>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Meses a adeudar (Morosidad Inicial)</label>
                  <input 
                    type="number" 
                    min="0"
                    value={meses} 
                    onChange={(e) => setMeses(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-lg px-4 py-2 font-semibold text-slate-700 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-lg border border-emerald-200 shadow-inner">
                  <span className="font-bold text-emerald-800">Deuda Total Inicial:</span>
                  <div className="text-right">
                    <span className="block font-black text-emerald-600 text-2xl">{(calculatedFactor * meses).toFixed(2)} MMV</span>
                    <span className="block text-xs font-semibold text-emerald-700 mt-1">≈ Bs. {(calculatedFactor * meses * (tcmmv || 1)).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-amber-50 p-3 rounded border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed font-medium">
                  Al confirmar, este registro será movido a la tabla de Inmuebles/Contribuyentes y se le generará una recibo inicial por el monto reflejado arriba.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmApproval}
                  disabled={isProcessing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 flex justify-center"
                >
                  {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirmar Aprobación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE DETALLES */}
      {isDetailsModalOpen && rowToApprove && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="bg-slate-800 p-4 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-white font-bold flex items-center gap-2">
                <List className="w-5 h-5 text-blue-400" />
                Detalles del Pre-Registro
              </h2>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identidad (CI/RIF)</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.identidad}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre / Razón Social</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.contribuyente}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clasificación</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.tipo}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actividad Principal</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.actividad}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nivel / Metraje</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.codigo}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Teléfono / Registro</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.registro}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Domicilio Fiscal</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.domicilio_fiscal}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dirección Exacta</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.direccion_exacta}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notas u Observaciones</span>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{rowToApprove.nota || 'Ninguna'}</p>
                </div>
                
                {rowToApprove.is_condominio && rowToApprove.locales && rowToApprove.locales.length > 0 && (
                  <div className="col-span-2 space-y-2 mt-4">
                    <span className="text-sm font-bold text-slate-700">Sub-Unidades Registradas ({rowToApprove.locales.length}):</span>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-2">
                       <ul className="space-y-2 text-sm text-slate-600">
                         {rowToApprove.locales.map((local: any, idx: number) => (
                           <li key={idx} className="border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                             <strong>{local.numeracion}</strong> - {local.uso} ({local.tipoResidencia || local.actividad}) - Ficha: {local.catastro || 'N/A'}
                           </li>
                         ))}
                       </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleReject(rowToApprove);
                  }}
                  className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold py-2.5 rounded-lg transition-colors"
                >
                  Rechazar
                </button>
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleApproveClick(rowToApprove);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm flex justify-center"
                >
                  Aprobar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
