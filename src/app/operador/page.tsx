'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { MapPin, TrendingUp, Clock, PlusCircle, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import * as XLSX from 'xlsx';
import { exportToExcelWithLogos } from '@/lib/excelExport';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function OperadorDashboard() {
  const router = useRouter();
  const [operador, setOperador] = useState<string | null>(null);
  const [censosRealizados, setCensosRealizados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Por favor, selecciona un archivo Excel válido (.xlsx o .xls)');
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `${operador}_${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('archivos_externos')
        .upload(fileName, file);

      if (error) {
        throw error;
      }

      alert('¡Archivo subido exitosamente a la nube!');
    } catch (err: any) {
      console.error('Error uploading file:', err);
      alert('Error al subir el archivo. Verifica que el bucket "archivos_externos" exista y sea público.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    const storedOp = localStorage.getItem('operador_censo_auth');
    if (storedOp) {
      setOperador(storedOp);
      fetchStats(storedOp);
    }
  }, []);

  const fetchStats = async (opName: string) => {
    try {
      // Count all historical censuses sent by this operator from audit_logs
      const { count, error } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'NUEVO_CENSO')
        .eq('user_id', opName);
        
      if (!error && count !== null) {
        setCensosRealizados(count);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async (exportAll: boolean = false) => {
    if (!operador) return;
    setIsExporting(true);
    try {
      let query = supabase
        .from('pre_registros')
        .select('*')
        .order('created_at', { ascending: false });

      if (exportAll) {
        query = query.ilike('origen', 'Censo - %');
      } else {
        query = query.ilike('origen', `%Censo - ${operador}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No hay datos de censos registrados por usted para exportar.');
        setIsExporting(false);
        return;
      }

      // Format data for excel
      const excelData: any[] = [];

      data.forEach((item: any) => {
        let parentPatente = '';
        let parentCatastro = '';
        let notasStr = item.nota || '';

        // Extraer Patente del padre
        const patenteMatch = notasStr.match(/Patente:\s*([^|]+)/);
        if (patenteMatch) {
          parentPatente = patenteMatch[1].trim();
          notasStr = notasStr.replace(patenteMatch[0], '').trim();
        }

        // Extraer Catastro del padre
        const catastroMatch = notasStr.match(/Catastro:\s*([^|]+)/);
        if (catastroMatch) {
          parentCatastro = catastroMatch[1].trim();
          notasStr = notasStr.replace(catastroMatch[0], '').trim();
        }

        // Limpiar " | " sueltos que puedan haber quedado
        notasStr = notasStr.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s*\|\s*\|\s*/g, ' | ').trim();

        if (item.is_condominio && item.locales && item.locales.length > 0) {
          item.locales.forEach((local: any) => {
            excelData.push({
              'Fecha de Registro': new Date(item.created_at).toLocaleString(),
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

      const ws = exportToExcelWithLogos(excelData, `Operador_${new Date().getTime()}.xlsx`, 'Operador');
    } catch (err) {
      console.error(err);
      alert('Hubo un error al exportar los datos.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!operador) return null; // handled by layout

  return (
    <div className="p-4 space-y-6">
      
      {/* Welcome Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mt-2">
        <h2 className="text-xl font-bold text-slate-800">¡Hola, {operador}!</h2>
        <p className="text-sm text-slate-500 mt-1">¿Listo para comenzar la jornada de hoy?</p>
        
        <button 
          onClick={() => router.push('/operador/censo')}
          className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-orange-500/25 transition-transform active:scale-95"
        >
          <PlusCircle className="w-6 h-6" /> 
          <span className="text-lg">Nuevo Censo</span>
        </button>

        <button 
          onClick={() => handleExportExcel(false)}
          disabled={isExporting}
          className="w-full mt-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow shadow-emerald-500/25 transition-transform active:scale-95 disabled:opacity-50"
        >
          {isExporting ? <Clock className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
          <span>{isExporting ? 'Exportando...' : 'Descargar Mi Data (Excel)'}</span>
        </button>

        <button 
          onClick={() => handleExportExcel(true)}
          disabled={isExporting}
          className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow shadow-blue-500/25 transition-transform active:scale-95 disabled:opacity-50"
        >
          {isExporting ? <Clock className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
          <span>{isExporting ? 'Exportando...' : 'Descargar Data Unificada (Todos)'}</span>
        </button>
      </div>

      {(operador.toUpperCase() === 'CATASTRO' || operador.toUpperCase() === 'HACIENDA') && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm mt-2">
          <h2 className="text-xl font-bold text-indigo-900">Base de Datos Externa</h2>
          <p className="text-sm text-indigo-700/80 mt-1">Sube el archivo Excel con los datos de tu departamento.</p>
          
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-transform active:scale-95 disabled:opacity-50"
          >
            {isUploading ? <Clock className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            <span>{isUploading ? 'Subiendo Archivo...' : 'Seleccionar y Subir Excel'}</span>
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="bg-orange-100 p-3 rounded-full mb-3 text-orange-600">
            <TrendingUp size={24} />
          </div>
          <span className="text-3xl font-black text-slate-800">
            {loading ? '...' : censosRealizados}
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">Censos Enviados</span>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center opacity-70">
          <div className="bg-blue-100 p-3 rounded-full mb-3 text-blue-600">
            <Clock size={24} />
          </div>
          <span className="text-3xl font-black text-slate-800">0</span>
          <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">Horas en Ruta</span>
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex gap-4 mt-8 items-start">
        <MapPin className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-orange-900 text-sm">Recordatorio</h3>
          <p className="text-xs text-orange-800/80 mt-1">
            Asegúrate de colocar correctamente el pin en el mapa y tomar nota del tipo de actividad comercial en cada local.
          </p>
        </div>
      </div>
      
    </div>
  );
}
