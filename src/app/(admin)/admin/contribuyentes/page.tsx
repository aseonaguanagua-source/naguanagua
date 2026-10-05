'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/DataTable';
import { useAppContext } from '@/store/AppContext';
import { Users, Save, ArrowLeft, Plus, Building, Building2, Store, Home as HomeIcon, MapPin, Edit, DollarSign, Handshake, Eye, X, CheckCircle, Calculator, AlertCircle, AlertTriangle, Download, FileText, Trash2, Power, RefreshCw, Search, Percent } from 'lucide-react';
import { generarSolvenciaPDF } from '@/lib/pdfGenerator';
import { ordenanzaData } from '@/data/ordenanza';
import Select from 'react-select';
import dynamic from 'next/dynamic';
import { UnidadesModal } from '@/components/UnidadesModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';

const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...ordenanzaData.actividadesIndustriales];

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });
import { DebtAdjustmentModal } from '@/components/DebtAdjustmentModal';
import { EliminarMultaModal } from '@/components/EliminarMultaModal';

import { logos } from '@/lib/logosBase64';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { supabase } from '@/lib/supabase';
import economicActivitiesBase from '@/lib/economicActivitiesBase.json';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, getFO, getFAR, isResidencialInm } from '@/lib/calculos';
import { isSameLocal, getShortAddress } from '@/lib/cajaHelpers';


function ContribuyentesPageContent() {
  const { inmuebles, contribuyentes, recibos, setFacturas, convenios, updateContribuyente, addContribuyente, addAuditLog, tcmmv, addCertificado, auditLogs, refreshData } = useAppContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);
  const [selectedSolvenciaInmueble, setSelectedSolvenciaInmueble] = useState<string>('');
  const [viewCalculo, setViewCalculo] = useState<any>(null);
  const [viewFacturasCM, setViewFacturasCM] = useState<any[]>([]);
  const [viewFacturasDb, setViewFacturasDb] = useState<any[]>([]); // recibos frescas desde Supabase
  const [selectedCondominioModal, setSelectedCondominioModal] = useState<{ id: number | string, nombre: string, identidad: string, codigoPadre?: string } | null>(null);
  const [viewServiciosEsp, setViewServiciosEsp] = useState<any[]>([]);
  const [viewPagos, setViewPagos] = useState<any[]>([]);

  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [selectedDebtRow, setSelectedDebtRow] = useState<any>(null);
  const [exonerarModalOpen, setExonerarModalOpen] = useState(false);
  const [selectedExonerarRow, setSelectedExonerarRow] = useState<any>(null);
  
  // Calculadora state
  const [bcvRate, setBcvRate] = useState<string | null>(null);
  const [bcvDate, setBcvDate] = useState<string>('');
  const [showCalculation, setShowCalculation] = useState(false);
  const [calculoDetalle, setCalculoDetalle] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Action Modal State
  const [actionModal, setActionModal] = useState<{type: 'Anular'|'Reversar', recibo: any} | null>(null);
  const [actionNota, setActionNota] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Modal Ajuste Deuda
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [debtMonths, setDebtMonths] = useState(1);
  const [isProcessingDebt, setIsProcessingDebt] = useState(false);
  const [customDebtBcvRate, setCustomDebtBcvRate] = useState<string>('');

  // Status Modal (Eliminar/Desactivar)
  const [statusModal, setStatusModal] = useState<{type: 'Eliminar'|'Desactivar', row: any} | null>(null);
  const [statusNota, setStatusNota] = useState('');
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<'Activos' | 'Inactivos'>('Activos');
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [serverResults, setServerResults] = useState<any[]>([]);
  const [isShowingServerResults, setIsShowingServerResults] = useState(false);
  const [showWithNotes, setShowWithNotes] = useState(false);
  const [groupCondoChildren, setGroupCondoChildren] = useState(true);
  const [filteredContribuyentes, setFilteredContribuyentes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncBD = async () => {
    try {
      setIsSyncing(true);
      await refreshData(true);
    } catch (err) {
      console.error('Error sincronizando BD:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Documentos / Expediente digitalizado
  const [uploadDocs, setUploadDocs] = useState<{
    cedula: { url: string; uploading: boolean; name: string };
    ficha: { url: string; uploading: boolean; name: string };
    registro: { url: string; uploading: boolean; name: string };
  }>({
    cedula:   { url: '', uploading: false, name: '' },
    ficha:    { url: '', uploading: false, name: '' },
    registro: { url: '', uploading: false, name: '' },
  });

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'cedula' | 'ficha' | 'registro') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxMB = 10;
    if (file.size > maxMB * 1024 * 1024) {
      alert(`El archivo supera los ${maxMB} MB permitidos.`);
      return;
    }
    setUploadDocs(prev => ({ ...prev, [tipo]: { ...prev[tipo], uploading: true, name: file.name } }));
    try {
      const identidad = formData?.Identidad || 'sin_id';
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `expedientes/${identidad.replace(/[^a-zA-Z0-9]/g,'_')}/${tipo}_${Date.now()}.${ext}`;

      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('bucket', 'documentos');
      uploadData.append('path', path);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Error al subir archivo');
      }

      const publicUrl = resData.publicUrl || '';
      setUploadDocs(prev => ({ ...prev, [tipo]: { url: publicUrl, uploading: false, name: file.name } }));
      // Guardar URL de documento en observaciones del contribuyente de forma segura
      if (identidad && identidad !== 'sin_id') {
        try {
          const { data: c } = await supabase.from('contribuyentes').select('observaciones').eq('identidad', identidad).maybeSingle();
          const obsActual = c?.observaciones || '';
          const docNote = `[DOC_${tipo.toUpperCase()}: ${publicUrl}]`;
          if (!obsActual.includes(publicUrl)) {
            await supabase.from('contribuyentes').update({
              observaciones: obsActual ? `${obsActual}\n${docNote}` : docNote
            }).eq('identidad', identidad);
          }
        } catch (eDoc) {
          console.warn('No se pudo guardar URL en observaciones:', eDoc);
        }
      }
    } catch (err: any) {
      console.error('Error al subir documento:', err);
      alert('Error al subir archivo: ' + (err.message || err));
      setUploadDocs(prev => ({ ...prev, [tipo]: { ...prev[tipo], uploading: false } }));
    }
    e.target.value = '';
  };

  const searchParams = useSearchParams();

  useEffect(() => {
    let result = isShowingServerResults ? serverResults : contribuyentes;
    if (activeTab === 'Activos') {
      result = result.filter((c: any) => c.Estado !== 'Eliminado' && c.Estado !== 'Inactivo');
    } else {
      result = result.filter((c: any) => c.Estado === 'Eliminado' || c.Estado === 'Inactivo');
    }
    
    if (showWithNotes) {
      result = result.filter((c: any) => c.Observaciones && c.Observaciones.trim().length > 0);
    }
    
    // Si está activa la agrupación, ocultar los locales hijos independientes para no saturar la tabla
    if (groupCondoChildren && !isShowingServerResults) {
      result = result.filter((c: any) => !c.isCondoChild);
    }

    setFilteredContribuyentes(result);
  }, [activeTab, contribuyentes, showWithNotes, isShowingServerResults, serverResults, groupCondoChildren]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      handleAdd();
    }
  }, [searchParams]);

  const handleActionSubmit = async () => {
    if (!actionModal) return;
    if (!actionNota.trim()) return alert("Debe ingresar el motivo obligatoriamente.");
    
    setIsProcessingAction(true);
    try {
      const nuevoEstado = actionModal.type === 'Anular' ? 'Anulado' : 'Reversado';

      const cajeroUser = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || 'Administrador';
      // Solo actualizar estado - recibos no tiene columna detalles ni nota
      const { error } = await supabase
        .from('facturas')
        .update({ estado: nuevoEstado })
        .eq('referencia', actionModal.recibo.referencia);
      // Registrar en auditoria via logAudit
      await logAudit(`Recibo ${actionModal.type}`, {
        referencia: actionModal.recibo.referencia,
        identidad: actionModal.recibo.contribuyente,
        monto: actionModal.recibo.monto,
        estado_nuevo: nuevoEstado,
        motivo: actionNota.trim(),
        cajero: cajeroUser,
      }, 'RECIBO');
      if (actionModal.type === 'Reversar') {
        const montoPagado = parseFloat((actionModal.recibo.monto || '0').toString().replace(/[^\d.]/g, ''));
        if (montoPagado > 0) {
          const { data: inmuebleData } = await supabase
            .from('inmuebles')
            .select('id, saldo_favor_bs')
            .eq('identidad', actionModal.recibo.contribuyente)
            .limit(1)
            .single();
          if (inmuebleData) {
            const nuevoSaldo = parseFloat(inmuebleData.saldo_favor_bs || '0') + montoPagado;
            await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoSaldo }).eq('id', inmuebleData.id);
          }
        }
      }
      
      // Update local state
      setFacturas((prev: any) => prev.map((f: any) => f.referencia === actionModal.recibo.referencia ? { ...f, estado: nuevoEstado } : f));
      
      setActionModal(null);
      setActionNota('');
      alert(`Recibo ${actionModal.recibo.referencia} ha sido ${nuevoEstado.toLowerCase()} exitosamente.${actionModal.type === 'Reversar' ? ' El monto fue acreditado como Saldo a Favor.' : ''}`);
    } catch (e: any) {
      alert("Error procesando acción: " + e.message);
    }
    setIsProcessingAction(false);
  };

  const handleDelete = (row: any) => {
    setStatusModal({ type: 'Eliminar', row });
  };

  const handleDeactivate = (row: any) => {
    setStatusModal({ type: 'Desactivar', row });
  };

  const handleStatusSubmit = async () => {
    if (!statusModal || !statusNota.trim()) {
      alert("Debe ingresar el motivo obligatoriamente.");
      return;
    }
    setIsProcessingStatus(true);
    try {
      const { type, row } = statusModal;
      const nuevoEstado = type === 'Eliminar' ? 'Eliminado' : 'Inactivo';
      
      const { error } = await supabase.from('inmuebles').update({ estado: nuevoEstado }).eq('identidad', row.Identidad);
      if (error) throw error;
      
      await addAuditLog(
        type === 'Eliminar' ? 'ELIMINAR_CONTRIBUYENTE' : 'DESACTIVAR_CONTRIBUYENTE',
        JSON.stringify({
          identidad: row.Identidad,
          contribuyente: row.Contribuyente,
          motivo: statusNota.trim()
        })
      );
      
      alert(`Contribuyente ${type === 'Eliminar' ? 'eliminado' : 'desactivado'} exitosamente.`);
      await refreshData();
    } catch (err: any) {
      alert(`Error procesando acción: ${err.message}`);
    } finally {
      setIsProcessingStatus(false);
    }
  };

  const calculateFactorForRow = async (row: any) => {
    try {
      const res = await fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      
      let factorTotal = 0;
      let totalMensualCalculado = 0;
      let leyenda = '';
      let farAplicado = 0;
      let esResidencialTotal = true;
      const desgloseLocales: any[] = [];

      const idClean = (row.Identidad || '').replace(/-/g, '').toUpperCase();
      const misInmuebles = inmuebles.filter((i: any) => 
        (i.identidad || '').replace(/-/g, '').toUpperCase() === idClean
      );

      if (misInmuebles.length > 0) {
        const isCondominio = misInmuebles.some((i: any) => (parseInt(i.cant_inmuebles) || 1) > 1);
        leyenda = isCondominio ? `Condominio / Complejo Residencial` : misInmuebles.map((i: any) => i.actividad_principal || 'Residencial').join(', ');
        
        misInmuebles.forEach((inm: any) => {
          const esRes = isResidencialInm(inm);
          if (!esRes) esResidencialTotal = false;

          const localFactor = (inm.mmv_mes && parseFloat(inm.mmv_mes) > 0)
            ? parseFloat(inm.mmv_mes)
            : getFO(inm.actividad_principal || '', esRes);
          const cant = parseInt(inm.cant_inmuebles) || 1;
          const far = esRes ? getFAR(inm.actividad_principal || '') : 0.1280;
          farAplicado = far;

          factorTotal += (localFactor * cant);

          // Tarifa mensual oficial según Ordenanza
          const montoTotalInm = calcularMensualidad(inm, data.tcmmv);
          const montoUnidad = montoTotalInm / Math.max(1, cant);
          const ivaInm = esRes ? 0 : (montoTotalInm * 0.16);
          totalMensualCalculado += (montoTotalInm + ivaInm);

          const getLocalLabelUnit = (targetInm: any, defaultText: string) => {
            if (targetInm?.numero_unidad) return `Local ${targetInm.numero_unidad}`;
            if (targetInm?.unidad) return `Local ${targetInm.unidad}`;
            if (targetInm?.local) return `Local ${targetInm.local}`;
            const dir = targetInm?.direccion || '';
            const startMatch = dir.match(/^\s*(?:[0-9]+\s+)+([A-Za-z0-9\-]+)/);
            if (startMatch && startMatch[1].length <= 12) return `Local ${startMatch[1].toUpperCase()}`;
            const match = dir.match(/(?:LOCAL\s*(?:COMERCIAL\s*)?(?:NRO\.?\s*)?([A-Za-z0-9\-]+)|([A-Z]\-[0-9]+))/i);
            if (match) return `Local ${(match[1] || match[2]).toUpperCase()}`;
            return defaultText;
          };

          if (cant > 1) {
            for(let i=1; i<=cant; i++) {
              const baseU = montoUnidad;
              const ivaU = esRes ? 0 : (baseU * 0.16);
              desgloseLocales.push({
                numeracion: getLocalLabelUnit(inm, `${inm.inmueble || 'Inmueble'} - Unidad ${i}`),
                inmueble: inm.inmueble,
                leyenda: inm.actividad_principal || (esRes ? 'Residencial' : 'Comercial'),
                factor: localFactor,
                baseBs: (Math.trunc(baseU * 100) / 100).toFixed(2),
                ivaBs: (Math.trunc(ivaU * 100) / 100).toFixed(2),
                esRes,
                montoBs: (Math.trunc((baseU + ivaU) * 100) / 100).toFixed(2)
              });
            }
          } else {
            const baseU = montoTotalInm;
            const ivaU = esRes ? 0 : (baseU * 0.16);
            desgloseLocales.push({
              numeracion: getLocalLabelUnit(inm, inm.inmueble || 'Inmueble/Local'),
              inmueble: inm.inmueble,
              leyenda: inm.actividad_principal || (esRes ? 'Residencial' : 'Comercial'),
              factor: localFactor,
              baseBs: (Math.trunc(baseU * 100) / 100).toFixed(2),
              ivaBs: (Math.trunc(ivaU * 100) / 100).toFixed(2),
              esRes,
              montoBs: (Math.trunc((baseU + ivaU) * 100) / 100).toFixed(2)
            });
          }
        });
      } else {
        const rowClasificacion = row.Clasificacion || row.tipo || 'Residencial';
        const rowTipoResidencia = row.TipoResidencia || row.Actividad || row.actividad || '';
        const esRes = isResidencialInm({ tipo: rowClasificacion, actividad_principal: rowTipoResidencia });
        esResidencialTotal = esRes;
        const fo = getFO(rowTipoResidencia, esRes);
        const far = esRes ? getFAR(rowTipoResidencia) : 0.1280;
        farAplicado = far;
        factorTotal = fo;
        leyenda = rowTipoResidencia || (esRes ? 'Residencial' : 'Comercial');
        const base = calcularMensualidad({ tipo: rowClasificacion, actividad_principal: rowTipoResidencia, mmv_mes: fo }, data.tcmmv);
        const iva = esRes ? 0 : (base * 0.16);
        totalMensualCalculado = base + iva;
        desgloseLocales.push({
          numeracion: 'Inmueble/Local',
          leyenda: leyenda,
          factor: fo,
          montoBs: totalMensualCalculado.toFixed(2)
        });
      }

      const totalTruncado = (Math.trunc(totalMensualCalculado * 100) / 100).toFixed(2);
      const formulaStr = esResidencialTotal
        ? `${factorTotal.toFixed(2)} × 57 × ${farAplicado} × ${Number(data.tcmmv).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:4})} Bs (Exento de IVA)`
        : `${factorTotal.toFixed(2)} × 57 × 0.1280 × ${Number(data.tcmmv).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:4})} Bs (+ 16% IVA)`;

      return {
        factor: factorTotal,
        far: farAplicado,
        esResidencial: esResidencialTotal,
        formulaTexto: formulaStr,
        leyenda,
        totalBs: totalTruncado,
        fuente: data.source,
        tasaBcv: data.tcmmv,
        desglose: desgloseLocales
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  useEffect(() => {
    if (isViewModalOpen && viewData) {
      calculateFactorForRow(viewData).then(detalle => {
        if (detalle) setViewCalculo(detalle);
      });
      // Load ALL servicios especiales for this contributor (pending AND paid)
      const idLimpio = (viewData.Identidad || '').replace(/-/g, '').toUpperCase();
      const idFmt = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
      supabase
        .from('servicios_especiales')
        .select('*')
        .or(`identidad.eq.${viewData.Identidad},identidad.eq.${idLimpio},identidad.eq.${idFmt}`)
        .order('fecha', { ascending: false })
        .then(({ data }) => setViewServiciosEsp(data || []));
      // Load pagos_reportados para historial de pagos
      supabase
        .from('pagos_reportados')
        .select('*')
        .or(`identidad.eq.${viewData.Identidad},identidad.eq.${(viewData.Identidad || '').replace(/-/g, '')}`)
        .order('created_at', { ascending: false })
        .then(({ data }) => setViewPagos(data || []));
      // Cargar recibos frescas desde Supabase (evitar discrepancias con el contexto React)
      const identidadClean = (viewData.Identidad || '').replace(/-/g, '').toUpperCase();
      supabase
        .from('facturas')
        .select('*')
        .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
        .or(`identidad.eq.${viewData.Identidad},identidad.eq.${identidadClean}`)
        .order('emision', { ascending: true })
        .then(({ data: facData }) => {
          // fallback por nombre si no hay resultados por identidad (cubre RECIB- con identidad en otro formato)
          const applyDynamicInvoices = (baseFacturas: any[]) => {
            const combined = [...baseFacturas];
            const misInmuebles = inmuebles.filter((i: any) => (i.identidad || '').replace(/-/g,'').toUpperCase() === (viewData?.Identidad || '').replace(/-/g,'').toUpperCase());
            if (combined.length === 0 && misInmuebles.length > 0) {
              const hasDeuda = misInmuebles.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
              if (hasDeuda) {
                misInmuebles.forEach((inm: any) => {
                  const deudaMMV = parseFloat(inm.deuda_mmv || '0');
                  const congelada = parseFloat(inm.deuda_congelada_bs || '0');
                  const multa = parseFloat(inm.multa_bs || '0');
                  const meses = parseInt(inm.meses_deuda || 0);
                  if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
                    const numMeses = Math.max(1, meses);
                    const now = new Date();
                    for (let i = 1; i <= numMeses; i++) {
                      const targetDate = new Date(now.getFullYear(), now.getMonth() - numMeses + i - 1, 1, 12, 0, 0);
                      const dateIso = targetDate.toISOString();
                      combined.push({
                        id: `dummy-hist-${inm.inmueble}-${i}`,
                        referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
                        identidad: viewData.Identidad,
                        contribuyente: viewData.Contribuyente,
                        emision: dateIso,
                        vencimiento: dateIso,
                        estado: 'Pendiente',
                        monto: '0'
                      });
                    }
                  }
                });
              }
            }
            setViewFacturasDb(combined);
          };

          if (!facData || facData.length === 0) {
            supabase
              .from('facturas')
              .select('*')
              .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
              .eq('contribuyente', viewData.Contribuyente)
              .order('emision', { ascending: true })
              .then(({ data: facByName }) => applyDynamicInvoices(facByName || []));
          } else {
            applyDynamicInvoices(facData || []);
          }
        });
    } else {
      setViewCalculo(null);
      setViewServiciosEsp([]);
      setViewPagos([]);
      setViewFacturasDb([]);
    }
  }, [isViewModalOpen, viewData, inmuebles]);

  const handleDeleteFactura = async (recibo: any) => {
    const isConfirmed = window.confirm(`¿Estás seguro de eliminar la deuda ${recibo.referencia}?`);
    if (!isConfirmed) return;

    // Validation: cannot delete if subsequent months are paid
    const facturasContribuyente = recibos.filter((f: any) => f.contribuyente === recibo.contribuyente);
    const facturasPagadasPosteriores = facturasContribuyente.filter((f: any) => {
      return f.estado === 'Pagado' && new Date(f.emision) > new Date(recibo.emision);
    });

    if (facturasPagadasPosteriores.length > 0) {
      alert("No se puede eliminar esta deuda porque existen meses posteriores que ya fueron pagados.");
      return;
    }

    try {
      const { error } = await supabase.from('facturas').delete().eq('id', recibo.id);
      if (error) throw error;
      
      setFacturas(recibos.filter((f: any) => f.id !== recibo.id));
      alert("Deuda eliminada exitosamente.");
    } catch (e: any) {
      alert("Error eliminando deuda: " + e.message);
    }
  };

  const loadImage = async (src: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject('No 2d context');
        }
      };
      img.onerror = reject;
      img.src = src;
    });
  };

  const imprimirEstadoDeCuenta = async () => {
    if (!viewData) return;

    const idLimpio = (viewData.Identidad || '').replace(/-/g, '').toUpperCase();

    // 1. Obtener facturas pendientes (priorizar viewFacturasDb o consultar DB)
    let deudas: any[] = [...viewFacturasDb];
    if (deudas.length === 0) {
      try {
        const identidadOriginal = (viewData.Identidad || '').trim();
        const identidadSinGuiones = idLimpio;
        let orFiltros = [`identidad.eq.${identidadOriginal}`];
        if (identidadSinGuiones !== identidadOriginal) orFiltros.push(`identidad.eq.${identidadSinGuiones}`);

        const { data: facturasDB } = await supabase
          .from('facturas')
          .select('*')
          .or(orFiltros.join(','))
          .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
          .order('emision', { ascending: true });

        if (facturasDB && facturasDB.length > 0) {
          deudas = facturasDB;
        } else {
          const { data: fallback } = await supabase
            .from('facturas')
            .select('*')
            .eq('contribuyente', viewData.Contribuyente || '')
            .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
            .order('emision', { ascending: true });
          if (fallback) deudas = fallback;
        }
      } catch (e) {
        deudas = (recibos || [])
          .filter((f: any) => {
            const fid = (f.identidad || f.contribuyente || '').replace(/-/g, '').toUpperCase();
            return fid === idLimpio || fid === viewData.Identidad || f.contribuyente === viewData.Contribuyente;
          })
          .filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Por Verificar' || f.estado === 'Abonado');
      }
    }

    // 2. Inmuebles del contribuyente
    const inmueblesContribuyente = (inmuebles || []).filter((i: any) => {
      const iid = (i.identidad || '').replace(/-/g, '').toUpperCase();
      return iid === idLimpio || iid === viewData.Identidad;
    });

    const userInms = inmueblesContribuyente.length > 0
      ? inmueblesContribuyente
      : [{ inmueble: 'Principal', tipo: 'Residencial', clasificacion: 'Individual', actividad_principal: 'CASA (ZONA A)', cant_inmuebles: 1, direccion: viewData.Direccion || '' }];

    // Si deudas sigue vacío pero los inmuebles tienen meses_deuda registrados, generar períodos
    if (deudas.length === 0) {
      const now = new Date();
      userInms.forEach((inm: any) => {
        const meses = parseInt(String(inm.meses_deuda || 0), 10);
        if (meses > 0) {
          for (let i = 1; i <= meses; i++) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() - meses + i - 1, 1, 12, 0, 0);
            deudas.push({
              id: `dummy-hist-${inm.inmueble}-${i}`,
              referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
              identidad: viewData.Identidad,
              contribuyente: viewData.Contribuyente,
              emision: targetDate.toISOString(),
              vencimiento: targetDate.toISOString(),
              estado: 'Pendiente',
              monto: '0'
            });
          }
        }
      });
    }

    deudas.sort((a: any, b: any) => new Date(a.emision || '1900-01-01').getTime() - new Date(b.emision || '1900-01-01').getTime());

    // 3. Agrupación por Inmueble / Local Físico:
    // - Inmuebles residenciales (casas/apartamentos) -> 1 cluster por inmueble (1 página cada uno)
    // - Locales comerciales con 2 o más actividades económicas -> 1 cluster unificado (1 página compartida)
    interface PropertyCluster {
      clusterId: string;
      tipo: 'COMERCIAL' | 'RESIDENCIAL' | 'INDUSTRIAL';
      label: string;
      direccion: string;
      isMultiActivity: boolean;
      inmuebles: any[];
    }

    const billable = userInms.filter((i: any) => {
      const act = (i.actividad_principal || '').trim().toUpperCase();
      return act !== 'N/A' && act !== '';
    });
    const candidates = billable.length > 0 ? billable : userInms;

    const clusters: PropertyCluster[] = [];

    for (const inm of candidates) {
      const esRes = isResidencialInm(inm);

      if (esRes) {
        clusters.push({
          clusterId: inm.inmueble || `RES-${clusters.length + 1}`,
          tipo: 'RESIDENCIAL',
          label: inm.actividad_principal || inm.clasificacion || 'Inmueble Residencial',
          direccion: inm.direccion || viewData.Direccion || 'Naguanagua, Edo. Carabobo',
          isMultiActivity: false,
          inmuebles: [inm]
        });
        continue;
      }

      // Comercial / Industrial
      const rawDir = (inm.direccion || '').trim();
      const padreId = inm.condominio_padre_id;

      const matched = clusters.find(c => {
        if (c.tipo === 'RESIDENCIAL') return false;
        if (padreId && c.inmuebles.some((ci: any) => ci.condominio_padre_id === padreId || ci.inmueble === padreId)) {
          return true;
        }
        if (rawDir && rawDir !== '0 0' && c.direccion && c.direccion !== '0 0') {
          if (rawDir.toLowerCase() === c.direccion.toLowerCase()) return true;
          return isSameLocal(rawDir, c.direccion, 0.65);
        }
        if ((!rawDir || rawDir === '0 0') && (!c.direccion || c.direccion === '0 0')) {
          return true;
        }
        return false;
      });

      if (matched) {
        matched.inmuebles.push(inm);
        matched.isMultiActivity = true;
        if ((!matched.direccion || matched.direccion === '0 0') && rawDir && rawDir !== '0 0') {
          matched.direccion = rawDir;
          matched.label = getShortAddress(rawDir);
        }
      } else {
        const label = rawDir && rawDir !== '0 0' ? getShortAddress(rawDir) : (inm.inmueble || 'Local Comercial');
        clusters.push({
          clusterId: inm.inmueble || `COM-${clusters.length + 1}`,
          tipo: (inm.tipo || 'COMERCIAL').toUpperCase().includes('IND') ? 'INDUSTRIAL' : 'COMERCIAL',
          label,
          direccion: rawDir || viewData.Direccion || 'Naguanagua, Edo. Carabobo',
          isMultiActivity: false,
          inmuebles: [inm]
        });
      }
    }

    clusters.forEach(c => {
      if (c.tipo !== 'RESIDENCIAL' && c.inmuebles.length >= 2) {
        c.isMultiActivity = true;
      }
    });

    const clustersToRender = clusters.length > 0 ? clusters : [{
      clusterId: 'Principal',
      tipo: 'RESIDENCIAL' as const,
      label: 'Inmueble Principal',
      direccion: viewData.Direccion || 'Naguanagua',
      isMultiActivity: false,
      inmuebles: userInms
    }];

    const stripNivel = (str: string): string => {
      if (!str) return '';
      return str.replace(/\s*\((ALTA|MEDIA|BAJA|RESIDENCIAL)\)/gi, '').trim();
    };

    const MESES_ABR = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const formatPeriodo = (fecha: string | Date | undefined): string => {
      if (!fecha) return 'N/A';
      const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
      if (!isNaN(d.getTime())) {
        return `${MESES_ABR[d.getMonth()]}-${d.getFullYear()}`;
      }
      const parts = String(fecha).split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10);
        return `${MESES_ABR[m - 1] || parts[1]}-${parts[0]}`;
      }
      return String(fecha);
    };

    const today = new Date();
    const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const cajero = typeof window !== 'undefined' ? (localStorage.getItem('adminUser') || 'Administrador') : 'Administrador';

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let pageCount = 0;

    for (let clusterIdx = 0; clusterIdx < clustersToRender.length; clusterIdx++) {
      const cluster = clustersToRender[clusterIdx];
      const esRes = cluster.tipo === 'RESIDENCIAL';

      // Facturas asociadas a los inmuebles de este cluster
      const clusterInmCodes = cluster.inmuebles.map((i: any) => (i.inmueble || '').toUpperCase()).filter(Boolean);
      const clusterCodConts = cluster.inmuebles.map((i: any) => (i.cod_cont || '').toUpperCase()).filter(Boolean);

      let clusterDeudas = deudas.filter((f: any) => {
        if (!f.referencia) return true;
        const ref = f.referencia.toUpperCase();
        return clusterInmCodes.some((code: string) => ref.includes(code)) ||
               clusterCodConts.some((cc: string) => ref.includes(cc));
      });

      if (clustersToRender.length === 1 && clusterDeudas.length === 0) {
        clusterDeudas = deudas;
      }

      // Desglose y cálculo individual por cada inmueble / actividad económica del cluster
      let subtotalBaseLocal = 0;
      let subtotalIvaLocal = 0;
      let subtotalMultasLocal = 0;
      let maxMesesCluster = 0;

      const clusterInmBreakdown = cluster.inmuebles.map((inm: any) => {
        const bMes = calcularMensualidad(inm, tcmmv);
        const iMes = esRes ? 0 : (bMes * 0.16);
        const mDeuda = parseInt(String(inm.meses_deuda || 0), 10);
        if (mDeuda > maxMesesCluster) maxMesesCluster = mDeuda;

        const esCasoSinMulta = (inm.inmueble === 'URB014954') ||
          (inm.notas && (inm.notas.toLowerCase().includes('sin multa') || inm.notas.toLowerCase().includes('especial') || inm.notas.toLowerCase().includes('exonerad'))) ||
          (inm.multa_bs === 0 && mDeuda > 1);

        const baseTotal = bMes * mDeuda;
        const ivaTotal = iMes * mDeuda;
        let multaTotal = 0;

        if (!esCasoSinMulta && mDeuda > 1) {
          const mesesConMultaInm = mDeuda - 1;
          const tasaMora = esRes ? 0.10 : 0.12;
          multaTotal = (bMes * tasaMora) * mesesConMultaInm;
        }

        subtotalBaseLocal += baseTotal;
        subtotalIvaLocal += ivaTotal;
        subtotalMultasLocal += multaTotal;

        return {
          inmueble: inm.inmueble,
          actividad: stripNivel(inm.actividad_principal || 'Actividad Comercial'),
          meses: mDeuda,
          bMes,
          iMes,
          baseTotal,
          ivaTotal,
          multaTotal,
          total: baseTotal + ivaTotal + multaTotal,
          esCasoSinMulta
        };
      });

      const numMesesTotal = clusterDeudas.length > 0 ? clusterDeudas.length : maxMesesCluster;
      const baseMensualLocal = cluster.inmuebles.reduce((sum: number, inm: any) => sum + calcularMensualidad(inm, tcmmv), 0);
      const ivaMensualLocal = esRes ? 0 : (baseMensualLocal * 0.16);
      const totalMensualLocal = baseMensualLocal + ivaMensualLocal;
      const mesesConMulta = Math.max(0, numMesesTotal - 1);
      const moraTasa = esRes ? 0.10 : 0.12;
      const multaMensualLocal = baseMensualLocal * moraTasa;

      const serviciosPendientes = (clusterIdx === 0)
        ? viewServiciosEsp.filter((s: any) => s.estado !== 'Pagado')
        : [];
      const totalServiciosBs = serviciosPendientes.reduce((a: number, s: any) => a + (parseFloat(s.monto) || 0), 0);

      const totalPagarLocal = subtotalBaseLocal + subtotalIvaLocal + subtotalMultasLocal + totalServiciosBs;

      // Determinar fechas de período
      let periodoDesde = 'N/A';
      let periodoHasta = 'N/A';
      let penultimoPeriodo = 'N/A';

      if (clusterDeudas.length > 0) {
        periodoDesde = formatPeriodo(clusterDeudas[0].emision);
        periodoHasta = formatPeriodo(clusterDeudas[clusterDeudas.length - 1].emision);
        if (clusterDeudas.length > 1) {
          penultimoPeriodo = formatPeriodo(clusterDeudas[clusterDeudas.length - 2].emision);
        }
      } else if (numMesesTotal > 0) {
        // En octubre, el último mes adeudado/emitido es septiembre (today.getMonth() - 1), ya que octubre se cobra en noviembre
        const dIni = new Date(today.getFullYear(), today.getMonth() - numMesesTotal, 1);
        const dFin = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const dPen = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        periodoDesde = formatPeriodo(dIni);
        periodoHasta = formatPeriodo(dFin);
        penultimoPeriodo = formatPeriodo(dPen);
      }

      // Si hay más de un cluster y este está 100% solvente y no es el único con deuda, omitir
      if (clustersToRender.length > 1 && totalPagarLocal <= 0.01 && !clustersToRender.every(c => Math.max(0, ...c.inmuebles.map((i: any) => parseInt(i.meses_deuda || 0))) === 0)) {
        continue;
      }

      if (pageCount > 0) doc.addPage();
      pageCount++;

      const docNro = Math.floor(10000 + Math.random() * 90000);

      // ── LOGO IAMEC Naguanagua (lado izquierdo) ──
      try { doc.addImage(logos.iamec, 'PNG', 14, 8, 42, 22); } catch(e) {}

      // ── TÍTULO ──
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTADO DE CUENTA', 105, 15, { align: 'center' });

      doc.setFontSize(8.5);
      if (cluster.isMultiActivity) {
        doc.setTextColor(30, 64, 175);
        doc.text('LOCAL COMERCIAL UNIFICADO — MÚLTIPLES ACTIVIDADES ECONÓMICAS', 105, 20, { align: 'center' });
      } else if (esRes) {
        doc.setTextColor(5, 150, 105);
        doc.text('USO RESIDENCIAL (EXENTO DE IVA)', 105, 20, { align: 'center' });
      } else {
        doc.setTextColor(71, 85, 105);
        doc.text('USO COMERCIAL', 105, 20, { align: 'center' });
      }

      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text(`TASA VIGENTE HASTA: ${tasaVigente}`, 105, 25, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      // ── METADATA & LÍNEA ──
      doc.setLineWidth(0.3);
      doc.line(14, 28, 196, 28);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.text(`Generado por: ${cajero}`, 14, 32);
      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${clusterIdx + 1} de ${clustersToRender.length}   |   Nro.: ${docNro}`, 196, 32, { align: 'right' });
      doc.line(14, 34, 196, 34);

      // ── DATOS DEL CONTRIBUYENTE Y LOCAL ──
      let y = 39;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text('Contribuyente:', 14, y);
      doc.setFont('helvetica', 'bold');
      doc.text(String(viewData.Contribuyente || '').slice(0, 48), 38, y);

      doc.setFont('helvetica', 'normal');
      doc.text('R.I.F. / C.I.:', 145, y);
      doc.setFont('helvetica', 'bold');
      doc.text(viewData.Identidad || '', 165, y);
      y += 5;

      if (cluster.isMultiActivity) {
        const codigoPrincipal = cluster.inmuebles[0]?.condominio_padre_id || cluster.clusterId || cluster.inmuebles[0]?.inmueble || 'Principal';
        doc.setFont('helvetica', 'normal');
        doc.text('Código Inmueble:', 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(codigoPrincipal, 42, y);

        doc.setFont('helvetica', 'normal');
        doc.text('Actividades:', 145, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`${cluster.inmuebles.length} Actividades`, 165, y);
        y += 5;
      } else {
        const inmSingle = cluster.inmuebles[0];
        doc.setFont('helvetica', 'normal');
        doc.text('Código Inmueble:', 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(inmSingle.inmueble || 'Principal', 40, y);

        doc.setFont('helvetica', 'normal');
        doc.text('Uso / Clasificación:', 95, y);
        doc.setFont('helvetica', 'bold');
        doc.text(String(inmSingle.actividad_principal || inmSingle.clasificacion || inmSingle.tipo || '').slice(0, 36), 125, y);
        y += 5;
      }

      const dirStr = cluster.direccion || viewData.Direccion || 'Naguanagua, Edo. Carabobo';
      const splitDir = doc.splitTextToSize(`Dirección Local/Inmueble: ${dirStr}`, 182);
      doc.setFont('helvetica', 'normal');
      doc.text(splitDir, 14, y);
      y += (splitDir.length * 4) + 2;

      doc.setDrawColor(210, 210, 210);
      doc.line(14, y, 196, y);
      doc.setDrawColor(0, 0, 0);
      y += 4;

      // ── TABLA DE ACTIVIDADES ECONÓMICAS (SI ES LOCAL CON 2 O MÁS ACTIVIDADES) ──
      // "si son de un local que tenga 2 actividades economicas o mas tiene que ser en una hoja compartida
      // del estado de cuenta y que detalle cada actividad economica"
      if (cluster.isMultiActivity) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 64, 175);
        doc.text('DETALLE DE ACTIVIDADES ECONÓMICAS DEL LOCAL', 105, y, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        y += 2;

        const actRows = cluster.inmuebles.map((inm: any) => {
          const actName = stripNivel(inm.actividad_principal || 'Actividad Comercial');
          const fo = inm.mmv_mes ? parseFloat(inm.mmv_mes) : getFO(actName, false);
          const bMes = calcularMensualidad(inm, tcmmv);
          const iMes = bMes * 0.16;
          const tMes = bMes + iMes;
          return [
            inm.inmueble || '—',
            actName,
            fo.toFixed(2),
            `Bs. ${bMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${iMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${tMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [['CÓDIGO', 'ACTIVIDAD ECONÓMICA', 'F.O.', 'BASE MES (Bs.)', 'IVA 16% (Bs.)', 'TOTAL MES (Bs.)']],
          body: actRows,
          foot: [[
            'TOTAL MENSUAL UNIFICADO DEL LOCAL', '', '',
            `Bs. ${baseMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${ivaMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${totalMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]],
          theme: 'grid',
          headStyles: {
            fillColor: [239, 246, 255], textColor: [30, 64, 175],
            fontStyle: 'bold', lineColor: [191, 219, 254], lineWidth: 0.2, halign: 'center', fontSize: 7.5
          },
          footStyles: {
            fillColor: [241, 245, 249], textColor: [15, 23, 42],
            fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.2, fontSize: 7.5
          },
          styles: { fontSize: 7, cellPadding: 1.5 },
          columnStyles: {
            0: { cellWidth: 24, fontStyle: 'bold' },
            1: { cellWidth: 70 },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 24, halign: 'right' },
            4: { cellWidth: 24, halign: 'right' },
            5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
          }
        });

        y = (doc as any).lastAutoTable.finalY + 4;
      }

      // ── ESTADO DE CUENTA RESUMIDO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 4;

      const resumenRows: Array<[string, string]> = [
        [`Períodos Calculados:`, cluster.isMultiActivity
          ? clusterInmBreakdown.map((b: any) => `${b.inmueble}: ${b.meses > 0 ? `${b.meses}m` : 'Al Día'}`).join(' | ')
          : (numMesesTotal > 0 ? `${periodoDesde} a ${periodoHasta} (${numMesesTotal} meses)` : 'Solvente / Al Día')
        ],
        ['Monto Recolección Aseo Urbano Bs.:', `Bs. ${subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ];

      if (clusterIdx === 0 && totalServiciosBs > 0) {
        resumenRows.push(['Monto Servicios Especiales Bs.:', `Bs. ${totalServiciosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      }

      if (esRes) {
        resumenRows.push(
          ['Total Exento de IVA Bs.:', `Bs. ${subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Base Imponible Bs.:', 'Bs. 0,00'],
          ['IVA (0.00%) Bs.:', 'Bs. 0,00'],
          ['Multas (Último mes sin multa) Bs.:', `Bs. ${subtotalMultasLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      } else {
        resumenRows.push(
          ['Total Exento Bs.:', `Bs. ${(clusterIdx === 0 ? totalServiciosBs : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Base Imponible Bs.:', `Bs. ${subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['IVA (16.00%) Bs.:', `Bs. ${subtotalIvaLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Multas (Último mes sin multa) Bs.:', `Bs. ${subtotalMultasLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      }

      resumenRows.push(['Total Estado de Cuenta Bs.:', `Bs. ${totalPagarLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);

      doc.setFontSize(8);
      resumenRows.forEach(([lbl, val]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(lbl, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(val, 196, y, { align: 'right' });
        y += 4.5;
      });

      doc.line(14, y, 196, y);
      y += 5;

      // ── TOTAL A PAGAR HIGHLIGHT ──
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text('TOTAL A PAGAR', 14, y);
      doc.text(`Bs. ${totalPagarLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      y += 2;
      doc.line(14, y, 196, y);
      y += 5;

      // ── ESTADO DE CUENTA DETALLADO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('ESTADO DE CUENTA DETALLADO', 105, y, { align: 'center' });
      y += 3;

      const detalleRows: any[] = [];

      if (cluster.isMultiActivity) {
        clusterInmBreakdown.forEach((item: any) => {
          let periodoStr = 'Al Día';
          if (item.meses > 0) {
            const dIni = new Date(today.getFullYear(), today.getMonth() - item.meses, 1);
            const dFin = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            periodoStr = `${formatPeriodo(dIni)} a ${formatPeriodo(dFin)} (${item.meses} ${item.meses === 1 ? 'mes' : 'meses'})`;
          }
          const concepto = `${item.actividad} [${item.inmueble}]${item.esCasoSinMulta ? ' — Caso Especial Sin Multa' : (item.meses <= 1 ? ' — Período al Día (Sin Multa)' : '')}`;
          detalleRows.push([
            periodoStr,
            concepto,
            item.baseTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            item.multaTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            item.ivaTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            item.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          ]);
        });
      } else if (numMesesTotal === 0) {
        detalleRows.push([
          tasaVigente,
          'Solvente — No posee períodos pendientes',
          '0,00', '0,00', '0,00', '0,00'
        ]);
      } else if (numMesesTotal <= 6) {
        // Listar individualmente si son pocos meses
        for (let i = 1; i <= numMesesTotal; i++) {
          const isUltimo = (i === numMesesTotal);
          const mesMora = isUltimo ? 0 : (baseMensualLocal * (esRes ? 0.10 : 0.12));
          const mesTotal = baseMensualLocal + ivaMensualLocal + mesMora;
          let labelMes = `Mes ${i}`;
          if (clusterDeudas[i - 1]?.emision) {
            labelMes = formatPeriodo(clusterDeudas[i - 1].emision);
          } else {
            const d = new Date(today.getFullYear(), today.getMonth() - numMesesTotal + i - 1, 1);
            labelMes = formatPeriodo(d);
          }

          detalleRows.push([
            labelMes,
            isUltimo ? 'Aseo Urbano (Último período - Sin Multa)' : `Aseo Urbano (Multa ${esRes ? '10%' : '12%'})`,
            baseMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            mesMora.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            ivaMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            mesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          ]);
        }
      } else {
        const histBase = baseMensualLocal * mesesConMulta;
        const histMulta = (baseMensualLocal * (esRes ? 0.10 : 0.12)) * mesesConMulta;
        const histIva = ivaMensualLocal * mesesConMulta;
        const histTotal = histBase + histMulta + histIva;

        const ultBase = baseMensualLocal;
        const ultMulta = 0;
        const ultIva = ivaMensualLocal;
        const ultTotal = ultBase + ultIva;

        detalleRows.push([
          `${periodoDesde} a ${penultimoPeriodo}`,
          `Período Acumulado (${mesesConMulta} Meses con Multa)`,
          histBase.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          histMulta.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          histIva.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          histTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        ]);

        detalleRows.push([
          periodoHasta,
          'Último Período Facturado — EXONERADO DE MULTA',
          ultBase.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          '0,00',
          ultIva.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ultTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        ]);
      }

      if (clusterIdx === 0 && serviciosPendientes.length > 0) {
        const TIPO_LABEL: any = { 'tala_poda': 'Tala y Poda', 'especial': 'Serv. Especial', 'visto_bueno': 'Visto Bueno', 'inspeccion': 'Inspección', 'extraordinario': 'Serv. Extraordinario' };
        serviciosPendientes.forEach((s: any) => {
          const mServ = parseFloat(s.monto) || 0;
          detalleRows.push([
            s.fecha ? formatPeriodo(s.fecha) : '—',
            `${TIPO_LABEL[s.tipo] || 'Serv. Especial'}: ${s.descripcion || ''}`,
            mServ.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            '0,00', '0,00',
            mServ.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          ]);
        });
      }

      autoTable(doc, {
        startY: y,
        head: [['PERÍODO', 'DETALLE / CONCEPTO', 'RECOLECCIÓN (Bs)', 'MULTAS (Bs)', 'IVA (Bs)', 'TOTAL BS']],
        body: detalleRows,
        foot: [[
          'TOTALES',
          cluster.isMultiActivity ? `${cluster.inmuebles.length} Actividades Unificadas` : `${numMesesTotal} Meses Facturados`,
          subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          subtotalMultasLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          subtotalIvaLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          totalPagarLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        ]],
        theme: 'grid',
        headStyles: {
          fillColor: [248, 250, 252], textColor: [15, 23, 42],
          fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center', fontSize: 7.5
        },
        footStyles: {
          fillColor: [241, 245, 249], textColor: [15, 23, 42],
          fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7.5
        },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 26, fontStyle: 'bold' },
          1: { cellWidth: 64 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' }
        }
      });

      y = (doc as any).lastAutoTable.finalY + 5;

      // ── INFORMACIÓN DE PAGO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('1) Banco: BANCAMIGA (0172)  |  Cta: 01720110711101340717  |  Beneficiario: IAMEC BANCAMIGA  |  RIF: G-200086149', 14, y);
      y += 3.5;
      doc.text('2) Banco: BANESCO (0134)    |  Cta: 01340415144151031715  |  Beneficiario: IAMEC            |  RIF: G-200076739', 14, y);
      y += 4;

      // ── AVISO DE VIGENCIA DE TASA ──
      doc.setLineWidth(0.2);
      doc.setDrawColor(220, 38, 38);
      doc.line(14, y, 196, y);
      y += 3.5;
      doc.setDrawColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(220, 38, 38);
      doc.text('IMPORTANTE: Los montos indicados en este estado de cuenta son válidos ÚNICAMENTE para la fecha de emisión del presente documento.', 105, y, { align: 'center' });
      y += 3.5;
      doc.text('La tasa de cambio oficial BCV varía periódicamente. Para cancelar en fecha posterior, solicite un nuevo estado de cuenta actualizado.', 105, y, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    } // fin loop clusters

    if (pageCount > 0) {
      doc.save(`Estado_Cuenta_${viewData.Identidad}_${Date.now()}.pdf`);
    }
  };

  
  const handleServerSearch = async () => {
    if (!serverSearchTerm.trim()) {
      setIsShowingServerResults(false);
      return;
    }
    setIsSearchingServer(true);
    setIsShowingServerResults(true);
    try {
      const term = serverSearchTerm.trim();
      const [{ data: inmsData, error: inmsError }, { data: contsData, error: contsError }] = await Promise.all([
        supabase.from('inmuebles')
          .select('*')
          .or(`identidad.ilike.%${term}%,inmueble.ilike.%${term}%,contribuyente.ilike.%${term}%`)
          .limit(100),
        supabase.from('contribuyentes')
          .select('*')
          .or(`identidad.ilike.%${term}%,nombre.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(100)
      ]);
        
      if (inmsError) throw inmsError;

      // Si encontramos inmuebles, recopilar todas las identidades y buscar sus otros inmuebles vinculados
      const identsSet = new Set<string>();
      (inmsData || []).forEach((i: any) => { if (i.identidad) identsSet.add(i.identidad); });
      (contsData || []).forEach((c: any) => { if (c.identidad) identsSet.add(c.identidad); });

      let allFoundInmuebles = inmsData || [];
      if (identsSet.size > 0 && identsSet.size <= 20) {
        const { data: siblings } = await supabase
          .from('inmuebles')
          .select('*')
          .in('identidad', Array.from(identsSet));
        if (siblings && siblings.length > 0) {
          allFoundInmuebles = siblings;
        }
      }
      
      const mapResults = new Map();

      allFoundInmuebles.forEach((row: any) => {
        if (row.identidad && !mapResults.has(row.identidad)) {
          const rowEstado = row.estado || 'Activo';
          mapResults.set(row.identidad, {
            Identidad: row.identidad,
            Contribuyente: row.contribuyente || row.nombre || 'Sin Nombre',
            Telefono: row.telefono || 'No registrado',
            Correo: row.email || row.correo_electronico || 'No registrado',
            CodCont: row.inmueble || row.cod_cont || '',
            cod_cont: row.inmueble || row.cod_cont || '',
            Direccion: row.direccion || '',
            Observaciones: row.notas || '',
            Actividad: row.actividad_principal || 'No aplica',
            Clasificacion: row.clasificacion || (row.tipo?.toUpperCase().includes('COMERCIAL') ? 'Comercial' : 'Residencial'),
            SaldoFavor: parseFloat(row.saldo_favor_bs || '0'),
            DeudaMMV: parseFloat(row.deuda_mmv || 0),
            DeudaCongelada: parseFloat(row.deuda_congelada_bs || 0),
            DeudaBs: (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * 57 * tcmmv)),
            MesesDeuda: parseInt(row.meses_deuda || '0'),
            Estado: rowEstado,
            FechaRegistro: row.created_at || null
          });
        } else if (row.identidad && mapResults.has(row.identidad)) {
          const existing = mapResults.get(row.identidad);
          existing.SaldoFavor += parseFloat(row.saldo_favor_bs || '0');
          existing.DeudaMMV += parseFloat(row.deuda_mmv || 0);
          existing.DeudaCongelada += parseFloat(row.deuda_congelada_bs || 0);
          existing.DeudaBs = (existing.DeudaCongelada + (existing.DeudaMMV * 57 * tcmmv));
          const rowEstado = row.estado || 'Activo';
          if (rowEstado === 'Activo') existing.Estado = 'Activo';
          const cod = row.inmueble || row.cod_cont;
          if (cod && !existing.CodCont.includes(cod)) {
            existing.CodCont += " " + cod;
          }
          mapResults.set(row.identidad, existing);
        }
      });

      (contsData || []).forEach((c: any) => {
        if (c.identidad && !mapResults.has(c.identidad)) {
          mapResults.set(c.identidad, {
            Identidad: c.identidad,
            Contribuyente: c.nombre || 'Sin Nombre',
            Telefono: c.telefono || 'No registrado',
            Correo: c.email || 'No registrado',
            CodCont: c.identidad,
            cod_cont: c.identidad,
            Direccion: c.direccion || '',
            Observaciones: c.observaciones || '',
            Actividad: 'No aplica',
            Clasificacion: 'Individual',
            SaldoFavor: 0,
            DeudaMMV: 0,
            DeudaCongelada: 0,
            DeudaBs: 0,
            MesesDeuda: 0,
            Estado: 'Activo',
            FechaRegistro: c.created_at || null
          });
        }
      });

      setServerResults(Array.from(mapResults.values()));
    } catch (e: any) {
      alert("Error en la búsqueda en servidor: " + e.message);
    } finally {
      setIsSearchingServer(false);
    }
  };

  const exportarExcelContribuyentes = () => {
    const dataToExport = contribuyentes.map((c: any) => {
      const deudas = (recibos || [])
        .filter((f: any) => f.contribuyente === c.Contribuyente || f.contribuyente === c.Identidad)
        .filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Abonado');
      const totalBs = deudas.reduce((acc: number, f: any) => acc + parseFloat(f.monto || '0'), 0);
      
      return {
        "CÓDIGO": c.CodCont || 'N/A',
        "R.I.F / C.I": c.Identidad,
        "RAZÓN SOCIAL": c.Contribuyente,
        "CLASIFICACIÓN": c.Clasificacion || 'Residencial',
        "DETALLE ACTIVIDAD/TIPO": c.ActividadComercial || c.TipoResidencia || c.Actividad || 'N/A',
        "TELÉFONO": c.Telefono || 'N/A',
        "CORREO": c.Correo || 'N/A',
        "DIRECCIÓN": c.Direccion || 'N/A',
        "DEUDA TOTAL (Bs)": totalBs.toFixed(2),
        "MESES PENDIENTES": deudas.length
      };
    });

    const worksheet = exportToExcelWithLogos(dataToExport, `Contribuyentes_${new Date().getTime()}.xlsx`, "Contribuyentes_y_Deudas");
  };

  const generarSolvenciaIndividual = async (contribuyente: any, inmuebleSpec: string) => {
    const cleanId = (contribuyente.Identidad || '').replace(/-/g, '').toUpperCase();
    const userInms = (inmuebles || []).filter((i: any) =>
      (i.identidad || '').replace(/-/g, '').toUpperCase() === cleanId
    );
    const inmsConDeuda = userInms.filter((i: any) =>
      parseInt(String(i.meses_deuda || '0'), 10) > 0 ||
      parseFloat(String(i.deuda_mmv || '0')) > 0 ||
      parseFloat(String(i.deuda_congelada_bs || '0')) > 0
    );
    const pendFacturas = (recibos || []).filter((f: any) =>
      (f.identidad || '').replace(/-/g, '').toUpperCase() === cleanId &&
      ['Pendiente', 'Abonado', 'Por Verificar'].includes(f.estado)
    );

    if (inmsConDeuda.length > 0 || pendFacturas.length > 0) {
      alert(`ACCESO DENEGADO: El contribuyente ${contribuyente.Identidad} posee deudas activas o meses pendientes. No es posible emitir la Solvencia.`);
      return;
    }

    await generarSolvenciaPDF(contribuyente, inmuebleSpec, addCertificado);
  };

  const handleEdit = (row: any) => {
    let telefonoPrefijo = '0414';
    let telefonoNumero = '';
    if (row.Telefono) {
      if (row.Telefono.length >= 11) {
        telefonoPrefijo = row.Telefono.substring(0, 4);
        telefonoNumero = row.Telefono.substring(4);
      } else {
        telefonoNumero = row.Telefono;
      }
    }

    let correoNombre = '';
    let correoDominio = '@gmail.com';
    let correoDominioOtro = '';
    if (row.Correo && row.Correo.includes('@')) {
      const parts = row.Correo.split('@');
      correoNombre = parts[0];
      const dom = '@' + parts[1];
      if (['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com'].includes(dom)) {
        correoDominio = dom;
      } else {
        correoDominio = 'Otro';
        correoDominioOtro = dom;
      }
    } else if (row.Correo) {
      correoNombre = row.Correo;
    }

    let autoClasificacion = row.Clasificacion || 'A';
    
    // Auto-detectar condominio si viene de una importación con clasificación 'A'
    if (autoClasificacion !== 'Condominio') {
      const nombreLC = (row.Contribuyente || '').toLowerCase();
      const cant = parseInt(row.Cant_Inmuebles) || 1;
      if (nombreLC.includes('condominio') || nombreLC.includes('residencias') || nombreLC.includes('conjunto') || cant > 1) {
        autoClasificacion = 'Condominio';
      }
    }

    const parseAreaToLevel = (areaNum: number) => {
      if (!areaNum || areaNum <= 50) return '0 - 50 m²';
      if (areaNum <= 100) return '51 - 100 m²';
      if (areaNum <= 200) return '101 - 200 m²';
      return 'Mayor a 201 m²';
    };

    let isCondominio = false;
    let locales: { id: string; numeracion: string; uso: string; estatus: string; actividad: string; nivel: string }[] = [];
    let cantidadInmuebles = 1;
    let TipoResidencia = ordenanzaData.tiposResidenciales[0].label;
    let ActividadComercial = '';
    let NivelMetraje = ordenanzaData.nivelesMetraje[0];

    const misInmuebles = inmuebles.filter((i: any) => i.identidad === row.Identidad);
    
    if (misInmuebles.length > 0) {
      if (misInmuebles.length > 1 || (parseInt(misInmuebles[0].cant_inmuebles) || 1) > 1 || autoClasificacion === 'Condominio') {
        isCondominio = true;
        autoClasificacion = 'Condominio';
        cantidadInmuebles = misInmuebles.length > 1 ? misInmuebles.length : (parseInt(misInmuebles[0].cant_inmuebles) || 1);
        
        locales = misInmuebles.map((inm: any, idx: number) => ({
          id: `local-${idx}-${Date.now()}`,
          numeracion: inm.inmueble || `Inmueble ${idx + 1}`,
          uso: inm.clasificacion === 'Comercial' || inm.clasificacion === 'Industrial' ? 'Comercial' : 'Residencial',
          estatus: 'Ocupado',
          actividad: inm.clasificacion === 'Residencial' ? '' : (inm.actividad_principal || ''),
          nivel: parseAreaToLevel(parseFloat(inm.area) || 0)
        }));
      } else {
        const principal = misInmuebles[0];
        if (principal.clasificacion === 'Residencial') {
          TipoResidencia = principal.actividad_principal || TipoResidencia;
        } else {
          ActividadComercial = principal.actividad_principal || '';
          NivelMetraje = parseAreaToLevel(parseFloat(principal.area) || 0);
        }
      }
    }

    setFormData({ 
      ...row,
      Clasificacion: autoClasificacion,
      telefonoPrefijo,
      telefonoNumero,
      correoNombre,
      correoDominio,
      correoDominioOtro,
      TipoResidencia,
      ActividadComercial,
      NivelMetraje,
      isCondominio,
      cantidadInmuebles,
      locales,
      Nota: '',
      
      
    });
    setOriginalData({ ...row, Clasificacion: autoClasificacion, ActividadComercial, TipoResidencia });
    setEditingId(row.Identidad);
    setIsNew(false);
    setShowSuccess(false);
    setShowCalculation(false);
  };

  const handleAdd = () => {
    const defaultData = {
      Identidad: '',
      Contribuyente: '',
      Telefono: '',
      telefonoPrefijo: '0414',
      telefonoNumero: '',
      Correo: '',
      correoNombre: '',
      correoDominio: '@gmail.com',
      correoDominioOtro: '',
      Direccion: '',
      Clasificacion: 'Residencial',
      TipoResidencia: ordenanzaData.tiposResidenciales[0].label,
      ActividadComercial: '',
      NivelMetraje: ordenanzaData.nivelesMetraje[0],
      isCondominio: false,
      cantidadInmuebles: 0,
      locales: [],
      coordenadas: null,
      Nota: '',
      
      
    };
    setFormData(defaultData);
    setOriginalData(defaultData);
    setEditingId('new');
    setIsNew(true);
    setShowSuccess(false);
    setShowCalculation(false);
  };

  const handleCantidadChange = (e: any) => {
    const val = parseInt(e.target.value) || 0;
    const currentLocales = formData.locales || [];
    let newLocales = [...currentLocales];
    
    if (val > currentLocales.length) {
      for (let i = currentLocales.length; i < val; i++) {
        newLocales.push({
          id: `local-${i}-${Date.now()}`,
          numeracion: `Inmueble ${i + 1}`,
          uso: (formData.Clasificacion === 'Comercial' || formData.Clasificacion === 'Industrial') ? 'Comercial' : 'Residencial',
          estatus: 'Desocupado',
          actividad: '',
          nivel: ordenanzaData.nivelesMetraje[0],
          tipoResidencia: ordenanzaData.tiposResidenciales[0].label
        });
      }
    } else {
      newLocales = newLocales.slice(0, val);
    }
    setFormData({...formData, cantidadInmuebles: val, locales: newLocales});
  };

  const calcularTarifa = async () => {
    setIsCalculating(true);
    try {
      // Fetch BCV
      const res = await fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      
      const tasaTruncada = (Math.trunc(data.tcmmv * 100) / 100).toFixed(2);
      setBcvRate(tasaTruncada);
      setBcvDate(new Date(data.timestamp).toLocaleString());

      // Find factor
      let factorTotal = 0;
      let leyenda = '';
      const desgloseLocales: any[] = [];

      if (formData.isCondominio && formData.locales?.length > 0) {
        leyenda = `Condominio (${formData.cantidadInmuebles} Inmuebles)`;
        formData.locales.forEach((local: any) => {
          let localFactor = 0;
          let localLeyenda = '';

          if (local.uso === 'Residencial') {
            const tipo = ordenanzaData.tiposResidenciales.find(t => t.label === (local.tipoResidencia || formData.TipoResidencia));
            if (tipo) {
              localFactor = tipo.factor;
              localLeyenda = `Tasa Residencial (${tipo.label.substring(0, 25)}...)`;
            }
          } else if (local.uso === 'Comercial') {
            const nivelIndex = ordenanzaData.nivelesMetraje.indexOf(local.nivel || ordenanzaData.nivelesMetraje[0]);
            
            if (local.estatus === 'Desocupado') {
              const actVacio = todasLasActividades.find(a => a.label === 'Inmueble desocupado (vacío)');
              if (actVacio && nivelIndex !== -1) {
                localFactor = actVacio.factores[nivelIndex];
                localLeyenda = `Comercial Desocupado (${local.nivel})`;
              }
            } else {
              const act = todasLasActividades.find(a => a.label === local.actividad);
              if (act && nivelIndex !== -1) {
                localFactor = act.factores[nivelIndex];
                localLeyenda = `Comercial/Ind. Ocupado - ${local.actividad}`;
              }
            }
          }
          
          factorTotal += localFactor;
          
          if (localFactor > 0) {
            desgloseLocales.push({
              numeracion: local.numeracion,
              leyenda: localLeyenda,
              factor: localFactor,
              montoBs: (Math.trunc((localFactor * data.tcmmv) * 100) / 100).toFixed(2)
            });
          }
        });
      } else {
        if (formData.Clasificacion === 'Residencial') {
          const tipo = ordenanzaData.tiposResidenciales.find(t => t.label === formData.TipoResidencia);
          if (tipo) {
            factorTotal = tipo.factor;
            leyenda = `Clasificador de Tasa Residencial: ${tipo.label}`;
          }
        } else {
          const act = todasLasActividades.find(a => a.label === formData.ActividadComercial);
          const nivelIndex = ordenanzaData.nivelesMetraje.indexOf(formData.NivelMetraje);
          if (act && nivelIndex !== -1) {
            factorTotal = act.factores[nivelIndex];
            leyenda = `Tasa Com/Ind: ${act.label} (Nivel: ${formData.NivelMetraje})`;
          }
        }
      }

      // Truncar a 2 decimales sin redondear
      const rawTotal = factorTotal * data.tcmmv;
      const totalTruncado = (Math.trunc(rawTotal * 100) / 100).toFixed(2);

      setCalculoDetalle({
        factor: factorTotal,
        leyenda,
        totalBs: totalTruncado,
        fuente: data.source,
        desglose: desgloseLocales
      });
      setShowCalculation(true);
    } catch (e) {
      console.error(e);
    }
    setIsCalculating(false);
  };

  const handleAjustarDeuda = async () => {
    if (!formData || !calculoDetalle) return;
    setIsProcessingDebt(true);
    try {
      const deudaMMV = calculoDetalle.factor * debtMonths;
      
      // Update deuda_mmv in inmuebles where identidad matches formData.Identidad
      const { error: err1 } = await supabase
        .from('inmuebles')
        .update({ deuda_mmv: deudaMMV })
        .eq('identidad', formData.Identidad);
        
      if (err1) throw err1;

      // Delete all pending recibos for this taxpayer
      const { error: errDelete } = await supabase
        .from('facturas')
        .delete()
        .eq('contribuyente', formData.Contribuyente)
        .eq('estado', 'Pendiente');
        
      if (errDelete) throw errDelete;

      // Insert new recibo for the new balance if > 0
      if (deudaMMV > 0) {
        const tasaOficial = bcvRate ? parseFloat(bcvRate.replace(',', '.')) : 1;
        const montoBs = (deudaMMV * tasaOficial).toFixed(2);
        
        const facturaData = {
          referencia: `RECIB-ADJ-${Date.now()}`,
          contribuyente: formData.Contribuyente,
          identidad: formData.Identidad,
          monto: montoBs,
          emision: new Date().toISOString().split('T')[0],
          vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          estado: 'Pendiente'
        };
        const { error: errInsert } = await supabase.from('facturas').insert([facturaData]);
        if (errInsert) throw errInsert;
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
      setIsDebtModalOpen(false);
      await refreshData(); // Refrescar datos sin recargar toda la pagina
    } catch (e: any) {
      console.error(e);
      alert('Error ajustando la deuda: ' + e.message);
    } finally {
      setIsProcessingDebt(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNew && !uploadDocs.cedula.url) {
      alert("Es OBLIGATORIO adjuntar la Copia de Cédula / RIF en el Expediente Digitalizado.");
      return;
    }

    // Validar Notas si cambió tarifa/actividad
    if (!isNew && originalData) {
      const changedActividad = formData.ActividadComercial !== originalData.ActividadComercial;
      const changedResidencia = formData.TipoResidencia !== originalData.TipoResidencia;
      const changedClasificacion = formData.Clasificacion !== originalData.Clasificacion;
      
      if ((changedActividad || changedResidencia || changedClasificacion) && !formData.Notas_Adicionales?.trim()) {
        alert("Es OBLIGATORIO ingresar una Nota Adicional explicando el cambio de Actividad Comercial, Tipo de Residencia o Clasificación.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const finalTelefono = `${formData.telefonoPrefijo}${formData.telefonoNumero}`;
      const finalCorreo = `${formData.correoNombre}${formData.correoDominio === 'Otro' ? formData.correoDominioOtro : formData.correoDominio}`;
      
      const dataToSave = {
        ...formData,
        Telefono: finalTelefono,
        Correo: finalCorreo
      };

      if (isNew) {
        await addContribuyente(dataToSave);
        setIsNew(false);
        setEditingId(dataToSave.Identidad); // Switch to edit mode
      } else if (editingId) {
        await updateContribuyente(editingId, dataToSave);
      }
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Ocurrió un error guardando en Supabase: ' + (err?.message || 'Verifique la conexión.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (editingId && formData) {
    return (
      <div className="space-y-6 max-w-[1200px] mx-auto p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button onClick={() => setEditingId(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors mr-2">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <Users className="w-5 h-5 text-slate-700" />
            <h1 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              {isNew ? 'Ingresar Contribuyente' : 'Datos del Contribuyente'}
            </h1>
          </div>
        </div>

        {showSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">Los datos han sido guardados correctamente en la sesión actual.</span>
          </div>
        )}

        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded shadow-sm">
          {/* Section: Datos del Contribuyente */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" /> Datos del Contribuyente
            </h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-blue-600 mb-1">Código</label>
                <input type="text" value={formData.CodCont || 'Generación Automática'} disabled className="w-full border border-slate-300 bg-slate-100 rounded px-3 py-2 text-sm text-slate-500 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Tipo Identidad</label>
                <select className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500">
                  <option value="V">Venezolano (V)</option>
                  <option value="E">Extranjero (E)</option>
                  <option value="J">Jurídico (J)</option>
                  <option value="G">Gubernamental (G)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Nro Identidad</label>
                <input type="text" maxLength={9} value={formData.Identidad} onChange={e => setFormData({...formData, Identidad: e.target.value.replace(/[^0-9]/g, '')})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Nombre o Razón Social</label>
                <input type="text" value={formData.Contribuyente} onChange={e => setFormData({...formData, Contribuyente: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Número de Patente (Si aplica)</label>
                <input type="text" value={formData.Patente || ''} onChange={e => setFormData({...formData, Patente: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" placeholder="Ej: P-12345" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Ficha Catastral</label>
                <input type="text" value={formData.FichaCatastral || ''} onChange={e => setFormData({...formData, FichaCatastral: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" placeholder="Ej: 01-23-456-789" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Teléfono Móvil <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <select 
                    value={formData.telefonoPrefijo}
                    onChange={e => setFormData({...formData, telefonoPrefijo: e.target.value})}
                    className="w-1/3 border border-slate-300 rounded px-2 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="0412">0412</option>
                    <option value="0414">0414</option>
                    <option value="0424">0424</option>
                    <option value="0416">0416</option>
                    <option value="0426">0426</option>
                    <option value="0422">0422</option>
                  </select>
                  <input 
                    type="tel" 
                    pattern="[0-9]*"
                    value={formData.telefonoNumero} 
                    onChange={e => setFormData({...formData, telefonoNumero: e.target.value.replace(/\D/g, '')})} 
                    onKeyPress={(e) => {
                      if (!/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    maxLength={7}
                    placeholder="1234567"
                    className="w-2/3 border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
                    required
                  />
                </div> 
 
            <div className="bg-slate-50 border-b border-t border-slate-200 px-4 py-3 mt-6">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" /> Expediente Digitalizado (Adjuntar Documentos)
              </h2>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Cédula / RIF */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">Copia de Cédula / RIF <span className="text-red-500">*</span></label>
                <label className="block border-2 border-dashed border-slate-300 rounded p-4 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-colors">
                  {uploadDocs.cedula.uploading ? (
                    <span className="text-xs text-blue-500 animate-pulse">â ³ Subiendo...</span>
                  ) : uploadDocs.cedula.url ? (
                    <div className="space-y-1">
                      <span className="text-[10px] text-green-600 font-bold block">âœ… {uploadDocs.cedula.name}</span>
                      <a href={uploadDocs.cedula.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 underline" onClick={e => e.stopPropagation()}>Ver documento</a>
                      <span className="block text-[10px] text-slate-400">Click para cambiar</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">ðŸ“Ž Click para subir archivo<br/><span className="text-[10px] text-slate-400">PDF o imagen, máx. 10 MB</span></span>
                  )}
                  <input type="file" className="hidden" accept=".pdf,image/*" onChange={e => handleUploadDoc(e, 'cedula')} disabled={uploadDocs.cedula.uploading}/>
                </label>
              </div>
              {/* Ficha Catastral */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">Ficha Catastral Digitalizada</label>
                <label className="block border-2 border-dashed border-slate-300 rounded p-4 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-colors">
                  {uploadDocs.ficha.uploading ? (
                    <span className="text-xs text-blue-500 animate-pulse">â ³ Subiendo...</span>
                  ) : uploadDocs.ficha.url ? (
                    <div className="space-y-1">
                      <span className="text-[10px] text-green-600 font-bold block">âœ… {uploadDocs.ficha.name}</span>
                      <a href={uploadDocs.ficha.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 underline" onClick={e => e.stopPropagation()}>Ver documento</a>
                      <span className="block text-[10px] text-slate-400">Click para cambiar</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">ðŸ“Ž Click para subir archivo<br/><span className="text-[10px] text-slate-400">PDF o imagen, máx. 10 MB</span></span>
                  )}
                  <input type="file" className="hidden" accept=".pdf,image/*" onChange={e => handleUploadDoc(e, 'ficha')} disabled={uploadDocs.ficha.uploading}/>
                </label>
              </div>
              {/* Registro Mercantil */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">Registro Mercantil / Otros</label>
                <label className="block border-2 border-dashed border-slate-300 rounded p-4 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-colors">
                  {uploadDocs.registro.uploading ? (
                    <span className="text-xs text-blue-500 animate-pulse">â ³ Subiendo...</span>
                  ) : uploadDocs.registro.url ? (
                    <div className="space-y-1">
                      <span className="text-[10px] text-green-600 font-bold block">âœ… {uploadDocs.registro.name}</span>
                      <a href={uploadDocs.registro.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 underline" onClick={e => e.stopPropagation()}>Ver documento</a>
                      <span className="block text-[10px] text-slate-400">Click para cambiar</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">ðŸ“Ž Click para subir archivo<br/><span className="text-[10px] text-slate-400">PDF o imagen, máx. 10 MB</span></span>
                  )}
                  <input type="file" className="hidden" accept=".pdf,image/*" onChange={e => handleUploadDoc(e, 'registro')} disabled={uploadDocs.registro.uploading}/>
                </label>
              </div>
            </div>

              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Teléfono Fijo</label>
                <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Email <span className="text-red-500">*</span></label>
                <div className="flex gap-1 mb-1">
                  <input 
                    type="text" 
                    value={formData.correoNombre} 
                    onChange={e => setFormData({...formData, correoNombre: e.target.value.replace(/\s/g, '')})} 
                    placeholder="usuario"
                    className="w-1/2 border border-slate-300 rounded px-2 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
                    required
                  />
                  <select 
                    value={formData.correoDominio}
                    onChange={e => setFormData({...formData, correoDominio: e.target.value})}
                    className="w-1/2 border border-slate-300 rounded px-1 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="@gmail.com">@gmail.com</option>
                    <option value="@yahoo.com">@yahoo.com</option>
                    <option value="@hotmail.com">@hotmail.com</option>
                    <option value="@outlook.com">@outlook.com</option>
                    <option value="Otro">Otro...</option>
                  </select>
                </div>
                {formData.correoDominio === 'Otro' && (
                  <input 
                    type="text" 
                    value={formData.correoDominioOtro} 
                    onChange={e => setFormData({...formData, correoDominioOtro: e.target.value.replace(/\s/g, '')})} 
                    placeholder="@prueba.com"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 mt-1" 
                    required
                  />
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-slate-500 mb-1">Dirección Exacta <span className="text-red-500">*</span></label>
              <textarea 
                value={formData.Direccion} 
                onChange={e => setFormData({...formData, Direccion: e.target.value})}
                rows={2} 
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
                required
              />
            </div>
            
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[10px] font-medium text-slate-500">Ubicación en el Mapa</label>
                {formData.coordenadas && (
                  <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200 flex items-center gap-1">
                    <MapPin size={10} />
                    Ubicación fijada
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mb-2">Haz clic en el mapa para marcar la ubicación exacta del inmueble. (Auto-completará la dirección)</p>
              <MapPicker 
                position={formData.coordenadas} 
                onLocationSelect={async (loc) => {
                  setFormData({...formData, coordenadas: loc});
                  // Geocodificación inversa
                  try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`);
                    const data = await res.json();
                    if (data && data.display_name) {
                      setFormData((prev: any) => ({...prev, coordenadas: loc, DireccionExacta: data.display_name}));
                    }
                  } catch (err) {
                    console.error('Error in reverse geocoding:', err);
                  }
                }} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Domicilio fiscal (como aparece en el RIF)</label>
                <input type="text" value={formData.Direccion || ''} onChange={e => setFormData({...formData, Direccion: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Dirección Exacta (Punto en el Mapa)</label>
                <input type="text" value={formData.DireccionExacta || ''} onChange={e => setFormData({...formData, DireccionExacta: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Nombre Comercial</label>
                <input type="text" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              <div className="md:col-span-2 mt-2">
                <label className="block text-[10px] font-bold text-blue-800 mb-1">Nota Simple (Opcional)</label>
                <textarea 
                  value={formData.Nota || ''}
                  onChange={e => setFormData({...formData, Nota: e.target.value})}
                  placeholder="Ingrese una nota sencilla, ej: Trajo documentación completa..."
                  className="w-full border border-blue-200 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-blue-50/30"
                  rows={2}
                />
              </div>
              {formData.Observaciones && (
                <div className="md:col-span-2 mt-2">
                  <label className="block text-[10px] font-bold text-amber-700 mb-1">Observaciones Históricas (Sistema Anterior)</label>
                  <textarea 
                    readOnly
                    value={formData.Observaciones}
                    className="w-full border border-amber-200 rounded p-2 text-sm outline-none bg-amber-50/50 text-amber-900"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {/* Clasificación de Ordenanza */}
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4">Clasificación (Según Ordenanza)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-blue-600 mb-1">Clasificación Principal</label>
                  <select 
                    value={formData.Clasificacion} 
                    onChange={e => {
                      const val = e.target.value;
                      const updatedLocales = (formData.locales || []).map((loc: any) => ({
                        ...loc,
                        uso: val === 'Residencial' ? 'Residencial' : (val.includes('Comercial') || val === 'Industrial') ? 'Comercial' : loc.uso
                      }));
                      setFormData({
                        ...formData, 
                        Clasificacion: val,
                        TipoResidencia: (val === 'Residencial' || val === 'Mixto') ? (formData.TipoResidencia || ordenanzaData.tiposResidenciales[0].label) : '',
                        ActividadComercial: (val.includes('Comercial') || val === 'Industrial' || val === 'Mixto') ? (formData.ActividadComercial || todasLasActividades[0].label) : '',
                        NivelMetraje: (val.includes('Comercial') || val === 'Industrial' || val === 'Mixto') ? (formData.NivelMetraje || ordenanzaData.nivelesMetraje[0]) : '',
                        locales: updatedLocales
                      });
                    }}
                    className="w-full border border-blue-300 bg-blue-50 rounded px-3 py-2 text-sm text-blue-800 outline-none focus:border-blue-500 font-medium"
                  >
                    {ordenanzaData.clasificaciones.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {(formData.Clasificacion === 'Residencial') && !formData.isCondominio && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Tipo de Residencia (Clasificador)</label>
                    <select 
                      value={formData.TipoResidencia || ordenanzaData.tiposResidenciales[0].label} 
                      onChange={e => setFormData({...formData, TipoResidencia: e.target.value})}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                    >
                      {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                    </select>
                  </div>
                )}

                {(formData.Clasificacion?.includes('Comercial') || formData.Clasificacion === 'Industrial' || formData.Clasificacion === 'Mixto') && !formData.isCondominio && (
                  <>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Actividad Económica (Buscador y Lista)</label>
                      <Select
                        options={todasLasActividades.map(a => ({ value: a.label, label: a.label }))}
                        value={{ value: formData.ActividadComercial, label: formData.ActividadComercial }}
                        onChange={(selected: any) => setFormData({...formData, ActividadComercial: selected?.value || ''})}
                        placeholder="Buscar o seleccionar..."
                        className="text-sm text-slate-700"
                        styles={{
                          control: (base) => ({
                            ...base,
                            minHeight: '38px',
                            borderColor: '#cbd5e1',
                            boxShadow: 'none',
                            '&:hover': { borderColor: '#3b82f6' }
                          })
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Nivel (Rango de Metraje)</label>
                      <select 
                        value={formData.NivelMetraje || ordenanzaData.nivelesMetraje[0]} 
                        onChange={e => setFormData({...formData, NivelMetraje: e.target.value})}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                      >
                        {ordenanzaData.nivelesMetraje.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-4 mb-2">
              <input 
                type="checkbox" 
                id="isCondominio" 
                checked={formData.isCondominio || false}
                onChange={e => setFormData({
                  ...formData, 
                  isCondominio: e.target.checked, 
                  cantidadInmuebles: e.target.checked ? (formData.cantidadInmuebles || 0) : 0,
                  locales: e.target.checked ? (formData.locales || []) : []
                })}
                className="w-4 h-4 text-blue-600 rounded border-slate-300" 
              />
              <label htmlFor="isCondominio" className="text-xs font-medium text-slate-700">Es un Condominio (Contiene múltiples inmuebles)</label>
            </div>

            {formData.isCondominio && (
              <div className="mb-4">
                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Cantidad de Locales / Apartamentos</label>
                 <input 
                   type="number" 
                   min="0"
                   max="200"
                   value={formData.cantidadInmuebles || 0}
                   onChange={handleCantidadChange}
                   className="w-32 border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" 
                 />
              </div>
            )}
            
            {formData.isCondominio && formData.cantidadInmuebles > 0 && (
              <div className="mt-4 border border-slate-200 rounded overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Desglose de Inmuebles ({formData.cantidadInmuebles})</h4>
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="checkbox" 
                      id="uniformConfig"
                      checked={formData.uniformConfig || false}
                      onChange={e => setFormData({...formData, uniformConfig: e.target.checked})}
                      className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="uniformConfig" className="text-[10px] font-medium text-slate-600 cursor-pointer uppercase tracking-wide">
                      Asignación Masiva
                    </label>
                  </div>
                </div>

                {formData.uniformConfig && (
                  <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex flex-wrap gap-4 items-end shadow-inner">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold text-blue-800 mb-1">Unificar Tipo de Residencia</label>
                      <select 
                        onChange={e => {
                          const val = e.target.value;
                          if(!val) return;
                          const newLocales = formData.locales.map((l: any) => ({
                            ...l,
                            tipoResidencia: l.uso === 'Residencial' ? val : l.tipoResidencia
                          }));
                          setFormData({...formData, locales: newLocales});
                        }}
                        className="w-full border border-blue-200 rounded px-2 py-1.5 text-xs outline-none text-blue-800 bg-white"
                      >
                        <option value="">-- Selecciona para aplicar a todos --</option>
                        {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                      </select>
                    </div>
                    {formData.Clasificacion !== 'Residencial' && (
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-[10px] font-bold text-blue-800 mb-1">Unificar Tamaño (Metraje Comercial)</label>
                        <select 
                          onChange={e => {
                            const val = e.target.value;
                            if(!val) return;
                            const newLocales = formData.locales.map((l: any) => ({
                              ...l,
                              nivel: l.uso === 'Comercial' ? val : l.nivel
                            }));
                            setFormData({...formData, locales: newLocales});
                          }}
                          className="w-full border border-blue-200 rounded px-2 py-1.5 text-xs outline-none text-blue-800 bg-white"
                        >
                          <option value="">-- Selecciona para aplicar a todos --</option>
                          {ordenanzaData.nivelesMetraje.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="max-h-[400px] overflow-y-auto p-4 space-y-4 bg-white">
                  {formData.locales?.map((local: any, index: number) => (
                    <div key={local.id || index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border border-slate-100 bg-slate-50 rounded items-end">
                       <div>
                         <label className="block text-[10px] font-medium text-slate-500 mb-1">Numeración / Identificador</label>
                         <input type="text" value={local.numeracion} onChange={e => {
                            const newLocales = [...formData.locales];
                            newLocales[index].numeracion = e.target.value;
                            setFormData({...formData, locales: newLocales});
                         }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none" />
                       </div>
                       <div>
                         <label className="block text-[10px] font-medium text-slate-500 mb-1">Uso</label>
                         <select 
                           value={local.uso} 
                           onChange={e => {
                              const newLocales = [...formData.locales];
                              newLocales[index].uso = e.target.value;
                              if(e.target.value === 'Residencial') newLocales[index].actividad = '';
                              setFormData({...formData, locales: newLocales});
                           }} 
                           className={`w-full border rounded px-2 py-1.5 text-xs outline-none ${formData.Clasificacion !== 'Mixto' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'border-slate-300 text-slate-700'}`}
                           disabled={formData.Clasificacion !== 'Mixto'}
                         >
                           {(formData.Clasificacion === 'Residencial' || formData.Clasificacion === 'Mixto') && <option value="Residencial">Residencial</option>}
                           {(formData.Clasificacion === 'Comercial' || formData.Clasificacion === 'Industrial' || formData.Clasificacion === 'Mixto') && <option value="Comercial">Comercial</option>}
                         </select>
                       </div>
                       <div>
                         <label className="block text-[10px] font-medium text-slate-500 mb-1">Estatus</label>
                         <select value={local.estatus} onChange={e => {
                            const newLocales = [...formData.locales];
                            newLocales[index].estatus = e.target.value;
                            if(e.target.value === 'Desocupado') newLocales[index].actividad = '';
                            setFormData({...formData, locales: newLocales});
                         }} className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none">
                           <option value="Desocupado">Desocupado</option>
                           <option value="Ocupado">Ocupado</option>
                         </select>
                       </div>
                       <div className="min-w-[150px]">
                         {local.uso === 'Comercial' ? (
                           <>
                             {local.estatus === 'Ocupado' ? (
                               <div className="mb-2">
                                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Actividad Comercial</label>
                                 <Select
                                   options={todasLasActividades.map(a => ({ value: a.label, label: a.label }))}
                                   value={local.actividad ? { value: local.actividad, label: local.actividad } : null}
                                   onChange={(selected: any) => {
                                     const newLocales = [...formData.locales];
                                     newLocales[index].actividad = selected?.value || '';
                                     setFormData({...formData, locales: newLocales});
                                   }}
                                   placeholder="Actividad..."
                                   className="text-xs"
                                   styles={{
                                     control: (base) => ({...base, minHeight: '30px', fontSize: '0.75rem'}),
                                     menuList: (base) => ({...base, maxHeight: '150px'})
                                   }}
                                   menuPosition="fixed"
                                 />
                               </div>
                             ) : (
                               <div className="mb-2">
                                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Actividad Comercial</label>
                                 <div className="h-[30px] flex items-center px-2 text-[10px] bg-slate-100 text-slate-500 rounded border border-slate-200">
                                   Inmueble desocupado (vacío)
                                 </div>
                               </div>
                             )}
                             <div>
                               <label className="block text-[10px] font-medium text-slate-500 mb-1">Nivel (Metraje)</label>
                               <select 
                                 value={local.nivel || ordenanzaData.nivelesMetraje[0]} 
                                 onChange={e => {
                                    const newLocales = [...formData.locales];
                                    newLocales[index].nivel = e.target.value;
                                    setFormData({...formData, locales: newLocales});
                                 }}
                                 className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none"
                               >
                                 {ordenanzaData.nivelesMetraje.map(n => <option key={n} value={n}>{n}</option>)}
                               </select>
                             </div>
                           </>
                         ) : (
                           <div className="h-full flex flex-col items-start justify-center pt-2">
                             <label className="block text-[10px] font-medium text-slate-500 mb-1">Tipo de Residencia</label>
                             <select 
                               value={local.tipoResidencia || ordenanzaData.tiposResidenciales[0].label} 
                               onChange={e => {
                                  const newLocales = [...formData.locales];
                                  newLocales[index].tipoResidencia = e.target.value;
                                  setFormData({...formData, locales: newLocales});
                               }}
                               className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none"
                             >
                               {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                             </select>
                           </div>
                         )}
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Notas (Solo Edición) */}
          {!isNew && (
            <>
              <div className="bg-yellow-50 border-y border-yellow-200 px-4 py-2 mt-4">
                <h2 className="text-[10px] font-bold text-yellow-800 uppercase tracking-wide">
                  Notas Adicionales
                </h2>
              </div>
              <div className="p-6">
                <p className="text-[10px] text-slate-500 mb-2">
                  (Requerido obligatoriamente si se cambia la Actividad Comercial o Tipo de Residencia)
                </p>
                <textarea
                  value={formData.Notas_Adicionales || ''}
                  onChange={e => setFormData({ ...formData, Notas_Adicionales: e.target.value })}
                  rows={3}
                  placeholder="Ingrese cualquier observación o motivo de modificación..."
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-yellow-500"
                />
              </div>
            </>
          )}
          
          {/* Section: Datos de Seguridad */}
          <div className="bg-purple-100 border-y border-purple-200 px-4 py-2 mt-4">
            <h2 className="text-[10px] font-bold text-slate-800 uppercase tracking-wide">
              Datos de Seguridad
            </h2>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mb-8">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Clave</label>
                <input type="password" placeholder="Clave" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Confirmar Clave</label>
                <input type="password" placeholder="Confirmar Clave" className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500" />
              </div>
            </div>

            {!isNew && (
              <div className="flex gap-4 mb-8 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Está seguro que desea DESACTIVAR este usuario? No podrá ingresar al portal.')) {
                      alert('Usuario desactivado exitosamente (Simulación).');
                    }
                  }}
                  className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-4 py-2 rounded text-xs font-bold transition-colors"
                >
                  Desactivar Acceso
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    if (window.confirm('ALERTA CRÍTICA: ¿Está absolutamente seguro de ELIMINAR este usuario y todo su historial de forma permanente?')) {
                      alert('Función de eliminación bloqueada por seguridad. Requiere permisos de Super Administrador.');
                    }
                  }}
                  className="bg-red-100 text-red-700 hover:bg-red-200 px-4 py-2 rounded text-xs font-bold transition-colors"
                >
                  Eliminar Usuario Definitivamente
                </button>
              </div>
            )}
            
            {/* INLINE CONDOMINIO UNITS */}
            {!isNew && formData.Clasificacion === 'Condominio' && formData.id && (
              <div className="mb-6">
                <UnidadesModal
                  isInline={true}
                  condominioId={formData.id}
                  condominioNombre={formData.Contribuyente}
                  condominioIdentidad={formData.Identidad}
                />
              </div>
            )}
            
            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={calcularTarifa}
                disabled={isCalculating}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2 rounded text-xs font-semibold transition-colors flex items-center gap-2 border border-slate-300"
              >
                {isCalculating ? 'Calculando...' : 'Calcular Tarifa Mensual'}
              </button>
              
              <button type="submit" disabled={isSaving} className="border border-orange-500 text-orange-500 hover:bg-orange-50 disabled:opacity-50 px-6 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2">
                <Plus className="w-3 h-3" /> {isSaving ? 'Guardando...' : (isNew ? 'Agregar Contribuyente' : 'Actualizar Contribuyente')}
              </button>
            </div>
            
            {showCalculation && calculoDetalle && (
              <div className="mt-6 bg-slate-50 border border-slate-200 rounded p-4 animate-in fade-in slide-in-from-bottom-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4 text-slate-500" /> Detalle de Cálculo de Aseo Urbano
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 bg-white p-3 border border-slate-100 rounded">
                  <div>
                    <p className="mb-1"><span className="font-semibold text-slate-700">Clasificación:</span> {calculoDetalle.leyenda}</p>
                    <p className="mb-1"><span className="font-semibold text-slate-700">Factor Ordenanza (F.O.):</span> {calculoDetalle.factor}</p>
                  </div>
                  <div>
                    <p className="mb-1"><span className="font-semibold text-slate-700">Tasa de Cambio Oficial:</span> {bcvRate} Bs/EUR</p>
                    <p className="text-[10px] text-slate-400 italic mb-1">Fuente: {calculoDetalle.fuente} al {new Date().toLocaleDateString()}</p>
                  </div>
                  <div className="md:col-span-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                    <p className="text-xs font-medium">Fórmula: {calculoDetalle.factor} × {bcvRate} Bs</p>
                    <div className="flex items-center gap-4">
                      <p className="text-lg font-bold text-green-700">Total Mensual: Bs. {calculoDetalle.totalBs}</p>
                      {!isNew && (
                        <button 
                          type="button" 
                          onClick={() => setIsDebtModalOpen(true)}
                          className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Edit className="w-3.5 h-3.5" /> Ajustar Deuda (Ordenanza)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                {calculoDetalle.desglose && calculoDetalle.desglose.length > 0 && (
                  <div className="mt-4 border border-slate-200 rounded overflow-hidden shadow-sm">
                    <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Desglose Detallado por Inmueble</span>
                      <span className="text-[10px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">{calculoDetalle.desglose.length} registros</span>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto bg-white">
                      <table className="w-full text-left text-[10px] text-slate-600">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                          <tr>
                            <th className="px-3 py-2 font-semibold border-r border-slate-100">N° Local / Identificador</th>
                            <th className="px-3 py-2 font-semibold border-r border-slate-100">Concepto / Clasificación</th>
                            <th className="px-3 py-2 font-semibold text-right border-r border-slate-100 w-20">Base (Bs)</th>
                            <th className="px-3 py-2 font-semibold text-right border-r border-slate-100 w-20">IVA</th>
                            <th className="px-3 py-2 font-semibold text-right text-green-700 w-24">Total (Bs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calculoDetalle.desglose.map((item: any, i: number) => (
                            <tr key={i} className="border-b border-slate-100 hover:bg-blue-50 transition-colors">
                              <td className="px-3 py-2 font-bold border-r border-slate-100 text-slate-800">{item.numeracion}</td>
                              <td className="px-3 py-2 truncate max-w-[200px] border-r border-slate-100">{item.leyenda}</td>
                              <td className="px-3 py-2 text-right border-r border-slate-100">{item.baseBs || Number(item.montoBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                              <td className="px-3 py-2 text-right border-r border-slate-100">{item.ivaBs ? (item.esRes ? 'Exento' : item.ivaBs) : 'Exento'}</td>
                              <td className="px-3 py-2 text-right font-bold text-green-700 bg-green-50/30">{Number(item.montoBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* MODAL DE AJUSTE DE DEUDA */}
        {isDebtModalOpen && calculoDetalle && formData && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
              <div className="bg-slate-800 p-4 flex items-center justify-between">
                <h2 className="text-white font-bold flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-orange-400" />
                  Ajustar Deuda del Contribuyente
                </h2>
                <button onClick={() => setIsDebtModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-2">
                  <p className="text-sm"><span className="font-semibold text-slate-700">Contribuyente:</span> {formData.Contribuyente} ({formData.Identidad})</p>
                  <p className="text-sm"><span className="font-semibold text-slate-700">Clasificación:</span> {calculoDetalle.leyenda}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-blue-50 p-3 rounded border border-blue-100">
                    <span className="text-sm font-semibold text-blue-800">Tarifa Mensual (UCD):</span>
                    <span className="font-bold text-blue-900 text-lg">{calculoDetalle.factor.toFixed(2)}</span>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Meses a adeudar (Morosidad Ajustada)</label>
                    <input 
                      type="number" 
                      min="0"
                      value={debtMonths} 
                      onChange={(e) => setDebtMonths(Number(e.target.value))}
                      className="w-full border-2 border-slate-200 rounded-lg px-4 py-2 font-semibold text-slate-700 focus:border-orange-500 outline-none"
                    />
                  </div>



                  <div className="flex justify-between items-center bg-orange-50 p-4 rounded-lg border border-orange-200 shadow-inner">
                    <span className="font-bold text-orange-800">Nueva Deuda Total:</span>
                    <div className="text-right">
                      <span className="block font-black text-orange-600 text-2xl">{(calculoDetalle.factor * debtMonths).toFixed(2)} UCD</span>
                      <span className="block text-xs font-semibold text-orange-700 mt-1">â‰ˆ Bs. {(calculoDetalle.factor * debtMonths * (bcvRate ? parseFloat(bcvRate.replace(',', '.')) : 1)).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-amber-50 p-3 rounded border border-amber-200">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed font-medium">
                    Al confirmar, se **borrarán todos los recibos (recibos) pendientes** actuales de este usuario y se generará un **único recibo nuevo** con el monto total ajustado.
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => setIsDebtModalOpen(false)}
                    className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleAjustarDeuda}
                    disabled={isProcessingDebt}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 flex justify-center"
                  >
                    {isProcessingDebt ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirmar Ajuste'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const columns = [
    { 
      key: 'cod_cont', 
      header: 'Código',
      render: (row: any) => {
        const rawCodes = (row.CodCont || row.cod_cont || '').trim().split(/\s+/).filter(Boolean);
        const mainCode = rawCodes[0] || row.cod_cont || 'N/A';
        const otherCount = rawCodes.length - 1;
        const isCondo = Boolean(row.isCondominio || row.es_condominio);
        const isChild = Boolean(row.isCondoChild);

        return (
          <div className="flex flex-col">
            <span className="font-bold text-slate-800 tracking-tight">{mainCode}</span>
            {isCondo && (
              <span 
                className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded border border-purple-200 mt-0.5 inline-flex items-center gap-1 w-fit shadow-2xs"
                title={`Condominio con ${row.unidadesCount || row.cant_inmuebles || 1} locales/unidades registradas`}
              >
                🏢 {row.unidadesCount || row.cant_inmuebles || 1} locales
              </span>
            )}
            {isChild && (
              <span 
                className="text-[9px] bg-amber-50 text-amber-700 font-semibold px-1.5 py-0.5 rounded border border-amber-200 mt-0.5 inline-block w-fit"
                title={`Filial de: ${row.condominio_padre_nombre || row.condominio_padre_id}`}
              >
                Filial de {row.condominio_padre_id}
              </span>
            )}
            {!isCondo && otherCount > 0 && (
              <span 
                className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded border border-blue-200 mt-0.5 inline-block w-fit cursor-help shadow-2xs"
                title={`Inmuebles vinculados: ${rawCodes.join(', ')}`}
              >
                +{otherCount} {otherCount === 1 ? 'inmueble' : 'inmuebles'} ({rawCodes.slice(1, 3).join(', ')}{otherCount > 2 ? '...' : ''})
              </span>
            )}
          </div>
        );
      }
    },
    { key: 'Identidad', header: 'R.I.F. / Cédula' },
    {
      key: 'Contribuyente',
      header: 'Nombre / Razón Social',
      render: (row: any) => {
        const isCondo = Boolean(row.isCondominio || row.es_condominio);
        const isChild = Boolean(row.isCondoChild);
        return (
          <div>
            <div className="font-medium text-slate-800 flex items-center gap-1.5 flex-wrap">
              <span>{row.Contribuyente}</span>
              {isCondo && (
                <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                  Condominio Padre
                </span>
              )}
            </div>
            {isChild && (
              <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5 font-medium">
                🏢 Local en: {row.condominio_padre_nombre || row.condominio_padre_id}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'FechaRegistro',
      header: 'Registro',
      render: (row: any) => {
        const fecha = row.FechaRegistro || row.created_at;
        if (!fecha) return <span className="text-[10px] text-slate-400">N/D</span>;
        const d = new Date(fecha);
        const now = new Date();
        const isNew = (now.getTime() - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
        return (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-600">{d.toLocaleDateString('es-VE')}</span>
            {isNew && <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1 rounded mt-0.5">NUEVO</span>}
          </div>
        );
      }
    },
    {
      key: 'Clasificacion',
      header: 'Clasificación',
      render: (row: any) => {
        const clase = row.Clasificacion || 'Residencial';
        const isChild = Boolean(row.isCondoChild);
        const detalle = clase.includes('Comercial') ? row.ActividadComercial : (row.TipoResidencia || 'No asignado');
        return (
          <div className="flex flex-col">
            <span className={`text-xs font-semibold ${clase === 'Residencial' ? 'text-emerald-600' : 'text-blue-600'}`}>
              {clase} {isChild ? '(Filial)' : ''}
            </span>
            <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{detalle}</span>
            {isChild && row.isCommercialChild && (
              <div className="text-[9px] text-slate-500 mt-0.5">
                Aseo: <span className="text-blue-600 font-medium">Por Condominio</span>
                {row.MultaBs > 0 && <span className="text-amber-700 font-bold ml-1">• Multa: Bs. {row.MultaBs.toFixed(2)}</span>}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'Direccion',
      header: 'Dirección',
      render: (row: any) => (
        <div>
          <p className="text-[10px] text-slate-600 line-clamp-2 max-w-[200px]">{row.Direccion}</p>
          {row.coordenadas && (
            <a href={`https://www.google.com/maps?q=${row.coordenadas.lat},${row.coordenadas.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-1 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
              <MapPin size={10} />
              Ver Mapa
            </a>
          )}
        </div>
      )
    },
    { key: 'Telefono', header: 'Teléfono' },
    { key: 'Correo', header: 'Correo Electrónico' },
    {
      key: 'actions',
      header: 'Acciones / Estatus',
      render: (row: any) => {
        const cleanIdent = (row.Identidad || '').replace(/-/g,'').toUpperCase();

        // 1. Facturas pendientes
        const pendFacturas = (recibos || []).filter((f: any) =>
          (f.identidad || '').replace(/-/g,'').toUpperCase() === cleanIdent &&
          ['Pendiente','Abonado','Por Verificar'].includes(f.estado)
        );
        const debtFacturasAmount = pendFacturas.reduce((s: number, f: any) => s + parseFloat(String(f.monto || '0').replace(/[^\d.]/g,'')), 0);

        // 2. Inmuebles asociados y verificación de mora en padrón
        const userInms = (inmuebles || []).filter((i: any) =>
          (i.identidad || '').replace(/-/g,'').toUpperCase() === cleanIdent
        );
        const inmsConMora = userInms.filter((i: any) =>
          parseInt(String(i.meses_deuda || '0'), 10) > 0 ||
          parseFloat(String(i.deuda_mmv || '0')) > 0 ||
          parseFloat(String(i.deuda_congelada_bs || '0')) > 0
        );

        const hasDebt = pendFacturas.length > 0 || inmsConMora.length > 0;
        const totalMesesDeuda = inmsConMora.reduce((max: number, i: any) => Math.max(max, parseInt(String(i.meses_deuda || 0), 10)), 0);
        const debtDesc = pendFacturas.length > 0
          ? `Deuda pendiente: Bs. ${debtFacturasAmount.toFixed(2)} (${pendFacturas.length} recibos)`
          : `Deuda pendiente: ${totalMesesDeuda} meses acumulados`;

        const hasAgreement = (convenios || []).some((conv: any) =>
          (conv.identidad || '').replace(/-/g,'').toUpperCase() === cleanIdent &&
          conv.estado === 'Al Día'
        );
        const isCondo = Boolean(row.isCondominio || row.es_condominio || (row.unidadesCount && row.unidadesCount > 1));

        return (
          <div className="flex gap-2 items-center">
            {isCondo && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCondominioModal({
                    id: row.id || 1,
                    nombre: row.Contribuyente,
                    identidad: row.Identidad,
                    codigoPadre: (row.CodCont || row.cod_cont || '').trim().split(/\s+/)[0]
                  });
                }}
                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 p-1.5 rounded transition-colors"
                title={`Ver las ${row.unidadesCount || row.cant_inmuebles || ''} Unidades / Locales del Condominio`}
              >
                <Building className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => { setViewData(row); setIsViewModalOpen(true); }}
              className="bg-blue-50 text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors"
              title="Ver Detalles"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleEdit(row)}
              className="bg-slate-100 text-slate-600 hover:bg-slate-200 p-1.5 rounded transition-colors"
              title="Editar"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button 
              onClick={() => { setSelectedDebtRow(row); setDebtModalOpen(true); }}
              className="bg-orange-50 text-orange-600 hover:bg-orange-100 p-1.5 rounded transition-colors"
              title="Ajustar Deuda"
            >
              <Calculator className="w-4 h-4" />
            </button>
            <button 
              onClick={() => { setSelectedExonerarRow(row); setExonerarModalOpen(true); }}
              className="bg-rose-50 text-rose-600 hover:bg-rose-100 p-1.5 rounded transition-colors"
              title="Eliminar / Exonerar Multas por Mes (Requiere clave dzara)"
            >
              <Percent className="w-4 h-4" />
            </button>
            {hasDebt ? (
              <button 
                className="bg-red-50 text-red-600 p-1.5 rounded cursor-default"
                title={debtDesc}
              >
                <DollarSign className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const isCondoCheck = (row.CantidadInmuebles && parseInt(row.CantidadInmuebles) > 1) || 
                                       (row.Contribuyente && row.Contribuyente.toUpperCase().includes('CONDOMINIO'));
                  
                  if (isCondoCheck) {
                    // Open view modal to let them select specific unit
                    setViewData(row);
                    setIsViewModalOpen(true);
                  } else {
                    generarSolvenciaIndividual(row, 'general');
                  }
                }}
                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-1.5 rounded transition-colors flex items-center gap-1"
                title="Descargar Solvencia"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <button 
              className={`${hasAgreement ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-slate-50 text-slate-400 cursor-default'} p-1.5 rounded transition-colors`}
              title={hasAgreement ? 'Tiene convenio activo' : 'Sin convenios'}
            >
              <Handshake className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeactivate(row)}
              className="bg-amber-50 text-amber-600 hover:bg-amber-100 p-1.5 rounded transition-colors"
              title="Desactivar Contribuyente"
            >
              <Power className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(row)}
              className="bg-red-50 text-red-600 hover:bg-red-100 p-1.5 rounded transition-colors"
              title="Eliminar Contribuyente"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
    }
  ];

  const inactiveColumns = [
    { 
      key: 'cod_cont', 
      header: 'Código',
      render: (row: any) => {
        const rawCodes = (row.CodCont || row.cod_cont || '').trim().split(/\s+/).filter(Boolean);
        const mainCode = rawCodes[0] || row.cod_cont || 'N/A';
        const otherCount = rawCodes.length - 1;

        return (
          <div className="flex flex-col">
            <span className="font-bold text-slate-800 tracking-tight">{mainCode}</span>
            {otherCount > 0 && (
              <span 
                className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.5 rounded border border-slate-200 mt-0.5 inline-block w-fit cursor-help shadow-2xs"
                title={`Inmuebles vinculados: ${rawCodes.join(', ')}`}
              >
                +{otherCount} {otherCount === 1 ? 'inmueble' : 'inmuebles'} ({rawCodes.slice(1, 3).join(', ')}{otherCount > 2 ? '...' : ''})
              </span>
            )}
          </div>
        );
      }
    },
    { key: 'Identidad', header: 'R.I.F. / Cédula' },
    { key: 'Contribuyente', header: 'Nombre / Razón Social' },
    {
      key: 'Estado',
      header: 'Estatus',
      render: (row: any) => (
        <span className={`px-2 py-1 rounded text-[10px] font-bold ${row.Estado === 'Eliminado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
          {row.Estado}
        </span>
      )
    },
    {
      key: 'Motivo',
      header: 'Motivo de Baja',
      render: (row: any) => {
        const auditLog = auditLogs?.find((log: any) => 
          (log.action === 'ELIMINAR_CONTRIBUYENTE' || log.action === 'DESACTIVAR_CONTRIBUYENTE') && 
          log.details.includes(row.Identidad)
        );
        let motivo = 'No registrado';
        if (auditLog) {
          try {
            const parsed = JSON.parse(auditLog.details);
            motivo = parsed.motivo || motivo;
          } catch(e) {}
        }
        return <p className="text-[10px] text-slate-600 italic max-w-[250px] line-clamp-3">{motivo}</p>;
      }
    }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Listado de Contribuyentes
          </h1>
          {(() => {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const newThisMonth = contribuyentes.filter((c: any) => {
              const fecha = c.FechaRegistro || c.created_at;
              if (!fecha) return false;
              return new Date(fecha) >= startOfMonth;
            }).length;
            if (newThisMonth > 0) return (
              <span className="bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full">
                +{newThisMonth} este mes
              </span>
            );
            return null;
          })()}
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSyncBD} 
            disabled={isSyncing}
            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            title="Recargar datos frescos directamente desde la base de datos Supabase"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> 
            {isSyncing ? 'Sincronizando...' : 'Sincronizar BD'}
          </button>
          <button onClick={exportarExcelContribuyentes} className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
            <Download className="w-4 h-4" /> Exportar a Excel
          </button>
          <button onClick={handleAdd} className="bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Nuevo Registro
          </button>
        </div>
      </div>

      {/* Tabs y Filtros */}
      <div className="flex items-center justify-between border-b border-slate-200 mt-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('Activos')}
            className={`pb-2 px-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'Activos' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Activos
          </button>
          <button
            onClick={() => setActiveTab('Inactivos')}
            className={`pb-2 px-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'Inactivos' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Usuarios Inactivos / Eliminados
          </button>
        </div>
        
        <div className="flex items-center gap-4 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="showNotesToggle"
              checked={showWithNotes}
              onChange={(e) => setShowWithNotes(e.target.checked)}
              className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="showNotesToggle" className="text-sm font-medium text-amber-700 cursor-pointer select-none flex items-center gap-1">
              Solo mostrar con Notas Históricas
            </label>
          </div>

          <div className="flex items-center gap-2 bg-indigo-50/70 border border-indigo-200/80 px-3 py-1 rounded-lg">
            <input 
              type="checkbox" 
              id="groupCondoToggle"
              checked={groupCondoChildren}
              onChange={(e) => setGroupCondoChildren(e.target.checked)}
              className="rounded border-indigo-400 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="groupCondoToggle" className="text-xs font-semibold text-indigo-900 cursor-pointer select-none flex items-center gap-1.5">
              <span>🏢 Agrupar filiales en Condominio Padre</span>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">
                {groupCondoChildren ? 'Ocultando locales hijos' : 'Mostrando todo'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Buscador de Inmuebles y Contribuyentes en BD */}
      <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <input
              type="text"
              value={serverSearchTerm}
              onChange={(e) => {
                setServerSearchTerm(e.target.value);
                if (!e.target.value.trim()) setIsShowingServerResults(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleServerSearch()}
              placeholder="Buscar directamente en la BD por Código de Inmueble (ej. URB004206), Cédula/RIF o Razón Social..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-xs md:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
          <button
            onClick={handleServerSearch}
            disabled={isSearchingServer || !serverSearchTerm.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs md:text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {isSearchingServer ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Buscar en BD</span>
          </button>
          {isShowingServerResults && (
            <button
              onClick={() => {
                setIsShowingServerResults(false);
                setServerSearchTerm('');
              }}
              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Ver todos ({contribuyentes.length})
            </button>
          )}
        </div>
        {isShowingServerResults && (
          <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
            {serverResults.length} {serverResults.length === 1 ? 'resultado encontrado' : 'resultados encontrados'} en la BD
          </span>
        )}
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm mt-4 overflow-hidden">
        <DataTable data={filteredContribuyentes} columns={activeTab === 'Activos' ? columns : inactiveColumns} itemsPerPage={15} />
      </div>

      {isViewModalOpen && viewData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Detalles del Contribuyente
              </h3>
              <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">R.I.F. / Cédula</span>
                  <p className="text-sm font-semibold text-slate-700">{viewData.Identidad}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Razón Social</span>
                  <p className="text-sm font-semibold text-slate-700">{viewData.Contribuyente}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Teléfono</span>
                  <p className="text-sm font-semibold text-slate-700">{viewData.Telefono || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Correo Electrónico</span>
                  <p className="text-sm font-semibold text-slate-700">{viewData.Correo || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Dirección</span>
                  <p className="text-sm font-medium text-slate-700">{viewData.Direccion || 'N/A'}</p>
                </div>
                {viewData.Observaciones && (
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 col-span-2">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1 block">Observaciones Históricas (Sistema Anterior)</span>
                    <p className="text-sm font-medium text-amber-900 whitespace-pre-wrap">{viewData.Observaciones}</p>
                  </div>
                )}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 col-span-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Actividad Económica / Clasificación</span>
                  <p className="text-sm font-semibold text-slate-700">{viewData.Actividad || 'N/A'}</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 col-span-1">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 block">Saldo a Favor</span>
                  <p className="text-lg font-black text-emerald-700">Bs. {viewData.SaldoFavor ? Number(viewData.SaldoFavor).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0,00'}</p>
                </div>
              </div>
              
              {/* Ficha de Censo Inmobiliario */}
              {(() => {
                const userInms = inmuebles.filter((i: any) =>
                  (i.identidad || '').replace(/-/g,'').toUpperCase() === (viewData?.Identidad || '').replace(/-/g,'').toUpperCase()
                );
                
                if (userInms.length === 0) return null;
                
                return (
                  <div className="mt-6 bg-slate-50 border border-slate-200 rounded p-4">
                    <h4 className="font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2 text-xs">
                      <FileText className="w-4 h-4 text-slate-500" /> Ficha del Censo Inmobiliario
                    </h4>
                    <div className="space-y-3">
                      {userInms.map((inm: any, idx: number) => (
                        <div key={idx} className="bg-white p-3 rounded border border-slate-200 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="col-span-2 md:col-span-4 border-b border-slate-100 pb-2 mb-1 flex items-center justify-between">
                            <span className="font-bold text-blue-700">{inm.inmueble || inm.cod_cont || `Inmueble ${idx+1}`}</span>
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">{inm.tipo || 'N/A'}</span>
                          </div>
                          
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Clasificación / Tipo</span>
                            <span className="font-medium text-slate-700">{inm.tipo || 'INDEPENDIENTE'}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Jerarquía</span>
                            <span className="font-medium text-slate-700 truncate block" title={inm.actividad_principal}>{inm.actividad_principal || 'N/A'}</span>
                          </div>
                          <div className="col-span-2 md:col-span-4 border-t border-slate-100 mt-1 pt-2">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Actividad Económica (Nietos)</span>
                            <div className="mt-1">
                              {inm.actividad_economica_id && String(inm.actividad_economica_id) !== '0' ? (
                                <div className="flex flex-wrap gap-1">
                                  {String(inm.actividad_economica_id).split(',').map((actId: string) => (
                                    <span key={actId} className="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase rounded border border-emerald-200">
                                      {/* @ts-ignore */}
                                      {economicActivitiesBase[actId] || 'Nieto Desconocido'}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="font-medium text-slate-500 text-xs">-</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Metraje (m²)</span>
                            <span className="font-medium text-slate-700">{inm.area || inm.area_operativa || 'N/A'} m²</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Estatus</span>
                            <span className="font-medium text-slate-700">{inm.estado || 'Vigente'}</span>
                          </div>
                          <div className="col-span-2 md:col-span-4 pt-1">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Dirección</span>
                            <span className="font-medium text-slate-700">{inm.direccion || 'No especificada'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              
              {viewCalculo && (
                <div className="mt-6 bg-slate-50 border border-slate-200 rounded p-4">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2 text-xs">
                    <Building className="w-4 h-4 text-slate-500" /> Cálculo Mensual de Aseo Urbano
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 bg-white p-3 border border-slate-100 rounded">
                    <div>
                      <p className="mb-1"><span className="font-semibold text-slate-700">Clasificación:</span> {viewCalculo.leyenda}</p>
                      <p className="mb-1"><span className="font-semibold text-slate-700">Factor Ordenanza (F.O.):</span> {Number(viewCalculo.factor).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="mb-1"><span className="font-semibold text-slate-700">Tasa de Cambio Oficial:</span> {Number(viewCalculo.tasaBcv || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:4})} Bs</p>
                      {viewCalculo.esResidencial && (
                        <p className="mb-1 text-xs text-emerald-700 font-bold">Exento de IVA (0%)</p>
                      )}
                    </div>
                    <div className="md:col-span-2 pt-2 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <p className="text-xs font-medium text-slate-600">
                        Fórmula: <span className="font-mono text-slate-800">{viewCalculo.formulaTexto || `${viewCalculo.factor} × ${Number(viewCalculo.tasaBcv || 0).toFixed(2)} Bs`}</span>
                      </p>
                      <p className="text-lg font-black text-emerald-700">
                        Total Mensual: Bs. {Number(viewCalculo.totalBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                      </p>
                    </div>
                  </div>
                  
                  {viewCalculo.desglose && viewCalculo.desglose.length > 0 && (
                    <div className="mt-4 border border-slate-200 rounded overflow-hidden shadow-sm">
                      <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Desglose por Inmueble</span>
                      </div>
                      <div className="max-h-[150px] overflow-y-auto bg-white">
                        <table className="w-full text-left text-[10px] text-slate-600">
                          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 font-semibold">N° Local / Identificador</th>
                              <th className="px-3 py-2 font-semibold">Concepto / Clasificación</th>
                              <th className="px-3 py-2 font-semibold text-right">Base (Bs)</th>
                              <th className="px-3 py-2 font-semibold text-right">IVA</th>
                              <th className="px-3 py-2 font-semibold text-right text-green-700">Total (Bs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {viewCalculo.desglose.map((item: any, i: number) => (
                              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="px-3 py-2 font-bold text-slate-800">{item.numeracion}</td>
                                <td className="px-3 py-2">{item.leyenda}</td>
                                <td className="px-3 py-2 text-right">{item.baseBs || Number(item.montoBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                <td className="px-3 py-2 text-right">{item.ivaBs ? (item.esRes ? 'Exento' : item.ivaBs) : 'Exento'}</td>
                                <td className="px-3 py-2 text-right font-bold text-green-700">{Number(item.montoBs || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-red-600" />
                    <h4 className="font-bold text-red-800">Estado de Cuenta (Deuda Actual)</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setSelectedExonerarRow(viewData);
                        setExonerarModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      title="Eliminar / Exonerar Multas por Mes"
                    >
                      <Percent className="w-3.5 h-3.5" /> Exonerar Multas
                    </button>
                    <button 
                      onClick={imprimirEstadoDeCuenta}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                    >
                      <FileText className="w-4 h-4" /> Exportar PDF
                    </button>
                  </div>
                </div>
                <div className="p-0">
                  {(() => {
                    // Usar recibos frescas de Supabase y asegurar orden cronológico
                    const deudas = [...viewFacturasDb].sort((a: any, b: any) => {
                      const dA = new Date(a.emision || '1900-01-01').getTime();
                      const dB = new Date(b.emision || '1900-01-01').getTime();
                      return dA - dB;
                    });

                    // Helper: para CM- recalcular con tasa BCV actual (fluctúa cada día)
                    // Para RECIB- usar monto guardado (deuda acumulada ajustada por Ajustar Deuda)
                    const userInms = inmuebles.filter((i: any) =>
                      (i.identidad || '').replace(/-/g,'').toUpperCase() === (viewData?.Identidad || '').replace(/-/g,'').toUpperCase()
                    );
                    const getMontoActual = (f: any): number => {
                      if (f.estado === 'Abonado') return parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
                      let base = parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
                      if (f.referencia?.startsWith('RECIB-HIST-')) {
                        const parts = f.referencia.split('-');
                        const inmId = parts[2];
                        const mNum = parseInt(parts[3]?.replace('M', '') || '0');
                        const matchedInm = userInms.find((inm: any) => inm.inmueble === inmId);
                        if (matchedInm && tcmmv > 0) {
                          const esRes = isResidencialInm(matchedInm);
                          const bm = parseFloat(calcularMensualidad(matchedInm, tcmmv).toFixed(2));
                          const iva = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
                          
                          // REGLA OFICIAL: El último mes de la factura es SIN multa.
                          // Solo los meses anteriores acumulan recargo por mora (10% res / 12% com).
                          const totalMeses = Math.max(1, parseInt(matchedInm.meses_deuda || '1'));
                          const isUltimoMes = mNum > 0 ? (mNum >= totalMeses) : false;

                          const emision = f.emision ? new Date(f.emision) : new Date();
                          const today = new Date();
                          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
                          const notasLower = (matchedInm.notas || '').toLowerCase();
                          const isExonerado = notasLower.includes('exonerad') || notasLower.includes('sin multa') || notasLower.includes('sin multas');
                          const tieneMora = (!isUltimoMes && monthsDiff > 1 && !isExonerado);
                          const multa = tieneMora ? parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
                          base = bm + iva + multa;
                        }
                      } else if (f.referencia?.startsWith('CM-')) {
                        // Buscar el inmueble que corresponde a esta factura por código en la referencia
                        const matchedInm = userInms.find((inm: any) =>
                          (inm.inmueble && f.referencia.includes(inm.inmueble)) ||
                          (inm.cod_cont && f.referencia.includes(inm.cod_cont))
                        );
                        const targetInm = matchedInm || (userInms.length === 1 ? userInms[0] : null);
                        if (targetInm && tcmmv > 0) {
                          const esRes = isResidencialInm(targetInm);
                          const bm = parseFloat(calcularMensualidad(targetInm, tcmmv).toFixed(2));
                          const iva = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
                          
                          // Verificar si es el último mes facturado
                          const allCmForInm = deudas.filter((d: any) =>
                            d.referencia?.startsWith('CM-') &&
                            ((targetInm.inmueble && d.referencia.includes(targetInm.inmueble)) || (targetInm.cod_cont && d.referencia.includes(targetInm.cod_cont)))
                          );
                          const emision = f.emision ? new Date(f.emision) : new Date();
                          const today = new Date();
                          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
                          const isUltimoCm = allCmForInm.length <= 1 || allCmForInm[allCmForInm.length - 1]?.referencia === f.referencia || monthsDiff <= 1;
                          const notasLower = (targetInm.notas || '').toLowerCase();
                          const isExonerado = notasLower.includes('exonerad') || notasLower.includes('sin multa') || notasLower.includes('sin multas');
                          const tieneMora = (!isUltimoCm && monthsDiff > 1 && !isExonerado);
                          const multa = tieneMora ? parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
                          base = bm + iva + multa;
                        }
                      }
                      
                      // Descontar pagos en proceso (Por Verificar)
                      let montoPendiente = 0;
                      viewPagos.filter((p: any) => p.estado === 'Por Verificar').forEach((p: any) => {
                        let det: any = {};
                        try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch(e){}
                        const refs: string[] = det.recibos || [];
                        if (refs.includes(f.referencia)) {
                          const montoPago = parseFloat(String(p.monto || '0').replace(/[^\d.]/g, '')) || 0;
                          if (refs.length > 0) montoPendiente += (montoPago / refs.length);
                        }
                      });

                      return Math.max(0, base - montoPendiente);
                    };

                    const totalBs = deudas.reduce((acc: number, f: any) => acc + getMontoActual(f), 0);


                    // Calcular deuda acumulada directamente del inmueble (puede existir sin facturas)
                    const deudaInmuebleBs = userInms.reduce((sum: number, inm: any) => {
                      const meses = Math.max(0, parseInt(inm.meses_deuda || 0));
                      const esRes = isResidencialInm(inm);
                      const baseUnMes = calcularMensualidad(inm, tcmmv);
                      const iva = esRes ? 0 : (baseUnMes * 0.16);
                      const notasLower = (inm.notas || '').toLowerCase();
                      const isExonerado = notasLower.includes('exonerad') || notasLower.includes('sin multa') || notasLower.includes('sin multas');
                      const multaMes = isExonerado ? 0 : baseUnMes * (esRes ? 0.10 : 0.12);
                      const mesesConMulta = isExonerado ? 0 : Math.max(0, meses - 1);
                      const totalMulta = multaMes * mesesConMulta;
                      return sum + ( (baseUnMes + iva) * meses ) + totalMulta;
                    }, 0);
                    const tieneDeudaReal = deudaInmuebleBs > 0.01;
                    if (deudas.length === 0 && !tieneDeudaReal) {
                      return (
                        <div className="p-6 text-center">
                          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                          <p className="text-slate-600 font-medium mb-4">El contribuyente está solvente.</p>
                          
                          <div className="max-w-xs mx-auto bg-green-50 p-4 rounded-lg border border-green-100">
                            {viewData.isCondominio ? (
                              <div className="space-y-3">
                                <label className="text-xs font-bold text-green-800 block text-left">Seleccione el Inmueble:</label>
                                <select 
                                  className="w-full text-sm p-2 border border-green-200 rounded text-slate-700 bg-white"
                                  value={selectedSolvenciaInmueble}
                                  onChange={(e) => setSelectedSolvenciaInmueble(e.target.value)}
                                >
                                  <option value="">-- Condominio General --</option>
                                  {viewCalculo?.misInmuebles?.map((inm: any, idx: number) => (
                                    <option key={idx} value={inm.inmueble || `Local ${idx+1}`}>
                                      {inm.inmueble || `Local ${idx+1}`} - {inm.actividad_principal || 'Residencial'}
                                    </option>
                                  ))}
                                </select>
                                <button 
                                  onClick={() => generarSolvenciaIndividual(viewData, selectedSolvenciaInmueble)}
                                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded shadow-sm text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                                >
                                  <Download className="w-4 h-4" />
                                  Descargar Solvencia
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => generarSolvenciaIndividual(viewData, 'general')}
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded shadow-sm text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                              >
                                <Download className="w-4 h-4" />
                                Descargar Solvencia
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Si hay deuda en el inmueble pero no hay facturas pendientes
                    if (deudas.length === 0 && tieneDeudaReal) {
                      return (
                        <div className="p-4">
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="w-5 h-5 text-amber-600" />
                              <span className="font-bold text-amber-800">Deuda Acumulada (sin recibos emitidos)</span>
                            </div>
                            <p className="text-sm text-amber-700 mb-3">Este contribuyente tiene deuda registrada en sus inmuebles pero no tiene recibos pendientes. La deuda se generó por acumulación mensual.</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                                <tr>
                                  <th className="p-2.5 text-left">N° Local / Inmueble</th>
                                  <th className="p-2.5 text-left">Comercio / Uso</th>
                                  <th className="p-2.5 text-center">Meses Mora</th>
                                  <th className="p-2.5 text-right">Base Imponible</th>
                                  <th className="p-2.5 text-right">IVA (16% / Exento)</th>
                                  <th className="p-2.5 text-right">Multa</th>
                                  <th className="p-2.5 text-right">Total Deuda (Bs)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {userInms.filter((inm: any) => parseFloat(inm.deuda_mmv || 0) > 0 || parseFloat(inm.deuda_congelada_bs || 0) > 0 || parseInt(inm.meses_deuda || 0) > 0).map((inm: any, idx: number) => {
                                  const meses = Math.max(1, parseInt(inm.meses_deuda || 0));
                                  const esRes = isResidencialInm(inm);
                                  const baseUnMes = calcularMensualidad(inm, tcmmv);
                                  const base = baseUnMes * meses;
                                  const iva = esRes ? 0 : (base * 0.16);
                                  const notasLower = (inm.notas || '').toLowerCase();
                                  const isExonerado = notasLower.includes('exonerad') || notasLower.includes('sin multa') || notasLower.includes('sin multas');
                                  const multaMes = isExonerado ? 0 : baseUnMes * (esRes ? 0.10 : 0.12);
                                  const mesesConMulta = isExonerado ? 0 : Math.max(0, meses - 1);
                                  const multaCalc = isExonerado ? 0 : (multaMes * mesesConMulta);
                                  const multaGuardada = isExonerado ? 0 : parseFloat(inm.multa_bs || '0');
                                  const multa = (meses <= 1 || isExonerado) ? 0 : Math.max(multaCalc, multaGuardada);
                                  const totalInm = base + iva + multa;

                                  const getLocalLabelItem = (item: any) => {
                                    if (item?.numero_unidad) return `Local ${item.numero_unidad}`;
                                    if (item?.unidad) return `Local ${item.unidad}`;
                                    if (item?.local) return `Local ${item.local}`;
                                    const dir = item?.direccion || '';
                                    const startMatch = dir.match(/^\s*(?:[0-9]+\s+)+([A-Za-z0-9\-]+)/);
                                    if (startMatch && startMatch[1].length <= 12) return `Local ${startMatch[1].toUpperCase()}`;
                                    const match = dir.match(/(?:LOCAL\s*(?:COMERCIAL\s*)?(?:NRO\.?\s*)?([A-Za-z0-9\-]+)|([A-Z]\-[0-9]+))/i);
                                    if (match) return `Local ${(match[1] || match[2]).toUpperCase()}`;
                                    return item.inmueble ? `Inmueble ${item.inmueble}` : 'Local';
                                  };

                                  return (
                                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="p-2.5 font-bold text-slate-800">
                                        <div className="flex items-center gap-1.5">
                                          <Store className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                          {getLocalLabelItem(inm)}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono block ml-5">{inm.inmueble || '---'}</span>
                                      </td>
                                      <td className="p-2.5 text-slate-600">
                                        <div className="font-semibold text-slate-700">{inm.contribuyente || inm.actividad_principal || 'Actividad General'}</div>
                                        <div className="text-[10px] text-slate-400">{inm.tipo || inm.clasificacion || (esRes ? "Residencial" : "Comercial")}</div>
                                      </td>
                                      <td className="p-2.5 text-center">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                          {meses} {meses === 1 ? 'mes' : 'meses'}
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-right font-medium text-slate-700">Bs. {base.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                      <td className="p-2.5 text-right">
                                        {esRes ? (
                                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Exento (Bs. 0)</span>
                                        ) : (
                                          <span className="text-blue-700 font-bold">Bs. {iva.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                        )}
                                      </td>
                                      <td className="p-2.5 text-right">
                                        {multa > 0 ? (
                                          <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">Bs. {multa.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                        ) : (
                                          <span className="text-slate-400">Bs. 0,00</span>
                                        )}
                                      </td>
                                      <td className="p-2.5 text-right font-black text-red-600">Bs. {totalInm.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-red-50 font-bold text-xs">
                                  <td colSpan={6} className="p-2.5 text-slate-700 uppercase tracking-wide">Total Deuda Consolidada</td>
                                  <td className="p-2.5 text-right text-red-700 font-black">Bs. {deudaInmuebleBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div>
                        <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap justify-between items-center gap-2">
                          <div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block">Monto Total Adeudado</span>
                            <span className="text-xl font-black text-red-600">Bs. {totalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-bold border border-slate-200">
                              {deudas.length} {deudas.length === 1 ? 'período' : 'períodos'}
                            </span>
                            <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold border border-emerald-200">
                              Último mes sin multa
                            </span>
                          </div>
                        </div>

                        {/* Desglose por Inmueble / Local para Condominios */}
                        {(viewData?.isCondominio || userInms.length > 1) && (
                          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Building2 className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Desglose por Inmueble / Local ({userInms.length} unidades)
                              </span>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white max-h-[240px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                                  <tr>
                                    <th className="p-2.5 text-left">N° Local / Inmueble</th>
                                    <th className="p-2.5 text-left">Comercio / Uso</th>
                                    <th className="p-2.5 text-center">Meses Mora</th>
                                    <th className="p-2.5 text-right">Base Imponible</th>
                                    <th className="p-2.5 text-right">IVA (16% / Exento)</th>
                                    <th className="p-2.5 text-right">Multa</th>
                                    <th className="p-2.5 text-right">Total a Pagar</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {userInms.map((inm: any, idx: number) => {
                                    const meses = Math.max(1, parseInt(inm.meses_deuda || '1'));
                                    const esRes = isResidencialInm(inm);
                                    const baseUnMes = calcularMensualidad(inm, tcmmv);
                                    const base = baseUnMes * meses;
                                    const iva = esRes ? 0 : (base * 0.16);
                                    const notasLower = (inm.notas || '').toLowerCase();
                                    const isExonerado = notasLower.includes('exonerad') || notasLower.includes('sin multa') || notasLower.includes('sin multas');
                                    const multaMes = isExonerado ? 0 : baseUnMes * (esRes ? 0.10 : 0.12);
                                    const mesesConMulta = isExonerado ? 0 : Math.max(0, meses - 1);
                                    const multaCalc = isExonerado ? 0 : (multaMes * mesesConMulta);
                                    const multaGuardada = isExonerado ? 0 : parseFloat(inm.multa_bs || '0');
                                    const multa = (meses <= 1 || isExonerado) ? 0 : Math.max(multaCalc, multaGuardada);
                                    const totalInm = base + iva + multa;

                                    const getLocalLabelItem = (item: any) => {
                                      if (item?.numero_unidad) return `Local ${item.numero_unidad}`;
                                      if (item?.unidad) return `Local ${item.unidad}`;
                                      if (item?.local) return `Local ${item.local}`;
                                      const dir = item?.direccion || '';
                                      const startMatch = dir.match(/^\s*(?:[0-9]+\s+)+([A-Za-z0-9\-]+)/);
                                      if (startMatch && startMatch[1].length <= 12) return `Local ${startMatch[1].toUpperCase()}`;
                                      const match = dir.match(/(?:LOCAL\s*(?:COMERCIAL\s*)?(?:NRO\.?\s*)?([A-Za-z0-9\-]+)|([A-Z]\-[0-9]+))/i);
                                      if (match) return `Local ${(match[1] || match[2]).toUpperCase()}`;
                                      return item.inmueble ? `Inmueble ${item.inmueble}` : 'Local';
                                    };

                                    return (
                                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">
                                          <div className="flex items-center gap-1.5">
                                            <Store className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                            {getLocalLabelItem(inm)}
                                          </div>
                                          <span className="text-[10px] text-slate-400 font-mono block ml-5">{inm.inmueble || '---'}</span>
                                        </td>
                                        <td className="p-2.5 text-slate-600">
                                          <div className="font-semibold text-slate-700 truncate max-w-[170px]">{inm.contribuyente || inm.actividad_principal || 'Actividad General'}</div>
                                          <div className="text-[10px] text-slate-400">{inm.tipo || inm.clasificacion || (esRes ? "Residencial" : "Comercial")}</div>
                                        </td>
                                        <td className="p-2.5 text-center whitespace-nowrap">
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                            {meses} {meses === 1 ? 'mes' : 'meses'}
                                          </span>
                                        </td>
                                        <td className="p-2.5 text-right font-medium text-slate-700 whitespace-nowrap">
                                          Bs. {base.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                                        </td>
                                        <td className="p-2.5 text-right whitespace-nowrap">
                                          {esRes ? (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Exento (Bs. 0)</span>
                                          ) : (
                                            <span className="text-blue-700 font-bold">Bs. {iva.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                          )}
                                        </td>
                                        <td className="p-2.5 text-right whitespace-nowrap">
                                          {multa > 0 ? (
                                            <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">Bs. {multa.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                          ) : (
                                            <span className="text-slate-400">Bs. 0,00</span>
                                          )}
                                        </td>
                                        <td className="p-2.5 text-right font-black text-emerald-700 whitespace-nowrap">
                                          Bs. {totalInm.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                        <div className="bg-slate-50 max-h-[300px] overflow-y-auto border-t border-slate-200">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-500 font-medium text-[10px] uppercase sticky top-0 z-10 shadow-xs">
                              <tr>
                                <th className="px-4 py-2">Referencia</th>
                                <th className="px-4 py-2">Mes</th>
                                <th className="px-4 py-2">Estado</th>
                                <th className="px-4 py-2 text-right">Monto (Bs)</th>
                                <th className="px-4 py-2 text-center w-10">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deudas.map((d: any, idx: number) => {
                                const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
                                let mesLabel = d.emision || 'N/A';
                                if (d.emision) {
                                  const parts = d.emision.split('-');
                                  if (parts.length >= 2) mesLabel = `${MESES[parseInt(parts[1])-1] || parts[1]} ${parts[0]}`;
                                }
                                const isUltimo = (idx === deudas.length - 1);
                                return (
                                  <tr key={idx} className="border-b border-slate-100 last:border-0 bg-white group hover:bg-slate-50/80">
                                    <td className="px-4 py-2 font-medium text-slate-700 text-xs">{d.referencia}</td>
                                    <td className="px-4 py-2 text-slate-700 font-semibold text-xs whitespace-nowrap">
                                      {mesLabel}
                                      {isUltimo && (
                                        <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                          Sin Multa
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.estado === 'Por Verificar' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {d.estado || 'Pendiente'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-slate-800">
                                      {getMontoActual(d) <= 0 && d.estado !== 'Abonado' && d.estado !== 'Pagado' ? (
                                        <span className="text-emerald-600">En Verificación</span>
                                      ) : (
                                        getMontoActual(d).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      <button 
                                        onClick={() => handleDeleteFactura(d)}
                                        className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                                        title="Eliminar Deuda"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {deudas.length > 8 && (
                          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
                            <span>Mostrando lista de {deudas.length} períodos. Desplace la tabla para ver todos los meses.</span>
                            <span className="font-semibold text-slate-600">La exportación a PDF se genera de forma compacta y por inmueble</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Servicios Especiales Pendientes (no pagados) */}
              {viewServiciosEsp.filter((s: any) => s.estado !== 'Pagado').length > 0 && (
                <div className="mt-4 border border-purple-200 rounded-lg overflow-hidden">
                  <div className="bg-purple-50 px-4 py-3 border-b border-purple-100 flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <h4 className="font-bold text-purple-800 text-sm">Servicios Especiales / Inspecciones Asignados</h4>
                    <span className="ml-auto text-xs font-bold text-purple-600">({viewServiciosEsp.filter((s: any) => s.estado !== 'Pagado').length}) pendientes</span>
                  </div>
                  <div className="bg-white">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-purple-50 text-purple-700 font-medium text-[10px] uppercase">
                        <tr>
                          <th className="px-4 py-2">Tipo</th>
                          <th className="px-4 py-2">Descripción</th>
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-4 py-2 text-center">Estado</th>
                          <th className="px-4 py-2 text-right">Monto (Bs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewServiciosEsp.filter((s: any) => s.estado !== 'Pagado').map((s: any, idx: number) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-purple-50/30">
                            <td className="px-4 py-2 text-xs text-purple-600 font-semibold capitalize">{s.tipo?.replace('_', ' ')}</td>
                            <td className="px-4 py-2 font-medium text-slate-700 text-xs">{s.descripcion}</td>
                            <td className="px-4 py-2 text-slate-500 text-xs">{s.fecha}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                s.estado === 'Pendiente' ? 'bg-red-100 text-red-700' :
                                s.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{s.estado}</span>
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-purple-700">Bs. {Number(s.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="mt-4 border border-emerald-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex items-center gap-2">
                  <span className="text-lg">🔧</span>
                  <h4 className="font-bold text-emerald-800 text-sm">Historial de Servicios Especiales / Inspecciones</h4>
                  <span className="ml-auto text-xs text-emerald-600">({viewServiciosEsp.filter((s: any) => s.estado === 'Pagado' || s.estado === 'Por Verificar').length}) procesados</span>
                </div>
                {viewServiciosEsp.filter((s: any) => s.estado === 'Pagado' || s.estado === 'Por Verificar').length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">No hay servicios especiales pagados o en verificación.</p>
                ) : (
                  <div className="bg-white">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-emerald-50 text-emerald-700 font-medium text-[10px] uppercase">
                        <tr>
                          <th className="px-4 py-2">Tipo</th>
                          <th className="px-4 py-2">Descripción</th>
                          <th className="px-4 py-2">Estado</th>
                          <th className="px-4 py-2 text-right">Monto (Bs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewServiciosEsp.filter((s: any) => s.estado === 'Pagado' || s.estado === 'Por Verificar').map((s: any, idx: number) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/20">
                            <td className="px-4 py-2 text-xs text-emerald-700 font-semibold capitalize">{s.tipo?.replace('_', ' ')}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{s.descripcion}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                s.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>{s.estado}</span>
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-emerald-600">Bs. {Number(s.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Historial de Recibos Procesados */}
              <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden mb-6">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <h4 className="font-bold text-slate-800">Historial de Recibos Procesados</h4>
                </div>
                <div className="p-0 bg-white overflow-x-auto">
                  {(() => {
                    const procesadas = (recibos || [])
                      .filter((f: any) => f.identidad === viewData.Identidad || f.contribuyente === viewData.Contribuyente || f.contribuyente === viewData.Identidad)
                      .filter((f: any) => f.estado !== 'Pendiente' && f.estado !== 'Abonado');
                      
                    if (procesadas.length === 0) {
                      return <p className="p-4 text-sm text-slate-500 text-center">No hay recibos procesados (pagados, anulados o reversados).</p>;
                    }

                    return (
                      <table className="w-full text-sm text-left" style={{minWidth:'850px'}}>
                        <thead className="bg-slate-100 text-slate-500 font-medium text-[10px] uppercase">
                          <tr>
                            <th className="px-4 py-2">Referencia</th>
                            <th className="px-4 py-2">Período</th>
                            <th className="px-4 py-2">Fecha Pago</th>
                            <th className="px-4 py-2">Cajero / Operador</th>
                            <th className="px-4 py-2">Estado</th>
                            <th className="px-4 py-2">Monto (Bs)</th>
                            <th className="px-4 py-2 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {procesadas.map((d: any, idx: number) => {
                            // Buscar pago relacionado para obtener cajero y fecha
                            const pagoRel = viewPagos.find((p: any) => {
                              const pDet = typeof p.detalles === 'string' ? (() => { try { return JSON.parse(p.detalles); } catch(e){return {};} })() : (p.detalles || {});
                              return JSON.stringify(pDet).includes(d.referencia);
                            });
                            let cajeroNombre = '—';
                            let fechaPago = '—';
                            if (pagoRel) {
                              try {
                                const pDet = typeof pagoRel.detalles === 'string' ? JSON.parse(pagoRel.detalles) : (pagoRel.detalles || {});
                                cajeroNombre = pDet.cajero || pDet.usuario || pDet.operador || pagoRel.cajero || '—';
                              } catch(e){}
                              fechaPago = pagoRel.created_at ? new Date(pagoRel.created_at).toLocaleDateString('es-VE') : '—';
                            }
                            // Período desde la emisión de la recibo
                            const MESES_NOM = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
                            const getMesFull = (fecha: string) => {
                              if (!fecha) return '—';
                              const p = fecha.split('-');
                              return p.length >= 2 ? `${MESES_NOM[parseInt(p[1])-1]} ${p[0]}` : fecha;
                            };
                            const periodoLabel = getMesFull(d.emision);
                            let finalMonto = Number(parseFloat(String(d.monto || '0').replace(/[^\d.]/g, '')));
                            if (d.estado === 'Pagado') {
                              const pRel = viewPagos.filter((p: any) => {
                                const pDet = typeof p.detalles === 'string' ? (() => { try { return JSON.parse(p.detalles); } catch(e){return {};} })() : p.detalles;
                                return JSON.stringify(pDet || {}).includes(d.referencia);
                              });
                              if (pRel.length > 1) finalMonto = pRel.reduce((s: number, p: any) => s + (parseFloat(String(p.monto || '0').replace(/[^\d.]/g, '')) || 0), 0);
                            }
                            return (
                              <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="px-4 py-2 font-medium text-slate-700 text-xs">{d.referencia}</td>
                                <td className="px-4 py-2 font-semibold text-slate-800">{periodoLabel}</td>
                                <td className="px-4 py-2 text-slate-500 text-xs">{fechaPago}</td>
                                <td className="px-4 py-2">
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{cajeroNombre}</span>
                                </td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    d.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-800' :
                                    d.estado === 'Por Verificar' ? 'bg-orange-100 text-orange-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>{d.estado}</span>
                                </td>
                                <td className="px-4 py-2 font-bold text-slate-800">
                                  {finalMonto.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                                </td>
                                <td className="px-4 py-2 flex justify-center gap-2">
                                  {(d.estado === 'Pagado' || d.estado === 'Por Verificar') && (
                                    <>
                                      <button 
                                        onClick={() => setActionModal({ type: 'Reversar', recibo: d })}
                                        className="text-orange-600 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded text-xs font-medium transition-colors"
                                      >
                                        Reversar
                                      </button>
                                      <button 
                                        onClick={() => setActionModal({ type: 'Anular', recibo: d })}
                                        className="text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded text-xs font-medium transition-colors"
                                      >
                                        Anular
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>

              {/* Historial de Pagos Realizados */}
              <div className="mt-4 border border-indigo-200 rounded-lg overflow-hidden">
                <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex items-center gap-2">
                  <span className="text-lg">💳</span>
                  <h4 className="font-bold text-indigo-800 text-sm">Historial de Pagos Realizados</h4>
                  <span className="ml-auto text-xs text-indigo-600">({viewPagos.length}) registros</span>
                </div>
                {viewPagos.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">No hay pagos registrados para este contribuyente.</p>
                ) : (
                  <div className="bg-white overflow-x-auto">
                    <table className="w-full text-sm text-left" style={{minWidth: '700px'}}>
                      <thead className="bg-indigo-50 text-indigo-700 font-medium text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Monto (Bs)</th>
                          <th className="px-3 py-2">Método</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Cajero / Operador</th>
                          <th className="px-3 py-2">Estado</th>
<th className="px-3 py-2 text-center">Factura Fiscal</th>
</tr>
</thead>
                      <tbody>
                        {viewPagos.map((p: any, idx: number) => {
                          let det: any = {};
                          try { det = JSON.parse(p.detalles || '{}'); } catch(e){}
                          const esAbono = det.es_abono === true;
                          const metodo = p.tipo === 'Debito' ? 'Punto de Venta' : p.tipo || '---';
                          const cajeroNombre = det.cajero || det.usuario || det.operador || p.cajero || '—';
                          return (
                            <tr key={idx} className={`border-b border-slate-100 last:border-0 hover:bg-indigo-50/20 ${esAbono ? 'bg-amber-50/20' : ''}`}>
                              <td className="px-3 py-2 text-slate-500 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString('es-VE') : '---'}</td>
                              <td className="px-3 py-2 font-bold text-slate-800">Bs. {Number(p.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  metodo === 'Punto de Venta' ? 'bg-blue-100 text-blue-700' :
                                  metodo === 'Transferencia' ? 'bg-purple-100 text-purple-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>{metodo}</span>
                              </td>
                              <td className="px-3 py-2">
                                {esAbono ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">ABONO</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">COMPLETO</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{cajeroNombre}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  p.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-800' :
                                  p.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>{p.estado}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {det.factura_digital?.emitida && det.factura_digital?.url ? (
                                  <a href={det.factura_digital.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium shadow-sm transition-colors">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    Ver Factura TFHKA
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400 font-medium">No disponible</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Convenios de Pago */}
              <div className="border border-orange-200 rounded-lg overflow-hidden bg-orange-50/30">
                <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex items-center gap-2">
                  <Handshake className="w-5 h-5 text-orange-600" />
                  <h4 className="font-bold text-orange-800">Convenios de Pago Activos</h4>
                </div>
                <div className="p-0">
                  {(() => {
                    const userConvenios = (convenios || []).filter((c: any) => c.identidad === viewData.Identidad && c.estado === 'Al Día');
                    if (userConvenios.length === 0) {
                      return (
                        <div className="p-6 text-center">
                          <p className="text-slate-600 font-medium">No tiene convenios de pago activos.</p>
                        </div>
                      );
                    }

                    const hoy = new Date().toISOString().split('T')[0];
                    let totalVencido = 0;
                    const cuotasMostradas: any[] = [];

                    userConvenios.forEach((conv: any) => {
                      let cuotasParsed = [];
                      try { cuotasParsed = JSON.parse(conv.detalle_cuotas || '[]'); } catch(e){}
                      
                      cuotasParsed.forEach((c: any) => {
                        if (c.estado === 'Pendiente') {
                          const isVencida = c.fecha <= hoy;
                          if (isVencida) totalVencido += parseFloat(c.monto || '0');
                          
                          cuotasMostradas.push({
                            numeroConv: conv.numero,
                            cuotaId: c.id + 1,
                            fecha: c.fecha,
                            monto: c.monto,
                            isVencida
                          });
                        }
                      });
                    });

                    if (cuotasMostradas.length === 0) {
                      return (
                        <div className="p-6 text-center">
                          <p className="text-slate-600 font-medium">No tiene cuotas pendientes en sus convenios activos.</p>
                        </div>
                      );
                    }

                    return (
                      <div>
                        {totalVencido > 0 && (
                          <div className="p-4 bg-orange-100/50 border-b border-orange-100 flex justify-between items-center">
                            <span className="font-semibold text-orange-800">Total Cuotas Vencidas:</span>
                            <span className="text-xl font-black text-red-600">Bs. {totalVencido.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="bg-slate-50">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-orange-50 text-orange-800 font-medium text-[10px] uppercase">
                              <tr>
                                <th className="px-4 py-2">Convenio</th>
                                <th className="px-4 py-2">Fecha Pago</th>
                                <th className="px-4 py-2 text-center">Estado</th>
                                <th className="px-4 py-2 text-right">Monto (Bs)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cuotasMostradas.map((c: any, idx: number) => (
                                <tr key={idx} className={`border-b border-slate-100 last:border-0 ${c.isVencida ? 'bg-red-50/30' : 'bg-white'}`}>
                                  <td className="px-4 py-2 font-medium text-slate-700">{c.numeroConv} - Cuota {c.cuotaId}</td>
                                  <td className="px-4 py-2 text-slate-600">{c.fecha}</td>
                                  <td className="px-4 py-2 text-center">
                                    {c.isVencida ? (
                                      <span className="text-red-600 font-bold text-xs">VENCIDA</span>
                                    ) : (
                                      <span className="text-blue-600 font-medium text-xs">Próxima</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-right font-bold text-orange-700">{c.monto}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Ajuste Deuda */}
      {debtModalOpen && selectedDebtRow && (
        <DebtAdjustmentModal
          row={selectedDebtRow}
          inmuebles={inmuebles}
          tcmmv={tcmmv || viewCalculo?.tasaBcv || 1}
          recibos={recibos}
          setFacturas={setFacturas}
          onClose={() => setDebtModalOpen(false)}
        />
      )}

      {/* Modal Eliminar / Exonerar Multas por Mes */}
      {exonerarModalOpen && selectedExonerarRow && (
        <EliminarMultaModal
          row={selectedExonerarRow}
          inmuebles={inmuebles}
          tcmmv={tcmmv || viewCalculo?.tasaBcv || 1}
          recibos={recibos}
          onClose={() => setExonerarModalOpen(false)}
          onSuccess={async () => {
            await refreshData();
          }}
        />
      )}

      {/* Action Modal (Anular/Reversar) */}
      {actionModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${actionModal.type === 'Anular' ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
              <h2 className={`text-lg font-bold ${actionModal.type === 'Anular' ? 'text-red-800' : 'text-orange-800'}`}>
                {actionModal.type} Recibo
              </h2>
              <button onClick={() => setActionModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Está a punto de <strong>{actionModal.type.toLowerCase()}</strong> la recibo <span className="font-bold">{actionModal.recibo.referencia}</span>. 
                Por favor, indique el motivo. <span className="text-red-600 font-bold">* Obligatorio</span>
              </p>
              
              <textarea
                value={actionNota}
                onChange={e => setActionNota(e.target.value)}
                placeholder="Ej. Error en la emisión, pago duplicado..."
                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-500 min-h-[100px] outline-none"
              ></textarea>
              
              <div className="mt-6 flex justify-end gap-3">
                <button 
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleActionSubmit}
                  disabled={isProcessingAction || !actionNota.trim()}
                  className={`px-6 py-2 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${actionModal.type === 'Anular' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                >
                  {isProcessingAction ? 'Procesando...' : `Confirmar ${actionModal.type}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal (Eliminar/Desactivar) */}
      {statusModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${statusModal.type === 'Eliminar' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
              <h2 className={`text-lg font-bold ${statusModal.type === 'Eliminar' ? 'text-red-800' : 'text-amber-800'}`}>
                {statusModal.type} Contribuyente
              </h2>
              <button onClick={() => setStatusModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Está a punto de <strong>{statusModal.type.toLowerCase()}</strong> al contribuyente <span className="font-bold">{statusModal.row.Contribuyente}</span>. 
                Por favor, indique el motivo detallado de esta acción. <span className="text-red-600 font-bold">* Obligatorio</span>
              </p>
              
              <textarea
                value={statusNota}
                onChange={e => setStatusNota(e.target.value)}
                placeholder="Ej. Cese de actividades, orden de Alcaldía..."
                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-500 min-h-[100px] outline-none"
              ></textarea>
              
              <div className="mt-6 flex justify-end gap-3">
                <button 
                  onClick={() => setStatusModal(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleStatusSubmit}
                  disabled={isProcessingStatus || statusNota.trim().length < 10}
                  className={`px-6 py-2 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${statusModal.type === 'Eliminar' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  {isProcessingStatus ? 'Procesando...' : `Confirmar`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedCondominioModal && (
        <UnidadesModal
          onClose={() => setSelectedCondominioModal(null)}
          condominioId={typeof selectedCondominioModal.id === 'number' ? selectedCondominioModal.id : 1}
          condominioNombre={selectedCondominioModal.nombre}
          condominioIdentidad={selectedCondominioModal.identidad}
          condominioCodigoPadre={selectedCondominioModal.codigoPadre}
        />
      )}
    </div>
  );
}

export default function ContribuyentesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <ContribuyentesPageContent />
    </Suspense>
  );
}




