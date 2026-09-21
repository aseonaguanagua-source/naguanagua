'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Clock, CheckSquare, FileSpreadsheet, Play, Mail, Loader2, Info } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { exportToExcelWithLogos } from '@/lib/excelExport';

export default function PorFacturarPage() {
  const { inmuebles, tcmmv, addAuditLog, setFacturas, recibos } = useAppContext();
  
  const [localPreLiquidaciones, setLocalPreLiquidaciones] = useState<any[]>([]);
  const [isPreGenerado, setIsPreGenerado] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerando, setIsGenerando] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Fecha próxima recibo (último día del mes actual o +30 días)
  const today = new Date();
  const emisionStr = today.toISOString().split('T')[0];
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Ultimo dia del mes
  const vencimientoStr = nextMonth.toISOString().split('T')[0];

  const handlePreGenerar = () => {
    setIsLoading(true);
    setMessage(null);
    
    setTimeout(() => {
      // Filtrar inmuebles y condominios válidos
      const validos = (inmuebles || []).filter(inv => {
        const cant = parseInt(inv.cant_inmuebles || '0', 10);
        const mmv = parseFloat(inv.mmv_mes || '0');
        return inv.identidad && cant > 0 && mmv > 0 && inv.estado !== 'Inactivo';
      });

      const proyecciones = validos.map((inv, index) => {
        const cant = parseInt(inv.cant_inmuebles || '0', 10);
        const mmv = parseFloat(inv.mmv_mes || '0');
        const montoBase = cant * mmv * tcmmv;

        return {
          id_temp: `pre_${index}`,
          referencia: `RECIB-${Math.floor(Math.random() * 1000000)}`,
          identidad: inv.identidad,
          contribuyente: inv.contribuyente || inv.nombre || 'Desconocido',
          concepto: 'Mensualidad Aseo Urbano (Auto)',
          monto: montoBase.toFixed(2),
          emision: emisionStr,
          vencimiento: vencimientoStr,
          estado: 'Pendiente'
        };
      });

      setLocalPreLiquidaciones(proyecciones);
      setIsPreGenerado(true);
      setIsLoading(false);
      setMessage({ type: 'success', text: `Se pre-cargaron ${proyecciones.length} recibos con tasa BCV: ${tcmmv.toFixed(4)}` });
    }, 1000);
  };

  const handleExportExcel = async () => {
    if (localPreLiquidaciones.length === 0) {
      setMessage({ type: 'error', text: 'No hay datos para exportar. Haz clic en "Pre-generar" primero.' });
      return;
    }

    try {
      const data = localPreLiquidaciones.map(f => ({
        "Referencia": f.referencia,
        "RIF/Cédula": f.identidad,
        "Contribuyente": f.contribuyente,
        "Concepto": f.concepto,
        "Monto (Bs)": f.monto,
        "Fecha Emisión": f.emision,
        "Fecha Vencimiento": f.vencimiento
      }));

      await exportToExcelWithLogos(data, `Proyeccion_Facturacion_${emisionStr}.xlsx`, "Facturas_Proyectadas");
    } catch (e) {
      setMessage({ type: 'error', text: 'Error exportando a Excel.' });
    }
  };

  const handleGenerarMasiva = async () => {
    if (localPreLiquidaciones.length === 0) return;
    
    // Check if these were already generated this month to avoid duplicates
    // We do a simple check on the first few items
    const sample = localPreLiquidaciones[0];
    const exists = (recibos || []).some(f => f.identidad === sample.identidad && f.emision.substring(0,7) === emisionStr.substring(0,7) && f.estado !== 'Anulado');
    if (exists) {
      if(!confirm("Advertencia: Pareciera que ya se generaron recibos para este mes. ¿Desea continuar y generar de nuevo?")) {
        return;
      }
    }

    setIsGenerando(true);
    setMessage({ type: 'success', text: 'Enviando recibos a base de datos y preparando correos... Esto puede tardar unos segundos.' });

    try {
      const response = await fetch('/api/admin/facturacion-masiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recibos: localPreLiquidaciones })
      });

      const resData = await response.json();

      if (response.ok) {
        // Añadir a recibos locales para actualizar UI
        setFacturas(prev => [...localPreLiquidaciones, ...prev]);
        await addAuditLog('FACTURACION_MASIVA', `Se generaron masivamente ${localPreLiquidaciones.length} recibos por un monto total de Bs. ${localPreLiquidaciones.reduce((a,b)=>a+parseFloat(b.monto),0).toFixed(2)}`);
        
        setMessage({ type: 'success', text: `¡Emisión de recibos Masiva completada! Se guardaron ${localPreLiquidaciones.length} recibos y los correos se están enviando.` });
        
        // Limpiar
        setLocalPreLiquidaciones([]);
        setIsPreGenerado(false);
      } else {
        setMessage({ type: 'error', text: resData.error || 'Ocurrió un error al generar las recibos masivas.' });
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Ocurrió un error de conexión al generar las recibos masivas.' });
    } finally {
      setIsGenerando(false);
    }
  };

  const columns = [
    { key: 'referencia', header: 'Referencia' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'concepto', header: 'Concepto' },
    { key: 'monto', header: 'Monto a Recibir (Bs)' },
    { key: 'vencimiento', header: 'Fecha de Corte' },
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-semibold">Proyectado</span>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Cuentas Por Recibir (Pre-liquidación)
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePreGenerar}
            disabled={isLoading || isGenerando}
            className="bg-white border border-blue-600 text-blue-700 hover:bg-blue-50 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Pre-generar Recibos
          </button>

          <button 
            onClick={handleExportExcel}
            disabled={!isPreGenerado || isGenerando}
            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </button>

          <button 
            onClick={handleGenerarMasiva}
            disabled={!isPreGenerado || isGenerando}
            className="bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isGenerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Generar Emisión de recibos y Enviar
          </button>
        </div>
      </div>
      
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <Info className="w-5 h-5" />
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3">
        <div className="bg-blue-100 p-2 rounded-full mt-0.5 text-blue-600 shrink-0">
          <Clock size={20} />
        </div>
        <div>
          <h3 className="text-blue-800 font-bold text-sm">¿Qué es este módulo?</h3>
          <p className="text-blue-700 text-xs mt-1 leading-relaxed">
            Este módulo muestra los <strong>próximos ciclos automatizados</strong> a generar para comercios y residencias. 
            Haga clic en <strong>"Pre-generar Recibos"</strong> para calcular la deuda masiva utilizando la tasa BCV actual <strong>(Bs. {tcmmv.toFixed(4)})</strong>. 
            Revise los datos en la tabla (o expórtelos a Excel), y cuando esté seguro, presione <strong>"Generar Emisión de recibos y Enviar"</strong> para emitir los recibos y notificar por correo a los contribuyentes.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {localPreLiquidaciones.length > 0 ? (
          <DataTable data={localPreLiquidaciones} columns={columns} itemsPerPage={15} />
        ) : (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <Clock className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium">No hay proyecciones generadas.</p>
            <p className="text-xs mt-1">Haga clic en "Pre-generar Recibos" para iniciar el ciclo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
