'use client';
import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/DataTable';
import { useAppContext } from '@/store/AppContext';
import { List, Check, X, CheckCircle, Calculator, AlertCircle, FileSpreadsheet, Clock, Eye, FileText, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { exportToExcelWithLogos } from '@/lib/excelExport';

export default function PreRegistrosPage() {
  const { inmuebles, recibos, preRegistros, siguientesCodigosInmueble, ordenanzasConfig: ordenanzaData, setPreRegistros, setInmuebles, setFacturas, addAuditLog, tcmmv, refreshData, refreshUserData } = useAppContext();
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Web' | 'Censo'>('Web');
  const [loadingFresh, setLoadingFresh] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [rowToApprove, setRowToApprove] = useState<any>(null);
  const [meses, setMeses] = useState(1);
  const [calculatedFactor, setCalculatedFactor] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchWeb, setSearchWeb] = useState('');

  // Campos editables por quien aprueba en el modal
  const [approveTipo, setApproveTipo] = useState<string>('Residencial');
  const [approveActividad, setApproveActividad] = useState<string>('');
  const [approveNivel, setApproveNivel] = useState<string>('Generacion Baja');
  const [approveLocales, setApproveLocales] = useState<any[]>([]);

  // Modal visor de documentos adjuntos
  const [previewDoc, setPreviewDoc] = useState<{ label: string; url: string; row?: any } | null>(null);

  const todasLasActividades = [
    ...(ordenanzaData?.actividadesComerciales || []),
    ...(ordenanzaData?.actividadesIndustriales || []),
  ];

  const fetchFreshPreRegistros = async () => {
    setLoadingFresh(true);
    try {
      const res = await fetch('/api/admin/pre-registros', { cache: 'no-store' });
      const j = await res.json();
      if (j.ok && Array.isArray(j.data)) {
        setPreRegistros(j.data);
      }
    } catch (e) {
      console.error('Error cargando pre-registros:', e);
    } finally {
      setLoadingFresh(false);
    }
  };

  useEffect(() => {
    fetchFreshPreRegistros();
  }, []);

  const extraerDocumentosDeFila = (row: any): Array<{ key: string; label: string; url: string }> => {
    if (!row) return [];
    const list: Array<{ key: string; label: string; url: string }> = [];
    const candidates = [
      { key: 'cedula_doc', label: 'Cédula / RIF' },
      { key: 'rif_doc', label: 'RIF' },
      { key: 'ficha_doc', label: 'Ficha Catastral' },
      { key: 'patente_doc', label: 'Patente Comercial' },
      { key: 'registro_doc', label: 'Registro Mercantil' },
    ];
    for (const c of candidates) {
      if (row[c.key] && typeof row[c.key] === 'string' && row[c.key].trim()) {
        if (!list.some(x => x.url === row[c.key].trim())) {
          list.push({ key: c.key, label: c.label, url: row[c.key].trim() });
        }
      }
    }
    return list;
  };

  const calculateFactorCustom = (tipo: string, actividad: string, nivel: string) => {
    let factor = 0;
    if (tipo === 'Residencial') {
      const t = (ordenanzaData?.tiposResidenciales || []).find((x: any) => x.label === actividad || x.label === nivel);
      if (t) factor = t.factor;
    } else if (tipo === 'Industrial') {
      const t = (ordenanzaData?.actividadesIndustriales || []).find((x: any) => x.label === actividad)
        || todasLasActividades.find((x: any) => x.label === actividad);
      if (t && Array.isArray(t.factores)) {
        const nivelIdx = (ordenanzaData?.nivelesMetraje || []).indexOf(nivel);
        const safeIdx = nivelIdx >= 0 ? nivelIdx : 0;
        if (t.factores.length > safeIdx) factor = t.factores[safeIdx];
      }
    } else {
      const t = todasLasActividades.find((x: any) => x.label === actividad);
      if (t && Array.isArray(t.factores)) {
        const nivelIdx = (ordenanzaData?.nivelesMetraje || []).indexOf(nivel);
        const safeIdx = nivelIdx >= 0 ? nivelIdx : 0;
        if (t.factores.length > safeIdx) factor = t.factores[safeIdx];
      }
    }
    return factor;
  };

  useEffect(() => {
    if (!isModalOpen) return;
    if (rowToApprove?.is_condominio && approveLocales.length > 0) {
      let sumF = 0;
      approveLocales.forEach((loc: any) => {
        const usoLoc = loc.uso === 'Residencial' ? 'Residencial' : 'Comercial';
        const actLoc = usoLoc === 'Residencial'
          ? (loc.tipoResidencia || ordenanzaData.tiposResidenciales[0]?.label)
          : (loc.estatus === 'Desocupado' ? 'INMUEBLES DESOCUPADOS' : (loc.actividad || todasLasActividades[0]?.label));
        const nivLoc = usoLoc === 'Residencial'
          ? actLoc
          : (loc.nivel || ordenanzaData.nivelesMetraje[0]);
        sumF += calculateFactorCustom(usoLoc, actLoc, nivLoc);
      });
      setCalculatedFactor(Math.round(sumF * 10000) / 10000);
    } else {
      setCalculatedFactor(calculateFactorCustom(approveTipo, approveActividad, approveNivel));
    }
  }, [isModalOpen, approveTipo, approveActividad, approveNivel, approveLocales, rowToApprove]);

  const handleExportCensos = async () => {
    setIsExporting(true);
    try {
      const data = preRegistros.filter((r: any) => String(r.origen || '').startsWith('Censo'));

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

      exportToExcelWithLogos(excelData, `Censo_General_Unificado_${new Date().toISOString().split('T')[0]}.xlsx`, 'Todos los Censos');
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
      'Origen': item.origen || 'Portal Web',
      'Identidad': item.identidad,
      'Nombre / Razón Social': item.contribuyente,
      'Clasificación': item.tipo,
      'Actividad': item.actividad,
      'Nivel / Zona': item.codigo || 'Por Asignar',
      'Teléfono': item.registro || 'N/A',
      'Correo': item.correo || 'N/A',
      'Domicilio Fiscal': item.domicilio_fiscal || '',
      'Dirección Exacta': item.direccion_exacta || '',
      'Notas': item.nota || ''
    }));
    if (dataToExport.length === 0) return alert('No hay pre-registros web para exportar.');
    exportToExcelWithLogos(dataToExport, `PreRegistros_Web_${new Date().toISOString().split('T')[0]}.xlsx`, 'Pre-Registros Web');
  };

  const handleApproveClick = (row: any) => {
    setRowToApprove(row);
    const initTipo = row.tipo === 'Residencial' ? 'Residencial' : (row.tipo === 'Industrial' ? 'Industrial' : 'Comercial');
    setApproveTipo(initTipo);

    if (initTipo === 'Residencial') {
      const matchedRes = (ordenanzaData?.tiposResidenciales || []).find((t: any) =>
        t.label.toLowerCase() === String(row.actividad || '').toLowerCase() ||
        t.label.toLowerCase() === String(row.codigo || '').toLowerCase()
      ) || ordenanzaData?.tiposResidenciales?.[0];
      const resLabel = matchedRes?.label || 'Casa (Zona C)';
      setApproveActividad(resLabel);
      setApproveNivel(resLabel);
    } else {
      const listActs = initTipo === 'Industrial' ? (ordenanzaData?.actividadesIndustriales || []) : todasLasActividades;
      const matchedAct = listActs.find((a: any) => a.label.toLowerCase() === String(row.actividad || '').toLowerCase()) || listActs[0];
      const actLabel = matchedAct?.label || 'INMUEBLES DESOCUPADOS';
      const validNivel = (ordenanzaData?.nivelesMetraje || []).includes(row.codigo)
        ? row.codigo
        : (ordenanzaData?.nivelesMetraje?.[0] || 'Generacion Baja');
      setApproveActividad(actLabel);
      setApproveNivel(validNivel);
    }

    if (Array.isArray(row.locales) && row.locales.length > 0) {
      setApproveLocales(row.locales.map((l: any) => ({
        ...l,
        uso: l.uso || (initTipo === 'Residencial' ? 'Residencial' : 'Comercial'),
        actividad: l.actividad || row.actividad || todasLasActividades[0]?.label,
        tipoResidencia: l.tipoResidencia || ordenanzaData?.tiposResidenciales?.[0]?.label,
        nivel: (ordenanzaData?.nivelesMetraje || []).includes(l.nivel) ? l.nivel : (ordenanzaData?.nivelesMetraje?.[0] || 'Generacion Baja'),
      })));
    } else {
      setApproveLocales([]);
    }

    let defaultMeses = /TERRENO/i.test(String(row.actividad || '')) ? 0 : 1;
    if (!/TERRENO/i.test(String(row.actividad || '')) && String(row.origen || '').startsWith('Censo') && row.fecha_inicio) {
      const start = new Date(row.fecha_inicio);
      const now = new Date();
      let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
      if (now.getDate() < start.getDate()) {
        months--;
      }
      if (months < 0) months = 0;
      defaultMeses = months;
    }

    setMeses(defaultMeses);
    setIsModalOpen(true);
  };

  const formatActividadConNivel = (tipo: string, actividad: string, nivel: string) => {
    if (tipo === 'Residencial') return actividad;
    const nLow = String(nivel || '').toLowerCase();
    const sufijo = nLow.includes('alta') ? 'ALTA' : (nLow.includes('media') ? 'MEDIA' : 'BAJA');
    const cleanAct = String(actividad || '').replace(/\s*\((?:BAJA|MEDIA|ALTA|GENERACION\s+(?:BAJA|MEDIA|ALTA))\)\s*$/i, '').trim();
    if (/DESOCUPAD/i.test(cleanAct)) return cleanAct;
    return `${cleanAct} (${sufijo})`;
  };

  const handleConfirmApproval = async () => {
    if (!rowToApprove) return;
    setIsProcessing(true);
    try {
      const deudaMMV = parseFloat((calculatedFactor * meses).toFixed(5));
      const codCont = `N-${Date.now().toString().slice(-6)}`;
      const dirCompleta = rowToApprove.direccion_exacta
        ? `${rowToApprove.domicilio_fiscal || rowToApprove.direccion || ''} | Exacta: ${rowToApprove.direccion_exacta}`
        : (rowToApprove.domicilio_fiscal || rowToApprove.direccion || '');

      const baseInmuebleData = {
        identidad: rowToApprove.identidad,
        contribuyente: rowToApprove.contribuyente,
        telefono: rowToApprove.registro || '',
        correo_electronico: rowToApprove.correo || '',
        direccion: dirCompleta,
        cod_cont: codCont,
        clasificacion: rowToApprove.is_condominio ? 'Condominio' : (approveTipo === 'Residencial' ? 'Individual' : 'Comercial'),
        tipo: approveTipo === 'Residencial' ? 'RESIDENCIAL' : (approveTipo === 'Industrial' ? 'INDUSTRIAL' : 'COMERCIAL'),
        estado: 'Activo',
        meses_deuda: meses,
        deuda_mmv: deudaMMV,
        deuda_congelada_bs: 0,
        multa_bs: 0,
        saldo_favor_bs: 0,
        agente_retencion: Boolean(rowToApprove.es_agente_retencion),
        clave_portal: rowToApprove.clave_portal || null,
        notas: rowToApprove.nota || null,
        cant_inmuebles: rowToApprove.cantidad_inmuebles || 1
      };

      let recordsToInsert: any[] = [];

      if (rowToApprove.is_condominio && approveLocales.length > 0) {
        const codigosGen = await siguientesCodigosInmueble(approveLocales.length);
        recordsToInsert = approveLocales.map((local: any, idx: number) => {
          const usoLoc = local.uso === 'Residencial' ? 'Residencial' : 'Comercial';
          const actBase = usoLoc === 'Residencial'
            ? (local.tipoResidencia || ordenanzaData.tiposResidenciales[0]?.label)
            : (local.estatus === 'Desocupado' ? 'INMUEBLES DESOCUPADOS' : (local.actividad || todasLasActividades[0]?.label));
          const nivLoc = usoLoc === 'Residencial' ? actBase : (local.nivel || ordenanzaData.nivelesMetraje[0]);
          const mmvLoc = calculateFactorCustom(usoLoc, actBase, nivLoc);
          const actFinal = formatActividadConNivel(usoLoc, actBase, nivLoc);
          return {
            ...baseInmuebleData,
            inmueble: codigosGen[idx] || `URB${Date.now().toString().slice(-6)}${idx}`,
            numero_local: local.numeracion || null,
            actividad_principal: actFinal,
            tipo: usoLoc === 'Residencial' ? 'RESIDENCIAL' : 'COMERCIAL',
            mmv_mes: mmvLoc,
            deuda_mmv: parseFloat((mmvLoc * meses).toFixed(5)),
          };
        });
      } else {
        const codigosGenerados = await siguientesCodigosInmueble(1);
        const codigoAsignado = codigosGenerados[0] || `URB${Date.now().toString().slice(-6)}`;
        const actFinal = formatActividadConNivel(approveTipo, approveActividad, approveNivel);
        recordsToInsert = [{
          ...baseInmuebleData,
          inmueble: codigoAsignado,
          actividad_principal: actFinal,
          mmv_mes: calculatedFactor,
          deuda_mmv: deudaMMV,
        }];
      }

      // 1. Guardar documentos del expediente en observaciones del contribuyente
      const docTags: string[] = [];
      if (rowToApprove.cedula_doc) docTags.push(`[DOC_CEDULA: ${rowToApprove.cedula_doc}]`);
      if (rowToApprove.rif_doc) docTags.push(`[DOC_RIF: ${rowToApprove.rif_doc}]`);
      if (rowToApprove.ficha_doc) docTags.push(`[DOC_FICHA: ${rowToApprove.ficha_doc}]`);
      if (rowToApprove.patente_doc) docTags.push(`[DOC_PATENTE: ${rowToApprove.patente_doc}]`);
      if (rowToApprove.registro_doc) docTags.push(`[DOC_REGISTRO: ${rowToApprove.registro_doc}]`);

      let obsContrib = rowToApprove.nota || '';
      for (const t of docTags) {
        if (!obsContrib.includes(t)) obsContrib = obsContrib ? `${obsContrib}\n${t}` : t;
      }

      try {
        await supabase.from('contribuyentes').upsert([{
          identidad: rowToApprove.identidad,
          nombre: rowToApprove.contribuyente,
          telefono: rowToApprove.registro || '',
          email: rowToApprove.correo || '',
          direccion: rowToApprove.domicilio_fiscal || rowToApprove.direccion || rowToApprove.direccion_exacta || '',
          observaciones: obsContrib,
          ...(rowToApprove.clave_portal ? { clave_portal: rowToApprove.clave_portal } : {})
        }], { onConflict: 'identidad' });
      } catch (eC) {
        console.warn('Advertencia al upsertar contribuyente en aprobación:', eC);
      }

      const { data: newInmuebles, error: err1 } = await supabase.from('inmuebles').insert(recordsToInsert).select();
      if (err1) throw err1;

      // 2. Generar Recibo si deudaMMV > 0
      if (deudaMMV > 0) {
        const facturaData = {
          referencia: `RECIB-PRE-${Date.now()}`,
          identidad: rowToApprove.identidad,
          contribuyente: rowToApprove.contribuyente,
          monto: (deudaMMV * (tcmmv || 1)).toFixed(2),
          emision: new Date().toISOString().split('T')[0],
          vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          estado: 'Pendiente'
        };
        const { data: newFactura } = await supabase.from('facturas').insert([facturaData]).select().single();
        if (newFactura) setFacturas([newFactura, ...recibos]);
      }

      // 3. Marcar como Aprobado en /api/admin/pre-registros (conservando los documentos en la tabla documentos para consulta histórica)
      await fetch('/api/admin/pre-registros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rowToApprove.id,
          estado: 'Aprobado',
          detalles: {
            ...rowToApprove,
            tipo: approveTipo,
            actividad: approveActividad,
            codigo: approveNivel,
            aprobado_at: new Date().toISOString(),
            codigo_inmueble_asignado: recordsToInsert.map(r => r.inmueble).join(', ')
          }
        })
      });

      if (newInmuebles) {
        setInmuebles([...newInmuebles, ...inmuebles]);
      }
      setPreRegistros(preRegistros.filter((r: any) => r.id !== rowToApprove.id));
      await addAuditLog(
        'APROBAR_PREREGISTRO',
        `Aprobado ${rowToApprove.contribuyente} (${rowToApprove.identidad}) con código(s) ${recordsToInsert.map(r => r.inmueble).join(', ')} - Actividad: ${approveActividad} (${approveNivel}) - ${calculatedFactor} MMV/mes × ${meses} mes(es)`
      );
      if (refreshUserData) await refreshUserData(rowToApprove.identidad).catch(() => {});

      setShowSuccess(`✅ Contribuyente ${rowToApprove.contribuyente} aprobado con código ${recordsToInsert.map(r => r.inmueble).join(', ')}.`);
      setTimeout(() => setShowSuccess(null), 5000);
      setIsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      alert('Error al aprobar: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (row: any) => {
    if (confirm(`¿Está seguro de rechazar y eliminar la solicitud de ${row.contribuyente} (${row.identidad})?`)) {
      await fetch(`/api/admin/pre-registros?id=${encodeURIComponent(String(row.id))}`, { method: 'DELETE' });
      setPreRegistros(preRegistros.filter((r: any) => r.id !== row.id));
      setShowSuccess(`El pre-registro de ${row.contribuyente} ha sido rechazado.`);
      setTimeout(() => setShowSuccess(null), 3000);
    }
  };

  const columns = [
    {
      key: 'created_at',
      header: 'Fecha',
      render: (row: any) => {
        const f = row.created_at || row.registrado;
        return <span className="text-xs text-slate-600">{f ? new Date(f).toLocaleDateString('es-VE') : '—'}</span>;
      }
    },
    {
      key: 'origen',
      header: 'Origen',
      render: (row: any) => {
        const orig = String(row.origen || 'Portal Web');
        const isAdmin = orig.toLowerCase().includes('administrativo') || orig.toLowerCase().includes('sistema');
        const isCenso = orig.toLowerCase().startsWith('censo');
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            isAdmin ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
            isCenso ? 'bg-orange-50 text-orange-800 border-orange-200' :
            'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {orig}
          </span>
        );
      }
    },
    { key: 'identidad', header: 'Identidad' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'tipo', header: 'Clasificación' },
    { key: 'actividad', header: 'Actividad / Tipo' },
    {
      key: 'codigo',
      header: 'Nivel / Zona',
      render: (row: any) => {
        const cod = row.codigo;
        if (!cod || cod === 'Por Asignar') {
          return <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold">Por Asignar al Aprobar</span>;
        }
        return <span className="text-xs font-semibold text-slate-700">{cod}</span>;
      }
    },
    {
      key: 'documentos',
      header: 'Documentos',
      render: (row: any) => {
        const docs = extraerDocumentosDeFila(row);
        return docs.length > 0 ? (
          <div className="flex gap-1.5 flex-wrap">
            {docs.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewDoc({ label: d.label, url: d.url, row });
                }}
                className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded border border-blue-300 hover:bg-blue-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                title={`Visualizar ${d.label}`}
              >
                <Eye className="w-3 h-3" /> {d.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Sin adjuntos
          </span>
        );
      }
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (row: any) => (
        <div className="flex gap-2">
          <button onClick={() => {
            setRowToApprove(row);
            setIsDetailsModalOpen(true);
          }} className="bg-blue-50 text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors cursor-pointer" title="Ver Detalles y Documentos">
            <Eye className="w-4 h-4" />
          </button>
          <button onClick={() => handleApproveClick(row)} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 text-xs font-bold border border-emerald-200 cursor-pointer" title="Revisar Nivel, Actividad y Aprobar">
            <Check className="w-4 h-4" /> Aprobar
          </button>
          <button onClick={() => handleReject(row)} className="bg-red-50 text-red-600 hover:bg-red-100 p-1.5 rounded transition-colors cursor-pointer" title="Rechazar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <List className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Pre-Registros y Aprobación de Nuevos Contribuyentes
          </h1>
        </div>
        <button
          onClick={fetchFreshPreRegistros}
          disabled={loadingFresh}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-slate-300 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingFresh ? 'animate-spin' : ''}`} />
          Actualizar Lista
        </button>
      </div>

      {showSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative flex items-center gap-2 shadow-sm" role="alert">
          <CheckCircle className="w-5 h-5" />
          <span className="block sm:inline font-semibold">{showSuccess}</span>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="flex bg-slate-100 p-2 rounded text-sm text-slate-700 font-medium">
          <button
            onClick={() => setActiveTab('Web')}
            className={`px-4 py-2 rounded flex items-center gap-2 transition-colors cursor-pointer ${activeTab === 'Web' ? 'bg-white shadow-sm border border-slate-200 text-slate-800 font-bold' : 'hover:bg-slate-200'}`}
          >
            <Check className={`w-4 h-4 ${activeTab === 'Web' ? 'text-green-500' : ''}`} />
            Pre-registros WEB y Sistema ({preRegistros.filter((r: any) => !String(r.origen || '').startsWith('Censo')).length})
          </button>
          <button
            onClick={() => setActiveTab('Censo')}
            className={`px-4 py-2 rounded flex items-center gap-2 transition-colors cursor-pointer ${activeTab === 'Censo' ? 'bg-white shadow-sm border border-slate-200 text-slate-800 font-bold' : 'hover:bg-slate-200'}`}
          >
            <Check className={`w-4 h-4 ${activeTab === 'Censo' ? 'text-green-500' : ''}`} />
            Censo Trabajadores ({preRegistros.filter((r: any) => String(r.origen || '').startsWith('Censo')).length})
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow transition-colors text-sm cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Web
            </button>
          )}
          {activeTab === 'Censo' && (
            <button 
              onClick={handleExportCensos}
              disabled={isExporting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2 shadow transition-colors disabled:opacity-50 text-sm cursor-pointer"
            >
              {isExporting ? <Clock className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <span>Exportar Censos</span>
            </button>
          )}
        </div>
      </div>

      <DataTable 
        data={preRegistros
          .filter((r: any) => activeTab === 'Censo' ? String(r.origen || '').startsWith('Censo') : !String(r.origen || '').startsWith('Censo'))
          .filter((r: any) => {
            if (!searchWeb.trim()) return true;
            const q = searchWeb.toLowerCase();
            return (
              (r.identidad || '').toLowerCase().includes(q) ||
              (r.contribuyente || '').toLowerCase().includes(q) ||
              (r.actividad || '').toLowerCase().includes(q) ||
              (r.tipo || '').toLowerCase().includes(q) ||
              (r.origen || '').toLowerCase().includes(q)
            );
          })
        } 
        columns={columns} 
        itemsPerPage={10} 
      />

      {/* MODAL DE APROBACION, EDICION DE ACTIVIDAD / NIVEL Y DEUDA */}
      {isModalOpen && rowToApprove && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto border border-slate-200">
            <div className="bg-slate-800 p-4 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-white font-bold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                Aprobar Contribuyente, Asignar Nivel y Deuda Inicial
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-1.5">
                <p className="text-sm"><span className="font-semibold text-slate-700">Contribuyente:</span> <strong className="text-slate-900">{rowToApprove.contribuyente}</strong> ({rowToApprove.identidad})</p>
                <p className="text-xs text-slate-600"><span className="font-semibold">Origen:</span> {rowToApprove.origen || 'Portal Web'}</p>
                {(rowToApprove.domicilio_fiscal || rowToApprove.direccion) && (
                  <p className="text-xs text-slate-600"><span className="font-semibold">Dirección:</span> {rowToApprove.domicilio_fiscal || rowToApprove.direccion}</p>
                )}
                {rowToApprove.origen?.startsWith('Censo') && rowToApprove.fecha_inicio && (
                  <p className="text-xs text-orange-700 bg-orange-100 p-1.5 rounded inline-block"><span className="font-semibold">Inicio Actividad:</span> {rowToApprove.fecha_inicio}</p>
                )}
              </div>

              {/* Documentos adjuntos visibles directamente en el modal de aprobación */}
              {(() => {
                const docs = extraerDocumentosDeFila(rowToApprove);
                if (docs.length === 0) {
                  return (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-800">
                        <strong className="block font-bold">Este pre-registro no posee documentos adjuntos</strong>
                        <span>
                          Fue enviado antes de activarse la validación obligatoria de documentos en el Portal Web. Verifique la documentación del contribuyente antes de aprobarlo o rechace la solicitud para que se registre nuevamente con sus soportes.
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2">
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-blue-600" /> Documentos Adjuntos por el Usuario ({docs.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {docs.map(d => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setPreviewDoc({ label: d.label, url: d.url, row: rowToApprove })}
                          className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" /> Ver {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Edición de Clasificación, Actividad Comercial y Nivel por quien aprueba */}
              <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 space-y-4">
                <h3 className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
                  Configuración Tarifaria (Editable por el Aprobador)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Clasificación</label>
                    <select
                      value={approveTipo}
                      onChange={(e) => {
                        const val = e.target.value;
                        setApproveTipo(val);
                        if (val === 'Residencial') {
                          const firstRes = ordenanzaData?.tiposResidenciales?.[0]?.label || 'Casa (Zona C)';
                          setApproveActividad(firstRes);
                          setApproveNivel(firstRes);
                        } else {
                          const listA = val === 'Industrial' ? (ordenanzaData?.actividadesIndustriales || []) : todasLasActividades;
                          setApproveActividad(listA[0]?.label || 'INMUEBLES DESOCUPADOS');
                          setApproveNivel(ordenanzaData?.nivelesMetraje?.[0] || 'Generacion Baja');
                        }
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Residencial">Residencial</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Industrial">Industrial</option>
                    </select>
                  </div>

                  {approveTipo === 'Residencial' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Residencia y Zona</label>
                      <select
                        value={approveActividad}
                        onChange={(e) => {
                          setApproveActividad(e.target.value);
                          setApproveNivel(e.target.value);
                        }}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {(ordenanzaData?.tiposResidenciales || []).map((t: any) => (
                          <option key={t.label} value={t.label}>{t.label} ({t.factor} MMV)</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-emerald-800 mb-1">Nivel de Generación (Alto / Medio / Bajo) *</label>
                      <select
                        value={approveNivel}
                        onChange={(e) => setApproveNivel(e.target.value)}
                        className="w-full border-2 border-emerald-400 rounded-lg px-3 py-2 text-xs font-bold text-emerald-950 bg-emerald-50/50 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {(ordenanzaData?.nivelesMetraje || ['Generacion Baja', 'Generacion Media', 'Generacion Alta']).map((n: string) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {approveTipo !== 'Residencial' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Actividad Económica / Comercial (Editable)</label>
                    <select
                      value={approveActividad}
                      onChange={(e) => setApproveActividad(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {(approveTipo === 'Industrial' ? (ordenanzaData?.actividadesIndustriales || todasLasActividades) : todasLasActividades).map((a: any) => (
                        <option key={a.label} value={a.label}>
                          {a.label} (Baja: {a.factores?.[0]} / Media: {a.factores?.[1]} / Alta: {a.factores?.[2]})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center bg-blue-50 p-3 rounded border border-blue-100">
                  <span className="text-sm font-semibold text-blue-800">Factor Mensual (MMV / FO):</span>
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
                    <span className="block text-xs font-semibold text-emerald-700 mt-1">
                      Tasa BCV: Bs. {(tcmmv || 1).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-amber-50 p-3 rounded border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed font-medium">
                  Al confirmar, este contribuyente quedará activo en el listado general de Inmuebles/Contribuyentes con la actividad y el nivel seleccionados arriba.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmApproval}
                  disabled={isProcessing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 flex justify-center cursor-pointer"
                >
                  {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Confirmar Aprobación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLES Y DOCUMENTOS */}
      {isDetailsModalOpen && rowToApprove && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="bg-slate-800 p-4 flex items-center justify-between sticky top-0 z-10">
              <h2 className="text-white font-bold flex items-center gap-2">
                <List className="w-5 h-5 text-blue-400" />
                Detalles del Pre-Registro y Documentos
              </h2>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identidad (CI/RIF)</span>
                  <p className="text-sm font-bold font-mono text-slate-800">{rowToApprove.identidad}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre / Razón Social</span>
                  <p className="text-sm font-bold text-slate-800">{rowToApprove.contribuyente}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clasificación</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.tipo}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actividad Declarada</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.actividad}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nivel / Metraje</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.codigo || 'Por Asignar al Aprobar'}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Teléfono / Contacto</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.registro || 'N/A'}{rowToApprove.correo ? ` · ${rowToApprove.correo}` : ''}</p>
                </div>
                <div className="space-y-1 border-b border-slate-100 pb-2 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Domicilio Fiscal</span>
                  <p className="text-sm font-medium text-slate-800">{rowToApprove.domicilio_fiscal || rowToApprove.direccion || 'No especificado'}</p>
                </div>
                {rowToApprove.direccion_exacta && (
                  <div className="space-y-1 border-b border-slate-100 pb-2 col-span-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dirección Exacta</span>
                    <p className="text-sm font-medium text-slate-800">{rowToApprove.direccion_exacta}</p>
                  </div>
                )}
                <div className="space-y-1 border-b border-slate-100 pb-2 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notas u Observaciones</span>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{rowToApprove.nota || 'Ninguna'}</p>
                </div>

                {/* Sección de Documentos Adjuntos en Detalles */}
                <div className="col-span-2 space-y-3 pt-2">
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" /> Documentos Subidos en el Registro
                  </span>
                  {(() => {
                    const docs = extraerDocumentosDeFila(rowToApprove);
                    if (docs.length === 0) {
                      return <p className="text-xs text-slate-400 italic">Este registro no tiene documentos adjuntos.</p>;
                    }
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {docs.map((d) => {
                          const isImg = d.url.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|jfif)(\?|$)/i.test(d.url);
                          return (
                            <div key={d.key} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex flex-col justify-between gap-2">
                              <span className="font-bold text-xs text-slate-800">{d.label}</span>
                              {isImg && (
                                <div
                                  onClick={() => setPreviewDoc({ label: d.label, url: d.url, row: rowToApprove })}
                                  className="h-24 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer"
                                >
                                  <img src={d.url} alt={d.label} className="max-h-full max-w-full object-contain" />
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc({ label: d.label, url: d.url, row: rowToApprove })}
                                  className="flex-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Visualizar
                                </button>
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold"
                                  title="Abrir / Descargar"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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
                  className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Rechazar
                </button>
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleApproveClick(rowToApprove);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm flex justify-center cursor-pointer"
                >
                  Continuar a Aprobar y Asignar Nivel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISOR DE DOCUMENTO ADJUNTO */}
      {previewDoc && (
        <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setPreviewDoc(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm">
                  {previewDoc.label} {previewDoc.row ? `— ${previewDoc.row.contribuyente} (${previewDoc.row.identidad})` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar / Abrir
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-900/95 overflow-auto flex items-center justify-center p-4 min-h-[420px]">
              {previewDoc.url.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|jfif)(\?|$)/i.test(previewDoc.url) ? (
                <img src={previewDoc.url} alt={previewDoc.label} className="max-h-[75vh] max-w-full object-contain rounded shadow-lg" />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.label} className="w-full h-[75vh] bg-white rounded" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
