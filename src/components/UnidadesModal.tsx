'use client';
import React, { useState, useEffect } from 'react';
import { X, Save, Edit, Trash2, ShieldCheck, CreditCard, Building2, Store, Download, Plus, XCircle, FileText, Receipt, Edit2, Key, Power, Copy, EyeOff, Eye, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useAppContext } from '@/store/AppContext';
import { logos } from '@/lib/logosBase64';
import economicActivitiesBase from '@/lib/economicActivitiesBase.json';
import { formatPhoneNumber, isFictitiousEmail } from '@/lib/formatters';

interface UnidadesModalProps {
  condominioId: number;
  condominioNombre: string;
  condominioIdentidad?: string;
  condominioCodigoPadre?: string;
  onClose?: () => void;
  isInline?: boolean;
}

// Los hijos de un condominio son filas de la tabla `inmuebles` con condominio_padre_id = codigo del padre.
// Genera el siguiente codigo URBxxxxxx disponible (formato estandar de 6 digitos).
async function generarCodigoInmueble(): Promise<string> {
  const { data } = await supabase
    .from('inmuebles')
    .select('inmueble')
    .like('inmueble', 'URB______')
    .order('inmueble', { ascending: false })
    .limit(1);
  const last = data?.[0]?.inmueble || 'URB000000';
  const num = parseInt(last.replace('URB', ''), 10) || 0;
  return `URB${String(num + 1).padStart(6, '0')}`;
}

const normId = (s: any) => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

function mapInmuebleToUnidad(inm: any, condominioId: number) {
  const rawPropietario = inm.contribuyente || 'No asignado';
  const isDesocupado = rawPropietario.toUpperCase().includes('DESOCUPAD') || (inm.actividad_principal || '').toUpperCase().includes('DESOCUPAD');
  let numUnidad = inm.inmueble || '';
  if (inm.direccion) {
    const matchLoc = inm.direccion.match(/(?:LOCAL|LOCAL COMERCIAL|STAND|KIOSCO|APTO|NRO\.)\s+(?:NRO\.\s+)?([A-Z0-9\-]+)/i);
    if (matchLoc && matchLoc[1]) numUnidad = `${matchLoc[1]} (${inm.inmueble})`;
  }
  return {
    id: inm.id,
    condominio_id: condominioId,
    numero_unidad: numUnidad,
    codigo_ch: inm.inmueble,
    cod_cont: inm.cod_cont || '',
    direccion: inm.direccion || '',
    propietario: isDesocupado ? 'Desocupado / Vacante' : rawPropietario,
    propietario_raw: inm.contribuyente || '',
    cedula_rif: inm.identidad || '',
    telefono: inm.telefono || '',
    correo: inm.correo_electronico || '',
    ficha_catastral: '',
    estado: (parseInt(inm.meses_deuda || '0') > 0 || parseFloat(inm.deuda_mmv || '0') > 0 || parseFloat(inm.multa_bs || '0') > 0) ? 'Con Deuda' : 'Solvente',
    estado_registro: inm.estado || 'Activo',
    activo: inm.estado !== 'Inactivo' && inm.estado !== 'Eliminado',
    ocupacion: isDesocupado ? 'Desocupada' : 'Ocupada',
    clave_acceso: inm.clave_portal || '',
    es_migrado: true,
    actividad_economica_id: inm.actividad_economica_id,
    actividad: inm.actividad_principal || '',
    meses_deuda: parseInt(inm.meses_deuda || '0'),
    deuda_mmv: parseFloat(inm.deuda_mmv || '0'),
    multa_bs: parseFloat(inm.multa_bs || '0'),
    tipo: inm.tipo || 'COMERCIAL'
  };
}

export function UnidadesModal({ condominioId, condominioNombre, condominioIdentidad, condominioCodigoPadre, onClose, isInline }: UnidadesModalProps) {
  const [unidades, setUnidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const [nuevoPropietario, setNuevoPropietario] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoCorreo, setNuevoCorreo] = useState('');
  const [nuevaFicha, setNuevaFicha] = useState('');
  const [nuevaCedula, setNuevaCedula] = useState('');
  const [guardando, setGuardando] = useState(false);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState({
    direccion: '',
    propietario: '',
    cedula_rif: '',
    telefono: '',
    correo: '',
    tipo: 'COMERCIAL'
  });

  // Credenciales por unidad
  const [showCredencial, setShowCredencial] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState<Set<number>>(new Set());
  const [editingClave, setEditingClave] = useState<number | null>(null);
  const [nuevaClave, setNuevaClave] = useState('');
  const [savingClave, setSavingClave] = useState(false);

  // Estado de cuenta por unidad
  const [showEstado, setShowEstado] = useState<number | null>(null);

  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetchUnidades();
  }, [condominioId, condominioCodigoPadre, condominioIdentidad]);

  const fetchUnidades = async () => {
    setLoading(true);
    const searchPadre = condominioCodigoPadre || '';
    const searchRif = condominioIdentidad || '';

    let inms: any[] = [];
    try {
      const filterParts: string[] = [];
      if (searchPadre) {
        filterParts.push(`condominio_padre_id.eq.${searchPadre}`);
        filterParts.push(`actividad_principal.ilike.%[HIJO_DE:${searchPadre}]%`);
      }
      if (searchRif) {
        filterParts.push(`condominio_padre_id.eq.${searchRif}`);
        filterParts.push(`identidad.eq.${searchRif}`);
      }

      if (filterParts.length > 0) {
        const { data: inmsData } = await supabase
          .from('inmuebles')
          .select('*')
          .or(filterParts.join(','));
        inms = (inmsData || []).filter((i: any) => {
          if (i.inmueble === searchPadre || i.inmueble === searchRif) return false;
          if (i.estado === 'Eliminado') return false; // eliminados no cuentan como unidades
          if (i.es_condominio) return false;
          // Inmuebles del mismo RIF solo si no pertenecen a otro condominio
          const padre = i.condominio_padre_id || '';
          if (padre && padre !== searchPadre && padre !== searchRif) return false;
          return true;
        });
      }
    } catch (err) {
      console.error('Error fetching inmuebles hijos:', err);
    }

    const mapped = inms
      .map((inm: any) => mapInmuebleToUnidad(inm, condominioId))
      .sort((a: any, b: any) => (a.activo === b.activo ? String(a.codigo_ch).localeCompare(String(b.codigo_ch)) : a.activo ? -1 : 1));

    setUnidades(mapped);
    setLoading(false);
  };

  const agregarUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaUnidad || guardando) return;
    if (!condominioCodigoPadre) {
      alert('El condominio no tiene código de inmueble padre. No se puede agregar la unidad.');
      return;
    }
    setGuardando(true);
    try {
      const identidad = (nuevaCedula || '').trim().toUpperCase() || condominioIdentidad || '';
      if (!identidad) throw new Error('Debe indicar la Cédula/RIF del propietario.');

      // FK inmuebles.identidad -> contribuyentes.identidad
      if (nuevaCedula.trim()) {
        await supabase.from('contribuyentes').upsert([{
          identidad,
          nombre: nuevoPropietario || condominioNombre,
          telefono: nuevoTelefono || '',
          email: nuevoCorreo || ''
        }], { onConflict: 'identidad', ignoreDuplicates: true });
      }

      const codigo = await generarCodigoInmueble();
      const { error } = await supabase.from('inmuebles').insert([{
        inmueble: codigo,
        identidad,
        contribuyente: nuevoPropietario || condominioNombre,
        telefono: nuevoTelefono || '',
        correo_electronico: nuevoCorreo || '',
        direccion: `LOCAL ${nuevaUnidad.trim().replace(/\s+/g, '-')}`,
        notas: nuevaFicha ? `Ficha catastral: ${nuevaFicha}` : null,
        condominio_padre_id: condominioCodigoPadre,
        es_condominio: false,
        estado: 'Activo',
        tipo: 'COMERCIAL',
        clasificacion: 'Individual',
        actividad_principal: 'N/A',
        mmv_mes: 0,
        deuda_mmv: 0,
        meses_deuda: 0,
        multa_bs: 0
      }]);
      if (error) throw error;

      await addAuditLog('AGREGAR_UNIDAD_CONDOMINIO', JSON.stringify({ codigo, unidad: nuevaUnidad, condominio: condominioNombre }));
      setNuevaUnidad('');
      setNuevoPropietario('');
      setNuevaCedula('');
      setNuevoTelefono('');
      setNuevoCorreo('');
      setNuevaFicha('');
      await fetchUnidades();
    } catch (err: any) {
      alert('Error agregando unidad: ' + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const [statusModal, setStatusModal] = useState<{ type: string, u: any } | null>(null);
  const [statusNota, setStatusNota] = useState('');
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);
  const { recibos, addAuditLog } = useAppContext();

  const handleStatusSubmit = async () => {
    if (!statusModal || !statusNota.trim()) {
      alert("Debe ingresar el motivo obligatoriamente.");
      return;
    }
    setIsProcessingStatus(true);
    try {
      const { type, u } = statusModal;
      const nuevoEstado = type === 'Eliminar' ? 'Eliminado' : 'Inactivo';
      const { error } = await supabase.from('inmuebles').update({ estado: nuevoEstado }).eq('id', u.id);
      if (error) throw error;

      await addAuditLog(
        type === 'Eliminar' ? 'ELIMINAR_UNIDAD_CONDOMINIO' : 'DESACTIVAR_UNIDAD_CONDOMINIO',
        JSON.stringify({
          unidad_id: u.id,
          codigo: u.codigo_ch,
          numero: u.numero_unidad,
          condominio: condominioNombre,
          motivo: statusNota.trim()
        })
      );
      if (type === 'Eliminar') {
        setUnidades(unidades.filter(x => x.id !== u.id));
      } else {
        setUnidades(unidades.map(x => x.id === u.id ? { ...x, activo: false, estado_registro: 'Inactivo' } : x));
      }
      setStatusModal(null);
      setStatusNota('');
      alert(`Unidad ${type === 'Eliminar' ? 'eliminada' : 'desactivada'} exitosamente.`);
    } catch (err: any) {
      alert(`Error procesando acción: ${err.message}`);
    } finally {
      setIsProcessingStatus(false);
    }
  };

  const toggleActivoUnidad = async (u: any) => {
    if (u.activo === false) {
      // Reactivar no pide nota
      const { error } = await supabase.from('inmuebles').update({ estado: 'Activo' }).eq('id', u.id);
      if (error) {
        alert('Error reactivando unidad: ' + error.message);
        return;
      }
      await addAuditLog('REACTIVAR_UNIDAD_CONDOMINIO', JSON.stringify({ codigo: u.codigo_ch, condominio: condominioNombre }));
      setUnidades(unidades.map(x => x.id === u.id ? { ...x, activo: true, estado_registro: 'Activo' } : x));
    } else {
      setStatusModal({ type: 'Desactivar', u });
    }
  };

  const iniciarEdicion = (u: any) => {
    setEditingId(u.id);
    setEditForm({
      direccion: u.direccion || '',
      propietario: u.propietario_raw || u.propietario || '',
      cedula_rif: u.cedula_rif || '',
      telefono: u.telefono || '',
      correo: u.correo || '',
      tipo: (u.tipo || 'COMERCIAL').toUpperCase().includes('RESID') ? 'RESIDENCIAL' : 'COMERCIAL'
    });
  };

  const guardarEdicion = async (id: string | number) => {
    if (guardando) return;
    setGuardando(true);
    try {
      const original = unidades.find(u => u.id === id);
      const identidad = editForm.cedula_rif.trim().toUpperCase();
      if (!identidad) throw new Error('La Cédula/RIF es obligatoria.');

      if (normId(identidad) !== normId(original?.cedula_rif)) {
        // Asegurar que el nuevo propietario exista en contribuyentes (FK)
        const { error: eC } = await supabase.from('contribuyentes').upsert([{
          identidad,
          nombre: editForm.propietario || 'No asignado',
          telefono: editForm.telefono || '',
          email: editForm.correo || ''
        }], { onConflict: 'identidad', ignoreDuplicates: true });
        if (eC) throw eC;
      }

      const { data, error } = await supabase
        .from('inmuebles')
        .update({
          direccion: editForm.direccion,
          contribuyente: editForm.propietario,
          identidad,
          telefono: editForm.telefono,
          correo_electronico: editForm.correo,
          tipo: editForm.tipo
        })
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No se pudo actualizar (sin permisos o registro inexistente).');

      await addAuditLog('EDITAR_UNIDAD_CONDOMINIO', JSON.stringify({
        codigo: original?.codigo_ch,
        condominio: condominioNombre,
        antes: { propietario: original?.propietario_raw, identidad: original?.cedula_rif, direccion: original?.direccion },
        despues: { propietario: editForm.propietario, identidad, direccion: editForm.direccion }
      }));
      setUnidades(unidades.map(u => u.id === id ? mapInmuebleToUnidad(data[0], condominioId) : u));
      setEditingId(null);
    } catch (err: any) {
      alert('Error guardando cambios: ' + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  };

  
  // Logic to check if the entire Condominio is solvent (no pending invoices)
  // Searches by identidad AND by nombre because recibos may store either
  const hasCondominioDebt = React.useMemo(() => {
    const rif = normId(condominioIdentidad);
    const pendingFacturas = (recibos || []).filter((f: any) => {
      if (f.estado !== 'Pendiente' && f.estado !== 'Abonado') return false;
      return !!rif && normId(f.identidad) === rif;
    });
    return pendingFacturas.length > 0;
  }, [recibos, condominioIdentidad]);

  // Recibos de una unidad especifica (por RIF/Cedula de la unidad)
  const recibosDeUnidad = (u: any) => {
    const rif = normId(u.cedula_rif);
    if (!rif) return [];
    return (recibos || []).filter((f: any) => normId(f.identidad) === rif);
  };

  // Helper to load image as base64
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

  const emitirSolvencia = async (unidad: any) => {
    const isUnitSolvent = !hasCondominioDebt; // Real debt check — cannot emit solvencia with pending recibos
    if (!isUnitSolvent) {
      alert("No se puede emitir solvencia porque la unidad o el condominio presenta deudas pendientes.");
      return;
    }

    try {
      const doc = new jsPDF();
      
      // Header background (gray bar)
      doc.setFillColor(230, 230, 230); // light gray
      doc.rect(0, 0, 210, 40, 'F');
      
      // IAMEC Naguanagua logo only
      doc.addImage(logos.iamec, 'PNG', 15, 8, 45, 25);
      
      // Header Text
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(50, 50, 50);
      doc.text("CERTIFICADO DE SOLVENCIA", 200, 20, { align: "right" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const codigoUnico = `S-${new Date().getTime().toString().slice(-6)}`;
      doc.text(`Nº Certificado: ${codigoUnico}`, 200, 28, { align: "right" });
      
      const fechaActual = new Date();
      const fechaActualStr = fechaActual.toLocaleDateString('es-VE');
      doc.text(`Fecha: ${fechaActualStr}`, 200, 34, { align: "right" });
      
      // Section 1: DATOS DEL CONTRIBUYENTE & DETALLES DEL INMUEBLE
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("DATOS DEL CONTRIBUYENTE", 15, 55);
      doc.text("DETALLES DEL INMUEBLE", 110, 55);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      // Contribuyente data
      doc.text("Razón Social:", 15, 62);
      doc.setFont("helvetica", "bold");
      doc.text(unidad.propietario || 'Propietario No Asignado', 40, 62);
      
      doc.setFont("helvetica", "normal");
      doc.text("RIF / C.I.:", 15, 68);
      doc.text(unidad.cedula_rif || condominioIdentidad || 'N/A', 40, 68);
      
      doc.text("Teléfono:", 15, 74);
      doc.text(formatPhoneNumber(unidad.telefono) || 'N/A', 40, 74);
      
      doc.text("Código:", 15, 80);
      doc.text(unidad.codigo_ch || 'N/A', 40, 80);
      
      // Inmueble data
      doc.setFont("helvetica", "normal");
      doc.text("Nro de Inmueble:", 110, 62);
      doc.text(unidad.numero_unidad, 135, 62);
      
      doc.text("Condominio:", 110, 68);
      doc.text(condominioNombre, 130, 68);
      
      doc.text("Dirección:", 110, 74);
      const dirSplit = doc.splitTextToSize('Naguanagua Municipio Naguanagua', 70);
      doc.text(dirSplit, 130, 74);
      
      // Section 2: PERÍODO DE SOLVENCIA
      doc.setFillColor(230, 230, 230);
      doc.rect(15, 95, 180, 8, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("PERÍODO DE SOLVENCIA", 18, 100);
      
      doc.setDrawColor(230, 230, 230);
      doc.setFillColor(245, 245, 245);
      doc.rect(15, 103, 180, 25, 'FD');
      
      const fechaEmision = new Date();
      const anio = fechaEmision.getFullYear();
      const mes = fechaEmision.getMonth();
      const ultimoDia = new Date(anio, mes + 1, 0).getDate();
      const mesStr = ('0' + (mes + 1)).slice(-2);
      const vencMesAnio = `${mesStr}-${anio}`;
      const vencStr = `${String(ultimoDia).padStart(2, '0')}/${mesStr}/${anio}`;
      
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 144, 255); // blue
      doc.text(`SOLVENTE HASTA: ${vencMesAnio}`, 105, 115, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`CERTIFICADO VÁLIDO HASTA: ${vencStr}`, 105, 123, { align: "center" });
      
      // Section 3: DECLARACIÓN
      doc.setFillColor(230, 230, 230);
      doc.rect(15, 135, 180, 8, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("DECLARACIÓN", 18, 140);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const declText = "Hacemos constar que el inmueble referenciado ha cumplido con las obligaciones de pago señaladas en la Ordenanza Municipal por concepto de ASEO URBANO, encontrándose solvente hasta el período indicado.";
      const splitDecl = doc.splitTextToSize(declText, 175);
      doc.text(splitDecl, 15, 150);
      
      // QR Code
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://aseonaguanagua.globalrecca.com';
      const qrData = `${baseUrl}/validar?codigo=${codigoUnico}`;
      const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 100 });
      doc.addImage(qrDataUrl, 'PNG', 85, 180, 40, 40);
      
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text("Escanee este código QR para validar la autenticidad de este certificado de", 105, 225, { align: 'center' });
      doc.text(`solvencia. La validación en línea estará disponible hasta: ${vencStr}`, 105, 229, { align: 'center' });
      
      // Footer Note
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      const noteText = "Nota: Este documento es válido únicamente para los fines establecidos por la normativa municipal vigente y pierde su validez una vez vencida la fecha de expiración indicada. Cualquier alteración o modificación invalida el presente certificado.";
      const splitNote = doc.splitTextToSize(noteText, 180);
      doc.text(splitNote, 15, 240);
      
      doc.save(`Solvencia_${unidad.numero_unidad}_${new Date().getTime()}.pdf`);
    } catch (e: any) {
      alert("Error al generar PDF de Solvencia: " + e.message);
      console.error(e);
    }
  };

  const modalContent = (
    <>
      <div className={`bg-white w-full flex flex-col overflow-hidden ${isInline ? 'mt-4 border border-slate-200 rounded-lg shadow-sm' : 'rounded-xl shadow-xl max-w-5xl max-h-[90vh]'}`}>
        {/* Header */}
        {!isInline && (
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Unidades del Condominio</h2>
            <p className="text-sm text-slate-500 mt-1">{condominioNombre} • RIF: {condominioIdentidad || 'N/A'}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 hover:text-slate-700">
              <X size={24} />
            </button>
          )}
        </div>
      )}
      
      {isInline && (
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Unidades del Condominio Registradas</h3>
        </div>
      )}

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Add Form */}
          <form onSubmit={agregarUnidad} className="flex flex-col gap-4 mb-8 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Número/Identificador de Unidad</label>
                <input 
                  type="text" 
                  value={nuevaUnidad}
                  onChange={(e) => setNuevaUnidad(e.target.value)}
                  placeholder="Ej. Apto 1A" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Nombre del Propietario (Opcional)</label>
                <input 
                  type="text" 
                  value={nuevoPropietario}
                  onChange={(e) => setNuevoPropietario(e.target.value)}
                  placeholder="Ej. María Gómez" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Cédula / RIF (Opcional)</label>
                <input 
                  type="text" 
                  value={nuevaCedula}
                  onChange={(e) => setNuevaCedula(e.target.value)}
                  placeholder="Ej. V-12345678" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono (Opcional)</label>
                <input 
                  type="text" 
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                  placeholder="Ej. 0414-1234567" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Correo Electrónico (Opcional)</label>
                <input 
                  type="email" 
                  value={nuevoCorreo}
                  onChange={(e) => setNuevoCorreo(e.target.value)}
                  placeholder="Ej. correo@ejemplo.com" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Ficha Catastral (Opcional)</label>
                <input 
                  type="text" 
                  value={nuevaFicha}
                  onChange={(e) => setNuevaFicha(e.target.value)}
                  placeholder="Ficha catastral" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-end">
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 h-[38px]">
                  <Plus size={16} /> Añadir
                </button>
              </div>
            </div>
          </form>

          {/* List */}
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-700">Unidades Registradas ({unidades.length})</h3>
                {busqueda && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                    Filtrados: {unidades.filter(u => {
                      const q = busqueda.toLowerCase();
                      return (
                        (u.numero_unidad || '').toLowerCase().includes(q) ||
                        (u.codigo_ch || '').toLowerCase().includes(q) ||
                        (u.propietario || '').toLowerCase().includes(q) ||
                        (u.cedula_rif || '').toLowerCase().includes(q) ||
                        (u.actividad || '').toLowerCase().includes(q)
                      );
                    }).length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar local (A-23), RIF, tienda..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-xs w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            {loading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Cargando unidades...</div>
            ) : unidades.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                <p className="text-slate-500 text-sm">No hay unidades registradas en este condominio.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">N° Local / Unidad</th>
                      <th className="px-4 py-3">Propietario / Cédula</th>
                      <th className="px-4 py-3">Contacto</th>
                      <th className="px-4 py-3">Aseo Urbano</th>
                      <th className="px-4 py-3">IVA (16% / Exento)</th>
                      <th className="px-4 py-3">Multa (Oficina)</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Nietos</th>
                      <th className="px-4 py-3">Ficha</th>
                      <th className="px-4 py-3">Ocupación</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unidades.filter(u => {
                      if (!busqueda) return true;
                      const q = busqueda.toLowerCase();
                      return (
                        (u.numero_unidad || '').toLowerCase().includes(q) ||
                        (u.codigo_ch || '').toLowerCase().includes(q) ||
                        (u.propietario || '').toLowerCase().includes(q) ||
                        (u.cedula_rif || '').toLowerCase().includes(q) ||
                        (u.actividad || '').toLowerCase().includes(q)
                      );
                    }).map((u) => {
                      const isUnitSolvent = !hasCondominioDebt; // Real debt check — manual estado cannot override
                      return (
                      <React.Fragment key={u.id}>
                      <tr className="hover:bg-slate-50/50">
                        {editingId === u.id ? (
                          <>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs font-bold">{u.codigo_ch}</span>
                            </td>
                            <td className="px-4 py-2">
                              <input 
                                type="text" 
                                placeholder="Dirección (ej. LOCAL A-23)"
                                value={editForm.direccion} 
                                onChange={(e) => setEditForm({...editForm, direccion: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 min-w-[140px]"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input 
                                type="text" 
                                placeholder="Nombre / Razón social"
                                value={editForm.propietario} 
                                onChange={(e) => setEditForm({...editForm, propietario: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 mb-1 min-w-[120px]"
                              />
                              <input 
                                type="text" 
                                placeholder="Cédula/RIF"
                                value={editForm.cedula_rif} 
                                onChange={(e) => setEditForm({...editForm, cedula_rif: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 min-w-[100px]"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input 
                                type="text" 
                                placeholder="Teléfono"
                                value={editForm.telefono} 
                                onChange={(e) => setEditForm({...editForm, telefono: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 mb-1 min-w-[100px]"
                              />
                              <input 
                                type="text" 
                                placeholder="Correo"
                                value={editForm.correo} 
                                onChange={(e) => setEditForm({...editForm, correo: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 min-w-[100px]"
                              />
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2">
                              <select 
                                value={editForm.tipo}
                                onChange={(e) => setEditForm({...editForm, tipo: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 min-w-[110px]"
                              >
                                <option value="COMERCIAL">COMERCIAL</option>
                                <option value="RESIDENCIAL">RESIDENCIAL</option>
                              </select>
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <button onClick={() => guardarEdicion(u.id)} disabled={guardando} title="Guardar" className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors mr-1 disabled:opacity-50">
                                <Save size={16} />
                              </button>
                              <button onClick={() => setEditingId(null)} title="Cancelar" className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                <XCircle size={16} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono text-xs font-bold" title={`ID BD: ${u.id}`}>
                                {u.codigo_ch || (() => {
                                  // Generar codigo CH temporal si no tiene codigo_ch guardado
                                  const numCondo = condominioCodigoPadre
                                    ? (parseInt(condominioCodigoPadre.replace('C-','').replace(/^0+/,''),10) || condominioId)
                                    : condominioId;
                                  const idx = unidades.findIndex(x => x.id === u.id) + 1;
                                  return `CH-${numCondo}${String(idx).padStart(4,'0')}`;
                                })()}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">{u.numero_unidad}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-700">{u.propietario}</div>
                              {u.cedula_rif && <div className="text-[10px] text-slate-500">C.I/RIF: {u.cedula_rif}</div>}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              <div className="font-medium text-slate-700">{formatPhoneNumber(u.telefono) || 'Sin Telf.'}</div>
                              <div className="text-[11px] text-slate-400">{!isFictitiousEmail(u.correo) ? u.correo : 'Sin Correo'}</div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100" title="Aseo urbano facturado centralizado al Condominio Padre">
                                Centralizado
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {u.tipo === 'COMERCIAL' || (!condominioNombre?.toLowerCase().includes('resid') && !condominioIdentidad?.toLowerCase().includes('resid')) ? (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                  16% IVA
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  Exento
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {parseFloat(u.multa_bs || '0') > 0 ? (
                                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded whitespace-nowrap shadow-2xs">
                                  Bs. {parseFloat(u.multa_bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 font-mono">Bs. 0,00</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-1 text-[10px] font-bold uppercase rounded ${u.tipo === 'CONDOMINIO' ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                                {u.tipo || 'INDEPENDIENTE'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {u.actividad_economica_id && u.actividad_economica_id !== '0' ? (
                                <div className="flex flex-col gap-1">
                                  {u.actividad_economica_id.split(',').map((actId: string) => (
                                    <span key={actId} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase rounded border border-emerald-200 shadow-sm whitespace-nowrap" title={`Actividad ID: ${actId}`}>
                                      <Building2 size={10} />
                                      {/* @ts-ignore */}
                                      {economicActivitiesBase[actId] || 'Nieto Desconocido'}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{u.ficha_catastral || 'N/A'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                                u.ocupacion === 'Ocupada' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {u.ocupacion}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                isUnitSolvent ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                              }`} title={!hasCondominioDebt ? "Automático: Condominio Solvente" : "Manual"}>
                                {isUnitSolvent ? 'Solvente' : 'Con Deuda'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button 
                                onClick={() => emitirSolvencia(u)} 
                                className={`p-1.5 rounded-lg transition-colors mr-1 ${isUnitSolvent ? 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50' : 'text-slate-300 cursor-not-allowed'}`}
                                title={isUnitSolvent ? "Emitir Solvencia PDF" : "La unidad presenta deuda"}
                              >
                                <FileText size={16} />
                              </button>
                              {parseFloat(u.multa_bs || '0') > 0 && (
                                <a
                                  href={`/admin/caja?search=${encodeURIComponent(u.codigo_ch || u.cedula_rif || '')}`}
                                  className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors mr-1 inline-flex items-center"
                                  title={`Cobrar Multa de esta Oficina en Caja (Bs. ${parseFloat(u.multa_bs).toFixed(2)})`}
                                >
                                  <CreditCard size={16} />
                                </a>
                              )}
                              <button
                                onClick={() => { setShowEstado(showEstado === u.id ? null : u.id); setShowCredencial(null); }}
                                className={`p-1.5 rounded-lg transition-colors mr-1 ${showEstado === u.id ? 'bg-orange-100 text-orange-700' : 'text-orange-500 hover:bg-orange-50'}`}
                                title="Estado de Cuenta"
                              >
                                <Receipt size={16} />
                              </button>
                              <button onClick={() => iniciarEdicion(u)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors mr-1">
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => { setShowCredencial(showCredencial === u.id ? null : u.id); setShowEstado(null); setNuevaClave(''); setEditingClave(null); }}
                                className={`p-1.5 rounded-lg transition-colors mr-1 ${showCredencial === u.id ? 'bg-violet-100 text-violet-700' : 'text-violet-500 hover:bg-violet-50'}`}
                                title="Ver/Gestionar Credenciales de Acceso"
                              >
                                <Key size={16} />
                              </button>
                              <button
                                onClick={() => toggleActivoUnidad(u)}
                                className={`p-1.5 rounded-lg transition-colors mr-1 ${u.activo === false ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-500 hover:bg-amber-50'}`}
                                title={u.activo === false ? 'Reactivar Local' : 'Desactivar Local'}
                              >
                                <Power size={16} />
                              </button>
                              <button onClick={() => setStatusModal({ type: 'Eliminar', u })} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                      {/* Panel Credenciales */}
                      {showCredencial === u.id && (
                        <tr className="bg-violet-50 border-b border-violet-100">
                          <td colSpan={13} className="px-4 py-4">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2">
                                <Key size={14} className="text-violet-600" />
                                <span className="text-xs font-bold text-violet-700 uppercase">Credenciales de Acceso al Portal</span>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 font-medium">Usuario:</span>
                                  <code className="text-xs font-mono bg-white border border-violet-200 px-2 py-1 rounded text-violet-800 font-bold">
                                    {u.cedula_rif || 'Sin RIF'}
                                  </code>
                                  <button onClick={() => navigator.clipboard.writeText(u.cedula_rif || '')} className="text-violet-500 hover:text-violet-700" title="Copiar usuario">
                                    <Copy size={13} />
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 font-medium">Contraseña:</span>
                                  {u.clave_acceso ? (
                                    <>
                                      <code className="text-xs font-mono bg-white border border-violet-200 px-2 py-1 rounded text-violet-800 font-bold">
                                        {showPassword.has(u.id) ? u.clave_acceso : '••••••••'}
                                      </code>
                                      <button onClick={() => setShowPassword(prev => { const s = new Set(prev); s.has(u.id) ? s.delete(u.id) : s.add(u.id); return s; })} className="text-violet-500 hover:text-violet-700">
                                        {showPassword.has(u.id) ? <EyeOff size={13} /> : <Eye size={13} />}
                                      </button>
                                      <button onClick={() => navigator.clipboard.writeText(u.clave_acceso || '')} className="text-violet-500 hover:text-violet-700" title="Copiar">
                                        <Copy size={13} />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center gap-1">
                                      <AlertTriangle size={11} /> Sin clave configurada
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Formulario para asignar/cambiar clave */}
                              {editingClave === u.id ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="text"
                                    value={nuevaClave}
                                    onChange={e => setNuevaClave(e.target.value)}
                                    placeholder="Nueva contraseña para el propietario"
                                    className="text-sm border border-violet-300 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-violet-400 w-72"
                                  />
                                  <button
                                    onClick={async () => {
                                      if (!nuevaClave.trim()) return alert('Ingrese una contraseña');
                                      setSavingClave(true);
                                      const { error } = await supabase.from('inmuebles').update({ clave_portal: nuevaClave.trim() }).eq('id', u.id);
                                      if (!error) {
                                        setUnidades(unidades.map(x => x.id === u.id ? { ...x, clave_acceso: nuevaClave.trim() } : x));
                                        setEditingClave(null);
                                        setNuevaClave('');
                                        alert('Clave guardada exitosamente.');
                                      } else {
                                        alert('Error guardando clave: ' + error.message);
                                      }
                                      setSavingClave(false);
                                    }}
                                    disabled={savingClave}
                                    className="px-3 py-1.5 bg-violet-600 text-white rounded text-xs font-semibold hover:bg-violet-700 disabled:opacity-50"
                                  >
                                    {savingClave ? 'Guardando...' : 'Guardar Clave'}
                                  </button>
                                  <button onClick={() => { setEditingClave(null); setNuevaClave(''); }} className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded text-xs">
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingClave(u.id); setNuevaClave(u.clave_acceso || ''); }}
                                  className="text-xs text-violet-600 hover:text-violet-800 underline self-start"
                                >
                                  {u.clave_acceso ? '🔑 Cambiar contraseña' : '🔑 Asignar contraseña'}
                                </button>
                              )}
                              <p className="text-[10px] text-slate-400">El propietario puede acceder al portal con el Usuario y Contraseña asignados.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* Panel Estado de Cuenta */}
                      {showEstado === u.id && (
                        <tr className="bg-orange-50/40 border-b border-orange-100">
                          <td colSpan={13} className="px-4 py-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Receipt size={14} className="text-orange-600" />
                                <span className="text-xs font-bold text-orange-700 uppercase">Estado de Cuenta — Unidad: {u.numero_unidad}</span>
                                <span className="text-[10px] text-slate-500">({u.propietario || 'Sin propietario'})</span>
                              </div>
                              <button
                                onClick={async () => {
                                  try {
                                    const factCondominio = recibosDeUnidad(u);
                                    if (factCondominio.length === 0) {
                                      alert("No hay recibos registradas para emitir estado de cuenta.");
                                      return;
                                    }
                                    const { exportToExcelWithLogos } = await import('@/lib/excelExport');
                                    const data = factCondominio.map((f: any) => ({
                                      "Referencia": f.referencia,
                                      "N° Local": u.numero_unidad,
                                      "Propietario": u.propietario || 'Sin propietario',
                                      "IVA Aplicable": u.tipo === 'COMERCIAL' ? '16%' : 'Exento (0%)',
                                      "Multa (Bs)": parseFloat(u.multa_bs || '0').toFixed(2),
                                      "Emisión": f.emision,
                                      "Vencimiento": f.vencimiento,
                                      "Monto (Bs)": parseFloat(f.monto || '0').toFixed(2),
                                      "Estado": f.estado
                                    }));
                                    await exportToExcelWithLogos(data, `EstadoCuenta_Unidad_${u.numero_unidad}.xlsx`, "Estado_de_Cuenta");
                                  } catch (e) {
                                    alert("Error exportando a Excel");
                                  }
                                }}
                                className="px-2 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded text-xs font-bold flex items-center gap-1 transition-colors"
                              >
                                <Download size={12} /> Exportar Excel
                              </button>
                            </div>
                            {(() => {
                              const factCondominio = recibosDeUnidad(u);
                              const pendientes = factCondominio.filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Abonado');
                              const pagadas = factCondominio.filter((f: any) => f.estado === 'Pagado' || f.estado === 'Pagado Parcial');
                              const totalDeuda = pendientes.reduce((a: number, f: any) => a + parseFloat(f.monto || '0'), 0);
                              const totalPagado = pagadas.reduce((a: number, f: any) => a + parseFloat(f.monto || '0'), 0);
                              return (
                                <div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                    <div className="bg-white border border-slate-200 rounded p-2 text-center">
                                      <p className="text-[10px] text-slate-500 font-bold uppercase">N° Local / Unidad</p>
                                      <p className="text-sm font-black text-slate-800">{u.numero_unidad}</p>
                                    </div>
                                    <div className="bg-white border border-rose-100 rounded p-2 text-center">
                                      <p className="text-[10px] text-rose-600 font-bold uppercase">Multa Local</p>
                                      <p className="text-sm font-black text-rose-600">Bs. {parseFloat(u.multa_bs || '0').toLocaleString('es-VE', {minimumFractionDigits:2})}</p>
                                    </div>
                                    <div className="bg-white border border-blue-100 rounded p-2 text-center">
                                      <p className="text-[10px] text-blue-600 font-bold uppercase">IVA Aplicable</p>
                                      <p className="text-sm font-black text-blue-700">{u.tipo === 'COMERCIAL' ? '16%' : 'Exento (0%)'}</p>
                                    </div>
                                    <div className="bg-white border border-orange-100 rounded p-2 text-center">
                                      <p className="text-[10px] text-orange-600 font-bold uppercase">Deuda Unidad</p>
                                      <p className="text-sm font-black text-red-600">Bs. {totalDeuda.toLocaleString('es-VE', {minimumFractionDigits:2})}</p>
                                    </div>
                                  </div>
                                  {factCondominio.length > 0 ? (
                                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                      <table className="w-full text-xs">
                                        <thead className="bg-orange-100 text-orange-800 uppercase">
                                          <tr>
                                            <th className="px-3 py-1.5 text-left">Referencia</th>
                                            <th className="px-3 py-1.5 text-left">Emisión</th>
                                            <th className="px-3 py-1.5 text-left">Vencimiento</th>
                                            <th className="px-3 py-1.5 text-right">Monto (Bs)</th>
                                            <th className="px-3 py-1.5 text-center">Estado</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {factCondominio.slice(0,20).map((f: any, i: number) => (
                                            <tr key={i} className="border-b border-orange-50 hover:bg-white">
                                              <td className="px-3 py-1.5 font-mono">{f.referencia}</td>
                                              <td className="px-3 py-1.5">{f.emision}</td>
                                              <td className="px-3 py-1.5">{f.vencimiento}</td>
                                              <td className="px-3 py-1.5 text-right font-bold">{parseFloat(f.monto||'0').toLocaleString('es-VE', {minimumFractionDigits:2})}</td>
                                              <td className="px-3 py-1.5 text-center">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                  f.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-700' :
                                                  f.estado === 'Pendiente' ? 'bg-red-100 text-red-700' :
                                                  'bg-slate-100 text-slate-600'
                                                }`}>{f.estado}</span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 text-center py-4">No hay recibos registrados para esta unidad.</p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Modal (Eliminar/Desactivar) */}
      {statusModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${statusModal.type === 'Eliminar' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
              <h2 className={`text-lg font-bold ${statusModal.type === 'Eliminar' ? 'text-red-800' : 'text-amber-800'}`}>
                {statusModal.type} Unidad
              </h2>
              <button onClick={() => setStatusModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Está a punto de <strong>{statusModal.type.toLowerCase()}</strong> la unidad <span className="font-bold">{statusModal.u.numero_unidad}</span>. 
                Por favor, indique el motivo detallado de esta acción. <span className="text-red-600 font-bold">* Obligatorio</span>
              </p>
              
              <textarea
                value={statusNota}
                onChange={e => setStatusNota(e.target.value)}
                placeholder="Ej. Error de registro, fusión de locales..."
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

    </>
  );

  if (isInline) {
    return modalContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {modalContent}
    </div>
  );
}


