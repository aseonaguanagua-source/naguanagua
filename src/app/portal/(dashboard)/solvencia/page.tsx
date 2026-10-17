'use client';
import { useState, useEffect, useMemo } from 'react';
import { Award, Printer, AlertTriangle, CheckCircle2, RefreshCw, Building2, ShieldAlert, ShieldCheck, ArrowRight, ExternalLink, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants, formatActividad } from '@/lib/formatters';
import { isCondominioPagoIndividual } from '@/lib/calculos';
import { inmuebleTieneDeuda } from '@/lib/solvencia';
import { generarSolvenciaPDF } from '@/lib/pdfGenerator';
import Link from 'next/link';

export default function SolvenciaPage() {
  const [portalDoc, setPortalDoc] = useState('');
  const [contribuyenteNombre, setContribuyenteNombre] = useState('');
  const [inmueblesList, setInmueblesList] = useState<any[]>([]);
  const [facturasList, setFacturasList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
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
        // Excluir inmuebles eliminados
        const noEliminados = inms.filter((i: any) => i.estado !== 'Eliminado');

        // Mapear hijos asociados por padre_id
        const hijosPorPadre = new Map<string, any[]>();
        const codigosHijos = new Set<string>();

        noEliminados.forEach((i: any) => {
          if (i.padre_id && i.estado !== 'Eliminado') {
            const list = hijosPorPadre.get(i.padre_id) || [];
            list.push(i);
            hijosPorPadre.set(i.padre_id, list);
            codigosHijos.add(i.inmueble);
          }
        });

        // Construir inmuebles procesados: agrupar los N/A con sus actividades hijas
        const procesados = noEliminados
          .filter((i: any) => !codigosHijos.has(i.inmueble))
          .map((padre: any) => {
            const actividadesHijas = hijosPorPadre.get(padre.inmueble) || [];
            if (actividadesHijas.length === 0) return padre;

            // Regla oficial N/A: su pago y deuda es la sumatoria de sus actividades
            const sumMMV = Math.round(actividadesHijas.reduce((acc: number, c: any) => acc + (parseFloat(c.mmv_mes) || 0), 0) * 100) / 100;
            const maxMeses = actividadesHijas.reduce((acc: number, c: any) => {
              const m = parseInt(c.meses_deuda || 0);
              const d = parseFloat(c.deuda_mmv || 0);
              return Math.max(acc, m > 0 ? m : (d > 0 ? 1 : 0));
            }, parseInt(padre.meses_deuda || 0));
            const sumDeudaMMV = Math.round(actividadesHijas.reduce((acc: number, c: any) => acc + (parseFloat(c.deuda_mmv) || 0), parseFloat(padre.deuda_mmv || 0)) * 10000) / 10000;
            const sumCongelada = Math.round(actividadesHijas.reduce((acc: number, c: any) => acc + (parseFloat(c.deuda_congelada_bs) || 0), parseFloat(padre.deuda_congelada_bs || 0)) * 100) / 100;
            const sumMulta = Math.round(actividadesHijas.reduce((acc: number, c: any) => acc + (parseFloat(c.multa_bs) || 0), parseFloat(padre.multa_bs || 0)) * 100) / 100;

            return {
              ...padre,
              mmv_mes: sumMMV > 0 ? sumMMV : padre.mmv_mes,
              meses_deuda: maxMeses,
              deuda_mmv: sumDeudaMMV,
              deuda_congelada_bs: sumCongelada,
              multa_bs: sumMulta,
              cant_inmuebles: actividadesHijas.length,
              actividadesHijas,
              esGrupoNA: true
            };
          });

        setInmueblesList(procesados);
        setSelectedInmId(procesados[0]?.inmueble || procesados[0]?.id || '');
        if (!currentName && procesados[0]?.contribuyente) {
          setContribuyenteNombre(procesados[0].contribuyente);
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
  const esPagoIndividual = activeInm && ((activeInm.actividad_principal || '').includes('PAGOS INDIVIDUALES') || isCondominioPagoIndividual(activeInm));
  const isBlockedByCondo = isCondoUnit && !esPagoIndividual;

  // Facturas y deudas del inmueble seleccionado y todas sus actividades agrupadas
  const facturasInm = useMemo(() => {
    if (!activeInm) return [];
    const codigos = [
      activeInm.inmueble,
      ...(activeInm.actividadesHijas || []).map((h: any) => h.inmueble)
    ].filter(Boolean);

    return facturasList.filter((f: any) => {
      if (!codigos.length) return true;
      return codigos.some(cod => f.referencia?.includes(cod) || f.inmueble === cod);
    });
  }, [facturasList, activeInm]);

  const facturasPendientes = facturasInm.filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Abonado' || f.estado === 'Por Verificar');
  
  // Reglas estrictas de solvencia municipal:
  // Requiere: 
  // 1. Inmueble existente y activo
  // 2. 0 facturas pendientes del inmueble y de sus actividades
  // 3. 0 meses de deuda en inmueble y en todas sus actividades
  // 4. deuda_mmv <= 0
  // 5. deuda_congelada_bs <= 0
  const tieneDeudaHijos = Boolean(
    activeInm && (activeInm.actividadesHijas || []).some(inmuebleTieneDeuda)
  );

  const mesesDeudaNum = activeInm ? parseInt(String(activeInm.meses_deuda || '0'), 10) : 999;
  const deudaMMVNum = activeInm ? parseFloat(String(activeInm.deuda_mmv || '0')) : 999;
  const deudaCongeladaNum = activeInm ? parseFloat(String(activeInm.deuda_congelada_bs || '0')) : 0;
  
  const [serverSolvencia, setServerSolvencia] = useState<{ checked: boolean; solvente: boolean; mensaje: string; bloqueadoRetencion?: boolean }>({ checked: false, solvente: false, mensaje: '', bloqueadoRetencion: false });

  useEffect(() => {
    if (!activeInm || !portalDoc) return;
    let cancel = false;
    fetch('/api/solvencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identidad: portalDoc, inmueble: activeInm.inmueble })
    })
      .then(res => res.json())
      .then(data => {
        if (!cancel && typeof data?.solvente === 'boolean') {
          setServerSolvencia({
            checked: true,
            solvente: data.solvente,
            mensaje: data.mensaje || '',
            bloqueadoRetencion: !!data.bloqueadoRetencion
          });
        }
      })
      .catch(() => {
        if (!cancel) {
          setServerSolvencia({ checked: true, solvente: !inmuebleTieneDeuda(activeInm) && !tieneDeudaHijos && facturasPendientes.length === 0, mensaje: '', bloqueadoRetencion: false });
        }
      });
    return () => { cancel = true; };
  }, [activeInm?.inmueble, portalDoc]);

  // Regla oficial de solvencia: única por inmueble y requiere 0 deuda (propia y de sus actividades), 0 facturas pendientes y validación de padrón
  const isSolvente = Boolean(
    activeInm && 
    activeInm.estado === 'Activo' &&
    !inmuebleTieneDeuda(activeInm) && 
    !tieneDeudaHijos &&
    facturasPendientes.length === 0 &&
    !isBlockedByCondo &&
    (!serverSolvencia.checked || serverSolvencia.solvente)
  );

  const handleDescargarPDF = async () => {
    if (!activeInm || !isSolvente) {
      if (serverSolvencia.bloqueadoRetencion) {
        alert(`Trámite denegado: El contribuyente registra pagos con retención de IVA (75%) sin comprobante consignado o aprobado ante Hacienda Municipal. Ingrese a "Retención" y cargue su planilla para desbloquear la solvencia.`);
        return;
      }
      alert(`Trámite denegado: El inmueble ${activeInm?.inmueble || ''} registra obligaciones tributarias pendientes en sus actividades y no se encuentra solvente.`);
      return;
    }
    setDownloading(true);
    try {
      await generarSolvenciaPDF({
        Identidad: portalDoc,
        Contribuyente: activeInm.contribuyente || contribuyenteNombre || 'Contribuyente',
        Telefono: activeInm.telefono || '+58 412-9030238',
        Direccion: activeInm.direccion || 'Municipio Naguanagua',
        CodCont: activeInm.inmueble,
        id: activeInm.id
      }, activeInm.inmueble);
    } catch (e: any) {
      alert('Error al generar PDF de Solvencia: ' + (e?.message || 'Error'));
    } finally {
      setDownloading(false);
    }
  };

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
              const tieneHijosDeuda = (inm.actividadesHijas || []).some(inmuebleTieneDeuda);
              const inmSolv = inm.estado === 'Activo' && !inmuebleTieneDeuda(inm) && !tieneHijosDeuda;
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
                  <p className="text-[11px] font-medium text-slate-600 truncate">
                    {inm.actividadesHijas?.length 
                      ? `N/A · ${inm.actividadesHijas.length} actividades agrupadas (${parseFloat(inm.mmv_mes || 0).toFixed(2)} MMV)` 
                      : (formatActividad(inm.actividad_principal) || inm.tipo || 'Inmueble')}
                  </p>
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
                    <h3 className="text-base font-black text-rose-900">
                      {serverSolvencia.bloqueadoRetencion 
                        ? 'RETENCIÓN DE IVA PENDIENTE · SOLVENCIA BLOQUEADA' 
                        : 'INMUEBLE NO SOLVENTE · TRÁMITE DENEGADO'}
                    </h3>
                    <p className="text-xs text-rose-700 mt-1 max-w-xl leading-relaxed">
                      {serverSolvencia.bloqueadoRetencion ? (
                        <>
                          Como <strong>Agente de Retención de IVA</strong>, el inmueble <strong>{activeInm?.inmueble}</strong> registra facturas o pagos con retención del 75% cuyo comprobante fiscal aún no ha sido consignado o validado por Hacienda Municipal. Debe ingresar a la sección <strong>Retención</strong> y adjuntar su comprobante oficial emitido ante el SENIAT para desbloquear su Certificado de Solvencia.
                        </>
                      ) : (
                        <>
                          El inmueble <strong>{activeInm?.inmueble}</strong> presenta <strong>{mesesDeudaNum} mes(es) de deuda acumulada</strong> ({deudaMMVNum.toFixed(2)} MMV){activeInm?.actividadesHijas?.length ? ` en sus ${activeInm.actividadesHijas.length} actividades económicas asociadas` : ''}. 
                          De conformidad con el Artículo 48 de la Ordenanza Municipal de Aseo Urbano, no se puede emitir el Certificado de Solvencia hasta la liquidación total de la deuda.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {serverSolvencia.bloqueadoRetencion ? (
                  <Link 
                    href="/portal/retenciones" 
                    className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow transition-colors"
                  >
                    Subir Comprobante de Retención <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link 
                    href="/portal/pagos" 
                    className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow transition-colors"
                  >
                    Pagar Recibos en Línea <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
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
                      El inmueble <strong>{activeInm?.inmueble}</strong> no registra adeudos ni meses pendientes{activeInm?.actividadesHijas?.length ? ` en ninguna de sus ${activeInm.actividadesHijas.length} actividades económicas` : ''}. Puede imprimir o descargar su Certificado Oficial de Solvencia.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={handleDescargarPDF}
                    disabled={downloading}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow transition-colors disabled:opacity-50"
                  >
                    {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {downloading ? 'Descargando...' : 'Descargar PDF'}
                  </button>
                  <button 
                    onClick={() => window.print()} 
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================= */}
          {/* PLANTILLA OFICIAL DE CERTIFICADO DE SOLVENCIA MUNICIPAL */}
          {/* ======================================================= */}
          {!isSolvente ? (
            <div className="bg-white rounded-2xl p-8 sm:p-12 border-2 border-rose-200 text-center space-y-5 shadow-sm print:hidden">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <ShieldAlert className="w-9 h-9" />
              </div>
              <div className="max-w-lg mx-auto space-y-3">
                <h3 className="text-xl sm:text-2xl font-black text-rose-950 uppercase tracking-tight">
                  Certificado de Solvencia No Disponible
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  El inmueble <strong className="font-mono text-slate-900 font-bold">{activeInm?.inmueble}</strong> registra obligaciones tributarias pendientes por concepto de aseo urbano ({mesesDeudaNum > 0 ? `${mesesDeudaNum} mes(es) en mora` : 'pagos pendientes'}{activeInm?.actividadesHijas?.length ? ` en sus ${activeInm.actividadesHijas.length} actividades económicas asociadas` : ''}).
                </p>
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold text-left space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-rose-950">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    Principio de Solvencia Individual Única por Inmueble:
                  </div>
                  <p className="text-rose-800">
                    De conformidad con el Artículo 48 de la Ordenanza Municipal de Aseo Urbano, la solvencia es un documento único e individual por inmueble y no puede ser emitido, visualizado ni impreso mientras existan períodos en mora.
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <Link
                  href="/portal/pagos"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-xs transition-colors shadow-sm"
                >
                  Ir al Módulo de Pagos para Liquidar Deuda <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-300 overflow-hidden relative transition-all print:shadow-none print:border-none print:m-0 print:p-0">

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
                        {activeInm?.contribuyente || contribuyenteNombre || 'Contribuyente'}
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
                      <span className="text-slate-700 font-mono text-[11px]">{activeInm?.correo_electronico || activeInm?.correo || activeInm?.email || (typeof window !== 'undefined' ? localStorage.getItem('portal_email') : '') || 'No registrado'}</span>
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
                      <span className="text-slate-800 font-medium text-right max-w-[200px] truncate" title={activeInm?.actividadesHijas?.length ? activeInm.actividadesHijas.map((h: any) => formatActividad(h.actividad_principal)).join(', ') : formatActividad(activeInm?.actividad_principal)}>
                        {activeInm?.actividadesHijas?.length 
                          ? `N/A (${activeInm.actividadesHijas.length} Actividades agrupadas)` 
                          : (formatActividad(activeInm?.actividad_principal) || 'Comercial General')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Tarifa Mensual:</span>
                      <strong className="text-slate-900 font-mono text-right">{parseFloat(activeInm?.mmv_mes || 0).toFixed(2)} MMV/mes</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Ubicación:</span>
                      <span className="text-slate-800 text-right max-w-[200px] truncate font-medium">{activeInm?.direccion || 'Municipio Naguanagua, Estado Carabobo'}</span>
                    </div>
                  </div>

                  {activeInm?.actividadesHijas && activeInm.actividadesHijas.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Actividades Económicas Agrupadas ({activeInm.actividadesHijas.length}):
                      </span>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {activeInm.actividadesHijas.map((h: any) => (
                          <div key={h.inmueble || h.id} className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-200">
                            <span className="font-mono font-bold text-slate-700">{h.inmueble}: <span className="font-sans font-normal text-slate-600">{formatActividad(h.actividad_principal) || 'Actividad'}</span></span>
                            <span className="font-semibold text-slate-600">{parseFloat(h.mmv_mes || 0).toFixed(2)} MMV</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                  <p className="text-[9px] text-slate-500 uppercase tracking-tight">Instituto Autónomo Municipal de Ecosocialismo (IAMEC)</p>
                </div>

              </div>

              {/* NOTA AL PIE LEGAL */}
              <div className="mt-8 pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center text-[9px] text-slate-400 gap-2">
                <span>Emitido el: {fechaLarga}</span>
                <span>Sistema de Recaudación Tributaria Municipal · IAMEC Naguanagua</span>
              </div>

            </div>

          </div>
          )}

          {/* BOTÓN IMPRIMIR / DESCARGAR (SOLO DISPONIBLE CUANDO ESTÁ 100% SOLVENTE) */}
          {isSolvente && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 print:hidden">
              <button 
                onClick={handleDescargarPDF}
                disabled={downloading}
                className="flex items-center gap-2.5 px-7 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-600/20 text-sm disabled:opacity-50"
              >
                {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {downloading ? 'Generando PDF Oficial...' : 'Descargar Certificado Oficial (PDF)'}
              </button>
              <button 
                onClick={() => window.print()} 
                className="flex items-center gap-2.5 px-7 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow text-sm"
              >
                <Printer className="w-5 h-5" /> Imprimir en Navegador
              </button>
            </div>
          )}
        </>
      )}

    </div>
  );
}
