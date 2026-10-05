'use client';
import { useState, useEffect, useMemo } from 'react';
import { Award, Printer, AlertTriangle, CheckCircle2, RefreshCw, Building2, ShieldAlert, ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants } from '@/lib/formatters';
import Link from 'next/link';

export default function SolvenciaPage() {
  const [portalDoc, setPortalDoc] = useState('');
  const [contribuyenteNombre, setContribuyenteNombre] = useState('');
  const [inmueblesList, setInmueblesList] = useState<any[]>([]);
  const [facturasList, setFacturasList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInmId, setSelectedInmId] = useState<string>('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || '';
    const nombre = localStorage.getItem('portal_user') || localStorage.getItem('portal_nombre') || '';
    setPortalDoc(doc);
    setContribuyenteNombre(nombre);

    if (doc) {
      cargarDatos(doc, nombre);
    } else {
      setLoading(false);
    }
  }, []);

  const cargarDatos = async (doc: string, currentName: string) => {
    setLoading(true);
    try {
      const variants = getIdentidadVariants(doc);
      
      // 1. Cargar inmuebles directamente de Supabase (garantiza datos en tiempo real)
      const { data: inms, error: inmsErr } = await supabase
        .from('inmuebles')
        .select('*')
        .in('identidad', variants);

      if (inms && inms.length > 0) {
        setInmueblesList(inms);
        setSelectedInmId(inms[0].inmueble || inms[0].id);
        if (!currentName && inms[0].contribuyente) {
          setContribuyenteNombre(inms[0].contribuyente);
        }
      }

      // 2. Cargar facturas de Supabase
      const { data: facts } = await supabase
        .from('facturas')
        .select('*')
        .in('identidad', variants);

      if (facts) {
        setFacturasList(facts);
      }
    } catch (e) {
      console.error('Error cargando datos de solvencia:', e);
    } finally {
      setLoading(false);
    }
  };

  const activeInm = useMemo(() => {
    if (!inmueblesList.length) return null;
    return inmueblesList.find(i => (i.inmueble === selectedInmId || i.id === selectedInmId)) || inmueblesList[0];
  }, [inmueblesList, selectedInmId]);

  const isCondoUnit = activeInm && (!!activeInm.condominio_padre_id || (activeInm.actividad_principal || '').includes('HIJO_DE:'));
  const esPagoIndividual = activeInm && (activeInm.actividad_principal || '').includes('PAGOS INDIVIDUALES');
  const isBlockedByCondo = isCondoUnit && !esPagoIndividual;

  // Facturas y deudas del inmueble seleccionado
  const facturasInm = useMemo(() => {
    if (!activeInm) return [];
    const cod = activeInm.inmueble;
    return facturasList.filter((f: any) => {
      if (!cod) return true;
      return f.referencia?.includes(cod) || f.inmueble === cod;
    });
  }, [facturasList, activeInm]);

  const facturasPendientes = facturasInm.filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Abonado');
  
  // Reglas estrictas de solvencia municipal:
  // Requiere: 
  // 1. Inmueble existente y cargado
  // 2. 0 facturas pendientes
  // 3. 0 meses de deuda en inmuebles.meses_deuda
  // 4. deuda_mmv <= 0
  // 5. deuda_congelada_bs <= 0
  const mesesDeudaNum = activeInm ? parseInt(String(activeInm.meses_deuda || '0'), 10) : 999;
  const deudaMMVNum = activeInm ? parseFloat(String(activeInm.deuda_mmv || '0')) : 999;
  const deudaCongeladaNum = activeInm ? parseFloat(String(activeInm.deuda_congelada_bs || '0')) : 0;
  
  const isSolvente = Boolean(
    activeInm && 
    facturasPendientes.length === 0 && 
    mesesDeudaNum === 0 && 
    deudaMMVNum <= 0 && 
    deudaCongeladaNum <= 0
  );

  const hoy = new Date();
  const mesHoy = hoy.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }).toUpperCase();
  const fechaLarga = hoy.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
  const fechaVencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();

  const numeroCertificado = activeInm 
    ? `SOL-NAG-${hoy.getFullYear()}-${activeInm.inmueble}-${(portalDoc.replace(/\D/g, '')).slice(-4)}`
    : `SOL-NAG-${hoy.getFullYear()}-0000`;

  if (!portalDoc) {
    return (
      <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200 p-8 max-w-xl mx-auto my-10 shadow-sm">
        <Award className="w-16 h-16 mx-auto mb-4 text-emerald-600 opacity-40 animate-pulse" />
        <h2 className="text-xl font-bold text-slate-700 mb-2">Sesión Requerida</h2>
        <p className="text-sm text-slate-500 mb-6">Inicie sesión en el portal tributario para consultar el estado de solvencia de sus inmuebles.</p>
        <Link href="/portal" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors inline-block">
          Ir al Inicio de Sesión
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-slate-600 font-medium text-sm">Consultando padrón fiscal y estados de cuenta en tiempo real...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">

      {/* Selector de Inmuebles */}
      {inmueblesList.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Seleccionar Inmueble a Certificar ({inmueblesList.length} registrados):
            </label>
            <button 
              onClick={() => cargarDatos(portalDoc, contribuyenteNombre)} 
              className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar Estado
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {inmueblesList.map((inm: any) => {
              const isSelected = (inm.inmueble || inm.id) === selectedInmId;
              const inmSolv = parseInt(String(inm.meses_deuda || '0'), 10) === 0 && parseFloat(String(inm.deuda_mmv || '0')) <= 0;
              const isCondo = !!inm.condominio_padre_id || (inm.actividad_principal || '').includes('HIJO_DE:');

              return (
                <button
                  key={inm.id || inm.inmueble}
                  type="button"
                  onClick={() => setSelectedInmId(inm.inmueble || inm.id)}
                  className={`text-left p-3.5 rounded-xl border-2 transition-all relative overflow-hidden ${
                    isSelected 
                      ? 'border-emerald-600 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20' 
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-slate-800 tracking-tight">{inm.inmueble}</span>
                    {inmSolv ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> Solvente
                      </span>
                    ) : (
                      <span className="text-[10px] bg-rose-100 text-rose-800 font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 border border-rose-200">
                        <AlertTriangle className="w-3 h-3" /> Deuda ({inm.meses_deuda || 1} m)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-slate-600 truncate">{inm.actividad_principal || inm.tipo || 'Inmueble'}</p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{inm.direccion || 'Naguanagua'}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Condominio Bloqueado */}
      {isBlockedByCondo ? (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm print:hidden">
          <AlertTriangle className="w-14 h-14 text-amber-600 mx-auto" />
          <h2 className="text-xl font-black text-amber-900 tracking-tight">Solvencia Gestionada por Condominio</h2>
          <p className="text-slate-700 text-sm max-w-lg mx-auto leading-relaxed">
            El inmueble <strong>{activeInm?.inmueble}</strong> pertenece a una edificación sujeta al régimen de propiedad horizontal con administración centralizada.
          </p>
          <div className="p-4 bg-amber-100/90 border border-amber-300 rounded-xl text-amber-950 font-black text-sm max-w-md mx-auto shadow-sm">
            La Solvencia Municipal se tramita a través de la Junta o Administración del Condominio.
          </div>
        </div>
      ) : (
        <>
          {/* Banner de Estado */}
          <div className="print:hidden">
            {!isSolvente ? (
              <div className="bg-rose-50 border-2 border-rose-400 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-rose-900">INMUEBLE NO SOLVENTE · TRÁMITE DENEGADO</h3>
                    <p className="text-xs text-rose-700 mt-1 max-w-xl leading-relaxed">
                      El inmueble <strong>{activeInm?.inmueble}</strong> presenta <strong>{mesesDeudaNum} mes(es) de deuda acumulada</strong> ({deudaMMVNum.toFixed(2)} MMV). 
                      De conformidad con el Artículo 48 de la Ordenanza Municipal de Aseo Urbano, no se puede emitir el Certificado de Solvencia hasta la liquidación total de la deuda.
                    </p>
                  </div>
                </div>
                <Link 
                  href="/portal/pagos" 
                  className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow transition-colors"
                >
                  Pagar Recibos en Línea <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="bg-emerald-50 border-2 border-emerald-400 p-5 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-emerald-900">¡INMUEBLE SOLVENTE!</h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      El inmueble <strong>{activeInm?.inmueble}</strong> no registra adeudos ni meses pendientes. Puede imprimir o descargar su Certificado Oficial de Solvencia.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => window.print()} 
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow transition-colors"
                >
                  <Printer className="w-4 h-4" /> Imprimir Certificado
                </button>
              </div>
            )}
          </div>

          {/* ======================================================= */}
          {/* PLANTILLA OFICIAL DE CERTIFICADO DE SOLVENCIA MUNICIPAL */}
          {/* ======================================================= */}
          <div className={`bg-white rounded-2xl shadow-xl border overflow-hidden relative transition-all print:shadow-none print:border-none print:m-0 print:p-0 ${
            !isSolvente ? 'border-rose-300 opacity-90' : 'border-slate-300'
          }`}>

            {/* Marca de agua de No Solvente si no cumple requisitos */}
            {!isSolvente && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none bg-white/40 backdrop-blur-[1px]">
                <div className="border-8 border-rose-600/30 px-10 py-6 rounded-3xl -rotate-12 text-center shadow-2xl">
                  <span className="text-4xl md:text-6xl font-black text-rose-600/40 tracking-widest block uppercase">
                    NO SOLVENTE
                  </span>
                  <span className="text-xs md:text-sm font-black text-rose-700/50 tracking-wider block mt-2 uppercase">
                    Validez Legal Anulada por Deuda Activa
                  </span>
                </div>
              </div>
            )}

            <div className="p-8 sm:p-12 relative z-10 text-slate-800 print:p-6">
              
              {/* ENCABEZADO INSTITUCIONAL OFICIAL */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-5 mb-6 gap-4">
                {/* Logo Alcaldía Izquierda */}
                <div className="w-24 sm:w-28 flex-shrink-0 text-center">
                  <img 
                    src="/logos/ELIZABETH.png" 
                    alt="Gestión Municipal Elizabeth Niño" 
                    className="max-h-16 max-w-full object-contain mx-auto"
                  />
                </div>

                {/* Membrete Central */}
                <div className="text-center flex-1">
                  <p className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest leading-tight">
                    REPÚBLICA BOLIVARIANA DE VENEZUELA
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase tracking-wider leading-tight">
                    ESTADO CARABOBO · ALCALDÍA BOLIVARIANA DE NAGUANAGUA
                  </p>
                  <p className="text-[11px] sm:text-xs font-black text-emerald-800 uppercase tracking-wider mt-0.5">
                    INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC)
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    PLAN NAGUANAGUA BASURA CERO · GESTIÓN INTEGRAL DE RESIDUOS
                  </p>
                </div>

                {/* Logo IAMEC Derecha (Exclusivamente institucional) */}
                <div className="w-24 sm:w-28 flex-shrink-0 flex items-center justify-end">
                  <img 
                    src="/logos/IAMEC.png" 
                    alt="Instituto Autónomo Municipal de Ecosocialismo - IAMEC" 
                    className="max-h-20 max-w-[85px] object-contain"
                  />
                </div>
              </div>

              {/* TÍTULO DEL CERTIFICADO Y NÚMERO FISCAL */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
                    CERTIFICADO OFICIAL DE SOLVENCIA
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Servicio Público de Aseo Urbano, Domiciliario y Manejo de Desechos
                  </p>
                </div>
                <div className="text-right sm:text-right w-full sm:w-auto">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Nro. de Control:</span>
                  <span className="text-sm font-mono font-black text-emerald-800 tracking-wider">
                    {numeroCertificado}
                  </span>
                </div>
              </div>

              {/* SECCIÓN: DATOS DEL CONTRIBUYENTE Y DEL INMUEBLE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                
                {/* Cuadro 1: Contribuyente */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2.5">
                  <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    Datos del Contribuyente
                  </h3>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Razón Social / Nombre:</span>
                      <strong className="text-slate-900 font-black text-right max-w-[200px] truncate">
                        {contribuyenteNombre || activeInm?.contribuyente || 'DAVID ZARA'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Cédula / R.I.F.:</span>
                      <strong className="text-slate-900 font-mono font-bold">{portalDoc}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Condición Jurídica:</span>
                      <strong className="text-slate-800 font-semibold">
                        {portalDoc.startsWith('J') || portalDoc.startsWith('G') ? 'Persona Jurídica' : 'Persona Natural'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Correo Electrónico:</span>
                      <span className="text-slate-700 font-mono text-[11px]">{activeInm?.correo_electronico || 'davidzara66@gmail.com'}</span>
                    </div>
                  </div>
                </div>

                {/* Cuadro 2: Inmueble */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2.5">
                  <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    Identificación del Inmueble
                  </h3>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Código Catastral / Inmueble:</span>
                      <strong className="text-emerald-800 font-mono font-black">{activeInm?.inmueble || 'URB000000'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Destino / Uso:</span>
                      <strong className="text-slate-900 font-bold uppercase">{activeInm?.tipo || 'COMERCIAL'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Actividad Principal:</span>
                      <span className="text-slate-800 font-medium text-right max-w-[190px] truncate">{activeInm?.actividad_principal || 'Comercial General'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Ubicación:</span>
                      <span className="text-slate-800 text-right max-w-[200px] truncate font-medium">{activeInm?.direccion || 'Municipio Naguanagua, Estado Carabobo'}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* SECCIÓN: DICTAMEN DE SOLVENCIA */}
              <div className="mb-6">
                <div className={`p-5 rounded-2xl border text-center transition-all ${
                  isSolvente 
                    ? 'bg-emerald-50/80 border-emerald-300' 
                    : 'bg-rose-50/80 border-rose-300'
                }`}>
                  <div className="text-[11px] font-black tracking-widest uppercase mb-1 text-slate-500">
                    Dictamen de Solvencia Fiscal
                  </div>
                  <div className={`text-2xl sm:text-3xl font-black tracking-tight uppercase ${
                    isSolvente ? 'text-emerald-800' : 'text-rose-700'
                  }`}>
                    {isSolvente ? `SOLVENTE · ${mesHoy}` : 'NO SOLVENTE'}
                  </div>
                  <p className={`text-xs mt-2 font-medium max-w-lg mx-auto ${
                    isSolvente ? 'text-emerald-700' : 'text-rose-800'
                  }`}>
                    {isSolvente 
                      ? `Certificado oficial vigente hasta el ${fechaVencimiento}. Válido para trámites municipales, patentes y solvencias ante la Alcaldía de Naguanagua.` 
                      : `El inmueble mantiene ${mesesDeudaNum} período(s) adeudado(s) por un monto de ${deudaMMVNum.toFixed(2)} MMV. No posee validez legal hasta su cancelación.`
                    }
                  </p>
                </div>
              </div>

              {/* FE DE DECLARACIÓN OFICIAL */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 mb-8 text-justify text-xs text-slate-700 leading-relaxed space-y-2">
                <p>
                  El <strong>Instituto Autónomo Municipal de Ecosocialismo (IAMEC)</strong>, órgano adscrito a la 
                  <strong> Alcaldía Bolivariana del Municipio Naguanagua del Estado Carabobo</strong>, de conformidad con las atribuciones conferidas en la
                  <strong> Ordenanza de Gestión y Manejo Integral de la Recolección de Residuos y Desechos Sólidos</strong>, hace constar que:
                </p>
                <p>
                  El inmueble con la codificación <strong>{activeInm?.inmueble}</strong> {isSolvente 
                    ? 'se encuentra a la fecha en cumplimiento de sus obligaciones tributarias correspondientes al servicio de aseo urbano, estando SOLVENTE.' 
                    : 'registra obligaciones pecuniarias pendientes y NO SE ENCUENTRA SOLVENTE para la fecha de emisión de esta consulta.'}
                </p>
              </div>

              {/* PIE DEL CERTIFICADO: FIRMAS Y VALIDACIÓN QR */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t-2 border-slate-200 items-end text-center">
                
                {/* Firma 1: Director Aseo */}
                <div className="space-y-1">
                  <div className="w-36 h-12 border-b border-slate-400 mx-auto flex items-end justify-center pb-1">
                    <span className="font-serif italic text-xs text-slate-400 select-none">Firma Digitalizada</span>
                  </div>
                  <p className="text-[10px] font-black text-slate-800 uppercase">Dirección General</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-tight">Gestión Integral de Desechos IAMEC</p>
                </div>

                {/* Sello Central / QR */}
                <div className="space-y-1.5 flex flex-col items-center justify-center">
                  <div className="w-16 h-16 border-2 border-dashed border-emerald-600 rounded-xl flex items-center justify-center bg-white p-1 shadow-sm">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://aseonaguanaguaad.globalrecca.com/validar?cert=${numeroCertificado}`}
                      alt="Código QR de Verificación"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">Escaneo de Verificación</p>
                  <p className="text-[8px] text-slate-400 font-mono">validez-iam-naguanagua.ve</p>
                </div>

                {/* Firma 2: Recaudación */}
                <div className="space-y-1">
                  <div className="w-36 h-12 border-b border-slate-400 mx-auto flex items-end justify-center pb-1">
                    <span className="font-serif italic text-xs text-slate-400 select-none">Firma Autorizada</span>
                  </div>
                  <p className="text-[10px] font-black text-slate-800 uppercase">Coordinación de Recaudación</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-tight">Alcaldía Bolivariana de Naguanagua</p>
                </div>

              </div>

              {/* NOTA AL PIE LEGAL */}
              <div className="mt-8 pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center text-[9px] text-slate-400 gap-2">
                <span>Emitido el: {fechaLarga}</span>
                <span>Sistema de Recaudación Tributaria Municipal · Alcaldía de Naguanagua</span>
              </div>

            </div>

          </div>

          {/* BOTÓN IMPRIMIR */}
          <div className="flex justify-center pt-2 print:hidden">
            {isSolvente ? (
              <button 
                onClick={() => window.print()} 
                className="flex items-center gap-2.5 px-8 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-800 transition-all shadow-lg hover:shadow-emerald-700/20 text-sm"
              >
                <Printer className="w-5 h-5" /> Imprimir Certificado de Solvencia Oficial
              </button>
            ) : (
              <div className="text-center space-y-2">
                <button 
                  disabled 
                  className="flex items-center gap-2.5 px-8 py-3 bg-slate-300 text-slate-500 rounded-xl font-bold cursor-not-allowed text-sm opacity-80"
                >
                  <Printer className="w-5 h-5" /> Impresión Bloqueada (Inmueble con Deuda)
                </button>
                <p className="text-xs text-slate-500">
                  Para habilitar la impresión de este documento, debe saldar los meses en mora en la pestaña <strong>Donde Pagar</strong>.
                </p>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
