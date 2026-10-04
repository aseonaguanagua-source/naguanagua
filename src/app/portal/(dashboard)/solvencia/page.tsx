'use client';
import { useState, useEffect, useMemo } from 'react';
import { Award, Printer, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';

export default function SolvenciaPage() {
  const { recibos, inmuebles } = useAppContext();
  const [portalDoc, setPortalDoc] = useState('');
  const [contribuyenteNombre, setContribuyenteNombre] = useState('');
  const [selectedInmId, setSelectedInmId] = useState<string>('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || '';
    const nombre = localStorage.getItem('portal_nombre') || '';
    setPortalDoc(doc);
    setContribuyenteNombre(nombre);
  }, []);

  const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
  const soloNum = portalDoc.replace(/\D/g, '');

  const misFact = useMemo(() => recibos.filter((f: any) => {
    const ident = (f.identidad || '').replace(/-/g, '').toUpperCase();
    const cont = (f.contribuyente || '').replace(/-/g, '').toUpperCase();
    return portalDoc && (
      ident === docNorm || (soloNum && ident.includes(soloNum)) || 
      cont === docNorm || (soloNum && cont.includes(soloNum))
    );
  }), [recibos, portalDoc, docNorm, soloNum]);

  const misInmuebles = useMemo(() => inmuebles.filter((inm: any) => {
    const id = (inm.identidad || '').replace(/-/g, '').toUpperCase();
    return portalDoc && (id === docNorm || (soloNum && id.includes(soloNum)));
  }), [inmuebles, portalDoc, docNorm, soloNum]);

  useEffect(() => {
    if (misInmuebles.length > 0 && !selectedInmId) {
      setSelectedInmId(misInmuebles[0].id || misInmuebles[0].inmueble);
    }
  }, [misInmuebles, selectedInmId]);

  const activeInm = misInmuebles.find((i: any) => (i.id || i.inmueble) === selectedInmId) || misInmuebles[0];
  const isCondoUnit = activeInm && (!!activeInm.condominio_padre_id || (activeInm.actividad_principal || '').includes('HIJO_DE:'));
  const esPagoIndividual = activeInm && (activeInm.actividad_principal || '').includes('PAGOS INDIVIDUALES');
  const isBlockedByCondo = isCondoUnit && !esPagoIndividual;

  // Filtrar facturas asociadas a este inmueble
  const facturasInm = useMemo(() => {
    if (!activeInm) return misFact;
    const cod = activeInm.inmueble;
    return misFact.filter((f: any) => {
      if (!cod) return true;
      return f.referencia?.includes(cod) || (!f.referencia?.startsWith('CM-') && !f.referencia?.startsWith('RECIB-HIST-'));
    });
  }, [misFact, activeInm]);

  const pendientes = facturasInm.filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Abonado');
  const isSolvente = pendientes.length === 0 && (parseInt(activeInm?.meses_deuda || '0') === 0) && (parseFloat(activeInm?.deuda_mmv || '0') <= 0);

  const hoy = new Date();
  const mesHoy = hoy.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }).toUpperCase();
  const fechaLarga = hoy.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();

  if (!portalDoc) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Debe iniciar sesión para ver su solvencia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-12">

      {/* Selector de Inmuebles si tiene más de uno */}
      {misInmuebles.length > 1 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Seleccionar Inmueble para Solvencia:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {misInmuebles.map((inm: any) => {
              const isSelected = (inm.id || inm.inmueble) === (activeInm?.id || activeInm?.inmueble);
              const isCondo = !!inm.condominio_padre_id || (inm.actividad_principal || '').includes('HIJO_DE:');
              return (
                <button
                  key={inm.id || inm.inmueble}
                  type="button"
                  onClick={() => setSelectedInmId(inm.id || inm.inmueble)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    isSelected 
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' 
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800">{inm.inmueble}</span>
                    {isCondo ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">Condominio</span>
                    ) : (
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">Independiente</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-1">{inm.direccion || 'Sin dirección'}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notificación si este inmueble pertenece a condominio centralizado */}
      {isBlockedByCondo ? (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <AlertTriangle className="w-14 h-14 text-amber-600 mx-auto" />
          <h2 className="text-xl font-black text-amber-900 tracking-tight">Solvencia Gestionada por Condominio</h2>
          <p className="text-slate-700 text-sm max-w-lg mx-auto leading-relaxed">
            El inmueble <strong>{activeInm?.inmueble}</strong> pertenece a un condominio registrado con esquema de pagos centralizados.
          </p>
          <div className="p-4 bg-amber-100/80 border border-amber-300 rounded-xl text-amber-950 font-black text-sm max-w-md mx-auto shadow-sm">
            Solo diríjase al administrador del condominio para solicitar su solvencia.
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-5 max-w-md mx-auto text-left space-y-2 text-xs text-slate-700 shadow-sm">
            <div className="font-black text-slate-500 uppercase tracking-wider text-[11px] border-b pb-1">
              Consulta de Deuda del Inmueble
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Inmueble:</span>
              <strong className="text-slate-800">{activeInm?.inmueble}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Dirección:</span>
              <strong className="text-slate-800 text-right truncate max-w-[200px]">{activeInm?.direccion || 'N/A'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Meses de deuda:</span>
              <strong className={parseInt(activeInm?.meses_deuda || '0') > 0 ? "text-red-600 font-bold" : "text-emerald-600 font-bold"}>
                {activeInm?.meses_deuda || 0} mes(es)
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Deuda calculada:</span>
              <strong className="text-slate-900 font-bold">
                {parseFloat(activeInm?.deuda_mmv || 0) > 0 ? `${activeInm.deuda_mmv} MMV` : 'Al día'}
              </strong>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Estado Banner para Inmueble Independiente */}
          {!isSolvente ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-red-800">No puede obtener Certificado de Solvencia</h3>
                <p className="text-sm text-red-700 mt-1">
                  El inmueble <strong>{activeInm?.inmueble}</strong> tiene recibos o meses pendientes por pagar. 
                  Diríjase a la sección <strong>Donde Pagar</strong> para regularizar su deuda.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-emerald-800">¡Inmueble Solvente!</h3>
                <p className="text-sm text-emerald-700 mt-0.5">El inmueble {activeInm?.inmueble} no tiene recibos pendientes. Puede imprimir su Certificado de Solvencia.</p>
              </div>
            </div>
          )}

      {/* Certificado */}
      <div className={"bg-white rounded-xl shadow-lg border overflow-hidden relative " + (!isSolvente ? "border-red-200 opacity-60 pointer-events-none" : "border-slate-200")}>
        {!isSolvente && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none overflow-hidden">
            <span className="text-[120px] font-black text-red-500 opacity-10 -rotate-45 tracking-widest select-none">
              NO SOLVENTE
            </span>
          </div>
        )}

        <div className="p-8 sm:p-10 relative z-0">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-blue-700 rounded-full flex items-center justify-center shadow-inner">
                <Award className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">GLOBAL REC</h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Aseo Urbano · Municipio Naguanagua</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold text-slate-700 uppercase tracking-wide">Certificado de Solvencia</h2>
              <p className="text-xs text-slate-500 mt-1">Fecha: {fechaLarga}</p>
            </div>
          </div>

          {/* Datos Contribuyente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-[10px] font-bold text-slate-600 uppercase mb-3 border-b border-slate-200 pb-1">Datos del Contribuyente</h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2"><span className="w-28 text-slate-500 flex-shrink-0">Razón Social:</span><strong className="text-slate-800">{contribuyenteNombre || 'N/A'}</strong></div>
                <div className="flex gap-2"><span className="w-28 text-slate-500 flex-shrink-0">RIF / C.I.:</span><strong className="text-slate-800">{portalDoc}</strong></div>
                {misInmuebles[0] && (
                  <>
                    <div className="flex gap-2"><span className="w-28 text-slate-500 flex-shrink-0">Dirección:</span><strong className="text-slate-800 leading-tight">{misInmuebles[0].direccion || 'N/A'}</strong></div>
                    <div className="flex gap-2"><span className="w-28 text-slate-500 flex-shrink-0">Clasificación:</span><strong className="text-slate-800">{misInmuebles[0].clasificacion || misInmuebles[0].actividad_principal || 'N/A'}</strong></div>
                  </>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-slate-600 uppercase mb-3 border-b border-slate-200 pb-1">Estado de Cuenta</h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2"><span className="w-28 text-slate-500">Recibos Totales:</span><strong>{misFact.length}</strong></div>
                <div className="flex gap-2"><span className="w-28 text-slate-500">Pendientes:</span>
                  <strong className={pendientes.length > 0 ? 'text-red-600' : 'text-emerald-600'}>{pendientes.length}</strong>
                </div>
                <div className="flex gap-2"><span className="w-28 text-slate-500">Pagadas:</span>
                  <strong className="text-emerald-600">{misFact.filter((f: any) => f.estado === 'Pagado' || f.estado === 'Pagada').length}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Periodo */}
          <div className="mb-8">
            <h3 className="text-[10px] font-bold text-slate-600 uppercase mb-3 bg-slate-100 px-3 py-1.5">Período de Solvencia</h3>
            <div className={"p-6 text-center rounded border " + (isSolvente ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
              <div className={"text-2xl font-bold tracking-wide uppercase " + (isSolvente ? "text-emerald-700" : "text-red-700")}>
                {isSolvente ? "SOLVENTE · " + mesHoy : "NO SOLVENTE"}
              </div>
              {isSolvente && <div className="text-xs text-slate-500 mt-2">Válido para el mes en curso. Verifique periódicamente su estado de cuenta.</div>}
            </div>
          </div>

          {/* Declaracion */}
          {isSolvente && (
            <div className="mb-10">
              <h3 className="text-[10px] font-bold text-slate-600 uppercase mb-3 bg-slate-100 px-3 py-1.5">Declaración</h3>
              <p className="text-sm text-slate-700 text-justify leading-relaxed">
                Hacemos constar que el contribuyente referenciado ha cumplido con las obligaciones de pago establecidas en la
                <strong> Ordenanza Municipal de Aseo Urbano</strong>, encontrándose <strong>SOLVENTE</strong> en el período indicado.
                El presente certificado es válido únicamente para el mes en curso.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-slate-200 pt-6 flex justify-between items-end">
            <div className="text-center">
              <div className="w-32 border-t border-slate-400 mx-auto mb-1"></div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Director de Aseo Urbano</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400">Generado el {fechaLarga}</p>
              <p className="text-[10px] text-slate-400">Sistema Global Rec · Municipio Naguanagua</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón imprimir solo si solvente */}
      {isSolvente && (
        <div className="flex justify-center">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors shadow text-sm">
            <Printer className="w-4 h-4" /> Imprimir Certificado
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
