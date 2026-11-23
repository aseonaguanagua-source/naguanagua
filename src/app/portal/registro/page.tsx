'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, UserPlus, CheckCircle, ArrowLeft, Upload, FileText, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function RegistroPublico() {
  const router = useRouter();
  const { ordenanzasConfig: ordenanzaData } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // File uploads
  const [archivos, setArchivos] = useState<{
    rif: File | null;
    cedula: File | null;
    patente: File | null;
  }>({ rif: null, cedula: null, patente: null });

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadFileToStorage = async (file: File, tipo: string, ident: string): Promise<string> => {
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const cleanId = ident.replace(/[^a-zA-Z0-9]/g, '_');
      const path = `expedientes/${cleanId}/${tipo}_${Date.now()}.${ext}`;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', 'documentos');
      fd.append('path', path);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok && j.success && j.publicUrl) return j.publicUrl;
    } catch (_) {}
    return toBase64(file);
  };

  const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...ordenanzaData.actividadesIndustriales];

  const [formData, setFormData] = useState({
    identidadPrefijo: 'V',
    identidadNumero: '',
    Contribuyente: '',
    NombreComercial: '',
    Direccion: '',
    DireccionExacta: '',
    telefonoPrefijo: '0414',
    telefonoNumero: '',
    correoNombre: '',
    correoDominio: '@gmail.com',
    Clasificacion: 'Residencial',
    TipoResidencia: ordenanzaData.tiposResidenciales[0].label,
    ActividadComercial: todasLasActividades[0].label,
  });

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const finalIdentidad = `${formData.identidadPrefijo}-${formData.identidadNumero}`;
      const finalTelefono = `${formData.telefonoPrefijo}${formData.telefonoNumero}`;
      const finalCorreo = `${formData.correoNombre}${formData.correoDominio}`;
      const finalDireccion = formData.DireccionExacta ? `${formData.Direccion} | Exacta: ${formData.DireccionExacta}` : formData.Direccion;
      const finalActividad = formData.Clasificacion === 'Residencial' ? formData.TipoResidencia : formData.ActividadComercial;

      const finalContribuyente = formData.NombreComercial.trim() 
        ? `${formData.Contribuyente} | Comercial: ${formData.NombreComercial}` 
        : formData.Contribuyente;

      // Validar que todos los documentos obligatorios hayan sido cargados
      const etiquetaTercerDoc =
        formData.Clasificacion === 'Residencial'
          ? 'Ficha Catastral / Documento de Propiedad'
          : 'Patente Comercial / Registro Mercantil';
      const faltantes: string[] = [];
      if (!archivos.rif) faltantes.push('RIF');
      if (!archivos.cedula) faltantes.push('Cédula de Identidad');
      if (!archivos.patente) faltantes.push(etiquetaTercerDoc);
      if (faltantes.length > 0) {
        throw new Error(
          `Es obligatorio adjuntar todos los documentos requeridos antes de enviar la solicitud. Faltan: ${faltantes.join(', ')}.`
        );
      }

      const dataToSave: any = {
        identidad: finalIdentidad,
        contribuyente: finalContribuyente,
        registro: finalTelefono,
        correo: finalCorreo,
        domicilio_fiscal: formData.Direccion,
        direccion_exacta: formData.DireccionExacta,
        direccion: finalDireccion,
        tipo: formData.Clasificacion,
        actividad: finalActividad,
        codigo: 'Por Asignar',
        origen: 'Portal Web',
        registrado: new Date().toISOString()
      };

      // Subir documentos obligatorios al Storage (con respaldo base64)
      dataToSave.rif_doc = await uploadFileToStorage(archivos.rif!, 'rif', finalIdentidad);
      dataToSave.cedula_doc = await uploadFileToStorage(archivos.cedula!, 'cedula', finalIdentidad);
      const tercerDocUrl = await uploadFileToStorage(
        archivos.patente!,
        formData.Clasificacion === 'Residencial' ? 'ficha' : 'patente',
        finalIdentidad
      );
      if (formData.Clasificacion === 'Residencial') {
        dataToSave.ficha_doc = tercerDocUrl;
        dataToSave.patente_doc = tercerDocUrl;
      } else {
        dataToSave.patente_doc = tercerDocUrl;
        dataToSave.registro_doc = tercerDocUrl;
      }

      const res = await fetch('/api/admin/pre-registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      });
      const resJson = await res.json();
      if (!res.ok || !resJson.ok) throw new Error(resJson.error || 'Error guardando la solicitud de registro');

      setSuccess(true);
      setTimeout(() => {
        router.push('/portal');
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocurrió un error al registrar. Intente nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-slate-200">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">¡Registro Exitoso!</h2>
          <p className="text-slate-600 mb-6">
            Su solicitud ha sido enviada y está siendo revisada por el departamento de Recaudación.
            Una vez aprobada, podrá ingresar con su número de documento.
          </p>
          <Link href="/portal" className="bg-emerald-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-emerald-700 transition-colors inline-block">
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 pb-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/portal" className="bg-white p-2 rounded-full shadow-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-emerald-600" /> Registro de Contribuyente
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div className="bg-[#0f172a] p-6 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 "></div>
            <div className="relative z-10 flex justify-center mb-2">
              <div className="bg-white/10 p-3 rounded-full backdrop-blur-sm">
                <Building2 className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <h2 className="relative z-10 text-xl font-bold text-white tracking-wider">
              <span className="text-emerald-500">GLOBAL</span> GREEN
            </h2>
            <p className="relative z-10 text-slate-400 mt-1 text-xs uppercase tracking-widest font-semibold">
              IAMEC · Aseo Urbano Naguanagua
            </p>
          </div>

          <div className="p-8 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium">
                {error}
              </div>
            )}

            {/* Identidad y Nombre */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Documento de Identidad (RIF / C.I)</label>
                <div className="flex gap-2">
                  <select name="identidadPrefijo" value={formData.identidadPrefijo} onChange={handleChange} className="w-1/4 border-2 border-slate-200 rounded-lg px-2 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 appearance-none text-center">
                    <option value="J">J</option>
                    <option value="V">V</option>
                    <option value="G">G</option>
                    <option value="E">E</option>
                    <option value="P">P</option>
                  </select>
                  <input type="text" name="identidadNumero" required placeholder="Ej: 123456789" value={formData.identidadNumero} onChange={(e) => setFormData({ ...formData, identidadNumero: e.target.value.replace(/\D/g, '') })} maxLength={9} className="w-3/4 border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nombre del Contribuyente o Razón Social</label>
                <input type="text" name="Contribuyente" required placeholder="Ej: Juan Perez / Empresa C.A." value={formData.Contribuyente} onChange={handleChange} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
              </div>
            </div>

            {/* Nombre Comercial */}
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nombre Comercial (Si aplica)</label>
                <input type="text" name="NombreComercial" placeholder="Ej: Abasto La Bendición" value={formData.NombreComercial} onChange={handleChange} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
              </div>
            </div>

            {/* Direccion */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Sector / Urbanización</label>
                <input type="text" name="Direccion" required placeholder="Ej: Sector Las Lapas" value={formData.Direccion} onChange={handleChange} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Dirección Exacta (Casa, Local, Calle)</label>
                <input type="text" name="DireccionExacta" required placeholder="Ej: Calle principal, Local 4" value={formData.DireccionExacta} onChange={handleChange} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
              </div>
            </div>

            {/* Contacto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Teléfono Celular</label>
                <div className="flex gap-2">
                  <select name="telefonoPrefijo" value={formData.telefonoPrefijo} onChange={handleChange} className="w-1/3 border-2 border-slate-200 rounded-lg px-2 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 appearance-none text-center">
                    <option value="0414">0414</option>
                    <option value="0424">0424</option>
                    <option value="0412">0412</option>
                    <option value="0416">0416</option>
                    <option value="0426">0426</option>
                  </select>
                  <input type="text" name="telefonoNumero" required placeholder="1234567" value={formData.telefonoNumero} onChange={(e) => setFormData({ ...formData, telefonoNumero: e.target.value.replace(/\D/g, '') })} maxLength={7} className="w-2/3 border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Correo Electrónico</label>
                <div className="flex items-center gap-2">
                  <input type="text" name="correoNombre" required placeholder="usuario" value={formData.correoNombre} onChange={handleChange} className="flex-1 border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500" />
                  <span className="text-slate-400 font-bold">@</span>
                  <select name="correoDominio" value={formData.correoDominio} onChange={handleChange} className="flex-1 border-2 border-slate-200 rounded-lg px-2 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 appearance-none text-center">
                    <option value="@gmail.com">gmail.com</option>
                    <option value="@hotmail.com">hotmail.com</option>
                    <option value="@yahoo.com">yahoo.com</option>
                    <option value="@outlook.com">outlook.com</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Clasificacion */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Clasificación Principal</label>
                <select name="Clasificacion" value={formData.Clasificacion} onChange={(e) => {
                  const val = e.target.value;
                  setFormData({
                    ...formData,
                    Clasificacion: val,
                    ActividadComercial: val === 'Industrial' ? ordenanzaData.actividadesIndustriales[0].label : todasLasActividades[0].label
                  });
                }} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 appearance-none">
                  {ordenanzaData.clasificaciones.filter(c => c !== 'Mixto').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                {formData.Clasificacion === 'Residencial' ? (
                  <>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Tipo de Residencia</label>
                    <select name="TipoResidencia" value={formData.TipoResidencia} onChange={handleChange} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 appearance-none">
                      {ordenanzaData.tiposResidenciales.map(t => <option key={t.label} value={t.label}>{t.label.replace(/\s*\(Zona\s+[A-D]\)/gi, '')}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Actividad Económica</label>
                    <select name="ActividadComercial" value={formData.ActividadComercial} onChange={handleChange} className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 bg-slate-50 appearance-none">
                      {formData.Clasificacion === 'Industrial' 
                        ? ordenanzaData.actividadesIndustriales.map(a => <option key={a.label} value={a.label}>{a.label}</option>)
                        : todasLasActividades.map(a => <option key={a.label} value={a.label}>{a.label}</option>)
                      }
                    </select>
                  </>
                )}
              </div>
            </div>

            {/* Documentos Obligatorios */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <label className="block text-xs font-bold text-slate-800 uppercase">
                  Documentos Requeridos del Expediente <span className="text-red-600">* (Obligatorios)</span>
                </label>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  {[archivos.rif, archivos.cedula, archivos.patente].filter(Boolean).length} de 3 cargados
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  { key: 'rif', label: 'RIF Vigente (J-/V-) *', accept: '.pdf,.jpg,.png,.jpeg' },
                  { key: 'cedula', label: 'Cédula de Identidad *', accept: '.pdf,.jpg,.png,.jpeg' },
                  {
                    key: 'patente',
                    label:
                      formData.Clasificacion === 'Residencial'
                        ? 'Ficha Catastral / Doc. Propiedad *'
                        : 'Patente / Registro Mercantil *',
                    accept: '.pdf,.jpg,.png,.jpeg',
                  },
                ] as const).map(doc => (
                  <div key={doc.key}>
                    <label
                      htmlFor={`file-${doc.key}`}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors ${
                        archivos[doc.key]
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-rose-300 bg-rose-50/30 hover:border-emerald-400 hover:bg-emerald-50'
                      }`}
                    >
                      {archivos[doc.key] ? (
                        <>
                          <FileText className="w-6 h-6 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-700 text-center truncate w-full">{archivos[doc.key]!.name}</span>
                          <span className="text-[10px] text-emerald-600 font-bold">✓ Cargado ({(archivos[doc.key]!.size / 1024).toFixed(0)} KB)</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-rose-500" />
                          <span className="text-xs font-bold text-slate-700 text-center">{doc.label}</span>
                          <span className="text-[10px] text-rose-600 font-semibold">Obligatorio · PDF, JPG o PNG</span>
                        </>
                      )}
                    </label>
                    <input
                      id={`file-${doc.key}`}
                      type="file"
                      accept={doc.accept}
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0] || null;
                        if (file && file.size > 5 * 1024 * 1024) {
                          alert('El archivo no puede superar 5 MB');
                          return;
                        }
                        setArchivos(prev => ({ ...prev, [doc.key]: file }));
                      }}
                    />
                    {archivos[doc.key] && (
                      <button
                        type="button"
                        onClick={() => setArchivos(prev => ({ ...prev, [doc.key]: null }))}
                        className="mt-1 text-[10px] text-red-500 hover:text-red-700 font-semibold w-full text-center cursor-pointer"
                      >Quitar archivo</button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-rose-700 font-semibold mt-2.5 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                Es obligatorio adjuntar los 3 documentos de respaldo (máx. 5 MB por archivo) para poder enviar su solicitud de registro.
              </p>
            </div>

            <div className="pt-6">
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 text-lg shadow-lg shadow-emerald-200">
                {isLoading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <>Enviar Solicitud de Registro</>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
